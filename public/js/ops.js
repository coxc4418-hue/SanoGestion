// SanoGestion — Operaciones de negocio (atómicas, funcionan sin conexión)
import { store } from './store.js';
import { session } from './auth.js';
import { round2, round4, nowISO, todayKey, dayKey, addDays, docNumber, PAY_METHODS } from './utils.js';

const by = () => session.user?.email || '';

/** Calcula el flujo de efectivo de una lista de pagos y el vuelto */
export function cashFlowOf(payments, changeUSD, changeCurrency, rate) {
  const f = { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 };
  for (const p of payments) {
    if (p.method === 'efectivo_usd') f.inUSD += p.amount;
    if (p.method === 'efectivo_bs') f.inBs += p.amount;
  }
  if (changeUSD > 0.004) {
    if (changeCurrency === 'BS') f.outBs += round2(changeUSD * rate);
    else f.outUSD += round2(changeUSD);
  }
  for (const k in f) f[k] = round2(f[k]);
  return f;
}

function shiftIncrements(flow, extra = {}) {
  const u = {};
  if (flow.inUSD) u.inUSD = store.inc(flow.inUSD);
  if (flow.inBs) u.inBs = store.inc(flow.inBs);
  if (flow.outUSD) u.outUSD = store.inc(flow.outUSD);
  if (flow.outBs) u.outBs = store.inc(flow.outBs);
  for (const [k, v] of Object.entries(extra)) if (v) u[k] = store.inc(round4(v));
  u.updatedAt = nowISO();
  return u;
}

function addMovements(b, shiftId, flow, { concept, category, refId, kind }) {
  const date = nowISO();
  const push = (dir, currency, amount, type) => {
    if (!(amount > 0.004)) return;
    b.set(store.newRef('cash_movements'), { shiftId, date, dayKey: dayKey(), type, direction: dir, currency, amount: round2(amount), concept, category, refId: refId || null, by: by() });
  };
  push('in', 'USD', flow.inUSD, kind);
  push('in', 'BS', flow.inBs, kind);
  push('out', 'USD', flow.outUSD, kind === 'sale' ? 'change' : kind);
  push('out', 'BS', flow.outBs, kind === 'sale' ? 'change' : kind);
}

/**
 * Registra una venta.
 * items: [{productId, name, presentation, multiplier, qty, price, cost, exempt, category}]
 * payments: [{method, amount, currency}] (amount en la moneda del método)
 */
export async function processSale({ items, discount = 0, customer = null, payments = [], changeCurrency = 'USD', note = '', type = 'sale', service = null, number = null, extraOut = null }) {
  const rate = store.rate;
  if (!(rate > 0)) throw new Error('Configura la tasa del día antes de vender.');
  if (!items.length) throw new Error('El carrito está vacío.');
  const shift = store.openShift;
  if (!shift) throw new Error('Debes abrir la caja antes de vender.');

  const lines = items.map((it) => ({
    productId: it.productId || null,
    name: it.name,
    presentation: it.presentation || 'Unidad',
    multiplier: Number(it.multiplier) || 1,
    qty: Number(it.qty) || 0,
    price: round4(it.price),
    cost: round4(it.cost || 0),
    total: round2((Number(it.qty) || 0) * (Number(it.price) || 0)),
    exempt: !!it.exempt,
    category: it.category || ''
  }));
  const subtotal = round2(lines.reduce((a, l) => a + l.total, 0));
  const disc = Math.min(round2(discount), subtotal);
  const total = round2(subtotal - disc);

  const pays = payments.filter((p) => p.amount > 0.004).map((p) => ({
    method: p.method,
    currency: p.currency || PAY_METHODS[p.method]?.cur || 'USD',
    amount: round2(p.amount),
    usd: round4((p.currency || PAY_METHODS[p.method]?.cur) === 'BS' ? p.amount / rate : p.amount)
  }));
  const paidUSD = round4(pays.reduce((a, p) => a + p.usd, 0));
  let changeUSD = 0, creditUSD = 0;
  if (paidUSD >= total - 0.005) changeUSD = round2(Math.max(0, paidUSD - total));
  else creditUSD = round2(total - paidUSD);
  if (creditUSD > 0 && !customer) throw new Error('Para dejar saldo a crédito (fiado) selecciona un cliente.');

  const flow = cashFlowOf(pays, changeUSD, changeCurrency, rate);
  if (extraOut) { flow.outUSD = round2(flow.outUSD + (extraOut.usd || 0)); flow.outBs = round2(flow.outBs + (extraOut.bs || 0)); }
  const b = store.batch();
  const saleRef = store.newRef('sales');
  const date = nowISO();
  const sale = {
    number: number || docNumber(type === 'service' ? 'SRV' : 'V'),
    type,
    date, dayKey: todayKey(),
    items: lines, subtotal, discount: disc, total,
    rate, totalBs: round2(total * rate),
    payments: pays, paidUSD, changeUSD, changeCurrency, creditUSD,
    method: pays.length === 0 ? 'credito' : (pays.length === 1 && creditUSD === 0 ? pays[0].method : 'mixto'),
    customerId: customer?.id || null,
    customerName: customer?.name || 'Mostrador',
    shiftId: shift.id,
    cashFlow: flow,
    note: note || '',
    status: 'completed',
    service: service ? { serviceId: service.serviceId, type: service.record?.type || '' } : null,
    by: by()
  };
  b.set(saleRef, sale);
  if (service?.serviceId) b.set(store.ref('services', service.serviceId), { ...service.record, saleId: saleRef.id, saleNumber: sale.number, status: 'completed' });

  // Inventario
  for (const l of lines) {
    if (!l.productId || !store.product(l.productId)) continue;
    const delta = round4(l.qty * l.multiplier);
    b.update(store.ref('products', l.productId), { stock: store.inc(-delta), lastSoldAt: date });
    b.set(store.newRef('inventory_logs'), {
      productId: l.productId, productName: l.name, date, type: 'venta', qty: -delta,
      reason: `Venta ${sale.number}`, by: by()
    });
  }

  // Caja
  addMovements(b, shift.id, flow, { concept: `${type === 'service' ? 'Servicio' : 'Venta'} ${sale.number}`, category: type === 'service' ? 'Servicios' : 'Ventas', refId: saleRef.id, kind: 'sale' });
  const byMethod = {};
  pays.forEach((p) => { byMethod[`byMethod.${p.method}`] = (byMethod[`byMethod.${p.method}`] || 0) + p.usd; });
  if (creditUSD) byMethod['byMethod.credito'] = creditUSD;
  b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { salesCount: 1, salesTotal: total, ...byMethod }));

  // Fiado
  if (creditUSD > 0) {
    const due = dayKey(addDays(new Date(), Number(store.settings.creditDays) || 15));
    b.set(store.newRef('debts'), {
      customerId: customer.id, customerName: customer.name, saleId: saleRef.id, saleNumber: sale.number,
      date, dayKey: todayKey(), dueDate: due, amount: creditUSD, balance: creditUSD, status: 'open',
      notes: note || '', by: by()
    });
    b.update(store.ref('customers', customer.id), { balance: store.inc(creditUSD), lastPurchaseAt: date });
  } else if (customer && store.customer(customer.id)) {
    b.update(store.ref('customers', customer.id), { lastPurchaseAt: date });
  }

  await store.commit(b);
  return { id: saleRef.id, ...sale };
}

/** Anula una venta: devuelve stock, revierte caja (en el turno abierto) y el fiado pendiente */
export async function voidSale(sale, reason = '') {
  if (sale.status === 'voided') throw new Error('La venta ya está anulada.');
  const b = store.batch();
  const date = nowISO();
  b.update(store.ref('sales', sale.id), { status: 'voided', voidedAt: date, voidReason: reason || '', voidedBy: by() });

  for (const l of sale.items || []) {
    if (!l.productId || !store.product(l.productId)) continue;
    const delta = round4((l.qty || 0) * (l.multiplier || 1));
    b.update(store.ref('products', l.productId), { stock: store.inc(delta) });
    b.set(store.newRef('inventory_logs'), { productId: l.productId, productName: l.name, date, type: 'anulacion', qty: delta, reason: `Anulación ${sale.number}`, by: by() });
  }

  const shift = store.openShift;
  const f = sale.cashFlow || { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 };
  const reverse = { inUSD: f.outUSD || 0, inBs: f.outBs || 0, outUSD: f.inUSD || 0, outBs: f.inBs || 0 };
  let cashReverted = false;
  if (shift && (reverse.inUSD || reverse.inBs || reverse.outUSD || reverse.outBs)) {
    addMovements(b, shift.id, reverse, { concept: `Anulación ${sale.number}`, category: 'Anulaciones', refId: sale.id, kind: 'void' });
    const extra = {};
    if (sale.shiftId === shift.id) { extra.salesCount = -1; extra.salesTotal = -(sale.total || 0); }
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(reverse, extra));
    cashReverted = true;
  }

  let debtNote = '';
  if ((sale.creditUSD || 0) > 0) {
    const debts = await store.listEq('debts', 'saleId', sale.id).catch(() => store.openDebts.filter((d) => d.saleId === sale.id));
    for (const d of debts) {
      if (d.status === 'voided') continue;
      const bal = d.status === 'open' ? (d.balance || 0) : 0;
      b.update(store.ref('debts', d.id), { status: 'voided', balance: 0, voidedAt: date });
      if (bal > 0 && sale.customerId && store.customer(sale.customerId)) b.update(store.ref('customers', sale.customerId), { balance: store.inc(-bal) });
      if ((d.amount || 0) - bal > 0.004) debtNote = 'El cliente ya había abonado parte de este fiado; esos abonos quedan registrados.';
    }
  }
  if (sale.service?.serviceId) b.update(store.ref('services', sale.service.serviceId), { status: 'voided' });

  await store.commit(b);
  return { cashReverted, debtNote };
}

/** Registra un abono de un cliente, aplicándolo a sus fiados más antiguos */
export async function registerPayment({ customer, amountUSD, method, currency, amountOriginal, note = '' }) {
  const rate = store.rate;
  const open = store.openDebts.filter((d) => d.customerId === customer.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totalDebt = round2(open.reduce((a, d) => a + (d.balance || 0), 0));
  let remaining = round2(Math.min(amountUSD, totalDebt));
  if (!(remaining > 0)) throw new Error('El cliente no tiene saldo pendiente.');
  const isCash = method === 'efectivo_usd' || method === 'efectivo_bs';
  const shift = store.openShift;
  if (isCash && !shift) throw new Error('Para recibir efectivo debes tener la caja abierta.');

  const b = store.batch();
  const date = nowISO();
  const payRef = store.newRef('debt_payments');
  const applied = [];
  for (const d of open) {
    if (remaining <= 0.004) break;
    const take = round2(Math.min(d.balance, remaining));
    const nb = round2(d.balance - take);
    b.update(store.ref('debts', d.id), nb <= 0.004 ? { balance: 0, status: 'paid', paidAt: date } : { balance: nb });
    applied.push({ debtId: d.id, saleNumber: d.saleNumber || '', amount: take });
    remaining = round2(remaining - take);
  }
  const applyUSD = round2(applied.reduce((a, x) => a + x.amount, 0));
  b.set(payRef, {
    customerId: customer.id, customerName: customer.name, date, dayKey: todayKey(),
    amountUSD: applyUSD, method, currency, amount: amountOriginal, rate, applied, note, shiftId: shift?.id || null, by: by()
  });
  b.update(store.ref('customers', customer.id), { balance: store.inc(-applyUSD), lastPaymentAt: date });
  if (shift) {
    const flow = { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 };
    if (method === 'efectivo_usd') flow.inUSD = round2(amountOriginal);
    if (method === 'efectivo_bs') flow.inBs = round2(amountOriginal);
    addMovements(b, shift.id, flow, { concept: `Abono de ${customer.name}`, category: 'Cobranza', refId: payRef.id, kind: 'debt_payment' });
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { paymentsTotal: applyUSD, [`paymentsByMethod.${method}`]: applyUSD }));
  }
  await store.commit(b);
  return { applied: applyUSD };
}

/** Gasto o ingreso manual de caja */
export async function cashMovement({ direction, currency, amount, concept, category, note = '' }) {
  const shift = store.openShift;
  if (!shift) throw new Error('No hay caja abierta.');
  const b = store.batch();
  const flow = { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 };
  flow[(direction === 'in' ? 'in' : 'out') + (currency === 'BS' ? 'Bs' : 'USD')] = round2(amount);
  const date = nowISO();
  b.set(store.newRef('cash_movements'), {
    shiftId: shift.id, date, dayKey: todayKey(), type: direction === 'in' ? 'income' : 'expense', direction, currency,
    amount: round2(amount), rate: store.rate, concept, category, note, by: by()
  });
  const extra = direction === 'out' ? { expensesUSD: currency === 'BS' ? amount / store.rate : amount } : { incomeUSD: currency === 'BS' ? amount / store.rate : amount };
  b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, extra));
  await store.commit(b);
}

export async function openShift({ openingUSD, openingBs, note = '' }) {
  if (store.openShift) throw new Error('Ya hay una caja abierta.');
  const ref = store.newRef('cash_shifts');
  const b = store.batch();
  b.set(ref, {
    status: 'open', openedAt: nowISO(), openedBy: by(), dayKey: todayKey(),
    number: docNumber('T'),
    openingUSD: round2(openingUSD), openingBs: round2(openingBs), rateAtOpen: store.rate,
    inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note
  });
  await store.commit(b);
  return ref.id;
}

export async function closeShift(shift, { countedUSD, countedBs, note = '' }) {
  const expUSD = round2((shift.openingUSD || 0) + (shift.inUSD || 0) - (shift.outUSD || 0));
  const expBs = round2((shift.openingBs || 0) + (shift.inBs || 0) - (shift.outBs || 0));
  const b = store.batch();
  b.update(store.ref('cash_shifts', shift.id), {
    status: 'closed', closedAt: nowISO(), closedBy: by(), rateAtClose: store.rate,
    expectedUSD: expUSD, expectedBs: expBs, countedUSD: round2(countedUSD), countedBs: round2(countedBs),
    diffUSD: round2(countedUSD - expUSD), diffBs: round2(countedBs - expBs), closeNote: note
  });
  await store.commit(b);
}

/** Ajuste de inventario: add | subtract | set */
export async function adjustStock(product, mode, qty, reason, unitCost = null) {
  const current = Number(store.product(product.id)?.stock ?? product.stock) || 0;
  let delta = mode === 'add' ? qty : mode === 'subtract' ? -qty : qty - current;
  delta = round4(delta);
  if (!delta && unitCost == null) return;
  const b = store.batch();
  const patch = { stock: store.inc(delta), updatedAt: nowISO() };
  if (unitCost != null && unitCost > 0) patch.cost = round4(unitCost);
  b.update(store.ref('products', product.id), patch);
  b.set(store.newRef('inventory_logs'), {
    productId: product.id, productName: product.name, date: nowISO(),
    type: mode === 'add' ? 'entrada' : mode === 'subtract' ? 'salida' : 'conteo', qty: delta, reason: reason || '', by: by()
  });
  await store.commit(b);
}

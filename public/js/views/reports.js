// SanoGestion — Reportes e inteligencia de negocio
import { store } from '../store.js';
import { requirePin } from '../auth.js';
import { voidSale } from '../ops.js';
import {
  esc, usd, bs, num, toast, openModal, confirmDialog, emptyState, fmtDateTime, fmtDate, setBusy, qtyFmt,
  startOfDay, endOfDay, addDays, dayKey, fromKey, todayKey, methodLabel, PAY_METHODS, download, toCSV, promptDialog
} from '../utils.js';
import { icon } from '../icons.js';
import { printDoc, printReceipt } from '../shared.js';

const PERIODS = [['today', 'Hoy'], ['yesterday', 'Ayer'], ['7d', '7 días'], ['month', 'Este mes'], ['prevmonth', 'Mes anterior'], ['custom', 'Personalizado']];

function range(period, from, to) {
  const now = new Date();
  switch (period) {
    case 'yesterday': { const y = addDays(now, -1); return [startOfDay(y), endOfDay(y)]; }
    case '7d': return [startOfDay(addDays(now, -6)), endOfDay(now)];
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
    case 'prevmonth': return [new Date(now.getFullYear(), now.getMonth() - 1, 1), endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))];
    case 'custom': return [startOfDay(fromKey(from)), endOfDay(fromKey(to))];
    default: return [startOfDay(now), endOfDay(now)];
  }
}
const lineCost = (l) => (Number(l.cost) || 0) * (Number(l.qty) || 0) * (Number(l.multiplier) || 1);
const saleCost = (s) => (s.items || []).reduce((a, l) => a + lineCost(l), 0);

export function openSaleDetail(sale, onChange) {
  const m = openModal({
    title: `Venta ${esc(sale.number)}`, sub: `${fmtDateTime(sale.date)} · ${esc(sale.customerName || 'Mostrador')}`, size: 'lg',
    body: `
      ${sale.status === 'voided' ? `<div class="balance-box missing mb"><b style="font-size:14px">Venta anulada</b><div class="small">${fmtDateTime(sale.voidedAt)}${sale.voidReason ? ' · ' + esc(sale.voidReason) : ''}</div></div>` : ''}
      <div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead><tbody>
      ${(sale.items || []).map((l) => `<tr><td>${esc(l.name)}<div class="t-sub">${esc(l.presentation || '')}</div></td><td class="r">${qtyFmt(l.qty)}</td><td class="r num">${usd(l.price)}</td><td class="r num">${usd(l.total)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid grid-2 mt">
        <div class="summary-box">
          <div class="summary-row"><span class="muted">Subtotal</span><b>${usd(sale.subtotal)}</b></div>
          ${sale.discount > 0 ? `<div class="summary-row"><span class="muted">Descuento</span><b class="text-danger">−${usd(sale.discount)}</b></div>` : ''}
          <div class="summary-row total"><span>Total</span><b>${usd(sale.total)}</b></div>
          <div class="summary-row"><span class="muted">En Bs (tasa ${num(sale.rate)})</span><b class="text-bs">${bs(sale.totalBs)}</b></div>
          <div class="summary-row"><span class="muted">Costo / ganancia</span><b>${usd(saleCost(sale))} / <span class="text-success">${usd(sale.total - saleCost(sale))}</span></b></div>
        </div>
        <div class="summary-box">
          ${(sale.payments || []).map((p) => `<div class="summary-row"><span class="muted">${esc(methodLabel(p.method))}</span><b>${p.currency === 'BS' ? bs(p.amount) : usd(p.amount)}</b></div>`).join('') || '<div class="summary-row"><span class="muted">Sin pagos</span></div>'}
          ${sale.changeUSD > 0.004 ? `<div class="summary-row"><span class="muted">Vuelto</span><b>${sale.changeCurrency === 'BS' ? bs(sale.changeUSD * sale.rate) : usd(sale.changeUSD)}</b></div>` : ''}
          ${sale.creditUSD > 0.004 ? `<div class="summary-row"><span class="muted">Fiado</span><b class="text-warning">${usd(sale.creditUSD)}</b></div>` : ''}
          ${sale.note ? `<div class="small muted mt">Nota: ${esc(sale.note)}</div>` : ''}
          <div class="xs faint mt">Registrada por ${esc(sale.by || '—')}</div>
        </div>
      </div>`,
    footer: `${sale.status !== 'voided' ? `<button class="btn btn-danger-soft" data-void>${icon('trash')} Anular venta</button>` : ''}<button class="btn btn-secondary" data-print>${icon('print')} Imprimir</button><button class="btn btn-primary" data-close>Cerrar</button>`
  });
  m.el.querySelector('[data-print]').onclick = () => printReceipt(sale);
  const v = m.el.querySelector('[data-void]');
  if (v) v.onclick = async () => {
    if (!(await requirePin(`Anular la venta ${sale.number}`))) return;
    const reason = await promptDialog({ title: 'Motivo de la anulación', label: 'Describe el motivo', placeholder: 'Ej.: error en el cobro', confirmText: 'Anular venta' });
    if (reason === null) return;
    setBusy(v, true);
    try {
      const r = await voidSale(sale, reason.trim());
      m.close();
      toast('Venta anulada: inventario restablecido' + (r.cashReverted ? ' y caja ajustada' : ''), 'success', 4000);
      if (!r.cashReverted && (sale.cashFlow?.inUSD || sale.cashFlow?.inBs)) toast('No hay caja abierta: el reintegro de efectivo no se registró en caja.', 'warning', 5000);
      if (r.debtNote) toast(r.debtNote, 'info', 5000);
      onChange && onChange();
    } catch (ex) { toast(ex.message, 'danger'); setBusy(v, false); }
  };
}

export function mount(el) {
  let period = 'today';
  let from = dayKey(addDays(new Date(), -6)), to = todayKey();
  let method = 'all', type = 'all', customer = 'all';
  let data = { sales: [], payments: [], movements: [] };
  let loading = false;

  el.innerHTML = `
    <div class="view-header">
      <div><h1 class="view-title">Reportes</h1><p class="view-sub">Ventas, ganancias, gastos y comportamiento del negocio</p></div>
      <div class="view-actions">
        <button class="btn btn-secondary" id="r-csv">${icon('download')} Excel</button>
        <button class="btn btn-secondary" id="r-pdf">${icon('print')} PDF</button>
      </div>
    </div>
    <div class="card mb" style="margin-bottom:16px">
      <div class="row-wrap" style="justify-content:space-between">
        <div class="seg" id="r-period">${PERIODS.map(([k, v]) => `<button data-p="${k}" class="${k === period ? 'active' : ''}">${v}</button>`).join('')}</div>
        <div class="row-wrap" id="r-custom" hidden>
          <input type="date" class="input" id="r-from" value="${from}" style="width:auto"><span class="muted">a</span><input type="date" class="input" id="r-to" value="${to}" style="width:auto">
          <button class="btn btn-primary btn-sm" id="r-apply">Aplicar</button>
        </div>
      </div>
      <div class="row-wrap mt">
        <select class="select" id="r-type" style="width:auto"><option value="all">Ventas y servicios</option><option value="sale">Solo ventas</option><option value="service">Solo servicios</option></select>
        <select class="select" id="r-method" style="width:auto"><option value="all">Todos los métodos</option>${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="mixto">Pago mixto</option></select>
        <select class="select" id="r-cust" style="width:auto"></select>
      </div>
    </div>
    <div id="r-body"></div>`;
  const $ = (s) => el.querySelector(s);

  const fillCustomers = () => {
    $('#r-cust').innerHTML = `<option value="all">Todos los clientes</option><option value="none">Mostrador</option>` + store.customers.map((c) => `<option value="${c.id}" ${c.id === customer ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  };

  async function load() {
    loading = true; render();
    const [a, b] = range(period, from, to);
    const A = a.toISOString(), B = b.toISOString();
    try {
      const [sales, payments, movements] = await Promise.all([
        store.salesBetween(A, B), store.listBetween('debt_payments', A, B), store.listBetween('cash_movements', A, B)
      ]);
      data = { sales: sales.sort((x, y) => (y.date || '').localeCompare(x.date || '')), payments, movements, from: a, to: b };
    } catch (e) { console.error(e); toast('No se pudieron cargar los reportes: ' + e.message, 'danger'); }
    loading = false; render();
  }

  const filtered = () => data.sales.filter((s) => {
    if (type !== 'all' && (s.type || 'sale') !== type) return false;
    if (customer === 'none' && s.customerId) return false;
    if (customer !== 'all' && customer !== 'none' && s.customerId !== customer) return false;
    if (method === 'mixto' && s.method !== 'mixto') return false;
    if (method === 'credito' && !(s.creditUSD > 0)) return false;
    if (!['all', 'mixto', 'credito'].includes(method) && !(s.payments || []).some((p) => p.method === method)) return false;
    return true;
  });

  function compute() {
    const all = filtered();
    const sales = all.filter((s) => s.status !== 'voided');
    const total = sales.reduce((a, s) => a + (s.total || 0), 0);
    const totalBs = sales.reduce((a, s) => a + (s.totalBs || 0), 0);
    const cost = sales.reduce((a, s) => a + saleCost(s), 0);
    const profit = total - cost;
    const credit = sales.reduce((a, s) => a + (s.creditUSD || 0), 0);
    const collected = data.payments.reduce((a, p) => a + (p.amountUSD || 0), 0);
    const expenses = data.movements.filter((x) => x.type === 'expense').reduce((a, x) => a + (x.currency === 'BS' ? x.amount / (x.rate || store.rate || 1) : x.amount), 0);
    const methods = {};
    sales.forEach((s) => {
      (s.payments || []).forEach((p) => { methods[p.method] = (methods[p.method] || 0) + (p.usd || 0); });
      if (s.changeUSD > 0) {
        // El vuelto se descuenta del efectivo recibido
        const m = s.changeCurrency === 'BS' ? 'efectivo_bs' : 'efectivo_usd';
        methods[m] = (methods[m] || 0) - s.changeUSD;
      }
      if (s.creditUSD > 0) methods.credito = (methods.credito || 0) + s.creditUSD;
    });
    const products = {};
    const cats = {};
    sales.forEach((s) => (s.items || []).forEach((l) => {
      const k = l.productId || l.name;
      products[k] ||= { name: l.name, qty: 0, total: 0, profit: 0 };
      products[k].qty += (l.qty || 0) * (l.multiplier || 1);
      products[k].total += l.total || 0;
      products[k].profit += (l.total || 0) - lineCost(l);
      const c = l.category || 'Sin categoría';
      cats[c] = (cats[c] || 0) + (l.total || 0);
    }));
    const days = {};
    sales.forEach((s) => { days[s.dayKey] = (days[s.dayKey] || 0) + (s.total || 0); });
    return { all, sales, total, totalBs, cost, profit, credit, collected, expenses, methods, products, cats, days };
  }

  function render() {
    if (loading) { $('#r-body').innerHTML = '<div class="card"><div class="spinner" style="margin:40px auto"></div></div>'; return; }
    const r = compute();
    const n = r.sales.length;
    const margin = r.total > 0 ? (r.profit / r.total) * 100 : 0;
    const net = r.profit - r.expenses;
    const methods = Object.entries(r.methods).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
    const maxM = Math.max(...methods.map(([, v]) => v), 1);
    const top = Object.values(r.products).sort((a, b) => b.total - a.total).slice(0, 10);
    const maxP = Math.max(...top.map((p) => p.total), 1);
    const cats = Object.entries(r.cats).sort((a, b) => b[1] - a[1]);
    const maxC = Math.max(...cats.map(([, v]) => v), 1);
    // serie diaria
    const series = [];
    if (data.from && data.to) {
      const spanDays = Math.round((startOfDay(data.to) - startOfDay(data.from)) / 864e5) + 1;
      if (spanDays > 1 && spanDays <= 62) for (let i = 0; i < spanDays; i++) { const k = dayKey(addDays(data.from, i)); series.push({ k, v: r.days[k] || 0 }); }
    }
    const maxS = Math.max(...series.map((x) => x.v), 1);

    $('#r-body').innerHTML = `
      <div class="kpis">
        ${k('Ventas', usd(r.total), `${bs(r.totalBs)} · ${n} ticket${n === 1 ? '' : 's'}`, 'trend', 'brand')}
        ${k('Ganancia bruta', usd(r.profit), `Margen ${num(margin, 1)}%`, 'dollar', 'success')}
        ${k('Gastos de caja', usd(r.expenses), 'Equivalente en $', 'arrowUp', 'danger')}
        ${k('Utilidad estimada', `<span class="${net >= 0 ? 'text-success' : 'text-danger'}">${usd(net)}</span>`, 'Ganancia − gastos', 'chart', 'info')}
        ${k('Ticket promedio', usd(n ? r.total / n : 0), n ? bs((r.totalBs) / n) : '—', 'receipt', 'violet')}
        ${k('Fiado otorgado', usd(r.credit), `Abonos cobrados: ${usd(r.collected)}`, 'card', 'warning')}
      </div>
      ${series.length ? `<div class="card mb" style="margin-bottom:16px"><div class="card-header"><div class="card-title"><span class="ico">${icon('chart')}</span>Ventas por día</div></div>
        <div class="chart" style="gap:${series.length > 20 ? 3 : 8}px">${series.map((x) => `<div class="chart-col" title="${fmtDate(x.k)}: ${usd(x.v)}">${series.length <= 14 ? `<span class="chart-val">${x.v ? '$' + num(x.v, 0) : ''}</span>` : ''}<div class="chart-bar" style="height:${Math.max(2, (x.v / maxS) * 100)}%"></div><span class="chart-lbl">${series.length <= 14 ? fromKey(x.k).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : fromKey(x.k).getDate()}</span></div>`).join('')}</div></div>` : ''}
      <div class="grid grid-3">
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('card')}</span>Cobrado por método</div></div>
          ${methods.length ? methods.map(([m, v]) => `<div style="margin-bottom:10px"><div class="between small"><span>${esc(methodLabel(m))}</span><b class="num">${usd(v)}${PAY_METHODS[m]?.cur === 'BS' ? ` <span class="faint">· ${bs(v * store.rate)}</span>` : ''}</b></div><div class="bar-track"><div class="bar-fill" style="width:${(v / maxM) * 100}%;background:${PAY_METHODS[m]?.color || 'var(--brand)'}"></div></div></div>`).join('') : emptyState('card', 'Sin datos')}
          <p class="xs faint">Montos netos de vuelto, en equivalente $.</p>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('star')}</span>Productos más vendidos</div></div>
          ${top.length ? top.map((p, i) => `<div style="margin-bottom:10px"><div class="between small"><span class="ellipsis" style="max-width:65%"><b>${i + 1}.</b> ${esc(p.name)}</span><b class="num">${usd(p.total)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${(p.total / maxP) * 100}%"></div></div><div class="xs faint">${qtyFmt(p.qty)} u. · ganancia ${usd(p.profit)}</div></div>`).join('') : emptyState('star', 'Sin datos')}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('tag')}</span>Ventas por categoría</div></div>
          ${cats.length ? cats.map(([c, v]) => `<div style="margin-bottom:10px"><div class="between small"><span>${esc(c)}</span><b class="num">${usd(v)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${(v / maxC) * 100}%;background:var(--info)"></div></div></div>`).join('') : emptyState('tag', 'Sin datos')}
        </div>
      </div>
      <div class="card card-flush mt-lg">
        <div class="card-header" style="padding:16px 18px 0"><div class="card-title"><span class="ico">${icon('receipt')}</span>Detalle de ventas</div><span class="badge badge-neutral">${r.all.length} registro(s)</span></div>
        ${r.all.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Fecha</th><th>Ticket</th><th class="hide-sm">Cliente</th><th>Pago</th><th class="r">Total</th><th class="r hide-sm">Ganancia</th><th></th></tr></thead><tbody>
          ${r.all.slice(0, 400).map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.55' : ''}">
            <td class="nowrap">${fmtDateTime(s.date)}</td>
            <td><span class="t-name">${esc(s.number)}</span>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulada</span>' : ''}${s.type === 'service' ? ' <span class="badge badge-violet">Servicio</span>' : ''}<div class="t-sub ellipsis" style="max-width:220px">${esc((s.items || []).map((i) => i.name).join(', '))}</div></td>
            <td class="hide-sm">${esc(s.customerName || 'Mostrador')}</td>
            <td>${s.creditUSD > 0 ? '<span class="badge badge-warning">Fiado</span> ' : ''}${s.method === 'mixto' ? '<span class="badge badge-info">Mixto</span>' : (s.method !== 'credito' ? `<span class="badge badge-neutral">${esc(methodLabel(s.method))}</span>` : '')}</td>
            <td class="r num"><b>${usd(s.total)}</b><div class="t-sub text-bs">${bs(s.totalBs)}</div></td>
            <td class="r num hide-sm text-success">${s.status === 'voided' ? '—' : usd((s.total || 0) - saleCost(s))}</td>
            <td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-sale="${s.id}" title="Ver detalle">${icon('eye')}</button></td>
          </tr>`).join('')}</tbody></table></div>${r.all.length > 400 ? '<p class="small muted center" style="padding:10px">Mostrando 400 registros. Exporta a Excel para ver todos.</p>' : ''}`
          : `<div style="padding:0 18px 18px">${emptyState('receipt', 'No hay ventas en este período')}</div>`}
      </div>`;
    el.querySelectorAll('[data-sale]').forEach((b) => b.onclick = () => openSaleDetail(data.sales.find((s) => s.id === b.dataset.sale), load));
  }

  function k(label, value, sub, ic, tone) {
    return `<div class="card kpi"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon tone-${tone}">${icon(ic)}</span></div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  }

  const periodLabel = () => {
    const [a, b] = range(period, from, to);
    return dayKey(a) === dayKey(b) ? fmtDate(dayKey(a)) : `${fmtDate(dayKey(a))} al ${fmtDate(dayKey(b))}`;
  };

  $('#r-csv').onclick = () => {
    const r = compute();
    if (!r.all.length) { toast('No hay datos para exportar', 'warning'); return; }
    const rows = [['fecha', 'ticket', 'tipo', 'estado', 'cliente', 'producto', 'presentacion', 'cantidad', 'precio_usd', 'total_linea_usd', 'costo_linea_usd', 'total_venta_usd', 'total_venta_bs', 'tasa', 'pagos', 'fiado_usd']];
    r.all.forEach((s) => (s.items || []).forEach((l, i) => rows.push([
      fmtDateTime(s.date), s.number, s.type === 'service' ? 'Servicio' : 'Venta', s.status === 'voided' ? 'Anulada' : 'Completada', s.customerName || 'Mostrador',
      l.name, l.presentation || '', qtyFmt(l.qty), num(l.price), num(l.total), num(lineCost(l)),
      i === 0 ? num(s.total) : '', i === 0 ? num(s.totalBs) : '', i === 0 ? num(s.rate) : '',
      i === 0 ? (s.payments || []).map((p) => `${methodLabel(p.method)} ${p.currency === 'BS' ? 'Bs' : '$'}${num(p.amount)}`).join(' + ') : '', i === 0 ? num(s.creditUSD || 0) : ''
    ])));
    download(`ventas_${dayKey(data.from || new Date())}_${dayKey(data.to || new Date())}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
    toast('Reporte exportado');
  };
  $('#r-pdf').onclick = () => {
    const r = compute();
    const net = r.profit - r.expenses;
    const methods = Object.entries(r.methods).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
    const top = Object.values(r.products).sort((a, b) => b.total - a.total).slice(0, 15);
    printDoc(`Reporte de ventas · ${periodLabel()}`, `
      <div class="kpis">
        <div class="kpi">Ventas<b>${usd(r.total)}</b>${bs(r.totalBs)}</div>
        <div class="kpi">Ganancia bruta<b>${usd(r.profit)}</b></div>
        <div class="kpi">Gastos<b>${usd(r.expenses)}</b></div>
        <div class="kpi">Utilidad estimada<b>${usd(net)}</b></div>
        <div class="kpi">Tickets<b>${r.sales.length}</b></div>
        <div class="kpi">Fiado otorgado<b>${usd(r.credit)}</b></div>
      </div>
      <h2>Cobrado por método</h2><table><tbody>${methods.map(([m, v]) => `<tr><td>${esc(methodLabel(m))}</td><td class="r">${usd(v)}</td></tr>`).join('') || '<tr><td>Sin datos</td></tr>'}</tbody></table>
      <h2>Productos más vendidos</h2><table><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Ventas</th><th class="r">Ganancia</th></tr></thead><tbody>${top.map((p) => `<tr><td>${esc(p.name)}</td><td class="r">${qtyFmt(p.qty)}</td><td class="r">${usd(p.total)}</td><td class="r">${usd(p.profit)}</td></tr>`).join('') || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody></table>
      <h2>Detalle</h2><table><thead><tr><th>Fecha</th><th>Ticket</th><th>Cliente</th><th>Pago</th><th class="r">Total $</th><th class="r">Total Bs</th></tr></thead><tbody>
      ${r.sales.map((s) => `<tr><td>${fmtDateTime(s.date)}</td><td>${esc(s.number)}</td><td>${esc(s.customerName || '')}</td><td>${s.creditUSD > 0 ? 'Fiado ' : ''}${esc(s.method === 'mixto' ? 'Mixto' : methodLabel(s.method))}</td><td class="r">${usd(s.total)}</td><td class="r">${bs(s.totalBs)}</td></tr>`).join('')}</tbody></table>`);
  };
  el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
    period = b.dataset.p;
    el.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('active', x === b));
    $('#r-custom').hidden = period !== 'custom';
    if (period !== 'custom') load();
  });
  $('#r-apply').onclick = () => {
    from = $('#r-from').value; to = $('#r-to').value;
    if (!from || !to || from > to) { toast('Rango de fechas inválido', 'warning'); return; }
    load();
  };
  $('#r-type').onchange = (e) => { type = e.target.value; render(); };
  $('#r-method').onchange = (e) => { method = e.target.value; render(); };
  $('#r-cust').onchange = (e) => { customer = e.target.value; render(); };
  fillCustomers();
  load();
  const off = store.on('customers', fillCustomers);
  return () => off();
}

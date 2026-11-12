// SanoGestion — Cobranza / Fiados
import { store } from '../store.js';
import { registerPayment } from '../ops.js';
import { esc, usd, bs, num, normalize, toast, openModal, emptyState, initials, colorFor, fmtDate, parseNum, debounce, setBusy, waLink, PAY_METHODS, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { debtStatus, printDoc } from '../shared.js';
import { openCustomerDetail } from './customers.js';

// Formas de pago del país (en Venezuela: $, Bs, pago móvil, transferencia, punto, Biopago y Zelle)
const methodKeys = () => Object.keys(PAY_METHODS);

export function openPaymentModal(customerId = '') {
  const rate = store.rate;
  const debtors = store.customers.filter((c) => store.customerBalance(c.id) > 0.004);
  if (!debtors.length) { toast('No hay clientes con saldo pendiente', 'info'); return; }
  const m = openModal({
    title: 'Registrar abono', sub: 'Se aplica automáticamente a los fiados más antiguos',
    body: `<form class="stack" data-f>
      <div class="field"><label>Cliente</label>
        <select class="select" data-c><option value="">Selecciona un cliente…</option>${debtors.map((c) => `<option value="${c.id}" ${c.id === customerId ? 'selected' : ''}>${esc(c.name)} · debe ${usd(store.customerBalance(c.id))}</option>`).join('')}</select></div>
      <div class="summary-box"><div class="summary-row"><span class="muted">Saldo actual</span><b data-cur>${usd(0)}</b></div><div class="summary-row"><span class="muted">Saldo luego del abono</span><b data-new class="text-success">${usd(0)}</b></div></div>
      <div class="form-grid">
        <div class="field"><label>Método</label><select class="select" data-m>${methodKeys().map((k) => `<option value="${k}">${PAY_METHODS[k].label}</option>`).join('')}</select></div>
        <div class="field"><label data-al>Monto ($)</label><input class="input input-lg" data-a inputmode="decimal" placeholder="0,00"></div>
      </div>
      <div class="hint" data-eq></div>
      <div class="field"><label>Nota (opcional)</label><input class="input" data-n placeholder="Ej.: referencia del pago móvil"></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Registrar abono</button>`
  });
  const q = (s) => m.el.querySelector(s);
  const cur = () => PAY_METHODS[q('[data-m]').value].cur;
  const balance = () => store.customerBalance(q('[data-c]').value);
  const amountUSD = () => { const a = parseNum(q('[data-a]').value); return cur() === 'BS' ? a / rate : a; };
  const upd = () => {
    const b = balance();
    q('[data-al]').textContent = cur() === 'BS' ? 'Monto (Bs)' : 'Monto ($)';
    q('[data-cur]').textContent = usd(b);
    const a = amountUSD();
    q('[data-new]').textContent = usd(Math.max(0, b - a));
    q('[data-eq]').textContent = a > 0 ? (cur() === 'BS' ? `Equivale a ${usd(a)} a tasa ${bs(rate)}` : `Equivale a ${bs(a * rate)}`) + (a > b + 0.005 ? ' · El monto excede la deuda: solo se aplicará el saldo pendiente.' : '') : '';
  };
  const fillAll = () => { const b = balance(); q('[data-a]').value = b > 0 ? num(cur() === 'BS' ? b * rate : b) : ''; upd(); };
  q('[data-c]').onchange = fillAll;
  q('[data-m]').onchange = fillAll;
  q('[data-a]').oninput = upd;
  if (customerId) fillAll(); else upd();
  setTimeout(() => (customerId ? q('[data-a]') : q('[data-c]')).focus(), 80);

  const save = async (e) => {
    e?.preventDefault();
    const c = store.customer(q('[data-c]').value);
    if (!c) { toast('Selecciona un cliente', 'warning'); return; }
    const amt = parseNum(q('[data-a]').value);
    if (!(amt > 0)) { toast('Ingresa un monto válido', 'warning'); return; }
    if (!(rate > 0) && cur() === 'BS') { toast('Configura la tasa del día', 'warning'); return; }
    const method = q('[data-m]').value;
    const usdAmt = Math.min(round2(amountUSD()), round2(balance()));
    const original = cur() === 'BS' ? Math.min(amt, round2(balance() * rate)) : usdAmt;
    const btn = q('[data-ok]'); setBusy(btn, true, 'Guardando…');
    try {
      const r = await registerPayment({ customer: c, amountUSD: usdAmt, method, currency: cur(), amountOriginal: original, note: q('[data-n]').value.trim() });
      m.close();
      toast(`Abono de ${usd(r.applied)} registrado a ${c.name}`);
    } catch (ex) { toast(ex.message, 'danger', 4500); setBusy(btn, false); }
  };
  q('[data-f]').onsubmit = save;
  q('[data-ok]').onclick = save;
}

export function mount(el) {
  let search = '', filter = 'all';
  el.innerHTML = `
    <div class="view-header">
      <div><h1 class="view-title">Cobranza y fiados</h1><p class="view-sub">Controla lo que te deben y registra los abonos</p></div>
      <div class="view-actions">
        <button class="btn btn-secondary" id="d-print">${icon('print')} Imprimir</button>
        <button class="btn btn-primary" id="d-pay">${icon('dollar')} Registrar abono</button>
      </div>
    </div>
    <div class="kpis" id="d-kpis"></div>
    <div class="card card-flush">
      <div class="inv-filters">
        <label class="search">${icon('search')}<input id="d-search" placeholder="Buscar cliente…"></label>
        <div class="seg" id="d-filter"><button data-f="all" class="active">Todos</button><button data-f="overdue">Vencidos</button><button data-f="open">Al corriente</button></div>
      </div>
      <div id="d-list"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  const rows = () => {
    const map = {};
    store.openDebts.forEach((d) => {
      const r = (map[d.customerId] ||= { id: d.customerId, name: d.customerName, total: 0, overdue: 0, count: 0, oldest: d.date, nextDue: d.dueDate });
      r.total += d.balance || 0; r.count++;
      if (debtStatus(d) === 'overdue') r.overdue += d.balance || 0;
      if ((d.date || '') < (r.oldest || '')) r.oldest = d.date;
      if (d.dueDate && (!r.nextDue || d.dueDate < r.nextDue)) r.nextDue = d.dueDate;
    });
    return Object.values(map).map((r) => ({ ...r, customer: store.customer(r.id), name: store.customer(r.id)?.name || r.name })).filter((r) => r.total > 0.004).sort((a, b) => b.total - a.total);
  };

  const render = () => {
    const all = rows();
    const total = all.reduce((a, r) => a + r.total, 0);
    const overdue = all.reduce((a, r) => a + r.overdue, 0);
    $('#d-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Total por cobrar</span><span class="kpi-icon tone-warning">${icon('card')}</span></div><div class="kpi-value">${usd(total)}</div><div class="kpi-sub">${bs(total * store.rate)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Vencido</span><span class="kpi-icon tone-danger">${icon('alert')}</span></div><div class="kpi-value text-danger">${usd(overdue)}</div><div class="kpi-sub">${all.filter((r) => r.overdue > 0).length} cliente(s)</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Clientes con deuda</span><span class="kpi-icon tone-brand">${icon('users')}</span></div><div class="kpi-value">${all.length}</div><div class="kpi-sub">Plazo de crédito: ${store.settings.creditDays} días</div></div>`;
    const q = normalize(search);
    let list = all;
    if (filter === 'overdue') list = list.filter((r) => r.overdue > 0);
    if (filter === 'open') list = list.filter((r) => r.overdue <= 0);
    if (q) list = list.filter((r) => normalize(r.name).includes(q) || String(r.customer?.phone || '').includes(search.trim()));
    $('#d-list').innerHTML = list.length ? list.map((r) => `
      <div class="debtor">
        <span class="avatar" style="background:${colorFor(r.name)}">${esc(initials(r.name))}</span>
        <div style="min-width:0">
          <div class="bold ellipsis">${esc(r.name)}</div>
          <div class="small muted">${r.count} fiado(s) · desde ${fmtDate(r.oldest)} · vence ${fmtDate(r.nextDue)}</div>
          ${r.overdue > 0 ? `<span class="badge badge-danger mt" style="margin-top:4px">${usd(r.overdue)} vencido</span>` : '<span class="badge badge-warning" style="margin-top:4px">Pendiente</span>'}
        </div>
        <div class="debtor-amount">
          <div><b class="text-danger">${usd(r.total)}</b><span class="small text-bs">${bs(r.total * store.rate)}</span></div>
          <div class="debtor-actions">
            ${r.customer?.phone ? `<a class="btn btn-ghost btn-icon btn-sm" title="Recordatorio por WhatsApp" target="_blank" rel="noopener" href="${waLink(r.customer.phone, `Hola ${r.name}, te saludamos de ${store.businessName}. Te recordamos tu saldo pendiente de ${usd(r.total)} (${bs(r.total * store.rate)} a tasa BCV). ¡Gracias por tu preferencia!`)}">${icon('whatsapp')}</a>` : ''}
            <button class="btn btn-secondary btn-sm" data-view="${r.id}">${icon('eye')} Ficha</button>
            <button class="btn btn-primary btn-sm" data-pay="${r.id}">${icon('dollar')} Abonar</button>
          </div>
        </div>
      </div>`).join('') : emptyState('check', search || filter !== 'all' ? 'Sin resultados' : '¡Nadie te debe!', search || filter !== 'all' ? '' : 'Los fiados aparecerán aquí cuando vendas a crédito.');
    el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => openCustomerDetail(b.dataset.view));
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => openPaymentModal(b.dataset.pay));
  };

  $('#d-pay').onclick = () => openPaymentModal();
  $('#d-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); render(); });
  $('#d-print').onclick = () => {
    const all = rows();
    printDoc('Cuentas por cobrar', `
      <div class="kpis"><div class="kpi">Total por cobrar<b>${usd(all.reduce((a, r) => a + r.total, 0))}</b></div><div class="kpi">Vencido<b>${usd(all.reduce((a, r) => a + r.overdue, 0))}</b></div></div>
      <table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Fiados</th><th>Próx. vencimiento</th><th class="r">Vencido</th><th class="r">Saldo $</th><th class="r">Saldo Bs</th></tr></thead><tbody>
      ${all.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.customer?.phone || '')}</td><td>${r.count}</td><td>${fmtDate(r.nextDue)}</td><td class="r">${usd(r.overdue)}</td><td class="r">${usd(r.total)}</td><td class="r">${bs(r.total * store.rate)}</td></tr>`).join('')}
      </tbody></table>`);
  };
  render();
  const offs = [store.on('debts', render), store.on('customers', render)];
  return () => offs.forEach((o) => o());
}

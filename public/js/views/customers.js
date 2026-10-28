// SanoGestion — Clientes
import { store } from '../store.js';
import { requirePin } from '../auth.js';
import {
  esc, usd, bs, num, normalize, toast, openModal, confirmDialog, emptyState, initials, colorFor,
  fmtDate, fmtDateTime, parseNum, debounce, setBusy, nowISO, waLink, methodLabel
} from '../utils.js';
import { icon } from '../icons.js';
import { printDoc, debtStatus } from '../shared.js';
import { openPaymentModal } from './debts.js';

/** Formulario de cliente (crear/editar). onSaved(cliente) */
export function openCustomerForm(customer = null, onSaved = null) {
  const c = customer || {};
  const m = openModal({
    title: customer ? 'Editar cliente' : 'Nuevo cliente',
    body: `<form class="form-grid" data-f>
      <div class="field full"><label>Nombre completo *</label><input class="input" name="name" value="${esc(c.name)}" required autofocus placeholder="Ej.: María González"></div>
      <div class="field"><label>Cédula / RIF</label><input class="input" name="idDoc" value="${esc(c.idDoc)}" placeholder="V-12345678"></div>
      <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(c.phone)}" placeholder="0414-1234567" inputmode="tel"></div>
      <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(c.address)}" placeholder="Sector, calle, casa"></div>
      <div class="field"><label>Límite de crédito ($)</label><input class="input" name="creditLimit" value="${c.creditLimit ? num(c.creditLimit) : ''}" inputmode="decimal" placeholder="Sin límite"></div>
      <div class="field"><label>Notas</label><input class="input" name="notes" value="${esc(c.notes)}" placeholder="Opcional"></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${customer ? 'Guardar cambios' : 'Crear cliente'}</button>`
  });
  const f = m.el.querySelector('[data-f]');
  const F = f.elements;
  const save = async (e) => {
    e?.preventDefault();
    const name = F.name.value.trim();
    if (!name) { F.name.focus(); toast('El nombre es obligatorio', 'warning'); return; }
    const dup = store.customers.find((x) => x.id !== c.id && normalize(x.name) === normalize(name));
    if (dup && !(await confirmDialog({ title: 'Cliente duplicado', message: `Ya existe un cliente llamado "${esc(dup.name)}". ¿Crear de todos modos?`, confirmText: 'Sí, continuar' }))) return;
    const data = {
      name, idDoc: F.idDoc.value.trim(), phone: F.phone.value.trim(), address: F.address.value.trim(),
      creditLimit: parseNum(F.creditLimit.value) || 0, notes: F.notes.value.trim(), updatedAt: nowISO()
    };
    const btn = m.el.querySelector('[data-ok]');
    setBusy(btn, true);
    const id = customer ? customer.id : store.newRef('customers').id;
    if (!customer) { data.createdAt = nowISO(); data.balance = 0; }
    await store.save('customers', id, data, true);
    m.close();
    toast(customer ? 'Cliente actualizado' : `Cliente "${name}" creado`);
    onSaved && onSaved({ id, ...c, ...data });
  };
  f.onsubmit = save;
  m.el.querySelector('[data-ok]').onclick = save;
}

export async function openCustomerDetail(customerId) {
  const c = store.customer(customerId);
  if (!c) return;
  const bal = store.customerBalance(c.id);
  const debts = store.openDebts.filter((d) => d.customerId === c.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const m = openModal({
    title: esc(c.name),
    sub: [c.idDoc, c.phone, c.address].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto',
    size: 'lg',
    body: `
      <div class="grid grid-3" style="gap:10px">
        <div class="summary-box"><div class="label">Saldo pendiente</div><div class="kpi-value ${bal > 0 ? 'text-danger' : 'text-success'}" style="font-size:22px;margin:2px 0 0">${usd(bal)}</div><div class="kpi-sub">${bs(bal * store.rate)}</div></div>
        <div class="summary-box"><div class="label">Fiados abiertos</div><div class="kpi-value" style="font-size:22px;margin:2px 0 0">${debts.length}</div><div class="kpi-sub">${c.creditLimit ? 'Límite: ' + usd(c.creditLimit) : 'Sin límite de crédito'}</div></div>
        <div class="summary-box"><div class="label">Última compra</div><div class="bold" style="margin-top:6px">${c.lastPurchaseAt ? fmtDateTime(c.lastPurchaseAt) : '—'}</div><div class="kpi-sub">Cliente desde ${fmtDate(c.createdAt)}</div></div>
      </div>
      <div class="row-wrap mt">
        <button class="btn btn-primary btn-sm" data-pay ${bal > 0 ? '' : 'disabled'}>${icon('dollar')} Registrar abono</button>
        ${c.phone ? `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" data-wa>${icon('whatsapp')} WhatsApp</a>` : ''}
        <button class="btn btn-secondary btn-sm" data-print>${icon('print')} Estado de cuenta</button>
        <button class="btn btn-ghost btn-sm" data-edit>${icon('edit')} Editar</button>
      </div>
      <h4 class="mt-lg mb">Fiados pendientes</h4>
      ${debts.length ? `<div class="timeline">${debts.map((d) => {
        const st = debtStatus(d);
        return `<div class="tl-item between"><div><div class="bold">${esc(d.saleNumber || 'Fiado')}</div><div class="small muted">${fmtDate(d.date)} · vence ${fmtDate(d.dueDate)} ${st === 'overdue' ? '<span class="badge badge-danger">Vencido</span>' : ''}</div></div>
        <div class="right"><b class="num">${usd(d.balance)}</b><div class="small faint">de ${usd(d.amount)}</div></div></div>`;
      }).join('')}</div>` : '<p class="muted small">Sin fiados pendientes.</p>'}
      <h4 class="mt-lg mb">Compras recientes</h4>
      <div data-sales><div class="spinner" style="margin:10px auto"></div></div>
      <h4 class="mt-lg mb">Abonos recibidos</h4>
      <div data-pays><div class="spinner" style="margin:10px auto"></div></div>`
  });
  const wa = m.el.querySelector('[data-wa]');
  if (wa) wa.href = waLink(c.phone, bal > 0
    ? `Hola ${c.name}, te saludamos de ${store.businessName}. Te recordamos que tienes un saldo pendiente de ${usd(bal)} (${bs(bal * store.rate)} a tasa BCV). ¡Gracias!`
    : `Hola ${c.name}, te saludamos de ${store.businessName}.`);
  m.el.querySelector('[data-pay]').onclick = () => { m.close(); openPaymentModal(c.id); };
  m.el.querySelector('[data-edit]').onclick = async () => { if (await requirePin('Editar cliente')) { m.close(); openCustomerForm(c); } };

  let sales = [], pays = [];
  try {
    [sales, pays] = await Promise.all([
      store.listWhere('sales', 'customerId', c.id, 'date', 25),
      store.listWhere('debt_payments', 'customerId', c.id, 'date', 25)
    ]);
  } catch (e) { console.warn(e); }
  const sBox = m.el.querySelector('[data-sales]');
  if (sBox) sBox.innerHTML = sales.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Ticket</th><th>Pago</th><th class="r">Total</th></tr></thead><tbody>
    ${sales.map((s) => `<tr><td>${fmtDateTime(s.date)}</td><td>${esc(s.number)} ${s.status === 'voided' ? '<span class="badge badge-danger">Anulada</span>' : ''}</td><td>${s.creditUSD > 0 ? '<span class="badge badge-warning">Fiado</span>' : esc(methodLabel(s.method))}</td><td class="r num">${usd(s.total)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">Sin compras registradas.</p>';
  const pBox = m.el.querySelector('[data-pays]');
  if (pBox) pBox.innerHTML = pays.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Método</th><th class="r">Monto</th></tr></thead><tbody>
    ${pays.map((p) => `<tr><td>${fmtDateTime(p.date)}</td><td>${esc(methodLabel(p.method))}${p.note ? `<div class="t-sub">${esc(p.note)}</div>` : ''}</td><td class="r num">${usd(p.amountUSD)}${p.currency === 'BS' ? `<div class="t-sub">${bs(p.amount)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">Sin abonos registrados.</p>';

  m.el.querySelector('[data-print]').onclick = () => printDoc(`Estado de cuenta — ${c.name}`, `
    <p><b>Cliente:</b> ${esc(c.name)} ${c.idDoc ? '· ' + esc(c.idDoc) : ''} ${c.phone ? '· ' + esc(c.phone) : ''}</p>
    <div class="kpis"><div class="kpi">Saldo pendiente<b>${usd(bal)}</b>${bs(bal * store.rate)}</div></div>
    <h2>Fiados pendientes</h2>
    <table><thead><tr><th>Fecha</th><th>Ticket</th><th>Vence</th><th class="r">Monto</th><th class="r">Saldo</th></tr></thead><tbody>
    ${debts.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${esc(d.saleNumber || '')}</td><td>${fmtDate(d.dueDate)}</td><td class="r">${usd(d.amount)}</td><td class="r">${usd(d.balance)}</td></tr>`).join('') || '<tr><td colspan="5">Sin fiados pendientes</td></tr>'}
    </tbody></table>
    <h2>Abonos recientes</h2>
    <table><thead><tr><th>Fecha</th><th>Método</th><th class="r">Monto</th></tr></thead><tbody>
    ${pays.map((p) => `<tr><td>${fmtDateTime(p.date)}</td><td>${esc(methodLabel(p.method))}</td><td class="r">${usd(p.amountUSD)}</td></tr>`).join('') || '<tr><td colspan="3">Sin abonos</td></tr>'}
    </tbody></table>`);
}

export function mount(el) {
  let search = '';
  let filter = 'all';
  el.innerHTML = `
    <div class="view-header">
      <div><h1 class="view-title">Clientes</h1><p class="view-sub">Directorio, saldos e historial de compras</p></div>
      <div class="view-actions"><button class="btn btn-primary" id="c-new">${icon('plus')} Nuevo cliente</button></div>
    </div>
    <div class="kpis" id="c-kpis"></div>
    <div class="card card-flush">
      <div class="inv-filters">
        <label class="search">${icon('search')}<input id="c-search" placeholder="Buscar por nombre, cédula o teléfono…"></label>
        <div class="seg" id="c-filter"><button data-f="all" class="active">Todos</button><button data-f="debt">Con deuda</button></div>
      </div>
      <div id="c-list"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  const render = () => {
    const all = store.customers;
    const withDebt = all.filter((c) => store.customerBalance(c.id) > 0.004);
    const total = store.openDebts.reduce((a, d) => a + (d.balance || 0), 0);
    $('#c-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Clientes</span><span class="kpi-icon tone-brand">${icon('users')}</span></div><div class="kpi-value">${all.length}</div><div class="kpi-sub">registrados</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Con saldo pendiente</span><span class="kpi-icon tone-warning">${icon('card')}</span></div><div class="kpi-value">${withDebt.length}</div><div class="kpi-sub">clientes</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Total por cobrar</span><span class="kpi-icon tone-danger">${icon('dollar')}</span></div><div class="kpi-value">${usd(total)}</div><div class="kpi-sub">${bs(total * store.rate)}</div></div>`;
    const q = normalize(search);
    let list = filter === 'debt' ? withDebt : all;
    if (q) list = list.filter((c) => normalize(c.name).includes(q) || normalize(c.idDoc).includes(q) || String(c.phone || '').includes(search.trim()));
    $('#c-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Cliente</th><th class="hide-sm">Contacto</th><th class="r">Saldo</th><th class="r">Acciones</th></tr></thead><tbody>
      ${list.map((c) => {
        const b = store.customerBalance(c.id);
        return `<tr>
          <td><div class="row"><span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span><div style="min-width:0"><div class="t-name ellipsis">${esc(c.name)}</div><div class="t-sub">${esc(c.idDoc || '')}</div></div></div></td>
          <td class="hide-sm"><div>${esc(c.phone || '—')}</div><div class="t-sub ellipsis" style="max-width:240px">${esc(c.address || '')}</div></td>
          <td class="r num">${b > 0.004 ? `<b class="text-danger">${usd(b)}</b>` : '<span class="badge badge-success">Al día</span>'}</td>
          <td class="r nowrap">
            <button class="btn btn-secondary btn-sm" data-view="${c.id}">${icon('eye')}<span class="hide-sm">Ficha</span></button>
            <button class="btn btn-ghost btn-icon btn-sm" data-edit="${c.id}" title="Editar">${icon('edit')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-del="${c.id}" title="Eliminar">${icon('trash')}</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('users', search ? 'Sin resultados' : 'Aún no hay clientes', search ? '' : 'Crea tu primer cliente para registrar fiados y ver su historial.');
    el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => openCustomerDetail(b.dataset.view));
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = async () => { if (await requirePin('Editar cliente')) openCustomerForm(store.customer(b.dataset.edit)); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => del(store.customer(b.dataset.del)));
  };

  async function del(c) {
    if (!c) return;
    if (store.customerBalance(c.id) > 0.004) { toast(`No se puede eliminar: ${c.name} tiene saldo pendiente.`, 'warning'); return; }
    if (!(await requirePin('Eliminar cliente'))) return;
    if (!(await confirmDialog({ title: 'Eliminar cliente', message: `¿Eliminar a <b>${esc(c.name)}</b>? Su historial de ventas se conserva.`, confirmText: 'Eliminar', danger: true }))) return;
    await store.remove('customers', c.id);
    toast('Cliente eliminado', 'info');
  }

  $('#c-new').onclick = () => openCustomerForm();
  $('#c-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); render(); });
  render();
  const offs = [store.on('customers', render), store.on('debts', render)];
  return () => offs.forEach((o) => o());
}

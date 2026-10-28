// SanoGestion — Control de caja por turnos
import { store } from '../store.js';
import { requirePin } from '../auth.js';
import { openShift, closeShift, cashMovement } from '../ops.js';
import { esc, usd, bs, num, toast, openModal, emptyState, fmtDateTime, fmtTime, parseNum, setBusy, round2, methodLabel, PAY_METHODS } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';

const EXPENSE_CATS = ['Proveedores / mercancía', 'Servicios públicos', 'Alquiler', 'Sueldos', 'Transporte / flete', 'Alimentación', 'Mantenimiento', 'Retiro del dueño', 'Varios'];
const INCOME_CATS = ['Aporte de capital', 'Cambio / sencillo', 'Otros ingresos'];

const expected = (s) => ({
  usd: round2((s.openingUSD || 0) + (s.inUSD || 0) - (s.outUSD || 0)),
  bs: round2((s.openingBs || 0) + (s.inBs || 0) - (s.outBs || 0))
});

export function openShiftModal() {
  if (store.openShift) { toast('La caja ya está abierta', 'info'); return; }
  const m = openModal({
    title: 'Abrir caja', sub: 'Indica el efectivo con el que inicias el turno', size: 'sm',
    body: `<form class="stack" data-f>
      <div class="field"><label>Efectivo inicial en dólares</label><div class="input-group"><span class="prefix">$</span><input class="input input-lg" data-u inputmode="decimal" value="0" autofocus></div></div>
      <div class="field"><label>Efectivo inicial en bolívares</label><div class="input-group"><span class="prefix">Bs</span><input class="input input-lg" data-b inputmode="decimal" value="0"></div></div>
      <div class="field"><label>Nota (opcional)</label><input class="input" data-n placeholder="Ej.: turno mañana"></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('unlock')} Abrir turno</button>`
  });
  const save = async (e) => {
    e?.preventDefault();
    const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true);
    try {
      await openShift({ openingUSD: parseNum(m.el.querySelector('[data-u]').value), openingBs: parseNum(m.el.querySelector('[data-b]').value), note: m.el.querySelector('[data-n]').value.trim() });
      m.close(); toast('Caja abierta. ¡Buenas ventas!');
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
  m.el.querySelector('[data-f]').onsubmit = save;
  m.el.querySelector('[data-ok]').onclick = save;
}

function movementModal(direction) {
  if (!store.openShift) { toast('Abre la caja primero', 'warning'); return; }
  const cats = direction === 'out' ? EXPENSE_CATS : INCOME_CATS;
  const m = openModal({
    title: direction === 'out' ? 'Registrar gasto / retiro' : 'Registrar ingreso de efectivo', size: 'sm',
    body: `<form class="stack" data-f>
      <div class="field"><label>Concepto *</label><input class="input" data-c required autofocus placeholder="${direction === 'out' ? 'Ej.: pago a proveedor de hielo' : 'Ej.: sencillo para vuelto'}"></div>
      <div class="form-grid">
        <div class="field"><label>Moneda</label><select class="select" data-cur><option value="USD">Dólares ($)</option><option value="BS">Bolívares (Bs)</option></select></div>
        <div class="field"><label>Monto *</label><input class="input" data-a inputmode="decimal" placeholder="0,00"></div>
      </div>
      <div class="field"><label>Categoría</label><select class="select" data-cat>${cats.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Observación</label><input class="input" data-n></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn ${direction === 'out' ? 'btn-danger' : 'btn-success'}" data-ok>${icon('check')} Registrar</button>`
  });
  const q = (s) => m.el.querySelector(s);
  const save = async (e) => {
    e?.preventDefault();
    const concept = q('[data-c]').value.trim(); const amount = parseNum(q('[data-a]').value);
    if (!concept) { toast('Indica el concepto', 'warning'); return; }
    if (!(amount > 0)) { toast('Ingresa un monto válido', 'warning'); return; }
    const currency = q('[data-cur]').value;
    if (direction === 'out') {
      const exp = expected(store.openShift);
      const avail = currency === 'BS' ? exp.bs : exp.usd;
      if (amount > avail + 0.005) toast(`Atención: el monto supera el efectivo esperado en caja (${currency === 'BS' ? bs(avail) : usd(avail)})`, 'warning', 4000);
    }
    const btn = q('[data-ok]'); setBusy(btn, true);
    try {
      await cashMovement({ direction, currency, amount, concept, category: q('[data-cat]').value, note: q('[data-n]').value.trim() });
      m.close(); toast(direction === 'out' ? 'Gasto registrado' : 'Ingreso registrado');
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
  q('[data-f]').onsubmit = save;
  q('[data-ok]').onclick = save;
}

function closeModal(shift) {
  const exp = expected(shift);
  const m = openModal({
    title: 'Cierre de caja', sub: 'Cuenta el efectivo físico de cada moneda',
    body: `<form class="stack" data-f>
      <div class="cash-cols">
        <div class="cash-cur"><h4>Dólares</h4><div class="small muted">Esperado</div><div class="cash-expected">${usd(exp.usd)}</div>
          <div class="field mt"><label>Contado ($)</label><input class="input input-lg" data-u inputmode="decimal" value="${num(exp.usd)}"></div><div class="bold mt" data-du></div></div>
        <div class="cash-cur"><h4>Bolívares</h4><div class="small muted">Esperado</div><div class="cash-expected text-bs">${bs(exp.bs)}</div>
          <div class="field mt"><label>Contado (Bs)</label><input class="input input-lg" data-b inputmode="decimal" value="${num(exp.bs)}"></div><div class="bold mt" data-db></div></div>
      </div>
      <div class="field"><label>Notas del cierre</label><input class="input" data-n placeholder="Turno sin novedades"></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" data-ok>${icon('lock')} Cerrar caja</button>`
  });
  const q = (s) => m.el.querySelector(s);
  const diffTxt = (d, f) => Math.abs(d) < 0.005 ? '<span class="text-success">Cuadre exacto</span>' : d > 0 ? `<span class="text-warning">Sobrante: ${f(d)}</span>` : `<span class="text-danger">Faltante: ${f(-d)}</span>`;
  const upd = () => {
    q('[data-du]').innerHTML = diffTxt(parseNum(q('[data-u]').value) - exp.usd, usd);
    q('[data-db]').innerHTML = diffTxt(parseNum(q('[data-b]').value) - exp.bs, bs);
  };
  q('[data-u]').oninput = upd; q('[data-b]').oninput = upd; upd();
  const save = async (e) => {
    e?.preventDefault();
    if (!(await requirePin('Cerrar la caja'))) return;
    const btn = q('[data-ok]'); setBusy(btn, true);
    try {
      const data = { countedUSD: parseNum(q('[data-u]').value), countedBs: parseNum(q('[data-b]').value), note: q('[data-n]').value.trim() };
      await closeShift(shift, data);
      m.close();
      toast('Caja cerrada correctamente');
      const closed = { ...shift, ...data, status: 'closed', closedAt: new Date().toISOString(), expectedUSD: exp.usd, expectedBs: exp.bs, diffUSD: round2(data.countedUSD - exp.usd), diffBs: round2(data.countedBs - exp.bs), closeNote: data.note };
      const r = openModal({
        size: 'sm', title: 'Turno cerrado',
        body: `<p class="muted">¿Deseas imprimir el reporte de cierre del turno?</p>`,
        footer: `<button class="btn btn-secondary" data-close>Ahora no</button><button class="btn btn-primary" data-p>${icon('print')} Imprimir cierre</button>`
      });
      r.el.querySelector('[data-p]').onclick = () => { printShift(closed); r.close(); };
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
  q('[data-f]').onsubmit = save;
  q('[data-ok]').onclick = save;
}

async function printShift(s) {
  let movs = [];
  try { movs = await store.listWhere('cash_movements', 'shiftId', s.id, 'date', 500); } catch (_) {}
  const exp = expected(s);
  const byM = s.byMethod || {};
  printDoc(`Reporte de caja — Turno ${s.number || ''}`, `
    <p>Apertura: <b>${fmtDateTime(s.openedAt)}</b> ${s.closedAt ? `· Cierre: <b>${fmtDateTime(s.closedAt)}</b>` : '(abierto)'}</p>
    <div class="kpis">
      <div class="kpi">Ventas<b>${usd(s.salesTotal || 0)}</b>${s.salesCount || 0} ticket(s)</div>
      <div class="kpi">Abonos de fiados<b>${usd(s.paymentsTotal || 0)}</b></div>
      <div class="kpi">Gastos<b>${usd(s.expensesUSD || 0)}</b></div>
    </div>
    <h2>Efectivo</h2>
    <table><thead><tr><th></th><th class="r">Dólares</th><th class="r">Bolívares</th></tr></thead><tbody>
      <tr><td>Fondo inicial</td><td class="r">${usd(s.openingUSD)}</td><td class="r">${bs(s.openingBs)}</td></tr>
      <tr><td>Entradas</td><td class="r">${usd(s.inUSD)}</td><td class="r">${bs(s.inBs)}</td></tr>
      <tr><td>Salidas (vueltos, gastos)</td><td class="r">${usd(s.outUSD)}</td><td class="r">${bs(s.outBs)}</td></tr>
      <tr><td><b>Esperado</b></td><td class="r"><b>${usd(exp.usd)}</b></td><td class="r"><b>${bs(exp.bs)}</b></td></tr>
      ${s.status === 'closed' ? `<tr><td>Contado</td><td class="r">${usd(s.countedUSD)}</td><td class="r">${bs(s.countedBs)}</td></tr>
      <tr><td>Diferencia</td><td class="r">${usd(s.diffUSD)}</td><td class="r">${bs(s.diffBs)}</td></tr>` : ''}
    </tbody></table>
    <h2>Ventas por método de pago (equivalente $)</h2>
    <table><tbody>${Object.entries(byM).filter(([, v]) => v > 0.004).map(([k, v]) => `<tr><td>${esc(methodLabel(k))}</td><td class="r">${usd(v)}</td></tr>`).join('') || '<tr><td>Sin ventas</td></tr>'}</tbody></table>
    <h2>Movimientos</h2>
    <table><thead><tr><th>Hora</th><th>Concepto</th><th>Categoría</th><th class="r">Monto</th></tr></thead><tbody>
    ${movs.map((x) => `<tr><td>${fmtTime(x.date)}</td><td>${esc(x.concept)}</td><td>${esc(x.category || '')}</td><td class="r">${x.direction === 'out' ? '-' : '+'}${x.currency === 'BS' ? bs(x.amount) : usd(x.amount)}</td></tr>`).join('') || '<tr><td colspan="4">Sin movimientos en efectivo</td></tr>'}
    </tbody></table>
    ${s.closeNote ? `<p>Notas: ${esc(s.closeNote)}</p>` : ''}`);
}

export function mount(el) {
  let movs = [];
  let history = [];
  let loadedFor = null;

  const loadMovs = async () => {
    const s = store.openShift;
    if (!s) { movs = []; loadedFor = null; return; }
    try { movs = await store.listWhere('cash_movements', 'shiftId', s.id, 'date', 300); loadedFor = s.id; } catch (e) { console.warn(e); }
  };
  const loadHistory = async () => { try { history = await store.closedShifts(30); } catch (e) { console.warn(e); } };

  const render = () => {
    const s = store.openShift;
    let html = `<div class="view-header"><div><h1 class="view-title">Caja</h1><p class="view-sub">Turnos, efectivo en dólares y bolívares, gastos y arqueo</p></div>
      <div class="view-actions">${s ? `
        <button class="btn btn-secondary" id="k-in">${icon('arrowDown')} Ingreso</button>
        <button class="btn btn-secondary" id="k-out">${icon('arrowUp')} Gasto / retiro</button>
        <button class="btn btn-danger" id="k-close">${icon('lock')} Cerrar caja</button>` : `<button class="btn btn-primary" id="k-open">${icon('unlock')} Abrir caja</button>`}</div></div>`;
    if (!s) {
      html += `<div class="card center" style="padding:36px 20px">
        <span class="kpi-icon tone-info" style="width:60px;height:60px;margin:0 auto 12px;border-radius:16px">${icon('wallet')}</span>
        <h2 style="font-size:19px">La caja está cerrada</h2>
        <p class="muted mt" style="max-width:420px;margin-left:auto;margin-right:auto">Abre un turno indicando el efectivo inicial en dólares y bolívares para comenzar a vender.</p>
        <button class="btn btn-primary btn-lg mt-lg" id="k-open2">${icon('unlock')} Abrir caja del día</button></div>`;
    } else {
      const exp = expected(s);
      const byM = s.byMethod || {};
      const methods = Object.entries(byM).filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
      const maxM = Math.max(...methods.map(([, v]) => v), 1);
      html += `
      <div class="card mb" style="margin-bottom:16px"><div class="between">
        <div class="row"><span class="badge badge-success">${icon('check')} Turno abierto</span><span class="small muted">${esc(s.number || '')} · desde ${fmtDateTime(s.openedAt)}${s.note ? ' · ' + esc(s.note) : ''}</span></div>
        <button class="btn btn-ghost btn-sm" id="k-print">${icon('print')} Reporte parcial</button></div></div>
      <div class="grid grid-2">
        <div class="card" data-tour="cash">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('cash')}</span>Efectivo esperado en caja</div></div>
          <div class="cash-cols">
            <div class="cash-cur"><h4>Dólares</h4><div class="cash-expected">${usd(exp.usd)}</div>
              <div class="summary-row small"><span class="muted">Fondo inicial</span><b>${usd(s.openingUSD)}</b></div>
              <div class="summary-row small"><span class="muted">Entradas</span><b class="text-success">+${usd(s.inUSD)}</b></div>
              <div class="summary-row small"><span class="muted">Salidas</span><b class="text-danger">−${usd(s.outUSD)}</b></div></div>
            <div class="cash-cur"><h4>Bolívares</h4><div class="cash-expected text-bs">${bs(exp.bs)}</div>
              <div class="summary-row small"><span class="muted">Fondo inicial</span><b>${bs(s.openingBs)}</b></div>
              <div class="summary-row small"><span class="muted">Entradas</span><b class="text-success">+${bs(s.inBs)}</b></div>
              <div class="summary-row small"><span class="muted">Salidas</span><b class="text-danger">−${bs(s.outBs)}</b></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('receipt')}</span>Resumen del turno</div></div>
          <div class="grid grid-3" style="gap:10px">
            <div class="summary-box"><div class="label">Ventas</div><div class="bold num" style="font-size:18px">${usd(s.salesTotal || 0)}</div><div class="xs muted">${s.salesCount || 0} ticket(s)</div></div>
            <div class="summary-box"><div class="label">Abonos</div><div class="bold num" style="font-size:18px">${usd(s.paymentsTotal || 0)}</div><div class="xs muted">cobrados</div></div>
            <div class="summary-box"><div class="label">Gastos</div><div class="bold num text-danger" style="font-size:18px">${usd(s.expensesUSD || 0)}</div><div class="xs muted">equiv. $</div></div>
          </div>
          <div class="label mt">Ventas por método</div>
          ${methods.length ? methods.map(([k, v]) => `<div class="mt" style="margin-top:8px"><div class="between small"><span>${esc(methodLabel(k))}</span><b class="num">${usd(v)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${(v / maxM) * 100}%;background:${PAY_METHODS[k]?.color || 'var(--brand)'}"></div></div></div>`).join('') : '<p class="small muted mt">Aún no hay ventas en este turno.</p>'}
        </div>
      </div>
      <div class="card mt-lg">
        <div class="card-header"><div class="card-title"><span class="ico">${icon('layers')}</span>Movimientos de efectivo</div><span class="badge badge-neutral">${movs.length}</span></div>
        ${movs.length ? movs.map((x) => `<div class="mov">
          <span class="kpi-icon ${x.direction === 'out' ? 'tone-danger' : 'tone-success'}" style="width:32px;height:32px">${icon(x.direction === 'out' ? 'arrowUp' : 'arrowDown')}</span>
          <div style="min-width:0"><div class="bold ellipsis">${esc(x.concept)}</div><div class="small muted">${fmtTime(x.date)} · ${esc(x.category || '')}</div></div>
          <b class="num ${x.direction === 'out' ? 'text-danger' : 'text-success'}">${x.direction === 'out' ? '−' : '+'}${x.currency === 'BS' ? bs(x.amount) : usd(x.amount)}</b></div>`).join('') : emptyState('layers', 'Sin movimientos de efectivo', 'Las ventas en efectivo, vueltos y gastos aparecerán aquí.')}
      </div>`;
    }
    html += `<div class="card card-flush mt-lg"><div class="card-header" style="padding:16px 18px 0"><div class="card-title"><span class="ico">${icon('clock')}</span>Turnos anteriores</div></div>
      ${history.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Turno</th><th class="hide-sm">Apertura</th><th>Cierre</th><th class="r">Ventas</th><th class="r">Dif. $</th><th class="r">Dif. Bs</th><th></th></tr></thead><tbody>
      ${history.map((h) => `<tr><td class="t-name">${esc(h.number || h.id.slice(0, 6))}</td><td class="hide-sm">${fmtDateTime(h.openedAt)}</td><td>${fmtDateTime(h.closedAt)}</td><td class="r num">${usd(h.salesTotal || 0)}</td>
        <td class="r num ${Math.abs(h.diffUSD || 0) < 0.005 ? 'text-success' : (h.diffUSD > 0 ? 'text-warning' : 'text-danger')}">${usd(h.diffUSD || 0)}</td>
        <td class="r num ${Math.abs(h.diffBs || 0) < 0.005 ? 'text-success' : (h.diffBs > 0 ? 'text-warning' : 'text-danger')}">${bs(h.diffBs || 0)}</td>
        <td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-ph="${h.id}" title="Imprimir">${icon('print')}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div style="padding:0 18px 18px">${emptyState('clock', 'Sin turnos cerrados todavía')}</div>`}</div>`;
    el.innerHTML = html;
    const b = (id, fn) => { const x = el.querySelector(id); if (x) x.onclick = fn; };
    b('#k-open', openShiftModal); b('#k-open2', openShiftModal);
    b('#k-in', () => movementModal('in')); b('#k-out', () => movementModal('out'));
    b('#k-close', () => closeModal(store.openShift));
    b('#k-print', () => printShift(store.openShift));
    el.querySelectorAll('[data-ph]').forEach((x) => x.onclick = () => printShift(history.find((h) => h.id === x.dataset.ph)));
  };

  render();
  Promise.all([loadMovs(), loadHistory()]).then(render);
  const off = store.on('shift', async () => {
    const wasOpen = loadedFor;
    await loadMovs();
    if (!store.openShift || wasOpen !== store.openShift?.id) await loadHistory();
    render();
  });
  return () => off();
}

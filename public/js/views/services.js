// SanoGestion — Servicios: avances de efectivo y recargas telefónicas
import { store } from '../store.js';
import { processSale } from '../ops.js';
import { esc, usd, bs, num, toast, emptyState, fmtDateTime, parseNum, setBusy, round2, round4, PAY_METHODS, methodLabel, normalize, debounce, addDays, startOfDay, nowISO, isVE } from '../utils.js';
import { icon } from '../icons.js';
import { openRateModal } from '../shared.js';

const OPERATORS = { movistar: 'Movistar', digitel: 'Digitel', movilnet: 'Movilnet', cantv: 'CANTV', simple: 'SimpleTV', inter: 'Inter' };

export function mount(el) {
  let tab = 'adelanto';
  let history = [];
  let filter = 'all';
  let search = '';

  el.innerHTML = `
    <div class="view-header">
      <div><h1 class="view-title">Servicios</h1><p class="view-sub">Avances de efectivo y recargas, integrados a la caja y a los reportes</p></div>
    </div>
    <div class="grid grid-3" style="align-items:start">
      <div class="card">
        <div class="seg seg-block mb" id="s-tabs"><button data-t="adelanto" class="active">${icon('cash')} Avance de efectivo</button><button data-t="recarga">${icon('phone')} Recarga</button></div>
        <div id="s-form"></div>
      </div>
      <div class="card span-2">
        <div class="card-header"><div class="card-title"><span class="ico">${icon('clock')}</span>Historial (últimos 30 días)</div>
          <div class="seg" id="s-filter"><button data-f="all" class="active">Todos</button><button data-f="adelanto">Avances</button><button data-f="recarga">Recargas</button></div></div>
        <div class="kpis" id="s-kpis" style="margin-bottom:12px"></div>
        <label class="search mb">${icon('search')}<input id="s-search" placeholder="Buscar por cliente, teléfono u operadora…"></label>
        <div id="s-list" class="mt"></div>
      </div>
    </div>`;
  const $ = (s) => el.querySelector(s);

  function renderForm() {
    const s = store.settings;
    if (tab === 'adelanto') {
      $('#s-form').innerHTML = `<form class="stack" id="f-adv">
        <p class="small muted">El cliente paga con tarjeta o transferencia el monto más la comisión, y tú le entregas el efectivo${isVE() ? ' en bolívares' : ''} de la caja.</p>
        <div class="field"><label>Cliente (opcional)</label><input class="input" name="client" placeholder="Nombre del cliente"></div>
        <div class="field"><label>Efectivo a entregar (Bs) *</label><input class="input input-lg" name="amount" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label>Comisión (%)</label><input class="input" name="pct" inputmode="decimal" value="${num(s.advanceCommission, 1)}"></div>
        <div class="field"><label>El cliente paga con</label><select class="select" name="method">${['punto', 'pagomovil', 'transferencia', 'biopago'].map((k) => `<option value="${k}">${PAY_METHODS[k].label}</option>`).join('')}</select></div>
        <div class="summary-box"><div class="summary-row"><span class="muted">Comisión (tu ganancia)</span><b class="text-success" data-com>${bs(0)}</b></div><div class="summary-row total"><span>Total a cobrar</span><b data-tot>${bs(0)}</b></div></div>
        <div class="field"><label>Nota</label><input class="input" name="note" placeholder="Referencia de la operación"></div>
        <button class="btn btn-primary btn-lg btn-block">${icon('check')} Registrar avance</button>
      </form>`;
    } else {
      $('#s-form').innerHTML = `<form class="stack" id="f-rec">
        <div class="field"><label>Operadora</label><div class="op-pick">${Object.entries(OPERATORS).slice(0, 3).map(([k, v], i) => `<label><input type="radio" name="op" value="${k}" ${i === 0 ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
          <select class="select mt" name="opx"><option value="">Otra: elegir…</option>${Object.entries(OPERATORS).slice(3).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Número / contrato *</label><input class="input input-lg" name="phone" inputmode="tel" placeholder="0414-1234567"></div>
        <div class="field"><label>Monto de la recarga (Bs) *</label><input class="input input-lg" name="amount" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label>Comisión (%)</label><input class="input" name="pct" inputmode="decimal" value="${num(s.rechargeCommission, 1)}"></div>
        <div class="field"><label>El cliente paga con</label><select class="select" name="method">${['efectivo_bs', 'efectivo_usd', 'pagomovil', 'punto', 'transferencia', 'biopago'].map((k) => `<option value="${k}">${PAY_METHODS[k].label}</option>`).join('')}</select></div>
        <div class="summary-box"><div class="summary-row"><span class="muted">Comisión (tu ganancia)</span><b class="text-success" data-com>${bs(0)}</b></div><div class="summary-row total"><span>Total a cobrar</span><b data-tot>${bs(0)}</b></div><div class="small muted" data-usd></div></div>
        <button class="btn btn-primary btn-lg btn-block">${icon('check')} Registrar recarga</button>
      </form>`;
    }
    const f = el.querySelector('form#f-adv, form#f-rec');
    const F = f.elements;
    const calc = () => {
      const a = parseNum(F.amount.value); const c = round2(a * parseNum(F.pct.value) / 100);
      f.querySelector('[data-com]').textContent = bs(c);
      f.querySelector('[data-tot]').textContent = bs(a + c);
      const u = f.querySelector('[data-usd]');
      if (u) u.textContent = F.method.value === 'efectivo_usd' && store.rate > 0 ? `Equivale a ${usd((a + c) / store.rate)}` : '';
      return { a, c };
    };
    F.amount.oninput = calc; F.pct.oninput = calc; F.method.onchange = calc;
    if (F.opx) F.opx.onchange = () => { if (F.opx.value) f.querySelectorAll('[name=op]').forEach((r) => { r.checked = false; }); };
    f.querySelectorAll('[name=op]').forEach((r) => r.onchange = () => { if (F.opx) F.opx.value = ''; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const rate = store.rate;
      if (!(rate > 0)) { openRateModal(); return; }
      if (!store.openShift) { toast('Abre la caja para registrar servicios', 'warning'); return; }
      const { a, c } = calc();
      if (!(a > 0)) { toast('Ingresa un monto válido', 'warning'); F.amount.focus(); return; }
      const method = F.method.value;
      const totalBs = round2(a + c);
      const isAdv = tab === 'adelanto';
      let op = '', phone = '';
      if (!isAdv) {
        op = F.opx.value || f.querySelector('[name=op]:checked')?.value || 'movistar';
        phone = F.phone.value.trim();
        if (!phone) { toast('Indica el número o contrato', 'warning'); F.phone.focus(); return; }
      }
      if (isAdv) {
        const sh = store.openShift;
        const cashBs = (sh.openingBs || 0) + (sh.inBs || 0) - (sh.outBs || 0);
        if (a > cashBs + 0.005) toast(`Atención: la caja tiene ${bs(cashBs)} en efectivo según el sistema`, 'warning', 4000);
      }
      const btn = f.querySelector('button[type=submit], button:not([type])');
      setBusy(btn, true, 'Registrando…');
      try {
        const serviceId = store.newRef('services').id;
        const name = isAdv ? 'Avance de efectivo' : `Recarga ${OPERATORS[op] || op}`;
        const pay = PAY_METHODS[method].cur === 'BS' ? { method, currency: 'BS', amount: totalBs } : { method, currency: 'USD', amount: round2(totalBs / rate) };
        const record = {
          type: isAdv ? 'adelanto' : 'recarga', date: nowISO(), client: isAdv ? (F.client.value.trim() || 'Mostrador') : 'Mostrador',
          operator: op, phone, amountBs: a, commissionPct: parseNum(F.pct.value), commissionBs: c, totalBs, method, note: F.note ? F.note.value.trim() : ''
        };
        await processSale({
          type: 'service',
          items: [{ name: name + (phone ? ` · ${phone}` : ''), presentation: 'Servicio', multiplier: 1, qty: 1, price: round4(totalBs / rate), cost: round4(a / rate), exempt: true, category: 'Servicios' }],
          payments: [pay],
          customer: null,
          changeCurrency: isVE() ? 'BS' : 'USD',
          note: record.note,
          service: { serviceId, record },
          extraOut: isAdv ? { bs: a } : null
        });
        toast(isAdv ? `Avance registrado: entrega ${bs(a)} en efectivo` : `Recarga de ${bs(a)} registrada`);
        f.reset(); F.pct.value = num(record.commissionPct, 1); calc();
        const key = isAdv ? 'advanceCommission' : 'rechargeCommission';
        if (Number(store.settings[key]) !== record.commissionPct) store.saveSettings({ [key]: record.commissionPct });
        loadHistory();
      } catch (ex) { toast(ex.message, 'danger', 4500); }
      finally { setBusy(btn, false); }
    };
  }

  async function loadHistory() {
    try {
      const from = startOfDay(addDays(new Date(), -30)).toISOString();
      history = (await store.listBetween('services', from, new Date(Date.now() + 864e5).toISOString())).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (e) { console.warn(e); }
    renderList();
  }

  function renderList() {
    const act = history.filter((h) => h.status !== 'voided');
    const adv = act.filter((h) => h.type === 'adelanto');
    const rec = act.filter((h) => h.type === 'recarga');
    const com = act.reduce((a, h) => a + (h.commissionBs || 0), 0);
    $('#s-kpis').innerHTML = `
      <div class="summary-box"><div class="label">Comisiones ganadas</div><div class="bold text-success num" style="font-size:18px">${bs(com)}</div><div class="xs muted">${store.rate ? usd(com / store.rate) : ''}</div></div>
      <div class="summary-box"><div class="label">Avances</div><div class="bold num" style="font-size:18px">${adv.length}</div><div class="xs muted">${bs(adv.reduce((a, h) => a + (h.amountBs || 0), 0))} entregados</div></div>
      <div class="summary-box"><div class="label">Recargas</div><div class="bold num" style="font-size:18px">${rec.length}</div><div class="xs muted">${bs(rec.reduce((a, h) => a + (h.amountBs || 0), 0))} recargados</div></div>`;
    const q = normalize(search);
    let list = filter === 'all' ? history : history.filter((h) => h.type === filter);
    if (q) list = list.filter((h) => normalize(h.client).includes(q) || String(h.phone || '').includes(search.trim()) || normalize(OPERATORS[h.operator]).includes(q));
    $('#s-list').innerHTML = list.length ? `<div class="list">${list.map((h) => `
      <div class="list-item">
        <span class="kpi-icon ${h.type === 'adelanto' ? 'tone-info' : 'tone-violet'}">${icon(h.type === 'adelanto' ? 'cash' : 'phone')}</span>
        <div class="grow" style="min-width:0"><div class="bold">${h.type === 'adelanto' ? 'Avance de efectivo' : 'Recarga ' + esc(OPERATORS[h.operator] || h.operator)} ${h.status === 'voided' ? '<span class="badge badge-danger">Anulado</span>' : ''}</div>
          <div class="small muted ellipsis">${fmtDateTime(h.date)} · ${h.type === 'adelanto' ? esc(h.client) : esc(h.phone)} · ${esc(methodLabel(h.method))}</div></div>
        <div class="right"><b class="num">${bs(h.totalBs)}</b><div class="small text-success">+${bs(h.commissionBs)}</div></div>
      </div>`).join('')}</div>` : emptyState('phone', 'Sin servicios registrados', 'Los avances y recargas aparecerán aquí.');
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b)); renderForm(); });
  el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); renderList(); });
  $('#s-search').oninput = debounce((e) => { search = e.target.value; renderList(); }, 120);
  renderForm(); renderList(); loadHistory();
  return () => {};
}

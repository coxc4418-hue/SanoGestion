// SanoGestion — Componentes compartidos entre vistas
import { store } from './store.js';
import { openModal, toast, num, esc, parseNum, fmtDateTime, setBusy, usd, bs, methodLabel, qtyFmt, printHTML, fmtDate, todayKey, dayKey, isVE } from './utils.js';
import { icon } from './icons.js';

/** Obtiene la tasa oficial BCV desde un servicio público (si está disponible). */
export async function fetchBcvRate() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = Number(j.promedio || j.precio || j.venta);
    if (!(v > 0)) throw new Error('Respuesta inválida');
    return { rate: v, date: j.fechaActualizacion || null };
  } finally { clearTimeout(t); }
}

/** Trae la tasa oficial del BCV una vez al día (Venezuela) */
export async function autoUpdateRate() {
  if (!isVE()) return false;
  const s = store.settings;
  if (s.rateAuto === false) return false;
  if (s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey() && store.rate > 0) return false;
  try {
    const r = await fetchBcvRate();
    if (Math.abs(r.rate - store.rate) < 0.0001 && s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey()) return false;
    await store.setRate(Math.round(r.rate * 100) / 100, true);
    toast(`Tasa BCV del día actualizada: ${bs(r.rate)}`, 'info', 4000);
    return true;
  } catch (_) { return false; }
}

export function openRateModal() {
  if (!isVE()) { import('./country.js').then((m) => m.openCountryPicker()); return; }
  const s = store.settings;
  const m = openModal({
    title: 'Tasa de cambio del día',
    sub: s.rateUpdatedAt ? `Última actualización: ${fmtDateTime(s.rateUpdatedAt)}` : 'Configura la tasa para calcular precios en bolívares',
    size: 'sm',
    body: `
      <form class="stack" data-f>
        <div class="field">
          <label>Tasa BCV (Bs por 1 $)</label>
          <input class="input input-lg" data-rate inputmode="decimal" value="${s.rate ? num(s.rate) : ''}" placeholder="0,00" autofocus>
        </div>
        <button type="button" class="btn btn-secondary btn-block" data-auto>${icon('refresh')} Consultar tasa BCV automáticamente</button>
        <div class="hint" data-hint>La tasa se aplica a todos los precios en Bs, al carrito y a los reportes.</div>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar tasa</button>`
  });
  const input = m.el.querySelector('[data-rate]');
  const hint = m.el.querySelector('[data-hint]');
  m.el.querySelector('[data-auto]').onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Consultando…');
    try {
      const r = await fetchBcvRate();
      input.value = num(r.rate);
      hint.textContent = `Tasa oficial obtenida${r.date ? ' (' + fmtDateTime(r.date) + ')' : ''}. Pulsa “Guardar tasa” para aplicarla.`;
    } catch (_) {
      hint.textContent = 'No se pudo consultar la tasa automáticamente. Ingrésala manualmente.';
    } finally { setBusy(btn, false); }
  };
  const save = async (e) => {
    e?.preventDefault();
    const v = parseNum(input.value);
    if (!(v > 0)) { toast('Ingresa una tasa válida', 'warning'); input.focus(); return; }
    await store.setRate(v);
    toast(`Tasa actualizada: ${bs(v)} por $1`);
    m.close();
  };
  m.el.querySelector('[data-f]').onsubmit = save;
  m.el.querySelector('[data-save]').onclick = save;
}

// ---------- Recibo de venta ----------
export function receiptHTML(sale) {
  const s = store.settings;
  const fmt = s.receiptFormat || '80mm';
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  const rate = sale.rate || 0;
  const items = (sale.items || []).map((it) => `
    <tr><td colspan="3" style="padding-top:3px">${esc(it.name)}${it.presentation && it.presentation !== 'Unidad' ? ' (' + esc(it.presentation) + ')' : ''}</td></tr>
    <tr><td>${qtyFmt(it.qty)} x ${num(it.price)}</td><td></td><td style="text-align:right">${usd(it.total)}</td></tr>`).join('');
  const taxable = (sale.items || []).filter((i) => !i.exempt).reduce((a, i) => a + (i.total || 0), 0) * (sale.total / (sale.subtotal || sale.total || 1));
  const ivaPct = Number(s.iva) || 0;
  const ivaBs = ivaPct > 0 ? (taxable - taxable / (1 + ivaPct / 100)) * rate : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td>${esc(methodLabel(p.method))}</td><td></td><td style="text-align:right">${p.currency === 'BS' ? bs(p.amount) : usd(p.amount)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recibo ${esc(sale.number)}</title>
  <style>
    @page { margin: ${fmt === 'carta' ? '14mm' : '2mm'}; }
    body { font-family: 'Courier New', monospace; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; }
    .big { font-size: 1.25em; font-weight: bold; }
  </style></head><body>
    <div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">RIF: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}
    <div class="hr"></div>
    <div>Ticket: <b>${esc(sale.number)}</b></div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Cliente: ${esc(sale.customerName || 'Mostrador')}</div>
    ${sale.status === 'voided' ? '<div class="c b">*** VENTA ANULADA ***</div>' : ''}
    <div class="hr"></div>
    <table>${items}</table>
    <div class="hr"></div>
    <table>
      <tr><td>Subtotal</td><td></td><td style="text-align:right">${usd(sale.subtotal)}</td></tr>
      ${sale.discount > 0 ? `<tr><td>Descuento</td><td></td><td style="text-align:right">-${usd(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td>TOTAL $</td><td></td><td style="text-align:right">${usd(sale.total)}</td></tr>
      ${isVE() ? `<tr class="big"><td>TOTAL Bs</td><td></td><td style="text-align:right">${num(sale.totalBs)}</td></tr>` : ''}
      ${isVE() ? `<tr><td colspan="3">Tasa BCV: ${bs(rate)} / $</td></tr>` : ''}
      ${ivaBs > 0.009 ? `<tr><td colspan="2">IVA ${num(ivaPct, 0)}% incluido</td><td style="text-align:right">${bs(ivaBs)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${sale.changeCurrency === 'BS' ? bs(sale.changeUSD * rate) : usd(sale.changeUSD)}</div>` : ''}
    ${sale.creditUSD > 0.009 ? `<div class="b">Saldo a crédito: ${usd(sale.creditUSD)}</div>` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por su compra!')}</div>
    <div class="c" style="font-size:.85em;margin-top:4px">SanoGestion</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

/** Documento imprimible genérico (reportes, estados de cuenta, cierres) */
export function printDoc(title, inner) {
  printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #0f766e; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">SanoGestion — Sistema de gestión para tiendas</p>
  </body></html>`);
}

export function moneyPair(usdVal, rate = store.rate) {
  return `<b class="num">${usd(usdVal)}</b><span class="small text-bs num" style="display:block">${bs(usdVal * rate)}</span>`;
}

export function debtStatus(debt) {
  const today = todayKey();
  if (debt.balance <= 0.004) return 'paid';
  return debt.dueDate && debt.dueDate < today ? 'overdue' : 'open';
}

export { fmtDate };

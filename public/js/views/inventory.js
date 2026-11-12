// SanoGestion — Inventario
import { store, UNITS } from '../store.js';
import { requirePin } from '../auth.js';
import { adjustStock } from '../ops.js';
import {
  esc, usd, bs, num, normalize, toast, openModal, confirmDialog, emptyState, initials, fmtDateTime,
  parseNum, debounce, setBusy, round2, round4, nowISO, qtyFmt, download, toCSV, parseCSV, compressImage, todayKey, isVE, loc } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';

const PAGE = 25;

// ---------- Formulario de producto ----------
export function openProductForm(product = null) {
  const p = product || {};
  const rate = store.rate || 0;
  const cats = store.settings.categories;
  const prices = p.prices || [p.price || 0, 0, 0];
  const margins = p.margins || [null, null, null];
  const m = openModal({
    title: product ? 'Editar producto' : 'Nuevo producto', size: 'lg',
    body: `<form class="stack" data-f autocomplete="off">
      <div class="form-grid">
        <div class="field full"><label>Nombre del producto *</label><input class="input" name="name" value="${esc(p.name)}" required autofocus placeholder="Ej.: Harina PAN 1 kg"></div>
        <div class="field"><label>Código de barras / SKU</label>
          <div class="row"><input class="input" name="barcode" value="${esc(p.barcode || '')}" placeholder="Escanea o escribe"><button type="button" class="btn btn-secondary btn-icon" data-gen title="Generar código">${icon('barcode')}</button></div></div>
        <div class="field"><label>Categoría</label>
          <div class="row"><select class="select" name="category">${[...new Set([...cats, p.category].filter(Boolean))].map((c) => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <button type="button" class="btn btn-secondary btn-icon" data-cats title="Administrar categorías">${icon('settings')}</button></div></div>
        <div class="field"><label>Se vende por</label><select class="select" name="unit">${UNITS.map((u) => `<option ${u === (p.unit || 'Unidad') ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="field"><label>Proveedor</label><input class="input" name="provider" value="${esc(p.provider)}" placeholder="Opcional"></div>
      </div>

      <div class="card" style="background:var(--surface-2);box-shadow:none">
        <div class="between mb"><b>Costo</b>
          <div class="seg" data-cm><button type="button" data-v="unit">Por unidad</button><button type="button" data-v="bulk">Por bulto</button></div></div>
        <div class="form-grid">
          <div class="field bs-only"><label>Moneda del costo</label><select class="select" name="costCur"><option value="USD">Dólares ($)</option><option value="BS">Bolívares (Bs)</option></select></div>
          <div class="field" data-unitcost><label>Costo por unidad</label><input class="input" name="cost" inputmode="decimal" value="${p.cost ? num(p.cost, 4).replace(/0+$/, '').replace(/,$/, '') : ''}" placeholder="0,00"></div>
          <div class="field" data-bulkcost hidden><label>Costo del bulto</label><input class="input" name="bulkCost" inputmode="decimal" value="${p.bulkCost ? num(p.bulkCost) : ''}" placeholder="0,00"></div>
          <div class="field" data-bulkqty hidden><label>Unidades por bulto</label><input class="input" name="bulkQtyCost" inputmode="decimal" value="${p.bulkQty || ''}" placeholder="Ej.: 24"></div>
        </div>
        <div class="hint mt" data-costinfo></div>
      </div>

      <div class="card" style="background:var(--surface-2);box-shadow:none">
        <div class="between mb"><b>Precios de venta</b>
          <select class="select bs-only" name="priceCur" style="width:auto"><option value="USD">Precios en $</option><option value="BS">Precios en Bs</option></select></div>
        <div class="tier-grid">
          <span></span><span class="label">% ganancia</span><span class="label">Precio final</span>
          ${[0, 1, 2].map((i) => `<span class="label">${i === 0 ? 'Precio 1 *' : 'Precio ' + (i + 1)}</span>
            <input class="input" data-mg="${i}" inputmode="decimal" placeholder="%" value="${margins[i] != null && margins[i] !== '' ? num(margins[i], 1) : ''}">
            <input class="input" data-pr="${i}" inputmode="decimal" placeholder="${i === 0 ? '0,00' : 'Opcional'}" value="${prices[i] ? num(prices[i]) : ''}">`).join('')}
        </div>
        <div class="hint mt" data-priceinfo></div>
      </div>

      <div class="form-grid">
        ${product ? `<div class="field"><label>Stock actual</label><div class="input" style="display:flex;align-items:center;background:var(--surface-3)">${qtyFmt(p.stock)} ${esc(p.unit || '')}</div><span class="hint">Usa “Ajustar stock” para entradas, mermas o conteos.</span></div>`
          : `<div class="field"><label>Stock inicial</label><input class="input" name="stock" inputmode="decimal" value="0"></div>`}
        <div class="field"><label>Stock mínimo (alerta)</label><input class="input" name="minStock" inputmode="decimal" value="${p.minStock ?? store.settings.lowStock}"></div>
        <div class="field"><label>Venta por bulto: unidades</label><input class="input" name="bulkQty" inputmode="decimal" value="${p.bulkQty || ''}" placeholder="Opcional (ej. 12)"></div>
        <div class="field"><label>Precio del bulto ($)</label><input class="input" name="bulkPrice" inputmode="decimal" value="${p.bulkPrice ? num(p.bulkPrice) : ''}" placeholder="Opcional"></div>
        <div class="field"><label>Imagen</label><div class="row"><div class="img-preview" data-imgp>${p.image ? `<img src="${p.image}" alt="">` : 'Sin foto'}</div>
          <div class="stack-sm"><input type="file" accept="image/*" data-img hidden><button type="button" class="btn btn-secondary btn-sm" data-imgbtn>${icon('upload')} Subir foto</button>
          <button type="button" class="btn btn-ghost btn-sm" data-imgrm ${p.image ? '' : 'hidden'}>Quitar</button></div></div></div>
        <div class="field" style="justify-content:center"><label class="check"><input type="checkbox" name="exempt" ${p.exempt === false ? '' : 'checked'}> Exento de IVA</label>
          <label class="check"><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}> Disponible para la venta</label></div>
      </div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${product ? 'Guardar cambios' : 'Crear producto'}</button>`
  });
  const f = m.el.querySelector('[data-f]');
  const F = f.elements;
  const q = (s) => m.el.querySelector(s);
  let costMode = p.costMode === 'bulk' ? 'bulk' : 'unit';
  let image = p.image || null;

  const unitCostUSD = () => {
    const cur = F.costCur.value;
    let c = costMode === 'unit' ? parseNum(F.cost.value) : (parseNum(F.bulkQtyCost.value) > 0 ? parseNum(F.bulkCost.value) / parseNum(F.bulkQtyCost.value) : 0);
    if (cur === 'BS') c = rate > 0 ? c / rate : 0;
    return c;
  };
  const toUSD = (v) => F.priceCur.value === 'BS' ? (rate > 0 ? v / rate : 0) : v;
  const fromUSD = (v) => F.priceCur.value === 'BS' ? v * rate : v;
  const setMode = (mode) => {
    costMode = mode;
    m.el.querySelectorAll('[data-cm] button').forEach((b) => b.classList.toggle('active', b.dataset.v === mode));
    q('[data-unitcost]').hidden = mode !== 'unit';
    q('[data-bulkcost]').hidden = mode !== 'bulk';
    q('[data-bulkqty]').hidden = mode !== 'bulk';
    recalcFromMargins(); info();
  };
  const info = () => {
    const c = unitCostUSD();
    q('[data-costinfo]').textContent = c > 0 ? `Costo unitario: ${usd(c)}${rate ? ' · ' + bs(c * rate) : ''}` : '';
    const p1 = toUSD(parseNum(q('[data-pr="0"]').value));
    q('[data-priceinfo]').textContent = p1 > 0 ? `Precio 1: ${usd(p1)}${rate ? ' · ' + bs(p1 * rate) : ''}${c > 0 ? ` · Ganancia por unidad: ${usd(p1 - c)}` : ''}` : '';
  };
  const recalcFromMargins = () => {
    const c = unitCostUSD();
    [0, 1, 2].forEach((i) => {
      const mg = q(`[data-mg="${i}"]`).value.trim();
      if (mg !== '' && c > 0) q(`[data-pr="${i}"]`).value = num(fromUSD(c * (1 + parseNum(mg) / 100)));
    });
  };
  [0, 1, 2].forEach((i) => {
    q(`[data-mg="${i}"]`).oninput = () => { const c = unitCostUSD(); const mg = q(`[data-mg="${i}"]`).value.trim(); if (mg !== '' && c > 0) q(`[data-pr="${i}"]`).value = num(fromUSD(c * (1 + parseNum(mg) / 100))); info(); };
    q(`[data-pr="${i}"]`).oninput = () => { const c = unitCostUSD(); const pr = toUSD(parseNum(q(`[data-pr="${i}"]`).value)); q(`[data-mg="${i}"]`).value = c > 0 && pr > 0 ? num(((pr - c) / c) * 100, 1) : ''; info(); };
  });
  [F.cost, F.bulkCost, F.bulkQtyCost].forEach((x) => x.oninput = () => { recalcFromMargins(); info(); });
  F.costCur.onchange = () => { recalcFromMargins(); info(); };
  F.priceCur.onchange = () => {
    // Convierte los precios mostrados a la nueva moneda
    const was = F.priceCur.value === 'BS' ? 'USD' : 'BS';
    [0, 1, 2].forEach((i) => { const inp = q(`[data-pr="${i}"]`); const v = parseNum(inp.value); if (v > 0 && rate > 0) inp.value = num(was === 'USD' ? v * rate : v / rate); });
    info();
  };
  m.el.querySelectorAll('[data-cm] button').forEach((b) => b.onclick = () => setMode(b.dataset.v));
  q('[data-gen]').onclick = () => { F.barcode.value = '20' + Date.now().toString().slice(-9) + Math.floor(Math.random() * 10); };
  q('[data-cats]').onclick = () => openCategories((cat) => {
    F.category.innerHTML = store.settings.categories.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  });
  q('[data-imgbtn]').onclick = () => q('[data-img]').click();
  q('[data-img]').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { image = await compressImage(file, 320); q('[data-imgp]').innerHTML = `<img src="${image}" alt="">`; q('[data-imgrm]').hidden = false; }
    catch (_) { toast('No se pudo procesar la imagen', 'danger'); }
  };
  q('[data-imgrm]').onclick = () => { image = null; q('[data-imgp]').textContent = 'Sin foto'; q('[data-imgrm]').hidden = true; };
  if (costMode === 'bulk') { F.bulkQtyCost.value = p.bulkQty || ''; }
  setMode(costMode);

  const save = async (e) => {
    e?.preventDefault();
    const name = F.name.value.trim();
    if (!name) { toast('El nombre es obligatorio', 'warning'); F.name.focus(); return; }
    if (F.priceCur.value === 'BS' || F.costCur.value === 'BS') if (!(rate > 0)) { toast('Configura la tasa del día para usar montos en Bs', 'warning'); return; }
    const cost = round4(unitCostUSD());
    const pr = [0, 1, 2].map((i) => round4(toUSD(parseNum(q(`[data-pr="${i}"]`).value))));
    if (!(pr[0] > 0)) { toast('El precio 1 debe ser mayor a cero', 'warning'); q('[data-pr="0"]').focus(); return; }
    if (cost > 0 && pr[0] < cost && !(await confirmDialog({ title: 'Precio por debajo del costo', message: `El precio (${usd(pr[0])}) es menor que el costo (${usd(cost)}). ¿Guardar de todos modos?`, confirmText: 'Guardar' }))) return;
    const barcode = F.barcode.value.trim();
    if (barcode) {
      const dup = store.products.find((x) => x.id !== p.id && String(x.barcode || '') === barcode);
      if (dup) { toast(`El código ${barcode} ya está asignado a "${dup.name}"`, 'warning', 4000); return; }
    }
    const mg = [0, 1, 2].map((i) => { const v = q(`[data-mg="${i}"]`).value.trim(); return v === '' ? null : round2(parseNum(v)); });
    const bulkQty = parseNum(F.bulkQty.value) || (costMode === 'bulk' ? parseNum(F.bulkQtyCost.value) : 0) || 0;
    const data = {
      name, barcode, code: barcode || p.code || '',
      category: F.category.value, unit: F.unit.value, provider: F.provider.value.trim(),
      costMode, cost, bulkCost: costMode === 'bulk' ? round2(parseNum(F.bulkCost.value) / (F.costCur.value === 'BS' && rate ? rate : 1)) : (p.bulkCost || 0),
      prices: pr, margins: mg, price: pr[0],
      bulkQty, bulkPrice: round2(parseNum(F.bulkPrice.value)),
      minStock: parseNum(F.minStock.value), exempt: F.exempt.checked, active: F.active.checked,
      image: image || null, updatedAt: nowISO()
    };
    const btn = q('[data-ok]'); setBusy(btn, true, 'Guardando…');
    try {
      if (product) {
        await store.save('products', p.id, data, true);
        toast('Producto actualizado');
      } else {
        const ref = store.newRef('products');
        const stock = parseNum(F.stock.value);
        const b = store.batch();
        b.set(ref, { ...data, stock, createdAt: nowISO() });
        if (stock) b.set(store.newRef('inventory_logs'), { productId: ref.id, productName: name, date: nowISO(), type: 'inicial', qty: stock, reason: 'Stock inicial', by: '' });
        await store.commit(b);
        toast(`"${name}" agregado al inventario`);
      }
      m.close();
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
  f.onsubmit = save;
  q('[data-ok]').onclick = save;
}

export function openCategories(onPick) {
  const render = () => store.settings.categories.map((c, i) => `
    <div class="list-item"><span class="grow bold">${esc(c)}</span>
      <span class="small muted">${store.products.filter((p) => p.category === c).length} prod.</span>
      <button class="btn btn-ghost btn-icon btn-sm" data-ren="${i}">${icon('edit')}</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-del="${i}">${icon('trash')}</button></div>`).join('');
  const m = openModal({
    title: 'Categorías', sub: 'Organiza tu catálogo',
    body: `<form class="row mb" data-f><input class="input" data-n placeholder="Nueva categoría" autofocus><button class="btn btn-primary" data-add>${icon('plus')} Agregar</button></form><div class="list" data-l>${render()}</div>`,
    footer: `<button class="btn btn-primary" data-close>Listo</button>`
  });
  const bind = () => {
    m.el.querySelector('[data-l]').innerHTML = render();
    m.el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const list = [...store.settings.categories]; const c = list[+b.dataset.del];
      if (store.products.some((p) => p.category === c)) { toast('Hay productos en esta categoría; muévelos antes de eliminarla.', 'warning'); return; }
      list.splice(+b.dataset.del, 1); await store.saveSettings({ categories: list }); bind();
    });
    m.el.querySelectorAll('[data-ren]').forEach((b) => b.onclick = async () => {
      const list = [...store.settings.categories]; const old = list[+b.dataset.ren];
      const { promptDialog } = await import('../utils.js');
      const nv = (await promptDialog({ title: 'Renombrar categoría', label: 'Nombre', value: old }))?.trim();
      if (!nv || nv === old) return;
      list[+b.dataset.ren] = nv;
      await store.saveSettings({ categories: list });
      const affected = store.products.filter((p) => p.category === old);
      if (affected.length) { const bt = store.batch(); affected.forEach((p) => bt.update(store.ref('products', p.id), { category: nv })); await store.commit(bt); }
      bind();
    });
  };
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const inp = m.el.querySelector('[data-n]'); const v = inp.value.trim();
    if (!v) return;
    if (store.settings.categories.some((c) => normalize(c) === normalize(v))) { toast('Esa categoría ya existe', 'warning'); return; }
    await store.saveSettings({ categories: [...store.settings.categories, v].sort((a, b) => a.localeCompare(b, 'es')) });
    inp.value = ''; bind(); onPick && onPick(v);
  };
  bind();
}

export function openAdjust(product) {
  const p = store.product(product.id) || product;
  const m = openModal({
    title: 'Ajustar stock', sub: `${esc(p.name)} · Stock actual: ${qtyFmt(p.stock)} ${esc(p.unit || '')}`, size: 'sm',
    body: `<form class="stack" data-f>
      <div class="seg seg-block" data-mode><button type="button" data-v="add" class="active">+ Entrada</button><button type="button" data-v="subtract">− Salida</button><button type="button" data-v="set">= Conteo</button></div>
      <div class="field"><label data-ql>Cantidad que entra</label><input class="input input-lg" data-q inputmode="decimal" autofocus placeholder="0"></div>
      <div class="field" data-costw><label>Nuevo costo unitario ($) <span class="faint">(opcional)</span></label><input class="input" data-c inputmode="decimal" placeholder="${p.cost ? num(p.cost) : '0,00'}"></div>
      <div class="field"><label>Motivo</label><select class="select" data-r></select></div>
      <div class="field"><label>Detalle</label><input class="input" data-d placeholder="Opcional"></div>
      <div class="hint" data-res></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Aplicar ajuste</button>`
  });
  const q = (s) => m.el.querySelector(s);
  const reasons = { add: ['Compra a proveedor', 'Devolución de cliente', 'Otro'], subtract: ['Merma / vencido', 'Daño / rotura', 'Consumo interno', 'Robo / pérdida', 'Otro'], set: ['Conteo físico', 'Corrección'] };
  let mode = 'add';
  const upd = () => {
    q('[data-ql]').textContent = mode === 'add' ? 'Cantidad que entra' : mode === 'subtract' ? 'Cantidad que sale' : 'Cantidad real contada';
    q('[data-costw]').hidden = mode !== 'add';
    q('[data-r]').innerHTML = reasons[mode].map((r) => `<option>${r}</option>`).join('');
    const v = parseNum(q('[data-q]').value); const cur = Number(p.stock) || 0;
    const res = mode === 'add' ? cur + v : mode === 'subtract' ? cur - v : v;
    q('[data-res]').textContent = q('[data-q]').value ? `Stock resultante: ${qtyFmt(round4(res))} ${p.unit || ''}` : '';
  };
  m.el.querySelectorAll('[data-mode] button').forEach((b) => b.onclick = () => { mode = b.dataset.v; m.el.querySelectorAll('[data-mode] button').forEach((x) => x.classList.toggle('active', x === b)); upd(); });
  q('[data-q]').oninput = upd;
  upd();
  const save = async (e) => {
    e?.preventDefault();
    const v = parseNum(q('[data-q]').value);
    if (!(v > 0) && !(mode === 'set' && q('[data-q]').value.trim() !== '')) { toast('Ingresa una cantidad válida', 'warning'); return; }
    if (mode !== 'add' && !(await requirePin('Descontar o corregir inventario'))) return;
    const btn = q('[data-ok]'); setBusy(btn, true);
    try {
      const reason = q('[data-r]').value + (q('[data-d]').value.trim() ? ` — ${q('[data-d]').value.trim()}` : '');
      const c = parseNum(q('[data-c]').value);
      await adjustStock(p, mode, v, reason, mode === 'add' && c > 0 ? c : null);
      m.close(); toast('Inventario actualizado');
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
  q('[data-f]').onsubmit = save;
  q('[data-ok]').onclick = save;
}

async function openDetail(id) {
  const p = store.product(id);
  if (!p) return;
  const rate = store.rate;
  const m = openModal({
    title: esc(p.name), sub: `${esc(p.category || 'General')}${p.barcode ? ' · ' + esc(p.barcode) : ''}`, size: 'lg',
    body: `
      <div class="row" style="gap:16px;align-items:flex-start">
        ${p.image ? `<img src="${p.image}" alt="" style="width:96px;height:96px;border-radius:14px;object-fit:cover">` : ''}
        <div class="grid grid-4 grow" style="gap:10px">
          <div class="summary-box"><div class="label">Stock</div><div class="bold" style="font-size:18px">${qtyFmt(p.stock)}</div><div class="xs muted">${esc(p.unit || '')} · mín. ${qtyFmt(p.minStock ?? store.settings.lowStock)}</div></div>
          <div class="summary-box"><div class="label">Costo</div><div class="bold" style="font-size:18px">${usd(p.cost || 0)}</div><div class="xs text-bs">${bs((p.cost || 0) * rate)}</div></div>
          <div class="summary-box"><div class="label">Precio 1</div><div class="bold" style="font-size:18px">${usd(p.price)}</div><div class="xs text-bs">${bs(p.price * rate)}</div></div>
          <div class="summary-box"><div class="label">Margen</div><div class="bold text-success" style="font-size:18px">${p.cost > 0 ? num(((p.price - p.cost) / p.cost) * 100, 1) + '%' : '—'}</div><div class="xs muted">${p.cost > 0 ? usd(p.price - p.cost) + ' por unidad' : ''}</div></div>
        </div>
      </div>
      <div class="small muted mt">${(p.prices || []).slice(1).filter((x) => x > 0).map((x, i) => `Precio ${i + 2}: ${usd(x)}`).join(' · ')}${p.bulkQty > 1 && p.bulkPrice > 0 ? ` · Bulto x${qtyFmt(p.bulkQty)}: ${usd(p.bulkPrice)}` : ''}${p.provider ? ` · Proveedor: ${esc(p.provider)}` : ''}</div>
      <div class="row-wrap mt">
        <button class="btn btn-primary btn-sm" data-adj>${icon('layers')} Ajustar stock</button>
        <button class="btn btn-secondary btn-sm" data-edit>${icon('edit')} Editar</button>
      </div>
      <h4 class="mt-lg mb">Movimientos de inventario</h4>
      <div data-logs><div class="spinner" style="margin:10px auto"></div></div>`
  });
  m.el.querySelector('[data-adj]').onclick = () => { m.close(); openAdjust(p); };
  m.el.querySelector('[data-edit]').onclick = () => { m.close(); openProductForm(p); };
  let logs = [];
  try { logs = await store.listWhere('inventory_logs', 'productId', p.id, 'date', 40); } catch (e) { console.warn(e); }
  const box = m.el.querySelector('[data-logs]');
  const types = { venta: 'Venta', anulacion: 'Anulación', entrada: 'Entrada', salida: 'Salida', conteo: 'Conteo', inicial: 'Inicial', importacion: 'Importación' };
  if (box) box.innerHTML = logs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th class="r">Cantidad</th></tr></thead><tbody>
    ${logs.map((l) => `<tr><td class="nowrap">${fmtDateTime(l.date)}</td><td><span class="badge ${l.qty >= 0 ? 'badge-success' : 'badge-neutral'}">${types[l.type] || esc(l.type)}</span></td><td class="small">${esc(l.reason || '')}</td><td class="r num ${l.qty >= 0 ? 'text-success' : ''}">${l.qty > 0 ? '+' : ''}${qtyFmt(l.qty)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="small muted">Sin movimientos registrados.</p>';
}

function openImport() {
  const m = openModal({
    title: 'Importar productos (CSV)', size: 'lg',
    body: `<div class="stack">
      <p class="muted">Sube un archivo CSV (puedes crearlo en Excel con “Guardar como → CSV”). Columnas reconocidas:</p>
      <div class="summary-box small mono">nombre; codigo; categoria; costo; precio; precio2; precio3; stock; minimo; unidad; proveedor</div>
      <p class="small muted">Costos y precios en ${isVE() ? 'dólares' : esc(loc().curName.toLowerCase())}. Si el código ya existe en tu inventario, el producto se actualiza (el stock del archivo se suma al actual).</p>
      <div class="row-wrap"><button class="btn btn-secondary" data-tpl>${icon('download')} Descargar plantilla</button>
        <input type="file" accept=".csv,text/csv" data-file hidden><button class="btn btn-primary" data-pick>${icon('upload')} Elegir archivo</button></div>
      <div data-prev></div>
    </div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('check')} Importar</button>`
  });
  const q = (s) => m.el.querySelector(s);
  let rows = [];
  q('[data-tpl]').onclick = () => download('plantilla_productos_sanogestion.csv', toCSV([
    ['nombre', 'codigo', 'categoria', 'costo', 'precio', 'precio2', 'precio3', 'stock', 'minimo', 'unidad', 'proveedor'],
    ['Harina PAN 1kg', '7591002100015', 'Víveres', '0,85', '1,10', '1,05', '', '24', '6', 'Unidad', 'Distribuidora X'],
    ['Refresco 2L', '', 'Bebidas', '1,40', '2,00', '', '', '12', '4', 'Unidad', '']
  ]), 'text/csv;charset=utf-8');
  q('[data-pick]').onclick = () => q('[data-file]').click();
  q('[data-file]').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const data = parseCSV(text);
    if (data.length < 2) { toast('El archivo no tiene filas', 'warning'); return; }
    const head = data[0].map((h) => normalize(h).replace(/[^a-z0-9]/g, ''));
    const idx = (...names) => head.findIndex((h) => names.includes(h));
    const ix = { name: idx('nombre', 'producto', 'name'), code: idx('codigo', 'codigodebarras', 'barcode', 'sku'), cat: idx('categoria', 'category'), cost: idx('costo', 'cost'), price: idx('precio', 'precio1', 'price', 'pvp'), p2: idx('precio2'), p3: idx('precio3'), stock: idx('stock', 'existencia', 'cantidad'), min: idx('minimo', 'stockminimo', 'min'), unit: idx('unidad', 'unit'), prov: idx('proveedor', 'provider') };
    if (ix.name < 0 || ix.price < 0) { toast('El archivo debe tener al menos las columnas "nombre" y "precio"', 'danger', 4500); return; }
    const g = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
    rows = data.slice(1).map((r) => ({
      name: g(r, ix.name), barcode: g(r, ix.code), category: g(r, ix.cat) || 'Varios', cost: parseNum(g(r, ix.cost)), price: parseNum(g(r, ix.price)),
      p2: parseNum(g(r, ix.p2)), p3: parseNum(g(r, ix.p3)), stock: parseNum(g(r, ix.stock)), minStock: g(r, ix.min) ? parseNum(g(r, ix.min)) : store.settings.lowStock,
      unit: UNITS.find((u) => normalize(u) === normalize(g(r, ix.unit))) || 'Unidad', provider: g(r, ix.prov)
    })).filter((r) => r.name && r.price > 0);
    q('[data-prev]').innerHTML = `<p class="bold">${rows.length} producto(s) válidos encontrados</p>
      <div class="table-wrap" style="max-height:260px"><table class="table"><thead><tr><th>Nombre</th><th>Código</th><th>Categoría</th><th class="r">Costo</th><th class="r">Precio</th><th class="r">Stock</th></tr></thead><tbody>
      ${rows.slice(0, 50).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.barcode)}</td><td>${esc(r.category)}</td><td class="r">${usd(r.cost)}</td><td class="r">${usd(r.price)}</td><td class="r">${qtyFmt(r.stock)}</td></tr>`).join('')}
      </tbody></table></div>${rows.length > 50 ? `<p class="small muted">… y ${rows.length - 50} más</p>` : ''}`;
    q('[data-ok]').disabled = !rows.length;
  };
  q('[data-ok]').onclick = async () => {
    const btn = q('[data-ok]'); setBusy(btn, true, 'Importando…');
    try {
      const cats = new Set(store.settings.categories);
      let created = 0, updated = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const b = store.batch();
        for (const r of rows.slice(i, i + 200)) {
          cats.add(r.category);
          const existing = r.barcode ? store.products.find((p) => String(p.barcode || '') === r.barcode) : store.products.find((p) => normalize(p.name) === normalize(r.name));
          const prices = [round4(r.price), round4(r.p2), round4(r.p3)];
          const base = { name: r.name, barcode: r.barcode, code: r.barcode, category: r.category, cost: round4(r.cost), prices, price: prices[0], minStock: r.minStock, unit: r.unit, provider: r.provider, updatedAt: nowISO() };
          if (existing) {
            b.update(store.ref('products', existing.id), { ...base, stock: store.inc(r.stock) });
            updated++;
          } else {
            const ref = store.newRef('products');
            b.set(ref, { ...base, stock: r.stock, costMode: 'unit', margins: [null, null, null], exempt: true, active: true, bulkQty: 0, bulkPrice: 0, image: null, createdAt: nowISO() });
            created++;
            if (r.stock) b.set(store.newRef('inventory_logs'), { productId: ref.id, productName: r.name, date: nowISO(), type: 'importacion', qty: r.stock, reason: 'Importación CSV' });
          }
        }
        await store.commit(b);
      }
      await store.saveSettings({ categories: [...cats].sort((a, b) => a.localeCompare(b, 'es')) });
      m.close();
      toast(`Importación lista: ${created} nuevos, ${updated} actualizados`, 'success', 4000);
    } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
  };
}

async function openBulkPrice() {
  if (!(await requirePin('Ajuste masivo de precios'))) return;
  const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))];
  const m = openModal({
    title: 'Ajuste masivo de precios', sub: 'Útil cuando sube la mercancía o cambia el mercado', size: 'sm',
    body: `<form class="stack" data-f>
      <div class="field"><label>Aplicar a</label><select class="select" data-c><option value="">Todas las categorías</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Qué ajustar</label><select class="select" data-w><option value="prices">Precios de venta</option><option value="both">Costos y precios</option><option value="cost">Solo costos</option></select></div>
      <div class="field"><label>Porcentaje (%)</label><input class="input input-lg" data-p inputmode="decimal" placeholder="Ej.: 10 o -5" autofocus></div>
      <div class="hint" data-h></div></form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Aplicar</button>`
  });
  const q = (s) => m.el.querySelector(s);
  const list = () => store.products.filter((p) => !q('[data-c]').value || p.category === q('[data-c]').value);
  const upd = () => { q('[data-h]').textContent = `${list().length} producto(s) serán ajustados.`; };
  q('[data-c]').onchange = upd; upd();
  q('[data-ok]').onclick = async () => {
    const pct = parseNum(q('[data-p]').value);
    if (!pct) { toast('Indica un porcentaje', 'warning'); return; }
    const f = 1 + pct / 100; const w = q('[data-w]').value; const items = list();
    if (!(await confirmDialog({ title: 'Confirmar ajuste', message: `Se ajustarán ${items.length} producto(s) un ${num(pct, 1)}%.`, confirmText: 'Aplicar' }))) return;
    for (let i = 0; i < items.length; i += 300) {
      const b = store.batch();
      items.slice(i, i + 300).forEach((p) => {
        const patch = { updatedAt: nowISO() };
        if (w !== 'cost') { patch.prices = (p.prices || [p.price]).map((x) => round4((x || 0) * f)); patch.price = patch.prices[0]; if (p.bulkPrice) patch.bulkPrice = round2(p.bulkPrice * f); }
        if (w !== 'prices') patch.cost = round4((p.cost || 0) * f);
        b.update(store.ref('products', p.id), patch);
      });
      await store.commit(b);
    }
    m.close(); toast('Precios actualizados');
  };
}

export function mount(el) {
  let search = '', cat = '', status = sessionStorage.getItem('sg_inv_filter') || '', sort = 'name', page = 1;
  sessionStorage.removeItem('sg_inv_filter');
  el.innerHTML = `
    <div class="view-header">
      <div><h1 class="view-title">Inventario</h1><p class="view-sub">Catálogo, precios en $ y Bs, y control de existencias</p></div>
      <div class="view-actions">
        <button class="btn btn-secondary" id="i-more">${icon('layers')} Herramientas</button>
        <button class="btn btn-primary" id="i-new">${icon('plus')} Nuevo producto</button>
      </div>
    </div>
    <div class="kpis" id="i-kpis"></div>
    <div class="card card-flush">
      <div class="inv-filters">
        <label class="search">${icon('search')}<input id="i-search" placeholder="Buscar por nombre, código o proveedor…"></label>
        <select class="select" id="i-cat"></select>
        <select class="select" id="i-status"><option value="">Todo el stock</option><option value="low">Stock bajo</option><option value="out">Agotados</option><option value="inactive">No disponibles</option></select>
        <select class="select" id="i-sort"><option value="name">Orden: nombre</option><option value="stock">Menor stock</option><option value="price">Mayor precio</option><option value="recent">Recientes</option></select>
      </div>
      <div id="i-table"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  $('#i-status').value = status;

  const filtered = () => {
    const q = normalize(search);
    const low = store.settings.lowStock;
    let list = store.products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (status === 'low' && !((p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock ?? low))) return false;
      if (status === 'out' && (p.stock || 0) > 0) return false;
      if (status === 'inactive' && p.active !== false) return false;
      if (q && !(normalize(p.name).includes(q) || normalize(p.barcode).includes(q) || normalize(p.provider).includes(q))) return false;
      return true;
    });
    if (sort === 'stock') list = [...list].sort((a, b) => (a.stock || 0) - (b.stock || 0));
    if (sort === 'price') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'recent') list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  };

  const render = () => {
    const rate = store.rate;
    const all = store.products;
    const low = store.settings.lowStock;
    let inv = 0; all.forEach((p) => { inv += Math.max(0, p.stock || 0) * (p.cost || 0); });
    const lowN = all.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.minStock ?? low)).length;
    const outN = all.filter((p) => (p.stock || 0) <= 0).length;
    $('#i-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Productos</span><span class="kpi-icon tone-brand">${icon('box')}</span></div><div class="kpi-value">${all.length}</div><div class="kpi-sub">${new Set(all.map((p) => p.category)).size} categorías</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Inversión en stock</span><span class="kpi-icon tone-info">${icon('dollar')}</span></div><div class="kpi-value">${usd(inv)}</div><div class="kpi-sub">${bs(inv * rate)}</div></div>
      <div class="card kpi" style="cursor:pointer" data-st="low"><div class="kpi-top"><span class="kpi-label">Stock bajo</span><span class="kpi-icon tone-warning">${icon('alert')}</span></div><div class="kpi-value">${lowN}</div><div class="kpi-sub">por reponer</div></div>
      <div class="card kpi" style="cursor:pointer" data-st="out"><div class="kpi-top"><span class="kpi-label">Agotados</span><span class="kpi-icon tone-danger">${icon('x')}</span></div><div class="kpi-value">${outN}</div><div class="kpi-sub">sin existencia</div></div>`;
    el.querySelectorAll('[data-st]').forEach((k) => k.onclick = () => { status = k.dataset.st; $('#i-status').value = status; page = 1; render(); });

    const cats = [...new Set([...store.settings.categories, ...all.map((p) => p.category)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    $('#i-cat').innerHTML = `<option value="">Todas las categorías</option>` + cats.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');

    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page > pages) page = pages;
    const items = list.slice((page - 1) * PAGE, page * PAGE);
    if (!all.length) {
      $('#i-table').innerHTML = `<div style="padding:10px">${emptyState('box', 'Tu inventario está vacío', 'Crea tu primer producto o importa tu catálogo desde un archivo CSV.')}</div>
        <div class="row-wrap" style="justify-content:center;padding:0 0 28px"><button class="btn btn-primary" data-first>${icon('plus')} Nuevo producto</button><button class="btn btn-secondary" data-imp>${icon('upload')} Importar CSV</button></div>`;
      $('[data-first]').onclick = () => openProductForm();
      $('[data-imp]').onclick = openImport;
      return;
    }
    $('#i-table').innerHTML = items.length ? `<div class="table-wrap"><table class="table rt"><thead><tr>
        <th>Producto</th><th class="hide-sm">Categoría</th><th class="r hide-sm">Costo</th><th class="r">Precio</th><th class="c">Stock</th><th class="r">Acciones</th></tr></thead><tbody>
      ${items.map((p) => {
        const out = (p.stock || 0) <= 0; const lw = !out && (p.stock || 0) <= (p.minStock ?? low);
        return `<tr>
          <td><div class="row" style="cursor:pointer" data-open="${p.id}"><div class="p-thumb" style="width:38px;height:38px">${p.image ? `<img src="${p.image}" alt="" loading="lazy">` : esc(initials(p.name))}</div>
            <div style="min-width:0"><div class="t-name ellipsis" style="max-width:280px">${esc(p.name)}${p.active === false ? ' <span class="badge badge-neutral">No disponible</span>' : ''}</div><div class="t-sub">${esc(p.barcode || '—')}${p.provider ? ' · ' + esc(p.provider) : ''}</div></div></div></td>
          <td class="hide-sm">${esc(p.category || '')}</td>
          <td class="r num hide-sm">${p.cost ? usd(p.cost) : '—'}</td>
          <td class="r num"><b>${usd(p.price)}</b><div class="t-sub text-bs">${bs(p.price * rate)}</div></td>
          <td class="c"><span class="badge ${out ? 'badge-danger' : lw ? 'badge-warning' : 'badge-success'}">${qtyFmt(p.stock)} ${esc((p.unit || '').slice(0, 4))}</span></td>
          <td class="r nowrap">
            <button class="btn btn-secondary btn-sm" data-adj="${p.id}" title="Ajustar stock">${icon('layers')}<span class="hide-sm">Stock</span></button>
            <button class="btn btn-ghost btn-icon btn-sm" data-edit="${p.id}" title="Editar">${icon('edit')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-del="${p.id}" title="Eliminar">${icon('trash')}</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="pager"><span class="small muted">Mostrando ${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, list.length)} de ${list.length}</span>
        <div class="row"><button class="btn btn-secondary btn-sm" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>${icon('arrowLeft')}</button><span class="small bold">Página ${page} de ${pages}</span><button class="btn btn-secondary btn-sm" data-pg="1" ${page >= pages ? 'disabled' : ''}>${icon('arrowRight')}</button></div></div>`
      : `<div style="padding:10px">${emptyState('search', 'Sin resultados', 'Ajusta la búsqueda o los filtros.')}</div>`;
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openDetail(b.dataset.open));
    el.querySelectorAll('[data-adj]').forEach((b) => b.onclick = () => openAdjust(store.product(b.dataset.adj)));
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openProductForm(store.product(b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => del(store.product(b.dataset.del)));
    el.querySelectorAll('[data-pg]').forEach((b) => b.onclick = () => { page += +b.dataset.pg; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  };

  async function del(p) {
    if (!p) return;
    if (!(await requirePin('Eliminar producto'))) return;
    if (!(await confirmDialog({ title: 'Eliminar producto', message: `¿Eliminar <b>${esc(p.name)}</b> del inventario? Las ventas anteriores se conservan.`, confirmText: 'Eliminar', danger: true }))) return;
    await store.remove('products', p.id);
    toast('Producto eliminado', 'info');
  }

  function tools() {
    const m = openModal({
      title: 'Herramientas de inventario', size: 'sm',
      body: `<div class="stack">
        <button class="btn btn-secondary btn-block" data-t="import" style="justify-content:flex-start">${icon('upload')} Importar productos desde CSV</button>
        <button class="btn btn-secondary btn-block" data-t="export" style="justify-content:flex-start">${icon('download')} Exportar inventario a Excel (CSV)</button>
        <button class="btn btn-secondary btn-block" data-t="print" style="justify-content:flex-start">${icon('print')} Imprimir lista para conteo físico</button>
        <button class="btn btn-secondary btn-block" data-t="bulk" style="justify-content:flex-start">${icon('percent')} Ajuste masivo de precios</button>
        <button class="btn btn-secondary btn-block" data-t="cats" style="justify-content:flex-start">${icon('tag')} Administrar categorías</button>
      </div>`
    });
    m.el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
      m.close();
      ({ import: openImport, export: exportCSV, print: printCount, bulk: openBulkPrice, cats: () => openCategories() })[b.dataset.t]();
    });
  }

  function exportCSV() {
    const rate = store.rate;
    download(`inventario_${todayKey()}.csv`, toCSV([
      ['nombre', 'codigo', 'categoria', 'costo', 'precio', 'precio2', 'precio3', 'precio_bs', 'stock', 'minimo', 'unidad', 'proveedor', 'valor_costo'],
      ...store.products.map((p) => [p.name, p.barcode || '', p.category || '', num(p.cost || 0), num(p.price || 0), num((p.prices || [])[1] || 0), num((p.prices || [])[2] || 0), num((p.price || 0) * rate), qtyFmt(p.stock), qtyFmt(p.minStock ?? ''), p.unit || '', p.provider || '', num(Math.max(0, p.stock || 0) * (p.cost || 0))])
    ]), 'text/csv;charset=utf-8');
    toast('Inventario exportado');
  }
  function printCount() {
    const list = filtered();
    printDoc('Lista de conteo físico de inventario', `<table><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th class="r">Sistema</th><th class="r">Contado</th></tr></thead><tbody>
      ${list.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.barcode || '')}</td><td>${esc(p.category || '')}</td><td class="r">${qtyFmt(p.stock)}</td><td class="r">__________</td></tr>`).join('')}</tbody></table>`);
  }

  $('#i-new').onclick = () => openProductForm();
  $('#i-more').onclick = tools;
  $('#i-search').oninput = debounce((e) => { search = e.target.value; page = 1; render(); }, 150);
  $('#i-cat').onchange = (e) => { cat = e.target.value; page = 1; render(); };
  $('#i-status').onchange = (e) => { status = e.target.value; page = 1; render(); };
  $('#i-sort').onchange = (e) => { sort = e.target.value; render(); };
  render();
  const offs = [store.on('products', render), store.on('settings', render)];
  return () => offs.forEach((o) => o());
}

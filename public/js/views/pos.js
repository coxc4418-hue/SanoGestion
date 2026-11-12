// SanoGestion — Punto de venta
import { store } from '../store.js';
import { processSale } from '../ops.js';
import {
  esc, num, usd, bs, round2, parseNum, normalize, toast, openModal, confirmDialog, emptyState,
  qtyFmt, PAY_METHODS, methodLabel, setBusy, fmtTime, debounce, initials, colorFor, loc, isVE } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt, openRateModal } from '../shared.js';
import { openCustomerForm } from './customers.js';

// Estado del carrito (se conserva al cambiar de sección)
const cart = { lines: [], discount: 0, customerId: '', tier: 1, category: 'all', search: '' };

function presentationsOf(p, tier = 1) {
  const prices = p.prices || [p.price];
  const unitPrice = Number(prices[tier - 1]) > 0 ? Number(prices[tier - 1]) : Number(p.price) || 0;
  const list = [{ name: p.unit || 'Unidad', multiplier: 1, price: unitPrice }];
  if (Number(p.bulkQty) > 1 && Number(p.bulkPrice) > 0) list.push({ name: `Bulto x${qtyFmt(p.bulkQty)}`, multiplier: Number(p.bulkQty), price: Number(p.bulkPrice) });
  return list;
}

function totals() {
  const subtotal = round2(cart.lines.reduce((a, l) => a + l.qty * l.price, 0));
  const discount = Math.min(round2(cart.discount), subtotal);
  const total = round2(subtotal - discount);
  return { subtotal, discount, total, totalBs: total * store.rate, items: cart.lines.reduce((a, l) => a + l.qty, 0) };
}

export function addToCart(p, presIdx = 0, qty = 1) {
  const pres = presentationsOf(p, cart.tier)[presIdx] || presentationsOf(p, cart.tier)[0];
  const existing = cart.lines.find((l) => l.productId === p.id && l.presentation === pres.name);
  const inCart = cart.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.qty * l.multiplier, 0);
  if ((Number(p.stock) || 0) < inCart + qty * pres.multiplier) {
    toast(`Stock insuficiente de ${p.name} (disponible: ${qtyFmt(p.stock)})`, 'warning');
    if ((Number(p.stock) || 0) <= inCart) return false;
  }
  if (existing) existing.qty = round2(existing.qty + qty);
  else cart.lines.push({
    productId: p.id, name: p.name, presentation: pres.name, multiplier: pres.multiplier,
    qty, price: pres.price, cost: Number(p.cost) || 0, exempt: p.exempt !== false, category: p.category || ''
  });
  return true;
}

export function mount(el) {
  let mview = 'catalog';
  let lastKeyTime = 0;
  let buffer = '';
  const LIMIT = 150;

  el.innerHTML = `
    <div class="seg seg-block pos-tabs" id="pos-tabs">
      <button data-mv="catalog" class="active">${icon('box')} Catálogo</button>
      <button data-mv="cart">${icon('cart')} Carrito (<span id="tab-count">0</span>)</button>
    </div>
    <div class="pos-wrap" id="pos-wrap">
      <div class="pos" id="pos" data-mview="catalog">
        <section class="pos-catalog">
          <div class="pos-toolbar">
            <label class="search">${icon('search')}<input id="pos-search" placeholder="Buscar producto o código…" autocomplete="off" value="${esc(cart.search)}"></label>
            <select class="select" id="pos-tier" style="width:auto" title="Lista de precios">
              <option value="1">Precio 1</option><option value="2">Precio 2</option><option value="3">Precio 3</option>
            </select>
            <button class="btn btn-secondary" id="pos-held" title="Ventas en espera">${icon('pause')}<span class="hide-sm">En espera</span><span class="held-badge" id="held-count" hidden>0</span></button>
          </div>
          <div class="chips" id="pos-cats"></div>
          <div class="pos-products" id="pos-products"></div>
        </section>
        <aside class="pos-cart">
          <div class="card">
            <div class="card-header" style="margin-bottom:10px">
              <div class="card-title"><span class="ico">${icon('cart')}</span>Venta actual</div>
              <span class="badge badge-neutral bs-only">Tasa ${bs(store.rate)}</span>
            </div>
            <div class="row mb">
              <select class="select grow" id="pos-customer"></select>
              <button class="btn btn-secondary btn-icon" id="pos-new-cust" title="Nuevo cliente">${icon('plus')}</button>
            </div>
            <div class="cart-lines" id="cart-lines"></div>
            <div class="pos-totals mt">
              <div class="between small muted"><span>Subtotal</span><span class="num" id="t-sub">${usd(0)}</span></div>
              <div class="between small"><button class="btn btn-ghost btn-xs" id="pos-discount" style="margin-left:-8px">${icon('percent')} Descuento</button><span class="num text-danger" id="t-disc"></span></div>
              <div class="between" style="align-items:flex-end;margin-top:4px">
                <span class="bold">Total</span>
                <div class="right"><div class="pos-total-usd" id="t-usd">${usd(0)}</div><div class="pos-total-bs" id="t-bs">${bs(0)}</div></div>
              </div>
            </div>
            <div class="pos-actions mt">
              <button class="btn btn-danger-soft" id="pos-clear">${icon('trash')} Vaciar</button>
              <button class="btn btn-secondary" id="pos-hold">${icon('pause')} Espera</button>
              <button class="btn btn-primary btn-lg" id="pos-pay" style="height:40px">${icon('check')} Cobrar <span class="xs hide-sm" style="opacity:.75">F9</span></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
    <div class="pos-mobile-bar" id="pos-mbar">
      <div><b id="mb-total">${usd(0)}</b><small id="mb-sub">0 artículos</small></div>
      <div class="row">
        <button class="btn btn-sm" style="background:#1e293b;color:#fff" id="mb-view">Ver</button>
        <button class="btn btn-primary btn-sm" id="mb-pay">Cobrar</button>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  $('#pos-tier').value = String(cart.tier);

  // ---------- Render catálogo ----------
  function renderCats() {
    const cats = [...new Set(store.products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (cart.category !== 'all' && !cats.includes(cart.category)) cart.category = 'all';
    $('#pos-cats').innerHTML = [`<button class="chip ${cart.category === 'all' ? 'active' : ''}" data-cat="all">Todos</button>`]
      .concat(cats.map((c) => `<button class="chip ${cart.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)).join('');
    $('#pos-cats').querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { cart.category = b.dataset.cat; renderCats(); renderProducts(); });
  }

  function filtered() {
    const q = normalize(cart.search);
    return store.products.filter((p) => {
      if (p.active === false) return false;
      if (cart.category !== 'all' && p.category !== cart.category) return false;
      if (!q) return true;
      return normalize(p.name).includes(q) || normalize(p.code).includes(q) || String(p.barcode || '').includes(cart.search.trim());
    });
  }

  function renderProducts() {
    const rate = store.rate;
    const list = filtered();
    const box = $('#pos-products');
    if (!store.products.length) { box.innerHTML = `<div class="card">${emptyState('box', 'Tu catálogo está vacío', 'Agrega productos en la sección Inventario para empezar a vender.')}</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="card">${emptyState('search', 'Sin resultados', 'Prueba con otro nombre o código.')}</div>`; return; }
    box.innerHTML = list.slice(0, LIMIT).map((p) => {
      const pres = presentationsOf(p, cart.tier);
      const out = (Number(p.stock) || 0) <= 0;
      const low = !out && (Number(p.stock) || 0) <= (p.minStock ?? store.settings.lowStock);
      return `<div class="product-row ${out ? 'out' : ''} ${pres.length > 1 ? 'has-pres' : ''}" data-id="${p.id}">
        <div class="p-thumb">${p.image ? `<img src="${p.image}" alt="" loading="lazy">` : esc(initials(p.name))}</div>
        <div style="min-width:0">
          <div class="p-name ellipsis">${esc(p.name)}</div>
          <div class="p-meta"><span>${esc(p.category || 'General')}</span>
            <span class="badge ${out ? 'badge-danger' : low ? 'badge-warning' : 'badge-success'}">${out ? 'Agotado' : qtyFmt(p.stock) + ' ' + esc(p.unit || '')}</span></div>
        </div>
        <div class="p-price"><b>${usd(pres[0].price)}</b><span>${bs(pres[0].price * rate)}</span></div>
        <div class="p-add">
          ${pres.length > 1 ? `<select class="select" data-pres>${pres.map((x, i) => `<option value="${i}">${esc(x.name)} · ${usd(x.price)}</option>`).join('')}</select>` : ''}
          <button class="btn btn-primary btn-sm" data-add ${out ? 'disabled' : ''}>${icon('plus')}<span class="hide-sm">Agregar</span></button>
        </div>
      </div>`;
    }).join('') + (list.length > LIMIT ? `<p class="center small muted">Mostrando ${LIMIT} de ${list.length}. Usa el buscador para encontrar más.</p>` : '');
    box.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const row = b.closest('.product-row');
      const p = store.product(row.dataset.id);
      const sel = row.querySelector('[data-pres]');
      if (p && addToCart(p, sel ? +sel.value : 0)) { renderCart(); bump(); }
    });
  }

  // ---------- Render carrito ----------
  function renderCustomers() {
    const sel = $('#pos-customer');
    sel.innerHTML = `<option value="">Cliente: Mostrador</option>` + store.customers.map((c) => {
      const bal = store.customerBalance(c.id);
      return `<option value="${c.id}" ${c.id === cart.customerId ? 'selected' : ''}>${esc(c.name)}${bal > 0.004 ? ` · debe ${usd(bal)}` : ''}</option>`;
    }).join('');
    if (cart.customerId && !store.customer(cart.customerId)) cart.customerId = '';
  }

  function renderCart() {
    const t = totals();
    const box = $('#cart-lines');
    if (!cart.lines.length) {
      box.innerHTML = emptyState('cart', 'Carrito vacío', 'Busca o escanea productos para agregarlos.');
    } else {
      box.innerHTML = cart.lines.map((l, i) => `
        <div class="cart-line">
          <div style="min-width:0"><div class="cl-name ellipsis">${esc(l.name)}</div>
            <div class="cl-meta">${esc(l.presentation)} · ${usd(l.price)}${l.multiplier > 1 ? ` · ${qtyFmt(l.multiplier)} u.` : ''}</div></div>
          <div class="cl-total"><b>${usd(l.qty * l.price)}</b><span>${bs(l.qty * l.price * store.rate)}</span></div>
          <div class="cl-actions">
            <div class="qty"><button data-dec="${i}" aria-label="Menos">−</button><input data-qty="${i}" value="${qtyFmt(l.qty)}" inputmode="decimal"><button data-inc="${i}" aria-label="Más">+</button></div>
          </div>
          <div class="right"><button class="btn btn-ghost btn-icon btn-sm" data-del="${i}" title="Quitar">${icon('x')}</button></div>
        </div>`).join('');
      box.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => setQty(+b.dataset.dec, cart.lines[+b.dataset.dec].qty - 1));
      box.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => setQty(+b.dataset.inc, cart.lines[+b.dataset.inc].qty + 1));
      box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { cart.lines.splice(+b.dataset.del, 1); renderCart(); });
      box.querySelectorAll('[data-qty]').forEach((inp) => {
        inp.onchange = () => setQty(+inp.dataset.qty, parseNum(inp.value));
        inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
      });
    }
    $('#t-sub').textContent = usd(t.subtotal);
    $('#t-disc').textContent = t.discount > 0 ? '− ' + usd(t.discount) : '';
    $('#t-usd').textContent = usd(t.total);
    $('#t-bs').textContent = bs(t.totalBs);
    $('#tab-count').textContent = qtyFmt(t.items);
    $('#mb-total').textContent = `${usd(t.total)}${isVE() ? ' · ' + bs(t.totalBs) : ''}`;
    $('#mb-sub').textContent = `${qtyFmt(t.items)} artículo${t.items === 1 ? '' : 's'}`;
    $('#pos-mbar').classList.toggle('show', cart.lines.length > 0 && mview === 'catalog');
    $('#pos-pay').disabled = !cart.lines.length;
    const hc = $('#held-count');
    hc.hidden = !store.heldSales.length; hc.textContent = store.heldSales.length;
  }

  function setQty(i, q) {
    const l = cart.lines[i]; if (!l) return;
    if (!(q > 0)) { cart.lines.splice(i, 1); renderCart(); return; }
    const p = store.product(l.productId);
    const others = cart.lines.filter((x, j) => j !== i && x.productId === l.productId).reduce((a, x) => a + x.qty * x.multiplier, 0);
    if (p && q * l.multiplier + others > (Number(p.stock) || 0)) toast(`Stock disponible de ${p.name}: ${qtyFmt(p.stock)}`, 'warning');
    l.qty = round2(q);
    renderCart();
  }

  function bump() { const b = $('#tab-count'); if (b) { b.style.transition = 'none'; b.style.color = 'var(--brand)'; setTimeout(() => { b.style.transition = 'color .6s'; b.style.color = ''; }, 50); } }

  function guard() {
    const wrap = $('#pos-wrap');
    wrap.querySelector('.guard')?.remove();
    let html = '';
    if (!(store.rate > 0)) html = `<span class="kpi-icon tone-warning">${icon('dollar')}</span><h2>Configura la tasa del día</h2><p class="muted">Necesaria para calcular los montos en bolívares.</p><button class="btn btn-primary btn-lg" data-g="rate">Configurar tasa</button>`;
    else if (!store.openShift) html = `<span class="kpi-icon tone-info">${icon('lock')}</span><h2>La caja está cerrada</h2><p class="muted">Abre un turno de caja para comenzar a vender.</p><button class="btn btn-primary btn-lg" data-g="shift">${icon('wallet')} Abrir caja</button>`;
    if (html) {
      const g = document.createElement('div'); g.className = 'guard'; g.innerHTML = html;
      wrap.appendChild(g);
      g.querySelector('[data-g="rate"]')?.addEventListener('click', openRateModal);
      g.querySelector('[data-g="shift"]')?.addEventListener('click', async () => { const m = await import('./cash.js'); m.openShiftModal(); });
    }
  }

  function setMView(v) {
    mview = v;
    $('#pos').dataset.mview = v;
    el.querySelectorAll('[data-mv]').forEach((b) => b.classList.toggle('active', b.dataset.mv === v));
    renderCart();
  }

  // ---------- Eventos ----------
  const searchInput = $('#pos-search');
  searchInput.oninput = debounce(() => { cart.search = searchInput.value; renderProducts(); }, 120);
  searchInput.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = searchInput.value.trim();
    if (!code) return;
    if (scanCode(code)) { searchInput.value = ''; cart.search = ''; renderProducts(); return; }
    const list = filtered();
    if (list.length === 1 && addToCart(list[0])) { renderCart(); searchInput.value = ''; cart.search = ''; renderProducts(); }
  };
  $('#pos-tier').onchange = (e) => { cart.tier = +e.target.value; renderProducts(); };
  $('#pos-customer').onchange = (e) => { cart.customerId = e.target.value; };
  $('#pos-new-cust').onclick = () => openCustomerForm(null, (c) => { cart.customerId = c.id; renderCustomers(); });
  $('#pos-clear').onclick = async () => {
    if (!cart.lines.length) return;
    if (await confirmDialog({ title: 'Vaciar carrito', message: '¿Quitar todos los productos de la venta actual?', confirmText: 'Vaciar', danger: true })) resetCart();
  };
  $('#pos-hold').onclick = holdSale;
  $('#pos-held').onclick = openHeld;
  $('#pos-pay').onclick = () => openCheckout();
  $('#mb-pay').onclick = () => openCheckout();
  $('#mb-view').onclick = () => setMView('cart');
  el.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => setMView(b.dataset.mv));
  $('#pos-discount').onclick = openDiscount;

  function scanCode(code) {
    const c = code.trim().toLowerCase();
    if (c.length < 3) return false;
    const p = store.products.find((x) => String(x.barcode || '').toLowerCase() === c || String(x.code || '').toLowerCase() === c);
    if (!p) return false;
    if (addToCart(p)) { renderCart(); toast(`+ ${p.name}`, 'success', 1200); }
    return true;
  }

  // Lector de código de barras USB (teclado rápido + Enter) cuando el foco no está en un campo
  const onKey = (e) => {
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'F9') { e.preventDefault(); openCheckout(); return; }
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    const now = Date.now();
    if (now - lastKeyTime > 60) buffer = '';
    lastKeyTime = now;
    if (e.key === 'Enter') { if (buffer.length >= 3 && !scanCode(buffer)) toast(`Código no encontrado: ${buffer}`, 'warning'); buffer = ''; }
    else if (e.key.length === 1) buffer += e.key;
  };
  window.addEventListener('keydown', onKey);

  function resetCart() {
    cart.lines = []; cart.discount = 0; cart.customerId = '';
    renderCustomers(); renderCart();
  }

  function openDiscount() {
    const t = totals();
    const m = openModal({
      title: 'Aplicar descuento', size: 'sm',
      body: `<form class="stack" data-f>
        <div class="seg seg-block" data-mode><button type="button" data-m="usd" class="active">Monto en $</button><button type="button" data-m="pct">Porcentaje %</button></div>
        <div class="field"><label data-lbl>Descuento ($)</label><input class="input input-lg" data-v inputmode="decimal" value="${cart.discount ? num(cart.discount) : ''}" placeholder="0" autofocus></div>
        <div class="hint">Subtotal: ${usd(t.subtotal)}</div></form>`,
      footer: `<button class="btn btn-secondary" data-rm>Quitar</button><button class="btn btn-primary" data-ok>Aplicar</button>`
    });
    let mode = 'usd';
    m.el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => {
      mode = b.dataset.m;
      m.el.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x === b));
      m.el.querySelector('[data-lbl]').textContent = mode === 'usd' ? 'Descuento ($)' : 'Descuento (%)';
    });
    const apply = (e) => {
      e?.preventDefault();
      const v = parseNum(m.el.querySelector('[data-v]').value);
      cart.discount = Math.max(0, Math.min(t.subtotal, mode === 'pct' ? t.subtotal * v / 100 : v));
      m.close(); renderCart();
    };
    m.el.querySelector('[data-f]').onsubmit = apply;
    m.el.querySelector('[data-ok]').onclick = apply;
    m.el.querySelector('[data-rm]').onclick = () => { cart.discount = 0; m.close(); renderCart(); };
  }

  // ---------- Ventas en espera ----------
  async function holdSale() {
    if (!cart.lines.length) { toast('El carrito está vacío', 'warning'); return; }
    const c = store.customer(cart.customerId);
    const m = openModal({
      title: 'Poner venta en espera', size: 'sm',
      body: `<form data-f class="stack"><div class="field"><label>Referencia</label><input class="input" data-l value="${esc(c ? c.name : 'Pedido ' + fmtTime(new Date()))}" autofocus></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('pause')} Guardar</button>`
    });
    const save = async (e) => {
      e?.preventDefault();
      const label = m.el.querySelector('[data-l]').value.trim() || 'Pedido';
      const t = totals();
      m.close();
      await store.save('held_sales', store.newRef('held_sales').id, {
        label, lines: cart.lines, discount: cart.discount, customerId: cart.customerId || '', total: t.total, createdAt: new Date().toISOString()
      }, false);
      resetCart();
      toast(`"${label}" quedó en espera`);
    };
    m.el.querySelector('[data-f]').onsubmit = save;
    m.el.querySelector('[data-ok]').onclick = save;
  }

  function openHeld() {
    const list = store.heldSales;
    const m = openModal({
      title: 'Ventas en espera', sub: 'Retoma una venta pendiente', size: 'lg',
      body: list.length ? `<div class="list">${list.map((h) => `
        <div class="list-item">
          <span class="kpi-icon tone-warning">${icon('pause')}</span>
          <div class="grow"><div class="bold">${esc(h.label)}</div><div class="small muted">${(h.lines || []).length} producto(s) · ${usd(h.total)} · ${fmtTime(h.createdAt)}</div></div>
          <button class="btn btn-primary btn-sm" data-r="${h.id}">Retomar</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-d="${h.id}" title="Eliminar">${icon('trash')}</button>
        </div>`).join('')}</div>` : emptyState('pause', 'No hay ventas en espera')
    });
    m.el.querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => {
      const h = list.find((x) => x.id === b.dataset.r);
      if (cart.lines.length && !(await confirmDialog({ title: 'Reemplazar carrito', message: 'El carrito actual tiene productos. ¿Reemplazarlo por la venta en espera?', confirmText: 'Reemplazar' }))) return;
      cart.lines = h.lines || []; cart.discount = h.discount || 0; cart.customerId = h.customerId || '';
      await store.remove('held_sales', h.id);
      m.close(); renderCustomers(); renderCart(); setMView('cart');
      toast(`Venta "${h.label}" retomada`);
    });
    m.el.querySelectorAll('[data-d]').forEach((b) => b.onclick = async () => {
      if (!(await confirmDialog({ title: 'Eliminar venta en espera', message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true }))) return;
      await store.remove('held_sales', b.dataset.d);
      m.close(); openHeld();
    });
  }

  // ---------- Cobro ----------
  function openCheckout() {
    if (!cart.lines.length) { toast('El carrito está vacío', 'warning'); return; }
    if (!(store.rate > 0)) { openRateModal(); return; }
    if (!store.openShift) { toast('Abre la caja para poder cobrar', 'warning'); guard(); return; }
    const rate = store.rate;
    const t = totals();
    const methods = Object.keys(PAY_METHODS);
    const m = openModal({
      title: 'Registrar pago', sub: isVE() ? `Tasa: ${bs(rate)} por $1` : '', size: 'lg',
      body: `
        <div class="stack">
          <div class="pay-totals">
            <div class="pay-total"><span class="label">Total a pagar ($)</span><b>${usd(t.total)}</b></div>
            <div class="pay-total"><span class="label">Total a pagar (Bs)</span><b class="text-bs">${bs(t.totalBs)}</b></div>
          </div>
          <div class="field">
            <div class="between"><label>Cliente</label><button type="button" class="btn btn-ghost btn-xs" data-newc>${icon('plus')} Nuevo cliente</button></div>
            <select class="select" data-cust></select>
          </div>
          <div class="pay-grid">
            ${methods.map((k) => `<div class="pay-field">
              <div class="label"><span>${PAY_METHODS[k].label}</span><span class="faint">${PAY_METHODS[k].cur === 'BS' ? 'Bs' : loc().sym}</span></div>
              <div class="row"><input class="input num" data-pay="${k}" inputmode="decimal" placeholder="0,00"><button type="button" class="btn btn-secondary btn-sm" data-all="${k}">Todo</button></div>
            </div>`).join('')}
          </div>
          <div class="balance-box missing" data-bal><div class="small bold" data-bal-l>Falta por pagar</div><b data-bal-v></b></div>
          <div class="field bs-only" data-change-wrap hidden>
            <label>Entregar vuelto en</label>
            <div class="seg seg-block" data-chg><button type="button" data-c="USD">Dólares ($)</button><button type="button" data-c="BS">Bolívares (Bs)</button></div>
          </div>
          <div class="field"><label>Nota (opcional)</label><input class="input" data-note placeholder="Ej.: quién retira, referencia del pago…"></div>
        </div>`,
      footer: `<button class="btn btn-warning" data-fiado>${icon('card')} Guardar como fiado</button><button class="btn btn-primary btn-lg" data-done style="height:40px">${icon('check')} Completar venta</button>`
    });
    const q = (s) => m.el.querySelector(s);
    const custSel = q('[data-cust]');
    const fillCust = () => {
      custSel.innerHTML = `<option value="">Mostrador (sin cliente)</option>` + store.customers.map((c) => `<option value="${c.id}" ${c.id === cart.customerId ? 'selected' : ''}>${esc(c.name)}${store.customerBalance(c.id) > 0.004 ? ` · debe ${usd(store.customerBalance(c.id))}` : ''}</option>`).join('');
    };
    fillCust();
    custSel.onchange = () => { cart.customerId = custSel.value; update(); };
    q('[data-newc]').onclick = () => openCustomerForm(null, (c) => { cart.customerId = c.id; fillCust(); renderCustomers(); update(); });

    let changeCur = isVE() ? 'BS' : 'USD';
    const readPays = () => methods.map((k) => ({ method: k, currency: PAY_METHODS[k].cur, amount: parseNum(q(`[data-pay="${k}"]`).value) })).filter((p) => p.amount > 0);
    const paidUSD = () => readPays().reduce((a, p) => a + (p.currency === 'BS' ? p.amount / rate : p.amount), 0);
    let userPickedChange = false;
    const update = () => {
      const paid = paidUSD();
      const diff = round2(paid - t.total);
      const bal = q('[data-bal]');
      const covered = diff >= -0.005;
      if (Math.abs(diff) < 0.005) { bal.className = 'balance-box exact'; q('[data-bal-l]').textContent = 'Pago exacto'; q('[data-bal-v]').textContent = usd(0); }
      else if (covered) { bal.className = 'balance-box change'; q('[data-bal-l]').textContent = 'Vuelto'; q('[data-bal-v]').textContent = `${usd(diff)}${isVE() ? ' · ' + bs(diff * rate) : ''}`; }
      else { bal.className = 'balance-box missing'; q('[data-bal-l]').textContent = paid > 0 ? 'Falta por pagar' : 'Monto pendiente'; q('[data-bal-v]').textContent = `${usd(-diff)}${isVE() ? ' · ' + bs(-diff * rate) : ''}`; }
      q('[data-change-wrap]').hidden = !(covered && diff > 0.004);
      if (!userPickedChange) changeCur = !isVE() ? 'USD' : readPays().some((p) => p.method === 'efectivo_usd') && !readPays().some((p) => p.method === 'efectivo_bs') ? 'USD' : 'BS';
      m.el.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('active', b.dataset.c === changeCur));
      q('[data-done]').disabled = !covered;
      q('[data-fiado]').disabled = covered;
      q('[data-fiado]').title = cart.customerId ? '' : 'Selecciona un cliente para fiar';
      q('[data-fiado]').innerHTML = `${icon('card')} ${paid > 0.004 && !covered ? 'Abonar y fiar el resto' : 'Guardar como fiado'}`;
    };
    m.el.querySelectorAll('[data-pay]').forEach((i) => { i.oninput = update; i.onkeydown = (e) => { if (e.key === 'Enter' && !q('[data-done]').disabled) q('[data-done]').click(); }; });
    m.el.querySelectorAll('[data-all]').forEach((b) => b.onclick = () => {
      const k = b.dataset.all; const inp = q(`[data-pay="${k}"]`);
      inp.value = '';
      const rest = Math.max(0, t.total - paidUSD());
      inp.value = rest > 0 ? num(PAY_METHODS[k].cur === 'BS' ? rest * rate : rest) : '';
      update(); inp.focus();
    });
    m.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { changeCur = b.dataset.c; userPickedChange = true; update(); });
    update();
    setTimeout(() => q('[data-pay="efectivo_usd"]').focus(), 80);

    const finish = async (asCredit) => {
      const btn = asCredit ? q('[data-fiado]') : q('[data-done]');
      const customer = store.customer(custSel.value) || null;
      if (asCredit && !customer) { toast('Selecciona o crea un cliente para guardar como fiado', 'warning'); custSel.focus(); return; }
      setBusy(btn, true, 'Guardando…');
      try {
        const sale = await processSale({
          items: cart.lines, discount: cart.discount, customer, payments: readPays(),
          changeCurrency: changeCur, note: q('[data-note]').value.trim()
        });
        m.close();
        resetCart(); renderProducts(); setMView('catalog');
        openSuccess(sale);
      } catch (e) {
        toast(e.message || String(e), 'danger', 4500);
        setBusy(btn, false); update();
      }
    };
    q('[data-done]').onclick = () => finish(false);
    q('[data-fiado]').onclick = () => finish(true);
  }

  function openSuccess(sale) {
    const chg = sale.changeUSD > 0.004 ? (sale.changeCurrency === 'BS' ? bs(sale.changeUSD * sale.rate) : usd(sale.changeUSD)) : null;
    const m = openModal({
      size: 'sm',
      body: `<div class="center" style="padding-top:18px">
        <div class="success-ico">${icon('check')}</div>
        <h2 style="font-size:20px">¡Venta registrada!</h2>
        <p class="muted small">Ticket ${esc(sale.number)}</p>
        <div class="summary-box mt" style="text-align:left">
          <div class="summary-row"><span class="muted">Total</span><b>${usd(sale.total)}</b></div>
          <div class="summary-row bs-only"><span class="muted">En bolívares</span><b class="text-bs">${bs(sale.totalBs)}</b></div>
          <div class="summary-row"><span class="muted">Pago</span><b>${sale.payments.length ? sale.payments.map((p) => esc(methodLabel(p.method))).join(' + ') : 'Fiado'}</b></div>
          ${chg ? `<div class="summary-row total"><span>Vuelto</span><b class="text-success">${chg}</b></div>` : ''}
          ${sale.creditUSD > 0 ? `<div class="summary-row total"><span>Fiado a ${esc(sale.customerName)}</span><b class="text-warning">${usd(sale.creditUSD)}</b></div>` : ''}
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" data-print>${icon('print')} Imprimir recibo</button><button class="btn btn-primary" data-close autofocus>${icon('cart')} Nueva venta</button>`,
      onClose: () => { if (window.innerWidth > 960) $('#pos-search')?.focus(); }
    });
    m.el.querySelector('[data-print]').onclick = () => printReceipt(sale);
  }

  // ---------- Inicial ----------
  renderCats(); renderProducts(); renderCustomers(); renderCart(); guard();
  if (window.innerWidth > 960) setTimeout(() => searchInput.focus(), 50);

  const offs = [
    store.on('products', () => { renderCats(); renderProducts(); }),
    store.on('customers', renderCustomers),
    store.on('debts', renderCustomers),
    store.on('held', renderCart),
    store.on('shift', guard),
    store.on('settings', onRate)
  ];
  function onRate() { renderProducts(); renderCart(); guard(); const b = el.querySelector('.pos-cart .badge-neutral'); if (b) b.textContent = `Tasa ${bs(store.rate)}`; }
  return () => { offs.forEach((o) => o()); window.removeEventListener('keydown', onKey); };
}

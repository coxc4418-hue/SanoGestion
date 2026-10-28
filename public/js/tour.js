// SanoGestion — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 2 minutos', icon: 'star',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a SanoGestion! 👋', text: 'Te mostramos en un par de minutos cómo manejar tu tienda: ventas, inventario, fiados, caja y reportes. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetir este recorrido desde el menú › Ayuda y tutorial.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Desde aquí entras a cada sección: Inicio, Vender, Inventario, Clientes, Cobranza, Caja, Servicios, Reportes y Configuración. En el teléfono tienes los accesos rápidos abajo y el menú completo en el botón ☰.' },
      { route: 'inicio', sel: ['#sb-rate', '#tb-rate'], title: 'Tasa del día', text: 'Los precios se guardan en dólares y se muestran en bolívares con esta tasa. Se carga sola con la tasa BCV y puedes cambiarla cuando quieras tocando aquí.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Resumen del día', text: 'Lo vendido hoy en $ y Bs, la ganancia, cuánto te deben en fiados y los productos con poco stock. Se actualiza al instante con cada venta.' },
      { route: 'inicio', sel: ['[data-tour="chart"]'], title: 'Ventas de la semana', text: 'El gráfico compara las ventas de los últimos 7 días. Más abajo ves el valor de tu inventario, los productos más vendidos y el stock crítico.' },
      { route: 'vender', mv: 'catalog', sel: ['#pos-search'], title: 'Vender: buscar o escanear', text: 'Escribe el nombre o el código, o usa un lector de código de barras: el producto se agrega solo al carrito.' },
      { route: 'vender', mv: 'catalog', sel: ['#pos-products'], title: 'Catálogo', text: 'Toca un producto para agregarlo. Filtra por categoría arriba y elige la lista de precios (precio 1, 2 o 3) para clientes mayoristas.' },
      { route: 'vender', mv: 'cart', sel: ['#pos-pay'], title: 'Cobrar', text: 'En el teléfono el carrito está en su propia pestaña. Acepta varios pagos a la vez (efectivo $, efectivo Bs, punto, pago móvil, Zelle…), calcula el vuelto en la moneda que elijas y, si falta dinero, lo deja fiado al cliente.' },
      { route: 'inventario', sel: ['#i-kpis'], title: 'Inventario', text: 'Cuántos productos tienes, cuáles están bajos o agotados y cuánto vale tu mercancía al costo y a precio de venta.' },
      { route: 'inventario', sel: ['#i-new'], title: 'Nuevo producto', text: 'Registra el costo por unidad o por bulto (en $ o Bs), el margen y hasta 3 precios. También puedes importar todo desde un archivo CSV.' },
      { route: 'inventario', sel: ['[data-adj]'], title: 'Entradas y ajustes de stock', text: 'Registra compras de mercancía, mermas o el conteo físico. Cada movimiento queda en el historial del producto.' },
      { route: 'cobranza', sel: ['#d-kpis'], title: 'Cobranza y fiados', text: 'Quién te debe, cuánto y desde cuándo. Registra abonos en $ o Bs y envía un recordatorio por WhatsApp con un toque.' },
      { route: 'caja', sel: ['[data-tour="cash"]', '#k-open'], title: 'Caja', text: 'Abre el turno con el fondo inicial, registra ingresos y gastos, y al cerrar cuenta el efectivo: el sistema te dice si sobra o falta, en $ y en Bs.' },
      { route: 'servicios', sel: ['#s-form'], title: 'Servicios', text: 'Registra recargas telefónicas y avances de efectivo con su comisión. El dinero entra y sale de la caja automáticamente.' },
      { route: 'servicios', sel: ['.sb-nav [data-nav="reportes"]'], title: 'Reportes', text: 'Ventas, ganancia, métodos de pago, ventas anuladas y exportación a Excel o PDF. Están protegidos con el PIN de datos sensibles (en la demo: 1234).' },
      { route: 'ajustes', sel: ['#f-biz'], title: 'Configuración', text: 'Datos del negocio para el recibo, impuestos, días de crédito, categorías, cambio de PIN y copia de seguridad.' },
      { route: 'ajustes', sel: ['.sb-foot [data-install]', '.topbar [data-install]', '#b-install'], title: 'Instala la app', text: 'Instala SanoGestion en el teléfono, la tablet o la computadora: queda con su ícono, abre en su propia ventana y funciona aunque se vaya el internet.' },
      { route: 'inicio', title: '¡Listo para vender! 🎉', text: 'Prueba ahora: haz una venta, déjale un fiado a un cliente, registra un abono y cierra la caja. Tienes más recorridos y el video tutorial en el menú › Ayuda y tutorial.', final: true }
    ]
  },
  vender: {
    name: 'Cómo vender', desc: 'Carrito, precios, descuentos y cobro', icon: 'cart',
    steps: [
      { route: 'vender', mv: 'catalog', sel: ['#pos-search'], title: '1. Buscar o escanear', text: 'Escribe el nombre o el código del producto. Con un lector de código de barras se agrega directo al carrito.' },
      { route: 'vender', mv: 'catalog', sel: ['#pos-cats'], title: '2. Categorías', text: 'Filtra el catálogo por categoría para encontrar más rápido.' },
      { route: 'vender', mv: 'catalog', sel: ['#pos-tier'], title: '3. Lista de precios', text: 'Cambia entre precio 1, 2 o 3 (por ejemplo detal y mayor). Se aplica a todo el carrito.' },
      { route: 'vender', mv: 'catalog', sel: ['#pos-products'], title: '4. Agregar productos', text: 'Toca un producto para sumarlo. Si tiene presentación por bulto, eliges cómo venderlo. El sistema avisa si no hay suficiente stock.' },
      { route: 'vender', mv: 'cart', sel: ['#pos-customer'], title: '5. Cliente', text: 'Opcional en ventas de contado; obligatorio para fiar. Puedes crear un cliente nuevo sin salir de la venta.' },
      { route: 'vender', mv: 'cart', sel: ['#pos-discount'], title: '6. Descuento y en espera', text: 'Aplica un descuento en % o monto, o deja la venta en espera para atender a otro cliente y retomarla luego.' },
      { route: 'vender', mv: 'cart', sel: ['#pos-pay'], title: '7. Cobrar', text: 'Combina pagos en $ y Bs, elige la moneda del vuelto y, si el cliente paga una parte, el resto queda fiado con su fecha de vencimiento. Al final puedes imprimir el recibo.' }
    ]
  },
  inventario: {
    name: 'Inventario', desc: 'Productos, precios, entradas y alertas', icon: 'box',
    steps: [
      { route: 'inventario', sel: ['#i-kpis'], title: 'Estado del inventario', text: 'Total de productos, stock bajo, agotados y valor de la mercancía.' },
      { route: 'inventario', sel: ['#i-search'], title: 'Buscar y filtrar', text: 'Busca por nombre o código y filtra por categoría o estado del stock.' },
      { route: 'inventario', sel: ['#i-new'], title: 'Nuevo producto', text: 'Nombre, código de barras, categoría, foto, costo por unidad o bulto, margen y hasta 3 precios. El precio en Bs se calcula con la tasa del día.' },
      { route: 'inventario', sel: ['[data-adj]'], title: 'Stock', text: 'Entrada de mercancía (actualiza el costo), merma o ajuste por conteo físico. Los ajustes piden el PIN.' },
      { route: 'inventario', sel: ['#i-more'], title: 'Más opciones', text: 'Importar y exportar CSV, subir precios en masa por categoría y administrar categorías.' }
    ]
  },
  fiados: {
    name: 'Clientes y fiados', desc: 'Créditos, abonos y recordatorios', icon: 'card',
    steps: [
      { route: 'clientes', sel: ['#c-kpis'], title: 'Clientes', text: 'Tu cartera de clientes con lo que te deben. Toca uno para ver su ficha: compras, deudas y abonos.' },
      { route: 'clientes', sel: ['#c-new'], title: 'Nuevo cliente', text: 'Nombre, teléfono, cédula y un límite de crédito opcional.' },
      { route: 'cobranza', sel: ['#d-kpis'], title: 'Cobranza', text: 'Total por cobrar y vencido. Las deudas vencen según los días de crédito de Configuración.' },
      { route: 'cobranza', sel: ['#d-filter'], title: 'Filtros', text: 'Mira solo lo vencido, lo que vence pronto o todo.' },
      { route: 'cobranza', sel: ['[data-pay]', '#d-list'], title: 'Registrar abono', text: 'Cobra en $ o Bs, total o parcial. El dinero entra a la caja y el saldo del cliente se actualiza. También puedes enviarle un recordatorio por WhatsApp.' }
    ]
  },
  caja: {
    name: 'Caja', desc: 'Abrir, movimientos y cierre con arqueo', icon: 'wallet',
    steps: [
      { route: 'caja', sel: ['[data-tour="cash"]', '#k-open'], title: 'Turno de caja', text: 'Lo vendido en el turno y el efectivo esperado en dólares y en bolívares, separado por moneda.' },
      { route: 'caja', sel: ['#k-in'], title: 'Ingresos', text: 'Dinero que entra a la caja fuera de una venta, por ejemplo un aporte para tener sencillo.' },
      { route: 'caja', sel: ['#k-out'], title: 'Gastos y retiros', text: 'Lo que sale de la caja: pago a proveedores, pasajes, retiros del dueño… Así el cierre cuadra.' },
      { route: 'caja', sel: ['#k-close'], title: 'Cerrar caja', text: 'Cuenta el efectivo y escríbelo: el sistema calcula si sobra o falta y te da un reporte de cierre para imprimir. Pide el PIN.' }
    ]
  }
};

let state = null;

// Visible y dentro de la pantalla (el menú lateral del teléfono queda escondido a la izquierda)
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.right > 8 && r.left < innerWidth - 8 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 4500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

// La vista puede redibujarse (datos en vivo): vuelve a ubicar la zona del paso actual
function refind() {
  for (const q of state.sels || []) { const el = [...document.querySelectorAll(q)].find(visible); if (el) return el; }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  let lastRect = '';
  const watch = setInterval(() => {
    if (!state || state.moving || !state.sels) return;
    if (!state.target || !document.contains(state.target)) state.target = refind();
    const el = state.target; if (!el) return;
    const r = el.getBoundingClientRect(); const k = `${r.left|0},${r.top|0},${r.width|0},${r.height|0}`;
    if (k !== lastRect) { lastRect = k; place(); }
  }, 200);
  state.cleanup = () => { clearInterval(watch); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sg_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state || state.moving) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  state.moving = true;
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  if (s.mv) {
    const tab = [...document.querySelectorAll(`#pos-tabs [data-mv="${s.mv}"]`)].find(visible);
    if (tab && !tab.classList.contains('active')) { tab.click(); await new Promise((r) => setTimeout(r, 200)); }
  }
  state.sels = null;
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  state.sels = s.sel || null;
  state.moving = false;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  const last = state.i === total - 1;
  tip.innerHTML = `
    <div class="tour-step">${esc(state.tour.name)} · ${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev" aria-label="Anterior">${icon('arrowLeft')}</button>` : ''}
      ${s.final ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${last ? 'Terminar' : `Siguiente ${icon('arrowRight')}`}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = async () => { stopTour(); (await import('./main.js')).openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  if (state.sels && (!state.target || !document.contains(state.target))) state.target = refind();
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

/** Lista de recorridos para el modal de Ayuda. */
export function tourListHTML() {
  return `<div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="help-item-ico">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>`;
}

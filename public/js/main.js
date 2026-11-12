// SanoGestion — Arranque de la aplicación, inicio de sesión y navegación
import { auth, onAuthStateChanged } from './firebase.js';
import { store, getTenant, createTenantDoc } from './store.js';
import { session, login, logout, authErrorMessage, SUPER_EMAIL, usernameOf } from './auth.js';
import { esc, toast, num, fmtDate, closeAllModals, $, $$, setBusy, confirmDialog, toggleTheme, openModal, isVE, loc, flagImg, bs } from './utils.js';
import { icon } from './icons.js';
import { openRateModal } from './shared.js';
import { isStandalone, platform, bindInstallButtons } from './install.js';
import { startTour, stopTour, tourListHTML } from './tour.js';

export const VERSION = '1.4.0';
const SALES_WA = 'https://wa.me/584221906045?text=' + encodeURIComponent('Hola, me interesa SanoGestion para mi negocio. ¿Me puedes dar más información?');

const ROUTES = {
  inicio: { title: 'Inicio', icon: 'home', group: 'Principal', load: () => import('./views/dashboard.js') },
  vender: { title: 'Vender', icon: 'cart', group: 'Principal', load: () => import('./views/pos.js') },
  inventario: { title: 'Inventario', icon: 'box', group: 'Principal', load: () => import('./views/inventory.js') },
  clientes: { title: 'Clientes', icon: 'users', group: 'Principal', load: () => import('./views/customers.js') },
  cobranza: { title: 'Cobranza / Fiados', icon: 'card', group: 'Principal', load: () => import('./views/debts.js') },
  caja: { title: 'Caja', icon: 'wallet', group: 'Operación', load: () => import('./views/cash.js') },
  servicios: { title: 'Servicios', icon: 'phone', group: 'Operación', load: () => import('./views/services.js') },
  reportes: { title: 'Reportes', icon: 'chart', group: 'Análisis', pin: true, load: () => import('./views/reports.js') },
  ajustes: { title: 'Configuración', icon: 'settings', group: 'Sistema', load: () => import('./views/settings.js') }
};

let currentRoute = null;
let currentCleanup = null;
let storeUnsub = null;

const root = () => document.getElementById('root');
function hideBoot() {
  const b = document.getElementById('boot');
  if (b) { b.style.opacity = '0'; setTimeout(() => b.remove(), 300); }
}
function showBoot() {
  if (document.getElementById('boot')) return;
  const b = document.createElement('div');
  b.id = 'boot'; b.className = 'boot';
  b.innerHTML = '<div class="boot-inner"><img src="/assets/icon-192.png" alt=""><div class="spinner"></div></div>';
  document.body.appendChild(b);
}

// ======================================================================
// LOGIN
// ======================================================================
function renderLogin() {
  teardownApp();
  root().innerHTML = `
    <div class="auth-screen">
      <section class="auth-hero">
        <div class="auth-brand"><img src="/assets/logo.svg" alt=""> SanoGestion</div>
        <div style="position:relative;z-index:1">
          <h1>La gestión de tu tienda, clara y en orden.</h1>
          <p>Vende más rápido, controla tu inventario y tu caja en dólares y bolívares, y lleva tus fiados al día. Desde cualquier dispositivo.</p>
          <div class="auth-features">
            <div class="auth-feature"><span>${icon('cart')}</span>Punto de venta con pagos mixtos y lector de códigos</div>
            <div class="auth-feature"><span>${icon('box')}</span>Inventario con alertas de stock y precios en $ y Bs</div>
            <div class="auth-feature"><span>${icon('wallet')}</span>Caja por turnos con arqueo en ambas monedas</div>
            <div class="auth-feature"><span>${icon('building')}</span>Multisede: cada tienda con sus datos aislados</div>
          </div>
        </div>
        <div class="small" style="color:#7f93ad;position:relative;z-index:1">© ${new Date().getFullYear()} SanoGestion</div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <div class="auth-mobile-brand"><img src="/assets/logo.svg" alt=""> SanoGestion</div>
          <h2>Iniciar sesión</h2>
          <p class="muted">Ingresa con el usuario de tu sede.</p>
          <form class="stack mt-lg" id="login-form" autocomplete="on">
            <div class="field">
              <label for="lg-user">Usuario o correo</label>
              <input class="input" id="lg-user" name="username" autocomplete="username" placeholder="ej. sede01" autocapitalize="off" spellcheck="false" required>
            </div>
            <div class="field">
              <label for="lg-pass">Contraseña</label>
              <div class="input-group">
                <input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required style="padding-left:12px;padding-right:44px">
                <button type="button" class="btn btn-ghost btn-icon btn-sm suffix-btn" id="lg-eye" aria-label="Mostrar contraseña">${icon('eye')}</button>
              </div>
            </div>
            <div class="error-msg" id="lg-err"></div>
            <button class="btn btn-primary btn-lg btn-block" id="lg-btn" type="submit">${icon('lock')} Entrar</button>
          </form>
          <div class="auth-or"><span>¿Aún no tienes cuenta?</span></div>
          <button class="btn btn-demo btn-lg btn-block" id="lg-demo" type="button">${icon('star')} Probar demo gratis · 30 min</button>
          <p class="hint center mt">Sin registro. Incluye datos de ejemplo y se borra automáticamente al terminar. PIN de la demo: <b>1234</b>.</p>
          <a class="btn btn-whatsapp btn-lg btn-block mt" id="lg-wa" href="${SALES_WA}" target="_blank" rel="noopener">${icon('whatsapp')} Quiero SanoGestion para mi negocio</a>
          <p class="hint center mt">Escríbenos por WhatsApp: <b>+58 422-190 6045</b></p>
          ${isStandalone() ? '' : `<div class="install-card mt-lg">
            <img src="/assets/icon-192.png" alt="">
            <div class="grow"><b>Instala la app</b><span>${platform() === 'desktop' ? 'Acceso directo en tu computadora' : 'Ícono en tu teléfono'}, sin tiendas ni descargas.</span></div>
            <button type="button" class="btn btn-primary btn-sm" data-install>${icon('install')} Instalar</button>
          </div>`}
          <button type="button" class="btn btn-ghost btn-block mt" id="lg-video">${icon('eye')} Ver video tutorial</button>
          <p class="auth-foot">¿Olvidaste tu contraseña? Contacta al administrador de SanoGestion.</p>
        </div>
      </section>
    </div>`;
  hideBoot();
  const form = $('#login-form');
  const eye = $('#lg-eye');
  eye.onclick = () => {
    const p = $('#lg-pass');
    p.type = p.type === 'password' ? 'text' : 'password';
    eye.innerHTML = icon(p.type === 'password' ? 'eye' : 'eyeOff');
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#lg-btn');
    const err = $('#lg-err');
    err.textContent = '';
    setBusy(btn, true, 'Verificando…');
    try {
      await login($('#lg-user').value, $('#lg-pass').value);
      // onAuthStateChanged continúa el flujo
    } catch (ex) {
      err.textContent = authErrorMessage(ex);
      const p = $('#lg-pass'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      setBusy(btn, false);
    }
  };
  bindInstallButtons(root());
  $('#lg-video').onclick = () => openVideo();
  $('#lg-demo').onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Preparando tu demo…');
    try {
      const { startDemo } = await import('./demo.js');
      await startDemo();
    } catch (ex) {
      $('#lg-err').textContent = ex?.code === 'auth/operation-not-allowed' ? 'La demo no está disponible en este momento.' : authErrorMessage(ex);
      setBusy(btn, false);
    }
  };
  setTimeout(() => $('#lg-user')?.focus(), 50);
  if (demoEndedNotice) showDemoEnded();
}

// ======================================================================
// SESIÓN
// ======================================================================
onAuthStateChanged(auth, async (user) => {
  session.user = user;
  if (!user) { renderLogin(); return; }
  session.isSuper = user.email === SUPER_EMAIL;
  showBoot();
  try {
    if (user.isAnonymous) {
      await enterDemo(user);
    } else if (session.isSuper) {
      const viewing = sessionStorage.getItem('sg_view_tenant');
      if (viewing) await enterTenant(viewing);
      else await renderAdminPanel();
    } else {
      await enterTenant(user.uid);
    }
  } catch (e) {
    console.error(e);
    renderError(e);
  }
});

function renderError(e) {
  teardownApp();
  root().innerHTML = `
    <div class="auth-screen" style="grid-template-columns:1fr"><section class="auth-panel"><div class="auth-card center">
      <div class="kpi-icon tone-danger" style="margin:0 auto 12px;width:56px;height:56px">${icon('alert')}</div>
      <h2>No se pudo abrir la sede</h2>
      <p class="muted mt">${esc(e?.message || e)}</p>
      <button class="btn btn-primary btn-block mt-lg" id="err-retry">Reintentar</button>
      <button class="btn btn-ghost btn-block mt" id="err-out">Cerrar sesión</button>
    </div></section></div>`;
  hideBoot();
  $('#err-retry').onclick = () => location.reload();
  $('#err-out').onclick = () => logout();
}

const SALES_PHONE = '584221906045';
const salesWa = (msg) => `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;
const tsMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ? new Date(v).getTime() : 0);
const paidUntilISO = (t) => (t?.paidUntil ? new Date(tsMillis(t.paidUntil)).toISOString() : null);
function tenantState(t) {
  if (!t || t.deleted) return 'missing';
  if (t.active === false) return 'frozen';
  if (t.paidUntil && tsMillis(t.paidUntil) < Date.now()) return 'expired';
  return 'ok';
}

function renderSuspended(t, kind = tenantState(t)) {
  teardownApp();
  const texts = {
    frozen: ['Cuenta congelada', `El acceso de <b>${esc(t?.name || 'tu negocio')}</b> está temporalmente congelado${t?.frozenReason ? ': ' + esc(t.frozenReason) : '.'} Tus datos están a salvo.`],
    expired: ['Tu plan venció', `El plan de <b>${esc(t?.name || 'tu negocio')}</b> venció el ${fmtDate(paidUntilISO(t))}. Renuévalo para seguir trabajando; tus datos están a salvo.`],
    missing: ['Cuenta sin sede asignada', 'Esta cuenta no tiene una sede activa en SanoGestion. Contáctanos para activarla.']
  }[kind] || ['Sede suspendida', `La cuenta <b>${esc(t?.name || '')}</b> está temporalmente suspendida.`];
  root().innerHTML = `
    <div class="auth-screen" style="grid-template-columns:1fr"><section class="auth-panel"><div class="auth-card center">
      <div class="kpi-icon tone-warning" style="margin:0 auto 12px;width:56px;height:56px">${icon('lock')}</div>
      <h2>${texts[0]}</h2>
      <p class="muted mt">${texts[1]}</p>
      <a class="btn btn-whatsapp btn-lg btn-block mt-lg" href="${salesWa(`Hola, necesito ayuda con mi cuenta de SanoGestion (${t?.code || session.user?.email || ''}).`)}" target="_blank" rel="noopener">${icon('whatsapp')} Escríbenos por WhatsApp</a>
      <p class="hint center mt">+58 422-190 6045</p>
      <button class="btn btn-secondary btn-block mt" id="sus-out">Cerrar sesión</button>
    </div></section></div>`;
  hideBoot();
  $('#sus-out').onclick = () => logout();
}

function planWarning() {
  const t = store.tenant;
  if (!t?.paidUntil || session.isSuper || store.isDemo) return '';
  const days = Math.ceil((tsMillis(t.paidUntil) - Date.now()) / 86400000);
  if (days > 5) return '';
  return `<div class="banner warn-top"><span>${icon('clock')} Tu plan vence ${days <= 0 ? 'hoy' : `en ${days} día(s)`} (${fmtDate(paidUntilISO(t))}).</span><a class="btn btn-sm btn-whatsapp" href="${salesWa('Hola, quiero renovar mi plan de SanoGestion.')}" target="_blank" rel="noopener">${icon('whatsapp')} Renovar</a></div>`;
}

function renderAnnouncement() {
  const el = $('#announce');
  if (!el) return;
  const a = store.announcement;
  let dismissed = '';
  try { dismissed = localStorage.getItem('sg_announce') || ''; } catch (_) {}
  if (!a?.active || !a.text || dismissed === a.updatedAt) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner announce-banner"><span>${icon('bell')} ${esc(a.text)}</span><button id="an-x" aria-label="Cerrar aviso">${icon('x')}</button></div>`;
  $('#an-x').onclick = () => { try { localStorage.setItem('sg_announce', a.updatedAt); } catch (_) {} el.innerHTML = ''; };
}

async function enterTenant(tenantId) {
  let t = null;
  try { t = await getTenant(tenantId); } catch (e) { if (e?.code !== 'unavailable') throw e; }
  if (!t && !session.isSuper) {
    // Primera vez: la sede crea su propio registro
    const u = session.user;
    t = {
      name: 'Mi tienda',
      code: usernameOf(u.email),
      ownerUid: u.uid,
      ownerEmail: u.email,
      active: true,
      createdAt: new Date().toISOString()
    };
    await createTenantDoc(tenantId, t);
  }
  if (!t && session.isSuper) { sessionStorage.removeItem('sg_view_tenant'); await renderAdminPanel(); return; }
  if (tenantState(t) !== 'ok' && !session.isSuper) { renderSuspended(t); return; }
  if (session.isSuper) sessionStorage.setItem('sg_view_tenant', tenantId);

  await store.start(tenantId);
  renderShell();
  const hash = location.hash.replace(/^#\/?/, '');
  navigate(ROUTES[hash] ? hash : 'inicio', { replace: true });
  hideBoot();
  maybeAskRate();
}

// ======================================================================
// DEMO
// ======================================================================
let demoTimer = null;
async function enterDemo(user) {
  const demo = await import('./demo.js');
  let t = null;
  try { t = await getTenant(user.uid); } catch (_) {}
  if (!t) {
    await demo.createDemoTenant(user.uid);
    await store.start(user.uid);
    await demo.seedDemoSales();
  } else {
    if (demo.demoRemainingMs(t) <= 0) { await endDemo(true); return; }
    await store.start(user.uid);
  }
  renderShell();
  navigate('inicio', { replace: true });
  hideBoot();
  startDemoTimer();
  if (!store.settings.country) { const { openCountryPicker } = await import('./country.js'); await openCountryPicker({ force: true }); navigate('inicio', { replace: true, force: true }); }
  if (!t) setTimeout(showDemoWelcome, 500);
}

function showDemoWelcome() {
  const m = openModal({
    title: '¡Bienvenido a la demo de SanoGestion!', size: 'sm',
    body: `<div class="stack">
      <p class="muted">Tienes <b>30 minutos</b> para probar todo con una tienda de ejemplo: productos, clientes, caja abierta y algunas ventas.</p>
      <div class="demo-pin-box">${icon('lock')}<div><div class="label">PIN de datos sensibles</div><div class="demo-pin-code">1234</div>
        <div class="hint">Se pide para ver Reportes, anular ventas, eliminar, ajustar inventario y cerrar la caja.</div></div></div>
      <p class="small muted">Al terminar el tiempo la sesión se cierra y todos los datos de la demo se borran.</p></div>`,
    footer: `<button class="btn btn-secondary" data-close>Explorar por mi cuenta</button><button class="btn btn-primary" id="dw-tour">${icon('star')} Hacer el recorrido guiado</button>`
  });
  m.el.querySelector('#dw-tour').onclick = () => { m.close(); startTour('general'); };
}

function startDemoTimer() {
  clearInterval(demoTimer);
  const tick = async () => {
    const { demoRemainingMs } = await import('./demo.js');
    const ms = demoRemainingMs(store.tenant);
    const el = document.getElementById('demo-left');
    if (ms <= 0) { clearInterval(demoTimer); await endDemo(false); return; }
    if (el) {
      const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
      el.textContent = `${m}:${String(sec).padStart(2, '0')}`;
      el.parentElement.classList.toggle('demo-ending', ms < 5 * 60000);
    }
    if (ms < 5 * 60000 && ms > 4 * 60000 + 58000) toast('Quedan 5 minutos de demo.', 'warning', 4000);
  };
  tick();
  demoTimer = setInterval(tick, 1000);
}

async function endDemo(silent) {
  clearInterval(demoTimer);
  const tenantId = auth.currentUser?.uid;
  teardownApp();
  store.stop();
  showBoot();
  if (!silent) demoEndedNotice = true;
  const { cleanupDemo } = await import('./demo.js');
  if (tenantId) await cleanupDemo(tenantId);
  if (auth.currentUser) await logout().catch(() => {});
}
let demoEndedNotice = false;
function showDemoEnded() {
  demoEndedNotice = false;
  openModal({
    title: 'Tu demo terminó', size: 'sm',
    body: `<div class="stack"><p class="muted">Los 30 minutos de prueba finalizaron y todos los datos de la demo fueron eliminados.</p>
      <p>¿Te gustó SanoGestion? Escríbenos por WhatsApp al <b>+58 422-190 6045</b> y obtén la cuenta de tu negocio con datos permanentes.</p></div>`,
    footer: `<a class="btn btn-whatsapp" href="${SALES_WA}" target="_blank" rel="noopener">${icon('whatsapp')} Escríbenos</a><button class="btn btn-secondary" data-close>Cerrar</button>`
  });
}
window.addEventListener('beforeunload', () => clearInterval(demoTimer));

async function renderAdminPanel() {
  teardownApp();
  store.stop();
  root().innerHTML = '<div id="admin-root"></div>';
  const mod = await import('./views/admin.js');
  currentCleanup = mod.mount($('#admin-root'), {
    enter: async (id) => { showBoot(); sessionStorage.setItem('sg_view_tenant', id); location.hash = '#/inicio'; await enterTenant(id); },
    logout: () => logout()
  });
  hideBoot();
}

async function maybeAskRate() {
  if (!store.settings.country && !session.isSuper && !store.isDemo) { const { openCountryPicker } = await import('./country.js'); await openCountryPicker({ force: true }); }
  if (!isVE()) return;
  const { autoUpdateRate } = await import('./shared.js');
  await autoUpdateRate();
  if (!(store.rate > 0)) {
    setTimeout(() => { if (!(store.rate > 0)) openRateModal(); }, 600);
  }
}

// ======================================================================
// SHELL
// ======================================================================
function navItems() {
  const groups = {};
  for (const [id, r] of Object.entries(ROUTES)) (groups[r.group] ||= []).push([id, r]);
  return Object.entries(groups).map(([g, items]) => `
    <div class="sb-section">${g}</div>
    ${items.map(([id, r]) => `<button class="nav-item" data-nav="${id}">${icon(r.icon)}<span>${r.title}</span></button>`).join('')}
  `).join('');
}

// Botón de tasa / país: en Venezuela muestra la tasa BCV; en otro país, la bandera y la moneda
const rateText = () => (isVE() ? `${bs(store.rate)}` : `${flagImg(loc().code)} ${esc(loc().cur)}`);
const ratePill = () => `<span>${isVE() ? 'Tasa BCV' : esc(loc().name)}</span><b id="sb-rate-val">${rateText()}</b>`;
async function rateClick() {
  if (isVE()) { openRateModal(); return; }
  const { requirePin } = await import('./auth.js');
  if (!(await requirePin('Cambiar el país y la moneda'))) return;
  const { openCountryPicker } = await import('./country.js');
  if (await openCountryPicker()) location.reload();
}

function renderShell() {
  teardownApp();
  const tName = store.tenant?.name || store.businessName;
  root().innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="sb-brand"><img src="/assets/logo.svg" alt=""><div><b>SanoGestion</b><small>Gestión para tiendas</small></div></div>
        <div class="sb-tenant"><div class="xs">Sede</div><b id="sb-tenant-name">${esc(tName)}</b></div>
        <button class="sb-search" id="sb-search">${icon('search')}<span>Buscar producto, cliente…</span><kbd>Ctrl K</kbd></button>
        <nav class="sb-nav">${navItems()}<button class="nav-item" id="sb-help">${icon('info')}<span>Ayuda y tutorial</span></button></nav>
        <div class="sb-foot">
          <button class="rate-pill" id="sb-rate" title="País, moneda y tasa">${ratePill()}</button>
          <div class="between">
            <div class="sb-status"><span class="dot" id="sb-dot"></span><span id="sb-net">En línea</span></div>
            <div class="row">
              ${isStandalone() ? '' : `<button class="sb-btn" data-install title="Instalar la app en este equipo">Instalar</button>`}
              <button class="sb-btn" id="sb-theme" title="Cambiar tema" style="padding:6px 8px">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            </div>
          </div>
          <div class="sb-user"><span title="${esc(session.user?.email || '')}">${esc(session.user?.isAnonymous ? 'Invitado (demo)' : usernameOf(session.user?.email))}</span><button class="sb-btn" id="sb-logout">Salir</button></div>
        </div>
      </aside>
      <div class="sidebar-backdrop" id="sb-backdrop"></div>
      <div class="main">
        ${session.isSuper ? `<div class="admin-banner"><span>${'Modo administrador'} · Viendo la sede <b>${esc(tName)}</b></span><button id="ab-back">← Volver al panel de sedes</button></div>` : ''}
        ${store.isDemo ? `<div class="demo-banner"><span>${icon('star')} <b>Modo demo</b><span class="demo-pin">${icon('lock')} PIN: <b>1234</b></span><span class="hide-sm">· Los datos se borran al terminar</span></span><span class="demo-clock">${icon('clock')} <b id="demo-left">30:00</b> restantes <button id="demo-end">Terminar demo</button></span></div>` : ''}
        ${planWarning()}
        <div id="announce"></div>
        <div class="offline-banner" id="offline-banner" hidden>Sin conexión: puedes seguir trabajando, los cambios se sincronizarán al volver internet.</div>
        <header class="topbar">
          <button class="btn btn-ghost btn-icon" id="tb-menu" aria-label="Menú">${icon('menu')}</button>
          <img src="/assets/logo.svg" alt="">
          <div class="grow" style="min-width:0"><div class="tb-title ellipsis" id="tb-title">SanoGestion</div><div class="tb-sub ellipsis">${esc(tName)}</div></div>
          ${isStandalone() ? '' : `<button class="btn btn-ghost btn-icon btn-sm" data-install aria-label="Instalar app" title="Instalar app">${icon('install')}</button>`}
          <button class="btn btn-ghost btn-icon btn-sm" id="tb-search" aria-label="Buscar" title="Buscar (Ctrl + K)">${icon('search')}</button>
          <button class="rate-mini" id="tb-rate">${rateText()}</button>
        </header>
        <main class="content" id="view"></main>
      </div>
      <nav class="bottom-nav">
        <button data-nav="inicio">${icon('home')}Inicio</button>
        <button data-nav="vender">${icon('cart')}Vender</button>
        <button data-nav="inventario">${icon('box')}Inventario</button>
        <button data-nav="cobranza">${icon('card')}Fiados</button>
        <button id="bn-more">${icon('menu')}Más</button>
      </nav>
    </div>`;

  $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { navigate(b.dataset.nav); closeSidebar(); }));
  $('#tb-menu').onclick = openSidebar;
  $('#tb-search') && ($('#tb-search').onclick = openSearch);
  $('#sb-search').onclick = () => { closeSidebar(); openSearch(); };
  $('#bn-more').onclick = openSidebar;
  $('#sb-backdrop').onclick = closeSidebar;
  $('#sb-rate').onclick = rateClick;
  $('#tb-rate').onclick = rateClick;
  $('#sb-logout').onclick = async () => {
    if (store.isDemo) { if (await confirmDialog({ title: 'Terminar demo', message: 'Se cerrará la sesión y se borrarán todos los datos de esta demo.', confirmText: 'Terminar', danger: true })) endDemo(false); return; }
    if (await confirmDialog({ title: 'Cerrar sesión', message: '¿Deseas salir de SanoGestion en este dispositivo?', confirmText: 'Salir' })) logout();
  };
  $('#sb-theme').onclick = toggleTheme;
  $('#sb-help').onclick = () => { closeSidebar(); openHelp(); };
  if (store.isDemo) $('#demo-end').onclick = async () => {
    if (await confirmDialog({ title: 'Terminar demo', message: 'Se cerrará la sesión y se borrarán todos los datos de esta demo.', confirmText: 'Terminar', danger: true })) endDemo(false);
  };
  if (session.isSuper) $('#ab-back').onclick = () => { sessionStorage.removeItem('sg_view_tenant'); location.hash = ''; showBoot(); renderAdminPanel(); };
  bindInstallButtons(root());

  storeUnsub = store.on('*', (evt) => {
    if (evt === 'settings' || evt === 'rate') {
      $('#sb-rate') && ($('#sb-rate').innerHTML = ratePill());
      $('#tb-rate') && ($('#tb-rate').innerHTML = rateText());
    }
    if (evt === 'tenant') {
      const n = store.tenant?.name || store.businessName;
      $('#sb-tenant-name') && ($('#sb-tenant-name').textContent = n);
      if (tenantState(store.tenant) !== 'ok' && !session.isSuper && !store.isDemo) renderSuspended(store.tenant);
    }
    if (evt === 'announcement') renderAnnouncement();
    if (evt === 'denied' && !session.isSuper) toast('Acceso denegado a los datos de la sede.', 'danger', 5000);
  });
  renderAnnouncement();
  updateNetwork();
}

export function openVideo() {
  openModal({
    title: 'Video tutorial de SanoGestion', sub: 'Aprende a usar el sistema en pocos minutos', size: 'lg',
    body: `<video class="help-video" controls autoplay playsinline preload="metadata" poster="/tutorial/portada.jpg" src="/tutorial/sanogestion-tutorial.mp4"></video>`,
    footer: `<button class="btn btn-primary" data-close>Cerrar</button>`
  });
}

export function openHelp() {
  const tips = [
    ['cart', '<b>Vender:</b> busca o escanea el producto, ajusta cantidades y toca <b>Cobrar</b>. Acepta pagos mixtos en $ y Bs; si falta dinero puedes dejarlo fiado a un cliente.'],
    ['wallet', '<b>Caja:</b> abre el turno con el efectivo inicial, registra gastos e ingresos y al cerrar cuenta el dinero en dólares y bolívares.'],
    ['box', '<b>Inventario:</b> crea productos con costo, margen y hasta 3 precios; usa <b>Stock</b> para registrar compras, mermas o conteos.'],
    ['card', '<b>Fiados:</b> en Cobranza ves quién te debe y registras abonos; puedes enviar un recordatorio por WhatsApp.'],
    ['shield', '<b>PIN:</b> protege reportes, anulaciones, eliminaciones, ajustes y el cierre de caja. ' + (store.isDemo ? 'En la demo es <b>1234</b>.' : 'Cámbialo en Configuración > Seguridad.')]
  ];
  openModal({
    title: 'Ayuda y tutorial', sub: 'Mira el video completo y repasa lo básico', size: 'lg',
    body: `<video class="help-video" controls preload="metadata" poster="/tutorial/portada.jpg" src="/tutorial/sanogestion-tutorial.mp4"></video>
      <div class="section-title" style="margin-top:16px">Recorridos guiados</div>
      ${tourListHTML()}
      <div class="section-title" style="margin-top:16px">Lo básico</div>
      <div class="help-tips">${tips.map(([ic, t]) => `<div class="help-tip">${icon(ic)}<div>${t}</div></div>`).join('')}</div>`,
    footer: `${isStandalone() ? '' : `<button class="btn btn-secondary" data-install>${icon('install')} Instalar app</button>`}<a class="btn btn-whatsapp" href="${SALES_WA}" target="_blank" rel="noopener">${icon('whatsapp')} Soporte por WhatsApp</a><button class="btn btn-primary" data-close>Cerrar</button>`
  });
  bindInstallButtons(document.getElementById('modals'));
  document.querySelectorAll('#modals [data-tour-id]').forEach((b) => b.onclick = () => { closeAllModals(); startTour(b.dataset.tourId); });
}

function openSidebar() { $('#sidebar')?.classList.add('open'); $('#sb-backdrop')?.classList.add('open'); }
function closeSidebar() { $('#sidebar')?.classList.remove('open'); $('#sb-backdrop')?.classList.remove('open'); }



function teardownApp() {
  stopTour();
  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error(e); } }
  currentCleanup = null; currentRoute = null;
  if (storeUnsub) { storeUnsub(); storeUnsub = null; }
  closeAllModals();
}

// ======================================================================
// ROUTER
// ======================================================================
let navToken = 0;
export async function navigate(id, { replace = false, force = false } = {}) {
  if (!ROUTES[id]) id = 'inicio';
  if (!document.getElementById('view')) return;
  if (id === currentRoute && !force) return;
  const route = ROUTES[id];
  if (route.pin) {
    const { requirePin } = await import('./auth.js');
    if (!(await requirePin(`Acceder a ${route.title}`))) {
      if (!currentRoute) navigate('inicio', { replace: true });
      else history.replaceState(null, '', '#/' + currentRoute);
      return;
    }
  }
  const token = ++navToken;
  if (currentCleanup) { try { currentCleanup(); } catch (e) { console.error(e); } currentCleanup = null; }
  currentRoute = id;
  const url = '#/' + id;
  if (replace) history.replaceState(null, '', url); else if (location.hash !== url) history.pushState(null, '', url);
  $$('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
  const tt = $('#tb-title'); if (tt) tt.textContent = route.title;
  document.title = `${route.title} · SanoGestion`;
  const view = $('#view');
  view.innerHTML = '<div class="empty"><div class="spinner" style="margin:40px auto"></div></div>';
  try {
    const mod = await route.load();
    if (token !== navToken) return;
    view.innerHTML = '';
    window.scrollTo(0, 0);
    currentCleanup = mod.mount(view, { navigate }) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card">${esc('No se pudo cargar la sección: ' + (e?.message || e))}</div>`;
  }
}

window.addEventListener('popstate', () => {
  const id = location.hash.replace(/^#\/?/, '');
  if (document.getElementById('view') && ROUTES[id] && id !== currentRoute) navigate(id, { replace: true });
});

// Atajos de teclado (punto de venta)
export function openSearch() { import('./views/search.js').then((m) => m.openSearch()); }
window.addEventListener('keydown', (e) => {
  if (!document.getElementById('view')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'F1') { e.preventDefault(); navigate('vender'); }
  if (e.key === 'F2') { e.preventDefault(); navigate('vender').then(() => setTimeout(() => $('#pos-search')?.focus(), 80)); }
});

// ======================================================================
// RED, PWA
// ======================================================================
function updateNetwork() {
  const on = navigator.onLine;
  const dot = $('#sb-dot'); const net = $('#sb-net'); const ban = $('#offline-banner');
  if (dot) dot.classList.toggle('off', !on);
  if (net) net.textContent = on ? 'En línea' : 'Sin conexión';
  if (ban) ban.hidden = on;
}
window.addEventListener('online', () => { updateNetwork(); toast('Conexión restablecida. Sincronizando…', 'info'); });
window.addEventListener('offline', updateNetwork);


if ('serviceWorker' in navigator && !sessionStorage.getItem('sg_emu')) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nueva versión disponible. Se aplicará al recargar.', 'info', 6000);
        }
      });
    });
  }).catch((e) => console.warn('SW', e));
}

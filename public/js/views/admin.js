// SanoGestion — Panel del administrador general (multisede)
import { listTenants, updateTenant, tenantSalesSince, getUsername, setUsername, createTenantDoc, DEFAULT_CATEGORIES } from '../store.js';
import { db, doc, writeBatch, createAuthUser } from '../firebase.js';
import { DOMAIN } from '../auth.js';
import { esc, usd, toast, confirmDialog, promptDialog, emptyState, initials, colorFor, startOfDay, fmtDate, toggleTheme, normalize, debounce, openModal, setBusy, sha256, nowISO } from '../utils.js';
import { icon } from '../icons.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => ALPHA[x % ALPHA.length]).join('');
const genPass = () => `Sg-${rnd(9)}!${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
const genPin = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));

/** Crea una sede nueva: cuenta en Firebase Auth + sede + configuración + PIN. */
export async function createSede({ name, username, email, password, pin }) {
  const uid = await createAuthUser(email, password);
  const now = nowISO();
  await createTenantDoc(uid, { name, code: username, ownerUid: uid, ownerEmail: email, active: true, createdAt: now, createdBy: 'admin' });
  const b = writeBatch(db);
  b.set(doc(db, 'tenants', uid, 'config', 'settings'), {
    businessName: name, rif: '', phone: '', address: '', slogan: '', receiptFormat: '80mm', receiptFooter: '¡Gracias por su compra!',
    rate: 0, rateParallel: 0, iva: 16, creditDays: 15, lowStock: 3, categories: DEFAULT_CATEGORIES, advanceCommission: 10, rechargeCommission: 10
  });
  b.set(doc(db, 'tenants', uid, 'config', 'security'), { pinHash: await sha256(`${uid}:${pin}`), updatedAt: now });
  await b.commit();
  await setUsername(username, { email, uid, createdAt: now });
  return uid;
}

export function mount(el, { enter, logout }) {
  let tenants = [];
  let demos = 0;
  let stats = {};
  const demoAlive = (t) => { const e = t.expiresAt; const ms = e && typeof e.toMillis === 'function' ? e.toMillis() : 0; return ms > Date.now(); };
  let search = '';
  let alive = true;

  el.innerHTML = `
    <div class="main" style="margin-left:0;min-height:100vh">
      <header class="topbar" style="display:flex;padding:0 20px">
        <img src="/assets/logo.svg" alt="">
        <div class="grow"><div class="tb-title">SanoGestion</div><div class="tb-sub">Panel de administración multisede</div></div>
        <button class="btn btn-ghost btn-icon" id="a-theme" title="Tema">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn btn-secondary btn-sm" id="a-out">${icon('logout')} Salir</button>
      </header>
      <main class="content">
        <div class="view-header">
          <div><h1 class="view-title">Sedes</h1><p class="view-sub">Cada sede tiene su propio inventario, caja, clientes y reportes, completamente aislados.</p></div>
          <div class="view-actions"><button class="btn btn-secondary" id="a-refresh">${icon('refresh')} Actualizar</button><button class="btn btn-primary" id="a-new">${icon('plus')} Nueva sede</button></div>
        </div>
        <div class="kpis" id="a-kpis"></div>
        <div class="card card-flush">
          <div class="inv-filters"><label class="search">${icon('search')}<input id="a-search" placeholder="Buscar sede por nombre o usuario…"></label></div>
          <div id="a-list"><div class="spinner" style="margin:40px auto"></div></div>
        </div>
      </main>
    </div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    $('#a-list').innerHTML = '<div class="spinner" style="margin:40px auto"></div>';
    try {
      const all = await listTenants();
      demos = all.filter((t) => t.demo === true && demoAlive(t)).length;
      tenants = all.filter((t) => t.demo !== true);
      // Borra en segundo plano las demos vencidas que quedaron abandonadas (navegador cerrado)
      const expired = all.filter((t) => t.demo === true && !demoAlive(t));
      if (expired.length) import('../demo.js').then(async ({ purgeDemoTenant }) => { for (const t of expired) await purgeDemoTenant(t.id); }).catch(() => {});
    } catch (e) { $('#a-list').innerHTML = `<div style="padding:20px">${emptyState('alert', 'No se pudieron cargar las sedes', esc(e.message))}</div>`; return; }
    render();
    const since = startOfDay().toISOString();
    await Promise.all(tenants.map(async (t) => {
      try {
        const sales = (await tenantSalesSince(t.id, since)).filter((s) => s.status !== 'voided');
        stats[t.id] = { total: sales.reduce((a, s) => a + (s.total || 0), 0), count: sales.length };
      } catch (_) { stats[t.id] = { total: 0, count: 0, err: true }; }
    }));
    if (alive) render();
  }

  function render() {
    const active = tenants.filter((t) => t.active !== false).length;
    const totalToday = Object.values(stats).reduce((a, s) => a + (s.total || 0), 0);
    const ticketsToday = Object.values(stats).reduce((a, s) => a + (s.count || 0), 0);
    $('#a-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Sedes</span><span class="kpi-icon tone-brand">${icon('building')}</span></div><div class="kpi-value">${tenants.length}</div><div class="kpi-sub">${active} activas</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Suspendidas</span><span class="kpi-icon tone-warning">${icon('lock')}</span></div><div class="kpi-value">${tenants.length - active}</div><div class="kpi-sub">sin acceso</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Demos activas</span><span class="kpi-icon tone-violet">${icon('star')}</span></div><div class="kpi-value">${demos}</div><div class="kpi-sub">pruebas de 30 min en curso</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ventas de hoy (todas)</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(totalToday)}</div><div class="kpi-sub">${ticketsToday} ticket(s)</div></div>`;
    const q = normalize(search);
    const list = tenants.filter((t) => !q || normalize(t.name).includes(q) || normalize(t.code).includes(q) || normalize(t.ownerEmail).includes(q));
    $('#a-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Sede</th><th>Usuario</th><th class="c">Estado</th><th class="r">Ventas hoy</th><th class="hide-sm">Creada</th><th class="r">Acciones</th></tr></thead><tbody>
      ${list.map((t) => {
        const st = stats[t.id];
        return `<tr>
          <td><div class="row"><span class="avatar" style="background:${colorFor(t.code || t.name)}">${esc(initials(t.name))}</span><div><div class="t-name">${esc(t.name || 'Sin nombre')}</div><div class="t-sub">${esc(t.id.slice(0, 8))}…</div></div></div></td>
          <td><span class="badge badge-neutral">${esc(t.code || '')}</span></td>
          <td class="c">${t.active === false ? '<span class="badge badge-danger">Suspendida</span>' : '<span class="badge badge-success">Activa</span>'}</td>
          <td class="r num">${st ? `<b>${usd(st.total)}</b><div class="t-sub">${st.count} ticket(s)</div>` : '<span class="faint">…</span>'}</td>
          <td class="hide-sm">${fmtDate(t.createdAt)}</td>
          <td class="r nowrap">
            <button class="btn btn-primary btn-sm" data-enter="${t.id}">${icon('arrowRight')} Entrar</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-ren="${t.id}" title="Renombrar">${icon('edit')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-tog="${t.id}" title="${t.active === false ? 'Activar' : 'Suspender'}">${icon(t.active === false ? 'unlock' : 'power')}</button>
          </td></tr>`;
      }).join('')}</tbody></table></div>` : `<div style="padding:20px">${emptyState('building', 'No hay sedes', 'Las sedes aparecen aquí cuando se crean sus cuentas.')}</div>`;
    el.querySelectorAll('[data-enter]').forEach((b) => b.onclick = () => enter(b.dataset.enter));
    el.querySelectorAll('[data-ren]').forEach((b) => b.onclick = async () => {
      const t = tenants.find((x) => x.id === b.dataset.ren);
      const name = (await promptDialog({ title: 'Renombrar sede', label: 'Nombre de la sede', value: t.name }))?.trim();
      if (!name || name === t.name) return;
      await updateTenant(t.id, { name }); t.name = name; render(); toast('Sede renombrada');
    });
    el.querySelectorAll('[data-tog]').forEach((b) => b.onclick = async () => {
      const t = tenants.find((x) => x.id === b.dataset.tog);
      const suspend = t.active !== false;
      if (!(await confirmDialog({ title: suspend ? 'Suspender sede' : 'Activar sede', message: suspend ? `La sede <b>${esc(t.name)}</b> no podrá acceder a sus datos hasta que la reactives.` : `La sede <b>${esc(t.name)}</b> recuperará el acceso.`, confirmText: suspend ? 'Suspender' : 'Activar', danger: suspend }))) return;
      await updateTenant(t.id, { active: !suspend }); t.active = !suspend; render();
      toast(suspend ? 'Sede suspendida' : 'Sede activada');
    });
  }

  $('#a-new').onclick = () => newSedeModal();
  $('#a-out').onclick = () => logout();
  $('#a-theme').onclick = (e) => { const n = toggleTheme(); e.currentTarget.innerHTML = icon(n === 'dark' ? 'sun' : 'moon'); };
  $('#a-refresh').onclick = () => { stats = {}; load(); };
  $('#a-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  function newSedeModal() {
    const next = 'sede' + String(tenants.reduce((mx, t) => { const m = /^sede(\d+)$/.exec(t.code || ''); return m ? Math.max(mx, +m[1]) : mx; }, 0) + 1).padStart(2, '0');
    const m = openModal({
      title: 'Nueva sede', sub: 'Se crea la cuenta de acceso en Firebase y la sede queda lista y vacía', size: 'lg',
      body: `<form class="form-grid" data-f autocomplete="off">
        <div class="field full"><label>Nombre de la sede / negocio *</label><input class="input" name="name" placeholder="Ej.: Bodega La Esperanza" autofocus></div>
        <div class="field"><label>Usuario *</label><input class="input" name="username" value="${next}" autocapitalize="off" spellcheck="false"><span class="hint">Letras, números, punto o guion. Con este nombre inicia sesión.</span></div>
        <div class="field"><label>Correo</label><input class="input" name="email" placeholder="${next}@${DOMAIN}" inputmode="email"><span class="hint">Opcional. Si lo dejas vacío se usa usuario@${DOMAIN}.</span></div>
        <div class="field"><label>Contraseña *</label><div class="row"><input class="input" name="password" value="${genPass()}"><button type="button" class="btn btn-secondary btn-icon" data-gp title="Generar">${icon('refresh')}</button></div><span class="hint">Mínimo 8 caracteres.</span></div>
        <div class="field"><label>PIN de administrador *</label><div class="row"><input class="input" name="pin" value="${genPin()}" inputmode="numeric" maxlength="12"><button type="button" class="btn btn-secondary btn-icon" data-gpin title="Generar">${icon('refresh')}</button></div><span class="hint">4 a 12 dígitos. Protege reportes y acciones sensibles.</span></div>
        <div class="error-msg full" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Crear sede</button>`
    });
    const f = m.el.querySelector('[data-f]'); const F = f.elements; const err = m.el.querySelector('[data-err]');
    m.el.querySelector('[data-gp]').onclick = () => { F.password.value = genPass(); };
    m.el.querySelector('[data-gpin]').onclick = () => { F.pin.value = genPin(); };
    F.username.oninput = () => { F.email.placeholder = `${F.username.value.trim().toLowerCase() || 'usuario'}@${DOMAIN}`; };
    const save = async (e) => {
      e?.preventDefault(); err.textContent = '';
      const name = F.name.value.trim();
      const username = F.username.value.trim().toLowerCase();
      const email = (F.email.value.trim() || `${username}@${DOMAIN}`).toLowerCase();
      const password = F.password.value;
      const pin = F.pin.value.trim();
      if (!name) { err.textContent = 'Indica el nombre de la sede.'; F.name.focus(); return; }
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) { err.textContent = 'Usuario inválido: 3 a 30 caracteres (letras, números, punto o guion).'; F.username.focus(); return; }
      if (username === 'admin' || username === 'demo') { err.textContent = 'Ese usuario está reservado.'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Correo inválido.'; F.email.focus(); return; }
      if (password.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; F.password.focus(); return; }
      if (!/^\d{4,12}$/.test(pin)) { err.textContent = 'El PIN debe tener entre 4 y 12 dígitos.'; F.pin.focus(); return; }
      if (tenants.some((t) => (t.code || '').toLowerCase() === username)) { err.textContent = 'Ya existe una sede con ese usuario.'; return; }
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Creando…');
      try {
        if (await getUsername(username)) { err.textContent = 'Ese usuario ya está registrado.'; setBusy(btn, false); return; }
        await createSede({ name, username, email, password, pin });
        m.close();
        showCredentials({ name, username, email, password, pin });
        stats = {}; load();
      } catch (ex) {
        err.textContent = ex?.code === 'auth/email-already-in-use' ? 'Ese correo ya tiene una cuenta en SanoGestion.' : ex?.code === 'auth/invalid-email' ? 'Correo inválido.' : ex?.code === 'auth/weak-password' ? 'Contraseña demasiado débil.' : (ex?.message || String(ex));
        setBusy(btn, false);
      }
    };
    f.onsubmit = save;
    m.el.querySelector('[data-ok]').onclick = save;
  }

  function showCredentials(c) {
    const text = `¡Bienvenido a SanoGestion!\n\nSede: ${c.name}\nEnlace: https://sano-gestion.web.app\nUsuario: ${c.username}\nCorreo: ${c.email}\nContraseña: ${c.password}\nPIN de administrador: ${c.pin}\n\nTe recomendamos cambiar la contraseña y el PIN en Configuración > Seguridad.`;
    const m = openModal({
      title: 'Sede creada', sub: 'Entrega estos datos al cliente. La contraseña no se volverá a mostrar.', size: 'sm',
      body: `<div class="summary-box">
        <div class="summary-row"><span class="muted">Sede</span><b>${esc(c.name)}</b></div>
        <div class="summary-row"><span class="muted">Usuario</span><b>${esc(c.username)}</b></div>
        <div class="summary-row"><span class="muted">Correo</span><b style="word-break:break-all">${esc(c.email)}</b></div>
        <div class="summary-row"><span class="muted">Contraseña</span><b class="mono">${esc(c.password)}</b></div>
        <div class="summary-row"><span class="muted">PIN</span><b class="mono">${esc(c.pin)}</b></div>
      </div>`,
      footer: `<button class="btn btn-secondary" data-copy>${icon('layers')} Copiar datos</button><a class="btn btn-secondary" data-wa target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a><button class="btn btn-primary" data-close>Listo</button>`
    });
    m.el.querySelector('[data-wa]').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    m.el.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast('Datos copiados al portapapeles'); } catch (_) { toast('No se pudo copiar automáticamente', 'warning'); }
    };
  }

  load();
  return () => { alive = false; };
}

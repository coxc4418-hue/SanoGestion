// SanoGestion — Configuración de la sede
import { store, updateTenant } from '../store.js';
import { session, requirePin, changePassword, authErrorMessage, usernameOf } from '../auth.js';
import { esc, num, parseNum, toast, openModal, confirmDialog, setBusy, fmtDateTime, download, todayKey, nowISO, toggleTheme } from '../utils.js';
import { icon } from '../icons.js';
import { openRateModal } from '../shared.js';
import { openCategories } from './inventory.js';
import { isStandalone, bindInstallButtons } from '../install.js';

const DATA_COLLECTIONS = ['products', 'customers', 'sales', 'debts', 'debt_payments', 'cash_shifts', 'cash_movements', 'inventory_logs', 'held_sales', 'services'];

export function mount(el) {
  const render = () => {
    const s = store.settings;
    const theme = document.documentElement.dataset.theme;
    el.innerHTML = `
      <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Datos del negocio, tasas, seguridad y respaldos</p></div></div>
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('building')}</span>Datos del negocio</div></div>
          <form class="form-grid" id="f-biz">
            <div class="field full"><label>Nombre del negocio *</label><input class="input" name="businessName" value="${esc(store.businessName)}" required></div>
            <div class="field"><label>RIF / Documento</label><input class="input" name="rif" value="${esc(s.rif)}" placeholder="J-12345678-9"></div>
            <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s.phone)}"></div>
            <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s.address)}"></div>
            <div class="field"><label>Formato del recibo</label><select class="select" name="receiptFormat">
              <option value="80mm" ${s.receiptFormat === '80mm' ? 'selected' : ''}>Térmica 80 mm</option>
              <option value="58mm" ${s.receiptFormat === '58mm' ? 'selected' : ''}>Térmica 58 mm</option>
              <option value="carta" ${s.receiptFormat === 'carta' ? 'selected' : ''}>Carta / A4</option></select></div>
            <div class="field"><label>Mensaje al pie del recibo</label><input class="input" name="receiptFooter" value="${esc(s.receiptFooter)}"></div>
            <div class="full"><button class="btn btn-primary">${icon('check')} Guardar datos</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('dollar')}</span>Moneda, impuestos y crédito</div></div>
          <div class="summary-box between mb">
            <div><div class="label">Tasa BCV del día</div><div class="kpi-value text-bs" style="font-size:22px;margin:0">Bs ${num(s.rate)}</div><div class="xs muted">${s.rateUpdatedAt ? 'Actualizada ' + fmtDateTime(s.rateUpdatedAt) : 'Sin configurar'}</div></div>
            <button class="btn btn-primary" id="b-rate">${icon('refresh')} Actualizar tasa</button>
          </div>
          <form class="form-grid" id="f-tax">
            <div class="field"><label>Tasa paralela / referencial</label><input class="input" name="rateParallel" inputmode="decimal" value="${s.rateParallel ? num(s.rateParallel) : ''}" placeholder="Opcional"></div>
            <div class="field"><label>IVA (%)</label><input class="input" name="iva" inputmode="decimal" value="${num(s.iva, 2)}"></div>
            <div class="field"><label>Plazo de los fiados (días)</label><input class="input" name="creditDays" inputmode="numeric" value="${s.creditDays}"></div>
            <div class="field"><label>Stock mínimo por defecto</label><input class="input" name="lowStock" inputmode="decimal" value="${s.lowStock}"></div>
            <div class="full row-wrap"><button class="btn btn-primary">${icon('check')} Guardar</button><button type="button" class="btn btn-secondary" id="b-cats">${icon('tag')} Categorías</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('shield')}</span>Seguridad</div></div>
          <div class="stack">
            <div class="summary-box between"><div><div class="bold">PIN de administrador</div><div class="small muted">${store.hasPin() ? 'Protege reportes, anulaciones, eliminaciones, ajustes y cierre de caja.' : 'Sin PIN: cualquiera puede acceder a las áreas sensibles.'}</div></div>
              <button class="btn btn-secondary" id="b-pin">${icon('lock')} ${store.hasPin() ? 'Cambiar PIN' : 'Crear PIN'}</button></div>
            <div class="summary-box between"><div><div class="bold">Contraseña de acceso</div><div class="small muted">Usuario: <b>${esc(usernameOf(session.user?.email))}</b></div></div>
              <button class="btn btn-secondary" id="b-pass" ${session.isSuper || store.isDemo ? 'disabled title="No disponible en este modo"' : ''}>${icon('edit')} Cambiar</button></div>
            ${isStandalone() ? '' : `<div class="summary-box between"><div><div class="bold">App instalable</div><div class="small muted">Instala SanoGestion en este equipo: ícono propio y funciona sin internet.</div></div>
              <button class="btn btn-primary" id="b-install" data-install>${icon('install')} Instalar app</button></div>`}
            <div class="summary-box between"><div><div class="bold">Apariencia</div><div class="small muted">Tema ${theme === 'dark' ? 'oscuro' : 'claro'}</div></div>
              <button class="btn btn-secondary" id="b-theme">${icon(theme === 'dark' ? 'sun' : 'moon')} Usar tema ${theme === 'dark' ? 'claro' : 'oscuro'}</button></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><span class="ico">${icon('download')}</span>Respaldo de datos</div></div>
          <p class="small muted mb">Tus datos se guardan automáticamente en la nube (Firebase) y funcionan sin conexión. Además puedes descargar una copia completa.</p>
          <div class="stack">
            <button class="btn btn-secondary btn-block" id="b-backup" style="justify-content:flex-start">${icon('download')} Descargar copia de seguridad (.json)</button>
            <button class="btn btn-secondary btn-block" id="b-restore" style="justify-content:flex-start">${icon('upload')} Restaurar copia de seguridad</button>
            <input type="file" accept=".json,application/json" id="file-restore" hidden>
            <button class="btn btn-danger-soft btn-block" id="b-reset" style="justify-content:flex-start">${icon('trash')} Borrar todos los datos de la sede</button>
          </div>
        </div>
      </div>
      <p class="center xs faint mt-lg">SanoGestion v1.0.0 · Sede ${esc(store.tenant?.code || '')} · ${esc(session.user?.email || '')}</p>`;

    const biz = el.querySelector('#f-biz');
    biz.onsubmit = async (e) => {
      e.preventDefault();
      const F = biz.elements;
      const name = F.businessName.value.trim();
      if (!name) { toast('El nombre es obligatorio', 'warning'); return; }
      const btn = biz.querySelector('button'); setBusy(btn, true);
      await store.saveSettings({ businessName: name, rif: F.rif.value.trim(), phone: F.phone.value.trim(), address: F.address.value.trim(), receiptFormat: F.receiptFormat.value, receiptFooter: F.receiptFooter.value.trim() });
      try { await updateTenant(store.tenantId, { name, updatedAt: nowISO() }); } catch (_) {}
      setBusy(btn, false);
      toast('Datos del negocio guardados');
    };
    const tax = el.querySelector('#f-tax');
    tax.onsubmit = async (e) => {
      e.preventDefault();
      const F = tax.elements;
      await store.saveSettings({ rateParallel: parseNum(F.rateParallel.value), iva: parseNum(F.iva.value), creditDays: Math.max(1, Math.round(parseNum(F.creditDays.value)) || 15), lowStock: parseNum(F.lowStock.value) });
      toast('Configuración guardada');
    };
    bindInstallButtons(el);
    el.querySelector('#b-rate').onclick = openRateModal;
    el.querySelector('#b-cats').onclick = () => openCategories();
    el.querySelector('#b-pin').onclick = pinModal;
    el.querySelector('#b-pass').onclick = passModal;
    el.querySelector('#b-theme').onclick = () => { toggleTheme(); render(); };
    el.querySelector('#b-backup').onclick = backup;
    el.querySelector('#b-restore').onclick = async () => { if (await requirePin('Restaurar copia de seguridad')) el.querySelector('#file-restore').click(); };
    el.querySelector('#file-restore').onchange = restore;
    el.querySelector('#b-reset').onclick = reset;
  };

  async function pinModal() {
    if (store.hasPin() && !(await requirePin('Cambiar el PIN de administrador'))) return;
    const m = openModal({
      title: store.hasPin() ? 'Cambiar PIN' : 'Crear PIN', size: 'sm',
      body: `<form class="stack" data-f>
        <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input input-lg center" type="password" inputmode="numeric" data-a autofocus maxlength="12"></div>
        <div class="field"><label>Confirmar PIN</label><input class="input input-lg center" type="password" inputmode="numeric" data-b maxlength="12"></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar PIN</button>`
    });
    const save = async (e) => {
      e?.preventDefault();
      const a = m.el.querySelector('[data-a]').value.trim(), b = m.el.querySelector('[data-b]').value.trim();
      if (!/^\d{4,12}$/.test(a)) { toast('El PIN debe tener entre 4 y 12 dígitos', 'warning'); return; }
      if (a !== b) { toast('Los PIN no coinciden', 'warning'); return; }
      await store.setPin(a);
      session.pinUnlockedUntil = Date.now() + 10 * 60 * 1000;
      m.close(); toast('PIN guardado'); render();
    };
    m.el.querySelector('[data-f]').onsubmit = save;
    m.el.querySelector('[data-ok]').onclick = save;
  }

  function passModal() {
    const m = openModal({
      title: 'Cambiar contraseña', size: 'sm',
      body: `<form class="stack" data-f>
        <div class="field"><label>Contraseña actual</label><input class="input" type="password" data-c autocomplete="current-password" autofocus></div>
        <div class="field"><label>Nueva contraseña (mín. 8 caracteres)</label><input class="input" type="password" data-n autocomplete="new-password"></div>
        <div class="field"><label>Confirmar nueva contraseña</label><input class="input" type="password" data-r autocomplete="new-password"></div>
        <div class="error-msg" data-e></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Cambiar contraseña</button>`
    });
    const q = (s) => m.el.querySelector(s);
    const save = async (e) => {
      e?.preventDefault();
      const c = q('[data-c]').value, n = q('[data-n]').value, r = q('[data-r]').value;
      if (n.length < 8) { q('[data-e]').textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
      if (n !== r) { q('[data-e]').textContent = 'Las contraseñas no coinciden.'; return; }
      const btn = q('[data-ok]'); setBusy(btn, true);
      try { await changePassword(c, n); m.close(); toast('Contraseña actualizada'); }
      catch (ex) { q('[data-e]').textContent = ex?.code === 'auth/invalid-credential' || ex?.code === 'auth/wrong-password' ? 'La contraseña actual es incorrecta.' : authErrorMessage(ex); setBusy(btn, false); }
    };
    q('[data-f]').onsubmit = save;
    q('[data-ok]').onclick = save;
  }

  async function backup() {
    const btn = el.querySelector('#b-backup'); setBusy(btn, true, 'Generando…');
    try {
      const out = { app: 'SanoGestion', version: 1, tenant: store.tenant?.code || store.tenantId, businessName: store.businessName, exportedAt: nowISO(), data: {} };
      for (const c of DATA_COLLECTIONS) out.data[c] = await store.listAll(c);
      out.data.config = [{ id: 'settings', ...store.settings }];
      download(`respaldo_sanogestion_${(store.tenant?.code || 'sede')}_${todayKey()}.json`, JSON.stringify(out), 'application/json');
      toast('Copia de seguridad descargada');
    } catch (e) { toast('Error al generar la copia: ' + e.message, 'danger'); }
    setBusy(btn, false);
  }

  async function restore(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let json;
    try { json = JSON.parse(await file.text()); } catch (_) { toast('El archivo no es un respaldo válido', 'danger'); return; }
    if (json.app !== 'SanoGestion' || !json.data) { toast('El archivo no es un respaldo de SanoGestion', 'danger'); return; }
    const count = Object.values(json.data).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0);
    if (!(await confirmDialog({ title: 'Restaurar copia', message: `Se cargarán ${count} registros del respaldo de <b>${esc(json.businessName || '')}</b> (${fmtDateTime(json.exportedAt)}). Los registros con el mismo identificador se sobrescriben.`, confirmText: 'Restaurar' }))) return;
    try {
      toast('Restaurando… no cierres la aplicación', 'info', 4000);
      for (const [col, list] of Object.entries(json.data)) {
        if (![...DATA_COLLECTIONS, 'config'].includes(col) || !Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i += 80) {
          const b = store.batch();
          list.slice(i, i + 80).forEach(({ id, ...rest }) => { if (id && !(col === 'config' && id !== 'settings')) b.set(store.ref(col, id), rest); });
          await store.commit(b);
        }
      }
      toast('Copia restaurada correctamente');
    } catch (ex) { toast('Error al restaurar: ' + ex.message, 'danger', 5000); }
  }

  async function reset() {
    if (!(await requirePin('Borrar todos los datos de la sede'))) return;
    const m = openModal({
      title: 'Borrar todos los datos', size: 'sm',
      body: `<div class="stack"><p class="muted">Se eliminarán <b>productos, clientes, ventas, fiados, caja y servicios</b> de esta sede. La configuración se conserva. Esta acción no se puede deshacer.</p>
        <p class="small">Te recomendamos descargar una copia de seguridad antes.</p>
        <div class="field"><label>Escribe <b>BORRAR</b> para confirmar</label><input class="input" data-c autofocus></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" data-ok>Borrar definitivamente</button>`
    });
    m.el.querySelector('[data-ok]').onclick = async () => {
      if (m.el.querySelector('[data-c]').value.trim().toUpperCase() !== 'BORRAR') { toast('Escribe BORRAR para confirmar', 'warning'); return; }
      const btn = m.el.querySelector('[data-ok]'); setBusy(btn, true, 'Borrando…');
      try {
        for (const c of DATA_COLLECTIONS) {
          const list = await store.listAll(c);
          for (let i = 0; i < list.length; i += 80) {
            const b = store.batch();
            list.slice(i, i + 80).forEach((d) => b.delete(store.ref(c, d.id)));
            await store.commit(b);
          }
        }
        m.close(); toast('Datos eliminados. La sede quedó en blanco.');
      } catch (ex) { toast(ex.message, 'danger'); setBusy(btn, false); }
    };
  }

  render();
  const offs = [store.on('settings', render), store.on('tenant', render)];
  return () => offs.forEach((o) => o());
}

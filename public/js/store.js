// SanoGestion — Capa de datos multisede (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
  writeBatch, increment
} from './firebase.js';
import { addDays, startOfDay, sha256, toast, applyLocale, isVE } from './utils.js';

export const DEFAULT_CATEGORIES = [
  'Víveres', 'Bebidas', 'Lácteos', 'Charcutería', 'Limpieza', 'Higiene personal',
  'Snacks y dulces', 'Panadería', 'Enlatados', 'Frutas y verduras', 'Carnes', 'Varios'
];
export const UNITS = ['Unidad', 'Kilogramo', 'Gramo', 'Litro', 'Paquete', 'Caja', 'Bulto', 'Docena'];

const DEFAULT_SETTINGS = {
  businessName: '',
  rif: '',
  phone: '',
  address: '',
  slogan: '',
  receiptFormat: '80mm',
  receiptFooter: '¡Gracias por su compra!',
  rate: 0,
  rateParallel: 0,
  rateUpdatedAt: null,
  iva: 16,
  creditDays: 15,
  lowStock: 3,
  categories: DEFAULT_CATEGORIES,
  advanceCommission: 10,
  rechargeCommission: 10
};

class Store {
  constructor() {
    this.tenantId = null;
    this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.security = {};
    this.products = [];
    this.customers = [];
    this.openDebts = [];
    this.heldSales = [];
    this.openShift = null;
    this.recentSales = [];
    this.ready = false;
    this._unsubs = [];
    this._listeners = {};
    this._loaded = new Set();
  }

  // ---------- Eventos ----------
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) { (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } }); }

  // ---------- Referencias ----------
  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  batch() {
    const b = writeBatch(db);
    const exp = this.demoExpireAt;
    if (!exp) return b;
    // Modo demo: cada documento lleva expireAt para que la política TTL lo elimine si la demo se abandona
    return {
      set: (ref, data, opts) => { b.set(ref, { ...data, expireAt: exp }, opts); return this; },
      update: (ref, data) => { b.update(ref, { ...data, expireAt: exp }); return this; },
      delete: (ref) => { b.delete(ref); return this; },
      commit: () => b.commit()
    };
  }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /**
   * Confirma un lote. La caché local aplica el cambio al instante (también sin internet);
   * esperamos la confirmación del servidor como máximo unos segundos para no bloquear la caja.
   */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la sede esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }

  async save(name, id, data, merge = true) {
    const b = this.batch();
    b.set(this.ref(name, id), data, { merge });
    await this.commit(b);
  }
  async remove(name, id) {
    const b = this.batch();
    b.delete(this.ref(name, id));
    await this.commit(b);
  }

  // ---------- Ciclo de vida ----------
  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this.demoExpireAt = null;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'products', 'customers', 'debts', 'held', 'shift', 'sales'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };

    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));

    listen(this.tenantRef(), 'tenant', (s) => {
      this.tenant = s.exists() ? { id: s.id, ...s.data() } : null;
      this.demoExpireAt = this.tenant?.demo ? (this.tenant.expireAt || this.tenant.expiresAt || null) : null;
    });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      applyLocale(this.settings.country || 'VE');
      if (!Array.isArray(this.settings.categories) || !this.settings.categories.length) this.settings.categories = DEFAULT_CATEGORIES;
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(this.col('products'), 'products', (s) => {
      this.products = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
    });
    listen(this.col('customers'), 'customers', (s) => {
      this.customers = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
    });
    listen(query(this.col('debts'), where('status', '==', 'open')), 'debts', (s) => {
      this.openDebts = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    listen(this.col('held_sales'), 'held', (s) => {
      this.heldSales = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
    listen(query(this.col('cash_shifts'), where('status', '==', 'open')), 'shift', (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
      this.openShift = list[0] || null;
    });
    const since = startOfDay(addDays(new Date(), -30)).toISOString();
    listen(query(this.col('sales'), where('date', '>=', since)), 'sales', (s) => {
      this.recentSales = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    });

    // Nunca bloquear más de 8 s (p. ej. sin internet y sin caché)
    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
    this.ready = false;
    this.tenant = null; this.products = []; this.customers = []; this.openDebts = [];
    this.heldSales = []; this.openShift = null; this.recentSales = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {};
  }

  // ---------- Ajustes ----------
  get rate() { return isVE() ? (Number(this.settings.rate) || 0) : 1; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi negocio'; }

  /** País de trabajo: moneda, formas de pago y prefijo de WhatsApp */
  async setCountry(code) {
    const l = applyLocale(code);
    await this.saveSettings({ country: code, currency: l.cur, countrySetAt: new Date().toISOString() });
    this.emit('rate', this.rate);
  }
  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }

  async setRate(rate, auto = false) {
    const v = Number(rate);
    if (!(v > 0)) throw new Error('Tasa inválida');
    await this.saveSettings({ rate: v, rateUpdatedAt: new Date().toISOString(), rateSource: auto ? 'bcv' : 'manual' });
    this.emit('rate', v);
  }

  // ---------- PIN de administrador ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) {
      const s = await getDoc(this.ref('config', 'security')).catch(() => null);
      if (s?.exists()) this.security = s.data();
    }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Consultas ----------
  product(id) { return this.products.find((p) => p.id === id); }
  customer(id) { return this.customers.find((c) => c.id === id); }

  async salesBetween(fromISO, toISO) {
    const q = query(this.col('sales'), where('date', '>=', fromISO), where('date', '<=', toISO));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listBetween(name, fromISO, toISO) {
    const q = query(this.col(name), where('date', '>=', fromISO), where('date', '<=', toISO));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listWhere(name, field, value, order = 'date', max = 200) {
    const q = query(this.col(name), where(field, '==', value), orderBy(order, 'desc'), limit(max));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async listAll(name) {
    const s = await getDocs(this.col(name));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async getOne(name, id) {
    const s = await getDoc(this.ref(name, id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }
  async closedShifts(max = 30) {
    const q = query(this.col('cash_shifts'), where('status', '==', 'closed'));
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, max);
  }

  customerBalance(customerId) {
    return this.openDebts.filter((d) => d.customerId === customerId).reduce((s, d) => s + (Number(d.balance) || 0), 0);
  }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) {
  await setDoc(doc(db, 'tenants', id), data, { merge: true });
}
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'sales'), where('date', '>=', fromISO)));
  return s.docs.map((d) => d.data());
}
export async function getTenant(id) {
  const s = await getDoc(doc(db, 'tenants', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function createTenantDoc(id, data) {
  await setDoc(doc(db, 'tenants', id), data);
}

export async function getUsername(username) {
  const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function setUsername(username, data) {
  await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data);
}
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() { const s = await getDoc(doc(db, 'system', 'announcement')); return s.exists() ? s.data() : null; }
export async function deleteTenantDoc(id) {
  await deleteDoc(doc(db, 'tenants', id));
}

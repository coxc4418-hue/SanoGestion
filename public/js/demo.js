// SanoGestion — Modo demo (sesión anónima de 30 minutos con datos de ejemplo)
import { auth, db, doc, collection, writeBatch, getDoc, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_CATEGORIES } from './store.js';
import { processSale } from './ops.js';
import { fetchBcvRate } from './shared.js';
import { round2, nowISO, todayKey, sha256 } from './utils.js';

export const DEMO_PIN = '1234';

export const DEMO_MINUTES = 30;
export const DATA_COLLECTIONS = ['products', 'customers', 'sales', 'debts', 'debt_payments', 'cash_shifts', 'cash_movements', 'inventory_logs', 'held_sales', 'services', 'config'];

export async function startDemo() {
  await signInAnonymously(auth);
}

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const SAMPLE_PRODUCTS = [
  ['Harina de maíz 1 kg', 'Víveres', 0.85, 1.20, 48, '7591002000011'],
  ['Arroz blanco 1 kg', 'Víveres', 0.95, 1.35, 40, '7591002000028'],
  ['Pasta larga 1 kg', 'Víveres', 1.05, 1.50, 30, '7591002000035'],
  ['Aceite vegetal 1 L', 'Víveres', 2.40, 3.20, 18, '7591002000042'],
  ['Azúcar 1 kg', 'Víveres', 1.00, 1.40, 25, '7591002000059'],
  ['Café molido 250 g', 'Víveres', 2.10, 3.00, 15, '7591002000066'],
  ['Refresco cola 2 L', 'Bebidas', 1.40, 2.00, 24, '7591002000073'],
  ['Agua mineral 1,5 L', 'Bebidas', 0.55, 0.90, 36, '7591002000080'],
  ['Malta 355 ml', 'Bebidas', 0.60, 1.00, 2, '7591002000097'],
  ['Leche completa 1 L', 'Lácteos', 1.30, 1.80, 20, '7591002000103'],
  ['Queso blanco (kg)', 'Lácteos', 4.50, 6.50, 6, '7591002000110', 'Kilogramo'],
  ['Mortadela (kg)', 'Charcutería', 3.20, 4.80, 0, '7591002000127', 'Kilogramo'],
  ['Jabón en polvo 1 kg', 'Limpieza', 2.20, 3.10, 12, '7591002000134'],
  ['Papel higiénico x4', 'Higiene personal', 1.60, 2.30, 22, '7591002000141'],
  ['Galletas de soda', 'Snacks y dulces', 0.70, 1.10, 30, '7591002000158'],
  ['Pan campesino', 'Panadería', 0.80, 1.25, 14, '7591002000165']
];

/** Crea la sede de demostración con datos de ejemplo (productos, clientes, caja abierta y ventas). */
export async function createDemoTenant(uid) {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + DEMO_MINUTES * 60 * 1000);
  const expireAt = Timestamp.fromMillis(now + (DEMO_MINUTES + 10) * 60 * 1000);
  let rate = 0;
  try { rate = (await Promise.race([fetchBcvRate(), new Promise((_, r) => setTimeout(() => r(new Error('t')), 3500))])).rate; } catch (_) { rate = 0; }
  if (!(rate > 0)) rate = 40;
  rate = round2(rate);

  const tRef = doc(db, 'tenants', uid);
  const b1 = writeBatch(db);
  b1.set(tRef, { name: 'Bodega Demo', code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt, expireAt });
  await b1.commit();

  const p = (name) => doc(db, 'tenants', uid, name, doc(collection(db, 'tenants', uid, name)).id);
  const b = writeBatch(db);
  b.set(doc(db, 'tenants', uid, 'config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO(), expireAt });
  b.set(doc(db, 'tenants', uid, 'config', 'settings'), {
    businessName: 'Bodega Demo', rif: 'J-00000000-0', phone: '0414-0000000', address: 'Calle Principal, Local 1',
    receiptFormat: '80mm', receiptFooter: '¡Gracias por probar SanoGestion!', rate, rateUpdatedAt: nowISO(), rateParallel: 0,
    iva: 16, creditDays: 15, lowStock: 3, categories: DEFAULT_CATEGORIES, advanceCommission: 10, rechargeCommission: 10, expireAt
  });
  for (const [name, category, cost, price, stock, barcode, unit] of SAMPLE_PRODUCTS) {
    b.set(p('products'), {
      name, category, cost, price, prices: [price, round2(price * 0.95), 0], margins: [round2((price - cost) / cost * 100), null, null],
      stock, minStock: 4, unit: unit || 'Unidad', barcode, code: barcode, provider: 'Distribuidora Demo', costMode: 'unit',
      bulkQty: 0, bulkPrice: 0, exempt: true, active: true, image: null, createdAt: nowISO(), updatedAt: nowISO(), expireAt
    });
  }
  for (const [name, phone] of [['María González', '0414-1234567'], ['José Rodríguez', '0424-7654321'], ['Carmen Pérez', '0412-5551234']]) {
    b.set(p('customers'), { name, phone, idDoc: '', address: 'Sector Centro', creditLimit: 0, notes: '', balance: 0, createdAt: nowISO(), expireAt });
  }
  b.set(p('cash_shifts'), {
    status: 'open', openedAt: nowISO(), openedBy: 'demo', dayKey: todayKey(), number: 'T-DEMO',
    openingUSD: 20, openingBs: round2(rate * 60), rateAtOpen: rate, inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note: 'Turno de demostración', expireAt
  });
  await b.commit();
}

/** Registra algunas ventas de ejemplo para que el panel se vea con actividad. */
export async function seedDemoSales() {
  const byName = (n) => store.products.find((x) => x.name === n);
  const line = (n, qty) => { const x = byName(n); return x ? { productId: x.id, name: x.name, presentation: x.unit, multiplier: 1, qty, price: x.price, cost: x.cost, exempt: true, category: x.category } : null; };
  const rate = store.rate;
  const sales = [
    { items: [line('Harina de maíz 1 kg', 3), line('Refresco cola 2 L', 1)], payments: [{ method: 'efectivo_usd', currency: 'USD', amount: 10 }], changeCurrency: 'BS' },
    { items: [line('Arroz blanco 1 kg', 2), line('Aceite vegetal 1 L', 1), line('Café molido 250 g', 1)], payments: [{ method: 'pagomovil', currency: 'BS', amount: round2(8.9 * rate) }] },
    { items: [line('Leche completa 1 L', 2), line('Pan campesino', 2)], payments: [{ method: 'punto', currency: 'BS', amount: round2(2 * rate) }], customer: store.customers.find((c) => c.name === 'María González') }
  ];
  for (const s of sales) {
    const items = s.items.filter(Boolean);
    if (!items.length || !store.openShift) continue;
    try { await processSale({ items, payments: s.payments, changeCurrency: s.changeCurrency || 'BS', customer: s.customer || null, note: 'Venta de ejemplo' }); } catch (e) { console.warn('[demo] venta de ejemplo', e); }
  }
}

/** Borra todos los datos de una sede demo y su documento (usado por la demo y por el administrador). */
export async function purgeDemoTenant(tenantId) {
  const { getDocs } = await import('./firebase.js');
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 80) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[demo] limpieza', c, e?.code || e); }
  }
  try {
    const t = await getDoc(doc(db, 'tenants', tenantId));
    if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
  } catch (e) { console.warn('[demo] limpieza sede', e?.code || e); }
}

/** Borra todos los datos de la demo, la sede y la cuenta anónima. */
export async function cleanupDemo(tenantId) {
  await purgeDemoTenant(tenantId);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}

// SanoGestion — Prueba general de TODAS las funciones contra los emuladores.
// Uso: (emuladores corriendo + `node provision.mjs 3 --emu`) node tests/e2e-full.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://127.0.0.1:5055/?emu=1';
const acc = JSON.parse(readFileSync(path.join(here, '..', '.accounts-emu.json'), 'utf8'));
const DL = path.join(here, 'downloads'); rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;
let ok = 0, fail = 0; const fails = []; const errors = [];
const section = (t) => console.log(`\n■ ${t}`);
function check(cond, msg, extra = '') { if (cond) { ok++; console.log('  ✔ ' + msg); } else { fail++; fails.push(msg); console.log('  ✘ ' + msg + (extra ? '  → ' + extra : '')); } }

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
async function newPage(w = 1366, h = 900) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|analytics|dolarapi|ERR_|net::|400|PERMISSION_DENIED/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.evaluateOnNewDocument(() => { window.print = () => {}; window.__printed = 0; const o = HTMLIFrameElement.prototype; });
  const cdp = await p.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, browserContextId: ctx.id, eventsEnabled: true }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }));
  return p;
}
const M = '#modals .modal-backdrop:last-child ';
let p;
const waitText = (t, ms = 15000, page = p) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms }, t);
async function click(sel, page = p) { await page.waitForSelector(sel, { visible: true, timeout: 12000 }); await page.click(sel); await sleep(250); }
async function type(sel, v, page = p) { await page.waitForSelector(sel, { visible: true, timeout: 12000 }); await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); await page.type(sel, String(v)); }
async function select(sel, v, page = p) { await page.waitForSelector(sel, { timeout: 12000 }); await page.select(sel, v); await sleep(200); }
async function nav(id, page = p) { await page.evaluate((x) => { location.hash = '#/' + x; }, id); await sleep(900); }
async function pinIfAsked(pin, page = p) { try { await page.waitForSelector(M + '[data-pin]', { visible: true, timeout: 2500 }); await page.type(M + '[data-pin]', pin); await page.click(M + '[data-ok]'); await sleep(700); return true; } catch { return false; } }
const lockPin = (page = p) => page.evaluate(async () => { (await import('/js/auth.js')).session.pinUnlockedUntil = 0; });
const S = (fn, ...args) => p.evaluate(async (src, args) => { const { store } = await import('/js/store.js'); return (0, eval)(src)(store, ...args); }, fn.toString(), args);
const prod = (name) => S((s, n) => s.products.find((x) => x.name === n) || null, name);
const cust = (name) => S((s, n) => s.customers.find((x) => x.name === n) || null, name);
const lastSale = () => S(async (s) => { const { getDocs, query, collection, db } = await import('/js/firebase.js'); const all = (await getDocs(s.col('sales'))).docs.map((d) => ({ id: d.id, ...d.data() })); return all.sort((a, b) => b.date.localeCompare(a.date))[0]; });
const shift = () => S((s) => s.openShift);
const closeModals = async () => { for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await sleep(150); } };
async function login(user, pass, page = p) {
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await type('#lg-user', user, page); await type('#lg-pass', pass, page); await click('#lg-btn', page);
}
async function addProduct({ name, barcode = '', costMode = 'unit', costCur = 'USD', cost = '', bulkCost = '', bulkQtyCost = '', priceCur = 'USD', prices = [], stock = '0', minStock = '', bulkQty = '', bulkPrice = '', category = null, unit = null }) {
  await click('#i-new'); await sleep(300);
  await type(M + 'input[name=name]', name);
  if (barcode) await type(M + 'input[name=barcode]', barcode);
  if (category) await select(M + 'select[name=category]', category);
  if (unit) await select(M + 'select[name=unit]', unit);
  if (costMode === 'bulk') await click(M + '[data-cm] button[data-v="bulk"]');
  await select(M + 'select[name=costCur]', costCur);
  if (costMode === 'unit' && cost !== '') await type(M + 'input[name=cost]', cost);
  if (costMode === 'bulk') { await type(M + 'input[name=bulkCost]', bulkCost); await type(M + 'input[name=bulkQtyCost]', bulkQtyCost); }
  await select(M + 'select[name=priceCur]', priceCur);
  for (let i = 0; i < prices.length; i++) if (prices[i] !== '') await type(M + `[data-pr="${i}"]`, prices[i]);
  await type(M + 'input[name=stock]', stock);
  if (minStock !== '') await type(M + 'input[name=minStock]', minStock);
  if (bulkQty !== '') await type(M + 'input[name=bulkQty]', bulkQty);
  if (bulkPrice !== '') await type(M + 'input[name=bulkPrice]', bulkPrice);
  await click(M + '[data-ok]'); await sleep(900);
  // posible confirmación "precio por debajo del costo"
  if (await p.$(M + '[data-yes]')) { await click(M + '[data-yes]'); await sleep(700); }
}
async function payAndFinish(pays, { changeCur = null, fiado = false, customer = null } = {}) {
  await click('#pos-pay'); await sleep(400);
  if (customer) { const id = (await cust(customer)).id; await select(M + '[data-cust]', id); }
  for (const [m, v] of Object.entries(pays)) await type(M + `[data-pay="${m}"]`, v);
  await sleep(250);
  if (changeCur) await click(M + `[data-c="${changeCur}"]`);
  await click(M + (fiado ? '[data-fiado]' : '[data-done]'));
  await waitText('¡Venta registrada!');
  await click(M + '[data-close]'); await sleep(500);
  return lastSale();
}
async function addToCartByName(name, presIdx = null) {
  await type('#pos-search', name); await sleep(400);
  if (presIdx !== null) await p.select('.product-row [data-pres]', String(presIdx));
  await click('.product-row [data-add]'); await sleep(200);
  await p.evaluate(() => { const i = document.getElementById('pos-search'); i.value = ''; i.dispatchEvent(new Event('input')); }); await sleep(250);
}

const s1 = acc.sede01;
const RATE = 50;
try {
  p = await newPage();

  // ====================================================================
  section('1. Inicio de sesión y configuración inicial');
  await login('sede01', s1.password);
  await waitText('Tasa de cambio del día');
  await type(M + '[data-rate]', String(RATE)); await click(M + '[data-save]'); await sleep(800);
  check(await S((s) => s.rate) === RATE, `tasa del día configurada en Bs ${RATE}`);
  await nav('ajustes');
  await type('#f-biz input[name=businessName]', 'Bodega Prueba Total');
  await type('#f-biz input[name=rif]', 'J-11111111-1');
  await type('#f-biz input[name=phone]', '0414-0000000');
  await type('#f-biz input[name=address]', 'Calle 1');
  await click('#f-biz button'); await sleep(900);
  await type('#f-tax input[name=creditDays]', '7');
  await type('#f-tax input[name=lowStock]', '2');
  await click('#f-tax button.btn-primary'); await sleep(900);
  const st = await S((s) => s.settings);
  check(st.businessName === 'Bodega Prueba Total' && st.rif === 'J-11111111-1', 'datos del negocio guardados');
  check(st.creditDays === 7 && st.lowStock === 2, 'plazo de fiado (7 días) y stock mínimo por defecto guardados');
  check(await S((s) => s.tenant?.name) === 'Bodega Prueba Total', 'el nombre de la sede se actualiza en el panel');
  await click('#b-cats'); await type(M + '[data-n]', 'Mascotas'); await p.keyboard.press('Enter'); await sleep(700); await closeModals();
  check((await S((s) => s.settings.categories)).includes('Mascotas'), 'categoría nueva "Mascotas" creada');

  // ====================================================================
  section('2. Inventario: productos, bultos, precios en Bs y tres listas de precios');
  await nav('inventario');
  await addProduct({ name: 'Arroz 1kg', barcode: '111', cost: '1', prices: ['1,50', '1,40', '1,30'], stock: '50', minStock: '5', category: 'Víveres' });
  let a = await prod('Arroz 1kg');
  check(a && near(a.cost, 1) && near(a.prices[0], 1.5) && near(a.prices[1], 1.4) && near(a.prices[2], 1.3) && a.stock === 50, 'producto con 3 precios ($1,50 / $1,40 / $1,30) y stock 50', JSON.stringify(a?.prices));
  await addProduct({ name: 'Refresco 1L', barcode: '222', costMode: 'bulk', costCur: 'BS', bulkCost: '600', bulkQtyCost: '12', priceCur: 'BS', prices: ['75'], stock: '24', bulkQty: '12', bulkPrice: '16', category: 'Bebidas' });
  let r = await prod('Refresco 1L');
  check(r && near(r.cost, 1) && near(r.price, 1.5), 'costo por bulto en Bs (600 Bs / 12 u.) → $1,00 por unidad; precio 75 Bs → $1,50', `cost=${r?.cost} price=${r?.price}`);
  check(r && r.bulkQty === 12 && near(r.bulkPrice, 16), 'venta por bulto: 12 unidades a $16');
  await addProduct({ name: 'Galletas', barcode: '333', cost: '0,50', prices: ['1'], stock: '3', minStock: '4', category: 'Snacks y dulces' });
  // Editar
  const g0 = await prod('Galletas');
  await click(`[data-edit="${g0.id}"]`); await type(M + '[data-pr="0"]', '1,10'); await click(M + '[data-ok]'); await sleep(900);
  check(near((await prod('Galletas')).price, 1.1), 'editar producto: precio de Galletas cambiado a $1,10');
  // Filtro de stock bajo
  await select('#i-status', 'low'); await sleep(500);
  check(await p.evaluate(() => document.querySelector('#i-table').innerText.includes('Galletas') && !document.querySelector('#i-table').innerText.includes('Arroz')), 'filtro "Stock bajo" muestra solo Galletas');
  await select('#i-status', ''); await sleep(400);
  // Ajustes de stock
  a = await prod('Arroz 1kg');
  await click(`[data-adj="${a.id}"]`); await type(M + '[data-q]', '10'); await type(M + '[data-c]', '1,05'); await click(M + '[data-ok]'); await sleep(900);
  a = await prod('Arroz 1kg');
  check(a.stock === 60 && near(a.cost, 1.05), 'entrada de mercancía +10 con nuevo costo $1,05 → stock 60', `stock=${a.stock} cost=${a.cost}`);
  await lockPin();
  await click(`[data-adj="${a.id}"]`); await click(M + '[data-mode] button[data-v="subtract"]'); await type(M + '[data-q]', '2'); await click(M + '[data-ok]');
  check(await pinIfAsked(s1.pin), 'la salida de inventario pide el PIN');
  await sleep(700);
  check((await prod('Arroz 1kg')).stock === 58, 'merma −2 → stock 58');
  await click(`[data-adj="${a.id}"]`); await click(M + '[data-mode] button[data-v="set"]'); await type(M + '[data-q]', '57'); await click(M + '[data-ok]'); await sleep(900);
  check((await prod('Arroz 1kg')).stock === 57, 'conteo físico = 57 → stock 57');
  const logs = await S(async (s, id) => (await s.listWhere('inventory_logs', 'productId', id, 'date', 20)).length, a.id);
  check(logs >= 4, `historial de movimientos del producto (${logs} registros)`);
  // Importar CSV
  const csv = path.join(DL, 'import.csv');
  writeFileSync(csv, '\uFEFFnombre;codigo;categoria;costo;precio;stock;minimo;unidad\nComida perro 1kg;444;Mascotas;2;3;10;2;Unidad\nArena gato 5kg;555;Mascotas;4;6;5;1;Unidad\n', 'utf8');
  await click('#i-more'); await click(M + '[data-t="import"]'); await sleep(400);
  const fileInput = await p.$(M + '[data-file]'); await fileInput.uploadFile(csv); await sleep(900);
  await click(M + '[data-ok]'); await sleep(1500);
  check(!!(await prod('Comida perro 1kg')) && !!(await prod('Arena gato 5kg')), 'importación CSV: 2 productos creados');
  // Exportar CSV
  await click('#i-more'); await click(M + '[data-t="export"]'); await sleep(1800);
  const exp = readdirSync(DL).find((f) => f.startsWith('inventario_'));
  check(!!exp && readFileSync(path.join(DL, exp), 'utf8').includes('Arroz 1kg'), 'exportación de inventario a Excel (CSV)');
  // Ajuste masivo de precios
  await lockPin();
  await click('#i-more'); await click(M + '[data-t="bulk"]');
  check(await pinIfAsked(s1.pin), 'el ajuste masivo de precios pide el PIN');
  await select(M + '[data-c]', 'Mascotas'); await type(M + '[data-p]', '10'); await click(M + '[data-ok]'); await click(M + '[data-yes]'); await sleep(1200);
  check(near((await prod('Comida perro 1kg')).price, 3.3) && near((await prod('Arena gato 5kg')).price, 6.6) && near((await prod('Arroz 1kg')).price, 1.5), 'ajuste masivo +10% solo en "Mascotas" ($3→$3,30, $6→$6,60)');
  // Eliminar
  const ag = await prod('Arena gato 5kg');
  await click(`[data-del="${ag.id}"]`); await pinIfAsked(s1.pin); await click(M + '[data-yes]'); await sleep(900);
  check(!(await prod('Arena gato 5kg')), 'eliminar producto (con PIN)');

  // ====================================================================
  section('3. Clientes');
  await nav('clientes');
  for (const [n, ph] of [['Ana Pérez', '04141112233'], ['Luis Gómez', '04241112233']]) {
    await click('#c-new'); await type(M + 'input[name=name]', n); await type(M + 'input[name=phone]', ph); await click(M + '[data-ok]'); await sleep(800);
  }
  check(!!(await cust('Ana Pérez')) && !!(await cust('Luis Gómez')), 'clientes creados');
  await lockPin();
  const luis = await cust('Luis Gómez');
  await click(`[data-edit="${luis.id}"]`); await pinIfAsked(s1.pin);
  await type(M + 'input[name=address]', 'Sector El Centro'); await click(M + '[data-ok]'); await sleep(800);
  check((await cust('Luis Gómez')).address === 'Sector El Centro', 'editar cliente (con PIN)');

  // ====================================================================
  section('4. Caja: apertura, ingreso y gasto');
  await nav('caja');
  await click('#k-open'); await type(M + '[data-u]', '20'); await type(M + '[data-b]', '1000'); await click(M + '[data-ok]'); await sleep(1000);
  let sh = await shift();
  check(sh && sh.openingUSD === 20 && sh.openingBs === 1000, 'caja abierta con $20 y Bs 1.000');
  await click('#k-in'); await type(M + '[data-c]', 'Sencillo'); await type(M + '[data-a]', '5'); await click(M + '[data-ok]'); await sleep(900);
  await click('#k-out'); await type(M + '[data-c]', 'Hielo'); await select(M + '[data-cur]', 'BS'); await type(M + '[data-a]', '100'); await click(M + '[data-ok]'); await sleep(1000);
  sh = await shift();
  check(near(sh.inUSD, 5) && near(sh.outBs, 100), 'ingreso de $5 y gasto de Bs 100 registrados');

  // ====================================================================
  section('5. Punto de venta');
  await nav('vender');
  // Venta 1: precio 2, lector de código, cantidad, descuento %, vuelto en Bs
  await select('#pos-tier', '2');
  await p.focus('#pos-search'); await p.type('#pos-search', '111'); await p.keyboard.press('Enter'); await sleep(400);
  check((await S(() => 0)) === 0 && await p.evaluate(() => document.querySelector('#cart-lines').innerText.includes('Arroz 1kg')), 'escáner/código de barras agrega el producto');
  await p.evaluate(() => { const i = document.querySelector('[data-qty="0"]'); i.value = '3'; i.dispatchEvent(new Event('change')); }); await sleep(300);
  await click('#pos-discount'); await click(M + '[data-m="pct"]'); await type(M + '[data-v]', '10'); await click(M + '[data-ok]'); await sleep(300);
  const t1 = await p.$eval('#t-usd', (e) => e.innerText);
  check(t1.includes('3,78'), 'precio 2 ($1,40) × 3 − 10% de descuento = $3,78', t1);
  const v1 = await payAndFinish({ efectivo_usd: '5' }, { changeCur: 'BS' });
  check(near(v1.total, 3.78) && near(v1.changeUSD, 1.22) && v1.changeCurrency === 'BS', 'venta 1 cobrada con $5, vuelto $1,22 en bolívares');
  check(near(v1.cashFlow.inUSD, 5) && near(v1.cashFlow.outBs, 61), 'caja: entra $5 y sale Bs 61 de vuelto');
  check((await prod('Arroz 1kg')).stock === 54, 'stock de Arroz 57 → 54');
  // Venta 2: bulto + pago mixto exacto
  await select('#pos-tier', '1');
  await addToCartByName('Refresco 1L', 1);
  await addToCartByName('Galletas');
  const t2 = await p.$eval('#t-usd', (e) => e.innerText);
  check(t2.includes('17,10'), 'bulto de refresco ($16) + galletas ($1,10) = $17,10', t2);
  const v2 = await payAndFinish({ pagomovil: '500', efectivo_bs: '355' });
  check(near(v2.total, 17.1) && v2.method === 'mixto' && near(v2.changeUSD, 0) && near(v2.creditUSD, 0), 'venta 2 con pago mixto exacto (pago móvil Bs 500 + efectivo Bs 355)');
  check((await prod('Refresco 1L')).stock === 12 && (await prod('Galletas')).stock === 2, 'el bulto descuenta 12 unidades (24 → 12) y galletas 3 → 2');
  // Venta 3: abono parcial + fiado
  await addToCartByName('Arroz 1kg'); await addToCartByName('Arroz 1kg');
  const v3 = await payAndFinish({ punto: '50' }, { fiado: true, customer: 'Ana Pérez' });
  check(near(v3.total, 3) && near(v3.creditUSD, 2) && v3.customerName === 'Ana Pérez', 'venta 3: $3 a Ana, paga $1 por punto y queda $2 fiado');
  const debtsA = await S((s, id) => s.openDebts.filter((d) => d.customerId === id), (await cust('Ana Pérez')).id);
  const due = new Date(); due.setDate(due.getDate() + 7);
  const dk = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  check(debtsA.length === 1 && near(debtsA[0].balance, 2) && debtsA[0].dueDate === dk, `fiado de $2 con vencimiento a 7 días (${dk})`);
  // Venta 4: fiado total
  await addToCartByName('Galletas');
  const v4 = await payAndFinish({}, { fiado: true, customer: 'Luis Gómez' });
  check(near(v4.creditUSD, 1.1) && v4.method === 'credito', 'venta 4: fiado total de $1,10 a Luis');
  // Sin cliente no se puede fiar
  await addToCartByName('Galletas');
  await click('#pos-pay'); await click(M + '[data-fiado]'); await sleep(500);
  check(await p.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('cliente'))), 'no permite fiar sin seleccionar cliente');
  await closeModals();
  // Stock insuficiente
  await p.evaluate(() => { const i = document.querySelector('[data-qty="0"]'); if (i) { i.value = '9'; i.dispatchEvent(new Event('change')); } }); await sleep(300);
  check(await p.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('Stock disponible'))), 'avisa cuando la cantidad supera el stock');
  // En espera
  await click('#pos-hold'); await type(M + '[data-l]', 'Pedido Carmen'); await click(M + '[data-ok]'); await sleep(900);
  check((await S((s) => s.heldSales.length)) === 1 && (await p.$eval('#cart-lines', (e) => e.innerText)).includes('vacío'), 'venta puesta en espera y carrito vacío');
  await click('#pos-held'); await click(M + '[data-r]'); await sleep(900);
  check((await S((s) => s.heldSales.length)) === 0 && (await p.$eval('#cart-lines', (e) => e.innerText)).includes('Galletas'), 'venta en espera retomada');
  await click('#pos-clear'); await click(M + '[data-yes]'); await sleep(400);
  check((await p.$eval('#cart-lines', (e) => e.innerText)).includes('vacío'), 'vaciar carrito');
  // Recibo
  check(await p.evaluate(async () => { const { receiptHTML } = await import('/js/shared.js'); const html = receiptHTML({ number: 'X', date: new Date().toISOString(), items: [{ name: 'A', qty: 1, price: 1, total: 1 }], subtotal: 1, discount: 0, total: 1, totalBs: 50, rate: 50, payments: [] }); return html.includes('Bodega Prueba Total') && html.includes('TOTAL Bs'); }), 'recibo imprimible con datos del negocio y total en Bs');

  // ====================================================================
  section('6. Cobranza / fiados');
  await nav('cobranza');
  check(await p.evaluate(() => document.body.innerText.includes('Ana Pérez') && document.body.innerText.includes('Luis Gómez')), 'los dos deudores aparecen en Cobranza');
  const ana = await cust('Ana Pérez');
  await click(`[data-pay="${ana.id}"]`); await select(M + '[data-m]', 'efectivo_bs'); await type(M + '[data-a]', '50'); await click(M + '[data-ok]'); await sleep(1100);
  check(near(await S((s, id) => s.customerBalance(id), ana.id), 1), 'abono parcial de Bs 50 ($1) → Ana debe $1');
  const lu = await cust('Luis Gómez');
  await click(`[data-pay="${lu.id}"]`); await select(M + '[data-m]', 'efectivo_usd'); await sleep(300); await click(M + '[data-ok]'); await sleep(1100);
  check(near(await S((s, id) => s.customerBalance(id), lu.id), 0), 'pago total de Luis ($1,10) → saldo $0');
  const pays = await S(async (s) => (await s.listAll('debt_payments')).length);
  check(pays === 2, 'abonos registrados en el historial');
  // No se puede borrar cliente con deuda
  await nav('clientes');
  await click(`[data-del="${ana.id}"]`); await sleep(500);
  check(await p.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('saldo pendiente'))), 'no permite eliminar un cliente con deuda');
  await closeModals();

  // ====================================================================
  section('7. Servicios: recarga y avance de efectivo');
  await nav('servicios');
  await click('[data-t="recarga"]');
  await type('#f-rec input[name=phone]', '04120001122'); await type('#f-rec input[name=amount]', '200'); await type('#f-rec input[name=pct]', '10');
  await select('#f-rec select[name=method]', 'efectivo_bs');
  await click('#f-rec button.btn-primary'); await sleep(1300);
  await click('[data-t="adelanto"]');
  await type('#f-adv input[name=amount]', '500'); await type('#f-adv input[name=pct]', '10');
  await select('#f-adv select[name=method]', 'punto');
  await click('#f-adv button.btn-primary'); await sleep(1300);
  const svc = await S(async (s) => (await s.listAll('services')).map((x) => ({ t: x.type, c: x.commissionBs, tot: x.totalBs })));
  check(svc.some((x) => x.t === 'recarga' && near(x.c, 20) && near(x.tot, 220)) && svc.some((x) => x.t === 'adelanto' && near(x.c, 50) && near(x.tot, 550)), 'recarga Bs 200 (+20 de comisión) y avance Bs 500 (+50)');

  // ====================================================================
  section('8. Reportes (PIN), filtros y anulación');
  await lockPin();
  await nav('reportes');
  check(await pinIfAsked(s1.pin), 'Reportes pide el PIN');
  await waitText('Ganancia − gastos'); await sleep(1500);
  const sales = await S(async (s) => (await s.listAll('sales')).filter((x) => x.status !== 'voided'));
  const sumTotal = sales.reduce((a, x) => a + x.total, 0);
  const kpiSales = await p.$$eval('.kpi .kpi-value', (e) => e[0].innerText);
  check(kpiSales.replace(/\./g, '').includes(sumTotal.toFixed(2).replace('.', ',')), `KPI de ventas = suma real de las ventas ($${sumTotal.toFixed(2)})`, kpiSales);
  const cost = sales.reduce((a, x) => a + x.items.reduce((b, l) => b + l.cost * l.qty * (l.multiplier || 1), 0), 0);
  const kpiProfit = await p.$$eval('.kpi .kpi-value', (e) => e[1].innerText);
  check(kpiProfit.replace(/\./g, '').includes((sumTotal - cost).toFixed(2).replace('.', ',')), `ganancia bruta = ventas − costo ($${(sumTotal - cost).toFixed(2)})`, kpiProfit);
  await select('#r-method', 'pagomovil'); await sleep(500);
  check(await p.$$eval('[data-sale]', (b) => b.length) === 1, 'filtro por método (Pago móvil) → 1 venta');
  await select('#r-method', 'all');
  await select('#r-cust', ana.id); await sleep(500);
  check(await p.$$eval('[data-sale]', (b) => b.length) === 1, 'filtro por cliente (Ana) → 1 venta');
  await select('#r-cust', 'all');
  await select('#r-type', 'service'); await sleep(500);
  check(await p.$$eval('[data-sale]', (b) => b.length) === 2, 'filtro "Solo servicios" → 2');
  await select('#r-type', 'all'); await sleep(400);
  await click('[data-p="7d"]'); await sleep(1500);
  check(await p.evaluate(() => !!document.querySelector('.chart')), 'período "7 días" con gráfico de ventas por día');
  await click('#r-csv'); await sleep(1500);
  check(readdirSync(DL).some((f) => f.startsWith('ventas_')), 'exportación del reporte a Excel (CSV)');
  // Anular la venta 1
  const arrozAntes = (await prod('Arroz 1kg')).stock;
  await click(`[data-sale="${v1.id}"]`); await lockPin(); await click(M + '[data-void]');
  check(await pinIfAsked(s1.pin), 'anular una venta pide el PIN');
  await p.type(M + 'input', 'Error de cobro'); await click(M + '[data-ok]'); await sleep(1500);
  const v1b = await S(async (s, id) => s.getOne('sales', id), v1.id);
  check(v1b.status === 'voided', 'venta 1 anulada (queda registrada como anulada)');
  check((await prod('Arroz 1kg')).stock === arrozAntes + 3, `anulación devuelve 3 unidades al stock (${arrozAntes} → ${arrozAntes + 3})`);

  // ====================================================================
  section('9. Cierre de caja con arqueo en dólares y bolívares');
  sh = await shift();
  const expUSD = 20 + 5 + 5 + 1.1 - 5;                       // fondo + ingreso + venta1 + pago Luis − anulación
  const expBs = 1000 - 100 - 61 + 355 + 50 + 220 - 500 + 61; // fondo − hielo − vuelto + venta2 + abono Ana + recarga − avance + anulación
  const sysUSD = sh.openingUSD + sh.inUSD - sh.outUSD, sysBs = sh.openingBs + sh.inBs - sh.outBs;
  check(near(sysUSD, expUSD) && near(sysBs, expBs), `efectivo esperado: $${expUSD.toFixed(2)} y Bs ${expBs.toFixed(2)}`, `sistema: $${sysUSD} / Bs ${sysBs}`);
  await nav('caja');
  check(await p.$$eval('.cash-expected', (e, u, b) => e[0].innerText.includes(u) && e[1].innerText.replace(/\./g, '').includes(b), expUSD.toFixed(2).replace('.', ','), expBs.toFixed(2).replace('.', ',')), 'la pantalla de Caja muestra los mismos montos');
  await click('#k-close'); await type(M + '[data-u]', expUSD.toFixed(2).replace('.', ',')); await type(M + '[data-b]', String(expBs - 5).replace('.', ',')); await sleep(300);
  check(await p.evaluate(() => document.querySelector('#modals').innerText.includes('Faltante')), 'el cierre detecta el faltante en Bs antes de confirmar');
  await lockPin(); await click(M + '[data-ok]');
  check(await pinIfAsked(s1.pin), 'cerrar la caja pide el PIN');
  await waitText('Turno cerrado'); await click(M + '[data-close]'); await sleep(1200);
  const hist = await S(async (s) => s.closedShifts(5));
  check(hist.length === 1 && near(hist[0].diffUSD, 0) && near(hist[0].diffBs, -5), 'turno cerrado: $ cuadrado y faltante de Bs 5 en el historial');
  check(await S((s) => !s.openShift), 'sin caja abierta, el POS queda bloqueado');
  await nav('vender'); check(!!(await p.$('.guard')), 'Vender muestra "La caja está cerrada"');

  // ====================================================================
  section('10. Inicio (indicadores del día)');
  await nav('inicio'); await sleep(600);
  const today = await S((s) => s.recentSales.filter((x) => x.status !== 'voided').reduce((a, x) => a + x.total, 0));
  const k0 = await p.$$eval('.kpi .kpi-value', (e) => e[0].innerText);
  check(k0.replace(/\./g, '').includes(today.toFixed(2).replace('.', ',')), `Ventas de hoy = $${today.toFixed(2)}`, k0);
  check(await p.evaluate(() => document.body.innerText.includes('Galletas')), 'stock crítico muestra Galletas');

  // ====================================================================
  section('11. Configuración: PIN, contraseña, respaldo, borrado y restauración');
  await nav('ajustes');
  await lockPin(); await click('#b-pin'); await pinIfAsked(s1.pin);
  await type(M + '[data-a]', '9999'); await type(M + '[data-b]', '9999'); await click(M + '[data-ok]'); await sleep(900);
  await lockPin();
  check(await S(async (s, old) => (await s.verifyPin('9999')) && !(await s.verifyPin(old)), s1.pin), 'PIN cambiado a 9999 (el anterior ya no sirve)');
  await click('#b-pass'); await type(M + '[data-c]', s1.password); await type(M + '[data-n]', 'NuevaClave-2026'); await type(M + '[data-r]', 'NuevaClave-2026'); await click(M + '[data-ok]'); await sleep(1500);
  check(await p.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('Contraseña actualizada'))), 'contraseña de acceso cambiada');
  await click('#b-backup'); await sleep(2500);
  const bk = readdirSync(DL).find((f) => f.startsWith('respaldo_sanogestion'));
  const bkData = bk ? JSON.parse(readFileSync(path.join(DL, bk), 'utf8')) : null;
  check(bkData && bkData.data.products.length >= 4 && bkData.data.sales.length >= 6, `copia de seguridad descargada (${bkData?.data.products.length} productos, ${bkData?.data.sales.length} ventas)`);
  await click('#b-reset'); await pinIfAsked('9999'); await type(M + '[data-c]', 'BORRAR'); await click(M + '[data-ok]'); await sleep(3500);
  check((await S((s) => s.products.length)) === 0 && (await S((s) => s.customers.length)) === 0, 'borrar todos los datos deja la sede en blanco');
  await lockPin(); await click('#b-restore'); await pinIfAsked('9999');
  const fr = await p.$('#file-restore'); await fr.uploadFile(path.join(DL, bk)); await sleep(800);
  await click(M + '[data-yes]'); await sleep(5000);
  check((await S((s) => s.products.length)) === bkData.data.products.length && (await S((s) => s.customers.length)) === 2, 'restaurar la copia recupera productos y clientes');
  const themeBefore = await p.evaluate(() => document.documentElement.dataset.theme);
  await click('#b-theme'); await sleep(300);
  check(await p.evaluate((t) => document.documentElement.dataset.theme !== t, themeBefore), 'cambio de tema claro/oscuro');
  // Iniciar sesión con la contraseña nueva
  const p2 = await newPage();
  await login('sede01', 'NuevaClave-2026', p2);
  await waitText('Hola, Bodega Prueba Total', 15000, p2);
  check(true, 'inicia sesión con la contraseña nueva');

  // ====================================================================
  section('12. Administrador: crear, editar, plan, congelar, aviso, exportar, eliminar y restaurar sedes');
  const ad = await newPage();
  await login('admin', acc.admin.password, ad);
  await waitText('Panel de administración de sedes', 15000, ad); await sleep(1500);
  await click('#a-new', ad);
  await type(M + 'input[name=name]', 'Bodega Nueva', ad); await type(M + 'input[name=username]', 'nueva01', ad);
  await type(M + 'input[name=password]', 'Clave-Nueva-1', ad); await type(M + 'input[name=pin]', '5555', ad);
  await type(M + 'input[name=ownerName]', 'Pedro Pérez', ad); await type(M + 'input[name=ownerPhone]', '04141234567', ad);
  await click(M + '[data-ok]', ad); await waitText('Sede creada', 20000, ad); await click(M + '[data-close]', ad); await sleep(1500);
  check(await ad.evaluate(() => document.body.innerText.includes('Bodega Nueva') && document.body.innerText.includes('Pedro Pérez')), 'sede nueva creada desde el panel con dueño y teléfono');
  check(await ad.evaluate(() => /Vence/.test(document.body.innerText) && document.querySelectorAll('#a-filters .chip').length === 6), 'muestra plan con vencimiento y filtros por estado');
  const nu = await newPage();
  await login('nueva01', 'Clave-Nueva-1', nu); await waitText('Hola, Bodega Nueva', 15000, nu);
  check(true, 'la sede nueva inicia sesión con su usuario');
  const nid = await nu.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await click(`[data-tog="${nid}"]`, ad); await click(M + '[data-ok]', ad); await sleep(1500);
  await waitText('Cuenta congelada', 15000, nu);
  check(await nu.evaluate(() => document.body.innerText.includes('Pago pendiente')), 'al congelarla, la sede queda bloqueada al instante y ve el motivo');
  await click(`[data-tog="${nid}"]`, ad); await click(M + '[data-yes]', ad); await sleep(1000);
  check(await ad.evaluate(() => document.body.innerText.includes('Activa')), 'sede reactivada');
  // Editar: nombre, plan y fecha vencida -> la sede se bloquea por plan vencido
  await click(`[data-ed="${nid}"]`, ad);
  await type(M + 'input[name=name]', 'Bodega Nueva Editada', ad); await select(M + 'select[name=plan]', 'Premium', ad);
  await ad.evaluate((m) => { const i = document.querySelector(m + 'input[name=paidUntil]'); i.value = '2020-01-01'; }, M);
  await click(M + '[data-ok]', ad); await sleep(1500);
  check(await ad.evaluate(() => document.body.innerText.includes('Bodega Nueva Editada') && document.body.innerText.includes('Premium') && document.body.innerText.includes('Vencida')), 'editar sede: nombre, plan y vencimiento');
  await nu.reload({ waitUntil: 'networkidle2' }); await waitText('Tu plan venció', 15000, nu);
  check(true, 'con el plan vencido la sede queda bloqueada');
  await click(`[data-renew="${nid}"]`, ad); await click(M + '[data-yes]', ad); await sleep(1500);
  await nu.reload({ waitUntil: 'networkidle2' }); await waitText('Hola, Bodega Nueva', 15000, nu);
  check(true, 'renovar 30 días reactiva la sede');
  // Reiniciar PIN
  await click(`[data-ed="${nid}"]`, ad); await click(M + '[data-pin]', ad); await click(M + '[data-yes]', ad); await sleep(1200);
  check(await ad.evaluate(() => /PIN reiniciado: \d{4}/.test(document.body.innerText)), 'reiniciar PIN de la sede');
  await ad.evaluate(() => document.querySelectorAll('#modals [data-close]').forEach((b) => b.click())); await sleep(500);
  // Aviso general
  await click('#a-ann', ad); await type(M + '[data-t]', 'Mantenimiento el domingo', ad);
  await ad.evaluate((m) => { const c = document.querySelector(m + '[data-on]'); if (!c.checked) c.click(); }, M);
  await click(M + '[data-ok]', ad); await sleep(1500);
  await waitText('Mantenimiento el domingo', 15000, nu);
  check(true, 'el aviso general aparece en la sede');
  // Exportar CSV
  await click('#a-csv', ad); await sleep(1500);
  check(readdirSync(DL).some((f) => f.startsWith('sedes-sanogestion')), 'exporta la lista de sedes en CSV');
  // Búsqueda global en la sede
  await nu.keyboard.down('Control'); await nu.keyboard.press('k'); await nu.keyboard.up('Control'); await sleep(500);
  await nu.type('.search-modal [data-q]', 'caja'); await sleep(500);
  check(await nu.evaluate(() => document.querySelectorAll('.search-modal .sitem').length > 0), 'búsqueda global Ctrl+K encuentra secciones');
  await nu.keyboard.press('Enter'); await sleep(1200);
  check(await nu.evaluate(() => location.hash === '#/caja'), 'Enter abre el resultado de la búsqueda');
  // Eliminar y restaurar
  await click(`[data-ed="${nid}"]`, ad); await click(M + '[data-del]', ad); await click(M + '[data-yes]', ad);
  await sleep(400); await ad.evaluate(() => [...document.querySelectorAll('#modals [data-no], #modals [data-close]')].pop()?.click()); await sleep(2500);
  await nu.reload({ waitUntil: 'networkidle2' }); await waitText('Cuenta sin sede asignada', 15000, nu).catch(() => {});
  check(await nu.evaluate(() => /Cuenta sin sede asignada|Usuario|Iniciar/.test(document.body.innerText)), 'la sede eliminada ya no puede trabajar');
  await click('#a-filters [data-f="deleted"]', ad);
  await click(`[data-restore="${nid}"]`, ad); await click(M + '[data-yes]', ad); await sleep(1500);
  check(await ad.evaluate(() => document.body.innerText.includes('Sede restaurada')), 'restaurar sede eliminada');
  await click('#a-filters [data-f="all"]', ad);
  await click(`[data-enter="${await p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid)}"]`, ad);
  await waitText('Modo administrador', 15000, ad);
  check(true, 'el administrador entra a ver una sede');

  // ====================================================================
  section('13. Demo: PIN 1234 visible y funcionando');
  const d = await newPage(390, 844);
  await d.goto(BASE, { waitUntil: 'networkidle2' });
  await click('#lg-demo', d);
  await waitText('PIN de datos sensibles', 40000, d);
  check(await d.evaluate(() => document.querySelector('.demo-pin-code')?.innerText === '1234'), 'la bienvenida de la demo muestra el PIN 1234');
  await click(M + '[data-close]', d); await sleep(800);
  check(await d.evaluate(() => document.querySelector('.demo-banner')?.innerText.includes('1234')), 'el banner de la demo muestra "PIN: 1234"');
  await d.evaluate(() => { location.hash = '#/reportes'; }); await sleep(800);
  check(await d.evaluate(() => document.querySelector('#modals')?.innerText.includes('En la demo el PIN es 1234')), 'la ventana del PIN recuerda que en la demo es 1234');
  await d.type(M + '[data-pin]', '0000'); await d.click(M + '[data-ok]'); await sleep(600);
  check(await d.evaluate(() => document.querySelector('#modals')?.innerText.includes('PIN incorrecto')), 'un PIN distinto es rechazado en la demo');
  await d.click(M + '[data-pin]', { clickCount: 3 }); await d.type(M + '[data-pin]', '1234'); await d.click(M + '[data-ok]');
  await waitText('Ganancia − gastos', 15000, d);
  check(true, 'con 1234 se abren los Reportes de la demo');
  await d.evaluate(() => document.getElementById('demo-end')?.click()); await sleep(300);
  await d.evaluate(() => document.querySelector('#modals .modal-backdrop:last-child [data-yes]')?.click());
  await waitText('Tu demo terminó', 30000, d);
  check(true, 'la demo termina y se limpia');
} catch (e) {
  fail++; fails.push('EXCEPCIÓN: ' + e.message);
  console.error('\n✘ EXCEPCIÓN:', e.message);
  try { await p.screenshot({ path: path.join(here, 'fallo.png') }); } catch (_) {}
} finally {
  console.log(`\n══════════════════════════════════════════\nResultado: ${ok} correctas, ${fail} fallidas`);
  if (fails.length) console.log('Fallos:\n - ' + fails.join('\n - '));
  console.log('Errores de consola/página:', errors.length ? '\n' + errors.join('\n') : 'ninguno');
  await browser.close();
  process.exit(fail ? 1 : 0);
}

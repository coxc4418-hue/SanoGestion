// SanoGestion — Genera el video tutorial narrado (voz es-VE) grabando el sistema real.
// Requisitos: emuladores corriendo (o URL), ffmpeg en el PATH y `pip install edge-tts`.
// Uso: node make-video.mjs [url=http://127.0.0.1:5055/?emu=1]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const APP = process.argv[2] || 'http://127.0.0.1:5055/?emu=1';
const WORK = path.join(here, 'work');
const OUT_DIR = path.join(ROOT, 'public', 'tutorial');
const DESK_DIR = path.join(ROOT, 'Tutorial');
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true }); mkdirSync(DESK_DIR, { recursive: true });
const FFMPEG = execFileSync('where', ['ffmpeg']).toString().split(/\r?\n/)[0].trim();
const VOICE = 'es-VE-PaolaNeural';
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ======================================================================
// Guion
// ======================================================================
const SCENES = [
  { id: '01-intro', card: 'intro', text: 'Hola. Bienvenido a SanoGestion, el sistema para llevar tu tienda o bodega: ventas, inventario, caja en dólares y bolívares, fiados y reportes. En unos minutos te muestro cómo usarlo paso a paso.' },
  { id: '02-login', text: 'Para entrar, escribe el usuario y la contraseña de tu negocio. Si solo quieres conocerlo, toca “Probar demo gratis”: tendrás treinta minutos con una tienda de ejemplo, sin registrarte.',
    act: async (v, dur) => { await v.hl('#login-form', 4200); await v.hl('#lg-demo', 3600); await v.hl('#lg-wa', 2400); await v.move('#lg-demo'); await sleep(Math.max(0, dur * 1000 - 13500)); await v.point('#lg-demo'); }, after: 'demo' },
  { id: '03-pin', text: 'Al entrar a la demo verás el PIN de datos sensibles: uno, dos, tres, cuatro. Ese PIN protege los reportes, las anulaciones, los ajustes de inventario y el cierre de caja. Arriba siempre tienes el tiempo restante y el PIN a la vista.',
    act: async (v) => { await v.hl('.modal .demo-pin-box', 6000); await v.point('.modal [data-close]'); await sleep(600); await v.hl('.demo-banner', 4500); } },
  { id: '04-inicio', text: 'Esta es la pantalla de inicio. Aquí ves las ventas del día, la ganancia estimada, el efectivo que debe haber en caja y lo que te deben tus clientes. Abajo, el gráfico de la semana, los productos más vendidos y el stock crítico, para que sepas qué reponer.',
    act: async (v) => { await v.hl('.kpis', 5200); await v.hl('.chart', 3200, '.card'); await v.scroll(420); await v.hl('.grid-3 > .card:nth-child(3)', 2600); await v.hl('.grid-3 > .card:nth-child(4)', 2600); await v.scroll(0); } },
  { id: '05-tasa', text: 'La tasa del día es muy importante, porque todos los precios se muestran en dólares y en bolívares. Tócala para cambiarla, o consulta la tasa oficial del Banco Central automáticamente.',
    act: async (v) => { await v.point('#sb-rate'); await sleep(900); await v.hl('.modal [data-auto]', 3000); await v.hl('.modal [data-rate]', 2200); }, after: 'closeModal' },
  { id: '06-producto', text: 'En Inventario creas tus productos. Escribe el nombre, el costo y el porcentaje de ganancia: el precio se calcula solo, en dólares o en bolívares. Puedes tener hasta tres precios, por ejemplo para mayoristas, y vender también por bulto.',
    act: async (v) => {
      await v.nav('inventario'); await sleep(500);
      await v.point('#i-new'); await sleep(800);
      await v.point('.modal input[name=name]'); await v.typeSlow('Chocolate de leche');
      await v.point('.modal input[name=cost]'); await v.typeSlow('1');
      await v.point('.modal [data-mg="0"]'); await v.typeSlow('50');
      await sleep(500); await v.hl('.modal .tier-grid', 2600);
      await v.point('.modal [data-mg="1"]'); await v.typeSlow('40');
      await v.scrollModalTo('input[name=stock]');
      await v.point('.modal input[name=stock]'); await v.selectAll(); await v.typeSlow('24');
      await v.point('.modal [data-ok]'); await sleep(1200);
    } },
  { id: '07-stock', text: 'Cuando llega mercancía, toca “Stock” en el producto y registra la entrada, incluso con el nuevo costo. También puedes descontar mermas o corregir un conteo físico. Cada movimiento queda en el historial.',
    act: async (v) => {
      await v.hl('#i-kpis', 2600);
      await v.pointIn('#i-table tbody tr', 'Arroz blanco', '[data-adj]'); await sleep(800);
      await v.point('.modal [data-q]'); await v.typeSlow('12');
      await v.hl('.modal [data-mode]', 2200);
      await v.point('.modal [data-ok]'); await sleep(1300);
      await v.hlRow('#i-table tbody tr', 'Arroz blanco', 2200);
    } },
  { id: '08-venta', text: 'Ahora vamos a vender. Busca el producto o escanéalo con el lector de códigos, y se agrega al carrito. Ajusta la cantidad con los botones. Luego toca “Cobrar”: puedes recibir dólares, bolívares, punto, pago móvil o transferencia, incluso combinados. Si el cliente paga con diez dólares, el sistema calcula el vuelto y tú eliges si lo entregas en dólares o en bolívares.',
    act: async (v) => {
      await v.nav('vender'); await sleep(600);
      await v.point('#pos-search'); await v.typeSlow('harina'); await sleep(500);
      await v.point('.product-row [data-add]'); await sleep(300);
      await v.clearSearch();
      await v.pointIn('.product-row', 'Refresco cola', '[data-add]'); await sleep(300);
      await v.point('[data-inc="0"]'); await sleep(500);
      await v.hl('.pos-totals', 2000);
      await v.point('#pos-pay'); await sleep(1000);
      await v.hl('.modal .pay-grid', 2600);
      await v.point('.modal [data-pay="efectivo_usd"]'); await v.typeSlow('10'); await sleep(600);
      await v.hl('.modal [data-bal]', 2200);
      await v.point('.modal [data-c="BS"]'); await sleep(700);
      await v.point('.modal [data-done]'); await sleep(1600);
      await v.hl('.modal .summary-box', 2200);
    }, after: 'closeModal' },
  { id: '09-fiado', text: 'Si el cliente no completa el pago, puedes fiarle. Elige el cliente, registra lo que abona, por ejemplo con pago móvil, y toca “Abonar y fiar el resto”. La deuda queda guardada con su fecha de vencimiento.',
    act: async (v) => {
      await v.pointIn('.product-row', 'Aceite vegetal', '[data-add]'); await sleep(300);
      await v.pointIn('.product-row', 'Café molido', '[data-add]'); await sleep(300);
      await v.point('#pos-pay'); await sleep(900);
      await v.selectOption('.modal [data-cust]', 'José Rodríguez'); await sleep(700);
      await v.point('.modal [data-pay="pagomovil"]'); await v.typeSlow(String(Math.round(2 * (await v.rate()))));
      await sleep(500); await v.hl('.modal [data-bal]', 1800);
      await v.point('.modal [data-fiado]'); await sleep(1600);
    }, after: 'closeModal' },
  { id: '10-cobranza', text: 'En Cobranza ves a todos los que te deben, cuánto y desde cuándo, y lo que ya está vencido. Para registrar un pago toca “Abonar”: el monto puede ser en dólares o en bolívares, y se aplica a las deudas más antiguas. También puedes enviar un recordatorio por WhatsApp.',
    act: async (v) => {
      await v.nav('cobranza'); await sleep(700);
      await v.hl('.kpis', 3000);
      await v.hlRow('.debtor', 'José Rodríguez', 2400);
      await v.pointIn('.debtor', 'José Rodríguez', '[data-pay]'); await sleep(900);
      await v.hl('.modal .summary-box', 2200);
      await v.point('.modal [data-ok]'); await sleep(1300);
      await v.hl('.debtor', 2200);
    } },
  { id: '11-clientes', text: 'En Clientes está tu directorio. La ficha de cada cliente muestra su saldo, sus compras, sus abonos y un estado de cuenta que puedes imprimir.',
    act: async (v) => {
      await v.nav('clientes'); await sleep(700);
      await v.pointIn('#c-list tbody tr', 'María González', '[data-view]'); await sleep(1500);
      await v.hl('.modal .grid-3', 3000); await v.hl('.modal .row-wrap', 2400);
    }, after: 'closeModal' },
  { id: '12-caja', text: 'En Caja trabajas por turnos. Abres con el efectivo inicial, y el sistema lleva por separado los dólares y los bolívares: lo que entra por ventas y abonos, y lo que sale por vueltos y gastos. Registrar un gasto es muy fácil. Al cerrar, cuentas el dinero y el sistema te dice si cuadra, sobra o falta.',
    act: async (v) => {
      await v.nav('caja'); await sleep(800);
      await v.hl('.cash-cols', 4200);
      await v.hl('.grid-2 > .card:nth-child(2)', 3000);
      await v.point('#k-out'); await sleep(800);
      await v.point('.modal [data-c]'); await v.typeSlow('Bolsas plásticas');
      await v.page.select('.modal [data-cur]', 'BS');
      await v.point('.modal [data-a]'); await v.typeSlow('200');
      await v.point('.modal [data-ok]'); await sleep(1300);
      await v.hl('#k-close', 2200);
    } },
  { id: '13-servicios', text: 'En Servicios registras recargas telefónicas y avances de efectivo, con tu comisión. Todo se suma a la caja y a los reportes automáticamente.',
    act: async (v) => {
      await v.nav('servicios'); await sleep(700);
      await v.point('[data-t="recarga"]'); await sleep(500);
      await v.point('#f-rec input[name=phone]'); await v.typeSlow('04141234567');
      await v.point('#f-rec input[name=amount]'); await v.typeSlow('300');
      await v.hl('#f-rec .summary-box', 2000);
      await v.point('#f-rec button.btn-primary'); await sleep(1500);
    } },
  { id: '14-reportes', text: 'Los reportes están protegidos con el PIN. En la demo es uno, dos, tres, cuatro. Aquí ves las ventas, la ganancia, los gastos y la utilidad del período, lo que cobraste por cada método de pago y tus productos más vendidos. Puedes exportarlo a Excel o PDF, y anular una venta si hubo un error.',
    act: async (v) => {
      await v.navRaw('reportes'); await sleep(900);
      await v.point('.modal [data-pin]'); await v.page.keyboard.type('1234', { delay: 180 }); await sleep(300);
      await v.point('.modal [data-ok]'); await sleep(1800);
      await v.hl('.kpis', 4200);
      await v.scroll(380); await v.hl('.grid-3', 4200); await v.scroll(0);
      await v.hl('#r-csv', 1400); await v.hl('#r-pdf', 1400);
    } },
  { id: '15-ajustes', text: 'En Configuración colocas los datos de tu negocio para los recibos, el IVA y los días de crédito. También cambias tu PIN y tu contraseña, y descargas una copia de seguridad de toda tu información.',
    act: async (v) => { await v.nav('ajustes'); await sleep(700); await v.hl('#f-biz', 3000); await v.hl('#f-tax', 2600); await v.hl('#b-pin', 1800); await v.hl('#b-backup', 2200); await v.hl('#b-install', 1800); } },
  { id: '16-multisede', card: 'multi', text: 'SanoGestion es multisede. Cada tienda tiene su propio usuario y sus datos completamente separados, y el administrador ve todas las sedes, sus ventas del día, y puede crear, suspender o activar cuentas desde un solo panel.' },
  { id: '17-instalar', card: 'phone', text: 'Y se instala desde el navegador, en tu teléfono o tu computadora, sin descargar nada de una tienda de aplicaciones. Funciona incluso sin internet, y todo se sincroniza cuando vuelve la conexión.' },
  { id: '18-ayuda', text: 'Si tienes dudas, en el menú “Ayuda y tutorial” encuentras este mismo video y los consejos principales.',
    act: async (v) => { await v.nav('inicio'); await sleep(500); await v.point('#sb-help'); await sleep(1300); await v.hl('.modal .help-tips', 3000); }, after: 'closeModal' },
  { id: '19-cierre', card: 'outro', text: '¿Listo para tu negocio? Escríbenos por WhatsApp al cero, cuatro, dos, dos, uno, nueve, cero, seis, cero, cuatro, cinco, y activa SanoGestion hoy mismo. ¡Gracias por ver!' }
];

// ======================================================================
// Voz
// ======================================================================
function tts(scene) {
  const h = createHash('md5').update(VOICE + scene.text).digest('hex').slice(0, 10);
  const mp3 = path.join(WORK, `${scene.id}-${h}.mp3`), srt = path.join(WORK, `${scene.id}-${h}.srt`);
  if (!existsSync(mp3)) execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+4%', '--text', scene.text, '--write-media', mp3, '--write-subtitles', srt]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString());
  return { mp3, srt, dur };
}

// ======================================================================
// Ayudas visuales
// ======================================================================
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById('vcur')) return;
    const st = document.createElement('style');
    st.textContent = `#vcur{position:fixed;left:640px;top:360px;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.2,.8,.2,1),top .7s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
      .vrip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #fbbf24;z-index:2147483646;pointer-events:none;animation:vrip .6s ease-out forwards}
      @keyframes vrip{to{transform:scale(3.6);opacity:0}}
      .vhl{position:fixed;z-index:2147483645;pointer-events:none;border-radius:14px;border:3px solid #fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.25),0 0 28px 6px rgba(251,191,36,.4);animation:vhl 1.4s ease-in-out infinite}
      @keyframes vhl{50%{box-shadow:0 0 0 7px rgba(251,191,36,.16),0 0 34px 10px rgba(251,191,36,.28)}}
      .toasts{bottom:18px!important}`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = 'vcur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-3 1.4-3.6-7.6L4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
};

function helpers(page) {
  const rectOf = async (sel, text = null, inner = null, up = null) => {
    const r = await page.evaluate((sel, text, inner, up) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      let el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
      if (!el) return null;
      if (inner) el = el.querySelector(inner) || el;
      if (up) el = el.closest(up) || el;
      const b0 = el.getBoundingClientRect();
      // 'nearest' también desplaza contenedores internos (formularios en ventanas, menú lateral)
      el.scrollIntoView({ block: (b0.top < 0 || b0.bottom > innerHeight) ? 'center' : 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, sel, text, inner, up);
    if (!r) console.warn('   (no encontré', sel, text || '', inner || '', ')');
    return r;
  };
  const moveXY = async (x, y) => { await page.evaluate((x, y) => { const c = document.getElementById('vcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, x, y); await sleep(760); };
  const clickAt = async (r) => {
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    await moveXY(x, y);
    await page.evaluate((x, y) => { const d = document.createElement('div'); d.className = 'vrip'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, x, y);
    await page.mouse.click(x, y); await sleep(250);
  };
  const v = {
    page,
    async move(sel, text) { const r = await rectOf(sel, text); if (r) await moveXY(r.x + r.w / 2, r.y + r.h / 2); return r; },
    async point(sel, text) { const r = await rectOf(sel, text); if (r) await clickAt(r); },
    async pointIn(rowSel, text, inner) { const r = await rectOf(rowSel, text, inner); if (r) await clickAt(r); },
    async hl(sel, ms = 2500, up = null, text = null) {
      const r = await rectOf(sel, text, null, up);
      if (!r) { await sleep(ms); return; }
      await page.evaluate((r) => { const d = document.createElement('div'); d.className = 'vhl'; Object.assign(d.style, { left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.w + 12 + 'px', height: r.h + 12 + 'px' }); document.body.appendChild(d); }, r);
      await sleep(ms);
      await page.evaluate(() => document.querySelectorAll('.vhl').forEach((d) => d.remove()));
    },
    hlRow(sel, text, ms) { return v.hl(sel, ms, null, text); },
    async typeSlow(t) { await page.keyboard.type(t, { delay: 85 }); await sleep(250); },
    async selectAll() { await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); },
    async clearSearch() { await page.evaluate(() => { const i = document.getElementById('pos-search'); i.value = ''; i.dispatchEvent(new Event('input')); }); await sleep(300); },
    async selectOption(sel, label) {
      await v.move(sel);
      await page.evaluate((sel, label) => { const s = document.querySelector(sel); const o = [...s.options].find((x) => x.textContent.includes(label)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } }, sel, label);
      await sleep(300);
    },
    async rate() { return page.evaluate(async () => (await import('/js/store.js')).store.rate); },
    async scroll(y) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y); await sleep(700); },
    async scrollModalTo(sel) { await page.evaluate((sel) => document.querySelector('.modal ' + sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sel); await sleep(700); },
    async nav(id) { await v.point(`.sb-nav [data-nav="${id}"]`); await sleep(500); await page.evaluate(() => window.scrollTo(0, 0)); },
    async navRaw(id) { await v.point(`.sb-nav [data-nav="${id}"]`); }
  };
  return v;
}

// ======================================================================
// Tarjetas
// ======================================================================
const logo = readFileSync(path.join(ROOT, 'public', 'assets', 'logo.svg'), 'utf8');
const CARD_CSS = `body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
  background:radial-gradient(900px 520px at 105% -10%,rgba(16,185,129,.55) 0%,transparent 60%),radial-gradient(700px 480px at -5% 115%,rgba(249,115,22,.35) 0%,transparent 60%),linear-gradient(155deg,#0b1a2e,#07111f 55%,#050a14)}
  .c{height:100%;display:flex;align-items:center;justify-content:center;gap:60px;text-align:left;padding:0 70px;box-sizing:border-box}
  .logo svg{width:150px;height:150px;border-radius:40px;box-shadow:0 30px 60px -20px rgba(0,0,0,.7);animation:pop .9s cubic-bezier(.2,.8,.2,1)}
  h1{font-size:62px;margin:0;letter-spacing:-2px;line-height:1.05;animation:up .9s .15s both} h1 em{font-style:normal;background:linear-gradient(90deg,#34d399,#22d3ee);-webkit-background-clip:text;color:transparent}
  p{font-size:25px;margin:16px 0 0;opacity:.85;animation:up .9s .35s both} .tag{display:inline-block;margin-top:26px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);font-size:19px;animation:up .9s .55s both}
  @keyframes pop{from{transform:scale(.6);opacity:0}} @keyframes up{from{transform:translateY(22px);opacity:0}}`;
let PHONE = [];
let ADMIN_SHOT = '';
function cardHTML(kind) {
  if (kind === 'intro') return `<style>${CARD_CSS}</style><div class="c"><div class="logo">${logo}</div><div><h1>Sano<em>Gestion</em></h1><p>Tutorial: cómo usar el sistema en tu tienda o bodega</p><span class="tag">Punto de venta · Inventario · Caja en $ y Bs · Fiados · Reportes · Multisede</span></div></div>`;
  if (kind === 'outro') return `<style>${CARD_CSS} .wa{display:inline-flex;align-items:center;gap:14px;margin-top:28px;padding:18px 28px;border-radius:18px;background:#16a34a;font-size:34px;font-weight:700;animation:up .9s .45s both;box-shadow:0 20px 40px -16px rgba(22,163,74,.8)} .url{margin-top:18px;font-size:30px;font-weight:700;color:#5eead4;animation:up .9s .6s both}</style>
    <div class="c"><div class="logo">${logo}</div><div><h1>¿Listo para <em>tu negocio?</em></h1><div class="url">sano-gestion.web.app</div><div class="wa">WhatsApp +58 422-190 6045</div></div></div>`;
  if (kind === 'multi') return `<style>${CARD_CSS} .shot{width:640px;border-radius:16px;box-shadow:0 30px 70px -20px rgba(0,0,0,.85),0 0 0 2px rgba(255,255,255,.08);animation:pop .9s cubic-bezier(.2,.8,.2,1)} .steps{max-width:470px} .steps h1{font-size:48px} .st{display:flex;gap:14px;align-items:center;margin-top:20px;font-size:22px;animation:up .8s both} .st b{width:40px;height:40px;border-radius:12px;background:#0f9d77;display:grid;place-items:center;flex:none}</style>
    <div class="c"><img class="shot" src="${ADMIN_SHOT}"><div class="steps"><h1>Una cuenta <em>por sede</em></h1>
    <div class="st" style="animation-delay:.4s"><b>1</b>Cada tienda con su usuario y sus datos aislados</div>
    <div class="st" style="animation-delay:1.6s"><b>2</b>El administrador ve las ventas de todas</div>
    <div class="st" style="animation-delay:2.8s"><b>3</b>Crea, suspende o activa sedes al instante</div></div></div>`;
  return `<style>${CARD_CSS} .phone{position:relative;width:300px;height:640px;border-radius:46px;background:#000;padding:12px;box-shadow:0 40px 80px -24px rgba(0,0,0,.85),0 0 0 2px #333;overflow:hidden;flex:none;animation:pop .9s cubic-bezier(.2,.8,.2,1)}
    .phone img{position:absolute;left:12px;top:12px;width:300px;height:640px;object-fit:cover;object-position:top;border-radius:36px}
    .phone .s2{opacity:0;animation:fadein .8s 6s forwards} @keyframes fadein{to{opacity:1}}
    .steps{max-width:540px} .steps h1{font-size:50px} .st{display:flex;gap:16px;align-items:center;margin-top:22px;font-size:23px;animation:up .8s both} .st b{width:44px;height:44px;border-radius:14px;background:#0f9d77;display:grid;place-items:center;flex:none}</style>
    <div class="c"><div class="phone"><img src="${PHONE[0]}"><img class="s2" src="${PHONE[1]}"></div><div class="steps"><h1>Instálalo <em>desde la web</em></h1>
    <div class="st" style="animation-delay:.4s"><b>1</b>Abre sano-gestion.web.app en Chrome o Safari</div>
    <div class="st" style="animation-delay:1.6s"><b>2</b>Toca “Instalar” o “Agregar a inicio”</div>
    <div class="st" style="animation-delay:2.8s"><b>3</b>El ícono queda en tu pantalla</div>
    <div class="st" style="animation-delay:4s"><b>✓</b>Funciona sin internet y se sincroniza solo</div></div></div>`;
}

// ======================================================================
// Grabación
// ======================================================================
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', `--window-size=${W},${H}`] });

// Capturas para las tarjetas: teléfono (demo) y panel del administrador
{
  const ctx = await browser.createBrowserContext();
  const m = await ctx.newPage();
  await m.setViewport({ width: 390, height: 832, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.evaluateOnNewDocument(() => { try { localStorage.setItem('sg_theme', 'dark'); } catch (_) {} });
  await m.goto(APP, { waitUntil: 'networkidle0' });
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await m.click('#lg-demo');
  await m.waitForFunction(() => document.body.innerText.includes('PIN de datos sensibles'), { timeout: 60000 });
  await m.evaluate(() => document.querySelector('#modals [data-close]')?.click()); await sleep(1500);
  await m.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await m.evaluate(() => document.getElementById('demo-end')?.click()); await sleep(300);
  await m.evaluate(() => document.querySelector('#modals .modal-backdrop:last-child [data-yes]')?.click()); await sleep(2500);
  await ctx.close();
  const acc = JSON.parse(readFileSync(path.join(ROOT, 'scripts', '.accounts-emu.json'), 'utf8'));
  const ctx2 = await browser.createBrowserContext();
  const a = await ctx2.newPage();
  await a.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await a.evaluateOnNewDocument(() => { try { localStorage.setItem('sg_theme', 'dark'); } catch (_) {} });
  await a.goto(APP, { waitUntil: 'networkidle0' });
  await a.type('#lg-user', 'admin'); await a.type('#lg-pass', acc.admin.password); await a.click('#lg-btn');
  await a.waitForFunction(() => document.body.innerText.includes('Panel de administración'), { timeout: 30000 }); await sleep(2500);
  ADMIN_SHOT = 'data:image/png;base64,' + (await a.screenshot({ encoding: 'base64' }));
  await ctx2.close();
}

const app = await (await browser.createBrowserContext()).newPage();
await app.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await app.evaluateOnNewDocument(OVERLAY);
await app.evaluateOnNewDocument(() => { window.print = () => {}; window.open = () => null; try { localStorage.setItem('sg_theme', 'dark'); } catch (_) {} });
const v = helpers(app);
await app.goto(APP, { waitUntil: 'networkidle0' });
await app.waitForSelector('#login-form');
await sleep(1200);

const parts = [];
for (const sc of SCENES) {
  const voice = tts(sc);
  console.log(`● ${sc.id} (${voice.dur.toFixed(1)} s)`);
  const webm = path.join(WORK, `${sc.id}.webm`);
  let page = app, cardPage = null;
  if (sc.card) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await cardPage.setContent(cardHTML(sc.card), { waitUntil: 'load' });
    page = cardPage;
  }
  await page.bringToFront();
  await sleep(300);
  const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG });
  const t0 = Date.now();
  if (sc.act) { try { await sc.act(v, voice.dur); } catch (e) { console.warn('   acción:', e.message); } }
  const left = voice.dur * 1000 + 700 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await rec.stop();
  const total = Math.max(voice.dur + 0.7, (Date.now() - t0) / 1000);
  parts.push({ webm, ...voice, total });
  if (cardPage) await cardPage.close();
  if (sc.after === 'demo') {
    await app.waitForFunction(() => document.body.innerText.includes('PIN de datos sensibles'), { timeout: 90000 });
    await sleep(2500);
    await app.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  }
  if (sc.after === 'closeModal') { await app.keyboard.press('Escape'); await sleep(400); await app.keyboard.press('Escape'); await sleep(300); }
  await app.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove())).catch(() => {});
}
// Terminar la demo (limpieza)
await app.evaluate(() => document.getElementById('demo-end')?.click()).catch(() => {}); await sleep(300);
await app.evaluate(() => document.querySelector('#modals .modal-backdrop:last-child [data-yes]')?.click()).catch(() => {}); await sleep(3000);
await browser.close();

// ======================================================================
// Montaje con ffmpeg
// ======================================================================
const subStyle = "FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const list = [];
for (const p of parts) {
  const mp4 = p.webm.replace('.webm', '.mp4');
  const srtName = path.basename(p.srt);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p.webm, '-i', p.mp3,
    '-filter_complex', `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x07111f,tpad=stop_mode=clone:stop_duration=5,subtitles=${srtName}:force_style='${subStyle}',setsar=1[v];[1:a]adelay=250|250,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', p.total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', mp4], { cwd: WORK });
  list.push(`file '${mp4.replace(/\\/g, '/')}'`);
}
const listFile = path.join(WORK, 'lista.txt');
writeFileSync(listFile, list.join('\n'));
const final = path.join(OUT_DIR, 'sanogestion-tutorial.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final]);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', parts[0].webm.replace('.webm', '.mp4'), '-frames:v', '1', '-q:v', '3', path.join(OUT_DIR, 'portada.jpg')]);
copyFileSync(final, path.join(DESK_DIR, 'SanoGestion-Tutorial.mp4'));
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
console.log(`\n✔ Video listo: ${final} (${(dur / 60).toFixed(1)} min)`);

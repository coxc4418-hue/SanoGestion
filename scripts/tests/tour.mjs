// SanoGestion — Prueba del recorrido guiado de la demo en PC, tablet y teléfonos.
// Uso: bash tests/run-emu.sh tour.mjs   (capturas en tests/tour-shots/)
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://127.0.0.1:5055/?emu=1';
const SHOTS = path.join(here, 'tour-shots'); rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fail = 0; const errors = [];
function check(cond, msg) { if (cond) ok++; else { fail++; console.log('  ✘ ' + msg); } }

const VIEWS = [['pc', 1366, 900], ['tablet', 820, 1180], ['iphone', 390, 844], ['android', 360, 740]];
const TOURS = ['general', 'vender', 'inventario', 'fiados', 'caja'];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });

async function waitStep(p) {
  await p.waitForFunction(() => { const t = document.querySelector('.tour-tip'); return t && !t.classList.contains('busy') && t.querySelector('[data-t="next"]'); }, { timeout: 15000 });
  // espera a que el foco termine de moverse (dos mediciones iguales)
  let prev = '';
  for (let k = 0; k < 20; k++) {
    await sleep(180);
    const cur = await p.evaluate(() => { const a = document.querySelector('.tour-spot').getBoundingClientRect(), b = document.querySelector('.tour-tip').getBoundingClientRect(); return [a.left, a.top, a.width, a.height, b.left, b.top].map(Math.round).join(','); });
    if (cur === prev) break; prev = cur;
  }
}
async function info(p) {
  return p.evaluate(() => {
    const tip = document.querySelector('.tour-tip'), spot = document.querySelector('.tour-spot');
    const r = tip.getBoundingClientRect(), s = spot.getBoundingClientRect();
    return {
      step: tip.querySelector('.tour-step').innerText, title: tip.querySelector('.tour-title').innerText,
      centered: tip.classList.contains('center'), spotW: s.width, spotH: s.height,
      tipIn: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      overlap: !(r.bottom <= s.top || r.top >= s.bottom || r.right <= s.left || r.left >= s.right) && s.width > 0 && !tip.className.includes('inside'),
      spotIn: s.width === 0 || (s.left >= 3 && s.right <= innerWidth - 3) || s.width >= innerWidth - 12,
      overflowX: document.documentElement.scrollWidth - innerWidth, modals: document.querySelectorAll('#modals .modal-backdrop').length
    };
  });
}

for (const [name, w, h] of VIEWS) {
  console.log(`\n■ ${name} ${w}x${h}`);
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900 });
  p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|analytics|dolarapi|ERR_|net::|400/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#lg-demo', { visible: true });
  await p.click('#lg-demo');
  await p.waitForSelector('#dw-tour', { visible: true, timeout: 40000 });
  check(await p.evaluate(() => document.querySelector('#modals').innerText.includes('Explorar por mi cuenta')), `${name}: la bienvenida ofrece el recorrido`);
  await p.screenshot({ path: path.join(SHOTS, `${name}-00-bienvenida.png`) });
  await p.click('#dw-tour');

  for (const id of TOURS) {
    if (id !== 'general') {
      await p.evaluate(async () => (await import('/js/main.js')).openHelp());
      await p.waitForSelector(`#modals [data-tour-id="${id}"]`, { visible: true });
      if (id === 'vender') await p.screenshot({ path: path.join(SHOTS, `${name}-ayuda.png`) });
      await p.click(`#modals [data-tour-id="${id}"]`);
    }
    let i = 0, missed = [];
    while (true) {
      await waitStep(p);
      const s = await info(p);
      i++;
      const finalOrIntro = /Bienvenido|Listo para/.test(s.title);
      const okReportesMovil = s.title === 'Reportes' && w < 961;
      if (s.centered && !finalOrIntro && !okReportesMovil) missed.push(s.title);
      check(s.tipIn, `${name}/${id} "${s.title}": tarjeta dentro de la pantalla`);
      check(!s.overlap, `${name}/${id} "${s.title}": la tarjeta no tapa la zona iluminada`);
      check(s.spotIn, `${name}/${id} "${s.title}": la zona iluminada está dentro de la pantalla`);
      check(s.overflowX <= 0, `${name}/${id} "${s.title}": sin scroll lateral (${s.overflowX}px)`);
      check(s.modals === 0, `${name}/${id} "${s.title}": sin ventanas abiertas encima`);
      await p.screenshot({ path: path.join(SHOTS, `${name}-${id}-${String(i).padStart(2, '0')}.png`) });
      const last = await p.evaluate(() => document.querySelector('[data-t="next"]').innerText.includes('Terminar'));
      await p.click('[data-t="next"]');
      if (last) break;
    }
    await sleep(300);
    check(missed.length === 0, `${name}/${id}: todas las zonas encontradas (faltan: ${missed.join(', ')})`);
    check(await p.evaluate(() => !document.querySelector('.tour')), `${name}/${id}: el recorrido se cierra al terminar`);
    console.log(`  ${id}: ${i} pasos${missed.length ? ' · sin zona: ' + missed.join(', ') : ''}`);
  }
  // Teclado: Esc cierra
  if (w > 900) {
    await p.evaluate(async () => (await import('/js/tour.js')).startTour('caja'));
    await waitStep(p); await p.keyboard.press('ArrowRight'); await sleep(150); await waitStep(p);
    { const st = (await info(p)).step; check(/2 de/i.test(st), `${name}: flecha derecha avanza (${st})`); }
    await p.keyboard.press('Escape'); await sleep(200);
    check(await p.evaluate(() => !document.querySelector('.tour')), `${name}: Esc cierra el recorrido`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nResultado: ${ok} OK, ${fail} fallas, ${errors.length} errores de consola`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
process.exit(fail || errors.length ? 1 : 0);

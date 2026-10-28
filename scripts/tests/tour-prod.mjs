// Verificación rápida del recorrido en producción (entra a una demo, recorre el general y termina la demo)
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox'] });
const errors = []; let code = 0;
for (const [name, w, h] of [['pc', 1366, 900], ['telefono', 390, 844]]) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900 });
  p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  await p.goto('https://sano-gestion.web.app/', { waitUntil: 'networkidle2' });
  await p.click('#lg-demo');
  await p.waitForSelector('#dw-tour', { visible: true, timeout: 60000 });
  await p.click('#dw-tour');
  const titles = []; let centered = 0;
  for (let i = 0; i < 30; i++) {
    await p.waitForFunction((n) => { const t = document.querySelector('.tour-tip'); return t && !t.classList.contains('busy') && t.querySelector('.tour-step')?.innerText.includes(` ${n} `); }, { timeout: 20000 }, i + 1);
    await sleep(700);
    const s = await p.evaluate(() => ({ t: document.querySelector('.tour-title').innerText, c: document.querySelector('.tour-tip').classList.contains('center'), last: document.querySelector('[data-t="next"]').innerText.includes('Terminar'), ox: document.documentElement.scrollWidth - innerWidth }));
    titles.push(s.t); if (s.c) centered++; if (s.ox > 0) errors.push(`${name}: scroll lateral en ${s.t}`);
    await p.click('[data-t="next"]'); if (s.last) break;
  }
  await sleep(400);
  const closed = await p.evaluate(() => !document.querySelector('.tour'));
  console.log(titles.join(' | '));
  console.log(`${name}: ${titles.length} pasos, ${centered} centrados (intro/final${w < 900 ? '/reportes' : ''}), cerrado=${closed}`);
  if (titles.length !== 18 || !closed || centered > (w < 900 ? 3 : 2)) code = 1;
  await p.evaluate(() => document.getElementById('demo-end')?.click()); await sleep(400);
  await p.evaluate(() => document.querySelector('#modals .modal-backdrop:last-child [data-yes]')?.click());
  await p.waitForFunction(() => document.body.innerText.includes('Tu demo terminó'), { timeout: 40000 }).then(() => console.log(`${name}: demo terminada y borrada`)).catch(() => { console.log(name + ': no se vio el aviso de fin'); code = 1; });
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'sin errores');
process.exit(code || errors.length ? 1 : 0);

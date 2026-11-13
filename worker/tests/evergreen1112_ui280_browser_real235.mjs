// Evergreen 12 Nov 2026, lane ui280, round 5 build (13 Nov 2026): the harness's REAL v235 launch page in headless Edge.
// Nothing is intercepted: the page script, both view modules and /api/admin/launch-operations are the local QA harness's
// own (the real Worker on its synthetic database, which has no roster export, so the real reply is a held v235 page).
// As the owner persona at 1440, 768, 390 and 320 px: every hold is a plain sentence (each code once), the page says no
// roster was read, nothing overflows sideways, every control is at least 44 px on the touch widths, and Tab reaches
// every enabled control of the view with a visible focus ring.
// Usage: node tests/evergreen1112_ui280_browser_real235.mjs   (env: UI280_ORIGIN, UI280_CDP_PORT, UI280_CDP_HELPER, UI280_OUT,
// UI280_BASE_APP=<file> to serve another page script, for the fail-before run)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ORIGIN = process.env.UI280_ORIGIN || 'http://127.0.0.1:63687', PORT = Number(process.env.UI280_CDP_PORT || 63688);
const HELPER = process.env.UI280_CDP_HELPER || 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const OUT = process.env.UI280_OUT || path.join(process.env.TEMP || '.', 'ui280-browser-real235');
const BASE_APP = process.env.UI280_BASE_APP ? fs.readFileSync(process.env.UI280_BASE_APP) : null;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw Error('ui280 browser checks run against a local harness only');
const { launch, instrument, viewport, screenshot, key, sleep } = await import(pathToFileURL(HELPER).href);

let ok = 0, n = 0;
const results = [];
const check = (name, cond, detail) => { n++; if (cond) ok++; results.push({ name, pass: !!cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '\n     ' + JSON.stringify(detail).slice(0, 1500))); };
fs.mkdirSync(OUT, { recursive: true });
const cdp = await launch({ port: PORT, profile: path.join(OUT, 'profile') });
const state = await instrument(cdp);
const api = [];
cdp.on('Network.responseReceived', p => { if (/\/api\/admin\/launch-operations/.test(p.response.url)) api.push({ url: p.response.url, status: p.response.status }); });
if (BASE_APP) {
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/static/app.js*', requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', p => cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: BASE_APP.toString('base64') }).catch(() => {}));
}
const SETTLED = `!!document.querySelector('[data-launch234-held],#launch-motd229,[data-launch235-restart]') || document.body.textContent.includes('could not be confirmed')`;
const go = async () => {
  await cdp.eval(`location.hash = '#/'; true`); await sleep(200);
  await cdp.eval(`location.hash = '#/admin/launch-operations'; true`);
  for (let i = 0; i < 120; i++) { await sleep(150); if (await cdp.eval(SETTLED)) break; }
  await sleep(400);
};
const MEASURE = `(() => {
  const view = document.querySelector('[data-launch234]') || document.createElement('div'), vw = document.documentElement.clientWidth;
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const controls = [...view.querySelectorAll('button, summary, a[href], [tabindex]')].filter(visible);
  const small = controls.map(el => { const r = el.getBoundingClientRect(); return { t: el.tagName, text: el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 44 || x.w < 44);
  const outside = [...view.querySelectorAll('*')].filter(el => !el.closest('.table-wrap') && visible(el) && el.getBoundingClientRect().right > vw + 1).map(el => el.tagName + '.' + el.className).slice(0, 8);
  const frame = [...view.querySelectorAll('h2')].find(h => h.textContent === 'Discovery and current eligibility')?.closest('section');
  return { docOverflowPx: document.documentElement.scrollWidth - window.innerWidth, small, outside,
    holds: [...view.querySelectorAll('[data-launch234-hold]')].map(li => [li.dataset.launch234Hold, li.textContent]),
    scope: frame ? frame.querySelectorAll('p')[0]?.textContent : null, progress: view.querySelector('[data-launch-progress229]')?.textContent || null,
    refused: view.querySelector('[data-launch234-held]')?.dataset.launch234Held || null, status: view.querySelector('[role=status]')?.textContent || '',
    module235: !!document.querySelector('script[src="/static/launch-discovery235.js"]'), motd: !!document.querySelector('#launch-motd229'),
    enabled: controls.filter(el => !el.disabled && !el.hidden).map(el => el.textContent.trim()) };
})()`;
try {
  await viewport(cdp, 1440, 900);
  await cdp.send('Page.navigate', { url: ORIGIN + '/__qa/owner?to=' + encodeURIComponent('/#/admin') });
  await sleep(2500);
  const realApi = await cdp.eval(`fetch('/api/admin/launch-operations',{headers:{'X-Olympus':'2'},credentials:'same-origin'}).then(r=>r.json())`);
  const layout = [];
  for (const w of [1440, 768, 390, 320]) {
    await viewport(cdp, w, 900);
    await go();
    const m = await cdp.eval(MEASURE);
    // Keyboard: from the view title, Tab through the view; every enabled control must be reached, each with a focus ring.
    await cdp.eval(`(() => { const t = [...document.querySelectorAll('[data-launch234] h2')][0] || document.querySelector('main h1'); t.setAttribute('tabindex','-1'); t.focus(); return true; })()`);
    const reached = [];
    for (let i = 0; i < 30; i++) {
      await key(cdp, 'Tab', 'Tab', 9); await sleep(50);
      const f = await cdp.eval(`(() => { const a = document.activeElement, s = getComputedStyle(a), inView = !!a.closest('[data-launch234]'); return { inView, text: (a.textContent || a.id || a.tagName).trim().slice(0, 40), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none' }; })()`);
      if (f.inView) reached.push(f);
    }
    layout.push({ width: w, ...m, reached });
    await screenshot(cdp, path.join(OUT, `real-held-${w}.png`), true);
  }
  const head = layout[0];
  for (const x of layout) console.log('  measured ' + JSON.stringify({ width: x.width, overflowPx: x.docOverflowPx, outside: x.outside.length, under44: x.small, enabled: x.enabled, tabReached: x.reached.filter(r => x.enabled.includes(r.text)).map(r => r.text + (r.ring ? ' (ring)' : ' (no ring)')) }));
  check('the real route answers a held v235 page on the harness (no roster export), and the page reads it without a refusal at every width', realApi.protocol === 'officer-operations-v235' && realApi.status === 'held' && layout.every(x => x.motd && x.module235 && x.refused === null && !/could not be confirmed/.test(x.status)), { protocol: realApi.protocol, status: realApi.status, heldReasons: realApi.heldReasons, layout: layout.map(x => ({ w: x.width, refused: x.refused, status: x.status })) });
  check('every hold is listed once, in a plain sentence, and the page says no roster was read and nothing was examined', JSON.stringify(head.holds.map(x => x[0])) === JSON.stringify([...new Set(realApi.heldReasons)]) && head.holds.every(([c, t]) => t && !t.includes(c) && !t.startsWith('Held for a reason') && !t.startsWith('Ranks are held because')) && head.scope === 'No roster export was read on this page. The holds below say why.' && head.progress === 'Nothing was examined on this read.', { holds: head.holds, scope: head.scope, progress: head.progress });
  check('no horizontal page overflow and nothing outside the viewport at 1440, 768, 390 and 320 px', layout.every(x => x.docOverflowPx <= 0 && x.outside.length === 0), layout.map(x => ({ w: x.width, overflow: x.docOverflowPx, outside: x.outside })));
  check('every control of the view is at least 44 by 44 px on the touch widths (390 and 320 px)', layout.filter(x => x.width < 768).every(x => x.small.length === 0), layout.filter(x => x.width < 768).map(x => ({ w: x.width, small: x.small })));
  check('Tab reaches every enabled control of the view at every width, each with a visible focus ring', layout.every(x => x.enabled.every(t => x.reached.some(r => r.text === t && r.ring))), layout.map(x => ({ w: x.width, enabled: x.enabled, reached: x.reached.map(r => r.text + (r.ring ? '' : ' (no ring)')) })));
  check('the page read the real route once per visit, with no error reply and no script error', api.length >= 4 && api.every(r => r.status === 200) && state.exceptions.length === 0, { api, exceptions: state.exceptions });
} finally {
  await cdp.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ origin: ORIGIN, baseApp: process.env.UI280_BASE_APP || null, ok, n, results }, null, 1));
  console.log(`\n${ok}/${n} ui280 real v235 browser checks passed`);
  process.exitCode = ok === n ? 0 : 1;
}

// Evergreen 12 Nov 2026, lane ui280, Pieces 2 and 3: browser checks on a local QA harness.
// Piece 2: the News activity table (/static/activity280.js) on #/news against the real /api/news figures.
// Piece 3: the owner's receipt-note cleanup (/static/note-redaction280.js) on #/admin/donation-ledger against the real
// POST /api/admin/treasury/ledger/note-redaction. Needs the harness-ui280 copy (in-memory DB, synthetic owner persona,
// News figures and receipts with notes, no provider) and headless Edge through the audit CDP helper.
// With UI280_BASE_APP=<file> the page script is replaced by that file (fail-before on the base commit).
// Usage: node tests/evergreen1112_ui280_browser23.mjs   (env: UI280_ORIGIN, UI280_CDP_PORT, UI280_CDP_HELPER, UI280_OUT)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ORIGIN = process.env.UI280_ORIGIN || 'http://127.0.0.1:63720', PORT = Number(process.env.UI280_CDP_PORT || 63721);
const HELPER = process.env.UI280_CDP_HELPER || 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const OUT = process.env.UI280_OUT || path.join(process.env.TEMP || '.', 'ui280-browser23');
const BASE_APP = process.env.UI280_BASE_APP ? fs.readFileSync(process.env.UI280_BASE_APP) : null;
// Round 2: with UI280_BASE_NR=<file> the cleanup module is replaced too (fail-before of the module's own changes).
const BASE_NR = process.env.UI280_BASE_NR ? fs.readFileSync(process.env.UI280_BASE_NR) : null;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw Error('ui280 browser checks run against a local harness only');
const { launch, instrument, viewport, screenshot, key, sleep } = await import(pathToFileURL(HELPER).href);
const NR_PATH = '/api/admin/treasury/ledger/note-redaction', NOTE = 'QA SYNTHETIC RECEIPT NOTE';
const WIDTHS = [1440, 1280, 768, 390, 375, 320];

let ok = 0, n = 0;
const results = [];
const check = (name, cond, detail) => { n++; if (cond) ok++; results.push({ name, pass: !!cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '\n     ' + JSON.stringify(detail).slice(0, 1400))); };
const api = async (persona, method, p, body) => { const r = await fetch(ORIGIN + p, { method, headers: { Cookie: 'QA209_persona=' + persona, 'X-Olympus': '2', ...(body ? { 'Content-Type': 'application/json', Origin: ORIGIN } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };

// Reset to a fresh synthetic database so the one-time cleanup starts unapplied.
const reset = await fetch(ORIGIN + '/__qa/reset');
if (reset.status !== 200) throw Error('harness reset failed ' + reset.status);
fs.mkdirSync(OUT, { recursive: true });
const cdp = await launch({ port: PORT, profile: path.join(OUT, 'profile') });
const state = await instrument(cdp);
let mode = { kind: 'real' }; const sent = [];
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' + NR_PATH + '*', requestStage: 'Request' }, ...(BASE_APP ? [{ urlPattern: '*/static/app.js*', requestStage: 'Request' }] : []), ...(BASE_NR ? [{ urlPattern: '*/static/note-redaction280.js*', requestStage: 'Request' }] : [])] });
cdp.on('Fetch.requestPaused', async p => {
  try {
    if (/\/static\/app\.js/.test(p.request.url)) return await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: BASE_APP.toString('base64') });
    if (/\/static\/note-redaction280\.js/.test(p.request.url)) return await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: BASE_NR.toString('base64') });
    const body = p.request.postData || '';
    sent.push(body);
    if (mode.kind === 'lost-apply' && body.includes('"apply"')) return await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionClosed' });
    if (mode.kind === 'hang-apply' && body.includes('"apply"')) return; // never answered: the page's own 30 s limit decides
    return await cdp.send('Fetch.continueRequest', { requestId: p.requestId });
  } catch (e) { console.log('intercept error', e.message); }
});
const evalJ = js => cdp.eval(js);
const go = async (hash, settle) => {
  await evalJ(`location.hash = '#/'; true`); await sleep(200);
  await evalJ(`location.hash = ${JSON.stringify(hash)}; true`);
  for (let i = 0; i < 120; i++) { await sleep(150); if (await evalJ(settle)) return true; }
  return false;
};
const signIn = async persona => { await cdp.send('Page.navigate', { url: ORIGIN + '/__qa/' + persona + '?to=' + encodeURIComponent('/#/') }); await sleep(2500); };
const measure = scope => evalJ(`(() => {
  const root = document.querySelector(${JSON.stringify(scope)}) || document.createElement('div'), vw = document.documentElement.clientWidth;
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const controls = [...root.querySelectorAll('button, a[href], input, textarea, label, [tabindex]:not([tabindex="-1"])')].filter(visible);
  const small = controls.filter(el => !['TEXTAREA', 'INPUT'].includes(el.tagName)).map(el => { const r = el.getBoundingClientRect(); return { t: el.tagName, text: el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 44 || x.w < 44);
  const wraps = [...root.querySelectorAll('.table-wrap')].map(el => el.scrollWidth - el.clientWidth);
  const outside = [...root.querySelectorAll('*')].filter(el => visible(el) && el.getBoundingClientRect().right > vw + 1).map(el => el.tagName + '.' + el.className).slice(0, 8);
  return { present: root.isConnected, docOverflowPx: document.documentElement.scrollWidth - window.innerWidth, small, wraps, outside };
})()`);
const tabTo = async (predicateJs, limit = 60) => {
  const trail = [];
  for (let i = 0; i < limit; i++) {
    await key(cdp, 'Tab', 'Tab', 9); await sleep(50);
    const f = await evalJ(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { tag: a.tagName, id: a.id, text: (a.textContent || '').trim().slice(0, 40), outline: s.outlineStyle + ' ' + s.outlineWidth, hit: (${predicateJs})(a) }; })()`);
    trail.push(f.tag + ':' + (f.id || f.text));
    if (f.hit) return { f, trail };
  }
  return { f: null, trail };
};
const press = async (k, code, kc) => { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: kc, text: k === 'Enter' ? '\r' : k === ' ' ? ' ' : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: kc }); await sleep(150); };

try {
  // ---------------------------------------------------------------- Piece 2: News
  await viewport(cdp, 1280, 900);
  await signIn('member');
  const apiNews = await api('member', 'GET', '/api/news');
  const F = apiNews.json && apiNews.json.figures;
  await go('#/news', `!!document.querySelector('[data-activity-comparison="news"]')`);
  await sleep(300);
  const shown = await evalJ(`(() => { const s = document.querySelector('[data-activity-comparison="news"]'); if (!s) return null; const frame = s.closest('section.frame');
    return { rows: [...s.querySelectorAll('tbody tr')].map(tr => [tr.querySelector('th').textContent, ...[...tr.querySelectorAll('td')].map(td => td.querySelector('span').textContent)]),
      meters: [...s.querySelectorAll('meter')].map(m => [Number(m.value), Number(m.max), m.getAttribute('aria-hidden')]), caption: s.querySelector('caption')?.textContent,
      lists: frame.querySelectorAll('dl.kv').length, headings: [...frame.querySelectorAll('h2,h3,h4')].map(h => h.tagName + ':' + h.textContent.trim()), explanation: frame.textContent.includes('Joined and left compare complete, checked roster exports') }; })()`);
  const want = v => v === 'few' ? 'Fewer than 5' : v === null || v === undefined ? 'Unavailable' : String(v);
  const expected = F ? [['Characters joined', want(F.roster.day?.joined), want(F.roster.week?.joined)], ['Characters left', want(F.roster.day?.left), want(F.roster.week?.left)], ['Applications first saved', want(F.applications.day.firstSaved), want(F.applications.week.firstSaved)], ['Decisions saved', want(F.applications.day.decided), want(F.applications.week.decided)]] : null;
  check('News: every number in the activity table equals the /api/news figures the harness served', !!F && !!shown && JSON.stringify(shown.rows) === JSON.stringify(expected), { api: F, shown: shown && shown.rows });
  const exact = F ? [F.roster.day?.joined, F.roster.week?.joined, F.roster.day?.left, F.roster.week?.left, F.applications.day.firstSaved, F.applications.week.firstSaved, F.applications.day.decided, F.applications.week.decided].filter(v => Number.isSafeInteger(v)) : [];
  check('News: bars only for exact numbers, scaled to the largest, hidden from assistive technology', !!shown && shown.meters.length === exact.length && shown.meters.every((m, i) => m[0] === exact[i] && m[1] === Math.max(1, ...exact) && m[2] === 'true'), shown && shown.meters);
  check('News: the day and week lists are replaced, the source explanation stays, headings run h2 then h3', !!shown && shown.lists === 0 && shown.explanation && JSON.stringify(shown.headings) === JSON.stringify(['H2:The guild in figures', 'H3:Activity at a glance']), shown);
  // Round 2 (12 Nov): outside the renderer's caption the frame states the count time once (in its source strip).
  const timeOnce = await evalJ(`(() => { const s = document.querySelector('[data-activity-comparison="news"]'), frame = s.closest('section.frame'), strip = frame.querySelector('[data-source-strip]'); const m = strip && /Counted (.+?); refreshed/.exec(strip.textContent); if (!m) return { n: -1 };
    const own = frame.textContent.replace(s.querySelector('caption')?.textContent || '\\u0000', ''); return { t: m[1], n: own.split(m[1]).length - 1, sentence: [...frame.querySelectorAll('p')].map(p => p.textContent).find(t => t.includes('Joined and left compare')) }; })()`);
  check('News: the count time appears once outside the table caption, and the retained sentence says only how the figures are counted', timeOnce.n === 1 && typeof timeOnce.sentence === 'string' && timeOnce.sentence.startsWith('Joined and left compare'), timeOnce);
  const newsLayout = [];
  for (const w of WIDTHS) { await viewport(cdp, w, 900); await sleep(250); newsLayout.push({ w, ...(await measure('[data-activity-comparison="news"]')) }); if ([320, 390, 1280].includes(w)) await screenshot(cdp, path.join(OUT, `news-${w}.png`), true); }
  check('News: no page overflow, nothing past the viewport and no sideways scroll inside the table at all six widths', newsLayout.every(x => x.present && x.docOverflowPx <= 0 && x.outside.length === 0 && x.wraps.every(v => v <= 0)), newsLayout.map(x => ({ w: x.w, o: x.docOverflowPx, out: x.outside, wraps: x.wraps })));
  await viewport(cdp, 1280, 900);
  // Keyboard: the table holds no stop of its own (bars are hidden, not focusable); Tab moves from the notice filters past it.
  const meterFocus = await evalJ(`[...document.querySelectorAll('[data-activity-comparison] meter')].every(m => m.tabIndex === -1)`);
  check('News keyboard: the bars are never a Tab stop, so the table adds no dead stops', meterFocus === true);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] }); await sleep(300);
  const fcNews = await evalJ(`(() => { const s = document.querySelector('[data-activity-comparison]'); const m = s && s.querySelector('meter'), cell = s && s.querySelector('tbody td'); return { active: matchMedia('(forced-colors: active)').matches, meterH: m ? Math.round(m.getBoundingClientRect().height) : 0, text: cell ? getComputedStyle(cell).color : null, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  await screenshot(cdp, path.join(OUT, 'news-forced-colors-1280.png'), true);
  check('News forced colours: the table and its bars stay drawn with system colours and no overflow', fcNews.active && fcNews.meterH > 0 && !!fcNews.text && fcNews.overflow <= 0, fcNews);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  // ---------------------------------------------------------------- Piece 3: the receipt-note cleanup
  await signIn('admin');
  await go('#/admin/donation-ledger', `document.body.textContent.includes('Donation observations')`); await sleep(800);
  const forAdmin = await evalJ(`({ control: !!document.querySelector('[data-note-redaction280]'), script: !!document.querySelector('script[src="/static/note-redaction280.js"]') })`);
  check('Ledger: another site administrator sees the ledger without the cleanup control, and the module is not requested', !forAdmin.control && !forAdmin.script, forAdmin);
  const adminTry = await api('admin', 'POST', NR_PATH, { action: 'status' });
  check('Ledger: the route itself refuses another administrator (403 forbidden)', adminTry.status === 403 && adminTry.json?.error === 'forbidden', adminTry);

  await signIn('owner');
  const ledgerBefore = await api('owner', 'GET', '/api/admin/treasury/ledger?q=&cursor=');
  const CTL = `document.querySelector('[data-note-redaction280-stage]')`;
  const stage = () => evalJ(`${CTL}?.getAttribute('data-note-redaction280-state') || null`);
  await go('#/admin/donation-ledger', `${CTL}?.getAttribute('data-note-redaction280-state') === 'idle'`);
  const idleSent = sent.length;
  const ledgerLayout = [];
  for (const w of WIDTHS) { await viewport(cdp, w, 900); await sleep(250); ledgerLayout.push({ w, ...(await measure('[data-note-redaction280]')) }); }
  check('Ledger: the owner gets the control with a count and a status read; opening it sends nothing', (await stage()) === 'idle' && idleSent === 0, { idleSent });
  await viewport(cdp, 1280, 900);
  // Keyboard: Tab to "Count the notes", Enter; Tab to the checkbox, Space; Tab to "Blank", focus ring visible.
  await evalJ(`document.querySelector('[data-note-redaction280] h2')?.setAttribute('tabindex','-1'); document.querySelector('[data-note-redaction280] h2')?.focus(); true`);
  const toCount = await tabTo(`a => a.tagName === 'BUTTON' && a.textContent === 'Count the notes'`, 10);
  if (toCount.f) await press('Enter', 'Enter', 13);
  for (let i = 0; i < 60 && (await stage()) !== 'confirm'; i++) await sleep(150);
  const confirmText = await evalJ(`${CTL}?.textContent || ''`);
  const preview = sent.length > idleSent ? sent[sent.length - 1] : null;
  check('Ledger keyboard: Tab reaches "Count the notes" with a visible focus ring and Enter opens the counts-only confirmation', !!toCount.f && !toCount.f.outline.startsWith('none') && (await stage()) === 'confirm' && preview === '{"action":"preview"}' && confirmText.includes('Notes that will be blanked: 9') && confirmText.includes('Receipt rows stored: 12') && confirmText.includes('This cannot be undone.') && !confirmText.includes(NOTE), { toCount, preview, confirmText: confirmText.slice(0, 500) });
  for (const w of WIDTHS) { await viewport(cdp, w, 900); await sleep(250); const m = await measure('[data-note-redaction280]'); ledgerLayout.push({ w, step: 'confirm', ...m }); if ([320, 390, 1280].includes(w)) await screenshot(cdp, path.join(OUT, `ledger-confirm-${w}.png`), true); }
  check('Ledger: no page overflow, nothing past the viewport and every control at least 44 px at all six widths, idle and confirm', ledgerLayout.every(x => x.present && x.docOverflowPx <= 0 && x.outside.length === 0 && x.small.length === 0), ledgerLayout.map(x => ({ w: x.w, step: x.step || 'idle', o: x.docOverflowPx, out: x.outside, small: x.small })));
  await viewport(cdp, 1280, 900);
  const focusHeading = await evalJ(`document.activeElement?.tagName + ':' + document.activeElement?.textContent`);
  const toTick = await tabTo(`a => a.id === 'note-redaction280-understood'`, 10);
  const blankBefore = await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent.startsWith('Blank'))?.disabled`);
  if (toTick.f) await press(' ', 'Space', 32);
  const toBlank = await tabTo(`a => a.tagName === 'BUTTON' && a.textContent.startsWith('Blank')`, 4);
  check('Ledger keyboard: focus moves to the step heading, the Blank button is disabled until the checkbox is ticked with Space, then reachable with a visible ring', focusHeading === 'H3:Confirm the cleanup' && blankBefore === true && !!toBlank.f && !toBlank.f.outline.startsWith('none'), { focusHeading, blankBefore, toTick: toTick.trail, toBlank: toBlank.trail });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] }); await sleep(300);
  const fcLedger = await evalJ(`(() => { const a = document.activeElement, s = getComputedStyle(a), el = document.querySelector('.note-redaction280'), box = el ? getComputedStyle(el) : { borderTopStyle: 'none' }; return { active: matchMedia('(forced-colors: active)').matches, outline: s.outlineStyle + ' ' + s.outlineWidth, border: box.borderTopStyle, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  await screenshot(cdp, path.join(OUT, 'ledger-forced-colors-1280.png'), true);
  check('Ledger forced colours: the focus ring and the control border stay drawn', fcLedger.active && !fcLedger.outline.startsWith('none') && fcLedger.border === 'solid' && fcLedger.overflow <= 0, fcLedger);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  // A lost apply reply: the browser drops the request (CDP failRequest), so the server never applies it.
  mode = { kind: 'lost-apply' };
  const beforeApply = sent.length;
  await press('Enter', 'Enter', 13);
  for (let i = 0; i < 80 && (await stage()) !== 'unconfirmed'; i++) await sleep(150);
  await sleep(1500);
  const lost = await evalJ(`({ text: ${CTL}?.textContent || '', kept: document.querySelector('#note-redaction280-request')?.value || '', buttons: [...document.querySelectorAll('[data-note-redaction280] button')].map(b => b.textContent) })`);
  const applies = () => sent.slice(beforeApply).filter(b => b.includes('"apply"'));
  let keptBody = null; try { keptBody = JSON.stringify(JSON.parse(lost.kept).body); } catch {}
  check('Ledger: a lost apply reply is shown as not confirmed with the exact request on screen, only a status read, and is not resent', (await stage()) === 'unconfirmed' && applies().length === 1 && keptBody === applies()[0] && JSON.stringify(lost.buttons) === JSON.stringify(['Read the stored status']) && !lost.text.includes(NOTE), { lost, applies: applies() });
  const statusAfterLoss = await api('owner', 'POST', NR_PATH, { action: 'status' });
  check('Ledger: the dropped request changed nothing on the server', statusAfterLoss.status === 200 && statusAfterLoss.json?.state === 'not_recorded' && statusAfterLoss.json?.remainingCoveredNotes === 9, statusAfterLoss);
  mode = { kind: 'real' };
  await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent === 'Read the stored status')?.click(); true`);
  for (let i = 0; i < 60 && !(await evalJ(`!!document.querySelector('[data-note-redaction280-status="not-recorded"]')`)); i++) await sleep(150);
  // Round 2 (12 Nov): inside the window the unconfirmed heading and the exact request stay, with the counts under them.
  const pending = await evalJ(`({ head: ${CTL}?.querySelector('h3')?.textContent, focus: document.activeElement === ${CTL}?.querySelector('h3'), kept: document.querySelector('#note-redaction280-request')?.value || '', counts: document.querySelector('[data-note-redaction280-status="not-recorded"]')?.textContent || '', buttons: [...document.querySelectorAll('[data-note-redaction280] button')].map(b => b.textContent).join('|') })`);
  check('Ledger: reading the status after the loss keeps "Outcome not confirmed" and the exact request, shows the counts under them (nothing recorded, 9 notes) and offers no new count while the request could still land', (await stage()) === 'unconfirmed' && pending.head === 'Outcome not confirmed' && pending.focus && pending.kept === lost.kept && pending.counts.includes('no cleanup recorded') && pending.counts.includes('Notes still present on covered receipts: 9') && pending.buttons === 'Read the stored status', pending);
  const pendingLayout = [];
  for (const w of WIDTHS) { await viewport(cdp, w, 900); await sleep(250); pendingLayout.push({ w, ...(await measure('[data-note-redaction280]')) }); if (w === 320) await screenshot(cdp, path.join(OUT, 'ledger-pending-320.png'), true); }
  await viewport(cdp, 1280, 900);
  // The text label of the read-only request box is not a control of its own (the box is the target), so it is not sized.
  const controlsOnly = x => x.small.filter(s => !(s.t === 'LABEL' && s.text.startsWith('The request sent at')));
  check('Ledger: the pending state with its counts has no overflow and 44 px controls at all six widths', pendingLayout.every(x => x.present && x.docOverflowPx <= 0 && x.outside.length === 0 && controlsOnly(x).length === 0), pendingLayout.map(x => ({ w: x.w, o: x.docOverflowPx, out: x.outside, small: controlsOnly(x) })));

  // A hung apply in a new tab session: the page gives up after its own 30 s and shows it as not confirmed.
  await evalJ(`sessionStorage.clear(); true`);
  await go('#/admin/donation-ledger', `${CTL}?.getAttribute('data-note-redaction280-state') === 'idle'`);
  await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent === 'Count the notes')?.click(); true`);
  for (let i = 0; i < 60 && (await stage()) !== 'confirm'; i++) await sleep(150);
  // Round 2 (12 Nov): Cancel from the keyboard moves focus to the start heading, and its copy says what the backups keep.
  const confirmCopy = await evalJ(`${CTL}?.textContent || ''`);
  const toCancel = await tabTo(`a => a.tagName === 'BUTTON' && a.textContent === 'Cancel'`, 8);
  if (toCancel.f) await press('Enter', 'Enter', 13);
  await sleep(300);
  const afterCancel = await evalJ(`({ state: ${CTL}?.getAttribute('data-note-redaction280-state'), focus: document.activeElement === ${CTL}?.querySelector('h3') ? document.activeElement.textContent : document.activeElement?.tagName + ':' + (document.activeElement?.textContent || '').slice(0, 30), ring: getComputedStyle(document.activeElement).outlineStyle })`);
  check('Ledger keyboard: Cancel moves focus to the "Start with a count" heading; the confirmation says the site database keeps no copy and earlier backups and Watcher files are not changed', !!toCancel.f && afterCancel.state === 'idle' && afterCancel.focus === 'Start with a count' && confirmCopy.includes('The site’s database keeps no copy of the notes.') && confirmCopy.includes('Earlier backups and the officers’ Watcher files are not changed by this step.') && !confirmCopy.includes('The site keeps no copy'), { afterCancel, trail: toCancel.trail });
  await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent === 'Count the notes')?.click(); true`);
  for (let i = 0; i < 60 && (await stage()) !== 'confirm'; i++) await sleep(150);
  mode = { kind: 'hang-apply' };
  const beforeHang = sent.length;
  await evalJ(`(() => { const t = document.querySelector('#note-redaction280-understood'); t?.click(); [...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent.startsWith('Blank'))?.click(); return true; })()`);
  const hangStart = Date.now();
  for (let i = 0; i < 300 && (await stage()) !== 'unconfirmed'; i++) await sleep(200);
  const hangMs = Date.now() - hangStart, hang = await evalJ(`${CTL}?.textContent || ''`);
  check('Ledger: an apply with no answer is shown as not confirmed after about 30 s, with the request kept, sent once', (await stage()) === 'unconfirmed' && hang.includes('did not answer within 30 seconds') && hangMs >= 25000 && sent.slice(beforeHang).filter(b => b.includes('"apply"')).length === 1, { hangMs, hang: hang.slice(0, 300) });
  mode = { kind: 'real' };

  // The real apply in a fresh tab session, then a second apply and a new count.
  await evalJ(`sessionStorage.clear(); true`);
  await go('#/admin/donation-ledger', `${CTL}?.getAttribute('data-note-redaction280-state') === 'idle'`);
  await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent === 'Count the notes')?.click(); true`);
  for (let i = 0; i < 60 && (await stage()) !== 'confirm'; i++) await sleep(150);
  const beforeReal = sent.length;
  await evalJ(`(() => { const t = document.querySelector('#note-redaction280-understood'); t?.click(); [...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent.startsWith('Blank'))?.click(); return true; })()`);
  for (let i = 0; i < 100 && (await stage()) !== 'recorded'; i++) await sleep(150);
  const done = await evalJ(`${CTL}?.textContent || ''`);
  const realApply = sent.slice(beforeReal).find(b => b.includes('"apply"'));
  const statusDone = await api('owner', 'POST', NR_PATH, { action: 'status' });
  check('Ledger: the real apply is recorded and the result shows the stored count and time; the status agrees', (await stage()) === 'recorded' && done.includes('9 notes were blanked') && statusDone.json?.state === 'recorded' && statusDone.json?.completion?.blanked === 9 && statusDone.json?.remainingCoveredNotes === 0 && !done.includes(NOTE), { done: done.slice(0, 400), statusDone });
  const again = await fetch(ORIGIN + NR_PATH, { method: 'POST', headers: { Cookie: 'QA209_persona=owner', 'X-Olympus': '2', 'Content-Type': 'application/json', Origin: ORIGIN }, body: realApply });
  const againJson = await again.json().catch(() => null);
  await evalJ(`sessionStorage.clear(); true`);
  await go('#/admin/donation-ledger', `${CTL}?.getAttribute('data-note-redaction280-state') === 'idle'`);
  await evalJ(`[...document.querySelectorAll('[data-note-redaction280] button')].find(b => b.textContent === 'Count the notes')?.click(); true`);
  for (let i = 0; i < 60 && (await stage()) !== 'recorded'; i++) await sleep(150);
  const second = await evalJ(`({ text: ${CTL}?.textContent || '', buttons: [...document.querySelectorAll('[data-note-redaction280] button')].map(b => b.textContent) })`);
  check('Ledger: a second apply after success returns the stored status, and a new count shows it with no Blank button', again.status === 200 && againJson?.state === 'recorded' && againJson?.completion?.operationId === statusDone.json?.completion?.operationId && (await stage()) === 'recorded' && second.text.includes('9 notes were blanked') && !second.buttons.some(b => b.startsWith('Blank')), { again: againJson, second });
  const ledger = await api('owner', 'GET', '/api/admin/treasury/ledger?q=&cursor=');
  check('Ledger: all 12 receipt rows are listed before and after the cleanup, with the same donor, amount and time', ledgerBefore.json?.rows?.length === 12 && ledger.status === 200 && Array.isArray(ledger.json?.rows) && ledger.json.rows.length === 12 && JSON.stringify(ledger.json.rows.map(r => [r.id, r.copper, r.donor, r.at])) === JSON.stringify(ledgerBefore.json.rows.map(r => [r.id, r.copper, r.donor, r.at])), { before: ledgerBefore.json?.rows?.length, status: ledger.status, rows: ledger.json?.rows?.length, sample: ledger.json?.rows?.[0] });
  check('Ledger: no note text in any request the control sent, in the status replies, in its page session record or in its text', !sent.some(b => b.includes(NOTE)) && ![statusAfterLoss, statusDone, againJson].some(r => JSON.stringify(r).includes(NOTE)) && !(await evalJ(`JSON.stringify(Object.assign({}, sessionStorage)) + (document.querySelector('[data-note-redaction280]')?.textContent || '')`)).includes(NOTE));
  check('no script errors on the pages', state.exceptions.length === 0, state.exceptions);
} finally {
  await cdp.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ origin: ORIGIN, baseApp: process.env.UI280_BASE_APP || null, ok, n, results }, null, 1));
  console.log(`\n${ok}/${n} ui280 browser checks (News activity, receipt-note cleanup) passed`);
  process.exitCode = ok === n ? 0 : 1;
}

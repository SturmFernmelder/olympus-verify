// Evergreen 12 Nov 2026, lane ui280, Piece 1: browser checks of the v234 launch view on a local QA harness.
// Needs a running synthetic harness (in-memory DB, no provider) and headless Edge through the audit CDP helper.
// The real Worker page is used where it exists (held; since round 5 it is a v235 page, read by the v235 reader); the
// v234 ready, legacy and malformed pages, still read by the strict v234 reader alone, are made by the real
// producer (worker/src/launch-operations229.ts) and supplied through CDP Fetch interception. With
// UI280_BASE_APP=<file> the page script is replaced by that file (fail-before on the base commit).
// Usage: node tests/evergreen1112_ui280_browser.mjs   (env: UI280_ORIGIN, UI280_CDP_PORT, UI280_CDP_HELPER, UI280_OUT)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..');
const ORIGIN = process.env.UI280_ORIGIN || 'http://127.0.0.1:63720', PORT = Number(process.env.UI280_CDP_PORT || 63721);
const HELPER = process.env.UI280_CDP_HELPER || 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const OUT = process.env.UI280_OUT || path.join(process.env.TEMP || '.', 'ui280-browser');
const BASE_APP = process.env.UI280_BASE_APP ? fs.readFileSync(process.env.UI280_BASE_APP) : null;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw Error('ui280 browser checks run against a local harness only');
const { launch, instrument, viewport, screenshot, key, sleep } = await import(pathToFileURL(HELPER).href);
const { loadPureSource218 } = require('./helpers/pure_source218.cjs');
const ranks = loadPureSource218(root, 'native-rank-schemes'), ops = loadPureSource218(root, 'launch-operations229');
const NAMES = [...ranks.DIRECTIVE_RANK_NAMES];

let ok = 0, n = 0;
const results = [];
const check = (name, cond, detail) => { n++; if (cond) ok++; results.push({ name, pass: !!cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '\n     ' + JSON.stringify(detail).slice(0, 1200))); };
const at = () => Math.floor(Date.now() / 1000);
const R = (name, guid, slot, verification = 'verified') => ({ name, guid, currentSlot: slot, rank: NAMES[slot], verification, level: 40, lastOnlineSeconds: 3600 });
const rows = [R('Synthetic Leader', 'Player-1-0001', 0), R('Synthetic Far Knight', 'Player-1-0002', 9), R('Synthetic Near Knight', 'Player-1-0003', 6), R('Synthetic Initiate', 'Player-1-0004', 9), R('Synthetic Alt', 'Player-1-0005', 8), R('Synthetic Newcomer', 'Player-1-0006', 9, 'unverified')];
const knights = new Map([['Player-1-0002', 'knight'], ['Player-1-0003', 'knight'], ['Player-1-0004', 'non-knight'], ['Player-1-0005', 'non-knight']]);
const ready = () => { const t = at(), d = JSON.parse(JSON.stringify(ops.projectLaunchOperations229({ snapshotId: 7, snapshotAt: t, memberCount: rows.length, guild: 'OLYMPUS PRIME', realm: 'Fixture Realm', scopeHash: 'a'.repeat(16), nativeRankTable: { version: 1, names: [...NAMES] } }, rows, knights, t, t + 60))); d.scan = { id: 'b'.repeat(32), startedAt: t, expiresAt: t + 600 }; d.pageCursor = 'synthetic-page0.' + '0'.repeat(64); d.invites = [invite(t, 'native-who-unit-v233', 7, 'Synthetic Knight'), invite(t, 'native-who-whisper-v242', 8, 'Synthetic Whisperer')]; return d; };
// Round 3 (13 Nov 2026): one invite row per evidence source the backend projects (officer-invites233.ts:24,191).
function invite(t, source, queueId, name) { return { queueId, proofId: String(queueId % 10).repeat(32), name, guid: 'Player-1-00' + queueId + '0', fullName: name, scopeHash: 'a'.repeat(16), observedAt: t, expiresAt: t + 60, reason: 'knight-unguilded', source }; }
const legacy = () => { const d = ready(); d.protocol = 'officer-operations-v233'; delete d.rankProfile; delete d.rankSchemeDigest; delete d.rankNames; for (const r of d.promotions) r.targetSlot = r.reason === 'knight-veteran' ? 6 : 8; return d; };

fs.mkdirSync(OUT, { recursive: true });
const cdp = await launch({ port: PORT, profile: path.join(OUT, 'profile') });
const state = await instrument(cdp);
let mode = { kind: 'real' }, launchReads = 0;
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/admin/launch-operations*', requestStage: 'Request' }, ...(BASE_APP ? [{ urlPattern: '*/static/app.js*', requestStage: 'Request' }] : [])] });
cdp.on('Fetch.requestPaused', async p => {
  try {
    if (/\/static\/app\.js/.test(p.request.url)) return await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: BASE_APP.toString('base64') });
    launchReads++;
    if (mode.kind === 'real') return await cdp.send('Fetch.continueRequest', { requestId: p.requestId });
    if (mode.kind === 'lost') return await cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionClosed' });
    const body = Buffer.from(JSON.stringify(mode.make())).toString('base64');
    await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'private, no-store' }], body });
  } catch (e) { console.log('intercept error', e.message); }
});
const go = async (hash, settle) => {
  await cdp.eval(`location.hash = '#/'; true`); await sleep(150);
  launchReads = 0;
  await cdp.eval(`location.hash = ${JSON.stringify(hash)}; true`);
  for (let i = 0; i < 100; i++) { await sleep(150); if (await cdp.eval(settle)) return true; }
  return false;
};
const SETTLED = `!!document.querySelector('[data-launch234-held],[data-launch-promotion229],#launch-motd229') || document.body.textContent.includes('could not be confirmed')`;
try {
  await viewport(cdp, 1280, 900);
  await cdp.send('Page.navigate', { url: ORIGIN + '/__qa/admin?to=' + encodeURIComponent('/#/admin') });
  await sleep(2500);

  // 1. The harness's real Worker page: held with null rank fields. Round 5 build (13 Nov 2026): the real admin route
  // answers only officer-operations-v235 (site-launch229.ts handleDiscoveryOperations235), read by the v235 reader; the
  // page lists each hold once (the held reply repeats native-snapshot-unavailable when that is its reason).
  mode = { kind: 'real' };
  await go('#/admin/launch-operations', SETTLED);
  const real = await cdp.eval(`({holds:[...document.querySelectorAll('[data-launch234-hold]')].map(li=>[li.dataset.launch234Hold,li.textContent]),ranks:document.querySelector('[data-launch234-ranks]')?.dataset.launch234Ranks||null,motd:!!document.querySelector('#launch-motd229'),promotions:document.querySelectorAll('[data-launch-promotion229]').length,module:!!document.querySelector('script[src="/static/launch-operations234.js"]'),module235:!!document.querySelector('script[src="/static/launch-discovery235.js"]'),refused:document.querySelector('[data-launch234-held]')?.dataset.launch234Held||null})`);
  const realApi = await (await fetch(ORIGIN + '/api/admin/launch-operations', { headers: { Cookie: 'QA209_persona=admin', 'X-Olympus': '1' } })).json();
  check('the harness Worker page (v235, held) is read by the v235 reader and shows each of its holds once in plain words and no promotion', real.motd && real.ranks === 'unconfirmed' && real.promotions === 0 && real.module && real.module235 && real.refused === null && realApi.protocol === 'officer-operations-v235' && realApi.status === 'held' && JSON.stringify(real.holds.map(x => x[0])) === JSON.stringify([...new Set(realApi.heldReasons)]) && real.holds.every(x => !x[1].includes(x[0]) && !x[1].startsWith('Held for a reason')), { real, heldReasons: realApi.heldReasons });

  // 2. A current page at six widths.
  mode = { kind: 'page', make: ready };
  const widths = [1440, 1280, 768, 390, 375, 320], layout = [];
  for (const w of widths) {
    await viewport(cdp, w, 900);
    await go('#/admin/launch-operations', `!!document.querySelector('[data-launch-promotion229]')`);
    await sleep(300);
    const m = await cdp.eval(`(() => {
      const view = (document.querySelector('[data-launch234]') || document.createElement('div')), vw = document.documentElement.clientWidth;
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const controls = [...view.querySelectorAll('button, summary, a[href], textarea, [tabindex]')].filter(visible);
      const small = controls.filter(el => el.tagName !== 'TEXTAREA').map(el => { const r = el.getBoundingClientRect(); return { t: el.tagName, text: el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 44 || x.w < 44);
      const wraps = [...view.querySelectorAll('.table-wrap')].map(el => ({ cls: el.className, inner: el.scrollWidth - el.clientWidth, invites: !!el.querySelector('[data-launch-invite233]') }));
      const invites = [...view.querySelectorAll('[data-launch-invite233]')].map(tr => ({ source: tr.dataset.launch234InviteSource, cells: [...tr.children].map(c => c.innerText.replace(/\\s+/g, ' ').trim()) }));
      const outside = [...view.querySelectorAll('*')].filter(el => !el.closest('.table-wrap') && visible(el) && el.getBoundingClientRect().right > vw + 1).map(el => el.tagName + '.' + el.className).slice(0, 8);
      return { docOverflowPx: document.documentElement.scrollWidth - window.innerWidth, small, wraps, invites, outside, headings: [...document.querySelectorAll('main h1, main h2, main h3')].map(h => h.tagName + ':' + h.textContent.trim()).filter(t => !/^H[23]:(Admin section|Applications & Roster)/.test(t)) };
    })()`);
    layout.push({ width: w, ...m });
    if (w === 390 || w === 1440 || w === 320) await screenshot(cdp, path.join(OUT, `ready-${w}.png`), true);
  }
  check('no horizontal page overflow and nothing outside the viewport at 1440, 1280, 768, 390, 375 and 320 px', layout.every(x => x.docOverflowPx <= 0 && x.outside.length === 0), layout.map(x => ({ w: x.width, overflow: x.docOverflowPx, outside: x.outside })));
  check('the rank table and every promotion step stay visible without sideways scrolling inside the tables at all six widths', layout.every(x => x.wraps.filter(w => /launch234-(promotions|ranks)/.test(w.cls)).every(w => w.inner <= 0)), layout.map(x => ({ w: x.width, wraps: x.wraps })));
  const witness = { 'native-who-unit-v233': 'Seen in game by the officer, and a /who reply showed no guild', 'native-who-whisper-v242': 'Identified by their verification whisper, and a fresh /who reply showed no guild' };
  check('round 3: the invite queue shows the v233 and the v242 row, each with how it was seen in plain words, with no sideways scrolling inside its table at all six widths', layout.every(x => x.invites.length === 2 && x.invites.map(r => r.source).join('|') === 'native-who-unit-v233|native-who-whisper-v242' && x.invites.every(r => r.cells[1] === witness[r.source] && r.cells[3] === 'Recheck and invite in-game') && x.wraps.filter(w => w.invites).every(w => w.inner <= 0)), layout.map(x => ({ w: x.width, invites: x.invites, wraps: x.wraps.filter(w => w.invites) })));
  check('every control in the view is at least 44 px in both directions at all six widths', layout.every(x => x.small.length === 0), layout.map(x => ({ w: x.width, small: x.small })));
  // The admin section navigation above the view is another lane's (admin navigation and headings); check the view's own outline.
  // Round 5: CL2-099 (12 Nov 2026) keeps one H1 per view, the Admin heading; an admin tool's own H1 becomes an H2
  // (pageHeading218 in app.js), so the view title is now an H2 under "Admin". The order inside the view is unchanged.
  const heads = layout[1].headings.slice(layout[1].headings.indexOf('H2:Launch operations & MOTD'));
  check('the view headings run: one H1 (Admin), the view title as h2, then h2 per frame, then h3 inside the examined page', heads[0] === 'H2:Launch operations & MOTD' && heads.slice(1).every(h => /^H[23]:/.test(h)) && heads.indexOf('H3:Holds on this read') > heads.indexOf('H2:Discovery and current eligibility') && heads.includes('H2:Rank table in force') && heads.includes('H3:Knights to Veteran (slot 5)') && heads.includes('H3:Verified Initiates to Member (slot 7), by way of Alt') && JSON.stringify(layout[1].headings.filter(h => h.startsWith('H1:'))) === '["H1:Admin"]', layout[1].headings);

  // 3. Exact values against the page that was served.
  await viewport(cdp, 1280, 900);
  const served = ready();
  mode = { kind: 'page', make: () => served };
  await go('#/admin/launch-operations', `!!document.querySelector('[data-launch-promotion229]')`);
  const shown = await cdp.eval(`({
    ranks: [...document.querySelectorAll('[data-launch234-ranks="current"] tbody tr')].map(tr => [Number(tr.cells[0].textContent), tr.cells[1].textContent]),
    profile: document.querySelector('.launch234-source dd code')?.textContent, short: document.querySelector('[data-launch234-digest-short]')?.textContent, full: document.querySelector('[data-launch234-digest]')?.textContent,
    rows: [...document.querySelectorAll('[data-launch-promotion229]')].map(tr => ({ guid: tr.dataset.launchPromotion229, steps: Number(tr.dataset.launch234Steps), cells: [...tr.children].map(c => c.innerText.replace(/\\s+/g, ' ').trim()) }))
  })`);
  const expectRows = served.promotions.map(r => ({ guid: r.guid, steps: r.currentSlot - r.targetSlot, now: NAMES[r.currentSlot] + ' (slot ' + r.currentSlot + ')', target: r.targetName + ' (slot ' + r.targetSlot + ')' }));
  check('the rank table, profile and digest shown equal the served page exactly', JSON.stringify(shown.ranks) === JSON.stringify(served.rankNames.map((name, i) => [i, name])) && shown.profile === served.rankProfile && shown.full === served.rankSchemeDigest && shown.short === served.rankSchemeDigest.slice(0, 8) + '\u2026' + served.rankSchemeDigest.slice(-8), shown);
  check('each promotion row shows the served current rank, final target and step count', shown.rows.length === expectRows.length && expectRows.every((e, i) => shown.rows[i].guid === e.guid && shown.rows[i].steps === e.steps && shown.rows[i].cells[1] === e.now && shown.rows[i].cells[2] === e.target), { shown: shown.rows, expectRows });

  // 4. Keyboard: Tab reaches the digest disclosure with a visible focus ring, Enter opens it.
  await cdp.eval(`document.querySelector('main h1').setAttribute('tabindex','-1'); document.querySelector('main h1').focus(); true`);
  const path_ = [];
  let reached = null;
  for (let i = 0; i < 40 && !reached; i++) {
    await key(cdp, 'Tab', 'Tab', 9); await sleep(60);
    const f = await cdp.eval(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { tag: a.tagName, text: a.textContent.trim().slice(0, 40), outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow }; })()`);
    path_.push(f.tag + ':' + f.text);
    if (f.tag === 'SUMMARY') reached = f;
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(200);
  const opened = await cdp.eval(`(() => { const d = document.querySelector('.launch234-digest'), c = d && d.querySelector('[data-launch234-digest]'); if (!c) return { open: false, visible: false }; return { open: d.open, visible: c.getBoundingClientRect().height > 0 }; })()`);
  check('keyboard: Tab reaches the full-digest disclosure, its focus ring is visible, Enter opens it', !!reached && reached.outline !== 'none 0px' && !reached.outline.startsWith('none') && opened.open && opened.visible, { reached, opened, path: path_ });
  check('keyboard: Tab order reaches the page controls before the disclosure and no promotion control exists', ['Refresh first page', 'Scan entire roster', 'Copy MOTD'].every(t => path_.some(p => p.endsWith(':' + t))) && !path_.some(p => /Promote|Select|Invite/.test(p)), path_);

  // 5. Forced colours.
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(300);
  await cdp.eval(`document.querySelector('.launch234-digest > summary')?.focus(); true`);
  const fc = await cdp.eval(`(() => { const s = document.querySelector('.launch234-digest > summary'), cell = document.querySelector('[data-launch234-ranks="current"] td'); if (!s || !cell) return { active: matchMedia('(forced-colors: active)').matches, outline: 'none (view absent)', cellBorder: 'none', overflow: 0 }; const st = getComputedStyle(s), td = getComputedStyle(cell);
    return { active: matchMedia('(forced-colors: active)').matches, outline: st.outlineStyle + ' ' + st.outlineWidth, cellBorder: td.borderBottomStyle + ' ' + td.borderBottomWidth, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
  await screenshot(cdp, path.join(OUT, 'forced-colors-1280.png'), true);
  check('forced colours: the focus ring and table rules stay drawn', fc.active && !fc.outline.startsWith('none') && fc.cellBorder.startsWith('solid') && fc.overflow <= 0, fc);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  // 6. Held states.
  const heldCase = async (label, make, code) => {
    mode = { kind: 'page', make };
    await go('#/admin/launch-operations', SETTLED);
    const s = await cdp.eval(`({ code: document.querySelector('[data-launch234-held]')?.dataset.launch234Held || null, motd: !!document.querySelector('#launch-motd229'), rows: document.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229]').length, buttons: [...(document.querySelector('[data-launch234]') || document.createElement('div')).querySelectorAll('button')].map(b => b.textContent).sort(), status: document.querySelector('[data-launch234] [role=status]')?.textContent })`);
    check(label, s.code === code && !s.motd && s.rows === 0 && JSON.stringify(s.buttons) === JSON.stringify(['Load next 20 role checks', 'Refresh first page', 'Scan entire roster', 'Stop scan']) && launchReads === 1, s);
  };
  await heldCase('a legacy v233 page is held with a plain notice and no control that acts', legacy, 'legacy-protocol');
  await heldCase('a ready page with a null profile is held', () => Object.assign(ready(), { rankProfile: null }), 'malformed-rank-table');
  await heldCase('an unknown digest is held', () => Object.assign(ready(), { rankSchemeDigest: 'e'.repeat(64) }), 'unknown-digest');
  await heldCase('an unknown status is held', () => Object.assign(ready(), { status: 'paused' }), 'unknown-status');
  // Round 3: an invite row with a source the backend cannot emit refuses the whole page.
  mode = { kind: 'page', make: () => { const d = ready(); d.invites[1].source = 'native-who-unit-v242'; return d; } };
  await go('#/admin/launch-operations', SETTLED);
  const unknownSource = await cdp.eval(`({ text: document.querySelector('[data-launch234] [role=status]')?.textContent || '', motd: !!document.querySelector('#launch-motd229'), invites: document.querySelectorAll('[data-launch-invite233]').length, rows: document.querySelectorAll('[data-launch-promotion229]').length })`);
  check('round 3: a page with an invite row of an unknown source is refused as a whole and read once', /could not be confirmed/.test(unknownSource.text) && !unknownSource.motd && unknownSource.invites === 0 && unknownSource.rows === 0 && launchReads === 1, { unknownSource, launchReads });
  await viewport(cdp, 320, 900); await heldCase('the held notice also fits at 320 px', legacy, 'legacy-protocol');
  const heldFit = await cdp.eval(`document.documentElement.scrollWidth - innerWidth`);
  check('the held notice has no horizontal overflow at 320 px', heldFit <= 0, heldFit);
  await viewport(cdp, 1280, 900);

  // 7. A lost reply is unconfirmed and never resent.
  mode = { kind: 'lost' };
  await go('#/admin/launch-operations', `document.body.textContent.includes('could not be confirmed')`);
  await sleep(2000);
  const lost = await cdp.eval(`({ text: document.querySelector('[data-launch234] [role=status]')?.textContent, rows: document.querySelectorAll('[data-launch-promotion229]').length })`);
  check('a lost reply is shown as unconfirmed with a way to read again, and is not resent', /could not be confirmed/.test(lost.text || '') && lost.rows === 0 && launchReads === 1, { lost, launchReads });

  check('no script errors on the page', state.exceptions.length === 0, state.exceptions);
} finally {
  await cdp.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ origin: ORIGIN, baseApp: process.env.UI280_BASE_APP || null, ok, n, results }, null, 1));
  console.log(`\n${ok}/${n} ui280 browser checks passed`);
  process.exitCode = ok === n ? 0 : 1;
}

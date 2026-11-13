// Evergreen 12 Nov 2026, lane ui280, round 5 (13 Nov 2026): browser checks of the v235 discovery reader on a local QA
// harness through headless Edge (the audit CDP helper). The harness's own Worker has no v235 producer yet, so Codex's
// contract pages (evergreen1112_ui280_discovery235_pages.json) are served through CDP Fetch interception, with every
// clock field moved by the same amount so the captured page is current now (shape unchanged). With
// UI280_BASE_APP=<file> the page script is replaced by that file (fail-before on the base commit).
// Usage: node tests/evergreen1112_ui280_browser235.mjs   (env: UI280_ORIGIN, UI280_CDP_PORT, UI280_CDP_HELPER, UI280_OUT)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.env.UI280_ORIGIN || 'http://127.0.0.1:63687', PORT = Number(process.env.UI280_CDP_PORT || 63688);
const HELPER = process.env.UI280_CDP_HELPER || 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const OUT = process.env.UI280_OUT || path.join(process.env.TEMP || '.', 'ui280-browser235');
const BASE_APP = process.env.UI280_BASE_APP ? fs.readFileSync(process.env.UI280_BASE_APP) : null;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw Error('ui280 browser checks run against a local harness only');
const { launch, instrument, viewport, screenshot, key, sleep } = await import(pathToFileURL(HELPER).href);
const P = JSON.parse(fs.readFileSync(path.join(here, 'evergreen1112_ui280_discovery235_pages.json'), 'utf8')).pages;

let ok = 0, n = 0;
const results = [];
const check = (name, cond, detail) => { n++; if (cond) ok++; results.push({ name, pass: !!cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '\n     ' + JSON.stringify(detail).slice(0, 1500))); };
/** A contract page with all of its clocks moved to now; nothing else changes. */
function current(name) {
  const d = JSON.parse(JSON.stringify(P[name])), shift = Math.floor(Date.now() / 1000) - d.fetchedAt;
  for (const k of ['fetchedAt', 'expiresAt', 'snapshotAt']) d[k] += shift;
  d.scan.startedAt += shift; d.scan.expiresAt += shift;
  for (const r of d.invites) { r.observedAt += shift; r.expiresAt += shift; }
  return d;
}

fs.mkdirSync(OUT, { recursive: true });
const cdp = await launch({ port: PORT, profile: path.join(OUT, 'profile') });
const state = await instrument(cdp);
let serve = () => current('rankheld'), reads = [];
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/admin/launch-operations*', requestStage: 'Request' }, ...(BASE_APP ? [{ urlPattern: '*/static/app.js*', requestStage: 'Request' }] : [])] });
cdp.on('Fetch.requestPaused', async p => {
  try {
    if (/\/static\/app\.js/.test(p.request.url)) return await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }], body: BASE_APP.toString('base64') });
    reads.push(p.request.url);
    await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'private, no-store' }], body: Buffer.from(JSON.stringify(serve())).toString('base64') });
  } catch (e) { console.log('intercept error', e.message); }
});
const SETTLED = `!!document.querySelector('[data-launch234-held],#launch-motd229') || document.body.textContent.includes('could not be confirmed')`;
// One page per visit: a recheck of the same scan gets the same snapshot and scan clocks, as from the server.
const go = async (make) => {
  const page = make(); serve = () => page;
  await cdp.eval(`location.hash = '#/'; true`); await sleep(150);
  reads = [];
  await cdp.eval(`location.hash = '#/admin/launch-operations'; true`);
  for (let i = 0; i < 100; i++) { await sleep(150); if (await cdp.eval(SETTLED)) break; }
  await sleep(300);
};
// The measured view: page overflow, anything outside the viewport, every control's size, and the rank-held facts.
const MEASURE = `(() => {
  const view = document.querySelector('[data-launch234]') || document.createElement('div'), vw = document.documentElement.clientWidth;
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const controls = [...view.querySelectorAll('button, summary, a[href], [tabindex]')].filter(visible);
  const small = controls.map(el => { const r = el.getBoundingClientRect(); return { t: el.tagName, text: el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.h < 44 || x.w < 44);
  const outside = [...view.querySelectorAll('*')].filter(el => !el.closest('.table-wrap') && visible(el) && el.getBoundingClientRect().right > vw + 1).map(el => el.tagName + '.' + el.className).slice(0, 8);
  const wraps = [...view.querySelectorAll('.table-wrap')].map(el => ({ cls: el.className, inner: el.scrollWidth - el.clientWidth }));
  const held = document.querySelector('[data-launch235-rank-held]');
  const button = t => [...view.querySelectorAll('button')].find(b => b.textContent === t);
  return { docOverflowPx: document.documentElement.scrollWidth - window.innerWidth, small, outside, wraps,
    rankHeld: held ? { code: held.dataset.launch235RankHeld, text: held.textContent, shown: visible(held) } : null,
    invites: [...view.querySelectorAll('[data-launch-invite233]')].map(tr => ({ source: tr.dataset.launch234InviteSource, cells: [...tr.children].map(c => c.innerText.replace(/\\s+/g, ' ').trim()), shown: visible(tr) })),
    enabled: ['Refresh first page', 'Scan entire roster', 'Copy MOTD', 'Copy expanded bulletin', 'Recheck this page'].map(t => [t, !!button(t) && !button(t).disabled && visible(button(t))]),
    // Item 6 (13 Nov 2026): the words of each examined page and of the continuation.
    pageWords: [...view.querySelectorAll('h2')].filter(h => /^Examined page /.test(h.textContent)).map(h => ({ badge: h.parentNode.querySelector('.badge')?.textContent || '', sentence: h.closest('section').querySelector('p')?.textContent || '' })),
    next: [...view.querySelectorAll('button')].filter(b => /^Load next 20 /.test(b.textContent)).map(b => b.textContent),
    promotions: view.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229]').length, refused: !!view.querySelector('[data-launch234-held]') || view.textContent.includes('could not be confirmed') };
})()`;
const SENTENCE = 'Ranks are held because the latest roster export does not show the ten ranks of the 12 November ladder, or a member’s rank does not match its slot.';
try {
  await viewport(cdp, 1280, 900);
  await cdp.send('Page.navigate', { url: ORIGIN + '/__qa/admin?to=' + encodeURIComponent('/#/admin') });
  await sleep(2500);

  // 1. A rank-held page at six widths.
  const widths = [1440, 1280, 768, 390, 375, 320], layout = [];
  for (const w of widths) {
    await viewport(cdp, w, 900);
    await go(() => current('rankheld'));
    layout.push({ width: w, ...(await cdp.eval(MEASURE)), reads: reads.length });
    if (w === 1440 || w === 390 || w === 320) await screenshot(cdp, path.join(OUT, `rankheld-${w}.png`), true);
  }
  check('a rank-held v235 page is shown at all six widths after one read, with its reason in one visible sentence and no promotion', layout.every(x => !x.refused && x.reads === 1 && x.rankHeld && x.rankHeld.code === 'native-rank-scheme-unconfirmed' && x.rankHeld.text === SENTENCE && x.rankHeld.shown && x.promotions === 0), layout.map(x => ({ w: x.width, refused: x.refused, reads: x.reads, rankHeld: x.rankHeld })));
  check('its v242 invite is shown as current and the read and copy controls are enabled at all six widths', layout.every(x => x.invites.length === 1 && x.invites[0].source === 'native-who-whisper-v242' && x.invites[0].shown && x.invites[0].cells[3] === 'Recheck and invite in-game' && x.enabled.every(([, on]) => on)), layout.map(x => ({ w: x.width, invites: x.invites, enabled: x.enabled })));
  check('no horizontal page overflow, nothing outside the viewport and no sideways scrolling inside its tables at 1440, 1280, 768, 390, 375 and 320 px', layout.every(x => x.docOverflowPx <= 0 && x.outside.length === 0 && x.wraps.every(t => t.inner <= 0)), layout.map(x => ({ w: x.width, overflow: x.docOverflowPx, outside: x.outside, wraps: x.wraps })));
  check('every control in the view is at least 44 by 44 px at all six widths', layout.every(x => x.small.length === 0), layout.map(x => ({ w: x.width, small: x.small })));
  // Item 6 (13 Nov 2026, Codex's reading of the reader): a rank-held page names its roster page, not role evidence.
  check('the rank-held page speaks of its roster page at all six widths: badge "Roster page current", "Roster members 1 to 2 of 2, read from the roster export. This page is current until …", continuation "Load next 20 roster members"', layout.every(x => x.pageWords.length === 1 && x.pageWords[0].badge === 'Roster page current' && /^Roster members 1 to 2 of 2, read from the roster export[.] This page is current until [^.]+[.]$/.test(x.pageWords[0].sentence) && JSON.stringify(x.next) === '["Load next 20 roster members"]'), layout.map(x => ({ w: x.width, pageWords: x.pageWords, next: x.next })));

  // 2. Keyboard at 390 px: Tab reaches the read and copy controls with a visible focus ring; Enter on Recheck reads that page.
  await viewport(cdp, 390, 900);
  await go(() => current('rankheld'));
  await cdp.eval(`document.querySelector('main h1').setAttribute('tabindex','-1'); document.querySelector('main h1').focus(); true`);
  const want = ['Refresh first page', 'Scan entire roster', 'Copy MOTD', 'Copy expanded bulletin', 'Recheck this page'], reached = {};
  for (let i = 0; i < 40 && Object.keys(reached).length < want.length; i++) {
    await key(cdp, 'Tab', 'Tab', 9); await sleep(60);
    const f = await cdp.eval(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { tag: a.tagName, text: a.textContent.trim().slice(0, 40), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none' }; })()`);
    if (f.tag === 'BUTTON' && want.includes(f.text) && !reached[f.text]) reached[f.text] = f.ring;
    if (f.text === 'Recheck this page') break;
  }
  const before = reads.length;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  for (let i = 0; i < 40 && reads.length === before; i++) await sleep(100);
  await sleep(400);
  const sent = reads[before] ? new URL(reads[before]).searchParams.get('cursor') : null, after = await cdp.eval(MEASURE);
  check('keyboard: Tab reaches Refresh, Scan, both copy buttons and Recheck this page, each with a visible focus ring', want.every(t => reached[t] === true), reached);
  check('keyboard: Enter on Recheck this page sends that page\'s own link once and the rank-held page stays shown', reads.length === before + 1 && sent === P.rankheld.pageCursor && !after.refused && !!after.rankHeld, { reads: reads.length - before, same: sent === P.rankheld.pageCursor, refused: after.refused });

  // 3. The other reason, and a qualified v235 page with Codex's 5,477-character page link, at 390 and 320 px.
  const more = [];
  for (const w of [390, 320]) {
    await viewport(cdp, w, 900);
    await go(() => current('policyoff')); const policy = await cdp.eval(MEASURE);
    await go(() => current('late429')); const late = await cdp.eval(MEASURE);
    more.push({ w, policy: { code: policy.rankHeld?.code, overflow: policy.docOverflowPx, small: policy.small.length, refused: policy.refused }, late: { promotions: late.promotions, overflow: late.docOverflowPx, outside: late.outside.length, small: late.small, refused: late.refused } });
    if (w === 320) await screenshot(cdp, path.join(OUT, 'late429-320.png'), true);
  }
  check('the policy reason page and the qualified late-429 page (19 promotions) are shown at 390 and 320 px with no overflow and no control under 44 px', more.every(x => x.policy.code === 'directive-rank-policy-held' && !x.policy.refused && x.policy.overflow <= 0 && x.policy.small === 0 && !x.late.refused && x.late.promotions === 19 && x.late.overflow <= 0 && x.late.outside === 0 && x.late.small.length === 0), more);

  // 4. A malformed next-page link holds the page and is never followed.
  await viewport(cdp, 1280, 900);
  await go(() => Object.assign(current('held1000-first'), { nextCursor: 'A+' + P['held1000-first'].nextCursor.slice(2) }));
  const bad = await cdp.eval(`({ text: document.querySelector('[data-launch234] [role=status]')?.textContent || '', motd: !!document.querySelector('#launch-motd229'), more: [...document.querySelectorAll('[data-launch234] button')].find(b => b.textContent === 'Load next 20 role checks')?.hidden })`);
  check('a next-page link outside the alphabet holds the page as unconfirmed and offers no Load next', /could not be confirmed/.test(bad.text) && !bad.motd && bad.more === true && reads.length === 1, { bad, reads: reads.length });

  // 5. Review of 13 Nov 2026 (finding 1): a held later page (held229's shape, as the real route sends it when the read
  // window runs out) ends the scan; the notice and the held page hold at six widths, read twice, nothing refused.
  const heldNow = () => Object.assign(current('rankheld'), { status: 'held', snapshotId: null, snapshotAt: null, memberCount: null, guild: null, canonicalGuild: null, realm: null, scopeHash: null, held: [], invites: [], pageCursor: null, nextCursor: null,
    scan: { id: null, startedAt: null, expiresAt: null }, entitlements: { offset: 0, pageSize: 20, scanned: 0, total: 0, unscanned: 0, retryAfterSeconds: null }, heldReasons: ['native-unguilded-proof-required', 'native-snapshot-unavailable', 'native-rank-scheme-unconfirmed', 'launch-read-window-exhausted'] });
  const ended = [];
  for (const w of widths) {
    await viewport(cdp, w, 900);
    const first = current('held1000-first'), held = heldNow();
    await go(() => first); serve = () => reads.length > 1 ? held : first;
    const before5 = await cdp.eval(MEASURE);
    await cdp.eval(`[...document.querySelectorAll('[data-launch234] button')].find(b => b.textContent === 'Load next 20 roster members')?.click(); true`);
    for (let i = 0; i < 40 && !(await cdp.eval(`!!document.querySelector('[data-launch235-scan-ended]') || !!document.querySelector('[data-launch234-held]')`)); i++) await sleep(100);
    await sleep(300);
    const m = await cdp.eval(MEASURE), notice = await cdp.eval(`(() => { const el = document.querySelector('[data-launch235-scan-ended]'), r = el && el.getBoundingClientRect(); return { shown: !!el && r.width > 0 && r.height > 0, status: document.querySelector('[data-launch234] [role=status]')?.textContent || '', pages: [...document.querySelectorAll('[data-launch234] h2')].filter(h => /^Examined page /.test(h.textContent)).length }; })()`);
    ended.push({ width: w, firstWords: before5.pageWords, firstNext: before5.next, firstSmall: before5.small, reads: reads.length, notice, refused: m.refused, overflow: m.docOverflowPx, outside: m.outside, small: m.small, wraps: m.wraps });
    if (w === 390 || w === 320) await screenshot(cdp, path.join(OUT, `scan-ended-${w}.png`), true);
  }
  check('the rank-held 1,000-member first page shows "Load next 20 roster members" (at least 44 px) and "Roster members 1 to 20 of 1000" at all six widths', ended.every(x => JSON.stringify(x.firstNext) === '["Load next 20 roster members"]' && x.firstSmall.length === 0 && x.firstWords.length === 1 && x.firstWords[0].badge === 'Roster page current' && x.firstWords[0].sentence.startsWith('Roster members 1 to 20 of 1000, read from the roster export. This page is current until ')), ended.map(x => ({ w: x.width, next: x.firstNext, words: x.firstWords, small: x.firstSmall })));
  check('a held later page ends the scan: the notice is shown above it at all six widths after two reads, with no page of the scan left, no overflow and no control under 44 px', ended.every(x => x.reads === 2 && x.notice.shown && x.notice.pages === 0 && /scan stopped/.test(x.notice.status) && !x.refused && x.overflow <= 0 && x.outside.length === 0 && x.small.length === 0 && x.wraps.every(t => t.inner <= 0)), ended);

  check('no script errors on the page', state.exceptions.length === 0, state.exceptions);
} finally {
  await cdp.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ origin: ORIGIN, baseApp: process.env.UI280_BASE_APP || null, ok, n, results }, null, 1));
  console.log(`\n${ok}/${n} ui280 v235 browser checks passed`);
  process.exitCode = ok === n ? 0 : 1;
}

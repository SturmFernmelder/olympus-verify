// Evergreen 12 Nov 2026, lane ui280, round 2 item 1 (CL2-258): the shared member picker in a real browser.
// Codex's 59fd954 withholds site-profile presence from an ordinary member's search and marks an administrator's
// reply with siteProfilesVisible: true. The page shows the "Only people with a current site profile" filter and the
// "site profile" badge only on such a reply. Checked as admin, officer, member and applicant on the harness-ui280
// copy (in-memory DB, synthetic personas and synthetic Discord search, no provider), headless Edge through the
// audit CDP helper. With UI280_BASE_APP=<file> the page script is replaced by that file (fail-before).
// Usage: node tests/evergreen1112_ui280_browser258.mjs   (env: UI280_ORIGIN, UI280_CDP_PORT, UI280_CDP_HELPER, UI280_OUT)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ORIGIN = process.env.UI280_ORIGIN || 'http://127.0.0.1:63720', PORT = Number(process.env.UI280_CDP_PORT || 63721);
const HELPER = process.env.UI280_CDP_HELPER || 'C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs';
const OUT = process.env.UI280_OUT || path.join(process.env.TEMP || '.', 'ui280-browser258');
const BASE_APP = process.env.UI280_BASE_APP ? fs.readFileSync(process.env.UI280_BASE_APP) : null;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(ORIGIN)) throw Error('ui280 browser checks run against a local harness only');
const { launch, instrument, viewport, screenshot, key, sleep } = await import(pathToFileURL(HELPER).href);
const FILTER = 'Only people with a current site profile', WIDTHS = [1440, 1280, 768, 390, 375, 320], Q = 'QA';

let ok = 0, n = 0;
const results = [];
const check = (name, cond, detail) => { n++; if (cond) ok++; results.push({ name, pass: !!cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : '\n     ' + JSON.stringify(detail).slice(0, 1400))); };
const search = async (persona, purpose) => { const r = await fetch(ORIGIN + '/api/search?' + (purpose ? 'purpose=' + purpose + '&' : '') + 'q=' + Q, { headers: { Cookie: 'QA209_persona=' + persona, 'X-Olympus': '2' } }); return { status: r.status, json: await r.json().catch(() => null) }; };

fs.mkdirSync(OUT, { recursive: true });
const cdp = await launch({ port: PORT, profile: path.join(OUT, 'profile') });
const state = await instrument(cdp);
let plainReply = null; // set later: the one search reply served without siteProfilesVisible
const fulfil = (p, type, body) => cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') });
cdp.on('Fetch.requestPaused', async p => {
  try {
    if (BASE_APP && /\/static\/app\.js/.test(p.request.url)) return await fulfil(p, 'text/javascript; charset=utf-8', BASE_APP);
    if (plainReply && /\/api\/search\?/.test(p.request.url)) return await fulfil(p, 'application/json; charset=utf-8', JSON.stringify(plainReply));
    return await cdp.send('Fetch.continueRequest', { requestId: p.requestId });
  } catch (e) { console.log('intercept error', e.message); }
});
const intercept = searchToo => cdp.send('Fetch.enable', { patterns: [...(BASE_APP ? [{ urlPattern: '*/static/app.js*', requestStage: 'Request' }] : []), ...(searchToo ? [{ urlPattern: '*/api/search?purpose=appointment&q=QA2*', requestStage: 'Request' }] : [])] });
if (BASE_APP) await intercept(false);
const evalJ = js => cdp.eval(js);
const signIn = async persona => { await cdp.send('Page.navigate', { url: ORIGIN + '/__qa/' + persona + '?to=' + encodeURIComponent('/#/') }); await sleep(2500); };
const go = async (hash, settle) => {
  await evalJ(`location.hash = '#/'; true`); await sleep(200);
  await evalJ(`location.hash = ${JSON.stringify(hash)}; true`);
  for (let i = 0; i < 120; i++) { await sleep(150); if (await evalJ(settle)) return true; }
  return false;
};
// The picker whose screen-reader label matches; the helper marks it so later expressions can find it again.
const mark = labelJs => evalJ(`(() => { document.querySelectorAll('[data-qa258]').forEach(x => x.removeAttribute('data-qa258')); const lab = [...document.querySelectorAll('.picker label.sr')].find(l => (${labelJs})(l.textContent)); const input = lab && document.getElementById(lab.getAttribute('for')); if (!input) return false; for (let d = input.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; input.closest('.picker').setAttribute('data-qa258', ''); input.scrollIntoView({ block: 'center' }); return true; })()`);
const P = `document.querySelector('[data-qa258]')`;
const typeQuery = async q => {
  await evalJ(`(() => { const i = ${P}.querySelector('input[role="combobox"]'); i.focus(); i.value = ''; return true; })()`);
  await cdp.send('Input.insertText', { text: q });
  for (let i = 0; i < 60; i++) { await sleep(150); if (await evalJ(`(() => { const p = ${P}; return !!p && !p.querySelector('.list').hidden && !p.textContent.includes('Searching…') && p.querySelectorAll('[role="option"]').length > 0; })()`)) break; }
  await sleep(200);
};
const snapshot = () => evalJ(`(() => { const p = ${P}, tools = p.querySelector('.list-tools'), box = tools.querySelector('input'); const opts = [...p.querySelectorAll('[role="option"]')];
  return { open: !p.querySelector('.list').hidden, toolsShown: !tools.hidden && tools.getBoundingClientRect().height > 0, checked: box.checked, rows: opts.filter(o => !o.textContent.startsWith('Add “')).length,
    badges: opts.filter(o => [...o.querySelectorAll('.badge')].some(b => b.textContent === 'site profile')).length, avatars: opts.filter(o => o.querySelector('img')).length, none: p.textContent.includes('None of these accounts has a current site profile.'),
    active: document.activeElement === p.querySelector('input[role="combobox"]') ? 'input' : document.activeElement === box ? 'filter' : document.activeElement?.tagName }; })()`);
// What a screen reader is given: the accessibility tree has no node named after the filter when it is hidden.
const axFilterNodes = async () => { const { nodes } = await cdp.send('Accessibility.getFullAXTree', {}); return nodes.filter(x => !x.ignored && typeof x.name?.value === 'string' && x.name.value.includes(FILTER)).map(x => x.role?.value + ':' + x.name.value); };
const measure = () => evalJ(`(() => { const p = ${P}, vw = document.documentElement.clientWidth; const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const outside = [...p.querySelectorAll('*')].filter(el => visible(el) && el.getBoundingClientRect().right > vw + 1).map(el => el.tagName + '.' + el.className).slice(0, 6);
  const tools = p.querySelector('.list-tools'), t = tools.getBoundingClientRect();
  return { docOverflowPx: document.documentElement.scrollWidth - window.innerWidth, outside, filterTarget: tools.hidden ? null : { w: Math.round(t.width), h: Math.round(t.height) } }; })()`);

const personas = [['admin', true], ['officer', false], ['member', false], ['applicant', false]];
try {
  await viewport(cdp, 1280, 900);
  for (const [persona, admin] of personas) {
    const reply = await search(persona);
    const shape = reply.status === 200 && reply.json?.siteProfilesVisible === admin && (admin ? reply.json.results.some(r => r.onSite === true) && reply.json.results.some(r => r.onSite === false) : reply.json.results.every(r => !Object.hasOwn(r, 'onSite')));
    await signIn(persona);
    await go('#/', `!!document.querySelector('.picker')`);
    const found = await mark(`t => t === 'Add a friend'`);
    await typeQuery(Q);
    const s = await snapshot(), ax = await axFilterNodes();
    const onSiteCount = (reply.json?.results || []).filter(r => r.onSite === true).length;
    if (admin) check(`${persona}: Home friends picker shows the filter and a "site profile" badge on exactly the replies' site accounts`, shape && found && s.open && s.toolsShown && s.badges === onSiteCount && s.rows === reply.json.results.length && ax.length > 0, { s, onSiteCount, ax, results: reply.json?.results?.length });
    else check(`${persona}: Home friends picker lists every Discord match with avatars, with no filter, no badge and nothing about the filter in the accessibility tree`, shape && found && s.open && !s.toolsShown && !s.checked && s.badges === 0 && s.rows === reply.json.results.length && s.avatars >= s.rows && ax.length === 0 && !s.none, { shape, s, ax, results: reply.json?.results?.length });
    if (persona === 'member' || persona === 'admin') {
      const layout = [];
      for (const w of WIDTHS) { await viewport(cdp, w, 900); await sleep(250); layout.push({ w, ...(await measure()) }); if ([320, 1280].includes(w)) await screenshot(cdp, path.join(OUT, `picker-${persona}-${w}.png`), false); }
      await viewport(cdp, 1280, 900);
      check(`${persona}: the open picker has no page overflow and nothing past the viewport at all six widths${admin ? ', and the filter row is at least 44 px tall' : ''}`, layout.every(x => x.docOverflowPx <= 0 && x.outside.length === 0 && (!admin || (x.filterTarget && x.filterTarget.h >= 44))), layout);
    }
    if (persona === 'applicant') {
      await go('#/apply', `!!document.querySelector('.picker')`);
      const refFound = await mark(`t => t === 'Add a reference'`);
      await typeQuery(Q);
      const r = await snapshot(), rax = await axFilterNodes();
      check('applicant: the application references picker has no filter and no badge either', refFound && r.open && !r.toolsShown && r.badges === 0 && r.rows === reply.json.results.length && rax.length === 0, { r, rax });
    }
  }

  // The administrator: keyboard into the filter, tick it, then the same picker gets a reply without permission.
  await signIn('admin');
  await go('#/admin/settings', `!!document.querySelector('.picker')`);
  const apptFound = await mark(`t => t.endsWith(': associate Discord account')`);
  const appt = await search('admin', 'appointment');
  await typeQuery(Q);
  const a0 = await snapshot();
  await key(cdp, 'Tab', 'Tab', 9); await sleep(150);
  const focusRing = await evalJ(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { inFilter: a === ${P}.querySelector('.list-tools input'), outline: s.outlineStyle + ' ' + s.outlineWidth, open: !${P}.querySelector('.list').hidden }; })()`);
  await key(cdp, ' ', 'Space', 32); await sleep(250);
  const a1 = await snapshot();
  const onSiteAppt = (appt.json?.results || []).filter(r => r.onSite === true).length;
  check('admin appointment search: unchanged rows and filter; Tab reaches the filter with a visible ring, Space ticks it and leaves only site profiles', apptFound && appt.json?.siteProfilesVisible === true && a0.toolsShown && a0.rows === appt.json.results.length && focusRing.inFilter && !focusRing.outline.startsWith('none') && focusRing.open && a1.checked && a1.rows === onSiteAppt && a1.badges === onSiteAppt, { a0, focusRing, a1, onSiteAppt });
  // Same instance: the next reply lacks siteProfilesVisible (as an ordinary member's does). Served by CDP for this one query.
  plainReply = { results: appt.json.results.map(({ onSite, ...rest }) => rest) };
  await intercept(true);
  await evalJ(`(() => { const i = ${P}.querySelector('input[role="combobox"]'); i.value = 'QA2'; i.dispatchEvent(new Event('input', { bubbles: true })); ${P}.querySelector('.list-tools input').focus(); return true; })()`);
  await sleep(600);
  for (let i = 0; i < 40; i++) { const s = await snapshot(); if (!s.open || s.none || (s.rows === plainReply.results.length && !(await evalJ(`${P}.textContent.includes('Searching…')`)))) break; await sleep(150); }
  await sleep(300);
  const a2 = await snapshot(), ax2 = await axFilterNodes();
  check('admin, same picker, filter ticked and focused, then a reply without siteProfilesVisible: filter cleared and hidden, every row listed, no badge, no site-profile message, focus kept in the search box', a2.open && !a2.toolsShown && !a2.checked && a2.rows === plainReply.results.length && a2.badges === 0 && !a2.none && a2.active === 'input' && ax2.length === 0, { a2, ax2 });
  check('no script errors on the pages', state.exceptions.length === 0, state.exceptions);
} finally {
  await cdp.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ origin: ORIGIN, baseApp: process.env.UI280_BASE_APP || null, ok, n, results }, null, 1));
  console.log(`\n${ok}/${n} ui280 browser checks (member picker, CL2-258) passed`);
  process.exitCode = ok === n ? 0 : 1;
}

'use strict';
// Evergreen Stage 2, lane siteui-a (12 Nov 2026): staff pages, community pages and treasury copy.
//
// Behaviour checks against a running local QA harness (harness-s2/server.cjs: the real Worker and SPA over a disposable
// in-memory database with synthetic personas), plus a headless Edge driven over CDP for the page checks. Nothing here
// reaches production or any external host. Each check prints PASS or FAIL with its issue id; the exit code is the number
// of failures, so the same file run against the base build (dfca7a2) lists what was wrong before.
//
//   node tests/evergreen1112_siteui-a_test.cjs --url http://127.0.0.1:63694 --cdp 63695 --profile <new dir> [--source <worktree>]
//
// --source is the worktree whose files the static checks read (default: this checkout).
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => (arg.startsWith('--') ? [...out, [arg.slice(2), all[i + 1]]] : out), []));
const URL0 = args.url || 'http://127.0.0.1:63694';
const CDP_PORT = Number(args.cdp || 0);
const SOURCE = path.resolve(args.source || path.join(__dirname, '..', '..'));
const only = args.only ? new Set(args.only.split(',')) : null;
let failures = 0;
const results = [];
const check = (id, label, ok, detail = '') => {
  if (only && !only.has(id)) return;
  results.push({ id, label, ok: !!ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail ? ' :: ' + String(detail).slice(0, 300) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = rel => fs.readFileSync(path.join(SOURCE, rel), 'utf8');

async function http(persona, method, p, body) {
  const headers = { Cookie: `QA209_persona=${persona}`, 'X-Olympus': '2', Origin: URL0 };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(URL0 + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await res.text();
    if (res.status === 429 && attempt < 3) { await sleep(3000); continue; }
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
}

// ---------------------------------------------------------------- minimal CDP (headless Edge, no dependency)
async function launchEdge(port, profile) {
  fs.mkdirSync(profile, { recursive: true });
  const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const proc = cp.spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--lang=en-US', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) { await sleep(250); try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { /* not up */ } }
  if (!targets) { proc.kill(); throw Error('edge did not expose CDP'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) for (const fn of listeners.get(msg.method) || []) fn(msg.params);
  };
  const cdp = {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    async eval(expr) {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async close() { try { await cdp.send('Browser.close'); } catch { /* gone */ } try { ws.close(); } catch { /* gone */ } await sleep(400); try { proc.kill(); } catch { /* gone */ } },
  };
  // One Fetch.requestPaused dispatcher; each check sets cdp.onPaused for its own interception and clears it after.
  cdp.onPaused = null;
  cdp.on('Fetch.requestPaused', p => { const fn = cdp.onPaused; (fn ? Promise.resolve(fn(p)) : cdp.send('Fetch.continueRequest', { requestId: p.requestId })).catch(() => {}); });
  // A form left with typing raises the page's "leave this page?" guard on the next navigation; the test accepts it.
  cdp.on('Page.javascriptDialogOpening', () => { cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  const requests = [];
  cdp.requests = requests;
  cdp.on('Network.requestWillBeSent', p => requests.push({ url: p.request.url, method: p.request.method }));
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  return cdp;
}
async function waitFor(cdp, expr, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await cdp.eval(`!!(${expr})`)) return true; } catch { /* navigating */ } await sleep(200); }
  return false;
}
async function open(cdp, persona, hash, ready = 'document.querySelector("main h1, main h2")') {
  await cdp.send('Page.navigate', { url: `${URL0}/__qa/${persona}` });
  await sleep(900);
  await cdp.send('Page.navigate', { url: `${URL0}/#/${hash}` });
  await sleep(300);
  await waitFor(cdp, ready);
  await sleep(700);
}
/** Answer a paused request with a bare 500 (no JSON, no message, no code): the shape of an unknown-effect failure. */
const bare500 = (cdp, p) => cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 500, responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: Buffer.from('synthetic failure').toString('base64') });
/** Answer a paused (Response stage) JSON reply with edit(json) applied; anything unreadable passes unchanged. */
async function rewriteJson(cdp, p, edit) {
  if (p.responseStatusCode === undefined) return cdp.send('Fetch.continueRequest', { requestId: p.requestId });
  const got = await cdp.send('Fetch.getResponseBody', { requestId: p.requestId });
  const raw = got.base64Encoded ? Buffer.from(got.body, 'base64').toString('utf8') : got.body;
  let out = raw; try { const json = JSON.parse(raw); edit(json); out = JSON.stringify(json); } catch { /* not JSON: passed unchanged */ }
  return cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode, responseHeaders: (p.responseHeaders || []).filter(h => !/^content-(length|encoding)$/i.test(h.name)), body: Buffer.from(out).toString('base64') });
}
const text = cdp => cdp.eval('document.querySelector("main") ? document.querySelector("main").innerText : document.body.innerText');

// ---------------------------------------------------------------- server checks
async function serverChecks() {
  // CL2-015: the staff overview names the website accounts behind stored <@id> holders.
  const ov = await http('admin', 'GET', '/api/admin/overview');
  const appointed = ov.data && ov.data.settings ? ov.data.settings.appointed : {};
  const accounts = ov.data && Array.isArray(ov.data.appointedAccounts) ? ov.data.appointedAccounts : null;
  check('CL2-015', 'overview resolves the office_45 pointer to its website account (name and avatar)', accounts && accounts.some(a => `<@${a.id}>` === appointed.office_45 && /QA Councillor/.test(a.label) && /^https:\/\/cdn\.discordapp\.com\//.test(a.avatarUrl)), JSON.stringify(accounts).slice(0, 200));

  // CL2-122: a plain-text holder needs only the naming tick to add and nothing to clear; a new association still needs both.
  const add = { ...appointed, office_08: 'Praxis Holder' };
  const r1 = await http('admin', 'PUT', '/api/admin/settings', { appointed: add, namesConfirmed: true });
  check('CL2-122', 'adding a plain-text holder with the naming tick only is saved', r1.status === 200, `${r1.status} ${r1.data && r1.data.error}`);
  const clear = { ...appointed }; delete clear.office_08;
  const r2 = await http('admin', 'PUT', '/api/admin/settings', { appointed: clear });
  check('CL2-122', 'clearing a plain-text holder needs no tick', r2.status === 200, `${r2.status} ${r2.data && r2.data.error}`);
  const r3 = await http('admin', 'PUT', '/api/admin/settings', { appointed: { ...clear, office_08: '<@300000000000000103>' }, namesConfirmed: true });
  check('CL2-122', 'a new Discord association without the publication tick is still refused', r3.status === 400 && r3.data && r3.data.error === 'confirm_appointed_characters', `${r3.status} ${r3.data && r3.data.error}`);

  // CL2-128: the settings rows now carry their approved counts and switches.
  const log = await http('admin', 'GET', '/api/admin/audit-log?family=site&window=1d');
  const settingsRows = (log.data && log.data.entries || []).filter(e => e.action === 'site.settings');
  check('CL2-128', 'a site.settings audit row shows the holder count', settingsRows.some(e => e.details && Number.isInteger(e.details.appointedNames)), JSON.stringify(settingsRows.slice(0, 2)));

  // CL2-139: wanted roles cannot exceed the places.
  const opId = ('evg1112' + Date.now().toString(36) + 'xxxxxxxxxxxxxxxx').slice(0, 22);
  const startsAt = new Date((Math.floor(Date.now() / 1000) + 3 * 86400) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ev = await http('admin', 'POST', '/api/community/events', { opId, title: 'Evergreen capacity check', startsAt, durationMin: 60, capacity: 5, roleTargets: { tank: 9, healer: 0, damage: 0 } });
  check('CL2-139', 'Places 5 with 9 tanks wanted is refused', ev.status === 400 && ev.data && ev.data.error === 'role_targets_over_capacity', `${ev.status} ${JSON.stringify(ev.data).slice(0, 120)}`);

  // CL2-145: a 50-character recipe search is a search, not a refusal.
  const q = 'Recipe of the Exceptionally Long Name Elixir Brew'.padEnd(50, 'x');
  const cs = await http('member', 'GET', '/api/community/crafting?q=' + encodeURIComponent(q));
  check('CL2-145', 'a 50-character recipe query is accepted', cs.status === 200, `${cs.status} ${cs.data && cs.data.error}`);

  // CL2-138: Classic 1.12 professions: skill to 300, two primary.
  const prof = await http('member', 'GET', '/api/community/profile');
  const base = prof.data && prof.data.profile ? prof.data.profile : null;
  const put = async professions => http('member', 'PUT', '/api/community/profile', { revision: base && base.revision, professions });
  const p1 = await put([{ name: 'alchemy', skill: 375 }]);
  check('CL2-138', 'profession skill 375 is refused', p1.status === 400 && p1.data && p1.data.error === 'invalid_professions', `${p1.status} ${p1.data && p1.data.error}`);
  const fresh = await http('member', 'GET', '/api/community/profile');
  const p2 = await http('member', 'PUT', '/api/community/profile', { revision: fresh.data && fresh.data.profile && fresh.data.profile.revision, professions: [{ name: 'alchemy', skill: 1 }, { name: 'mining', skill: 1 }, { name: 'tailoring', skill: 1 }] });
  check('CL2-138', 'three primary professions are refused', p2.status === 400 && p2.data && p2.data.error === 'invalid_professions', `${p2.status} ${p2.data && p2.data.error}`);
}

// ---------------------------------------------------------------- static copy checks (file text; used where no page shows it to a harness persona)
function staticChecks() {
  const app = read('worker/public/static/app.js');
  // Source checks remain only for comments and repository documents that no page or reply shows (CL2-126 comments,
  // CL2-136 digest text sent to Discord, CL2-324 docs); the rest are rendered checks in reviewChecks().
  check('CL2-126', 'staff copy names the 15-minute scheduler, not a half-hour one', !/half-hour scheduler|Checked every half hour/.test(app) && /SCHEDULER_MINUTES = 15/.test(app));
  check('CL2-126', 'digest comments say 15 minutes', !/every half hour/.test(read('worker/src/community-digest.ts')));
  check('CL2-136', 'the digest says who acts', /Site administrators handle these on the website's admin pages\./.test(read('worker/src/community-digest.ts')));
  const docs = ['docs/discord-privileged-intents.md', 'docs/design.md', 'docs/master198-governance-titles.md'].map(read).join('\n');
  check('CL2-324', 'docs say the gold is mailed in game to Fern Melder', !/mailed to \*\*Fernmelder\*\*|gold mailed to Fernmelder|Contributions are mailed to Fernmelder/.test(docs));
}

/** The applicant re-saves their own application (their editor proof), changing one free-text answer. */
async function applicantResave() {
  const me = await http('applicant', 'GET', '/api/me');
  const a = me.data && me.data.application;
  if (!a) return 'no application';
  const body = { editToken: a.editToken, position: a.position, classLead: a.classLead, backups: a.backups, fallback: a.fallback, character: a.character, class: a.class, role: a.role, region: a.region,
    avail: a.avail, availTz: a.availTz, answers: { ...a.answers, extra: (a.answers.extra || '') + ' (edited)' }, professions: a.answers.professions, voice: a.answers.voice, ack: true, boardOptIn: false };
  const res = await fetch(URL0 + '/api/application', { method: 'PUT', headers: { Cookie: 'QA209_persona=applicant', 'X-Olympus': '2', Origin: URL0, 'Content-Type': 'application/json', 'X-Olympus-Application-Editor': me.data.applicationEditorProof }, body: JSON.stringify(body) });
  return String(res.status);
}

// ---------------------------------------------------------------- page checks
async function pageChecks(cdp) {
  // CL2-014: Overview leads with the roster figures; five groups; Calendar under Operations; Appointed roles has a page.
  await open(cdp, 'admin', 'admin', 'document.querySelector("#overview-seats") || document.querySelector("main .grid.four")');
  const nav = await cdp.eval(`[...document.querySelectorAll('.admin-section-group228')].map(g => [g.querySelector('h2').textContent, [...g.querySelectorAll('a')].map(a => a.textContent + '=' + a.getAttribute('href'))])`);
  const overview = await text(cdp);
  check('CL2-014', 'Overview does not open with the Treasury programme', !/Treasury programme · officer operating plan/.test(overview), overview.slice(0, 160));
  const group = name => (nav.find(([label]) => label === name) || [null, []])[1];
  check('CL2-014', 'the five directive groups are present in order', JSON.stringify(nav.map(([l]) => l)) === JSON.stringify(['Applications & Roster', 'Governance, Ranks & Appointments', 'Imperial Treasury & Stockades', 'News, Calendar & Operations', 'System Settings & Compliance']), JSON.stringify(nav.map(([l]) => l)));
  check('CL2-014', 'News, Calendar & Operations links the Calendar and launch operations', group('News, Calendar & Operations').includes('Calendar=#/community/calendar') && group('News, Calendar & Operations').some(x => x.startsWith('Launch operations')), JSON.stringify(group('News, Calendar & Operations')));
  check('CL2-014', 'Applications & Roster no longer files launch operations', !group('Applications & Roster').some(x => x.startsWith('Launch operations')));
  check('CL2-014', 'Appointed roles is its own page under Governance', group('Governance, Ranks & Appointments').includes('Appointed roles=#/admin/appointments'), JSON.stringify(group('Governance, Ranks & Appointments')));
  await open(cdp, 'admin', 'admin/settings', 'document.querySelector("#news-on")');
  const settingsHeight = await cdp.eval('document.documentElement.scrollHeight');
  const settingsHasAppointments = await cdp.eval('!!document.querySelector("[data-appointment-field203]")');
  check('CL2-014', 'Settings no longer carries the appointment editor', !settingsHasAppointments, `settings scrollHeight ${settingsHeight}px`);

  // CL2-015: each stored holder is shown by name and avatar beside its field.
  await open(cdp, 'admin', 'admin/appointments', 'document.querySelector("[data-appointment-field203]")');
  const holder = await cdp.eval(`(() => { const row = document.querySelector('[data-appointment-field203="office_45"]'); const line = row && row.querySelector('[data-appointed-holder]'); return line ? { text: line.textContent, img: !!line.querySelector('img.av') } : null; })()`);
  check('CL2-015', 'office_45 shows "QA Councillor" with an avatar, not only <@id>', holder && /QA Councillor/.test(holder.text) && holder.img, JSON.stringify(holder));

  // CL2-122: a refused save shows the reason beside the consent box and moves focus to it.
  if (holder) {
    const focus = await cdp.eval(`(async () => {
      const input = document.querySelector('#appointed-holder-office_08'); input.value = 'Praxis Inline'; input.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('button')].find(b => b.textContent === 'Save appointed roles').click();
      await new Promise(r => setTimeout(r, 1500));
      const line = document.querySelector('#appointed-names-ok-error');
      return { focused: document.activeElement && document.activeElement.id, line: line && !line.hidden ? line.textContent : null };
    })()`);
    check('CL2-122', 'a missing naming tick is reported beside its box with focus on it', focus.focused === 'appointed-names-ok' && /agreed to be named/.test(focus.line || ''), JSON.stringify(focus));
  } else check('CL2-122', 'a missing naming tick is reported beside its box with focus on it', false, 'no Appointed roles page');

  // CL2-017: a failed Town Crier read is worded and offers Try again.
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/news', requestStage: 'Request' }] });
  let intercepted = 0;
  cdp.onPaused = p => { intercepted++; return bare500(cdp, p); };
  await open(cdp, 'member', 'news', 'document.querySelector(".notice-box")');
  const news = await cdp.eval(`(() => { const box = document.querySelector('main .notice-box'); return box ? { text: box.innerText, retry: [...box.querySelectorAll('button')].some(b => b.textContent === 'Try again') } : null; })()`);
  await cdp.send('Fetch.disable'); cdp.onPaused = null;
  check('CL2-017', 'a failed news read is worded (no "Request failed (500).") and offers Try again', news && !/Request failed \(\d+\)/.test(news.text) && /could not be read/.test(news.text) && news.retry, JSON.stringify(news) + ` intercepted=${intercepted}`);
  if (news && news.retry) {
    await cdp.eval(`[...document.querySelectorAll('main .notice-box button')].find(b => b.textContent === 'Try again').click()`);
    const recovered = await waitFor(cdp, '[...document.querySelectorAll("main h2, main h3")].some(h => /Notices/.test(h.textContent))', 8000);
    check('CL2-017', 'Try again reads the news again and shows it', recovered);
    check('CL2-017', 'the failed read (not a write) says what the status means', /The site had a problem answering\. Try again in a moment\./.test(news.text), news.text);
  }

  // CL2-141: Town Crier attribution.
  await open(cdp, 'member', 'news', '[...document.querySelectorAll("main h2")].some(h => /Notices/.test(h.textContent))');
  const crier = await text(cdp);
  check('CL2-141', 'notices are attributed to the administrators and the Lead Correspondent', /From the site's administrators and the Lead Correspondent/.test(crier) && !/A Town Crier appointment will appear only after/.test(crier));

  // CL2-134 / CL2-146: the Directory has no second Crafting panel; the Workshop select has no empty choice.
  await open(cdp, 'member', 'community/directory', 'document.querySelector("main .stack .frame, main .stack section")');
  await cdp.eval(`(() => { const b = [...document.querySelectorAll('main button')].find(x => /^Show Member profiles/.test(x.textContent)); if (b) b.click(); return !!b; })()`);
  await waitFor(cdp, '[...document.querySelectorAll("main h2")].some(h => /Member profiles/.test(h.textContent))', 8000);
  await sleep(800);
  const dir = await cdp.eval(`[...document.querySelectorAll('main h2')].map(h => h.textContent)`);
  check('CL2-134', 'the Directory page has no Crafting offers panel', !dir.includes('Crafting offers'), JSON.stringify(dir));
  await open(cdp, 'member', 'community/workshop', '[...document.querySelectorAll("main h2")].some(h => /Crafting offers/.test(h.textContent))');
  const opts = await cdp.eval(`(() => { const frame = [...document.querySelectorAll('main h2')].find(h => /Crafting offers/.test(h.textContent)); const sel = frame && frame.closest('section, .frame').querySelector('select'); return sel ? [...sel.options].map(o => o.value) : null; })()`);
  check('CL2-146', 'the Workshop Browse select has no empty option', Array.isArray(opts) && !opts.includes(''), JSON.stringify(opts));

  // CL2-286 / CL2-287: the refusal states the gate once and follows the Royal Writs switch (off on the harness).
  await open(cdp, 'member', 'treasury-plan', '[...document.querySelectorAll("main h2")].some(h => /Treasury programme/.test(h.textContent))');
  const refusal = await text(cdp);
  check('CL2-286', 'the refusal names High Council rank, not "the Council"', !/the Guild Master, the Council, Officers/.test(refusal) && /High Council/.test(refusal), refusal.slice(0, 300));
  check('CL2-286', 'the refusal names every Discord role the gate admits (Guild Master, Officer, Raid Leader)', /the Discord Guild Master, Officer and Raid Leader roles/.test(refusal), refusal.slice(0, 400));
  check('CL2-287', 'with the switch off the refusal says the Royal Writs schedule is paused', !/Royal Writs and Patron tiers stay public/.test(refusal) && /Royal Writs schedule and new Patron applications are paused/.test(refusal));

  // CL2-290: an account with no dues week sees "nothing owed", not "ledger open" with a pay-now line.
  await open(cdp, 'unverified', 'community/dues', '[...document.querySelectorAll("main h2")].some(h => /My dues/.test(h.textContent))');
  const dues = await text(cdp);
  const duesWeeks = /Week of/.test(dues);
  check('CL2-290', 'no dues week: "You owe nothing" and no plain pay-now instruction', duesWeeks || (/You owe nothing/.test(dues) && !/ledger open/.test(dues) && /When a week is due, send the gold/.test(dues) && /once you have a roster-confirmed character/.test(dues)), dues.slice(0, 300));

  // CL2-126: the settings hint.
  await open(cdp, 'admin', 'admin/settings', 'document.querySelector("#news-on")');
  const settings = await text(cdp);
  check('CL2-126', 'Settings does not say "every half hour"', !/every half hour/.test(settings), settings.match(/Checked every[^.]*\./)?.[0] || 'queue-paused hint shown on this harness');

  // CL2-120 (app.js part): one page-level empty state on Admin -> Votes; "Unknown" rather than "?".
  await open(cdp, 'admin', 'admin/votes', 'document.querySelector("main .grid.three .card")');
  const votes = await text(cdp);
  check('CL2-120', 'Admin -> Votes does not repeat "No board votes yet" on every card', (votes.match(/No board votes yet/g) || []).length <= 1, `${(votes.match(/No board votes yet/g) || []).length} repeats`);
  // The rendered check is in reviewChecks(); this sweep covers the two voter dialogs, which need recorded votes to open.
  check('CL2-120', 'no bare "?" age cells remain in the voter tables (source sweep)', !/: "\?" \}\)/.test(read('worker/public/static/app.js')));

  // CL2-121 and CL2-129: the application detail shows its times; a stale decision says the application changed.
  await open(cdp, 'admin', 'admin/applications/300000000000000104', '[...document.querySelectorAll("main button")].some(b => b.textContent === "Under review")');
  const detail = await text(cdp);
  check('CL2-121', 'the application detail shows Submitted, Last changed and Reviewed', /Submitted/.test(detail) && /Last changed/.test(detail) && /Reviewed/.test(detail));
  // The applicant re-saves the same application in the background (their own editor proof), then the admin decides.
  const resave = await applicantResave();
  await cdp.eval(`[...document.querySelectorAll('main button')].find(b => b.textContent === 'Under review').click()`);
  await sleep(2500);
  const notice = await cdp.eval(`(() => { const n = [...document.querySelectorAll('main p[role="status"]')].map(p => p.textContent).filter(Boolean); return n.join(' | '); })()`);
  check('CL2-129', 'a refused stale decision says the application changed, not "could not be confirmed"', /changed/.test(notice) && !/could not be confirmed/.test(notice), `resave: ${resave} :: notice: ${notice}`);
  const after = await http('applicant', 'GET', '/api/me');
  check('CL2-129', 'RT-16 still holds: the stale decision wrote nothing (status unchanged)', after.data && after.data.application && after.data.application.status === 'submitted', after.data && after.data.application && after.data.application.status);
}

/** Second review round (12 Nov 2026): behaviour checks for the reviewer's findings and for copy a persona can reach. */
async function reviewChecks(cdp) {
  const statusNear = (button) => `(() => { const b = [...document.querySelectorAll('main button')].find(x => ${button}.test(x.textContent)); const box = b && b.closest('section, .frame, .card'); return box ? [...box.querySelectorAll('p[role="status"]')].map(p => p.textContent).join(' | ') : null; })()`;

  // CL2-017 (MAJOR): a bare 500 on an unknown-effect write shows the page's own fallback and no invitation to retry.
  await open(cdp, 'admin', 'admin/directory-visibility', 'document.querySelector("#attended-directory-id")');
  const ready = await cdp.eval(`(async () => {
    const input = document.querySelector('#attended-directory-id'); input.value = '300000000000000112'; input.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('main button')].find(b => /^Read this member/.test(b.textContent)).click();
    const box = document.querySelector('#attended-directory-confirmed');
    for (let i = 0; i < 50 && box.disabled; i++) await new Promise(r => setTimeout(r, 150));
    if (box.disabled) return 'confirmation stayed disabled';
    box.click();
    await new Promise(r => setTimeout(r, 100));
    return [...document.querySelectorAll('main button')].find(b => /^Save requested listing/.test(b.textContent)).disabled ? 'save stayed disabled' : 'ready';
  })()`);
  let writes = 0;
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/admin/discord-directory/visibility', requestStage: 'Request' }] });
  cdp.onPaused = p => { writes++; return bare500(cdp, p); };
  if (ready === 'ready') await cdp.eval(`[...document.querySelectorAll('main button')].find(b => /^Save requested listing/.test(b.textContent)).click()`);
  await sleep(1500);
  await cdp.send('Fetch.disable'); cdp.onPaused = null;
  const written = await cdp.eval(statusNear('/^Save requested listing/'));
  check('CL2-017', 'a bare 500 on the directory-visibility write shows its unknown-outcome fallback without "Try again"', ready === 'ready' && writes === 1 && /Outcome unconfirmed\. Read the same member/.test(written || '') && !/try again/i.test(written || '') && !/Request failed/.test(written || ''), `${ready}; writes=${writes}; ${written}`);

  // CL2-120: a missing account age reads "Unknown" in the applications table (the reply is rewritten to carry nulls).
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/admin/applications?*', requestStage: 'Response' }] });
  cdp.onPaused = p => rewriteJson(cdp, p, json => { for (const it of json.items || []) if (it.user) { it.user.accountCreated = null; it.user.serverJoined = null; } });
  await open(cdp, 'admin', 'admin/applications', 'document.querySelector("main table.data tbody tr")');
  await cdp.send('Fetch.disable'); cdp.onPaused = null;
  const ages = await cdp.eval(`(() => { const row = document.querySelector('main table.data tbody tr'); return row ? [...row.cells].map(c => c.textContent) : null; })()`);
  check('CL2-120', 'an application with no account or server age shows "Unknown", not "?"', Array.isArray(ages) && ages.filter(t => t === 'Unknown').length === 2 && !ages.includes('?'), JSON.stringify(ages));

  // CL2-139 and CL2-135 on the event form. A real event (10 places, 9 tanks wanted) is the edit subject.
  const opId = ('evg1112e' + Date.now().toString(36) + 'xxxxxxxxxxxxxxxx').slice(0, 22);
  const startsAt = new Date((Math.floor(Date.now() / 1000) + 4 * 86400) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const made = await http('admin', 'POST', '/api/community/events', { opId, title: 'Evergreen edit check', startsAt, durationMin: 60, capacity: 10, roleTargets: { tank: 9, healer: 0, damage: 0 } });
  const eventId = made.data && made.data.event && made.data.event.id;
  const posts = (re) => cdp.requests.filter(r => r.method === 'POST' && re.test(r.url)).length;
  const fill = (pairs) => `(() => { for (const [sel, value] of ${JSON.stringify(pairs)}) { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); } document.querySelector('main form button[type="submit"]').click(); return true; })()`;
  const fieldError = (key) => cdp.eval(`(() => { const e = document.querySelector('#err-${key}'); return e && !e.hidden ? e.textContent : ''; })()`);

  // New event: the page refuses 9 tanks for 5 places before anything is sent.
  await open(cdp, 'admin', 'community/calendar/new', 'document.querySelector("#f-ev-title")');
  const createsBefore = posts(/\/api\/community\/events$/);
  await cdp.eval(fill([['#f-ev-title', 'Evergreen client check'], ['#f-ev-capacity', '5'], ['main [data-role="tank"]', '9']]));
  await sleep(800);
  const newError = await fieldError('ev-capacity');
  check('CL2-139', 'a new event with 9 tanks for 5 places is refused on the page, nothing sent', /add up to more than the event's places/.test(newError) && posts(/\/api\/community\/events$/) === createsBefore, `${newError}; sent=${posts(/\/api\/community\/events$/) - createsBefore}`);

  if (eventId) {
    // CL2-135: the server's invalid_title refusal, rendered beside the title.
    await open(cdp, 'admin', `community/calendar/${eventId}/edit`, 'document.querySelector("#f-ev-title")');
    await cdp.eval(fill([['#f-ev-title', 'Raid ‮ night']]));
    await sleep(1500);
    const titleError = await fieldError('ev-title');
    check('CL2-135', 'a title with a text-direction character is refused with the named reason', /without control or text-direction characters/.test(titleError), titleError);

    // CL2-139 (edit): an older event whose roles already exceed its places stays editable for its title.
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: `*/api/community/event?id=${eventId}`, requestStage: 'Response' }] });
    cdp.onPaused = p => rewriteJson(cdp, p, json => { if (json.event) json.event.capacity = 5; });
    await open(cdp, 'admin', `community/calendar/${eventId}/edit`, 'document.querySelector("#f-ev-title")');
    await cdp.send('Fetch.disable'); cdp.onPaused = null;
    const loaded = await cdp.eval(`document.querySelector('#f-ev-capacity').value`);
    const updatesBefore = posts(/\/api\/community\/events\/update$/);
    await cdp.eval(fill([['#f-ev-title', 'Evergreen edit check, renamed']]));
    await sleep(1800);
    const capError = await fieldError('ev-capacity');
    const stored = await http('admin', 'GET', `/api/community/event?id=${encodeURIComponent(eventId)}`);
    check('CL2-139', 'a title-only edit of an event with more wanted roles than places is sent and saved', loaded === '5' && !capError && posts(/\/api\/community\/events\/update$/) === updatesBefore + 1 && stored.data && stored.data.event && stored.data.event.title === 'Evergreen edit check, renamed', `places shown ${loaded}; error "${capError}"; title ${stored.data && stored.data.event && stored.data.event.title}`);

    // CL2-139 (edit): changing the places is still judged on the page.
    await open(cdp, 'admin', `community/calendar/${eventId}/edit`, 'document.querySelector("#f-ev-capacity")');
    const updatesBefore2 = posts(/\/api\/community\/events\/update$/);
    await cdp.eval(fill([['#f-ev-capacity', '4']]));
    await sleep(800);
    const capError2 = await fieldError('ev-capacity');
    check('CL2-139', 'lowering the places below the wanted roles is refused on the page, nothing sent', /add up to more than the event's places/.test(capError2) && posts(/\/api\/community\/events\/update$/) === updatesBefore2, capError2);

    // CL2-123: the Discord message preview wraps through the stylesheet (no inline style, which the CSP would block).
    await open(cdp, 'admin', `community/calendar/${eventId}/discord`, 'document.querySelector("main pre")');
    const pre = await cdp.eval(`(() => { const p = document.querySelector('main pre'); return p ? { style: p.getAttribute('style'), whiteSpace: getComputedStyle(p).whiteSpace, wrap: getComputedStyle(p).overflowWrap } : null; })()`);
    check('CL2-123', 'the Discord preview has no inline style and wraps (pre-wrap, anywhere)', pre && pre.style === null && pre.whiteSpace === 'pre-wrap' && pre.wrap === 'anywhere', JSON.stringify(pre));
  } else check('CL2-139', 'a title-only edit of an event with more wanted roles than places is sent and saved', false, `event not created: ${made.status} ${JSON.stringify(made.data).slice(0, 120)}`);

  // CL2-283: the treasury access answer is reused 30 s later and read again 61 s later (the page clock is moved forward).
  await open(cdp, 'admin', 'treasury-plan', '[...document.querySelectorAll("main h1, main h2")].some(h => /Treasury/.test(h.textContent))');
  await sleep(1500);
  const planText = await cdp.eval('document.querySelector("main") ? document.querySelector("main").textContent : ""');
  const accessReads = () => cdp.requests.filter(r => /\/api\/treasury-plan\/access/.test(r.url)).length;
  const revisit = async (skew) => {
    await cdp.eval(`(() => { if (!window.__realNow) window.__realNow = Date.now.bind(Date); window.__skew = ${skew}; Date.now = () => window.__realNow() + window.__skew; return true; })()`);
    const before = accessReads();
    await cdp.eval(`location.hash = '#/roles'`); await sleep(1200);
    await cdp.eval(`location.hash = '#/treasury-plan'`); await sleep(2000);
    return accessReads() - before;
  };
  const at30 = await revisit(30000), at61 = await revisit(61000);
  check('CL2-283', 'the access answer is reused 30 s later and read again 61 s later', at30 === 0 && at61 >= 1, `reads after +30 s: ${at30}; after +61 s: ${at61}`);

  // CL2-285: the plan an officer reads states the live 100g Stockades bail.
  check('CL2-285', 'the rendered plan says 100g standard bail, not historical conditional clemency', /100g standard bail/.test(planText) && !/historical conditional-clemency/.test(planText), planText.length);

  // CL2-282: the governance book as served to readers.
  const book = await fetch(URL0 + '/static/governance/reconciled-book.md', { headers: { Cookie: 'QA209_persona=member' } }).then(r => r.ok ? r.text() : '');
  check('CL2-282', 'the served book opens both duel-escrow clauses with the suspended-proposal heading', (book.match(/\(b\) \*\*\[Suspended proposal — not active\]\*\* A \*\*Privy Court Civil Suit \/ Mak'gora Duel Escrow\*\*/g) || []).length === 2, `${book.length} bytes`);

  // CL2-290: a confirmed member with no dues week is not told to get a roster-confirmed character.
  await open(cdp, 'member', 'community/dues', '[...document.querySelectorAll("main h2")].some(h => /My dues/.test(h.textContent))');
  const memberDues = await text(cdp);
  check('CL2-290', 'confirmed member, no dues week: "not counted for you yet", no roster-confirmed condition', /Week of/.test(memberDues) || (/You owe nothing/.test(memberDues) && /No dues week has been counted for you yet/.test(memberDues) && !/once you have a roster-confirmed character/.test(memberDues)), memberDues.slice(0, 300));
}

/** Mobile-first layout of the changed staff pages: no sideways page scroll, 44 px targets for the new holder buttons. */
async function layoutChecks(cdp) {
  for (const [route, ready] of [['admin/appointments', 'document.querySelector("[data-appointed-holder]")'], ['admin', 'document.querySelector(".admin-section-group228")']]) {
    for (const width of [1440, 1280, 768, 390, 375, 320]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await open(cdp, 'admin', route, ready);
      const m = await cdp.eval(`(() => { const d = document.documentElement; const small = [...document.querySelectorAll('[data-appointed-holder] button')].filter(b => b.getBoundingClientRect().height && b.getBoundingClientRect().height < 44).length; return { overflow: d.scrollWidth - d.clientWidth, small, present: !!(${ready}) }; })()`);
      check(route === 'admin' ? 'CL2-014' : 'CL2-015', `/#/${route} at ${width}px: no horizontal overflow${route === 'admin' ? '' : ', holder buttons at least 44 px'}`, m.present && m.overflow <= 0 && m.small === 0, JSON.stringify(m));
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
}

(async () => {
  console.log(`evergreen1112 siteui-a against ${URL0}; static source ${SOURCE}`);
  await serverChecks();
  staticChecks();
  if (CDP_PORT) {
    const profile = args.profile || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-siteui-a-'));
    const cdp = await launchEdge(CDP_PORT, profile);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    try { await pageChecks(cdp); await reviewChecks(cdp); if (!args['no-layout']) await layoutChecks(cdp); } finally { await cdp.close(); }
  }
  console.log(`RESULT ${results.length - failures}/${results.length} passed`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results, null, 1));
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });

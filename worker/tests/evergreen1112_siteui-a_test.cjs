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

// ---------------------------------------------------------------- unit checks (the real Worker module, transpiled; no harness)
/** Transpile one Worker module from SOURCE (and its relative imports) into CommonJS in memory. */
function loadTs(rel) {
  const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
  const Module = require('node:module');
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports;
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const m = new Module(file); m.filename = file; cache.set(file, m);
    m.require = spec => spec.startsWith('.') ? load(path.resolve(path.dirname(file), spec.replace(/\.js$/, '') + (spec.endsWith('.ts') ? '' : '.ts'))) : require(spec);
    new Function('exports', 'require', 'module', '__filename', '__dirname', code)(m.exports, m.require, m, file, path.dirname(file));
    return m.exports;
  };
  return load(path.join(SOURCE, rel));
}

async function unitChecks() {
  // REV-SITEA-2 (12 Nov 2026): the CL2-122 pre-check in saveSettings. A legacy appointment (a <@id> pointer with no stored
  // proof key) saved without appointedCharactersConfirmed is refused with 400 confirm_appointed_characters before any
  // account read or Discord call. The same save with the tick is the control: it does reach the account read and Discord.
  // The Worker captures fetch when its provider module loads, so the stub is installed first and stays: it answers every
  // Discord call with a 503 and counts it, and passes anything else (the harness requests below) to the real fetch.
  const realFetch = globalThis.fetch;
  let provider = [];
  globalThis.fetch = async function fetch(input, init) {
    const url = String(input && input.url || input);
    if (/^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//.test(url)) { provider.push(url); return new Response('{"message":"stub"}', { status: 503, headers: { 'Content-Type': 'application/json' } }); }
    return realFetch(input, init);
  };
  const admin = loadTs('worker/src/site-admin.ts');
  const run = async (extra) => {
    provider = [];
    const statements = [];
    const stored = { office_45: '<@300000000000000103>' };
    const rows = sql => /^SELECT key, value FROM site_settings/.test(sql) ? [{ key: 'appointed', value: JSON.stringify(stored) }]
      : /^SELECT wanted\.value AS id/.test(sql) ? [{ id: '300000000000000103', birth: 'a'.repeat(32), generation: null, status: 'eligible' }] : [];
    const env = { SITE_ADMINS: '300000000000000001', SITE_GUILD_ID: '300000000000000999', DISCORD_BOT_TOKEN: 'unit-test', COOKIE_SECRET: 'unit-test-secret-unit-test-secret',
      DB: { prepare(sql) { statements.push(sql.trim().slice(0, 40)); const st = { bind: () => st, all: async () => ({ results: rows(sql.trim()) }), first: async () => null, run: async () => ({ meta: { changes: 0 } }), raw: async () => [] }; return st; },
        batch: async s => { statements.push('batch'); return s.map(() => ({ results: [], meta: { changes: 0 } })); } } };
    const body = { appointed: { ...stored }, ...extra };
    const req = new Request('https://example.test/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await admin.handleAdmin(req, env, '/api/admin/settings', { discord_id: '300000000000000001' }, () => {});
    const data = await res.json().catch(() => null);
    return { status: res.status, error: data && data.error, provider: provider.length, reads: statements };
  };
  const refused = await run({});
  check('REV-SITEA-2', 'a legacy <@id> appointment with no proof key, saved without the publication tick, is 400 confirm_appointed_characters with no provider call and no read past the settings row',
    refused.status === 400 && refused.error === 'confirm_appointed_characters' && refused.provider === 0 && refused.reads.length === 1, JSON.stringify(refused));
  const control = await run({ appointedCharactersConfirmed: true });
  check('REV-SITEA-2', 'control: the same save with the tick passes the pre-check, reads the account and calls Discord (stubbed 503: nothing saved)',
    control.provider >= 1 && control.reads.length > 1 && control.status === 409 && control.error === 'appointed_account_unavailable', JSON.stringify(control));

  // REV-SITEA-3 (12 Nov 2026): the Treasury refusal sentence is treasuryGateDescription, built from the gate's own reads.
  const treasury = loadTs('worker/src/site-treasury-access.ts');
  if (typeof treasury.treasuryGateDescription !== 'function' || typeof treasury.treasuryDiscordRoles !== 'function') {
    check('REV-SITEA-3', 'site-treasury-access.ts exports the gate description and the Discord role list the gate reads', false, 'not exported');
    return;
  }
  const wrangler = read('worker/wrangler.toml');
  const tomlValue = key => { const m = new RegExp(`^${key} = (?:'([^']*)'|"([^"]*)")`, 'm').exec(wrangler); return m ? (m[1] ?? m[2]) : undefined; };
  const configured = Object.fromEntries(['GUILD_ID', 'SITE_GUILD_ID', 'ROLE_GUILD_MASTER', 'ROLE_GUILD_LEADER', 'ROLE_OFFICER', 'ROLE_RAID_LEADER', 'CANONICAL_RANKS233', 'QR_NATIVE_ROLE_MAP'].map(k => [k, tomlValue(k)]));
  const policy = JSON.parse(configured.CANONICAL_RANKS233);
  const base = { ...configured, DISCORD_BOT_TOKEN: 'unit-test' };
  const configs = {
    enabled: base,
    presentNotEnabled: { ...base, CANONICAL_RANKS233: JSON.stringify({ ...policy, enabled: false }) },
    absent: (({ CANONICAL_RANKS233, ...rest }) => rest)(base),
    noToken: (({ DISCORD_BOT_TOKEN, ...rest }) => rest)(base),
    // A ten-rank native map after the launch cut opens the roster path (no canonical configuration in this case).
    tenRank: (({ CANONICAL_RANKS233, ...rest }) => ({ ...rest, LINKS_NOT_BEFORE: '1793833200', QR_NATIVE_ROLE_MAP: JSON.stringify({ profile: 'ten-rank', roles: Array.from({ length: 10 }, (_, i) => '4000000000000001' + String(i).padStart(2, '0')) }) }))(base),
  };
  const said = Object.fromEntries(Object.entries(configs).map(([k, env]) => [k, { text: treasury.treasuryGateDescription(env), discord: treasury.treasuryDiscordRoles(env) }]));
  check('REV-SITEA-3', 'canonical rank roles enabled: the sentence names the Discord roles of the five officer ranks the gate reads', said.enabled.discord && /the Discord Guild Master, High Council, Officer, Officer Alt and Raid Leader roles/.test(said.enabled.text), said.enabled.text);
  check('REV-SITEA-3', 'canonical rank roles present but not enabled: the gate admits no Discord role and the sentence names none', said.presentNotEnabled.discord === null && !/Discord/.test(said.presentNotEnabled.text), said.presentNotEnabled.text);
  check('REV-SITEA-3', 'no canonical configuration: only the configured legacy roles (Guild Master, Officer, Raid Leader) are named', said.absent.discord && /the Discord Guild Master, Officer and Raid Leader roles/.test(said.absent.text) && !/High Council role|Officer Alt role/.test(said.absent.text), said.absent.text);
  check('REV-SITEA-3', 'no bot token: no Discord clause; appointments and site administrators are always named', said.noToken.discord === null && !/Discord/.test(said.noToken.text) && Object.values(said).every(x => /the holders of the published Co-Guild Master and Lord High Treasurer seats(?:; and| and to) site administrators\.$/.test(x.text)), said.noToken.text);
  // Round 3 item 10 (12 Nov 2026): with only the two configuration-independent paths, the sentence is a plain pair.
  check('ROUND3-10', 'two paths read "open to A and to B." (no colon, no "; and"); three or more keep the list form', ['presentNotEnabled', 'noToken'].every(k => said[k].text === 'The treasury programme and financial model are open to the holders of the published Co-Guild Master and Lord High Treasurer seats and to site administrators.') && /^The treasury programme and financial model are open to: [^;]+; [^;]+; and site administrators\.$/.test(said.enabled.text), JSON.stringify({ two: said.noToken.text, three: said.enabled.text }));
  check('REV-SITEA-3', 'only a configuration that opens the roster path names the roster ranks', /^The treasury programme and financial model are open to: Leader, High Council, Officer, Officer Alt and Raid Leader rank on the latest verified roster; the Discord /.test(said.tenRank.text) && ['enabled', 'presentNotEnabled', 'absent', 'noToken'].every(k => !/verified roster/.test(said[k].text)), said.tenRank.text);
  check('REV-SITEA-3', 'the sentence never uses a rank name outside the owner\'s ladder (no Stewart, no Treasurer rank)', Object.values(said).every(x => !/Stewart|Treasurer rank/.test(x.text)));
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
  // REV-SITEA-3 (12 Nov 2026): the sentence is the gate's own description (unit checks above cover each configuration,
  // including High Council rank on the roster path); here the page must show exactly what the Worker says it admits.
  const answer = await http('member', 'GET', '/api/treasury-plan/access');
  const admits = answer.data && typeof answer.data.admits === 'string' ? answer.data.admits : null;
  check('CL2-286', 'the refusal does not say "the Council"', !/the Guild Master, the Council, Officers/.test(refusal), refusal.slice(0, 300));
  check('REV-SITEA-3', 'the refusal shows the gate\'s own description from the access answer, and names no Discord role that answer does not', !!admits && refusal.includes(admits) && (/Discord/.test(admits) || !/Discord/.test(refusal)), `${admits} :: ${refusal.slice(0, 400)}`);
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

/**
 * Stage 2 follow-up (12 Nov 2026), Codex's UX-LOAD-001 and BROWSER-03. Each sub-check reports its own measurements, so the same
 * run against the integrated head (1e51050) shows what was wrong before.
 */
async function followupChecks(cdp) {
  const consoleErrors = [];
  cdp.on('Runtime.exceptionThrown', p => consoleErrors.push(p.exceptionDetails && (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  const want = id => !only || only.has(id);
  // A paused request that is never answered: the shape of a script that fires neither load nor error.
  const held = [];
  // Round 3 item 10 (12 Nov 2026): only the first address is stalled; a retry at a fresh address (?retry=) is let through
  // while the stalled request stays held, so a passing retry shows that the fresh address is what gets the script loaded.
  const holdScripts = async (pattern) => {
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: pattern, requestStage: 'Request' }] });
    cdp.onPaused = p => { if (/[?&]retry=/.test(p.request.url)) return cdp.send('Fetch.continueRequest', { requestId: p.requestId }); held.push(p.requestId); };
  };
  const releaseHeld = async () => { cdp.onPaused = null; for (const id of held.splice(0)) await cdp.send('Fetch.failRequest', { requestId: id, errorReason: 'Aborted' }).catch(() => {}); await cdp.send('Fetch.disable'); };
  const scriptRequests = (re) => cdp.requests.filter(r => re.test(r.url)).map(r => r.url.replace(URL0, ''));

  if (want('UX-LOAD-001')) {
    // 1. analysis.js never answers: the calculator must still open, name the missing comparison, and leave no stalled element.
    await holdScripts('*/static/talents/analysis.js*');
    const t0 = Date.now();
    await open(cdp, 'member', 'talents', 'document.querySelector("main .talents-tool")');
    const mounted = await waitFor(cdp, 'document.querySelector("main .talents-tool")', 15000);
    const waited = Date.now() - t0;
    const first = await cdp.eval(`(() => ({ note: document.querySelector('main .talents-module-note')?.textContent || '', analysis: !!window.OlympusTalentAnalysis, stalled: [...document.querySelectorAll('script[src*="analysis.js"]')].length, opening: /Opening tool/.test(document.querySelector('main')?.textContent || '') }))()`);
    check('UX-LOAD-001', 'an optional script that never loads or fails no longer holds the calculator: it opens and names the module unavailable', mounted && waited < 15000 && /Build comparison could not be loaded\. Reopen the calculator to try again\./.test(first.note) && !first.analysis && first.stalled === 0 && !first.opening, JSON.stringify({ mounted, waited, ...first }));
    // 2. Reopening the calculator really asks again (a fresh address, so the stalled request is not joined) and the module
    // mounts while the first request is still stalled; it is released only after the measurement.
    const before = scriptRequests(/analysis\.js/).length;
    await cdp.eval(`location.hash = '#/roles'`); await sleep(1200);
    await cdp.eval(`location.hash = '#/talents'`);
    const retried = await waitFor(cdp, 'document.querySelector("main .talents-analysis-host") && window.OlympusTalentAnalysis', 15000);
    const again = scriptRequests(/analysis\.js/).slice(before);
    const note2 = await cdp.eval(`document.querySelector('main .talents-module-note')?.textContent || ''`);
    const stillHeld = held.length;
    await releaseHeld();
    check('UX-LOAD-001', 'with the first request still stalled, reopening the calculator requests analysis.js at a fresh address and the comparison mounts', stillHeld >= 1 && retried && again.some(u => /analysis\.js\?retry=1$/.test(u)) && !note2, JSON.stringify({ stillHeld, retried, again, note2 }));

    // 3. The level-60 sheet's script never answers: its section says so instead of "Opening…" for good; reopening retries.
    await holdScripts('*/static/talents/stats60.js*');
    await open(cdp, 'member', 'talents', 'document.querySelector("main .talents-stats60-host")');
    await cdp.eval(`(() => { const d = document.querySelector('main .talents-stats60-host'); d.open = true; return true; })()`);
    const statsFailed = await waitFor(cdp, `/could not be loaded/.test(document.querySelector('main .talents-stats60-body [role="alert"]')?.textContent || '')`, 15000);
    const statsText = await cdp.eval(`document.querySelector('main .talents-stats60-body')?.textContent || ''`);
    const beforeStats = scriptRequests(/stats60\.js/).length;
    await cdp.eval(`(() => { const d = document.querySelector('main .talents-stats60-host'); d.open = false; return true; })()`); await sleep(300);
    await cdp.eval(`(() => { const d = document.querySelector('main .talents-stats60-host'); d.open = true; return true; })()`);
    const statsMounted = await waitFor(cdp, `window.OlympusTalentStats60 && !document.querySelector('main .talents-stats60-body [role="alert"]') && !/Opening the level-60 sheet/.test(document.querySelector('main .talents-stats60-body')?.textContent || '')`, 15000);
    const statsAgain = scriptRequests(/stats60\.js/).slice(beforeStats);
    const statsHeld = held.length;
    await releaseHeld();
    check('UX-LOAD-001', 'a stalled level-60 sheet script ends in "could not be loaded" and, with that request still stalled, closing and reopening the section loads it at a fresh address', statsHeld >= 1 && statsFailed && statsMounted && statsAgain.some(u => /stats60\.js\?retry=1$/.test(u)), JSON.stringify({ statsHeld, statsFailed, statsText: statsText.slice(0, 120), statsMounted, statsAgain }));

    // 4. Route disposal: leaving while an optional script is stalled mounts nothing on the next page when the deadline passes.
    await cdp.send('Page.reload', {}); await sleep(1500); // a fresh page script: the modules loaded above are forgotten
    await holdScripts('*/static/talents/guide-builds179.js*');
    await open(cdp, 'member', 'talents', 'document.querySelector("main .member-tool")');
    await cdp.eval(`location.hash = '#/roles'`);
    const errorsBefore = consoleErrors.length;
    await sleep(10000);
    const left = await cdp.eval(`(() => ({ hash: location.hash, tool: !!document.querySelector('main .talents-tool'), stalled: [...document.querySelectorAll('script[src*="guide-builds179.js"]')].length }))()`);
    await releaseHeld();
    check('UX-LOAD-001', 'leaving the calculator while a script is stalled: after the deadline nothing mounts on the next page and the stalled element is gone', left.hash === '#/roles' && !left.tool && left.stalled === 0 && consoleErrors.length === errorsBefore, JSON.stringify({ ...left, errors: consoleErrors.slice(errorsBefore) }));
  }

  if (want('BROWSER-03')) {
    // An event with two yes answers; the admin (its organizer) decides on the event page.
    const opId = ('evg1112r' + Date.now().toString(36) + 'xxxxxxxxxxxxxxxx').slice(0, 22);
    const startsAt = new Date((Math.floor(Date.now() / 1000) + 5 * 86400) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const made = await http('admin', 'POST', '/api/community/events', { opId, title: 'Evergreen roster count check', startsAt, durationMin: 60, capacity: 10 });
    const eventId = made.data && made.data.event && made.data.event.id;
    const answers = [];
    for (const who of ['member', 'officer']) answers.push((await http(who, 'PUT', '/api/community/events/rsvp', { eventId, status: 'yes', revision: 0, character: null, raidRole: null, remindMention: false })).status);
    if (!eventId || answers.some(s => s !== 200)) { check('BROWSER-03', 'the roster fixture (an event with two yes answers) is created', false, `${made.status} ${JSON.stringify(answers)}`); return; }
    const decides = () => cdp.requests.filter(r => r.method === 'POST' && /\/api\/community\/events\/decide$/.test(r.url)).length;
    const route = `community/calendar/${eventId}`;
    // Both visible counts, the RSVP draft and the focus, read in one go.
    const state = `(() => {
      const frames = [...document.querySelectorAll('main section.frame')];
      const who = frames.find(f => f.querySelector('.plaque h1, .plaque h2')?.textContent === 'Who answered');
      const kv = document.querySelector('main .card.event dl.kv');
      const dt = kv && [...kv.querySelectorAll('dt')].find(d => d.textContent === 'Answers');
      const header = dt ? dt.nextElementSibling.textContent : '';
      const panel = who ? (who.querySelector('.plaque > span')?.textContent || '') : '';
      const n = s => { const m = /(\\d+) accepted/.exec(s); return m ? Number(m[1]) : null; };
      const ch = document.querySelector('#f-rsvp-character');
      return { header: n(header), panel: n(panel), draft: ch ? ch.value : null, focus: document.activeElement === ch, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') };
    })()`;
    const rowFor = name => `[...document.querySelectorAll('main section.frame tbody tr')].find(tr => tr.textContent.includes(${JSON.stringify(name)}))`;
    const decide = (name, value) => cdp.eval(`(() => { const tr = ${rowFor(name)}; if (!tr) return false; const s = tr.querySelector('select[aria-label="Roster decision"]'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); [...tr.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); return true; })()`);
    const draft = (value) => cdp.eval(`(() => { const ch = document.querySelector('#f-rsvp-character'); ch.focus(); ch.value = ${JSON.stringify(value)}; ch.dispatchEvent(new Event('input', { bubbles: true })); return document.activeElement === ch; })()`);
    const settled = (expected) => waitFor(cdp, `(() => { const s = ${state}; return s.header === ${expected} && s.panel === ${expected}; })()`, 6000);
    await open(cdp, 'admin', route, `${rowFor('QA Member')}`);

    // Accepted, Bench, Accepted and Clear on one row, with an RSVP draft typed and focused before each Save.
    const steps = [];
    for (const [value, expected] of [['accepted', 1], ['bench', 0], ['accepted', 1], ['', 0]]) {
      await waitFor(cdp, `${rowFor('QA Member')} && !${rowFor('QA Member')}.querySelector('button').disabled`, 6000);
      const text = 'Draft ' + (value || 'clear');
      await draft(text);
      const posts = decides();
      const clicked = await decide('QA Member', value);
      const ok = await settled(expected); await sleep(400);
      const s = await cdp.eval(state);
      steps.push({ value: value || 'clear', clicked, ok, header: s.header, panel: s.panel, posts: decides() - posts, draftKept: s.draft === text, focusKept: s.focus });
    }
    check('BROWSER-03', 'Accepted, Bench, Accepted and Clear: the event header and "Who answered" show the same accepted count after each decision, one POST each, the RSVP draft and focus kept', steps.every(x => x.clicked && x.ok && x.posts === 1 && x.draftKept && x.focusKept), JSON.stringify(steps));

    // Out of order: A's reply is held until B's (newer) reply has been shown; the older count must not come back.
    await open(cdp, 'admin', route, `${rowFor('QA Member')}`);
    await draft('Draft out of order');
    const paused = [];
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/events/decide', requestStage: 'Response' }] });
    cdp.onPaused = p => { paused.push(p); };
    const postsOoo = decides();
    await decide('QA Member', 'accepted');
    await waitFor(cdp, 'true', 10); for (let i = 0; i < 50 && paused.length < 1; i++) await sleep(100);
    await decide('QA Officer', 'accepted');
    for (let i = 0; i < 50 && paused.length < 2; i++) await sleep(100);
    const replies = [];
    for (const p of paused) { const b = await cdp.send('Fetch.getResponseBody', { requestId: p.requestId }).catch(() => null); try { replies.push(JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString() : b.body).event.counts.accepted); } catch { replies.push(null); } }
    if (paused[1]) await cdp.send('Fetch.continueRequest', { requestId: paused[1].requestId });
    await sleep(900);
    if (paused[0]) await cdp.send('Fetch.continueRequest', { requestId: paused[0].requestId });
    await sleep(1200);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const ooo = await cdp.eval(state);
    check('BROWSER-03', 'out-of-order decide replies (the newer one first): both counts end on the newer accepted count, two POSTs, the draft kept', paused.length === 2 && replies[0] === 1 && replies[1] === 2 && ooo.header === 2 && ooo.panel === 2 && decides() - postsOoo === 2 && ooo.draft === 'Draft out of order', JSON.stringify({ held: paused.length, replies, ...ooo, posts: decides() - postsOoo }));

    // A lost reply (bare 500) re-reads: the stored decision shows in both counts, nothing is sent again.
    await open(cdp, 'admin', route, `${rowFor('QA Officer')}`);
    await draft('Draft lost');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/events/decide', requestStage: 'Response' }] });
    cdp.onPaused = p => bare500(cdp, p);
    const postsLost = decides();
    await decide('QA Officer', 'bench');
    const lostOk = await settled(1); await sleep(600);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const lost = await cdp.eval(state);
    check('BROWSER-03', 'a lost decide reply re-reads the event: both counts show the stored decision, no second POST, the draft kept', lostOk && lost.header === 1 && lost.panel === 1 && decides() - postsLost === 1 && lost.draft === 'Draft lost', JSON.stringify({ ...lost, posts: decides() - postsLost }));

    // A readable receipt without its event re-reads the counts instead of leaving the header stale.
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/events/decide', requestStage: 'Response' }] });
    cdp.onPaused = p => rewriteJson(cdp, p, json => { json.event = null; });
    const reads = () => cdp.requests.filter(r => r.method === 'GET' && /\/api\/community\/event\?id=/.test(r.url)).length;
    const postsBare = decides(), readsBare = reads();
    await waitFor(cdp, `${rowFor('QA Officer')} && !${rowFor('QA Officer')}.querySelector('button').disabled`, 6000);
    await draft('Draft recount');
    await decide('QA Officer', 'accepted');
    const bareOk = await settled(2); await sleep(600);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const bare = await cdp.eval(state);
    check('BROWSER-03', 'a receipt with no event re-reads the counts once: both show 2, one POST, the draft and focus kept', bareOk && bare.header === 2 && bare.panel === 2 && decides() - postsBare === 1 && reads() - readsBare >= 1 && bare.draft === 'Draft recount' && bare.focus, JSON.stringify({ ...bare, posts: decides() - postsBare, reads: reads() - readsBare }));

    // ... and when that count re-read fails too, the panel says the counts could not be re-read instead of implying they are current.
    await waitFor(cdp, `${rowFor('QA Officer')} && !${rowFor('QA Officer')}.querySelector('button').disabled`, 6000);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/events/decide', requestStage: 'Response' }, { urlPattern: `*/api/community/event?id=${eventId}`, requestStage: 'Request' }] });
    cdp.onPaused = p => /\/decide$/.test(p.request.url) ? rewriteJson(cdp, p, json => { json.event = null; }) : bare500(cdp, p);
    const postsFail = decides();
    await decide('QA Officer', 'bench');
    const failSaid = await waitFor(cdp, `/The answer counts could not be re-read\\. Reload the page/.test(document.querySelector('main')?.textContent || '')`, 6000);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const failState = await cdp.eval(state);
    check('BROWSER-03', 'a receipt with no event whose count re-read also fails says the counts could not be re-read; one POST, the draft kept', failSaid && decides() - postsFail === 1 && failState.draft === 'Draft recount', JSON.stringify({ failSaid, ...failState, posts: decides() - postsFail }));

    // Disposal: the reply arrives after the officer left the event; nothing on the next page changes, nothing is said.
    await open(cdp, 'admin', route, `${rowFor('QA Member')}`);
    const heldReply = [];
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/community/events/decide', requestStage: 'Response' }] });
    cdp.onPaused = p => { heldReply.push(p); };
    await decide('QA Member', 'bench');
    for (let i = 0; i < 50 && !heldReply.length; i++) await sleep(100);
    await cdp.eval(`(() => { window.__oldCard = document.querySelector('main .card.event'); location.hash = '#/community/calendar'; return true; })()`);
    await waitFor(cdp, `[...document.querySelectorAll('main h1, main h2')].some(h => h.textContent === 'Calendar')`, 6000); await sleep(600);
    const errorsBefore = consoleErrors.length;
    const beforeRelease = await cdp.eval(`document.querySelector('main')?.innerHTML.length || 0`);
    if (heldReply[0]) await cdp.send('Fetch.continueRequest', { requestId: heldReply[0].requestId });
    await sleep(1500);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const after = await cdp.eval(`(() => ({ hash: location.hash, html: document.querySelector('main')?.innerHTML.length || 0, headerCards: [...document.querySelectorAll('main .card.event h3')].filter(h => !h.querySelector('a')).length, oldCardStillDetached: !!window.__oldCard && !window.__oldCard.isConnected, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).filter(t => /Roster/.test(t)).length }))()`);
    check('BROWSER-03', 'a decide reply after the officer left the event changes nothing on the calendar page and says nothing', heldReply.length === 1 && after.hash === '#/community/calendar' && after.html === beforeRelease && after.headerCards === 0 && after.oldCardStillDetached && after.toast === 0 && consoleErrors.length === errorsBefore, JSON.stringify({ held: heldReply.length, before: beforeRelease, ...after, errors: consoleErrors.slice(errorsBefore) }));
  }
}

/** Answer a paused (Response stage) HTML document with edit(html) applied. */
async function rewriteText(cdp, p, edit) {
  if (p.responseStatusCode !== 200) return cdp.send('Fetch.continueRequest', { requestId: p.requestId });
  const got = await cdp.send('Fetch.getResponseBody', { requestId: p.requestId });
  const raw = got.base64Encoded ? Buffer.from(got.body, 'base64').toString('utf8') : got.body;
  return cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: (p.responseHeaders || []).filter(h => !/^content-(length|encoding)$/i.test(h.name)), body: Buffer.from(edit(raw)).toString('base64') });
}

/** Stage 2 round 3 (12 Nov 2026): items RC-097, RC-017, the name-entry leftovers and the Treasury refusal badge. */
async function round3Checks(cdp) {
  const want = id => !only || only.has(id);
  // Focus events fire in a headless page only with focus emulation; the focus memory (CL2-097) listens to focusin.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  try { await round3Inner(cdp, want); } finally { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); }
}
async function round3Inner(cdp, want) {
  if (want('RC-097')) {
    // The Treasury plan's suspend-and-reverify: at expiry the plan is detached while access is read again. The access read is
    // held, so the waiting state can be measured; then it is answered and the plan's own restore must put focus back.
    const outcome = {};
    for (const mode of ['admit', 'refuse']) {
      await open(cdp, 'admin', 'treasury-plan', '[...document.querySelectorAll("main h1, main h2")].some(h => /Treasury/.test(h.textContent))');
      await sleep(1500);
      const focused = await cdp.eval(`(() => { const el = [...document.querySelectorAll('main a[href], main button, main summary')].find(e => e.getClientRects().length && !e.disabled); if (!el) return null; window.__planFocus = el; el.focus(); return document.activeElement === el ? el.tagName + ' ' + el.textContent.trim().slice(0, 40) : null; })()`);
      const paused = [];
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/treasury-plan/access*', requestStage: 'Response' }] });
      cdp.onPaused = p => { paused.push(p); };
      await cdp.eval(`(() => { if (!window.__realNow) window.__realNow = Date.now.bind(Date); Date.now = () => window.__realNow() + 61000; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
      for (let i = 0; i < 50 && !paused.length; i++) await sleep(100);
      await sleep(300);
      const during = await cdp.eval(`({ active: document.activeElement === document.body ? 'BODY' : document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : ''), waiting: /Opening the treasury programme/.test(document.querySelector('main').textContent), detached: !window.__planFocus.isConnected })`);
      for (const p of paused) {
        if (mode === 'admit') await cdp.send('Fetch.continueRequest', { requestId: p.requestId });
        else await rewriteJson(cdp, p, json => { json.canRead = false; json.admits = 'The treasury programme and financial model are open to the holders of the published Co-Guild Master and Lord High Treasurer seats and to site administrators.'; });
      }
      await sleep(1500);
      cdp.onPaused = null; await cdp.send('Fetch.disable');
      const after = await cdp.eval(`({ same: document.activeElement === window.__planFocus, connected: window.__planFocus.isConnected, active: document.activeElement === document.body ? 'BODY' : document.activeElement.tagName + ' ' + (document.activeElement.textContent || '').trim().slice(0, 30), inMain: document.querySelector('main').contains(document.activeElement), refused: /open to the holders of the published Co-Guild Master/.test(document.querySelector('main').textContent) })`);
      await cdp.eval(`(() => { if (window.__realNow) Date.now = window.__realNow; return true; })()`);
      outcome[mode] = { focused, held: paused.length, during, after };
    }
    const a = outcome.admit, r = outcome.refuse;
    check('RC-097', 'Treasury plan re-verification: while the access read is held the global restore leaves focus alone, and afterwards the plan\'s own restore returns focus to the same control',
      !!a.focused && a.held >= 1 && a.during.waiting && a.during.detached && a.during.active === 'BODY' && a.after.connected && a.after.same, JSON.stringify(a));
    check('RC-097', 'when the re-verification refuses, the released control does not leave focus on the body: it lands in the refusal page', !!r.focused && r.held >= 1 && r.after.refused && !r.after.connected && r.after.active !== 'BODY' && r.after.inMain, JSON.stringify(r));
  }

  if (want('RC-017')) {
    // A bare 500 on POST /api/me/verification (the outcome is unknown: a code may have been issued) must not invite a retry.
    let posts = 0;
    await open(cdp, 'member', 'verify', 'document.querySelector("main form input")');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/me/verification', requestStage: 'Request' }] });
    cdp.onPaused = p => { posts++; return bare500(cdp, p); };
    await cdp.eval(`(() => { const i = document.querySelector('main form input'); i.value = 'Fern Melder'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('main form button[type="submit"]').click(); return true; })()`);
    // The result line is the p.err inside the form's status region (the field's own error span is also .err).
    await waitFor(cdp, 'document.querySelector("main form [role=status] p.err")', 6000);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const said = await cdp.eval(`document.querySelector('main form [role=status] p.err')?.textContent || ''`);
    check('RC-017', 'a bare 500 on the verification request says the outcome is unknown and asks for a status check, with no "Try again"', posts === 1 && /not known whether a code was issued/.test(said) && /before asking again/.test(said) && !/try again/i.test(said), `posts=${posts} :: ${said}`);
  }

  if (want('ROUND3-9')) {
    // The signed-out Home (the boot rewritten to signed out) and the "Your seat" card no longer offer to record names.
    await open(cdp, 'member', '', 'document.querySelector("main")');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: URL0 + '/*', resourceType: 'Document', requestStage: 'Response' }] });
    let rewritten = 0;
    cdp.onPaused = p => rewriteText(cdp, p, html => { if (html.includes('"signedIn":true')) rewritten++; return html.replace('"signedIn":true', '"signedIn":false'); });
    await cdp.send('Page.reload', {}); await waitFor(cdp, '[...document.querySelectorAll("main h3")].some(h => h.textContent === "Your seat")', 8000); await sleep(500);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const out = await cdp.eval(`(() => { const lead = document.querySelector('main .hero .lead')?.textContent || ''; const seat = [...document.querySelectorAll('main .card')].find(c => c.querySelector('h3')?.textContent === 'Your seat'); return { lead, seat: seat ? seat.querySelector('p').textContent : null }; })()`);
    check('ROUND3-9', 'signed-out Home: the hero and the "Your seat" card no longer say members can record or add the names they reserved', rewritten >= 1 && !!out.lead && !/names you have reserved|record the names/.test(out.lead) && out.seat === 'Add the friends joining with you.', JSON.stringify({ rewritten, ...out }));
    // A member with no recorded names: the Reserved names card.
    await open(cdp, 'member', '', 'document.querySelector("#names-count")');
    const card = await cdp.eval(`(() => { const c = document.querySelector('#names-count'); return c ? { big: c.textContent, small: c.nextElementSibling ? c.nextElementSibling.textContent : null } : null; })()`);
    check('ROUND3-9', 'a member with no recorded names sees "No names recorded.", not "0 names saved" or "View the names you saved."', !!card && card.small === 'No names recorded.' && !/0 names saved/.test(card.big) && card.big === 'None', JSON.stringify(card));
  }

  if (want('ROUND3-10')) {
    // The refusal's badge must not claim officers when the gate description admits appointments and administrators only.
    await open(cdp, 'member', 'treasury-plan', '[...document.querySelectorAll("main h1, main h2")].some(h => /Treasury programme/.test(h.textContent))');
    await sleep(800);
    const ans = await http('member', 'GET', '/api/treasury-plan/access');
    const page = await cdp.eval(`(() => { const f = [...document.querySelectorAll('main section.frame')].find(s => /Treasury programme/.test(s.textContent)); return f ? { badge: f.querySelector('.badge')?.textContent || '', text: f.textContent } : null; })()`);
    const twoPaths = ans.data && typeof ans.data.admits === 'string' && !/\brank\b|\bDiscord\b/.test(ans.data.admits);
    check('ROUND3-10', 'the refusal shows the two-path sentence without "open to: A; and B." and its badge does not say "Officers and above"', !!page && twoPaths && page.text.includes(ans.data.admits) && !/open to: [^.]*; and/.test(ans.data.admits) && page.badge !== 'Officers and above', JSON.stringify({ admits: ans.data && ans.data.admits, badge: page && page.badge }));
  }
}

/** Stage 2 round 4 (13 Nov 2026): a write whose answer is lost after the Worker processed it. */
async function round4Checks(cdp) {
  const want = id => !only || only.has(id);
  // Each flow: the request reaches the Worker, the Worker answers, and the answer is dropped (ConnectionReset) before the page
  // reads it. The page must say the outcome is unknown and must not invite a retry or blame the connection.
  const lostAfterProcessing = async (pattern, act, readout) => {
    const seen = [];
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: pattern, requestStage: 'Response' }] });
    cdp.onPaused = p => { seen.push({ method: p.request.method, status: p.responseStatusCode }); return cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionReset' }); };
    try {
      await cdp.eval(act);
      for (let i = 0; i < 60 && !seen.length; i++) await sleep(100);
      await sleep(900);
    } finally { cdp.onPaused = null; await cdp.send('Fetch.disable'); }
    return { seen, said: await cdp.eval(readout) };
  };
  const unknownWords = s => /not known whether/.test(s) && /[Rr]eload|[Cc]heck/.test(s) && !/try again|check your connection|could not be reached/i.test(s);
  const toasts = `[...document.querySelectorAll('.toast.bad span')].map(s => s.textContent).join(' | ')`;
  if (want('R4-1')) {
    await open(cdp, 'member', 'verify', 'document.querySelector("main form input")');
    const v = await lostAfterProcessing('*/api/me/verification',
      `(() => { const i = document.querySelector('main form input'); i.value = 'Fern Melder'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('main form button[type="submit"]').click(); return true; })()`,
      `document.querySelector('main form [role=status] p.err')?.textContent || ''`);
    check('R4-1', '/#/verify: the verification answer lost after the Worker answered says the outcome is unknown, with no retry or connection advice', v.seen.length === 1 && v.seen[0].method === 'POST' && v.seen[0].status === 200 && unknownWords(v.said), JSON.stringify(v));

    await open(cdp, 'member', 'vote', '[...document.querySelectorAll("main button")].some(b => b.textContent === "Save nominations" && !b.disabled)');
    const n = await lostAfterProcessing('*/api/votes',
      `(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); const b = [...document.querySelectorAll('main button')].find(x => x.textContent === 'Save nominations' && !x.disabled); if (!b) return false; b.click(); return true; })()`, toasts);
    check('R4-1', '/#/vote: Save nominations with its answer lost after the Worker answered says the outcome is unknown, with no retry or connection advice', n.seen.length === 1 && n.seen[0].method === 'PUT' && n.seen[0].status === 200 && unknownWords(n.said), JSON.stringify(n));

    await open(cdp, 'member', '', '[...document.querySelectorAll("main button")].some(b => b.textContent === "Save friends")');
    const f = await lostAfterProcessing('*/api/friends',
      `(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); [...document.querySelectorAll('main button')].find(x => x.textContent === 'Save friends').click(); return true; })()`, toasts);
    check('R4-1', 'Home: Save friends with its answer lost after the Worker answered says the outcome is unknown, with no retry or connection advice', f.seen.length === 1 && f.seen[0].method === 'PUT' && f.seen[0].status === 200 && unknownWords(f.said), JSON.stringify(f));

    // Control: a lost READ still invites a retry, and a refusal the Worker did answer keeps its own words.
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/news', requestStage: 'Request' }] });
    cdp.onPaused = p => cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionReset' });
    await open(cdp, 'member', 'news', 'document.querySelector("main .notice-box")');
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const readSaid = await cdp.eval(`document.querySelector('main .notice-box')?.textContent || ''`);
    check('R4-1', 'control: a lost read (the news list) still says the site could not be reached and offers Try again', /could not be reached/.test(readSaid) && /Try again/.test(readSaid), readSaid.slice(0, 200));
    await open(cdp, 'member', '', '[...document.querySelectorAll("main button")].some(b => b.textContent === "Save friends")');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/friends', requestStage: 'Request' }] });
    cdp.onPaused = p => cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 400, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'invalid', message: 'Synthetic refusal from the Worker.' })).toString('base64') });
    await cdp.eval(`(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); [...document.querySelectorAll('main button')].find(x => x.textContent === 'Save friends').click(); return true; })()`);
    await sleep(1200);
    cdp.onPaused = null; await cdp.send('Fetch.disable');
    const refusal = await cdp.eval(toasts);
    check('R4-1', 'control: a refusal the Worker answered with a message still shows that message', refusal === 'Synthetic refusal from the Worker.', refusal);
  }
  if (want('R4-2')) {
    // The Apply section H2s share one size, smaller than the page H1, at desktop and phone widths.
    const sizes = {};
    for (const width of [1280, 375]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await open(cdp, 'member', 'apply', 'document.querySelector("section.field[data-field=talentBuilds] > h2")');
      sizes[width] = await cdp.eval(`(() => { const px = el => parseFloat(getComputedStyle(el).fontSize); const h1 = document.querySelector('main h1'); const talent = document.querySelector('section.field[data-field=talentBuilds] > h2'); const siblings = [...document.querySelectorAll('main .section-title h2')].map(px); return { h1: h1 && px(h1), talent: talent && px(talent), siblings: [...new Set(siblings)] }; })()`);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    check('R4-2', '/#/apply at 1280 and 375 px: "Character talent builds (optional)" has the section-title size of its sibling H2s, below the H1', Object.values(sizes).every(s => s.talent && s.siblings.length === 1 && s.talent === s.siblings[0] && s.talent < s.h1), JSON.stringify(sizes));
  }
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
  // REV-SITEA-1 (12 Nov 2026): the read-failure "Try again" (CL2-017) is a 44 px target at phone and desktop widths.
  const retrySizes = {};
  for (const width of [1280, 390, 375, 320]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/news', requestStage: 'Request' }] });
    cdp.onPaused = p => bare500(cdp, p);
    await open(cdp, 'member', 'news', 'document.querySelector("main .notice-box button")');
    await cdp.send('Fetch.disable'); cdp.onPaused = null;
    retrySizes[width] = await cdp.eval(`(() => { const b = [...document.querySelectorAll('main .notice-box button')].find(x => x.textContent === 'Try again'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
  }
  check('REV-SITEA-1', 'the read-failure "Try again" button is at least 44x44 px at 1280, 390, 375 and 320 px', Object.values(retrySizes).every(s => s && s.h >= 44 && s.w >= 44 && s.overflow <= 0), JSON.stringify(retrySizes));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
}

(async () => {
  console.log(`evergreen1112 siteui-a against ${URL0}; static source ${SOURCE}`);
  // --followup-only runs just the follow-up browser checks (UX-LOAD-001, BROWSER-03); the full run includes them.
  // --round3-only runs just the round 3 browser checks (RC-097, RC-017, ROUND3-9, ROUND3-10) and the unit checks.
  const round3Only = process.argv.includes('--round3-only');
  // --round4-only runs just the round 4 browser checks (R4-1 and the items added after it).
  if (process.argv.includes('--round4-only')) {
    const cdp = await launchEdge(CDP_PORT, args.profile || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-siteui-a-')));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    try { await round4Checks(cdp); } finally { await cdp.close(); }
    console.log(`RESULT ${results.length - failures}/${results.length} passed`);
    process.exitCode = failures ? 1 : 0;
    return;
  }
  if (round3Only) {
    await unitChecks();
    const cdp = await launchEdge(CDP_PORT, args.profile || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-siteui-a-')));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    try { await round3Checks(cdp); } finally { await cdp.close(); }
    console.log(`RESULT ${results.length - failures}/${results.length} passed`);
    process.exitCode = failures ? 1 : 0;
    return;
  }
  const followupOnly = process.argv.includes('--followup-only');
  if (!followupOnly) await unitChecks();
  if (process.argv.includes('--unit-only')) { console.log(`RESULT ${results.length - failures}/${results.length} passed`); process.exitCode = failures ? 1 : 0; return; }
  if (!followupOnly) { await serverChecks(); staticChecks(); }
  if (CDP_PORT) {
    const profile = args.profile || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'evg1112-siteui-a-'));
    const cdp = await launchEdge(CDP_PORT, profile);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    try { if (!followupOnly) { await pageChecks(cdp); await reviewChecks(cdp); } await followupChecks(cdp); if (!followupOnly) { await round3Checks(cdp); await round4Checks(cdp); } if (!args['no-layout'] && !followupOnly) await layoutChecks(cdp); } finally { await cdp.close(); }
  }
  console.log(`RESULT ${results.length - failures}/${results.length} passed`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results, null, 1));
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });

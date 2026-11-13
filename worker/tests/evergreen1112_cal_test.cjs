'use strict';
// Evergreen 12 Nov 2026, round 5, area cal: the owner's calendar rulings of 13 November 2026 (about 12:15 UTC).
//   "Officers may create, edit, reschedule, update RSVP/roster notes, and cancel/archive their own calendar events (and
//    manage RSVPs on their own events), while only High Council / Admin / War Heads can modify or delete another
//    officer's event."  and  "Yes—Raid Leaders (Rank 5 / Slot 4) count as officers for calendar event creation and management."
//
// Part 1 always runs: the real src/*.ts of --source (transpiled by TypeScript) against the real schema in node:sqlite,
// with a synthetic clock and a fake Discord (no network), configured like production (canonical rank roles on).
// Part 2 runs with --url (a local QA harness serving --source) and --cdp (a headless Edge): the page at six widths.
// Each check prints PASS or FAIL; the exit code is the number of failures, so the same file run with --source pointing
// at the base (b631136) lists what was missing there.
//
//   node tests/evergreen1112_cal_test.cjs [--source <worktree>] [--counts <file.json>] [--url http://127.0.0.1:63681 --cdp 63682 --profile <dir> --report <file.json>] [--only page]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => (arg.startsWith('--') ? [...out, [arg.slice(2), all[i + 1]]] : out), []));
const SOURCE = path.resolve(args.source || path.join(__dirname, '..', '..'));
const ROOT = path.join(SOURCE, 'worker');
const URL0 = args.url || '';
const CDP_PORT = Number(args.cdp || 0);
let failures = 0;
const check = (id, label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail && !ok ? ' :: ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- the real Worker in process
// --source may be an extracted tree without node_modules (a fail-before copy): TypeScript then comes from this test's own tree.
const TS_PATH = fs.existsSync(path.join(ROOT, 'node_modules', 'typescript')) ? path.join(ROOT, 'node_modules', 'typescript') : path.join(__dirname, '..', 'node_modules', 'typescript');
process.env.PRIVACY129_TYPESCRIPT = process.env.PRIVACY129_TYPESCRIPT || TS_PATH;
const ts = require(TS_PATH);
const entry = require(path.join(ROOT, 'tests', 'helpers', 'privacy129_fixture.cjs'));
const { DatabaseSync } = require('node:sqlite');
let T = Date.parse('2026-11-13T12:00:00Z') / 1000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [T * 1000])); }
  static now() { return T * 1000; }
};
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = {};
function load(name) {
  if (name === 'node:async_hooks' || name === './node:async_hooks') return require('node:async_hooks');
  const file = path.join(ROOT, 'src', name.replace(/^\.\//, '') + '.ts');
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} };
  cache[file] = mod;
  new Function('module', 'exports', 'require', transpile(file))(mod, mod.exports, p => load(p));
  return mod.exports;
}

// Production role ids (wrangler.toml [vars], CANONICAL_RANKS233): Guild Master, High Council, Officer, Officer Alt, Raid Leader, Member.
const GUILD = '236932545793490944', RAID_CHANNEL = '1554266022444408872', APP_ID = '1550176895671341076';
const GM_ROLE = '1554261979684933742', HC_ROLE = '1567917738985398384', OFFICER_ROLE = '1554262223038324840', OALT_ROLE = '1561096070040125460', RL_ROLE = '1554262510650007602', MEMBER_ROLE = '1552077551839617104';
const id = n => '3100000000000000' + String(n).padStart(2, '0');
// The actors of the matrix: [key, Discord roles, roster slot (null: not on the roster), appointment]
const ACTORS = [
  ['admin', [MEMBER_ROLE], 0, null], ['gm', [MEMBER_ROLE, GM_ROLE], 0, null], ['hc', [MEMBER_ROLE, HC_ROLE], 1, null],
  ['wh94', [MEMBER_ROLE], 8, 'office_94'], ['wh97', [MEMBER_ROLE], 8, 'office_97'], ['wh98', [MEMBER_ROLE], 8, 'office_98'],
  ['officer', [MEMBER_ROLE, OFFICER_ROLE], 2, null], ['raidleader', [MEMBER_ROLE, RL_ROLE], 4, null], ['officeralt', [MEMBER_ROLE, OALT_ROLE], 3, null],
  ['member', [MEMBER_ROLE], 8, null], ['organizer', [MEMBER_ROLE], 8, null],
];
const ACC = {};
ACTORS.forEach(([key, roles, slot, office], i) => { ACC[key] = { key, id: id(10 + i), roles: [...roles], slot, office }; });
ACC.creator = { key: 'creator', id: id(40), roles: [MEMBER_ROLE, OFFICER_ROLE], slot: 2, office: null }; // "another officer"
for (let i = 0; i < 4; i++) ACC['signer' + i] = { key: 'signer' + i, id: id(50 + i), roles: [MEMBER_ROLE], slot: 8, office: null };
const byId = new Map(Object.values(ACC).map(a => [a.id, a]));
const users = new Map(Object.values(ACC).map(a => [a.id, { id: a.id, username: 'cal.' + a.key, global_name: 'Cal ' + a.key, avatar: null }]));
const failing = new Set(); // accounts whose member read fails at the provider (HTTP 500)
let memberReads = 0;
const member = uid => ({ user: users.get(uid), nick: null, avatar: null, joined_at: '2024-01-15T12:00:00.000Z', roles: [...(byId.get(uid)?.roles || [])], pending: false });
const posted = [];
// Round 5 follow-up: the bot's message effects (POST, PATCH, DELETE) and every bot call, for the delivery checks.
const effects = [], messages = new Map();
let botCalls = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), p = u.pathname.replace(/^\/api\/v10/, ''), m = init.method || 'GET';
  const auth = new Headers(init.headers).get('Authorization') || '';
  const res = (status, obj) => new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  if (m === 'POST' && p === '/oauth2/token') return res(200, { access_token: 'tok-' + new URLSearchParams(init.body).get('code').slice(5), token_type: 'Bearer' });
  if (auth.startsWith('Bearer ')) {
    const uid = auth.slice(7).replace(/^tok-/, '');
    if (p === '/users/@me') return users.has(uid) ? res(200, users.get(uid)) : res(401, {});
    if (p === `/users/@me/guilds/${GUILD}/member`) return users.has(uid) ? res(200, member(uid)) : res(404, { code: 10004 });
    return res(404, {});
  }
  let x;
  if (auth.startsWith('Bot ')) botCalls++;
  if (auth.startsWith('Bot ') && (x = p.match(new RegExp(`^/channels/${RAID_CHANNEL}/messages/(\\d+)$`)))) {
    if (m !== 'GET') effects.push({ method: m, path: p });
    const msg = messages.get(x[1]);
    if (m === 'GET') return msg ? res(200, msg) : res(404, { code: 10008 });
    if (m === 'DELETE') { if (!msg) return res(404, { code: 10008 }); messages.delete(x[1]); return new Response(null, { status: 204 }); }
    if (m === 'PATCH' && msg) { const b = JSON.parse(init.body); Object.assign(msg, { content: b.content, components: b.components }); return res(200, msg); }
    return res(404, { code: 10008 });
  }
  if ((x = p.match(/^\/guilds\/(\d+)\/members\/(\d+)$/)) && m === 'GET') { memberReads++; if (failing.has(x[2])) return res(500, { message: 'synthetic outage' }); return users.has(x[2]) ? res(200, member(x[2])) : res(404, { code: 10007 }); }
  if (auth.startsWith('Bot ') && m === 'GET' && p === '/users/@me') return res(200, { id: APP_ID, username: 'olympus', bot: true });
  if (auth.startsWith('Bot ') && m === 'GET' && p === `/channels/${RAID_CHANNEL}`) return res(200, { id: RAID_CHANNEL, guild_id: GUILD, type: 0 });
  if (auth.startsWith('Bot ') && m === 'POST' && p === `/channels/${RAID_CHANNEL}/messages`) {
    const b = JSON.parse(init.body), msg = { id: String(1570000000000000000n + BigInt(posted.length + 1)), channel_id: RAID_CHANNEL, author: { id: APP_ID, bot: true }, content: b.content, components: b.components, embeds: [], attachments: [], type: 0, nonce: b.nonce, mention_everyone: false, mention_roles: [], mentions: [] };
    posted.push(msg); effects.push({ method: m, path: p }); messages.set(msg.id, msg); return res(200, msg);
  }
  return res(404, { code: 0 });
};
// Round 5 follow-up 2: a hook before each bot or member call (to change a fact between provider awaits) and a lost POST
// answer (Discord posted, the Worker never learned it), wrapped around the fake Discord above.
let beforeFetch = null, losePost = false;
{
  const fakeDiscord = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const p = new URL(url).pathname.replace(/^\/api\/v10/, ''), m = init.method || 'GET';
    if (beforeFetch && !String(new Headers(init.headers).get('Authorization') || '').startsWith('Bearer ')) beforeFetch(m, p);
    const r = await fakeDiscord(url, init);
    if (losePost && m === 'POST' && p === `/channels/${RAID_CHANNEL}/messages`) { losePost = false; return new Response(JSON.stringify({ message: 'lost' }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    return r;
  };
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.function('strftime', (format, value) => { if (format !== '%s' || value !== 'now') throw Error('unexpected clock input'); return String(T); });
entry.installCurrentEntryEpoch(db, { now: T });
let statements = 0, beforeRead = null, maxBinds = 0;
const port = entry.originalNativePort(db, { statement: (sql, params) => { statements++; maxBinds = Math.max(maxBinds, (params || []).length); if (beforeRead) beforeRead(sql, params); } });
const canonical = load('./canonical-ranks233');
const POLICY = JSON.stringify({ version: 1, enabled: true, profile: canonical.CANONICAL_PROFILE233, guildId: canonical.CANONICAL_GUILD233, ranks: canonical.CANONICAL_RANKS233.map(r => ({ ...r, permissions: '0' })) });
const rawEnv = () => entry.currentEntryEnvironment({
  DB: port, GUILD_ID: GUILD, DISCORD_APP_ID: APP_ID, DISCORD_CLIENT_SECRET: 'client-secret',
  DISCORD_BOT_TOKEN: 'bot-token', DISCORD_PUBLIC_KEY: '00', COOKIE_SECRET: 'cookie-secret-for-tests-only-0123456789',
  VERIFY_SECRET: 'verify-secret-for-tests', WATCHER_TOKEN: 'watcher-token-for-tests-only-0123456789', PUBLIC_BASE_URL: 'https://verify.example',
  SITE_HOST: 'guild.example', SITE_GUILD_ID: GUILD, SITE_ADMINS: ACC.admin.id, SITE_JOIN_URL: 'https://discord.gg/example', INTROS_GUILD_ID: GUILD,
  INTROS_ROLES: '', INTROS_CHANNELS: 'raid-signups=' + RAID_CHANNEL, ADMISSION_MODE: 'auto', SET_GUILD_NOTE: 'false', QUEUE_CLAIM_LIMIT: '25', QUEUE_CLAIM_TTL_MINUTES: '15',
  ROSTER_MIN_MEMBERS: '0', ROSTER_MAX_SHRINK_PCT: '100', CHANNEL_SERVER_LOG: '', CHANNEL_NOTICES: '',
  COMMUNITY_FEATURES: 'events,attendance', EVENT_DISCORD_DELIVERY: 'on', COMMUNITY_ORGANIZERS: ACC.organizer.id,
  ROLE_GUILD_MEMBER: MEMBER_ROLE, ROLE_OFFICER: OFFICER_ROLE, ROLE_GUILD_LEADER: GM_ROLE, ROLE_GUILD_MASTER: GM_ROLE, ROLE_RAID_LEADER: RL_ROLE, ROLE_MODERATOR: '',
  CANONICAL_RANKS233: POLICY,
});
const waits = [];
const wctx = { waitUntil: p => waits.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (waits.length) await waits.shift(); };
const jar = new Map();
const cookieOf = (res, name) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (kv.slice(0, i) === name) return kv.slice(i + 1); } return null; };
let index;
/** One request; `cost` is what it cost: Discord member reads and executed D1 statements. */
async function call(method, pathname, { who, body } = {}) {
  const h = new Headers();
  if (who && jar.has(who)) h.set('Cookie', jar.get(who));
  if (method !== 'GET') { h.set('X-Olympus', '2'); h.set('Origin', 'https://guild.example'); }
  if (body !== undefined) h.set('Content-Type', 'application/json');
  const reads0 = memberReads, statements0 = statements;
  maxBinds = 0;
  const res = await index.fetch(new Request('https://guild.example' + pathname, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), rawEnv(), wctx);
  await settle();
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { status: res.status, data, cost: { provider: memberReads - reads0, statements: statements - statements0, maxBinds } };
}
async function signIn(uid) {
  const start = await index.fetch(new Request('https://guild.example/auth/login'), rawEnv(), wctx);
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const res = await index.fetch(new Request(`https://guild.example/auth/callback?code=code-${uid}&state=${encodeURIComponent(state)}`, { headers: { Cookie: `__Host-olg_state=${cookieOf(start, '__Host-olg_state')}` } }), rawEnv(), wctx);
  await settle();
  const c = cookieOf(res, '__Host-olg');
  if (!c) throw Error('sign-in failed for ' + uid + ': ' + res.status);
  jar.set(uid, `__Host-olg=${c}`);
}
const testWriter = () => load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(port, 'writer', 'canonical', entry.ENTRY_EPOCH);
const write = (sql, ...p) => testWriter().prepare(sql).bind(...p).run();
const confirm = async (uid, name) => { await write('INSERT OR IGNORE INTO members(discord_id) VALUES(?)', uid); return write("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)", name.toLowerCase(), name, uid, T); };
const opId = () => crypto.randomBytes(16).toString('base64url');
const iso = s => new Date(s * 1000).toISOString();
const ev = eid => db.prepare('SELECT title,starts_at,status,revision,created_by,attendance_generation,signup_generation FROM community_events WHERE id=?').get(eid);
const snapshot = eid => JSON.stringify({
  e: db.prepare('SELECT title,details,starts_at,duration_min,capacity,status,revision,nonce,attendance_nonce,attendance_generation,signup_generation,created_by FROM community_events WHERE id=?').get(eid),
  c: db.prepare('SELECT action,actor,at,fields FROM community_event_changes WHERE event_id=? ORDER BY id').all(eid),
  a: db.prepare('SELECT discord_id,state,revision FROM community_event_attendance WHERE event_id=? ORDER BY discord_id').all(eid),
  s: db.prepare('SELECT discord_id,decision,decision_revision FROM community_event_signups WHERE event_id=? ORDER BY discord_id').all(eid),
  audit: db.prepare('SELECT COUNT(*) AS n FROM audit WHERE subject=?').get(eid).n,
});
const counts = { base: SOURCE };

async function part1() {
  index = load('./index').default;
  for (const a of Object.values(ACC)) { await signIn(a.id); await confirm(a.id, 'Cal' + a.key.replace(/[^a-z]/g, '') + String.fromCharCode(97 + Number(a.id.slice(-2)) % 26)); }
  // The newest complete, trusted roster export ranks each roster-confirmed character in its slot (the display hint).
  await write("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,trusted,complete,first_received_at) VALUES(1,?,?,'addon',?,1,1,?)", T - 600, T - 600, Object.keys(ACC).length, T - 600);
  const NAMES = ['Guild Master', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
  for (const a of Object.values(ACC)) {
    const c = db.prepare('SELECT name_key,name FROM characters WHERE discord_id=?').get(a.id);
    const slot = a.slot ?? 8;
    await write('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,level,class) VALUES(1,?,?,?,?,60,?)', c.name_key, c.name, NAMES[slot === 8 ? 7 : slot], slot === 8 ? 7 : slot, 'WARRIOR');
  }
  const appointed = Object.fromEntries(Object.values(ACC).filter(a => a.office).map(a => [a.office, `<@${a.id}>`]));
  let r = await call('PUT', '/api/admin/settings', { who: ACC.admin.id, body: { appointed, appointedCharactersConfirmed: true, namesConfirmed: true } });
  check('setup', 'the admin publishes the three War Head appointments (office_94, office_97, office_98)', r.status === 200, r);

  console.log('== the role facts: one Discord read, the unchanged officer predicate, High Council = slots 0 and 1 ==');
  {
    const authority = load('./guild-command-authority219');
    const env = rawEnv();
    const cases = [[[], 'none'], [[MEMBER_ROLE], 'member'], [[OFFICER_ROLE], 'officer'], [[RL_ROLE], 'raid leader'], [[OALT_ROLE], 'officer alt'], [[GM_ROLE], 'guild master'], [[HC_ROLE], 'high council']];
    const probe = id(90); users.set(probe, { id: probe, username: 'probe', global_name: 'probe', avatar: null });
    const results = [];
    for (const [roles, name] of cases) {
      byId.set(probe, { roles });
      const before = await authority.guildOrganizerMemberNow219(env, probe, GUILD);
      const reads0 = memberReads;
      const now = typeof authority.guildCalendarRolesNow219 === 'function' ? await authority.guildCalendarRolesNow219(env, probe, GUILD) : null;
      results.push({ name, officerPredicate: before, officer: now && now.officer, council: now && now.council, reads: memberReads - reads0 });
    }
    check('cal', 'guildCalendarRolesNow219 exists and makes exactly one member read per call', results.every(x => x.officer !== null && x.reads === 1), results);
    check('cal', 'its officer fact equals guildOrganizerMemberNow219 for every role (Raid Leader in, Officer Alt out)', results.every(x => x.officer === x.officerPredicate) && results.find(x => x.name === 'raid leader').officer === true && results.find(x => x.name === 'officer alt').officer === false, results);
    check('cal', 'High Council is exactly the Guild Master and High Council roles (slots 0 and 1)', results.filter(x => x.council).map(x => x.name).join('|') === 'guild master|high council', results);
    failing.add(probe); byId.set(probe, { roles: [HC_ROLE] });
    const down = typeof authority.guildCalendarRolesNow219 === 'function' ? await authority.guildCalendarRolesNow219(env, probe, GUILD) : null;
    check('cal', 'a provider failure is false for both facts', !!down && down.officer === false && down.council === false, down);
    failing.delete(probe);
  }

  console.log('== the matrix: create, and the five actions on own, another officer\'s and an erased creator\'s events ==');
  const KEYS = ACTORS.map(a => a[0]);
  // Who may: create (officers incl. Raid Leaders, organizers, admins; NOT War Heads without an officer role);
  // own events (anyone who may manage); another officer's / erased creator's: senior managers only (admin, GM, HC, War
  // Heads). The listed organizer keeps its .59 attendance on any event.
  const CREATE = new Set(['admin', 'gm', 'hc', 'officer', 'raidleader', 'organizer']);
  const SENIOR = new Set(['admin', 'gm', 'hc', 'wh94', 'wh97', 'wh98']);
  const OWN = new Set([...SENIOR, 'officer', 'raidleader', 'organizer']);
  const allowed = (who, scope, action) => scope === 'own' ? OWN.has(who) : SENIOR.has(who) || (who === 'organizer' && action === 'attendance');
  const signerOf = (() => { let i = 0; return () => ACC['signer' + (i++ % 4)]; })();
  const future = T + 3 * 3600, soon = T + 1800;
  const create = (who, title, startsAt) => call('POST', '/api/community/events', { who: ACC[who].id, body: { opId: opId(), title, startsAt: iso(startsAt), durationMin: 60 } });
  const reassign = async (eid, uid) => { await write('UPDATE community_events SET created_by=? WHERE id=?', uid, eid); };
  // Setup events are scheduled by the admin and then given their creator (an officer who ran /raid, say), so the same
  // fixture stands on the base, where only organizers schedule on the website.
  const setupEvent = async (owner, title, at) => {
    const r = await create('admin', title, at), eid = r.data?.event?.id;
    if (!eid) throw Error('setup create failed: ' + JSON.stringify(r));
    if (owner !== 'admin') await reassign(eid, owner === null ? null : ACC[owner].id);
    return eid;
  };
  if (args.only !== 'delivery') { // --only delivery: the announcement sections alone (the matrix takes minutes)
  const plan = {}; // plan[who][scope] = { f: future event id, a: attendance event id, ref: {f, a} }
  const creates = {};
  for (const who of KEYS) {
    const before = db.prepare('SELECT COUNT(*) n FROM community_events').get().n;
    const r = await create(who, `Own raid of ${who}`, future);
    creates[who] = r;
    const ok = r.status === 200 && r.data?.event?.title === `Own raid of ${who}` && r.data.event.canManage === true && ev(r.data.event.id)?.created_by === ACC[who].id;
    if (CREATE.has(who)) check('cal', `create: ${who} schedules an event on the website (canManage on the answer, created_by is them)`, ok, r);
    else check('cal', `create: ${who} is refused (403 not_organizer, the message names who schedules) and nothing is stored`, r.status === 403 && r.data?.error === 'not_organizer' && /officers \(the Leader, the High Council, Officers and Raid Leaders\)/.test(r.data?.message || '') && db.prepare('SELECT COUNT(*) n FROM community_events').get().n === before, r);
    check('cal', `create: ${who} costs at most one Discord read`, r.cost.provider <= 1, r.cost);
  }
  for (const who of KEYS) {
    plan[who] = {};
    for (const scope of ['own', 'other', 'erased']) {
      const pair = {};
      for (const [k, at] of [['f', future], ['a', soon]]) {
        const eid = await setupEvent(scope === 'own' ? who : scope === 'other' ? 'creator' : null, `${who} ${scope} ${k}`, at);
        const s = signerOf();
        const x = await call('PUT', '/api/community/events/rsvp', { who: s.id, body: { eventId: eid, status: 'yes', revision: 0 } });
        if (x.status !== 200) throw Error('setup rsvp failed: ' + JSON.stringify(x));
        pair[k] = eid;
      }
      plan[who][scope] = pair;
    }
  }
  const refOf = async eid => ((await call('GET', `/api/community/event?id=${eid}`, { who: ACC.admin.id })).data?.signups || [])[0]?.ref;
  const outcome = (label, who, scope, action, eid, r, effect) => {
    const want = allowed(who, scope, action);
    if (want) check('cal', `${label}: ${who} on ${scope === 'own' ? 'its own' : scope === 'other' ? 'another officer\'s' : 'an erased creator\'s'} event is done`, r.status === 200 && effect(), { status: r.status, data: r.data });
    else {
      // Each route keeps its earlier code and status: edit, reschedule and cancel 409 not_event_organizer (with the event),
      // attendance 403 not_event_organizer, the roster 403 not_organizer; without any calendar authority 403 not_organizer.
      const code = OWN.has(who) && action !== 'decide' ? 'not_event_organizer' : 'not_organizer';
      const status = OWN.has(who) && ['edit', 'reschedule', 'cancel'].includes(action) ? 409 : 403;
      const msg = r.data?.message || '';
      const words = !OWN.has(who) ? /High Council, the War Heads and site administrators/.test(msg)
        : scope === 'erased' ? /no longer on record\. Only the High Council, the War Heads or a site administrator can change it\./.test(msg) : /belongs to another organizer\. Only that organizer, the High Council, the War Heads or a site administrator can change it\./.test(msg);
      check('cal', `${label}: ${who} on ${scope === 'own' ? 'its own' : scope === 'other' ? 'another officer\'s' : 'an erased creator\'s'} event is refused (${status} ${code}, says who can change it, no names)`, r.status === status && r.data?.error === code && words && !/Cal |cal\./.test(msg), { status: r.status, data: r.data && { error: r.data.error, message: r.data.message } });
    }
    check('cal', `${label}: ${who}/${scope} costs at most one Discord read`, r.cost.provider <= 1, r.cost);
  };
  const costs = {};
  for (const who of KEYS) {
    for (const scope of ['own', 'other', 'erased']) {
      const { f } = plan[who][scope];
      const ref = await refOf(f);
      let before = snapshot(f), r = await call('POST', '/api/community/events/update', { who: ACC[who].id, body: { eventId: f, revision: ev(f).revision, title: `${who} ${scope} renamed` } });
      outcome('edit', who, scope, 'edit', f, r, () => ev(f).title === `${who} ${scope} renamed` && r.data?.event?.canManage === true);
      if (!allowed(who, scope, 'edit')) check('cal', `edit: the refused ${who}/${scope} edit changed nothing`, snapshot(f) === before, '');
      costs[`edit:${who}:${scope}`] = r.cost;
      before = snapshot(f);
      r = await call('POST', '/api/community/events/update', { who: ACC[who].id, body: { eventId: f, revision: ev(f).revision, startsAt: iso(future + 1800) } });
      outcome('reschedule', who, scope, 'reschedule', f, r, () => ev(f).starts_at === future + 1800);
      if (!allowed(who, scope, 'reschedule')) check('cal', `reschedule: the refused ${who}/${scope} change moved nothing`, snapshot(f) === before, '');
      before = snapshot(f);
      r = await call('POST', '/api/community/events/decide', { who: ACC[who].id, body: { eventId: f, entries: [{ ref, decision: 'accepted', revision: 0 }] } });
      outcome('roster decision', who, scope, 'decide', f, r, () => r.data?.results?.[0]?.result === 'ok' && db.prepare('SELECT decision FROM community_event_signups WHERE event_id=?').get(f)?.decision === 'accepted');
      if (!allowed(who, scope, 'decide')) check('cal', `roster decision: the refused ${who}/${scope} decision changed nothing`, snapshot(f) === before, '');
      before = snapshot(f);
      r = await call('POST', '/api/community/events/cancel', { who: ACC[who].id, body: { eventId: f, revision: ev(f).revision } });
      outcome('cancel', who, scope, 'cancel', f, r, () => ev(f).status === 'cancelled');
      if (!allowed(who, scope, 'cancel')) check('cal', `cancel: the refused ${who}/${scope} cancel changed nothing`, snapshot(f) === before, '');
    }
  }
  const refs = {};
  for (const who of KEYS) for (const scope of ['own', 'other', 'erased']) refs[plan[who][scope].a] = await refOf(plan[who][scope].a);
  T += 3540; // the attendance events have started; inside the hour, so no account's membership re-check (checked_at) falls due
  for (const who of KEYS) {
    for (const scope of ['own', 'other', 'erased']) {
      const { a } = plan[who][scope];
      const list = await call('GET', `/api/community/event/attendance?id=${a}`, { who: ACC[who].id });
      const want = allowed(who, scope, 'attendance');
      check('cal', `attendance list: ${who}/${scope} ${want ? 'reads it' : 'is refused without the list'}`, want ? list.status === 200 && (list.data?.attendance || []).length === 1 : list.status === 403 && !('attendance' in (list.data || {})), { status: list.status, error: list.data?.error });
      const before = snapshot(a);
      const r = await call('POST', '/api/community/attendance/record', { who: ACC[who].id, body: { eventId: a, entries: [{ ref: refs[a], state: 'present', revision: 0 }] } });
      outcome('attendance', who, scope, 'attendance', a, r, () => r.data?.results?.[0]?.result === 'ok' && db.prepare('SELECT state FROM community_event_attendance WHERE event_id=?').get(a)?.state === 'present');
      if (!want) check('cal', `attendance: the refused ${who}/${scope} record changed nothing`, snapshot(a) === before, '');
    }
  }
  T -= 3540;

  console.log('== reads: canManage, canCreate and sign-up refs without a new provider call for a member ==');
  const lists = {};
  const manageOf = (who, eid) => (lists[who].data?.events || []).find(e => e.id === eid)?.canManage;
  const fresh = {};
  // A window that holds only these two events (the matrix events end by T + 4.5 h).
  for (const scope of ['other', 'erased']) fresh[scope] = await setupEvent(scope === 'other' ? 'creator' : null, 'Read check ' + scope, T + 10 * 3600);
  for (const who of [...KEYS, 'creator']) lists[who] = await call('GET', `/api/community/events?from=${encodeURIComponent(iso(T + 9 * 3600))}&to=${encodeURIComponent(iso(T + 12 * 3600))}`, { who: ACC[who].id });
  for (const who of KEYS) {
    const senior = SENIOR.has(who);
    check('cal', `list as ${who}: canManage on another officer's and an erased creator's event is ${senior}`, manageOf(who, fresh.other) === senior && manageOf(who, fresh.erased) === senior, { other: manageOf(who, fresh.other), erased: manageOf(who, fresh.erased) });
    check('cal', `list as ${who}: canCreate is ${CREATE.has(who)}`, lists[who].data?.canCreate === CREATE.has(who), lists[who].data?.canCreate);
    check('cal', `list as ${who}: no Discord read (no own event shown)`, lists[who].cost.provider === 0, lists[who].cost);
  }
  check('cal', 'list as the creator officer: canManage on its own event, one Discord read (as on the base)', manageOf('creator', fresh.other) === true && lists.creator.cost.provider === 1 && lists.creator.data?.canCreate === true, { canManage: manageOf('creator', fresh.other), cost: lists.creator.cost });
  const detail = async who => call('GET', `/api/community/event?id=${fresh.other}`, { who: ACC[who].id });
  await call('PUT', '/api/community/events/rsvp', { who: ACC.signer0.id, body: { eventId: fresh.other, status: 'yes', revision: 0 } });
  for (const who of KEYS) {
    const want = SENIOR.has(who) || who === 'organizer';
    const r2 = await detail(who);
    const shown = (r2.data?.signups || []).length === 1 && 'ref' in r2.data.signups[0];
    const reads = who === 'hc' || who === 'gm' ? 1 : 0; // only a High Council hint asks Discord; a War Head's proof is in the database
    check('cal', `detail as ${who}: sign-up refs ${want ? 'shown' : 'withheld'} and canManage ${SENIOR.has(who)} on another officer's event; ${reads} Discord read`, shown === want && r2.data?.event?.canManage === SENIOR.has(who) && r2.cost.provider === reads, { shown, canManage: r2.data?.event?.canManage, cost: r2.cost });
  }
  const own = await setupEvent('officer', 'Officer refs', T + 5 * 3600);
  await call('PUT', '/api/community/events/rsvp', { who: ACC.signer1.id, body: { eventId: own, status: 'yes', revision: 0 } });
  const mine = await call('GET', `/api/community/event?id=${own}`, { who: ACC.officer.id });
  check('cal', 'detail as the creator officer: its own event shows canManage and the sign-up refs it needs for the roster (one Discord read)', mine.data?.event?.canManage === true && mine.data.signups.length === 1 && typeof mine.data.signups[0].ref === 'string' && mine.cost.provider === 1, { canManage: mine.data?.event?.canManage, signups: mine.data?.signups, cost: mine.cost });
  const asMember = await call('GET', `/api/community/event?id=${own}`, { who: ACC.member.id });
  check('cal', 'detail as a plain member: no refs, no canManage, no Discord read', asMember.data?.event?.canManage === false && asMember.data.signups.every(s => !('ref' in s)) && asMember.cost.provider === 0, { cost: asMember.cost });

  console.log('== changes between the page load and the write ==');
  {
    const e1 = await setupEvent('officer', 'Role removed', T + 4 * 3600);
    const page = await call('GET', `/api/community/event?id=${e1}`, { who: ACC.officer.id });
    const saved = ACC.officer.roles; ACC.officer.roles = [MEMBER_ROLE];
    const before = snapshot(e1);
    const r = await call('POST', '/api/community/events/update', { who: ACC.officer.id, body: { eventId: e1, revision: page.data.event.revision, title: 'After the role went' } });
    check('cal', 'an officer whose role was removed after the page loaded is refused at the write (403 not_organizer), unchanged', page.data?.event?.canManage === true && r.status === 403 && r.data?.error === 'not_organizer' && snapshot(e1) === before, { status: r.status, data: r.data });
    const c = await create('officer', 'No longer an officer', T + 4 * 3600);
    check('cal', '  and can no longer schedule an event', c.status === 403 && c.data?.error === 'not_organizer', c.status);
    ACC.officer.roles = saved;
    const e2 = await setupEvent('creator', 'Council outage', T + 4 * 3600);
    failing.add(ACC.hc.id);
    const b2 = snapshot(e2);
    const r2 = await call('POST', '/api/community/events/update', { who: ACC.hc.id, body: { eventId: e2, revision: ev(e2).revision, title: 'During the outage' } });
    check('cal', 'a Discord failure refuses the High Council holder (403), unchanged', r2.status === 403 && snapshot(e2) === b2, { status: r2.status, data: r2.data });
    const own2 = await setupEvent('officer', 'Officer outage', T + 4 * 3600);
    failing.add(ACC.officer.id);
    const b3 = snapshot(own2);
    const r3 = await call('POST', '/api/community/events/cancel', { who: ACC.officer.id, body: { eventId: own2, revision: ev(own2).revision } });
    check('cal', 'a Discord failure refuses the creator officer on its own event (403), unchanged', r3.status === 403 && snapshot(own2) === b3, { status: r3.status, data: r3.data });
    const c3 = await create('raidleader', 'still fine', T + 4 * 3600);
    failing.delete(ACC.hc.id); failing.delete(ACC.officer.id);
    check('cal', '  (another officer is unaffected meanwhile)', c3.status === 200, c3.status);
    const e3 = await setupEvent('creator', 'Appointment withdrawn', T + 4 * 3600);
    const page3 = await call('GET', `/api/community/event?id=${e3}`, { who: ACC.wh97.id });
    const appointed = Object.fromEntries(Object.values(ACC).filter(a => a.office && a.key !== 'wh97').map(a => [a.office, `<@${a.id}>`]));
    await call('PUT', '/api/admin/settings', { who: ACC.admin.id, body: { appointed, appointedCharactersConfirmed: true, namesConfirmed: true } });
    const b4 = snapshot(e3);
    const r4 = await call('POST', '/api/community/events/update', { who: ACC.wh97.id, body: { eventId: e3, revision: page3.data.event.revision, title: 'After the withdrawal' } });
    check('cal', 'a War Head whose appointment was withdrawn after the page loaded is refused (403), unchanged', page3.data?.event?.canManage === true && r4.status === 403 && snapshot(e3) === b4, { status: r4.status, data: r4.data });
    // Withdrawn between the proof and the write: the committing statement's own condition refuses.
    const e4 = await setupEvent('creator', 'Withdrawn at the write', T + 4 * 3600);
    let fired = false;
    beforeRead = (sql) => { if (!fired && /^\s*UPDATE community_events SET title/.test(sql)) { fired = true; db.prepare("UPDATE site_settings SET value = json_remove(value, '$.office_98') WHERE key='appointed'").run(); } };
    const b5 = snapshot(e4);
    const r5 = await call('POST', '/api/community/events/update', { who: ACC.wh98.id, body: { eventId: e4, revision: ev(e4).revision, title: 'Raced the withdrawal' } });
    beforeRead = null;
    check('cal', 'an appointment withdrawn between the proof and the write is refused by the statement itself (403), unchanged', r5.status === 403 && snapshot(e4) === b5 && ev(e4).title === 'Withdrawn at the write', { status: r5.status, data: r5.data, fired });
  }
  } // end of the sections skipped by --only delivery

  console.log('== the announcement follows the same rule ==');
  {
    const eOther = await setupEvent('creator', 'Announce other', T + 4 * 3600);
    const publish = async (who, eid) => {
      const p = await call('GET', `/api/community/events/discord?eventId=${eid}`, { who: ACC[who].id });
      return p.status !== 200 ? p : call('POST', '/api/community/events/discord/publish', { who: ACC[who].id, body: { eventId: eid, revision: p.data.revision, opId: opId(), payloadHash: p.data.payloadHash } });
    };
    let n = posted.length, r = await publish('officer', eOther);
    check('cal', 'announcement: an officer cannot publish another officer\'s event (nothing posted)', r.status >= 400 && posted.length === n, r.status);
    n = posted.length; r = await publish('hc', eOther);
    check('cal', 'announcement: a High Council holder publishes another officer\'s event (one message)', r.status === 200 && r.data?.delivery?.state === 'posted' && posted.length === n + 1, r);
    const eOther2 = await setupEvent('creator', 'Announce other two', T + 4 * 3600);
    n = posted.length; r = await publish('wh94', eOther2);
    check('cal', 'announcement: a War Head publishes another officer\'s event (one message)', r.status === 200 && r.data?.delivery?.state === 'posted' && posted.length === n + 1, r);
    const eOwn = await setupEvent('raidleader', 'Announce own', T + 4 * 3600);
    n = posted.length; r = await publish('raidleader', eOwn);
    check('cal', 'announcement: a Raid Leader publishes its own event', r.status === 200 && posted.length === n + 1, r.status);
    n = posted.length; r = await publish('officeralt', eOwn);
    check('cal', 'announcement: an Officer Alt cannot', r.status === 403 && posted.length === n, r.status);
  }

  // Round 5 follow-up (13 Nov 2026), Codex Root's finding on 3158b82: the delivery module reduced a War Head's captured
  // appointment proof to a flag, so an appointment withdrawn after the capture still admitted the claim, the final guard
  // and the settlement. Each case below withdraws the publication (office_94) inside the statement hook, just before the
  // named statement runs: after the module captured the proof, before that statement decides.
  console.log('== the announcement: a War Head\'s appointment withdrawn mid-request ==');
  {
    const appointAll = async () => {
      const appointed = Object.fromEntries(Object.values(ACC).filter(a => a.office).map(a => [a.office, `<@${a.id}>`]));
      const r = await call('PUT', '/api/admin/settings', { who: ACC.admin.id, body: { appointed, appointedCharactersConfirmed: true, namesConfirmed: true } });
      if (r.status !== 200) throw Error('appointments not published: ' + JSON.stringify(r));
    };
    // The withdrawal models another request's admitted write on its own connection. Inside a write statement the
    // admission slot is already open; before a read statement (the final guard) it is opened for this one write and
    // restored exactly, and a matching-nothing UPDATE resets this connection's changes(), which the admission compares.
    const withdraw = () => {
      const slot = db.prepare('SELECT active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission WHERE singleton=1').get();
      if (slot.active !== 1) db.prepare("UPDATE privacy_write_admission SET active=1,nonce=?,purpose='writer' WHERE singleton=1").run(crypto.randomBytes(16).toString('hex'));
      db.prepare("UPDATE site_settings SET value = json_remove(value, '$.office_94') WHERE key='appointed'").run();
      if (slot.active !== 1) db.prepare('UPDATE privacy_write_admission SET active=?,nonce=?,purpose=?,entry_changes=?,logical_changes=? WHERE singleton=1').run(slot.active, slot.nonce, slot.purpose, slot.entry_changes, slot.logical_changes);
      db.prepare('UPDATE site_settings SET value = value WHERE 0').run();
    };
    const delivery = eid => db.prepare('SELECT state,message_id,event_revision,cleanup_requested,result_code,claim_nonce,op_id,actor FROM community_event_deliveries WHERE event_id=?').get(eid) || null;
    const STATEMENTS = {
      claim: /^\s*INSERT INTO community_event_deliveries/,
      guard: /AS ok FROM community_event_deliveries d/,
      removalClaim: /^\s*UPDATE community_event_deliveries SET state='claimed',cleanup_requested=1/,
      settle: /^\s*UPDATE community_event_deliveries SET message_id=CASE/,
    };
    /** Runs `run` with the withdrawal armed at the first statement matching `at` that names `eid`; says whether it fired. */
    const racing = async (at, eid, run) => {
      let fired = false;
      beforeRead = (sql, params) => { if (!fired && STATEMENTS[at].test(sql) && [].concat(params || []).flat().includes(eid)) { fired = true; withdraw(); } };
      try { return { r: await run(), fired }; } finally { beforeRead = null; }
    };
    const preview = (who, eid) => call('GET', `/api/community/events/discord?eventId=${eid}`, { who: ACC[who].id });
    const publishFrom = (who, eid, p) => call('POST', '/api/community/events/discord/publish', { who: ACC[who].id, body: { eventId: eid, revision: p.data.revision, opId: opId(), payloadHash: p.data.payloadHash } });
    const removeAs = (who, eid) => call('POST', '/api/community/events/discord/remove', { who: ACC[who].id, body: { eventId: eid, opId: opId() } });
    const OTHERS = /belongs to another organizer\. Only that organizer, the High Council, the War Heads or a site administrator can change its announcement\./;
    const saysOthers = r => r.status === 403 && r.data?.error === 'not_event_organizer' && OTHERS.test(r.data?.message || '') && !/Cal |cal\./.test(r.data?.message || '');
    const effectsSince = n => effects.slice(n).map(e => e.method);

    await appointAll();
    // Positive controls: the War Head's fence binds and admits while the appointment stands.
    const eOk = await setupEvent('creator', 'War Head control', T + 4 * 3600);
    let n = effects.length, b0 = botCalls, p = await preview('wh94', eOk);
    const previewBot = botCalls - b0;
    b0 = botCalls;
    let r = p.status === 200 ? await publishFrom('wh94', eOk, p) : p;
    check('cal', 'delivery control: a War Head publishes another officer\'s event (one POST, row posted)', r.status === 200 && r.data?.delivery?.state === 'posted' && effectsSince(n).join() === 'POST' && delivery(eOk)?.state === 'posted', { status: r.status, data: r.data, effects: effectsSince(n) });
    // Per-request cost of one announcement publish as a War Head (statements, Discord member reads, all bot calls).
    counts['announcement preview as War Head'] = { status: p.status, ...p.cost, botCalls: previewBot };
    counts['announcement publish as War Head'] = { status: r.status, ...r.cost, botCalls: botCalls - b0 };
    await call('POST', '/api/community/events/update', { who: ACC.admin.id, body: { eventId: eOk, revision: ev(eOk).revision, title: 'War Head control two' } });
    n = effects.length; p = await preview('wh94', eOk); r = p.status === 200 ? await publishFrom('wh94', eOk, p) : p;
    check('cal', 'delivery control: the War Head updates that announcement after an edit (one PATCH)', r.status === 200 && r.data?.delivery?.state === 'posted' && effectsSince(n).join() === 'PATCH', { status: r.status, data: r.data, effects: effectsSince(n) });
    n = effects.length; r = await removeAs('wh94', eOk);
    check('cal', 'delivery control: the War Head removes it (one DELETE, row removed)', r.status === 200 && delivery(eOk)?.state === 'removed' && effectsSince(n).join() === 'DELETE', { status: r.status, data: r.data, effects: effectsSince(n) });

    // 1. Publish, withdrawn just before the claim.
    await appointAll();
    const e1 = await setupEvent('creator', 'Withdrawn at the claim', T + 4 * 3600);
    p = await preview('wh94', e1); n = effects.length;
    let x = await racing('claim', e1, () => publishFrom('wh94', e1, p));
    check('cal', 'publish, withdrawn before the claim: no POST/PATCH/DELETE, no delivery row claimed, refusal says the event is another\'s', x.fired && effectsSince(n).length === 0 && delivery(e1) === null && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), row: delivery(e1), status: x.r.status, data: x.r.data });

    // 2. Publish, withdrawn just before the final guard (after the claim, before the POST).
    await appointAll();
    const e2 = await setupEvent('creator', 'Withdrawn at the guard', T + 4 * 3600);
    p = await preview('wh94', e2); n = effects.length;
    x = await racing('guard', e2, () => publishFrom('wh94', e2, p));
    let row = delivery(e2);
    check('cal', 'publish, withdrawn before the final guard: no POST, the claim is settled refused (admission_changed), never posted, refusal says the event is another\'s', x.fired && effectsSince(n).length === 0 && row?.state === 'refused' && row.result_code === 'admission_changed' && row.message_id === null && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), row, status: x.r.status, data: x.r.data });

    // 3. Update of a published announcement (PATCH), withdrawn before its claim and before its guard.
    await appointAll();
    const e3 = await setupEvent('creator', 'Withdrawn on update', T + 4 * 3600);
    p = await preview('wh94', e3); r = await publishFrom('wh94', e3, p);
    const firstMessage = delivery(e3)?.message_id;
    if (r.status !== 200 || !firstMessage) throw Error('setup publish failed: ' + JSON.stringify(r));
    await call('POST', '/api/community/events/update', { who: ACC.admin.id, body: { eventId: e3, revision: ev(e3).revision, title: 'Withdrawn on update, edited' } });
    let before = delivery(e3);
    p = await preview('wh94', e3); n = effects.length;
    x = await racing('claim', e3, () => publishFrom('wh94', e3, p));
    check('cal', 'update, withdrawn before the claim: no PATCH, the posted row is unchanged, refusal says the event is another\'s', x.fired && effectsSince(n).length === 0 && JSON.stringify(delivery(e3)) === JSON.stringify(before) && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), before, row: delivery(e3), status: x.r.status, data: x.r.data });
    await appointAll();
    p = await preview('wh94', e3); n = effects.length;
    x = await racing('guard', e3, () => publishFrom('wh94', e3, p));
    row = delivery(e3);
    check('cal', 'update, withdrawn before the final guard: no PATCH, the message keeps its old text, the row is not posted at the new revision', x.fired && effectsSince(n).length === 0 && row?.message_id === firstMessage && !(row.state === 'posted' && row.event_revision === ev(e3).revision) && messages.get(firstMessage)?.content.startsWith('**Withdrawn on update**') && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), row, status: x.r.status, data: x.r.data });

    // 4. Removal, withdrawn before its claim and before its guard.
    await appointAll();
    const e4 = await setupEvent('creator', 'Withdrawn at removal', T + 4 * 3600);
    p = await preview('wh94', e4); r = await publishFrom('wh94', e4, p);
    if (r.status !== 200) throw Error('setup publish failed: ' + JSON.stringify(r));
    before = delivery(e4); n = effects.length;
    x = await racing('removalClaim', e4, () => removeAs('wh94', e4));
    check('cal', 'remove, withdrawn before the removal claim: no DELETE, the posted row is unchanged (not claimed), refusal says the event is another\'s', x.fired && effectsSince(n).length === 0 && JSON.stringify(delivery(e4)) === JSON.stringify(before) && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), before, row: delivery(e4), status: x.r.status, data: x.r.data });
    await appointAll(); n = effects.length;
    x = await racing('guard', e4, () => removeAs('wh94', e4));
    row = delivery(e4);
    check('cal', 'remove, withdrawn before the final guard: no DELETE, the message still exists and the row is not settled removed (its pointer kept)', x.fired && effectsSince(n).length === 0 && messages.has(before.message_id) && row?.state !== 'removed' && row?.message_id === before.message_id && saysOthers(x.r), { fired: x.fired, effects: effectsSince(n), row, status: x.r.status, data: x.r.data });

    // 5. Settlement: the POST was acknowledged, then the appointment was withdrawn before it was recorded.
    await appointAll();
    const e5 = await setupEvent('creator', 'Withdrawn at settlement', T + 4 * 3600);
    p = await preview('wh94', e5); n = effects.length;
    x = await racing('settle', e5, () => publishFrom('wh94', e5, p));
    row = delivery(e5);
    const sent = posted.at(-1);
    check('cal', 'settle, withdrawn after Discord acknowledged the POST: the message id is still recorded (bookkeeping completes)', x.fired && effectsSince(n).join() === 'POST' && row?.message_id === sent?.id, { fired: x.fired, effects: effectsSince(n), row });
    check('cal', '  but the send is not settled as current: held unknown with its removal requested, never posted', row?.state === 'unknown' && row.cleanup_requested === 1 && row.result_code === 'published', row);

    // 6. High Council: the role cannot be in SQL; the fresh provider read before the guard refuses a removed role.
    await appointAll();
    const e6 = await setupEvent('creator', 'Council role removed', T + 4 * 3600);
    p = await preview('hc', e6); n = effects.length;
    const savedHc = ACC.hc.roles;
    let firedHc = false;
    beforeRead = (sql, params) => { if (!firedHc && STATEMENTS.claim.test(sql) && [].concat(params || []).flat().includes(e6)) { firedHc = true; ACC.hc.roles = [MEMBER_ROLE]; } };
    try { r = await publishFrom('hc', e6, p); } finally { beforeRead = null; ACC.hc.roles = savedHc; }
    row = delivery(e6);
    check('cal', 'High Council role removed after the claim: the fresh Discord read before the guard refuses, no POST, the claim settled refused', firedHc && effectsSince(n).length === 0 && row?.state === 'refused' && row.result_code === 'admission_changed' && r.status >= 400, { effects: effectsSince(n), row, status: r.status, data: r.data });
    n = effects.length; p = await preview('hc', e6); r = await publishFrom('hc', e6, p);
    check('cal', 'High Council control: with the role it publishes (one POST)', r.status === 200 && effectsSince(n).join() === 'POST', { status: r.status, data: r.data });
    n = effects.length; r = await removeAs('hc', e6);
    check('cal', 'High Council control: and removes (one DELETE)', r.status === 200 && effectsSince(n).join() === 'DELETE', { status: r.status, data: r.data });

    // 7. An officer on another officer's announcement learns whose it is (no effect).
    const e7 = await setupEvent('creator', 'Officer on another', T + 4 * 3600);
    n = effects.length; p = await preview('officer', e7);
    check('cal', 'an officer\'s preview of another officer\'s announcement says the event is another\'s (no effect)', saysOthers(p) && effectsSince(n).length === 0, { status: p.status, data: p.data });
    const eErased = await setupEvent(null, 'Erased announcement', T + 4 * 3600);
    p = await preview('officer', eErased);
    check('cal', '  and for an erased creator says the organizer is no longer on record', p.status === 403 && /no longer on record\. Only the High Council, the War Heads or a site administrator can change its announcement\./.test(p.data?.message || ''), { status: p.status, data: p.data });

    // 8. The same eye on community-events.ts: the attendance list (a read that discloses sign-ups) carried a War Head's
    // proof across its read; the appointment is now read in the same batch as the list.
    await appointAll();
    const e8 = await setupEvent('creator', 'Attendance withdrawn', T + 600);
    await call('PUT', '/api/community/events/rsvp', { who: ACC.signer2.id, body: { eventId: e8, status: 'yes', revision: 0 } });
    T += 1200;
    try {
      const ok = await call('GET', `/api/community/event/attendance?id=${e8}`, { who: ACC.wh94.id });
      check('cal', 'attendance list control: a War Head reads another officer\'s list while appointed', ok.status === 200 && (ok.data?.attendance || []).length === 1, { status: ok.status, error: ok.data?.error });
      const at = /FROM community_events e WHERE e\.id = \?1/;
      let firedList = false;
      beforeRead = (sql, params) => { if (!firedList && at.test(sql) && [].concat(params || []).flat().includes(e8)) { firedList = true; withdraw(); } };
      let list;
      try { list = await call('GET', `/api/community/event/attendance?id=${e8}`, { who: ACC.wh94.id }); } finally { beforeRead = null; }
      check('cal', 'attendance list, withdrawn after the proof and before the read: refused (403) without the list', firedList && list.status === 403 && !('attendance' in (list.data || {})), { firedList, status: list.status, data: list.data && { error: list.data.error, attendance: list.data.attendance } });
    } finally { T -= 1200; }
    await appointAll();

    // Round 5 follow-up 2 (13 Nov 2026): the independent review of 9b4331a. A fact changed between the request's provider
    // awaits (beforeFetch: just before the named Discord call) or inside a statement (beforeRead), then the write.
    console.log('== the announcement: follow-up 2, reconcile, High Council claims, answers after an effect, attendance ==');
    const FETCH = {
      channel: ['GET', new RegExp(`^/channels/${RAID_CHANNEL}$`)],
      message: ['GET', new RegExp(`^/channels/${RAID_CHANNEL}/messages/\\d+$`)],
      del: ['DELETE', new RegExp(`^/channels/${RAID_CHANNEL}/messages/\\d+$`)],
    };
    const atFetch = async ([method, re], act, run) => {
      let fired = false;
      beforeFetch = (m, path0) => { if (!fired && m === method && re.test(path0)) { fired = true; act(); } };
      try { return { r: await run(), fired }; } finally { beforeFetch = null; }
    };
    const savedHcRoles = [...ACC.hc.roles];
    const dropHc = () => { ACC.hc.roles = [MEMBER_ROLE]; };
    const restoreHc = () => { ACC.hc.roles = [...savedHcRoles]; };
    const fullRow = eid => JSON.stringify(db.prepare('SELECT * FROM community_event_deliveries WHERE event_id=?').get(eid) || null);
    const custodyOf = eid => JSON.stringify(db.prepare('SELECT * FROM privacy_provider_messages WHERE operation_id LIKE ? ORDER BY operation_id').all('event_publication:' + eid + ':%'));
    const reconcileAs = (who, eid, held, messageId) => call('POST', '/api/community/events/discord/reconcile', { who: ACC[who].id, body: { eventId: eid, opId: held.op_id, messageId } });
    /** The creator's publish whose POST answer is lost: Discord has the message, the row is held unknown without it. */
    const lostPublish = async title => {
      const eid = await setupEvent('creator', title, T + 4 * 3600);
      const p0 = await preview('creator', eid);
      losePost = true;
      await publishFrom('creator', eid, p0);
      const held = delivery(eid);
      if (!held || held.state !== 'unknown' || held.message_id !== null) throw Error('lost-publish setup: ' + JSON.stringify(held));
      return { eid, held, messageId: posted.at(-1).id };
    };

    // F1. Reconcile: another officer's held row is written only by a caller who manages the event at the write.
    await appointAll();
    let L = await lostPublish('Reconcile own');
    r = await reconcileAs('creator', L.eid, L.held, L.messageId);
    check('cal', 'reconcile control: the creator reconciles its own lost publish (200 posted, message id recorded)', r.status === 200 && delivery(L.eid)?.state === 'posted' && delivery(L.eid)?.message_id === L.messageId, { status: r.status, data: r.data, row: delivery(L.eid) });
    L = await lostPublish('Reconcile War Head');
    r = await reconcileAs('wh94', L.eid, L.held, L.messageId);
    check('cal', 'reconcile control: an appointed War Head records the message id on another officer\'s held row', delivery(L.eid)?.message_id === L.messageId && delivery(L.eid)?.result_code === 'reconciled', { status: r.status, data: r.data, row: delivery(L.eid) });
    for (const [label, at] of [['at the message GET (before the settle)', 'fetch'], ['inside the settle statement', 'statement']]) {
      await appointAll();
      L = await lostPublish('Reconcile withdrawn ' + at);
      const before = fullRow(L.eid), custody0 = custodyOf(L.eid), n0 = effects.length;
      x = at === 'fetch' ? await atFetch(FETCH.message, withdraw, () => reconcileAs('wh94', L.eid, L.held, L.messageId))
        : await racing('settle', L.eid, () => reconcileAs('wh94', L.eid, L.held, L.messageId));
      check('cal', `reconcile as a War Head withdrawn ${label}: another officer's held row and its custody are not written, refusal says the event is another's`, x.fired && fullRow(L.eid) === before && custodyOf(L.eid) === custody0 && effectsSince(n0).length === 0 && saysOthers(x.r), { fired: x.fired, before: JSON.parse(before), after: JSON.parse(fullRow(L.eid)), status: x.r.status, data: x.r.data });
    }
    await appointAll();
    L = await lostPublish('Reconcile council removed');
    before = fullRow(L.eid);
    try { x = await atFetch(FETCH.message, dropHc, () => reconcileAs('hc', L.eid, L.held, L.messageId)); } finally { restoreHc(); }
    check('cal', 'reconcile as High Council, role removed at the message GET: the fresh role read before the settle refuses, the row is not written', x.fired && fullRow(L.eid) === before && x.r.status === 403, { fired: x.fired, before: JSON.parse(before), after: JSON.parse(fullRow(L.eid)), status: x.r.status, data: x.r.data });
    let reads0 = memberReads;
    r = await reconcileAs('hc', L.eid, L.held, L.messageId);
    check('cal', 'reconcile control: High Council with the role records the message id (gate, membership and the fresh read: 3 member reads)', delivery(L.eid)?.message_id === L.messageId && memberReads - reads0 === 3, { status: r.status, reads: memberReads - reads0, row: delivery(L.eid) });

    // F2. High Council claims on another officer's event: the role is read again immediately before the claim.
    const eH1 = await setupEvent('creator', 'Council at qualify', T + 4 * 3600);
    p = await preview('hc', eH1); n = effects.length;
    try { x = await atFetch(FETCH.channel, dropHc, () => publishFrom('hc', eH1, p)); } finally { restoreHc(); }
    check('cal', 'publish as High Council, role removed at the qualify GET (before the claim): no POST, no delivery row, refusal says the event is another\'s', x.fired && effectsSince(n).length === 0 && delivery(eH1) === null && x.r.status === 403 && OTHERS.test(x.r.data?.message || ''), { fired: x.fired, effects: effectsSince(n), row: delivery(eH1), status: x.r.status, data: x.r.data });
    const eH2 = await setupEvent('creator', 'Council at custody', T + 4 * 3600);
    p = await preview('hc', eH2); reads0 = memberReads; r = await publishFrom('hc', eH2, p);
    const hcPublishReads = memberReads - reads0;
    check('cal', 'High Council control: publishes another officer\'s event with 4 member reads (gate, membership, before the claim, before the effect)', r.status === 200 && hcPublishReads === 4, { status: r.status, reads: hcPublishReads });
    before = fullRow(eH2); n = effects.length;
    try { x = await atFetch(FETCH.message, dropHc, () => removeAs('hc', eH2)); } finally { restoreHc(); }
    check('cal', 'remove as High Council, role removed at the custody GET (before the removal claim): no DELETE, another officer\'s posted row is left exactly as it was', x.fired && effectsSince(n).length === 0 && fullRow(eH2) === before && x.r.status === 403, { fired: x.fired, effects: effectsSince(n), before: JSON.parse(before), after: JSON.parse(fullRow(eH2)), status: x.r.status, data: x.r.data });
    const eH3 = await setupEvent('hc', 'Council own', T + 4 * 3600);
    p = await preview('hc', eH3); reads0 = memberReads; r = await publishFrom('hc', eH3, p);
    check('cal', 'High Council on its own event: no extra read before the claim (3 member reads)', r.status === 200 && memberReads - reads0 === 3, { status: r.status, reads: memberReads - reads0 });

    // F3. After an acknowledged effect, a caller who no longer manages the event gets a held answer, not a role refusal.
    const HELD = /reached Discord and its result is recorded, but you no longer manage this event's announcement/;
    const heldAnswer = q => q.status === 409 && q.data?.error === 'delivery_held' && HELD.test(q.data?.message || '') && !('delivery' in (q.data || {})) && !('eventId' in (q.data || {}));
    await appointAll();
    const eA1 = await setupEvent('creator', 'Answer after POST', T + 4 * 3600);
    p = await preview('wh94', eA1); n = effects.length;
    x = await racing('settle', eA1, () => publishFrom('wh94', eA1, p));
    check('cal', 'publish as War Head, withdrawn after the acknowledged POST: 409 delivery_held saying the request reached Discord, no event details', x.fired && effectsSince(n).join() === 'POST' && heldAnswer(x.r), { status: x.r.status, data: x.r.data });
    await appointAll();
    const eA2 = await setupEvent('creator', 'Answer after DELETE', T + 4 * 3600);
    p = await preview('wh94', eA2); await publishFrom('wh94', eA2, p); n = effects.length;
    x = await atFetch(FETCH.del, withdraw, () => removeAs('wh94', eA2));
    check('cal', 'remove as War Head, withdrawn while the DELETE is in flight: recorded removed, answer 409 delivery_held, no event details', x.fired && effectsSince(n).join() === 'DELETE' && delivery(eA2)?.state === 'removed' && heldAnswer(x.r), { status: x.r.status, data: x.r.data, row: delivery(eA2) });
    await appointAll();

    // F4. Attendance: the High Council role read is the last await before the admitted batch.
    const targetsSql = /SELECT r\.ref, r\.discord_id FROM community_refs r WHERE r\.ref IN/;
    const refFor = async eid => ((await call('GET', `/api/community/event?id=${eid}`, { who: ACC.admin.id })).data?.signups || [])[0]?.ref;
    for (const removed of [false, true]) {
      const eT = await setupEvent('creator', 'Council attendance ' + removed, T + 600);
      await call('PUT', '/api/community/events/rsvp', { who: ACC.signer3.id, body: { eventId: eT, status: 'yes', revision: 0 } });
      const ref0 = await refFor(eT);
      T += 1200;
      try {
        const b = snapshot(eT);
        let firedT = false;
        beforeRead = sql => { if (removed && !firedT && targetsSql.test(sql)) { firedT = true; dropHc(); } };
        try { r = await call('POST', '/api/community/attendance/record', { who: ACC.hc.id, body: { eventId: eT, entries: [{ ref: ref0, state: 'present', revision: 0 }] } }); } finally { beforeRead = null; restoreHc(); }
        if (removed) check('cal', 'attendance as High Council, role removed at the targets read: refused, nothing written', firedT && r.status >= 400 && snapshot(eT) === b, { firedT, status: r.status, data: r.data && r.data.error });
        else check('cal', 'attendance control: High Council records on another officer\'s event', r.status === 200 && snapshot(eT) !== b, { status: r.status, data: r.data && r.data.error });
      } finally { T -= 1200; }
    }
  }

  console.log('== limits apply to officers unchanged ==');
  {
    let r = await call('POST', '/api/community/events', { who: ACC.officer.id, body: { opId: opId(), title: 'Too far', startsAt: iso(T + 400 * 86400), durationMin: 60 } });
    check('cal', 'an officer cannot schedule past the horizon (invalid_starts_at)', r.status === 400 && r.data?.error === 'invalid_starts_at', r);
    r = await call('POST', '/api/community/events', { who: ACC.officer.id, body: { opId: opId(), title: 'Too many', startsAt: iso(T + 7200), durationMin: 60, capacity: 101 } });
    check('cal', 'an officer cannot exceed the capacity limit (invalid_capacity)', r.status === 400 && r.data?.error === 'invalid_capacity', r);
    const op = opId(), body = { opId: op, title: 'Replayed', startsAt: iso(T + 7200), durationMin: 60 };
    const a = await call('POST', '/api/community/events', { who: ACC.raidleader.id, body });
    const b = await call('POST', '/api/community/events', { who: ACC.raidleader.id, body });
    const c = await call('POST', '/api/community/events', { who: ACC.raidleader.id, body: { ...body, title: 'Different' } });
    check('cal', 'the create replay rule holds for a Raid Leader: same operation answers replay, a changed one op_conflict', a.status === 200 && b.status === 200 && b.data?.replay === true && c.status === 409 && c.data?.error === 'op_conflict' && db.prepare('SELECT COUNT(*) n FROM community_events WHERE id=?').get(op).n === 1, [a.status, b.status, b.data?.replay, c.status, c.data?.error]);
    const d = await call('POST', '/api/community/events', { who: ACC.officer.id, body });
    check('cal', 'another officer reusing that operation id gets op_conflict', d.status === 409 && d.data?.error === 'op_conflict', d.status);
  }

  console.log('== statement and provider-call counts (per request) ==');
  {
    const e = await setupEvent('creator', 'Counted', T + 20 * 3600); // alone in its window
    const win = `/api/community/events?from=${encodeURIComponent(iso(T + 19 * 3600))}&to=${encodeURIComponent(iso(T + 22 * 3600))}`;
    const measure = async (label, run) => { const r = await run(); counts[label] = { status: r.status, ...r.cost }; };
    await measure('list as member', () => call('GET', win, { who: ACC.member.id }));
    await measure('list as officer (no own event shown)', () => call('GET', win, { who: ACC.officer.id }));
    await measure('list as officer (own event shown)', () => call('GET', win, { who: ACC.creator.id }));
    await measure('list as senior (High Council)', () => call('GET', win, { who: ACC.hc.id }));
    await measure('list as senior (War Head)', () => call('GET', win, { who: ACC.wh94.id }));
    await measure('create as organizer', () => create('organizer', 'Count create org', T + 4 * 3600));
    await measure('create as officer', () => create('officer', 'Count create', T + 4 * 3600));
    const ownE = await setupEvent('creator', 'Count own', T + 4 * 3600);
    await measure('edit own as officer', () => call('POST', '/api/community/events/update', { who: ACC.creator.id, body: { eventId: ownE, revision: ev(ownE).revision, title: 'Count own 2' } }));
    await measure('edit another\'s as officer (refused)', () => call('POST', '/api/community/events/update', { who: ACC.officer.id, body: { eventId: e, revision: ev(e).revision, title: 'x' } }));
    await measure('edit another\'s as High Council', () => call('POST', '/api/community/events/update', { who: ACC.hc.id, body: { eventId: e, revision: ev(e).revision, title: 'Counted 2' } }));
    await measure('edit another\'s as War Head', () => call('POST', '/api/community/events/update', { who: ACC.wh94.id, body: { eventId: e, revision: ev(e).revision, title: 'Counted 3' } }));
    await measure('edit another\'s as admin', () => call('POST', '/api/community/events/update', { who: ACC.admin.id, body: { eventId: e, revision: ev(e).revision, title: 'Counted 4' } }));
    for (const [k, v] of Object.entries(counts)) if (k !== 'base') console.log(`  ${k}: HTTP ${v.status}, ${v.statements} statements, ${v.provider} Discord read(s), at most ${v.maxBinds} binds in one statement${v.botCalls !== undefined ? `, ${v.botCalls} bot call(s)` : ""}`);
    check('cal', 'budgets: a member\'s list makes no Discord read; no request above makes more than one', counts['list as member'].provider === 0 && Object.entries(counts).every(([k, v]) => k === 'base' || v.provider <= 1), counts);
    check('cal', 'budgets: no statement of any measured request binds 100 or more values', Object.entries(counts).every(([k, v]) => k === 'base' || v.maxBinds < 100), counts);
    if (args.counts) fs.writeFileSync(args.counts, JSON.stringify(counts, null, 2) + '\n');
  }
}

// ---------------------------------------------------------------- Part 2: the harness and a headless Edge
const realFetch = (() => { const f = require('node:http'); return f; })();
async function http(persona, method, p, body) {
  const headers = { Cookie: `QA209_persona=${persona}`, 'X-Olympus': '2', Origin: URL0 };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await nodeFetch(URL0 + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 429 && attempt < 3) { await sleep(3000); continue; }
    return res;
  }
}
function nodeFetch(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = realFetch.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let data = null; try { data = JSON.parse(text); } catch { data = text; } resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject); if (body !== undefined) req.write(body); req.end();
  });
}
async function launchEdge(portN, profile) {
  fs.mkdirSync(profile, { recursive: true });
  const proc = cp.spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', `--remote-debugging-port=${portN}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--lang=en-US', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) { await sleep(250); try { const r = await nodeFetch(`http://127.0.0.1:${portN}/json/list`); targets = Array.isArray(r.data) ? r.data : null; } catch { /* not up */ } }
  if (!targets) { proc.kill(); throw Error('edge did not expose CDP'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let n = 0; const pending = new Map();
  ws.onmessage = e => { const msg = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString()); if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(Error(msg.error.message)) : res(msg.result); } };
  const cdp = {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++n; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    async eval(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async close() { try { await Promise.race([cdp.send('Browser.close'), sleep(3000)]); } catch { /* gone */ } try { ws.close(); } catch { /* gone */ } await sleep(300); try { proc.kill(); } catch { /* gone */ } },
  };
  return cdp;
}
// Measured in the page: horizontal overflow, and every visible control in <main> under 44 x 44 CSS px.
const MEASURE = `(() => { const out = []; for (const el of document.querySelectorAll('main a.btn, main button, main select, main input:not([type=hidden]), main textarea')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue; if (r.height < 44 || (r.width < 44 && el.type !== 'text' && el.tagName !== 'TEXTAREA')) out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }); } return { overflow: document.documentElement.scrollWidth - innerWidth, small: out, main: (document.querySelector('main') || {}).innerText || '' }; })()`;
async function part2() {
  console.log('== the page through the harness (' + URL0 + ') ==');
  const startsAt = new Date(Math.ceil(Date.now() / 1000 + 3 * 3600) * 1000).toISOString();
  let r = await http('officer', 'POST', '/api/community/events', { opId: crypto.randomBytes(16).toString('base64url'), title: 'QA round 5 officer raid', startsAt, durationMin: 60 });
  const ownId = r.data?.event?.id;
  check('cal', 'harness: the officer persona schedules a website event', r.status === 200 && typeof ownId === 'string', { status: r.status, error: r.data?.error });
  r = await http('admin', 'POST', '/api/community/events', { opId: crypto.randomBytes(16).toString('base64url'), title: 'QA round 5 admin raid', startsAt, durationMin: 60 });
  const otherId = r.data?.event?.id;
  r = await http('officer', 'POST', '/api/community/events/update', { eventId: otherId, revision: 1, title: 'Taken over' });
  check('cal', 'harness: the officer\'s edit of the admin\'s event is refused with the role sentence (409, as before)', r.status === 409 && r.data?.error === 'not_event_organizer' && /Only that organizer, the High Council, the War Heads or a site administrator can change it\./.test(r.data?.message || ''), { status: r.status, data: r.data });
  r = await http('officer', 'GET', '/api/community/events');
  check('cal', 'harness: the officer persona\'s calendar list says canCreate', r.status === 200 && r.data?.canCreate === true, r.data && r.data.canCreate);
  r = await http('member', 'GET', '/api/community/events');
  check('cal', 'harness: the member persona\'s list does not', r.status === 200 && r.data?.canCreate === false, r.data && r.data.canCreate);
  if (!CDP_PORT || !ownId) return;
  const cdp = await launchEdge(CDP_PORT, args.profile || path.join(require('node:os').tmpdir(), 'cal1112-' + Date.now()));
  const report = {};
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    const go = async url => { await cdp.send('Page.navigate', { url }); await sleep(300); for (let i = 0; i < 60; i++) { if (await cdp.eval('document.readyState') === 'complete') break; await sleep(150); } };
    const size = async (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    const until = async (expr, n = 60) => { let v = null; for (let i = 0; i < n; i++) { v = await cdp.eval(expr); if (v) return v; await sleep(200); } return v; };
    for (const persona of ['officer', 'member', 'admin']) {
      await go(URL0 + '/__qa/' + persona);
      for (const [width, height] of [[1440, 900], [1280, 900], [768, 1024], [390, 844], [375, 812], [320, 640]]) {
        await size(width, height);
        await go('about:blank'); await go(URL0 + '/#/community/calendar');
        const cal = await until(`(() => { const m = document.querySelector('main'); if (!m || !/Calendar/.test(m.innerText) || /Loading…/.test(m.innerText)) return null; const a = [...m.querySelectorAll('a.btn')].find(x => x.textContent === 'Schedule an event'); return { schedule: !!a && !a.hidden && a.getClientRects().length > 0, m: ${MEASURE} }; })()`);
        await go('about:blank'); await go(URL0 + `/#/community/calendar/${persona === 'officer' ? ownId : otherId}`);
        const evp = await until(`(() => { const m = document.querySelector('main'); if (!m || !/QA round 5/.test(m.innerText)) return null; const t = [...m.querySelectorAll('a.btn')].map(a => a.textContent); return { edit: t.includes('Edit'), m: ${MEASURE} }; })()`);
        await go('about:blank'); await go(URL0 + '/#/community/calendar/new');
        const newp = await until(`(() => { const m = document.querySelector('main'); if (!m || !/Schedule an event/.test(m.innerText) || /Loading…/.test(m.innerText)) return null; return { form: !!m.querySelector('form'), refused: /Scheduling events is for officers/.test(m.innerText), m: ${MEASURE} }; })()`);
        const key = `${persona}@${width}`;
        report[key] = { calendar: cal && { schedule: cal.schedule, overflow: cal.m.overflow, small: cal.m.small }, event: evp && { edit: evp.edit, overflow: evp.m.overflow, small: evp.m.small }, create: newp && { form: newp.form, refused: newp.refused, overflow: newp.m.overflow, small: newp.m.small } };
        const can = persona !== 'member';
        check('cal', `page ${key}: "Schedule an event" ${can ? 'shown' : 'hidden'}, the create page ${can ? 'offers the form' : 'explains who schedules'}`, !!cal && cal.schedule === can && !!newp && newp.form === can && newp.refused === !can, report[key]);
        check('cal', `page ${key}: Edit on the event ${persona === 'member' ? 'absent' : 'present'} (own event for the officer, any for the admin)`, !!evp && evp.edit === (persona !== 'member'), report[key].event);
        check('cal', `page ${key}: no horizontal overflow on the calendar, the event and the create page`, !!cal && !!evp && !!newp && cal.m.overflow <= 0 && evp.m.overflow <= 0 && newp.m.overflow <= 0, report[key]);
        if (width <= 390) check('cal', `page ${key}: every calendar, event and create control is at least 44 x 44 px`, !!cal && !!evp && !!newp && [...cal.m.small, ...evp.m.small, ...newp.m.small].length === 0, report[key]);
      }
    }
  } finally { await cdp.close(); if (args.report) fs.writeFileSync(args.report, JSON.stringify(report, null, 2) + '\n'); }
}

(async () => {
  if (args.only !== 'page') try { await part1(); } catch (e) { check('setup', 'part 1 completed without an exception: ' + (e && e.stack || e), false); }
  if (URL0) { try { await part2(); } catch (e) { check('setup', 'part 2 completed without an exception: ' + (e && e.stack || e), false); } }
  console.log(`\n${failures} failure(s)`);
  process.exit(Math.min(failures, 99));
})();

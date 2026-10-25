// Fresh full-release roles (Revision 4), stage 4: the differential identity test of the configured-mode hooks. The REAL
// Worker (index.ts fetch: the /queue deferral, POST /ingest/roster, signed POST /interactions for ban, unbind, post-guide,
// /verify and the guide's button) and the cron sweep run over native SQLite on the REAL schema with the original entry epoch
// and write admission, a fixed clock, per-context deterministic entropy and a synthetic Discord. Every D1 statement (text,
// binds, batch shape) and every Discord request is traced in order, and the lane work is told apart by context: the test's
// loader runs runFreshPass and settleLaneBan inside an AsyncLocalStorage store.
//   * Unconfigured (both variables absent, both "", or STAFF "false"): the whole trace, the response and the twelve rows
//     equal the pins recorded from 5bea76e7 (.160), and no lane function runs.
//   * Configured (valid, and invalid-present = held): the legacy subsequence equals the same .160 pins, after masking only
//     the documented A6 texts once the fresh lane is open; the lane subsequence never names a twelve role ID
//     (beta-reset-policy.ts:9-14), and the twelve role_settlements rows end exactly as under .160.
//     P1-B (Codex 22:44 UTC, 16 Oct): the base environment keeps .160's QR_PRIVILEGED_RANK_MAPPING_ENABLED "true" without
//     QR_RANK_MAPPING_ENABLED, the configuration in which the legacy staff producer is reachable, so 'configured' holds the
//     staff lane (audited, legacy_privileged_producer_reachable) and runs the fresh lane alone.
// Both phases (before the beta reset cutoff, with legacy twelve grants open and the lanes clock-gated, and a day after
// epochStart) and both legacy role writers (plain, and the membership settlement writer whose rows on the twelve are checked).
// Also: a refused deferral registration writes role.fresh_failed and answers as .160 does (an error at /queue, whose deferral
// carries the legacy sweep; unchanged for the new deferrals); the protected sources are the reviewed .164 integration; full-release-roles is in
// no static import cycle and full-release-pass is never imported statically.
//   node tests/full_release_roles_identity_test.cjs              (IDENTITY_DUMP=<phase>:<profile>:<variant>:<scenario> prints one trace)
// Re-recording (only when this fixture changes): export 5bea76e7's worker/src (git show) to a directory, then
//   IDENTITY_RECORD=1 IDENTITY_SRC=<that directory> node tests/full_release_roles_identity_test.cjs
// prints the PINS object to paste below. Synthetic IDs only; the twelve are read from beta-reset-policy.ts.
// .196: only exact reviewed source additions and paired-dump-proven first guide line are projected.
// Historical PINS and raw r.trace stay unchanged; no blanket current-source/dynamic digest re-pin.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), nodeCrypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite'), { AsyncLocalStorage } = require('node:async_hooks');
const entry = require('./helpers/privacy129_fixture.cjs');
const root = path.join(__dirname, '..');
const SRC = process.env.IDENTITY_SRC ? path.resolve(process.env.IDENTITY_SRC) : path.join(root, 'src');
const RECORD = process.env.IDENTITY_RECORD === '1', DUMP = process.env.IDENTITY_DUMP || '';

// --- context, clock and entropy, installed before any source module loads
const laneContext = new AsyncLocalStorage();
const tagNow = () => laneContext.getStore() === 'lane' ? 'lane' : 'legacy';
const RealDate = Date; let T = 0;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T * 1000])); } static now() { return T * 1000; } };
let streams = {};
function draw(n) {
  const k = tagNow(), s = streams[k] ??= { n: 0, buf: Buffer.alloc(0) };
  while (s.buf.length < n) s.buf = Buffer.concat([s.buf, nodeCrypto.createHash('sha256').update(`identity-entropy:${k}:${s.n++}`).digest()]);
  const out = Buffer.from(s.buf.subarray(0, n)); s.buf = s.buf.subarray(n); return out;
}
crypto.getRandomValues = (arr) => { new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(draw(arr.byteLength)); return arr; };
crypto.randomUUID = () => { const b = draw(16); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
Math.random = () => draw(4).readUInt32BE(0) / 2 ** 32;

// --- synthetic IDs (never real ones); the twelve come from the policy source under test
const id = (n) => String(810000000000000000n + BigInt(n));
const G = id(1), BOT = id(2), BOTROLE = id(3), OFF = id(4), GL = id(5), RL = id(6), CH_LOG = id(7), CH_ALERT = id(8), CH_GUIDE = id(9);
const FM = id(100), N = Array.from({ length: 10 }, (_, i) => id(101 + i));
const U1 = id(201), U2 = id(202), U3 = id(203), U4 = id(204), U5 = id(205), OFFICER = id(209);
const WATCH = 'identity-watcher-token-0123456789abcdef', E = 1793833200, CUTOFF = 1792688400;
const NATIVE = ['Guild Master', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
const cfgRaw = JSON.stringify({ version: 1, epoch: 'olympus-full-release-identity', epochStart: E, grants: true, membership: FM, native: N });
const VARIANTS = {
  absent: {}, empty: { FULL_RELEASE_ROLES: '', STAFF_TEN_RANK_ROLES: '' }, staffFalse: { FULL_RELEASE_ROLES: '', STAFF_TEN_RANK_ROLES: 'false' },
  configured: { FULL_RELEASE_ROLES: cfgRaw, STAFF_TEN_RANK_ROLES: 'true' }, held: { FULL_RELEASE_ROLES: '{"version":1}' },
};
const UNCONFIGURED = ['absent', 'empty', 'staffFalse'];
const PHASES = { pre: CUTOFF - 3 * 86400, live: E + 86400 };
// Two legacy profiles: the plain role writer, and the membership settlement writer, whose rows on the twelve are the twelve lane.
const PROFILES = { plain: {}, settlement: { MEMBERSHIP_ROLE_SETTLEMENT_ENABLED: 'true' } };

// --- the source loader: transpiled once, evaluated afresh for every run (no module state carries between runs)
const jsCache = new Map();
let modules = null, laneCalls = [];
function load(name) {
  if (name === 'node:async_hooks' || name === './node:async_hooks') return require('node:async_hooks');
  const key = name.replace(/^\.\//, '');
  if (modules.has(key)) return modules.get(key).exports;
  const file = path.join(SRC, key + '.ts');
  if (!jsCache.has(key)) jsCache.set(key, ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  const m = { exports: {} }; modules.set(key, m);
  new Function('module', 'exports', 'require', jsCache.get(key))(m, m.exports, load);
  if (key === 'full-release-pass') { // the lane entries run in the 'lane' context: every statement and request below them is tagged
    const original = m.exports, wrapped = { ...original };
    Object.defineProperty(wrapped, '__esModule', { value: true });
    for (const f of ['runFreshPass', 'settleLaneBan']) wrapped[f] = (...args) => { laneCalls.push(f); return laneContext.run('lane', () => original[f](...args)); };
    m.exports = wrapped;
  }
  return m.exports;
}

// --- trace: native statements, batch shapes, Discord requests, each with its context
let trace = [], members = {}, messageSeq = {}, TWELVE = null;
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  if (u.origin !== 'https://discord.com' || !u.pathname.startsWith('/api/v10/')) throw Error('blocked synthetic network');
  const p = u.pathname.slice('/api/v10'.length), headers = new Headers(init.headers || {}), tag = tagNow();
  trace.push({ k: 'http', tag, method, path: p + u.search, body: init.body == null ? null : String(init.body), reason: headers.get('X-Audit-Log-Reason') });
  if (p === '/users/@me') return json({ id: BOT, username: 'olympus-verify', bot: true });
  if (p === `/guilds/${G}/roles` && method === 'GET') return json(inventory());
  let m = p.match(/^\/channels\/(\d+)\/messages$/);
  if (m && method === 'POST') { messageSeq[tag] = (messageSeq[tag] || 0) + 1; return json({ id: String((tag === 'lane' ? 870000000000000000n : 860000000000000000n) + BigInt(messageSeq[tag])), channel_id: m[1] }); }
  m = p.match(/^\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);
  if (m && m[1] === G) {
    if (m[3]) { const cur = members[m[2]] || []; members[m[2]] = method === 'PUT' ? [...new Set([...cur, m[3]])] : cur.filter((r) => r !== m[3]); return new Response(null, { status: 204 }); }
    if (!members[m[2]]) return json({ message: 'Unknown Member', code: 10007 }, 404);
    return json({ user: { id: m[2] }, roles: members[m[2]] });
  }
  throw Error(`unexpected synthetic Discord request ${method} ${p}`);
};
function inventory() {
  const roles = [{ id: G, name: '@everyone', position: 0, permissions: '0', managed: false }, { id: BOTROLE, name: 'Olympus Verify', position: 60, permissions: '268435456', managed: false },
    { id: OFF, name: 'Officer', position: 30, permissions: '1024', managed: false }, { id: GL, name: 'Guild Leader', position: 31, permissions: '1024', managed: false },
    { id: RL, name: 'Raid Leader', position: 29, permissions: '1024', managed: false }, { id: FM, name: 'Fresh Member', position: 2, permissions: '0', managed: false },
    ...N.map((r, i) => ({ id: r, name: 'Fresh ' + NATIVE[i], position: 3 + i, permissions: '0', managed: false }))];
  TWELVE.forEach((r, i) => roles.push({ id: r, name: 'Twelve ' + i, position: 1, permissions: '0', managed: false }));
  return roles;
}
function port(db) {
  return entry.originalNativePort(db, {
    statement(sql, params) { trace.push({ k: 'sql', tag: tagNow(), sql, params: params.slice() }); },
    beforeBatch: async (plan) => { trace.push({ k: 'batch', tag: tagNow(), n: plan.length }); },
  });
}

// --- the fixture world, identical for every variant of a phase; written through write admission on an untraced port
async function seed(db) {
  const admitted = load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(entry.originalNativePort(db), 'writer', 'canonical', entry.ENTRY_EPOCH);
  const run = async (sql, ...p) => { const r = await admitted.prepare(sql).bind(...p).run(); return { lastInsertRowid: r.meta.last_row_id }; };
  for (const who of [U1, U2, U3, U4, U5, OFFICER]) await run('INSERT INTO members(discord_id,banned,ban_reason) VALUES(?,?,?)', who, who === U2 ? 1 : 0, who === U2 ? 'fixture ban' : null);
  const char = (key, name, who, status, guid) => run('INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,member_since,guid,source) VALUES(?,?,?,?,?,?,?,?,?)',
    key, name, who, status, T - 40 * 86400, T - 40 * 86400, status === 'member' ? T - 30 * 86400 : null, guid, 'whisper');
  await char('alpha', 'Alpha', U1, 'member', 'Player-1-0000A001'); await char('bravo', 'Bravo', U2, 'member', 'Player-1-0000B002');
  await char('charlie', 'Charlie', U3, 'member', 'Player-1-0000C003'); await char('delta', 'Delta', U4, 'verified', 'Player-1-0000D004');
  const roster = [['alpha', 'Alpha', 7, 'Player-1-0000A001'], ['bravo', 'Bravo', 7, 'Player-1-0000B002'], ['charlie', 'Charlie', 2, 'Player-1-0000C003'], ['echo', 'Echo', 9, 'Player-1-0000E005'], ['foxtrot', 'Foxtrot', 8, 'Player-1-0000F006']];
  const s = Number((await run("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted,first_received_at) VALUES(?,?,'addon',?,1,1,?)", T - 120, T - 110, roster.length, T - 110)).lastInsertRowid);
  for (const [key, name, rank, guid] of roster) await run('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)', s, key, name, NATIVE[rank], rank, guid);
  await run("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source) VALUES(?,?,?,?,?,?,'whisper')", U1, 'alpha', 'Alpha', T - 600, T + 86400, T - 500);
  await run("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'watcher','verify.confirmed','Alpha',?)", T - 495, JSON.stringify({ discordId: U1 }));
  await run("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.member','Alpha',?)", T - 3600, JSON.stringify({ discordId: U1 }));
  // an unresolved twelve row (never selected or changed by a lane) and a settled one
  const twelveRow = (n, who, role, state, nonce) => run("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,claim_nonce) VALUES(?,?,'roster_native_rank',?,?,1,?,'fixture',1,?,?,?)",
    'f'.repeat(31) + n, who, G, role, state, T - 9000, T - 8700, nonce.repeat(32));
  await twelveRow('1', U3, TWELVE[9], 'unknown', 'a'); await twelveRow('2', U1, TWELVE[2], 'settled', 'b');
  members = { [BOT]: [BOTROLE], [U1]: [TWELVE[2]], [U2]: [TWELVE[0], FM, N[7]], [U3]: [TWELVE[0], TWELVE[9]], [U4]: [], [U5]: [], [OFFICER]: [OFF] };
}

// --- one run: fresh modules, database, entropy and Discord state
let keys, pub;
function baseEnv(nativePort, over) {
  return entry.currentEntryEnvironment({ DB: nativePort, PUBLIC_BASE_URL: 'https://verify.example', VERIFY_SECRET: 'identity-verify-secret', WATCHER_TOKEN: WATCH,
    DISCORD_PUBLIC_KEY: pub, DISCORD_APP_ID: BOT, DISCORD_BOT_TOKEN: 'synthetic-bot-token', GUILD_ID: G, ROLE_GUILD_MEMBER: TWELVE[0], ROLE_OFFICER: OFF,
    ROLE_GUILD_LEADER: GL, ROLE_RAID_LEADER: RL, ADMISSION_MODE: 'auto', OFFICER_CHARACTERS: 'Fern Melder', ROSTER_MIN_MEMBERS: '3', ROSTER_MAX_SHRINK_PCT: '10',
    LINKS_NOT_BEFORE: String(E), CHANNEL_SERVER_LOG: CH_LOG, CHANNEL_MOD_ALERTS: CH_ALERT, REQUEST_CODES: 'on', QR_PRIVILEGED_RANK_MAPPING_ENABLED: 'true', ROLE_CALL_BUDGET: '40', ...over });
}
async function interact(M, env, ctx, i) {
  const body = JSON.stringify({ application_id: BOT, token: 'synthetic-token', guild_id: G, channel_id: CH_ALERT, ...i }), stamp = String(T);
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(stamp + body))).toString('hex');
  return M('index').default.fetch(new Request('https://verify.example/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': stamp }, body }), env, ctx);
}
const officer = { user: { id: OFFICER, username: 'officer', global_name: null }, roles: [OFF] };
const admin = (name, options) => ({ type: 2, data: { name: 'olympus-admin', type: 1, options: [{ type: 1, name, options }] }, member: officer });
const SCENARIOS = {
  queue: (M, env, ctx) => M('index').default.fetch(new Request('https://verify.example/queue?officer=fern%20melder', { headers: { Authorization: 'Bearer ' + WATCH } }), env, ctx),
  ingest: (M, env, ctx) => M('index').default.fetch(new Request('https://verify.example/ingest/roster', { method: 'POST', headers: { Authorization: 'Bearer ' + WATCH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ exportedAt: T - 30, members: [['Alpha', 7, 'Player-1-0000A001'], ['Bravo', 7, 'Player-1-0000B002'], ['Charlie', 2, 'Player-1-0000C003'], ['Delta', 6, 'Player-1-0000D004'], ['Echo', 9, 'Player-1-0000E005'], ['Foxtrot', 8, 'Player-1-0000F006']]
      .map(([name, rankIndex, guid]) => ({ name, rank: NATIVE[rankIndex], rankIndex, level: 80, class: 'WARRIOR', guid })) }) }), env, ctx),
  ban: (M, env, ctx) => interact(M, env, ctx, { id: id(901), ...admin('ban', [{ type: 6, name: 'user', value: U2 }, { type: 3, name: 'reason', value: 'identity fixture' }]) }),
  unbind: (M, env, ctx) => interact(M, env, ctx, { id: id(902), ...admin('unbind', [{ type: 3, name: 'character', value: 'Charlie' }]) }),
  guide: (M, env, ctx) => interact(M, env, ctx, { id: id(903), ...admin('post-guide', [{ type: 7, name: 'channel', value: CH_GUIDE }]) }),
  verify: (M, env, ctx) => interact(M, env, ctx, { id: id(904), type: 2, data: { name: 'verify', type: 1, options: [{ type: 3, name: 'character', value: 'Alpha' }] }, member: { user: { id: U1, username: 'alpha', global_name: null }, roles: [] } }),
  button: (M, env, ctx) => interact(M, env, ctx, { id: id(905), type: 3, data: { custom_id: 'guide:verify', component_type: 2 }, member: { user: { id: U5, username: 'echo', global_name: null }, roles: [] }, message: { id: id(906), channel_id: CH_GUIDE } }),
  cron: async (M, env) => {
    const direct = { ...env, DB: M('privacy-write-admission').createPrivacyWriteAdmissionDatabase(env.DB, 'writer', 'canonical', entry.ENTRY_EPOCH) };
    const out = await M('restore').sweepMemberRoles(direct, 'cron');
    return { status: 0, text: async () => JSON.stringify(out) };
  },
};
async function runOnce(phase, profile, variant, scenario, refuse = false) {
  T = PHASES[phase]; streams = {}; trace = []; messageSeq = {}; laneCalls = []; modules = new Map();
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  db.function('strftime', (format, value) => { if (format !== '%s' || value !== 'now') throw Error('unexpected fixture clock input'); return String(T); });
  entry.installCurrentEntryEpoch(db, { now: T });
  TWELVE = load('beta-reset-policy').BETA_RESET_ROLE_IDS;
  await seed(db); streams = {}; trace = [];
  const nativePort = port(db), env = baseEnv(nativePort, { ...PROFILES[profile], ...VARIANTS[variant] });
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  const pending = [], errors = [];
  // refuse: waitUntil throws after taking the promise (deferOriginalServing has already started the work): a refused registration
  const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch((e) => errors.push(String(e && e.message || e)))); if (refuse) throw Error('waitUntil refused'); } };
  const quiet = console.error; console.error = () => {};
  let res;
  try { res = await SCENARIOS[scenario](load, env, ctx); for (let i = 0; i < pending.length; i++) await pending[i]; }
  finally { console.error = quiet; }
  const response = res ? { status: res.status, body: await res.text() } : null;
  const twelve = db.prepare(`SELECT * FROM role_settlements WHERE role_id IN (${TWELVE.map(() => '?').join(',')}) ORDER BY id`).all(...TWELVE);
  const freshFailed = db.prepare("SELECT subject, details FROM audit WHERE actor='system' AND action='role.fresh_failed' ORDER BY id").all();
  db.close();
  return { trace, response, twelve, errors, laneCalls: laneCalls.slice(), discord: JSON.parse(JSON.stringify(members)), freshFailed };
}

// --- comparison
const sha = (v) => nodeCrypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
// .163 composition: the approved sealed Native profile adds exactly three immutable-seal trigger definitions.
// The first failing unconfigured trace was compared in full: all115 events/SQL/HTTP/batch shapes equal .160;
// only29 physical-manifest binds gain these definitions (69tables/84indexes unchanged, 221→224triggers).
// Project this exact pinned profile ONLY for the historical trace comparison. Actual Native fixtures retain all guards.
const COMPOSED_MANIFEST_SHA='5ed124d8b626b5817154e09596593ab547c99168b5d1c5675c988d9ee1e1c55e';
const SEAL_TRIGGER_NAMES=['beta_dispatch_seal_no_replace','beta_dispatch_seal_no_update','beta_dispatch_seal_no_delete'];
const projectedManifests=new Map(),observedManifests=new Set();
function projectApprovedManifest(value){
 if(typeof value!=='string'||!value.startsWith('{"tables":')||!value.includes('"slotSQL":'))return value;
 observedManifests.add(value);if(projectedManifests.has(value))return projectedManifests.get(value);
 if(sha(value)!==COMPOSED_MANIFEST_SHA)return value; // any other definition/bind change still fails the historical trace
 const data=JSON.parse(value);
 if(data.tables.length!==69||data.indexes.length!==84||data.triggers.length!==224
  ||SEAL_TRIGGER_NAMES.some(name=>data.triggers.filter(t=>t.name===name).length!==1))throw Error('reviewed seal profile differs');
 const projected=JSON.stringify({...data,triggers:data.triggers.filter(t=>!SEAL_TRIGGER_NAMES.includes(t.name))});
 projectedManifests.set(value,projected);return projected;
}
// A paired original guide raw dump proved identical30events/SQL/binds/batches/HTTPmetadata/response/twelve
// except this first line. Raw r.trace remains untouched; only historical comparison is projected.
const PUBLIC_GUIDE_FIRST_LINE = "Olympus guild direction: **World of Warcraft: Forever · PVE - Alliance · public guild direction · Realm not announced**.";
const HISTORICAL_GUIDE_FIRST_LINE = "Current game: **World of Warcraft: Forever · Beta · Classic Beta PvP 2 · PvP · Alliance**.";
function projectKnownPublicGuide(e) {
  if (e.k !== 'http' || e.method !== 'POST' || e.path !== `/channels/${CH_GUIDE}/messages` || typeof e.body !== 'string') return e;
  let body; try { body = JSON.parse(e.body); } catch { return e; }
  const description = body?.embeds?.[0]?.description;
  if (!Array.isArray(body?.embeds) || typeof description !== 'string' || !description.startsWith(PUBLIC_GUIDE_FIRST_LINE + '\n\n')) return e;
  const marker = '"description":"' + JSON.stringify(PUBLIC_GUIDE_FIRST_LINE).slice(1, -1) + '\\n\\n';
  const replacement = '"description":"' + JSON.stringify(HISTORICAL_GUIDE_FIRST_LINE).slice(1, -1) + '\\n\\n';
  if (e.body.split(marker).length !== 2) return e;
  return { ...e, body: e.body.replace(marker, replacement) };
}
const legacyOf = (r) => r.trace.filter((e) => e.tag === 'legacy').map(({ tag, ...e }) => e.params?{...e,params:e.params.map(projectApprovedManifest)}:projectKnownPublicGuide(e));
const laneOf = (r) => r.trace.filter((e) => e.tag === 'lane');
// The documented A6 texts (configured and the fresh lane open), mapped back to their .160 wording; nothing else is masked.
const A6 = [
  [/(\\+n|\n)New guild roles: removal runs right after this reply \(or at the next role pass\)\./g, ''],
  [/ Your guild roles open the member channels once your verified character appears on a current guild roster export and the access checks pass\./g, ' Your **Olympus Guild Member** role opens the member channels once your verified character appears on the officer-exported guild roster and the access checks pass.'],
  [/ is already linked to your account\. For the guild roles, press \*\*Verify\*\* in the guide and whisper the code from your highest-ranked character in the guild\./g, ' is already verified and in the guild.'],
  [/Your guild roles follow automatically once that character is on a current guild roster export\./g, 'Your Guild Member role follows automatically once that character is on the guild roster — already in the guild? Then it follows as soon as the code is confirmed.'],
  [/The guild roles are removed automatically if no other character of this account is still in the guild\./g, 'The Guild Member role is left as it is; remove it in Discord by hand if they should lose it.'],
];
const mask = (text) => A6.reduce((t, [re, to]) => t.replace(re, to), text);
const digestOf = (r, masked = false) => {
  const legacy = JSON.stringify(legacyOf(r)), response = JSON.stringify(r.response);
  return { trace: sha(masked ? mask(legacy) : legacy), response: sha(masked ? mask(response) : response), twelve: sha(r.twelve), statements: legacyOf(r).filter((e) => e.k === 'sql').length, requests: legacyOf(r).filter((e) => e.k === 'http').length };
};

// Recorded from 5bea76e7 (.160) with IDENTITY_RECORD=1 (see the header): per phase, legacy profile and scenario, the digest of the whole trace
// (statements with binds, batch shapes, Discord requests in order), of the response and of the twelve role_settlements rows.
// files: .160 digests of sources this release must not edit (role-settlements.ts: its 796 original lines, line 18 aside).
const PINS = {
 traces: {
  pre: {
   plain: {
    queue: {"trace":"0068ac34e2799d74696ba97066d7397fab0695f8bccea1d30728c8fa7906ac57","response":"710f19c8e36649c2374f4cbe5f23403d0b8db93e03b1e07f1b5c4c0e453157b5","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":79,"requests":8},
    ingest: {"trace":"6b4e389bd3895cc9f83da0d3c53327196ee9b94c867b11fbb1e0359ae62f292c","response":"d9b5d9eeb489c3c711f1de5d4afcc920f1d2f0fcbc0bf7e5ef5be5e1fb504c4d","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":73,"requests":4},
    ban: {"trace":"85bd3cd5bd320301d2f0a09f49b73036f3bdd5b6dfcabd834f1e2cf3e8a68c0b","response":"29bc7bb6170d70b7df2fed6fd57526b40276ef61f132e01a04245a7fd33ce732","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":51,"requests":3},
    unbind: {"trace":"e5bf51808f146d5452ab54bb9bc1d34f154100155ed22d2c8ad7436a224c8fa8","response":"89818dff03f49f9f0cd2f4c3beae931063a4acbe4765df6207b51babf362ebfd","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":32,"requests":0},
    guide: {"trace":"5c53201588f06e7de2fc3c1271b6261248c90aae2115e8628d392ff11dafbe2c","response":"1095f1a689fa4289e777bffd9ab0e0721e6a2fa084260b8a9436da62c3bd019d","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":24,"requests":1},
    verify: {"trace":"7fc46a60cd6097afce138c61603476319a02ed9d6856fd5fd894b7f49dc1b44a","response":"1470defe51018579fcc9d97389bf542136940c790fde6e7a3aab7e90cd722ea5","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":42,"requests":4},
    button: {"trace":"3d1fdbb419fc53c4950fcaa2478d15440aba3a58c4714f3cbfbdeebc191baf2d","response":"759bfde2246cdddeaade934cbe0d1c93fc1a75a67e2b7e0aa440698146d3965f","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":36,"requests":0},
    cron: {"trace":"d7ba1a44c04fd1bb5b10135a9acf4bc4069315275c772aec17b615162d22293a","response":"a80005d73d2860574f3c983f25165cd05dce6c6851512aed8a6bb0223e62d579","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":37,"requests":8},
   },
   settlement: {
    queue: {"trace":"0bdf1dbdf81aa58b9e4645e1012027aaefa1f3ce3f90882534f476ad98ac23e1","response":"710f19c8e36649c2374f4cbe5f23403d0b8db93e03b1e07f1b5c4c0e453157b5","twelve":"67ff8d9bdf8db6cf76a99ae5767a1345c226ed81ba11d49db39a2577442d8114","statements":81,"requests":13},
    ingest: {"trace":"b76c7b9acf093cc74629fbf70ccc72e4da62f95007ebcfd53042054d79cc039f","response":"d9b5d9eeb489c3c711f1de5d4afcc920f1d2f0fcbc0bf7e5ef5be5e1fb504c4d","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":78,"requests":2},
    ban: {"trace":"a74dd8fab99332dce4f93484032cc300df1082924ea245b27e83a4620529ea9c","response":"6371d72ef554346ddd7752a491bb8d0114419f091f6575bb762f62d64c8c239b","twelve":"67ff8d9bdf8db6cf76a99ae5767a1345c226ed81ba11d49db39a2577442d8114","statements":87,"requests":8},
    unbind: {"trace":"e5bf51808f146d5452ab54bb9bc1d34f154100155ed22d2c8ad7436a224c8fa8","response":"89818dff03f49f9f0cd2f4c3beae931063a4acbe4765df6207b51babf362ebfd","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":32,"requests":0},
    guide: {"trace":"5c53201588f06e7de2fc3c1271b6261248c90aae2115e8628d392ff11dafbe2c","response":"1095f1a689fa4289e777bffd9ab0e0721e6a2fa084260b8a9436da62c3bd019d","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":24,"requests":1},
    verify: {"trace":"d9aed775071c748435f6d8d24bfb413d0e0bc9ee457ca658c5984f60ba741f93","response":"285d9e94f37d14329d4068b9189031cfcea3dc18607579cab19364a7f3ec94c3","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":41,"requests":0},
    button: {"trace":"3d1fdbb419fc53c4950fcaa2478d15440aba3a58c4714f3cbfbdeebc191baf2d","response":"759bfde2246cdddeaade934cbe0d1c93fc1a75a67e2b7e0aa440698146d3965f","twelve":"13b76f597e3f21d47d24d45547f97ba192151c6de4b1bd8cf62c92b986af1666","statements":36,"requests":0},
    cron: {"trace":"9bf88f696fefa69f93b51b09c3a00fb4ea15700c6215ba0b59146af6b633ba78","response":"666dc2b91f83b20e8facadef43339a65b2868eb0f3e90380f4a9d9a2ea0f55f1","twelve":"2414fb32889f365b77e7905271ea84d108ec0e653ff41ba329dd87879d5c1716","statements":61,"requests":13},
   },
  },
  live: {
   plain: {
    queue: {"trace":"72bc52ba7454f418188067bcd5f1fe26a3d8f22f9a520fbd8ed39734f687a921","response":"2ff8d576b221e1211beff64384fdc86286bcdb7c7dade0fcbb8c276fddb7ea9d","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":79,"requests":8},
    ingest: {"trace":"740198d4b71a5b15dc760757c1f9969ebb0d1c5e08f938bbc2de2a94ef22b607","response":"d9b5d9eeb489c3c711f1de5d4afcc920f1d2f0fcbc0bf7e5ef5be5e1fb504c4d","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":73,"requests":4},
    ban: {"trace":"81f7775c483c60e4ab44e4cc3485cda77d1cb8485cd105b814dd0d97c97bef90","response":"97911ca0eb5612a823ef3728ca7eb3b1bbb9a7454a0638d22e2164879b75eddc","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":51,"requests":3},
    unbind: {"trace":"dc0de9a4f60da7391fe5b47119399c36677247291e6aef29895748d953df8bf5","response":"89818dff03f49f9f0cd2f4c3beae931063a4acbe4765df6207b51babf362ebfd","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":32,"requests":0},
    guide: {"trace":"d9bbc1cf5ee69a5d706c045ba95ba476a709a9ebafe372eccec2394b08a4b7ae","response":"1095f1a689fa4289e777bffd9ab0e0721e6a2fa084260b8a9436da62c3bd019d","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":24,"requests":1},
    verify: {"trace":"466ca45a134340ed7ed396ec9b3b575770667ce695e5246e931f82f4353ba018","response":"1470defe51018579fcc9d97389bf542136940c790fde6e7a3aab7e90cd722ea5","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":42,"requests":4},
    button: {"trace":"b69d1cdcae047a77eeb145b0703da43615ad9b7672efdcc6fba03b83d1a1acfc","response":"5aecbad4d2905dc5d086e31f2b31b4a502b42f4dc96ec35c322f5f8df02464b0","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":36,"requests":0},
    cron: {"trace":"0451549921eaadaeaef81da9dc2dcd8fde50b6359e32c34b152bef7da7ed0ee3","response":"a80005d73d2860574f3c983f25165cd05dce6c6851512aed8a6bb0223e62d579","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":37,"requests":8},
   },
   settlement: {
    queue: {"trace":"c54295588dfabc686ed2b0792a4b33e1bb9140e909a549906311b802799152c1","response":"2ff8d576b221e1211beff64384fdc86286bcdb7c7dade0fcbb8c276fddb7ea9d","twelve":"357368b82a4d78c57ce22e2ac1a052dc3d357e20739b19bb68fd695a66828764","statements":132,"requests":20},
    ingest: {"trace":"3f49a3dd637e2255d267b9edb47d336357465aeec97dcde5a3b7ff99cefebb0d","response":"d9b5d9eeb489c3c711f1de5d4afcc920f1d2f0fcbc0bf7e5ef5be5e1fb504c4d","twelve":"053ef21ac52b6e3ac73858afb1d1fb39a9dfbed00f97ab23f12bdd58616ebe47","statements":102,"requests":7},
    ban: {"trace":"4618447065af45f45617a804abd46cb95acb1048f0bfd451c73f80446670fa7a","response":"c787aae8345dafe03e8248af75d9a1b3be1fb8743044dd8fd47fb1e491d9de79","twelve":"42082c8dc7ca527e8597cdad9e2d24340b165ae41a28e6b9531597042606601b","statements":87,"requests":8},
    unbind: {"trace":"dc0de9a4f60da7391fe5b47119399c36677247291e6aef29895748d953df8bf5","response":"89818dff03f49f9f0cd2f4c3beae931063a4acbe4765df6207b51babf362ebfd","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":32,"requests":0},
    guide: {"trace":"d9bbc1cf5ee69a5d706c045ba95ba476a709a9ebafe372eccec2394b08a4b7ae","response":"1095f1a689fa4289e777bffd9ab0e0721e6a2fa084260b8a9436da62c3bd019d","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":24,"requests":1},
    verify: {"trace":"80252e125ce74ea29376a55e8410a68b297707cb1715a33901eeac8abb0c1b56","response":"1470defe51018579fcc9d97389bf542136940c790fde6e7a3aab7e90cd722ea5","twelve":"8ad7926c194c9838f58d0888d5ae15fe1f24e6d3d5198621da49d483bc8222bf","statements":78,"requests":7},
    button: {"trace":"b69d1cdcae047a77eeb145b0703da43615ad9b7672efdcc6fba03b83d1a1acfc","response":"5aecbad4d2905dc5d086e31f2b31b4a502b42f4dc96ec35c322f5f8df02464b0","twelve":"18e25a95602233efa7a0fec0598a8996448faf2a9e01c7975064c4a06772b9a9","statements":36,"requests":0},
    cron: {"trace":"2e25cdaa577914398c94676d9d28d49b978091ed05e2da551696fe4f6edc03b3","response":"f3fd50e0c323834287471077d1cb84b31dc13dab6d10511f571b505422ef3b39","twelve":"253b1e0c354eb50f535a6cc44d863e045fc946299943880a3dcbdd177aca5ef7","statements":90,"requests":20},
   },
  },
 },
 // Exact whole reviewed .164 integrated sources. Historical .160/.163 pins remain below as provenance; trace pins above unchanged.
 files: {
  "role-settlements": "04bf328c854d60033a604e1f8b0e8d26712d3ec40b521985732a723a6d1c5672",
  "roles": "0fb851d804ddb97594a8b4109db3fad46a3f88df8c65475b63f2c79dbf89f6f8",
  "role-rank-continuation": "bf4a2926770bf44af674e7a2ddc6f9b5c029960aaeca66a30947730d9d296561",
  "beta-reset-policy": "8a3e3c7d66683b4720d8869155bc8b27c814d188f0063d79f2270e67bf30022f",
  "beta-reset": "cfc04b75d0e2f1d655db8732d11a4200232b742cb9cbf51653516afa7b781dc3",
  "beta-reset-grants": "07326a14ce06fb2edfe3c137668394ac7854ff856698c328ed22f55d0cf4e78b",
  "privacy-serving-jobs": "52ef6052f0864339b5232b971334ea58bdfa5f3b8f81daa4dc0f7f99e7b2bacc",
  "privacy-serving-erase": "e43e5ebc44e349b7e190d5f97f9ff7be993fa25d2904e2560b3b855f2b1b3950",
  "privacy-erasure-terminal-job-read": "d94cb80468303988518b70b3a17197fb86c485b3d7cd1277e66c6875d84c33b4",
  "privacy-global-serving-origin": "89053632c43fec4e5fd05cc82749ea3362f2907b1a58adee8d1f27e9fd2397ca",
  "roster-effects": "bceddd86f1eb5211e1834b7d6d4231ac51defe04f83decb37917fa68919ece9c",
  "rename-review": "812ec9118cdca40dfabff0282ba43d5c66bdc36644400ee9680e42222e7f4f50",
  "review": "e340b2f9a3536dd3a75427dc722687d931659b2208720b6317032ee1086e324d",
 },
};
// Historical .163 pins replaced only by the owner-reviewed .164 Native erasure integration:
// privacy-serving-jobs 8bc4173310a19a642769b4448e9194573080b8868ea2fd95e85fc61e8f3e879a
// privacy-serving-erase eba67b0a43e39563d544351fe77a102eb0143e1fc142fb28e83a62d7945734aa
// privacy-global-serving-origin 295a2e4d976cd757d460837ae29750e9b92632214486094c49fc85343789def6
// Historical .160 protected-source provenance (trace pins above are still exactly those of .160):
// role-settlements bad16c4d3c773be54b76e85b8f3f8f871269e5cd9f3f1a0be6242be5e9caa37c
// roles bae0474c4c2ab9f3d8441b23cd6b89b3c4d41355d9850b860f1a7c745ff4fb15
// role-rank-continuation 36e2a968c5f71554102ec2851a451c8e85c50dbaa0b16641c8443f534c2f9f5d
// beta-reset-policy 8b48502d76dd6a2af95f290183224b10a5c216fb8ef0e82d5884a7811780cd01
// beta-reset a5af2f3382b11d98016f13940bb70e3dee5df160b651c526668b332be0cad094
// beta-reset-grants eca748dd148cbe753bf795c121fecc4d14f3b8986d6a1d7db369469a4a7f3447
// privacy-serving-jobs 55275829788f55625e553a6d4a81fba44bef14fba06875b031db4a70beba9a1e
// privacy-serving-erase f036406dce1dccfe3ae8c06263f5c288846f181da863eac755f9a82d736a7b55
// privacy-erasure-terminal-job-read fe0a8897f07ca98032cfe6d8dd1a53ac1325068e6998385d381b6699611c7fd0
// privacy-global-serving-origin 9e17369f16bce99172e4c28254e69007f1c602a3e8bd71a44e571a81753505b1
// rename-review fae02f91249fdbc4dc06e30b072ed301c5c0699dfb93c3e449b5bf322332c692

// The last four are not edited by the design either (the deferral host, the statement budgets, the rename and card reviews).
const PROTECTED = ['role-settlements', 'roles', 'role-rank-continuation', 'beta-reset-policy', 'beta-reset', 'beta-reset-grants', 'privacy-serving-jobs', 'privacy-serving-erase', 'privacy-erasure-terminal-job-read',
  'privacy-global-serving-origin', 'roster-effects', 'rename-review', 'review'];
// .196 exact current-source projection: immutable historical whole seals and
// dynamic oracles remain unchanged. The pure helper cannot start either suite.
const { SOURCE196_COMPAT, SOURCE196_CRON, SOURCE198_ROLE_SETTLEMENTS, source196HistoricalDigest } = require('./source196-historical-projection.cjs');
function sourceDigest(name) {
  return source196HistoricalDigest(name, fs.readFileSync(path.join(SRC, name + '.ts'), 'utf8'));
}
/** Static value imports among src/*.ts (type-only imports and dynamic import() excluded). */
function staticGraph() {
  const graph = {};
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
    const sf = ts.createSourceFile(f, fs.readFileSync(path.join(SRC, f), 'utf8'), ts.ScriptTarget.ES2022, true), deps = new Set();
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        const ic = st.importClause; if (ic && ic.isTypeOnly) continue;
        const nb = ic && ic.namedBindings, value = !ic || !!ic.name || !!nb && (ts.isNamespaceImport(nb) || nb.elements.length === 0 || nb.elements.some((e) => !e.isTypeOnly));
        if (value && st.moduleSpecifier.text.startsWith('./')) deps.add(st.moduleSpecifier.text.slice(2));
      } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.isTypeOnly && st.moduleSpecifier.text.startsWith('./')) deps.add(st.moduleSpecifier.text.slice(2));
    }
    graph[f.slice(0, -3)] = [...deps];
  }
  return graph;
}
const closure = (graph, from) => { const seen = new Set(), stack = [from]; while (stack.length) for (const d of graph[stack.pop()] || []) if (!seen.has(d)) { seen.add(d); stack.push(d); } return seen; };

let passed = 0, failed = 0;
function check(name, value, detail) { if (value) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name); if (detail !== undefined) console.log('   ', typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 2000)); } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NEW_TEXT = { ban: 'New guild roles: removal runs right after this reply (or at the next role pass).', guide: 'Your guild roles open the member channels',
  verify: 'is already linked to your account. For the guild roles, press **Verify**', button: 'Your guild roles follow automatically once that character is on a current guild roster export.',
  unbind: 'The guild roles are removed automatically if no other character of this account is still in the guild.' };

(async () => {
  keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  pub = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
  if (DUMP) {
    const [phase, profile, variant, scenario] = DUMP.split(':');
    const r = await runOnce(phase, profile, variant, scenario);
    console.log(JSON.stringify({ digest:digestOf(r),response: r.response, errors: r.errors, laneCalls: r.laneCalls, discord: r.discord, twelve: r.twelve, trace:r.trace }, null, 1));
    for (const e of r.trace) console.log(e.tag.padEnd(6), e.k === 'sql' ? 'SQL ' + e.sql.replace(/\s+/g, ' ').slice(0, 160) + ' ' + JSON.stringify(e.params).slice(0, 160) : e.k === 'batch' ? 'BATCH ' + e.n : `HTTP ${e.method} ${e.path} ${(e.body || '').slice(0, 200)}`);
    return;
  }
  if (RECORD) { // against the .160 source: one recording per phase and scenario, and .160 must ignore both variables
    const pins = { traces: {}, files: {} };
    for (const phase of Object.keys(PHASES)) for (const profile of Object.keys(PROFILES)) for (const scenario of Object.keys(SCENARIOS)) {
      const base = await runOnce(phase, profile, 'absent', scenario), d = digestOf(base);
      if (base.errors.length || !d.statements) throw Error(`recording ${phase}/${profile}/${scenario} is not usable: ${JSON.stringify(base.errors)}`);
      for (const variant of Object.keys(VARIANTS).filter((v) => v !== 'absent')) if (!same(digestOf(await runOnce(phase, profile, variant, scenario)), d)) throw Error(`.160 differs under ${variant} (${phase}/${profile}/${scenario})`);
      ((pins.traces[phase] ??= {})[profile] ??= {})[scenario] = d;
    }
    for (const name of PROTECTED) pins.files[name] = sourceDigest(name);
    console.log('const PINS = ' + JSON.stringify(pins, null, 1) + ';');
    return;
  }
  if (!PINS) throw Error('PINS not recorded');

  // --- static: whole reviewed .164 integrated sources; the lane modules are never part of a module-load cycle
  for (const name of PROTECTED) check(SOURCE196_COMPAT[name] ? `${name}.ts reconstructs the reviewed .164 whole source through exact pinned .196 contextual reversals only` : `${name}.ts is byte-identical to the reviewed .164 integrated source`, sourceDigest(name) === PINS.files[name]);
  // .198: the owner-approved absent empty duplicate changes three qualification
  // contexts only. Historical file seals and every dynamic trace below stay fixed.
  const role198Raw = fs.readFileSync(path.join(SRC, 'role-settlements.ts'), 'utf8'), role198Pin = SOURCE198_ROLE_SETTLEMENTS;
  check('.198 role compatibility accepts only the exact raw source and three unique reviewed contexts', sha(role198Raw) === role198Pin.exactCurrentRawSHA256 && role198Pin.edits.length === 3 && role198Pin.edits.every(edit => edit.count === 1 && role198Raw.split(edit.from).length === 2) && source196HistoricalDigest('role-settlements', role198Raw) === PINS.files['role-settlements']);
  const role197Raw = role198Pin.edits.reduce((raw, edit) => raw.replace(edit.from, edit.to), role198Raw);
  check('.198 role compatibility reconstructs the entire accepted .197 source before all unchanged historical seals', sha(role197Raw) === role198Pin.exact197RawSHA256 && source196HistoricalDigest('role-settlements', role197Raw) === PINS.files['role-settlements']);
  const role198Mutations = [
    ['unreviewed prefix', '// unreviewed role context\n' + role198Raw],
    ['unreviewed suffix', role198Raw + '\n// unreviewed role context\n'],
    ['unrelated whitespace', role198Raw.replace('import ', 'import  ')],
    ['changed qualifying parameter', role198Raw.replace('allowMissingBetaDuplicate=false', 'allowMissingBetaDuplicate=true')],
    ['changed duplicate identity', role198Raw.replace("roleId==='1558657538960916490'", "roleId==='1552077551839617104'")],
    ['missing no-grant guard', role198Raw.replace('allowMissingBetaDuplicate&&!grant&&!cosmetic', 'allowMissingBetaDuplicate&&!cosmetic')],
    ['missing no-ghost guard', role198Raw.replace('!target?.roles.includes(roleId)&&', '')],
    ['duplicate qualifying loop', role198Raw.replace(role198Pin.edits[1].from, role198Pin.edits[1].from + role198Pin.edits[1].from)],
    ['changed accepted .197 source', role197Raw + '\n// unreviewed accepted role source\n'],
  ];
  for (const [label, raw] of role198Mutations) check('.198 role compatibility refuses ' + label, raw !== role198Raw && raw !== role197Raw && source196HistoricalDigest('role-settlements', raw) === null);
  check('.198 role compatibility preserves exact raw line-ending custody', source196HistoricalDigest('role-settlements', role198Raw.replace(/\n/g, '\r\n')) === null);
  // .197: exact finite namespace15 compatibility must not admit any other source change.
  // These pure mutations run in this existing original198/CI suite before its unchanged dynamic oracles.
  const erase197Raw = fs.readFileSync(path.join(SRC, 'privacy-serving-erase.ts'), 'utf8');
  const erase197Guard = " const facts=originalClosedRecoveryCleanupAccount(selection,env);facts.check();const namespaces=communityDataNames().slice().sort();if(namespaces.length!==15||JSON.stringify(namespaces)!==\"[\\\"contributions\\\",\\\"councillor_verification\\\",\\\"departures\\\",\\\"directory\\\",\\\"discord_directory_visibility\\\",\\\"event_delivery\\\",\\\"event_reminders\\\",\\\"events\\\",\\\"news\\\",\\\"news_webhook\\\",\\\"privacy_access\\\",\\\"refs\\\",\\\"restrictions\\\",\\\"ruleset_publication\\\",\\\"trials\\\"]\")throw Error('closed_recovery_cleanup_namespace_incomplete');const registered=new WeakMap<object,OriginalClosedCleanupStep>();\n";
  const erase196Guard = " const facts=originalClosedRecoveryCleanupAccount(selection,env);facts.check();const namespaces=communityDataNames().slice().sort();if(namespaces.length!==13||JSON.stringify(namespaces)!==\"[\\\"contributions\\\",\\\"councillor_verification\\\",\\\"departures\\\",\\\"directory\\\",\\\"event_delivery\\\",\\\"event_reminders\\\",\\\"events\\\",\\\"news\\\",\\\"privacy_access\\\",\\\"refs\\\",\\\"restrictions\\\",\\\"ruleset_publication\\\",\\\"trials\\\"]\")throw Error('closed_recovery_cleanup_namespace_incomplete');const registered=new WeakMap<object,OriginalClosedCleanupStep>();\n";
  check('.197 closed namespace projection accepts only the exact reviewed current raw source and unique guard', sha(erase197Raw) === 'aca1c0e136c1374b58235d5ec9cc8c9f02f3e209fc5b12e90881035ce98b4a12' && erase197Raw.split(erase197Guard).length === 2 && source196HistoricalDigest('privacy-serving-erase', erase197Raw) === PINS.files['privacy-serving-erase']);
  const erase196Raw = erase197Raw.replace(erase197Guard, erase196Guard);
  check('.197 closed namespace projection reconstructs the entire accepted .196 source before unchanged .164 seals', sha(erase196Raw) === 'ae7545ccdb4e49524d71b4fd0189b8a90d9d84f5768c44e30d89b622466124e8' && source196HistoricalDigest('privacy-serving-erase', erase196Raw) === PINS.files['privacy-serving-erase']);
  const erase197Mutations = [
    ['unreviewed prefix', '// unreviewed namespace context\n' + erase197Raw],
    ['unreviewed suffix', erase197Raw + '\n// unreviewed namespace context\n'],
    ['other source whitespace', erase197Raw.replace('import ', 'import  ')],
    ['missing registered family', erase197Raw.replace(erase197Guard, erase197Guard.replace('news_webhook', ''))],
    ['duplicate registered family', erase197Raw.replace(erase197Guard, erase197Guard.replace('news_webhook', 'news'))],
    ['wrong family count', erase197Raw.replace(erase197Guard, erase197Guard.replace('namespaces.length!==15', 'namespaces.length!==14'))],
    ['old count with current families', erase197Raw.replace(erase197Guard, erase197Guard.replace('namespaces.length!==15', 'namespaces.length!==13'))],
    ['duplicated contextual guard', erase197Raw.replace(erase197Guard, erase197Guard + erase197Guard)],
    ['changed accepted .196 source', erase196Raw + '\n// unreviewed accepted-source context\n'],
  ];
  for (const [label, raw] of erase197Mutations) check('.197 closed namespace compatibility refuses ' + label, raw !== erase197Raw && raw !== erase196Raw && source196HistoricalDigest('privacy-serving-erase', raw) === null);
  check('.197 closed namespace compatibility retains exact raw line-ending custody', source196HistoricalDigest('privacy-serving-erase', erase197Raw.replace(/\n/g, '\r\n')) === null);
  modules=new Map();const exactManifest=load('privacy-write-admission-catalogue').ADMISSION_EXPECTED_JSON;
  check('the unprojected Native manifest is the exact reviewed224-trigger profile, including all three immutable-seal guards',sha(exactManifest)===COMPOSED_MANIFEST_SHA&&JSON.parse(exactManifest).triggers.length===224);
  const graph = staticGraph(), lanes = closure(graph, 'full-release-roles');
  check('full-release-roles is in no static import cycle (nothing it reaches imports it by value: roster.ts and guide.ts take the capture by parameter)',
    !lanes.has('full-release-roles') && [...lanes].every((m) => !(graph[m] || []).includes('full-release-roles')));
  check('full-release-pass is loaded only by dynamic import (no static value import anywhere in src)', Object.values(graph).every((deps) => !deps.includes('full-release-pass')));
  const indexText = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  check('index.ts keeps original Native normalization/entry dispatch/queue and exact current membership-first bounded Treasury cron wrapper',
    indexText.includes(`async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {\n    env=nativeServingEnvironment(env);\n    const roleDispatch=captureBetaRoleDispatch(env);`)
    &&indexText.includes(`async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {\n    env=nativeServingEnvironment(env);\n    const roleDispatch=captureBetaRoleDispatch(env);`)
    &&indexText.includes(`if (!lane.configured) deferOriginalServing(ctx,'queue_member_roles',()=>sweepMemberRoles(env, "watcher",undefined,roleDispatch));`)
    && indexText.split(SOURCE196_CRON).length === 2);

  // --- dynamic: every phase, scenario and variant against the .160 pins
  for (const phase of Object.keys(PHASES)) for (const profile of Object.keys(PROFILES)) for (const scenario of Object.keys(SCENARIOS)) {
    const pin = PINS.traces[phase][profile][scenario];
    for (const variant of Object.keys(VARIANTS)) {
      const r = await runOnce(phase, profile, variant, scenario), where = `${phase}/${profile}/${scenario}/${variant}`, lane = laneOf(r);
      check(`${where}: no deferred work threw`, r.errors.length === 0, r.errors);
      if (UNCONFIGURED.includes(variant)) {
        check(`${where}: identical to .160${scenario === 'guide' ? ' after only the bounded known public-guide first-line projection' : ''} (statements, binds, batch shapes, Discord requests, response, twelve rows); no lane function ran`,
          same(digestOf(r), pin) && lane.length === 0 && r.laneCalls.length === 0, { got: digestOf(r), pin, laneCalls: r.laneCalls });
        continue;
      }
      const open = variant === 'configured' && phase === 'live';
      check(`${where}: the legacy subsequence equals .160${open ? ' after masking only the documented A6 texts' : ' (unmasked)'}${scenario === 'guide' ? ' plus the bounded known public-guide first-line projection' : ''}; the twelve rows end as under .160`, same(digestOf(r, open), pin), { got: digestOf(r, open), pin });
      const touched = lane.filter((e) => TWELVE.some((t) => JSON.stringify(e).includes(t)));
      check(`${where}: no lane statement or request names a twelve role ID`, touched.length === 0, touched.slice(0, 3));
      const effects = lane.filter((e) => e.k === 'http' && (e.method === 'PUT' || e.method === 'DELETE'));
      const ownIds = [FM, ...N];
      if (open && (scenario === 'queue' || scenario === 'ingest'))
        check(`${where}: the fresh pass ran after the legacy work and changed only fresh roles (grant and ban rotation)`, r.laneCalls.join() === 'runFreshPass' && effects.length >= 3
          && effects.every((e) => ownIds.some((x) => e.path.endsWith('/roles/' + x))) && effects.some((e) => e.method === 'PUT') && effects.some((e) => e.method === 'DELETE'), effects.map((e) => e.method + ' ' + e.path));
      else if (open && scenario === 'ban')
        check(`${where}: the ban deferral removed the banned member's fresh roles, nothing else`, r.laneCalls.join() === 'settleLaneBan' && effects.length === 2
          && effects.every((e) => e.method === 'DELETE' && e.path.includes('/members/' + U2 + '/roles/') && ownIds.some((x) => e.path.endsWith('/roles/' + x))), effects.map((e) => e.method + ' ' + e.path));
      else if ((variant === 'held' || variant === 'configured') && (scenario === 'queue' || scenario === 'ingest'))
        check(`${where}: held mode${variant === 'configured' ? ' (the staff lane, P1-B)' : ''} audits role.fresh_config_held and posts one officer line, with no role effect`, effects.length === 0
          && lane.some((e) => e.k === 'sql' && e.params.includes('role.fresh_config_held')) && lane.filter((e) => e.k === 'http').length === 1, lane.map((e) => e.k === 'http' ? e.path : e.k));
      else check(`${where}: no lane statement or request (clock-gated before epochStart, or nothing registered)`, lane.length === 0, lane.slice(0, 3));
      if (variant === 'configured' && (scenario === 'queue' || scenario === 'ingest'))
        check(`${where}: P1-B: the staff lane is held legacy_privileged_producer_reachable (audited); no lane request names a staff role`,
          lane.some((e) => e.k === 'sql' && e.params.includes('role.fresh_config_held') && e.params.some((p) => typeof p === 'string' && p.includes('"staff":"legacy_privileged_producer_reachable"')))
          && !lane.some((e) => e.k === 'http' && [OFF, GL, RL].some((x) => e.path.includes('/roles/' + x))), lane.filter((e) => e.k === 'sql' && e.params.includes('role.fresh_config_held')));
      if (NEW_TEXT[scenario] && variant === 'configured') {
        const shown = JSON.stringify(r.trace) + JSON.stringify(r.response);
        check(`${where}: the A6 text is ${open ? 'shown' : 'not shown before epochStart'}`, shown.includes(NEW_TEXT[scenario]) === open);
      }
    }
  }
  // --- a refused registration (design test 18): configured, the response stays .160's (A6-masked) and role.fresh_failed is written.
  // The /queue deferral carries the legacy sweep, so there a refusal propagates as .160's does: the expected response is the
  // unconfigured run's under the same refusal (that branch is .160's statement verbatim), an error unlike the normal pin.
  for (const scenario of ['queue', 'ingest', 'ban']) {
    const r = await runOnce('live', 'plain', 'configured', scenario, true), pin = PINS.traces.live.plain[scenario];
    const base = scenario === 'queue' ? (await runOnce('live', 'plain', 'absent', scenario, true)).response : null;
    const shape = (res) => res && { status: res.status, body: String(res.body).replace(/"requestId":"[0-9a-f]+"/g, '"requestId":"#"') }; // a fresh id per request
    const matches = scenario === 'queue' ? sha(mask(JSON.stringify(shape(r.response)))) === sha(JSON.stringify(shape(base))) && base.status !== 200
      : sha(mask(JSON.stringify(r.response))) === pin.response;
    check(`live/plain/${scenario}/configured, registration refused: the response is .160's under the same refusal and role.fresh_failed records it`,
      matches && r.freshFailed.length === 1 && r.freshFailed[0].subject === (scenario === 'queue' ? 'watcher' : scenario)
      && JSON.parse(r.freshFailed[0].details).error === 'registration_refused', { response: r.response, base, failed: r.freshFailed });
  }
  check('every observed unprojected Native manifest equals the reviewed224-trigger profile; no other manifest was projected',observedManifests.size===1&&[...observedManifests].every(raw=>sha(raw)===COMPOSED_MANIFEST_SHA));
  console.log(`\n${passed}/${passed + failed} identity checks passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });

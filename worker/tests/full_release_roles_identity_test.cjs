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
const ban210 = require('./ban210_identity_contract.cjs');
const held210 = require('./restore_held210_identity_contract.cjs');
const recovery217 = require('./verify_recovery217_identity_contract.cjs');
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
let trace = [], members = {}, messageSeq = {}, patchReceipts = [], TWELVE = null;
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  if (u.origin !== 'https://discord.com' || !u.pathname.startsWith('/api/v10/')) throw Error('blocked synthetic network');
  const p = u.pathname.slice('/api/v10'.length), headers = new Headers(init.headers || {}), tag = tagNow();
  trace.push({ k: 'http', tag, method, path: p + u.search, body: init.body == null ? null : String(init.body), reason: headers.get('X-Audit-Log-Reason') });
  // The ban210 successor uses exactly this original response edit. Other new
  // endpoints still refuse; this receipt is separate from the untouched trace.
  if (method === 'PATCH' && p === `/webhooks/${BOT}/synthetic-token/messages/@original` && !u.search) {
    const body = JSON.parse(init.body);
    if (Object.keys(body).sort().join(',') !== 'allowed_mentions,content' || typeof body.content !== 'string' || body.content.length > 2000 || JSON.stringify(body.allowed_mentions) !== '{"parse":[]}') throw Error('unexpected original-response body');
    patchReceipts.push({status:200,path:p,contentSHA256:nodeCrypto.createHash('sha256').update(body.content).digest('hex'),mentionsDisabled:true});
    return json({id:'synthetic-original-message'});
  }
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
  T = PHASES[phase]; streams = {}; trace = []; messageSeq = {}; patchReceipts = []; laneCalls = []; modules = new Map();
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
  return { trace, response, twelve, errors, laneCalls: laneCalls.slice(), discord: JSON.parse(JSON.stringify(members)), freshFailed, patchReceipts:patchReceipts.slice(), comparisonScenario:scenario };
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
// .265 historical comparison only. The complete current read proof has one
// approved index hint; no raw trace, Native execution or historical pin changes.
const READ_PROOF265=Object.freeze({currentBytes:4690,currentSHA256:'1eb1ac8a411546ce206a0e7922bb1dd1bcb1784e25ab7354251cc44501dcba57',historicalBytes:4660,historicalSHA256:'13727700584b154fcaa3b39b4bf5555b5fc4d97ceb0a464628d509d49ca0eeda',
 currentWindow:"FROM audit INDEXED BY audit_actor_action WHERE action='site.settings'",historicalWindow:"FROM audit WHERE action='site.settings'"});
let readProofControls265Done=false;
function comparisonReadProof265(input,requiredCount=null){
 if(!Array.isArray(input)||requiredCount!==null&&(!Number.isSafeInteger(requiredCount)||requiredCount<1))throw Error('identity265_read_proof_trace');
 let count=0,first=null;const output=input.map(frame=>{
  if(!frame||frame.k!=='sql'||frame.tag!=='legacy'||typeof frame.sql!=='string'||Buffer.byteLength(frame.sql)!==READ_PROOF265.currentBytes||sha(frame.sql)!==READ_PROOF265.currentSHA256)return frame;
  if(Object.keys(frame).join(',')!=='k,tag,sql,params'||!Array.isArray(frame.params)||Object.keys(frame.params).join(',')!=='0,1,2,3'||frame.params.length!==4||frame.params[0]!==''||frame.params[1]!==''||typeof frame.params[2]!=='string'||sha(frame.params[2])!==COMPOSED_MANIFEST_SHA||frame.params[3]!=='a'.repeat(32))throw Error('identity265_read_proof_tuple');
  if(frame.sql.split(READ_PROOF265.currentWindow).length!==2)throw Error('identity265_read_proof_window');
  const historical=frame.sql.replace(READ_PROOF265.currentWindow,READ_PROOF265.historicalWindow);
  if(Buffer.byteLength(historical)!==READ_PROOF265.historicalBytes||sha(historical)!==READ_PROOF265.historicalSHA256)throw Error('identity265_read_proof_inverse');
  count++;first??=frame;return {...frame,sql:historical};
 });
 if(count<1||requiredCount!==null&&count!==requiredCount)throw Error('identity265_read_proof_count');
 return {trace:output,count,first};
}
function comparisonReadProofControls265(frame){
 const immutable=Object.freeze({...frame,params:Object.freeze(frame.params.slice())}),single=Object.freeze([immutable]),originalSQL=immutable.sql;
 const copied=comparisonReadProof265(single,1);
 check('.265 exact actual read-proof copy preserves raw tuple, keys and binds',single[0]===immutable&&immutable.sql===originalSQL&&sha(immutable.sql)===READ_PROOF265.currentSHA256&&copied.trace.length===1&&Object.keys(copied.trace[0]).join(',')===Object.keys(immutable).join(',')&&copied.trace[0].params===immutable.params&&sha(copied.trace[0].sql)===READ_PROOF265.historicalSHA256);
 const badBinds=[['first bind',['x',...immutable.params.slice(1)]],['second bind',['','x',...immutable.params.slice(2)]],['manifest',[...immutable.params.slice(0,2),immutable.params[2]+' ',immutable.params[3]]],['epoch',[...immutable.params.slice(0,3),'b'.repeat(32)]],['bind order',[immutable.params[2],immutable.params[1],immutable.params[0],immutable.params[3]]],['extra bind',[...immutable.params,1]]];
 const probes=[['missing',[]],['duplicate',[immutable,immutable]],['SQL prefix',[{...immutable,sql:' '+immutable.sql}]],['SQL suffix',[{...immutable,sql:immutable.sql+' '}]],['SQL line endings',[{...immutable,sql:immutable.sql.replaceAll('\n','\r\n')}]],['changed index',[{...immutable,sql:immutable.sql.replace('audit_actor_action WHERE','audit_ts WHERE')}]],['wrong context',[{...immutable,tag:'lane'}]],['wrong kind',[{...immutable,k:'http'}]],['extra key',[{...immutable,extra:true}]],['key order',[{tag:immutable.tag,k:immutable.k,sql:immutable.sql,params:immutable.params}]],...badBinds.map(([name,params])=>[name,[{...immutable,params}]])];
 for(const[name,input]of probes){let refused=false;try{comparisonReadProof265(input,1);}catch{refused=true;}check('.265 exact read-proof comparison refuses '+name,refused);}
 const other=Object.freeze({k:'sql',tag:'legacy',sql:'SELECT 1 AS untouched265',params:Object.freeze([1])}),batch=Object.freeze({k:'batch',tag:'legacy',n:2}),http=Object.freeze({k:'http',tag:'legacy',method:'GET',path:'/synthetic265',body:null,reason:null}),lane=Object.freeze({...immutable,tag:'lane'});
 const mixed=Object.freeze([batch,immutable,other,http,lane]),mixedCopy=comparisonReadProof265(mixed,1);
 check('.265 comparison retains every other statement/bind/batch/HTTP/context frame by identity and order',mixedCopy.trace.length===mixed.length&&mixed.every((value,index)=>index===1?mixedCopy.trace[index]!==value&&mixedCopy.trace[index].params===value.params:mixedCopy.trace[index]===value));
 const doubled=comparisonReadProof265([immutable,immutable]);
 check('.265 duplicate proof is never collapsed or hidden from historical trace/count oracle',doubled.trace.length===2&&doubled.count===2&&sha(doubled.trace)!==sha(copied.trace)&&doubled.trace.every(value=>value.params===immutable.params));
}
// A paired original guide raw dump proved identical30events/SQL/binds/batches/HTTPmetadata/response/twelve
// except this first line. Raw r.trace remains untouched; only historical comparison is projected.
const PUBLIC_GUIDE_FIRST_LINE = "Olympus guild direction: **World of Warcraft: Forever · PVE - Alliance · public guild direction · Realmless (ruleset-based)**.";
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
const legacyOfBefore227 = (r) => r.trace.filter((e) => e.tag === 'legacy').map(({ tag, ...e }) => e.params?{...e,params:e.params.map(projectApprovedManifest)}:projectKnownPublicGuide(e));
// Only the sealed readonly roster query gains one source projection in .227.
// Raw r.trace remains current; the helper checks its exact tuple/count before
// supplying a copy for the unchanged historical digest and order/row oracles.
const legacyOf = (r) => legacyOfBefore227({...r,trace:source227.traceInverse(r.trace)});
const laneOf = (r) => r.trace.filter((e) => e.tag === 'lane');
// The documented A6 texts (configured and the fresh lane open), mapped back to their .160 wording; nothing else is masked.
const A6 = [
  [/(\\+n|\n)New guild roles: removal runs right after this reply \(or at the next role pass\)\./g, ''],
  [/ Your guild roles open the member channels once your verified character appears on a current guild roster export and the access checks pass\./g, ' Your **Olympus Guild Member** role opens the member channels once your verified character appears on the officer-exported guild roster and the access checks pass.'],
  [/ is already linked to your account\. For the guild roles, press \*\*Get my code\*\* in the guide and whisper the code from your highest-ranked character in the guild\./g, ' is already verified and in the guild.'],
  [/Your guild roles follow automatically once that character is on a current guild roster export\./g, 'Your Guild Member role follows automatically once that character is on the guild roster — already in the guild? Then it follows as soon as the code is confirmed.'],
  [/The guild roles are removed automatically if no other character of this account is still in the guild\./g, 'The Guild Member role is left as it is; remove it in Discord by hand if they should lose it.'],
];
const mask = (text) => A6.reduce((t, [re, to]) => t.replace(re, to), text);
// The finite successor helpers also pin whole physical traces. Supply only the
// same closed read-proof inverse as a comparison copy; retain their raw guards.
function successorReadProofComparison265(trace,banLiveConfiguredLane=false){
  const rawCurrentTraceSHA256=sha(trace),comparison=comparisonReadProof265(trace),lane=banLiveConfiguredLane?successorLaneReadProof265(comparison.trace):null,copy=lane?.trace??comparison.trace;
  if(lane&&!successorLaneControls265Done){successorLaneReadProofControls265(comparison.first,lane.first);successorLaneControls265Done=true;}
  const retained=trace.every((frame,index)=>copy[index]===frame||frame.k==='sql'&&(frame.tag==='legacy'||banLiveConfiguredLane&&frame.tag==='lane')&&frame.params===copy[index].params&&sha(frame.sql)===READ_PROOF265.currentSHA256&&sha(copy[index].sql)===READ_PROOF265.historicalSHA256);
  if(rawCurrentTraceSHA256!==sha(trace)||!retained||copy.length!==trace.length)throw Error('identity265_successor_trace_drift');
  const historicalProof=copy[trace.indexOf(comparison.first)],historicalLane=lane?copy[trace.indexOf(lane.first)]:null;
  return {trace:copy,witness:{kind:'strict_readproof_projection_copy_for_historical_successor_comparison',legacyFrames:comparison.count,laneFrames:lane?.count??0,currentProofBytes:Buffer.byteLength(comparison.first.sql),currentProofSHA256:sha(comparison.first.sql),historicalProofBytes:Buffer.byteLength(historicalProof.sql),historicalProofSHA256:sha(historicalProof.sql),manifestSHA256:sha(comparison.first.params[2]),canonicalBindCount:comparison.first.params.length,laneCurrentProofSHA256:lane?sha(lane.first.sql):null,laneHistoricalProofSHA256:historicalLane?sha(historicalLane.sql):null,laneCanonicalBindCount:lane?lane.first.params.length:null,rawCurrentTraceSHA256,projectionCopyTraceSHA256:sha(copy),rawCurrentTraceRetained:true,allOtherFramesRetained:retained,traceLengthUnchanged:true}};
}
// Only the live configured ban's whole-trace successor includes admitted lane
// reads. Keep the original legacy inverse and its default/controls unchanged.
let successorLaneControls265Done=false;
function successorLaneReadProof265(input,requiredCount=null){
  if(!Array.isArray(input)||requiredCount!==null&&(!Number.isSafeInteger(requiredCount)||requiredCount<1))throw Error('identity265_lane_read_proof_trace');
  let count=0,first=null;
  const trace=input.map(frame=>{
    if(!frame||frame.k!=='sql'||frame.tag!=='lane'||typeof frame.sql!=='string'||Buffer.byteLength(frame.sql)!==READ_PROOF265.currentBytes||sha(frame.sql)!==READ_PROOF265.currentSHA256)return frame;
    if(Object.keys(frame).join(',')!=='k,tag,sql,params'||!Array.isArray(frame.params)||Object.keys(frame.params).join(',')!=='0,1,2,3'||frame.params.length!==4||frame.params[0]!==''||frame.params[1]!==''||typeof frame.params[2]!=='string'||sha(frame.params[2])!==COMPOSED_MANIFEST_SHA||frame.params[3]!=='a'.repeat(32))throw Error('identity265_lane_read_proof_tuple');
    if(frame.sql.split(READ_PROOF265.currentWindow).length!==2)throw Error('identity265_lane_read_proof_window');
    const historical=frame.sql.replace(READ_PROOF265.currentWindow,READ_PROOF265.historicalWindow);
    if(Buffer.byteLength(historical)!==READ_PROOF265.historicalBytes||sha(historical)!==READ_PROOF265.historicalSHA256)throw Error('identity265_lane_read_proof_inverse');
    count++;first??=frame;return {...frame,sql:historical};
  });
  if(count<1||requiredCount!==null&&count!==requiredCount)throw Error('identity265_lane_read_proof_count');
  return {trace,count,first};
}
function successorLaneReadProofControls265(legacyFrame,frame){
  const immutable=Object.freeze({...frame,params:Object.freeze(frame.params.slice())}),single=Object.freeze([immutable]),copied=successorLaneReadProof265(single,1);
  check('.265 ban lane comparison preserves original raw tuple and canonical binds',single[0]===immutable&&sha(immutable.sql)===READ_PROOF265.currentSHA256&&sha(copied.trace[0].sql)===READ_PROOF265.historicalSHA256&&copied.trace[0].params===immutable.params);
  const binds=[['first bind',['x',...immutable.params.slice(1)]],['second bind',['','x',...immutable.params.slice(2)]],['manifest',[...immutable.params.slice(0,2),immutable.params[2]+' ',immutable.params[3]]],['epoch',[...immutable.params.slice(0,3),'b'.repeat(32)]],['bind order',[immutable.params[2],immutable.params[1],immutable.params[0],immutable.params[3]]],['extra bind',[...immutable.params,1]]];
  const probes=[['missing',[],'count'],['duplicate',[immutable,immutable],'count'],['SQL prefix',[{...immutable,sql:' '+immutable.sql}],'count'],['SQL suffix',[{...immutable,sql:immutable.sql+' '}],'count'],['SQL line endings',[{...immutable,sql:immutable.sql.replaceAll('\n','\r\n')}],'count'],['changed index',[{...immutable,sql:immutable.sql.replace('audit_actor_action WHERE','audit_ts WHERE')}],'count'],['legacy context',[{...immutable,tag:'legacy'}],'count'],['foreign context',[{...immutable,tag:'foreign'}],'count'],['wrong kind',[{...immutable,k:'http'}],'count'],['extra key',[{...immutable,extra:true}],'tuple'],['key order',[{tag:immutable.tag,k:immutable.k,sql:immutable.sql,params:immutable.params}],'tuple'],...binds.map(([name,params])=>[name,[{...immutable,params}],'tuple'])];
  for(const[name,input,reason]of probes){let refused=false;try{successorLaneReadProof265(input,1);}catch(error){if(!(error instanceof Error)||error.message!=='identity265_lane_read_proof_'+reason)throw error;refused=true;}check('.265 exact ban lane comparison refuses '+name,refused);}
  const defaultCopy=successorReadProofComparison265([legacyFrame,immutable]);
  check('.265 default successor comparison leaves lane proof untouched outside live configured ban',defaultCopy.trace[1]===immutable&&defaultCopy.witness.laneFrames===0);
}
const digestOf = (r, masked = false) => {
  // Exact paired public-copy comparison only; raw r.trace/r.response remain current.
  if(!RECORD&&!DUMP){
    const required={guide:r.comparisonScenario==='guide'?1:0,cache:r.comparisonScenario==='button'?1:0};
    const comparison247={trace:source247.comparisonTrace(r.trace,masked,required),response:source247.comparisonResponse(r.response,masked,r.comparisonScenario==='button')};
    r={...r,trace:source230.copyTrace(comparison247.trace,masked,required),response:source230.copyResponse(comparison247.response,masked,r.comparisonScenario==='button')};
    const current=r.trace,comparison265=comparisonReadProof265(current);
    if(!readProofControls265Done){comparisonReadProofControls265(comparison265.first);readProofControls265Done=true;}
    const retained=current.every((frame,index)=>comparison265.trace[index]===frame||frame.k==='sql'&&frame.tag==='legacy'&&frame.params===comparison265.trace[index].params&&sha(frame.sql)===READ_PROOF265.currentSHA256&&sha(comparison265.trace[index].sql)===READ_PROOF265.historicalSHA256);
    if(!retained||comparison265.trace.length!==current.length)throw Error('identity265_other_trace_drift');
    console.log('IDENTITY265_READ_PROOF_COMPARISON_WITNESS',JSON.stringify({scenario:r.comparisonScenario,frames:comparison265.count,currentBytes:READ_PROOF265.currentBytes,currentSHA256:READ_PROOF265.currentSHA256,historicalBytes:READ_PROOF265.historicalBytes,historicalSHA256:READ_PROOF265.historicalSHA256,manifestSHA256:sha(comparison265.first.params[2]),canonicalBindCount:comparison265.first.params.length,rawSQLRetained:sha(comparison265.first.sql)===READ_PROOF265.currentSHA256,allOtherFramesRetained:retained,traceLengthUnchanged:true}));
    r={...r,trace:comparison265.trace};
  }
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
// .211 changes restriction-only Treasury/provider seams. Authenticate the
// finite static reconstruction helper; the runtime loader above is untouched.
if (nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'source211-historical-projection.cjs'))).digest('hex') !== 'db8684b7c2a202c99cfc58442cd1ba500fc0b572230029d357be8e64cf1b5093') throw Error('reviewed211 identity helper differs');
const source211 = require('./source211-historical-projection.cjs');
if (nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'source227-role-historical-projection.cjs'))).digest('hex') !== 'c657132d9f48b27adeddb10dad3a72ae44e13fcdde6b8004e9cacccf88179305') throw Error('reviewed227 identity helper differs');
const source227 = require('./source227-role-historical-projection.cjs');
if(nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'source230-membership-static-projection.cjs'))).digest('hex')!=='eb38cbf11209b4ef56f052e5e54b117d6fffdbd40d764faa00aa5708468c5f63')throw Error('reviewed230 identity helper differs');
const source230=require('./source230-membership-static-projection.cjs');
// Exact .238 cost-label source inverse is STATIC ONLY; runtime source stays current.
if(nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'source238-canonical-minute-static-projection.cjs'))).digest('hex')!=='4cc3bcda017a18d768b249224bba709334586021926ef37b98319134c6ad5c1b')throw Error('reviewed238 static origin helper differs');
const source238=require('./source238-canonical-minute-static-projection.cjs');
// .239 exact Role prepend is static-only. Never pass reconstructed source to load().
if(nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'source239-migration-static-projection.cjs'))).digest('hex')!=='39f12bb39335e0234d7e43daa6ae2bc4c8e1aaf58b9dc65507012aac069594eb')throw Error('reviewed239 static role helper differs');
const source239=require('./source-livelink-static-projection.cjs'); // Live Link counted prepend over the byte-pinned reviewed239 chain
// .247 reverses finite guarded Native242/privacy247 additions for STATIC checks
// only. Actual load()/runOnce() and raw traces above always use current SRC.
if(nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'source247-native-historical-static-adapter.cjs'))).digest('hex')!=='c84c96a4494b8f9f2e586fb9efce3ba47a048f5b8a3a2c3fc1c5f4cfadc05019'||nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'fixtures/reviewed247-native-historical-static-contexts.json'))).digest('hex')!=='fea6e5400a2faa7fc7f2dd984dc90d2008e3ba182f9f75d01d95b35667408397')throw Error('reviewed247 historical static adapter differs');
const source247=source239.over247(require('./source247-native-historical-static-adapter.cjs')); // withStaticView first reverts the Live Link prepend; every other member is Fern's adapter unchanged
// .228 C09 reverses only two exact current sources for the original static seals.
if (nodeCrypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'source228-privacy-historical-projection.cjs'))).digest('hex') !== '1314b9a32a95348ae6092bcc5963cb16526ad8eecbc8bf1dcd7414dbff84324c') throw Error('reviewed228 C09 identity helper differs');
const source228Privacy = require('./source228-privacy-historical-projection.cjs');
function sourceDigest(name) {
  const raw=fs.readFileSync(path.join(SRC, name + '.ts'), 'utf8');
  const current247=RECORD?raw:source247.originalSource(name,raw);
  const before230=['discord','role-settlements','roles','roster','interactions'].includes(name)?source230.inverse(name,name==='role-settlements'&&!RECORD?source239.inverse(current247):current247):name==='privacy-serving-erase'?source230.before233(name,current247):source238.originalSource(name,current247);
  const original=RECORD?raw:source228Privacy.originalSource(name,source227.originalSource(name,before230));
  return original===null?null:source211.source211HistoricalDigest(name,original);
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
  verify: 'is already linked to your account. For the guild roles, press **Get my code**', button: 'Your guild roles follow automatically once that character is on a current guild roster export.',
  unbind: 'The guild roles are removed automatically if no other character of this account is still in the guild.' };

(async () => {
  keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  pub = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
  if (DUMP) {
    const [phase, profile, variant, scenario] = DUMP.split(':');
    const r = await runOnce(phase, profile, variant, scenario);
    console.log(JSON.stringify({ digest:digestOf(r),unprojected227ComparisonTraceSHA256:sha(JSON.stringify(legacyOfBefore227(r))),response: r.response, errors: r.errors, laneCalls: r.laneCalls, discord: r.discord, twelve: r.twelve, trace:r.trace }, null, 1));
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
  for(const[name,ok]of Object.entries(source247.checks(SRC)))check('.247 historical-only finite static adapter '+name,ok);
  for(const row of source247.controls(SRC))check('.247 historical-only static refuses '+row.source+' '+row.name,row.refused);
  for(const[name,ok]of Object.entries(source247.comparisonControls()))check('.247 exact whole comparison pair '+name,ok);
  for(const[name,ok]of Object.entries(source239.checks(SRC)))check('.239 exact static Role prepend '+name,ok);
  for(const row of source239.controls(SRC))check('.239 static Role refuses '+row.name,row.refused);
  source247.withStaticView(SRC,static239=>{
  for(const[name,ok]of Object.entries(source238.checks(static239)))check('.238 exact static origin '+name,ok);
  for(const row of source238.controls(static239))check('.238 static origin refuses '+row.name,row.refused);
  for(const[name,ok]of Object.entries(source230.checks(static239)))check('.230 current→a984 exact static guard '+name,ok);
  for(const[name,ok]of Object.entries(source230.copyControls()))check('.230 paired copy-only guard '+name,ok);
  source238.withStaticView(static239,static230=>{
  const banSources=ban210.sourceChecks(static230,PINS);
  check('ban210 successor binds exact reviewed interactions source, finite paired fixture and unchanged historical PINS',Object.values(banSources).every(Boolean),banSources);
  const heldSources=held210.sourceChecks(SRC);
  check('RT06 held-verify successor binds exact full restore source and finite H4/H6/current fixture',Object.values(heldSources).every(Boolean),heldSources);
  const recoverySources=recovery217.sourceChecks(static230);
  check('.217 recovery successor binds the exact current interactions source',Object.values(recoverySources).every(Boolean),recoverySources);
  check('.227 static inverse binds all four whole current sources and refuses unrelated/context/line-ending drift',Object.values(source227.checks(static230)).every(Boolean));
  const treasury228=require('./source228-treasury-tier-projection.cjs');
  check('.228 Treasury tier inverse binds the exact current and .224 sources and refuses unrelated changes',Object.values(treasury228.checks(static230)).every(Boolean));
  const {sources211,discord222,branch224,drift224}=treasury228.withStaticView(static230,view=>({
    sources211:source211.sourceChecks(view,PINS),discord222:require('./source222-discord-type-projection.cjs').checks(view),
    branch224:require('./source224-branch-name-projection.cjs').checks(view),drift224:require('./source224-branch-name-projection.cjs').driftControls224(view),
  }));
  check('.224 identity retains original211 restrictions with exact222 erased-type and224 protected Branch-alias successors', Object.entries(sources211).filter(([key])=>!['discord:exact-reviewed-support','treasury-cosmetic:exact-reviewed-support'].includes(key)).every(([,ok])=>ok)&&sources211['discord:exact-reviewed-support']===false&&sources211['treasury-cosmetic:exact-reviewed-support']===false&&discord222.qualified&&discord222.negativeControls&&branch224.qualified&&branch224.negativeControls,{sources211,discord222,branch224});
  console.log('RETAINED211_DISCORD_RAW_SEAL false; finite222 type-only runtime parity '+discord222.qualified);
  for (const row of drift224) check('.211 identity reconstruction refuses ' + row.source + ' ' + row.name, row.refused);

  });
  });

  // --- static: whole reviewed .164 integrated sources; the lane modules are never part of a module-load cycle
  for (const name of PROTECTED) check(['role-settlements', 'privacy-global-serving-origin'].includes(name) ? `${name}.ts reconstructs accepted H16 through exact .211 contexts before unchanged historical whole seals` : SOURCE196_COMPAT[name] ? `${name}.ts reconstructs the reviewed .164 whole source through exact pinned .196 contextual reversals only` : `${name}.ts is byte-identical to the reviewed .164 integrated source`, sourceDigest(name) === PINS.files[name]);
  const erase228Raw = source230.before233('privacy-serving-erase',source247.originalSource('privacy-serving-erase',fs.readFileSync(path.join(SRC, 'privacy-serving-erase.ts'), 'utf8')));
  const jobs228Raw = fs.readFileSync(path.join(SRC, 'privacy-serving-jobs.ts'), 'utf8');
  for (const [name, raw] of [['privacy-serving-erase', erase228Raw], ['privacy-serving-jobs', jobs228Raw]]) {
    for (const {label, refused} of source228Privacy.controls(name, raw)) check('.228 C09 ' + name + ' refuses ' + label, refused);
  }
  check('.228 C09 static inverse refuses other source names and mismatched inputs',
    source228Privacy.restore('privacy-serving-erase', jobs228Raw) === null
    && source228Privacy.restore('privacy-serving-jobs', erase228Raw) === null
    && source228Privacy.restore('other-source', erase228Raw) === null
    && source228Privacy.originalSource('other-source', erase228Raw) === erase228Raw);
  // .198: the owner-approved absent empty duplicate changes three qualification
  // contexts only. Historical file seals and every dynamic trace below stay fixed.
  // Historical intermediate controls inspect reconstructed text only; no old code executes.
  const role198Raw = source211.original211Source('role-settlements', source227.inverse('role-settlements',source230.inverse('role-settlements',source239.inverse(fs.readFileSync(path.join(SRC, 'role-settlements.ts'), 'utf8'))))??'') ?? '', role198Pin = SOURCE198_ROLE_SETTLEMENTS;
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
  const erase197Raw = source228Privacy.restore('privacy-serving-erase', erase228Raw) ?? '';
  const erase197Guard = " const facts=originalClosedRecoveryCleanupAccount(selection,env);facts.check();const namespaces=communityDataNames().slice().sort();if(namespaces.length!==15||JSON.stringify(namespaces)!==\"[\\\"contributions\\\",\\\"councillor_verification\\\",\\\"departures\\\",\\\"directory\\\",\\\"discord_directory_visibility\\\",\\\"event_delivery\\\",\\\"event_reminders\\\",\\\"events\\\",\\\"news\\\",\\\"news_webhook\\\",\\\"privacy_access\\\",\\\"refs\\\",\\\"restrictions\\\",\\\"ruleset_publication\\\",\\\"trials\\\"]\")throw Error('closed_recovery_cleanup_namespace_incomplete');const registered=new WeakMap<object,OriginalClosedCleanupStep>();\n";
  const erase196Guard = " const facts=originalClosedRecoveryCleanupAccount(selection,env);facts.check();const namespaces=communityDataNames().slice().sort();if(namespaces.length!==13||JSON.stringify(namespaces)!==\"[\\\"contributions\\\",\\\"councillor_verification\\\",\\\"departures\\\",\\\"directory\\\",\\\"event_delivery\\\",\\\"event_reminders\\\",\\\"events\\\",\\\"news\\\",\\\"privacy_access\\\",\\\"refs\\\",\\\"restrictions\\\",\\\"ruleset_publication\\\",\\\"trials\\\"]\")throw Error('closed_recovery_cleanup_namespace_incomplete');const registered=new WeakMap<object,OriginalClosedCleanupStep>();\n";
  check('.197 closed namespace projection accepts only the exact reviewed .197 raw source and unique guard', sha(erase197Raw) === 'aca1c0e136c1374b58235d5ec9cc8c9f02f3e209fc5b12e90881035ce98b4a12' && erase197Raw.split(erase197Guard).length === 2 && source196HistoricalDigest('privacy-serving-erase', erase197Raw) === PINS.files['privacy-serving-erase']);
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
      if(scenario==='ingest'){
        const rawTraceSHA=sha(r.trace),historical=source227.traceInverse(r.trace,1);
        check(where+': exact single readonly roster-query inverse preserves raw current trace',historical!==r.trace&&historical.length===r.trace.length&&sha(r.trace)===rawTraceSHA);
        if(variant==='absent')console.log('RETAINED227_RAW_TRACE '+phase+'/'+profile+' '+sha(JSON.stringify(legacyOfBefore227(r))));
        if(phase==='pre'&&profile==='plain'&&variant==='absent'){
          for(const control of source227.traceControls(r.trace))check('.227 trace inverse refuses '+control.name,control.refused);
          const at=r.trace.findIndex(e=>e.tag==='legacy'&&e.k==='sql'),next=r.trace.findIndex((e,i)=>i>at&&e.tag==='legacy'&&JSON.stringify(e)!==JSON.stringify(r.trace[at]));
          const changedBind=r.trace.map((e,i)=>i===at?{...e,params:[...e.params,'unrelated227']}:e),reordered=r.trace.slice();[reordered[at],reordered[next]]=[reordered[next],reordered[at]];
          for(const[name,trace]of[['unrelated bind',changedBind],['unrelated event order',reordered],['additional SQL',[...r.trace,{k:'sql',tag:'legacy',sql:'SELECT 1 AS unrelated227',params:[]}]]]){
            let refused;
            try{refused=!same(digestOf({...r,trace}),pin);}
            catch(error){if(name!=='unrelated bind'||!(error instanceof Error)||error.message!=='identity265_read_proof_tuple')throw error;refused=true;}
            check('.227 whole historical oracle refuses '+name,refused);
          }
        }
      }else if(phase==='pre'&&profile==='plain'&&variant==='absent'&&scenario==='queue')check('.227 query inverse leaves non-ingest traces untouched',source227.traceInverse(r.trace)===r.trace);
      check(`${where}: no deferred work threw`, r.errors.length === 0, r.errors);
      const banContext={phase,profile,variant,pin,mask,digestOf,readProofComparison265:trace=>successorReadProofComparison265(trace,phase==='live'&&variant==='configured')};
      const banResult=scenario==='ban'?ban210.inspect(r,banContext):null;
      const heldScope=phase==='pre'&&profile==='settlement'&&scenario==='verify';
      const heldContext={variant,pin,digestOf,readProofComparison265:successorReadProofComparison265},heldResult=heldScope?held210.inspect(r,heldContext):null;
      const recoveryContext={pin,digestOf,masked:variant==='configured'&&phase==='live'},recoveryResult=scenario==='unbind'?recovery217.inspect(r,recoveryContext):null;
      if(scenario==='ban'&&phase==='pre'&&variant==='absent'){
        for(const mutation of ban210.negativeMutations(r,banContext))check(`ban210 ${profile} successor refuses ${mutation.name} through its specific ${mutation.key} oracle`,mutation.refused);
      }
      if(heldScope&&variant==='absent')for(const mutation of held210.negativeMutations(r,heldContext))check(`RT06 held-verify successor refuses ${mutation.name} through its specific ${mutation.key} oracle`,mutation.refused);
      if(scenario==='unbind'&&phase==='pre'&&variant==='absent')for(const mutation of recovery217.negativeMutations(r,recoveryContext))check(`.217 recovery successor refuses ${mutation.name} through its specific ${mutation.key} oracle`,mutation.refused);
      if (UNCONFIGURED.includes(variant)) {
        if(scenario==='ban')check(`${where}: exact finite ban210 physical successor; historical reply/row oracles remain active; no lane function ran`,banResult.all&&lane.length===0&&r.laneCalls.length===0,banResult);
        else if(heldScope)check(`${where}: exact RT06 whole held-warning response and sole replay-cache bind successor; historical SQL/order/rows remain active`,heldResult.all&&lane.length===0&&r.laneCalls.length===0,heldResult);
        else if(scenario==='unbind')check(`${where}: exact recovery reply/cache pair with unchanged historical trace/order/row oracles and no lane dispatch`,recoveryResult.all&&lane.length===0&&r.laneCalls.length===0,recoveryResult);
        else check(`${where}: identical to .160${scenario === 'guide' ? ' after only the bounded known public-guide first-line projection' : ''} (statements, binds, batch shapes, Discord requests, response, twelve rows); no lane function ran`,
          same(digestOf(r), pin) && lane.length === 0 && r.laneCalls.length === 0, { got: digestOf(r), pin, laneCalls: r.laneCalls });
        continue;
      }
      const open = variant === 'configured' && phase === 'live';
      if(scenario==='ban')check(`${where}: exact finite ban210 physical successor, original response content and all historical row fields except two exact correlated identities`,banResult.all,banResult);
      else if(heldScope)check(`${where}: exact RT06 whole held-warning response and sole cache-bind successor; every other historical trace/row field retained`,heldResult.all,heldResult);
      else if(scenario==='unbind')check(`${where}: exact recovery reply/cache pair with every other historical trace/order/row field retained`,recoveryResult.all,recoveryResult);
      else check(`${where}: the legacy subsequence equals .160${open ? ' after masking only the documented A6 texts' : ' (unmasked)'}${scenario === 'guide' ? ' plus the bounded known public-guide first-line projection' : ''}; the twelve rows end as under .160`, same(digestOf(r, open), pin), { got: digestOf(r, open), pin });
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
        if(scenario==='button')check(`${where}: current progress and held-access instructions replace the automatic-role promise`, r.response.body.includes('Use **My status** to check your verification progress. Follow the current instructions, or ask High Council if access is on hold.')&&r.response.body.includes('Your guild must have an approved server-recorded Olympus identity. A typed guild name or a roster name alone never links an account.')&&!/follow(?:s)? automatically/.test(r.response.body));
        else check(`${where}: the A6 text is ${open ? 'shown' : 'not shown before epochStart'}`, shown.includes(NEW_TEXT[scenario]) === open);
      }
    }
  }
  // --- a refused registration (design test 18): configured, the response stays .160's (A6-masked) and role.fresh_failed is written.
  // The /queue deferral carries the legacy sweep, so there a refusal propagates as .160's does: the expected response is the
  // unconfigured run's under the same refusal (that branch is .160's statement verbatim), an error unlike the normal pin.
  for (const scenario of ['queue', 'ingest', 'ban']) {
    const r = await runOnce('live', 'plain', 'configured', scenario, true), pin = PINS.traces.live.plain[scenario];
    if(scenario==='ban'){
      const expected={status:200,body:JSON.stringify({type:4,data:{content:'The command could not be deferred. Nothing was started.',flags:64,allowed_mentions:{parse:[]}}})};
      const adminEffects=r.trace.filter(e=>e.k==='sql'&&(e.sql.startsWith('INSERT INTO members')||e.sql.startsWith('UPDATE invite_queue')||e.sql.startsWith('UPDATE pending')||e.params.includes('admin.ban')));
      check('live/plain/ban/configured registration refused: fixed ephemeral refusal before every admin safety/provider/nested-lane effect',same(r.response,expected)&&adminEffects.length===0&&r.trace.every(e=>e.k!=='http')&&r.errors.length===0&&r.laneCalls.length===0&&r.freshFailed.length===0&&r.patchReceipts.length===0&&sha(r.twelve)===pin.twelve,{response:r.response,adminEffects,errors:r.errors,laneCalls:r.laneCalls,freshFailed:r.freshFailed});
      continue;
    }
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

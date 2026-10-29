// Existing scheduled budget workloads against actual current source, Native SQLite and source-owned admission.
// Provider HTTP and the independent managed-open recovery floor use the existing local integration pattern.
// Each modular job runs under original global fetch dispatch. No source exports or guards are replaced.
// The ordinary scheduled({}, own waitUntil) calls remain exact held attempts, not whole-capacity acceptance.
// Existing Workerd six-case/seven-callback evidence supports local query counts only: maximum 602/700.
// Provider 30-second and Worker 128 MiB qualification remain false; the source schedule qualifier stays false.
// Historical raised-cap, direct roster grant/flush and request migration branches are explicitly unavailable.
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const entry = require('./helpers/privacy129_fixture.cjs');
const RealDate = Date, H = 3600, DAY = 86400;
const realNow = () => Math.floor(RealDate.now() / 1000);
let T = Math.floor(realNow() / DAY) * DAY + 16 * H;
if (T > realNow()) T -= DAY;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
// Only the existing role pacing wait is accelerated. Source custody/provider deadlines retain their delays.
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 250 ? 0 : ms, ...a);

let COUNT = { statements: 0, trips: 0, physicalStatements: 0, physicalTrips: 0 };
const resetCount = () => { COUNT = { statements: 0, trips: 0, physicalStatements: 0, physicalTrips: 0 }; };
let FAIL = null, lastNativeSQL = '', failedNativeStatement = null;
function d1(dbh) {
  return entry.originalNativePort(dbh, {
    count() { COUNT.physicalTrips++; COUNT.physicalStatements++; },
    beforeBatch(plan) {
      COUNT.physicalStatements += plan.length - 1;
      const payload = plan.filter(s => !s.statement.includes('privacy_write_admission'));
      if (payload.length) { COUNT.trips++; COUNT.statements += payload.length; }
      for (const s of plan) {
        const named = Math.max(0, ...[...s.statement.matchAll(/\?(\d+)/g)].map(m => Number(m[1])));
        if (named && named !== s.params.length || s.params.length > 99) throw Error('D1_ERROR: invalid parameter count');
      }
    },
    statement(sql, params) {
      lastNativeSQL = sql;
      if (FAIL && FAIL(sql, params)) {
        const error = Error(FAIL.message ? FAIL.message(sql) : 'D1_ERROR: refused by the suite');
        failedNativeStatement = { sql, params: params.slice(), name: error.name, message: error.message };
        throw error;
      }
    },
  });
}
const transpiled = {};
const transpile = file => (transpiled[file] ??= ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
function makeLoader() {
  const cache = {};
  const load = name => {
    if (name === 'node:async_hooks') return require(name);
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} }; cache[name] = mod;
    new Function('module', 'exports', 'require', transpile(path.join(root, 'src', name.replace('./', '') + '.ts')))(mod, mod.exports, p => load(p));
    return mod.exports;
  };
  return load;
}
const GUILD = "236932545793490944", ROLE = "1549581282227265566", STAFF = "1550000000000000010", LOG = "1550000000000000011", OTHER = "1550000000000000012", RAID = "1550000000000000013", BOT = "1550000000000000014", BOTROLE = "1550000000000000015";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [];
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : null;
  const u = new URL(request ? request.url : String(input)), method = request ? request.method : init.method || 'GET', p = u.pathname;
  if (u.origin !== 'https://discord.com' || !p.startsWith('/api/v10/')) throw Error('unexpected synthetic provider origin');
  const text = request && !['GET', 'HEAD'].includes(method) ? await request.clone().text() : init.body;
  FETCHES.push(`${method} ${p}`);
  let m;
  if (p === '/api/v10/users/@me') return reply({ id: BOT, bot: true });
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)$/)) && method === 'GET' && [STAFF, LOG, OTHER, RAID].includes(m[1])) return reply({ id: m[1], guild_id: GUILD, type: 0 });
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{ id: GUILD, position: 0, permissions: '0', managed: false }, { id: ROLE, position: 1, permissions: '0', managed: false }, { id: BOTROLE, position: 10, permissions: '268435456', managed: false }]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/)) && method === 'GET') return reply({ pending: false, roles: m[1] === BOT ? [BOTROLE] : HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: 'u' } });
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === 'PUT') { HAS_ROLE.add(m[1]); await ON_PUT?.(m[1]); }
    else HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === 'POST') {
    const body = JSON.parse(text || '{}');
    if (m[1] === RAID) return reply({ id: '1550000000000000096', channel_id: RAID, author: { id: BOT, bot: true }, type: 0, content: body.content, nonce: body.nonce, embeds: [], attachments: [] });
    if (body.nonce) return reply({ id: '1550000000000000099' });
    if (m[1] === STAFF) return reply({ message: 'Missing Access', code: 50001 }, 403);
    return reply({ id: '1550000000000000098' });
  }
  if (/^\/api\/v10\/channels\/\d+\/messages\/\d+$/.test(p) && method === 'DELETE') return reply({ message: 'Missing Access', code: 50001 }, 403);
  if ((m = p.match(/^\/api\/v10\/users\/(\d+)$/))) return reply({ id: m[1], username: 'user' + m[1].slice(-4), global_name: null });
  return reply({ message: 'unexpected in this suite: ' + method + ' ' + p }, 500);
};
const budget = makeLoader()('./scheduled-budget'), CAP = budget.SCHEDULED_CAPS;
const ALL_ON = 'directory,crafting,events,attendance,trials,restrictions,departures,privacy_intake,contributions';
let db, doDb, native, admitted, setupWriter, activeLoader, currentEnv;
const rawEnv = (over = {}) => entry.currentEntryEnvironment({
  DB: native, DISCORD_BOT_TOKEN: 'test-token', GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, CHANNEL_MOD_ALERTS: STAFF, CHANNEL_SERVER_LOG: LOG,
  VERIFY_SECRET: 'verify-secret-for-tests', COOKIE_SECRET: 'cookie-secret-for-tests-only-0123456789', PUBLIC_BASE_URL: 'https://verify.example', SITE_HOST: 'guild.example',
  COMMUNITY_FEATURES: ALL_ON, CONTRIBUTIONS_MODE: 'ledger', CONTRIBUTIONS_RETENTION_DAYS: '90', CONTRIBUTIONS_SCOPE: 'olympus', PRIVACY_INTAKE_ENABLED: 'true',
  OFFICER_DIGEST_ENABLED: 'true', LAUNCH_AT: String(T - DAY), INVITE_MAX_ATTEMPTS: '6', ROLE_SWEEP_PER_RUN: '50', ROLE_CALL_BUDGET: '50', NAMES_PER_RUN: '50',
  SITE_GUILD_ID: GUILD, DISCORD_APP_ID: BOT, INTROS_GUILD_ID: GUILD, INTROS_CHANNELS: `raid-signups=${RAID}`,
  EVENT_DISCORD_DELIVERY: 'on', EVENT_DISCORD_REMINDERS: 'on', COMMUNITY_ORGANIZERS: '300000000000001000', ...over,
});
const env = (over = {}) => ({ ...currentEnv, ...over, DB: admitted });
async function fresh() {
  db?.close(); doDb?.close(); db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  entry.installCurrentEntryEpoch(db, { now: T }); activeLoader = makeLoader(); activeLoader('./index');
  native = d1(db); admitted = activeLoader('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(native, 'writer', 'canonical', entry.ENTRY_EPOCH);
  setupWriter = activeLoader('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(entry.originalNativePort(db), 'writer', 'canonical', entry.ENTRY_EPOCH);
  currentEnv = rawEnv();
  // Same local independent-floor bootstrap as privacy_serving_integration_test; no production opener is claimed.
  doDb = new DatabaseSync(':memory:'); doDb.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('fixture DO clock misuse'); return String(T); });
  const floor = activeLoader('./privacy-recovery-floor'), gate = activeLoader('./privacy-serving-recovery-gate');
  const INITIALIZER = 'synthetic-serving-independent-initializer', OPERATOR = 'synthetic-serving-independent-operator', SERVING = 'synthetic-serving-independent-serving';
  const CE = 'b'.repeat(32), TREE = 'c'.repeat(40), VERSION = entry.ENTRY_METADATA.id;
  const storage = { sql: { exec(sql, ...args) { const s = doDb.prepare(sql), result = s.columns().length ? s.all(...args) : (s.run(...args), []); return { toArray: () => result }; } }, transactionSync(work) { doDb.exec('BEGIN IMMEDIATE'); try { const value = work(); doDb.exec('COMMIT'); return value; } catch (error) { doDb.exec('ROLLBACK'); throw error; } }, async setAlarm(time) { if (!Number.isSafeInteger(time)) throw Error('fixture alarm time'); } };
  const object = new floor.PrivacyRecoveryFloor({ storage }, { PRIVACY_RECOVERY_OPERATOR_SECRET: OPERATOR, PRIVACY_RECOVERY_INITIALIZER_SECRET: INITIALIZER, PRIVACY_SERVING_GATE_SECRET: SERVING });
  const initial = JSON.stringify({ operationId: '1'.repeat(32), nonce: '2'.repeat(32), requestDigest: '3'.repeat(64), createdAt: T, expiresAt: T + 300, credentialEpoch: CE, writeEpoch: entry.ENTRY_EPOCH, sourceTree: TREE, deploymentVersion: VERSION });
  const proof = await floor.recoveryFloorMac(INITIALIZER, 'POST', '/v1/initialize', initial);
  const response = await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Recovery-Proof': proof }, body: initial }));
  if (response.status !== 200) throw Error('genuine fixture floor initialization');
  const originalFloor = (await response.json()).floor, close = JSON.stringify({ operationId: '4'.repeat(32), nonce: '5'.repeat(32), requestDigest: '6'.repeat(64), createdAt: T, expiresAt: T + 300, nextWriteEpoch: 'd'.repeat(32), originalFloor });
  const mac = await gate.servingGateMac(INITIALIZER, 'POST', '/v1/serving/initialize-closed', close);
  const closed = await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/serving/initialize-closed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Serving-Proof': mac }, body: close }));
  if (closed.status !== 200) throw Error('genuine fixture closed initialization');
  doDb.prepare("UPDATE recovery_serving_gate SET state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL WHERE singleton=1 AND state='closing_held'").run();
  const rid = Object.freeze({ fixture: 'same-native-independent-floor' }), stub = { fetch: request => object.fetch(request) };
  Object.assign(currentEnv, { PRIVACY_RECOVERY_FLOOR: { idFromName(name) { if (name !== floor.RECOVERY_FLOOR_NAME) throw Error('floor name'); return rid; }, get(id) { if (id !== rid) throw Error('floor id'); return stub; } }, PRIVACY_SERVING_GATE_SECRET: SERVING, PRIVACY_CREDENTIAL_EPOCH: CE, PRIVACY_SERVING_SOURCE_TREE: TREE, PRIVACY_SERVING_DATABASE_ID: floor.RECOVERY_FLOOR_TARGET.database });
}
// Observation only: the actual thrown object remains the key and is rethrown unchanged.
const originalServingFailures = new WeakMap();
async function originalServingWork(e, work) {
  const pending = [], ctx = { waitUntil(p) { pending.push(p); } }, global = activeLoader('./privacy-global-serving-origin');
  const original = global.captureGlobalServingEntry({ ...e, DB: native }, ctx, 'fetch', new Request('https://guild.example/fixture-original-budget-entry'));
  let componentValue, componentReturned = false;
  try {
    const value = await global.dispatchGlobalServingEntry(original, async () => {
      componentValue = await work({ ...original.env, DB: activeLoader('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(original.env.DB, 'writer', 'canonical', entry.ENTRY_EPOCH) });
      componentReturned = true; return componentValue;
    });
    await Promise.all(pending); return value;
  } catch (error) {
    if (error && typeof error === 'object') originalServingFailures.set(error, { componentReturned, componentValue, failedNativeStatement });
    console.log('FAILURE_DIAGNOSTIC ' + JSON.stringify({ componentReturned, componentValue, counts: { ...COUNT }, caps: CAP, outer: { name: error.name, constructor: error.constructor.name, message: error.message, exactRecoveryFloorHeld: error instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld }, failedNativeStatement, lastNativeSQL }));
    throw error;
  }
}
let quietLines = [];
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const run = async (sql, ...p) => { const r = await setupWriter.prepare(sql).bind(...p).run(); return { changes: r.meta.changes, lastInsertRowid: r.meta.last_row_id }; };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const quiet = async (fn) => { const e = console.error, w = console.warn, lines = []; console.error = (...a) => lines.push(a.map(String).join(' ')); console.warn = (...a) => lines.push(a.map(String).join(' ')); try { return await fn(); } finally { console.error = e; console.warn = w; quietLines = lines; } };
const id = (k) => String(300000000000000000n + BigInt(k));
const letters = (k) => { let s = ""; do { s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } while (k > 0); return s; };
const ref = (k) => ("R" + String(k)).padEnd(22, "x");

async function fixtureStatements(statements) {
  for (let i = 0; i < statements.length; i += 100) await setupWriter.batch(statements.slice(i, i + 100));
}

// ---------- the seed: every capped workload past its cap, every conditional audit due ----------
const KEY = {}; // account -> its character's name key
async function account(did, { name, status = "member", banned = 0, site = true, memberSince = T - 60 * DAY, leftAt = null, key = null } = {}) {
  await run("INSERT INTO members (discord_id, banned) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING", did, banned);
  if (name) {
    const k = key ?? name.toLowerCase();
    await run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, member_since, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)", k, name, did, status, T - 90 * DAY, memberSince, leftAt);
    KEY[did] = k;
  }
  if (site) await run("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, 0, 1)", did, "u" + did.slice(-4), T - 30 * DAY, T - DAY);
}
/** Roster-confirmed accounts signed in here: the opener's candidates, the role sweep's rotation, the names refresh. */
async function seedMembers(count, from = 0) {
  const ids = [];
  for (let i = from; i < from + count; i++) { const did = id(1000 + i); await account(did, { name: "Mem" + letters(i) }); ids.push(did); }
  return ids;
}
async function seedPromotions(ids) {
  for (const did of ids) await run("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'roster.member', ?, ?)", T - 600, KEY[did], JSON.stringify({ discordId: did }));
}
async function seedBanned(count) {
  for (let i = 0; i < count; i++) { const did = id(5000 + i); await account(did, { site: false }); await run("UPDATE members SET banned = 1 WHERE discord_id = ?", did); HAS_ROLE.add(did); }
}
async function seedReserved(count) {
  const statements = [];
  for (let i = 0; i < count; i++) statements.push(setupWriter.prepare("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, ?, ?, 'approved', ?, 'admin', ?)").bind(id(9000 + i), "Res" + letters(i), "res" + letters(i), T - 9 * DAY, T - 8 * DAY + i));
  await fixtureStatements(statements);
}
/** Profiles thirty days departed, their owners no longer qualifying; departed_at runs AGAINST id order, so the order is visible. */
async function seedProfiles(count, from = 0) {
  for (let i = from; i < from + count; i++) {
    const did = id(7000 + i), departed = T - 31 * DAY - (i - from + 1) * 60;
    await run("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?)", did, ref(i), T - 60 * DAY);
    await run("INSERT INTO community_profiles (discord_id, ref, listed, departed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", did, ref(i), departed, T - 60 * DAY, T - 60 * DAY);
    await run("INSERT INTO community_professions (discord_id, profession, skill, updated_at) VALUES (?, 'mining', 300, ?)", did, T - 60 * DAY);
  }
}
/** Departures for the intake: ten full pages of 500 the site cannot show (the name key is not the name's), the last one showable. */
async function seedDepartures() {
  const total = 10 * 500, statements = [];
  for (let i = 0; i < total; i++) {
    const did = id(20000 + i), name = "Gone" + letters(i), valid = i === total - 1, key = valid ? name.toLowerCase() : "x" + name.toLowerCase();
    statements.push(setupWriter.prepare("INSERT INTO members (discord_id, banned) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING").bind(did, 0));
    statements.push(setupWriter.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, member_since, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(key, name, did, 'left', T - 90 * DAY, T - 60 * DAY, T - DAY + i));
    statements.push(setupWriter.prepare("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, 0, 1)").bind(did, 'u' + did.slice(-4), T - 30 * DAY, T - DAY));
    KEY[did] = key;
  }
  await fixtureStatements(statements);
}
async function seedFixed() {
  // the invite queue: rows past their attempts are retired, and the staff notice about them cannot be posted
  for (let i = 0; i < 3; i++) await run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, attempts) VALUES (?, ?, ?, 'queued', ?, 6)", "q" + letters(i), "Q" + letters(i), id(8000 + i), T - DAY);
  // Battle.net data past its 29 days
  await run("INSERT INTO members (discord_id, battletag, bnet_conn_id, linked_at) VALUES (?, 'Old#1234', 'c1', ?)", id(8100), T - 40 * DAY);
  // an event, a trial, a departure item past their time; a restriction period with no case
  await run("INSERT INTO community_events (id, op_id, title, starts_at, duration_min, ends_at, created_by, created_at, updated_at, retain_until) VALUES (?, 'op1', 'Old raid', ?, 60, ?, ?, ?, ?, ?)", ref(900), T - 40 * DAY, T - 40 * DAY + 3600, id(1000), T - 41 * DAY, T - 41 * DAY, T - 10 * DAY);
  await run("INSERT INTO community_trials (id, op_id, discord_id, started_at, review_due_at, status, outcome_reason, concluded_at, created_at, updated_at, incarnation, retain_until) VALUES (?, 'op2', ?, ?, ?, 'ended', 'withdrew', ?, ?, ?, 'inc', ?)", ref(901), id(1001), T - 80 * DAY, T - 60 * DAY, T - 50 * DAY, T - 80 * DAY, T - 50 * DAY, T - 20 * DAY);
  await run("INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, created_at, retain_until) VALUES (?, ?, 'old one', 'Old One', 'old', 'left', ?, ?, ?)", ref(902), id(1002), T - 40 * DAY, T - 40 * DAY, T - 10 * DAY);
  await run("INSERT INTO community_restriction_periods (discord_id, opened_at, retain_until) VALUES (?, ?, ?)", id(8200), T - 90 * DAY, T + 90 * DAY);
  // News on, a notice past its time with its record, and three trusted complete exports: the figures compute both windows
  await run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL)", T);
  await run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, T + 118 * DAY);
  await run("INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until) VALUES (?, 'h', 'Old', 'Old', 1, 'n', ?, ?, ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, id(1000), T - 2 * DAY, T - 10);
  const snap = async (names, first) => {
    const sid = Number((await run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'h', 1, 1, ?)", first, first, names.length, first)).lastInsertRowid);
    for (const nm of names) await run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, ?, ?)", sid, nm.toLowerCase(), nm);
  };
  await snap(["Ana", "Bo", "Cy"], T - 8 * DAY);
  await snap(["Ana", "Bo", "Dee"], T - 30 * H);
  await snap(["Ana", "Bo", "Dee", "Eve"], T - H);
  // the officer digest: yesterday's post in a channel it is no longer configured for (cleaned up first; Discord refuses)
  const yesterday = new RealDate((T - DAY) * 1000).toISOString().slice(0, 10);
  await run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('officer_digest', ?, ?, NULL)", JSON.stringify({ day: yesterday, outcome: "posted", attempts: 1, final: true, notBefore: 0, lease: null, posted: { channelId: OTHER, messageId: "1550000000000000097", day: yesterday }, intent: null, halted: false }), T - DAY);
}
/**
 * .115, third review round (finding A): a derived run of the newest snapshot with `count` promotions still pending, as an
 * export leaves it when its own invocation could not finish them (roster.ts deriveRun, applyEffects).
 */
let EFFECT_IDS = [];
async function seedEffects(count) {
  const snap = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  const runId = Number((await run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at, derived_at, items) VALUES (?, ?, 1, ?, ?, ?)", snap, snap, T - 600, T - 600, count)).lastInsertRowid);
  EFFECT_IDS = [];
  for (let i = 0; i < count; i++) {
    const did = id(30000 + i), name = "Eff" + letters(i);
    await account(did, { name, status: "verified", site: false, memberSince: null });
    await run("INSERT INTO roster_effects (run_id, seq, kind, name_key, name, discord_id) VALUES (?, ?, 'promote', ?, ?, ?)", runId, i, name.toLowerCase(), name, did);
    EFFECT_IDS.push(did);
  }
  return runId;
}
let MEMBER_IDS = [];
async function seedReminders() {
  const clock = one("SELECT CAST(strftime('%s','now') AS INTEGER) AS clock").clock, actor = id(1000);
  const issued = await entry.issueOriginalEntryCookie(name => activeLoader('./' + name), db, rawEnv(), actor);
  for (let i = 0; i < 3; i++) {
    const eventId = ref(9901 + i), start = clock + 1800 + i;
    await run("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until) VALUES(?,?,?, ?,120,?,?,?,?,?)", eventId, ref(9801+i), "Public reminder", start, start+7200, actor, clock, clock, start+7200+30*DAY);
    const request = new Request('https://guild.example/api/community/events/reminder', { method: 'POST', headers: { Cookie: issued.cookie, Origin: 'https://guild.example', 'X-Olympus': '2', 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, revision: 1, enabled: true }) });
    const response = await activeLoader('./index').default.fetch(request, rawEnv(), { waitUntil() {} });
    if (response.status !== 200) throw Error('original reminder fixture consent refused ' + response.status + ' ' + await response.text());
    const consent = one('SELECT consent_account_incarnation FROM community_event_reminders WHERE event_id=?', eventId);
    if (consent?.consent_account_incarnation !== issued.session.n) throw Error('original reminder consent incarnation missing');
  }
}
async function seedAll() {
  HAS_ROLE = new Set(); ON_PUT = null; FETCHES = [];
  MEMBER_IDS = await seedMembers(3 * CAP.obligationsPerRun);
  await seedPromotions(MEMBER_IDS.slice(0, 5));
  await seedBanned(CAP.roleSweepBanned + 1);
  await seedReserved(1001);
  await seedProfiles(3 * CAP.profilesPerRun);
  await seedDepartures();
  await seedFixed();
  await seedEffects(60);
  await seedReminders();
}

/** One job alone, over a fresh seeded database and a fresh module graph; the statements it sent. */
async function measure(fn, { seed = seedAll, fail = null, over = {}, dispatch = true, refusedAudits = null } = {}) {
  await fresh(); await seed();
  const L = activeLoader;
  const membersBefore = refusedAudits ? one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c : null;
  resetCount(); FAIL = fail; failedNativeStatement = null;
  let value;
  try { value = await quiet(() => dispatch ? originalServingWork(env(over), e => fn(L, e)) : fn(L, env(over))); }
  catch (error) {
    const observed = originalServingFailures.get(error), witness = observed?.failedNativeStatement;
    if (!dispatch || !Array.isArray(refusedAudits) || !refusedAudits.length || !fail ||
        !(error instanceof L('./privacy-recovery-held').RecoveryFloorHeld) || error.message !== 'recovery_floor_held' ||
        observed?.componentReturned !== true || !witness || witness.message !== 'D1_ERROR: refused by the suite' ||
        !auditFails(...refusedAudits)(witness.sql, witness.params)) throw error;
    return { ...COUNT, componentValue: observed.componentValue, outerRefused: true, outerError: error, failedNativeStatement: witness, membersBefore, membersAfter: one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c };
  }
  finally { FAIL = null; }
  return { ...COUNT, value };
}
const line = (job) => budget.SCHEDULED_BUDGET.find((j) => j.job === job)?.worst;
const physicalLine = (job) => budget.ADMISSION_SCHEDULED_BUDGET.find((j) => j.job === job)?.worst;
const schemaHeld = (L, error) => error instanceof L('./privacy-write-admission').PrivacyWriteAdmissionHeld && error.message === 'current_schema_unconfirmed' || error?.code === 'ERR_SQLITE_ERROR' && error.message === 'malformed JSON' && lastNativeSQL === L('./privacy-write-admission').PRIVACY_ADMISSION_SCHEMA_PROOF_SQL;
const auditFails = (...actions) => (sql, params) => /^INSERT INTO audit \(ts, actor, action, subject, details\) (VALUES|SELECT)/.test(sql) && actions.includes(params[2]);
// Six existing role fault workloads use this bounded component observation, never accepted root work.
const refusedRoleComponent = r => r.outerRefused === true && !Object.hasOwn(r, 'value') && originalServingFailures.get(r.outerError)?.componentValue === r.componentValue && CAP.roleSweepAccounts === 1 && CAP.roleSweepBanned === 1 && r.membersBefore === r.membersAfter && r.statements <= line('sweepMemberRoles') && r.physicalStatements <= physicalLine('sweepMemberRoles');
// every column reported missing: the probes say "no such column", the ALTERs "duplicate column" (swallowed by addColumn)
const everyColumnMissing = Object.assign((sql) => /^SELECT \w+ FROM \w+ LIMIT 0$/.test(sql) || /^ALTER TABLE /.test(sql), { message: (sql) => (/^ALTER/.test(sql) ? "D1_ERROR: duplicate column name" : "D1_ERROR: no such column") });

(async () => {
  console.log("== the table ==");
  const idx = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");
  const body = /export async function runSourceEpoch2ScheduledBody[\s\S]*?\n\}/.exec(idx)[0];
  const started = ["ensureSchema", ...[...body.matchAll(/deferOriginalServing\(ctx,'(\w+)',/g)].map((m) => m[1])];
  const jobs = budget.SCHEDULED_BUDGET.map((j) => j.job);
  check(`a line for every job scheduled() starts, in its order (${started.length})`, started.join() === jobs.join(), started, jobs);
  check("  every line a positive whole number with its rule", budget.SCHEDULED_BUDGET.every((j) => Number.isInteger(j.worst) && j.worst > 0 && j.rule.length >= 8));
  const sum = budget.SCHEDULED_BUDGET.reduce((s, j) => s + j.worst, 0);
  console.log(`    the table's worst case: ${sum} statements (target ${budget.SCHEDULED_STATEMENT_TARGET}, Paid limit ${budget.D1_STATEMENTS_PER_INVOCATION})`);
  check("the worst case is the table's sum, at most the target, and the target well below the Paid limit", budget.SCHEDULED_WORST_CASE === sum && sum <= budget.SCHEDULED_STATEMENT_TARGET && budget.SCHEDULED_STATEMENT_TARGET <= 0.7 * budget.D1_STATEMENTS_PER_INVOCATION && budget.D1_STATEMENTS_PER_INVOCATION === 1000, sum);
  const L0 = makeLoader(); L0("./index");
  check("the caps the source reads are the table's: BANNED_PER_RUN, the departures' current two intake pages within the historical fourteen-statement line", L0("./restore").BANNED_PER_RUN === CAP.roleSweepBanned && L0("./community-departures").DEPARTURE_LIMITS.intakePages === 2 && line('departureIntake') === 14);
  check("  the role sweep, the names refresh, the profile cleanup, the opener and the roster effects read their caps from scheduled-budget.ts", [["restore.ts", "SCHEDULED_CAPS.roleSweepAccounts"], ["names.ts", "SCHEDULED_CAPS.namesPerRun"], ["community-directory.ts", "SCHEDULED_CAPS.profilesPerRun"], ["community-contributions.ts", "SCHEDULED_CAPS.obligationsPerRun"], ["roster.ts", "SCHEDULED_CAPS.rosterEffectsStatements"]].every(([f, s]) => fs.readFileSync(path.join(root, "src", f), "utf8").includes(s)));
  const scheduledSource = fs.readFileSync(path.join(root, "src", "scheduled-budget.ts"), "utf8"), imports = scheduledSource.match(/^import[^\n]*$/gm) || [];
  check("  scheduled-budget.ts has no console call and only its original clock import", !/console\./.test(scheduledSource) && imports.length === 1 && imports[0].trimEnd() === "import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';");

  console.log("\n== each job alone: every capped workload past its cap, every conditional audit due ==");
  const measured = {};
  const exact = async (job, fn, opts) => {
    const r = await measure(fn, opts);
    measured[job] = r.statements;
    check(`${job}: ${r.statements} logical statements (line ${line(job)}), ${r.physicalStatements} Native statements (installed line ${physicalLine(job)})`, r.statements === line(job) && r.physicalStatements <= physicalLine(job), r);
    return r;
  };
  let r = await exact("sweepInviteQueue", (L, e) => L("./ingest").sweepInviteQueue(e));
  check("  it retired the three rows and recorded the notice it could not post", r.value.expired === 3 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'staff_notice.failed'").c === 1);
  r = await measure((L, e) => L("./restore").sweepMemberRoles(e, "cron"));
  measured.sweepMemberRoles = r.statements;
  check(`sweepMemberRoles, every account in the rotation lacking the role: ${r.statements} statements, at most its line ${line("sweepMemberRoles")}`, r.statements <= line("sweepMemberRoles") && r.value && r.value.restored.length > 0 && r.value.revoked.length > 0, r.statements, r.value && { restored: r.value.restored.length, revoked: r.value.revoked.length, checked: r.value.checked, attempts: r.value.attempts });
  // The root refuses a failed Native child. Historical post-fault callback cost acceptance is unavailable;
  // the component is observed only, retaining the original seven-statement lower bound and business checks.
  // the failure-inclusive path: a reapply hold lands while each PUT is in flight, and the removal's two audits are refused
  r = await measure(async (L, e) => { ON_PUT = async (did) => await run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", did, KEY[did], T); return L("./restore").sweepMemberRoles(e, "cron"); }, { fail: auditFails("role.revoked_after_hold", "role.revoke_pending"), refusedAudits: ["role.revoked_after_hold", "role.revoke_pending"] });
  ON_PUT = null;
  const failedAccounts = one("SELECT COUNT(*) AS c FROM audit WHERE action = 'role.restore_failed'").c;
  check(`  refused root: observed failure component retains seven statements per failed account (${failedAccounts}), ${r.statements} statements within its line`, refusedRoleComponent(r) && r.componentValue.checked === CAP.roleSweepAccounts && r.componentValue.failed.length === CAP.roleSweepAccounts && failedAccounts >= CAP.roleSweepAccounts && r.statements >= 7 * failedAccounts, r, failedAccounts);
  r = await measure(async (L, e) => { MEMBER_IDS.forEach((d) => HAS_ROLE.add(d)); await run("DELETE FROM audit WHERE action = 'roster.member'"); return L("./restore").sweepMemberRoles(e, "cron"); });
  check(`  ROLE_SWEEP_PER_RUN 50 is clamped to roleSweepAccounts (${CAP.roleSweepAccounts} accounts checked)`, r.value && r.value.checked === CAP.roleSweepAccounts, r.value && r.value.checked);

  // Actual current cap1 workloads. Historical exact5/7/4 two-run differentials need a raised cap and are unavailable.
  // No source cap is mutated; the same1/2,3/4 and held1/2 workloads now prove the actual clamp and retained work.
  console.log("\n== the role sweep's real cap, with the original success/failure/held workloads ==");
  const holdFor = async did => await run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", did, KEY[did] ?? 'k' + did, T);
  const onlyMembers = k => async () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; await seedMembers(k); };
  const onlyHeld = k => async () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; for (let i = 0; i < k; i++) { const did = id(6000 + i); await account(did, { site: false }); HAS_ROLE.add(did); await holdFor(did); } };
  const sweep = (L, e) => L('./restore').sweepMemberRoles(e, 'cron');
  const failing = { fail: auditFails('role.revoked_after_hold', 'role.revoke_pending') };
  const failSweep = (L, e) => { ON_PUT = async did => await holdFor(did); return sweep(L, e); };
  const ok1 = await measure(sweep, { seed: onlyMembers(1) }), ok2 = await measure(sweep, { seed: onlyMembers(2) });
  const firstGranted = [...HAS_ROLE]; resetCount();
  const continued = await quiet(() => originalServingWork(env(), e => sweep(activeLoader, e))), continuationCost = COUNT.physicalStatements;
  check('success workloads1/2 retain cap1 per invocation and the original second account continues on the next real run', CAP.roleSweepAccounts === 1 && ok1.value.restored.length === 1 && ok2.value.restored.length === 1 && firstGranted.length === 1 && continued.restored.length === 1 && !firstGranted.includes(continued.restored[0]) && HAS_ROLE.size === 2 && ok1.physicalStatements <= physicalLine('sweepMemberRoles') && ok2.physicalStatements <= physicalLine('sweepMemberRoles') && continuationCost <= physicalLine('sweepMemberRoles'), ok1, ok2, continued, continuationCost);
  const bad3 = await measure(failSweep, { seed: onlyMembers(3), ...failing, refusedAudits: ['role.revoked_after_hold', 'role.revoke_pending'] }), bad4 = await measure(failSweep, { seed: onlyMembers(4), ...failing, refusedAudits: ['role.revoked_after_hold', 'role.revoke_pending'] }); ON_PUT = null;
  check('refused failure workloads3/4 expose only cap1 component work and retain the remaining accounts', refusedRoleComponent(bad3) && refusedRoleComponent(bad4) && bad3.componentValue.failed.length === 1 && bad4.componentValue.failed.length === 1 && bad3.componentValue.checked === 1 && bad4.componentValue.checked === 1 && bad3.membersAfter === 3 && bad4.membersAfter === 4 && one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c === 4, bad3, bad4);
  const held1 = await measure(sweep, { seed: onlyHeld(1), fail: auditFails('role.revoked_reapply'), refusedAudits: ['role.revoked_reapply'] }), held2 = await measure(sweep, { seed: onlyHeld(2), fail: auditFails('role.revoked_reapply'), refusedAudits: ['role.revoked_reapply'] });
  check('refused held workloads1/2 retain the actual banned-reconciliation cap1 without a second removal', refusedRoleComponent(held1) && refusedRoleComponent(held2) && held1.componentValue.failed.length === 1 && held2.componentValue.failed.length === 1 && HAS_ROLE.size === 1, held1, held2);
  const longest = await measure(failSweep, { seed: onlyMembers(CAP.roleSweepAccounts + 5), ...failing, refusedAudits: ['role.revoked_after_hold', 'role.revoke_pending'], over: { ROLE_CALL_BUDGET: '1000' } }); ON_PUT = null;
  const done = longest.componentValue.failed.length;
  check('the refused largest original failure workload exposes only the source account cap within both SQL bounds', refusedRoleComponent(longest) && done === CAP.roleSweepAccounts && longest.componentValue.checked === CAP.roleSweepAccounts && longest.membersAfter === CAP.roleSweepAccounts + 5, longest);
  check('the source line retains its historical conservative costs and the original transport budget still clamps to50', line('sweepMemberRoles') >= 10 + 7 * CAP.roleSweepAccounts + 4 * CAP.roleSweepBanned && activeLoader('./roles').callBudget({ ROLE_CALL_BUDGET: '1000' }).limit === 50);
  // .115, third review round (finding A): the cron's slice of the roster's pending member effects. Its line is an admission
  // allowance (each item is admitted at its kind's worst case before it starts), so the measured count is at most the line.
  console.log("\n== the roster's pending member effects: the cron's slice ==");
  const effectsLine = line("continueRosterEffects");
  r = await measure((L, e) => L("./roster").continueRosterEffects(e));
  measured.continueRosterEffects = r.statements;
  const leftAfter = one("SELECT COUNT(*) AS c FROM roster_effects WHERE done_at IS NULL").c;
  check(`continueRosterEffects over the original60 promotions: one current-phase promotion, pending count exact and installed bound retained`, r.physicalStatements <= physicalLine('continueRosterEffects') && r.value?.applied === 1 && r.value.failed === false && leftAfter === 60 - r.value.applied && one("SELECT COUNT(*) AS c FROM characters WHERE name_key LIKE 'eff%' AND status = 'member'").c === r.value.applied, r, leftAfter);
  check('lowest pending sequence advances once; the original role work is deferred, not granted inside this phase', one('SELECT MIN(seq) AS s FROM roster_effects WHERE done_at IS NULL').s === r.value.applied && one("SELECT COUNT(*) AS c FROM audit WHERE action='roster.member' AND subject LIKE 'Eff%'").c === r.value.applied && one("SELECT COUNT(*) AS c FROM audit WHERE action='role.deferred'").c === r.value.applied && EFFECT_IDS.every(d => !HAS_ROLE.has(d)) && FETCHES.every(p => !p.startsWith('PUT ')) && one('SELECT COUNT(*) AS c FROM roster_effects WHERE done_at IS NOT NULL AND claim IS NOT NULL').c === 1);
  r = await measure((L, e) => { ON_PUT = async did => await holdFor(did); return L('./roster').continueRosterEffects(e); }, failing); ON_PUT = null;
  check('the original PUT-failure workload applies its bounded promotion but cannot reach the historical immediate-grant/flush branch', r.physicalStatements <= physicalLine('continueRosterEffects') && r.value?.applied === 1 && r.value.failed === false && one("SELECT COUNT(*) AS c FROM audit WHERE action='role.deferred'").c === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action='notice.no_channel'").c === 0 && FETCHES.every(p => !p.startsWith('PUT ')) && one('SELECT COUNT(*) AS c FROM roster_effects WHERE done_at IS NULL').c === 59, r);
  r = await measure((L, e) => L('./roster').continueRosterEffects(e), { over: { ROLE_CALL_BUDGET: '4' } });
  check('ROLE_CALL_BUDGET4 retains the same actual deferred slice and original pending custody, without claiming the old larger grant-free slice', r.physicalStatements <= physicalLine('continueRosterEffects') && r.value?.applied === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action='role.deferred'").c === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action='role.budget_exhausted'").c === 0 && one('SELECT COUNT(*) AS c FROM roster_effects WHERE done_at IS NULL').c === 59 && FETCHES.every(p => !p.startsWith('PUT ')), r);

  r = await exact("refreshNames", (L, e) => L("./names").refreshNames(e));
  check("  NAMES_PER_RUN 50 is clamped to namesPerRun", r.value.refreshed === CAP.namesPerRun, r.value);
  r = await exact("autoQueueReserved", (L, e) => L("./site-queue").autoQueueReserved(e));
  check(`  ${CAP.autoQueueRounds} capped rounds of 250 names moved`, r.value && r.value.queued === CAP.autoQueueRounds * 250 && r.value.more === true, r.value);
  await exact("purgeSeenInteractions", (L, e) => L("./index").purgeSeenInteractions(e));
  r = await exact("purgeBattleNetData", (L, e) => L("./bnet-retention").purgeBattleNetData(e));
  check("  it purged the stale tag and audited the counts", r.value.members === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'bnet.retention'").c === 1);
  await exact("sweepRenameHolds", (L, e) => L("./rename-review").sweepRenameHolds(e));
  r = await exact("sweepCommunityProfiles", (L, e) => L("./community-directory").sweepCommunityProfiles(e));
  check(`  ${CAP.profilesPerRun} of the ${3 * CAP.profilesPerRun} expired profiles erased, the rest left for the next runs`, r.value.deleted === CAP.profilesPerRun && one("SELECT COUNT(*) AS c FROM community_profiles").c === 2 * CAP.profilesPerRun, r.value);
  r = await exact("sweepCommunityEvents", (L, e) => L("./community-events").sweepCommunityEvents(e));
  check("  the event went and was audited", r.value === 1);
  r = await exact("runEventReminders", (L, e) => L("./community-event-reminders").runEventReminders(e));
  check("  exactly one of three due reminders posted; the other two wait", r.value === 1 && one("SELECT COUNT(*) AS c FROM community_event_reminders WHERE state='posted'").c === 1 && one("SELECT COUNT(*) AS c FROM community_event_reminders WHERE state='armed'").c === 2 && FETCHES.filter((p) => p === `POST /api/v10/channels/${RAID}/messages`).length === 1, r.value);
  r = await exact("sweepCommunityTrials", (L, e) => L("./community-trials").sweepCommunityTrials(e));
  check("  the trial went", r.value.deleted === 1);
  r = await exact("sweepCommunityRestrictions", (L, e) => L("./community-restrictions").sweepCommunityRestrictions(e));
  check("  the period without a case went", r.value.periods === 1);
  // The original5,000-row workload now spans five genuine invocations at the source's two-page cap.
  // Its historical single-invocation ten-page/exact14 positive branch is unavailable.
  const departureRuns = [];
  r = await measure((L, e) => L("./community-departures").departureIntake(e));
  for (let tick = 0; tick < 5; tick++) {
    if (tick) {
      resetCount(); failedNativeStatement = null;
      const value = await quiet(() => originalServingWork(env(), e => activeLoader('./community-departures').departureIntake(e)));
      r = { ...COUNT, value };
    }
    const end = (tick + 1) * 1000 - 1, name = 'Gone' + letters(end);
    const expectedCursor = { left_at: T - DAY + end, name_key: end === 4999 ? name.toLowerCase() : 'x' + name.toLowerCase() };
    const cursor = one('SELECT left_at, name_key FROM community_departure_scan WHERE id=1');
    const reviews = db.prepare('SELECT discord_id, proof_key, character_name, observed_at FROM community_departure_reviews WHERE discord_id BETWEEN ? AND ? ORDER BY discord_id').all(id(20000), id(24999));
    departureRuns.push({ ...r, expectedCursor, cursor, reviews, totalReviews: one('SELECT COUNT(*) AS c FROM community_departure_reviews').c });
  }
  measured.departureIntake = Math.max(...departureRuns.map(x => x.statements));
  check(`departureIntake: the same ten pages across five cap2 invocations, max ${measured.departureIntake} logical/${Math.max(...departureRuns.map(x => x.physicalStatements))} Native within unchanged14/21 lines`, activeLoader('./community-departures').DEPARTURE_LIMITS.intakePages === 2 && line('departureIntake') === 14 && physicalLine('departureIntake') === 21 && departureRuns.every(x => x.statements <= line('departureIntake') && x.physicalStatements <= physicalLine('departureIntake')), departureRuns);
  const showableDeparture = { discord_id: id(24999), proof_key: ('Gone' + letters(4999)).toLowerCase(), character_name: 'Gone' + letters(4999), observed_at: T - DAY + 4999 };
  check('  exact cursor progress each run; no reviews in the first4, only the original showable row in the fifth, no skipped or duplicate review', departureRuns.every((x, tick) => JSON.stringify(x.cursor) === JSON.stringify(x.expectedCursor) && x.value === (tick === 4 ? 1 : 0) && x.totalReviews === (tick === 4 ? 2 : 1) && JSON.stringify(x.reviews) === JSON.stringify(tick === 4 ? [showableDeparture] : [])) && one("SELECT COUNT(*) AS c FROM community_departure_reviews WHERE id=?", ref(902)).c === 1 && one('SELECT COUNT(*) AS c FROM community_departure_scan').c === 1, departureRuns);
  r = await exact("sweepCommunityDepartures", (L, e) => L("./community-departures").sweepCommunityDepartures(e));
  check("  the expired item went", r.value.deleted === 1);
  r = await exact("openWeeklyObligations", (L, e) => L("./community-contributions").openWeeklyObligations(e));
  check(`  ${CAP.obligationsPerRun} of the ${3 * CAP.obligationsPerRun} weeks opened, the policy stored once`, r.value === CAP.obligationsPerRun && one("SELECT COUNT(*) AS c FROM community_contribution_obligations").c === CAP.obligationsPerRun && one("SELECT COUNT(*) AS c FROM community_contribution_policies").c === 1, r.value);
  await exact("sweepCommunityContributions", (L, e) => L("./community-contributions").sweepCommunityContributions(e));
  await exact("sweepCommunityPrivacy", (L, e) => L("./community-privacy-intake").sweepCommunityPrivacy(e));
  r = await measure((L, e) => L("./site-news").newsCron(e));
  check(`newsCron on its usual worst path (the cleanup audited, both windows computed): ${r.statements} statements, its line less the failure read`, r.statements === line("newsCron") - 1 && JSON.parse(one("SELECT value FROM site_settings WHERE key = 'newsFigures'").value).roster.week !== null, r.statements);
  // This one existing News fault returns a component but refuses the root after its failed audit child.
  // Historical post-fault accepted root work remains unavailable; the usual positive path above is unchanged.
  r = await measure((L, e) => L("./site-news").newsCron(e), { fail: auditFails("site.news_expired"), refusedAudits: ['site.news_expired'] });
  measured.newsCron = r.statements;
  const refusedNews = originalServingFailures.get(r.outerError), failureFigures = JSON.parse(one("SELECT value FROM site_settings WHERE key='newsFigures'")?.value || 'null');
  check('newsCron: original root refused, returned component observed at logical16/Native31; cleanup and fallback figures retained', r.outerRefused === true && !Object.hasOwn(r, 'value') && Object.hasOwn(r, 'componentValue') && r.componentValue === undefined && refusedNews?.componentReturned === true && refusedNews.componentValue === r.componentValue && r.outerError instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld && r.outerError.message === 'recovery_floor_held' && r.failedNativeStatement.sql === 'INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, ?3, ?4, ?5' && r.failedNativeStatement.params[1] === 'cron' && r.failedNativeStatement.params[2] === 'site.news_expired' && r.statements === 16 && r.statements === line('newsCron') && r.physicalStatements === 31 && r.physicalStatements <= physicalLine('newsCron') && one('SELECT COUNT(*) AS c FROM site_news_notices WHERE id=?', ref(903)).c === 0 && one("SELECT COUNT(*) AS c FROM audit WHERE action='site.news_expired'").c === 0 && quietLines.some(x => x.startsWith('site news sweep failed ')) && failureFigures?.asOf === T && failureFigures.roster.day !== null && failureFigures.roster.week !== null, r, failureFigures, quietLines);
  r = await exact("runOfficerDigest", (L, e) => L("./community-digest").runOfficerDigest(e));
  check("  the old post cleaned up (refused, audited), today's posted and audited", r.value === "posted" && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'community.officer_digest_failed'").c === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'community.officer_digest_posted'").c === 1, r.value);

  console.log("\n== current schema proof and held historical migrations ==");
  r = await measure((L, e) => L('./schema').ensureSchema(e), { fail: everyColumnMissing, dispatch: false });
  measured.ensureSchema = r.physicalStatements;
  check('current schema proof consumes one Native read and never reaches the historical missing-column probes/ALTERs', r.physicalStatements === 1 && r.statements === 0, r);
  r = await measure(async (L, e) => { await L('./schema').ensureSchema(e); resetCount(); L('./schema').forgetSchemaCheck(); await L('./schema').ensureSchema(e); const cold = COUNT.physicalStatements; resetCount(); await L('./schema').ensureSchema(e); return { cold, warm: COUNT.physicalStatements }; }, { dispatch: false });
  check('current cold and subsequent warm each consume one original Native proof; no public ready-cache or migration is claimed', r.value.cold === 1 && r.value.warm === 1, r);
  for (const column of ['publication_closed', 'reminder_closed']) {
    r = await measure(async (L, e) => {
      await L('./schema').ensureSchema(e); db.exec('ALTER TABLE community_events DROP COLUMN ' + column);
      const snapshot = () => JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all());
      const before = snapshot(); let held = false; L('./schema').forgetSchemaCheck(); resetCount();
      try { await L('./schema').ensureSchema(e); } catch (error) { held = schemaHeld(L, error); }
      return { held, unchanged: before === snapshot(), absent: !db.prepare('PRAGMA table_info(community_events)').all().some(c => c.name === column) };
    }, { dispatch: false });
    check('historical missing ' + column + ' is held without an implicit ALTER or catalogue change', r.value.held && r.value.unchanged && r.value.absent && r.physicalStatements === 1, r);
  }
  r = await measure(async (L, e) => { await run("DELETE FROM site_settings WHERE key='auditTypedNames'"); const before = JSON.stringify(db.prepare('SELECT * FROM site_settings ORDER BY key').all()); let held = false; resetCount(); try { await L('./schema').ensureSchema(e); } catch (error) { held = schemaHeld(L, error); } return { held, unchanged: before === JSON.stringify(db.prepare('SELECT * FROM site_settings ORDER BY key').all()) }; }, { dispatch: false });
  check('a pending historical audit rewrite is held unchanged rather than migrated by an ordinary request', r.value.held && r.value.unchanged && r.physicalStatements === 1, r);
  const sumMeasured = Object.values(measured).reduce((s, x) => s + x, 0);
  console.log(`    existing modular logical job counts: ${sumMeasured}; not a whole-run cost`);

  console.log("\n== ordinary scheduled attempts: no original Native callback is fabricated ==");
  const wholeState = () => JSON.stringify(['community_contribution_obligations','community_profiles','members','site_reserved','community_event_reminders','roster_effects','site_settings','audit'].map(table => [table, db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
  const wholeRun = async mode => {
    await fresh(); await seedAll();
    const L = activeLoader, index = L('./index');
    if (mode === 'warm') await quiet(() => L('./schema').ensureSchema(env()));
    const before = wholeState(); resetCount(); if (mode === 'cold worst') FAIL = everyColumnMissing;
    const pending = [];
    try { await quiet(async () => { await index.default.scheduled({}, rawEnv(), { waitUntil(p) { pending.push(Promise.resolve(p)); } }); await Promise.all(pending); }); }
    finally { FAIL = null; }
    return { ...COUNT, jobs: pending.length, held: quietLines.length === 1 && quietLines[0] === 'cron entry held; skipping this run error', unchanged: before === wholeState() };
  };
  const warm = await wholeRun('warm');
  check('warm ordinary callback is exactly held, with no jobs or Native work', warm.held && warm.unchanged && warm.jobs === 0 && warm.physicalStatements === 0 && warm.physicalTrips === 0, warm);
  check('its existing capped workload shares remain unchanged: no weeks opened, profiles erased, names refreshed or reserved names queued', one('SELECT COUNT(*) AS c FROM community_contribution_obligations').c === 0 && one('SELECT COUNT(*) AS c FROM community_profiles').c === 3 * CAP.profilesPerRun && one('SELECT COUNT(*) AS c FROM members WHERE names_at IS NOT NULL').c === 0 && one("SELECT COUNT(*) AS c FROM site_reserved WHERE status='queued'").c === 0);
  check('the original three reminders remain armed with zero provider effects under the held callback', one("SELECT COUNT(*) AS c FROM community_event_reminders WHERE state='posted'").c === 0 && one("SELECT COUNT(*) AS c FROM community_event_reminders WHERE state='armed'").c === 3 && FETCHES.every(p => !p.startsWith('POST ')));
  check('all60 original roster items remain pending; a held callback never claims positive slice acceptance', one('SELECT COUNT(*) AS c FROM roster_effects WHERE done_at IS NULL').c === 60);
  check('digest, figures and role sweep do not run under the ordinary callback hold', one("SELECT COUNT(*) AS c FROM audit WHERE action IN('community.officer_digest_posted','role.sweep')").c === 0 && !one("SELECT value FROM site_settings WHERE key='newsFigures'"));
  const cold = await wholeRun('cold');
  check('cold ordinary callback is likewise held unchanged with zero Native work', cold.held && cold.unchanged && cold.jobs === 0 && cold.physicalStatements === 0 && cold.physicalTrips === 0, cold);
  const worst = await wholeRun('cold worst');
  check('legacy missing-column injection cannot bypass original callback admission', worst.held && worst.unchanged && worst.jobs === 0 && worst.physicalStatements === 0 && worst.physicalTrips === 0, worst);
  check('.161: the ordinary source qualifier is true at the unchanged source target/Paid constants (the whole measurement is the separate exact-tree Native run)', budget.EPOCH2_SCHEDULE_QUALIFIED === true && budget.SCHEDULED_STATEMENT_TARGET === 700 && budget.D1_STATEMENTS_PER_INVOCATION === 1000);

  console.log("\n== continuation over successive runs ==");
  await fresh(); HAS_ROLE = new Set();
  const backlog = await seedMembers(Math.floor(2.5 * CAP.obligationsPerRun));
  // accounts whose ids the opener cannot use, sorted before every real one: before .115 each would have held a slot
  for (const bad of ["1234", "0000000000000000000a", "00000000000000000000000"]) await account(bad, { name: "Bad" + bad.length + (bad.endsWith("a") ? "a" : "b") });
  const opener = activeLoader("./community-contributions");
  const made = [];
  const createdIds = [];
  for (let k = 0; k < 4; k++) {
    resetCount();
    made.push(await originalServingWork(env(), e => opener.openWeeklyObligations(e)));
    createdIds.push(db.prepare("SELECT discord_id FROM community_contribution_obligations ORDER BY id").all().map((x) => x.discord_id));
  }
  const full = CAP.obligationsPerRun, rest = backlog.length - 2 * full;
  check(`the opener over four runs: ${made.join(", ")} weeks (cap ${full}), every account once, none for an unusable id`, made.join() === [full, full, rest, 0].join() && one("SELECT COUNT(*) AS c FROM community_contribution_obligations").c === backlog.length && one("SELECT COUNT(*) AS c FROM community_contribution_obligations WHERE length(discord_id) NOT BETWEEN 17 AND 20").c === 0, made);
  check("  in Discord id order: the first run took the lowest ids, each later run the next ones", createdIds[0].join() === backlog.slice(0, full).join() && createdIds[1].slice(full).join() === backlog.slice(full, 2 * full).join() && createdIds[2].slice(2 * full).join() === backlog.slice(2 * full).join());
  check("  the last, empty run: one statement (the scan)", COUNT.statements === 1, COUNT);
  await run("DELETE FROM community_contribution_obligations");
  resetCount();
  const big = await originalServingWork(env(), e => opener.openWeeklyObligations(e, T, 1000));
  const lower = Math.max(1, CAP.obligationsPerRun - 1);
  check(`  a larger limit cannot raise the cap (${big}); a smaller one lowers it`, big === full && (await originalServingWork(env(), e => opener.openWeeklyObligations(e, T, lower))) === lower && (await originalServingWork(env(), e => opener.openWeeklyObligations(e, T, 0))) === 0 && (await originalServingWork(env(), e => opener.openWeeklyObligations(e, T, Number.NaN))) === 0);

  await fresh();
  await seedProfiles(Math.floor(2.5 * CAP.profilesPerRun));
  const order = db.prepare("SELECT discord_id FROM community_profiles ORDER BY departed_at, discord_id").all().map((x) => x.discord_id);
  const dir = activeLoader("./community-directory");
  const erased = [];
  const left = [];
  for (let k = 0; k < 4; k++) { erased.push((await originalServingWork(env(), e => dir.sweepCommunityProfiles(e))).deleted); left.push(db.prepare("SELECT discord_id FROM community_profiles ORDER BY departed_at, discord_id").all().map((x) => x.discord_id)); }
  const pc = CAP.profilesPerRun, prest = order.length - 2 * pc;
  check(`the profile cleanup over four runs: ${erased.join(", ")} (cap ${pc}), oldest departure first, everything under them gone`, erased.join() === [pc, pc, prest, 0].join() && left[0].join() === order.slice(pc).join() && left[1].join() === order.slice(2 * pc).join() && one("SELECT COUNT(*) AS c FROM community_professions").c === 0 && one("SELECT COUNT(*) AS c FROM community_refs").c === 0, erased);
  check("  the order is the departure, not the id (the seed runs them against each other)", order[0] === id(7000 + order.length - 1) && order.at(-1) === id(7000));
  // Review of 3 Oct 2026: the check above holds without the query's ORDER BY too, because the departure index already
  // returns rows in departed_at order. Profiles that departed in the same second, inserted in DESCENDING Discord id order
  // (so the table's own order runs against the ids), tell the two apart: the cleanup takes the lowest ids first.
  await fresh();
  const tied = Array.from({ length: CAP.profilesPerRun + 5 }, (_, i) => id(7100 + i));
  const tiedAt = T - 40 * DAY;
  for (const did of [...tied].reverse()) {
    await run("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?)", did, ref(Number(did.slice(-4))), T - 60 * DAY);
    await run("INSERT INTO community_profiles (discord_id, ref, listed, departed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", did, ref(Number(did.slice(-4))), tiedAt, T - 60 * DAY, T - 60 * DAY);
  }
  const firstTied = await originalServingWork(env(), e => activeLoader("./community-directory").sweepCommunityProfiles(e));
  const tiedLeft = db.prepare("SELECT discord_id FROM community_profiles ORDER BY discord_id").all().map((x) => x.discord_id);
  check(`  ${tied.length} profiles that departed in the same second: the first run erases the ${CAP.profilesPerRun} lowest Discord ids, not the first rows stored`, firstTied.deleted === CAP.profilesPerRun && tiedLeft.join() === tied.slice(CAP.profilesPerRun).join(), tiedLeft);

  db.close(); doDb.close();
  globalThis.Date = RealDate;
  globalThis.setTimeout = realSetTimeout;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

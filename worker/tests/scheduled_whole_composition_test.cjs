// Independent joined scheduler ACCOUNTING fixture. Actual source jobs/native SQLite; no correctness sign-off for author's privacy core.
const {AsyncLocalStorage}=require('node:async_hooks'),cryptoNode=require('node:crypto');globalThis.crypto=cryptoNode.webcrypto;
const ALS=new AsyncLocalStorage(),SOURCE_PINS=new Map(),JOB_COUNTS={},JOB_RESULTS={},JOB_ERRORS=[];
const JOB_NAMES=new Set(['ensureSchema','sweepInviteQueue','sweepMemberRoles','continueRosterEffects','refreshNames','autoQueueReserved','purgeSeenInteractions','purgeBattleNetData','sweepRenameHolds','sweepCommunityProfiles','sweepCommunityEvents','runEventReminders','sweepCommunityTrials','sweepCommunityRestrictions','departureIntake','sweepCommunityDepartures','openWeeklyObligations','sweepCommunityContributions','sweepCommunityPrivacy','newsCron','runOfficerDigest','runServingErasureJob','sweepServingRetention']);
function readSource(file){const b=require('node:fs').readFileSync(file);SOURCE_PINS.set(file,{bytes:b.length,sha256:cryptoNode.createHash('sha256').update(b).digest('hex')});return b.toString('utf8');}
function countStatements(n,sql){COUNT.statements+=n;const job=ALS.getStore()||(/^DELETE FROM seen_interactions/.test(sql)?'purgeSeenInteractions':'unattributed');JOB_COUNTS[job]=(JOB_COUNTS[job]||0)+n;}
function wrapJobs(mod){for(const key of Object.keys(mod.exports))if(JOB_NAMES.has(key)&&typeof mod.exports[key]==='function'){const real=mod.exports[key];mod.exports[key]=(...args)=>ALS.run(key,async()=>{try{const result=await real(...args);JOB_RESULTS[key]=result;return result;}catch(e){JOB_ERRORS.push({job:key,error:String(e)});throw e;}});}}
function resetJobs(){for(const x of[JOB_COUNTS,JOB_RESULTS])for(const k of Object.keys(x))delete x[k];JOB_ERRORS.length=0;}// Build .115 (3 Oct 2026; Codex's finding of 13:26 UTC, review115/scheduled-query-budget.md): the scheduled invocation's
// D1 statement budget (src/scheduled-budget.ts), through the REAL src/*.ts (transpiled by TypeScript itself) against the
// REAL schema.sql in SQLite (node:sqlite), with the real index.ts scheduled() and the real discord.ts; only the network is
// faked, at fetch(). D1 counts EVERY statement toward the per-invocation limit, each statement of a batch included, so the
// shim counts every statement it is handed (a batch that fails counts all of its statements, a refused statement counts).
// Covers:
//   - the table: a line for every job scheduled() starts, the caps and the source agree, the sum at most the target and
//     the target below the Paid limit;
//   - each job alone with every capped workload past its cap and every conditional audit due: the measured count equals
//     its line (the role sweep, whose line counts failed audits, at most its line, on its success and its failure path);
//   - the role sweep's line taken apart (review of 3 Oct 2026): its fixed reads, and exactly 5 statements an account on the
//     success path, 7 on the failure path and 4 a held account in the banned reconciliation, each measured as the
//     difference between two runs one account apart, so a change to the shared role writer that costs one statement
//     more fails here; the longest failure run the call budget allows equals the fixed reads + 7 an account;
//   - the schema: warm 0, cold on a current database 129 (132 before the audit rewrite; publication table/index add
//     two and the closure probe adds one to the previous 126/129), cold with every column reported
//     missing equal to its line;
//   - the whole real scheduled() with every community feature on, warm, cold and cold worst: within the table and the target;
//   - the roster's member effects (third review round; Codex, 3 Oct 2026 16:48 UTC, finding A): the cron's slice of a
//     backlog left by an export stays within its line on the success path and on the failure path (a hold landing during
//     each grant, the removal's audits refused, every welcome audited), admitting items before it starts them, and the
//     whole run carries that backlog too (roster_effects_test covers the worklist itself);
//   - continuation: the opener and the profile cleanup finish a backlog over successive runs, in order; an id the opener
//     would skip never holds a slot; `limit` only lowers the opener's cap; the role sweep's account clamp; profiles that
//     departed in the same second go in Discord id order, which the departure index alone does not give (review of 3 Oct
//     2026: the seed inserts them against that order).
// Run from the worker folder:  node tests/scheduled_budget_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = process.env.OLYMPUS_SCHEDULED_SOURCE || path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite that counts every statement; FAIL(sql, params) refuses one (it still counts) ----------
let COUNT = { statements: 0, trips: 0 };
const resetCount = () => { COUNT = { statements: 0, trips: 0 }; };
let FAIL = null;
function d1(dbh) {
  const exec = (sql, params) => {
    if (FAIL && FAIL(sql, params)) throw new Error(FAIL.message ? FAIL.message(sql) : "D1_ERROR: refused by the suite");
    const st = dbh.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const api = {
      _sql: sql,
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        if (p.length > 99) throw new Error("D1_ERROR: too many bound parameters");
        params = p;
        return api;
      },
      first: async () => { COUNT.trips++; countStatements(1,sql); const r = exec(sql, params); return r.results[0] ?? null; },
      all: async () => { COUNT.trips++; countStatements(1,sql); return { results: exec(sql, params).results }; },
      run: async () => { COUNT.trips++; countStatements(1,sql); return exec(sql, params); },
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      COUNT.trips++;
      countStatements(stmts.length,stmts.map(s=>s._sql).join("\n")); // every statement of the batch, as D1 counts them, whether or not it completes
      dbh.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); dbh.exec("COMMIT"); return out; } catch (e) { dbh.exec("ROLLBACK"); throw e; }
    },
  };
}
let db;
function fresh() {
  db = new DatabaseSync(":memory:");
  db.function("strftime",(format,value)=>{if(format!=="%s"||value!=="now")throw Error("unexpected controlled SQL clock");return String(T);}); db.exec("PRAGMA foreign_keys = ON");
  db.exec(readSource(path.join(root, "schema.sql")));
}

// ---------- the real modules, each run in a module graph of its own (a fresh isolate: no schema check, no caches) ----------
const transpiled = {};
const transpile = (file) => (transpiled[file] ??= ts.transpileModule(readSource(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
function makeLoader() {
  const cache = {};
  const load = (name) => {
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
    wrapJobs(mod); return mod.exports;
  };
  return load;
}
const budget = makeLoader()("./scheduled-budget");
const CAP = budget.SCHEDULED_CAPS;

// ---------- the clock: the last 16:00 UTC at or before now (the digest posts after 15:00 UTC), behind the database's ----------
const RealDate = Date;
const H = 3600, DAY = 86400;
const realNow = () => Math.floor(RealDate.now() / 1000);
let T = Math.floor(realNow() / DAY) * DAY + 16 * H;
if (T > realNow()) T -= DAY;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
// the role sweep waits 250 ms between grants; the suite does not
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => realSetTimeout(fn, 0, ...a);

// ---------- Discord, faked at fetch(): the guild's roles, members, role writes, messages, users ----------
const GUILD = "236932545793490944", ROLE = "1549581282227265566", STAFF = "1550000000000000010", LOG = "1550000000000000011", OTHER = "1550000000000000012", RAID = "1550000000000000013", BOT = "1550000000000000014";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [];
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", p = u.pathname;
  FETCHES.push(`${method} ${p}`);
  let m;
  if (p === "/api/v10/users/@me") return reply({ id: BOT, bot: true });
  if (p === `/api/v10/channels/${RAID}` && method === "GET") return reply({ id: RAID, guild_id: GUILD, type: 0 });
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{ id: ROLE }]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/)) && method === "GET") return reply({ roles: HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: "u" } });
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === "PUT") { HAS_ROLE.add(m[1]); ON_PUT?.(m[1]); }
    else HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === "POST") {
    const body = JSON.parse(init.body || "{}");
    if (m[1] === RAID) return reply({ id: "1550000000000000096", channel_id: RAID, author: { id: BOT, bot: true }, type: 0, content: body.content, nonce: body.nonce, embeds: [], attachments: [] });
    if (body.nonce) return reply({ id: "1550000000000000099" }); // the officer digest
    if (m[1] === STAFF) return reply({ message: "Missing Access", code: 50001 }, 403); // the staff notice cannot be posted: audited
    return reply({ id: "1550000000000000098" });
  }
  if (p.match(/^\/api\/v10\/channels\/\d+\/messages\/\d+$/) && method === "DELETE") return reply({ message: "Missing Access", code: 50001 }, 403); // a definitive refusal: audited
  if ((m = p.match(/^\/api\/v10\/users\/(\d+)$/))) return reply({ id: m[1], username: "user" + m[1].slice(-4), global_name: null });
  return reply({ message: "unexpected in this suite: " + method + " " + p }, 500);
};

const ALL_ON = "directory,crafting,events,attendance,trials,restrictions,departures,privacy_intake,contributions";
const env = (over = {}) => ({
  DB: d1(db), DISCORD_BOT_TOKEN: "test-token", GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, CHANNEL_MOD_ALERTS: STAFF, CHANNEL_SERVER_LOG: LOG,
  VERIFY_SECRET: "verify-secret-for-tests", COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example",
  COMMUNITY_FEATURES: ALL_ON, CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "90", CONTRIBUTIONS_SCOPE: "olympus", PRIVACY_INTAKE_ENABLED: "true",
  OFFICER_DIGEST_ENABLED: "true", LAUNCH_AT: String(T - DAY), INVITE_MAX_ATTEMPTS: "6",
  // above the caps on purpose: the source clamps them to the budget's
  ROLE_SWEEP_PER_RUN: "50", ROLE_CALL_BUDGET: "50", NAMES_PER_RUN: "50",
  SITE_GUILD_ID: GUILD, DISCORD_APP_ID: BOT, INTROS_GUILD_ID: GUILD, INTROS_CHANNELS: `raid-signups=${RAID}`,
  EVENT_DISCORD_DELIVERY: "on", EVENT_DISCORD_REMINDERS: "on", COMMUNITY_ORGANIZERS: "300000000000001000",
  ...over,
});

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const quiet = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };
const id = (k) => String(300000000000000000n + BigInt(k));
const letters = (k) => { let s = ""; do { s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } while (k > 0); return s; };
const ref = (k) => ("R" + String(k)).padEnd(22, "x");

// ---------- the seed: every capped workload past its cap, every conditional audit due ----------
const KEY = {}; // account -> its character's name key
function account(did, { name, status = "member", banned = 0, site = true, memberSince = T - 60 * DAY, leftAt = null, key = null } = {}) {
  run("INSERT INTO members (discord_id, banned) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING", did, banned);
  if (name) {
    const k = key ?? name.toLowerCase();
    run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, member_since, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)", k, name, did, status, T - 90 * DAY, memberSince, leftAt);
    KEY[did] = k;
  }
  if (site) run("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, 0, 1)", did, "u" + did.slice(-4), T - 30 * DAY, T - DAY);
}
/** Roster-confirmed accounts signed in here: the opener's candidates, the role sweep's rotation, the names refresh. */
function seedMembers(count, from = 0) {
  const ids = [];
  for (let i = from; i < from + count; i++) { const did = id(1000 + i); account(did, { name: "Mem" + letters(i) }); ids.push(did); }
  return ids;
}
function seedPromotions(ids) {
  for (const did of ids) run("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'roster.member', ?, ?)", T - 600, KEY[did], JSON.stringify({ discordId: did }));
}
function seedBanned(count) {
  for (let i = 0; i < count; i++) { const did = id(5000 + i); account(did, { site: false }); run("UPDATE members SET banned = 1 WHERE discord_id = ?", did); HAS_ROLE.add(did); }
}
function seedReserved(count) {
  for (let i = 0; i < count; i++) run("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, ?, ?, 'approved', ?, 'admin', ?)", id(9000 + i), "Res" + letters(i), "res" + letters(i), T - 9 * DAY, T - 8 * DAY + i);
}
/** Profiles thirty days departed, their owners no longer qualifying; departed_at runs AGAINST id order, so the order is visible. */
function seedProfiles(count, from = 0) {
  for (let i = from; i < from + count; i++) {
    const did = id(7000 + i), departed = T - 31 * DAY - (i - from + 1) * 60;
    run("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?)", did, ref(i), T - 60 * DAY);
    run("INSERT INTO community_profiles (discord_id, ref, listed, departed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", did, ref(i), departed, T - 60 * DAY, T - 60 * DAY);
    run("INSERT INTO community_professions (discord_id, profession, skill, updated_at) VALUES (?, 'mining', 300, ?)", did, T - 60 * DAY);
  }
}
/** Departures for the intake: ten full pages of 500 the site cannot show (the name key is not the name's), the last one showable. */
function seedDepartures() {
  const total = 10 * 500;
  for (let i = 0; i < total; i++) {
    const did = id(20000 + i), name = "Gone" + letters(i), valid = i === total - 1;
    account(did, { name, status: "left", leftAt: T - DAY + i, key: valid ? name.toLowerCase() : "x" + name.toLowerCase() });
  }
}
function seedFixed() {
  // the invite queue: rows past their attempts are retired, and the staff notice about them cannot be posted
  for (let i = 0; i < 3; i++) run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, attempts) VALUES (?, ?, ?, 'queued', ?, 6)", "q" + letters(i), "Q" + letters(i), id(8000 + i), T - DAY);
  // Battle.net data past its 29 days
  run("INSERT INTO members (discord_id, battletag, bnet_conn_id, linked_at) VALUES (?, 'Old#1234', 'c1', ?)", id(8100), T - 40 * DAY);
  // an event, a trial, a departure item past their time; a restriction period with no case
  run("INSERT INTO community_events (id, op_id, title, starts_at, duration_min, ends_at, created_by, created_at, updated_at, retain_until) VALUES (?, 'op1', 'Old raid', ?, 60, ?, ?, ?, ?, ?)", ref(900), T - 40 * DAY, T - 40 * DAY + 3600, id(1000), T - 41 * DAY, T - 41 * DAY, T - 10 * DAY);
  run("INSERT INTO community_trials (id, op_id, discord_id, started_at, review_due_at, status, outcome_reason, concluded_at, created_at, updated_at, incarnation, retain_until) VALUES (?, 'op2', ?, ?, ?, 'ended', 'withdrew', ?, ?, ?, 'inc', ?)", ref(901), id(1001), T - 80 * DAY, T - 60 * DAY, T - 50 * DAY, T - 80 * DAY, T - 50 * DAY, T - 20 * DAY);
  run("INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, created_at, retain_until) VALUES (?, ?, 'old one', 'Old One', 'old', 'left', ?, ?, ?)", ref(902), id(1002), T - 40 * DAY, T - 40 * DAY, T - 10 * DAY);
  run("INSERT INTO community_restriction_periods (discord_id, opened_at, retain_until) VALUES (?, ?, ?)", id(8200), T - 90 * DAY, T + 90 * DAY);
  // News on, a notice past its time with its record, and three trusted complete exports: the figures compute both windows
  run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL)", T);
  run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, T + 118 * DAY);
  run("INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until) VALUES (?, 'h', 'Old', 'Old', 1, 'n', ?, ?, ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, id(1000), T - 2 * DAY, T - 10);
  const snap = (names, first) => {
    const sid = Number(run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'h', 1, 1, ?)", first, first, names.length, first).lastInsertRowid);
    for (const nm of names) run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, ?, ?)", sid, nm.toLowerCase(), nm);
  };
  snap(["Ana", "Bo", "Cy"], T - 8 * DAY);
  snap(["Ana", "Bo", "Dee"], T - 30 * H);
  snap(["Ana", "Bo", "Dee", "Eve"], T - H);
  // the officer digest: yesterday's post in a channel it is no longer configured for (cleaned up first; Discord refuses)
  const yesterday = new RealDate((T - DAY) * 1000).toISOString().slice(0, 10);
  run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('officer_digest', ?, ?, NULL)", JSON.stringify({ day: yesterday, outcome: "posted", attempts: 1, final: true, notBefore: 0, lease: null, posted: { channelId: OTHER, messageId: "1550000000000000097", day: yesterday }, intent: null, halted: false }), T - DAY);
}
/**
 * .115, third review round (finding A): a derived run of the newest snapshot with `count` promotions still pending, as an
 * export leaves it when its own invocation could not finish them (roster.ts deriveRun, applyEffects).
 */
let EFFECT_IDS = [];
function seedEffects(count) {
  const snap = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  const runId = Number(run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at, derived_at, items) VALUES (?, ?, 1, ?, ?, ?)", snap, snap, T - 600, T - 600, count).lastInsertRowid);
  EFFECT_IDS = [];
  for (let i = 0; i < count; i++) {
    const did = id(30000 + i), name = "Eff" + letters(i);
    account(did, { name, status: "verified", site: false, memberSince: null });
    run("INSERT INTO roster_effects (run_id, seq, kind, name_key, name, discord_id) VALUES (?, ?, 'promote', ?, ?, ?)", runId, i, name.toLowerCase(), name, did);
    EFFECT_IDS.push(did);
  }
  return runId;
}
let MEMBER_IDS = [];
function seedReminders() {
  const clock = one("SELECT CAST(strftime('%s','now') AS INTEGER) AS clock").clock, actor = id(1000);
  for (let i = 0; i < 3; i++) {
    const eventId = ref(9901 + i), start = clock + 1800 + i;
    run("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until) VALUES(?,?,?, ?,120,?,?,?,?,?)", eventId, ref(9801+i), "Public reminder", start, start+7200, actor, clock, clock, start+7200+30*DAY);
    run("INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,guild_id,channel_id,host,op_id,state,frozen_content,created_at,updated_at,retain_until) VALUES(?,1,?,?,1,?,?,?,?,'armed',?,?,?,?)", eventId, start, actor, GUILD, RAID, "guild.example", ref(9701+i), "Public synthetic reminder", clock, clock, start+7200+30*DAY);
  }
}
function seedAll() {
  HAS_ROLE = new Set(); ON_PUT = null; FETCHES = [];
  db.exec("BEGIN");
  MEMBER_IDS = seedMembers(3 * CAP.obligationsPerRun);
  seedPromotions(MEMBER_IDS.slice(0, 5));
  seedBanned(CAP.roleSweepBanned + 1);
  seedReserved(1001);
  seedProfiles(3 * CAP.profilesPerRun);
  seedDepartures();
  seedFixed();
  seedEffects(60);
  seedReminders();
  db.exec("COMMIT");
}

/** One job alone, over a fresh seeded database and a fresh module graph; the statements it sent. */
async function measure(fn, { seed = seedAll, fail = null, over = {}, legacyCostProbe = false } = {}) {
  fresh(); seed();
  const L = makeLoader();
  // Measure legacy per-account costs without saturating the new production cap1. Whole-run
  // admission/clamp checks below retain the real caps; this benchmark graph has no live effects.
  if(legacyCostProbe)Object.assign(L('./scheduled-budget').SCHEDULED_CAPS,{roleSweepAccounts:20,roleSweepBanned:5});
  resetCount();
  FAIL = fail;
  let value;
  try { value = await quiet(() => fn(L, env(over))); } finally { FAIL = null; }
  return { statements: COUNT.statements, trips: COUNT.trips, value };
}
const line = (job) => budget.SCHEDULED_BUDGET.find((j) => j.job === job)?.worst;
const auditFails = (...actions) => (sql, params) => /^INSERT INTO audit \(ts, actor, action, subject, details\) (VALUES|SELECT)/.test(sql) && actions.includes(params[2]);
// every column reported missing: the probes say "no such column", the ALTERs "duplicate column" (swallowed by addColumn)
const everyColumnMissing = Object.assign((sql) => /^SELECT \w+ FROM \w+ LIMIT 0$/.test(sql) || /^ALTER TABLE /.test(sql), { message: (sql) => (/^ALTER/.test(sql) ? "D1_ERROR: duplicate column name" : "D1_ERROR: no such column") });

const RANK_LABELS=Array.from({length:10},(_,i)=>String(770000000000000000n+BigInt(i))),RANK_NAMES=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const BOTROLE='770000000000000020',LEADER='770000000000000021',OFFICER='770000000000000022',RAIDLEADER='770000000000000023',BLOCKER='770000000000000024',ERASE=id(45000),ERASECHANNEL='770000000000000025',ERASEOP='a'.repeat(32);
let ROLES_BY_USER={},DELETED_MESSAGES=new Set(),EFFECT_FAILURE=false;
const oldFetch=globalThis.fetch;
const inventory=()=>[{id:GUILD,position:0,permissions:'0',managed:false},{id:ROLE,position:1,permissions:'0',managed:false},{id:BOTROLE,position:40,permissions:'268435456',managed:false},{id:LEADER,position:30,permissions:'1024',managed:false},{id:OFFICER,position:29,permissions:'1024',managed:false},{id:RAIDLEADER,position:28,permissions:'1024',managed:false},{id:BLOCKER,position:0,permissions:'0',managed:false},...RANK_LABELS.map((id,i)=>({id,position:2+i,permissions:'0',managed:false}))];
globalThis.fetch=async(url,init={})=>{const u=new URL(String(url)),method=init.method||'GET',p=u.pathname;if(u.hostname!=='discord.com'||!p.startsWith('/api/v10/'))throw Error('unexpected network target');
 if(p===`/api/v10/guilds/${GUILD}/roles`){FETCHES.push(method+' '+p);return reply(inventory());}
 let m;if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/))&&method==='GET'){FETCHES.push(method+' '+p);const roles=m[1]===BOT?[BOTROLE]:[...new Set([...(ROLES_BY_USER[m[1]]||[]),...(HAS_ROLE.has(m[1])?[ROLE]:[])])];return reply({roles,user:{id:m[1],username:'synthetic'}});}
 if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/))){FETCHES.push(method+' '+p);const current=ROLES_BY_USER[m[1]]||[];ROLES_BY_USER[m[1]]=method==='PUT'?[...new Set([...current,m[2]])]:current.filter(x=>x!==m[2]);if(m[2]===ROLE){if(method==='PUT')HAS_ROLE.add(m[1]);else HAS_ROLE.delete(m[1]);}if(method==='PUT'){ON_PUT?.(m[1]);if(EFFECT_FAILURE)throw Error('synthetic lost dispatched role reply');}return new Response(null,{status:204});}
 if((m=p.match(/^\/api\/v10\/channels\/(\d+)\/messages\/(\d+)$/))&&m[1]===ERASECHANNEL){FETCHES.push(method+' '+p);if(method==='DELETE'){DELETED_MESSAGES.add(m[2]);return new Response(null,{status:204});}if(DELETED_MESSAGES.has(m[2]))return reply({code:10008},404);return reply({id:m[2],channel_id:m[1],author:{id:BOT,bot:true}});}
 if(p===`/api/v10/channels/${ERASECHANNEL}`){FETCHES.push(method+' '+p);return reply({id:ERASECHANNEL,guild_id:GUILD,type:0});}
 return oldFetch(url,init);
};
function enabledEnv(){return env({QR_PHASE1_ENABLED:'true',QR_RANK_MAPPING_ENABLED:'true',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',ROLE_GUILD_LEADER:LEADER,ROLE_OFFICER:OFFICER,ROLE_RAID_LEADER:RAIDLEADER,QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'ten-rank',roles:RANK_LABELS})});}
function seedQualifiedRankRoster(){const selected=MEMBER_IDS[0],sid=Number(run("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at)VALUES(?,?,'fixture',70,'joined-max',1,1,?)",T,T,T).lastInsertRowid);
 for(let i=0;i<10;i++){const guid=i===4?'Player-1234-00001000':'Player-1234-'+String(100+i).padStart(8,'0');run('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid)VALUES(?,?,?,?,?,?)',sid,'rank'+i,'Rank '+i,RANK_NAMES[i],i,guid);}run('UPDATE characters SET guid=? WHERE discord_id=?','Player-1234-00001000',selected);HAS_ROLE.add(selected);ROLES_BY_USER[selected]=[RANK_LABELS[5],OFFICER];
 run("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'roster_privileged_rank',?,?,1,'settled','fixture prior bot-owned officer',1,?,?)",'d'.repeat(32),selected,GUILD,OFFICER,T-100,T+200);
 const rid=one('SELECT MAX(id)AS id FROM roster_effect_runs').id;run('UPDATE roster_effect_runs SET snapshot_id=?,prev_snapshot_id=? WHERE id=?',sid,sid,rid);
 for(let i=0;i<EFFECT_IDS.length;i++){const did=EFFECT_IDS[i],guid='Player-1234-'+String(30000+i).padStart(8,'0'),c=one('SELECT name_key,name FROM characters WHERE discord_id=?',did);run('UPDATE characters SET guid=? WHERE discord_id=?',guid,did);run('UPDATE roster_effects SET guid=? WHERE run_id=? AND seq=?',guid,rid,i);run('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid)VALUES(?,?,?,?,?,?)',sid,c.name_key,c.name,RANK_NAMES[7],7,guid);}
}
async function seedBusyErasure(L,e,automatic=false){account(ERASE,{site:automatic!=='bot'});run('UPDATE site_users SET first_login=?,last_login=?,session_version=7 WHERE discord_id=?',T,T,ERASE);const core=L('./site-core'),authority=L('./privacy-serving-authority');let proof;if(automatic){run('UPDATE site_users SET first_login=?,last_login=? WHERE discord_id=?',T-400*DAY,T-366*DAY,ERASE);run('UPDATE members SET activity_at=? WHERE discord_id=?',T-366*DAY,ERASE);proof={subjectGeneration:null};}else{const cookie=(await core.sessionCookie(e,ERASE,7)).split(';')[0];const admitted=await authority.requestServingErasure(e,new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2'}}),ERASEOP);if(admitted.status!==202)throw Error('max-job genuine admission refused');proof=await authority.readErasureProof(e,ERASEOP);}
 for(let i=0;i<5;i++){const mid=String(780000000000000000n+BigInt(i)),mop=(i+1).toString(16).repeat(32);run("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'review',?,?,?,'known',1,?,?,?)",mop,JSON.stringify([{id:ERASE,g:proof.subjectGeneration}]),ERASECHANNEL,mid,T,T,T+authority.PRIVACY_REPLAY);const event=('E'+i).padEnd(22,'e'),op=('P'+i).padEnd(22,'p');run("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until)VALUES(?,?,'Private synthetic creator event',?,60,?,?,?,?,?)",event,op,T+3600,T+7200,ERASE,T,T,T+authority.PRIVACY_REPLAY);run("INSERT INTO community_event_deliveries(event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,op_id,claim_nonce,state,actor,created_at,updated_at,retain_until)VALUES(?,'publication',1,?,?,?,?,?,?,'posted',?,?,?,?)",event,T+3600,GUILD,ERASECHANNEL,String(780000000000000010n+BigInt(i)),op,'n'.repeat(22),ERASE,T,T,T+authority.PRIVACY_REPLAY);}
 for(const key of['b','c'])run("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'verified_membership',?,?,1,'unknown','expired synthetic custody',1,?,?)",key.repeat(32),ERASE,GUILD,ROLE,T-400,T-100);
}
function snapshotOutcome(){return{erasure:one('SELECT state FROM privacy_serving_jobs WHERE subject_id=? ORDER BY created_at DESC LIMIT 1',ERASE)?.state||null,providerOpen:one("SELECT COUNT(*) AS n FROM privacy_provider_messages WHERE channel_id=?AND state NOT IN('removed','refused')",ERASECHANNEL).n,obligations:one('SELECT COUNT(*)AS n FROM community_contribution_obligations').n,profiles:one('SELECT COUNT(*)AS n FROM community_profiles').n,reserved:one("SELECT COUNT(*)AS n FROM site_reserved WHERE status='queued'").n,names:one('SELECT COUNT(*)AS n FROM members WHERE names_at IS NOT NULL').n,reminders:one("SELECT COUNT(*)AS n FROM community_event_reminders WHERE state='posted'").n,effectsRemaining:one('SELECT COUNT(*)AS n FROM roster_effects').n,rankDispatched:one("SELECT COUNT(*)AS n FROM role_settlements WHERE purpose IN('roster_native_rank','roster_privileged_rank')AND attempts=1 AND created_at>=?",T).n};}
const reports=[];
// Prior maximum-schema fixture200 intentionally retained audit marker;203 additionally consumes the actual three-statement rewrite.

async function whole(mode,on,fault=false,variant='control'){fresh();seedAll();ROLES_BY_USER={};DELETED_MESSAGES=new Set();EFFECT_FAILURE=false;const L=makeLoader();L('./privacy-access-data');const index=L('./index'),e=on?enabledEnv():env();if(on){seedQualifiedRankRoster();await seedBusyErasure(L,e,variant.startsWith('auto-site')?'site':variant==='auto-bot'?'bot':false);if(variant!=='control'){run("UPDATE roster_effects SET kind='note' WHERE discord_id=?",EFFECT_IDS[0]);run("UPDATE characters SET status='left',left_at=? WHERE discord_id=?",T-10,EFFECT_IDS[0]);}if(variant==='member-missing'||variant==='auto-site-missing')HAS_ROLE.delete(MEMBER_IDS[0]);if(variant==='note-lost')ON_PUT=did=>{if(did===EFFECT_IDS[0])throw Error('synthetic lost role response');};}
 if(mode!=='cold worst')run("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)",T);if(mode==='warm')await L('./schema').ensureSchema(e);resetCount();resetJobs();FETCHES=[];if(mode==='cold worst')FAIL=everyColumnMissing;const pending=[],errors=[],oldConsole=console.error;console.error=(...x)=>errors.push({job:ALS.getStore()||null,text:x.join(' ')});
 if(fault===true)FAIL=(sql,params)=>/^INSERT INTO audit/.test(sql)&&['roster.member','role.restored','notice.no_channel'].includes(params[2]);if(fault==='terminal')FAIL=Object.assign(sql=>(mode==='cold worst'&&everyColumnMissing(sql))||sql.includes('privacy_terminal_unconfirmed'),{message:sql=>everyColumnMissing(sql)?everyColumnMissing.message(sql):'D1_ERROR: synthetic last terminal statement refused'});if(fault==='role-block')ON_PUT=did=>{if(did===EFFECT_IDS[0])run('UPDATE members SET banned=1 WHERE discord_id=?',did);};
 try{await index.default.scheduled({},e,{waitUntil:p=>pending.push(Promise.resolve(p).catch(err=>{errors.push({job:ALS.getStore()||null,text:String(err)});} ))});await Promise.all(pending);}finally{FAIL=null;console.error=oldConsole;}
 const result={mode,on,fault,variant,statements:COUNT.statements,trips:COUNT.trips,jobs:pending.length,jobCounts:{...JOB_COUNTS},jobResults:{...JOB_RESULTS},jobErrors:JOB_ERRORS.slice(),consoleErrors:errors,http:FETCHES.length,outcome:snapshotOutcome()};reports.push(result);
 check(`${on?'ON':'OFF'} ${mode}${fault?' with audit faults':''}: every actual scheduled job admitted`,pending.length===budget.SCHEDULED_BUDGET.length-1,result.jobs);check('whole native accounting within697 source sum and700 target',result.statements<=budget.SCHEDULED_WORST_CASE&&result.statements<=700,{actual:result.statements,bound:budget.SCHEDULED_WORST_CASE});
 const accounted=Object.values(result.jobCounts).reduce((n,v)=>n+v,0);check('per-job actual counts reconcile whole invoked statement model',accounted===result.statements&&(!result.jobCounts.unattributed||result.jobCounts.unattributed===1),{accounted,whole:result.statements,counts:result.jobCounts});
 for(const j of budget.SCHEDULED_BUDGET)check(`${on?'ON':'OFF'} ${mode} ${j.job} actual${result.jobCounts[j.job]||0} <= source${j.worst}`,(result.jobCounts[j.job]||0)<=j.worst);
 if(on&&!fault){check('busy job actually completes own serving erase after10 known-message and2 expired-role debts',result.outcome.erasure==='complete'&&result.outcome.providerOpen===0&&result.jobCounts.runServingErasureJob>=132,result.outcome);check('actual rank work/banned cap/roster continuation all execute rather than hollow pre-effect HOLD',result.outcome.rankDispatched===2&&result.jobResults.sweepMemberRoles?.checked===1&&result.jobResults.sweepMemberRoles?.revoked.length===1&&result.outcome.effectsRemaining<60,{outcome:result.outcome,sweep:result.jobResults.sweepMemberRoles,roster:result.jobResults.continueRosterEffects});check('native retention20 and capped existing backlogs all run',result.jobCounts.sweepServingRetention===20&&result.outcome.obligations===CAP.obligationsPerRun&&result.outcome.profiles===2*CAP.profilesPerRun&&result.outcome.reserved===1000&&result.outcome.names===CAP.namesPerRun&&result.outcome.reminders===1,result.outcome);}
 if(!on)check('privacy/rank OFF baseline has no lifecycle job or retention work',!(result.jobCounts.runServingErasureJob||result.jobCounts.sweepServingRetention)&&result.outcome.rankDispatched===0);
 if(fault==='terminal')check('late actual terminal-batch failure commits no serving completion or account deletion',result.jobCounts.ensureSchema===203&&result.jobResults.runServingErasureJob?.completed===0&&result.outcome.erasure==='held'&&one('SELECT COUNT(*)AS n FROM site_users WHERE discord_id=?',ERASE).n===1&&one('SELECT COUNT(*)AS n FROM privacy_restore_replay WHERE subject_id=?',ERASE).n===0,{job:result.jobResults.runServingErasureJob,outcome:result.outcome});if(fault==='role-block')check('late roster role hold performs real compensated path inside descriptor',one('SELECT banned FROM members WHERE discord_id=?',EFFECT_IDS[0]).banned===1&&!HAS_ROLE.has(EFFECT_IDS[0])&&FETCHES.some(x=>x.includes('/members/'+EFFECT_IDS[0]+'/roles/')&&x.startsWith('DELETE ')),{roster:result.jobCounts.continueRosterEffects,result:result.jobResults.continueRosterEffects});return result;
}
(async()=>{check('frozen source budget697 with purpose schema203 and retention20',budget.SCHEDULED_WORST_CASE===697&&line('ensureSchema')===203&&line('sweepServingRetention')===20&&line('runServingErasureJob')===148&&CAP.rosterEffectsStatements===56,{sum:budget.SCHEDULED_WORST_CASE,schema:line('ensureSchema'),retention:line('sweepServingRetention')});
 const offWarm=await whole('warm',false),offCold=await whole('cold',false),offWorst=await whole('cold worst',false);check('actual OFF cold159 and all-schema-fault203 deltas preserved',offCold.statements-offWarm.statements===159&&offWorst.statements-offWarm.statements===203,{warm:offWarm.statements,cold:offCold.statements,worst:offWorst.statements});
 const warm=await whole('warm',true),cold=await whole('cold',true),worst=await whole('cold worst',true);check('actual ON cold159 and all-schema-fault203 deltas preserved',cold.statements-warm.statements===159&&worst.statements-warm.statements===203,{warm:warm.statements,cold:cold.statements,worst:worst.statements});await whole('warm',true,true);
 await whole('cold worst',true,false,'auto-site');await whole('cold worst',true,false,'auto-bot');await whole('cold worst',true,false,'note');await whole('cold worst',true,false,'member-missing');await whole('cold worst',true,false,'note-lost');
 await whole('cold worst',true,'terminal','note');await whole('cold worst',true,'role-block','note');
 await whole('cold worst',true,false,'auto-site-missing');
 check('all loaded serving source/schema bytes stable during measured gates',Array.from(SOURCE_PINS).every(([file,p])=>{const b=fs.readFileSync(file);return b.length===p.bytes&&cryptoNode.createHash('sha256').update(b).digest('hex')===p.sha256;}));console.log(JSON.stringify({reports,sourcePins:Array.from(SOURCE_PINS,([file,p])=>({file,...p})),declared697:budget.SCHEDULED_WORST_CASE,target700:700,model:'every attempted SQL statement; all batch statements charged including refused transaction',realProviderActions:0,productionWrites:0}));console.log(`${ok}/${n} joined whole scheduled accounting checks passed`);if(ok!==n)process.exitCode=1;
})().catch(e=>{console.error('joined native scheduler fixture stopped',e.stack);process.exitCode=1;}).finally(()=>{globalThis.Date=RealDate;globalThis.setTimeout=realSetTimeout;db?.close();});
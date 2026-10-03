// Build .115 (3 Oct 2026; Codex's finding of 13:26 UTC, review115/scheduled-query-budget.md): the scheduled invocation's
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
//   - the schema: warm 0, cold on a current database 126 (129 before the audit rewrite; 124 and 127 until the roster
//     effects' two tables of the third review round), cold with every column reported
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
const root = path.join(__dirname, "..");

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
      first: async () => { COUNT.trips++; COUNT.statements++; const r = exec(sql, params); return r.results[0] ?? null; },
      all: async () => { COUNT.trips++; COUNT.statements++; return { results: exec(sql, params).results }; },
      run: async () => { COUNT.trips++; COUNT.statements++; return exec(sql, params); },
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      COUNT.trips++;
      COUNT.statements += stmts.length; // every statement of the batch, as D1 counts them, whether or not it completes
      dbh.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); dbh.exec("COMMIT"); return out; } catch (e) { dbh.exec("ROLLBACK"); throw e; }
    },
  };
}
let db;
function fresh() {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
}

// ---------- the real modules, each run in a module graph of its own (a fresh isolate: no schema check, no caches) ----------
const transpiled = {};
const transpile = (file) => (transpiled[file] ??= ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
function makeLoader() {
  const cache = {};
  const load = (name) => {
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
    return mod.exports;
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
const GUILD = "236932545793490944", ROLE = "1549581282227265566", STAFF = "1550000000000000010", LOG = "1550000000000000011", OTHER = "1550000000000000012";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [];
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", p = u.pathname;
  FETCHES.push(`${method} ${p}`);
  let m;
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{ id: ROLE }]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/)) && method === "GET") return reply({ roles: HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: "u" } });
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === "PUT") { HAS_ROLE.add(m[1]); ON_PUT?.(m[1]); }
    else HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === "POST") {
    const body = JSON.parse(init.body || "{}");
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
  db.exec("COMMIT");
}

/** One job alone, over a fresh seeded database and a fresh module graph; the statements it sent. */
async function measure(fn, { seed = seedAll, fail = null, over = {} } = {}) {
  fresh(); seed();
  const L = makeLoader();
  resetCount();
  FAIL = fail;
  let value;
  try { value = await quiet(() => fn(L, env(over))); } finally { FAIL = null; }
  return { statements: COUNT.statements, trips: COUNT.trips, value };
}
const line = (job) => budget.SCHEDULED_BUDGET.find((j) => j.job === job)?.worst;
const auditFails = (...actions) => (sql, params) => /^INSERT INTO audit \(ts, actor, action, subject, details\) VALUES/.test(sql) && actions.includes(params[2]);
// every column reported missing: the probes say "no such column", the ALTERs "duplicate column" (swallowed by addColumn)
const everyColumnMissing = Object.assign((sql) => /^SELECT \w+ FROM \w+ LIMIT 0$/.test(sql) || /^ALTER TABLE /.test(sql), { message: (sql) => (/^ALTER/.test(sql) ? "D1_ERROR: duplicate column name" : "D1_ERROR: no such column") });

(async () => {
  console.log("== the table ==");
  const idx = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");
  const body = /async scheduled\([\s\S]*?\n  \},\n/.exec(idx)[0];
  const started = ["ensureSchema", ...[...body.matchAll(/ctx\.waitUntil\((\w+)\(/g)].map((m) => m[1])];
  const jobs = budget.SCHEDULED_BUDGET.map((j) => j.job);
  check(`a line for every job scheduled() starts, in its order (${started.length})`, started.join() === jobs.join(), started, jobs);
  check("  every line a positive whole number with its rule", budget.SCHEDULED_BUDGET.every((j) => Number.isInteger(j.worst) && j.worst > 0 && j.rule.length >= 8));
  const sum = budget.SCHEDULED_BUDGET.reduce((s, j) => s + j.worst, 0);
  console.log(`    the table's worst case: ${sum} statements (target ${budget.SCHEDULED_STATEMENT_TARGET}, Paid limit ${budget.D1_STATEMENTS_PER_INVOCATION})`);
  check("the worst case is the table's sum, at most the target, and the target well below the Paid limit", budget.SCHEDULED_WORST_CASE === sum && sum <= budget.SCHEDULED_STATEMENT_TARGET && budget.SCHEDULED_STATEMENT_TARGET <= 0.7 * budget.D1_STATEMENTS_PER_INVOCATION && budget.D1_STATEMENTS_PER_INVOCATION === 1000, sum);
  const L0 = makeLoader();
  check("the caps the source reads are the table's: BANNED_PER_RUN, the departures' ten intake pages", L0("./restore").BANNED_PER_RUN === CAP.roleSweepBanned && L0("./community-departures").DEPARTURE_LIMITS.intakePages === 10 && /\b1 \+ 10 \+ 1 \+ 1 \+ 1\b/.test(fs.readFileSync(path.join(root, "src", "scheduled-budget.ts"), "utf8")));
  check("  the role sweep, the names refresh, the profile cleanup, the opener and the roster effects read their caps from scheduled-budget.ts", [["restore.ts", "SCHEDULED_CAPS.roleSweepAccounts"], ["names.ts", "SCHEDULED_CAPS.namesPerRun"], ["community-directory.ts", "SCHEDULED_CAPS.profilesPerRun"], ["community-contributions.ts", "SCHEDULED_CAPS.obligationsPerRun"], ["roster.ts", "SCHEDULED_CAPS.rosterEffectsStatements"]].every(([f, s]) => fs.readFileSync(path.join(root, "src", f), "utf8").includes(s)));
  check("  scheduled-budget.ts has no console call and imports nothing", !/console\.|^import /m.test(fs.readFileSync(path.join(root, "src", "scheduled-budget.ts"), "utf8")));

  console.log("\n== each job alone: every capped workload past its cap, every conditional audit due ==");
  const measured = {};
  const exact = async (job, fn, opts) => {
    const r = await measure(fn, opts);
    measured[job] = r.statements;
    check(`${job}: ${r.statements} statements, its line ${line(job)}`, r.statements === line(job), r);
    return r;
  };
  let r = await exact("sweepInviteQueue", (L, e) => L("./ingest").sweepInviteQueue(e));
  check("  it retired the three rows and recorded the notice it could not post", r.value.expired === 3 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'staff_notice.failed'").c === 1);
  r = await measure((L, e) => L("./restore").sweepMemberRoles(e, "cron"));
  measured.sweepMemberRoles = r.statements;
  check(`sweepMemberRoles, every account in the rotation lacking the role: ${r.statements} statements, at most its line ${line("sweepMemberRoles")}`, r.statements <= line("sweepMemberRoles") && r.value && r.value.restored.length > 0 && r.value.revoked.length > 0, r.statements, r.value && { restored: r.value.restored.length, revoked: r.value.revoked.length, checked: r.value.checked, attempts: r.value.attempts });
  // the failure-inclusive path: a reapply hold lands while each PUT is in flight, and the removal's two audits are refused
  r = await measure((L, e) => { ON_PUT = (did) => run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", did, KEY[did], T); return L("./restore").sweepMemberRoles(e, "cron"); }, { fail: auditFails("role.revoked_after_hold", "role.revoke_pending") });
  ON_PUT = null;
  const failedAccounts = one("SELECT COUNT(*) AS c FROM audit WHERE action = 'role.restore_failed'").c;
  check(`  seven statements an account on its failure path (${failedAccounts} accounts): ${r.statements} statements, at most its line`, r.statements <= line("sweepMemberRoles") && failedAccounts >= 5 && r.statements >= 7 * failedAccounts, r.statements, failedAccounts);
  r = await measure((L, e) => { MEMBER_IDS.forEach((d) => HAS_ROLE.add(d)); run("DELETE FROM audit WHERE action = 'roster.member'"); return L("./restore").sweepMemberRoles(e, "cron"); });
  check(`  ROLE_SWEEP_PER_RUN 50 is clamped to roleSweepAccounts (${CAP.roleSweepAccounts} accounts checked)`, r.value && r.value.checked === CAP.roleSweepAccounts, r.value && r.value.checked);

  // Review of 3 Oct 2026: the bound above is loose (83 and 86 against 170), so a change to the shared role writer could make
  // the table underestimate the sweep without failing it. Each per-account cost is measured exactly instead, as the
  // difference between two runs one account apart over a database holding only those accounts.
  console.log("\n== the role sweep's line taken apart: its fixed reads and each per-account cost, exactly ==");
  const holdFor = (did) => run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", did, KEY[did] ?? "k" + did, T);
  const onlyMembers = (k) => () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; db.exec("BEGIN"); seedMembers(k); db.exec("COMMIT"); };
  const onlyHeld = (k) => () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; db.exec("BEGIN"); for (let i = 0; i < k; i++) { const did = id(6000 + i); account(did, { site: false }); HAS_ROLE.add(did); holdFor(did); } db.exec("COMMIT"); };
  const sweep = (L, e) => L("./restore").sweepMemberRoles(e, "cron");
  const failing = { fail: auditFails("role.revoked_after_hold", "role.revoke_pending") }; // the grant's removal and its pending record refused
  const failSweep = (L, e) => { ON_PUT = (did) => holdFor(did); return sweep(L, e); }; // a reapply hold lands while each PUT is in flight
  const ok1 = await measure(sweep, { seed: onlyMembers(1) }), ok2 = await measure(sweep, { seed: onlyMembers(2) });
  const fixedReads = ok1.statements - (ok2.statements - ok1.statements);
  check(`the success path: ${ok2.statements - ok1.statements} statements an account (5: the ban and the hold read before and after the PUT, the restored audit); the fixed reads ${fixedReads}, at most the line's 10`, ok2.statements - ok1.statements === 5 && ok1.value.restored.length === 1 && ok2.value.restored.length === 2 && fixedReads <= 10, ok1.statements, ok2.statements);
  const bad3 = await measure(failSweep, { seed: onlyMembers(3), ...failing });
  const bad4 = await measure(failSweep, { seed: onlyMembers(4), ...failing });
  ON_PUT = null;
  const perFailed = bad4.statements - bad3.statements;
  check(`the failure path: ${perFailed} statements an account (7: four reads, the removal's two refused audits, restore_failed), the fixed reads the same`, perFailed === 7 && bad3.value.failed.length === 3 && bad4.value.failed.length === 4 && bad3.statements - 3 * perFailed === fixedReads, bad3.statements, bad4.statements);
  const held1 = await measure(sweep, { seed: onlyHeld(1), fail: auditFails("role.revoked_reapply") });
  const held2 = await measure(sweep, { seed: onlyHeld(2), fail: auditFails("role.revoked_reapply") });
  const perHeld = held2.statements - held1.statements;
  check(`a held account in the banned reconciliation: ${perHeld} statements (4: the ban and the hold read, the refused removal audit, revoke_pending)`, perHeld === 4 && held1.value.failed.length === 1 && held2.value.failed.length === 2 && held1.statements - perHeld === fixedReads, held1.statements, held2.statements);
  // The longest failure run: more accounts than the cap, every one on the failure path, ROLE_CALL_BUDGET at its most (the
  // writer clamps it to 50 requests, roles.ts callBudget). The call budget stops the run before the account cap, so the
  // line's 7 x 20 is the cap's bound; what the run did is exactly the fixed reads, 7 an account and the budget's audit.
  const longest = await measure(failSweep, { seed: onlyMembers(CAP.roleSweepAccounts + 5), ...failing, over: { ROLE_CALL_BUDGET: "1000" } });
  ON_PUT = null;
  const done = longest.value.failed.length;
  check(`the longest failure run the call budget allows: ${done} accounts, ${longest.statements} statements = fixed ${fixedReads} + 7 x ${done} + the budget's audit, within the line`, longest.value.budgetExhausted === true && done >= 5 && done <= CAP.roleSweepAccounts && longest.statements === fixedReads + 7 * done + 1 && longest.statements <= line("sweepMemberRoles"), longest.statements, done);
  check(`  the line is the measured costs at the caps: 10 fixed + ${perFailed} x ${CAP.roleSweepAccounts} + ${perHeld} x ${CAP.roleSweepBanned} = ${10 + perFailed * CAP.roleSweepAccounts + perHeld * CAP.roleSweepBanned} (its value ${line("sweepMemberRoles")}), the success path cheaper than the failure path`, line("sweepMemberRoles") === 10 + perFailed * CAP.roleSweepAccounts + perHeld * CAP.roleSweepBanned && ok2.statements - ok1.statements <= perFailed && makeLoader()("./roles").callBudget({ ROLE_CALL_BUDGET: "1000" }).limit === 50);
  // .115, third review round (finding A): the cron's slice of the roster's pending member effects. Its line is an admission
  // allowance (each item is admitted at its kind's worst case before it starts), so the measured count is at most the line.
  console.log("\n== the roster's pending member effects: the cron's slice ==");
  const effectsLine = line("continueRosterEffects");
  r = await measure((L, e) => L("./roster").continueRosterEffects(e));
  measured.continueRosterEffects = r.statements;
  const leftAfter = one("SELECT COUNT(*) AS c FROM roster_effects").c;
  check(`continueRosterEffects over a backlog of 60 promotions: ${r.statements} statements, at most its line ${effectsLine}; ${r.value && r.value.applied} applied, the rest still pending`, r.statements <= effectsLine && r.value && r.value.applied >= 2 && r.value.failed === false && leftAfter === 60 - r.value.applied && one("SELECT COUNT(*) AS c FROM characters WHERE name_key LIKE 'eff%' AND status = 'member'").c === r.value.applied, r.statements, r.value, leftAfter);
  check("  in order: the lowest items first, each promoted once (roster.member) and granted through the role writer", one("SELECT MIN(seq) AS s FROM roster_effects").s === r.value.applied && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'roster.member' AND subject LIKE 'Eff%'").c === r.value.applied && EFFECT_IDS.slice(0, r.value.applied).every((d) => HAS_ROLE.has(d)));
  r = await measure((L, e) => { ON_PUT = (did) => holdFor(did); return L("./roster").continueRosterEffects(e); }, failing);
  ON_PUT = null;
  check(`  the failure path (a hold lands during each grant, the removal's two audits refused, every welcome audited for want of a channel): ${r.statements} statements, at most its line`, r.statements <= effectsLine && r.value && r.value.applied >= 2 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'notice.no_channel'").c === r.value.applied, r.statements, r.value);
  r = await measure((L, e) => L("./roster").continueRosterEffects(e), { over: { ROLE_CALL_BUDGET: "4" } });
  check(`  with ROLE_CALL_BUDGET 4 (no grant affordable: each promotion deferred to the role sweep, admitted at the smaller worst case): ${r.statements} statements, at most its line, more items than with grants`, r.statements <= effectsLine && r.value && r.value.applied > 2 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'role.deferred'").c === r.value.applied && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'role.budget_exhausted'").c === 1, r.statements, r.value);

  r = await exact("refreshNames", (L, e) => L("./names").refreshNames(e));
  check("  NAMES_PER_RUN 50 is clamped to namesPerRun", r.value.refreshed === CAP.namesPerRun, r.value);
  r = await exact("autoQueueReserved", (L, e) => L("./site-queue").autoQueueReserved(e));
  check("  four rounds of 250 names moved", r.value && r.value.queued === 1000 && r.value.more === true, r.value);
  await exact("purgeSeenInteractions", (L, e) => L("./index").purgeSeenInteractions(e));
  r = await exact("purgeBattleNetData", (L, e) => L("./bnet-retention").purgeBattleNetData(e));
  check("  it purged the stale tag and audited the counts", r.value.members === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'bnet.retention'").c === 1);
  await exact("sweepRenameHolds", (L, e) => L("./rename-review").sweepRenameHolds(e));
  r = await exact("sweepCommunityProfiles", (L, e) => L("./community-directory").sweepCommunityProfiles(e));
  check(`  ${CAP.profilesPerRun} of the ${3 * CAP.profilesPerRun} expired profiles erased, the rest left for the next runs`, r.value.deleted === CAP.profilesPerRun && one("SELECT COUNT(*) AS c FROM community_profiles").c === 2 * CAP.profilesPerRun, r.value);
  r = await exact("sweepCommunityEvents", (L, e) => L("./community-events").sweepCommunityEvents(e));
  check("  the event went and was audited", r.value === 1);
  r = await exact("sweepCommunityTrials", (L, e) => L("./community-trials").sweepCommunityTrials(e));
  check("  the trial went", r.value.deleted === 1);
  r = await exact("sweepCommunityRestrictions", (L, e) => L("./community-restrictions").sweepCommunityRestrictions(e));
  check("  the period without a case went", r.value.periods === 1);
  r = await exact("departureIntake", (L, e) => L("./community-departures").departureIntake(e));
  check("  ten pages scanned, the one showable departure recorded, the position kept for the next run", r.value === 1 && one("SELECT COUNT(*) AS c FROM community_departure_scan").c === 1, r.value);
  r = await exact("sweepCommunityDepartures", (L, e) => L("./community-departures").sweepCommunityDepartures(e));
  check("  the expired item went", r.value.deleted === 1);
  r = await exact("openWeeklyObligations", (L, e) => L("./community-contributions").openWeeklyObligations(e));
  check(`  ${CAP.obligationsPerRun} of the ${3 * CAP.obligationsPerRun} weeks opened, the policy stored once`, r.value === CAP.obligationsPerRun && one("SELECT COUNT(*) AS c FROM community_contribution_obligations").c === CAP.obligationsPerRun && one("SELECT COUNT(*) AS c FROM community_contribution_policies").c === 1, r.value);
  await exact("sweepCommunityContributions", (L, e) => L("./community-contributions").sweepCommunityContributions(e));
  await exact("sweepCommunityPrivacy", (L, e) => L("./community-privacy-intake").sweepCommunityPrivacy(e));
  r = await measure((L, e) => L("./site-news").newsCron(e));
  check(`newsCron on its usual worst path (the cleanup audited, both windows computed): ${r.statements} statements, its line less the failure read`, r.statements === line("newsCron") - 1 && JSON.parse(one("SELECT value FROM site_settings WHERE key = 'newsFigures'").value).roster.week !== null, r.statements);
  await exact("newsCron", (L, e) => L("./site-news").newsCron(e), { fail: auditFails("site.news_expired") });
  r = await exact("runOfficerDigest", (L, e) => L("./community-digest").runOfficerDigest(e));
  check("  the old post cleaned up (refused, audited), today's posted and audited", r.value === "posted" && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'community.officer_digest_failed'").c === 1 && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'community.officer_digest_posted'").c === 1, r.value);

  console.log("\n== the schema check ==");
  r = await exact("ensureSchema", (L, e) => L("./schema").ensureSchema(e), { fail: everyColumnMissing });
  measured.ensureSchema = r.statements;
  r = await measure(async (L, e) => { await L("./schema").ensureSchema(e); resetCount(); L("./schema").forgetSchemaCheck(); await L("./schema").ensureSchema(e); const cold = COUNT.statements; resetCount(); await L("./schema").ensureSchema(e); return { cold, warm: COUNT.statements }; });
  check(`cold on a current database: ${r.value.cold} statements (126: the roster effects' two tables since the third review round); warm: ${r.value.warm}`, r.value.cold === 126 && r.value.warm === 0, r.value);
  r = await measure((L, e) => L("./schema").ensureSchema(e));
  check(`  cold before the one-time audit rewrite: ${r.statements} statements (129)`, r.statements === 129, r.statements);
  const sumMeasured = Object.values(measured).reduce((s, x) => s + x, 0);
  console.log(`    the jobs measured one by one: ${sumMeasured} statements`);

  console.log("\n== the whole real scheduled(), every community feature on ==");
  const wholeRun = async (mode) => {
    fresh(); seedAll();
    if (mode === "cold") run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('auditTypedNames', '115', ?, NULL)", T);
    const L = makeLoader();
    const index = L("./index");
    if (mode === "warm") await quiet(() => L("./schema").ensureSchema(env()));
    resetCount();
    if (mode === "cold worst") FAIL = everyColumnMissing;
    const pending = [];
    try {
      await quiet(async () => {
        await index.default.scheduled({}, env(), { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); } });
        await Promise.all(pending);
      });
    } finally { FAIL = null; }
    return { statements: COUNT.statements, trips: COUNT.trips, jobs: pending.length };
  };
  const warm = await wholeRun("warm");
  console.log(`    warm schema: ${warm.statements} statements in ${warm.trips} round trips (${warm.jobs} jobs)`);
  check(`warm: ${warm.statements} statements, within the table less the schema line (${sum - line("ensureSchema")}) and the target`, warm.jobs === jobs.length - 1 && warm.statements <= sum - line("ensureSchema") && warm.statements <= budget.SCHEDULED_STATEMENT_TARGET, warm);
  check("  the run did every capped workload's share: 30 weeks opened, 10 profiles erased, 20 names refreshed, 1000 names queued", one("SELECT COUNT(*) AS c FROM community_contribution_obligations").c === CAP.obligationsPerRun && one("SELECT COUNT(*) AS c FROM community_profiles").c === 2 * CAP.profilesPerRun && one("SELECT COUNT(*) AS c FROM members WHERE names_at IS NOT NULL").c === CAP.namesPerRun && one("SELECT COUNT(*) AS c FROM site_reserved WHERE status = 'queued'").c === 1000);
  check("  the roster effects' slice too: some of the 60 pending promotions applied, the rest left for the next runs", one("SELECT COUNT(*) AS c FROM roster_effects").c < 60 && one("SELECT COUNT(*) AS c FROM roster_effects").c > 0);
  check("  and the rest: the digest posted, the figures computed, a role sweep recorded", one("SELECT COUNT(*) AS c FROM audit WHERE action = 'community.officer_digest_posted'").c === 1 && one("SELECT value FROM site_settings WHERE key = 'newsFigures'") && one("SELECT COUNT(*) AS c FROM audit WHERE action = 'role.sweep'").c === 1);
  const cold = await wholeRun("cold");
  console.log(`    cold schema (a fresh isolate on a current database): ${cold.statements} statements in ${cold.trips} round trips`);
  check(`cold: ${cold.statements} statements = warm + 126, within the table and the target`, cold.statements === warm.statements + 126 && cold.statements <= sum && cold.statements <= budget.SCHEDULED_STATEMENT_TARGET, cold, warm);
  const worst = await wholeRun("cold worst");
  console.log(`    cold schema, every column reported missing: ${worst.statements} statements in ${worst.trips} round trips`);
  check(`cold worst: ${worst.statements} statements = warm + the schema line, within the table (${sum}) and the target (${budget.SCHEDULED_STATEMENT_TARGET})`, worst.statements === warm.statements + line("ensureSchema") && worst.statements <= sum && worst.statements <= budget.SCHEDULED_STATEMENT_TARGET, worst, warm);
  check(`  and well below the Paid limit: ${budget.D1_STATEMENTS_PER_INVOCATION - worst.statements} statements to spare`, worst.statements < budget.D1_STATEMENTS_PER_INVOCATION - 300, worst.statements);

  console.log("\n== continuation over successive runs ==");
  fresh(); HAS_ROLE = new Set();
  db.exec("BEGIN");
  const backlog = seedMembers(Math.floor(2.5 * CAP.obligationsPerRun));
  // accounts whose ids the opener cannot use, sorted before every real one: before .115 each would have held a slot
  for (const bad of ["1234", "0000000000000000000a", "00000000000000000000000"]) account(bad, { name: "Bad" + bad.length + (bad.endsWith("a") ? "a" : "b") });
  db.exec("COMMIT");
  const opener = makeLoader()("./community-contributions");
  const made = [];
  const createdIds = [];
  for (let k = 0; k < 4; k++) {
    resetCount();
    made.push(await opener.openWeeklyObligations(env()));
    createdIds.push(db.prepare("SELECT discord_id FROM community_contribution_obligations ORDER BY id").all().map((x) => x.discord_id));
  }
  const full = CAP.obligationsPerRun, rest = backlog.length - 2 * full;
  check(`the opener over four runs: ${made.join(", ")} weeks (cap ${full}), every account once, none for an unusable id`, made.join() === [full, full, rest, 0].join() && one("SELECT COUNT(*) AS c FROM community_contribution_obligations").c === backlog.length && one("SELECT COUNT(*) AS c FROM community_contribution_obligations WHERE length(discord_id) NOT BETWEEN 17 AND 20").c === 0, made);
  check("  in Discord id order: the first run took the lowest ids, each later run the next ones", createdIds[0].join() === backlog.slice(0, full).join() && createdIds[1].slice(full).join() === backlog.slice(full, 2 * full).join() && createdIds[2].slice(2 * full).join() === backlog.slice(2 * full).join());
  check("  the last, empty run: one statement (the scan)", COUNT.statements === 1, COUNT);
  run("DELETE FROM community_contribution_obligations");
  resetCount();
  const big = await opener.openWeeklyObligations(env(), T, 1000);
  check(`  a larger limit cannot raise the cap (${big}); a smaller one lowers it`, big === full && (await opener.openWeeklyObligations(env(), T, 5)) === 5 && (await opener.openWeeklyObligations(env(), T, 0)) === 0 && (await opener.openWeeklyObligations(env(), T, Number.NaN)) === 0);

  fresh();
  db.exec("BEGIN"); seedProfiles(Math.floor(2.5 * CAP.profilesPerRun)); db.exec("COMMIT");
  const order = db.prepare("SELECT discord_id FROM community_profiles ORDER BY departed_at, discord_id").all().map((x) => x.discord_id);
  const dir = makeLoader()("./community-directory");
  const erased = [];
  const left = [];
  for (let k = 0; k < 4; k++) { erased.push((await dir.sweepCommunityProfiles(env())).deleted); left.push(db.prepare("SELECT discord_id FROM community_profiles ORDER BY departed_at, discord_id").all().map((x) => x.discord_id)); }
  const pc = CAP.profilesPerRun, prest = order.length - 2 * pc;
  check(`the profile cleanup over four runs: ${erased.join(", ")} (cap ${pc}), oldest departure first, everything under them gone`, erased.join() === [pc, pc, prest, 0].join() && left[0].join() === order.slice(pc).join() && left[1].join() === order.slice(2 * pc).join() && one("SELECT COUNT(*) AS c FROM community_professions").c === 0 && one("SELECT COUNT(*) AS c FROM community_refs").c === 0, erased);
  check("  the order is the departure, not the id (the seed runs them against each other)", order[0] === id(7000 + order.length - 1) && order.at(-1) === id(7000));
  // Review of 3 Oct 2026: the check above holds without the query's ORDER BY too, because the departure index already
  // returns rows in departed_at order. Profiles that departed in the same second, inserted in DESCENDING Discord id order
  // (so the table's own order runs against the ids), tell the two apart: the cleanup takes the lowest ids first.
  fresh();
  const tied = Array.from({ length: CAP.profilesPerRun + 5 }, (_, i) => id(7100 + i));
  const tiedAt = T - 40 * DAY;
  db.exec("BEGIN");
  for (const did of [...tied].reverse()) {
    run("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?)", did, ref(Number(did.slice(-4))), T - 60 * DAY);
    run("INSERT INTO community_profiles (discord_id, ref, listed, departed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", did, ref(Number(did.slice(-4))), tiedAt, T - 60 * DAY, T - 60 * DAY);
  }
  db.exec("COMMIT");
  const firstTied = await makeLoader()("./community-directory").sweepCommunityProfiles(env());
  const tiedLeft = db.prepare("SELECT discord_id FROM community_profiles ORDER BY discord_id").all().map((x) => x.discord_id);
  check(`  ${tied.length} profiles that departed in the same second: the first run erases the ${CAP.profilesPerRun} lowest Discord ids, not the first rows stored`, firstTied.deleted === CAP.profilesPerRun && tiedLeft.join() === tied.slice(CAP.profilesPerRun).join(), tiedLeft);

  globalThis.Date = RealDate;
  globalThis.setTimeout = realSetTimeout;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

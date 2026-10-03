// Build .115, third review round (3 Oct 2026; Codex's finding A of 16:48 UTC and his child's review115/
// provisional-9fed-backend.md section 2): a roster export's member effects as a durable, resumable worklist
// (src/roster-effects.ts, src/roster.ts), through the REAL src/*.ts (transpiled by TypeScript itself) against the REAL
// schema.sql in SQLite (node:sqlite), with the real index.ts fetch and scheduled(), the real discord.ts, dm.ts and roles.ts;
// only the network is faked, at fetch(). The D1 shim counts EVERY statement attempt the way D1 charges them toward one
// invocation's limit (each statement of a batch, whether or not it completes; a refused statement counts). Covers:
//   - the counterexample: a complete 1,000-member roster whose 1,000 GUID-pinned links had all just verified, changed from
//     the prior full roster by one rank, with ROLE_CALL_BUDGET 4, worked off over successive invocations (exports and cron
//     runs), each invocation's counted statement attempts at most the 700 target (cold schema check included); the first
//     export applies a slice and leaves the rest pending; at the end every link is a member exactly once (one roster.member,
//     one role.deferred, one welcome each), no grant was attempted, and the run records done only then;
//   - a fault mid-slice: before an item's commit (its claim batch refused) the item stays pending and the resume applies it
//     once; after its commit (its roster.member refused) it is never repeated; the export still answers 200;
//   - supersession: a cron slice already running when a newer export is stored applies none of its remaining items, a
//     link absent from the newer roster is never promoted from the older one, the older run is marked superseded and its
//     items dropped; a newer snapshot still being written stops an older run's slice too;
//   - stamp then effects: a refused stamp leaves no run, no item and no change; the run is made in the stamp's own batch
//     and every effect comes after the derivation; a stop between the stamp and the derivation is resumed by a retry after
//     the grace (not inside it), its first absences judged against the snapshot before it, and a newer export after such a
//     stop judges departures against the last derived snapshot (the old code armed nobody there);
//   - small rosters as before: one export applies everything at once, grants and welcomes included, the run done at once;
//   - each kind's worst case in statements, measured as the difference between two runs one item apart on its costliest
//     path (an attempt D1 refuses counts): promote 13 (at most 15), a D: note 15 (at most 17), a deferred promote at most
//     11, a departure exactly 6; a welcome over the notice cap within its share;
//   - /olympus-admin sync: a 1,000-member backlog applied over repeated syncs, each within its allowance, saying how many
//     are not applied yet, nobody twice;
//   - the identity rules admitted too: a realm move of 300 pinned members sights them all in bulk (one statement per 500)
//     within budget, and the releases a sync applies are admitted and finished over repeated syncs.
// Run from the worker folder:  node tests/roster_effects_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite that counts every statement attempt; FAIL refuses one (it still counts) ----------
let COUNT = 0;
let FAIL = null; // (sql, params) => boolean
let AFTER_BATCH = null; // async (sqls, params) => void, after a batch commits
let BEFORE_BATCH = null; // async (sqls, params) => void, before its atomic transaction starts
function d1(dbh) {
  const exec = (sql, params) => {
    if (FAIL && FAIL(sql, params)) throw new Error("D1_ERROR: refused by the suite");
    const st = dbh.prepare(sql);
    if (st.columns().length) return { results: st.all(...params), meta: { changes: /^\s*(SELECT|WITH)\b/i.test(sql) ? 0 : Number(dbh.prepare("SELECT changes() AS n").get().n) } };
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
      first: async () => { COUNT++; return exec(sql, params).results[0] ?? null; },
      all: async () => { COUNT++; return { results: exec(sql, params).results }; },
      run: async () => { COUNT++; return exec(sql, params); },
      _exec: () => exec(sql, params),
      _params: () => params,
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      if (BEFORE_BATCH) await BEFORE_BATCH(stmts.map((s) => s._sql), stmts.map((s) => s._params()));
      COUNT += stmts.length; // every statement of the batch, as D1 counts them, whether or not it completes
      dbh.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); dbh.exec("COMMIT"); } catch (e) { dbh.exec("ROLLBACK"); throw e; }
      if (AFTER_BATCH) await AFTER_BATCH(stmts.map((s) => s._sql), stmts.map((s) => s._params()));
      return out;
    },
  };
}
let db;
function fresh() {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
}

// ---------- the real modules, each invocation in a module graph of its own (a fresh isolate: cold schema, no caches) ----------
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
const L0 = makeLoader();
const budget = L0("./scheduled-budget");
const fx = L0("./roster-effects");
const TARGET = budget.SCHEDULED_STATEMENT_TARGET;

// ---------- the clock ----------
const RealDate = Date;
const H = 3600, DAY = 86400;
let T = 1791001234;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => realSetTimeout(fn, 0, ...a);

// ---------- Discord, faked at fetch() ----------
const GUILD = "236932545793490944", ROLE = "1549581282227265566", OFFICER = "1549581672272625734", NOTICES = "1550000000000000020", OFFICER_USER = "999999999999999999";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [], NOTICE_USERS = [], FAIL_REMOVE = false, FAIL_MEMBER = false, FAIL_NICK = false;
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method || "GET", p = u.pathname;
  FETCHES.push(`${method} ${p}`);
  let m;
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{ id: ROLE }, { id: OFFICER }]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/))) {
    if (method === "GET") return FAIL_MEMBER ? reply({ message: "boom" }, 500) : reply({ roles: HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: "u" } });
    if (method === "PATCH") return FAIL_NICK ? reply({ message: "Missing Permissions", code: 50013 }, 403) : reply({});
  }
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === "PUT") { HAS_ROLE.add(m[1]); ON_PUT?.(m[1]); return new Response(null, { status: 204 }); }
    if (FAIL_REMOVE) return reply({ message: "Missing Permissions", code: 50013 }, 403);
    HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === "POST") {
    const body = JSON.parse(init.body || "{}");
    if (m[1] === NOTICES) NOTICE_USERS.push(...(body.allowed_mentions?.users ?? []));
    return reply({ id: "1550000000000000098" });
  }
  if ((m = p.match(/^\/api\/v10\/users\/(\d+)$/))) return reply({ id: m[1], username: "user", global_name: null });
  return reply({ message: "unexpected in this suite: " + method + " " + p }, 500);
};
const resetDiscord = () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; NOTICE_USERS = []; FAIL_REMOVE = false; FAIL_MEMBER = false; FAIL_NICK = false; };

const TOKEN = "watcher-token-for-tests-only-0123456789";
const env = (over = {}) => ({
  DB: d1(db), DISCORD_BOT_TOKEN: "test-token", GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, ROLE_OFFICER: OFFICER, WATCHER_TOKEN: TOKEN,
  VERIFY_SECRET: "verify-secret-for-tests", COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", PUBLIC_BASE_URL: "https://verify.example",
  CHANNEL_NOTICES: NOTICES, ADMISSION_MODE: "auto", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10",
  ...over,
});

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const quiet = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };

// ---------- the seed ----------
const did = (i) => String(400000000000000000n + BigInt(i));
const nm = (i) => "Mem" + String(i).padStart(4, "0");
const key = (i) => nm(i).toLowerCase();
const guid = (i) => "Player-1-" + String(i).padStart(8, "0");
const filler = (i) => ({ name: "Fil" + String(i).padStart(4, "0"), rank: "Member", rankIndex: 4, guid: "Player-2-" + String(i).padStart(8, "0") });
const fillers = (k) => Array.from({ length: k }, (_, i) => filler(i));
const rosterOf = (from, k, rankIndex = 3) => Array.from({ length: k }, (_, j) => ({ name: nm(from + j), rank: "Member", rankIndex, guid: guid(from + j) }));
function link(i, { status = "verified", pinned = true, role = false } = {}) {
  run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING", did(i));
  run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source, guid, member_since) VALUES (?, ?, ?, ?, ?, ?, 'whisper', ?, ?)", key(i), nm(i), did(i), status, T - DAY, T - DAY, pinned ? guid(i) : null, status === "member" || status === "left_pending" ? T - 10 * DAY : null);
  if (role) HAS_ROLE.add(did(i));
}
function seedSnapshot(list, exportedAt) {
  const sid = Number(run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'seeded', 1, 1, ?)", exportedAt, exportedAt, list.length, exportedAt).lastInsertRowid);
  const ins = db.prepare("INSERT INTO roster_members (snapshot_id, name_key, name, rank, rank_index, guid, public_note) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const m of list) ins.run(sid, m.name.toLowerCase(), m.name, m.rank ?? "Member", m.rankIndex ?? 3, m.guid ?? null, m.note ?? null);
  return sid;
}
/** A derived run of the newest snapshot with `items` ([kind, index]) pending, as an export leaves it when its invocation could not finish. */
function seedRun(items) {
  const snap = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  const runId = Number(run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at, derived_at, items) VALUES (?, ?, 1, ?, ?, ?)", snap, snap, T - 600, T - 600, items.length).lastInsertRowid);
  items.forEach(([kind, i], seq) => run("INSERT INTO roster_effects (run_id, seq, kind, name_key, name, discord_id, guid) VALUES (?, ?, ?, ?, ?, ?, ?)", runId, seq, kind, key(i), nm(i), did(i), kind === "depart" ? null : guid(i)));
  return runId;
}
const latestRun = () => one("SELECT * FROM roster_effect_runs ORDER BY id DESC LIMIT 1");
const statusOf = (i) => one("SELECT status FROM characters WHERE name_key = ?", key(i))?.status;
const auditCount = (action, subject) => (subject === undefined ? one("SELECT COUNT(*) AS c FROM audit WHERE action = ?", action) : one("SELECT COUNT(*) AS c FROM audit WHERE action = ? AND subject = ?", action, subject)).c;
const puts = () => FETCHES.filter((f) => /^PUT \/api\/v10\/guilds\/\d+\/members\/\d+\/roles\//.test(f));

// ---------- invocations ----------
/** One /ingest/roster through the real index.ts fetch, in a fresh isolate (so its schema check is cold), counted whole. */
async function ingestHttp(members, exportedAt, over = {}) {
  const L = makeLoader();
  COUNT = 0;
  const res = await quiet(() => L("./index").default.fetch(new Request("https://verify.example/ingest/roster", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ exportedAt, members }) }), env(over), { waitUntil: () => {} }));
  return { status: res.status, body: await res.json(), statements: COUNT };
}
/** One whole cron tick through the real scheduled(), in a fresh isolate, every job it hands to waitUntil awaited, counted whole. */
async function cronTick(over = {}) {
  const L = makeLoader();
  COUNT = 0;
  const pending = [];
  await quiet(async () => {
    await L("./index").default.scheduled({}, env(over), { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); } });
    await Promise.all(pending);
  });
  return { statements: COUNT, jobs: pending.length };
}
/** The roster module of a fresh isolate, for direct calls. */
const rosterMod = () => makeLoader()("./roster");
let iid = 0;
const syncCommand = () => ({ type: 2, id: "9" + String(++iid).padStart(17, "0"), token: "t", guild_id: GUILD, member: { user: { id: OFFICER_USER, username: "o" }, roles: [OFFICER] }, data: { name: "olympus-admin", options: [{ name: "sync", type: 1, options: [] }] } });
async function syncHttp(over = {}) {
  const L = makeLoader();
  COUNT = 0;
  const res = await quiet(() => L("./interactions").handleInteraction(env(over), syncCommand()));
  return { content: (await res.json()).data.content, statements: COUNT };
}
async function ingestDirect(members, exportedAt, over = {}) {
  COUNT = 0;
  const body = await quiet(() => rosterMod().ingestRoster(env(over), exportedAt, members, "addon"));
  return { body, statements: COUNT };
}

(async () => {
  console.log("== the constants: the cron's line, the allowances, the worst cases ==");
  check(`the cron's line is ${budget.SCHEDULED_CAPS.rosterEffectsStatements} statements and the table's sum stays at or below the target (${budget.SCHEDULED_WORST_CASE} <= ${TARGET})`, budget.SCHEDULED_BUDGET.some((j) => j.job === "continueRosterEffects" && j.worst === budget.SCHEDULED_CAPS.rosterEffectsStatements) && budget.SCHEDULED_WORST_CASE <= TARGET);
  const schemaLine = budget.SCHEDULED_BUDGET.find((j) => j.job === "ensureSchema").worst;
  check(`an export may spend the target less a cold schema check (${budget.ROSTER_INGEST_STATEMENTS} = ${TARGET} - ${schemaLine}); a sync 20 less (${budget.ROSTER_SYNC_STATEMENTS})`, budget.ROSTER_INGEST_STATEMENTS === TARGET - schemaLine && budget.ROSTER_SYNC_STATEMENTS === TARGET - schemaLine - 20);
  check("each kind's worst case covers its deferred case, and a departure is the cheapest", fx.EFFECT_WORST.promote >= fx.EFFECT_DEFERRED_WORST.promote && fx.EFFECT_WORST.note >= fx.EFFECT_DEFERRED_WORST.note && fx.EFFECT_WORST.depart <= Math.min(fx.EFFECT_DEFERRED_WORST.promote, fx.EFFECT_DEFERRED_WORST.note));
  check("the derivation of a 1,000-member roster with 1,000 links is a handful of statements, never one per member", fx.derivationWorst(1000, 1000) <= 20 && fx.sightingsWorst(1000) === 2);

  // ================= the counterexample: 1,000 links that all just verified, ROLE_CALL_BUDGET 4 =================
  console.log("\n== a full roster of 1,000 links that all just verified, ROLE_CALL_BUDGET 4, over successive invocations ==");
  const N = 1000;
  const lean = { ROLE_CALL_BUDGET: "4" };
  fresh(); resetDiscord();
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) link(i);
  seedSnapshot(rosterOf(0, N), T - 2 * H);
  db.exec("COMMIT");
  const changed = rosterOf(0, N).map((m, j) => (j === 0 ? { ...m, rankIndex: 2 } : m)); // one harmless rank change
  let exportedAt = T - 60;
  const log = [];
  let r = await ingestHttp(changed, exportedAt, lean);
  log.push({ kind: "export", statements: r.statements, applied: r.body.effects?.applied ?? null });
  const first = r.body.effects;
  check(`the changed export: 200, a new snapshot, ${first && first.items} items derived, ${first && first.applied} applied in its own invocation and the rest left pending (${r.statements} statement attempts, schema check included)`, r.status === 200 && r.body.unchanged === false && first && first.derived === true && first.items === N && first.applied > 0 && first.applied < N && first.pending === true && r.statements <= TARGET, r.body.effects, r.statements);
  check("  the snapshot is complete, its run derived and not done; the old code would have needed about 4,000 attempts here", latestRun().derived_at !== null && latestRun().done_at === null && one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete === 1 && one("SELECT COUNT(*) AS c FROM roster_effects").c === N - first.applied);
  let doneBefore = [];
  for (let k = 0; k < 120 && latestRun().done_at === null; k++) {
    T += 60;
    doneBefore.push(latestRun().done_at);
    if (k % 2 === 0) {
      exportedAt += 60;
      r = await ingestHttp(changed, exportedAt, lean); // the addon exports the same roster again
      log.push({ kind: "export", statements: r.statements, applied: r.body.effects?.applied ?? null, status: r.status });
    } else {
      const before = one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c;
      const c = await cronTick(lean);
      log.push({ kind: "cron", statements: c.statements, applied: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c - before });
    }
  }
  const worstExport = Math.max(...log.filter((x) => x.kind === "export").map((x) => x.statements));
  const worstCron = Math.max(...log.filter((x) => x.kind === "cron").map((x) => x.statements));
  console.log(`    ${log.length} invocations (${log.filter((x) => x.kind === "export").length} exports, ${log.filter((x) => x.kind === "cron").length} cron runs); the costliest export ${worstExport}, the costliest cron run ${worstCron} statement attempts`);
  check(`every invocation within the ${TARGET} target, its cold schema check included (exports at most ${worstExport}, cron runs at most ${worstCron})`, log.every((x) => x.statements <= TARGET && (x.status === undefined || x.status === 200)), log.filter((x) => x.statements > TARGET));
  check("  every export applied a share and every cron run some too (none starved)", log.filter((x) => x.kind === "export").every((x) => x.applied > 0) && log.filter((x) => x.kind === "cron").slice(0, -1).every((x) => x.applied > 0), log.map((x) => x.applied).join(","));
  check(`the backlog is done: all ${N} links are members, the run done, no item left`, one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && latestRun().done_at !== null && one("SELECT COUNT(*) AS c FROM roster_effects").c === 0);
  check("  and done only at the end: done_at stayed empty until the last invocation", doneBefore.every((d) => d === null));
  const memberAudits = all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject");
  check(`  each link promoted exactly once: ${memberAudits.length} roster.member subjects, none twice`, memberAudits.length === N && memberAudits.every((x) => x.c === 1));
  check(`  each grant deferred to the role sweep through the role writer (${auditCount("role.deferred")} role.deferred), no role PUT attempted with 4 requests a run`, auditCount("role.deferred") === N && puts().length === 0);
  const welcomed = [...NOTICE_USERS, ...all("SELECT subject FROM audit WHERE action = 'notice.suppressed'").map((x) => x.subject)];
  check(`  each welcome said once (posted or, over the cap, audited as suppressed): ${welcomed.length} for ${new Set(welcomed).size} accounts`, welcomed.length === N && new Set(welcomed).size === N);

  // The former admission counted spent SQL only. Buffered notices still owed one audit each here, so 81 admitted
  // promotions produced 605 statements against the roster allowance of 536 (before any cold schema cost).
  console.log("\n== notice debt across long slices: 1,000 deferred grants, failed nicknames, no notice channel ==");
  fresh(); resetDiscord(); FAIL_NICK = true;
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) link(i);
  seedSnapshot(rosterOf(0, N), T - 2 * H);
  db.exec("COMMIT");
  const debtEnv = { ...lean, SET_NICKNAME: "true", CHANNEL_NOTICES: "" };
  const debtAt = T - 60;
  const debtInvocations = [];
  let debt = await ingestDirect(changed, debtAt, debtEnv);
  debtInvocations.push({ kind: "export", statements: debt.statements });
  const debtRun = latestRun().id;
  check("the first long slice includes its finally flush within the roster allowance and leaves durable work", debt.body.effects.applied > 0 && debt.body.effects.pending && debt.statements <= budget.ROSTER_INGEST_STATEMENTS, debt.statements, debt.body.effects);
  for (let k = 0; k < 100 && latestRun().done_at === null; k++) {
    T += 60;
    if (k % 2 === 0) {
      debt = await ingestDirect(changed, debtAt, debtEnv); // retained packet: the same timestamp and same durable run
      debtInvocations.push({ kind: "export", statements: debt.statements });
    } else {
      const c = await cronTick(debtEnv);
      debtInvocations.push({ kind: "cron", statements: c.statements });
    }
  }
  check("all long slices reserve accumulated notices: exports within their own allowance, whole cold cron within 700", debtInvocations.every((x) => x.statements <= (x.kind === "export" ? budget.ROSTER_INGEST_STATEMENTS : TARGET)), debtInvocations);
  check("the original run finishes via repeated packet retries and cron; 1,000 promotions and notice audits occur once", latestRun().id === debtRun && latestRun().done_at !== null && auditCount("roster.member") === N && auditCount("notice.no_channel") === N && auditCount("nick.failed") === N && puts().length === 0 && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'notice.no_channel' GROUP BY subject").every((x) => x.c === 1), latestRun());
  FAIL_NICK = false;

  // ================= a fault mid-slice, then the resume =================
  console.log("\n== a fault mid-slice: before an item's commit it stays pending, after it the item is never repeated ==");
  fresh(); resetDiscord();
  const F = 40;
  db.exec("BEGIN"); for (let i = 0; i < F; i++) link(i); db.exec("COMMIT");
  const fAt = T - 600;
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(10); // item 10's claim batch refused
  r = await ingestHttp(rosterOf(0, F), fAt);
  FAIL = null;
  check(`the export still answers 200; its slice stopped at item 10 (${r.body.effects && r.body.effects.applied} applied, failed reported)`, r.status === 200 && r.body.effects.applied === 10 && r.body.effects.failed === true && r.body.effects.pending === true && auditCount("roster.effects_failed") === 1, r.body.effects);
  check("  item 10's whole batch rolled back: still verified, still pending, no roster.member", statusOf(10) === "verified" && one("SELECT done_at FROM roster_effects WHERE name_key = ?", key(10))?.done_at === null && auditCount("roster.member", nm(10)) === 0 && statusOf(9) === "member");
  FAIL = (sql, p) => /^INSERT INTO audit/.test(sql) && p[2] === "roster.member" && p[3] === nm(20); // item 20's roster.member refused, after its commit
  T += 60;
  r = await ingestHttp(rosterOf(0, F), fAt); // the watcher sends the same export again: the skip path resumes
  FAIL = null;
  check(`the same export sent again: "older", and it resumed the slice: items 10 to 19 applied, the slice stopped after item 20's commit (${r.body.effects && r.body.effects.applied} applied)`, r.status === 200 && r.body.skipped === true && r.body.effects.applied === 10 && r.body.effects.failed === true && statusOf(10) === "member" && statusOf(20) === "member" && statusOf(21) === "verified", r.body);
  check("  item 20 is done (its claim committed with its change), so nothing will repeat it; its roster.member is the loss, not a double", one("SELECT COUNT(*) AS c FROM roster_effects WHERE name_key = ?", key(20)).c === 0 && auditCount("roster.member", nm(20)) === 0);
  T += 60;
  r = await ingestHttp(rosterOf(0, F), T - 30); // a later identical export
  check("the next export finishes the rest; the run is done", r.status === 200 && r.body.effects.pending === false && latestRun().done_at !== null && one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === F, r.body.effects);
  const perName = all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject");
  check("  no double effect: one roster.member for every link but item 20 (none), at most one role PUT and one welcome each", perName.length === F - 1 && perName.every((x) => x.c === 1) && !perName.some((x) => x.subject === nm(20)) && new Set(puts()).size === puts().length && new Set(NOTICE_USERS).size === NOTICE_USERS.length, perName.length, puts().length);

  // ================= supersession =================
  console.log("\n== a newer export supersedes an older run: nothing of the older one is applied after it ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 30; i++) link(i); db.exec("COMMIT");
  const base = fillers(200);
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(10);
  r = await ingestHttp([...base, ...rosterOf(0, 30)], T - 900);
  FAIL = null;
  const oldRun = latestRun().id;
  check("(set-up) an export whose slice stopped at item 10: 20 links still pending", r.body.effects.applied === 10 && one("SELECT COUNT(*) AS c FROM roster_effects WHERE run_id = ?", oldRun).c === 20, r.body.effects);
  // a cron slice is running when the newer export arrives: right after its first claim commits, the newer export is stored
  const newer = [...base, ...rosterOf(0, 15)]; // Mem0015..Mem0029 are no longer on the roster
  let nested = null;
  AFTER_BATCH = async (sqls) => {
    if (nested || !sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q))) return;
    nested = "running";
    const save = COUNT;
    nested = await rosterMod().ingestRoster(env(), T - 300, newer, "addon");
    COUNT = save;
  };
  T += 60;
  const cronSlice = await quiet(() => rosterMod().continueRosterEffects(env()));
  AFTER_BATCH = null;
  check(`the running cron slice applied its first item (Mem0010) and refused the next claim after the newer export was stored`, cronSlice && cronSlice.applied === 1 && cronSlice.refused === true && statusOf(10) === "member", cronSlice);
  check("  links no longer on the newer roster were never promoted from the older run", [15, 16, 20, 29].every((i) => statusOf(i) === "verified" && auditCount("roster.member", nm(i)) === 0));
  check("  the newer export's own run promoted the rest still due (Mem0011..Mem0014), each once", [11, 12, 13, 14].every((i) => statusOf(i) === "member" && auditCount("roster.member", nm(i)) === 1) && auditCount("roster.member", nm(10)) === 1 && nested && nested.effects && nested.effects.applied === 4, nested && nested.effects);
  check("  the older run is marked superseded and its items are gone", one("SELECT superseded_at FROM roster_effect_runs WHERE id = ?", oldRun).superseded_at !== null && one("SELECT COUNT(*) AS c FROM roster_effects WHERE run_id = ?", oldRun).c === 0 && latestRun().id > oldRun);

  console.log("\n== a newer snapshot still being written stops an older run's slice ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 30; i++) link(i); db.exec("COMMIT");
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(5);
  await ingestHttp([...base, ...rosterOf(0, 30)], T - 900);
  FAIL = null;
  let probe = null;
  AFTER_BATCH = async (sqls) => {
    if (probe || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    const save = COUNT;
    probe = await quiet(() => rosterMod().continueRosterEffects(env()));
    COUNT = save;
  };
  T += 60;
  await quiet(() => rosterMod().ingestRoster(env(), T - 300, [...base, ...rosterOf(0, 30), ...fillers(260).slice(200)], "addon"));
  AFTER_BATCH = null;
  check("between the newer snapshot's member batches the cron finds nothing to apply (the older run's snapshot is not the newest)", probe && probe.run === null && probe.applied === 0, probe);
  check("  once the newer export is stored, its run applies what is due, each once", one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === 30 && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject").every((x) => x.c === 1));

  console.log("\n== an identical-fingerprint retry cannot derive from a partial snapshot ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 120; i++) link(i); db.exec("COMMIT");
  const partialList = rosterOf(0, 120);
  const partialAt = T - 120;
  let partialRetry = null, partialState = null;
  AFTER_BATCH = async (sqls) => {
    if (partialRetry || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)) || sqls.some((q) => /SET complete = 1/.test(q))) return;
    partialRetry = "running";
    const save = COUNT;
    partialRetry = await ingestHttp(partialList, partialAt + 1, lean);
    partialState = { stored: one("SELECT COUNT(*) AS c FROM roster_members").c, runs: one("SELECT COUNT(*) AS c FROM roster_effect_runs").c, members: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c, exportedAt: one("SELECT exported_at FROM roster_snapshots ORDER BY id DESC LIMIT 1").exported_at };
    COUNT = save;
  };
  r = await ingestHttp(partialList, partialAt, lean);
  AFTER_BATCH = null;
  check("the concurrent identical export receives a retryable 500 before snapshot refresh or effects", partialRetry && partialRetry.status === 500 && partialState.stored < 120 && partialState.runs === 0 && partialState.members === 0 && partialState.exportedAt === partialAt, partialRetry, partialState);
  check("the original write can finish normally after that retry is refused", r.status === 200 && one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete === 1 && latestRun().derived_at !== null, r.body);

  console.log("\n== a legacy identical refresh proves its row count before it can create a run ==");
  fresh(); resetDiscord();
  const legacyList = rosterOf(0, 120), legacyAt = T - 120;
  await ingestHttp(legacyList, legacyAt, lean);
  const legacySid = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  run("DELETE FROM roster_effect_runs");
  run("UPDATE roster_snapshots SET complete = NULL, trusted = NULL, first_received_at = ? WHERE id = ?", T - 300, legacySid);
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = ?", legacySid, key(119));
  link(0); link(119, { status: "member", role: true });
  resetDiscord(); HAS_ROLE.add(did(119));
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  check("119 stored rows of the legacy export's 120: refresh marks incomplete and returns retryable 500, without a run or any member effect", r.status === 500 && one("SELECT complete FROM roster_snapshots WHERE id = ?", legacySid).complete === 0 && !latestRun() && statusOf(0) === "verified" && statusOf(119) === "member" && HAS_ROLE.has(did(119)) && FETCHES.length === 0 && auditCount("roster.member") === 0 && NOTICE_USERS.length === 0, r);
  T += 100;
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  check("the retained identical packet stays retryable inside the original write grace; no run, timestamp refresh or effect", r.status === 500 && !latestRun() && one("SELECT exported_at FROM roster_snapshots WHERE id = ?", legacySid).exported_at === legacyAt + 1 && statusOf(0) === "verified" && FETCHES.length === 0, r);
  T += 201;
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  const repairedLegacy = one("SELECT * FROM roster_snapshots ORDER BY id DESC LIMIT 1");
  check("after the grace, that exact retained packet rebuilds a complete 120-row snapshot and applies the previously held promotion once", r.status === 200 && repairedLegacy.id > legacySid && repairedLegacy.complete === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", repairedLegacy.id).c === 120 && statusOf(0) === "member" && statusOf(119) === "member" && auditCount("roster.member", nm(0)) === 1 && auditCount("roster.member", nm(119)) === 0 && auditCount("role.deferred", nm(0)) === 1 && puts().length === 0, r);

  fresh(); resetDiscord();
  await ingestHttp(legacyList, T - 120, lean);
  const fullLegacySid = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  run("DELETE FROM roster_effect_runs");
  run("UPDATE roster_snapshots SET complete = NULL, trusted = NULL, first_received_at = NULL WHERE id = ?", fullLegacySid);
  link(0); resetDiscord();
  r = await ingestHttp(legacyList, T - 120, lean);
  check("a valid legacy snapshot, including an exact timestamp retry, is stamped complete and creates its own derived run without rewriting member rows", r.status === 200 && r.body.unchanged === true && one("SELECT MAX(id) AS id FROM roster_snapshots").id === fullLegacySid && one("SELECT complete FROM roster_snapshots WHERE id = ?", fullLegacySid).complete === 1 && latestRun().snapshot_id === fullLegacySid && latestRun().derived_at !== null && statusOf(0) === "member" && auditCount("roster.member", nm(0)) === 1 && auditCount("role.deferred", nm(0)) === 1 && puts().length === 0, r);

  console.log("\n== invalid snapshots cannot supply an already-derived slice or an older-packet derivation ==");
  for (const invalid of ["unstamped", "unfinished", "missing row"]) {
    fresh(); resetDiscord(); link(0);
    const sid = seedSnapshot(rosterOf(0, 1), T - H);
    const rid = seedRun([["promote", 0]]);
    if (invalid === "missing row") run("DELETE FROM roster_members WHERE snapshot_id = ?", sid);
    else run("UPDATE roster_snapshots SET complete = ? WHERE id = ?", invalid === "unstamped" ? null : 0, sid);
    const slice = await quiet(() => rosterMod().continueRosterEffects(env(lean)));
    check(`${invalid}: the cron finds no consumable run and leaves its pending claim, link and Discord untouched`, slice && slice.run === null && slice.applied === 0 && statusOf(0) === "verified" && one("SELECT done_at FROM roster_effects WHERE run_id = ?", rid).done_at === null && FETCHES.length === 0 && auditCount("roster.member") === 0, slice);
    run("UPDATE roster_effect_runs SET derived_at = NULL, created_at = ? WHERE id = ?", T - H, rid);
    r = await ingestHttp(rosterOf(0, 1), T - H - 1, lean);
    check(`${invalid}: an older packet cannot derive from that stored snapshot and remains retryable`, r.status === 500 && latestRun().derived_at === null && statusOf(0) === "verified" && FETCHES.length === 0 && auditCount("roster.member") === 0, r);
  }

  console.log("\n== a snapshot losing its proof between selection and claim refuses the transaction ==");
  for (const invalid of ["unfinished", "missing row"]) {
    fresh(); resetDiscord(); link(0);
    const sid = seedSnapshot(rosterOf(0, 1), T - H);
    const rid = seedRun([["promote", 0]]);
    let revoked = false;
    BEFORE_BATCH = async (sqls) => {
      if (revoked || !sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q))) return;
      revoked = true;
      if (invalid === "unfinished") run("UPDATE roster_snapshots SET complete = 0 WHERE id = ?", sid);
      else run("DELETE FROM roster_members WHERE snapshot_id = ?", sid);
    };
    const slice = await quiet(() => rosterMod().continueRosterEffects(env(lean)));
    BEFORE_BATCH = null;
    check(`${invalid} after selection: the current-run predicate refuses the claim and every promotion effect`, revoked && slice && slice.refused === true && slice.applied === 0 && statusOf(0) === "verified" && one("SELECT done_at FROM roster_effects WHERE run_id = ?", rid).done_at === null && FETCHES.length === 0 && auditCount("roster.member") === 0, slice);
  }

  // ================= stamp, then effects =================
  console.log("\n== stamp, then effects ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 5; i++) link(i); db.exec("COMMIT");
  FAIL = (sql) => /^UPDATE roster_snapshots SET complete = 1, trusted = \?2/.test(sql);
  let threw = false;
  try { await quiet(() => rosterMod().ingestRoster(env(), T - 600, rosterOf(0, 5), "addon")); } catch { threw = true; }
  FAIL = null;
  check("a refused stamp: the ingest throws for a retry, no snapshot, no run, no item, no link changed", threw && !one("SELECT 1 FROM roster_snapshots") && !one("SELECT 1 FROM roster_effect_runs") && !one("SELECT 1 FROM roster_effects") && [0, 1, 2, 3, 4].every((i) => statusOf(i) === "verified"));
  const order = [];
  let atStamp = null;
  AFTER_BATCH = async (sqls) => {
    const tag = sqls.some((q) => /SET complete = 1, trusted = \?2/.test(q)) ? "stamp" : sqls.some((q) => /SET derived_at = \?2/.test(q)) ? "derive" : sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q)) ? "claim" : sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)) ? "rows" : "other";
    order.push(tag);
    if (tag === "stamp" && !atStamp) atStamp = { run: latestRun(), members: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c, items: one("SELECT COUNT(*) AS c FROM roster_effects").c, complete: one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete };
  };
  r = await quiet(() => rosterMod().ingestRoster(env(), T - 500, rosterOf(0, 5), "addon"));
  AFTER_BATCH = null;
  check("the run is made in the stamp's own batch: at that commit the snapshot is complete, the run exists underived, nothing is applied yet", atStamp && atStamp.complete === 1 && atStamp.run && atStamp.run.derived_at === null && atStamp.members === 0 && atStamp.items === 0, atStamp);
  check(`  then the derivation, then the claims: ${order.join(" > ")}`, order.indexOf("stamp") >= 0 && order.indexOf("stamp") < order.indexOf("derive") && order.indexOf("derive") < order.indexOf("claim") && order.lastIndexOf("rows") < order.indexOf("stamp"), order);
  check("  and a small roster is applied whole by its own export, as before: promoted, granted, welcomed, the run done", r.promoted.length === 5 && puts().length === 5 && new Set(NOTICE_USERS).size === 5 && r.effects.pending === false && latestRun().done_at !== null && one("SELECT COUNT(*) AS c FROM roster_effects").c === 0, r.effects);

  console.log("\n== a stop between the stamp and the derivation loses nothing ==");
  const stopScenario = () => {
    fresh(); resetDiscord();
    db.exec("BEGIN");
    link(0, { status: "member", role: true }); // A, a member
    link(1); // B, just verified
    link(2, { status: "member", role: true }); // X, a member who leaves
    seedSnapshot([...fillers(100), ...rosterOf(0, 3)], T - 2 * H); // S0: A, B, X (its diff applied long ago)
    db.exec("COMMIT");
  };
  stopScenario();
  const s1 = [...fillers(100), ...rosterOf(0, 2)]; // S1: X is absent for the first time
  const s1At = T - 600;
  FAIL = (sql) => /SET derived_at = \?2/.test(sql);
  r = await ingestHttp(s1, s1At);
  FAIL = null;
  check("the derivation is refused after the stamp: a 500 the watcher retries; the run is stored underived, nothing applied", r.status === 500 && latestRun().derived_at === null && statusOf(2) === "member" && statusOf(1) === "verified");
  let retainedPacket = { members: s1, exportedAt: s1At };
  r = await ingestHttp(retainedPacket.members, retainedPacket.exportedAt);
  if (r.status >= 200 && r.status < 300) retainedPacket = null; // the watcher's acknowledgement rule
  check("  the retry at once receives 500, so the watcher retains its packet while the run is underived", r.status === 500 && retainedPacket !== null && latestRun().derived_at === null, r.body);
  const underivedId = latestRun().id;
  await cronTick();
  check("  cron leaves the underived run untouched; the retained packet is its guaranteed continuation", retainedPacket !== null && latestRun().id === underivedId && latestRun().derived_at === null && statusOf(1) === "verified");
  const identicalEarly = await ingestHttp(s1, s1At + 1);
  check("  a newer identical export also remains retryable inside the derivation grace", identicalEarly.status === 500 && latestRun().id === underivedId && latestRun().derived_at === null, identicalEarly.body);
  T += 601; // past SNAPSHOT_WRITE_GRACE_S since the run was made
  r = await ingestHttp(retainedPacket.members, retainedPacket.exportedAt);
  if (r.status >= 200 && r.status < 300) retainedPacket = null;
  check("  the retry after the grace derives it: X's first absence is armed against S0, B promoted", r.status === 200 && r.body.skipped === true && r.body.effects.derived === true && statusOf(2) === "left_pending" && auditCount("roster.left_pending", nm(2)) === 1 && statusOf(1) === "member", r.body.effects);
  check("  only successful derivation acknowledgement clears the retained packet", retainedPacket === null);
  T += 60;
  r = await ingestHttp([...fillers(100), ...rosterOf(0, 2), { name: "Newcomer", rank: "Member", rankIndex: 4, guid: "Player-3-1" }], T - 60);
  check("  and the next export confirms the departure: X loses the character and the role", statusOf(2) === "left" && !HAS_ROLE.has(did(2)) && r.body.stripped.includes(nm(2)), r.body);

  stopScenario();
  FAIL = (sql) => /SET derived_at = \?2/.test(sql);
  await ingestHttp(s1, T - 600);
  FAIL = null;
  const stalled = latestRun().id;
  r = await ingestHttp([...s1, { name: "Newcomer", rank: "Member", rankIndex: 4, guid: "Player-3-1" }], T - 300); // a newer export, inside the grace
  check("a newer export after such a stop judges departures against the last derived snapshot (S0), so X is armed (the old code compared it with S1 and armed nobody)", r.status === 200 && statusOf(2) === "left_pending" && statusOf(1) === "member" && one("SELECT prev_snapshot_id FROM roster_effect_runs ORDER BY id DESC LIMIT 1").prev_snapshot_id === 1 && one("SELECT superseded_at FROM roster_effect_runs WHERE id = ?", stalled).superseded_at !== null, r.body);

  // ================= each kind's worst case, one item apart =================
  console.log("\n== each kind's worst case in statements, measured one item apart on its costliest path ==");
  const holdFor = (d) => run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", d, one("SELECT name_key FROM characters WHERE discord_id = ?", d).name_key, T);
  /** The skip path's slice over `k` seeded items of one kind; the statements of that invocation (the ingest's own share). */
  async function sliceCost(kind, k, { over = {}, prepare = () => {}, fail = null } = {}) {
    fresh(); resetDiscord();
    db.exec("BEGIN");
    for (let i = 0; i < k; i++) {
      if (kind === "depart") link(i, { status: "left_pending", role: true });
      else if (kind === "note") run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT DO NOTHING", did(i));
      else link(i);
    }
    seedSnapshot(rosterOf(0, kind === "depart" ? 0 : k), T - H);
    seedRun(Array.from({ length: k }, (_, i) => [kind, i]));
    db.exec("COMMIT");
    prepare();
    FAIL = fail;
    COUNT = 0;
    let out;
    try { out = await quiet(() => rosterMod().ingestRoster(env(over), T - 2 * H, [], "addon")); } finally { FAIL = null; ON_PUT = null; }
    return { statements: COUNT, out };
  }
  const costly = { over: { SET_NICKNAME: "true", CHANNEL_NOTICES: "" }, prepare: () => { FAIL_NICK = true; ON_PUT = (d) => holdFor(d); }, fail: (sql, p) => /^INSERT INTO audit/.test(sql) && ["role.revoked_after_hold", "role.revoke_pending"].includes(p[2]) };
  let a = await sliceCost("promote", 2, costly), b = await sliceCost("promote", 3, costly);
  const perPromote = b.statements - a.statements;
  check(`a promotion on its costliest path (a hold lands during the grant, the removal's audit and its pending record refused, role.add_failed, the nickname refused, the welcome audited for want of a channel): ${perPromote} statements (claim 3 + grant 7 + nickname 1 + roster.member 1 + notice 1), at most ${fx.EFFECT_WORST.promote}`, perPromote === 13 && perPromote <= fx.EFFECT_WORST.promote && b.out.effects.applied === 3 && auditCount("role.add_failed") === 3, a.statements, b.statements, b.out.effects);
  a = await sliceCost("note", 2, costly); b = await sliceCost("note", 3, costly);
  const perNote = b.statements - a.statements;
  check(`an officer's D: note on the same path: ${perNote} statements (the claim batch 5), at most ${fx.EFFECT_WORST.note}`, perNote === 15 && perNote <= fx.EFFECT_WORST.note && b.out.effects.applied === 3 && one("SELECT COUNT(*) AS c FROM characters WHERE source = 'note' AND status = 'member'").c === 3, a.statements, b.statements);
  const deferredCase = { over: { ROLE_CALL_BUDGET: "4", SET_NICKNAME: "true", CHANNEL_NOTICES: "" }, prepare: () => { FAIL_NICK = true; } };
  a = await sliceCost("promote", 2, deferredCase); b = await sliceCost("promote", 3, deferredCase);
  const perDeferred = b.statements - a.statements;
  check(`a promotion whose grant the call budget defers: ${perDeferred} statements, at most ${fx.EFFECT_DEFERRED_WORST.promote} (the once-a-run budget audit included there)`, perDeferred <= fx.EFFECT_DEFERRED_WORST.promote - 1 && b.out.effects.applied === 3 && auditCount("role.deferred") === 3 && auditCount("role.budget_exhausted") === 1, a.statements, b.statements);
  const departCase = { prepare: () => { FAIL_REMOVE = true; FAIL_MEMBER = true; } };
  a = await sliceCost("depart", 2, departCase); b = await sliceCost("depart", 3, departCase);
  const perDepart = b.statements - a.statements;
  check(`a departure on its costliest path (the removal and the member read refused): exactly ${perDepart} = ${fx.EFFECT_WORST.depart} statements (claim 2, the count, two failure audits, roster.left)`, perDepart === fx.EFFECT_WORST.depart && b.out.effects.applied === 3 && [0, 1, 2].every((i) => statusOf(i) === "left"), a.statements, b.statements);
  const capped = { prepare: () => { run("INSERT INTO audit (ts, actor, action, details) VALUES (?, 'system', 'notice.posted', '{}')", T); }, over: { NOTICE_RATE_CAP: "1" } };
  a = await sliceCost("promote", 20, capped); b = await sliceCost("promote", 21, capped);
  check(`a welcome over the notice cap costs its own audit and its post's share (the 21st opens a second post): ${b.statements - a.statements} statements, at most ${fx.EFFECT_WORST.promote}`, b.statements - a.statements <= fx.EFFECT_WORST.promote && auditCount("notice.suppressed") === 21 && auditCount("notice.capped") === 1, a.statements, b.statements);

  // ================= /olympus-admin sync =================
  console.log("\n== /olympus-admin sync: a 1,000-member backlog over repeated syncs, each within its allowance ==");
  fresh(); resetDiscord();
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) link(i);
  seedSnapshot(rosterOf(0, N), T - H);
  db.exec("COMMIT");
  const syncs = [];
  for (let k = 0; k < 60; k++) {
    T += 60;
    const s = await syncHttp(lean);
    syncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  const deferredLines = syncs.filter((s) => /Not applied yet \(\d+\)/.test(s.content)).length;
  console.log(`    ${syncs.length} syncs; the costliest ${Math.max(...syncs.map((s) => s.statements))} statement attempts (allowance ${budget.ROSTER_SYNC_STATEMENTS} + the vouch and its audit)`);
  check(`the first sync says how many are not applied yet, and every sync stays within its allowance`, /Not applied yet \(\d+\)/.test(syncs[0].content) && syncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2), syncs[0].content.slice(0, 300), syncs.map((s) => s.statements));
  check(`  repeated syncs finish: all ${N} members, each promoted once, the last sync with nothing left (${deferredLines} syncs said "not applied yet")`, one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject").every((x) => x.c === 1) && auditCount("roster.member") === N && !/Not applied yet/.test(syncs.at(-1).content) && JSON.parse(one("SELECT details FROM audit WHERE action = 'admin.sync' ORDER BY id LIMIT 1").details).deferred > 0, syncs.at(-1).content.slice(0, 200));

  console.log("\n== manual sync reserves its long buffered notice debt too ==");
  fresh(); resetDiscord(); FAIL_NICK = true;
  db.exec("BEGIN"); for (let i = 0; i < N; i++) link(i); seedSnapshot(rosterOf(0, N), T - H); db.exec("COMMIT");
  const debtSyncs = [];
  for (let k = 0; k < 60; k++) {
    T += 60;
    const s = await syncHttp(debtEnv);
    debtSyncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  check("every manual sync, including its notice audits, stays within its allowance plus the vouch and audit", debtSyncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2), debtSyncs.map((s) => s.statements));
  check("repeated manual syncs finish without duplicated welcomes or promotions", one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && auditCount("roster.member") === N && auditCount("notice.no_channel") === N && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'notice.no_channel' GROUP BY subject").every((x) => x.c === 1));
  FAIL_NICK = false;

  // ================= the identity rules admitted =================
  console.log("\n== the identity rules: a realm move of 300 pinned members, sighted in bulk and released over repeated syncs ==");
  fresh(); resetDiscord();
  const M = 300;
  db.exec("BEGIN");
  for (let i = 0; i < M; i++) link(i, { status: "member", role: true });
  seedSnapshot(rosterOf(0, M), T - H);
  db.exec("COMMIT");
  const moved = rosterOf(0, M).map((m, i) => ({ ...m, guid: "Player-9-" + String(i).padStart(8, "0") })); // every character gets a new ID
  r = await ingestHttp(moved, T - 600);
  const sightRows = all("SELECT subject, details FROM audit WHERE action = 'roster.namesake_seen'");
  check(`the first export with new IDs: all ${M} held, ${sightRows.length} namesake sightings in the old shape, within budget (${r.statements} attempts)`, r.status === 200 && r.body.held === M && sightRows.length === M && r.statements <= TARGET && JSON.parse(sightRows[0].details).rosterGuid.startsWith("Player-9-") && "linkedGuid" in JSON.parse(sightRows[0].details) && "discordId" in JSON.parse(sightRows[0].details), r.statements, r.body.held);
  T += 60;
  r = await ingestHttp(moved, T - 300);
  check("  the agreeing second export: more releases than the cap, all held for a person, reported once, within budget", r.status === 200 && r.body.held === M && r.body.released.length === 0 && auditCount("roster.identity_held") === 1 && r.statements <= TARGET);
  const releaseSyncs = [];
  for (let k = 0; k < 20; k++) {
    T += 60;
    const s = await syncHttp();
    releaseSyncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  check(`the officer's syncs release them, each sync admitted within its allowance (${releaseSyncs.length} syncs, at most ${Math.max(...releaseSyncs.map((s) => s.statements))} attempts)`, releaseSyncs.length > 1 && releaseSyncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2) && one("SELECT COUNT(*) AS c FROM characters WHERE status = 'unbound'").c === M && auditCount("roster.namesake_released") === M, releaseSyncs.map((s) => s.statements), one("SELECT COUNT(*) AS c FROM characters WHERE status = 'unbound'").c);

  // ================= identity transactions: races occur BEFORE the atomic batch, not after it =================
  console.log("\n== an older export cannot rename or release a newer binding ==");
  const queue = (i) => run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES (?, ?, ?, 'queued', ?)", key(i), nm(i), did(i), T - 600);
  const boundMap = () => new Map(all("SELECT name_key, name, discord_id, status, guid, bound_at FROM characters WHERE status IN ('verified','queued','member','left','left_pending')").map((c) => [c.name_key, c]));
  const identityHook = async (predicate, action) => {
    let fired = false;
    BEFORE_BATCH = async (sqls) => {
      if (fired || !sqls.some(predicate)) return;
      fired = true;
      const save = COUNT;
      await action();
      COUNT = save;
    };
    return () => fired;
  };
  const isRenameBatch = (q) => /^SELECT 1 AS valid FROM characters c/.test(q);
  const isReleaseBatch = (q) => /^UPDATE invite_queue SET status = 'cancelled'/.test(q) && /c\.bound_at = \?4/.test(q);
  const identityBase = fillers(100);
  fresh(); resetDiscord();
  link(0); link(99, { status: "unbound" }); queue(0);
  seedSnapshot([...identityBase, ...rosterOf(0, 1)], T - H);
  let newerIdentity = null;
  const renameRace = await identityHook(isRenameBatch, async () => {
    newerIdentity = await rosterMod().ingestRoster(env(lean), T - 120, [...identityBase, ...rosterOf(0, 1)], "addon");
  });
  r = await ingestHttp([...identityBase, { ...rosterOf(0, 1)[0], name: nm(99) }], T - 300, lean);
  BEFORE_BATCH = null;
  check("a newer real export arriving just before an old rename leaves the current GUID binding under its correct name", renameRace() && newerIdentity && r.status === 200 && statusOf(0) === "member" && one("SELECT discord_id, guid FROM characters WHERE name_key = ?", key(0)).guid === guid(0) && auditCount("roster.renamed") === 0 && auditCount("roster.rename_blocked") === 0, r.body);
  check("the refused old rename neither archives the target's history nor moves the current invite", statusOf(99) === "unbound" && !one("SELECT 1 FROM characters WHERE name_key LIKE ?", key(99) + "~%") && one("SELECT name_key, status FROM invite_queue WHERE discord_id = ?", did(0)).name_key === key(0) && one("SELECT status FROM invite_queue WHERE discord_id = ?", did(0)).status === "joined");

  fresh(); resetDiscord();
  link(0, { status: "member", role: true }); queue(0);
  const namesake = { ...rosterOf(0, 1)[0], guid: "Player-9-00000000" };
  seedSnapshot([...identityBase, namesake], T - H); // two agreeing exports would ordinarily release the old GUID
  const releaseRace = await identityHook(isReleaseBatch, async () => {
    newerIdentity = await rosterMod().ingestRoster(env(lean), T - 120, [...identityBase, ...rosterOf(0, 1)], "addon");
  });
  r = await ingestHttp([...identityBase, namesake], T - 300, lean);
  BEFORE_BATCH = null;
  check("a newer real export before a namesake release preserves the unchanged correct binding and its role", releaseRace() && r.status === 200 && statusOf(0) === "member" && one("SELECT guid FROM characters WHERE name_key = ?", key(0)).guid === guid(0) && HAS_ROLE.has(did(0)) && auditCount("roster.namesake_released") === 0 && !FETCHES.some((f) => f.startsWith("DELETE ")), r.body);
  check("the refused old release cannot cancel the invite or write a departure audit", one("SELECT status FROM invite_queue WHERE discord_id = ?", did(0)).status === "queued" && auditCount("roster.left") === 0);

  console.log("\n== the same snapshot's invalid proof, completed or superseded run also fences identity mutations ==");
  for (const boundary of ["new run", "derived run", "unfinished snapshot", "missing member row"]) {
    fresh(); resetDiscord(); link(0); link(99, { status: "unbound" }); queue(0);
    const sid = seedSnapshot([{ ...rosterOf(0, 1)[0], name: nm(99) }], T - H);
    const rid = Number(run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at) VALUES (?, ?, 1, ?)", sid, sid, T).lastInsertRowid);
    const bindings = boundMap();
    const fired = await identityHook(isRenameBatch, async () => {
      if (boundary === "new run") run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at) VALUES (?, ?, 1, ?)", sid, sid, T);
      else if (boundary === "derived run") run("UPDATE roster_effect_runs SET derived_at = ? WHERE id = ?", T, rid);
      else if (boundary === "unfinished snapshot") run("UPDATE roster_snapshots SET complete = 0 WHERE id = ?", sid);
      else run("DELETE FROM roster_members WHERE snapshot_id = ?", sid);
    });
    const ident = await rosterMod().reconcileIdentities(env(), [{ name: nm(99), guid: guid(0) }], bindings, { notices: { items: [] }, fence: { snapshotId: sid, runId: rid } });
    BEFORE_BATCH = null;
    check(`${boundary} in the same snapshot refuses the older identity transaction in full`, fired() && ident.renamed.length === 0 && ident.held.has(key(0)) && statusOf(0) === "verified" && statusOf(99) === "unbound" && one("SELECT name_key FROM invite_queue").name_key === key(0) && auditCount("roster.renamed") === 0);
  }

  console.log("\n== manual sync keeps its explicit full-row legacy or stuck snapshot override ==");
  for (const complete of [null, 0]) {
    fresh(); resetDiscord(); link(0); link(99, { status: "unbound" }); queue(0);
    const sid = seedSnapshot([{ ...rosterOf(0, 1)[0], name: nm(99) }], T - H);
    run("UPDATE roster_snapshots SET complete = ?, first_received_at = ? WHERE id = ?", complete, T - H, sid);
    const sync = await syncHttp(lean);
    check(`manual sync of a full-row ${complete === null ? "legacy" : "stuck"} snapshot can rename the pinned character and move its queue, then vouch for the snapshot`, sync.content.includes("Renamed, link kept (1)") && one("SELECT discord_id, guid FROM characters WHERE name_key = ?", key(99)).discord_id === did(0) && one("SELECT guid FROM characters WHERE name_key = ?", key(99)).guid === guid(0) && one("SELECT name_key FROM invite_queue").name_key === key(99) && auditCount("roster.renamed") === 1 && one("SELECT complete FROM roster_snapshots WHERE id = ?", sid).complete === 1, sync);
  }

  console.log("\n== fresh ownership, GUID, binding time or status refuses both stale identity operations ==");
  for (const change of ["owner", "guid", "bound_at", "status"]) {
    for (const operation of ["rename", "release"]) {
      fresh(); resetDiscord(); link(0, { status: "member", role: true }); link(99, { status: "unbound" }); queue(0);
      run("INSERT INTO members (discord_id) VALUES (?)", did(777));
      const sid = seedSnapshot(operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], T - H);
      const bindings = boundMap();
      const fired = await identityHook(operation === "rename" ? isRenameBatch : isReleaseBatch, async () => {
        if (change === "owner") run("UPDATE characters SET discord_id = ? WHERE name_key = ?", did(777), key(0));
        else if (change === "guid") run("UPDATE characters SET guid = ? WHERE name_key = ?", guid(777), key(0));
        else if (change === "bound_at") run("UPDATE characters SET bound_at = ? WHERE name_key = ?", T, key(0));
        else run("UPDATE characters SET status = 'verified' WHERE name_key = ?", key(0));
      });
      const before = one("SELECT * FROM characters WHERE name_key = ?", key(0));
      const ident = await rosterMod().reconcileIdentities(env(), operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], bindings, { notices: { items: [] }, fence: { snapshotId: sid } });
      BEFORE_BATCH = null;
      const current = one("SELECT * FROM characters WHERE name_key = ?", key(0));
      const expected = { ...before, [change === "owner" ? "discord_id" : change]: change === "owner" ? did(777) : change === "guid" ? guid(777) : change === "bound_at" ? T : "verified" };
      check(`${operation}: a changed ${change} leaves the new binding, queue, target history and Discord role untouched`, fired() && JSON.stringify(current) === JSON.stringify(expected) && statusOf(99) === "unbound" && one("SELECT name_key, status FROM invite_queue").name_key === key(0) && one("SELECT status FROM invite_queue").status === "queued" && ident.held.has(key(0)) && ident.renamed.length === 0 && ident.released.length === 0 && auditCount("roster.renamed") === 0 && auditCount("roster.namesake_released") === 0 && !FETCHES.some((f) => f.startsWith("DELETE ")), current, expected);
    }
  }

  console.log("\n== an identity batch fault rolls back its queue and history changes too ==");
  for (const operation of ["rename", "release"]) {
    fresh(); resetDiscord(); link(0, { status: "member", role: true }); link(99, { status: "unbound" }); queue(0);
    const sid = seedSnapshot(operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], T - H);
    const bindings = boundMap();
    FAIL = (sql) => operation === "rename" ? /^UPDATE characters AS c SET name_key/.test(sql) : /^UPDATE characters AS c SET status = 'unbound'/.test(sql);
    let stopped = false;
    try { await rosterMod().reconcileIdentities(env(), operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], bindings, { notices: { items: [] }, fence: { snapshotId: sid } }); } catch { stopped = true; }
    FAIL = null;
    check(`${operation}: refused final SQL restores the source, queue and any archived target`, stopped && statusOf(0) === "member" && statusOf(99) === "unbound" && one("SELECT name_key, status FROM invite_queue").name_key === key(0) && one("SELECT status FROM invite_queue").status === "queued" && !one("SELECT 1 FROM characters WHERE name_key LIKE ?", key(99) + "~%") && HAS_ROLE.has(did(0)) && !FETCHES.some((f) => f.startsWith("DELETE ")));
  }

  globalThis.Date = RealDate;
  globalThis.setTimeout = realSetTimeout;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

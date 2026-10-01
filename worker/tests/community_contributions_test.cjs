// Build .75 (1 Oct 2026): the contribution (tithe) ledger (consolidation batch 5), through the REAL src/*.ts against the
// REAL schema in SQLite; Discord's HTTP side is stubbed. Covers the pure policy (period anchors, the new-member exemption,
// allocate, evaluate, the ceilings), the gates (flag, mode, retention, the page header), the weekly opener, the member's
// own view and mail reference (no payer names, source ids or recorder), the staff actions through the whole notice flow
// (a past week, evidence, acknowledgement, receipts idempotent/conflicting/over the ceiling, allocation, reversal, void,
// final notice, officer review, removal with no case opened), own_record, the overflow guard (409, never 500), reader
// admission (EARLY, the views, AFTER SUCCESS with the ledger withheld and the write standing), erasure, export and the
// purge with the flag off. Run from the worker folder:  node tests/community_contributions_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// D1 hands an INTEGER past 2^53 to JavaScript as a (rounded) number; node:sqlite throws instead, so the shim reads such rows as BigInts and rounds them the same way
const lossy = (fn) => { try { return fn(false); } catch (e) { if (!(e instanceof RangeError)) throw e; return fn(true); } };
const asNumbers = (row) => (row && typeof row === "object" ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])) : row);
function d1(db, hooks = {}) {
  let batches = 0; // numbered per request, for the beforeBatch/afterBatch hooks
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: lossy((big) => { st.setReadBigInts(big); return st.all(...params).map(asNumbers); }), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings for SQL query (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        params = p;
        return api;
      },
      first: async () => { hooks.count?.(); const st = db.prepare(sql); return lossy((big) => { st.setReadBigInts(big); return asNumbers(st.get(...params)) ?? null; }); },
      all: async () => { hooks.count?.(); const st = db.prepare(sql); return { results: lossy((big) => { st.setReadBigInts(big); return st.all(...params).map(asNumbers); }) }; },
      run: async () => { hooks.count?.(); return exec(sql, params); },
      _exec: () => exec(sql, params),
      _sql: sql,
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      hooks.count?.();
      hooks.sql?.(stmts.map((s) => s._sql));
      hooks.beforeBatch?.(++batches);
      db.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      hooks.afterBatch?.(batches);
      return out;
    },
  };
}
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  return db;
}
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let LOGS = [];
globalThis.fetch = async (url) => { throw new Error("no network in tests: " + url); };
const stubs = {};
const cache = {};
function load(name) {
  const key = name.replace(/^\.\.\//, "./");
  if (stubs[key]) return stubs[key];
  const file = path.join(root, "src", name.replace(/^\.\//, "").replace(/^\.\.\//, "") + ".ts");
  const rel = path.relative(path.join(root, "src"), file).replace(/\\/g, "/");
  if (cache[rel]) return cache[rel].exports;
  const mod = { exports: {} };
  cache[rel] = mod;
  const dir = path.dirname(rel);
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(dir === "." ? p : p.startsWith("../") ? p.slice(3).replace(/^/, "./") : "./" + dir + "/" + p.replace(/^\.\//, "")));
  return mod.exports;
}
const realDiscord = (() => { const m = { exports: {} }; new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(m, m.exports, (p) => load(p)); return m.exports; })();
Object.assign(stubs, {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const context = load("./community-context"), siteCore = load("./site-core"), siteAdmin = load("./site-admin"), indexMod = load("./index");
const pol = load("./community-contribution-policy"), led = load("./community-contributions");

let T = 1790500000; // Sunday 27 Sep 2026, 09:06:40 UTC
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let db = freshDb();
let statements = 0;
let BEFORE = null, AFTER = null; // armed by a test, each fires once
let SQLS = null; // .88: when armed, receives every batch's statement texts
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i), sql: (a) => SQLS?.(a) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", OTHER = "300000000000000004", APPLICANT = "300000000000000001", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const character = (id, name, memberSince, guid = null) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid, member_since) VALUES (?, ?, ?, 'member', ?, ?, ?)").run(name.toLowerCase().split("-")[0], name, id, memberSince, guid, memberSince);
};
const ON = { COMMUNITY_FEATURES: "contributions,restrictions", CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "400", SITE_ADMINS: `${STAFF},${STAFF2}` };
const cookieFor = async (id, version = 1) => (await siteCore.sessionCookie(env(), id, version)).split(";")[0];
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const iso = (s) => new Date(s * 1000).toISOString();
const WEEK = 7 * 86400, DAY = 86400;
const THIS_WEEK = 1789948800, LAST_WEEK = THIS_WEEK - WEEK; // Mondays 21 and 14 Sep 2026, 00:00 UTC
const P = pol.DEFAULT_CONTRIBUTION_POLICY;
const act = (body, who = STAFF, over = ON, extraHeaders = {}) => call("POST", "/api/admin/community/contributions", who, body, over, extraHeaders);
const staffView = async (id = MEMBER) => (await call("GET", "/api/admin/community/contributions?discordId=" + id, STAFF)).body.ledger;
const week = (ledger, start) => ledger.obligations.find((o) => o.periodStart === iso(start));

(async () => {
  siteUser(APPLICANT); siteUser(MEMBER, { global_name: "Mia" }); character(MEMBER, "Mia One", T - 30 * DAY, "Player-1-0001"); siteUser(OTHER, { global_name: "Oz" }); character(OTHER, "Oz New", T - 3 * DAY); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });

  console.log("\n== the pure policy (seconds) ==");
  check("periodStart is the Monday 00:00 UTC at or before the instant", pol.periodStart(T, P) === THIS_WEEK && pol.periodStart(THIS_WEEK, P) === THIS_WEEK && pol.isPeriodStart(THIS_WEEK, P) && !pol.isPeriodStart(T, P));
  check("firstEligiblePeriod: the first complete week after the 14-day exemption, no partial-week backcharge", pol.firstEligiblePeriod(T - 30 * DAY, P) === LAST_WEEK && pol.firstEligiblePeriod(T - 3 * DAY, P) > THIS_WEEK, pol.firstEligiblePeriod(T - 30 * DAY, P));
  const obl = { guildScope: "olympus", discordId: MEMBER, periodStart: LAST_WEEK, dueAt: LAST_WEEK + WEEK, amountCopper: 10000, policy: P, eligible: true, state: "open" };
  const plan = pol.allocate([obl], [{ id: "r1", guildScope: "olympus", amountCopper: 25000, observedAt: T - 100, matchedDiscordId: MEMBER, status: "matched" }], [], T);
  check("allocate plans the payable week from the matched receipt and reports the rest as unallocated credit (not spendable proof)", plan.allocations.length === 1 && plan.allocations[0].amountCopper === 10000 && plan.unallocatedCredit[0].amountCopper === 15000);
  const inputs = { paidCopper: 0, exemption: false, disputed: false, evidence: "complete", acknowledgedAt: null, officerContactAt: null, finalNoticeAt: null, finalAcknowledgedAt: null, finalOfficerContactAt: null, now: T, revision: 1, storedRevision: 1 };
  check("evaluate: a due, unpaid week with complete evidence is notice_available; without evidence unknown; paid is paid; the final notice is a possibility, never a sent notice", pol.evaluate(obl, inputs).stage === "notice_available" && pol.evaluate(obl, { ...inputs, evidence: "unavailable" }).stage === "unknown" && pol.evaluate(obl, { ...inputs, paidCopper: 10000 }).stage === "paid" && pol.evaluate(obl, { ...inputs, acknowledgedAt: LAST_WEEK + WEEK, now: T + 2 * DAY }).stage === "final_notice" && pol.evaluate(obl, { ...inputs, acknowledgedAt: LAST_WEEK + WEEK - 1 }).stage === "needs_review");
  check("the ceilings: the input ceiling is 2^31 - 1 and the exact bound Number.MAX_SAFE_INTEGER", pol.MAX_COPPER_AMOUNT === 2147483647 && pol.MAX_COPPER_TOTAL === Number.MAX_SAFE_INTEGER);
  let threw = null;
  try { pol.allocate([obl], [{ id: "r1", guildScope: "olympus", amountCopper: Number.MAX_SAFE_INTEGER, observedAt: T - 100, matchedDiscordId: MEMBER, status: "matched" }, { id: "r2", guildScope: "olympus", amountCopper: 2, observedAt: T - 50, matchedDiscordId: MEMBER, status: "matched" }], [], T); } catch (e) { threw = e.message; }
  check("a sum past the exact bound is refused by the policy, never rounded", threw === "contribution_overflow");

  console.log("\n== gates ==");
  let r = await call("GET", "/api/community/contributions/me", MEMBER, undefined, { ...ON, COMMUNITY_FEATURES: "" });
  check("with the flag off: 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/community/contributions/me", MEMBER, undefined, { ...ON, CONTRIBUTIONS_MODE: "off" });
  check("with the flag on and the mode off the member's view reads (nothing yet) and says the ledger is not writable", r.status === 200 && r.body.writable === false && r.body.ledger.obligations.length === 0 && r.body.ledger.revision === null, JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: 1, kind: "acknowledged", expectedRevision: "x".repeat(22) + ".1" }, { ...ON, CONTRIBUTIONS_MODE: "off" });
  check("  a member write in that mode is 503 contributions_disabled", r.status === 503 && r.body.error === "contributions_disabled");
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(THIS_WEEK) }, STAFF, { ...ON, CONTRIBUTIONS_RETENTION_DAYS: "" });
  check("  a staff write without a retention is 503 too (storage never starts without a purge)", r.status === 503 && r.body.error === "contributions_disabled");
  check("  the opener does nothing in that mode", (await led.openWeeklyObligations(env({ ...ON, CONTRIBUTIONS_MODE: "off" }), T)) === 0);
  r = await call("GET", "/api/community/contributions/me", APPLICANT);
  check("a signed-in applicant (no character, no Battle.net) reads their own empty ledger: applicantWrite is the member boundary", r.status === 200 && r.body.ledger.obligations.length === 0);
  r = await call("GET", "/api/admin/community/contributions?discordId=" + MEMBER, MEMBER);
  check("a member is not staff: 403 from the admin gate", r.status === 403);
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(THIS_WEEK) }, STAFF, ON, { "X-Olympus": "1" });
  check("a staff write from an old page is told to reload", r.status === 409 && r.body.error === "reload");

  console.log("\n== the weekly opener ==");
  let made = await led.openWeeklyObligations(env(ON), T);
  check("the opener records this week's obligation for every roster-confirmed account that signed in here: the 30-day member eligible, the 3-day member exempt by age (eligible = 0), the applicant without a character none", made === 2 && one("SELECT eligible FROM community_contribution_obligations WHERE discord_id = ?", MEMBER).eligible === 1 && one("SELECT eligible FROM community_contribution_obligations WHERE discord_id = ?", OTHER).eligible === 0 && !one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ?", APPLICANT), made);
  check("  the week, the due date, the pinned policy and the retention fixed from the configuration in force", one("SELECT period_start, due_at, policy_version, retain_until FROM community_contribution_obligations WHERE discord_id = ?", MEMBER).period_start === THIS_WEEK && one("SELECT due_at FROM community_contribution_obligations WHERE discord_id = ?", MEMBER).due_at === THIS_WEEK + WEEK && one("SELECT policy_version FROM community_contribution_obligations WHERE discord_id = ?", MEMBER).policy_version === "v1" && one("SELECT retain_until FROM community_contribution_obligations WHERE discord_id = ?", MEMBER).retain_until === THIS_WEEK + WEEK + 400 * DAY && one("SELECT amount_copper FROM community_contribution_policies WHERE version = 'v1'").amount_copper === 10000);
  check("  a second run records nothing; nothing touched a role or a case", (await led.openWeeklyObligations(env(ON), T)) === 0 && !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'") && one("SELECT COUNT(*) AS n FROM community_restriction_cases").n === 0);

  console.log("\n== the member's own view ==");
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  check("until an officer attests the week's payment records, the policy evaluates it as unknown (the donor's rule, kept)", r.body.ledger.obligations[0].stage === "unknown" && r.body.ledger.obligations[0].evidence === "unavailable");
  r = await act({ action: "evidence", periodStart: iso(THIS_WEEK), state: "complete" });
  check("(fixture) the officer attests this week's records complete", r.status === 200 && r.body.result.status === "attested");
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  let text = JSON.stringify(r.body);
  check("the member sees this week not yet due, eligible, with the policy and no acknowledgement called for", r.status === 200 && r.body.writable === true && r.body.ledger.obligations.length === 1 && r.body.ledger.obligations[0].stage === "not_due" && r.body.ledger.obligations[0].nextReviewAt === iso(THIS_WEEK + WEEK) && r.body.ledger.obligations[0].dueAt === iso(THIS_WEEK + WEEK) && r.body.ledger.obligations[0].eligible === true && r.body.ledger.obligations[0].canAcknowledge === null && r.body.policy.amountCopper === 10000, text.slice(0, 300));
  check("  the mail reference (a lookup aid, never payment proof) and the officer character to mail", /^TITHE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(r.body.mailReference.reference) && r.body.mailReference.recipient === "Fern Melder" && /not proof of payment/.test(r.body.mailReference.note), r.body.mailReference.reference);
  check("  the reference is stable for the account and differs between accounts", (await led.mailReference(env(), "olympus", MEMBER)) === r.body.mailReference.reference && (await led.mailReference(env(), "olympus", OTHER)) !== r.body.mailReference.reference);
  check("  no payer names, source ids or recorder keys exist in the member's view", !/payerName|sourceId|recordedBy|observer/.test(text));
  r = await call("GET", "/api/community/contributions/me", OTHER);
  check("the member exempt by age sees the week as not eligible, stage unknown", r.body.ledger.obligations[0].eligible === false && r.body.ledger.obligations[0].stage === "unknown");

  console.log("\n== staff: a past week, the evidence, the acknowledgement ==");
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(LAST_WEEK) });
  check("staff record a past week (due, unpaid): created; the answer carries the ledger as a new admitted read", r.status === 200 && r.body.ok === true && r.body.result.created === true && r.body.ledger.obligations.length === 2 && week(r.body.ledger, LAST_WEEK).stage === "unknown", JSON.stringify(r.body).slice(0, 300));
  const lastId = week(r.body.ledger, LAST_WEEK).id, thisId = week(r.body.ledger, THIS_WEEK).id;
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(LAST_WEEK) });
  check("  the same week again is a replay (created false)", r.status === 200 && r.body.result.created === false);
  r = await act({ action: "obligation", discordId: STAFF, periodStart: iso(LAST_WEEK) });
  check("  a staff member never acts on their own ledger: 409 own_record (the owner too)", r.status === 409 && r.body.error === "own_record");
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(T) });
  check("  a period that is not a week anchor is invalid_period", r.status === 400 && r.body.error === "invalid_period");
  r = await act({ action: "evidence", periodStart: iso(LAST_WEEK), state: "complete" });
  check("an officer attests the past week's payment records complete", r.status === 200 && r.body.result.status === "attested" && one("SELECT state FROM community_contribution_evidence WHERE period_start = ?", LAST_WEEK).state === "complete");
  let v = await staffView();
  check("  with complete evidence the due week is notice_available and calls for the member's acknowledgement", week(v, LAST_WEEK).stage === "notice_available" && week(v, LAST_WEEK).evidence === "complete" && week(v, LAST_WEEK).canAcknowledge === "acknowledged", JSON.stringify(week(v, LAST_WEEK)));
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: lastId, kind: "acknowledged", expectedRevision: v.revision });
  check("the member acknowledges: a dated contact fact, the stage acknowledged with the final notice possible in 7 days; audited", r.status === 200 && r.body.ok === true && r.body.result.status === "recorded" && week(r.body.ledger, LAST_WEEK).acknowledgedAt === iso(T) && week(r.body.ledger, LAST_WEEK).stage === "acknowledged" && week(r.body.ledger, LAST_WEEK).nextReviewAt === iso(T + 7 * DAY) && !!one("SELECT 1 FROM audit WHERE action = 'community.contribution_acknowledged' AND actor = ?", MEMBER), JSON.stringify(r.body).slice(0, 300));
  let rev = r.body.ledger.revision;
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: lastId, kind: "acknowledged", expectedRevision: rev });
  check("  acknowledging twice is already_recorded (ok false), nothing written", r.status === 200 && r.body.ok === false && r.body.result.status === "already_recorded");
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: lastId, kind: "acknowledged", expectedRevision: v.revision });
  check("  a stale revision is stale", r.body.result.status === "stale");
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: thisId, kind: "acknowledged", expectedRevision: rev });
  check("  the week not yet due takes no acknowledgement: not_applicable", r.body.result.status === "not_applicable");

  console.log("\n== receipts and allocation ==");
  r = await act({ action: "receipt", source: "officer_manual", sourceId: "mail-1", payerName: "Mia One", amountCopper: 10000, observedAt: iso(T - 3600), matchedDiscordId: MEMBER, status: "matched" });
  check("an officer records a matched receipt: staff see its id, source id, payer and recorder; nothing allocated yet", r.status === 200 && r.body.result.created === true && r.body.ledger.receipts.length === 1 && r.body.ledger.receipts[0].sourceId === "mail-1" && r.body.ledger.receipts[0].payerName === "Mia One" && r.body.ledger.receipts[0].recordedBy === STAFF && r.body.ledger.receipts[0].unallocatedCopper === 10000 && r.body.ledger.unallocatedCopper === 10000, JSON.stringify(r.body).slice(0, 300));
  const receiptId = r.body.ledger.receipts[0].id;
  r = await act({ action: "receipt", source: "officer_manual", sourceId: "mail-1", payerName: "Mia One", amountCopper: 10000, observedAt: iso(T - 3600), matchedDiscordId: MEMBER, status: "matched" });
  check("  the identical receipt again is a replay of the same row", r.body.result.created === false && r.body.result.id === receiptId);
  r = await act({ action: "receipt", source: "officer_manual", sourceId: "mail-1", payerName: "Mia One", amountCopper: 12000, observedAt: iso(T - 3600), matchedDiscordId: MEMBER, status: "matched" });
  check("  a different receipt under the same source id is 409 receipt_conflict", r.status === 409 && r.body.error === "receipt_conflict");
  r = await act({ action: "receipt", source: "officer_manual", sourceId: "mail-2", payerName: null, amountCopper: 2147483648, observedAt: iso(T - 3600), matchedDiscordId: MEMBER, status: "matched" });
  check("  an amount over the input ceiling is 400 invalid_amount, never clamped", r.status === 400 && r.body.error === "invalid_amount" && one("SELECT COUNT(*) AS n FROM community_contribution_receipts").n === 1);
  r = await act({ action: "receipt", source: "mail", sourceId: "m-9", payerName: null, amountCopper: 100, observedAt: iso(T - 10), matchedDiscordId: STAFF, status: "matched" });
  check("  a receipt matched to oneself is own_record", r.status === 409 && r.body.error === "own_record");
  r = await act({ action: "allocate", discordId: MEMBER });
  check("allocate pays the oldest payable week from the matched receipt (the week not yet due waits): paid, in the journal", r.status === 200 && r.body.result.status === "applied" && r.body.result.allocations.length === 1 && week(r.body.ledger, LAST_WEEK).paidCopper === 10000 && week(r.body.ledger, LAST_WEEK).stage === "paid" && week(r.body.ledger, THIS_WEEK).paidCopper === 0 && one("SELECT SUM(amount_copper) AS s FROM community_contribution_allocation_events").s === 10000, JSON.stringify(r.body).slice(0, 300));
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  allocating again finds nothing to do", r.body.result.status === "nothing" && r.body.ok === false);
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  text = JSON.stringify(r.body);
  check("the member sees the week paid and the receipt's amounts, never its source id, payer name or recorder", week(r.body.ledger, LAST_WEEK).stage === "paid" && r.body.ledger.receipts.length === 1 && r.body.ledger.receipts[0].allocatedCopper === 10000 && !/payerName|sourceId|recordedBy|mail-1/.test(text));

  console.log("\n== reversal and void ==");
  v = await staffView();
  r = await act({ action: "reverse", discordId: MEMBER, receiptId, obligationId: lastId, expectedRevision: v.revision });
  check("a reversal releases the week's copper and clears its contact facts (a changed week carries no old warning)", r.status === 200 && r.body.result.status === "reversed" && week(r.body.ledger, LAST_WEEK).paidCopper === 0 && week(r.body.ledger, LAST_WEEK).acknowledgedAt === null && week(r.body.ledger, LAST_WEEK).stage === "notice_available" && r.body.ledger.receipts[0].unallocatedCopper === 10000, JSON.stringify(r.body).slice(0, 300));
  r = await act({ action: "reverse", discordId: MEMBER, receiptId, obligationId: lastId, expectedRevision: v.revision });
  check("  a stale snapshot writes nothing: stale", r.body.result.status === "stale");
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  allocating again pays the week once more", r.body.result.status === "applied" && week(r.body.ledger, LAST_WEEK).paidCopper === 10000);
  v = await staffView();
  r = await act({ action: "void", discordId: MEMBER, receiptId, expectedRevision: v.revision });
  check("voiding the receipt (invalid evidence) reverses its allocation, clears the week's facts, records a decision per week and makes it unspendable", r.status === 200 && r.body.result.status === "voided" && week(r.body.ledger, LAST_WEEK).paidCopper === 0 && r.body.ledger.receipts[0].voidedAt === iso(T) && r.body.ledger.receipts[0].unallocatedCopper === 0 && !!one("SELECT 1 FROM community_contribution_decisions WHERE action = 'receipt_voided' AND obligation_id = ?", lastId) && one("SELECT SUM(amount_copper) AS s FROM community_contribution_allocation_events WHERE receipt_id = ?", receiptId).s === 0, JSON.stringify(r.body).slice(0, 300));
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  nothing left to allocate", r.body.result.status === "nothing");
  v = await staffView();
  r = await act({ action: "void", discordId: MEMBER, receiptId, expectedRevision: v.revision });
  check("  voiding twice is already_voided", r.body.result.status === "already_voided");

  console.log("\n== the notice flow to officer review and the removal record ==");
  v = await staffView();
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: lastId, kind: "acknowledged", expectedRevision: v.revision });
  check("the member acknowledges the unpaid week again", r.body.result.status === "recorded");
  rev = r.body.ledger.revision;
  r = await act({ action: "contact", discordId: MEMBER, obligationId: lastId, kind: "final_notice", expectedRevision: rev });
  check("a final notice before the 7 days is not_applicable: the policy did not call for it", r.body.result.status === "not_applicable" && r.body.ok === false);
  T += 8 * DAY;
  v = await staffView();
  check("eight days on the stage is final_notice (a notice MAY be given; none was sent by this software)", week(v, LAST_WEEK).stage === "final_notice");
  r = await act({ action: "contact", discordId: MEMBER, obligationId: lastId, kind: "final_notice", expectedRevision: v.revision });
  check("the officer records that the final notice was given: a dated fact", r.body.result.status === "recorded" && week(r.body.ledger, LAST_WEEK).finalNoticeAt === iso(T));
  rev = r.body.ledger.revision;
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: lastId, kind: "final_acknowledged", expectedRevision: rev });
  check("  the member acknowledges the final notice; the review is possible in 7 days", r.body.result.status === "recorded" && week(r.body.ledger, LAST_WEEK).finalAcknowledgedAt === iso(T) && week(r.body.ledger, LAST_WEEK).nextReviewAt === iso(T + 7 * DAY));
  rev = r.body.ledger.revision;
  r = await act({ action: "removal", discordId: MEMBER, obligationId: lastId, expectedRevision: rev, caseId: null });
  check("a removal record before the review window is not_in_officer_review", r.body.result.status === "not_in_officer_review");
  T += 8 * DAY;
  v = await staffView();
  check("after the review days the stage is officer_review: a review, never a removal instruction", week(v, LAST_WEEK).stage === "officer_review");
  r = await act({ action: "removal", discordId: MEMBER, obligationId: lastId, expectedRevision: v.revision, caseId: "X".repeat(22) });
  check("linking a case that does not exist (or is not about this member) is case_conflict; nothing written", r.body.result.status === "case_conflict" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", lastId).state === "open");
  r = await act({ action: "removal", discordId: MEMBER, obligationId: lastId, expectedRevision: v.revision, caseId: null });
  check("the officer records the removal: the week resolved, a decision journaled; NO restriction case opened, no role touched (the map's rule)", r.status === 200 && r.body.result.status === "recorded" && week(r.body.ledger, LAST_WEEK).state === "resolved" && week(r.body.ledger, LAST_WEEK).stage === "resolved" && one("SELECT COUNT(*) AS n FROM community_restriction_cases").n === 0 && !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'") && !!one("SELECT 1 FROM community_contribution_decisions WHERE action = 'removal_recorded' AND actor = ?", "staff:" + STAFF) && one("SELECT details FROM audit WHERE action = 'community.contribution_removal' ORDER BY id DESC LIMIT 1").details === '{"result":"recorded"}', JSON.stringify(r.body).slice(0, 300));
  r = await act({ action: "removal", discordId: MEMBER, obligationId: lastId, expectedRevision: r.body.ledger.revision, caseId: null });
  check("  the same removal again is a replay", r.body.result.status === "replay");
  v = await staffView();
  r = await act({ action: "state", discordId: MEMBER, obligationId: thisId, state: "exempt", expectedRevision: v.revision });
  check("an exemption is a staff decision on one week", r.body.result.status === "updated" && week(r.body.ledger, THIS_WEEK).state === "exempt" && week(r.body.ledger, THIS_WEEK).stage === "exempt");
  r = await act({ action: "state", discordId: MEMBER, obligationId: thisId, state: "open", expectedRevision: r.body.ledger.revision });
  check("  and reopening it clears the old contacts", r.body.result.status === "updated" && week(r.body.ledger, THIS_WEEK).state === "open");

  console.log("\n== the overflow guard: a stored amount past the exact bound ==");
  db.prepare("INSERT INTO community_contribution_receipts (id, guild_scope, source, source_id, payload_hash, amount_copper, retired_copper, observed_at, matched_discord_id, status, retain_until, created_at) VALUES (?, 'olympus', 'bank_log', 'huge', 'h', ?, 0, ?, ?, 'matched', ?, ?)").run("Z".repeat(22), 9007199254740993n, T, MEMBER, T + 400 * DAY, T);
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  check("the member's view is 409 contribution_overflow, never a rounded amount and never a 500", r.status === 409 && r.body.error === "contribution_overflow", JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", "/api/admin/community/contributions?discordId=" + MEMBER, STAFF);
  check("  the staff view too", r.status === 409 && r.body.error === "contribution_overflow");
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  and an allocation is refused before planning", r.status === 409 && r.body.error === "contribution_overflow");
  let exported = await context.communityExport(env(ON), MEMBER);
  check("  the account copy says so instead of copying a wrong number", exported.contributions.error === "contribution_overflow");
  db.prepare("DELETE FROM community_contribution_receipts WHERE id = ?").run("Z".repeat(22));

  console.log("\n== reader admission on every payload ==");
  const denyStaff = () => db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  const restore = (id) => db.prepare("UPDATE site_users SET denied = 0, in_server = 1, session_version = 1 WHERE discord_id = ?").run(id);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; denyStaff(); } };
  r = await call("GET", "/api/admin/community/contributions?discordId=" + MEMBER, STAFF);
  check("the staff view: an admin denied between the context read and the payload batch is 403 denied, no ledger", r.status === 403 && r.body.error === "denied" && !("ledger" in r.body));
  restore(STAFF);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(MEMBER); } };
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  check("the own view: a member departed before the payload batch is 403 not_member, no ledger", r.status === 403 && r.body.error === "not_member" && !("ledger" in r.body));
  restore(MEMBER);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; denyStaff(); } };
  r = await act({ action: "allocate", discordId: MEMBER });
  check("EARLY: a staff write whose admin is denied before the snapshot read is refused there: 403, nothing written", r.status === 403 && r.body.error === "denied" && !("ledger" in r.body));
  restore(STAFF);
  v = await staffView();
  check("(fixture) this week, now due with complete evidence, calls for an acknowledgement", week(v, THIS_WEEK).canAcknowledge === "acknowledged", JSON.stringify(week(v, THIS_WEEK)));
  AFTER = (i) => { if (i === 3) { AFTER = null; db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(MEMBER); } };
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: thisId, kind: "acknowledged", expectedRevision: v.revision });
  check("AFTER SUCCESS: the acknowledgement committed, then the member denied: the write stands and is acknowledged, the ledger (a new read) is withheld", r.status === 200 && r.body.ok === true && r.body.result.status === "recorded" && r.body.ledger === null && r.body.withheld === "reader_refused" && one("SELECT acknowledged_at FROM community_contribution_obligations WHERE id = ?", thisId).acknowledged_at === T, JSON.stringify(r.body).slice(0, 300));
  restore(MEMBER);
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  check("  restored, the member sees the acknowledgement", week(r.body.ledger, THIS_WEEK).stage === "acknowledged");
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log("\n== .78: the lifetime contract (Codex's selection, 05:19) ==");
  const WEEK2 = LAST_WEEK - WEEK, WEEK3 = LAST_WEEK - 2 * WEEK; // Mondays 7 September and 31 August 2026
  // this process's clock T is now 16 days ahead of the database's (the real one): "expired by the database clock" is a real-clock value
  const EXPIRED = Math.floor(RealDate.now() / 1000) - 1;
  const keep = one("SELECT retain_until FROM community_contribution_obligations WHERE id = ?", thisId).retain_until;
  db.prepare("UPDATE community_contribution_obligations SET retain_until = ? WHERE id = ?").run(EXPIRED, thisId);
  r = await call("GET", "/api/community/contributions/me", MEMBER);
  v = await staffView();
  exported = await context.communityExport(env(ON), MEMBER);
  check("an expired week (retain_until past by the database clock, not yet purged) is absent from the member's view, the staff view and the account copy", r.body.ledger.obligations.every((o) => o.id !== thisId) && v.obligations.every((o) => o.id !== thisId) && exported.contributions.obligations.every((o) => o.periodStart !== iso(THIS_WEEK)));
  r = await act({ action: "state", discordId: MEMBER, obligationId: thisId, state: "exempt", expectedRevision: v.revision });
  check("  it takes no state change: 404 not_found, the row untouched", r.status === 404 && r.body.error === "not_found" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state === "open");
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: thisId, kind: "acknowledged", expectedRevision: v.revision });
  check("  no acknowledgement: 404", r.status === 404);
  r = await act({ action: "removal", discordId: MEMBER, obligationId: thisId, expectedRevision: v.revision, caseId: null });
  check("  no removal record: 404", r.status === 404);
  db.prepare("UPDATE community_contribution_obligations SET retain_until = ? WHERE id = ?").run(keep, thisId);
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(WEEK2) });
  const week2Id = week(r.body.ledger, WEEK2).id;
  r = await act({ action: "receipt", source: "mail", sourceId: "mail-3", payerName: "Mia One", amountCopper: 10000, observedAt: iso(T - 7200), matchedDiscordId: MEMBER, status: "matched" });
  const receipt3 = r.body.ledger.receipts.find((x) => x.sourceId === "mail-3").id;
  const keep3 = one("SELECT retain_until FROM community_contribution_receipts WHERE id = ?", receipt3).retain_until;
  AFTER = (i) => { if (i === 1) { AFTER = null; db.prepare("UPDATE community_contribution_receipts SET retain_until = ? WHERE id = ?").run(EXPIRED, receipt3); } };
  r = await act({ action: "allocate", discordId: MEMBER });
  check("a receipt whose deadline passes between the snapshot and the write funds nothing: the journal insert requires it live at the write; the week stays unpaid", r.status === 200 && r.body.result.allocations.length === 0 && week(r.body.ledger, WEEK2).paidCopper === 0 && !one("SELECT 1 FROM community_contribution_allocation_events WHERE receipt_id = ?", receipt3), JSON.stringify(r.body).slice(0, 300));
  db.prepare("UPDATE community_contribution_receipts SET retain_until = ? WHERE id = ?").run(keep3, receipt3);
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  live again, it pays the week", r.body.result.status === "applied" && week(r.body.ledger, WEEK2).paidCopper === 10000);
  r = await act({ action: "receipt", source: "mail", sourceId: "mail-4", payerName: "Mia One", amountCopper: 5000, observedAt: iso(T - 7000), matchedDiscordId: MEMBER, status: "matched" });
  const receipt4 = r.body.ledger.receipts.find((x) => x.sourceId === "mail-4").id;
  db.prepare("UPDATE community_contribution_receipts SET retain_until = ? WHERE id IN (?, ?)").run(EXPIRED, receipt3, receipt4);
  v = await staffView();
  const seen3 = v.receipts.find((x) => x.id === receipt3);
  check("an expired receipt still paying a live week shows only the allocated/retired relationship that week needs: no source id, payer or recorder, the amount = what it paid, no credit; one paying nothing live is not shown; the week stays paid", !!seen3 && seen3.sourceId === null && seen3.payerName === null && seen3.recordedBy === null && seen3.amountCopper === 10000 && seen3.allocatedCopper === 10000 && seen3.unallocatedCopper === 0 && !("expiredCopper" in seen3) && !v.receipts.some((x) => x.id === receipt4) && week(v, WEEK2).paidCopper === 10000, JSON.stringify(v.receipts).slice(0, 300));
  exported = await context.communityExport(env(ON), MEMBER);
  check("  the account copy does the same", exported.contributions.receipts.some((x) => x.amountCopper === 10000 && x.allocatedCopper === 10000) && !exported.contributions.receipts.some((x) => x.amountCopper === 5000) && !JSON.stringify(exported.contributions).includes("expiredCopper"));
  r = await act({ action: "allocate", discordId: MEMBER });
  check("  expired credit never funds a new allocation (nothing to do)", r.body.result.status === "nothing");
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(WEEK3) });
  const week3Id = week(r.body.ledger, WEEK3).id;
  r = await act({ action: "evidence", periodStart: iso(WEEK3), state: "complete" });
  v = await staffView();
  check("(fixture) an older unpaid week with complete evidence calls for an acknowledgement", week(v, WEEK3).canAcknowledge === "acknowledged", JSON.stringify(week(v, WEEK3)));
  AFTER = (i) => { if (i === 2) { AFTER = null; db.prepare("UPDATE community_contribution_evidence SET state = 'partial' WHERE period_start = ?").run(WEEK3); } };
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: week3Id, kind: "acknowledged", expectedRevision: v.revision });
  check("a contact whose attestation changed between the evaluation and the write is facts_stale: the first statement re-states the evidence it relied on; no contact, no decision journaled", r.status === 200 && r.body.result.status === "facts_stale" && one("SELECT acknowledged_at FROM community_contribution_obligations WHERE id = ?", week3Id).acknowledged_at === null && !one("SELECT 1 FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'contact_acknowledged'", week3Id), JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_contribution_evidence SET state = 'complete' WHERE period_start = ?").run(WEEK3);
  v = await staffView();
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: week3Id, kind: "acknowledged", expectedRevision: v.revision });
  check("  with the attestation back the acknowledgement is recorded, with its decision", r.body.result.status === "recorded" && !!one("SELECT 1 FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'contact_acknowledged'", week3Id));
  T += 8 * DAY;
  v = await staffView();
  r = await act({ action: "contact", discordId: MEMBER, obligationId: week3Id, kind: "final_notice", expectedRevision: v.revision });
  r = await call("POST", "/api/community/contributions/acknowledge", MEMBER, { obligationId: week3Id, kind: "final_acknowledged", expectedRevision: r.body.ledger.revision });
  T += 8 * DAY;
  v = await staffView();
  check("(fixture) the week reaches officer_review", week(v, WEEK3).stage === "officer_review", JSON.stringify(week(v, WEEK3)));
  const CASE = "C".repeat(22);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "create", caseId: CASE, discordId: MEMBER, category: "tithe_removal", reviewAt: iso(T + 30 * DAY), expiresAt: iso(T + 180 * DAY) });
  check("(fixture) a restriction case about the member, opened through the restrictions module itself", r.status === 200, JSON.stringify(r.body).slice(0, 200));
  AFTER = (i) => { if (i === 3) { AFTER = null; db.prepare("UPDATE community_restriction_cases SET retain_until = ? WHERE id = ?").run(EXPIRED, CASE); } };
  r = await act({ action: "removal", discordId: MEMBER, obligationId: week3Id, expectedRevision: v.revision, caseId: CASE });
  check("a removal whose linked case expires between the evaluation and the write is facts_changed: the first statement requires the case live about this member; the week stays open, no decision", r.body.result.status === "facts_changed" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", week3Id).state === "open" && !one("SELECT 1 FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'removal_recorded'", week3Id), JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_restriction_cases SET retain_until = ? WHERE id = ?").run(T + 180 * DAY, CASE);
  v = await staffView();
  r = await act({ action: "removal", discordId: MEMBER, obligationId: week3Id, expectedRevision: v.revision, caseId: CASE });
  check("  with the case live the removal is recorded and LINKS it (never opens one): resolved, the case id on the week, one case in all", r.body.result.status === "recorded" && one("SELECT removal_case_id FROM community_contribution_obligations WHERE id = ?", week3Id).removal_case_id === CASE && one("SELECT COUNT(*) AS n FROM community_restriction_cases").n === 1);
  const NOW_WEEK = pol.periodStart(T, P);
  BEFORE = (i) => { if (i === 2) { BEFORE = null; db.prepare("DELETE FROM site_users WHERE discord_id = ?").run(OTHER); siteUser(OTHER, { global_name: "Oz", first_login: T + 5, last_login: T + 5 }); } };
  made = await led.openWeeklyObligations(env(ON), T);
  check("the opener: an account erased and recreated between the scan and its insert gets no obligation (the captured incarnation is re-stated at the insert); the other account's is recorded", made === 1 && !!one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", MEMBER, NOW_WEEK) && !one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", OTHER, NOW_WEEK) && BEFORE === null, made);
  made = await led.openWeeklyObligations(env(ON), T);
  check("  the next run records the recreated account's own obligation (its own incarnation)", made === 1 && !!one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", OTHER, NOW_WEEK));
  db.prepare("DELETE FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?").run(OTHER, NOW_WEEK);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE characters SET status = 'left' WHERE discord_id = ?").run(OTHER); } };
  made = await led.openWeeklyObligations(env(ON), T);
  check("  an account whose roster proof is gone at the insert gets none either", made === 0 && !one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", OTHER, NOW_WEEK) && BEFORE === null, made);
  db.prepare("UPDATE characters SET status = 'member' WHERE discord_id = ?").run(OTHER);
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log("\n== .80: later standalone reads admitted; the fence by the database clock; no replay of an expired receipt; the purge bounded to its run ==");
  const W4 = LAST_WEEK - 3 * WEEK; // Monday 24 August 2026
  AFTER = (i) => { if (i === 1) { AFTER = null; denyStaff(); } };
  r = await act({ action: "obligation", discordId: MEMBER, periodStart: iso(W4) });
  check("a committed create followed by the admin's denial: the week exists (the write stands) and the later standalone read of its id is refused: 403 denied, no ledger", r.status === 403 && r.body.error === "denied" && !!one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", MEMBER, W4) && !("ledger" in r.body), JSON.stringify(r.body).slice(0, 200));
  restore(STAFF);
  const fenceOf = (id) => ({ discordId: id, sessionVersion: 1, expiresAt: Math.floor(RealDate.now() / 1000) + 3600 });
  check("fenceRefusal judges by the database's clock and facts in SQL: a live session in good standing is admitted; a bumped version or a passed expiry is session_expired", (await led.fenceRefusal(env(ON), fenceOf(STAFF))) === null && (await led.fenceRefusal(env(ON), { ...fenceOf(STAFF), sessionVersion: 2 })) === "session_expired" && (await led.fenceRefusal(env(ON), { ...fenceOf(STAFF), expiresAt: Math.floor(RealDate.now() / 1000) - 1 })) === "session_expired");
  db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  check("  a denial is standing_lost", (await led.fenceRefusal(env(ON), fenceOf(STAFF))) === "standing_lost");
  restore(STAFF);
  r = await act({ action: "receipt", source: "bank_log", sourceId: "bank-9", payerName: null, amountCopper: 700, observedAt: iso(T - 60), matchedDiscordId: MEMBER, status: "matched" });
  const receipt9 = r.body.ledger.receipts.find((x) => x.sourceId === "bank-9").id;
  db.prepare("UPDATE community_contribution_receipts SET retain_until = ? WHERE id = ?").run(EXPIRED, receipt9);
  r = await act({ action: "receipt", source: "bank_log", sourceId: "bank-9", payerName: null, amountCopper: 700, observedAt: iso(T - 60), matchedDiscordId: MEMBER, status: "matched" });
  check("the identical receipt retried after its deadline is 409 past_retention, never a replay (the source id stays taken until the purge frees it)", r.status === 409 && r.body.error === "past_retention" && one("SELECT COUNT(*) AS n FROM community_contribution_receipts WHERE source_id = 'bank-9'").n === 1, JSON.stringify(r.body).slice(0, 200));
  const P1 = "300000000000000081", P2 = "300000000000000082", P3 = "300000000000000083";
  for (const id of [P1, P2, P3]) await led.createObligation(env(ON), { guildScope: "olympus", discordId: id, periodStart: W4, eligible: true }, T);
  db.prepare("UPDATE community_contribution_obligations SET retain_until = ? WHERE discord_id IN (?, ?)").run(T - 1, P1, P2);
  const revs = () => Object.fromEntries([P1, P2, P3].map((id) => [id, one("SELECT revision FROM community_contribution_members WHERE discord_id = ?", id)?.revision ?? null]));
  const before = revs();
  const purged1 = await led.sweepCommunityContributions(env({ ...ON, COMMUNITY_FEATURES: "", CONTRIBUTIONS_MODE: "off" }), T, 1);
  const after1 = revs();
  check("a purge run bounded to one week touches one member: that week and its member row go; the other expired member's and the live member's revisions are untouched", purged1 >= 1 && after1[P1] === null && after1[P2] === before[P2] && after1[P3] === before[P3], JSON.stringify({ before, after1, purged1 }));
  const purged2 = await led.sweepCommunityContributions(env({ ...ON, COMMUNITY_FEATURES: "", CONTRIBUTIONS_MODE: "off" }), T, 1);
  check("  the next run takes the other, the live member still untouched", purged2 >= 1 && revs()[P2] === null && revs()[P3] === before[P3], JSON.stringify(revs()));
  db.prepare("DELETE FROM community_contribution_obligations WHERE discord_id = ?").run(P3);
  db.prepare("DELETE FROM community_contribution_members WHERE discord_id = ?").run(P3);
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log("\n== .88: the four ledger repairs (Codex's frozen .80 review) ==");
  // (1) the new-receipt batch: the private magnitude probe carries the acting session's fence in its own statement, and the insert the deadline
  const batches = [];
  SQLS = (a) => batches.push(a);
  r = await act({ action: "receipt", source: "bank_log", sourceId: "bank-88", payerName: null, amountCopper: 500, observedAt: iso(T - 10), matchedDiscordId: MEMBER, status: "matched" }); // after the purged receipt's horizon (T - 60)
  SQLS = null;
  const probeSql = batches.flat().find((x) => x.includes("AS over_limit"));
  const insertSql = batches.flat().find((x) => x.includes("INSERT INTO community_contribution_receipts"));
  check("the new-receipt batch's magnitude probe acquires nothing unless the acting session's fence holds in that same statement, and the insert requires the deadline by the database clock", r.status === 200 && !!probeSql && /WHERE 1 AND [\s\S]*session_version/.test(probeSql) && /CAST\(strftime/.test(probeSql) && !!insertSql && /AND \?12 > CAST\(strftime\('%s', 'now'\) AS INTEGER\)/.test(insertSql), r.status, JSON.stringify(r.body).slice(0, 160), !!probeSql, !!insertSql, insertSql && insertSql.replace(/\s+/g, " ").slice(0, 400));
  // (2) the removal requires the SAME linked case it evaluated (its incarnation)
  const W5 = LAST_WEEK - 5 * WEEK;
  db.prepare("INSERT INTO community_contribution_obligations (guild_scope, discord_id, period_start, due_at, policy_version, amount_copper, eligible, state, acknowledged_at, final_notice_at, final_acknowledged_at, retain_until, created_at, updated_at) VALUES ('olympus', ?, ?, ?, 'v1', 10000, 1, 'open', ?, ?, ?, ?, ?, ?)").run(MEMBER, W5, W5 + WEEK, W5 + WEEK + DAY, W5 + WEEK + 8 * DAY, W5 + WEEK + 8 * DAY, T + 400 * DAY, T, T);
  db.prepare("INSERT INTO community_contribution_evidence (guild_scope, period_start, state, attested_at, retain_until, nonce) VALUES ('olympus', ?, 'complete', ?, ?, 'ev88')").run(W5, T, T + 400 * DAY);
  const week5Id = one("SELECT id FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", MEMBER, W5).id;
  v = await staffView();
  check("(fixture) an old week in officer_review", week(v, W5) && week(v, W5).stage === "officer_review", JSON.stringify(week(v, W5)));
  const CASE2 = "D".repeat(22);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "create", caseId: CASE2, discordId: MEMBER, category: "tithe_removal", reviewAt: iso(T + 30 * DAY), expiresAt: iso(T + 180 * DAY) });
  check("(fixture) a second restriction case about the member", r.status === 200, JSON.stringify(r.body).slice(0, 200));
  AFTER = (i) => { if (i === 3) { AFTER = null; db.prepare("UPDATE community_restriction_cases SET incarnation = 'replaced-under-the-same-id' WHERE id = ?").run(CASE2); } };
  r = await act({ action: "removal", discordId: MEMBER, obligationId: week5Id, expectedRevision: v.revision, caseId: CASE2 });
  check("a removal whose linked case is REPLACED under the same id (a new incarnation, still live) between the evaluation and the write is facts_changed: the week stays open, no decision", r.body.result.status === "facts_changed" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", week5Id).state === "open" && !one("SELECT 1 FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'removal_recorded'", week5Id) && AFTER === null, JSON.stringify(r.body).slice(0, 200));
  v = await staffView();
  r = await act({ action: "removal", discordId: MEMBER, obligationId: week5Id, expectedRevision: v.revision, caseId: CASE2 });
  check("  evaluated against the replaced case itself, the removal is recorded and links it", r.body.result.status === "recorded" && one("SELECT removal_case_id FROM community_contribution_obligations WHERE id = ?", week5Id).removal_case_id === CASE2);
  // (3) the opener restates the eligibility it writes from the member's CURRENT characters
  db.prepare("DELETE FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?").run(OTHER, NOW_WEEK);
  const openerSql = [];
  SQLS = (a) => openerSql.push(a);
  const ozSince = one("SELECT member_since FROM characters WHERE discord_id = ?", OTHER).member_since; // joined a month ago by now: scanned as eligible
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE characters SET member_since = ? WHERE discord_id = ?").run(T - 3 * DAY, OTHER); } }; // by the insert the earliest member_since is three days old: exempt
  made = await led.openWeeklyObligations(env(ON), T);
  SQLS = null;
  check("the opener: a member scanned as eligible whose earliest member_since makes them exempt by the insert gets no row (proof_changed: the eligibility is restated from the characters as they are then)", made === 0 && !one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", OTHER, NOW_WEEK) && BEFORE === null, made, JSON.stringify(one("SELECT discord_id, eligible FROM community_contribution_obligations WHERE period_start = ? AND discord_id = ?", NOW_WEEK, OTHER)), JSON.stringify(one("SELECT member_since, status FROM characters WHERE discord_id = ?", OTHER)), openerSql.length, (openerSql[0] || [""])[0].replace(/\s+/g, " ").slice(0, 900));
  made = await led.openWeeklyObligations(env(ON), T);
  check("  the next run records them with the eligibility their current age gives (exempt, eligible = 0)", made === 1 && one("SELECT eligible FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", OTHER, NOW_WEEK).eligible === 0, made);
  db.prepare("UPDATE characters SET member_since = ? WHERE discord_id = ?").run(ozSince, OTHER);
  // (4) nothing is born at or past its deadline by the database clock, even when the actor's clock is behind
  const REAL = Math.floor(RealDate.now() / 1000);
  const PS = pol.periodStart(REAL - 8 * DAY, P); // a week whose one-day retention ended before the real clock
  const behind = PS + WEEK + 12 * 3600; // an actor clock before that deadline
  const ONE_DAY = { ...ON, CONTRIBUTIONS_RETENTION_DAYS: "1" };
  threw = null;
  try { await led.createObligation(env(ONE_DAY), { guildScope: "olympus-born", discordId: MEMBER, periodStart: PS, eligible: true }, behind); } catch (e) { threw = e.code; }
  check("a week whose deadline has passed by the database clock is not born, even when the actor's clock says otherwise: past_retention, no row", threw === "past_retention" && !one("SELECT 1 FROM community_contribution_obligations WHERE guild_scope = 'olympus-born'"), threw);
  threw = null;
  try { await led.recordReceipt(env(ONE_DAY), { guildScope: "olympus", source: "bank_log", sourceId: "bank-born-expired", payerName: null, amountCopper: 300, observedAt: REAL - 2 * DAY, observerDiscordId: STAFF, matchedDiscordId: MEMBER, status: "matched" }, REAL - 36 * 3600); } catch (e) { threw = e.code; }
  check("  a receipt likewise: past_retention, no row", threw === "past_retention" && !one("SELECT 1 FROM community_contribution_receipts WHERE source_id = 'bank-born-expired'"), threw);
  threw = null;
  try { await led.attestEvidence(env(ONE_DAY), { guildScope: "olympus-born", periodStart: PS, state: "complete" }, behind); } catch (e) { threw = e.code; }
  check("  an attestation likewise: past_retention, no row", threw === "past_retention" && !one("SELECT 1 FROM community_contribution_evidence WHERE guild_scope = 'olympus-born'"), threw);
  // (5) .94: no decision is journaled born expired: the journal deadline is required ahead of the database clock in the FIRST
  // mutation (the member compare-and-set), before any effect; the actor's clock stands in for Codex's moved SQL clock
  const fence94 = { ...fenceOf(STAFF), expiresAt: T + 3600 }; // the fast expiry check in code reads the process clock (T, weeks ahead); the SQL fence reads the database clock
  const W4id = one("SELECT id FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?", MEMBER, W4).id;
  const receipt88 = one("SELECT id FROM community_contribution_receipts WHERE source_id = 'bank-88'").id;
  r = await act({ action: "evidence", periodStart: iso(W4), state: "complete" });
  r = await act({ action: "allocate", discordId: MEMBER });
  const pair88 = one("SELECT obligation_id, SUM(amount_copper) AS paid FROM community_contribution_allocation_events WHERE receipt_id = ? GROUP BY obligation_id", receipt88);
  check("(fixture) the .88 receipt pays a live week", r.body.result.status === "applied" && !!pair88 && pair88.paid === 500, JSON.stringify(r.body.result).slice(0, 200));
  const memberRev = () => one("SELECT revision FROM community_contribution_members WHERE guild_scope = 'olympus' AND discord_id = ?", MEMBER).revision;
  const decisions = () => one("SELECT COUNT(*) AS n FROM community_contribution_decisions").n;
  const rev94 = memberRev(), dec94 = decisions();
  v = await staffView();
  const stateBefore = one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state;
  const sql94 = [];
  SQLS = (a) => sql94.push(a);
  threw = null;
  try { await led.setObligationState(env(ONE_DAY), { guildScope: "olympus", discordId: MEMBER, obligationId: thisId, state: "exempt", expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, REAL - 2 * DAY); } catch (e) { threw = e.code; }
  SQLS = null;
  const write94 = sql94.find((b) => b.some((x) => x.includes("UPDATE community_contribution_members"))) || [];
  const cas94 = write94[0] || "", journal94 = write94.find((x) => x.includes("INSERT INTO community_contribution_decisions")) || "";
  check("a state change whose journal would be born expired (the actor's clock two days behind, a one-day retention) is refused in the FIRST statement, before any effect: past_retention, the week unchanged, no journal row, the member's revision unchanged", threw === "past_retention" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state === stateBefore && decisions() === dec94 && memberRev() === rev94, threw);
  check("  that first statement is the member compare-and-set carrying the deadline by the database clock; the journal insert restates it; the probe closes the batch", /^\s*UPDATE community_contribution_members[\s\S]*\?7 > CAST\(strftime/.test(cas94) && /\?9 > CAST\(strftime/.test(journal94) && /^\s*SELECT \(\?1 > CAST\(strftime/.test(write94[write94.length - 1] || ""), cas94.replace(/\s+/g, " ").slice(0, 300));
  threw = null;
  try { await led.voidReceipt(env(ONE_DAY), { guildScope: "olympus", discordId: MEMBER, receiptId: receipt88, expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, REAL - 2 * DAY); } catch (e) { threw = e.code; }
  check("  a void likewise: past_retention; the receipt stays unvoided and still paying its week, no journal row", threw === "past_retention" && one("SELECT voided_at FROM community_contribution_receipts WHERE id = ?", receipt88).voided_at === null && one("SELECT SUM(amount_copper) AS paid FROM community_contribution_allocation_events WHERE receipt_id = ?", receipt88).paid === 500 && decisions() === dec94 && memberRev() === rev94, threw);
  threw = null;
  try { await led.reverseAllocation(env(ONE_DAY), { guildScope: "olympus", discordId: MEMBER, receiptId: receipt88, obligationId: pair88.obligation_id, expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, REAL - 2 * DAY); } catch (e) { threw = e.code; }
  check("  a reversal likewise: past_retention; the allocation stands", threw === "past_retention" && one("SELECT SUM(amount_copper) AS paid FROM community_contribution_allocation_events WHERE receipt_id = ?", receipt88).paid === 500 && decisions() === dec94 && memberRev() === rev94, threw);
  threw = null;
  try { await led.recordContact(env(ONE_DAY), { guildScope: "olympus", discordId: MEMBER, obligationId: W4id, kind: "officer_contact", evidence: "complete", expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, REAL - 2 * DAY); } catch (e) { threw = e.code; }
  check("  a contact likewise (the week notice_available under complete evidence at that clock): past_retention; no contact fact, no journal row", threw === "past_retention" && one("SELECT officer_contact_at FROM community_contribution_obligations WHERE id = ?", W4id).officer_contact_at === null && decisions() === dec94 && memberRev() === rev94, threw);
  // the paired observation: the same actor clock behind the database's, the journal deadline still ahead of it: the write commits, its journal deadline truthful and live
  const behind94 = REAL - 12 * 3600;
  const updated = await led.setObligationState(env(ONE_DAY), { guildScope: "olympus", discordId: MEMBER, obligationId: thisId, state: "exempt", expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, behind94);
  const journalRow = one("SELECT retain_until FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'state_exempt' ORDER BY id DESC LIMIT 1", thisId);
  check("an actor clock behind the database's with the journal deadline still ahead of it commits: updated, the journal row's deadline is the captured one (actor now + retention), live by the database clock", updated === "updated" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state === "exempt" && decisions() === dec94 + 1 && memberRev() === rev94 + 1 && journalRow.retain_until === behind94 + DAY && journalRow.retain_until > REAL, updated, JSON.stringify(journalRow));
  v = await staffView();
  BEFORE = (i) => { if (i === 2) { BEFORE = null; db.prepare("UPDATE community_contribution_members SET revision = revision + 1 WHERE guild_scope = 'olympus' AND discord_id = ?").run(MEMBER); } };
  const raced = await led.setObligationState(env(ON), { guildScope: "olympus", discordId: MEMBER, obligationId: thisId, state: stateBefore, expectedRevision: v.revision, actor: "staff:" + STAFF, fence: fence94 }, T);
  check("  a snapshot that loses the race at the compare-and-set with a live deadline is stale, never past_retention (the probe tells them apart)", raced === "stale" && BEFORE === null && one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state === "exempt", raced);
  v = await staffView();
  r = await act({ action: "state", discordId: MEMBER, obligationId: thisId, state: stateBefore, expectedRevision: v.revision });
  check("  (restored) the ordinary request clock, far ahead of the database's, commits as before", r.body.result.status === "updated" && one("SELECT state FROM community_contribution_obligations WHERE id = ?", thisId).state === stateBefore);
  db.prepare("DELETE FROM community_contribution_evidence WHERE guild_scope = 'olympus' AND period_start = ?").run(W4);
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null && SQLS === null);
  // this section's own fixtures go, so the export and purge controls below keep the state they were written against
  db.prepare("DELETE FROM community_contribution_allocation_events WHERE receipt_id IN (SELECT id FROM community_contribution_receipts WHERE source_id = 'bank-88')").run();
  db.prepare("DELETE FROM community_contribution_receipts WHERE source_id = 'bank-88'").run();
  db.prepare("DELETE FROM community_contribution_decisions WHERE obligation_id = ?").run(week5Id);
  db.prepare("DELETE FROM community_contribution_obligations WHERE id = ?").run(week5Id);
  db.prepare("DELETE FROM community_contribution_evidence WHERE nonce = 'ev88'").run();
  db.prepare("DELETE FROM community_restriction_characters WHERE case_id = ?").run(CASE2);
  db.prepare("DELETE FROM community_restriction_cases WHERE id = ?").run(CASE2);
  db.prepare("DELETE FROM community_contribution_obligations WHERE discord_id = ? AND period_start = ?").run(OTHER, NOW_WEEK);

  console.log("\n== erasure, export, purge ==");
  exported = await context.communityExport(env(ON), MEMBER);
  text = JSON.stringify(exported.contributions);
  check("the account copy lists the member's live weeks with paid sums and contact dates and their receipts' amounts; never who observed or recorded, payer names or source ids", exported.contributions.obligations.length === 6 && exported.contributions.receipts.length === 2 && exported.contributions.receipts.some((x) => x.voidedAt !== null) && exported.contributions.receipts.some((x) => x.allocatedCopper === 10000) && !/"(payerName|payer_name|observer|observerDiscordId|sourceId|source_id|recordedBy)"|mail-1|mail-3|staff:/.test(text) && !text.includes(STAFF), text.slice(0, 300));
  await siteAdmin.deleteSiteData(env(ON), STAFF, STAFF2);
  check("erasing the officer removes them as the receipt's observer and anonymizes them as the actor of journal rows and decisions", one("SELECT observer_discord_id FROM community_contribution_receipts WHERE id = ?", receiptId).observer_discord_id === null && !one("SELECT 1 FROM community_contribution_allocation_events WHERE actor = ?", "staff:" + STAFF) && !one("SELECT 1 FROM community_contribution_decisions WHERE actor = ?", "staff:" + STAFF) && !!one("SELECT 1 FROM community_contribution_decisions WHERE actor = 'erased'"));
  siteUser(STAFF, { global_name: "Vik" });
  await siteAdmin.deleteSiteData(env(ON), MEMBER, STAFF);
  const left = ["community_contribution_members.discord_id", "community_contribution_obligations.discord_id", "community_contribution_receipts.matched_discord_id", "community_contribution_decisions.discord_id"].filter((tc) => { const [t, c] = tc.split("."); return one(`SELECT 1 FROM ${t} WHERE ${c} = ?`, MEMBER); });
  check("erasing the member removes every ledger row about them (all scopes) and the journal rows of their weeks and receipts", left.length === 0 && one("SELECT COUNT(*) AS n FROM community_contribution_allocation_events").n === 0, left.join(" "));
  db.prepare("UPDATE community_contribution_obligations SET retain_until = ? WHERE discord_id = ?").run(T - 1, OTHER);
  const purged = await led.sweepCommunityContributions(env({ ...ON, COMMUNITY_FEATURES: "", CONTRIBUTIONS_MODE: "off" }), T);
  check("the purge runs with the flag and the mode off: the expired week goes with its member row (its later week was removed above), and the scope's horizon keeps that week from being recorded again", purged >= 1 && !one("SELECT 1 FROM community_contribution_obligations WHERE discord_id = ?", OTHER) && !one("SELECT 1 FROM community_contribution_members WHERE discord_id = ?", OTHER) && one("SELECT horizon FROM community_contribution_horizons WHERE kind = 'obligation'").horizon === THIS_WEEK, purged, JSON.stringify(one("SELECT horizon FROM community_contribution_horizons WHERE kind = 'obligation'")), JSON.stringify(one("SELECT COUNT(*) AS n FROM community_contribution_obligations WHERE discord_id = ?", OTHER)), JSON.stringify(one("SELECT COUNT(*) AS n FROM community_contribution_members WHERE discord_id = ?", OTHER)));
  threw = null;
  try { await led.createObligation(env(ON), { guildScope: "olympus", discordId: OTHER, periodStart: THIS_WEEK, eligible: true }, T); } catch (e) { threw = e.code; }
  check("  a week at or before the horizon is refused (past_retention), never recorded twice", threw === "past_retention");

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

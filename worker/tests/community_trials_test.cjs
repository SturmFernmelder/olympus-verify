// Build .61 (1 Oct 2026): trial reviews (consolidation batch 4a), through the REAL src/*.ts against the REAL schema in
// SQLite; Discord's HTTP side is stubbed. Covers the flag and gates (own trial for any signed-in account in good
// standing, staff writes for SITE_ADMINS only), create (opId replay and op_conflict, own trial refused, sponsor rules,
// an account that never signed in, an open trial existing), the staff list (order, status filter, cursor), extend and
// conclude (stale revision, incarnation, concluded twice, own_record, the due date rules, outcome/reason pairs), the
// member's own view without sponsor or staff, erasure (own trials gone, sponsor/creator anonymized), export and the
// retention sweep; .72: every payload (reads, the pre-write state, a replay, a lost compare-and-set, after a committed
// write) under the reader's admission. Run from the worker folder:  node tests/community_trials_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
  let batches = 0; // .72: numbered per request, for the beforeBatch/afterBatch hooks
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
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
      first: async () => { hooks.count?.(); return db.prepare(sql).get(...params) ?? null; },
      all: async () => { hooks.count?.(); return { results: db.prepare(sql).all(...params) }; },
      run: async () => { hooks.count?.(); return exec(sql, params); },
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      hooks.count?.();
      hooks.beforeBatch?.(++batches); // .72: a test may change the facts between the context read and this payload batch
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
const context = load("./community-context"), refs = load("./community-refs"), time = load("./community-time"), names = load("./community-names");
const siteCore = load("./site-core"), siteAdmin = load("./site-admin"), indexMod = load("./index");

let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let db = freshDb();
let statements = 0;
let BEFORE = null, AFTER = null; // .72: armed by the reader-admission section, each fires once
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const APPLICANT = "300000000000000001", MEMBER = "300000000000000003", SPONSOR = "300000000000000004", STAFF = "472099715253796864", STAFF2 = "472099715253796865", NEVER = "300000000000000099";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, T, T, row.in_server, row.denied, row.session_version);
};
const ON = { COMMUNITY_FEATURES: "trials", SITE_ADMINS: `${STAFF},${STAFF2}` };
// Normal feature requests need a session current to both the actor and the real SQL clock.
// sessionCookie captures expiry before its first await; restore the business clock before signing settles.
const cookieFor = async (id, version = 1) => {
  const actorTime = T;
  let issued;
  try {
    T = Math.max(actorTime, Math.floor(RealDate.now() / 1000));
    issued = siteCore.sessionCookie(env(), id, version);
  } finally {
    T = actorTime;
  }
  return (await issued).split(";")[0];
};
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const iso = (s) => new Date(s * 1000).toISOString();
const OP1 = "A".repeat(22), OP2 = "B".repeat(22), OP3 = "C".repeat(22);

(async () => {
  siteUser(APPLICANT); siteUser(MEMBER, { global_name: "Mia" }); siteUser(SPONSOR, { global_name: "Sam" }); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });
  const due = T + 30 * 86400;

  console.log("\n== flag and gates ==");
  let r = await call("GET", "/api/community/trial/me", MEMBER, undefined, { ...ON, COMMUNITY_FEATURES: "" });
  check("with trials off: 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/community/trial/me", APPLICANT);
  check("a signed-in applicant (no character needed) reads their own trial: none recorded is null, not a refusal", r.status === 200 && r.body.trial === null);
  r = await call("GET", "/api/admin/community/trials", MEMBER);
  check("a member is not staff: 403 from the admin gate", r.status === 403);
  r = await call("GET", "/api/admin/community/trials", STAFF, undefined, { ...ON, COMMUNITY_FEATURES: "" });
  check("  staff with the flag off: 503", r.status === 503);

  console.log("\n== create ==");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP1, discordId: MEMBER, reviewDueAt: iso(due), sponsorDiscordId: SPONSOR });
  check("a SITE_ADMIN (no character of their own) opens a trial; the id is the opId; staff see member, sponsor, dates", r.status === 200 && r.body.trial.id === OP1 && r.body.trial.status === "active" && r.body.trial.discordId === MEMBER && r.body.trial.sponsorDiscordId === SPONSOR && r.body.trial.displayName === "Mia" && r.body.trial.reviewDueAt === iso(due) && r.body.trial.revision === 1, JSON.stringify(r.body).slice(0, 300));
  check("  retention is 30 days after the due date while open; audited with a fixed action and no detail", one("SELECT retain_until FROM community_trials WHERE id = ?", OP1).retain_until === due + 30 * 86400 && one("SELECT details FROM audit WHERE action = 'community.trial_created' AND subject = ?", MEMBER).details === null);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP1, discordId: MEMBER, reviewDueAt: iso(due), sponsorDiscordId: SPONSOR });
  check("the same create retried is a replay", r.status === 200 && r.body.replay === true);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP1, discordId: MEMBER, reviewDueAt: iso(due + 86400) });
  check("  different values under that opId are op_conflict", r.status === 409 && r.body.error === "op_conflict");
  r = await call("POST", "/api/admin/community/trials", STAFF2, { opId: OP1, discordId: MEMBER, reviewDueAt: iso(due), sponsorDiscordId: SPONSOR });
  check("  and so is another admin's use of it", r.status === 409 && r.body.error === "op_conflict");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: MEMBER, reviewDueAt: iso(due) });
  check("a second open trial for the same member is 409 trial_open_exists (the unique open index inside the statement)", r.status === 409 && r.body.error === "trial_open_exists");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: STAFF, reviewDueAt: iso(due) });
  check("a staff member cannot open their own trial: invalid_discord_id", r.status === 400 && r.body.error === "invalid_discord_id");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: SPONSOR, reviewDueAt: iso(due), sponsorDiscordId: SPONSOR });
  check("a sponsor cannot be the member: invalid_sponsor_discord_id", r.status === 400 && r.body.error === "invalid_sponsor_discord_id");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: NEVER, reviewDueAt: iso(due) });
  check("an account that never signed in here: 409 unknown_account, nothing written (the keeper's rule, stated in the header)", r.status === 409 && r.body.error === "unknown_account" && !one("SELECT 1 FROM community_trials WHERE id = ?", OP2));
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: SPONSOR, reviewDueAt: iso(T + 100 * 86400) });
  check("a due date more than 90 days ahead is invalid_review_due_at", r.status === 400 && r.body.error === "invalid_review_due_at");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: SPONSOR, reviewDueAt: iso(T - 10) });
  check("  and one in the past", r.status === 400 && r.body.error === "invalid_review_due_at");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP2, discordId: SPONSOR, reviewDueAt: iso(due + 5 * 86400) });
  check("a second member's trial", r.status === 200 && r.body.trial.sponsorDiscordId === null);

  console.log("\n== the member's own view ==");
  r = await call("GET", "/api/community/trial/me", MEMBER);
  check("the member sees status and dates, never the sponsor, creator or reviewer", r.status === 200 && r.body.trial.status === "active" && r.body.trial.reviewDueAt === iso(due) && !("sponsorDiscordId" in r.body.trial) && !JSON.stringify(r.body).includes(STAFF) && !JSON.stringify(r.body).includes(SPONSOR));

  console.log("\n== the staff list ==");
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("open trials first by due date", r.status === 200 && r.body.trials.length === 2 && r.body.trials[0].id === OP1 && r.body.trials[1].id === OP2 && r.body.nextCursor === null);
  r = await call("GET", "/api/admin/community/trials?status=bogus", STAFF);
  check("an unknown status filter is invalid_status", r.status === 400 && r.body.error === "invalid_status");
  r = await call("GET", "/api/admin/community/trials?cursor=zzz", STAFF);
  check("garbage is invalid_cursor", r.status === 400 && r.body.error === "invalid_cursor");
  const dir = load("./community-directory");
  const cur = await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/trials?cursor=" + dir.encodeCursor([1, "trials", "", 0, due, OP1]), { headers: { Cookie: await cookieFor(STAFF) } }), env(ON), ctx);
  const curB = await cur.json();
  check("a keyset cursor continues after the given row", cur.status === 200 && curB.trials.length === 1 && curB.trials[0].id === OP2);

  console.log("\n== extend and conclude ==");
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 1, action: "extend", reviewDueAt: iso(due - 86400) });
  check("an extension must move the due date later: invalid_review_due_at", r.status === 400 && r.body.error === "invalid_review_due_at");
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 1, action: "extend", reviewDueAt: iso(due + 10 * 86400) });
  check("extend: status extended, due moved, revision 2, retention follows the due date", r.status === 200 && r.body.trial.status === "extended" && r.body.trial.reviewDueAt === iso(due + 10 * 86400) && r.body.trial.revision === 2 && one("SELECT retain_until FROM community_trials WHERE id = ?", OP1).retain_until === due + 10 * 86400 + 30 * 86400);
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 1, action: "conclude", outcome: "passed", reason: "review_passed" });
  check("a stale revision is 409 stale_revision with the trial as it is", r.status === 409 && r.body.error === "stale_revision" && r.body.trial.revision === 2);
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 2, action: "conclude", outcome: "passed", reason: "withdrew" });
  check("passed needs review_passed: invalid_reason", r.status === 400 && r.body.error === "invalid_reason");
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 2, action: "conclude", outcome: "failed", reason: "withdrew" });
  check("an unknown outcome is invalid_outcome", r.status === 400 && r.body.error === "invalid_outcome");
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 2, action: "extend", reviewDueAt: iso(due + 20 * 86400), outcome: "passed" });
  check("an extension with an outcome is invalid_request", r.status === 400 && r.body.error === "invalid_request");
  r = await call("POST", "/api/admin/community/trials/update", STAFF2, { id: OP1, revision: 2, action: "conclude", outcome: "passed", reason: "review_passed" });
  check("conclude: passed, concluded now, revision 3, retention 30 days from now, reviewer recorded, audited with the reason", r.status === 200 && r.body.trial.status === "passed" && r.body.trial.outcome === "passed" && r.body.trial.reason === "review_passed" && r.body.trial.revision === 3 && one("SELECT retain_until, updated_by FROM community_trials WHERE id = ?", OP1).retain_until === T + 30 * 86400 && one("SELECT updated_by FROM community_trials WHERE id = ?", OP1).updated_by === STAFF2 && one("SELECT details FROM audit WHERE action = 'community.trial_passed'").details === '{"reason":"review_passed"}');
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: OP1, revision: 3, action: "conclude", outcome: "ended", reason: "inactive" });
  check("concluding a concluded trial is 409 trial_concluded", r.status === 409 && r.body.error === "trial_concluded");
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: "Z".repeat(22), revision: 1, action: "extend", reviewDueAt: iso(due) });
  check("an unknown trial is 404", r.status === 404);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: OP3, discordId: STAFF2, reviewDueAt: iso(due) });
  check("one admin opens a trial about another admin", r.status === 200);
  r = await call("POST", "/api/admin/community/trials/update", STAFF2, { id: OP3, revision: 1, action: "conclude", outcome: "passed", reason: "review_passed" });
  check("  who cannot review their own: 409 own_record, nothing changed", r.status === 409 && r.body.error === "own_record" && one("SELECT status FROM community_trials WHERE id = ?", OP3).status === "active");
  r = await call("GET", "/api/community/trial/me", MEMBER);
  check("the member now sees the concluded trial (the most recent still kept)", r.body.trial.status === "passed" && r.body.trial.outcome === "passed");
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "D".repeat(22), discordId: MEMBER, reviewDueAt: iso(due) });
  check("a new trial can be opened once the previous one concluded", r.status === 200 && r.body.trial.status === "active");
  r = await call("GET", "/api/admin/community/trials?status=passed", STAFF);
  check("the status filter lists only concluded ones of that kind", r.body.trials.length === 1 && r.body.trials[0].id === OP1);

  console.log("\n== the fence on staff writes ==");
  db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "F".repeat(22), discordId: SPONSOR, reviewDueAt: iso(due) });
  check("an admin who left the server is still SITE_ADMINS, but the fence inside the insert refuses: 403 not_member, nothing written", r.status === 403 && r.body.error === "not_member" && !one("SELECT 1 FROM community_trials WHERE id = ?", "F".repeat(22)));
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: "D".repeat(22), revision: 1, action: "extend", reviewDueAt: iso(due + 86400) });
  check("  and the same fence inside the update: refused, the trial unchanged", r.status === 403 && r.body.error === "not_member" && one("SELECT status, revision FROM community_trials WHERE id = ?", "D".repeat(22)).revision === 1);
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("  the staff LIST is refused to an admin who left the server: communityStaff is required of every community staff route (.66, Codex's .61 review)", r.status === 403 && r.body.error === "not_member" && !("trials" in r.body));
  db.prepare("UPDATE site_users SET in_server = 1, denied = 1 WHERE discord_id = ?").run(STAFF);
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("  and to a denied admin", r.status === 403 && !("trials" in r.body));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(STAFF);
  db.prepare("UPDATE site_users SET in_server = 1 WHERE discord_id = ?").run(STAFF);

  console.log("\n== retain_until is the effective cutoff, by database time (.66, Codex 02:50) ==");
  const trialsMod = load("./community-trials");
  const DTRIAL = "D".repeat(22);
  db.prepare("UPDATE community_trials SET retain_until = ? WHERE id = ?").run(T - 1, DTRIAL);
  r = await call("GET", "/api/community/trial/me", MEMBER);
  check("an open trial past its deadline is gone from the member's own view (the concluded one, still within its lifetime, shows)", r.status === 200 && r.body.trial.status === "passed");
  r = await call("GET", "/api/admin/community/trials?status=active", STAFF);
  check("  and from the staff list", r.status === 200 && r.body.trials.every((t) => t.id !== DTRIAL) && r.body.trials.length === 2, JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: DTRIAL, revision: 1, action: "extend", reviewDueAt: iso(due + 40 * 86400) });
  check("  an extension after the deadline is refused inside the write: 409 trial_expired, no payload, nothing changed (a delayed purge cannot be dodged)", r.status === 409 && r.body.error === "trial_expired" && !("trial" in r.body) && one("SELECT revision FROM community_trials WHERE id = ?", DTRIAL).revision === 1 && one("SELECT retain_until FROM community_trials WHERE id = ?", DTRIAL).retain_until === T - 1);
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: DTRIAL, revision: 1, action: "conclude", outcome: "passed", reason: "review_passed" });
  check("  so is a conclusion", r.status === 409 && r.body.error === "trial_expired");
  check("  the due count ignores it", (await trialsMod.trialsDueCount(env(), due + 20 * 86400)) === 2);
  check("  the account copy omits it", (await context.communityExport(env(), MEMBER)).trials.trials.every((t) => t.status !== "active"));
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "G".repeat(22), discordId: MEMBER, reviewDueAt: iso(due) });
  check("an expired open trial does not block a new one: one-open-trial is judged inside the insert at database time", r.status === 200 && r.body.trial.status === "active", JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "H".repeat(22), discordId: MEMBER, reviewDueAt: iso(due) });
  check("  while a live open trial still does: trial_open_exists", r.status === 409 && r.body.error === "trial_open_exists");
  const sw = await trialsMod.sweepCommunityTrials(env(), T);
  check("the bounded purge removes the expired row and reports the remaining backlog", sw.deleted === 1 && sw.remaining === 0 && !one("SELECT 1 FROM community_trials WHERE id = ?", DTRIAL) && JSON.parse(one("SELECT details FROM audit WHERE action = 'community.trials_expired' ORDER BY id DESC LIMIT 1").details).remaining === 0);

  console.log("\n== erasure, export, retention ==");
  const exported = await context.communityExport(env(), MEMBER);
  check("the account copy lists the member's trials without sponsor or staff", exported.trials.trials.length === 2 && exported.trials.trials.every((t) => !("sponsorDiscordId" in t)) && exported.trials.trials[0].outcome === "passed");
  await siteAdmin.deleteSiteData(env(), SPONSOR, STAFF);
  check("erasing the sponsor anonymizes them on the member's trial and removes their own", one("SELECT sponsor_discord_id FROM community_trials WHERE id = ?", OP1).sponsor_discord_id === null && !one("SELECT 1 FROM community_trials WHERE id = ?", OP2));
  await siteAdmin.deleteSiteData(env(), STAFF2, STAFF);
  check("erasing a reviewer clears them as updated_by; the trial about them is gone with them", one("SELECT updated_by FROM community_trials WHERE id = ?", OP1).updated_by === null && !one("SELECT 1 FROM community_trials WHERE id = ?", OP3));
  await siteAdmin.deleteSiteData(env(), MEMBER, STAFF);
  check("erasing the member removes their trials", !one("SELECT 1 FROM community_trials WHERE discord_id = ?", MEMBER));
  siteUser(MEMBER, { global_name: "Mia" });
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "E".repeat(22), discordId: MEMBER, reviewDueAt: iso(due) });
  T = due + 31 * 86400;
  const swept = await trialsMod.sweepCommunityTrials(env());
  check("an open trial 31 days past its due date is swept, audited as a count", swept.deleted === 1 && swept.remaining === 0 && !one("SELECT 1 FROM community_trials WHERE id = ?", "E".repeat(22)) && !!one("SELECT 1 FROM audit WHERE action = 'community.trials_expired'"));
  check("trialsDueCount counts open trials whose review is due", (await trialsMod.trialsDueCount(env())) === 0);

  console.log("\n== uniform reader admission on every payload (.72, Codex's final trial reader review, 03:55) ==");
  // BEFORE(i) changes the facts between the context read and payload batch i; AFTER(i) right after batch i committed
  const RAE = "300000000000000061";
  siteUser(RAE, { global_name: "Rae" });
  const denyStaff = () => db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  const restoreStaff = () => db.prepare("UPDATE site_users SET denied = 0, in_server = 1, session_version = 1 WHERE discord_id = ?").run(STAFF);
  const RT = "R".repeat(22);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: RT, discordId: MEMBER, reviewDueAt: iso(T + 20 * 86400) });
  check("(fixture) an open trial", r.status === 200 && r.body.trial.revision === 1, JSON.stringify(r.body).slice(0, 200));
  BEFORE = (i) => { if (i === 1) { BEFORE = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: RT, revision: 1, action: "extend", reviewDueAt: iso(T + 40 * 86400) });
  check("EARLY: an admin denied between the context read and the pre-write read is refused there: 403 denied, no trial in the answer, nothing written", r.status === 403 && r.body.error === "denied" && !("trial" in r.body) && one("SELECT revision FROM community_trials WHERE id = ?", RT).revision === 1, JSON.stringify(r.body).slice(0, 200));
  restoreStaff();
  AFTER = (i) => { if (i === 1) db.prepare("UPDATE community_trials SET revision = revision + 1 WHERE id = ?").run(RT); if (i === 2) { AFTER = null; db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF); } };
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: RT, revision: 1, action: "extend", reviewDueAt: iso(T + 40 * 86400) });
  check("LOST CAS: another change lands after the pre-write read, the write is refused at its compare-and-set and the admin leaves the server before the fallback read: 403 not_member, no trial payload, nothing written", r.status === 403 && r.body.error === "not_member" && !("trial" in r.body) && one("SELECT status FROM community_trials WHERE id = ?", RT).status === "active", JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_trials SET revision = 1 WHERE id = ?").run(RT);
  restoreStaff();
  AFTER = (i) => { if (i === 1) { AFTER = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: RT, discordId: MEMBER, reviewDueAt: iso(T + 20 * 86400) });
  check("REPLAY: a retried create whose admin is denied right after the no-op write batch: 403 denied, no replay payload", r.status === 403 && r.body.error === "denied" && !("trial" in r.body) && !("replay" in r.body), JSON.stringify(r.body).slice(0, 200));
  restoreStaff();
  AFTER = (i) => { if (i === 2) { AFTER = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/trials/update", STAFF, { id: RT, revision: 1, action: "extend", reviewDueAt: iso(T + 40 * 86400) });
  check("AFTER SUCCESS: an extension committed, then the admin denied: the answer is the row the write's own batch read (the accepted atomic snapshot) and the write stands", r.status === 200 && r.body.trial.status === "extended" && r.body.trial.revision === 2 && one("SELECT status FROM community_trials WHERE id = ?", RT).status === "extended", JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("  while the next read, newly unauthorized, is refused", r.status === 403 && !("trials" in r.body));
  restoreStaff();
  AFTER = (i) => { if (i === 1) { AFTER = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "S".repeat(22), discordId: RAE, reviewDueAt: iso(T + 20 * 86400) });
  check("  a create committed, then the admin denied: acknowledged with the row its own batch wrote", r.status === 200 && r.body.trial.id === "S".repeat(22) && !!one("SELECT 1 FROM community_trials WHERE id = ?", "S".repeat(22)), JSON.stringify(r.body).slice(0, 200));
  restoreStaff();
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(STAFF); } };
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("the staff list: signed out everywhere between the context read and the payload batch: 401 signed_out, no payload", r.status === 401 && r.body.error === "signed_out" && !("trials" in r.body));
  restoreStaff();
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(MEMBER); } };
  r = await call("GET", "/api/community/trial/me", MEMBER);
  check("the member's own view: denied between the context read and the payload batch: 403, no payload", r.status === 403 && !("trial" in r.body));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(MEMBER);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("DELETE FROM site_users WHERE discord_id = ?").run(STAFF); } };
  r = await call("GET", "/api/admin/community/trials", STAFF);
  check("  the reader's row removed before the payload batch: 401, no payload", r.status === 401 && !("trials" in r.body));
  siteUser(STAFF, { global_name: "Vik" });
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

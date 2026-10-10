// Build .69 (1 Oct 2026): restriction cases, their watch-list and the return review (consolidation batch 4b, first half),
// through the REAL src/*.ts against the REAL schema in SQLite; Discord's HTTP side is stubbed. Covers the flag and the
// staff gates, create (validation, replay, case_conflict, never one's own), the staff list, review continued/lifted,
// appeals (requested, upheld, overturned), the return acknowledgement with its exact token, stale/own_record/resolved
// refusals, the watch-list (exact keeper provenance, the member-level period: opened once, siblings share it, ended means
// renewal_required, renewal with a reason, removal, the period going with the last unresolved case, a later case opening
// a fresh one), the return review (same-account sign-in; another account holding a watched character by GUID or by name;
// the case member excluded), erasure (member: acknowledgement cleared, inactive rows gone, active case kept; staff:
// anonymized), the account copy, and the unconditional purge. Nothing here touches a role.
// Run from the worker folder:  node tests/community_restrictions_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
  let batches = 0; // .73: numbered per request, for the beforeBatch/afterBatch hooks
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
      run: async () => { hooks.count?.(); hooks.beforeRun?.(sql); return exec(sql, params); },
      _exec: () => { hooks.beforeRun?.(sql); return exec(sql, params); },
      _sql: sql,
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      hooks.count?.();
      // Native admission wraps individual reads too; numbered races still target the original multi-statement payload.
      const logical = !(stmts.length === 2 && stmts[0]._sql.includes("privacy_site_request_refused"));
      if (logical) hooks.beforeBatch?.(++batches);
      db.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
      if (logical) hooks.afterBatch?.(batches);
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
let BEFORE = null, AFTER = null, RUN = null; // .73: armed by a test, each fires once
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i), beforeRun: (sql) => RUN?.(sql) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", OTHER = "300000000000000004", STAFF = "472099715253796864", STAFF2 = "472099715253796865", APPLICANT = "300000000000000001";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const character = (id, name, status = "member", guid = null) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?, ?, ?, ?, ?, ?)").run(name.toLowerCase().split("-")[0], name, id, status, T, guid);
};
const ON = { COMMUNITY_FEATURES: "restrictions", SITE_ADMINS: `${STAFF},${STAFF2}` };
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
const C1 = "A".repeat(22), C2 = "B".repeat(22), C3 = "C".repeat(22), C4 = "D".repeat(22);
const act = (body, who = STAFF) => call("POST", "/api/admin/community/restrictions", who, body);

// .133: construct an original signed staff Request before the real site-only eraser consumes it.
// Both clocks make this explicit test session valid when the suite freezes or advances its business clock.
async function erasureRequest(target, actor) {
  const site = load("./site-core");
  const version = db.prepare("SELECT session_version FROM site_users WHERE discord_id = ?").get(actor)?.session_version ?? 1;
  const expiry = Math.max(Math.floor(Date.now() / 1000), db.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) AS clock").get().clock) + 3600;
  const body = site.b64u(new TextEncoder().encode(JSON.stringify({ u: actor, v: version, e: expiry })));
  const mac = await site.sign(env().COOKIE_SECRET, "session", body);
  return new Request("https://guild.example/api/admin/users/" + target + "/delete", {
    method: "POST", headers: { Cookie: "__Host-olg=" + body + "." + mac, Origin: "https://guild.example", "X-Olympus": "2" },
  });
}

(async () => {
  siteUser(APPLICANT); siteUser(MEMBER, { global_name: "Mia" }); siteUser(OTHER, { global_name: "Oz" }); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });
  character(MEMBER, "Mia One", "member", "Player-1-0001"); character(MEMBER, "Mia Two", "member", "Player-1-0002"); character(MEMBER, "Mia Gone", "unbound");
  const review = T + 30 * 86400, expiry = T + 180 * 86400;

  console.log("\n== flag and gates ==");
  let r = await call("GET", "/api/admin/community/restrictions", STAFF, undefined, { ...ON, COMMUNITY_FEATURES: "" });
  check("with restrictions off: 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/admin/community/restrictions", MEMBER);
  check("a member is not staff: 403 from the admin gate", r.status === 403);
  r = await call("GET", "/api/admin/community/return-review", MEMBER);
  check("  the return review too", r.status === 403);

  console.log("\n== create ==");
  r = await act({ action: "create", caseId: C1, discordId: MEMBER, category: "conduct_removal", reviewAt: iso(review), expiresAt: iso(expiry) });
  check("a SITE_ADMIN opens a conduct_removal case: the id is the opId, dates ISO, an opaque incarnation.revision token, active, no characters", r.status === 200 && r.body.ok === true && r.body.case.caseId === C1 && r.body.case.active === true && r.body.case.expiresAt === iso(expiry) && /^[A-Za-z0-9_-]{22}\.1$/.test(r.body.case.revision) && r.body.case.characters.length === 0 && r.body.case.setBy === STAFF && r.body.case.displayName === "Mia", JSON.stringify(r.body).slice(0, 300));
  const tok1 = r.body.case.revision;
  check("  audited with the category only", one("SELECT details FROM audit WHERE action = 'community.restriction_set' AND subject = ?", MEMBER).details === '{"category":"conduct_removal"}');
  check("  nothing touched a role or a member row", !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'") && one("SELECT banned FROM members WHERE discord_id = ?", MEMBER).banned === 0);
  r = await act({ action: "create", caseId: C1, discordId: MEMBER, category: "conduct_removal", reviewAt: iso(review), expiresAt: iso(expiry) });
  check("the same create retried is a replay", r.status === 200 && r.body.replay === true);
  r = await act({ action: "create", caseId: C1, discordId: MEMBER, category: "ban", reviewAt: iso(review), expiresAt: null });
  check("  different values under that opId are 409 case_conflict", r.status === 409 && r.body.error === "case_conflict");
  r = await act({ action: "create", caseId: C2, discordId: STAFF, category: "ban", reviewAt: iso(review), expiresAt: null });
  check("a staff member cannot open a case about themselves", r.status === 400);
  r = await act({ action: "create", caseId: C2, discordId: OTHER, category: "ban", reviewAt: iso(review), expiresAt: iso(expiry) });
  check("a ban with an expiry is invalid_expiry", r.status === 400 && r.body.error === "invalid_expiry");
  r = await act({ action: "create", caseId: C2, discordId: OTHER, category: "conduct_removal", reviewAt: iso(T + 400 * 86400), expiresAt: iso(T + 500 * 86400) });
  check("a review more than 365 days ahead is invalid_review_date", r.status === 400 && r.body.error === "invalid_review_date");
  r = await act({ action: "create", caseId: C2, discordId: OTHER, category: "tithe_removal", reviewAt: iso(review), expiresAt: iso(T + 800 * 86400) });
  check("an expiry more than 730 days ahead is invalid_expiry", r.status === 400 && r.body.error === "invalid_expiry");
  r = await act({ action: "create", caseId: C2, discordId: OTHER, category: "ban", reviewAt: iso(review), expiresAt: null });
  check("a ban about another account: no expiry, a review date, retain_until NULL while unresolved", r.status === 200 && r.body.case.expiresAt === null && one("SELECT retain_until FROM community_restriction_cases WHERE id = ?", C2).retain_until === null);
  const tok2 = r.body.case.revision;
  r = await call("GET", "/api/admin/community/restrictions", STAFF);
  check("the staff list: every active case by review date", r.status === 200 && r.body.cases.length === 2 && r.body.cases.map((c) => c.caseId).join() === [C1, C2].join() && r.body.truncated === false);
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  check("  or one member's cases", r.body.cases.length === 1 && r.body.cases[0].caseId === C1);

  console.log("\n== review, appeal, return ==");
  r = await act({ action: "review", outcome: "continued", caseId: C1, expectedRevision: tok1, nextReviewAt: iso(T + 200 * 86400) });
  check("a review date after a removal's expiry is invalid_review_date", r.status === 400 && r.body.error === "invalid_review_date" || (r.status === 409 && r.body.error === "not_applicable"), JSON.stringify(r.body).slice(0, 120));
  r = await act({ action: "review", outcome: "continued", caseId: C1, expectedRevision: tok1, nextReviewAt: iso(T + 60 * 86400) });
  check("review continued: a new review date, revision moved, audited", r.status === 200 && r.body.case.reviewOutcome === "continued" && r.body.case.reviewAt === iso(T + 60 * 86400) && r.body.case.revision.endsWith(".2") && !!one("SELECT 1 FROM audit WHERE action = 'community.restriction_review_continued'"));
  r = await act({ action: "review", outcome: "continued", caseId: C1, expectedRevision: tok1, nextReviewAt: iso(T + 70 * 86400) });
  check("a stale token is 409 stale with the case as it is", r.status === 409 && r.body.error === "stale" && r.body.case.revision.endsWith(".2"));
  let tokC1 = r.body.case.revision;
  r = await act({ action: "acknowledge", caseId: C1, expectedRevision: tokC1, returnToken: `${T}.${T}` });
  check("a return cannot be acknowledged before the member signed in again: 409 not_applicable (no return)", r.status === 409 && r.body.error === "not_applicable" && r.body.case.returnToken === null);
  db.prepare("UPDATE site_users SET last_login = ? WHERE discord_id = ?").run(T + 5 * 86400, MEMBER);
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  check("after the member signs in again the case shows the return and its exact token (account as created . last sign-in)", r.body.cases[0].returnedAt === iso(T + 5 * 86400) && r.body.cases[0].returnToken === `${T}.${T + 5 * 86400}`);
  const retTok = r.body.cases[0].returnToken;
  r = await act({ action: "acknowledge", caseId: C1, expectedRevision: tokC1, returnToken: `${T}.${T + 4 * 86400}` });
  check("  a token naming another sign-in is not_applicable", r.status === 409 && r.body.error === "not_applicable");
  r = await act({ action: "acknowledge", caseId: C1, expectedRevision: tokC1, returnToken: retTok });
  check("  the exact return is acknowledged: a record, nothing else (the case stays active, no role touched)", r.status === 200 && r.body.case.acknowledgedAt === iso(T) && r.body.case.active === true && !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'"));
  tokC1 = r.body.case.revision;
  r = await act({ action: "appeal", appealStatus: "upheld", caseId: C2, expectedRevision: tok2 });
  check("an appeal cannot be upheld before it was requested: not_applicable", r.status === 409 && r.body.error === "not_applicable");
  r = await act({ action: "appeal", appealStatus: "requested", caseId: C2, expectedRevision: tok2 });
  check("appeal requested", r.status === 200 && r.body.case.appealStatus === "requested");
  r = await act({ action: "appeal", appealStatus: "upheld", caseId: C2, expectedRevision: r.body.case.revision });
  check("  upheld", r.status === 200 && r.body.case.appealStatus === "upheld" && r.body.case.active === true);
  r = await act({ action: "appeal", appealStatus: "requested", caseId: C2, expectedRevision: r.body.case.revision });
  r = await act({ action: "appeal", appealStatus: "overturned", caseId: C2, expectedRevision: r.body.case.revision });
  check("  requested again and overturned: resolved, kept 30 days", r.status === 200 && r.body.case.appealStatus === "overturned" && r.body.case.active === false && r.body.case.resolvedAt === iso(T) && one("SELECT retain_until FROM community_restriction_cases WHERE id = ?", C2).retain_until === T + 30 * 86400);
  r = await act({ action: "appeal", appealStatus: "requested", caseId: C2, expectedRevision: r.body.case.revision });
  check("  a resolved case takes no more changes: 409 case_resolved", r.status === 409 && r.body.error === "case_resolved");
  r = await act({ action: "create", caseId: C3, discordId: STAFF2, category: "ban", reviewAt: iso(review), expiresAt: null });
  r = await act({ action: "review", outcome: "lifted", caseId: C3, expectedRevision: r.body.case.revision }, STAFF2);
  check("a staff member never changes a case about themselves: 409 own_record", r.status === 409 && r.body.error === "own_record");

  console.log("\n== the watch-list and the member-level period ==");
  r = await act({ action: "add_characters", caseId: C1, expectedRevision: tokC1 });
  check("add_characters copies the member's bound characters from the keeper's own table with exact provenance (proof key, name, pinned GUID); the unbound one is not evidence", r.status === 200 && r.body.case.characters.length === 2 && r.body.case.characters.map((c) => c.name).join() === "Mia One,Mia Two" && r.body.case.characters.every((c) => c.proof.guidPinned === true && c.proof.nameKey === c.name.toLowerCase()), JSON.stringify(r.body.case.characters).slice(0, 300));
  check("  the member's period opened: 12 months from now; the rows expire at the period's end capped at the case's expiry (180 days), review in 90", one("SELECT retain_until FROM community_restriction_periods WHERE discord_id = ?", MEMBER).retain_until === T + 365 * 86400 && r.body.case.characters[0].expiresAt === iso(expiry) && r.body.case.characters[0].reviewAt === iso(T + 90 * 86400) && r.body.case.charactersRetainUntil === iso(T + 365 * 86400) && r.body.case.charactersRenewalRequired === false);
  check("  audited as a count, never a name", one("SELECT details FROM audit WHERE action = 'community.restriction_watch_added'").details === '{"category":"conduct_removal","count":2}');
  tokC1 = r.body.case.revision;
  r = await act({ action: "add_characters", caseId: C1, expectedRevision: tokC1 });
  check("adding again with nothing new is 409 no_new_characters", r.status === 409 && r.body.error === "no_new_characters");
  r = await act({ action: "remove_character", caseId: C1, expectedRevision: tokC1, key: "mia two" });
  check("remove_character drops one row; the period is untouched", r.status === 200 && r.body.case.characters.length === 1 && one("SELECT retain_until FROM community_restriction_periods WHERE discord_id = ?", MEMBER).retain_until === T + 365 * 86400);
  tokC1 = r.body.case.revision;
  r = await act({ action: "add_characters", caseId: C1, expectedRevision: tokC1 });
  check("  adding it back expires it at the SAME period deadline: no fresh clock from a remove-and-add", r.status === 200 && r.body.case.characters.length === 2 && r.body.case.characters.every((c) => c.expiresAt === iso(expiry)));
  tokC1 = r.body.case.revision;
  // a sibling case for the same member (a ban): its rows share the member's period, capped at nothing (a ban has no expiry)
  r = await act({ action: "create", caseId: C4, discordId: MEMBER, category: "ban", reviewAt: iso(review), expiresAt: null });
  let tokC4 = r.body.case.revision;
  r = await act({ action: "add_characters", caseId: C4, expectedRevision: tokC4 });
  check("a sibling case's rows expire at the member's existing period deadline (12 months from the FIRST addition), never a fresh 12 months", r.status === 200 && r.body.case.characters.every((c) => c.expiresAt === iso(T + 365 * 86400)) && one("SELECT COUNT(*) AS n FROM community_restriction_periods").n === 1);
  tokC4 = r.body.case.revision;
  r = await act({ action: "renew_characters", caseId: C4, expectedRevision: tokC4, reason: "ongoing_risk" });
  T += 10;
  check("a documented renewal moves the member's period and the case's live rows, with the reason", r.status === 200 && r.body.case.characters.every((c) => c.renewalReason === "ongoing_risk" && c.expiresAt === iso(T - 10 + 365 * 86400)) && one("SELECT renewal_reason FROM community_restriction_periods WHERE discord_id = ?", MEMBER).renewal_reason === "ongoing_risk");
  tokC4 = r.body.case.revision;
  r = await act({ action: "renew_characters", caseId: C4, expectedRevision: tokC4, reason: "whatever" });
  check("  an unknown reason is invalid_reason", r.status === 400 && r.body.error === "invalid_reason");
  db.prepare("UPDATE community_restriction_periods SET retain_until = ? WHERE discord_id = ?").run(T - 1, MEMBER);
  r = await act({ action: "add_characters", caseId: C1, expectedRevision: tokC1 });
  check("once the member's period has ended an addition on ANY of their cases is 409 renewal_required, with the flag in the view", r.status === 409 && r.body.error === "renewal_required" && r.body.case.charactersRenewalRequired === true && r.body.case.charactersRetainUntil === null);
  r = await act({ action: "renew_characters", caseId: C1, expectedRevision: tokC1, reason: "repeat_return" });
  check("  a renewal with a reason opens the next period", r.status === 200 && r.body.case.charactersRenewalRequired === false && one("SELECT retain_until FROM community_restriction_periods WHERE discord_id = ?", MEMBER).retain_until === T + 365 * 86400);
  tokC1 = r.body.case.revision;
  r = await act({ action: "review", outcome: "lifted", caseId: C1, expectedRevision: tokC1 });
  check("lifting a case deletes its rows; the member's period stays while a sibling case is unresolved", r.status === 200 && r.body.case.active === false && r.body.case.characters.length === 0 && !one("SELECT 1 FROM community_restriction_characters WHERE case_id = ?", C1) && !!one("SELECT 1 FROM community_restriction_periods WHERE discord_id = ?", MEMBER));
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  tokC4 = r.body.cases.find((c) => c.caseId === C4).revision;

  console.log("\n== the return review ==");
  siteUser("300000000000000050", { global_name: "Twin" }); character("300000000000000050", "Mia-Twin", "verified", "Player-1-0001"); // another account bound to the same GUID (a rename: name key differs)
  // the keeper later re-bound the character "Mia Two" to another account (a new GUID: a different character under the old name): a name-key match
  siteUser("300000000000000051", { global_name: "Namesake" }); db.prepare("INSERT INTO members (discord_id) VALUES ('300000000000000051')").run();
  db.prepare("UPDATE characters SET discord_id = '300000000000000051', guid = 'Player-9-0002' WHERE name_key = 'mia two'").run();
  db.prepare("UPDATE site_users SET last_login = ? WHERE discord_id IN ('300000000000000050', '300000000000000051')").run(T + 86400);
  r = await call("GET", "/api/admin/community/return-review", STAFF);
  const twin = r.body.members.find((m) => m.discordId === "300000000000000050"), mia = r.body.members.find((m) => m.discordId === MEMBER);
  check("the member who signed in after their active ban was set is listed with a `restriction` reason", r.status === 200 && mia && mia.reasons.some((x) => x.kind === "restriction" && x.caseId === C4 && x.category === "ban"), JSON.stringify(r.body).slice(0, 400));
  check("another account bound in the keeper to a watched character's GUID, signed in after the addition, is `watched_character` evidence by guid", twin && twin.reasons.some((x) => x.kind === "watched_character" && x.by === "guid" && x.characterName === "Mia One" && x.caseId === C4), JSON.stringify(twin));
  const namesake = r.body.members.find((m) => m.discordId === "300000000000000051");
  check("  an account the keeper later bound the watched NAME to (another GUID) is evidence by name, with that provenance stated", namesake && namesake.reasons.some((x) => x.kind === "watched_character" && x.by === "name" && x.characterName === "Mia Two"), JSON.stringify(namesake));
  check("  the case member's own account is never listed as a watched holder; the lifted case contributes nothing; evidence only", !mia.reasons.some((x) => x.kind === "watched_character") && !r.body.members.some((m) => m.reasons.some((x) => x.caseId === C1)) && r.body.evidence === "same_discord_login_after_restriction" && r.body.watchList === "complete");
  db.prepare("UPDATE site_users SET last_login = ? WHERE discord_id = '300000000000000050'").run(T - 50);
  r = await call("GET", "/api/admin/community/return-review", STAFF);
  check("  a holder who has not signed in since the addition is not evidence", !r.body.members.some((m) => m.discordId === "300000000000000050"));

  console.log("\n== erasure, export, purge ==");
  const exported = await context.communityExport(env(), MEMBER);
  check("the account copy lists the member's cases (dates, outcomes, no staff), their watch-list rows and the period", exported.restrictions.cases.length === 2 && exported.restrictions.cases.every((c) => !("setBy" in c)) && exported.restrictions.watchList.length === 2 && exported.restrictions.watchListPeriod && !JSON.stringify(exported.restrictions).includes(STAFF), JSON.stringify(exported.restrictions).slice(0, 300));
  await siteAdmin.deleteSiteData(env(ON), STAFF, STAFF2, false, await erasureRequest(STAFF, STAFF2));
  check("erasing the staff member who set the cases anonymizes them: setBy null in the view, 'erased' stored", one("SELECT set_by FROM community_restriction_cases WHERE id = ?", C4).set_by === "erased" && !one("SELECT 1 FROM community_restriction_characters WHERE added_by = ?", STAFF));
  siteUser(STAFF, { global_name: "Vik" });
  check("(the lifted case still carries the acknowledgement the officer recorded)", one("SELECT acknowledged_at FROM community_restriction_cases WHERE id = ?", C1).acknowledged_at !== null);
  await siteAdmin.deleteSiteData(env(), MEMBER, STAFF, false, await erasureRequest(MEMBER, STAFF));
  check("erasing the member (.73, the selected contract) deletes their INACTIVE case (C1, lifted) with its rows, keeps the active ban case with its rows (the one case-bound exception) and the period while that case is unresolved; another member's resolved case (C2) is untouched", !one("SELECT 1 FROM community_restriction_cases WHERE id = ?", C1) && !!one("SELECT 1 FROM community_restriction_cases WHERE id = ?", C2) && !!one("SELECT 1 FROM community_restriction_cases WHERE id = ?", C4) && one("SELECT COUNT(*) AS n FROM community_restriction_characters WHERE case_id = ?", C4).n === 2 && !!one("SELECT 1 FROM community_restriction_periods WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM site_users WHERE discord_id = ?", MEMBER));
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  check("  staff still see the case, with no display name and no return", r.body.cases.find((c) => c.caseId === C4).displayName === null && r.body.cases.find((c) => c.caseId === C4).returnToken === null);
  const restrictionsMod = load("./community-restrictions");
  let sw = await restrictionsMod.sweepCommunityRestrictions(env(), T + 31 * 86400);
  check("the purge removes the resolved case 30 days on (C2 overturned; C1 went with its member's erasure) and nothing else yet", sw.cases === 1 && !one("SELECT 1 FROM community_restriction_cases WHERE id IN (?, ?)", C1, C2) && !!one("SELECT 1 FROM community_restriction_cases WHERE id = ?", C4) && sw.periods === 0);
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  tokC4 = r.body.cases[0].revision;
  r = await act({ action: "review", outcome: "lifted", caseId: C4, expectedRevision: tokC4 });
  check("lifting the member's last unresolved case takes their period with it (the later-case rule)", r.status === 200 && !one("SELECT 1 FROM community_restriction_periods WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_restriction_characters WHERE case_id = ?", C4));
  siteUser(MEMBER, { global_name: "Mia" });
  r = await act({ action: "create", caseId: "E".repeat(22), discordId: MEMBER, category: "conduct_removal", reviewAt: iso(T + 100 * 86400), expiresAt: iso(T + 400 * 86400) });
  r = await act({ action: "add_characters", caseId: "E".repeat(22), expectedRevision: r.body.case.revision });
  check("a case opened later, with no other case in play, opens a fresh period (12 months from now)", r.status === 200 && one("SELECT retain_until FROM community_restriction_periods WHERE discord_id = ?", MEMBER).retain_until === T + 365 * 86400, JSON.stringify(r.body).slice(0, 200));
  sw = await restrictionsMod.sweepCommunityRestrictions(env({ COMMUNITY_FEATURES: "" }), T + 366 * 86400);
  check("the purge runs with the flag off: the expired watch-list row goes (the case is still active), audited as counts", sw.rows === 1 && !!one("SELECT 1 FROM community_restriction_cases WHERE id = ?", "E".repeat(22)) && !!one("SELECT 1 FROM audit WHERE action = 'community.restrictions_expired'"));

  console.log("\n== .73: the keeper's facts at the first statement, the period by the database clock, the effective cutoff ==");
  // BEFORE(i) changes the facts between the context read and payload batch i; AFTER(i) right after batch i committed
  const RM2 = "300000000000000070", F = "F".repeat(22), G = "G".repeat(22);
  siteUser(RM2, { global_name: "Rae" }); character(RM2, "Rae One", "member", "Player-1-0070"); character(RM2, "Rae Two", "verified", "Player-1-0071");
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(OTHER); // a transfer target for the keeper's row
  r = await act({ action: "create", caseId: F, discordId: RM2, category: "conduct_removal", reviewAt: iso(review), expiresAt: iso(expiry) });
  check("(fixture) a conduct_removal case about a new member", r.status === 200 && r.body.case.characters.length === 0);
  let tokF = r.body.case.revision;
  // the window is between the keeper read (provenCharacters, after the admitted case read) and the write batch (batch 2)
  BEFORE = (i) => { if (i === 2) { BEFORE = null; db.prepare("UPDATE characters SET discord_id = ? WHERE name = 'Rae Two'").run(OTHER); } };
  r = await act({ action: "add_characters", caseId: F, expectedRevision: tokF });
  check("add_characters: a pinned character transferred to another account between the keeper read and the write is refused AT the first statement (409 binding_changed): no row, no period, the case unchanged", r.status === 409 && r.body.error === "binding_changed" && r.body.case.characters.length === 0 && !one("SELECT 1 FROM community_restriction_characters WHERE case_id = ?", F) && !one("SELECT 1 FROM community_restriction_periods WHERE discord_id = ?", RM2) && r.body.case.revision === tokF, JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE characters SET discord_id = ? WHERE name = 'Rae Two'").run(RM2);
  BEFORE = (i) => { if (i === 2) { BEFORE = null; db.prepare("UPDATE characters SET guid = 'Player-9-0071' WHERE name = 'Rae Two'").run(); } };
  r = await act({ action: "add_characters", caseId: F, expectedRevision: tokF });
  check("  so is a GUID that changed under the same name (the pinned GUID is the evidence)", r.status === 409 && r.body.error === "binding_changed" && !one("SELECT 1 FROM community_restriction_characters WHERE case_id = ?", F));
  r = await act({ action: "add_characters", caseId: F, expectedRevision: tokF });
  check("  with the facts unchanged the addition is admitted with exact provenance; the period opens", r.status === 200 && r.body.case.characters.length === 2 && r.body.case.characters.find((c) => c.name === "Rae Two").proof.guidPinned === true && one("SELECT retain_until FROM community_restriction_periods WHERE discord_id = ?", RM2).retain_until === T + 365 * 86400, JSON.stringify(r.body).slice(0, 200));
  tokF = r.body.case.revision;
  r = await act({ action: "remove_character", caseId: F, expectedRevision: tokF, key: "rae two" });
  tokF = r.body.case.revision;
  // the member's period is open by this process's clock (T + 1 day) but has ENDED by the database's own clock (the real one)
  db.prepare("UPDATE community_restriction_periods SET retain_until = ? WHERE discord_id = ?").run(T + 86400, RM2);
  r = await act({ action: "add_characters", caseId: F, expectedRevision: tokF });
  check("a period that has ended by the DATABASE clock admits no addition: 409 renewal_required with the flag in the view (judged in SQL, not from a captured time)", r.status === 409 && r.body.error === "renewal_required" && r.body.case.charactersRenewalRequired === true && one("SELECT COUNT(*) AS n FROM community_restriction_characters WHERE case_id = ?", F).n === 1, JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_restriction_periods SET retain_until = ? WHERE discord_id = ?").run(T + 365 * 86400, RM2);
  BEFORE = (i) => { if (i === 2) { BEFORE = null; db.prepare("UPDATE community_restriction_periods SET retain_until = ? WHERE discord_id = ?").run(T + 86400, RM2); } };
  r = await act({ action: "add_characters", caseId: F, expectedRevision: tokF });
  check("  a period that ends between the read and the write is refused by the period pin (open by the database clock, not equality alone): renewal_required, nothing written", r.status === 409 && r.body.error === "renewal_required" && one("SELECT COUNT(*) AS n FROM community_restriction_characters WHERE case_id = ?", F).n === 1, JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_restriction_periods SET retain_until = ? WHERE discord_id = ?").run(T + 365 * 86400, RM2);
  // the effective cutoff: a finite case whose expiry (= retain_until) has passed by the database clock, not yet purged
  r = await act({ action: "create", caseId: G, discordId: RM2, category: "tithe_removal", reviewAt: iso(T + 10 * 86400), expiresAt: iso(T + 20 * 86400) });
  const tokG = r.body.case.revision;
  db.prepare("UPDATE community_restriction_cases SET expires_at = ?, retain_until = ? WHERE id = ?").run(T + 86400, T + 86400, G);
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + RM2, STAFF);
  check("a finite case past its deadline by the database clock is gone from the member's list", r.status === 200 && r.body.cases.every((c) => c.caseId !== G) && r.body.cases.some((c) => c.caseId === F));
  r = await call("GET", "/api/admin/community/restrictions", STAFF);
  check("  and from the active list", r.body.cases.every((c) => c.caseId !== G));
  r = await act({ action: "review", outcome: "lifted", caseId: G, expectedRevision: tokG });
  check("  a lift after the deadline is 404 case_not_found: the 30-day clock is not restarted, the row unchanged", r.status === 404 && r.body.error === "case_not_found" && one("SELECT retain_until, resolved_at FROM community_restriction_cases WHERE id = ?", G).retain_until === T + 86400 && one("SELECT resolved_at FROM community_restriction_cases WHERE id = ?", G).resolved_at === null);
  r = await act({ action: "appeal", appealStatus: "requested", caseId: G, expectedRevision: tokG });
  check("  so is an appeal", r.status === 404);
  r = await act({ action: "create", caseId: G, discordId: RM2, category: "tithe_removal", reviewAt: iso(T + 10 * 86400), expiresAt: iso(T + 20 * 86400) });
  check("  a retried create under that id is 409 case_conflict, never a replay of an expired case", r.status === 409 && r.body.error === "case_conflict" && !("case" in r.body));
  check("  the account copy omits it and keeps the live case", (await context.communityExport(env(), RM2)).restrictions.cases.length === 1);
  // the staff list's continuation
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + RM2, STAFF);
  const listed = r.body.cases;
  const cur = await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/restrictions?discordId=" + RM2 + "&cursor=" + load("./community-directory").encodeCursor([1, "restrictions", RM2, Math.floor(new Date(listed[0].setAt).getTime() / 1000), listed[0].caseId]), { headers: { Cookie: await cookieFor(STAFF) } }), env(ON), ctx);
  const curB = await cur.json();
  check("a keyset cursor continues the member's list after the given case (nothing left here); nextCursor is null on the last page", cur.status === 200 && curB.cases.length === 0 && curB.nextCursor === null && r.body.nextCursor === null && r.body.truncated === false, JSON.stringify(curB).slice(0, 200));
  const bad1 = await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/restrictions?cursor=" + load("./community-directory").encodeCursor([1, "restrictions", RM2, T, F]), { headers: { Cookie: await cookieFor(STAFF) } }), env(ON), ctx);
  check("  a cursor from another scope (a member's list used on the active list) is invalid_cursor", bad1.status === 400 && (await bad1.json()).error === "invalid_cursor");
  const bad2 = await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/restrictions?cursor=zzz", { headers: { Cookie: await cookieFor(STAFF) } }), env(ON), ctx);
  check("  garbage is invalid_cursor", bad2.status === 400);
  // the bounded period cleanup
  db.prepare("INSERT INTO community_restriction_periods (discord_id, opened_at, retain_until, nonce) VALUES ('300000000000000081', ?, ?, 'x1'), ('300000000000000082', ?, ?, 'x2')").run(T, T + 10, T, T + 10);
  sw = await restrictionsMod.sweepCommunityRestrictions(env(), T, 1);
  check("the orphan-period cleanup honors the run's limit (one of two orphans per run)", sw.periods === 1 && one("SELECT COUNT(*) AS n FROM community_restriction_periods WHERE discord_id IN ('300000000000000081', '300000000000000082')").n === 1);
  sw = await restrictionsMod.sweepCommunityRestrictions(env(), T, 1);
  check("  the next run takes the other", sw.periods === 1 && one("SELECT COUNT(*) AS n FROM community_restriction_periods WHERE discord_id IN ('300000000000000081', '300000000000000082')").n === 0);

  console.log("\n== .73: uniform reader admission on every payload ==");
  const denyStaff = () => db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  const restoreStaff = () => db.prepare("UPDATE site_users SET denied = 0, in_server = 1, session_version = 1 WHERE discord_id = ?").run(STAFF);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; denyStaff(); } };
  r = await act({ action: "appeal", appealStatus: "requested", caseId: F, expectedRevision: tokF });
  check("EARLY: an admin denied between the context read and the pre-action read: 403 denied, no case in the answer, nothing written", r.status === 403 && r.body.error === "denied" && !("case" in r.body) && one("SELECT appeal_status FROM community_restriction_cases WHERE id = ?", F).appeal_status === "none", JSON.stringify(r.body).slice(0, 200));
  restoreStaff();
  AFTER = (i) => { if (i === 1) db.prepare("UPDATE community_restriction_cases SET revision = revision + 1 WHERE id = ?").run(F); if (i === 2) { AFTER = null; db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF); } };
  r = await act({ action: "appeal", appealStatus: "requested", caseId: F, expectedRevision: tokF });
  check("LOST CAS: another change lands after the pre-action read, the write loses its compare-and-set, the admin leaves the server before the fallback read: 403 not_member, no case payload", r.status === 403 && r.body.error === "not_member" && !("case" in r.body) && one("SELECT appeal_status FROM community_restriction_cases WHERE id = ?", F).appeal_status === "none", JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_restriction_cases SET revision = revision - 1 WHERE id = ?").run(F);
  restoreStaff();
  AFTER = (i) => { if (i === 2) { AFTER = null; denyStaff(); } };
  r = await act({ action: "appeal", appealStatus: "requested", caseId: F, expectedRevision: tokF });
  check("AFTER SUCCESS: the appeal recorded, then the admin denied: the answer is the case the write's own batch read (its rows included) and the write stands", r.status === 200 && r.body.case.appealStatus === "requested" && r.body.case.characters.length === 1 && one("SELECT appeal_status FROM community_restriction_cases WHERE id = ?", F).appeal_status === "requested", JSON.stringify(r.body).slice(0, 200));
  tokF = r.body.case.revision;
  r = await call("GET", "/api/admin/community/restrictions", STAFF);
  check("  while the next read, newly unauthorized, is refused", r.status === 403 && !("cases" in r.body));
  restoreStaff();
  AFTER = (i) => { if (i === 1) { AFTER = null; denyStaff(); } };
  r = await act({ action: "create", caseId: F, discordId: RM2, category: "conduct_removal", reviewAt: iso(review), expiresAt: iso(expiry) });
  check("REPLAY: a retried create whose admin is denied right after the no-op write batch: 403 denied, no replay payload", r.status === 403 && r.body.error === "denied" && !("case" in r.body) && !("replay" in r.body));
  restoreStaff();
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF); } };
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + RM2, STAFF);
  check("the list (cases and their rows, one batch): departed before the payload batch: 403 not_member, no cases", r.status === 403 && r.body.error === "not_member" && !("cases" in r.body));
  restoreStaff();
  BEFORE = (i) => { if (i === 1) { BEFORE = null; db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(STAFF); } };
  r = await call("GET", "/api/admin/community/return-review", STAFF);
  check("the return review: original session closed before the payload batch: 503 erasure_held, no members", r.status === 503 && r.body.error === "erasure_held" && !("members" in r.body));
  restoreStaff();
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

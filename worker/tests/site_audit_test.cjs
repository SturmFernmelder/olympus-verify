// Admin -> Audit log (the owner's request of 7 Oct 2026, item 5: "Full staff audit page"), GET /api/admin/audit-log in
// src/site-admin.ts, through the REAL src/*.ts (transpiled by TypeScript itself) against the REAL schema.sql in SQLite
// (node:sqlite), every request through the real index.ts fetch. Only Discord's HTTP side is stubbed; nothing leaves the
// process. The suite's clock (db.ts now(), the clock audit() stamps ts with) runs three hours behind SQLite's own, so a
// window measured on the database's strftime('%s','now') instead of the clock that wrote the rows would show. Covers:
//   - access: 401 signed out, 403 for a signed-in member, 200 no-store for SITE_ADMINS; other methods 404 as the admin
//     router answers them today; a sub-path 404;
//   - every parameter's rule (family, actor, subject, window, before, limit; unknown or repeated names), refused before
//     the database is read; an empty value is the default;
//   - family exactness (role never matches roles.*, nor ROLE. or rolex.), the actor and subject filters, combined; the
//     actor "auto" of an invite the real review.ts queued under ADMISSION_MODE=auto;
//   - keyset paging across three pages: no gaps, no duplicates, the last page exhausted;
//   - the SCAN bound: 5,000 rows and a rare filter: each reply's stretch at most 2,000 ids, exhausted false and a cursor
//     that continues until the rare rows are found; the page query walks the primary key (no audit_actor_action, no sort)
//     and the window's first id is one audit_ts entry, read without a sort (SQLite's plans of the statements the Worker ran);
//   - the window floor on the clock that stamps the rows: 1d, 7d, 30d and all; a row written by the real audit();
//   - names: site_users as the site shows them (shownName), the members row as the fallback (also for a site row erased
//     down to its denial), none for a system actor or an unknown id, and only the name (no other column in the reply);
//   - action-specific typed summaries only; historical private, unknown, malformed and oversized content withheld;
//   - zero writes: every table's row count and SQLite's total_changes() unchanged across every request here;
//   - at most five statements per request beyond the gate's own, counted by the suite's D1 wrapper, the last of every 200
//     the final admission;
//   - the final admission (Codex's required change A30-AUDIT-01, 7 Oct 2026 21:23:59 UTC): the signed session bound before
//     any audit read and required to be the gate's account at the gate's version (handleAdmin called directly with a
//     mismatched account, version or no cookie: 401 and not one statement); a change injected by the D1 wrapper right
//     before the final admission statement, after the page read: the version revoked (site.ts's sign-out statement), the
//     cookie's expiry passing (the database's clock moved on through an overridden strftime, the Worker's clock not), a
//     denial with the version bump (site-admin.ts deny's statement), the account erased (deleteSiteData's statement), and
//     a denial alone or leaving the server: each 401 with nothing of the page, and the same cookie's next request 401; a
//     control with no change 200; the early empty-window and below-the-oldest-id answers fenced the same way; a failing
//     admission statement 503 with nothing of the page, logged through errorRef only; SITE_ADMINS checked again; the
//     statement bound to the cookie's own id, version and expiry and answered through site_users' primary key;
//   - the Overview's GET /api/admin/audit keeps its row contract, shares safe projection and final admission.
// Run from the worker folder:  node tests/site_audit_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite that counts every statement and keeps its SQL and bindings ----------
let COUNT = { statements: 0, calls: [] };
const resetCount = () => { COUNT = { statements: 0, calls: [] }; };
/**
 * A30-AUDIT-01: a change armed by a test runs once, right before the first statement whose SQL it names executes (the
 * final admission), so it lands after the page read and before the admission; a change that throws fails that statement.
 */
let BEFORE = null;
function d1(dbh) {
  const exec = (sql, params) => {
    const st = dbh.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const note = () => {
      COUNT.statements++;
      COUNT.calls.push({ sql, params });
      if (BEFORE && BEFORE.when(sql)) { const armed = BEFORE; BEFORE = null; armed.run(COUNT.calls.length - 1); }
    };
    const api = {
      _sql: sql,
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        if (named > 99) throw new Error("D1_ERROR: too many bound parameters");
        params = p;
        return api;
      },
      first: async () => { note(); return dbh.prepare(sql).get(...params) ?? null; },
      all: async () => { note(); return { results: dbh.prepare(sql).all(...params) }; },
      run: async () => { note(); return exec(sql, params); },
      raw: async () => { note(); const st = dbh.prepare(sql); return [st.columns().map((c) => c.name), ...st.all(...params).map((r) => Object.values(r))]; },
      _exec: () => { note(); return exec(sql, params); },
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      dbh.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); dbh.exec("COMMIT"); } catch (e) { dbh.exec("ROLLBACK"); throw e; }
      return out;
    },
  };
}
let db;
const fresh = () => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
};
fresh();

// ---------- the real modules; only Discord's HTTP side is stubbed ----------
const transpiled = {};
const transpile = (file) => (transpiled[file] ??= ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
globalThis.fetch = async (url) => { throw new Error("no network in tests: " + url); };
const realDiscord = (() => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(mod, mod.exports, () => ({}));
  return mod.exports;
})();
const stubs = {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async () => {},
    postMessage: async () => ({ id: "1" }),
    editMessage: async () => ({}),
    staffNotice: async () => true,
    addRole: async () => {},
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    banMember: async () => {},
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => true, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  // review.ts is the real module: under ADMISSION_MODE=auto its onVerified queues the invite with the actor "auto", a row
  // the actor filter must find
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const indexMod = load("./index"), siteCore = load("./site-core"), dbMod = load("./db"), schema = load("./schema"), review = load("./review");
const contextMod = load("./community-context"), adminMod = load("./site-admin");
/** The final admission's exact SQL: the community fence with applicantWrite's semantics, over the bound id, version and expiry. */
const ADMISSION = `SELECT (${contextMod.fenceSql("applicantWrite", 1, 2, 3)}) AS ok`;

// The database's clock, movable (A30-AUDIT-01's expiry case): strftime is overridden on a connection by an application
// function that asks a second, untouched SQLite connection for the real answer and adds SHIFT seconds to
// strftime('%s','now') only, the form the fence's DB_NOW uses. With SHIFT at 0 it answers exactly as the built-in does.
let SHIFT = 0;
const clockSource = new DatabaseSync(":memory:");
const movableClock = (dbh) =>
  dbh.function("strftime", { varargs: true, deterministic: false }, (...a) => {
    const v = clockSource.prepare(`SELECT strftime(${a.map(() => "?").join(", ")}) AS v`).get(...a).v;
    return SHIFT && a.length === 2 && a[0] === "%s" && a[1] === "now" ? String(Number(v) + SHIFT) : v;
  });

// The Worker's clock (db.ts now(), which stamps every audit row's ts) three hours behind SQLite's.
const RealDate = Date;
const realNow = () => Math.floor(RealDate.now() / 1000);
let T = realNow() - 3 * 3600;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const H = 3600, DAY = 86400;
const GUILD = "236932545793490944";
const ADMIN = "472099715253796864", MEMBER = "300000000000000003", BOT_ONLY = "300000000000000006", ERASED = "300000000000000007", UNKNOWN = "300000000000000008";
const env = (over = {}) => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: GUILD, DISCORD_APP_ID: "1550176895671341076", DISCORD_CLIENT_SECRET: "client-secret", DISCORD_PUBLIC_KEY: "00", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: GUILD, SITE_ADMINS: ADMIN, ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Officer Olly", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const cookieFor = async (id) => (await siteCore.sessionCookie(env(), id, 1)).split(";")[0];
/** A session cookie with a chosen version and expiry, signed as site-core.ts sessionCookie signs it. */
const cookieWith = async (u, v, e) => {
  const body = siteCore.b64u(new TextEncoder().encode(JSON.stringify({ u, v, e })));
  return `${siteCore.SESSION_COOKIE}=${body}.${await siteCore.sign(env().COOKIE_SECRET, "session", body)}`;
};
/** The expiry a cookie carries. */
const expiryOf = (c) => JSON.parse(Buffer.from(c.split("=")[1].split(".")[0], "base64url").toString("utf8")).e;
async function http(method, url, { who, cookie, body, headers = {} } = {}) {
  const h = new Headers(headers);
  if (who) h.set("Cookie", await cookieFor(who));
  if (cookie) h.set("Cookie", cookie);
  const u = new URL(url, "https://guild.example");
  if (method !== "GET" && method !== "HEAD") { h.set("X-Olympus", "2"); h.set("Origin", u.origin); }
  if (body !== undefined) h.set("Content-Type", "application/json");
  const res = await indexMod.default.fetch(new Request(u, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env(), ctx);
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, headers: res.headers };
}
const log = (params = {}, who = ADMIN) => http("GET", "/api/admin/audit-log" + (typeof params === "string" ? params : Object.keys(params).length ? "?" + new URLSearchParams(params) : ""), { who });
/** An audit row as the Worker writes it; ts defaults to the Worker's clock. */
const put = (action, { actor = "system", subject = null, details = null, ts = T } = {}) => Number(run("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, ?, ?, ?, ?)", ts, actor, action, subject, details).lastInsertRowid);
const ids = (r) => (r.body && Array.isArray(r.body.entries) ? r.body.entries.map((e) => e.id) : null);
const people = () => {
  run("INSERT INTO site_users (discord_id, username, global_name, nick, avatar, first_login, last_login, in_server, denied, session_version) VALUES (?, 'vik', 'Vik', NULL, NULL, ?, ?, 1, 0, 1)", ADMIN, T, T);
  run("INSERT INTO site_users (discord_id, username, global_name, nick, avatar, first_login, last_login, in_server, denied, session_version) VALUES (?, 'mia', 'Mia Lee', 'Mimi', 'u:0123456789abcdef0123456789abcdef', ?, ?, 1, 0, 1)", MEMBER, T, T);
  run("INSERT INTO members (discord_id, username, global_name, battletag) VALUES (?, 'mia_bot', 'Mia Bot', 'Hidden#1111')", MEMBER);
  run("INSERT INTO members (discord_id, username, global_name, battletag, ban_reason) VALUES (?, 'bo', 'Bo Bot', 'Hidden#2222', 'never shown')", BOT_ONLY);
  // a denied account whose site data was deleted: the row keeps only the id and the denial (site-admin.ts deleteSiteData)
  run("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, denied_reason, session_version) VALUES (?, NULL, NULL, NULL, ?, ?, 1, 1, 'kept reason', 2)", ERASED, T, T);
  run("INSERT INTO members (discord_id, username, global_name) VALUES (?, 'er', NULL)", ERASED);
};
/** Every table's row count and SQLite's own count of changed rows on this connection: equal before and after means no write. */
const footprint = () => {
  const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
  return JSON.stringify({ rows: tables.map((t) => [t, one(`SELECT COUNT(*) AS c FROM "${t}"`).c]), changes: one("SELECT total_changes() AS c").c, audit: all("SELECT * FROM audit ORDER BY id") });
};
/** The statements one request ran beyond the gate's own (measured on a GET the admin router answers 404). */
let GATE = 0;
const measured = async (fn) => { resetCount(); const r = await fn(); return { r, extra: COUNT.statements - GATE, calls: COUNT.calls.slice() }; };
const planOf = (call) => all("EXPLAIN QUERY PLAN " + call.sql, ...call.params).map((r) => r.detail).join(" | ");

(async () => {
  people();
  // the first request runs ensureSchema (once per isolate); everything after it is the steady state
  await log({}, ADMIN);
  resetCount();
  const gate = await http("GET", "/api/admin/no-such-route", { who: ADMIN });
  GATE = COUNT.statements;
  check("(fixture) the gate's own statements on an admin GET are measured once: the 404 route reads nothing else", gate.status === 404 && GATE >= 1 && GATE <= 2, GATE);

  console.log("\n== access ==");
  let r = await log({});
  check("signed out: 401", (await http("GET", "/api/admin/audit-log")).status === 401);
  check("a signed-in member who is not in SITE_ADMINS: 403", (await log({}, MEMBER)).status === 403);
  check("a SITE_ADMINS account: 200, JSON, no-store", r.status === 200 && /application\/json/.test(r.headers.get("Content-Type") || "") && r.headers.get("Cache-Control") === "no-store, no-transform", r.status, r.headers.get("Cache-Control"));
  check("  the reply's shape: entries, next, scanned, exhausted, likelyEnd, window (7d by default), limit (50 by default)", Object.keys(r.body).sort().join() === "entries,exhausted,likelyEnd,limit,next,scanned,window" && r.body.window === "7d" && r.body.limit === 50, r.body);
  const before0 = footprint();
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    const x = await http(m, "/api/admin/audit-log", { who: ADMIN, body: {} });
    check(`${m}: 404 not_found, as the admin router answers any method it has no route for`, x.status === 404 && x.body.error === "not_found", x.status, x.body);
  }
  check("a sub-path: 404", (await http("GET", "/api/admin/audit-log/1", { who: ADMIN })).status === 404);
  check("  and none of them changed anything", footprint() === before0);

  console.log("\n== every parameter is checked; anything else is 400 bad_request, before the database is read ==");
  const bad = [
    ["family", "Role"], ["family", "r"], ["family", "role."], ["family", "1role"], ["family", "a".repeat(21)], ["family", "role%"], ["family", "rôle"],
    ["actor", "123"], ["actor", "1".repeat(16)], ["actor", "1".repeat(21)], ["actor", "Watcher"], ["actor", "anyone"], ["actor", ADMIN + " "],
    ["subject", "x".repeat(81)], ["subject", "line\nbreak"], ["subject", "tab\there"], ["subject", "c1\u0085"], ["subject", "del\u007f"],
    ["window", "2d"], ["window", "ALL"], ["window", "7"],
    ["before", "0"], ["before", "-1"], ["before", "1.5"], ["before", "01"], ["before", "1e3"], ["before", "abc"], ["before", "9".repeat(16)],
    ["limit", "9"], ["limit", "101"], ["limit", "5"], ["limit", "abc"], ["limit", "1000"], ["limit", "20.0"], ["limit", "010"], ["limit", "099"],
  ];
  let allBad = true, noReads = true;
  const fieldsSeen = new Set();
  for (const [k, v] of bad) {
    const m = await measured(() => log({ [k]: v }));
    const okBad = m.r.status === 400 && m.r.body.error === "bad_request" && m.r.body.field === k && typeof m.r.body.message === "string" && m.r.body.message.length > 10;
    if (!okBad) { allBad = false; console.log("    not refused as expected:", k, JSON.stringify(v), m.r.status, JSON.stringify(m.r.body)); }
    if (m.extra !== 0) noReads = false;
    fieldsSeen.add(k);
  }
  check("every bad family, actor, subject, window, cursor and limit is refused with its field and a message in words", allBad && fieldsSeen.size === 6);
  check("  refused before any statement of its own", noReads);
  const extra = await measured(() => log("?foo=1"));
  check("an unknown parameter is refused (field query), so a mistyped filter never returns the unfiltered log", extra.r.status === 400 && extra.r.body.field === "query" && extra.extra === 0);
  check("  so is a repeated one", (await log("?family=role&family=site")).body.field === "query");
  const good = [
    ["family", "role"], ["family", "staff_notice"], ["family", "ab"], ["family", "a" + "b".repeat(19)],
    ["actor", ADMIN], ["actor", "1".repeat(17)], ["actor", "1".repeat(20)], ["actor", "watcher"], ["actor", "system"], ["actor", "cron"], ["actor", "site"], ["actor", "auto"], ["actor", "admin"],
    ["subject", "x".repeat(80)], ["subject", "\u{1F600}".repeat(80)], ["subject", "Mia One"],
    ["window", "1d"], ["window", "7d"], ["window", "30d"], ["window", "all"],
    ["before", "1"], ["before", "9".repeat(15)], ["limit", "10"], ["limit", "100"], ["limit", "50"],
  ];
  const refusedGood = [];
  for (const [k, v] of good) { const x = await log({ [k]: v }); if (x.status !== 200) refusedGood.push(`${k}=${v}: ${x.status}`); }
  check("every value inside the rules is taken (a subject is counted in characters: 80 emoji pass)", refusedGood.length === 0, refusedGood);
  const empties = await log("?family=&actor=&subject=&window=&before=&limit=");
  check("an empty value is the default (the page's form sends none, but a hand-made address may)", empties.status === 200 && empties.body.window === "7d" && empties.body.limit === 50);

  console.log("\n== family exactness, actor and subject ==");
  const fam = {
    granted: put("role.restored", { actor: "system", subject: MEMBER }),
    synced: put("roles.synced", { actor: "cron" }),
    upper: put("ROLE.granted", { actor: "system" }),
    rolex: put("rolex.thing", { actor: "system" }),
    bare: put("role", { actor: "system" }),
    removed: put("role.removed", { actor: ADMIN, subject: MEMBER }),
    site: put("site.settings", { actor: ADMIN }),
    siteTo: put("site.denied", { actor: ADMIN, subject: "Mia One" }),
    watcher: put("roster.ingested", { actor: "watcher", subject: "Mia One" }),
  };
  r = await log({ family: "role", window: "all" });
  check("family=role: exactly role.*, never roles.*, ROLE.*, rolex.* or a bare 'role'", JSON.stringify(ids(r)) === JSON.stringify([fam.removed, fam.granted]), ids(r));
  r = await log({ family: "roles", window: "all" });
  check("  family=roles: only roles.*", JSON.stringify(ids(r)) === JSON.stringify([fam.synced]), ids(r));
  r = await log({ actor: ADMIN, window: "all" });
  check("actor=<Discord ID>: only that account's rows", JSON.stringify(ids(r)) === JSON.stringify([fam.siteTo, fam.site, fam.removed]), ids(r));
  r = await log({ actor: "watcher", window: "all" });
  check("actor=watcher: only the watcher's rows", JSON.stringify(ids(r)) === JSON.stringify([fam.watcher]), ids(r));
  // the live ADMISSION_MODE=auto path (wrangler.toml): a confirmed code queues the invite through the real review.ts, which
  // audits invite.queued with the actor "auto"; the row goes again so the paging below sees only its own invite rows
  await review.onVerified(env(), { id: 1, discord_id: MEMBER, name_key: "auto one", name: "Auto One", created_at: T, expires_at: T + 600, consumed_at: null }, "whisper");
  const autoRow = one("SELECT id, actor FROM audit WHERE action = 'invite.queued' AND subject = 'Auto One'");
  r = await log({ actor: "auto", window: "all" });
  check("actor=auto: the invite.queued row the real review.ts writes under ADMISSION_MODE=auto", !!autoRow && autoRow.actor === "auto" && r.status === 200 && JSON.stringify(ids(r)) === JSON.stringify([autoRow.id]), autoRow, r.status, r.body);
  check("  and together with family=invite", !!autoRow && JSON.stringify(ids(await log({ family: "invite", actor: "auto", window: "all" }))) === JSON.stringify([autoRow.id]));
  if (autoRow) run("DELETE FROM audit WHERE id = ?", autoRow.id);
  run("DELETE FROM invite_queue WHERE name_key = 'auto one'");
  r = await log({ subject: "Mia One", window: "all" });
  check("subject: exact match", JSON.stringify(ids(r)) === JSON.stringify([fam.watcher, fam.siteTo]), ids(r));
  check("  case and part of it match nothing", ids(await log({ subject: "mia one", window: "all" })).length === 0 && ids(await log({ subject: "Mia", window: "all" })).length === 0);
  r = await log({ family: "role", actor: ADMIN, subject: MEMBER, window: "all" });
  check("the three together", JSON.stringify(ids(r)) === JSON.stringify([fam.removed]), ids(r));
  const none = await log({ family: "nothing", window: "all" });
  check("  a filter with no match in a stretch that reaches the window's start: no entries, exhausted, no cursor", none.body.entries.length === 0 && none.body.exhausted === true && none.body.next === null);

  console.log("\n== names: the site's account row, the bot's member row, and only the name ==");
  const nm = {
    adminActs: put("role.restored", { actor: ADMIN, subject: BOT_ONLY }),
    erased: put("role.restored", { actor: ERASED, subject: UNKNOWN }),
    member: put("role.restored", { actor: "system", subject: MEMBER }),
  };
  r = await log({ window: "all", limit: "10" });
  const byId = new Map(r.body.entries.map((e) => [e.id, e]));
  const shown = (u, g, k) => siteCore.shownName({ username: u, displayName: g, nick: k });
  check("a site account by shownName, as the site shows it (nickname, display name, @username)", byId.get(nm.adminActs).actorName === shown("vik", "Vik", null) && byId.get(nm.member).subjectName === shown("mia", "Mia Lee", "Mimi") && byId.get(nm.member).subjectName === "Mimi · Mia Lee (@mia)", byId.get(nm.member));
  check("  the site's row wins over the bot's (Mia, not Mia Bot)", !JSON.stringify(r.body).includes("Mia Bot"));
  check("an account the site never saw: the bot's member row", byId.get(nm.adminActs).subjectName === "Bo Bot (@bo)", byId.get(nm.adminActs));
  check("  a site row erased down to its denial falls back to the member row", byId.get(nm.erased).actorName === "@er", byId.get(nm.erased));
  check("an id nobody knows, and a system actor: no name, the raw value stays", byId.get(nm.erased).subjectName === null && byId.get(nm.erased).subject === UNKNOWN && byId.get(nm.member).actorName === null && byId.get(nm.member).actor === "system");
  check("  a subject that is not a Discord id (a character name): no name", (await log({ subject: "Mia One", window: "all" })).body.entries.every((e) => e.subjectName === null));
  const KEYS = "action,actor,actorName,details,detailsWithheld,id,subject,subjectName,subjectWithheld,ts";
  const text = JSON.stringify(r.body);
  check("only the name: every entry has exactly the ten approved keys, and no other column of either table reaches the reply", r.body.entries.every((e) => Object.keys(e).sort().join() === KEYS) && !/Hidden#|never shown|kept reason|0123456789abcdef|avatar|battletag|ban_reason/i.test(text), text.slice(0, 300));

  console.log("\n== action-specific safe projection of historical details ==");
  const secret = "AUDIT-PRIVATE-MARKER";
  const det = {
    status: put("site.application_status", { subject: MEMBER, details: JSON.stringify({ status: "accepted", note: secret }) }),
    count: put("site.mentions_deleted", { subject: MEMBER, details: JSON.stringify({ removed: 3 }) }),
    bool: put("site.data_deleted", { subject: MEMBER, details: JSON.stringify({ mentions: true }) }),
    empty: put("site.undenied", { subject: MEMBER }),
    ticket: put("verify.confirmed", { subject: secret, details: JSON.stringify({ ticket: secret, code: secret, guid: secret, officer: secret, discordId: MEMBER }) }),
    failed: put("invite.failed", { subject: "Mia One", details: JSON.stringify({ code: secret, detail: secret }) }),
    reason: put("admin.ban", { subject: MEMBER, details: JSON.stringify({ reason: secret }) }),
    error: put("role.remove_failed", { subject: MEMBER, details: JSON.stringify({ error: secret }) }),
    case: put("community.privacy_case_updated", { subject: secret, details: JSON.stringify({ caseId: secret, status: "resolved", replied: true }) }),
    payment: put("community.contribution_payment", { subject: MEMBER, details: JSON.stringify({ receiptId: secret, evidence: secret, result: "recorded" }) }),
    tag: put("link.ok", { subject: secret + "#1234", details: JSON.stringify({ source: secret, boundTo: MEMBER }) }),
    unknown: put(secret, { actor: secret, subject: secret, details: JSON.stringify({ removed: 3, note: secret }) }),
    long: put("site.mentions_deleted", { details: JSON.stringify({ removed: 3, note: secret.repeat(500) }) }),
    bad: put("site.mentions_deleted", { details: "{removed:" + secret }),
    primitive: put("site.mentions_deleted", { details: JSON.stringify(secret) }),
    array: put("site.mentions_deleted", { details: JSON.stringify([3, secret]) }),
    nested: put("site.mentions_deleted", { details: JSON.stringify({ removed: { value: 3, secret } }) }),
    enum: put("site.application_status", { subject: secret, details: JSON.stringify({ status: secret }) }),
    stringCount: put("site.mentions_deleted", { details: JSON.stringify({ removed: "3" }) }),
    negative: put("site.mentions_deleted", { details: JSON.stringify({ removed: -1 }) }),
    wideCount: put("site.mentions_deleted", { details: JSON.stringify({ removed: 1_000_000_001 }) }),
    stringBool: put("site.data_deleted", { details: JSON.stringify({ mentions: "true" }) }),
    wrongAction: put("site.undenied", { details: JSON.stringify({ status: "accepted", removed: 3 }) }),
  };
  r = await log({ window: "all", limit: "100" });
  const e = new Map(r.body.entries.map((row) => [row.id, row]));
  const withheld = (key) => e.get(det[key]).details === null && e.get(det[key]).detailsWithheld === true;
  check("only an action's own valid typed keys survive; dropped note is visibly withheld", JSON.stringify(e.get(det.status).details) === '{"status":"accepted"}' && e.get(det.status).detailsWithheld && e.get(det.status).subject === MEMBER);
  check("approved numeric counts and booleans retain their types without a withheld flag", JSON.stringify(e.get(det.count).details) === '{"removed":3}' && !e.get(det.count).detailsWithheld && JSON.stringify(e.get(det.bool).details) === '{"mentions":true}' && !e.get(det.bool).detailsWithheld);
  check("a known action with no detail retains null without claiming a withheld detail", e.get(det.empty).details === null && e.get(det.empty).detailsWithheld === false);
  check("actual producer shapes carrying tickets, codes, GUIDs, reasons, errors and arbitrary detail are withheld", ["ticket", "failed", "reason", "error"].every(withheld));
  check("private case/payment linkage and BattleTags have neither a subject nor details in the aggregate page", ["case", "payment", "tag"].every(key => withheld(key) && e.get(det[key]).subject === null && e.get(det[key]).subjectName === null && e.get(det[key]).subjectWithheld));
  check("unknown actions/actors/subjects are fixed safe labels and withheld, with no raw fallback", e.get(det.unknown).action === "unknown" && e.get(det.unknown).actor === "withheld" && e.get(det.unknown).actorName === null && e.get(det.unknown).subject === null && withheld("unknown"));
  check("oversized, malformed, primitive and array JSON details are withheld completely", ["long", "bad", "primitive", "array"].every(withheld));
  check("nested values, unknown enums, string/negative/oversized counts and string booleans are refused", ["nested", "enum", "stringCount", "negative", "wideCount", "stringBool"].every(withheld));
  check("a field approved for another action is still withheld for this action", withheld("wrongAction"));
  check("a safe character subject remains useful on invite history; a private or malformed subject does not", e.get(det.failed).subject === "Mia One" && e.get(det.failed).subjectWithheld === false && e.get(det.enum).subject === null && e.get(det.enum).subjectWithheld === true);
  check("no confidential marker from action, actor, subject or historical detail reaches the response bytes", !r.text.includes(secret));
  const nameCall = COUNT.calls.filter(c => /FROM json_each\(\?1\) j/.test(c.sql)).at(-1);
  check("name resolution binds only approved Discord IDs, never private case/tag/unknown subject values", !!nameCall && JSON.parse(nameCall.params[0]).every(id => /^\d{17,20}$/.test(id)) && !nameCall.params[0].includes(secret));
  for (const id of Object.values(det)) run("DELETE FROM audit WHERE id = ?", id);

  console.log("\n== keyset paging across three pages ==");
  const paged = [];
  for (let i = 0; i < 125; i++) { paged.push(put("invite.sent", { actor: "watcher", subject: "Char " + i })); put("site.noise"); }
  const seen = [];
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 6; i++) {
    const p = await log({ family: "invite", window: "all", ...(cursor ? { before: String(cursor) } : {}) });
    pages.push(p.body);
    seen.push(...ids(p));
    cursor = p.body.next;
    if (p.body.exhausted) break;
  }
  check("three pages of 50, 50 and 25, newest first", pages.length === 3 && pages.map((p) => p.entries.length).join() === "50,50,25", pages.map((p) => p.entries.length));
  check("  no gaps, no duplicates: exactly the 125 rows, in id order descending", JSON.stringify(seen) === JSON.stringify([...paged].reverse()) && new Set(seen).size === 125);
  check("  each cursor is the last id shown (exclusive); the last page is exhausted with no cursor", pages[0].next === pages[0].entries[49].id && pages[1].next === pages[1].entries[49].id && pages[2].next === null && pages[2].exhausted === true && pages[0].exhausted === false);
  check("  a cursor above the newest id starts at the newest (never a walk through empty ids)", (await log({ family: "invite", window: "all", before: "999999999" })).body.entries[0].id === paged[124]);

  console.log("\n== the SCAN bound: 5,000 rows and a rare filter ==");
  const rareOld = put("rank.changed", { actor: ADMIN, subject: "Rare One" });
  db.exec("BEGIN");
  const bulk = db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'roster.seen', ?, NULL)");
  for (let i = 0; i < 5000; i++) bulk.run(T, "Char " + i);
  db.exec("COMMIT");
  const rareNew = put("rank.changed", { actor: ADMIN, subject: "Rare Two" });
  const newest = one("SELECT MAX(id) AS id FROM audit").id;
  let m1 = await measured(() => log({ family: "rank", window: "all" }));
  let b = m1.r.body;
  check("the first reply finds the newer rare row, and its stretch is at most 2,000 ids, ending at the newest", JSON.stringify(ids(m1.r)) === JSON.stringify([rareNew]) && b.scanned.hi === newest && b.scanned.hi - b.scanned.lo + 1 === 2000, b.scanned, ids(m1.r));
  check("  fewer matches than a page in the stretch, older ids left: exhausted false and the stretch's start as the cursor", b.exhausted === false && b.next === b.scanned.lo);
  const stretches = [b.scanned];
  const found = [...ids(m1.r)];
  let guard = 0;
  while (!b.exhausted && guard++ < 10) {
    const m = await measured(() => log({ family: "rank", window: "all", before: String(b.next) }));
    b = m.r.body;
    stretches.push(b.scanned);
    found.push(...ids(m.r));
    if (m.extra > 5) found.push("too many statements");
  }
  check("Older continues stretch by stretch, each at most 2,000 ids, contiguous, until the oldest rare row and the start", stretches.every((s) => s.hi - s.lo + 1 <= 2000) && stretches.every((s, i) => i === 0 || s.hi === stretches[i - 1].lo - 1) && stretches.at(-1).lo === 1 && JSON.stringify(found) === JSON.stringify([rareNew, rareOld]), stretches, found);
  const emptyStretch = await log({ family: "rank", window: "all", before: String(stretches[0].lo) });
  check("  a stretch with no match at all: no entries, exhausted false, a cursor (the page says which ids it searched)", emptyStretch.body.entries.length === 0 && emptyStretch.body.exhausted === false && emptyStretch.body.next === emptyStretch.body.scanned.lo && emptyStretch.body.scanned.hi === stretches[0].lo - 1);
  // SQLite's own plans for the statements the Worker ran: the page walks the primary key inside [lo, hi], with every filter
  const mPlan = await measured(() => log({ family: "rank", actor: ADMIN, subject: "Rare Two", window: "7d" }));
  const pageCall = mPlan.calls.find((c) => /ORDER BY id DESC LIMIT/.test(c.sql));
  const floorCall = mPlan.calls.find((c) => /WHERE ts >= \?1/.test(c.sql));
  const pagePlan = planOf(pageCall), floorPlan = planOf(floorCall);
  check("the page query walks the primary key (rowid>? AND rowid<?), never audit_actor_action, never a sort", /USING INTEGER PRIMARY KEY \(rowid>\? AND rowid<\?\)/.test(pagePlan) && !/audit_actor_action|TEMP B-TREE/.test(pagePlan), pagePlan);
  check("  without the unary + the same filter would be answered from audit_actor_action and sorted (why the + is there)", /audit_actor_action/.test(planOf({ sql: pageCall.sql.replace(/\+(action|actor|subject)\b/g, "$1"), params: pageCall.params })));
  // a seek alone is not one entry: ORDER BY id, or ts with id DESC, seeks audit_ts too and then reads and sorts every row
  // of the window (TEMP B-TREE), so the plan must show no sort
  check("the window's first id is one entry of the audit_ts index (covering, ts>?, in index order with no sort)", /USING COVERING INDEX audit_ts \(ts>\?\)/.test(floorPlan) && !/TEMP B-TREE/.test(floorPlan), floorPlan);
  check("  (and the check tells those apart: both seek audit_ts, then sort)", ["ORDER BY id LIMIT 1", "ORDER BY ts, id DESC LIMIT 1"].every((o) => { const p = planOf({ sql: "SELECT id FROM audit WHERE ts >= ?1 " + o, params: floorCall.params }); return /USING COVERING INDEX audit_ts \(ts>\?\)/.test(p) && /TEMP B-TREE/.test(p); }));
  check("  where MIN(id) ... WHERE ts >= ? would walk the primary key from the oldest row (SQLite's min() plan; why the design's MIN reads as ORDER BY ts, id LIMIT 1)", !/audit_ts/.test(planOf({ sql: "SELECT MIN(id) FROM audit WHERE ts >= ?1", params: floorCall.params })));

  console.log("\n== the window floor, on the clock that stamps the rows ==");
  fresh();
  people();
  schema.forgetSchemaCheck();
  await log({}); // the fresh database's first request, as the isolate's
  const w = {
    d40: put("site.a", { ts: T - 40 * DAY }),
    d20: put("site.b", { ts: T - 20 * DAY }),
    d3: put("site.c", { ts: T - 3 * DAY }),
    h25: put("site.d", { ts: T - 25 * H }),
    h23: put("site.e", { ts: T - 23 * H }),
    h1: put("site.f", { ts: T - H }),
  };
  await dbMod.audit(env(), ADMIN, "site.g", undefined, { n: 1 }); // the real audit(): ts is the Worker's now()
  const g = one("SELECT id, ts FROM audit WHERE action = 'site.g'");
  check("(fixture) audit() stamps ts with the Worker's clock, three hours behind SQLite's", g.ts === T && one("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").t - g.ts >= 3 * H - 5);
  r = await log({ window: "1d" });
  check("1d: the rows of the last 24 hours by that clock (23 h ago is in, though it is 26 h by SQLite's), 25 h ago is out", JSON.stringify(ids(r)) === JSON.stringify([g.id, w.h1, w.h23]) && r.body.exhausted === true && r.body.likelyEnd === true, ids(r), r.body.scanned);
  const oldestId = one("SELECT MIN(id) AS id FROM audit").id;
  check("  the window is filtered on ts itself (Codex, 7 Oct 19:58 UTC): the stretch reaches down to the oldest id, below the window's earliest-stamped one, yet the older rows inside it (25 h, 3 d, 20 d, 40 d) are not returned", r.body.scanned.lo === oldestId && r.body.next === null && ![w.h25, w.d3, w.d20, w.d40].some((id) => ids(r).includes(id)), r.body.scanned);
  r = await log({ window: "7d" });
  check("7d", JSON.stringify(ids(r)) === JSON.stringify([g.id, w.h1, w.h23, w.h25, w.d3]), ids(r));
  r = await log({ window: "30d" });
  check("30d", JSON.stringify(ids(r)) === JSON.stringify([g.id, w.h1, w.h23, w.h25, w.d3, w.d20]), ids(r));
  r = await log({ window: "all" });
  check("all: everything, from id 1", JSON.stringify(ids(r)) === JSON.stringify([g.id, w.h1, w.h23, w.h25, w.d3, w.d20, w.d40]) && r.body.scanned.lo === 1, ids(r));
  check("  the default window is 7d", JSON.stringify(ids(await log({}))) === JSON.stringify([g.id, w.h1, w.h23, w.h25, w.d3]));
  T += 2 * H; // the Worker's clock moves on two hours: 23 h becomes 25 h
  r = await log({ window: "1d" });
  check("as that clock moves on, the window moves with it", JSON.stringify(ids(r)) === JSON.stringify([g.id, w.h1]), ids(r));
  T -= 2 * H;
  r = await log({ window: "1d", before: String(w.h23) });
  check("a cursor below the window's earliest-stamped id: the rest of the log is still searched (a row stamped out of order would be found), nothing matches, exhausted only at the oldest id, and likelyEnd says why", r.body.entries.length === 0 && r.body.scanned && r.body.scanned.lo === one("SELECT MIN(id) AS id FROM audit").id && r.body.exhausted === true && r.body.likelyEnd === true, r.body);
  // Codex's review (7 Oct 19:58 UTC): ids and stamps need not run in the same order
  const back = put("site.backfilled", { ts: T - 3 * DAY }); // the newest id, stamped three days ago
  run("UPDATE audit SET ts = ? WHERE id = ?", T - 2 * H, w.d20); // an old id stamped two hours ago (out of order)
  const fut = put("site.future", { ts: T + DAY }); // a stamp ahead of the clock
  r = await log({ window: "1d" });
  check("a newer id with an old stamp is outside the window; an older id with a recent stamp is inside it, though below the window's earliest-stamped id; a stamp ahead of the clock is inside", !ids(r).includes(back) && ids(r).includes(w.d20) && ids(r).includes(fut) && r.body.exhausted === true, ids(r));
  r = await log({ window: "1d", before: String(w.h23) });
  check("  and the out-of-order row is found by continuing below the earliest-stamped id: a terminal answer never rests on ids being in stamp order", JSON.stringify(ids(r)) === JSON.stringify([w.d20]) && r.body.exhausted === true, ids(r), r.body);
  run("UPDATE audit SET ts = ? WHERE id = ?", T - 20 * DAY, w.d20);
  run("DELETE FROM audit WHERE id IN (?, ?)", back, fut);
  run("DELETE FROM audit WHERE id = ?", w.h25); // sparse ids
  r = await log({ window: "all", limit: "10" });
  check("sparse ids (a deleted row in the middle): the page skips the gap, no row twice, none missing", JSON.stringify(ids(r)) === JSON.stringify(one("SELECT json_group_array(id) AS a FROM (SELECT id FROM audit ORDER BY id DESC LIMIT 10)").a ? JSON.parse(one("SELECT json_group_array(id) AS a FROM (SELECT id FROM audit ORDER BY id DESC LIMIT 10)").a) : []), ids(r));
  T += 60 * DAY;
  r = await log({ window: "30d" });
  check("a window with nothing stamped inside it: no entries, no stretch, exhausted", r.body.entries.length === 0 && r.body.scanned === null && r.body.exhausted === true && r.body.next === null, r.body);
  T -= 60 * DAY;

  console.log("\n== statements per request ==");
  const counts = [];
  for (const params of [{}, { window: "all" }, { family: "site", actor: ADMIN, window: "30d" }, { before: String(w.h1) }, { window: "1d", before: String(w.h23) }, { family: "none" }]) {
    const m = await measured(() => log(params));
    counts.push(m.extra);
    if (m.r.status !== 200 || m.calls.slice(-m.extra).some((c) => !/\baudit\b|json_each/.test(c.sql) && c.sql !== ADMISSION) || m.calls.at(-1).sql !== ADMISSION) counts.push("unexpected");
  }
  check("at most five statements of its own per request (the oldest and newest ids, the window's earliest-stamped id, the page, the names, the final admission), the admission always the last", counts.every((c) => typeof c === "number" && c <= 5) && counts.includes(5), counts);
  const empty0 = new DatabaseSync(":memory:"); // an empty audit table
  const saved = db;
  db = empty0; db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8")); people();
  const mEmpty = await measured(() => log({ window: "all" }));
  check("  an empty log: two statements (the ids, then the admission), no entries, exhausted", mEmpty.extra === 2 && mEmpty.calls.at(-1).sql === ADMISSION && mEmpty.r.body.entries.length === 0 && mEmpty.r.body.exhausted === true && mEmpty.r.body.scanned === null, mEmpty.extra, mEmpty.r.body);
  db = saved;

  console.log("\n== the final admission (Codex's required change A30-AUDIT-01, 7 Oct 2026 21:23:59 UTC) ==");
  // The gate (site-api.ts) judges the account once, before the reads. A change landing after the page read and before the
  // answer leaves must be caught by the one final admission statement; the D1 wrapper runs it right before that statement.
  const SRC_SITE = fs.readFileSync(path.join(root, "src", "site.ts"), "utf8");
  const SIGN_OUT = "UPDATE site_users SET session_version = session_version + 1 WHERE discord_id = ?1 AND session_version = ?2";
  const DENY = "UPDATE site_users SET denied = 1, denied_reason = ?2, denied_at = ?3, denied_by = ?4, session_version = session_version + 1 WHERE discord_id = ?1";
  const ERASE = "DELETE FROM site_users WHERE discord_id = ?1";
  const SRC_ADMIN = fs.readFileSync(path.join(root, "src", "site-admin.ts"), "utf8");
  check("(fixture) the injected changes are the Worker's own statements: the sign-out (site.ts), deny (site-admin.ts deny), the erasure of an account that was not denied (site-admin.ts deleteSiteData)", SRC_SITE.includes(SIGN_OUT) && SRC_ADMIN.includes(DENY) && SRC_ADMIN.includes(ERASE));
  const adminRow = one("SELECT * FROM site_users WHERE discord_id = ?", ADMIN);
  const restoreAdmin = () => {
    run("DELETE FROM site_users WHERE discord_id = ?", ADMIN);
    run(`INSERT INTO site_users (${Object.keys(adminRow).join(", ")}) VALUES (${Object.keys(adminRow).map(() => "?").join(", ")})`, ...Object.values(adminRow));
  };
  const isPage = (c) => /ORDER BY id DESC LIMIT/.test(c.sql), isNames = (c) => /FROM json_each\(\?1\) j/.test(c.sql);
  /** One request with `change` run right before the final admission statement: the reply, what ran in order, and where. */
  async function injected(change, { params = { window: "all" }, cookie }) {
    let at = -1;
    BEFORE = { when: (sql) => sql === ADMISSION, run: (i) => { at = i; if (change) change(); } };
    resetCount();
    let r;
    try {
      r = await http("GET", "/api/admin/audit-log?" + new URLSearchParams(params), { cookie });
    } finally {
      BEFORE = null;
    }
    const calls = COUNT.calls.slice();
    return { r, calls, at, last: calls.length - 1, page: calls.findIndex(isPage), names: calls.findIndex(isNames) };
  }
  /** Nothing of the page: exactly an error and its message. */
  const bare = (r, error) => !!r.body && r.body.error === error && Object.keys(r.body).sort().join() === "error,message" && !/"entries"|site\.[a-z]/.test(r.text);
  const adminCookie = await cookieFor(ADMIN);
  const adminE = expiryOf(adminCookie);

  let c = await injected(null, { cookie: adminCookie });
  check("control: nothing changes between the page read and the admission: 200 with the page; the admission is the last statement, after the page and the names", c.r.status === 200 && c.r.body.entries.length > 0 && c.at === c.last && c.page >= 0 && c.names > c.page && c.at > c.names, c.r.status, c.at, c.last, c.page, c.names);
  check("  the admission is bound to the cookie's own id, version and expiry (never a later version or a renewed expiry)", JSON.stringify(c.calls[c.at].params) === JSON.stringify([ADMIN, 1, adminE]), c.calls[c.at].params);
  const admissionPlan = planOf(c.calls[c.at]);
  check("  and it is indexed: site_users is searched by its primary key, never scanned", /SEARCH fu USING INDEX sqlite_autoindex_site_users_1 \(discord_id=\?\)/.test(admissionPlan) && !/SCAN fu/.test(admissionPlan), admissionPlan);

  const cases = [
    ["the session's version revoked (a sign-out elsewhere, site.ts's statement)", () => run(SIGN_OUT, ADMIN, 1)],
    ["a denial with the version bump (site-admin.ts deny's statement)", () => run(DENY, ADMIN, "test denial", T, MEMBER)],
    ["the account erased (its site_users row deleted, deleteSiteData's statement)", () => run(ERASE, ADMIN)],
    ["a denial without a version bump", () => run("UPDATE site_users SET denied = 1 WHERE discord_id = ?", ADMIN)],
    ["the account no longer in the server (in_server = 0, as the membership re-check records it)", () => run("UPDATE site_users SET in_server = 0 WHERE discord_id = ?", ADMIN)],
  ];
  for (const [label, change] of cases) {
    c = await injected(change, { cookie: adminCookie });
    check(`${label} after the page read, before the final admission: 401 signed_out with nothing of the page`, c.r.status === 401 && bare(c.r, "signed_out") && c.at === c.last && c.page >= 0 && c.page < c.at && c.calls[c.at].params[1] === 1, c.r.status, c.r.body, c.at, c.last, c.page);
    const follow = await http("GET", "/api/admin/audit-log?window=all", { cookie: adminCookie });
    check("  the same cookie's next request: 401, no entries", follow.status === 401 && bare(follow, "signed_out"), follow.status, follow.body);
    restoreAdmin();
  }

  // the expiry: a cookie 60 s from expiry by the database's clock, which the Worker's clock (three hours behind) accepts
  movableClock(db);
  const dbNow = () => one("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").t;
  const shortE = dbNow() + 60;
  const shortCookie = await cookieWith(ADMIN, 1, shortE);
  c = await injected(null, { cookie: shortCookie });
  check("(control) a cookie 60 s from expiry by the database's clock: 200 while that clock stands, the admission bound to that expiry", c.r.status === 200 && c.r.body.entries.length > 0 && c.at === c.last && c.calls[c.at].params[2] === shortE, c.r.status, c.calls[c.at] && c.calls[c.at].params);
  c = await injected(() => { SHIFT = 120; }, { cookie: shortCookie });
  check("the cookie's expiry passing after the page read, before the final admission (the database's clock moved on two minutes): 401 with nothing of the page", c.r.status === 401 && bare(c.r, "signed_out") && c.at === c.last && c.page >= 0 && c.page < c.at, c.r.status, c.r.body);
  check("  (fixture) the database's clock passed the expiry; the Worker's clock, which readSession uses, did not", dbNow() > shortE && T < shortE);
  let follow = await http("GET", "/api/admin/audit-log?window=all", { cookie: shortCookie });
  check("  the same cookie's next request: 401, no entries (the gate's clock still takes the cookie; the admission refuses it)", follow.status === 401 && bare(follow, "signed_out"), follow.status, follow.body);
  SHIFT = 0;
  c = await injected(null, { cookie: await cookieWith(ADMIN, 1, dbNow() - 1) });
  check("a cookie the database's clock has expired though the Worker's has not: the reads run, the admission refuses it (401): the database's clock decides", c.r.status === 401 && bare(c.r, "signed_out") && c.at === c.last && c.page >= 0, c.r.status, c.r.body);

  // the early answers are fenced the same way
  T += 60 * DAY; // nothing stamped in the last 30 days now; cookies minted from here on carry the moved clock
  const lateCookie = await cookieFor(ADMIN);
  c = await injected(null, { params: { window: "30d" }, cookie: lateCookie });
  check("(control) the early empty-window answer (nothing stamped in the last 30 days): 200, no page read, three statements, the admission the last", c.r.status === 200 && c.r.body.entries.length === 0 && c.r.body.scanned === null && c.page === -1 && c.at === c.last && c.calls.length - GATE === 3, c.r.status, c.calls.length - GATE);
  c = await injected(() => run(SIGN_OUT, ADMIN, 1), { params: { window: "30d" }, cookie: lateCookie });
  check("  the version revoked before that early answer's admission: 401 with nothing of it", c.r.status === 401 && bare(c.r, "signed_out") && c.at === c.last && c.page === -1, c.r.status, c.r.body);
  check("  the same cookie's next request: 401", (await http("GET", "/api/admin/audit-log?window=30d", { cookie: lateCookie })).status === 401);
  restoreAdmin();
  T -= 60 * DAY;
  c = await injected(null, { params: { window: "all", before: "1" }, cookie: adminCookie });
  check("(control) a cursor below the oldest id (the other early answer): 200, two statements, the admission the last", c.r.status === 200 && c.r.body.entries.length === 0 && c.at === c.last && c.calls.length - GATE === 2, c.r.status, c.calls.length - GATE);
  c = await injected(() => run(ERASE, ADMIN), { params: { window: "all", before: "1" }, cookie: adminCookie });
  check("  the account erased before that answer's admission: 401 with nothing of it", c.r.status === 401 && bare(c.r, "signed_out") && c.at === c.last, c.r.status, c.r.body);
  restoreAdmin();

  // the admission statement itself fails: fail closed
  const logged = [];
  const consoleError = console.error;
  console.error = (...a) => { logged.push(a); };
  try {
    c = await injected(() => { throw new Error("D1_ERROR: injected failure of the admission statement"); }, { cookie: adminCookie });
  } finally {
    console.error = consoleError;
  }
  check("the admission statement fails: 503 unavailable with nothing of the page (fail closed), after the page was read", c.r.status === 503 && bare(c.r, "unavailable") && c.at === c.last && c.page >= 0, c.r.status, c.r.body);
  check("  logged as a fixed label and a category only (log.ts errorRef), never the error's text", logged.length === 1 && logged[0].length === 2 && logged[0][0] === "admin audit log admission" && logged[0][1] === "d1", logged);
  check("  nothing changed, so the same cookie's next request is 200 again", (await http("GET", "/api/admin/audit-log?window=all", { cookie: adminCookie })).status === 200);

  // the binding, through handleAdmin as site-api.ts calls it, with an account the cookie does or does not match
  const direct = async (user, cookie, over = {}) => {
    resetCount();
    const req = new Request("https://guild.example/api/admin/audit-log?window=all", { headers: cookie ? { Cookie: cookie } : {} });
    const res = await adminMod.handleAdmin(req, env(over), "/api/admin/audit-log", user, () => {});
    const text = await res.text();
    return { status: res.status, body: JSON.parse(text), text, statements: COUNT.statements, calls: COUNT.calls.slice() };
  };
  let d = await direct(adminRow, adminCookie);
  check("(control) handleAdmin with the gate's account and its own cookie: 200, the admission the last of four statements (window all: the ids, the page, the names, the admission)", d.status === 200 && d.body.entries.length > 0 && d.statements === 4 && d.calls.at(-1).sql === ADMISSION, d.status, d.statements);
  const unbound = [];
  for (const [label, user, ck] of [["a version other than the cookie's", { ...adminRow, session_version: 2 }, adminCookie], ["another account than the cookie's", { ...adminRow, discord_id: MEMBER }, adminCookie], ["no cookie", adminRow, null], ["a cookie for the right account at a later version", adminRow, await cookieWith(ADMIN, 2, adminE)]]) {
    d = await direct(user, ck);
    if (!(d.status === 401 && bare(d, "signed_out") && d.statements === 0)) unbound.push(`${label}: ${d.status} after ${d.statements} statements`);
  }
  check("the session is bound before any audit read: a cookie that is not the gate's account at the gate's version (another version, another account, none, a later one): 401 and not one statement", unbound.length === 0, unbound);
  d = await direct(adminRow, adminCookie, { SITE_ADMINS: MEMBER });
  check("SITE_ADMINS is checked again at the admission: an account no longer listed gets 401 with nothing of the page, though the fence's row holds", d.status === 401 && bare(d, "signed_out") && d.calls.at(-1).sql === ADMISSION, d.status, d.body);
  check("(no change left armed, the clock back, the account as it was)", BEFORE === null && SHIFT === 0 && JSON.stringify(one("SELECT * FROM site_users WHERE discord_id = ?", ADMIN)) === JSON.stringify(adminRow));

  console.log("\n== reading writes nothing ==");
  const fpBefore = footprint();
  for (const params of [{}, { window: "all" }, { family: "site" }, { actor: ADMIN }, { subject: "x" }, { before: "3" }, { limit: "10" }, { family: "BAD" }, { limit: "1" }]) await log(params);
  await log({}, MEMBER);
  await http("GET", "/api/admin/audit-log");
  check("every table's row count, the audit rows themselves and SQLite's count of changed rows are unchanged after every kind of request (200, 400, 401, 403)", footprint() === fpBefore);

  console.log("\n== the Overview's compatible recent activity is safe and fenced ==");
  const marker = "LEGACY-AUDIT-PRIVATE-MARKER", recentIds = [];
  for (let i = 0; i < 180; i++) {
    const id = put(i % 3 ? "site.denied" : "role.restored", { actor: ADMIN, subject: i % 2 ? MEMBER : null, details: JSON.stringify({ reason: marker, ticket: marker, code: marker, error: marker, caseId: marker, released: i }) });
    if (i % 3) recentIds.push(id);
  }
  const old = await http("GET", "/api/admin/audit", { who: ADMIN });
  const latest = all("SELECT ts, actor, action, subject FROM audit WHERE action LIKE 'site.%' ORDER BY id DESC LIMIT 100");
  check("GET /api/admin/audit retains its 100 newest site actions and five-field row contract", old.status === 200 && old.body.audit.length === 100 && old.body.audit.every(row => Object.keys(row).sort().join() === "action,actor,details,subject,ts") && JSON.stringify(old.body.audit.map(({ details, ...row }) => row)) === JSON.stringify(latest), old.status);
  check("Overview receives an approved string summary plus withholding, never reason/ticket/code/error/case text", old.body.audit.every(row => typeof row.details === "string" && row.details.includes("released") && row.details.includes("withheld")) && !old.text.includes(marker));
  const fullRecent = await log({ family: "site", window: "all", limit: "100" });
  check("both audit surfaces exclude the same historical confidential sentinels", fullRecent.status === 200 && !fullRecent.text.includes(marker) && !old.text.includes(marker));
  check("the compatible recent endpoint still refuses signed-out and non-admin users", (await http("GET", "/api/admin/audit")).status === 401 && (await http("GET", "/api/admin/audit", { who: MEMBER })).status === 403);
  resetCount();
  const recentControl = await http("GET", "/api/admin/audit", { cookie: adminCookie });
  check("the recent read also ends in the same final cookie-bound admission, after building its safe payload", recentControl.status === 200 && COUNT.calls.at(-1).sql === ADMISSION && COUNT.statements - GATE === 2 && JSON.stringify(COUNT.calls.at(-1).params) === JSON.stringify([ADMIN, 1, adminE]));
  BEFORE = { when: sql => sql === ADMISSION, run: () => run(SIGN_OUT, ADMIN, 1) };
  let recentRevoked;
  try { recentRevoked = await http("GET", "/api/admin/audit", { cookie: adminCookie }); } finally { BEFORE = null; }
  check("a session revoked after the recent read receives 401 with no activity payload", recentRevoked.status === 401 && bare(recentRevoked, "signed_out") && !recentRevoked.text.includes('"audit"'));
  restoreAdmin();
  const src = fs.readFileSync(path.join(root, "src", "site-admin.ts"), "utf8");

  console.log("\n== static ==");
  const auditSrc = src.slice(src.indexOf("// ---------- the audit log page ----------"));
  check("the handler writes nothing (no INSERT, UPDATE, DELETE or audit() call in its code)", auditSrc.length > 1000 && !/\b(INSERT|UPDATE|DELETE)\b/.test(auditSrc) && !/\baudit\(env/.test(auditSrc));
  check("  its SQL interpolates only compile-time constants", [...auditSrc.matchAll(/\$\{([^}]+)\}/g)].map((x) => x[1]).every((x) => /^(AUDIT_DETAILS_MAX|args\.length( - 1)?|where\.map\(\(w\) => " AND " \+ w\)\.join\(""\)|fenceSql\("applicantWrite", 1, 2, 3\))$/.test(x)), [...auditSrc.matchAll(/\$\{([^}]+)\}/g)].map((x) => x[1]));
  // A30-AUDIT-01, statically: the page is built without sending anything, the admission is the last await, and the route
  // hands the gate's account to the handler
  const fnOf = (name) => { const at = auditSrc.indexOf(`async function ${name}(`); return at < 0 ? "" : auditSrc.slice(at, auditSrc.indexOf("\n}\n", at) + 3); };
  const admitSrc = fnOf("admitAudit"), pageSrc = fnOf("auditPage"), logSrc = fnOf("auditLog");
  check("the page (auditPage) builds the answer and sends nothing: no apiJson in it; both early returns are the answer itself", pageSrc.length > 1000 && !/apiJson/.test(pageSrc) && (pageSrc.match(/return \{ entries: \[\]/g) || []).length === 2);
  check("  the admission (admitAudit) has exactly one await, its one statement, and returns the prebuilt answer, a 401 or a 503", (admitSrc.match(/\bawait\b/g) || []).length === 1 && /return apiJson\(page\);\n\}/.test(admitSrc) && /fenceSql\("applicantWrite", 1, 2, 3\)/.test(admitSrc) && /isSiteAdmin\(env, s\.u\)/.test(admitSrc));
  check("  the handler (auditLog) binds the session before the page and ends in the admission; the route hands it the gate's account", logSrc.indexOf("readSession(env, request)") > 0 && logSrc.indexOf("readSession(env, request)") < logSrc.indexOf("auditPage(env, p)") && /return admitAudit\(env, session, page\);\n\}/.test(logSrc) && src.includes("return auditLog(request, env, q, admin);"));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  check("this suite runs in test:all, after owner_requests_test", /owner_requests_test\.cjs && node tests\/site_audit_test\.cjs/.test(pkg.scripts["test:all"]));

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

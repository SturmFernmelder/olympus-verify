// Build .115 (3 Oct 2026, Viktor's item A of 2 Oct): News (src/site-news.ts), through the REAL src/*.ts (transpiled by
// TypeScript itself) against the REAL schema.sql in SQLite (node:sqlite), every HTTP request through the real index.ts
// fetch and the cron through the real scheduled(). Only Discord's HTTP side is stubbed; nothing leaves the process. The
// suite's clock runs two hours behind the database's (SQLite's own strftime('%s','now')), so a lifetime computed from the
// actor's clock instead of the database's would show. Covers:
//   - the switch: off by default (404 news_off, a create 409 news_off), switched on in Admin -> Settings and audited;
//   - access: 401 signed out, 403 guild_unconfirmed, the exact DTO for a confirmed member, standing lost between the
//     context read and the admitted batch (no payload), News switched off in that same seam (news_off, no payload),
//     nothing in /api/public or the signed-out boot but the boolean;
//   - notices: SITE_ADMINS only, the page check, exact field rules (nothing cut, control characters out, newlines kept,
//     markup stored literally), lifetimes in database seconds, expired / period_passed / stale_revision, replay and
//     op_conflict, the 20-notice cap, the tombstone after a delete and after expiry + cleanup, a replay whose author lost
//     standing, counts-only audit rows; a stale delete of an expired notice answered with its id and revision only, never
//     its text; the operation id handed out with the database's time and taken for 30 days, so a retry whose record the
//     cleanup removed is refused for its age (Codex's findings 3 and 5, 3 Oct 2026);
//   - the cleanup (bounded batches, the audit row, a ledger row never purged while its notice exists), erasure and the copy;
//   - the figures: complete and trusted endpoints only, the three-hour throttle, no anti-join when nothing moved, a latest
//     snapshot that does not count keeps the stored row, a probe between member batches, masked application counts, off,
//     and switched off between a run's reads and its write (nothing written; Codex's finding 4);
//   - the real scheduled(): the .115 lines' D1 round trips on a throttled and on a computing run, and the whole run's count
//     (the figures read the switch from the cleanup's batch: no round trip of their own when off or fresh);
//   - events, the directory's stamp (on the hour), the beta's dates and the release notes;
//   - static checks, the vocabulary guard over every source file .115 changes (digests only: this file names nobody), the
//     schema in all three places;
//   - the second review round (3 Oct 2026): members get no notice id (its first eight characters say when an administrator
//     opened Admin -> News); the policy keeps event titles, which organizers type, out of the figures that carry no name,
//     and states the 30-day posting window inside the 120-day record; a simulated restore with the runbook's News
//     statements (read from it): notices changed or deleted since the copy are gone, the records of notices posted since
//     are back, and every frozen retry is 409 deleted (without the statements, the old text returns and a retry reposts).
// Run from the worker folder:  node tests/site_news_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript"), crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const repo = path.join(root, "..");

// ---------- a D1-shaped wrapper over SQLite, with hooks and a round-trip counter ----------
let HOOK = null; // (sql, phase) => void: act when a statement is prepared ("prepare")
let BEFORE_BATCH = null; // (sqls) => void: act just before a batch runs
let AFTER_BATCH = null; // async (sqls) => void: act between two batches (roster.ts writes members 50 to a batch)
let COUNT = { trips: 0, statements: 0, sqls: [] };
const resetCount = () => { COUNT = { trips: 0, statements: 0, sqls: [] }; };
function d1(dbh) {
  const exec = (sql, params) => {
    const st = dbh.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    HOOK?.(sql, "prepare");
    let params = [];
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
      first: async () => { COUNT.trips++; COUNT.statements++; COUNT.sqls.push(sql); return dbh.prepare(sql).get(...params) ?? null; },
      all: async () => { COUNT.trips++; COUNT.statements++; COUNT.sqls.push(sql); return { results: dbh.prepare(sql).all(...params) }; },
      run: async () => { COUNT.trips++; COUNT.statements++; COUNT.sqls.push(sql); return exec(sql, params); },
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      COUNT.trips++;
      COUNT.statements += stmts.length;
      COUNT.sqls.push(...stmts.map((s) => s._sql));
      BEFORE_BATCH?.(stmts.map((s) => s._sql));
      dbh.exec("BEGIN");
      let out;
      try { out = stmts.map((s) => s._exec()); dbh.exec("COMMIT"); } catch (e) { dbh.exec("ROLLBACK"); throw e; }
      if (AFTER_BATCH) await AFTER_BATCH(stmts.map((s) => s._sql));
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
fresh();

// ---------- the real modules; only Discord's HTTP side and the notice poster are stubbed ----------
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
  "./review": { onVerified: async () => {} },
};
/** A module graph of its own (the scheduled-budget comparison loads the Worker once more with the .115 cron work stubbed). */
function makeLoader(extra = {}) {
  const cache = {};
  const load = (name) => {
    if (extra[name]) return extra[name];
    if (stubs[name]) return stubs[name];
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
    return mod.exports;
  };
  return load;
}
const load = makeLoader();
const indexMod = load("./index"), news = load("./site-news"), siteCore = load("./site-core"), roster = load("./roster"), schema = load("./schema"), leadership = load("./site-leadership");

const RealDate = Date;
const realNow = () => Math.floor(RealDate.now() / 1000);
let T = realNow() - 7200; // the actor's clock, two hours behind the database's
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const H = 3600, DAY = 86400;
const GUILD = "236932545793490944", ADMIN = "472099715253796864", ADMIN2 = "472099715253796865", MEMBER = "300000000000000003", PLAIN = "300000000000000004", MEMBER2 = "300000000000000005";
const env = (over = {}) => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: GUILD, DISCORD_APP_ID: "1550176895671341076", DISCORD_CLIENT_SECRET: "client-secret", DISCORD_PUBLIC_KEY: "00", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: GUILD, SITE_ADMINS: `${ADMIN},${ADMIN2}`, ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Officer Olly", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "directory,events", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const quiet = async (fn) => { const real = console.error, lines = []; console.error = (...a) => { lines.push(a.map(String).join(" ")); }; try { return { value: await fn(), lines }; } finally { console.error = real; } };
const siteUser = (id, over = {}) => run("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, 0, 1) ON CONFLICT(discord_id) DO NOTHING", id, over.username ?? "u" + id.slice(-2), T, T);
const confirm = (id, name) => {
  run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING", id);
  run("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?, ?, ?, 'member', ?)", name.toLowerCase(), name, id, T - DAY);
};
const people = () => { siteUser(ADMIN); confirm(ADMIN, "Admin Ada"); siteUser(ADMIN2); confirm(ADMIN2, "Admin Abe"); siteUser(MEMBER); confirm(MEMBER, "Mia One"); siteUser(MEMBER2); confirm(MEMBER2, "Max Two"); siteUser(PLAIN); };
const cookieFor = async (id) => (await siteCore.sessionCookie(env(), id, 1)).split(";")[0];
async function http(method, url, { who, body, page = "2", over = {} } = {}) {
  const h = new Headers();
  if (who) h.set("Cookie", await cookieFor(who));
  const u = new URL(url, "https://guild.example");
  if (method !== "GET" && method !== "HEAD") { if (page !== null) h.set("X-Olympus", page); h.set("Origin", u.origin); }
  if (body !== undefined) h.set("Content-Type", "application/json");
  const res = await indexMod.default.fetch(new Request(u, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  let json = null;
  try { json = await res.clone().json(); } catch { /* the HTML pages */ }
  return { status: res.status, body: json, text: json === null ? await res.text() : null };
}
const newsGet = (who, over) => http("GET", "/api/news", { who, over });
const create = (who, body, opts = {}) => http("POST", "/api/admin/news", { who, body, ...opts });
const update = (who, body, opts = {}) => http("POST", "/api/admin/news/update", { who, body, ...opts });
const remove = (who, body, opts = {}) => http("POST", "/api/admin/news/delete", { who, body, ...opts });
const switchNews = (on) => http("PUT", "/api/admin/settings", { who: ADMIN, body: { newsOn: on } });
// Codex's finding 5 (3 Oct 2026 13:15 UTC): a create's id carries the database's time when the server handed it out, in
// its first eight base64url characters (48 bits). The suite stamps its ids once, with the database clock at the start
// (the suite runs well inside the 30-day window), through Buffer: an encoding of its own, so site-news.ts's arithmetic is
// checked as well.
const stampOf = (t) => { const b = Buffer.alloc(6); b.writeUIntBE(t, 0, 6); return b.toString("base64url"); };
const issuedOf = (id) => Buffer.from(id.slice(0, 8), "base64url").readUIntBE(0, 6);
const idAt = (t, tail) => stampOf(t) + String(tail).padEnd(14, "x");
const ISSUED = realNow();
const op = (k) => idAt(ISSUED, "Op" + String(k));
// The write limit (20 a minute) and the read limit (30 a minute) run on the actor's clock: a section moves it past the window.
const tick = () => { T += 61; };
const keys = (o) => Object.keys(o).sort().join(",");
// Expire a notice by the DATABASE clock (its CHECK needs retain_until > created_at).
const expire = (id) => { const r = realNow() - 1; run("UPDATE site_news_notices SET created_at = ?, updated_at = ?, retain_until = ? WHERE id = ?", r - DAY, r - DAY, r, id); };
const auditRows = (action) => all("SELECT * FROM audit WHERE action = ? ORDER BY id", action);
// Roster snapshots as roster.ts leaves them, with their member rows.
const snap = (names, { first, exportedAt = first, receivedAt = first, trusted = 1, complete = 1 } = {}) => {
  const id = Number(run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'h', ?, ?, ?)", exportedAt, receivedAt, names.length, trusted, complete, first).lastInsertRowid);
  for (const nm of names) run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, ?, ?)", id, nm.toLowerCase(), nm);
  return id;
};
const figuresRow = () => one("SELECT value, updated_at, updated_by FROM site_settings WHERE key = 'newsFigures'");
const storedFigures = () => { const r = figuresRow(); return r ? JSON.parse(r.value) : null; };
const newsOnRow = () => run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL) ON CONFLICT(key) DO UPDATE SET value = '1'", T);
const app = (id, { created, status = "submitted", reviewed = null }) =>
  run("INSERT INTO site_applications (discord_id, position, answers, status, reviewed_at, created_at, updated_at) VALUES (?, 'member', '{}', ?, ?, ?, ?)", id, status, reviewed, created, created);

(async () => {
  people();

  console.log("\n== the switch: off by default ==");
  let r = await newsGet(MEMBER);
  check("a confirmed member gets 404 news_off while News is off (the default; no row means off)", r.status === 404 && r.body.error === "news_off", r);
  r = await create(ADMIN, { id: op(1), title: "Raid night moved", body: "Thursday instead of Wednesday.", days: 30 });
  check("  a create is 409 news_off, and nothing is stored, not even an operation record", r.status === 409 && r.body.error === "news_off" && one("SELECT COUNT(*) AS c FROM site_news_ops").c === 0 && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 0, r);
  let pub = await http("GET", "/api/public");
  check("  /api/public says newsOn false", pub.body.settings.newsOn === false);
  r = await switchNews(true);
  const settingsAudit = auditRows("site.settings").at(-1);
  check("PUT /api/admin/settings {newsOn: true} switches it on; the audit records newsOn '1'", r.status === 200 && r.body.settings.newsOn === true && JSON.parse(settingsAudit.details).newsOn === "1", settingsAudit);
  check("  only a site admin can (403 for a member)", (await http("PUT", "/api/admin/settings", { who: MEMBER, body: { newsOn: false } })).status === 403);

  console.log("\n== access to the page ==");
  r = await newsGet(null);
  check("signed out: 401", r.status === 401);
  r = await newsGet(PLAIN);
  check("in the server without a roster-confirmed character: 403 guild_unconfirmed", r.status === 403 && r.body.error === "guild_unconfirmed", r.body);
  const DENIED = "300000000000000006";
  siteUser(DENIED); confirm(DENIED, "Den Ied"); run("UPDATE site_users SET denied = 1 WHERE discord_id = ?", DENIED);
  r = await newsGet(DENIED);
  check("a permanently denied account with a confirmed character: 403 denied", r.status === 403 && r.body.error === "denied", r.body);
  r = await newsGet(MEMBER);
  check("a confirmed member: 200 with exactly the DTO keys", r.status === 200 && keys(r.body) === "beta,events,figures,leadership,notices,now,releases,seats", r.body && keys(r.body));
  check("  the seat state is the members' shape (no reason, no exact time)", keys(r.body.seats) === "asOf,cap,free,members,source,state,visitorsUrl" && r.body.seats.state === "unknown", r.body.seats);
  check("  no figures yet (null), no notices, the release notes, the beta's last full day", r.body.figures === null && r.body.notices.length === 0 && r.body.releases.length >= 1 && r.body.beta.lastFullDay === "2026-10-21");
  check("  no digest field and no author anywhere", !/digest/i.test(JSON.stringify(r.body)) && !JSON.stringify(r.body).includes("createdBy"));
  // standing lost between the context read and the admitted batch: the probe is prepared last, just before the batch runs
  HOOK = (sql, phase) => { if (phase === "prepare" && /^SELECT \(EXISTS \(SELECT 1 FROM site_users fu/.test(sql)) { run("UPDATE characters SET status = 'left' WHERE discord_id = ?", MEMBER); HOOK = null; } };
  r = await newsGet(MEMBER);
  check("a member whose roster proof goes between the context read and the batch: 403 guild_unconfirmed, no payload", r.status === 403 && r.body.error === "guild_unconfirmed" && !("notices" in r.body), r.body);
  run("UPDATE characters SET status = 'member' WHERE discord_id = ?", MEMBER);
  // review of 3 Oct 2026: the switch is judged inside the admitted batch, so a read racing "switch off" gets no payload
  HOOK = (sql, phase) => { if (phase === "prepare" && /^SELECT \(EXISTS \(SELECT 1 FROM site_users fu/.test(sql)) { run("UPDATE site_settings SET value = '0' WHERE key = 'newsOn'"); HOOK = null; } };
  r = await newsGet(MEMBER);
  check("News switched off between the switch read and the admitted batch: 404 news_off, no payload", r.status === 404 && r.body.error === "news_off" && !("notices" in r.body) && !("seats" in r.body), r.body);
  run("UPDATE site_settings SET value = '1' WHERE key = 'newsOn'");
  check("  the admitted batch's first payload statement reads the switch (NEWS_ON_SQL)", /admittedRead\(env, ctx, "confirmedGuildData", \[\s*env\.DB\.prepare\(`SELECT \(\$\{NEWS_ON_SQL\}\) AS news_on`\)/.test(fs.readFileSync(path.join(root, "src", "site-news.ts"), "utf8")));
  let reads = [];
  for (let k = 0; k < 31; k++) reads.push((await newsGet(MEMBER2)).status);
  check("thirty reads a minute: the 31st is 429 slow_down", reads.slice(0, 30).every((x) => x === 200) && reads[30] === 429, reads.slice(28));

  console.log("\n== notices: who, and the page check ==");
  r = await create(MEMBER, { id: op(1), title: "Hello", body: "Text", days: 30 });
  check("a confirmed member who is not a site admin cannot post (403)", r.status === 403);
  check("  nor edit, delete or list the notices (403 each)", (await update(MEMBER, { id: op(1), revision: 1, title: "x", body: "y", days: 1 })).status === 403 && (await remove(MEMBER, { id: op(1), revision: 1 })).status === 403 && (await http("GET", "/api/admin/news", { who: MEMBER })).status === 403);
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "Text", days: 30 }, { page: "1" });
  check("a page older than PAGE_VERSION (X-Olympus 1): 409 reload", r.status === 409 && r.body.error === "reload" && siteCore.PAGE_VERSION !== "1");
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "Text", days: 30 }, { page: null });
  check("  without X-Olympus at all: refused as not from this page (403)", r.status === 403 && r.body.error === "bad_origin");
  check("  nothing stored by any of them", one("SELECT COUNT(*) AS c FROM site_news_ops").c === 0);

  console.log("\n== notices: the fields, nothing cut ==");
  tick();
  r = await create(ADMIN, { id: op(1), title: "x".repeat(81), body: "Text", days: 30 });
  check("an 81-character title: 400 field title", r.status === 400 && r.body.field === "title");
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "y".repeat(2001), days: 30 });
  check("a 2001-character body: 400 field body", r.status === 400 && r.body.field === "body");
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "Text", days: 2 });
  check("days outside the list: 400 field days", r.status === 400 && r.body.field === "days");
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "Text", days: "30" });
  check("  days as a string: 400", r.status === 400 && r.body.field === "days");
  r = await create(ADMIN, { id: "short", title: "Hello", body: "Text", days: 30 });
  check("an id that is not 22 characters: 400 field id", r.status === 400 && r.body.field === "id");
  r = await create(ADMIN, { id: op(1), title: "Hello", body: "Text", days: 30, extra: 1 });
  check("an extra key: 400 invalid_request (exact key sets)", r.status === 400 && r.body.error === "invalid_request");
  r = await create(ADMIN, { id: op(1), title: "   ", body: "Text", days: 30 });
  check("a blank title: 400", r.status === 400 && r.body.field === "title");
  check("  nothing stored by any refusal", one("SELECT COUNT(*) AS c FROM site_news_ops").c === 0 && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 0);
  const before = realNow();
  r = await create(ADMIN, { id: op(1), title: "Raid\u0007 night\nmoved", body: "Thursday\u0000 instead\n\nof Wednesday.\u0007\n<img src=x onerror=1>", days: 30 });
  const n1 = one("SELECT * FROM site_news_notices WHERE id = ?", op(1));
  check("an admin posts a notice: 200 with the stored notice", r.status === 200 && r.body.notice && r.body.notice.id === op(1) && r.body.notice.revision === 1, r);
  check("  control characters out, the title on one line, the body's newlines kept", n1.title === "Raid night moved" && n1.body === "Thursday instead\n\nof Wednesday.\n<img src=x onerror=1>", n1);
  check("  markup is stored and returned literally (the page renders text)", r.body.notice.body.endsWith("<img src=x onerror=1>"));
  check("  the lifetime comes from the database clock: created_at is the database's now, not the actor's, and retain_until - created_at = 30 days", n1.created_at >= before && n1.created_at <= realNow() + 1 && n1.created_at - T > H && n1.retain_until - n1.created_at === 30 * DAY, { created: n1.created_at, T, real: before });
  const op1 = one("SELECT * FROM site_news_ops WHERE id = ?", op(1));
  check("  its operation record: the author, the same time, kept 120 days", op1.created_by === ADMIN && op1.created_at === n1.created_at && op1.purge_after - op1.created_at === 120 * DAY);
  let a = auditRows("site.news_notice").at(-1);
  check("  the audit row carries only {op, live}: no title, no body", a.subject === op(1) && a.actor === ADMIN && keys(JSON.parse(a.details)) === "live,op" && JSON.parse(a.details).op === "created" && JSON.parse(a.details).live === 1 && !/Raid|Thursday/.test(a.details), a);
  r = await create(ADMIN, { id: op(1), title: "Raid\u0007 night\nmoved", body: "Thursday\u0000 instead\n\nof Wednesday.\u0007\n<img src=x onerror=1>", days: 30 });
  check("the same id and payload again: replay true, one row, no second audit row", r.status === 200 && r.body.replay === true && r.body.notice.id === op(1) && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 1 && auditRows("site.news_notice").length === 1, r);
  r = await create(ADMIN, { id: op(1), title: "Something else", body: "Other", days: 30 });
  check("the same id with another payload: 409 op_conflict", r.status === 409 && r.body.error === "op_conflict");
  r = await create(ADMIN2, { id: op(1), title: "Raid\u0007 night\nmoved", body: "Thursday\u0000 instead\n\nof Wednesday.\u0007\n<img src=x onerror=1>", days: 30 });
  check("  another admin with the same id and payload: 409 op_conflict", r.status === 409 && r.body.error === "op_conflict");

  console.log("\n== the member's view of a notice ==");
  r = await newsGet(MEMBER);
  // review of 3 Oct 2026: no id for members, since its first eight characters are the second an administrator opened Admin -> News
  check("the member sees it: {title, body, postedAt, editedAt, until}, in seconds, no author and no id (the operation id is nowhere in the answer)", r.status === 200 && r.body.notices.length === 1 && keys(r.body.notices[0]) === "body,editedAt,postedAt,title,until" && r.body.notices[0].postedAt === n1.created_at && r.body.notices[0].until === n1.retain_until && r.body.notices[0].editedAt === null && !JSON.stringify(r.body).includes(op(1)), r.body.notices);
  pub = await http("GET", "/api/public");
  const signedOut = await http("GET", "/");
  check("no notice text in /api/public or the signed-out page", [JSON.stringify(pub.body), signedOut.text].every((t) => typeof t === "string" && !t.includes("Raid night moved") && !t.includes("Thursday instead") && !t.includes("onerror=1")));

  console.log("\n== edit ==");
  tick();
  T += 120;
  r = await update(ADMIN2, { id: op(1), revision: 1, title: "Raid night moved", body: "Thursday, 20:00 server time.", days: 7 });
  let n1b = one("SELECT * FROM site_news_notices WHERE id = ?", op(1));
  check("another admin edits it: revision 2, the new text, updated_by the editor", r.status === 200 && r.body.notice.revision === 2 && n1b.body === "Thursday, 20:00 server time." && n1b.updated_by === ADMIN2 && n1b.created_by === ADMIN, r);
  check("  the lifetime counts from the posting, in database seconds: retain_until - created_at = 7 days; op_hash unchanged", n1b.retain_until - n1b.created_at === 7 * DAY && n1b.op_hash === n1.op_hash && n1b.created_at === n1.created_at);
  check("  audited {op: 'edited', live}", JSON.parse(auditRows("site.news_notice").at(-1).details).op === "edited" && keys(JSON.parse(auditRows("site.news_notice").at(-1).details)) === "live,op");
  r = await newsGet(MEMBER);
  check("  the member sees editedAt", r.body.notices[0].editedAt === n1b.updated_at && r.body.notices[0].body === "Thursday, 20:00 server time.");
  r = await update(ADMIN, { id: op(1), revision: 1, title: "Stale", body: "Stale", days: 7 });
  check("an edit from revision 1 after that: 409 stale_revision with the current notice; the first writer's row is intact", r.status === 409 && r.body.error === "stale_revision" && r.body.notice.revision === 2 && one("SELECT body FROM site_news_notices WHERE id = ?", op(1)).body === "Thursday, 20:00 server time.", r.body);
  r = await update(ADMIN, { id: op(9), revision: 1, title: "Nope", body: "Nope", days: 7 });
  check("an edit of a notice that does not exist: 404 not_found", r.status === 404 && r.body.error === "not_found");
  r = await update(ADMIN, { id: op(1), revision: 2, title: "x".repeat(81), body: "b", days: 7 });
  check("  an edit is validated like a create (81-character title: 400)", r.status === 400 && r.body.field === "title");
  // a notice posted two days ago (by the database clock): a one-day period has already passed
  r = await create(ADMIN, { id: op(2), title: "Old notice", body: "Posted earlier", days: 30 });
  { const c = realNow() - 2 * DAY; run("UPDATE site_news_notices SET created_at = ?, updated_at = ?, retain_until = ? WHERE id = ?", c, c, c + 30 * DAY, op(2)); }
  r = await update(ADMIN, { id: op(2), revision: 1, title: "Old notice", body: "Shorter", days: 1 });
  check("an edit whose new period has already passed since posting: 400 period_passed", r.status === 400 && r.body.error === "period_passed" && one("SELECT body FROM site_news_notices WHERE id = ?", op(2)).body === "Posted earlier", r.body);
  r = await update(ADMIN, { id: op(2), revision: 1, title: "Old notice", body: "Longer", days: 3 });
  check("  three days still lie ahead: saved, retain_until = posting + 3 days", r.status === 200 && one("SELECT retain_until - created_at AS d FROM site_news_notices WHERE id = ?", op(2)).d === 3 * DAY);
  expire(op(2));
  r = await update(ADMIN, { id: op(2), revision: 2, title: "Old notice", body: "Again", days: 30 });
  check("an edit after expiry: 409 expired", r.status === 409 && r.body.error === "expired", r.body);
  r = await newsGet(MEMBER);
  let adm = await http("GET", "/api/admin/news", { who: ADMIN });
  // the member's notices carry no id (review of 3 Oct 2026), so the member side is judged by what it shows: only the live one
  check("an expired notice is gone from the member's and the admin's reads at once", r.body.notices.length === 1 && r.body.notices[0].title === "Raid night moved" && r.body.notices.every((x) => x.title !== "Old notice" && x.body !== "Longer") && adm.body.notices.every((x) => x.id !== op(2)), r.body.notices);
  check("  the admin's view counts it as awaiting cleanup, with the operation records and the switch", adm.status === 200 && adm.body.awaitingCleanup === 1 && adm.body.operationRecords === 2 && adm.body.newsOn === true && adm.body.limits.liveMax === 20 && adm.body.notices[0].createdBy === ADMIN && adm.body.notices[0].updatedBy === ADMIN2, adm.body);
  r = await create(ADMIN, { id: op(2), title: "Old notice", body: "Posted earlier", days: 30 });
  check("  a replay of the expired notice's create: 409 expired, never posted again", r.status === 409 && r.body.error === "expired", r.body);

  console.log("\n== the tombstone ==");
  tick();
  r = await create(ADMIN, { id: op(3), title: "Short-lived", body: "Gone soon", days: 1 });
  r = await remove(ADMIN, { id: op(3), revision: 1 });
  check("delete: 200, the notice is gone, its operation record stays", r.status === 200 && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(3)) && !!one("SELECT 1 FROM site_news_ops WHERE id = ?", op(3)));
  a = auditRows("site.news_notice").at(-1);
  check("  audited {op: 'deleted', live} with the count after the delete", JSON.parse(a.details).op === "deleted" && JSON.parse(a.details).live === one(`SELECT COUNT(*) AS c FROM site_news_notices WHERE retain_until > CAST(strftime('%s','now') AS INTEGER)`).c);
  r = await create(ADMIN, { id: op(3), title: "Short-lived", body: "Gone soon", days: 1 });
  check("a stale 'Retry the same' after the delete: 409 deleted, zero rows", r.status === 409 && r.body.error === "deleted" && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(3)), r.body);
  r = await remove(ADMIN, { id: op(3), revision: 1 });
  check("  deleting it again: 404 not_found", r.status === 404 && r.body.error === "not_found");
  let sw = await news.sweepSiteNews(env(), realNow());
  check("the cleanup deletes the expired notice (op 2) and keeps its operation record", sw.deleted === 1 && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(2)) && !!one("SELECT 1 FROM site_news_ops WHERE id = ?", op(2)), sw);
  r = await create(ADMIN, { id: op(2), title: "Old notice", body: "Posted earlier", days: 30 });
  check("  create, expire, sweep, replay: 409 deleted, zero rows", r.status === 409 && r.body.error === "deleted" && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(2)));
  r = await create(ADMIN, { id: op(4), title: "Fresh", body: "New", days: 14 });
  check("(another notice posted)", r.status === 200);
  BEFORE_BATCH = (sqls) => { if (sqls.some((q) => /INSERT INTO site_news_ops/.test(q))) { run("UPDATE site_users SET in_server = 0 WHERE discord_id = ?", ADMIN); BEFORE_BATCH = null; } };
  r = await create(ADMIN, { id: op(4), title: "Fresh", body: "New", days: 14 });
  check("a replay whose author left the server between the gate and the batch: a refusal (403 not_member), not the notice", r.status === 403 && r.body.error === "not_member" && !r.body.notice, r.body);
  run("UPDATE site_users SET in_server = 1 WHERE discord_id = ?", ADMIN);
  r = await create(ADMIN, { id: op(4), title: "Fresh", body: "New", days: 14 }, { over: { SITE_ADMINS: ADMIN2 } });
  check("  a replay after the author lost SITE_ADMINS: refused (403), not replayed", r.status === 403 && !r.body.notice);
  r = await remove(ADMIN, { id: op(4), revision: 3 });
  check("delete with a stale revision: 409 stale_revision, the notice kept", r.status === 409 && r.body.error === "stale_revision" && !!one("SELECT 1 FROM site_news_notices WHERE id = ?", op(4)));
  r = await switchNews(false);
  r = await create(ADMIN, { id: op(5), title: "While off", body: "No", days: 1 });
  check("with News switched off: a create is 409 news_off", r.status === 409 && r.body.error === "news_off");
  r = await update(ADMIN, { id: op(4), revision: 1, title: "Fresh", body: "Changed", days: 14 });
  check("  an edit is 409 news_off", r.status === 409 && r.body.error === "news_off");
  r = await remove(ADMIN, { id: op(4), revision: 1 });
  check("  a delete still works (it is cleanup)", r.status === 200 && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(4)));
  await switchNews(true);

  // backend-review.md control 3: create, edit, let the notice's time run out by the database clock, then delete with the
  // revision from before the edit.
  console.log("\n== a delete refusal never carries an expired notice's text (Codex's finding 3, 3 Oct 2026 13:15 UTC) ==");
  tick();
  r = await create(ADMIN, { id: op(6), title: "Expiring headline", body: "Expiring words", days: 7 });
  r = await update(ADMIN2, { id: op(6), revision: 1, title: "Expiring headline", body: "Expiring words, edited", days: 7 });
  check("(posted, then edited by another admin: revision 2)", r.status === 200 && r.body.notice.revision === 2, r.body);
  r = await remove(ADMIN, { id: op(6), revision: 1 });
  check("a stale delete of a LIVE notice: 409 stale_revision with the admitted live notice, its title and text; the notice kept", r.status === 409 && r.body.error === "stale_revision" && r.body.notice.id === op(6) && r.body.notice.revision === 2 && r.body.notice.title === "Expiring headline" && r.body.notice.body === "Expiring words, edited" && !!one("SELECT 1 FROM site_news_notices WHERE id = ?", op(6)), r.body);
  expire(op(6));
  const noticeAuditsAt = auditRows("site.news_notice").length;
  r = await remove(ADMIN, { id: op(6), revision: 1 });
  check("the same stale delete once its time is up by the database clock: 409 stale_revision with only {id, revision}; no title and no text anywhere in the answer", r.status === 409 && r.body.error === "stale_revision" && keys(r.body.notice) === "id,revision" && r.body.notice.id === op(6) && r.body.notice.revision === 2 && !/Expiring/.test(JSON.stringify(r.body)), r.body);
  check("  the refusal deleted nothing and wrote no audit row", !!one("SELECT 1 FROM site_news_notices WHERE id = ?", op(6)) && auditRows("site.news_notice").length === noticeAuditsAt);
  r = await remove(ADMIN, { id: op(6), revision: 2 });
  a = auditRows("site.news_notice").at(-1);
  check("deleting it with the current revision after expiry still works (cleanup): 200, the notice gone, its operation record kept as the tombstone, audited 'deleted'", r.status === 200 && r.body.ok === true && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(6)) && !!one("SELECT 1 FROM site_news_ops WHERE id = ?", op(6)) && a.subject === op(6) && JSON.parse(a.details).op === "deleted", r.body);
  r = await create(ADMIN, { id: op(6), title: "Expiring headline", body: "Expiring words", days: 7 });
  check("  and its 'Retry the same' meets the tombstone: 409 deleted, nothing posted", r.status === 409 && r.body.error === "deleted" && !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(6)), r.body);

  // The tombstone is finite (120 days from the create), so a page's id must expire before its record can go. The server
  // hands the id out with the database's time in it and takes it for 30 days.
  console.log("\n== the operation id: handed out with the database's time, taken for 30 days (Codex's finding 5, 3 Oct 2026 13:15 UTC) ==");
  tick();
  const L5 = news.NEWS_LIMITS;
  check("the id's window (30 days) is shorter than its record's life (120 days from the create), which outlives every notice (90 days)", L5.opIssueMaxAgeS === 30 * DAY && L5.opsKeepS === 120 * DAY && L5.opIssueMaxAgeS < L5.opsKeepS && L5.days[L5.days.length - 1] * DAY < L5.opsKeepS);
  const t0 = realNow();
  adm = await http("GET", "/api/admin/news", { who: ADMIN });
  const t1 = realNow();
  const handed = adm.body.opId;
  check("GET /api/admin/news hands out opId: 22 characters, the first eight the database's time of the read (not the actor's clock, two hours behind)", typeof handed === "string" && /^[A-Za-z0-9_-]{22}$/.test(handed) && issuedOf(handed) >= t0 && issuedOf(handed) <= t1 + 1 && issuedOf(handed) - T > H && adm.body.limits.opIssueMaxAgeS === 30 * DAY, handed, { t0, T });
  const handed2 = (await http("GET", "/api/admin/news", { who: ADMIN })).body.opId;
  check("  each read hands out another id (fourteen random characters after the time)", typeof handed2 === "string" && handed2.slice(8) !== handed.slice(8));
  r = await create(ADMIN, { id: handed, title: "From a fresh page", body: "Body", days: 7 });
  check("a create under the handed-out id: posted under it", r.status === 200 && r.body.notice.id === handed, r.body);
  const nothingFor = (id) => !one("SELECT 1 FROM site_news_ops WHERE id = ?", id) && !one("SELECT 1 FROM site_news_notices WHERE id = ?", id) && !auditRows("site.news_notice").some((x) => x.subject === id);
  const staleId = idAt(realNow() - 30 * DAY - 60, "Stale");
  r = await create(ADMIN, { id: staleId, title: "From an old page", body: "Body", days: 7 });
  check("an id handed out 30 days and a minute ago: 409 stale_page in words; no operation record, no notice, no audit row", r.status === 409 && r.body.error === "stale_page" && r.body.message.includes("within 30 days") && nothingFor(staleId), r.body);
  const edgeId = idAt(realNow() - 30 * DAY + H, "Edge");
  r = await create(ADMIN, { id: edgeId, title: "From a page opened 29 days ago", body: "Body", days: 7 });
  check("  one handed out an hour inside the window: posted", r.status === 200 && r.body.notice.id === edgeId, r.body);
  const futureId = idAt(realNow() + H, "Future");
  r = await create(ADMIN, { id: futureId, title: "From the future", body: "Body", days: 7 });
  check("  an id stamped an hour ahead of the database clock: 409 stale_page, nothing stored", r.status === 409 && r.body.error === "stale_page" && nothingFor(futureId), r.body);
  const madeUp = "Op5".padEnd(22, "x"), zeroId = "A".repeat(22);
  r = await create(ADMIN, { id: madeUp, title: "A made-up id", body: "Body", days: 7 });
  let r2 = await create(ADMIN, { id: zeroId, title: "A made-up id", body: "Body", days: 7 });
  check("  ids the server never handed out (the shape a page made itself before; all zero bits): 409 stale_page each, nothing stored", r.status === 409 && r.body.error === "stale_page" && r2.status === 409 && r2.body.error === "stale_page" && nothingFor(madeUp) && nothingFor(zeroId), r.body, r2.body);
  // The boundary end to end: a page opened 121 days ago posted a notice at once, the notice was deleted, its record is past
  // purge_after and the cleanup removes it. The page's frozen "Retry the same" is refused for its age; without the
  // window it would have posted the notice again.
  const ancientId = idAt(realNow() - 121 * DAY, "Ancient");
  { const c = realNow() - 121 * DAY + 60; run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", ancientId, ADMIN, c, c + 120 * DAY); }
  sw = await news.sweepSiteNews(env(), realNow());
  check("(the cleanup removes that record: past purge_after, its notice gone)", sw.opsDeleted >= 1 && !one("SELECT 1 FROM site_news_ops WHERE id = ?", ancientId), sw);
  r = await create(ADMIN, { id: ancientId, title: "Deleted long ago", body: "Body", days: 7 });
  check("its 'Retry the same' after the record is gone: 409 stale_page, nothing posted again", r.status === 409 && r.body.error === "stale_page" && nothingFor(ancientId), r.body);
  const keptId = idAt(realNow() - 31 * DAY, "Kept");
  { const c = realNow() - 31 * DAY + 60; run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", keptId, ADMIN, c, c + 120 * DAY); }
  r = await create(ADMIN, { id: keptId, title: "Deleted a month ago", body: "Body", days: 7 });
  check("  an id past its window whose record is still kept: the record answers first (409 deleted), nothing posted", r.status === 409 && r.body.error === "deleted" && !one("SELECT 1 FROM site_news_notices WHERE id = ?", keptId), r.body);

  console.log("\n== at most 20 live notices ==");
  run("DELETE FROM site_news_notices");
  tick();
  for (let k = 0; k < 20; k++) await create(ADMIN, { id: op(100 + k), title: `Notice ${k}`, body: "Body", days: 1 });
  tick();
  check("(20 live)", one("SELECT COUNT(*) AS c FROM site_news_notices").c === 20);
  r = await create(ADMIN, { id: op(200), title: "One too many", body: "Body", days: 1 });
  check("a 21st: 409 too_many, and no operation record for it", r.status === 409 && r.body.error === "too_many" && !one("SELECT 1 FROM site_news_ops WHERE id = ?", op(200)), r.body);
  r = await newsGet(MEMBER);
  check("  the member reads all 20, newest first", r.body.notices.length === 20);
  const noticeAudits = auditRows("site.news_notice");
  check("every site.news_notice audit row holds only {op, live}: no title or body anywhere in the log", noticeAudits.length > 20 && noticeAudits.every((x) => keys(JSON.parse(x.details)) === "live,op") && !all("SELECT details FROM audit").some((x) => /Notice 1|Raid night|Thursday|Old notice|Short-lived/.test(x.details ?? "")));

  console.log("\n== the cleanup ==");
  for (let k = 0; k < 3; k++) expire(op(100 + k));
  sw = await news.sweepSiteNews(env(), realNow(), 2);
  let swAudit = auditRows("site.news_expired").at(-1);
  check("bounded: limit 2 deletes 2 of the 3 expired and reports 1 remaining", sw.deleted === 2 && sw.remaining === 1 && swAudit.actor === "cron" && keys(JSON.parse(swAudit.details)) === "deleted,opsDeleted,remaining" && JSON.parse(swAudit.details).remaining === 1, sw);
  sw = await news.sweepSiteNews(env(), realNow(), 2);
  check("  the next run takes the rest", sw.deleted === 1 && sw.remaining === 0);
  const auditsBefore = auditRows("site.news_expired").length;
  sw = await news.sweepSiteNews(env(), realNow(), 2);
  check("  a run with nothing to do writes no audit row", sw.deleted === 0 && sw.opsDeleted === 0 && sw.remaining === 0 && auditRows("site.news_expired").length === auditsBefore);
  run("UPDATE site_news_ops SET purge_after = created_at + 1");
  sw = await news.sweepSiteNews(env(), realNow() + 10, 500);
  check("operation records past purge_after go, except those whose notice still exists", one("SELECT COUNT(*) AS c FROM site_news_ops").c === 17 && sw.opsDeleted > 0 && all("SELECT id FROM site_news_ops").every((x) => !!one("SELECT 1 FROM site_news_notices WHERE id = ?", x.id)), sw);

  console.log("\n== erasure and the account copy ==");
  tick();
  run("DELETE FROM site_news_notices"); run("DELETE FROM site_news_ops");
  await create(ADMIN2, { id: op(300), title: "By the second admin", body: "Body", days: 30 });
  await create(ADMIN, { id: op(301), title: "By the first admin", body: "Body", days: 30 });
  await update(ADMIN2, { id: op(301), revision: 1, title: "By the first admin", body: "Edited by the second", days: 30 });
  await create(ADMIN2, { id: op(302), title: "Deleted one", body: "Body", days: 30 });
  await remove(ADMIN2, { id: op(302), revision: 1 });
  let copy = await http("GET", "/api/me/export", { who: ADMIN2 });
  const cn = copy.body && copy.body.community && copy.body.community.news;
  check("the second admin's copy lists the notices they wrote or last changed (title and dates) and their deleted notice's id", copy.status === 200 && cn && cn.notices.map((x) => x.id).sort().join() === [op(300), op(301)].sort().join() && cn.notices.every((x) => keys(x) === "editedAt,id,keptUntil,postedAt,title") && cn.deletedNotices.length === 1 && cn.deletedNotices[0].id === op(302) && keys(cn.deletedNotices[0]) === "id,keptUntil,postedAt", cn);
  check("  in ISO-8601", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(cn.notices[0].postedAt));
  copy = await http("GET", "/api/me/export", { who: MEMBER });
  check("a member's copy carries community.news with two empty lists", copy.status === 200 && JSON.stringify(copy.body.community.news) === JSON.stringify({ notices: [], deletedNotices: [] }), copy.body && copy.body.community);
  r = await http("POST", `/api/admin/users/${ADMIN2}/delete`, { who: ADMIN, body: {} });
  check("deleteSiteData of the second admin: the notices stay, their author and editor fields are NULL, the ledger row's author too", r.status === 200 && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 2 && !one("SELECT 1 FROM site_news_notices WHERE created_by = ? OR updated_by = ?", ADMIN2, ADMIN2) && !one("SELECT 1 FROM site_news_ops WHERE created_by = ?", ADMIN2) && one("SELECT created_by FROM site_news_notices WHERE id = ?", op(301)).created_by === ADMIN, r);
  check("  the registry names the feature", load("./community-context").communityDataNames().includes("news"));
  siteUser(ADMIN2); // back for the rest of the suite

  console.log("\n== events, the directory's stamp, the beta, the release notes ==");
  tick();
  const ev = (id, title, startsAt, status = "scheduled") =>
    run("INSERT INTO community_events (id, op_id, title, details, starts_at, duration_min, ends_at, status, created_by, created_at, updated_at, retain_until) VALUES (?, ?, ?, 'secret details', ?, 60, ?, ?, ?, ?, ?, ?)", id, id, title, startsAt, startsAt + 3600, status, ADMIN, T, T, startsAt + 3600 + 30 * DAY);
  for (let k = 0; k < 6; k++) ev(("E" + k).padEnd(22, "e"), `Raid ${k}`, T + (k + 1) * DAY);
  ev("Ecancel".padEnd(22, "e"), "Cancelled raid", T + 2 * H, "cancelled");
  ev("Efar".padEnd(22, "e"), "Far raid", T + 15 * DAY);
  ev("Epast".padEnd(22, "e"), "Past raid", T - DAY);
  r = await newsGet(MEMBER);
  check("events on: the next scheduled ones in 14 days, at most 5, {id, title, startsAt, durationMin} only", r.body.events.length === 5 && r.body.events.every((e) => keys(e) === "durationMin,id,startsAt,title") && r.body.events[0].title === "Raid 0" && r.body.events[0].startsAt === T + DAY && r.body.events[0].durationMin === 60, r.body.events);
  check("  nothing cancelled, far or past; no creator, details or sign-ups", !JSON.stringify(r.body.events).match(/Cancelled|Far raid|Past raid|secret|created|signup/i));
  r = await newsGet(MEMBER, { COMMUNITY_FEATURES: "directory" });
  check("events off: events null", r.status === 200 && r.body.events === null);
  r = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: Array.from({ length: 10 }, (_, i) => (i === 0 ? { gm: "Zed Leader", officers: ["Quill Officer"] } : { gm: "", officers: [] })), namesConfirmed: true } }); // item C: names added need the tick
  const lrow = one("SELECT updated_at FROM site_settings WHERE key = 'leadership'");
  r = await newsGet(MEMBER);
  check("leadership.updatedAt is the directory row's updated_at rounded down to the hour (review of 3 Oct 2026), and no name from the directory appears in the News JSON", r.body.leadership.updatedAt === Math.floor(lrow.updated_at / H) * H && r.body.leadership.updatedAt % H === 0 && !JSON.stringify(r.body).includes("Zed Leader") && !JSON.stringify(r.body).includes("Quill Officer"), r.body.leadership, lrow);
  check("beta: the last full day and launchAt from the settings", r.body.beta.lastFullDay === "2026-10-21" && r.body.beta.launchAt === (await http("GET", "/api/public")).body.settings.launchAt);
  check("releases: the newest first, at most 5, plain {build, date, lines}", r.body.releases.length >= 1 && r.body.releases.length <= 5 && r.body.releases.every((x) => keys(x) === "build,date,lines"));

  console.log("\n== the figures ==");
  fresh(); people(); newsOnRow();
  // pre-.115 rows only: an old one never checked, and the latest back-filled (complete, trusted, no first arrival)
  run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count) VALUES (?, ?, 'addon', 3)", T - 3 * DAY, T - 3 * DAY);
  run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, trusted, complete) VALUES (?, ?, 'addon', 3, 1, 1)", T - 2 * H, T - H);
  let outcome = await news.refreshNewsFigures(env(), T);
  let f = storedFigures();
  check("only pre-.115 snapshots: computed, roster day and week null, counting not begun", outcome === "computed" && f.roster.day === null && f.roster.week === null && f.countingSince === null && f.dayBaseId === null, f);
  r = await newsGet(MEMBER);
  check("  the member's figures are exactly {asOf, countingSince, roster, applications}; no snapshot id anywhere", keys(r.body.figures) === "applications,asOf,countingSince,roster" && !/latestId|BaseId|"v":/.test(JSON.stringify(r.body)), r.body.figures);
  fresh(); people(); newsOnRow();
  const sA = snap(["Ana", "Bo", "Cy"], { first: T - 30 * H });
  const sB = snap(["Ana", "Bo", "Dee", "Eve"], { first: T - H });
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T);
  f = storedFigures();
  check("first arrivals T-30h (Ana, Bo, Cy) and T-1h (Ana, Bo, Dee, Eve): day {joined 2, left 1}; no week base yet", outcome === "computed" && JSON.stringify(f.roster.day) === JSON.stringify({ joined: 2, left: 1 }) && f.roster.week === null && f.latestId === sB && f.dayBaseId === sA && f.weekBaseId === null, f);
  check("  four round trips on a computing run (switch, ids, counts, the compare-and-set write)", COUNT.trips === 4, COUNT.trips);
  check("  counting began at the first complete trusted export; members see it on the hour", f.countingSince === T - 30 * H && (await newsGet(MEMBER)).body.figures.countingSince === Math.floor((T - 30 * H) / H) * H);
  check("  the cache is written by nobody (updated_by NULL)", figuresRow().updated_by === null);
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T + 2 * H);
  check("a second run within 3 h does nothing: one round trip, no write", outcome === "fresh" && COUNT.trips === 1 && storedFigures().asOf === T, COUNT);
  const settingRows = () => all("SELECT key, value FROM site_settings WHERE key IN ('newsOn', 'newsFigures')");
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T + 2 * H, settingRows());
  check("  given the rows the cleanup's batch read (newsCron), a fresh run costs no round trip at all", outcome === "fresh" && COUNT.trips === 0, COUNT);
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T + 3 * H + 1);
  check("after 3 h with the same snapshot ids: recomputed without any anti-join", outcome === "computed" && !COUNT.sqls.some((q) => /NOT EXISTS \(SELECT 1 FROM roster_members b/.test(q)) && JSON.stringify(storedFigures().roster.day) === JSON.stringify({ joined: 2, left: 1 }) && storedFigures().asOf === T + 3 * H + 1, COUNT.sqls);
  const keep = figuresRow().value;
  const unusable = async (label, prep, over = {}) => {
    run("UPDATE site_settings SET value = json_set(value, '$.asOf', ?) WHERE key = 'newsFigures'", T - 4 * H);
    const stored = figuresRow().value;
    const id = prep();
    resetCount();
    const o = await news.refreshNewsFigures(env(over), T);
    check(`a ${label} latest keeps the stored row and writes nothing`, o === "unusable" && figuresRow().value === stored && !COUNT.sqls.some((q) => /UPDATE site_settings|INSERT OR IGNORE INTO site_settings/.test(q)), o);
    if (id) run("DELETE FROM roster_snapshots WHERE id = ?", id);
  };
  await unusable("distrusted", () => snap(["Ana"], { first: T - 600, trusted: 0 }));
  await unusable("still being written (complete 0)", () => snap(["Ana"], { first: T - 600, complete: 0 }));
  await unusable("pre-LINKS_NOT_BEFORE", () => null, { LINKS_NOT_BEFORE: String(T - 30 * 60) });
  await unusable("stale (exported more than 48 h ago)", () => snap(["Ana"], { first: T - 600, exportedAt: T - 49 * H }));
  check("(the stored figures are those of the last good run)", JSON.parse(figuresRow().value).latestId === JSON.parse(keep).latestId);
  // a probe between two member batches of a real export: the new snapshot is complete 0, so nothing is cached from it
  run("UPDATE site_settings SET value = json_set(value, '$.asOf', ?) WHERE key = 'newsFigures'", T - 4 * H);
  const storedBefore = figuresRow().value;
  let probe = null;
  AFTER_BATCH = async (sqls) => {
    if (probe || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    probe = "running";
    probe = { outcome: await news.refreshNewsFigures(env(), T), value: figuresRow().value };
  };
  await roster.ingestRoster(env(), T - 60, Array.from({ length: 120 }, (_, i) => ({ name: `Mem${String(i).padStart(4, "0")}`, rank: "Member", rankIndex: 3 })), "addon");
  AFTER_BATCH = null;
  check("a run between two member batches of an export: unusable, the stored row unchanged", probe && probe.outcome === "unusable" && probe.value === storedBefore, probe && probe.outcome);
  // applications: masked below five, decisions only accepted or declined
  for (let k = 0; k < 6; k++) app(`40000000000000000${k}`, { created: T - H });
  app("400000000000000010", { created: T - 10 * DAY, status: "accepted", reviewed: T - H });
  app("400000000000000011", { created: T - 10 * DAY, status: "declined", reviewed: T - 2 * H });
  app("400000000000000012", { created: T - 10 * DAY, status: "accepted", reviewed: T - 3 * DAY });
  app("400000000000000013", { created: T - 10 * DAY, status: "withdrawn", reviewed: T - H });
  run("UPDATE site_settings SET value = json_set(value, '$.asOf', ?) WHERE key = 'newsFigures'", T - 4 * H);
  outcome = await news.refreshNewsFigures(env(), T);
  f = storedFigures();
  check("applications: 6 first saved today show 6; 2 decided today and 3 this week show 'few'; a withdrawal is not a decision", outcome === "computed" && f.applications.day.firstSaved === 6 && f.applications.day.decided === "few" && f.applications.week.decided === "few" && f.applications.week.firstSaved === 6, f.applications);
  check("  no raw count below five is stored", !/"(firstSaved|decided)":[1-4][,}]/.test(figuresRow().value));
  r = await newsGet(MEMBER);
  check("  the member reads the same masked figures", r.body.figures.applications.day.decided === "few" && r.body.figures.applications.day.firstSaved === 6);
  run("UPDATE site_settings SET value = '0' WHERE key = 'newsOn'");
  run("UPDATE site_settings SET value = json_set(value, '$.asOf', ?) WHERE key = 'newsFigures'", T - 4 * H);
  const offBefore = figuresRow().value;
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T);
  check("News off: nothing computed (one round trip, no write)", outcome === "off" && COUNT.trips === 1 && figuresRow().value === offBefore);
  resetCount();
  outcome = await news.refreshNewsFigures(env(), T, settingRows());
  check("  and none at all given the cleanup's rows", outcome === "off" && COUNT.trips === 0);
  // backend-review.md control 4 (Codex's finding 4, 3 Oct 2026 13:15 UTC): a run paused after its reads (the switch, the
  // snapshot ids, the counts), News switched off, then its write released
  const midRun = async (switchOff) => {
    run("UPDATE site_settings SET value = '1' WHERE key = 'newsOn'");
    let paused = false;
    AFTER_BATCH = async (sqls) => { if (!paused && sqls.some((q) => /FROM site_applications/.test(q))) { paused = true; if (switchOff) run("UPDATE site_settings SET value = '0' WHERE key = 'newsOn'"); } };
    try { return { outcome: await news.refreshNewsFigures(env(), T), paused }; } finally { AFTER_BATCH = null; }
  };
  run("UPDATE site_settings SET value = json_set(value, '$.asOf', ?) WHERE key = 'newsFigures'", T - 4 * H);
  const midBefore = figuresRow().value;
  let mid = await midRun(true);
  check("News switched off after a run's reads and before its write: the write reads the switch again, nothing is written, the stored row stays (superseded)", mid.paused && mid.outcome === "superseded" && figuresRow().value === midBefore, mid);
  tick();
  r = await newsGet(MEMBER);
  check("  members still get news_off", r.status === 404 && r.body.error === "news_off" && !("figures" in r.body), r.body);
  run("DELETE FROM site_settings WHERE key = 'newsFigures'");
  mid = await midRun(true);
  check("  with no stored figures yet: no row is inserted either", mid.paused && mid.outcome === "superseded" && figuresRow() === undefined, mid);
  run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsFigures', ?, ?, NULL) ON CONFLICT(key) DO UPDATE SET value = excluded.value", midBefore, T - 4 * H);
  mid = await midRun(false);
  check("  the same pause with News left on: computed and written", mid.paused && mid.outcome === "computed" && figuresRow().value !== midBefore && storedFigures().asOf === T, mid);
  run("UPDATE site_settings SET value = '1' WHERE key = 'newsOn'");
  run("UPDATE site_settings SET value = 'not json' WHERE key = 'newsFigures'");
  check("an unreadable cached row reads as no figures for members", (await newsGet(MEMBER)).body.figures === null);

  console.log("\n== the real scheduled(): the .115 lines' D1 budget ==");
  const ALL_ON = { COMMUNITY_FEATURES: "directory,crafting,events,attendance,trials,restrictions,departures,privacy_intake,contributions", CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "400", PRIVACY_INTAKE_ENABLED: "true" };
  const validFigures = (asOf) => JSON.stringify({ v: 1, asOf, latestId: 1, dayBaseId: null, weekBaseId: null, countingSince: null, roster: { day: null, week: null }, applications: { day: { firstSaved: 0, decided: 0 }, week: { firstSaved: 0, decided: 0 } } });
  const seed = (throttled) => () => {
    people(); newsOnRow();
    if (throttled) run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsFigures', ?, ?, NULL)", validFigures(T - 60), T - 60);
    snap(["Ana", "Bo", "Cy"], { first: T - 8 * DAY, exportedAt: T - 8 * DAY });
    snap(["Ana", "Bo", "Dee"], { first: T - 30 * H });
    snap(["Ana", "Bo", "Dee", "Eve"], { first: T - H });
    const c = T - 10 - DAY;
    run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", op(900), ADMIN, c, c + 120 * DAY);
    run("INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until) VALUES (?, 'h', 'Old', 'Old', 1, 'n', ?, ?, ?, ?, ?)", op(900), ADMIN, c, ADMIN, c, T - 10);
  };
  const NEWS_STUB = { "./site-news": { newsCron: async () => {}, sweepSiteNews: async () => ({}), refreshNewsFigures: async () => "off", newsPage: async () => null, handleNewsAdmin: async () => null } };
  const scheduledRun = async (seedFn, extra) => {
    fresh(); seedFn();
    const loadRun = makeLoader(extra);
    const idx = loadRun("./index");
    const pending = [];
    resetCount();
    await quiet(async () => {
      await idx.default.scheduled({}, env(ALL_ON), { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); } });
      await Promise.all(pending);
    });
    return { trips: COUNT.trips, statements: COUNT.statements };
  };
  for (const throttled of [true, false]) {
    const label = throttled ? "throttled" : "computing";
    const without1 = await scheduledRun(seed(throttled), NEWS_STUB);
    const without2 = await scheduledRun(seed(throttled), NEWS_STUB);
    const withNews = await scheduledRun(seed(throttled), {});
    const extra = withNews.trips - without1.trips;
    const limit = throttled ? 2 : 5; // review of 3 Oct 2026: the figures read the switch from the cleanup's batch
    check(`(the comparison is deterministic: two runs without the .115 lines count the same, ${without1.trips} round trips)`, without1.trips === without2.trips && without1.statements === without2.statements, without1, without2);
    check(`a ${label} run: the .115 lines add ${extra} D1 round trips (at most ${limit}) and ${withNews.statements - without1.statements} statements`, extra >= 1 && extra <= limit, { withNews, without1 });
    console.log(`    the whole scheduled run with every community feature on (${label}): ${withNews.trips} round trips, ${withNews.statements} statements`);
    check(`  the ${label} run did its work: the expired notice swept${throttled ? ", the figures left as they were" : ", the figures computed"}`, !one("SELECT 1 FROM site_news_notices WHERE id = ?", op(900)) && (throttled ? storedFigures().asOf === T - 60 : storedFigures().asOf === T && storedFigures().roster.week !== null));
  }

  // The second review round (3 Oct 2026): a restore used to replay only the deletions, so a notice changed on request
  // since the copy came back with its earlier text, and a notice posted and deleted since the copy had neither a row nor a
  // record there, so a page opened before the restore could post it again with "Retry the same" (its id still inside its
  // 30 days). docs/launch-runbook.md section 1 now reads, by subject and time only, the statements that delete every
  // restored notice changed or deleted since the copy and put back the record of every notice posted since; they are read
  // from the runbook and run here as the owner would run them: the SELECT on the database being replaced, its node line
  // over wrangler's --json shape, the .sql file on a restored copy.
  console.log("\n== a restore keeps News as the requests left it (docs/launch-runbook.md section 1) ==");
  {
    const os = require("os"), { execFileSync } = require("child_process");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "olympus-news-restore-"));
    try {
      fresh(); people(); newsOnRow(); tick();
      const A = 510, B = 511, C = 512, D = 513, E = 514; // A changed after the copy, B deleted, C left alone; D posted and deleted after it, E posted after it
      const form = (k) => ({ id: op(k), title: `Restore ${k}`, body: `Text ${k} names Quill Quester`, days: 30 });
      const made = [];
      for (const k of [A, B, C]) made.push((await create(ADMIN, form(k))).status);
      const copyAt = realNow(); // the copy's time by the database clock
      const copies = [path.join(tmp, "copy1.db"), path.join(tmp, "copy2.db")];
      for (const f of copies) db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
      tick();
      made.push((await update(ADMIN, { id: op(A), revision: 1, title: "Restore 510", body: "Text 510, the name taken out on request", days: 30 })).status);
      made.push((await remove(ADMIN, { id: op(B), revision: 1 })).status);
      made.push((await create(ADMIN, form(D))).status, (await remove(ADMIN, { id: op(D), revision: 1 })).status);
      made.push((await create(ADMIN, form(E))).status);
      check("(the fixture: A, B, C posted before the copy; after it A changed, B deleted, D posted and deleted, E posted)", made.every((x) => x === 200) && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 3, made);

      // right before the restore: the runbook's News statement, read from the runbook
      const runbookText = fs.readFileSync(path.join(repo, "docs", "launch-runbook.md"), "utf8");
      const NEWS_SELECT = (/--command "(SELECT stmt FROM \(SELECT 1 AS o, subject AS id, [^"]*)" > <private dir>\/news\.json/.exec(runbookText) || [])[1] || "";
      const nodeLine = (/node -e "([^"]*)" <private dir>\/news\.json > <private dir>\/news\.sql/.exec(runbookText) || [])[1] || "";
      const outsideLiterals = (sql) => sql.replace(/'(?:[^']|'')*'/g, "''");
      check("the runbook's News statement is one read-only SELECT of the audit, by subject and time (<since>), with the record's 120 days in seconds", NEWS_SELECT.length > 200 && !!nodeLine && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|PRAGMA)\b/i.test(outsideLiterals(NEWS_SELECT)) && /FROM audit WHERE action = 'site\.news_notice' AND ts >= <since>/.test(NEWS_SELECT) && NEWS_SELECT.includes(`(MIN(ts) + ${news.NEWS_LIMITS.opsKeepS})`) && !/\b(title|body)\b/.test(outsideLiterals(NEWS_SELECT)), NEWS_SELECT.slice(0, 120));
      const select = NEWS_SELECT.split("<since>").join(String(copyAt - 300));
      // a missing or broken statement fails the checks below instead of stopping the suite (the file is then empty)
      let sqlFile = "";
      try {
        fs.writeFileSync(path.join(tmp, "news.json"), JSON.stringify([{ results: db.prepare(select).all(), success: true, meta: {} }]));
        sqlFile = execFileSync(process.execPath, ["-e", nodeLine, path.join(tmp, "news.json")], { encoding: "utf8" });
      } catch { sqlFile = ""; }
      const lines = sqlFile.trim().split("\n");
      const del = (k) => `DELETE FROM site_news_notices WHERE id = '${op(k)}';`;
      const createdTs = (k) => one("SELECT MIN(ts) AS t FROM audit WHERE action = 'site.news_notice' AND subject = ? AND json_extract(details, '$.op') = 'created'", op(k)).t;
      const keep = (k) => `INSERT OR IGNORE INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES ('${op(k)}', 'restored', NULL, ${createdTs(k)}, ${createdTs(k) + 120 * DAY});`;
      const expected = [del(A), del(B), del(D), ...[A, B, C, D, E].map(keep)];
      const postedD = createdTs(D), postedE = createdTs(E); // read from the database being replaced, before the restore
      check("right before the restore: a DELETE for each notice changed or deleted since the copy (A, B, D), then a record for each one posted since (the margin adds A, B and C, whose records the copy already holds)", lines.join("\n") === expected.join("\n"), lines);
      check("  the file holds ids and times only: no title, no text, no author", !/Restore 5|Text 5|Quill|name taken out/.test(sqlFile) && !sqlFile.includes(ADMIN));

      const restore = (file) => { db = new DatabaseSync(file); db.exec("PRAGMA foreign_keys = ON"); };
      // the gap, on a restore without the file: the old text is back and a frozen retry posts the deleted D again
      restore(copies[0]);
      tick();
      r = await newsGet(MEMBER);
      const retryD = await create(ADMIN, form(D));
      check("(without the file: A is back with its old text, and D's frozen \"Retry the same\" posts it again)", r.status === 200 && r.body.notices.some((x) => x.body === "Text 510 names Quill Quester") && retryD.status === 200, { notices: r.body.notices && r.body.notices.map((x) => x.body), retryD: retryD.status });
      db.close();

      // the restore as the runbook has it: the file right after it
      restore(copies[1]);
      if (sqlFile) db.exec(sqlFile);
      const tables = () => JSON.stringify([all("SELECT * FROM site_news_notices ORDER BY id"), all("SELECT * FROM site_news_ops ORDER BY id")]);
      const afterFile = tables();
      check("after the file: A (changed since) and B (deleted since) are gone, C is as it was; no notice holds the old text", !one("SELECT 1 AS x FROM site_news_notices WHERE id IN (?, ?)", op(A), op(B)) && one("SELECT body FROM site_news_notices WHERE id = ?", op(C)).body === "Text 512 names Quill Quester" && !one("SELECT 1 AS x FROM site_news_notices WHERE body = 'Text 510 names Quill Quester'"));
      const recs = all("SELECT id, nonce, created_by, created_at, purge_after FROM site_news_ops WHERE id IN (?, ?) ORDER BY id", op(D), op(E));
      check("  D and E have their records back: no author, their posting time, kept 120 days from it", recs.length === 2 && recs.every((x) => x.nonce === "restored" && x.created_by === null && x.purge_after - x.created_at === news.NEWS_LIMITS.opsKeepS) && typeof postedD === "number" && recs[0].created_at === postedD && recs[1].created_at === postedE, recs);
      check("  the records the copy already held (A, B, C) are untouched by the margin's statements", all("SELECT nonce FROM site_news_ops WHERE id IN (?, ?, ?)", op(A), op(B), op(C)).every((x) => x.nonce !== "restored"));
      tick();
      r = await newsGet(MEMBER);
      check("  the member sees only C: neither A's earlier text nor B", r.status === 200 && r.body.notices.length === 1 && r.body.notices[0].title === "Restore 512", r.body.notices);
      const retries = [];
      for (const k of [A, B, D, E]) retries.push(await create(ADMIN, form(k)));
      check("  every frozen \"Retry the same\" from a page opened before the restore is 409 deleted: A, B, D and E are never posted again", retries.every((x) => x.status === 409 && x.body.error === "deleted") && one("SELECT COUNT(*) AS c FROM site_news_notices").c === 1, retries.map((x) => x.status + " " + (x.body && x.body.error)));
      if (sqlFile) db.exec(sqlFile);
      check("  the file run again changes nothing", !!sqlFile && tables() === afterFile);
      const swept = await news.sweepSiteNews(env());
      check("  the cleanup keeps the records until their 120 days are up", swept.opsDeleted === 0 && one("SELECT COUNT(*) AS c FROM site_news_ops WHERE id IN (?, ?)", op(D), op(E)).c === 2);
      db.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fresh();
    }
  }

  console.log("\n== static ==");
  const src = fs.readFileSync(path.join(root, "src", "site-news.ts"), "utf8");
  const build = /const BUILD = "(\d{4}-\d{2}-\d{2})\.(\d+)/.exec(fs.readFileSync(path.join(root, "src", "index.ts"), "utf8"));
  const notes = news.RELEASE_NOTES;
  const num = (b) => Number(b.slice(1));
  check("the newest release note is not newer than index.ts BUILD", build && notes.length > 0 && /^\.\d+$/.test(notes[0].build) && num(notes[0].build) <= Number(build[2]), build && build[2], notes[0] && notes[0].build);
  check("  builds unique and descending; dates YYYY-MM-DD; lines 1..200 characters, plain text", notes.every((x, i) => i === 0 || num(x.build) < num(notes[i - 1].build)) && new Set(notes.map((x) => x.build)).size === notes.length && notes.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.lines.length > 0 && x.lines.every((l) => typeof l === "string" && l.length > 0 && l.length <= 200 && !/[<>]/.test(l))));
  const forbidden = ["LEADERSHIP_KEY", "/static/", "<svg", "data" + ":", "notify(", "rest("];
  check("site-news.ts names no leadership row key, no static path, no inline svg, no data URI, no notice poster, no Discord REST", forbidden.every((w) => !src.includes(w)), forbidden.filter((w) => src.includes(w)));
  check("  every console call in site-news.ts goes through errorRef", (src.match(/console\.(error|warn|log)\([^\n]*/g) || []).every((l) => /errorRef\(/.test(l)));
  const stampSql = leadership.leadershipStampStatement({ DB: { prepare: (sql) => ({ bind: (...p) => ({ sql, p }) }) } });
  check("leadershipStampStatement selects only updated_at of the directory row", stampSql.sql === "SELECT updated_at FROM site_settings WHERE key = ?1" && stampSql.p.length === 1 && stampSql.p[0] === "leadership");
  const users = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && fs.readFileSync(path.join(root, "src", f), "utf8").includes("leadershipStampStatement"));
  check("  only site-news.ts uses it (besides its own module)", users.sort().join() === "site-leadership.ts,site-news.ts", users);
  const idx = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");
  check("the cron line: newsCron, the sweep always, then the figures behind their own switch, each step's failure logged through errorRef", /ctx\.waitUntil\(newsCron\(env\)\);/.test(idx) && src.includes('console.error("site news sweep failed", errorRef(e));') && src.includes('console.error("news figures failed", errorRef(e));') && /known = \(await sweepSiteNews\(env\)\)\.settings;[\s\S]*?await refreshNewsFigures\(env, now\(\), known\);/.test(src));

  // .116 News policy regression: real account forms, current curated export and held self-service actions.
  // These requests use the actual index and original native signing/verification, never a policy/profile override.
  {
    const savedDb = db, savedT = T, savedHook = HOOK, savedBefore = BEFORE_BATCH, savedAfter = AFTER_BATCH, savedCount = COUNT;
    let controlDb = null;
    try {
      controlDb = new DatabaseSync(":memory:"); db = controlDb;
      db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
      T = realNow() - 7200; HOOK = null; BEFORE_BATCH = null; AFTER_BATCH = null; resetCount();
      const controlLoad = makeLoader(), controlIndex = controlLoad("./index"), controlCore = controlLoad("./site-core");
      controlLoad("./schema").forgetSchemaCheck(); people();
      const liveId = "N".repeat(22), goneId = "G".repeat(22), otherId = "F".repeat(22);
      const putNotice = (id, author, title) => run("INSERT INTO site_news_notices (id, op_hash, title, body, created_by, created_at, updated_by, updated_at, retain_until) VALUES (?, 'fixture-only', ?, 'Fixture notice body', ?, ?, ?, ?, ?)", id, title, author, T, author, T, T + 30 * DAY);
      putNotice(liveId, ADMIN2, "Own fixture notice"); putNotice(otherId, ADMIN, "Other fixture notice");
      run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'fixture-only', ?, ?, ?)", goneId, ADMIN2, T, T + 120 * DAY);
      const sessionFor = async (who, version = 1) => (await controlCore.sessionCookie(env(), who, version)).split(";")[0];
      const sendAccount = async (method, route, { session = "", nonce = "", fields, origin = "https://guild.example" } = {}) => {
        const headers = new Headers();
        if (session || nonce) headers.set("Cookie", [session, nonce].filter(Boolean).join("; "));
        if (method === "POST") { headers.set("Origin", origin); headers.set("Content-Type", "application/x-www-form-urlencoded"); }
        const result = await controlIndex.default.fetch(new Request("https://guild.example" + route, { method, headers, body: fields === undefined ? undefined : new URLSearchParams(fields).toString() }), env(), ctx);
        const text = await result.text(); let body = null;
        try { body = JSON.parse(text); } catch { /* script-free HTML */ }
        return { status: result.status, headers: result.headers, text, body };
      };
      const formFor = (text, action) => {
        const form = (text.match(new RegExp('<form method="post" action="' + action + '">([\\s\\S]*?)</form>')) || [])[1] || "";
        return (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "";
      };
      const recordTables = ["site_users", "site_news_notices", "site_news_ops"];
      const recordsSnapshot = () => JSON.stringify(recordTables.map(table => all("SELECT * FROM " + table + " ORDER BY 1")));
      const auditRecords = () => all("SELECT * FROM audit ORDER BY id");
      const snapshot = () => JSON.stringify([recordsSnapshot(), auditRecords()]);
      const priorAudit = auditRecords(), recordsBefore = recordsSnapshot();
      const expectedCopyAudits = (actors) => {
        const rows = auditRecords(), added = rows.slice(priorAudit.length);
        return rows.length === priorAudit.length + actors.length && JSON.stringify(rows.slice(0, priorAudit.length)) === JSON.stringify(priorAudit)
          && added.every((row, i) => keys(row) === "action,actor,details,id,subject,ts" && Number.isSafeInteger(row.id) && row.id > 0 && row.ts === T && row.actor === actors[i] && row.subject === actors[i] && row.action === "site.copy_exported" && row.details === null);
      };
      const before = snapshot(), adminSession = await sessionFor(ADMIN2), memberSession = await sessionFor(MEMBER);
      let page = await sendAccount("GET", "/privacy/account");
      check("current account page without a site session offers no copy form and states that automatic deletion/unlink are unavailable", page.status === 200 && !page.text.includes('action="/privacy/account/export"') && page.text.includes("Automatic site-only erasure, full-tool erasure and local Battle.net unlink are not available yet.") && snapshot() === before);
      page = await sendAccount("GET", "/privacy/account", { session: adminSession });
      const nonce = (page.headers.get("Set-Cookie") || "").split(";")[0], csrf = formFor(page.text, "/privacy/account/export");
      check("the actual account page issues an original signed session-bound export form and a private one-hour nonce cookie", page.status === 200 && /^__Host-olg_privacy_form=[A-Za-z0-9_-]{43}$/.test(nonce) && /Secure; HttpOnly; SameSite=Strict; Max-Age=3600/.test(page.headers.get("Set-Cookie") || "") && /^\d{10}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(csrf) && (page.text.includes("curated partial copy") && page.text.includes("grants no guild access")) && snapshot() === before);
      let response = await sendAccount("POST", "/privacy/account/export", { session: adminSession, fields: { csrf } });
      check("the actual export form refuses a missing nonce cookie without changing stored News/account records", response.status === 403 && response.text.includes("form_expired") && snapshot() === before);
      response = await sendAccount("POST", "/privacy/account/export", { session: adminSession, nonce, fields: { csrf }, origin: "https://other.example" });
      check("the actual export form retains its same-origin admission guard without changing stored records", response.status === 403 && response.text.includes("bad_origin") && snapshot() === before);
      response = await sendAccount("POST", "/privacy/account/export", { session: memberSession, nonce, fields: { csrf } });
      check("the actual export CSRF token cannot be used with another account's genuine site session", response.status === 403 && response.text.includes("form_expired") && snapshot() === before);
      response = await sendAccount("POST", "/privacy/account/export", { session: adminSession, nonce, fields: { csrf, actions: "bad.cursor" } });
      check("the actual export form retains its finite continuation-cursor shape check before making a copy", response.status === 400 && response.text.includes("invalid_form") && snapshot() === before);
      response = await sendAccount("POST", "/privacy/account/export", { session: adminSession, nonce, fields: { csrf } });
      const ownNews = response.body?.community?.news;
      check("a valid actual SSR export contains only the account's authored/edited News and deleted-notice metadata with original exact field lists", response.status === 200 && ownNews?.notices.length === 1 && ownNews.notices[0].id === liveId && keys(ownNews.notices[0]) === "editedAt,id,keptUntil,postedAt,title" && ownNews.deletedNotices.length === 1 && ownNews.deletedNotices[0].id === goneId && keys(ownNews.deletedNotices[0]) === "id,keptUntil,postedAt" && !JSON.stringify(ownNews).includes(otherId) && recordsSnapshot() === recordsBefore && expectedCopyAudits([ADMIN2]), ownNews);
      check("the actual SSR copy states curated partial coverage and completeErasure false, with a genuine database capture time and no-referrer response", response.status === 200 && response.body?.coverage?.kind === "curated_partial" && response.body.coverage.ownAccountOnly === true && response.body.coverage.completeErasure === false && response.body.coverage.excluded.includes("private recovery backups") && Math.abs(Date.parse(response.body.generatedAt) / 1000 - realNow()) < 30 && response.headers.get("Referrer-Policy") === "no-referrer");
      const memberPage = await sendAccount("GET", "/privacy/account", { session: memberSession }), memberNonce = (memberPage.headers.get("Set-Cookie") || "").split(";")[0], memberCsrf = formFor(memberPage.text, "/privacy/account/export");
      response = await sendAccount("POST", "/privacy/account/export", { session: memberSession, nonce: memberNonce, fields: { csrf: memberCsrf } });
      check("a valid member SSR export preserves the registered empty News lists rather than exposing another author's notices", response.status === 200 && JSON.stringify(response.body?.community?.news) === JSON.stringify({ notices: [], deletedNotices: [] }) && recordsSnapshot() === recordsBefore && expectedCopyAudits([ADMIN2, MEMBER]));
      const postCopies = snapshot();
      for (const action of ["site-erase", "full-erase", "bnet-unlink"]) {
        const token = formFor(page.text, "/privacy/account/" + action);
        response = await sendAccount("POST", "/privacy/account/" + action, { session: adminSession, nonce, fields: { csrf: token } });
        check("the actual " + action + " form returns not performed and leaves News authors/account rows untouched", response.status === 503 && response.text.includes("not performed") && response.text.includes("No rows were deleted, no roles changed and no remote connection removed.") && snapshot() === postCopies);
      }
      run("UPDATE site_users SET session_version = 2 WHERE discord_id = ?", ADMIN2);
      const changed = snapshot(), newerSession = await sessionFor(ADMIN2, 2);
      response = await sendAccount("POST", "/privacy/account/export", { session: newerSession, nonce, fields: { csrf } });
      check("the actual export token is bound to the site-session version and refuses a freshly signed replacement version", response.status === 403 && response.text.includes("form_expired") && snapshot() === changed);
      response = await sendAccount("POST", "/privacy/account/export", { session: adminSession, nonce, fields: { csrf } });
      check("the actual export form refuses an invalidated old site session without deleting its News/account records", response.status === 401 && response.text.includes("Session unavailable") && snapshot() === changed);
    } finally {
      controlDb?.close(); db = savedDb; T = savedT; HOOK = savedHook; BEFORE_BATCH = savedBefore; AFTER_BATCH = savedAfter; COUNT = savedCount;
    }
  }


  // .118: rendered continuation is an existing same-path POST, with no script or token-bearing address.
  {
    const savedDb = db, savedT = T, savedHook = HOOK, savedBefore = BEFORE_BATCH, savedAfter = AFTER_BATCH, savedCount = COUNT;
    let historyDb = null;
    try {
      historyDb = new DatabaseSync(":memory:"); db = historyDb;
      db.exec(fs.readFileSync(path.join(root,"schema.sql"),"utf8"));
      T = realNow()-7200; HOOK = null; BEFORE_BATCH = null; AFTER_BATCH = null; resetCount();
      const real = makeLoader(), entry = real("./index"), core = real("./site-core"); real("./schema").forgetSchemaCheck(); people();
      const own = MEMBER2, malicious = '<img src=x onerror="oops">&', insert = db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)");
      for(let i=0;i<1001;i++) insert.run(T,own,i===0?malicious:"rendered."+i,own);
      insert.run(T,ADMIN,"foreign.rendered",ADMIN);
      const session = (await core.sessionCookie(env(),own,1)).split(";")[0];
      const send = async (method,route,{cookie=session,nonce="",fields,origin="https://guild.example"}={}) => {
        const headers = new Headers({Cookie:[cookie,nonce].filter(Boolean).join("; ")});
        if(method==="POST") { headers.set("Origin",origin); headers.set("Content-Type","application/x-www-form-urlencoded"); }
        const result = await entry.default.fetch(new Request("https://guild.example"+route,{method,headers,body:fields===undefined?undefined:new URLSearchParams(fields).toString()}),env(),ctx);
        const text=await result.text(); let body=null; try{body=JSON.parse(text);}catch{ /* Actual script-free HTML. */ }
        return {status:result.status,headers:result.headers,text,body};
      };
      const exportForms = text => [...text.matchAll(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(x=>[x[1],x[2]])));
      const page=await send("GET","/privacy/account"), nonce=(page.headers.get("Set-Cookie")||"").split(";")[0], firstForm=exportForms(page.text)[0];
      const history=await send("POST","/privacy/account/export",{nonce,fields:{csrf:firstForm.csrf,mode:"history"}}), forms=exportForms(history.text);
      const downloadForm=forms.find(x=>x.mode==="download"), nextForm=forms.find(x=>x.mode==="history");
      const savedCursors=text=>Object.fromEntries([...text.matchAll(/<label>(Current-page continuation|Next-page continuation|Saved history-page continuation)<textarea readonly rows="2" spellcheck="false" autocomplete="off">([^<]*)<\/textarea><\/label>/g)].map(x=>[x[1],x[2]]));
      const saved=savedCursors(history.text);
      check(".118 visible readonly continuations match the hidden page positions and explain private same-session resumption", saved["Current-page continuation"]===downloadForm.actions && saved["Next-page continuation"]===nextForm.actions && !/name=/.test((history.text.match(/<textarea readonly[^>]*>/)||[])[0]||"") && history.text.includes("Keep continuation values privately") && history.text.includes('href="/privacy/account"') && history.text.includes("paste a saved value into Saved action continuation") && history.text.includes("Use the same original site session before it expires") && !/[?&]actions=/.test(history.text));
      check(".118 the real history view is script-free HTML with bounded own records, private caching and no file-saved claim", history.status===200 && /text\/html/.test(history.headers.get("Content-Type")||"") && !history.headers.get("Content-Disposition") && /script-src 'none'/.test(history.headers.get("Content-Security-Policy")||"") && /no-store/.test(history.headers.get("Cache-Control")||"") && /no-transform/.test(history.headers.get("Cache-Control")||"") && history.headers.get("Referrer-Policy")==="same-origin" && !/<script\b/i.test(history.text) && history.text.includes("1000 of 1001") && history.text.includes("1 remain") && history.text.includes("does not prove a file was saved"));
      check(".118 own action markup is escaped literally and foreign account rows are absent", history.text.includes("&lt;img src=x onerror=&quot;oops&quot;&gt;&amp;") && !history.text.includes(malicious) && !history.text.includes("foreign.rendered") && (history.text.match(/<li>/g)||[]).length===1000);
      check(".118 Current Download and Next carry signed cursors only in hidden same-path POST fields", forms.length===2 && downloadForm?.csrf && nextForm?.csrf && downloadForm.actions?.length<=140 && nextForm.actions?.length<=140 && /^1\./.test(downloadForm.actions) && /^1\./.test(nextForm.actions) && downloadForm.actions!==nextForm.actions && !/[?&]actions=/.test(history.text) && !history.headers.get("Location") && ![...history.text.matchAll(/(?:action|href)="([^"]*)"/g)].some(x=>x[1].includes(downloadForm.actions)||x[1].includes(nextForm.actions)) && history.text.includes("five copy reads per hour") && history.text.includes("freshly reads its other sections"));
      run("UPDATE site_users SET nick='New name at download' WHERE discord_id=?",own);
      const download=await send("POST","/privacy/account/export",{nonce,fields:downloadForm});
      check(".118 the rendered Current Download returns exactly that history page and labels other sections fresh", download.status===200 && download.headers.get("Content-Disposition")==='attachment; filename="olympus-my-data.json"' && download.headers.get("Referrer-Policy")==="no-referrer" && download.body.actions.entries.length===1000 && download.body.actions.entries[0].action===malicious && download.body.actions.currentCursor===downloadForm.actions && download.body.actions.capture.count===1001 && download.body.actions.capture.delivered===1000 && download.body.account.nickname==="New name at download" && download.body.about.includes("Other sections are freshly read") && download.body.coverage.completeErasure===false);
      const last=await send("POST","/privacy/account/export",{nonce,fields:nextForm}), lastForms=exportForms(last.text);
      check(".118 the final rendered page has one record and only Current Download; completion is explicitly the included retained range", last.status===200 && last.text.includes("1001 of 1001") && last.text.includes("0 remain") && (last.text.match(/<li>/g)||[]).length===1 && lastForms.length===1 && lastForms[0].mode==="download" && !last.text.includes("Next history page") && last.text.includes("does not claim an all-store copy"));
      check(".118 a terminal page offers only its visible current position, without inventing a next continuation", savedCursors(last.text)["Current-page continuation"]===lastForms[0].actions && !("Next-page continuation" in savedCursors(last.text)));
      const before=JSON.stringify(all("SELECT * FROM audit ORDER BY id"));
      const negatives=[
        {label:"unknown mode",fields:{csrf:firstForm.csrf,mode:"erase"},status:400,reason:"invalid_form"},
        {label:"duplicate mode",fields:[["csrf",firstForm.csrf],["mode","history"],["mode","download"]],status:400,reason:"invalid_form"},
        {label:"oversized continuation",fields:{csrf:firstForm.csrf,mode:"history",actions:"A".repeat(141)},status:400,reason:"invalid_form"},
        {label:"missing CSRF",fields:{mode:"history"},status:400,reason:"invalid_form"},
        {label:"wrong CSRF",fields:{csrf:"1.bad.token",mode:"history"},status:403,reason:"form_expired"},
        {label:"wrong origin",fields:{csrf:firstForm.csrf,mode:"history"},origin:"https://other.example",status:403,reason:"bad_origin"},
      ];
      for(const bad of negatives) {
        let batches=0; BEFORE_BATCH=()=>{batches++;}; const refusal=await send("POST","/privacy/account/export",{nonce,...bad}); BEFORE_BATCH=null;
        check(".118 "+bad.label+": original form admission refuses without any admitted payload or copy audit", refusal.status===bad.status && refusal.text.includes(bad.reason) && batches===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===before);
      }
      const parts=nextForm.actions.split("."); parts[8]=(parts[8][0]==="A"?"B":"A")+parts[8].slice(1);
      let batches=0; BEFORE_BATCH=()=>{batches++;}; const badMac=await send("POST","/privacy/account/export",{nonce,fields:{...nextForm,actions:parts.join(".")}}); BEFORE_BATCH=null;
      check(".118 shape-valid wrong-MAC continuation refuses before payload with no false completion", badMac.status===400 && badMac.text.includes("invalid_cursor") && !badMac.text.includes(parts.join(".")) && !badMac.text.includes("included retained action range has been traversed") && batches===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===before);
      for(const query of [nextForm.actions,"1.2"]) {
        batches=0; BEFORE_BATCH=()=>{batches++;}; const refused=await send("GET","/api/me/export?actions="+encodeURIComponent(query)); BEFORE_BATCH=null;
        check(".118 real signed/unsigned API query continuations are refused; no token-bearing redirect or payload", refused.status===400 && refused.body?.error==="invalid_cursor" && !refused.headers.get("Location") && batches===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===before);
      }
      const queried=await send("POST","/privacy/account/export?actions="+encodeURIComponent(nextForm.actions),{nonce,fields:nextForm});
      check(".118 canonical account forms retain the blanket query-string refusal without changing audit", queried.status===400 && queried.text.includes("Use the form without a query string") && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===before);
      // Finite refusal pages must not reflect continuation values except an authenticated 429 retry.
      const isolatedSession=(await core.sessionCookie(env(),MEMBER,1)).split(";")[0];
      for(let i=0;i<1001;i++) insert.run(T,MEMBER,"isolated."+i,MEMBER);
      const isolatedPage=await send("GET","/privacy/account",{cookie:isolatedSession}), isolatedNonce=(isolatedPage.headers.get("Set-Cookie")||"").split(";")[0], isolatedStart=exportForms(isolatedPage.text)[0];
      const isolatedFirst=await send("POST","/privacy/account/export",{cookie:isolatedSession,nonce:isolatedNonce,fields:{csrf:isolatedStart.csrf,mode:"history"}}), isolatedNext=exportForms(isolatedFirst.text).find(x=>x.mode==="history");
      run("DELETE FROM audit WHERE actor=? AND action='isolated.1000'",MEMBER);
      const isolatedAudit=JSON.stringify(all("SELECT * FROM audit ORDER BY id"));
      const changed=await send("POST","/privacy/account/export",{cookie:isolatedSession,nonce:isolatedNonce,fields:isolatedNext});
      check(".118 a captured-range 409 retains no submitted token, retry form or false completion", changed.status===409 && changed.text.includes("history_changed") && !changed.text.includes(isolatedNext.actions) && Object.keys(savedCursors(changed.text)).length===0 && exportForms(changed.text).length===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===isolatedAudit);
      run("UPDATE site_users SET session_version=2 WHERE discord_id=?",MEMBER);
      const signedOut=await send("POST","/privacy/account/export",{cookie:isolatedSession,nonce:isolatedNonce,fields:isolatedNext});
      check(".118 an invalidated-session 401 does not reflect its old continuation or offer a retry", signedOut.status===401 && !signedOut.text.includes(isolatedNext.actions) && exportForms(signedOut.text).length===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===isolatedAudit);
      run("UPDATE site_users SET session_version=1 WHERE discord_id=?",MEMBER);
      BEFORE_BATCH=()=>{throw new Error("finite synthetic D1 interruption before BEGIN");};
      const interrupted=await send("POST","/privacy/account/export",{cookie:isolatedSession,nonce:isolatedNonce,fields:isolatedNext}); BEFORE_BATCH=null;
      check(".118 an unconfirmed 503 retains no submitted token or retry and creates no export audit", interrupted.status===503 && !interrupted.text.includes(isolatedNext.actions) && Object.keys(savedCursors(interrupted.text)).length===0 && exportForms(interrupted.text).length===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===isolatedAudit);

      // Three accepted own reads above plus these two use the common five/hour bucket.
      const fourth=await send("POST","/privacy/account/export",{nonce,fields:downloadForm}), fifth=await send("POST","/privacy/account/export",{nonce,fields:nextForm});
      const beforeLimited=JSON.stringify(all("SELECT * FROM audit ORDER BY id")), limited=await send("POST","/privacy/account/export",{nonce,fields:nextForm}), retry=exportForms(limited.text)[0];
      check(".118 authenticated 429 preserves precisely the submitted continuation and one same-path history retry without audit", fourth.status===200 && fifth.status===200 && limited.status===429 && limited.text.includes("slow_down") && limited.text.includes("Retry this history page after the rate window") && savedCursors(limited.text)["Saved history-page continuation"]===nextForm.actions && exportForms(limited.text).length===1 && retry?.actions===nextForm.actions && retry.mode==="history" && retry.csrf && !/[?&]actions=/.test(limited.text) && !limited.headers.get("Location") && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===beforeLimited);
      const noPosition=await send("POST","/privacy/account/export",{nonce,fields:{csrf:firstForm.csrf,mode:"history"}});
      check(".118 an initially rate-limited history request invents no continuation or retry position", noPosition.status===429 && Object.keys(savedCursors(noPosition.text)).length===0 && exportForms(noPosition.text).length===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===beforeLimited);
      const exhaustedBad=await send("POST","/privacy/account/export",{nonce,fields:{...nextForm,actions:parts.join(".")}});
      check(".118 exhausted rate limits do not convert an invalid MAC into a reflected retry continuation", exhaustedBad.status===400 && exhaustedBad.text.includes("invalid_cursor") && !exhaustedBad.text.includes(parts.join(".")) && exportForms(exhaustedBad.text).length===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===beforeLimited);
      const rateTime=T;
      try {
        T+=3601; let batches=0; BEFORE_BATCH=()=>{batches++;}; const oldForm=await send("POST","/privacy/account/export",{nonce,fields:retry}); BEFORE_BATCH=null;
        check(".118 a saved rate-refusal form expires normally; its cursor does not bypass a new CSRF form", oldForm.status===403 && oldForm.text.includes("form_expired") && batches===0 && JSON.stringify(all("SELECT * FROM audit ORDER BY id"))===beforeLimited);
        const reopened=await send("GET","/privacy/account"), freshNonce=(reopened.headers.get("Set-Cookie")||"").split(";")[0], freshForm=exportForms(reopened.text)[0];
        const resumed=await send("POST","/privacy/account/export",{nonce:freshNonce,fields:{csrf:freshForm.csrf,mode:"history",actions:savedCursors(limited.text)["Saved history-page continuation"]}}), resumedCurrent=exportForms(resumed.text)[0];
        check(".118 privately saved continuation resumes via a fresh form and the same original signed session after the rate window", resumed.status===200 && resumed.text.includes("1001 of 1001") && resumed.text.includes("0 remain") && (resumed.text.match(/<li>/g)||[]).length===1 && !resumed.text.includes("Next history page") && resumedCurrent.actions.split(".")[7]===nextForm.actions.split(".")[7] && savedCursors(resumed.text)["Current-page continuation"]===resumedCurrent.actions);
      } finally { T=rateTime; BEFORE_BATCH=null; }
    } finally { historyDb?.close(); db=savedDb; T=savedT; HOOK=savedHook; BEFORE_BATCH=savedBefore; AFTER_BATCH=savedAfter; COUNT=savedCount; }
  }

  // The policy pages say what this module does; the numbers they state are read from NEWS_LIMITS, so neither can drift
  // alone. The served pages, whitespace folded (the tracked HTML wraps its lines).
  const folded = async (p) => { const r = await http("GET", p); return { status: r.status, text: String(r.text || "").replace(/\s+/g, " ") }; };
  const priv = await folded("/privacy"), terms = await folded("/terms");
  const L = news.NEWS_LIMITS;
  check("the privacy policy has a News paragraph: switched on by the administrators, confirmed members only, counts and times never a name", priv.status === 200 && priv.text.includes("<strong>News.</strong> When the site's administrators switch it on (it is off until they do), confirmed members can read a News page.") && priv.text.includes("The figures are counts and times, never a name or anyone's place in line"));
  check("  its numbers are the code's: 1 to 90 days, the tombstone's 120 days, a count below five masked, figures at most every three hours", L.days[0] === 1 && L.days[L.days.length - 1] === 90 && priv.text.includes(`from ${L.days[0]} to ${L.days[L.days.length - 1]} days after it was first posted`) && L.opsKeepS === 120 * DAY && priv.text.includes(`until ${L.opsKeepS / DAY} days after it was posted`) && priv.text.includes("shown only as &ldquo;fewer than 5&rdquo;") && L.figuresEveryS === 3 * 3600 && priv.text.includes("at most every three hours"));
  check("  current policy keeps News authors staff-only, clears registered attribution in staff site cleanup, lists retained notices in the curated admin copy, and states that the copy is partial",
    priv.text.includes("recorded for the staff only") && priv.text.includes("The site cleanup removes the staff-actor pointers its registered cleanup covers, including attribution on News notices") && priv.text.includes("an administrator's own copy lists the notices they posted or last changed, and the records left by their deleted ones, until the cleanup deletes them, each with the time its period ends or ended") && priv.text.includes("This is not a complete export of every bot, operational, backup, Discord, game-client or officer-computer record.") && priv.text.includes("never a title or a text") && priv.text.includes("a privacy inbox case, a News notice &mdash;") && priv.text.includes("Confirmed members can also read the News page while it is on"));
  // Codex, 3 Oct 2026 13:24 UTC: "never your name" belongs to the figures the Worker computes; a notice is free text an
  // administrator types (createNotice stores any title and text), so the policy states the staff's practice and the remedy.
  check("  'never your name' covers only the automatic figures; a notice is free text, names a member only with agreement, and is changed or deleted on request through any officer or the privacy inbox contact form", priv.text.includes("Confirmed members can also read the News page while it is on: the figures the site works out by itself, which are counts and times and never your name or your place in the invite queue; the next events with the titles their organizers gave them, as the calendar shows them; and the notices the administrators write for the whole guild, which name a member only with that member's agreement (see News, above, to have one changed or deleted).") && priv.text.includes("A notice is different: it is free text an administrator writes for the whole guild, shown as plain text, and the site does not check what it says. The administrators name a member in a notice only with that member's agreement, and anyone a notice names can ask any Olympus officer, or use the privacy inbox contact form, to have it changed or deleted, and an administrator does it at once.") && !priv.text.includes("the administrators' notices and the counts it shows, never your name") && !priv.text.includes("a notice that names someone is changed or deleted on request"));
  // Review of 3 Oct 2026: newsPage sends each next event's title, which its organizer typed (1 to 80 characters of free
  // text, community-events.ts), so the policy may not count titles among the figures that carry no name; it says what
  // they are instead. Tied to the source: while the events statement selects the title, the free-text sentence must stand.
  const sendsTitles = /SELECT id, title, starts_at, duration_min FROM community_events/.test(src) && /title: e\.title/.test(src);
  const figuresList = (/It shows notices the administrators post for the whole guild, and figures the site works out by itself: (.*?) The figures are counts and times, never a name/.exec(priv.text) || [])[1] || "";
  check("  the next events' titles are their organizers' free text, outside the figures that carry no name (the source sends them)", sendsTitles && figuresList.length > 100 && !/event|title/i.test(figuresList) && priv.text.includes("The page also lists the next events by their start times and the titles their organizers gave them; a title is free text, shown exactly as the calendar already shows it to confirmed members (see Calendar and attendance).") && !priv.text.includes("the title and time of the next events"), figuresList);
  // Codex's finding 5 (3 Oct 2026) and the second review round: the policy states the posting window that makes the
  // tombstone's promise hold, with the code's numbers (the Admin -> News Delete dialog already says it)
  check("  a page posts a new notice only within 30 days of being opened, inside the 120-day record: the policy's numbers are NEWS_LIMITS'", L.opIssueMaxAgeS === 30 * DAY && L.opIssueMaxAgeS < L.opsKeepS && priv.text.includes(`leaves behind only its id, who posted it and when, until ${L.opsKeepS / DAY} days after it was posted, and a page can post a new notice only within ${L.opIssueMaxAgeS / DAY} days of being opened, so a page opened earlier cannot post it again.`));
  check("the terms: News notices are announcements and its figures approximate counts, neither a promise", terms.status === 200 && terms.text.includes("News notices are the administrators' announcements to the guild, and the News figures are approximate counts; neither is a promise."));

  // The vocabulary guard: the files .115 changes may not name a fixed list of withheld terms and names. The test compares
  // SHA-256 digests of lowercase 1-3 word n-grams, so it never spells out what it checks. The allowances are the
  // occurrences that were already in the keeper before .115 (counts per file, never raised; README.md, CLAUDE.md and the
  // runbook had none at 58abea31).
  const GUARD = new Set([
    "c09c8072b00c830604091fab6285928f37ce5c9340ff8bf1be44d377b8558af7", "14738f5d0554c456b600ef8882f003ccf82184c67d90cc40cbffec1d3f80b796", "edd5a14cc93b6ea1c28de573c5388b47cddccb90ca7e5756f48e947a2379f671",
    "d35427801ac4cd1a0b2407d280973bf6457fc7b7d69e94ff70c03ec8819b6186", "a36835a9205979a29fa5c0b92389c3d3d0e53cb1e898f6d70851fd5eb8118a98", "beaea7317fb1a16805a9f6136945be9cd6004dbcd4d33d58619541b849e530f5",
    "741137f5a58167a838d477534c16d184fc2838dfdfe3ae851e65992ecdf12494", "27de1e32f6bd12e3d546d5f3fc4a2276d887cdabbf775c584066518cb7f8dfd2", "abc08ca79847ea557652f6d538e15e4b6c5b4a21427e4cc9bb694e7c2e8af7d9",
    "9824ee60400b62250497ddc421e58cfba1f6162bb2748d808d2bb5e6dcbf7f63", "ca540ba0d5b2ecba5a3fd0f48e5e9534a63e8dd3c811ad484907adfee816298b", "5d111360e568a786541af554d9b06f5fad2bc2a70c2f7e2331599150d3e20086",
    "7ec5f2e916d5720634ded83dd06b1c33bcd9ae0379bc6c9732e089cd70a2cba2", "cedcfc67c817e967143fcf4e69fd3d7164b3cf8ab51dc21191e9a20b08070627", "40d7d0d44f6d9bf628cddb64b3d5d8bc5b9503757767c13e3ab4be41efd787aa",
    "d950c5085bddc76f0d69be28b416b028cf7ffc645c53faadc235e09561e22599", "2df42cd00953ca38d0ef22b0a976b2afbaa1bcb1023865013cee9a04ef609e48", "e25978e12bc32609aafba0bf40f6efaec8e13686f7a7338217a5a2afc6ff0b51",
    "2d7e218d53d209e167bbc581ef874667a37607e77c1bfff9f1da23c50b9fea24", "f0e970d7d9287dfe880db132607e474e0ca0ae131366b4959c6eb62a97b9a3a2", "c4620489705390d1f655951725f765c9e496131e6e665e6603ada07a626c31b1",
    "ee88a7f6515534fc19c84ad6d12521b499885120ad580ef67b00671228b30d14", "77c4b6c63aac8cea1746bbfa71d1735c84d77488f864c7a472f83c6a8d22da4e", "c9b28a5146e5ca890509b710904b95f83e5290fc2feef15f60a22896095e145c",
    "9e65bcccc4375983bfa6f414bdd0fd31eac3cba569606aabc4819db46d870c97", "7646f187fb4b6b43bf826f7aadd8b594a1f5151815e99486985d1dd850825ac4", "430acf5c5f31516b79bac94c815cf71e8eaa80cd077b35470a2326f7035bdb96",
    "f6754549f1d16f8d7dd644b34ebcd5e859f06c8f63325d4c390d1028b69ad9e0",
  ]);
  const ALLOWED = {
    "worker/src/site-data.ts": { "d35427801ac4cd1a0b2407d280973bf6457fc7b7d69e94ff70c03ec8819b6186": 1 },
    "worker/public/static/app.js": { "d35427801ac4cd1a0b2407d280973bf6457fc7b7d69e94ff70c03ec8819b6186": 1 },
  };
  const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const grams = (text) => {
    const t = text.toLowerCase().match(/[a-z0-9]+/g) || [];
    const out = [];
    for (let i = 0; i < t.length; i++) for (let k = 1; k <= 3 && i + k <= t.length; k++) out.push(t.slice(i, i + k).join(" "));
    return out;
  };
  // the .115 sections of a document: from a heading that names .115 to the next heading of the same or a higher level
  const section115 = (file) => {
    const out = [];
    let level = 0;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const h = /^(#{1,6})\s/.exec(line);
      if (h) {
        if (/\.115\b/.test(line)) { level = h[1].length; out.push(line); continue; }
        if (level && h[1].length <= level) level = 0;
      }
      if (level) out.push(line);
    }
    return out.join("\n");
  };
  // Review of 3 Oct 2026: every worker/src file .115 changes, not only the three it added to; the review fixes put new
  // staff-facing text into roster.ts, interactions.ts and the new scheduled-budget.ts. None of the added files named a
  // withheld term at 58abea31 or names one now, so they need no allowance. The third review round (Codex, 3 Oct 2026
  // 16:48 UTC, finding A) adds roster-effects.ts, a new file, guarded with the other files .115 adds.
  const changedSources = ["community-contributions.ts", "community-directory.ts", "env.ts", "guide.ts", "index.ts", "ingest.ts", "interactions.ts", "names.ts", "restore.ts", "roster.ts", "scheduled-budget.ts", "schema.ts", "site-admin.ts", "site-api.ts", "site-leadership.ts"].map((f) => `worker/src/${f}`);
  const guarded = [
    ...["worker/src/site-news.ts", "worker/src/guild-seats.ts", "worker/src/roster-effects.ts", "worker/src/site-data.ts", "worker/public/static/app.js", "worker/public/static/rank-planner/app.js", "policies/privacy.html", "policies/terms.html", ...changedSources].map((f) => [f, fs.readFileSync(path.join(repo, f), "utf8")]),
    ...["README.md", "CLAUDE.md", "docs/launch-runbook.md"].map((f) => [f, fs.readFileSync(path.join(repo, f), "utf8")]), // review of 3 Oct 2026: the whole files
    ...["docs/design.md", "docs/deploy-checklist.md", "docs/beta-test-plan.md"].map((f) => [`${f} (.115 sections)`, section115(path.join(repo, f))]),
  ];
  const over = [];
  for (const [file, text] of guarded) {
    const hits = {};
    for (const g of grams(text)) { const d = sha(g); if (GUARD.has(d)) hits[d] = (hits[d] || 0) + 1; }
    for (const [d, c] of Object.entries(hits)) if (c > ((ALLOWED[file] || {})[d] || 0)) over.push(`${file}: digest ${d.slice(0, 12)} x${c}`);
  }
  check("vocabulary guard: no file .115 changes names a withheld term beyond what was already there (every changed worker/src file among them)", over.length === 0 && GUARD.size === 28 && guarded.length === 29 && changedSources.length === 15 && guarded.every(([, t]) => t.length > 0), over.join("; "));
  const planted = new Set([sha("quartz lantern"), sha("ember")]);
  const found = grams("An old Quartz-Lantern, an EMBER; quartz lanterns").filter((g) => planted.has(sha(g)));
  check("  the guard's machinery finds a planted one- and two-word n-gram by digest, case and punctuation aside", found.join() === "quartz lantern,ember" && [...GUARD].every((d) => /^[0-9a-f]{64}$/.test(d)), found);

  console.log("\n== the schema in all three places ==");
  const sqlFile = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
  const mig = fs.readFileSync(path.join(root, "migrations", "2026-10-03-news-and-seats.sql"), "utf8");
  const schemaTs = fs.readFileSync(path.join(root, "src", "schema.ts"), "utf8");
  const norm = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  const tableOf = (text, name) => { const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(([\\s\\S]*?)\\n\\s*\\)`).exec(text); return m ? norm(m[1]) : null; };
  check("site_news_notices: the same columns and checks in schema.sql, the migration and schema.ts", ["site_news_notices", "site_news_ops"].every((t) => { const a1 = tableOf(sqlFile, t), a2 = tableOf(mig, t), a3 = tableOf(schemaTs, t); return a1 && a1 === a2 && a2 === a3; }), tableOf(sqlFile, "site_news_notices"), tableOf(schemaTs, "site_news_notices"));
  const idxNames = ["site_news_notices_order", "site_news_notices_retain", "site_news_notices_created_by", "site_news_notices_updated_by", "site_news_ops_purge", "site_news_ops_created_by"];
  check("  the six indexes in all three", idxNames.every((x) => sqlFile.includes(`INDEX IF NOT EXISTS ${x} `) && mig.includes(`INDEX IF NOT EXISTS ${x} `) && schemaTs.includes(`INDEX IF NOT EXISTS ${x} `)));
  const tables = (d) => d.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().c;
  check("  schema.sql makes 51 tables (49, and since the third review round the roster effects' two)", tables(db) === 51, tables(db));
  const old = new DatabaseSync(":memory:");
  old.exec(fs.readFileSync(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"), "utf8"));
  schema.forgetSchemaCheck();
  await schema.ensureSchema({ DB: d1(old) });
  const have = (name) => !!old.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  check("ensureSchema over the 25 Sep database creates both tables", have("site_news_notices") && have("site_news_ops"));
  schema.forgetSchemaCheck();
  let again = true;
  try { await schema.ensureSchema({ DB: d1(old) }); } catch { again = false; }
  check("  a second run is harmless", again);
  let tooLong = false;
  try { old.prepare("INSERT INTO site_news_notices (id, op_hash, title, body, created_at, updated_at, retain_until) VALUES (?, 'h', 't', 'b', 100, 100, ?)").run(op(1), 100 + 91 * DAY); } catch { tooLong = true; }
  check("  the table refuses a lifetime over 90 days (CHECK)", tooLong);

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

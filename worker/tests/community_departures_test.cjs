// Build .70 (1 Oct 2026): departure review items (consolidation batch 4b, second half), through the REAL src/*.ts against
// the REAL schema in SQLite; Discord's HTTP side is stubbed. Covers the flag and the staff gates; the cron intake from the
// keeper's own confirmed departures (the window, the five-minute settling, accounts that signed in here only, the kind
// from the keeper's own audit row, no repeats); the staff list, its order, filter and cursor; acknowledge (revision,
// own_record, departure_reviewed, stale); open_restriction with the restrictions flag off and on (the case in the same
// batch, with the default dates); the lifetime cutoff by database time; erasure; the account copy; the purge with its
// backlog. Nothing here touches a role. Run from the worker folder:  node tests/community_departures_test.cjs
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
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      hooks.count?.();
      hooks.beforeBatch?.(++batches); // .73: a test may change the facts between the context read and this payload batch
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
let BEFORE = null, AFTER = null, RUN = null; // .73: armed by a test, each fires once
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i), beforeRun: (sql) => RUN?.(sql) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", OTHER = "300000000000000004", NEVER = "300000000000000099", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const departed = (id, name, leftAt, how = null) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, left_at) VALUES (?, ?, ?, 'left', ?, ?)").run(name.toLowerCase().split("-")[0], name, id, leftAt - 86400, leftAt);
  if (how !== null) db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.left', ?, ?)").run(leftAt + 1, name, JSON.stringify({ discordId: id, how, keptRoles: [] }));
};
const ON = { COMMUNITY_FEATURES: "departures,restrictions", SITE_ADMINS: `${STAFF},${STAFF2}` };
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
const dep = load("./community-departures");

(async () => {
  siteUser(MEMBER, { global_name: "Mia" }); siteUser(OTHER, { global_name: "Oz" }); siteUser(STAFF, { global_name: "Vik" }); siteUser(STAFF2, { global_name: "Ann" });
  departed(MEMBER, "Mia One", T - 3 * 86400, "has been kicked out of the guild by Fern Melder");
  departed(MEMBER, "Mia Two", T - 2 * 86400, "has left the guild");
  departed(OTHER, "Oz Alt", T - 86400); // no audit row: kind unknown
  departed(NEVER, "Nobody Here", T - 86400, "has left the guild"); // never signed in here
  departed(STAFF2, "Ann Old", T - 40 * 86400, "has left the guild"); // outside the 30-day window
  departed(STAFF, "Vik Fresh", T - 60, "has left the guild"); // not settled yet (under five minutes)

  console.log("\n== flag and gates ==");
  let r = await call("GET", "/api/admin/community/departures", STAFF, undefined, { ...ON, COMMUNITY_FEATURES: "" });
  check("with departures off: 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/admin/community/departures", MEMBER);
  check("a member is not staff: 403", r.status === 403);

  console.log("\n== the intake ==");
  let made = await dep.departureIntake(env(ON), T);
  check("the cron records one item per confirmed departure of the last 30 days, settled, for accounts that signed in here: three", made === 3 && one("SELECT COUNT(*) AS n FROM community_departure_reviews").n === 3);
  check("  the kind comes from the keeper's own roster.left row: kicked is removed, left is left, none is unknown", one("SELECT kind FROM community_departure_reviews WHERE character_name = 'Mia One'").kind === "removed" && one("SELECT kind FROM community_departure_reviews WHERE character_name = 'Mia Two'").kind === "left" && one("SELECT kind FROM community_departure_reviews WHERE character_name = 'Oz Alt'").kind === "unknown");
  check("  an account that never signed in here, a departure outside the window, and one not yet settled create nothing", !one("SELECT 1 FROM community_departure_reviews WHERE discord_id IN (?, ?)", NEVER, STAFF2) && !one("SELECT 1 FROM community_departure_reviews WHERE character_name = 'Vik Fresh'"));
  check("  retention is 30 days after the departure; the exact provenance is kept", one("SELECT retain_until, proof_key FROM community_departure_reviews WHERE character_name = 'Mia One'").retain_until === T - 3 * 86400 + 30 * 86400 && one("SELECT proof_key FROM community_departure_reviews WHERE character_name = 'Mia One'").proof_key === "mia one");
  made = await dep.departureIntake(env(ON), T);
  check("a second run creates nothing (one item per account, character and departure)", made === 0);
  made = await dep.departureIntake(env(ON), T + 600);
  check("  once settled, the fresh departure is taken", made === 1 && !!one("SELECT 1 FROM community_departure_reviews WHERE character_name = 'Vik Fresh'"));
  check("  the intake is audited as a count", one("SELECT details FROM audit WHERE action = 'community.departures_recorded' ORDER BY id LIMIT 1").details === '{"created":3}');
  check("  nothing touched a role, a member row or a case", !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'") && one("SELECT COUNT(*) AS n FROM community_restriction_cases").n === 0);

  console.log("\n== the staff list ==");
  r = await call("GET", "/api/admin/community/departures", STAFF);
  check("open items first, oldest departure first; the member's name, the character, the kind, never who reviewed", r.status === 200 && r.body.departures.length === 4 && r.body.departures[0].characterName === "Mia One" && r.body.departures[0].kind === "removed" && r.body.departures[0].displayName === "Mia" && r.body.departures[0].status === "open" && !("reviewedBy" in r.body.departures[0]) && r.body.nextCursor === null, JSON.stringify(r.body).slice(0, 300));
  const item = (name) => r.body.departures.find((d) => d.characterName === name);
  const d1 = item("Mia One"), d2 = item("Mia Two"), dOz = item("Oz Alt"), dVik = item("Vik Fresh");
  r = await call("GET", "/api/admin/community/departures?status=bogus", STAFF);
  check("an unknown status filter is invalid_status", r.status === 400 && r.body.error === "invalid_status");
  const dirMod = load("./community-directory");
  const cur = await indexMod.default.fetch(new Request("https://guild.example/api/admin/community/departures?cursor=" + dirMod.encodeCursor([1, "departures", "", 0, d1.observedAt && T - 3 * 86400, d1.id]), { headers: { Cookie: await cookieFor(STAFF) } }), env(ON), ctx);
  const curB = await cur.json();
  check("a keyset cursor continues after the given item", cur.status === 200 && curB.departures.length === 3 && curB.departures[0].characterName === "Mia Two");

  console.log("\n== acknowledge and open_restriction ==");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dVik.id, revision: 1, action: "acknowledge" });
  check("a staff member never reviews their own departure: 409 own_record", r.status === 409 && r.body.error === "own_record");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d2.id, revision: 7, action: "acknowledge" });
  check("a stale revision is 409 stale_revision with the item", r.status === 409 && r.body.error === "stale_revision" && r.body.departure.revision === 1);
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d2.id, revision: 1, action: "acknowledge", category: "ban" });
  check("acknowledge takes no category: invalid_request", r.status === 400 && r.body.error === "invalid_request");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d2.id, revision: 1, action: "acknowledge" });
  check("acknowledge: the item is reviewed, nothing else changes, audited with the kind", r.status === 200 && r.body.departure.status === "acknowledged" && r.body.departure.revision === 2 && r.body.restrictionCaseId === null && one("SELECT details FROM audit WHERE action = 'community.departure_acknowledged'").details === '{"kind":"left"}' && one("SELECT reviewed_by FROM community_departure_reviews WHERE id = ?", d2.id).reviewed_by === STAFF);
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d2.id, revision: 2, action: "acknowledge" });
  check("  a second decision on a reviewed item is 409 departure_reviewed", r.status === 409 && r.body.error === "departure_reviewed");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d1.id, revision: 1, action: "open_restriction", category: "conduct_removal" }, { ...ON, COMMUNITY_FEATURES: "departures" });
  check("open_restriction with the restrictions flag off is 503 restrictions_disabled, nothing written", r.status === 503 && r.body.error === "restrictions_disabled" && one("SELECT status FROM community_departure_reviews WHERE id = ?", d1.id).status === "open");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d1.id, revision: 1, action: "open_restriction", category: "nonsense" });
  check("  an unknown category is invalid_category", r.status === 400 && r.body.error === "invalid_category");
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: d1.id, revision: 1, action: "open_restriction", category: "conduct_removal" });
  check("open_restriction records the case in the SAME batch with the default dates (review 180 d, expiry 365 d), the item names it, both audited", r.status === 200 && r.body.departure.status === "restriction_opened" && typeof r.body.restrictionCaseId === "string" && r.body.departure.restrictionCaseId === r.body.restrictionCaseId && one("SELECT category, review_at, expires_at, set_by, discord_id FROM community_restriction_cases WHERE id = ?", r.body.restrictionCaseId).review_at === T + 180 * 86400 && one("SELECT expires_at FROM community_restriction_cases WHERE id = ?", r.body.restrictionCaseId).expires_at === T + 365 * 86400 && one("SELECT discord_id FROM community_restriction_cases WHERE id = ?", r.body.restrictionCaseId).discord_id === MEMBER && one("SELECT details FROM audit WHERE action = 'community.restriction_set'").details === '{"category":"conduct_removal","from":"departure_review"}', JSON.stringify(r.body).slice(0, 300));
  const caseId = r.body.restrictionCaseId;
  r = await call("GET", "/api/admin/community/restrictions?discordId=" + MEMBER, STAFF);
  check("  the restrictions module sees the case as its own: active, no characters, set by the admin", r.body.cases.length === 1 && r.body.cases[0].caseId === caseId && r.body.cases[0].active === true && r.body.cases[0].setBy === STAFF && r.body.cases[0].characters.length === 0);
  check("  still nothing touched a role", !one("SELECT 1 FROM audit WHERE action LIKE 'role.%'"));

  console.log("\n== the fence, the lifetime, erasure, export, purge ==");
  db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF);
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dOz.id, revision: 1, action: "acknowledge" });
  check("an admin who left the server is refused: 403 not_member, nothing written", r.status === 403 && r.body.error === "not_member" && one("SELECT status FROM community_departure_reviews WHERE id = ?", dOz.id).status === "open");
  r = await call("GET", "/api/admin/community/departures", STAFF);
  check("  and reads nothing", r.status === 403 && !("departures" in r.body));
  db.prepare("UPDATE site_users SET in_server = 1 WHERE discord_id = ?").run(STAFF);
  db.prepare("UPDATE community_departure_reviews SET retain_until = ? WHERE id = ?").run(T - 1, dOz.id);
  r = await call("GET", "/api/admin/community/departures", STAFF);
  check("an item past its lifetime is gone from the list by database time", r.body.departures.every((d) => d.id !== dOz.id));
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dOz.id, revision: 1, action: "acknowledge" });
  check("  and takes no decision: 404 not_found", r.status === 404);
  const exported = await context.communityExport(env(), MEMBER);
  check("the account copy lists the member's live items without the reviewer or the case", exported.departures.departures.length === 2 && exported.departures.departures.every((d) => !("reviewedBy" in d) && !("restrictionCaseId" in d)) && exported.departures.departures[0].kind === "removed");
  await siteAdmin.deleteSiteData(env(), STAFF, STAFF2);
  check("erasing the reviewing admin anonymizes them on the items; the items stay", one("SELECT reviewed_by FROM community_departure_reviews WHERE id = ?", d2.id).reviewed_by === null && !!one("SELECT 1 FROM community_departure_reviews WHERE id = ?", d1.id));
  siteUser(STAFF, { global_name: "Vik" });
  await siteAdmin.deleteSiteData(env(), MEMBER, STAFF);
  check("erasing the member removes their items (the case opened from one lives on under its own rules)", !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", MEMBER) && !!one("SELECT 1 FROM community_restriction_cases WHERE id = ?", caseId));
  const sw = await dep.sweepCommunityDepartures(env({ COMMUNITY_FEATURES: "" }), T);
  check("the purge runs with the flag off: the expired item goes, the backlog is reported", sw.deleted === 1 && sw.remaining === 0 && !one("SELECT 1 FROM community_departure_reviews WHERE id = ?", dOz.id) && JSON.parse(one("SELECT details FROM audit WHERE action = 'community.departures_expired'").details).remaining === 0);

  console.log("\n== .73: requalified at the insert, the same account's audit row, no starvation, the historical fact ==");
  const RM = "300000000000000061", RX = "300000000000000062", RY = "300000000000000063", RZ = "300000000000000064";
  siteUser(RM, { global_name: "Rae" }); siteUser(RX, { global_name: "Rex" }); siteUser(RY, { global_name: "Ray" }); siteUser(RZ, { global_name: "Roz" });
  db.prepare("UPDATE characters SET status = 'member', left_at = NULL WHERE name = 'Oz Alt'").run(); // its item was purged early above; keep it out of this intake
  departed(RM, "Rae One", T - 5 * 86400); // no row of its own; a NAMESAKE's roster.left row (another account) sits in the window
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.left', 'Rae One', ?)").run(T - 5 * 86400 + 1, JSON.stringify({ discordId: OTHER, how: "has been kicked out of the guild by Fern Melder", keptRoles: [] }));
  departed(RX, "Rex Gone", T - 4 * 86400, "has left the guild"); // its account is erased right before the insert
  departed(RZ, "Roz Held", T - 29 * 86400 - 43200); // observed 29.5 days ago: inside this process's window, past its lifetime by the database clock
  RUN = (sql) => { if (/INSERT INTO community_departure_reviews/.test(sql)) { RUN = null; db.prepare("DELETE FROM site_users WHERE discord_id = ?").run(RX); } };
  made = await dep.departureIntake(env(ON), T);
  check("the insert requalifies each candidate: the account erased after the scan gets no item; the candidate past its lifetime by the database clock gets none; the valid one is recorded", made === 1 && !!one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RM) && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RX) && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RZ), made);
  check("  a namesake's roster.left row (another account) does not label the kind: unknown", one("SELECT kind FROM community_departure_reviews WHERE discord_id = ?", RM).kind === "unknown");
  check("(the run hook fired)", RUN === null);
  siteUser(RX, { global_name: "Rex" });
  db.prepare("UPDATE characters SET status = 'member', left_at = NULL WHERE name = 'Roz Held'").run(); // the held candidate would otherwise fill the one-row page below
  // a candidate the site cannot show exactly (its stored key is not the name's proof key) sorts first; with a page of one it must not starve the next
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(RY);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, left_at) VALUES ('not the key', 'Ray Odd', ?, 'left', ?, ?)").run(RY, T - 7 * 86400, T - 6 * 86400);
  made = await dep.departureIntake(env(ON), T, 1);
  check("the scan pages by keyset within the run: the invalid candidate is skipped and the next valid one (Rex) is recorded with a page of one", made === 1 && !!one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RX) && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RY), made);
  db.prepare("UPDATE characters SET status = 'member', left_at = NULL WHERE discord_id = ?").run(RM);
  made = await dep.departureIntake(env(ON), T);
  check("a rejoin after the item was recorded changes nothing: the item is the historical event-time fact", made === 0 && !!one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RM));

  console.log("\n== .76: the captured incarnation at the insert; progress across runs ==");
  const RQ = "300000000000000065";
  siteUser(RQ, { global_name: "Quin" }); departed(RQ, "Quin Gone", T - 3 * 86400, "has left the guild");
  // the account is erased and RECREATED under the same Discord id (a new first sign-in) between the scan and the insert
  RUN = (sql) => { if (/INSERT INTO community_departure_reviews/.test(sql)) { RUN = null; db.prepare("DELETE FROM site_users WHERE discord_id = ?").run(RQ); siteUser(RQ, { global_name: "Quin", first_login: T + 5, last_login: T + 5 }); } };
  made = await dep.departureIntake(env(ON), T);
  check("an account erased and recreated under the same id before the insert records nothing: the insert binds the CAPTURED incarnation (first sign-in and session version), not a row's existence", made === 0 && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RQ) && RUN === null, made);
  made = await dep.departureIntake(env(ON), T);
  check("  the next run, scanning the recreated account itself, records the departure (a genuine confirmed fact about that account)", made === 1 && !!one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RQ));
  // 25 candidates the site cannot record (their stored key is not the name's proof key) sort before one valid departure;
  // with a page of 2 and 10 pages a run, the first run cannot reach it: the second continues where the first stopped
  const RW = "300000000000000066";
  siteUser(RW, { global_name: "Wall" }); db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(RW);
  for (let i = 0; i < 25; i++) db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, left_at) VALUES (?, ?, ?, 'left', ?, ?)").run(`wrong key ${String(i).padStart(2, "0")}`, `Wall ${String.fromCharCode(65 + i)}`, RW, T - 2 * 86400 - 1000, T - 2 * 86400 - 1000 + i);
  const RV = "300000000000000067";
  siteUser(RV, { global_name: "Val" }); departed(RV, "Val Late", T - 2 * 86400, "has left the guild");
  made = await dep.departureIntake(env(ON), T, 2);
  check("a run that ends at its bounds (10 pages of 2) records nothing yet and keeps its scan position (no personal data)", made === 0 && one("SELECT COUNT(*) AS n FROM community_departure_scan").n === 1 && one("SELECT name_key FROM community_departure_scan").name_key === "wrong key 18", one("SELECT name_key FROM community_departure_scan")?.name_key); // Ray Odd (above) takes the first of the 20 slots
  made = await dep.departureIntake(env(ON), T, 2);
  check("  the next run continues from that position, reaches the valid departure and records it; having scanned to the end, it clears the position", made === 1 && !!one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", RV) && one("SELECT COUNT(*) AS n FROM community_departure_scan").n === 0, made);
  made = await dep.departureIntake(env(ON), T, 2);
  check("  a third run starts over from the window's start (the invalid candidates are never dropped, only bounded per run)", made === 0 && one("SELECT COUNT(*) AS n FROM community_departure_scan").n === 1);
  db.prepare("DELETE FROM community_departure_scan").run();

  console.log("\n== .73: uniform reader admission on every payload ==");
  r = await call("GET", "/api/admin/community/departures", STAFF);
  const dRae = r.body.departures.find((d) => d.characterName === "Rae One");
  const denyStaff = () => db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(STAFF);
  const restoreStaff = () => db.prepare("UPDATE site_users SET denied = 0, in_server = 1, session_version = 1 WHERE discord_id = ?").run(STAFF);
  BEFORE = (i) => { if (i === 1) { BEFORE = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dRae.id, revision: 1, action: "acknowledge" });
  check("EARLY: an admin denied between the context read and the pre-decision read: 403 denied, no item in the answer, nothing written", r.status === 403 && r.body.error === "denied" && !("departure" in r.body) && one("SELECT status FROM community_departure_reviews WHERE id = ?", dRae.id).status === "open", JSON.stringify(r.body).slice(0, 200));
  restoreStaff();
  AFTER = (i) => { if (i === 1) db.prepare("UPDATE community_departure_reviews SET revision = revision + 1 WHERE id = ?").run(dRae.id); if (i === 2) { AFTER = null; db.prepare("UPDATE site_users SET in_server = 0 WHERE discord_id = ?").run(STAFF); } };
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dRae.id, revision: 1, action: "acknowledge" });
  check("LOST CAS: another change lands after the pre-decision read, the write loses its compare-and-set, the admin leaves the server before the fallback read: 403 not_member, no item payload", r.status === 403 && r.body.error === "not_member" && !("departure" in r.body) && one("SELECT status FROM community_departure_reviews WHERE id = ?", dRae.id).status === "open", JSON.stringify(r.body).slice(0, 200));
  db.prepare("UPDATE community_departure_reviews SET revision = 1 WHERE id = ?").run(dRae.id);
  restoreStaff();
  AFTER = (i) => { if (i === 2) { AFTER = null; denyStaff(); } };
  r = await call("POST", "/api/admin/community/departures/update", STAFF, { id: dRae.id, revision: 1, action: "acknowledge" });
  check("AFTER SUCCESS: the decision committed, then the admin denied: the answer is the item the write's own batch read and the write stands", r.status === 200 && r.body.departure.status === "acknowledged" && r.body.departure.revision === 2 && one("SELECT status FROM community_departure_reviews WHERE id = ?", dRae.id).status === "acknowledged", JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", "/api/admin/community/departures", STAFF);
  check("  while the next read, newly unauthorized, is refused", r.status === 403 && !("departures" in r.body));
  restoreStaff();
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

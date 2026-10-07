// Build .59 (1 Oct 2026): the guild calendar with sign-ups, capacity and attendance (consolidation batch 3), through the
// REAL src/*.ts against the REAL schema in SQLite; Discord's HTTP side is stubbed. Covers the flags and gates, the
// organizer capability, create (opId idempotency, op_conflict, validation), list (window, cursor), detail (sign-ups of
// qualifying members, the digest cursor going stale), RSVP (first answer and ref, capacity judged in the statement,
// event_full, stale_revision, changed answers, a departed member losing their place at read time, event_started,
// event_cancelled, calendar_full), update (lower capacity below places held, unchanged, not_event_organizer, a move
// marking answers changed), cancel, attendance (organizer only, before the start, records with own RETURNING,
// superseded, stale, unknown, invalid entries, the list and its cursor, own history), erasure, export and retention.
// Run from the worker folder:  node tests/community_events_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, hooks = {}) {
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
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
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
const env = (over = {}) => ({ DB: d1(db, { count: () => { statements++; } }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const APPLICANT = "300000000000000001", ORG = "300000000000000002", M1 = "300000000000000003", M2 = "300000000000000004", M3 = "300000000000000005", STAFF = "472099715253796864";
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, T, T, row.in_server, row.denied, row.session_version);
};
const confirm = (id, name) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?, ?, ?, 'member', ?)").run(name.toLowerCase(), name, id, T);
};
const ON = { COMMUNITY_FEATURES: "directory,events,attendance", COMMUNITY_ORGANIZERS: ORG };
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
  siteUser(APPLICANT); siteUser(ORG, { global_name: "Org" }); confirm(ORG, "Org Char"); siteUser(M1, { global_name: "Mia" }); confirm(M1, "Mia One"); siteUser(M2, { global_name: "Ben" }); confirm(M2, "Ben Two"); siteUser(M3, { global_name: "Cat" }); confirm(M3, "Cat Three"); siteUser(STAFF, { global_name: "Vik" }); confirm(STAFF, "Vik Admin");
  // .67: whatever closes at an event's start is judged by the DATABASE clock, so the fixtures start in the real future and
  // "after the start" is produced by moving the stored start into the real past, not by moving the suite's frozen clock
  const REAL = Math.floor(RealDate.now() / 1000);
  const start = REAL + 3 * 86400;

  console.log("\n== flags, gates, organizers ==");
  let r = await call("GET", "/api/community/events", M1, undefined, { COMMUNITY_FEATURES: "directory" });
  check("with events off the calendar is 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/community/events", APPLICANT);
  check("an applicant is refused: guild_unconfirmed", r.status === 403 && r.body.error === "guild_unconfirmed");
  r = await call("POST", "/api/community/events", M1, { opId: OP1, title: "Raid night", startsAt: iso(start), durationMin: 120 });
  check("a confirmed member who is not an organizer cannot create: 403 not_organizer", r.status === 403 && r.body.error === "not_organizer");
  r = await call("GET", "/api/community/event/attendance?id=" + OP1, M1);
  check("  nor read an attendance list", r.status === 403 && r.body.error === "not_organizer");

  console.log("\n== create ==");
  r = await call("POST", "/api/community/events", ORG, { opId: OP1, title: "Raid night", details: "Bring flasks.\nBe on time.", startsAt: iso(start), durationMin: 120, capacity: 2, roleTargets: { tank: 1, healer: 1 } });
  check("an organizer creates an event whose id is the opId; seconds in, ISO out", r.status === 200 && r.body.event.id === OP1 && r.body.event.startsAt === iso(start) && r.body.event.capacity === 2 && r.body.event.roleTargets.damage === 0 && r.body.event.canManage === true && r.body.event.organizer.displayName === "Org", JSON.stringify(r.body).slice(0, 300));
  check("  stored in seconds with ends_at = starts_at + duration and a 30-day retention after the end", one("SELECT starts_at, ends_at, retain_until FROM community_events WHERE id = ?", OP1).ends_at === start + 7200 && one("SELECT retain_until FROM community_events WHERE id = ?", OP1).retain_until === start + 7200 + 30 * 86400);
  check("  audited and in the history without values", !!one("SELECT 1 FROM audit WHERE action = 'community.event_created' AND subject = ?", OP1) && one("SELECT action, fields FROM community_event_changes WHERE event_id = ?", OP1).fields === "[]");
  r = await call("POST", "/api/community/events", ORG, { opId: OP1, title: "Raid night", details: "Bring flasks.\nBe on time.", startsAt: iso(start), durationMin: 120, capacity: 2, roleTargets: { tank: 1, healer: 1 } });
  check("the same create retried answers the event with replay: true and writes nothing", r.status === 200 && r.body.replay === true && one("SELECT COUNT(*) AS n FROM community_event_changes WHERE event_id = ?", OP1).n === 1);
  r = await call("POST", "/api/community/events", ORG, { opId: OP1, title: "Different", startsAt: iso(start), durationMin: 120 });
  check("  different values under the same opId are 409 op_conflict", r.status === 409 && r.body.error === "op_conflict");
  r = await call("POST", "/api/community/events", STAFF, { opId: OP1, title: "Raid night", startsAt: iso(start), durationMin: 120 });
  check("  another creator with that opId is op_conflict too", r.status === 409 && r.body.error === "op_conflict");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "x".repeat(81), startsAt: iso(start), durationMin: 120 });
  check("a title over 80 is invalid_title", r.status === 400 && r.body.error === "invalid_title");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "T", startsAt: "2026-02-30T20:00:00Z", durationMin: 120 });
  check("an impossible date is invalid_starts_at", r.status === 400 && r.body.error === "invalid_starts_at");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "T", startsAt: iso(start) + "x", durationMin: 120 });
  check("  a malformed time too", r.status === 400 && r.body.error === "invalid_starts_at");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "T", startsAt: iso(start), durationMin: 10 });
  check("a duration under 15 minutes is invalid_duration_min", r.status === 400 && r.body.error === "invalid_duration_min");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "T", startsAt: iso(start), durationMin: 60, roleTargets: { tank: 1, mage: 1 } });
  check("an unknown role target is invalid_role_targets", r.status === 400 && r.body.error === "invalid_role_targets");
  r = await call("POST", "/api/community/events", ORG, { opId: OP2, title: "Dungeon", startsAt: iso(start + 86400), durationMin: 60 });
  check("a second event, unlimited", r.status === 200 && r.body.event.capacity === null);
  r = await call("POST", "/api/community/events", STAFF, { opId: OP3, title: "Admin event", startsAt: iso(start + 2 * 86400), durationMin: 60 });
  check("a SITE_ADMIN with a confirmed character organizes too", r.status === 200);

  console.log("\n== list ==");
  r = await call("GET", "/api/community/events", M1);
  check("the default window (now + 31 days) lists the three events in start order with counts and no own answer", r.status === 200 && r.body.events.length === 3 && r.body.events[0].id === OP1 && r.body.events[0].mine === null && r.body.events[0].counts.yes === 0 && r.body.events[0].canManage === false);
  r = await call("GET", `/api/community/events?from=${iso(start + 86400 - 10)}&to=${iso(start + 2 * 86400 + 10)}`, M1);
  check("a window lists what overlaps it", r.body.events.length === 2 && r.body.events[0].id === OP2);
  r = await call("GET", `/api/community/events?from=${iso(start)}&to=${iso(start + 70 * 86400)}`, M1);
  check("a window over 62 days is invalid_window", r.status === 400 && r.body.error === "invalid_window");
  const dirX = load("./community-directory");
  const listCursor = async (parts) => indexMod.default.fetch(new Request("https://guild.example/api/community/events?cursor=" + dirX.encodeCursor(parts), { headers: { Cookie: await cookieFor(M1) } }), env(ON), ctx);
  let lc = await listCursor([1, "events", T, T + 31 * 86400, start, OP1]);
  check("a .59 list cursor (no order digest) is 409 cursor_stale (.67)", lc.status === 409 && (await lc.json()).error === "cursor_stale");
  const windowDigest = async () => dirX.orderDigest(db.prepare("SELECT starts_at, id FROM community_events WHERE ends_at > ? AND starts_at < ? ORDER BY starts_at, id").all(T, T + 31 * 86400).map((e) => [e.starts_at, e.id]));
  lc = await listCursor([2, "events", T, T + 31 * 86400, await windowDigest(), start, OP1]);
  check("a v2 cursor with the window's digest continues after the given event", lc.status === 200 && (await lc.json()).events.map((e) => e.id).join() === [OP2, OP3].join());
  lc = await listCursor([2, "events", T, T + 31 * 86400, "0".repeat(32), start, OP1]);
  check("  one whose digest is not the window's order (an event moved) is 409 cursor_stale", lc.status === 409 && (await lc.json()).error === "cursor_stale");

  console.log("\n== RSVP ==");
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "yes", character: "Mia One", raidRole: "tank", revision: 0 });
  check("a first 'yes' lands: revision 1, counts 1, the answer's start recorded", r.status === 200 && r.body.event.mine.revision === 1 && r.body.event.counts.yes === 1 && r.body.event.counts.byRole.tank === 1 && r.body.event.mine.changedSinceRsvp === false, JSON.stringify(r.body).slice(0, 300));
  check("  the member's ref was created inside the write and the sign-up generation moved", !!one("SELECT 1 FROM community_refs WHERE discord_id = ?", M1) && one("SELECT signup_generation FROM community_events WHERE id = ?", OP1).signup_generation === 1);
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "yes", revision: 0 });
  check("the same revision again is 409 stale_revision with the event", r.status === 409 && r.body.error === "stale_revision" && r.body.event.mine.revision === 1);
  r = await call("PUT", "/api/community/events/rsvp", M2, { eventId: OP1, status: "yes", raidRole: "healer", revision: 0 });
  check("the second 'yes' takes the last place", r.status === 200 && r.body.event.counts.yes === 2);
  r = await call("PUT", "/api/community/events/rsvp", M3, { eventId: OP1, status: "yes", revision: 0 });
  check("the third 'yes' is 409 event_full, judged inside the statement; nothing written", r.status === 409 && r.body.error === "event_full" && !one("SELECT 1 FROM community_event_signups WHERE event_id = ? AND discord_id = ?", OP1, M3));
  r = await call("PUT", "/api/community/events/rsvp", M3, { eventId: OP1, status: "tentative", revision: 0 });
  check("  but a 'tentative' needs no place", r.status === 200 && r.body.event.counts.tentative === 1);
  db.prepare("UPDATE characters SET status = 'left' WHERE discord_id = ?").run(M2);
  r = await call("GET", "/api/community/event?id=" + OP1, M1);
  check("a holder who left the roster no longer counts or appears (read time), their answer kept", r.status === 200 && r.body.event.counts.yes === 1 && r.body.signups.length === 2 && !!one("SELECT 1 FROM community_event_signups WHERE event_id = ? AND discord_id = ?", OP1, M2), JSON.stringify(r.body.signups));
  r = await call("PUT", "/api/community/events/rsvp", M3, { eventId: OP1, status: "yes", revision: 1 });
  check("  so the freed place can be taken", r.status === 200 && r.body.event.counts.yes === 2);
  db.prepare("UPDATE characters SET status = 'member' WHERE discord_id = ?").run(M2);
  r = await call("GET", "/api/community/event?id=" + OP1, ORG);
  check("the returned member counts again (the event is over capacity, which is allowed) and an organizer sees refs", r.body.event.counts.yes === 3 && r.body.signups.every((s) => typeof s.ref === "string") && r.body.signups[0].status === "yes");
  r = await call("GET", "/api/community/events", M1, undefined, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "2" });
  check("the list honours the read bound like the detail: three qualifying answers over a limit of two is 503 events_too_large, never a partial count (.67)", r.status === 503 && r.body.error === "events_too_large");
  r = await call("GET", "/api/community/event?id=" + OP1, M1, undefined, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "2" });
  check("  and so does the detail", r.status === 503 && r.body.error === "events_too_large");
  r = await call("GET", "/api/community/event?id=" + OP1, M1);
  check("  a member sees sign-ups without refs or ids, ordered yes first then by name", r.body.signups.every((s) => !("ref" in s)) && r.body.signups.map((s) => s.displayName).join(",") === "Ben,Cat,Mia" && !JSON.stringify(r.body).includes(M2));
  const dir = load("./community-directory");
  const stale = await indexMod.default.fetch(new Request("https://guild.example/api/community/event?id=" + OP1 + "&cursor=" + dir.encodeCursor([1, "signups", OP1, 1, 0, "0".repeat(32), 0, "", "0".repeat(32)]), { headers: { Cookie: await cookieFor(M1) } }), env(ON), ctx);
  check("a sign-up cursor from another generation is 409 cursor_stale", stale.status === 409);
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "no", revision: 1 });
  check("changing an answer keeps the character when omitted and moves the revision", r.status === 200 && r.body.event.mine.status === "no" && r.body.event.mine.character === "Mia One" && r.body.event.mine.revision === 2 && r.body.event.counts.yes === 2);
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "no", character: null, revision: 2 });
  check("  null clears it", r.status === 200 && r.body.event.mine.character === null);
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "maybe", revision: 3 });
  check("an unknown status is invalid_status", r.status === 400 && r.body.error === "invalid_status");
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP1, status: "yes", character: "Bad--Name", revision: 3 });
  check("a bad character name is invalid_character", r.status === 400 && r.body.error === "invalid_character");
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: "D".repeat(22), status: "yes", revision: 0 });
  check("an unknown event is 404", r.status === 404 && r.body.error === "event_not_found");
  r = await call("PUT", "/api/community/events/rsvp", M1, { eventId: OP2, status: "yes", revision: 0 }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "3" });
  check("the calendar's member bound: with three members already in it and a limit of three, a fourth... (M1 is in it already: admitted)", r.status === 200);
  siteUser("300000000000000009", { global_name: "Dan" }); confirm("300000000000000009", "Dan Four");
  r = await call("PUT", "/api/community/events/rsvp", "300000000000000009", { eventId: OP2, status: "yes", revision: 0 }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "3" });
  check("  a member not yet in the calendar is refused 409 calendar_full inside the statement, nothing written", r.status === 409 && r.body.error === "calendar_full" && !one("SELECT 1 FROM community_event_signups WHERE discord_id = '300000000000000009'"));
  db.prepare("UPDATE community_events SET starts_at = ?, ends_at = ? WHERE id = ?").run(REAL - 10, REAL - 10 + 7200, OP1);
  r = await call("PUT", "/api/community/events/rsvp", M2, { eventId: OP1, status: "no", revision: 1 });
  check("after the start, by the database clock, an answer is 409 event_started although the request's own clock says otherwise (.67)", r.status === 409 && r.body.error === "event_started" && one("SELECT status FROM community_event_signups WHERE event_id = ? AND discord_id = ?", OP1, M2).status === "yes");
  db.prepare("UPDATE community_events SET starts_at = ?, ends_at = ? WHERE id = ?").run(start, start + 7200, OP1);

  console.log("\n== update and cancel ==");
  r = await call("POST", "/api/community/events/update", ORG, { eventId: OP1, revision: 1, capacity: 1 });
  check("lowering the capacity below the places held is 409 capacity_below_signups", r.status === 409 && r.body.error === "capacity_below_signups");
  r = await call("POST", "/api/community/events/update", ORG, { eventId: OP1, revision: 1, title: "Raid night", capacity: 2 });
  check("a save that changes nothing says unchanged", r.status === 200 && r.body.unchanged === true && r.body.event.revision === 1);
  r = await call("POST", "/api/community/events/update", ORG, { eventId: OP1, revision: 1, startsAt: iso(start + 3600), capacity: 5 });
  check("moving the start and raising the capacity: revision 2, every answer marked changedSinceRsvp, history lists the fields", r.status === 200 && r.body.event.revision === 2 && r.body.event.capacity === 5 && one("SELECT fields FROM community_event_changes WHERE event_id = ? AND action = 'updated'", OP1).fields === '["startsAt","capacity"]');
  r = await call("GET", "/api/community/event?id=" + OP1, M3);
  check("  the member sees their answer flagged", r.body.event.mine.changedSinceRsvp === true);
  r = await call("POST", "/api/community/events/update", M1, { eventId: OP1, revision: 2, title: "Hijack" }, { ...ON, COMMUNITY_ORGANIZERS: `${ORG},${M1}` });
  check("another organizer cannot edit someone else's event: 409 not_event_organizer (canManage false)", r.status === 409 && r.body.error === "not_event_organizer" && r.body.event.canManage === false);
  r = await call("POST", "/api/community/events/update", STAFF, { eventId: OP1, revision: 2, title: "Raid night (moved)" });
  check("  a SITE_ADMIN may", r.status === 200 && r.body.event.title === "Raid night (moved)" && r.body.event.revision === 3);
  r = await call("POST", "/api/community/events/update", ORG, { eventId: OP1, revision: 2, title: "Late" });
  check("a stale revision is 409 stale_revision", r.status === 409 && r.body.error === "stale_revision");
  r = await call("POST", "/api/community/events/cancel", ORG, { eventId: OP2, revision: 1 });
  check("cancelling: status cancelled, retention brought forward to 30 days from now", r.status === 200 && r.body.event.status === "cancelled" && one("SELECT retain_until FROM community_events WHERE id = ?", OP2).retain_until === T + 30 * 86400);
  r = await call("PUT", "/api/community/events/rsvp", M3, { eventId: OP2, status: "yes", revision: 0 });
  check("  an answer to a cancelled event is 410 event_cancelled", r.status === 410 && r.body.error === "event_cancelled");
  r = await call("POST", "/api/community/events/cancel", ORG, { eventId: OP2, revision: 2 });
  check("  cancelling again is 410", r.status === 410);

  console.log("\n== attendance ==");
  const refOf = (id) => one("SELECT ref FROM community_refs WHERE discord_id = ?", id)?.ref;
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [{ ref: refOf(M3), state: "present", revision: 0 }] });
  check("recording before the start is 409 event_not_started", r.status === 409 && r.body.error === "event_not_started");
  // ten minutes into the moved event, by the database clock: the stored start moves into the real past (.67)
  db.prepare("UPDATE community_events SET starts_at = ?, ends_at = ?, retain_until = ? WHERE id = ?").run(REAL - 600, REAL - 600 + 7200, REAL - 600 + 7200 + 30 * 86400, OP1);
  T = REAL;
  r = await call("POST", "/api/community/events/update", ORG, { eventId: OP1, revision: 3, title: "Too late" });
  check("an edit after the start is 409 event_started by the database clock (.67)", r.status === 409 && r.body.error === "event_started");
  r = await call("GET", "/api/community/event/attendance?id=" + OP1, ORG);
  check("the organizer's list names every qualifying member who answered, by ref and name, with no attendance yet", r.status === 200 && r.body.attendance.length === 3 && r.body.attendance.every((a) => a.attendance === null && typeof a.ref === "string") && r.body.attendance.map((a) => a.displayName).join(",") === "Ben,Cat,Mia", JSON.stringify(r.body.attendance));
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [{ ref: refOf(M3), state: "present", reasonCode: "late", revision: 0 }, { ref: refOf(M2), state: "absent", revision: 0 }, { ref: "Z".repeat(22), state: "present", revision: 0 }, { ref: refOf(M1), state: "present", reasonCode: "left_early", revision: 7 }] });
  check("recording: own rows ok at revision 1 from the statement's RETURNING, an unknown ref unknown_member, a wrong revision stale_revision", r.status === 200 && r.body.results.length === 4 && r.body.results[0].result === "ok" && r.body.results[0].entry.attendance.revision === 1 && r.body.results[0].entry.attendance.reasonCode === "late" && r.body.results[1].result === "ok" && r.body.results[2].result === "unknown_member" && r.body.results[3].result === "stale_revision" && !("superseded" in r.body.results[0]), JSON.stringify(r.body.results));
  check("  the attendance generation moved and the write is audited as a count", one("SELECT attendance_generation FROM community_events WHERE id = ?", OP1).attendance_generation === 1 && one("SELECT details FROM audit WHERE action = 'community.attendance_recorded'").details === '{"entries":3}');
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [{ ref: refOf(M3), state: "excused", revision: 1 }] });
  check("a second record moves the row to revision 2", r.status === 200 && r.body.results[0].result === "ok" && r.body.results[0].entry.attendance.revision === 2 && r.body.results[0].entry.attendance.state === "excused");
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [{ ref: refOf(M3), state: "present", revision: 1 }] });
  check("  the old revision is stale_revision with the current entry", r.status === 200 && r.body.results[0].result === "stale_revision" && r.body.results[0].entry.attendance.revision === 2);
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [{ ref: refOf(M3), state: "absent", reasonCode: "late", revision: 2 }] });
  check("a reason code on a non-presence is a per-entry 'invalid', the request itself fine", r.status === 200 && r.body.results[0].result === "invalid");
  r = await call("POST", "/api/community/attendance/record", ORG, { eventId: OP1, entries: [] });
  check("an empty entries array is 400 invalid_entries", r.status === 400 && r.body.error === "invalid_entries");
  // CS-5: a row this request wrote and another write replaced before the read-back is reported as ok but superseded
  const dirMod = load("./community-events");
  const origBatch = env().DB.batch;
  let raced = false; // .67: the hydration after the write is a batch too, so the simulated other writer fires once, after the write's batch
  const raceEnv = { ...env(ON), DB: { ...env().DB, batch: async (stmts) => { const out = await origBatch(stmts); if (!raced) { raced = true; db.prepare("UPDATE community_event_attendance SET write_nonce = 'other', revision = revision + 1 WHERE event_id = ? AND discord_id = ?").run(OP1, M2); } return out; } } };
  const cs5 = await indexMod.default.fetch(new Request("https://guild.example/api/community/attendance/record", { method: "POST", headers: { Cookie: await cookieFor(ORG), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ eventId: OP1, entries: [{ ref: refOf(M2), state: "present", revision: 1 }] }) }), raceEnv, ctx);
  const cs5b = await cs5.json();
  // .67: the result is read in the write's own transaction, so an overwrite that lands afterwards cannot be mistaken for
  // this request's row: the result is this request's own row at its own revision (input + 1), and the overwrite shows on
  // the next read. (Until .66 the read-back came after the batch, and such an overwrite was reported as `superseded`.)
  check("CS-5 (.67): the result is this request's own committed row at input + 1, read in the same transaction; a later overwrite is not in it and shows on the next read", cs5.status === 200 && cs5b.results[0].result === "ok" && !("superseded" in cs5b.results[0]) && cs5b.results[0].entry.attendance.revision === 2 && one("SELECT revision, write_nonce FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", OP1, M2).revision === 3, JSON.stringify(cs5b.results));
  r = await call("GET", "/api/community/event/attendance?id=" + OP1, ORG);
  check("  (the organizer's next read shows the overwriting writer's revision)", r.body.attendance.find((a) => a.ref === refOf(M2)).attendance.revision === 3);
  // .67: a target denied between the organizer's resolution of the refs and the batch: nothing private of theirs in any result
  const denyEnv = { ...env(ON), DB: { ...env().DB, batch: async (stmts) => { db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(M1); return origBatch(stmts); } } };
  const denied = await indexMod.default.fetch(new Request("https://guild.example/api/community/attendance/record", { method: "POST", headers: { Cookie: await cookieFor(ORG), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ eventId: OP1, entries: [{ ref: refOf(M1), state: "absent", reasonCode: "late", revision: 0 }, { ref: refOf(M2), state: "present", revision: 3 }] }) }), denyEnv, ctx);
  const deniedB = await denied.json();
  check("a target denied before the batch: the invalid entry carries no name, answer or old attendance; a valid write for them is not committed (unknown_member)", denied.status === 200 && deniedB.results[0].result === "invalid" && deniedB.results[0].entry === null && !JSON.stringify(deniedB.results).includes("Mia") && !one("SELECT 1 FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", OP1, M1), JSON.stringify(deniedB.results));
  check("  the other, qualifying target in the same request is recorded as usual", deniedB.results[1].result === "ok" && deniedB.results[1].entry.attendance.revision === 4, JSON.stringify(deniedB.results[1]));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(M1);
  const stillDenied = await indexMod.default.fetch(new Request("https://guild.example/api/community/attendance/record", { method: "POST", headers: { Cookie: await cookieFor(ORG), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ eventId: OP1, entries: [{ ref: refOf(M1), state: "present", revision: 0 }] }) }), denyEnv, ctx);
  const stillB = await stillDenied.json();
  check("  a valid write for a target denied before the batch is unknown_member with no entry, nothing written", stillDenied.status === 200 && stillB.results[0].result === "unknown_member" && stillB.results[0].entry === null && !one("SELECT 1 FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", OP1, M1), JSON.stringify(stillB.results));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(M1);
  r = await call("GET", "/api/community/attendance/me", M3);
  check("a member's own history lists their rows, newest first, with the event", r.status === 200 && r.body.entries.length === 1 && r.body.entries[0].event.id === OP1 && r.body.entries[0].state === "excused");
  r = await call("GET", "/api/community/attendance/me", M1);
  check("  and nothing for someone with no row (missing is unknown, not absent)", r.body.entries.length === 0);
  r = await call("GET", "/api/community/event?id=" + OP1, M3);
  check("the event object carries the viewer's own attendance", r.body.event.myAttendance && r.body.event.myAttendance.state === "excused");
  r = await call("GET", "/api/community/event?id=" + OP1, M3, undefined, { ...ON, COMMUNITY_FEATURES: "directory,events" });
  check("  and none while attendance is off", r.body.event.myAttendance === null);

  console.log("\n== erasure, export, retention ==");
  const exported = await context.communityExport(env(), M3);
  check("the account copy carries sign-ups and attendance", exported.events && exported.events.signups.length === 1 && exported.events.attendance.length === 1);
  const deleted = await siteAdmin.deleteSiteData(env(), M3, STAFF);
  check("deleteSiteData removes the member's answers and attendance and moves the generations", deleted && !one("SELECT 1 FROM community_event_signups WHERE discord_id = ?", M3) && !one("SELECT 1 FROM community_event_attendance WHERE discord_id = ?", M3) && one("SELECT signup_generation FROM community_events WHERE id = ?", OP1).signup_generation >= 5);
  await siteAdmin.deleteSiteData(env(), ORG, STAFF);
  r = await call("GET", "/api/community/event?id=" + OP1, M1);
  check("erasing the creator keeps the event for the others with the organizer anonymized and the history actor cleared", r.status === 200 && r.body.event.organizer.displayName === "Guild organizer" && one("SELECT COUNT(*) AS n FROM community_event_changes WHERE event_id = ? AND actor IS NOT NULL", OP1).n === 1);
  T = start + 3600 + 7200 + 31 * 86400;
  const swept = await dirMod.sweepCommunityEvents(env());
  check("thirty-one days after the end the event, its answers, attendance and history are gone, audited as a count", swept === 2 && !one("SELECT 1 FROM community_events WHERE id = ?", OP1) && !one("SELECT 1 FROM community_event_signups WHERE event_id = ?", OP1) && !one("SELECT 1 FROM community_event_attendance WHERE event_id = ?", OP1) && !!one("SELECT 1 FROM audit WHERE action = 'community.events_expired'"));
  check("  the admin's later event is still there", !!one("SELECT 1 FROM community_events WHERE id = ?", OP3));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

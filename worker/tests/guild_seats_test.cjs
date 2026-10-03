// Build .115 (3 Oct 2026, Viktor's item B of 2 Oct): whether Olympus I has room (src/guild-seats.ts), through the REAL
// src/*.ts (transpiled by TypeScript itself) against the REAL schema.sql in SQLite (node:sqlite), the site through the
// real index.ts fetch. Only Discord's HTTP side is stubbed (and recorded: a status reply must make no Discord call);
// member notices are recorded, never sent. Covers:
//   - GUILD_MEMBER_CAP: unset is 1000, 900..1000 is used, anything else is 1000 and reported as invalid (the bearer /health);
//   - the latest snapshot only: complete, trusted against the last TRUSTED export, after LINKS_NOT_BEFORE and fresh (48 h);
//     a newer distrusted, unfinished or unchecked export is never skipped for an older good one;
//   - roster.ts: the complete stamp inside the last member batch (a probe between batches sees "writing"; that batch failing
//     takes the snapshot back out), a row left unfinished ("stuck", written again by the next export, vouched for by sync
//     once all its member rows are there), trust that a refresh never raises, the trust base (pre-.115 rows re-judged in
//     order, unfinished rows never a base, nothing from before LINKS_NOT_BEFORE), the pre-.115 back-fill against that base,
//     /olympus-admin sync vouching for an export (audited);
//   - Codex's review of f975 (3 Oct 2026, 13:15 UTC): /olympus-admin sync changes no link, character or role from a
//     snapshot still being written (held between two member batches) or storing fewer rows than its count (unfinished,
//     pre-.115, complete but short), and its vouch counts the rows too (finding 1); a fully stored distrusted export and an
//     unfinished one with every row are still applied; an export naming one character twice (case, realm, spaces) is a
//     422 before any write, and the complete stamp proves the stored count in the last batch (finding 2); distinct names
//     still finish with the exact count;
//   - the review of 3 Oct 2026: each member batch is one INSERT ... SELECT over json_each (every field in its column, its
//     type kept), so a changed export of a full guild is a few dozen statements counted the way D1 counts them (each one of
//     a batch), at most ROSTER_INGEST_STATEMENTS_FULL_GUILD; a stamp that finds the rows short after every batch committed
//     is a final 422 "unusable" (audited, told once), never a 500 that would hold the watcher's later posts, and the next
//     post, a verification, is delivered, while a failing batch is still retried; the sync's "incomplete" refusal names
//     the snapshot to wait past, which /olympus-admin roster shows; every audit read guarded;
//   - a refused invite counts for six hours and only when newer than the deciding roster;
//   - /verify-status: the full-guild paragraph (times on the hour, the account's own places only, ephemeral, no notice,
//     no Discord call), an old refusal on the queue row outranked by a trusted roster with room, /verify and the codes
//     unchanged while full, getQueue and attempts unchanged;
//   - /api/me (the member's own places, rounded times, nothing for a denied account, nothing signed out or in /api/public),
//     the admin overview, /olympus-admin queue and roster, the guild-full staff notice;
//   - a failure of the seat reads: every surface still answers, one bounded log line each;
//   - ensureSchema over the 25 Sep database adds the columns and the index, twice without harm.
// Run from the worker folder:  node tests/guild_seats_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite, with the hooks this suite needs ----------
let FAULT = null; // (sql, phase) => boolean: throw a D1-shaped error at "prepare" or at "run"
let AFTER_BATCH = null; // async (sqls, params) => void: act between two batches (roster.ts writes members 50 to a batch)
// Review of 3 Oct 2026: D1 counts every statement of a batch toward one invocation's limit, so the shim counts them too
// (one per first/all/run, every statement of a batch whether or not it completes), for the full-guild ingest bound.
let STATEMENTS = 0;
function d1(dbh) {
  const fail = (sql, phase) => { if (FAULT?.(sql, phase)) throw new Error("D1_ERROR: injected failure (table detail that must not be logged)"); };
  const exec = (sql, params) => {
    fail(sql, "run");
    const st = dbh.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    fail(sql, "prepare");
    let params = [];
    const api = {
      _sql: sql,
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        params = p;
        return api;
      },
      first: async () => { STATEMENTS++; fail(sql, "run"); return dbh.prepare(sql).get(...params) ?? null; },
      all: async () => { STATEMENTS++; fail(sql, "run"); return { results: dbh.prepare(sql).all(...params) }; },
      run: async () => { STATEMENTS++; return exec(sql, params); },
      _exec: () => exec(sql, params),
      _params: () => params,
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      STATEMENTS += stmts.length;
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
fresh();

// ---------- the real modules; only Discord's HTTP side and the notice poster are stubbed ----------
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let FETCHES = [], REST = [], NOTICES = [], STAFF = [], LOGS = [];
globalThis.fetch = async (url, init = {}) => { FETCHES.push({ url: String(url), method: init.method ?? "GET" }); throw new Error("no network in tests"); };
const realDiscord = (() => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(mod, mod.exports, () => ({}));
  return mod.exports;
})();
const stubs = {
  "./discord": {
    ...realDiscord, // reply, json, userOf, option, subcommand, hasAnyRole: the real ones
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    editMessage: async () => ({}),
    staffNotice: async (_env, payload, kind) => { STAFF.push({ content: payload.content, kind }); return true; },
    addRole: async () => { REST.push("addRole"); },
    removeRole: async () => { REST.push("removeRole"); },
    guildMember: async () => { REST.push("guildMember"); return { roles: [] }; },
    setNickname: async () => { REST.push("setNickname"); },
    banMember: async () => { REST.push("banMember"); },
    rest: async (_env, method, p) => { REST.push(`${method} ${p}`); throw new Error("no REST in tests"); },
  },
  "./dm": { notify: async (_env, id, text, kind) => { NOTICES.push({ id, text, kind }); return true; }, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
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
const indexMod = load("./index"), gs = load("./guild-seats"), roster = load("./roster"), ingest = load("./ingest"), interactions = load("./interactions");
const siteCore = load("./site-core"), schema = load("./schema"), codes = load("./codes");

let T = 1791001234; // 3 Oct 2026, 04:20:34 UTC: deliberately not on the hour
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const H = 3600, DAY = 86400;
const GUILD = "1549537348516188200", VISITORS = "1554265065509756989", ADMIN = "472099715253796864", OFFICER = "1549581672272625734", GM = "1549581282227265566";
const OFFICER_USER = "999999999999999999";
const QUINN = "300000000000000001", BEA = "300000000000000002", CARL = "300000000000000003", PRIA = "300000000000000004", MEMBER = "300000000000000005", DENIED = "300000000000000006", VERA = "300000000000000007", WREN = "300000000000000008";
const SECRET = "verify-secret-for-tests";
const env = (over = {}) => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: SECRET, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: GUILD, CHANNEL_VISITOR_CHAT: VISITORS, DISCORD_APP_ID: "1550176895671341076", DISCORD_CLIENT_SECRET: "client-secret", DISCORD_PUBLIC_KEY: "00", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: GUILD, SITE_ADMINS: ADMIN, ROLE_OFFICER: OFFICER, ROLE_GUILD_MEMBER: GM, ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Officer Olly", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "555000000000000001", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const latest = () => one("SELECT * FROM roster_snapshots ORDER BY id DESC LIMIT 1");
const seatsNow = async (over = {}, at = T) => (await gs.guildSeats(env(over), at)).seats;
const members = (count, prefix = "Mem") => Array.from({ length: count }, (_, i) => ({ name: `${prefix}${String(i).padStart(4, "0")}`, rank: "Member", rankIndex: 3, guid: `Player-1-${prefix}${i}` }));
const exportRoster = (list, exportedAt, over = {}) => roster.ingestRoster(env(over), exportedAt, list, "addon");
// A snapshot row as roster.ts leaves it, without member rows (the seat state reads only the row).
const snapRow = (count, { exportedAt = T - H, receivedAt = exportedAt, trusted = 1, complete = 1 } = {}) =>
  Number(run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'h', ?, ?, ?)", exportedAt, receivedAt, count, trusted, complete, receivedAt).lastInsertRowid);
const refusal = (ts) => run("INSERT INTO audit (ts, actor, action, details) VALUES (?, 'watcher', 'guild.full', '{}')", ts);
const queued = (id, name, { priority = 0, createdAt = T - 600, character = true } = {}) => {
  run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING", id);
  if (character) run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at) VALUES (?, ?, ?, 'queued', ?, ?)", codes.normalizeCharacter(name), name, id, T - DAY, T - DAY);
  return Number(run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by, priority) VALUES (?, ?, ?, 'queued', ?, 'auto', ?)", codes.normalizeCharacter(name), name, id, createdAt, priority).lastInsertRowid);
};
const siteUser = (id, denied = 0) => run("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, ?, 1) ON CONFLICT(discord_id) DO NOTHING", id, "u" + id.slice(-2), T, T, denied);
let iid = 0;
const command = (name, user, { roles = [], options } = {}) => ({ type: 2, id: "9" + String(++iid).padStart(17, "0"), token: "t", guild_id: GUILD, member: { user: { id: user, username: "u" }, roles }, data: options ? { name, options } : { name } });
const answer = async (payload, over = {}) => (await interactions.handleInteraction(env(over), payload)).json();
const status = async (id, over = {}) => (await answer(command("verify-status", id), over)).data;
const admin = async (sub, over = {}) => (await answer(command("olympus-admin", OFFICER_USER, { roles: [OFFICER], options: [{ name: sub, type: 1, options: [] }] }), over)).data.content;
const cookieFor = async (id) => (await siteCore.sessionCookie(env(), id, 1)).split(";")[0];
async function site(method, url, { who, over = {} } = {}) {
  const h = new Headers();
  if (who) h.set("Cookie", await cookieFor(who));
  return indexMod.default.fetch(new Request(new URL(url, "https://guild.example"), { method, headers: h }), env(over), ctx);
}
const bootOf = async (res) => JSON.parse((await res.text()).match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]);
const times = (s) => [...s.matchAll(/<t:(\d+):R>/g)].map((m) => Number(m[1]));
const quiet = async (fn) => { const real = console.error, lines = []; console.error = (...a) => { lines.push(a.map(String).join(" ")); }; try { return { value: await fn(), lines }; } finally { console.error = real; } };

(async () => {
  console.log("\n== GUILD_MEMBER_CAP: 900..1000 or the game's 1000 ==");
  const cap = (v) => gs.seatCap({ GUILD_MEMBER_CAP: v });
  check("unset: 1000, default", cap(undefined).cap === 1000 && cap(undefined).configured === "default" && cap("").configured === "default");
  check("'990': used as given", cap("990").cap === 990 && cap("990").configured === "set" && cap("900").cap === 900 && cap("1000").cap === 1000);
  const bad = ["0", "10", "899", "1001", "abc", "1e3", "900x", "-950", "950.5"];
  check("'0', '10', '899', '1001', 'abc', '1e3', '900x', '-950', '950.5': 1000, invalid (a typo never announces a full guild)", bad.every((v) => cap(v).cap === 1000 && cap(v).configured === "invalid"), bad.map((v) => [v, cap(v)]));
  let res = await indexMod.default.fetch(new Request("https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), env({ GUILD_MEMBER_CAP: "1e3" }), ctx);
  let health = await res.json();
  check("the bearer /health shows the seat state and capConfigured", health.seats && health.seats.capConfigured === "invalid" && health.seats.cap === 1000 && health.seats.state === "unknown" && health.seats.reason === "none", health.seats);
  res = await indexMod.default.fetch(new Request("https://verify.example/health"), env(), ctx);
  check("  the public /health still says only ok, build and d1", Object.keys(await res.json()).sort().join(",") === "build,d1,ok");

  console.log("\n== only the latest snapshot decides ==");
  fresh();
  let r = await exportRoster(members(1000), T - 2 * H);
  let row = latest();
  check("a first export of 1000: complete 1, trusted 1, first_received_at = received_at", row.complete === 1 && row.trusted === 1 && row.first_received_at === T && row.received_at === T && r.trusted === true, row);
  let s = await seatsNow();
  check("  the roster decides: full, 1000 of 1000, from the roster", s.state === "full" && s.full && s.source === "roster" && s.members === 1000 && s.free === 0 && s.rosterAt === T - 2 * H && s.reason === null, s);
  r = await exportRoster(members(5, "Live"), T - H);
  s = await seatsNow();
  check("a trusted 1000 followed by a distrusted live 5: unknown/distrusted, never the older 1000", r.trusted === false && latest().trusted === 0 && latest().complete === 1 && s.state === "unknown" && s.reason === "distrusted" && !s.full && s.members === null, s);
  fresh();
  await exportRoster(members(1000), T - 2 * H);
  await exportRoster(members(800), T - H);
  s = await seatsNow();
  check("1000 followed by a distrusted 800: unknown, not full", s.state === "unknown" && s.reason === "distrusted" && !s.full);
  fresh();
  snapRow(1000, { exportedAt: T - H });
  s = await seatsNow({ LINKS_NOT_BEFORE: String(T - 30 * 60) });
  check("LINKS_NOT_BEFORE later than the 1000 export: unknown/before_links", s.state === "unknown" && s.reason === "before_links", s);
  refusal(T - 50 * 60);
  s = await seatsNow({ LINKS_NOT_BEFORE: String(T - 30 * 60) });
  check("  and a refusal from before LINKS_NOT_BEFORE does not count either", s.state === "unknown" && s.refusedAt === null, s);
  fresh();
  snapRow(1000, { exportedAt: T - 3 * DAY, receivedAt: T - 60 });
  s = await seatsNow();
  check("exported_at 3 days old with a fresh received_at: unknown/stale (the older of the two times)", s.state === "unknown" && s.reason === "stale", s);
  fresh();
  snapRow(1000, { exportedAt: T - 49 * H });
  check("49 h old: stale", (await seatsNow()).reason === "stale");
  fresh();
  snapRow(1000, { exportedAt: T - 47 * H });
  check("47 h old: still decides (ROSTER_SEATS_FOR is 48 h)", (await seatsNow()).state === "full" && roster.ROSTER_SEATS_FOR === 48 * H);
  fresh();
  snapRow(1000, { complete: null, trusted: null });
  check("a pre-.115 row (complete NULL): unknown/unchecked", (await seatsNow()).reason === "unchecked");
  fresh();
  check("no export at all: unknown/none", (await seatsNow()).reason === "none");

  console.log("\n== trust is judged against the last trusted export, and a refresh never raises it ==");
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(850), T - 2000);
  const distrustedId = latest().id;
  check("1000 then 850: the 850 row is complete and distrusted", latest().trusted === 0 && latest().complete === 1);
  T += 10;
  await exportRoster(members(850), T - 1500);
  row = latest();
  check("an identical 850 repeat refreshes the same row, which stays trusted 0 (received_at moves, first_received_at does not)", row.id === distrustedId && row.trusted === 0 && row.complete === 1 && row.received_at === T && row.first_received_at === T - 10, row);
  check("  the state stays unknown/distrusted", (await seatsNow()).reason === "distrusted");
  r = await exportRoster(members(851), T - 1000);
  row = latest();
  check("then a different 851: trusted against the 850 for removals, but recorded trusted 0 (14.9% below the last trusted 1000)", r.trusted === true && row.id !== distrustedId && row.trusted === 0 && row.complete === 1, { r: r.trusted, row });
  let content = await admin("sync");
  row = latest();
  // review of 3 Oct 2026: every audit read is guarded, so a missing row fails its check instead of stopping the suite
  const syncDetails = () => JSON.parse(one("SELECT details FROM audit WHERE action = 'admin.sync' ORDER BY id DESC LIMIT 1")?.details ?? "null");
  let syncAudit = syncDetails();
  s = await seatsNow();
  check("/olympus-admin sync vouches for it: trusted 1, admin.sync records trustedSet", row.trusted === 1 && row.complete === 1 && !!syncAudit && syncAudit.trustedSet === true, { row, syncAudit });
  check("  the reply says so", content.includes("This export now counts for the seat count."), content);
  check("  and the state is open: 149 free", s.state === "open" && s.free === 149 && s.members === 851, s);
  content = await admin("sync");
  syncAudit = syncDetails();
  check("a second sync changes nothing and says nothing about the seat count", !!syncAudit && syncAudit.trustedSet === false && !content.includes("seat count"), content);
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(850), T - 2000);
  await exportRoster(members(995), T - 1000);
  check("1000, 850 (distrusted), then 995: trusted again (0.5% below the last trusted 1000)", latest().trusted === 1 && (await seatsNow()).state === "open");
  await exportRoster(members(995), T - 500, { ROSTER_MIN_MEMBERS: "996" });
  check("an identical refresh below the floor lowers trust (MIN), and nothing raises it again but a different export or a sync", latest().trusted === 0);
  await exportRoster(members(995), T - 400);
  check("  the next identical refresh above the floor leaves it at 0", latest().trusted === 0);

  console.log("\n== a snapshot counts only once every member row is in ==");
  fresh();
  await exportRoster(members(1000), T - 3000);
  let probe = null;
  AFTER_BATCH = async (sqls) => {
    if (probe || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    probe = { row: latest() };
    probe.seats = await seatsNow();
  };
  await exportRoster(members(999, "New"), T - 1000);
  AFTER_BATCH = null;
  check("between two member batches the new row is complete 0, trusted NULL", probe && probe.row.complete === 0 && probe.row.trusted === null && probe.row.first_received_at === T, probe && probe.row);
  check("  and the seat state is unknown/writing: the older trusted 1000 is not used instead", probe && probe.seats.state === "unknown" && probe.seats.reason === "writing" && !probe.seats.full, probe && probe.seats);
  check("  once written: complete 1, trusted 1, open with 1 free", latest().complete === 1 && latest().trusted === 1 && (await seatsNow()).free === 1);
  // review of 3 Oct 2026: the stamp is the last statement of the last member batch, never a statement of its own
  const batches = [];
  const batchParams = [];
  AFTER_BATCH = async (sqls, params) => { batches.push(sqls); batchParams.push(params); };
  await exportRoster(members(120, "Bat"), T - 900);
  AFTER_BATCH = null;
  const memberBatches = batches.filter((b) => b.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)));
  const stampAt = batches.findIndex((b) => b.some((q) => /SET complete = 1, trusted = \?2/.test(q)));
  // review of 3 Oct 2026 (D1 counts each statement of a batch): each member batch is ONE INSERT ... SELECT over json_each
  // carrying its 50 members, not 50 statements; the batches and the stamp's place are as before
  const rowsIn = (i) => { const p = batchParams[batches.indexOf(memberBatches[i])]?.[0]; try { const rows = JSON.parse(p[1]); return Array.isArray(rows) ? rows.length : -1; } catch { return -1; } };
  // third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): the snapshot's effects run rides in the same batch, right
  // after the stamp and only when the stamp held, so a complete snapshot always has its run (roster_effects_test)
  check("the stamp rides in the last member batch: 120 members in batches of 50, 50 and 20 rows, one json_each statement each, + the stamp + the snapshot's effects run", memberBatches.length === 3 && memberBatches.every((b, i) => b.length === (i === 2 ? 3 : 1) && /^INSERT OR REPLACE INTO roster_members [\s\S]*FROM json_each\(\?2\) j$/.test(b[0])) && [0, 1, 2].map(rowsIn).join() === "50,50,20" && /SET complete = 1, trusted = \?2/.test(memberBatches[2][1]) && /^INSERT INTO roster_effect_runs \(snapshot_id, prev_snapshot_id, removals, created_at\) SELECT \?1, \?2, \?3, \?4 WHERE EXISTS \(SELECT 1 FROM roster_snapshots WHERE id = \?1 AND complete = 1\)$/.test(memberBatches[2][2]) && batches[stampAt] === memberBatches[2], batches.map((b) => b.length), [0, 1, 2].map(rowsIn));
  const batRows = db.prepare("SELECT name_key, name, rank, rank_index, level, class, public_note, officer_note, guid, last_online FROM roster_members WHERE snapshot_id = ? ORDER BY name_key").all(latest().id);
  check("  the rows hold what the export said, column by column (name key, name, rank, its index, the GUID; the rest NULL as sent)", batRows.length === 120 && batRows[0].name_key === "bat0000" && batRows[0].name === "Bat0000" && batRows[0].rank === "Member" && batRows[0].rank_index === 3 && batRows[0].guid === "Player-1-Bat0" && batRows[0].level === null && batRows[0].class === null && batRows[0].public_note === null && batRows[0].officer_note === null && batRows[0].last_online === null, batRows[0]);
  const full = { name: "Fil Every", rank: "Officer", rankIndex: 1, level: 60, class: "PRIEST", note: "Main; \"tank\"", officerNote: "alt; 'quoted'", guid: "Player-4-0ABC", lastOnline: 1791000000 };
  await exportRoster([...members(119, "Bat"), full], T - 850);
  const filRow = one("SELECT name_key, name, rank, rank_index, level, class, public_note, officer_note, guid, last_online, typeof(rank_index) AS ti, typeof(level) AS tl, typeof(last_online) AS to_ FROM roster_members WHERE snapshot_id = ? AND name_key = 'fil every'", latest().id);
  check("  every field of a member, quotes and numbers included, lands in its column with its type (integers stay integers)", !!filRow && filRow.name === "Fil Every" && filRow.rank === "Officer" && filRow.rank_index === 1 && filRow.level === 60 && filRow.class === "PRIEST" && filRow.public_note === 'Main; "tank"' && filRow.officer_note === "alt; 'quoted'" && filRow.guid === "Player-4-0ABC" && filRow.last_online === 1791000000 && filRow.ti === "integer" && filRow.tl === "integer" && filRow.to_ === "integer", filRow);
  const goodId = latest().id;
  FAULT = (sql, phase) => phase === "run" && /SET complete = 1, trusted = \?2/.test(sql);
  let threw = false;
  try { await exportRoster(members(998, "Odd"), T - 500); } catch { threw = true; }
  FAULT = null;
  check("the last member batch failing together with the stamp: the ingest throws (the watcher retries), the snapshot and its member rows are taken back out, roster.ingest_failed is audited, never roster.stamp_failed", threw && latest().id === goodId && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id > ?", goodId).c === 0 && !!one("SELECT 1 FROM audit WHERE action = 'roster.ingest_failed'") && !one("SELECT 1 FROM audit WHERE action = 'roster.stamp_failed'"));
  check("  the latest row is still the earlier complete export (the 120)", latest().member_count === 120 && latest().complete === 1);
  r = await exportRoster(members(998, "Odd"), T - 500);
  check("  the same export sent again is written in full: complete 1, trusted 1", r.members === 998 && latest().id !== goodId && latest().complete === 1 && latest().trusted === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", latest().id).c === 998);
  r = await exportRoster([], T - 300);
  check("an export with no members writes its stamp alone: complete 1, trusted 0 (100% smaller), nothing removed", latest().member_count === 0 && latest().complete === 1 && latest().trusted === 0 && r.trusted === false);

  console.log("\n== a snapshot left unfinished (the isolate stopped between member batches) ==");
  const unfinish = (id, firstAt) => run("UPDATE roster_snapshots SET complete = 0, trusted = NULL, first_received_at = ? WHERE id = ?", firstAt, id);
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(999, "New"), T - 2000);
  const stuckId = latest().id;
  unfinish(stuckId, T - 300);
  check("complete 0 for five minutes: unknown/writing (another export may still be writing it)", (await seatsNow()).reason === "writing");
  const writingExportedAt = latest().exported_at;
  let writingRetry = false;
  try { await exportRoster(members(999, "New"), T - 1500); } catch { writingRetry = true; }
  check("  an identical export inside the ten minutes asks the watcher to retry, without refreshing the incomplete row", writingRetry && latest().id === stuckId && latest().exported_at === writingExportedAt && latest().complete === 0 && latest().trusted === null);
  content = await admin("sync");
  check("  /olympus-admin sync does not vouch for it yet", latest().complete === 0 && !content.includes("seat count"), content);
  T += 400;
  s = await seatsNow();
  check("past ten minutes: unknown/stuck, and the staff line says the next export writes it again", s.reason === "stuck" && gs.seatsStaffLine(s) === "Olympus I room: unknown (the latest export was left unfinished; the addon's next export writes it again)" && roster.SNAPSHOT_WRITE_GRACE_S === 600, gs.seatsStaffLine(s));
  content = await admin("sync");
  check("  with every member row there, /olympus-admin sync vouches for it: complete 1, trusted 1", latest().id === stuckId && latest().complete === 1 && latest().trusted === 1 && content.includes("This export now counts for the seat count."), content);
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(999, "New"), T - 2000);
  const halfId = latest().id;
  unfinish(halfId, T - 700);
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key >= 'new0950'", halfId);
  content = await admin("sync");
  check("an unfinished row with member rows missing: sync never vouches for it", latest().id === halfId && latest().complete === 0 && !content.includes("seat count"));
  r = await exportRoster(members(999, "New"), T - 2000);
  row = latest();
  check("  the same export sent again is written in full as a new snapshot: complete 1, trusted 1 (against the 1000, never the unfinished row)", !r.skipped && row.id !== halfId && row.complete === 1 && row.trusted === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", row.id).c === 999 && (await seatsNow()).free === 1, { r, row });

  console.log("\n== the trust base: pre-.115 rows re-judged in order, unfinished rows never a base ==");
  const makePre115 = () => run("UPDATE roster_snapshots SET trusted = NULL, complete = NULL, first_received_at = NULL");
  fresh();
  await exportRoster(members(1000), T - 5000);
  await exportRoster(members(850), T - 4000); // distrusted by its own ingest (roster.distrusted)
  makePre115();
  r = await exportRoster(members(851), T - 3000);
  check("a pre-.115 distrusted 850 followed by a changed 851: trusted for removals, recorded trusted 0 (14.9% below the pre-.115 1000)", r.trusted === true && latest().trusted === 0 && latest().complete === 1, latest());
  fresh();
  await exportRoster(members(1000), T - 5000);
  await exportRoster(members(850), T - 4000);
  unfinish(latest().id, T - 4000);
  r = await exportRoster(members(851), T - 3000);
  check("an unfinished 850 (complete 0) followed by a changed 851: recorded trusted 0 (the unfinished row is never a base)", r.trusted === true && latest().trusted === 0, latest());
  fresh();
  await exportRoster(members(1000), T - 5000);
  await exportRoster(members(850), T - 4000);
  await exportRoster(members(851), T - 3000); // trusted by its ingest (against the 850), so it has no roster.distrusted row
  makePre115();
  await exportRoster(members(851), T - 2000);
  check("a pre-.115 851 after a distrusted pre-.115 850 is back-filled as trusted 0 (14.9% below the 1000 before them)", latest().trusted === 0 && latest().complete === 1, latest());
  fresh();
  await exportRoster(members(1000), T - 5000);
  await exportRoster(members(850), T - 4000);
  await exportRoster(members(851), T - 3000);
  makePre115();
  await exportRoster(members(852), T - 2000);
  check("  and a changed 852 after that pre-.115 851 is recorded trusted 0 as well (the 851 is no base)", latest().trusted === 0 && latest().member_count === 852);
  fresh();
  await exportRoster(members(1100), T - 5000);
  await exportRoster(members(1000), T - 4000); // 9.1% smaller: trusted
  makePre115();
  await exportRoster(members(950), T - 3000);
  check("pre-.115 1100 then 1000, then a changed 950: trusted 1 (judged against the 1000, not the 1100)", latest().trusted === 1);

  console.log("\n== LINKS_NOT_BEFORE: the beta's last export is no base for the live guild ==");
  fresh();
  {
    const T0 = T, over = { LINKS_NOT_BEFORE: String(T0 - 30 * H) };
    T = T0 - 31 * H; await exportRoster(members(1000, "Beta"), T - 60, over);
    T = T0 - 29 * H; await exportRoster(members(1, "Live"), T - 60, over);
    const live1 = latest();
    T = T0 - 28 * H; await exportRoster(members(50, "Live"), T - 60, over);
    const live50 = latest();
    T = T0 - 2 * H; await exportRoster(members(300, "Live"), T - 60, over);
    const live300 = latest();
    T = T0;
    check("a beta export of 1000, then live 1: distrusted (the ingest's own decision, nothing removed)", live1.trusted === 0);
    check("  live 50 and 300 are recorded trusted (no trusted export on or after LINKS_NOT_BEFORE: the ingest's own decision stands)", live50.trusted === 1 && live300.trusted === 1, live50, live300);
    s = await seatsNow(over);
    check("  the seat state is open: 700 free", s.state === "open" && s.free === 700, s);
    run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL)", T);
    const outcome = await load("./site-news").refreshNewsFigures(env(over), T);
    const figs = JSON.parse(one("SELECT value FROM site_settings WHERE key = 'newsFigures'").value);
    check("  and News finds its roster base (the live 50, a day back)", outcome === "computed" && figs.dayBaseId === live50.id && figs.latestId === live300.id, outcome, figs);
  }

  console.log("\n== a pre-.115 snapshot is back-filled once, from its own audit and a member count ==");
  fresh();
  await exportRoster(members(950), T - 3000);
  const oldId = latest().id;
  const makeOld = () => run("UPDATE roster_snapshots SET trusted = NULL, complete = NULL, first_received_at = NULL WHERE id = ?", oldId);
  makeOld();
  check("a pre-.115 row reads unknown/unchecked", (await seatsNow()).reason === "unchecked");
  await exportRoster(members(950), T - 2000);
  row = latest();
  check("refreshed with no roster.distrusted audit and a matching count: trusted 1, complete 1", row.id === oldId && row.trusted === 1 && row.complete === 1, row);
  check("  and the state is open, 50 free", (await seatsNow()).free === 50);
  makeOld();
  run("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'roster.distrusted', ?, '{}')", T - 2500, String(oldId));
  await exportRoster(members(950), T - 1500);
  check("with its own roster.distrusted audit: trusted 0", latest().trusted === 0 && latest().complete === 1);
  makeOld();
  run("DELETE FROM audit WHERE action = 'roster.distrusted'");
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = 'mem0001'", oldId);
  let badLegacyRetry = false;
  try { await exportRoster(members(950), T - 1000); } catch { badLegacyRetry = true; }
  // Codex's review of f975 (3 Oct 2026, 13:15 UTC, finding 2): the back-fill's complete stamp proves the count too, so the
  // row is left unfinished (complete 0, at once "stuck") rather than stamped complete over rows that are not all there.
  check("with a member count that does not match: retryable, trusted 0 (fail closed), and complete 0: left unfinished, never a complete stamp over missing rows", badLegacyRetry && latest().trusted === 0 && latest().complete === 0 && (await seatsNow()).reason === "stuck");
  makeOld();
  content = await admin("sync");
  check("/olympus-admin sync does not vouch for a pre-.115 row whose member rows are missing", latest().trusted === null && !content.includes("seat count"));
  run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, 'mem0001', 'Mem0001')", oldId);
  content = await admin("sync");
  check("  and does once they are all there", latest().trusted === 1 && latest().complete === 1 && content.includes("This export now counts for the seat count."));

  // Codex's review of f975 (3 Oct 2026, 13:15 UTC, finding 1; backend-review.md, control 1): the sync used to read whatever
  // member rows had arrived and remove the role from everyone missing, and only then refuse to vouch for the seat count.
  console.log("\n== /olympus-admin sync changes nothing from a snapshot it cannot read in full (Codex, 3 Oct 13:15 UTC, finding 1) ==");
  const bindMember = (id, name, guid) => {
    run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING", id);
    run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, member_since, guid) VALUES (?, ?, ?, 'member', ?, ?, ?, ?)", codes.normalizeCharacter(name), name, id, T - DAY, T - DAY, T - DAY, guid);
  };
  const statusOf = (name) => one("SELECT status FROM characters WHERE name_key = ?", codes.normalizeCharacter(name)).status;
  const characterRows = () => JSON.stringify(db.prepare("SELECT * FROM characters ORDER BY name_key").all());
  const lastAudit = (action) => one("SELECT subject, details FROM audit WHERE action = ? ORDER BY id DESC LIMIT 1", action);
  const auditCount = (action) => one("SELECT COUNT(*) AS c FROM audit WHERE action = ?", action).c;
  fresh();
  await exportRoster(members(1000), T - 3000);
  bindMember(BEA, "Mem0990", "Player-1-Mem990"); // on the next export too, but only in its last member batch
  bindMember(CARL, "Mem0005", "Player-1-Mem5"); // in its first member batch
  let before = characterRows();
  REST = [];
  let hold = null;
  AFTER_BATCH = async (sqls) => {
    if (hold || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    hold = {}; // first: the sync below runs batches of its own
    hold.row = latest();
    hold.stored = one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", hold.row.id).c;
    hold.content = await admin("sync");
    hold.characters = characterRows();
    hold.rest = [...REST];
    hold.after = latest();
    hold.syncAudits = auditCount("roster.sync");
  };
  r = await exportRoster([...members(1000), { name: "Late Joiner", rank: "Member", rankIndex: 3, guid: "Player-1-LJ" }], T - 1000);
  AFTER_BATCH = null;
  check("held after the first of 21 member batches: the new snapshot is complete 0 with 50 of its 1001 rows", hold && hold.row.complete === 0 && hold.row.member_count === 1001 && hold.stored === 50, hold && { row: hold.row, stored: hold.stored });
  check("  /olympus-admin sync applies nothing and says why", hold && hold.content.startsWith(`Nothing applied: roster snapshot #${hold.row.id} is still being written (it arrived <t:${T}:R>)`) && hold.content.includes("No role or link was changed.") && !hold.content.includes("Removed") && !hold.content.includes("seat count"), hold && hold.content);
  check("  no character changes: Mem0990 (absent only from the unwritten batches) is still a member, and so is everyone else", hold && hold.characters === before && statusOf("Mem0990") === "member" && statusOf("Mem0005") === "member");
  check("  no Discord call at all (no role DELETE), no roster.sync audit", hold && hold.rest.length === 0 && hold.syncAudits === 0, hold && hold.rest);
  check("  no vouch: still complete 0, trusted NULL", hold && hold.after.complete === 0 && hold.after.trusted === null, hold && hold.after);
  let refusedAudit = lastAudit("admin.sync_refused");
  check("  admin.sync_refused is audited with the counts only", !!refusedAudit && refusedAudit.subject === String(hold.row.id) && JSON.stringify(JSON.parse(refusedAudit.details)) === JSON.stringify({ reason: "writing", memberCount: 1001, stored: 50 }), refusedAudit);
  check("  the export then finishes as usual: complete 1, trusted 1, 1001 rows, Mem0990 still a member", !r.skipped && latest().complete === 1 && latest().trusted === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", latest().id).c === 1001 && statusOf("Mem0990") === "member");

  // positive control: a fully stored, genuinely smaller export that is distrusted is still applied when an officer asks
  fresh();
  await exportRoster(members(1000), T - 3000);
  bindMember(BEA, "Mem0990", "Player-1-Mem990"); // not on the 850
  bindMember(CARL, "Mem0005", "Player-1-Mem5"); // on both
  REST = [];
  r = await exportRoster(members(850), T - 2000);
  check("positive control: 1000 then a fully stored 850 is distrusted, and its ingest removes nobody", r.trusted === false && latest().complete === 1 && latest().trusted === 0 && statusOf("Mem0990") === "member" && !REST.includes("removeRole"));
  REST = [];
  content = await admin("sync");
  check("  /olympus-admin sync applies it: Mem0990 loses the character and the role, Mem0005 stays", statusOf("Mem0990") === "left" && REST.includes("removeRole") && statusOf("Mem0005") === "member" && content.includes("Removed (1): Mem0990"), { content, REST });
  check("  and vouches for it: open, 150 free", content.includes("This export now counts for the seat count.") && latest().trusted === 1 && (await seatsNow()).free === 150);

  // positive control: a row left unfinished whose member rows turn out to be all there is applied too
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(999, "New"), T - 2000);
  unfinish(latest().id, T - 700);
  bindMember(BEA, "Mem0990", "Player-1-Mem990"); // not on the 999 "New" roster
  REST = [];
  content = await admin("sync");
  check("positive control: an unfinished row with all 999 member rows: sync applies it (Mem0990 removed) and vouches for it", statusOf("Mem0990") === "left" && REST.includes("removeRole") && content.includes("Removed (1): Mem0990") && content.includes("This export now counts for the seat count.") && latest().complete === 1 && latest().trusted === 1, content);

  // an unfinished row with member rows missing: nothing applied
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(999, "New"), T - 2000);
  const gapId = latest().id;
  unfinish(gapId, T - 700);
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key >= 'new0950'", gapId);
  bindMember(BEA, "New0960", "Player-1-New960"); // its row is among the missing ones
  bindMember(CARL, "Mem0990", "Player-1-Mem990"); // on neither
  before = characterRows();
  REST = [];
  content = await admin("sync");
  check("an unfinished row storing 950 of its 999 rows: nothing applied, and the reply says how many are stored", content.startsWith(`Nothing applied: roster snapshot #${gapId} stores 950 of the 999 members its export listed, so it cannot say who left.`) && content.includes("No role or link was changed."), content);
  check("  New0960 (row missing) and Mem0990 keep their characters; no Discord call; not vouched", characterRows() === before && statusOf("New0960") === "member" && statusOf("Mem0990") === "member" && REST.length === 0 && latest().complete === 0 && latest().trusted === null);
  refusedAudit = lastAudit("admin.sync_refused");
  // review of 3 Oct 2026: guarded like the first refusal check, so a missing row fails this check instead of stopping the suite
  check("  admin.sync_refused: incomplete, 950 of 999", !!refusedAudit && JSON.stringify(JSON.parse(refusedAudit.details)) === JSON.stringify({ reason: "incomplete", memberCount: 999, stored: 950 }), refusedAudit);

  // a complete but distrusted row whose count is larger than its rows (as INSERT OR REPLACE left an export with a name twice
  // before finding 2): never applied and never vouched for, so its count can never become the seat count
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(850), T - 2000);
  const shortId = latest().id;
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = 'mem0849'", shortId);
  bindMember(BEA, "Mem0990", "Player-1-Mem990"); // not on the 850: an override would remove it
  bindMember(CARL, "Mem0849", "Player-1-Mem849"); // its row is the missing one
  before = characterRows();
  REST = [];
  content = await admin("sync");
  s = await seatsNow();
  check("a complete, distrusted 850 storing 849 rows: nothing applied, no Discord call, not vouched", content.startsWith(`Nothing applied: roster snapshot #${shortId} stores 849 of the 850 members`) && characterRows() === before && REST.length === 0 && latest().trusted === 0, content);
  check("  the seat state stays unknown/distrusted: no count from that row", s.state === "unknown" && s.reason === "distrusted" && s.members === null, s);
  // the vouch itself proves the count (the admin-vouch path of finding 2): a row lost between the sync's read and its vouch
  run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, 'mem0849', 'Mem0849')", shortId);
  FAULT = (sql, phase) => {
    if (phase === "run" && /SET trusted = 1, complete = 1/.test(sql)) run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = 'mem0849'", shortId);
    return false;
  };
  content = await admin("sync");
  FAULT = null;
  syncAudit = JSON.parse(lastAudit("admin.sync")?.details ?? "null");
  check("  once all 850 rows are there the sync applies it, but a row gone before the vouch keeps it distrusted (the vouch counts the rows too)", content.includes("Removed (1): Mem0990") && !content.includes("seat count") && !!syncAudit && syncAudit.trustedSet === false && latest().trusted === 0 && (await seatsNow()).reason === "distrusted", { content, syncAudit });

  // a pre-.115 row with member rows missing: nothing applied; its identical refresh leaves it unfinished; the next export writes it in full
  fresh();
  await exportRoster(members(950), T - 3000);
  const preId = latest().id;
  run("UPDATE roster_snapshots SET trusted = NULL, complete = NULL, first_received_at = NULL WHERE id = ?", preId);
  run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = 'mem0001'", preId);
  bindMember(BEA, "Mem0001", "Player-1-Mem1"); // its row is the missing one
  before = characterRows();
  REST = [];
  content = await admin("sync");
  check("a pre-.115 row storing 949 of 950 rows: nothing applied (Mem0001 keeps its character), no Discord call, not vouched", content.startsWith(`Nothing applied: roster snapshot #${preId} stores 949 of the 950 members`) && characterRows() === before && REST.length === 0 && latest().complete === null && latest().trusted === null, content);
  const preRuns = one("SELECT COUNT(*) AS c FROM roster_effect_runs").c;
  const preNotices = NOTICES.length;
  let legacyRetry = false;
  try { await exportRoster(members(950), T - 2000); } catch { legacyRetry = true; }
  row = latest();
  s = await seatsNow();
  check("  an identical refresh back-fills it as unfinished (complete 0, trusted 0): retryable, unknown/stuck, with no new run or effects", legacyRetry && row.id === preId && row.complete === 0 && row.trusted === 0 && s.reason === "stuck" && one("SELECT COUNT(*) AS c FROM roster_effect_runs").c === preRuns && characterRows() === before && REST.length === 0 && NOTICES.length === preNotices, row);
  content = await admin("sync");
  check("  and sync still applies nothing from it", content.startsWith(`Nothing applied: roster snapshot #${preId} stores 949 of the 950 members`) && statusOf("Mem0001") === "member");
  // review of 3 Oct 2026: the refresh moved the export time but kept the number, so the remedy names the snapshot to wait
  // past, and /olympus-admin roster shows that number (a newer export time alone would send the officer back to this refusal)
  let rosterReply = await admin("roster");
  check("  the refusal names the snapshot to wait past, and /olympus-admin roster shows that number, the same after the refresh", content.includes(`The addon's next exports write the roster again in full as a new snapshot (an identical export may first only mark #${preId} unfinished); run sync once \`/olympus-admin roster\` shows a snapshot newer than #${preId}.`) && !content.includes("shows a newer export") && rosterReply.includes(`Last roster: 950 members (snapshot #${preId}), exported <t:${T - 2000}:R>`), { content, rosterReply: rosterReply.slice(0, 300) });
  r = await exportRoster(members(950), T - 1000);
  row = latest();
  check("  the next export writes the roster again in full: a new snapshot, complete 1, trusted 1, 950 rows, open with 50 free", !r.skipped && row.id !== preId && row.complete === 1 && row.trusted === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", row.id).c === 950 && (await seatsNow()).free === 50, { r, row });
  rosterReply = await admin("roster");
  check("  /olympus-admin roster now shows a snapshot newer than the refused one, and sync applies it", row.id > preId && rosterReply.includes(`Last roster: 950 members (snapshot #${row.id})`) && (await admin("sync")).startsWith(`Re-applied roster snapshot #${row.id}.`), rosterReply.slice(0, 300));

  // Codex's review of f975 (3 Oct 2026, 13:15 UTC, finding 2; backend-review.md, control 2): INSERT OR REPLACE keyed by the
  // normalised name kept one row for two entries while member_count counted both, and the stamp called that complete.
  console.log("\n== an export naming one character twice is refused before any write (Codex, 3 Oct 13:15 UTC, finding 2) ==");
  const postRosterHttp = async (body) => {
    const res = await indexMod.default.fetch(new Request("https://verify.example/ingest/roster", { method: "POST", headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789", "Content-Type": "application/json" }, body: JSON.stringify(body) }), env(), ctx);
    return { status: res.status, body: await res.json() };
  };
  const tableCounts = () => ["roster_snapshots", "roster_members", "roster_first_seen", "invite_queue"].map((t) => one(`SELECT COUNT(*) AS c FROM ${t}`).c).join(",");
  check("the name key ignores case, spaces and the realm (the collisions below are real ones)", codes.normalizeCharacter("mem0005") === "mem0005" && codes.normalizeCharacter("Mem0006-Elsewhere") === "mem0006" && codes.normalizeCharacter("  Mem0007 ") === "mem0007");
  fresh();
  await exportRoster(members(999), T - 3000);
  const keptId = latest().id;
  check("(a trusted 999: open, 1 free)", (await seatsNow()).free === 1);
  bindMember(BEA, "Mem0990", "Player-1-Mem990"); // left out of the export below: a trusted export would arm its removal
  queued(QUINN, "Queue Quinn"); // on the export below: an accepted export would make it a member and grant the role
  const dupExport = [...members(999).filter((m) => m.name !== "Mem0990"), { name: "Queue Quinn", rank: "Member", rankIndex: 3, guid: "Player-1-QQ" },
    { name: "mem0005", rank: "Member", rankIndex: 3, guid: "Player-1-Other5" }, { name: "Mem0006-Elsewhere", rank: "Member", rankIndex: 3, guid: "Player-1-Other6" }, { name: "  Mem0007 ", rank: "Member", rankIndex: 3, guid: "Player-1-Other7" }];
  before = characterRows();
  const countsBefore = tableCounts();
  REST = []; LOGS = []; NOTICES = [];
  let posted = await postRosterHttp({ exportedAt: T - 1000, members: dupExport });
  check("1002 entries naming 3 characters twice (case, realm, spaces): 422 refused, with the counts", posted.status === 422 && JSON.stringify(posted.body) === JSON.stringify({ refused: "duplicate_names", members: 1002, duplicates: 3 }), posted);
  check("  nothing written: no snapshot, no member rows, no first-seen dates, the queue as it was", tableCounts() === countsBefore && latest().id === keptId, { before: countsBefore, after: tableCounts() });
  check("  no link, character or role change: Mem0990 still a member (not left_pending), Queue Quinn still queued", characterRows() === before && statusOf("Mem0990") === "member" && statusOf("Queue Quinn") === "queued");
  check("  no Discord call, no member notice", REST.length === 0 && NOTICES.length === 0, { REST, NOTICES });
  s = await seatsNow();
  check("  the seat state still comes from the 999: open, 1 free (an inflated 1002 would have said full)", s.state === "open" && s.free === 1 && s.members === 999, s);
  let dupAudit = lastAudit("roster.duplicate_names");
  check("  roster.duplicate_names is audited with the keys, the counts and the spellings", !!dupAudit && dupAudit.subject === "mem0005,mem0006,mem0007" && JSON.stringify(JSON.parse(dupAudit.details)) === JSON.stringify({ members: 1002, duplicates: 3, names: ["Mem0005 / mem0005", "Mem0006 / Mem0006-Elsewhere", "Mem0007 /   Mem0007 "] }), dupAudit);
  check("  the server log is told once: refused, stored nothing, the last export stands", LOGS.length === 1 && LOGS[0].includes("an export of 1002 members was refused") && LOGS[0].includes("**Mem0005 / mem0005**") && LOGS[0].includes("nothing was stored and no role or link changed") && LOGS[0].includes("the last export still stands"), LOGS);
  T += 60;
  posted = await postRosterHttp({ exportedAt: T - 900, members: dupExport });
  check("the next export with the same names: refused the same way, nothing written, not logged or audited again within six hours", posted.status === 422 && tableCounts() === countsBefore && characterRows() === before && LOGS.length === 1 && auditCount("roster.duplicate_names") === 1);
  posted = await postRosterHttp({ exportedAt: T - 3500, members: dupExport });
  check("  refused before anything is read: even an export older than the last snapshot is a 422, not 'skipped'", posted.status === 422 && posted.body.refused === "duplicate_names");
  r = await exportRoster(dupExport, T - 800);
  check("  ingestRoster itself refuses (every caller, not only the endpoint)", r.refused === "duplicate_names" && r.duplicates === 3 && tableCounts() === countsBefore);
  const watcherSrc = fs.readFileSync(path.join(root, "..", "watcher", "watcher.py"), "utf8");
  check("static: the watcher takes a 4xx as final, so a refused export is not retried", /if 400 <= code < 500:[\s\S]{0,400}?return True, None/.test(watcherSrc));

  // positive control: distinct names (however alike) finish with the exact stored count and the stamp in the last batch
  const distinct = [...members(118, "Dis"), { name: "Anna-Elsewhere", rank: "Member", rankIndex: 3, guid: "Player-1-Anna" }, { name: "Ann", rank: "Member", rankIndex: 3, guid: "Player-1-Ann" }];
  const stampBatches = [];
  AFTER_BATCH = async (sqls) => { stampBatches.push(sqls); };
  posted = await postRosterHttp({ exportedAt: T - 700, members: distinct });
  AFTER_BATCH = null;
  row = latest();
  const rowsBatches = stampBatches.filter((b) => b.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)));
  check("positive control: 120 distinct names ('Ann' and 'Anna-Elsewhere' among them): 200, complete 1, member_count 120 = 120 rows stored", posted.status === 200 && posted.body.members === 120 && row.id !== keptId && row.complete === 1 && row.member_count === 120 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", row.id).c === 120, { posted, row });
  check("  the stamp, with its count proof, follows the rows in the last member batch (50, 50, 20 rows in one statement each + the stamp + the effects run made only when the stamp held)", rowsBatches.length === 3 && rowsBatches[0].length === 1 && rowsBatches[1].length === 1 && rowsBatches[2].length === 3 && /SET complete = 1, trusted = \?2 WHERE id = \?1 AND \(SELECT COUNT\(\*\) FROM roster_members WHERE snapshot_id = \?1\) = member_count/.test(rowsBatches[2][1]) && /^INSERT INTO roster_effect_runs \(snapshot_id, prev_snapshot_id, removals, created_at\) SELECT \?1, \?2, \?3, \?4 WHERE EXISTS \(SELECT 1 FROM roster_snapshots WHERE id = \?1 AND complete = 1\)$/.test(rowsBatches[2][2]), stampBatches.map((b) => b.length));
  // the stamp's own proof: a member row lost between two batches (nothing in the code does this; the stamp checks anyway)
  const proofId = latest().id;
  let lost = false;
  AFTER_BATCH = async (sqls) => {
    if (lost || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    lost = true;
    run("DELETE FROM roster_members WHERE snapshot_id = (SELECT MAX(id) FROM roster_snapshots) AND name_key = 'gap0000'");
  };
  // Review of 3 Oct 2026: every batch committed and the stamp still found the rows short. That repeats with the same
  // export, so it is a final 422 ("unusable"), never a 500: the watcher's outbox stops at the first failure to keep the
  // order (watcher.py flush_outbox), and a retried 500 would hold every later post behind this one.
  const failedBefore = auditCount("roster.ingest_failed");
  LOGS = []; REST = [];
  posted = await postRosterHttp({ exportedAt: T - 600, members: members(120, "Gap") });
  AFTER_BATCH = null;
  const unusableAudit = lastAudit("roster.ingest_unusable");
  check("a row lost before the stamp: the stamp does not apply, the export is refused as final (422 unusable, with the counts), and the snapshot and its rows are taken back out", lost && posted.status === 422 && JSON.stringify(posted.body) === JSON.stringify({ refused: "unusable", members: 120, stored: 119 }) && latest().id === proofId && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id > ?", proofId).c === 0, { posted, latest: latest().id, proofId });
  check("  roster.ingest_unusable is audited with counts only (not roster.ingest_failed), staff are told once, nothing applied", !!unusableAudit && JSON.stringify(JSON.parse(unusableAudit.details)) === JSON.stringify({ members: 120, stored: 119 }) && auditCount("roster.ingest_failed") === failedBefore && LOGS.length === 1 && LOGS[0].includes("an export of 120 members was refused: only 119 of its member rows were stored") && LOGS[0].includes("the last export still stands") && REST.length === 0, { unusableAudit, LOGS, REST });
  // the watcher takes the 422 as final (the 4xx contract pinned above) and moves on: the next post, a verification, is delivered
  const ingestHttp = async (p, body) => {
    const res = await indexMod.default.fetch(new Request("https://verify.example" + p, { method: "POST", headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789", "Content-Type": "application/json" }, body: JSON.stringify(body) }), env(), ctx);
    return { status: res.status, body: await res.json() };
  };
  await answer(command("verify", VERA, { options: [{ name: "character", type: 3, value: "Vera Next" }] }));
  const nextVerify = await ingestHttp("/ingest/verify", { character: "Vera Next", code: await codes.codeFor(SECRET, "Vera Next", codes.dayBucket(new Date())), source: "whisper" });
  check("  the watcher's next post, a verification, is delivered and applied (200 verified, the character queued)", nextVerify.status === 200 && nextVerify.body.result === "verified" && statusOf("Vera Next") === "queued", nextVerify);
  r = await exportRoster(members(120, "Gap"), T - 600);
  check("  the same export sent again is written in full: complete 1, 120 rows", !r.skipped && latest().id !== proofId && latest().complete === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", latest().id).c === 120);
  // a batch that fails is still a passing failure: the ingest throws (a 500; the watcher keeps the post and retries it)
  const beforeThrow = latest().id;
  let failOnce = true;
  FAULT = (sql, phase) => { if (phase === "run" && failOnce && /FROM json_each\(\?2\) j$/.test(sql)) { failOnce = false; return true; } return false; };
  threw = false;
  try { await exportRoster(members(130, "Gap"), T - 550); } catch { threw = true; }
  FAULT = null;
  check("  whereas a member batch that fails is retried: the ingest throws, roster.ingest_failed, the snapshot taken back out", threw && latest().id === beforeThrow && auditCount("roster.ingest_failed") === failedBefore + 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id > ?", beforeThrow).c === 0);

  // Review of 3 Oct 2026 (D1 counts each statement of a batch toward one invocation's 1,000): one INSERT per member made a
  // changed export of a full guild about 1,007 statements, over the limit in its last batch. Measured through the real
  // /ingest/roster with a shim that counts every statement, batched ones included.
  console.log("\n== a changed full-guild export stays far below D1's per-invocation statement limit (review of 3 Oct 2026) ==");
  const measureIngest = async (list, exportedAt) => {
    const sqls = [];
    AFTER_BATCH = async (q) => { sqls.push(...q); };
    STATEMENTS = 0;
    const res = await postRosterHttp({ exportedAt, members: list });
    const used = STATEMENTS;
    AFTER_BATCH = null;
    return { res, used, memberStatements: sqls.filter((q) => /INSERT OR REPLACE INTO roster_members/.test(q)).length };
  };
  const BOUND = roster.ROSTER_INGEST_STATEMENTS_FULL_GUILD;
  fresh();
  await exportRoster(members(995), T - 3000);
  let m1 = await measureIngest([...members(995), ...members(5, "Joi")], T - 2000);
  console.log(`    995 then a changed 1000: ${m1.used} statements`);
  check(`a changed 1000-member export after a full 995: ${m1.used} statements, at most ${BOUND}; its rows in 20 statements of 50 + the stamp`, m1.res.status === 200 && latest().complete === 1 && latest().member_count === 1000 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", latest().id).c === 1000 && m1.memberStatements === 20 && m1.used <= BOUND, m1);
  m1 = await measureIngest([...members(995), ...members(5, "Joi")], T - 1900);
  check(`  the identical re-export: ${m1.used} statements`, m1.res.status === 200 && m1.res.body.unchanged === true && m1.memberStatements === 0 && m1.used <= BOUND, m1);
  // the trust base walked too (the row before is not trusted): 1000, a distrusted 850, then a changed 1000
  fresh();
  await exportRoster(members(1000), T - 3000);
  await exportRoster(members(850), T - 2500);
  const m2 = await measureIngest([...members(990), ...members(10, "Joi")], T - 2000);
  console.log(`    1000, a distrusted 850, then a changed 1000 (the trust base read): ${m2.used} statements`);
  check(`  after a distrusted row (the trust base read too): ${m2.used} statements, at most ${BOUND}`, m2.res.status === 200 && latest().complete === 1 && latest().trusted === 1 && m2.memberStatements === 20 && m2.used <= BOUND, m2);
  check(`  the bound is far below D1's per-invocation 1,000 (and the source writes ${roster.ROSTER_ROWS_PER_STATEMENT} members a statement)`, BOUND <= 100 && roster.ROSTER_ROWS_PER_STATEMENT === 50);

  console.log("\n== a refused invite counts for six hours, and only when newer than the deciding roster ==");
  fresh();
  refusal(T - 2 * H);
  snapRow(995, { exportedAt: T - H });
  s = await seatsNow();
  check("a refusal at T-2h and a trusted 995 at T-1h: open, 5 free", s.state === "open" && s.free === 5 && s.refusedAt === null, s);
  fresh();
  snapRow(995, { exportedAt: T - 2 * H });
  refusal(T - H);
  s = await seatsNow();
  check("a refusal at T-1h after a 995 export at T-2h: full, source refused_invite", s.state === "full" && s.source === "refused_invite" && s.refusedAt === T - H, s);
  fresh();
  refusal(T - 7 * H);
  check("a refusal 7 h old does not count", (await seatsNow()).state === "unknown");
  fresh();
  refusal(T - H);
  s = await seatsNow();
  check("with no roster that decides, a recent refusal alone says full", s.state === "full" && s.source === "refused_invite" && s.reason === "none", s);
  snapRow(995, { exportedAt: T - 3 * DAY, receivedAt: T - 3 * DAY });
  s = await seatsNow();
  check("  an older roster that does not decide (stale) leaves a recent refusal standing, whatever their order", s.state === "full" && s.reason === "stale" && s.source === "refused_invite", s);
  run("DELETE FROM roster_snapshots");
  run("UPDATE audit SET actor = 'system' WHERE action = 'guild.full'");
  check("  only the watcher's own guild.full counts (the staff notice's throttle rows are 'system')", (await seatsNow()).state === "unknown");
  const seatSrc = fs.readFileSync(path.join(root, "src", "guild-seats.ts"), "utf8");
  check("static: the refusal read names actor 'watcher', the actor ingest.ts writes", seatSrc.includes("actor = 'watcher' AND action = 'guild.full'") && fs.readFileSync(path.join(root, "src", "ingest.ts"), "utf8").includes(`audit(env, "watcher", "guild.full"`));

  console.log("\n== /verify-status while Olympus I is full ==");
  fresh();
  snapRow(1000, { exportedAt: T - H - 120, receivedAt: T - H });
  queued(QUINN, "Queue Quinn");
  FETCHES = []; REST = []; NOTICES = [];
  let reply = await status(QUINN);
  let text = reply.content;
  const para = text.split("\n").find((l) => l.includes("Olympus I is full")) ?? "";
  check("it says Olympus I is full, with the count", text.includes("Olympus I is full") && para.includes("1000 of 1000"), text);
  check("  the account's place: '**#1** in line'", text.includes("**#1** in line"), text);
  check("  officers may remove inactive characters; reserved names from the site go first; the visitors channel", para.includes("officers may remove inactive characters") && para.includes("reserved names from the site go first") && para.includes(`<#${VISITORS}>`), para);
  check("  it promises no code stays valid", !/stays valid/.test(text));
  check("  the export's time is rounded down to the hour", times(para).length === 1 && times(para)[0] % H === 0 && times(para)[0] === Math.floor((T - H - 120) / H) * H, times(para));
  check("  ephemeral (flags 64), no mentions parsed, under 2000 characters", reply.flags === 64 && JSON.stringify(reply.allowed_mentions) === JSON.stringify({ parse: [] }) && text.length < 2000);
  check("  no notice, no DM, no Discord call", NOTICES.length === 0 && REST.length === 0 && FETCHES.length === 0, { NOTICES, REST, FETCHES });
  text = (await status(QUINN, { CHANNEL_VISITOR_CHAT: "" })).content;
  check("with CHANNEL_VISITOR_CHAT unset it names 'the visitors channel'", text.includes("the visitors channel") && !text.includes("<#"));
  run("INSERT INTO members (discord_id) VALUES (?)", MEMBER);
  run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, member_since) VALUES ('in guild', 'In Guild', ?, 'member', ?, ?)", MEMBER, T - DAY, T - DAY);
  check("an account with nothing waiting (only a member character) gets no paragraph", !(await status(MEMBER)).content.includes("Olympus I"));
  run("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at) VALUES (?, 'later alt', 'Later Alt', ?, ?)", MEMBER, T - 60, T + DAY);
  check("  but an open code is waiting on an invite, so it does", (await status(MEMBER)).content.includes("Olympus I is full"));
  run("UPDATE roster_snapshots SET member_count = 999");
  text = (await status(QUINN)).content;
  s = await seatsNow();
  check("999 at cap 1000: open, 1 free, no paragraph and no place", s.state === "open" && s.free === 1 && !text.includes("Olympus I") && !text.includes("in line"), text);
  s = await seatsNow({ GUILD_MEMBER_CAP: "990" });
  check("999 with GUILD_MEMBER_CAP=990: full", s.state === "full" && s.cap === 990 && (await status(QUINN, { GUILD_MEMBER_CAP: "990" })).content.includes("999 of 990"));
  // review of 3 Oct 2026: an invite refused for space earlier, then a trusted roster with room
  run("UPDATE invite_queue SET last_reason = 'guild_full' WHERE discord_id = ?", QUINN);
  run("UPDATE roster_snapshots SET member_count = 995");
  text = (await status(QUINN)).content;
  check("a refusal for space on the queue row and a trusted 995 export: no 'currently full'; the refusal is named, seats have opened since", (await seatsNow()).state === "open" && !text.includes("currently **full**") && text.includes("the last invite was refused for lack of space; seats have opened since, so the next invite goes out in queue order"), text);
  run("DELETE FROM roster_snapshots");
  text = (await status(QUINN)).content;
  check("  with no roster that decides, the refusal still says full", (await seatsNow()).state === "unknown" && text.includes("the guild is currently **full**"), text);

  console.log("\n== a place comes from the account's own rows, in getQueue's order ==");
  fresh();
  snapRow(1000);
  queued(PRIA, "Pri Ority", { priority: 1, createdAt: T - 100 });
  queued(CARL, "Bea Shared", { character: false, createdAt: T - 900 }); // a stale row of another account under the same name
  const beaRow = queued(BEA, "Bea Shared", { createdAt: T - 500 });
  text = (await status(BEA)).content;
  const served = await (await ingest.getQueue(env(), "")).json();
  const beaPos = served.entries.find((e) => e.id === beaRow).position;
  check("the other account's earlier row with the same name gives no position (waitlistPosition by name would say #2)", (await ingest.waitlistPosition(env(), "bea shared")) === 2 && beaPos === 3 && text.includes("**#3** in line"), { beaPos, text });
  const places = (await gs.guildSeats(env(), T, BEA)).places;
  check("  guildSeats returns only that account's rows", places.length === 1 && places[0].name === "Bea Shared" && places[0].position === 3, places);

  console.log("\n== codes, the queue and attempts are untouched by a full guild ==");
  fresh();
  snapRow(1000);
  run("INSERT INTO members (discord_id) VALUES (?)", VERA);
  const verify = async (id, character, over = {}) => (await answer(command("verify", id, character ? { options: [{ name: "character", type: 3, value: character }] } : {}), over)).data;
  const fullNamed = await verify(VERA, "Vera Code");
  const fullTicket = await verify(WREN, null, { REQUEST_CODES: "on" });
  queued(QUINN, "Queue Quinn");
  const queueFull = JSON.stringify((await (await ingest.getQueue(env(), "")).json()).entries);
  snapRow(500, { exportedAt: T - 60 });
  check("(the guild is now open)", (await seatsNow()).state === "open");
  const openNamed = await verify(VERA, "Vera Code");
  const openTicket = await verify(WREN, null, { REQUEST_CODES: "on" });
  const queueOpen = JSON.stringify((await (await ingest.getQueue(env(), "")).json()).entries);
  check("/verify with a name answers exactly the same full and not full (no new line)", fullNamed.content === openNamed.content && !/full|Olympus I\b/.test(fullNamed.content), fullNamed.content);
  check("/verify with no name (a request code) answers exactly the same", fullTicket.content === openTicket.content && /Your code/.test(fullTicket.content));
  check("getQueue serves identical rows full and not full", queueFull === queueOpen && JSON.parse(queueFull).length === 1);
  snapRow(1000, { exportedAt: T - 30 });
  check("(full again)", (await seatsNow()).state === "full");
  const code = await codes.codeFor(SECRET, "Vera Code", codes.dayBucket(new Date()));
  const verified = await (await ingest.postVerify(env(), { character: "Vera Code", code, source: "whisper" })).json();
  const vq = one("SELECT status, attempts FROM invite_queue WHERE discord_id = ?", VERA);
  check("a code whispered while full still verifies and queues", verified.result === "verified" && vq && vq.status === "queued" && vq.attempts === 0, { verified, vq });
  await ingest.postEvents(env(), { events: [{ type: "invite", name: "Vera Code", ok: false, detail: "The guild is full." }] });
  await status(VERA);
  const vq2 = one("SELECT status, attempts, last_reason FROM invite_queue WHERE discord_id = ?", VERA);
  check("a refusal for space and the status reads leave attempts at 0", vq2.attempts === 0 && vq2.status === "queued" && vq2.last_reason === "guild_full", vq2);

  console.log("\n== /api/me: the member's own places, rounded times ==");
  fresh();
  snapRow(1000, { exportedAt: T - H - 120, receivedAt: T - H });
  siteUser(QUINN);
  queued(QUINN, "Queue Quinn");
  let me = await (await site("GET", "/api/me", { who: QUINN })).json();
  check("a queued applicant at full: seats full, asOf on the hour, myQueue with their place", me.seats && me.seats.state === "full" && me.seats.asOf % H === 0 && me.seats.asOf === Math.floor((T - H - 120) / H) * H && JSON.stringify(me.myQueue) === JSON.stringify([{ name: "Queue Quinn", position: 1 }]), me.seats, me.myQueue);
  check("  the visitors address is Discord's channel link", me.seats.visitorsUrl === `https://discord.com/channels/${GUILD}/${VISITORS}`);
  check("  no reason, no exact roster time, no other account's data", !("reason" in me.seats) && !("rosterAt" in me.seats) && !("refusedAt" in me.seats) && me.seats.members === 1000 && me.seats.cap === 1000);
  me = await (await site("GET", "/api/me", { who: QUINN, over: { CHANNEL_VISITOR_CHAT: "" } })).json();
  check("with no visitors channel configured: visitorsUrl null", me.seats.visitorsUrl === null);
  snapRow(990, { exportedAt: T - 60 });
  me = await (await site("GET", "/api/me", { who: QUINN })).json();
  check("not full: myQueue []", me.seats.state === "open" && Array.isArray(me.myQueue) && me.myQueue.length === 0 && me.seats.free === 10);
  siteUser(DENIED, 1);
  me = await (await site("GET", "/api/me", { who: DENIED })).json();
  check("a denied account: seats null, myQueue []", me.denied === true && me.seats === null && Array.isArray(me.myQueue) && me.myQueue.length === 0, me.seats);
  const pub = await (await site("GET", "/api/public")).json();
  check("/api/public has no seats", !("seats" in pub) && !("myQueue" in pub));
  let boot = await bootOf(await site("GET", "/"));
  check("the signed-out boot has no seats", boot.signedIn === false && !("seats" in boot) && !("myQueue" in boot));
  boot = await bootOf(await site("GET", "/", { who: QUINN }));
  check("the signed-in boot carries them", boot.signedIn === true && boot.seats && boot.seats.state === "open");

  console.log("\n== the staff views: exact times ==");
  fresh();
  snapRow(1000, { exportedAt: T - H - 120, receivedAt: T - H });
  siteUser(ADMIN);
  const ov = await (await site("GET", "/api/admin/overview", { who: ADMIN })).json();
  check("the admin overview carries the exact seat state", ov.seats && ov.seats.state === "full" && ov.seats.rosterAt === T - H - 120 && ov.seats.members === 1000, ov.seats);
  content = await admin("queue");
  check("/olympus-admin queue, empty: the seat line, then 'Invite queue is empty.'", content === `Olympus I: **full**, 1000 of 1000 on the latest roster export <t:${T - H - 120}:R> · 0 waiting in the invite queue\nInvite queue is empty.`, content);
  queued(QUINN, "Queue Quinn");
  queued(PRIA, "Pri Ority", { priority: 1 });
  run("UPDATE invite_queue SET status = 'invited' WHERE id = ?", queued(CARL, "Carl Invited")); // invited: listed, not counted as waiting
  content = await admin("queue");
  check("  non-empty: the seat line with the count first (queued and written only, like the overview), then the list", content.startsWith("Olympus I: **full**, 1000 of 1000") && content.split("\n")[0].endsWith("· 2 waiting in the invite queue") && content.includes("Queue Quinn") && content.includes("Pri Ority") && content.includes("Carl Invited"), content);
  content = await admin("roster");
  check("/olympus-admin roster starts with the same line, read from the snapshot 'Last roster' names", content.startsWith(`Olympus I: **full**, 1000 of 1000 on the latest roster export <t:${T - H - 120}:R>\nLast roster: 1000 members`), content.slice(0, 200));
  snapRow(400, { trusted: 0, exportedAt: T - 60 });
  content = await admin("roster");
  check("  an untrusted latest export: 'unknown' with the remedy", content.startsWith("Olympus I room: unknown (the latest export is not trusted: run /olympus-admin sync if the guild really shrank)"), content.slice(0, 200));
  run("UPDATE roster_snapshots SET trusted = 1 WHERE member_count = 400");
  check("  open: the free seats", (await admin("roster")).startsWith(`600 seats free on Olympus I (400 of 1000, latest roster export <t:${T - 60}:R>)`));
  check("  the refused source in words", gs.seatsStaffLine({ state: "full", full: true, source: "refused_invite", refusedAt: T - 5 }) === `Olympus I: **full** (an invite was refused for space <t:${T - 5}:R>)`);
  fresh();
  snapRow(1000, { exportedAt: T - H });
  queued(QUINN, "Queue Quinn");
  STAFF = [];
  await ingest.postEvents(env(), { events: [{ type: "guild_full", detail: "0 eligible", candidates: [] }] });
  check("the guild-full staff notice carries the count", STAFF.length === 1 && STAFF[0].content.includes(`Olympus I: **full**, 1000 of 1000 on the latest roster export <t:${T - H}:R>`), STAFF);
  await ingest.postEvents(env(), { events: [{ type: "guild_full", detail: "0 eligible", candidates: [] }] });
  check("  and is still posted at most once an hour", STAFF.length === 1);

  console.log("\n== a failing seat read: every surface still answers ==");
  fresh();
  snapRow(1000);
  siteUser(QUINN);
  queued(QUINN, "Queue Quinn");
  FAULT = (sql, phase) => phase === "prepare" && (/FROM roster_snapshots ORDER BY id DESC LIMIT 1/.test(sql) && /trusted, complete/.test(sql) || /action = 'guild\.full' ORDER BY/.test(sql) || /AS position\s+FROM invite_queue q/.test(sql));
  let q = await quiet(() => status(QUINN));
  check("/verify-status answers without the paragraph", typeof q.value.content === "string" && q.value.content.includes("Queue Quinn") && !q.value.content.includes("Olympus I"), q.value.content);
  check("  one bounded log line: the category only, no SQL, no message", q.lines.length === 1 && q.lines[0] === "guild seats failed d1", q.lines);
  q = await quiet(async () => bootOf(await site("GET", "/", { who: QUINN })));
  check("the signed-in boot still has signedIn true (seats unknown, no places)", q.value.signedIn === true && q.value.seats.state === "unknown" && q.value.myQueue.length === 0 && q.lines.filter((l) => l === "guild seats failed d1").length === 1, q.lines);
  q = await quiet(() => gs.guildSeats(env(), T, QUINN));
  check("guildSeats itself never throws: unknown, reason 'error', no places", q.value.seats.state === "unknown" && q.value.seats.reason === "error" && q.value.places.length === 0);
  FAULT = null;

  console.log("\n== static ==");
  check("guild-seats.ts names no static path, no inline svg, no data URI", !seatSrc.includes("/static/") && !seatSrc.includes("<svg") && !seatSrc.includes("data" + ":"));
  const imports = [...seatSrc.matchAll(/from "(\.\/[^"]+)"/g)].map((m) => m[1]);
  check("guild-seats.ts does not import ingest, dm or roles", !imports.some((p) => ["./ingest", "./dm", "./roles"].includes(p)), imports);
  check("guildIsFull is gone: nothing imports it", !("guildIsFull" in ingest) && !/guildIsFull/.test(fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts")).map((f) => fs.readFileSync(path.join(root, "src", f), "utf8")).join("\n")));
  const guide = fs.readFileSync(path.join(root, "src", "guide.ts"), "utf8");
  check("the guide and the seat paragraph share one visitors sentence (guide.ts visitorLine)", /visitorLine\(env\)/.test(guide) && seatSrc.includes("visitorLine(env)"));
  // The policy pages say what the seat state does (the served pages, whitespace folded: the tracked HTML wraps its lines).
  const folded = async (p) => { const r = await site("GET", p); return { status: r.status, text: (await r.text()).replace(/\s+/g, " ") }; };
  const priv = await folded("/privacy"), terms = await folded("/terms");
  check("the privacy policy has a full-guild paragraph: the deciding export's rule, the hour, your own places to you alone", priv.status === 200 && priv.text.includes("<strong>A full guild.</strong> While Olympus I is full") && roster.ROSTER_SEATS_FOR === 2 * DAY && priv.text.includes("complete, passed the size checks and is less than two days old") && priv.text.includes("<code>/verify-status</code> says so, with the hour of that export or refusal, to an account waiting on an invite") && priv.text.includes("Home and Apply pages say so to an account waiting in the invite queue (with its place) or without a confirmed character (with that hour)") && priv.text.includes("No other member sees your place.") && priv.text.includes("Officers see the invite queue itself"));
  check("  the staff channels record each confirmation, never a code (review of 3 Oct 2026: the log line names the character and the account; the guild-full notice goes to the staff channel)", priv.text.includes("the bot's private staff channels record each confirmation (the character and the account, never a code)") && !priv.text.includes("records each confirmed code"));
  check("  a snapshot's new facts are in what it stores (when it first arrived, whether complete, whether it passed the size checks)", priv.text.includes("each also recording when that exact roster first arrived, whether all of it was stored, and whether it passed the bot's size checks"));
  check("the terms: a place in the queue is not a seat; being full costs no attempt; the bot removes nobody; reserved names go first", terms.status === 200 && terms.text.includes("<strong>A full guild.</strong>") && terms.text.includes("a refusal for lack of space costs it no invite attempt") && terms.text.includes("A place in the queue is not a seat and promises no date, and names reserved on the site go first") && terms.text.includes("The bot removes nobody to make room; officers may remove inactive characters."));

  console.log("\n== ensureSchema over the 25 Sep database ==");
  const old = new DatabaseSync(":memory:");
  old.exec(fs.readFileSync(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"), "utf8"));
  old.prepare("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count) VALUES (?, ?, 'addon', 1000)").run(T - H, T - H);
  schema.forgetSchemaCheck();
  await schema.ensureSchema({ DB: d1(old) });
  const cols = old.prepare("PRAGMA table_info(roster_snapshots)").all().map((c) => c.name);
  const idx = old.prepare("PRAGMA index_list(roster_snapshots)").all().map((i) => i.name);
  check("the three columns and the index are added", ["trusted", "complete", "first_received_at"].every((c) => cols.includes(c)) && idx.includes("roster_snapshots_first"), cols, idx);
  check("  the existing snapshot reads unknown/unchecked (no claim from a pre-.115 row)", (await gs.guildSeats({ DB: d1(old) }, T)).seats.reason === "unchecked");
  schema.forgetSchemaCheck();
  let again = true;
  try { await schema.ensureSchema({ DB: d1(old) }); } catch { again = false; }
  check("  a second run is harmless", again && old.prepare("PRAGMA table_info(roster_snapshots)").all().length === cols.length);
  const mig = fs.readFileSync(path.join(root, "migrations", "2026-10-03-news-and-seats.sql"), "utf8");
  const sqlFile = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
  check("schema.sql and the migration file carry the same columns and index", ["trusted", "complete", "first_received_at"].every((c) => mig.includes(`ADD COLUMN ${c} INTEGER`) && new RegExp(`\\n\\s+${c}\\s+INTEGER`).test(sqlFile)) && mig.includes("roster_snapshots_first ON roster_snapshots(first_received_at)") && sqlFile.includes("roster_snapshots_first ON roster_snapshots(first_received_at)"));

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

// Request codes, GUID-pinned links and relay presence (27 Sep 2026), run against the REAL src/*.ts (transpiled by
// TypeScript itself) and the REAL schema in SQLite (node:sqlite, Node 22.5+). Discord, notices and the review card are
// stubbed; everything that decides who is linked to whom is the production code.
// Run from the worker folder:  node tests/tickets_guid_relays_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite ----------
function d1(db) {
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => { params = p; return api; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      // Like D1, batch reads include results as well as metadata; the fenced identity transaction reads its binding.
      _exec: () => {
        const st = db.prepare(sql);
        if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
        const r = st.run(...params);
        return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
function freshDb(schemaPath = path.join(root, "schema.sql")) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  return db;
}

// ---------- load the real modules, stub only the outside world ----------
let LOGS = [], ROLE_ADDS = [], ROLE_REMOVES = [], VERIFIED = [], NOTICES = [];
const stubs = {
  "./discord": {
    json: (body, status = 200) => ({ status, body }),
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    staffNotice: async () => {},
    addRole: async (_env, id, role, reason) => { ROLE_ADDS.push({ id, role, reason }); },
    removeRole: async (_env, id, role, reason) => { ROLE_REMOVES.push({ id, role, reason }); },
    guildMember: async () => ({ roles: [] }),
    rest: async (_env, method, p) => { if (method === "GET" && /\/roles$/.test(p)) return [{ id: "1549581282227265566" }]; throw new Error("no REST in tests"); }, // .58: the role writer reads the guild's roles
    setNickname: async () => {},
    explainDiscordError: (e) => String(e),
  },
  "./dm": {
    notify: async (_env, userId, content, kind) => { NOTICES.push({ userId, content, kind }); },
    noticeBatch: () => ({ items: [] }),
    flushNotices: async () => {},
  },
  "./review": {
    onVerified: async (_env, pending, source) => { VERIFIED.push({ ...pending, source }); },
  },
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const file = path.join(root, "src", name.replace("./", "") + ".ts");
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", js)(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const codes = load("./codes"), relays = load("./relays"), roster = load("./roster"), ingest = load("./ingest"), schema = load("./schema"), dbm = load("./db");
const { auditReason } = (() => {
  // discord.ts is stubbed for the others; load the real one on its own just for its pure helper
  const js = ts.transpileModule(fs.readFileSync(path.join(root, "src", "discord.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, () => ({}));
  return mod.exports;
})();

let T = 1790500000; // the clock every module reads (db.now() is Math.floor(Date.now()/1000))
const RealDate = Date;
// The clock every module reads: Date.now() and new Date() alike (codes.ts takes "now" from new Date()).
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const SECRET = "worker-test-secret";
const ROLE = "1549581282227265566";
const A = "111111111111111111", B = "222222222222222222", C = "333333333333333333";
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };
const reset = () => { LOGS = []; ROLE_ADDS = []; ROLE_REMOVES = []; VERIFIED = []; NOTICES = []; };
const today = () => codes.dayBucket(new Date(T * 1000));

(async () => {
  let db = freshDb();
  let env = { DB: d1(db), VERIFY_SECRET: SECRET, ROLE_GUILD_MEMBER: ROLE, ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MAX_SHRINK_PCT: "10", ROSTER_MIN_MEMBERS: "0" };
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const ticketRow = (discordId, nonce, createdAt = T) =>
    db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, ?4)").run(discordId, createdAt, createdAt + 86400, nonce);
  const snapshot = (members, exportedAt) => roster.ingestRoster(env, exportedAt, members, "addon");

  const batchRead = await env.DB.batch([env.DB.prepare("SELECT ?1 AS valid").bind(1), env.DB.prepare("SELECT COUNT(*) AS n FROM characters")]);
  check("the SQLite D1 shim preserves SELECT rows in each batch result", batchRead[0].results[0].valid === 1 && batchRead[0].meta.changes === 0 && batchRead[1].results[0].n === 0);

  // ================= request codes =================
  console.log("\n== a request code links whichever character whispers it ==");
  reset();
  ticketRow(A, "K7Q");
  const tk = await codes.ticketFor(SECRET, "K7Q", today());
  let r = await ingest.postVerify(env, { character: "Aelin Stormwarden", code: tk.toLowerCase(), source: "whisper" });
  check("a valid request code from a new character is verified", r.body.result === "verified");
  const aelin = one("SELECT * FROM characters WHERE name_key = 'aelin stormwarden'");
  check("  the whisper's sender is the character that got linked", aelin && aelin.discord_id === A && aelin.status === "verified" && aelin.guid === null);
  const p1 = one("SELECT * FROM pending WHERE nonce = 'K7Q'");
  check("  the request is used up and learns its character", p1.consumed_at === T && p1.name === "Aelin Stormwarden" && p1.name_key === "aelin stormwarden");
  check("  the invite flow sees the resolved character, not an empty name", VERIFIED.length === 1 && VERIFIED[0].name === "Aelin Stormwarden" && VERIFIED[0].name_key === "aelin stormwarden");
  r = await ingest.postVerify(env, { character: "Some Friend", code: tk, source: "whisper" });
  check("the same code a second time, from another character, links nobody", r.body.result === "no_pending" && !one("SELECT 1 FROM characters WHERE name_key = 'some friend'"));
  const forged = tk.slice(0, 3) + (tk[3] === "A" ? "B" : "A") + tk.slice(4);
  ticketRow(B, "ZZ9");
  r = await ingest.postVerify(env, { character: "Guesser Guy", code: "ZZ9" + forged.slice(3), source: "whisper" });
  check("a right nonce with a wrong mac is refused", r.body.result === "invalid");

  console.log("\n== a request code cannot take a character someone else holds ==");
  db.prepare("INSERT INTO members (discord_id) VALUES (?1)").run(C);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES ('taken tom', 'Taken Tom', ?1, 'member', 1)").run(C);
  const tkB = await codes.ticketFor(SECRET, "ZZ9", today());
  r = await ingest.postVerify(env, { character: "Taken Tom", code: tkB, source: "whisper" });
  check("bound to another account: refused and flagged", r.body.result === "bound_elsewhere" && LOGS.some((l) => l.includes("Taken Tom")));
  // The addon and the watcher have tied that code to Taken Tom by now, so an open request would be stuck for a day.
  check("  the request is closed, so the next press of Get my code gives a fresh code", one("SELECT consumed_source FROM pending WHERE nonce = 'ZZ9'").consumed_source === "refused");
  ticketRow(B, "2M4");
  const tkB2 = await codes.ticketFor(SECRET, "2M4", today());

  console.log("\n== a request code from a character already on the roster: role now, GUID pinned ==");
  reset();
  await snapshot([{ name: "Fern Melder", guid: "Player-1-0000000F" }, { name: "Roster Rita", guid: "Player-1-00000001" }], T - 60);
  r = await ingest.postVerify(env, { character: "Roster Rita", code: tkB2, source: "mail" });
  check("already in the guild: promoted at once", r.body.result === "member" && ROLE_ADDS.some((g) => g.id === B));
  check("  and the roster's GUID is pinned on the spot", one("SELECT guid FROM characters WHERE name_key = 'roster rita'").guid === "Player-1-00000001");

  console.log("\n== character codes work as before ==");
  reset();
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at) VALUES (?1, 'thrall', 'Thrall', ?2, ?3)").run(C, T, T + 86400);
  const cc = await codes.codeFor(SECRET, "Thrall", today());
  r = await ingest.postVerify(env, { character: "Thrall", code: cc, source: "whisper" });
  check("a 6-symbol code for its own character is verified", r.body.result === "verified" && one("SELECT discord_id FROM characters WHERE name_key = 'thrall'").discord_id === C);
  r = await ingest.postVerify(env, { character: "Not Thrall", code: cc, source: "whisper" });
  check("  and refused from any other character", r.body.result === "invalid");

  console.log("\n== open requests: unique nonce lookup, expiry ==");
  ticketRow(A, "Q3R", T - 90000); // created more than a day ago: expired
  check("an expired request is not found", (await dbm.openTicket(env, "Q3R")) === null);
  ticketRow(A, "HJK");
  check("an account's open request is found for the Verify button to show again", (await dbm.openTicketFor(env, A)).nonce === "HJK");

  // ================= GUID-pinned links =================
  console.log("\n== first sighting pins the GUID; a namesake never inherits the link ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  const bind = (key, name, did, status, extra = {}) => {
    db.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT DO NOTHING").run(did);
    db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .run(key, name, did, status, extra.boundAt ?? T - 1000, extra.guid ?? null);
  };
  bind("vera vane", "Vera Vane", A, "member");
  bind("nora name", "Nora Name", B, "member", { guid: "Player-1-000000AA" });
  db.prepare("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('nora name', 'Nora Name', ?1, 'queued', 1)").run(B);
  reset();
  let s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "Nora Name", guid: "Player-1-000000BB" }], T);
  check("an unpinned member gets its GUID", one("SELECT guid FROM characters WHERE name_key = 'vera vane'").guid === "Player-1-000000V1" && s.pinned === 1);
  check("a namesake seen in one export only is held, not released (a truncated export must not unlink anyone)", s.released.length === 0 && s.held === 1 && one("SELECT status FROM characters WHERE name_key = 'nora name'").status === "member" && ROLE_REMOVES.length === 0);
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "Nora Name", guid: "Player-1-000000BB" }], T + 5);
  const nora = one("SELECT * FROM characters WHERE name_key = 'nora name'");
  check("a different character under a linked name: the link is released", nora.status === "unbound" && nora.guid === null && s.released.includes("Nora Name"));
  check("  the old account loses Guild Member (its only character)", ROLE_REMOVES.some((x) => x.id === B));
  check("  and nothing is queued for it any more", one("SELECT status FROM invite_queue WHERE name_key = 'nora name'").status === "cancelled");
  check("  staff are told in plain words", LOGS.some((l) => l.includes("Nora Name") && l.includes("different character")));

  console.log("\n== a rename keeps the link ==");
  reset();
  bind("old olga", "Old Olga", C, "member", { guid: "Player-1-000000CC" });
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "Nora Name", guid: "Player-1-000000BB" }, { name: "Old Olga", guid: "Player-1-000000CC" }], T + 10);
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "Nora Name", guid: "Player-1-000000BB" }, { name: "New Olga", guid: "Player-1-000000CC" }], T + 20);
  check("the binding moved to the new name, still a member", one("SELECT status, discord_id FROM characters WHERE name_key = 'new olga'")?.status === "member" && !one("SELECT 1 FROM characters WHERE name_key = 'old olga'"));
  check("  no role was taken away", ROLE_REMOVES.length === 0 && s.renamed.length === 1);
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "Nora Name", guid: "Player-1-000000BB" }, { name: "New Olga", guid: "Player-1-000000CC" }], T + 30);
  check("  and the next exports do not strip it for the old name's absence", ROLE_REMOVES.length === 0 && one("SELECT status FROM characters WHERE name_key = 'new olga'").status === "member");

  console.log("\n== a rename onto a name another account linked without a GUID: the GUID decides ==");
  reset();
  bind("pat pinned", "Pat Pinned", A, "member", { guid: "Player-1-000000DD" });
  bind("claimed name", "Claimed Name", B, "verified");
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "New Olga", guid: "Player-1-000000CC" }, { name: "Pat Pinned", guid: "Player-1-000000DD" }], T + 40);
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "New Olga", guid: "Player-1-000000CC" }, { name: "Claimed Name", guid: "Player-1-000000DD" }], T + 50);
  check("first export with the new name: both links held, nobody demoted for the old name's absence", s.held === 2 && ROLE_REMOVES.length === 0 && one("SELECT status FROM characters WHERE name_key = 'pat pinned'").status === "member");
  s = await snapshot([{ name: "Vera Vane", guid: "Player-1-000000V1" }, { name: "New Olga", guid: "Player-1-000000CC" }, { name: "Claimed Name", guid: "Player-1-000000DD" }], T + 55);
  // B's link was to a name; A's is to this very character (pinned when it met a roster). The name now belongs to A's
  // character, so B's link is released -- and never pinned to A's character, which the old rules did.
  check("the pinned link follows its character to the new name", one("SELECT discord_id, status, guid FROM characters WHERE name_key = 'claimed name'").discord_id === A && s.renamed.length === 1);
  check("  the other account's name-only link is released, kept on record under an archive key", s.released.includes("Claimed Name") && one("SELECT status FROM characters WHERE name_key LIKE 'claimed name~%' AND discord_id = ?1", B)?.status === "unbound");
  check("  and nobody lost or gained a role over it", ROLE_REMOVES.length === 0 && !ROLE_ADDS.some((g) => g.id === B));

  console.log("\n== LINKS_NOT_BEFORE: old unpinned links never pass to a namesake ==");
  db = freshDb(); env = { ...env, DB: d1(db), LINKS_NOT_BEFORE: String(T) };
  reset();
  bind("beta bob", "Beta Bob", A, "left", { boundAt: T - 86400 });          // linked on beta, never pinned
  bind("fresh fay", "Fresh Fay", B, "verified", { boundAt: T + 100 });      // linked after the cutoff
  bind("pinned pia", "Pinned Pia", C, "left", { boundAt: T - 86400, guid: "Player-9-00000P1A" });
  s = await snapshot([{ name: "Beta Bob", guid: "Player-9-0000B0B2" }, { name: "Fresh Fay", guid: "Player-9-00000FAY" }, { name: "Pinned Pia", guid: "Player-9-00000P1A" }], T + 200);
  check("an unpinned link from before the cutoff is released, not promoted", one("SELECT status FROM characters WHERE name_key = 'beta bob'").status === "unbound" && !ROLE_ADDS.some((g) => g.id === A));
  check("a link made after the cutoff is promoted and pinned", one("SELECT status, guid FROM characters WHERE name_key = 'fresh fay'").guid === "Player-9-00000FAY" && ROLE_ADDS.some((g) => g.id === B));
  check("a pinned link whose GUID matches comes back", one("SELECT status FROM characters WHERE name_key = 'pinned pia'").status === "member" && ROLE_ADDS.some((g) => g.id === C));
  check("the cutoff also reads a date", dbm.linksNotBefore({ LINKS_NOT_BEFORE: "2026-11-04" }) === Date.UTC(2026, 10, 4) / 1000 && dbm.linksNotBefore({}) === 0);

  console.log("\n== a join line cannot promote a stale link either ==");
  reset();
  bind("stale sam", "Stale Sam", A, "queued", { boundAt: T - 86400 });
  await ingest.postEvents(env, { events: [{ type: "joined", name: "Stale Sam", origin: "token", ok: true }] });
  check("a signed join for a pre-cutoff unpinned link grants nothing", !ROLE_ADDS.some((g) => g.id === A) && one("SELECT status FROM characters WHERE name_key = 'stale sam'").status === "queued");

  console.log("\n== manual sync applies the same rules ==");
  reset();
  await snapshot([{ name: "Fresh Fay", guid: "Player-9-00000FAY" }, { name: "Pinned Pia", guid: "Player-9-00000P1A" }, { name: "Sync Sid", guid: "Player-9-000051D1" }], T + 400);
  // linked after that export, to a character the roster does not have under this name (a GUID pinned elsewhere)
  bind("sync sid", "Sync Sid", B, "verified", { boundAt: T + 300, guid: "Player-9-000051D0" });
  db.prepare("UPDATE characters SET status = 'verified' WHERE name_key = 'fresh fay'").run();
  const out = await roster.syncFromLatest(env);
  check("sync releases the namesake it finds", out.released.includes("Sync Sid"));
  check("  and promotes a matching link", out.promoted.includes("Fresh Fay"));

  // ================= relays =================
  console.log("\n== relay presence ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  const params = (o) => new URLSearchParams(o);
  check("no relay part: an older watcher reports nothing", relays.relayReportFromQuery(params({ officer: "fern melder" })) === null);
  const rep = relays.relayReportFromQuery(params({ officer: "fern melder", relay: "Fern Melder", online: "1", v: "0.6.0" }));
  check("a report is parsed", rep.online === true && rep.character === "Fern Melder" && rep.version === "0.6.0");
  check("unknown presence claims nothing, but the sighting is recorded (.62)", (await relays.recordRelay(env, { ...rep, online: null })) === "written" && one("SELECT unknown_since FROM relays").unknown_since === T);
  let st = await relays.relayStatus(env);
  check("a relay that cannot tell is neither online nor known, and is still the one to name", st.known === false && st.online.length === 0 && st.recent[0].character === "Fern Melder");
  let lines = relays.whisperInstructions(env, "K7QYSTG", T + 3600, st);
  check("  the paste line names the relay's character and says to send it while online, not that nobody is", lines.includes("/w Fern Melder !verify K7QYSTG") && lines.some((l) => l.startsWith("Send it while Fern Melder")) && !lines.join(" ").includes("No officer is online"));
  check("  the same unknown report a minute later is not written again", ((T += 60), await relays.recordRelay(env, { ...rep, online: null })) === "unchanged");
  check("first report is written", (await relays.recordRelay(env, rep)) === "written");
  check("the same report a minute later is not", ((T += 60), await relays.recordRelay(env, rep)) === "unchanged");
  st = await relays.relayStatus(env);
  lines = relays.whisperInstructions(env, "K7QYSTG", T + 3600, st);
  check("online: the reply says so", lines.some((l) => l.includes("**Fern Melder** is online now")));
  check("a change is written at once", (await relays.recordRelay(env, { ...rep, online: false })) === "written");
  st = await relays.relayStatus(env);
  lines = relays.whisperInstructions(env, "K7QYSTG", T + 3600, st);
  check("offline: the reply says nobody is online and until when the code holds", st.known && lines.some((l) => l.includes("No officer is online right now") && l.includes(`<t:${T + 3600}:f>`)));
  check("an unknown report after a statement withdraws the claim (.62): not known, not online, still named", (await relays.recordRelay(env, { ...rep, online: null })) === "written" && !(st = await relays.relayStatus(env)).known && st.online.length === 0 && relays.whisperInstructions(env, "K7QYSTG", T + 3600, st).some((l) => l.startsWith("Send it while Fern Melder")));
  // .68 (Codex's review of .62): a second relay stating "offline" beside the unknown one must not make the reply say nobody is online
  await relays.recordRelay(env, { officer: "second officer", character: "Second Officer", online: false });
  st = await relays.relayStatus(env);
  check("a stated-offline relay beside a relay that cannot tell keeps the answer uncertain: not known, nothing claimed (.68)", !st.known && st.online.length === 0 && relays.whisperInstructions(env, "K7QYSTG", T + 3600, st).some((l) => l.startsWith("Send it while")) && !relays.whisperInstructions(env, "K7QYSTG", T + 3600, st).join(" ").includes("No officer is online"));
  await relays.recordRelay(env, { officer: "second officer", character: "Second Officer", online: true });
  st = await relays.relayStatus(env);
  check("  while one positively online beside the unknown one is named as online", st.online.length === 1 && st.online[0].character === "Second Officer" && st.known);
  T += relays.RELAY_FRESH + 1;
  st = await relays.relayStatus(env);
  check("  once the unknown relay's report is stale too, the stated relays decide again (PC off: known, nobody online)", st.known && st.online.length === 0);
  T -= relays.RELAY_FRESH + 1;
  // .68: a heartbeat that read the row, then resumed after a newer poll: judged inside the upsert, it changes nothing
  await relays.recordRelay(env, { ...rep, online: true, addon: "0.6.0" });
  const seenNow = one("SELECT seen_at, addon FROM relays WHERE officer_id = 'fern melder'");
  T -= 100;
  check("an older report resuming after a newer one is not written: seen_at, presence and addon keep the newer poll's values", (await relays.recordRelay(env, { ...rep, online: null, addon: undefined })) === "unchanged" && one("SELECT seen_at, addon, unknown_since FROM relays WHERE officer_id = 'fern melder'").seen_at === seenNow.seen_at && one("SELECT addon FROM relays WHERE officer_id = 'fern melder'").addon === "0.6.0" && one("SELECT unknown_since FROM relays WHERE officer_id = 'fern melder'").unknown_since === null);
  T += 100;
  await relays.recordRelay(env, { officer: "second officer", character: "Second Officer", online: false });
  await relays.recordRelay(env, { ...rep, online: true });
  await relays.recordRelay(env, { officer: "second officer", character: "Second Officer", online: true });
  T += 30;
  await relays.recordRelay(env, { officer: "second officer", character: "Second Officer", online: true });
  st = await relays.relayStatus(env);
  lines = relays.whisperInstructions(env, "K7QYSTG", T + 3600, st);
  check("two online: both named, the paste line uses one of them", lines.some((l) => l.includes("Fern Melder") && l.includes("Second Officer") && l.includes("any of them")) && lines.some((l) => /^\/w (Fern Melder|Second Officer) !verify K7QYSTG$/.test(l)));
  T += relays.RELAY_FRESH + 1;
  st = await relays.relayStatus(env);
  check("a relay not heard from for ten minutes counts as offline (PC off)", st.known && st.online.length === 0);
  check("  a request code names no character; a character code does", relays.whisperInstructions(env, "K7QYSTG", T, st)[0].includes("any of yours") && relays.whisperInstructions(env, "ABCDEF", T, st, "Thrall")[0].includes("**Thrall**"));
  check("configured list is parsed", JSON.stringify(relays.configuredOfficers({ OFFICER_CHARACTERS: "Fern Melder, Other Officer or Third One" })) === JSON.stringify(["Fern Melder", "Other Officer", "Third One"]));

  // ================= schema self-migration =================
  console.log("\n== the Worker brings the live schema up to date itself ==");
  const old = freshDb(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"));
  const oldEnv = { DB: d1(old) };
  await schema.ensureSchema(oldEnv);
  const cols = (t) => old.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  check("pending.nonce and characters.guid added, relays created", cols("pending").includes("nonce") && cols("characters").includes("guid") && cols("relays").includes("online"));
  schema.forgetSchemaCheck();
  let again = true;
  try { await schema.ensureSchema(oldEnv); } catch { again = false; }
  check("  and running it again changes nothing and does not fail", again);

  // ================= audit reason =================
  console.log("\n== audit-log reason header ==");
  check("reasons are URL-encoded for the header", auditReason("olympus-verify: Zoë left — kicked") === encodeURIComponent("olympus-verify: Zoë left — kicked"));
  const long = auditReason("é".repeat(400));
  check("  capped at 512 characters without cutting an escape in half", long.length <= 512 && /^(%C3%A9)+$/.test(long));

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

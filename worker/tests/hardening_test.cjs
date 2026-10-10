// The review of 27 Sep 2026, one check per finding, against the REAL src/*.ts (transpiled by TypeScript itself) and
// the REAL schema in SQLite (node:sqlite). Discord, notices and the review card are stubbed.
// Run from the worker folder:  node tests/hardening_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite (one transaction; reads keep rows, writes keep metadata) ----------
function d1(db) {
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => { params = p; return api; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      _exec: () => {
        const st = db.prepare(sql);
        if (st.columns().length) return { results: st.all(...params), meta: { changes: 0 } };
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

let LOGS = [], ROLE_ADDS = [], ROLE_REMOVES = [], VERIFIED = [];
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
// discord.ts's pure helpers (userOf, option, hasAnyRole, ...) are real; everything that would reach Discord is not.
const realDiscord = (() => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(mod, mod.exports, () => ({}));
  return mod.exports;
})();
globalThis.fetch = async () => { throw new Error("no network in tests"); };
const stubs = {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
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
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async (_env, pending, source) => { VERIFIED.push({ ...pending, source }); } },
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const js = transpile(path.join(root, "src", name.replace("./", "") + ".ts"));
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", js)(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const codes = load("./codes"), relays = load("./relays"), roster = load("./roster"), ingest = load("./ingest"), schema = load("./schema"), unv = load("./unverified");

// Start the synthetic business/HMAC clock from SQLite's actual clock, not an expired September date.
// Subsequent explicit advances still test relative ticket-day and relay-age semantics; consuming SQL remains native.
const fixtureClockDb = new DatabaseSync(":memory:");
let T = fixtureClockDb.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS now").get().now;
fixtureClockDb.close();
const RealDate = Date;
// The clock every module reads: Date.now() and new Date() alike (codes.ts takes "now" from new Date()).
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const SECRET = "hardening-test-secret";
const ROLE = "1549581282227265566";
const A = "111111111111111111", B = "222222222222222222", C = "333333333333333333";
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };
const reset = () => { LOGS = []; ROLE_ADDS = []; ROLE_REMOVES = []; VERIFIED = []; };
const day = (t = T) => codes.dayBucket(new Date(t * 1000));

// randomNonce() reads crypto.getRandomValues; these tests decide what it returns
const realRandom = crypto.getRandomValues.bind(crypto);
let forced = [];
crypto.getRandomValues = (arr) => {
  if (forced.length) {
    const nonce = forced.shift();
    for (let i = 0; i < arr.length; i++) arr[i] = codes.CODE_ALPHABET.indexOf(nonce[i]);
    return arr;
  }
  return realRandom(arr);
};

(async () => {
  let db = freshDb();
  let env = { DB: d1(db), PUBLIC_BASE_URL: "https://verify.example", VERIFY_SECRET: SECRET, ROLE_GUILD_MEMBER: ROLE, ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MAX_SHRINK_PCT: "10", ROSTER_MIN_MEMBERS: "0", GUILD_ID: "1549537348516188200", REQUEST_CODES: "on" };
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const snapshot = (members, exportedAt) => roster.ingestRoster(env, exportedAt, members, "addon");
  const batchRead = await env.DB.batch([env.DB.prepare("SELECT ?1 AS valid").bind(1)]);
  check("the SQLite D1 shim preserves the binding SELECT in an atomic batch", batchRead[0].results[0].valid === 1 && batchRead[0].meta.changes === 0);
  const bind = (key, name, did, status, extra = {}) => {
    db.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT DO NOTHING").run(did);
    db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .run(key, name, did, status, extra.boundAt ?? T - 1000, extra.guid ?? null);
  };
  const interactions = load("./interactions");
  const press = async (user) => {
    const res = await interactions.handleInteraction(env, { type: 3, guild_id: env.GUILD_ID, data: { custom_id: "guide:verify" }, member: { user: { id: user }, roles: [] } });
    return res.body?.data?.content ?? "";
  };
  const codeIn = (text) => (text.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];

  // ================= 2. nonces are never reused while an old code could pass =================
  console.log("\n== a nonce is not handed out again for 48 hours ==");
  reset();
  forced = ["K7Q"];
  const codeA = codeIn(await press(A));
  check("the first request gets the nonce it drew", codeA && codeA.startsWith("K7Q"));
  let r = await ingest.postVerify(env, { character: "Aelin Stormwarden", code: codeA, source: "whisper" });
  check("  and is used up by its whisper", r.body.result === "verified");
  T += 3600;
  forced = ["K7Q", "K7Q", "M2X"];
  const codeB = codeIn(await press(B));
  check("an hour later the same draw is refused and another nonce taken", codeB && codeB.startsWith("M2X"));
  r = await ingest.postVerify(env, { character: "Stranger Sam", code: codeA, source: "whisper" });
  check("  so the old code can never claim the new request", r.body.result === "no_pending" && one("SELECT consumed_at FROM pending WHERE nonce = 'M2X'").consumed_at === null);
  T += 48 * 3600;
  forced = ["K7Q"];
  const codeC = codeIn(await press(C));
  check("after 48 hours the nonce may come round again", codeC && codeC.startsWith("K7Q") && codeC !== codeA);
  r = await ingest.postVerify(env, { character: "Stranger Sam", code: codeA, source: "whisper" });
  check("  and the old code is long dead", r.body.result === "invalid");

  console.log("\n== a request only takes the exact code it showed ==");
  reset();
  // A request row whose nonce collides with a code from the day before (as an older build could have made). The old
  // code still passes the day window, but it is not this request's code.
  db.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT DO NOTHING").run(A);
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'ZZ9')").run(A, T, T + 86400);
  const yesterdays = await codes.ticketFor(SECRET, "ZZ9", day(T - 86400));
  check("  (the old code is valid by its day)", await codes.isValidTicket(SECRET, yesterdays, new Date(T * 1000)));
  r = await ingest.postVerify(env, { character: "Old Code Olly", code: yesterdays, source: "whisper" });
  check("it does not claim a request minted today", r.body.result === "no_pending" && one("SELECT consumed_at FROM pending WHERE nonce = 'ZZ9'").consumed_at === null);
  r = await ingest.postVerify(env, { character: "Right Rhea", code: await codes.ticketFor(SECRET, "ZZ9", day()), source: "whisper" });
  check("  while today's code does", r.body.result === "verified");

  console.log("\n== a banned account links nothing ==");
  reset();
  db.prepare("INSERT INTO members (discord_id, banned) VALUES ('444444444444444444', 1)").run();
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES ('444444444444444444', '', '', ?1, ?2, 'BAN')").run(T, T + 86400);
  r = await ingest.postVerify(env, { character: "Banned Bo", code: await codes.ticketFor(SECRET, "BAN", day()), source: "whisper" });
  check("a code of a banned account is refused", r.body.result === "banned" && !one("SELECT 1 FROM characters WHERE name_key = 'banned bo'"));
  check("  its request is closed, and staff are told", one("SELECT consumed_source FROM pending WHERE nonce = 'BAN'").consumed_source === "banned" && LOGS.some((l) => l.includes("banned from verifying")));

  // ================= 1. one request code, one character (the Worker's side) =================
  console.log("\n== a request code used by a second character: the first keeps it, staff hear of the second ==");
  reset();
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'TWO')").run(B, T, T + 86400);
  const two = await codes.ticketFor(SECRET, "TWO", day());
  await ingest.postVerify(env, { character: "First Finn", code: two, source: "whisper" });
  r = await ingest.postVerify(env, { character: "Second Sid", code: two, source: "whisper" });
  check("the second character is not linked", r.body.result === "no_pending" && !one("SELECT 1 FROM characters WHERE name_key = 'second sid'"));
  check("  and the leak is visible in the log", LOGS.some((l) => l.includes("Second Sid") && l.includes("First Finn")));

  console.log("\n== the same whisper relayed twice at once (two officers) ends as one member ==");
  reset();
  await snapshot([{ name: "Dup Dan", guid: "G-DUP" }, { name: "Other One", guid: "G-O1" }], T - 30);
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'DUP')").run(C, T, T + 86400);
  const dup = await codes.ticketFor(SECRET, "DUP", day());
  const both = await Promise.all([
    ingest.postVerify(env, { character: "Dup Dan", code: dup, source: "whisper" }),
    ingest.postVerify(env, { character: "Dup Dan", code: dup, source: "whisper" }),
  ]);
  const dan = one("SELECT status, guid FROM characters WHERE name_key = 'dup dan'");
  check("one of them links, and the character ends as a member with its GUID", both.filter((x) => x.body.result === "member").length === 1 && dan.status === "member" && dan.guid === "G-DUP");

  // ================= the whisper's own GUID (the addon's identity note) =================
  console.log("\n== the whisper's GUID pins the link at once, and settles what a stale roster cannot ==");
  reset();
  // The stored roster (current) still has "Kira Moonfall" as the OLD character; the whisper comes from a new one.
  await snapshot([{ name: "Kira Moonfall", guid: "Player-1-000000A1" }, { name: "Other One", guid: "Player-1-000000B1" }], T - 60);
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'GID')").run(A, T, T + 86400);
  r = await ingest.postVerify(env, { character: "Kira Moonfall", code: await codes.ticketFor(SECRET, "GID", day()), source: "whisper", guid: "Player-1-000000A2" });
  const kira = one("SELECT status, guid FROM characters WHERE name_key = 'kira moonfall'");
  check("a different character than the roster's under that name: no member shortcut, normal admission", r.body.result === "verified" && !ROLE_ADDS.some((g) => g.id === A));
  check("  and the link is pinned to the character that whispered", kira.guid === "Player-1-000000A2");
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'GI2')").run(B, T, T + 86400);
  r = await ingest.postVerify(env, { character: "New Name", code: await codes.ticketFor(SECRET, "GI2", day()), source: "whisper", guid: "Player-1-000000A2" });
  check("the same character under a new name, for another account: refused", r.body.result === "bound_elsewhere" && LOGS.some((l) => l.includes("New Name") && l.includes("Kira Moonfall")));
  check("junk in the GUID field is ignored", ingest.playerGuid("Player-1-00ZZ") === null && ingest.playerGuid(42) === null && ingest.playerGuid("Player-4613-0ABCDEF1") === "Player-4613-0ABCDEF1");

  console.log("\n== an identity note that arrives after the verification pins the fresh link ==");
  reset();
  db.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT DO NOTHING").run(C);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES ('late lee', 'Late Lee', ?1, 'verified', ?2)").run(C, T - 60);
  await ingest.postEvents(env, { events: [{ type: "identity", name: "Late Lee", guid: "Player-1-000000C1", origin: "token", ok: true }] });
  check("a fresh unpinned link takes the GUID", one("SELECT guid FROM characters WHERE name_key = 'late lee'").guid === "Player-1-000000C1");
  await ingest.postEvents(env, { events: [{ type: "identity", name: "Late Lee", guid: "Player-1-000000C9", origin: "token", ok: true }] });
  check("  a pin is never overwritten by a later note", one("SELECT guid FROM characters WHERE name_key = 'late lee'").guid === "Player-1-000000C1");
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES ('old olaf', 'Old Olaf', ?1, 'verified', ?2)").run(C, T - 7 * 3600);
  await ingest.postEvents(env, { events: [{ type: "identity", name: "Old Olaf", guid: "Player-1-000000D1", origin: "token", ok: true }] });
  check("  an old link is left for the roster export", one("SELECT guid FROM characters WHERE name_key = 'old olaf'").guid === null);
  await ingest.postEvents(env, { events: [{ type: "identity", name: "Late Lee", guid: "Player-1-000000E1", origin: "chatlog", ok: true }] });
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES ('copy cat', 'Copy Cat', ?1, 'verified', ?2)").run(C, T - 60);
  await ingest.postEvents(env, { events: [{ type: "identity", name: "Copy Cat", guid: "Player-1-000000C1", origin: "token", ok: true }] });
  check("  and never a GUID another link holds", one("SELECT guid FROM characters WHERE name_key = 'copy cat'").guid === null);

  // ================= 4. the request is never used up without the link =================
  console.log("\n== postVerify is one transaction ==");
  const oldDb = freshDb(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"));
  const oldEnv = { ...env, DB: d1(oldDb) };
  oldDb.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at) VALUES (?1, 'thrall', 'Thrall', ?2, ?3)").run(C, T, T + 86400);
  let threw = false;
  try {
    await ingest.postVerify(oldEnv, { character: "Thrall", code: await codes.codeFor(SECRET, "Thrall", day()), source: "whisper" });
  } catch {
    threw = true;
  }
  check("a link that cannot be written (old schema) fails the whole verification", threw);
  check("  and leaves the request open for the retry", oldDb.prepare("SELECT consumed_at FROM pending WHERE name_key = 'thrall'").get().consumed_at === null);

  console.log("\n== until the schema check succeeds, the watcher is told to come back ==");
  const index = load("./index").default;
  schema.forgetSchemaCheck();
  const broken = { prepare: () => ({ bind() { return this; }, all: async () => { throw new Error("D1_ERROR: database unavailable"); }, run: async () => { throw new Error("D1_ERROR"); }, first: async () => null }), batch: async () => { throw new Error("D1_ERROR"); } };
  const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };
  const req = () => new Request("https://verify.example/queue?officer=fern%20melder", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } });
  const quiet = console.error;
  console.error = () => {}; // the Worker logs the failed check; expected here
  let res = await index.fetch(req(), { ...env, DB: broken, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("GET /queue answers 503 while the schema cannot be checked", res.status === 503);
  res = await index.fetch(new Request("https://verify.example/privacy"), { ...env, DB: broken, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("  the canonical policy still answers HTML without D1 or a redirect (.65)", res.status === 200 && !res.headers.has("Location") && /text\/html/.test(res.headers.get("Content-Type")) && (await res.text()).includes("<h1>Privacy Policy</h1>"));
  schema.forgetSchemaCheck();
  res = await index.fetch(req(), { ...env, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("  and once it succeeds, the queue is served", res.status === 200);
  const bearer = { Authorization: "Bearer watcher-token-for-tests-only-0123456789" };
  res = await index.fetch(new Request("https://verify.example/queue?officer=fern%20melder&keyVersion=3", { headers: bearer }), { ...env, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("a client naming a key version is told the protocol is unsupported, never served the legacy queue as if it were (.66, Codex 02:41)", res.status === 400 && (await res.json()).error === "unsupported_protocol");
  res = await index.fetch(new Request("https://verify.example/queue/written", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [], officer: "fern melder", keyVersion: 3 }) }), { ...env, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("  the same for a key version in a POST body", res.status === 400 && (await res.json()).error === "unsupported_protocol");
  res = await index.fetch(new Request("https://verify.example/queue/written", { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [], officer: "fern melder" }) }), { ...env, WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789" }, ctx);
  check("  an unversioned client is served as before", res.status === 200);
  console.error = quiet;

  // ================= 9 and 7. presence that expires, and the gate on request codes =================
  console.log("\n== relays: presence expires, capability gates request codes ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  delete env.REQUEST_CODES;
  check("no relay has reported: request codes wait", (await relays.ticketsReady(env)) === false);
  await relays.recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0" });
  check("a 0.6.0 watcher without an addon version: still waiting", (await relays.ticketsReady(env)) === false);
  await relays.recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
  check("watcher and addon both 0.6.0: request codes on", (await relays.ticketsReady(env)) === true);
  T += 60;
  check("a change is written ...", (await relays.recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: false, version: "0.6.0" })) === "written");
  check("  ... and a report without the addon version keeps the one on record", one("SELECT addon FROM relays").addon === "0.6.0");
  await relays.recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
  check("REQUEST_CODES=off wins", (await relays.ticketsReady({ ...env, REQUEST_CODES: "off" })) === false);
  check("REQUEST_CODES=on wins", (await relays.ticketsReady({ ...env, DB: d1(freshDb()), REQUEST_CODES: "on" })) === true);
  await relays.recordRelay(env, { officer: "old officer", character: "Old Officer", online: true, version: "0.5.9" });
  let st = await relays.relayStatus(env, { tickets: true });
  check("a request code is only sent to an officer whose addon understands it", st.online.map((x) => x.character).join() === "Fern Melder");
  st = await relays.relayStatus(env);
  check("  a character code may go to either", st.online.length === 2);
  const env3 = { ...env, OFFICER_CHARACTERS: "Old Officer, Fern Melder" };
  await relays.recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: false, version: "0.6.0", addon: "0.6.0" });
  await relays.recordRelay(env, { officer: "old officer", character: "Old Officer", online: false, version: "0.5.9" });
  const lines3 = relays.whisperInstructions(env3, "K7QYSTG", T + 3600, await relays.relayStatus(env3, { tickets: true }));
  check("nobody online: a request code points at the officer who can take it, not the first configured name", lines3.includes("/w Fern Melder !verify K7QYSTG") && !lines3.join(" ").includes("Old Officer"));
  T += relays.RELAY_KNOWN + 1;
  st = await relays.relayStatus(env);
  check("a day of silence: presence is unknown again, so replies fall back to the configured names", st.known === false && relays.whisperInstructions(env, "ABCDEFG", T, st).some((l) => l.startsWith("Send it while Fern Melder")));
  check("versions compare by number", relays.versionAtLeast("0.10.0", "0.6.0") && relays.versionAtLeast("0.6", "0.6.0") && !relays.versionAtLeast("0.5.8", "0.6.0") && !relays.versionAtLeast("?", "0.6.0") && !relays.versionAtLeast(null, "0.6.0"));

  // ================= 8. renames are found by GUID first =================
  console.log("\n== a renamed member stays linked when someone takes the old name ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  reset();
  bind("al", "Al", A, "member", { guid: "G-1" });
  await snapshot([{ name: "Al", guid: "G-1" }, { name: "Filler", guid: "G-F" }], T);
  let s = await snapshot([{ name: "Bob", guid: "G-1" }, { name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }], T + 10);
  check("the link moved to the new name, still a member", one("SELECT discord_id, status FROM characters WHERE name_key = 'bob'")?.status === "member" && s.renamed.length === 1);
  check("  no role taken, nothing released", ROLE_REMOVES.length === 0 && s.released.length === 0);
  check("  the new 'Al' is simply unlinked", !one("SELECT 1 FROM characters WHERE name_key = 'al'"));
  s = await snapshot([{ name: "Bob", guid: "G-1" }, { name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }, { name: "Extra", guid: "G-X" }], T + 20);
  check("  and the next export leaves it alone", one("SELECT status FROM characters WHERE name_key = 'bob'").status === "member" && ROLE_REMOVES.length === 0);

  console.log("\n== an export that misses a renamed member does not unlink them ==");
  reset();
  bind("hal", "Hal", C, "member", { guid: "G-H" });
  await snapshot([{ name: "Bob", guid: "G-1" }, { name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }, { name: "Extra", guid: "G-X" }, { name: "Hal", guid: "G-H" }], T + 22);
  // Hal renames to Hank and someone new takes "Hal"; this export happens to miss Hank (still within the shrink limit)
  s = await snapshot([{ name: "Bob", guid: "G-1" }, { name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }, { name: "Extra", guid: "G-X" }, { name: "Hal", guid: "G-NEWHAL" }], T + 24);
  check("the namesake is only held: the link and the role stay", s.released.length === 0 && ROLE_REMOVES.length === 0 && one("SELECT status FROM characters WHERE name_key = 'hal'").status === "member");
  s = await snapshot([{ name: "Bob", guid: "G-1" }, { name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }, { name: "Extra", guid: "G-X" }, { name: "Hal", guid: "G-NEWHAL" }, { name: "Hank", guid: "G-H" }], T + 26);
  check("the next full export carries the link to Hank", one("SELECT discord_id, status FROM characters WHERE name_key = 'hank'")?.status === "member" && ROLE_REMOVES.length === 0 && s.renamed.length === 1);

  console.log("\n== a chain of renames resolves; a swap is left for an officer ==");
  reset();
  bind("carl", "Carl", B, "member", { guid: "G-3" });
  bind("dave", "Dave", C, "member", { guid: "G-4" });
  bind("eve", "Eve", "555555555555555555", "member", { guid: "G-5" });
  const base = [{ name: "Al", guid: "G-2" }, { name: "Filler", guid: "G-F" }, { name: "Extra", guid: "G-X" }];
  await snapshot([...base, { name: "Bob", guid: "G-1" }, { name: "Carl", guid: "G-3" }, { name: "Dave", guid: "G-4" }, { name: "Eve", guid: "G-5" }], T + 30);
  // Bob -> Carl while Carl -> Zed (a chain), and Dave <-> Eve (a swap)
  s = await snapshot([...base, { name: "Carl", guid: "G-1" }, { name: "Zed", guid: "G-3" }, { name: "Eve", guid: "G-4" }, { name: "Dave", guid: "G-5" }], T + 40);
  check("the chain: each link follows its character", one("SELECT discord_id FROM characters WHERE name_key = 'carl'").discord_id === A && one("SELECT discord_id FROM characters WHERE name_key = 'zed'").discord_id === B);
  check("the swap: both left as they are, staff told", one("SELECT discord_id FROM characters WHERE name_key = 'dave'").discord_id === C && one("SELECT discord_id FROM characters WHERE name_key = 'eve'").discord_id === "555555555555555555" && LOGS.some((l) => l.includes("swapped names")));
  check("  nobody lost a role over any of it", ROLE_REMOVES.length === 0 && s.held === 2);

  console.log("\n== another account's dead row under the new name is kept, not deleted ==");
  reset();
  bind("frank", "Frank", A, "member", { guid: "G-6" });
  bind("gina", "Gina", B, "left", { guid: "G-OLD" });
  await snapshot([...base, { name: "Carl", guid: "G-1" }, { name: "Zed", guid: "G-3" }, { name: "Frank", guid: "G-6" }], T + 50);
  await snapshot([...base, { name: "Carl", guid: "G-1" }, { name: "Zed", guid: "G-3" }, { name: "Gina", guid: "G-6" }], T + 60);
  check("one export is not enough to release the old owner's link, so the rename waits", one("SELECT discord_id FROM characters WHERE name_key = 'gina'").discord_id === B && one("SELECT status FROM characters WHERE name_key = 'frank'").status === "member");
  await snapshot([...base, { name: "Carl", guid: "G-1" }, { name: "Zed", guid: "G-3" }, { name: "Gina", guid: "G-6" }], T + 65);
  check("the second agreeing export: the rename took the name", one("SELECT discord_id FROM characters WHERE name_key = 'gina'").discord_id === A);
  check("  and the old owner's history is still there, under an archive key", one("SELECT status FROM characters WHERE name_key LIKE 'gina~%' AND discord_id = ?1", B) !== undefined);

  // ================= 15. a mass release is held for a person =================
  console.log("\n== more releases than the cap: held, reported once, applied by sync ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  reset();
  const many = [];
  for (let i = 0; i < 7; i++) {
    bind(`m${i} member`, `M${i} Member`, `60000000000000000${i}`, "member", { guid: `OLD-${i}` });
    many.push({ name: `M${i} Member`, guid: `OLD-${i}` });
  }
  await snapshot(many, T);
  const moved = many.map((m, i) => ({ name: m.name, guid: `NEW-${i}` })); // a realm move: every character gets a new ID
  s = await snapshot(moved, T + 10);
  check("the first export with new IDs: held until a second agrees", s.released.length === 0 && s.held === 7 && LOGS.length === 0);
  s = await snapshot(moved, T + 15);
  check("7 namesakes at once (cap 5): none released, all held", s.released.length === 0 && s.held === 7 && ROLE_REMOVES.length === 0);
  check("  staff are told what to do", LOGS.filter((l) => l.includes("links would be released at once")).length === 1);
  s = await snapshot([...moved, { name: "One More", guid: "X" }], T + 20);
  check("  the next export does not repeat the notice", LOGS.filter((l) => l.includes("links would be released at once")).length === 1 && s.held === 7);
  check("  the held members keep their role and status", all("SELECT status FROM characters WHERE name_key LIKE 'm% member'").every((c) => c.status === "member"));
  const synced = await roster.syncFromLatest(env);
  check("/olympus-admin sync applies them", synced.released.length === 7 && ROLE_REMOVES.length === 7);
  check("the cap scales with the number of links", roster.releaseCap(10) === 5 && roster.releaseCap(1000) === 20);

  // ================= 10 and 11. GUIDs in the fingerprint; junk GUIDs are ignored =================
  console.log("\n== the stored roster follows GUID changes; a junk GUID breaks nothing ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  reset();
  let a1 = await snapshot([{ name: "Same Name", guid: "G-A", rankIndex: 4 }, { name: "Other", guid: "G-O", rankIndex: 4 }], T);
  let a2 = await snapshot([{ name: "Same Name", guid: "G-B", rankIndex: 4 }, { name: "Other", guid: "G-O", rankIndex: 4 }], T + 10);
  check("an export that differs only in a GUID is a new snapshot", a2.unchanged === false && a2.snapshot !== a1.snapshot);
  check("  and the stored roster carries the new GUID", (await roster.latestRosterEntry(env, "same name")).guid === "G-B");
  let crashed = false;
  try {
    a2 = await snapshot([{ name: "Same Name", guid: 12345 }, { name: "Other", guid: { x: 1 } }, { name: "Third", guid: true }], T + 20);
  } catch (e) {
    crashed = String(e);
  }
  check("numbers, tables and booleans as GUIDs do not crash the export", crashed === false && roster.guidOf(12345) === null && roster.guidOf(" G ") === "G");

  console.log("\n== an officer's D: note never promotes somebody else's old row ==");
  db = freshDb(); env = { ...env, DB: d1(db) };
  reset();
  bind("nora name", "Nora Name", B, "unbound");
  db.prepare("INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT DO NOTHING").run(A);
  await snapshot([{ name: "Nora Name", guid: "G-N", note: `D:${A}` }, { name: "Other", guid: "G-O" }], T);
  check("the note links the account it names", one("SELECT discord_id, status FROM characters WHERE name_key = 'nora name'").discord_id === A && ROLE_ADDS.some((g) => g.id === A) && !ROLE_ADDS.some((g) => g.id === B));
  check("  and the old account's row is kept on record", one("SELECT 1 AS x FROM characters WHERE name_key LIKE 'nora name~%' AND discord_id = ?1", B)?.x === 1);

  // ================= 6. open request codes are visible to whoever removes the unverified =================
  console.log("\n== the unverified report counts request codes nobody has whispered ==");
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, '', '', ?2, ?3, 'OPN')").run(C, T, T + 86400);
  db.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce) VALUES (?1, 'x', 'X', ?2, ?3, 'USD')").run(C, T, T + 86400);
  const rep = await unv.unverifiedReport(env);
  check("one open request code (a used one does not count)", rep.openTickets === 1);

  globalThis.Date = RealDate;
  crypto.getRandomValues = realRandom;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

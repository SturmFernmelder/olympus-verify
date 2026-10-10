// Build .47 (30 Sep 2026): the signed-interaction door in src/index.ts, through the REAL src/*.ts (transpiled by
// TypeScript itself) against the REAL schema in SQLite (node:sqlite), with a real Ed25519 key pair standing in for
// Discord's. Covers the timestamp window, the body cap (declared and streamed), the application check and the replay
// ledger (ledgered kinds refused on repeat, ping and autocomplete not), plus the hourly purge. No network: fetch throws.
// Run from the worker folder:  node tests/interactions_hardening_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- D1 over SQLite (the site test's shim: a batch is one transaction, run() reports changes) ----------
// Review hooks (Codex 23:28 / 23:33 UTC): fail one statement once, hold one statement until a gate opens, and count
// the statements that ARE effects (the handler's own writes), so a replay can be shown to run nothing.
const hooks = { failOnce: null, holdOnce: null, effects: 0 };
function d1(db) {
  const exec = (sql, params) => {
    if (/^\s*INSERT INTO (pending|audit|characters|invite_queue|members)\b/i.test(sql)) hooks.effects++;
    if (hooks.failOnce && hooks.failOnce.test(sql)) {
      hooks.failOnce = null;
      throw new Error("synthetic transient D1 failure");
    }
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
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => {
        if (hooks.holdOnce && hooks.holdOnce.test(sql)) {
          const gate = hooks.holdOnce;
          hooks.holdOnce = null;
          await gate.open;
        }
        return exec(sql, params);
      },
      _exec: () => exec(sql, params),
      _hold: async () => {
        if (hooks.holdOnce && hooks.holdOnce.test(sql)) {
          const gate = hooks.holdOnce; hooks.holdOnce = null; await gate.open;
        }
      },
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => {
      // Request-bound admission now uses native batches. Pause before BEGIN, rather than holding
      // an artificial open SQLite transaction while the concurrent request tests the replay claim.
      for (const s of stmts) await s._hold();
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

// ---------- the real modules ----------
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = {};
function load(name) {
  const file = path.join(root, "src", name.replace(/^\.\//, "") + ".ts");
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} };
  cache[file] = mod;
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const indexMod = load("./index");
const index = indexMod.default;
const discord = load("./discord");

globalThis.fetch = async () => { throw new Error("no network in tests"); };

// ---------- clock, keys, env ----------
let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [T * 1000])); }
  static now() { return T * 1000; }
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const APP = "1550176895671341076", OLYMPUS = "1549537348516188200", USER = "300000000000000001";
let db = freshDb();
let publicKeyHex = "";
const env = () => ({
  DB: d1(db),
  GUILD_ID: OLYMPUS,
  DISCORD_APP_ID: APP,
  DISCORD_PUBLIC_KEY: publicKeyHex,
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_CLIENT_SECRET: "client-secret",
  COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789",
  VERIFY_SECRET: "verify-secret-for-tests",
  WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789",
  PUBLIC_BASE_URL: "https://verify.example",
  SITE_HOST: "",
  ADMISSION_MODE: "auto",
  SET_GUILD_NOTE: "false",
  QUEUE_CLAIM_LIMIT: "25",
  QUEUE_CLAIM_TTL_MINUTES: "15",
  ROSTER_MIN_MEMBERS: "0",
  ROSTER_MAX_SHRINK_PCT: "100",
  CHANNEL_SERVER_LOG: "",
  CHANNEL_NOTICES: "",
  OFFICER_CHARACTERS: "Fern Melder",
});
const waits = [];
const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (waits.length) await waits.shift(); };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };

(async () => {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  publicKeyHex = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
  const sign = async (timestamp, body) => hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + body)));

  /** A signed POST /interactions as Discord would send it; `at` is the signature timestamp (seconds). */
  async function post(payload, { at = T, body, signature, headers = {}, stream = false } = {}) {
    const text = body ?? JSON.stringify(payload);
    const timestamp = String(at);
    const h = new Headers({ "Content-Type": "application/json", "X-Signature-Timestamp": timestamp, "X-Signature-Ed25519": signature ?? (await sign(timestamp, text)), ...headers });
    let init;
    if (stream) {
      // No Content-Length: the Worker must count what streams in.
      const bytes = new TextEncoder().encode(text);
      const rs = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 65536) c.enqueue(bytes.subarray(i, i + 65536)); c.close(); } });
      init = { method: "POST", headers: h, body: rs, duplex: "half" };
    } else {
      init = { method: "POST", headers: h, body: text };
    }
    const res = await index.fetch(new Request("https://verify.example/interactions", init), env(), ctx);
    await settle();
    return res;
  }
  const ping = { type: 1, id: "900000000000000001", application_id: APP, token: "t" };
  const command = (id, name = "nope") => ({ type: 2, id, application_id: APP, token: "t", guild_id: OLYMPUS, member: { user: { id: USER, username: "alice" }, roles: [] }, data: { name } });
  const rows = () => db.prepare("SELECT id, seen_at FROM seen_interactions ORDER BY seen_at, id").all();

  console.log("\n== the signature and its timestamp ==");
  let res = await post(ping);
  check("a ping signed now is answered with a pong", res.status === 200 && (await res.json()).type === 1, res.status);
  res = await post(ping, { at: T - 301 });
  check("the same ping signed 301 s ago is refused", res.status === 401, res.status);
  res = await post(ping, { at: T + 301 });
  check("  and one from 301 s in the future", res.status === 401, res.status);
  res = await post(ping, { at: T - 299 });
  check("  while 299 s ago is inside the window", res.status === 200, res.status);
  res = await post(ping, { headers: { "X-Signature-Timestamp": "17905e5" } });
  check("a non-numeric timestamp is refused before any crypto", res.status === 401, res.status);
  const good = await sign(String(T), JSON.stringify(ping));
  res = await post(ping, { signature: (good[0] === "0" ? "1" : "0") + good.slice(1) });
  check("a signature with one nibble changed is refused", res.status === 401, res.status);
  res = await post(ping, { body: JSON.stringify(ping) + " ", signature: good });
  check("  and so is a body that no longer matches the signature", res.status === 401, res.status);
  check("nothing was ledgered for pings", rows().length === 0);

  console.log("\n== the body cap ==");
  const big = JSON.stringify({ ...ping, pad: "x".repeat(128 * 1024) });
  res = await post(ping, { body: big });
  check("a 128 KiB+ body with a declared length is refused with 413", res.status === 413, res.status);
  res = await post(ping, { body: big, stream: true });
  check("  and so is one that streams in without a Content-Length", res.status === 413, res.status);
  const fits = JSON.stringify({ ...ping, pad: "x".repeat(128 * 1024 - 200) });
  res = await post(ping, { body: fits, stream: true });
  check("  while one just under the cap streams through and is verified normally", res.status === 200, res.status);
  res = await post(ping, { headers: { "Content-Length": "12abc" } });
  check("a malformed Content-Length is refused", res.status === 413, res.status);

  console.log("\n== the application ==");
  res = await post({ ...ping, application_id: "1552073500167110767" });
  check("a payload signed for another application is refused with 400", res.status === 400, res.status);
  res = await post({ type: 1, id: "900000000000000002", token: "t" });
  check("  and so is one naming no application at all", res.status === 400, res.status);

  console.log("\n== the replay ledger ==");
  res = await post(command("900000000000000010"));
  let body = await res.json();
  check("an unknown command is answered once", res.status === 200 && body.data?.content === "Unknown command.", res.status, JSON.stringify(body).slice(0, 120));
  check("  and its id is ledgered", rows().length === 1 && rows()[0].id === "900000000000000010" && rows()[0].seen_at === T);
  T += 10;
  res = await post(command("900000000000000010"));
  body = await res.json();
  check("the same id ten seconds later, freshly signed, gets the stored answer back without running anything", res.status === 200 && body.data?.content === "Unknown command.", res.status);
  check("  and nothing was added", rows().length === 1);
  check("  the answer is kept with the claim", JSON.parse(db.prepare("SELECT response FROM seen_interactions WHERE id = '900000000000000010'").get().response).status === 200);
  res = await post(command("900000000000000011"));
  check("a new id is answered", res.status === 200 && (await res.json()).data?.content === "Unknown command.", res.status);
  res = await post({ ...command("900000000000000012"), type: 5, data: { custom_id: "nope" } });
  check("a modal submit is ledgered too", res.status === 200 && rows().some((r) => r.id === "900000000000000012"), res.status);
  res = await post({ ...command("900000000000000012"), type: 5, data: { custom_id: "nope" } });
  check("  and answered from the ledger on repeat", res.status === 200 && (await res.json()).data?.content === "Unknown form.", res.status);
  const ac = { type: 4, id: "900000000000000020", application_id: APP, token: "t", guild_id: OLYMPUS, member: { user: { id: USER, username: "alice" }, roles: [] }, data: { name: "verify", options: [{ name: "character", type: 3, value: "Ae", focused: true }] } };
  res = await post(ac);
  const first = res.status;
  res = await post(ac);
  check("autocomplete is answered every time and never ledgered", first === 200 && res.status === 200 && !rows().some((r) => r.id === "900000000000000020"), first, res.status);
  res = await post(command("900000000000000060", "verify-status"));
  const ro1 = res.status;
  res = await post(command("900000000000000060", "verify-status"));
  check("a read-only command (verify-status) is answered every time and never ledgered (.50)", ro1 === 200 && res.status === 200 && !rows().some((r) => r.id === "900000000000000060"), ro1, res.status);
  res = await post({ ...command("900000000000000061", "olympus-admin"), data: { name: "olympus-admin", options: [{ name: "lookup", type: 1, options: [{ name: "user", type: 3, value: USER }] }] } });
  check("  so is /olympus-admin lookup", res.status === 200 && !rows().some((r) => r.id === "900000000000000061"), res.status);
  res = await post({ ...command("900000000000000062", "olympus-admin"), data: { name: "olympus-admin", options: [{ name: "unban", type: 1, options: [{ name: "user", type: 3, value: USER }] }] } });
  check("  while /olympus-admin unban, which writes, is ledgered", res.status === 200 && rows().some((r) => r.id === "900000000000000062"), res.status);
  res = await post({ ...command("900000000000000063"), guild_id: undefined, type: 5, data: { custom_id: "guide:verify-modal", components: [{ type: 1, components: [{ type: 4, custom_id: "character", value: "Sneaky Modal" }] }] } });
  check("a modal without a guild id is refused like any other interaction outside the configured guild (.58, Codex 01:35)", res.status === 200 && /only serves Olympus/.test((await res.json()).data?.content ?? "") && !db.prepare("SELECT 1 FROM pending WHERE name_key = 'sneaky modal'").get());
  res = await post({ ...command("nope"), id: "not-a-snowflake" });
  check("a command without a snowflake id is refused with 400", res.status === 400, res.status);
  res = await post({ ...command("900000000000000030"), id: undefined });
  check("  and so is one with no id", res.status === 400, res.status);

  console.log("\n== recovery (Codex review of d326709): failure before effect ==");
  const pendingCount = (name) => db.prepare("SELECT COUNT(*) AS n FROM pending WHERE name_key = ?").get(name).n;
  const verifyCmd = (id, who) => ({ ...command(id, "verify"), data: { name: "verify", options: [{ name: "character", type: 3, value: who }] } });
  const FAILED = discord.INTERACTION_FAILED; // .51: lives in discord.ts (the entry exports functions only)
  hooks.failOnce = /INSERT INTO pending\b/i;
  res = await post(verifyCmd("900000000000000040", "Retry Hero"));
  body = await res.json();
  check("the first valid /verify fails transiently before its pending row is written: the person gets the fixed try-again reply, not a 500", res.status === 200 && body.data?.content === FAILED, res.status, String(body.data?.content).slice(0, 60));
  check("  no pending code was committed", pendingCount("retry hero") === 0);
  check("  and the claim is kept, filled with that reply", JSON.parse(db.prepare("SELECT response FROM seen_interactions WHERE id = '900000000000000040'").get().response).body.includes(FAILED.slice(0, 30)));
  let effects = hooks.effects;
  res = await post(verifyCmd("900000000000000040", "Retry Hero"));
  body = await res.json();
  check("a captured copy of the failed request gets the same reply and runs nothing", res.status === 200 && body.data?.content === FAILED && hooks.effects === effects, res.status, hooks.effects - effects);
  check("  still no pending row", pendingCount("retry hero") === 0);
  res = await post(verifyCmd("900000000000000044", "Retry Hero"));
  body = await res.json();
  check("the person's fresh command (a new id) runs and hands out the code", res.status === 200 && /Your code for \*\*Retry Hero\*\*/.test(body.data?.content ?? ""), res.status, String(body.data?.content).slice(0, 80));
  check("  exactly one pending row exists", pendingCount("retry hero") === 1);

  console.log("\n== recovery: failure after effect ==");
  // The pending row is written, then the audit row that follows it fails: the effect happened, the answer did not.
  hooks.failOnce = /INSERT INTO audit\b/i;
  res = await post(verifyCmd("900000000000000041", "Second Hero"));
  body = await res.json();
  check("a failure after the pending row is written answers the fixed try-again reply", res.status === 200 && body.data?.content === FAILED, res.status);
  check("  the pending row exists (the effect happened)", pendingCount("second hero") === 1);
  effects = hooks.effects;
  res = await post(verifyCmd("900000000000000041", "Second Hero"));
  body = await res.json();
  check("a captured copy of that request cannot make the effect happen again: same reply, zero effect statements", res.status === 200 && body.data?.content === FAILED && hooks.effects === effects, res.status, hooks.effects - effects);
  check("  still exactly one pending row", pendingCount("second hero") === 1);
  res = await post(verifyCmd("900000000000000045", "Second Hero"));
  body = await res.json();
  check("the person's fresh command finds the open request and shows the same code, still one row", res.status === 200 && /Your code for \*\*Second Hero\*\*/.test(body.data?.content ?? "") && pendingCount("second hero") === 1, res.status, pendingCount("second hero"));

  console.log("\n== recovery: concurrent duplicate ==");
  let open;
  const gate = { open: new Promise((r) => { open = r; }) };
  hooks.holdOnce = Object.assign(/INSERT INTO pending\b/i, { open: gate.open });
  const firstRun = post(verifyCmd("900000000000000042", "Third Hero"));
  await new Promise((r) => setTimeout(r, 20)); // let the first run claim the id and stop at the gate
  const second = await post(verifyCmd("900000000000000042", "Third Hero"));
  check("a duplicate that arrives while the first run is in flight is refused with 409", second.status === 409, second.status);
  open();
  res = await firstRun;
  body = await res.json();
  check("the first run completes normally", res.status === 200 && /Your code for \*\*Third Hero\*\*/.test(body.data?.content ?? ""), res.status);
  effects = hooks.effects;
  const third = await post(verifyCmd("900000000000000042", "Third Hero"));
  check("  and a later repeat gets that exact answer back without running anything", third.status === 200 && JSON.stringify(await third.json()) === JSON.stringify(body) && hooks.effects === effects, third.status, hooks.effects - effects);
  check("  with one pending row", pendingCount("third hero") === 1);

  console.log("\n== recovery: response delivery ==");
  res = await post(command("900000000000000043"));
  const delivered = await res.text();
  const again = await post(command("900000000000000043"));
  check("a repeat is answered with the byte-identical stored body", again.status === 200 && (await again.text()) === delivered);
  check("  as application/json", (again.headers.get("Content-Type") ?? "").startsWith("application/json"));

  console.log("\n== the purge ==");
  T += 3600 - 10; // exactly one hour after the first ledgered id
  await indexMod.purgeSeenInteractions(env());
  // 9 since .50: the ledgered /olympus-admin unban above (the read-only cases add nothing); 10 since .58: the refused modal is ledgered too.
  check("ids exactly an hour old are forgotten, newer ones kept", rows().length === 10 && rows().every((r) => r.id !== "900000000000000010"), JSON.stringify(rows().map((r) => r.id)));
  res = await post(command("900000000000000010"));
  check("  so a forgotten id would be accepted again (its old signature is long past the window anyway)", res.status === 200, res.status);
  T += 7200;
  await indexMod.purgeSeenInteractions(env());
  check("two hours later the ledger is empty", rows().length === 0);

  console.log("\n== the schema check makes the table on an older database ==");
  const old = new DatabaseSync(":memory:");
  old.exec(fs.readFileSync(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"), "utf8"));
  const schema = load("./schema");
  schema.forgetSchemaCheck();
  await schema.ensureSchema({ DB: d1(old) });
  check("ensureSchema adds seen_interactions to a .25-era database", old.prepare("SELECT name FROM sqlite_master WHERE name = 'seen_interactions'").get()?.name === "seen_interactions");
  check("  with its index", old.prepare("SELECT name FROM sqlite_master WHERE name = 'seen_interactions_at'").get()?.name === "seen_interactions_at");
  schema.forgetSchemaCheck();
  await schema.ensureSchema({ DB: d1(old) });
  check("  and a second run is a no-op", true);

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

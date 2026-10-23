// Build .186 (Olympus Link, Phase 1a; the reviewed integration plan and the owner's rulings of 21 Oct 2026), through the
// REAL src/*.ts (transpiled by TypeScript itself) against the REAL schema in SQLite, with a second SQLite database
// loaded from the vendored upstream schema standing in for LINK_DB. Only Discord's HTTP side is faked.
//   - the generator: vendored bytes match their pins, src/link-core.ts is exactly pristine + counted P1-P6 patches, drift is refused,
//     and --check also runs through a junction or symlink;
//   - flag OFF is .185: the routes give today's 404 bytes with the same statements, and /verify replies and every
//     main-database statement are byte-identical to the .185 interactions.ts (rebuilt from this one, digest-pinned);
//   - the gate (off, on, held; LINK_ORIGIN exactly the page's origin), linkEnv (no DB key), patches P1-P4 in behaviour;
//   - flag ON: /verify appends the code last (prefix unchanged, no added main-database statement), isolation, the
//     1.2 s deadline, the length guard; POST /proof (CORS for https://dnl-gentile.github.io only, OPTIONS 204, a foreign
//     origin refused before any read or count, limits by address and IPv6 /64, body cap, link, forget), POST
//     /api/link/keys (bearer before body, constant-time compare), bot host only (none on a shared host);
//   - HELD: the preflight as on, POST 503, at most one log line a minute per isolate;
//   - the role writer's eligibility (banned, inactive subject, blocking role, not in server), Discord outcomes, the role
//     check's cache, and audit rows fenced by the privacy reference (none naming a retiring or erased account);
//   - the upstream vectors (seeds and derivable token fields left out, SHA-256-pinned) through the adapter, and
//     upstream's own seedless D1 cases, ported.
// Run from the worker folder:  node tests/link_integration_186_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript"), nodeCrypto = require("node:crypto"), cp = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const entry = require("./helpers/privacy129_fixture.cjs");
const subtle = globalThis.crypto.subtle;
const sha = (b) => nodeCrypto.createHash("sha256").update(b).digest("hex");
// Upstream's web/test/fixtures/vectors.json at d03ea8a9 with every seed* field and the two derivable backend "token"
// fields removed (its own "about" says so); pinned, so a changed fixture is a reviewed change. Each token is rebuilt here
// exactly as upstream defines it: payload + "." + signature_b64url.
const VECTORS_SHA256 = "53e31a45e9506b2c1b00f7373dd5557c8dfcf06049ff1d392eec459a8eeaa1ad";
const vectorsRaw = fs.readFileSync(path.join(__dirname, "fixtures", "olympus-link", "vectors-d03ea8a9.json"));
const vectors = JSON.parse(vectorsRaw.toString("utf8"));
const keysIn = (o, out = []) => { if (Array.isArray(o)) for (const x of o) keysIn(x, out); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { out.push(k); keysIn(v, out); } return out; };
const vectorsShippedKeys = keysIn(vectors);
for (const t of vectors.backend.tokens) t.token = `${t.payload}.${t.signature_b64url}`;

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => typeof w === "string" ? w : JSON.stringify(w)?.slice(0, 1500))); console.log((cond ? "PASS " : "FAIL ") + name); };

// ---------- a fixed clock and deterministic randomness (codes and nonces must repeat across the two worlds) ----------
let T = 1790600000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [T * 1000])); }
  static now() { return T * 1000; }
};
// link-core's only draw is its 10-byte code R; it gets a stream of its own, so the bot's own random values (request-code
// nonces, write-admission nonces) stay aligned with the .185 world whether or not Link drew a code in between.
const streams = { bot: 1, link: 7 };
const reseed = (s) => { streams.bot = s >>> 0; streams.link = (s ^ 0x5bd1e995) >>> 0; };
globalThis.crypto.getRandomValues = (arr) => {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), k = bytes.length === 10 ? "link" : "bot";
  for (let i = 0; i < bytes.length; i++) { streams[k] = (Math.imul(streams[k], 1103515245) + 12345) >>> 0; bytes[i] = streams[k] >>> 24; }
  return arr;
};
let uuid = 0;
globalThis.crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`;

// ---------- console: kept, checked for identifiers, printed only on failure ----------
const LOGS = [];
const realError = console.error, realWarn = console.warn;
console.error = (...a) => { LOGS.push(a.map(String).join(" ")); };
console.warn = (...a) => { LOGS.push(a.map(String).join(" ")); };

// ---------- Discord, faked at fetch ----------
let FETCHES = [], responder = null;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  FETCHES.push({ url: u, method: init.method || "GET", init });
  if (responder) return responder(u, init);
  throw new Error("no network in tests");
};
const header = (init, name) => { const h = init && init.headers; if (!h) return null; if (typeof h.get === "function") return h.get(name); const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase()); return k ? h[k] : null; };
const json = (status, body) => status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// ---------- the loader: one module graph per world, the real sources, optional source overrides ----------
const transpile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function makeLoader({ stubs = {}, overrides = {} } = {}) {
  const cache = {};
  const load = (name) => {
    if (name === "node:async_hooks" || name === "./node:async_hooks") return require("node:async_hooks");
    if (stubs[name]) return stubs[name];
    const key = name.replace(/^\.\//, "");
    if (cache[key]) return cache[key].exports;
    const mod = { exports: {} };
    cache[key] = mod;
    const text = overrides[key] ?? fs.readFileSync(path.join(root, "src", key + ".ts"), "utf8");
    new Function("module", "exports", "require", transpile(text))(mod, mod.exports, load);
    return mod.exports;
  };
  return load;
}

// ---------- LINK_DB: upstream's schema on node:sqlite behind a D1-shaped shim (upstream's own helper, in CJS) ----------
const LINK_SCHEMA = fs.readFileSync(path.join(root, "vendor", "olympus-link", "schema.sql"), "utf8");
function linkD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(LINK_SCHEMA);
  const calls = { n: 0 };
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a),
    first: async () => { calls.n++; const row = db.prepare(sql).get(...args); return row ? { ...row } : null; },
    all: async () => { calls.n++; return { success: true, results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
    run: async () => { calls.n++; const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return {
    sqlite: db, calls,
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      calls.n++;
      db.exec("BEGIN");
      try { const out = []; for (const s of list) out.push(await (/^\s*SELECT\b/i.test(s.sql) ? s.all() : s.run())); db.exec("COMMIT"); return out; }
      catch (err) { db.exec("ROLLBACK"); throw err; }
    },
  };
}
/** A D1 that must never be touched: every access is counted and refused. */
function trapD1() {
  const t = { n: 0 };
  return { t, db: { prepare() { t.n++; throw new Error("LINK_DB touched"); }, batch() { t.n++; throw new Error("LINK_DB touched"); } } };
}
/** A plain main database (the worker schema, no admission layer) for the role writer and the vector suite. */
function plainMainDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  return { sqlite: db, port: entry.port(db) };
}

// ---------- fixed identities ----------
const GUILD = "236932545793490944", APP = "1550176895671341076", LINK_ROLE = "1700000000000000001", BLOCK = "1399774654893133864";
const ROLE_MEMBER = "1549581282227265566", ORIGIN = "https://dnl-gentile.github.io";
const ADMIN = "link-admin-" + "k".repeat(40);
const BOT_TOKEN = "test";
// Test-only values, built so no credential-shaped literal sits in the source (scripts/publication_audit.py).
const VERIFY = ["verify", "test", "secret"].join("-"), WATCHER = ["watcher", "token", "for", "tests", "only", "0123456789"].join("-");
const CLIENT = "client", COOKIE = ["cookie", "secret", "for", "tests", "only", "0123456789"].join("-");
// Made-up Discord sign-ins for the stubbed oauth2/@me, built the same way.
const signin = (...parts) => ["token", "of", ...parts].join("-");
const ANY_SIGNIN = signin("anyone", "0001"), SIGNIN1 = signin("player", "0001"), SIGNIN2 = signin("player", "0002");
const auth = (token, extra = {}) => ({ ...extra, ["Authorization"]: "Bearer " + token });
async function backendKeys() {
  const kp = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const jwk = await subtle.exportKey("jwk", kp.privateKey);
  return { seed: jwk.d, publicHex: Buffer.from(jwk.x, "base64url").toString("hex") };
}
const linkVars = (keys, db, over = {}) => ({
  PRIVACY_NATIVE_ERASURE_ENABLED: "true", LINK_ENABLED: "true", LINK_DB: db, LINK_BACKEND_SEED: keys.seed, LINK_BACKEND_PUBLIC: keys.publicHex,
  LINK_ADMIN_TOKEN: ADMIN, LINK_ORIGIN: ORIGIN, LINK_MODE: "c", LINK_GUILD_POLICY: "verified", LINK_ROLE_ID: LINK_ROLE, ...over,
});

/** Discord's REST and oauth2/@me for the identities above. */
function discordStub({ members = {}, roles = [{ id: LINK_ROLE, permissions: "0", managed: false }], put = 204, del = 204, oauth = {}, throwOn = null } = {}) {
  return (url, init) => {
    const method = init.method || "GET";
    if (throwOn && throwOn(url, method)) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    if (url === "https://discord.com/api/v10/oauth2/@me") {
      const token = String(header(init, "Authorization") || "").replace(/^Bearer /, "");
      const user = oauth[token];
      if (!user) return json(401, { message: "401: Unauthorized", code: 0 });
      return json(200, { application: { id: APP, name: "Olympus" }, scopes: ["identify"], expires: "2030-01-01T00:00:00+00:00", user: { id: user.id, username: user.username, avatar: null, global_name: null } });
    }
    const m = /^https:\/\/discord\.com\/api\/v10\/guilds\/(\d+)\/(members\/(\d+)(\/roles\/(\d+))?|roles)$/.exec(url);
    if (!m || m[1] !== GUILD) return json(404, { code: 10004, message: "Unknown Guild" });
    if (m[2] === "roles") return json(200, roles);
    const id = m[3];
    if (!m[4]) return members[id] ? json(200, { user: { id }, roles: members[id] }) : json(404, { code: 10007, message: "Unknown Member" });
    const status = method === "PUT" ? put : del;
    return typeof status === "number" ? json(status, status === 204 ? null : { code: 0 }) : json(status.status, { code: status.code, message: "x" });
  };
}

// ---------- building a link the way the game does (upstream web/public/core.js buildBundle, reproduced) ----------
async function councillor(core, lenv, keyId, character, owner) {
  const kp = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicHex = Buffer.from(await subtle.exportKey("raw", kp.publicKey)).toString("hex");
  const r = await core.manageKeys(lenv, { key_id: keyId, public_key: publicHex, owner_discord_id: owner, character, kind: "c", bootstrap: true });
  if (r.status !== "ok" || !r.cert) throw new Error("councillor key not registered: " + r.message);
  return { keyId, character, privateKey: kp.privateKey, publicB64: Buffer.from(publicHex, "hex").toString("base64url"), cert: r.cert, certExp: r.cert_exp };
}
async function councillorLink(core, token, requester, issued, c) {
  const R = token.split(".")[1], sig = token.slice(token.lastIndexOf(".") + 1);
  const b = { requester, guild: "Olympus II", faction: "Alliance", nonce: "0123456789abcdef", R };
  b.tag = await core.linkTag(sig, requester);
  const p = { issued, keyId: c.keyId, confirmer: c.character, gv: "r" };
  const s = Buffer.from(await subtle.sign("Ed25519", c.privateKey, Buffer.from(core.signedMessage(b, p), "utf8"))).toString("base64url");
  const proof = [p.issued, p.keyId, p.confirmer, p.gv, s, c.publicB64, "c", c.certExp, c.cert.slice(c.cert.lastIndexOf(".") + 1)].join(",");
  return { R, text: ["OLB5", b.requester, b.guild, b.faction, b.nonce, b.R, b.tag, proof].join("~") };
}

(async () => {
  // ======================================================================================================================
  console.log("== the generator: pristine vendored bytes, exactly P1-P4, drift refused ==");
  const gen = await import(pathToFileURL(path.join(root, "scripts", "build-link-core.mjs")).href);
  const vendorDir = path.join(root, "vendor", "olympus-link");
  check("the three vendored files match their upstream SHA-256 pins (commit d03ea8a9)", gen.vendorProblems(vendorDir).length === 0 && gen.UPSTREAM.commit === "d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2"
    && gen.VENDOR_PINS["link-core.mjs"].sha256 === "53f05c183f96363f696dc6040fd3fb27fd11406f09b7bd908a7f579e72cb0e11"
    && gen.VENDOR_PINS["schema.sql"].sha256 === "a141dc14987bb834004473694e09c363f6a58cebd01952775e0d0099901657c9"
    && gen.VENDOR_PINS.LICENSE.sha256 === "a78bf4300e7768b9cc6d047816efe6a726f64c400e7e1a30d5a559757b892328", gen.vendorProblems(vendorDir));
  const pristine = fs.readFileSync(path.join(vendorDir, "link-core.mjs"), "utf8"), generated = fs.readFileSync(path.join(root, "src", "link-core.ts"), "utf8");
  check("src/link-core.ts equals what the generator writes from the pristine file", gen.generate(pristine) === generated);
  const run = cp.spawnSync(process.execPath, [path.join(root, "scripts", "build-link-core.mjs"), "--check"], { cwd: root, encoding: "utf8" });
  check("npm run check:link-core passes (exit 0) and says the generated file is current", run.status === 0 && /src\/link-core\.ts is current/.test(run.stdout), run.stdout, run.stderr);
  // Run through a directory link (a junction on Windows, a symlink elsewhere): the check must still run, not silently
  // take itself for an import. Only the link is created and removed here, never anything recursive.
  const linkParent = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "link-core-check-")), linkDir = path.join(linkParent, "worker");
  let viaLink = null;
  try {
    fs.symlinkSync(root, linkDir, "junction");
    viaLink = cp.spawnSync(process.execPath, [path.join(linkDir, "scripts", "build-link-core.mjs"), "--check"], { cwd: linkDir, encoding: "utf8" });
  } catch (e) { viaLink = { status: null, stdout: "", stderr: String(e && e.code) }; }
  finally { try { fs.unlinkSync(linkDir); } catch {} try { fs.rmdirSync(linkParent); } catch {} }
  check("  run through a junction or symlink, --check still runs (exit 0, 'is current'), so drift there cannot pass silently", viaLink.status === 0 && /src\/link-core\.ts is current/.test(viaLink.stdout), viaLink.stdout, viaLink.stderr);
  let refused = null;
  try { gen.generate(pristine.replace("CODES_PER_DAY: 3,", "CODES_PER_DAY: 30,")); } catch (e) { refused = e.message; }
  check("  a changed upstream byte is refused by its pin, never patched", /pin mismatch/.test(refused || ""), refused);
  const originalPatches = gen.PATCHES.filter((p) => !/^P[456]\./.test(p.id));
  check("  every original P1-P3 patch is an exact replacement that must match once (1 + 9 + 1)", originalPatches.length === 11 && originalPatches.every((p) => p.count === 1 && pristine.split(p.find).length === 2));
  let patchInput = pristine; const patchCounts = [];
  for (const p of gen.PATCHES) { const found = patchInput.split(p.find).length - 1; patchCounts.push(found === p.count); if (found === p.count) patchInput = patchInput.split(p.find).join(p.replace); }
  check("P4/P5/P6: twenty-two retained P4, five admission and one atomic quota correction follow the original eleven patches; every sequential seam matches once", gen.PATCHES.length === 39 && gen.PATCHES.filter((p) => p.id.startsWith("P4.")).length === 22 && gen.PATCHES.filter((p) => p.id.startsWith("P5.")).length === 5 && gen.PATCHES.filter((p) => p.id.startsWith("P6.")).length === 1 && gen.PATCHES.every((p) => p.count === 1) && patchCounts.every(Boolean));
  const body = generated.slice(gen.HEADER.length);
  let undone = body;
  for (const p of [...gen.PATCHES].reverse()) undone = undone.split(p.replace).join(p.find);
  check("  the generated body is the pristine file with exactly those patches undone (nothing else differs)", undone === pristine);
  check("  the header marks it generated, names the commit, the SHA-256 and the MIT notice, and starts with @ts-nocheck", generated.startsWith("// @ts-nocheck\n// GENERATED by worker/scripts/build-link-core.mjs") && generated.includes("d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2") && generated.includes("MIT License") && generated.includes("import { errorRef } from './log';"));
  check("P1: no env.LINK_DB || env.DB fallback is left; a missing LINK_DB throws link_db_missing", !generated.includes("env.LINK_DB || env.DB") && generated.includes("throw new Error('link_db_missing')"));
  const consoles = generated.match(/console\.(error|warn|log)\([^\n]*/g) || [];
  // Count every console identifier as well as each approved fixed-stage call.
  check("P2/P4/P5: thirteen fixed-stage errorRef calls include finalization, admission, release and caught cleanup, with no hidden console access", consoles.length === 13 && consoles.every((l) => /^console\.error\('olympus-link', '[a-z_]+', errorRef\((e|err)\)\);$/.test(l)) && (body.match(/\bconsole\b/g) || []).length === 13, consoles);
  check("P3: discordUser has no globalThis.fetch default and requires an injected fetchImpl", !body.includes("globalThis.fetch") && body.includes("throw new Error('link_fetch_missing')"));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  check("package.json: build/check scripts, check:link-core in npm test, this suite in test:all", pkg.scripts["build:link-core"] === "node scripts/build-link-core.mjs" && pkg.scripts["check:link-core"] === "node scripts/build-link-core.mjs --check"
    && /&& npm run check:link-core$/.test(pkg.scripts.test) && pkg.scripts["test:all"].includes("node tests/link_integration_186_test.cjs"));

  // ======================================================================================================================
  console.log("\n== static: where link-core is loaded, what the entry exports, what is not touched ==");
  const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");
  const importers = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && f !== "link-core.ts" && /link-core/.test(src(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")));
  check("only link.ts names link-core, and only through import('./link-core') (never a static import)", JSON.stringify(importers) === '["link.ts"]' && !/^\s*import[^\n]*['"]\.\/link-core['"]/m.test(src("link.ts")) && src("link.ts").includes("await import('./link-core')"));
  check("index.ts imports only the two route functions and re-exports nothing from Link", /import \{ linkPreflight, routeLink \} from '\.\/link';/.test(src("index.ts")) && !/export[^\n]*link/i.test(src("index.ts").split("\n").filter((l) => l.startsWith("export")).join("\n")));
  check("link.ts and link-role.ts make no bare fetch and log only through errorRef", ["link.ts", "link-role.ts"].every((f) => !/\bfetch\(/.test(src(f).replace(/fetchImpl|credentialFetch/g, "")) && (src(f).match(/console\.(error|warn|log)\([^\n]*/g) || []).every((l) => /errorRef\(/.test(l))));
  check("nothing in Link adds a scheduled job, a cron or a prune (Phase 1b)", !/scheduled|cron|pruneLink|deferOriginalServing/.test(src("link.ts") + src("link-role.ts")));

  // ======================================================================================================================
  console.log("\n== the gate: off, on, held ==");
  const G = makeLoader(), L = G("./link"), core = G("./link-core");
  const keys = await backendKeys();
  const baseVars = { GUILD_ID: GUILD, DISCORD_APP_ID: APP, DISCORD_BOT_TOKEN: BOT_TOKEN, ROLE_GUILD_MEMBER: ROLE_MEMBER, BLOCKING_ROLE_IDS: BLOCK };
  const fullEnv = (over = {}) => ({ DB: {}, ...baseVars, ...linkVars(keys, linkD1(), over) });
  check("absent, \"\" and \"false\" are off, even with the whole configuration present", L.linkState(baseVars) === "off" && L.linkState(fullEnv({ LINK_ENABLED: undefined })) === "off" && L.linkState(fullEnv({ LINK_ENABLED: "" })) === "off" && L.linkState(fullEnv({ LINK_ENABLED: "false" })) === "off" && (() => { const e = fullEnv(); delete e.LINK_ENABLED; return L.linkState(e) === "off"; })());
  check("exactly \"true\" with the complete configuration is on", L.linkState(fullEnv()) === "on" && L.linkConfigProblem(fullEnv()) === null);
  check("any other value is held: TRUE, 1, yes, ' true', a number", ["TRUE", "1", "yes", " true", "true ", 1, true].every((v) => L.linkState(fullEnv({ LINK_ENABLED: v })) === "held"));
  const accessor = fullEnv(); Object.defineProperty(accessor, "LINK_ENABLED", { get: () => "true", enumerable: true });
  check("  an accessor instead of a value is held", L.linkState(accessor) === "held");
  const partial = [
    ["PRIVACY_NATIVE_ERASURE_ENABLED", undefined, "native_mode"], ["LINK_DB", undefined, "LINK_DB"], ["LINK_DB", { prepare() {} }, "LINK_DB"],
    ["LINK_BACKEND_SEED", undefined, "LINK_BACKEND_SEED"], ["LINK_BACKEND_SEED", "short", "LINK_BACKEND_SEED"],
    ["LINK_BACKEND_PUBLIC", keys.publicHex.toUpperCase(), "LINK_BACKEND_PUBLIC"], ["LINK_BACKEND_PUBLIC", undefined, "LINK_BACKEND_PUBLIC"],
    ["LINK_BACKEND_PREVIOUS", "abc", "LINK_BACKEND_PREVIOUS"], ["LINK_CA_PUBLIC", "nothex", "LINK_CA_PUBLIC"],
    ["LINK_ADMIN_TOKEN", "x".repeat(31), "LINK_ADMIN_TOKEN"], ["LINK_ADMIN_TOKEN", undefined, "LINK_ADMIN_TOKEN"],
    ["LINK_ORIGIN", undefined, "LINK_ORIGIN"], ["LINK_ORIGIN", "http://dnl-gentile.github.io", "LINK_ORIGIN"], ["LINK_ORIGIN", ORIGIN + ", https://x.example/path", "LINK_ORIGIN"], ["LINK_ORIGIN", "", "LINK_ORIGIN"],
    ["LINK_ORIGIN", ORIGIN + ", https://other.example", "LINK_ORIGIN"], ["LINK_ORIGIN", "https://other.example", "LINK_ORIGIN"], ["LINK_ORIGIN", ` ${ORIGIN}`, "LINK_ORIGIN"], ["LINK_ORIGIN", ORIGIN + "/", "LINK_ORIGIN"],
    ["LINK_MODE", "b", "LINK_MODE"], ["LINK_GUILD_POLICY", "open", "LINK_GUILD_POLICY"], ["LINK_SITE_TOKEN", 7, "LINK_SITE_TOKEN"],
    ["GUILD_ID", "x", "GUILD_ID"], ["DISCORD_APP_ID", undefined, "DISCORD_APP_ID"], ["DISCORD_BOT_TOKEN", "", "DISCORD_BOT_TOKEN"],
    ["LINK_ROLE_ID", undefined, "LINK_ROLE_ID"], ["LINK_ROLE_ID", "12345", "LINK_ROLE_ID"],
    ["LINK_ROLE_ID", GUILD, "LINK_ROLE_ID_collision"], ["LINK_ROLE_ID", ROLE_MEMBER, "LINK_ROLE_ID_collision"], ["LINK_ROLE_ID", BLOCK, "LINK_ROLE_ID_collision"],
    ["LINK_ROLE_ID", APP, "LINK_ROLE_ID_collision"], ["LINK_ROLE_ID", G("./beta-reset-policy").BETA_RESET_ROLE_IDS[0], "LINK_ROLE_ID_collision"],
  ];
  const wrong = partial.filter(([k, v, want]) => { const e = fullEnv({ [k]: v }); if (v === undefined) delete e[k]; return L.linkState(e) !== "held" || L.linkConfigProblem(e) !== want; });
  check(`"true" with any one requirement missing or malformed is held, and the problem is named (${partial.length} cases)`, wrong.length === 0, wrong.map((w) => w[0] + "=" + String(w[1])));
  const collide = fullEnv({ FULL_RELEASE_ROLES: JSON.stringify({ native: [LINK_ROLE] }) });
  check("  an id named anywhere in FULL_RELEASE_ROLES or QR_NATIVE_ROLE_MAP collides too", L.linkConfigProblem(collide) === "LINK_ROLE_ID_collision" && L.linkConfigProblem(fullEnv({ QR_NATIVE_ROLE_MAP: `{"roles":["${LINK_ROLE}"]}` })) === "LINK_ROLE_ID_collision" && L.linkConfigProblem(fullEnv({ INTROS_ROLES: `1,${LINK_ROLE}` })) === "LINK_ROLE_ID_collision");
  check("  the optional rotation and council keys pass when well formed", L.linkState(fullEnv({ LINK_BACKEND_PREVIOUS: keys.publicHex, LINK_CA_PUBLIC: `${keys.publicHex}, ${keys.publicHex}`, LINK_COUNCIL_CHARACTERS: "A-B", LINK_SITE_TOKEN: "s" })) === "on");

  console.log("\n== linkEnv: link-core never sees the bot's database ==");
  const mainSpy = { n: 0 }, spyDb = { prepare() { mainSpy.n++; throw new Error("main DB touched"); }, batch() { mainSpy.n++; throw new Error("main DB touched"); } };
  const onEnv = { ...fullEnv(), DB: spyDb };
  const lenv = L.linkEnv(onEnv);
  check("linkEnv has no DB key, is frozen, carries LINK_DB and maps DISCORD_CLIENT_ID from DISCORD_APP_ID", !("DB" in lenv) && Object.isFrozen(lenv) && lenv.LINK_DB === onEnv.LINK_DB && lenv.DISCORD_CLIENT_ID === APP && !("DISCORD_BOT_TOKEN" in lenv) && !("GUILD_ID" in lenv));
  let p1 = null;
  try { await core.issueCode({ DB: spyDb, LINK_BACKEND_SEED: keys.seed, LINK_BACKEND_PUBLIC: keys.publicHex }, { id: "123456789012345678", username: "new.member" }); } catch (e) { p1 = e.message; }
  let p1b = null;
  try { await core.forgetUser({ DB: spyDb }, "123456789012345678"); } catch (e) { p1b = e.message; }
  check("P1 in behaviour: without LINK_DB, issueCode and forgetUser throw link_db_missing and the main DB is never touched", p1 === "link_db_missing" && p1b === "link_db_missing" && mainSpy.n === 0, p1, p1b, mainSpy.n);
  FETCHES = [];
  let p3 = null;
  try { await core.discordUser(ANY_SIGNIN, { clientId: APP }); } catch (e) { p3 = e.message; }
  check("P3 in behaviour: discordUser without an injected fetch throws link_fetch_missing and fetches nothing", p3 === "link_fetch_missing" && FETCHES.length === 0, p3);

  console.log("\n== CORS: link.ts's local copy answers as upstream's, narrowed to the page's origin ==");
  const origins = [ORIGIN, "https://evil.example", "https://dnl-gentile.github.io.evil.example", "http://dnl-gentile.github.io", null, "", "https://link.example.org", "http://x.example"];
  const values = [ORIGIN, `${ORIGIN}, https://link.example.org`, "", undefined, "http://x.example", ` ${ORIGIN} `, "https://link.example.org"];
  const cmp = [];
  let upstreamWider = 0;
  for (const o of origins) for (const v of values) {
    const req = new Request("https://verify.example/proof", { method: "POST", headers: o === null ? {} : { Origin: o } });
    const env = v === undefined ? {} : { LINK_ORIGIN: v };
    const up = core.corsHeaders(req, env);
    if (o !== ORIGIN && up) upstreamWider++;
    if (JSON.stringify(L.linkCors(req, env)) !== JSON.stringify(o === ORIGIN ? up : null)) cmp.push([o, v]);
  }
  check(`linkCors equals upstream corsHeaders for https://dnl-gentile.github.io and is null for every other origin (${origins.length * values.length} origin/configuration pairs; ${upstreamWider} where upstream alone would allow another origin)`, cmp.length === 0 && upstreamWider === 3 && L.LINK_PAGE_ORIGIN === ORIGIN, cmp, upstreamWider);
  check("  with LINK_ORIGIN set as the runbook says, only https://dnl-gentile.github.io gets CORS (exact, no wildcard, no credentials)", origins.filter((o) => L.linkCors(new Request("https://v.example/proof", { headers: o ? { Origin: o } : {} }), { LINK_ORIGIN: ORIGIN })).join() === ORIGIN
    && JSON.stringify(L.linkCors(new Request("https://v.example/proof", { headers: { Origin: ORIGIN } }), { LINK_ORIGIN: ORIGIN })) === JSON.stringify({ "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Authorization, Content-Type", Vary: "Origin" }));

  // ======================================================================================================================
  console.log("\n== the upstream vectors (seeds stripped) through the adapter ==");
  T = 1799990400; // the vectors' "now": a few minutes after their proofs
  check("the vectors fixture is the pinned derivation (SHA-256), with no seed and no token field left in it", sha(vectorsRaw) === VECTORS_SHA256 && !vectorsShippedKeys.some((k) => /^seed/.test(k) || k === "token") && vectors.about.includes("99d1d94978eba85ebdf69b470496576b710745ace841f7adf9f807b7accb4cc5"), sha(vectorsRaw));
  check("Ed25519: every RFC 8032 and shared vector verifies, every must-fail vector fails (link-core ed25519Verify)",
    (await Promise.all(vectors.rfc8032.map((v) => core.ed25519Verify(v.public_hex, Buffer.from(v.signature_hex, "hex"), Buffer.from(v.message_hex, "hex"))))).every(Boolean)
    && (await Promise.all(vectors.ed25519.map((v) => core.ed25519Verify(v.public_hex, Buffer.from(v.signature_hex, "hex"), Buffer.from(v.message_hex, "hex"))))).every(Boolean)
    && (await Promise.all(vectors.rejects.map((v) => core.ed25519Verify(v.public_hex, Buffer.from(v.signature_hex, "hex"), Buffer.from(v.message_hex, "hex"))))).every((x) => x === false));
  check("the backend's code tokens verify with its public key (signature over the payload, the token's signed text)",
    (await Promise.all(vectors.backend.tokens.map((t) => core.ed25519Verify(vectors.backend.public_hex, core.b64urlDecode(t.signature_b64url), new TextEncoder().encode(t.payload))))).every(Boolean)
    && vectors.backend.tokens.every((t) => t.token.startsWith(`OLC2.${t.R}.${t.username}.`)));
  const d = vectors.draw;
  const prefixes = await Promise.all(d.key_ids.map((k) => core.drawPrefix(d.R, k)));
  check("the draw: every key's prefix, and the threshold T and limit M for 5 to 1000 keys", d.key_ids.every((k, i) => prefixes[i] === d.prefix[k])
    && (await Promise.all(d.thresholds.map(async (t) => (await core.thresholdOf(d.R, Array.from({ length: t.n }, (_, i) => `pool${String(i).padStart(4, "0")}`))) === t.T && core.drawLimit(t.n) === t.M))).every(Boolean));
  // LINK_DB loaded the way upstream's own suite loads it: the codes, the keys, and the confirmers' linked characters.
  const vdb = linkD1();
  for (const t of vectors.backend.tokens) await vdb.prepare("INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(t.R, t.discord_id, t.username, t.mode, t.T, t.created, t.exp, t.token, "discord").run();
  for (const k of vectors.keys) await vdb.prepare("INSERT INTO keys (key_id, public_key, owner_discord_id, owner_username, character, kind, bootstrap, created, cert_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(k.key_id, k.public_hex, k.owner_discord_id, k.owner_username, k.character, k.kind, k.bootstrap, k.created, k.cert_exp).run();
  const KEYS = Object.fromEntries(vectors.keys.map((k) => [k.key_id, k]));
  const OWN = { player01: "Other Player-ClassicBetaPvP", player02: "Third Player-ClassicBetaPvP2", player03: "Fourth Player-ClassicBetaPvP", player04: "Fifth Player-ClassicBetaPvP" };
  for (const [id, character] of Object.entries(OWN)) await vdb.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(character, KEYS[id].owner_discord_id, "Olympus Vanguard", "r", "Horde", "0000000000", 1780000000).run();
  const [TOKEN_C, TOKEN_A] = vectors.backend.tokens, [B1, B3, , B2, B5] = vectors.bundles, CK = vectors.council_keys[0];
  const vmain = plainMainDb();
  const venv = { DB: vmain.port, ...baseVars, ...linkVars({ seed: "s".repeat(43), publicHex: vectors.backend.public_hex }, vdb, { LINK_CA_PUBLIC: vectors.council_authority.public_hex, LINK_COUNCIL_CHARACTERS: CK.character }) };
  const vl = L.linkEnv(venv);
  const v1 = await core.checkProof(vl, B1.bundle, { discordId: TOKEN_C.discord_id });
  check("checkProof B1 through linkEnv: one councillor, the guild seen by /who, for @some.player (upstream's exact verdict)", JSON.stringify(v1) === JSON.stringify({ ok: true, status: "ok", already: false, R: B1.R, discordId: TOKEN_C.discord_id, username: "some.player", character: "Some Player-ClassicBetaPvP", guild: "Olympus II", faction: "Alliance", guildCheck: "w", guildKnown: "who", by: "councillor", confirmers: ["Test Councillor-ClassicBetaPvP"], message: "Some Player-ClassicBetaPvP can be linked to @some.player." }), v1);
  const v3 = await core.checkProof(vl, B3.bundle, { discordId: TOKEN_A.discord_id }), v5 = await core.checkProof(vl, B5.bundle, { discordId: TOKEN_C.discord_id });
  check("  B3 three drawn players (roster), B5 the council authority's councillor", v3.ok && v3.by === "players" && v3.guildCheck === "r" && v3.confirmers.length === 3 && v5.ok && v5.by === "councillor" && JSON.stringify(v5.confirmers) === JSON.stringify([CK.character]));
  const refusals = [[B1.bundle, { discordId: TOKEN_A.discord_id }, "other-user"], ["OLB5~nonsense", {}, "format"], [B2.bundle, {}, "guild-unverified"], [B1.bundle.replace(`~${B1.R}~`, "~ZZZZZZZZZZ~"), {}, "unknown-code"]];
  const vr = await Promise.all(refusals.map(([t, o]) => core.checkProof(vl, t, o)));
  check("  refusals keep upstream's reasons: other-user, format, guild-unverified, unknown-code", vr.every((v, i) => v.ok === false && v.status === "rejected" && v.reason === refusals[i][2]), vr.map((v) => v.reason));
  check("  nothing was written by the checks (reading only)", (await vdb.prepare("SELECT COUNT(*) AS n FROM used").first()).n === 0 && (await vdb.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used === null);

  console.log("\n== the role writer, eligibility per the owner's ruling (stubbed Discord, plain main DB) ==");
  const RL = G("./link-role");
  const USER_C = TOKEN_C.discord_id, USER_A = TOKEN_A.discord_id;
  const roleCalls = () => FETCHES.filter((f) => f.url.includes("/roles/" + LINK_ROLE));
  const audits = (action) => vmain.sqlite.prepare("SELECT actor, action, subject, details FROM audit WHERE action = ? ORDER BY id").all(action);
  RL.resetLinkRoleCache(); FETCHES = []; responder = discordStub({ members: { [USER_C]: [], [USER_A]: [BLOCK] } });
  const linked = await core.acceptProof(vl, B1.bundle, { discordId: USER_C, promote: (id) => RL.linkRole(venv, "PUT", id) });
  check("acceptProof B1 with the real linkRole: linked, and exactly one PUT of LINK_ROLE_ID in GUILD_ID with the audit-log reason", linked.status === "linked" && roleCalls().length === 1 && roleCalls()[0].method === "PUT" && roleCalls()[0].url === `https://discord.com/api/v10/guilds/${GUILD}/members/${USER_C}/roles/${LINK_ROLE}` && header(roleCalls()[0].init, "X-Audit-Log-Reason") === encodeURIComponent("olympus-verify: Olympus Link").replace(/%20/g, "%20"), linked);
  check("  every Discord call went through credentialFetch (redirect manual, a deadline signal)", FETCHES.length === 3 && FETCHES.every((f) => f.init.redirect === "manual" && f.init.signal instanceof AbortSignal), FETCHES.map((f) => f.method + " " + f.url));
  check("  the member was read (GUILD_ID) and the role's configuration checked before the PUT", FETCHES[0].url.endsWith(`/guilds/${GUILD}/members/${USER_C}`) && FETCHES[1].url.endsWith(`/guilds/${GUILD}/roles`) && FETCHES[2].method === "PUT");
  // B3: USER_A holds a blocking role.
  FETCHES = [];
  const blockedLink = await core.acceptProof(vl, B3.bundle, { discordId: USER_A, promote: (id) => RL.linkRole(venv, "PUT", id) });
  check("a holder of BLOCKING_ROLE_IDS gets no role: 'discord' (the closest reason upstream can show), no PUT, the link undone", blockedLink.status === "error" && blockedLink.reason === "discord" && roleCalls().length === 0 && (await vdb.prepare("SELECT used FROM codes WHERE r = ?").bind(B3.R).first()).used === null && !(await vdb.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B3.R).first()));
  check("  with one audit row link.promote_refused {why: blocking_role}", audits("link.promote_refused").length === 1 && JSON.parse(audits("link.promote_refused")[0].details).why === "blocking_role" && audits("link.promote_refused")[0].subject === USER_A);
  // banned
  vmain.sqlite.prepare("INSERT INTO members (discord_id, banned) VALUES (?, 1)").run(USER_A);
  FETCHES = [];
  const bannedR = await RL.linkRole(venv, "PUT", USER_A);
  check("a verification-banned account is refused before Discord is asked (no request at all)", bannedR.ok === false && bannedR.reason === "discord" && FETCHES.length === 0 && JSON.parse(audits("link.promote_refused").at(-1).details).why === "banned");
  // inactive privacy subject
  const RETIRING = "300000000000000002";
  vmain.sqlite.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,1,1)").run(RETIRING, "f".repeat(32));
  responder = discordStub({ members: { [RETIRING]: [] } }); FETCHES = [];
  const auditCount = () => vmain.sqlite.prepare("SELECT COUNT(*) AS n FROM audit").get().n;
  const naming = (id) => vmain.sqlite.prepare("SELECT COUNT(*) AS n FROM audit WHERE subject = ? OR instr(COALESCE(details, ''), ?) > 0").get(id, id).n;
  const beforeInactive = auditCount();
  const inactive = await RL.linkRole(venv, "PUT", RETIRING);
  check("a privacy subject that is not active (retiring) is refused before Discord is asked, and no audit row names it", inactive.ok === false && inactive.reason === "discord" && FETCHES.length === 0 && auditCount() === beforeInactive && naming(RETIRING) === 0);
  check("  the banned refusal's row carries audit()'s privacy reference (the house fence), the subject and why only", (() => { const det = JSON.parse(audits("link.promote_refused").at(-1).details); return det.why === "banned" && JSON.stringify(det._privacySubjectIds) === JSON.stringify([USER_A]) && Object.keys(det).sort().join() === "_privacySubjectIds,why"; })());
  const ACTIVE = "300000000000000003";
  vmain.sqlite.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,1,1)").run(ACTIVE, "e".repeat(32));
  responder = discordStub({ members: { [ACTIVE]: [] } }); FETCHES = [];
  check("  an active subject (and one with no privacy row at all, B1 above) is granted", (await RL.linkRole(venv, "PUT", ACTIVE)).ok === true);
  // not in the server
  const ABSENT = "300000000000000004";
  responder = discordStub({ members: {} }); FETCHES = [];
  const absent = await RL.linkRole(venv, "PUT", ABSENT);
  check("a member absent from GUILD_ID answers 'not-in-server' and no PUT is sent", absent.ok === false && absent.reason === "not-in-server" && roleCalls().length === 0);
  // the same through acceptProof: upstream's own words for it, and the code stays usable
  const vdb2 = linkD1();
  for (const t of vectors.backend.tokens) await vdb2.prepare("INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(t.R, t.discord_id, t.username, t.mode, t.T, t.created, t.exp, t.token, "discord").run();
  for (const k of vectors.keys) await vdb2.prepare("INSERT INTO keys (key_id, public_key, owner_discord_id, owner_username, character, kind, bootstrap, created, cert_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(k.key_id, k.public_hex, k.owner_discord_id, k.owner_username, k.character, k.kind, k.bootstrap, k.created, k.cert_exp).run();
  const venv2 = { ...venv, LINK_DB: vdb2 };
  const notIn = await core.acceptProof(L.linkEnv(venv2), B1.bundle, { discordId: USER_C, promote: (id) => RL.linkRole(venv2, "PUT", id) });
  check("  through acceptProof: rejected 'not-in-server' (\"Join the Olympus Discord server first\"), code unused, nothing recorded", notIn.status === "rejected" && notIn.reason === "not-in-server" && /Join the Olympus Discord server first/.test(notIn.message) && (await vdb2.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used === null && !(await vdb2.prepare("SELECT 1 AS x FROM members").first()));
  LOGS.length = 0;
  const thrown = await core.acceptProof(L.linkEnv(venv2), B1.bundle, { discordId: USER_C, promote: async () => { throw new Error(`Discord 500 for ${USER_C} ${B1.R}`); } });
  check("P2 in behaviour: a promote() that throws with an id and a code in its message logs only the fixed stage", thrown.reason === "discord" && LOGS.length === 1 && LOGS[0] === "olympus-link promote error", LOGS);
  // the role's own configuration
  RL.resetLinkRoleCache();
  for (const [roles, problem] of [[[{ id: LINK_ROLE, permissions: "8", managed: false }], "permissions"], [[{ id: LINK_ROLE, permissions: "0", managed: true }], "managed"], [[], "missing"]]) {
    responder = discordStub({ members: { [ACTIVE]: [] }, roles }); FETCHES = [];
    const r = await RL.linkRole(venv, "PUT", ACTIVE);
    check(`a Link role with ${problem} fails closed: no PUT, one link.role_misconfigured row that names no player (a server fault)`, r.ok === false && r.reason === "discord" && roleCalls().length === 0 && JSON.parse(audits("link.role_misconfigured").at(-1).details).problem === problem && audits("link.role_misconfigured").at(-1).subject === null && !audits("link.role_misconfigured").at(-1).details.includes(ACTIVE));
  }
  RL.resetLinkRoleCache();
  // Discord's answers to the write itself
  const outcome = async (method, status, over = {}) => { responder = discordStub({ members: { [ACTIVE]: [LINK_ROLE] }, [method === "PUT" ? "put" : "del"]: status, ...over }); FETCHES = []; return RL.linkRole(venv, method, ACTIVE); };
  const before429 = performance.now(), r429 = await outcome("PUT", { status: 429, code: 0 }), after429 = performance.now();
  check("PUT 429 answers 'discord' at once: no sleeping retry, one PUT, and an audit row with status and code only (plus the privacy reference)", r429.ok === false && r429.reason === "discord" && roleCalls().length === 1 && after429 - before429 < 900 && (() => { const row = audits("link.role_failed").at(-1); const det = JSON.parse(row.details); return row.subject === ACTIVE && det.method === "PUT" && det.status === 429 && Object.keys(det).sort().join() === "_privacySubjectIds,code,method,status" && JSON.stringify(det._privacySubjectIds) === JSON.stringify([ACTIVE]); })());
  check("PUT 403/50013 answers 'discord'", (await outcome("PUT", { status: 403, code: 50013 })).reason === "discord" && JSON.parse(audits("link.role_failed").at(-1).details).code === 50013);
  check("PUT 404/10007 (left meanwhile) answers 'not-in-server'", (await outcome("PUT", { status: 404, code: 10007 })).reason === "not-in-server");
  check("DELETE 204 is ok; DELETE 404/10011 (the role itself was deleted) is ok too; DELETE 403 is 'discord'", (await outcome("DELETE", 204)).ok === true && (await outcome("DELETE", { status: 404, code: 10011 })).ok === true && (await outcome("DELETE", { status: 403, code: 50013 })).reason === "discord");
  check("DELETE skips eligibility: a banned account's own delete still goes out", await (async () => { responder = discordStub({ members: { [USER_A]: [LINK_ROLE] } }); FETCHES = []; const r = await RL.linkRole(venv, "DELETE", USER_A); return r.ok && roleCalls().length === 1 && roleCalls()[0].method === "DELETE"; })());
  const timeoutPut = await outcome("PUT", 204, { throwOn: (u, m) => m === "PUT" });
  check("a PUT with no HTTP status (timeout) is reconciled by one GET and never sent again: the role is there, so ok", timeoutPut.ok === true && roleCalls().length === 1 && FETCHES.at(-1).method === "GET");
  responder = discordStub({ members: { [ACTIVE]: [] }, throwOn: (u, m) => m === "PUT" }); FETCHES = [];
  const timeoutMissing = await RL.linkRole(venv, "PUT", ACTIVE);
  check("  and when the GET shows no role, 'discord' with a link.role_unconfirmed row", timeoutMissing.ok === false && timeoutMissing.reason === "discord" && audits("link.role_unconfirmed").length === 1);
  responder = discordStub({ members: { [ACTIVE]: [] }, throwOn: (u, m) => m === "DELETE" }); FETCHES = [];
  const beforeUnknownDelete = audits("link.role_unconfirmed").length;
  const timeoutDelete = await RL.linkRole(venv, "DELETE", ACTIVE);
  check(".194 a DELETE transport timeout remains unconfirmed even when the role is absent: one DELETE, no blind retry and an unconfirmed audit",
    timeoutDelete.ok === false && timeoutDelete.reason === "discord" && roleCalls().length === 1 && roleCalls()[0].method === "DELETE"
    && audits("link.role_unconfirmed").length === beforeUnknownDelete + 1
    && JSON.parse(audits("link.role_unconfirmed").at(-1).details).method === "DELETE", timeoutDelete);
  for (const status of [400, 401, 403, 404, 405, 429]) {
    const denied = await outcome("DELETE", { status, code: 0 });
    check(`.194 DELETE HTTP ${status} is a definite non-application marker after exactly one request`,
      denied.ok === false && denied.reason === "discord" && denied.notApplied === true && roleCalls().length === 1 && roleCalls()[0].method === "DELETE", denied);
  }
  for (const status of [500, 503]) {
    const unknown = await outcome("DELETE", { status, code: 0 });
    check(`.194 DELETE HTTP ${status} remains an unconfirmed outcome with no non-application marker or retry`,
      unknown.ok === false && unknown.reason === "discord" && unknown.notApplied !== true && roleCalls().length === 1, unknown);
  }
  const deniedPut = await outcome("PUT", { status: 403, code: 50013 });
  check(".194 definite DELETE non-application metadata does not change a refused PUT or give it the removal marker",
    deniedPut.ok === false && deniedPut.reason === "discord" && deniedPut.notApplied !== true && roleCalls().length === 1 && roleCalls()[0].method === "PUT", deniedPut);
  for (const spec of [
    { name: "off", env: { ...venv, LINK_ENABLED: "false" }, id: ACTIVE },
    { name: "held", env: { ...venv, LINK_ENABLED: "TRUE" }, id: ACTIVE },
    { name: "invalid adapter snowflake", env: venv, id: "12345" },
  ]) {
    FETCHES = [];
    const deletion = await RL.linkRole(spec.env, "DELETE", spec.id), put = await RL.linkRole(spec.env, "PUT", spec.id);
    check(`.194 ${spec.name} adapter preflight sends no HTTP: DELETE certifies non-application, while PUT remains a plain refusal`,
      deletion.ok === false && deletion.reason === "discord" && deletion.notApplied === true && put.ok === false && put.reason === "discord" && put.notApplied !== true && FETCHES.length === 0,
      deletion, put, FETCHES.length);
  }
  // The role's configuration: cached ten minutes, and looked at again right after a failed PUT.
  RL.resetLinkRoleCache();
  const roleListGets = () => FETCHES.filter((f) => f.url.endsWith(`/guilds/${GUILD}/roles`)).length;
  const cacheTrace = [];
  for (const status of [204, 204, { status: 403, code: 50013 }, 204]) { await outcome("PUT", status); cacheTrace.push(roleListGets()); }
  check("the role check is cached (no second GET of the roles), and dropped as soon as a PUT fails (the next promote looks again)", cacheTrace.join() === "1,0,0,1", cacheTrace);
  // An erased account (privacy subject retired): no audit row may name it, whatever happens.
  const RETIRED = "300000000000000005";
  vmain.sqlite.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until) VALUES(?,?,'retired',2,1,1,1,1+31622400)").run(RETIRED, "d".repeat(32));
  const beforeRetired = auditCount();
  responder = discordStub({ members: { [RETIRED]: [LINK_ROLE] }, del: { status: 403, code: 50013 } }); FETCHES = [];
  const retiredPut = await RL.linkRole(venv, "PUT", RETIRED);
  const retiredPutFetches = FETCHES.length;
  const retiredDel = await RL.linkRole(venv, "DELETE", RETIRED);
  const retiredDeleteSent = roleCalls().filter((f) => f.method === "DELETE").length;
  responder = discordStub({ members: { [RETIRED]: [LINK_ROLE] }, throwOn: (u, m) => m === "DELETE" || (m === "GET" && u.includes(`/members/${RETIRED}`)) }); FETCHES = [];
  const retiredUnconfirmed = await RL.linkRole(venv, "DELETE", RETIRED);
  check("a retired subject: the PUT is refused and the DELETE still goes out, but neither the refusal nor a failed DELETE (403, or a timeout whose confirming GET fails) writes a row naming it",
    retiredPut.ok === false && retiredPutFetches === 0 && retiredDel.reason === "discord" && retiredDeleteSent === 1 && retiredUnconfirmed.reason === "discord" && auditCount() === beforeRetired && naming(RETIRED) === 0, auditCount() - beforeRetired);
  // Erased between the read and the write: audit() re-checks the generation at the INSERT, so the row is dropped.
  const RACE = "300000000000000006";
  vmain.sqlite.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,1,1)").run(RACE, "c".repeat(32));
  const raceStub = discordStub({ members: { [RACE]: [] }, put: { status: 403, code: 50013 } });
  responder = (u, init) => { if ((init.method || "GET") === "PUT") vmain.sqlite.prepare("UPDATE privacy_subjects SET state = 'retired', revision = 2, erased_at = ?2, retain_until = ?2 + 31622400 WHERE subject_id = ?1").run(RACE, T); return raceStub(u, init); };
  FETCHES = [];
  const raced = await RL.linkRole(venv, "PUT", RACE);
  check("  a subject erased while the PUT was in flight gets no row either (the INSERT is fenced on the captured generation)", raced.reason === "discord" && roleCalls().length === 1 && naming(RACE) === 0);
  responder = discordStub({ members: { [ACTIVE]: [LINK_ROLE] }, del: { status: 403, code: 50013 } }); FETCHES = [];
  const activeDel = await RL.linkRole(venv, "DELETE", ACTIVE);
  check("  while an active subject's failed DELETE is still audited, with the reference", activeDel.reason === "discord" && (() => { const row = audits("link.role_failed").at(-1); const det = JSON.parse(row.details); return row.subject === ACTIVE && det.method === "DELETE" && JSON.stringify(det._privacySubjectIds) === JSON.stringify([ACTIVE]); })());
  FETCHES = [];
  check("the writer refuses while Link is off or held, and for a malformed id, without any request", (await RL.linkRole({ ...venv, LINK_ENABLED: "false" }, "PUT", ACTIVE)).ok === false && (await RL.linkRole({ ...venv, LINK_ENABLED: "TRUE" }, "PUT", ACTIVE)).ok === false && (await RL.linkRole(venv, "PUT", "12; DROP")).ok === false && FETCHES.length === 0);
  check("no audit row or log line holds a message, token or code: details are fixed fields", vmain.sqlite.prepare("SELECT details FROM audit WHERE action LIKE 'link.%'").all().every((r) => !/Unknown|message|Bearer|OLC2|OLB5/.test(r.details)));
  responder = null;

  // ======================================================================================================================
  console.log("\n== /verify: flag OFF is byte-identical to .185, flag ON appends the code last ==");
  T = 1790600000;
  // The .185 interactions.ts is this file without the .186 import and the two appendLinkBlock wrappers; its digest is
  // pinned, so this can only ever reconstruct the exact .185 bytes (and proves those are the only edits).
  const current = src("interactions.ts");
  const IMPORT = 'import { appendLinkBlock } from "./link"; // .186: the Olympus Link code, last in the two code replies; off, the very same string\n';
  const OPEN = "return reply(await appendLinkBlock(env, user,\n", CLOSE = '].join("\\n")),\n  );';
  const baselineSource = current.split(IMPORT).join("").split(OPEN).join("return reply(\n").split(CLOSE).join('].join("\\n"),\n  );');
  check("interactions.ts differs from .185 only by the import and the two wrappers (the rebuilt .185 file matches its pinned SHA-256)",
    current.split(IMPORT).length === 2 && current.split(OPEN).length === 3 && current.split(CLOSE).length === 3 && sha(baselineSource) === "7aaa95ef988728269747c704a2ea9552c205a3ca9ebdbb6655489e1d03419ff5", sha(baselineSource));
  const verifyStubs = { "./review": { onVerified: async () => {}, approvePending: async () => ({}), denyPending: async () => ({}) }, "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} } };
  const A = "111111111111111111", B = "222222222222222222", C = "333333333333333333", D = "444444444444444444";
  const NAMES = { [A]: "anna.member", [B]: "bert_member", [C]: "cara.member", [D]: "dora.member" };
  const user = (id) => ({ user: { id, username: NAMES[id] }, roles: [] });
  async function verifyWorld({ baseline = false, extra = {} } = {}) {
    reseed(424242); uuid = 0;
    const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); entry.installCurrentEntryEpoch(db);
    const trace = [];
    const port = entry.originalNativePort(db, { statement(sql, params) { trace.push(JSON.stringify([sql, params])); } });
    const load = makeLoader({ stubs: verifyStubs, overrides: baseline ? { interactions: baselineSource } : {} });
    const DB = load("./privacy-write-admission").createPrivacyWriteAdmissionDatabase(port, "writer", "canonical", entry.ENTRY_EPOCH);
    const env = { DB, GUILD_ID: GUILD, DISCORD_APP_ID: APP, DISCORD_BOT_TOKEN: BOT_TOKEN, VERIFY_SECRET: VERIFY, ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROLE_GUILD_MEMBER: ROLE_MEMBER, BLOCKING_ROLE_IDS: BLOCK, CHANNEL_VISITOR_CHAT: "", PRIVACY_NATIVE_ERASURE_ENABLED: "true", ...extra };
    const { handleInteraction } = load("./interactions");
    await load("./relays").recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
    await DB.prepare("INSERT INTO members (discord_id, banned) VALUES (?1, 1)").bind(D).run();
    const guide = load("./guide");
    const steps = [
      ["button A", { type: 3, guild_id: GUILD, data: { custom_id: guide.GUIDE_VERIFY }, member: user(A) }],
      ["button A again", { type: 3, guild_id: GUILD, data: { custom_id: guide.GUIDE_VERIFY }, member: user(A) }],
      ["/verify A", { type: 2, guild_id: GUILD, data: { name: "verify", options: [] }, member: user(A) }],
      ["/verify B Thrall", { type: 2, guild_id: GUILD, data: { name: "verify", options: [{ name: "character", type: 3, value: "Thrall" }] }, member: user(B) }],
      ["modal C Jaina", { type: 5, guild_id: GUILD, data: { custom_id: guide.GUIDE_MODAL, components: [{ type: 1, components: [{ type: 4, custom_id: guide.GUIDE_FIELD, value: "Jaina" }] }] }, member: user(C) }],
      ["button D banned", { type: 3, guild_id: GUILD, data: { custom_id: guide.GUIDE_VERIFY }, member: user(D) }],
    ];
    const out = [];
    for (const [name, i] of steps) {
      const mark = trace.length;
      const res = await handleInteraction(env, i);
      out.push({ name, status: res.status, body: await res.text(), trace: trace.slice(mark) });
    }
    return { out, env, load };
  }
  const base = await verifyWorld({ baseline: true });
  check("the .185 world answers every step (codes, the modal, the banned account)", base.out.length === 6 && base.out.every((s) => s.status === 200) && /Your code: `[A-Z2-9]{7}`/.test(JSON.parse(base.out[0].body).data.content) && /cannot verify/.test(JSON.parse(base.out[5].body).data.content));
  const same = (world) => world.out.every((s, i) => s.body === base.out[i].body && s.status === base.out[i].status && JSON.stringify(s.trace) === JSON.stringify(base.out[i].trace));
  const firstDiff = (world) => { const i = world.out.findIndex((s, k) => s.body !== base.out[k].body || JSON.stringify(s.trace) !== JSON.stringify(base.out[k].trace)); return i < 0 ? null : { step: base.out[i].name, body: world.out[i].body.slice(0, 300), base: base.out[i].body.slice(0, 300) }; };
  for (const [label, extra] of [["no LINK_* at all", {}], ["LINK_ENABLED \"false\" with the whole configuration", null], ["LINK_ENABLED \"\" with the whole configuration", ""], ["LINK_ENABLED absent with the whole configuration", undefined]]) {
    const trap = trapD1();
    const vars = extra === null ? linkVars(keys, trap.db, { LINK_ENABLED: "false" }) : extra === "" ? linkVars(keys, trap.db, { LINK_ENABLED: "" }) : extra === undefined ? (() => { const v = linkVars(keys, trap.db); delete v.LINK_ENABLED; return v; })() : {};
    const w = await verifyWorld({ extra: vars });
    check(`OFF (${label}): every reply and every main-database statement is byte-identical to .185, and LINK_DB is never touched`, same(w) && trap.t.n === 0, firstDiff(w), trap.t.n);
  }
  LOGS.length = 0;
  for (const value of ["TRUE", "1"]) {
    const trap = trapD1();
    const w = await verifyWorld({ extra: linkVars(keys, trap.db, { LINK_ENABLED: value }) });
    check(`HELD (LINK_ENABLED "${value}"): the replies and statements are .185's, LINK_DB untouched`, same(w) && trap.t.n === 0, firstDiff(w));
  }
  check("  each held world logged one fixed line naming the flag, nothing else", LOGS.length === 2 && LOGS.every((l) => l === "olympus-link held verify LINK_ENABLED error"), LOGS);
  const trapHeld = trapD1();
  LOGS.length = 0;
  const heldPartial = await verifyWorld({ extra: linkVars(keys, trapHeld.db, { LINK_ROLE_ID: undefined }) });
  check("HELD (\"true\" without LINK_ROLE_ID): the same; five held presses log one fixed line naming the missing setting, nothing else", same(heldPartial) && trapHeld.t.n === 0 && LOGS.length === 1 && LOGS[0] === "olympus-link held verify LINK_ROLE_ID error", LOGS.slice(0, 3));
  const LH = makeLoader()("./link"), heldVerifyEnv = fullEnv({ LINK_ROLE_ID: undefined });
  LOGS.length = 0;
  for (let i = 0; i < 5; i++) await LH.appendLinkBlock(heldVerifyEnv, { id: A, username: "anna.member" }, "r");
  const heldFirstMinute = LOGS.length;
  T += 61; await LH.appendLinkBlock(heldVerifyEnv, { id: A, username: "anna.member" }, "r"); T -= 61;
  check("  a held configuration logs at most one line a minute per isolate (a flood of held requests is no flood of log lines)", heldFirstMinute === 1 && LOGS.length === 2, heldFirstMinute, LOGS.length);

  // ON
  const ldb = linkD1();
  const on = await verifyWorld({ extra: linkVars(keys, ldb) });
  const text = (s) => JSON.parse(s.body).data.content;
  const blockOf = (s, b) => text(s).slice(text(b).length);
  const codeSteps = [0, 1, 2, 3, 4];
  check("ON: each code reply is the .185 reply byte for byte, then a blank line, then the Link block (last)", codeSteps.every((i) => text(on.out[i]).startsWith(text(base.out[i]) + "\n\nYour Olympus Link code. Paste this line in the WoW chat")), codeSteps.map((i) => blockOf(on.out[i], base.out[i]).slice(0, 80)));
  check("  the ephemeral flag and allowed_mentions are unchanged", codeSteps.every((i) => { const a = JSON.parse(on.out[i].body).data, b = JSON.parse(base.out[i].body).data; return a.flags === b.flags && JSON.stringify(a.allowed_mentions) === JSON.stringify(b.allowed_mentions) && JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b)); }));
  check("  the Link code adds no statement to the bot's database: every main-database statement equals .185's", on.out.every((s, i) => JSON.stringify(s.trace) === JSON.stringify(base.out[i].trace)), (() => { for (let i = 0; i < on.out.length; i++) { const a = on.out[i].trace, b = base.out[i].trace; if (JSON.stringify(a) !== JSON.stringify(b)) { const k = a.findIndex((x, j) => x !== b[j]); return { step: base.out[i].name, lengths: [a.length, b.length], k, on: (a[k] || "").slice(0, 400), base: (b[k] || "").slice(0, 400) }; } } return null; })());
  const tokenOf = (s) => (/\/oly discord (OLC2\.\S+)/.exec(text(s)) || [])[1];
  const tA = tokenOf(on.out[0]);
  const parts = tA ? tA.split(".") : [];
  check("  the code is upstream's OLC2 token for this member's username, signed with LINK_BACKEND_SEED (verifies with the public key)", !!tA && parts[0] === "OLC2" && tA.includes(".anna.member.") && await core.ed25519Verify(keys.publicHex, core.b64urlDecode(tA.slice(tA.lastIndexOf(".") + 1)), new TextEncoder().encode(tA.slice(0, tA.lastIndexOf(".")))));
  check("  pressing again (and /verify) shows the same code: one LINK_DB code for A", tokenOf(on.out[1]) === tA && tokenOf(on.out[2]) === tA && ldb.sqlite.prepare("SELECT COUNT(*) AS n FROM codes WHERE discord_id = ?").get(A).n === 1);
  check("  B (/verify Thrall) and C (the old modal) get codes of their own", !!tokenOf(on.out[3]) && tokenOf(on.out[3]).includes(".bert_member.") && !!tokenOf(on.out[4]) && tokenOf(on.out[4]) !== tA);
  check("  a verification-banned account gets no Link code: the .185 refusal, nothing in LINK_DB", on.out[5].body === base.out[5].body && ldb.sqlite.prepare("SELECT COUNT(*) AS n FROM codes WHERE discord_id = ?").get(D).n === 0);
  check("  the stored code carries source 'discord'", ldb.sqlite.prepare("SELECT source FROM codes WHERE discord_id = ?").get(A).source === "discord");
  // isolation
  const iso = async (label, db, extraVars = {}) => {
    LOGS.length = 0;
    const w = await verifyWorld({ extra: linkVars(keys, db, extraVars) });
    check(`ON but ${label}: the member still gets the unchanged .185 reply, and each of the five code presses logs one errorRef line`, w.out.every((s, i) => s.body === base.out[i].body) && LOGS.length === 5 && LOGS.every((l) => /^olympus-link code not issued [a-z0-9]+(\(\d{3}\))?$/.test(l)), firstDiff(w), LOGS);
  };
  await iso("LINK_DB down", { prepare() { throw new Error("D1_ERROR: network 123456789012345678"); }, batch() { throw new Error("D1_ERROR"); } });
  const other = await backendKeys();
  await iso("a seed that does not match its public key", linkD1(), { LINK_BACKEND_PUBLIC: other.publicHex });
  const full = linkD1(); full.batch = async () => { throw new Error("UNIQUE constraint failed: codes.r"); };
  await iso("no free code could be drawn (\"could not draw a free code\")", full);
  // upstream's own refusals as the block
  const LA = G("./link");
  const limitDb = linkD1();
  const limitEnv = { ...fullEnv(), LINK_DB: limitDb };
  const one = await LA.appendLinkBlock(limitEnv, { id: A, username: "Old Name" }, "whisper reply");
  check("  a legacy username gets upstream's \"change your username\" line next to the unchanged reply", one === "whisper reply\n\nYour Discord username cannot be used in a code. Change it to the new style (lowercase, no #1234) and try again.", one);
  for (let i = 0; i < 3; i++) { await LA.appendLinkBlock(limitEnv, { id: A, username: "anna.member" }, "r"); limitDb.sqlite.prepare("UPDATE codes SET used = 1").run(); }
  const limited = await LA.appendLinkBlock(limitEnv, { id: A, username: "anna.member" }, "whisper reply");
  check("  past three codes a day: upstream's limit line", limited === "whisper reply\n\nYou already got 3 codes today: use the last one, or try again tomorrow.", limited);
  const withBlock = async (len) => LA.appendLinkBlock({ ...fullEnv(), LINK_DB: linkD1() }, { id: B, username: "bert_member" }, "x".repeat(len));
  const blockLen = (await withBlock(10)).length - 12;
  const atLimit = await withBlock(L.LINK_REPLY_MAX - 2 - blockLen), overLimit = await withBlock(L.LINK_REPLY_MAX - 1 - blockLen);
  check(`  the ${L.LINK_REPLY_MAX}-character guard: exactly ${L.LINK_REPLY_MAX} keeps the block, one more drops it whole (never split or cut)`, L.LINK_REPLY_MAX === 1990 && blockLen > 400 && atLimit.length === 1990 && overLimit === "x".repeat(L.LINK_REPLY_MAX - 1 - blockLen), blockLen, atLimit.length, overLimit.length);
  check("  appendLinkBlock never throws, even for an env that throws on every read", await LA.appendLinkBlock(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("boom"); } }), { id: A }, "kept") === "kept");
  const noName = await LA.appendLinkBlock({ ...fullEnv(), LINK_DB: linkD1() }, { id: B }, "whisper reply");
  check("  an interaction user with no username gets upstream's username line, never a code for \"undefined\"", noName === "whisper reply\n\nYour Discord username cannot be used in a code. Change it to the new style (lowercase, no #1234) and try again.", noName);
  const never = () => new Promise(() => {});
  const hangingDb = { prepare: () => ({ bind: () => ({ first: never, all: never, run: never }) }), batch: never };
  LOGS.length = 0;
  const deadlineStart = performance.now();
  const late = await LA.appendLinkBlock({ ...fullEnv(), LINK_DB: hangingDb }, { id: B, username: "bert_member" }, "whisper reply");
  const waited = performance.now() - deadlineStart;
  check(`  a LINK_DB that never answers: after ${L.LINK_CODE_DEADLINE_MS} ms the unchanged reply and one 'timeout' line (the 3 s interaction deadline is kept)`, late === "whisper reply" && L.LINK_CODE_DEADLINE_MS === 1200 && waited >= 1100 && waited < 2500 && LOGS.length === 1 && LOGS[0] === "olympus-link code not issued timeout", Math.round(waited), LOGS);

  // ======================================================================================================================
  console.log("\n== P6: concurrent issuance admits at most three codes and charges only committed admissions ==");
  const quotaClock = T, quotaFetches = FETCHES.length, quotaRandom = globalThis.crypto.getRandomValues;
  let quotaDraws = 0, forceQuotaDraw = null;
  globalThis.crypto.getRandomValues = (arr) => {
    if (arr.byteLength === 10) { quotaDraws++; if (forceQuotaDraw) return forceQuotaDraw(arr); }
    return quotaRandom(arr);
  };
  const quotaUser = (username = "quota.player") => ({ id: "500000000000000199", username });
  const quotaWorld = () => { const db = linkD1(); return { db, env: L.linkEnv({ ...baseVars, ...linkVars(keys, db) }) }; };
  const quotaRows = (w) => w.db.sqlite.prepare("SELECT * FROM codes ORDER BY r").all();
  const quotaCounters = (w) => w.db.sqlite.prepare("SELECT * FROM limits ORDER BY k").all();
  const quotaSnapshot = (w) => JSON.stringify([quotaRows(w), quotaCounters(w)]);
  const quotaDenied = (a) => a && a.ok === false && a.reason === "limit" && !["token", "command", "R", "T"].some((k) => k in a) && !JSON.stringify(a).includes("OLC2.");
  const quotaWait = async (promise) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("quota regression barrier exceeded 5000 ms")), 5000); })]); }
    finally { clearTimeout(timer); }
  };
  const quotaSeed = async (w, count) => {
    for (let i = 0; i < count; i++) {
      const a = await core.issueCode(w.env, quotaUser("quota.seed" + i));
      if (!a.ok) throw new Error("quota seed unexpectedly refused");
      w.db.sqlite.prepare("UPDATE codes SET used = 1 WHERE r = ?").run(a.R);
    }
  };
  // Hold each real batch before BEGIN, after every caller has performed its stale fast-path reads.
  // Release one entire batch at a time: overlapping SQLite BEGIN would test the shim, not D1 admission.
  const quotaConcurrent = async (w, users) => {
    const rawBatch = w.db.batch, gates = [], events = [];
    let allArrived;
    const arrived = new Promise((resolve) => { allArrived = resolve; });
    w.db.batch = async (statements) => {
      if (statements.length !== 2 || !/^INSERT INTO codes\b/.test(statements[0].sql)) throw new Error("unexpected quota batch");
      const index = gates.length;
      let release, done;
      const held = new Promise((resolve) => { release = resolve; }), committed = new Promise((resolve) => { done = resolve; });
      gates.push({ release, committed }); events.push(["arrived", index]);
      if (gates.length === users.length) allArrived();
      await held;
      try { const r = await rawBatch(statements); events.push(["committed", index, r.map((x) => x.meta.changes)]); return r; }
      finally { done(); }
    };
    const work = users.map((u) => core.issueCode(w.env, u).then((answer) => ({ answer }), (error) => ({ error })));
    try {
      await quotaWait(arrived);
      const before = { rows: quotaRows(w).length, counters: quotaCounters(w), waiting: gates.length };
      for (let i = 0; i < gates.length; i++) { events.push(["release", i]); gates[i].release(); await quotaWait(gates[i].committed); }
      const results = await quotaWait(Promise.all(work));
      return { before, results, events, admitted: results.filter((r) => r.answer && r.answer.ok), denied: results.filter((r) => quotaDenied(r.answer)) };
    } finally { w.db.batch = rawBatch; }
  };
  try {
    for (const sameName of [true, false]) {
      const w = quotaWorld(), start = quotaDraws;
      const raced = await quotaConcurrent(w, Array.from({ length: 5 }, (_, i) => quotaUser(sameName ? "quota.player" : "quota.player" + i)));
      const rows = quotaRows(w), counters = quotaCounters(w);
      check(`P6 atomic quota (${sameName ? "same" : "different"} username): five callers finish their initial reads before any batch, then exactly three distinct codes persist and only three admissions are charged`,
        raced.before.waiting === 5 && raced.before.rows === 0 && raced.before.counters.length === 0 && raced.admitted.length === 3 && raced.denied.length === 2
        && new Set(raced.admitted.map((r) => r.answer.R)).size === 3 && rows.length === 3 && counters.length === 1 && counters[0].n === 3
        && raced.admitted.every((r) => rows.some((row) => row.token === r.answer.token)) && quotaDraws - start === 5
        && raced.events.slice(0, 5).every((e) => e[0] === "arrived") && raced.events.filter((e) => e[0] === "committed").map((e) => e[2].join("/")).join(",") === "1/1,1/1,1/1,0/0,0/0",
        raced.events, rows.length, counters.map((c) => c.n));
      check(`P6 atomic quota (${sameName ? "same" : "different"} username): both losing responses contain no code, command or random draw; no automatic batch retry`,
        raced.denied.length === 2 && raced.results.every((r) => !r.error) && raced.events.filter((e) => e[0] === "arrived").length === 5);
    }
    const rowOnly = quotaWorld(); await quotaSeed(rowOnly, 2);
    rowOnly.db.sqlite.prepare("UPDATE limits SET n = 0 WHERE k LIKE 'code:%'").run(); // Deliberate fixture disagreement: test the independent code-row predicate.
    const rowRace = await quotaConcurrent(rowOnly, Array.from({ length: 5 }, (_, i) => quotaUser("quota.rows" + i)));
    check("P6 code-row quota is atomic even when a stale day counter says zero: two existing codes leave only one of five concurrent admissions",
      rowRace.before.rows === 2 && rowRace.before.counters[0].n === 0 && rowRace.admitted.length === 1 && rowRace.denied.length === 4 && quotaRows(rowOnly).length === 3 && quotaCounters(rowOnly)[0].n === 1);
    const dayOnly = quotaWorld(); await quotaSeed(dayOnly, 2); await core.forgetUser(dayOnly.env, quotaUser().id);
    const dayRace = await quotaConcurrent(dayOnly, Array.from({ length: 5 }, (_, i) => quotaUser("quota.day" + i)));
    check("P6 retained day quota is atomic after actual forgetUser removes code rows: the two prior admissions leave only one new admission",
      dayRace.before.rows === 0 && dayRace.before.counters[0].n === 2 && dayRace.admitted.length === 1 && dayRace.denied.length === 4 && quotaRows(dayOnly).length === 1 && quotaCounters(dayOnly)[0].n === 3);
    const reset = quotaWorld(); await quotaSeed(reset, 3);
    const firstUntil = quotaCounters(reset)[0].until, resetBefore = quotaSnapshot(reset), resetDraws = quotaDraws;
    T = firstUntil - 1;
    const beforeReset = await core.issueCode(reset.env, quotaUser("quota.reset"));
    check("P6 one second before the daily boundary: refusal contains no code and does not draw or mutate either quota", quotaDenied(beforeReset) && quotaSnapshot(reset) === resetBefore && quotaDraws === resetDraws);
    T = firstUntil;
    const atReset = await core.issueCode(reset.env, quotaUser("quota.reset"));
    check("P6 at the exact daily boundary: strict rolling-day and expired-counter predicates admit one code and reset the counter to one",
      atReset.ok === true && quotaRows(reset).length === 4 && quotaCounters(reset)[0].n === 1 && quotaCounters(reset)[0].until === T + 86400 && quotaDraws === resetDraws + 1);
    T = quotaClock;
    const reuse = quotaWorld(); await quotaSeed(reuse, 2);
    const reusable = await core.issueCode(reuse.env, quotaUser()), reuseBefore = quotaSnapshot(reuse), reuseDraws = quotaDraws;
    const reuseBatch = reuse.db.batch; let reuseBatches = 0;
    reuse.db.batch = async (list) => { reuseBatches++; return reuseBatch(list); };
    const reused = await core.issueCode(reuse.env, quotaUser());
    check("P6 a still-reusable code at the full quota returns that exact token, expiry, command and reply without another random draw, batch or quota charge",
      reused.ok === true && ["token", "exp", "mode", "command", "reply"].every((k) => reused[k] === reusable[k]) && quotaDraws === reuseDraws && reuseBatches === 0 && quotaSnapshot(reuse) === reuseBefore);
    reuse.db.sqlite.prepare("UPDATE codes SET used = 1").run();
    const deniedBefore = quotaSnapshot(reuse), deniedDraws = quotaDraws;
    const denied = await core.issueCode(reuse.env, quotaUser("quota.denied"));
    check("P6 a sequential code-row denial returns no token and leaves all code/counter rows unchanged without any draw or batch", quotaDenied(denied) && quotaDraws === deniedDraws && reuseBatches === 0 && quotaSnapshot(reuse) === deniedBefore);
    await core.forgetUser(reuse.env, quotaUser().id);
    reuseBatches = 0; // The separately invoked maintenance batch is not an issuance attempt.
    const retainedBefore = quotaSnapshot(reuse), retainedDenied = await core.issueCode(reuse.env, quotaUser("quota.denied"));
    check("P6 a sequential retained-counter denial after forgetting also has no code, mutation, random draw or batch", quotaDenied(retainedDenied) && quotaRows(reuse).length === 0 && quotaCounters(reuse)[0].n === 3 && quotaSnapshot(reuse) === retainedBefore && quotaDraws === deniedDraws && reuseBatches === 0);

    const collision = quotaWorld(), otherQuotaUser = { id: "500000000000000299", username: "quota.other" };
    forceQuotaDraw = (arr) => { arr.fill(0); return arr; };
    const occupied = await core.issueCode(collision.env, otherQuotaUser);
    forceQuotaDraw = null;
    const occupiedBefore = quotaSnapshot(collision), collisionDraws = quotaDraws, rawCollisionBatch = collision.db.batch;
    let collisionBatches = 0, rolledBack = false;
    forceQuotaDraw = (arr) => { if (quotaDraws === collisionDraws + 1) { arr.fill(0); return arr; } return quotaRandom(arr); };
    collision.db.batch = async (list) => {
      collisionBatches++;
      try { return await rawCollisionBatch(list); }
      catch (e) { rolledBack = /UNIQUE constraint failed: codes.r/.test(e.message) && quotaSnapshot(collision) === occupiedBefore; throw e; }
    };
    const afterCollision = await core.issueCode(collision.env, quotaUser());
    forceQuotaDraw = null;
    check("P6 a real duplicate-R SQLite constraint rolls back both statements before one fresh retry: existing account unchanged, new account charged exactly once",
      occupied.ok && afterCollision.ok && occupied.R !== afterCollision.R && rolledBack && collisionBatches === 2 && quotaDraws === collisionDraws + 2
      && quotaRows(collision).length === 2 && quotaCounters(collision).length === 2 && quotaCounters(collision).every((c) => c.n === 1));
    const exhaustedBefore = quotaSnapshot(collision), exhaustedDraws = quotaDraws, exhaustedBatches = collisionBatches;
    forceQuotaDraw = (arr) => { arr.fill(0); return arr; };
    let exhaustedError = "";
    try { await core.issueCode(collision.env, { id: "500000000000000399", username: "quota.exhausted" }); } catch (e) { exhaustedError = e.message; }
    forceQuotaDraw = null;
    check("P6 five real R collisions exhaust only the original bounded retry loop: no issued response or quota mutation", exhaustedError === "could not draw a free code" && quotaDraws === exhaustedDraws + 5 && collisionBatches === exhaustedBatches + 5 && quotaSnapshot(collision) === exhaustedBefore);

    for (const mode of ["unknown-before", "unknown-after", "not-array", "missing-meta", "failed-step", "mixed-one-zero", "mixed-zero-one", "invalid-count"]) {
      const w = quotaWorld(), raw = w.db.batch, start = quotaDraws;
      let batches = 0, answer, failure = "";
      w.db.batch = async (list) => {
        batches++;
        if (mode === "unknown-before") throw new Error("D1_ERROR: acknowledgement unavailable before commit");
        const actual = await raw(list);
        if (mode === "unknown-after") throw new Error("D1_ERROR: acknowledgement lost after commit");
        if (mode === "not-array") return undefined;
        if (mode === "missing-meta") return [{ success: true }, actual[1]];
        if (mode === "failed-step") return [{ ...actual[0], success: false }, actual[1]];
        if (mode === "mixed-one-zero") return [actual[0], { success: true, meta: { changes: 0 } }];
        if (mode === "mixed-zero-one") return [{ success: true, meta: { changes: 0 } }, actual[1]];
        return [{ success: true, meta: { changes: 2 } }, actual[1]];
      };
      try { answer = await core.issueCode(w.env, quotaUser()); } catch (e) { failure = e.message; }
      const committed = mode !== "unknown-before", rows = quotaRows(w), counters = quotaCounters(w);
      check(`P6 ${mode}: an unknown or malformed batch acknowledgement returns no token and never automatically resends the issuance`,
        answer === undefined && failure.length > 0 && batches === 1 && quotaDraws === start + 1 && rows.length === Number(committed) && counters.length === Number(committed) && (!committed || counters[0].n === 1));
      w.db.batch = async (list) => { batches++; return raw(list); };
      const laterDraws = quotaDraws, later = await core.issueCode(w.env, quotaUser());
      check(`P6 ${mode}: only a separately requested later call proceeds; it reuses any committed code without drawing or charging again`,
        later.ok === true && quotaRows(w).length === 1 && quotaCounters(w)[0].n === 1
        && (committed ? later.token === rows[0].token && batches === 1 && quotaDraws === laterDraws : batches === 2 && quotaDraws === laterDraws + 1));
    }
    check("P6 real core/SQLite quota regressions make no Discord or other HTTP request", FETCHES.length === quotaFetches);
  } finally { T = quotaClock; forceQuotaDraw = null; globalThis.crypto.getRandomValues = quotaRandom; }

  // ======================================================================================================================
  console.log("\n== routes: OFF gives today's 404, ON serves the bot host only ==");
  T = 1790700000;
  const R = makeLoader(), index = R("./index").default, RL2 = R("./link-role"), core2 = R("./link-core"), L2 = R("./link");
  const rdb = new DatabaseSync(":memory:"); rdb.exec("PRAGMA foreign_keys = ON"); entry.installCurrentEntryEpoch(rdb);
  let mainStatements = [];
  const rport = entry.originalNativePort(rdb, { statement(sql) { mainStatements.push(sql); } });
  const admission = R("./privacy-write-admission").createPrivacyWriteAdmissionDatabase(rport, "writer", "canonical", entry.ENTRY_EPOCH);
  const routeEnv = (over = {}) => entry.currentEntryEnvironment({
    DB: rport, GUILD_ID: GUILD, DISCORD_APP_ID: APP, DISCORD_PUBLIC_KEY: "00", DISCORD_BOT_TOKEN: BOT_TOKEN, DISCORD_CLIENT_SECRET: CLIENT, COOKIE_SECRET: COOKIE,
    VERIFY_SECRET: VERIFY, WATCHER_TOKEN: WATCHER, PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example",
    SITE_GUILD_ID: GUILD, SITE_ADMINS: "472099715253796864", ADMISSION_MODE: "auto", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "",
    ROLE_GUILD_MEMBER: ROLE_MEMBER, BLOCKING_ROLE_IDS: BLOCK, PRIVACY_NATIVE_ERASURE_ENABLED: "true",
    ASSETS: { fetch: async (req) => new Response(`/* asset ${new URL(req.url).pathname} */`, { status: 200, headers: { "Content-Type": "text/css" } }) },
    ...over,
  });
  const ctx = { waitUntil: () => {} };
  let ipN = 0;
  const call = async (url, env, init = {}) => {
    mainStatements = [];
    const headers = { "CF-Connecting-IP": `198.51.100.${(ipN++ % 250) + 1}`, ...(init.headers || {}) };
    const res = await index.fetch(new Request(url, { ...init, headers }), env, ctx);
    return { res, status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers), statements: mainStatements.slice() };
  };
  const control = await call("https://verify.example/no-such-route-186", routeEnv(), { method: "POST", body: "{}" });
  check("(control) an unknown bot path is today's 404 \"not found\"", control.status === 404 && control.text === "not found");
  const offTrap = trapD1();
  for (const [label, env] of [["no LINK_*", routeEnv()], ["LINK_ENABLED \"false\" + full config", routeEnv({ ...linkVars(keys, offTrap.db, { LINK_ENABLED: "false" }) })]]) {
    const results = [];
    for (const [method, p, bodyText] of [["POST", "/proof", JSON.stringify({ text: "OLB5~x", discordToken: ANY_SIGNIN })], ["OPTIONS", "/proof", undefined], ["GET", "/proof", undefined], ["POST", "/api/link/keys", "{}"]]) {
      const r = await call("https://verify.example" + p, env, { method, body: bodyText, headers: auth(ADMIN, { Origin: ORIGIN }) });
      const c = await call("https://verify.example/no-such-route-186", env, { method, body: bodyText, headers: auth(ADMIN, { Origin: ORIGIN }) });
      results.push(r.status === c.status && r.text === c.text && JSON.stringify(r.headers) === JSON.stringify(c.headers) && JSON.stringify(r.statements) === JSON.stringify(c.statements));
    }
    check(`OFF (${label}): OPTIONS/POST/GET /proof and POST /api/link/keys are today's 404, byte for byte, with the same main-database statements as any unknown path`, results.every(Boolean) && offTrap.t.n === 0, results);
  }
  // ON
  const rl = linkD1();
  const onRoute = (over = {}) => routeEnv(linkVars(keys, rl, over));
  const pre = await call("https://verify.example/proof", onRoute(), { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  check("ON: OPTIONS /proof from https://dnl-gentile.github.io is 204 with upstream's CORS and Max-Age 600, before any database statement", pre.status === 204 && pre.text === "" && pre.headers["access-control-allow-origin"] === ORIGIN && pre.headers["access-control-allow-methods"] === "POST" && pre.headers["access-control-allow-headers"] === "Authorization, Content-Type" && pre.headers["access-control-max-age"] === "600" && pre.headers.vary === "Origin" && !pre.headers["access-control-allow-credentials"] && pre.statements.length === 0, pre);
  const preCalls = rl.calls.n;
  const evil = [];
  for (const o of ["https://evil.example", "https://dnl-gentile.github.io.evil.example", "http://dnl-gentile.github.io", null]) {
    const r = await call("https://verify.example/proof", onRoute(), { method: "OPTIONS", headers: o ? { Origin: o } : {} });
    evil.push(r.status === 403 && !r.headers["access-control-allow-origin"] && r.headers.vary === "Origin" && r.statements.length === 0);
  }
  check("  any other origin (or none) is 403 with Vary: Origin and no CORS, and no database is touched", evil.every(Boolean) && rl.calls.n === preCalls, evil);
  FETCHES = []; responder = discordStub();
  const evilPost = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: "OLB5~x", discordToken: ANY_SIGNIN }), headers: { Origin: "https://evil.example", "Content-Type": "application/json" } });
  check("  POST /proof from another origin: 403 'origin', no CORS, Discord never asked", evilPost.status === 403 && JSON.parse(evilPost.text).reason === "origin" && !evilPost.headers["access-control-allow-origin"] && FETCHES.length === 0);
  let foreignPulled = false;
  const foreignBody = () => new ReadableStream({ pull(c) { foreignPulled = true; c.enqueue(new TextEncoder().encode("{}")); c.close(); } }, { highWaterMark: 0 });
  const FOREIGN_IP = "203.0.113.50", foreign = [];
  for (let i = 0; i < 21; i++) {
    const r = await index.fetch(new Request("https://verify.example/proof", { method: "POST", body: foreignBody(), duplex: "half", headers: { Origin: "https://evil.example", "CF-Connecting-IP": FOREIGN_IP } }), onRoute(), ctx);
    foreign.push(r.status === 403 && (await r.json()).reason === "origin" && !r.headers.get("Access-Control-Allow-Origin"));
  }
  const afterForeign = await index.fetch(new Request("https://verify.example/proof", { method: "POST", body: "{}", headers: { Origin: ORIGIN, "CF-Connecting-IP": FOREIGN_IP } }), onRoute(), ctx);
  check("  21 POSTs /proof from another origin are refused before anything else: no body read, and they count for nothing (the page's next POST from that address is not limited)", foreign.every(Boolean) && foreignPulled === false && afterForeign.status === 400 && (await afterForeign.json()).reason === "format", foreign.filter((x) => !x).length, afterForeign.status);
  const getProof = await call("https://verify.example/proof", onRoute(), { method: "GET", headers: { Origin: ORIGIN } });
  check("  GET /proof: upstream's 405 'method'", getProof.status === 405 && JSON.parse(getProof.text).reason === "method");
  const siteProof = await call("https://guild.example/proof", onRoute(), { method: "OPTIONS", headers: { Origin: ORIGIN } });
  const siteOff = await call("https://guild.example/proof", routeEnv(), { method: "OPTIONS", headers: { Origin: ORIGIN } });
  check("  the site host never serves Link: OPTIONS /proof there answers exactly as with Link off", siteProof.status === siteOff.status && siteProof.text === siteOff.text && !siteProof.headers["access-control-allow-origin"]);
  const siteKeys = await call("https://guild.example/api/link/keys", onRoute(), { method: "POST", body: "{}", headers: auth(ADMIN) });
  const siteKeysOff = await call("https://guild.example/api/link/keys", routeEnv(), { method: "POST", body: "{}", headers: auth(ADMIN) });
  check("  nor POST /api/link/keys", siteKeys.status === siteKeysOff.status && siteKeys.text === siteKeysOff.text);
  const shared = [];
  for (const [method, p, bodyText] of [["OPTIONS", "/proof", undefined], ["POST", "/proof", JSON.stringify({ text: "OLB5~x", discordToken: ANY_SIGNIN })], ["POST", "/api/link/keys", "{}"]]) {
    const onShared = await call("https://verify.example" + p, onRoute({ SITE_HOST: "verify.example" }), { method, body: bodyText, headers: auth(ADMIN, { Origin: ORIGIN }) });
    const offShared = await call("https://verify.example" + p, routeEnv({ SITE_HOST: "verify.example" }), { method, body: bodyText, headers: auth(ADMIN, { Origin: ORIGIN }) });
    shared.push(onShared.status === offShared.status && onShared.text === offShared.text && !onShared.headers["access-control-allow-origin"]);
  }
  check("  a shared-host deployment (SITE_HOST equal to the bot's host) serves no Link: OPTIONS/POST /proof and POST /api/link/keys answer exactly as with Link off", shared.every(Boolean), shared);

  console.log("\n== ON: issue, prove, forget through POST /proof ==");
  const PLAYER = "555555555555555555", PLAYER2 = "666666666666666666", COUNCIL_OWNER = "100000000000000001";
  const OAUTH = { [SIGNIN1]: { id: PLAYER, username: "some.player" }, [SIGNIN2]: { id: PLAYER2, username: "other.player" } };
  const rlenv = L2.linkEnv(onRoute());
  const cnc = await councillor(core2, rlenv, "olycouncil1", "Test Councillor-ClassicBetaPvP", COUNCIL_OWNER);
  const code1 = await core2.issueCode(rlenv, { id: PLAYER, username: "some.player" });
  const link1 = await councillorLink(core2, code1.token, "Some Player-ClassicBetaPvP", T - 20, cnc);
  RL2.resetLinkRoleCache(); FETCHES = []; responder = discordStub({ members: { [PLAYER]: [] }, oauth: OAUTH });
  const proved = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link1.text, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN, "Content-Type": "application/json" } });
  const pj = JSON.parse(proved.text);
  check("POST /proof: the link and the player's sign-in link the character, with CORS, and the page never gets the Discord id", proved.status === 200 && pj.status === "linked" && pj.reason === "linked" && pj.character === "Some Player-ClassicBetaPvP" && pj.discordId === undefined && !proved.text.includes(PLAYER) && proved.headers["access-control-allow-origin"] === ORIGIN, pj);
  check("  Discord was asked through credentialFetch: oauth2/@me (redirect manual), the member, the role, then one PUT of LINK_ROLE_ID in GUILD_ID",
    FETCHES.map((f) => f.method + " " + f.url.replace("https://discord.com/api/v10", "")).join(" | ") === `GET /oauth2/@me | GET /guilds/${GUILD}/members/${PLAYER} | GET /guilds/${GUILD}/roles | PUT /guilds/${GUILD}/members/${PLAYER}/roles/${LINK_ROLE}` && FETCHES.every((f) => f.init.redirect === "manual" && f.init.signal instanceof AbortSignal), FETCHES.map((f) => f.method + " " + f.url));
  check("  LINK_DB recorded the link; the bot's database got one read (eligibility) and no write", rl.sqlite.prepare("SELECT discord_id FROM members WHERE character = ?").get("Some Player-ClassicBetaPvP")?.discord_id === PLAYER && proved.statements.filter((s) => /privacy_subjects WHERE subject_id = \?1\) AS state/.test(s)).length === 1 && !proved.statements.some((s) => /^\s*INSERT INTO audit/i.test(s)));
  const again = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link1.text, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } });
  check("  the same link again: 'already', no second PUT", JSON.parse(again.text).reason === "already" && FETCHES.filter((f) => f.method === "PUT").length === 1);
  // not in the server
  const code2 = await core2.issueCode(rlenv, { id: PLAYER2, username: "other.player" });
  const link2 = await councillorLink(core2, code2.token, "Other Char-ClassicBetaPvP", T - 10, cnc);
  responder = discordStub({ members: { [PLAYER]: [LINK_ROLE] }, oauth: OAUTH }); FETCHES = [];
  const notInServer = JSON.parse((await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link2.text, discordToken: SIGNIN2 }), headers: { Origin: ORIGIN } })).text);
  check("a player not in GUILD_ID: rejected 'not-in-server', no PUT, the code stays unused", notInServer.status === "rejected" && notInServer.reason === "not-in-server" && !FETCHES.some((f) => f.method === "PUT") && rl.sqlite.prepare("SELECT used FROM codes WHERE r = ?").get(link2.R).used === null);
  // banned, through the route (written through the admission layer, as the bot writes it)
  await admission.prepare("INSERT INTO members (discord_id, banned) VALUES (?1, 1)").bind(PLAYER2).run();
  responder = discordStub({ members: { [PLAYER2]: [] }, oauth: OAUTH }); FETCHES = [];
  const bannedRoute = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link2.text, discordToken: SIGNIN2 }), headers: { Origin: ORIGIN } });
  check("a verification-banned player: 'discord' (closest upstream reason), no member read, no PUT, an audit row through the bot's own audit()", JSON.parse(bannedRoute.text).reason === "discord" && FETCHES.map((f) => f.url).join() === "https://discord.com/api/v10/oauth2/@me" && bannedRoute.statements.some((s) => /^\s*INSERT INTO audit/i.test(s)) && rdb.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'link.promote_refused' AND subject = ?").get(PLAYER2).n === 1);
  // forget
  // .195: one DELETE before the guarded deletion and one after it commits (a role PUT may land between them); the first
  // still finds the member recorded, the second finds it gone. (.194 checked exactly one DELETE here.)
  const forgetStub = discordStub({ members: { [PLAYER]: [LINK_ROLE] }, oauth: OAUTH }), membersAtDelete = [];
  responder = (u, init) => { if ((init.method || "GET") === "DELETE") membersAtDelete.push(rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n); return forgetStub(u, init); };
  FETCHES = [];
  const forgot = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } });
  const fj = JSON.parse(forgot.text);
  check("\"Delete my link\": demote first, then link-core forgets the account's Link rows, then demotes once more (two DELETEs of LINK_ROLE_ID, around the deletion)", forgot.status === 200 && fj.status === "forgotten" && JSON.stringify(fj.characters) === JSON.stringify(["Some Player-ClassicBetaPvP"]) && FETCHES.filter((f) => f.method === "DELETE").length === 2 && FETCHES.filter((f) => f.method === "DELETE").every((f) => f.url.endsWith(`/members/${PLAYER}/roles/${LINK_ROLE}`)) && membersAtDelete.join() === "1,0"
    && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n === 0 && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM codes WHERE discord_id = ?").get(PLAYER).n === 0 && fj.discordId === undefined, fj, membersAtDelete);
  const code3 = await core2.issueCode(rlenv, { id: PLAYER, username: "some.player" });
  const link3 = await councillorLink(core2, code3.token, "Some Player-ClassicBetaPvP", T - 5, cnc);
  responder = discordStub({ members: { [PLAYER]: [] }, oauth: OAUTH });
  await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link3.text, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } });
  responder = discordStub({ members: { [PLAYER]: [LINK_ROLE] }, oauth: OAUTH, del: { status: 403, code: 50013 } }); FETCHES = [];
  const keptLink = JSON.parse((await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } })).text);
  check("  definite Discord403 releases only deletion admission, preserves the link and allows a later explicit retry without an automatic DELETE", keptLink.reason === "discord" && /try again/i.test(keptLink.message) && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n === 1
    && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM limits WHERE k = ?").get(`delete:${sha(`olympus-link-delete~${PLAYER}`)}`).n === 0 && FETCHES.filter((f) => f.method === "DELETE").length === 1);
  // .195 review round 1: a player who left the server. Discord answers each role DELETE 404/10007 (Unknown Member), which
  // the role writer reads as not-in-server, and neither removal holds the deletion back.
  responder = discordStub({ members: {}, oauth: OAUTH, del: { status: 404, code: 10007 } }); FETCHES = [];
  const departed = JSON.parse((await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } })).text);
  const departedDeletes = FETCHES.filter((f) => f.method === "DELETE" && f.url.endsWith(`/members/${PLAYER}/roles/${LINK_ROLE}`)).length;
  FETCHES = [];
  const departedAgain = JSON.parse((await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } })).text);
  check("  a player who left the server (both DELETEs 404/10007, not-in-server): forgotten with the character in its exact words, two DELETEs, no row left; pressing again is forgotten with none",
    departed.status === "forgotten" && JSON.stringify(departed.characters) === JSON.stringify(["Some Player-ClassicBetaPvP"])
    && departed.message === "Some Player-ClassicBetaPvP: no longer linked. Nothing is kept about this Discord account but how many codes and links it used today, until that day's limit ends." && departedDeletes === 2
    && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n === 0 && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM codes WHERE discord_id = ?").get(PLAYER).n === 0
    && departedAgain.status === "forgotten" && JSON.stringify(departedAgain.characters) === "[]" && FETCHES.filter((f) => f.method === "DELETE").length === 2, departed, departedDeletes, departedAgain);
  // limits, body cap, schema
  const big = await call("https://verify.example/proof", onRoute(), { method: "POST", body: "x".repeat(17 * 1024), headers: { Origin: ORIGIN } });
  check("a body over 16 KiB is 413 'format' with CORS, unread past the cap", big.status === 413 && JSON.parse(big.text).reason === "format" && big.headers["access-control-allow-origin"] === ORIGIN);
  let limit = null;
  for (let i = 0; i < 21; i++) limit = await index.fetch(new Request("https://verify.example/proof", { method: "POST", body: "{}", headers: { Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.7" } }), onRoute(), ctx);
  check("the in-memory first filter: the 21st POST /proof in a minute from one address is 429 'limit' with CORS and Retry-After", limit.status === 429 && (await limit.json()).reason === "limit" && limit.headers.get("Access-Control-Allow-Origin") === ORIGIN && limit.headers.get("Retry-After") === "60");
  const v6 = [];
  for (let i = 1; i <= 21; i++) v6.push((await index.fetch(new Request("https://verify.example/proof", { method: "POST", body: "{}", headers: { Origin: ORIGIN, "CF-Connecting-IP": `2001:db8:abcd:12::${i.toString(16)}` } }), onRoute(), ctx)).status);
  const next64 = (await index.fetch(new Request("https://verify.example/proof", { method: "POST", body: "{}", headers: { Origin: ORIGIN, "CF-Connecting-IP": "2001:db8:abcd:13::1" } }), onRoute(), ctx)).status;
  check("  it counts an IPv6 address by its /64, as upstream's own limit does: 21 addresses of one /64 share one limit, the next /64 is someone else", v6.slice(0, 20).every((s) => s === 400) && v6[20] === 429 && next64 === 400, v6.join(), next64);
  const sameNet = ["2001:0db8:0001:0002:0000:0000:0000:0001", "2001:DB8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2:a:b:c:d", "2001:db8:1:2::1"].map(L2.linkAddressKey);
  check("  linkAddressKey groups as upstream's limitAddress: every form of one /64 is one key, ::ffff:a.b.c.d is a.b.c.d, an IPv4 address is itself",
    new Set(sameNet).size === 1 && sameNet[0] === "2001:db8:1:2::/64" && L2.linkAddressKey("::ffff:198.51.100.9") === "198.51.100.9" && L2.linkAddressKey("::FFFF:c633:6409") === "198.51.100.9"
    && L2.linkAddressKey("198.51.100.9") === "198.51.100.9" && L2.linkAddressKey("2001:db8:1:3::1") === "2001:db8:1:3::/64" && L2.linkAddressKey("") === "?" && L2.linkAddressKey("1:2:3") === "?1:2:3", sameNet);
  const notReady = await L2.routeLink(new Request("https://verify.example/proof", { method: "POST", body: "{}", headers: { Origin: ORIGIN } }), onRoute(), "/proof", false);
  check("before the bot's schema is ready, POST /proof is 503 with CORS (the eligibility checks read it)", notReady.status === 503 && notReady.headers.get("Access-Control-Allow-Origin") === ORIGIN);

  console.log("\n== ON: POST /api/link/keys ==");
  let pulled = false;
  const streamBody = () => new ReadableStream({ pull(c) { pulled = true; c.enqueue(new TextEncoder().encode("{}")); c.close(); } }, { highWaterMark: 0 });
  const noBearer = await index.fetch(new Request("https://verify.example/api/link/keys", { method: "POST", body: streamBody(), duplex: "half", headers: { "CF-Connecting-IP": "192.0.2.10" } }), onRoute(), ctx);
  check("no bearer: 401 'auth', and the body is never read", noBearer.status === 401 && (await noBearer.json()).reason === "auth" && pulled === false);
  pulled = false;
  const wrongs = [];
  for (const b of [ADMIN.slice(0, -1), ADMIN + "x", "k".repeat(ADMIN.length), "Bearer"]) {
    const r = await index.fetch(new Request("https://verify.example/api/link/keys", { method: "POST", body: streamBody(), duplex: "half", headers: auth(b, { "CF-Connecting-IP": "192.0.2.11" }) }), onRoute(), ctx);
    wrongs.push(r.status === 401);
  }
  check("  a wrong bearer (one character short, one long, same length, empty): 401, body unread", wrongs.every(Boolean) && pulled === false);
  const sameSecret = src("link-core.ts").match(/export async function sameSecret[\s\S]*?\n}\n/)?.[0] || "", adminAuth = src("link-core.ts").match(/export async function adminAuthorized[\s\S]*?\n}\n/)?.[0] || "";
  check("  the compare is upstream's constant-time one: SHA-256 of both, XOR over every byte, no early exit; tokens under 32 characters never pass", /crypto\.subtle\.digest\('SHA-256'/.test(sameSecret) && /for \(let i = 0; i < x\.length; i\+\+\) diff \|= x\[i\] \^ y\[i\];/.test(sameSecret) && !/return false;\n\s*}\s*\n\s*return/.test(sameSecret.split("diff")[1] || "") && /LINK_ADMIN_TOKEN\.length < 32/.test(adminAuth) && /sameSecret\(bearer\(request\), env\.LINK_ADMIN_TOKEN\)/.test(adminAuth));
  const kp2 = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pubHex2 = Buffer.from(await subtle.exportKey("raw", kp2.publicKey)).toString("hex");
  const reg = await index.fetch(new Request("https://verify.example/api/link/keys", { method: "POST", body: JSON.stringify({ key_id: "olycouncil2", public_key: pubHex2, owner_discord_id: "100000000000000002", character: "Other Councillor-ClassicBetaPvP", kind: "c", bootstrap: true }), headers: auth(ADMIN, { "CF-Connecting-IP": "192.0.2.12" }) }), onRoute(), ctx);
  const rj = await reg.json();
  check("the right bearer registers a councillor key: 200 with its certificate and the /oly discord cert line", reg.status === 200 && rj.status === "ok" && rj.key_id === "olycouncil2" && typeof rj.cert === "string" && rj.command === `/oly discord cert ${rj.cert}` && rl.sqlite.prepare("SELECT kind FROM keys WHERE key_id = ?").get("olycouncil2")?.kind === "c");
  const bigKeys = await index.fetch(new Request("https://verify.example/api/link/keys", { method: "POST", body: "x".repeat(5000), headers: auth(ADMIN, { "CF-Connecting-IP": "192.0.2.13" }) }), onRoute(), ctx);
  check("  a body over 4 KiB with the right bearer: 413, nothing registered", bigKeys.status === 413);
  const getKeys = await index.fetch(new Request("https://verify.example/api/link/keys", { headers: auth(ADMIN, { "CF-Connecting-IP": "192.0.2.14" }) }), onRoute(), ctx);
  check("  GET: 405 'method'", getKeys.status === 405 && (await getKeys.json()).reason === "method");
  const adminPath = await call("https://verify.example/admin/api/link/keys", onRoute(), { method: "POST", body: "{}", headers: auth(ADMIN) });
  check("  the route is never under /admin/ (that prefix wants WATCHER_TOKEN): /admin/api/link/keys is 401 there", adminPath.status === 401);

  console.log("\n== HELD routes ==");
  const heldTrap = trapD1();
  const heldEnv = routeEnv(linkVars(keys, heldTrap.db, { LINK_ENABLED: "TRUE" }));
  const hp = await call("https://verify.example/proof", heldEnv, { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } });
  const hpEvil = await call("https://verify.example/proof", heldEnv, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  const hpost = await call("https://verify.example/proof", heldEnv, { method: "POST", body: "{}", headers: { Origin: ORIGIN } });
  const hkeys = await call("https://verify.example/api/link/keys", heldEnv, { method: "POST", body: "{}", headers: auth(ADMIN) });
  check("held: the preflight answers as when on (204 with CORS for the page, 403 for another origin), so the browser sends the POST and the page can read its 503",
    hp.status === 204 && hp.text === "" && hp.headers["access-control-allow-origin"] === ORIGIN && hp.headers["access-control-max-age"] === "600" && hp.statements.length === 0 && hpEvil.status === 403 && !hpEvil.headers["access-control-allow-origin"], hp.status, hpEvil.status);
  check("  POST /proof is 503 'server' (\"not available right now\") with CORS for the page, POST /api/link/keys 503, LINK_DB never touched", hpost.status === 503 && JSON.parse(hpost.text).reason === "server" && /not available right now/.test(JSON.parse(hpost.text).message) && hpost.headers["access-control-allow-origin"] === ORIGIN && hkeys.status === 503 && !hkeys.headers["access-control-allow-origin"] && heldTrap.t.n === 0);
  const heldWide = routeEnv(linkVars(keys, heldTrap.db, { LINK_ORIGIN: `${ORIGIN}, https://evil.example` }));
  const wideState = R("./link").linkState(heldWide);
  const widePre = await call("https://verify.example/proof", heldWide, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  const widePost = await call("https://verify.example/proof", heldWide, { method: "POST", body: "{}", headers: { Origin: "https://evil.example" } });
  check("  a LINK_ORIGIN that lists another origin holds Link, and that origin still gets no CORS (preflight 403, POST 503 without it)", wideState === "held" && widePre.status === 403 && !widePre.headers["access-control-allow-origin"] && widePost.status === 503 && !widePost.headers["access-control-allow-origin"] && heldTrap.t.n === 0);

  // ======================================================================================================================
  console.log("\n== upstream's own seedless D1 cases (web/test/link-core.test.mjs), ported: link-core through linkEnv ==");
  T = 1799990400;
  const UP_SIGNIN = { [signin("some", "player", "0001")]: { id: USER_C, username: "some.player" }, [signin("tester", "two", "00002")]: { id: USER_A, username: "tester.two" } };
  const upCalls = [];
  const upFetch = async (url, init) => {
    upCalls.push(String(url));
    const u = UP_SIGNIN[String(init.headers.Authorization).replace(/^Bearer /, "")];
    if (!u) return json(401, { message: "401: Unauthorized", code: 0 });
    return json(200, { application: { id: APP, name: "Olympus" }, scopes: ["identify"], expires: "2030-01-01T00:00:00+00:00", user: { id: u.id, username: u.username, avatar: null, global_name: "X" } });
  };
  /** upstream's setup(): the vectors' codes and keys, and the confirmers' own characters, in a fresh LINK_DB. */
  async function seeded(over = {}) {
    const db = linkD1();
    for (const t of vectors.backend.tokens) await db.prepare("INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(t.R, t.discord_id, t.username, t.mode, t.T, t.created, t.exp, t.token, "discord").run();
    for (const k of vectors.keys) await db.prepare("INSERT INTO keys (key_id, public_key, owner_discord_id, owner_username, character, kind, bootstrap, created, cert_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(k.key_id, k.public_hex, k.owner_discord_id, k.owner_username, k.character, k.kind, k.bootstrap, k.created, k.cert_exp).run();
    for (const [id, character] of Object.entries(OWN)) await db.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(character, KEYS[id].owner_discord_id, "Olympus Vanguard", "r", "Horde", "0000000000", 1780000000).run();
    return L.linkEnv({ DB: spyDb, ...baseVars, ...linkVars({ seed: "s".repeat(43), publicHex: vectors.backend.public_hex }, db, { LINK_CA_PUBLIC: vectors.council_authority.public_hex, LINK_COUNCIL_CHARACTERS: CK.character, ...over }) });
  }
  // The exact words of the pending answers (.195 pins them by equality): the held role outcome, the temporary refusal of
  // "Delete my link" (.195: no longer "Wait for the current request"; round 1: no longer "in an hour", the bound is up to
  // about eight days after issue), the second removal's failure, an unconfirmed deletion, and a lost race the account
  // itself won (round 1: upstream's own words, the code released).
  const PENDING_ROLE_195 = "The role outcome is not confirmed. Wait for the current request; if this continues, ask the bot keeper to review it or request a new code.";
  const PENDING_FORGET_195 = "A link role change is still pending; no link data was deleted. Try again later (this can last until about eight days after the link code was issued), or ask the bot keeper to review it.";
  const SECOND_REMOVAL_195 = "Your link data was deleted, but Discord did not take the role change: press delete again in a minute.";
  const UNCONFIRMED_195 = "The deletion outcome could not be confirmed. Ask the bot keeper to review it before trying again.";
  const LOST_RECORD_195 = "The link could not be recorded: send it again in a minute.";
  // The player's guarded deletion batch, recognised by what it holds wherever its statements sit: the pending SELECT, or a
  // DELETE carrying the guard (round 1: the raw forgetUser batch, with its unguarded DELETE, no longer matches).
  const guardedDeletion195 = (statements) => statements.some((s) => /^DELETE FROM members WHERE discord_id = \? AND NOT EXISTS \(SELECT 1 FROM codes pending WHERE /.test(s.sql) || /^SELECT EXISTS \(SELECT 1 FROM codes WHERE discord_id = \?/.test(s.sql));
  console.log("\n== .194 pending role outcome: failed undo never becomes an already-linked success ==");
  {
    const pendingDb = linkD1(), pendingKeys = await backendKeys();
    const pendingEnv = L.linkEnv({ ...baseVars, ...linkVars(pendingKeys, pendingDb) });
    const keeper = await councillor(core, pendingEnv, "recover01", "Recovery Keeper-ClassicBetaPvP", "500000000000000091");
    const code = await core.issueCode(pendingEnv, { id: USER_C, username: "some.player" });
    const proof = await councillorLink(core, code.token, "Pending Player-ClassicBetaPvP", T, keeper);
    const rawBatch = pendingDb.batch;
    let undoFails = true, promotes = 0;
    pendingDb.batch = async (statements) => {
      if (undoFails && statements.some((s) => /^DELETE FROM used WHERE r =/.test(s.sql))) throw new Error("D1_ERROR: synthetic undo failure");
      return rawBatch(statements);
    };
    const first = await core.acceptProof(pendingEnv, proof.text, { discordId: USER_C, promote: async () => { promotes++; return false; } });
    const persisted = await pendingDb.prepare("SELECT used FROM codes WHERE r = ?").bind(proof.R).first();
    check(".194 a failed promotion plus failed atomic undo is an observable server hold with a durable pending claim, never a completed link",
      first.ok === false && first.reason === "server" && first.message === PENDING_ROLE_195 && persisted.used === 0 && !!(await pendingDb.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(proof.R).first()), first, persisted);
    const examined = await core.checkProof(pendingEnv, proof.text, { discordId: USER_C });
    const againPending = await core.acceptProof(pendingEnv, proof.text, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    check(".194 retrying or inspecting that proof stays server-held, without another promotion or an already-linked answer",
      examined.ok === false && examined.reason === "server" && againPending.ok === false && againPending.reason === "server" && promotes === 1, examined, againPending, promotes);
    check(".194 pending state does not bypass the existing account and proof-tag checks",
      (await core.checkProof(pendingEnv, proof.text, { discordId: USER_A })).reason === "other-user"
      && (await core.checkProof(pendingEnv, proof.text.replace("Pending Player-ClassicBetaPvP", "Different Player-ClassicBetaPvP"), { discordId: USER_C })).reason === "tag");
    const candidateKey = await backendKeys();
    const newKey = { key_id: "pending99", public_key: candidateKey.publicHex, owner_discord_id: USER_C, character: "Pending Player-ClassicBetaPvP", kind: "p" };
    check(".194 an unsettled member row cannot authorize a non-bootstrap confirmer key", (await core.manageKeys(pendingEnv, newKey)).reason === "character-not-linked");
    const expireAt = (await pendingDb.prepare("SELECT exp FROM codes WHERE r = ?").bind(proof.R).first()).exp + core.LINK.DELIVERY_GRACE + 1;
    await core.pruneLink(pendingEnv, expireAt);
    check(".194 ordinary expiry pruning retains a pending code referenced by its member, keeping that member non-authoritative",
      (await pendingDb.prepare("SELECT used FROM codes WHERE r = ?").bind(proof.R).first())?.used === 0
      && (await core.manageKeys(pendingEnv, newKey)).reason === "character-not-linked");
    undoFails = false;
    const nextCode = await core.issueCode(pendingEnv, { id: USER_C, username: "some.player" });
    const nextProof = await councillorLink(core, nextCode.token, "Pending Player-ClassicBetaPvP", T, keeper);
    const recovered = await core.acceptProof(pendingEnv, nextProof.text, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    const alreadyRecovered = await core.acceptProof(pendingEnv, nextProof.text, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    check(".194 an explicit new code can confirm the same character, while successful replay sends no second promotion and the old proof stays held",
      nextProof.R !== proof.R && recovered.reason === "linked" && alreadyRecovered.reason === "already" && promotes === 2
      && (await pendingDb.prepare("SELECT used FROM codes WHERE r = ?").bind(nextProof.R).first()).used === T
      && (await core.checkProof(pendingEnv, proof.text, { discordId: USER_C })).reason === "server", recovered, alreadyRecovered, promotes);
    await core.pruneLink(pendingEnv, expireAt);
    check(".194 a confirmed newer code does not erase an older expired unconfirmed marker or revive its proof",
      (await pendingDb.prepare("SELECT used FROM codes WHERE r = ?").bind(proof.R).first())?.used === 0
      && (await pendingDb.prepare("SELECT r FROM members WHERE character = ?").bind("Pending Player-ClassicBetaPvP").first()).r === nextProof.R
      && (await core.checkProof(pendingEnv, proof.text, { discordId: USER_C })).reason === "server");
  }
  {
    const pendingEnv = await seeded(), pendingDb = pendingEnv.LINK_DB;
    await pendingDb.prepare("UPDATE codes SET used = 0 WHERE r = ?").bind(B1.R).run();
    await pendingDb.prepare("UPDATE members SET r = ? WHERE character = ?").bind(B1.R, OWN.player01).run();
    const refused = await core.checkProof(pendingEnv, B3.bundle, { discordId: USER_A });
    await pendingDb.prepare("UPDATE codes SET used = ? WHERE r = ?").bind(T, B1.R).run();
    const confirmed = await core.checkProof(pendingEnv, B3.bundle, { discordId: USER_A });
    check(".194 an unsettled character cannot make a registered player confirmation count; the settled control still counts",
      refused.reason === "not-enough" && confirmed.ok === true, refused.reason, confirmed.reason);
  }
  {
    const retryEnv = await seeded(); let promotes = 0;
    const refused = await core.acceptProof(retryEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return false; } });
    const unused = (await retryEnv.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used;
    const retried = await core.acceptProof(retryEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    check(".194 a successful undo still releases the code for an explicit retry, which finalizes to the original second-level clock",
      refused.reason === "discord" && unused === null && retried.reason === "linked" && promotes === 2
      && (await retryEnv.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used === T, refused, retried);
  }
  {
    const waitingEnv = await seeded(); let entered, release, promotes = 0;
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    const work = core.acceptProof(waitingEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; entered(); await finish; return true; } });
    await started;
    const replay = await core.acceptProof(waitingEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    const during = (await waitingEnv.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used;
    release(); const done = await work;
    check(".194 a concurrent delivery cannot report success while the original promotion is still pending",
      replay.ok === false && replay.reason === "server" && during === 0 && promotes === 1 && done.reason === "linked", replay, during, promotes, done.reason);
  }
  for (const mode of ["before", "after", "readback", "nochange"]) {
    const uncertainEnv = await seeded(), uncertainDb = uncertainEnv.LINK_DB, rawPrepare = uncertainDb.prepare;
    let writes = 0, readbacks = 0, promotes = 0;
    const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)),
      run: async () => {
        if (!/^UPDATE codes SET used = \? WHERE r = \? AND used = 0$/.test(s.sql)) return s.run();
        writes++;
        if (mode === "after") await s.run();
        if (mode === "nochange") return { success: true, meta: { changes: 0 } };
        throw new Error("D1_ERROR: synthetic finalization acknowledgement");
      },
      first: async () => {
        if (/^SELECT used FROM codes WHERE r = \?$/.test(s.sql)) { readbacks++; if (mode === "readback") throw new Error("D1_ERROR: synthetic finalization readback"); }
        return s.first();
      }
    });
    uncertainDb.prepare = (sql) => wrap(rawPrepare(sql));
    const result = await core.acceptProof(uncertainEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    const replay = await core.acceptProof(uncertainEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    check(`.194 finalization ${mode}: one update attempt and one actual readback, no automatic promotion or false-success replay`,
      writes === 1 && readbacks === 1 && promotes === 1
      && (mode === "after" ? result.reason === "linked" && replay.reason === "already" : result.ok === false && result.reason === "server" && replay.ok === false && replay.reason === "server"), result, replay, writes, readbacks, promotes);
  }

  for (const mode of ["before", "after"]) {
    const recordEnv = await seeded(), recordDb = recordEnv.LINK_DB, rawBatch = recordDb.batch;
    let promotes = 0, batches = 0;
    recordDb.batch = async (statements) => {
      batches++;
      if (mode === "after") await rawBatch(statements);
      throw new Error("D1_ERROR: synthetic recording acknowledgement");
    };
    const result = await core.acceptProof(recordEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    const replay = await core.acceptProof(recordEnv, B1.bundle, { discordId: USER_C, promote: async () => { promotes++; return true; } });
    const member = await recordDb.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first();
    check(`.194 an unknown recording batch result (${mode} commit) stays pending and cannot become a successful replay or send a role`,
      result.ok === false && result.reason === "server" && replay.ok === false && replay.reason === "server" && promotes === 0 && batches === 1
      && result.message === PENDING_ROLE_195 && replay.message === PENDING_ROLE_195
      && (await recordDb.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first()).used === 0 && !!member === (mode === "after"), result, replay, promotes, batches);
  }

  {
    const savedT = T, raceDb = linkD1(), raceKeys = await backendKeys();
    const raceEnv = L.linkEnv({ ...baseVars, ...linkVars(raceKeys, raceDb) });
    const keeper = await councillor(core, raceEnv, "pruner01", "Prune Keeper-ClassicBetaPvP", "500000000000000092");
    const oldCode = await core.issueCode(raceEnv, { id: USER_C, username: "some.player" });
    const oldProof = await councillorLink(core, oldCode.token, "Prune Player-ClassicBetaPvP", T, keeper);
    const unrelatedCode = await core.issueCode(raceEnv, { id: USER_A, username: "tester.two" });
    await raceDb.prepare("UPDATE codes SET used = 0 WHERE r = ?").bind(unrelatedCode.R).run();
    const rawBatch = raceDb.batch;
    let undoFails = true, promotes = 0;
    raceDb.batch = async (statements) => {
      if (undoFails && statements.some((s) => /^DELETE FROM used WHERE r =/.test(s.sql))) throw new Error("D1_ERROR: synthetic prior pending undo");
      return rawBatch(statements);
    };
    const held = await core.acceptProof(raceEnv, oldProof.text, { discordId: USER_C, promote: async () => { promotes++; return false; } });
    undoFails = false;
    try {
      T = oldCode.exp + core.LINK.DELIVERY_GRACE + 1;
      const nextCode = await core.issueCode(raceEnv, { id: USER_C, username: "some.player" });
      const nextProof = await councillorLink(core, nextCode.token, "Prune Player-ClassicBetaPvP", T, keeper);
      for (const [r, exp] of [["PRUNECUT00", T - core.LINK.DELIVERY_GRACE], ["PRUNEBEF00", T - core.LINK.DELIVERY_GRACE - 1]]) {
        await raceDb.prepare("INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(r, USER_A, "tester.two", "c", "00000000", savedT, exp, "synthetic-unused-prune-control", "discord").run();
      }
      let entered, release;
      const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
      const work = core.acceptProof(raceEnv, nextProof.text, { discordId: USER_C, promote: async () => { promotes++; entered(); await finish; return false; } });
      await started;
      const duringMember = await raceDb.prepare("SELECT r FROM members WHERE character = ?").bind("Prune Player-ClassicBetaPvP").first();
      await core.pruneLink(raceEnv, T);
      const oldDuring = await raceDb.prepare("SELECT used FROM codes WHERE r = ?").bind(oldProof.R).first();
      check(".194 prune retains expired pending A while recovery B temporarily owns its same-account member during deferred promotion",
        held.reason === "server" && duringMember?.r === nextProof.R && oldDuring?.used === 0, held.reason, duringMember, oldDuring);
      check(".194 expiry pruning preserves each account's pending markers independently and keeps the strict unused-code expiry boundary",
        (await raceDb.prepare("SELECT used FROM codes WHERE r = ?").bind(unrelatedCode.R).first())?.used === 0
        && !!(await raceDb.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind("PRUNECUT00").first())
        && !(await raceDb.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind("PRUNEBEF00").first()));
      release(); const failed = await work;
      const restored = await raceDb.prepare("SELECT r FROM members WHERE character = ?").bind("Prune Player-ClassicBetaPvP").first();
      const candidate = await backendKeys();
      const admission = await core.manageKeys(raceEnv, { key_id: "prunehold", public_key: candidate.publicHex, owner_discord_id: USER_C, character: "Prune Player-ClassicBetaPvP", kind: "p" });
      check(".194 failed deferred recovery undo restores a still-pending A that cannot authorize a key or successful proof replay",
        failed.reason === "discord" && restored?.r === oldProof.R && promotes === 2
        && (await raceDb.prepare("SELECT used FROM codes WHERE r = ?").bind(oldProof.R).first())?.used === 0
        && admission.reason === "character-not-linked" && (await core.checkProof(raceEnv, oldProof.text, { discordId: USER_C })).reason === "server", failed.reason, restored, admission.reason);
      const settled = await core.acceptProof(raceEnv, nextProof.text, { discordId: USER_C, promote: async () => { promotes++; return true; } });
      await core.pruneLink(raceEnv, T);
      check(".194 after explicit recovery B settles, expired unconfirmed A stays held while B's recorded authority remains valid",
        settled.reason === "linked" && promotes === 3
        && (await raceDb.prepare("SELECT used FROM codes WHERE r = ?").bind(oldProof.R).first())?.used === 0
        && (await raceDb.prepare("SELECT used FROM codes WHERE r = ?").bind(nextProof.R).first())?.used === T
        && (await core.manageKeys(raceEnv, { key_id: "prunehold", public_key: candidate.publicHex, owner_discord_id: USER_C, character: "Prune Player-ClassicBetaPvP", kind: "p" })).ok === true, settled.reason, promotes);
    } finally { T = savedT; }
  }
  async function pendingRaceFixture194(createOld = true) {
    const db = linkD1(), backend = await backendKeys(), env = L.linkEnv({ ...baseVars, ...linkVars(backend, db) });
    const keeper = await councillor(core, env, "racekeep", "Race Keeper-ClassicBetaPvP", "500000000000000093");
    if (!createOld) return { db, env, keeper };
    const oldCode = await core.issueCode(env, { id: USER_C, username: "some.player" });
    const oldProof = await councillorLink(core, oldCode.token, "Race Player-ClassicBetaPvP", T, keeper);
    const rawBatch = db.batch; let failUndo = true;
    db.batch = async (statements) => {
      if (failUndo && statements.some((s) => /^DELETE FROM used WHERE r =/.test(s.sql))) throw new Error("D1_ERROR: synthetic race setup undo");
      return rawBatch(statements);
    };
    const held = await core.acceptProof(env, oldProof.text, { discordId: USER_C, promote: async () => false });
    failUndo = false;
    return { db, env, keeper, oldCode, oldProof, held };
  }
  for (const mode of ["moved", "deleted"]) {
    const savedT = T, race = await pendingRaceFixture194();
    try {
      T = race.oldCode.exp + core.LINK.DELIVERY_GRACE + 1;
      const bCode = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
      const bProof = await councillorLink(core, bCode.token, "Race Player-ClassicBetaPvP", T, race.keeper);
      const rawBatch = race.db.batch; let entered, release, stopped = false, bPromotes = 0;
      const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
      race.db.batch = async (statements) => {
        if (!stopped && statements.some((s) => /INTO members|UPDATE members SET/.test(s.sql) && s.args.includes(bProof.R))) { stopped = true; entered(); await finish; }
        return rawBatch(statements);
      };
      const bWork = core.acceptProof(race.env, bProof.text, { discordId: USER_C, promote: async () => { bPromotes++; return false; } });
      await started;
      let settled = null;
      if (mode === "moved") {
        const cCode = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
        const cProof = await councillorLink(core, cCode.token, "Race Player-ClassicBetaPvP", T, race.keeper);
        settled = { R: cProof.R, result: await core.acceptProof(race.env, cProof.text, { discordId: USER_C, promote: async () => true }) };
        await core.pruneLink(race.env, T);
      } else {
        await core.forgetUser(race.env, USER_C);
      }
      release(); const bResult = await bWork;
      const member = await race.db.prepare("SELECT r FROM members WHERE character = ?").bind("Race Player-ClassicBetaPvP").first();
      // .195 review round 1: the moved snapshot wrote no member row, so B's code is released (used NULL) with upstream's
      // "send it again" (the account's own C holds the character); a deleted one has no code row left to release: held.
      const bUsed = (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(bProof.R).first())?.used;
      check(`.194 a recovery with a ${mode} owned snapshot cannot overwrite or resurrect the member after its recording pause`,
        race.held.reason === "server" && bResult.ok === false && bPromotes === 0
        && (mode === "moved" ? bResult.reason === "server" && bResult.message === LOST_RECORD_195 && bUsed === null : bResult.message === PENDING_ROLE_195 && bUsed === undefined)
        && (mode === "moved" ? (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(race.oldProof.R).first())?.used === 0
          : !(await race.db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(race.oldProof.R).first()))
        && (mode === "moved" ? settled.result.reason === "linked" && member?.r === settled.R : member === null), bResult.reason, member, bPromotes);
    } finally { T = savedT; }
  }
  for (const initial of ["pending", "new"]) {
    const race = await pendingRaceFixture194(initial === "pending");
    const bCode = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
    const bProof = await councillorLink(core, bCode.token, "Race Player-ClassicBetaPvP", T, race.keeper);
    let enteredB, releaseB, enteredC, releaseC, promotes = 0;
    const startedB = new Promise((resolve) => { enteredB = resolve; }), finishB = new Promise((resolve) => { releaseB = resolve; });
    const startedC = new Promise((resolve) => { enteredC = resolve; }), finishC = new Promise((resolve) => { releaseC = resolve; });
    const bWork = core.acceptProof(race.env, bProof.text, { discordId: USER_C, promote: async () => { promotes++; enteredB(); await finishB; return false; } });
    await startedB;
    const cCode = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
    const cProof = await councillorLink(core, cCode.token, "Race Player-ClassicBetaPvP", T, race.keeper);
    const cWork = core.acceptProof(race.env, cProof.text, { discordId: USER_C, promote: async () => { promotes++; enteredC(); await finishC; return false; } });
    await startedC;
    releaseB(); const bResult = await bWork;
    const bUsedWhileC = (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(bProof.R).first())?.used;
    check(`.194 an overwritten B rollback (${initial} member) cannot release B's claim while pending C may still restore B`,
      bResult.ok === false && bResult.reason === "server" && bUsedWhileC === 0
      && (await race.db.prepare("SELECT r FROM members WHERE character = ?").bind("Race Player-ClassicBetaPvP").first())?.r === cProof.R, bResult.reason, bUsedWhileC);
    releaseC(); const cResult = await cWork;
    const candidate = await backendKeys();
    const admission = await core.manageKeys(race.env, { key_id: "overlap01", public_key: candidate.publicHex, owner_discord_id: USER_C, character: "Race Player-ClassicBetaPvP", kind: "p" });
    check(`.194 after C also fails (${initial} member), restored B is still pending and cannot authorize a key or completed replay`,
      cResult.reason === "discord" && promotes === 2
      && (await race.db.prepare("SELECT r FROM members WHERE character = ?").bind("Race Player-ClassicBetaPvP").first())?.r === bProof.R
      && (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(bProof.R).first())?.used === 0
      && admission.reason === "character-not-linked" && (await core.checkProof(race.env, bProof.text, { discordId: USER_C })).reason === "server", cResult.reason, admission.reason);
  }
  for (const mode of ["forget", "prune"]) {
    const savedT = T, race = await pendingRaceFixture194(false);
    const code = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
    const proof = await councillorLink(core, code.token, "Race Player-ClassicBetaPvP", T, race.keeper);
    const candidate = await backendKeys(), rawBatch = race.db.batch;
    let entered, release, stopped = false, promotes = 0, admittedOrphan = false;
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    race.db.batch = async (statements) => {
      if (!stopped && statements.some((s) => /INTO members|UPDATE members SET/.test(s.sql) && s.args.includes(proof.R))) { stopped = true; entered(); await finish; }
      return rawBatch(statements);
    };
    try {
      const work = core.acceptProof(race.env, proof.text, { discordId: USER_C, promote: async () => {
        promotes++;
        admittedOrphan = (await core.manageKeys(race.env, { key_id: "lostclaim", public_key: candidate.publicHex, owner_discord_id: USER_C, character: "Race Player-ClassicBetaPvP", kind: "p" })).ok === true;
        return false;
      } });
      await started;
      if (mode === "forget") await core.forgetUser(race.env, USER_C);
      else { T = code.exp + core.LINK.DELIVERY_GRACE + 1; await core.pruneLink(race.env, T); }
      release(); const result = await work;
      check(mode === "forget" ? ".194 a new-member claim removed by forget before recording cannot recreate a member, promote or expose orphan authority"
        : ".194 expiry prune retains a newly pending claim; its ordinary failed promotion rolls back without exposing orphan authority",
        result.ok === false && result.reason === (mode === "forget" ? "server" : "discord") && promotes === (mode === "forget" ? 0 : 1) && admittedOrphan === false
        && (mode === "forget" ? !(await race.db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(proof.R).first())
          : (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(proof.R).first())?.used === null)
        && !(await race.db.prepare("SELECT 1 AS x FROM members WHERE character = ?").bind("Race Player-ClassicBetaPvP").first()), result.reason, promotes, admittedOrphan);
    } finally { T = savedT; }
  }
  const upPage = (body, headers = {}, origin = ORIGIN) => new Request("https://verify.example/proof", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const upProof = async (lenvX, text, token, headers = {}, origin = ORIGIN) => { const r = await core.handleProof(upPage({ text, discordToken: token }, headers, origin), lenvX, { promote: async () => {}, demote: async () => {}, fetchImpl: upFetch }); return { http: r.status, ...(await r.json()) }; };
  async function playerForget194(env, demote) {
    const response = await core.handleProof(upPage({ forget: true, discordToken: signin("some", "player", "0001") }), env, { demote, fetchImpl: upFetch });
    return response.json();
  }
  const deleteKey194 = (id = USER_C) => `delete:${sha(`olympus-link-delete~${id}`)}`;
  const deleteGuard194 = (db, id = USER_C) => db.prepare("SELECT k, until, n FROM limits WHERE k = ?").bind(deleteKey194(id)).first();
  const isDeleteAcquire194 = (s) => /^INSERT(?: OR IGNORE)? INTO limits\b/.test(s.sql) && s.args.includes(deleteKey194());
  const isDeleteRelease194 = (s) => /^DELETE FROM limits\b/.test(s.sql) && s.args.includes(deleteKey194());
  const cleanupSnapshot195 = (db) => JSON.stringify(Object.fromEntries(["used", "inbox_uploads", "council_keys", "revoked_keys", "keys", "members", "codes"].map((table) => [table, db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));
  function seedCleanupRows195(db, id, character, R) {
    // Every cleanup category has an affected row; revoked_keys also has an unrelated row that must survive unchanged.
    db.sqlite.prepare("INSERT INTO used (r, key_id, t) VALUES (?, ?, ?)").run(R, "own195proof", T);
    db.sqlite.prepare("INSERT INTO inbox_uploads (source, r, discord_id, requester, from_character, uploaded, status) VALUES ('site', ?, ?, ?, ?, ?, 'linked')").run(R, id, character, character, T);
    db.sqlite.prepare("INSERT INTO council_keys (public_key, key_id, character, cert_exp, first_seen) VALUES (?, ?, ?, ?, ?)").run("d".repeat(64), "d".repeat(12), character, T + 3600, T);
    db.sqlite.prepare("INSERT INTO keys (key_id, public_key, owner_discord_id, character, kind, bootstrap, created) VALUES ('owner195key', ?, ?, ?, 'p', 0, ?)").run("e".repeat(64), id, character, T);
    db.sqlite.prepare("INSERT INTO revoked_keys (key_id, revoked_at) VALUES ('keep195revoked', ?)").run(T - 10);
  }
  // Interleave whole real SQLite statements, never fragments inside one atomic SQL statement.
  const interceptRun194 = (db, hook) => {
    const raw = db.prepare;
    const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)), run: () => hook(s, () => s.run()) });
    db.prepare = (sql) => wrap(raw(sql));
    return () => { db.prepare = raw; };
  };
  const waitFor194 = async (promise) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(".194 interleaving seam was not reached within 2 seconds")), 2000); })]);
    } finally { clearTimeout(timer); }
  };
  {
    const env = await seeded(); let entered, release, role = false, put = 0, del = 0;
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    const proofWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { put++; entered(); await finish; role = true; return true; } });
    await started;
    const deletion = await playerForget194(env, async () => { del++; role = false; return true; });
    const held = !!(await env.LINK_DB.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && (await env.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first())?.used === 0;
    release(); const proofResult = await proofWork;
    check(".194 player deletion during an admitted delayed role PUT refuses before demotion and preserves the member/claim until settlement",
      deletion.ok === false && deletion.reason === "server" && held && put === 1 && del === 0 && role === true
      && proofResult.reason === "linked" && !!(await env.LINK_DB.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()), deletion.reason, proofResult.reason, held, role);
  }
  {
    const env = await seeded(); let demoteEntered, releaseDemote, puts = 0, role = true;
    const deleting = new Promise((resolve) => { demoteEntered = resolve; }), finishDelete = new Promise((resolve) => { releaseDemote = resolve; });
    const deleteWork = playerForget194(env, async () => { demoteEntered(); await finishDelete; role = false; return true; });
    await waitFor194(deleting);
    const proofResult = await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; role = true; return true; } });
    const unclaimed = (await env.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first())?.used === null;
    releaseDemote(); const deletion = await deleteWork;
    check(".194 a same-account proof during admitted demotion is refused before claiming or PUT, then confirmed cleanup reports forgotten",
      deletion.reason === "forgotten" && unclaimed && proofResult.ok === false && proofResult.reason === "server" && puts === 0 && role === false
      && !(await env.LINK_DB.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first())
      && !(await env.LINK_DB.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first()), deletion.reason, proofResult.reason, unclaimed, puts, role);
  }
  {
    const env = await seeded(), db = env.LINK_DB, rawPrepare = db.prepare;
    let entered, release, paused = false, put = 0;
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)), run: async () => {
      if (!paused && /^UPDATE codes SET used = \? WHERE r = \? AND used IS NULL(?:$| AND )/.test(s.sql)) { paused = true; entered(); await finish; }
      return s.run();
    } });
    db.prepare = (sql) => wrap(rawPrepare(sql));
    const proofWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { put++; return true; } });
    await started;
    const deletion = await playerForget194(env, async () => true);
    release(); const proofResult = await proofWork;
    check(".194 completed player cleanup before a proof claim prevents that old proof from recording a member or sending a PUT",
      deletion.reason === "forgotten" && proofResult.ok === false && put === 0
      && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first())
      && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()), deletion.reason, proofResult.reason, put);
  }
  {
    const env = await seeded(), db = env.LINK_DB;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    await db.prepare("UPDATE codes SET used = 0 WHERE r = ?").bind(TOKEN_A.R).run();
    const other = JSON.stringify(await db.prepare("SELECT * FROM codes WHERE r = ?").bind(TOKEN_A.R).first());
    const deletion = await playerForget194(env, async () => true);
    check(".194 another account's pending proof does not block settled-account player deletion or lose that other account's marker",
      deletion.reason === "forgotten" && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first())
      && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first())
      && JSON.stringify(await db.prepare("SELECT * FROM codes WHERE r = ?").bind(TOKEN_A.R).first()) === other, deletion.reason);
  }
  {
    const savedT = T, race = await pendingRaceFixture194(false); let entered, release, role = false, puts = 0;
    const codeB = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
    const proofB = await councillorLink(core, codeB.token, "Race Player-ClassicBetaPvP", T, race.keeper);
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    try {
      T = codeB.exp + core.LINK.DELIVERY_GRACE - 1;
      const workB = core.acceptProof(race.env, proofB.text, { discordId: USER_C, promote: async () => { puts++; entered(); await finish; role = true; return true; } });
      await started;
      const codeC = await core.issueCode(race.env, { id: USER_C, username: "some.player" });
      const proofC = await councillorLink(core, codeC.token, "Race Player-ClassicBetaPvP", T, race.keeper);
      const settledC = await core.acceptProof(race.env, proofC.text, { discordId: USER_C, promote: async () => { puts++; role = true; return true; } });
      T += 2;
      await core.pruneLink(race.env, T);
      const marker = (await race.db.prepare("SELECT used FROM codes WHERE r = ?").bind(proofB.R).first())?.used;
      const deletion = await playerForget194(race.env, async () => { role = false; return true; });
      release(); const resultB = await workB;
      check(".194 expiry prune after newer C settles cannot discard delayed B's marker and let player deletion falsely succeed before B's PUT",
        settledC.reason === "linked" && marker === 0 && deletion.ok === false && deletion.reason === "server"
        && resultB.reason === "linked" && puts === 2 && role === true
        && !!(await race.db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()), marker, deletion.reason, resultB.reason, role);
    } finally { T = savedT; }
  }
  {
    const env = await seeded(), db = env.LINK_DB; let entered, release;
    const started = new Promise((resolve) => { entered = resolve; }), finish = new Promise((resolve) => { release = resolve; });
    const proofWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { entered(); await finish; return false; } });
    await started;
    await db.prepare("INSERT INTO keys (key_id, public_key, owner_discord_id, character, kind, bootstrap, created) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("heldkey1", "e".repeat(64), USER_C, B1.requester, "p", 0, T).run();
    await db.prepare("INSERT INTO council_keys (public_key, key_id, character, cert_exp, first_seen) VALUES (?, ?, ?, ?, ?)").bind("d".repeat(64), "d".repeat(12), B1.requester, T + 3600, T).run();
    await db.prepare("INSERT INTO inbox_uploads (source, r, discord_id, requester, from_character, uploaded, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("site", B1.R, USER_C, B1.requester, B1.requester, T, "linked").run();
    const snapshot = async () => {
      const out = {};
      for (const table of ["used", "inbox_uploads", "council_keys", "revoked_keys", "keys", "members", "codes"]) out[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
      return JSON.stringify(out);
    };
    const before = await snapshot(), deletion = await playerForget194(env, async () => true), after = await snapshot();
    release(); await proofWork;
    check(".194 a pending player deletion preserves every cleanup category and does not revoke a key in its guarded atomic batch",
      deletion.ok === false && deletion.reason === "server" && before === after, deletion.reason, before === after);
  }
  // .195 review round 1: three more modes (the characters' or the keys' rows missing from the batch result, one result
  // short), all found by content, and every mode's message pinned by equality: a throw reaches handleProof's catch.
  for (const mode of ["before", "after", "missing-result", "failed-step", "rows-characters", "rows-keys", "short"]) {
    const env = await seeded(), db = env.LINK_DB;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const rawBatch = db.batch; let cleanups = 0, demotes = 0;
    const at = (statements, re) => statements.findIndex((s) => re.test(s.sql));
    db.batch = async (statements) => {
      // .195: the deletion batch and its steps are found by content, not by position (they were statements[0] and [3]).
      if (!guardedDeletion195(statements)) return rawBatch(statements);
      cleanups++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic guarded cleanup before commit");
      const result = await rawBatch(statements);
      if (mode === "after") throw new Error("D1_ERROR: synthetic guarded cleanup acknowledgement");
      if (mode === "missing-result") result[0] = { success: true };
      if (mode === "failed-step") result[at(statements, /^DELETE FROM council_keys WHERE character IN/)] = { success: false };
      if (mode === "rows-characters") result[at(statements, /^SELECT character FROM members WHERE discord_id = \? ORDER BY linked/)] = { success: true };
      if (mode === "rows-keys") result[at(statements, /^SELECT key_id FROM keys WHERE owner_discord_id = \? AND revoked = 0/)] = { success: true };
      if (mode === "short") result.pop();
      return result;
    };
    const deletion = await playerForget194(env, async () => { demotes++; return true; });
    const retained = !!(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first());
    check(`.194 unconfirmed player cleanup (${mode}) is never reported forgotten or automatically retried`,
      deletion.ok === false && deletion.reason === "server" && cleanups === 1 && demotes === 1 && retained === (mode === "before"), deletion.reason, cleanups, demotes, retained);
    const heldAdmission = await deleteGuard194(db);
    const retry = await playerForget194(env, async () => { demotes++; return true; });
    check(`.194 unconfirmed player cleanup (${mode}) retains deletion admission, so another request cannot repeat DELETE or cleanup`,
      !!heldAdmission && retry.ok === false && retry.reason === "server" && cleanups === 1 && demotes === 1
      && JSON.stringify(await deleteGuard194(db)) === JSON.stringify(heldAdmission), retry.reason, cleanups, demotes);
  }
  for (const mode of ["false", "throw"]) {
    const env = await seeded(), db = env.LINK_DB;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const deletion = await playerForget194(env, async () => { if (mode === "throw") throw new Error("synthetic unknown DELETE acknowledgement"); return false; });
    check(`.194 an unconfirmed role removal (${mode}) retains cleanup records and does not report forgotten`,
      deletion.ok === false && deletion.reason === "server" && /keeper/.test(deletion.message) && !/try again/i.test(deletion.message)
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && !!(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first()), deletion.reason);
  }
  console.log("\n== .194 account deletion admission: shared SQL guard, ownership and unknown outcomes ==");
  {
    const env = await seeded(), db = env.LINK_DB; let demotes = 0, during;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const deletion = await playerForget194(env, async () => { demotes++; during = await deleteGuard194(db); return true; });
    check(".194 a normal deletion owns one hashed-account guard across demotion, then removes it only after acknowledged cleanup",
      deletion.reason === "forgotten" && demotes === 2 && during?.k === deleteKey194() && during.until === T
      && Number.isSafeInteger(during.n) && during.n > 0 && during.n <= 2 ** 52
      && !(await deleteGuard194(db)) && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first())
      && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first()), deletion.reason, demotes, during);
  }
  for (const fill of [0, 255]) {
    const env = await seeded(), db = env.LINK_DB, randomValues = globalThis.crypto.getRandomValues; let during;
    try {
      globalThis.crypto.getRandomValues = (arr) => arr.byteLength === 8
        ? (new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).fill(fill), arr) : randomValues(arr);
      const deletion = await playerForget194(env, async () => { during = await deleteGuard194(db); return true; });
      check(`.194 the admission nonce preserves the exact safe-integer boundary (${fill === 0 ? "all zero bits" : "all one bits"}) through SQLite ownership and release`,
        deletion.reason === "forgotten" && during?.n === (fill === 0 ? 1 : 2 ** 52) && Number.isSafeInteger(during.n) && !(await deleteGuard194(db)),
        deletion.reason, during);
    } finally { globalThis.crypto.getRandomValues = randomValues; }
  }
  {
    const env = await seeded(), db = env.LINK_DB; let entered, release, paused = false, demotes = 0, puts = 0, role = false;
    const reached = new Promise((resolve) => { entered = resolve; }), proceed = new Promise((resolve) => { release = resolve; });
    const restore = interceptRun194(db, async (s, run) => {
      if (!paused && isDeleteAcquire194(s)) { paused = true; entered(); await proceed; }
      return run();
    });
    const deletionWork = playerForget194(env, async () => { demotes++; role = false; return true; });
    await waitFor194(reached);
    let promoteEntered, releasePromote;
    const promoting = new Promise((resolve) => { promoteEntered = resolve; }), finishPromote = new Promise((resolve) => { releasePromote = resolve; });
    const proofWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; promoteEntered(); await finishPromote; role = true; return true; } });
    await waitFor194(promoting);
    release(); const deletion = await deletionWork;
    releasePromote(); const proof = await proofWork; restore();
    check(".194 a claim arriving immediately before deletion's atomic admission prevents DELETE, including the precheck-to-write race",
      paused && deletion.reason === "server" && deletion.ok === false && demotes === 0 && puts === 1 && proof.reason === "linked" && role === true
      && !(await deleteGuard194(db)) && (await db.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first())?.used === T,
      deletion.reason, proof.reason, demotes, puts, role);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let entered, release, paused = false, puts = 0, demoteEntered, releaseDemote;
    const reached = new Promise((resolve) => { entered = resolve; }), proceed = new Promise((resolve) => { release = resolve; });
    const deleting = new Promise((resolve) => { demoteEntered = resolve; }), finishDelete = new Promise((resolve) => { releaseDemote = resolve; });
    const restore = interceptRun194(db, async (s, run) => {
      if (!paused && /^UPDATE codes SET used = \? WHERE r = \? AND used IS NULL(?:$| AND )/.test(s.sql)) { paused = true; entered(); await proceed; }
      return run();
    });
    const proofWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; return true; } });
    await waitFor194(reached);
    const deletionWork = playerForget194(env, async () => { demoteEntered(); await finishDelete; return true; });
    await waitFor194(deleting);
    release(); const proof = await proofWork;
    const guard = await deleteGuard194(db), unclaimed = (await db.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first())?.used === null;
    releaseDemote(); const deletion = await deletionWork; restore();
    check(".194 a proof examined before admission still cannot claim during admitted DELETE; the exclusion is in the claim's SQL",
      paused && guard?.k === deleteKey194() && unclaimed && proof.ok === false && proof.reason === "server" && puts === 0 && deletion.reason === "forgotten",
      proof.reason, deletion.reason, puts, unclaimed);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let entered, release, puts = 0, demotes = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const reached = new Promise((resolve) => { entered = resolve; }), proceed = new Promise((resolve) => { release = resolve; });
    const deleting = playerForget194(env, async () => { demotes++; entered(); await proceed; return true; });
    await waitFor194(reached);
    const replay = await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; return true; } });
    const competingDelete = await playerForget194(env, async () => { demotes++; return true; });
    const guard = await deleteGuard194(db);
    release(); const deletion = await deleting;
    check(".194 an already-linked replay and concurrent player deletion cannot pass another deletion's live account guard",
      replay.ok === false && replay.reason === "server" && competingDelete.ok === false && competingDelete.reason === "server"
      && puts === 0 && demotes === 2 && !!guard && deletion.reason === "forgotten" && !(await deleteGuard194(db)),
      replay.reason, competingDelete.reason, deletion.reason, puts, demotes);
  }
  {
    const env = await seeded(), db = env.LINK_DB, raw = db.prepare; let entered, release, paused = false, puts = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const reached = new Promise((resolve) => { entered = resolve; }), proceed = new Promise((resolve) => { release = resolve; });
    const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)), first: async () => {
      if (!paused && /\bcodes\b/.test(s.sql) && /\bmembers\b/.test(s.sql) && /\blimits\b/.test(s.sql)) { paused = true; entered(); await proceed; }
      return s.first();
    } });
    db.prepare = (sql) => wrap(raw(sql));
    const replayWork = core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; return true; } });
    await waitFor194(reached);
    const deletion = await playerForget194(env, async () => true);
    release(); const replay = await replayWork; db.prepare = raw;
    check(".194 already-linked success revalidates settled code/member and absent guard together after examination; completed deletion invalidates the cached verdict",
      paused && deletion.reason === "forgotten" && replay.ok === false && replay.reason === "server" && puts === 0
      && !(await deleteGuard194(db)) && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()),
      deletion.reason, replay.reason, paused, puts);
  }
  for (const mode of ["before", "after", "missing-result", "failed-result"]) {
    const env = await seeded(), db = env.LINK_DB; let acquisitions = 0, demotes = 0;
    const restore = interceptRun194(db, async (s, run) => {
      if (!isDeleteAcquire194(s)) return run();
      acquisitions++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic deletion admission before commit");
      const result = await run();
      if (mode === "after") throw new Error("D1_ERROR: synthetic deletion admission acknowledgement");
      if (mode === "missing-result") return { success: true, meta: {} };
      return { ...result, success: false };
    });
    const deletion = await playerForget194(env, async () => { demotes++; return true; }); restore();
    const guard = await deleteGuard194(db);
    check(`.194 unknown deletion admission (${mode}) sends no DELETE, makes one attempt and never reports forgotten`,
      deletion.ok === false && deletion.reason === "server" && acquisitions === 1 && demotes === 0
      && !!guard === (mode !== "before") && (await db.prepare("SELECT used FROM codes WHERE r = ?").bind(B1.R).first())?.used === null,
      deletion.reason, acquisitions, demotes, !!guard);
  }
  for (const mode of ["false", "throw"]) {
    const env = await seeded(), db = env.LINK_DB; let demotes = 0, puts = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const deletion = await playerForget194(env, async () => { demotes++; if (mode === "throw") throw new Error("synthetic delayed DELETE transport"); return false; });
    const guard = await deleteGuard194(db);
    const replay = await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; return true; } });
    const retry = await playerForget194(env, async () => { demotes++; return true; });
    check(`.194 an unconfirmed DELETE (${mode}) holds admission and records, blocks success/replay and never sends a second DELETE`,
      deletion.reason === "server" && /keeper/.test(deletion.message) && !/try again/i.test(deletion.message) && !!guard && replay.ok === false && replay.reason === "server" && retry.reason === "server" && demotes === 1 && puts === 0
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && JSON.stringify(await deleteGuard194(db)) === JSON.stringify(guard), deletion.reason, replay.reason, retry.reason, demotes, puts);
  }
  for (const mode of ["before", "after", "missing-result", "failed-result"]) {
    const env = await seeded(), db = env.LINK_DB; let releases = 0, demotes = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const restore = interceptRun194(db, async (s, run) => {
      if (!isDeleteRelease194(s)) return run();
      releases++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic deletion release before commit");
      const result = await run();
      if (mode === "after") throw new Error("D1_ERROR: synthetic deletion release acknowledgement");
      if (mode === "missing-result") return { success: true, meta: {} };
      return { ...result, success: false };
    });
    const deletion = await playerForget194(env, async () => { demotes++; return true; }); restore();
    check(`.194 unconfirmed guard release (${mode}) follows committed cleanup but is never claimed forgotten or blindly retried`,
      deletion.ok === false && deletion.reason === "server" && releases === 1 && demotes === 2
      && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first())
      && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first())
      && !!(await deleteGuard194(db)) === (mode === "before"), deletion.reason, releases, demotes);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let releaseWrites = 0, owner, replacement;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const restore = interceptRun194(db, async (s, run) => {
      if (isDeleteRelease194(s)) {
        releaseWrites++; owner = await deleteGuard194(db); replacement = owner.n + 1;
        db.sqlite.prepare("UPDATE limits SET n = ? WHERE k = ?").run(replacement, deleteKey194());
      }
      return run();
    });
    const deletion = await playerForget194(env, async () => true); restore();
    const guard = await deleteGuard194(db);
    check(".194 guard release is owned by the exact nonce: it cannot remove a replacement owner's guard or report success",
      deletion.ok === false && deletion.reason === "server" && releaseWrites === 1 && guard?.n === replacement && guard?.n !== owner.n
      && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first()), deletion.reason, releaseWrites, guard);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let owner, replacement, before, releases = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    seedCleanupRows195(db, USER_C, B1.requester, B1.R);
    const restore = interceptRun194(db, async (s, run) => { if (isDeleteRelease194(s)) releases++; return run(); });
    const deletion = await playerForget194(env, async () => {
      owner = await deleteGuard194(db); replacement = owner.n + 1;
      await db.prepare("UPDATE limits SET n = ? WHERE k = ?").bind(replacement, deleteKey194()).run();
      before = cleanupSnapshot195(db);
      return true;
    }); restore();
    check(".194 cleanup itself requires its exact admission owner, preserving all account records when ownership changed during DELETE",
      deletion.ok === false && deletion.reason === "server" && (await deleteGuard194(db))?.n === replacement
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && !!(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first()) && cleanupSnapshot195(db) === before && releases === 0,
      deletion.reason, replacement, cleanupSnapshot195(db) === before, releases);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let lateDelete, deletes = 0, puts = 0, role = false;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const roleEnv = { ...venv, LINK_DB: db };
    const ordinary = discordStub({ members: { [USER_C]: [] } });
    responder = (url, init) => {
      if (init.method === "DELETE") {
        deletes++; lateDelete = () => { role = false; };
        throw Object.assign(new Error("synthetic late role DELETE"), { name: "TimeoutError" });
      }
      return ordinary(url, init);
    };
    const deletion = await playerForget194(env, (id) => RL.linkRole(roleEnv, "DELETE", id));
    const replay = await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => { puts++; role = true; return true; } });
    if (lateDelete) lateDelete();
    check(".194 a timed-out DELETE whose eventual effect can arrive late keeps admission and data, so no later proof reports success or sends PUT",
      deletion.ok === false && deletion.reason === "server" && /keeper/.test(deletion.message) && !/try again/i.test(deletion.message) && replay.ok === false && replay.reason === "server" && deletes === 1 && puts === 0 && role === false
      && !!(await deleteGuard194(db)) && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first()),
      deletion.reason, replay.reason, deletes, puts, role);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let oldGuard;
    const deletion = await playerForget194(env, async () => { oldGuard = await deleteGuard194(db); return false; });
    await db.prepare("INSERT INTO limits (k, until, n) VALUES (?, ?, ?)").bind("ip:expired-admission-control", T - 1, 2).run();
    await core.pruneLink(env, T + 366 * 86400);
    const guard = await deleteGuard194(db);
    check(".194 deletion admission has no TTL: ordinary pruning retains its old owner tuple while expiring ordinary limits",
      deletion.reason === "server" && !!oldGuard && JSON.stringify(guard) === JSON.stringify(oldGuard)
      && !(await db.prepare("SELECT 1 AS x FROM limits WHERE k = ?").bind("ip:expired-admission-control").first()), deletion.reason, oldGuard, guard);
  }
  {
    const env = await seeded(), db = env.LINK_DB, otherKey = deleteKey194(USER_A);
    await db.prepare("INSERT INTO limits (k, until, n) VALUES (?, ?, ?)").bind(otherKey, T - 10, 23).run();
    const before = JSON.stringify(await db.prepare("SELECT * FROM limits WHERE k = ?").bind(otherKey).first());
    const linked = await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const deletion = await playerForget194(env, async () => true);
    check(".194 one account's deletion guard neither blocks another account's proof/deletion nor loses its own retained ownership",
      linked.reason === "linked" && deletion.reason === "forgotten" && !(await deleteGuard194(db))
      && JSON.stringify(await db.prepare("SELECT * FROM limits WHERE k = ?").bind(otherKey).first()) === before, linked.reason, deletion.reason);
  }
  console.log("\n== .194 definite DELETE refusal: acknowledged release permits only a later explicit attempt ==");
  for (const status of [403, 429]) {
    const env = await seeded(), db = env.LINK_DB, roleEnv = { ...venv, LINK_DB: db }; let cleanups = 0, acquisitions = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const rawBatch = db.batch;
    db.batch = async (statements) => { if (/^SELECT \(?EXISTS \(SELECT 1 FROM codes/.test(statements[0]?.sql || "")) cleanups++; return rawBatch(statements); };
    const restore = interceptRun194(db, async (s, run) => { if (isDeleteAcquire194(s)) acquisitions++; return run(); });
    responder = discordStub({ members: { [USER_C]: [LINK_ROLE] }, del: { status, code: status === 403 ? 50013 : 0 } }); FETCHES = [];
    const first = await playerForget194(env, (id) => RL.linkRole(roleEnv, "DELETE", id));
    const denied = { guard: await deleteGuard194(db), cleanups, acquisitions, deletes: FETCHES.filter(f => f.method === "DELETE").length,
      member: !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first()), code: !!(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first()) };
    responder = discordStub({ members: { [USER_C]: [LINK_ROLE] } });
    const later = await playerForget194(env, (id) => RL.linkRole(roleEnv, "DELETE", id)); restore();
    check(`.194 real-adapter DELETE${status} preserves records with no cleanup/automatic retry; a later explicit press admits again and can complete`,
      first.ok === false && first.reason === "discord" && /try again/i.test(first.message) && !denied.guard && denied.cleanups === 0 && denied.acquisitions === 1 && denied.deletes === 1 && denied.member && denied.code
      && later.reason === "forgotten" && acquisitions === 2 && cleanups === 1 && FETCHES.filter(f => f.method === "DELETE").length === 3
      && !(await deleteGuard194(db)) && !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()), first.reason, later.reason, denied, acquisitions, cleanups);
  }
  for (const status of [500, 503]) {
    const env = await seeded(), db = env.LINK_DB, roleEnv = { ...venv, LINK_DB: db }; let cleanups = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const rawBatch = db.batch;
    db.batch = async (statements) => { if (/^SELECT \(?EXISTS \(SELECT 1 FROM codes/.test(statements[0]?.sql || "")) cleanups++; return rawBatch(statements); };
    responder = discordStub({ members: { [USER_C]: [LINK_ROLE] }, del: { status, code: 0 } }); FETCHES = [];
    const first = await playerForget194(env, (id) => RL.linkRole(roleEnv, "DELETE", id));
    const guard = await deleteGuard194(db);
    const retry = await playerForget194(env, (id) => RL.linkRole(roleEnv, "DELETE", id));
    check(`.194 real-adapter DELETE${status} retains admission/data and blocks a second DELETE, unlike a definite4xx refusal`,
      first.reason === "server" && /keeper/.test(first.message) && !/try again/i.test(first.message) && !!guard && retry.reason === "server" && cleanups === 0
      && FETCHES.filter(f => f.method === "DELETE").length === 1 && JSON.stringify(await deleteGuard194(db)) === JSON.stringify(guard)
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first()), first.reason, retry.reason, cleanups);
  }
  for (const flag of [undefined, false, "true", 1, null]) {
    const env = await seeded(), db = env.LINK_DB; let demotes = 0;
    const first = await playerForget194(env, async () => { demotes++; return { ok: false, reason: "discord", notApplied: flag }; });
    const guard = await deleteGuard194(db);
    const retry = await playerForget194(env, async () => { demotes++; return true; });
    check(`.194 malformed non-application flag ${String(flag)} cannot release admission or invite a retry`,
      first.reason === "server" && /keeper/.test(first.message) && !!guard && retry.reason === "server" && demotes === 1
      && JSON.stringify(await deleteGuard194(db)) === JSON.stringify(guard), first.reason, retry.reason, demotes);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let demotes = 0;
    const first = await playerForget194(env, async () => { demotes++; throw Object.assign(new Error("synthetic unknown DELETE"), { notApplied: true }); });
    const guard = await deleteGuard194(db);
    const retry = await playerForget194(env, async () => { demotes++; return true; });
    check(".194 a thrown object cannot certify non-application even when it carries notApplied:true",
      first.reason === "server" && !!guard && retry.reason === "server" && demotes === 1, first.reason, retry.reason, demotes);
  }
  for (const mode of ["before", "after", "missing-result", "failed-result"]) {
    const env = await seeded(), db = env.LINK_DB; let releases = 0, demotes = 0, cleanups = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const rawBatch = db.batch;
    db.batch = async (statements) => { if (/^SELECT \(?EXISTS \(SELECT 1 FROM codes/.test(statements[0]?.sql || "")) cleanups++; return rawBatch(statements); };
    const restore = interceptRun194(db, async (s, run) => {
      if (!isDeleteRelease194(s)) return run();
      releases++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic definite refusal release before commit");
      const result = await run();
      if (mode === "after") throw new Error("D1_ERROR: synthetic definite refusal release acknowledgement");
      return mode === "missing-result" ? { success: true, meta: {} } : { ...result, success: false };
    });
    const deletion = await playerForget194(env, async () => { demotes++; return { ok: false, reason: "discord", notApplied: true }; }); restore();
    check(`.194 uncertain release after definite refusal (${mode}) does not claim retry permission or repeat DELETE/release/cleanup`,
      deletion.reason === "server" && /keeper/.test(deletion.message) && !/try again/i.test(deletion.message) && releases === 1 && demotes === 1 && cleanups === 0
      && !!(await deleteGuard194(db)) === (mode === "before")
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && !!(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first()), deletion.reason, releases, demotes, cleanups);
  }
  console.log("\n== .194 known no-request preflight: direct composition, not OFF/held route admission ==");
  for (const spec of [
    { name: "off captured adapter", over: { LINK_ENABLED: "false" }, id: USER_C },
    { name: "held captured adapter", over: { LINK_ENABLED: "TRUE" }, id: USER_C },
    { name: "core-accepted five-digit ID", over: {}, id: "12345" },
  ]) {
    const env = await seeded(), db = env.LINK_DB, key = deleteKey194(spec.id), adapter = { ...venv, LINK_DB: db, ...spec.over };
    const character = spec.id === USER_C ? B1.requester : "Preflight Small-Realm";
    if (spec.id === USER_C) await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    else await db.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(character, spec.id, "Olympus II", "r", "Alliance", "0000000000", T).run();
    let cleanups = 0; const acquisitions = [], releases = [], rawBatch = db.batch;
    db.batch = async (statements) => { if (/^SELECT \(?EXISTS \(SELECT 1 FROM codes/.test(statements[0]?.sql || "")) cleanups++; return rawBatch(statements); };
    const restore = interceptRun194(db, async (s, run) => {
      if (/^INSERT(?: OR IGNORE)? INTO limits\b/.test(s.sql) && s.args.includes(key)) acquisitions.push([...s.args]);
      if (/^DELETE FROM limits\b/.test(s.sql) && s.args.includes(key)) releases.push([...s.args]);
      return run();
    });
    FETCHES = []; let demotes = 0;
    const demote = (id) => { demotes++; return RL.linkRole(adapter, "DELETE", id); };
    const first = await core.forgetOwnLink(env, { id: spec.id, username: "fixture.player" }, { demote });
    const denied = { http: FETCHES.length, cleanups, demotes, acquisitions: acquisitions.length, releases: releases.length,
      member: !!(await db.prepare("SELECT 1 AS x FROM members WHERE character = ? AND discord_id = ?").bind(character, spec.id).first()), guard: await deleteGuard194(db, spec.id) };
    const exactFirstOwner = acquisitions.length === 1 && releases.length === 1 && JSON.stringify(releases[0]) === JSON.stringify([key, acquisitions[0][2], acquisitions[0][1]]);
    if (spec.id === USER_C) adapter.LINK_ENABLED = "true";
    responder = discordStub({ members: { [spec.id]: [LINK_ROLE] } });
    const later = await core.forgetOwnLink(env, { id: spec.id, username: "fixture.player" }, { demote }); restore();
    const exactLaterOwner = acquisitions.length === 2 && releases.length === 2 && JSON.stringify(releases[1]) === JSON.stringify([key, acquisitions[1][2], acquisitions[1][1]]);
    check(`.194 ${spec.name} no-request composition releases only its exact admission owner, preserves data and allows a separate later press`,
      first.reason === "discord" && /try again/i.test(first.message) && denied.http === 0 && denied.cleanups === 0 && denied.demotes === 1 && denied.member && !denied.guard && exactFirstOwner && exactLaterOwner
      && acquisitions[0][2] !== acquisitions[1][2] && demotes === (spec.id === USER_C ? 3 : 2) && !(await deleteGuard194(db, spec.id))
      && (spec.id === USER_C ? later.reason === "forgotten" && cleanups === 1 && FETCHES.filter(f => f.method === "DELETE").length === 2
        : later.reason === "discord" && cleanups === 0 && FETCHES.length === 0 && !!(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(spec.id).first())),
      first.reason, later.reason, denied, exactFirstOwner, exactLaterOwner, cleanups, demotes);
  }
  {
    const env = await seeded(), db = env.LINK_DB; let privacyReads = 0;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const adapter = { ...venv, LINK_DB: db, DB: { prepare() { privacyReads++; throw new Error("synthetic ordinary privacy read failure"); } } };
    responder = discordStub({ members: { [USER_C]: [LINK_ROLE] } }); FETCHES = [];
    const deletion = await playerForget194(env, (id) => RL.linkRole(adapter, "DELETE", id));
    check(".194 ordinary privacy-reference read failure is caught locally and still sends DELETE; its confirmed204 permits cleanup",
      deletion.reason === "forgotten" && privacyReads > 0 && FETCHES.length === 2 && FETCHES.every((f) => f.method === "DELETE") && !(await deleteGuard194(db))
      && !(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first()), deletion.reason, privacyReads, FETCHES.map(f => f.method));
  }
  for (const mode of ["before", "after"]) {
    const env = await seeded(), db = env.LINK_DB, adapter = { ...venv, LINK_DB: db, LINK_ENABLED: "false" }; let releases = 0, demotes = 0;
    const restore = interceptRun194(db, async (s, run) => {
      if (!isDeleteRelease194(s)) return run();
      releases++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic no-request release before commit");
      await run(); throw new Error("D1_ERROR: synthetic no-request release acknowledgement");
    });
    FETCHES = [];
    const deletion = await playerForget194(env, (id) => { demotes++; return RL.linkRole(adapter, "DELETE", id); }); restore();
    check(`.194 known no-request preflight with unknown release (${mode}) stays keeper-directed without retrying release or sending HTTP`,
      deletion.reason === "server" && /keeper/.test(deletion.message) && !/try again/i.test(deletion.message) && releases === 1 && demotes === 1 && FETCHES.length === 0
      && !!(await deleteGuard194(db)) === (mode === "before"), deletion.reason, releases, demotes, FETCHES.length);
  }

  // ======================================================================================================================
  console.log("\n== .195: a pending marker blocks deletion only while its code could be in flight; the second removal; lost races settle ==");
  const STUCK_195 = 3600; // the generated forgetUser's STUCK: a marker counts until its code's exp + DELIVERY_GRACE + one hour
  const KEPT_195 = "Nothing is kept about this Discord account but how many codes and links it used today, until that day's limit ends.";
  const elsewhere195 = (character) => `${character} is linked to another Discord account: that account removes its link first, or the bot's keeper does.`;
  const gate195 = () => { let open; const p = new Promise((resolve) => { open = resolve; }); return { get p() { return waitFor194(p); }, open }; };
  /** A fresh LINK_DB with one bootstrap councillor; players sign in through a stubbed oauth2/@me; promote/demote keep a role set. */
  async function world195(over = {}) {
    const db = linkD1(), backend = await backendKeys();
    const env = L.linkEnv({ ...baseVars, ...linkVars(backend, db, over) });
    const keeper = await councillor(core, env, "keep195", "Keeper Five-ClassicBetaPvP", "500000000000000095");
    const users = {}, held = new Set(), calls = [];
    const fetchImpl = async (url, init) => {
      const u = users[String(init.headers.Authorization).replace(/^Bearer /, "")];
      if (!u) return json(401, { message: "401: Unauthorized", code: 0 });
      return json(200, { application: { id: APP, name: "Olympus" }, scopes: ["identify"], expires: "2030-01-01T00:00:00+00:00", user: { id: u.id, username: u.username, avatar: null, global_name: null } });
    };
    const w = {
      db, env, keeper, held, calls,
      user(id, username) { const token = signin("p195", id); users[token] = { id, username }; return { id, username, token }; },
      promote: (wait) => async (id) => { calls.push(["promote", id]); if (wait) await wait; held.add(id); return true; },
      refuse: async (id) => { calls.push(["promote", id]); return false; },
      demote: async (id) => { calls.push(["demote", id]); held.delete(id); return true; },
      async proof(u, character) {
        const code = await core.issueCode(env, { id: u.id, username: u.username });
        if (!code.ok) throw new Error("no code: " + code.reason);
        return { code, ...(await councillorLink(core, code.token, character, T, keeper)) };
      },
      async page(u, body, demote = w.demote, promote = w.promote()) {
        const r = await core.handleProof(upPage({ ...body, discordToken: u.token }), env, { promote, demote, fetchImpl });
        return { http: r.status, ...(await r.json()) };
      },
      forget: (u, demote = w.demote) => w.page(u, { forget: true }, demote),
      used: async (R) => (await db.prepare("SELECT used FROM codes WHERE r = ?").bind(R).first())?.used,
      holder: async (character) => (await db.prepare("SELECT discord_id FROM members WHERE character = ?").bind(character).first())?.discord_id,
      async snapshot() {
        const out = {};
        for (const table of ["used", "inbox_uploads", "council_keys", "revoked_keys", "keys", "members", "codes"]) out[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
        return JSON.stringify(out);
      },
      async naming(values) {
        const hits = [];
        for (const { name } of (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()).results) {
          if ((await db.prepare(`SELECT * FROM ${name}`).all()).results.some((row) => values.some((v) => JSON.stringify(row).includes(v)))) hits.push(name);
        }
        return hits;
      },
      async cutoff(id) { return (await db.prepare("SELECT MAX(exp) AS e FROM codes WHERE discord_id = ? AND used = 0").bind(id).first()).e + core.LINK.DELIVERY_GRACE + STUCK_195; },
      async key(id, keyId) {
        const k = await backendKeys();
        const r = await core.manageKeys(env, { key_id: keyId, public_key: k.publicHex, owner_discord_id: id, character: "Key Holder-ClassicBetaPvP", kind: "c", bootstrap: true });
        if (r.status !== "ok") throw new Error("key not registered: " + r.reason);
        return keyId;
      },
    };
    return w;
  }
  const failUndo195 = (w) => {
    const raw = w.db.batch;
    w.db.batch = async (statements) => { if (statements.some((s) => /^DELETE FROM used WHERE r = \? AND t = \?/.test(s.sql))) throw new Error("D1_ERROR: synthetic undo failure"); return raw(statements); };
    return () => { w.db.batch = raw; };
  };
  /** Holds the first record batch (a new member's by default; round 1: or another member write) until a second one arrives, then runs them one after the other. */
  const bothChecked195 = (w, write = /^INSERT INTO members/) => {
    const raw = w.db.batch, second = gate195(), first = gate195(); let n = 0;
    w.db.batch = async (statements) => {
      if (!statements.some((s) => write.test(s.sql))) return raw(statements);
      if (n++ === 0) { await second.p; const out = await raw(statements); first.open(); return out; }
      second.open(); await first.p; return raw(statements);
    };
    return () => { w.db.batch = raw; };
  };
  // Every way a codes.used = 0 marker is left behind (the review's stuck shapes). Each answers { ok, info }.
  const SHAPES_195 = [
    ["undo failure after a refused PUT", async (w, u) => {
      const p = await w.proof(u, "Stuck Refused-ClassicBetaPvP"), restore = failUndo195(w);
      const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.refuse }); restore();
      return { ok: r.reason === "server" && r.message === PENDING_ROLE_195 && (await w.used(p.R)) === 0 && !w.held.has(u.id), info: r.reason };
    }],
    ["undo failure after a landed PUT", async (w, u) => {
      const p = await w.proof(u, "Stuck Landed-ClassicBetaPvP"), restore = failUndo195(w);
      const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: async (id) => { w.calls.push(["promote", id]); w.held.add(id); return { ok: false, reason: "discord" }; } }); restore();
      return { ok: r.reason === "server" && (await w.used(p.R)) === 0 && w.held.has(u.id), info: r.reason };
    }],
    ["record batch failure before commit", async (w, u) => {
      const p = await w.proof(u, "Stuck Before-ClassicBetaPvP"), raw = w.db.batch;
      w.db.batch = async (statements) => { if (statements.some((s) => /^INSERT INTO members/.test(s.sql))) throw new Error("D1_ERROR: synthetic record failure"); return raw(statements); };
      const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() }); w.db.batch = raw;
      return { ok: r.reason === "server" && (await w.used(p.R)) === 0 && !(await w.holder("Stuck Before-ClassicBetaPvP")) && w.calls.length === 0, info: r.reason };
    }],
    ["record batch failure after commit", async (w, u) => {
      const p = await w.proof(u, "Stuck After-ClassicBetaPvP"), raw = w.db.batch;
      w.db.batch = async (statements) => { const out = await raw(statements); if (statements.some((s) => /^INSERT INTO members/.test(s.sql))) throw new Error("D1_ERROR: synthetic record acknowledgement"); return out; };
      const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() }); w.db.batch = raw;
      return { ok: r.reason === "server" && (await w.used(p.R)) === 0 && (await w.holder("Stuck After-ClassicBetaPvP")) === u.id && w.calls.length === 0, info: r.reason };
    }],
    ["finalization and its readback unconfirmed", async (w, u) => {
      const p = await w.proof(u, "Stuck Final-ClassicBetaPvP"), rawPrepare = w.db.prepare;
      const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)),
        run: async () => { if (/^UPDATE codes SET used = \? WHERE r = \? AND used = 0$/.test(s.sql)) throw new Error("D1_ERROR: synthetic finalization"); return s.run(); },
        first: async () => { if (/^SELECT used FROM codes WHERE r = \?$/.test(s.sql)) throw new Error("D1_ERROR: synthetic readback"); return s.first(); } });
      w.db.prepare = (sql) => wrap(rawPrepare(sql));
      const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() }); w.db.prepare = rawPrepare;
      return { ok: r.reason === "server" && (await w.used(p.R)) === 0 && w.held.has(u.id), info: r.reason };
    }],
    ["isolate death after the claim", async (w, u) => {
      const p = await w.proof(u, "Stuck Dead-ClassicBetaPvP"), raw = w.db.batch, reached = gate195();
      w.db.batch = (statements) => { if (statements.some((s) => /^INSERT INTO members/.test(s.sql))) { reached.open(); return new Promise(() => {}); } return raw(statements); };
      core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() }); // never settles: the isolate is gone
      await reached.p; w.db.batch = raw;
      return { ok: (await w.used(p.R)) === 0 && !(await w.holder("Stuck Dead-ClassicBetaPvP")), info: await w.used(p.R) };
    }],
    // Round 1: S10 (one account's two codes racing for one new character) was the seventh shape; its loser wrote no member
    // row and is released now (below, with the other lost races), so it no longer leaves a marker.
  ];
  for (const [i, [shape, make]] of SHAPES_195.entries()) {
    const savedT = T;
    try {
      const w = await world195(), u = w.user(`70000000000000001${i}`, `stuck.p${i}`), keyId = await w.key(u.id, `stuck195k${i}`);
      const s = await make(w, u);
      const values = [u.id, u.username, ...(await w.db.prepare("SELECT r FROM codes WHERE discord_id = ?").bind(u.id).all()).results.map((x) => x.r)];
      const characters = (await w.db.prepare("SELECT character FROM members WHERE discord_id = ? ORDER BY linked").bind(u.id).all()).results.map((x) => x.character);
      const cutoff = await w.cutoff(u.id), before = await w.snapshot();
      const early = await w.forget(u);
      const keptEarly = (await w.snapshot()) === before, roleAfterRefusal = w.held.has(u.id);
      T = cutoff; const atCutoff = await w.forget(u); const keptAtCutoff = (await w.snapshot()) === before;
      T = cutoff + 1; const late = await w.forget(u);
      const left = await w.naming([...values, ...characters]);
      const revoked = !!(await w.db.prepare("SELECT 1 AS x FROM revoked_keys WHERE key_id = ?").bind(keyId).first());
      check(`.195 stuck shape (${shape}): Delete my link is refused before demotion with every row kept through exp + DELIVERY_GRACE + 1 h, then forgotten one second later with no account rows, its key revoked and no role`,
        s.ok && [early, atCutoff].every((x) => x.http === 500 && x.status === "error" && x.reason === "server" && x.message === PENDING_FORGET_195) && keptEarly && keptAtCutoff && roleAfterRefusal === (shape === "undo failure after a landed PUT" || shape === "finalization and its readback unconfirmed")
        && late.http === 200 && late.status === "forgotten" && JSON.stringify(late.characters) === JSON.stringify(characters) && left.length === 0 && revoked && !w.held.has(u.id),
        s.info, early.message, atCutoff.reason, late.status, late.characters, left, revoked);
    } finally { T = savedT; }
  }
  {
    const savedT = T, w = await world195(), u = w.user("700000000000000020", "late.claim");
    try {
      const p = await w.proof(u, "Late Claim-ClassicBetaPvP");
      T = p.code.exp + core.LINK.DELIVERY_GRACE; // the last second examine still accepts the code
      const put = gate195(), promoting = gate195();
      const work = core.acceptProof(w.env, p.text, { discordId: u.id, promote: async (id) => { w.calls.push(["promote", id]); promoting.open(); await put.p; w.held.add(id); return true; } });
      await promoting.p;
      const atClaim = await w.forget(u);
      T += STUCK_195; const atBound = await w.forget(u);
      const marker = await w.used(p.R);
      put.open(); const done = await work;
      const after = await w.forget(u);
      check(".195 a claim made at exp + DELIVERY_GRACE and still in flight keeps Delete my link refused through exp + DELIVERY_GRACE + 1 h; once it settles, the delete is forgotten and leaves no role",
        [atClaim, atBound].every((x) => x.reason === "server" && x.message === PENDING_FORGET_195) && marker === 0 && done.reason === "linked"
        && after.status === "forgotten" && JSON.stringify(after.characters) === JSON.stringify(["Late Claim-ClassicBetaPvP"]) && !w.held.has(u.id), atClaim.reason, atBound.reason, marker, done.reason, after.status);
    } finally { T = savedT; }
  }
  {
    // Review round 2 (MT2-1): the bound on the inbox_uploads and council_keys statements, for which the stuck shapes above
    // have no rows. A stale marker on an account whose audit lines (its own page proofs, another account's paste of its
    // code, a linked-elsewhere try on its character) and its character's council_keys record come from real flows.
    const savedT = T, ca = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const caHex = Buffer.from(await subtle.exportKey("raw", ca.publicKey)).toString("hex"), CHAR = "Stale Five-ClassicBetaPvP", HELD = "Stale Held-ClassicBetaPvP";
    const w = await world195({ LINK_CA_PUBLIC: caHex, LINK_COUNCIL_CHARACTERS: CHAR });
    const a = w.user("700000000000000021", "stale.five"), b = w.user("700000000000000022", "other.stale");
    try {
      const first = await w.proof(a, CHAR), linked = await w.page(a, { text: first.text });
      const playerKey = await backendKeys();
      const keyReg = await core.manageKeys(w.env, { key_id: "stale5p", public_key: playerKey.publicHex, owner_discord_id: a.id, character: CHAR, kind: "p" });
      const otherUser = await w.page(b, { text: (await councillorLink(core, first.code.token, "Stranger Stale-ClassicBetaPvP", T, w.keeper)).text });
      const bCode = await core.issueCode(w.env, { id: b.id, username: b.username });
      const grabbed = await w.page(b, { text: (await councillorLink(core, bCode.token, CHAR, T, w.keeper)).text });
      const ck = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]), ckRaw = Buffer.from(await subtle.exportKey("raw", ck.publicKey));
      const ckId = await core.councilKeyId(ckRaw.toString("hex")), certExp = T + 365 * 86400, payload = `OLK2.${ckId}.${ckRaw.toString("base64url")}.c.${certExp}.${CHAR}`;
      const authorityKey = { keyId: ckId, character: CHAR, privateKey: ck.privateKey, publicB64: ckRaw.toString("base64url"), certExp, cert: `${payload}.${Buffer.from(await subtle.sign("Ed25519", ca.privateKey, Buffer.from(payload, "utf8"))).toString("base64url")}` };
      const beeLinked = await w.page(b, { text: (await councillorLink(core, bCode.token, "Bee Stale-ClassicBetaPvP", T, authorityKey)).text });
      // The marker: a second code of A whose record batch fails before commit, sent through the page (its own audit line).
      T += 60;
      const stuck = await w.proof(a, HELD), raw = w.db.batch;
      w.db.batch = async (statements) => { if (statements.some((s) => /^INSERT INTO members/.test(s.sql))) throw new Error("D1_ERROR: synthetic record failure"); return raw(statements); };
      const held = await w.page(a, { text: stuck.text }); w.db.batch = raw;
      const one = async (sql, ...args) => (await w.db.prepare(sql).bind(...args).first())?.n;
      const fixture = [
        await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE r = ? AND discord_id = ?", first.R, b.id), await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE requester = ? AND discord_id = ?", CHAR, b.id),
        await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE discord_id = ?", a.id), await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE r = ? AND discord_id = ?", stuck.R, a.id),
        await one("SELECT COUNT(*) AS n FROM council_keys WHERE character = ? AND key_id = ?", CHAR, ckId), await w.used(stuck.R),
      ];
      const cutoff = await w.cutoff(a.id), before = await w.snapshot();
      const early = await w.forget(a); const keptEarly = (await w.snapshot()) === before;
      T = cutoff; const atCutoff = await w.forget(a); const keptAtCutoff = (await w.snapshot()) === before;
      T = cutoff + 1; const late = await w.forget(a);
      const left = await w.naming([a.id, a.username, CHAR, HELD, first.R, stuck.R]);
      const revoked = !!(await w.db.prepare("SELECT 1 AS x FROM revoked_keys WHERE key_id = ?").bind("stale5p").first());
      check(".195 a stale marker no longer holds the inbox_uploads and council_keys rows: refused before the bound and at it with every row kept, forgotten one second later with no row naming the account (audit lines tied by its id, its codes and its character; its character's council_keys record) and its key revoked",
        [linked.reason, keyReg.status, otherUser.reason, grabbed.reason, beeLinked.reason, held.reason].join() === "linked,ok,other-user,linked-elsewhere,linked,server" && fixture.join() === "1,1,2,1,1,0"
        && [early, atCutoff].every((x) => x.http === 500 && x.reason === "server" && x.message === PENDING_FORGET_195) && keptEarly && keptAtCutoff
        && late.http === 200 && late.status === "forgotten" && JSON.stringify(late.characters) === JSON.stringify([CHAR]) && left.length === 0 && revoked && !w.held.has(a.id),
        [linked.reason, keyReg.status, otherUser.reason, grabbed.reason, beeLinked.reason, held.reason], fixture, early.reason, keptEarly, atCutoff.reason, keptAtCutoff, late.status, left, revoked);
    } finally { T = savedT; }
  }
  {
    // Review round 2 (DR2-1): the bound changes nothing on the proof path. Past it a held link still answers 'server' in
    // the pending-role words without a PUT, prune (even a year on) keeps its marker, and only a deletion removes the code.
    const savedT = T, w = await world195(), u = w.user("700000000000000023", "past.bound"), character = "Past Bound-ClassicBetaPvP";
    try {
      const p = await w.proof(u, character), restore = failUndo195(w);
      const held = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.refuse }); restore();
      T = (await w.cutoff(u.id)) + 1;
      const replay = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
      const checked = await core.checkProof(w.env, p.text, { discordId: u.id });
      const pruned = await core.pruneLink(w.env, T + 400 * 86400);
      const marker = await w.used(p.R);
      const afterPrune = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
      const deletion = await w.forget(u);
      const afterDelete = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
      check(".195 past the bound a held link still answers 'server' in the pending-role words with no PUT, prune a year later keeps its marker, and only the account's own Delete my link removes the code (its replay then answers unknown-code)",
        held.reason === "server" && [replay, afterPrune].every((x) => x.reason === "server" && x.message === PENDING_ROLE_195) && checked.reason === "server"
        && pruned.codes === 0 && marker === 0 && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify([character])
        && afterDelete.reason === "unknown-code" && w.calls.filter((c) => c[0] === "promote").length === 1, held.reason, replay.reason, checked.reason, pruned, marker, deletion.status, afterDelete.reason, w.calls);
    } finally { T = savedT; }
  }
  {
    // Review round 2 (FE2-1): audit lines written after a completed delete. The account's own old link sent through the
    // page (unknown-code, its code gone) logs a line under its id, which its next press removes. Another account's paste
    // of that link logs one under that account's id, with the old code and the character: the first account's presses
    // cannot find it, and the other account's own Delete my link removes it.
    const w = await world195(), a = w.user("700000000000000024", "late.lines"), b = w.user("700000000000000025", "late.paster"), character = "Late Lines-ClassicBetaPvP";
    const p = await w.proof(a, character), linked = await w.page(a, { text: p.text });
    const deletion = await w.forget(a);
    const own = await w.page(a, { text: p.text });
    const line = async (id) => (await w.db.prepare("SELECT COUNT(*) AS n FROM inbox_uploads WHERE r = ? AND discord_id = ? AND requester = ?").bind(p.R, id, character).first()).n;
    const ownLine = await line(a.id), again = await w.forget(a), ownLeft = await w.naming([a.id, a.username, p.R, character]);
    const pasted = await w.page(b, { text: p.text });
    const pastedLine = await line(b.id), third = await w.forget(a), stays = await w.naming([p.R, character]);
    const bGone = await w.forget(b), left = await w.naming([a.id, a.username, b.id, b.username, p.R, character]);
    check(".195 audit lines after a completed delete: the account's own late proof (unknown-code) is logged under its id and its next press removes it; another account's paste is logged under that account's id with the old code and character, the first account's presses leave it, and the other account's delete removes it",
      linked.reason === "linked" && deletion.status === "forgotten" && own.reason === "unknown-code" && ownLine === 1 && again.status === "forgotten" && ownLeft.length === 0
      && pasted.reason === "unknown-code" && pastedLine === 1 && third.status === "forgotten" && JSON.stringify(stays) === JSON.stringify(["inbox_uploads"])
      && bGone.status === "forgotten" && JSON.stringify(bGone.characters) === "[]" && left.length === 0, own.reason, ownLine, ownLeft, pasted.reason, pastedLine, stays, bGone.status, left);
  }
  // F2, both halves the second removal covers: the role PUT lands after the first DELETE, and then the link either
  // finalizes (settled) or its promote reports a failure although the role landed (refused, or a throw), so undo removes
  // the member and releases the code (round 1 adds this undone half). Either way the guarded batch finds nothing pending
  // and only the second DELETE takes the role away.
  const DISCORD_REFUSED_195 = "Discord did not take the role change: try again in a minute.";
  const lands195 = (w, promoting, put, outcome) => async (id) => {
    w.calls.push(["promote", id]); promoting.open(); await put.p; w.held.add(id);
    if (outcome === "refused") return { ok: false, reason: "discord" };
    if (outcome === "thrown") throw new Error("synthetic lost PUT acknowledgement");
    return true;
  };
  const landedAs195 = async (w, u, p, character, outcome, proofResult, linkedAt = T) => outcome === "settled"
    ? proofResult?.reason === "linked" && (await w.used(p.R)) === linkedAt && (await w.holder(character)) === u.id
    : proofResult?.status === "error" && proofResult.reason === "discord" && proofResult.message === DISCORD_REFUSED_195 && (await w.used(p.R)) === null && !(await w.holder(character));
  for (const [i, outcome] of ["settled", "refused", "thrown"].entries()) {
    // The first DELETE's answer is slow; the PUT lands meanwhile and its link settles or is undone before the batch.
    const savedT = T, w = await world195(), u = w.user(i ? `70000000000000003${3 + i}` : "700000000000000030", "slow.delete"), character = "Slow Delete-ClassicBetaPvP";
    const p = await w.proof(u, character);
    const put = gate195(), promoting = gate195(), deleted = gate195(), answer = gate195();
    const proofWork = core.acceptProof(w.env, p.text, { discordId: u.id, promote: lands195(w, promoting, put, outcome) });
    await promoting.p;
    // P5 excludes all still-live claims. Exercise the retained late-PUT control after the explicit .195 bound instead.
    T = (await w.cutoff(u.id)) + 1;
    let removals = 0;
    const deleteWork = w.forget(u, async (id) => { w.calls.push(["demote", id]); w.held.delete(id); if (++removals === 1) { deleted.open(); await answer.p; } return true; });
    await deleted.p;
    put.open(); const proofResult = await proofWork;
    const roleAfterPut = w.held.has(u.id), landed = await landedAs195(w, u, p, character, outcome, proofResult, savedT);
    answer.open(); const deletion = await deleteWork;
    const listed = outcome === "settled" ? [character] : [];
    check(`.195 F2 (${outcome}): an already-admitted PUT delayed beyond the pending bound lands after the first DELETE and ${outcome === "settled" ? "finalizes" : "is undone"} before cleanup: the guarded second DELETE leaves no role or account row`,
      landed && roleAfterPut && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify(listed) && removals === 2 && !w.held.has(u.id)
      && deletion.message === (listed.length ? `${character}: no longer linked. ${KEPT_195}` : KEPT_195)
      && (await w.naming([u.id, p.R, character])).length === 0, proofResult?.reason, roleAfterPut, deletion.status, deletion.characters, removals, w.held.has(u.id));
    T = savedT;
  }
  for (const [i, outcome] of ["settled", "refused", "thrown"].entries()) {
    // The first DELETE answers at once; the guarded batch is slow, and the PUT lands and settles or is undone before it.
    const savedT = T, w = await world195(), u = w.user(i ? `70000000000000003${5 + i}` : "700000000000000031", "slow.batch"), character = "Slow Batch-ClassicBetaPvP";
    const p = await w.proof(u, character);
    const put = gate195(), promoting = gate195();
    const proofWork = core.acceptProof(w.env, p.text, { discordId: u.id, promote: lands195(w, promoting, put, outcome) });
    await promoting.p;
    T = (await w.cutoff(u.id)) + 1;
    const raw = w.db.batch; let proofResult = null, roleBeforeBatch = null, landed = null;
    w.db.batch = async (statements) => {
      if (!proofResult && guardedDeletion195(statements)) { put.open(); proofResult = await proofWork; roleBeforeBatch = w.held.has(u.id); landed = await landedAs195(w, u, p, character, outcome, proofResult, savedT); }
      return raw(statements);
    };
    const deletion = await w.forget(u);
    w.db.batch = raw;
    check(`.195 F2 (${outcome}): a PUT landing after the first DELETE whose link ${outcome === "settled" ? "finalizes" : "is undone"} while the guarded batch is slow: forgotten${outcome === "settled" ? " with that character" : ", no character"}, a second DELETE, no role`,
      landed === true && roleBeforeBatch === true && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify(outcome === "settled" ? [character] : [])
      && w.calls.filter((c) => c[0] === "demote").length === 2 && !w.held.has(u.id) && (await w.naming([u.id, p.R, character])).length === 0, proofResult?.reason, roleBeforeBatch, landed, deletion.status, w.calls);
    T = savedT;
  }
  {
    // F2 and F9: a whole proof runs inside the window; the report lists exactly what the batch deleted.
    const savedT = T, w = await world195(), u = w.user("700000000000000032", "whole.proof");
    try {
      const early = await w.proof(u, "Early Link-ClassicBetaPvP");
      const earlyResult = await core.acceptProof(w.env, early.text, { discordId: u.id, promote: w.promote() });
      T += 10;
      const late = await w.proof(u, "Late Link-ClassicBetaPvP");
      const raw = w.db.batch; let lateResult = null;
      w.db.batch = async (statements) => { if (!lateResult && guardedDeletion195(statements)) lateResult = await core.acceptProof(w.env, late.text, { discordId: u.id, promote: w.promote() }); return raw(statements); };
      const deletion = await w.forget(u);
      w.db.batch = raw;
    check(".195 F2/F9: a new whole proof inside guarded cleanup cannot claim or promote; the in-transaction report names exactly the settled character deleted",
        earlyResult.reason === "linked" && lateResult?.reason === "server" && deletion.status === "forgotten"
        && JSON.stringify(deletion.characters) === JSON.stringify(["Early Link-ClassicBetaPvP"]) && deletion.message === `Early Link-ClassicBetaPvP: no longer linked. ${KEPT_195}`
        && !w.held.has(u.id) && (await w.naming([u.id, early.R, late.R, "Early Link-ClassicBetaPvP", "Late Link-ClassicBetaPvP"])).length === 0, lateResult?.reason, deletion.characters, w.held.has(u.id));
    } finally { T = savedT; }
  }
  {
    // F2: the role comes back in the window and the second DELETE is refused: 'discord', the rows are gone, the next press is forgotten.
    const w = await world195(), u = w.user("700000000000000033", "second.refused");
    const p = await w.proof(u, "Second Refused-ClassicBetaPvP");
    await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const raw = w.db.batch; let relanded = false, removals = 0;
    w.db.batch = async (statements) => { if (!relanded && guardedDeletion195(statements)) { relanded = true; w.held.add(u.id); } return raw(statements); };
    const deletion = await w.forget(u, async (id) => { w.calls.push(["demote", id]); if (++removals === 2) return { ok: false, reason: "discord", notApplied: true }; w.held.delete(id); return true; });
    w.db.batch = raw;
    const rowsGone = (await w.naming([u.id, p.R, "Second Refused-ClassicBetaPvP"])).length === 0, roleLeft = w.held.has(u.id);
    const next = await w.forget(u);
    check(".195 F2: a refused second DELETE answers 'discord' in its own words after the rows are gone; the next press removes the role and is forgotten",
      deletion.status === "error" && deletion.reason === "discord" && deletion.message === SECOND_REMOVAL_195 && rowsGone && roleLeft
      && next.status === "forgotten" && JSON.stringify(next.characters) === "[]" && next.message === KEPT_195 && !w.held.has(u.id), deletion.reason, deletion.message, rowsGone, roleLeft, next.status);
  }
  // Round 1: a player who is not in the server. not-in-server from either removal (answered or thrown) is no failure: there
  // is no role to take, and the rows go.
  for (const [i, [label, answer]] of [
    ["both removals answer not-in-server", () => ({ ok: false, reason: "not-in-server" })],
    ["the player leaves between the removals (the second answers not-in-server)", (n) => (n === 1 ? true : { ok: false, reason: "not-in-server" })],
    ["both removals throw a not-in-server error", () => { throw Object.assign(new Error("synthetic member gone"), { reason: "not-in-server" }); }],
  ].entries()) {
    const w = await world195(), u = w.user(`70000000000000007${i}`, "left.server"), character = "Left Server-ClassicBetaPvP";
    const p = await w.proof(u, character);
    const linked = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    let removals = 0;
    const gone = async (id) => { w.calls.push(["demote", id]); w.held.delete(id); return answer(++removals); };
    const deletion = await w.forget(u, gone);
    const left = await w.naming([u.id, p.R, character]);
    const again = await w.forget(u, gone);
    check(`.195 F2: a player not in the server (${label}): forgotten with the character in its exact words after two removals, no row left; the next press is forgotten too`,
      linked.reason === "linked" && deletion.http === 200 && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify([character]) && deletion.message === `${character}: no longer linked. ${KEPT_195}`
      && left.length === 0 && again.status === "forgotten" && JSON.stringify(again.characters) === "[]" && again.message === KEPT_195 && removals === 4, deletion.status, deletion.message, left, again.status, removals);
  }
  {
    // Round 1: forgetOwnLink without demote (upstream's "Without demote, only the data goes"): neither removal is tried.
    const w = await world195(), u = w.user("700000000000000073", "no.demote"), character = "No Demote-ClassicBetaPvP";
    const p = await w.proof(u, character);
    const linked = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const logsBefore = LOGS.length, gone = await core.forgetOwnLink(w.env, { id: u.id, username: u.username }), logged = LOGS.slice(logsBefore);
    check(".195 forgetOwnLink without demote: forgotten with the character, no removal tried (no promote log line), no row left",
      linked.reason === "linked" && gone.status === "forgotten" && JSON.stringify(gone.characters) === JSON.stringify([character]) && logged.length === 0
      && w.calls.filter((c) => c[0] === "demote").length === 0 && (await w.naming([u.id, p.R, character])).length === 0, gone.status, logged);
  }
  {
    // F7: Delete my link through POST /proof on a settled account whose rows come from real flows.
    const savedT = T, ca = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const caHex = Buffer.from(await subtle.exportKey("raw", ca.publicKey)).toString("hex"), CHAR = "Complete Five-ClassicBetaPvP";
    const w = await world195({ LINK_CA_PUBLIC: caHex, LINK_COUNCIL_CHARACTERS: CHAR });
    const a = w.user("700000000000000040", "complete.five"), b = w.user("700000000000000041", "other.five");
    try {
      const first = await w.proof(a, CHAR), linked1 = await w.page(a, { text: first.text });
      T += 60;
      const second = await w.proof(a, CHAR), linked2 = await w.page(a, { text: second.text }); // the first code stays, settled, with its used row
      const playerKey = await backendKeys();
      const keyReg = await core.manageKeys(w.env, { key_id: "complete5p", public_key: playerKey.publicHex, owner_discord_id: a.id, character: CHAR, kind: "p" });
      // Another account pastes A's first link under a made-up character: other-user, tied to A by that code's R only.
      const pasted = await councillorLink(core, first.code.token, "Stranger Five-ClassicBetaPvP", T, w.keeper);
      const otherUser = await w.page(b, { text: pasted.text });
      // It tries A's character with its own code: linked-elsewhere, tied to A by the character only.
      const bCode = await core.issueCode(w.env, { id: b.id, username: b.username });
      const grabbed = await w.page(b, { text: (await councillorLink(core, bCode.token, CHAR, T, w.keeper)).text });
      // The council authority certifies a High Councillor's key for A's character; its first confirmation (of B's own
      // character) records council_keys for A's character.
      const ck = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]), ckRaw = Buffer.from(await subtle.exportKey("raw", ck.publicKey));
      const ckId = await core.councilKeyId(ckRaw.toString("hex")), certExp = T + 365 * 86400, payload = `OLK2.${ckId}.${ckRaw.toString("base64url")}.c.${certExp}.${CHAR}`;
      const authorityKey = { keyId: ckId, character: CHAR, privateKey: ck.privateKey, publicB64: ckRaw.toString("base64url"), certExp, cert: `${payload}.${Buffer.from(await subtle.sign("Ed25519", ca.privateKey, Buffer.from(payload, "utf8"))).toString("base64url")}` };
      const beeLinked = await w.page(b, { text: (await councillorLink(core, bCode.token, "Bee Five-ClassicBetaPvP", T, authorityKey)).text });
      const one = async (sql, ...args) => (await w.db.prepare(sql).bind(...args).first())?.n;
      const fixture = [
        await one("SELECT COUNT(*) AS n FROM used WHERE r = ?", first.R), await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE r = ? AND discord_id = ? AND requester = ?", first.R, b.id, "Stranger Five-ClassicBetaPvP"),
        await one("SELECT COUNT(*) AS n FROM inbox_uploads WHERE r = ? AND discord_id = ? AND requester = ?", bCode.R, b.id, CHAR), await one("SELECT COUNT(*) AS n FROM council_keys WHERE character = ? AND key_id = ?", CHAR, ckId),
        await one("SELECT COUNT(*) AS n FROM keys WHERE key_id = ? AND owner_discord_id = ?", "complete5p", a.id), await one("SELECT COUNT(*) AS n FROM members WHERE character = ? AND r = ?", CHAR, second.R),
      ];
      const deletion = await w.forget(a);
      const left = await w.naming([a.id, a.username, CHAR, first.R, second.R]);
      const revoked = !!(await w.db.prepare("SELECT 1 AS x FROM revoked_keys WHERE key_id = ?").bind("complete5p").first());
      check(".195 F7: Delete my link (POST /proof) on a settled account built from real flows leaves no row naming it: the superseded code's used row, an inbox row tied only by its code (an other-user paste), one tied only by its character (a linked-elsewhere try), its character's council_keys record and its player key (revoked)",
        [linked1.reason, linked2.reason, keyReg.status, otherUser.reason, grabbed.reason, beeLinked.reason].join() === "linked,linked,ok,other-user,linked-elsewhere,linked" && fixture.join() === "1,1,1,1,1,1"
        && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify([CHAR]) && left.length === 0 && revoked && !w.held.has(a.id)
        && (await w.holder("Bee Five-ClassicBetaPvP")) === b.id && !!(await w.db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(bCode.R).first()),
        [linked1.reason, linked2.reason, keyReg.status, otherUser.reason, grabbed.reason, beeLinked.reason], fixture, deletion.status, left, revoked);
    } finally { T = savedT; }
  }
  {
    // F7 with P5: a new same-account proof examined during cleanup cannot claim or record under the held guard.
    const w = await world195(), u = w.user("700000000000000042", "atomic.five");
    const first = await w.proof(u, "Atomic One-ClassicBetaPvP"), linkedFirst = await core.acceptProof(w.env, first.text, { discordId: u.id, promote: w.promote() });
    const second = await w.proof(u, "Atomic Two-ClassicBetaPvP");
    const raw = w.db.batch; let work = null, intercepted = 0, blockedPuts = 0;
    w.db.batch = async (statements) => {
      if (!intercepted && guardedDeletion195(statements)) {
        intercepted++;
        work = core.acceptProof(w.env, second.text, { discordId: u.id, promote: async (id) => { blockedPuts++; w.held.add(id); return true; } });
        await work;
      }
      return raw(statements);
    };
    const deletion = await w.forget(u);
    w.db.batch = raw;
    const marker = await w.used(second.R), members = (await w.db.prepare("SELECT character FROM members WHERE discord_id = ? ORDER BY character").bind(u.id).all()).results.map((m) => m.character);
    const result = await work;
    check(".195 F7: a real new claim inside the cleanup window stays unclaimed without PUT; exact-owned cleanup reports only the settled member and deletes all its codes",
      linkedFirst.reason === "linked" && intercepted === 1 && deletion.status === "forgotten" && result?.reason === "server" && blockedPuts === 0 && marker === undefined
      && JSON.stringify(members) === "[]" && JSON.stringify(deletion.characters) === JSON.stringify(["Atomic One-ClassicBetaPvP"]), deletion.reason, marker, members, result?.reason);
  }
  {
    // F6: one held and one settled character. The page's answers list the settled one only; raw forgetUser reports both.
    const savedT = T, w = await world195(), u = w.user("700000000000000050", "two.chars");
    try {
      const pendy = await w.proof(u, "Pendy Five-ClassicBetaPvP"), restore = failUndo195(w);
      const first = await core.acceptProof(w.env, pendy.text, { discordId: u.id, promote: w.refuse }); restore();
      T += 60;
      const settled = await w.proof(u, "Settled Five-ClassicBetaPvP");
      const linked = await core.acceptProof(w.env, settled.text, { discordId: u.id, promote: w.promote() });
      const already = await w.page(u, { text: settled.text });
      const raw = await core.forgetUser(w.env, u.id);
      check(".195 F6: with one held and one settled character, the 'linked' and 'already' answers list exactly the settled one, and raw forgetUser still reports both",
        first.reason === "server" && linked.reason === "linked" && JSON.stringify(linked.characters) === JSON.stringify(["Settled Five-ClassicBetaPvP"]) && already.reason === "already" && JSON.stringify(already.characters) === JSON.stringify(["Settled Five-ClassicBetaPvP"])
        && JSON.stringify(raw.characters) === JSON.stringify(["Pendy Five-ClassicBetaPvP", "Settled Five-ClassicBetaPvP"]), linked.characters, already.characters, raw.characters);
    } finally { T = savedT; }
  }
  // Upstream's Konig cases (web/test/link-core.test.mjs, "a character linked to another account stays with it" and "two
  // accounts link one character at the same moment"), ported with .195's answers.
  const OLD_195 = "700000000000000099";
  const holderRow195 = (w, character, id) => w.db.sqlite.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, 'Olympus I', 'r', 'Alliance', '1111111111', 1780000000)").run(character, id);
  /** upstream's beforeClaim(): runs write() just before the code's claim, once. */
  const beforeClaim195 = (w, write) => {
    const raw = w.db.prepare;
    w.db.prepare = (sql) => {
      const s = raw(sql);
      if (!/^UPDATE codes SET used = \? WHERE r = \? AND used IS NULL(?:$| AND )/.test(sql)) return s;
      w.db.prepare = raw;
      return { ...s, bind: (...args) => ({ ...s.bind(...args), run: async () => { await write(); return s.bind(...args).run(); } }) };
    };
  };
  for (const [label, setup] of [
    ["held by another account before the check", async (w, character) => { holderRow195(w, character, OLD_195); }],
    ["linked by another account between the check and the claim", async (w, character) => { beforeClaim195(w, () => holderRow195(w, character, OLD_195)); }],
  ]) {
    const w = await world195(), u = w.user("700000000000000060", "konig.five"), character = "Konig Five-ClassicBetaPvP";
    const p = await w.proof(u, character);
    await setup(w, character);
    const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const used = await w.used(p.R), usedRows = (await w.db.prepare("SELECT COUNT(*) AS n FROM used WHERE r = ?").bind(p.R).first()).n, calls = JSON.stringify(w.calls);
    const replay = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const again = await core.issueCode(w.env, { id: u.id, username: u.username });
    const deletion = await w.forget(u);
    check(`.195 Konig, a character ${label}: linked-elsewhere in its exact words, the code unused (handed out again, no daily code spent), no used row, the holder unchanged, no role given or taken, the replay the same, and the player's Delete my link forgotten`,
      r.status === "rejected" && r.reason === "linked-elsewhere" && r.message === elsewhere195(character) && r.R === p.R && used === null && usedRows === 0 && (await w.holder(character)) === OLD_195 && calls === "[]"
      && replay.reason === "linked-elsewhere" && replay.message === r.message && again.token === p.code.token && deletion.status === "forgotten" && deletion.message === KEPT_195 && (await w.holder(character)) === OLD_195,
      r.reason, used, usedRows, calls, replay.reason, deletion.status);
  }
  {
    // The account's own character, deleted and linked by another account between the check and the claim. Its owned-row
    // CAS writes no member row, so (round 1) undo releases the code and the answer is linked-elsewhere, as upstream's;
    // e90251c8 held the code until the deletion bound, because the owned rollback destination was gone.
    const w = await world195(), u = w.user("700000000000000061", "konig.own"), character = "Konig Own-ClassicBetaPvP";
    holderRow195(w, character, u.id);
    const p = await w.proof(u, character);
    beforeClaim195(w, () => { w.db.sqlite.prepare("DELETE FROM members WHERE character = ?").run(character); holderRow195(w, character, OLD_195); });
    const r = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const used = await w.used(p.R), usedRows = (await w.db.prepare("SELECT COUNT(*) AS n FROM used WHERE r = ?").bind(p.R).first()).n, calls = JSON.stringify(w.calls);
    const replay = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() });
    const deletion = await w.forget(u);
    check(".195 Konig, the account's own character taken between the check and the claim (round 1): linked-elsewhere in its exact words, the code released, no used row, the holder unchanged, no PUT, the replay the same, and Delete my link forgotten at once",
      r.status === "rejected" && r.reason === "linked-elsewhere" && r.message === elsewhere195(character) && used === null && usedRows === 0 && calls === "[]" && replay.reason === "linked-elsewhere" && replay.message === r.message
      && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === "[]" && deletion.message === KEPT_195 && (await w.holder(character)) === OLD_195 && !(await w.db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(p.R).first()),
      r.reason, used, usedRows, calls, replay.reason, deletion.status);
  }
  {
    // Two accounts link one new character at the same moment (S11): both pass the check before either records.
    const w = await world195(), m = w.user("700000000000000062", "guild.member"), f = w.user("700000000000000063", "not.in.guild"), character = "Guild Member-ClassicBetaPvP";
    const mine = await w.proof(m, character), theirs = await w.proof(f, character), restore = bothChecked195(w);
    const [a, b] = await Promise.all([core.acceptProof(w.env, mine.text, { discordId: m.id, promote: w.promote() }), core.acceptProof(w.env, theirs.text, { discordId: f.id, promote: w.promote() })]);
    restore();
    const [won, lost] = a.reason === "linked" ? [[a, m, mine], [b, f, theirs]] : [[b, f, theirs], [a, m, mine]];
    const calls = JSON.stringify(w.calls), lostUsed = await w.used(lost[2].R), lostRows = (await w.db.prepare("SELECT COUNT(*) AS n FROM used WHERE r = ?").bind(lost[2].R).first()).n;
    const replay = await core.acceptProof(w.env, lost[2].text, { discordId: lost[1].id, promote: w.promote() });
    const deletion = await w.forget(lost[1]);
    check(".195 Konig / S11, two accounts link one new character at once: one gets it and the one role; the other answers linked-elsewhere (exact words) with its code unused, no used row and no PUT, its replay is refused before anything happens, and its Delete my link is forgotten at once",
      won[0].reason === "linked" && lost[0].status === "rejected" && lost[0].reason === "linked-elsewhere" && lost[0].message === elsewhere195(character)
      && calls === JSON.stringify([["promote", won[1].id]]) && (await w.holder(character)) === won[1].id && lostUsed === null && lostRows === 0
      && replay.reason === "linked-elsewhere" && deletion.status === "forgotten" && deletion.message === KEPT_195 && (await w.holder(character)) === won[1].id && w.held.has(won[1].id),
      a.reason, b.reason, calls, lostUsed, lostRows, replay.reason, deletion.status);
  }
  // Round 1: lost races the account's own other code won (S10 for a new character; two codes re-linking a character it
  // holds). The loser wrote no member row, so its code is released with upstream's "send it again" (no marker, no PUT; it
  // held its code until the deletion bound in e90251c8). Sending it again re-links through the account's own row.
  for (const [i, [label, owned]] of [["S10, a new character", false], ["a character the account already holds", true]].entries()) {
    const w = await world195(), u = w.user(`70000000000000008${i}`, "twin.codes"), character = "Twin Codes-ClassicBetaPvP";
    let held = null;
    if (owned) { const first = await w.proof(u, character); held = await core.acceptProof(w.env, first.text, { discordId: u.id, promote: w.promote() }); }
    const one = await w.proof(u, character);
    await w.db.prepare("UPDATE codes SET exp = ? WHERE r = ?").bind(T + 3600, one.R).run(); // so /verify hands out another code
    const two = await w.proof(u, character), before = w.calls.length, restore = bothChecked195(w, owned ? /^UPDATE members SET guild/ : /^INSERT INTO members/);
    const [a, b] = await Promise.all([one, two].map((p) => core.acceptProof(w.env, p.text, { discordId: u.id, promote: w.promote() }))); restore();
    const [won, lost] = a.reason === "linked" ? [[a, one], [b, two]] : [[b, two], [a, one]];
    const racePuts = w.calls.length - before, lostUsed = await w.used(lost[1].R), lostRows = (await w.db.prepare("SELECT COUNT(*) AS n FROM used WHERE r = ?").bind(lost[1].R).first()).n;
    const resent = await core.acceptProof(w.env, lost[1].text, { discordId: u.id, promote: w.promote() }), puts = w.calls.length - before;
    const resentUsed = await w.used(lost[1].R), holderAfter = await w.holder(character);
    const deletion = await w.forget(u);
    check(`.195 lost race to the account's own other code (${label}): the loser answers server in upstream's words with its code released, no used row and no PUT; sending it again links; Delete my link is forgotten at once`,
      (!owned || held.reason === "linked") && one.R !== two.R && won[0].reason === "linked" && lost[0].status === "error" && lost[0].reason === "server" && lost[0].message === LOST_RECORD_195 && lost[0].R === lost[1].R
      && racePuts === 1 && lostUsed === null && lostRows === 0 && resent.reason === "linked" && resentUsed === T && holderAfter === u.id && puts === 2
      && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify([character]) && !w.held.has(u.id) && (await w.naming([u.id, one.R, two.R, character])).length === 0,
      a.reason, b.reason, lost[0].message, racePuts, lostUsed, lostRows, resent.reason, deletion.status);
  }
  // Round 1: the account's own pending row is undone between another of its codes' check and claim, so that code's owned
  // snapshot is gone; the character is then free, or another account links it first (B9). The late code wrote no member
  // row: released, with linked-elsewhere when another account holds the character, otherwise "send it again" (which then
  // links it anew). Both answered server and held the code until the deletion bound in e90251c8.
  for (const [i, taken] of [false, true].entries()) {
    const w = await world195(), u = w.user(`70000000000000009${i}`, "own.undone"), other = w.user(`70000000000000009${i + 2}`, "other.taker"), character = "Own Undone-ClassicBetaPvP";
    const c2 = await w.proof(u, character);
    await w.db.prepare("UPDATE codes SET exp = ? WHERE r = ?").bind(T + 3600, c2.R).run();
    const c3 = await w.proof(u, character);
    // c2 records its member and its promote is refused; while that promote waits, c3 checks (its snapshot is c2's row) and
    // stops just before its claim until c2 is undone (and, for B9, the other account has linked the character).
    let c3Work = null; const atClaim = gate195(), release = gate195();
    const c2Result = await core.acceptProof(w.env, c2.text, { discordId: u.id, promote: async (id) => {
      w.calls.push(["promote", id]);
      beforeClaim195(w, async () => { atClaim.open(); await release.p; });
      c3Work = core.acceptProof(w.env, c3.text, { discordId: u.id, promote: w.promote() });
      await atClaim.p;
      return false;
    } });
    const c2Released = (await w.used(c2.R)) === null && !(await w.holder(character));
    const takenBy = taken ? await core.acceptProof(w.env, (await w.proof(other, character)).text, { discordId: other.id, promote: w.promote() }) : null;
    release.open(); const r = await c3Work;
    const c3Used = await w.used(c3.R), puts = JSON.stringify(w.calls.filter((c) => c[0] === "promote" && c[1] === u.id));
    const resent = await core.acceptProof(w.env, c3.text, { discordId: u.id, promote: w.promote() });
    const resentUsed = await w.used(c3.R), holderAfter = await w.holder(character);
    const deletion = await w.forget(u);
    check(`.195 own snapshot moved before the claim (${taken ? "B9: another account then links the character" : "the character left free"}): ${taken ? "linked-elsewhere" : "server in upstream's words"}, the code released, no PUT; sent again it ${taken ? "is refused the same way" : "links"}; Delete my link forgotten at once`,
      c2Result.reason === "discord" && c2Released && (!taken || takenBy.reason === "linked") && c3Used === null && puts === JSON.stringify([["promote", u.id]])
      && (taken ? r.status === "rejected" && r.reason === "linked-elsewhere" && r.message === elsewhere195(character) && resent.reason === "linked-elsewhere" && holderAfter === other.id && w.held.has(other.id)
        : r.status === "error" && r.reason === "server" && r.message === LOST_RECORD_195 && resent.reason === "linked" && resentUsed === T && holderAfter === u.id)
      && deletion.status === "forgotten" && JSON.stringify(deletion.characters) === JSON.stringify(taken ? [] : [character]) && !w.held.has(u.id) && (await w.naming([u.id, c2.R, c3.R])).length === 0,
      c2Result.reason, c2Released, takenBy?.reason, r.reason, r.message, c3Used, puts, resent.reason, deletion.status);
  }
  // ======================================================================================================================
  console.log("\n== .195 R10: bounded admission, owned cleanup, second removal and retained fault boundaries ==");
  for (const mode of ["deleted", "unused-after-undo", "pending", "settled", "guard-held", "snapshot-read-fails"]) {
    const w = await world195(), u = w.user("700000000000000111", "snapshot.claim"), p = await w.proof(u, "Snapshot Claim-ClassicBetaPvP");
    const raw = w.db.prepare, key = deleteKey194(u.id); let raced = false, snapshots = 0, puts = 0;
    const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)),
      run: async () => {
        if (!raced && /^UPDATE codes SET used = \? WHERE r = \? AND used IS NULL(?:$| AND )/.test(s.sql)) {
          raced = true;
          if (mode === "deleted") w.db.sqlite.prepare("DELETE FROM codes WHERE r = ?").run(p.R);
          else if (mode === "unused-after-undo" || mode === "guard-held") w.db.sqlite.prepare("INSERT INTO limits (k, until, n) VALUES (?, ?, ?)").run(key, T, 111);
          else w.db.sqlite.prepare("UPDATE codes SET used = ? WHERE r = ?").run(mode === "settled" ? T : 0, p.R);
          const result = await s.run();
          if (mode === "unused-after-undo") w.db.sqlite.prepare("DELETE FROM limits WHERE k = ?").run(key);
          return result;
        }
        return s.run();
      },
      first: async () => {
        if (/^SELECT used, EXISTS \(SELECT 1 FROM limits WHERE k = \?\) AS held FROM codes WHERE r = \?$/.test(s.sql)) {
          snapshots++;
          if (mode === "snapshot-read-fails") throw new Error("D1_ERROR: synthetic claim classification read");
        }
        return s.first();
      },
    });
    w.db.prepare = (sql) => wrap(raw(sql));
    const result = await core.acceptProof(w.env, p.text, { discordId: u.id, promote: async () => { puts++; return true; } }); w.db.prepare = raw;
    const expected = mode === "deleted" ? "unknown-code" : mode === "settled" ? "code-used" : "server";
    check(`.195 R10/F3 one refused-claim snapshot (${mode}) classifies actual code/guard state without a PUT or falsely calling an absent or unused code used`,
      raced && snapshots === 1 && puts === 0 && result.reason === expected
      && (mode !== "unused-after-undo" || result.message === LOST_RECORD_195 && (await w.used(p.R)) === null)
      && (mode !== "guard-held" || !!(await deleteGuard194(w.db, u.id))), result.reason, result.message, snapshots, puts);
  }
  for (const delta of [-1, 0, 1]) {
    const savedT = T, env = await seeded(), db = env.LINK_DB, at = T, live = at - core.LINK.DELIVERY_GRACE - 3600;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    seedCleanupRows195(db, USER_C, B1.requester, B1.R);
    db.sqlite.prepare("UPDATE codes SET used = 0, exp = ? WHERE r = ?").run(live + delta, B1.R);
    const before = cleanupSnapshot195(db); let demotes = 0, acquired;
    const restore = interceptRun194(db, async (s, run) => { if (isDeleteAcquire194(s)) acquired = s; return run(); });
    try {
      const result = await core.forgetOwnLink(env, { id: USER_C, username: "some.player" }, { t: at, demote: async () => { demotes++; return true; } });
      check(`.195 R10 admission exp=live${delta < 0 ? "−1" : delta > 0 ? "+1" : ""}: the atomic acquire uses the captured live bound and refuses every still-live pending marker before either role removal`,
        acquired?.args.includes(live) && (delta < 0
          ? result.reason === "forgotten" && demotes === 2 && !(await deleteGuard194(db)) && !(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first())
          : result.reason === "server" && result.message === PENDING_FORGET_195 && demotes === 0 && !(await deleteGuard194(db)) && cleanupSnapshot195(db) === before),
        result.reason, result.message, demotes, delta);
    } finally { restore(); T = savedT; }
  }
  for (const delta of [-1, 0, 1]) {
    const savedT = T, env = await seeded(), db = env.LINK_DB, at = T, live = at - core.LINK.DELIVERY_GRACE - 3600;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    seedCleanupRows195(db, USER_C, B1.requester, B1.R);
    let demotes = 0, before, owner, statementsSeen, resultSeen;
    const raw = db.batch;
    db.batch = async (statements) => { const r = await raw(statements); if (guardedDeletion195(statements)) { statementsSeen = statements; resultSeen = r; } return r; };
    try {
      const result = await core.forgetOwnLink(env, { id: USER_C, username: "some.player" }, { t: at, demote: async () => {
        if (++demotes === 1) {
          owner = await deleteGuard194(db);
          db.sqlite.prepare("UPDATE codes SET used = 0, exp = ? WHERE r = ?").run(live + delta, B1.R);
          before = cleanupSnapshot195(db);
          T += 120; // Every later predicate must keep the admission's original clock despite awaited work.
        }
        return true;
      } });
      const guarded = statementsSeen && [0, 3, 4, 5, 6, 7, 8, 9].every((i) => statementsSeen[i].args.includes(live)
        && statementsSeen[i].args.includes(owner.k) && statementsSeen[i].args.includes(owner.n) && statementsSeen[i].args.includes(at));
      const reportOnly = statementsSeen && [1, 2].every((i) => JSON.stringify(statementsSeen[i].args) === JSON.stringify([USER_C]));
      const mutations = resultSeen?.slice(3).map((r) => r.meta?.changes);
      check(`.195 R10 cleanup exp=live${delta < 0 ? "−1" : delta > 0 ? "+1" : ""}: probe and all seven seeded mutations share captured pending/owner predicates; report reads carry only the account`,
        statementsSeen?.length === 10 && resultSeen?.length === 10 && guarded && reportOnly && mutations?.length === 7 && (delta < 0
          ? result.reason === "forgotten" && demotes === 2 && mutations.every((n) => n > 0) && !(await deleteGuard194(db))
          : result.reason === "server" && demotes === 1 && mutations.every((n) => n === 0) && cleanupSnapshot195(db) === before && !!(await deleteGuard194(db))),
        result.reason, demotes, guarded, reportOnly, mutations, resultSeen?.[0]);
    } finally { db.batch = raw; T = savedT; }
  }
  {
    const env = await seeded(), db = env.LINK_DB, reached = gate195(), release = gate195();
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    seedCleanupRows195(db, USER_C, B1.requester, B1.R);
    const raw = db.batch; let demotes = 0, releaseWrites = 0, oldOwner;
    db.batch = async (statements) => { if (guardedDeletion195(statements)) { reached.open(); await release.p; } return raw(statements); };
    const restore = interceptRun194(db, async (s, run) => { if (isDeleteRelease194(s)) releaseWrites++; return run(); });
    const work = playerForget194(env, async () => { demotes++; return true; });
    await reached.p; oldOwner = await deleteGuard194(db);
    db.sqlite.prepare("UPDATE limits SET until = until + 1 WHERE k = ?").run(oldOwner.k);
    const before = cleanupSnapshot195(db);
    release.open(); const result = await work; restore(); db.batch = raw;
    check(".195 R10/B10 a delayed old-owner cleanup cannot mutate any seeded category after replacement with the same nonce but a different admission time; no second DELETE or release is attempted",
      result.reason === "server" && demotes === 1 && releaseWrites === 0 && cleanupSnapshot195(db) === before && (await deleteGuard194(db))?.until === oldOwner.until + 1,
      result.reason, demotes, releaseWrites, cleanupSnapshot195(db) === before);
  }
  {
    const w = await world195(), u = w.user("700000000000000110", "second.guard"), character = "Second Guard-ClassicBetaPvP";
    const first = await w.proof(u, character);
    await core.acceptProof(w.env, first.text, { discordId: u.id, promote: w.promote() });
    const reached = gate195(), release = gate195(), events = []; let demotes = 0, during, blockedPuts = 0;
    const work = w.forget(u, async (id) => {
      events.push("DELETE" + (++demotes)); w.held.delete(id);
      if (demotes === 2) { during = await deleteGuard194(w.db, u.id); reached.open(); await release.p; }
      return true;
    });
    await reached.p;
    const fresh = await w.proof(u, character), blocked = await core.acceptProof(w.env, fresh.text, { discordId: u.id, promote: async () => { blockedPuts++; events.push("blocked-PUT"); return true; } });
    const unused = await w.used(fresh.R), stillOwned = await deleteGuard194(w.db, u.id);
    release.open(); const gone = await work;
    const later = await core.acceptProof(w.env, fresh.text, { discordId: u.id, promote: async (id) => { events.push("later-PUT"); w.held.add(id); return true; } });
    check(".195 R10 the exact deletion guard remains held through the second awaited DELETE: a fresh proof stays unused without PUT until release, then an explicit later proof links with one PUT",
      demotes === 2 && !!during && JSON.stringify(stillOwned) === JSON.stringify(during) && unused === null && blocked.reason === "server" && blockedPuts === 0
      && gone.reason === "forgotten" && !(await deleteGuard194(w.db, u.id)) && later.reason === "linked" && w.held.has(u.id)
      && events.join() === "DELETE1,DELETE2,later-PUT", gone.reason, blocked.reason, later.reason, events);
  }
  for (const [label, status, code, definite, success] of [
    ["204", 204, 0, false, true], ["200", 200, 0, false, true], ["404 member gone", 404, 10007, false, true], ["404 role gone", 404, 10011, false, true],
    ["403", 403, 50013, true, false], ["429", 429, 0, true, false], ["500", 500, 0, false, false], ["503", 503, 0, false, false],
    ["409", 409, 0, false, false], ["302", 302, 0, false, false], ["transport", null, 0, false, false],
  ]) {
    const env = await seeded(), db = env.LINK_DB, adapter = { ...venv, LINK_DB: db }, owners = [];
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const ordinary = discordStub({ members: { [USER_C]: [] } }); let deletes = 0, releases = 0;
    responder = (url, init) => {
      if (init.method !== "DELETE") return ordinary(url, init);
      owners.push(db.sqlite.prepare("SELECT k, n, until FROM limits WHERE k = ?").get(deleteKey194()));
      if (++deletes === 1) return json(204, null);
      if (status === null) throw Object.assign(new Error("synthetic second DELETE transport"), { name: "TimeoutError" });
      return json(status, status === 204 ? null : { code, message: "synthetic second outcome" });
    };
    FETCHES = [];
    const restore = interceptRun194(db, async (s, run) => { if (isDeleteRelease194(s)) releases++; return run(); });
    const result = await playerForget194(env, (id) => RL.linkRole(adapter, "DELETE", id));
    const guard = await deleteGuard194(db), rowsGone = !(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()) && !(await db.prepare("SELECT 1 AS x FROM codes WHERE discord_id = ?").bind(USER_C).first());
    let retry;
    if (!success && !definite) retry = await playerForget194(env, (id) => RL.linkRole(adapter, "DELETE", id));
    restore();
    check(`.195 R10 real-adapter second DELETE ${label}: both removals hold the same owner; only confirmed absence or strict non-application releases after acknowledged cleanup`,
      deletes === 2 && owners.length === 2 && owners[0] && JSON.stringify(owners[0]) === JSON.stringify(owners[1]) && rowsGone
      && (success ? result.reason === "forgotten" && !guard && releases === 1
        : definite ? result.reason === "discord" && result.message === SECOND_REMOVAL_195 && !guard && releases === 1
          : result.reason === "server" && !!guard && releases === 0 && retry?.reason === "server"),
      result.reason, result.message, deletes, releases, !!guard, retry?.reason);
  }
  for (const outcome of ["204", "403"]) {
    for (const fault of ["characters-before", "characters-after", "keys-before", "keys-after", "batch-before", "batch-after", "release-before", "release-after"]) {
      const env = await seeded(), db = env.LINK_DB;
      await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
      const rawPrepare = db.prepare, rawBatch = db.batch; let demotes = 0, cleanups = 0, triggered = 0, releaseWrites = 0, inside = false;
      const readPattern = fault.startsWith("characters") ? /^SELECT character FROM members WHERE discord_id = \? ORDER BY linked/ : /^SELECT key_id FROM keys WHERE owner_discord_id = \? AND revoked = 0/;
      const wrap = (s) => ({ ...s, bind: (...args) => wrap(s.bind(...args)),
        all: async () => {
          const hit = inside && /^(characters|keys)-/.test(fault) && readPattern.test(s.sql) && !triggered;
          if (hit && fault.endsWith("before")) { triggered++; throw new Error("D1_ERROR: synthetic report read before answer"); }
          const r = await s.all();
          if (hit) { triggered++; throw new Error("D1_ERROR: synthetic report read after answer"); }
          return r;
        },
        run: async () => {
          if (isDeleteRelease194(s)) {
            releaseWrites++;
            if (fault === "release-before" && !triggered) { triggered++; throw new Error("D1_ERROR: synthetic release before commit"); }
            const r = await s.run();
            if (fault === "release-after" && !triggered) { triggered++; throw new Error("D1_ERROR: synthetic release after commit"); }
            return r;
          }
          return s.run();
        },
      });
      db.prepare = (sql) => wrap(rawPrepare(sql));
      db.batch = async (statements) => {
        if (!guardedDeletion195(statements)) return rawBatch(statements);
        cleanups++;
        if (fault === "batch-before" && !triggered) { triggered++; throw new Error("D1_ERROR: synthetic cleanup before commit"); }
        let r; inside = true;
        try { r = await rawBatch(statements); } finally { inside = false; }
        if (fault === "batch-after" && !triggered) { triggered++; throw new Error("D1_ERROR: synthetic cleanup after commit"); }
        return r;
      };
      const first = await playerForget194(env, async () => { demotes++; return outcome === "403" ? { ok: false, reason: "discord", notApplied: true } : true; });
      const firstState = { guard: await deleteGuard194(db), demotes, cleanups, triggered, releaseWrites,
        member: !!(await db.prepare("SELECT 1 AS x FROM members WHERE discord_id = ?").bind(USER_C).first()) };
      db.prepare = rawPrepare; db.batch = rawBatch;
      const later = await playerForget194(env, async () => { demotes++; return true; });
      const releaseFault = fault.startsWith("release"), expectedFault = outcome === "204" || releaseFault;
      const released = releaseFault && fault.endsWith("after");
      check(`.195 R10/L2 ${outcome} with one-shot ${fault}: reached faults stay held without automatic repair; a committed release alone lets a separate next press finish`,
        firstState.triggered === Number(expectedFault) && (outcome === "403" && !releaseFault
          ? first.reason === "discord" && firstState.cleanups === 0 && !firstState.guard && firstState.member && later.reason === "forgotten" && demotes === 3
          : first.reason === "server" && first.message !== "Something went wrong on our side." && firstState.demotes === (outcome === "204" && releaseFault ? 2 : 1)
            && firstState.releaseWrites === Number(releaseFault) && !!firstState.guard === !released
            && (released ? later.reason === "forgotten" && demotes === firstState.demotes + 2 : later.reason === "server" && demotes === firstState.demotes)),
        first.reason, first.message, firstState, later.reason, demotes);
    }
  }
  const madeUp = (i) => signin("made", "up", String(i).padStart(6, "0"));
  mainSpy.n = 0;
  {
    const e6 = await seeded(); upCalls.length = 0;
    const from = (ip, token) => upProof(e6, B1.bundle, token, { "CF-Connecting-IP": ip });
    const first = [];
    for (let i = 0; i < core.LINK.IP_PER_MINUTE; i++) first.push((await from(`2001:db8:1:2::${(i + 1).toString(16)}`, madeUp(i))).reason);
    const over = await from(`2001:db8:1:2::${(core.LINK.IP_PER_MINUTE + 1).toString(16)}`, madeUp(500));
    const forms = [];
    for (const ip of ["2001:0db8:0001:0002:0000:0000:0000:0001", "2001:DB8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2:a:b:c:d"]) { const r = await from(ip, madeUp(600)); forms.push(r.http === 429 && r.reason === "limit"); }
    const asked = upCalls.length, nextNet = await from("2001:db8:1:3::1", madeUp(700));
    check("an IPv6 address counts by its /64 in upstream's D1 limit: 20 asked of Discord, the 21st and every other form of that /64 are 429 'limit', the next /64 is not", first.every((r) => r === "login") && over.http === 429 && over.reason === "limit" && forms.every(Boolean) && asked === core.LINK.IP_PER_MINUTE && nextNet.reason === "login", first.slice(0, 3), over, forms, asked);
  }
  {
    const ef = await seeded();
    const count = async () => (await ef.LINK_DB.prepare("SELECT COUNT(*) AS n FROM limits").first()).n;
    let under = true;
    for (let i = 0; i < core.LINK.PAGE_PER_MINUTE; i++) if (await core.tooManyRequests(ef, { ip: `10.${i >> 8}.${i & 255}.1`, discordToken: madeUp(i) }, T) !== false) under = false;
    const rows = await count();
    let refused = true;
    for (let i = 0; i < 50; i++) if (await core.tooManyRequests(ef, { ip: `172.16.${i}.1`, discordToken: madeUp(1000 + i) }, T + 1) !== true) refused = false;
    check("tooManyRequests: once the whole page is at its limit, a flood from new addresses is refused and writes no row; a minute later the page counts again", under && rows === 2 * core.LINK.PAGE_PER_MINUTE + 1 && refused && (await count()) === rows && (await core.tooManyRequests(ef, { ip: "172.16.0.1", discordToken: madeUp(1000) }, T + 61)) === false, rows);
  }
  {
    const closed = await seeded({ LINK_COUNCIL_CHARACTERS: undefined });
    const v = await core.checkProof(closed, B5.bundle, { discordId: USER_C });
    const r = await core.acceptProof(closed, B5.bundle, { discordId: USER_C, promote: async () => { throw new Error("no promote expected"); } });
    check("LINK_COUNCIL_CHARACTERS left out: no council-authority certificate counts (closed by default); keys registered here still do",
      !("LINK_COUNCIL_CHARACTERS" in closed) && core.councilCharacters(closed).size === 0 && v.ok === false && v.reason === "not-enough" && new RegExp(`${CK.key_id}: its character is not on LINK_COUNCIL_CHARACTERS`).test(v.message)
      && r.status === "rejected" && r.reason === "not-enough" && (await closed.LINK_DB.prepare("SELECT used FROM codes WHERE r = ?").bind(B5.R).first()).used === null && (await core.checkProof(closed, B1.bundle, { discordId: USER_C })).ok === true, v.reason);
  }
  {
    const ff = await seeded();
    const everything = async () => {
      const out = {};
      for (const { name } of (await ff.LINK_DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()).results) out[name] = (await ff.LINK_DB.prepare(`SELECT * FROM ${name}`).all()).results;
      return JSON.stringify(out);
    };
    await ff.LINK_DB.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(CK.character, "500000000000000077", "Olympus I", "r", "Alliance", "0000000000", 1780000000).run();
    const linkedB5 = await upProof(ff, B5.bundle, signin("some", "player", "0001"));
    await core.logProof(ff, "site", B5.bundle, { status: "rejected", reason: "linked-elsewhere" }, { discordId: USER_A });
    const before = await everything();
    const gone = await core.forgetUser(ff, USER_C);
    const left = await everything();
    check("forgetUser: nothing tied to the Discord account is left in any LINK_DB table (id, username, character, code), and the link no longer checks",
      linkedB5.status === "linked" && [USER_C, B5.requester, B5.R].every((x) => before.includes(x)) && gone.status === "ok" && JSON.stringify(gone.characters) === JSON.stringify([B5.requester])
      && [USER_C, "some.player", B5.requester, B5.R].every((x) => !left.includes(x)) && (await core.checkProof(ff, B5.bundle)).reason === "unknown-code", linkedB5.status, gone);
  }
  {
    const fp = await seeded();
    const add = (sql, ...args) => fp.LINK_DB.prepare(sql).bind(...args).run();
    const linkedB1 = await core.acceptProof(fp, B1.bundle, { discordId: USER_C, promote: async () => {} });
    await add("INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", "OLDCODE000", "123456789012345678", "old.one", "c", "00000000", 1700000000, 1700086400, "x", "discord");
    await add("INSERT INTO used (r, key_id, t) VALUES (?, ?, ?)", "OLDCODE000", "council01", 1700000100);
    await add("INSERT INTO used (r, key_id, t) VALUES (?, ?, ?)", "GONECODE00", "council01", 1700000100);
    await add("INSERT INTO inbox_uploads (source, r, uploaded, status) VALUES (?, ?, ?, ?)", "site", "OLDCODE000", T - core.LINK.LOG_DAYS * 86400 - 1, "rejected");
    await add("INSERT INTO inbox_uploads (source, r, uploaded, status) VALUES (?, ?, ?, ?)", "site", "NEWCODE000", T - 60, "rejected");
    await add("INSERT INTO limits (k, until, n) VALUES (?, ?, ?)", "ip:ended", T - 1, 20);
    await add("INSERT INTO limits (k, until, n) VALUES (?, ?, ?)", "ip:running", T + 30, 3);
    const pr = await core.pruneLink(fp, T);
    const has = async (sql, ...args) => !!(await fp.LINK_DB.prepare(sql).bind(...args).first());
    const keptNow = await has("SELECT 1 AS x FROM codes WHERE r = ?", TOKEN_A.R) && await has("SELECT 1 AS x FROM used WHERE r = ? AND key_id = ?", B1.R, "council01") && !(await has("SELECT 1 AS x FROM codes WHERE r = ?", "OLDCODE000")) && !(await has("SELECT 1 AS x FROM limits WHERE k = ?", "ip:ended"));
    await core.pruneLink(fp, TOKEN_C.exp + core.LINK.DELIVERY_GRACE + 1);
    check("pruneLink (upstream's own; its placement is Phase 1b): what no link can use goes, the links and what counted for them stay",
      linkedB1.status === "linked" && pr.ok && pr.status === "ok" && [pr.codes, pr.used, pr.logs, pr.limits].join() === "1,2,1,1" && keptNow && !(await has("SELECT 1 AS x FROM codes WHERE r = ?", B1.R))
      && (await fp.LINK_DB.prepare("SELECT discord_id FROM members WHERE character = ?").bind(B1.requester).first()).discord_id === USER_C, pr);
  }
  {
    const fr = await seeded();
    const seen = new Set();
    for (const [text, token, origin] of [[B2.bundle, signin("some", "player", "0001")], [B1.bundle, signin("some", "player", "0001")], [B1.bundle, signin("some", "player", "0001")], ["OLB5~x", signin("some", "player", "0001")], [B1.bundle, madeUp(9)], [B1.bundle, signin("some", "player", "0001"), "https://evil.example"]]) seen.add((await upProof(fr, text, token, {}, origin)).reason);
    // .195: one more page pass, a character another account holds (the answer a race lost to another account gets too): linked-elsewhere.
    await fr.LINK_DB.prepare("INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(B3.requester, "500000000000000078", "Olympus I", "r", "Alliance", "0000000000", 1780000000).run();
    seen.add((await upProof(fr, B3.bundle, signin("tester", "two", "00002"))).reason);
    const adapterOwn = ["server", "limit", "format"]; // link.ts's own answers on /proof: held/schema/500, the in-memory filter, the body cap
    check("every reason POST /proof answered here (upstream's flows and the adapter's own answers) is in PROOF_REASONS, which the page has words for",
      [...seen].sort().join() === "already,format,guild-unverified,linked,linked-elsewhere,login,origin" && [...seen, ...adapterOwn].every((r) => core.PROOF_REASONS.includes(r)), [...seen]);
  }
  check("  none of these cases touched the bot's database (linkEnv carries no DB)", mainSpy.n === 0, mainSpy.n);

  // ======================================================================================================================
  console.log("\n== logs ==");
  const ids = [PLAYER, PLAYER2, A, B, C, D, USER_C, USER_A, ACTIVE, RETIRING, ABSENT];
  // .195 review round 1: any run of 15 or more digits counts as a Discord id too, so the ids no list names (the .195
  // worlds' 7000... accounts and keepers among them) are covered.
  const leaks = LOGS.filter((l) => ids.some((id) => l.includes(id)) || /\d{15,}/.test(l) || /OLC2|OLB5|token-of|Bearer|Unknown Member|D1_ERROR|network/.test(l));
  check("no log line holds a Discord id (or any Discord-id-shaped number), a code, a link, a token or an upstream message", leaks.length === 0, leaks.slice(0, 5));
  check("every Link log line is a fixed text plus an errorRef category", LOGS.filter((l) => l.startsWith("olympus-link")).every((l) => /^olympus-link( [a-z_A-Z]+)+ (upstream|d1|timeout|aborted|type|syntax|range|error|thrown)(\(\d{3}\))?$/.test(l)), LOGS.filter((l) => l.startsWith("olympus-link")).slice(0, 5));

  console.error = realError; console.warn = realWarn;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error = realError; console.error(e); process.exit(1); });

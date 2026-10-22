// Build .186 (Olympus Link, Phase 1a; the reviewed integration plan and the owner's rulings of 21 Oct 2026), through the
// REAL src/*.ts (transpiled by TypeScript itself) against the REAL schema in SQLite, with a second SQLite database
// loaded from the vendored upstream schema standing in for LINK_DB. Only Discord's HTTP side is faked.
//   - the generator: vendored bytes match their pins, src/link-core.ts is exactly pristine + P1-P3, drift is refused,
//     and --check also runs through a junction or symlink;
//   - flag OFF is .185: the routes give today's 404 bytes with the same statements, and /verify replies and every
//     main-database statement are byte-identical to the .185 interactions.ts (rebuilt from this one, digest-pinned);
//   - the gate (off, on, held; LINK_ORIGIN exactly the page's origin), linkEnv (no DB key), patches P1-P3 in behaviour;
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
  console.log("== the generator: pristine vendored bytes, exactly P1-P3, drift refused ==");
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
  const originalPatches = gen.PATCHES.filter((p) => !/^P[45]\./.test(p.id));
  check("  every original P1-P3 patch is an exact replacement that must match once (1 + 9 + 1)", originalPatches.length === 11 && originalPatches.every((p) => p.count === 1 && pristine.split(p.find).length === 2));
  let patchInput = pristine; const patchCounts = [];
  for (const p of gen.PATCHES) { const found = patchInput.split(p.find).length - 1; patchCounts.push(found === p.count); if (found === p.count) patchInput = patchInput.split(p.find).join(p.replace); }
  check("P4/P5: fourteen retained P4 replacements and five admission corrections follow the original eleven patches; every sequential seam matches once", gen.PATCHES.length === 30 && gen.PATCHES.filter((p) => p.id.startsWith("P4.")).length === 14 && gen.PATCHES.filter((p) => p.id.startsWith("P5.")).length === 5 && gen.PATCHES.every((p) => p.count === 1) && patchCounts.every(Boolean));
  const body = generated.slice(gen.HEADER.length);
  let undone = body;
  for (const p of [...gen.PATCHES].reverse()) undone = undone.split(p.replace).join(p.find);
  check("  the generated body is the pristine file with exactly those patches undone (nothing else differs)", undone === pristine);
  check("  the header marks it generated, names the commit, the SHA-256 and the MIT notice, and starts with @ts-nocheck", generated.startsWith("// @ts-nocheck\n// GENERATED by worker/scripts/build-link-core.mjs") && generated.includes("d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2") && generated.includes("MIT License") && generated.includes("import { errorRef } from './log';"));
  check("P1: no env.LINK_DB || env.DB fallback is left; a missing LINK_DB throws link_db_missing", !generated.includes("env.LINK_DB || env.DB") && generated.includes("throw new Error('link_db_missing')"));
  const consoles = generated.match(/console\.(error|warn|log)\([^\n]*/g) || [];
  check("P2/P4: the retired release-code log is gone, and finalization/admission logs join the eight remaining fixed-stage errorRef calls", consoles.length === 12 && consoles.every((l) => /^console\.error\('olympus-link', '[a-z_]+', errorRef\((e|err)\)\);$/.test(l)), consoles);
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
  responder = discordStub({ members: { [PLAYER]: [LINK_ROLE] }, oauth: OAUTH }); FETCHES = [];
  const forgot = await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } });
  const fj = JSON.parse(forgot.text);
  check("\"Delete my link\": demote first (one DELETE of LINK_ROLE_ID), then link-core forgets the account's Link rows", forgot.status === 200 && fj.status === "forgotten" && JSON.stringify(fj.characters) === JSON.stringify(["Some Player-ClassicBetaPvP"]) && FETCHES.filter((f) => f.method === "DELETE").length === 1 && FETCHES.find((f) => f.method === "DELETE").url.endsWith(`/members/${PLAYER}/roles/${LINK_ROLE}`)
    && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n === 0 && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM codes WHERE discord_id = ?").get(PLAYER).n === 0 && fj.discordId === undefined, fj);
  const code3 = await core2.issueCode(rlenv, { id: PLAYER, username: "some.player" });
  const link3 = await councillorLink(core2, code3.token, "Some Player-ClassicBetaPvP", T - 5, cnc);
  responder = discordStub({ members: { [PLAYER]: [] }, oauth: OAUTH });
  await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ text: link3.text, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } });
  responder = discordStub({ members: { [PLAYER]: [LINK_ROLE] }, oauth: OAUTH, del: { status: 403, code: 50013 } }); FETCHES = [];
  const keptLink = JSON.parse((await call("https://verify.example/proof", onRoute(), { method: "POST", body: JSON.stringify({ forget: true, discordToken: SIGNIN1 }), headers: { Origin: ORIGIN } })).text);
  check("  definite Discord403 releases only deletion admission, preserves the link and allows a later explicit retry without an automatic DELETE", keptLink.reason === "discord" && /try again/i.test(keptLink.message) && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM members WHERE discord_id = ?").get(PLAYER).n === 1
    && rl.sqlite.prepare("SELECT COUNT(*) AS n FROM limits WHERE k = ?").get(`delete:${sha(`olympus-link-delete~${PLAYER}`)}`).n === 0 && FETCHES.filter((f) => f.method === "DELETE").length === 1);
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
      first.ok === false && first.reason === "server" && /not confirmed/.test(first.message) && persisted.used === 0 && !!(await pendingDb.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(proof.R).first()), first, persisted);
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
      check(`.194 a recovery with a ${mode} owned snapshot cannot overwrite or resurrect the member after its recording pause`,
        race.held.reason === "server" && bResult.ok === false && bPromotes === 0
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
  for (const mode of ["before", "after", "missing-result", "failed-step"]) {
    const env = await seeded(), db = env.LINK_DB;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const rawBatch = db.batch; let cleanups = 0, demotes = 0;
    db.batch = async (statements) => {
      if (!/^SELECT \(?EXISTS \(SELECT 1 FROM codes/.test(statements[0]?.sql || "")) return rawBatch(statements);
      cleanups++;
      if (mode === "before") throw new Error("D1_ERROR: synthetic guarded cleanup before commit");
      const result = await rawBatch(statements);
      if (mode === "after") throw new Error("D1_ERROR: synthetic guarded cleanup acknowledgement");
      if (mode === "missing-result") result[0] = { success: true };
      if (mode === "failed-step") result[3] = { success: false };
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
      deletion.reason === "forgotten" && demotes === 1 && during?.k === deleteKey194() && during.until === T
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
      && puts === 0 && demotes === 1 && !!guard && deletion.reason === "forgotten" && !(await deleteGuard194(db)),
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
      deletion.ok === false && deletion.reason === "server" && releases === 1 && demotes === 1
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
    const env = await seeded(), db = env.LINK_DB; let owner, replacement;
    await core.acceptProof(env, B1.bundle, { discordId: USER_C, promote: async () => true });
    const deletion = await playerForget194(env, async () => {
      owner = await deleteGuard194(db); replacement = owner.n + 1;
      await db.prepare("UPDATE limits SET n = ? WHERE k = ?").bind(replacement, deleteKey194()).run();
      return true;
    });
    check(".194 cleanup itself requires its exact admission owner, preserving all account records when ownership changed during DELETE",
      deletion.ok === false && deletion.reason === "server" && (await deleteGuard194(db))?.n === replacement
      && !!(await db.prepare("SELECT 1 AS x FROM members WHERE r = ?").bind(B1.R).first())
      && !!(await db.prepare("SELECT 1 AS x FROM codes WHERE r = ?").bind(B1.R).first()), deletion.reason, replacement);
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
      && later.reason === "forgotten" && acquisitions === 2 && cleanups === 1 && FETCHES.filter(f => f.method === "DELETE").length === 2
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
    const adapterOwn = ["server", "limit", "format"]; // link.ts's own answers on /proof: held/schema/500, the in-memory filter, the body cap
    check("every reason POST /proof answered here (upstream's flows and the adapter's own answers) is in PROOF_REASONS, which the page has words for",
      [...seen].sort().join() === "already,format,guild-unverified,linked,login,origin" && [...seen, ...adapterOwn].every((r) => core.PROOF_REASONS.includes(r)), [...seen]);
  }
  check("  none of these cases touched the bot's database (linkEnv carries no DB)", mainSpy.n === 0, mainSpy.n);

  // ======================================================================================================================
  console.log("\n== logs ==");
  const ids = [PLAYER, PLAYER2, A, B, C, D, USER_C, USER_A, ACTIVE, RETIRING, ABSENT];
  const leaks = LOGS.filter((l) => ids.some((id) => l.includes(id)) || /OLC2|OLB5|token-of|Bearer|Unknown Member|D1_ERROR|network/.test(l));
  check("no log line holds a Discord id, a code, a link, a token or an upstream message", leaks.length === 0, leaks.slice(0, 5));
  check("every Link log line is a fixed text plus an errorRef category", LOGS.filter((l) => l.startsWith("olympus-link")).every((l) => /^olympus-link( [a-z_A-Z]+)+ (upstream|d1|timeout|aborted|type|syntax|range|error|thrown)(\(\d{3}\))?$/.test(l)), LOGS.filter((l) => l.startsWith("olympus-link")).slice(0, 5));

  console.error = realError; console.warn = realWarn;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error = realError; console.error(e); process.exit(1); });

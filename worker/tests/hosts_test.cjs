// Build .49 (30 Sep 2026): hosts and hygiene, through the REAL src/*.ts (transpiled by TypeScript itself) against the
// REAL schema in SQLite. Covers the host classes (site, bot, legacy 301, unknown 404 without a database touch,
// misconfigured 503), the trimmed public /health versus the watcher's full one, the watcher token rules (unset, short,
// wrong, right; hashed compare), the top-level catch (an id, never the error text), and credentialFetch (never follows
// a redirect, always has a timeout) on the Discord REST client plus a source check that no credential-bearing module
// calls bare fetch. Run from the worker folder:  node tests/hosts_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

function d1(db, opts = {}) {
  const exec = (sql, params) => {
    if (opts.trap) opts.trap(sql);
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => { params = p; return api; },
      first: async () => { if (opts.trap) opts.trap(sql); return db.prepare(sql).get(...params) ?? null; },
      all: async () => { if (opts.trap) opts.trap(sql); return { results: db.prepare(sql).all(...params) }; },
      run: async () => exec(sql, params),
      _exec: () => exec(sql, params),
    };
    return api;
  };
  return {
    prepare: stmt,
    batch: async (stmts) => { db.exec("BEGIN"); try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
  };
}
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  return db;
}
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
const indexMod = load("./index"), index = indexMod.default, ingest = load("./ingest"), discord = load("./discord");

let FETCHES = [];
let fetchResponder = null;
globalThis.fetch = async (url, init = {}) => {
  FETCHES.push({ url: String(url), init });
  if (fetchResponder) return fetchResponder(String(url), init);
  throw new Error("no network in tests: " + url);
};

const TOKEN = "watcher-token-for-tests-only-0123456789";
let db = freshDb();
const env = (over = {}) => ({
  DB: d1(db),
  GUILD_ID: "1549537348516188200",
  DISCORD_APP_ID: "1550176895671341076",
  DISCORD_PUBLIC_KEY: "00",
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_CLIENT_SECRET: "client-secret",
  COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789",
  VERIFY_SECRET: "verify-secret-for-tests",
  WATCHER_TOKEN: TOKEN,
  PUBLIC_BASE_URL: "https://verify.example",
  SITE_HOST: "guild.example",
  SITE_LEGACY_HOSTS: "old.example, Forever.Example",
  SITE_GUILD_ID: "236932545793490944",
  SITE_ADMINS: "472099715253796864",
  ASSETS: { fetch: async (req) => new Response(`/* asset ${new URL(req.url).pathname} */`, { status: 200, headers: { "Content-Type": "text/css" } }) },
  ADMISSION_MODE: "auto",
  ROSTER_MIN_MEMBERS: "0",
  ROSTER_MAX_SHRINK_PCT: "10",
  CHANNEL_SERVER_LOG: "",
  ...over,
});
const ctx = { waitUntil: () => {} };
const get = (url, e = env(), init = {}) => index.fetch(new Request(url, init), e, ctx);
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };

(async () => {
  console.log("\n== host classes ==");
  const cls = (h, e = env()) => indexMod.classifyHost(e, h);
  check("the site host is 'site' (case-insensitive)", cls("guild.example") === "site" && cls("GUILD.example") === "site");
  check("the bot's own host (PUBLIC_BASE_URL) is 'bot', and so are localhost and 127.0.0.1", cls("verify.example") === "bot" && cls("localhost") === "bot" && cls("127.0.0.1") === "bot");
  check("a former site host is 'legacy' (trimmed, case-insensitive)", cls("old.example") === "legacy" && cls("forever.example") === "legacy");
  check("anything else is 'unknown'", cls("nobody.example") === "unknown" && cls("guild.example.evil") === "unknown");
  check("a legacy host without a site to send it to is 'unknown'", cls("old.example", env({ SITE_HOST: "" })) === "unknown");
  for (const bad of ["http://verify.example", "https://verify.example/api", "https://verify.example/?x=1", "verify.example", ""]) {
    check(`PUBLIC_BASE_URL '${bad}' is 'misconfigured' for every host`, cls("guild.example", env({ PUBLIC_BASE_URL: bad })) === "misconfigured" && cls("verify.example", env({ PUBLIC_BASE_URL: bad })) === "misconfigured");
  }

  console.log("\n== what each class gets ==");
  let res = await get("https://old.example/?tab=vote");
  check("GET on a legacy host is a 301 to the same path and query on the site host", res.status === 301 && res.headers.get("Location") === "https://guild.example/?tab=vote", res.status, res.headers.get("Location"));
  check("  cacheable for a day", res.headers.get("Cache-Control") === "public, max-age=86400");
  res = await get("https://forever.example/privacy.html", env(), { method: "HEAD" });
  check("HEAD too", res.status === 301 && res.headers.get("Location") === "https://guild.example/privacy.html");
  res = await get("https://old.example/api/application", env(), { method: "POST", body: "{}" });
  check("a POST on a legacy host is refused, never forwarded", res.status === 404);
  res = await get("https://old.example/auth/callback?code=secret-code&state=signed-state");
  check("an OAuth callback on a legacy host is a restart at the site's front page: 302, no query forwarded, nothing cached (.51)", res.status === 302 && res.headers.get("Location") === "https://guild.example/" && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("Referrer-Policy") === "no-referrer" && !res.headers.has("Set-Cookie") && (await res.text()) === "", res.status, res.headers.get("Location"));
  for (const p of ["/auth/login?consent=1", "/auth/logout", "/oauth/callback?code=x&state=y", "/bnet/link?code=x", "/linked-role"]) {
    res = await get(`https://old.example${p}`);
    check(`  ${p.split("?")[0]} too`, res.status === 302 && res.headers.get("Location") === "https://guild.example/" && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("Referrer-Policy") === "no-referrer" && !res.headers.has("Set-Cookie") && (await res.text()) === "", res.status);
  }
  res = await get("https://old.example/authors?x=1");
  check("  while a path that merely starts with the letters gets the ordinary 301 with its query", res.status === 301 && res.headers.get("Location") === "https://guild.example/authors?x=1");

  console.log("\n== .90 (P-17): the sign-in and OAuth routes are limited per client address ==");
  const fromA = { headers: { "CF-Connecting-IP": "198.51.100.9" } };
  let limited;
  for (let i = 0; i < 21; i++) limited = await get("https://guild.example/auth/login", env(), fromA);
  check("the 21st /auth/login in a minute from one address is 429 with Retry-After 60 and the page headers", limited.status === 429 && limited.headers.get("Retry-After") === "60" && limited.headers.get("Cache-Control") === "no-store, no-transform", limited.status);
  res = await get("https://guild.example/auth/login", env(), { headers: { "CF-Connecting-IP": "198.51.100.10" } });
  check("  another address still starts the sign-in", res.status === 302, res.status);
  for (let i = 0; i < 21; i++) limited = await get("https://verify.example/linked-role", env(), fromA);
  check("  the bot host's Linked Role start likewise: 429 JSON rate_limited with Retry-After", limited.status === 429 && (await limited.json()).error === "rate_limited" && limited.headers.get("Retry-After") === "60", limited.status);
  let touched = 0;
  const trapped = env({ DB: d1(db, { trap: () => { touched++; } }) });
  res = await get("https://nobody.example/health", trapped);
  check("an unknown host is 404 and the database is never touched", res.status === 404 && touched === 0, res.status, touched);
  res = await get("https://nobody.example/interactions", trapped, { method: "POST", body: "{}" });
  check("  not even for a POST to /interactions", res.status === 404 && touched === 0);
  res = await get("https://guild.example/health", env({ PUBLIC_BASE_URL: "http://verify.example" }));
  check("a misconfigured PUBLIC_BASE_URL is 503 on every host", res.status === 503 && (await res.json()).error === "misconfigured");
  res = await get("https://verify.example/health");
  check("the bot host serves the bot's routes", res.status === 200 && (await res.json()).build === "2026-10-10.138 Privacy OAuth response compatibility");
  res = await get("https://guild.example/");
  check("the site host serves the site", res.status === 200 && (await res.text()).includes("Guild Registration"));
  res = await get("https://guild.example/health");
  check("  and does not serve the bot's routes", res.status === 404);
  res = await get("http://localhost:8787/health");
  check("wrangler dev on localhost is served", res.status === 200);

  console.log("\n== the policies: public, every admitted host, no database, no redirect (.65) ==");
  const trappedDb = () => env({ DB: d1(db, { trap: () => { touched++; } }) });
  touched = 0;
  for (const p of ["/privacy", "/privacy-policy", "/privacy.html"]) {
    res = await get(`https://verify.example${p}`, trappedDb());
    check(`GET ${p} on the bot host is the privacy policy, 200 HTML, no Location, database untouched`, res.status === 200 && !res.headers.has("Location") && (await res.text()).includes("<h1>Privacy Policy</h1>") && touched === 0, res.status, touched);
  }
  for (const p of ["/terms", "/tos", "/terms-of-service", "/terms.html"]) {
    res = await get(`https://guild.example${p}`, trappedDb());
    check(`GET ${p} on the site host is the terms, 200 HTML, database untouched`, res.status === 200 && (await res.text()).includes("<h1>Terms of Service</h1>") && touched === 0, res.status);
  }
  res = await get("https://verify.example/privacy", env(), { method: "HEAD" });
  check("HEAD answers 200 with the headers and no body", res.status === 200 && (await res.text()) === "" && /text\/html/.test(res.headers.get("Content-Type")));
  check("  a strict self-only CSP with scripts disabled, no-store, no cookie", /default-src 'none'/.test(res.headers.get("Content-Security-Policy")) && /script-src 'none'/.test(res.headers.get("Content-Security-Policy")) && /no-store/.test(res.headers.get("Cache-Control") || "") && !res.headers.has("Set-Cookie"), res.headers.get("Content-Security-Policy"), res.headers.get("Cache-Control"));
  res = await get("https://verify.example/privacy", env(), { method: "POST", body: "x" });
  check("POST is 405 with Allow: GET, HEAD", res.status === 405 && res.headers.get("Allow") === "GET, HEAD");
  res = await get("http://guild.example/privacy");
  check("plain http on the site host is upgraded to https first", res.status === 301 && res.headers.get("Location") === "https://guild.example/privacy", res.status, res.headers.get("Location"));
  touched = 0; res = await get("https://old.example/privacy?code=secret-code&state=signed-state", trappedDb());
  check("a legacy privacy route restarts at the site front page: 302, query dropped, exact current cache/referrer headers, no cookie/body/database", res.status === 302 && res.headers.get("Location") === "https://guild.example/" && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("Referrer-Policy") === "no-referrer" && !res.headers.has("Set-Cookie") && (await res.text()) === "" && touched === 0, res.status, res.headers.get("Location"), touched);
  res = await get("https://nobody.example/privacy", trappedDb());
  check("an unknown host still gets nothing", res.status === 404 && touched === 0);
  res = await get("https://verify.example/static/policies.css");
  check("the policy stylesheet is the one static file the bot host serves", res.status === 200 && /text\/css/.test(res.headers.get("Content-Type")));
  res = await get("https://verify.example/static/policies.css", env(), { method: "POST" });
  check("  and only to GET/HEAD", res.status === 405);
  check("the generated document is the tracked text: `npm run check:policies` agrees (run here)", require("child_process").spawnSync(process.execPath, [path.join(root, "scripts", "build-policy-content.mjs"), "--check"], { encoding: "utf8" }).status === 0);
  check("  the tracked privacy text appears verbatim inside the served page", (await (await get("https://guild.example/privacy")).text()).includes(fs.readFileSync(path.join(root, "..", "policies", "privacy.html"), "utf8").match(/<h2>What it stores<\/h2>\n<p>[^<]{40}/)[0]));

  console.log("\n== the site's static files go through the host check (.51) ==");
  res = await get("https://guild.example/static/app.css?v=x");
  check("on the site host a static file comes from the assets binding", res.status === 200 && (await res.text()).includes("/static/app.css"), res.status);
  res = await get("https://guild.example/static/wow/morpheus.woff2", env(), { method: "HEAD" });
  check("  HEAD too", res.status === 200);
  touched = 0;
  res = await get("https://nobody.example/static/app.css", env({ DB: d1(db, { trap: () => { touched++; } }) }));
  check("on an unknown host the same path is 404 and nothing is touched", res.status === 404 && touched === 0, res.status);
  res = await get("https://old.example/static/app.css");
  check("on a legacy host it is the ordinary 301 to the site", res.status === 301 && res.headers.get("Location") === "https://guild.example/static/app.css");
  res = await get("https://verify.example/static/app.css");
  check("on the bot's host it is 404 (the bot has no files)", res.status === 404, res.status);
  res = await get("https://guild.example/static/app.css", env(), { method: "POST" });
  check("a POST for a static file is not handed to the binding", res.status !== 200, res.status);

  console.log("\n== /health: public versus the watcher's ==");
  res = await get("https://verify.example/health");
  let body = await res.json();
  check("without a bearer: ok, build and d1, nothing else", res.status === 200 && Object.keys(body).sort().join(",") === "build,d1,ok" && body.d1 === "ok", JSON.stringify(body));
  res = await get("https://verify.example/health", env(), { headers: { Authorization: `Bearer ${TOKEN}` } });
  body = await res.json();
  check("with the watcher's bearer: the inventory (secrets present, relays, site, retention)", body.secrets && body.secrets.WATCHER_TOKEN === true && body.relays && body.site && body.site.host === "guild.example" && body.bnetRetention, Object.keys(body).join(","));
  res = await get("https://verify.example/health", env(), { headers: { Authorization: "Bearer wrong-token-for-tests-only-0123456789" } });
  body = await res.json();
  check("with a wrong bearer: the public answer, not a 401", res.status === 200 && Object.keys(body).sort().join(",") === "build,d1,ok");
  const broken = env({ DB: d1(db, { trap: (sql) => { if (/FROM members/.test(sql)) throw new Error("D1_ERROR: no such table: members (secret detail)"); } }) });
  res = await get("https://verify.example/health", broken);
  body = await res.json();
  check("a D1 failure is 'error' to the public and the bounded category to the watcher (.55)", body.d1 === "error" && (await (await get("https://verify.example/health", broken, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()).d1 === "error: d1");

  console.log("\n== the watcher's token ==");
  const auth = (token, header) => ingest.watcherAuthorized(env({ WATCHER_TOKEN: token }), new Request("https://verify.example/queue", header === undefined ? {} : { headers: { Authorization: header } }));
  check("the right token is accepted", await auth(TOKEN, `Bearer ${TOKEN}`));
  check("a wrong token of the same length is refused", !(await auth(TOKEN, "Bearer watcher-token-for-tests-only-9876543210")));
  check("no header is refused", !(await auth(TOKEN)));
  check("a non-bearer scheme is refused", !(await auth(TOKEN, `Basic ${TOKEN}`)));
  check("an unset WATCHER_TOKEN refuses everyone, even 'Bearer ' with nothing after it", !(await auth(undefined, "Bearer ")) && !(await auth("", "Bearer ")));
  check("a token shorter than 32 characters refuses everyone, even the exact value", !(await auth("short-token-31-characters-long1", "Bearer short-token-31-characters-long1")));
  check("  exactly 32 is accepted", await auth("exactly-32-characters-long-tok1x", "Bearer exactly-32-characters-long-tok1x"));
  res = await get("https://verify.example/queue?officer=x", env({ WATCHER_TOKEN: "" }), { headers: { Authorization: "Bearer " } });
  check("through the route: 401", res.status === 401);
  res = await get("https://verify.example/admin/guild-map", env({ WATCHER_TOKEN: "" }), { headers: { Authorization: "Bearer " } });
  check("  the admin routes too", res.status === 401);

  console.log("\n== the top-level catch ==");
  const errLog = [];
  const realConsoleError = console.error;
  console.error = (...a) => { errLog.push(a.map(String).join(" ")); };
  fetchResponder = () => { throw new Error("upstream exploded with a token in the message: Bot abc.def.ghi"); };
  res = await get("https://verify.example/admin/guild-map", env(), { headers: { Authorization: `Bearer ${TOKEN}` } });
  body = await res.json();
  console.error = realConsoleError;
  check("an unhandled error is 500 with a request id and no error text", res.status === 500 && body.error === "internal" && /^[0-9a-f]{8}$/.test(body.requestId) && !JSON.stringify(body).includes("abc.def"), JSON.stringify(body));
  check("  the log line carries the request id, the path and the error's category, never its text (.51)", errLog.length === 1 && errLog[0].includes(body.requestId) && errLog[0].includes("/admin/guild-map") && /\berror\b/.test(errLog[0]) && !errLog[0].includes("abc.def") && !errLog[0].includes("exploded"), errLog.join(" | "));
  fetchResponder = null;

  console.log("\n== what a failure may say in the log (.51) ==");
  const logMod = load("./log");
  const CATEGORIES = ["upstream", "d1", "timeout", "aborted", "type", "syntax", "range", "error", "thrown"];
  const isRef = (r) => new RegExp(`^(${CATEGORIES.join("|")})(\\([1-5][0-9]{2}\\))?$`).test(r);
  const SECRETS = ["abc.def.ghi", "K7Q2M9", "Tag#1234", "Bearer", "cookie="];
  const leaks = (r) => SECRETS.filter((s) => r.includes(s));
  const poisoned = new Error("upstream said: Bot abc.def.ghi code K7Q2M9 for Tag#1234");
  poisoned.name = "Tag#1234 cookie=abc.def.ghi"; // a name can carry text too (Codex 00:42)
  const ref = logMod.errorRef(poisoned);
  check("errorRef is a fixed category: nothing from the message, nothing from the name, no digest of either", ref === "error" && leaks(ref).length === 0, ref);
  check("  the same category for every message: it is not a fingerprint", logMod.errorRef(new Error("other text")) === ref);
  check("  an upstream failure is its category and a bounded status", logMod.errorRef(new discord.DiscordError(403, "/x?token=abc.def.ghi", '{"code":50013,"message":"Bearer abc.def.ghi"}')) === "upstream(403)");
  check("  a status outside 100-599 is dropped", logMod.errorRef(Object.assign(new Error("x"), { status: 99999 })) === "upstream" && logMod.errorRef(Object.assign(new Error("x"), { status: -1 })) === "upstream");
  check("  a D1 failure is 'd1' by its prefix, its text dropped", logMod.errorRef(new Error("D1_ERROR: no such column: battletag Tag#1234")) === "d1");
  check("  timeouts, aborts, type, syntax and range errors by their kind", logMod.errorRef(Object.assign(new Error("t"), { name: "TimeoutError" })) === "timeout" && logMod.errorRef(Object.assign(new Error("a"), { name: "AbortError" })) === "aborted" && logMod.errorRef(new TypeError("Bearer abc.def.ghi")) === "type" && logMod.errorRef(new SyntaxError("K7Q2M9")) === "syntax" && logMod.errorRef(new RangeError("r")) === "range");
  check("  a thrown string, object or null is 'thrown', never printed", logMod.errorRef("Bearer abc.def.ghi") === "thrown" && logMod.errorRef({ message: "Tag#1234", name: "K7Q2M9", toString: () => "cookie=abc.def.ghi" }) === "thrown" && logMod.errorRef(null) === "thrown" && logMod.errorRef(undefined) === "thrown");
  check("  every answer above is one of the allowed forms", [poisoned, new discord.DiscordError(500, "/", ""), new Error("D1_EXEC_ERROR"), "s", 42n, Symbol("x")].map((v) => logMod.errorRef(v)).every(isRef));
  check("  a custom_id is logged by its namespace only", logMod.idNamespace("ban:discord:123456789012345678") === "ban" && logMod.idNamespace(undefined) === "");
  const srcs = ["index.ts", "intros.ts", "names.ts", "site-admin.ts", "site-api.ts", "site-queue.ts", "bnet-retention.ts", "oauth.ts", "ingest.ts", "roster.ts", "restore.ts", "unverified.ts", "review.ts", "interactions.ts", "lookup.ts", "guide.ts", "site.ts", "discord.ts", "guild-seats.ts", "site-news.ts", "schema.ts"]; // .115: the seat state and News; schema.ts since its first console call (redactSettingsAudit; review of 3 Oct 2026)
  const bareConsole = srcs.flatMap((f) => (fs.readFileSync(path.join(root, "src", f), "utf8").match(/console\.(error|warn|log)\([^\n]*/g) || []).filter((l) => !/errorRef\(/.test(l)).map((l) => `${f}: ${l.slice(0, 80)}`));
  check("no console call in src/ prints an error object or message (every one goes through errorRef)", bareConsole.length === 0, bareConsole.join("\n    "));

  console.log("\n== the entry's exports (.51) ==");
  const named = Object.entries(indexMod).filter(([k]) => k !== "default");
  check("the entry exports the handler and functions only: workerd refuses a scalar export at startup", typeof indexMod.default?.fetch === "function" && typeof indexMod.default?.scheduled === "function" && named.every(([, v]) => typeof v === "function"), named.filter(([, v]) => typeof v !== "function").map(([k]) => k).join(","));

  console.log("\n== credentialFetch ==");
  FETCHES = [];
  fetchResponder = () => new Response(JSON.stringify({ id: "1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  await discord.rest(env(), "GET", "/users/@me");
  check("the Discord REST client never follows redirects and always has a timeout", FETCHES.length === 1 && FETCHES[0].init.redirect === "manual" && FETCHES[0].init.signal instanceof AbortSignal, JSON.stringify(Object.keys(FETCHES[0]?.init ?? {})));
  fetchResponder = () => new Response(null, { status: 302, headers: { Location: "https://evil.example/" } });
  let threw = null;
  try { await discord.rest(env(), "GET", "/users/@me"); } catch (e) { threw = e; }
  check("a 3xx from Discord is a failure, not a hop", threw && threw.status === 302, threw && threw.message);
  FETCHES = [];
  fetchResponder = () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  const caller = new AbortController();
  await discord.credentialFetch("https://discord.example/x", { signal: caller.signal });
  const composed = FETCHES[0]?.init?.signal;
  caller.abort();
  check("a caller's signal is composed with the deadline, not substituted for it (.51): the request sees a new signal that follows the caller's abort", composed instanceof AbortSignal && composed !== caller.signal && composed.aborted === true, composed && composed.aborted);
  const alone = discord.withDeadline(undefined, 50);
  await new Promise((r) => setTimeout(r, 80));
  check("  and the deadline alone still fires", alone.aborted === true && alone.reason?.name === "TimeoutError", alone.reason && alone.reason.name);
  fetchResponder = null;
  for (const f of ["oauth.ts", "bnet-retention.ts", "site.ts", "discord.ts"]) { // bnet.ts went in .50
    const src = fs.readFileSync(path.join(root, "src", f), "utf8");
    const bare = (src.match(/\bawait fetch\(/g) || []).length;
    check(`${f} makes no bare fetch call (every credential-bearing call goes through credentialFetch)`, bare === 0, bare);
  }
  const helper = fs.readFileSync(path.join(root, "src", "discord.ts"), "utf8");
  check("credentialFetch itself sets redirect manual and an 8 s timeout", /redirect: "manual"/.test(helper) && /AbortSignal\.timeout\(ms\)/.test(helper) && /withDeadline\(init\.signal/.test(helper) && /CREDENTIAL_FETCH_TIMEOUT_MS = 8000/.test(helper));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

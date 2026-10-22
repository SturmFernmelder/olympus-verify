// Build .49 (30 Sep 2026): hosts and hygiene, through the REAL src/*.ts (transpiled by TypeScript itself) against the
// REAL schema in SQLite. Covers the host classes (site, bot, legacy 301, unknown 404 without a database touch,
// misconfigured 503), the trimmed public /health versus the watcher's full one, the watcher token rules (unset, short,
// wrong, right; hashed compare), the top-level catch (an id, never the error text), and credentialFetch (never follows
// a redirect, always has a timeout) on the Discord REST client plus a source check that no credential-bearing module
// calls bare fetch. Run from the worker folder:  node tests/hosts_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const entryFixture = require("./helpers/privacy129_fixture.cjs");

function d1(db, opts = {}) { return entryFixture.originalNativePort(db,{statement:opts.trap}); }
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  entryFixture.installCurrentEntryEpoch(db);
  return db;
}
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = {};
function load(name) {
  if(name === "node:async_hooks") return require(name);
  const file = path.join(root, "src", name.replace(/^\.\//, "") + ".ts");
  if (cache[file]) return cache[file].exports;
  const mod = { exports: {} };
  cache[file] = mod;
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
let FETCHES = [];
let fetchResponder = null;
globalThis.fetch = async (url, init = {}) => {
  FETCHES.push({ url: String(url), init });
  if (fetchResponder) return fetchResponder(String(url), init);
  throw new Error("no network in tests: " + url);
};


const indexMod = load("./index"), index = indexMod.default, ingest = load("./ingest"), discord = load("./discord");

const TOKEN = "watcher-token-for-tests-only-0123456789";
let db = freshDb();
const env = (over = {}) => entryFixture.currentEntryEnvironment({
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
  check("the bot host serves the bot's routes", res.status === 200 && (await res.json()).build === "2026-10-21.193 Level-60 character sheet");
  res = await get("https://guild.example/");
  check('the site host serves only the sign-in gate before entry', res.status === 200 && (await res.text()).includes('Enter Olympus'));
  res = await get("https://guild.example/health");
  check('the signed-out site host discloses no bot route', res.status === 401);
  res = await get("http://localhost:8787/health");
  check("wrangler dev on localhost is served", res.status === 200);

  console.log("\n== the policies: canonical readers, exact retired roots and remaining aliases, no database ==");
  const trappedDb = () => env({ DB: d1(db, { trap: () => { touched++; } }) });
  touched = 0;
  for (const p of ["/privacy", "/terms"]) {
    for (const host of ["verify.example", "guild.example"]) {
      for (const method of ["GET", "HEAD"]) {
        res = await get(`https://${host}${p}?code=not-forwarded&state=not-forwarded`, trappedDb(), { method, headers: { Cookie: "retired-link-does-not-read-a-session" } });
        check(`${method} ${p} on ${host} is retired with 410, no redirect, body, cookie or database`, res.status === 410 && !res.headers.has("Location") && (await res.text()) === "" && !res.headers.has("Set-Cookie") && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("Referrer-Policy") === "no-referrer" && /script-src 'none'/.test(res.headers.get("Content-Security-Policy") || "") && touched === 0, res.status, touched);
      }
    }
  }
  for (const p of ["/privacy-policy", "/privacy.html"]) {
    res = await get(`https://verify.example${p}`, trappedDb());
    check(`GET ${p} on the bot host redirects only to the canonical privacy reader, empty body and database untouched`, res.status === 301 && res.headers.get("Location") === "/legal/privacy" && (await res.text()) === "" && touched === 0, res.status, touched);
    res = await get(`https://verify.example${p}?code=not-forwarded`, trappedDb(), { method: "HEAD" });
    check(`HEAD ${p} redirects to the same fixed path without query, cookie, body or database`, res.status === 301 && res.headers.get("Location") === "/legal/privacy" && (await res.text()) === "" && !res.headers.has("Set-Cookie") && touched === 0);
  }
  for (const p of ["/tos", "/terms-of-service", "/terms.html"]) {
    res = await get(`https://guild.example${p}`, trappedDb());
    check(`GET ${p} on the site host redirects only to the canonical terms reader, empty body and database untouched`, res.status === 301 && res.headers.get("Location") === "/legal/terms" && (await res.text()) === "" && touched === 0, res.status);
    res = await get(`https://guild.example${p}?state=not-forwarded`, trappedDb(), { method: "HEAD" });
    check(`HEAD ${p} redirects to the same fixed path without query, cookie, body or database`, res.status === 301 && res.headers.get("Location") === "/legal/terms" && (await res.text()) === "" && !res.headers.has("Set-Cookie") && touched === 0);
  }
  for (const [p, title] of [["/legal/privacy", "Privacy Policy"], ["/legal/terms", "Terms of Service"]]) {
    for (const host of ["verify.example", "guild.example"]) {
      res = await get(`https://${host}${p}`, trappedDb());
      check(`GET ${p} on ${host} is public canonical 200 HTML without redirect or database`, res.status === 200 && !res.headers.has("Location") && (await res.text()).includes(`<h1>${title}</h1>`) && touched === 0);
      res = await get(`https://${host}${p}`, trappedDb(), { method: "HEAD" });
      check(`HEAD ${p} on ${host} retains headers with no body, cookie or database`, res.status === 200 && /text\/html/.test(res.headers.get("Content-Type")) && (await res.text()) === "" && !res.headers.has("Set-Cookie") && touched === 0);
    }
  }
  res = await get("https://verify.example/legal/privacy", env(), { method: "HEAD" });
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
  check("  the tracked privacy text appears verbatim inside the served page", (await (await get("https://guild.example/legal/privacy")).text()).includes(fs.readFileSync(path.join(root, "..", "policies", "privacy.html"), "utf8").match(/<h2>What it stores<\/h2>\n<p>[^<]{40}/)[0]));
  const picturePolicy = (await (await get("https://guild.example/legal/privacy")).text()).replace(/\s+/g, " ");
  check("  .169 privacy discloses own chrome and authenticated recommendation pictures, the single Discord CDN and local board portraits without a new picture archive", picturePolicy.includes("The site's top bar and welcome panel show your own Discord picture.") && picturePolicy.includes("Authenticated recommendation searches also show people's public Discord profile pictures when available.") && picturePolicy.includes("Your browser loads these pictures from Discord's picture server (cdn.discordapp.com), so Discord sees that request.") && picturePolicy.includes("Voting-board cards and other member portraits continue to use the game's icons.") && picturePolicy.includes("These lookups do not create a separate archive of pictures.") && !picturePolicy.includes("the site shows that picture to no one else"));

  console.log("\n== .173 exact public login variants, site host only ==");
  let loginCalls = [], loginTouches = 0;
  const loginEnv = env({ DB: d1(db, { trap: () => { loginTouches++; throw Error('public login media must not touch D1'); } }), ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname;
    loginCalls.push({ path, method: request.method, range: request.headers.get('Range') });
    return new Response('exact-login-media', { status: 200, headers: { 'Content-Type': 'image/png', ETag: '"login-media-test"' } });
  } } });
  for (const path of ['/static/wow/login/olympus-dark-portal-wide.png', '/static/wow/login/olympus-dark-portal-portrait.png']) {
    let before = loginCalls.length;
    res = await get('https://guild.example' + path, loginEnv);
    check('signed-out GET serves only this exact login asset without session/D1: ' + path, res.status === 200 && await res.text() === 'exact-login-media' && loginCalls.length === before + 1 && loginTouches === 0 && res.headers.get('Content-Type') === 'image/png');
    check('public login asset retains no-store, noindex, no-sniff, frame/camera denial and no cookie: ' + path, res.headers.get('Cache-Control') === 'private, no-store, no-transform' && res.headers.get('Vary') === 'Cookie' && /noindex/.test(res.headers.get('X-Robots-Tag')) && res.headers.get('X-Content-Type-Options') === 'nosniff' && res.headers.get('X-Frame-Options') === 'DENY' && res.headers.get('Permissions-Policy') === 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' && !res.headers.has('Set-Cookie'));
    before = loginCalls.length;
    res = await get('https://guild.example' + path, loginEnv, { method: 'HEAD' });
    check('public login HEAD is explicitly bodyless while retaining media/ETag/security: ' + path, res.status === 200 && await res.text() === '' && res.headers.get('ETag') === '"login-media-test"' && loginCalls.length === before + 1 && loginCalls.at(-1).method === 'HEAD' && loginTouches === 0 && /no-store/.test(res.headers.get('Cache-Control')));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      before = loginCalls.length;
      res = await get('https://guild.example' + path, loginEnv, { method });
      check(method + ' cannot reach login assets or D1: ' + path, res.status === 405 && res.headers.get('Allow') === 'GET, HEAD' && loginCalls.length === before && loginTouches === 0 && !res.headers.has('Set-Cookie') && /script-src 'none'/.test(res.headers.get('Content-Security-Policy')));
    }
  }
  const loginBefore = loginCalls.length;
  for (const path of ['/static/wow/login/dark-portal.webm', '/static/wow/login/dark-portal-poster.jpg', '/static/wow/login/olympus-dark-portal.png']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      res = await get('https://guild.example' + path, loginEnv, { method });
      check('retired login media remains member-gated without assets/D1: ' + method + ' ' + path, res.status === 401 && loginCalls.length === loginBefore && loginTouches === 0 && !res.headers.has('Set-Cookie') && /noindex/.test(res.headers.get('X-Robots-Tag')));
    }
  }
  for (const path of ['/static/wow/login/', '/static/wow/login/other.webm', '/static/wow/login/dark-portal.webm.js', '/static/wow/login/dark-portal-poster.jpg/extra', '/static/wow/login/Dark-Portal.webm', '/static/wow/login/%64ark-portal.webm', '/static/wow/login/other.png', '/static/wow/login/olympus-dark-portal-wide.png.js', '/static/wow/login/olympus-dark-portal-portrait.png.extra', '/static/wow/login/olympus-dark-portal-portrait.png/neighbor', '/static/wow/login/olympus-dark-portal-wide.png/extra', '/static/wow/login/Olympus-dark-portal.png', '/static/wow/login/%6flympus-dark-portal.png']) {
    res = await get('https://guild.example' + path, env({ ASSETS: loginEnv.ASSETS }));
    check('no public login-directory/prefix/encoded neighbor exception: ' + path, res.status === 401 && loginCalls.length === loginBefore);
  }
  res = await get('https://verify.example/static/wow/login/olympus-dark-portal-wide.png', env({ ASSETS: loginEnv.ASSETS }));
  check('the bot host does not acquire public login media', res.status === 404 && loginCalls.length === loginBefore);
  res = await get('https://nobody.example/static/wow/login/olympus-dark-portal-wide.png', loginEnv);
  check('unknown-host login media stays 404 without assets or D1', res.status === 404 && loginCalls.length === loginBefore && loginTouches === 0);
  res = await get('https://old.example/static/wow/login/olympus-dark-portal-wide.png', loginEnv);
  check('legacy login media retains its canonical redirect before assets/D1', res.status === 301 && res.headers.get('Location') === 'https://guild.example/static/wow/login/olympus-dark-portal-wide.png' && loginCalls.length === loginBefore && loginTouches === 0);
  res = await get('http://guild.example/static/wow/login/olympus-dark-portal-wide.png', loginEnv);
  check('HTTP login media upgrades before assets/D1', res.status === 301 && res.headers.get('Location') === 'https://guild.example/static/wow/login/olympus-dark-portal-wide.png' && loginCalls.length === loginBefore && loginTouches === 0);
  res = await get('https://guild.example/static/wow/login/olympus-dark-portal-wide.png', env({ ASSETS: { fetch: async request => new Response('medi', { status: 206, headers: { 'Content-Type': 'image/png', 'Content-Range': 'bytes 0-3/17', 'X-Test-Range': request.headers.get('Range') } }) } }), { headers: { Range: 'bytes=0-3' } });
  check('a browser media range retains the original asset status, body and bounded range headers', res.status === 206 && await res.text() === 'medi' && res.headers.get('Content-Range') === 'bytes 0-3/17' && res.headers.get('X-Test-Range') === 'bytes=0-3' && res.headers.get('X-Content-Type-Options') === 'nosniff');
  res = await get('https://guild.example/static/wow/login/olympus-dark-portal-wide.png', env({ ASSETS: { fetch: async () => new Response('missing media', { status: 404 }) } }));
  check('a missing login asset stays an actual asset 404, never a fabricated200', res.status === 404 && await res.text() === 'missing media');

  console.log("\n== the site's static files go through the host check (.51) ==");
  res = await get("https://guild.example/static/app.css?v=x");
  check('signed out, the application stylesheet is refused before the asset binding', res.status === 401 && !(await res.text()).includes('/* asset'), res.status);
  for (const p of ['/static/app.js', '/static/governance/organization.json', '/static/governance/reconciled-book.md', '/static/governance/olympus-governance-r6.pdf', '/static/governance/olympus-governance-r6.zip', '/static/rank-planner/model.js', '/static/qr-phase1.html', '/api/public']) {
    const r = await get('https://guild.example' + p);
    check('signed out, no private source/data/download: ' + p, r.status === 401 && !(await r.text()).includes('/* asset'));
  }
  let assetCalls = 0;
  const assetEnv = env({ ASSETS: { fetch: async () => { assetCalls++; return new Response('protected-source'); } } });
  const core = load('./site-core'), viewer = '300000000000000091';
  const admittedSetup=load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(assetEnv.DB,'writer','canonical',entryFixture.ENTRY_EPOCH);
  await admittedSetup.prepare('INSERT INTO site_users(discord_id,username,in_server,first_login,last_login,session_version) VALUES(?1,?2,1,?3,?3,1)').bind(viewer,'member',Math.floor(Date.now()/1000)).run();
  const validCookie=(await entryFixture.issueOriginalEntryCookie(load,db,assetEnv,viewer)).cookie, originalVersion=db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(viewer).session_version;
  res = await get('https://guild.example/static/app.js', assetEnv, { headers: { Cookie: validCookie } });
  check('current Discord session receives private assets with cookie-varying no-store delivery', res.status === 200 && await res.text() === 'protected-source' && assetCalls === 1 && res.headers.get('Cache-Control') === 'private, no-store, no-transform' && res.headers.get('Vary') === 'Cookie' && /noindex/.test(res.headers.get('X-Robots-Tag')));
  // .177: reproduce a provider read failure through the real gate, without replacing
  // session/admission functions. A later request must re-read admission, never reuse a pass.
  const faultViewer = '300000000000000093', faultAt = Math.floor(Date.now()/1000);
  await admittedSetup.prepare('INSERT INTO site_users(discord_id,username,in_server,first_login,last_login,checked_at,session_version) VALUES(?1,?2,1,?3,?3,?3,1)').bind(faultViewer,'fault-member',faultAt).run();
  let faultMode = '', faultAttempts = 0, faultAssetCalls = 0;
  const faultEnv = env({ SITE_ADMINS: faultViewer, DB: d1(db, { trap: sql => {
    if (faultMode === 'current_user' && sql.includes('SELECT * FROM site_users WHERE discord_id = ?1 AND account_incarnation')) {
      faultAttempts++; throw Error('D1_ERROR: private table token=abc.def.ghi Tag#1234');
    }
    if (faultMode === 'membership' && sql.includes('UPDATE site_users SET in_server = 0, checked_at = ?2, session_version = session_version + 1')) {
      faultAttempts++; throw Error('D1_ERROR: private table token=abc.def.ghi Tag#1234');
    }
  } }), ASSETS: { fetch: async () => { faultAssetCalls++; return new Response('protected-fault-source'); } } });
  const faultEntry = await entryFixture.issueOriginalEntryCookie(load,db,faultEnv,faultViewer), faultCookie = faultEntry.cookie;
  const gateLogs = [], beforeGateConsole = console.error;
  const refusalHeaders = [...core.securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' }))];
  const faultAccount = () => JSON.stringify(db.prepare('SELECT * FROM site_users WHERE discord_id=?1').get(faultViewer));
  let beforeFaultAccount = faultAccount();
  console.error = (...args) => { gateLogs.push(args); };
  try {
    faultMode = 'current_user';
    for (const privatePath of ['/static/wow/talents/bg-302.jpg', '/api/admin/availability']) {
      const beforeAttempts = faultAttempts, beforeLogs = gateLogs.length;
      res = await get('https://guild.example' + privatePath + '?code=private-query', faultEnv, { headers: { Cookie: faultCookie } });
      check('failed original account read refuses ' + privatePath + ' before delivery without retry or account change', res.status === 503 && await res.text() === '{"error":"site_access_unavailable"}' && faultAttempts === beforeAttempts + 1 && faultAssetCalls === 0 && faultAccount() === beforeFaultAccount);
      check('account-read refusal retains exact security headers and logs only fixed stage/category: ' + privatePath, JSON.stringify([...res.headers]) === JSON.stringify(refusalHeaders) && !res.headers.has('Set-Cookie') && gateLogs.length === beforeLogs + 1 && JSON.stringify(gateLogs.at(-1)) === JSON.stringify(['site access unavailable','current_user','d1']));
    }
    faultMode = '';
    res = await get('https://guild.example/static/wow/talents/bg-302.jpg', faultEnv, { headers: { Cookie: faultCookie } });
    check('a fresh request after an account-read failure succeeds through unchanged private-asset safeguards', res.status === 200 && await res.text() === 'protected-fault-source' && faultAssetCalls === 1 && res.headers.get('Cache-Control') === 'private, no-store, no-transform' && res.headers.get('Vary') === 'Cookie' && gateLogs.length === 2);
    // An authoritative Discord404 whose original bound write fails is still held;
    // the original bound layer deliberately discards provider text, yielding category error.
    await admittedSetup.prepare('UPDATE site_users SET checked_at=?2 WHERE discord_id=?1').bind(faultViewer,faultAt-7200).run();
    beforeFaultAccount = faultAccount(); faultMode = 'membership';
    let faultMemberCalls = 0;
    fetchResponder = async url => { if (!url.endsWith('/members/' + faultViewer)) throw Error('unexpected fault-fixture provider route'); faultMemberCalls++; return new Response('{"code":10007}', { status: 404 }); };
    res = await get('https://guild.example/static/wow/talents/bg-302.jpg?code=private-query', faultEnv, { headers: { Cookie: faultCookie } });
    check('failed original membership write refuses assets without retry or a partial account change', res.status === 503 && await res.text() === '{"error":"site_access_unavailable"}' && faultAttempts === 3 && faultMemberCalls === 1 && faultAssetCalls === 1 && faultAccount() === beforeFaultAccount);
    check('membership refusal retains the same security contract and sanitizes its distinct stage', JSON.stringify([...res.headers]) === JSON.stringify(refusalHeaders) && !res.headers.has('Set-Cookie') && gateLogs.length === 3 && JSON.stringify(gateLogs.at(-1)) === JSON.stringify(['site access unavailable','membership','error']));
    faultMode = '';
    fetchResponder = async url => { if (!url.endsWith('/members/' + faultViewer)) throw Error('unexpected recovery-fixture provider route'); faultMemberCalls++; return new Response('{"pending":false}', { headers: { 'Content-Type': 'application/json' } }); };
    res = await get('https://guild.example/static/wow/talents/bg-302.jpg', faultEnv, { headers: { Cookie: faultCookie } });
    check('a fresh request after a membership failure rechecks current Discord membership before private delivery', res.status === 200 && await res.text() === 'protected-fault-source' && faultMemberCalls === 2 && faultAssetCalls === 2 && gateLogs.length === 3 && db.prepare('SELECT checked_at FROM site_users WHERE discord_id=?1').get(faultViewer).checked_at > faultAt-7200);
  } finally { console.error = beforeGateConsole; fetchResponder = null; }
  // The councillor page is the one response that may use the device camera (owner item 32 fallback); its own counter keeps the deliveries above intact.
  let cameraAssetCalls = 0;
  const cameraEnv = env({ ASSETS: { fetch: async () => { cameraAssetCalls++; return new Response('protected-source'); } } });
  res = await get('https://guild.example/static/qr-phase1.html', cameraEnv, { headers: { Cookie: validCookie } });
  check('signed in, the councillor page alone allows the same-origin camera and keeps every other private-asset header', res.status === 200 && await res.text() === 'protected-source' && cameraAssetCalls === 1 && res.headers.get('Permissions-Policy') === 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' && res.headers.get('Cache-Control') === 'private, no-store, no-transform' && res.headers.get('Vary') === 'Cookie' && /noindex/.test(res.headers.get('X-Robots-Tag')) && res.headers.get('X-Frame-Options') === 'DENY');
  res = await get('https://guild.example/static/qr-phase1.mjs', cameraEnv, { headers: { Cookie: validCookie } });
  check('every other private asset keeps the camera closed', res.status === 200 && cameraAssetCalls === 2 && res.headers.get('Permissions-Policy') === 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res = await get('https://guild.example/static/qr-phase1.html', cameraEnv);
  check('signed out, the councillor page carries no camera allowance and reaches no asset', res.status === 401 && cameraAssetCalls === 2 && res.headers.get('Permissions-Policy') === 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res = await get('https://guild.example/static/qr-phase1.html', cameraEnv, { method: 'POST', headers: { Cookie: validCookie } });
  check('the camera page accepts only GET and HEAD', res.status !== 200 && cameraAssetCalls === 2);
  await admittedSetup.prepare('UPDATE site_users SET session_version=? WHERE discord_id=?').bind(originalVersion+1,viewer).run();
  res = await get('https://guild.example/static/app.js', assetEnv, { headers: { Cookie: validCookie } });
  check('revoked cookie never reaches the asset binding', res.status === 401 && assetCalls === 1);
  await admittedSetup.prepare('UPDATE site_users SET session_version=?,in_server=0 WHERE discord_id=?').bind(originalVersion,viewer).run();
  res = await get('https://guild.example/static/app.js', assetEnv, { headers: { Cookie: validCookie } });
  check('known departed account never reaches the asset binding', res.status === 403 && assetCalls === 1);
  const logoutHeaders = { Cookie: validCookie, Origin: 'https://guild.example', 'X-Olympus': core.PAGE_VERSION };
  res = await get('https://guild.example/auth/logout', assetEnv, { method: 'POST', headers: logoutHeaders });
  check('departed signed-in identity can reach original logout and clear its cookie', res.status === 200 && (await res.json()).ok === true && /__Host-olg=;/.test(res.headers.get('Set-Cookie') || '') && /Max-Age=0/.test(res.headers.get('Set-Cookie') || ''));
  check('departed logout revokes the actual original session version without opening private assets', db.prepare('SELECT session_version FROM site_users WHERE discord_id=?1').get(viewer).session_version === originalVersion+1 && await core.currentUser(assetEnv, new Request('https://guild.example/', { headers: { Cookie: validCookie } })) === null && assetCalls === 1);
  await admittedSetup.prepare('UPDATE site_users SET session_version=?,in_server=1,denied=1 WHERE discord_id=?').bind(originalVersion,viewer).run();
  res = await get('https://guild.example/auth/logout-extra', assetEnv, { method: 'POST', headers: logoutHeaders });
  check('denied identity receives no widened auth-prefix exception or cookie change', res.status === 403 && !res.headers.has('Set-Cookie') && db.prepare('SELECT session_version FROM site_users WHERE discord_id=?1').get(viewer).session_version === originalVersion);
  res = await get('https://guild.example/auth/logout', assetEnv, { method: 'POST', headers: { ...logoutHeaders, Origin: 'https://other.example' } });
  check('denied logout still consumes the original same-origin guard', res.status === 403 && (await res.json()).error === 'bad_origin' && !res.headers.has('Set-Cookie') && db.prepare('SELECT session_version FROM site_users WHERE discord_id=?1').get(viewer).session_version === originalVersion);
  res = await get('https://guild.example/auth/logout', assetEnv, { method: 'POST', headers: logoutHeaders });
  check('denied signed-in identity can reach original logout and clear its cookie', res.status === 200 && (await res.json()).ok === true && /__Host-olg=;/.test(res.headers.get('Set-Cookie') || '') && /Max-Age=0/.test(res.headers.get('Set-Cookie') || ''));
  check('denied logout revokes the actual original session version and leaves assets inaccessible', db.prepare('SELECT session_version FROM site_users WHERE discord_id=?1').get(viewer).session_version === originalVersion+1 && await core.currentUser(assetEnv, new Request('https://guild.example/', { headers: { Cookie: validCookie } })) === null && assetCalls === 1);
  await admittedSetup.prepare('DELETE FROM site_users WHERE discord_id=?').bind(viewer).run();
  res = await get('https://guild.example/static/app.js', assetEnv, { headers: { Cookie: validCookie } });
  check('deleted account cannot reuse its signed cookie', res.status === 401 && assetCalls === 1);
  res = await get('https://guild.example/robots.txt');
  check('origin robots restores HTTP 200 with complete deny rules and noindex', res.status === 200 && (await res.text()) === 'User-agent: *\nDisallow: /\nDisallow: /*$\n' && /noindex/.test(res.headers.get('X-Robots-Tag')));
  res = await index.fetch(new Request('https://guild.example/robots.txt', { method: 'HEAD' }), env(), ctx);
  check('robots HEAD retains HTTP 200 and noindex with no body', res.status === 200 && (await res.text()) === '' && /noindex/.test(res.headers.get('X-Robots-Tag')));
  check('robots HEAD remains uncached plain text', /no-store/.test(res.headers.get('Cache-Control')) && /text\/plain/.test(res.headers.get('Content-Type')));
  for (const p of ['/', '/static/app.js']) {
    res = await get('http://guild.example' + p, assetEnv);
    check('HTTP upgrades before sign-in or assets: ' + p, res.status === 301 && res.headers.get('Location') === 'https://guild.example' + p && assetCalls === 1);
  }
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

  // Carry forward the final .154 due-membership and delayed-provider regressions.
  // Use the .155 original PROFILE issuer and admitted fixture setup; never fabricate a cookie.
  const staleViewer = '300000000000000092', staleAt = Math.floor(Date.now()/1000)-7200;
  await admittedSetup.prepare('INSERT INTO site_users(discord_id,username,in_server,first_login,last_login,checked_at,session_version) VALUES(?1,?2,1,?3,?3,?3,1)').bind(staleViewer,'stale-member',staleAt).run();
  const staleEntry = await entryFixture.issueOriginalEntryCookie(load,db,assetEnv,staleViewer);
  const staleCookie = staleEntry.cookie, staleVersion = staleEntry.session.v;
  for (const memberStatus of [404,503,200]) {
    await admittedSetup.prepare('UPDATE site_users SET in_server=1,session_version=?2,checked_at=?3 WHERE discord_id=?1').bind(staleViewer,staleVersion,staleAt).run();
    let memberChecks=0;
    fetchResponder=async(url)=>{memberChecks++;if(!url.endsWith('/members/'+staleViewer))throw Error('Unexpected membership lookup');return new Response(JSON.stringify(memberStatus===200?{nick:'current member',pending:false}:{message:'membership unavailable',code:10007}),{status:memberStatus,headers:{'Content-Type':'application/json'}});};
    const beforeAssets=assetCalls;
    res=await get('https://guild.example/static/app.js',assetEnv,{headers:{Cookie:staleCookie}});
    const after=db.prepare('SELECT in_server,checked_at FROM site_users WHERE discord_id=?1').get(staleViewer);
    check('stale signed session rechecks Discord before protected delivery: '+memberStatus,memberChecks===1&&res.status===(memberStatus===200?200:memberStatus===404?403:503)&&assetCalls===beforeAssets+(memberStatus===200?1:0)&&after.in_server===(memberStatus===404?0:1)&&(memberStatus===200?after.checked_at>staleAt:memberStatus===404||after.checked_at===staleAt));
  }
  for (const absence of ['404', 'pending']) {
    await admittedSetup.prepare('UPDATE site_users SET in_server=1,denied=0,session_version=?2,checked_at=?3 WHERE discord_id=?1').bind(staleViewer,staleVersion,staleAt).run();
    let release200, memberChecks=0, entered200;
    const delayed200=new Promise(resolve=>{release200=resolve;});
    const entered=new Promise(resolve=>{entered200=resolve;});
    fetchResponder=async(url)=>{
      if(!url.endsWith('/members/'+staleViewer))throw Error('Unexpected raced membership lookup');
      memberChecks++;
      if(memberChecks===1){entered200();await delayed200;return new Response(JSON.stringify({nick:'old response',pending:false}),{headers:{'Content-Type':'application/json'}});}
      return new Response(JSON.stringify(absence==='pending'?{pending:true}:{message:'Unknown Member',code:10007}),{status:absence==='pending'?200:404,headers:{'Content-Type':'application/json'}});
    };
    const beforeAssets=assetCalls, pendingAsset=get('https://guild.example/static/app.js',assetEnv,{headers:{Cookie:staleCookie}});
    let timeout;
    try { await Promise.race([entered,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('membership race did not reach provider')),3000);})]); }
    finally { clearTimeout(timeout); }
    const absent=await get('https://guild.example/static/app.js',assetEnv,{headers:{Cookie:staleCookie}});
    const absenceRow=db.prepare('SELECT in_server,checked_at,session_version FROM site_users WHERE discord_id=?1').get(staleViewer);
    release200();
    const late=await pendingAsset,lateBody=await late.text(),after=db.prepare('SELECT in_server,checked_at,session_version FROM site_users WHERE discord_id=?1').get(staleViewer);
    check('authoritative '+absence+' revokes the original session before an earlier200 can resurrect membership or deliver assets',absent.status===403&&memberChecks===2&&absenceRow.in_server===0&&absenceRow.session_version===staleVersion+1&&JSON.stringify(after)===JSON.stringify(absenceRow)&&late.status===503&&!lateBody.includes('protected-source')&&assetCalls===beforeAssets);
    res=await get('https://guild.example/static/app.js',assetEnv,{headers:{Cookie:staleCookie}});
    check('the same cookie remains signed out after raced '+absence+' and cannot reuse private assets',res.status===401&&assetCalls===beforeAssets);
  }
  fetchResponder=null;

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
  const srcs = ["index.ts", "intros.ts", "names.ts", "site-admin.ts", "site-api.ts", "site-access.ts", "site-queue.ts", "bnet-retention.ts", "oauth.ts", "ingest.ts", "roster.ts", "restore.ts", "unverified.ts", "review.ts", "interactions.ts", "lookup.ts", "guide.ts", "site.ts", "discord.ts", "guild-seats.ts", "site-news.ts", "schema.ts"]; // .177: the member gate now reports only fixed stage and errorRef; previous logging modules remain covered.
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
  check("credentialFetch itself sets redirect manual and an 8 s timeout", /redirect: "manual"/.test(helper) && /AbortSignal\.timeout\(ms\)/.test(helper) && /captureOriginalProviderInit\(init\)/.test(helper) && /withDeadline\(original\.signal \?\? undefined\)/.test(helper) && /CREDENTIAL_FETCH_TIMEOUT_MS = 8000/.test(helper));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

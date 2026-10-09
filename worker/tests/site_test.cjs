// The guild site (build .41, .42, .43) through the REAL src/*.ts (transpiled by TypeScript itself) against the REAL schema in
// SQLite (node:sqlite). Only Discord's HTTP side is faked: OAuth, the member endpoints, the member search, users.
// Covers sign-in, sessions, CSRF, every member and admin endpoint, the voting board (.43), backup choices and the
// availability grid, the NA/EU raid-role migration, reserved names into the invite queue (priority, positions, re-queue
// on verify, release), the lookup commands in Asmongold's server, and the Discord names for the roster window. Run from
// the worker folder:  node tests/site_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- D1 over SQLite: a batch is one transaction; SELECTs in a batch return their rows ----------
let PREPARE_HOOK = null; // .114: a test may act when a statement is prepared (between a handler's read and its write)
function d1(db) {
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    PREPARE_HOOK?.(sql);
    let params = [];
    const api = {
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        // D1 wants exactly as many values as the statement names (?1..?N); SQLite would quietly bind NULL to the rest.
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings for SQL query (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        // D1 refuses a LIKE pattern over 50 bytes; plain SQLite allows 50,000, so check it here.
        for (const m of sql.matchAll(/\bLIKE\s+\?(\d+)/gi)) {
          const v = p[Number(m[1]) - 1];
          if (typeof v === "string" && Buffer.byteLength(v, "utf8") > 50) throw new Error("D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR");
        }
        params = p;
        return api;
      },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      raw: async (opts) => {
        const rows = db.prepare(sql).all(...params);
        const cols = rows.length ? Object.keys(rows[0]) : [];
        const arrays = rows.map((r) => cols.map((c) => r[c]));
        return opts && opts.columnNames ? [cols, ...arrays] : arrays;
      },
      run: async () => exec(sql, params),
      _exec: () => exec(sql, params),
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
const index = load("./index").default;
const site = load("./site");
const core = load("./site-core");
const data = load("./site-data");
const siteQueue = load("./site-queue");
const ingest = load("./ingest");
const review = load("./review");
const names = load("./names");
const lookup = load("./lookup");
const schema = load("./schema");
const admin = load("./site-admin");
const siteApi = load("./site-api");
const interactions = load("./interactions");

// ---------- a fake Discord ----------
const GUILD = "236932545793490944";          // Asmongold's (SITE_GUILD_ID and INTROS_GUILD_ID)
const OLYMPUS = "1549537348516188200";       // GUILD_ID
const OFFICER_ROLE = "1554262223038324840";
const VIKTOR = "472099715253796864";
const U = (id, username, global_name, extra = {}) => ({ id, username, global_name, avatar: null, ...extra });
const users = new Map();
const members = new Map();  // SITE_GUILD_ID membership: id -> member object
const addUser = (u, member) => { users.set(u.id, u); if (member !== null) members.set(u.id, { user: u, nick: null, avatar: null, joined_at: "2024-01-15T12:00:00.000Z", roles: [], ...member }); };
addUser(U(VIKTOR, "fernmelder", "Fern"), {});
addUser(U("300000000000000001", "alice", "Alice A", { avatar: "0123456789abcdef0123456789abcdef" }), { nick: "Alice of Olympus", joined_at: "2023-05-01T00:00:00.000Z" });
addUser(U("300000000000000002", "bob", null), { joined_at: new Date(Date.now() - 2 * 86400e3).toISOString() }); // joined 2 days ago
addUser(U("300000000000000003", "carol", "Carol"), {});
addUser(U("300000000000000004", "dave", "Dave"), null);                  // not in Asmongold's server
addUser(U("300000000000000005", "erin", "Erin"), { pending: true });    // screening not finished
addUser(U("300000000000000006", "frank", "Frank </script><b>x</b>"), {}); // a hostile display name
addUser(U("300000000000000007", "grace", "Grace"), {});
let D = { calls: [], searchLimited: false, usersLimited: false };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const p = u.pathname.replace(/^\/api\/v10/, "");
  const m = init.method || "GET";
  const hdrs = init.headers || {};
  const auth = hdrs.Authorization || hdrs.authorization || "";
  D.calls.push(`${m} ${p}`);
  const res = (status, obj) => new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (m === "POST" && p === "/oauth2/token") {
    const body = new URLSearchParams(init.body);
    const code = body.get("code") || "";
    if (!code.startsWith("code-") || body.get("client_secret") !== "client-secret") return res(400, { error: "invalid_grant" });
    if (body.get("redirect_uri") !== "https://guild.example/auth/callback") return res(400, { error: "invalid_grant", detail: "redirect_uri" });
    return res(200, { access_token: "tok-" + code.slice(5), token_type: "Bearer" });
  }
  if (auth.startsWith("Bearer ")) {
    const id = auth.slice(7).replace(/^tok-/, "");
    if (p === "/users/@me") return users.has(id) ? res(200, users.get(id)) : res(401, {});
    if (p === `/users/@me/guilds/${GUILD}/member`) return members.has(id) ? res(200, members.get(id)) : res(404, { code: 10004, message: "Unknown Guild" });
    return res(404, {});
  }
  if (auth !== "Bot bot-token") return res(401, { message: "401: Unauthorized" });
  let x;
  if ((x = p.match(/^\/guilds\/(\d+)\/members\/search$/))) {
    if (D.searchLimited) return res(429, { retry_after: 0.01, message: "You are being rate limited." });
    const q = (u.searchParams.get("query") || "").toLowerCase();
    const found = [...members.values()].filter((mm) => mm.user.username.startsWith(q) || (mm.nick || "").toLowerCase().startsWith(q));
    return res(200, found.slice(0, Number(u.searchParams.get("limit") || 1)));
  }
  if ((x = p.match(/^\/guilds\/(\d+)\/members\/(\d+)$/))) return members.has(x[2]) ? res(200, members.get(x[2])) : res(404, { code: 10007, message: "Unknown Member" });
  if ((x = p.match(/^\/users\/(\d+)$/))) {
    if (D.usersLimited) return res(429, { retry_after: 0.01, message: "You are being rate limited." });
    return users.has(x[1]) ? res(200, users.get(x[1])) : res(404, { code: 10013, message: "Unknown User" });
  }
  if ((x = p.match(/^\/channels\/(\d+)\/messages$/)) && m === "POST") return res(200, { id: "999" });
  return res(404, { message: "404: Not Found", code: 0 });
};

// ---------- env and helpers ----------
let db = freshDb();
let T = 1790000000; // 21 Sep 2026: before the reservation opens
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [T * 1000])); }
  static now() { return T * 1000; }
};
const env = () => ({
  DB: d1(db),
  GUILD_ID: OLYMPUS,
  DISCORD_APP_ID: "1550176895671341076",
  DISCORD_CLIENT_SECRET: "client-secret",
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_PUBLIC_KEY: "00",
  COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789",
  VERIFY_SECRET: "verify-secret-for-tests",
  WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789",
  PUBLIC_BASE_URL: "https://verify.example",
  SITE_HOST: "guild.example",
  SITE_GUILD_ID: GUILD,
  SITE_ADMINS: VIKTOR,
  SITE_JOIN_URL: "https://discord.gg/example",
  INTROS_GUILD_ID: GUILD,
  INTROS_ROLES: OFFICER_ROLE,
  INTROS_CHANNELS: "",
  ADMISSION_MODE: "auto",
  SET_GUILD_NOTE: "false",
  QUEUE_CLAIM_LIMIT: "25",
  QUEUE_CLAIM_TTL_MINUTES: "15",
  ROSTER_MIN_MEMBERS: "0",
  ROSTER_MAX_SHRINK_PCT: "100",
  CHANNEL_SERVER_LOG: "",
  CHANNEL_NOTICES: "",
});
const waits = [];
const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) };
const settle = async () => { while (waits.length) await waits.shift(); };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };

const jar = new Map(); // user id -> cookie header value
function cookiesFrom(res) {
  const out = {};
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("Set-Cookie")].filter(Boolean);
  for (const c of all) { const [kv] = c.split(";"); const i = kv.indexOf("="); out[kv.slice(0, i)] = kv.slice(i + 1); }
  return out;
}
async function call(method, pathname, { who, body, host = "guild.example", headers = {}, origin } = {}) {
  const h = new Headers(headers);
  if (who && jar.has(who)) h.set("Cookie", jar.get(who));
  if (method !== "GET" && method !== "HEAD") {
    if (!headers["X-Olympus"] && headers["X-Olympus"] !== null) h.set("X-Olympus", "2"); // the page's version since .43
    if (headers["X-Olympus"] === null) h.delete("X-Olympus");
    h.set("Origin", origin ?? `https://${host}`);
  }
  if (body !== undefined) h.set("Content-Type", "application/json");
  const res = await index.fetch(new Request(`https://${host}${pathname}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env(), ctx);
  await settle();
  return res;
}
const J = async (res) => { try { return await res.clone().json(); } catch { return null; } };
// The weekly grid as the page sends it: 168 UTC hours (Monday 00:00 UTC first) as 42 hex digits.
const hexOf = (hours) => { const b = new Array(168).fill(0); for (const h of hours) b[((h % 168) + 168) % 168] = 1; let x = ""; for (let i = 0; i < 168; i += 4) x += ((b[i] << 3) | (b[i + 1] << 2) | (b[i + 2] << 1) | b[i + 3]).toString(16); return x; };
const evenings = (from) => Array.from({ length: 7 }, (_, d) => Array.from({ length: 5 }, (_, h) => d * 24 + from + h)).flat();
const EU_EVENINGS = hexOf(evenings(18)); // 19:00-24:00 Central European, every day
const NA_EVENINGS = hexOf(evenings(24)); // 19:00-24:00 Eastern, every day
async function signIn(id) {
  const start = await call("GET", "/auth/login");
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const stateCookie = cookiesFrom(start)["__Host-olg_state"];
  const res = await index.fetch(new Request(`https://guild.example/auth/callback?code=code-${id}&state=${encodeURIComponent(state)}`, { headers: { Cookie: `__Host-olg_state=${stateCookie}` } }), env(), ctx);
  await settle();
  const c = cookiesFrom(res)["__Host-olg"];
  if (c) jar.set(id, `__Host-olg=${c}`);
  return res;
}
const bootOf = async (res) => {
  const html = await res.text();
  const m = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/);
  return { html, boot: m ? JSON.parse(m[1]) : null };
};

(async () => {
  console.log("== schema: the Worker adds the site's tables and columns to an old database itself ==");
  {
    const old = freshDb(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"));
    schema.forgetSchemaCheck();
    await schema.ensureSchema({ DB: d1(old) });
    const cols = (t) => old.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    check("site tables created, members.username/global_name/names_at and invite_queue.priority added",
      ["site_users", "site_applications", "site_votes", "site_friends", "site_reserved", "site_settings"].every((t) => cols(t).length) &&
      ["username", "global_name", "names_at"].every((c) => cols("members").includes(c)) && cols("invite_queue").includes("priority"));
    check("  the queue order index exists", !!old.prepare("SELECT name FROM sqlite_master WHERE name = 'invite_queue_order'").get());
    schema.forgetSchemaCheck();
    let again = true;
    try { await schema.ensureSchema({ DB: d1(old) }); } catch (e) { again = false; console.log(e); }
    check("  running it again is harmless", again);
    schema.forgetSchemaCheck();
  }
  {
    // A database as build .41 left it: site_applications without the .43 columns, raid roles not split yet.
    const old = freshDb(path.join(root, "tests", "fixtures", "schema-2026-09-25.sql"));
    old.exec(`CREATE TABLE site_applications (discord_id TEXT PRIMARY KEY, position TEXT NOT NULL, class_lead TEXT, fallback INTEGER NOT NULL DEFAULT 1,
      character TEXT, char_key TEXT, class TEXT, role TEXT, region TEXT, answers TEXT NOT NULL, status TEXT NOT NULL, admin_note TEXT, reviewed_by TEXT,
      reviewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    old.exec(`CREATE TABLE site_votes (voter_id TEXT NOT NULL, ballot TEXT NOT NULL, slot INTEGER NOT NULL, nominee_kind TEXT NOT NULL, nominee_key TEXT NOT NULL,
      nominee_label TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (voter_id, ballot, slot))`);
    const ins = old.prepare("INSERT INTO site_applications (discord_id, position, region, answers, status, created_at, updated_at) VALUES (?1, ?2, ?3, '{}', 'submitted', 1, 1)");
    ins.run("800000000000000001", "raid_leader", "eu"); ins.run("800000000000000002", "raid_leader", "na_west"); ins.run("800000000000000003", "raid_assist", "eu"); ins.run("800000000000000004", "raid_assist", null);
    const vote = old.prepare("INSERT INTO site_votes (voter_id, ballot, slot, nominee_kind, nominee_key, nominee_label, created_at, updated_at) VALUES ('800000000000000009', 'raid_leader', ?1, ?2, ?3, 'x', 1, 1)");
    vote.run(1, "discord", "800000000000000001"); vote.run(2, "name", "someone");
    await schema.ensureSchema({ DB: d1(old) });
    const cols = old.prepare("PRAGMA table_info(site_applications)").all().map((c) => c.name);
    check(".41 to .43: backup1, backup2, avail and avail_tz added, and the board table created",
      ["backup1", "backup2", "avail", "avail_tz"].every((c) => cols.includes(c)) && !!old.prepare("SELECT name FROM sqlite_master WHERE name = 'site_board_votes'").get());
    const pos = Object.fromEntries(old.prepare("SELECT discord_id, position FROM site_applications").all().map((r) => [r.discord_id.slice(-1), r.position]));
    check("  Raid Leader and Raid Assist applications go to EU for Europe, NA for anywhere else",
      pos[1] === "raid_leader_eu" && pos[2] === "raid_leader_na" && pos[3] === "raid_assist_eu" && pos[4] === "raid_assist_na", pos);
    const ballots = old.prepare("SELECT slot, ballot FROM site_votes ORDER BY slot").all().map((r) => r.ballot).join(",");
    check("  a Raid Leader nomination follows the nominee's own application (EU), a typed name goes to NA", ballots === "raid_leader_eu,raid_leader_na", ballots);
    schema.forgetSchemaCheck();
    await schema.ensureSchema({ DB: d1(old) });
    check("  and a second run changes nothing", old.prepare("SELECT COUNT(*) AS n FROM site_applications WHERE position LIKE 'raid_%_eu'").get().n === 2);
    schema.forgetSchemaCheck();
  }

  console.log("\n== hosts: the site answers only on SITE_HOST ==");
  let res = await call("GET", "/");
  let page = await bootOf(res);
  check("GET / on the site host serves the page", res.status === 200 && page.boot && page.boot.signedIn === false);
  check("  with a CSP that allows only this origin's scripts", /script-src 'self'/.test(res.headers.get("Content-Security-Policy") || "") && !/unsafe-inline/.test(res.headers.get("Content-Security-Policy")));
  check("  no-store, no-transform (Cloudflare injects nothing) and frame denial", res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("X-Frame-Options") === "DENY");
  check("  the boot data carries the settings and the join link", page.boot.settings && page.boot.settings.namesOpenAt === data.DEFAULT_NAMES_OPEN_AT && page.boot.joinUrl === "https://discord.gg/example");
  check("  and, for the Roles page open before signing in (.44), every role's description and who holds the appointed ones",
    page.boot.meta.positions.length === 20 && page.boot.meta.positions.every((p) => p.info && p.info.about && p.info.duties.length && p.info.expect.length) && page.boot.settings.appointed.treasurer === "Fernmelder");
  check("  and (.45) which roles have no public vote (the Co-Guild Master until the list is saved), and Forever's twelve professions",
    JSON.stringify(page.boot.settings.noVote) === '["co_gm"]' && page.boot.meta.professions.length === 12 && page.boot.meta.limits.primaryProfessions === 2, page.boot.settings.noVote);
  {
    // .111: the tab icon and the brand are the Olympus crest again (Viktor's decision of 1 Oct 2026: the website's one exception to
    // the official game art); the file is byte for byte the one live on guild.roachcouncil.com, and it is the only image outside wow/.
    const icon = path.join(root, "public", "static", "olympus-icon.png");
    const png = fs.existsSync(icon) ? fs.readFileSync(icon) : Buffer.alloc(0);
    const imagesOutsideWow = (function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "wow" ? [] : walk(path.join(dir, d.name))) : (/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(d.name) ? [path.relative(path.join(root, "public"), path.join(dir, d.name)).replace(/\\/g, "/")] : [])); })(path.join(root, "public"));
    check("  its tab icon and brand use the Olympus crest (the 250x250 file live on guild.roachcouncil.com), the only image outside the official wow/ set",
      page.html.includes('<link rel="icon" href="/static/olympus-icon.png" type="image/png">') && png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 250 && png.readUInt32BE(20) === 250 &&
      require("node:crypto").createHash("sha256").update(png).digest("hex") === "867aafaa300e9f83479504b1d7c91478e4099bcc52d3e3a0172b8b55a1784d66" &&
      fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8").includes('src: "/static/olympus-icon.png"') && JSON.stringify(imagesOutsideWow) === JSON.stringify(["static/olympus-icon.png"]), JSON.stringify(imagesOutsideWow));
    const appJs = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");
    check("  .114: the member's own Discord picture shows in the top bar only (ownAvatar, Discord's avatar addresses only); the other eight account pictures stay accountArt (class icon or the Member icon)",
      !/src:\s*[a-z.]*avatarUrl/.test(appJs) && (appJs.match(/ownAvatar\(/g) || []).length === 2 && (appJs.match(/accountArt\(/g) || []).length === 9 && appJs.includes(String.raw`const DISCORD_AVATAR = /^https:\/\/cdn\.discordapp\.com\/`) && !appJs.includes("DISCORD_SVG"));
  }
  res = await call("POST", "/interactions", { body: {} });
  check("bot routes are not served on the site host", res.status === 404);
  res = await call("GET", "/", { host: "verify.example" });
  check("the site is not served on the bot's host", res.status === 404);
  res = await call("GET", "/privacy");
  check("the site serves the canonical privacy policy without sign-in or redirect (.65)", res.status === 200 && !res.headers.has("Location") && (await res.text()).includes("<h1>Privacy Policy</h1>"));
  res = await call("GET", "/terms");
  check("  and /terms as HTML", res.status === 200 && !res.headers.has("Location") && (await res.text()).includes("<h1>Terms of Service</h1>"));
  res = await call("GET", "/tos", { host: "verify.example" });
  check("  the bot's host too", res.status === 200 && !res.headers.has("Location") && (await res.text()).includes("<h1>Terms of Service</h1>"));
  check("  .117: the public page script omits the footer link row, preserves saved privacy redirects and offers no automatic deletion", !/footer-links/.test(fs.readFileSync(path.join(root, "public/static/app.js"), "utf8")) && /\/privacy\/account/.test(fs.readFileSync(path.join(root, "public/static/app.js"), "utf8")) && /\/privacy\/contact/.test(fs.readFileSync(path.join(root, "public/static/app.js"), "utf8")) && !/Delete my data/i.test(fs.readFileSync(path.join(root, "public/static/app.js"), "utf8")));

  console.log("\n== sign-in ==");
  res = await call("GET", "/auth/login");
  const loc = new URL(res.headers.get("Location"));
  check("login redirects to Discord with identify + guilds.members.read", loc.origin === "https://discord.com" && loc.searchParams.get("scope") === "identify guilds.members.read" && loc.searchParams.get("redirect_uri") === "https://guild.example/auth/callback");
  check("  and sets a signed, host-only state cookie", /^__Host-olg_state=[^;]+\.[^;]+; Max-Age=600; Path=\/; HttpOnly; Secure; SameSite=Lax/.test(res.headers.get("Set-Cookie")));
  res = await index.fetch(new Request(`https://guild.example/auth/callback?code=code-300000000000000001&state=forged`, { headers: { Cookie: "__Host-olg_state=forged.bad" } }), env(), ctx);
  page = await bootOf(res);
  check("a forged state is refused", !cookiesFrom(res)["__Host-olg"] && page.boot.flash.kind === "expired");
  // prompt=none answered with an error (not a Cancel): start over once with consent, and never loop.
  let st = await call("GET", "/auth/login");
  let stState = new URL(st.headers.get("Location")).searchParams.get("state");
  let stCookie = cookiesFrom(st)["__Host-olg_state"];
  res = await index.fetch(new Request(`https://guild.example/auth/callback?error=interaction_required&state=${encodeURIComponent(stState)}`, { headers: { Cookie: `__Host-olg_state=${stCookie}` } }), env(), ctx);
  check("an error on the silent attempt retries once with consent", res.status === 302 && res.headers.get("Location") === "/auth/login?consent=1");
  st = await call("GET", "/auth/login?consent=1");
  check("  the retry asks with prompt=consent", new URL(st.headers.get("Location")).searchParams.get("prompt") === "consent");
  stState = new URL(st.headers.get("Location")).searchParams.get("state");
  stCookie = cookiesFrom(st)["__Host-olg_state"];
  res = await index.fetch(new Request(`https://guild.example/auth/callback?error=interaction_required&state=${encodeURIComponent(stState)}`, { headers: { Cookie: `__Host-olg_state=${stCookie}` } }), env(), ctx);
  page = await bootOf(res);
  check("  and an error then is shown, not retried again", res.status === 200 && page.boot.flash.kind === "discord_error");
  res = await index.fetch(new Request(`https://guild.example/auth/callback?error=access_denied&state=x`), env(), ctx);
  page = await bootOf(res);
  check("Cancel on Discord's screen: 'sign-in cancelled'", page.boot.flash.kind === "cancelled");
  res = await signIn("300000000000000004");
  page = await bootOf(res);
  check("someone not in Asmongold's server gets no session, and is told to join", !jar.has("300000000000000004") && res.status === 403 && page.boot.flash.kind === "not_member");
  res = await signIn("300000000000000005");
  page = await bootOf(res);
  check("someone who has not finished membership screening gets no session", !jar.has("300000000000000005") && page.boot.flash.kind === "pending");
  res = await signIn("300000000000000001");
  check("a member signs in: 303 to / with a session cookie", res.status === 303 && res.headers.get("Location") === "/" && jar.has("300000000000000001"));
  const alice = db.prepare("SELECT * FROM site_users WHERE discord_id = '300000000000000001'").get();
  check("  site_users holds the names, server nickname, avatar, account age and join date",
    alice.username === "alice" && alice.global_name === "Alice A" && alice.nick === "Alice of Olympus" && alice.avatar === "u:0123456789abcdef0123456789abcdef" &&
    alice.account_created === data.snowflakeTime("300000000000000001") && alice.server_joined === Date.parse("2023-05-01T00:00:00.000Z") / 1000);
  check("  and the access token is stored nowhere", !JSON.stringify(db.prepare("SELECT * FROM site_users").all()).includes("tok-"));
  for (const id of [VIKTOR, "300000000000000002", "300000000000000003", "300000000000000006", "300000000000000007"]) await signIn(id);
  res = await call("GET", "/", { who: "300000000000000001" });
  page = await bootOf(res);
  check("signed in, the page's boot data is the member's own", page.boot.signedIn && page.boot.user.id === "300000000000000001" && page.boot.user.isAdmin === false && page.boot.meta.positions.length === 20 && page.boot.meta.avail.prime.na.length === 7);
  res = await call("GET", "/", { who: "300000000000000006" });
  page = await bootOf(res);
  check("a display name with </script> cannot break out of the boot block", !page.html.includes("Frank </script>") && page.boot.user.displayName === "Frank </script><b>x</b>");
  res = await call("GET", "/", { who: VIKTOR });
  check("SITE_ADMINS is an admin", (await bootOf(res)).boot.user.isAdmin === true);

  console.log("\n== the staff rank planner (.86) ==");
  res = await call("GET", "/admin/ranks");
  check("signed out: 401, no planner markup", res.status === 401 && !(await res.text()).includes("data-olympus-rank-planner"));
  res = await call("GET", "/admin/ranks", { who: "300000000000000001" });
  check("a member who is not a site admin: 403", res.status === 403 && !(await res.text()).includes("data-olympus-rank-planner"));
  res = await call("GET", "/admin/ranks", { who: VIKTOR });
  const planner = await res.text();
  const externalRefs = planner.replace('href="https://raw.githubusercontent.com/Gethe/wow-ui-source/forever/Interface/AddOns/Blizzard_GuildControlUI/Blizzard_GuildControlUI.lua"', "");
  check("a site admin gets the planner, its browser draft scoped to their own id, loading only this site's files, with the page headers",
    res.status === 200 && planner.includes(`data-draft-owner="${VIKTOR}"`) && planner.includes('src="/static/rank-planner/app.js"') && planner.includes('href="/static/rank-planner/styles.css"') &&
    !/\b(src|href)="https?:/.test(externalRefs) && !!res.headers.get("Content-Security-Policy") && res.headers.get("Cache-Control") === "no-store, no-transform" && res.headers.get("X-Frame-Options") === "DENY", res.status);
  check("  the shipped page carries no agent-review text (the user's Rank Codex document is named as the source)", !/Claude|ChatGPT|Codex review|reviews remain/.test(planner) && planner.includes("Forever Guild Rank Codex"));
  res = await call("POST", "/admin/ranks", { who: VIKTOR, body: {} });
  check("  the planner is read-only on the server: POST is 405 with Allow", res.status === 405 && res.headers.get("Allow") === "GET, HEAD");
  res = await call("HEAD", "/admin/ranks", { who: VIKTOR });
  check("  HEAD answers without a body", res.status === 200 && (await res.text()) === "");
  for (const f of ["app.js", "catalogue.js", "model.js", "styles.css"]) {
    const txt = fs.readFileSync(path.join(root, "public", "static", "rank-planner", f), "utf8");
    check(`  rank-planner/${f} fetches nothing and stores nothing on the server`, !/\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/.test(txt));
  }

  console.log("\n== sessions and CSRF ==");
  res = await call("GET", "/api/me");
  check("no cookie: 401", res.status === 401);
  // Flip a character in the middle of the signature: the last one can sit in base64's padding bits, where a change
  // decodes to the same bytes (that made this check pass or fail by chance).
  const cookieNow = jar.get("300000000000000001");
  const at = cookieNow.lastIndexOf(".") + 10;
  const tampered = cookieNow.slice(0, at) + (cookieNow[at] === "A" ? "B" : "A") + cookieNow.slice(at + 1);
  res = await index.fetch(new Request("https://guild.example/api/me", { headers: { Cookie: tampered } }), env(), ctx);
  check("a tampered session cookie: 401", res.status === 401);
  const forgedBody = Buffer.from(JSON.stringify({ u: VIKTOR, v: 1, e: T + 9999 })).toString("base64url");
  res = await index.fetch(new Request("https://guild.example/api/me", { headers: { Cookie: `__Host-olg=${forgedBody}.${jar.get("300000000000000001").split(".")[1]}` } }), env(), ctx);
  check("someone else's id under a valid-looking signature: 401", res.status === 401);
  const appBody = {
    position: "raid_leader_eu", backups: ["officer", "class_lead:priest"], class: "priest", role: "healer", region: "eu", character: "fern melder", fallback: true, ack: true, board: true,
    avail: EU_EVENINGS, availTz: "Europe/Stockholm",
    answers: { experience: "Cleared Naxx in 2006 and again in 2020.", why: "Because Olympus is going to be great.", leadership: "Led a 40-man raid for two years.", scenario: "Move it to DMs, then decide by the rules.", hours: "10to20", voice: "yes", logs: "https://classic.warcraftlogs.com/character/eu/x/y", extra: "Private: I work nights on Sundays.", references: [{ kind: "discord", key: "300000000000000003", label: "Carol (@carol)" }] },
  };
  const memberBody = { ...appBody, position: "member", backups: [], character: "", avail: NA_EVENINGS, availTz: "America/New_York", answers: { experience: "New to WoW, very keen.", why: "Asmon sent me here to learn.", voice: "listen" } };
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: appBody, headers: { "X-Olympus": null } });
  check("a write without the page's X-Olympus header is refused", res.status === 403);
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: appBody, origin: "https://evil.example" });
  check("a write from another origin is refused", res.status === 403 && !db.prepare("SELECT 1 FROM site_applications").get());
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: appBody, headers: { "X-Olympus": "1" } });
  check("a page loaded before .43 is told to reload instead of saving (it has no grid and the old roles)", res.status === 409 && (await J(res)).error === "reload" && !db.prepare("SELECT 1 FROM site_applications").get());
  check("  and the page script sends the version this Worker expects", fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8").includes(`const PAGE_VERSION = "${core.PAGE_VERSION}";`));
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [] }, headers: { "X-Olympus": "1" } });
  check("  its write-ins too (its whole list would replace the new roles' picks)", res.status === 409);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [] }, headers: { "X-Olympus": "3" } });
  check("  so is a page of any other version (the next update will not have to remember this line)", res.status === 409 && (await J(res)).error === "reload");
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [] }, headers: { "X-Olympus": "yes" } });
  check("  a header that is not a version number is refused as not from this page", res.status === 403);

  console.log("\n== application ==");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, ack: false } });
  check("without the acknowledgement: 400 on the ack field", res.status === 400 && (await J(res)).field === "ack");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, answers: { ...appBody.answers, leadership: "" } } });
  check("a leadership position needs the leadership answer", res.status === 400 && (await J(res)).field === "leadership");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, character: "Fern" } });
  check("a one-part character name is refused", res.status === 400 && (await J(res)).field === "character");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, answers: { ...appBody.answers, references: [{ kind: "discord", key: "300000000000000001", label: "me" }] } } });
  check("you cannot be your own reference", res.status === 400 && (await J(res)).field === "references");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, answers: { ...appBody.answers, logs: "javascript:alert(1)" } } });
  check("a non-https link is refused", res.status === 400 && (await J(res)).field === "logs");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, position: "grand_poobah" } });
  check("an unknown position is refused", res.status === 400 && (await J(res)).field === "position");
  for (const [backups, why] of [[["officer", "officer"], "the same backup twice"], [["raid_leader_eu"], "a backup equal to the first choice"], [["member"], "plain Member as a backup (the fallback box says that)"],
    [["class_lead"], "Class Lead without its class"], [["class_lead:bard"], "a class that does not exist"], [["officer", "treasurer", "professions"], "three backups"]]) {
    res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, backups } });
    check(`  refused: ${why}`, res.status === 400 && (await J(res)).field === "backups");
  }
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, avail: hexOf([40, 41]) } });
  check("fewer than three hours on the grid is refused", res.status === 400 && (await J(res)).field === "avail");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, avail: "zz" + EU_EVENINGS.slice(2) } });
  check("  so is a grid that is not 42 hex digits", res.status === 400 && (await J(res)).field === "avail");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, position: "raider", backups: ["officer"], answers: { ...appBody.answers, leadership: "" } } });
  check("a leadership backup asks the leadership questions even when the first choice is Raider", res.status === 400 && (await J(res)).field === "leadership");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, board: false } });
  check("a leadership application needs the voting-board box ticked", res.status === 400 && (await J(res)).field === "board");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: { ...appBody, position: "raid_leader", backups: [] } });
  check("a page from before the NA/EU split still works: Raid Leader from Europe is saved as Raid Leader (EU raids)", res.status === 200 && (await J(res)).application.position === "raid_leader_eu");
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: appBody });
  let out = await J(res);
  check("a valid application is saved as submitted, with its backups in order", res.status === 200 && out.application.status === "submitted" && out.application.character === "Fern Melder" &&
    out.application.backups.join(",") === "officer,class_lead:priest", out.application);
  check("  the grid is kept as sent, with the time zone, and read as seven EU raid evenings and no NA ones",
    out.application.avail === EU_EVENINGS && out.application.availTz === "Europe/Stockholm" && out.application.fit.eu === 7 && out.application.fit.na === 0, out.application.fit);
  const aliceRow = () => db.prepare("SELECT fit_na, fit_eu, board_at FROM site_applications WHERE discord_id = '300000000000000001'").get();
  check("  the evenings are stored for the board's filter, and the consent with its time", aliceRow().fit_eu === 7 && aliceRow().fit_na === 0 && aliceRow().board_at === T && out.application.boardAt === T);
  const stored = JSON.parse(db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000001'").get().answers);
  check("  answers stored cleaned, with the acknowledgement time", stored.ackAt === T && stored.references.length === 1 && stored.hours === "10to20" && !("availability" in stored));
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, board: false } });
  out = await J(res);
  check("a member application needs no leadership answers, and no board consent", res.status === 200 && out.application.position === "member" && !("leadership" in out.application.answers) && out.application.fit.na === 7 && out.application.boardAt === null);
  res = await call("DELETE", "/api/application", { who: "300000000000000002" });
  check("withdraw", res.status === 200 && (await J(res)).application.status === "withdrawn");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: memberBody });
  check("  and applying again reopens it", (await J(res)).application.status === "submitted");
  // .114 (Codex, log 19:56 UTC): staff decide while a save is in flight (after its read, before its write): the decision wins
  const answersBefore = db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000002'").get().answers;
  PREPARE_HOOK = (sql) => { if (/^\s*INSERT INTO site_applications/.test(sql)) db.prepare("UPDATE site_applications SET status = 'accepted', reviewed_at = ? WHERE discord_id = '300000000000000002'").run(T); };
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, answers: { ...memberBody.answers, why: "Changed while staff were deciding." } } });
  PREPARE_HOOK = null;
  check("  a save racing a staff decision does not overwrite the decided application (409 decided; answers unchanged)", res.status === 409 && (await J(res)).error === "decided" && db.prepare("SELECT answers, status FROM site_applications WHERE discord_id = '300000000000000002'").get().answers === answersBefore);
  db.prepare("UPDATE site_applications SET status = 'submitted', reviewed_at = NULL WHERE discord_id = '300000000000000002'").run(); // back to open for the checks below
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, position: "pvp_team", backups: ["raider"] } });
  out = await J(res);
  check("PvP Team (.44) is a way in like Raider: no leadership answers or board consent, and Raider as its backup",
    res.status === 200 && out.application.position === "pvp_team" && out.application.backups.join(",") === "raider" && out.application.boardAt === null, out.application);
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, backups: ["pvp_team"] } });
  check("  and a backup choice for a member", res.status === 200 && (await J(res)).application.backups.join(",") === "pvp_team");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, position: "liaison" } });
  check("Liaison (.44) is a leadership role: it asks the leadership questions", res.status === 400 && (await J(res)).field === "leadership");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: { ...memberBody, backups: ["leveling"] } });
  check("  so does Leveling Lead as a backup", res.status === 400 && (await J(res)).field === "leadership");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: memberBody });
  check("  (back to a plain member application)", res.status === 200 && (await J(res)).application.backups.length === 0);
  // .45: the professions they plan to take on their main (optional): Forever's own, two primary at most.
  const withProfs = (professions) => ({ ...memberBody, answers: { ...memberBody.answers, professions } });
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: withProfs(["alchemy", "herbalism", "mining"]) });
  out = await J(res);
  check("professions (.45): three primary ones are refused (a character learns two)", res.status === 400 && out.field === "professions" && /two|2/.test(out.message), out);
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: withProfs(["jewelcrafting"]) });
  check("  so is one Forever does not have (Jewelcrafting came with the first expansion)", res.status === 400 && (await J(res)).field === "professions");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: withProfs("alchemy") });
  check("  and a list that is not a list", res.status === 400 && (await J(res)).field === "professions");
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: withProfs(["fishing", "herbalism", "cooking", "first_aid", "alchemy", "herbalism"]) });
  out = await J(res);
  check("  two primary and all three secondary are fine, each stored once, in the list's order",
    res.status === 200 && out.application.answers.professions.join() === "alchemy,herbalism,cooking,first_aid,fishing", out.application && out.application.answers);
  res = await call("PUT", "/api/application", { who: "300000000000000002", body: withProfs([]) });
  check("  and none chosen stores none", res.status === 200 && !("professions" in (await J(res)).application.answers));

  console.log("\n== roles: what each one involves (.44) ==");
  {
    const ps = data.meta().positions;
    const bad = ps.filter((p) => !p.info || typeof p.info.about !== "string" || p.info.about.length < 60 || !Array.isArray(p.info.duties) || p.info.duties.length < 3 ||
      !Array.isArray(p.info.expect) || p.info.expect.length < 2 || typeof p.info.time !== "string" || !p.info.time || typeof p.info.game !== "string" || p.info.game.length < 20);
    check("every role has a description: what it is, three or more responsibilities, two or more expectations, the time it takes, and (.46) what it comes with in game", bad.length === 0, bad.map((p) => p.key));
    const sentences = ps.flatMap((p) => [p.info.about, p.info.time, p.info.game, ...(p.info.works ? [p.info.works] : []), ...p.info.duties, ...p.info.expect]);
    check("  written as plain sentences: no markup, nothing blank, each one finished", sentences.every((t) => typeof t === "string" && t.trim() === t && /^[A-Z0-9]/.test(t) && /[.!?]$/.test(t) && !/[<>]/.test(t)),
      sentences.filter((t) => !(typeof t === "string" && t.trim() === t && /^[A-Z0-9]/.test(t) && /[.!?]$/.test(t) && !/[<>]/.test(t))));
    check("  the NA and EU raid roles name their own region and evenings",
      /North American raids, evenings Eastern time/.test(ps.find((p) => p.key === "raid_leader_na").info.about) && /European raids, evenings Central European time/.test(ps.find((p) => p.key === "raid_assist_eu").info.about));
    check("  Leveling Lead, Liaison and PvP Team are offered; PvP Team is membership",
      ["leveling", "liaison", "pvp_team"].every((k) => ps.some((p) => p.key === k)) && ps.find((p) => p.key === "pvp_team").group === "membership" && ps.find((p) => p.key === "liaison").group === "leadership");
    const b = (k) => data.BALLOTS.find((x) => x.key === k);
    check("  Leveling Lead (two picks) and Liaison (one) are on the voting board, PvP Team is not", !!b("leveling") && b("leveling").seats === 2 && !!b("liaison") && b("liaison").seats === 1 && !b("pvp_team"));
    const missing = ps.map((p) => p.key.replace(/_(na|eu)$/, "")).filter((k) => !fs.existsSync(path.join(root, "public", "static", "wow", `pos-${k}.png`)));
    check("  every role has its icon from the game art", missing.length === 0, missing);
    const js = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");
    const listed = (js.match(/icon\("pos-" \+ \((\[[^\]]+\])/) || [])[1];
    check("  and the page script shows each one (none falls back to the question mark)", !!listed && ps.every((p) => JSON.parse(listed).includes(p.key.replace(/_(na|eu)$/, ""))));
    check("  Roles, Your data and the private request form are the pages open before signing in (.93), by one list", /ROUTES\.roles = function/.test(js) && /PUBLIC_ROUTES = new Set\(\["roles", "request", "data"\]\)/.test(js) && /!PUBLIC_ROUTES\.has\(head\)/.test(js));
    const html = page.html; // the signed-in page: the descriptions travel in the boot data like every other list
    check("  the descriptions reach the page in its boot data", html.includes("The Liaison speaks for Olympus to other guilds"));
    const game = (k) => ps.find((p) => p.key === k).info.game;
    const guided = ["co_gm", "guild_master", "officer", "recruitment", "pvp_leader", "liaison", "treasurer", "raid_leader_na", "raid_leader_eu", "raid_assist_na", "raid_assist_eu"];
    check("  .122 rank guidance is proposed for post-beta and reaches the boot data without Captain or native Treasurer claims",
      guided.every((k) => /^Post-beta guidance:/.test(game(k))) && ps.every((p) => !/Captain|The Treasurer rank/.test(p.info.game)) &&
      html.includes("Post-beta guidance:") && !html.includes("In the Olympus addon you are a Captain"));
    check("  and the page shows them as the role's \"In game\" fact", /h\("dt", \{ text: "In game" \}\)/.test(js) && /info\.game/.test(js));
  }

  console.log("\n== nominations ==");
  const vote = (ballot, slot, kind, key, label, reason) => ({ ballot, slot, kind, key, label, reason });
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("officer", 1, "discord", "300000000000000001", "me")] } });
  check("self-nomination is refused", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("officer", 1, "discord", VIKTOR, "Fern"), vote("officer", 2, "discord", VIKTOR, "Fern")] } });
  check("the same person twice on one ballot is refused", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("treasurer", 2, "discord", VIKTOR, "Fern")] } });
  check("a slot past the ballot's seats is refused", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("emperor", 1, "discord", VIKTOR, "Fern")] } });
  check("an unknown ballot is refused", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("officer", 1, "name", "", "https://evil.example")] } });
  check("a typed name with a link is refused", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("leveling", 1, "name", "", "Nomad"), vote("leveling", 2, "name", "", "Kryptiiq")] } });
  check("Leveling Lead (.44) takes two write-ins", res.status === 200 && (await J(res)).votes.filter((x) => x.ballot === "leveling").length === 2);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("liaison", 2, "name", "", "Nomad")] } });
  check("  Liaison one", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("pvp_team", 1, "name", "", "Nomad")] } });
  check("  and PvP Team none: it is not on the board", res.status === 400);
  res = await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("officer", 1, "discord", VIKTOR, "Fern (@fernmelder)", "Built the whole thing"), vote("officer", 2, "name", "", "Asmongold"), vote("class_lead:priest", 1, "discord", "300000000000000003", "Carol")] } });
  out = await J(res);
  check("valid picks are saved (Discord and typed)", res.status === 200 && out.votes.length === 3 && out.votes.some((x) => x.ballot === "officer" && x.slot === 2 && x.key === "asmongold"));
  for (const [who, picks] of [
    ["300000000000000002", [vote("officer", 1, "discord", VIKTOR, "Fern"), vote("raid_leader", 1, "discord", "300000000000000001", "Alice")]],
    ["300000000000000003", [vote("officer", 1, "discord", VIKTOR, "Fern"), vote("officer", 2, "name", "", "asmongold")]],
    ["300000000000000007", [vote("officer", 1, "discord", "300000000000000003", "Carol")]],
    ["300000000000000006", [vote("officer", 1, "discord", "300000000000000007", "Grace")]],
  ]) await call("PUT", "/api/votes", { who, body: { votes: picks } });
  res = await call("GET", "/api/me", { who: "300000000000000002" });
  out = await J(res);
  check("/api/me returns only the caller's own picks, never a count", out.votes.length === 2 && !JSON.stringify(out).match(/"(votes|n|count|tally)":\s*\d/));
  res = await call("GET", "/api/admin/votes?ballot=officer", { who: "300000000000000002" });
  check("a member cannot read the tallies (403)", res.status === 403);
  out = await J(await call("GET", "/api/me", { who: VIKTOR }));
  check("someone written in is told the roles on sign-in (never who, never how many)", out.nominatedFor.join() === "officer" && !JSON.stringify(out.nominatedFor).match(/\d/), out.nominatedFor);
  out = await J(await call("GET", "/api/me", { who: "300000000000000001" }));
  check("  Alice was written in for Raid Leader (NA raids) by an old page", out.nominatedFor.includes("raid_leader_na"), out.nominatedFor);
  res = await call("PUT", "/api/votes", { who: "300000000000000003", body: { votes: [vote("officer", 1, "discord", "300000000000000001", "Alice")] } });
  check("saving replaces the whole set", db.prepare("SELECT COUNT(*) AS n FROM site_votes WHERE voter_id = '300000000000000003'").get().n === 1);
  // Labels come from the voter's page. For someone signed up here the site's own names replace them; for anyone else
  // the tallies show the label most voters sent (and the id), so one voter cannot rename a nominee.
  const NOBODY = "600000000000000001";
  await call("PUT", "/api/votes", { who: "300000000000000001", body: { votes: [vote("officer", 1, "discord", VIKTOR, "Fern (@fernmelder)", "Built the whole thing"), vote("officer", 2, "name", "", "Asmongold"), vote("class_lead:priest", 1, "discord", "300000000000000003", "Carol"), vote("pvp_leader", 1, "discord", NOBODY, "Real Name (@real)")] } });
  await call("PUT", "/api/votes", { who: "300000000000000003", body: { votes: [vote("officer", 1, "discord", "300000000000000001", "Alice"), vote("pvp_leader", 1, "discord", NOBODY, "Real Name (@real)")] } });
  await call("PUT", "/api/votes", { who: "300000000000000006", body: { votes: [vote("officer", 1, "discord", "300000000000000007", "Grace"), vote("pvp_leader", 1, "discord", NOBODY, "Zzz Totally Someone Else"), vote("loot_council", 1, "discord", VIKTOR, "Totally Asmongold")] } });
  check("a Discord pick of someone signed up here is stored under their real names", db.prepare("SELECT nominee_label FROM site_votes WHERE voter_id = '300000000000000006' AND ballot = 'loot_council'").get().nominee_label === "Fern (@fernmelder)");
  res = await call("GET", "/api/admin/votes?ballot=pvp_leader", { who: VIKTOR });
  out = await J(res);
  check("  for anyone else the tally shows the label most voters sent", out.nominees.length === 1 && out.nominees[0].label === "Real Name (@real)" && out.nominees[0].votes === 3 && !out.nominees[0].signedUp);

  console.log("\n== tallies (admin) ==");
  res = await call("GET", "/api/admin/votes?ballot=officer", { who: VIKTOR });
  out = await J(res);
  const tally = Object.fromEntries(out.nominees.map((x) => [x.key, x.votes]));
  check("officer tally counts every voter", tally[VIKTOR] === 2 && tally["asmongold"] === 1 && tally["300000000000000001"] === 1 && tally["300000000000000003"] === 1 && out.voters === 5);
  check("  a signed-in nominee is labelled from Discord's names, not the voter's label", out.nominees.find((x) => x.key === VIKTOR).label === "Fern (@fernmelder)");
  check("  applied-for is shown for nominees who applied", out.nominees.find((x) => x.key === "300000000000000001").appliedFor === "raid_leader_eu");
  check("  an old page's Raid Leader nomination is counted under Raid Leader (NA raids)", !!db.prepare("SELECT 1 FROM site_votes WHERE voter_id = '300000000000000002' AND ballot = 'raid_leader_na'").get());
  res = await call("GET", "/api/admin/votes?ballot=officer&minServerDays=7", { who: VIKTOR });
  out = await J(res);
  check("  the 'in the server 7+ days' filter drops Bob, who joined two days ago", (Object.fromEntries(out.nominees.map((x) => [x.key, x.votes]))[VIKTOR] || 0) === 1);
  res = await call("GET", "/api/admin/votes", { who: VIKTOR });
  out = await J(res);
  check("  the summary lists every ballot, class leads included", out.ballots.length === data.BALLOTS.length && out.ballots.find((b) => b.key === "class_lead:priest").top[0].key === "300000000000000003");
  res = await call("GET", `/api/admin/votes/voters?ballot=officer&kind=discord&key=${VIKTOR}`, { who: VIKTOR });
  out = await J(res);
  check("  and who voted for someone, with their reasons", out.voters.length === 2 && out.voters.some((v) => v.reason === "Built the whole thing"));


  {
    console.log("\n== the voting board ==");
    T += 61;
    const A = "300000000000000001", B = "300000000000000002", C = "300000000000000003", G = "300000000000000007";
    // Alice: Raid Leader (EU) first, then Officer and Priest Class Lead. Carol: Officer, then Raid Assist (NA). Grace:
    // Raider first with Officer as a backup. Bob applied as a Member, which is never on the board.
    res = await call("PUT", "/api/application", { who: C, body: { ...appBody, position: "officer", backups: ["raid_assist_na"], class: "mage", role: "dps", region: "na_east", character: "", avail: NA_EVENINGS, availTz: "America/New_York", answers: { ...appBody.answers, references: [], experience: "Officer in two Classic guilds." } } });
    check("Carol applies for Officer with a backup", res.status === 200, await J(res));
    res = await call("PUT", "/api/application", { who: G, body: { ...appBody, position: "raider", backups: ["officer"], class: "warrior", role: "tank", region: "na_west", character: "", avail: hexOf([...evenings(24), ...evenings(18)]), availTz: "America/Los_Angeles" } });
    check("Grace applies as a Raider with Officer as a backup", res.status === 200);
    res = await call("GET", "/api/board", { who: B });
    out = await J(res);
    const count = (k) => out.roles.find((r) => r.key === k);
    check("the board's summary: Officer has three applicants (a first choice and two backups), and each role its own",
      res.status === 200 && count("officer").applicants === 3 && count("raid_leader_eu").applicants === 1 && count("class_lead:priest").applicants === 1 && count("raid_assist_na").applicants === 1 && count("raider") === undefined, out.roles.filter((r) => r.applicants));
    res = await call("GET", "/api/board/officer", { who: B });
    out = await J(res);
    const card = out.candidates.find((x) => x.id === A);
    check("the Officer board lists the three, with first choice or backup", out.total === 3 && out.candidates.length === 3 && card.choice === 2 && out.candidates.find((x) => x.id === C).choice === 1 && out.candidates.find((x) => x.id === G).choice === 2);
    check("  a card shows the name, class, role, region, raid evenings and the written answers",
      card.label === "Alice of Olympus (@alice)" && card.class === "priest" && card.role === "healer" && card.region === "eu" && card.fit.eu === 7 && card.answers.experience && card.answers.leadership && card.answers.scenario && card.answers.why);
    check("  and nothing the form keeps private: no logs, notes, references, voice, hours, character or grid",
      ["logs", "extra", "references", "voice", "hours", "ackAt"].every((k) => !(k in card.answers)) && !("character" in card) && !("avail" in card) && !JSON.stringify(out).includes("work nights"));
    check("  and no counts of any kind", !/"(yes|no|votes|count|tally|net)"\s*:/.test(JSON.stringify(out)));
    const order1 = out.candidates.map((x) => x.id).join();
    check("  the order is stable for one voter", (await J(await call("GET", "/api/board/officer", { who: B }))).candidates.map((x) => x.id).join() === order1);
    res = await call("GET", "/api/board/class_lead:priest", { who: B });
    check("  Class Lead boards go by class", (await J(res)).candidates.map((x) => x.id).join() === A);
    res = await call("GET", "/api/board/member", { who: B });
    check("  Member is not a board", res.status === 404);
    res = await call("GET", "/api/board/%E0", { who: B });
    check("  a role that is not even valid URL encoding: 404, not a crash", res.status === 404);
    const bv = (who, candidate, role, vote) => call("PUT", "/api/board/vote", { who, body: { candidate, role, vote } });
    res = await bv(B, A, "officer", 1);
    check("vote for", res.status === 200 && (await J(res)).vote === 1);
    res = await bv(B, C, "officer", -1);
    check("vote against", res.status === 200);
    res = await bv(B, G, "officer", 1);
    res = await bv(B, G, "officer", 0);
    check("  a second click takes the vote back", res.status === 200 && !db.prepare("SELECT 1 FROM site_board_votes WHERE voter_id = ?1 AND candidate_id = ?2").get(B, G));
    res = await bv(A, A, "officer", 1);
    check("nobody votes on their own application", res.status === 400);
    res = await bv(B, C, "raid_leader_eu", 1);
    check("  or on someone under a role they did not choose", res.status === 409);
    res = await bv(A, B, "officer", 1);
    check("  or on someone who is not on the board", res.status === 409);
    res = await bv(B, A, "officer", 2);
    check("  a vote is +1, -1 or 0", res.status === 400);
    res = await call("PUT", "/api/board/vote", { who: B, body: { candidate: A, role: "officer", vote: 1 }, headers: { "X-Olympus": null } });
    check("  and a vote without the page's header is refused", res.status === 403);
    await bv(C, A, "officer", 1);
    await bv(G, A, "officer", -1);
    await bv(A, C, "officer", 1);
    await bv(A, C, "raid_assist_na", 1);
    res = await call("GET", "/api/board/officer", { who: B });
    out = await J(res);
    check("a voter sees only their own votes", out.candidates.find((x) => x.id === A).myVote === 1 && out.candidates.find((x) => x.id === C).myVote === -1 && out.candidates.find((x) => x.id === G).myVote === 0 && out.voted === 2);
    res = await call("GET", "/api/board/officer?todo=1", { who: B });
    check("  'not voted yet' leaves only Grace", (await J(res)).candidates.map((x) => x.id).join() === G);
    res = await call("GET", "/api/board/officer?todo=1", { who: A });
    check("  and never lists the voter themself", !(await J(res)).candidates.some((x) => x.id === A));
    res = await call("GET", "/api/board/officer?class=mage", { who: B });
    check("filter by class", (await J(res)).candidates.map((x) => x.id).join() === C);
    res = await call("GET", "/api/board/officer?fit=eu", { who: B });
    out = await J(res);
    check("filter by EU raid evenings (three or more)", out.candidates.map((x) => x.id).sort().join() === [A, G].sort().join() && out.matching === 2 && out.total === 3);
    res = await call("GET", "/api/me", { who: B });
    out = await J(res);
    check("/api/me carries the member's own number of board votes, and still no counts about anyone", out.boardVotes === 2 && !JSON.stringify(out).match(/"(yes|no|tally)":/));
    res = await call("GET", "/api/board", { who: A });
    out = await J(res);
    check("an applicant's own progress leaves themself out: Alice can vote on 2 of Officer's 3, and on nobody for Priest Class Lead",
      out.roles.find((r) => r.key === "officer").votable === 2 && out.roles.find((r) => r.key === "officer").applicants === 3 && out.roles.find((r) => r.key === "class_lead:priest").votable === 0);
    check("  Bob, not an applicant, can vote on all 3", (await J(await call("GET", "/api/board", { who: B }))).roles.find((r) => r.key === "officer").votable === 3);
    out = await J(await call("GET", "/api/board/officer", { who: A }));
    check("  the role page says the same (total 3, votable 2)", out.total === 3 && out.votable === 2);
    // Pages: 24 more Officer applications; 20 a page, no one twice, and every page in the voter's own order.
    for (let i = 0; i < 24; i++) {
      const id = String(710000000000000000n + BigInt(i));
      db.prepare("INSERT INTO site_users (discord_id, username, first_login, last_login) VALUES (?1, ?2, ?3, ?3)").run(id, "applicant" + i, T);
      db.prepare("INSERT INTO site_applications (discord_id, position, class, role, region, answers, status, created_at, updated_at, avail, fit_na, fit_eu, board_at) VALUES (?1, 'officer', 'rogue', 'dps', 'eu', ?2, 'submitted', ?3, ?3, ?4, 0, 7, ?3)")
        .run(id, JSON.stringify({ experience: "x".repeat(1500), why: "y", logs: "https://secret.example/" }), T, EU_EVENINGS);
    }
    const p1 = await J(await call("GET", "/api/board/officer", { who: B }));
    const p2 = await J(await call("GET", "/api/board/officer?offset=20", { who: B }));
    const seen = [...p1.candidates, ...p2.candidates].map((x) => x.id);
    check("the board comes 20 to a page, and the pages add up", p1.candidates.length === 20 && p2.candidates.length === 7 && new Set(seen).size === 27 && p1.total === 27);
    const pC = await J(await call("GET", "/api/board/officer", { who: C }));
    check("  another voter gets another order (nobody is first for everyone)", pC.candidates.map((x) => x.id).join() !== p1.candidates.map((x) => x.id).join());
    check("  a page carries the answers of its own 20 only", JSON.stringify(p1).length < 20 * 3200);
    await call("PUT", "/api/admin/settings", { who: VIKTOR, body: { votingOpen: false } });
    res = await bv(B, G, "officer", 1);
    check("with voting closed, votes are refused", res.status === 403 && (await J(res)).error === "closed");
    await call("PUT", "/api/admin/settings", { who: VIKTOR, body: { votingOpen: true } });

    console.log("\n== the board (admin) ==");
    res = await call("GET", "/api/admin/board", { who: B });
    check("a member cannot read the board's counts (403)", res.status === 403);
    res = await call("GET", "/api/admin/board", { who: VIKTOR });
    out = await J(res);
    const off = out.roles.find((r) => r.key === "officer");
    check("summary: Officer's applicants, voters, and the best balance first", off.applicants === 27 && off.voters === 4 && off.top[0].id === A && off.top[0].yes === 2 && off.top[0].no === 1 && off.top[1].id === C, off);
    res = await call("GET", "/api/admin/board?role=officer", { who: VIKTOR });
    out = await J(res);
    const tA = out.candidates.find((x) => x.id === A), tC = out.candidates.find((x) => x.id === C);
    check("per role: for and against for every applicant, with their choice and raid evenings", tA.yes === 2 && tA.no === 1 && tA.choice === 2 && tA.fit.eu === 7 && tC.yes === 1 && tC.no === 1 && out.candidates.length === 27 && out.voters === 4);
    check("  sorted by balance", out.candidates[0].id === A);
    res = await call("GET", "/api/admin/board?role=officer&minServerDays=7", { who: VIKTOR });
    out = await J(res);
    check("  'in the server 7+ days' drops Bob's votes", out.candidates.find((x) => x.id === A).yes === 1 && out.candidates.find((x) => x.id === C).no === 0);
    res = await call("GET", `/api/admin/board/voters?role=officer&candidate=${A}`, { who: VIKTOR });
    out = await J(res);
    check("  and who voted how", out.voters.length === 3 && out.voters.filter((v) => v.vote === 1).length === 2 && out.voters.some((v) => v.id === G && v.vote === -1));
    res = await call("GET", `/api/admin/applications/${A}`, { who: VIKTOR });
    out = await J(res);
    check("the application's page shows its board counts per chosen role", out.board.map((b) => `${b.role}:${b.choice}:${b.yes}:${b.no}`).join(" ") === "raid_leader_eu:1:0:0 officer:2:2:1 class_lead:priest:3:0:0", out.board);
    res = await call("GET", "/api/admin/availability", { who: VIKTOR });
    out = await J(res);
    check("availability: every open application's grid summed per UTC hour", out.applications === 28 && out.hours[18] === 26 && out.hours[24] === 3 && out.fits.eu === 26 && out.fits.na === 3, { n: out.applications, h18: out.hours[18], h24: out.hours[24], fits: out.fits });
    res = await call("GET", "/api/admin/availability?role=raid_assist_na", { who: VIKTOR });
    check("  or for one role", (await J(res)).applications === 1);
    res = await call("GET", "/api/admin/applications?position=officer&status=open", { who: VIKTOR });
    const firstOnly = (await J(res)).total;
    res = await call("GET", "/api/admin/applications?position=officer&status=open&backups=1", { who: VIKTOR });
    check("the applications list can include backup choices", firstOnly === 25 && (await J(res)).total === 27, { firstOnly });
    res = await call("GET", "/api/admin/applications?position=class_lead&status=open&backups=1", { who: VIKTOR });
    check("  a Class Lead backup counts under Class Lead", (await J(res)).items.some((x) => x.user.id === A));
    // Withdrawn: off the board; the admin still sees the votes it had.
    res = await call("GET", `/api/admin/applications/${G}`, { who: VIKTOR });
    check("the admin page lists only the roles that are voted on (Grace's Raider first choice is not)", (await J(res)).board.map((b) => b.role).join() === "officer");
    await bv(B, G, "officer", 1);
    const before = (await J(await call("GET", "/api/me", { who: B }))).boardVotes;
    await call("DELETE", "/api/application", { who: G });
    check("  a vote on someone who left the board no longer counts as 'voted on'", (await J(await call("GET", "/api/me", { who: B }))).boardVotes === before - 1);
    res = await bv(B, G, "officer", 0);
    check("  but it can still be taken back", res.status === 200 && !db.prepare("SELECT 1 FROM site_board_votes WHERE voter_id = ?1 AND candidate_id = ?2").get(B, G));
    res = await call("GET", "/api/board/officer", { who: B });
    check("a withdrawn application leaves the board", !(await J(res)).candidates.some((x) => x.id === G));
    res = await bv(B, G, "officer", 1);
    check("  and can no longer be voted on", res.status === 409);
    // An application saved before the board existed was promised privacy: it stays off the board until re-saved.
    db.prepare("INSERT INTO site_users (discord_id, username, first_login, last_login) VALUES ('720000000000000001', 'oldtimer', ?1, ?1)").run(T);
    db.prepare("INSERT INTO site_applications (discord_id, position, class, role, region, answers, status, created_at, updated_at) VALUES ('720000000000000001', 'officer', 'mage', 'dps', 'eu', ?1, 'submitted', ?2, ?2)")
      .run(JSON.stringify({ experience: "Written when the site said nobody else would read it." }), T);
    res = await call("GET", "/api/board/officer", { who: B });
    check("an application from before the board (no consent) is not on it", !(await J(res)).candidates.some((x) => x.id === "720000000000000001"));
    res = await call("GET", "/api/admin/board", { who: VIKTOR });
    check("  nor counted as an applicant there (Alice, Carol and the 24; Grace withdrew)", (await J(res)).roles.find((r) => r.key === "officer").applicants === 26);
    db.prepare("UPDATE site_applications SET board_at = ?1 WHERE discord_id = '720000000000000001'").run(T);
    res = await call("GET", "/api/board/officer", { who: B });
    check("  until its applicant saves it with the box ticked", (await J(res)).total === 27);
    db.prepare("DELETE FROM site_applications WHERE discord_id = '720000000000000001'").run();
    db.prepare("DELETE FROM site_users WHERE discord_id = '720000000000000001'").run();
    db.prepare("DELETE FROM site_applications WHERE discord_id LIKE '7100%'").run();
    db.prepare("DELETE FROM site_users WHERE discord_id LIKE '7100%'").run();
    await call("DELETE", "/api/application", { who: C });
    res = await call("GET", "/api/admin/board?role=officer", { who: VIKTOR });
    out = await J(res);
    check("  the admin still sees Carol's votes, marked as off the board", out.candidates.find((x) => x.id === C).onBoard === false && out.candidates.find((x) => x.id === C).status === "withdrawn");
  }

  {
    console.log("\n== appointed roles ==");
    T += 61;
    const A = "300000000000000001", B = "300000000000000002", C = "300000000000000003";
    const me = async (who) => J(await call("GET", "/api/me", { who }));
    // .115 (item C): a typed name added or changed needs the administrator's consent tick (owner_requests_test.cjs covers the refusal)
    const setAppointed = (appointed) => call("PUT", "/api/admin/settings", { who: VIKTOR, body: { appointed, namesConfirmed: true } });
    check("until the list is first saved, the Treasurer is appointed (Fernmelder)", (await me(A)).settings.appointed.treasurer === "Fernmelder");
    res = await call("PUT", "/api/application", { who: B, body: { ...appBody, position: "treasurer", backups: [] } });
    out = await J(res);
    check("  so it cannot be a first choice", res.status === 400 && out.field === "position" && /appointed/.test(out.message), out);
    res = await call("PUT", "/api/application", { who: B, body: { ...appBody, backups: ["treasurer"] } });
    check("  nor a backup", res.status === 400 && (await J(res)).field === "backups");
    res = await call("GET", "/api/board/treasurer", { who: B });
    out = await J(res);
    check("  its board is closed, and says who holds it", res.status === 409 && out.error === "appointed" && out.appointed === "Fernmelder");
    // Class Lead (Priest): Alice has it as a backup; Bob votes on her there and Carol writes Bob in for it.
    res = await call("PUT", "/api/board/vote", { who: B, body: { candidate: A, role: "class_lead:priest", vote: 1 } });
    check("before it is appointed, Class Lead (Priest) can be voted on", res.status === 200);
    await call("PUT", "/api/votes", { who: C, body: { votes: [vote("class_lead:priest", 1, "discord", B, "Bob")] } });
    const bobBefore = await me(B);
    check("  and Bob hears he was written in for it", bobBefore.nominatedFor.includes("class_lead:priest"), bobBefore.nominatedFor);
    res = await setAppointed({ treasurer: "Fernmelder", "class_lead:priest": "  Kryptiiq  ", emperor: "Someone", officer: "" });
    out = await J(res);
    check("an admin appoints: unknown roles and empty names are dropped, names tidied",
      res.status === 200 && JSON.stringify(out.settings.appointed) === JSON.stringify({ treasurer: "Fernmelder", "class_lead:priest": "Kryptiiq" }), out.settings && out.settings.appointed);
    res = await call("PUT", "/api/admin/settings", { who: VIKTOR, body: { appointed: "Kryptiiq" } });
    check("  a list that is not a list is refused", res.status === 400 && (await J(res)).field === "appointed");
    res = await call("PUT", "/api/admin/settings", { who: B, body: { appointed: {} } });
    check("  and a member cannot change it", res.status === 403);
    const bobAfter = await me(B);
    check("an appointed role leaves the member's progress and nominations", bobAfter.boardVotes === bobBefore.boardVotes - 1 && !bobAfter.nominatedFor.includes("class_lead:priest"), { before: bobBefore.boardVotes, after: bobAfter.boardVotes, nominatedFor: bobAfter.nominatedFor });
    res = await call("PUT", "/api/board/vote", { who: B, body: { candidate: A, role: "class_lead:priest", vote: -1 } });
    check("  no more votes on it", res.status === 409 && (await J(res)).error === "appointed");
    res = await call("PUT", "/api/board/vote", { who: B, body: { candidate: A, role: "class_lead:priest", vote: 0 } });
    check("  but a vote can still be taken back", res.status === 200 && !db.prepare("SELECT 1 FROM site_board_votes WHERE voter_id = ?1 AND role_key = 'class_lead:priest'").get(B));
    res = await call("GET", "/api/board/officer", { who: B });
    check("Alice stays on the board for her other choices", (await J(res)).candidates.some((x) => x.id === A));
    res = await call("PUT", "/api/application", { who: A, body: { ...appBody, position: "raid_leader_eu", backups: ["officer", "class_lead:priest"], class: "priest", role: "healer", region: "eu" } });
    check("  and to save her application again she drops the appointed backup", res.status === 400 && (await J(res)).field === "backups");
    res = await call("PUT", "/api/application", { who: B, body: { ...appBody, position: "class_lead", classLead: "priest", backups: [] } });
    check("  Class Lead for an appointed class is refused on the class", res.status === 400 && (await J(res)).field === "classLead");
    await call("PUT", "/api/votes", { who: C, body: { votes: [vote("officer", 1, "discord", A, "Alice"), vote("class_lead:priest", 1, "discord", A, "Alice")] } });
    const cRows = db.prepare("SELECT ballot, nominee_key FROM site_votes WHERE voter_id = ?1 ORDER BY ballot").all(C).map((r) => `${r.ballot}:${r.nominee_key}`).join();
    check("write-ins for an appointed role stay as they were; what the page sends for it is ignored", cRows === `class_lead:priest:${B},officer:${A}`, cRows);
    res = await setAppointed({});
    out = await J(res);
    check("an empty list opens every role again (the Treasurer default does not come back)", res.status === 200 && Object.keys(out.settings.appointed).length === 0 && (await call("GET", "/api/board/treasurer", { who: B })).status === 200);
    res = await setAppointed({ leveling: "Nomad", liaison: "Kryptiiq", pvp_team: "Someone" });
    out = await J(res);
    check("Leveling Lead and Liaison can be appointed like any board role; PvP Team, not being one, cannot",
      res.status === 200 && JSON.stringify(out.settings.appointed) === JSON.stringify({ leveling: "Nomad", liaison: "Kryptiiq" }), out.settings && out.settings.appointed);
    res = await call("PUT", "/api/application", { who: B, body: { ...appBody, position: "liaison", backups: [] } });
    check("  and an appointed Liaison takes no applications", res.status === 400 && (await J(res)).field === "position");
    await setAppointed({ treasurer: "Fernmelder" });
    const settingsRows = db.prepare("SELECT details FROM audit WHERE action = 'site.settings' ORDER BY id").all();
    const lastSettings = JSON.parse(settingsRows.at(-1).details);
    check("(.115) the dated log keeps the appointed roles' keys and how many names, never the names", lastSettings.appointedNames === 1 && JSON.stringify(lastSettings.appointedRoles) === '["treasurer"]' && lastSettings.namesConfirmed === true && !("appointed" in lastSettings) &&
      settingsRows.every((r) => !/Kryptiiq|Nomad|Someone/.test(r.details)), lastSettings);
  }

  {
    console.log("\n== roles without a public vote, the Co-Guild Master and professions (.45) ==");
    T += 61;
    const A = "300000000000000001", B = "300000000000000002", C = "300000000000000003";
    const me = async (who) => J(await call("GET", "/api/me", { who }));
    const setNoVote = (noVote, who = VIKTOR) => call("PUT", "/api/admin/settings", { who, body: { noVote } });
    const bv = (who, candidate, role, vote) => call("PUT", "/api/board/vote", { who, body: { candidate, role, vote } });
    const ps = data.meta().positions;
    const cogm = ps.find((p) => p.key === "co_gm");
    check("the Co-Guild Master is a leadership role with one write-in pick, first on the list", !!cogm && cogm.group === "leadership" && ps[0].key === "co_gm" && data.BALLOTS.find((b) => b.key === "co_gm").seats === 1);
    check("  and, until the list is first saved, it is chosen without a public vote", JSON.stringify((await me(A)).settings.noVote) === '["co_gm"]');
    const cogmBody = { ...appBody, position: "co_gm", backups: [], board: false, class: "warrior", role: "tank", region: "na_east", character: "", avail: NA_EVENINGS, availTz: "America/New_York",
      answers: { ...appBody.answers, references: [], professions: ["blacksmithing", "mining", "cooking"] } };
    res = await call("PUT", "/api/application", { who: B, body: { ...cogmBody, answers: { ...cogmBody.answers, leadership: "" } } });
    check("applying for it asks the leadership questions like any leadership role", res.status === 400 && (await J(res)).field === "leadership");
    res = await call("PUT", "/api/application", { who: B, body: cogmBody });
    out = await J(res);
    check("  but not for the voting board: saved without the box, and kept off the board", res.status === 200 && out.application.position === "co_gm" && out.application.boardAt === null, out);
    res = await call("PUT", "/api/application", { who: B, body: { ...cogmBody, board: true } });
    check("  even when the page ticks it (nothing of it is voted on)", res.status === 200 && (await J(res)).application.boardAt === null && db.prepare("SELECT board_at FROM site_applications WHERE discord_id = ?1").get(B).board_at === null);
    res = await call("PUT", "/api/application", { who: C, body: { ...appBody, position: "officer", backups: ["co_gm"], board: false, class: "mage", role: "dps", region: "na_east", character: "", avail: NA_EVENINGS, availTz: "America/New_York", answers: { ...appBody.answers, references: [], professions: ["tailoring", "enchanting"] } } });
    out = await J(res);
    check("a voted role beside it still needs the box (Officer first, Co-Guild Master as a backup)", res.status === 400 && out.field === "board");
    check("  and the refusal carries the current list, so a page opened before a change can show the box", JSON.stringify(out.noVote) === '["co_gm"]', out);
    res = await call("PUT", "/api/application", { who: C, body: { ...appBody, position: "officer", backups: ["co_gm"], board: true, class: "mage", role: "dps", region: "na_east", character: "", avail: NA_EVENINGS, availTz: "America/New_York", answers: { ...appBody.answers, references: [], professions: ["tailoring", "enchanting"] } } });
    out = await J(res);
    check("  and with it, Carol is on the board (her first agreement's time is kept)", res.status === 200 && out.application.boardAt !== null && out.application.boardAt < T && out.application.status === "submitted", out.application);
    res = await call("GET", "/api/board/co_gm", { who: A });
    out = await J(res);
    check("the Co-Guild Master has no board to read", res.status === 409 && out.error === "no_vote" && /without a public vote/.test(out.message), out);
    res = await call("GET", "/api/board/officer", { who: A });
    out = await J(res);
    const carol = out.candidates.find((x) => x.id === C);
    check("  Carol is on the Officer board, and her professions are not shown there", !!carol && !("professions" in carol.answers) && !JSON.stringify(out).includes("tailoring"));
    res = await call("GET", "/api/board", { who: A });
    out = await J(res);
    const sum = (k) => out.roles.find((r) => r.key === k);
    check("  the board's summary shows no count for it, though Carol lists it", sum("co_gm").applicants === 0 && sum("co_gm").votable === 0 && sum("officer").applicants >= 2, sum("co_gm"));
    res = await bv(A, C, "co_gm", 1);
    check("  nobody can vote on it", res.status === 409 && (await J(res)).error === "no_vote");
    res = await bv(A, C, "co_gm", 0);
    check("  (taking a vote back always works)", res.status === 200);
    await call("PUT", "/api/votes", { who: A, body: { votes: [vote("officer", 1, "discord", C, "Carol"), vote("co_gm", 1, "discord", B, "Bob")] } });
    const aRows = db.prepare("SELECT ballot, nominee_key FROM site_votes WHERE voter_id = ?1 ORDER BY ballot").all(A).map((r) => `${r.ballot}:${r.nominee_key}`).join();
    check("  and a write-in for it is ignored", aRows === `officer:${C}`, aRows);

    // An admin takes Officer off the public vote too, then gives both back.
    const bobVotes = (await me(B)).boardVotes;
    res = await setNoVote(["officer", "emperor", "co_gm", "co_gm"]);
    out = await J(res);
    check("an admin sets the list: unknown roles dropped, each role once, in the board's order", res.status === 200 && JSON.stringify(out.settings.noVote) === '["co_gm","officer"]', out.settings && out.settings.noVote);
    res = await setNoVote("officer");
    check("  a list that is not a list is refused", res.status === 400 && (await J(res)).field === "noVote");
    res = await setNoVote([], B);
    check("  and a member cannot change it", res.status === 403);
    res = await call("GET", "/api/board/officer", { who: A });
    check("with Officer off the public vote, its board is closed", res.status === 409 && (await J(res)).error === "no_vote");
    res = await bv(A, C, "officer", 1);
    check("  and takes no votes", res.status === 409);
    await call("PUT", "/api/votes", { who: C, body: { votes: [vote("officer", 1, "discord", B, "Bob")] } });
    const cOfficer = db.prepare("SELECT nominee_key FROM site_votes WHERE voter_id = ?1 AND ballot = 'officer'").all(C).map((r) => r.nominee_key).join();
    check("  its write-ins stay as they were (Carol's pick of Alice is kept; the page's new pick is ignored)", cOfficer === A, cOfficer);
    res = await call("PUT", "/api/application", { who: C, body: { ...appBody, position: "officer", backups: ["co_gm"], board: false, class: "mage", role: "dps", region: "na_east", character: "", avail: NA_EVENINGS, availTz: "America/New_York", answers: { ...appBody.answers, references: [], professions: ["tailoring", "enchanting"] } } });
    check("  Carol, with only roles without a public vote now, can save without the box (and leaves the board)", res.status === 200 && (await J(res)).application.boardAt === null);
    const aliceMe = await me(A);
    check("  Alice is no longer told she was written in for Officer", !aliceMe.nominatedFor.includes("officer"), aliceMe.nominatedFor);
    check("  and Bob's votes on the Officer board (Alice and Carol) leave his progress", bobVotes === 2 && (await me(B)).boardVotes === 0, bobVotes);
    res = await setNoVote([]);
    check("an empty list puts every role to the vote (the Co-Guild Master default does not come back)", res.status === 200 && (await J(res)).settings.noVote.length === 0);
    res = await call("GET", "/api/board/co_gm", { who: A });
    out = await J(res);
    check("  the Co-Guild Master's board opens, without the applications that never agreed to it (Bob's, and Carol's since)", res.status === 200 && out.total === 0, out);
    check("  and Alice hears about the Officer write-in again", (await me(A)).nominatedFor.includes("officer"));
    res = await setNoVote(["co_gm"]);
    check("  (back to the Co-Guild Master alone)", res.status === 200 && JSON.stringify((await J(res)).settings.noVote) === '["co_gm"]');
    // One class's Class Lead without a public vote; and a role both appointed and on the list is simply appointed.
    await setNoVote(["co_gm", "class_lead:mage"]);
    res = await call("PUT", "/api/application", { who: B, body: { ...cogmBody, position: "class_lead", classLead: "mage", backups: [], board: false } });
    out = await J(res);
    check("a Class Lead for a class without a public vote needs no board consent", res.status === 200 && out.application.boardAt === null, out);
    res = await call("GET", "/api/board/class_lead:mage", { who: A });
    check("  that class's board is closed", res.status === 409 && (await J(res)).error === "no_vote");
    res = await call("GET", "/api/board/class_lead:priest", { who: A });
    check("  and another class's is not", res.status === 200);
    res = await call("PUT", "/api/application", { who: B, body: { ...cogmBody, position: "class_lead", classLead: "priest", backups: [], board: false } });
    check("  a voted class still needs it", res.status === 400 && (await J(res)).field === "board");
    await setNoVote(["co_gm", "treasurer"]);
    res = await call("GET", "/api/board/treasurer", { who: A });
    out = await J(res);
    check("appointed comes first: the Treasurer, appointed and on the list, answers as appointed", res.status === 409 && out.error === "appointed" && out.appointed === "Fernmelder", out);
    res = await call("GET", "/api/board", { who: A });
    out = await J(res);
    check("  the board's summary shows no count for an appointed role either", out.roles.find((r) => r.key === "treasurer").applicants === 0);
    await setNoVote(["co_gm"]);
    await call("PUT", "/api/application", { who: B, body: cogmBody });

    // Professions, for the leadership: a table on the admin overview, a filter on the applications, a column in the export.
    res = await call("GET", "/api/admin/overview", { who: VIKTOR });
    out = await J(res);
    const pc = Object.fromEntries(out.professions.map((r) => [r.profession, r.n]));
    check("the admin overview counts the professions of open applications", pc.blacksmithing === 1 && pc.mining === 1 && pc.cooking === 1 && pc.tailoring === 1 && pc.enchanting === 1 && !pc.alchemy, pc);
    res = await call("GET", "/api/admin/applications?profession=mining&status=open", { who: VIKTOR });
    out = await J(res);
    check("  the applications list filters by profession", out.total === 1 && out.items[0].user.id === B && out.items[0].answers.professions.join() === "blacksmithing,mining,cooking", out.total);
    res = await call("GET", "/api/admin/applications?profession=jewelcrafting&status=open", { who: VIKTOR });
    check("  an unknown profession filters nothing", (await J(res)).total >= 3);
    res = await call("GET", "/api/admin/applications?position=officer&backups=1&profession=tailoring&status=open&q=car", { who: VIKTOR });
    out = await J(res);
    check("  every filter at once (position with backups, profession, status, search) binds cleanly", res.status === 200 && out.total === 1 && out.items[0].user.id === C, out);
    res = await call("GET", "/api/admin/export/applications", { who: VIKTOR });
    out = await J(res);
    const pcol = out.columns.indexOf("professions");
    const bRow = out.rows.find((r) => r[0] === B);
    check("  and the export has a professions column", pcol > 0 && bRow && bRow[pcol] === "blacksmithing mining cooking", bRow && bRow[pcol]);
    const missing = data.PROFESSIONS.filter((p) => !fs.existsSync(path.join(root, "public", "static", "wow", `${p.icon}.png`))).map((p) => p.key);
    check("every profession has its icon from the game art", missing.length === 0, missing);
    check("  Forever's professions: nine primary, three secondary, no Jewelcrafting or Inscription",
      data.PROFESSIONS.filter((p) => p.kind === "primary").length === 9 && data.PROFESSIONS.filter((p) => p.kind === "secondary").length === 3 && !data.PROFESSIONS.some((p) => /jewel|inscri/.test(p.key)));
    // A page from before .45 sends no professions: the stored ones stay. The .45 form always sends its list, even empty.
    res = await call("PUT", "/api/application", { who: B, body: { ...cogmBody, answers: { ...cogmBody.answers, professions: undefined } } });
    check("a re-save from a page that does not know professions keeps the stored ones", res.status === 200 && (await J(res)).application.answers.professions.join() === "blacksmithing,mining,cooking");
    await call("DELETE", "/api/application", { who: C });
    res = await call("GET", "/api/admin/overview", { who: VIKTOR });
    check("the professions table counts open applications only: Carol's withdrawn one leaves it", !(await J(res)).professions.some((r) => r.profession === "tailoring"));
    await call("POST", `/api/admin/users/${B}/deny`, { who: VIKTOR, body: { reason: "test" } });
    res = await call("GET", "/api/admin/overview", { who: VIKTOR });
    check("  and a denied account's leaves it too", !(await J(res)).professions.some((r) => r.profession === "mining"));
    await call("POST", `/api/admin/users/${B}/undeny`, { who: VIKTOR });
    await signIn(B); // the denial signed him out
    // Leave the others as the later sections expect them: Bob a member again (without professions), Carol withdrawn.
    res = await call("PUT", "/api/application", { who: B, body: { ...memberBody, answers: { ...memberBody.answers, professions: [] } } });
    check("  (Bob back to a plain member application)", res.status === 200 && !("professions" in (await J(res)).application.answers));
  }

  console.log("\n== friends ==");
  res = await call("PUT", "/api/friends", { who: "300000000000000001", body: { friends: Array.from({ length: 11 }, (_, i) => ({ kind: "name", label: `Friend Number${String.fromCharCode(65 + i)}` })) } });
  check("more than ten friends is refused", res.status === 400);
  res = await call("PUT", "/api/friends", { who: "300000000000000001", body: { friends: [{ kind: "discord", key: "300000000000000001", label: "me" }] } });
  check("you are not your own friend", res.status === 400);
  res = await call("PUT", "/api/friends", { who: "300000000000000001", body: { friends: [{ kind: "discord", key: "300000000000000002", label: "bob", note: "brother" }, { kind: "name", label: "Uncle Ted" }, { kind: "name", label: "uncle  ted" }] } });
  out = await J(res);
  check("friends saved; a typed duplicate is merged", res.status === 200 && out.friends.length === 2 && out.friends[0].note === "brother");
  res = await call("GET", "/api/admin/friends", { who: VIKTOR });
  check("admin: most-requested friends", (await J(res)).friends.length === 2);

  console.log("\n== search ==");
  res = await call("GET", "/api/search?q=al", { who: "300000000000000002" });
  out = await J(res);
  check("member search finds Alice, flagged as signed up", out.results.length === 1 && out.results[0].id === "300000000000000001" && out.results[0].onSite === true && out.results[0].label === "Alice of Olympus (@alice)");
  check("  a member does not see who is verified in game", !("linked" in out.results[0]));
  check("  .114: each result also carries the names it is SHOWN with: nickname, display name and @username; the stored label unchanged", out.results[0].shown === "Alice of Olympus · Alice A (@alice)" && out.results[0].label === "Alice of Olympus (@alice)"); // the server nickname no longer hides the display name
  const before = D.calls.filter((c) => c.includes("/members/search")).length;
  await call("GET", "/api/search?q=AL", { who: "300000000000000002" });
  check("  the same query again is served from the cache", D.calls.filter((c) => c.includes("/members/search")).length === before);
  D.searchLimited = true;
  res = await call("GET", "/api/search?q=gr", { who: "300000000000000002" });
  out = await J(res);
  check("  a Discord 429 comes back as 'limited', not an error", res.status === 200 && out.limited === true && out.results.length === 0);
  D.searchLimited = false;
  res = await call("GET", "/api/search?q=a", { who: "300000000000000002" });
  check("  one character searches nothing", (await J(res)).results.length === 0);

  console.log("\n== reserved names ==");
  T += 61; // a fresh minute for the soft rate limit (30 saves a minute): the sections above saved a lot as Alice
  res = await call("PUT", "/api/reserved", { who: "300000000000000001", body: { names: ["Fern Melder"] } });
  check("before the reservation opens, names cannot be entered", res.status === 403);
  res = await call("PUT", "/api/admin/settings", { who: "300000000000000001", body: { namesOpenAt: T - 60 } });
  check("a member cannot change settings", res.status === 403);
  res = await call("PUT", "/api/admin/settings", { who: VIKTOR, body: { namesOpenAt: T - 60, namesTimeConfirmed: true, notice: "  Hello   raiders  " } });
  out = await J(res);
  check("the admin opens it (time confirmed, notice trimmed)", res.status === 200 && out.settings.namesOpenAt === T - 60 && out.settings.namesTimeConfirmed === true && out.settings.notice === "Hello raiders");
  res = await call("PUT", "/api/reserved", { who: "300000000000000001", body: { names: ["Fern Melder", "Fern"] } });
  check("a one-part name is refused", res.status === 400);
  res = await call("PUT", "/api/reserved", { who: "300000000000000001", body: { names: ["a b", "c d", "e f", "g h"].map((x) => x.replace(/(\w)/g, "$1$1")) } });
  check("more than three names is refused", res.status === 400);
  res = await call("PUT", "/api/reserved", { who: "300000000000000001", body: { names: ["fern melder", "ÐISMAS ÐANERO", ""] } });
  out = await J(res);
  check("names are saved written the game's way", res.status === 200 && out.reserved.map((r) => r.name).join("|") === "Fern Melder|Ðismas Ðanero", res.status, out);
  check("  keyed like the roster and the queue (codes.ts)", db.prepare("SELECT name_key FROM site_reserved WHERE name = 'Ðismas Ðanero'").get().name_key === load("./codes").normalizeCharacter("Ðismas Ðanero"));
  await call("PUT", "/api/reserved", { who: "300000000000000002", body: { names: ["Bob Stone", "Fern Melder"] } });
  await call("PUT", "/api/reserved", { who: "300000000000000003", body: { names: ["Carol Light"] } });
  res = await call("GET", "/api/admin/reserved?contested=1", { who: VIKTOR });
  out = await J(res);
  check("admin sees Fern Melder entered by two accounts", out.items.length === 2 && out.items.every((r) => r.name === "Fern Melder" && r.contested === 1));
  const rid = (who, name) => db.prepare("SELECT id FROM site_reserved WHERE owner_id = ?1 AND name = ?2 AND status <> 'released'").get(who, name).id;
  res = await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid("300000000000000001", "Fern Melder"), rid("300000000000000002", "Fern Melder"), rid("300000000000000002", "Bob Stone"), rid("300000000000000003", "Carol Light")] } });
  check("approve four", (await J(res)).changed === 4);
  res = await call("GET", "/api/me", { who: "300000000000000002" });
  check("  a member never sees 'approved' (the list is private)", (await J(res)).reserved.every((r) => r.status === "saved"));

  // Existing traffic in the queue: two ordinary verified applicants.
  const qdb = (sql, ...p) => db.prepare(sql).run(...p);
  qdb("INSERT INTO members (discord_id) VALUES ('400000000000000001'), ('400000000000000002'), ('300000000000000003')");
  qdb("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by) VALUES ('early bird', 'Early Bird', '400000000000000001', 'queued', ?1, 'auto')", T - 500);
  qdb("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by) VALUES ('carol light', 'Carol Light', '300000000000000003', 'queued', ?1, 'auto')", T - 400);
  qdb("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by) VALUES ('late comer', 'Late Comer', '400000000000000002', 'queued', ?1, 'auto')", T - 300);
  let auto = await siteQueue.autoQueueReserved(env());
  check("before launch the cron queues nothing", auto === null && !db.prepare("SELECT 1 FROM invite_queue WHERE priority > 0").get());
  await call("PUT", "/api/admin/settings", { who: VIKTOR, body: { launchAt: T - 30 } });
  auto = await siteQueue.autoQueueReserved(env());
  check("after launch it does: Bob Stone added, Carol Light moved to the front, contested Fern Melder skipped",
    auto.queued === 1 && auto.bumped === 1 && auto.contested === 2,
    auto);
  const q = db.prepare("SELECT name, priority, approved_by, status FROM invite_queue WHERE status = 'queued' ORDER BY priority DESC, id").all();
  check("  queue order: reserved names first (in arrival order), then everyone else", q.map((r) => r.name).join("|") === "Carol Light|Bob Stone|Early Bird|Late Comer", q);
  res = await ingest.getQueue(env(), "fern melder");
  out = await res.json();
  check("getQueue serves that order with global positions and the priority flag",
    out.entries.map((e) => `${e.position}:${e.character}:${e.priority}`).join(" ") === "1:Carol Light:1 2:Bob Stone:1 3:Early Bird:0 4:Late Comer:0", out.entries);
  check("waitlistPosition agrees", (await ingest.waitlistPosition(env(), "early bird")) === 3 && (await ingest.waitlistPosition(env(), "bob stone")) === 2);
  // Carol verifies with a code: enqueueInvite replaces her row, and the priority and the site's link follow.
  await review.enqueueInvite(env(), "carol light", "Carol Light", "300000000000000003", "auto");
  const carol = db.prepare("SELECT id, priority FROM invite_queue WHERE name_key = 'carol light' AND status = 'queued'").get();
  check("verifying again takes the live row over: same row, same place, priority kept", carol.priority === 1 && (await ingest.waitlistPosition(env(), "carol light")) === 1 &&
    db.prepare("SELECT COUNT(*) AS n FROM invite_queue WHERE name_key = 'carol light'").get().n === 1);
  check("  and the site's record still points at it", db.prepare("SELECT queue_id FROM site_reserved WHERE name = 'Carol Light'").get().queue_id === carol.id);
  // An ordinary applicant whose invite is out verifies again: the row is taken over in place, not sent to the back.
  qdb("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by, attempts, claimed_by, claimed_at, last_reason, last_reason_at, retry_after) VALUES ('anna out', 'Anna Out', '400000000000000003', 'invited', ?1, 'auto', 2, 'fern melder', ?1, 'in_another_guild', ?1, ?2)", T - 250, T + 3600);
  const annaId = db.prepare("SELECT id FROM invite_queue WHERE name_key = 'anna out'").get().id;
  await review.enqueueInvite(env(), "anna out", "Anna Out", "400000000000000003", "auto");
  const anna = db.prepare("SELECT id, status, attempts, claimed_by, last_reason, retry_after FROM invite_queue WHERE name_key = 'anna out'").all();
  check("an applicant with an invite out who verifies again keeps the row: queued again, refusals kept, same officer",
    anna.length === 1 && anna[0].id === annaId && anna[0].status === "queued" && anna[0].attempts === 2 && anna[0].claimed_by === "fern melder", anna);
  check("  the old refusal and its backoff are cleared", anna[0].last_reason === null && anna[0].retry_after === null);
  qdb("DELETE FROM invite_queue WHERE name_key = 'anna out'");
  // Release: the site's own row is cancelled; a row that was there on its own only loses the front.
  res = await call("POST", "/api/admin/reserved/release", { who: VIKTOR, body: { ids: [rid("300000000000000002", "Bob Stone"), rid("300000000000000003", "Carol Light")] } });
  check("release two", (await J(res)).changed === 2);
  check("  Bob Stone's site-made row is cancelled", db.prepare("SELECT status FROM invite_queue WHERE name_key = 'bob stone'").get().status === "cancelled");
  check("  Carol Light's own row stays, back to normal priority", db.prepare("SELECT status, priority FROM invite_queue WHERE name_key = 'carol light' AND status = 'queued'").get().priority === 0);
  // Contest resolved: release Bob's claim on Fern Melder, queue Alice's by hand.
  await call("POST", "/api/admin/reserved/release", { who: VIKTOR, body: { ids: [rid("300000000000000002", "Fern Melder")] } });
  res = await call("POST", "/api/admin/reserved/queue", { who: VIKTOR, body: { ids: [rid("300000000000000001", "Fern Melder")] } });
  out = await J(res);
  check("once the contest is resolved, queue it by hand", out.queued === 1 && db.prepare("SELECT priority, discord_id FROM invite_queue WHERE name_key = 'fern melder' AND status = 'queued'").get().discord_id === "300000000000000001");
  res = await call("PUT", "/api/reserved", { who: "300000000000000001", body: { names: ["Ðismas Ðanero"] } });
  check("a queued name cannot be removed by its owner", res.status === 409);
  res = await call("GET", "/api/admin/reserved?status=queued", { who: VIKTOR });
  out = await J(res);
  check("admin list shows the live queue status", out.items.length === 1 && out.items[0].queueStatus === "queued");
  res = await call("GET", "/api/admin/reserved?q=" + encodeURIComponent("Ðismas"), { who: VIKTOR });
  check("admin search finds a name by its game spelling, non-English capitals included", (await J(res)).items.some((r) => r.name === "Ðismas Ðanero"));
  res = await call("GET", "/api/admin/reserved?q=ALICE", { who: VIKTOR });
  check("  and by the owner's Discord name in any case", (await J(res)).items.length === 2);
  res = await call("GET", "/api/admin/reserved?status=all", { who: VIKTOR });
  out = await J(res);
  check("'Everything' (status=all) includes released names", out.items.some((r) => r.status === "released") && out.items.some((r) => r.status !== "released"));
  // in_guild
  qdb("INSERT INTO members (discord_id) VALUES ('300000000000000007')");
  qdb("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES ('grace hope', 'Grace Hope', '300000000000000007', 'member', ?1)", T);
  await call("PUT", "/api/reserved", { who: "300000000000000007", body: { names: ["Grace Hope"] } });
  await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid("300000000000000007", "Grace Hope")] } });
  out = await siteQueue.queueReserved(env(), "test");
  check("a name already in the guild is marked, not invited", out.inGuild === 1 && db.prepare("SELECT status FROM site_reserved WHERE name = 'Grace Hope'").get().status === "in_guild" && !db.prepare("SELECT 1 FROM invite_queue WHERE name_key = 'grace hope'").get());
  // An invite that ended without them (declined, gave up): the owner sees it ended and may take the name off, and the
  // admin may approve it again for a fresh row at the front.
  const C = "300000000000000003";
  await call("PUT", "/api/reserved", { who: C, body: { names: ["Carol Dawn", "Carol Dusk"] } });
  await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid(C, "Carol Dawn"), rid(C, "Carol Dusk")] } });
  out = await J(await call("POST", "/api/admin/reserved/queue", { who: VIKTOR, body: { ids: [rid(C, "Carol Dawn"), rid(C, "Carol Dusk")] } }));
  check("two more names queued by hand", out.queued === 2, out);
  qdb("UPDATE invite_queue SET status = 'declined' WHERE name_key = 'carol dawn' AND status = 'queued'");
  qdb("UPDATE invite_queue SET status = 'expired' WHERE name_key = 'carol dusk' AND status = 'queued'");
  out = await J(await call("GET", "/api/me", { who: C }));
  check("a queued name whose invite ended reads 'ended' to its owner", out.reserved.map((r) => `${r.name}:${r.status}`).join("|") === "Carol Dawn:ended|Carol Dusk:ended", out.reserved);
  res = await call("PUT", "/api/reserved", { who: C, body: { names: ["Carol Dusk"] } });
  check("  and can come off the list: only a live invite holds a name there",
    res.status === 200 && db.prepare("SELECT status FROM site_reserved WHERE name = 'Carol Dawn'").get().status === "released" && db.prepare("SELECT status FROM invite_queue WHERE name_key = 'carol dawn'").get().status === "declined");
  res = await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid(C, "Carol Dusk")] } });
  check("the admin can approve an ended one again", (await J(res)).changed === 1 && db.prepare("SELECT status, queue_id FROM site_reserved WHERE name = 'Carol Dusk'").get().queue_id === null);
  out = await J(await call("POST", "/api/admin/reserved/queue", { who: VIKTOR, body: { ids: [rid(C, "Carol Dusk")] } }));
  const dusk = db.prepare("SELECT id, priority FROM invite_queue WHERE name_key = 'carol dusk' AND status = 'queued'").get();
  check("  and queue it: a fresh row at the front, and the owner sees it queued",
    out.queued === 1 && dusk && dusk.priority === 1 && (await J(await call("GET", "/api/me", { who: C }))).reserved[0].status === "queued");
  res = await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid(C, "Carol Dusk")] } });
  check("  a live invite is not approved again", (await J(res)).changed === 0);
  res = await call("PUT", "/api/reserved", { who: C, body: { names: [] } });
  check("  and holds the name on the owner's list", res.status === 409);
  await call("POST", "/api/admin/reserved/release", { who: VIKTOR, body: { ids: [rid(C, "Carol Dusk")] } });
  // The owner of a name whose site invite ended verifies it themselves: back in at the top, and the site follows.
  const G = "300000000000000007";
  await call("PUT", "/api/reserved", { who: G, body: { names: ["Grace Hope", "Grace Late"] } });
  await call("POST", "/api/admin/reserved/approve", { who: VIKTOR, body: { ids: [rid(G, "Grace Late")] } });
  await call("POST", "/api/admin/reserved/queue", { who: VIKTOR, body: { ids: [rid(G, "Grace Late")] } });
  const lateRow = () => db.prepare("SELECT id, priority FROM invite_queue WHERE name_key = 'grace late' AND status = 'queued'").get();
  qdb("UPDATE invite_queue SET status = 'declined' WHERE name_key = 'grace late'");
  await review.enqueueInvite(env(), "grace late", "Grace Late", G, "auto");
  let late = lateRow();
  check("after declining the site's invite, verifying again goes to the back of the line like anyone's decline",
    late && late.priority === 0 && db.prepare("SELECT queue_id FROM site_reserved WHERE name = 'Grace Late'").get().queue_id === late.id &&
    (await J(await call("GET", "/api/me", { who: G }))).reserved.some((r) => r.name === "Grace Late" && r.status === "queued"));
  qdb("UPDATE invite_queue SET status = 'expired' WHERE name_key = 'grace late' AND status = 'queued'");
  await review.enqueueInvite(env(), "grace late", "Grace Late", G, "auto");
  late = lateRow();
  check("  after it ran out of tries, verifying again puts the reserved name back at the top", late && late.priority === 1);
  qdb("UPDATE invite_queue SET status = 'joined' WHERE name_key = 'grace late' AND status = 'queued'");
  await review.enqueueInvite(env(), "grace late", "Grace Late", G, "auto");
  late = lateRow();
  check("  and once it had joined (left or removed later), it is an ordinary applicant", late && late.priority === 0);
  await call("POST", "/api/admin/reserved/release", { who: VIKTOR, body: { ids: [rid(G, "Grace Late")] } });
  qdb("DELETE FROM invite_queue WHERE name_key = 'grace late'");
  check("what a member sees follows the invite", ["saved:claimed:", "saved:approved:", "queued:queued:written", "queued:queued:invited", "in_guild:queued:joined", "ended:queued:cancelled", "ended:queued:", "in_guild:in_guild:"]
    .every((x) => { const [want, st, qs] = x.split(":"); return siteApi.shownReserved(st, qs || null) === want; }));

  console.log("\n== deny, undeny, delete ==");
  res = await call("POST", "/api/admin/users/300000000000000006/deny", { who: VIKTOR, body: { reason: "joke application" } });
  check("deny works", res.status === 200 && db.prepare("SELECT denied FROM site_users WHERE discord_id = '300000000000000006'").get().denied === 1);
  res = await call("GET", "/api/me", { who: "300000000000000006" });
  check("  the denied account is signed out (session version bumped)", res.status === 401);
  await signIn("300000000000000006");
  res = await call("GET", "/api/me", { who: "300000000000000006" });
  out = await J(res);
  check("  signing in again shows the denial", out.denied === true && typeof out.deniedText === "string");
  res = await call("PUT", "/api/votes", { who: "300000000000000006", body: { votes: [] } });
  check("  and every save is refused", res.status === 403 && (await J(res)).error === "denied");
  res = await call("GET", "/api/admin/votes?ballot=officer", { who: VIKTOR });
  check("  their nomination no longer counts", !(await J(res)).nominees.some((x) => x.key === "300000000000000007"));
  res = await call("GET", "/api/admin/votes?ballot=officer&includeDenied=1", { who: VIKTOR });
  check("  unless the admin asks to include denied accounts", (await J(res)).nominees.some((x) => x.key === "300000000000000007"));
  res = await call("DELETE", "/api/me", { who: "300000000000000006" });
  check("there is no 'delete my data' for members any more", res.status === 403 || res.status === 404);
  res = await call("POST", "/api/admin/users/300000000000000006/delete", { who: "300000000000000001" });
  check("  and a member cannot use the admin's", res.status === 403);
  // The admin writes Frank in and lists him as a friend; deleting Frank's data with "mentions" takes those too.
  await call("PUT", "/api/votes", { who: VIKTOR, body: { votes: [vote("professions", 1, "discord", "300000000000000006", "Frank")] } });
  await call("PUT", "/api/friends", { who: VIKTOR, body: { friends: [{ kind: "discord", key: "300000000000000006", label: "Frank", note: "met in Stormwind" }] } });
  res = await call("POST", "/api/admin/users/300000000000000006/delete", { who: VIKTOR, body: { mentions: true } });
  const denRow = db.prepare("SELECT * FROM site_users WHERE discord_id = '300000000000000006'").get();
  check("staff delete a denied account's data on request: only the bare denial is kept", res.status === 200 && denRow.denied === 1 && denRow.username === null && !db.prepare("SELECT 1 FROM site_votes WHERE voter_id = '300000000000000006'").get());
  check("  with 'mentions', other members' write-ins and friend entries naming them go too",
    !db.prepare("SELECT 1 FROM site_votes WHERE nominee_key = '300000000000000006'").get() && !db.prepare("SELECT 1 FROM site_friends WHERE friend_key = '300000000000000006'").get());
  {
    // References too: Alice's application names Frank as one here.
    const before = JSON.parse(db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000001'").get().answers);
    db.prepare("UPDATE site_applications SET answers = ?1 WHERE discord_id = '300000000000000001'").run(JSON.stringify({ ...before, references: [...(before.references || []), { kind: "discord", key: "300000000000000006", label: "Frank" }] }));
    await call("POST", "/api/admin/users/300000000000000006/delete", { who: VIKTOR, body: { mentions: true } });
    const after = JSON.parse(db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000001'").get().answers);
    check("  and so do references to them in other applications, with the rest of the application as it was",
      !after.references.some((r) => r.key === "300000000000000006") && after.references.length === (before.references || []).length && after.experience === before.experience);
  }
  res = await call("POST", "/api/admin/users/300000000000000006/undeny", { who: VIKTOR });
  check("undeny", res.status === 200 && db.prepare("SELECT denied FROM site_users WHERE discord_id = '300000000000000006'").get().denied === 0);
  check("  Bob has board votes before the delete", !!db.prepare("SELECT 1 FROM site_board_votes WHERE voter_id = '300000000000000002'").get());
  res = await call("POST", "/api/admin/users/300000000000000002/delete", { who: VIKTOR });
  check("an ordinary member's data, deleted by staff: everything goes, account row and board votes included",
    res.status === 200 &&
    !["site_users WHERE discord_id", "site_applications WHERE discord_id", "site_votes WHERE voter_id", "site_board_votes WHERE voter_id", "site_board_votes WHERE candidate_id", "site_friends WHERE owner_id", "site_reserved WHERE owner_id"].some((w) => db.prepare(`SELECT 1 FROM ${w} = '300000000000000002'`).get()));
  check("  and their session no longer works", (await call("GET", "/api/me", { who: "300000000000000002" })).status === 401);
  res = await call("POST", "/api/admin/users/300000000000000002/delete", { who: VIKTOR });
  check("  deleting again: nothing there", res.status === 404);
  // Someone who never signed in here can still be named by others; a request to be forgotten covers that too. It has a
  // route of its own, which never touches an account that has signed in.
  const NEVER = "300000000000000099";
  await call("PUT", "/api/votes", { who: VIKTOR, body: { votes: [vote("professions", 1, "discord", NEVER, "Never Here", "runs the bank alt")] } });
  await call("PUT", "/api/friends", { who: VIKTOR, body: { friends: [{ kind: "discord", key: NEVER, label: "Never Here", note: "from the stream" }] } });
  const aliceApp = db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000001'").get();
  const withRef = JSON.parse(aliceApp.answers);
  withRef.references = [...(withRef.references || []), { kind: "discord", key: NEVER, label: "Never Here" }];
  db.prepare("UPDATE site_applications SET answers = ?1 WHERE discord_id = '300000000000000001'").run(JSON.stringify(withRef));
  res = await call("GET", `/api/admin/account/${NEVER}`, { who: VIKTOR });
  out = await J(res);
  check("the admin lookup counts where a never-signed-in account is named: write-ins, friends lists, references",
    out.site.signedUp === false && out.site.writtenIn === 1 && out.site.listedBy === 1 && out.site.referencedBy === 1, out.site);
  res = await call("POST", `/api/admin/users/${NEVER}/delete`, { who: VIKTOR, body: { mentions: true } });
  check("  the full delete is for accounts that signed in (404 here)", res.status === 404);
  res = await call("POST", `/api/admin/users/${NEVER}/mentions`, { who: VIKTOR });
  const aliceRefs = JSON.parse(db.prepare("SELECT answers FROM site_applications WHERE discord_id = '300000000000000001'").get().answers).references;
  check("  'remove mentions': the write-in, the friends entry and the reference naming them go, and it is logged",
    res.status === 200 && !db.prepare("SELECT 1 FROM site_votes WHERE nominee_key = ?1").get(NEVER) && !db.prepare("SELECT 1 FROM site_friends WHERE friend_key = ?1").get(NEVER) &&
    !aliceRefs.some((r) => r.key === NEVER) && aliceRefs.length === withRef.references.length - 1 &&
    !!db.prepare("SELECT 1 FROM audit WHERE action = 'site.mentions_deleted' AND subject = ?1").get(NEVER));
  res = await call("POST", `/api/admin/users/${NEVER}/mentions`, { who: VIKTOR });
  check("  and once they are gone, there is nothing left (404)", res.status === 404);
  res = await call("POST", "/api/admin/users/300000000000000001/mentions", { who: VIKTOR });
  check("  on an account that has signed in, 'remove mentions' is refused and deletes nothing", res.status === 409 && !!db.prepare("SELECT 1 FROM site_users WHERE discord_id = '300000000000000001'").get() && !!db.prepare("SELECT 1 FROM site_applications WHERE discord_id = '300000000000000001'").get());
  res = await call("POST", `/api/admin/users/${NEVER}/mentions`, { who: "300000000000000001" });
  check("  and a member cannot use it", res.status === 403);
  // Bob signs up again. His cookie from before the delete stays dead: a new account row starts its session version at
  // the current time, not at 1.
  jar.set("bob-before-delete", jar.get("300000000000000002"));
  const versionOf = (cookieValue) => JSON.parse(Buffer.from(cookieValue.split("=")[1].split(".")[0], "base64url").toString()).v;
  await signIn("300000000000000002");
  check("signing up again after a delete (same second, even) starts a different session version",
    versionOf(jar.get("300000000000000002")) !== versionOf(jar.get("bob-before-delete")) && versionOf(jar.get("300000000000000002")) > 1 &&
    (await call("GET", "/api/me", { who: "300000000000000002" })).status === 200);
  check("  so a cookie from before the delete does not come back to life", (await call("GET", "/api/me", { who: "bob-before-delete" })).status === 401);
  await call("POST", "/api/admin/users/300000000000000002/delete", { who: VIKTOR });

  console.log("\n== admin: applications, lookup, export ==");
  res = await call("GET", "/api/admin/applications?status=open", { who: VIKTOR });
  out = await J(res);
  check("open applications listed with their user", out.total === 1 && out.items[0].user.id === "300000000000000001" && out.items[0].adminNote === null);
  res = await call("GET", "/api/admin/applications?q=fern", { who: VIKTOR });
  check("search by character", (await J(res)).total === 1);
  res = await call("GET", "/api/admin/applications?q=%25", { who: VIKTOR });
  check("  % is taken literally", (await J(res)).total === 0);
  res = await call("POST", "/api/admin/applications/300000000000000001/status", { who: VIKTOR, body: { status: "accepted", note: "strong" } });
  out = await J(res);
  check("accept with a note; the detail has friends, nominations and the account", out.application.status === "accepted" && out.application.adminNote === "strong" && out.friends.length === 2 && out.nominated.some((x) => x.ballot === "officer") && !out.nominated.some((x) => x.ballot === "raid_leader_na") && out.account.site.signedUp, // Bob, who picked her for raid leader, was deleted
    { status: out.application.status, note: out.application.adminNote, friends: out.friends.length, nominated: out.nominated, signedUp: out.account.site.signedUp });
  res = await call("PUT", "/api/application", { who: "300000000000000001", body: appBody });
  check("a decided application can no longer be changed", res.status === 409);
  res = await call("GET", "/api/admin/lookup?q=fern%20melder", { who: VIKTOR });
  out = await J(res);
  check("lookup by character finds the reserved name and its owner", out.characters.some((c) => c.name === "Fern Melder" && c.id === "300000000000000001") && out.exactOwner === "300000000000000001");
  res = await call("GET", "/api/admin/lookup?q=al", { who: VIKTOR });
  out = await J(res);
  check("lookup by Discord name (search) and among signed-up accounts", out.discord.some((m) => m.id === "300000000000000001") && out.site.some((u) => u.id === "300000000000000001"));
  qdb("UPDATE site_users SET global_name = 'Ärger Carol' WHERE discord_id = '300000000000000003'");
  res = await call("GET", "/api/admin/lookup?q=" + encodeURIComponent("Ärger"), { who: VIKTOR });
  check("  and by a display name with non-English capitals", (await J(res)).site.some((u) => u.id === "300000000000000003"));
  qdb("UPDATE site_users SET global_name = '=HYPERLINK(\"x\")' WHERE discord_id = '300000000000000003'");
  res = await call("GET", "/api/admin/export/users", { who: VIKTOR });
  out = await J(res);
  check("export: a JSON page of rows with the column names (the page builds the CSV)", res.status === 200 && out.columns[0] === "discord_id" && out.rows.length === out.rows.filter((r) => Array.isArray(r)).length && out.next === null);
  check("  the raw value travels as it is; the page's CSV writer neutralizes it", out.rows.some((r) => r.includes('=HYPERLINK("x")')));
  // pages: 150 applications a page; with 151 the second page holds one
  for (let i = 0; i < 151; i++) {
    const id = String(700000000000000000n + BigInt(i));
    qdb("INSERT INTO site_users (discord_id, username, first_login, last_login) VALUES (?1, ?2, ?3, ?3)", id, "bulk" + i, T);
    qdb("INSERT INTO site_applications (discord_id, position, answers, status, created_at, updated_at) VALUES (?1, 'member', '{}', 'submitted', ?2, ?2)", id, T + i);
  }
  let pageA = await J(await call("GET", "/api/admin/export/applications", { who: VIKTOR }));
  let pageB = await J(await call("GET", `/api/admin/export/applications?offset=${pageA.next}`, { who: VIKTOR }));
  const totalApps = db.prepare("SELECT COUNT(*) AS n FROM site_applications").get().n;
  check("  applications come 150 to a page, and the pages add up", pageA.rows.length === 150 && pageB.next === null && pageA.rows.length + pageB.rows.length === totalApps);
  qdb("DELETE FROM site_applications WHERE discord_id LIKE '7000%'");
  qdb("DELETE FROM site_users WHERE discord_id LIKE '7000%'");
  res = await call("GET", "/api/admin/export/constructor", { who: VIKTOR });
  check("an export named after Object's own properties is just unknown (404)", res.status === 404);
  res = await call("GET", "/api/admin/export/secrets", { who: VIKTOR });
  check("  an unknown export is a 404", res.status === 404);
  check("LIKE patterns stay within D1's 50 bytes", new TextEncoder().encode(admin.likeArg("é".repeat(60))).length <= 50 && admin.likeArg("50%_off") === "%50\\%\\_off%");
  res = await call("GET", "/api/admin/overview", { who: VIKTOR });
  out = await J(res);
  check("overview counts (six signed in, Bob deleted himself)", out.counts.users === 5 && out.queue.waiting === 4 && out.queue.reserved === 1, JSON.stringify(out));

  console.log("\n== membership re-check on save ==");
  T += 7200;
  members.delete("300000000000000007");
  res = await call("PUT", "/api/friends", { who: "300000000000000007", body: { friends: [] } });
  check("someone who left Asmongold's server can no longer save", res.status === 403 && (await J(res)).error === "not_member" && db.prepare("SELECT in_server FROM site_users WHERE discord_id = '300000000000000007'").get().in_server === 0);
  res = await call("GET", "/api/me", { who: "300000000000000007" });
  check("  but can still read what they entered", res.status === 200);
  res = await call("GET", "/api/board", { who: "300000000000000007" });
  check("  and no longer reads the voting board", res.status === 403 && (await J(res)).error === "not_member");

  console.log("\n== sign-out ==");
  res = await call("POST", "/auth/logout", { who: "300000000000000003" });
  check("logout clears the cookie", res.status === 200 && /__Host-olg=;/.test(res.headers.get("Set-Cookie")));
  res = await call("GET", "/api/me", { who: "300000000000000003" });
  check("  and the old cookie is dead", res.status === 401);
  res = await call("POST", "/auth/logout", { who: VIKTOR, headers: { "X-Olympus": null } });
  check("  a cross-site logout is refused", res.status === 403);

  console.log("\n== lookups in Asmongold's server (/olympus-lookup) ==");
  const inter = (name, over = {}, roles = [OFFICER_ROLE]) => ({ type: 2, id: "1", token: "t", guild_id: GUILD, member: { user: { id: "500000000000000001", username: "officer" }, roles, permissions: "0" }, data: { name, ...over } });
  check("routed ahead of the Olympus-only guard only in Asmongold's server", lookup.isAsmongoldLookup(env(), inter("olympus-lookup")) && !lookup.isAsmongoldLookup(env(), { ...inter("olympus-lookup"), guild_id: OLYMPUS }));
  let r = await (await lookup.handleLookup(env(), inter("olympus-lookup", { options: [{ name: "member", type: 6, value: "300000000000000001" }] }, []))).json();
  check("members without an Olympus role are refused", /officers only/i.test(r.data.content));
  r = await (await lookup.handleLookup(env(), inter("olympus-lookup", { options: [{ name: "member", type: 6, value: "300000000000000001" }] }))).json();
  check("a member: names, site application with its backups, and reserved names, ephemeral", r.data.flags === 64 && /@alice/.test(r.data.content) && /Raid Leader \(EU raids\)\*\*, backups: Officer, Class Lead \(Priest\)/.test(r.data.content) && /Fern Melder \(queued\)/.test(r.data.content), r.data.content);
  r = await (await lookup.handleLookup(env(), inter("olympus-lookup", { options: [{ name: "character", type: 3, value: "grace hope" }] }))).json();
  check("a character: its linked owner", /Grace Hope\*\* is linked/.test(r.data.content), r.data.content);
  r = await (await lookup.handleLookup(env(), inter("Olympus linked characters", { type: 2, target_id: "300000000000000001" }))).json();
  check("the right-click user command gives the same answer", /@alice/.test(r.data.content));
  const viaIndex = await lookup.handleLookup(env(), { ...inter("olympus-lookup", { options: [{ name: "character", type: 3, value: "gra", focused: true }] }), type: 4 });
  const ac = await viaIndex.json();
  check("autocomplete offers linked and roster names", ac.type === 8 && ac.data.choices.some((c) => c.value === "Grace Hope"));
  const long = "é".repeat(40); // 80 bytes: past D1's 50-byte LIKE limit
  const acLong = await (await lookup.handleLookup(env(), { ...inter("olympus-lookup", { options: [{ name: "character", type: 3, value: long, focused: true }] }), type: 4 })).json();
  check("  a long value stays inside D1's LIKE limit (no error, just no match)", acLong.type === 8 && acLong.data.choices.length === 0);
  const verifyAc = await (await interactions.handleInteraction(env(), { type: 4, id: "2", token: "t", guild_id: OLYMPUS, member: { user: { id: "300000000000000007", username: "grace" }, roles: [] }, data: { name: "verify", options: [{ name: "character", type: 3, value: long, focused: true }] } })).json();
  check("  and so does /verify's character autocomplete", verifyAc.type === 8 && Array.isArray(verifyAc.data.choices));

  console.log("\n== Discord names for the roster window ==");
  qdb("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count) VALUES (?1, ?1, 'addon', 2)", T);
  const snap = db.prepare("SELECT MAX(id) AS id FROM roster_snapshots").get().id;
  qdb("INSERT INTO roster_members (snapshot_id, name_key, name, rank, rank_index) VALUES (?1, 'grace hope', 'Grace Hope', 'Member', 5), (?1, 'nobody here', 'Nobody Here', 'Initiate', 6)", snap);
  let v = await names.verifiedOnRoster(env(), snap);
  check("verified list: linked roster members only", v.length === 1 && v[0].name === "Grace Hope" && v[0].discordId === "300000000000000007");
  // Grace's display name is "Grace": the same as her username but for the capital, so it is not repeated.
  check("  names fall back to the site's copy until the bot has its own (a display name differing only in case is not repeated)", v[0].username === "grace" && v[0].displayName === null, v);
  const refreshed = await names.refreshNames(env(), 5);
  check("the cron reads stale names from Discord", refreshed.refreshed >= 1 && db.prepare("SELECT username FROM members WHERE discord_id = '300000000000000007'").get().username === "grace");
  users.set("300000000000000007", U("300000000000000007", "grace", "grace")); // display name equal to the username
  await names.refreshNames(env(), 5); // not stale yet: nothing read
  qdb("UPDATE members SET names_at = 0 WHERE discord_id = '300000000000000007'");
  await names.refreshNames(env(), 5);
  v = await names.verifiedOnRoster(env(), snap);
  check("  a display name that is just the username again is not shown twice", v[0].displayName === null);
  D.usersLimited = true;
  qdb("UPDATE members SET names_at = 0 WHERE discord_id = '300000000000000007'");
  const callsBefore = D.calls.length;
  const limitedRun = await names.refreshNames(env(), 5);
  check("a 429 stops the names refresh at once, without waiting it out (the next run carries on)",
    limitedRun.refreshed === 0 && D.calls.slice(callsBefore).filter((c) => c.startsWith("GET /users/")).length === 1, D.calls.slice(callsBefore));
  D.usersLimited = false;
  await names.recordNames(env(), { id: "300000000000000007", username: "grace_new", global_name: "Grace H" });
  check("an interaction's names update a linked member at once when they changed", db.prepare("SELECT username FROM members WHERE discord_id = '300000000000000007'").get().username === "grace_new");
  await names.recordNames(env(), { id: "999999999999999999", username: "stranger", global_name: null });
  check("  and never create a record of anyone", !db.prepare("SELECT 1 FROM members WHERE discord_id = '999999999999999999'").get());
  res = await index.fetch(new Request("https://verify.example/queue/unverified", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), env(), ctx);
  out = await res.json();
  check("/queue/unverified carries the verified list for the watcher", Array.isArray(out.verified) && out.verified[0].username === "grace_new" && out.members.some((m) => m.name === "Nobody Here"));
  res = await index.fetch(new Request("https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" } }), env(), ctx);
  out = await res.json();
  check("/health names the build and the site (to the watcher's bearer, since .49)", out.build.includes(".125") && out.site.host === "guild.example" && out.site.admins === 1);

  console.log("\n== the addon-facing queue still works for an old-style caller ==");
  res = await ingest.getQueue(env(), "");
  out = await res.json();
  check("no officer id: every ready row, reserved first", out.entries[0].priority === 1 && out.entries.every((e, i, a) => i === 0 || a[i - 1].priority >= e.priority));

  console.log("\n== claims are sticky: two officers, then a burst of reserved names ==");
  {
    const kept = db;
    db = freshDb();
    const e2 = () => ({ ...env(), QUEUE_CLAIM_LIMIT: "2", QUEUE_CLAIM_PRIORITY_EXTRA: "1" });
    const ins = (key, prio) => db.prepare("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, approved_by, priority) VALUES (?1, ?1, '400000000000000009', 'queued', ?2, 'auto', ?3)").run(key, T, prio);
    const names = (x) => x.entries.map((e) => e.character).join(",");
    ins("row a", 0); ins("row b", 0); ins("row c", 0);
    let a = await (await ingest.getQueue(e2(), "officer a")).json();
    check("officer A claims the first two", names(a) === "row a,row b", names(a));
    ins("vip one", 1); ins("vip two", 1);
    T += 60;
    a = await (await ingest.getQueue(e2(), "officer a")).json();
    check("  reserved names arriving later do not take A's rows away (A's game client still holds them)", names(a).endsWith("row a,row b"), names(a));
    check("  but a lone officer still gets one on top (QUEUE_CLAIM_PRIORITY_EXTRA), served first", names(a) === "vip one,row a,row b", names(a));
    let bq = await (await ingest.getQueue(e2(), "officer b")).json();
    check("  officer B takes the next reserved name, then the next row", names(bq) === "vip two,row c" && bq.entries[0].position === 2, names(bq));
    T += 16 * 60; // A stops polling for longer than QUEUE_CLAIM_TTL_MINUTES; B keeps polling
    bq = await (await ingest.getQueue(e2(), "officer b")).json();
    check("  B keeps its own while it polls, and its spare reserved slot takes A's abandoned reserved name", names(bq) === "vip one,vip two,row c", names(bq));
    const cq = await (await ingest.getQueue(e2(), "officer c")).json();
    check("  A's other rows move on only once A has stopped polling", names(cq) === "row a,row b", names(cq));
    db.prepare("UPDATE invite_queue SET status = 'invited' WHERE name_key = 'vip one'").run();
    ins("vip three", 1);
    bq = await (await ingest.getQueue(e2(), "officer b")).json();
    check("  a sent invite frees a place, which the next reserved name fills", names(bq) === "vip two,vip three,row c", names(bq));
    db = kept;
  }

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

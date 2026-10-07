// Current P1 repository Owner test: immutable Battle.net OFF/enable intent, durable fixture clock, native Responses,
// bounded policy wording and the unchanged documented transformer subprocess. Historical .114 enabled-provider cases remain
// in the untouched parent; leadership, beta, rename, typed-name and rewrite/restore assertions below are retained.
// No provider, native D1, live restore, generation fence, publication or legal completeness qualification.
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

let HOOK = null; // a test may act at prepare/ran, or await a real competing HTTP save after a read captured its answer
function d1(db) {
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    // SQLite's statement metadata distinguishes a WITH ... INSERT from a read; its leading keyword does not.
    if (st.columns().length > 0) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    HOOK?.(sql, "ran");
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    HOOK?.(sql, "prepare");
    let params = [];
    const api = {
      bind: (...p) => {
        if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
        const named = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1])));
        if (named && p.length !== named) throw new Error(`D1_ERROR: Wrong number of parameter bindings (${p.length} for ${named}): ${sql.slice(0, 80)}`);
        params = p;
        return api;
      },
      first: async () => { const r = db.prepare(sql).get(...params) ?? null; await HOOK?.(sql, "read"); return r; },
      all: async () => { const results = db.prepare(sql).all(...params); await HOOK?.(sql, "read"); return { results }; },
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
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));

const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let FETCHES = [], NOTICES = [], REMOVES = [], LOGS = [], MEMBER_ROLES = [];
globalThis.fetch = async (url, init = {}) => {
  FETCHES.push({ url: String(url), method: init.method ?? "GET" });
  if (String(url).includes("/role-connection")) {
    if (init.method === "PUT") return new Response(String(init.body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ platform_username: "linked" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error("no network in tests: " + url);
};
const realDiscord = (() => {
  const mod = { exports: {} };
  new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(mod, mod.exports, () => ({}));
  return mod.exports;
})();
const stubs = {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } } ),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async (_env, id, role) => { REMOVES.push({ id, role }); },
    guildMember: async () => ({ roles: MEMBER_ROLES }),
    setNickname: async () => {},
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async (_env, id, text, kind) => { NOTICES.push({ id, text, kind }); return true; }, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
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
const indexMod = load("./index"), oauth = load("./oauth"), sw = load("./bnet-switch"), siteCore = load("./site-core"), siteData = load("./site-data"), roles = load("./roles"), renames = load("./rename-review"), interactions = load("./interactions"), policy = load("./policy-content"), leadership = load("./site-leadership"), schema = load("./schema");

let T = Math.floor(Date.now() / 1000) - 2 * 86400; // Synthetic JS clock two days behind the actual SQLite clock; ordinary five-day cookies still valid.
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const DAY = 86400;
const ADMIN = "472099715253796864", MEMBER = "300000000000000003", PLAIN = "300000000000000004";
const GM = "1549581282227265566", OFFICER = "1549581672272625734", GUILD = "236932545793490944";
const env = (over = {}) => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: GUILD, DISCORD_APP_ID: "1550176895671341076", DISCORD_CLIENT_SECRET: "client-secret", DISCORD_PUBLIC_KEY: "00", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: GUILD, SITE_ADMINS: ADMIN, ROLE_OFFICER: OFFICER, ROLE_GUILD_MEMBER: GM, ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "directory", ...over });
const SECRETS = { BNET_CLIENT_ID: "bnet-client-for-tests", BNET_CLIENT_SECRET: "bnet-secret-for-tests" };
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const audits = (action) => db.prepare("SELECT * FROM audit WHERE action = ?").all(action);
const siteUser = (id, over = {}) => db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1)").run(id, over.username ?? "u" + id.slice(-2), over.global_name ?? null, over.nick ?? null, T, T);
const character = (id, name, guid, status = "member") => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid, member_since) VALUES (?, ?, ?, ?, ?, ?, ?)").run(name.toLowerCase(), name, id, status, T - DAY, guid, T - DAY);
};
const cookieFor = async (id) => (await siteCore.sessionCookie(env(), id, 1)).split(";")[0];
async function http(method, url, { who, body, headers = {}, over = {} } = {}) {
  const h = new Headers(headers);
  if (who) h.set("Cookie", await cookieFor(who));
  const u = new URL(url, "https://guild.example");
  if (method !== "GET" && method !== "HEAD") { h.set("X-Olympus", "2"); h.set("Origin", u.origin); }
  if (body !== undefined) h.set("Content-Type", "application/json");
  return indexMod.default.fetch(new Request(u, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
}
// the bot host's JSON answers go through discord.ts json(), stubbed here as a plain {status, body}
const J = async (res) => { if (res && typeof res.clone !== "function") return res.body ?? null; try { return await res.clone().json(); } catch { return null; } };
const status = async (id, over = {}) => (await interactions.handleInteraction(env(over), { type: 2, id: "s" + Math.random(), token: "t", guild_id: GUILD, member: { user: { id, username: "u" }, roles: [] }, data: { name: "verify-status" } })).body?.data?.content ?? "";

(async () => {
  siteUser(ADMIN, { global_name: "Vik" });
  siteUser(MEMBER, { global_name: "Mia" });
  siteUser(PLAIN, { global_name: "Pat" });
  character(MEMBER, "Mia One", "Player-4613-0001");

  console.log("\n== immutable OFF Battle.net release and future enable intent (current P1) ==");
  check("the current release has no active Battle.net collection marker", policy.PRIVACY_DESCRIBES_BNET_LOGIN === false);
  let st = await sw.bnetLoginState(env(SECRETS));
  check("no setting row: OFF release, configured secrets do not activate collection", st.adminOn === false && st.effective === false && st.configured === true && st.policyReady === false && st.releaseProfile === "OFF" && st.enableRequested === false, st);
  const broken = { prepare: () => ({ bind: () => ({ all: async () => { throw new Error("D1 down"); } }) }) };
  check("an unreadable setting stays off", (await sw.bnetLoginState({ ...env(SECRETS), DB: broken })).effective === false);
  const ordinaryT = T; let expiredCookie;
  try { T = ordinaryT - 8 * DAY; expiredCookie = await cookieFor(ADMIN); } finally { T = ordinaryT; }
  check("an explicitly expired five-day session is rejected without weakening the real cookie lifetime", await siteCore.readSession(env(), new Request("https://guild.example/api/me", { headers: { Cookie: expiredCookie } })) === null);
  const switchRowsBeforeExpired = JSON.stringify(db.prepare("SELECT key, value FROM site_settings WHERE key IN ('bnetLogin', 'bnetEnableIntent') ORDER BY key").all()), switchAuditBeforeExpired = audits("bnet.switch").length;
  let res = await http("PUT", "/api/admin/bnet-switch", { headers: { Cookie: expiredCookie }, body: { on: true, confirm: "ENABLE" }, over: SECRETS });
  let out = await J(res);
  check("expired ordinary public admin request cannot record enable intent", res.status === 401 && JSON.stringify(db.prepare("SELECT key, value FROM site_settings WHERE key IN ('bnetLogin', 'bnetEnableIntent') ORDER BY key").all()) === switchRowsBeforeExpired && audits("bnet.switch").length === switchAuditBeforeExpired, out);
  FETCHES = [];
  res = await http("GET", "https://verify.example/linked-role", { over: SECRETS });
  let text = await res.text();
  check("OFF linked-role page has no redirect/cookie and the current policy no-store headers", res.status === 200 && !res.headers.get("Location") && !res.headers.get("Set-Cookie") && /switched off/.test(text) && res.headers.get("Cache-Control") === "no-store, no-transform");
  check("OFF start writes no link.started row", audits("link.started").length === 0);
  res = await http("GET", "https://verify.example/oauth/callback?code=c1&state=s1", { headers: { Cookie: "olv_state=s1.x" }, over: SECRETS });
  check("OFF Discord callback clears state before any provider exchange", res.status === 200 && FETCHES.length === 0 && /olv_state=;\s*Max-Age=0/.test(res.headers.get("Set-Cookie") || ""));
  res = await http("GET", "https://verify.example/bnet/link?code=c2&state=s2", { headers: { Cookie: "olv_bnet=abc" }, over: SECRETS });
  check("OFF Blizzard callback clears its cookie before any provider exchange", res.status === 200 && FETCHES.length === 0 && /olv_bnet=;\s*Max-Age=0/.test(res.headers.get("Set-Cookie") || ""));
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000050", username: "late" }, { Authorization: "Bearer x" }, "Late#50", "c50", "test");
  check("direct bind while OFF stores nothing and sends nothing", /switched off/.test(await res.text()) && !one("SELECT 1 FROM members WHERE discord_id = '100000000000000050'") && FETCHES.length === 0);
  res = await http("GET", "/api/admin/bnet-switch", { who: ADMIN, over: SECRETS }); out = await J(res);
  check("admin sees immutable OFF and no effective collection", res.status === 200 && out.configured === true && out.policyReady === false && out.adminOn === false && out.effective === false && out.releaseProfile === "OFF");
  res = await http("PUT", "/api/admin/bnet-switch", { who: PLAIN, body: { on: true, confirm: "ENABLE" }, over: SECRETS });
  check("ordinary member cannot record admin intent", res.status === 403);
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true }, over: SECRETS });
  check("future enable intent still requires exact typed ENABLE", res.status === 400 && (await J(res)).error === "confirm");
  const auditBeforeIntent = audits("bnet.switch").length;
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true, confirm: "ENABLE" } }); out = await J(res);
  check("without provider secrets, typed intent is recorded but collection remains OFF", res.status === 200 && out.state.enableRequested === true && out.state.configured === false && out.state.effective === false && out.state.adminOn === false && out.state.releaseProfile === "OFF" && one("SELECT value FROM site_settings WHERE key = 'bnetEnableIntent'")?.value === "1" && !one("SELECT 1 FROM site_settings WHERE key = 'bnetLogin'"), out);
  check("intent audit records only requested intent and collection-disabled fact", audits("bnet.switch").length === auditBeforeIntent + 1 && audits("bnet.switch").at(-1).details === JSON.stringify({ enableRequested: true, collectionEnabled: false }));
  sw.setPolicyReadyForTests(true); // Existing compatibility override is deliberately a no-op in this release.
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true, confirm: "ENABLE" }, over: SECRETS }); out = await J(res);
  check("compatibility override plus secrets plus typed intent still cannot activate immutable OFF", res.status === 200 && out.state.configured === true && out.state.policyReady === false && out.state.effective === false && out.state.adminOn === false && out.state.enableRequested === true && out.state.releaseProfile === "OFF", out);
  db.prepare("INSERT INTO site_settings (key,value,updated_at) VALUES ('bnetLogin','1',?) ON CONFLICT(key) DO UPDATE SET value='1'").run(T); // Synthetic legacy switch residue, not a new source control.
  st = await sw.bnetLoginState(env(SECRETS));
  check("legacy adminOn residue is reported without activating immutable OFF", st.adminOn === true && st.effective === false && st.policyReady === false && st.releaseProfile === "OFF");
  for (const url of ["https://verify.example/linked-role", "https://verify.example/oauth/callback?code=still-off&state=x", "https://verify.example/bnet/link?code=still-off&state=x"]) {
    res = await http("GET", url, { over: SECRETS });
    check("legacy residue route remains OFF: " + new URL(url).pathname, res.status === 200 && !res.headers.get("Location") && /switched off/.test(await res.text()) && FETCHES.length === 0 && audits("link.started").length === 0);
  }
  res = await http("GET", "https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" }, over: SECRETS }); out = await J(res);
  check("watcher health reports only the exact three OFF switch fields; public health omits switch state", out.bnetSwitch && Object.keys(out.bnetSwitch).sort().join("|") === "adminOn|effective|policyReady" && out.bnetSwitch.policyReady === false && out.bnetSwitch.adminOn === true && out.bnetSwitch.effective === false && !("bnetSwitch" in (await J(await http("GET", "https://verify.example/health")))));
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: false }, over: SECRETS }); out = await J(res);
  check("pause clears legacy switch and future intent, without enabling collection", res.status === 200 && out.state.effective === false && out.state.adminOn === false && out.state.enableRequested === false && one("SELECT value FROM site_settings WHERE key='bnetLogin'")?.value === "0" && one("SELECT value FROM site_settings WHERE key='bnetEnableIntent'")?.value === "0");
  check("pause audit has exactly the two bounded OFF fields", audits("bnet.switch").at(-1).details === JSON.stringify({ enableRequested: false, collectionEnabled: false }));
  sw.setPolicyReadyForTests(null);
  db.prepare("INSERT INTO audit (ts, actor, action, subject) VALUES (?, '100000000000000053', 'link.ok', 'On#53')").run(T);
  text = await status("100000000000000053", SECRETS);
  check("OFF verify-status never claims link freshness or keep-until retention", !/kept until/.test(text) && !/Battle\.net: linked/.test(text), text);
  check("legacy linked audit retains only the Discord Connections remedy", /removing the connection in Discord's settings \(Connections\) clears it/.test(text) && !/linking again replaces it/.test(text));
  check("cron's legacy purge remains unconditional (source check only)", /ctx\.waitUntil\(purgeBattleNetData\(env\)/.test(fs.readFileSync(path.join(root, "src", "index.ts"), "utf8")));

  console.log("\n== the Olympus I-X leadership directory (.114, item 10) ==");
  res = await http("GET", "/api/admin/leadership", { who: ADMIN });
  out = await J(res);
  check("ten entries, Olympus I to Olympus X, all empty to begin with", res.status === 200 && out.guilds.length === 10 && out.guilds[0].name === "Olympus I" && out.guilds[9].name === "Olympus X" && out.guilds.every((g) => g.gm === "" && g.officers.length === 0));
  const ten = (fill = {}) => Array.from({ length: 10 }, (_, i) => fill[i] ?? { gm: "", officers: [] });
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten().slice(0, 9) } });
  check("a directory without exactly ten entries is refused", res.status === 400);
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 1: { gm: "x", officers: Array.from({ length: 13 }, (_, i) => "Officer " + i) } }) } });
  check("  so are more than twelve officers", res.status === 400);
  res = await http("PUT", "/api/admin/leadership", { who: PLAIN, body: { guilds: ten() } });
  check("  and a member who is not a site admin (403)", res.status === 403);
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 0: { gm: "  Fern   Melder ", officers: ["Ana", "", "Ana", "Bo"] } }), namesConfirmed: true } }); // .115: names added need the tick
  out = await J(res);
  check("the admin saves it: names cleaned, blanks and repeats dropped", res.status === 200 && out.guilds[0].gm === "Fern Melder" && out.guilds[0].officers.join(",") === "Ana,Bo");
  check("  audited with a count, never the names (the dated log outlives an erasure)", JSON.parse(audits("site.leadership").at(-1).details).names === 3 && !audits("site.leadership").at(-1).details.includes("Fern"));
  res = await http("GET", "/api/leadership", { who: PLAIN });
  check("a member without a roster-confirmed character cannot read it (403 guild_unconfirmed)", res.status === 403 && (await J(res)).error === "guild_unconfirmed");
  res = await http("GET", "/api/leadership");
  check("  nor can a stranger (401)", res.status === 401);
  res = await http("GET", "/api/leadership", { who: MEMBER });
  out = await J(res);
  check("a confirmed member reads the directory and the Council's Discord link", res.status === 200 && out.guilds[0].gm === "Fern Melder" && out.councilUrl === "https://discord.com/channels/236932545793490944/1555636857621188669");
  out = await J(await http("GET", "/api/public"));
  check("the public settings carry neither the directory nor the Battle.net switch", !JSON.stringify(out).includes("Fern Melder") && !("leadership" in out.settings) && !("bnetLogin" in out.settings));
  check("a listing is read by nothing that decides anything: only the directory's module and the members' page name the row", fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && !["site-leadership.ts", "site-api.ts"].includes(f)).every((f) => !fs.readFileSync(path.join(root, "src", f), "utf8").includes("LEADERSHIP_KEY")) && (fs.readFileSync(path.join(root, "src", "site-api.ts"), "utf8").match(/LEADERSHIP_KEY/g) || []).length === 2);
  const stampUsers = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".ts") && fs.readFileSync(path.join(root, "src", f), "utf8").includes("leadershipStampStatement")).sort();
  const stamp = load("./site-leadership").leadershipStampStatement({ DB: { prepare: (sql) => ({ bind: (...p) => ({ sql, p }) }) } });
  check("  .115: News reads only when the directory last changed, through leadershipStampStatement (exactly the updated_at select), which only site-news.ts imports", stampUsers.join() === "site-leadership.ts,site-news.ts" && stamp.sql === "SELECT updated_at FROM site_settings WHERE key = ?1" && stamp.p.length === 1 && stamp.p[0] === "leadership" && /import \{[^}]*\bleadershipStampStatement\b[^}]*\} from "\.\/site-leadership"/.test(fs.readFileSync(path.join(root, "src", "site-news.ts"), "utf8")), stampUsers, stamp);

  console.log("\n== the end-of-beta reset (.114, item 8) ==");
  res = await http("GET", "/api/admin/beta-reset", { who: ADMIN });
  out = await J(res);
  check("locked until the closing moment is recorded; the preview counts the default Treasurer and three directory names", res.status === 200 && out.armed === false && out.betaClosedAt === null && out.preview.appointed === 1 && out.preview.directoryNames === 3, JSON.stringify(out));
  res = await http("POST", "/api/admin/beta-reset", { who: ADMIN, body: { confirm: "RESET", closedAt: null } });
  check("a reset before that is refused (409) and changes nothing", res.status === 409 && !one("SELECT 1 FROM site_settings WHERE key = 'appointed'"));
  res = await http("PUT", "/api/admin/beta-reset/closed", { who: ADMIN, body: { betaClosedAt: T + 3600 } });
  check("a closing moment in the future is refused: the reset cannot be armed ahead of time", res.status === 400);
  res = await http("PUT", "/api/admin/beta-reset/closed", { who: ADMIN, body: { betaClosedAt: 1700000000 } });
  check("  one before the beta began is refused too", res.status === 400);
  res = await http("PUT", "/api/admin/beta-reset/closed", { who: ADMIN, body: { betaClosedAt: T - 60 } });
  out = await J(res);
  check("a past closing moment arms it", res.status === 200 && out.state.armed === true && out.state.betaClosedAt === T - 60);
  res = await http("POST", "/api/admin/beta-reset", { who: ADMIN, body: { closedAt: T - 60 } });
  check("the reset needs the typed RESET (400)", res.status === 400);
  res = await http("POST", "/api/admin/beta-reset", { who: PLAIN, body: { confirm: "RESET", closedAt: T - 60 } });
  check("  and a site admin (403)", res.status === 403);
  res = await http("POST", "/api/admin/beta-reset", { who: ADMIN, body: { confirm: "RESET", closedAt: T - 120 } });
  check("  and the closing moment the page showed: a stale one is refused (409) and changes nothing", res.status === 409 && !one("SELECT 1 FROM site_settings WHERE key = 'appointed'"));
  res = await http("POST", "/api/admin/beta-reset", { who: ADMIN, body: { confirm: "RESET", closedAt: T - 60, notice: "Guild roles are open again for the full release" } });
  out = await J(res);
  check("the reset runs: it reports what it cleared", res.status === 200 && out.cleared.appointed === 1 && out.cleared.directoryNames === 3);
  check("  the appointed roles are an EXPLICIT empty map: the default Treasurer does not come back", one("SELECT value FROM site_settings WHERE key = 'appointed'").value === "{}" && Object.keys((await siteData.loadSettings(env())).appointed).length === 0);
  check("  the directory is empty again and the notice is set", (await J(await http("GET", "/api/admin/leadership", { who: ADMIN }))).guilds.every((g) => !g.gm && !g.officers.length) && (await siteData.loadSettings(env())).notice === "Guild roles are open again for the full release");
  check("  the dated log has counts only", (() => { const d = JSON.parse(audits("site.beta_reset").at(-1).details); return d.appointed === 1 && d.directoryNames === 3 && d.notice === true; })());
  // new appointments after the reset survive a replayed or second reset: it runs once (Codex 19:17)
  await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "New Treasurer" }, namesConfirmed: true } }); // .115: a new name needs the tick
  res = await http("POST", "/api/admin/beta-reset", { who: ADMIN, body: { confirm: "RESET", closedAt: T - 60 } });
  check("the reset runs once: a second or replayed request is refused (409) and later appointments survive", res.status === 409 && JSON.parse(one("SELECT value FROM site_settings WHERE key = 'appointed'").value).treasurer === "New Treasurer");
  res = await http("PUT", "/api/admin/beta-reset/closed", { who: ADMIN, body: { betaClosedAt: T - 30 } });
  check("  and the closing moment can no longer be changed to open another reset (409)", res.status === 409 && one("SELECT value FROM site_settings WHERE key = 'betaClosedAt'").value === String(T - 60));
  check("  the state says so: done, not armed", (await J(await http("GET", "/api/admin/beta-reset", { who: ADMIN }))).resetDone === true && (await J(await http("GET", "/api/admin/beta-reset", { who: ADMIN }))).armed === false);
  check("applications, votes and memberships are untouched by the reset (no statement names them)", !/site_applications|site_votes|site_board_votes|characters|members/.test(fs.readFileSync(path.join(root, "src", "site-leadership.ts"), "utf8").split("// ---------- the beta reset ----------")[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

  console.log("\n== renames Blizzard required (.114, item 9) ==");
  // the roster followed Mia One to a new name (roster.ts moveBinding) and recorded it
  db.prepare("UPDATE characters SET name_key = 'mia two', name = 'Mia Two' WHERE name_key = 'mia one'").run();
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.renamed', 'Mia Two', ?)").run(T - 3600, JSON.stringify({ from: "Mia One", discordId: MEMBER, guid: "Player-4613-0001" }));
  const renamedId = one("SELECT id FROM audit WHERE action = 'roster.renamed'").id;
  db.prepare("INSERT INTO site_applications (discord_id, position, fallback, answers, status, created_at, updated_at) VALUES (?, 'raider', 1, '{}', 'accepted', ?, ?)").run(MEMBER, T - DAY, T - DAY);
  db.prepare("INSERT INTO pending (name_key, name, discord_id, created_at, expires_at) VALUES ('mia two', 'Mia Two', ?, ?, ?)").run(MEMBER, T - 60, T + DAY);
  res = await http("GET", "/api/admin/renames", { who: ADMIN });
  out = await J(res);
  check("the admin sees the rename from the roster's record, with the account's name and no decision yet", res.status === 200 && out.renames.length === 1 && out.renames[0].from === "Mia One" && out.renames[0].to === "Mia Two" && out.renames[0].displayName === "Mia" && out.renames[0].hold === null && out.openHolds.length === 0);
  check("an ordinary rename keeps the link: nothing changes until someone decides", one("SELECT status, guid FROM characters WHERE name_key = 'mia two'").status === "member");
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: renamedId } });
  check("marking needs the typed REAPPLY (400)", res.status === 400);
  res = await http("POST", "/api/admin/renames/forced", { who: PLAIN, body: { auditId: renamedId, confirm: "REAPPLY" } });
  check("  and a site admin (403)", res.status === 403);
  MEMBER_ROLES = [GM]; REMOVES = []; NOTICES = []; LOGS = [];
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: renamedId, confirm: "REAPPLY" } });
  out = await J(res);
  check("the admin marks it as required by Blizzard", res.status === 200 && out.ok === true && out.unbound === 1 && out.applicationWithdrawn === true && out.role === "removed", JSON.stringify(out));
  const hold = one("SELECT * FROM rename_holds WHERE audit_id = ?", renamedId);
  check("  a hold is stored: the account, both names, who and when", hold && hold.state === "reapply" && hold.discord_id === MEMBER && hold.old_name === "Mia One" && hold.new_name === "Mia Two" && hold.decided_by === ADMIN && hold.decided_at === T);
  check("  the character is unbound (identifier cleared), its open code used up", one("SELECT status, guid FROM characters WHERE name_key = 'mia two'").status === "unbound" && one("SELECT guid FROM characters WHERE name_key = 'mia two'").guid === null && one("SELECT consumed_source FROM pending WHERE name_key = 'mia two'").consumed_source === "rename");
  check("  the site application is set back to withdrawn, with a staff note, so saving it submits it anew", one("SELECT status, admin_note FROM site_applications WHERE discord_id = ?", MEMBER).status === "withdrawn" && /Blizzard required/.test(one("SELECT admin_note FROM site_applications WHERE discord_id = ?", MEMBER).admin_note));
  check("  Guild Member is removed once, at the decision", REMOVES.length === 1 && REMOVES[0].id === MEMBER && REMOVES[0].role === GM && audits("role.revoked_reapply").length === 1);
  check("  the member is pointed at /verify-status privately (a private notice kind), staff get a log line", NOTICES.length === 1 && NOTICES[0].kind === "rename-reapply" && LOGS.some((l) => /required by Blizzard/.test(l)));
  check("  audited as rename.forced", audits("rename.forced").length === 1 && JSON.parse(audits("rename.forced")[0].details).discordId === MEMBER);
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: renamedId, confirm: "REAPPLY" } });
  check("the same rename cannot be decided twice (409)", res.status === 409);
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: 999999, confirm: "REAPPLY" } });
  check("  nor one that is not in the roster's record (404)", res.status === 404);
  out = await J(await http("GET", "/api/me", { who: MEMBER }));
  check("the member's Home learns why: both names", out.reapply && out.reapply.from === "Mia One" && out.reapply.to === "Mia Two");
  text = await status(MEMBER);
  check("/verify-status explains it: apply again on the website and verify the renamed character again", /Blizzard required your character \*\*Mia One\*\* to be renamed/.test(text) && /apply again/.test(text) && /Get my code/.test(text));
  check("the role writer sees the open hold (its grant path is covered in restore_role_test.cjs)", (await roles.reapplyHeld(env(), MEMBER)) === true && (await roles.reapplyHeld(env(), PLAIN)) === false);
  out = await J(await http("GET", "/api/admin/renames", { who: ADMIN }));
  check("the admin's list shows the decision and the member waiting", out.renames[0].hold && out.renames[0].hold.state === "reapply" && out.openHolds.length === 1 && out.openHolds[0].discordId === MEMBER);
  const copy = await J(await http("GET", "/api/me/export", { who: MEMBER }));
  check("the member's copy lists the rename record, without the administrator", copy.verification.renameRecords.length === 1 && copy.verification.renameRecords[0].from === "Mia One" && copy.verification.renameRecords[0].state === "reapply" && !JSON.stringify(copy.verification.renameRecords).includes(ADMIN));
  res = await http("POST", `/api/admin/renames/${hold.id}/approve`, { who: ADMIN });
  out = await J(res);
  check("approval is refused until both steps happened after the decision: a new application, accepted, and a fresh in-game verification (409 with what is missing)", res.status === 409 && out.error === "not_ready" && out.missing.length === 2 && one("SELECT state FROM rename_holds WHERE id = ?", hold.id).state === "reapply");
  res = await http("POST", `/api/admin/applications/${MEMBER}/status`, { who: ADMIN, body: { status: "accepted" } });
  check("  the old, withdrawn application cannot simply be accepted (409): the member submits it again first", res.status === 409 && one("SELECT status FROM site_applications WHERE discord_id = ?", MEMBER).status === "withdrawn");
  T += 60;
  db.prepare("UPDATE site_applications SET status = 'submitted', updated_at = ? WHERE discord_id = ?").run(T, MEMBER); // the member's save, as saveApplication records it
  db.prepare("INSERT INTO audit (ts, actor, action) VALUES (?, ?, 'site.application_updated')").run(T, MEMBER);
  res = await http("POST", `/api/admin/applications/${MEMBER}/status`, { who: ADMIN, body: { status: "accepted" } });
  check("  once submitted again, the leadership accepts it", res.status === 200 && one("SELECT status FROM site_applications WHERE discord_id = ?", MEMBER).status === "accepted");
  res = await http("POST", `/api/admin/renames/${hold.id}/approve`, { who: ADMIN });
  out = await J(res);
  check("  still refused while the renamed character is not verified again in game", res.status === 409 && out.missing.length === 1 && /verified again/.test(out.missing[0]));
  // a different character verified under the reused name Mia Two (another GUID) is not the renamed one (Codex 19:51)
  db.prepare("UPDATE characters SET status = 'verified', verified_at = ?, guid = 'Player-4613-0999' WHERE name_key = 'mia two'").run(T + 5);
  T += 10;
  res = await http("POST", `/api/admin/renames/${hold.id}/approve`, { who: ADMIN });
  check("  a different character verified under the reused name does not count: the GUID decides when the hold recorded one", res.status === 409 && (await J(res)).missing.length === 1 && one("SELECT state FROM rename_holds WHERE id = ?", hold.id).state === "reapply");
  db.prepare("UPDATE characters SET status = 'verified', verified_at = ?, guid = 'Player-4613-0001' WHERE name_key = 'mia two'").run(T); // the renamed character's own fresh code, its GUID confirmed
  T += 10;
  db.prepare("UPDATE site_applications SET updated_at = ? WHERE discord_id = ?").run(T + 100, MEMBER); // as if saved again after the acceptance
  res = await http("POST", `/api/admin/renames/${hold.id}/approve`, { who: ADMIN });
  check("  an acceptance older than the member's latest save does not count: the reviewed version must be the current one (Codex 19:56)", res.status === 409 && /last saved/.test((await J(res)).missing[0]));
  db.prepare("UPDATE site_applications SET updated_at = ? WHERE discord_id = ?").run(T - 70, MEMBER);
  res = await http("POST", `/api/admin/renames/${hold.id}/approve`, { who: ADMIN });
  check("with both steps done, the admin approves: the hold closes", res.status === 200 && one("SELECT state, closed_by FROM rename_holds WHERE id = ?", hold.id).state === "approved" && one("SELECT closed_by FROM rename_holds WHERE id = ?", hold.id).closed_by === ADMIN && audits("rename.approved").length === 1);
  check("  grants are no longer held", (await roles.reapplyHeld(env(), MEMBER)) === false && (await J(await http("GET", "/api/me", { who: MEMBER }))).reapply === null);
  res = await http("POST", `/api/admin/renames/${hold.id}/cancel`, { who: ADMIN });
  check("  a closed hold cannot be closed again (409)", res.status === 409);
  T += 31 * DAY;
  check("thirty days after closing, the cron deletes the record", (await renames.sweepRenameHolds(env())) === 1 && !one("SELECT 1 FROM rename_holds WHERE id = ?", hold.id));
  T -= 31 * DAY;
  check("bot data: the manual erasure query names the table", /DELETE FROM rename_holds\s+WHERE discord_id/.test(fs.readFileSync(path.join(root, "queries", "forget-member.sql"), "utf8")));

  // another legitimate member character keeps Guild Member (Codex 18:47/19:17); the renamed one is still verified again
  const ALT = "300000000000000007";
  siteUser(ALT, { global_name: "Al" });
  character(ALT, "Al Main", "Player-4613-0007");
  character(ALT, "Al Alt", "Player-4613-0008");
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.renamed', 'Al Alt', ?)").run(T - 60, JSON.stringify({ from: "Al Old", discordId: ALT, guid: "Player-4613-0008" }));
  MEMBER_ROLES = [GM]; REMOVES = [];
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: one("SELECT id FROM audit WHERE subject = 'Al Alt' AND action = 'roster.renamed'").id, confirm: "REAPPLY" } });
  out = await J(res);
  check("a member whose other character is in the guild keeps Guild Member: only the renamed character is unbound (role not-held)", res.status === 200 && out.role === "not-held" && REMOVES.length === 0 && one("SELECT status FROM characters WHERE name_key = 'al alt'").status === "unbound" && one("SELECT status FROM characters WHERE name_key = 'al main'").status === "member");
  check("  and grants are not held for that account", (await roles.reapplyHeld(env(), ALT)) === false);
  // two open holds on one account never count as each other's support (Codex 19:51), through the real SQL
  const TWO = "300000000000000008";
  siteUser(TWO, { global_name: "Tw" });
  character(TWO, "Tw One", "Player-4613-0011");
  character(TWO, "Tw Two", "Player-4613-0012");
  const holdRow = db.prepare("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, guid, nonce, audit_id, state, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'reapply', ?, ?)");
  holdRow.run(TWO, "Tw Old1", "Tw One", "tw one", "Player-4613-0011", "n-two-1", ADMIN, T);
  check("one open hold with the other character a current member: that member supports the role (not held)", (await roles.reapplyHeld(env(), TWO)) === false);
  holdRow.run(TWO, "Tw Old2", "Tw Two", "tw two", "Player-4613-0012", "n-two-2", ADMIN, T);
  check("two open holds, both characters current members again: neither supports the other, the account is held", (await roles.reapplyHeld(env(), TWO)) === true);
  character(TWO, "Tw Main", "Player-4613-0013");
  check("  a third, unheld member character supports it (not held)", (await roles.reapplyHeld(env(), TWO)) === false);
  db.prepare("DELETE FROM characters WHERE name = 'Tw Main'").run();
  db.prepare("UPDATE characters SET guid = NULL WHERE name = 'Tw Two'").run();
  check("  a held character whose GUID is not yet confirmed again still matches its hold by key (the cautious side): held", (await roles.reapplyHeld(env(), TWO)) === true);

  // the target must be exactly one current character: a GUID nobody holds any more is refused, not guessed by name
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.renamed', 'Al Main', ?)").run(T - 30, JSON.stringify({ from: "Al Before", discordId: ALT, guid: "Player-4613-9999" }));
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: one("SELECT id FROM audit WHERE subject = 'Al Main' AND action = 'roster.renamed'").id, confirm: "REAPPLY" } });
  check("a rename whose character cannot be resolved by its in-game identifier is refused (409 unresolved), nothing changed", res.status === 409 && (await J(res)).error === "unresolved" && one("SELECT status FROM characters WHERE name_key = 'al main'").status === "member");
  db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.renamed', 'Al Main', ?)").run(T - 121 * DAY, JSON.stringify({ from: "Al Ancient", discordId: ALT, guid: "Player-4613-0007" }));
  res = await http("POST", "/api/admin/renames/forced", { who: ADMIN, body: { auditId: one("SELECT id FROM audit WHERE details LIKE '%Al Ancient%'").id, confirm: "REAPPLY" } });
  check("  so is one older than the list's 120 days (409 too_old)", res.status === 409 && (await J(res)).error === "too_old");

  console.log("\n== typed names (.115, item C) ==");
  const NAME_WITHHELD = leadership.NAME_WITHHELD;
  const settingsAudits = () => audits("site.settings");
  const storedAppointed = () => one("SELECT value FROM site_settings WHERE key = 'appointed'")?.value ?? null;
  const nobodyLogged = (re) => db.prepare("SELECT subject, details FROM audit").all().every((r) => !re.test(`${r.subject ?? ""} ${r.details ?? ""}`));
  check("the placeholder is the one the policy and the editors name", NAME_WITHHELD === "Name withheld");
  let auditsBefore = settingsAudits().length, appointedBefore = storedAppointed();
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Ana", "class_lead:priest": "Bo" }, votingOpen: false } });
  out = await J(res);
  check("a settings save that adds typed names without namesConfirmed is refused (400 confirm_names, field appointed), the reason in words", res.status === 400 && out.error === "confirm_names" && out.field === "appointed" && /agreed to be named/.test(out.message) && /open web/.test(out.message), out);
  check("  and nothing is stored: not the names, not the switch sent with them, no audit row", storedAppointed() === appointedBefore && (await siteData.loadSettings(env())).votingOpen === true && settingsAudits().length === auditsBefore);
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Ana", "class_lead:priest": "Bo" }, namesConfirmed: "yes" } });
  check("  only true is the tick (a string is refused)", res.status === 400 && (await J(res)).error === "confirm_names" && storedAppointed() === appointedBefore);
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Ana", "class_lead:priest": "Bo" }, notice: "Officer meeting at eight, Ana hosts", namesConfirmed: true } });
  out = await J(res);
  check("with namesConfirmed the admin appoints them", res.status === 200 && out.settings.appointed.treasurer === "Ana" && out.settings.appointed["class_lead:priest"] === "Bo");
  let det = JSON.parse(settingsAudits().at(-1).details);
  check("  the audit has the role keys (the map's sorted keys, not character positions of its JSON), the count and the tick", JSON.stringify(det.appointedRoles) === '["class_lead:priest","treasurer"]' && det.appointedNames === 2 && det.namesConfirmed === true && !("appointed" in det), det);
  check("  the notice is a boolean: its text is not kept", det.notice === true, det);
  check("  no audit row holds either name or the notice text", nobodyLogged(/\bAna\b|\bBo\b|Officer meeting/));
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Ana", "class_lead:priest": "Bo" }, notice: "" } });
  det = JSON.parse(settingsAudits().at(-1).details);
  check("saving the same names again needs no tick (nobody added); the cleared notice is false; no namesConfirmed when not sent", res.status === 200 && det.notice === false && det.appointedNames === 2 && !("namesConfirmed" in det), det);
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Bo", "class_lead:priest": "Bo" } } });
  check("  changing who holds a role names someone anew: refused without the tick", res.status === 400 && (await J(res)).error === "confirm_names" && JSON.parse(storedAppointed()).treasurer === "Ana");

  // the default Treasurer (site-data.ts DEFAULT_APPOINTED) names a person until the list is first saved; removed on request
  const defaultHolder = siteData.DEFAULT_APPOINTED.treasurer;
  db.prepare("DELETE FROM site_settings WHERE key = 'appointed'").run();
  const signedOutBoot = async () => ((await (await http("GET", "/")).text()).match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/) || [])[1] || "";
  const publicJson = async () => JSON.stringify(await J(await http("GET", "/api/public")));
  const meJson = async () => JSON.stringify(await J(await http("GET", "/api/me", { who: MEMBER })));
  check("(fixture) with no saved list the default Treasurer's name is public: /api/public, the signed-out page, /api/me", (await publicJson()).includes(defaultHolder) && (await signedOutBoot()).includes(defaultHolder) && (await meJson()).includes(defaultHolder));
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: NAME_WITHHELD } } });
  out = await J(res);
  check("removal on request: typing Name withheld needs no tick", res.status === 200 && out.settings.appointed.treasurer === NAME_WITHHELD && JSON.parse(settingsAudits().at(-1).details).appointedNames === 1);
  check("  the name leaves /api/public, the signed-out page and /api/me", !(await publicJson()).includes(defaultHolder) && !(await signedOutBoot()).includes(defaultHolder) && !(await meJson()).includes(defaultHolder));
  res = await http("GET", "/api/board/treasurer", { who: PLAIN });
  out = await J(res);
  check("  the role stays appointed: its board stays closed, held by Name withheld", res.status === 409 && out.error === "appointed" && out.appointed === NAME_WITHHELD, res.status, out);
  res = await http("PUT", "/api/application", { who: PLAIN, body: { position: "treasurer" } });
  out = await J(res);
  check("  and an application to it is refused on the role", res.status === 400 && out.field === "position" && /appointed/.test(out.message), res.status, out);
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: {} } });
  check("clearing the entry needs no tick either, and reopens the role", res.status === 200 && Object.keys((await J(res)).settings.appointed).length === 0 && (await http("GET", "/api/board/treasurer", { who: PLAIN })).status === 200);

  // the I-X directory: a name added to a guild needs the tick; keeping, moving within its guild or removing one does not
  const directory = () => one("SELECT value FROM site_settings WHERE key = 'leadership'").value;
  let dirBefore = directory();
  auditsBefore = audits("site.leadership").length;
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 2: { gm: "Cy", officers: ["Di"] } }) } });
  out = await J(res);
  check("a directory save that adds names without namesConfirmed is refused (400 confirm_names), the reason in words, nothing stored", res.status === 400 && out.error === "confirm_names" && /agreed to be listed/.test(out.message) && directory() === dirBefore && audits("site.leadership").length === auditsBefore, out);
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 2: { gm: "Cy", officers: ["Di"] } }), namesConfirmed: true } });
  det = JSON.parse(audits("site.leadership").at(-1).details);
  check("  with it the names are listed; the audit has the count and the tick, never the names", res.status === 200 && JSON.parse(directory())[2].gm === "Cy" && det.names === 2 && det.namesConfirmed === true && nobodyLogged(/\bCy\b|\bDi\b/), det);
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 2: { gm: "Di", officers: ["Cy"] } }) } });
  check("  moving a name within its guild adds nobody: no tick needed, and none recorded", res.status === 200 && JSON.parse(directory())[2].gm === "Di" && !("namesConfirmed" in JSON.parse(audits("site.leadership").at(-1).details)));
  dirBefore = directory();
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 2: { gm: "Di", officers: [] }, 3: { gm: "Cy", officers: [] } }) } });
  check("  listing a name under another guild is listing it anew: refused without the tick", res.status === 400 && (await J(res)).error === "confirm_names" && directory() === dirBefore);
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 2: { gm: NAME_WITHHELD, officers: [] } }) } });
  out = await J(await http("GET", "/api/admin/leadership", { who: ADMIN }));
  check("removing names (one cleared, one replaced by Name withheld) needs no tick, and they leave the directory", res.status === 200 && out.guilds[2].gm === NAME_WITHHELD && !JSON.stringify(out).includes("Cy") && !/\bDi\b/.test(JSON.stringify(out)));
  out = await J(await http("GET", "/api/leadership", { who: ALT }));
  check("  a confirmed member's directory shows neither", out && Array.isArray(out.guilds) && out.guilds[2].gm === NAME_WITHHELD && !JSON.stringify(out.guilds).includes("Cy"), out);

  console.log("\n== atomic typed-name saves: real competing HTTP requests after the read ==");
  // The read hook captures A's real SQLite answer, runs B through index.fetch to completion at the SAME second, then
  // releases A. A must not undo B, partially apply its other settings or append a successful-save audit.
  for (const race of [
    { label: "withheld", winner: { appointed: { treasurer: NAME_WITHHELD } }, confirmed: false },
    { label: "cleared despite A's tick", winner: { appointed: {} }, confirmed: true },
    { label: "replaced", winner: { appointed: { treasurer: "Race New" }, namesConfirmed: true }, confirmed: false },
    { label: "absent row created", absent: true, winner: { appointed: { treasurer: "Race New" }, namesConfirmed: true }, confirmed: false },
  ]) {
    await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "Race Old" }, votingOpen: true, notice: "", namesConfirmed: true } });
    if (race.absent) db.prepare("DELETE FROM site_settings WHERE key = 'appointed'").run();
    const before = settingsAudits().length;
    let winner;
    HOOK = async (sql, phase) => {
      if (phase !== "read" || sql !== "SELECT key, value FROM site_settings") return;
      HOOK = null;
      winner = await http("PUT", "/api/admin/settings", { who: ADMIN, body: race.winner });
    };
    try {
      res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: race.absent ? {} : { treasurer: "Race Old" }, votingOpen: false, notice: "Stale notice", namesConfirmed: race.confirmed } });
    } finally { HOOK = null; }
    out = await J(res);
    check(`settings ${race.label}: competing real route succeeds; stale route answers conflict/reload`, winner?.status === 200 && res.status === 409 && out.error === "stale_settings" && /Nothing was saved.*Reload/.test(out.message), out);
    check(`  settings ${race.label}: the whole winning map survives, including empty/absent distinctions`, storedAppointed() === JSON.stringify(race.winner.appointed));
    check(`  settings ${race.label}: no partial switches/notice or stale-save audit, despite the identical second`, (await siteData.loadSettings(env())).votingOpen === true && (await siteData.loadSettings(env())).notice === "" && settingsAudits().length === before + 1 && one("SELECT updated_at FROM site_settings WHERE key = 'appointed'").updated_at === T);
  }
  for (const race of [
    { label: "withheld", winner: ten({ 2: { gm: NAME_WITHHELD, officers: [] } }), confirmed: false },
    { label: "cleared despite A's tick", winner: ten(), confirmed: true },
    { label: "replaced", winner: ten({ 2: { gm: "Race New GM", officers: [] } }), confirmed: false },
    { label: "absent row created", absent: true, winner: ten({ 2: { gm: "Race New GM", officers: [] } }), confirmed: false },
  ]) {
    const old = ten({ 2: { gm: "Race Old GM", officers: ["Race Officer"] } });
    await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: old, namesConfirmed: true } });
    if (race.absent) db.prepare("DELETE FROM site_settings WHERE key = 'leadership'").run();
    const before = audits("site.leadership").length;
    let winner;
    HOOK = async (sql, phase) => {
      if (phase !== "read" || sql !== "SELECT value, updated_at, updated_by FROM site_settings WHERE key = ?1") return;
      HOOK = null;
      winner = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: race.winner, namesConfirmed: true } });
    };
    try {
      res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: race.absent ? ten() : old, namesConfirmed: race.confirmed } });
    } finally { HOOK = null; }
    out = await J(res);
    check(`directory ${race.label}: competing real route succeeds; stale route answers conflict/reload`, winner?.status === 200 && res.status === 409 && out.error === "stale_directory" && /Nothing was saved.*Reload/.test(out.message), out);
    check(`  directory ${race.label}: the complete winning directory survives`, directory() === JSON.stringify(leadership.cleanLeadership(race.winner)));
    check(`  directory ${race.label}: no stale-save audit, despite the identical second`, audits("site.leadership").length === before + 1 && one("SELECT updated_at FROM site_settings WHERE key = 'leadership'").updated_at === T);
  }
  check("interleaving audits remain counts only: no typed names or notice content", nobodyLogged(/Race Old|Race New|Race Officer|Stale notice/));

  // the policy says what the code does (the served page, whitespace folded: the tracked HTML wraps its lines)
  res = await http("GET", "/privacy");
  const policyText = (await res.text()).replace(/\s+/g, " ");
  check("the privacy policy covers typed names: appointed roles public on the open web, removal by Name withheld, not in your copy", res.status === 200 && ["<strong>Appointed roles.</strong>", "open web", "&ldquo;Name withheld&rdquo;", "removed or corrected", "not in your copy"].every((s) => policyText.includes(s)) && policy.PRIVACY_DESCRIBES_BNET_LOGIN === false);
  check("  the length it states is the one the server keeps (site-data.ts cleanAppointed)", policyText.includes("(up to 40 characters, tied to no Discord account)") && Array.from(siteData.cleanAppointed({ treasurer: "é".repeat(45) }).treasurer).length === 40);
  check("  names only after that person agreed, in both editors; the log keeps role keys and a count", /they type a name only after that person agreed/.test(policyText) && /they list a name only after that person agreed/.test(policyText) && /how many names were saved, never the names/.test(policyText));
  // Codex, 3 Oct 2026 13:24 UTC: the rewrite is said as schema.ts redactSettingsAudit behaves (a failure logs and a later
  // start retries), with the owner's check after installing; never "were rewritten when build .115 was installed".
  check("  the older entries: rewritten once at a start, a failure logged and retried later, checked by the owner after installing", policyText.includes("Build .115 rewrites the entries written before it the same way, once, when it first starts; if that fails, the failure is logged and the rewrite is tried again at a later start, and after installing it the owner checks that the rewrite is recorded as done and that no such entry still holds a name or a notice's text.") && !/were rewritten the same way when build \.115 was installed/.test(policyText));
  check("  an administrator clears the appointments and the directory after the beta has closed (a person's step, no timer)", (policyText.match(/clears it after the beta has closed/g) || []).length === 2 && !/cleared when the beta ends/.test(policyText));
  check("a rank records staff decisions; the policy distinguishes read cutoffs, bounded physical cleanup and independent recovery copies", /can reflect a staff decision \(for example a probation rank, where the guild uses one\)/.test(policyText) && /<strong>Backups\.<\/strong> The live service applies the stated read cutoffs and processes physical deletions through bounded cleanup or staff action\./.test(policyText) && !/Lifetimes and deletions apply to the live database at once/.test(policyText) && /point-in-time history of the database, which it keeps for up to \d+ days/.test(policyText) && /export taken before build \.115 therefore still holds the dated log as it was before the rewrite/.test(policyText));
  check("  only the newest checked export is kept until the launch is accepted (owner's answer of 3 Oct 2026)", /The owner keeps only the\s+newest export that has been checked by restoring it privately: an older one is destroyed once a newer one has been\s+checked, the last one is destroyed once the game's launch release is accepted/.test(policyText) && !/would be made again/.test(policyText));
  // Codex, 3 Oct 2026 13:26 UTC: the restore replays deletions from the audit, which keeps no typed name; so the owner puts
  // back the two typed-name rows as they stood right before the restore (docs/launch-runbook.md section 1), never through
  // the audit, and checks the rewrite again.
  // The second review round (3 Oct 2026): the site is closed for the whole restore (the runbook's step 0: no window in which
  // a restored name shows), and News notices changed or deleted since the copy are deleted, the records of notices posted
  // since are put back (site_news_test runs the runbook's statements over a simulated restore).
  check("restore wording is an attended requirement, with closed site, deletion replay, News replay, private typed-name preservation and rewrite check; no automatic erasure claim", ["The following is an attended recovery requirement, not an automatic restore or erasure feature.", "site must remain closed to everyone from just before the restore", "repeated the deletions made since it was taken", "deleted every News notice changed or deleted since then", "put back the record of every notice posted since then", "put back the names the administrators typed", "exactly as they stood just before the restore", "private copy of just those two settings", "destroys it once they are back", "dated log never receives the names", "owner also checks the restored database for the rewrite"].every(s => policyText.includes(s)) && !/If one were ever restored, the site would be closed/.test(policyText));
  // Website closure hides restored rows but proves no drain of admitted writes. The corrected runbook refuses before
  // capture/replacement unless actual quiescence is proved; these text checks do not claim an implemented runtime barrier.
  const restoreRunbook = fs.readFileSync(path.join(root, "..", "docs", "launch-runbook.md"), "utf8").replace(/\s+/g, " ");
  check("  restore instructions refuse without actual quiescence; fixed waits/equality/redeploy are no drain proof and the future epoch is unimplemented", restoreRunbook.includes("refuse the restore before the final capture or replacement") && restoreRunbook.includes("proved completed or definitively canceled, including pending SQL and associated post-response work") && restoreRunbook.includes("A fixed wait, two or more equal captures") && restoreRunbook.includes("ordinary redeploy does not supply this proof") && restoreRunbook.includes("no old admitted writer can resume after reopening") && restoreRunbook.includes("That epoch barrier is **not implemented**") && restoreRunbook.includes("<private dir>/news.sql") && !restoreRunbook.includes("The block also freezes every Settings"));

  console.log("\n== the one-time rewrite of the settings rows written before .115 ==");
  const before115 = Object.fromEntries(db.prepare("SELECT id, details FROM audit").all().map((r) => [r.id, r.details]));
  const putAudit = (action, details) => Number(db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, ?, ?, NULL, ?)").run(T - 9 * DAY, ADMIN, action, details).lastInsertRowid);
  const fx = {
    both: putAudit("site.settings", JSON.stringify({ votingOpen: "1", notice: "Raid at eight with Zed", appointed: JSON.stringify({ treasurer: "Zed", "class_lead:priest": "Quill" }) })),
    onlyAppointed: putAudit("site.settings", JSON.stringify({ appointed: JSON.stringify({ officer: "Zed" }) })),
    onlyNotice: putAudit("site.settings", JSON.stringify({ notice: "Zed says hello" })),
    emptyNotice: putAudit("site.settings", JSON.stringify({ notice: "" })),
    badAppointed: putAudit("site.settings", JSON.stringify({ launchAt: "1793833200", appointed: '{"treasurer":"Ze' })),
    notAnObject: putAudit("site.settings", JSON.stringify({ appointed: JSON.stringify(["Zed"]) })),
    badJson: putAudit("site.settings", "not json: Zed"),
    noDetails: putAudit("site.settings", null),
    otherAction: putAudit("site.leadership", JSON.stringify({ names: 1, appointed: JSON.stringify({ treasurer: "Zed" }), notice: "Zed" })),
  };
  const detOf = (id) => one("SELECT details FROM audit WHERE id = ?", id).details;
  const marker = () => one("SELECT value, updated_at, updated_by FROM site_settings WHERE key = ?", schema.AUDIT_TYPED_NAMES_KEY);
  check("(fixture) this database ran the rewrite at its first request: the marker is there", marker()?.value === "115");
  db.prepare("DELETE FROM site_settings WHERE key = ?").run(schema.AUDIT_TYPED_NAMES_KEY); // as a database before the .115 deploy
  // The settings-audit read-back, a MANDATORY acceptance gate since Codex's note of 3 Oct 2026 13:24 UTC: read from the
  // .115 section of docs/deploy-checklist.md (rollout step 7) and run here exactly as the owner runs it. Its oracle counts
  // the same rows in JS, so the documented query cannot drift from what the rewrite leaves behind.
  const checklistText = fs.readFileSync(path.join(root, "..", "docs", "deploy-checklist.md"), "utf8");
  const rbMatch = /```sql\n\s*(SELECT \(SELECT COUNT\(\*\) FROM site_settings WHERE key = '[^']+'\) AS marker, [^\n]*)\n\s*```/.exec(checklistText.slice(checklistText.indexOf("## Worker .115 ")));
  const READ_BACK = rbMatch ? rbMatch[1].trim() : "";
  const readBack = () => { const r = db.prepare(READ_BACK).get(); return { keys: Object.keys(r).join(), marker: r.marker, residual: r.residual, unreadable: r.unreadable }; };
  const rbOracle = () => {
    let residual = 0, unreadable = 0, appointedOnly = 0;
    for (const { details } of db.prepare("SELECT details FROM audit WHERE action = 'site.settings'").all()) {
      if (details === null) continue;
      let d;
      try { d = JSON.parse(details); } catch { unreadable++; continue; }
      if (!d || typeof d !== "object" || Array.isArray(d)) continue;
      const named = Object.prototype.hasOwnProperty.call(d, "appointed");
      if (named) appointedOnly++;
      if (named || typeof d.notice === "string") residual++;
    }
    return { marker: marker() ? 1 : 0, residual, unreadable, appointedOnly };
  };
  const outsideLiterals = (sql) => sql.replace(/'(?:[^']|'')*'/g, "''");
  check("the read-back: the checklist's .115 section states it as one counts-only SELECT, on the marker key the code uses, writing nothing", READ_BACK.startsWith("SELECT (SELECT COUNT(*) FROM site_settings WHERE key = '" + schema.AUDIT_TYPED_NAMES_KEY + "') AS marker, ") && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|PRAGMA)\b/i.test(outsideLiterals(READ_BACK)) && !READ_BACK.includes(";"), READ_BACK);
  let rb = readBack(), rbo = rbOracle();
  check("  before the rewrite: marker 0, every old-shape row counted (the notice-only ones too, which a read of $.appointed alone missed), the row that is not JSON as unreadable", rb.keys === "marker,residual,unreadable" && rb.marker === 0 && rb.residual === rbo.residual && rb.residual >= 6 && rbo.residual - rbo.appointedOnly >= 2 && rb.unreadable === rbo.unreadable && rb.unreadable === 1, rb, rbo);
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  rb = readBack();
  check("  after the rewrite: marker 1 and residual 0, and the row that is not JSON still keeps the gate shut (unreadable 1)", rb.marker === 1 && rb.residual === 0 && rb.unreadable === 1 && rb.residual === rbOracle().residual, rb);
  check("both fields: appointed becomes its sorted role keys and their count, the notice a boolean; the switch is kept", detOf(fx.both) === JSON.stringify({ votingOpen: "1", notice: true, appointedRoles: ["class_lead:priest", "treasurer"], appointedNames: 2 }), detOf(fx.both));
  check("  only appointed", detOf(fx.onlyAppointed) === JSON.stringify({ appointedRoles: ["officer"], appointedNames: 1 }), detOf(fx.onlyAppointed));
  check("  only a notice: true for text, false for an empty one", detOf(fx.onlyNotice) === '{"notice":true}' && detOf(fx.emptyNotice) === '{"notice":false}', detOf(fx.onlyNotice), detOf(fx.emptyNotice));
  check("  an appointed text that is not JSON is removed: no roles, no count (it may hold a name)", detOf(fx.badAppointed) === JSON.stringify({ launchAt: "1793833200", appointedRoles: [], appointedNames: null }), detOf(fx.badAppointed));
  check("  JSON that is not an object gives no role keys (never positions)", detOf(fx.notAnObject) === JSON.stringify({ appointedRoles: [], appointedNames: null }), detOf(fx.notAnObject));
  check("  details that are not JSON, no details, and other actions are left alone", detOf(fx.badJson) === "not json: Zed" && detOf(fx.noDetails) === null && JSON.parse(detOf(fx.otherAction)).notice === "Zed");
  check("  rows already in the .115 shape are untouched", Object.entries(before115).every(([id, d]) => detOf(Number(id)) === d));
  check("  the marker is set: '115', at the Worker's clock, by nobody", marker()?.value === "115" && marker().updated_at === T && marker().updated_by === null, marker());
  const snapshot = () => JSON.stringify(db.prepare("SELECT id, details FROM audit ORDER BY id").all());
  const after = snapshot();
  let prepared = [];
  HOOK = (sql, phase) => { if (phase === "prepare") prepared.push(sql); };
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  HOOK = null;
  check("a second ensureSchema changes nothing; with the marker set it reads the marker and does not scan the log again", snapshot() === after && !prepared.some((q) => /UPDATE audit/.test(q)) && prepared.some((q) => /FROM site_settings WHERE key = \?1/.test(q)));
  db.prepare("DELETE FROM site_settings WHERE key = ?").run(schema.AUDIT_TYPED_NAMES_KEY);
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  check("  run again without the marker (two isolates racing), the rewrite matches nothing more", snapshot() === after && marker()?.value === "115");
  // a failure is logged and does not hold the Worker at 503; the next isolate start tries again
  db.prepare("DELETE FROM site_settings WHERE key = ?").run(schema.AUDIT_TYPED_NAMES_KEY);
  const late = putAudit("site.settings", JSON.stringify({ appointed: JSON.stringify({ treasurer: "Zed" }) }));
  const errs = [], realError = console.error;
  console.error = (...a) => { errs.push(a.join(" ")); };
  HOOK = (sql, phase) => { if (phase === "prepare" && /^UPDATE audit SET details = json_remove/.test(sql.trim())) throw new Error("D1_ERROR: simulated"); };
  schema.forgetSchemaCheck();
  let schemaOk = true;
  try { await schema.ensureSchema(env()); } catch { schemaOk = false; }
  HOOK = null;
  console.error = realError;
  check("a failed rewrite does not fail the schema check: one log line through errorRef (the category only), no marker, the row as it was", schemaOk && errs.length === 1 && errs[0] === "settings audit rewrite failed d1" && !marker() && JSON.parse(detOf(late)).appointed === '{"treasurer":"Zed"}', errs);
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  check("  the next isolate start rewrites it and sets the marker", detOf(late) === JSON.stringify({ appointedRoles: ["treasurer"], appointedNames: 1 }) && marker()?.value === "115", detOf(late));
  db.prepare("DELETE FROM audit WHERE id = ?").run(fx.badJson); // (fixture) the unreadable row settled by the owner's private inspection
  rb = readBack();
  check("the read-back passes only now: marker 1, residual 0, unreadable 0", rb.marker === 1 && rb.residual === 0 && rb.unreadable === 0, rb);
  // the rollback boundary (docs/launch-runbook.md section 9): an older writer resumed after the marker writes the old shape
  const resumed = putAudit("site.settings", JSON.stringify({ notice: "Quill leads tonight" }));
  rb = readBack();
  check("a save an older writer makes after the marker: the marker still reads 1, the residual catches it", rb.marker === 1 && rb.residual === 1 && rb.residual === rbOracle().residual, rb);
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  check("  a new isolate start does not rewrite it while the marker stands", JSON.parse(detOf(resumed)).notice === "Quill leads tonight" && readBack().residual === 1);
  const othersOf = () => JSON.stringify(db.prepare("SELECT id, details FROM audit WHERE id != ? ORDER BY id").all(resumed));
  const othersBefore = othersOf();
  db.prepare("DELETE FROM site_settings WHERE key = ?").run(schema.AUDIT_TYPED_NAMES_KEY); // the runbook's remedy, by the owner
  schema.forgetSchemaCheck();
  await schema.ensureSchema(env());
  rb = readBack();
  check("  the documented remedy: the marker deleted, a later start rewrites only that row, and the read-back passes", detOf(resumed) === '{"notice":true}' && othersOf() === othersBefore && rb.marker === 1 && rb.residual === 0 && rb.unreadable === 0, rb);

  console.log("\n== typed names across a restore (docs/launch-runbook.md section 1; Codex, 3 Oct 2026 13:26 UTC) ==");
  // The audit of typed names is counts only, so a restore's replay cannot tell which names were removed on request; the
  // runbook has the owner keep the two rows privately right before a restore and write them back right after it. Its
  // statements are read from the runbook and run here as the owner would run them: the SELECT on the database being
  // replaced, its `node` line over wrangler's --json shape, then the .sql file on the "restored" rows.
  const runbookText = fs.readFileSync(path.join(root, "..", "docs", "launch-runbook.md"), "utf8");
  const preserveMatch = /--command "(SELECT CASE WHEN s\.key IS NULL THEN [^"]*)"/.exec(runbookText);
  const PRESERVE = preserveMatch ? preserveMatch[1] : "";
  const nodeMatch = /node -e "([^"]*)" <private dir>\/typed-names\.json > <private dir>\/typed-names\.sql/.exec(runbookText);
  const keysNamed = [...PRESERVE.matchAll(/\bSELECT '(\w+)'/g)].map((m) => m[1]);
  check("the runbook's preserve statement is one read-only SELECT of site_settings naming exactly the two typed-name rows (appointed, the directory's key)", PRESERVE.startsWith("SELECT CASE WHEN s.key IS NULL") && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|PRAGMA)\b/i.test(outsideLiterals(PRESERVE)) && keysNamed.join() === ["appointed", leadership.LEADERSHIP_KEY].join() && siteData.settingsFrom(env(), [{ key: keysNamed[0], value: JSON.stringify({ treasurer: "Probe" }) }]).appointed.treasurer === "Probe" && !!nodeMatch, keysNamed);
  const typedRows = () => db.prepare("SELECT key, value, updated_at, updated_by FROM site_settings WHERE key IN ('appointed', ?) ORDER BY key").all(leadership.LEADERSHIP_KEY).map((r) => ({ ...r }));
  const auditRows = () => one("SELECT COUNT(*) AS c FROM audit").c;
  const os = require("os"), { execFileSync } = require("child_process");
  const preserveFile = () => {
    // wrangler d1 execute --json prints one result whose `results` hold the rows; the runbook's node line turns it into SQL
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "olympus-typed-names-"));
    try {
      fs.writeFileSync(path.join(tmp, "typed-names.json"), JSON.stringify([{ results: db.prepare(PRESERVE).all(), success: true, meta: {} }]));
      return execFileSync(process.execPath, ["-e", nodeMatch[1], path.join(tmp, "typed-names.json")], { encoding: "utf8" });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  // the state right before the restore, through the real routes: an apostrophe, quotes, letters beyond ASCII, a withheld name
  res = await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "D'Arcy Zoë", "class_lead:priest": NAME_WITHHELD }, namesConfirmed: true } });
  const savedSettings = res.status === 200;
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 0: { gm: "Ó'Brien", officers: [NAME_WITHHELD, 'Tess "Two" Lane'] } }), namesConfirmed: true } });
  const savedDirectory = res.status === 200;
  const preserved = typedRows();
  const auditAtPreserve = auditRows();
  const sqlFile = preserveFile();
  const fileLines = sqlFile.trim().split("\n");
  check("right before the restore: a file of exactly two statements, in key order, each an upsert of the row as it stands", savedSettings && savedDirectory && preserved.length === 2 && fileLines.length === 2 && fileLines[0].startsWith("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('appointed', ") && fileLines[1].startsWith("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('leadership', ") && fileLines.every((l) => l.endsWith("ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;")), fileLines);
  // the restore brings back an older state: names since removed or corrected on request, an older time and editor
  const restoreOlder = () => {
    db.prepare("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('appointed', ?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2, updated_by = ?3").run(JSON.stringify({ treasurer: "Quenby Old", "class_lead:priest": "Quenby Old" }), T - 20 * DAY, MEMBER);
    db.prepare("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4").run(leadership.LEADERSHIP_KEY, JSON.stringify(ten({ 0: { gm: "Quenby Old", officers: ["Quenby Old"] } })), T - 20 * DAY, MEMBER);
  };
  restoreOlder();
  check("(fixture) the restored rows hold the older names", (await publicJson()).includes("Quenby Old") && JSON.stringify(typedRows()).includes("Quenby Old"));
  db.exec(sqlFile);
  check("right after the restore the file puts both rows back exactly as preserved: value, time and editor, every character of every name intact", JSON.stringify(typedRows()) === JSON.stringify(preserved), typedRows());
  out = await J(await http("GET", "/api/admin/leadership", { who: ADMIN }));
  const publicNow = await publicJson();
  check("  the site shows the names as they stood, not the restored ones", publicNow.includes("D'Arcy Zoë") && !publicNow.includes("Quenby") && out.guilds[0].gm === "Ó'Brien" && out.guilds[0].officers.includes('Tess "Two" Lane') && !JSON.stringify(out).includes("Quenby"), out && out.guilds && out.guilds[0]);
  check("  through no Worker route: no audit row added, none holds a typed or a restored name", auditRows() === auditAtPreserve && nobodyLogged(/D'Arcy|Ó'Brien|Tess "Two"|Quenby/));
  db.exec(sqlFile);
  check("  the file run again changes nothing", JSON.stringify(typedRows()) === JSON.stringify(preserved));
  db.prepare("DELETE FROM site_settings WHERE key = 'appointed'").run(); // no saved list right before the restore: the default Treasurer
  const sqlFile2 = preserveFile();
  check("a key without a row right before the restore is preserved as a DELETE (no row means the default appointment)", sqlFile2.trim().split("\n")[0] === "DELETE FROM site_settings WHERE key = 'appointed';" && sqlFile2.trim().split("\n")[1] === fileLines[1], sqlFile2);
  restoreOlder();
  db.exec(sqlFile2);
  out = await J(await http("GET", "/api/public"));
  check("  written back, the restored row is gone and the default appointment shows, not the restored name", !one("SELECT 1 AS x FROM site_settings WHERE key = 'appointed'") && JSON.stringify(out.settings.appointed) === JSON.stringify(siteData.DEFAULT_APPOINTED) && JSON.stringify(typedRows()) === JSON.stringify(preserved.slice(1)), out && out.settings && out.settings.appointed);

  console.log("\n== smaller changes ==");
  check("search shows every differing name: nickname, display name, @username", siteCore.shownName({ username: "greta", displayName: "Greta Grey", nick: "Gee" }) === "Gee · Greta Grey (@greta)");
  check("  a name equal to the username (any case) is not repeated", siteCore.shownName({ username: "fernmelder", displayName: "Fernmelder", nick: "Fern" }) === "Fern (@fernmelder)" && siteCore.shownName({ username: "greta", displayName: null, nick: null }) === "@greta");
  check("  the stored label keeps its old format (votes and friends keep what they saved)", siteCore.labelOf({ username: "greta", displayName: "Greta Grey", nick: "Gee" }) === "Gee (@greta)");
  check("the site's CSP allows images from this site and Discord's picture host, nothing else", siteCore.CSP.includes("img-src 'self' https://cdn.discordapp.com;") && !/img-src[^;]*data:/.test(siteCore.CSP));
  res = await http("GET", "/privacy");
  text = await res.text();
  check("the privacy policy: Battle.net sign-in switched off, no 'sign in with Battle.net again to keep them'", /Battle\.net sign-in is currently switched off/.test(text) && !/sign in with Battle\.net again to keep them/.test(text));
  check("  no stale server, address or channel wording", !/serves the Olympus Discord server/.test(text) && !/once it moves there/.test(text) && !/#bot-announcements/.test(text) && !/open a ticket/.test(text) && !/help channel/.test(text));
  check("  it names the top bar's picture, the leadership directory and the rename records", /cdn\.discordapp\.com/.test(text) && /The leadership directory/.test(text) && /Renames Blizzard required/.test(text));
  check("  and says unbinding does not by itself remove the Guild Member role", /unbinding does not by itself remove your Guild Member role/.test(text));
  res = await http("GET", "/terms");
  text = await res.text();
  check("the terms: notices in #olympus-notices only, and the leadership and rename sentences", /#olympus-notices\)/.test(text) && !/#bot-announcements/.test(text) && /Renamed characters/.test(text) && /leadership directory/.test(text));
  res = await http("GET", "/admin/ranks", { who: ADMIN });
  text = await res.text();
  check("the rank planner wears the crest and the dark scheme (item 5)", res.status === 200 && /class="brand-mark" src="\/static\/olympus-icon\.png"/.test(text) && /<meta name="color-scheme" content="dark">/.test(text) && !/icon-friends\.png/.test(text));
  const css = fs.readFileSync(path.join(root, "public", "static", "rank-planner", "styles.css"), "utf8");
  check("  its stylesheet takes the site's rock background, dialog frames and panel buttons", /\.114/.test(css) && css.includes('url("/static/wow/rock.jpg")') && css.includes('url("/static/wow/frame-dialog.png")') && css.includes('url("/static/wow/button-up.png")'));
  check("  every image it names is one this site serves", [...css.matchAll(/url\("([^"]+)"\)/g)].every((m) => /^\/static\/wow\/[a-z0-9_.-]+$/.test(m[1]) && fs.existsSync(path.join(root, "public", m[1]))));
  const unbind = fs.readFileSync(path.join(root, "src", "interactions.ts"), "utf8");
  check("the unbind reply no longer promises the roster removes the role", !unbind.includes("the next roster export reconciles it") && unbind.includes("remove it in Discord by hand"));
  const reg = fs.readFileSync(path.join(root, "scripts", "register.mjs"), "utf8");
  check("the command descriptions no longer promise a BattleTag (source; re-registration is the owner's step)", !reg.includes("keeps its BattleTag on record") && !reg.includes("Show your Battle.net link") && !reg.includes("which BattleTag"));

  globalThis.Date = RealDate;
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

// Build .114 (2 Oct 2026): Viktor's requests of 2 Oct 17:25 UTC, through the REAL src/*.ts (transpiled by TypeScript
// itself) against the REAL schema in SQLite (node:sqlite), every HTTP request through the real index.ts fetch. Discord's
// and Blizzard's HTTP sides are stubbed; nothing leaves the process. Covers:
//   - the Battle.net sign-in switch (bnet-switch.ts): off by default and fail-closed; the three routes refuse before any
//     audit row, cookie, redirect or token exchange; a switch turned off during a sign-in stores nothing and pushes nothing
//     (at the conditional write, and again right before Discord); switching on needs the secrets, the policy marker and a
//     typed ENABLE from a site admin; the watcher's /health reports it; /verify-status says nothing of Battle.net while off;
//   - the Olympus I-X leadership directory (site-leadership.ts): ten empty entries, admin save, confirmed members only,
//     never in /api/public, no names in the dated log;
//   - the end-of-beta reset: locked until a past closing moment is recorded, a typed RESET, the appointed roles saved as an
//     explicit empty map (the default Treasurer does not come back), the directory emptied, counts only in the log;
//   - renames Blizzard required (rename-review.ts): the list from the roster's record, the decision (unbound, application
//     withdrawn, Guild Member removed and held, a private notice), /verify-status and the site's Home, approval, the copy,
//     the thirty-day cleanup;
//   - the search's shown names, the CSP's one picture host, the policy texts, the rank planner's page.
// Run from the worker folder:  node tests/owner_requests_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

let HOOK = null; // (sql, phase) => void: a test may act when a statement is prepared ("prepare") or after a write ran ("ran")
function d1(db) {
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
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
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
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
    json: (body, status = 200) => ({ status, body, json: async () => body }),
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
const indexMod = load("./index"), oauth = load("./oauth"), sw = load("./bnet-switch"), siteCore = load("./site-core"), siteData = load("./site-data"), roles = load("./roles"), renames = load("./rename-review"), interactions = load("./interactions"), policy = load("./policy-content");

let T = 1790960000; // 2 Oct 2026, 16:53 UTC
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

  console.log("\n== the Battle.net sign-in switch (.114, item 6) ==");
  check("the .114 privacy policy carries no Battle.net section, so the build's marker is false", policy.PRIVACY_DESCRIBES_BNET_LOGIN === false);
  let st = await sw.bnetLoginState(env(SECRETS));
  check("with no setting row the switch is off (and not effective), even with the secrets", st.adminOn === false && st.effective === false && st.configured === true && st.policyReady === false, JSON.stringify(st));
  const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1 down"); } }) }) };
  check("  an unreadable setting is off (fail closed)", (await sw.bnetLoginState({ ...env(SECRETS), DB: broken })).adminOn === false);

  FETCHES = [];
  let res = await http("GET", "https://verify.example/linked-role", { over: SECRETS });
  let text = await res.text();
  check("off: /linked-role answers the switched-off page, with no redirect and no cookie", res.status === 200 && !res.headers.get("Location") && !res.headers.get("Set-Cookie") && /switched off/.test(text) && res.headers.get("Cache-Control") === "no-store");
  check("  and writes no audit row (no link.started)", audits("link.started").length === 0);
  res = await http("GET", "https://verify.example/oauth/callback?code=c1&state=s1", { headers: { Cookie: "olv_state=s1.x" }, over: SECRETS });
  check("off: /oauth/callback refuses before the Discord token exchange and clears the state cookie", res.status === 200 && FETCHES.length === 0 && /olv_state=;\s*Max-Age=0/.test(res.headers.get("Set-Cookie") || ""));
  res = await http("GET", "https://verify.example/bnet/link?code=c2&state=s2", { headers: { Cookie: "olv_bnet=abc" }, over: SECRETS });
  check("off: /bnet/link refuses before the Blizzard token exchange and clears the sealed cookie", res.status === 200 && FETCHES.length === 0 && /olv_bnet=;\s*Max-Age=0/.test(res.headers.get("Set-Cookie") || ""));
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000050", username: "late" }, { Authorization: "Bearer x" }, "Late#50", "c50", "test");
  check("off: a bind reached anyway stores nothing and pushes nothing to Discord", /switched off/.test(await res.text()) && !one("SELECT 1 FROM members WHERE discord_id = '100000000000000050'") && FETCHES.length === 0);

  res = await http("GET", "/api/admin/bnet-switch", { who: ADMIN, over: SECRETS });
  let out = await J(res);
  check("the admin reads the switch: configured, no policy, off", res.status === 200 && out.configured === true && out.policyReady === false && out.adminOn === false && out.effective === false);
  res = await http("PUT", "/api/admin/bnet-switch", { who: PLAIN, body: { on: true, confirm: "ENABLE" }, over: SECRETS });
  check("a member who is not a site admin cannot touch it (403)", res.status === 403);
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true }, over: SECRETS });
  check("switching on needs the typed ENABLE (400)", res.status === 400 && (await J(res)).error === "confirm");
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true, confirm: "ENABLE" } });
  check("switching on is refused without the Blizzard secrets (409 not_configured)", res.status === 409 && (await J(res)).error === "not_configured");
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true, confirm: "ENABLE" }, over: SECRETS });
  check("  and refused while the policy does not describe the login (409 policy_not_ready): it cannot get ahead of the policy", res.status === 409 && (await J(res)).error === "policy_not_ready" && !one("SELECT 1 FROM site_settings WHERE key = 'bnetLogin'"));
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: false }, over: SECRETS });
  check("switching off is always allowed, and audited", res.status === 200 && one("SELECT value FROM site_settings WHERE key = 'bnetLogin'").value === "0" && audits("bnet.switch").length === 1);

  // as if a later reviewed release carried the marked policy section
  sw.setPolicyReadyForTests(true);
  res = await http("PUT", "/api/admin/bnet-switch", { who: ADMIN, body: { on: true, confirm: "ENABLE" }, over: SECRETS });
  out = await J(res);
  check("with the secrets and a policy that describes it, the admin switches it on", res.status === 200 && out.state.effective === true && one("SELECT updated_by FROM site_settings WHERE key = 'bnetLogin'").updated_by === ADMIN);
  check("  audited as bnet.switch {on: true}, with nothing else in it", JSON.parse(audits("bnet.switch").at(-1).details).on === true && Object.keys(JSON.parse(audits("bnet.switch").at(-1).details)).length === 1);
  res = await http("GET", "https://verify.example/linked-role", { over: SECRETS });
  check("on: /linked-role starts the Discord authorization as before", res.status === 302 && /discord\.com\/oauth2\/authorize/.test(res.headers.get("Location") || "") && audits("link.started").length === 1);
  res = await http("GET", "https://verify.example/linked-role");
  check("  but never without the secrets, whatever the setting says", res.status === 200 && !res.headers.get("Location"));

  // turned off while someone is at Blizzard's login: the write itself carries the setting
  FETCHES = [];
  HOOK = (sql, phase) => { if (phase === "prepare" && /^SELECT banned FROM members WHERE discord_id = \?1$/.test(sql.trim())) db.prepare("UPDATE site_settings SET value = '0' WHERE key = 'bnetLogin'").run(); };
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000051", username: "mid" }, { Authorization: "Bearer x" }, "Mid#51", "c51", "test");
  HOOK = null;
  check("turned off after the bind's first check but before its write: nothing stored, nothing pushed", /switched off/.test(await res.text()) && !one("SELECT battletag FROM members WHERE discord_id = '100000000000000051' AND battletag IS NOT NULL") && FETCHES.length === 0);
  db.prepare("UPDATE site_settings SET value = '1' WHERE key = 'bnetLogin'").run();
  HOOK = (sql, phase) => { if (phase === "ran" && /INSERT INTO members \(discord_id, discord_name, battletag/.test(sql)) db.prepare("UPDATE site_settings SET value = '0' WHERE key = 'bnetLogin'").run(); };
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000052", username: "late2" }, { Authorization: "Bearer x" }, "Mid#52", "c52", "test");
  HOOK = null;
  check("turned off right after the write: the row is taken back and nothing is pushed to Discord", /switched off/.test(await res.text()) && one("SELECT battletag FROM members WHERE discord_id = '100000000000000052'").battletag === null && FETCHES.length === 0);
  db.prepare("UPDATE site_settings SET value = '1' WHERE key = 'bnetLogin'").run();
  // turned off between Discord's DELETE and the PUT: the PUT never happens and the row is taken back
  FETCHES = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { const r = await realFetch(url, init); if (init.method === "DELETE") db.prepare("UPDATE site_settings SET value = '0' WHERE key = 'bnetLogin'").run(); return r; };
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000054", username: "mid3" }, { Authorization: "Bearer x" }, "Mid#54", "c54", "test");
  globalThis.fetch = realFetch;
  check("turned off between Discord's DELETE and PUT: no PUT, the row taken back (Codex 19:17)", /switched off/.test(await res.text()) && FETCHES.map((f) => f.method).join(",") === "DELETE" && one("SELECT battletag FROM members WHERE discord_id = '100000000000000054'").battletag === null);
  db.prepare("UPDATE site_settings SET value = '1' WHERE key = 'bnetLogin'").run();
  FETCHES = [];
  res = await oauth.bindBattletag(env(SECRETS), { id: "100000000000000053", username: "on" }, { Authorization: "Bearer x" }, "On#53", "c53", "test");
  check("on throughout: the link completes as before (stored, then DELETE, PUT and GET on Discord's record)", /Linked/.test(await res.text()) && one("SELECT battletag FROM members WHERE discord_id = '100000000000000053'").battletag === "On#53" && FETCHES.filter((f) => f.url.includes("/role-connection")).map((f) => f.method).join(",") === "DELETE,PUT,GET");
  res = await http("GET", "https://verify.example/health", { headers: { Authorization: "Bearer watcher-token-for-tests-only-0123456789" }, over: SECRETS });
  out = await J(res);
  check("the watcher's /health reports the switch (policy, setting, result); the public answer does not", out.bnetSwitch && out.bnetSwitch.effective === true && out.bnetSwitch.adminOn === true && !("bnetSwitch" in (await J(await http("GET", "https://verify.example/health")))));
  check("  /verify-status, switched on, still shows a fresh link with its day", /Battle\.net: linked \(On#53\)/.test(await status("100000000000000053", SECRETS)));
  db.prepare("UPDATE site_settings SET value = '0' WHERE key = 'bnetLogin'").run();
  sw.setPolicyReadyForTests(null);
  db.prepare("INSERT INTO audit (ts, actor, action, subject) VALUES (?, '100000000000000053', 'link.ok', 'On#53')").run(T);
  text = await status("100000000000000053", SECRETS);
  check("switched off: /verify-status says nothing about keeping a link", !/kept until/.test(text) && !/Battle\.net: linked/.test(text), text);
  check("  and tells someone who once linked the one remedy left (Discord's Connections), not 'link again'", /removing the connection in Discord's settings \(Connections\) clears it/.test(text) && !/linking again replaces it/.test(text));
  check("the cron's 29-day purge runs whatever the switch says (index.ts scheduled is unconditional)", /ctx\.waitUntil\(purgeBattleNetData\(env\)/.test(fs.readFileSync(path.join(root, "src", "index.ts"), "utf8")));

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
  res = await http("PUT", "/api/admin/leadership", { who: ADMIN, body: { guilds: ten({ 0: { gm: "  Fern   Melder ", officers: ["Ana", "", "Ana", "Bo"] } }) } });
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
  await http("PUT", "/api/admin/settings", { who: ADMIN, body: { appointed: { treasurer: "New Treasurer" } } });
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

  console.log("\n== smaller changes ==");
  check("search shows every differing name: nickname, display name, @username", siteCore.shownName({ username: "greta", displayName: "Greta Grey", nick: "Gee" }) === "Gee · Greta Grey (@greta)");
  check("  a name equal to the username (any case) is not repeated", siteCore.shownName({ username: "fernmelder", displayName: "Fernmelder", nick: "Fern" }) === "Fern (@fernmelder)" && siteCore.shownName({ username: "greta", displayName: null, nick: null }) === "@greta");
  check("  the stored label keeps its old format (votes and friends keep what they saved)", siteCore.labelOf({ username: "greta", displayName: "Greta Grey", nick: "Gee" }) === "Gee (@greta)");
  check("the site's CSP allows images from this site and Discord's picture host, nothing else", siteCore.CSP.includes("img-src 'self' https://cdn.discordapp.com;") && !/img-src[^;]*data:/.test(siteCore.CSP));
  res = await http("GET", "/privacy");
  text = await res.text();
  check("the privacy policy: Battle.net sign-in switched off, no 'sign in with Battle.net again to keep them'", /Battle\.net sign-in is switched off/.test(text) && !/sign in with Battle\.net again to keep them/.test(text));
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

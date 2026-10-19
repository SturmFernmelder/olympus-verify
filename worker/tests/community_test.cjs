// Build .56 (1 Oct 2026): the community adapter contract (consolidation batch 1), through the REAL src/*.ts (transpiled
// by TypeScript itself) against the REAL schema in SQLite (node:sqlite). Discord's HTTP side is stubbed. Covers the
// context for a stranger, an applicant, a roster-confirmed member, a banned one, a denied one, someone who left the
// server and a SITE_ADMIN; the feature list parser and its two dependencies; the write fence admitting a first write
// and refusing after sign-out, denial, leaving the server, losing the roster, a ban and an expired cookie (before any
// SQL), with the refusal naming the reason and a lost race answered as conflict; a later statement bound to the first
// one's nonce; the erase registry running inside deleteSiteData; the export; and the time helpers.
// Run from the worker folder:  node tests/community_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const entry = require('./helpers/privacy129_fixture.cjs');
let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let SQL_TIME = null;
function d1(db, hooks = {}) {
  let batches = 0;
  // Arm the existing races at the actual community payload boundary, after
  // authentication. Every physical guard remains in nativeTrace/nativeGroups.
  const payloadBatch = plan => plan.some(s => s.statement.includes("privacy_community_request_refused") || /^SELECT \(EXISTS\(SELECT 1 FROM site_users fu/.test(s.statement));
  return entry.originalNativePort(db, {...hooks,
    beforeBatch: (plan) => payloadBatch(plan) ? hooks.beforeBatch?.(++batches, plan) : undefined,
    afterBatch: (plan) => payloadBatch(plan) ? hooks.afterBatch?.(batches, plan) : undefined,
  });
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.function('strftime', (format,input) => {
    if (format !== '%s' || input !== 'now') throw Error('unexpected Native clock input');
    return String(SQL_TIME === null ? T : SQL_TIME);
  });
  entry.installCurrentEntryEpoch(db,{now:T});
  return db;
}
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let LOGS = [];
let REST = async () => { throw new Error("no REST in tests"); };
let HTTP = async (url) => { throw new Error("no network in tests: " + url); };
globalThis.fetch = (...args) => HTTP(...args);
const stubs = {};
const cache = {};
function load(name) {
  if(name === "node:async_hooks")return require(name);
  const key = name.replace(/^\.\.\//, "./");
  if (stubs[key]) return stubs[key];
  const file = path.join(root, "src", name.replace(/^\.\//, "").replace(/^\.\.\//, "") + ".ts");
  const rel = path.relative(path.join(root, "src"), file).replace(/\\/g, "/");
  if (cache[rel]) return cache[rel].exports;
  const mod = { exports: {} };
  cache[rel] = mod;
  const dir = path.dirname(rel);
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(dir === "." ? p : p.startsWith("../") ? p.slice(3).replace(/^/, "./") : "./" + dir + "/" + p.replace(/^\.\//, "")));
  return mod.exports;
}
const realDiscord = (() => { const m = { exports: {} }; new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(m, m.exports, (p) => load(p)); return m.exports; })();
Object.assign(stubs, {
  "./discord": {
    ...realDiscord,
    json: (body, status = 200) => ({ status, body, json: async () => body }),
    reply: (content) => ({ status: 200, body: { type: 4, data: { content } } }),
    verifyInteraction: async () => true,
    logLine: async (_env, text) => { LOGS.push(text); },
    postMessage: async () => ({ id: "1" }),
    staffNotice: async () => {},
    addRole: async () => {},
    removeRole: async () => {},
    guildMember: async () => ({ roles: [] }),
    setNickname: async () => {},
    rest: (...args) => REST(...args),
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const context = load("./community-context"), refs = load("./community-refs"), time = load("./community-time"), names = load("./community-names");
const siteCore = load("./site-core"), siteAdmin = load("./site-admin"), indexMod = load("./index");

let db = freshDb();
let statements = 0;
const rawEnv = (over = {}) => entry.currentEntryEnvironment({ DB: d1(db, { count: () => { statements++; } }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const directPorts=new WeakMap();
const env = (over={}) => {const e=rawEnv(over);if(!directPorts.has(db))directPorts.set(db,load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(e.DB,'writer','canonical',entry.ENTRY_EPOCH));return {...e,DB:directPorts.get(db)};};
async function fixtureRun(sql,...args){return env().DB.prepare(sql).bind(...args).run();}
const originalCookies=new Map();
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const one = (sql, ...p) => db.prepare(sql).get(...p);
const siteUser = async (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), in_server: 1, denied: 0, session_version: 1, ...over };
  await fixtureRun("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?)",id,row.username,T,T,row.in_server,row.denied,row.session_version);
};
const confirm = async (id, name) => {
  await fixtureRun("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING",id);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?, ?, ?, 'member', ?)",name.toLowerCase(),name,id,T);
};
const cookieFor = async(id,version=1)=>{
  const old=originalCookies.get(id);
  if(old)return old.cookie;
  const issued=await entry.issueOriginalEntryCookie(name=>load('./'+name),db,rawEnv(),id);
  if(issued.session.v!==version)throw Error('original version differs');
  originalCookies.set(id,issued);return issued.cookie;
};
const req = (url, cookie, init = {}) => new Request(url, { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { Cookie: cookie } : {}) } });
const APPLICANT = "300000000000000001", MEMBER = "300000000000000002", BANNED = "300000000000000003", DENIED = "300000000000000004", LEFT = "300000000000000005", STAFF = "472099715253796864";

async function deleteThroughOriginalRoute(target,actor){
 const headers={Cookie:await cookieFor(actor),Origin:'https://guild.example','X-Olympus':'2'};
 const base='https://guild.example/api/admin/users/'+target;
 const prep=await indexMod.default.fetch(new Request(base+'/decision-target?route=delete&decisionAction=partial_delete',{headers}),rawEnv(),ctx);
 const p=await prep.json();if(prep.status!==200||typeof p.targetToken!=='string')throw Error('target held '+JSON.stringify(p));
 const out=await indexMod.default.fetch(new Request(base+'/delete',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Olympus-Decision-Target':p.targetToken,'X-Olympus-Decision-Action':'partial_delete'},body:JSON.stringify({mentions:false})}),rawEnv(),ctx);
 const result=await out.json();if(out.status!==200)throw Error('delete held '+JSON.stringify(result));return result.ok===true;
}
(async () => {
  console.log("\n== the context: who may do what, from keeper facts only ==");
  await siteUser(APPLICANT); await siteUser(MEMBER); await confirm(MEMBER, "Fern Melder"); await siteUser(BANNED); await confirm(BANNED, "Bad Actor"); await fixtureRun("UPDATE members SET banned = 1 WHERE discord_id = ?",BANNED);
  await siteUser(DENIED, { denied: 1 }); await siteUser(LEFT, { in_server: 0 }); await siteUser(STAFF);
  await cookieFor(LEFT); await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?",LEFT);
  let res = await indexMod.default.fetch(req("https://guild.example/api/community/context"), rawEnv(), ctx);
  check("a stranger gets 401 signed_out from the site's own gate", res.status === 401 && (await res.json()).error === "signed_out");
  const dto = async (id, over) => (await (await indexMod.default.fetch(req("https://guild.example/api/community/context", await cookieFor(id)), rawEnv(over), ctx)).json());
  let d = await dto(APPLICANT);
  check("an applicant: identity and applicantWrite, no guild data, not staff", d.capabilities.authenticatedIdentity && d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData && !d.capabilities.communityStaff && d.subject.discordId === APPLICANT, JSON.stringify(d));
  d = await dto(MEMBER);
  check("a roster-confirmed member: confirmedGuildData from characters.status = 'member'", d.capabilities.confirmedGuildData && !d.capabilities.communityStaff);
  d = await dto(BANNED);
  check("a banned account with a confirmed character: no guild data", d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData);
  d = await dto(DENIED);
  check("a denied account: identity only", d.capabilities.authenticatedIdentity && !d.capabilities.applicantWrite && !d.capabilities.confirmedGuildData);
  d = await dto(LEFT);
  check("someone who left the server: identity only", d.capabilities.authenticatedIdentity && !d.capabilities.applicantWrite);
  d = await dto(STAFF);
  check("a SITE_ADMIN: communityStaff (distinct from the bot's officer roles), no guild data without a character", d.capabilities.communityStaff && !d.capabilities.confirmedGuildData);
  d = await dto(STAFF, { SITE_ADMINS: "" });
  check("  and not staff when not listed", !d.capabilities.communityStaff);
  check("the DTO carries the member's own id, the capabilities, every feature flag and the clock, nothing else", Object.keys(d).sort().join(",") === "capabilities,features,now,subject" && Object.keys(d.features).length === context.COMMUNITY_FEATURES.length);
  check("organizer (.59): a confirmed member listed in COMMUNITY_ORGANIZERS, or a confirmed SITE_ADMIN; never an applicant", (await dto(MEMBER, { COMMUNITY_ORGANIZERS: MEMBER })).capabilities.organizer === true && (await dto(MEMBER)).capabilities.organizer === false && (await dto(APPLICANT, { COMMUNITY_ORGANIZERS: APPLICANT })).capabilities.organizer === false && (await dto(STAFF)).capabilities.organizer === false);
  const cycled = await dto(APPLICANT);
  const cookieV1 = await cookieFor(APPLICANT, 1);
  await fixtureRun("UPDATE site_users SET session_version = 2 WHERE discord_id = ?",APPLICANT);
  res = await indexMod.default.fetch(req("https://guild.example/api/community/context", cookieV1), rawEnv(), ctx);
  check("a cookie from before a sign-out is a stranger again (session_version)", res.status === 401 && cycled.subject.discordId === APPLICANT);
  await fixtureRun("UPDATE site_users SET session_version = 1 WHERE discord_id = ?",APPLICANT);

  console.log("\n== the feature list ==");
  const feats = (v) => [...context.communityFeatures({ COMMUNITY_FEATURES: v })].sort().join(",");
  check("names are parsed, trimmed, case-folded; unknown names dropped", feats(" Directory , events,bogus ") === "directory,events");
  check("crafting needs directory; attendance needs events", feats("crafting") === "" && feats("attendance") === "" && feats("directory,crafting,events,attendance") === "attendance,crafting,directory,events");
  check("empty means none", feats("") === "" && feats(undefined) === "");
  check("the DTO shows them", (await dto(APPLICANT, { COMMUNITY_FEATURES: "directory" })).features.directory === true && (await dto(APPLICANT)).features.directory === false);


  console.log("\n== .176 read-only community access: original proof, current staff or fresh Guild Member role ==");
  const ROLE = "1549581282227265566", OTHER_ROLE = "1549581672272625734";
  const roleVars = { GUILD_ID: "236932545793490944", DISCORD_BOT_TOKEN: "test-only-discord-token", COMMUNITY_FEATURES: "directory,crafting,events,attendance" };
  let roleCalls = [], roleAnswer = id => ({ user: { id }, roles: [ROLE], pending: false });
  REST = async (e, method, route) => { roleCalls.push({ method, route }); return roleAnswer(route.split("/").at(-1)); };
  HTTP = async (url, init) => { const u = new URL(String(url)); if (u.origin !== "https://discord.com" || !u.pathname.startsWith("/api/v10/guilds/236932545793490944/members/")) throw Error("unexpected fixture URL"); const body = await REST(null, init.method, u.pathname.slice("/api/v10".length)); return new Response(JSON.stringify(body), { status: body?.fixtureHttpStatus ?? 200, headers: { "Content-Type": "application/json" } }); };
  const roleContext = () => context.communityContext(env(roleVars), req("https://guild.example/x", cookieV1));
  const readSecret = cx => context.admittedCommunityRead(env(roleVars), cx, [env(roleVars).DB.prepare("SELECT discord_id FROM site_users WHERE discord_id=?1").bind(MEMBER)]);
  const preReadRows = JSON.stringify([one("SELECT COUNT(*) AS n FROM characters"), one("SELECT COUNT(*) AS n FROM members"), db.prepare("SELECT * FROM site_settings ORDER BY key").all()]);
  let readCtx = await roleContext();
  check("the configured Guild Member role allows only communityRead, not roster confirmation or organizer", readCtx.capabilities.communityRead && !readCtx.capabilities.confirmedGuildData && !readCtx.capabilities.organizer && readCtx.capabilities.applicantWrite && roleCalls.length === 1);
  let readResult = await readSecret(readCtx);
  check("the admitted reader fetches the exact current server/member twice around its Native payload", readResult !== context.FENCE_REFUSED && readResult[0].results[0].discord_id === MEMBER && roleCalls.length === 3 && roleCalls.every(x => x.method === "GET" && x.route === "/guilds/236932545793490944/members/" + APPLICANT));
  const rowsBeforeRole = one("SELECT COUNT(*) AS n FROM characters WHERE discord_id=?", APPLICANT).n;
  check("role-based viewing creates no character, roster proof, member role or settings row", rowsBeforeRole === 0 && preReadRows === JSON.stringify([one("SELECT COUNT(*) AS n FROM characters"), one("SELECT COUNT(*) AS n FROM members"), db.prepare("SELECT * FROM site_settings ORDER BY key").all()]));
  const states = [
    ["an officer role alone does not broaden member viewing", id => ({ user: { id }, roles: [OTHER_ROLE] })],
    ["a missing Guild Member role is refused", id => ({ user: { id }, roles: [] })],
    ["a pending Discord membership is refused", id => ({ user: { id }, roles: [ROLE], pending: true })],
    ["a malformed string pending state is refused", id => ({ user: { id }, roles: [ROLE], pending: "true" })],
    ["a malformed numeric pending state is refused", id => ({ user: { id }, roles: [ROLE], pending: 1 })],
    ["a bot account cannot use linked-person Community access", id => ({ user: { id, bot: true }, roles: [ROLE] })],
    ["a malformed bot flag is refused", id => ({ user: { id, bot: "false" }, roles: [ROLE] })],
    ["a different Discord identity is refused", () => ({ user: { id: MEMBER }, roles: [ROLE] })],
    ["a malformed role payload is refused", id => ({ user: { id }, roles: ROLE })],
    ["a partially malformed roles list is refused", id => ({ user: { id }, roles: [ROLE, 123] })],
    ["a missing provider profile is refused", () => null],
  ];
  for (const [name, answer] of states) { roleAnswer = answer; const cc = await roleContext(); check(name, !cc.capabilities.communityRead && !cc.capabilities.confirmedGuildData); }
  roleAnswer = id => ({ user: { id }, roles: [ROLE] });
  const missingConfig = await context.communityContext(env({ ...roleVars, ROLE_GUILD_MEMBER: "" }), req("https://guild.example/x", cookieV1));
  const wrongServer = await context.communityContext(env({ ...roleVars, GUILD_ID: "1549537348516188200" }), req("https://guild.example/x", cookieV1));
  check("absent role or mismatched bot/site server cannot provide role reader authority", !missingConfig.capabilities.communityRead && !wrongServer.capabilities.communityRead);
  roleAnswer = () => ({ fixtureHttpStatus: 503 });
  check("Discord unavailability withholds the new role path", !(await roleContext()).capabilities.communityRead);
  const callsBeforeStaff = roleCalls.length;
  const staffCtx = await context.communityContext(env(roleVars), req("https://guild.example/x", await cookieFor(STAFF)));
  const staffRows = await context.admittedCommunityRead(env(roleVars), staffCtx, [env(roleVars).DB.prepare("SELECT 1 AS read_only")]);
  const memberCtx = await context.communityContext(env(roleVars), req("https://guild.example/x", await cookieFor(MEMBER)));
  const memberRows = await context.admittedCommunityRead(env(roleVars), memberCtx, [env(roleVars).DB.prepare("SELECT 1 AS read_only")]);
  check("current SITE_ADMINS can read without a roster character or Discord dependency, but remain not confirmed/organizer", staffCtx.capabilities.communityRead && staffCtx.capabilities.communityStaff && !staffCtx.capabilities.confirmedGuildData && !staffCtx.capabilities.organizer && staffRows !== context.FENCE_REFUSED && roleCalls.length === callsBeforeStaff);
  check("existing roster readers retain Native admission while Discord is unavailable", memberCtx.capabilities.communityRead && memberCtx.capabilities.confirmedGuildData && memberRows !== context.FENCE_REFUSED);
  const staffRemoved = await context.admittedCommunityRead(env({ ...roleVars, SITE_ADMINS: "", DISCORD_BOT_TOKEN: "" }), staffCtx, [env().DB.prepare("SELECT 1 AS withheld")]);
  check("a staff read cannot reuse a removed SITE_ADMINS listing", staffRemoved === context.FENCE_REFUSED);
  roleAnswer = id => ({ user: { id }, roles: [ROLE] });
  readCtx = await roleContext(); roleAnswer = id => ({ user: { id }, roles: [] });
  readResult = await readSecret(readCtx);
  check("Guild Member role lost after context but before payload: no private row returned", readResult === context.FENCE_REFUSED);
  roleAnswer = id => ({ user: { id }, roles: [ROLE] }); roleCalls = []; readCtx = await roleContext();
  roleAnswer = id => ({ user: { id }, roles: roleCalls.length >= 3 ? [] : [ROLE] });
  readResult = await readSecret(readCtx);
  check("Guild Member role lost during Native payload: post-read Discord check withholds earlier rows", readResult === context.FENCE_REFUSED && roleCalls.length === 3);
  roleAnswer = id => ({ user: { id }, roles: [ROLE] }); roleCalls = []; readCtx = await roleContext();
  roleAnswer = async id => { if (roleCalls.length === 3) await fixtureRun("UPDATE site_users SET session_version=2 WHERE discord_id=?", APPLICANT); return { user: { id }, roles: [ROLE] }; };
  readResult = await readSecret(readCtx);
  check("a sign-out during final Discord lookup is rechecked in Native SQL and withholds all rows", readResult === context.FENCE_REFUSED);
  await fixtureRun("UPDATE site_users SET session_version=1 WHERE discord_id=?", APPLICANT);
  roleAnswer = id => ({ user: { id }, roles: [ROLE] }); readCtx = await roleContext();
  await fixtureRun("UPDATE site_users SET denied=1 WHERE discord_id=?", APPLICANT);
  readResult = await readSecret(readCtx);
  check("denial after role context is still refused by payload Native standing fence", readResult === context.FENCE_REFUSED);
  await fixtureRun("UPDATE site_users SET denied=0 WHERE discord_id=?", APPLICANT);
  readCtx = await roleContext();
  await fixtureRun("INSERT INTO members(discord_id,banned) VALUES(?,1)", APPLICANT);
  readResult = await readSecret(readCtx);
  check("a ban after role context still withholds private data", readResult === context.FENCE_REFUSED);
  await fixtureRun("DELETE FROM members WHERE discord_id=?", APPLICANT);
  roleCalls = [];
  for (const route of ["/api/community/directory", "/api/community/profile", "/api/community/crafting?profession=alchemy", "/api/community/events", "/api/community/attendance/me", "/api/leadership"]) {
    const got = await indexMod.default.fetch(req("https://guild.example" + route, cookieV1), rawEnv(roleVars), ctx), body = await got.json();
    check("fresh role reader receives pure GET " + route, got.status === 200 && !body.error, got.status, body.error);
  }

  const oldNewsSwitch = one("SELECT * FROM site_settings WHERE key='newsOn'");
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('newsOn','1',?,NULL) ON CONFLICT(key) DO UPDATE SET value='1'", T);
  for (const id of [APPLICANT, STAFF]) {
    const got = await indexMod.default.fetch(req("https://guild.example/api/news", await cookieFor(id)), rawEnv(roleVars), ctx), body = await got.json();
    check("Community News admits current " + (id === STAFF ? "staff" : "Guild Member role") + " without a roster character", got.status === 200 && Array.isArray(body.notices), got.status, body.error);
  }
  await fixtureRun("UPDATE site_settings SET value='0' WHERE key='newsOn'");
  const offNews = await indexMod.default.fetch(req("https://guild.example/api/news", cookieV1), rawEnv(roleVars), ctx);
  check("new reader authority never switches on disabled Guild News", offNews.status === 404 && (await offNews.json()).error === "news_off");
  if (oldNewsSwitch) await fixtureRun("UPDATE site_settings SET value=?,updated_at=?,updated_by=? WHERE key='newsOn'", oldNewsSwitch.value, oldNewsSwitch.updated_at, oldNewsSwitch.updated_by);
  else await fixtureRun("DELETE FROM site_settings WHERE key='newsOn'");

  const headers = { "X-Olympus": "2", Origin: "https://guild.example", "Content-Type": "application/json" };
  for (const [method, route, body] of [["PUT", "/api/community/profile", { revision: 0 }], ["PUT", "/api/community/events/rsvp", {}], ["POST", "/api/community/events", {}], ["POST", "/api/community/census/preview", {}]]) {
    const got = await indexMod.default.fetch(req("https://guild.example" + route, cookieV1, { method, headers, body: JSON.stringify(body) }), rawEnv({ ...roleVars, COMMUNITY_FEATURES: roleVars.COMMUNITY_FEATURES + ",census" }), ctx), response = await got.json();
    check("read-only role access never admits original write/preview " + route, got.status === 403 && response.error === "guild_unconfirmed", got.status, response.error);
  }
  roleAnswer = () => ({ fixtureHttpStatus: 404 });
  const refusalRead = await context.communityReadRefusal(env(roleVars), req("https://guild.example/x", cookieV1));
  check("read-only refusal uses distinct community_unconfirmed without changing roster write refusal", refusalRead.status === 403 && (await refusalRead.json()).error === "community_unconfirmed");
  REST = async () => { throw new Error("no REST in tests"); };
  HTTP = async (url) => { throw new Error("no network in tests: " + url); };

  console.log("\n== the write fence ==");
  const realNow = () => Math.floor(RealDate.now() / 1000);
  const fenced = (id, version, cap, ref, expires = originalCookies.get(id).session.e) => [
    // a first statement admitted by the fence: here the member's ref row, with the fence's three binds at ?1, ?2 and ?5
    env().DB.prepare(`INSERT INTO community_refs (discord_id, ref, created_at) SELECT ?1, ?3, ?4 WHERE ${context.fenceSql(cap, 1, 2, 5, originalCookies.get(id).session.g, originalCookies.get(id).session.n)} ON CONFLICT(discord_id) DO NOTHING`).bind(id, version, ref, T, expires),
  ];
  const contextFor = async (id, version = 1) => context.communityContext(env(), req("https://guild.example/x", await cookieFor(id, version)));
  let c = await contextFor(APPLICANT);
  let out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "A".repeat(22)));
  check("an applicant's first write is admitted and lands", out !== context.FENCE_REFUSED && one("SELECT ref FROM community_refs WHERE discord_id = ?", APPLICANT).ref === "A".repeat(22));
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "confirmedGuildData", "B".repeat(22)));
  check("the same applicant is refused a guild-data write (no roster-confirmed character)", out === context.FENCE_REFUSED);
  res = await context.refusal(env(), req("https://guild.example/x", await cookieFor(APPLICANT)), "confirmedGuildData");
  check("  and the refusal says guild_unconfirmed (403)", res.status === 403 && (await res.json()).error === "guild_unconfirmed");
  c = await contextFor(MEMBER);
  out = await context.admitted(env(), c, fenced(MEMBER, 1, "confirmedGuildData", "C".repeat(22)));
  check("a confirmed member's guild-data write is admitted", out !== context.FENCE_REFUSED && one("SELECT ref FROM community_refs WHERE discord_id = ?", MEMBER).ref === "C".repeat(22));
  await fixtureRun("DELETE FROM community_refs");
  // Known native SQLite abort is distinct from FENCE_REFUSED; transport uncertainty must propagate.
  const NATIVE_REFUSED = Symbol("known native SQLite guard refusal");
  const nativeAdmitted = async (...args) => {
    try { return await context.admitted(...args); }
    catch (e) { if (!/malformed JSON/.test(String(e))) throw e; return NATIVE_REFUSED; }
  };
  // the facts change between the context read and the write: each one refuses inside the statement
  const after = async (id, mutate, cap, label) => {
    const cx = await contextFor(id);
    mutate();
    const r = await nativeAdmitted(env(), cx, fenced(id, 1, cap, "D".repeat(22)));
    const why = await context.refusal(env(), req("https://guild.example/x", await cookieFor(id)), cap);
    const body = await why.json();
    check(label, (r === context.FENCE_REFUSED || r === NATIVE_REFUSED) && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", id), r === context.FENCE_REFUSED || r === NATIVE_REFUSED, JSON.stringify(body));
    return body;
  };
  let b = await after(APPLICANT, async () => await fixtureRun("UPDATE site_users SET session_version = 2 WHERE discord_id = ?",APPLICANT), "applicantWrite", "signed out between the read and the write: refused in the statement");
  check("  answered signed_out", b.error === "signed_out");
  await fixtureRun("UPDATE site_users SET session_version = 1 WHERE discord_id = ?",APPLICANT);
  b = await after(APPLICANT, async () => await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",APPLICANT), "applicantWrite", "denied between the read and the write: refused");
  check("  answered denied", b.error === "denied");
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",APPLICANT);
  b = await after(APPLICANT, async () => await fixtureRun("UPDATE site_users SET in_server = 0 WHERE discord_id = ?",APPLICANT), "applicantWrite", "left the server between the read and the write: refused");
  check("  answered not_member", b.error === "not_member");
  await fixtureRun("UPDATE site_users SET in_server = 1 WHERE discord_id = ?",APPLICANT);
  b = await after(MEMBER, async () => await fixtureRun("UPDATE characters SET status = 'left' WHERE discord_id = ?",MEMBER), "confirmedGuildData", "the character left the roster between the read and the write: refused");
  check("  answered guild_unconfirmed", b.error === "guild_unconfirmed");
  await fixtureRun("UPDATE characters SET status = 'member' WHERE discord_id = ?",MEMBER);
  b = await after(MEMBER, async () => await fixtureRun("UPDATE members SET banned = 1 WHERE discord_id = ?",MEMBER), "confirmedGuildData", "banned between the read and the write: refused");
  check("  answered guild_unconfirmed too (a ban is not announced as such to the member)", b.error === "guild_unconfirmed");
  await fixtureRun("UPDATE members SET banned = 0 WHERE discord_id = ?",MEMBER);
  c = await contextFor(APPLICANT);
  const before = statements;
  T += 8 * 86400; // the cookie's seven days are over
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "E".repeat(22)));
  check("an expired session is refused before any SQL runs", out === context.FENCE_REFUSED && statements === before);
  T -= 8 * 86400;
  // Codex's .56 review (01:50): the code check happened before the batch; a session expiring between that check and the
  // first SQL still committed. The fence now carries the cookie expiry and compares it with the database's own clock
  // inside the statement. The test's JavaScript clock is frozen in September, so the precheck passes; the real clock
  // in SQLite is what refuses.
  c = await contextFor(APPLICANT);
  const originalExpiry=c.subject.expiresAt;
  SQL_TIME=originalExpiry+60;
  out=await nativeAdmitted(env(),c,fenced(APPLICANT,1,'applicantWrite','X'.repeat(22),originalExpiry));
  check('a session that expired by the time first SQL runs is refused INSIDE the statement by the database clock',(out===context.FENCE_REFUSED||out===NATIVE_REFUSED)&&!one('SELECT 1 FROM community_refs WHERE ref=?','X'.repeat(22)));
  SQL_TIME=originalExpiry-60;
  out=await context.admitted(env(),c,fenced(APPLICANT,1,'applicantWrite','Y'.repeat(22),originalExpiry));
  SQL_TIME=null;
  check('the same original session still valid at that Native instant is admitted',out!==context.FENCE_REFUSED&&!!one('SELECT 1 FROM community_refs WHERE ref=?','Y'.repeat(22)));
  await fixtureRun("DELETE FROM community_refs WHERE discord_id = ?",APPLICANT);
  check("  the fence SQL names the database clock, not a bound time", /strftime\('%s', 'now'\)/.test(context.fenceSql("applicantWrite", 1, 2, 3, originalCookies.get(APPLICANT).session.g, originalCookies.get(APPLICANT).session.n)) && context.DB_NOW.includes("strftime"));
  c = await contextFor(APPLICANT);
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "F".repeat(22)));
  out = await context.admitted(env(), c, fenced(APPLICANT, 1, "applicantWrite", "G".repeat(22)));
  check("a write whose first statement changes nothing although the facts hold (the ON CONFLICT no-op here, a lost compare-and-set in a feature) is refused", out === context.FENCE_REFUSED);
  res = await context.refusal(env(), req("https://guild.example/x", await cookieFor(APPLICANT)), "applicantWrite");
  check("  and answered as conflict (409), since nothing about the member explains it", res.status === 409 && (await res.json()).error === "conflict");
  check("an empty batch is refused", (await context.admitted(env(), c, [])) === context.FENCE_REFUSED);
  check("randomToken is 22 base64url characters and not repeated", /^[A-Za-z0-9_-]{22}$/.test(context.randomToken()) && context.randomToken() !== context.randomToken());

  console.log("\n== erasure and export through the registry ==");
  check("refs registered itself", context.communityDataNames().includes("refs"));
  const exported = await context.communityExport(env(), APPLICANT);
  check("the export carries the member's ref", exported.refs && exported.refs.ref === "F".repeat(22));
  const deleted = await deleteThroughOriginalRoute(APPLICANT, STAFF);
  check("deleteSiteData removes the community rows in its own batch", deleted === true && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", APPLICANT) && !one("SELECT 1 FROM site_users WHERE discord_id = ?", APPLICANT));
  await fixtureRun("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?) ON CONFLICT(discord_id) DO NOTHING",MEMBER,"M".repeat(22),T);
  await deleteThroughOriginalRoute(DENIED, STAFF);
  check("  and leaves other members' rows (another account's deletion does not touch this ref)", !!one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER));
  check("refOf answers null afterwards", (await refs.refOf(env(), APPLICANT)) === null);

  console.log("\n== time at the boundary ==");
  check("seconds to milliseconds is exact", time.secondsToMs(1790500000) === 1790500000000);
  check("milliseconds to seconds refuses a subsecond value without a policy", (() => { try { time.msToSeconds(1790500000500); return false; } catch (e) { return e instanceof RangeError; } })());
  check("  floor and ceil are explicit", time.msToSeconds(1790500000500, "floor") === 1790500000 && time.msToSeconds(1790500000500, "ceil") === 1790500001);
  check("  an unknown rounding option is refused before the value is read (Codex's helper-seam note)", (() => { try { time.msToSeconds(1790500000000, "round"); return false; } catch (e) { return e instanceof RangeError && /unsupported_rounding/.test(e.message); } })());
  check("  negatives, non-integers and absurd values are refused", ["-1", "1.5", "big"].every((k) => { try { time.msToSeconds(k === "-1" ? -1 : k === "1.5" ? 1.5 : time.MAX_DATE_MS + 1000); return false; } catch (e) { return e instanceof RangeError; } }));
  check("ISO round trip", time.secondsToIso(1790500000) === "2026-09-27T09:06:40.000Z" && time.isoToSeconds("2026-09-27T09:06:40Z") === 1790500000);
  check("  a subsecond ISO needs a policy", (() => { try { time.isoToSeconds("2026-09-27T09:06:40.250Z"); return false; } catch (e) { return e instanceof RangeError; } })() && time.isoToSeconds("2026-09-27T09:06:40.250Z", "floor") === 1790500000);
  const proj = time.projectSeconds({ created_at: 1790500000, updated_at: null, name: "x" }, ["created_at", "updated_at", "missing"]);
  check("projection converts only the named own fields; null stays null; missing stays missing", proj.created_at === "2026-09-27T09:06:40.000Z" && proj.updated_at === null && !("missing" in proj) && !("name" in proj));

  console.log("\n== character identity: two keys, and a binding that is proven, unproven or a conflict (Codex 01:19) ==");
  const a = names.validateName("Anne-Marie Smith"), bN = names.validateName("Anne-Beth Smith");
  check("two distinct hyphenated full names share the keeper's proof key but never the community key", a.ok && bN.ok && a.proofKey === "anne" && bN.proofKey === "anne" && a.key === "anne-marie smith" && bN.key === "anne-beth smith" && a.key !== bN.key);
  check("the community key keeps non-ASCII capitals, collapses spaces and applies NFC", names.communityKey("  Ðismas   Ðanero ") === "Ðismas Ðanero".replace("Ð", "Ð") && names.communityKey("Fern   Melder") === "fern melder" && names.communityKey("Ame\u0301lie") === names.communityKey("Am\u00e9lie"));
  check("validation: shape, length, type", !names.validateName("x").ok && !names.validateName("Anne--Marie").ok && !names.validateName("-Anne").ok && !names.validateName(42).ok && !names.validateName("A".repeat(41)).ok && names.validateName("O'Neil Smith").ok);
  // the keeper holds one proof row under the truncated key: "Anne-Marie Smith" bound to MEMBER
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES ('anne', 'Anne-Marie Smith', ?, 'member', ?, 'Player-1-AAAA')",MEMBER,T);
  let r = await names.resolveCharacter(env(), MEMBER, "Anne-Marie Smith");
  check("the owner's claim of the stored full name is proven, with the GUID", r.state === "proven" && r.guid === "Player-1-AAAA" && r.proofKey === "anne");
  r = await names.resolveCharacter(env(), MEMBER, "Anne-Beth Smith");
  check("the same owner's claim of the OTHER full name sharing the proof key is a conflict (name_mismatch), not proven and not silently merged", r.state === "conflict" && r.reason === "name_mismatch");
  r = await names.resolveCharacter(env(), APPLICANT, "Anne-Marie Smith");
  check("another account's claim of a bound name is a conflict (other_account)", r.state === "conflict" && r.reason === "other_account");
  r = await names.resolveCharacter(env(), MEMBER, "Nobody Here");
  check("a name the keeper has never seen is unproven: a label, never proof", r.state === "unproven" && r.proofKey === "nobody here");
  await fixtureRun("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING",APPLICANT);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES ('twin', 'Twin Name', ?, 'member', ?, 'Player-1-AAAA')",APPLICANT,T);
  r = await names.resolveCharacter(env(), MEMBER, "Anne-Marie Smith");
  check("a GUID that another account's row also carries makes even the owner's claim a conflict (guid_other_account)", r.state === "conflict" && r.reason === "guid_other_account");
  check("the keeper's proof key itself is unchanged (codes.ts still cuts at the first hyphen; existing bindings keep their bytes)", load("./codes").normalizeCharacter("Anne-Marie Smith") === "anne");

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

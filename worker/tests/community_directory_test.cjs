// Build .57 (1 Oct 2026): the member directory and crafting offers (consolidation batch 2), through the REAL src/*.ts
// against the REAL schema in SQLite; Discord's HTTP side is stubbed. Covers the feature flags, the guild-only gate, the
// own profile, saves with the revision compare-and-set, every field's validation, names resolved against the keeper's
// proof (proven, self, conflict refused), the whole-set replacement of professions/alts/crafts, the unchanged save, the
// listing (visibility at read time, order, the digest cursor going stale on a rename, v1 and garbage cursors), the
// directory-full refusal, the crafting search (filters, literal wildcards, cursor bound to its query), the staff review
// (pending claims, conflicts, decisions, own_record, stale_revision), erasure through deleteSiteData, the export, and
// the 30-day departure clock; .72: every payload (the four reads, the pre-write state, a lost compare-and-set, after a
// committed save) under the reader's admission. Run from the worker folder:  node tests/community_directory_test.cjs
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
let nativeTimeOverride = null;
let nativeStatementAttempts = 0;
function d1(db, hooks = {}) {
  let batches = 0;
  // Arm the existing races at the actual community payload boundary, after
  // authentication. Every physical guard remains in nativeTrace/nativeGroups.
  const payloadBatch = plan => plan.some(s => s.statement.includes("privacy_community_request_refused") || /^SELECT \(EXISTS\(SELECT 1 FROM site_users fu/.test(s.statement));
  return entry.originalNativePort(db, {...hooks,
    statement: () => { nativeStatementAttempts++; },
    beforeBatch: (plan) => payloadBatch(plan) ? hooks.beforeBatch?.(++batches, plan) : undefined,
    afterBatch: (plan) => payloadBatch(plan) ? hooks.afterBatch?.(batches, plan) : undefined,
  });
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.function('strftime', (format,input) => {
    if (format !== '%s' || input !== 'now') throw Error('unexpected Native clock input');
    return String(nativeTimeOverride === null ? T : nativeTimeOverride);
  });
  entry.installCurrentEntryEpoch(db,{now:T});
  return db;
}
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let LOGS = [];
globalThis.fetch = async (url) => { throw new Error("no network in tests: " + url); };
const stubs = {};
const cache = {};
function load(name) {
  if (name === "node:async_hooks") return require(name);
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
    rest: async () => { throw new Error("no REST in tests"); },
    explainDiscordError: (e) => String(e),
  },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const context = load("./community-context"), refs = load("./community-refs"), time = load("./community-time"), names = load("./community-names");
const siteCore = load("./site-core"), siteAdmin = load("./site-admin"), indexMod = load("./index");

let db = freshDb();
let statements = 0;
let BEFORE = null, AFTER = null; // .72: armed by the reader-admission section, each fires once
const env = (over = {}) => entry.currentEntryEnvironment({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i) => AFTER?.(i) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const APPLICANT = "300000000000000001", MEMBER = "300000000000000002", MEMBER2 = "300000000000000003", BANNED = "300000000000000004", STAFF = "472099715253796864";
const siteUser = async (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, ...over };
  await fixtureRun("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",id,row.username,row.global_name,row.nick,T,T,row.in_server,row.denied,row.session_version);
};
const confirm = async (id, name, guid = null) => {
  await fixtureRun("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING",id);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?, ?, ?, 'member', ?, ?)",name.toLowerCase().split("-")[0],name,id,T,guid);
};
const ON = { COMMUNITY_FEATURES: "directory,crafting" };
// Normal feature requests need a session current to both the actor and the real SQL clock.
function directEnv(over = ON) {
  const e=env(over);
  return {...e,DB:load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(e.DB,'writer','canonical',entry.ENTRY_EPOCH)};
}
async function fixtureRun(sql,...params) {
 const raw=entry.originalNativePort(db);
 const admitted=load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(raw,'writer','canonical',entry.ENTRY_EPOCH);
 return admitted.prepare(sql).bind(...params).run();
}
const originalCookies = new Map();
const cookieFor = async (id) => {
  const row = db.prepare('SELECT session_version,account_incarnation FROM site_users WHERE discord_id=?').get(id);
  const old = originalCookies.get(id);
  if (old && (!row || old.session.v === row.session_version && old.session.n === row.account_incarnation) && old.session.e > T) return old.cookie;
  const issued = await entry.issueOriginalEntryCookie(name => load('./'+name),db,env(),id);
  originalCookies.set(id,issued);
  return issued.cookie;
};
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);

// Exercise the actual staff preparation and delete route; no manufactured session/origin.
async function deleteThroughOriginalRoute(target, actor) {
  const prepared=await call('GET','/api/admin/users/'+target+'/decision-target?route=delete&decisionAction=partial_delete',actor);
  if(prepared.status!==200 || typeof prepared.body.targetToken!=='string')throw Error('original delete target preparation held '+prepared.status);
  const result=await call('POST','/api/admin/users/'+target+'/delete',actor,{mentions:false},ON,{'X-Olympus-Decision-Target':prepared.body.targetToken,'X-Olympus-Decision-Action':'partial_delete'});
  if(result.status!==200)throw Error('original delete route held '+result.status+' '+JSON.stringify(result.body));
  return result.body.ok === true;
}
(async () => {
  await siteUser(APPLICANT); await siteUser(MEMBER, { global_name: "Fern" }); await confirm(MEMBER, "Fern Melder", "Player-1-0001"); await siteUser(MEMBER2, { global_name: "Bea" }); await confirm(MEMBER2, "Bea Stormer", "Player-1-0002");
  await siteUser(BANNED); await confirm(BANNED, "Bad Actor"); await fixtureRun("UPDATE members SET banned = 1 WHERE discord_id = ?",BANNED); await siteUser(STAFF);

  console.log("\n== cookie issuance and the genuine database clock ==");
  const clockActor = T, clockRealBefore = Math.floor(RealDate.now() / 1000);
  const clockCookie = await cookieFor(MEMBER);
  const clockEnv = directEnv(ON);
  const clockRequest = new Request("https://guild.example/clock-fixture", { headers: { Cookie: clockCookie } });
  const clockSession = await siteCore.readSession(clockEnv, clockRequest);
  check("sole original PROFILE issuer retains Native birth, generation and seven-day session", T === clockActor && clockSession?.u === MEMBER && clockSession.v === 1 && clockSession.e === clockActor + 7 * 86400 && /^[0-9a-f]{32}$/.test(clockSession.n) && /^[0-9a-f]{32}$/.test(clockSession.g));
  const clockContext = await context.communityContext(clockEnv, clockRequest);
  const clockBeforeRead = statements;
  const clockRead = await context.admittedRead(clockEnv, clockContext, "confirmedGuildData", [clockEnv.DB.prepare("SELECT 1 AS marker")]);
  check("a freshly signed feature session reaches one genuine SQLite admission batch and releases the read payload", T === clockActor && statements === clockBeforeRead + 1 && clockRead !== context.FENCE_REFUSED && clockRead[0]?.results[0]?.marker === 1);
  // The genuinely issued cookie remains valid to the browser's original clock,
  // while the existing Native clock seam advances past its ORIGINAL expiry.
  nativeTimeOverride = clockSession.e + 60;
  const clockExpiredRequest = new Request('https://guild.example/clock-fixture', {headers:{Cookie:clockCookie}});
  const stillSigned = await siteCore.readSession(clockEnv,clockExpiredRequest);
  const clockExpiredContext = await context.communityContext(clockEnv,clockExpiredRequest);
  const clockBeforeExpiredRead = statements;
  const clockExpiredRead = await context.admittedRead(clockEnv,clockExpiredContext,'confirmedGuildData',[clockEnv.DB.prepare('SELECT 1 AS marker')]);
  check('browser-valid original cookie expired to Native is refused by the actual Native payload fence', T === clockActor && stillSigned?.e === clockSession.e && clockExpiredContext.capabilities.confirmedGuildData && statements === clockBeforeExpiredRead + 1 && clockExpiredRead === context.FENCE_REFUSED, {signed:!!stillSigned,cap:clockExpiredContext.capabilities.confirmedGuildData,before:clockBeforeExpiredRead,after:statements,held:clockExpiredRead === context.FENCE_REFUSED});
  nativeTimeOverride = null;
  console.log("\n== flags and the guild-only gate ==");
  let r = await call("GET", "/api/community/profile", MEMBER, undefined, { COMMUNITY_FEATURES: "" });
  check("with the directory off the routes answer 503 feature_disabled", r.status === 503 && r.body.error === "feature_disabled");
  r = await call("GET", "/api/community/directory", APPLICANT);
  check("an applicant (no roster-confirmed character) is refused the directory: community_unconfirmed", r.status === 403 && r.body.error === "community_unconfirmed");
  r = await call("GET", "/api/community/profile", BANNED);
  check("  a banned account too", r.status === 403 && r.body.error === "community_unconfirmed");
  r = await call("GET", "/api/community/profile", MEMBER);
  check("a confirmed member reads an empty own profile with the limits", r.status === 200 && r.body.profile.revision === 0 && r.body.profile.ref === null && r.body.limits.maxAlts === 10 && r.body.limits.professions.length === 12, JSON.stringify(r.body).slice(0, 200));

  console.log("\n== the save ==");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 0, listed: true, main: "Fern Melder", raidRole: "healer", professions: [{ name: "alchemy", skill: 300 }, { name: "herbalism" }], alts: ["Fern Alt"] });
  check("the first save creates the profile at revision 1", r.status === 200 && r.body.profile.revision === 1 && r.body.profile.listed === true, JSON.stringify(r.body).slice(0, 300));
  check("  the main the keeper confirmed for this account is recorded as proven by the keeper", r.body.profile.main.name === "Fern Melder" && r.body.profile.main.source === "keeper");
  check("  the alt the keeper never saw is a self label, claimed and unreviewed", r.body.profile.alts.length === 1 && r.body.profile.alts[0].proof === "self" && r.body.profile.alts[0].status === "claimed");
  check("  professions are ordered by the canonical list, skill null when not given", r.body.profile.professions.map((p) => p.name).join(",") === "alchemy,herbalism" && r.body.profile.professions[1].skill === null);
  check("  the member's ref exists in community_refs and on the profile, 22 characters", /^[A-Za-z0-9_-]{22}$/.test(r.body.profile.ref) && one("SELECT ref FROM community_refs WHERE discord_id = ?", MEMBER).ref === r.body.profile.ref);
  check("  audited as community.profile_created with field names only", JSON.parse(one("SELECT details FROM audit WHERE action = 'community.profile_created' AND actor = ?", MEMBER).details).fields.includes("main") && !one("SELECT 1 FROM audit WHERE details LIKE '%Fern Melder%'"));
  const ref1 = r.body.profile.ref;
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 0, listed: false });
  check("a stale revision is 409 with the current profile", r.status === 409 && r.body.error === "stale_revision" && r.body.profile.revision === 1);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 1, main: "Fern Melder", raidRole: "healer" });
  check("a save that changes nothing writes nothing and says so", r.status === 200 && r.body.unchanged === true && r.body.profile.revision === 1);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 1, alts: ["Bea Stormer"] });
  check("claiming a character bound to ANOTHER account is refused: 409 name_conflict naming it, nothing written", r.status === 409 && r.body.error === "name_conflict" && r.body.names[0] === "Bea Stormer" && one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER).revision === 1);
  check("  and audited with a count, not the name", !!one("SELECT 1 FROM audit WHERE action = 'community.name_conflict' AND actor = ?", MEMBER) && !one("SELECT 1 FROM audit WHERE action = 'community.name_conflict' AND details LIKE '%Bea%'"));
  // the keeper holds "Anne-Marie Smith" for this account under the proof key "anne" (its first-hyphen cut); the other full name sharing that key is not that character
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES ('anne', 'Anne-Marie Smith', ?, 'member', ?, 'Player-1-0009')",MEMBER,T);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 1, main: "Anne-Beth Smith" });
  check("a different full name under the keeper's proof key is a conflict too (name_mismatch), never silently merged", r.status === 409 && r.body.error === "name_conflict" && one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER).revision === 1, JSON.stringify(r.body));
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 1, alts: ["Fern Alt", "Anne-Marie Smith"] });
  check("  while the exact stored full name is proven by the keeper as an alt", r.status === 200 && r.body.profile.alts.find((a) => a.name === "Anne-Marie Smith").proof === "keeper" && r.body.profile.revision === 2, JSON.stringify(r.body).slice(0, 300));
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 2, alts: ["Fern Alt"] });
  check("  and dropping it again is revision 3", r.status === 200 && r.body.profile.revision === 3);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, main: "Fern Alt" });
  check("a main that is also one of the member's alts is invalid_main", r.status === 400 && r.body.error === "invalid_main");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, professions: [{ name: "alchemy" }, { name: "mining" }, { name: "skinning" }, { name: "cooking" }, { name: "fishing" }] });
  check("five professions are invalid_professions", r.status === 400 && r.body.error === "invalid_professions");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, professions: [{ name: "alchemy", skill: 451 }] });
  check("  as is a skill over 450", r.status === 400 && r.body.error === "invalid_professions");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, bogus: 1 });
  check("an unknown field is invalid_request", r.status === 400 && r.body.error === "invalid_request");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, raidRole: "dps" });
  check("an unknown raid role is invalid_raid_role", r.status === 400 && r.body.error === "invalid_raid_role");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, alts: ["A", "Bad--Name"] });
  check("a bad alt name is invalid_alts", r.status === 400 && r.body.error === "invalid_alts");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }] }, { COMMUNITY_FEATURES: "directory" });
  check("crafts while crafting is off: the whole request is 503 feature_disabled, nothing written", r.status === 503 && r.body.error === "feature_disabled" && one("SELECT COUNT(*) AS n FROM community_craft_offers").n === 0);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }, { profession: "cooking", recipe: "elixir  of fortitude" }] });
  check("two offers with one recipe key across professions are invalid_crafts", r.status === 400 && r.body.error === "invalid_crafts");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 3, crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }, { profession: "tailoring", recipe: "Runecloth Bag" }] });
  check("crafts are saved as part of the profile (revision 2), ordered by key", r.status === 200 && r.body.profile.revision === 4 && r.body.profile.crafts.map((c) => c.recipe).join("|") === "Elixir of Fortitude|Runecloth Bag");
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 4, professions: [{ name: "alchemy", skill: 300 }] });
  check("replacing the profession set keeps the unchanged row's time and drops the rest", r.status === 200 && r.body.profile.professions.length === 1 && one("SELECT COUNT(*) AS n FROM community_professions WHERE discord_id = ?", MEMBER).n === 1);
  r = await call("PUT", "/api/community/profile", MEMBER, { revision: 5, listed: true }, ON, { "X-Olympus": "1" });
  check("a page from before the current version is told to reload", r.status === 409 && r.body.error === "reload");

  console.log("\n== the listing ==");
  r = await call("GET", "/api/community/directory", MEMBER2);
  check("another confirmed member sees the listed profile by ref and display name, never a Discord id", r.status === 200 && r.body.members.length === 1 && r.body.members[0].ref === ref1 && r.body.members[0].displayName === "Fern" && !JSON.stringify(r.body).includes(MEMBER) && r.body.counts.listed === 1, JSON.stringify(r.body).slice(0, 300));
  check("  the listed member's crafts ride along while crafting is on, alts without their reviewer", r.body.members[0].crafts.length === 2 && r.body.members[0].alts.length === 1 && !("reviewedBy" in r.body.members[0].alts[0]));
  r = await call("GET", "/api/community/directory", MEMBER2, undefined, { COMMUNITY_FEATURES: "directory" });
  check("  with crafting off the listing carries no crafts", r.body.members[0].crafts.length === 0);
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: 0, listed: true, main: "Bea Stormer" });
  check("a second member lists", r.status === 200);
  await fixtureRun("UPDATE characters SET status = 'left' WHERE discord_id = ?",MEMBER2);
  r = await call("GET", "/api/community/directory", MEMBER);
  check("a listed member whose character left the roster disappears from the listing at read time", r.body.members.length === 1 && r.body.members[0].ref === ref1 && r.body.counts.listed === 1);
  await fixtureRun("UPDATE characters SET status = 'member' WHERE discord_id = ?",MEMBER2);
  r = await call("GET", "/api/community/directory", MEMBER);
  check("  and is back once the roster has them again; order is by display name (Bea before Fern)", r.body.members.length === 2 && r.body.members[0].displayName === "Bea");
  // paging: force a page of one with a tiny PAGE... the page size is a constant (100), so paging is exercised through the cursor contract
  const stale = await indexMod.default.fetch(new Request("https://guild.example/api/community/directory?cursor=" + Buffer.from(JSON.stringify(["Bea", ref1])).toString("base64url"), { headers: { Cookie: await cookieFor(MEMBER) } }), env(ON), ctx);
  check("a v1-shaped cursor (an older page) is 409 cursor_stale", stale.status === 409 && (await stale.json()).error === "cursor_stale");
  const garbage = await indexMod.default.fetch(new Request("https://guild.example/api/community/directory?cursor=not*valid", { headers: { Cookie: await cookieFor(MEMBER) } }), env(ON), ctx);
  check("  garbage is 400 invalid_cursor", garbage.status === 400);
  const dir = load("./community-directory");
  const digestNow = await dir.orderDigest([["Bea", one("SELECT ref FROM community_profiles WHERE discord_id = ?", MEMBER2).ref], ["Fern", ref1]]);
  const wrongDigest = await indexMod.default.fetch(new Request("https://guild.example/api/community/directory?cursor=" + dir.encodeCursor([2, "directory", "0".repeat(32), "Bea", ref1]), { headers: { Cookie: await cookieFor(MEMBER) } }), env(ON), ctx);
  check("a v2 cursor whose digest is not the current order's is 409 cursor_stale (a rename, an unlisting or a departure happened)", wrongDigest.status === 409);
  const rightDigest = await indexMod.default.fetch(new Request("https://guild.example/api/community/directory?cursor=" + dir.encodeCursor([2, "directory", digestNow, "Bea", one("SELECT ref FROM community_profiles WHERE discord_id = ?", MEMBER2).ref]), { headers: { Cookie: await cookieFor(MEMBER) } }), env(ON), ctx);
  const rd = await rightDigest.json();
  check("  the current digest continues after the given row", rightDigest.status === 200 && rd.members.length === 1 && rd.members[0].displayName === "Fern");

  console.log("\n== the directory is full (HL-1) ==");
  await siteUser("300000000000000010", { global_name: "Cal" }); await confirm("300000000000000010", "Cal Third");
  r = await call("PUT", "/api/community/profile", "300000000000000010", { revision: 0, listed: true, raidRole: "tank" }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "2" });
  check("with two listed profiles and a limit of two, a third listing is 409 directory_full, and the profile IS saved unlisted with everything else (.64)", r.status === 409 && r.body.error === "directory_full" && r.body.saved === true && r.body.profile.listed === false && r.body.profile.raidRole.value === "tank" && one("SELECT listed FROM community_profiles WHERE discord_id = '300000000000000010'").listed === 0, JSON.stringify(r.body).slice(0, 300));
  check("  the audit row says listing was asked for and the statement left it unlisted", JSON.parse(one("SELECT details FROM audit WHERE action = 'community.profile_created' AND subject = '300000000000000010'").details).listed === 0);
  r = await call("PUT", "/api/community/profile", "300000000000000010", { revision: 1, listed: true, raidRole: "healer" }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "2" });
  check("  an existing unlisted profile asking to list at the limit: the other edits are committed, the listing refused", r.status === 409 && r.body.error === "directory_full" && r.body.saved === true && r.body.profile.raidRole.value === "healer" && r.body.profile.revision === 2 && one("SELECT listed FROM community_profiles WHERE discord_id = '300000000000000010'").listed === 0);
  r = await call("PUT", "/api/community/profile", "300000000000000010", { revision: 2, listed: false }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "2" });
  check("  the same save unlisted is accepted (unchanged: it already is)", r.status === 200 && r.body.profile.listed === false && r.body.unchanged === true && r.body.profile.revision === 2);
  r = await call("PUT", "/api/community/profile", "300000000000000010", { revision: 2, listed: true }, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "3" });
  check("  with room, listing succeeds", r.status === 200 && r.body.profile.listed === true && r.body.profile.revision === 3, JSON.stringify(r.body).slice(0, 200));
  r = await call("PUT", "/api/community/profile", "300000000000000010", { revision: 3, listed: false });
  check("  (and is undone for the rest of the suite)", r.status === 200 && r.body.profile.listed === false);
  r = await call("GET", "/api/community/directory", MEMBER, undefined, { ...ON, COMMUNITY_DIRECTORY_LIMIT: "1" });
  check("a read over the limit fails closed (503 directory_too_large) instead of showing part of the guild", r.status === 503 && r.body.error === "directory_too_large");

  console.log("\n== crafting search ==");
  r = await call("GET", "/api/community/crafting?q=fort", MEMBER2);
  check("a substring of the recipe key matches; the crafter is the ref and display name", r.status === 200 && r.body.results.length === 1 && r.body.results[0].recipe === "Elixir of Fortitude" && r.body.results[0].crafter.ref === ref1 && r.body.results[0].crafter.displayName === "Fern");
  r = await call("GET", "/api/community/crafting?q=%25", MEMBER2);
  check("% is a literal character, not a wildcard (no match), and one character is invalid_q", r.status === 400 && r.body.error === "invalid_q");
  r = await call("GET", "/api/community/crafting?q=rune%25", MEMBER2);
  check("  'rune%' matches nothing (the % is literal)", r.status === 200 && r.body.results.length === 0);
  r = await call("GET", "/api/community/crafting?profession=tailoring", MEMBER2);
  check("a profession alone lists its offers", r.status === 200 && r.body.results.length === 1 && r.body.results[0].recipe === "Runecloth Bag");
  r = await call("GET", "/api/community/crafting", MEMBER2);
  check("neither q nor profession is invalid_query", r.status === 400 && r.body.error === "invalid_query");
  r = await call("GET", "/api/community/crafting?profession=jewelcrafting", MEMBER2);
  check("an unknown profession is invalid_profession", r.status === 400 && r.body.error === "invalid_profession");
  const craftCursor = async (parts) => indexMod.default.fetch(new Request("https://guild.example/api/community/crafting?q=fort&cursor=" + dir.encodeCursor(parts), { headers: { Cookie: await cookieFor(MEMBER2) } }), env(ON), ctx);
  const craftDigest = await dir.orderDigest([["Fern", ref1, one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER).revision]]);
  let cur = await craftCursor([2, "crafting", "other", null, craftDigest, "k", "n", ref1]);
  check("a cursor from another query is invalid_cursor", cur.status === 400);
  cur = await craftCursor([1, "crafting", "fort", null, "k", "n", ref1]);
  check("a .57-shaped crafting cursor (an older page) is 409 cursor_stale (.64)", cur.status === 409 && (await cur.json()).error === "cursor_stale");
  cur = await craftCursor([2, "crafting", "fort", null, "0".repeat(32), "elixir of fortitude", "Fern", ref1]);
  check("a cursor whose digest is not the visible order's (a rename, an edit, a departure) is 409 cursor_stale (D20, .64)", cur.status === 409 && (await cur.json()).error === "cursor_stale");
  cur = await craftCursor([2, "crafting", "fort", null, craftDigest, "elixir of fortitude", "Fern", ref1]);
  check("  the current digest continues after the given offer (nothing left here)", cur.status === 200 && (await cur.json()).results.length === 0);
  await fixtureRun("UPDATE site_users SET nick = 'Renamed' WHERE discord_id = ?",MEMBER);
  cur = await craftCursor([2, "crafting", "fort", null, craftDigest, "elixir of fortitude", "Fern", ref1]);
  check("  a display-name change between pages makes the cursor stale", cur.status === 409);
  await fixtureRun("UPDATE site_users SET nick = NULL WHERE discord_id = ?",MEMBER);
  await fixtureRun("UPDATE community_profiles SET listed = 0 WHERE discord_id = ?",MEMBER);
  r = await call("GET", "/api/community/crafting?q=fort", MEMBER2);
  check("an unlisted profile's offers vanish from the search", r.body.results.length === 0);
  await fixtureRun("UPDATE community_profiles SET listed = 1 WHERE discord_id = ?",MEMBER);
  await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",MEMBER);
  r = await call("GET", "/api/community/crafting?q=fort", MEMBER2);
  const dl = await call("GET", "/api/community/directory", MEMBER2);
  check("a denied owner's offers and profile are absent from the search and the listing: the payload statements judge eligibility themselves (.64)", r.body.results.length === 0 && dl.body.members.every((m) => m.ref !== ref1));
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",MEMBER);
  r = await call("GET", "/api/community/crafting?q=fort", MEMBER2, undefined, { COMMUNITY_FEATURES: "directory" });
  check("with crafting off the search is 503", r.status === 503);

  console.log("\n== staff review ==");
  r = await call("GET", "/api/admin/community/directory", MEMBER);
  check("a member is not staff: 403 from the site's admin gate", r.status === 403);
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: 1, alts: ["Fern Alt"] });
  check("a second account claims the same alt label (a label, so allowed; it becomes a conflict for staff)", r.status === 200);
  r = await call("GET", "/api/admin/community/directory", STAFF);
  check("staff see pending claims and the conflicting key, by ref and display name, never a Discord id", r.status === 200 && r.body.counts.pendingClaims === 2 && r.body.counts.conflictKeys === 1 && r.body.entries.every((e) => e.conflict === true) && !JSON.stringify(r.body).includes(MEMBER), JSON.stringify(r.body).slice(0, 300));
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref1, key: "fern alt", decision: "confirm", revision: 5 });
  check("a confirm decision moves the profile revision and returns the claim as its own batch wrote it", r.status === 200 && r.body.claim.status === "officer_confirmed" && r.body.revision === 6 && one("SELECT status, reviewed_by FROM community_alt_claims WHERE discord_id = ? AND name_key = 'fern alt'", MEMBER).reviewed_by === STAFF, JSON.stringify(r.body));
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref1, key: "fern alt", decision: "reject", revision: 5 });
  check("a decision on a stale revision is 409 stale_revision with the current one", r.status === 409 && r.body.error === "stale_revision" && r.body.revision === 6);
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref1, key: "nobody here", decision: "reject", revision: 6 });
  check("a claim that does not exist is 404 claim_not_found", r.status === 404 && r.body.error === "claim_not_found");
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: "A".repeat(22), key: "fern alt", decision: "reject", revision: 1 });
  check("an unknown ref is 404 profile_not_found", r.status === 404 && r.body.error === "profile_not_found");
  await confirm(STAFF, "Staff Char");
  r = await call("PUT", "/api/community/profile", STAFF, { revision: 0, alts: ["Staff Alt"] });
  const staffRef = r.body.profile.ref;
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: staffRef, key: "staff alt", decision: "confirm", revision: 1 });
  check("an admin never decides a claim on their own profile: 409 own_record", r.status === 409 && r.body.error === "own_record" && one("SELECT status FROM community_alt_claims WHERE discord_id = ?", STAFF).status === "claimed");
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref1, key: "Fern Alt", decision: "confirm", revision: 6 });
  check("a key that is not a community key is invalid_key", r.status === 400 && r.body.error === "invalid_key");

  console.log("\n== the staff fence on the review (.64, Codex's .59 directory review) ==");
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: 2, alts: ["Fern Alt", "Second Alt"] });
  check("(a second pending claim to decide on)", r.status === 200 && r.body.profile.revision === 3);
  const ref2 = r.body.profile.ref;
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref2, key: "second alt", decision: "confirm", revision: 3 }, ON, { "X-Olympus": "1" });
  check("a staff write from a page before the current version is told to reload, nothing written", r.status === 409 && r.body.error === "reload" && one("SELECT status FROM community_alt_claims WHERE discord_id = ? AND name_key = 'second alt'", MEMBER2).status === "claimed");
  await fixtureRun("UPDATE site_users SET in_server = 0 WHERE discord_id = ?",STAFF);
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref2, key: "second alt", decision: "confirm", revision: 3 });
  check("an admin who left the server is refused inside the first statement: 403 not_member, claim and revision unchanged, no reviewer recorded", r.status === 403 && r.body.error === "not_member" && one("SELECT status, reviewed_by FROM community_alt_claims WHERE discord_id = ? AND name_key = 'second alt'", MEMBER2).reviewed_by === null && one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER2).revision === 3);
  r = await call("GET", "/api/admin/community/directory", STAFF);
  check("  and the staff directory read is refused to them too: communityStaff is required of every community staff route (.66)", r.status === 403 && r.body.error === "not_member");
  await fixtureRun("UPDATE site_users SET in_server = 1, denied = 1 WHERE discord_id = ?",STAFF);
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref2, key: "second alt", decision: "confirm", revision: 3 });
  check("  a denied admin too: 403, nothing committed", r.status === 403 && one("SELECT status FROM community_alt_claims WHERE discord_id = ? AND name_key = 'second alt'", MEMBER2).status === "claimed" && !one("SELECT 1 FROM audit WHERE action = 'community.alt_confirmed' AND subject = ?", MEMBER2));
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",STAFF);
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: ref2, key: "second alt", decision: "confirm", revision: 3 });
  check("  the same decision by the admin in good standing is committed", r.status === 200 && r.body.claim.status === "officer_confirmed");

  console.log("\n== name facts re-stated at the write (.64) ==");
  // the member's resolution of "Ally Name" is a self label (no keeper row); before the statement runs, the keeper binds that proof key to ANOTHER account
  const beforeRev = one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER2).revision;
  const realResolve = names.resolveCharacter;
  let armed = true;
  names.resolveCharacter = async (e, did, claim) => { const res = await realResolve(e, did, claim); if (armed && claim === "Ally Name") { armed = false; await confirm("300000000000000077", "Ally Name"); } return res; };
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: beforeRev, alts: ["Fern Alt", "Second Alt", "Ally Name"] });
  names.resolveCharacter = realResolve;
  check("a self label whose proof key another account took between the resolution and the write is refused as name_conflict, nothing written", r.status === 409 && r.body.error === "name_conflict" && one("SELECT revision FROM community_profiles WHERE discord_id = ?", MEMBER2).revision === beforeRev && !one("SELECT 1 FROM community_alt_claims WHERE discord_id = ? AND name_key = 'ally name'", MEMBER2), JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("DELETE FROM characters WHERE discord_id = '300000000000000077'");
  // a keeper-proven label (a NEW main, so the save is a change) whose row is transferred to another account in that window:
  // refused, never stored as stale keeper proof. (An unchanged save writes nothing, so it has nothing to re-state.)
  await confirm(MEMBER2, "Bea Alt", "Player-1-0003");
  armed = true;
  await fixtureRun("INSERT INTO members (discord_id) VALUES ('300000000000000078')");
  names.resolveCharacter = async (e, did, claim) => { const res = await realResolve(e, did, claim); if (armed && claim === "Bea Alt") { armed = false; await fixtureRun("UPDATE characters SET discord_id = '300000000000000078' WHERE name = 'Bea Alt'"); } return res; };
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: beforeRev, main: "Bea Alt" });
  names.resolveCharacter = realResolve;
  check("a keeper-proven main transferred to another account before the write is refused (now a conflict), not saved as keeper proof", r.status === 409 && r.body.error === "name_conflict" && one("SELECT revision, main_name FROM community_profiles WHERE discord_id = ?", MEMBER2).revision === beforeRev && one("SELECT main_name FROM community_profiles WHERE discord_id = ?", MEMBER2).main_name === "Bea Stormer", JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE characters SET discord_id = ? WHERE name = 'Bea Alt'",MEMBER2);
  r = await call("PUT", "/api/community/profile", MEMBER2, { revision: beforeRev, main: "Bea Alt" });
  check("  with the facts unchanged the same save is admitted as keeper proof", r.status === 200 && r.body.profile.main.name === "Bea Alt" && r.body.profile.main.source === "keeper" && r.body.profile.revision === beforeRev + 1, JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", "/api/community/profile", MEMBER);
  check("the member sees the confirmed claim", r.body.profile.alts[0].status === "officer_confirmed");

  console.log("\n== erasure, export, departure ==");
  const exported = await context.communityExport(directEnv(), MEMBER);
  check("the account copy carries the profile with professions, alts and crafts", exported.directory && exported.directory.revision === 6 && exported.directory.crafts.length === 2 && exported.directory.alts.length === 1);
  const deleted = await deleteThroughOriginalRoute(MEMBER2, STAFF);
  check("deleteSiteData removes a member's profile, claims and ref in its batch", deleted && !one("SELECT 1 FROM community_profiles WHERE discord_id = ?", MEMBER2) && !one("SELECT 1 FROM community_alt_claims WHERE discord_id = ?", MEMBER2) && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER2));
  await deleteThroughOriginalRoute(STAFF, STAFF);
  check("  erasing the reviewing admin clears their identity from the claims they reviewed", one("SELECT reviewed_by FROM community_alt_claims WHERE discord_id = ? AND name_key = 'fern alt'", MEMBER).reviewed_by === null);
  await fixtureRun("UPDATE characters SET status = 'left' WHERE discord_id = ?",MEMBER);
  let sw = await dir.sweepCommunityProfiles(directEnv());
  check("the sweep starts the departure clock for a profile whose owner no longer qualifies", sw.departed === 1 && one("SELECT departed_at FROM community_profiles WHERE discord_id = ?", MEMBER).departed_at === T);
  await fixtureRun("UPDATE characters SET status = 'member' WHERE discord_id = ?",MEMBER);
  sw = await dir.sweepCommunityProfiles(directEnv());
  check("  and clears it when the owner qualifies again", sw.returned === 1 && one("SELECT departed_at FROM community_profiles WHERE discord_id = ?", MEMBER).departed_at === null);
  await fixtureRun("UPDATE characters SET status = 'left' WHERE discord_id = ?",MEMBER);
  await dir.sweepCommunityProfiles(directEnv());
  T += 31 * 86400;
  sw = await dir.sweepCommunityProfiles(directEnv());
  check("thirty-one days departed, the profile and everything under it are deleted and the deletion audited as a count", sw.deleted === 1 && !one("SELECT 1 FROM community_profiles WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_craft_offers WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER) && !!one("SELECT 1 FROM audit WHERE action = 'community.profiles_expired'"));
  T -= 31 * 86400;
  sw = await dir.sweepCommunityProfiles(directEnv({ COMMUNITY_FEATURES: "" }));
  check("the sweep runs with the feature off (nothing left to do here, no error)", sw.deleted === 0);

  console.log("\n== uniform reader admission on every payload (.72, Codex's independent directory reader review, 03:55) ==");
  // BEFORE(i) changes the facts between the context read and payload batch i; AFTER(i) right after batch i committed
  const RM = "300000000000000061";
  await siteUser(RM, { global_name: "Rae" }); await confirm(RM, "Rae Reader", "Player-1-0061"); await siteUser(STAFF, { global_name: "Vik" });
  r = await call("PUT", "/api/community/profile", RM, { revision: 0, listed: true, main: "Rae Reader", alts: ["Rae Alt"], crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }] });
  check("(fixture) a listed profile with a claim and an offer", r.status === 200 && r.body.profile.revision === 1, JSON.stringify(r.body).slice(0, 200));
  const refR = r.body.profile.ref;
  const denyRM = async () => await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",RM);
  const restoreRM = async () => await fixtureRun("UPDATE site_users SET denied = 0, in_server = 1, session_version = 1 WHERE discord_id = ?",RM);
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await denyRM(); } };
  r = await call("GET", "/api/community/profile", RM);
  check("GET profile: denied between the context read and the payload batch: 403 denied, no profile", r.status === 403 && r.body.error === "denied" && !("profile" in r.body), JSON.stringify(r.body).slice(0, 200));
  await restoreRM();
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE site_users SET in_server = 0 WHERE discord_id = ?",RM); } };
  r = await call("GET", "/api/community/directory", RM);
  check("GET directory: departed from the server before the payload batch: 403 not_member, no members", r.status === 403 && r.body.error === "not_member" && !("members" in r.body));
  await restoreRM();
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE site_users SET session_version = 2 WHERE discord_id = ?",RM); } };
  r = await call("GET", "/api/community/crafting?q=fort", RM);
  check("GET crafting: original session closed before the payload batch: 503 erasure_held, no results", r.status === 503 && r.body.error === "erasure_held" && !("results" in r.body));
  await restoreRM();
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE characters SET status = 'left' WHERE discord_id = ?",RM); } };
  r = await call("GET", "/api/community/directory", RM);
  check("GET directory: the roster proof lost before the payload batch: 403 community_unconfirmed, no members", r.status === 403 && r.body.error === "community_unconfirmed" && !("members" in r.body));
  await fixtureRun("UPDATE characters SET status = 'member' WHERE discord_id = ?",RM);
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",STAFF); } };
  r = await call("GET", "/api/admin/community/directory", STAFF);
  check("GET staff review: the admin denied before the payload batch: 403 denied, no entries (the staff read is admitted too)", r.status === 403 && r.body.error === "denied" && !("entries" in r.body), JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",STAFF);
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("DELETE FROM site_users WHERE discord_id = ?",RM); } };
  r = await call("GET", "/api/community/profile", RM);
  check("GET profile: the reader's row removed before the payload batch: 503 erasure_held, no profile", r.status === 503 && r.body.error === "erasure_held" && !("profile" in r.body));
  await siteUser(RM, { global_name: "Rae" });
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE members SET banned = 1 WHERE discord_id = ?",RM); } };
  r = await call("PUT", "/api/community/profile", RM, { revision: 1, raidRole: "tank" });
  check("PUT, EARLY: banned between the context read and the pre-write read: 403 guild_unconfirmed, no profile, nothing written", r.status === 403 && r.body.error === "guild_unconfirmed" && !("profile" in r.body) && one("SELECT revision FROM community_profiles WHERE discord_id = ?", RM).revision === 1, JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE members SET banned = 0 WHERE discord_id = ?",RM);
  AFTER = async (i) => { if (i === 1) await fixtureRun("UPDATE community_profiles SET revision = revision + 1 WHERE discord_id = ?",RM); if (i === 2) { AFTER = null; await denyRM(); } };
  r = await call("PUT", "/api/community/profile", RM, { revision: 1, raidRole: "tank" });
  check("PUT, LOST CAS: another save lands after the pre-write read and the member is denied after the refused write: 403 denied, no profile payload, nothing written", r.status === 403 && r.body.error === "denied" && !("profile" in r.body) && one("SELECT raid_role FROM community_profiles WHERE discord_id = ?", RM).raid_role === null, JSON.stringify(r.body).slice(0, 200));
  await restoreRM();
  AFTER = async (i) => { if (i === 2) { AFTER = null; await denyRM(); } };
  r = await call("PUT", "/api/community/profile", RM, { revision: 2, raidRole: "tank" });
  check("PUT, AFTER SUCCESS: the save committed, then the member denied: the answer is what the write's own batch read (revision 3, the role) and the save stands", r.status === 200 && r.body.profile.revision === 3 && r.body.profile.raidRole.value === "tank" && one("SELECT raid_role FROM community_profiles WHERE discord_id = ?", RM).raid_role === "tank", JSON.stringify(r.body).slice(0, 200));
  r = await call("GET", "/api/community/profile", RM);
  check("  while the next read, newly unauthorized, is refused", r.status === 403 && !("profile" in r.body));
  await restoreRM();
  AFTER = async (i) => { if (i === 2) { AFTER = null; await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",STAFF); } };
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: refR, key: "rae alt", decision: "confirm", revision: 1 });
  check("staff decision, LOST CAS: a stale revision's write is refused and the admin denied before the fallback read: 403 denied, no revision payload, the claim untouched", r.status === 403 && r.body.error === "denied" && !("revision" in r.body) && one("SELECT status FROM community_alt_claims WHERE discord_id = ? AND name_key = 'rae alt'", RM).status === "claimed", JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",STAFF);
  AFTER = async (i) => { if (i === 2) { AFTER = null; await fixtureRun("UPDATE site_users SET denied = 1 WHERE discord_id = ?",STAFF); } };
  r = await call("POST", "/api/admin/community/directory/alt", STAFF, { ref: refR, key: "rae alt", decision: "confirm", revision: 3 });
  check("staff decision, AFTER SUCCESS: the decision committed (RETURNING in its own batch), then the admin denied: acknowledged with what the batch wrote", r.status === 200 && r.body.claim.status === "officer_confirmed" && r.body.revision === 4 && one("SELECT status FROM community_alt_claims WHERE discord_id = ? AND name_key = 'rae alt'", RM).status === "officer_confirmed", JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE site_users SET denied = 0 WHERE discord_id = ?",STAFF);
  check("(every armed hook fired at the batch it named)", BEFORE === null && AFTER === null);

  console.log("\n== .198 opt-in Workshop: recipes, profession-only artisans and attended commissions ==");
  // The same current Native schema, original cookies and admitted routes as the directory above; no Workshop table,
  // registry, background job, contact ledger or permission shortcut is installed for this feature.
  db = freshDb();
  const ARTISAN = "300000000000000801", CUSTOMER = "300000000000000802", OTHER = "300000000000000803";
  await siteUser(ARTISAN, { global_name: "Artisan" }); await confirm(ARTISAN, "Artisan Main", "Player-1-0801");
  await siteUser(CUSTOMER); await confirm(CUSTOMER, "Customer Main", "Player-1-0802");
  await siteUser(OTHER); await confirm(OTHER, "Other Main", "Player-1-0803");
  const workshopSchemaBefore = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
  r = await call("PUT", "/api/community/profile", ARTISAN, { revision: 0, main: "Artisan Main",
    professions: [{ name: "alchemy", skill: 300 }, { name: "tailoring", skill: null }],
    crafts: [{ profession: "alchemy", recipe: "Flask of Endless Echoes", source: "official" }] });
  check("Workshop drafts start unlisted; a client-supplied source cannot turn a recipe into an official claim", r.status === 200 && r.body.profile.listed === false && r.body.profile.crafts[0].source === "self");
  r = await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  check("an artisan's unlisted recipe draft stays out of the all-offers Workshop", r.status === 200 && r.body.results.length === 0);
  r = await call("GET", "/api/community/crafting?mode=professions&browse=1", CUSTOMER);
  check("their unlisted profession draft stays out of the profession directory too", r.status === 200 && r.body.results.length === 0);
  r = await call("PUT", "/api/community/profile", ARTISAN, { revision: 1, listed: true });
  check("only the owner's explicit listing choice publishes the existing profile", r.status === 200 && r.body.profile.listed === true);
  r = await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  check("recipe browsing returns the opt-in offer, matching self-reported skill and a currently proven main for manual contact", r.status === 200 && r.body.results.length === 1 && r.body.results[0].skill === 300 && r.body.results[0].commission?.character === "Artisan Main" && r.body.results[0].commission.mode === "manual_in_game" && r.body.results[0].commission.source === "keeper");
  check("Workshop metadata disclaims official catalogue and recipe/skill verification, with no account id or executable action", r.body.workshop?.version === 1 && r.body.workshop.game === "World of Warcraft: Forever" && r.body.workshop.recipeClaims === "self_reported" && r.body.workshop.skillClaims === "self_reported" && r.body.workshop.officialCatalogue === false && r.body.workshop.mode === "recipes" && !JSON.stringify(r.body).includes(ARTISAN) && !JSON.stringify(r.body).includes("discord.com") && !JSON.stringify(r.body).includes("/whisper"));
  const workshopReadBefore = nativeStatementAttempts;
  r = await call("GET", "/api/community/crafting?mode=professions&browse=1", CUSTOMER);
  const professionReadCost = nativeStatementAttempts - workshopReadBefore;
  check("profession mode includes the artisan with no recipes in that profession, preserving an unknown skill as null", r.status === 200 && r.body.workshop.mode === "professions" && r.body.results.length === 2 && r.body.results.every(row => row.recipe === null && row.source === "self") && r.body.results.find(row => row.profession === "tailoring").skill === null);
  const recipeReadBefore = nativeStatementAttempts;
  await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  const recipeReadCost = nativeStatementAttempts - recipeReadBefore;
  check("profession browsing uses exactly the same counted Native statement budget as recipe browsing", professionReadCost > 0 && recipeReadCost === professionReadCost);
  console.log(`   Native statement attempts per full admitted request: recipes=${recipeReadCost}; professions=${professionReadCost}`);
  r = await call("GET", "/api/community/crafting?mode=professions&profession=tailoring", CUSTOMER);
  check("profession-only filtering works without forcing an artisan to invent a recipe", r.status === 200 && r.body.results.length === 1 && r.body.results[0].profession === "tailoring" && r.body.results[0].recipe === null);
  const workshopDigest = await dir.orderDigest([["Artisan", one("SELECT ref FROM community_profiles WHERE discord_id = ?", ARTISAN).ref, 2]]);
  const artisanRef = one("SELECT ref FROM community_profiles WHERE discord_id = ?", ARTISAN).ref;
  const professionCursor = dir.encodeCursor([2, "professions", null, null, workshopDigest, "alchemy", "Artisan", artisanRef]);
  r = await call("GET", "/api/community/crafting?mode=professions&browse=1&cursor=" + professionCursor, CUSTOMER);
  check("a profession cursor continues in profession/name/ref order", r.status === 200 && r.body.results.length === 1 && r.body.results[0].profession === "tailoring");
  r = await call("GET", "/api/community/crafting?browse=1&cursor=" + professionCursor, CUSTOMER);
  check("a profession cursor cannot be reused for recipe results", r.status === 400 && r.body.error === "invalid_cursor");
  r = await call("GET", "/api/community/crafting?mode=professions&profession=tailoring&cursor=" + professionCursor, CUSTOMER);
  check("nor can its filter change between pages", r.status === 400 && r.body.error === "invalid_cursor");
  r = await call("GET", "/api/community/crafting?mode=professions&q=Flask&browse=1", CUSTOMER);
  check("a recipe query cannot silently become a profession or member-name query", r.status === 400 && r.body.error === "invalid_q");
  r = await call("GET", "/api/community/crafting?mode=everyone&browse=1", CUSTOMER);
  check("unknown Workshop modes are refused", r.status === 400 && r.body.error === "invalid_query");
  r = await call("GET", "/api/community/crafting?browse=0", CUSTOMER);
  check("browsing requires the exact explicit browse=1 value", r.status === 400 && r.body.error === "invalid_query");
  // The listed owner remains a valid guild-data source, but a shared GUID withholds only contact routing.
  await fixtureRun("UPDATE characters SET guid = 'Player-1-0801' WHERE discord_id = ?", OTHER);
  r = await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  check("a currently conflicting GUID withholds the commission target rather than trusting saved keeper provenance", r.status === 200 && r.body.results.length === 1 && r.body.results[0].commission === null);
  await fixtureRun("UPDATE characters SET guid = 'Player-1-0803' WHERE discord_id = ?", OTHER);
  await fixtureRun("UPDATE characters SET name = 'Renamed Artisan' WHERE discord_id = ?", ARTISAN);
  r = await call("GET", "/api/community/crafting?mode=professions&browse=1", CUSTOMER);
  check("a changed current character name also withholds stale contact labels", r.status === 200 && r.body.results.length === 2 && r.body.results.every(row => row.commission === null));
  await fixtureRun("UPDATE characters SET name = 'Artisan Main' WHERE discord_id = ?", ARTISAN);
  r = await call("PUT", "/api/community/profile", ARTISAN, { revision: 2, main: "Artisan Label" });
  check("a self-declared main remains an honest label", r.status === 200 && r.body.profile.main.source === "self");
  r = await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  check("self-declared labels never become proven commission targets", r.status === 200 && r.body.results[0].commission === null);
  r = await call("GET", "/api/community/crafting?mode=professions&browse=1&cursor=" + professionCursor, CUSTOMER);
  check("an owner's profile edit invalidates an old profession cursor", r.status === 409 && r.body.error === "cursor_stale");
  r = await call("PUT", "/api/community/profile", ARTISAN, { revision: 3, listed: false });
  check("the owner can withdraw their listing with the same revision-fenced writer", r.status === 200 && r.body.profile.listed === false);
  const hiddenRecipe = await call("GET", "/api/community/crafting?browse=1", CUSTOMER);
  const hiddenProfession = await call("GET", "/api/community/crafting?mode=professions&browse=1", CUSTOMER);
  check("opt-out immediately hides both Workshop modes", hiddenRecipe.body.results.length === 0 && hiddenProfession.body.results.length === 0);
  const retainedWorkshopCopy = await context.communityExport(directEnv(), ARTISAN);
  check("the unlisted owner's existing account copy still includes every recipe and profession", retainedWorkshopCopy.directory?.crafts.length === 1 && retainedWorkshopCopy.directory.professions.length === 2);
  r = await call("PUT", "/api/community/profile", ARTISAN, { revision: 4, crafts: [], professions: [] });
  check("the owner can delete all Workshop recipe/profession rows while retaining the rest of their profile", r.status === 200 && r.body.profile.crafts.length === 0 && r.body.profile.professions.length === 0 && r.body.profile.main.name === "Artisan Label" && !one("SELECT 1 FROM community_craft_offers WHERE discord_id = ?", ARTISAN) && !one("SELECT 1 FROM community_professions WHERE discord_id = ?", ARTISAN));
  check("Workshop writes and reads preserve the exact existing Native schema", JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all()) === JSON.stringify(workshopSchemaBefore));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

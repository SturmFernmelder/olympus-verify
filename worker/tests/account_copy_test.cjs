// Build .71 (1 Oct 2026): the member's own copy (GET /api/me/export) and the erasure/export integration check across every
// feature (consolidation batch 7), through the REAL src/*.ts against the REAL schema in SQLite; Discord's HTTP side is
// stubbed. A member with data in every site and community feature downloads their copy: every section present, nothing
// about anyone else in it (no other Discord id, no staff), the attachment headers, the rate limit, the audit row; a denied
// member still gets theirs. Then the member is erased through the real deleteSiteData and EVERY table and column of the
// schema is scanned for their id: only the documented residue may remain (the bot's own verification rows and the dated
// log, and an active restriction case with its rows and period; .74: the copy is one admitted batch); the same scan for an erased staff member finds them only
// where the design says (the log). Run from the worker folder:  node tests/account_copy_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
let maxBindings = 0;

const entry = require('./helpers/privacy129_fixture.cjs');
let T = 1790500000;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
let nativeTimeOverride = null;
function d1(db, hooks = {}) {
  let batches = 0;
  // Arm the existing races at the actual community payload boundary, after
  // authentication. Every physical guard remains in nativeTrace/nativeGroups.
  const payloadBatch = plan => plan.some(s => s.statement.includes("privacy_community_request_refused") || s.statement.includes("site_erasure_refused") || /^SELECT \(EXISTS\(SELECT 1 FROM site_users fu/.test(s.statement));
  return entry.originalNativePort(db, {...hooks,statement(sql,params){maxBindings=Math.max(maxBindings,params.length);hooks.statement?.(sql,params);},
    beforeBatch: (plan) => payloadBatch(plan) ? hooks.beforeBatch?.(++batches, plan) : undefined,
    afterBatch: (plan,result) => payloadBatch(plan) ? hooks.afterBatch?.(batches, plan,result) : undefined,
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
let BEFORE = null, AFTER = null; // .74: armed by a test, each fires once
const env = (over = {}) => entry.currentEntryEnvironment({ DB: d1(db, { count: () => { statements++; }, beforeBatch: (i) => BEFORE?.(i), afterBatch: (i,plan,result) => AFTER?.(i,plan,result) }), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: "472099715253796864", ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const MEMBER = "300000000000000003", ORG = "300000000000000002", OTHER = "300000000000000004", STAFF = "472099715253796864", STAFF2 = "472099715253796865";
const siteUser = async (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: T, last_login: T, ...over };
  await fixtureRun("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)",id,row.username,row.global_name,row.nick,row.first_login,row.last_login,row.session_version);
  originalCookies.set(id,{db,issued:await entry.issueOriginalEntryCookie(name=>load('./'+name),db,env(),id)});
  if(row.in_server!==1||row.denied!==0)await fixtureRun('UPDATE site_users SET in_server=?,denied=? WHERE discord_id=?',row.in_server,row.denied,id);
};
const confirm = async (id, name, guid = null) => {
  await fixtureRun("INSERT INTO members (discord_id, linked_at) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING",id,T - 86400);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid) VALUES (?, ?, ?, 'member', ?, ?)",name.toLowerCase().split("-")[0],name,id,T,guid);
};
const ON = { COMMUNITY_FEATURES: "directory,crafting,events,attendance,trials,restrictions,departures,contributions", CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "400", COMMUNITY_ORGANIZERS: ORG, SITE_ADMINS: `${STAFF},${STAFF2}` };
// Normal feature requests need a session current to both the actor and the real SQL clock.
function directEnv(over = ON) {
  const e=env(over);
  return {...e,DB:load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(e.DB,'writer','canonical',entry.ENTRY_EPOCH)};
}
const fixtureWriters=new WeakMap();
function fixtureWriter(){let admitted=fixtureWriters.get(db);if(!admitted){admitted=load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(entry.originalNativePort(db),'writer','canonical',entry.ENTRY_EPOCH);fixtureWriters.set(db,admitted);}return admitted;}
async function fixtureRun(sql,...params){return fixtureWriter().prepare(sql).bind(...params).run();}
function fixtureStatement(sql){return {async run(...params){const out=await fixtureRun(sql,...params);return {...out,lastInsertRowid:out.meta.last_row_id};}};}
async function fixtureMany(sql,rows){const admitted=fixtureWriter(),out=[];for(let i=0;i<rows.length;i+=150)out.push(...await admitted.batch(rows.slice(i,i+150).map(values=>admitted.prepare(sql).bind(...values))));return out;}
const originalCookies = new Map();
const cookieFor = async (id) => {
  const original=originalCookies.get(id);
  if(!original||original.db!==db)throw Error('explicit original account setup cookie missing');
  return original.issued.cookie;
};
const call = async (method, path, id, body, over = ON, extraHeaders = {}) => {
  const headers = { Cookie: await cookieFor(id), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...extraHeaders };
  if(method==='POST' && /^\/api\/admin\/users\/\d+\/delete$/.test(path) && !headers['X-Olympus-Decision-Target']) {
    const prepared=await call('GET',path.replace(/\/delete$/,'/decision-target?route=delete&decisionAction=partial_delete'),id,undefined,over,extraHeaders);
    if(prepared.status===200 && typeof prepared.body.targetToken==='string')Object.assign(headers,{'X-Olympus-Decision-Target':prepared.body.targetToken,'X-Olympus-Decision-Action':'partial_delete'});
  }
  const res = await indexMod.default.fetch(new Request("https://guild.example" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};
// .118: real same-path form requests; continuation never travels in a query string.
const accountForm = async (session, over = ON) => {
  const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account", { headers: { Cookie: session } }), env(over), ctx);
  const text = await res.text(), form = (text.match(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/) || [])[1] || "";
  return { nonce: (res.headers.get("Set-Cookie") || "").split(";")[0], csrf: (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "" };
};
const postCopy = async (session, actions = "", mode = "download", controls, over = ON) => {
  const f = controls || await accountForm(session, over);
  const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account/export", { method: "POST", headers: { Cookie: [session, f.nonce].filter(Boolean).join("; "), Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: f.csrf, actions, mode }).toString() }), env(over), ctx);
  const text = await res.text(); let body = {};
  try { body = JSON.parse(text); } catch { /* Script-free history/refusal HTML. */ }
  return { status: res.status, headers: res.headers, text, body };
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const iso = (s) => new Date(s * 1000).toISOString();
/** Every (table, column) of the whole schema holding `id` as a value, as "table.column". */
const whereIs = (id) => {
  const hits = [];
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    for (const c of db.prepare(`PRAGMA table_info("${t.name}")`).all()) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}" WHERE "${c.name}" = ?`).get(id).n;
      if (n > 0) hits.push(`${t.name}.${c.name}`);
    }
  }
  return hits.sort();
};

// Exercise the actual staff preparation and delete route; no manufactured session/origin.
async function deleteThroughOriginalRoute(target, actor) {
  const prepared=await call('GET','/api/admin/users/'+target+'/decision-target?route=delete&decisionAction=partial_delete',actor);
  if(prepared.status!==200 || typeof prepared.body.targetToken!=='string')throw Error('original delete target preparation held '+prepared.status);
  const result=await call('POST','/api/admin/users/'+target+'/delete',actor,{mentions:false},ON,{'X-Olympus-Decision-Target':prepared.body.targetToken,'X-Olympus-Decision-Action':'partial_delete'});
  if(result.status!==200)throw Error('original delete route held '+result.status+' '+JSON.stringify(result.body));
  return result.body.ok === true;
}
(async () => {
  await siteUser(MEMBER, { global_name: "Mia", nick: "Mia the Mage" }); await confirm(MEMBER, "Mia One", "Player-1-0001"); await confirm(MEMBER, "Mia Two", "Player-1-0002");
  await siteUser(ORG, { global_name: "Org" }); await confirm(ORG, "Org Char"); await siteUser(OTHER, { global_name: "Oz" }); await confirm(OTHER, "Oz Alt"); await siteUser(STAFF, { global_name: "Vik" }); await confirm(STAFF, "Vik Admin"); await siteUser(STAFF2, { global_name: "Ann" });
  // the site's own data about the member
  // .77: the application through the REAL writer (PUT /api/application) with a Discord picker reference and the member's own words (Codex's normal-writer regression, 05:08); the review itself is the staff's later action
  const hexOf = (hours) => { const b = new Array(168).fill(0); for (const h of hours) b[h] = 1; let x = ""; for (let i = 0; i < 168; i += 4) x += ((b[i] << 3) | (b[i + 1] << 2) | (b[i + 2] << 1) | b[i + 3]).toString(16); return x; };
  const evenings = Array.from({ length: 7 }, (_, d) => Array.from({ length: 5 }, (_, h) => d * 24 + 18 + h)).flat();
  // .201: the ordinary writer fixture is a Raider application; Officer seats
  // are reserved appointments. Historical board-vote rows below remain history.
  const app = await call("PUT", "/api/application", MEMBER, { position: "raider", backups: [], class: "mage", role: "dps", region: "eu", character: "Mia One", fallback: true, ack: true, board: false, avail: hexOf(evenings), availTz: "Europe/Stockholm", answers: { experience: "Cleared Naxx in 2006 and again in 2020.", why: "Oz said I should apply", leadership: "Led a 40-man raid for two years.", scenario: "Move it to DMs, then decide by the rules.", hours: "10to20", voice: "yes", references: [{ kind: "discord", key: OTHER, label: "Oz (@u04)" }, { kind: "name", label: "Fern" }] } });
  check("(fixture) the member's application saved through the real writer, with a Discord picker reference", app.status === 200 && JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id = ?", MEMBER).answers).references[0].key === OTHER, JSON.stringify(app.body).slice(0, 200));
  await fixtureRun("UPDATE site_applications SET status = 'reviewing', reviewed_by = ?, reviewed_at = ? WHERE discord_id = ?",STAFF,T,MEMBER);
  await fixtureRun("INSERT INTO site_votes (voter_id, ballot, slot, nominee_kind, nominee_key, nominee_label, reason, created_at, updated_at) VALUES (?, 'officer', 1, 'discord', ?, 'Oz', 'steady hand', ?, ?)",MEMBER,OTHER,T,T);
  await fixtureRun("INSERT INTO site_board_votes (voter_id, candidate_id, role_key, vote, created_at, updated_at) VALUES (?, ?, 'officer', 1, ?, ?)",MEMBER,OTHER,T,T);
  await fixtureRun("INSERT INTO site_friends (owner_id, friend_kind, friend_key, friend_label, note, created_at) VALUES (?, 'discord', ?, 'Oz', 'raids together', ?)",MEMBER,OTHER,T);
  await fixtureRun("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, 'Mia Three', 'mia three', 'approved', ?, ?, ?)",MEMBER,T,STAFF,T);
  await fixtureRun("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, 'Oz Res', 'oz res', 'approved', ?, ?, ?)",OTHER,T,STAFF,T); // another member's reservation the admin approved
  await fixtureRun("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, consumed_at, consumed_source) VALUES (?, 'mia one', 'Mia One', ?, ?, ?, 'whisper')",MEMBER,T - 100,T + 86400,T - 50);
  await fixtureRun("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.member', ?, ?)",T - 40,MEMBER,JSON.stringify({ discordId: MEMBER, roleGranted: true }));
  // the community features, through their real routes
  let r = await call("PUT", "/api/community/profile", MEMBER, { revision: 0, listed: true, main: "Mia One", raidRole: "healer", professions: [{ name: "alchemy", skill: 300 }], alts: ["Mia Two"], crafts: [{ profession: "alchemy", recipe: "Elixir of Fortitude" }] });
  check("(fixture) the member's directory profile", r.status === 200);
  const EV = "E".repeat(22), start = T + 3 * 86400;
  r = await call("POST", "/api/community/events", ORG, { opId: EV, title: "Raid night", startsAt: iso(start), durationMin: 120 });
  check("(fixture) an event by an organizer", r.status === 200);
  r = await call("PUT", "/api/community/events/rsvp", MEMBER, { eventId: EV, status: "yes", character: "Mia One", revision: 0 });
  check("(fixture) the member's answer", r.status === 200);
  r = await call("POST", "/api/admin/community/trials", STAFF, { opId: "T".repeat(22), discordId: MEMBER, reviewDueAt: iso(T + 30 * 86400), sponsorDiscordId: OTHER });
  check("(fixture) a trial about the member with a sponsor", r.status === 200);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "create", caseId: "R".repeat(22), discordId: MEMBER, category: "conduct_removal", reviewAt: iso(T + 30 * 86400), expiresAt: iso(T + 180 * 86400) });
  check("(fixture) a restriction case about the member", r.status === 200);
  r = await call("POST", "/api/admin/community/restrictions", STAFF, { action: "add_characters", caseId: "R".repeat(22), expectedRevision: r.body.case.revision });
  check("(fixture) its watch-list", r.status === 200 && r.body.case.characters.length === 2);
  await fixtureRun("INSERT INTO characters (name_key, name, discord_id, status, bound_at, left_at) VALUES ('mia old', 'Mia Old', ?, 'left', ?, ?)",MEMBER,T - 10 * 86400,T - 2 * 86400);
  const made = await load("./community-departures").departureIntake(directEnv(ON), T);
  check("(fixture) a departure review item", made === 1);
  // .75: the member's contribution ledger: this week's obligation and a receipt an officer recorded (the officer is the observer; a staff id in the bot's rows)
  const pol = load("./community-contribution-policy");
  r = await call("POST", "/api/admin/community/contributions", STAFF, { action: "obligation", discordId: MEMBER, periodStart: iso(pol.periodStart(T, pol.DEFAULT_CONTRIBUTION_POLICY)) });
  check("(fixture) the member's obligation for this week", r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  r = await call("POST", "/api/admin/community/contributions", STAFF, { action: "receipt", source: "officer_manual", sourceId: "mail-1", payerName: "Mia One", amountCopper: 10000, observedAt: iso(T - 60), matchedDiscordId: MEMBER, status: "matched" });
  check("(fixture) a receipt recorded by the officer and matched to the member", r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 200));
  // .74: the member's own queue row (the officer, the watcher's claim and the note are not theirs to copy), and more than a page of actions naming them as subject or as actor
  await fixtureRun("INSERT INTO invite_queue (name_key, name, discord_id, note, status, created_at, written_at, invited_at, approved_by, claimed_by, attempts, last_reason, last_reason_at) VALUES ('mia one', 'Mia One', ?, 'note set by the addon', 'invited', ?, ?, ?, ?, 'officer-watcher-1', 1, 'offline', ?)",MEMBER,T - 100,T - 90,T - 80,STAFF,T - 95);
  const noise = fixtureStatement("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, ?, 'test.noise', ?, NULL)");
  for (let i = 0; i < 1005; i++) (await noise.run(T + 1000 + i, i % 2 ? MEMBER : "system", i % 2 ? "something" : MEMBER));

  console.log("\n== the member's own copy ==");
  const copySession = await cookieFor(MEMBER);
  const copyNativeTime=T+42; nativeTimeOverride=copyNativeTime;
  r = await call("GET", "/api/me/export", MEMBER, undefined, ON, { Cookie: copySession });
  const copy = r.body, text = JSON.stringify(copy);
  check("GET /api/me/export answers the signed-in account's copy as a JSON attachment", r.status === 200 && r.headers.get("Content-Disposition") === 'attachment; filename="olympus-my-data.json"' && /no-store/.test(r.headers.get("Cache-Control") || "") && typeof copy.generatedAt === "string", r.status, JSON.stringify(copy).slice(0, 200));
  check("the account section: Discord names, sign-ins, standing", copy.account.discordId === MEMBER && copy.account.displayName === "Mia" && copy.account.nickname === "Mia the Mage" && copy.account.firstSignIn === iso(T) && copy.account.inServer === true && copy.account.denied === false);
  check("the site section: the application (the member's view), votes and friends by the labels chosen, board votes by role, reserved names", copy.site.application && copy.site.application.position === "raider" && copy.site.votes.length === 1 && copy.site.votes[0].nominee.label === "Oz" && copy.site.boardVotes.length === 1 && copy.site.boardVotes[0].role === "officer" && copy.site.friends[0].label === "Oz" && copy.site.reserved[0].name === "Mia Three" && copy.site.reserved[0].status === "approved", JSON.stringify(copy.site).slice(0, 400));
  check("the verification section: not banned, a current Battle.net link without the tag, the bound characters, the code requests without any code", copy.verification.bannedFromVerifying === false && copy.verification.battleNet.linked === true && !("battletag" in copy.verification.battleNet) && copy.verification.characters.length === 3 && copy.verification.characters.some((c) => c.name === "Mia Old" && c.status === "left") && copy.verification.codeRequests.length === 1 && copy.verification.codeRequests[0].usedThrough === "whisper" && !/code":/.test(text));
  check("the actions: fixed action names with their time, nothing else; .74: the earliest 1000 naming the account as subject OR actor, with a continuation when more exist", copy.actions.entries.some((a) => a.action === "roster.member") && copy.actions.entries.every((a) => Object.keys(a).sort().join() === "action,at") && copy.actions.entries.length === 1000 && copy.actions.truncated === true && (typeof copy.actions.nextCursor === "string" && copy.actions.nextCursor.length > 0 && copy.actions.nextCursor.length <= 140 && copy.actions.capture.kind === "retained_action_range"), copy.actions.entries.length, copy.actions.nextCursor);
  check("  .74: no structural reference to another Discord account: the nominee's and the friend's `kind` are gone, the labels the member chose stay", !("kind" in copy.site.votes[0].nominee) && copy.site.votes[0].nominee.label === "Oz" && copy.site.friends.length === 1 && !("kind" in copy.site.friends[0]) && copy.site.friends[0].label === "Oz");
  check("  .74: the member's own queue state: character, status, attempts, dates and the fixed refusal reason; never the officer, the claim or the note", copy.verification.inviteQueue.length === 1 && copy.verification.inviteQueue[0].character === "Mia One" && copy.verification.inviteQueue[0].status === "invited" && copy.verification.inviteQueue[0].attempts === 1 && copy.verification.inviteQueue[0].lastRefusal.reason === "offline" && copy.verification.inviteQueue[0].invitedAt === iso(T - 80) && !text.includes("officer-watcher-1") && !text.includes("note set by the addon"), JSON.stringify(copy.verification.inviteQueue));
  r = await postCopy(copySession, copy.actions.nextCursor);
  nativeTimeOverride=null;
  check("  .118: the same-path POST continuation answers the next bounded page of retained actions and a fresh own-account copy", r.status === 200 && r.body.account.discordId === MEMBER && r.body.actions.entries.length >= 5 && r.body.actions.entries.length <= 1000 && r.body.actions.truncated === false && r.body.actions.nextCursor === null && r.body.actions.entries.every((a) => a.at >= copy.actions.entries.at(-1).at) && r.body.actions.entries.some((a) => a.action === "test.noise"), r.body.actions && r.body.actions.entries.length);
  r = await call("GET", "/api/me/export?actions=zzz", MEMBER);
  check("  .74: a malformed continuation is 400 invalid_cursor (and counts as no copy)", r.status === 400 && r.body.error === "invalid_cursor");
  check("  .74/.76: the about text says how the copy was captured (one database transaction), no more", copy.about.includes("read together in one database transaction at generatedAt"));
  check("  .76: generatedAt is the database's clock inside the copy's batch (the independently modeled Native clock, distinct from the source-entry clock)", Date.parse(copy.generatedAt)/1000===copyNativeTime && copyNativeTime!==T, copy.generatedAt);
  check("  .76/.77: the application saved through the normal writer carries its references as kind and label only in the own copy (the stored row keeps the key for the site's own use); the member's own words stay", copy.site.application.answers.references.length === 2 && copy.site.application.answers.references.every((x) => !("key" in x)) && copy.site.application.answers.references[0].label === "Oz (@u04)" && copy.site.application.answers.references[1].kind === "name" && copy.site.application.answers.why === "Oz said I should apply" && JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id = ?", MEMBER).answers).references[0].key === OTHER);
  check("every community feature's section is present through the registry", ["directory", "events", "trials", "restrictions", "departures", "contributions"].every((k) => k in copy.community) && copy.community.contributions.obligations.length === 1 && copy.community.contributions.receipts.length === 1 && !("payerName" in copy.community.contributions.receipts[0]) && copy.community.directory.main.name === "Mia One" && copy.community.events.signups.length === 1 && copy.community.trials.trials.length === 1 && copy.community.restrictions.cases.length === 1 && copy.community.restrictions.watchList.length === 2 && copy.community.departures.departures.length === 1, Object.keys(copy.community).join());
  check("MINIMIZATION: no other member's Discord id and no staff id anywhere in the copy (the organizer, the sponsor, the admin, the nominee, the candidate, the friend)", !text.includes(ORG) && !text.includes(OTHER) && !text.includes(STAFF) && !text.includes(STAFF2), text.match(/\d{17,20}/g));
  check("  no staff notes/reasons/identities or private verification/code hashes; only the intentional continuation integrity MAC is present", !/admin_note|ban_reason|reviewed_by|added_by|sponsor/.test(text) && !text.includes(originalCookies.get(MEMBER).issued.session.n) && !text.includes(originalCookies.get(MEMBER).issued.session.g) && !Object.hasOwn(copy.account,'account_incarnation') && !Object.hasOwn(copy.account,'privacyOriginalSession'));
  check("the copy is audited as site.copy_exported with no details", one("SELECT details FROM audit WHERE action = 'site.copy_exported' AND actor = ?", MEMBER).details === null);
  for (let i = 0; i < 3; i++) await call("GET", "/api/me/export", MEMBER); // two copies above (the first and the continuation), three here
  r = await call("GET", "/api/me/export", MEMBER);
  check("five copies an hour: the sixth is 429 slow_down", r.status === 429 && r.body.error === "slow_down");
  await fixtureRun("UPDATE site_users SET denied = 1, denied_at = ?, denied_by = ? WHERE discord_id = ?",T,STAFF,OTHER);
  r = await call("GET", "/api/me/export", OTHER);
  check("a denied member still gets their copy (the reader boundary is the session alone), with the denial dated and nobody named", r.status === 200 && r.body.account.denied === true && r.body.account.deniedAt === iso(T) && !JSON.stringify(r.body).includes(STAFF));
  const res = await indexMod.default.fetch(new Request("https://guild.example/api/me/export"), env(ON), ctx);
  check("without a session: 401", res.status === 401);

  console.log("\n== .74: the whole copy is ONE admitted transaction (Codex's review of .71, 04:24) ==");
  let lastBatch = 0;
  BEFORE = (i) => { lastBatch = i; };
  r = await call("GET", "/api/me/export", OTHER);
  check("a copy is read in exactly one batch: the keeper's sections and every registry section in the same admitted transaction", r.status === 200 && lastBatch === 1 && ["refs", "directory", "events", "trials", "restrictions", "departures"].every((k) => k in r.body.community), lastBatch, Object.keys(r.body.community || {}).join());
  BEFORE = async (i) => { if (i === 1) { BEFORE = null; await fixtureRun("UPDATE site_users SET session_version = 2 WHERE discord_id = ?",OTHER); } };
  r = await call("GET", "/api/me/export", OTHER);
  check("the original-session facade refuses a changed session before copy payload, no section is returned", r.status === 503 && r.body.error === "erasure_held" && !("community" in r.body) && !("account" in r.body), JSON.stringify(r.body).slice(0, 200));
  await fixtureRun("UPDATE site_users SET session_version = 1 WHERE discord_id = ?",OTHER);
  let late = false;
  AFTER = async (i) => { if (i === 1) await fixtureRun("UPDATE site_users SET session_version = 3 WHERE discord_id = ?",OTHER); if (i >= 2) late = true; };
  r = await call("GET", "/api/me/export", OTHER);
  AFTER = null;
  check("the session invalidated right after the batch: the whole admitted transaction is answered without a later payload re-read or all-store completion claim", r.status === 200 && late === false && "restrictions" in r.body.community && r.body.about.startsWith("A curated partial copy about your own Discord account"), JSON.stringify(r.body).slice(0, 120));
  await fixtureRun("UPDATE site_users SET session_version = 1 WHERE discord_id = ?",OTHER);
  check("(no hook left armed)", BEFORE === null && AFTER === null);

  console.log("\n== erasure through the real deleteSiteData, then every table scanned ==");
  const before = whereIs(MEMBER);
  check("(before: the member's id sits in many tables)", before.length >= 12, before.join(" "));
  const memberSubjectBefore=one("SELECT * FROM privacy_subjects WHERE subject_id=?",MEMBER);
  const deleted = await deleteThroughOriginalRoute(MEMBER, STAFF);
  const after = whereIs(MEMBER);
  const allowed = ["audit.actor", "audit.subject", "characters.discord_id", "community_restriction_cases.discord_id", "community_restriction_periods.discord_id", "invite_queue.discord_id", "members.discord_id", "pending.discord_id", "privacy_subjects.subject_id"];
  check("after the erasure the id remains ONLY in the documented residue: the bot's own verification rows (members, characters, pending, the invite queue), the dated log, the unchanged privacy subject control, and the active restriction case with its period", deleted && after.every((h) => allowed.includes(h)) && JSON.stringify(one("SELECT * FROM privacy_subjects WHERE subject_id=?",MEMBER))===JSON.stringify(memberSubjectBefore), after.filter((h) => !allowed.includes(h)).join(" ") || "(no unexpected hit)");
  check("  the site account, application, votes, board votes, friends and reservations are gone", !one("SELECT 1 FROM site_users WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM site_applications WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM site_votes WHERE voter_id = ?", MEMBER) && !one("SELECT 1 FROM site_board_votes WHERE voter_id = ?", MEMBER) && !one("SELECT 1 FROM site_friends WHERE owner_id = ?", MEMBER) && !one("SELECT 1 FROM site_reserved WHERE owner_id = ?", MEMBER));
  check("  every community feature's rows about them are gone or anonymized: profile, ref, answer, trial, departure item; the case's watch-list rows stay with the active case", !one("SELECT 1 FROM community_profiles WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_refs WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_event_signups WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_trials WHERE discord_id = ?", MEMBER) && !one("SELECT 1 FROM community_departure_reviews WHERE discord_id = ?", MEMBER) && one("SELECT COUNT(*) AS n FROM community_restriction_characters WHERE case_id = ?", "R".repeat(22)).n === 2);
  const staffBefore = whereIs(STAFF),staffSubjectBefore=one("SELECT * FROM privacy_subjects WHERE subject_id=?",STAFF);
  await deleteThroughOriginalRoute(STAFF, STAFF2);
  const staffAfter = whereIs(STAFF);
  const staffAllowed = ["audit.actor", "audit.subject", "characters.discord_id", "members.discord_id", "privacy_subjects.subject_id"];
  check("an erased staff member is anonymized everywhere they acted (the application's reviewer, the reservation's approver, the denial, the trial's creator, the case's setter, the watch-list's adder, the queue row's approver) and remains only in the dated log, unchanged privacy subject control and the bot's own rows", staffBefore.length > staffAfter.length && staffAfter.every((h) => staffAllowed.includes(h)) && JSON.stringify(one("SELECT * FROM privacy_subjects WHERE subject_id=?",STAFF))===JSON.stringify(staffSubjectBefore), staffAfter.filter((h) => !staffAllowed.includes(h)).join(" ") || "(no unexpected hit)");
  check("  the case shows no setter, the reservation no approver, the denial no admin", one("SELECT set_by FROM community_restriction_cases WHERE id = ?", "R".repeat(22)).set_by === "erased" && one("SELECT approved_by FROM site_reserved WHERE name = 'Oz Res'").approved_by === null && one("SELECT denied_by FROM site_users WHERE discord_id = ?", OTHER).denied_by === null);

  console.log("\n== .118: a retained own-action range, signed to one genuine session ==");
  {
    const savedDb = db, savedT = T, savedBefore = BEFORE, savedAfter = AFTER;
    let rangeDb = null;
    try {
      rangeDb = freshDb(); db = rangeDb; BEFORE = null; AFTER = null;
      load("./schema").forgetSchemaCheck();
      const exporter = load("./site-export");
      let serial = 0;
      const newAccount = async (size = 0, over = {}) => {
        const id = String(310000000000000000n + BigInt(++serial)); await siteUser(id, over);
        const expected = [], values = [];
        const insertSQL="INSERT INTO audit (ts,actor,action,subject,details) VALUES (?,?,?,?,NULL)";
        for (let i = 0; i < size; i++) {
          const at = T + 1000 + Math.floor(i / 700), action = i === 0 ? "site.copy_exported" : "range." + String(i).padStart(5, "0");
          // One row matching both actor and subject counts ONCE; foreign rows interleave their ids.
          values.push([at, i % 3 === 0 || i % 3 === 1 ? id : "system", action, i % 3 === 0 || i % 3 === 2 ? id : "not-an-account"],[at,OTHER,"foreign."+i,OTHER]);
          expected.push({ at: iso(at), action });
        }
        const receipts=await fixtureMany(insertSQL,values),rowIds=expected.map((_,i)=>Number(receipts[i*2].meta.last_row_id));
        return { id, expected, rowIds };
      };
      const start = async (id, session) => call("GET", "/api/me/export", id, undefined, ON, { Cookie: session });
      const copies = id => one("SELECT COUNT(*) AS n FROM audit WHERE actor=? AND action='site.copy_exported'", id).n;
      const cookiePayload = session => JSON.parse(Buffer.from(session.slice(session.indexOf("=") + 1).split(".")[0], "base64url").toString("utf8"));
      const renewedSession = async (id,seconds=0) => {
        const originalTime=T;try{T+=seconds;return (await entry.issueOriginalEntryCookie(name=>load('./'+name),db,env(),id)).cookie;}finally{T=originalTime;}
      };
      const internal = async (session, user, cursor) => {
        const res = await exporter.exportMyData(new Request("https://guild.example/api/me/export", { headers: { Cookie: session } }), env(ON), user, cursor);
        return { status: res.status, body: await res.json() };
      };

      for (const size of [1001, 2005]) {
        const f = await newAccount(size), session = await cookieFor(f.id), first = await start(f.id, session), a = first.body.actions;
        check(`.118 ${size}: initial page captures all own rows once, bounded to 1000 including actor/subject double matches`, first.status === 200 && a.entries.length === 1000 && a.capture.kind === "retained_action_range" && a.capture.count === size && a.capture.delivered === 1000 && a.capture.remaining === size - 1000 && a.capture.complete === false && a.truncated === true && typeof a.currentCursor === "string" && typeof a.nextCursor === "string");
        await fixtureRun("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)",T - 100000,f.id,"after.capture.backdated",f.id);
        await fixtureRun("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)",T + 100000,f.id,"after.capture.future",f.id);
        await fixtureRun("UPDATE site_users SET nick='Fresh nickname after capture' WHERE discord_id=?",f.id);
        const pages = [a]; let next = a.nextCursor, finalResponse = first;
        for (let pageNumber = 1; pageNumber <= 2 && next; pageNumber++) {
          finalResponse = await postCopy(session, next); pages.push(finalResponse.body.actions);
          if (finalResponse.status !== 200 || !finalResponse.body.actions) break;
          next = finalResponse.body.actions.nextCursor;
        }
        const entries = pages.flatMap(p => p?.entries || []);
        check(`.118 ${size}: exact chronological traversal across tied timestamps has no duplicate, missing or foreign actions`, finalResponse.status === 200 && JSON.stringify(entries) === JSON.stringify(f.expected) && new Set(entries.map(x => x.action)).size === size && pages.map(p => p.entries.length).join() === (size === 1001 ? "1000,1" : "1000,1000,5"));
        check(`.118 ${size}: capture time/count persist; postcapture inserts and newly generated copy audits cannot enter the range`, pages.every((p,i) => p.capture.at === a.capture.at && p.capture.count === size && p.capture.delivered === Math.min((i+1)*1000,size) && p.capture.remaining === Math.max(size-(i+1)*1000,0) && p.capture.complete === (i === pages.length-1)) && !entries.some(x => x.action.startsWith("after.capture.")) && entries.filter(x => x.action === "site.copy_exported").length === 1 && pages.at(-1).nextCursor === null && pages.at(-1).truncated === false);
        const same = await postCopy(session, a.currentCursor);
        check(`.118 ${size}: downloading the current page repeats its retained actions while other copy sections are freshly read`, same.status === 200 && JSON.stringify(same.body.actions.entries) === JSON.stringify(a.entries) && same.body.actions.capture.at === a.capture.at && same.body.actions.capture.count === size && same.body.account.nickname === "Fresh nickname after capture" && same.body.about.includes("Other sections are freshly read") && same.body.coverage.completeErasure === false);
      }

      {
        const f = await newAccount(), session = await cookieFor(f.id);
        await fixtureRun("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)",T,OTHER,"foreign.only",OTHER);
        const first = await start(f.id, session), again = await postCopy(session, first.body.actions.currentCursor);
        check(".118 an empty captured own range remains complete and empty after its first copy audit is inserted", first.status === 200 && again.status === 200 && first.body.actions.capture.count === 0 && again.body.actions.capture.count === 0 && again.body.actions.entries.length === 0 && again.body.actions.capture.complete === true && again.body.actions.nextCursor === null);
      }
      for (const change of ["delivered-delete", "remaining-delete", "membership-drop", "remaining-order-drop", "delete-at-batch"]) {
        const f = await newAccount(1001), session = await cookieFor(f.id), first = await start(f.id, session);
        const mutate = async () => change === "remaining-order-drop" ? await fixtureRun("UPDATE audit SET ts=? WHERE id=?",T+999,f.rowIds[1000]) : change === "membership-drop"
          ? await fixtureRun("UPDATE audit SET actor=?,subject=? WHERE id=?",OTHER,OTHER,f.rowIds[1000])
          : await fixtureRun("DELETE FROM audit WHERE id=?",f.rowIds[change === "delivered-delete" ? 0 : 1000]);
        if (change !== "delete-at-batch") await mutate();
        const beforeCopies = copies(f.id);
        const form = await accountForm(session); let batches = 0;
        BEFORE = async () => { batches++; if(change === "delete-at-batch") { BEFORE = null; await mutate(); } };
        const response = await postCopy(session, first.body.actions.nextCursor, "download", form); BEFORE = null;
        check(`.118 ${change}: changed captured membership/count is 409 without a completed payload or export audit`, response.status === 409 && response.body.error === "history_changed" && !("actions" in response.body) && !("account" in response.body) && !response.headers.get("Content-Disposition") && copies(f.id) === beforeCopies && batches === 1);
      }

      {
        const f = await newAccount(1001), session = await cookieFor(f.id), first = await start(f.id, session), token = first.body.actions.nextCursor;
        const user = await siteCore.currentUser(env(), new Request("https://guild.example/", { headers: { Cookie: session } }));
        const parts = token.split("."), altered = [];
        for (let i = 1; i <= 7; i++) { const p = parts.slice(); p[i] = String(Number(p[i]) + 1); altered.push(p.join(".")); }
        const mac = parts.slice(); mac[8] = (mac[8][0] === "A" ? "B" : "A") + mac[8].slice(1); altered.push(mac.join("."));
        for (const raw of ["0", "-1", "01", "1000000000000", "9007199254740992"]) { const p = parts.slice(); p[1] = raw; altered.push(p.join(".")); }
        const beforeCopies = copies(f.id); let batches = 0; BEFORE = () => { batches++; };
        for (let i=0;i<altered.length;i++) {
          const response = await internal(session, user, altered[i]);
          check(`.118 altered cursor field/MAC/canonical bound ${i+1}: refused before any admitted payload batch`, response.status === 400 && response.body.error === "invalid_cursor" && !("actions" in response.body) && batches === 0 && copies(f.id) === beforeCopies);
        }
        BEFORE = null;
        for (const query of [token, "1.2", ""]) {
          let attempted = 0; BEFORE = () => { attempted++; };
          const response = await call("GET", "/api/me/export?actions=" + encodeURIComponent(query), f.id, undefined, ON, { Cookie: session }); BEFORE = null;
          check(".118 signed, unsigned and empty API cursor queries all refuse before payload admission", response.status === 400 && response.body.error === "invalid_cursor" && response.body.message.includes("account form") && attempted === 0 && copies(f.id) === beforeCopies);
        }
        const other = await newAccount(), otherSession = await cookieFor(other.id), otherForm = await accountForm(otherSession);
        let attempted = 0; BEFORE = () => { attempted++; };
        const crossed = await postCopy(otherSession, token, "download", otherForm); BEFORE = null;
        check(".118 another account's own genuine CSRF/session cannot consume the captured token", crossed.status === 400 && crossed.body.error === "invalid_cursor" && attempted === 0 && copies(other.id) === 0);
        const replace = async (replacement, passedVersion) => {
          const payload=cookiePayload(replacement),form = await accountForm(replacement); let count = 0; BEFORE = () => { count++; };
          const response = await postCopy(replacement, token, "download", form); BEFORE = null;
          return response.status === 400 && response.body.error === "invalid_cursor" && count === 0 && copies(f.id) === beforeCopies && payload.v === passedVersion;
        };
        const payload = cookiePayload(session);
        check(".118 a fresh valid session with a different signed expiry cannot reuse the old cursor", await replace(await renewedSession(f.id,60), 1));
        await fixtureRun("UPDATE site_users SET session_version=2 WHERE discord_id=?",f.id);
        check(".118 a fresh valid replacement session version cannot reuse the old cursor", await replace(await renewedSession(f.id), 2));
        await fixtureRun("UPDATE site_users SET session_version=1 WHERE discord_id=?",f.id);
        for (const wrongUser of [{ ...user, discord_id: other.id }, { ...user, session_version: 2 }]) {
          let count = 0,held; BEFORE = () => { count++; }; try{await internal(session, wrongUser, token);}catch(error){held=error;} BEFORE = null;
          check(".118 passed-user id/version cannot substitute for the original signed context", held?.message === "privacy_original_user_held" && count === 0);
        }
      }
      {
        const f = await newAccount(1), session = await cookieFor(f.id), form = await accountForm(session), payload = cookiePayload(session);
        const originalTime = T, beforeCopies = copies(f.id); let batches = 0;
        try { T = payload.e + 1; BEFORE = () => { batches++; }; const response = await postCopy(session, "", "download", form);
          check(".118 actor-clock expiry refuses the saved real form before any payload batch", response.status === 401 && response.text.includes("Session unavailable") && batches === 0 && copies(f.id) === beforeCopies);
        } finally { T = originalTime; BEFORE = null; }
        nativeTimeOverride=payload.e+1; batches = 0; BEFORE = () => { batches++; };
        const response = await start(f.id, session); BEFORE = null;nativeTimeOverride=null;
        check(".118 genuine SQLite-clock expiry refuses an attempted admitted API batch without any payload or export audit", response.status === 401 && response.body.error === "signed_out" && batches === 0 && !("account" in response.body) && !("actions" in response.body) && copies(f.id) === beforeCopies, response.status,response.body,batches);
      }
      for (const standing of ["denied", "departed", "banned"]) {
        const f = await newAccount(1, { denied: standing === "denied" ? 1 : 0, in_server: standing === "departed" ? 0 : 1 });
        if (standing === "banned") await fixtureRun("INSERT INTO members(discord_id,linked_at,banned) VALUES(?,?,1)",f.id,T);
        const session = await cookieFor(f.id), response = await start(f.id,session);
        check(`.118 ${standing}: a genuine valid session retains only its own partial-copy authority`, response.status === 200 && response.body.account.discordId === f.id && response.body.actions.capture.count === 1 && response.body.coverage.completeErasure === false && !JSON.stringify(response.body).includes(OTHER) && (standing !== "denied" || response.body.account.denied === true) && (standing !== "departed" || response.body.account.inServer === false) && (standing !== "banned" || response.body.verification.bannedFromVerifying === true));
      }
      {
        const f = await newAccount(1001), session = await cookieFor(f.id), first = await start(f.id,session), form = await accountForm(session);
        const results = [first, await postCopy(session,first.body.actions.currentCursor,"history",form), await postCopy(session,first.body.actions.currentCursor,"download",form), await postCopy(session,first.body.actions.nextCursor,"history",form), await postCopy(session,first.body.actions.nextCursor,"download",form)];
        const sixth = await postCopy(session,first.body.actions.currentCursor,"history",form);
        check(".118 initial API download, history views and JSON downloads share five copy reads per hour", results.every(x => x.status === 200) && sixth.status === 429 && sixth.text.includes("slow_down") && sixth.text.includes("Five copy views or downloads") && copies(f.id) === 6); // one seeded pre-capture audit plus five accepted reads
        const limitedDownload = await postCopy(session,first.body.actions.currentCursor,"download",form);
        check(".218 rate-limited action download is a script-free branded HTML refusal, not an attachment or raw JSON", limitedDownload.status===429 && limitedDownload.headers.get("Content-Type")==="text/html; charset=utf-8" && !limitedDownload.headers.get("Content-Disposition") && limitedDownload.text.includes('<h1>Copy temporarily unavailable</h1>') && limitedDownload.headers.get("Content-Security-Policy").includes("script-src 'none'"));
        check(".218 action download preserves only the private matching continuation and manual return", limitedDownload.text.includes('Saved action continuation') && limitedDownload.text.includes(first.body.actions.currentCursor) && limitedDownload.text.includes('href="/privacy/account"') && !limitedDownload.text.includes('Saved event-change continuation') && !limitedDownload.text.includes('Saved contribution-decision continuation') && !limitedDownload.text.includes('<script') && limitedDownload.headers.get("Referrer-Policy")==="no-referrer");
        check(".218 limited action download makes no new export audit or completed-copy claim", copies(f.id)===6 && !Object.hasOwn(limitedDownload.body,"account") && limitedDownload.text.includes('No new copy was made') && !limitedDownload.text.includes('foreign.'));
        const limitedInitialDownload = await postCopy(session,"","download",form);
        check(".218 initial limited download invents no continuation or attachment",limitedInitialDownload.status===429 && !limitedInitialDownload.text.includes('<textarea') && !limitedInitialDownload.headers.get("Content-Disposition") && copies(f.id)===6);
      }
      // .118 representative local SQL load: diagnostics only, no timing SLA or query-plan efficiency assertion.
      {
        const originalTime=T, times=[]; let f;
        f=await newAccount(6001);
        await fixtureMany("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,NULL)",Array.from({length:100000},()=>[T,OTHER,'unrelated.bulk',OTHER]));
        const session=await cookieFor(f.id), pages=[];
        const timed=async(label,operation)=>{const at=performance.now();try{return await operation();}finally{times.push({label,ms:Math.round((performance.now()-at)*100)/100});}};
        try {
          let response=await timed("page1",()=>start(f.id,session)); pages.push(response.body.actions);
          let next=response.body.actions.nextCursor;
          for(let i=2;i<=5;i++) { response=await timed("page"+i,()=>postCopy(session,next)); pages.push(response.body.actions); next=response.body.actions.nextCursor; }
          check(".118 6001 own rows amid 100000 unrelated rows: five bounded reads reach 5000 and truthfully retain 1001", response.status===200 && pages.length===5 && pages.every((p,i)=>p.entries.length===1000 && p.capture.count===6001 && p.capture.delivered===(i+1)*1000 && p.capture.complete===false) && pages.at(-1).capture.remaining===1001 && pages.at(-1).nextCursor===next && next!==null);
          const beforeLimited=copies(f.id), limited=await timed("limited-page6",()=>postCopy(session,next,"history"));
          check(".118 the sixth large-range read is 429 without a false completed payload or a new export audit", limited.status===429 && limited.text.includes("slow_down") && !("actions" in limited.body) && copies(f.id)===beforeLimited);
          T+=3601; const fresh=await accountForm(session);
          for(let i=6;i<=7;i++) { response=await timed("resumed-page"+i,()=>postCopy(session,next,"download",fresh)); pages.push(response.body.actions); next=response.body.actions.nextCursor; }
          const entries=pages.flatMap(p=>p.entries);
          check(".118 after the shared rate window the same signed cookie/continuation resumes to exact range completion", response.status===200 && pages.map(p=>p.entries.length).join()==="1000,1000,1000,1000,1000,1000,1" && JSON.stringify(entries)===JSON.stringify(f.expected) && new Set(entries.map(x=>x.action)).size===6001 && pages.every(p=>p.capture.at===pages[0].capture.at && p.capture.count===6001) && pages.at(-1).capture.delivered===6001 && pages.at(-1).capture.remaining===0 && pages.at(-1).capture.complete===true && next===null && entries.filter(x=>x.action==="site.copy_exported").length===1 && copies(f.id)===beforeLimited+2);
        } finally { T=originalTime; console.log(".118 local read elapsed milliseconds (diagnostic only; scan/index cost is not guaranteed): "+JSON.stringify(times)); }
      }
      console.log("\n== .119: separate actor-owned retained event-change capture ==");
      {
        const eventForm = async session => {
          const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account", { headers: { Cookie: session } }), env(ON), ctx);
          const text = await res.text(), forms = [...text.matchAll(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/g)];
          const form = forms.find(x => x[1].includes('name="collection" value="event_changes"'))?.[1] || "";
          return { nonce: (res.headers.get("Set-Cookie") || "").split(";")[0], csrf: (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "", text };
        };
        const eventPost = async (session, token = "", mode = "download", controls, extra = {}, headers = {}) => {
          const f = controls || await eventForm(session);
          const res = await indexMod.default.fetch(new Request("https://guild.example/privacy/account/export", { method: "POST", headers: { Cookie: [session,f.nonce].join("; "), Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams({ csrf: f.csrf, collection: "event_changes", eventChanges: token, mode, ...extra }).toString() }), env(ON), ctx);
          const text = await res.text(); let body = {}; try { body = JSON.parse(text); } catch { /* Real script-free view/refusal. */ }
          return { status: res.status, text, body, headers: res.headers };
        };
        const seedEvents = async (size, over = {}) => {
          const f = await newAccount(0, over), expected = [], values = [];
          const insertSQL="INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)";
          for (let i=0;i<size;i++) {
            const eventId = "E"+String(i).padStart(21,"0"), at=T+2000+Math.floor(i/700), action=i===0?"created":i===size-1?"cancelled":"updated", fields=action==="updated"?["title","capacity"]:[];
            values.push([eventId,action,f.id,at,JSON.stringify(fields)],["F"+String(i).padStart(21,"0"),"updated",OTHER,at,'["details"]']);
            expected.push({ eventId,action,at:iso(at),changedFieldNames:fields });
          }
          const receipts=await fixtureMany(insertSQL,values),rowIds=expected.map((_,i)=>Number(receipts[i*2].meta.last_row_id));
          return { ...f,expected,rowIds };
        };
        for (const size of [0,1,1000,1001,2005]) {
          const f=await seedEvents(size), session=await cookieFor(f.id), form=await eventForm(session), first=await eventPost(session,"","download",form);
          const page=first.body.eventChanges;
          check(`.119 ${size}: own actor range has exact count, bounded page and explicit curated partial coverage`, first.status===200 && form.csrf!=="" && page.capture.kind==="retained_event_change_range" && page.capture.count===size && page.entries.length===Math.min(size,1000) && page.capture.delivered===Math.min(size,1000) && page.capture.remaining===Math.max(size-1000,0) && page.capture.complete===(size<=1000) && first.body.coverage.eventChangesPageLimit===1000 && first.body.coverage.completeErasure===false && typeof page.currentCursor==="string");
          await fixtureRun("INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)","B".repeat(22),"updated",f.id,T-9000,'["title"]');
          await fixtureRun("INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)","L".repeat(22),"updated",f.id,T+9000,'["details"]');
          const pages=[page]; let token=page.nextCursor;
          while(token) { const response=await eventPost(session,token); check(".119 real Next POST admits the same event capture",response.status===200); pages.push(response.body.eventChanges); token=response.body.eventChanges.nextCursor; }
          check(`.119 ${size}: ties and interleaved foreign ids traverse exactly once; later/backdated own changes are excluded`, JSON.stringify(pages.flatMap(p=>p.entries))===JSON.stringify(f.expected) && pages.every(p=>p.capture.count===size && p.capture.at===page.capture.at) && pages.at(-1).capture.complete===true && token===null);
          if(size===1) {
            const same=await eventPost(session,page.currentCursor), actions=await start(f.id,session);
            check(".119 same-page JSON retains its event capture while the original action capture remains a separate dataset",same.status===200 && JSON.stringify(same.body.eventChanges.entries)===JSON.stringify(f.expected) && same.body.eventChanges.capture.count===1 && actions.status===200 && actions.body.actions.capture.kind==="retained_action_range");
          }
        }
        for (const mutation of ["delivered-delete","remaining-delete","actor-drop","tuple-drop"]) {
          const f=await seedEvents(1001), session=await cookieFor(f.id), first=await eventPost(session), token=first.body.eventChanges.nextCursor;
          if(mutation==="actor-drop") await fixtureRun("UPDATE community_event_changes SET actor=? WHERE id=?",OTHER,f.rowIds[1000]);
          else if(mutation==="tuple-drop") await fixtureRun("UPDATE community_event_changes SET at=? WHERE id=?",T+1999,f.rowIds[1000]);
          else await fixtureRun("DELETE FROM community_event_changes WHERE id=?",f.rowIds[mutation==="delivered-delete"?0:1000]);
          const before=copies(f.id), response=await eventPost(session,token);
          check(`.119 ${mutation}: observable captured count/position changes refuse completion and audit`,response.status===409 && response.body.error==="event_history_changed" && !("eventChanges" in response.body) && !("account" in response.body) && !response.headers.get("Content-Disposition") && copies(f.id)===before);
        }
        for (const [name,patch] of [["event-id","event_id='bad'"],["unknown-field","fields='[\"unknown\"]'"],["duplicate-field","fields='[\"title\",\"title\"]'"],["non-array","fields='{}'"],["empty-updated","fields='[]'"],["oversized-json","fields='"+JSON.stringify(["x".repeat(260)])+"'"]]) {
          const f=await seedEvents(3), session=await cookieFor(f.id); (await fixtureRun("UPDATE community_event_changes SET "+patch+" WHERE id="+f.rowIds[1]));
          const before=copies(f.id), response=await eventPost(session);
          check(`.119 malformed stored ${name} is a refusal with no projected arbitrary text/audit`,response.status===409 && response.body.error==="event_history_changed" && !("eventChanges" in response.body) && copies(f.id)===before);
        }
        {
          const f=await seedEvents(1001), session=await cookieFor(f.id), first=await eventPost(session), token=first.body.eventChanges.nextCursor, form=await eventForm(session), actionForm=await accountForm(session);
          const actionFirst=await start(f.id,session), actionToken=actionFirst.body.actions.currentCursor;
          const badParts=token.split("."); badParts[8]=(badParts[8][0]==="A"?"B":"A")+badParts[8].slice(1); const bad=badParts.join("."), before=copies(f.id);
          let batches=0; BEFORE=()=>{batches++;};
          for(const [label,raw] of [["changed MAC",bad],["other dataset",actionToken]]) {
            const r=await eventPost(session,raw,"download",form);
            check(".119 "+label+" refuses before admitted batch and shared-limit charge",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          }
          const crossed=await postCopy(session,token,"download",actionForm);
          check(".119 event token cannot continue the original action range",crossed.status===400 && crossed.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          for(const extra of [{actions:""},{collection:"actions"},{collection:""},{collection:"unknown"},{mode:"unknown"}]) {
            const r=await eventPost(session,token,"history",form,extra);
            check(".119 strict collection/field/mode pairing refuses even empty mismatched fields",r.status===400 && r.text.includes("invalid_form") && !r.text.includes(token) && batches===0 && copies(f.id)===before);
          }
          const wrongCsrf=await eventPost(session,token,"history",actionForm), origin=await eventPost(session,token,"history",form,{}, {Origin:"https://other.example"});
          check(".119 event dataset uses real bound CSRF and same-origin admission",wrongCsrf.status===403 && origin.status===403 && batches===0 && copies(f.id)===before);
          for(const path of ["?eventChanges="+encodeURIComponent(token),"?collection=event_changes"]) {
            const r=await call("GET","/api/me/export"+path,f.id,undefined,ON,{Cookie:session});
            check(".119 API query cannot select/continue a dataset",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          }
          BEFORE=null;
          const other=await seedEvents(1), otherSession=await cookieFor(other.id); batches=0; BEFORE=()=>{batches++;};
          const crossedAccount=await eventPost(otherSession,token); BEFORE=null;
          check(".119 another valid account cannot use a signed event continuation",crossedAccount.status===400 && crossedAccount.body.error==="invalid_cursor" && batches===0 && copies(other.id)===0);
          const payload=cookiePayload(session), replacement=await renewedSession(f.id,60); batches=0; BEFORE=()=>{batches++;};
          const expiry=await eventPost(replacement,token); BEFORE=null;
          check(".119 valid replacement expiry cannot reinterpret the original event token",expiry.status===400 && expiry.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
          await fixtureRun("UPDATE site_users SET session_version=2 WHERE discord_id=?",f.id);
          const newVersion=await renewedSession(f.id); batches=0; BEFORE=()=>{batches++;}; const version=await eventPost(newVersion,token); BEFORE=null;
          check(".119 valid replacement version cannot continue the original event session",version.status===400 && version.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);
        }
        for(const standing of ["denied","departed","banned"]) {
          const f=await seedEvents(1,{denied:standing==="denied"?1:0,in_server:standing==="departed"?0:1}); if(standing==="banned") await fixtureRun("INSERT INTO members(discord_id,linked_at,banned) VALUES(?,?,1)",f.id,T);
          const r=await eventPost(await cookieFor(f.id));
          check(".119 "+standing+": real valid site session reads its own event changes without guild grant",r.status===200 && r.body.account.discordId===f.id && r.body.eventChanges.capture.count===1 && r.body.coverage.completeErasure===false && !JSON.stringify(r.body.eventChanges).includes(OTHER));
        }
        {
          const f=await seedEvents(1), session=await cookieFor(f.id), form=await eventForm(session), before=copies(f.id);
          nativeTimeOverride=cookiePayload(session).e+1;let batches=0; BEFORE=()=>{batches++;};
          const response=await eventPost(session,"","history",form); BEFORE=null;nativeTimeOverride=null;
          check(".119 genuine database-clock expiry refuses at the original Native account read, with no rows/completion/audit",response.status===401 && batches===0 && !response.text.includes("Current event-change page continuation") && copies(f.id)===before,response.status,response.text.slice(0,180),batches);
          const user=await siteCore.currentUser(env(),new Request("https://guild.example/",{headers:{Cookie:session}})); batches=0; BEFORE=()=>{batches++;};
          let wrong;try{await exporter.exportMyEventChanges(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:session}}),env(ON),{...user,discord_id:OTHER});}catch(error){wrong=error;} BEFORE=null;
          check(".119 passed-user primitives cannot substitute for the signed event subject",wrong?.message==="privacy_original_user_held" && batches===0 && copies(f.id)===before);
        }
        {
          const f=await seedEvents(2005), session=await cookieFor(f.id), first=await eventPost(session), page=first.body.eventChanges, form=await eventForm(session);
          const history=await eventPost(session,page.currentCursor,"history",form);
          check(".119 script-free event view escapes/presents only known projected data and POST-only Current/Next controls",history.status===200 && history.text.includes("Current event-change page continuation") && history.text.includes("Next event-change page continuation") && history.text.includes('name="collection" value="event_changes"') && history.text.includes('name="eventChanges" value="'+page.nextCursor+'"') && !history.text.includes('name="actions"') && !history.text.includes("<script") && !history.text.includes("?eventChanges="));
          await postCopy(session); await eventPost(session,page.currentCursor); await postCopy(session);
          const before=copies(f.id), limited=await eventPost(session,page.nextCursor,"history",form);
          check(".119 action/download/event views share five reads; valid sixth event view retains matching private POST continuation",limited.status===429 && limited.text.includes("Saved event-change continuation") && limited.text.includes('name="eventChanges" value="'+page.nextCursor+'"') && limited.text.includes('name="collection" value="event_changes"') && !limited.text.includes('name="actions"') && copies(f.id)===before);
          const downloadRefused=await eventPost(session,page.nextCursor,"download",form);
          check(".218 limited event download preserves HTML status and only its matching private continuation",downloadRefused.status===429 && downloadRefused.headers.get("Content-Type")==="text/html; charset=utf-8" && downloadRefused.text.includes('<h1>Copy temporarily unavailable</h1>') && downloadRefused.text.includes('Saved event-change continuation') && downloadRefused.text.includes(page.nextCursor) && !downloadRefused.text.includes('Saved action continuation') && !downloadRefused.text.includes('Saved contribution-decision continuation') && !downloadRefused.headers.get("Content-Disposition") && copies(f.id)===before);
          check(".218 limited event download retains script-free/no-referrer shell and no success payload",downloadRefused.headers.get("Content-Security-Policy").includes("script-src 'none'") && downloadRefused.headers.get("Referrer-Policy")==="no-referrer" && !Object.hasOwn(downloadRefused.body,"eventChanges") && downloadRefused.text.includes('No new copy was made'));
          const time=T; try { T+=3601; const r=await eventPost(session,page.nextCursor,"download",await eventForm(session)); check(".119 rate-window resume keeps original signed event capture and fresh form",r.status===200 && r.body.eventChanges.capture.count===2005 && r.body.eventChanges.capture.delivered===2000 && r.body.eventChanges.capture.remaining===5 && r.body.eventChanges.capture.at===page.capture.at); } finally {T=time;}
        }
      }
      console.log("\n== .120: captured own contribution decisions, not an all-store copy ==");
      {
        const decisionActions = ["allocation_reversed","receipt_voided","removal_recorded","state_open","state_exempt","state_disputed","state_resolved","contact_acknowledged","contact_officer_contact","contact_final_notice","contact_final_acknowledged","contact_final_officer_contact"];
        const putDecision = fixtureStatement("INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)");
        const realNow = () => T;
        const seedDecisions = async (size, over={}) => {
          const f=await newAccount(0,over), expected=[], values=[], deadline=realNow()+86400;
          for(let i=0;i<size;i++) {
            const at=T+3000+Math.floor(i/700), action=decisionActions[i%decisionActions.length], kind=i%6;
            const subject=kind<2?f.id:OTHER, actor=["member:"+f.id,"user:"+f.id,"member:"+f.id,"staff:"+f.id,f.id,"user:"+f.id][kind];
            values.push(["Olympus-I",subject,999,action,actor,7,"private-nonce",at,deadline],["foreign-scope",OTHER,998,"state_open","staff:"+OTHER,8,"foreign-nonce",at,deadline]);
            expected.push({action,at:iso(at),guildScope:"Olympus-I",retainUntil:iso(deadline),relation:kind<2?"both":"actor"});
          }
          const receipts=await fixtureMany("INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)",values),rowIds=expected.map((_,i)=>Number(receipts[i*2].meta.last_row_id));
          // Non-matching and erased aliases, expired own records and another person's rows remain excluded.
          for(const actor of ["user:"+f.id+"0","staff:"+OTHER,"erased"]) (await putDecision.run("alias-scope",OTHER,997,"state_open",actor,9,"alias-nonce",T,deadline));
          (await putDecision.run("expired-scope",f.id,996,"state_open","member:"+f.id,10,"expired-nonce",T,realNow()-1));
          return {...f,expected,rowIds,deadline};
        };
        const decisionForm = async session => {
          const res=await indexMod.default.fetch(new Request("https://guild.example/privacy/account",{headers:{Cookie:session}}),env(ON),ctx), text=await res.text();
          const form=[...text.matchAll(/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/g)].find(x=>x[1].includes('name="collection" value="contribution_decisions"'))?.[1]||"";
          return {nonce:(res.headers.get("Set-Cookie")||"").split(";")[0],csrf:(form.match(/name="csrf" value="([^"]+)"/)||[])[1]||"",text};
        };
        const decisionPost = async (session,token="",mode="download",controls,extra={},headers={}) => {
          const f=controls||await decisionForm(session), res=await indexMod.default.fetch(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:[session,f.nonce].join("; "),Origin:"https://guild.example","Content-Type":"application/x-www-form-urlencoded",...headers},body:new URLSearchParams({csrf:f.csrf,collection:"contribution_decisions",contributionDecisions:token,mode,...extra}).toString()}),env(ON),ctx);
          const text=await res.text();let body={};try{body=JSON.parse(text);}catch{/* Actual script-free view/refusal. */}return {status:res.status,text,body,headers:res.headers};
        };
        for(const size of [0,1,1000,1001,2005]) {
          const f=await seedDecisions(size), session=await cookieFor(f.id), first=await decisionPost(session), p=first.body.contributionDecisions;
          check(`.120 ${size}: exact subject/raw/user/member/staff ownership deduplicates both and omits foreign/erased aliases/private fields`,first.status===200 && p.capture.kind==="retained_contribution_decision_range" && p.capture.count===size && p.entries.length===Math.min(size,1000) && p.capture.complete===(size<=1000) && first.body.coverage.contributionDecisionsPageLimit===1000 && first.body.coverage.completeErasure===false && p.entries.every(row=>Object.keys(row).sort().join(",")==="action,at,guildScope,relation,retainUntil") && !JSON.stringify(p).includes(OTHER) && p.entries.every(row=>row.guildScope==="Olympus-I"&&row.retainUntil===iso(f.deadline)) && !["foreign-scope","alias-scope","expired-scope","private-nonce","foreign-nonce","alias-nonce","expired-nonce"].some(token=>JSON.stringify(p).includes(token)));
          (await putDecision.run("later",f.id,999,"state_open","staff:"+f.id,11,"later",T-9000,f.deadline));(await putDecision.run("later",f.id,999,"state_open","staff:"+f.id,11,"later",T+9000,f.deadline));
          const pages=[p];let token=p.nextCursor;
          while(token){const next=await decisionPost(session,token);check(".120 real Next POST retains its contribution capture",next.status===200);pages.push(next.body.contributionDecisions);token=next.body.contributionDecisions.nextCursor;}
          check(`.120 ${size}: identical-time order and interleaved foreign ids traverse exactly once; later/backdated inserts stay outside H`,JSON.stringify(pages.flatMap(x=>x.entries))===JSON.stringify(f.expected) && pages.every(x=>x.capture.count===size && x.capture.at===p.capture.at) && pages.at(-1).capture.complete===true && token===null);
          if(size===1){const current=await decisionPost(session,p.currentCursor), original=await start(f.id,session);check(".120 Current contribution download and default JSON preserve separate action/event collections",current.status===200 && JSON.stringify(current.body.contributionDecisions.entries)===JSON.stringify(f.expected) && original.status===200 && original.body.actions.capture.kind==="retained_action_range" && original.body.eventChanges.capture.kind==="retained_event_change_range" && original.body.contributionDecisions.capture.count===3);}
        }
        for(const spelling of ["raw","user","member","staff"]) {
          const f=await seedDecisions(0), actor=spelling==="raw"?f.id:spelling+":"+f.id, at=T-123;
          (await putDecision.run("Olympus-II",OTHER,123,"state_disputed",actor,9,"counterpart-private-nonce",at,f.deadline));
          const ordinary=await decisionPost(await cookieFor(f.id));
          check(".150 exact actor-only "+spelling+" is included once through actual ordinary HTTP",ordinary.status===200 && ordinary.body.contributionDecisions.capture.count===1 && JSON.stringify(ordinary.body.contributionDecisions.entries)===JSON.stringify([{action:"state_disputed",at:iso(at),guildScope:"Olympus-II",retainUntil:iso(f.deadline),relation:"actor"}]));
          check(".150 actor-only "+spelling+" retains closed projection without counterpart or private linkage",!JSON.stringify(ordinary.body.contributionDecisions).includes(OTHER) && ordinary.body.contributionDecisions.entries.every(row=>row.guildScope==="Olympus-II"&&row.retainUntil===iso(f.deadline)) && !["counterpart-private-nonce","private-nonce","foreign-scope","foreign-nonce"].some(token=>JSON.stringify(ordinary.body.contributionDecisions).includes(token)) && ordinary.body.contributionDecisions.entries.every(row=>Object.keys(row).sort().join(",")==="action,at,guildScope,relation,retainUntil"));
          const selected=db.prepare(load("./community-contributions").ownContributionCopyDecisionSource()).all(f.id);
          check(".150 identify and ordinary "+spelling+" select the same minimized relationship",selected.length===1 && selected[0].own_subject===0 && selected[0].own_actor===1 && selected[0].at===at && selected[0].action==="state_disputed" && selected[0].guild_scope==="Olympus-II" && selected[0].retain_until===f.deadline && Object.keys(selected[0]).sort().join(",")==="action,at,guild_scope,id,own_actor,own_subject,retain_until");
        }
        for(const mutation of ["delivered-delete","remaining-delete","ownership-drop","tuple-drop","retention-expired"]) {
          const f=await seedDecisions(1001), session=await cookieFor(f.id), first=await decisionPost(session), token=first.body.contributionDecisions.nextCursor;
          if(mutation==="ownership-drop") await fixtureRun("UPDATE community_contribution_decisions SET discord_id=?,actor=? WHERE id=?",OTHER,"staff:"+OTHER,f.rowIds[1000]);
          else if(mutation==="tuple-drop") await fixtureRun("UPDATE community_contribution_decisions SET at=? WHERE id=?",T+2999,f.rowIds[1000]);
          else if(mutation==="retention-expired") await fixtureRun("UPDATE community_contribution_decisions SET retain_until=? WHERE id=?",realNow()-1,f.rowIds[1000]);
          else await fixtureRun("DELETE FROM community_contribution_decisions WHERE id=?",f.rowIds[mutation==="delivered-delete"?0:1000]);
          const before=copies(f.id), response=await decisionPost(session,token);
          check(".120 "+mutation+": changed captured membership/count/position refuses without completion or copy audit",response.status===409 && response.body.error==="contribution_history_changed" && !("contributionDecisions" in response.body) && !response.headers.get("Content-Disposition") && copies(f.id)===before);
        }
        for(const [name,patch] of [["unknown-action","action='unrecognized'"],["negative-time","at=-1"],["malformed-deadline","retain_until='not-a-number'"]]) {
          const f=await seedDecisions(3),session=await cookieFor(f.id);(await fixtureRun("UPDATE community_contribution_decisions SET "+patch+" WHERE id="+f.rowIds[1]));const before=copies(f.id),r=await decisionPost(session);
          check(".120 stored "+name+" is refused rather than projected/completed/audited",r.status===409 && r.body.error==="contribution_history_changed" && copies(f.id)===before);
        }
        {
          const f=await seedDecisions(1001),session=await cookieFor(f.id);await fixtureRun("UPDATE community_contribution_decisions SET action='unknown-lookahead' WHERE id=?",f.rowIds[1000]);const before=copies(f.id),r=await decisionPost(session);
          check(".120 malformed 1001st lookahead refuses before reporting a valid first page",r.status===409 && r.body.error==="contribution_history_changed" && copies(f.id)===before);
        }
        {
          const f=await seedDecisions(1),session=await cookieFor(f.id),user=await siteCore.currentUser(env(),new Request("https://guild.example/",{headers:{Cookie:session}}));
          for(const corruption of ["missing-meta","non-array-meta","missing-rows","bad-flags","count-mismatch"]) {
            const e=env(ON),before=copies(f.id);let observed=0;AFTER=(_i,plan,out)=>{const m=plan.findIndex(st=>st.statement.includes('community_contribution_decisions')&&st.statement.includes(' AS total_count'));if(m<0)return;observed++;if(!out[m]?.results[0]||!out[m+1]?.results[0])throw Error("expected genuine admitted decision payload");if(corruption==="missing-meta")out[m]=undefined;else if(corruption==="non-array-meta")out[m]={results:{}};else if(corruption==="missing-rows")out[m+1]=undefined;else if(corruption==="bad-flags")out[m+1].results[0].own_actor=2;else out[m].results[0].total_count++;};
            const response=await exporter.exportMyContributionDecisions(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:session}}),e,user), body=await response.json();AFTER=null;
            check(".120 returned D1 boundary "+corruption+" refuses after one genuine SQLite admission, without fake proofs/audit",response.status===409 && body.error==="contribution_history_changed" && observed===1 && copies(f.id)===before);
          }
        }
        {
          const f=await seedDecisions(1001),session=await cookieFor(f.id),first=await decisionPost(session),token=first.body.contributionDecisions.nextCursor,form=await decisionForm(session),actionForm=await accountForm(session), actionFirst=await start(f.id,session);
          const bad=token.split(".");bad[8]=(bad[8][0]==="A"?"B":"A")+bad[8].slice(1);const before=copies(f.id);let batches=0;BEFORE=()=>{batches++;};
          for(const raw of [bad.join("."),actionFirst.body.actions.currentCursor,actionFirst.body.eventChanges.currentCursor,"01."+token.slice(2)]){const r=await decisionPost(session,raw,"download",form);check(".120 wrong domain/significant MAC/noncanonical grammar cannot admit a contribution payload",r.status===400 && batches===0 && copies(f.id)===before);}
          for(const extra of [{actions:""},{eventChanges:""},{collection:"actions"},{collection:"unknown"},{collection:""},{mode:"unknown"}]){const r=await decisionPost(session,token,"history",form,extra);check(".120 mismatched collection/field/mode refuses with no cursor reflection or batch",r.status===400 && r.text.includes("invalid_form") && !r.text.includes(token) && batches===0 && copies(f.id)===before);}
          const csrf=await decisionPost(session,token,"history",actionForm),origin=await decisionPost(session,token,"history",form,{}, {Origin:"https://other.example"});check(".120 real decision-bound CSRF and canonical origin cannot use action admission",csrf.status===403 && origin.status===403 && batches===0 && copies(f.id)===before);
          for(const query of ["?contributionDecisions="+encodeURIComponent(token),"?collection=contribution_decisions"]){const r=await call("GET","/api/me/export"+query,f.id,undefined,ON,{Cookie:session});check(".120 GET addresses cannot select or resume contributions",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);}
          BEFORE=null;const other=await seedDecisions(1),otherSession=await cookieFor(other.id);batches=0;BEFORE=()=>{batches++;};const cross=await decisionPost(otherSession,token);BEFORE=null;check(".120 another valid account cannot use the signed contribution capture",cross.status===400 && cross.body.error==="invalid_cursor" && batches===0 && copies(other.id)===0);
          const payload=cookiePayload(session);for(const change of ["expiry","version"]){if(change==="version")await fixtureRun("UPDATE site_users SET session_version=2 WHERE discord_id=?",f.id);const replaced=await renewedSession(f.id,change==="expiry"?60:0);batches=0;BEFORE=()=>{batches++;};const r=await decisionPost(replaced,token);BEFORE=null;check(".120 replacement "+change+" cannot reinterpret a contribution continuation",r.status===400 && r.body.error==="invalid_cursor" && batches===0 && copies(f.id)===before);}
        }
        for(const standing of ["denied","departed","banned"]){const f=await seedDecisions(1,{denied:standing==="denied"?1:0,in_server:standing==="departed"?0:1});if(standing==="banned")await fixtureRun("INSERT INTO members(discord_id,linked_at,banned) VALUES(?,?,1)",f.id,T);const r=await decisionPost(await cookieFor(f.id));check(".120 "+standing+": valid site identity retains own read without guild access",r.status===200 && r.body.account.discordId===f.id && r.body.contributionDecisions.capture.count===1 && r.body.coverage.completeErasure===false);}
        {
          const f=await seedDecisions(1),session=await cookieFor(f.id),form=await decisionForm(session),before=copies(f.id);nativeTimeOverride=cookiePayload(session).e+1;let batches=0;BEFORE=()=>{batches++;};const r=await decisionPost(session,"","history",form);BEFORE=null;nativeTimeOverride=null;
          check(".120 genuine DB-clock expiry refuses at the original Native account read and emits no history/audit",r.status===401 && batches===0 && !r.text.includes("Current contribution-decision page continuation") && copies(f.id)===before,r.status,r.text.slice(0,180),batches);
          const user=await siteCore.currentUser(env(),new Request("https://guild.example/",{headers:{Cookie:session}}));batches=0;BEFORE=()=>{batches++;};let wrong;try{await exporter.exportMyContributionDecisions(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:session}}),env(ON),{...user,discord_id:OTHER});}catch(error){wrong=error;}BEFORE=null;
          check(".120 passed-user primitives cannot substitute for the signed contribution subject",wrong?.message==="privacy_original_user_held" && batches===0 && copies(f.id)===before);
          const mutable={...user};BEFORE=()=>{mutable.discord_id=OTHER;mutable.session_version=999;};const kept=await exporter.exportMyContributionDecisions(new Request("https://guild.example/privacy/account/export",{method:"POST",headers:{Cookie:session}}),env(ON),mutable);BEFORE=null;
          check(".120 caller mutation after snapshot cannot redirect the admitted contribution capture",kept.status===200 && (await kept.json()).contributionDecisions.entries[0].relation==="both");
        }
        {
          const f=await seedDecisions(2005),session=await cookieFor(f.id),first=await decisionPost(session),p=first.body.contributionDecisions,form=await decisionForm(session),view=await decisionPost(session,p.currentCursor,"history",form);
          check(".120 script-free Current/Next controls reveal only the projection and private body continuations",view.status===200 && view.text.includes("Current contribution-decision page continuation") && view.text.includes("Next contribution-decision page continuation") && view.text.includes('name="collection" value="contribution_decisions"') && view.text.includes('name="contributionDecisions" value="'+p.nextCursor+'"') && !view.text.includes('name="actions"') && !view.text.includes('name="eventChanges"') && !view.text.includes("<script") && !view.text.includes("?contributionDecisions=") && !view.text.includes("private-nonce"));
          await postCopy(session);await decisionPost(session,p.currentCursor);await postCopy(session);const before=copies(f.id),limited=await decisionPost(session,p.nextCursor,"history",form);
          check(".120 all three histories/downloads share the unchanged five reads; sixth preserves only the matching private continuation",limited.status===429 && limited.text.includes("Saved contribution-decision continuation") && limited.text.includes('name="contributionDecisions" value="'+p.nextCursor+'"') && limited.text.includes('name="collection" value="contribution_decisions"') && copies(f.id)===before);
          const downloadRefused=await decisionPost(session,p.nextCursor,"download",form);
          check(".218 limited decision download preserves HTML status and only its matching private continuation",downloadRefused.status===429 && downloadRefused.headers.get("Content-Type")==="text/html; charset=utf-8" && downloadRefused.text.includes('<h1>Copy temporarily unavailable</h1>') && downloadRefused.text.includes('Saved contribution-decision continuation') && downloadRefused.text.includes(p.nextCursor) && !downloadRefused.text.includes('Saved action continuation') && !downloadRefused.text.includes('Saved event-change continuation') && !downloadRefused.headers.get("Content-Disposition") && copies(f.id)===before);
          check(".218 limited decision download retains script-free/no-referrer shell and no success payload",downloadRefused.headers.get("Content-Security-Policy").includes("script-src 'none'") && downloadRefused.headers.get("Referrer-Policy")==="no-referrer" && !Object.hasOwn(downloadRefused.body,"contributionDecisions") && downloadRefused.text.includes('No new copy was made'));
          const actorT=T;try{T+=3601;const resumed=await decisionPost(session,p.nextCursor,"download",await decisionForm(session));check(".120 later rate window resumes the same site session and captured contribution range",resumed.status===200 && resumed.body.contributionDecisions.capture.count===2005 && resumed.body.contributionDecisions.capture.delivered===2000 && resumed.body.contributionDecisions.capture.remaining===5 && resumed.body.contributionDecisions.capture.at===p.capture.at);}finally{T=actorT;}
        }
        {
          const f=await seedDecisions(6001),session=await cookieFor(f.id),unrelated=100000;await fixtureMany("INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)",Array.from({length:unrelated},(_,i)=>["unrelated",OTHER,999,"state_open","staff:"+OTHER,1,"unrelated",T+i,f.deadline]));
          const sqls=[],captureEnv={...env(ON),DB:{prepare:sql=>{const x={bind:(...params)=>{sqls.push({sql,params});return x;}};return x;}}},statementCount=statements;load("./community-contributions").ownContributionDecisionStatements(captureEnv,f.id,null);
          check(".120 statement construction grants no authority and performs no reads",statements===statementCount && sqls.length===2);
          const plans=sqls.map(x=>db.prepare("EXPLAIN QUERY PLAN "+x.sql).all(...x.params).map(row=>row.detail));console.log(".120 local SQLite contribution query-plan diagnostic",JSON.stringify({own:6001,unrelated,plans,notD1SLA:true}));
          const started=RealDate.now(),pages=[];let token="";for(let i=0;i<5;i++){const r=await decisionPost(session,token);pages.push(r.body.contributionDecisions);token=r.body.contributionDecisions.nextCursor;}const before=copies(f.id),limited=await decisionPost(session,token,"history");
          check(".120 6001/100k: first five pages reach 5000, sixth cannot complete/audit, remaining capture survives",pages.length===5 && pages.at(-1).capture.delivered===5000 && pages.at(-1).capture.remaining===1001 && limited.status===429 && limited.text.includes(token) && copies(f.id)===before);
          const actorT=T;try{T+=3601;while(token){const r=await decisionPost(session,token,"download",await decisionForm(session));if(r.status!==200)throw Error("same-session contribution rate resume refused");pages.push(r.body.contributionDecisions);token=r.body.contributionDecisions.nextCursor;}}finally{T=actorT;}
          check(".120 6001/100k: resumed pages form the exact owned union, not an all-store or SQL-work guarantee",JSON.stringify(pages.flatMap(p=>p.entries))===JSON.stringify(f.expected) && pages.at(-1).capture.complete===true && pages.every(p=>p.capture.count===6001 && p.capture.at===pages[0].capture.at));console.log(".120 local SQLite contribution traversal diagnostic",JSON.stringify({elapsedMs:RealDate.now()-started,own:6001,unrelated,notD1SLA:true}));
        }
      }
    } finally { BEFORE = savedBefore; AFTER = savedAfter; T = savedT; rangeDb?.close(); db = savedDb; }
  }

  console.log("\n== .133: original-request site-only erasure is one atomic write ==");
  {
    const savedDb = db, savedBefore = BEFORE, savedAfter = AFTER;
    const oldRemove = stubs["./discord"].removeRole, oldAdd = stubs["./discord"].addRole;
    let fixtureDb, roleEffects = 0, batches = 0;
    stubs["./discord"].removeRole = async () => { roleEffects++; };
    stubs["./discord"].addRole = async () => { roleEffects++; };
    const snapshot = () => JSON.stringify(["site_users", "site_applications", "site_votes", "site_friends", "site_reserved", "invite_queue", "community_profiles", "community_refs", "audit"].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    const auditCount = () => one("SELECT COUNT(*) AS n FROM audit WHERE action='site.data_deleted'").n;
    const seed = async () => {
      BEFORE = null; AFTER = null; fixtureDb?.close(); fixtureDb = freshDb(); db = fixtureDb;
      load("./schema").forgetSchemaCheck(); roleEffects = 0; batches = 0;
      for (const id of [MEMBER, OTHER, STAFF, STAFF2]) await siteUser(id);
      await confirm(MEMBER, "Mia One", "Player-1-0001");
      const profile = await call("PUT", "/api/community/profile", MEMBER, { revision: 0, listed: true, main: "Mia One", raidRole: "healer" });
      if (profile.status !== 200) throw Error(".133 real profile fixture refused");
      await fixtureRun("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,'officer',?,'submitted',?,?)",OTHER,JSON.stringify({ references: [{ kind: "discord", key: MEMBER, label: "Mia" }, { kind: "name", label: "Keep" }], reason: "old answer" }),T,T);
      await fixtureRun("INSERT INTO site_votes(voter_id,ballot,slot,nominee_kind,nominee_key,nominee_label,created_at,updated_at) VALUES(?,'officer',1,'discord',?,'Mia',?,?)",OTHER,MEMBER,T,T);
      await fixtureRun("INSERT INTO site_friends(owner_id,friend_kind,friend_key,friend_label,created_at) VALUES(?,'discord',?,'Mia',?)",OTHER,MEMBER,T);
      for (const [id, approver, name] of [[101, "site", "Mia Site"], [102, "verification", "Mia Own"]]) {
        await fixtureRun("INSERT INTO invite_queue(id,name_key,name,discord_id,status,created_at,approved_by,priority) VALUES(?,?,?,?,'queued',?,?,1)",id,name.toLowerCase(),name,MEMBER,T,approver);
        await fixtureRun("INSERT INTO site_reserved(owner_id,name,name_key,status,created_at,queue_id,queued_at) VALUES(?,?,?,'queued',?,?,?)",MEMBER,name,name.toLowerCase(),T,id,T);
      }
    };
    const erasureRequest=async(id,actor)=>new Request(`https://guild.example/api/admin/users/${id}/delete`,{method:'POST',headers:{Cookie:await cookieFor(actor),Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({mentions:true})});
    try {
      for (const [label, trigger] of [
        ["early queue release", "CREATE TRIGGER erasure_fault BEFORE UPDATE ON invite_queue WHEN OLD.id=101 BEGIN SELECT RAISE(ABORT,'synthetic early fault'); END"],
        ["middle community eraser", `CREATE TRIGGER erasure_fault BEFORE DELETE ON community_profiles WHEN OLD.discord_id='${MEMBER}' BEGIN SELECT RAISE(ABORT,'synthetic middle fault'); END`],
        ["terminal account delete", `CREATE TRIGGER erasure_fault BEFORE DELETE ON site_users WHEN OLD.discord_id='${MEMBER}' BEGIN SELECT RAISE(ABORT,'synthetic terminal fault'); END`],
        ["final audit/replay insert", "CREATE TRIGGER erasure_fault BEFORE INSERT ON audit WHEN NEW.action='site.data_deleted' BEGIN SELECT RAISE(ABORT,'synthetic final fault'); END"],
        ["ignored terminal target delete", `CREATE TRIGGER erasure_fault BEFORE DELETE ON site_users WHEN OLD.discord_id='${MEMBER}' BEGIN SELECT RAISE(IGNORE); END`],
        ["ignored final audit/replay insert", "CREATE TRIGGER erasure_fault BEFORE INSERT ON audit WHEN NEW.action='site.data_deleted' BEGIN SELECT RAISE(IGNORE); END"],
      ]) {
        await seed(); db.exec(trigger); const before = snapshot(); BEFORE = () => { batches++; };
        const r = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true }); BEFORE = null;
        check(".133 " + label + " foreign-trigger profile is held before erasure payload and preserves the entire original SQLite state", r.status === 503 && r.body.error === "site_access_unavailable" && batches === 0 && snapshot() === before && auditCount() === 0 && roleEffects === 0, JSON.stringify({status:r.status,error:r.body,batches,unchanged:snapshot()===before,audit:auditCount(),roleEffects}));
        check(".133 " + label + " fault: neither site queue cancellation nor verification priority release leaks", one("SELECT status FROM invite_queue WHERE id=101").status === "queued" && one("SELECT priority FROM invite_queue WHERE id=102").priority === 1 && one("SELECT COUNT(*) AS n FROM site_reserved WHERE status='queued'").n === 2);
      }
      for (const [label, update] of [
        ["original staff session revoked", async () => await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?",STAFF)],
        ["target session changed", async () => await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?",MEMBER)],
        ["target first-login incarnation changed", async () => await fixtureRun("UPDATE site_users SET first_login=first_login+1 WHERE discord_id=?",MEMBER)],
        ["target denial decision changed", async () => await fixtureRun("UPDATE site_users SET denied=1,denied_at=? WHERE discord_id=?",T,MEMBER)],
      ]) {
        await seed(); let current; BEFORE = async () => { BEFORE = null; batches++; await update(); current = snapshot(); };
        const r = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
        check(".133 " + label + " before consuming batch holds with zero erasure effects", r.status === 503 && r.body.error === "erasure_held" && batches === 1 && snapshot() === current && auditCount() === 0 && roleEffects === 0);
      }
      await seed(); const expired=await cookieFor(STAFF),beforeExpiry=snapshot();nativeTimeOverride=originalCookies.get(STAFF).issued.session.e+1;
      BEFORE = () => { batches++; };
      const expiryResult = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true }, ON, { Cookie: expired }); BEFORE = null;nativeTimeOverride=null;
      check(".133 original cookie expired by database clock cannot delete despite older process clock", expiryResult.status === 401 && expiryResult.body.error === "signed_out" && batches === 0 && snapshot() === beforeExpiry && auditCount() === 0,expiryResult.status,expiryResult.body,batches);
      await seed(); const prooflessBefore = snapshot(); let prooflessHeld = false;
      try { await siteAdmin.deleteSiteData(env(ON), MEMBER, STAFF); } catch { prooflessHeld = true; }
      check(".133 proofless internal caller is held; current actor row never synthesizes admission", prooflessHeld && snapshot() === prooflessBefore && auditCount() === 0);
      for (const [label, actor, request] of [
        ["different signed actor", STAFF, await erasureRequest(MEMBER, STAFF2)],
        ["different target path", STAFF, await erasureRequest(OTHER, STAFF)],
        ["unconfigured staff", OTHER, await erasureRequest(MEMBER, OTHER)],
      ]) {
        let held = false; try { await siteAdmin.deleteSiteData(env(ON), MEMBER, actor, true, request); } catch { held = true; }
        check(".133 " + label + " cannot substitute for original subject-bound staff request", held && snapshot() === prooflessBefore && auditCount() === 0);
      }
      for (const [label, headers, status] of [["cross-origin original decision", { Origin: "https://other.example" }, 409], ["old page", { "X-Olympus": "1" }, 409]]) {
        const r = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true }, ON, headers);
        check(".133 " + label + " is refused without site-only effects", r.status === status && snapshot() === prooflessBefore);
      }
      await seed(); BEFORE = async () => { BEFORE = null; batches++; await fixtureRun("UPDATE site_applications SET answers=? WHERE discord_id=?",JSON.stringify({ references: [{ kind: "discord", key: MEMBER }, { kind: "discord", key: STAFF2, label: "Fresh other reference" }], reason: "concurrent answer", newField: "preserve" }),OTHER); };
      const scrub = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
      const currentAnswers = JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id=?", OTHER).answers);
      check(".133 consuming-current mention scrub preserves concurrently changed fields and unrelated reference", scrub.status === 200 && currentAnswers.reason === "concurrent answer" && currentAnswers.newField === "preserve" && currentAnswers.references.length === 1 && currentAnswers.references[0].key === STAFF2 && batches === 1);
      check(".133 successful transaction releases both queue forms, deletes site/community data and records exactly one existing audit/replay row", !one("SELECT 1 FROM site_users WHERE discord_id=?", MEMBER) && !one("SELECT 1 FROM community_profiles WHERE discord_id=?", MEMBER) && !one("SELECT 1 FROM site_reserved WHERE owner_id=?", MEMBER) && one("SELECT status FROM invite_queue WHERE id=101").status === "cancelled" && one("SELECT priority FROM invite_queue WHERE id=102").priority === 0 && auditCount() === 1);
      const receipt = one("SELECT * FROM audit WHERE action='site.data_deleted'");
      check(".133 dated manual-replay record has only existing actor/subject and mentions boolean, no cookie or application fields", receipt.actor === STAFF && receipt.subject === MEMBER && receipt.details === '{"mentions":true}' && receipt.ts===T);
      check(".133 site-only success preserves bot membership/character linkage and never changes roles", !!one("SELECT 1 FROM members WHERE discord_id=?", MEMBER) && !!one("SELECT 1 FROM characters WHERE discord_id=?", MEMBER) && roleEffects === 0);
      const alreadyGone = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
      check(".133 absent target cannot mint a fresh original decision and cannot create a second manual-replay audit", alreadyGone.status === 409 && alreadyGone.body.error === "original_membership_decision_held" && auditCount() === 1);
      await seed(); const untouched = ' { "references": [], "reason": "keep exact" }';
      await fixtureRun("UPDATE site_applications SET answers=? WHERE discord_id=?",untouched,OTHER);
      const none = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
      check(".133 no matching reference retains whole unrelated document bytes", none.status === 200 && one("SELECT answers FROM site_applications WHERE discord_id=?", OTHER).answers === untouched);
      const mixed = [null, false, true, 7, "text", [1, "array"], { extra: "object" }, { kind: "discord", key: MEMBER }, { kind: "name", key: MEMBER }];
      await seed(); await fixtureRun("UPDATE site_applications SET answers=? WHERE discord_id=?",JSON.stringify({ references: mixed, untouched: "current" }),OTHER);
      await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
      const keptMixed = JSON.parse(one("SELECT answers FROM site_applications WHERE discord_id=?", OTHER).answers);
      check(".133 actual eraser preserves primitive/null/boolean/array reference values and removes only exact string Discord entry", JSON.stringify(keptMixed.references) === JSON.stringify(mixed.filter((_,i) => i !== 7)) && keptMixed.untouched === "current");
      for (const text of ['{"references":[', '{"references":null}', '{"references":{"kind":"discord","key":"'+MEMBER+'"}}', '{"references":[{"kind":"discord","kind":"name","key":"'+MEMBER+'"}]}', '{"references":[{"kind":"discord","key":"'+MEMBER+'"}],"references":[]}']) {
        await seed(); await fixtureRun("UPDATE site_applications SET answers=? WHERE discord_id=?",text,OTHER);
        const result = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true });
        check(".133 malformed/non-array/ambiguous legacy reference document is preserved without aborting unrelated site-only deletion", result.status === 200 && one("SELECT answers FROM site_applications WHERE discord_id=?", OTHER).answers === text);
      }
      await seed(); const own = await call("POST", `/api/admin/users/${STAFF}/delete`, STAFF, { mentions: true });
      check(".133 self-target staff deletion consumes admission before intentional account disappearance", own.status === 200 && !one("SELECT 1 FROM site_users WHERE discord_id=?", STAFF) && auditCount() === 1 && one("SELECT actor FROM audit WHERE action='site.data_deleted'").actor === STAFF && roleEffects === 0);
      await seed(); db.exec("CREATE TRIGGER erasure_fault BEFORE INSERT ON audit WHEN NEW.action='site.data_deleted' BEGIN SELECT RAISE(ABORT,'self receipt fault'); END"); const ownBefore = snapshot();
      const ownFault = await call("POST", `/api/admin/users/${STAFF}/delete`, STAFF, { mentions: true });
      check(".133 self-target final receipt fault rolls back its account and actor anonymization", ownFault.status === 503 && snapshot() === ownBefore && auditCount() === 0);
      await seed(); await fixtureRun("UPDATE site_users SET denied=1,denied_at=?,denied_by=?,denied_reason='existing denial detail' WHERE discord_id=?",T-100,STAFF,MEMBER);
      const denied = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true }), denial = one("SELECT * FROM site_users WHERE discord_id=?", MEMBER);
      check(".133 existing denied residue is unchanged policy, with identity cleared and session advanced", denied.status === 200 && denial.denied === 1 && denial.denied_reason === "existing denial detail" && denial.denied_by === STAFF && denial.denied_at === T-100 && denial.username === null && denial.session_version === 2 && denial.first_login === T-100);
      await seed(); const beforeLost = auditCount(), base = env(ON).DB; let attempts = 0;
      const lost = { ...base, batch: async statements => { const payload=statements.some(s=>s.statement?.includes("site_erasure_refused"));if(payload)attempts++;const out=await base.batch(statements);if(payload)throw Error("synthetic committed response loss");return out; } };
      const uncertain = await call("POST", `/api/admin/users/${MEMBER}/delete`, STAFF, { mentions: true }, { ...ON, DB: lost });
      check(".133 lost post-commit answer is held honestly, preserves atomic audit/custody and causes no implicit retry", uncertain.status === 503 && uncertain.body.error === "erasure_held" && attempts === 1 && !one("SELECT 1 FROM site_users WHERE discord_id=?", MEMBER) && auditCount() === beforeLost + 1);
      await seed(); const session = await cookieFor(MEMBER), page = await indexMod.default.fetch(new Request("https://guild.example/privacy/account", { headers: { Cookie: session } }), env(ON), ctx);
      const html = await page.text(), form = (html.match(/<form method="post" action="\/privacy\/account\/full-erase">([\s\S]*?)<\/form>/) || [])[1] || "", csrf = (form.match(/name="csrf" value="([^"]+)"/) || [])[1] || "", formCookie = (page.headers.get("Set-Cookie") || "").split(";")[0], fullBefore = snapshot();
      const full = await indexMod.default.fetch(new Request("https://guild.example/privacy/account/full-erase", { method: "POST", headers: { Cookie: session + "; " + formCookie, Origin: "https://guild.example", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf }).toString() }), env({ ...ON, PRIVACY_FOUNDATION_ON: "on" }), ctx);
      check(".133 actual full-erasure form remains 503/not performed even with a guessed activation boolean", full.status === 503 && (await full.text()).includes("not performed") && snapshot() === fullBefore && roleEffects === 0);
      check(".133 real D1-shaped execution stays within 100 bindings per statement", maxBindings <= 100, maxBindings);
      console.log(".133 SQLite admission/transaction diagnostic", JSON.stringify({ sqlite: one("SELECT sqlite_version() AS v").v, maxBindings, productionD1Native: false, completeErasure: false }));
    } finally {
      BEFORE = savedBefore; AFTER = savedAfter; db = savedDb; fixtureDb?.close();
      stubs["./discord"].removeRole = oldRemove; stubs["./discord"].addRole = oldAdd;
    }
  }
  // .150: newly selected own QR text is bounded and NUL-refused natively before the bridge; older omitted fields retain their scope.
  {
    const savedDb=db,savedBefore=BEFORE,savedAfter=AFTER,savedJson=stubs['./discord'].json,g='a'.repeat(32);let serial=0,fixtureDb;
    try {
      BEFORE=null;AFTER=null;stubs["./discord"].json=realDiscord.json;
      const cases=['requester_name','rank_name','native_rank_name'].flatMap(field=>['NUL','length','huge','blob','empty'].map(kind=>({field,kind}))).concat([{field:null,kind:'excluded and valid boundaries'}]);
      for(const {field,kind} of cases){
        const label=String(field)+' '+kind;
        fixtureDb=freshDb();db=fixtureDb;
        const id=String(970000000000000000n+BigInt(++serial)),other='969999999999999999',outside='968888888888888888';
        await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',3,?,?)",id,g,T,T);
        await siteUser(id,{in_server:0,denied:1});
        const originalSubject=one("SELECT generation,revision FROM privacy_subjects WHERE subject_id=?",id);
        const proof=async (suffix,requester,signer,name,rank)=>{
          const key='qr-nul-key-'+suffix,challenge='qr-nul-challenge-'+suffix,code='qr-nul-code-'+suffix;
          await fixtureRun('INSERT INTO councillor_keys(id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',key,signer,'Selected signer guid '+suffix,'synthetic-public-key-'+suffix,g,1,T-60,T+600);
          await fixtureRun("INSERT INTO councillor_challenges(nonce,key_id,signer,session_version,session_expires,created_at,expires_at,mode,max_proofs) VALUES(?,?,?,1,?,?,?,'single',1)",challenge,key,signer,T+600,T-60,T+600);
          await fixtureRun("INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,state) VALUES(?,?,?,?,?,'proved')",code,requester,g,T-60,T+600);
          await fixtureRun('INSERT INTO verification_proofs(id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','qr-nul-proof-'+suffix,code,challenge,signer,key,requester,'OMITTED_QR_GUID\u0000suffix',name,2,rank,'OMITTED_QR_PROFILE\u0000'+'x'.repeat(20000),'OMITTED_QR_SIGNER_GUID',1,g,'qr-nul-digest-'+suffix,T-60,T+600);
        };
        await proof('own',id,other,'名'.repeat(60),'級'.repeat(64));
        // Selected signer-only proof: counterpart requester/rank text must remain literal NULL, including malformed text.
        await proof('signer',other,id,'FOREIGN_QR_NAME\u0000'+'x'.repeat(20000),'FOREIGN_QR_RANK\u0000'+'x'.repeat(20000));
        // Entirely foreign proof and role rows remain outside the own predicates.
        await proof('outside',outside,other,'OUTSIDE_QR_NAME\u0000'+'x'.repeat(20000),'OUTSIDE_QR_RANK\u0000'+'x'.repeat(20000));
        const role=fixtureStatement("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,native_profile,native_rank,native_rank_name,created_at,expires_at) VALUES(?,?,'rank','OMITTED_QR_GUILD','OMITTED_QR_ROLE',1,'held','roster',?,?,?, ?,?)");
        (await role.run('qr-own-role',id,'OMITTED_QR_ROLE_PROFILE\u0000'+'x'.repeat(20000),2,'級'.repeat(64),T-55,T+600));
        (await role.run('qr-null-role',id,null,null,null,T-54,T+600));
        (await role.run('qr-outside-role',other,'OMITTED_QR_ROLE_PROFILE',2,'OUTSIDE_QR_RANK\u0000'+'x'.repeat(20000),T-53,T+600));
        if(field){
          const table=field==='native_rank_name'?'role_settlements':'verification_proofs',row=field==='native_rank_name'?'qr-own-role':'qr-nul-proof-own',prefix=field==='requester_name'?'Own Character':'Officer';
          const max=field==='requester_name'?60:64,value=kind==='NUL'?prefix+'\u0000bad':kind==='length'?'n'.repeat(max+1):kind==='huge'?'n'.repeat(20000):kind==='blob'?Buffer.from('Officer'):'';
          await fixtureRun('UPDATE '+table+' SET '+field+'=? WHERE id=?',value,row);
          const raw=one('SELECT typeof('+field+') AS type,length('+field+') AS chars,length(CAST('+field+' AS BLOB)) AS bytes,instr('+field+',char(0)) AS nul FROM '+table+' WHERE id=?',row);
          check('.150 QR '+label+' actual native malformed value is stored',kind==='NUL'?raw.nul>0:kind==='blob'?raw.type==='blob':kind==='empty'?raw.chars===0:raw.chars>max);
          if(kind==='huge')check('.150 QR '+label+' actual native bytes exceed conservative cap',raw.bytes>(field==='requester_name'?240:256));
        }
        const e=env({...ON,PRIVACY_RETENTION_ENABLED:'true'}),session=await cookieFor(id),request=new Request('https://guild.example/api/me/export',{headers:{Cookie:session}});
        const original=await siteCore.readSession(e,request);
        check('.150 QR '+label+' original session MAC and generation admitted',original?.u===id&&original.v===1&&original.g===g);
        const response=await indexMod.default.fetch(request,e,ctx);
        check(".150 QR "+label+" actual source formatter returns native Response",response instanceof Response&&response.headers instanceof Headers);
        const text=await response.text();let body={};try{body=JSON.parse(text);}catch{}
        console.log('QR_ORDINARY_NATIVE_ORIGINAL '+JSON.stringify({field:field??'foreign and omitted controls',kind,status:response.status,headers:Object.fromEntries(response.headers),body:text,authority:'actual index.fetch with original signed ordinary session and stored generation',credentialBindingsRecorded:false}));
        if(field){
          check('.150 QR '+label+' own malformed native text refuses through actual ordinary route503',response.status===503&&body.error==='erasure_held');
          check('.150 QR '+label+' no truncated success attachment or payload',!response.headers.get('Content-Disposition')&&!Object.hasOwn(body,'account')&&!Object.hasOwn(body,'community')&&!text.includes('Own Character')&&!text.includes('qr-own-role'));
          check('.150 QR '+label+' native failed read adds no copy audit',one("SELECT COUNT(*) AS n FROM audit WHERE actor=? AND action='site.copy_exported'",id).n===0);
        }else{
          const qr=body.community?.councillor_verification,own=qr?.attestations.rows.find(r=>r.own_part==='requester'),signer=qr?.attestations.rows.find(r=>r.own_part==='signer');
          check('.150 QR excluded/omitted NUL keeps genuine own ordinary copy200',response.status===200&&body.account.discordId===id&&response.headers.get('Content-Disposition')==='attachment; filename="olympus-my-data.json"');
          check('.150 QR requester own valid strings unchanged',own?.requester_name==='名'.repeat(60)&&own.native_rank===2&&own.rank_name==='級'.repeat(64));
          check('.150 QR signer-only counterpart NUL remains three literal nulls',signer?.requester_name===null&&signer.native_rank===null&&signer.rank_name===null);
          check('.150 QR foreign rows and omitted pointers/profile not selected',qr.attestations.rows.length===2&&qr.roleOutcomes.rows.length===2&&!['FOREIGN_QR_NAME','FOREIGN_QR_RANK','OUTSIDE_QR_NAME','OUTSIDE_QR_RANK','OMITTED_QR'].some(t=>text.includes(t)));
          check('.150 QR own role native rank64 boundary preserved',qr.roleOutcomes.rows.find(r=>r.id==='qr-own-role').native_rank_name==='級'.repeat(64));
          const nullable=qr.roleOutcomes.rows.find(r=>r.id==='qr-null-role');check('.150 QR nullable own rank tuple remains explicit null',nullable.native_rank===null&&nullable.native_rank_name===null);
        }
        const current=one('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?',id);
        check('.150 QR '+label+' original generation/revision remains unchanged',current.generation===g&&current.revision===originalSubject.revision);
        fixtureDb.close();fixtureDb=null;
      }
    }finally{db=savedDb;BEFORE=savedBefore;AFTER=savedAfter;stubs["./discord"].json=savedJson;fixtureDb?.close();}
  }
  // .150: own created-event role JSON must be bounded and NUL-refused before native text materialization.
  {
    const savedDb=db,savedBefore=BEFORE,savedAfter=AFTER,savedJson=stubs['./discord'].json,g='c'.repeat(32);let serial=0,fixtureDb;
    try {
      BEFORE=null;AFTER=null;stubs['./discord'].json=realDiscord.json;
      for(const kind of ['NUL','length','huge','blob','valid128','null']){
        fixtureDb=freshDb();db=fixtureDb;
        const id=String(980000000000000000n+BigInt(++serial)),other='979999999999999999',ownId='R'+String(serial).padStart(21,'0'),foreignId='F'+String(serial).padStart(21,'0');
        await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',3,?,?)",id,g,T,T);
        await siteUser(id,{in_server:0,denied:1});
        const originalSubject=one("SELECT generation,revision FROM privacy_subjects WHERE subject_id=?",id);
        const json='{"tank":1,"healer":2,"damage":3}';
        const targets=kind==='NUL'?json+'\u0000ignored':kind==='length'?json+' '.repeat(129-json.length):kind==='huge'?json+' '.repeat(20000):kind==='blob'?Buffer.from(json):kind==='valid128'?json+' '.repeat(128-json.length):null;
        const event=fixtureStatement("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,capacity,role_targets,status,created_by,created_at,updated_at,retain_until) VALUES(?,?,?, ?,60,?,20,?,'scheduled',?,?,?,?)");
        (await event.run(ownId,'own-event-role-'+serial,'Own role metadata',T+600,T+4200,targets,id,T-60,T-30,T+4200+30*86400));
        (await event.run(foreignId,'foreign-event-role-'+serial,'Foreign public event',T+900,T+4500,json+'\u0000FOREIGN_ROLE_TARGETS'+'x'.repeat(20000),other,T-59,T-29,T+4500+30*86400));
        // Own signup may include the foreign event's safe context, but never its creator-only role_targets.
        await fixtureRun("INSERT INTO community_event_signups(event_id,discord_id,status,character_name,raid_role,rsvp_starts_at,updated_at) VALUES(?,?,'yes',NULL,'tank',?,?)",foreignId,id,T+900,T-20);
        const raw=one('SELECT typeof(role_targets) AS type,length(role_targets) AS chars,length(CAST(role_targets AS BLOB)) AS bytes,instr(role_targets,char(0)) AS nul,json_valid(role_targets) AS valid FROM community_events WHERE id=?',ownId);
        check('.150 event '+kind+' genuine schema stores nullable or JSON-valid native value',kind==='null'?raw.type==='null':raw.valid===1);
        if(kind==='NUL')check('.150 event native json_valid permits stored NUL suffix',raw.nul>0&&raw.bytes>raw.chars);
        if(kind==='length'||kind==='huge')check('.150 event '+kind+' original native text length over128',raw.chars>128);
        if(kind==='huge')check('.150 event huge original native bytes over512',raw.bytes>512);
        if(kind==='blob')check('.150 event native BLOB is genuinely stored',raw.type==='blob');
        const e=env({...ON,PRIVACY_RETENTION_ENABLED:'true'}),session=await cookieFor(id),request=new Request('https://guild.example/api/me/export',{headers:{Cookie:session}});
        const original=await siteCore.readSession(e,request);
        check('.150 event '+kind+' genuine ordinary MAC/current generation admitted',original?.u===id&&original.v===1&&original.g===g);
        const response=await indexMod.default.fetch(request,e,ctx);
        check('.150 event '+kind+' real source formatter returns native Response/Headers',response instanceof Response&&response.headers instanceof Headers);
        const text=await response.text();let body={};try{body=JSON.parse(text);}catch{}
        console.log('EVENT_ROLE_TARGETS_NATIVE_ORIGINAL '+JSON.stringify({kind,status:response.status,headers:Object.fromEntries(response.headers),body:text,authority:'real index.fetch with genuine ordinary signed session and stored subject generation; actual source json formatter',credentialBindingsRecorded:false}));
        if(!['valid128','null'].includes(kind)){
          check('.150 event '+kind+' selected own malformed role targets refuses503',response.status===503&&body.error==='erasure_held');
          check('.150 event '+kind+' no truncated success or attachment',!response.headers.get('Content-Disposition')&&!Object.hasOwn(body,'account')&&!Object.hasOwn(body,'community'));
          check('.150 event '+kind+' refused read adds no export audit',one("SELECT COUNT(*) AS n FROM audit WHERE actor=? AND action='site.copy_exported'",id).n===0);
        }else{
          const events=body.community?.events,created=events?.created;
          check('.150 event '+kind+' legitimate ordinary copy succeeds200 with exact attachment',response.status===200&&body.account.discordId===id&&response.headers.get('Content-Disposition')==='attachment; filename="olympus-my-data.json"');
          check('.150 event '+kind+' own created event roles preserve exact structured facts',created?.length===1&&created[0].id===ownId&&(kind==='null'?created[0].roleTargets===null:JSON.stringify(created[0].roleTargets)===json));
          check('.150 event '+kind+' foreign creator roles remain excluded despite own signup',events.signups.length===1&&events.signups[0].eventId===foreignId&&!text.includes('FOREIGN_ROLE_TARGETS')&&created.every(x=>x.id!==foreignId));
          check('.150 event '+kind+' original created and updated dates preserved',created[0].createdAt===new Date((T-60)*1000).toISOString()&&created[0].updatedAt===new Date((T-30)*1000).toISOString());
        }
        const current=one('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?',id);
        check('.150 event '+kind+' original subject generation/revision unchanged',current.generation===g&&current.revision===originalSubject.revision);
        fixtureDb.close();fixtureDb=null;
      }
    }finally{db=savedDb;BEFORE=savedBefore;AFTER=savedAfter;stubs['./discord'].json=savedJson;fixtureDb?.close();}
  }
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

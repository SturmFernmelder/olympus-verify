// Current ABI successor: component-only joined source-body ACCOUNTING; actual plain scheduled controller holds separately.
// Original scenario sequence/data/fault predicates retained. Unknown fault outcomes below require actual evidence; no automatic rebaseline.
// Historical cold migration, 2-rank-effects/single-cron and old effect-delete expectations are unavailable current branches.
// Independent joined scheduler ACCOUNTING fixture. Actual source jobs/native SQLite; no correctness sign-off for author's privacy core.
const {AsyncLocalStorage}=require('node:async_hooks'),cryptoNode=require('node:crypto');globalThis.crypto=cryptoNode.webcrypto;
const ALS=new AsyncLocalStorage(),SOURCE_PINS=new Map(),JOB_COUNTS={},PHYSICAL_JOB_COUNTS={},JOB_FETCHES={},JOB_RESULTS={},JOB_ERRORS=[];
const JOB_NAMES=new Set(['ensureSchema','sweepInviteQueue','sweepMemberRoles','continueRosterEffects','refreshNames','autoQueueReserved','purgeSeenInteractions','purgeBattleNetData','sweepRenameHolds','sweepCommunityProfiles','sweepCommunityEvents','runEventReminders','sweepCommunityTrials','sweepCommunityRestrictions','departureIntake','sweepCommunityDepartures','openWeeklyObligations','sweepCommunityContributions','sweepCommunityPrivacy','newsCron','runOfficerDigest','runServingErasureJob','sweepServingRetention','sweepRejectionExpiry']);
function readSource(file){const b=require('node:fs').readFileSync(file);SOURCE_PINS.set(file,{bytes:b.length,sha256:cryptoNode.createHash('sha256').update(b).digest('hex')});return b.toString('utf8');}
function countStatements(n,sql){COUNT.statements+=n;const job=ALS.getStore()||(/^DELETE FROM seen_interactions/.test(sql)?'purgeSeenInteractions':'unattributed');JOB_COUNTS[job]=(JOB_COUNTS[job]||0)+n;}
function wrapJobs(mod){for(const key of Object.keys(mod.exports))if(JOB_NAMES.has(key)&&typeof mod.exports[key]==='function'){const real=mod.exports[key];mod.exports[key]=(...args)=>ALS.run(key,async()=>{try{const result=await real(...args);JOB_RESULTS[key]=result;return result;}catch(e){JOB_ERRORS.push({job:key,error:String(e)});throw e;}});}}
function resetJobs(){for(const x of[JOB_COUNTS,PHYSICAL_JOB_COUNTS,JOB_FETCHES,JOB_RESULTS])for(const k of Object.keys(x))delete x[k];JOB_ERRORS.length=0;}// Existing joined whole-workload cases on actual TypeScript source and Native SQLite.
// The real plain scheduled({}, own waitUntil) is independently held before any Native work or child.
// Separately measure the complete source-owned shared body under an original global fetch-root and real Request;
// join its original deferred children before root settlement. This is explicitly component-only accounting.
// Initial full-profile setup and independent managed-open floor reuse the existing local integration pattern.
// Every original over-cap seed/domain/fault/case call is retained; no source cap/flag/trigger/qualifier is changed.
// Warm/cold current profiles pay their actual proof; worst mode separately observes missing-marker HOLD unchanged,
// then restores only the original local seed marker outside source/measured work without resetting floor/epoch/tickets.
// Historical public162/206 migration, two rank effects in one cap1 cron, and provider30s/128MiB qualification are unavailable.
// Untested original fault/result assertions below remain diagnostics; actual differences need a separate source proposal.
// Logical payload and full physical Native counts are separate; all attempted members of a failed batch are charged.
// Run from worker: node tests/scheduled_whole_composition_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = process.env.OLYMPUS_SCHEDULED_SOURCE || path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite that counts every statement; FAIL(sql, params) refuses one (it still counts) ----------
let COUNT={statements:0,trips:0,physicalStatements:0,physicalTrips:0},terminalNativeGroups=0;
const resetCount=()=>{COUNT={statements:0,trips:0,physicalStatements:0,physicalTrips:0};lastFailedSQL=null;failedSQLWitnesses=[];terminalNativeGroups=0;};
let FAIL = null;
let lastFailedSQL=null,lastNativeSQL='',nativeSingle=false,failedSQLWitnesses=[];
function countPhysicalJobs(n,sql){const job=ALS.getStore()||(/^DELETE FROM seen_interactions/.test(sql)?'purgeSeenInteractions':'unattributed');PHYSICAL_JOB_COUNTS[job]=(PHYSICAL_JOB_COUNTS[job]||0)+n;}
function d1(dbh){return entry.originalNativePort(dbh,{
 count(){COUNT.physicalTrips++;COUNT.physicalStatements++;nativeSingle=true;},
 beforeBatch(stmts){nativeSingle=false;if(stmts.some(s=>s.statement.includes('privacy_terminal_unconfirmed')))terminalNativeGroups++;COUNT.physicalStatements+=stmts.length-1;countPhysicalJobs(stmts.length,stmts.map(s=>s.statement).join('\n'));const payload=stmts.filter(s=>!s.statement.includes('privacy_write_admission'));if(payload.length){COUNT.trips++;countStatements(payload.length,payload.map(s=>s.statement).join('\n'));}
  for(const s of stmts){const numbered=Math.max(0,...[...s.statement.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])));if(s.params.some(x=>x===undefined)||numbered&&numbered!==s.params.length||s.params.length>99)throw Error('D1_ERROR: invalid parameter count');}},
 statement(sql,params){if(nativeSingle){nativeSingle=false;countPhysicalJobs(1,sql);if(!sql.includes('privacy_write_admission')){COUNT.trips++;countStatements(1,sql);}}lastNativeSQL=sql;if(FAIL&&FAIL(sql,params)){const message=FAIL.message?FAIL.message(sql):'D1_ERROR: refused by the suite';lastFailedSQL={sql,params:params.slice(),message};failedSQLWitnesses.push({...lastFailedSQL,params:lastFailedSQL.params.slice()});throw Error(message);}}
});}
let db;
function fresh(){stagedCurrentProfile();}
const entry=require('./helpers/privacy129_fixture.cjs'),installer=require('../scripts/install-rejection-provenance-epoch.cjs');
let native,admitted,setupWriter,activeLoader,doDb,installed=false,readyPromise=null,floorBindings={};
function stagedCurrentProfile(){
  db?.close();doDb?.close();db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  db.function('strftime',(format,input)=>{if(format!=='%s'||input!=='now')throw Error('fixture Native clock misuse');return String(T);});
  const profile=installer.manifest.canonical;for(const table of profile.tables)db.exec(table.sql);for(const index of profile.indexes)db.exec(index.sql);db.exec(profile.slotSQL);
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)").run();
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)").run(T);
  installed=false;readyPromise=null;floorBindings={};activeLoader=makeLoader();activeLoader('./index');native=d1(db);
  admitted=activeLoader('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH);
  setupWriter=activeLoader('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(entry.originalNativePort(db),'writer','canonical',entry.ENTRY_EPOCH);
}
async function readyCurrentProfile(){
 if(!readyPromise)readyPromise=(async()=>{installer.installFixtureEpoch(db,'canonical',entry.ENTRY_EPOCH);installed=true;
  // Same local independent-floor bootstrap as privacy_serving_integration_test; no production opener is claimed.
  doDb = new DatabaseSync(':memory:'); doDb.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('fixture DO clock misuse'); return String(T); });
  const floor = activeLoader('./privacy-recovery-floor'), gate = activeLoader('./privacy-serving-recovery-gate');
  const INITIALIZER = 'synthetic-serving-independent-initializer', OPERATOR = 'synthetic-serving-independent-operator', SERVING = 'synthetic-serving-independent-serving';
  const CE = 'b'.repeat(32), TREE = 'c'.repeat(40), VERSION = entry.ENTRY_METADATA.id;
  const storage = { sql: { exec(sql, ...args) { const s = doDb.prepare(sql), result = s.columns().length ? s.all(...args) : (s.run(...args), []); return { toArray: () => result }; } }, transactionSync(work) { doDb.exec('BEGIN IMMEDIATE'); try { const value = work(); doDb.exec('COMMIT'); return value; } catch (error) { doDb.exec('ROLLBACK'); throw error; } }, async setAlarm(time) { if (!Number.isSafeInteger(time)) throw Error('fixture alarm time'); } };
  const object = new floor.PrivacyRecoveryFloor({ storage }, { PRIVACY_RECOVERY_OPERATOR_SECRET: OPERATOR, PRIVACY_RECOVERY_INITIALIZER_SECRET: INITIALIZER, PRIVACY_SERVING_GATE_SECRET: SERVING });
  const initial = JSON.stringify({ operationId: '1'.repeat(32), nonce: '2'.repeat(32), requestDigest: '3'.repeat(64), createdAt: T, expiresAt: T + 300, credentialEpoch: CE, writeEpoch: entry.ENTRY_EPOCH, sourceTree: TREE, deploymentVersion: VERSION });
  const proof = await floor.recoveryFloorMac(INITIALIZER, 'POST', '/v1/initialize', initial);
  const response = await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Recovery-Proof': proof }, body: initial }));
  if (response.status !== 200) throw Error('genuine fixture floor initialization');
  const originalFloor = (await response.json()).floor, close = JSON.stringify({ operationId: '4'.repeat(32), nonce: '5'.repeat(32), requestDigest: '6'.repeat(64), createdAt: T, expiresAt: T + 300, nextWriteEpoch: 'd'.repeat(32), originalFloor });
  const mac = await gate.servingGateMac(INITIALIZER, 'POST', '/v1/serving/initialize-closed', close);
  const closed = await object.fetch(new Request('https://privacy-recovery-floor.invalid/v1/serving/initialize-closed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Olympus-Serving-Proof': mac }, body: close }));
  if (closed.status !== 200) throw Error('genuine fixture closed initialization');
  doDb.prepare("UPDATE recovery_serving_gate SET state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL WHERE singleton=1 AND state='closing_held'").run();
  const rid = Object.freeze({ fixture: 'same-native-independent-floor' }), stub = { fetch: request => object.fetch(request) };
  Object.assign(floorBindings, { PRIVACY_RECOVERY_FLOOR: { idFromName(name) { if (name !== floor.RECOVERY_FLOOR_NAME) throw Error('floor name'); return rid; }, get(id) { if (id !== rid) throw Error('floor id'); return stub; } }, PRIVACY_SERVING_GATE_SECRET: SERVING, PRIVACY_CREDENTIAL_EPOCH: CE, PRIVACY_SERVING_SOURCE_TREE: TREE, PRIVACY_SERVING_DATABASE_ID: floor.RECOVERY_FLOOR_TARGET.database });

 })();return readyPromise;
}
const ORIGINAL_PRIVATE=['PRIVACY_RECOVERY_FLOOR','PRIVACY_SERVING_GATE_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID'];
function rawCurrentEnvironment(e){return {...e,...floorBindings,DB:native};}
function issuerEnvironment(e){const out={...e,DB:native,PRIVACY_ERASURE_ENABLED:'false'};for(const key of ORIGINAL_PRIVATE)delete out[key];return out;}
const originalComponentFailures=new WeakMap();
async function originalComponent(e,work,request=new Request('https://verify.example/fixture-original-current-component')){
 await readyCurrentProfile();const L=activeLoader,global=L('./privacy-global-serving-origin'),pending=[],ctx={waitUntil(p){pending.push(p);}};
 const original=global.captureGlobalServingEntry(rawCurrentEnvironment(e),ctx,'fetch',request);let componentValue,componentReturned=false;
 try{return await global.dispatchGlobalServingEntry(original,async()=>{const owned={...original.env,DB:L('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(original.env.DB,'writer','canonical',entry.ENTRY_EPOCH)};componentValue=await work(owned,original.request??request,ctx,pending);componentReturned=true;await Promise.all(pending);return componentValue;});}
 catch(error){if(error&&typeof error==='object')originalComponentFailures.set(error,{componentValue,componentReturned});console.log('ORIGINAL_COMPONENT_FAILURE '+JSON.stringify({name:error?.name,constructor:error?.constructor?.name,message:error?.message,exactRecoveryFloorHeld:error instanceof L('./privacy-recovery-held').RecoveryFloorHeld,componentReturned,componentValue,failedSQLWitness:lastFailedSQL}));throw error;}
}

// ---------- the real modules, each run in a module graph of its own (a fresh isolate: no schema check, no caches) ----------
const transpiled = {};
const transpile = (file) => (transpiled[file] ??= ts.transpileModule(readSource(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
function makeLoader() {
  const cache = {};
  const load = (name) => {
    if(name==='node:async_hooks')return require(name);
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
    wrapJobs(mod); return mod.exports;
  };
  return load;
}

// ---------- the clock: the last 16:00 UTC at or before now (the digest posts after 15:00 UTC), behind the database's ----------
const RealDate = Date;
const H = 3600, DAY = 86400;
const realNow = () => Math.floor(RealDate.now() / 1000);
let T = Math.floor(realNow() / DAY) * DAY + 16 * H;
if (T > realNow()) T -= DAY;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
// the role sweep waits 250 ms between grants; the suite does not
const realSetTimeout = setTimeout;
globalThis.setTimeout=(fn,ms,...a)=>realSetTimeout(fn,ms===250?0:ms,...a);

// ---------- Discord, faked at fetch(): the guild's roles, members, role writes, messages, users ----------
const GUILD = "236932545793490944", ROLE = "1549581282227265566", STAFF = "1550000000000000010", LOG = "1550000000000000011", OTHER = "1550000000000000012", RAID = "1550000000000000013", BOT = "1550000000000000014";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [];
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const baseFetch = async (url, init = {}) => {
  const request=url instanceof Request?url:null;
  const u=new URL(request?request.url:String(url)),method=request?request.method:init.method||"GET",p=u.pathname;
  if(request)init={...init,method,headers:request.headers,body:['GET','HEAD'].includes(method)?undefined:await request.clone().text()};
  FETCHES.push(`${method} ${p}`);
  let m;
  if (p === "/api/v10/users/@me") return reply({ id: BOT, bot: true });
  if((m=p.match(/^\/api\/v10\/channels\/(\d+)$/))&&method==='GET'&&[RAID,STAFF,LOG,OTHER].includes(m[1]))return reply({id:m[1],guild_id:GUILD,type:0});
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{ id: ROLE }]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/)) && method === "GET") return reply({ roles: HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: "u" } });
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === "PUT") { HAS_ROLE.add(m[1]); await ON_PUT?.(m[1]); }
    else HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === "POST") {
    const body = JSON.parse(init.body || "{}");
    if (m[1] === RAID) return reply({ id: "1550000000000000096", channel_id: RAID, author: { id: BOT, bot: true }, type: 0, content: body.content, nonce: body.nonce, embeds: [], attachments: [] });
    if(body.nonce)return reply({id:"1550000000000000099",channel_id:m[1],author:{id:BOT,bot:true},type:0,content:body.content,nonce:body.nonce,embeds:[],attachments:[]}); // same officer digest response identity, current provider fields
    if (m[1] === STAFF) return reply({ message: "Missing Access", code: 50001 }, 403); // the staff notice cannot be posted: audited
    return reply({id:"1550000000000000098",channel_id:m[1],author:{id:BOT,bot:true},type:0,content:body.content,nonce:body.nonce,embeds:[],attachments:[]});
  }
  if (p.match(/^\/api\/v10\/channels\/\d+\/messages\/\d+$/) && method === "DELETE") return reply({ message: "Missing Access", code: 50001 }, 403); // a definitive refusal: audited
  if ((m = p.match(/^\/api\/v10\/users\/(\d+)$/))) return reply({ id: m[1], username: "user" + m[1].slice(-4), global_name: null });
  return reply({ message: "unexpected in this suite: " + method + " " + p }, 500);
};

const ALL_ON = "directory,crafting,events,attendance,trials,restrictions,departures,privacy_intake,contributions";
const env = (over = {}) => ({...entry.currentEntryEnvironment({
  DB: admitted??native,...floorBindings, DISCORD_BOT_TOKEN: "test-token", GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, CHANNEL_MOD_ALERTS: STAFF, CHANNEL_SERVER_LOG: LOG,
  VERIFY_SECRET: "verify-secret-for-tests", COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example",
  COMMUNITY_FEATURES: ALL_ON, CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "90", CONTRIBUTIONS_SCOPE: "olympus", PRIVACY_INTAKE_ENABLED: "true",
  OFFICER_DIGEST_ENABLED: "true", LAUNCH_AT: String(T - DAY), INVITE_MAX_ATTEMPTS: "6",
  // above the caps on purpose: the source clamps them to the budget's
  ROLE_SWEEP_PER_RUN: "50", ROLE_CALL_BUDGET: "50", NAMES_PER_RUN: "50",
  SITE_GUILD_ID: GUILD, DISCORD_APP_ID: BOT, INTROS_GUILD_ID: GUILD, INTROS_CHANNELS: `raid-signups=${RAID}`,
  EVENT_DISCORD_DELIVERY: "on", EVENT_DISCORD_REMINDERS: "on", COMMUNITY_ORGANIZERS: "300000000000001000",
  ...over,
}),PRIVACY_ERASURE_ENABLED:over.PRIVACY_ERASURE_ENABLED??'false'});

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const run=(sql,...p)=>installed?setupWriter.prepare(sql).bind(...p).run().then(r=>({changes:r.meta.changes,lastInsertRowid:r.meta.last_row_id})):db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const quiet = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };
const id = (k) => String(300000000000000000n + BigInt(k));
const letters = (k) => { let s = ""; do { s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26); } while (k > 0); return s; };
const ref = (k) => ("R" + String(k)).padEnd(22, "x");

// ---------- the seed: every capped workload past its cap, every conditional audit due ----------
const KEY = {}; // account -> its character's name key
async function account(did, { name, status = "member", banned = 0, site = true, memberSince = T - 60 * DAY, leftAt = null, key = null } = {}) {
  (await run("INSERT INTO members (discord_id, banned) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING", did, banned));
  if (name) {
    const k = key ?? name.toLowerCase();
    (await run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, member_since, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)", k, name, did, status, T - 90 * DAY, memberSince, leftAt));
    KEY[did] = k;
  }
  if (site) (await run("INSERT INTO site_users (discord_id, username, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, 1, 0, 1)", did, "u" + did.slice(-4), T - 30 * DAY, T - DAY));
}
/** Roster-confirmed accounts signed in here: the opener's candidates, the role sweep's rotation, the names refresh. */
async function seedMembers(count, from = 0) {
  const ids = [];
  for (let i = from; i < from + count; i++) { const did = id(1000 + i); (await account(did, { name: "Mem" + letters(i) })); ids.push(did); }
  return ids;
}
async function seedPromotions(ids) {
  for (const did of ids) (await run("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'roster.member', ?, ?)", T - 600, KEY[did], JSON.stringify({ discordId: did })));
}
async function seedBanned(count) {
  for (let i = 0; i < count; i++) { const did = id(5000 + i); (await account(did, { site: false })); (await run("UPDATE members SET banned = 1 WHERE discord_id = ?", did)); HAS_ROLE.add(did); }
}
async function seedReserved(count) {
  for (let i = 0; i < count; i++) (await run("INSERT INTO site_reserved (owner_id, name, name_key, status, created_at, approved_by, approved_at) VALUES (?, ?, ?, 'approved', ?, 'admin', ?)", id(9000 + i), "Res" + letters(i), "res" + letters(i), T - 9 * DAY, T - 8 * DAY + i));
}
/** Profiles thirty days departed, their owners no longer qualifying; departed_at runs AGAINST id order, so the order is visible. */
async function seedProfiles(count, from = 0) {
  for (let i = from; i < from + count; i++) {
    const did = id(7000 + i), departed = T - 31 * DAY - (i - from + 1) * 60;
    (await run("INSERT INTO community_refs (discord_id, ref, created_at) VALUES (?, ?, ?)", did, ref(i), T - 60 * DAY));
    (await run("INSERT INTO community_profiles (discord_id, ref, listed, departed_at, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)", did, ref(i), departed, T - 60 * DAY, T - 60 * DAY));
    (await run("INSERT INTO community_professions (discord_id, profession, skill, updated_at) VALUES (?, 'mining', 300, ?)", did, T - 60 * DAY));
  }
}
/** Departures for the intake: ten full pages of 500 the site cannot show (the name key is not the name's), the last one showable. */
async function seedDepartures() {
  const total = 10 * 500;
  for (let i = 0; i < total; i++) {
    const did = id(20000 + i), name = "Gone" + letters(i), valid = i === total - 1;
    (await account(did, { name, status: "left", leftAt: T - DAY + i, key: valid ? name.toLowerCase() : "x" + name.toLowerCase() }));
  }
}
async function seedFixed() {
  // the invite queue: rows past their attempts are retired, and the staff notice about them cannot be posted
  for (let i = 0; i < 3; i++) (await run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at, attempts) VALUES (?, ?, ?, 'queued', ?, 6)", "q" + letters(i), "Q" + letters(i), id(8000 + i), T - DAY));
  // Battle.net data past its 29 days
  (await run("INSERT INTO members (discord_id, battletag, bnet_conn_id, linked_at) VALUES (?, 'Old#1234', 'c1', ?)", id(8100), T - 40 * DAY));
  // an event, a trial, a departure item past their time; a restriction period with no case
  (await run("INSERT INTO community_events (id, op_id, title, starts_at, duration_min, ends_at, created_by, created_at, updated_at, retain_until) VALUES (?, 'op1', 'Old raid', ?, 60, ?, ?, ?, ?, ?)", ref(900), T - 40 * DAY, T - 40 * DAY + 3600, id(1000), T - 41 * DAY, T - 41 * DAY, T - 10 * DAY));
  (await run("INSERT INTO community_trials (id, op_id, discord_id, started_at, review_due_at, status, outcome_reason, concluded_at, created_at, updated_at, incarnation, retain_until) VALUES (?, 'op2', ?, ?, ?, 'ended', 'withdrew', ?, ?, ?, 'inc', ?)", ref(901), id(1001), T - 80 * DAY, T - 60 * DAY, T - 50 * DAY, T - 80 * DAY, T - 50 * DAY, T - 20 * DAY));
  (await run("INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, created_at, retain_until) VALUES (?, ?, 'old one', 'Old One', 'old', 'left', ?, ?, ?)", ref(902), id(1002), T - 40 * DAY, T - 40 * DAY, T - 10 * DAY));
  (await run("INSERT INTO community_restriction_periods (discord_id, opened_at, retain_until) VALUES (?, ?, ?)", id(8200), T - 90 * DAY, T + 90 * DAY));
  // News on, a notice past its time with its record, and three trusted complete exports: the figures compute both windows
  (await run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsOn', '1', ?, NULL)", T));
  (await run("INSERT INTO site_news_ops (id, nonce, created_by, created_at, purge_after) VALUES (?, 'n', ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, T + 118 * DAY));
  (await run("INSERT INTO site_news_notices (id, op_hash, title, body, revision, nonce, created_by, created_at, updated_by, updated_at, retain_until) VALUES (?, 'h', 'Old', 'Old', 1, 'n', ?, ?, ?, ?, ?)", ref(903), id(1000), T - 2 * DAY, id(1000), T - 2 * DAY, T - 10));
  const snap = async (names, first) => {
    const sid = Number((await run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'h', 1, 1, ?)", first, first, names.length, first)).lastInsertRowid);
    for (const nm of names) (await run("INSERT INTO roster_members (snapshot_id, name_key, name) VALUES (?, ?, ?)", sid, nm.toLowerCase(), nm));
  };
  (await snap(["Ana", "Bo", "Cy"], T - 8 * DAY));
  (await snap(["Ana", "Bo", "Dee"], T - 30 * H));
  (await snap(["Ana", "Bo", "Dee", "Eve"], T - H));
  // the officer digest: yesterday's post in a channel it is no longer configured for (cleaned up first; Discord refuses)
  const yesterday = new RealDate((T - DAY) * 1000).toISOString().slice(0, 10);
  (await run("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('officer_digest', ?, ?, NULL)", JSON.stringify({ day: yesterday, outcome: "posted", attempts: 1, final: true, notBefore: 0, lease: null, posted: { channelId: OTHER, messageId: "1550000000000000097", day: yesterday }, intent: null, halted: false }), T - DAY));
}
/**
 * .115, third review round (finding A): a derived run of the newest snapshot with `count` promotions still pending, as an
 * export leaves it when its own invocation could not finish them (roster.ts deriveRun, applyEffects).
 */
let EFFECT_IDS = [];
async function seedEffects(count) {
  const snap = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  const runId = Number((await run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at, derived_at, items) VALUES (?, ?, 1, ?, ?, ?)", snap, snap, T - 600, T - 600, count)).lastInsertRowid);
  EFFECT_IDS = [];
  for (let i = 0; i < count; i++) {
    const did = id(30000 + i), name = "Eff" + letters(i);
    (await account(did, { name, status: "verified", site: false, memberSince: null }));
    (await run("INSERT INTO roster_effects (run_id, seq, kind, name_key, name, discord_id) VALUES (?, ?, 'promote', ?, ?, ?)", runId, i, name.toLowerCase(), name, did));
    EFFECT_IDS.push(did);
  }
  return runId;
}
let MEMBER_IDS = [];
async function seedReminders() {
  const clock = one("SELECT CAST(strftime('%s','now') AS INTEGER) AS clock").clock, actor = id(1000);
  const issued = await entry.issueOriginalEntryCookie(name => activeLoader('./' + name), db, issuerEnvironment(env()), actor);
  for (let i = 0; i < 3; i++) {
    const eventId = ref(9901 + i), start = clock + 1800 + i;
    await run("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until) VALUES(?,?,?, ?,120,?,?,?,?,?)", eventId, ref(9801+i), "Public reminder", start, start+7200, actor, clock, clock, start+7200+30*DAY);
    const request = new Request('https://guild.example/api/community/events/reminder', { method: 'POST', headers: { Cookie: issued.cookie, Origin: 'https://guild.example', 'X-Olympus': '2', 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, revision: 1, enabled: true }) });
    const response = await activeLoader('./index').default.fetch(request, issuerEnvironment(env()), { waitUntil() {} });
    if (response.status !== 200) throw Error('original reminder fixture consent refused ' + response.status + ' ' + await response.text());
    const consent = one('SELECT consent_account_incarnation FROM community_event_reminders WHERE event_id=?', eventId);
    if (consent?.consent_account_incarnation !== issued.session.n) throw Error('original reminder consent incarnation missing');
  }
}
async function seedAll() {
  HAS_ROLE = new Set(); ON_PUT = null; FETCHES = [];
  db.exec("BEGIN");
  MEMBER_IDS = (await seedMembers(3 * CAP.obligationsPerRun));
  (await seedPromotions(MEMBER_IDS.slice(0, 5)));
  (await seedBanned(CAP.roleSweepBanned + 1));
  (await seedReserved(1001));
  (await seedProfiles(3 * CAP.profilesPerRun));
  (await seedDepartures());
  (await seedFixed());
  (await seedEffects(60));
  db.exec("COMMIT");
  await readyCurrentProfile();await seedReminders();
}

/** One job alone, over a fresh seeded database and a fresh module graph; the statements it sent. */
async function measure(fn,{seed=seedAll,fail=null,over={}}={}){
 fresh();await seed();await readyCurrentProfile();const L=activeLoader;resetCount();resetJobs();FAIL=fail;
 let value;try{value=await quiet(()=>originalComponent(env(over),e=>fn(L,e)));}finally{FAIL=null;}
 return {...COUNT,value,componentOnly:true};
}
const line = (job) => budget.SCHEDULED_BUDGET.find((j) => j.job === job)?.worst;
const auditFails = (...actions) => (sql, params) => /^INSERT INTO audit \(ts, actor, action, subject, details\) (VALUES|SELECT)/.test(sql) && actions.includes(params[2]);
// every column reported missing: the probes say "no such column", the ALTERs "duplicate column" (swallowed by addColumn)
const everyColumnMissing = Object.assign((sql) => /^SELECT \w+ FROM \w+ LIMIT 0$/.test(sql) || /^ALTER TABLE /.test(sql), { message: (sql) => (/^ALTER/.test(sql) ? "D1_ERROR: duplicate column name" : "D1_ERROR: no such column") });

const RANK_LABELS=Array.from({length:10},(_,i)=>String(770000000000000000n+BigInt(i))),RANK_NAMES=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const BOTROLE='770000000000000020',LEADER='770000000000000021',OFFICER='770000000000000022',RAIDLEADER='770000000000000023',BLOCKER='770000000000000024',ERASE=id(45000),ERASECHANNEL='770000000000000025',ERASEOP='a'.repeat(32);
let ROLES_BY_USER={},DELETED_MESSAGES=new Set(),EFFECT_FAILURE=false;
const oldFetch=baseFetch;
const inventory=()=>[{id:GUILD,position:0,permissions:'0',managed:false},{id:ROLE,position:1,permissions:'0',managed:false},{id:BOTROLE,position:40,permissions:'268435456',managed:false},{id:LEADER,position:30,permissions:'1024',managed:false},{id:OFFICER,position:29,permissions:'1024',managed:false},{id:RAIDLEADER,position:28,permissions:'1024',managed:false},{id:BLOCKER,position:0,permissions:'0',managed:false},...RANK_LABELS.map((id,i)=>({id,position:2+i,permissions:'0',managed:false}))];
const joinedFetch=async(url,init={})=>{const request=url instanceof Request?url:null;const u=new URL(request?request.url:String(url)),method=request?request.method:init.method||'GET',p=u.pathname;if(request)init={...init,method,headers:request.headers,body:['GET','HEAD'].includes(method)?undefined:await request.clone().text()};if(u.hostname!=='discord.com'||!p.startsWith('/api/v10/'))throw Error('unexpected network target');const job=ALS.getStore()||'unattributed';(JOB_FETCHES[job]??=[]).push(method+' '+p);
 if(p===`/api/v10/guilds/${GUILD}/roles`){FETCHES.push(method+' '+p);return reply(inventory());}
 let m;if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/))&&method==='GET'){FETCHES.push(method+' '+p);const roles=m[1]===BOT?[BOTROLE]:[...new Set([...(ROLES_BY_USER[m[1]]||[]),...(HAS_ROLE.has(m[1])?[ROLE]:[])])];return reply({roles,user:{id:m[1],username:'synthetic'}});}
 if((m=p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/))){FETCHES.push(method+' '+p);const current=ROLES_BY_USER[m[1]]||[];ROLES_BY_USER[m[1]]=method==='PUT'?[...new Set([...current,m[2]])]:current.filter(x=>x!==m[2]);if(m[2]===ROLE){if(method==='PUT')HAS_ROLE.add(m[1]);else HAS_ROLE.delete(m[1]);}if(method==='PUT'){await ON_PUT?.(m[1]);if(EFFECT_FAILURE)throw Error('synthetic lost dispatched role reply');}return new Response(null,{status:204});}
 if((m=p.match(/^\/api\/v10\/channels\/(\d+)\/messages\/(\d+)$/))&&m[1]===ERASECHANNEL){FETCHES.push(method+' '+p);if(method==='DELETE'){DELETED_MESSAGES.add(m[2]);return new Response(null,{status:204});}if(DELETED_MESSAGES.has(m[2]))return reply({code:10008},404);return reply({id:m[2],channel_id:m[1],author:{id:BOT,bot:true}});}
 if(p===`/api/v10/channels/${ERASECHANNEL}`){FETCHES.push(method+' '+p);return reply({id:ERASECHANNEL,guild_id:GUILD,type:0});}
 return oldFetch(url,init);
};
// Source captures this immutable provider adapter only after both existing provider branches exist.
globalThis.fetch=joinedFetch;
const budget=makeLoader()('./scheduled-budget'),CAP=budget.SCHEDULED_CAPS;
function enabledEnv(){return env({QR_PHASE1_ENABLED:'true',QR_RANK_MAPPING_ENABLED:'true',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',ROLE_GUILD_LEADER:LEADER,ROLE_OFFICER:OFFICER,ROLE_RAID_LEADER:RAIDLEADER,QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'ten-rank',roles:RANK_LABELS})});}
async function seedQualifiedRankRoster(){const selected=MEMBER_IDS[0],sid=Number((await run("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at)VALUES(?,?,'fixture',70,'joined-max',1,1,?)",T,T,T)).lastInsertRowid);
 for(let i=0;i<10;i++){const guid=i===4?'Player-1234-00001000':'Player-1234-'+String(100+i).padStart(8,'0');(await run('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid)VALUES(?,?,?,?,?,?)',sid,'rank'+i,'Rank '+i,RANK_NAMES[i],i,guid));}(await run('UPDATE characters SET guid=? WHERE discord_id=?','Player-1234-00001000',selected));HAS_ROLE.add(selected);ROLES_BY_USER[selected]=[RANK_LABELS[5],OFFICER];
 (await run("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'roster_privileged_rank',?,?,1,'settled','fixture prior bot-owned officer',1,?,?)",'d'.repeat(32),selected,GUILD,OFFICER,T-100,T+200));
 const rid=one('SELECT MAX(id)AS id FROM roster_effect_runs').id;(await run('UPDATE roster_effect_runs SET snapshot_id=?,prev_snapshot_id=? WHERE id=?',sid,sid,rid));
 for(let i=0;i<EFFECT_IDS.length;i++){const did=EFFECT_IDS[i],guid='Player-1234-'+String(30000+i).padStart(8,'0'),c=one('SELECT name_key,name FROM characters WHERE discord_id=?',did);(await run('UPDATE characters SET guid=? WHERE discord_id=?',guid,did));(await run('UPDATE roster_effects SET guid=? WHERE run_id=? AND seq=?',guid,rid,i));(await run('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid)VALUES(?,?,?,?,?,?)',sid,c.name_key,c.name,RANK_NAMES[7],7,guid));}
}
async function seedBusyErasure(L,e,automatic=false){(await account(ERASE,{site:automatic!=='bot'}));(await run('UPDATE site_users SET first_login=?,last_login=?,session_version=7 WHERE discord_id=?',T,T,ERASE));const authority=L('./privacy-serving-authority');let proof;if(automatic){(await run('UPDATE site_users SET first_login=?,last_login=? WHERE discord_id=?',T-400*DAY,T-366*DAY,ERASE));(await run('UPDATE members SET activity_at=? WHERE discord_id=?',T-366*DAY,ERASE));proof={subjectGeneration:null};}else{const issued=await entry.issueOriginalEntryCookie(name=>L('./'+name),db,issuerEnvironment(e),ERASE);const request=new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:issued.cookie,Origin:'https://guild.example','X-Olympus':'2'}});proof=await originalComponent(e,async(owned,originalRequest)=>{const response=await authority.requestServingErasure(owned,originalRequest,ERASEOP);if(response.status!==202)throw Error('max-job genuine admission refused '+response.status);return authority.readErasureProof(owned,ERASEOP);},request);}
 for(const [pid,actor,deadline]of [['shared-erase-guide',ERASE,T+365*DAY],['shared-expired-guide',id(60002),T-1]])(await run("INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,channel_id,message_id,frozen_payload,payload_hash,record_hash,claim_nonce,stage,state,created_at,updated_at,actor_retain_until)VALUES(?,?,'olympus-info',1,'forever-beta-pvp2-v1','shared',?,NULL,7,?,?,'790000000000000001','approved public identity only','public-hash','record-hash','original-shared-nonce',?,?,?,?,?)",GUILD,pid,actor,T+7200,LOG,'create','claimed',T,T,deadline));
 for(let i=0;i<5;i++){const mid=String(780000000000000000n+BigInt(i)),mop=(i+1).toString(16).repeat(32);(await run("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,'review',?,?,?,'known',1,?,?,?)",mop,JSON.stringify([{id:ERASE,g:proof.subjectGeneration}]),ERASECHANNEL,mid,T,T,T+authority.PRIVACY_REPLAY));const event=('E'+i).padEnd(22,'e'),op=('P'+i).padEnd(22,'p');(await run("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until)VALUES(?,?,'Private synthetic creator event',?,60,?,?,?,?,?)",event,op,T+3600,T+7200,ERASE,T,T,T+authority.PRIVACY_REPLAY));(await run("INSERT INTO community_event_deliveries(event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,op_id,claim_nonce,state,actor,created_at,updated_at,retain_until)VALUES(?,'publication',1,?,?,?,?,?,?,'posted',?,?,?,?)",event,T+3600,GUILD,ERASECHANNEL,String(780000000000000010n+BigInt(i)),op,'n'.repeat(22),ERASE,T,T,T+authority.PRIVACY_REPLAY));}
 for(const key of['b','c'])(await run("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?,?,'verified_membership',?,?,1,'unknown','expired synthetic custody',1,?,?)",key.repeat(32),ERASE,GUILD,ROLE,T-400,T-100));
}
function snapshotOutcome(){return{erasure:one('SELECT state FROM privacy_serving_jobs WHERE subject_id=? ORDER BY created_at DESC LIMIT 1',ERASE)?.state||null,providerOpen:one("SELECT COUNT(*) AS n FROM privacy_provider_messages WHERE channel_id=?AND state NOT IN('removed','refused')",ERASECHANNEL).n,obligations:one('SELECT COUNT(*)AS n FROM community_contribution_obligations').n,profiles:one('SELECT COUNT(*)AS n FROM community_profiles').n,reserved:one("SELECT COUNT(*)AS n FROM site_reserved WHERE status='queued'").n,names:one('SELECT COUNT(*)AS n FROM members WHERE names_at IS NOT NULL').n,reminders:one("SELECT COUNT(*)AS n FROM community_event_reminders WHERE state='posted'").n,effectsRemaining:one('SELECT COUNT(*)AS n FROM roster_effects WHERE done_at IS NULL').n,rankDispatched:one("SELECT COUNT(*)AS n FROM role_settlements WHERE purpose IN('roster_native_rank','roster_privileged_rank')AND attempts=1 AND created_at>=?",T).n,sharedActorRemaining:one("SELECT COUNT(*)n FROM ruleset_publications WHERE publication_id='shared-erase-guide' AND actor IS NOT NULL").n,sharedExpiredActor:one("SELECT COUNT(*)n FROM ruleset_publications WHERE publication_id='shared-expired-guide' AND actor IS NOT NULL").n,sharedCustody:one("SELECT COUNT(*)n FROM ruleset_publications WHERE publication_id IN('shared-erase-guide','shared-expired-guide') AND message_id='790000000000000001' AND frozen_payload='approved public identity only'").n};}
const reports=[];
// Prior maximum-schema fixture200 intentionally retained audit marker;203 additionally consumes the actual three-statement rewrite.

function tableState(){return JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM '+name).all()]));}
async function ordinaryHeld(index,e){const before=tableState(),pending=[],errors=[],prior=console.error;resetCount();resetJobs();console.error=(...a)=>errors.push(a.map(String).join(' '));try{await index.default.scheduled({},e,{waitUntil:p=>pending.push(p)});await Promise.all(pending);}finally{console.error=prior;}const observed={...COUNT,jobs:pending.length,errors,unchanged:before===tableState()},held=observed.statements===0&&observed.physicalStatements===0&&observed.trips===0&&observed.physicalTrips===0&&observed.jobs===0&&observed.unchanged&&errors.length===1&&errors[0]==='schema check failed; skipping this run error';check('actual plain scheduled controller is held before Native work',held,observed);return {...observed,held,normalScheduledEntryQualified:false};}
// Test observations only: preserve the exact thrown object and actual source-body/join facts.
const originalSharedBodyFailures=new WeakMap();let observedSourceBodyInvocations=0;
function originalFixtureCustodyReadback(observationReads){
 const read=(sql)=>{observationReads.push({database:'original-local-DO',sql});return doDb.prepare(sql).all();};
 return {floor:read('SELECT * FROM recovery_floor ORDER BY singleton'),gate:read('SELECT * FROM recovery_serving_gate ORDER BY singleton'),tickets:read('SELECT * FROM recovery_serving_ticket ORDER BY ticket_id')};
}
async function originalSharedBody(index,e){observedSourceBodyInvocations++;const pending=[],global=activeLoader('./privacy-global-serving-origin'),ctx={waitUntil(p){pending.push(p);}},request=new Request('https://guild.example/fixture-original-scheduled-shared-body'),original=global.captureGlobalServingEntry(rawCurrentEnvironment(e),ctx,'fetch',request);let componentReturned=false,componentValue,componentChildrenJoined=false;
 try{await global.dispatchGlobalServingEntry(original,async()=>{componentValue=await index.runSourceEpoch2ScheduledBody(original.env,ctx);componentReturned=true;await Promise.all(pending);componentChildrenJoined=true;});return {jobs:pending.length,componentReturned,componentValue,componentChildrenJoined,componentOnly:true};}
 catch(error){if(error&&typeof error==='object')originalSharedBodyFailures.set(error,{jobs:pending.length,componentReturned,componentValue,componentChildrenJoined,componentOnly:true});console.log('ORIGINAL_SHARED_BODY_FAILURE '+JSON.stringify({name:error?.name,constructor:error?.constructor?.name,message:error?.message,exactRecoveryFloorHeld:error instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld,componentReturned,componentValue,componentReturnType:typeof componentValue,pending:pending.length,counts:COUNT,jobCounts:JOB_COUNTS,physicalJobCounts:PHYSICAL_JOB_COUNTS,jobErrors:JOB_ERRORS,failedSQLWitness:lastFailedSQL,lastNativeSQL}));throw error;}
}
async function whole(mode,on,fault=false,variant='control'){
 fresh();await seedAll();ROLES_BY_USER={};DELETED_MESSAGES=new Set();EFFECT_FAILURE=false;let originalPutHookCalls=0;const L=activeLoader;L('./privacy-access-data');const index=L('./index'),e=on?enabledEnv():env();
 if(on){await seedQualifiedRankRoster();await seedBusyErasure(L,e,variant.startsWith('auto-site')?'site':variant==='auto-bot'?'bot':false);if(variant!=='control'){await run("UPDATE roster_effects SET kind='note' WHERE discord_id=?",EFFECT_IDS[0]);await run("UPDATE characters SET status='left',left_at=? WHERE discord_id=?",T-10,EFFECT_IDS[0]);}if(variant==='member-missing'||variant==='auto-site-missing')HAS_ROLE.delete(MEMBER_IDS[0]);if(variant==='note-lost')ON_PUT=did=>{if(did===EFFECT_IDS[0]){originalPutHookCalls++;throw Error('synthetic lost role response');}};}
 const ordinary=await ordinaryHeld(index,rawCurrentEnvironment(e));
 // Existing worst-schema mode first observes the actual public HOLD, then restores ONLY its original fixture marker outside source work.
 // The missing marker can itself refuse admitted setup writes. This raw local seed restoration is not public repair/activation.
 // No floor, epoch, ticket or invocation state is reset; the SAME original late fault/domain workload stays reachable if the source admits it.
 let schemaHeld=false,schemaProbe=null;
 if(mode==='cold worst'){await run("DELETE FROM site_settings WHERE key='auditTypedNames'");const before=tableState();resetCount();resetJobs();FAIL=everyColumnMissing;let originalError;
  try{await L('./schema').ensureSchema(e);}catch(error){originalError=error;}finally{FAIL=null;}
  schemaHeld=originalError instanceof L('./privacy-write-admission').PrivacyWriteAdmissionHeld&&originalError.message==='current_schema_unconfirmed'||originalError?.code==='ERR_SQLITE_ERROR'&&originalError.message==='malformed JSON'&&lastNativeSQL===L('./privacy-write-admission').PRIVACY_ADMISSION_SCHEMA_PROOF_SQL;
  schemaProbe={...COUNT,held:schemaHeld,unchanged:before===tableState(),name:originalError?.name,code:originalError?.code,message:originalError?.message};
  check('missing marker public schema probe holds unchanged; historical cold206 ALTER grant unavailable',schemaHeld&&schemaProbe.unchanged&&COUNT.statements===0&&COUNT.physicalStatements===1,schemaProbe);if(!schemaHeld){if(originalError)throw originalError;throw Error('expected original schema hold absent');}
  await run("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)",T);
 }
 if(mode==='warm')await L('./schema').ensureSchema(e);resetCount();resetJobs();FETCHES=[];
 const originalRank=on?{subject:MEMBER_IDS[0],generation:one('SELECT generation FROM privacy_subjects WHERE subject_id=?',MEMBER_IDS[0])?.generation??null,roster:one('SELECT MAX(id)AS id FROM roster_snapshots').id,guid:'Player-1234-00001000',profile:'ten-rank',rank:4,name:RANK_NAMES[4],wanted:[RANK_LABELS[4],RAIDLEADER]}:null;
 const originalErasureAccount=on?{site:!!one('SELECT 1 FROM site_users WHERE discord_id=?',ERASE),bot:!!one('SELECT 1 FROM members WHERE discord_id=?',ERASE)}:null;
 const originalDebtBirth=on?db.prepare('SELECT * FROM role_settlements WHERE id IN(?,?) ORDER BY id').all('b'.repeat(32),'c'.repeat(32)):[];
 const immutableDebtTuple=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['state','reason','checked_at'].includes(key)));
 const debtBirthUnchanged=()=>JSON.stringify(db.prepare('SELECT * FROM role_settlements WHERE id IN(?,?) ORDER BY id').all('b'.repeat(32),'c'.repeat(32)).map(immutableDebtTuple))===JSON.stringify(originalDebtBirth.map(immutableDebtTuple));
 const errors=[],oldConsole=console.error;console.error=(...x)=>errors.push({job:ALS.getStore()||null,text:x.map(String).join(' ')});
 if(fault===true)FAIL=(sql,params)=>/^INSERT INTO audit/.test(sql)&&['roster.member','role.restored','notice.no_channel'].includes(params[2]);
 if(fault==='terminal')FAIL=Object.assign(sql=>(mode==='cold worst'&&everyColumnMissing(sql))||sql.includes('privacy_terminal_unconfirmed'),{message:sql=>everyColumnMissing(sql)?everyColumnMissing.message(sql):'D1_ERROR: synthetic last terminal statement refused'});
 if(fault==='role-block')ON_PUT=async did=>{if(did===EFFECT_IDS[0]){originalPutHookCalls++;await run('UPDATE members SET banned=1 WHERE discord_id=?',did);}};
 const stateBefore=tableState(),auditFaultCase=mode==='warm'&&on===true&&fault===true&&variant==='control',observationReads=[],membershipRankCase=mode==='cold worst'&&on===true&&fault===false&&['member-missing','auto-site-missing'].includes(variant),membershipRankReads=[];
 const membershipRankBefore=membershipRankCase?{custody:originalFixtureCustodyReadback(membershipRankReads),selection:membershipRankSelection(originalRank,membershipRankReads)}:null;
 const originalCustodyBefore=auditFaultCase?originalFixtureCustodyReadback(observationReads):null;let component,auditFaultCustody=null;
 try{component=await originalSharedBody(index,e);}catch(error){
  if(!auditFaultCase||!(error instanceof L('./privacy-recovery-held').RecoveryFloorHeld))throw error;
  const observed=originalSharedBodyFailures.get(error);
  const observedFault=!!observed&&observed.componentReturned===true&&observed.componentValue===undefined&&observed.componentChildrenJoined===true&&observed.jobs===23&&failedSQLWitnesses.length>0&&failedSQLWitnesses.every(w=>/^INSERT INTO audit/.test(w.sql)&&['roster.member','role.restored','notice.no_channel'].includes(w.params[2])&&w.message==='D1_ERROR: refused by the suite')&&JOB_ERRORS.length===0;
  check('exact original audit-fault typed hold preserves real body and joined-child observations',observedFault,{observed,failedSQLWitnesses,jobErrors:JOB_ERRORS});if(!observedFault)throw error;
  const originalCustodyAfter=originalFixtureCustodyReadback(observationReads),prior=new Map(originalCustodyBefore.tickets.map(row=>[row.ticket_id,row])),added=originalCustodyAfter.tickets.filter(row=>!prior.has(row.ticket_id)),newRows=new Map(added.map(row=>[row.ticket_id,row])),roots=added.filter(row=>row.parent_ticket_id===null),rootTicket=roots.length===1?roots[0]:null,children=new Map();
  for(const row of added)if(row.parent_ticket_id!==null){const list=children.get(row.parent_ticket_id)||[];list.push(row);children.set(row.parent_ticket_id,list);}
  const ancestry=(row)=>{const seen=new Set();let current=row;while(current&&current!==rootTicket){if(seen.has(current.ticket_id)||seen.size>=added.length)return null;seen.add(current.ticket_id);current=newRows.get(current.parent_ticket_id);}return current===rootTicket?seen:null;};
  const unknownLeaves=added.filter(row=>row.state==='unknown'&&!(children.get(row.ticket_id)||[]).length),priorAfter=originalCustodyAfter.tickets.filter(row=>prior.has(row.ticket_id)),allIds=originalCustodyAfter.tickets.map(row=>row.ticket_id),allNonces=originalCustodyAfter.tickets.map(row=>row.nonce),hex=(value,length)=>typeof value==='string'&&value.length===length&&!/[^0-9a-f]/.test(value);
  const durableUnknown=!!rootTicket&&rootTicket.purpose==='fetch'&&rootTicket.state==='unknown'&&added.every(row=>ancestry(row)!==null&&row.native_floor===rootTicket.native_floor&&row.floor_sequence===rootTicket.floor_sequence&&hex(row.ticket_id,32)&&hex(row.nonce,32)&&Number.isSafeInteger(row.created_at)&&row.expires_at===row.created_at+300&&['settled','unknown'].includes(row.state)&&hex(row.result_digest,64)&&Number.isSafeInteger(row.finished_at)&&row.finished_at>=row.created_at&&row.finished_at<row.expires_at)&&new Set(allIds).size===allIds.length&&new Set(allNonces).size===allNonces.length&&unknownLeaves.length>0&&unknownLeaves.length===failedSQLWitnesses.length&&unknownLeaves.every(row=>row.purpose==='d1'&&[...ancestry(row)].every(id=>newRows.get(id).state==='unknown'))&&JSON.stringify(priorAfter)===JSON.stringify(originalCustodyBefore.tickets)&&JSON.stringify(originalCustodyAfter.floor)===JSON.stringify(originalCustodyBefore.floor)&&JSON.stringify(originalCustodyAfter.gate)===JSON.stringify(originalCustodyBefore.gate);
  const custodyEvidence={before:originalCustodyBefore,after:originalCustodyAfter,newTickets:added,unknownLeaves,failedSQLWitnesses:failedSQLWitnesses.map(w=>({...w,params:w.params.slice()})),rootCustody:'unknown',originalTypedHold:true,body:observed,observationReads};
  console.log('AUDIT_FAULT_CUSTODY_EVIDENCE '+JSON.stringify(custodyEvidence));
  check('original audit-fault root and exact D1 ancestry remain durably unknown with prior custody unchanged',durableUnknown,custodyEvidence);if(!durableUnknown)throw error;
  const read=(sql,...params)=>{observationReads.push({database:'original-local-business',sql});return db.prepare(sql).all(...params);};
  const debts=read('SELECT * FROM role_settlements WHERE id IN(?,?) ORDER BY id','b'.repeat(32),'c'.repeat(32)),job=JOB_RESULTS.runServingErasureJob,erasure=read('SELECT state,hold_reason FROM privacy_serving_jobs WHERE subject_id=? ORDER BY created_at DESC LIMIT 1',ERASE)[0],accountPresence={site:read('SELECT 1 FROM site_users WHERE discord_id=?',ERASE).length===1,bot:read('SELECT 1 FROM members WHERE discord_id=?',ERASE).length===1},providerPointers=read('SELECT operation_id,channel_id,message_id,state FROM privacy_provider_messages WHERE channel_id=? ORDER BY operation_id',ERASECHANNEL),eventPointers=read('SELECT event_id,purpose,channel_id,message_id,op_id,state FROM community_event_deliveries WHERE channel_id=? ORDER BY event_id',ERASECHANNEL),replay=read('SELECT operation_id FROM privacy_restore_replay WHERE subject_id=?',ERASE);
  const expectedProviderPointers=Array.from({length:5},(_,i)=>({operation_id:(i+1).toString(16).repeat(32),channel_id:ERASECHANNEL,message_id:String(780000000000000000n+BigInt(i)),state:'known'})),expectedEventPointers=Array.from({length:5},(_,i)=>({event_id:('E'+i).padEnd(22,'e'),purpose:'publication',channel_id:ERASECHANNEL,message_id:String(780000000000000010n+BigInt(i)),op_id:('P'+i).padEnd(22,'p'),state:'posted'}));
  const conservativeBusiness=originalDebtBirth.length===2&&debts.length===2&&JSON.stringify(debts.map(immutableDebtTuple))===JSON.stringify(originalDebtBirth.map(immutableDebtTuple))&&debts.every(row=>['held','unknown'].includes(row.state))&&job?.attempted===1&&job.completed===0&&job.held===1&&erasure?.state==='held'&&erasure.hold_reason==='current_role_custody_unknown'&&JSON.stringify(accountPresence)===JSON.stringify(originalErasureAccount)&&JSON.stringify(providerPointers)===JSON.stringify(expectedProviderPointers)&&JSON.stringify(eventPointers)===JSON.stringify(expectedEventPointers)&&replay.length===0;
  custodyEvidence.business={debts,originalDebtBirth,job,erasure,accountPresence,originalErasureAccount,providerPointers,eventPointers,replay};
  console.log('AUDIT_FAULT_BUSINESS_CUSTODY_EVIDENCE '+JSON.stringify(custodyEvidence.business));
  check('audit-fault observation preserves original debt births account and ten message pointers without completion',conservativeBusiness,custodyEvidence.business);if(!conservativeBusiness)throw error;
  component=observed;auditFaultCustody=custodyEvidence;
 }finally{FAIL=null;console.error=oldConsole;}
 const result={mode,on,fault,variant,...(auditFaultCustody?{rootCustody:'unknown',originalTypedHold:true,auditFaultCustody}:{}),statements:COUNT.statements,trips:COUNT.trips,physicalStatements:COUNT.physicalStatements,physicalTrips:COUNT.physicalTrips,jobs:component.jobs,componentOnly:true,ordinary,schemaHeld,schemaProbe,originalRank,originalErasureAccount,originalDebtBirth,originalPutHookCalls,terminalNativeGroups,terminalFaultCoverageQualified:false,lostPutFaultCoverageQualified:false,compensationFaultCoverageQualified:false,jobCounts:{...JOB_COUNTS},physicalJobCounts:{...PHYSICAL_JOB_COUNTS},jobFetches:Object.fromEntries(Object.entries(JOB_FETCHES).map(([k,v])=>[k,v.slice()])),jobResults:{...JOB_RESULTS},jobErrors:JOB_ERRORS.slice(),consoleErrors:errors,http:FETCHES.length,outcome:snapshotOutcome()};reports.push(result);
 check(`${on?'ON':'OFF'} ${mode}${fault?' with audit faults':''}: actual void shared body registers every child`,component.componentReturned===true&&component.componentValue===undefined&&result.jobs===budget.SCHEDULED_BUDGET.length-1,{jobs:result.jobs,componentReturned:component.componentReturned,componentReturnType:typeof component.componentValue});
 check('component logical count within current source670 and Native physical within installed700',result.statements<=budget.SCHEDULED_WORST_CASE&&result.physicalStatements<=budget.ADMISSION_SCHEDULED_WORST_CASE&&result.physicalStatements<=700,{logical:result.statements,ordinaryBound:budget.SCHEDULED_WORST_CASE,physical:result.physicalStatements,installedBound:budget.ADMISSION_SCHEDULED_WORST_CASE});
 const accounted=Object.values(result.jobCounts).reduce((n,v)=>n+v,0),physicalAccounted=Object.values(result.physicalJobCounts).reduce((n,v)=>n+v,0);check('per-job observed logical and physical counts reconcile every emitted group including failures',accounted===result.statements&&physicalAccounted===result.physicalStatements&&(!result.jobCounts.unattributed||result.jobCounts.unattributed===1),{accounted,whole:result.statements,physicalAccounted,physicalWhole:result.physicalStatements,counts:result.jobCounts});
 for(const j of budget.SCHEDULED_BUDGET){const p=budget.ADMISSION_SCHEDULED_BUDGET.find(x=>x.job===j.job);check(`${on?'ON':'OFF'} ${mode} ${j.job} logical${result.jobCounts[j.job]||0} <= source${j.worst}; Native${result.physicalJobCounts[j.job]||0} <= installed${p.worst}`,(result.jobCounts[j.job]||0)<=j.worst&&(result.physicalJobCounts[j.job]||0)<=p.worst);}
 // Source-reviewed successors only: the SAME old unverifiable spent debts cannot authorize deletion;
 // the SAME original rank workload retains its two target intents beyond the actual cap1 effect.
 if(on&&!fault){
  const job=result.jobResults.runServingErasureJob,debts=db.prepare("SELECT id,subject,purpose,guild_id,role_id,desired,state,attempts,claim_nonce,created_at,expires_at FROM role_settlements WHERE id IN(?,?) ORDER BY id").all('b'.repeat(32),'c'.repeat(32)),erasureHTTP=result.jobFetches.runServingErasureJob||[],guard=one('SELECT hold_reason FROM privacy_serving_jobs WHERE subject_id=? ORDER BY created_at DESC LIMIT 1',ERASE)?.hold_reason;
  check('same2 historical unproven spent debts keep original account/5pointers and exact current custody guard; old complete branch unavailable',job?.attempted===1&&job.completed===0&&job.held===1&&result.outcome.erasure==='held'&&guard==='current_role_custody_unknown'&&debts.length===2&&debts.every((d,i)=>d.id===['b','c'][i].repeat(32)&&d.subject===ERASE&&d.purpose==='verified_membership'&&d.guild_id===GUILD&&d.role_id===ROLE&&d.desired===1&&d.attempts===1&&d.claim_nonce===null&&d.created_at===T-400&&d.expires_at===T-100&&['held','unknown'].includes(d.state))&&!!one('SELECT 1 FROM site_users WHERE discord_id=?',ERASE)===originalErasureAccount.site&&!!one('SELECT 1 FROM members WHERE discord_id=?',ERASE)===originalErasureAccount.bot&&one("SELECT COUNT(*)AS n FROM privacy_provider_messages WHERE channel_id=? AND state='known'",ERASECHANNEL).n===5&&one("SELECT COUNT(*)AS n FROM community_event_deliveries WHERE channel_id=? AND state='posted'",ERASECHANNEL).n===5&&erasureHTTP.length>0&&erasureHTTP.every(x=>x.startsWith('GET ')),{job,guard,debts,originalErasureAccount,erasureHTTP,outcome:result.outcome});
   if(!membershipRankCase)checkOriginalRankOutcome(result,originalRank);
  check('native retention21 and capped existing backlogs all run',result.jobCounts.sweepServingRetention===21&&result.outcome.obligations===CAP.obligationsPerRun&&result.outcome.profiles===2*CAP.profilesPerRun&&result.outcome.reserved===CAP.autoQueueRounds*250&&result.outcome.names===CAP.namesPerRun&&result.outcome.reminders===1,result.outcome);
 }
 if(!on)check('privacy/rank OFF baseline has no lifecycle job or retention work',!(result.jobCounts.runServingErasureJob||result.jobCounts.sweepServingRetention)&&result.outcome.rankDispatched===0);
 if(fault==='terminal')check('same terminal setup stops at exact earlier unproven-debt guard; terminal-fault coverage unavailable',lastFailedSQL===null&&terminalNativeGroups===0&&result.jobResults.runServingErasureJob?.attempted===1&&result.jobResults.runServingErasureJob.completed===0&&result.jobResults.runServingErasureJob.held===1&&result.outcome.erasure==='held'&&one('SELECT hold_reason FROM privacy_serving_jobs WHERE subject_id=? ORDER BY created_at DESC LIMIT 1',ERASE)?.hold_reason==='current_role_custody_unknown'&&originalDebtBirth.length===2&&debtBirthUnchanged()&&one('SELECT COUNT(*)AS n FROM site_users WHERE discord_id=?',ERASE).n===1&&one('SELECT COUNT(*)AS n FROM privacy_restore_replay WHERE subject_id=?',ERASE).n===0,{failedSQLWitness:lastFailedSQL,terminalNativeGroups,job:result.jobResults.runServingErasureJob,outcome:result.outcome,terminalFaultCoverageQualified:false});
 if(fault==='role-block'||variant==='note-lost'){
  const item=one('SELECT run_id,seq,discord_id,kind,done_at,claim FROM roster_effects WHERE discord_id=?',EFFECT_IDS[0]),receipt=one("SELECT details FROM audit WHERE action='role.deferred' AND json_extract(details,'$.discordId')=? AND json_extract(details,'$.reason')='central_role_sweep'",EFFECT_IDS[0]),roster=result.jobResults.continueRosterEffects;
  check('same original PUT hook is unused by current cron deferral; old lost-PUT/compensation fault coverage unavailable',originalPutHookCalls===0&&!FETCHES.some(x=>x.startsWith('PUT ')&&x.includes('/members/'+EFFECT_IDS[0]+'/roles/'))&&roster?.applied===1&&roster.noticePending===true&&item?.discord_id===EFFECT_IDS[0]&&item.done_at===T&&item.kind==='note'&&typeof item.claim==='string'&&!!receipt&&one('SELECT banned FROM members WHERE discord_id=?',EFFECT_IDS[0]).banned===0&&!HAS_ROLE.has(EFFECT_IDS[0]),{originalPutHookCalls,roster,item,receipt,lostPutFaultCoverageQualified:false,compensationFaultCoverageQualified:false});
 }if(membershipRankCase)result.membershipRankContinuation=await continueOriginalMembershipRankCase(index,e,result,component,originalRank,membershipRankBefore,membershipRankReads);return result;
}

function checkOriginalRankOutcome(result,originalRank){
  const rankRows=db.prepare("SELECT subject,purpose,guild_id,role_id,desired,state,attempts,subject_generation,roster_id,native_guid,native_profile,native_rank,native_rank_name,created_at FROM role_settlements WHERE subject=? AND purpose IN('roster_native_rank','roster_privileged_rank') AND created_at>=?").all(originalRank.subject,T),pendingTargets=rankRows.filter(r=>r.desired===1&&r.attempts===0&&r.state==='pending'),rankEffects=(result.jobFetches.sweepMemberRoles||[]).filter(x=>/^(PUT|DELETE) /.test(x)&&x.includes('/members/'+originalRank.subject+'/roles/')&&!x.endsWith('/'+ROLE));
  check('one actual cap1 rank effect preserves both exact original target intents for later roots; all other capped jobs progress',CAP.roleSweepAccounts===1&&result.outcome.rankDispatched===1&&rankEffects.length===1&&rankRows.filter(r=>r.attempts===1).length===1&&pendingTargets.length===2&&originalRank.wanted.every(role=>pendingTargets.some(r=>r.role_id===role&&r.subject===originalRank.subject&&r.guild_id===GUILD&&r.subject_generation===originalRank.generation&&r.roster_id===originalRank.roster&&r.native_guid===originalRank.guid&&r.native_profile===originalRank.profile&&r.native_rank===originalRank.rank&&r.native_rank_name===originalRank.name))&&result.jobResults.sweepMemberRoles?.checked===1&&result.jobResults.sweepMemberRoles?.revoked.length===1&&result.outcome.effectsRemaining<60,{originalRank,rankRows,rankEffects,outcome:result.outcome,sweep:result.jobResults.sweepMemberRoles,roster:result.jobResults.continueRosterEffects});
}
function checkContinuationAccounting(result,component){const mode=result.mode,on=result.on,fault=result.fault;
 check(`${on?'ON':'OFF'} ${mode}${fault?' with audit faults':''}: actual void shared body registers every child`,component.componentReturned===true&&component.componentValue===undefined&&result.jobs===budget.SCHEDULED_BUDGET.length-1,{jobs:result.jobs,componentReturned:component.componentReturned,componentReturnType:typeof component.componentValue});
 check('component logical count within current source670 and Native physical within installed700',result.statements<=budget.SCHEDULED_WORST_CASE&&result.physicalStatements<=budget.ADMISSION_SCHEDULED_WORST_CASE&&result.physicalStatements<=700,{logical:result.statements,ordinaryBound:budget.SCHEDULED_WORST_CASE,physical:result.physicalStatements,installedBound:budget.ADMISSION_SCHEDULED_WORST_CASE});
 const accounted=Object.values(result.jobCounts).reduce((n,v)=>n+v,0),physicalAccounted=Object.values(result.physicalJobCounts).reduce((n,v)=>n+v,0);check('per-job observed logical and physical counts reconcile every emitted group including failures',accounted===result.statements&&physicalAccounted===result.physicalStatements&&(!result.jobCounts.unattributed||result.jobCounts.unattributed===1),{accounted,whole:result.statements,physicalAccounted,physicalWhole:result.physicalStatements,counts:result.jobCounts});
 for(const j of budget.SCHEDULED_BUDGET){const p=budget.ADMISSION_SCHEDULED_BUDGET.find(x=>x.job===j.job);check(`${on?'ON':'OFF'} ${mode} ${j.job} logical${result.jobCounts[j.job]||0} <= source${j.worst}; Native${result.physicalJobCounts[j.job]||0} <= installed${p.worst}`,(result.jobCounts[j.job]||0)<=j.worst&&(result.physicalJobCounts[j.job]||0)<=p.worst);}
}
function membershipRankSelection(originalRank,observationReads){
 const read=(sql,...params)=>{observationReads.push({database:'original-local-business',sql});return db.prepare(sql).all(...params);},subject=originalRank.subject;
 return {privacy:read('SELECT subject_id,generation,state,revision FROM privacy_subjects WHERE subject_id=?',subject),snapshot:read('SELECT * FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)'),character:read('SELECT name_key,name,guid,status FROM characters WHERE discord_id=? ORDER BY name_key',subject),roster:read('SELECT snapshot_id,guid,name_key,name,rank,rank_index FROM roster_members WHERE snapshot_id=? AND guid=?',originalRank.roster,originalRank.guid),promotion:read("SELECT id,ts,details FROM audit WHERE action='roster.member' AND json_extract(details,'$.discordId')=? AND ts=? ORDER BY id",subject,T-600),membership:read("SELECT * FROM role_settlements WHERE subject=? AND purpose='roster_membership' ORDER BY id",subject),ranks:read("SELECT * FROM role_settlements WHERE subject=? AND purpose IN('roster_native_rank','roster_privileged_rank') AND created_at>=? ORDER BY id",subject,T),sweep:read("SELECT id,ts,details FROM audit WHERE action='role.sweep' ORDER BY id DESC LIMIT 1"),provider:{membership:HAS_ROLE.has(subject),roles:(ROLES_BY_USER[subject]||[]).slice().sort()}};
}
function sameOriginalSelection(before,after,originalRank){return ['privacy','snapshot','character','roster','promotion'].every(key=>JSON.stringify(before[key])===JSON.stringify(after[key]))&&after.snapshot.length===1&&after.snapshot[0].id===originalRank.roster&&after.roster.length===1&&after.roster[0].guid===originalRank.guid&&after.roster[0].rank_index===originalRank.rank&&after.roster[0].rank===originalRank.name&&(originalRank.generation===null?after.privacy.length===0:after.privacy.length===1&&after.privacy[0].generation===originalRank.generation&&after.privacy[0].state==='active');}
function settledOriginalSuccessor(before,after){
 const prior=new Map(before.tickets.map(row=>[row.ticket_id,row])),added=after.tickets.filter(row=>!prior.has(row.ticket_id)),rows=new Map(added.map(row=>[row.ticket_id,row])),roots=added.filter(row=>row.parent_ticket_id===null),root=roots.length===1?roots[0]:null,hex=(value,length)=>typeof value==='string'&&value.length===length&&!/[^0-9a-f]/.test(value);
 const reachesRoot=row=>{const seen=new Set();let current=row;while(current&&current!==root){if(seen.has(current.ticket_id)||seen.size>=added.length)return false;seen.add(current.ticket_id);current=rows.get(current.parent_ticket_id);}return !!root&&current===root;};
 return {qualified:!!root&&root.purpose==='fetch'&&root.state==='settled'&&added.every(row=>reachesRoot(row)&&row.state==='settled'&&row.native_floor===root.native_floor&&row.floor_sequence===root.floor_sequence&&hex(row.ticket_id,32)&&hex(row.nonce,32)&&row.expires_at===row.created_at+300&&hex(row.result_digest,64)&&Number.isSafeInteger(row.finished_at)&&row.finished_at>=row.created_at&&row.finished_at<row.expires_at)&&new Set(after.tickets.map(row=>row.ticket_id)).size===after.tickets.length&&new Set(after.tickets.map(row=>row.nonce)).size===after.tickets.length&&JSON.stringify(after.tickets.filter(row=>prior.has(row.ticket_id)))===JSON.stringify(before.tickets)&&JSON.stringify(before.floor)===JSON.stringify(after.floor)&&JSON.stringify(before.gate)===JSON.stringify(after.gate),root,newTickets:added,before,after};
}
async function continueOriginalMembershipRankCase(index,e,first,firstComponent,originalRank,before,observationReads){
 const firstCustody=settledOriginalSuccessor(before.custody,originalFixtureCustodyReadback(observationReads)),firstSelection=membershipRankSelection(originalRank,observationReads),rolePath='/members/'+originalRank.subject+'/roles/',membershipPath=rolePath+ROLE,firstHTTP=(first.jobFetches.sweepMemberRoles||[]),firstEffects=firstHTTP.filter(line=>/^(PUT|DELETE) /.test(line)&&line.includes(rolePath)),firstSweep=first.jobResults.sweepMemberRoles,membership=firstSelection.membership[0],watermark=firstSelection.sweep.length===1?JSON.parse(firstSelection.sweep[0].details):null;
 const firstWitness={case:first.variant,originalRank,before,firstCustody,firstSelection,component:{jobs:firstComponent.jobs,componentReturned:firstComponent.componentReturned,componentValueType:typeof firstComponent.componentValue,componentChildrenJoined:firstComponent.componentChildrenJoined},firstHTTP,firstAccounting:{logical:first.statements,physical:first.physicalStatements,jobCounts:first.jobCounts,physicalJobCounts:first.physicalJobCounts},observationReads};
 console.log('MEMBERSHIP_RANK_FIRST_PASS_EVIDENCE '+JSON.stringify(firstWitness));
 const firstRoot=firstCustody.qualified&&firstComponent.componentReturned===true&&firstComponent.componentValue===undefined&&firstComponent.componentChildrenJoined===true&&firstComponent.jobs===23;
 check('membership-first case preserves its original settled root and joined children before a next invocation',firstRoot,firstWitness);if(!firstRoot)throw Error('membership-rank first original custody unqualified');
 const firstMembership=sameOriginalSelection(before.selection,firstSelection,originalRank)&&before.selection.provider.membership===false&&before.selection.membership.length===0&&before.selection.promotion.length===1&&firstSelection.provider.membership===true&&firstEffects.length===1&&firstEffects[0].startsWith('PUT ')&&firstEffects[0].endsWith(membershipPath)&&firstSweep?.checked===1&&firstSweep.restored.filter(id=>id===originalRank.subject).length===1&&firstSweep.unfinished.filter(id=>id===originalRank.subject).length===1&&firstSelection.membership.length===1&&membership.subject===originalRank.subject&&membership.purpose==='roster_membership'&&membership.guild_id===GUILD&&membership.role_id===ROLE&&membership.desired===1&&membership.attempts===1&&membership.state==='settled'&&membership.reason==='effect_and_current_server_confirmed'&&typeof membership.claim_nonce==='string'&&/^[0-9a-f]{32}$/.test(membership.claim_nonce)&&membership.subject_generation===originalRank.generation&&membership.roster_id===originalRank.roster&&membership.native_guid===originalRank.guid&&membership.native_profile===originalRank.profile&&membership.native_rank===originalRank.rank&&membership.native_rank_name===originalRank.name&&firstSelection.ranks.length===0&&first.outcome.rankDispatched===0&&watermark&&typeof watermark.a==='number'&&watermark.a<before.selection.promotion[0].id;
 check('first installed membership phase restores exactly once and retains the original source-selected promotion without rank dispatch',firstMembership,firstWitness);if(!firstMembership)throw Error('membership-rank first phase unqualified');
 // Existing observation counters only, after the first original root settled. Same DB/DO/source/provider/clock survive.
 resetCount();resetJobs();FETCHES=[];const secondComponent=await originalSharedBody(index,e);
 const second={mode:first.mode,on:first.on,fault:first.fault,variant:first.variant,phase:'next-original-rank-source-body',statements:COUNT.statements,trips:COUNT.trips,physicalStatements:COUNT.physicalStatements,physicalTrips:COUNT.physicalTrips,jobs:secondComponent.jobs,componentOnly:true,jobCounts:{...JOB_COUNTS},physicalJobCounts:{...PHYSICAL_JOB_COUNTS},jobFetches:Object.fromEntries(Object.entries(JOB_FETCHES).map(([key,value])=>[key,value.slice()])),jobResults:{...JOB_RESULTS},jobErrors:JOB_ERRORS.slice(),http:FETCHES.length,outcome:snapshotOutcome()};
 checkContinuationAccounting(second,secondComponent);
 const secondCustody=settledOriginalSuccessor(firstCustody.after,originalFixtureCustodyReadback(observationReads)),secondSelection=membershipRankSelection(originalRank,observationReads),secondHTTP=second.jobFetches.sweepMemberRoles||[],secondEffects=secondHTTP.filter(line=>/^(PUT|DELETE) /.test(line)&&line.includes(rolePath)),secondSweep=second.jobResults.sweepMemberRoles;
 const evidence={first:firstWitness,second,secondCustody,secondSelection,secondHTTP,observationReads,aggregateObserved:{logical:first.statements+second.statements,physical:first.physicalStatements+second.physicalStatements},actualScheduledCallbackQualified:false,fullRankConvergenceQualified:false};
 console.log('MEMBERSHIP_RANK_SECOND_PASS_EVIDENCE '+JSON.stringify(evidence));
 const secondRoot=secondCustody.qualified&&secondCustody.root.ticket_id!==firstCustody.root.ticket_id&&secondComponent.componentReturned===true&&secondComponent.componentValue===undefined&&secondComponent.componentChildrenJoined===true&&secondComponent.jobs===23&&second.jobErrors.length===0;
 check('next installed component invocation has distinct settled custody over the unchanged original floor and prior tickets',secondRoot,evidence);if(!secondRoot)throw Error('membership-rank second original custody unqualified');
 const sameMembership=sameOriginalSelection(firstSelection,secondSelection,originalRank)&&JSON.stringify(secondSelection.membership)===JSON.stringify(firstSelection.membership)&&secondSelection.provider.membership===true&&!secondEffects.some(line=>line.endsWith(membershipPath))&&secondSweep?.checked===1&&!secondSweep.restored.includes(originalRank.subject)&&secondEffects.length===1&&secondEffects[0].startsWith('DELETE ')&&[RANK_LABELS[5],OFFICER].some(role=>secondEffects[0].endsWith(rolePath+role));
 check('next rank phase keeps the entire membership receipt and original selection with no duplicate membership effect',sameMembership,evidence);if(!sameMembership)throw Error('membership-rank second phase invariance unqualified');
 checkOriginalRankOutcome(second,originalRank);
 return evidence;
}
(async()=>{const body=/export async function runSourceEpoch2ScheduledBody[\s\S]*?\n\}/.exec(readSource(path.join(root,'src/index.ts')))[0],selected=['ensureSchema',...[...body.matchAll(/deferOriginalServing\(ctx,'(\w+)',/g)].map(m=>m[1])],jobs=budget.SCHEDULED_BUDGET.map(j=>j.job),sum=budget.SCHEDULED_BUDGET.reduce((n,j)=>n+j.worst,0);check('current selected24-job static source sum670 is derived; no provider or actual scheduled qualification',selected.length===24&&selected.join()===jobs.join()&&sum===670&&budget.SCHEDULED_WORST_CASE===sum&&sum<=budget.SCHEDULED_STATEMENT_TARGET&&budget.SCHEDULED_STATEMENT_TARGET===700&&budget.D1_STATEMENTS_PER_INVOCATION===1000&&line('ensureSchema')===206&&line('sweepServingRetention')===21&&line('runServingErasureJob')===155&&line('runEventReminders')===7&&CAP.rosterEffectsStatements===56,{sum,jobs});
 const offWarm=await whole('warm',false),offCold=await whole('cold',false),offWorst=await whole('cold worst',false);check('OFF current profiles prove schema; historical cold162/all-ALTER206 positives unavailable',!offWarm.schemaHeld&&!offCold.schemaHeld&&offWorst.schemaHeld&&offWorst.ordinary.held,{warm:offWarm.physicalStatements,cold:offCold.physicalStatements,worst:offWorst.physicalStatements});
 const warm=await whole('warm',true),cold=await whole('cold',true),worst=await whole('cold worst',true);check('ON current profiles prove schema; missing original marker holds unchanged',!warm.schemaHeld&&!cold.schemaHeld&&worst.schemaHeld&&worst.ordinary.held,{warm:warm.physicalStatements,cold:cold.physicalStatements,worst:worst.physicalStatements});await whole('warm',true,true);
 await whole('cold worst',true,false,'auto-site');await whole('cold worst',true,false,'auto-bot');await whole('cold worst',true,false,'note');await whole('cold worst',true,false,'member-missing');await whole('cold worst',true,false,'note-lost');
 await whole('cold worst',true,'terminal','note');await whole('cold worst',true,'role-block','note');
 await whole('cold worst',true,false,'auto-site-missing');
 check('all15 original cases retain exactly17 component source-body invocations with two persisted membership continuations',reports.length===15&&observedSourceBodyInvocations===17&&reports.filter(report=>report.membershipRankContinuation).length===2,{cases:reports.length,componentSourceBodies:observedSourceBodyInvocations});
 const erasureComponentScalar=makeLoader()('./privacy-serving-jobs').SERVING_ERASURE_JOB_WORST;check('actual component151 and ordinary reservation155 are explicit source constants; no measured-cost equality claim',erasureComponentScalar===151&&line('runServingErasureJob')===155&&line('runServingErasureJob')>=erasureComponentScalar,{component:erasureComponentScalar,reservation:line('runServingErasureJob')});
 check('all loaded serving source/schema bytes stable during measured gates',Array.from(SOURCE_PINS).every(([file,p])=>{const b=fs.readFileSync(file);return b.length===p.bytes&&cryptoNode.createHash('sha256').update(b).digest('hex')===p.sha256;}));console.log(JSON.stringify({reports,componentSourceBodyInvocations:observedSourceBodyInvocations,sourcePins:Array.from(SOURCE_PINS,([file,p])=>({file,...p})),declaredOrdinary:budget.SCHEDULED_WORST_CASE,declaredInstalled:budget.ADMISSION_SCHEDULED_WORST_CASE,target700:700,normalScheduledEntryQualified:false,provider30SecondsQualified:false,worker128MiBQualified:false,measurement:'actual shared source body under original fetch-root; ordinary plain controller independently HOLD0',model:'every attempted SQL statement; all batch statements charged including refused transaction',realProviderActions:0,productionWrites:0}));console.log(`${ok}/${n} joined whole scheduled accounting checks passed`);if(ok!==n)process.exitCode=1;
})().catch(e=>{console.error('joined native scheduler fixture stopped',e.stack);process.exitCode=1;}).finally(()=>{globalThis.Date=RealDate;globalThis.setTimeout=realSetTimeout;db?.close();doDb?.close();});

// Current ABI successor of the existing roster worklist cases, through actual source and Native SQLite.
// Original full1000, long-notice1000, failure/resume/supersession,120-row legacy, stamp/order,20stop,
// exact per-item cost, manual1000 and identity300 workloads/case assertions remain below.
// Real HTTP exports retain index.fetch; direct calls and unsigned manual sync are explicitly component measurements
// under original source-owned global fetch-root. Ordinary scheduled({}) independently HOLDs with zero Native/jobs.
// Bounded expectation successor: original fault trees remain asserted; additional continuation is explicitly separate.
// Cost-fault custody is preserved before separate fault-free component measurements; no universal worst-case claim.
// Logical payload and physical Native costs are recorded separately; provider metering/time/memory remain unqualified.
// Run from worker: node tests/roster_effects_test.cjs
const CI_ROSTER_GROUPS = Object.freeze([
  { id: 'constants-full', expectedChecks: 13, entryClock: 1791001234, entryInteractionSequence: 0, entryFaultObservation: false },
  { id: 'notice-debt', expectedChecks: 5, entryClock: 1791007414, entryInteractionSequence: 0, entryFaultObservation: false },
  { id: 'faults-and-fences', expectedChecks: 51, entryClock: 1791015274, entryInteractionSequence: 0, entryFaultObservation: false },
  { id: 'manual-sync', expectedChecks: 4, entryClock: 1791016476, entryInteractionSequence: 0, entryFaultObservation: true },
  { id: 'manual-notice-debt', expectedChecks: 4, entryClock: 1791020796, entryInteractionSequence: 72, entryFaultObservation: true },
  { id: 'identity', expectedChecks: 23, entryClock: 1791026256, entryInteractionSequence: 163, entryFaultObservation: true },
].map(Object.freeze));
const selectedRosterGroup = process.env.OLYMPUS_CI_ROSTER_GROUP;
if (process.env.OLYMPUS_CI_CASE_POOL === '1' && selectedRosterGroup === undefined) {
  require('../scripts/ci-case-pool.cjs').runCasePool({ file: __filename, groups: CI_ROSTER_GROUPS, childEnvKey: 'OLYMPUS_CI_ROSTER_GROUP' })
    .catch(error => { console.error(error); process.exitCode = 1; });
  return; // Parent never imports the fixture or patches its globals.
}
if (selectedRosterGroup !== undefined && (process.env.GITHUB_ACTIONS !== 'true' || process.env.OLYMPUS_CI_CASE_POOL !== '1' || !CI_ROSTER_GROUPS.some(group => group.id === selectedRosterGroup))) {
  throw Error('invalid CI roster fixture group');
}
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = process.env.OLYMPUS_ROSTER_SOURCE || path.join(__dirname, "..");

// ---------- a D1-shaped wrapper over SQLite that counts every statement attempt; FAIL refuses one (it still counts) ----------
let COUNT=0,PHYSICAL=0,TRIPS=0,PHYSICAL_TRIPS=0;
let FAIL=null,AFTER_BATCH=null,BEFORE_BATCH=null,lastFailedSQL=null,lastNativeSQL='',nativeSingle=false;
const originalDiagnosticFaultAttempts=[];
const counters=()=>({COUNT,PHYSICAL,TRIPS,PHYSICAL_TRIPS});
const restoreCounters=c=>{({COUNT,PHYSICAL,TRIPS,PHYSICAL_TRIPS}=c);};
const resetCount=()=>{COUNT=0;PHYSICAL=0;TRIPS=0;PHYSICAL_TRIPS=0;lastFailedSQL=null;};
function d1(dbh){return entry.originalNativePort(dbh,{
 count(){PHYSICAL++;PHYSICAL_TRIPS++;nativeSingle=true;},
 async beforeBatch(stmts){nativeSingle=false;PHYSICAL+=stmts.length-1;const payload=stmts.filter(s=>!s.statement.includes('privacy_write_admission'));if(payload.length){COUNT+=payload.length;TRIPS++;}
  for(const s of stmts){const numbered=Math.max(0,...[...s.statement.matchAll(/\?(\d+)/g)].map(m=>Number(m[1])));if(numbered&&numbered!==s.params.length||s.params.length>99)throw Error('D1_ERROR: invalid parameter count');}
  await BEFORE_BATCH?.(stmts.map(s=>s.statement),stmts.map(s=>s.params));},
 statement(sql,params){if(nativeSingle){nativeSingle=false;if(!sql.includes('privacy_write_admission')){COUNT++;TRIPS++;}}lastNativeSQL=sql;if(FAIL&&FAIL(sql,params)){lastFailedSQL={sql,params:params.slice()};originalDiagnosticFaultAttempts.push({clock:T,sql,params:params.slice(),counts:counters()});throw Error('D1_ERROR: refused by the suite');}},
 async afterBatch(stmts){await AFTER_BATCH?.(stmts.map(s=>s.statement),stmts.map(s=>s.params));}
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

// ---------- one actual source graph per full current fixture; original Native clock/fetch precede graph imports ----------
const transpiled = {};
const transpile = (file) => (transpiled[file] ??= ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
function makeLoader() {
  const cache = {};
  const load = (name) => {
    if(name==='node:async_hooks')return require(name);
    if (cache[name]) return cache[name].exports;
    const mod = { exports: {} };
    cache[name] = mod;
    new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
    return mod.exports;
  };
  return load;
}

// ---------- the clock ----------
const RealDate = Date;
const H = 3600, DAY = 86400;
let T = 1791001234;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); }
  static now() { return T * 1000; }
};
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms===250?0:ms, ...a);

// ---------- Discord, faked at fetch() ----------
const GUILD = "236932545793490944", ROLE = "1549581282227265566", OFFICER = "1549581672272625734", NOTICES = "1550000000000000020", OFFICER_USER = "999999999999999999";
let HAS_ROLE = new Set(), ON_PUT = null, FETCHES = [], NOTICE_USERS = [], FAIL_REMOVE = false, FAIL_MEMBER = false, FAIL_NICK = false;
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const request=url instanceof Request?url:null;const u=new URL(request?request.url:String(url)),method=request?request.method:init.method||'GET',p=u.pathname;
  if(request)init={...init,method,headers:request.headers,body:['GET','HEAD'].includes(method)?undefined:await request.clone().text()};
  FETCHES.push(`${method} ${p}`);
  let m;
  if(p==='/api/v10/users/@me')return reply({id:'1550000000000000021',bot:true});
  if(method==='GET'&&p===`/api/v10/channels/${NOTICES}`)return reply({id:NOTICES,guild_id:GUILD,type:0});
  if (p === `/api/v10/guilds/${GUILD}/roles`) return reply([{id:GUILD,position:0,permissions:'0',managed:false},{id:ROLE,position:1,permissions:'0',managed:false},{id:OFFICER,position:2,permissions:'0',managed:false},{id:'1550000000000000022',position:10,permissions:'268435456',managed:false}]);
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)$/))) {
    if(method==='GET'&&m[1]==='1550000000000000021')return reply({roles:['1550000000000000022'],user:{id:m[1],bot:true}});
    if (method === "GET") return FAIL_MEMBER ? reply({ message: "boom" }, 500) : reply({ roles: HAS_ROLE.has(m[1]) ? [ROLE] : [], user: { id: m[1], username: "u" } });
    if (method === "PATCH") return FAIL_NICK ? reply({ message: "Missing Permissions", code: 50013 }, 403) : reply({});
  }
  if ((m = p.match(/^\/api\/v10\/guilds\/\d+\/members\/(\d+)\/roles\/\d+$/))) {
    if (method === "PUT") { HAS_ROLE.add(m[1]); await ON_PUT?.(m[1]); return new Response(null, { status: 204 }); }
    if (FAIL_REMOVE) return reply({ message: "Missing Permissions", code: 50013 }, 403);
    HAS_ROLE.delete(m[1]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)) && method === "POST") {
    const body = JSON.parse(init.body || "{}");
    if (m[1] === NOTICES) NOTICE_USERS.push(...(body.allowed_mentions?.users ?? []));
    return reply({id:'1550000000000000098',channel_id:m[1],author:{id:'1550000000000000021',bot:true},type:0,content:body.content,nonce:body.nonce,embeds:[],attachments:[]});
  }
  if ((m = p.match(/^\/api\/v10\/users\/(\d+)$/))) return reply({ id: m[1], username: "user", global_name: null });
  return reply({ message: "unexpected in this suite: " + method + " " + p }, 500);
};
const resetDiscord = () => { HAS_ROLE = new Set(); ON_PUT = null; FETCHES = []; NOTICE_USERS = []; FAIL_REMOVE = false; FAIL_MEMBER = false; FAIL_NICK = false; };

const L0 = makeLoader();
const budget = L0("./scheduled-budget");
const fx = L0("./roster-effects");
const TARGET = budget.SCHEDULED_STATEMENT_TARGET;

const TOKEN = "watcher-token-for-tests-only-0123456789";
const env = (over = {}) => entry.currentEntryEnvironment({
  DB: admitted??native,...floorBindings,SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,DISCORD_APP_ID:'1550000000000000021', DISCORD_BOT_TOKEN: "test-token", GUILD_ID: GUILD, ROLE_GUILD_MEMBER: ROLE, ROLE_OFFICER: OFFICER, WATCHER_TOKEN: TOKEN,
  VERIFY_SECRET: "verify-secret-for-tests", COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", PUBLIC_BASE_URL: "https://verify.example",
  CHANNEL_NOTICES: NOTICES, ADMISSION_MODE: "auto", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10",
  ...over,
});

let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const run=(sql,...p)=>installed?setupWriter.prepare(sql).bind(...p).run().then(r=>({changes:r.meta.changes,lastInsertRowid:r.meta.last_row_id})):db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const quiet = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };

// ---------- the seed ----------
const did = (i) => String(400000000000000000n + BigInt(i));
const nm = (i) => "Mem" + String(i).padStart(4, "0");
const key = (i) => nm(i).toLowerCase();
const guid = (i) => "Player-1-" + String(i).padStart(8, "0");
const filler = (i) => ({ name: "Fil" + String(i).padStart(4, "0"), rank: "Member", rankIndex: 4, guid: "Player-2-" + String(i).padStart(8, "0") });
const fillers = (k) => Array.from({ length: k }, (_, i) => filler(i));
const rosterOf = (from, k, rankIndex = 3) => Array.from({ length: k }, (_, j) => ({ name: nm(from + j), rank: "Member", rankIndex, guid: guid(from + j) }));
async function link(i, { status = "verified", pinned = true, role = false } = {}) {
  (await run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING", did(i)));
  (await run("INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source, guid, member_since) VALUES (?, ?, ?, ?, ?, ?, 'whisper', ?, ?)", key(i), nm(i), did(i), status, T - DAY, T - DAY, pinned ? guid(i) : null, status === "member" || status === "left_pending" ? T - 10 * DAY : null));
  if (role) HAS_ROLE.add(did(i));
}
async function seedSnapshot(list, exportedAt) {
  const sid = Number((await run("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', ?, 'seeded', 1, 1, ?)", exportedAt, exportedAt, list.length, exportedAt)).lastInsertRowid);
  const ins = "INSERT INTO roster_members (snapshot_id, name_key, name, rank, rank_index, guid, public_note) VALUES (?, ?, ?, ?, ?, ?, ?)";
  for (const m of list) (await run(ins, sid, m.name.toLowerCase(), m.name, m.rank ?? "Member", m.rankIndex ?? 3, m.guid ?? null, m.note ?? null));
  return sid;
}
/** A derived run of the newest snapshot with `items` ([kind, index]) pending, as an export leaves it when its invocation could not finish. */
async function seedRun(items) {
  const snap = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  const runId = Number((await run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at, derived_at, items) VALUES (?, ?, 1, ?, ?, ?)", snap, snap, T - 600, T - 600, items.length)).lastInsertRowid);
  for(const [seq,[kind,i]]of items.entries())(await run("INSERT INTO roster_effects (run_id, seq, kind, name_key, name, discord_id, guid) VALUES (?, ?, ?, ?, ?, ?, ?)", runId, seq, kind, key(i), nm(i), did(i), kind === "depart" ? null : guid(i)));
  return runId;
}
const latestRun = () => one("SELECT * FROM roster_effect_runs ORDER BY id DESC LIMIT 1");
const statusOf = (i) => one("SELECT status FROM characters WHERE name_key = ?", key(i))?.status;
const auditCount = (action, subject) => (subject === undefined ? one("SELECT COUNT(*) AS c FROM audit WHERE action = ?", action) : one("SELECT COUNT(*) AS c FROM audit WHERE action = ? AND subject = ?", action, subject)).c;
const puts = () => FETCHES.filter((f) => /^PUT \/api\/v10\/guilds\/\d+\/members\/\d+\/roles\//.test(f));

// Observation-only reads of this existing synthetic fixture. No source calls or clock/counter writes.
let observeOriginalFaultHTTP=false, originalObservationSequence=0, lastOriginalObservation=null;
const originalDebtObservations=[];
const originalJournalRows=()=>doDb.prepare("SELECT *,json_array(ticket_id,parent_ticket_id,native_floor,floor_sequence,purpose,nonce,request_digest,created_at,expires_at,state,result_digest,finished_at) AS nativeTuple FROM recovery_serving_ticket ORDER BY ticket_id").all();
function originalRosterState(includeItems=false){
 const run=latestRun(),remaining=one('SELECT COUNT(*) AS count FROM roster_effects WHERE run_id=?',run?.id??-1).count;
 const result={run,remaining,memberCount:one("SELECT COUNT(*) AS count FROM characters WHERE status='member'").count,audits:Object.fromEntries(['roster.member','notice.no_channel','nick.failed','role.deferred','roster.effects_failed'].map(action=>[action,auditCount(action)])),rolePuts:puts().length};
 if(includeItems){result.items=all('SELECT * FROM roster_effects ORDER BY run_id,seq');result.characters=all('SELECT name_key,status,discord_id,guid FROM characters ORDER BY name_key');result.promotionAuditCounts=all("SELECT subject,COUNT(*) AS count FROM audit WHERE action='roster.member' GROUP BY subject ORDER BY subject");}
 return result;
}
function emitOriginalObservation(kind,read){
 const before=counters();let detail;
 try{detail=read();}catch(error){detail={observationError:{name:error?.name,message:error?.message}};}
 const after=counters();const observation={sequence:++originalObservationSequence,kind,clock:T,counts:before,countersUnchanged:JSON.stringify(before)===JSON.stringify(after),...detail};lastOriginalObservation=observation;if(kind==='notice-debt-slice')originalDebtObservations.push(observation);console.log('ORIGINAL_ROSTER_OBSERVATION '+JSON.stringify(observation));
}
function observeOriginalDebt(kind,result,exportedAt){
 emitOriginalObservation('notice-debt-slice',()=>({invocation:kind,originalPacketExportedAt:exportedAt,componentOnly:result.componentOnly??false,held:result.held??false,statements:result.statements,physicalStatements:result.physicalStatements,effects:result.body?.effects??null,state:originalRosterState()}));
}
function observeOriginalHTTP(before,status,body){
 emitOriginalObservation('original-fault-http',()=>{
  const after=originalJournalRows(),priorIds=new Set(before.journal.map(r=>r.ticket_id)),roots=after.filter(r=>r.parent_ticket_id===null&&!priorIds.has(r.ticket_id)),ids=new Set(roots.map(r=>r.ticket_id));
  let added=true;while(added){added=false;for(const row of after)if(ids.has(row.parent_ticket_id)&&!ids.has(row.ticket_id)){ids.add(row.ticket_id);added=true;}}
  const postById=new Map(after.map(r=>[r.ticket_id,r]));
  return {status,body,failedSQLWitness:lastFailedSQL,beforeState:before.state,afterState:originalRosterState(true),journal:{rootCount:roots.length,roots,tree:after.filter(r=>ids.has(r.ticket_id)),priorRootsBefore:before.journal.filter(r=>r.parent_ticket_id===null),priorRootsAfter:after.filter(r=>r.parent_ticket_id===null&&priorIds.has(r.ticket_id)),priorJournalUnchanged:before.journal.every(r=>JSON.stringify(r)===JSON.stringify(postById.get(r.ticket_id)))}};
 });
}

// Local fixture predicates reviewed against two runs; they grant no runtime authority and issue no requests.
function originalTicketTree(o, rootState, expectedCounts) {
  const j=o?.journal,tree=j?.tree,root=j?.roots?.[0];
  if(!o?.countersUnchanged||!j||j.rootCount!==1||j.roots.length!==1||!root||!tree||!j.priorJournalUnchanged)return false;
  if(root.purpose!=='fetch'||root.parent_ticket_id!==null||root.state!==rootState||root.floor_sequence!==1||root.created_at!==o.clock||root.expires_at!==o.clock+300)return false;
  const hex32=/^[a-f0-9]{32}$/,hex64=/^[a-f0-9]{64}$/;
  if(new Set(tree.map(r=>r.ticket_id)).size!==tree.length||new Set(tree.map(r=>r.nonce)).size!==tree.length)return false;
  if(!tree.every(r=>hex32.test(r.ticket_id)&&hex32.test(r.nonce)&&hex64.test(r.request_digest)&&hex64.test(r.result_digest)&&r.finished_at===o.clock&&['native_floor','floor_sequence','request_digest','created_at','expires_at'].every(k=>r[k]===root[k])&&(r.ticket_id===root.ticket_id?r.parent_ticket_id===null:r.parent_ticket_id===root.ticket_id)))return false;
  const counts={};for(const r of tree)counts[r.purpose+':'+r.state]=(counts[r.purpose+':'+r.state]??0)+1;
  if(Object.keys(counts).length!==Object.keys(expectedCounts).length||!Object.entries(expectedCounts).every(([k,v])=>counts[k]===v))return false;
  return rootState==='settled'||tree.filter(r=>r.purpose==='d1'&&r.state==='unknown'&&r.parent_ticket_id===root.ticket_id).length===1;
}
function exactOriginalPending(items,run,start,end,sequenceOffset=0){
  return items.length===end-start&&items.every((r,j)=>{const i=start+j;return r.run_id===run&&r.seq===i-sequenceOffset&&r.kind==='promote'&&r.name_key===key(i)&&r.name===nm(i)&&r.discord_id===did(i)&&r.guid===guid(i)&&r.subject_generation===null&&r.claim===null&&r.done_at===null;});
}
function exactOriginalHeld(o,total,committed,settledD1,settledProvider,postCommit=false){
  if(o?.status!==503||JSON.stringify(o.body)!==JSON.stringify({error:'original_serving_held'})||!originalTicketTree(o,'unknown',{'fetch:unknown':1,'d1:unknown':1,'d1:settled':settledD1,'provider:settled':settledProvider}))return false;
  const s=o.afterState,w=o.failedSQLWitness,p=w?.params;
  if(!s||s.run?.id!==1||s.run.snapshot_id!==1||s.run.items!==total||s.run.derived_at===null||s.run.done_at!==null||s.run.superseded_at!==null||s.remaining!==total-committed||s.memberCount!==committed||s.rolePuts!==committed||!exactOriginalPending(s.items,1,committed,total))return false;
  if(s.characters.length!==total||!s.characters.every((c,i)=>c.name_key===key(i)&&c.discord_id===did(i)&&c.guid===guid(i)&&c.status===(i<committed?'member':'verified')))return false;
  const promoted=Array.from({length:committed},(_,i)=>i).filter(i=>!postCommit||i!==20);
  if(s.promotionAuditCounts.length!==promoted.length||!s.promotionAuditCounts.every((a,i)=>a.subject===nm(promoted[i])&&a.count===1)||s.audits['roster.effects_failed']!==(postCommit?2:1))return false;
  if(postCommit)return /^INSERT INTO audit/.test(w?.sql??'')&&p?.length===6&&p[0]===o.clock&&p[1]==='system'&&p[2]==='roster.member'&&p[3]===nm(20)&&p[4]===JSON.stringify({discordId:did(20),roleGranted:true,roleBlocked:false,_privacySubjectIds:[did(20)]})&&p[5]===JSON.stringify([{id:did(20),g:null}]);
  return /^UPDATE characters SET status = 'member'/.test(w?.sql??'')&&p?.length===8&&p[0]===1&&p[1]===10&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p[2])&&p[3]===o.clock&&p[4]===key(10)&&p[5]===did(10)&&p[6]===guid(10)&&p[7]===0;
}
function exactOriginalIncompleteRetry(o){
  const s=o?.afterState;
  return o?.status===200&&o.failedSQLWitness===null&&JSON.stringify(o.body.effects)===JSON.stringify({run:2,derived:true,items:19,applied:17,skipped:0,pending:true,deferredIdentity:0,failed:false})&&originalTicketTree(o,'settled',{'fetch:settled':1,'d1:settled':130,'provider:settled':35})&&s?.run.id===2&&s.run.snapshot_id===1&&s.run.items===19&&s.run.done_at===null&&s.run.superseded_at===null&&s.remaining===2&&s.memberCount===38&&s.rolePuts===38&&exactOriginalPending(s.items,2,38,40,21)&&s.characters.length===40&&s.characters.every((c,i)=>c.name_key===key(i)&&c.discord_id===did(i)&&c.guid===guid(i)&&c.status===(i<38?'member':'verified'));
}
function exactOriginalDebtProgress(observations){
  const first=observations[0],exports=observations.filter(o=>o.invocation==='export'),crons=observations.filter(o=>o.invocation==='cron');
  return observations.length===132&&exports.length===67&&crons.length===65&&exports[0].effects.applied===11&&exports.slice(1,-1).every(o=>o.effects.applied===15)&&exports.at(-1).effects.applied===14&&observations.every((o,i)=>o.countersUnchanged&&o.originalPacketExportedAt===first.originalPacketExportedAt&&o.clock===first.clock+i*60&&o.state.run.id===first.state.run.id&&o.state.run.snapshot_id===first.state.run.snapshot_id&&o.state.rolePuts===0&&o.statements<= (o.invocation==='export'?budget.ROSTER_INGEST_STATEMENTS:TARGET)&&o.physicalStatements<=TARGET&&(i===observations.length-1?o.state.run.done_at!==null:o.state.run.done_at===null)&&(o.invocation==='cron'?o.held===true&&o.statements===0&&o.physicalStatements===0&&o.state.remaining===observations[i-1].state.remaining:o.effects.applied===(i===0?1000:observations[i-1].state.remaining)-o.state.remaining))&&exports.at(-1).state.remaining===0&&exports.at(-1).state.memberCount===1000;
}

// Exact original cost-fault custody, separate from the fault-free measurements below.
function exactOriginalCostFault(error,o){
 const failure=originalComponentFailures.get(error),after=o?.after,rows=after?.journal,roots=rows?.filter(r=>r.parent_ticket_id===null),root=roots?.[0];
 if(!(error instanceof activeLoader('./privacy-recovery-held').RecoveryFloorHeld)||!failure?.componentReturned||!o?.countersUnchanged||o.kind!=='original-slice-cost-exception'||o.extra.originalComponentRecorded!==true||o.extra.rethrowsSameError!==true||o.extra.kind!=='promote'||o.extra.k!==2||!after?.observationCountersUnchanged||o.before?.observationError?.message!=='database is not open'||!rows||rows.length!==39||roots.length!==1)return false;
 const expected={'fetch:unknown':1,'d1:unknown':4,'d1:settled':25,'provider:settled':9},counts={};for(const r of rows)counts[r.purpose+':'+r.state]=(counts[r.purpose+':'+r.state]??0)+1;
 if(Object.keys(counts).length!==4||!Object.entries(expected).every(([k,v])=>counts[k]===v)||root.purpose!=='fetch'||root.state!=='unknown'||root.floor_sequence!==1||root.created_at!==o.clock||root.expires_at!==o.clock+300)return false;
 if(new Set(rows.map(r=>r.ticket_id)).size!==39||new Set(rows.map(r=>r.nonce)).size!==39||!rows.every(r=>/^[a-f0-9]{32}$/.test(r.ticket_id)&&/^[a-f0-9]{32}$/.test(r.nonce)&&/^[a-f0-9]{64}$/.test(r.request_digest)&&/^[a-f0-9]{64}$/.test(r.result_digest)&&r.finished_at===o.clock&&['native_floor','floor_sequence','request_digest','created_at','expires_at'].every(k=>r[k]===root[k])&&(r.ticket_id===root.ticket_id?r.parent_ticket_id===null:r.parent_ticket_id===root.ticket_id)))return false;
 const faults=after.faultAttempts.filter(f=>f.clock===o.clock&&/^INSERT INTO audit/.test(f.sql)&&['role.revoked_after_hold','role.revoke_pending'].includes(f.params[2]));
 const expectedFaults=[['role.revoked_after_hold',did(0),11,26],['role.revoke_pending',did(0),12,31],['role.revoked_after_hold',did(1),25,70],['role.revoke_pending',did(1),26,75]];
 if(faults.length!==4||!faults.every((f,i)=>f.params[2]===expectedFaults[i][0]&&f.params[3]===expectedFaults[i][1]&&f.counts.COUNT===expectedFaults[i][2]&&f.counts.PHYSICAL===expectedFaults[i][3]))return false;
 return o.counts.COUNT===34&&o.counts.PHYSICAL===108&&failure.componentValue?.effects?.applied===2&&failure.componentValue.effects.pending===false&&failure.componentValue.effects.failed===false&&after.state.memberCount===2&&after.state.items.length===0&&after.state.promotionAuditCounts.length===2&&after.state.promotionAuditCounts.every((a,i)=>a.subject===nm(i)&&a.count===1)&&after.provider.roles.length===0&&after.provider.noticeUsers.length===0&&after.provider.fetches.filter(f=>f.startsWith('DELETE ')).length===2;
}

// Read-only observations of existing fixture state. No source invocation, counter reset or authority substitution.
function originalBoundarySnapshot(){
 const before=counters();let value;
 try{value={clock:T,journal:originalJournalRows(),state:originalRosterState(true),runs:all('SELECT * FROM roster_effect_runs ORDER BY id'),snapshots:all('SELECT * FROM roster_snapshots ORDER BY id'),provider:{fetches:FETCHES.slice(),roles:[...HAS_ROLE].sort(),noticeUsers:NOTICE_USERS.slice()},faultAttempts:originalDiagnosticFaultAttempts.slice()};}
 catch(error){value={observationError:{name:error?.name,message:error?.message}};}
 return {...value,observationCountsBefore:before,observationCountsAfter:counters(),observationCountersUnchanged:JSON.stringify(before)===JSON.stringify(counters())};
}
function observeOriginalBoundary(kind,before,extra){
 emitOriginalObservation(kind,()=>{
  const after=originalBoundarySnapshot();if(before.observationError||after.observationError)return{before,after,extra};
  const prior=new Map(before.journal.map(r=>[r.ticket_id,r])),post=new Map(after.journal.map(r=>[r.ticket_id,r]));
  const newTickets=after.journal.filter(r=>!prior.has(r.ticket_id)),roots=newTickets.filter(r=>r.parent_ticket_id===null);
  return{before,after,extra,newTickets,newRoots:roots,priorJournalUnchanged:before.journal.every(r=>JSON.stringify(r)===JSON.stringify(post.get(r.ticket_id))),newFaultAttempts:after.faultAttempts.slice(before.faultAttempts.length),providerDelta:{fetches:after.provider.fetches.slice(before.provider.fetches.length),noticeUsers:after.provider.noticeUsers.slice(before.provider.noticeUsers.length)}};
 });
}

// ---------- invocations ----------
/** One actual index.fetch export on the installed current profile; all emitted Native groups counted. */
async function ingestHttp(members, exportedAt, over = {}) {
  await readyCurrentProfile();const L=activeLoader;
  const observationBefore=observeOriginalFaultHTTP?{journal:originalJournalRows(),state:originalRosterState(true)}:null;
  resetCount();
  const res = await quiet(() => L("./index").default.fetch(new Request("https://verify.example/ingest/roster", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ exportedAt, members }) }), rawCurrentEnvironment(env(over)), { waitUntil: () => {} }));
  const originalResponseBody=await res.json();
  if(observationBefore)observeOriginalHTTP(observationBefore,res.status,originalResponseBody);
  return { status: res.status, body: originalResponseBody, statements: COUNT,physicalStatements:PHYSICAL };
}
/** One whole cron tick through the real scheduled(), in a fresh isolate, every job it hands to waitUntil awaited, counted whole. */
async function cronTick(over={}){
 await readyCurrentProfile();resetCount();const pending=[],lines=[],before=JSON.stringify(all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(t=>[t.name,all('SELECT * FROM '+t.name)]));const prior=console.error;console.error=(...a)=>lines.push(a.map(String).join(' '));
 try{await activeLoader('./index').default.scheduled({},rawCurrentEnvironment(env(over)),{waitUntil:p=>pending.push(p)});await Promise.all(pending);}finally{console.error=prior;}
 const after=JSON.stringify(all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(t=>[t.name,all('SELECT * FROM '+t.name)]));
 if(COUNT!==0||PHYSICAL!==0||pending.length!==0||before!==after||!lines.some(x=>x==='schema check failed; skipping this run error'))throw Error('ordinary scheduled HOLD contract changed');
 return {statements:COUNT,physicalStatements:PHYSICAL,jobs:pending.length,held:true};
}
/** Same fixture source realm for admission and component calls. */
const rosterMod=()=>activeLoader('./roster');
const invokeRoster=(name,e,...args)=>originalComponent(e,owned=>rosterMod()[name](owned,...args));
let iid = 0;
const syncCommand = () => ({ type: 2, id: "9" + String(++iid).padStart(17, "0"), token: "t", guild_id: GUILD, member: { user: { id: OFFICER_USER, username: "o" }, roles: [OFFICER] }, data: { name: "olympus-admin", options: [{ name: "sync", type: 1, options: [] }] } });
async function syncHttp(over = {}) {
  await readyCurrentProfile();const L=activeLoader;
  resetCount();
  const res=await quiet(()=>originalComponent(env(over),owned=>L('./interactions').handleInteraction(owned,syncCommand())));
  return { content: (await res.json()).data.content, statements: COUNT,physicalStatements:PHYSICAL,componentOnly:true };
}
async function ingestDirect(members, exportedAt, over = {}) {
  resetCount();
  const body = await quiet(() => invokeRoster('ingestRoster', env(over), exportedAt, members, "addon"));
  return { body, statements: COUNT,physicalStatements:PHYSICAL,componentOnly:true };
}

(async () => {
  // Pure shared fixture inputs. Each selected group owns a fresh Native DB and its
  // whole original multi-invocation chain; no continuation is divided between processes.
  const N = 1000;
  const lean = { ROLE_CALL_BUDGET: "4" };
  const changed = rosterOf(0, N).map((m, j) => (j === 0 ? { ...m, rankIndex: 2 } : m)); // one harmless rank change
  const debtEnv = { ...lean, SET_NICKNAME: "true", CHANNEL_NOTICES: "" };
  async function constantsFull() {
  console.log("== the constants: the cron's line, the allowances, the worst cases ==");
  check(`the cron's line is ${budget.SCHEDULED_CAPS.rosterEffectsStatements} statements and the table's sum stays at or below the target (${budget.SCHEDULED_WORST_CASE} <= ${TARGET})`, budget.SCHEDULED_BUDGET.some((j) => j.job === "continueRosterEffects" && j.worst === budget.SCHEDULED_CAPS.rosterEffectsStatements) && budget.SCHEDULED_WORST_CASE <= TARGET);
  const schemaLine = budget.SCHEDULED_BUDGET.find((j) => j.job === "ensureSchema").worst;
  check(`an export may spend the target less a cold schema check (${budget.ROSTER_INGEST_STATEMENTS} = ${TARGET} - ${schemaLine}); a sync 20 less (${budget.ROSTER_SYNC_STATEMENTS})`, budget.ROSTER_INGEST_STATEMENTS === TARGET - schemaLine && budget.ROSTER_SYNC_STATEMENTS === TARGET - schemaLine - 20);
  check("each kind's worst case covers its deferred case, and a departure is the cheapest", fx.EFFECT_WORST.promote >= fx.EFFECT_DEFERRED_WORST.promote && fx.EFFECT_WORST.note >= fx.EFFECT_DEFERRED_WORST.note && fx.EFFECT_WORST.depart <= Math.min(fx.EFFECT_DEFERRED_WORST.promote, fx.EFFECT_DEFERRED_WORST.note));
  check("the derivation of a 1,000-member roster with 1,000 links is a handful of statements, never one per member", fx.derivationWorst(1000, 1000) <= 20 && fx.sightingsWorst(1000) === 2);

  // ================= the counterexample: 1,000 links that all just verified, ROLE_CALL_BUDGET 4 =================
  console.log("\n== a full roster of 1,000 links that all just verified, ROLE_CALL_BUDGET 4, over successive invocations ==");
  fresh(); resetDiscord();
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) (await link(i));
  (await seedSnapshot(rosterOf(0, N), T - 2 * H));
  db.exec("COMMIT");
  let exportedAt = T - 60;
  const log = [];
  let r = await ingestHttp(changed, exportedAt, lean);
  log.push({ kind: "export", statements: r.statements,physicalStatements:r.physicalStatements, applied: r.body.effects?.applied ?? null });
  const first = r.body.effects;
  check(`the changed export: 200, a new snapshot, ${first && first.items} items derived, ${first && first.applied} applied in its own invocation and the rest left pending (${r.statements} statement attempts, schema check included)`, r.status === 200 && r.body.unchanged === false && first && first.derived === true && first.items === N && first.applied > 0 && first.applied < N && first.pending === true && r.statements <= TARGET, r.body.effects, r.statements);
  check("  the snapshot is complete, its run derived and not done; the old code would have needed about 4,000 attempts here", latestRun().derived_at !== null && latestRun().done_at === null && one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete === 1 && one("SELECT COUNT(*) AS c FROM roster_effects").c === N - first.applied);
  let doneBefore = [];
  for (let k = 0; k < 120 && latestRun().done_at === null; k++) {
    T += 60;
    doneBefore.push(latestRun().done_at);
    if (k % 2 === 0) {
      exportedAt += 60;
      r = await ingestHttp(changed, exportedAt, lean); // the addon exports the same roster again
      log.push({ kind: "export", statements: r.statements,physicalStatements:r.physicalStatements, applied: r.body.effects?.applied ?? null, status: r.status });
    } else {
      const before = one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c;
      const c = await cronTick(lean);
      log.push({ kind: "cron", statements: c.statements,physicalStatements:c.physicalStatements,held:c.held, applied: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c - before });
    }
  }
  const worstExport = Math.max(...log.filter((x) => x.kind === "export").map((x) => x.statements));
  const worstCron = Math.max(...log.filter((x) => x.kind === "cron").map((x) => x.statements));
  console.log(`    ${log.length} invocations (${log.filter((x) => x.kind === "export").length} exports, ${log.filter((x) => x.kind === "cron").length} cron runs); the costliest export ${worstExport}, the costliest cron run ${worstCron} statement attempts`);
  check(`every invocation within the ${TARGET} target, its cold schema check included (exports at most ${worstExport}, cron runs at most ${worstCron})`, log.every((x) => x.statements <= TARGET && x.physicalStatements<=TARGET && (x.status === undefined || x.status === 200)), log.filter((x) => x.statements > TARGET));
  check("  real exports progress; every ordinary cron attempt is independently held with zero work", log.filter(x=>x.kind==='export').every(x=>x.applied>0)&&log.filter(x=>x.kind==='cron').every(x=>x.held===true&&x.applied===0&&x.statements===0&&x.physicalStatements===0),log);
  check(`the backlog is done: all ${N} links are members, the run done, no item left`, one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && latestRun().done_at !== null && one("SELECT COUNT(*) AS c FROM roster_effects").c === 0);
  check("  and done only at the end: done_at stayed empty until the last invocation", doneBefore.every((d) => d === null));
  const memberAudits = all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject");
  check(`  each link promoted exactly once: ${memberAudits.length} roster.member subjects, none twice`, memberAudits.length === N && memberAudits.every((x) => x.c === 1));
  check(`  each grant deferred to the role sweep through the role writer (${auditCount("role.deferred")} role.deferred), no role PUT attempted with 4 requests a run`, auditCount("role.deferred") === N && puts().length === 0);
  const welcomed = [...NOTICE_USERS, ...all("SELECT subject FROM audit WHERE action = 'notice.suppressed'").map((x) => x.subject)];
  check(`  each welcome said once (posted or, over the cap, audited as suppressed): ${welcomed.length} for ${new Set(welcomed).size} accounts`, welcomed.length === N && new Set(welcomed).size === N);
  }

  async function noticeDebt() {
  // The former admission counted spent SQL only. Buffered notices still owed one audit each here, so 81 admitted
  // promotions produced 605 statements against the roster allowance of 536 (before any cold schema cost).
  console.log("\n== notice debt across long slices: 1,000 deferred grants, failed nicknames, no notice channel ==");
  fresh(); resetDiscord(); FAIL_NICK = true;
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) (await link(i));
  (await seedSnapshot(rosterOf(0, N), T - 2 * H));
  db.exec("COMMIT");
  const debtAt = T - 60;
  const debtInvocations = [];
  let debt = await ingestDirect(changed, debtAt, debtEnv);
  debtInvocations.push({ kind: "export", statements: debt.statements });
  observeOriginalDebt("export",debt,debtAt);
  const debtRun = latestRun().id;
  check("the first long slice includes its finally flush within the roster allowance and leaves durable work", debt.body.effects.applied > 0 && debt.body.effects.pending && debt.statements <= budget.ROSTER_INGEST_STATEMENTS, debt.statements, debt.body.effects);
  let debtIterations=0;
  for (let k = 0; k < 132 && latestRun().done_at === null; k++) {
    debtIterations++;
    T += 60;
    if (k % 2 === 0) {
      debt = await ingestDirect(changed, debtAt, debtEnv); // retained packet: the same timestamp and same durable run
      debtInvocations.push({ kind: "export", statements: debt.statements });
  observeOriginalDebt("export",debt,debtAt);
    } else {
      const c = await cronTick(debtEnv);
      debtInvocations.push({ kind: "cron", statements: c.statements });
      observeOriginalDebt("cron",c,debtAt);
    }
  }
  check("notice debt: initial 11, then exactly 15 per export and 14 finally; retained packet/run, zero-work HOLD crons and bounded costs", exactOriginalDebtProgress(originalDebtObservations));
  check("notice debt loop exits through done_at after 131 of 132 allowed iterations, with no final cron or pending item", debtIterations===131 && latestRun().done_at!==null && originalDebtObservations.at(-1).invocation==='export' && one("SELECT COUNT(*) AS c FROM roster_effects").c===0);
  check("all long slices reserve accumulated notices: exports within their own allowance, whole cold cron within 700", debtInvocations.every((x) => x.statements <= (x.kind === "export" ? budget.ROSTER_INGEST_STATEMENTS : TARGET)), debtInvocations);
  check("the original run finishes via repeated packet retries and cron; 1,000 promotions and notice audits occur once", latestRun().id === debtRun && latestRun().done_at !== null && auditCount("roster.member") === N && auditCount("notice.no_channel") === N && auditCount("nick.failed") === N && puts().length === 0 && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'notice.no_channel' GROUP BY subject").every((x) => x.c === 1), latestRun());
  FAIL_NICK = false;

  // ================= a fault mid-slice, then the resume =================
  }
  async function faultsAndFences() {
  let r;
  console.log("\n== a fault mid-slice: before an item's commit it stays pending, after it the item is never repeated ==");
  observeOriginalFaultHTTP=true;
  fresh(); resetDiscord();
  const F = 40;
  db.exec("BEGIN"); for (let i = 0; i < F; i++) (await link(i)); db.exec("COMMIT");
  const fAt = T - 600;
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(10); // item 10's claim batch refused
  r = await ingestHttp(rosterOf(0, F), fAt);
  FAIL = null;
  check("item-10 pre-commit fault returns original 503 with exact 107-ticket unknown custody and ten committed items", exactOriginalHeld(lastOriginalObservation,F,10,83,22),r.body);
  check("  item 10's whole batch rolled back: still verified, still pending, no roster.member", statusOf(10) === "verified" && one("SELECT done_at FROM roster_effects WHERE name_key = ?", key(10))?.done_at === null && auditCount("roster.member", nm(10)) === 0 && statusOf(9) === "member");
  FAIL = (sql, p) => /^INSERT INTO audit/.test(sql) && p[2] === "roster.member" && p[3] === nm(20); // item 20's roster.member refused, after its commit
  T += 60;
  r = await ingestHttp(rosterOf(0, F), fAt); // the watcher sends the same export again: the skip path resumes
  FAIL = null;
  check("item-20 post-commit audit fault returns original 503 with exact 108-ticket custody; 21 committed members, 19 pending", exactOriginalHeld(lastOriginalObservation,F,21,83,23,true),r.body);
  check("  item 20 is done (its claim committed with its change), so nothing will repeat it; its roster.member is the loss, not a double", one("SELECT COUNT(*) AS c FROM roster_effects WHERE name_key = ?", key(20)).c === 0 && auditCount("roster.member", nm(20)) === 0);
  T += 60;
  r = await ingestHttp(rosterOf(0, F), T - 30); // a later identical export
  check("the original final retry is truthfully incomplete: 38 of 40 members; run 2 has Mem0038 and Mem0039 still pending", exactOriginalIncompleteRetry(lastOriginalObservation),r.body.effects);
  const perName = all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject");
  check("  no double effect among the 38 committed links: 37 audits excluding item 20, no audits for pending 38/39, 38 unique role PUTs and at most one welcome each", perName.length===F-3 && perName.every((x)=>x.c===1) && !perName.some((x)=>[nm(20),nm(38),nm(39)].includes(x.subject)) && puts().length===38 && new Set(puts()).size===puts().length && new Set(NOTICE_USERS).size===NOTICE_USERS.length,perName.length,puts().length);

  console.log("ROSTER_SUCCESSOR_SCOPE "+JSON.stringify({faultResumeCompletionQualified:false,additionalFaultResumeRequest:false,noticeDebtIterations:debtIterations,additionalNoticeClockIncrements:debtIterations-100}));

  // Separately approved fourth actual HTTP request: preserve the original three-request 38/40 evidence above.
  // Same packet bytes/timestamp as the third request, no clock step, loop, injected fault, floor reset or new authority.
  const originalFaultBoundary38=lastOriginalObservation, fourthClock=T;
  const fourthBefore=originalBoundarySnapshot();
  const originalUnknownRoots=fourthBefore.journal.filter(row=>row.parent_ticket_id===null&&row.state==='unknown');
  const fourthReady=exactOriginalIncompleteRetry(originalFaultBoundary38)&&fourthBefore.observationCountersUnchanged&&FAIL===null&&originalUnknownRoots.length===2&&originalUnknownRoots.every(row=>row.purpose==='fetch');
  check("fourth request starts only after the exact original 38/40 boundary with both unknown roots preserved",fourthReady);
  if(!fourthReady)throw Error('original_fault_fourth_request_precondition');
  const fourthPacket=rosterOf(0,F),fourthExportedAt=fourthClock-30;
  const fourth=await ingestHttp(fourthPacket,fourthExportedAt);
  const fourthHTTP=lastOriginalObservation;
  observeOriginalBoundary('fault-resume-separate-fourth-request',fourthBefore,{originalRequests:3,additionalRequests:1,clockUnchanged:T===fourthClock,exportedAt:fourthExportedAt,packet:fourthPacket,response:fourth,originalThreeRequestCompletionQualified:false});
  const fourthBoundary=lastOriginalObservation,fourthAfter=fourthBoundary.after;
  check("separate fourth same-packet HTTP request completes all40, the original run is done and no item remains",fourth.status===200&&fourth.body.skipped===true&&fourth.body.effects.applied===2&&fourth.body.effects.pending===false&&fourth.body.effects.failed===false&&latestRun().id===2&&latestRun().done_at!==null&&all('SELECT * FROM roster_effects').length===0&&one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c===F&&fourthAfter.state.characters.length===F&&fourthAfter.state.characters.every((row,i)=>row.name_key===key(i)&&row.discord_id===did(i)&&row.guid===guid(i)&&row.status==='member'),fourth);
  const fourthAudits=all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject ORDER BY subject");
  check("completed40 preserve the lost item20 audit:39 unique audits,40 unique role PUTs and no duplicated welcomes",fourthAudits.length===F-1&&fourthAudits.every(row=>row.c===1)&&!fourthAudits.some(row=>row.subject===nm(20))&&Array.from({length:F},(_,i)=>i).every(i=>auditCount('roster.member',nm(i))===(i===20?0:1))&&puts().length===F&&new Set(puts()).size===F&&new Set(NOTICE_USERS).size===NOTICE_USERS.length&&NOTICE_USERS.length<=F,fourthAudits.length,puts().length,NOTICE_USERS.length);
  // Counts are recorded, not guessed from historical source. The closed purposes and every original tuple are checked.
  const fourthTree=fourthHTTP.journal.tree;
  const fourthD1=fourthTree.filter(row=>row.purpose==='d1'&&row.state==='settled').length;
  const fourthProvider=fourthTree.filter(row=>row.purpose==='provider'&&row.state==='settled').length;
  const fourthUnknownRoots=fourthAfter.journal.filter(row=>row.parent_ticket_id===null&&row.state==='unknown');
  check("fourth request has one new settled original root and preserves every earlier ticket including both unknown roots",fourthD1>0&&fourthProvider>0&&originalTicketTree(fourthHTTP,'settled',{'fetch:settled':1,'d1:settled':fourthD1,'provider:settled':fourthProvider})&&fourthBoundary.priorJournalUnchanged&&fourthBoundary.newRoots.length===1&&fourthBoundary.newRoots[0].ticket_id===fourthHTTP.journal.roots[0].ticket_id&&fourthBoundary.newTickets.length===fourthTree.length&&fourthBoundary.newTickets.every(row=>row.state==='settled')&&JSON.stringify(fourthUnknownRoots)===JSON.stringify(originalUnknownRoots),{d1:fourthD1,provider:fourthProvider,roots:fourthBoundary.newRoots.length});
  check("the single fourth request keeps the existing clock, packet, logical/physical caps and read-only observations",T===fourthClock&&fourthExportedAt===T-30&&JSON.stringify(fourthPacket)===JSON.stringify(rosterOf(0,F))&&fourth.statements<=budget.ROSTER_INGEST_STATEMENTS&&fourth.physicalStatements<=TARGET&&fourthHTTP.countersUnchanged&&fourthBoundary.countersUnchanged&&fourthBefore.observationCountersUnchanged&&fourthAfter.observationCountersUnchanged&&fourthBoundary.newFaultAttempts.length===0,{logical:fourth.statements,physical:fourth.physicalStatements});

  // ================= supersession =================
  console.log("\n== a newer export supersedes an older run: nothing of the older one is applied after it ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 30; i++) (await link(i)); db.exec("COMMIT");
  const base = fillers(200);
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(10);
  r = await ingestHttp([...base, ...rosterOf(0, 30)], T - 900);
  FAIL = null;
  const oldRun = latestRun().id;
  check("(set-up) original item-10 fault returns 503 with exact 111-ticket custody and 20 original links pending", exactOriginalHeld(lastOriginalObservation,30,10,87,22) && one("SELECT COUNT(*) AS c FROM roster_effects WHERE run_id = ?",oldRun).c===20,r.body);
  // a cron slice is running when the newer export arrives: right after its first claim commits, the newer export is stored
  const newer = [...base, ...rosterOf(0, 15)]; // Mem0015..Mem0029 are no longer on the roster
  let nested = null, claimBeforeSupersession = null;
  AFTER_BATCH = async (sqls) => {
    if (nested || !sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q))) return;
    nested = "running";
    claimBeforeSupersession = one("SELECT * FROM roster_effects WHERE run_id = ? AND seq = 10", oldRun);
    const save = counters();
    nested = await invokeRoster('ingestRoster', env(), T - 300, newer, "addon");
    restoreCounters(save);
  };
  const observedSupersessionBefore=originalBoundarySnapshot();
  T += 60;
  const cronSlice = await quiet(() => invokeRoster('continueRosterEffects', env()));
  AFTER_BATCH = null;
  observeOriginalBoundary('supersession-after-original-component',observedSupersessionBefore,{oldRun,cronSlice,nested});
  check("the bounded original slice applied Mem0010 before supersession and stopped without attempting a second claim; no refusal is inferred", cronSlice?.run===oldRun&&cronSlice.applied===1&&cronSlice.skipped===0&&cronSlice.refused===false&&cronSlice.done===false&&cronSlice.failed===false&&cronSlice.noticePending===true&&JSON.stringify(cronSlice.promoted)===JSON.stringify([nm(10)])&&statusOf(10)==='member'&&claimBeforeSupersession?.done_at===T&&typeof claimBeforeSupersession.claim==='string',cronSlice);
  check("  links no longer on the newer roster were never promoted from the older run", [15, 16, 20, 29].every((i) => statusOf(i) === "verified" && auditCount("roster.member", nm(i)) === 0));
  check("  the newer export's own run promoted the rest still due (Mem0011..Mem0014), each once", [11, 12, 13, 14].every((i) => statusOf(i) === "member" && auditCount("roster.member", nm(i)) === 1) && auditCount("roster.member", nm(10)) === 1 && nested && nested.effects && nested.effects.applied === 4, nested && nested.effects);
  const retainedOldItems=all("SELECT * FROM roster_effects WHERE run_id = ? ORDER BY seq",oldRun);
  const retainedOldClaim=retainedOldItems.length===1?JSON.parse(retainedOldItems[0].claim):null;
  check("  supersession retains exactly the original completed notice claim, byte for byte, and removes all unclaimed old items",one("SELECT superseded_at FROM roster_effect_runs WHERE id = ?",oldRun).superseded_at===T&&latestRun().id===oldRun+1&&retainedOldItems.length===1&&JSON.stringify(retainedOldItems[0])===JSON.stringify(claimBeforeSupersession)&&retainedOldClaim?.p==='roster_cron_notice_v1'&&retainedOldClaim.run===oldRun&&retainedOldClaim.seq===10&&retainedOldClaim.subject===did(10)&&retainedOldClaim.createdAt===T&&retainedOldClaim.expiresAt===T+DAY&&retainedOldClaim.welcome.state==='pending'&&retainedOldClaim.log.state==='pending',retainedOldItems);

  console.log("\n== a newer snapshot still being written stops an older run's slice ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 30; i++) (await link(i)); db.exec("COMMIT");
  FAIL = (sql, p) => /^UPDATE characters SET status = 'member'/.test(sql) && p[4] === key(5);
  await ingestHttp([...base, ...rosterOf(0, 30)], T - 900);
  FAIL = null;
  let probe = null;
  AFTER_BATCH = async (sqls) => {
    if (probe || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q))) return;
    const save = counters();
    probe = await quiet(() => invokeRoster('continueRosterEffects', env()));
    restoreCounters(save);
  };
  const observedNewSnapshotBefore=originalBoundarySnapshot();
  T += 60;
  const originalNewerPacket=[...base,...rosterOf(0,30),...fillers(260).slice(200)],originalNewerExportedAt=T-300;
  const observedNewSnapshotResult=await quiet(() => invokeRoster('ingestRoster', env(), originalNewerExportedAt, originalNewerPacket, "addon"));
  AFTER_BATCH = null;
  observeOriginalBoundary('newer-snapshot-after-original-ingest',observedNewSnapshotBefore,{probe,result:observedNewSnapshotResult});
  check("between the newer snapshot's member batches the cron finds nothing to apply (the older run's snapshot is not the newest)", probe && probe.run === null && probe.applied === 0, probe);
  check("  the original newer export reaches exactly 21 of 30 once; its bounded run applies 16 and retains nine original pending rows",one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c===21&&auditCount('roster.member')===21&&puts().length===21&&NOTICE_USERS.length===21&&new Set(NOTICE_USERS).size===21&&Array.from({length:30},(_,i)=>i).every(i=>statusOf(i)===(i<21?'member':'verified')&&auditCount('roster.member',nm(i))===(i<21?1:0))&&JSON.stringify(observedNewSnapshotResult.effects)===JSON.stringify({run:2,derived:true,items:25,applied:16,skipped:0,pending:true,deferredIdentity:0,failed:false})&&exactOriginalPending(all('SELECT * FROM roster_effects ORDER BY run_id,seq'),2,21,30,5),observedNewSnapshotResult.effects);
  // Additional component requests are explicitly bounded and retain the same packet timestamp and clock.
  const newerContinuations=[],newerContinuationClock=T,NEWER_CONTINUATION_CAP=3;
  for(let i=0;i<NEWER_CONTINUATION_CAP&&latestRun().done_at===null;i++){
    const before=originalBoundarySnapshot();
    const result=await ingestDirect(originalNewerPacket,originalNewerExportedAt);
    newerContinuations.push(result);
    observeOriginalBoundary('additional-newer-packet-continuation',before,{iteration:i+1,cap:NEWER_CONTINUATION_CAP,exportedAt:originalNewerExportedAt,result});
  }
  check("  explicit same-packet continuation finishes within three additional component requests, each within both fixed SQL bounds, without duplicated effects",T===newerContinuationClock&&newerContinuations.length>0&&newerContinuations.length<=NEWER_CONTINUATION_CAP&&newerContinuations.every(s=>s.componentOnly===true&&s.statements<=budget.ROSTER_INGEST_STATEMENTS&&s.physicalStatements<=TARGET)&&latestRun().id===2&&latestRun().done_at===T&&one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c===30&&all('SELECT * FROM roster_effects').length===0&&auditCount('roster.member')===30&&puts().length===30&&NOTICE_USERS.length===30&&new Set(NOTICE_USERS).size===30&&Array.from({length:30},(_,i)=>i).every(i=>auditCount('roster.member',nm(i))===1),newerContinuations.map(s=>({logical:s.statements,physical:s.physicalStatements,effects:s.body.effects})));

  console.log("\n== an identical-fingerprint retry cannot derive from a partial snapshot ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 120; i++) (await link(i)); db.exec("COMMIT");
  const partialList = rosterOf(0, 120);
  const partialAt = T - 120;
  let partialRetry = null, partialState = null;
  AFTER_BATCH = async (sqls) => {
    if (partialRetry || !sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)) || sqls.some((q) => /SET complete = 1/.test(q))) return;
    partialRetry = "running";
    const save = counters();
    partialRetry = await ingestHttp(partialList, partialAt + 1, lean);
    partialState = { stored: one("SELECT COUNT(*) AS c FROM roster_members").c, runs: one("SELECT COUNT(*) AS c FROM roster_effect_runs").c, members: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c, exportedAt: one("SELECT exported_at FROM roster_snapshots ORDER BY id DESC LIMIT 1").exported_at };
    restoreCounters(save);
  };
  r = await ingestHttp(partialList, partialAt, lean);
  AFTER_BATCH = null;
  check("the concurrent identical export receives a retryable 500 before snapshot refresh or effects", partialRetry && partialRetry.status === 500 && partialState.stored < 120 && partialState.runs === 0 && partialState.members === 0 && partialState.exportedAt === partialAt, partialRetry, partialState);
  check("the original write can finish normally after that retry is refused", r.status === 200 && one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete === 1 && latestRun().derived_at !== null, r.body);

  console.log("\n== a legacy identical refresh proves its row count before it can create a run ==");
  fresh(); resetDiscord();
  const legacyList = rosterOf(0, 120), legacyAt = T - 120;
  await ingestHttp(legacyList, legacyAt, lean);
  const legacySid = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  (await run("DELETE FROM roster_effect_runs"));
  (await run("UPDATE roster_snapshots SET complete = NULL, trusted = NULL, first_received_at = ? WHERE id = ?", T - 300, legacySid));
  (await run("DELETE FROM roster_members WHERE snapshot_id = ? AND name_key = ?", legacySid, key(119)));
  (await link(0)); (await link(119, { status: "member", role: true }));
  resetDiscord(); HAS_ROLE.add(did(119));
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  check("119 stored rows of the legacy export's 120: refresh marks incomplete and returns retryable 500, without a run or any member effect", r.status === 500 && one("SELECT complete FROM roster_snapshots WHERE id = ?", legacySid).complete === 0 && !latestRun() && statusOf(0) === "verified" && statusOf(119) === "member" && HAS_ROLE.has(did(119)) && FETCHES.length === 0 && auditCount("roster.member") === 0 && NOTICE_USERS.length === 0, r);
  T += 100;
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  check("the retained identical packet stays retryable inside the original write grace; no run, timestamp refresh or effect", r.status === 500 && !latestRun() && one("SELECT exported_at FROM roster_snapshots WHERE id = ?", legacySid).exported_at === legacyAt + 1 && statusOf(0) === "verified" && FETCHES.length === 0, r);
  T += 201;
  r = await ingestHttp(legacyList, legacyAt + 1, lean);
  const repairedLegacy = one("SELECT * FROM roster_snapshots ORDER BY id DESC LIMIT 1");
  check("after the grace, that exact retained packet rebuilds a complete 120-row snapshot and applies the previously held promotion once", r.status === 200 && repairedLegacy.id > legacySid && repairedLegacy.complete === 1 && one("SELECT COUNT(*) AS c FROM roster_members WHERE snapshot_id = ?", repairedLegacy.id).c === 120 && statusOf(0) === "member" && statusOf(119) === "member" && auditCount("roster.member", nm(0)) === 1 && auditCount("roster.member", nm(119)) === 0 && auditCount("role.deferred", nm(0)) === 1 && puts().length === 0, r);

  fresh(); resetDiscord();
  await ingestHttp(legacyList, T - 120, lean);
  const fullLegacySid = one("SELECT MAX(id) AS id FROM roster_snapshots").id;
  (await run("DELETE FROM roster_effect_runs"));
  (await run("UPDATE roster_snapshots SET complete = NULL, trusted = NULL, first_received_at = NULL WHERE id = ?", fullLegacySid));
  (await link(0)); resetDiscord();
  r = await ingestHttp(legacyList, T - 120, lean);
  check("a valid legacy snapshot, including an exact timestamp retry, is stamped complete and creates its own derived run without rewriting member rows", r.status === 200 && r.body.unchanged === true && one("SELECT MAX(id) AS id FROM roster_snapshots").id === fullLegacySid && one("SELECT complete FROM roster_snapshots WHERE id = ?", fullLegacySid).complete === 1 && latestRun().snapshot_id === fullLegacySid && latestRun().derived_at !== null && statusOf(0) === "member" && auditCount("roster.member", nm(0)) === 1 && auditCount("role.deferred", nm(0)) === 1 && puts().length === 0, r);

  console.log("\n== invalid snapshots cannot supply an already-derived slice or an older-packet derivation ==");
  for (const invalid of ["unstamped", "unfinished", "missing row"]) {
    fresh(); resetDiscord(); (await link(0));
    const sid = (await seedSnapshot(rosterOf(0, 1), T - H));
    const rid = (await seedRun([["promote", 0]]));
    if (invalid === "missing row") (await run("DELETE FROM roster_members WHERE snapshot_id = ?", sid));
    else (await run("UPDATE roster_snapshots SET complete = ? WHERE id = ?", invalid === "unstamped" ? null : 0, sid));
    const slice = await quiet(() => invokeRoster('continueRosterEffects', env(lean)));
    check(`${invalid}: the cron finds no consumable run and leaves its pending claim, link and Discord untouched`, slice && slice.run === null && slice.applied === 0 && statusOf(0) === "verified" && one("SELECT done_at FROM roster_effects WHERE run_id = ?", rid).done_at === null && FETCHES.length === 0 && auditCount("roster.member") === 0, slice);
    (await run("UPDATE roster_effect_runs SET derived_at = NULL, created_at = ? WHERE id = ?", T - H, rid));
    r = await ingestHttp(rosterOf(0, 1), T - H - 1, lean);
    check(`${invalid}: an older packet cannot derive from that stored snapshot and remains retryable`, r.status === 500 && latestRun().derived_at === null && statusOf(0) === "verified" && FETCHES.length === 0 && auditCount("roster.member") === 0, r);
  }

  console.log("\n== a snapshot losing its proof between selection and claim refuses the transaction ==");
  for (const invalid of ["unfinished", "missing row"]) {
    fresh(); resetDiscord(); (await link(0));
    const sid = (await seedSnapshot(rosterOf(0, 1), T - H));
    const rid = (await seedRun([["promote", 0]]));
    let revoked = false;
    BEFORE_BATCH = async (sqls) => {
      if (revoked || !sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q))) return;
      revoked = true;
      if (invalid === "unfinished") (await run("UPDATE roster_snapshots SET complete = 0 WHERE id = ?", sid));
      else (await run("DELETE FROM roster_members WHERE snapshot_id = ?", sid));
    };
    const slice = await quiet(() => invokeRoster('continueRosterEffects', env(lean)));
    BEFORE_BATCH = null;
    check(`${invalid} after selection: the current-run predicate refuses the claim and every promotion effect`, revoked && slice && slice.refused === true && slice.applied === 0 && statusOf(0) === "verified" && one("SELECT done_at FROM roster_effects WHERE run_id = ?", rid).done_at === null && FETCHES.length === 0 && auditCount("roster.member") === 0, slice);
  }

  // ================= stamp, then effects =================
  console.log("\n== stamp, then effects ==");
  fresh(); resetDiscord();
  db.exec("BEGIN"); for (let i = 0; i < 5; i++) (await link(i)); db.exec("COMMIT");
  FAIL = (sql) => /^UPDATE roster_snapshots SET complete = 1, trusted = \?2/.test(sql);
  let threw = false;
  try { await quiet(() => invokeRoster('ingestRoster', env(), T - 600, rosterOf(0, 5), "addon")); } catch { threw = true; }
  FAIL = null;
  check("a refused stamp: the ingest throws for a retry, no snapshot, no run, no item, no link changed", threw && !one("SELECT 1 FROM roster_snapshots") && !one("SELECT 1 FROM roster_effect_runs") && !one("SELECT 1 FROM roster_effects") && [0, 1, 2, 3, 4].every((i) => statusOf(i) === "verified"));
  const order = [];
  let atStamp = null;
  AFTER_BATCH = async (sqls) => {
    const tag = sqls.some((q) => /SET complete = 1, trusted = \?2/.test(q)) ? "stamp" : sqls.some((q) => /SET derived_at = \?2/.test(q)) ? "derive" : sqls.some((q) => /^UPDATE roster_effects SET done_at = \?4, claim = \?3/.test(q)) ? "claim" : sqls.some((q) => /INSERT OR REPLACE INTO roster_members/.test(q)) ? "rows" : "other";
    order.push(tag);
    if (tag === "stamp" && !atStamp) atStamp = { run: latestRun(), members: one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c, items: one("SELECT COUNT(*) AS c FROM roster_effects").c, complete: one("SELECT complete FROM roster_snapshots ORDER BY id DESC LIMIT 1").complete };
  };
  r = await quiet(() => invokeRoster('ingestRoster', env(), T - 500, rosterOf(0, 5), "addon"));
  AFTER_BATCH = null;
  check("the run is made in the stamp's own batch: at that commit the snapshot is complete, the run exists underived, nothing is applied yet", atStamp && atStamp.complete === 1 && atStamp.run && atStamp.run.derived_at === null && atStamp.members === 0 && atStamp.items === 0, atStamp);
  check(`  then the derivation, then the claims: ${order.join(" > ")}`, order.indexOf("stamp") >= 0 && order.indexOf("stamp") < order.indexOf("derive") && order.indexOf("derive") < order.indexOf("claim") && order.lastIndexOf("rows") < order.indexOf("stamp"), order);
  check("  and a small roster is applied whole by its own export, as before: promoted, granted, welcomed, the run done", r.promoted.length === 5 && puts().length === 5 && new Set(NOTICE_USERS).size === 5 && r.effects.pending === false && latestRun().done_at !== null && one("SELECT COUNT(*) AS c FROM roster_effects").c === 0, r.effects);

  console.log("\n== a stop between the stamp and the derivation loses nothing ==");
  const stopScenario = async () => {
    fresh(); resetDiscord();
    db.exec("BEGIN");
    (await link(0, { status: "member", role: true })); // A, a member
    (await link(1)); // B, just verified
    (await link(2, { status: "member", role: true })); // X, a member who leaves
    (await seedSnapshot([...fillers(100), ...rosterOf(0, 3)], T - 2 * H)); // S0: A, B, X (its diff applied long ago)
    db.exec("COMMIT");
  };
  await stopScenario();
  const s1 = [...fillers(100), ...rosterOf(0, 2)]; // S1: X is absent for the first time
  const s1At = T - 600;
  FAIL = (sql) => /SET derived_at = \?2/.test(sql);
  r = await ingestHttp(s1, s1At);
  FAIL = null;
  check("the original derivation write fault returns 503 with exactly 11 custody rows (unknown fetch and one unknown D1); the stamped run remains underived with no effects",r.status===503&&JSON.stringify(r.body)===JSON.stringify({error:'original_serving_held'})&&originalTicketTree(lastOriginalObservation,'unknown',{'fetch:unknown':1,'d1:unknown':1,'d1:settled':9})&&lastOriginalObservation.failedSQLWitness.sql.startsWith('UPDATE roster_effect_runs SET derived_at = ?2')&&JSON.stringify(lastOriginalObservation.failedSQLWitness.params)===JSON.stringify([1,T])&&latestRun().id===1&&latestRun().snapshot_id===2&&latestRun().prev_snapshot_id===1&&latestRun().derived_at===null&&latestRun().items===null&&latestRun().done_at===null&&all('SELECT * FROM roster_effects').length===0&&statusOf(0)==='member'&&statusOf(2)==='member'&&statusOf(1)==='verified'&&auditCount('roster.member')===0&&puts().length===0,r.body);
  let retainedPacket = { members: s1, exportedAt: s1At };
  r = await ingestHttp(retainedPacket.members, retainedPacket.exportedAt);
  if (r.status >= 200 && r.status < 300) retainedPacket = null; // the watcher's acknowledgement rule
  check("  the retry at once receives 500, so the watcher retains its packet while the run is underived", r.status === 500 && retainedPacket !== null && latestRun().derived_at === null, r.body);
  const underivedId = latestRun().id;
  await cronTick();
  check("  cron leaves the underived run untouched; the retained packet is its guaranteed continuation", retainedPacket !== null && latestRun().id === underivedId && latestRun().derived_at === null && statusOf(1) === "verified");
  const identicalEarly = await ingestHttp(s1, s1At + 1);
  check("  a newer identical export also remains retryable inside the derivation grace", identicalEarly.status === 500 && latestRun().id === underivedId && latestRun().derived_at === null, identicalEarly.body);
  T += 601; // past SNAPSHOT_WRITE_GRACE_S since the run was made
  r = await ingestHttp(retainedPacket.members, retainedPacket.exportedAt);
  if (r.status >= 200 && r.status < 300) retainedPacket = null;
  check("  the retry after the grace derives it: X's first absence is armed against S0, B promoted", r.status === 200 && r.body.skipped === true && r.body.effects.derived === true && statusOf(2) === "left_pending" && auditCount("roster.left_pending", nm(2)) === 1 && statusOf(1) === "member", r.body.effects);
  check("  only successful derivation acknowledgement clears the retained packet", retainedPacket === null);
  T += 60;
  r = await ingestHttp([...fillers(100), ...rosterOf(0, 2), { name: "Newcomer", rank: "Member", rankIndex: 4, guid: "Player-3-1" }], T - 60);
  check("  and the next export confirms the departure: X loses the character and the role", statusOf(2) === "left" && !HAS_ROLE.has(did(2)) && r.body.stripped.includes(nm(2)), r.body);

  await stopScenario();
  FAIL = (sql) => /SET derived_at = \?2/.test(sql);
  await ingestHttp(s1, T - 600);
  FAIL = null;
  const stalled = latestRun().id;
  r = await ingestHttp([...s1, { name: "Newcomer", rank: "Member", rankIndex: 4, guid: "Player-3-1" }], T - 300); // a newer export, inside the grace
  check("a newer export after such a stop judges departures against the last derived snapshot (S0), so X is armed (the old code compared it with S1 and armed nobody)", r.status === 200 && statusOf(2) === "left_pending" && statusOf(1) === "member" && one("SELECT prev_snapshot_id FROM roster_effect_runs ORDER BY id DESC LIMIT 1").prev_snapshot_id === 1 && one("SELECT superseded_at FROM roster_effect_runs WHERE id = ?", stalled).superseded_at !== null, r.body);

  // ================= each kind's worst case, one item apart =================
  console.log("\n== original audit-fault custody, then separate measured component costs (not universal worst cases) ==");
  const holdFor = async (d) => (await run("INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, nonce, state, decided_by, decided_at) VALUES (?, 'Old', 'New', ?, 'n', 'reapply', 'admin', ?)", d, one("SELECT name_key FROM characters WHERE discord_id = ?", d).name_key, T));
  /** The skip path's slice over `k` seeded items of one kind; the statements of that invocation (the ingest's own share). */
  async function sliceCost(kind, k, { over = {}, prepare = () => {}, fail = null } = {}) {
    fresh(); resetDiscord();
    db.exec("BEGIN");
    for (let i = 0; i < k; i++) {
      if (kind === "depart") (await link(i, { status: "left_pending", role: true }));
      else if (kind === "note") (await run("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT DO NOTHING", did(i)));
      else (await link(i));
    }
    (await seedSnapshot(rosterOf(0, kind === "depart" ? 0 : k), T - H));
    (await seedRun(Array.from({ length: k }, (_, i) => [kind, i])));
    db.exec("COMMIT");
    await prepare();
    FAIL = fail;
    resetCount();
    let out;
    const observedCostBefore=originalBoundarySnapshot();
    try { out = await quiet(() => invokeRoster('ingestRoster', env(over), T - 2 * H, [], "addon")); }
    catch(error){observeOriginalBoundary('original-slice-cost-exception',observedCostBefore,{kind,k,error:{name:error?.name,constructor:error?.constructor?.name,message:error?.message},originalComponentRecorded:originalComponentFailures.has(error),originalComponentFailure:originalComponentFailures.get(error)??null,rethrowsSameError:true});throw error;}
    finally { FAIL = null; ON_PUT = null; }
    return { statements: COUNT,physicalStatements:PHYSICAL, out };
  }
  const costly = { over: { SET_NICKNAME: "true", CHANNEL_NOTICES: "" }, prepare: () => { FAIL_NICK = true; ON_PUT = async (d) => (await holdFor(d)); }, fail: (sql, p) => /^INSERT INTO audit/.test(sql) && ["role.revoked_after_hold", "role.revoke_pending"].includes(p[2]) };
  let originalCostError=null;
  try { await sliceCost("promote",2,costly); } catch(error) { originalCostError=error; }
  check("the unchanged original two-item audit-fault scenario holds with its exact 39-row custody tree and the same exception object",exactOriginalCostFault(originalCostError,lastOriginalObservation),originalCostError?.message);
  // A new fixture per sliceCost below; no retry or clearing of the held original database.
  const measuredWithoutAuditFault={over:costly.over,prepare:costly.prepare};
  let a=await sliceCost("promote",2,measuredWithoutAuditFault),b=await sliceCost("promote",3,measuredWithoutAuditFault);
  check("separate fault-free promotion samples cost 30/43 logical and 88/127 physical (delta 13/39), within their original bounds",a.statements===30&&b.statements===43&&a.physicalStatements===88&&b.physicalStatements===127&&b.statements-a.statements<=fx.EFFECT_WORST.promote&&a.out.effects.applied===2&&b.out.effects.applied===3&&a.out.effects.pending===false&&b.out.effects.pending===false&&b.physicalStatements<=TARGET,a,b);
  a=await sliceCost("note",2,measuredWithoutAuditFault);b=await sliceCost("note",3,measuredWithoutAuditFault);
  check("separate fault-free note samples cost 34/49 logical and 92/133 physical (delta 15/41), within their original bounds",a.statements===34&&b.statements===49&&a.physicalStatements===92&&b.physicalStatements===133&&b.statements-a.statements<=fx.EFFECT_WORST.note&&a.out.effects.applied===2&&b.out.effects.applied===3&&one("SELECT COUNT(*) AS c FROM characters WHERE source='note' AND status='member'").c===3&&b.physicalStatements<=TARGET,a,b);
  const deferredCase={over:{ROLE_CALL_BUDGET:"4",SET_NICKNAME:"true",CHANNEL_NOTICES:""},prepare:()=>{FAIL_NICK=true;}};
  a=await sliceCost("promote",2,deferredCase);b=await sliceCost("promote",3,deferredCase);
  check("separate deferred-grant samples cost 23/32 logical and 77/108 physical (delta 9/31), within their original bounds",a.statements===23&&b.statements===32&&a.physicalStatements===77&&b.physicalStatements===108&&b.statements-a.statements<=fx.EFFECT_DEFERRED_WORST.promote-1&&b.out.effects.applied===3&&auditCount('role.deferred')===3&&auditCount('role.budget_exhausted')===1&&b.physicalStatements<=TARGET,a,b);
  const departCase={prepare:()=>{FAIL_REMOVE=true;FAIL_MEMBER=true;}};
  a=await sliceCost("depart",2,departCase);b=await sliceCost("depart",3,departCase);
  check("separate provider-refused departure samples cost 16/22 logical and 56/79 physical (delta 6/23), within their original bounds",a.statements===16&&b.statements===22&&a.physicalStatements===56&&b.physicalStatements===79&&b.statements-a.statements<=fx.EFFECT_WORST.depart&&b.out.effects.applied===3&&[0,1,2].every(i=>statusOf(i)==='left')&&b.physicalStatements<=TARGET,a,b);
  const capped={prepare:async()=>{await run("INSERT INTO audit (ts, actor, action, details) VALUES (?, 'system', 'notice.posted', '{}')",T);},over:{NOTICE_RATE_CAP:"1"}};
  a=await sliceCost("promote",20,capped);b=await sliceCost("promote",21,capped);
  check("both capped-welcome samples stop at exactly 18 applied, 185 logical and 507 physical; the 21st item and its post are not claimed tested",a.statements===185&&b.statements===185&&a.physicalStatements===507&&b.physicalStatements===507&&a.out.effects.applied===18&&b.out.effects.applied===18&&a.out.effects.pending===true&&b.out.effects.pending===true&&auditCount('notice.suppressed')===18&&auditCount('notice.capped')===1&&exactOriginalPending(all('SELECT * FROM roster_effects ORDER BY seq'),1,18,21)&&b.statements<=budget.ROSTER_INGEST_STATEMENTS&&b.physicalStatements<=TARGET,a,b);

  // ================= /olympus-admin sync =================
  }
  async function manualSync() {
  console.log("\n== /olympus-admin sync: a 1,000-member backlog over repeated syncs, each within its allowance ==");
  fresh(); resetDiscord();
  db.exec("BEGIN");
  for (let i = 0; i < N; i++) (await link(i));
  (await seedSnapshot(rosterOf(0, N), T - H));
  db.exec("COMMIT");
  const syncs = [];
  for (let k = 0; k < 60; k++) {
    T += 60;
    const s = await syncHttp(lean);
    syncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  emitOriginalObservation('manual-sync-original-cap-boundary',()=>({cap:60,invocationCount:syncs.length,invocations:syncs,completeLastContent:syncs.at(-1)?.content,after:originalBoundarySnapshot()}));

  const syncsBoundary60=lastOriginalObservation;
  check("manual-sync: preserved original 60-call boundary remains incomplete at 840/1000", syncs.length===60&&syncsBoundary60.after.state.memberCount===840&&/Not applied yet/.test(syncs.at(-1).content));
  const syncsContinuationBefore=originalBoundarySnapshot();
  while (syncs.length<100 && /Not applied yet/.test(syncs.at(-1).content) && one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c<N) {
    T += 60;
    syncs.push(await syncHttp(lean));
  }
  observeOriginalBoundary('manual-sync-bounded-continuation', syncsContinuationBefore, {originalCap:60,totalCallCap:100,totalCalls:syncs.length,additionalCalls:syncs.length-60,invocations:syncs.slice(60),lastContent:syncs.at(-1).content});
  check("manual-sync: continuation keeps prior settled custody byte for byte and stops on completion within 100 total calls", lastOriginalObservation.priorJournalUnchanged&&syncs.length<=100&&syncs.length>60&&one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c===N&&!/Not applied yet/.test(syncs.at(-1).content)&&syncs.slice(0,-1).every(s=>/Not applied yet/.test(s.content))&&lastOriginalObservation.newTickets.every(t=>t.state==='settled')&&syncs.every(s=>s.statements<=budget.ROSTER_SYNC_STATEMENTS+2&&s.physicalStatements<=TARGET));

  const deferredLines = syncs.filter((s) => /Not applied yet \(\d+\)/.test(s.content)).length;
  console.log(`    ${syncs.length} syncs; the costliest ${Math.max(...syncs.map((s) => s.statements))} statement attempts (allowance ${budget.ROSTER_SYNC_STATEMENTS} + the vouch and its audit)`);
  check(`the first sync says how many are not applied yet, and every sync stays within its allowance`, /Not applied yet \(\d+\)/.test(syncs[0].content) && syncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2), syncs[0].content.slice(0, 300), syncs.map((s) => s.statements));
  check(`  repeated syncs finish: all ${N} members, each promoted once, the last sync with nothing left (${deferredLines} syncs said "not applied yet")`, one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'roster.member' GROUP BY subject").every((x) => x.c === 1) && auditCount("roster.member") === N && !/Not applied yet/.test(syncs.at(-1).content) && JSON.parse(one("SELECT details FROM audit WHERE action = 'admin.sync' ORDER BY id LIMIT 1").details).deferred > 0, syncs.at(-1).content.slice(0, 200));

  }
  async function manualNoticeDebt() {
  console.log("\n== manual sync reserves its long buffered notice debt too ==");
  fresh(); resetDiscord(); FAIL_NICK = true;
  db.exec("BEGIN"); for (let i = 0; i < N; i++) (await link(i)); (await seedSnapshot(rosterOf(0, N), T - H)); db.exec("COMMIT");
  const debtSyncs = [];
  for (let k = 0; k < 60; k++) {
    T += 60;
    const s = await syncHttp(debtEnv);
    debtSyncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  emitOriginalObservation('manual-notice-debt-original-cap-boundary',()=>({cap:60,invocationCount:debtSyncs.length,invocations:debtSyncs,completeLastContent:debtSyncs.at(-1)?.content,after:originalBoundarySnapshot()}));

  const debtSyncsBoundary60=lastOriginalObservation;
  check("manual-notice-debt: preserved original 60-call boundary remains incomplete at 660/1000", debtSyncs.length===60&&debtSyncsBoundary60.after.state.memberCount===660&&/Not applied yet/.test(debtSyncs.at(-1).content));
  const debtSyncsContinuationBefore=originalBoundarySnapshot();
  while (debtSyncs.length<100 && /Not applied yet/.test(debtSyncs.at(-1).content) && one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c<N) {
    T += 60;
    debtSyncs.push(await syncHttp(debtEnv));
  }
  observeOriginalBoundary('manual-notice-debt-bounded-continuation', debtSyncsContinuationBefore, {originalCap:60,totalCallCap:100,totalCalls:debtSyncs.length,additionalCalls:debtSyncs.length-60,invocations:debtSyncs.slice(60),lastContent:debtSyncs.at(-1).content});
  check("manual-notice-debt: continuation keeps prior settled custody byte for byte and stops on completion within 100 total calls", lastOriginalObservation.priorJournalUnchanged&&debtSyncs.length<=100&&debtSyncs.length>60&&one("SELECT COUNT(*) AS c FROM characters WHERE status='member'").c===N&&!/Not applied yet/.test(debtSyncs.at(-1).content)&&debtSyncs.slice(0,-1).every(s=>/Not applied yet/.test(s.content))&&lastOriginalObservation.newTickets.every(t=>t.state==='settled')&&debtSyncs.every(s=>s.statements<=budget.ROSTER_SYNC_STATEMENTS+2&&s.physicalStatements<=TARGET));

  check("every manual sync, including its notice audits, stays within its allowance plus the vouch and audit", debtSyncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2), debtSyncs.map((s) => s.statements));
  check("repeated manual syncs finish without duplicated welcomes or promotions", one("SELECT COUNT(*) AS c FROM characters WHERE status = 'member'").c === N && auditCount("roster.member") === N && auditCount("notice.no_channel") === N && all("SELECT subject, COUNT(*) AS c FROM audit WHERE action = 'notice.no_channel' GROUP BY subject").every((x) => x.c === 1));
  FAIL_NICK = false;

  }
  async function identity() {
  let r;
  // ================= the identity rules admitted =================
  console.log("\n== the identity rules: a realm move of 300 pinned members, sighted in bulk and released over repeated syncs ==");
  fresh(); resetDiscord();
  const M = 300;
  db.exec("BEGIN");
  for (let i = 0; i < M; i++) (await link(i, { status: "member", role: true }));
  (await seedSnapshot(rosterOf(0, M), T - H));
  db.exec("COMMIT");
  const moved = rosterOf(0, M).map((m, i) => ({ ...m, guid: "Player-9-" + String(i).padStart(8, "0") })); // every character gets a new ID
  r = await ingestHttp(moved, T - 600);
  const sightRows = all("SELECT subject, details FROM audit WHERE action = 'roster.namesake_seen'");
  check(`the first export with new IDs: all ${M} held, ${sightRows.length} namesake sightings in the old shape, within budget (${r.statements} attempts)`, r.status === 200 && r.body.held === M && sightRows.length === M && r.statements <= TARGET && JSON.parse(sightRows[0].details).rosterGuid.startsWith("Player-9-") && "linkedGuid" in JSON.parse(sightRows[0].details) && "discordId" in JSON.parse(sightRows[0].details), r.statements, r.body.held);
  T += 60;
  r = await ingestHttp(moved, T - 300);
  check("  the agreeing second export: more releases than the cap, all held for a person, reported once, within budget", r.status === 200 && r.body.held === M && r.body.released.length === 0 && auditCount("roster.identity_held") === 1 && r.statements <= TARGET);
  const releaseSyncs = [];
  for (let k = 0; k < 20; k++) {
    T += 60;
    const s = await syncHttp();
    releaseSyncs.push(s);
    if (!/Not applied yet/.test(s.content)) break;
  }
  check(`the officer's syncs release them, each sync admitted within its allowance (${releaseSyncs.length} syncs, at most ${Math.max(...releaseSyncs.map((s) => s.statements))} attempts)`, releaseSyncs.length > 1 && releaseSyncs.every((s) => s.statements <= budget.ROSTER_SYNC_STATEMENTS + 2) && one("SELECT COUNT(*) AS c FROM characters WHERE status = 'unbound'").c === M && auditCount("roster.namesake_released") === M, releaseSyncs.map((s) => s.statements), one("SELECT COUNT(*) AS c FROM characters WHERE status = 'unbound'").c);

  // ================= identity transactions: races occur BEFORE the atomic batch, not after it =================
  console.log("\n== an older export cannot rename or release a newer binding ==");
  const queue = async (i) => (await run("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES (?, ?, ?, 'queued', ?)", key(i), nm(i), did(i), T - 600));
  const boundMap = () => new Map(all("SELECT c.name_key,c.name,c.discord_id,c.status,c.guid,c.bound_at,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision FROM characters c LEFT JOIN privacy_subjects s ON s.subject_id=c.discord_id WHERE c.status IN ('verified','queued','member','left','left_pending')").map((c) => [c.name_key, c]));
  const identityHook = async (predicate, action) => {
    let fired = false;
    BEFORE_BATCH = async (sqls) => {
      if (fired || !sqls.some(predicate)) return;
      fired = true;
      const save = counters();
      await action();
      restoreCounters(save);
    };
    return () => fired;
  };
  const isRenameBatch = (q) => /^SELECT 1 AS valid FROM characters c/.test(q);
  const isReleaseBatch = (q) => /^UPDATE invite_queue SET status = 'cancelled'/.test(q) && /c\.bound_at = \?4/.test(q);
  const identityBase = fillers(100);
  fresh(); resetDiscord();
  (await link(0)); (await link(99, { status: "unbound" })); (await queue(0));
  (await seedSnapshot([...identityBase, ...rosterOf(0, 1)], T - H));
  let newerIdentity = null;
  const renameRace = await identityHook(isRenameBatch, async () => {
    newerIdentity = await invokeRoster('ingestRoster', env(lean), T - 120, [...identityBase, ...rosterOf(0, 1)], "addon");
  });
  r = await ingestHttp([...identityBase, { ...rosterOf(0, 1)[0], name: nm(99) }], T - 300, lean);
  BEFORE_BATCH = null;
  check("a newer real export arriving just before an old rename leaves the current GUID binding under its correct name", renameRace() && newerIdentity && r.status === 200 && statusOf(0) === "member" && one("SELECT discord_id, guid FROM characters WHERE name_key = ?", key(0)).guid === guid(0) && auditCount("roster.renamed") === 0 && auditCount("roster.rename_blocked") === 0, r.body);
  check("the refused old rename neither archives the target's history nor moves the current invite", statusOf(99) === "unbound" && !one("SELECT 1 FROM characters WHERE name_key LIKE ?", key(99) + "~%") && one("SELECT name_key, status FROM invite_queue WHERE discord_id = ?", did(0)).name_key === key(0) && one("SELECT status FROM invite_queue WHERE discord_id = ?", did(0)).status === "joined");

  fresh(); resetDiscord();
  (await link(0, { status: "member", role: true })); (await queue(0));
  const namesake = { ...rosterOf(0, 1)[0], guid: "Player-9-00000000" };
  (await seedSnapshot([...identityBase, namesake], T - H)); // two agreeing exports would ordinarily release the old GUID
  const releaseRace = await identityHook(isReleaseBatch, async () => {
    newerIdentity = await invokeRoster('ingestRoster', env(lean), T - 120, [...identityBase, ...rosterOf(0, 1)], "addon");
  });
  r = await ingestHttp([...identityBase, namesake], T - 300, lean);
  BEFORE_BATCH = null;
  check("a newer real export before a namesake release preserves the unchanged correct binding and its role", releaseRace() && r.status === 200 && statusOf(0) === "member" && one("SELECT guid FROM characters WHERE name_key = ?", key(0)).guid === guid(0) && HAS_ROLE.has(did(0)) && auditCount("roster.namesake_released") === 0 && !FETCHES.some((f) => f.startsWith("DELETE ")), r.body);
  check("the refused old release cannot cancel the invite or write a departure audit", one("SELECT status FROM invite_queue WHERE discord_id = ?", did(0)).status === "queued" && auditCount("roster.left") === 0);

  console.log("\n== the same snapshot's invalid proof, completed or superseded run also fences identity mutations ==");
  for (const boundary of ["new run", "derived run", "unfinished snapshot", "missing member row"]) {
    fresh(); resetDiscord(); (await link(0)); (await link(99, { status: "unbound" })); (await queue(0));
    const sid = (await seedSnapshot([{ ...rosterOf(0, 1)[0], name: nm(99) }], T - H));
    const rid = Number((await run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at) VALUES (?, ?, 1, ?)", sid, sid, T)).lastInsertRowid);
    const bindings = boundMap();
    const fired = await identityHook(isRenameBatch, async () => {
      if (boundary === "new run") (await run("INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at) VALUES (?, ?, 1, ?)", sid, sid, T));
      else if (boundary === "derived run") (await run("UPDATE roster_effect_runs SET derived_at = ? WHERE id = ?", T, rid));
      else if (boundary === "unfinished snapshot") (await run("UPDATE roster_snapshots SET complete = 0 WHERE id = ?", sid));
      else (await run("DELETE FROM roster_members WHERE snapshot_id = ?", sid));
    });
    const ident = await invokeRoster('reconcileIdentities', env(), [{ name: nm(99), guid: guid(0) }], bindings, { notices: { items: [] }, fence: { snapshotId: sid, runId: rid } });
    BEFORE_BATCH = null;
    check(`${boundary} in the same snapshot refuses the older identity transaction in full`, fired() && ident.renamed.length === 0 && ident.held.has(key(0)) && statusOf(0) === "verified" && statusOf(99) === "unbound" && one("SELECT name_key FROM invite_queue").name_key === key(0) && auditCount("roster.renamed") === 0);
  }

  console.log("\n== manual sync keeps its explicit full-row legacy or stuck snapshot override ==");
  for (const complete of [null, 0]) {
    fresh(); resetDiscord(); (await link(0)); (await link(99, { status: "unbound" })); (await queue(0));
    const sid = (await seedSnapshot([{ ...rosterOf(0, 1)[0], name: nm(99) }], T - H));
    (await run("UPDATE roster_snapshots SET complete = ?, first_received_at = ? WHERE id = ?", complete, T - H, sid));
    const sync = await syncHttp(lean);
    check(`manual sync of a full-row ${complete === null ? "legacy" : "stuck"} snapshot can rename the pinned character and move its queue, then vouch for the snapshot`, sync.content.includes("Renamed, link kept (1)") && one("SELECT discord_id, guid FROM characters WHERE name_key = ?", key(99)).discord_id === did(0) && one("SELECT guid FROM characters WHERE name_key = ?", key(99)).guid === guid(0) && one("SELECT name_key FROM invite_queue").name_key === key(99) && auditCount("roster.renamed") === 1 && one("SELECT complete FROM roster_snapshots WHERE id = ?", sid).complete === 1, sync);
  }

  console.log("\n== fresh ownership, GUID, binding time or status refuses both stale identity operations ==");
  for (const change of ["owner", "guid", "bound_at", "status"]) {
    for (const operation of ["rename", "release"]) {
      fresh(); resetDiscord(); (await link(0, { status: "member", role: true })); (await link(99, { status: "unbound" })); (await queue(0));
      (await run("INSERT INTO members (discord_id) VALUES (?)", did(777)));
      const sid = (await seedSnapshot(operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], T - H));
      const bindings = boundMap();
      const fired = await identityHook(operation === "rename" ? isRenameBatch : isReleaseBatch, async () => {
        if (change === "owner") (await run("UPDATE characters SET discord_id = ? WHERE name_key = ?", did(777), key(0)));
        else if (change === "guid") (await run("UPDATE characters SET guid = ? WHERE name_key = ?", guid(777), key(0)));
        else if (change === "bound_at") (await run("UPDATE characters SET bound_at = ? WHERE name_key = ?", T, key(0)));
        else (await run("UPDATE characters SET status = 'verified' WHERE name_key = ?", key(0)));
      });
      const before = one("SELECT * FROM characters WHERE name_key = ?", key(0));
      const ident = await invokeRoster('reconcileIdentities', env(), operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], bindings, { notices: { items: [] }, fence: { snapshotId: sid } });
      BEFORE_BATCH = null;
      const current = one("SELECT * FROM characters WHERE name_key = ?", key(0));
      const expected = { ...before, [change === "owner" ? "discord_id" : change]: change === "owner" ? did(777) : change === "guid" ? guid(777) : change === "bound_at" ? T : "verified" };
      check(`${operation}: a changed ${change} leaves the new binding, queue, target history and Discord role untouched`, fired() && JSON.stringify(current) === JSON.stringify(expected) && statusOf(99) === "unbound" && one("SELECT name_key, status FROM invite_queue").name_key === key(0) && one("SELECT status FROM invite_queue").status === "queued" && ident.held.has(key(0)) && ident.renamed.length === 0 && ident.released.length === 0 && auditCount("roster.renamed") === 0 && auditCount("roster.namesake_released") === 0 && !FETCHES.some((f) => f.startsWith("DELETE ")), current, expected);
    }
  }

  console.log("\n== an identity batch fault rolls back its queue and history changes too ==");
  for (const operation of ["rename", "release"]) {
    fresh(); resetDiscord(); (await link(0, { status: "member", role: true })); (await link(99, { status: "unbound" })); (await queue(0));
    const sid = (await seedSnapshot(operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], T - H));
    const bindings = boundMap();
    FAIL = (sql) => operation === "rename" ? /^UPDATE characters AS c SET name_key/.test(sql) : /^UPDATE characters AS c SET status = 'unbound'/.test(sql);
    let stopped = false;
    try { await invokeRoster('reconcileIdentities', env(), operation === "rename" ? [{ name: nm(99), guid: guid(0) }] : [namesake], bindings, { notices: { items: [] }, fence: { snapshotId: sid } }); } catch { stopped = true; }
    FAIL = null;
    check(`${operation}: refused final SQL restores the source, queue and any archived target`, stopped && statusOf(0) === "member" && statusOf(99) === "unbound" && one("SELECT name_key, status FROM invite_queue").name_key === key(0) && one("SELECT status FROM invite_queue").status === "queued" && !one("SELECT 1 FROM characters WHERE name_key LIKE ?", key(99) + "~%") && HAS_ROLE.has(did(0)) && !FETCHES.some((f) => f.startsWith("DELETE ")));
  }

  }
  const cases = [
    ['constants-full', constantsFull], ['notice-debt', noticeDebt],
    ['faults-and-fences', faultsAndFences], ['manual-sync', manualSync],
    ['manual-notice-debt', manualNoticeDebt], ['identity', identity],
  ];
  // Actual group-entry clocks from successful original hosted job117792354021.
  // Only an isolated child restores its recorded entry; the ordinary full entry
  // still accumulates every original T update, and refuses an unexpected phase drift.
  let selectedEntryState = null;
  for (const [group, work] of cases) if (selectedRosterGroup === undefined || selectedRosterGroup === group) {
    const recorded = CI_ROSTER_GROUPS.find(item => item.id === group);
    if (selectedRosterGroup !== undefined) {
      if (db !== undefined || doDb !== undefined || installed || readyPromise !== null) throw Error('CI roster child fixture was already initialized');
      T = recorded.entryClock;
      // The original manual groups issue72 then91 synthetic interactions. The
      // fault observer is enabled by the original fault group and stays enabled.
      iid = recorded.entryInteractionSequence;
      observeOriginalFaultHTTP = recorded.entryFaultObservation;
      selectedEntryState = { clock: T, interactionSequence: iid, faultObservation: observeOriginalFaultHTTP };
    }
    if (T !== recorded.entryClock) throw Error(`roster fixture entry clock drift: ${group} ${T}/${recorded.entryClock}`);
    if (iid !== recorded.entryInteractionSequence || observeOriginalFaultHTTP !== recorded.entryFaultObservation) throw Error(`roster fixture entry state drift: ${group}`);
    console.log('ROSTER_GROUP_ENTRY ' + JSON.stringify({ group, clock: T, interactionSequence: iid, faultObservation: observeOriginalFaultHTTP, isolated: selectedRosterGroup !== undefined }));
    await work();
  }
  const expectedChecks = selectedRosterGroup === undefined ? 100 : CI_ROSTER_GROUPS.find(group => group.id === selectedRosterGroup).expectedChecks;
  if (n !== expectedChecks) throw Error(`roster fixture coverage differs: ${n}/${expectedChecks}`);
  db?.close();doDb?.close();
  globalThis.Date = RealDate;
  globalThis.setTimeout = realSetTimeout;
  if (selectedRosterGroup !== undefined) require('../scripts/ci-case-pool.cjs').writeCaseResult({ group: selectedRosterGroup, ok, n, payload: { entryState: selectedEntryState, exitClock: T, exitInteractionSequence: iid } });
  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

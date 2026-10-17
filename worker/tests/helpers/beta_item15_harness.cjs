// Item 15 (17 Oct 2026) shared fixture for tests/beta_item15_central_fence_test.cjs (regression suite, part of test:all) and
// tests/beta_item15_absent_differential_receipt.cjs (one-off receipt against the pinned 76e7e3c sources, not in test:all).
// Actual TypeScript source transpiled into separate module graphs; SQLite; only Discord is simulated. Two database shapes:
// a plain D1 stub over the full schema for direct central calls, and the current entry epoch with the genuine privacy write
// admission database (tests/helpers/privacy129_fixture.cjs) for postEvents, ingestRoster, continueRosterEffects and the
// attended retirement route. These cases issue no seal or receipt and authorize no drain, activation or role reuse.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),nodeCrypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const entry=require('./privacy129_fixture.cjs');
globalThis.crypto=nodeCrypto.webcrypto;
const root=path.join(__dirname,'..','..'),realNow=Date.now,realFetch=globalThis.fetch;
// The production origin captures fetch at import: keep one stable descriptor and switch the fixture behind it.
let fixtureFetch=async()=>{throw Error('provider calls forbidden before fixture setup');};
globalThis.fetch=(...args)=>fixtureFetch(...args);
const clockState={now:1792688400-1000};Date.now=()=>clockState.now*1000;

// ---------- module graphs ----------
const transpiled=new Map();
function makeLoader(overrides={},tag='current'){const cache={};const load=name=>{
 if(name==='node:async_hooks'||name==='./node:async_hooks')return require('node:async_hooks');
 name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const pinned=Object.hasOwn(overrides,name),key=(pinned?tag+':':'current:')+name;
 let js=transpiled.get(key);
 if(js===undefined){const source=pinned?overrides[name]:fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
  js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;transpiled.set(key,js);}
 new Function('module','exports','require',js)(m,m.exports,p=>load(p));return m.exports;};return load;}
function modules(load){return Object.freeze({load,get inter(){return load('interactions');},get roles(){return load('roles');},get rs(){return load('role-settlements');},
 get roster(){return load('roster');},get policy(){return load('beta-reset-policy');},get ingest(){return load('ingest');},get admission(){return load('privacy-write-admission');},
 get route(){return load('membership-retirement-route');},get api(){return load('site-api');}});}
const NEW=modules(makeLoader({},'current'));
const SCHEMA=[fs.readFileSync(path.join(root,'schema.sql'),'utf8'),...NEW.load('privacy-serving-schema').PRIVACY_SERVING_SCHEMA,...NEW.load('qr-phase1-schema').QR_PHASE1_DDL];

// ---------- fixture constants ----------
const P=NEW.policy,GUILD=P.BETA_RESET_GUILD_ID,TWELVE=P.BETA_RESET_ROLE_IDS,MODE='BETA_RESET_DISPATCH_SEAL_MODE',HELD='beta_dispatch_mode_held';
assert.equal(clockState.now,P.BETA_RESET_CUTOFF-1000);
const OTHER_GUILD='700000000000000099',SUBJECT='400000000000000002',BOT='400000000000000003',BOT_ROLE='400000000000000006',STAFF='400000000000000009';
const FRESH='700000000000000088',FRESH2='700000000000000087',BLOCK='700000000000000077';
const LEADER='600000000000000001',OFFICER='600000000000000002',RAID='600000000000000003',MOD='600000000000000005';
const G='b'.repeat(32),STAFF_G='a'.repeat(32),GUID='Player-1234-00000002',PARENT='d'.repeat(32);
const NAMES=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const LABELS=Array.from({length:10},(_,k)=>String(500000000000000000n+BigInt(k)));
const CAPTURE=Object.freeze({subject:SUBJECT,subjectGeneration:G,state:'active',revision:1});
const PROOF=Object.freeze({purpose:'account_erasure',subject:SUBJECT,subjectGeneration:G,operationId:'e'.repeat(32),requestDigest:'f'.repeat(64),accountIncarnation:null});
const INVALID=['V1','v2','','false','true','null-value','undefined-value','accessor','inherited'];
const inventory=guildId=>[{id:guildId,position:0,permissions:'0',managed:false},{id:BOT_ROLE,position:30,permissions:'268435456',managed:false},
 {id:BLOCK,position:0,permissions:'0',managed:false},{id:LEADER,position:18,permissions:'1024',managed:false},{id:OFFICER,position:16,permissions:'1024',managed:false},
 {id:RAID,position:15,permissions:'1024',managed:false},{id:MOD,position:14,permissions:'1024',managed:false},{id:FRESH,position:1,permissions:'0',managed:false},
 {id:FRESH2,position:1,permissions:'0',managed:false},...TWELVE.map((id,k)=>({id,position:2+k,permissions:'0',managed:false})),
 ...LABELS.map((id,k)=>({id,position:2+k,permissions:'0',managed:false}))];
const stats={getterReads:0,passed:0};
let S=null;

// ---------- simulated Discord ----------
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
fixtureFetch=async(input,init={})=>{
 if(input instanceof Request){init={method:input.method,headers:input.headers,...init};input=input.url;}
 const url=new URL(String(input)),method=init.method||'GET';let reason=null;try{reason=new Headers(init.headers||{}).get('X-Audit-Log-Reason');}catch{}
 S.requests.push({method,path:url.pathname,reason});
 if(url.pathname==='/api/v10/users/@me'&&method==='GET')return json({id:BOT});
 let m=url.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/roles$/);if(m&&method==='GET')return json(inventory(m[1]));
 m=url.pathname.match(/^\/api\/v10\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);
 if(!m||m[1]!==S.env.GUILD_ID){S.unexpected.push(method+' '+url.pathname);throw Error('unexpected provider path');}
 if(!m[3]){if(method!=='GET'){S.unexpected.push(method+' '+url.pathname);throw Error('unexpected member method');}
  if(S.onMember)await S.onMember(m[2]);const roles=S.members[m[2]];return roles?json({user:{id:m[2]},roles:[...roles]}):new Response('{}',{status:404});}
 if(method!=='PUT'&&method!=='DELETE'){S.unexpected.push(method+' '+url.pathname);throw Error('unexpected role method');}
 const held=S.members[m[2]]??[];S.members[m[2]]=method==='PUT'?[...new Set([...held,m[3]])]:held.filter(r=>r!==m[3]);
 if(S.effectHook)await S.effectHook(method,m[3]);
 return new Response(null,{status:204});
};

// ---------- databases ----------
function plainD1(state){
 const exec=(sql,args)=>{state.trace.push({sql,args:args.slice()});if(state.beforeSql)state.beforeSql(sql,args);const statement=state.db.prepare(sql);
  if(/^\s*(SELECT|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql))return {results:statement.all(...args),meta:{changes:0}};
  const r=statement.run(...args);return {results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};};
 const make=(sql,args)=>({sql,bind:(...values)=>make(sql,values),async first(column){const row=exec(sql,args).results[0]??null;return column&&row?row[column]??null:row;},
  async all(){return exec(sql,args);},async run(){return exec(sql,args);},_exec:()=>exec(sql,args)});
 return {prepare:sql=>make(sql,[]),async batch(statements){state.db.exec('BEGIN');try{const out=statements.map(q=>q._exec());state.db.exec('COMMIT');return out;}catch(e){state.db.exec('ROLLBACK');throw e;}}};
}
function clockDb(foreignKeys){const db=new DatabaseSync(':memory:');if(foreignKeys)db.exec('PRAGMA foreign_keys=ON');
 db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('fixture clock misuse');return String(clockState.now);});return db;}
async function snapshot(s,id,rank,count=10){await s.write("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,content_hash,complete,trusted) VALUES(?,?,?,'test',?,'test',1,1)",id,clockState.now,clockState.now,count);
 for(let k=0;k<count;k++)await s.write('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)',id,'character'+k,'Character '+k,NAMES[k%10],k%10,k===rank?GUID:'Player-1234-'+String(k+20).padStart(8,'0'));}
async function baseRows(s){
 await s.write('INSERT INTO members(discord_id) VALUES(?)',SUBJECT);
 await s.write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)",SUBJECT,G,clockState.now,clockState.now);
 await s.write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('actual member','Actual Member',?,'member',?,?)",SUBJECT,clockState.now,GUID);
}
function newState(db){return {db,trace:[],requests:[],unexpected:[],members:{[SUBJECT]:[],[BOT]:[BOT_ROLE]},beforeSql:null,onMember:null,effectHook:null,env:null};}
function baseEnv(over){const env={GUILD_ID:GUILD,SITE_GUILD_ID:GUILD,ROLE_GUILD_MEMBER:TWELVE[0],ROLE_GUILD_LEADER:LEADER,ROLE_OFFICER:OFFICER,ROLE_RAID_LEADER:RAID,ROLE_MODERATOR:MOD,
 DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'fixture-only',...over};if(over.GUILD_ID&&!Object.hasOwn(over,'SITE_GUILD_ID'))env.SITE_GUILD_ID=over.GUILD_ID;return env;}
/** Plain D1 stub over the full schema: direct central calls, /ban, roster.demote. */
async function fresh(over){const db=clockDb(false);for(const sql of SCHEMA)db.exec(sql);S=newState(db);S.write=(sql,...args)=>db.prepare(sql).run(...args);
 S.env={DB:plainD1(S),...baseEnv(over)};await baseRows(S);await snapshot(S,1,7);return S;}
/** Current entry epoch and the genuine privacy write admission database of the graph under test. */
async function freshEntry(M,over){const db=clockDb(true);entry.installCurrentEntryEpoch(db,{now:clockState.now});S=newState(db);
 const native=entry.originalNativePort(db,{statement(sql,params){S.trace.push({sql,args:params.slice()});if(S.beforeSql)S.beforeSql(sql,params);}});
 S.native=native;S.admitted=M.admission.createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH);
 // Fixture setup writes go through the same admitted writer (the entry epoch refuses unadmitted writes).
 S.write=(sql,...args)=>S.admitted.prepare(sql).bind(...args).run();
 S.env=entry.currentEntryEnvironment({DB:S.admitted,...baseEnv(over)});await baseRows(S);return S;}

// ---------- modes and execution ----------
function setMode(env,mode){
 if(mode==='absent')return;
 if(mode==='accessor'){Object.defineProperty(env,MODE,{get(){stats.getterReads++;return 'v1';},enumerable:true,configurable:true});return;}
 if(mode==='inherited'){Object.setPrototypeOf(env,{[MODE]:'v1'});return;}
 Object.defineProperty(env,MODE,{value:mode==='null-value'?null:mode==='undefined-value'?undefined:mode,writable:true,enumerable:true,configurable:true});}
async function execute(M,mode,sc){
 // A scenario may move the fixture clock (for example into the scheduled roster phase); it is restored afterwards.
 const shift=sc.clockShift||0;clockState.now+=shift;try{return await executeAt(M,mode,sc);}finally{clockState.now-=shift;}}
async function executeAt(M,mode,sc){
 const s=sc.entry?await freshEntry(M,{...(sc.env||{})}):await fresh({...(sc.env||{})});setMode(s.env,mode);if(sc.prepare)await sc.prepare(s,M);
 s.trace.length=0;s.requests.length=0;s.beforeSql=null;s.onMember=null;s.effectHook=null;if(sc.arm)sc.arm(s,M);
 let outcome;try{outcome=await sc.act(s,M);}catch(e){outcome={thrown:String(e&&e.message||e)};}
 assert.deepEqual(s.unexpected,[],'no unexpected provider path');s.outcome=outcome;return s;}
/** Random 32-hex generations and UUIDs (roster claim nonces) are renamed by first appearance, so equal sequences compare equal. */
function normalize(value){const seen=new Map();const name=(h,kind)=>{if(!seen.has(h))seen.set(h,'<'+kind+seen.size+'>');return seen.get(h);};
 const fix=t=>t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,h=>name(h,'uuid')).replace(/[0-9a-f]{32}/g,h=>name(h,'hex'));
 const walk=v=>typeof v==='string'?fix(v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;return walk(value);}
const view=s=>JSON.stringify(normalize({trace:s.trace,requests:s.requests,outcome:s.outcome}));
function check(label,ok){assert.ok(ok,label);stats.passed++;console.log('PASS '+label);}
const deletes=(s,role)=>s.requests.filter(r=>r.method==='DELETE'&&(role===undefined||r.path.endsWith('/roles/'+role)));
const puts=s=>s.requests.filter(r=>r.method==='PUT');
const onlyGets=s=>s.requests.every(r=>r.method==='GET');
const audits=(s,action)=>s.db.prepare('SELECT details FROM audit WHERE action=? ORDER BY id').all(action).map(r=>JSON.parse(r.details??'null'));
const heldAudit=s=>audits(s,'role.remove_held').some(d=>!!d&&d.reason===HELD);
const settlements=s=>s.db.prepare('SELECT * FROM role_settlements ORDER BY created_at,id').all();
const row=(s,id)=>s.db.prepare('SELECT * FROM role_settlements WHERE id=?').get(id);
const reasonOf=r=>r&&r.reason!==null?decodeURIComponent(r.reason):null;
const pair=(M,env)=>Object.freeze({env,capture:M.policy.captureBetaRemovalDispatch(env)});
const withMode=(env,mode)=>{const copy={...env};delete copy[MODE];setMode(copy,mode);return copy;};
const onFirstSql=(s,prefix,effect)=>{s.beforeSql=sql=>{if(sql.trimStart().startsWith(prefix)){s.beforeSql=null;effect();}};};
const onSubjectGet=(s,effect)=>{s.onMember=id=>{if(id===SUBJECT){s.onMember=null;effect();}};};
const ban=s=>s.write('UPDATE members SET banned=1 WHERE discord_id=?',SUBJECT);
const ownership=async(s,role)=>{await s.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,subject_generation,created_at,expires_at) VALUES(?,?,'roster_membership',?,?,1,'settled','effect_and_current_server_confirmed',1,?,?,?,?)",
 PARENT,SUBJECT,s.env.GUILD_ID,role,'c'.repeat(32),G,clockState.now-10,clockState.now+290);return PARENT;};
/** A pre-existing removal row of the given purpose/role/state, as setup only (never a live producer). */
const removalRow=async(s,{id='9'.repeat(32),purpose,role,state='dispatching',attempts=1,digest=null,generation=G,reason='dispatching'})=>{
 await s.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,subject_generation,request_digest,created_at,expires_at) VALUES(?,?,?,?,?,0,?,?,?,?,?,?,?,?)",
 id,SUBJECT,purpose,s.env.GUILD_ID,role,state,reason,attempts,attempts?'8'.repeat(32):null,generation,digest,clockState.now-20,clockState.now+280);return id;};
const departed=async s=>{await s.write("UPDATE characters SET status='left' WHERE discord_id=?",SUBJECT);await s.write('DELETE FROM roster_members WHERE snapshot_id=1 AND guid=?',GUID);await s.write('UPDATE roster_snapshots SET member_count=9 WHERE id=1');};
/** A current account-erasure job (privacy_serving_jobs, subject retiring), so CURRENT_ERASURE_SQL holds as in production. */
const erasureJob=async s=>{await s.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?",SUBJECT);
 await s.write("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until) VALUES(?,?,?,?,0,0,'waiting_role',?,?)",
 PROOF.operationId,SUBJECT,G,PROOF.requestDigest,clockState.now,clockState.now+31622400);};
const erasureIntent=(s,{state='pending',attempts=0}={})=>s.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,attempts,claim_nonce,created_at,expires_at) VALUES(?,?,'account_erasure',?,?,0,?,'awaiting_dispatch',?,?,?,?,?,?)",
 PROOF.operationId,SUBJECT,s.env.GUILD_ID,s.env.ROLE_GUILD_MEMBER,state,G,PROOF.requestDigest,attempts,attempts?'7'.repeat(32):null,clockState.now-5,clockState.now+295);

// ---------- scenarios: each {env?, entry?, prepare?, act} ----------
const banInteraction=env=>({type:2,id:'1',token:'t',guild_id:env.GUILD_ID,member:{user:{id:'officer-fixture',username:'officer'},roles:[OFFICER]},
 data:{name:'olympus-admin',options:[{type:1,name:'ban',options:[{type:6,name:'user',value:SUBJECT},{type:3,name:'reason',value:'fixture'}]}]}});
const scenarios={
 rawBan:(env={})=>({env,prepare:s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];},act:async(s,M)=>(await (await M.inter.handleInteraction(s.env,banInteraction(s.env))).json()).data.content}),
 durableBan:(env={})=>scenarios.rawBan({MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',...env}),
 departure:(env={},removal)=>({env,prepare:s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];},
  act:async(s,M)=>{await M.roster.demote(s.env,SUBJECT,'actual member','Actual Member','fixture',removal?{capture:CAPTURE,removal:removal(s,M)}:{capture:CAPTURE});return 'returned';}}),
 centralBan:(env={},extra)=>({env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',...env},prepare:async s=>{await ban(s);s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];if(extra)await extra(s);},
  act:(s,M)=>M.rs.settleMembershipRemoval(s.env,SUBJECT,'ban',{subjectGeneration:G})}),
 retiredBan:(retired,act,env={},extra)=>({env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',ROLE_GUILD_MEMBER:FRESH,MEMBERSHIP_RETIRED_ROLE_ID:retired,...env},
  prepare:async s=>{await ban(s);await ownership(s,retired);s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER,retired];if(extra)await extra(s);},
  act:act||((s,M)=>M.rs.settleMembershipRemoval(s.env,SUBJECT,'ban',{subjectGeneration:G}))}),
 centralDeparture:act=>({env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true'},prepare:async s=>{await departed(s);s.members[SUBJECT]=[TWELVE[0]];},
  act:act||((s,M)=>M.roles.settleGuildDepartureRole({...s.env},SUBJECT,{subjectGeneration:G}))}),
 compensation:(env={},onPut)=>({env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',...env},prepare:async(s,M)=>{s.queued=await M.rs.queueRosterMembershipRole(s.env,SUBJECT,1,G);},
  act:(s,M)=>{s.effectHook=async method=>{if(method==='PUT'){await ban(s);if(onPut)onPut(s);}};return M.rs.settleRoleIntent(s.env,s.queued);}}),
 retire:(retired,extra)=>({env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',ROLE_GUILD_MEMBER:FRESH,MEMBERSHIP_RETIRED_ROLE_ID:retired},
  prepare:async s=>{await ownership(s,retired);s.members[SUBJECT]=[FRESH,retired];if(extra)await extra(s);},act:(s,M)=>M.rs.retireOwnedMembershipRole(s.env,PARENT,{subjectGeneration:G})}),
 erasure:(env={},extra)=>({env,prepare:async s=>{await erasureJob(s);s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];if(extra)await extra(s);},act:(s,M)=>M.roles.settleAccountErasureMemberRole(s.env,{...PROOF})}),
 rank:(roles,extra)=>({env:{QR_RANK_MAPPING_ENABLED:'true',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'ten-rank',roles})},
  prepare:async(s,M)=>{s.members[SUBJECT]=[roles[0]];await M.rs.queueRosterRankRoles(s.env,SUBJECT,1,G);s.rankIntent=s.db.prepare('SELECT id FROM role_settlements WHERE role_id=? AND desired=0').get(roles[0]).id;if(extra)await extra(s,M);},
  act:(s,M)=>M.rs.settleRoleIntent(s.env,s.rankIntent)}),
};
const rankIntent=s=>row(s,s.rankIntent);

// ---------- entry-epoch scenarios (genuine privacy write admission; Discord simulated) ----------
const rosterOthers=n=>Array.from({length:n},(_,k)=>({name:'Character '+k,guid:'Player-1234-'+String(k+20).padStart(8,'0'),rank:'Member',rankIndex:7}));
/** The subject's only character is already armed (left_pending) and absent from the export, so the export confirms the departure. */
const armed=async s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];await s.write("UPDATE characters SET status='left_pending' WHERE discord_id=?",SUBJECT);};
const pendingDeparts=s=>s.db.prepare("SELECT COUNT(*) AS n FROM roster_effects WHERE kind='depart' AND done_at IS NULL").get().n;
Object.assign(scenarios,{
 /** Watcher event batch: an officer's panel removal (authoritative) demotes through ingest.postEvents. */
 postEvents:(env={})=>({entry:true,env,prepare:s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];},
  act:async(s,M)=>{const r=await M.ingest.postEvents(s.env,{events:[{type:'removed',name:'Actual Member',ok:true,detail:'fixture'}]});return {status:r.status,body:await r.text()};}}),
 /** Roster export that confirms an armed departure: ingestRoster -> deriveRun -> applyEffects -> afterDeparture. */
 ingestRoster:(env={})=>({entry:true,env:{ROSTER_MIN_MEMBERS:'0',...env},prepare:armed,act:(s,M)=>M.roster.ingestRoster(s.env,clockState.now-30,rosterOthers(10),'addon')}),
 /** The scheduled slice: the export's depart claim is refused once during setup, so the item is still pending for
  * continueRosterEffects. The clock is moved into the roster phase (87 physical statements) where a depart item fits. */
 continueRoster:(env={})=>({entry:true,clockShift:900,env:{ROSTER_MIN_MEMBERS:'0',...env},
  prepare:async(s,M)=>{await armed(s);let refused=false;
   s.beforeSql=sql=>{if(!refused&&sql.trimStart().startsWith("UPDATE characters SET status = 'left', left_at = ?4")){refused=true;throw Error('fixture: depart claim refused once');}};
   s.setupExport=await M.roster.ingestRoster(s.env,clockState.now-30,rosterOthers(10),'addon');s.beforeSql=null;s.pendingBefore=pendingDeparts(s);},
  act:(s,M)=>M.roster.continueRosterEffects(s.env)}),
 /** postEvents with central settlement ON: afterDeparture delegates to roles.settleGuildDepartureRole with the custody env
  * and the postEvents entry pair; the latest trusted snapshot (no subject character) is the departure cause. */
 postEventsCentral:(env={})=>({entry:true,env:{MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',...env},prepare:async s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];await snapshot(s,1,-1);},
  act:async(s,M)=>{const r=await M.ingest.postEvents(s.env,{events:[{type:'removed',name:'Actual Member',ok:true,detail:'fixture'}]});return {status:r.status,body:await r.text()};}}),
 /** /olympus-admin sync path: syncFromLatest demotes a member character missing from the latest trusted snapshot. */
 syncDeparture:(env={})=>({entry:true,env:{ROSTER_MIN_MEMBERS:'0',...env},prepare:async s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];await snapshot(s,1,-1);},
  act:(s,M)=>M.roster.syncFromLatest(s.env)}),
 /** syncFromLatest -> reconcileIdentities -> releaseBinding: another character now carries the linked name (namesake release). */
 syncNamesake:(env={})=>({entry:true,env:{ROSTER_MIN_MEMBERS:'0',...env},prepare:async s=>{s.members[SUBJECT]=[s.env.ROLE_GUILD_MEMBER];await snapshot(s,1,-1);
   await s.write("INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,'actual member','Actual Member','Member',7,'Player-1234-00009999')");await s.write('UPDATE roster_snapshots SET member_count=11 WHERE id=1');},
  act:(s,M)=>M.roster.syncFromLatest(s.env)}),
});

// ---------- attended retirement (producer3) through handleMembershipRetirement ----------
const ROUTE='/api/admin/membership-retirement',CHILD='6'.repeat(32);
const attendedEnv=retired=>({SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://bot.example',COOKIE_SECRET:'synthetic-only-cookie',VERIFY_SECRET:'synthetic-only-verify',
 SITE_ADMINS:STAFF,ROLE_GUILD_MEMBER:FRESH,MEMBERSHIP_RETIRED_ROLE_ID:retired,MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',ASSETS:{fetch:()=>{throw Error('unexpected assets');}}});
/** Staff account, original 21-field bot-owned parent grant and (optionally) a spent retirement child, as setup only.
 * The staff session is issued by the sole PROFILE issuer (privacy129_fixture.issueOriginalEntryCookie) on the raw Native env. */
async function attendedSetup(s,M,retired,child){
 s.members[SUBJECT]=[FRESH,retired];
 await s.write('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at)VALUES(?,?,1,0,1,?,?,?)',STAFF,'synthetic-staff',clockState.now,clockState.now,clockState.now);
 await s.write("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'active',1,?,?)",STAFF,STAFF_G,clockState.now,clockState.now);
 await s.write("INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,attempts,claim_nonce,subject_generation,created_at,expires_at,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,reason,checked_at)VALUES(?,?,'roster_membership',NULL,?,?,1,'settled',1,?,?,?,?,NULL,42,'Player-fixture','ten-rank',7,'Member','effect_and_current_server_confirmed',?)",
  PARENT,SUBJECT,s.env.GUILD_ID,retired,'c'.repeat(32),G,clockState.now-1000,clockState.now-700,clockState.now-990);
 if(child)await s.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,subject_generation,attempts,claim_nonce,created_at,expires_at)VALUES(?,?,'grant_compensation',?,?,0,'dispatching','membership_retirement_dispatching',?,?,1,?,?,?)",
  CHILD,SUBJECT,s.env.GUILD_ID,retired,PARENT,G,'5'.repeat(32),clockState.now-30,clockState.now+270);
 s.issued=await entry.issueOriginalEntryCookie(M.load,s.db,{...s.env,DB:s.native},STAFF);
}
Object.assign(scenarios,{
 /** Production-shaped: index.fetch wraps the raw Native env; the handler captures the mode at its own entry. */
 attendedRoute:(retired,{child=false,act}={})=>({entry:true,env:attendedEnv(retired),
  prepare:async(s,M)=>{await attendedSetup(s,M,retired,child);s.env.DB=s.native;
   s.call=async(method,suffix,body)=>{const u='https://guild.example'+ROUTE+suffix;
    const request=new Request(u,{method,headers:{Cookie:s.issued.cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const response=await M.load('index').default.fetch(request,s.env,{waitUntil:()=>{}}),text=await response.text();let data;try{data=JSON.parse(text);}catch{data={text};}return {status:response.status,data};};
   s.preview=await s.call('GET','?parentGrantId='+PARENT);},
  act:act||((s)=>s.call('POST','/retire',{parentGrantId:PARENT,form:s.preview.data.form}))}),
 /** Direct seam for in-isolate drift: the same admission the route builds, then retireOwnedMembershipRole on the admitted env. */
 attendedDirect:(retired)=>({entry:true,env:attendedEnv(retired),prepare:async(s,M)=>{await attendedSetup(s,M,retired,false);},
  act:(s,M)=>{const session=s.issued.session,binding=M.load('membership-role-transition').membershipTargets(s.env),parent=row(s,PARENT);
   const admission=M.rs.admitAttendedMembershipRetirement(s.env,{staff:session,binding,parent,subjectGeneration:G,expiresAt:Math.min(session.e,clockState.now+300),formNonce:'4'.repeat(32),child:null});
   return M.rs.retireOwnedMembershipRole(s.env,PARENT,{subjectGeneration:G},{limit:8,attempts:0,retries:0},admission);}}),
});

function finish(name){console.log(`${name}: ${stats.passed}/${stats.passed} passed`);}
function restore(){if(S?.db)try{S.db.close();}catch{}Date.now=realNow;globalThis.fetch=realFetch;}

module.exports={root,entry,makeLoader,modules,NEW,SCHEMA,clockState,stats,get S(){return S;},
 P,GUILD,TWELVE,MODE,HELD,OTHER_GUILD,SUBJECT,BOT,BOT_ROLE,STAFF,FRESH,FRESH2,BLOCK,OFFICER,G,STAFF_G,GUID,PARENT,LABELS,CAPTURE,PROOF,INVALID,NAMES,
 fresh,freshEntry,setMode,execute,normalize,view,check,deletes,puts,onlyGets,audits,heldAudit,settlements,row,reasonOf,pair,withMode,onFirstSql,onSubjectGet,
 ban,ownership,removalRow,departed,erasureJob,erasureIntent,snapshot,scenarios,rankIntent,pendingDeparts,CHILD,finish,restore};

// Fresh full-release roles (Revision 4): the regressions the correctness, boundaries and tests reviews asked for, over the
// real lane modules (full-release-roles.ts, the lane block of role-settlements.ts, full-release-pass.ts) and native SQLite on
// the REAL schema.sql with a controlled clock. Only Discord is simulated; every ID is synthetic (the twelve are never used).
// Covers: the departure cause (live-seen filter, left_pending), hand-given staff roles never in custody, the rank-replacement
// dependency and GRANT_AFTER_REMOVAL through the consumer and the producer, the fresh permission guard, STAFF_WANTED_ANY, the
// epochStart term of the pick, major 4 through a pass (removals mode, a replaced ID), the original-facts witness, departure
// events (freed_seat, several, a burst owing nothing, an unbind behind history), bans only for staff re-removal, a left_pending
// main, the worst-case ban, and the review fixes (spent staff rows on a 404, present fresh roles confirmed once, a narrowed
// staff mode, the DELETE spacing before the claim, the caller reserve, the staff LINKS_NOT_BEFORE floor).
//   node tests/full_release_review_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');globalThis.crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..'),cache={},schema=fs.readFileSync(path.join(root,'schema.sql'),'utf8');
let provider=async()=>{throw Error('provider calls forbidden before synthetic handler setup');};
globalThis.fetch=(...args)=>provider(...args);
function load(name){if(name==='node:async_hooks'||name==='./node:async_hooks')return require('node:async_hooks');name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(m,m.exports,p=>load(p));return m.exports;}
const R=load('role-settlements'),F=load('full-release-roles'),P=load('full-release-pass'),policy=load('beta-reset-policy');
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const NATIVE=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'],BETA=['Guild Master','Officer','Veteran','Member','Initiate'];
const id=n=>String(800000000000000000n+BigInt(n));
const G=id(1),BOT=id(2),BOTROLE=id(3),OFF=id(4),OLD=id(5),GL=id(6),RL=id(8),BLOCKER=id(9),S=id(10),FM=id(100),N=Array.from({length:10},(_,i)=>id(101+i)),OLDN=id(150),NEW7=id(160);
const TWELVE=policy.BETA_RESET_ROLE_IDS,E=1793833200,T=E+86400,ALL=[FM,...N];
const cfgRaw=(o={})=>JSON.stringify({version:1,epoch:'olympus-full-release-test',epochStart:E,grants:true,membership:FM,native:N,...o});
let clock=T,db,env,cap,members,requests,log,memberHook,effectHook,positions,perms,extraRoles,lastBatch,failures=0,passes=0,overruns=0;
const realNow=Date.now;Date.now=()=>clock*1000;
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const inventory=()=>[{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:50,permissions:'268435456',managed:false},{id:FM,position:2,permissions:'0',managed:false},
 ...N.map((r,i)=>({id:r,position:3+i,permissions:'0',managed:false})),{id:GL,position:20,permissions:'1024',managed:false},{id:OFF,position:19,permissions:'1024',managed:false},
 {id:RL,position:18,permissions:'1024',managed:false},{id:BLOCKER,position:1,permissions:'0',managed:false},{id:OLD,position:1,permissions:'0',managed:false},...extraRoles]
 .map(r=>({...r,...(positions[r.id]===undefined?{}:{position:positions[r.id]}),...(perms[r.id]===undefined?{}:{permissions:perms[r.id]})}));
provider=async(input,init={})=>{const p=new URL(String(input)).pathname,method=init.method||'GET';
 if(/^\/api\/v10\/channels\/\d+\/messages$/.test(p)&&method==='POST')return json({id:'1'}); // the officer log line (uncounted, as .160)
 requests.push(method+' '+p);
 if(p.endsWith('/users/@me'))return json({id:BOT});
 if(p.endsWith('/roles')&&method==='GET')return json(inventory());
 const m=p.match(/\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m||m[1]!==G)throw Error('unexpected provider path '+p);
 if(m[3]){if(effectHook)await effectHook(method,m[2],m[3]);const cur=members[m[2]]||[];members[m[2]]=method==='PUT'?[...new Set([...cur,m[3]])]:cur.filter(x=>x!==m[3]);return new Response(null,{status:204});}
 if(memberHook){const f=memberHook;memberHook=null;await f(m[2]);}
 if(!members[m[2]])return new Response('{}',{status:404});return json({user:{id:m[2]},roles:members[m[2]]});};
function d1(){function prepare(sql){let args=[];const q={sql,bind(...values){args=values;return q;},async first(){return q.exec().results[0]||null;},
 async all(){return {results:q.exec().results};},async run(){return q.exec();},
 exec(){log.push(sql);const stmt=db.prepare(sql);if(/^\s*(SELECT|WITH)/.test(sql)||/RETURNING/.test(sql))return {results:stmt.all(...args),meta:{changes:0}};
  const r=stmt.run(...args);return {results:[],meta:{changes:Number(r.changes)}};}};return q;}
 return {prepare,batch:async rows=>{db.exec('BEGIN');try{const out=rows.map(x=>x.exec());db.exec('COMMIT');lastBatch=out;return out;}catch(e){db.exec('ROLLBACK');throw e;}}};}
const budget=(limit=40)=>({limit,attempts:0,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false});
function reset(extra={}){clock=T;db=new DatabaseSync(':memory:');db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unsupported synthetic clock');return String(clock);});db.exec(schema);
 env={DB:d1(),GUILD_ID:G,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'fixture-only',ROLE_GUILD_MEMBER:OLD,ROLE_GUILD_LEADER:GL,ROLE_OFFICER:OFF,ROLE_RAID_LEADER:RL,BLOCKING_ROLE_IDS:BLOCKER,
  FULL_RELEASE_ROLES:cfgRaw(),STAFF_TEN_RANK_ROLES:'true',LINKS_NOT_BEFORE:String(E),ROSTER_MIN_MEMBERS:'3',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',...extra}; // P1-B: the supported staff configuration
 for(const [k,v] of Object.entries(env))if(v===undefined)delete env[k];
 cap=F.captureLaneConfig(env);members={[BOT]:[BOTROLE]};requests=[];log=[];memberHook=null;effectHook=null;positions={};perms={};extraRoles=[];lastBatch=null;P.forgetFreshPassThrottle();}
function character(key,discord,status,guid){db.prepare('INSERT OR IGNORE INTO members(discord_id) VALUES(?)').run(discord);db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,?,?,?)').run(key,key,discord,status,T-90*86400,guid);}
function snapshot(rows,{fill=3,exported=clock-60,beta=false}={}){const all=rows.concat(Array.from({length:fill},(_,i)=>({key:'filler'+i,guid:'Player-1-F'+i,rank:beta?3:7})));
 const s=Number(db.prepare("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?,?,'test',?,1,1)").run(exported,exported,all.length).lastInsertRowid);
 for(const r of all)db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)').run(s,r.key,r.key,(beta?BETA:NATIVE)[r.rank],r.rank,r.guid);return s;}
function consume(discord,key,at=clock-500,ack=true){const p=Number(db.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source) VALUES(?,?,?,?,?,?,'whisper')").run(discord,key,key,at-60,at+600,at).lastInsertRowid);
 if(ack)db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'watcher','verify.confirmed',?,?)").run(at+5,key,JSON.stringify({discordId:discord}));return p;}
const hex=()=>require('node:crypto').randomBytes(16).toString('hex');
function settle(o){const r={id:hex(),subject:S,purpose:'fresh_roster_membership',guild_id:G,role_id:FM,desired:1,state:'settled',reason:'fixture',attempts:1,created_at:clock-5000,expires_at:clock-4700,claim_nonce:hex(),
  subject_generation:null,request_digest:null,roster_id:null,native_guid:null,native_profile:null,native_rank:null,native_rank_name:null,checked_at:null,...o};
 db.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.state,r.reason,r.attempts,r.created_at,r.expires_at,r.claim_nonce,r.subject_generation,r.request_digest,r.roster_id,r.native_guid,r.native_profile,r.native_rank,r.native_rank_name,r.checked_at);return r;}
const row=rid=>db.prepare('SELECT * FROM role_settlements WHERE id=?').get(rid);
const count=(where='1=1')=>db.prepare('SELECT COUNT(*) AS n FROM role_settlements WHERE '+where).get().n;
const effects=()=>requests.filter(r=>/^(PUT|DELETE) /.test(r));
const path_=(m,s,r)=>m+' /api/v10/guilds/'+G+'/members/'+s+'/roles/'+r;
const auditRows=action=>db.prepare('SELECT * FROM audit WHERE action=? ORDER BY id').all(action);
const facts=(guid,rank,roster=null)=>({native_guid:guid,native_profile:'ten-rank',native_rank:rank,native_rank_name:NATIVE[rank],roster_id:roster});
const yes=(pred,binds)=>db.prepare(`SELECT CASE WHEN ${pred} THEN 1 ELSE 0 END AS ok`).get(...F.bindsFor(pred,binds)).ok===1;
const pending=o=>settle({state:'pending',reason:'awaiting_dispatch',attempts:0,claim_nonce:null,created_at:clock,expires_at:clock+300,...o});
const spent=o=>settle({state:'unknown',reason:'provider_outcome_unknown',created_at:clock-400,expires_at:clock-100,...o});
const leaves=(key,discord,action='roster.left')=>{db.prepare("UPDATE characters SET status='left',left_at=? WHERE name_key=?").run(clock,key);
 db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system',?,?,?)").run(clock,action,key,JSON.stringify({discordId:discord,how:'in game',keptRoles:[]}));};
function seedState(o){db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','role.fresh_state','watcher',?)").run(clock-4000,JSON.stringify({r:'',d:'',g:'',s:'',p:'',k:0,h:0,...o}));}
/** One pass without a caller Admission; statements: the SQL texts it ran. A failed visit or pass anywhere fails the run. */
async function pass(trigger='watcher',calls=budget(40),extra={}){P.forgetFreshPassThrottle();const before=log.length,reqs=requests.length;
 const r=await P.runFreshPass(env,{calls,...extra},trigger,cap);if(r.counts.failed||r.state==='failed')failures++;
 if(r.state==='done'){passes++;if(log.length-before>r.counts.statements+P.FRESH_CLOSE_STATEMENTS)overruns++;} // the self-reserved bounds hold
 return {...r,statements:log.slice(before),requests:requests.length-reqs};}
/** Historical departures with closed custody, sorted before every subject below (the window walk needs ceil(n/50) passes). */
function history(n){for(let i=0;i<n;i++){const h=id(3000+i);character('gone'+i,h,'left','Player-2-'+i);
 settle({subject:h,role_id:FM,request_digest:'e'.repeat(64),created_at:clock-90000,expires_at:clock-89700,...facts('Player-2-'+i,7)});
 settle({subject:h,purpose:'fresh_removal_departure',role_id:FM,desired:0,reason:'removed',created_at:clock-80000,expires_at:clock-79700});}}
(async()=>{
 const D=await F.laneDigest(cfgRaw());
 // ===== tests review, major: the departure cause ignores characters never seen on a live roster; left_pending is not a leave
 const betaWorld=liveStatus=>{reset();snapshot([{key:'betaonly',guid:'Player-0-B',rank:1}],{beta:true,exported:E-5*86400});
  character('betaonly',S,'member','Player-0-B');character('livechar',S,liveStatus,'Player-1-L');snapshot([]);
  settle({role_id:FM,request_digest:D,...facts('Player-1-L',7)});settle({purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-L',7)});members[S]=[FM,N[7]];};
 const precheck=()=>{const sql=F.laneRemovalSql('fresh_removal_departure').precheck;return db.prepare(sql).all(...F.bindsFor(sql,[null,S,'fresh_removal_departure',G,null,null,E])).length;};
 {betaWorld('left');
  check('departure cause: a member character seen only on a pre-epoch beta export does not keep the account once its live character left',precheck()===1);
  seedState({h:0});db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left','livechar',?)").run(clock-10,JSON.stringify({discordId:S}));
  const r=await pass();
  check('and the pass DELETEs the fresh member and rank roles of the live character that left',r.state==='done'&&effects().join()===[path_('DELETE',S,FM),path_('DELETE',S,N[7])].join()
   &&count(`purpose='fresh_removal_departure' AND state='settled' AND reason='removed'`)===2);}
 {betaWorld('left_pending');
  check('departure cause: a live character in left_pending (a leave that is not authoritative) still holds the account',precheck()===0);
  const r=await pass();check('and no pass removes anything',r.state==='done'&&effects().length===0&&count('desired=0')===0&&members[S].join()===[FM,N[7]].join());}
 // ===== tests review, major: a hand-given staff role is never bot custody (a request-free confirm, attempts 0, is no PUT of ours)
 const handWorld=()=>{reset();character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[OFF];};
 {handWorld();const r=await pass(),own=db.prepare('SELECT * FROM role_settlements WHERE role_id=?').all(OFF);
  check('a hand-given Officer is confirmed by the staff visit with no request on it (staff_roster_rank settled, attempts 0)',r.state==='done'&&own.length===1&&own[0].attempts===0
   &&own[0].reason==='fresh_server_confirmed'&&!requests.some(q=>q.endsWith('/roles/'+OFF)));
  check('neither the strict nor the ban custody counts that row',!yes(F.staffCustodySql('?1','?2','?3'),[S,G,OFF])&&!yes(F.staffBanCustodySql('?1','?2','?3'),[S,G,OFF]));
  db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);clock+=301;snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);requests=[];
  const ban=await pass(),deferral=await P.settleLaneBan(env,S,cap,{...budget(40),limit:24});
  check('ban: the rotation and the ban deferral remove only the fresh roles the bot gave; the hand-given Officer stays, no staff removal row',ban.state==='done'
   &&effects().join()===[path_('DELETE',S,FM),path_('DELETE',S,N[2])].join()&&members[S].join()===OFF&&count("purpose LIKE 'staff_removal%'")===0&&deferral.state==='settled');}
 {handWorld();await pass();leaves('officer',S);clock+=301;snapshot([]);requests=[];const r=await pass();
  check('leave: the departure removes the two fresh roles the bot gave; the hand-given Officer stays, no staff removal row',r.state==='done'
   &&effects().join()===[path_('DELETE',S,FM),path_('DELETE',S,N[2])].join()&&members[S].join()===OFF&&count("purpose LIKE 'staff_removal%'")===0);}
 // ===== tests review, major: the rank-replacement dependency and GRANT_AFTER_REMOVAL through the consumer guard and the producer
 {reset();character('raider',S,'member','Player-1-R');const snap=snapshot([{key:'raider',guid:'Player-1-R',rank:4}]);const pk=consume(S,'raider');members[S]=[];
  spent({purpose:'roster_privileged_rank',role_id:OFF,...facts('Player-1-R',2,1)});
  const o=await R.laneQualifyEach(env,budget(),S,cap.managedStaff.slice());requests=[];const q=await R.queueStaffRankRoles(env,cap,S,snap,null,o);
  check('staff family: an unknown bot Officer PUT keeps the producer from writing the Raid Leader grant',q.ids.length===0&&count(`role_id='${RL}'`)===0);
  const p=pending({purpose:'staff_roster_rank',role_id:RL,...facts('Player-1-R',4,snap)}),r=await R.settleLaneIntent(env,cap,p.id,false,budget(),o,{pending:pk});
  check('and the consumer holds a pending Raid Leader row lane_intent_stale: no claim, no PUT',r.state==='held'&&r.reason==='lane_intent_stale'&&row(p.id).attempts===0&&effects().length===0);}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);const pk=consume(S,'alpha');members[S]=[];
  spent({purpose:'fresh_roster_rank',role_id:OLDN,request_digest:'f'.repeat(64),...facts('Player-1-A',5)});
  const o=await R.laneQualifyEach(env,budget(),S,ALL);requests=[];const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  check('fresh family: an unknown grant on a historical rank ID (no longer configured) keeps the producer from writing the new rank grant',count(`role_id='${N[7]}'`)===0
   &&q.ids.length===1&&row(q.ids[0]).role_id===FM);
  const p=pending({purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-A',7,snap)}),r=await R.settleLaneIntent(env,cap,p.id,false,budget(),o,{pending:pk});
  check('and the consumer holds the pending rank row lane_intent_stale with no PUT',r.reason==='lane_intent_stale'&&row(p.id).attempts===0&&effects().length===0);}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);const pk=consume(S,'alpha');members[S]=[];
  settle({purpose:'fresh_removal_ban',role_id:FM,desired:0,reason:'absent',attempts:0,created_at:clock,expires_at:clock+300});
  const o=await R.laneQualifyEach(env,budget(),S,ALL);requests=[];await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  check('a removal written in this very second (a ban and unban inside one second) keeps the producer from writing the membership grant',count(`role_id='${FM}' AND desired=1`)===0);
  const p=pending({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)}),r=await R.settleLaneIntent(env,cap,p.id,false,budget(),o,{pending:pk});
  check('and the consumer refuses a pending grant created in the same second as that removal: no claim, no PUT',r.reason==='lane_intent_stale'&&row(p.id).attempts===0&&effects().length===0);}
 // ===== tests review, major: a fresh role carrying permissions is never granted or confirmed (the :45 cosmetic check)
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');members[S]=[];perms[N[7]]='8';
  const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S)),rank=q.ids.find(x=>row(x).role_id===N[7]);
  const inv=await R.laneQualifyEach(env,budget(),S,ALL);requests=[];const r=await R.settleLaneIntent(env,cap,rank,false,budget(),inv,{pending:q.pending});
  check('planned from a screen read, a permissioned rank role is held inventory_hierarchy_or_server_hold: no claim, no PUT',!!rank&&r.reason==='inventory_hierarchy_or_server_hold'
   &&row(rank).attempts===0&&effects().length===0);
  const again=await R.queueFreshRosterRoles(env,cap,S,snap,null,inv);
  check('planned from an inventory read it is left out of the plan',!again.ids.includes(rank)&&again.ids.length===1&&row(again.ids[0]).role_id===FM);}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');perms[N[7]]='8';members[S]=[FM,N[7]];
  settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});const k=spent({purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-A',7,snap)});
  const inv=await R.laneQualifyEach(env,budget(),S,ALL);requests=[];const r=await R.settleLaneIntent(env,cap,k.id,true,budget(),inv);
  check('M2 never confirms a present permissioned fresh role: held, the spent row stays unknown, no request',r.reason==='inventory_hierarchy_or_server_hold'&&row(k.id).state==='unknown'&&requests.length===0);}
 // ===== tests review, major: the top staff-mapped listed character's role is never removed, linked or not (STAFF_WANTED_ANY)
 const wantedAnyWorld=()=>{reset();character('main',S,'member','Player-1-M');character('alt',S,'member','Player-1-L');
  const snap=snapshot([{key:'main',guid:'Player-1-M',rank:2},{key:'alt',guid:'Player-1-L',rank:4}]);consume(S,'alt');
  // bot custody from a beta-era settled PUT (no lane grant, so the main is not linked through Route 2)
  settle({purpose:'roster_privileged_rank',role_id:OFF,native_profile:'beta-five',native_rank:1,native_rank_name:'Officer',created_at:clock-9000,expires_at:clock-8700});members[S]=[OFF];return snap;};
 {const snap=wantedAnyWorld(),o=await R.laneQualifyEach(env,budget(),S,cap.managedStaff.slice()),q=await R.queueStaffRankRoles(env,cap,S,snap,null,o);
  check('an Officer main listed but not verified keeps the bot-given Officer: no desired=0 Officer row; Raid Leader planned for the verified alt',count(`role_id='${OFF}' AND desired=0`)===0
   &&q.ids.map(row).some(x=>x.role_id===RL&&x.desired===1));}
 {wantedAnyWorld();const r=await pass();
  check('and a pass sends no request on Officer (Raid Leader is added)',r.state==='done'&&!requests.some(x=>x.endsWith('/roles/'+OFF))&&members[S].includes(OFF)&&members[S].includes(RL));}
 // ===== tests review, minor: the pick needs a consumption at or after epochStart (owner: rank from a character verified after it)
 {reset();character('main',S,'member','Player-1-M');character('alt',S,'member','Player-1-L');
  const snap=snapshot([{key:'main',guid:'Player-1-M',rank:2},{key:'alt',guid:'Player-1-L',rank:7}]);consume(S,'main',E-1000);consume(S,'alt',clock-500);members[S]=[];
  const pick=db.prepare(F.primaryPickSql('fresh')).get(snap,S,null,E,D);
  check('an Officer main verified before epochStart is not the pick; the Member alt verified after it is',!!pick&&pick.rank_index===7&&pick.guid==='Player-1-L');
  const r=await pass();check('the pass grants membership and the Member rank role, never the Officer rank role or Officer',r.state==='done'&&effects().join()===[path_('PUT',S,FM),path_('PUT',S,N[7])].join());}
 // ===== tests review, minor: major 4 through a pass (removals mode, a replaced role ID) and the original-facts witness
 const free=(role,family)=>yes(F.targetFenceSql('?1','?2','?3','?4'),[S,G,role,'x'])&&yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'x',JSON.stringify(family)]);
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');
  settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});const k=spent({purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-A',7,snap)});
  members[S]=[FM];env.FULL_RELEASE_ROLES=cfgRaw({grants:false});cap=F.captureLaneConfig(env);const r=await pass();
  check('P1-A: grants paused (removals mode, a new D): one pass reads the spent rank row and, absent, only stamps it by tuple (unknown, no past_effect_absent)',cap.fresh==='removals'
   &&r.state==='done'&&row(k.id).state==='unknown'&&row(k.id).reason==='provider_outcome_unknown'&&row(k.id).checked_at===clock&&effects().length===0);
  check('P1-A: the physical target and the fresh rank family stay fenced; role.fresh_grants_held is audited',!yes(F.targetFenceSql('?1','?2','?3','?4'),[S,G,N[7],'x'])
   &&!yes(F.rankFamilyFenceSql('?1','?2','?3','fresh','?4'),[S,G,'x',JSON.stringify(N)])&&auditRows('role.fresh_grants_held').length===1);}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');extraRoles=[{id:NEW7,position:13,permissions:'0',managed:false}];
  settle({role_id:FM,request_digest:D,...facts('Player-1-A',7,snap)});const k=spent({purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-A',7,snap)});
  const native=N.map((r,i)=>i===7?NEW7:r);members[S]=[FM];env.FULL_RELEASE_ROLES=cfgRaw({native});cap=F.captureLaneConfig(env);const r=await pass();
  check('P1-A: a replaced Member role ID: the old spent row is only stamped (unknown); as its PUT may still land, the new rank ID is not granted while it is unresolved',
   cap.fresh==='grants'&&r.state==='done'&&row(k.id).state==='unknown'&&row(k.id).checked_at===clock&&effects().length===0&&count(`role_id='${NEW7}'`)===0&&!free(N[7],native));}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');members[S]=[];
  const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S));requests=[];
  memberHook=()=>{const f=lastBatch&&lastBatch[0]&&lastBatch[0].results[0];if(f)f.expires_at+=1;};
  const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),undefined,{pending:q.pending});
  check('an original fact edited during the inventory read holds original_role_facts_changed before any claim or PUT',r.state==='held'&&r.reason==='original_role_facts_changed'
   &&row(q.ids[0]).attempts===0&&effects().length===0);}
 // ===== tests review and correctness review: departure events (freed_seat, several in one burst, a burst owing nothing, no event)
 const zed=(Z,key)=>{character(key,Z,'member','Player-1-'+key);settle({subject:Z,role_id:FM,request_digest:D,...facts('Player-1-'+key,7)});
  settle({subject:Z,purpose:'fresh_roster_rank',role_id:N[7],request_digest:D,...facts('Player-1-'+key,7)});members[Z]=[FM,N[7]];};
 {reset();history(200);const Z=id(9000);zed(Z,'zed');snapshot([]);seedState({h:0});leaves('zed',Z,'roster.freed_seat');const r=await pass();
  check('a roster.freed_seat event behind 200 historical subjects is removed within one pass',r.state==='done'&&effects().join()===[path_('DELETE',Z,FM),path_('DELETE',Z,N[7])].join());}
 {reset();history(200);const Z=id(9000);zed(Z,'zed');snapshot([]);seedState({h:0});
  for(let i=0;i<300;i++)db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'system','roster.left',?,?)").run(clock-100,'burst'+i,JSON.stringify({discordId:id(50000+i),how:'link predates LINKS_NOT_BEFORE',keptRoles:[]}));
  leaves('zed',Z);const first=await pass();
  check('a burst of 300 departure events owing nothing (the LINKS_NOT_BEFORE release): one statement reads one window, no per-event walk, nothing sent',first.state==='done'
   &&first.requests===0&&first.statements.filter(s=>s===P.FRESH_DEPARTURE_EVENTS_SELECT).length===1&&!first.statements.includes(F.departureWalkSelectSql(true)));
  clock+=301;const second=await pass();
  check('the next pass reaches the owing departure behind the burst and removes its roles (window FRESH_DEPARTURE_EVENT_WINDOW = 200)',P.FRESH_DEPARTURE_EVENT_WINDOW===200
   &&second.state==='done'&&effects().join()===[path_('DELETE',Z,FM),path_('DELETE',Z,N[7])].join());
  const eqp=db.prepare('EXPLAIN QUERY PLAN '+P.FRESH_DEPARTURE_EVENTS_SELECT).all(0,4,200,G).map(x=>x.detail).join(' | ');
  check('the event window is two index seeks on audit_actor_action past the watermark; no audit or role_settlements scan',/SEARCH audit USING (COVERING )?INDEX audit_actor_action \(actor=\? AND action=\? AND rowid>\?\)/.test(eqp)
   &&!/SCAN (audit|role_settlements)\b/.test(eqp));}
 {reset();history(200);const Zs=[id(9001),id(9002),id(9003)];Zs.forEach((z,i)=>zed(z,'zed'+i));snapshot([]);seedState({h:0});Zs.forEach((z,i)=>leaves('zed'+i,z));const order=[];
  for(let n=0;n<3;n++){const before=effects().length;await pass();clock+=301;order.push(Zs.findIndex(z=>effects().slice(before).some(e=>e.includes('/members/'+z+'/'))));}
  check('three departures in one burst: one subject per pass, in event order, none skipped by the watermark',order.join()==='0,1,2'&&Zs.every(z=>members[z].length===0));}
 {reset();history(200);const Z=id(9000);character('zed',Z,'unbound',null);settle({subject:Z,role_id:FM,request_digest:D,...facts('Player-1-zed',7)});members[Z]=[FM];snapshot([]);
  let passes=0;while(members[Z].includes(FM)&&passes<10){passes++;await pass();clock+=301;}
  check('a departure without an event (an unbind) behind 200 historical subjects is found by the window walk in ceil(201/50) passes (documented bound)',
   !members[Z].includes(FM)&&passes===Math.ceil(201/F.FRESH_WALK_WINDOW));}
 // ===== tests review, minor: staff re-removal is for bans only; a left_pending main keeps its roles; the worst-case ban
 {reset();const Z=id(9000);character('zed',Z,'member','Player-1-Z');snapshot([{key:'zed',guid:'Player-1-Z',rank:4}]);
  settle({subject:Z,role_id:FM,request_digest:D,...facts('Player-1-Z',4)});settle({subject:Z,purpose:'staff_roster_rank',role_id:RL,...facts('Player-1-Z',4)});
  members[Z]=[FM,RL];seedState({h:0});leaves('zed',Z);
  await pass();const first=effects().slice();members[Z]=[FM,RL];for(let n=0;n<2;n++){clock+=301;await pass();}
  check('leave: the new member role and the bot-given Raid Leader are removed once; put back afterwards (MEE6, no ban) they stay, as .160 leaves Guild Member (documented)',
   first.join()===[path_('DELETE',Z,FM),path_('DELETE',Z,RL)].join()&&effects().length===2&&members[Z].join()===[FM,RL].join()
   &&count(`purpose='staff_removal_departure'`)===1&&count(`purpose='fresh_removal_departure'`)===1);}
 {reset();character('main',S,'left_pending','Player-1-M');character('alt',S,'member','Player-1-L');
  snapshot([{key:'main',guid:'Player-1-M',rank:0},{key:'alt',guid:'Player-1-L',rank:8}],{fill:50,exported:clock-3000});consume(S,'alt',clock-2800);
  settle({role_id:FM,request_digest:D,...facts('Player-1-M',0)});settle({purpose:'fresh_roster_rank',role_id:N[0],request_digest:D,...facts('Player-1-M',0)});
  settle({purpose:'staff_roster_rank',role_id:GL,...facts('Player-1-M',0)});members[S]=[FM,N[0],GL];snapshot([{key:'alt',guid:'Player-1-L',rank:8}],{fill:50});
  const r=await pass();
  check('a left_pending Guild Master main left out of one export keeps Guild Leader and the GM rank role: no desired=0 row, no DELETE',r.state==='done'&&count('desired=0')===0
   &&!effects().some(e=>e.startsWith('DELETE'))&&members[S].includes(GL)&&members[S].includes(N[0]));}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  for(const role of [GL,OFF,RL])settle({purpose:'staff_roster_rank',role_id:role,...facts('Player-1-A',2)});members[S]=[...ALL,GL,OFF,RL];
  const parent={...budget(40),limit:Math.max(0,cap.callLimit-F.LEGACY_BAN_ALLOWANCE)},r=await P.settleLaneBan(env,S,cap,parent);
  check('worst-case ban: 11 fresh and 3 bot-given staff roles cost exactly 19 of the 24 requests (one inventory, 14 DELETEs, one GET), nothing thrown',parent.limit===24
   &&r.state==='settled'&&r.removed===14&&r.attempts===19&&parent.attempts===19&&members[S].length===0);}
 // ===== correctness review: a spent staff row of a member gone from the Discord server (404) is read, not skipped
 {reset({FULL_RELEASE_ROLES:undefined});character('officer',S,'member','Player-1-O');const old=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');
  const k=spent({purpose:'staff_roster_rank',role_id:OFF,...facts('Player-1-O',2,old)});snapshot([{key:'officer',guid:'Player-1-O',rank:7}]);delete members[S];
  const r=await pass();
  check('P1-A: 404 and no longer current: the staff visit reads the spent row (one inventory, nothing else) and only stamps it; it stays unknown',cap.fresh==='absent'&&r.state==='done'
   &&row(k.id).state==='unknown'&&row(k.id).reason==='provider_outcome_unknown'&&row(k.id).checked_at===clock&&r.requests===4);
  clock+=301;snapshot([{key:'officer',guid:'Player-1-O',rank:7}]);const again=await pass();check('so no later wrap within FRESH_BACKOFF_SECONDS selects that subject again',again.state==='done'&&again.requests===0);}
 {reset({FULL_RELEASE_ROLES:undefined});character('officer',S,'member','Player-1-O');const snap=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');
  const k=spent({purpose:'staff_roster_rank',role_id:OFF,...facts('Player-1-O',2,snap)});delete members[S];await pass();
  check('404 while still current: the row is read and stamped for the backoff (it stays unknown)',row(k.id).state==='unknown'&&row(k.id).checked_at===clock);}
 // ===== correctness review: present fresh roles without a settled lane grant are confirmed once, with no request, then satisfied
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);consume(S,'alpha');
  for(const role of [FM,N[7]]){settle({purpose:role===FM?'fresh_roster_membership':'fresh_roster_rank',role_id:role,request_digest:D,created_at:clock-9000,expires_at:clock-8700,...facts('Player-1-A',7)});
   settle({purpose:'fresh_removal_ban',role_id:role,desired:0,reason:'removed',created_at:clock-8000,expires_at:clock-7700});}
  members[S]=[FM,N[7]]; // unbanned since, and MEE6 put both back from its stale copy
  const r=await pass();
  check('ban, settled removal, unban, MEE6 re-adds both: one grant visit confirms them with no PUT (attempts 0)',r.state==='done'&&effects().length===0
   &&count(`desired=1 AND attempts=0 AND state='settled' AND reason='fresh_server_confirmed'`)===2);
  clock+=301;snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);const again=await pass();
  check('afterwards grant debt counts the subject satisfied: no producer runs again (at most the presence screen)',again.state==='done'&&again.requests<=1&&effects().length===0
   &&!again.statements.includes(F.FRESH_SETTLED_ROLES)&&P.FRESH_QUEUE_STATEMENTS===7);}
 // ===== correctness review: after a switch to raid-leader, spent Officer rows are still read, so they never fence Raid Leader
 const raidWorld=()=>{reset({FULL_RELEASE_ROLES:undefined,STAFF_TEN_RANK_ROLES:'raid-leader'});character('lead',S,'member','Player-1-R');snapshot([{key:'lead',guid:'Player-1-R',rank:4}]);consume(S,'lead');members[S]=[];};
 {raidWorld();const k=spent({purpose:'staff_roster_rank',role_id:OFF,...facts('Player-1-R',2,1)});const r=await pass();
  check('P1-A: narrowed to raid-leader: the staff walk reads a spent Officer lane row (outside the managed set) and only stamps it (stays unknown)',cap.staff==='raid-leader'
   &&r.state==='done'&&row(k.id).state==='unknown'&&row(k.id).checked_at===clock);
  check('P1-A: as that Officer PUT may still land, it keeps fencing the Raid Leader grant: no PUT, no Raid Leader row, no request on Officer or Raid Leader',effects().length===0
   &&count(`purpose='staff_roster_rank' AND role_id='${RL}'`)===0&&!requests.some(q=>q.endsWith('/roles/'+OFF)||q.endsWith('/roles/'+RL)));}
 {raidWorld();const k=spent({purpose:'roster_privileged_rank',role_id:OFF,...facts('Player-1-R',2,1)});const r=await pass();
  check('P1-A: the same for a ten-rank old-purpose Officer row: never handed to .160 settleRoleIntent, only stamped; it keeps fencing Raid Leader (no PUT)',r.state==='done'
   &&row(k.id).state==='unknown'&&row(k.id).reason==='provider_outcome_unknown'&&row(k.id).checked_at===clock&&effects().length===0
   &&!r.statements.includes('SELECT r.*,(SELECT beta_window_id FROM verification_proofs p WHERE p.id=r.proof_id) AS beta_window_id FROM role_settlements r WHERE r.id=?1'));}
 // ===== correctness review: the DELETE spacing comes before the claim, so a cause withdrawn during it strands nothing
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);members[S]=[FM,N[7]];
  effectHook=method=>{if(method==='DELETE'){effectHook=null;setTimeout(()=>db.prepare('UPDATE members SET banned=0 WHERE discord_id=?').run(S),5);}};
  const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM,N[7]]}],budget(),{spacingMs:60});
  const second=db.prepare('SELECT * FROM role_settlements WHERE role_id=?').get(N[7]);
  check('an unban during the spacing after the first DELETE: the second row is never claimed (attempts 0), one DELETE only',effects().length===1&&second.attempts===0
   &&second.state==='pending'&&r.rows.some(x=>x.role===N[7]&&x.state==='held'&&x.reason==='removal_cause_withdrawn'));}
 // ===== correctness review: a caller reserve (the /queue route) comes off the self-reserved statement bound
 {reset();const tight=await pass('watcher',budget(40),{reserve:P.FRESH_SWEEP_STATEMENTS-P.FRESH_OPEN_STATEMENTS-P.FRESH_CLOSE_STATEMENTS+1});
  check('too little left after the reserve holds the pass before any statement',tight.state==='held'&&tight.reason==='statement_budget'&&tight.statements.length===0);
  const ok=await pass('watcher',budget(40),{reserve:26});check('with the /queue route reserve of 26 a pass runs within FRESH_SWEEP_STATEMENTS - 26',ok.state==='done'&&ok.counts.statements<=P.FRESH_SWEEP_STATEMENTS-26);}
 // ===== boundaries review: the staff lane never opens on a LINKS_NOT_BEFORE before the beta-reset cutoff (the twelve are granted then)
 {const base={GUILD_ID:G,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'fixture-only',ROLE_GUILD_LEADER:GL,ROLE_OFFICER:OFF,ROLE_RAID_LEADER:RL,QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',STAFF_TEN_RANK_ROLES:'true'};
  const early=F.captureLaneConfig({...base,LINKS_NOT_BEFORE:'1700000000'});
  check('staff with LINKS_NOT_BEFORE before the cutoff is held (links_not_before_before_cutoff) and its clock never opens',early.staff==='held'&&early.staffReason==='links_not_before_before_cutoff'
   &&!F.laneClock(early,1792000000).staff&&!F.laneClock(early,T).staff);
  const atCutoff=F.captureLaneConfig({...base,LINKS_NOT_BEFORE:String(F.FRESH_EPOCH_FLOOR)});
  check('at the cutoff itself the staff lane is open as configured',atCutoff.staff==='all'&&F.laneClock(atCutoff,F.FRESH_EPOCH_FLOOR).staff&&F.FRESH_EPOCH_FLOOR===policy.BETA_RESET_CUTOFF);}
 // ===== boundaries and tests reviews, minor: the raid sign-up button accepts the fresh member role only in configured mode
 {const CH=id(70),community={SITE_GUILD_ID:G,INTROS_GUILD_ID:G,INTROS_CHANNELS:'raid-signups='+CH,SITE_HOST:'guild.example.test',EVENT_DISCORD_DELIVERY:'on',COMMUNITY_FEATURES:'events'};
  const buttons=load('community-event-buttons'),press=async(roles,extra={})=>{reset({...community,...extra});
   const res=await buttons.handleRaidComponent(env,{type:3,guild_id:G,channel_id:CH,data:{custom_id:'raid:rsvp:'+'A'.repeat(22)+':1:yes',component_type:2},member:{user:{id:S,username:'s'},roles}});
   return JSON.stringify(await res.json());};
  const refused=/Raid sign-ups are for verified guild members/,passedGate=/Sign in on the guild site once/;
  check('configured: a member holding only the fresh member role passes the member-role gate of a raid RSVP',passedGate.test(await press([FM])));
  check('unconfigured: the same member is refused exactly as .160 refuses them',refused.test(await press([FM],{FULL_RELEASE_ROLES:undefined,STAFF_TEN_RANK_ROLES:undefined})));
  check('the beta Guild Member role passes in both modes',passedGate.test(await press([OLD]))&&passedGate.test(await press([OLD],{FULL_RELEASE_ROLES:undefined,STAFF_TEN_RANK_ROLES:undefined})));}
 // ===== tests review, minor: no walk text scans a table that grows with history (EXPLAIN on schema.sql; D1 rows_read stays an activation gate)
 {reset();const BASE=/SCAN (characters|roster_snapshots|roster_members|audit|role_settlements|members|pending|privacy_subjects|rename_holds)(?![a-z_])/;
  const plan=sql=>db.prepare('EXPLAIN QUERY PLAN '+sql).all(...Array(F.maxBindIndex(sql)).fill(null)).map(x=>x.detail);
  const walks={grant:F.GRANT_DEBT_SELECT,staff:F.STAFF_WALK_SELECT,presence:F.PRESENCE_WALK_SELECT,departure:F.departureWalkSelectSql(),single:F.departureWalkSelectSql(true),events:P.FRESH_DEPARTURE_EVENTS_SELECT};
  const scanning=Object.entries(walks).filter(([,sql])=>plan(sql).some(d=>BASE.test(d))).map(([k])=>k);
  check('no walk or event window scans a base table (each reads its fixed window through an index first)',scanning.length===0);
  const current=plan('SELECT 1 WHERE '+F.LANE_ROSTER_CURRENT).filter(d=>BASE.test(d));
  check('LANE_ROSTER_CURRENT keeps exactly the one known scan it inherits from .160 :77 (characters by guid has no index)',current.length===1&&current[0]==='SCAN characters');}
 // ===== P1-B (Codex 22:44 UTC): the legacy privileged producer and the lane staff producer never both reach the staff role IDs.
 // Every configuration of STAFF_TEN_RANK_ROLES x QR_PRIVILEGED_RANK_MAPPING_ENABLED x QR_RANK_MAPPING_ENABLED (a beta-five map when
 // "true"): the REAL .160 roster producer (queueRosterRankRoles, role-settlements.ts :108-127) runs on a current ten-rank and on a
 // current beta-five export of a verified Officer, and the lane capture is taken from the same environment.
 {const QRMAP=JSON.stringify({profile:'beta-five',roles:[id(301),id(302),id(303),id(304),id(305)]}),matrix=[];
  const legacyStaffRows=async(extra,beta)=>{reset({FULL_RELEASE_ROLES:undefined,...extra});character('officer',S,'member','Player-1-O');
   const snap=beta?snapshot([{key:'officer',guid:'Player-1-O',rank:1}],{beta:true}):snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);
   try{await R.queueRosterRankRoles(env,S,snap,null);}catch{/* refused: unreachable for this profile */}
   return count(`purpose IN('roster_privileged_rank','verified_privileged_rank') AND role_id IN('${GL}','${OFF}','${RL}')`);};
  for(const staff of ['true','raid-leader'])for(const priv of [undefined,'','false','true'])for(const rank of [undefined,'false','true']){
   const extra={STAFF_TEN_RANK_ROLES:staff,QR_PRIVILEGED_RANK_MAPPING_ENABLED:priv,QR_RANK_MAPPING_ENABLED:rank,QR_NATIVE_ROLE_MAP:rank==='true'?QRMAP:undefined};
   const ten=await legacyStaffRows(extra,false),beta=await legacyStaffRows(extra,true); // cap: this environment's capture (reset)
   matrix.push({staff,priv,rank,ten,beta,mode:cap.staff,reason:cap.staffReason});}
  check('P1-B matrix (24 configurations): the staff lane is active exactly when QR_PRIVILEGED_RANK_MAPPING_ENABLED is not "true", else held legacy_privileged_producer_reachable',
   matrix.length===24&&matrix.every(x=>x.priv==='true'?x.mode==='held'&&x.reason==='legacy_privileged_producer_reachable':x.mode===(x.staff==='true'?'all':'raid-leader')));
  check('P1-B matrix: whenever the lane staff producer is active, the legacy producer writes no staff-ID row on a ten-rank or a beta-five export',
   matrix.filter(x=>x.mode!=='held').every(x=>x.ten===0&&x.beta===0));
  check('P1-B matrix: "true" reaches a staff ID under every QR_RANK_MAPPING_ENABLED (ten-rank, or beta-five under a beta-five map), so no narrower exclusion is sound',
   matrix.filter(x=>x.priv==='true').every(x=>x.ten+x.beta>0)&&matrix.some(x=>x.priv==='true'&&x.rank==='true'&&x.ten===0&&x.beta>0)&&matrix.some(x=>x.priv==='true'&&x.rank!=='true'&&x.ten>0));}
 // P1-B, the lane-then-legacy ordering: an unresolved lane Officer PUT, then the legacy producer
 {const lanePut={purpose:'staff_roster_rank',role_id:OFF,...facts('Player-1-O',2,1)};
  reset({FULL_RELEASE_ROLES:undefined});character('officer',S,'member','Player-1-O');const s1=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);spent(lanePut);
  let refused=false;try{await R.queueRosterRankRoles(env,S,s1,null);}catch{refused=true;}
  check('P1-B lane-then-legacy, supported configuration: after an unresolved lane Officer PUT the legacy producer is unreachable (refused, no legacy rank row)',
   cap.staff==='all'&&refused&&count(`purpose IN('roster_native_rank','roster_privileged_rank','verified_native_rank','verified_privileged_rank')`)===0);
  reset({FULL_RELEASE_ROLES:undefined,QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true'});character('officer',S,'member','Player-1-O');const s2=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);spent(lanePut);
  try{await R.queueRosterRankRoles(env,S,s2,null);}catch{/* counted below */}
  check('P1-B: with "true" the legacy fence (ROSTER_CURRENT :79-80) does not see that lane PUT and writes an Officer row, which is why that configuration holds the staff lane',
   count(`purpose='roster_privileged_rank' AND role_id='${OFF}'`)===1&&cap.staff==='held'&&cap.staffReason==='legacy_privileged_producer_reachable');}
 check('no visit and no pass failed anywhere in this file',failures===0);
 check('every completed pass ran no more statements than it reserved (FRESH_QUEUE_STATEMENTS = 7 and the event window included)',passes>=30&&overruns===0);
 check('no request anywhere named a twelve role',!TWELVE.some(t=>requests.some(q=>q.endsWith('/'+t))));
 Date.now=realNow;console.log(`full_release_review_test: ${passed} checks passed`);
})().catch(e=>{console.error(e);process.exit(1);});

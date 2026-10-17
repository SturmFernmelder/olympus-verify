// Fresh-role lane consumer (Revision 4, stage 2): the lane block appended to src/role-settlements.ts, with the actual
// source and native SQLite over the REAL schema.sql and a controlled clock. Only Discord is simulated; every ID is
// synthetic except the twelve, which are read from beta-reset-policy.ts. Covers the shared inventory, the producers,
// claim/admission/receipt, compensation, M2, the major-4 escape, the twelve refusal and lane removals.
//   node tests/full_release_lane_consumer_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');globalThis.crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..'),cache={},schema=fs.readFileSync(path.join(root,'schema.sql'),'utf8');
let provider=async()=>{throw Error('provider calls forbidden before synthetic handler setup');};
globalThis.fetch=(...args)=>provider(...args);
function load(name){if(name==='node:async_hooks'||name==='./node:async_hooks')return require('node:async_hooks');name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const js=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(m,m.exports,p=>load(p));return m.exports;}
const R=load('role-settlements'),F=load('full-release-roles'),policy=load('beta-reset-policy'),LB=load('lane-budget');
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const NATIVE=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const id=n=>String(800000000000000000n+BigInt(n));
const G=id(1),BOT=id(2),BOTROLE=id(3),OFF=id(4),OLD=id(5),GL=id(6),RL=id(8),BLOCKER=id(9),S=id(10),HIGH=id(11),OLDN=id(150),FM=id(100),N=Array.from({length:10},(_,i)=>id(101+i));
const TWELVE=policy.BETA_RESET_ROLE_IDS[0],E=1793833200,T=E+86400;
const cfgRaw=(o={})=>JSON.stringify({version:1,epoch:'olympus-full-release-test',epochStart:E,grants:true,membership:FM,native:N,...o});
let clock=T,db,env,cap,members,requests,log,effectHook,memberHook,lostWrite,positions,extraRoles;
const realNow=Date.now;Date.now=()=>clock*1000;
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const inventory=()=>[{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:50,permissions:'268435456',managed:false},{id:FM,position:2,permissions:'0',managed:false},
 ...N.map((r,i)=>({id:r,position:3+i,permissions:'0',managed:false})),{id:GL,position:20,permissions:'1024',managed:false},{id:OFF,position:19,permissions:'1024',managed:false},
 {id:RL,position:18,permissions:'1024',managed:false},{id:BLOCKER,position:1,permissions:'0',managed:false},{id:TWELVE,position:1,permissions:'0',managed:false},{id:HIGH,position:60,permissions:'0',managed:false},...extraRoles]
 .map(r=>positions[r.id]===undefined?r:{...r,position:positions[r.id]});
provider=async(input,init={})=>{const p=new URL(String(input)).pathname,method=init.method||'GET';requests.push(method+' '+p);
 if(p.endsWith('/users/@me'))return json({id:BOT});
 if(p.endsWith('/roles')&&method==='GET')return json(inventory());
 const m=p.match(/\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m||m[1]!==G)throw Error('unexpected provider path '+p);
 if(m[3]){if(effectHook)await effectHook(method,m[2],m[3]);const cur=members[m[2]]||[];members[m[2]]=method==='PUT'?[...new Set([...cur,m[3]])]:cur.filter(x=>x!==m[3]);
  if(lostWrite)throw Error('synthetic lost provider response');return new Response(null,{status:204});}
 if(memberHook){const f=memberHook;memberHook=null;await f(m[2]);}
 if(!members[m[2]])return new Response('{}',{status:404});return json({user:{id:m[2]},roles:members[m[2]]});};
function d1(){function prepare(sql){let args=[];const q={sql,bind(...values){args=values;return q;},async first(){log.push(sql);return db.prepare(sql).get(...args)||null;},
 async all(){log.push(sql);return {results:db.prepare(sql).all(...args)};},async run(){return q.exec();},
 exec(){log.push(sql);const stmt=db.prepare(sql);if(/^\s*(SELECT|WITH)/.test(sql)||/RETURNING/.test(sql))return {results:stmt.all(...args),meta:{changes:0}};const r=stmt.run(...args);return {results:[],meta:{changes:Number(r.changes)}};}};return q;}
 return {prepare,batch:async rows=>{db.exec('BEGIN');try{const out=rows.map(x=>x.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};}
const budget=(limit=40)=>({limit,attempts:0,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false});
function reset(extra={}){clock=T;db=new DatabaseSync(':memory:');db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unsupported synthetic clock');return String(clock);});db.exec(schema);
 env={DB:d1(),GUILD_ID:G,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'fixture-only',ROLE_GUILD_MEMBER:OLD,ROLE_GUILD_LEADER:GL,ROLE_OFFICER:OFF,ROLE_RAID_LEADER:RL,BLOCKING_ROLE_IDS:BLOCKER,
  FULL_RELEASE_ROLES:cfgRaw(),STAFF_TEN_RANK_ROLES:'true',LINKS_NOT_BEFORE:String(E),ROSTER_MIN_MEMBERS:'3',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',...extra}; // P1-B: the supported staff configuration
 for(const [k,v] of Object.entries(env))if(v===undefined)delete env[k];
 cap=F.captureLaneConfig(env);members={[BOT]:[BOTROLE]};requests=[];log=[];effectHook=null;memberHook=null;lostWrite=false;positions={};extraRoles=[];}
function character(key,discord,status,guid){db.prepare('INSERT OR IGNORE INTO members(discord_id) VALUES(?)').run(discord);db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,?,?,?)').run(key,key,discord,status,T-90*86400,guid);}
function snapshot(rows,{fill=3,exported=clock-60}={}){const all=rows.concat(Array.from({length:fill},(_,i)=>({key:'filler'+i,guid:'Player-1-F'+i,rank:7})));
 const s=Number(db.prepare("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?,?,'test',?,1,1)").run(exported,clock,all.length).lastInsertRowid);
 for(const r of all)db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)').run(s,r.key,r.key,NATIVE[r.rank],r.rank,r.guid);return s;}
function consume(discord,key,at=clock-500,ack=true){const p=Number(db.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,consumed_at,consumed_source) VALUES(?,?,?,?,?,?,'whisper')").run(discord,key,key,at-60,at+600,at).lastInsertRowid);
 if(ack)db.prepare("INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,'watcher','verify.confirmed',?,?)").run(at+5,key,JSON.stringify({discordId:discord}));return p;}
const hex=()=>require('node:crypto').randomBytes(16).toString('hex');
const TOKEN32=value=>typeof value==='string'&&/^[0-9a-f]{32}$/.test(value);
function settle(o){const r={id:hex(),subject:S,purpose:'fresh_roster_membership',guild_id:G,role_id:FM,desired:1,state:'settled',reason:'fixture',attempts:1,created_at:clock-400,expires_at:clock-100,claim_nonce:hex(),
  subject_generation:null,request_digest:null,roster_id:null,native_guid:null,native_profile:null,native_rank:null,native_rank_name:null,checked_at:null,...o};
 db.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,checked_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id,r.subject,r.purpose,r.guild_id,r.role_id,r.desired,r.state,r.reason,r.attempts,r.created_at,r.expires_at,r.claim_nonce,r.subject_generation,r.request_digest,r.roster_id,r.native_guid,r.native_profile,r.native_rank,r.native_rank_name,r.checked_at);return r;}
const row=rid=>db.prepare('SELECT * FROM role_settlements WHERE id=?').get(rid);
const count=(where='1=1')=>db.prepare('SELECT COUNT(*) AS n FROM role_settlements WHERE '+where).get().n;
const effects=()=>requests.filter(r=>/^(PUT|DELETE) /.test(r));
const writes=()=>log.filter(s=>/^\s*(UPDATE|INSERT|DELETE)/i.test(s));
const facts=(o={})=>({roster_id:o.roster??null,native_guid:'Player-1-A',native_profile:'ten-rank',native_rank:7,native_rank_name:'Member',...o.extra});
function grantWorld(){reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);const pick=consume(S,'alpha');members[S]=[];return {snap,pick};}
// One source SQL boundary per fixture. The underlying statement really executes before an after hook can lose its reply.
function interceptFirst(matches,{before,after}={}){const prepare=env.DB.prepare;let used=false;env.DB.prepare=sql=>{const q=prepare(sql),first=q.first.bind(q);
 q.first=async()=>{if(used||!matches(sql))return first();used=true;if(before)await before();const r=await first();if(after)await after(r);return r;};return q;};}
const ALL_FRESH=()=>[FM,...N];
(async()=>{
 const D=await F.laneDigest(cfgRaw());
 // --- configuration: the capture used by every test, and an unconfigured capture that admits nothing
 {reset();check('fixture capture: fresh grants and every staff role are open at T',cap.configured&&cap.fresh==='grants'&&cap.staff==='all'&&F.laneClock(cap,T).grants&&F.laneClock(cap,T).staff);
  const none=F.captureLaneConfig({...env,FULL_RELEASE_ROLES:'',STAFF_TEN_RANK_ROLES:undefined});
  const r=await R.settleLaneIntent(env,none,'a'.repeat(32),true,budget());const rem=await R.settleLaneRemoval(env,none,S,null,[{purpose:'fresh_removal_ban',roles:[FM]}],budget());
  const q=await R.queueFreshRosterRoles(env,none,S,1,null,{kind:'screen',member:{roles:[]},verdicts:new Map(),cosmetic:new Map(),blocked:false});
  check('unconfigured (both variables absent or ""): no lane statement and no request at all',!none.configured&&r.reason==='invalid_operation'&&rem.state==='held'&&q.state==='held'&&log.length===0&&requests.length===0);}
 // --- the shared inventory read
 {reset();members[S]=[FM,N[7]];const b=budget();
  const o=await R.laneQualifyEach(env,b,S,[FM,N[7],GL,HIGH,OLDN]);
  check('laneQualifyEach: four GETs for the whole role set, counted on the budget',requests.length===4&&b.attempts===4&&requests.every(x=>x.startsWith('GET ')));
  check('verdicts per role: ok, ok, ok, held above the bot, missing',o.kind==='inventory'&&o.verdicts.get(FM)==='ok'&&o.verdicts.get(N[7])==='ok'&&o.verdicts.get(GL)==='ok'&&o.verdicts.get(HIGH)==='held'&&o.verdicts.get(OLDN)==='missing');
  check('cosmetic means permissions "0"; the member roles are copied and frozen',o.cosmetic.get(FM)===true&&o.cosmetic.get(GL)===false&&o.member.roles.join()===[FM,N[7]].join()&&Object.isFrozen(o.member.roles)&&!o.blocked);
  members[S]=[FM,BLOCKER];check('a blocker on the observed member is reported',(await R.laneQualifyEach(env,budget(),S,[FM])).blocked===true);
  members[S]=[HIGH];await assert.rejects(R.laneQualifyEach(env,budget(),S,[FM]),/target_hierarchy/);check('a member above the bot holds the whole subject (target_hierarchy)',true);
  await assert.rejects(R.laneQualifyEach(env,budget(),S,[FM,FM]),/role_configuration/);await assert.rejects(R.laneQualifyEach(env,budget(),S,[]),/role_configuration/);check('a duplicate or empty role set is refused before any request',true);
  requests=[];delete members[S];const s=await R.laneMemberRead(env,budget(),S);check('laneMemberRead: one GET; 404 observes a non-member',requests.length===1&&s.kind==='screen'&&s.member===null);}
 // --- producer, claim, admission, effect and receipt
 {const {snap,pick}=grantWorld(),b=budget();
  const o=await R.laneQualifyEach(env,b,S,ALL_FRESH());const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  check('producer: membership and the wanted rank (Member) are queued with the acknowledged pick',q.state==='queued'&&q.ids.length===2&&q.pending===pick&&q.guid==='Player-1-A'
   &&row(q.ids[0]).role_id===FM&&row(q.ids[0]).purpose==='fresh_roster_membership'&&row(q.ids[1]).role_id===N[7]&&row(q.ids[1]).purpose==='fresh_roster_rank');
  check('producer rows carry D, the snapshot, the ten-rank facts and a 300 s window',q.ids.every(x=>{const r=row(x);return r.request_digest===D&&r.roster_id===snap&&r.native_profile==='ten-rank'&&r.native_rank===7&&r.native_rank_name==='Member'&&r.state==='pending'&&r.attempts===0&&r.expires_at-r.created_at===300;}));
  const again=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);check('an immediate second producer call adopts the same two rows (no duplicate pending row)',again.ids.join()===q.ids.join()&&count("state='pending'")===2);
  const out=[];for(const x of q.ids)out.push(await R.settleLaneIntent(env,cap,x,false,b,o,{pending:q.pending}));
  check('consumer: both grants settle effect_and_current_server_confirmed',out.every(r=>r.state==='settled'&&r.reason==='effect_and_current_server_confirmed'));
  check('one PUT and one confirming GET each, in plan order, after the one shared inventory read (8 requests in all)',requests.length===8&&effects().join()===['PUT /api/v10/guilds/'+G+'/members/'+S+'/roles/'+FM,'PUT /api/v10/guilds/'+G+'/members/'+S+'/roles/'+N[7]].join()&&b.attempts===8);
  check('receipts keep the claim: attempts 1, a nonce, settled; the member holds both roles',q.ids.every(x=>{const r=row(x);return r.state==='settled'&&r.attempts===1&&/^[0-9a-f]{32}$/.test(r.claim_nonce);})&&members[S].includes(FM)&&members[S].includes(N[7]));
  requests=[];const repeat=await R.settleLaneIntent(env,cap,q.ids[0],false,b,o);check('a settled row is reported as settled with no request and no write',repeat.state==='settled'&&requests.length===0);
  const o2=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());check('with both roles present the producer has nothing to queue',(await R.queueFreshRosterRoles(env,cap,S,snap,null,o2)).state==='nothing');}
 {const {snap}=grantWorld();const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S));requests=[];
  const low=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(7));check('without a covering inventory a grant needs 8 requests left (:280): held with no request',low.reason==='role_request_budget'&&requests.length===0&&row(q.ids[0]).state==='pending');
  const b=budget(8),r=await R.settleLaneIntent(env,cap,q.ids[0],false,b);check('with exactly 8: one qualify (4 GETs), the PUT and the confirming GET',r.state==='settled'&&requests.length===6&&b.attempts===6);}
 {const {snap}=grantWorld(),parent=budget(40),child=LB.laneChildBudget(parent,20);const o=await R.laneQualifyEach(env,child,S,ALL_FRESH());
  const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);for(const x of q.ids)await R.settleLaneIntent(env,cap,x,false,child,o,{pending:q.pending});
  check('a laneChildBudget debits the shared parent for every request',child.attempts===8&&parent.attempts===8&&parent.calls===child.calls);}
 // --- provider failure and the configuration witness
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);lostWrite=true;
  const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  check('a lost PUT response leaves the row unknown provider_outcome_unknown (attempts 1, never re-sent)',r.state==='unknown'&&r.reason==='provider_outcome_unknown'&&row(q.ids[0]).state==='unknown'&&row(q.ids[0]).attempts===1&&effects().length===1);
  lostWrite=false;requests=[];const again=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o);check('inside its claim window the spent row is not touched again',again.reason==='lane_effect_in_flight'&&requests.length===0);}
 {const {snap}=grantWorld(),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S));requests=[];
  memberHook=()=>{env.STAFF_TEN_RANK_ROLES='raid-leader';};const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget());
  check('a configuration change seen before the effect holds lane_configuration_changed: no PUT, no claim',r.state==='held'&&r.reason==='lane_configuration_changed'&&effects().length===0&&row(q.ids[0]).state==='pending'&&row(q.ids[0]).attempts===0);}
 // --- compensation after a landed grant that lost admission
 for(const [label,hook] of [['a ban landing during the PUT',()=>db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S)],['a blocker added during the PUT',()=>{members[S]=[...members[S],BLOCKER];}],
  ['a configuration change during the PUT',()=>{env.FULL_RELEASE_ROLES=cfgRaw({grants:false});}]]){
  const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);requests=[];
  effectHook=async(method)=>{if(method==='PUT')await hook();};const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  const child=db.prepare("SELECT * FROM role_settlements WHERE purpose='grant_compensation'").get();
  check(label+': compensateGrant removes it (PUT, GET, DELETE, GET); parent held removed_after_admission_changed, child settled removed',r.state==='held'&&r.reason==='removed_after_admission_changed'
   &&requests.length===4&&effects().join()===['PUT','DELETE'].map(m=>m+' /api/v10/guilds/'+G+'/members/'+S+'/roles/'+FM).join()&&row(q.ids[0]).reason==='removed_after_admission_changed'
   &&child&&child.state==='settled'&&child.reason==='removed'&&child.request_digest===q.ids[0]&&child.role_id===FM&&!members[S].includes(FM));}
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  effectHook=async(method)=>{if(method==='PUT')db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);else throw Error('synthetic lost DELETE');};
  const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});const child=db.prepare("SELECT * FROM role_settlements WHERE purpose='grant_compensation'").get();
  check('a lost compensation DELETE leaves parent and child unknown compensation_unknown',r.reason==='compensation_unknown'&&row(q.ids[0]).state==='unknown'&&child.state==='unknown');
  check('inside its claim window the compensated parent is not touched again',(await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o)).reason==='lane_effect_in_flight');
  clock=T+400;members[S]=[];effectHook=null;requests=[];const screen=await R.laneMemberRead(env,budget(),S);
  const read=await R.readLaneSpentRows(env,cap,S,screen,budget());
  check('P1-A: after expiry an absent read never discharges the compensation: child and parent stay unknown, both stamped, GET-free, no DELETE',requests.length===1
   &&row(child.id).state==='unknown'&&row(child.id).reason==='compensation_unknown'&&row(child.id).checked_at===clock&&row(q.ids[0]).state==='unknown'&&row(q.ids[0]).checked_at===clock
   &&read.outcomes.length===1&&read.outcomes[0].settlement.state==='unknown'&&read.outcomes[0].settlement.reason==='compensation_absent_unresolved'&&effects().length===0);
  check('P1-A: the physical target stays fenced (the lost compensation DELETE could still remove a successor grant)',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,FM,'x').ok===0);}
 // --- Spent PUTs observed present stay uncertain: a GET is not their own request acknowledgement.
 {const {snap,pick}=grantWorld();
  settle({role_id:FM,request_digest:D,...facts({roster:snap})});
  const rank=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[FM,N[7]];const b=budget(),o=await R.laneQualifyEach(env,b,S,ALL_FRESH());requests=[];log=[];
  const read=await R.readLaneSpentRows(env,cap,S,o,b);
  check('(a) membership settled, rank unknown-but-present: the reader stamps the rank without discharging its lost PUT',read.outcomes.length===1&&read.outcomes[0].settlement.reason==='present_effect_requires_current_authority_or_manual_removal'
   &&row(rank.id).state==='unknown'&&row(rank.id).reason==='provider_outcome_unknown'&&row(rank.id).checked_at===clock&&requests.length===0&&b.attempts===4);
  check('M2 binds ?14 picked at reconcile time: the acknowledged consumption',log.some(s=>s===F.LANE_PICK_ACCEPTED)&&pick>0&&row(rank.id).attempts===1);}
 {const {snap}=grantWorld();
  const m=settle({role_id:FM,state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'dispatching',reason:'admitted_before_effect',request_digest:D,...facts({roster:snap})});
  members[S]=[FM,N[7]];const o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];
  const read=await R.readLaneSpentRows(env,cap,S,o,budget());
  check('(b) both unknown-but-present: both retain exact uncertainty and are stamped with no request',read.outcomes.length===2&&[m,k].every(x=>row(x.id).state===x.state&&row(x.id).reason===x.reason&&row(x.id).claim_nonce===x.claim_nonce&&row(x.id).checked_at===clock)&&requests.length===0);}
 {const {snap}=grantWorld();const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[N[7]];const b=budget(),screen=await R.laneMemberRead(env,b,S);const read=await R.readLaneSpentRows(env,cap,S,screen,b);
  check('a spent PUT from a screen read qualifies once (minor 11): 1 + 4 GETs, then stamps without discharge',read.outcomes[0].settlement.reason==='present_effect_requires_current_authority_or_manual_removal'&&requests.length===5&&row(k.id).state==='unknown'&&row(k.id).checked_at===clock);}
 {const {snap}=grantWorld();const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[N[7],BLOCKER];const o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];
  const r=await R.settleLaneIntent(env,cap,k.id,true,budget(),o);
  check('M2 refuses a present role on a blocked member: held, the row stays unknown, no request',r.reason==='inventory_hierarchy_or_server_hold'&&row(k.id).state==='unknown'&&requests.length===0);
  members[S]=[];const o2=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];const r2=await R.settleLaneIntent(env,cap,k.id,true,budget(),o2);
  check('absent while current stays unknown (:298) and is stamped for the backoff',r2.state==='unknown'&&r2.reason==='explicit_reconciliation_required'&&row(k.id).state==='unknown'&&row(k.id).checked_at===clock&&requests.length===0);}
 {const {snap}=grantWorld();const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'dispatching',reason:'dispatching',request_digest:D,created_at:clock-10,expires_at:clock+290,...facts({roster:snap})});
  members[S]=[N[7]];const o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];log=[];
  const read=await R.readLaneSpentRows(env,cap,S,o,budget()),direct=await R.settleLaneIntent(env,cap,k.id,true,budget(),o);
  check('a row inside its claim window is never read or written by the reader or the consumer',read.outcomes.length===0&&direct.reason==='lane_effect_in_flight'&&writes().length===0&&row(k.id).state==='dispatching');}
 // --- major 4: a spent row closes by a GET-only outcome read by exact tuple after D or a fresh role ID changes
 {const {snap}=grantWorld();
  const replaced=settle({purpose:'fresh_roster_rank',role_id:OLDN,state:'unknown',reason:'provider_outcome_unknown',request_digest:'f'.repeat(64),...facts({roster:snap})});
  members[S]=[];requests=[];
  const held=await R.settleLaneIntent(env,cap,replaced.id,false,budget());
  check('outside reconcile a replaced role or old D is refused frozen_configuration_changed with no request or write',held.reason==='frozen_configuration_changed'&&requests.length===0&&row(replaced.id).state==='unknown');
  const r=await R.settleLaneIntent(env,cap,replaced.id,true,budget());
  check('P1-A: reconcileOnly outcome-reads the replaced (deleted) role with one qualify; absent, it is only stamped by tuple and stays unknown (no past_effect_absent)',
   r.state==='unknown'&&r.reason==='spent_absent_unresolved'&&requests.length===4&&effects().length===0
   &&row(replaced.id).state==='unknown'&&row(replaced.id).reason==='provider_outcome_unknown'&&row(replaced.id).checked_at===clock);
  check('P1-A: an expired source plus an absent GET keeps the physical target fenced',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,OLDN,'x').ok===0);}
 {const {snap}=grantWorld();
  const old=settle({role_id:FM,state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  env.FULL_RELEASE_ROLES=cfgRaw({grants:false});cap=F.captureLaneConfig(env);
  check('pausing grants changes D and leaves the lane in removals mode',cap.fresh==='removals');
  members[S]=[FM];const screen=await R.laneMemberRead(env,budget(),S);requests=[];
  const present=await R.settleLaneIntent(env,cap,old.id,true,budget(),screen);
  check('after a D change a present spent grant is not M2-confirmed: it stays unknown and is stamped (full validation stays for M2)',present.state==='unknown'
   &&present.reason==='present_effect_requires_current_authority_or_manual_removal'&&row(old.id).state==='unknown'&&row(old.id).checked_at===clock&&requests.length===0);
  members[S]=[];const gone=await R.laneMemberRead(env,budget(),S);requests=[];const absent=await R.readLaneSpentRows(env,cap,S,gone,budget());
  check('P1-A: observed absent through the reader (GET-free) it is only stamped and stays unknown: no past_effect_absent',absent.outcomes[0].settlement.state==='unknown'
   &&absent.outcomes[0].settlement.reason==='spent_absent_unresolved'&&row(old.id).state==='unknown'&&row(old.id).reason==='provider_outcome_unknown'&&row(old.id).checked_at===clock&&requests.length===0);
  check('P1-A: afterwards the physical target fence still holds',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,FM,'x').ok===0);}
 {const {snap}=grantWorld();
  const absentSpent=settle({role_id:FM,state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  const r=await R.settleLaneIntent(env,cap,absentSpent.id,true,budget(),{kind:'screen',member:{roles:[]},verdicts:new Map(),cosmetic:new Map(),blocked:false});
  check('an absent spent grant on a current intent stays unknown (no time bound is claimed)',r.reason==='explicit_reconciliation_required'&&row(absentSpent.id).state==='unknown');}
 // --- the twelve are never lane targets
 {const {snap}=grantWorld();
  const spentTwelve=settle({purpose:'fresh_roster_rank',role_id:TWELVE,state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  const pendingTwelve=settle({purpose:'fresh_roster_membership',role_id:TWELVE,state:'pending',reason:'awaiting_dispatch',attempts:0,claim_nonce:null,created_at:clock,expires_at:clock+300,request_digest:D,...facts({roster:snap})});
  const old160=settle({purpose:'roster_native_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',...facts({roster:snap})});
  members[S]=[TWELVE,N[7]];requests=[];log=[];
  const a=await R.settleLaneIntent(env,cap,spentTwelve.id,true,budget()),bb=await R.settleLaneIntent(env,cap,pendingTwelve.id,false,budget()),c=await R.settleLaneIntent(env,cap,old160.id,true,budget());
  check('a lane row naming a twelve role is refused frozen_configuration_changed, spent or pending, with no request',a.reason==='frozen_configuration_changed'&&bb.reason==='frozen_configuration_changed'&&requests.length===0);
  check('a .160 purpose is never consumed by the lane (operation_not_current)',c.reason==='operation_not_current');
  check('the refusals read only the original facts: no write at all',writes().length===0&&[spentTwelve,pendingTwelve,old160].every(x=>row(x.id).state===x.state));
  const screen={kind:'screen',member:{roles:[]},verdicts:new Map(),cosmetic:new Map(),blocked:false};
  const read=await R.readLaneSpentRows(env,cap,S,screen,budget());
  check('the spent-row reader holds a twelve row and writes nothing',read.outcomes.some(x=>x.id===spentTwelve.id&&x.settlement.reason==='frozen_configuration_changed')&&row(spentTwelve.id).state==='unknown'&&writes().length===0);
  db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  const rem=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM,TWELVE]}],budget(),{spacingMs:0});
  check('a lane removal plan naming a twelve role is refused whole, before any statement or request',rem.reason==='frozen_configuration_changed'&&requests.length===0&&writes().length===0&&count("purpose LIKE 'fresh_removal%'")===0);}
 // --- lane removals: a ban removes fresh roles and bot-given staff roles, again after a re-add (M1, owner decision)
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  settle({purpose:'staff_roster_rank',role_id:OFF,request_digest:null,created_at:clock-5000,expires_at:clock-4700,...facts({extra:{native_rank:2,native_rank_name:'Officer'}})});
  members[S]=[FM,N[7],OFF,RL];const b=budget();
  const groups=[{purpose:'fresh_removal_ban',roles:[FM,N[7]]},{purpose:'staff_removal_ban',roles:[OFF,RL]}];
  const r=await R.settleLaneRemoval(env,cap,S,null,groups,b,{spacingMs:0});
  const del=role=>'DELETE /api/v10/guilds/'+G+'/members/'+S+'/roles/'+role;
  check('ban: one inventory, DELETE membership, rank, then the bot-given Officer, one confirming GET (8 requests)',requests.length===8&&effects().join()===[del(FM),del(N[7]),del(OFF)].join()&&b.attempts===8&&r.dispatched===3);
  check('ban: three rows settled removed; the hand-given Raid Leader is never planned or touched',r.rows.filter(x=>x.state==='settled'&&x.reason==='removed').length===3&&r.rows.some(x=>x.role===RL&&x.reason==='removal_intent_held')
   &&members[S].join()===RL&&count(`role_id='${RL}'`)===0);
  members[S]=[FM,OFF,RL];requests=[];
  const again=await R.settleLaneRemoval(env,cap,S,null,groups,budget(),{spacingMs:0});
  check('M1: roles re-added after a settled removal (MEE6) get NEW rows and are removed again, Officer included while the ban stands',again.dispatched===2&&count(`purpose='fresh_removal_ban' AND role_id='${FM}' AND state='settled'`)===2
   &&count(`purpose='staff_removal_ban' AND role_id='${OFF}' AND state='settled'`)===2&&members[S].join()===RL);
  members[S]=[RL];requests=[];const none=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM]}],budget(),{spacingMs:0});
  check('nothing present: an absent receipt and no DELETE',none.rows.length===1&&none.rows[0].reason==='absent'&&effects().length===0);}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);members[S]=[FM];
  memberHook=()=>{db.prepare('UPDATE members SET banned=0 WHERE discord_id=?').run(S);};
  const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM]}],budget(),{spacingMs:0});
  check('an unban between the pre-check and the INSERT writes no row and sends no DELETE',effects().length===0&&count()===0&&r.state==='held');}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);members[S]=[FM,N[7]];lostWrite=true;
  const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM,N[7]]}],budget(),{spacingMs:0});
  const spent=db.prepare("SELECT * FROM role_settlements WHERE role_id=?").get(FM);
  check('a lost DELETE marks that row unknown and stops the burst (the rank row is left unclaimed)',effects().length===1&&spent.state==='unknown'&&spent.attempts===1
   &&r.rows.some(x=>x.role===N[7]&&x.reason==='provider_or_confirmation_unknown'&&x.state==='held')&&db.prepare('SELECT attempts FROM role_settlements WHERE role_id=?').get(N[7]).attempts===0);
  lostWrite=false;clock=T+400;requests=[];const screen=await R.laneMemberRead(env,budget(),S);const read=await R.readLaneSpentRows(env,cap,S,screen,budget());
  check('P1-A: after expiry the spent removal is read and never DELETEd again; absent, it is only stamped and stays unknown (the lost DELETE may still land)',requests.length===1&&effects().length===0
   &&row(spent.id).state==='unknown'&&row(spent.id).reason==='provider_or_confirmation_unknown'&&row(spent.id).checked_at===clock&&read.outcomes.length===1&&read.outcomes[0].settlement.reason==='spent_absent_unresolved');
  check('P1-A: the removal target stays fenced, so no later grant or removal of it can be claimed',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,FM,'x').ok===0);}
 {reset();character('alpha',S,'member','Player-1-A');const snap=snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);members[S]=[FM,BLOCKER];
  const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_blocking_role',roles:[FM]}],budget(),{rosterId:snap,spacingMs:0});
  const blk=db.prepare("SELECT * FROM role_settlements WHERE purpose='fresh_removal_blocking_role'").get();
  check('blocking: the blocker is re-read right before the claim (:494), the membership role is removed, the row keys the backoff by roster',r.dispatched===1&&requests.length===7&&blk.state==='settled'&&blk.roster_id===snap);
  members[S]=[FM];requests=[];const no=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_blocking_role',roles:[FM]}],budget(),{rosterId:snap,spacingMs:0});
  check('without a blocker on the shared read the cause is withdrawn: no row, no DELETE',no.state==='held'&&effects().length===0&&count("purpose='fresh_removal_blocking_role'")===1);
  check('a rename or blocking removal of anything but the fresh membership role is refused',(await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_rename_hold',roles:[N[7]]}],budget())).reason==='frozen_configuration_changed');}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);
  settle({purpose:'fresh_roster_rank',role_id:OLDN,request_digest:'f'.repeat(64),created_at:clock-9000,expires_at:clock-8700,...facts({})});members[S]=[OLDN];extraRoles=[{id:OLDN,position:5,permissions:'0',managed:false}];
  const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[OLDN,id(151)]}],budget(),{spacingMs:0});
  check('a replaced fresh ID is removed only with fresh grant custody (historical IDs included, unknown IDs dropped)',r.dispatched===1&&effects().length===1&&effects()[0].endsWith('/roles/'+OLDN)&&count(`role_id='${id(151)}'`)===0);}
 // --- staff producer and consumer; a present role confirms without a request
 {reset();character('officer',S,'member','Player-1-O');const snap=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[];
  const b=budget(),o=await R.laneQualifyEach(env,b,S,cap.managedStaff.slice());const q=await R.queueStaffRankRoles(env,cap,S,snap,null,o);
  check('staff producer: a verified ten-rank Officer gets the Officer role (staff_roster_rank, no D)',q.state==='queued'&&q.ids.length===1&&row(q.ids[0]).role_id===OFF&&row(q.ids[0]).request_digest===null&&row(q.ids[0]).purpose==='staff_roster_rank');
  const r=await R.settleLaneIntent(env,cap,q.ids[0],false,b,o,{pending:q.pending});
  check('staff consumer: PUT Officer settles effect_and_current_server_confirmed',r.reason==='effect_and_current_server_confirmed'&&members[S].includes(OFF));
  const lead=snapshot([{key:'officer',guid:'Player-1-O',rank:0}]);const o2=await R.laneQualifyEach(env,budget(),S,cap.managedStaff.slice());requests=[];
  const q2=await R.queueStaffRankRoles(env,cap,S,lead,null,o2);
  check('promoted to Guild Master: desired=0 Officer (bot custody, complete listing) before the Guild Leader grant',q2.ids.length===2&&row(q2.ids[0]).role_id===OFF&&row(q2.ids[0]).desired===0&&row(q2.ids[1]).role_id===GL&&row(q2.ids[1]).desired===1);
  const blocked=await R.settleLaneIntent(env,cap,q2.ids[1],false,budget(),o2,{pending:q2.pending});
  check('the replacement grant waits for the removal (LANE_RANK_ORDER): held lane_intent_stale, no request',blocked.reason==='lane_intent_stale'&&requests.length===0);
  const rm=await R.settleLaneIntent(env,cap,q2.ids[0],false,budget(),o2),gr=await R.settleLaneIntent(env,cap,q2.ids[1],false,budget(),o2,{pending:q2.pending});
  check('then DELETE Officer and PUT Guild Leader both settle',rm.state==='settled'&&gr.state==='settled'&&members[S].join()===GL&&effects().length===2);}
 {reset();character('officer',S,'member','Player-1-O');const snap=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[OFF];
  const o=await R.laneQualifyEach(env,budget(),S,cap.managedStaff.slice());const q=await R.queueStaffRankRoles(env,cap,S,snap,null,o);requests=[];
  const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  check('a hand-assigned Officer confirms fresh_server_confirmed with attempts 0 and no request (retires the subject, never custody)',r.reason==='fresh_server_confirmed'&&row(q.ids[0]).attempts===0&&requests.length===0);
  const abs=await R.settleStaffRankAbsences(env,cap,S,snap,null,budget(),o);check('settleStaffRankAbsences with no pending removal is a no-op',abs.reason==='no_pending_removals');}
 // --- major 3 at producer level: a snapshot omitting one of the account's live characters plans no removal
 const omitted=(mainRank,custody)=>{reset();character('main',S,'member','Player-1-M');character('alt',S,'member','Player-1-L');
  snapshot([{key:'main',guid:'Player-1-M',rank:mainRank},{key:'alt',guid:'Player-1-L',rank:8}],{fill:50,exported:clock-3000});consume(S,'main',clock-900);consume(S,'alt',clock-800);
  for(const c of custody)settle(c);return snapshot([{key:'alt',guid:'Player-1-L',rank:8}],{fill:50});};
 {const s=omitted(0,[{purpose:'fresh_roster_rank',role_id:N[0],request_digest:D,native_guid:'Player-1-M',native_profile:'ten-rank',native_rank:0,native_rank_name:'Guild Master'},
   {purpose:'staff_roster_rank',role_id:GL,native_guid:'Player-1-M',native_profile:'ten-rank',native_rank:0,native_rank_name:'Guild Master'}]);
  members[S]=[FM,N[0],GL];const o=await R.laneQualifyEach(env,budget(),S,[...ALL_FRESH(),...cap.managedStaff]);
  const fresh=await R.queueFreshRosterRoles(env,cap,S,s,null,o),staff=await R.queueStaffRankRoles(env,cap,S,s,null,o);
  check('a Guild Master main left out of one export keeps the GM rank role and Guild Leader: no desired=0 row, no replacement rank grant',fresh.ids.every(x=>row(x).desired===1&&row(x).role_id===FM)
   &&staff.ids.length===0&&count('desired=0')===0&&count(`role_id='${N[8]}'`)===0);
  check('the present membership role without a settled lane grant is only planned for a request-free confirm (grant debt then counts it)',fresh.state==='queued'&&fresh.ids.length===1
   &&(await R.settleLaneIntent(env,cap,fresh.ids[0],false,budget(),o,{pending:fresh.pending})).reason==='fresh_server_confirmed'&&row(fresh.ids[0]).attempts===0);}
 {const s=omitted(2,[{purpose:'roster_privileged_rank',role_id:OFF,native_guid:'Player-1-M',native_profile:'ten-rank',native_rank:2,native_rank_name:'Officer'}]);
  members[S]=[FM,OFF];const o=await R.laneQualifyEach(env,budget(),S,[...ALL_FRESH(),...cap.managedStaff]);
  const staff=await R.queueStaffRankRoles(env,cap,S,s,null,o);
  check('an Officer main absent once keeps Officer',staff.ids.length===0&&staff.reason==='rank_removal_authority_missing'&&count('desired=0')===0);
  const back=snapshot([{key:'main',guid:'Player-1-M',rank:7},{key:'alt',guid:'Player-1-L',rank:8}],{fill:50});
  const staff2=await R.queueStaffRankRoles(env,cap,S,back,null,o);
  check('positive control: the main listed again with a non-staff rank authorizes the Officer removal',staff2.ids.length===1&&row(staff2.ids[0]).role_id===OFF&&row(staff2.ids[0]).desired===0);}
 // --- staff absences: per-row correlation (Codex point 5), then the replacement grant
 {reset();character('officer',S,'member','Player-1-O');snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');
  const custody=(role)=>({purpose:'staff_roster_rank',role_id:role,request_digest:null,created_at:clock-5000,expires_at:clock-4700,native_guid:'Player-1-O',native_profile:'ten-rank',native_rank:0,native_rank_name:'Guild Master'});
  settle(custody(GL));settle(custody(RL));const now=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);members[S]=[];
  const o=await R.laneQualifyEach(env,budget(),S,cap.managedStaff.slice());const q=await R.queueStaffRankRoles(env,cap,S,now,null,o);
  check('staff producer: absent custody roles are planned desired=0 (to close custody) before the Officer grant',q.ids.length===3&&q.ids.slice(0,2).every(x=>row(x).desired===0)&&row(q.ids[2]).role_id===OFF);
  const rlRow=q.ids.map(row).find(r=>r.role_id===RL);settle({purpose:'staff_removal_departure',role_id:RL,desired:0,state:'unknown',reason:'provider_or_confirmation_unknown',created_at:clock,expires_at:clock+300});
  requests=[];const abs=await R.settleStaffRankAbsences(env,cap,S,now,null,budget(),o);
  check('mixed batch: the unblocked Guild Leader row settles, the Raid Leader row with an unknown removal on its target does not',abs.state==='held'&&abs.closed===1
   &&q.ids.map(row).find(r=>r.role_id===GL).state==='settled'&&row(rlRow.id).state==='pending'&&requests.length===0);
  const gl=q.ids.map(row).find(r=>r.role_id===GL);check('the settled absence is fresh_server_absence_batch and ends bot custody',gl.reason==='fresh_server_absence_batch'
   &&db.prepare(F.staffCustodyRolesSql(false)).all(S,G,JSON.stringify([GL])).length===0);}
 // --- the staff escape, the compensation GET path, the cheap absent-while-current read
 {reset();character('officer',S,'member','Player-1-O');const snap=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);
  const sp=settle({purpose:'staff_roster_rank',role_id:OFF,state:'unknown',reason:'provider_outcome_unknown',request_digest:null,roster_id:snap,native_guid:'Player-1-O',native_profile:'ten-rank',native_rank:2,native_rank_name:'Officer'});
  env.STAFF_TEN_RANK_ROLES='raid-leader';cap=F.captureLaneConfig(env);members[S]=[];const screen=await R.laneMemberRead(env,budget(),S);requests=[];
  const r=await R.settleLaneIntent(env,cap,sp.id,true,budget(),screen);
  check('major 4 for staff, P1-A: a spent Officer row after the switch narrows to raid-leader is outcome-read GET-only and only stamped (stays unknown)',cap.staff==='raid-leader'
   &&r.state==='unknown'&&r.reason==='spent_absent_unresolved'&&requests.length===0&&row(sp.id).state==='unknown'&&row(sp.id).checked_at===clock);
  check('P1-A: so it keeps fencing the staff family: a Raid Leader grant stays refused while the Officer PUT is unresolved',
   db.prepare(`SELECT ${F.rankFamilyFenceSql('?1','?2','?3','staff','?4')} AS ok`).get(S,G,'x',JSON.stringify([GL,OFF,RL])).ok===0);}
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  effectHook=async(method)=>{if(method==='PUT')db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);else throw Error('synthetic lost DELETE');};
  await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});clock=T+400;members[S]=[];effectHook=null;requests=[];log=[];
  const r=await R.settleLaneIntent(env,cap,q.ids[0],true,budget());const child=db.prepare("SELECT * FROM role_settlements WHERE purpose='grant_compensation'").get();
  check('P1-A: without an observation the lane reads once itself (4 GETs) and never calls reconcileRemovalReceipt: child and parent stay unknown, both stamped',
   r.state==='unknown'&&r.reason==='compensation_absent_unresolved'&&requests.length===4&&effects().length===0&&child.state==='unknown'&&child.checked_at===clock
   &&row(q.ids[0]).state==='unknown'&&row(q.ids[0]).checked_at===clock&&!log.includes('SELECT * FROM role_settlements WHERE id=?1')&&writes().every(s=>!/state='settled'|state='held'/.test(s)));}
 {const {snap}=grantWorld();const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[];const screen=await R.laneMemberRead(env,budget(),S);requests=[];const r=await R.settleLaneIntent(env,cap,k.id,true,budget(),screen);
  check('absent while current from a screen read is stamped without another read (no qualify)',r.reason==='explicit_reconciliation_required'&&requests.length===0&&row(k.id).checked_at===clock);}
 // --- spacing and departures
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);members[S]=[FM,N[7]];
  const t0=performance.now(),r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_ban',roles:[FM,N[7]]}],budget());
  check('effects are spaced FRESH_EFFECT_SPACING_MS apart by default',r.dispatched===2&&performance.now()-t0>=F.FRESH_EFFECT_SPACING_MS-10);}
 {reset();character('alpha',S,'left','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);
  settle({role_id:FM,request_digest:D,created_at:clock-9000,expires_at:clock-8700,...facts({})});
  settle({purpose:'staff_roster_rank',role_id:OFF,request_digest:null,created_at:clock-9000,expires_at:clock-8700,...facts({extra:{native_rank:2,native_rank_name:'Officer'}})});
  members[S]=[FM,OFF];const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_departure',roles:[FM]},{purpose:'staff_removal_departure',roles:[OFF]}],budget(),{spacingMs:0});
  check('departure: an authoritative leave of the live-seen character removes the fresh role and the bot-given Officer (EVER_LIVE)',r.dispatched===2&&members[S].length===0
   &&count("purpose='fresh_removal_departure' AND state='settled'")===1&&count("purpose='staff_removal_departure' AND state='settled'")===1);}
 {reset();character('beta',S,'left','Player-0-B');snapshot([]);
  settle({purpose:'roster_privileged_rank',role_id:OFF,request_digest:null,created_at:clock-9000,expires_at:clock-8700,native_profile:'beta-five',native_rank:1,native_rank_name:'Officer'});
  members[S]=[OFF];requests=[];const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'staff_removal_departure',roles:[OFF]}],budget(),{spacingMs:0});
  check('a beta officer never seen on a live roster keeps the bot-given beta Officer (EVER_LIVE false): no row, no request',r.reason==='removal_cause_withdrawn'&&requests.length===0&&count('desired=0')===0);}
 {reset();character('alpha',S,'member','Player-1-A');snapshot([{key:'alpha',guid:'Player-1-A',rank:7}]);settle({role_id:FM,request_digest:D,created_at:clock-9000,expires_at:clock-8700,...facts({})});
  members[S]=[FM];requests=[];const r=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'fresh_removal_departure',roles:[FM]}],budget(),{spacingMs:0});
  check('a member still listed with a live-seen member character has not departed: no row, no request',r.reason==='removal_cause_withdrawn'&&requests.length===0);}
 // --- the backoff marker
 {const {snap}=grantWorld();positions[N[7]]=60;const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S));
  const rank=q.ids.find(x=>row(x).role_id===N[7]),r=await R.settleLaneIntent(env,cap,rank,false,budget());
  check('a role at or above the bot holds the grant inventory_hierarchy_or_server_hold with no PUT',r.reason==='inventory_hierarchy_or_server_hold'&&effects().length===0);
  check('markLaneQualifyHeld marks the never-dispatched row lane_qualify_held by exact tuple',await R.markLaneQualifyHeld(env,cap,rank)&&row(rank).state==='held'&&row(rank).reason==='lane_qualify_held'&&row(rank).checked_at===clock);
  check('a marker is never placed twice or on a twelve row',!await R.markLaneQualifyHeld(env,cap,rank));}
 // --- P1-A (Codex 22:44/23:18 UTC, 16 Oct): M2 confirms a present spent PUT only when no earlier removal of its target is
 // unresolved (spent, or closed by an absence read); an acknowledged removal is the positive control
 for(const [label,removal,confirms] of [
  ['an earlier removal closed by an absence read (settled absent)',{state:'settled',reason:'absent'},false],
  ['an earlier removal closed by .160 stale absence (held past_effect_absent)',{state:'held',reason:'past_effect_absent'},false],
  ['an earlier DELETE confirmed absent while current (settled fresh_server_confirmed, attempts 1)',{state:'settled',reason:'fresh_server_confirmed'},false],
  ['an earlier removal acknowledged by its own DELETE (settled removed: positive control)',{state:'settled',reason:'removed'},true]]){
  const {snap}=grantWorld();settle({role_id:FM,request_digest:D,...facts({roster:snap})});
  settle({purpose:'fresh_removal_ban',role_id:N[7],desired:0,...removal,created_at:clock-9000,expires_at:clock-8700});
  const k=settle({purpose:'fresh_roster_rank',role_id:N[7],state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[FM,N[7]];const o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];
  const read=await R.readLaneSpentRows(env,cap,S,o,budget()),s=read.outcomes.find(x=>x.id===k.id).settlement;
  check('P1-A spent PUT, '+label+': its own lost request is never discharged by current presence',
   s.state==='unknown'&&s.reason==='present_effect_requires_current_authority_or_manual_removal'&&row(k.id).state==='unknown'&&row(k.id).reason===k.reason&&row(k.id).claim_nonce===k.claim_nonce&&row(k.id).checked_at===clock&&requests.length===0);}
 // P1-A: a spent DELETE whose intent is still current and whose role reads absent is never confirmed (the lost DELETE may land)
 {const {snap}=grantWorld();
  const del=settle({purpose:'fresh_roster_rank',role_id:N[2],desired:0,state:'unknown',reason:'provider_outcome_unknown',request_digest:D,...facts({roster:snap})});
  members[S]=[];const o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH());requests=[];
  const cur=F.laneConsumerSql(F.laneKind('fresh_roster_rank',0)).current;
  const current=db.prepare(cur).get(...F.bindsFor(cur,F.laneParams({rosterId:snap,subject:S,guid:'Player-1-A',rankName:'Member',rank:7,generation:null,id:del.id,epoch:E,nonce:null,role:N[2],
   guild:G,floor:cap.floor,digest:D,pending:null,shrink:cap.shrink,family:N})));
  const r=await R.settleLaneIntent(env,cap,del.id,true,budget(),o);
  check('P1-A: a spent rank DELETE whose intent reads current (control) and whose role reads absent is never confirmed: stamped, unknown, no request',
   !!current&&r.state==='unknown'&&r.reason==='spent_absent_unresolved'&&row(del.id).state==='unknown'&&row(del.id).checked_at===clock&&requests.length===0);
  check('P1-A: its target stays fenced',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,N[2],'x').ok===0);
  const stamp=F.laneConsumerSql(F.laneKind('fresh_roster_rank',0)).confirmSpent;
  check('P1-A: for both DELETE and PUT, confirmSpent is a stamp that never sets a state',!/SET\s+state/.test(stamp)&&/SET checked_at=/.test(stamp)&&!/SET\s+state/.test(F.laneConsumerSql(F.laneKind('fresh_roster_rank',1)).confirmSpent));}
 // P1-A: confirm closes only a never-dispatched row, so a row another invocation claimed meanwhile is never closed by this read
 {const {snap,pick}=grantWorld();const q=await R.queueFreshRosterRoles(env,cap,S,snap,null,await R.laneMemberRead(env,budget(),S));
  const bind=(purpose,id,role)=>{const sql=F.laneConsumerSql(F.laneKind(purpose,1)).confirm;return [sql,F.bindsFor(sql,F.laneParams({rosterId:snap,subject:S,guid:'Player-1-A',rankName:'Member',rank:7,
   generation:null,id,epoch:E,nonce:'c'.repeat(32),role,guild:G,floor:cap.floor,digest:D,pending:pick,shrink:cap.shrink,family:N}))];};
  db.prepare("UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=? WHERE id=?").run('e'.repeat(32),q.ids[0]); // claimed by another invocation
  const [m,mb]=bind('fresh_roster_membership',q.ids[0],FM),[k,kb]=bind('fresh_roster_rank',q.ids[1],N[7]);
  check('P1-A: confirm refuses a claimed (dispatching, attempts 1) row; the still-pending rank row confirms (positive control)',db.prepare(m).all(...mb).length===0
   &&row(q.ids[0]).state==='dispatching'&&db.prepare(k).all(...kb).length===1&&row(q.ids[1]).state==='settled'&&row(q.ids[1]).attempts===0);}
 // P1-A: the Codex-gated LANE_OBSERVED_PRESENT never settles a DELETE, nor a PUT past an unresolved removal of its target
 {reset();const tuple=r=>F.bindsFor(F.LANE_OBSERVED_PRESENT,F.laneTupleBinds(r));
  const del=settle({purpose:'fresh_roster_rank',role_id:N[3],desired:0,state:'unknown',reason:'provider_outcome_unknown'});
  const put=settle({purpose:'fresh_roster_rank',role_id:N[4],state:'unknown',reason:'provider_outcome_unknown'});
  const blocked=settle({purpose:'fresh_roster_rank',role_id:N[5],state:'unknown',reason:'provider_outcome_unknown'});
  settle({purpose:'fresh_removal_departure',role_id:N[5],desired:0,state:'held',reason:'past_effect_absent',created_at:clock-9000,expires_at:clock-8700});
  check('P1-A: LANE_OBSERVED_PRESENT (still disabled) refuses a DELETE and a PUT past an unresolved removal; a free PUT is the positive control',F.LANE_OBSERVED_PRESENT_ENABLED===false
   &&db.prepare(F.LANE_OBSERVED_PRESENT).all(...tuple(del)).length===0&&db.prepare(F.LANE_OBSERVED_PRESENT).all(...tuple(blocked)).length===0
   &&db.prepare(F.LANE_OBSERVED_PRESENT).all(...tuple(put)).length===1);}
 // P1-A: unresolved custody fences whoever closed it from a read (.160 :277, reconcileRemovalReceipt :367, :296-297 on a DELETE)
 {reset();const fence=role=>db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,role,'x').ok===1;
  settle({purpose:'roster_privileged_rank',role_id:OFF,state:'held',reason:'past_effect_absent'});
  settle({purpose:'grant_compensation',role_id:N[1],desired:0,state:'settled',reason:'absent'});
  settle({purpose:'roster_privileged_rank',role_id:GL,desired:0,state:'settled',reason:'fresh_server_confirmed'});
  settle({purpose:'staff_roster_rank',role_id:RL,state:'settled',reason:'fresh_server_confirmed'});
  settle({purpose:'fresh_removal_ban',role_id:N[2],desired:0,state:'settled',reason:'removed'});
  settle({purpose:'fresh_removal_ban',role_id:N[3],desired:0,state:'settled',reason:'absent',attempts:0});
  check('P1-A: a row closed by an absence read keeps fencing its target (legacy stale absence, a compensation child read absent, an absent-while-current DELETE confirm)',
   !fence(OFF)&&!fence(N[1])&&!fence(GL));
  check('P1-A: a presence-only closed attempted PUT stays fenced; an acknowledged removal and never-dispatched absence do not',!fence(RL)&&fence(N[2])&&fence(N[3]));
  check('P1-A: the absence-closed Officer PUT also keeps fencing the staff family',db.prepare(`SELECT ${F.rankFamilyFenceSql('?1','?2','?3','staff','?4')} AS ok`).get(S,G,'x',JSON.stringify([GL,OFF,RL])).ok===0);
  check('P1-A: the earlier build\'s absence-closing statements are gone; the outcome reads only stamp checked_at',['LANE_SPENT_REMOVAL_ABSENT','LANE_PAST_EFFECT_ABSENT','LANE_COMPENSATION_CHILD_ABSENT',
   'LANE_COMPENSATION_PARENT_HELD'].every(k=>F[k]===undefined)&&['LANE_SPENT_OBSERVED','LANE_COMPENSATION_PARENT_OBSERVED'].every(k=>F[k].split(/\s+WHERE\s/)[0].replace(/\s+/g,' ')==="UPDATE role_settlements SET checked_at=CAST(strftime('%s','now') AS INTEGER)"));}
 // --- P1-B (Codex 22:44 UTC): with the legacy privileged producer reachable the staff lane writes and sends nothing
 {reset({QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true'});character('officer',S,'member','Player-1-O');const snap=snapshot([{key:'officer',guid:'Player-1-O',rank:2}]);consume(S,'officer');members[S]=[];
  const o=await R.laneQualifyEach(env,budget(),S,[GL,OFF,RL]);requests=[];log=[];
  const q=await R.queueStaffRankRoles(env,cap,S,snap,null,o);
  const p=settle({purpose:'staff_roster_rank',role_id:OFF,state:'pending',reason:'awaiting_dispatch',attempts:0,claim_nonce:null,created_at:clock,expires_at:clock+300,
   ...facts({roster:snap,extra:{native_guid:'Player-1-O',native_rank:2,native_rank_name:'Officer'}})});
  const r=await R.settleLaneIntent(env,cap,p.id,false,budget(),o,{pending:null});
  const rem=await R.settleLaneRemoval(env,cap,S,null,[{purpose:'staff_removal_ban',roles:[OFF]}],budget(),{spacingMs:0});
  check('P1-B: QR_PRIVILEGED_RANK_MAPPING_ENABLED "true" holds the staff lane (legacy_privileged_producer_reachable); the fresh lane stays open',cap.staff==='held'
   &&cap.staffReason==='legacy_privileged_producer_reachable'&&!F.laneClock(cap,T).staff&&cap.fresh==='grants'&&cap.managedStaff.length===0);
  check('P1-B: then the staff producer, consumer and removal write nothing and send nothing',q.state==='held'&&r.state==='held'&&row(p.id).state==='pending'&&row(p.id).attempts===0
   &&rem.state==='held'&&rem.reason==='lane_closed'&&requests.length===0&&count(`purpose='staff_roster_rank' AND id<>'${p.id}'`)===0&&count("purpose LIKE 'staff_removal%'")===0);}
 // --- Exact claimed-but-not-dispatched closure; no expiry or provider observation manufactures this knowledge.
 for(const boundary of ['claim','admit']){const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  interceptFirst(sql=>boundary==='claim'?sql.includes("SET state='dispatching',attempts=1,claim_nonce=?9"):sql.includes("SET reason='admitted_before_effect'"),{after:()=>{env.STAFF_TEN_RANK_ROLES='raid-leader';}});
  requests=[];const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending}),closed=row(q.ids[0]);
  check('configuration drift after '+boundary+': the exact nonce is closed as known never-dispatched, no provider effect',r.state==='held'&&r.reason==='lane_configuration_changed'
   &&closed.state==='held'&&closed.reason==='claimed_not_dispatched'&&closed.attempts===1&&TOKEN32(closed.claim_nonce)&&effects().length===0);
  check('the known never-dispatched marker no longer creates uncertain physical custody',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,FM,'other').ok===1);}
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  interceptFirst(sql=>sql.includes("SET state='dispatching',attempts=1,claim_nonce=?9"),{after:()=>{db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);}});
  requests=[];const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  check('a claim followed by withdrawn admission is closed without dispatch, rather than left permanently dispatching',r.reason==='lane_changed_before_effect'&&row(q.ids[0]).state==='held'&&row(q.ids[0]).reason==='claimed_not_dispatched'&&effects().length===0);}
 for(const landed of [false,true]){const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  interceptFirst(sql=>sql===F.LANE_CLAIM_NOT_DISPATCHED,{[landed?'after':'before']:()=>{throw Error('synthetic closure reply lost');}});
  interceptFirst(sql=>sql.includes("SET state='dispatching',attempts=1,claim_nonce=?9"),{after:()=>{env.STAFF_TEN_RANK_ROLES='raid-leader';}});
  requests=[];const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending}),after=row(q.ids[0]);
  check('a '+(landed?'committed':'never-landed')+' closure with a lost reply reports uncertainty, never dispatches or renews the claim',r.state==='unknown'&&r.reason==='claimed_not_dispatched_receipt_unknown'
   &&after.attempts===1&&after.state===(landed?'held':'dispatching')&&after.reason===(landed?'claimed_not_dispatched':'dispatching')&&effects().length===0);}
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o),peerNonce='e'.repeat(32);
  interceptFirst(sql=>sql.includes("SET state='dispatching',attempts=1,claim_nonce=?9"),{after:()=>{db.prepare('UPDATE role_settlements SET claim_nonce=? WHERE id=?').run(peerNonce,q.ids[0]);env.STAFF_TEN_RANK_ROLES='raid-leader';}});
  requests=[];const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  check('a changed claim nonce is never closed by this invocation: uncertainty and the other nonce survive',r.state==='unknown'&&row(q.ids[0]).state==='dispatching'&&row(q.ids[0]).claim_nonce===peerNonce&&effects().length===0);}
 {const {snap}=grantWorld(),o=await R.laneQualifyEach(env,budget(),S,ALL_FRESH()),q=await R.queueFreshRosterRoles(env,cap,S,snap,null,o);
  interceptFirst(sql=>sql.includes("SET state='dispatching',attempts=1,claim_nonce=?9"),{after:()=>{throw Error('synthetic claim committed but reply lost');}});
  requests=[];const r=await R.settleLaneIntent(env,cap,q.ids[0],false,budget(),o,{pending:q.pending});
  check('a claim that committed but lost its reply can close only its own nonce as known not dispatched',r.state==='held'&&row(q.ids[0]).state==='held'&&row(q.ids[0]).reason==='claimed_not_dispatched'&&effects().length===0);}
 {reset();db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,1)').run(S);members[S]=[FM];
  interceptFirst(sql=>sql.includes("SET state='dispatching',attempts=1,claim_nonce=?10"),{after:()=>{db.prepare('UPDATE members SET banned=0 WHERE discord_id=?').run(S);}});
  const first=await R.settleLaneRemoval(env,cap,S,null,[{purpose:F.FRESH_REMOVAL_BAN,roles:[FM]}],budget(),{spacingMs:0}),closed=row(first.rows[0].id);
  check('a removal claim whose final cause is withdrawn closes its exact nonce without a DELETE',first.dispatched===0&&closed.state==='held'&&closed.reason==='claimed_not_dispatched'&&closed.attempts===1&&TOKEN32(closed.claim_nonce)&&effects().length===0);
  db.prepare('UPDATE members SET banned=1 WHERE discord_id=?').run(S);const retry=await R.settleLaneRemoval(env,cap,S,null,[{purpose:F.FRESH_REMOVAL_BAN,roles:[FM]}],budget(),{spacingMs:0});
  check('a new standing ban gets a distinct operation after the known non-dispatch, without rewriting or retrying the first claim',retry.dispatched===1&&retry.rows[0].id!==closed.id&&row(closed.id).state==='held'&&row(closed.id).claim_nonce===closed.claim_nonce);}
 for(const role of [FM,OFF]){reset();db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,1)').run(S);members[S]=[role];
  const purpose=role===FM?F.FRESH_REMOVAL_BAN:F.STAFF_REMOVAL_BAN,grant=role===FM?F.FRESH_MEMBERSHIP:F.STAFF_RANK;
  const unknown=settle({purpose:grant,role_id:role,state:'unknown',reason:'provider_outcome_unknown'}),original=JSON.stringify(row(unknown.id));
  let r=await R.settleLaneRemoval(env,cap,S,null,[{purpose,roles:[role]}],budget(),{spacingMs:0});
  check('lost '+grant+' alone never authorizes a new ban DELETE',r.dispatched===0&&effects().length===0&&JSON.stringify(row(unknown.id))===original);
  settle({purpose:grant,role_id:role,state:'settled',reason:'fresh_server_confirmed',attempts:0});
  r=await R.settleLaneRemoval(env,cap,S,null,[{purpose,roles:[role]}],budget(),{spacingMs:0});
  check('a never-dispatched presence confirmation is not acknowledged bot custody across an uncertain '+grant,r.dispatched===0&&effects().length===0&&JSON.stringify(row(unknown.id))===original);
  settle({purpose:grant,role_id:role,state:'settled',reason:'effect_and_current_server_confirmed',created_at:clock-600});
  r=await R.settleLaneRemoval(env,cap,S,null,[{purpose,roles:[role]}],budget(),{spacingMs:0});
  check('an independently acknowledged '+grant+' permits its own standing-ban removal while the old unknown stays byte-for-byte',r.dispatched===1&&r.rows.some(x=>x.reason==='removed')&&JSON.stringify(row(unknown.id))===original);
  check('the prior unknown still fences a future grant after that independent removal',db.prepare(`SELECT ${F.targetFenceSql('?1','?2','?3','?4')} AS ok`).get(S,G,role,'future').ok===0);}
 // --- module graph: qr-phase1 reaches role-settlements through membership-retirement-route, and full-release-roles reads
 // NATIVE_RANKS at load, so role-settlements must never evaluate it at module load (a TDZ crash in the bundled Worker)
 {const fresh={},loadFresh=name=>{if(name==='node:async_hooks'||name==='./node:async_hooks')return require('node:async_hooks');name=name.replace(/^\.\//,'');if(fresh[name])return fresh[name].exports;
   const m={exports:{}};fresh[name]=m;new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>loadFresh(p));return m.exports;};
  loadFresh('qr-phase1');
  check('loading qr-phase1 first evaluates role-settlements inside the cycle without evaluating full-release-roles',!!fresh['role-settlements']&&!fresh['full-release-roles']);
  // esbuild is wrangler's (hoisted, not a direct devDependency); without it the project tsconfig through TypeScript checks the same erasure.
  const source=fs.readFileSync(path.join(root,'src','role-settlements.ts'),'utf8'),tsconfig=fs.readFileSync(path.join(root,'tsconfig.json'),'utf8');let out;
  try{out=require('esbuild').transformSync(source,{loader:'ts',format:'esm',tsconfigRaw:tsconfig}).code;}catch(e){if(!e||e.code!=='MODULE_NOT_FOUND')throw e;
   const options=ts.convertCompilerOptionsFromJson((ts.parseConfigFileTextToJson('tsconfig.json',tsconfig).config||{}).compilerOptions||{},root).options;
   out=ts.transpileModule(source,{compilerOptions:{...options,module:ts.ModuleKind.ESNext}}).outputText;}
  check('the bundler erases the type-only import line; each lane entry loads full-release-roles by dynamic import',!/^import[^;]*full-release-roles/m.test(out)&&(out.match(/import\(["']\.\/full-release-roles["']\)/g)||[]).length===8);}
 Date.now=realNow;console.log(`full_release_lane_consumer_test: ${passed} checks passed`);
})().catch(e=>{console.error(e);process.exit(1);});

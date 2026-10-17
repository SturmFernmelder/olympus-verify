// Actual source and SQLite; only Discord is simulated. The database clock is controlled to exercise a 30-minute gap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const H=require('./privacy_serving_production_origin_test.cjs'),load=H.load,crypto=H.webcrypto;
const root=path.join(__dirname,'..'),service=load('role-rank-continuation'),rolesWriter=load('role-settlements'),admission=load('privacy-write-admission');
const subject=H.SUBJECT,bot='400000000000000003',guild='400000000000000004',memberRole='400000000000000005',botRole='400000000000000006',generation=H.capture().subjectGeneration,guid='Player-1234-00000002';
const leader='600000000000000001',officer='600000000000000002',raidLeader='600000000000000003',blocker='600000000000000004';
const labels=Array.from({length:10},(_,i)=>String(500000000000000000n+BigInt(i))),names=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
const inventory=[{id:guild,position:0,permissions:'0',managed:false},{id:memberRole,position:1,permissions:'0',managed:false},{id:botRole,position:30,permissions:'268435456',managed:false},{id:leader,position:18,permissions:'1024',managed:false},{id:officer,position:16,permissions:'1024',managed:false},{id:raidLeader,position:15,permissions:'1024',managed:false},{id:blocker,position:0,permissions:'0',managed:false},...labels.map((id,i)=>({id,position:2+i,permissions:'0',managed:false}))];
let db,env,native,members,requests,clock,sqlCalls,physicalSqlCalls,lookupHook,effectHook,lostWrite=false,unavailable=false,maxSql=0,maxPhysicalSql=0,maxHttp=0;
const sourcePins=['role-rank-continuation','role-settlements','privacy-write-admission','native-rank-adapter','privacy-serving-authority'].map(name=>{const file=path.join(root,'src',name+'.ts'),bytes=fs.readFileSync(file);return{file,bytes};});
function budget(limit=40){return {limit,attempts:0,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false};}
async function snapshot(id,rank=7){await db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,content_hash,complete,trusted) VALUES(?,?,?,'test',10,'test',1,1)").run(id,clock,clock);for(let i=0;i<10;i++)await db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)').run(id,'character'+i,'Character '+i,names[i],i,i===rank?guid:'Player-1234-'+String(i+20).padStart(8,'0'));}
async function reset(rank=7){
 if(native)native.db.close();clock=H.T;H.advance(clock);unavailable=false;native=H.native('canonical',H.capture());
 const batch=native.binding.batch;
 native.binding.batch=async function(stmts){
  let lineage=admission.originalPrivacyAdmissionBatchLineage(stmts);
  for(let i=0;i<4&&lineage?.kind!=='central';i++)lineage=lineage&&admission.originalPrivacyAdmissionBatchLineage(lineage.parent);
  assert.equal(lineage?.kind,'central','actual native batch has original central admission lineage');
  const logical=lineage.logical;assert.equal(stmts.length,logical.length+admission.admissionTransportCost(logical.map(x=>x.sql)));
  sqlCalls+=logical.length;physicalSqlCalls+=stmts.length;
  if(unavailable)throw Error('synthetic unavailable original Native D1');
  return Reflect.apply(batch,this,[stmts]);
 };
 env={DB:admission.createPrivacyWriteAdmissionDatabase(native.binding,'writer','canonical',H.WE),PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:H.WE,GUILD_ID:guild,SITE_GUILD_ID:guild,ROLE_GUILD_MEMBER:memberRole,ROLE_GUILD_LEADER:leader,ROLE_OFFICER:officer,ROLE_RAID_LEADER:raidLeader,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'fixture-only',QR_RANK_MAPPING_ENABLED:'true',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'true',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'ten-rank',roles:labels})};
 db={prepare(sql){const statement=native.db.prepare(sql);return{get:(...args)=>statement.get(...args),all:(...args)=>statement.all(...args),run:async(...args)=>env.DB.prepare(sql).bind(...args).run()};}};
 await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('actual member','Actual Member',?,'member',?,?)").run(subject,clock,guid);
 await snapshot(1,rank);members={[subject]:[],[bot]:[botRole]};requests=[];lookupHook=null;effectHook=null;lostWrite=false;sqlCalls=0;physicalSqlCalls=0;
 H.providerFetch((...args)=>globalThis.fetch(...args));
}
async function priorStaff(role){await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at) VALUES(?,?,'roster_privileged_rank',?,?,1,'settled','effect_and_current_server_confirmed',1,?,?)").run(crypto.randomUUID().replaceAll('-',''),subject,guild,role,clock-10,clock+290);}
globalThis.fetch=async(input,init={})=>{const pathname=new URL(String(input)).pathname,method=init.method||'GET';requests.push(method+' '+pathname);let value;if(pathname.endsWith('/users/@me'))value={id:bot};else if(pathname.endsWith('/roles')&&method==='GET')value=inventory;else{const m=pathname.match(/\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m)throw Error('unexpected provider path');if(m[2]){members[m[1]]=method==='PUT'?[...new Set([...members[m[1]],m[2]])]:members[m[1]].filter(x=>x!==m[2]);if(effectHook)await effectHook(method,m[2]);if(lostWrite)throw Error('synthetic lost provider response');return new Response(null,{status:204});}if(lookupHook){const f=lookupHook;lookupHook=null;await f(m[1]);}if(!members[m[1]])return new Response('{}',{status:404});value={user:{id:m[1]},roles:members[m[1]]};}return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});};
let n=0;function check(title,condition){assert.ok(condition,title);console.log('PASS '+title);n++;}
async function run(snapshotId=1,parent=budget(),capture={subjectGeneration:generation}){const start=sqlCalls,physicalStart=physicalSqlCalls,http=requests.length,result=await service.continueRosterRanks(env,subject,snapshotId,capture,parent),delta=sqlCalls-start,calls=requests.length-http;maxSql=Math.max(maxSql,delta);maxPhysicalSql=Math.max(maxPhysicalSql,physicalSqlCalls-physicalStart);maxHttp=Math.max(maxHttp,calls);check('logical SQL reserve and independently reconciled Native/request accounting '+n,delta<=35&&calls<=20&&result.attempts===calls&&parent.attempts<=parent.limit&&parent.calls===parent.attempts&&parent.retries===0);return {result,parent,sql:delta,http:calls};}
(async()=>{
 await reset(4);members[subject]=[labels[5],officer];await priorStaff(officer);let first=await run();check('first automatic invocation removes old cosmetic and bot-granted staff before grants',first.result.state==='pending'&&first.result.visited===2&&members[subject].length===0&&requests.filter(r=>r.startsWith('DELETE')).length===2&&!requests.some(r=>r.startsWith('PUT')));const oldIds=db.prepare("SELECT id FROM role_settlements WHERE roster_id=1 AND state='pending'").all().map(r=>r.id);
 clock+=1800;H.advance(clock);let stale=await run();check('same expired snapshot is held without renewal or a late effect',stale.result.state==='held'&&!requests.slice(first.http).some(r=>r.startsWith('PUT')||r.startsWith('DELETE'))&&db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE roster_id=1 AND expires_at>?").get(clock).n===0);
 await snapshot(2,4);let second=await run(2);check('fresh next snapshot finishes wanted cosmetic and staff in one bounded invocation',second.result.state==='done'&&members[subject].includes(labels[4])&&members[subject].includes(raidLeader)&&!members[subject].includes(officer)&&second.http===16);check('fresh authority creates new unspent IDs rather than renewing expired original writes',oldIds.every(id=>db.prepare('SELECT attempts,expires_at FROM role_settlements WHERE id=?').get(id).attempts===0)&&db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE roster_id=2 AND desired=1 AND attempts=1 AND state='settled'").get().n===2);
 await reset();let wrong=await run(1,budget(),{subjectGeneration:'c'.repeat(32)});check('wrong original generation never makes a provider request or mints intents',wrong.result.state==='held'&&requests.length===0&&db.prepare('SELECT COUNT(*) AS n FROM role_settlements').get().n===0);
 await reset();await db.prepare('DELETE FROM privacy_subjects WHERE subject_id=?').run(subject);let accountless=await run(1,budget(),{subjectGeneration:null});check('captured genuine accountless absence can settle source-native labels without a website account',accountless.result.state==='done'&&members[subject].includes(labels[7])&&!db.prepare('SELECT 1 FROM site_users WHERE discord_id=?').get(subject)&&!db.prepare('SELECT 1 FROM privacy_subjects WHERE subject_id=?').get(subject));
 await reset();let missing=await run(1,budget(),{});check('missing original generation cannot become a recaptured live identity',missing.result.reason==='original_generation_required'&&sqlCalls===0&&requests.length===0);
 await reset();await rolesWriter.queueRosterRankRoles(env,subject,1,generation);await snapshot(2,7);let newer=await run(1);check('a newer whole snapshot fences all old pending effects',newer.result.state==='held'&&requests.length===0);
 await reset();const ids=await rolesWriter.queueRosterRankRoles(env,subject,1,generation),wanted=db.prepare("SELECT id FROM role_settlements WHERE desired=1").get().id;await rolesWriter.settleRosterRankAbsences(env,subject,1,generation,budget());lostWrite=true;await rolesWriter.settleRoleIntent(env,wanted);lostWrite=false;const effects=requests.filter(r=>r.startsWith('PUT')||r.startsWith('DELETE')).length;let unknown=await run();check('unknown landed grant is reconciled by GET and never repeated',unknown.result.state==='held'&&unknown.result.reason==='current_source_held'&&unknown.result.pending===0&&unknown.result.unknown===0&&unknown.result.held===0&&requests.filter(r=>r.startsWith('PUT')||r.startsWith('DELETE')).length===effects&&db.prepare('SELECT state FROM role_settlements WHERE id=?').get(wanted).state==='settled');
 await reset(4);members[subject]=[officer];const manually=await run();check('manual staff role is preserved while source-selected roles settle',manually.result.state==='done'&&members[subject].includes(officer)&&members[subject].includes(raidLeader)&&!requests.some(r=>r.startsWith('DELETE')&&r.endsWith('/'+officer)));
 await reset();let exhausted=await run(1,budget(19));check('whole-account20-call reserve refuses before SQL or any HTTP',exhausted.result.state==='budget'&&sqlCalls===0&&requests.length===0&&exhausted.parent.exhausted);
 await reset();env.QR_RANK_MAPPING_ENABLED=undefined;env.QR_PRIVILEGED_RANK_MAPPING_ENABLED=undefined;let off=await run();check('default OFF has no authority read or effect',off.result.reason==='rank_mapping_disabled'&&sqlCalls===0&&requests.length===0);
 await reset(4);const shared=budget();lookupHook=async()=>{shared.attempts=shared.limit;shared.calls=shared.limit;};let parallel=await run(1,shared);check('child observes concurrent parent use without overdraw',parallel.result.state==='budget'&&shared.attempts===40&&requests.length===3);
 await reset(4);env.BLOCKING_ROLE_IDS=blocker;effectHook=(method)=>{if(method==='PUT')members[subject].push(blocker);else members[subject]=members[subject].filter(r=>r!==blocker);};let compensated=await run();check('two compensated grants stay within reserved20 calls and retain neither rank',compensated.http===20&&compensated.result.state==='held'&&members[subject].length===0&&db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE purpose='grant_compensation' AND state='settled'").get().n===2);
 await reset();lookupHook=async()=>await db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run('c'.repeat(32),subject);let rotated=await run();check('generation change during absence qualification cannot certify absence or dispatch a grant',rotated.result.state==='held'&&!requests.some(r=>r.startsWith('PUT')||r.startsWith('DELETE'))&&db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE state='settled'").get().n===0);
 await reset();lookupHook=async()=>await snapshot(2,7);let changedRoster=await run();check('newer roster committed during inventory look cannot certify old absence or dispatch',changedRoster.result.state==='held'&&!requests.some(r=>r.startsWith('PUT')||r.startsWith('DELETE'))&&db.prepare("SELECT COUNT(*) AS n FROM role_settlements WHERE state='settled'").get().n===0);
 await reset();unavailable=true;let unreadable=await run();check('unreadable durable state rotates held with unknown counts rather than claiming done',unreadable.result.state==='held'&&unreadable.result.reason==='source_or_receipt_unavailable'&&unreadable.result.pending===null&&unreadable.result.unknown===null&&unreadable.result.rotate&&requests.length===0);
 await reset();members[subject]=[labels[5]];inventory.find(r=>r.id===labels[5]).position=31;let held=await run();inventory.find(r=>r.id===labels[5]).position=7;check('held target returns rotation without granting ahead of a removal',held.result.state==='held'&&held.result.rotate&&members[subject].includes(labels[5])&&!members[subject].includes(labels[7]));
 // Equal-clock fairness uses genuine source-produced receipts, not a manufactured priority marker.
 // Numeric snapshot IDs increase as MAX(id) requires; newly generated operation IDs deliberately descend.
 const fairness=[];
 async function fairRun(snapshotId,effectLimit=1,capture={subjectGeneration:generation}){
  const parent=budget(),start=sqlCalls,physicalStart=physicalSqlCalls,http=requests.length;
  const result=await service.continueRosterRanks(env,subject,snapshotId,capture,parent,effectLimit);
  const delta=sqlCalls-start,calls=requests.length-http;
  maxSql=Math.max(maxSql,delta);maxPhysicalSql=Math.max(maxPhysicalSql,physicalSqlCalls-physicalStart);maxHttp=Math.max(maxHttp,calls);
  check('equal-clock continuation obeys unchanged logical SQL/HTTP/shared budget '+n,
   delta<=35&&calls<=20&&result.attempts===calls&&parent.attempts===calls&&parent.calls===calls&&parent.retries===0&&result.visited<=effectLimit);
  const value={snapshotId,effectLimit,clock,sql:delta,http:requests.slice(http),result};fairness.push(value);return value;
 }
 const generationModule=load('account-generation-contracts'),originalRandomGeneration=generationModule.randomGeneration;
 let descendingId=0xffffffffffffffffffffffffffffffffn;
 generationModule.randomGeneration=()=>{descendingId--;return descendingId.toString(16).padStart(32,'0');};
 try{
  await reset(4);const equalClock=clock;members[subject]=[labels[4],raidLeader];
  const both=await fairRun(1,2),prior=db.prepare("SELECT * FROM role_settlements WHERE subject=? AND roster_id=1 AND desired=1 ORDER BY id").all(subject);
  check('both prior roles are actually confirmed by current source without a PUT',both.result.state==='done'&&both.result.visited===2&&prior.length===2&&prior.every(r=>r.state==='settled'&&r.reason==='fresh_server_confirmed'&&r.attempts===0&&r.claim_nonce===null&&r.proof_id===null&&r.checked_at===equalClock&&r.subject_generation===generation)&&!both.http.some(r=>r.startsWith('PUT')));
  const originalPrior=JSON.stringify(prior);
  members[subject]=members[subject].filter(r=>r!==labels[4]);
  const rotations=[];let restored=false;
  for(let turn=1;turn<=14&&!restored;turn++){
   await snapshot(turn+1,4);
   const value=await fairRun(turn+1),wanted=db.prepare("SELECT id,role_id,subject_generation,roster_id,created_at,expires_at,state,attempts FROM role_settlements WHERE subject=? AND roster_id=? AND desired=1 ORDER BY role_id").all(subject,turn+1);
   rotations.push({...value,wanted});
   check('fresh equal-clock original roster and distinct descending intent IDs remain represented '+turn,wanted.length===2&&wanted.every(r=>r.subject_generation===generation&&r.created_at===equalClock&&r.expires_at===equalClock+300)&&clock===equalClock&&wanted.every(r=>r.id<prior[0].id&&r.id<prior[1].id));
   check('one-effect continuation does not issue a removal or repeated privileged PUT '+turn,!value.http.some(r=>r.startsWith('DELETE')||r.startsWith('PUT')&&!r.endsWith('/'+labels[4]))&&value.http.filter(r=>r.startsWith('PUT')).length<=1);
   restored=members[subject].includes(labels[4]);
  }
  const puts=rotations.flatMap(r=>r.http).filter(r=>r.startsWith('PUT'));
  check('newly absent cosmetic role after both prior confirmations receives one actual PUT within14 fresh equal-clock rotations',restored&&rotations.length<=14&&puts.length===1&&puts[0].endsWith('/'+labels[4]));
  const landed=db.prepare("SELECT * FROM role_settlements WHERE subject=? AND role_id=? AND desired=1 AND attempts=1 AND state='settled' ORDER BY rowid DESC LIMIT 1").get(subject,labels[4]);
  check('real new effect retains original generation/native profile/GUID/roster and spent nonce custody',landed&&landed.subject_generation===generation&&landed.native_guid===guid&&landed.native_profile==='ten-rank'&&landed.native_rank===4&&landed.native_rank_name===names[4]&&landed.roster_id===rotations.at(-1).snapshotId&&landed.created_at===equalClock&&landed.expires_at===equalClock+300&&/^[0-9a-f]{32}$/.test(landed.claim_nonce)&&landed.proof_id===null);
  check('priority never renews or overwrites either original historical confirmation',JSON.stringify(db.prepare("SELECT * FROM role_settlements WHERE subject=? AND roster_id=1 AND desired=1 ORDER BY id").all(subject))===originalPrior);
  for(const kind of ['generation','native-guid','newer-roster','profile','expiry']){
   await reset(4);members[subject]=[labels[4],raidLeader];await fairRun(1,2);await snapshot(2,4);members[subject]=members[subject].filter(r=>r!==labels[4]);
   await rolesWriter.queueRosterRankRoles(env,subject,2,generation);
   const old=db.prepare("SELECT * FROM role_settlements WHERE subject=? AND roster_id=2 AND role_id=? AND desired=1").get(subject,labels[4]);
   lookupHook=async()=>{
    if(kind==='generation')await db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run('c'.repeat(32),subject);
    if(kind==='native-guid')await db.prepare('UPDATE characters SET guid=? WHERE discord_id=?').run('Player-1234-000000ff',subject);
    if(kind==='newer-roster')await snapshot(3,4);
    if(kind==='profile')env.QR_NATIVE_ROLE_MAP=JSON.stringify({profile:'beta-five',roles:labels.slice(0,5)});
    if(kind==='expiry'){clock+=301;H.advance(clock);}
   };
   const value=await fairRun(2,2),after=db.prepare('SELECT * FROM role_settlements WHERE id=?').get(old.id);
   check('matching historical priority cannot borrow changed current '+kind+' authority after qualification await',!value.http.some(r=>r.startsWith('PUT')||r.startsWith('DELETE'))&&!members[subject].includes(labels[4])&&after.attempts===0&&after.claim_nonce===null&&after.created_at===old.created_at&&after.expires_at===old.expires_at&&after.subject_generation===generation);
   check('changed '+kind+' keeps the original missing-role effect represented and unspent',after.state==='pending'&&after.roster_id===2&&after.native_guid===guid&&after.native_profile==='ten-rank'&&after.proof_id===null);
  }
 }finally{generationModule.randomGeneration=originalRandomGeneration;}
 console.log(JSON.stringify({equalClockRankFairness:fairness,providerIsFixedSynthetic:true,nativeProtocolColumns:9,epochModulesAdopted:true}));

 for(const p of sourcePins)check('actual source unchanged '+path.basename(p.file),fs.readFileSync(p.file).equals(p.bytes));
 console.log(JSON.stringify({observedMax:{logicalSql:maxSql,physicalSql:maxPhysicalSql,http:maxHttp},sourceReserve:{logicalSql:35,http:20},effectLimit:2,newCronJobs:0,observedPhysicalSql:maxPhysicalSql,sourcePins:sourcePins.map(p=>({path:p.file,bytes:p.bytes.length,sha256:require('node:crypto').createHash('sha256').update(p.bytes).digest('hex')}))}));console.log(`${n}/${n} role-rank continuation checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{H.providerFetch(null);if(native)native.db.close();});

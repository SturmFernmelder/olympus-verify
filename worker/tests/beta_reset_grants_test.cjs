// Exact copied source, real SQLite and both native/installed-admission transports; only Discord is simulated.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');globalThis.crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..'),cache={};
const currentEntry=require('./helpers/privacy129_fixture.cjs');
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;
 const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>load(p));return m.exports;}
// Stable synthetic globals precede original source capture; never replace them mid-run.
let db,env,clock,members,requests,physical,lookupHook,effectHook,sqlHook,losePut,loseDelete,failGetAfterPut,putDone,rejectPut429,b;
const realNow=Date.now;Date.now=()=>clock*1000;
let providerFetch;globalThis.fetch=(input,init)=>providerFetch(input,init);
providerFetch=async(input,init={})=>{if(input instanceof Request){init={method:input.method,headers:input.headers,...init};input=input.url;}const p=new URL(String(input)).pathname,method=init.method||'GET';requests.push({method,path:p});
 let value;if(p.endsWith('/users/@me'))value={id:bot};else if(p.endsWith('/roles')&&method==='GET')value=inventory;else{const m=p.match(/\/members\/(\d+)(?:\/roles\/(\d+))?$/);if(!m)throw Error('unexpected provider path');
 if(m[2]){if(method==='PUT'&&rejectPut429){clock=policy.BETA_RESET_CUTOFF;return new Response(JSON.stringify({retry_after:0}),{status:429});}if(method==='PUT'){putDone=true;members[m[1]]=[...new Set([...members[m[1]],m[2]])];}else members[m[1]]=members[m[1]].filter(x=>x!==m[2]);if(effectHook)await effectHook(method,m[2]);if(method==='PUT'&&losePut||method==='DELETE'&&loseDelete)throw Error('synthetic lost response');return new Response(null,{status:204});}
 if(failGetAfterPut&&putDone&&method==='GET'){failGetAfterPut=false;throw Error('synthetic post-PUT read loss');}
 if(lookupHook&&m[1]===subject){const f=lookupHook;lookupHook=null;await f();}if(!members[m[1]])return new Response('{}',{status:404});value={user:{id:m[1]},roles:members[m[1]]};}
 return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});};
const policy=load('beta-reset-policy'),legacy=load('roles'),central=load('role-settlements'),admission=load('privacy-write-admission');
const memberRole='1552077551839617104',guild='236932545793490944',owner='472099715253796864',subject='400000000000000002',bot='400000000000000003',botRole='400000000000000006';
const leader='1554261979684933742',officer='1554262223038324840',raidLeader='1554262510650007602',moderator='571363393555136512';
const nativeRoles=['1557496182966587453','1557496796949909575','1557498252994285568','1557498969310101576','1557499286965719050'];
const nativeNames=['Guild Master','Officer','Veteran','Member','Initiate'],generation='b'.repeat(32),guid='Player-1234-00000002';

const inventory=[{id:guild,position:0,permissions:'0',managed:false},{id:botRole,position:50,permissions:'268435456',managed:false},
 ...policy.BETA_RESET_ROLE_IDS.map((id,i)=>({id,position:i+1,permissions:'0',managed:false})),
 ...[leader,officer,raidLeader,moderator].map((id,i)=>({id,position:i+30,permissions:'1024',managed:false}))];
let originalNative,fixtureWriter;
function nativeObservation(){return {physical,statements:originalNative?.nativeTrace.length??0,groups:originalNative?.nativeGroups.map(g=>g.length)??[],providerRequests:requests.length};}
function d1(){originalNative=currentEntry.originalNativePort(db,{statement(sql,values){physical++;if(sqlHook)sqlHook(sql,values);}});return originalNative;}
async function fixtureRun(sql,...values){return fixtureWriter.prepare(sql).bind(...values).run();}
function currentSetup(){currentEntry.installCurrentEntryEpoch(db,{now:clock});env=currentEntry.currentEntryEnvironment({...env,DB:d1()});fixtureWriter=admission.createPrivacyWriteAdmissionDatabase(originalNative,'writer','canonical',currentEntry.ENTRY_EPOCH);env.DB=fixtureWriter;}

const effects=()=>requests.filter(x=>x.method==='PUT'||x.method==='DELETE');
const rows=()=>db.prepare('SELECT * FROM role_settlements ORDER BY created_at,id').all();
const arm=()=>JSON.stringify({version:2,epoch:policy.BETA_RESET_EPOCH,cutoff:policy.BETA_RESET_CUTOFF,guildId:guild,roleIds:[...policy.BETA_RESET_ROLE_IDS],armedAt:policy.BETA_RESET_CUTOFF-100});
async function reset(installed=false,armed=true,linkedRank=3){if(db)db.close();clock=policy.BETA_RESET_CUTOFF-10;db=new DatabaseSync(':memory:');db.function('strftime',(format,input)=>{if(format!=='%s'||input!=='now')throw Error('clock misuse');return String(clock);});// Empty database: the existing current epoch installer owns its exact physical schema.

 env={DB:d1(),GUILD_ID:guild,SITE_GUILD_ID:guild,SITE_ADMINS:owner,ROLE_GUILD_MEMBER:memberRole,ROLE_GUILD_MASTER:'',ROLE_GUILD_LEADER:leader,ROLE_OFFICER:officer,ROLE_RAID_LEADER:raidLeader,ROLE_MODERATOR:moderator,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'fixture-only',QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:nativeRoles}),BETA_RESET_REMOVALS_ENABLED:'true'};
 currentSetup();
 await fixtureRun('INSERT INTO members(discord_id) VALUES(?)',subject);await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)",subject,generation,clock,clock);
 await fixtureRun("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('actual member','Actual Member',?,'member',?,?)",subject,clock,guid);
 await fixtureRun("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,content_hash,complete,trusted) VALUES(1,?,?,'test',5,'fixture',1,1)",clock,clock);
 for(let i=0;i<5;i++)await fixtureRun('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,?,?,?,?,?)','character'+i,'Character '+i,nativeNames[i],i,i===linkedRank?guid:'Player-1234-'+String(i+20).padStart(8,'0'));
 if(armed)await fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',policy.BETA_RESET_POLICY_KEY,arm(),clock,owner);
 // auditTypedNames is installed by currentSetup, not reseeded.
 // Both preserved branches use current admitted Native; raw admission-off is not covered.
 console.log('CURRENT_NATIVE_SETUP '+JSON.stringify({legacyBranch:installed?'admitted':'native',currentAdmission:true,layout:'canonical',epoch:currentEntry.ENTRY_EPOCH}));
 members={[subject]:[],[bot]:[botRole]};requests=[];physical=0;lookupHook=null;effectHook=null;sqlHook=null;losePut=false;loseDelete=false;failGetAfterPut=false;putDone=false;rejectPut429=false;
 b={limit:40,attempts:0,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false};
}

let n=0;const costs=[];function check(name,condition){assert.ok(condition,name);n++;console.log('PASS '+name);}
async function measure(name,fn){const before=physical,net=requests.length,groupBefore=originalNative.nativeGroups.length,value=await fn();const cost={name,physical:physical-before,network:requests.length-net,nativeGroups:originalNative.nativeGroups.slice(groupBefore).map(g=>g.length),budget:b.attempts,result:typeof value==='string'?value:value?.reason};costs.push(cost);console.log('CASE_COST '+JSON.stringify(cost));check(name+' remains bounded',cost.physical<=64&&cost.network<=8);return value;}
const grant=()=>legacy.grantMemberRole(env,subject,'fixture','fixture',undefined,b);
async function centralId(rank=false){env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED='true';if(rank){env.QR_RANK_MAPPING_ENABLED='true';const ids=await central.queueRosterRankRoles(env,subject,1,generation);return ids.find(id=>db.prepare('SELECT desired FROM role_settlements WHERE id=?').get(id).desired===1);}return central.queueRosterMembershipRole(env,subject,1,generation);}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await reset(installed);delete env.BETA_RESET_REMOVALS_ENABLED;clock=policy.BETA_RESET_CUTOFF;check(label+' removal flag OFF cannot reopen old beta grants at cutoff',(await measure(label+' off',grant))==='held'&&effects().length===0&&rows().length===0);
  await reset(installed,false);check(label+' source epoch before cutoff permits grant without armed removals',(await measure(label+' missing before cutoff',grant))==='granted'&&effects().length===1);
  await reset(installed,false);clock=policy.BETA_RESET_CUTOFF;check(label+' absent policy cannot reopen grants at cutoff',(await measure(label+' missing after cutoff',grant))==='held'&&requests.length===0&&rows().length===0);
  await reset(installed);clock=policy.BETA_RESET_CUTOFF;check(label+' exact cutoff blocks legacy PUT',(await measure(label+' cutoff',grant))==='held'&&requests.length===0);
  await reset(installed);check(label+' before cutoff has one durable acknowledged grant',(await measure(label+' normal',grant))==='granted'&&effects().length===1&&rows().filter(x=>x.purpose==='beta_guard_grant'&&x.attempts===1&&x.state==='settled').length===1);
  await reset(installed);lookupHook=()=>{clock=policy.BETA_RESET_CUTOFF;};check(label+' cutoff during fresh member read holds before PUT',(await measure(label+' GET race',grant))==='held'&&effects().length===0);
  await reset(installed);effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};check(label+' cutoff during PUT is compensated',(await measure(label+' PUT race',grant))==='held'&&!members[subject].includes(memberRole)&&effects().map(x=>x.method).join(',')==='PUT,DELETE'&&rows().some(x=>x.purpose==='grant_compensation'&&x.state==='settled'));
  check(label+' exact provider attempts counted',b.attempts===requests.length);
  await reset(installed);effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};losePut=true;check(label+' lost PUT crossing cutoff still compensates',(await measure(label+' lost PUT',grant))==='held'&&!members[subject].includes(memberRole)&&effects().map(x=>x.method).join(',')==='PUT,DELETE');
  await reset(installed);effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};loseDelete=true;await measure(label+' lost DELETE',grant);const debt=rows().find(x=>x.purpose==='grant_compensation');check(label+' lost compensation keeps durable unknown once',debt?.state==='unknown'&&debt.attempts===1&&effects().length===2);loseDelete=false;const before=effects().length;const reconciled=await measure(label+' GET-only reconciliation',()=>central.reconcileRemovalReceipt(env,debt.id,b));check(label+' spent unknown compensation remains unknown after GET without DELETE',reconciled.state==='unknown'&&effects().length===before&&rows().find(x=>x.id===debt.id).state==='unknown');
  await reset(installed);const id=await centralId();clock=policy.BETA_RESET_CUTOFF;check(label+' central pending grant held at cutoff',(await measure(label+' central cutoff',()=>central.settleRoleIntent(env,id,false,undefined,b))).state==='held'&&effects().length===0&&db.prepare('SELECT attempts FROM role_settlements WHERE id=?').get(id).attempts===0);
  await reset(installed);const crossing=await centralId();effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};check(label+' central PUT crossing cutoff compensates',(await measure(label+' central PUT race',()=>central.settleRoleIntent(env,crossing,false,undefined,b))).state==='held'&&!members[subject].includes(memberRole)&&effects().map(x=>x.method).join(',')==='PUT,DELETE');
  check(label+' central compensation physical requests counted',b.attempts===requests.length);
  await reset(installed);const readLost=await centralId();effectHook=method=>{if(method==='PUT'){clock=policy.BETA_RESET_CUTOFF;failGetAfterPut=true;}};check(label+' post-PUT GET loss at cutoff still compensates',(await measure(label+' central GET failure',()=>central.settleRoleIntent(env,readLost,false,undefined,b))).state==='held'&&!members[subject].includes(memberRole)&&effects().length===2);
  await reset(installed);const pending=await centralId();sqlHook=sql=>{if(sql.startsWith("UPDATE role_settlements SET state='dispatching'")){clock=policy.BETA_RESET_CUTOFF;sqlHook=null;}};check(label+' claim statement clock guard prevents dispatch',(await measure(label+' claim cutoff',()=>central.settleRoleIntent(env,pending,false,undefined,b))).state==='held'&&effects().length===0);
  await reset(installed);rejectPut429=true;check(label+' guarded legacy 429 never retries PUT after cutoff',(await measure(label+' 429 crossing',grant))==='held'&&effects().filter(x=>x.method==='PUT').length===1&&b.retries===0);
  await reset(installed);effectHook=async method=>{if(method==='PUT'){clock=policy.BETA_RESET_CUTOFF;await env.DB.prepare('DELETE FROM site_settings WHERE key=?1').bind(policy.BETA_RESET_POLICY_KEY).run();}};check(label+' deleted policy during PUT owes compensation',(await measure(label+' policy deletion',grant))==='held'&&!members[subject].includes(memberRole)&&effects().length===2);check(label+' deletion never reopens fresh invocation after cutoff',(await grant())==='held'&&effects().length===2);
  await reset(installed);const putLost=await centralId();effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};losePut=true;check(label+' central lost PUT crossing cutoff compensates but remains unknown',(await measure(label+' central lost PUT',()=>central.settleRoleIntent(env,putLost,false,undefined,b))).state==='unknown'&&!members[subject].includes(memberRole)&&effects().length===2);
 }
 // The reset policy cannot reach preserved roles or appointments, even with valid source authority.
 await reset();env.QR_PRIVILEGED_RANK_MAPPING_ENABLED='true';env.QR_RANK_MAPPING_ENABLED='true';const ids=await central.queueRosterRankRoles(env,subject,1,generation);clock=policy.BETA_RESET_CUTOFF;const native=ids.find(id=>db.prepare('SELECT desired,purpose FROM role_settlements WHERE id=?').get(id).desired===1);check('native rank target held after cutoff',(await central.settleRoleIntent(env,native,false,undefined,b)).state==='held'&&effects().length===0);
 check('all twelve targets are exact and distinct',policy.BETA_RESET_ROLE_IDS.length===12&&new Set(policy.BETA_RESET_ROLE_IDS).size===12&&!policy.BETA_RESET_ROLE_IDS.some(x=>[leader,officer,raidLeader,moderator].includes(x)));
 await reset(false,true,1);env.QR_PRIVILEGED_RANK_MAPPING_ENABLED='true';const staffIds=await central.queueRosterRankRoles(env,subject,1,generation);clock=policy.BETA_RESET_CUTOFF;const staff=staffIds.find(id=>db.prepare('SELECT role_id FROM role_settlements WHERE id=?').get(id).role_id===officer);check('preserved Officer role continues current authorized grant at cutoff',(await central.settleRoleIntent(env,staff,false,undefined,b)).state==='settled'&&members[subject].includes(officer)&&effects().length===1);
 console.log('BETA_GRANT_SUMMARY '+JSON.stringify({checks:n,maxPhysical:Math.max(...costs.map(x=>x.physical)),maxNetwork:Math.max(...costs.map(x=>x.network)),costs}));
 console.log(`${n}/${n} checks passed`);
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});

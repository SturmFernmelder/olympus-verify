// Real pre-seal Native / pending consumption / runtime venue. Only Discord HTTP is synthetic.
'use strict';
const fs230=require('node:fs'),path230=require('node:path'),{Module:Module230}=require('node:module');
const parent230=fs230.readFileSync(path230.join(__dirname,'hardening_test.cjs'),'utf8');
const cuts230=[...parent230.matchAll(/^\(async \(\) => \{/gm)];
if(cuts230.length!==1)throw Error('launch230_fixture_boundary_changed');
let fixture230=parent230.slice(0,cuts230[0].index);
const oldInstall230='    entry.installCurrentEntryEpoch(db, { now: T });';
const oldEnv230="  return { ...current, DB: load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(current.DB, 'writer', 'canonical', entry.ENTRY_EPOCH) };";
if(fixture230.split(oldInstall230).length!==2||fixture230.split(oldEnv230).length!==2)throw Error('launch230_fixture_native_boundary_changed');
fixture230=fixture230.replace(oldInstall230,`    const profile=JSON.parse(load('./raid-schema316').raidAdmissionCatalogue316('recorded-live-pre-seal-20261017'));
    for(const t of profile.tables)db.exec(t.sql);for(const i of profile.indexes)db.exec(i.sql);db.exec(profile.slotSQL);
    db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',0,0)").run('a'.repeat(32));
    db.exec("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0);INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',1)");for(const t of profile.triggers)db.exec(t.sql);`)
 .replace(oldEnv230,`  return { ...current,PRIVACY_ERASURE_ENABLED:'true',PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'recorded-live-pre-seal-20261017',PRIVACY_WRITE_ADMISSION_EPOCH:'b'.repeat(32), DB: load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(current.DB, 'writer', 'recorded-live-pre-seal-20261017', 'b'.repeat(32)) };`);
const body230=String.raw`
(async()=>{
 const assert=require('node:assert/strict'),crypto230=require('node:crypto'),central=load('./role-settlements'),venue=load('./shared-membership-cutover230'),cutover=load('./privacy-shared-member-cutover230');
 const G=venue.SHARED_MEMBER230_GUILD,R=venue.SHARED_MEMBER230_ROLE,BOT='999999999999999999',BOTROLE='888888888888888888',HIGH='777777777777777777',BLOCK='666666666666666666';
 const scope={version:1,guild:'OLYMPUS PRIME',realm:'Fixture Live Realm'},h=x=>crypto230.createHash('sha256').update(x).digest('hex');
 let db,env,http=[],present=[],options={},capHook=null,batchHook=null,uncapped=0;
 const oldD1=d1;
 d1=db=>entry.originalNativePort(db,{afterBatch:(plan,out)=>batchHook?.(plan,out)});
 stubs['./discord'].rest=async(e,method,p,_body,_retries,_reason,_budget,_retry,beforeDispatch)=>{
  beforeDispatch?.();http.push({method,path:p});await options.onHTTP?.(method,p,http.length);
  if(method==='GET'&&p==='/users/@me')return {id:BOT,bot:!options.notBot};
  if(method==='GET'&&p==='/guilds/'+G+'/roles')return [{id:G,position:0,permissions:'0',managed:false},{id:R,position:options.targetAbove?11:1,permissions:options.privilegedRole?'8':'0',managed:!!options.managed},{id:BOTROLE,position:10,permissions:options.noManage?'0':'268435456',managed:false},{id:HIGH,position:20,permissions:'0',managed:false},{id:BLOCK,position:1,permissions:'0',managed:false}];
  if(method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return {user:{id:BOT},roles:[BOTROLE]};
  if(method==='GET'&&p==='/guilds/'+G+'/members/'+A){if(options.getFails&&http.some(x=>x.method==='PUT'))throw Error('synthetic confirmation lost');const row={user:{id:options.wrongUser?B:A},roles:present.slice()};options.lastMember=row;return row;}
  if(method==='PUT'&&p==='/guilds/'+G+'/members/'+A+'/roles/'+R){if(options.putUnknown)throw Error('synthetic PUT reply lost');present.push(R);return undefined;}
  if(method==='DELETE'&&p==='/guilds/'+G+'/members/'+A+'/roles/'+R){present=present.filter(x=>x!==R);return undefined;}
  throw Error('unplanned synthetic HTTP '+method+' '+p);
 };
 // Observe the original capability while active, retaining the actual role adapter and central engine.
 const grant230=load('./roles').grantMemberRole;
 load('./roles').grantMemberRole=async(e,id,reason,origin,hints,b,selection,dispatch)=>{
  const cap=selection?.originalConsumed230;if(!cap){uncapped++;return grant230(e,id,reason,origin,hints,b,selection,dispatch);}
  const v=await venue.captureRuntimeVenue230(e);if(v.mode!=='enabled')throw Error('actual venue not enabled: '+v.reason);
  await capHook?.(e,cap,v.venue);
  return grant230(e,id,reason,origin,hints,b,selection,dispatch);
 };
 async function fresh(o={}){
  options=o;http=[];present=o.high?[HIGH]:[];if(o.already)present.push(R);if(o.blocked)present.push(BLOCK);capHook=null;batchHook=null;uncapped=0;reset();
  db=freshDb();const raw=d1(db),closure={version:1,contract:venue.SHARED_MEMBER230_CONTRACT,operationId:'c'.repeat(32),priorEpoch:'a'.repeat(32),writeEpoch:'b'.repeat(32),sourceCommit:'d'.repeat(40),sourceTree:'e'.repeat(40),bundleSHA256:'f'.repeat(64),providerA:'11111111-2222-4333-8444-555555555555',writerCoverageSHA256:'1'.repeat(64),debtPredicateSHA256:h(cutover.SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL),createdAt:T,expiresAt:T+300};
  const json=JSON.stringify(closure),digest=h(json);await cutover.executeSharedMember230Open(await cutover.captureSharedMember230Open(await cutover.executeSharedMember230Fence(await cutover.captureSharedMember230Fence(raw,json,digest)),'enabled'));
  env=directEnv({DB:raw,PUBLIC_BASE_URL:'https://verify.example',VERIFY_SECRET:SECRET,DISCORD_APP_ID:BOT,DISCORD_BOT_TOKEN:'synthetic-not-a-credential',ROLE_GUILD_MEMBER:R,GUILD_ID:G,ADMISSION_MODE:'auto',OFFICER_CHARACTERS:'Fern Melder',ROSTER_MAX_SHRINK_PCT:'10',ROSTER_MIN_MEMBERS:'0',REQUEST_CODES:'on',VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify(scope),MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',SHARED_MEMBERSHIP230_MODE:'enabled',SHARED_MEMBERSHIP230_CLOSURE_JSON:json,SHARED_MEMBERSHIP230_CLOSURE_SHA256:digest,BLOCKING_ROLE_IDS:BLOCK});
  await env.DB.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce)VALUES(?1,'','',?2,?3,'M2X')").bind(A,T,T+120).run();
  await roster.ingestRoster(env,T,[{name:'Fern Melder',guid:'Player-4613-12345678',rank:'Member',rankIndex:7}],load('./launch-verification227').captureLaunchVerification(env).scope.provenance);
  return codes.ticketFor(SECRET,'M2X',day());
 }
 async function invoke(code){const scopeHash=h('native-scope|1|'+scope.guild+'|'+scope.realm).slice(0,16),proof={version:1,member:true,observedAt:T,scopeHash,mac:crypto230.createHmac('sha256',SECRET).update('membership|1|fern melder|Player-4613-12345678|'+code+'|1|'+T+'|'+scopeHash).digest('hex').slice(0,32)};
  return ingest.postVerify(env,{character:'Fern Melder',code,source:'whisper',guid:'Player-4613-12345678',nativeMembership:proof});}
 const put=()=>http.filter(x=>x.method==='PUT').length,del=()=>http.filter(x=>x.method==='DELETE').length,rows=()=>db.prepare('SELECT * FROM role_settlements').all();
 let code=await fresh(),reply=await invoke(code);
 check('actual pre-seal consumed pending grants once and persists own ACK plus fresh server read',reply.status===200&&reply.body.roleGranted===true&&put()===1&&del()===0&&rows().some(x=>x.purpose==='launch_membership230'&&x.state==='settled'&&x.attempts===1&&x.reason==='launch230_put_acknowledged_and_confirmed'));
 load('./privacy-access-history');const definition=load('./privacy-access-family-history').privacyFamilyHistoryDefinition('community.councillor_verification.roleOutcomes'),history=await env.DB.batch(definition.statements(env,A,null,25)),own=history[1].results.map(r=>definition.project(r,T));
 check('existing bounded own-history route includes the new outcome without provider or source controls',own.some(x=>x.purpose==='launch_membership230')&&own.every(x=>!['guild_id','role_id','proof_id','request_digest','subject_generation','native_guid','native_profile','claim_nonce'].some(k=>Object.hasOwn(x,k)))&&history[0].results[0].total_count===1);
 db.close();
 code=await fresh({high:true});reply=await invoke(code);check('new fixed role assignment accepts a higher member role when the requested role is below the bot',reply.body.roleGranted===true&&put()===1);db.close();
 code=await fresh({targetAbove:true});reply=await invoke(code);check('new role-only mode still holds a requested role above the bot',!reply.body.roleGranted&&put()===0);db.close();
 code=await fresh({noManage:true});reply=await invoke(code);check('new role-only mode still requires Manage Roles',!reply.body.roleGranted&&put()===0);db.close();
 code=await fresh({blocked:true});reply=await invoke(code);check('new role-only mode still respects blocking roles',!reply.body.roleGranted&&put()===0);db.close();
 code=await fresh({already:true});reply=await invoke(code);check('present role observation has no PUT or invented attempted ACK',reply.body.roleGranted===true&&put()===0&&rows().some(x=>x.attempts===0&&x.reason==='launch230_current_role_observed'));db.close();
 code=await fresh({putUnknown:true});reply=await invoke(code);check('lost PUT response stays unknown and is never retried or compensated',reply.body.roleOutcome==='unknown'&&put()===1&&del()===0&&rows().some(x=>x.state==='unknown'&&x.reason==='launch230_provider_outcome_unknown'));db.close();
 code=await fresh({getFails:true});reply=await invoke(code);check('lost confirming member GET stays unknown without a compensating guess',reply.body.roleOutcome==='unknown'&&put()===1&&del()===0&&rows().some(x=>x.state==='unknown'));db.close();
 code=await fresh();let parallel=null,retained=null;
 capHook=async(e,cap,v)=>{retained={e,cap,v};parallel=await Promise.all([central.queueAndSettleLaunchMembership230(e,cap,v),central.queueAndSettleLaunchMembership230(e,cap,v)]);};reply=await invoke(code);
 check('parallel original capability calls spend one turn before their first await',put()===1&&parallel.filter(x=>x.state==='settled').length===1&&parallel.some(x=>x.reason==='launch230_original_consumption_required')&&rows().length===1);
 const replay=await central.queueAndSettleLaunchMembership230(retained.e,retained.cap,retained.v);check('returned invocation or spent original capability cannot mint a later operation',replay.state==='held'&&put()===1&&rows().length===1);db.close();
 code=await fresh();let forged;
 capHook=async(e,cap,v)=>{forged=await central.queueAndSettleLaunchMembership230(e,{...cap},v);};reply=await invoke(code);check('a copied capability cannot mint an intent but does not consume the real original',forged.state==='held'&&put()===1&&rows().length===1);db.close();
 code=await fresh({onHTTP:async(m,p)=>{if(m==='PUT')await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();}});reply=await invoke(code);
 check('own acknowledged grant losing admission mints one original-parent compensation child',put()===1&&del()===1&&!present.includes(R)&&rows().some(x=>x.purpose==='launch_membership_compensation230'&&x.state==='settled')&&rows().some(x=>x.purpose==='launch_membership230'&&x.reason==='launch230_compensated'));db.close();
 code=await fresh({putUnknown:true});reply=await invoke(code);const unknown=rows()[0],before=JSON.stringify(unknown);options.putUnknown=false;present=[];
 const observed=await central.observeLaunchMembershipDebt230(env,unknown.id);const afterUnknown=rows()[0];
 check('GET-only absence never upgrades lost PUT custody or sends a second effect',observed.state==='unknown'&&observed.reason==='launch230_absent_effect_unresolved'&&afterUnknown.state===unknown.state&&afterUnknown.reason===unknown.reason&&afterUnknown.claim_nonce===unknown.claim_nonce&&put()===1&&del()===0);db.close();
 for(const cause of ['ban','rename_hold','blocking_role','guild_departure']){
  code=await fresh();reply=await invoke(code);http=[];
  if(cause==='ban')await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();
  if(cause==='rename_hold')await env.DB.prepare("INSERT INTO rename_holds(discord_id,char_key,old_name,new_name,guid,nonce,state,decided_by,decided_at)VALUES(?1,'fern melder','Fern Melder','New Fixture Name','Player-4613-12345678','fixture','reapply',?1,?2)").bind(A,T).run();
  if(cause==='blocking_role')present.push(BLOCK);
  if(cause==='guild_departure'){
   await env.DB.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(A).run();
   await env.DB.prepare('DELETE FROM roster_members').run();await env.DB.prepare('UPDATE roster_snapshots SET member_count=0').run();
  }
  const removed=await central.settleVerifiedRemoval(env,A,cause,undefined,null);
  check('new '+cause+' removal requires current cause and owns a single DELETE plus confirmed ACK',removed.state==='settled'&&del()===1&&put()===0&&!present.includes(R)&&rows().some(x=>x.purpose==='launch_membership_removal230'&&x.reason==='launch230_delete_acknowledged_and_confirmed'));db.close();
 }
 code=await fresh();reply=await invoke(code);http=[];const noCause=await central.settleVerifiedRemoval(env,A,'ban',undefined,null);check('a removal selector alone supplies no cause authority',noCause.state==='held'&&del()===0&&rows().filter(x=>x.purpose==='launch_membership_removal230').length===0);db.close();
 for(const option of ['managed','wrongUser','notBot','privilegedRole']){code=await fresh({[option]:true});reply=await invoke(code);check('new grant refuses '+option+' inventory without PUT',put()===0&&!reply.body.roleGranted);db.close();}
 code=await fresh();reply=await invoke(code);http=[];await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();
 const missingG=await central.settleVerifiedRemoval(env,A,'ban');check('a lost original removal generation is held before any provider lookup',missingG.state==='held'&&missingG.reason==='original_removal_generation_required'&&http.length===0);db.close();
 code=await fresh();reply=await invoke(code);http=[];await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();let changedCause=false;
 options.onHTTP=async(m)=>{if(!changedCause&&m==='GET'){changedCause=true;await env.DB.prepare("UPDATE members SET ban_reason='new independent decision' WHERE discord_id=?1").bind(A).run();}};
 const changed=await central.settleVerifiedRemoval(env,A,'ban',undefined,null);check('cause row changing across provider await cannot borrow the newer decision',changedCause&&changed.state==='held'&&del()===0);db.close();
 code=await fresh();reply=await invoke(code);http=[];await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();let changedG=false;
 options.onHTTP=async(m)=>{if(!changedG&&m==='GET'){changedG=true;await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(A,'e'.repeat(32),T).run();}};
 const reincarnated=await central.settleVerifiedRemoval(env,A,'ban',undefined,null);check('older absent-generation removal cannot adopt an account created during provider lookup',changedG&&reincarnated.state==='held'&&del()===0);db.close();
 code=await fresh();reply=await invoke(code);http=[];present.push(BLOCK);let graphChanged=false;
 batchHook=(plan)=>{if(plan.some(x=>x.statement.includes("reason='launch230_dispatching'")&&x.statement.includes("launch_membership_removal230"))){graphChanged=true;options.lastMember.roles.length=0;}};
 const blockingChanged=await central.settleVerifiedRemoval(env,A,'blocking_role',undefined,null);check('mutation of the private fresh blocking result graph cannot dispatch DELETE',graphChanged&&blockingChanged.state==='held'&&del()===0);db.close();
 code=await fresh();let queuedGraph;
 batchHook=(plan,out)=>{if(plan.some(x=>x.statement.includes('launch230_awaiting_dispatch')))queuedGraph=out.find(x=>x.results?.some(y=>y.purpose==='launch_membership230'));};options.onHTTP=async()=>{if(queuedGraph)queuedGraph.meta.changes=9;};reply=await invoke(code);
 check('changed original queued ACK metadata holds before PUT',queuedGraph?.meta.changes===9&&put()===0);db.close();
 code=await fresh();let lost=false;batchHook=(plan)=>{if(!lost&&plan.some(x=>x.statement.includes("UPDATE role_settlements SET state='settled',reason='launch230_put_acknowledged_and_confirmed'"))){lost=true;throw Error('synthetic final Native ACK lost');}};reply=await invoke(code);const lostRow=rows()[0];options.onHTTP=null;const lostRead=await central.observeLaunchMembershipDebt230(env,lostRow.id);
 check('lost final Native ACK is recorded unknown and a later GET never upgrades it',lost&&reply.body.roleOutcome==='unknown'&&lostRow.state==='unknown'&&lostRead.state==='unknown'&&put()===1&&del()===0);db.close();
 code=await fresh();reply=await invoke(code);http=[];await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();present.push(HIGH);const legacy={...env,SHARED_MEMBERSHIP230_MODE:'off'};delete legacy.SHARED_MEMBERSHIP230_CLOSURE_JSON;delete legacy.SHARED_MEMBERSHIP230_CLOSURE_SHA256;
 const oldHierarchy=await central.settleVerifiedRemoval(legacy,A,'ban',undefined,null);check('the unchanged old generic route retains its higher-member hierarchy hold',oldHierarchy.state==='held'&&oldHierarchy.reason==='inventory_hierarchy_or_server_hold'&&del()===0);db.close();
 code=await fresh();await env.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at)VALUES(?1,?2,'roster_membership',?3,?4,1,'unknown','past_effect_absent',1,?5,?6,?7)").bind('1'.repeat(32),A,G,R,'2'.repeat(32),T-100,T+200).run();reply=await invoke(code);
 check('ambiguous historical physical-target custody cannot be cleared by a genuine new request',reply.body.roleOutcome==='held'&&put()===0&&rows().length===1&&rows()[0].reason==='past_effect_absent');db.close();
 code=await fresh();env.SHARED_MEMBERSHIP230_MODE='close-only';reply=await invoke(code);check('close-only genuine member ACK reaches the real uncapped role adapter with no old intent or PUT',uncapped===1&&reply.body.result==='member'&&reply.body.roleGranted===false&&put()===0&&rows().length===0);db.close();
 code=await fresh();await env.DB.prepare('DELETE FROM site_settings WHERE key LIKE ?1').bind(venue.SHARED_MEMBER230_SEAL_PREFIX+'%').run();reply=await invoke(code);check('missing exact DB closure seal prevents new-family intent and provider access',reply.body.roleGranted===false&&put()===0&&rows().length===0&&http.length===0);db.close();
 code=await fresh();reply=await invoke(code);http=[];await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(A).run();
 let overlapping=0,release;const overlap=new Promise(resolve=>release=resolve);options.onHTTP=async(m,p)=>{if(m==='GET'&&p==='/users/@me'){if(++overlapping===2)release();await overlap;}};
 const competing=await Promise.all([central.settleVerifiedRemoval(env,A,'ban',undefined,null),central.settleVerifiedRemoval(env,A,'ban',undefined,null)]);check('overlapping current-cause removals claim one DELETE and no second attempted ACK',overlapping===2&&del()===1&&competing.some(x=>x.reason==='removed')&&rows().filter(x=>x.purpose==='launch_membership_removal230'&&x.attempts===1).length===1);db.close();
 http=[];let rawDB=0,rawMember=0;const originalMember=stubs['./discord'].guildMember;stubs['./discord'].guildMember=async()=>{rawMember++;return {roles:[R,BLOCK]};};
 const raw={GUILD_ID:G,ROLE_GUILD_MEMBER:R,BLOCKING_ROLE_IDS:BLOCK,VERIFY_MEMBERSHIP_ONLY:'false',PRIVACY_ERASURE_ENABLED:'false',MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'false',SHARED_MEMBERSHIP230_MODE:'close-only',DB:{prepare(){rawDB++;throw Error('unexpected legacy DB');},batch(){rawDB++;throw Error('unexpected legacy batch');}}};
 const adapter=load('./roles');let priorRemovals=ROLE_REMOVES.length;
 const rawBan=await adapter.revokeForBan(raw,A,R,'synthetic ban',undefined,{subjectGeneration:null});check('closed raw legacy ban route has zero DB/provider/removal effects',rawBan===false&&rawDB===0&&rawMember===0&&http.length===0&&ROLE_REMOVES.length===priorRemovals);
 const rawRename=await adapter.revokeForReapply(raw,A,'synthetic rename',{subjectGeneration:null});check('closed raw legacy rename route has zero DB/provider/removal effects',rawRename==='failed'&&rawDB===0&&rawMember===0&&http.length===0&&ROLE_REMOVES.length===priorRemovals);
 const rawBlocking=await adapter.removeIfBlocked(raw,A,[R,BLOCK],'synthetic blocking',undefined,{subjectGeneration:null});check('closed raw legacy blocking route has zero DB/provider/removal effects',rawBlocking===null&&rawDB===0&&rawMember===0&&http.length===0&&ROLE_REMOVES.length===priorRemovals);stubs['./discord'].guildMember=originalMember;
 code=await fresh();const late={...env,VERIFY_MEMBERSHIP_ONLY:'false',PRIVACY_ERASURE_ENABLED:'false',MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'false',SHARED_MEMBERSHIP230_MODE:'off'};delete late.SHARED_MEMBERSHIP230_CLOSURE_JSON;delete late.SHARED_MEMBERSHIP230_CLOSURE_SHA256;
 let lateSeen=0,lateSent=0;const originalRemove=stubs['./discord'].removeRole;stubs['./discord'].removeRole=async(...args)=>{await Promise.resolve();late.SHARED_MEMBERSHIP230_MODE='close-only';lateSeen++;args[6]();lateSent++;};
 const lateHeld=await adapter.revokeForBan(late,A,R,'synthetic credential wait',undefined,{subjectGeneration:null});check('actual legacy ban callback rechecks the selector after a transport-shaped await',lateHeld===false&&lateSeen===1&&lateSent===0);stubs['./discord'].removeRole=originalRemove;
 const realPacket={exports:{}};new Function('module','exports','require',transpile(path.join(root,'src','discord.ts')))(realPacket,realPacket.exports,p=>load(p));let forwarded=0,forwardError;
 try{await realPacket.exports.removeRole(late,A,R,'synthetic callback forwarding',undefined,true,()=>{forwarded++;throw Error('late selector denied');});}catch(error){forwardError=error;}
 check('real Discord removeRole forwards the final synchronous restriction before native fetch',forwarded===1&&forwardError?.message==='late selector denied'&&http.length===0);db.close();
 console.log(ok+'/'+n+' launch230 Native settlement checks passed');process.exitCode=ok===n?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});`;
const runner230=new Module230(__filename,module);runner230.filename=__filename;runner230.paths=module.paths;runner230._compile(fixture230+body230,__filename);

// Synthetic real Workerd/D1 fixture. No provider implementation or production
// cookie issuer is replaced in the imported handler. Only outbound Discord is
// answered by the local test host.
import {handleSiteRoleAudit283,classifyRoleAudit283,ROLE_AUDIT_PAGE283,ROLE_AUDIT_FOCUSED_PAGE285} from '../src/site-role-audit283.ts';
import {currentUser,originalUserSession,b64u} from '../src/site-core.ts';
import {privacyBoundSiteEnv,privacyBoundSiteRoleActionEnv,privacyProviderCustodyDatabase} from '../src/privacy-serving-authority.ts';
import {captureRoutineMembership232,closeRoutineMembership232,routineMembership232Facts,routineMembership232Predicate,routineMembership232AttendedRoleMatches} from '../src/routine-membership-authority232.ts';
import {rest} from '../src/discord.ts';
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233,NATIVE_NAMES233} from '../src/canonical-ranks233.ts';
import {NATIVE_SCOPE232,SHARED_MEMBER232,NATIVE_GUILD232} from '../src/native-rank-reconciliation232.ts';
import {STEWARD_CANONICAL_PROFILE,STEWARD_RANK_NAMES,NATIVE_RANK_SCHEMES,qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {SHARED_MEMBER230_CONTRACT,SHARED_MEMBER230_SEAL_PREFIX,sharedMember230SHA256} from '../src/shared-membership-cutover230.ts';
import {reconcileRoleBatch242} from '../src/role-reconcile242.ts';
import {handleSiteRoleBaseline285,captureRoleGrantBaseline285,roleGrantBaselineFacts285,roleGrantBaselinePredicate285} from '../src/role-baseline285.ts';
const ADMIN='800000000000000001',SECOND_ADMIN='800000000000000002',BASE=800000000000001000n,EPOCH='a'.repeat(32),BIRTH='b'.repeat(32),SECOND_BIRTH='c'.repeat(32),SECRET='synthetic-role-audit-cookie',ROLE=CANONICAL_RANKS233[9].roleId;
let config,rawDB,physical=0,wires=[],ready=false,savedExport=null,savedAlt=null;const effects=new Map();
const baselineCaps=new Map(),baselineOld=new Map(),baselineActorBirth=new Map(),baselineCookies=new Map();let baselineAppendRace=null,baselineReadRace=null;
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d)return d.value;}throw Error('fixture method missing');};
const h=n=>n.toString(16).padStart(32,'0');
async function setup(db,layout='canonical',adminId=ADMIN,lateFinal=null){
 const catalogue=layout==='canonical'?JSON.parse(ADMISSION_EXPECTED_JSON):JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
 const objects=[...catalogue.tables,...catalogue.indexes].map(o=>db.prepare(o.sql));objects.push(db.prepare(catalogue.slotSQL));
 while(objects.length)await db.batch(objects.splice(0,40));
 const t=Math.floor(Date.now()/1000);
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(t),
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?1,?2,?3,?3,?3,1,0,1,?4)').bind(adminId,'Synthetic admin',t,BIRTH),
  db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(adminId),
  db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)VALUES(1,?1,?1,?2,1000,1,1)").bind(t,qualifiedNativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,NATIVE_RANK_SCHEMES.find(p=>p.canonicalProfile===STEWARD_CANONICAL_PROFILE))),
 ]);
 if(layout==='canonical')await db.batch([
  db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?1,?2,?3,?3,?3,1,0,1,?4)').bind(SECOND_ADMIN,'Synthetic second admin',t,SECOND_BIRTH),
  db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(SECOND_ADMIN),
 ]);
 const statements=[];
 for(let i=0;i<1000;i++){
  const name='Synthetic '+i,guid='Player-4613-'+(0x10000000+i).toString(16).toUpperCase();
  const nativeIndex=i===0?1:i===1?2:8;
  statements.push(db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)VALUES(1,?1,?2,?3,?4,?5,60)').bind(name.toLowerCase(),name,guid,STEWARD_RANK_NAMES[nativeIndex],nativeIndex));
  if(i<20){const id=String(BASE+BigInt(i));
   statements.push(db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(id));
   statements.push(db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)").bind(name.toLowerCase(),name,id,t-20,guid));
   statements.push(db.prepare('INSERT INTO roster_first_seen(name_key,first_seen)VALUES(?1,?2)').bind(name.toLowerCase(),t-900));
   statements.push(db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,'canonical_identity233',?3,?4,1,'settled','canonical233_original_control_verified',0,?5,?6,?7,?8,1,?9,?10,8,?11)")
    .bind(h(i+1),id,NATIVE_GUILD232,ROLE,'c'.repeat(64),t-10,t+290,t-9,guid,CANONICAL_PROFILE233,NATIVE_NAMES233[8]));
  }
 }
 while(statements.length)await db.batch(statements.splice(0,40));
 const closure={version:1,contract:SHARED_MEMBER230_CONTRACT,operationId:'d'.repeat(32),priorEpoch:'b'.repeat(32),writeEpoch:EPOCH,sourceCommit:'c'.repeat(40),sourceTree:'d'.repeat(40),bundleSHA256:'e'.repeat(64),providerA:'12345678-1234-1234-1234-123456789012',writerCoverageSHA256:'f'.repeat(64),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:t-3600,expiresAt:t-3300},closureJSON=JSON.stringify(closure);
 if(layout!=='canonical')await db.prepare('INSERT INTO site_settings(key,value,updated_at)VALUES(?1,?2,?3)').bind(SHARED_MEMBER230_SEAL_PREFIX+closure.operationId,closureJSON,t-3600).run();
 const triggers=catalogue.triggers.map(o=>db.prepare(o.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 config={DB:createPrivacyWriteAdmissionDatabase(db,'writer',layout,EPOCH),COOKIE_SECRET:SECRET,SITE_ADMINS:layout==='canonical'?adminId+','+SECOND_ADMIN:adminId,GUILD_ID:NATIVE_GUILD232,DISCORD_BOT_TOKEN:'role-audit-normal',DISCORD_APP_ID:'800000000000000003',
  CANONICAL_RANKS233:JSON.stringify({version:3,enabled:true,profile:STEWARD_CANONICAL_PROFILE,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))}),
  SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:NATIVE_GUILD232,
  VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),VERIFY_SECRET:'synthetic-verification-secret',SHARED_MEMBERSHIP230_MODE:'enabled',ROLE_GUILD_MEMBER:SHARED_MEMBER232,
  PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:layout,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};
 if(layout!=='canonical')Object.assign(config,{PRIVACY_NATIVE_ERASURE_ENABLED:'true',QR_PHASE1_ENABLED:'true',NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await sharedMember230SHA256(closureJSON)});
 rawDB=db;
 const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,value:async function(input,init){
  const packets=JSON.parse(init.body);physical+=Array.isArray(packets)?packets.length:1;
  const originalPackets=Array.isArray(packets)?packets:[packets];
  if(baselineAppendRace&&originalPackets.some(p=>p.sql?.startsWith('INSERT INTO audit(id,ts,actor,action,subject,details)')&&p.sql.includes('role.baseline285_adopted'))){const race=baselineAppendRace;baselineAppendRace=null;await baselineMutation285(race);}
  const response=await Reflect.apply(send,fetcher,[input,init]),responseText=await response.clone().text();wires.push({request:packets,status:response.status,response:responseText});
  if(baselineReadRace&&originalPackets.some(p=>p.sql?.includes(' AS oldCount')&&p.sql?.includes(' AS findingsJSON')&&p.params?.[0]===baselineSubject285(baselineReadRace.slot))){
   // Keep the real admitted response. Change the older adopter after its READ
   // was executed, before HMAC verification/final page admission; no response,
   // provider/source result or capability is manufactured by this hook.
   const race=baselineReadRace;baselineReadRace=null;await baselineMutation285({slot:race.slot,kind:'actor-denied'});
  }
  // Isolated latency case only: execute the real final Native SELECT, retain
  // its actual admitted answer, then delay returning that identical response.
  // No SQL/result/clock/capability is replaced and no provider timeout is bypassed.
  if(lateFinal&&lateFinal.armed!==false&&!lateFinal.observed){
   const statements=Array.isArray(packets)?packets:[packets],at=statements.findIndex(p=>/\)\s+SELECT 1 FROM role_settlements WHERE/.test(p.sql||'')&&(p.sql||'').includes("state='dispatching'")&&(p.sql||'').includes('claim_nonce'));
   if(at>=0){const decoded=JSON.parse(responseText),answers=Array.isArray(decoded)?decoded:[decoded],answer=answers[at];
    // Actual D1 transport returns columns/rows; D1 .all() projects objects only
    // above this hook. Inspect that real wire shape, never replace its answer.
    if(answer?.success===true&&answer.results?.columns?.length===1&&answer.results.columns[0]==='1'&&answer.results.rows?.length===1&&answer.results.rows[0]?.length===1&&answer.results.rows[0][0]===1){
     lateFinal.observed={executedAt:Math.floor(Date.now()/1000),returnedAt:null,sql:statements[at].sql,params:statements[at].params,columns:answer.results.columns,result:answer.results.rows};
     await new Promise(resolve=>setTimeout(resolve,lateFinal.delayMilliseconds||71000));lateFinal.observed.returnedAt=Math.floor(Date.now()/1000);
    }
   }
  }
  return response;
 }});ready=true;
}
async function cookie(adminId=ADMIN,expiresAt=Math.floor(Date.now()/1000)+3600){
 const body=b64u(new TextEncoder().encode(JSON.stringify({u:adminId,v:1,e:expiresAt,g:null,n:baselineActorBirth.get(adminId)??(adminId===SECOND_ADMIN?SECOND_BIRTH:BIRTH)})));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('olympus-site/session-incarnation-v1|'+SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return '__Host-olg='+body+'.'+b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))));
}
async function shortOriginalPreview(env,user,token,seconds=5){
 const s=originalUserSession(user),binding=JSON.stringify(['private-role-audit283-v1',env.GUILD_ID,s.u,s.v,s.e,s.g,s.n,env.CANONICAL_RANKS233,null])+'|preview';
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('private-role-audit283-v1\0'+SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
 const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0)),parts=token.split('.');
 const value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:new TextEncoder().encode(binding)},key,bytes(parts[2]))));
 if(seconds===null)return {token,expiresAt:value.expiresAt};
 // A shorter original encrypted preview, never a renewed/extended operation.
 value.issuedAt=Math.floor(Date.now()/1000);value.expiresAt=value.issuedAt+seconds;
 const iv=crypto.getRandomValues(new Uint8Array(12)),sealed='1.'+b64u(iv)+'.'+b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(binding)},key,new TextEncoder().encode(JSON.stringify(value)))));
 return {token:sealed,expiresAt:value.expiresAt};
}
function baselineSubject285(slot=2){if(!Number.isSafeInteger(slot)||slot<0||slot>39)throw Error('baseline_fixture_slot');return String(BASE+BigInt(slot));}
const baselineActor285=slot=>slot<4?ADMIN:String(800000000000000010n+BigInt(Math.floor(slot/4)-1));
async function baselineMutation285(spec){
 const subject=baselineSubject285(spec.slot),t=Math.floor(Date.now()/1000);
 if(spec.kind==='new-unknown')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at,roster_id,native_guid,native_profile)VALUES(?1,?2,'launch_membership230',?3,?4,1,'unknown','launch230_receipt_unknown',1,?5,?6,?7,?8,1,?9,'prime-native-230')").bind(h(3000+spec.slot),subject,NATIVE_GUILD232,ROLE,'8'.repeat(32),'9'.repeat(64),t-90000,t-89700,'Player-4613-'+(0x10000000+spec.slot).toString(16).toUpperCase()).run();
 if(spec.kind==='staff-purpose-unknown')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at)VALUES(?1,?2,'staff_roster_rank',?3,'900000000000000005',1,'unknown','native232_receipt_unknown',1,?4,?5,?6,?7)").bind(h(5000+spec.slot),subject,NATIVE_GUILD232,'8'.repeat(32),'9'.repeat(64),t-90000,t-89700).run();
 if(spec.kind==='known-refusal')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at)VALUES(?1,?2,'staff_roster_rank',?3,'900000000000000005',1,'held','native232_discord_403_no_effect',1,?4,?5,?6,?7)").bind(h(6000+spec.slot),subject,NATIVE_GUILD232,'8'.repeat(32),'9'.repeat(64),t-90000,t-89700).run();
 if(spec.kind==='active-claim')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,request_digest,created_at,expires_at)VALUES(?1,?2,'canonical_routine233',?3,?4,1,'pending','canonical233_queued',0,?5,?6,?7)").bind(h(4000+spec.slot),subject,NATIVE_GUILD232,ROLE,'e'.repeat(64),t,t+300).run();
 if(spec.kind==='privacy'||spec.kind==='generation')await config.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,?3,0,?4,?4)").bind(subject,'e'.repeat(32),spec.kind==='privacy'?'retiring':'active',t).run();
 if(spec.kind==='actor-denied')await config.DB.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?1').bind(spec.actor??baselineActor285(spec.slot)).run();
 if(spec.kind==='actor-version')await config.DB.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?1').bind(spec.actor??baselineActor285(spec.slot)).run();
 if(spec.kind==='actor-incarnation'){
  const actor=spec.actor??baselineActor285(spec.slot);
  // The genuine schema refuses changing an incarnation in place. Recreate the
  // synthetic account through DELETE+INSERT; no trigger is replaced/disabled.
  await config.DB.batch([config.DB.prepare('DELETE FROM site_users WHERE discord_id=?1').bind(actor),config.DB.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?1,?2,?3,?3,?3,1,0,1,?4)').bind(actor,'Recreated synthetic admin',t,'f'.repeat(32))]);
 }
 if(spec.kind==='actor-restore')await config.DB.prepare('UPDATE site_users SET denied=0,session_version=1 WHERE discord_id=?1').bind(spec.actor??baselineActor285(spec.slot)).run();
 if(spec.kind==='old-nonce')await config.DB.prepare('UPDATE role_settlements SET claim_nonce=?1 WHERE id=?2').bind('7'.repeat(32),h(1000+spec.slot)).run();
 if(spec.kind==='too-young')await config.DB.prepare('UPDATE role_settlements SET created_at=?1,expires_at=?2 WHERE id=?3').bind(t-3600,t-3300,h(1000+spec.slot)).run();
 if(spec.kind==='identity-control')await config.DB.prepare("UPDATE role_settlements SET purpose='canonical_identity233',native_profile=?1,native_rank=8,native_rank_name='Member' WHERE id=?2").bind(CANONICAL_PROFILE233,h(1000+spec.slot)).run();
 if(spec.kind==='canonical-delete'){
  await config.DB.prepare("UPDATE role_settlements SET purpose='canonical_routine233',desired=0,request_digest=?1,native_profile=?2,native_rank=8,native_rank_name='Member',reason='canonical233_delete_unknown' WHERE id=?3").bind('d'.repeat(32),CANONICAL_PROFILE233,h(1000+spec.slot)).run();
  baselineOld.set(spec.slot,await rawDB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(h(1000+spec.slot)).first());
 }
 if(spec.kind==='malformed-profile')await config.DB.prepare("UPDATE role_settlements SET native_profile='unknown-native-profile' WHERE id=?1").bind(h(1000+spec.slot)).run();
 if(spec.kind==='delete-finding')await config.DB.prepare("DELETE FROM audit WHERE action='role.baseline285_adopted' AND subject=?1").bind(subject).run();
 if(spec.kind==='tamper-finding'){
  const a=await rawDB.prepare("SELECT id,details FROM audit WHERE action='role.baseline285_adopted' AND subject=?1 ORDER BY id DESC LIMIT 1").bind(subject).first(),d=JSON.parse(a.details);d.signature=(d.signature[0]==='0'?'1':'0')+d.signature.slice(1);
  await config.DB.prepare('UPDATE audit SET details=?1 WHERE id=?2').bind(JSON.stringify(d),a.id).run();
 }
 if(spec.kind==='source'){
  const prior=await config.DB.prepare('SELECT MAX(id) AS id FROM roster_snapshots').first(),id=prior.id+1;
  await config.DB.batch([config.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)SELECT ?1,?2,?2,source,member_count,complete,trusted FROM roster_snapshots WHERE id=?3').bind(id,t,prior.id),config.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT ?1,name_key,name,guid,rank,rank_index,level FROM roster_members WHERE snapshot_id=?2').bind(id,prior.id)]);
 }
 if(spec.kind==='forged-finding')await config.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,?2,'role.baseline285_adopted',?3,?4)").bind(t,ADMIN,subject,JSON.stringify({version:1,kind:'olympus-role-grant-baseline285-v1',payload:{actor:ADMIN,actorGeneration:null,actorSessionVersion:1,actorAccountIncarnation:BIRTH,subject,oldId:h(1000+spec.slot)},signature:'0'.repeat(64),_privacySubjectIds:[ADMIN,subject]})).run();
 if(spec.kind==='policy'){
  const value=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});config.CANONICAL_RANKS233=value;
  for(const saved of baselineCaps.values())saved.env.CANONICAL_RANKS233=value;
 }
 if(spec.kind==='departure'){
  const prior=await config.DB.prepare('SELECT MAX(id)AS id FROM roster_snapshots').first(),id=prior.id+1,guid='Player-4613-'+(0x10000000+spec.slot).toString(16).toUpperCase();
  await config.DB.batch([config.DB.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(subject),config.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)SELECT ?1,?2,?2,source,member_count-1,complete,trusted FROM roster_snapshots WHERE id=?3').bind(id,t,prior.id),config.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT ?1,name_key,name,guid,rank,rank_index,level FROM roster_members WHERE snapshot_id=?2 AND guid<>?3').bind(id,prior.id,guid)]);
 }
}

// One isolated case uses ordinary request boundaries as evidence phases, so
// the host can count each physical provider mutation without clock inference.
// Each later source is a genuinely new immutable complete roster snapshot.
async function deleteExpiryEffect284(bindings,spec){
 const kind='final-d1-delete-expired',subject=String(BASE+1n),step=spec.step;
 let state=effects.get(kind);
 const receipts=async()=> (await state.db.prepare('SELECT * FROM role_settlements WHERE subject=?1 ORDER BY created_at,id').bind(subject).all()).results;
 const rowById=id=>state.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(id).first();
 const source=id=>state.db.prepare('SELECT s.*,r.guid,r.name_key,r.rank,r.rank_index FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id WHERE s.id=?1 AND r.guid=?2').bind(id,'Player-4613-10000001').first();
 const transport284=captured=>{
  const packets=captured.flatMap(w=>Array.isArray(w.request)?w.request:[w.request]);let failed=0;
  for(const w of captured){try{const replies=JSON.parse(w.response),answers=Array.isArray(replies)?replies:[replies];failed+=w.status!==200?1:answers.filter(r=>r.success!==true).length;}catch{failed++;}}
  return {sentPhysicalStatements:packets.length,maxSentSQLBytes:Math.max(0,...packets.map(p=>new TextEncoder().encode(p.sql||'').length)),maxSentBinds:Math.max(0,...packets.map(p=>p.params?.length??0)),failedTransportReplies:failed};
 };
 const invoke=async(method,body={})=>{
  const req=new Request('https://guild.example/api/admin/role-audit'+(method==='GET'?'?subject='+subject:''),{method,headers:{Cookie:state.cookie,Origin:'https://guild.example','X-Olympus':'2'}}),user=await currentUser(state.config,req);
  const response=await handleSiteRoleAudit283(req,privacyBoundSiteEnv(state.config,originalUserSession(user)),user,body);
  return {status:response.status,body:await response.json()};
 };
 const advance=async(id,from)=>{
  const t=Math.floor(Date.now()/1000);
  await state.config.DB.batch([
   state.config.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted) SELECT ?1,?2,?2,source,member_count,complete,trusted FROM roster_snapshots WHERE id=?3').bind(id,t,from),
   state.config.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level) SELECT ?1,name_key,name,guid,CASE WHEN guid=?2 THEN ?3 ELSE rank END,CASE WHEN guid=?2 THEN 2 ELSE rank_index END,level FROM roster_members WHERE snapshot_id=?4').bind(id,'Player-4613-10000001',STEWARD_RANK_NAMES[2],from),
  ]);
  return source(id);
 };
 if(step==='bootstrap'){
  if(state)return new Response(null,{status:409});
  const saved={config,rawDB,ready},lateFinal={armed:false,observed:null,delayMilliseconds:121000},adminId='800000000000000110';
  await setup(bindings.DB_EFFECT_final_d1_delete_expired,'recorded-live-pre-seal-20261017',adminId,lateFinal);
  state={config:{...config,DISCORD_BOT_TOKEN:'role-audit-effect-'+kind,CANONICAL_RANKS233:JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))})},db:rawDB,adminId,lateFinal,stage:'bootstrap',cookie:await cookie(adminId)};
  effects.set(kind,state);({config,rawDB,ready}=saved);
  // Existing synthetic identity proof remains untouched. This source records
  // an actual Officer3 native row and the normal writer creates its real ACK.
  await state.config.DB.prepare('UPDATE roster_members SET rank=?1,rank_index=3 WHERE snapshot_id=1 AND guid=?2').bind(STEWARD_RANK_NAMES[3],'Player-4613-10000001').run();
  const preview=await invoke('GET'),row=preview.body.rows?.[0],action=row?.previewToken?await invoke('POST',{subject,previewToken:row.previewToken,confirm:true}):null;
  const history=await receipts(),owned=history.find(r=>r.desired===1&&r.attempts===1&&r.state==='settled'&&r.reason==='canonical233_put_acknowledged_and_confirmed'&&r.role_id===CANONICAL_RANKS233[2].roleId);
  if(!owned)return Response.json({step,subject,preview,action,history,error:'genuine_original_officer_ack_missing'},{status:409});
  state.owned=owned;state.snapshot1=await source(1);
  const t=Math.floor(Date.now()/1000);await state.config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_original_unknown',1,?5,?6,?7)").bind('8'.repeat(32),String(BASE+2n),NATIVE_GUILD232,ROLE,'7'.repeat(32),t-900,t-600).run();
  state.unrelatedUnknown=await rowById('8'.repeat(32));state.stage='bootstrap_done';
  return Response.json({step,subject,servingPolicy:1,preview,action,history,originalOwned:owned,snapshot1:state.snapshot1,unrelatedUnknown:state.unrelatedUnknown,actualLocalWorkerdD1:true});
 }
 if(!state)return new Response(null,{status:409});
 if(step==='expire'&&state.stage==='bootstrap_done'){
  const wireStart284=wires.length;state.stage='expiring';state.snapshot2=await advance(2,1);
  const preview=await invoke('GET'),row=preview.body.rows?.[0];let previewExpiresAt=null;
  const capture=await captureRoutineMembership232(state.config,subject);let nativeDeadline=null;
  if(capture){try{nativeDeadline=routineMembership232Facts(capture).deadline;}finally{closeRoutineMembership232(capture);}}
  if(row?.previewToken){const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:state.cookie}}),user=await currentUser(state.config,req),original=await shortOriginalPreview(state.config,user,row.previewToken,120);row.previewToken=original.token;previewExpiresAt=original.expiresAt;}
  state.lateFinal.armed=true;
  const action=row?.previewToken?await invoke('POST',{subject,previewToken:row.previewToken,confirm:true}):null;
  state.lateFinal.armed=false;
  const history=await receipts(),neverSent=history.find(r=>r.desired===0&&r.attempts===1&&r.state==='held'&&r.reason==='canonical233_never_dispatched'&&r.request_digest===state.owned.id);
  state.neverSent=neverSent;state.expiredHistory=history;state.stage='expired';
  const stageWires284=wires.slice(wireStart284);
  return Response.json({stageTransport284:transport284(stageWires284),wireCapture284:stageWires284,schemaCapture284:(await state.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results,step,subject,servingPolicy:1,preview,action,previewExpiresAt,nativeDeadline,lateFinal:state.lateFinal.observed,history,originalOwned:state.owned,originalOwnedAfter:await rowById(state.owned.id),neverSent,unrelatedUnknown:state.unrelatedUnknown,unrelatedUnknownAfter:await rowById('8'.repeat(32)),snapshot1After:await source(1),snapshot2:state.snapshot2,actualLocalWorkerdD1:true});
 }
 if(step==='recover'&&state.stage==='expired'){
  const wireStart284=wires.length;state.stage='recovering';const snapshot3=await advance(3,2),review=await invoke('GET');
  // A fresh normal reconcile with a new original source may create NEW
  // intents. The old attempted child, its nonce and snapshot2 are never reset.
  const sweep=await reconcileRoleBatch242(state.config,[subject]),after=await invoke('GET'),history=await receipts();
  state.stage='done';
  const stageWires284=wires.slice(wireStart284);
  return Response.json({stageTransport284:transport284(stageWires284),wireCapture284:stageWires284,step,subject,servingPolicy:1,review,sweep,after,history,originalOwned:state.owned,originalOwnedAfter:await rowById(state.owned.id),neverSent:state.neverSent,neverSentAfter:state.neverSent?await rowById(state.neverSent.id):null,unrelatedUnknown:state.unrelatedUnknown,unrelatedUnknownAfter:await rowById('8'.repeat(32)),snapshot1:state.snapshot1,snapshot1After:await source(1),snapshot2:state.snapshot2,snapshot2After:await source(2),snapshot3,intents:(await state.db.prepare("SELECT actor,action,subject,details FROM audit WHERE action='role.audit_requested283'").all()).results,actualLocalWorkerdD1:true});
 }
 return new Response(null,{status:409});
}

export default {async fetch(request,bindings){
 const path=new URL(request.url).pathname;
 if(path==='/baseline285/setup'){
  await setup(bindings.DB,'recorded-live-pre-seal-20261017',ADMIN);const t=Math.floor(Date.now()/1000),rows=[];
  const actors=[ADMIN,...Array.from({length:9},(_,i)=>String(800000000000000010n+BigInt(i)))];
  for(const actor of actors.slice(1)){baselineActorBirth.set(actor,h(BigInt(actor)));rows.push(config.DB.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version,account_incarnation)VALUES(?1,?2,?3,?3,?3,1,0,1,?4)').bind(actor,'Synthetic baseline admin',t,baselineActorBirth.get(actor)),config.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(actor));}
  for(let slot=20;slot<40;slot++){const subject=baselineSubject285(slot),guid='Player-4613-'+(0x10000000+slot).toString(16).toUpperCase();rows.push(config.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(subject),config.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)").bind('synthetic '+slot,'Synthetic '+slot,subject,t-20,guid),config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,'canonical_identity233',?3,?4,1,'settled','canonical233_original_control_verified',0,?5,?6,?7,?8,1,?9,?10,8,'Member')").bind(h(slot+1),subject,NATIVE_GUILD232,ROLE,'c'.repeat(64),t-10,t+290,t-9,guid,CANONICAL_PROFILE233));}
  while(rows.length)await config.DB.batch(rows.splice(0,30));config.SITE_ADMINS=actors.join(',');
  // Keep an actual older source for the old claim and a distinct fresh source
  // for today's decision; an old claim is never attached to a future export.
  await config.DB.batch([config.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)SELECT 2,?1,?1,source,member_count,complete,trusted FROM roster_snapshots WHERE id=1').bind(t),config.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 2,name_key,name,guid,rank,rank_index,level FROM roster_members WHERE snapshot_id=1'),config.DB.prepare('UPDATE roster_snapshots SET exported_at=?1,received_at=?1 WHERE id=1').bind(t-90001)]);
  for(let slot=0;slot<40;slot++)rows.push(config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at,roster_id,native_guid,native_profile)VALUES(?1,?2,'launch_membership230',?3,?4,1,'dispatching','launch230_dispatching',1,?5,?6,?7,?8,1,?9,'prime-native-230')").bind(h(1000+slot),baselineSubject285(slot),NATIVE_GUILD232,ROLE,'8'.repeat(32),'9'.repeat(64),t-90000,t-89700,'Player-4613-'+(0x10000000+slot).toString(16).toUpperCase()));
  while(rows.length)await config.DB.batch(rows.splice(0,30));for(let slot=0;slot<40;slot++)baselineOld.set(slot,await rawDB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(h(1000+slot)).first());
  for(const actor of actors)baselineCookies.set(actor,await cookie(actor));
  return Response.json({cookie:await cookie(),subject:baselineSubject285(2),admin:ADMIN,initiate:CANONICAL_RANKS233[11].roleId,member:ROLE,officer:CANONICAL_RANKS233[2].roleId,ranks:CANONICAL_RANKS233,pageLimit:ROLE_AUDIT_PAGE283,focusedPageLimit:ROLE_AUDIT_FOCUSED_PAGE285});
 }
 if(path==='/baseline285/run'){
  const spec=await request.json(),subject=baselineSubject285(spec.slot),before=physical,start=wires.length,env={...config,DISCORD_BOT_TOKEN:'baseline285-'+(spec.mode||'normal'),...(spec.blocking?{BLOCKING_ROLE_IDS:spec.blocking}:{})},method=spec.method||'GET';
  const selectedActor=spec.actor??baselineActor285(spec.slot??2),req=new Request('https://guild.example/api/admin/role-baseline'+(method==='GET'?'?subject='+subject:''),{method,headers:{Cookie:spec.cookie||baselineCookies.get(selectedActor)||await cookie(selectedActor),Origin:spec.badOrigin?'https://elsewhere.invalid':'https://guild.example','X-Olympus':'2'}}),user=await currentUser(env,req);
  if(!user)return Response.json({status:401,result:{error:'signed_out'},statements:physical-before});
  const response=await handleSiteRoleBaseline285(req,privacyBoundSiteEnv(env,originalUserSession(user)),user,method==='POST'?{subject,previewToken:spec.token,confirm:spec.confirm??true}:{});
  const result=await response.json(),queries=wires.slice(start).flatMap(w=>Array.isArray(w.request)?w.request:[w.request]).map(s=>({sqlBytes:new TextEncoder().encode(s.sql||'').length,bindings:s.params?.length??0,kind:s.sql?.startsWith('INSERT INTO audit(id,ts,actor,action,subject,details)')?'baseline_append':'read_or_admission'}));
  wires.length=0;return Response.json({status:response.status,result,statements:physical-before,queries,actualLocalWorkerdD1:true});
 }
 if(path==='/baseline285/cap'){
  const spec=await request.json(),subject=baselineSubject285(spec.slot),env={...config},saved=spec.retained?baselineCaps.get(spec.slot):null;
  const cap=spec.forged?Object.freeze({kind:'original_signed_grant_baseline285'}):saved?.cap??await captureRoleGrantBaseline285(env,subject,null),owner=saved?.env??env;
  if(!cap)return Response.json({captured:false});if(spec.keep)baselineCaps.set(spec.slot,{cap,env:owner});
  const proto=Object.getPrototypeOf(owner);let inherited=false;
  try{if(spec.inheritedOptional){if('BLOCKING_ROLE_IDS'in owner)throw Error('fixture optional slot already present');Object.defineProperty(proto,'BLOCKING_ROLE_IDS',{value:'900000000000000005',configurable:true});inherited=true;}
   const facts=roleGrantBaselineFacts285(cap),p=roleGrantBaselinePredicate285(owner,cap,1,'old'),matches=await privacyProviderCustodyDatabase(owner).prepare('SELECT old.id FROM role_settlements old WHERE '+p.sql).bind(...p.values).all();p.check();return Response.json({captured:true,facts,matchingRows:matches.results.length});
  }catch(e){return Response.json({captured:false,held:String(e.message)});}finally{if(inherited)Reflect.deleteProperty(proto,'BLOCKING_ROLE_IDS');}
 }
 if(path==='/baseline285/arm-info-race'){const spec=await request.json();baselineReadRace={slot:spec.slot};return Response.json({armed:true});}
 if(path==='/baseline285/mutate'){
  const spec=await request.json();if(spec.atAppend)baselineAppendRace={kind:spec.kind,slot:spec.slot};else await baselineMutation285(spec);return Response.json({ok:true});
 }
 if(path==='/baseline285/state'){
  const spec=await request.json(),subject=baselineSubject285(spec.slot),current=await rawDB.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(h(1000+spec.slot)).first(),all=(await rawDB.prepare('SELECT * FROM role_settlements WHERE subject=?1 ORDER BY created_at,id').bind(subject).all()).results,audits=(await rawDB.prepare("SELECT * FROM audit WHERE action='role.baseline285_adopted' AND subject=?1 ORDER BY id").bind(subject).all()).results;
  return Response.json({original:baselineOld.get(spec.slot),current,all,audits});
 }
 if(path==='/baseline285/reconcile'){
  const spec=await request.json(),before=physical,env={...config,DISCORD_BOT_TOKEN:'baseline285-reconcile'};
  return Response.json({result:await reconcileRoleBatch242(env,[baselineSubject285(spec.slot)]),statements:physical-before});
 }
 if(path==='/setup'){if(ready)return new Response(null,{status:409});await setup(bindings.DB);const shortSessionExpiresAt=Math.floor(Date.now()/1000)+90;return Response.json({cookie:await cookie(),secondCookie:await cookie(SECOND_ADMIN),shortCookie:await cookie(SECOND_ADMIN,shortSessionExpiresAt),shortSessionExpiresAt,admin:ADMIN,subject:String(BASE),role:ROLE,council:CANONICAL_RANKS233[1].roleId,officer:CANONICAL_RANKS233[2].roleId,ranks:CANONICAL_RANKS233,nativeRows:1000,pageLimit:ROLE_AUDIT_PAGE283,focusedPageLimit:ROLE_AUDIT_FOCUSED_PAGE285});}
 if(!ready)return new Response(null,{status:409});
 if(path==='/mutate'){
  const body=await request.json();
  // Attended synthetic changes are made by the existing admitted writer, never
  // through the module under test. No historical row is reset.
  if(body.kind==='session')await config.DB.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(ADMIN).run();
  if(body.kind==='denied')await config.DB.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?1').bind(ADMIN).run();
  if(body.kind==='left')await config.DB.prepare('UPDATE site_users SET in_server=0 WHERE discord_id=?1').bind(ADMIN).run();
  if(body.kind==='banned')await config.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ADMIN).run();
  if(body.kind==='restore')await config.DB.batch([config.DB.prepare('UPDATE site_users SET denied=0,in_server=1 WHERE discord_id=?1').bind(ADMIN),config.DB.prepare('UPDATE members SET banned=0 WHERE discord_id=?1').bind(ADMIN)]);
  if(body.kind==='history'){
   const t=Math.floor(Date.now()/1000),rows=[];
   for(let i=0;i<105;i++)rows.push(config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?1,?2,'canonical_routine233',?3,?4,1,'held','synthetic_expired_unattempted',0,?5,?6)").bind(h(5000+i),String(BASE),NATIVE_GUILD232,ROLE,t-500+i,t-300+i));
   while(rows.length)await config.DB.batch(rows.splice(0,30));
  }
  if(body.kind==='characters'){
   const t=Math.floor(Date.now()/1000),rows=[];
   for(let i=0;i<51;i++)rows.push(config.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source)VALUES(?1,?2,?3,'verified',?4,?4,'whisper')").bind('bounded alt '+i,'Bounded Alt '+i,String(BASE+2n),t-10));
   while(rows.length)await config.DB.batch(rows.splice(0,30));
  }
  if(body.kind==='privacy'){
   const t=Math.floor(Date.now()/1000);await config.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'retiring',0,?3,?3)").bind(String(BASE),'e'.repeat(32),t).run();
  }
  if(body.kind==='stale')await config.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now')AS INTEGER)-601 WHERE id=1").run();
  if(body.kind==='source-change'){savedExport=(await config.DB.prepare('SELECT exported_at FROM roster_snapshots WHERE id=1').first()).exported_at;await config.DB.prepare('UPDATE roster_snapshots SET exported_at=exported_at-1 WHERE id=1').run();}
  if(body.kind==='source-restore'&&savedExport!==null){await config.DB.prepare('UPDATE roster_snapshots SET exported_at=?1 WHERE id=1').bind(savedExport).run();savedExport=null;}
  if(body.kind==='alt-case'){savedAlt=await config.DB.prepare("SELECT rank,rank_index FROM roster_members WHERE snapshot_id=1 AND name_key='synthetic 2'").first();await config.DB.prepare("UPDATE roster_members SET rank='Alt',rank_index=7 WHERE snapshot_id=1 AND name_key='synthetic 2'").run();}
  if(body.kind==='alt-restore'&&savedAlt){await config.DB.prepare("UPDATE roster_members SET rank=?1,rank_index=?2 WHERE snapshot_id=1 AND name_key='synthetic 2'").bind(savedAlt.rank,savedAlt.rank_index).run();savedAlt=null;}
  if(body.kind==='unknown')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_lost_reply',1,?5,?6)").bind('d'.repeat(32),String(BASE),NATIVE_GUILD232,ROLE,Math.floor(Date.now()/1000)-900,Math.floor(Date.now()/1000)-600).run();
  if(body.kind==='proof-required'){
   const t=Math.floor(Date.now()/1000),queued=String(BASE+20n),unproved=String(BASE+21n);
   await config.DB.batch([config.DB.prepare('INSERT INTO members(discord_id)VALUES(?1),(?2)').bind(queued,unproved),
    config.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('synthetic 20','Synthetic 20',?1,'queued',?3,?3,'whisper','Player-4613-10000014'),('synthetic 21','Synthetic 21',?2,'member',?3,?3,'whisper','Player-4613-10000015')").bind(queued,unproved,t-20)]);
  }
  return Response.json({ok:true});
 }
 if(path==='/effect-mutate'){
  const spec=await request.json(),state=effects.get(spec.kind);if(!state)return new Response(null,{status:404});
  if(spec.change==='denied')await state.config.DB.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?1').bind(state.adminId).run();
  if(spec.change==='export')await state.config.DB.prepare('UPDATE roster_snapshots SET exported_at=exported_at+1 WHERE id=1').run();
  return Response.json({ok:true});
 }
 if(path==='/effect-run'){
  const spec=await request.json(),kind=spec.kind;if(kind==='final-d1-delete-expired')return deleteExpiryEffect284(bindings,spec);if(effects.has(kind))return new Response(null,{status:409});
  const adminId=String(800000000000000100n+BigInt(['baseline','before-denied','after-denied','before-export','wrong-role','preview-expired','preview-control','preview-reserve','serving-v1','final-d1-expired'].indexOf(kind)));
  const lateFinal=kind==='final-d1-expired'?{observed:null}:null;
  const original={config,rawDB,ready};await setup(bindings['DB_EFFECT_'+kind.replaceAll('-','_')],'recorded-live-pre-seal-20261017',adminId,lateFinal);
  const state={config:{...config,DISCORD_BOT_TOKEN:'role-audit-effect-'+kind},db:rawDB,adminId};effects.set(kind,state);({config,rawDB,ready}=original);
  const effectSubject=kind==='serving-v1'?String(BASE+2n):String(BASE);
  if(kind==='serving-v1')state.config.CANONICAL_RANKS233=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
  let unrelatedUnknown=null;
  if(kind==='final-d1-expired'){
   const t=Math.floor(Date.now()/1000);await state.config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_original_unknown',1,?5,?6,?7)").bind('8'.repeat(32),String(BASE+1n),NATIVE_GUILD232,ROLE,'7'.repeat(32),t-900,t-600).run();
   unrelatedUnknown=await state.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind('8'.repeat(32)).first();
  }
  const ownedId='f'.repeat(32);
  if(['preview-control','preview-reserve'].includes(kind)){
   const t=Math.floor(Date.now()/1000);
   await state.config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'settled','canonical233_put_acknowledged_and_confirmed',1,?5,?6,?7,?8,?9,1,'Player-4613-10000000',?10,3,'Officer')")
    .bind(ownedId,String(BASE),NATIVE_GUILD232,CANONICAL_RANKS233[2].roleId,'1'.repeat(32),'2'.repeat(64),t-10,t+290,t-9,CANONICAL_PROFILE233).run();
  }
  const originalOwned=['preview-control','preview-reserve'].includes(kind)?await state.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(ownedId).first():null;
  const cookieValue=await cookie(adminId),start=physical,invoke=async(method,body={})=>{
   const req=new Request('https://guild.example/api/admin/role-audit'+(method==='GET'?'?subject='+effectSubject:''),{method,headers:{Cookie:cookieValue,Origin:'https://guild.example','X-Olympus':'2'}}),user=await currentUser(state.config,req);
   const response=await handleSiteRoleAudit283(req,privacyBoundSiteEnv(state.config,originalUserSession(user)),user,body);return {status:response.status,body:await response.json()};
  };
  const preview=await invoke('GET'),row=preview.body.rows?.[0];let action,previewExpiresAt=null;
  const nativeCapture=await captureRoutineMembership232(state.config,effectSubject);let nativeDeadline=null;
  if(nativeCapture){try{nativeDeadline=routineMembership232Facts(nativeCapture).deadline;}finally{closeRoutineMembership232(nativeCapture);}}
  if(['preview-expired','preview-control','preview-reserve','final-d1-expired'].includes(kind)&&row?.previewToken){
   const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:cookieValue}}),user=await currentUser(state.config,req),shortened=await shortOriginalPreview(state.config,user,row.previewToken,kind==='preview-control'?120:kind==='preview-reserve'?30:kind==='final-d1-expired'?70:5);
   row.previewToken=shortened.token;previewExpiresAt=shortened.expiresAt;
  }
  if(kind==='wrong-role'){
   const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:cookieValue}}),user=await currentUser(state.config,req),snapshot=await state.db.prepare('SELECT exported_at FROM roster_snapshots WHERE id=1').first();
   const bound=privacyBoundSiteRoleActionEnv(privacyBoundSiteEnv(state.config,originalUserSession(user)),originalUserSession(user),{subject:String(BASE),snapshotId:1,snapshotAt:snapshot.exported_at,expectedRole:ROLE,expiresAt:Math.floor(Date.now()/1000)+120});
   action={status:200,body:await reconcileRoleBatch242(bound,[String(BASE)])};
  }else action=row?.previewToken?await invoke('POST',{subject:row.id,previewToken:row.previewToken,confirm:true}):{status:409,body:{error:'fixture_preview_not_ready',preview:preview.body.error}};
  const receipts=(await state.db.prepare('SELECT id,purpose,role_id,desired,state,reason,attempts,request_digest,claim_nonce,created_at,expires_at,native_profile,native_rank,native_rank_name FROM role_settlements WHERE subject=?1 ORDER BY created_at,id').bind(effectSubject).all()).results;
  const actor=await state.db.prepare('SELECT denied,in_server FROM site_users WHERE discord_id=?1').bind(state.adminId).first();
  const intents=(await state.db.prepare("SELECT actor,action,subject,details FROM audit WHERE action='role.audit_requested283'").all()).results;
  const originalOwnedAfter=originalOwned?await state.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(ownedId).first():null;
  const unrelatedUnknownAfter=unrelatedUnknown?await state.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind('8'.repeat(32)).first():null;
  return Response.json({subject:effectSubject,servingPolicy:JSON.parse(state.config.CANONICAL_RANKS233).version,previewStatus:preview.status,previewReady:!!row?.previewToken,previewExpiresAt,nativeDeadline,action,receipts,actor,intents,originalOwned,originalOwnedAfter,lateFinal:lateFinal?.observed??null,unrelatedUnknown,unrelatedUnknownAfter,statements:physical-start,actualLocalWorkerdD1:true});
 }
 if(path==='/unit'){
  const t=Math.floor(Date.now()/1000),manual=CANONICAL_RANKS233[2].roleId;
  const nativeStaff=classifyRoleAudit283([manual],ROLE,[{id:'2',role:manual,desired:1,state:'settled',attempts:1,reason:'native232_put_acknowledged_and_confirmed',created:t-10,expiry:t+290,checked:t-9,generation:null,parent:null}],null,false);
  const noReceipt=classifyRoleAudit283([manual],ROLE,[],null,false),unknown=classifyRoleAudit283([],ROLE,[{id:'1',role:ROLE,desired:1,state:'unknown',attempts:1,reason:'lost',created:t-900,expiry:t-600,checked:null,generation:null,parent:null}],null,false);
  return Response.json({noReceipt,nativeStaff,unknown});
 }
 if(path==='/plans'){
  const captured=wires.flatMap(w=>Array.isArray(w.request)?w.request:[w.request]);
  const prefixes=['WITH audit_never_sent_shape284 AS MATERIALIZED','SELECT wanted.value AS id FROM json_each','SELECT COUNT(DISTINCT c.discord_id) AS subjects','SELECT DISTINCT c.discord_id AS id FROM characters c'];
  const plans=[];
  for(const prefix of prefixes){const statement=captured.find(s=>s.sql?.startsWith(prefix));if(!statement)return Response.json({error:'captured_query_missing',prefix},{status:409});
   plans.push({prefix,sqlBytes:new TextEncoder().encode(statement.sql).byteLength,bindings:statement.params.length,plan:(await rawDB.prepare('EXPLAIN QUERY PLAN '+statement.sql).bind(...statement.params).all()).results});}
  return Response.json({actualLocalWorkerdD1:true,nativeRows:1000,plans});
 }
 if(path==='/guard'){
  const spec=await request.json(),before=physical,env={...config,DISCORD_BOT_TOKEN:'role-audit-guard-'+spec.kind};
  const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:spec.cookie}}),user=await currentUser(env,req);
  if(!user)return Response.json({error:'guard_actor_missing'},{status:409});
  const bound=privacyBoundSiteRoleActionEnv(privacyBoundSiteEnv(env,originalUserSession(user)),originalUserSession(user));
  const prior=await bound.DB.prepare('SELECT 1 AS ok').first();
  await rest(env,'GET',`/guilds/${NATIVE_GUILD232}/members?limit=1000&after=0`,undefined,1);
  let refused=false;try{await bound.DB.prepare('SELECT 1 AS ok').first();}catch{refused=true;}
  const actual=await rawDB.prepare('SELECT denied,in_server,(SELECT banned FROM members WHERE discord_id=?1)AS banned FROM site_users WHERE discord_id=?1').bind(ADMIN).first();
  return Response.json({prior,refused,actual,statements:physical-before,actualLocalWorkerdD1:true});
 }
 if(path==='/native-guard'){
  const spec=await request.json(),before=physical,env={...config,DISCORD_BOT_TOKEN:'role-audit-'+(spec.kind||'normal')};
  const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:spec.cookie}}),user=await currentUser(env,req);
  if(!user)return Response.json({error:'native_guard_actor_missing'},{status:409});
  const snapshot=await rawDB.prepare('SELECT id,exported_at FROM roster_snapshots WHERE id=1').first(),expected=CANONICAL_RANKS233[1].roleId;
  const selection={subject:String(BASE),snapshotId:snapshot.id,snapshotAt:snapshot.exported_at,expectedRole:expected,expiresAt:Math.floor(Date.now()/1000)+120};
  if(spec.wrong==='subject')selection.subject=String(BASE+1n);
  if(spec.wrong==='snapshot')selection.snapshotId++;
  if(spec.wrong==='export')selection.snapshotAt--;
  if(spec.wrong==='role')selection.expectedRole=ROLE;
  if(spec.wrong==='expired')selection.expiresAt=Math.floor(Date.now()/1000)-1;
  if(spec.wrong==='malformed-expiry')selection.expiresAt='not-a-time';
  if(spec.wrong==='missing-expiry')delete selection.expiresAt;
  if(spec.wrong==='unknown-field')selection.extra=true;
  let bound;try{bound=privacyBoundSiteRoleActionEnv(privacyBoundSiteEnv(env,originalUserSession(user)),originalUserSession(user),selection);}catch{return Response.json({captured:false,selectionRefused:true,statements:physical-before,actualLocalWorkerdD1:true});}
  const cap=await captureRoutineMembership232(bound,String(BASE));
  if(!cap)return Response.json({captured:false,statements:physical-before,actualLocalWorkerdD1:true});
  try{
   const matches=routineMembership232AttendedRoleMatches(bound,cap,expected),db=privacyProviderCustodyDatabase(bound),predicate=routineMembership232Predicate(bound,cap,1,true);
   const probe=async sql=>db.prepare('SELECT ('+sql+') AS ok').bind(...predicate.values).first();
   const prior=await probe(predicate.sql);
   if(spec.kind)await rest(env,'GET',`/guilds/${NATIVE_GUILD232}/members?limit=1000&after=0`,undefined,1);
   const after=await probe(predicate.sql),receipt=await probe(predicate.receiptSourceIntegritySql);
   return Response.json({captured:true,matches,prior,after,receipt,statements:physical-before,actualLocalWorkerdD1:true});
  }finally{closeRoutineMembership232(cap);}
 }
 if(path==='/rewrite-preview'){
  const spec=await request.json(),req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:spec.cookie}}),user=await currentUser(config,req),s=originalUserSession(user);
  const binding=JSON.stringify(['private-role-audit283-v1',config.GUILD_ID,s.u,s.v,s.e,s.g,s.n,config.CANONICAL_RANKS233,null])+'|preview';
  const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('private-role-audit283-v1\0'+SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0)),parts=spec.token.split('.');
  const value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:new TextEncoder().encode(binding)},key,bytes(parts[2])))),t=Math.floor(Date.now()/1000);
  if(spec.kind==='inspect')return Response.json({issuedAt:value.issuedAt,expiresAt:value.expiresAt,sessionExpiresAt:s.e,snapshotAt:value.snapshotAt});
  if(spec.kind==='expired'){value.issuedAt=t-120;value.expiresAt=t;}
  if(spec.kind==='future'){value.issuedAt=t+60;value.expiresAt=t+120;}
  if(spec.kind==='overlong'){value.issuedAt=t-1;value.expiresAt=t+300;}
  if(spec.kind==='unknown-field')value.extra=true;
  if(spec.kind==='wrong-export')value.snapshotAt--;
  if(spec.kind==='wrong-snapshot')value.snapshot++;
  if(spec.kind==='wrong-role')value.expected=ROLE;
  const iv=crypto.getRandomValues(new Uint8Array(12)),token='1.'+b64u(iv)+'.'+b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(binding)},key,new TextEncoder().encode(JSON.stringify(value)))));
  return Response.json({token});
 }
 if(path==='/run'||path==='/full-route'){
  const spec=await request.json(),before=physical,start=wires.length,env={...config,DISCORD_BOT_TOKEN:'role-audit-'+(spec.mode||'normal')};
  if(spec.activeV1)env.CANONICAL_RANKS233=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
  const query=[spec.cursor?'cursor='+encodeURIComponent(spec.cursor):'',spec.policyPreview?'policyPreview='+encodeURIComponent(spec.policyPreview):'',spec.subjectQuery?'subject='+encodeURIComponent(spec.subjectQuery):'',spec.scopeQuery?'scope='+encodeURIComponent(spec.scopeQuery):''].filter(Boolean).join('&');
  const req=new Request('https://guild.example/api/admin/role-audit'+(query?'?'+query:''),{method:spec.method||'GET',headers:{Cookie:spec.cookie||await cookie(),Origin:'https://guild.example','X-Olympus':'2'}});
  let response,error=null;
  try{if(path==='/full-route')response=await worker.fetch(req,{...env,DB:rawDB},{waitUntil(){},passThroughOnException(){}});else{const user=await currentUser(env,req);if(!user)response=Response.json({error:'signed_out'},{status:401});else response=await handleSiteRoleAudit283(req,privacyBoundSiteEnv(env,originalUserSession(user)),user,spec.body||{});}}
  catch(e){error=String(e?.stack||e);response=Response.json({error:'fixture_failed'},{status:500});}
  const result=await response.json();
  return Response.json({status:response.status,result,error,statements:physical-before,wires:wires.slice(start),actualLocalWorkerdD1:true});
 }
 return new Response(null,{status:404});
}};

// Synthetic real Workerd/D1 fixture. No provider implementation or production
// cookie issuer is replaced in the imported handler. Only outbound Discord is
// answered by the local test host.
import {handleSiteRoleAudit283,classifyRoleAudit283} from '../src/site-role-audit283.ts';
import {currentUser,originalUserSession,b64u} from '../src/site-core.ts';
import {privacyBoundSiteEnv,privacyBoundSiteRoleActionEnv,privacyProviderCustodyDatabase} from '../src/privacy-serving-authority.ts';
import {captureRoutineMembership232,closeRoutineMembership232,routineMembership232Predicate,routineMembership232AttendedRoleMatches} from '../src/routine-membership-authority232.ts';
import {rest} from '../src/discord.ts';
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233,NATIVE_NAMES233} from '../src/canonical-ranks233.ts';
import {NATIVE_SCOPE232,SHARED_MEMBER232,NATIVE_GUILD232} from '../src/native-rank-reconciliation232.ts';
import {STEWARD_CANONICAL_PROFILE,STEWARD_RANK_NAMES,NATIVE_RANK_SCHEMES,qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {SHARED_MEMBER230_CONTRACT,SHARED_MEMBER230_SEAL_PREFIX,sharedMember230SHA256} from '../src/shared-membership-cutover230.ts';
import {reconcileRoleBatch242} from '../src/role-reconcile242.ts';
const ADMIN='800000000000000001',BASE=800000000000001000n,EPOCH='a'.repeat(32),BIRTH='b'.repeat(32),SECRET='synthetic-role-audit-cookie',ROLE=CANONICAL_RANKS233[9].roleId;
let config,rawDB,physical=0,wires=[],ready=false;const effects=new Map();
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d)return d.value;}throw Error('fixture method missing');};
const h=n=>n.toString(16).padStart(32,'0');
async function setup(db,layout='canonical',adminId=ADMIN){
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
 config={DB:createPrivacyWriteAdmissionDatabase(db,'writer',layout,EPOCH),COOKIE_SECRET:SECRET,SITE_ADMINS:adminId,GUILD_ID:NATIVE_GUILD232,DISCORD_BOT_TOKEN:'role-audit-normal',DISCORD_APP_ID:'800000000000000003',
  CANONICAL_RANKS233:JSON.stringify({version:3,enabled:true,profile:STEWARD_CANONICAL_PROFILE,guildId:NATIVE_GUILD232,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))}),
  SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:NATIVE_GUILD232,
  VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),VERIFY_SECRET:'synthetic-verification-secret',SHARED_MEMBERSHIP230_MODE:'enabled',ROLE_GUILD_MEMBER:SHARED_MEMBER232,
  PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:layout,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};
 if(layout!=='canonical')Object.assign(config,{PRIVACY_NATIVE_ERASURE_ENABLED:'true',QR_PHASE1_ENABLED:'true',NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await sharedMember230SHA256(closureJSON)});
 rawDB=db;
 const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,value:async function(input,init){
  const packets=JSON.parse(init.body);physical+=Array.isArray(packets)?packets.length:1;
  const response=await Reflect.apply(send,fetcher,[input,init]);wires.push({request:packets,status:response.status,response:await response.clone().text()});return response;
 }});ready=true;
}
async function cookie(adminId=ADMIN){
 const body=b64u(new TextEncoder().encode(JSON.stringify({u:adminId,v:1,e:Math.floor(Date.now()/1000)+3600,g:null,n:BIRTH})));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('olympus-site/session-incarnation-v1|'+SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return '__Host-olg='+body+'.'+b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))));
}
async function shortOriginalPreview(env,user,token){
 const s=originalUserSession(user),binding=JSON.stringify(['private-role-audit283-v1',env.GUILD_ID,s.u,s.v,s.e,s.g,s.n,env.CANONICAL_RANKS233,null])+'|preview';
 const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('private-role-audit283-v1\0'+SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
 const bytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0)),parts=token.split('.');
 const value=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:new TextEncoder().encode(binding)},key,bytes(parts[2]))));
 // A shorter original encrypted preview, never a renewed/extended operation.
 value.issuedAt=Math.floor(Date.now()/1000);value.expiresAt=value.issuedAt+5;
 const iv=crypto.getRandomValues(new Uint8Array(12)),sealed='1.'+b64u(iv)+'.'+b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(binding)},key,new TextEncoder().encode(JSON.stringify(value)))));
 return {token:sealed,expiresAt:value.expiresAt};
}
export default {async fetch(request,bindings){
 const path=new URL(request.url).pathname;
 if(path==='/setup'){if(ready)return new Response(null,{status:409});await setup(bindings.DB);return Response.json({cookie:await cookie(),admin:ADMIN,subject:String(BASE),role:ROLE,council:CANONICAL_RANKS233[1].roleId,officer:CANONICAL_RANKS233[2].roleId,ranks:CANONICAL_RANKS233,nativeRows:1000});}
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
  if(body.kind==='unknown')await config.DB.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,created_at,expires_at)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_lost_reply',1,?5,?6)").bind('d'.repeat(32),String(BASE),NATIVE_GUILD232,ROLE,Math.floor(Date.now()/1000)-900,Math.floor(Date.now()/1000)-600).run();
  return Response.json({ok:true});
 }
 if(path==='/effect-mutate'){
  const spec=await request.json(),state=effects.get(spec.kind);if(!state)return new Response(null,{status:404});
  if(spec.change==='denied')await state.config.DB.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?1').bind(state.adminId).run();
  if(spec.change==='export')await state.config.DB.prepare('UPDATE roster_snapshots SET exported_at=exported_at+1 WHERE id=1').run();
  return Response.json({ok:true});
 }
 if(path==='/effect-run'){
  const spec=await request.json(),kind=spec.kind;if(effects.has(kind))return new Response(null,{status:409});
  const adminId=String(800000000000000100n+BigInt(['baseline','before-denied','after-denied','before-export','wrong-role','preview-expired'].indexOf(kind)));
  const original={config,rawDB,ready};await setup(bindings['DB_EFFECT_'+kind.replaceAll('-','_')],'recorded-live-pre-seal-20261017',adminId);
  const state={config:{...config,DISCORD_BOT_TOKEN:'role-audit-effect-'+kind},db:rawDB,adminId};effects.set(kind,state);({config,rawDB,ready}=original);
  const cookieValue=await cookie(adminId),start=physical,invoke=async(method,body={})=>{
   const req=new Request('https://guild.example/api/admin/role-audit',{method,headers:{Cookie:cookieValue,Origin:'https://guild.example','X-Olympus':'2'}}),user=await currentUser(state.config,req);
   const response=await handleSiteRoleAudit283(req,privacyBoundSiteEnv(state.config,originalUserSession(user)),user,body);return {status:response.status,body:await response.json()};
  };
  const preview=await invoke('GET'),row=preview.body.rows?.[0];let action,previewExpiresAt=null;
  if(kind==='preview-expired'&&row?.previewToken){
   const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:cookieValue}}),user=await currentUser(state.config,req),shortened=await shortOriginalPreview(state.config,user,row.previewToken);
   row.previewToken=shortened.token;previewExpiresAt=shortened.expiresAt;
  }
  if(kind==='wrong-role'){
   const req=new Request('https://guild.example/api/admin/role-audit',{headers:{Cookie:cookieValue}}),user=await currentUser(state.config,req),snapshot=await state.db.prepare('SELECT exported_at FROM roster_snapshots WHERE id=1').first();
   const bound=privacyBoundSiteRoleActionEnv(privacyBoundSiteEnv(state.config,originalUserSession(user)),originalUserSession(user),{subject:String(BASE),snapshotId:1,snapshotAt:snapshot.exported_at,expectedRole:ROLE,expiresAt:Math.floor(Date.now()/1000)+120});
   action={status:200,body:await reconcileRoleBatch242(bound,[String(BASE)])};
  }else action=row?.previewToken?await invoke('POST',{subject:row.id,previewToken:row.previewToken,confirm:true}):{status:409,body:{error:'fixture_preview_not_ready',preview:preview.body.error}};
  const receipts=(await state.db.prepare('SELECT id,purpose,role_id,desired,state,reason,attempts,request_digest,claim_nonce FROM role_settlements WHERE subject=?1 ORDER BY created_at,id').bind(String(BASE)).all()).results;
  const actor=await state.db.prepare('SELECT denied,in_server FROM site_users WHERE discord_id=?1').bind(state.adminId).first();
  return Response.json({previewStatus:preview.status,previewReady:!!row?.previewToken,previewExpiresAt,action,receipts,actor,statements:physical-start,actualLocalWorkerdD1:true});
 }
 if(path==='/unit'){
  const t=Math.floor(Date.now()/1000),manual=CANONICAL_RANKS233[2].roleId;
  const noReceipt=classifyRoleAudit283([manual],ROLE,[],null,false),unknown=classifyRoleAudit283([],ROLE,[{id:'1',role:ROLE,desired:1,state:'unknown',attempts:1,reason:'lost',created:t-900,expiry:t-600,checked:null,generation:null,parent:null}],null,false);
  return Response.json({noReceipt,unknown});
 }
 if(path==='/plans'){
  const captured=wires.flatMap(w=>Array.isArray(w.request)?w.request:[w.request]);
  const prefixes=['SELECT wanted.value AS id,p.generation','SELECT wanted.value AS id FROM json_each','SELECT COUNT(DISTINCT c.discord_id) AS subjects'];
  const plans=[];
  for(const prefix of prefixes){const statement=captured.find(s=>s.sql?.startsWith(prefix));if(!statement)return Response.json({error:'captured_query_missing',prefix},{status:409});
   plans.push({prefix,plan:(await rawDB.prepare('EXPLAIN QUERY PLAN '+statement.sql).bind(...statement.params).all()).results});}
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
  if(spec.kind==='expired'){value.issuedAt=t-120;value.expiresAt=t;}
  if(spec.kind==='future'){value.issuedAt=t+60;value.expiresAt=t+120;}
  if(spec.kind==='overlong'){value.issuedAt=t-1;value.expiresAt=t+120;}
  if(spec.kind==='unknown-field')value.extra=true;
  if(spec.kind==='wrong-export')value.snapshotAt--;
  if(spec.kind==='wrong-snapshot')value.snapshot++;
  if(spec.kind==='wrong-role')value.expected=ROLE;
  const iv=crypto.getRandomValues(new Uint8Array(12)),token='1.'+b64u(iv)+'.'+b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(binding)},key,new TextEncoder().encode(JSON.stringify(value)))));
  return Response.json({token});
 }
 if(path==='/run'||path==='/full-route'){
  const spec=await request.json(),before=physical,start=wires.length,env={...config,DISCORD_BOT_TOKEN:'role-audit-'+(spec.mode||'normal')};
  const req=new Request('https://guild.example/api/admin/role-audit'+(spec.cursor?'?cursor='+encodeURIComponent(spec.cursor):''),{method:spec.method||'GET',headers:{Cookie:spec.cookie||await cookie(),Origin:'https://guild.example','X-Olympus':'2'}});
  let response,error=null;
  try{if(path==='/full-route')response=await worker.fetch(req,{...env,DB:rawDB},{waitUntil(){},passThroughOnException(){}});else{const user=await currentUser(env,req);if(!user)response=Response.json({error:'signed_out'},{status:401});else response=await handleSiteRoleAudit283(req,privacyBoundSiteEnv(env,originalUserSession(user)),user,spec.body||{});}}
  catch(e){error=String(e?.stack||e);response=Response.json({error:'fixture_failed'},{status:500});}
  const result=await response.json();
  return Response.json({status:response.status,result,error,statements:physical-before,wires:wires.slice(start),actualLocalWorkerdD1:true});
 }
 return new Response(null,{status:404});
}};

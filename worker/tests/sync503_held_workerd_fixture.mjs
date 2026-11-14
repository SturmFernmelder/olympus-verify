// 14 Nov 2026 (the refused reload, design SYNC503 2.7): the REAL Worker (src/index.ts) on a REAL local D1 in Workerd.
// The only test seam is the D1 binding's own transport (its `fetcher.fetch`, the lowest point a fixture reaches
// without changing product code, as identify_cte280_flow_fixture.mjs observes it): one chosen native batch either gets
// a provider-shaped error reply (the binding then throws `D1_ERROR: <text>` with the same text as its cause, exactly
// as workerd's d1-api does), or the transport itself rejects with a raw Error (no D1_ prefix), or the real batch is
// sent after a real change of the session, or a forged reply of the right length is returned. Console output of the
// isolate is captured during each request; nothing is retried by the fixture.
import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {privacyBoundSubjectEnv,PrivacySiteRequestHeld} from '../src/privacy-serving-authority.ts';
import {HELD_CAUSES,ROUTE_CLASSES} from '../src/log.ts';

const EPOCH='a'.repeat(32),ID='300000000000000003',OTHER='300000000000000004',BOT='300000000000000099',GUILD='236932545793490944',NOBODY='300000000000000077';
const BASE='https://guild.example',LAYOUT='recorded-live-pre-seal-20261017';
const SITE_GUARD='privacy_site_request_refused',SUBJECT_GUARD='privacy_bot_request_refused',PROOF='privacy_current_schema_requires_attended_setup',USER_READ='FROM site_users WHERE discord_id = ?1 AND account_incarnation';
let saved=null,fault=null,bypass=false,restoreAfter=[];
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
const statementsOf=body=>{try{const p=JSON.parse(body);return {array:Array.isArray(p),list:Array.isArray(p)?p:[p]};}catch{return {array:false,list:[]};}};
function classify(body){
 const {array,list}=statementsOf(body),sqls=list.map(s=>typeof s?.sql==='string'?s.sql:'');
 if(sqls.some(s=>s.includes(SITE_GUARD)))return 'bound';
 if(sqls.some(s=>s.includes(SUBJECT_GUARD)))return 'subject';
 if(sqls.some(s=>s.includes(USER_READ)))return 'user';
 if(!array&&sqls.length===1&&sqls[0].includes(PROOF))return 'schema';
 return 'other';
}
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

async function setup(db){
 const profile=JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
 const objects=[...profile.tables,...profile.indexes].map(o=>db.prepare(o.sql));objects.push(db.prepare(profile.slotSQL));
 while(objects.length)await db.batch(objects.splice(0,40));
 const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS n").first()).n;
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?1,'serving',0,'','',0,0)").bind(EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(now),
 ]);
 const triggers=profile.triggers.map(o=>db.prepare(o.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher')?.value;if(!fetcher)throw Error('original_D1_fetcher_unavailable');const send=method(fetcher,'fetch');
 const counts={readGroupsOk:0},writer=createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH);
 // Count the read groups the admission layer accepts (proof first, every result a success, proof current=1), from
 // whatever reply the binding receives, so the sampled proof-cost line can be checked against 1 in 256.
 const tally=async(body,response)=>{try{const answer=JSON.parse(await response.clone().text()),r0=Array.isArray(answer)?answer[0]?.results:null,current=Array.isArray(r0)?r0[0]?.current:r0?.rows?.[0]?.[r0?.columns?.indexOf('current')];if(Array.isArray(answer)&&answer.length>1&&answer.every(r=>r&&r.success!==false&&!r.error)&&current===1&&statementsOf(body).list[0]?.sql?.includes(PROOF))counts.readGroupsOk++;}catch{}return response;};
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){
  const body=typeof init?.body==='string'?init.body:'',kind=classify(body),w={kind,nested:body.includes(SITE_GUARD)&&body.includes(SUBJECT_GUARD),injected:null};wires.push(w);
  if(fault&&!bypass&&kind===fault.target&&++fault.seen===fault.nth){
   fault.fired++;w.injected=fault.kind;const {list}=statementsOf(body);
   if(fault.kind==='reply')return reply(Array.isArray(JSON.parse(body))?[{success:false,error:fault.message}]:{success:false,error:fault.message},500);
   if(fault.kind==='reject')throw new Error(fault.message);
   if(fault.kind==='proof0')return reply(list.map((_,i)=>({success:true,results:i===0?[{current:0}]:[],meta:{duration:0,rows_read:0}})));
   if(fault.kind==='shape')return tally(body,reply(list.map((_,i)=>({success:true,results:i===0?[{current:1}]:i===1?[{admitted:0}]:[],meta:{duration:0,rows_read:0}}))));
   // A real change of the session between the gate and the read: an admitted write through the source writer.
   if(fault.kind==='rotate'){bypass=true;try{await writer.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(ID).run();}finally{bypass=false;}}
   if(fault.kind==='mutate'){
    // After the real batch answers, the caller's own capture changes: the subject layer's check() after the await refuses.
    const response=await Reflect.apply(send,fetcher,[input,init]);fault.capture.revision++;return tally(body,response);
   }
   if(fault.kind==='witness'){
    // After the real batch answers, the request's own header reader is replaced by an equal delegate until the
    // request ends: the bound layer's session witness (check() after the await) must refuse.
    const response=await Reflect.apply(send,fetcher,[input,init]),d=Object.getOwnPropertyDescriptor(Headers.prototype,'get');
    Object.defineProperty(Headers.prototype,'get',{...d,value:function(...a){return Reflect.apply(d.value,this,a);}});restoreAfter.push(()=>Object.defineProperty(Headers.prototype,'get',d));return tally(body,response);
   }
  }
  return tally(body,await Reflect.apply(send,fetcher,[input,init]));
 }});
 const env={DB:db,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:LAYOUT,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 COOKIE_SECRET:'synthetic-native-mode-cookie-secret-0123456789',DISCORD_APP_ID:BOT,DISCORD_CLIENT_SECRET:'synthetic-native-client',DISCORD_BOT_TOKEN:'synthetic-native-bot',VERIFY_SECRET:'synthetic-native-verify',SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,SITE_ADMINS:OTHER,
 ROLE_GUILD_MEMBER:'1551234567890123456',ROLE_OFFICER:'1551234567890123457',ROLE_RAID_LEADER:'1551234567890123458',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-workerd-sync503',timestamp:'2026-11-14T00:00:00Z'},ASSETS:{async fetch(){return new Response('synthetic static');}}};
 return {db,env,wires,counts,writer};
}
const CONSOLE=['error','warn','log','info','debug'];
async function captured(work,throwing=false){
 const logs=[],before=CONSOLE.map(k=>console[k]);
 CONSOLE.forEach(k=>{console[k]=(...args)=>{logs.push({level:k,args:args.map(a=>typeof a==='string'?a:{nonString:typeof a})});if(throwing)throw Error('console unavailable');};});
 try{return {value:await work(),logs};}catch(error){return {error,logs};}
 finally{CONSOLE.forEach((k,i)=>{console[k]=before[i];});}
}
function armed(spec){fault=spec?{...spec,seen:0,fired:0}:null;}

export const sync503Fixture={async fetch(request,bindings){
 const u=new URL(request.url);
 if(u.pathname==='/setup'){if(saved)return new Response(null,{status:409});saved=await setup(bindings.DB);return Response.json({actualLocalWorkerdD1:true,heldCauses:HELD_CAUSES,routeClasses:ROUTE_CLASSES});}
 if(!saved)return new Response(null,{status:409});const s=saved;
 if(u.pathname==='/run'){
  const spec=await request.json(),headers=new Headers(spec.headers??{}),target=BASE+spec.path;
  const original=new Request(target,{method:spec.method,headers,redirect:'manual',...(spec.body!==undefined?{body:spec.body}:{})});
  armed(spec.fault);const wireStart=s.wires.length,jobs=[];
  const out=await captured(async()=>{try{const response=await app.fetch(original,s.env,{waitUntil(p){jobs.push(Promise.resolve(p).catch(()=>{}));},passThroughOnException(){}});for(const p of jobs)await p;return response;}finally{while(restoreAfter.length)restoreAfter.pop()();}});
  const f=fault;armed(null);
  if(out.error)return Response.json({thrown:true,errorName:String(out.error?.name),logs:out.logs,fault:f},200);
  const r=out.value;
  return Response.json({status:r.status,body:await r.text(),location:r.headers.get('Location'),setCookies:r.headers.getSetCookie(),contentType:r.headers.get('Content-Type'),logs:out.logs,fault:f?{seen:f.seen,fired:f.fired}:null,wires:s.wires.slice(wireStart).map(w=>({kind:w.kind,nested:w.nested,injected:w.injected})),readGroupsOk:s.counts.readGroupsOk});
 }
 if(u.pathname==='/subject'){
  // Module level: a subject_generation layer directly on the admission database, alone and nested twice.
  const spec=await request.json();
  // A real capture of the signed-in subject when asked (the guard then admits), otherwise a subject with no row.
  let subject=NOBODY,capture=null;
  if(spec.capture){bypass=true;try{const row=await s.db.prepare('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?1').bind(ID).first();subject=ID;capture={subject:ID,subjectGeneration:row.generation,state:'active',revision:row.revision};}finally{bypass=false;}}
  armed(spec.fault?{...spec.fault,capture}:null);
  const out=await captured(async()=>{
   const admission=createPrivacyWriteAdmissionDatabase(s.db,'writer',LAYOUT,EPOCH);let env={DB:admission};
   for(let i=0;i<spec.depth;i++)env=privacyBoundSubjectEnv(env,subject,capture);
   try{if(spec.write)await env.DB.prepare('UPDATE site_settings SET value=value WHERE key=?1').bind('sync503-none').run();else await env.DB.prepare('SELECT 1 AS one').first();return {held:false};}
   catch(e){return {held:e instanceof PrivacySiteRequestHeld,message:e?.message,heldCause:e?.heldCause,heldGroup:e?.heldGroup};}
  },spec.throwingConsole===true);
  const f=fault;armed(null);
  return Response.json({...(out.value??{thrown:true}),logs:out.logs,fault:f?{seen:f.seen,fired:f.fired}:null,readGroupsOk:s.counts.readGroupsOk});
 }
 if(u.pathname==='/raw'){
  // Word for word: what the pinned binding itself throws for a provider error reply and for a rejected transport.
  const spec=await request.json();armed({target:'other',nth:1,...spec.fault});let seen=null;
  try{await s.db.prepare('SELECT 1 AS sync503_raw').first();}catch(e){seen={message:e?.message,causeMessage:e?.cause?.message??null,hasCause:e?.cause!==undefined};}
  const f=fault;armed(null);return Response.json({seen,fired:f.fired});
 }
 if(u.pathname==='/age'){
  // Move the member's last Discord check (an admitted write through the source writer), to make the gate's check due.
  const spec=await request.json();bypass=true;try{await s.writer.prepare('UPDATE site_users SET checked_at=checked_at+?1 WHERE discord_id=?2').bind(spec.seconds,ID).run();}finally{bypass=false;}
  return Response.json({ok:true});
 }
 return new Response(null,{status:404});
}};

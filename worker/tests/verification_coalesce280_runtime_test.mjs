import {pendingPlans280} from './pending_request280_plans.mjs';
// Coalescing successor: preserve the original SEC service/actual-index cases; repeated refreshes now create one durable check.
// Focused genuine Workerd/D1 verification admission. Synthetic Discord only;
// the actual Worker, OAuth cookie, Native E2 and production service are executed.
import worker from '../src/index.ts';
import {handleSiteVerification242} from '../src/verification242.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH='a'.repeat(32),GUILD='800000000000000001',BASE='https://guild.example';
const RATE='800000000000000201',ISOLATED='800000000000000202',BODY='800000000000000203';
const CURRENT='800000000000000204',DENIED='800000000000000205',DEPARTED='800000000000000206';
const RACE_DENIED='800000000000000207',RACE_SESSION='800000000000000208',RACE_LEFT='800000000000000209';
const STALE_LEFT='800000000000000210',STALE_UNKNOWN='800000000000000211';
const RATE_FRESH='800000000000000212';
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,
 DISCORD_APP_ID:'800000000000000002',DISCORD_CLIENT_SECRET:'verification280-client',DISCORD_BOT_TOKEN:'verification280-bot',
 VERIFY_SECRET:'verification280-secret',COOKIE_SECRET:'verification280-cookie',PRIVACY_WRITE_ADMISSION_ENABLED:'true',
 PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,PRIVACY_NATIVE_ERASURE_ENABLED:'true',
 PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',ROLE_GUILD_MEMBER:'800000000000000010',
 COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'verification280-fixture',timestamp:'2026-11-12T00:00:00Z'},ASSETS:{async fetch(){return new Response('fixture static asset');}}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const encoder=new TextEncoder();
function request(body){return new Request(BASE+'/api/me/verification',{method:'POST',body});}
function streamOf(bytes,step=1){return new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=step)c.enqueue(bytes.slice(i,i+step));c.close();}});}
function cookieOf(response,name){for(const c of response.headers.getSetCookie()){const first=c.split(';')[0];if(first.startsWith(name+'='))return first;}return null;}
async function provision(db){
 const catalogue=JSON.parse(ADMISSION_EXPECTED_JSON);
 const statements=[...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql));statements.push(db.prepare(catalogue.slotSQL));
 while(statements.length)await db.batch(statements.splice(0,40));
 await db.batch([db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,EPOCH),
 db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
 db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 const triggers=catalogue.triggers.map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 return {...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','canonical',EPOCH)};
}
export default {async fetch(_request,bindings){
 const env=await provision(bindings.DB),apiEnv={...env,DB:bindings.DB},cases=[],deferred=[];
 const check=(name,pass,observed)=>cases.push({name,pass:!!pass,observed});
 const count=async(id,action='role.request242')=>(await bindings.DB.prepare('SELECT COUNT(*) n FROM audit WHERE subject=?1 AND action=?2').bind(id,action).first()).n;
 const pending=async id=>(await bindings.DB.prepare('SELECT COUNT(*) n FROM pending WHERE discord_id=?1').bind(id).first()).n;
 const direct=(body,id=BODY,defer)=>handleSiteVerification242(request(body),env,{id},defer);
 let controller,cancelled=0,settled=false;
 const oversized=new ReadableStream({start(c){controller=c;c.enqueue(new Uint8Array(2048).fill(32));},cancel(){cancelled++;return new Promise(()=>{});}});
 const operation=direct(oversized).then(response=>{settled=true;return response;});
 await Promise.race([operation,sleep(250)]);const beforeEOF=settled;
 if(!settled)controller.close();
 const response=await operation;
 check('oversize stops before EOF without awaiting a hung cancellation',beforeEOF&&response.status===413,{beforeEOF,status:response.status,cancelled});

 const padded=(character,padding)=>{let raw=JSON.stringify({action:'refresh',character});return raw+' '.repeat(padding-raw.length);};
 const unicode=padded('漢'.repeat(980),1024),astral=padded('😀'.repeat(480),1024);
 for(const [name,text] of [['CJK',unicode],['astral',astral]]){
  const bytes=encoder.encode(text),r=await direct(streamOf(bytes,1));
  check(name+' exact1024 UTF16 accepted across split UTF8',r.status===200&&bytes.length>1024,{status:r.status,units:text.length,bytes:bytes.length});
 }
 const over=await direct(streamOf(encoder.encode(unicode+' '),17));check('1025 decoded units refused',over.status===413,{status:over.status});
 const malformed=new Uint8Array([...encoder.encode('{"action":"refresh","character":"'),0xc3,0x28,...encoder.encode('"}')]);
 const malformedResponse=await direct(streamOf(malformed));check('malformed UTF8 retains replacement decoding',malformedResponse.status===200,{status:malformedResponse.status});
 const bom=new Uint8Array([239,187,191,...encoder.encode('{"action":"refresh"}')]);
 const nativeBOM=await request(streamOf(bom)).text();let nativeBOMStatus=200;try{JSON.parse(nativeBOM);}catch{nativeBOMStatus=400;}
 const bomResponse=await direct(streamOf(bom));check('leading BOM matches native Workerd Request.text behavior',bomResponse.status===nativeBOMStatus,{status:bomResponse.status,nativeStatus:nativeBOMStatus,nativeLeadingCodeUnit:nativeBOM.charCodeAt(0)});
 const tail=new Uint8Array([...encoder.encode(padded('',1024)),0xc3]);
 check('decoder flush counts replacement at cap',(await direct(streamOf(tail))).status===413);
 for(const [body,error] of [['','bad_json'],['   ','bad_json'],['[]','bad_body'],['null','bad_body'],['{"other":1}','bad_body']]){
  const r=await direct(body);check('existing malformed body behavior '+JSON.stringify(body),r.status===400&&(await r.json()).error===error,{status:r.status});
 }
 let defers=0;const statuses=[];
 for(let n=0;n<64;n++)statuses.push((await direct('{"action":"refresh"}',RATE,()=>{defers++;})).status);
 let limitedReads=0;
 const limitedRequest=request(new ReadableStream({pull(c){limitedReads++;c.enqueue(encoder.encode('{"action":"refresh"}'));c.close();}},{highWaterMark:0}));
 const limited=await handleSiteVerification242(limitedRequest,env,{id:RATE},()=>{defers++;});
 check('same account admits30 requests then429 with only one durable check/wake',statuses.filter(x=>x===200).length===30&&statuses.slice(30).every(x=>x===429)&&limited.status===429&&/^[1-9][0-9]*$/.test(limited.headers.get('Retry-After')??'')&&Number(limited.headers.get('Retry-After'))<=60&&!limitedRequest.bodyUsed&&limitedReads===0&&await count(RATE)===1&&defers===1,{statuses,auditRows:await count(RATE),defers,retryAfter:limited.headers.get('Retry-After'),bodyUsed:limitedRequest.bodyUsed,limitedReads});
 check('separate account keeps its admission',(await direct('{"action":"refresh"}',ISOLATED)).status===200&&await count(ISOLATED)===1);
 check('read-only own status usable after write exhaustion',(await handleSiteVerification242(new Request(BASE+'/api/me/verification'),env,{id:RATE})).status===200);

 const call=async(method,path,{cookie,body,headers={}}={})=>{
  const h=new Headers(headers);if(cookie)h.set('Cookie',cookie);if(method!=='GET'){h.set('Origin',BASE);h.set('X-Olympus','2');}
  return worker.fetch(new Request(BASE+path,{method,headers:h,...(body===undefined?{}:{body})}),apiEnv,{waitUntil(p){deferred.push(Promise.resolve(p));}});
 };
 const signIn=async id=>{
  const start=await call('GET','/auth/login'),state=new URL(start.headers.get('Location')).searchParams.get('state');
  const callback=await call('GET','/auth/callback?code=code-'+id+'&state='+encodeURIComponent(state),{cookie:cookieOf(start,'__Host-olg_state')});
  const cookie=cookieOf(callback,'__Host-olg');if(callback.status!==303||!cookie)throw Error('actual OAuth fixture failed '+callback.status+' '+await callback.text());return cookie;
 };
 const cookies=new Map();for(const id of [CURRENT,DENIED,DEPARTED,RACE_DENIED,RACE_SESSION,RACE_LEFT,STALE_LEFT,STALE_UNKNOWN])cookies.set(id,await signIn(id));
 for(let n=0;n<30;n++)await direct('',RATE_FRESH);
 const freshLimitedCookie=await signIn(RATE_FRESH);
 await env.DB.prepare('UPDATE site_users SET checked_at=0 WHERE discord_id=?1').bind(RATE_FRESH).run();
 const freshAuditBefore=await count(RATE_FRESH),freshDeferBefore=deferred.length;
 const freshLimited=await call('POST','/api/me/verification',{cookie:freshLimitedCookie,body:'{"action":"refresh"}'});
 check('actual route rate refusal precedes fresh member/body/audit/defer work',freshLimited.status===429&&/^[1-9][0-9]*$/.test(freshLimited.headers.get('Retry-After')??'')&&Number(freshLimited.headers.get('Retry-After'))<=60&&await count(RATE_FRESH)===freshAuditBefore&&deferred.length===freshDeferBefore,{status:freshLimited.status,retryAfter:freshLimited.headers.get('Retry-After'),auditRows:await count(RATE_FRESH),deferred:deferred.length-freshDeferBefore});
 const overflowStatus=await call('GET','/api/me/verification',{cookie:freshLimitedCookie});
 check('actual own-status GET stays usable after write overflow',overflowStatus.status===200,{status:overflowStatus.status});
 await env.DB.prepare('UPDATE site_users SET denied=1 WHERE discord_id=?1').bind(DENIED).run();
 await env.DB.prepare('UPDATE site_users SET in_server=0 WHERE discord_id=?1').bind(DEPARTED).run();
 for(const id of [STALE_LEFT,STALE_UNKNOWN])await env.DB.prepare('UPDATE site_users SET checked_at=0 WHERE discord_id=?1').bind(id).run();
 for(const [id,label,expected] of [[DENIED,'denied',403],[DEPARTED,'departed',403],[STALE_LEFT,'fresh Discord absence',403],[STALE_UNKNOWN,'Discord membership unavailable',503]]){
  const before=await count(id),p=await pending(id),r=await call('POST','/api/me/verification',{cookie:cookies.get(id),body:'{"character":"Held Name"}'});
  check(label+' cannot write verification',r.status===expected&&await count(id)===before&&await pending(id)===p,{status:r.status});
 }
 const deniedStatus=await call('GET','/api/me/verification',{cookie:cookies.get(DENIED)}),leftStatus=await call('GET','/api/me/verification',{cookie:cookies.get(DEPARTED)});
 check('denied/departed own-status GET remains usable',deniedStatus.status===200&&leftStatus.status===200,{denied:deniedStatus.status,departed:leftStatus.status});
 const deniedGuild=await call('GET','/api/news',{cookie:cookies.get(DENIED)}),leftGuild=await call('GET','/api/news',{cookie:cookies.get(DEPARTED)});
 check('other guild API reads retain denied/departed gate',deniedGuild.status===403&&leftGuild.status===403,{denied:deniedGuild.status,departed:leftGuild.status});
 const positive=await call('POST','/api/me/verification',{cookie:cookies.get(CURRENT),body:'{"character":"Current Initiate"}'});
 check('current unverified server member can request without addon/character/Member role',positive.status===200&&await pending(CURRENT)===1,{status:positive.status,pending:await pending(CURRENT)});
 for(const [id,mutation,label] of [[RACE_DENIED,'denied=1','denied'],[RACE_SESSION,'session_version=session_version+1','session changed'],[RACE_LEFT,'in_server=0','departed']]){
  let c,reached;const bodyReached=new Promise(resolve=>reached=resolve);let sent=false;
  const body=new ReadableStream({pull(controller){c=controller;if(!sent){sent=true;controller.enqueue(encoder.encode('{"action":"refresh"}'));reached();}}},{highWaterMark:0});
  const auditBefore=await count(id),pendingBefore=await pending(id),deferBefore=deferred.length;
  const p=call('POST','/api/me/verification',{cookie:cookies.get(id),body});
  if(!await Promise.race([bodyReached.then(()=>true),sleep(5000).then(()=>false)]))throw Error('body was not read');
  await env.DB.prepare('UPDATE site_users SET '+mutation+' WHERE discord_id=?1').bind(id).run();c.close();
  const r=await p;check('open stream '+label+' cannot queue after original admission',r.status!==200&&await count(id)===auditBefore&&await pending(id)===pendingBefore&&deferred.length===deferBefore,{status:r.status,auditRows:await count(id),deferred:deferred.length-deferBefore});
 }
 const beforeCross=await pending(ISOLATED),cross=await worker.fetch(new Request(BASE+'/api/me/verification',{method:'POST',headers:{Cookie:cookies.get(CURRENT),Origin:'https://other.invalid','X-Olympus':'2'},body:'{"character":"Cross Origin"}'}),apiEnv,{waitUntil(p){deferred.push(Promise.resolve(p));}});
 check('actual route preserves cross-origin refusal',cross.status===403&&await pending(ISOLATED)===beforeCross,{status:cross.status});
 const anon=await call('POST','/api/me/verification',{body:'{"action":"refresh"}'});check('actual route preserves anonymous refusal',anon.status===401,{status:anon.status});
 // Actual authenticated Watcher/index intake route: only source-owned creation
 // can wake it. No JSON field is a scheduling or identity capability.
 const intakeScope={version:1,guild:'OLYMPUS PRIME',realm:'CAMWOW US2 Realm 3 PvE'},intakeEnv={...apiEnv,WATCHER_TOKEN:'w'.repeat(40),VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify(intakeScope)};
 const intakeSubjects=['800000000000000230','800000000000000231','800000000000000232'],intakeNames=['Intake Alpha','Intake Bravo','Intake Charlie'];
 for(let i=0;i<3;i++){await env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(intakeSubjects[i]).run();await env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?2,?3,'member',CAST(strftime('%s','now')AS INTEGER),CAST(strftime('%s','now')AS INTEGER),'whisper',?4)").bind(intakeNames[i].toLowerCase(),intakeNames[i],intakeSubjects[i],'Player-4613-2800000'+i).run();}
 await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'retiring',1,CAST(strftime('%s','now')AS INTEGER),CAST(strftime('%s','now')AS INTEGER))").bind(intakeSubjects[2],'9'.repeat(32)).run();
 const intake=async body=>{let wakes=0;const tasks=[],response=await worker.fetch(new Request('https://verify.example/ingest/intake242',{method:'POST',headers:{Authorization:'Bearer '+intakeEnv.WATCHER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)}),intakeEnv,{waitUntil(p){wakes++;tasks.push(Promise.resolve(p));}});const result=await response.json();await Promise.all(tasks);return {status:response.status,wakes,result};};
 const entry=i=>({id:'role-request280-'+i,type:'role',source:'addon-native',character:intakeNames[i],guid:'Player-4613-2800000'+i,guild:intakeScope.guild,realm:intakeScope.realm});
 const createdIntake=await intake({entries:[entry(0),entry(1)]}),duplicateIntake=await intake({entries:[entry(0),entry(1)]}),heldIntake=await intake({entries:[entry(2)]}),forgedWake=await intake({entries:[],createdAny:true});
 check('actual index batches multiple known-created intake requests into one wake',createdIntake.status===200&&createdIntake.wakes===1&&createdIntake.result.acknowledgements.length===2,{status:createdIntake.status,wakes:createdIntake.wakes,body:createdIntake.result});
 check('actual index coalesced intake emits no duplicate wake',duplicateIntake.status===200&&duplicateIntake.wakes===0&&duplicateIntake.result.acknowledgements.length===2&&await count(intakeSubjects[0])===1&&await count(intakeSubjects[1])===1,{wakes:duplicateIntake.wakes});
 check('actual index held intake neither ACKs nor wakes',heldIntake.status===200&&heldIntake.wakes===0&&heldIntake.result.acknowledgements.length===0&&await count(intakeSubjects[2])===0,{wakes:heldIntake.wakes,body:heldIntake.result});
 check('client JSON cannot supply intake wake authority',forgedWake.status===200&&forgedWake.wakes===0&&!Object.hasOwn(forgedWake.result,'createdAny'),{wakes:forgedWake.wakes});
 const pendingPlan=await pendingPlans280(env,bindings.DB);check('canonical-layout pending cap plans use actual D1 with1000unrelated rows',pendingPlan.result[0].n===0&&pendingPlan.plan.length>0,pendingPlan);
 await Promise.all(deferred);
 return Response.json({schema:'verification280-genuine-workerd-v1',actualLocalWorkerdD1:true,scope:'Actual verification service plus index.fetch and Native OAuth route; synthetic Discord HTTP only. No provider/native production actions.',ok:cases.every(c=>c.pass),checks:cases.length,cases});
}};

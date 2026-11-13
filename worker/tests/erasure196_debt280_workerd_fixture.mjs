// Genuine local Workerd/D1; only seed records and external Discord are synthetic.
// Source clocks, index/session/Native admission and queued-job issuers are unchanged.
import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {runServingErasureJob} from '../src/privacy-serving-jobs.ts';
import {titheMessage280} from '../src/tithe-receipt280.ts';
import {sign} from '../src/site-core.ts';
import {mailReference} from '../src/community-contributions.ts';
import {newsWebhookCleanupCandidatesSql} from '../src/site-news-webhook.ts';
const ID='300000000000000003',OTHER='300000000000000004',THIRD='300000000000000005',BOT='300000000000000099';
const GUILD='236932545793490944',CHANNEL='1551234567890123460',WEBHOOK='1551234567890123491';
const BASE='https://guild.example',EPOCH='a'.repeat(32),LAYOUT='recorded-live-pre-seal-20261017';
const SECRET='synthetic-erasure196-only-secret-0123456789',TOKEN='synthetic-erasure196-webhook-token-01234567890123456789';
const COLLECTOR='Player-1-1234ABCD',SENDER='Player-1-9999ABCD',PROFILE=JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
const H=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),v=>v.toString(16).padStart(2,'0')).join('');
const pack=x=>{const a=JSON.parse(x);return Array.isArray(a)?a:[a];};
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d&&Object.hasOwn(d,'value')&&typeof d.value==='function')return d.value;}throw Error('original_native_method_missing');};
const jar=r=>r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
let state;
async function now(s){return(await s.db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").first()).at;}
async function inspect(s){return{
  jobs:(await s.db.prepare('SELECT * FROM privacy_serving_jobs ORDER BY operation_id').all()).results,
  pointers:(await s.db.prepare('SELECT * FROM privacy_provider_messages ORDER BY operation_id').all()).results,
  subjects:(await s.db.prepare('SELECT * FROM privacy_subjects ORDER BY subject_id').all()).results,
  users:(await s.db.prepare('SELECT discord_id,account_incarnation,last_login FROM site_users ORDER BY discord_id').all()).results,
  markers:(await s.db.prepare("SELECT * FROM audit WHERE action='treasury.erased_replay280' ORDER BY id").all()).results,
  receipts:(await s.db.prepare("SELECT * FROM audit WHERE action='treasury.receipt242' ORDER BY id").all()).results,
  metadata:(await s.db.prepare("SELECT key,value FROM site_settings WHERE key GLOB 'newsWebhook:*' ORDER BY key").all()).results,
  replay:(await s.db.prepare('SELECT * FROM privacy_restore_replay ORDER BY operation_id').all()).results,
  control:await s.db.prepare('SELECT * FROM privacy_write_admission').first()
};}
async function setup(db,kind){
  const batches=async rows=>{while(rows.length)await db.batch(rows.splice(0,40));};
  await batches([...PROFILE.tables,...PROFILE.indexes,{sql:PROFILE.slotSQL}].map(x=>db.prepare(x.sql)));
  const at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").first()).at;
  const scope={version:1,guild:'OLYMPUS PRIME',realm:'Native Realm'};
  await db.batch([
    db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?1,'serving',0,'','',0,0)").bind(EPOCH),
    db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
    db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(at),
    db.prepare("INSERT INTO members(discord_id,username,activity_at)VALUES(?1,'debt-owner',?2)").bind(ID,at),
    db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('trade donor','Trade Donor',?1,'member',?2,?2,'whisper',?3)").bind(ID,at,SENDER),
    db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,trusted,complete)VALUES(1,?1,?1,?1,?2,2,1,1)").bind(at,'addon-native-v1:'+JSON.stringify(scope)),
    db.prepare("INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index,level)VALUES(1,'Fern Melder','fern melder',?1,'Officer',3,60),(1,'Trade Donor','trade donor',?2,'Member',7,60)").bind(COLLECTOR,SENDER)
  ]);
  await batches(PROFILE.triggers.map(x=>db.prepare(x.sql)));
  const env={DB:db,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:LAYOUT,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
    VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify(scope),VERIFY_SECRET:SECRET,WATCHER_TOKEN:'synthetic-erasure196-watcher-token-0123456789',COOKIE_SECRET:'synthetic-erasure196-cookie-secret-0123456789',DISCORD_APP_ID:BOT,DISCORD_CLIENT_SECRET:'synthetic-erasure196-client',DISCORD_BOT_TOKEN:'synthetic-erasure196-bot',
    SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,SITE_ADMINS:OTHER,ROLE_GUILD_MEMBER:'1551234567890123456',ROLE_OFFICER:'1551234567890123457',ROLE_RAID_LEADER:'1551234567890123458',COMMUNITY_FEATURES:'directory,contributions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_SCOPE:'olympus',CONTRIBUTIONS_RETENTION_DAYS:'90',BETA_RESET_REMOVALS_ENABLED:'false',
    TOWN_CRIER_WEBHOOK:JSON.stringify({guild:GUILD,channel:CHANNEL,webhook:WEBHOOK}),TOWN_CRIER_WEBHOOK_TOKEN:TOKEN,TOWN_CRIER_WEBHOOK_ENABLED:'false',
    CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-erasure196',timestamp:'2026-11-13T00:00:00Z'},ASSETS:{async fetch(){return new Response('synthetic');}}};
  const s={db,env,kind,at,wires:[],calls:[],turns:[],prepared:false};
  // Observe real physical transport before constructing/using any source-owned authority.
  // Do not replace Native packets, result objects, clocks or statement methods.
  const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
  Object.defineProperty(fetcher,'fetch',{configurable:true,value:async function(input,init){
    const request=pack(init.body),wire={request,status:null,response:null};s.wires.push(wire);
    const response=await Reflect.apply(send,fetcher,[input,init]);wire.status=response.status;wire.response=pack(await response.clone().text());return response;
  }});
  s.writer=createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH);
  return s;
}
async function measured(s,label,fn){const first=s.wires.length,at=await now(s);const start=s.wires.length;let outcome,error;
  try{outcome=await fn();return outcome;}catch(e){error=String(e.stack??e);throw e;}finally{
    const end=s.wires.length;s.turns.push({label,at,phase:Math.floor(at/900)%2,first:start,last:end,physical:s.wires.slice(start,end).reduce((n,w)=>n+w.request.length,0),outcome,error,clockRead:first});
  }
}
async function call(s,method,path,{body,cookie}={}){
  const isIntake=path.startsWith('/ingest'),pending=[],first=s.wires.length;
  const response=await app.fetch(new Request((isIntake?'https://verify.example':BASE)+path,{method,headers:{...(isIntake?{Authorization:'Bearer synthetic-erasure196-watcher-token-0123456789'}:{}),...(cookie?{Cookie:cookie}:{}),...(method==='POST'||method==='PUT'?{Origin:BASE,'X-Olympus':'2','Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),s.env,{waitUntil(p){pending.push(Promise.resolve(p));}});
  const inlineEnd=s.wires.length;let consumed=0;while(consumed<pending.length){if(consumed>20)throw Error('unexpected_deferred_growth');await pending[consumed++];}
  s.calls.push({method,path,status:response.status,first,inlineEnd,last:s.wires.length,deferred:pending.length,physical:s.wires.slice(first).reduce((n,w)=>n+w.request.length,0)});return response;
}
async function login(s,id){const initial=await call(s,'GET','/auth/login');if(initial.status!==302)throw Error('actual_login_'+initial.status);const nonce=new URL(initial.headers.get('Location')).searchParams.get('state');const callback=await call(s,'GET','/auth/callback?code=code-'+id+'&state='+encodeURIComponent(nonce),{cookie:jar(initial)});if(callback.status!==303)throw Error('actual_callback_'+callback.status+':'+await callback.text());return jar(callback);}
async function modernReceipt(s){
  const r={id:'0123456789abcdef01234567',type:'donation',source:'tithe-gold-v2',character:'Trade Donor',guid:SENDER,requestedAt:await now(s),requestedBy:'Fern Melder',guild:'OLYMPUS PRIME',realm:'Native Realm',clientVersion:'0.6.38',donation:{version:2,kind:'trade',copper:900,recipient:'Fern Melder',collectorGuid:COLLECTOR,reference:'TITHE-ABCD-EFGH'},evidence:{kind:'trade_complete_and_money_delta',confirmedLocal:true,automaticCredit:false,mac:''}};
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  r.evidence.mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(titheMessage280(r)))),x=>x.toString(16).padStart(2,'0')).join('').slice(0,32);
  const response=await call(s,'POST','/ingest/intake242?keyVersion=launch-membership-v1',{body:{entries:[r]}});s.intake={status:response.status,body:await response.json()};s.original=JSON.stringify(r);
  if(s.intake.status!==200||s.intake.body.acknowledgements?.length!==1)throw Error('actual_modern_receipt_not_admitted');
}
async function pointers(s){
  const user=await s.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?1').bind(ID).first(),p=await s.db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?1').bind(ID).first(),at=await now(s);
  const configHash=await H(JSON.stringify(['town-crier-destination-v1',GUILD,CHANNEL,WEBHOOK]));
  const credentialPin=await sign(s.env.COOKIE_SECRET,'town-crier-webhook-credential-v1',JSON.stringify([configHash,TOKEN]));
  for(const tag of ['j','k']){
    const id=tag.repeat(22),operation='news_webhook_v1:'+id+':'+tag.charCodeAt(0).toString(16).repeat(21),message=tag==='j'?'1551234567890123461':'1551234567890123462';
    const metadata={v:1,id,revision:1,operation,payloadHash:'1'.repeat(64),configHash,credentialPin,guild:GUILD,channel:CHANNEL,webhook:WEBHOOK,actor:ID,birth:user.account_incarnation,generation:p.generation,createdAt:at-100,noticeUntil:at+86400,retainUntil:at-100+31622400};
    await s.writer.batch([
      s.writer.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?1,?2,?3,?4)').bind('newsWebhook:'+id,JSON.stringify(metadata),at,ID),
      s.writer.prepare("INSERT INTO site_news_notices(id,op_hash,title,body,revision,created_by,created_at,updated_by,updated_at,retain_until)VALUES(?1,?2,'Synthetic notice','Synthetic body',1,?3,?4,?3,?4,?5)").bind(id,'2'.repeat(64),ID,at-100,at+86400),
      s.writer.prepare("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?1,'notice',?2,?3,?4,'known',0,?5,?6,?7)").bind(operation,JSON.stringify([{id:ID,g:p.generation}]),CHANNEL,message,metadata.createdAt,at-100,metadata.retainUntil)
    ]);
  }
}
async function queued(s,id,operation,cookie){
  const token=s.env.DISCORD_BOT_TOKEN;s.env.DISCORD_BOT_TOKEN=token+'-hold';let response;
  try{response=await call(s,'POST','/api/me/erasure',{cookie,body:{operationId:operation}});}finally{s.env.DISCORD_BOT_TOKEN=token;}
  const body=await response.json();if(response.status!==202||body.state==='complete')throw Error('original_queue_not_held_'+JSON.stringify({status:response.status,body}));
  return {status:response.status,body,job:await s.db.prepare('SELECT * FROM privacy_serving_jobs WHERE subject_id=?1').bind(id).first()};
}
async function prepare(s){
  const cookie=await login(s,ID);s.cookieReady=!!cookie;await modernReceipt(s);
  const visibility=await call(s,'PUT','/api/community/discord-directory/visibility',{cookie,body:{listed:false}});s.visibility={status:visibility.status,body:await visibility.json()};if(visibility.status!==200)throw Error('actual_visibility_refused');
  await pointers(s);
  // Match the historical combined family: actual attended extra-gold receipt
  // plus synthetic retained, acknowledged Treasury custody, already absent at
  // the provider. Its historical tuple is fixture seed, never a forged result.
  const at=await now(s),gift='1551234567890123476';
  s.env.TREASURY_COSMETIC_ROLES=JSON.stringify({version:1,guildId:GUILD,applicationId:BOT,seasonStartsAt:at-3600,roles:{tithePayer:gift,patron:'1551234567890123477',benefactor:'1551234567890123478'}});
  const receipt=await call(s,'POST','/api/admin/treasury/record',{cookie:await login(s,OTHER),body:{reference:'native196-extra',discordId:ID,amountCopper:250000,observedAt:at-10,mailReference:await mailReference(s.env,'olympus',ID),verifiedAdditionalGold:true}});
  s.extraReceipt={status:receipt.status,body:await receipt.json()};if(receipt.status!==200)throw Error('actual_extra_receipt_refused');
  const generation=(await s.db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?1').bind(ID).first()).generation;
  await s.writer.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,subject_generation,created_at,expires_at,checked_at)VALUES(?1,?2,'treasury_cosmetic',?3,?4,1,'settled','treasury_effect_acknowledged',1,?5,?6,?7,?8,?7)").bind('9'.repeat(32),ID,GUILD,gift,'8'.repeat(32),generation,at-100,at+7776000).run();
  s.originalBefore=await inspect(s);
  if(s.kind==='original-inactive'){
    const at=await now(s);await s.writer.batch([s.writer.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(ID),s.writer.prepare('UPDATE site_users SET last_login=?2 WHERE discord_id=?1').bind(ID,at-31536001),s.writer.prepare('UPDATE members SET activity_at=?2 WHERE discord_id=?1').bind(ID,at-31536001)]);
    s.admission=await measured(s,'source-original-inactive-admission',()=>runServingErasureJob({...s.env,DB:s.writer}));
    s.originalQueue=await s.db.prepare('SELECT * FROM privacy_serving_jobs WHERE subject_id=?1').bind(ID).first();
  }else{s.admission=await queued(s,ID,'d'.repeat(32),cookie);s.originalQueue=s.admission.job;}
  if(!s.originalQueue||!['waiting_role','held'].includes(s.originalQueue.state))throw Error('source_original_job_missing');
  s.prepared=true;
  return {kind:s.kind,cookieReady:s.cookieReady,intake:s.intake,extraReceipt:s.extraReceipt,visibility:s.visibility,original:s.original,originalBefore:s.originalBefore,admission:s.admission,originalQueue:s.originalQueue,at:await now(s),notBefore:s.originalQueue.last_attempt_at===null?0:s.originalQueue.last_attempt_at+121};
}
async function seedControls(s){
  const at=await now(s);for(const [tag,status]of [['known','known'],['refusal','known'],['lost','known'],['unknown','unknown'],['refused','refused']]){
    await s.writer.prepare('INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?1,\'guild_log\',\'[]\',?2,?3,?4,1,?5,?5,?6)').bind(('control-'+tag).padEnd(32,'x'),CHANNEL,({known:'1551234567890123471',refusal:'1551234567890123472',lost:'1551234567890123473',unknown:'1551234567890123474',refused:'1551234567890123475'})[tag],status,at-20,at-20+31622400).run();
  }
  s.controlsBefore=await inspect(s);
}
export default {async fetch(request,bindings){try{
  const u=new URL(request.url),kind=u.searchParams.get('kind')||'combined-known';if(!['combined-known','original-inactive'].includes(kind))throw Error('bounded_case');
  if(!state)state=await setup(bindings.DB,kind);const s=state;if(s.kind!==kind)throw Error('case_database_mismatch');
  if(u.pathname==='/prepare')return Response.json({actualLocalWorkerdD1:true,clockOverride:false,...await prepare(s)});
  if(u.pathname==='/terminal'){
    if(!s.prepared)throw Error('original_prepare_required');s.beforeTerminal=await inspect(s);
    const result=await measured(s,'original-native-terminal',()=>runServingErasureJob({...s.env,DB:s.writer}));s.afterTerminal=await inspect(s);
    let status=null;if(s.admission.body?.statusToken){const response=await call(s,'POST','/api/me/erasure/status',{body:{operationId:s.originalQueue.operation_id,statusToken:s.admission.body.statusToken}});status={status:response.status,body:await response.json()};}
    return Response.json({actualLocalWorkerdD1:true,clockOverride:false,result,status,before:s.beforeTerminal,after:s.afterTerminal,turns:s.turns,calls:s.calls,wires:s.wires});
  }
  if(u.pathname==='/debt'){
    const before=await inspect(s),result=await measured(s,'independent-debt-turn',()=>runServingErasureJob({...s.env,DB:s.writer}));return Response.json({result,before,after:await inspect(s),turn:s.turns.at(-1),wires:s.wires});
  }
  if(u.pathname==='/controls'){
    await seedControls(s);const start=s.turns.length;for(let i=0;i<7;i++)await measured(s,'custody-control-debt-'+i,()=>runServingErasureJob({...s.env,DB:s.writer}));
    return Response.json({before:s.controlsBefore,after:await inspect(s),turns:s.turns.slice(start),wires:s.wires});
  }
  if(u.pathname==='/priority'){
    const at=await now(s);if(Math.floor(at/900)%2!==0||900-at%900<150)return Response.json({phaseUnavailable:true,actualClock:at,phase:Math.floor(at/900)%2,requiredPhase:0,reason:'even_phase_with_original_backoff_window_required'});
    const originals=[];for(const [id,op]of [[OTHER,'e'.repeat(32)],[THIRD,'f'.repeat(32)]])originals.push(await queued(s,id,op,await login(s,id)));
    const notBefore=Math.max(...originals.map(x=>(x.job.last_attempt_at??0)+121));
    return Response.json({phaseUnavailable:false,actualClock:at,originals,notBefore});
  }
  if(u.pathname==='/priority-turn'){
    const before=await inspect(s),result=await measured(s,'two-waiting-jobs-debt-priority',()=>runServingErasureJob({...s.env,DB:s.writer}));return Response.json({result,before,after:await inspect(s),turn:s.turns.at(-1),wires:s.wires});
  }
  if(u.pathname==='/selector-controls'){
    // Exact source-owned candidate SQL; these are actual SQLite data controls,
    // not a fake-clock execution of either scheduled phase.
    const selected=(await s.writer.prepare('SELECT operation_id FROM privacy_provider_messages m WHERE m.operation_id IN('+newsWebhookCleanupCandidatesSql+') ORDER BY operation_id').all()).results;
    return Response.json({selected,clock:await now(s),phase:Math.floor((await now(s))/900)%2,sourceSelector:true});
  }
  return new Response(null,{status:404});
}catch(error){return Response.json({error:String(error.stack??error),calls:state?.calls,turns:state?.turns,wires:state?.wires},{status:500});}}};

// Evergreen 12 Nov 2026, ban lane. Genuine Workerd/D1: the actual /olympus-admin ban, unban, verification and banned
// sweep entries over the recorded-live pre-seal Native admission layout. Only Discord HTTP is synthetic (the driver's
// outboundService). No production route, credential or provider call.
import {handleInteraction} from '../src/interactions.ts';
import {postVerify} from '../src/ingest.ts';
import {reconcileBanned,callBudget} from '../src/roles.ts';
import {audit} from '../src/db.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_RANK_NAMES232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
const OLD230_DEBT='2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join(''),H=async x=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
// Module-level values stay unexported: Workerd treats every named export as an entrypoint.
const ACTOR='333333333333333333',OTHER='222222222222222222',HIGH_COUNCIL=CANONICAL_RANKS233[1].roleId;
export function fixture1112(seed){const cases=new Map();return {async fetch(request,bindings){
 const [,action,kind,extra]=new URL(request.url).pathname.split('/'),body=request.method==='POST'?await request.json().catch(()=>({})):{};
 const json=value=>Response.json(value);
 try{
  if(action==='setup'){
   if(cases.has(kind))return new Response(null,{status:409});
   const db=bindings['DB_'+kind.replaceAll('-','_')];if(!db)return new Response(null,{status:404});
   const subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id;
   const closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:OLD230_DEBT,createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure),scope={version:1,...NATIVE_SCOPE232};
   const policy=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
   const config={...seed.config,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',CANONICAL_RANKS233:policy,SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind,...(body.budget?{ROLE_CALL_BUDGET:String(body.budget)}:{})};
   const create=seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql));while(create.length)await db.batch(create.splice(0,40));
   const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
   // Every case's roster is older than 600 s unless the case first verifies through the bot (it ages the roster after).
   const fresh=body.verifyFirst===true,rank=Number.isInteger(body.rank)?body.rank:8;
   for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};
    if(table.name==='site_settings'&&row.key==='membership230:closure:'+closure.operationId)row.value=closureJSON;
    if(table.name==='roster_snapshots'){row.source='addon-native-v1:'+JSON.stringify(scope);if(!fresh){row.exported_at=seed.now-700;row.received_at=seed.now-700;row.first_received_at=seed.now-700;}}
    if(table.name==='roster_members'){row.rank=NATIVE_RANK_NAMES232[rank];row.rank_index=rank;}
    const names=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+names.map(n=>'"'+n+'"').join(',')+')VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(n=>row[n])).run();}
   const triggers=seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
   const wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
   Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){const w={requestBody:init?.body,status:null,responseBody:null};wires.push(w);const r=await Reflect.apply(send,fetcher,[input,init]);w.status=r.status;w.responseBody=await r.clone().text();return r;}});
   const env={...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)};
   await env.DB.batch([env.DB.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(OTHER)]);
   cases.set(kind,{db,env,subject,wires,scope});return json({ok:true,subject,other:OTHER});
  }
  const c=cases.get(kind);if(!c)return new Response(null,{status:404});
  const {db,env,subject,wires}=c,start=wires.length;
  const finish=async extraOut=>{const end=wires.length,rows=(await db.prepare('SELECT id,subject,purpose,proof_id,role_id,desired,state,reason,attempts,claim_nonce,subject_generation,request_digest,native_profile,created_at,expires_at,checked_at FROM role_settlements ORDER BY created_at,rowid').all()).results;
   const member=await db.prepare('SELECT banned,ban_reason FROM members WHERE discord_id=?1').bind(subject).first(),failed=wires.slice(start,end).filter(w=>w.status!==200).length;
   const statements=wires.slice(start,end).reduce((n,w)=>{try{const x=JSON.parse(w.requestBody);return n+(Array.isArray(x)?x.length:1);}catch{return n+1;}},0);
   return json({ok:true,rows,member,trips:end-start,statements,failedTrips:failed,actualLocalWorkerdD1:true,...extraOut});};
  const command=async(sub,options)=>{const pending=[],defer=(label,work)=>{pending.push(Promise.resolve().then(work));};
   const interaction={type:2,id:'9'.repeat(18),token:'interaction-token-'+kind,application_id:env.DISCORD_APP_ID,guild_id:env.GUILD_ID,channel_id:'444444444444444444',member:{user:{id:ACTOR,username:'qualification-officer'},roles:[HIGH_COUNCIL]},
    data:{name:'olympus-admin',type:1,options:[{name:sub,type:1,options}]}};
   const response=await handleInteraction(env,interaction,defer),initial=await response.json();while(pending.length)await pending.shift();return initial;};
  if(action==='ban')return finish({initial:await command('ban',[{name:'user',type:6,value:body.target??subject},{name:'reason',type:3,value:body.reason??'qualification'}])});
  if(action==='unban')return finish({initial:await command('unban',[{name:'user',type:6,value:body.target??subject}])});
  if(action==='sweep'){const budget=callBudget(env),result=await reconcileBanned(env,'',1,budget);return finish({result,attempts:budget.attempts});}
  if(action==='verify'){
   const now=seed.now,guid='Player-4613-12345678',scope=c.scope,scopeHash=(await H('native-scope|1|'+scope.guild+'|'+scope.realm)).slice(0,16),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('membership|1|fern melder|'+guid+'|'+seed.code+'|1|'+now+'|'+scopeHash))).slice(0,32);
   const response=await postVerify(env,{character:'Fern Melder',code:seed.code,source:'whisper',guid,nativeMembership:{version:1,member:true,observedAt:now,scopeHash,mac}});return finish({verify:{status:response.status,body:await response.json()}});
  }
  if(action==='age'){await env.DB.batch([env.DB.prepare("UPDATE roster_snapshots SET exported_at=exported_at-700,received_at=received_at-700,first_received_at=first_received_at-700")]);return finish({roster:await db.prepare('SELECT exported_at,CAST(strftime(\'%s\',\'now\') AS INTEGER) AS now FROM roster_snapshots ORDER BY id DESC LIMIT 1').first()});}
  if(action==='refresh'){
   // A new trusted export, as the addon would upload; history rows are never edited in place.
   await env.DB.batch([env.DB.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)SELECT MAX(id)+1,CAST(strftime('%s','now')AS INTEGER),CAST(strftime('%s','now')AS INTEGER),source,member_count,1,1 FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)"),env.DB.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT (SELECT MAX(id) FROM roster_snapshots),name_key,name,guid,rank,rank_index,level FROM roster_members WHERE snapshot_id=(SELECT MAX(id)-1 FROM roster_snapshots)")]);
   return finish({});
  }
  if(action==='routine'){const result=await runNativeSubject232(env,subject,callBudget(env));return finish({result});}
  if(action==='hook'){
   // A concurrent staff action during a provider await of the original command (the same admitted D1 writer).
   if(extra==='unban'||extra==='unban-reban'){await env.DB.prepare('UPDATE members SET banned=0,ban_reason=NULL WHERE discord_id=?1').bind(subject).run();await audit(env,ACTOR,'admin.unban',subject);}
   if(extra==='unban-reban'){await env.DB.prepare('UPDATE members SET banned=1,ban_reason=?2 WHERE discord_id=?1').bind(subject,'qualification').run();await audit(env,ACTOR,'admin.ban',subject,{reason:'qualification'});}
   return json({ok:true});
  }
  if(action==='rows')return finish({});
  return new Response(null,{status:404});
 }catch(error){return Response.json({ok:false,error:String(error?.stack||error)},{status:500});}
}};}

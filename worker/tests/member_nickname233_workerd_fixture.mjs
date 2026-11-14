// Genuine local Workerd/D1 and actual opaque issuer. All remote transport is local-mocked.
import {handleNicknameInteraction233,NICKNAME_USE233,NICKNAME_RESET233} from '../src/member-nickname233.ts';
import {nicknameEraseStatements233,nicknameErasureAssertion233,nicknameKey233,nicknameUnresolvedSql233,nicknameErasureUnresolvedSql233} from '../src/member-nickname-data233.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {NATIVE_RANK_NAMES232,NATIVE_RANK_PROFILE232,NATIVE_STEWART_ROLE232,MIRROR_BY_NAME232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {privacyAccessPage,beginPrivacyAccess,finishPrivacyAccess,PRIVACY_ACCESS_COOKIE,privacyAccessRandomId} from '../src/privacy-access.ts';
import {exportPrivacyAccess} from '../src/privacy-access-export.ts';
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
export function nicknameFixture233(seed){const started=new Set(),states=new Map();let serial=0;return {async fetch(request,bindings){
 const kind=new URL(request.url).pathname.slice(1),kinds=['use','unknown','refused','higher','erasure','copy'];
 if(kind==='erasure-assertions'&&request.method==='POST'&&states.has('unknown')&&!started.has(kind)){
  started.add(kind);const {env,wires,db}=states.get('unknown'),subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,key=nicknameKey233(subject);
  const before=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),start=wires.length;
  const original=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(key).first();
  await env.DB.batch(nicknameEraseStatements233(env,subject));
  const redacted=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(key).first();
  const gates=await env.DB.prepare(`SELECT (${nicknameUnresolvedSql233('?1')}) AS write_blocked,(${nicknameErasureUnresolvedSql233('?1')}) AS erasure_blocked`).bind(subject).first();
  const guard=await env.DB.batch([nicknameErasureAssertion233(env,subject)]);
  // Exact source receipt-CAS shape: a late original PATCH result cannot replace
  // the marker after that same raw dispatch record was redacted.
  const late=await env.DB.prepare('UPDATE site_settings SET value=?3 WHERE key=?1 AND value=?2 RETURNING key').bind(key,original.value,JSON.stringify({...JSON.parse(original.value),state:'acknowledged'})).all();
  const afterLate=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(key).first(),negatives=[];
  for(const value of [original.value,'{"state":"erased_unknown","v":1}']){
   await env.DB.prepare('UPDATE site_settings SET value=?2 WHERE key=?1').bind(key,value).run();
   const old=await env.DB.prepare('SELECT value,updated_at FROM site_settings WHERE key=?1').bind(key).first();let held=false;
   try{await env.DB.batch([env.DB.prepare('UPDATE site_settings SET updated_at=updated_at+1 WHERE key=?1').bind(key),nicknameErasureAssertion233(env,subject)]);}catch{held=true;}
   const current=await env.DB.prepare('SELECT value,updated_at FROM site_settings WHERE key=?1').bind(key).first();negatives.push({held,rolledBack:JSON.stringify(old)===JSON.stringify(current)});
  }
  await env.DB.prepare('UPDATE site_settings SET value=?2 WHERE key=?1').bind(key,redacted.value).run();
  const retained=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(key).first();
  await env.DB.prepare('DELETE FROM site_settings WHERE key=?1').bind(key).run();const absent=await env.DB.batch([nicknameErasureAssertion233(env,subject)]);
  await env.DB.prepare('INSERT INTO site_settings(key,value,updated_at)VALUES(?1,?2,?3)').bind(key,retained.value,seed.now).run();
  const after=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first();
  return Response.json({actualLocalWorkerdD1:true,start,end:wires.length,wires,redacted:redacted.value,writeBlocked:gates.write_blocked,erasureBlocked:gates.erasure_blocked,guardSuccess:guard.every(r=>r.success===true),lateChanges:late.meta?.changes,lateRows:late.results.length,afterLate:afterLate.value,negatives,retained:retained.value,absentSuccess:absent.every(r=>r.success===true),controlUnchanged:JSON.stringify(before)===JSON.stringify(after)});
 }
 if(kind==='identify-copy'&&request.method==='POST'&&states.has('copy')&&!started.has(kind)){
  started.add(kind);const {env,wires}=states.get('copy'),BASE='https://'+env.SITE_HOST;
  const initial=await privacyAccessPage(new Request(BASE+'/privacy/access'),env),html=await initial.text(),section=/<form method="post" action="\/privacy\/signin">([\s\S]*?)<\/form>/.exec(html),csrf=/name="csrf" value="([^"]+)"/.exec(section[1])[1];
  const start=await beginPrivacyAccess(new Request(BASE+'/privacy/signin',{method:'POST',headers:{Cookie:initial.headers.get('Set-Cookie').split(';')[0],Origin:BASE,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':privacyAccessRandomId()},body:new URLSearchParams({csrf})}),env),state=new URL(start.headers.get('Location')).searchParams.get('state');
  const linked=await finishPrivacyAccess(new Request(BASE+'/privacy/callback?state='+state+'&code=original_code_233&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:start.headers.get('Set-Cookie').split(';')[0]}}),env),cookie=linked.headers.get('Set-Cookie').split(', ').find(x=>x.startsWith(PRIVACY_ACCESS_COOKIE+'=')).split(';')[0];
  const page=await privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:cookie}}),env),text=await page.text(),form=/<form method="post" action="\/privacy\/access\/export">([\s\S]*?)<\/form>/.exec(text),fields={csrf:/name="csrf" value="([^"]+)"/.exec(form[1])[1],grant:/name="grant" value="([^"]+)"/.exec(form[1])[1],collection:'copy'};
  const from=wires.length,response=await exportPrivacyAccess(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:cookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}),env),body=await response.json(),to=wires.length;
  return Response.json({status:response.status,actualLocalWorkerdD1:true,clockOverride:false,originalIdentifyOnlyOAuth:true,from,to,wires,preference:body.community?.member_nickname?.preference,coverage:body.coverage?.kind,containsCounterpart:JSON.stringify(body).includes('FOREIGN_NICKNAME')});
 }
 if(request.method!=='POST'||!kinds.includes(kind)||started.has(kind))return new Response(null,{status:404});started.add(kind);
 const db=bindings['DB_'+kind],G='236932545793490944',subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id;
 const create=seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql));while(create.length)await db.batch(create.splice(0,40));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};if(table.name==='roster_snapshots'){row.member_count=907;row.source='addon-native-v1:'+JSON.stringify({version:1,...NATIVE_SCOPE232});}if(table.name==='roster_members'){row.name='One';row.name_key='one';row.rank='Member';row.rank_index=8;}const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(k=>'"'+k+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 const now=seed.now,guid='Player-4613-12345678';
 await db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(subject).run();
 await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('one','One',?1,'member',?2,?2,'whisper',?3)").bind(subject,now-100,guid).run();
 await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,roster_id,native_guid,native_profile,created_at,expires_at,checked_at)VALUES(?1,?2,'launch_membership230',?3,?4,1,'settled','launch230_put_acknowledged_and_confirmed',1,?5,?6,1,?7,'prime-native-230',?8,?9,?10)").bind('b'.repeat(32),subject,G,'1552077551839617104','c'.repeat(32),'d'.repeat(64),guid,now-90,now-40,now-89).run();
 const fill=[];for(let i=0;i<906;i++)fill.push(db.prepare('INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index,level)VALUES(1,?1,?2,?3,?4,?5,60)').bind('Synthetic '+i,'synthetic '+i,'Player-4613-'+(0x10000000+i).toString(16),NATIVE_RANK_NAMES232[i%10],i%10));while(fill.length)await db.batch(fill.splice(0,40));
 const triggers=seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const before=await db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),controlBefore=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first();
 const wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){const w={requestBody:init?.body,status:null,responseBody:null};wires.push(w);const r=await Reflect.apply(send,fetcher,[input,init]);w.status=r.status;w.responseBody=await r.clone().text();return r;}});
 const canonical=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:G,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const native=JSON.stringify({version:1,enabled:true,profile:NATIVE_RANK_PROFILE232,guildId:G,nativeGuild:NATIVE_SCOPE232.guild,nativeRealm:NATIVE_SCOPE232.realm,membershipRole:'1552077551839617104',ranks:NATIVE_RANK_NAMES232.map((name,index)=>({index,name,roleId:name==='Stewart'?NATIVE_STEWART_ROLE232:MIRROR_BY_NAME232[name]})),privileged:true});
 const env={...seed.config,GUILD_ID:G,CANONICAL_RANKS233:canonical,NATIVE_RANK_SYNC232:native,VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind,ROSTER_MIN_MEMBERS:'1',SITE_HOST:'nickname233.example',DISCORD_CLIENT_SECRET:'nickname233-synthetic-oauth-client',COOKIE_SECRET:'nickname233-synthetic-cookie-secret-0123456789',DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',seed.config.PRIVACY_WRITE_ADMISSION_EPOCH)};
 const invoke=async action=>{let work;const response=handleNicknameInteraction233(env,{type:3,id:String(1550000000000000000n+BigInt(++serial)),token:'original_synthetic_ephemeral_token_'+kind,guild_id:G,member:{user:{id:subject},roles:[]},data:{custom_id:action==='reset'?NICKNAME_RESET233:NICKNAME_USE233}},(label,callback)=>{if(label!=='interaction_nickname233')throw Error('source_callback_label');work=callback;});if(work)await work();return response;};
 let error=null;const start=wires.length;try{await invoke('use');if(kind==='unknown')await invoke('reset');if(kind==='use')await invoke('reset');if(kind==='erasure')await env.DB.batch(nicknameEraseStatements233(env,subject));}catch(e){error=String(e?.message||e);}const end=wires.length;states.set(kind,{env,wires,db});
 if(kind==='copy')await env.DB.prepare("INSERT INTO site_settings(key,value,updated_at)SELECT ?1,json_set(value,'$.previous','FOREIGN_NICKNAME','$.desired','FOREIGN_NICKNAME'),updated_at FROM site_settings WHERE key=?2").bind(nicknameKey233('222222222222222222'),nicknameKey233(subject)).run();
 const stored=await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(nicknameKey233(subject)).first(),after=await db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY type,name').all(),control=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first();
 return Response.json({actualLocalWorkerdD1:true,clockOverride:false,sourceCallbackOverride:false,rosterRows:907,kind,error,wires,start,end,stored:stored?.value??null,schemaUnchanged:JSON.stringify(before.results)===JSON.stringify(after.results),controlUnchanged:JSON.stringify(controlBefore)===JSON.stringify(control),providerCalls:0});
 }};}

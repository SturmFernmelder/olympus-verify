// Actual local Workerd/D1 and source-owned controls. Only external Discord is mocked.
import {postVerify} from '../src/ingest.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {callBudget} from '../src/roles.ts';
import {betaResetReceiptRetentionStatements} from '../src/beta-reset-retention.ts';
import {NATIVE_RANK_NAMES232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233,parseCanonicalRankPolicy233,canonicalNativeRole233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_RANK_NAMES,DIRECTIVE_CANONICAL_PROFILE,DIRECTIVE_CANONICAL_INDEX,qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {DIRECTIVE_CANONICAL_SWEEP280_SELECT} from '../src/full-release-roles.ts';
const OLD230_DEBT='2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86';
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join(''),H=async x=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
export function fixture280(seed){const spent=new Set(),active=new Map();return {async fetch(request,bindings){
 const name=new URL(request.url).pathname.slice(1);
 if(name.startsWith('mutate/')){const kind=name.slice(7),a=active.get(kind);if(!a)return new Response(null,{status:404});if(kind==='await-row')await a.env.DB.prepare("UPDATE roster_members SET rank='Wrong rank' WHERE name_key='synthetic 17'").run();else if(kind==='await-generation')await a.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(a.subject,'9'.repeat(32),seed.now).run();else await a.env.DB.prepare("UPDATE roster_snapshots SET source='addon-native-v1:'||?1").bind(JSON.stringify(a.scope)).run();return Response.json({mutated:true});}
 const kind=name;if(request.method!=='POST'||spent.has(kind))return new Response(null,{status:404});spent.add(kind);
 const db=bindings['DB_'+kind.replaceAll('-','_')];if(!db)return new Response(null,{status:404});
 const subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,oldPolicy=kind.startsWith('old-policy'),oldSource=oldPolicy||kind.startsWith('old-source');
 const index=kind==='entitlement'?5:kind.startsWith('own-replace-')?0:/^[a-z-]+[0-9]$/.test(kind)?Number(kind.at(-1)):0,names=oldSource?NATIVE_RANK_NAMES232:DIRECTIVE_RANK_NAMES;
 const closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:OLD230_DEBT,createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure),scope={version:1,...NATIVE_SCOPE232};
 const policy=JSON.stringify({version:oldPolicy?1:2,enabled:true,profile:oldPolicy?CANONICAL_PROFILE233:DIRECTIVE_CANONICAL_PROFILE,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const config={...seed.config,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',CANONICAL_RANKS233:policy,SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind};
 const source=oldSource?'addon-native-v1:'+JSON.stringify(scope):kind==='unqualified'?'addon-native-v2:'+JSON.stringify({version:2,guild:scope.guild,realm:scope.realm,rankProfile:null,rankSchemeDigest:null,rankNames:null}):qualifiedNativeSnapshotSource(scope.guild,scope.realm);
 if(kind==='entitlement')config.CANONICAL_ENTITLEMENTS233=JSON.stringify({version:1,profile:CANONICAL_PROFILE233,guildId:config.GUILD_ID,packetSHA256:'4'.repeat(64),entries:[{subject,generation:null,roleKey:'branch-gm'}]});
 const create=seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql));while(create.length)await db.batch(create.splice(0,40));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};if(table.name==='site_settings'&&row.key==='membership230:closure:'+closure.operationId)row.value=closureJSON;if(table.name==='roster_snapshots'){row.source=source;row.member_count=1000;}if(table.name==='roster_members'){row.rank=names[index];row.rank_index=index;}const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(n=>'"'+n+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(n=>row[n])).run();}
 const roster=await db.prepare('SELECT snapshot_id FROM roster_members LIMIT 1').first(),fill=[];for(let i=0;i<999;i++){const name='Synthetic '+i;fill.push(db.prepare('INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index,level)VALUES(?1,?2,?3,?4,?5,?6,60)').bind(roster.snapshot_id,name,name.toLowerCase(),'Player-4613-'+(0x10000000+i).toString(16).toUpperCase(),kind==='wrong-row'&&i===17?'Wrong rank':names[oldSource||kind==='empty-ranks'?index:i%10],oldSource||kind==='empty-ranks'?index:i%10));}while(fill.length)await db.batch(fill.splice(0,40));
 if(kind==='legacy-anchor'){
  await db.prepare('INSERT OR IGNORE INTO members(discord_id)VALUES(?1)').bind(subject).run();
  await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('fern melder','Fern Melder',?1,'member',?2,?2,'whisper','Player-4613-12345678')").bind(subject,seed.now-20).run();
  await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'settled','canonical233_put_acknowledged_and_confirmed',1,?5,?6,?7,?8,?9,1,'Player-4613-12345678',?10,0,'Guild Master')").bind('a'.repeat(32),subject,config.GUILD_ID,CANONICAL_RANKS233[0].roleId,'b'.repeat(32),'c'.repeat(64),seed.now-10,seed.now+290,seed.now-9,CANONICAL_PROFILE233).run();
  await db.prepare("UPDATE roster_members SET rank='Member',rank_index=7 WHERE guid='Player-4613-12345678'").run();
 }
 if(kind==='old-unknown')await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,subject_generation,created_at,expires_at,native_profile)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_old_unresolved',1,?5,?6,?6,?7)").bind('e'.repeat(32),subject,config.GUILD_ID,CANONICAL_RANKS233[1].roleId,'f'.repeat(32),seed.now-900,CANONICAL_PROFILE233).run();
 const oldSource280=kind==='existing-fern'?'councillor-browser-beta-fern':kind==='existing-note'||kind==='existing-renamed-note'?'note':kind==='existing-whisper'?'whisper':'councillor-browser';
 let originalExisting280=null,originalUnknown280=null;
 if(kind.startsWith('existing-')){
  await db.prepare('INSERT OR IGNORE INTO members(discord_id)VALUES(?1)').bind(subject).run();
  const originalGuid=kind==='existing-guid-update'?'Player-4613-98765432':kind==='existing-guid-null'?null:'Player-4613-12345678';
  await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?2,?3,'member',?4,?4,?5,?6)").bind(kind==='existing-renamed-note'?'old fern':'fern melder',kind==='existing-renamed-note'?'Old Fern':'Fern Melder',subject,seed.now-3600,oldSource280,originalGuid).run();
  if(kind==='existing-invalid-clock')await db.prepare("UPDATE characters SET bound_at='malformed-original-clock' WHERE discord_id=?1").bind(subject).run();
  originalExisting280=await db.prepare('SELECT * FROM characters WHERE discord_id=?1').bind(subject).first();
  if(kind==='existing-site-denied')await db.prepare("INSERT INTO site_users(discord_id,username,denied,session_version,first_login,last_login)VALUES(?1,'held',1,1,?2,?2)").bind(subject,seed.now).run();
  if(kind==='existing-rename-hold')await db.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,nonce,state,decided_by,decided_at)VALUES(?1,'Old Fern','Fern Melder','fern melder','synthetic-nonce','reapply',?1,?2)").bind(subject,seed.now).run();
  await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,native_profile,created_at,expires_at,checked_at)VALUES(?1,?2,'synthetic_original_unknown',?3,?4,0,'unknown','synthetic_immutable_original',1,?5,?6,'synthetic-original',?7,?8,?9)").bind('f'.repeat(32),subject,config.GUILD_ID,CANONICAL_RANKS233[1].roleId,'e'.repeat(32),'d'.repeat(64),seed.now-900,seed.now-600,seed.now-590).run();
  originalUnknown280=await db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind('f'.repeat(32)).first();
 }
 const triggers=seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const schema=await db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all(),wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');let changedReceipt=false,competitive=false,lost=false;
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){
  if(kind==='receipt-source'&&!changedReceipt&&String(init?.body).includes("UPDATE role_settlements SET state='settled',reason='canonical233_put_acknowledged_and_confirmed'")){
   changedReceipt=true;await env.DB.prepare("UPDATE roster_snapshots SET source='addon-native-v1:'||?1").bind(JSON.stringify(scope)).run();
  }
  const nativeRows=JSON.parse(String(init.body)),physicalRows=Array.isArray(nativeRows)?nativeRows:[nativeRows];
  const neutralBatch=physicalRows.some(p=>p.sql.includes('INSERT INTO role_settlements')&&p.sql.includes('original_identity_intent280'))&&physicalRows.some(p=>p.sql.includes('UPDATE pending SET consumed_at'));
  if(kind==='existing-source-race'&&neutralBatch&&!competitive){competitive=true;await env.DB.prepare("UPDATE characters SET source='changed-after-capture' WHERE discord_id=?1").bind(subject).run();}
  const w={requestBody:init?.body,status:null,responseBody:null,neutralBatch};wires.push(w);const r=await Reflect.apply(send,fetcher,[input,init]);w.status=r.status;w.responseBody=await r.clone().text();
  if(kind==='existing-lost'&&neutralBatch&&!lost&&w.responseBody.includes('\"success\":true')){lost=true;w.replyLost=true;throw Error('synthetic_committed_neutral_reply_lost');}return r;
 }});
 const env={...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)};active.set(kind,{env,subject,scope});let result,error=null,repeat=null,retention=null,original=null,originalAfter=null,selector=null;const start=wires.length;
 try{
  if(kind==='legacy-anchor'){original=await db.prepare("SELECT * FROM role_settlements WHERE id=?1").bind('a'.repeat(32)).first();result=await runNativeSubject232(env,subject,callBudget(env));originalAfter=await db.prepare("SELECT * FROM role_settlements WHERE id=?1").bind('a'.repeat(32)).first();}
  else{
   const now=seed.now,guid='Player-4613-12345678',scopeHash=(await H('native-scope|1|'+scope.guild+'|'+scope.realm)).slice(0,16),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('membership|1|fern melder|'+guid+'|'+seed.code+'|1|'+now+'|'+scopeHash))).slice(0,32);
   const response=await postVerify(env,{character:'Fern Melder',code:seed.code,source:'whisper',guid,nativeMembership:{version:1,member:true,observedAt:now,scopeHash,mac}});result={status:response.status,body:await response.json()};
  }
  if(['put-unknown','own-replace','cleanup-ban','cleanup-departure','manual-preserved','profile-swap'].includes(kind)||kind.startsWith('own-replace-budget')||kind==='own-replace-job1'||kind==='own-replace-expiring'){
   if(kind==='own-replace'||kind.startsWith('own-replace-budget')||kind==='own-replace-job1'||kind==='own-replace-expiring'||kind==='manual-preserved'||kind==='profile-swap')await env.DB.prepare("UPDATE roster_members SET rank='Member',rank_index=7 WHERE guid='Player-4613-12345678'").run();
   if(kind==='own-replace-expiring')await env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-500").run();
   if(kind==='profile-swap')await env.DB.prepare("UPDATE role_settlements SET native_profile=?1,native_rank=8,native_rank_name='Alt' WHERE attempts=1 AND desired=1").bind(CANONICAL_PROFILE233).run();
   if(kind==='cleanup-ban'){await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(subject).run();await env.DB.prepare('UPDATE roster_snapshots SET source=?1').bind('addon-native-v1:'+JSON.stringify(scope)).run();}
   if(kind==='cleanup-departure'){await env.DB.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(subject).run();await env.DB.batch([env.DB.prepare('DELETE FROM roster_members'),env.DB.prepare('UPDATE roster_snapshots SET member_count=0,source=?1').bind('addon-native-v1:'+JSON.stringify(scope))]);}
   const calls=callBudget(env);if(kind.startsWith('own-replace-budget'))calls.limit=Number(kind.slice('own-replace-budget'.length));
   repeat=await runNativeSubject232(env,subject,calls,kind==='own-replace-job1'?1:2);
  }
  selector=(await env.DB.prepare(DIRECTIVE_CANONICAL_SWEEP280_SELECT).bind(config.GUILD_ID,'',8,0,'d'.repeat(32)).all()).results;
  const retentionStart=wires.length,out=await env.DB.batch(betaResetReceiptRetentionStatements(env));retention={start:retentionStart,end:wires.length,success:out.every(r=>r.success===true)};
 }catch(e){error=String(e?.stack||e);}
 const end=wires.length,rows=await db.prepare('SELECT * FROM role_settlements ORDER BY created_at,id').all(),characters=await db.prepare('SELECT status,guid FROM characters WHERE discord_id=?1').bind(subject).all(),control=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),after=await db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
 const planner=oldPolicy?null:DIRECTIVE_RANK_NAMES.map((name,i)=>CANONICAL_RANKS233.findIndex(r=>r.roleId===canonicalNativeRole233(parseCanonicalRankPolicy233(policy),i,name)?.roleId));
 return Response.json({competitive,lost,pending:(await db.prepare('SELECT * FROM pending ORDER BY id').all()).results,originalExisting280,originalUnknown280,unknownAfter280:await db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind('f'.repeat(32)).first(),existingAfter280:await db.prepare('SELECT * FROM characters WHERE discord_id=?1').bind(subject).all(),kind,index,actualLocalWorkerdD1:true,clockOverride:false,result,error,repeat,retention,rows:rows.results,characters:characters.results,wires,start,end,rosterRows:1000,schemaUnchanged:JSON.stringify(schema.results)===JSON.stringify(after.results),control,original,originalAfter,selector,changedReceipt,planner,expectedMapping:DIRECTIVE_CANONICAL_INDEX,providerCalls:0});
}};}

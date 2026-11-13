import {CANONICAL_MIGRATION_PROFILE233} from '../src/canonical-migration233.ts';
import {captureRuntimeVenue230,runtimeVenue230Facts} from '../src/shared-membership-cutover230.ts';
import {removeBanRankRoles1112,migrateCanonicalRank233} from '../src/role-settlements.ts';
import * as M280 from '../src/routine-membership-authority232.ts';
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
export function refusalFixture280(seed){const spent=new Set(),active=new Map();return {async fetch(request,bindings){
 const name=new URL(request.url).pathname.slice(1);
 if(name.startsWith('mutate/')){const kind=name.slice(7),a=active.get(kind);if(!a)return new Response(null,{status:404});if(kind==='transition-refusal429-tuple-race'){await a.env.DB.prepare("UPDATE role_settlements SET claim_nonce=(CASE substr(claim_nonce,1,1) WHEN '7' THEN '6' ELSE '7' END)||substr(claim_nonce,2) WHERE desired=0 AND state='dispatching'").run();return Response.json({mutated:true});}if(kind==='transition-policy')a.env.CANONICAL_RANKS233='off';
 else if(kind==='transition-sourcegraph-ban'){const row=a.sourceGraph();if(!row)throw Error('original_source_graph_not_observed');row.rows_json='[]';a.flags.sourceGraphMutated=true;}
 else if(kind==='transition-provider-token-ban')a.env.DISCORD_BOT_TOKEN+='-changed';
 else if(kind==='transition-method-ban'){Object.defineProperty(a.raw,'batch',{value:async()=>{throw Error('synthetic_changed_original_method');},configurable:true,writable:true});a.flags.methodChanged=true;}
 else if(kind==='transition-snapshot-ban')await a.env.DB.prepare('UPDATE roster_snapshots SET exported_at=exported_at+1').run();
 else if(kind==='transition-source-ban')await a.env.DB.prepare("UPDATE roster_snapshots SET source=source||'synthetic-source-change'").run();
 else if(kind==='transition-table-ban')await a.env.DB.prepare("UPDATE roster_members SET rank='Wrong rank' WHERE name_key='synthetic 17'").run();
 else if(kind==='transition-link-ban')await a.env.DB.prepare('UPDATE characters SET verified_at=verified_at+1 WHERE discord_id=?1').bind(a.subject).run();
 else if(kind==='transition-guid-ban')await a.env.DB.prepare("UPDATE characters SET guid='Player-4613-87654321' WHERE discord_id=?1").bind(a.subject).run();
 else if(kind==='transition-generation-ban')await a.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(a.subject,'9'.repeat(32),seed.now).run();
 else if(kind.startsWith('transition-tuple-')){const field=kind.slice('transition-tuple-'.length).replace('-ban',''),allowed={nonce:"claim_nonce=(CASE substr(claim_nonce,1,1) WHEN '7' THEN '6' ELSE '7' END)||substr(claim_nonce,2)",digest:"request_digest=(CASE substr(request_digest,1,1) WHEN '8' THEN '7' ELSE '8' END)||substr(request_digest,2)",profile:"native_profile='synthetic_foreign_profile'",created:'created_at=created_at+1',expiry:'expires_at=expires_at+1'};if(!allowed[field])throw Error('fixed_tuple_mutation');await a.env.DB.prepare('UPDATE role_settlements SET '+allowed[field]+" WHERE desired=0 AND state='dispatching'").run();}
 else if(kind==='transition-ban'||kind.endsWith('-ban'))await a.env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(a.subject).run();else if(kind==='await-row')await a.env.DB.prepare("UPDATE roster_members SET rank='Wrong rank' WHERE name_key='synthetic 17'").run();else if(kind==='await-generation')await a.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(a.subject,'9'.repeat(32),seed.now).run();else await a.env.DB.prepare("UPDATE roster_snapshots SET source='addon-native-v1:'||?1").bind(JSON.stringify(a.scope)).run();return Response.json({mutated:true});}
 const kind=name;if(request.method!=='POST'||spent.has(kind))return new Response(null,{status:404});spent.add(kind);
 const db=bindings['DB_'+kind.replaceAll('-','_')];if(!db)return new Response(null,{status:404});
 const subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,oldPolicy=kind.startsWith('old-policy'),oldSource=oldPolicy||kind.startsWith('old-source');
 const index=kind==='transition-manual-cycle'?2:kind.startsWith('transition-removal-')?0:kind==='integrity-controls'||kind.startsWith('transition-')?5:kind==='entitlement'?5:kind.startsWith('own-replace-')?0:/^[a-z-]+[0-9]$/.test(kind)?Number(kind.at(-1)):0,names=oldSource?NATIVE_RANK_NAMES232:DIRECTIVE_RANK_NAMES;
 const closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:OLD230_DEBT,createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure),scope={version:1,...NATIVE_SCOPE232};
 const policy=JSON.stringify({version:oldPolicy?1:2,enabled:true,profile:oldPolicy?CANONICAL_PROFILE233:DIRECTIVE_CANONICAL_PROFILE,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const config={...seed.config,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',CANONICAL_RANKS233:policy,SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind};
 const source=oldSource?'addon-native-v1:'+JSON.stringify(scope):kind==='unqualified'?'addon-native-v2:'+JSON.stringify({version:2,guild:scope.guild,realm:scope.realm,rankProfile:null,rankSchemeDigest:null,rankNames:null}):qualifiedNativeSnapshotSource(scope.guild,scope.realm);
 if(kind==='entitlement')config.CANONICAL_ENTITLEMENTS233=JSON.stringify({version:1,profile:CANONICAL_PROFILE233,guildId:config.GUILD_ID,packetSHA256:'4'.repeat(64),entries:[{subject,generation:null,roleKey:'branch-gm'}]});
 const create=seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql));while(create.length)await db.batch(create.splice(0,40));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};if(table.name==='site_settings'&&row.key==='membership230:closure:'+closure.operationId)row.value=closureJSON;if(table.name==='roster_snapshots'){row.source=source;row.member_count=907;}if(table.name==='roster_members'){row.rank=names[index];row.rank_index=index;}const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(n=>'"'+n+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(n=>row[n])).run();}
 const roster=await db.prepare('SELECT snapshot_id FROM roster_members LIMIT 1').first(),fill=[];for(let i=0;i<906;i++){const name='Synthetic '+i;fill.push(db.prepare('INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index,level)VALUES(?1,?2,?3,?4,?5,?6,60)').bind(roster.snapshot_id,name,name.toLowerCase(),'Player-4613-'+(0x10000000+i).toString(16).toUpperCase(),kind==='wrong-row'&&i===17?'Wrong rank':names[oldSource||kind==='empty-ranks'?index:i%10],oldSource||kind==='empty-ranks'?index:i%10));}while(fill.length)await db.batch(fill.splice(0,40));
 if(kind==='legacy-anchor'){
  await db.prepare('INSERT OR IGNORE INTO members(discord_id)VALUES(?1)').bind(subject).run();
  await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('fern melder','Fern Melder',?1,'member',?2,?2,'whisper','Player-4613-12345678')").bind(subject,seed.now-20).run();
  await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'settled','canonical233_put_acknowledged_and_confirmed',1,?5,?6,?7,?8,?9,1,'Player-4613-12345678',?10,0,'Guild Master')").bind('a'.repeat(32),subject,config.GUILD_ID,CANONICAL_RANKS233[0].roleId,'b'.repeat(32),'c'.repeat(64),seed.now-10,seed.now+290,seed.now-9,CANONICAL_PROFILE233).run();
  await db.prepare("UPDATE roster_members SET rank='Member',rank_index=7 WHERE guid='Player-4613-12345678'").run();
 }
 if(kind==='old-unknown')await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,subject_generation,created_at,expires_at,native_profile)VALUES(?1,?2,'canonical_consumed233',?3,?4,1,'unknown','synthetic_old_unresolved',1,?5,?6,?6,?7)").bind('e'.repeat(32),subject,config.GUILD_ID,CANONICAL_RANKS233[1].roleId,'f'.repeat(32),seed.now-900,CANONICAL_PROFILE233).run();
 const triggers=seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 let sourceGraph=null;const originalBatch280=method(db,'batch');
 Object.defineProperty(db,'batch',{configurable:true,writable:true,value:async function(plan){const out=await Reflect.apply(originalBatch280,db,[plan]);for(const packet of out)for(const row of packet.results??[])if(Object.hasOwn(row,'rows_json')&&Object.hasOwn(row,'links_json'))sourceGraph=row;return out;}});
 const flags280={};
 const schema=await db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all(),wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');let changedReceipt=false;
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){
  if(kind==='receipt-source'&&!changedReceipt&&String(init?.body).includes("UPDATE role_settlements SET state='settled',reason='canonical233_put_acknowledged_and_confirmed'")){
   changedReceipt=true;await env.DB.prepare("UPDATE roster_snapshots SET source='addon-native-v1:'||?1").bind(JSON.stringify(scope)).run();
  }
  const w={requestBody:init?.body,status:null,responseBody:null};wires.push(w);const q=JSON.parse(init.body),pack=Array.isArray(q)?q:[q];
  if(kind==='transition-replay429-persist-lost'&&flags280.refusalAnswerLost&&pack.some(x=>x.sql.startsWith('UPDATE role_settlements SET state=?')&&x.params?.includes('native232_provider_outcome_unknown'))){flags280.fallbackUnknownFailedBeforeCommit=true;w.failedBeforeCommit=true;throw Error('synthetic_fallback_unknown_before_commit');}
  const r=await Reflect.apply(send,fetcher,[input,init]);w.status=r.status;w.responseBody=await r.clone().text();
  if(kind==='transition-replay429-persist-lost'&&!flags280.refusalAnswerLost&&pack.some(x=>x.sql.includes("UPDATE role_settlements SET state='held',reason=?")&&x.sql.includes("original_refusal_source280")&&typeof x.params?.[21]==='string'&&x.params[21].includes('canonical-routine-refusal-v1'))){flags280.refusalAnswerLost=true;w.originalCommittedAnswerLost=true;throw Error('synthetic_original_noeffect_answer_lost_after_commit');}
  if(kind==='transition-receipt-lost'&&!flags280.receiptAnswerLost&&pack.some(x=>x.sql.includes("UPDATE role_settlements SET state='settled',reason=?")&&x.sql.includes('proof_id IS ?')&&x.sql.includes('checked_at IS ?')&&x.params?.[9]===0)){flags280.receiptAnswerLost=true;w.originalAnswerLost=true;throw Error('synthetic_original_native_receipt_answer_lost');}
  if(kind==='transition-late'&&!flags280.finalGuardDelayed&&pack.some(x=>x.sql.includes('SELECT 1 FROM role_settlements WHERE')&&x.params?.[9]===0)){
   flags280.finalGuardDelayed=true;const row=await db.prepare("SELECT expires_at FROM role_settlements WHERE desired=0 AND state='dispatching' ORDER BY created_at DESC LIMIT 1").first();if(!row)throw Error('original_dispatch_deadline_missing');flags280.originalDeadline=row.expires_at;const ms=Math.max(0,row.expires_at*1000-Date.now()-2500);flags280.finalGuardDelayMilliseconds=ms;await new Promise(resolve=>setTimeout(resolve,ms));
  }
  return r;
 }});
 const env={...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)};active.set(kind,{env,subject,scope,raw:db,flags:flags280,sourceGraph:()=>sourceGraph});let result,error=null,repeat=null,visits280=[],visitCosts280=[],prelude280=null,manualOriginal280=null,manualAfter280=null,retention=null,original=null,originalAfter=null,selector=null,integrity280=[];const start=wires.length;
 try{
  if(kind==='transition-consumed-due'||kind==='transition-consumed-malformed')await env.DB.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('role.managed.cooldown280',?1,CAST(strftime('%s','now') AS INTEGER),NULL)").bind(kind.endsWith('malformed')?'{"version":1,"due":false}':JSON.stringify({version:1,due:Math.floor(Date.now()/1000)+60})).run();
  if(kind==='legacy-anchor'){original=await db.prepare("SELECT * FROM role_settlements WHERE id=?1").bind('a'.repeat(32)).first();result=await runNativeSubject232(env,subject,callBudget(env));originalAfter=await db.prepare("SELECT * FROM role_settlements WHERE id=?1").bind('a'.repeat(32)).first();}
  else{
   const now=seed.now,guid='Player-4613-12345678',scopeHash=(await H('native-scope|1|'+scope.guild+'|'+scope.realm)).slice(0,16),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('membership|1|fern melder|'+guid+'|'+seed.code+'|1|'+now+'|'+scopeHash))).slice(0,32);
   const response=await postVerify(env,{character:'Fern Melder',code:seed.code,source:'whisper',guid,nativeMembership:{version:1,member:true,observedAt:now,scopeHash,mac}});result={status:response.status,body:await response.json()};
  }
  if(kind==='integrity-controls'){
   original=await db.prepare('SELECT * FROM role_settlements WHERE desired=1 AND attempts=1').all();
   const check=(name,pass,observed)=>integrity280.push({name,pass:!!pass,observed});
   const throws=fn=>{try{fn();return false;}catch{return true;}};
   const fresh=async()=>{const cap=await M280.captureRoutineMembership232(env,subject);if(!cap)throw Error('genuine_integrity_cap_missing');return{cap,effect:M280.routineMembership232Environment(env,cap)};};
   let f=await fresh();check('genuine active original source integrity passes',!throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));
   check('lookalike cap is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,Object.freeze({}))));
   M280.closeRoutineMembership232(f.cap);check('closed original cap remains held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));
   for(const field of ['CANONICAL_RANKS233','CANONICAL_ENTITLEMENTS233','NATIVE_RANK_SYNC232']){
    f=await fresh();const saved=Object.getOwnPropertyDescriptor(env,field);Object.defineProperty(env,field,{value:'synthetic-rank-policy-off',writable:true,enumerable:true,configurable:true});
    check('only rank-policy slot '+field+' may stop authority without breaking source integrity',!throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap))&&throws(()=>M280.assertRoutineMembership232(f.effect,f.cap)));
    if(saved)Object.defineProperty(env,field,saved);else delete env[field];M280.closeRoutineMembership232(f.cap);
   }
   for(const field of ['DISCORD_APP_ID','DISCORD_BOT_TOKEN','GUILD_ID','VERIFY_NATIVE_SCOPE','PRIVACY_WRITE_ADMISSION_EPOCH','MEMBERSHIP_ROLE_SETTLEMENT_ENABLED','BLOCKING_ROLE_IDS','VERIFY_SECRET']){
    f=await fresh();const saved=Object.getOwnPropertyDescriptor(env,field);Object.defineProperty(env,field,{value:'synthetic-critical-change',writable:true,enumerable:true,configurable:true});
    check('retained original '+field+' mutation is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));
    if(saved)Object.defineProperty(env,field,saved);else delete env[field];M280.closeRoutineMembership232(f.cap);
   }
   f=await fresh();const tokenDescriptor=Object.getOwnPropertyDescriptor(env,'DISCORD_BOT_TOKEN');Object.defineProperty(env,'DISCORD_BOT_TOKEN',{...tokenDescriptor,writable:!tokenDescriptor.writable});
   check('retained original configuration descriptor change is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));Object.defineProperty(env,'DISCORD_BOT_TOKEN',tokenDescriptor);M280.closeRoutineMembership232(f.cap);
   f=await fresh();check('replacement effect DB is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280({...f.effect,DB:{}},f.cap)));M280.closeRoutineMembership232(f.cap);
   f=await fresh();if(!sourceGraph)throw Error('original_integrity_source_graph_missing');sourceGraph.rows_json='[]';check('original Native source result mutation is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));M280.closeRoutineMembership232(f.cap);
   f=await fresh();const methodDescriptor=Object.getOwnPropertyDescriptor(db,'batch');Object.defineProperty(db,'batch',{...methodDescriptor,value:async function(plan){return Reflect.apply(methodDescriptor.value,db,[plan]);}});
   check('original custody method replacement is held',throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)));Object.defineProperty(db,'batch',methodDescriptor);M280.closeRoutineMembership232(f.cap);
   await env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-598").run();f=await fresh();const wasActive=!throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)),at=Date.now();await new Promise(resolve=>setTimeout(resolve,2500));
   check('original source deadline expires on real time without renewal',wasActive&&Date.now()-at>=2500&&throws(()=>M280.assertOriginalRoutineSourceIntegrity280(f.effect,f.cap)),{elapsedMilliseconds:Date.now()-at});M280.closeRoutineMembership232(f.cap);
  }
  if(kind.startsWith('transition-')||['put-unknown','own-replace','cleanup-ban','cleanup-departure','manual-preserved','profile-swap'].includes(kind)||kind.startsWith('own-replace-budget')||kind==='own-replace-job1'||kind==='own-replace-expiring'){
   if(kind.startsWith('transition-')&&!kind.startsWith('transition-removal-')||kind==='own-replace'||kind.startsWith('own-replace-budget')||kind==='own-replace-job1'||kind==='own-replace-expiring'||kind==='manual-preserved'||kind==='profile-swap')await env.DB.prepare("UPDATE roster_members SET rank='Member',rank_index=7 WHERE guid='Player-4613-12345678'").run();
   if(kind==='own-replace-expiring')await env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-500").run();
   if(kind==='profile-swap')await env.DB.prepare("UPDATE role_settlements SET native_profile=?1,native_rank=8,native_rank_name='Alt' WHERE attempts=1 AND desired=1").bind(CANONICAL_PROFILE233).run();
   if(kind==='cleanup-ban'){await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(subject).run();await env.DB.prepare('UPDATE roster_snapshots SET source=?1').bind('addon-native-v1:'+JSON.stringify(scope)).run();}
   if(kind==='cleanup-departure'){await env.DB.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(subject).run();await env.DB.batch([env.DB.prepare('DELETE FROM roster_members'),env.DB.prepare('UPDATE roster_snapshots SET member_count=0,source=?1').bind('addon-native-v1:'+JSON.stringify(scope))]);}
   if(kind==='transition-late')await env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-480").run();
   original=await db.prepare('SELECT * FROM role_settlements WHERE desired=1 AND attempts=1').all();const calls=callBudget(env);if(kind.startsWith('own-replace-budget'))calls.limit=Number(kind.slice('own-replace-budget'.length));
   if(kind==='transition-manual-cycle'||kind==='transition-ban-manual-cycle'||kind==='transition-ban-readded'||kind==='transition-ban429-expired'){
    const set=async(rank,index)=>env.DB.prepare("UPDATE roster_members SET rank=?1,rank_index=?2 WHERE guid='Player-4613-12345678'").bind(rank,index).run();
    const mock=async(action,role)=>{const response=await fetch('https://discord.com/api/v10/__fixture/'+action+'/'+role,{method:'POST',headers:{authorization:'Bot '+config.DISCORD_BOT_TOKEN}});if(response.status!==204)throw Error('fixture_provider_state_change_failed');};
    const visit=async(origin)=>{const first=wires.length,calls=callBudget(env),answer=origin?await removeBanRankRoles1112(env,subject,origin,null,calls):await runNativeSubject232(env,subject,calls,2),last=wires.length;visits280.push(answer);visitCosts280.push({first,last,http:calls.attempts,physical:wires.slice(first,last).reduce((n,w)=>{const q=JSON.parse(w.requestBody);return n+(Array.isArray(q)?q.length:1);},0)});return answer;};
    const originalRefusal=()=>db.prepare("SELECT * FROM role_settlements WHERE desired=0 AND attempts=1 AND state='held' ORDER BY created_at,id LIMIT 1").first();
    if(kind==='transition-manual-cycle'){
     const role=CANONICAL_RANKS233[2].roleId;
     await visit();manualOriginal280=await originalRefusal();
     const before=await db.prepare('SELECT count(*) AS n FROM role_settlements').first();await visit();const after=await db.prepare('SELECT count(*) AS n FROM role_settlements').first();flags280.noHeldGrowth=before.n===after.n;
     await mock('strip',role);await visit();await set('Officer',2);await visit();await set('Member',7);repeat=await visit();
    }else{
     await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(subject).run();
     const event=await env.DB.prepare("INSERT INTO audit(ts,action,actor,subject,details)VALUES(CAST(strftime('%s','now') AS INTEGER),'admin.ban','system',?1,NULL)RETURNING id").bind(subject).first();
     const origin={kind:'command',banEvent:event.id};await visit(origin);manualOriginal280=await originalRefusal();
     if(kind==='transition-ban-readded'||kind==='transition-ban429-expired'){
      if(kind==='transition-ban-readded')await mock('restore',CANONICAL_RANKS233[7].roleId);
      else{const rate=await db.prepare("SELECT value FROM site_settings WHERE key='role.managed.cooldown280'").first();if(!rate)throw Error('genuine_original_cooldown_missing');const due=JSON.parse(rate.value).due;await new Promise(resolve=>setTimeout(resolve,Math.max(0,due*1000-Date.now()+30)));}
      repeat=await visit(origin);
     }else{
     const before=await db.prepare('SELECT count(*) AS n FROM role_settlements').first();await visit(origin);const after=await db.prepare('SELECT count(*) AS n FROM role_settlements').first();flags280.noHeldGrowth=before.n===after.n;
     await mock('strip',CANONICAL_RANKS233[7].roleId);await env.DB.prepare('UPDATE members SET banned=0 WHERE discord_id=?1').bind(subject).run();
     await env.DB.prepare("INSERT INTO audit(ts,action,actor,subject,details)VALUES(CAST(strftime('%s','now') AS INTEGER),'admin.unban','system',?1,NULL)").bind(subject).run();
     await mock('restore',CANONICAL_RANKS233[7].roleId);await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(subject).run();
     const next=await env.DB.prepare("INSERT INTO audit(ts,action,actor,subject,details)VALUES(CAST(strftime('%s','now') AS INTEGER),'admin.ban','system',?1,NULL)RETURNING id").bind(subject).first();repeat=await visit({kind:'command',banEvent:next.id});
     }
    }
    manualAfter280=manualOriginal280?await db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(manualOriginal280.id).first():null;
   }else if(kind.startsWith('transition-removal-')){
    const GM=CANONICAL_RANKS233[0].roleId,OFFICER=CANONICAL_RANKS233[2].roleId;
    const set=async(rank,index)=>env.DB.prepare("UPDATE roster_members SET rank=?1,rank_index=?2 WHERE guid='Player-4613-12345678'").bind(rank,index).run();
    const mock=async(action,role)=>{const response=await fetch('https://discord.com/api/v10/__fixture/'+action+'/'+role,{method:'POST',headers:{authorization:'Bot '+config.DISCORD_BOT_TOKEN}});if(response.status!==204)throw Error('fixture_provider_state_change_failed');};
    const visit=async()=>{const first=wires.length,calls=callBudget(env),answer=await runNativeSubject232(env,subject,calls,2),last=wires.length;visits280.push(answer);visitCosts280.push({first,last,http:calls.attempts,physical:wires.slice(first,last).reduce((n,w)=>{const q=JSON.parse(w.requestBody);return n+(Array.isArray(q)?q.length:1);},0)});return answer;};
    const firstClock=Math.max(...original.results.map(row=>row.checked_at||0));await new Promise(resolve=>setTimeout(resolve,Math.max(0,(firstClock+1)*1000-Date.now())));
    await mock('strip',GM);await visit();await set('Officer',2);await visit();await mock('restore',GM);await set('Member',7);for(let attempt=0;attempt<3;attempt++)repeat=await visit();
   }else if(kind.startsWith('transition-migration-')){
    const firstClock=Math.max(...original.results.map(row=>row.checked_at||0));await new Promise(resolve=>setTimeout(resolve,Math.max(0,(firstClock+1)*1000-Date.now())));
    if(kind==='transition-migration-manual')prelude280=await runNativeSubject232(env,subject,callBudget(env),2);
    if(kind==='transition-migration-due')await env.DB.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('role.managed.cooldown280',?1,CAST(strftime('%s','now') AS INTEGER),NULL)").bind(JSON.stringify({version:1,due:Math.floor(Date.now()/1000)+60})).run();
    const selected=await captureRuntimeVenue230(env);if(selected.mode!=='enabled')throw Error('genuine_migration_venue_held');const venue=runtimeVenue230Facts(selected.venue),at=Math.floor(Date.now()/1000);
    const plan={version:1,profile:CANONICAL_MIGRATION_PROFILE233,guildId:env.GUILD_ID,operationId:(await H(kind)).slice(0,32),epoch:venue.epoch,seal:await H(venue.sealJSON),sourceTree:'2'.repeat(40),policySHA256:await H(env.CANONICAL_RANKS233),packetSHA256:'3'.repeat(64),issuedAt:at,expiresAt:at+120,entries:[{subject,generation:null,currentRoles:[CANONICAL_RANKS233[7].roleId],targetRole:CANONICAL_RANKS233[9].roleId}]};
    env.CANONICAL_MIGRATION_SOURCE_TREE233=plan.sourceTree;env.CANONICAL_MIGRATION233=JSON.stringify(plan);repeat=await migrateCanonicalRank233(env,subject,callBudget(env));visits280.push(repeat);repeat=await migrateCanonicalRank233(env,subject,callBudget(env));visits280.push(repeat);
   }else if(kind.startsWith('transition-banrefusal')||kind.startsWith('transition-banunknown')){
    await env.DB.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(subject).run();
    const event=await env.DB.prepare("INSERT INTO audit(ts,action,actor,subject,details)VALUES(CAST(strftime('%s','now') AS INTEGER),'admin.ban','system',?1,NULL)RETURNING id").bind(subject).first();
    const origin={kind:'command',banEvent:event.id};repeat=await removeBanRankRoles1112(env,subject,origin,null,calls);visits280.push(repeat);repeat=await removeBanRankRoles1112(env,subject,origin,null,callBudget(env));visits280.push(repeat);
   }else{repeat=await runNativeSubject232(env,subject,calls,kind==='own-replace-job1'?1:2);visits280.push(repeat);if(kind==='transition-replay429-persist-lost')await new Promise(resolve=>setTimeout(resolve,1500));repeat=await runNativeSubject232(env,subject,callBudget(env),2);visits280.push(repeat);}
  }
  selector=[]; // This custody fixture does not exercise the unrelated sweep selector.
  retention={notRun:'This focused custody fixture does not run unrelated retention.'};
 }catch(e){error=String(e?.stack||e);}
 originalAfter=await db.prepare('SELECT * FROM role_settlements WHERE desired=1 AND attempts=1').all();const end=wires.length,service280=await db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key='role.managed.cooldown280'").all(),rows=await db.prepare('SELECT * FROM role_settlements ORDER BY created_at,id').all(),characters=await db.prepare('SELECT status,guid FROM characters WHERE discord_id=?1').bind(subject).all(),control=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),after=await db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
 const planner=oldPolicy?null:DIRECTIVE_RANK_NAMES.map((name,i)=>CANONICAL_RANKS233.findIndex(r=>r.roleId===canonicalNativeRole233(parseCanonicalRankPolicy233(policy),i,name)?.roleId));
 return Response.json({kind,index,actualLocalWorkerdD1:true,clockOverride:false,result,error,repeat,visits280,visitCosts280,prelude280,manualOriginal280,manualAfter280,retention,rows:rows.results,service280:service280.results,characters:characters.results,wires,start,end,rosterRows:907,schemaUnchanged:JSON.stringify(schema.results)===JSON.stringify(after.results),control,original,originalAfter,selector,changedReceipt,planner,expectedMapping:DIRECTIVE_CANONICAL_INDEX,providerCalls:0,integrity280,flags280,actualCompletedAt:Math.floor(Date.now()/1000)});
}};}

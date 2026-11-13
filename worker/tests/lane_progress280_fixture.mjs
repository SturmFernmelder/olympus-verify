// Actual sweep/issuer/Native D1 regression; synthetic data and external providers only.
import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_EXPECTED_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {sweepMemberRoles} from '../src/restore.ts';
import {callBudget} from '../src/roles.ts';
import * as roleModule from '../src/roles.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {runServingErasureJob} from '../src/privacy-serving-jobs.ts';
const C0='100000000000000000',C1='111111111111111111',C2='222222222222222222',B2='500000000000000005',B0='300000000000000003',B1='400000000000000004',BOT='300000000000000099',G='236932545793490944';
const MEMBER='1552077551839617104',BASE='https://guild.example',EPOCH='a'.repeat(32),LAYOUT=TEST_LAYOUT280;
const profile=LAYOUT==='canonical'?JSON.parse(ADMISSION_EXPECTED_JSON):JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
const cases=new Map();
const packs=body=>{const value=JSON.parse(body);return Array.isArray(value)?value:[value];};
function method(object,key){for(let p=object;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,key);if(d&&Object.hasOwn(d,'value')&&typeof d.value==='function')return d.value;}throw Error('original_method_missing');}
async function setup(db,kind){
 const objects=[...profile.tables,...profile.indexes,{sql:profile.slotSQL}].map(o=>db.prepare(o.sql));while(objects.length)await db.batch(objects.splice(0,40));
 const at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) at").first()).at;
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?1,'serving',0,'','',0,0)").bind(EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(at),
  db.prepare("INSERT INTO members(discord_id,username,banned,activity_at)VALUES(?1,'ordinary-member',0,?4),(?2,'cursor-owner',0,?4),(?3,'banned-member',1,?4)").bind(C1,B0,B1,at),
  db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('ordinary member','Ordinary Member',?1,'member',?2,?2,'whisper','Player-1-1234ABCD')").bind(C1,at),
  db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,trusted,complete)VALUES(1,?1,?1,?1,?2,1000,1,1)").bind(at,'addon-native-v1:'+JSON.stringify({version:1,guild:'OLYMPUS PRIME',realm:'Native Realm'})),
  db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(10,?1,'system','role.sweep','cron',?2)").bind(at-1000,JSON.stringify({a:10,c:C0,b:B0})),
  db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(11,?1,'system','roster.member','ordinary member',?2)").bind(at-400,JSON.stringify({discordId:B0})),
  db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,native_profile,created_at,expires_at,checked_at)VALUES(?1,?2,'canonical_routine233',?3,?4,1,'unknown','synthetic_prior_unresolved',1,?5,?6,?7,?8,?9,?10)").bind('f'.repeat(32),B1,G,MEMBER,'e'.repeat(32),'d'.repeat(64),CANONICAL_PROFILE233,at-1000,at-700,at-690),
 ]);
 const roster=Array.from({length:1000},(_,i)=>({name:i===0?'Ordinary Member':'Synthetic '+i,key:i===0?'ordinary member':'synthetic '+i,guid:'Player-1-'+(0x1234abcd+i).toString(16).toUpperCase()}));
 await db.prepare("INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index,level)SELECT 1,json_extract(value,'$.name'),json_extract(value,'$.key'),json_extract(value,'$.guid'),'Member',8,60 FROM json_each(?1)").bind(JSON.stringify(roster)).run();

 if(kind.startsWith('malformed-')||kind==='unknown-lane'){
  const details=kind==='malformed-ordinary-newline'?JSON.stringify({lane:'ordinary',a:10,c:C0+'\n',opaque:'original'}):kind==='malformed-ban-newline'?JSON.stringify({lane:'ban',b:B0+'\n',opaque:'original'}):kind==='malformed-ordinary'?JSON.stringify({lane:'ordinary',a:'bad',c:C0,opaque:'original'}):kind==='malformed-ban'?JSON.stringify({lane:'ban',b:42,opaque:'original'}):kind==='unknown-lane'?JSON.stringify({lane:'future',a:10,c:C0,b:B0,opaque:'original'}):'{"restored":';
  await db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(12,?1,'system','role.sweep','cron',?2)").bind(at-600,details).run();
 }
 if(kind==='wrap-ordinary'||kind==='wrap-ban')await db.prepare('UPDATE audit SET details=?1 WHERE id=10').bind(JSON.stringify({a:11,c:kind==='wrap-ordinary'?C1:C0,b:kind==='wrap-ban'?B1:B0})).run();
 if(kind==='marker-min'){
  await db.prepare('DELETE FROM audit WHERE id=10').run();
  await db.batch([
   db.prepare("INSERT INTO members(discord_id,username,banned,activity_at)VALUES(?1,'older-member',0,?2)").bind(C2,at),
   db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('older member','Older Member',?1,'member',?2,?2,'whisper','Player-1-1234ABCE')").bind(C2,at),
   db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(1,?1,'system','treasury.erased_replay280','source',?2),(5,?3,'system','roster.member','older member',?4)").bind(at,JSON.stringify({sourceKey:'synthetic-closed-marker',expiresAt:at+1000}),at-172800,JSON.stringify({discordId:C2}))
  ]);
 }
 if(kind==='history-1000')await db.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)SELECT 12+CAST(key AS INTEGER),?1,'system','role.sweep','cron',value FROM json_each(?2)").bind(at-500,JSON.stringify(Array.from({length:1000},()=>JSON.stringify({lane:'ban',b:B0,checked:0})))).run();
 const triggers=profile.triggers.map(o=>db.prepare(o.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const rawEnv={DB:db,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:LAYOUT,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
  COOKIE_SECRET:'synthetic-watermark-cookie-secret-0123456789',DISCORD_APP_ID:BOT,DISCORD_CLIENT_SECRET:'synthetic-watermark-client',DISCORD_BOT_TOKEN:'synthetic-watermark-bot-'+kind,VERIFY_SECRET:'synthetic-watermark-verify',SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:G,GUILD_ID:G,SITE_ADMINS:C1,ROLE_GUILD_MEMBER:MEMBER,ROLE_OFFICER:CANONICAL_RANKS233[2].roleId,ROLE_RAID_LEADER:CANONICAL_RANKS233[4].roleId,
  CANONICAL_RANKS233:JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:G,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))}),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',ROLE_SWEEP_PER_RUN:'1',ROLE_CALL_BUDGET:'44',QR_RANK_MAPPING_ENABLED:'false',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-watermark280',timestamp:'2026-11-13T00:00:00Z'},ASSETS:{async fetch(){return new Response('synthetic');}}};
 const s={db,rawEnv,env:null,kind,at,wires:[],armed:false,gates:{},writes:[],results:{},requests:[],gateCounts:{},lost:false};
 const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){
  const statements=packs(init.body),wire={at:Date.now(),statements:statements.map(p=>({sql:p.sql,params:p.params})),status:null};s.wires.push(wire);
  const final=statements.find(p=>/^INSERT\s+INTO\s+audit\s*\(\s*ts\s*,\s*actor\s*,\s*action\s*,\s*subject\s*,\s*details\s*\)/.test(p.sql)&&p.params?.[2]==='role.sweep');
  let write=null;
  if(final){const details=JSON.parse(final.params[4]),lane=details.lane||'combined';write={lane,at:Date.now(),details,params:final.params,sql:final.sql};s.writes.push(write);
   if(s.armed){const count=(s.gateCounts[lane]||0)+1;s.gateCounts[lane]=count;const key=lane+(count===1?'':count);const gate={released:false,arrivedAt:Date.now(),details};gate.resolve=()=>{gate.released=true;};s.gates[key]=gate;const until=Date.now()+15000;while(!gate.released&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));if(!gate.released)throw Error('fixture_gate_timeout');}
  }
  const response=await Reflect.apply(send,fetcher,[input,init]);wire.status=response.status;wire.finishedAt=Date.now();try{wire.native=(await response.clone().json()).map(x=>({success:x.success,meta:x.meta}));}catch{}
  if(s.kind==='read-unknown'&&!s.readLost&&statements.some(p=>p.sql.startsWith('SELECT ac.id AS ac_id')||(p.sql.startsWith('SELECT details,')&&p.sql.includes("FROM audit WHERE action = 'role.sweep'")))){s.readLost=true;throw Error('synthetic_original_progress_read_reply_lost');}
  if(write){write.deliveredAt=Date.now();write.status=response.status;if(s.kind.startsWith('lost-')&&!s.lost){s.lost=true;write.replyLost=true;throw Error('synthetic_original_progress_reply_lost');}}
  return response;
 }});
 s.env={...rawEnv,DB:createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH)};return s;
}
async function inspect(s){const rows=(await s.db.prepare("SELECT id,ts,details FROM audit WHERE action='role.sweep' ORDER BY id").all()).results;return{unknowns:(await s.db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind('f'.repeat(32)).all()).results,rows,latest:rows.length?(()=>{try{return JSON.parse(rows.at(-1).details);}catch{return null;}})():null,privacy:await s.db.prepare('SELECT subject_id,generation,state,revision FROM privacy_subjects WHERE subject_id=?1').bind(B0).first(),newBPrivacy:await s.db.prepare('SELECT subject_id,generation,state,revision FROM privacy_subjects WHERE subject_id=?1').bind(B1).first(),members:(await s.db.prepare('SELECT discord_id FROM members WHERE discord_id=?1').bind(B0).all()).results,characters:(await s.db.prepare('SELECT discord_id FROM characters WHERE discord_id=?1').bind(B0).all()).results,initialAudit:(await s.db.prepare('SELECT id FROM audit WHERE id IN(10,11)').all()).results,failures:(await s.db.prepare("SELECT id,ts,details FROM audit WHERE action='role.sweep_failed' ORDER BY id").all()).results,users:(await s.db.prepare('SELECT discord_id FROM site_users WHERE discord_id=?1').bind(B0).all()).results,jobs:(await s.db.prepare('SELECT operation_id,state,hold_reason FROM privacy_serving_jobs ORDER BY operation_id').all()).results,control:await s.db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first()};}
async function call(s,request){const start=s.wires.length,pending=[],response=await app.fetch(request,s.rawEnv,{waitUntil(p){pending.push(Promise.resolve(p));}});for(const p of pending)await p;s.requests.push({url:request.url,method:request.method,status:response.status,physicalSQL:s.wires.slice(start).reduce((n,w)=>n+w.statements.length,0)});return response;}
export default{async fetch(request,bindings){try{
 const u=new URL(request.url),kind=u.searchParams.get('case')||'ordinary-last';if(u.pathname==='/setup'){if(cases.has(kind))return new Response(null,{status:409});const s=await setup(bindings['DB_'+kind.replaceAll('-','_')],kind);cases.set(kind,s);return Response.json({actualNativeD1:true,clockOverride:false,rosterRows:1000,initial:await inspect(s),ids:{C0,C1,C2,B0,B1,B2}});}
 const s=cases.get(kind);if(!s)return new Response(null,{status:409});
 if(u.pathname==='/arm'){s.armed=true;return Response.json({armed:true});}
 if(u.pathname==='/disarm'){s.armed=false;return Response.json({armed:false});}
 if(u.pathname==='/status')return Response.json({gates:Object.fromEntries(Object.entries(s.gates).map(([k,v])=>[k,{at:v.arrivedAt,details:v.details,refs:null}])),results:s.results});
 if(u.pathname==='/release'){const lane=u.searchParams.get('lane'),g=s.gates[lane];if(!g)return new Response(null,{status:409});g.resolve();return Response.json({released:lane,at:Date.now()});}
 if(u.pathname==='/lane'){const lane=u.searchParams.get('lane');if(!['ordinary','ban','combined'].includes(lane))return new Response(null,{status:400});const env=lane==='combined'||u.searchParams.has('limit')?{...s.env}:s.env;if(lane==='combined')delete env.CANONICAL_RANKS233;if(u.searchParams.get('limit')==='2')env.ROLE_SWEEP_PER_RUN='2';const start=s.wires.length,result=await sweepMemberRoles(env,'cron',callBudget(env),undefined,lane==='combined'?undefined:lane);const item={result,at:Date.now(),physicalSQL:s.wires.slice(start).reduce((n,w)=>n+w.statements.length,0)};s.results[lane]=item;return Response.json({lane,...item});}
 if(u.pathname==='/advance'){
  const lane=u.searchParams.get('lane');
  if(lane==='ordinary')await s.env.DB.batch([
   s.env.DB.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(C1),
   s.env.DB.prepare("INSERT INTO members(discord_id,username,banned,activity_at)VALUES(?1,'later-member',0,?2)").bind(C2,s.at),
   s.env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('later member','Later Member',?1,'member',?2,?2,'whisper','Player-1-1234ABCE')").bind(C2,s.at),
   s.env.DB.prepare("INSERT INTO audit(id,ts,actor,action,subject,details)VALUES(12,?1,'system','roster.member','later member',?2)").bind(s.at-400,JSON.stringify({discordId:C2}))
  ]);
  else if(lane==='ban')await s.env.DB.batch([s.env.DB.prepare('UPDATE members SET banned=0 WHERE discord_id=?1').bind(B1),s.env.DB.prepare("INSERT INTO members(discord_id,username,banned,activity_at)VALUES(?1,'later-ban',1,?2)").bind(B2,s.at)]);
  else return new Response(null,{status:400});return Response.json({advanced:lane});
 }
 if(u.pathname==='/selected-capture'){
  await s.env.DB.batch([s.env.DB.prepare("INSERT INTO members(discord_id,username,banned,activity_at)VALUES(?1,'second-ban',1,?2)").bind(B2,s.at),s.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(B2,'7'.repeat(32),s.at)]);
  const wrap=(statement,sql)=>({bind(...args){return wrap(statement.bind(...args),sql);},async all(...args){const result=await statement.all(...args);if(sql.includes('FROM (SELECT m.discord_id'))s.selectedRows=result.results;return result;},first(...args){return statement.first(...args);},run(...args){return statement.run(...args);}});
  const originalDB=s.env.DB,db={prepare(sql){return wrap(originalDB.prepare(sql),sql);}},env={...s.env,DB:db,PRIVACY_ERASURE_ENABLED:'false'};delete env.CANONICAL_RANKS233;
  const result=await roleModule.reconcileBanned(env,B0,2,callBudget(env)),read=Reflect.get(roleModule,'readBannedSweepReferences280');
  return Response.json({diagnostic:'Transparent read-result observer around actual Native D1; legacy read-only two-member branch, not Native effect acceptance',result,selected:s.selectedRows,facts:typeof read==='function'?read(env,result):null});
 }
 if(u.pathname==='/mutate-selected'){
  const row=s.selectedRows?.find(r=>r.discord_id===B2);if(!row)return new Response(null,{status:409});const before={...row};row.privacy_generation='8'.repeat(32);row.privacy_revision=2;return Response.json({before,after:{...row}});
 }
 if(u.pathname==='/observer'){
  await s.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(B1,'7'.repeat(32),s.at).run();
  const result=await roleModule.reconcileBanned(s.env,B0,1,callBudget(s.env)),read=Reflect.get(roleModule,'readBannedSweepReferences280');
  if(typeof read!=='function')return Response.json({available:false,publicResult:result});
  const facts=read(s.env,result),tests=[];const attempt=(name,fn)=>{let held=false;try{fn();}catch{held=true;}tests.push({name,held});};
  attempt('forged-result',()=>read(s.env,{...result}));attempt('other-env',()=>read({...s.env},result));
  const db=Object.getOwnPropertyDescriptor(s.env,'DB');Object.defineProperty(s.env,'DB',{...db,value:{}});attempt('replaced-db',()=>read(s.env,result));Object.defineProperty(s.env,'DB',db);
  const cursor=result.cursor;result.cursor='';attempt('changed-cursor',()=>read(s.env,result));result.cursor=cursor;
  const checked=result.checked;result.checked=[...checked];attempt('changed-array',()=>read(s.env,result));result.checked=checked;
  let getterCalls=0;const index=Object.getOwnPropertyDescriptor(checked,'0');Object.defineProperty(checked,'0',{configurable:true,enumerable:true,get(){getterCalls++;return B1;}});attempt('index-accessor',()=>read(s.env,result));Object.defineProperty(checked,'0',index);
  return Response.json({available:true,tests,getterCalls,publicResult:result,frozen:Object.isFrozen(facts)&&Object.isFrozen(facts.references)&&facts.references.every(r=>Object.isFrozen(r)&&(!r.capture||Object.isFrozen(r.capture))),subjects:facts.references.map(r=>r.subject),originalGeneration:facts.references[0]?.capture?.subjectGeneration,retained:facts.retained,held:facts.held});
 }
 if(u.pathname==='/generation'){const target=u.searchParams.get('subject')===B1?B1:B0;await s.env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(target,'9'.repeat(32),s.at).run();return Response.json({generationTransition:true,...await inspect(s)});}
 if(u.pathname==='/continue'){const result=await runServingErasureJob(s.env);return Response.json({result,...await inspect(s)});}
 if(u.pathname==='/plans'){
  const progress=s.wires.flatMap(w=>w.statements).find(p=>p.sql.startsWith('SELECT ac.id AS ac_id')||(p.sql.startsWith('SELECT details,')&&p.sql.includes("FROM audit WHERE action = 'role.sweep'")));
  const write=s.wires.flatMap(w=>w.statements).find(p=>/^INSERT\s+INTO\s+audit\s*\(/.test(p.sql)&&p.params?.[2]==='role.sweep');
  const plans=[];for(const [name,p]of [['read',progress],['write',write]])if(p){const rows=(await s.db.prepare('EXPLAIN QUERY PLAN '+p.sql).bind(...p.params||[]).all()).results;const samples=[];if(name==='read')for(let i=0;i<3;i++){const at=performance.now(),result=await s.db.prepare(p.sql).bind(...p.params||[]).all();samples.push({elapsedMS:performance.now()-at,meta:result.meta,rows:result.results.length});}plans.push({name,sql:p.sql,params:p.params,rows,samples});}return Response.json({plans});
 }
 if(u.pathname==='/inspect')return Response.json({actualNativeD1:true,clockOverride:false,...await inspect(s),writes:s.writes,requests:s.requests,wires:s.wires.map(w=>({at:w.at,finishedAt:w.finishedAt,status:w.status,physical:w.statements.length,sqlBytes:w.statements.map(p=>new TextEncoder().encode(p.sql).length),maxBinds:Math.max(0,...w.statements.map(p=>p.params?.length||0)),native:w.native})),results:s.results});
 if(u.pathname.startsWith('/front/')){const target=new URL(BASE+u.pathname.slice('/front'.length));for(const[k,v]of u.searchParams)if(k!=='case')target.searchParams.append(k,v);const headers=new Headers(request.headers);if(request.method==='POST')headers.set('Origin',BASE);return call(s,new Request(target,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body}:{})}));}
 return new Response(null,{status:404});
}catch(error){return Response.json({error:String(error.stack)}, {status:500});}}};

import {pendingPlans280} from './pending_request280_plans.mjs';
// Two genuine worker isolates share real local D1. No source/Native substitution.
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {readPrivacySubject,privacyBoundSubjectEnv} from '../src/privacy-serving-authority.ts';
import {requestRoleReconciliation242,runRoleWork242,kickRoleWork242,handleRoleContinuation242} from '../src/role-reconcile242.ts';
import * as interactions from '../src/interactions.ts';
import {handleSiteVerification242} from '../src/verification242.ts';
import {audit,openTicketFor} from '../src/db.ts';
export function fixture280(seed){let identity;return {async fetch(request,bindings){try{
 identity??=crypto.randomUUID();const op=new URL(request.url).pathname.slice(1),db=bindings.DB;
 if(op==='setup'){
  const create=seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql));while(create.length)await db.batch(create.splice(0,40));
  const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
  for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const row of table.rows){const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(n=>'"'+n+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(n=>row[n])).run();}
  await db.prepare('DELETE FROM pending').run();
  await db.prepare("INSERT INTO relays(officer_id,character,online,seen_at,changed_at,version,addon)VALUES('fixture','Fern Melder',1,?1,?1,'0.6.30','1.5.8')").bind(seed.now).run();
  const triggers=seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
  return Response.json({identity,setup:true});
 }
 const input=request.method==='POST'?await request.json():{},subject=input.subject??'800000000000000101';
 let env={...seed.config,COOKIE_SECRET:'role-request280-server-only-cookie',DB:createPrivacyWriteAdmissionDatabase(db,'writer',seed.config.PRIVACY_WRITE_ADMISSION_LAYOUT,seed.config.PRIVACY_WRITE_ADMISSION_EPOCH)};

 const defer=[],schedule=(label,work)=>defer.push({label,work});let result=null;
 if(op==='plans')result=await pendingPlans280(env,db);
 else if(op==='enqueue')result=await requestRoleReconciliation242(env,subject,input.reason??'fixture-deliberate');
 else if(op==='ticket-peek')result=await openTicketFor(env,subject);
 else if(op==='ticket-admission'){
  env=privacyBoundSubjectEnv(env,subject,await readPrivacySubject(env,subject));const now=Math.floor(Date.now()/1000),insert=await env.DB.prepare(interactions.TICKET_REQUEST280_INSERT_SQL).bind(subject,now,now+86400,input.nonce,now-172800).run();result={changes:insert.meta.changes};
 }

 else if(op==='root'){
  const legacy=input.mode==='legacy',text=JSON.stringify({...(legacy?{}:{version:2}),kind:'requests',at:Math.floor(Date.now()/1000),nonce:input.nonce??crypto.randomUUID()}),secret=input.mode==='officer'||legacy?env.VERIFY_SECRET:env.COOKIE_SECRET,domain=legacy?'role-continuation242\n':'role-continuation280-v2\n'+(input.mode==='wrong-origin'?'https://other.invalid':'https://verify.example')+'\n';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(domain+text))),b=>b.toString(16).padStart(2,'0')).join('');
  if(input.mode==='missing')delete env.COOKIE_SECRET;
  const response=await handleRoleContinuation242(new Request('https://verify.example/internal/roles242/continue',{method:'POST',headers:{'X-Olympus-Role-Continuation':signature},body:text}),env,schedule);result={status:response.status};
 }else if(op==='kick-timeout'){
  await requestRoleReconciliation242(env,subject,'original-before-unknown-wake');const start=Date.now();try{await kickRoleWork242(env,'requests');result={returned:true,elapsed:Date.now()-start};}catch(error){result={returned:false,elapsed:Date.now()-start,error:String(error.name)};}
 }

 else if(op==='lost-reply'){
  const actual=env.DB;env={...env,DB:new Proxy(actual,{get(target,key){if(key==='batch')return async statements=>{await target.batch(statements);throw Error('Synthetic committed response lost');};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}})};
  result=await requestRoleReconciliation242(env,subject,'fixture-original-lost-reply');
 }else if(op==='work')await runRoleWork242(env,'requests');
 else if(op==='legacy')await env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(CAST(strftime('%s','now')AS INTEGER)-?3,'system','role.request242',?1,?2)").bind(subject,input.details??'{malformed',input.expired?2592001:0).run();
 else if(op==='generation')await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(subject,input.generation,seed.now).run();
 else if(op==='standing')await env.DB.prepare("UPDATE privacy_subjects SET state=?2,revision=revision+1 WHERE subject_id=?1").bind(subject,input.state).run();
 else if(op==='finish'){
  const capture=await readPrivacySubject(env,subject);await audit(env,'system','role.request242_finished',subject,{schema:'role-request280-v1',generation:capture?.subjectGeneration??null,requestId:input.requestId,state:'held',reason:'fixture_original_finished_held'},{subject,capture});
 }else if(op==='named'||op==='ticket'||op==='web'){
  const capture=await readPrivacySubject(env,subject);env=privacyBoundSubjectEnv(env,subject,capture);
  const response=op==='named'?await interactions.requestCharacterCode242(env,{id:subject,username:'Fixture'},input.character):op==='ticket'?await interactions.handleInteraction(env,{id:crypto.randomUUID(),type:2,guild_id:env.GUILD_ID,member:{user:{id:subject,username:'Fixture'},roles:[]},data:{name:'verify'}},schedule):await handleSiteVerification242(new Request('https://fixture.invalid/api/me/verification',{method:'POST',body:JSON.stringify(input.body)}),env,{id:subject,username:'Fixture'},schedule);
  result={status:response.status,headers:Object.fromEntries(response.headers),body:await response.json(),outcome:interactions.verificationIssueOutcome280?.(response)??null};
  if(input.runWake)for(const row of defer)await row.work();
 }else if(op!=='inspect')throw Error('Unknown fixture operation');
 const rows=await db.prepare("SELECT id,ts,actor,action,subject,details FROM audit WHERE action LIKE 'role.request242%' ORDER BY id").all(),pending=await db.prepare('SELECT * FROM pending WHERE discord_id=?1 ORDER BY id').bind(subject).all(),control=await db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first();
 return Response.json({identity,result,deferred:defer.map(x=>x.label),rows:rows.results,pending:pending.results,control});
}catch(error){return Response.json({fixtureError:String(error.stack)},{status:500});}}};}

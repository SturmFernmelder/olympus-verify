// Actual index and response factories. Synthetic D1/signatures only; no provider or native actions.
import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH='a'.repeat(32),APP='800000000000000002',GUILD='800000000000000001';
const config={PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,
 DISCORD_APP_ID:APP,DISCORD_CLIENT_SECRET:'header280-synthetic-client',DISCORD_BOT_TOKEN:'header280-synthetic-bot',
 WATCHER_TOKEN:'header280-synthetic-watcher-only-xxxx',VERIFY_SECRET:'header280-synthetic-secret',COOKIE_SECRET:'header280-synthetic-cookie',SITE_ADMINS:'472099715253796864',
 PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',
 ROLE_GUILD_MEMBER:'800000000000000010',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',
 CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'header280-fixture',timestamp:'2026-11-12T00:00:00Z'},
 ASSETS:{async fetch(){throw Error('No asset work expected');}}};
async function setup(db){
 const c=JSON.parse(ADMISSION_EXPECTED_JSON),statements=[...c.tables,...c.indexes].map(x=>db.prepare(x.sql));
 statements.push(db.prepare(c.slotSQL));
 while(statements.length)await db.batch(statements.splice(0,40));
 await db.batch([db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,?1,?2,'serving',0,'','',0,0)").bind(ADMISSION_PROTOCOL,EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',CAST(strftime('%s','now') AS INTEGER))")]);
 const triggers=c.triggers.map(x=>db.prepare(x.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
}
async function run(bindings){
 await setup(bindings.DB);
 const db=bindings.DB,cases=[],deferred=[],base={...config,DB:db};
 const check=(name,pass,observed)=>cases.push({name,pass:!!pass,observed});
 const call=(env,method,path,body,authorized=true)=>worker.fetch(new Request('https://verify.example'+path,{method,headers:{...(authorized?{Authorization:'Bearer '+config.WATCHER_TOKEN}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{waitUntil(p){deferred.push(p);}});
 const health=await call(base,'GET','/health'),info=await health.json();
 check('private health advertises native roster wire version2',health.status===200&&info.verification?.nativeRosterProtocolVersion===2,{status:health.status,verification:info.verification});
 const publicInfo=await (await call(base,'GET','/health',undefined,false)).json();
 check('public health exposes no verification inventory',!Object.hasOwn(publicInfo,'verification'));
 const body={exportedAt:Math.floor(Date.now()/1000),nativeGuild:'OLYMPUS PRIME',nativeRealm:'Native Realm',nativeRankTable:false,members:Array.from({length:20},(_,i)=>({name:'Synthetic '+i,guid:'Player-1-'+(1000+i).toString(16),rank:'Member',rankIndex:7,level:60}))};
 for(const mode of ['false','invalid']){
  const env={...base,VERIFY_MEMBERSHIP_ONLY:mode},before=await db.prepare('SELECT COUNT(*) AS count FROM roster_snapshots').first();
  const response=await call(env,'POST','/ingest/roster?keyVersion=native-roster-v2',body),result=await response.json(),after=await db.prepare('SELECT COUNT(*) AS count FROM roster_snapshots').first();
  check(mode+' mode refuses nativev2 before any roster change',response.status===400&&result.error==='unsupported_protocol'&&before.count===after.count,{status:response.status,result,before,after});
 }
 await Promise.allSettled(deferred);
 check('protocol refusals create no deferred role work',deferred.length===0);
 return Response.json({checks:cases.length,ok:cases.every(x=>x.pass),cases});
}
export default {async fetch(request,bindings){try{return await run(bindings);}catch(error){return Response.json({fixtureError:String(error?.stack??error)},{status:500});}}};

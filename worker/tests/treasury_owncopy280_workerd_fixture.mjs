// Portable regression fixture adapted from the independently reviewed owncopy03 harness.
// Synthetic records and Discord replies only; actual index/OAuth/form/Native D1 paths.
import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH='a'.repeat(32),ID='300000000000000003',OTHER='300000000000000004',BOT='300000000000000099',GUILD='236932545793490944';
const BASE='https://guild.example',LAYOUT='recorded-live-pre-seal-20261017';
const GUID_CASES={'short-hex':'Player-1-A','three-hex':'Player-1-ABC','long-realm':'Player-1234567-ABCD','long-hex':'Player-1-'+ 'A'.repeat(17),'valid-min':'Player-0-aBcD','valid-max':'Player-123456-'+ 'a'.repeat(16),'nonascii':'Player-1-ＡBCD','nul-guid':'Player-1-ABCD'+String.fromCharCode(0)};
const saves=new Map();let saved=null;
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
const packets=body=>{const p=JSON.parse(body);return Array.isArray(p)?p:[p];};

async function setup(db,caseId){
 const profile=JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
 const objects=[...profile.tables,...profile.indexes].map(o=>db.prepare(o.sql));objects.push(db.prepare(profile.slotSQL));
 while(objects.length)await db.batch(objects.splice(0,40));
 const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS n").first()).n;
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?1,'serving',0,'','',0,0)").bind(EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(now),
  db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,trusted,complete)VALUES(1,?1,?1,?1,'audit-synthetic-only',1000,1,1)").bind(now),
 ]);
 const accounts=Array.from({length:1000},(_,i)=>({id:i===0?ID:String(300000000001000000n+BigInt(i)),name:'Synthetic '+i,guid:'Player-1234-'+(0x10000000+i).toString(16).toUpperCase()}));
 const raw=JSON.stringify(accounts);
 await db.batch([
  db.prepare("INSERT INTO members(discord_id,username,global_name,banned,activity_at)SELECT json_extract(value,'$.id'),'synthetic_'||key,'Synthetic display',0,?2 FROM json_each(?1)").bind(raw,now),
  db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)SELECT lower(json_extract(value,'$.name')),json_extract(value,'$.name'),json_extract(value,'$.id'),'member',?2,?2,'audit-synthetic-only',json_extract(value,'$.guid') FROM json_each(?1)").bind(raw,now),
  db.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 1,lower(json_extract(value,'$.name')),json_extract(value,'$.name'),json_extract(value,'$.guid'),'Member',7,60 FROM json_each(?1)").bind(raw),
  db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?1,'member',?2,'submitted',?3,?3)").bind(ID,JSON.stringify({about:'Synthetic private own application',references:[]}),now),
  db.prepare("INSERT INTO audit(ts,actor,action,subject,details)SELECT ?2,json_extract(value,'$.id'),'synthetic.account_action',json_extract(value,'$.id'),'{}' FROM json_each(?1)").bind(raw,now),
 ]);

 const PRIVATE='SYNTHETIC_PRIVATE_CORRESPONDENCE_OWNCOPY',HASH='f19c73ab'.repeat(8),ownGuid=GUID_CASES[caseId]??accounts[0].guid,foreignGuid=accounts[1].guid;
 const legacy=(id,guid=ownGuid)=>({version:242,sourceId:id,source:'mail',character:'Synthetic 0',characterKey:'synthetic 0',guid,copper:700,items:[{name:PRIVATE,count:1}],note:PRIVATE,observedAt:now,retainUntil:now+2592000,classification:'unclassified_receipt',payloadHash:HASH});
 const v2={version:2,sourceId:'d'.repeat(24),source:'tithe-gold-v2',character:'Synthetic 0',characterKey:'synthetic 0',guid:ownGuid,copper:900,kind:'trade',recipient:'Fern Melder',collectorGuid:'Player-1-9999ABCD',guild:'OLYMPUS PRIME',realm:'Native Realm',reference:'TITHE-ABCD-EFGH',clientVersion:'synthetic',evidence:{kind:'trade_complete_and_money_delta',confirmedLocal:true,automaticCredit:false,mac:'a'.repeat(32)},observedAt:now,retainUntil:now+2592000,classification:'unclassified_receipt',payloadHash:HASH};
 if(GUID_CASES[caseId])await db.prepare('UPDATE characters SET guid=?1 WHERE discord_id=?2').bind(ownGuid,ID).run();
 const rows=[['current',legacy('current')],['d'.repeat(24),v2],['prior-name',legacy('prior-name',foreignGuid)],['empty-guid',legacy('empty-guid','')],['no-guid',Object.fromEntries(Object.entries(legacy('no-guid')).filter(([k])=>k!=='guid'))],['bad-guid',legacy('bad-guid','Player-1-NOTHEX')],['scalar-guid',{...legacy('scalar-guid'),guid:42}],['bad-copper',{...legacy('bad-copper'),copper:'700'}],['unknown-key',{...legacy('unknown-key'),rawSubject:PRIVATE}],['scalar-json','42'],['array-json','[]'],['malformed','{malformed'],['duplicate-note',JSON.stringify(legacy('duplicate-note')).replace('"note":','"note":"'+PRIVATE+'","note":')],['duplicate-items',JSON.stringify(legacy('duplicate-items')).replace('"items":','"items":["'+PRIVATE+'"],"items":')],['duplicate-guid',JSON.stringify(legacy('duplicate-guid')).replace('"guid":','"guid":"'+foreignGuid+'","guid":')],['wrong-source',{...legacy('wrong-source'),source:'unknown'}],['wrong-retention',{...legacy('wrong-retention'),retainUntil:now+2592001}],['wrong-observed',{...legacy('wrong-observed'),observedAt:'now'}],['wrong-subject',legacy('mismatched-source-id')]];
 if(caseId==='nul-sourceid'){const id='current'+String.fromCharCode(0)+PRIVATE;rows.push([id,legacy(id)]);}
 if(caseId==='nul-v2-sourceid'){const id='f'.repeat(24)+String.fromCharCode(0)+PRIVATE;rows.push([id,{...v2,sourceId:id}]);}
 if(caseId==='bad-ts-text')rows.push(['bad-clock',{...legacy('bad-clock'),observedAt:1,retainUntil:2592001}]);
 const MAX=9007199254740991;
 if(['unsafe-ts','unsafe-observed','unsafe-retain','ts-zero','ts-float'].includes(caseId)){
  const observedAt=caseId==='unsafe-observed'?MAX+1:caseId==='unsafe-retain'?MAX-2592000+1:1;
  rows.push(['bad-clock',{...legacy('bad-clock'),observedAt,retainUntil:observedAt+2592000}]);
 }
 if(caseId==='valid-clock-edge')rows[0]=['current',{...legacy('current'),observedAt:MAX-2592000,retainUntil:MAX}];
 if(caseId==='valid-sourceid-min')rows[0]=['x',legacy('x')];
 if(caseId==='valid-sourceid-max')rows[0]=['a'.repeat(128),legacy('a'.repeat(128))];
 for(const [id,row]of rows)await db.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242',?2,?3)").bind(id==='bad-clock'?(caseId==='bad-ts-text'?PRIVATE:caseId==='ts-zero'?0:caseId==='ts-float'?1.25:caseId==='unsafe-ts'?9007199254740992:9007199254740991):caseId==='valid-clock-edge'&&id==='current'?9007199254740991:now,'intake242:'+id,typeof row==='string'?row:JSON.stringify(row)).run();
 const triggers=profile.triggers.map(o=>db.prepare(o.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const wires=[],fetcher=Object.getOwnPropertyDescriptor(db,'fetcher')?.value;if(!fetcher)throw Error('original_D1_fetcher_unavailable');const send=method(fetcher,'fetch');
 // Observe original wire bytes only. Delegate the same receiver/input/init and
 // return the exact original Response; no SQL, bind, ACK, method or clock edits.
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){
  const w={requestBody:init?.body,status:null,responseBody:null,startedAt:Date.now()};wires.push(w);
  const response=await Reflect.apply(send,fetcher,[input,init]);w.status=response.status;w.responseBody=await response.clone().text();w.finishedAt=Date.now();return response;
 }});
 const env={DB:db,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:LAYOUT,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 COOKIE_SECRET:'synthetic-native-mode-cookie-secret-0123456789',DISCORD_APP_ID:BOT,DISCORD_CLIENT_SECRET:'synthetic-native-client',DISCORD_BOT_TOKEN:'synthetic-native-bot',VERIFY_SECRET:'synthetic-native-verify',SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,SITE_ADMINS:OTHER,
 ROLE_GUILD_MEMBER:'1551234567890123456',ROLE_OFFICER:'1551234567890123457',ROLE_RAID_LEADER:'1551234567890123458',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-workerd-identify-audit',timestamp:'2026-11-12T00:00:00Z'},ASSETS:{async fetch(){return new Response('synthetic static');}}};
 const sourceFacts={guid:ownGuid,now,currentId:rows[0][0],currentClock:caseId==='valid-clock-edge'?{ts:9007199254740991,observedAt:9007199252148991,retainUntil:9007199254740991}:{ts:now,observedAt:now,retainUntil:now+2592000}};
 return {db,env,wires,requests:[],copyWires:[],accounts,sourceFacts,writer:createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH)};
}
function nonempty(value,path='',out=[]){
 if(Array.isArray(value)){if(value.length)out.push({path,count:value.length});return out;}
 if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))nonempty(v,path?path+'.'+k:k,out);
 return out;
}
export const identifyFixture280={async fetch(request,bindings,ctx){
 const u=new URL(request.url);
 const caseId=u.searchParams.get('case')||'member';saved=saves.get(caseId)||null;
 if(u.pathname==='/setup'){if(saved)return new Response(null,{status:409});saved=await setup(bindings['DB_'+caseId.replaceAll('-','_')],caseId);saves.set(caseId,saved);return Response.json({accounts:1000,rosterRows:1000,ownApplication:true,ownAction:true,actualLocalWorkerdD1:true});}
 if(!saved)return new Response(null,{status:409});const s=saved;
 if(u.pathname==='/mutate'){const status=['verified','member','left','left_pending','unbound','queued'].includes(caseId)?caseId:'verified';await s.writer.prepare('UPDATE characters SET status=?1 WHERE discord_id=?2').bind(status,ID).run();if(caseId==='duplicate')await s.writer.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)SELECT 'duplicate current guid','Duplicate Current Guid',?1,'member',bound_at,verified_at,source,guid FROM characters WHERE discord_id=?2").bind(s.accounts[1].id,ID).run();if(caseId==='duplicate-own')await s.writer.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)SELECT 'duplicate own current guid','Duplicate Own Current Guid',discord_id,'left',bound_at,verified_at,source,guid FROM characters WHERE discord_id=?1").bind(ID).run();if(caseId==='empty-binding')await s.writer.prepare("UPDATE characters SET guid='' WHERE discord_id=?1").bind(ID).run();return Response.json({fixtureOnly:true,currentStatus:status,caseId});}
 if(u.pathname.startsWith('/front/')){
  const params=new URLSearchParams(u.search);params.delete('case');const target=BASE+u.pathname.slice('/front'.length)+(params.size?'?'+params:''),forwardHeaders=new Headers(request.headers);if(request.method==='POST'&&forwardHeaders.get('X-Fixture-Origin')===BASE)forwardHeaders.set('Origin',BASE);forwardHeaders.delete('X-Fixture-Origin');const original=new Request(target,{method:request.method,headers:forwardHeaders,...(!['GET','HEAD'].includes(request.method)?{body:request.body}:{})}),start=s.wires.length,began=Date.now(),jobs=[];
  const response=await app.fetch(original,s.env,{waitUntil(p){jobs.push(Promise.resolve(p));}});for(const p of jobs)await p;
  const copy=(target===BASE+'/privacy/access/export'&&request.method==='POST')||(target===BASE+'/api/me/export'&&request.method==='GET'),own=copy?await response.clone().json().catch(()=>null):null;
  const observation={target,method:request.method,status:response.status,elapsedMilliseconds:Date.now()-began,wireStart:start,wireEnd:s.wires.length,physicalStatements:s.wires.slice(start).reduce((n,w)=>n+packets(w.requestBody).length,0),nonemptyCategories:copy?nonempty(own):null};
  s.requests.push(observation);if(copy){s.copyWires=s.wires.slice(start);s.copyObservation={...observation,authority:own?.identity?.authority,ownSubject:own?.identity?.discordId===ID,ownApplication:own?.site?.application!==null,verificationKnown:own?.verification?.known};}
  return response;
 }
 if(u.pathname==='/inspect')return Response.json({actualLocalWorkerdD1:true,clockOverride:false,handlerOverride:false,issuerOverride:false,originalWireObserver:true,accounts:1000,rosterRows:1000,sourceFacts:s.sourceFacts,requests:s.requests,copy:s.copyObservation,wires:s.copyWires});
 return new Response(null,{status:404});
}};

export default identifyFixture280;

import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH='a'.repeat(32),ID='300000000000000003',OTHER='300000000000000004',BOT='300000000000000099',GUILD='236932545793490944';
const BASE='https://guild.example',LAYOUT='recorded-live-pre-seal-20261017';
let saved=null;
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
const packets=body=>{const p=JSON.parse(body);return Array.isArray(p)?p:[p];};

async function setup(db){
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
  db.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 1,lower(json_extract(value,'$.name')),json_extract(value,'$.name'),json_extract(value,'$.guid'),'Member',8,60 FROM json_each(?1)").bind(raw),
  db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?1,'member',?2,'submitted',?3,?3)").bind(ID,JSON.stringify({about:'Synthetic private own application',references:[]}),now),
  db.prepare("INSERT INTO audit(ts,actor,action,subject,details)SELECT ?2,json_extract(value,'$.id'),'synthetic.account_action',json_extract(value,'$.id'),'{}' FROM json_each(?1)").bind(raw,now),
 ]);
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
 return {db,env,wires,requests:[],copyWires:[],accounts,writer:createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH)};
}
function nonempty(value,path='',out=[]){
 if(Array.isArray(value)){if(value.length)out.push({path,count:value.length});return out;}
 if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))nonempty(v,path?path+'.'+k:k,out);
 return out;
}
export const identifyFixture280={async fetch(request,bindings,ctx){
 const u=new URL(request.url);
 if(u.pathname==='/setup'){if(saved)return new Response(null,{status:409});saved=await setup(bindings.DB);return Response.json({accounts:1000,rosterRows:1000,ownApplication:true,ownAction:true,actualLocalWorkerdD1:true});}
 if(!saved)return new Response(null,{status:409});const s=saved;
 if(u.pathname.startsWith('/front/')){
  const target=BASE+u.pathname.slice('/front'.length)+u.search,original=new Request(target,request),start=s.wires.length,began=Date.now(),jobs=[];
  const response=await app.fetch(original,s.env,{waitUntil(p){jobs.push(Promise.resolve(p));}});for(const p of jobs)await p;
  const copy=target===BASE+'/privacy/access/export'&&request.method==='POST',own=copy?await response.clone().json().catch(()=>null):null;
  const observation={target,method:request.method,status:response.status,elapsedMilliseconds:Date.now()-began,wireStart:start,wireEnd:s.wires.length,physicalStatements:s.wires.slice(start).reduce((n,w)=>n+packets(w.requestBody).length,0),nonemptyCategories:copy?nonempty(own):null};
  s.requests.push(observation);if(copy){s.copyWires=s.wires.slice(start);s.copyObservation={...observation,authority:own?.identity?.authority,ownSubject:own?.identity?.discordId===ID,ownApplication:own?.site?.application!==null,verificationKnown:own?.verification?.known};}
  return response;
 }
 if(u.pathname==='/inspect')return Response.json({actualLocalWorkerdD1:true,clockOverride:false,handlerOverride:false,issuerOverride:false,originalWireObserver:true,accounts:1000,rosterRows:1000,requests:s.requests,copy:s.copyObservation,wires:s.copyWires});
 if(u.pathname==='/plans'){
  if(!s.copyWires.length)return new Response(null,{status:409});const plans=[];
  for(const [trip,w]of s.copyWires.entries())for(const [index,p]of packets(w.requestBody).entries()){
   const began=Date.now();let out=null,error=null;try{out=await s.db.prepare('EXPLAIN QUERY PLAN '+p.sql).bind(...(p.params??[])).all();}catch(e){error=String(e?.message??e);}
   plans.push({trip,index,sql:p.sql,params:p.params??[],leadingCTE:/^\s*WITH\b/i.test(p.sql),elapsedMilliseconds:Date.now()-began,plan:out?.results??null,meta:out?.meta??null,error});
  }
  return Response.json({actualLocalWorkerdD1:true,fixture:{accounts:1000,rosterRows:1000,ownApplication:true,ownAudit:true},plans});
 }
 return new Response(null,{status:404});
}};

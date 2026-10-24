// Focused local Workerd evidence. The positive case passes the untouched real
// controller/context to the actual exported callback. Negative observer cases
// are explicitly source-seam tests, not claimed platform callbacks.
import app, {runSourceEpoch2ScheduledBody, originalScheduledCallbackPhysicalCostObservation} from '../src/index.ts';
import {originalServingNativeCostLabel} from '../src/privacy-global-serving-origin.ts';
import * as catalogue from '../src/privacy-write-admission-catalogue.ts';
import {ADMISSION_SCHEDULED_BUDGET} from '../src/scheduled-budget.ts';
const GUILD='300000000000000001',APP='1550176895671341076',TARGET='300000000000000073',MEMBER='300000000000000081',COSMETIC='300000000000000101',BOTROLE='300000000000000091',EPOCH='a'.repeat(32);
const CASES=['actual','omitted','throwing','getter'];
let current=null;
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function originalMethod(o,key){for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('fixture_original_method');return {receiver:o,value:d.value};}}throw Error('fixture_original_method_missing');}
function instrument(s,db){
 const slot=Object.getOwnPropertyDescriptor(db,'fetcher');if(!slot||!Object.hasOwn(slot,'value')||!slot.value)throw Error('fixture_native_sdk_fetcher');
 const fetcher=slot.value,original=originalMethod(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,value:async function(input,init){
  if(this!==fetcher||typeof init?.body!=='string')throw Error('fixture_native_request');
  const label=s.measuring?originalServingNativeCostLabel():null;
  if(s.measuring&&s.key==='actual'&&!label)throw Error('fixture_unattributed_callback_native');
  const record=s.measuring?{ordinal:s.wires.length+1,label,requestBody:init.body,responseBody:null,status:null,returned:false}:null;
  if(record)s.wires.push(record);
  const response=await Reflect.apply(original.value,original.receiver,[input,init]);
  if(record){record.responseBody=await response.clone().text();record.status=response.status;record.returned=true;}
  return response;
 },writable:false});
}
async function seed(s,db){
 const c=JSON.parse(catalogue.ADMISSION_EXPECTED_JSON),pending=[];
 const add=(sql,...params)=>pending.push(params.length?db.prepare(sql).bind(...params):db.prepare(sql));
 const flush=async()=>{while(pending.length)await db.batch(pending.splice(0,50));};
 for(const row of c.tables)add(row.sql);for(const row of c.indexes)add(row.sql);add(catalogue.ADMISSION_CONTROL_DDL);await flush();
 const T=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER)AS t").first()).t;
 add("INSERT INTO privacy_write_admission VALUES(1,?,0,'','',0,0,?,'serving')",catalogue.ADMISSION_PROTOCOL,EPOCH);
 add("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)");
 add("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)",T);await flush();
 // An explicitly synthetic acknowledged original grant. No payment or actual
 // Discord grant is represented by this fixture custody row.
 add("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at,checked_at)VALUES(?,?,'treasury_cosmetic',?,?,1,'settled','treasury_effect_acknowledged',1,?,?,?,?)",'1'.repeat(32),TARGET,GUILD,COSMETIC,'2'.repeat(32),T-86400,T-1,T-86400);await flush();
 // Finish installing the exact immutable epoch triggers after synthetic seed
 // data, before any tested callback or source seam is allowed to execute.
 for(const row of c.triggers)add(row.sql);await flush();
 s.schemaBefore=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results;
 return {DB:db,DISCORD_BOT_TOKEN:'mock-only',DISCORD_APP_ID:APP,GUILD_ID:GUILD,ROLE_GUILD_MEMBER:MEMBER,SITE_GUILD_ID:GUILD,SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',COOKIE_SECRET:'local-workerd-only-cookie-secret-0123456789',VERIFY_SECRET:'local-workerd-only-verify-secret-0123456789',DISCORD_CLIENT_SECRET:'local-only',COMMUNITY_FEATURES:'departures,contributions',CONTRIBUTIONS_MODE:'ledger',CONTRIBUTIONS_SCOPE:'olympus',CONTRIBUTIONS_RETENTION_DAYS:'90',LAUNCH_AT:String(T-86400),ROLE_CALL_BUDGET:'50',ROLE_SWEEP_PER_RUN:'1',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_NATIVE_ERASURE_ENABLED:'true',CF_VERSION_METADATA:Object.freeze({id:'11111111-2222-3333-4444-555555555555',tag:'local-focused-treasury',timestamp:new Date().toISOString()}),TREASURY_COSMETIC_ENABLED:'false'};
}
async function inspect(){
 const s=current;if(!s||!s.started)throw Error('fixture_not_started');
 const cost=s.key==='actual'?originalScheduledCallbackPhysicalCostObservation(s.controller,s.ctx):null;
 if(cost&&!cost.allScopesReturned)return reply({pending:true,cost});
 s.measuring=false;
 const audit=(await s.db.prepare("SELECT action,details FROM audit WHERE action IN('role.sweep','role.sweep_failed') ORDER BY id").all()).results;
 const settlements=(await s.db.prepare("SELECT purpose,state,reason,attempts FROM role_settlements ORDER BY purpose").all()).results;
 const schemaAfter=(await s.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results;
 return reply({pending:false,key:s.key,actualPlatformCallback:s.key==='actual',sourceSeamOnly:s.key!=='actual',cost,wires:s.wires,audit,settlements,seamErrors:s.seamErrors??[],caps:ADMISSION_SCHEDULED_BUDGET,schemaUnchanged:JSON.stringify(s.schemaBefore)===JSON.stringify(schemaAfter),clockOverride:false,sourceLoader:false,handlerOverride:false,privateBindingsAbsent:!('PRIVACY_RECOVERY_FLOOR'in s.env)});
}
export default {
 async fetch(request,bindings){
  const path=new URL(request.url).pathname;
  if(path==='/prepare'&&request.method==='POST'){
   const {key}=await request.json();if(!CASES.includes(key))return reply({refused:true},400);
   const s={key,db:bindings['DB_'+key],wires:[],measuring:false,started:false};current=s;instrument(s,s.db);s.env=await seed(s,s.db);return reply({prepared:true,key});
  }
  if(path==='/source-seam'&&request.method==='POST'){
   const s=current;if(!s||s.key==='actual'||s.started)throw Error('fixture_seam_case');s.started=true;s.measuring=true;
   const pending=[],ctx={waitUntil(p){pending.push(Promise.resolve(p));}};
   const observer=s.key==='omitted'?undefined:s.key==='throwing'?()=>{throw Error('fixture_observer_refusal');}:()=>Object.freeze({get state(){throw Error('fixture_observer_getter');},statements:0,pendingGroups:0,failedGroups:0});
   await runSourceEpoch2ScheduledBody(s.env,ctx,undefined,undefined,observer);
   s.seamErrors=(await Promise.allSettled(pending)).filter(r=>r.status==='rejected').map(r=>String(r.reason));
   return await inspect();
  }
  if(path==='/inspect')return await inspect();
  return reply({refused:true},404);
 },
 async scheduled(controller,_bindings,ctx){
  const s=current;if(!s||s.key!=='actual'||s.started)throw Error('fixture_original_callback_case');s.started=true;s.controller=controller;s.ctx=ctx;s.measuring=true;
  await app.scheduled(controller,s.env,ctx);
 }
};

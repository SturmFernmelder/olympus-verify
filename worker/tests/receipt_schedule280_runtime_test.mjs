// Actual platform scheduled pair, actual index and Native D1. No clock or job replacement.
import app,{originalScheduledCallbackPhysicalCostObservation} from '../src/index.ts';
import {originalServingNativeCostLabel} from '../src/privacy-global-serving-origin.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
const EPOCH='a'.repeat(32);
let state=null;
const method=(o,k)=>{for(let p=o;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,k);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method');};
const packets=s=>{const x=JSON.parse(s);return Array.isArray(x)?x:[x];};
async function setup(request,bindings){
 if(state)throw Error('fixture already prepared');
 const url=new URL(request.url),layout=url.searchParams.get('layout')==='recorded-live-pre-seal-20261017'?'recorded-live-pre-seal-20261017':'canonical',enabled=url.searchParams.get('enabled')==='true',lose=url.searchParams.get('lose')==='true',db=bindings.DB;
 const catalogue=layout==='canonical'?JSON.parse(ADMISSION_EXPECTED_JSON):JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
 const batch=async rows=>{while(rows.length)await db.batch(rows.splice(0,40));};
 await batch([...catalogue.tables,...catalogue.indexes].map(x=>db.prepare(x.sql)));await db.prepare(catalogue.slotSQL).run();
 const at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) at").first()).at;
 await db.batch([db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,?1,?2,'serving',0,'','',0,0)").bind(ADMISSION_PROTOCOL,EPOCH),db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(at)]);
 const rows=Array.from({length:101},(_,i)=>({sourceId:'expired-'+i,source:'mail',observedAt:at-2592001,retainUntil:at-1}));
 await db.prepare("INSERT INTO audit(ts,actor,action,subject,details)SELECT ?2,'watcher','treasury.receipt242','intake242:'||json_extract(value,'$.sourceId'),value FROM json_each(?1)").bind(JSON.stringify(rows),at-2592001).run();
 const fresh=JSON.stringify({sourceId:'fresh',source:'mail',observedAt:at,retainUntil:at+2592000,payloadHash:'synthetic-original-hash'});
 await db.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,'watcher','treasury.receipt242','intake242:fresh',?2)").bind(at,fresh).run();
 await batch(catalogue.triggers.map(x=>db.prepare(x.sql)));
 state={layout,enabled,lose,lost:false,wires:[],at,fresh,controller:null,ctx:null,started:null,finished:null,env:{DB:db,PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:layout,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:String(enabled),PRIVACY_ACCESS_ENABLED:'false',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',SITE_GUILD_ID:'800000000000000001',GUILD_ID:'800000000000000001',DISCORD_APP_ID:'800000000000000002',DISCORD_BOT_TOKEN:'synthetic-bot',ROLE_GUILD_MEMBER:'800000000000000010',VERIFY_SECRET:'synthetic-schedule-verify',COOKIE_SECRET:'synthetic-schedule-cookie',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-schedule',timestamp:'2026-11-12T00:00:00Z'}}};
 const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');
 Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){const label=originalServingNativeCostLabel(),items=packets(init.body);const wire={label,statements:items.length,sql:items.map(x=>x.sql),lost:false};state.wires.push(wire);const response=await Reflect.apply(send,fetcher,[input,init]);wire.status=response.status;if(lose&&!state.lost&&label?.job==='sweepServingRetention'){state.lost=true;wire.lost=true;throw Error('synthetic retention reply lost after original delegate');}return response;}});
 return {layout,enabled,lose,at};
}
async function observe(bindings){
 if(!state?.controller)throw Error('missing actual callback');
 const cost=originalScheduledCallbackPhysicalCostObservation(state.controller,state.ctx);
 if(!cost.allScopesReturned)return {pending:true,cost};
 const db=bindings.DB,remaining=(await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='treasury.receipt242' AND subject LIKE 'intake242:expired-%'").first()).n,fresh=await db.prepare("SELECT details FROM audit WHERE subject='intake242:fresh'").first(),control=await db.prepare('SELECT active,nonce,purpose,epoch,mode FROM privacy_write_admission').first();
 const phase=Math.floor(state.started/900000)%2===0?'general':'beta',samePhase=Math.floor(state.started/900000)===Math.floor(state.finished/900000),row=cost.jobs.find(x=>x.job==='sweepServingRetention'),wires=state.wires.filter(x=>x.label?.job==='sweepServingRetention'),purges=wires.filter(x=>x.sql.some(s=>s.startsWith('DELETE FROM audit WHERE id IN(SELECT id FROM audit WHERE action=\'treasury.receipt242\'')));
 const expected=state.lose||state.enabled&&phase==='general'?101:1;
 const cases=[
  {name:'genuine callback stays in one original phase',pass:samePhase},
  {name:'quiet receipt cleanup uses spare or defers saturated/unknown original slice',pass:remaining===expected,observed:{remaining,expected}},
  {name:'fresh original receipt remains byte-identical',pass:fresh?.details===state.fresh},
  {name:'retention stays inside unchanged25 physical statements',pass:row&&row.statements<=25&&row.pendingGroups===0},
  {name:'independent Native wire counts agree with original job observation',pass:row&&row.statements===wires.reduce((n,w)=>n+w.statements,0)},
  {name:'purge is one5SQL Native packet only on known spare',pass:expected===1?purges.length===1&&purges[0].statements===5:purges.length===0},
  {name:'whole callback remains within unchanged700 statement reserve',pass:cost.statements<=700&&cost.pendingGroups===0},
  {name:'Native admission returns neutral original epoch',pass:control.active===0&&control.nonce===''&&control.purpose===''&&control.epoch===EPOCH&&control.mode==='serving'},
  {name:'lost original retention reply stays failed and never starts purge',pass:!state.lose||state.lost&&row.failedGroups===1&&purges.length===0}
 ];
 return {scope:'Bounded empty-other-jobs actual default scheduled/Native component, not complete production-floor or maximal workload qualification',pending:false,layout:state.layout,enabled:state.enabled,lose:state.lose,phase,started:state.started,finished:state.finished,cost,retentionWires:wires,cases,checks:cases.length,ok:cases.every(x=>x.pass)};
}
export default {
 async fetch(request,bindings){const path=new URL(request.url).pathname;if(path==='/prepare')return Response.json(await setup(request,bindings));if(path==='/observe')return Response.json(await observe(bindings));return new Response(null,{status:404});},
 async scheduled(controller,_bindings,ctx){if(!state||state.controller)throw Error('not a fresh fixture');state.controller=controller;state.ctx=ctx;state.started=Date.now();await app.scheduled(controller,state.env,ctx);state.finished=Date.now();}
};

'use strict';
// A bounded affected leaf. Static esbuild bundle of actual current source; one
// real local Workerd child, mocked Discord only, exact SDK bytes independently
// reconcile source-private physical counters. No clock/handler/source override.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),out=process.env.TREASURY196_WORKERD_RESULT_DIR;
if(!out||!path.isAbsolute(out)||fs.existsSync(out))throw Error('fresh_absolute_result_dir_required');
fs.mkdirSync(out,{recursive:true});const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const {buildSync}=require('esbuild');const bundle=path.join(out,'fixture.mjs'),metafile=buildSync({entryPoints:[path.join(__dirname,'treasury_expiry196_workerd_fixture.mjs')],absWorkingDir:root,outfile:bundle,bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],metafile:true,write:true,logLevel:'silent'}).metafile;
write('bundle-metafile.json',metafile);const inputs=Object.keys(metafile.inputs).map(name=>{const file=path.resolve(root,name),bytes=fs.readFileSync(file);return{path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)};});write('source-inputs.json',inputs);
const verifyInputs=()=>{for(const row of inputs){const bytes=fs.readFileSync(path.join(root,row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}};
const children=[],spawn=cp.spawn;cp.spawn=function(command,args,options){const child=Reflect.apply(spawn,this,[command,args,options]),record={pid:child.pid,command,closed:false,code:null,signal:null};if(!/workerd(?:\.exe)?$/i.test(command))throw Error('unreviewed_child');record.promise=new Promise(resolve=>child.once('close',(code,signal)=>{Object.assign(record,{closed:true,code,signal});resolve();}));children.push(record);return child;};
const {Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const GUILD='300000000000000001',APP='1550176895671341076',TARGET='300000000000000073',MEMBER='300000000000000081',COSMETIC='300000000000000101',BOTROLE='300000000000000091';
let currentCase=null,held=false,unexpected=0,assertions=0;const provider=[],cases=[],result={schema:'treasury-expiry196-local-workerd-v1',startedAt:new Date().toISOString(),sourceLoader:false,handlerOverride:false,clockOverride:false,providerQualified:false,privateGlobalRecoveryQualified:false,allCopyQualified:false,complete:false};
const check=(name,condition)=>{assert.equal(condition,true,name);assertions++;console.log('PASS '+name);};
const response=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function controlledProvider(request){
 const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,'');if(u.origin!=='https://discord.com'){unexpected++;throw Error('unexpected_outbound');}
 const row={case:currentCase,method:request.method,path:p};provider.push(row);
 if(request.method==='DELETE'&&p===`/guilds/${GUILD}/members/${TARGET}/roles/${COSMETIC}`){held=false;return response(null,204);}
 if(request.method!=='GET'){unexpected++;throw Error('unexpected_provider_effect');}
 if(p==='/users/@me')return response({id:APP,bot:true});
 if(p===`/guilds/${GUILD}/roles`)return response([{id:GUILD,name:'@everyone',position:0,permissions:'0',managed:false},{id:MEMBER,name:'Guild Member',position:1,permissions:'0',managed:false},{id:COSMETIC,name:'Tithe Payer',position:2,permissions:'0',managed:false,hoist:false,mentionable:false},{id:BOTROLE,name:'Fixture Bot',position:100,permissions:'268435456',managed:true}]);
 if(p===`/guilds/${GUILD}/channels`)return response([{id:'300000000000000201',guild_id:GUILD,type:4,permission_overwrites:[]}]);
 if(p===`/guilds/${GUILD}/members/${APP}`)return response({user:{id:APP,bot:true},roles:[BOTROLE]});
 if(p===`/guilds/${GUILD}/members/${TARGET}`)return response({user:{id:TARGET},roles:[MEMBER,...(held?[COSMETIC]:[])],pending:false});
 if(p===`/guilds/${GUILD}`)return response({id:GUILD,owner_id:'300000000000000099'});
 unexpected++;throw Error('unexpected_provider_read '+p);
}
const bounded=(p,label,ms=30000)=>{let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'_timeout')),ms);})]).finally(()=>clearTimeout(timer));};
const nativeItems=raw=>{const packet=JSON.parse(raw);return Array.isArray(packet)?packet:[packet];};
let mf;
(async()=>{try{
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:fs.readFileSync(bundle,'utf8'),modules:true,name:'treasury-expiry196',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),d1Databases:Object.fromEntries(['actual','omitted','throwing','getter'].map(k=>['DB_'+k,'treasury196-'+k])),outboundService:controlledProvider}));
 await bounded(mf.ready,'workerd_start');const worker=await mf.getWorker();
 const endpoint=async(p,body)=>{const r=await bounded(mf.dispatchFetch('http://fixture.invalid'+p,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined),'fixture_request');const raw=await r.text();fs.writeFileSync(path.join(out,currentCase+'-'+p.replaceAll('/','_')+'.body.txt'),raw,{flag:'wx'});if(r.status!==200)console.error('FIXTURE_HTTP_FAILURE '+r.status+' '+raw);const value=JSON.parse(raw);write(currentCase+'-'+p.replaceAll('/','_')+'.json',value);assert.equal(r.status,200);return value;};
 for(const key of ['actual','omitted','throwing','getter']){
  currentCase=key;held=true;await endpoint('/prepare',{key});let observed;
  if(key==='actual'){
   const callback=await bounded(worker.scheduled({cron:'*/15 * * * *'}),'actual_callback');check('actual platform callback completes with original noRetry',callback.outcome==='ok'&&callback.noRetry===true);
   for(let i=0;i<50;i++){const r=await mf.dispatchFetch('http://fixture.invalid/inspect');observed=await r.json();if(!observed.pending)break;await new Promise(resolve=>setTimeout(resolve,50));}write('actual-final-observation.json',observed);
  }else observed=await endpoint('/source-seam',{run:true});
  assert.equal(observed.pending,false);cases.push(observed);check(key+' preserves all original schema objects',observed.schemaUnchanged===true);check(key+' original member sweep runs first',observed.audit.some(x=>x.action==='role.sweep')&&!observed.audit.some(x=>x.action==='role.sweep_failed'));
  const calls=provider.filter(p=>p.case===key),deletes=calls.filter(p=>p.method==='DELETE');
  if(key!=='actual'){check(key+' invalid or missing observer prevents cleanup',deletes.length===0&&held===true);continue;}
  const c=observed.cost;check('only actual callback has genuine original cost observation',observed.actualPlatformCallback===true&&c.scope==='original_scheduled_callback_physical_cost'&&c.allScopesReturned&&c.pendingGroups===0&&c.failedGroups===0);
  const caps=observed.caps;check('same closed24 jobs retain total700 envelope',c.jobs.length===24&&caps.length===24&&caps.reduce((a,b)=>a+b.worst,0)===700&&c.statements<=700);
  for(const row of c.jobs){const cap=caps.find(x=>x.job===row.job);assert.ok(cap);assert.ok(row.statements<=cap.worst,row.job+' envelope');const wire=observed.wires.filter(w=>w.label.job===row.job);assert.equal(wire.length,row.trips);assert.equal(wire.reduce((a,w)=>a+nativeItems(w.requestBody).length,0),row.statements);assert.ok(wire.every(w=>w.returned&&w.status===200&&nativeItems(w.responseBody).every(r=>r.success===true)));}
  check('original SDK request bytes independently reconcile every physical statement',true);
  const role=c.jobs.find(x=>x.job==='sweepMemberRoles'),wire=observed.wires.filter(w=>w.label.job==='sweepMemberRoles'),flat=wire.flatMap(w=>nativeItems(w.requestBody)),auditIndex=flat.findIndex(w=>w.sql.includes('INSERT INTO audit')&&w.params.includes('role.sweep')),expiryGroup=wire.findIndex(w=>nativeItems(w.requestBody).some(s=>s.sql.includes("r.purpose='treasury_cosmetic'"))),expiryIndex=wire.slice(0,expiryGroup).reduce((n,w)=>n+nativeItems(w.requestBody).length,0);
  check('membership sweep completes before first expiry selection',auditIndex>=0&&expiryGroup>=0&&expiryIndex>auditIndex);
  check('one acknowledged expiry uses at most8HTTP and no grant',calls.length===8&&deletes.length===1&&!calls.some(p=>p.method==='PUT')&&!held);
  const expiry=flat.length-expiryIndex;check('actual Native expiry remains within reserved64 and role120',expiry<=64&&role.statements<=120);console.log('ACTUAL_TREASURY_EXPIRY_COST '+JSON.stringify({roleStatements:role.statements,expiryStatements:expiry,providerCalls:calls.length,total:c.statements,jobs:c.jobs.length}));
  check('expiry cleanup closes exact recorded custody with grants disabled',observed.settlements.some(r=>r.purpose==='treasury_cosmetic_expiry'&&r.state==='settled'&&r.reason==='season_expiry_delete_acknowledged'));
 }
 verifyInputs();check('all measured bundle source inputs unchanged',true);check('zero unexpected outbound requests',unexpected===0);result.complete=true;
 }finally{
  if(mf)await bounded(mf.dispose(),'workerd_dispose',10000);for(const child of children)await bounded(child.promise,'workerd_close',10000);
  Object.assign(result,{finishedAt:new Date().toISOString(),assertions,unexpected,provider,cases:cases.map(c=>({key:c.key,actualPlatformCallback:c.actualPlatformCallback,cost:c.cost})),children:children.map(({promise,...c})=>c),bundleSHA256:sha(fs.readFileSync(bundle)),sourceInputCount:inputs.length});result.complete=result.complete&&children.length===1&&children.every(c=>c.closed);write('result.json',result);cp.spawn=spawn;
 }
 console.log(JSON.stringify(result));if(!result.complete)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

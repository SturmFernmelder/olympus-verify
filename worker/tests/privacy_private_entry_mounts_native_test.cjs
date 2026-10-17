// Genuine private entry -> original handler -> Native independent DO. No production opener or serving bootstrap.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto'),hooks=require('node:async_hooks'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),T=1800000000,CE='b'.repeat(32),WE='a'.repeat(32),NEXT='d'.repeat(32),TREE='c'.repeat(40),CONTROL_TREE='e'.repeat(40);
const SERVING_VERSION='11111111-2222-3333-4444-555555555555',INIT_VERSION='22222222-3333-4444-5555-666666666666',CONTROL_VERSION='33333333-4444-5555-6666-777777777777';
const AUTH='synthetic-private-mount-control-auth',INITIALIZER='synthetic-distinct-private-initializer',OPERATOR='synthetic-distinct-private-operator',SERVING='synthetic-distinct-private-serving';
let clock=T,serial=0,checks=0,providerAttempts=0;
class FixedDate extends Date{static now(){return clock*1000;}}
function loader(){
 const context=vm.createContext({crypto:webcrypto,Date:FixedDate,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Request,Response,Headers,URL,URLSearchParams,AbortSignal,AbortController,ReadableStream,ReadableStreamDefaultReader,console,setTimeout,clearTimeout,btoa,atob,fetch(){providerAttempts++;throw Error('private-mount-provider-forbidden');}}),cache=new Map();
 function load(name){
  if(cache.has(name))return cache.get(name).exports;
  const module={exports:{}};cache.set(name,module);
  const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),body=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext('(function(require,module,exports){'+body+'\n})',context,{filename:name})(p=>{if(p==='node:async_hooks')return hooks;if(!p.startsWith('./'))throw Error('private-mount-external-import-forbidden');return load(p.slice(2));},module,module.exports);
  return module.exports;
 }
 return load;
}
// Separate module caches model three services. Each natural entry graph is loaded first, without priming index.
const floorLoad=loader(),floorEntry=floorLoad('privacy-private-floor-entry'),floor=floorLoad('privacy-recovery-floor');
const initializerLoad=loader(),initializerEntry=initializerLoad('privacy-private-initializer-entry'),initializer=initializerLoad('privacy-production-initialization');
const operatorLoad=loader(),operatorEntry=operatorLoad('privacy-private-operator-entry');
const id=()=> (++serial).toString(16).padStart(32,'0'),canon=x=>JSON.parse(JSON.stringify(x));
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
function setup(){
 clock=T;const db=new DatabaseSync(':memory:',{defensive:true}),calls=[];let d1Calls=0,hook=null;
 db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 const storage={sql:{exec(sql,...values){const statement=db.prepare(sql),rows=statement.columns().length?statement.all(...values):(statement.run(...values),[]);return{toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
 assert.equal(floorEntry.PrivacyRecoveryFloor,floor.PrivacyRecoveryFloor,'original class re-export identity');
 const object=new floorEntry.PrivacyRecoveryFloor({storage},{PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,PRIVACY_SERVING_GATE_SECRET:SERVING});
 const stub={async fetch(request){const pathname=new URL(request.url).pathname;calls.push(pathname);const next=()=>object.fetch(request);return hook?hook(pathname,next):next();}},rid=Object.freeze({scope:'same-original-private-floor-namespace'}),namespace={idFromName(name){assert.equal(name,floor.RECOVERY_FLOOR_NAME);return rid;},get(value){assert.equal(value,rid);return stub;}};
 const initMetadata={id:INIT_VERSION,tag:'private-initializer-native',timestamp:'2026-10-13T00:00:00Z'},controlMetadata={id:CONTROL_VERSION,tag:'private-operator-native',timestamp:'2026-10-13T00:00:00Z'};
 const initEnv={PRIVACY_RECOVERY_FLOOR:namespace,PRIVACY_PRODUCTION_INITIALIZATION_ENABLED:'true',PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET:AUTH,PRIVACY_RECOVERY_INITIALIZER_SECRET:INITIALIZER,CF_VERSION_METADATA:initMetadata,PRIVACY_CONTROL_SOURCE_TREE:CONTROL_TREE};
 const env={DB:{prepare(){d1Calls++;throw Error('mount-must-not-materialize-D1');},batch(){d1Calls++;throw Error('mount-must-not-dispatch-D1');}},CF_VERSION_METADATA:controlMetadata,PRIVACY_PRODUCTION_CONTROL_ENABLED:'true',PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET:AUTH,PRIVACY_CONTROL_SOURCE_TREE:CONTROL_TREE,PRIVACY_SERVING_SOURCE_TREE:TREE,PRIVACY_SERVING_DEPLOYMENT_VERSION:SERVING_VERSION,PRIVACY_SERVING_DATABASE_ID:floor.RECOVERY_FLOOR_TARGET.database,PRIVACY_RECOVERY_FLOOR:namespace,PRIVACY_RECOVERY_OPERATOR_SECRET:OPERATOR,PRIVACY_CREDENTIAL_EPOCH:CE,PRIVACY_WRITE_EPOCH:WE};
 const ctx={waitUntil(){throw Error('private-control-no-deferred-work');}};
 return{db,object,calls,namespace,initEnv,env,ctx,initMetadata,controlMetadata,d1Calls:()=>d1Calls,hook:value=>hook=value,close:()=>db.close()};
}
async function original(f){
 const value={operationId:id(),nonce:id(),requestDigest:'f'.repeat(64),createdAt:T,expiresAt:T+300,credentialEpoch:CE,writeEpoch:WE,sourceTree:TREE,deploymentVersion:SERVING_VERSION,nextWriteEpoch:NEXT},raw=JSON.stringify(value),proof=await initializer.privateInitializationMac(AUTH,CONTROL_TREE,JSON.stringify([INIT_VERSION,f.initMetadata.tag,f.initMetadata.timestamp]),raw);
 return{value,raw,request:()=>new Request('https://privacy-production-control.invalid/v1/control/initialize-closed',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':proof},body:raw})};
}
async function controlRequest(f,o,pathname){
 const value={operationId:o.value.operationId,nonce:o.value.nonce,createdAt:T,expiresAt:T+300,nextWriteEpoch:NEXT,controlVersion:CONTROL_VERSION,servingVersion:SERVING_VERSION,sourceTree:TREE,credentialEpoch:CE,writeEpoch:WE},raw=JSON.stringify(value),key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(AUTH),{name:'HMAC',hash:'SHA-256'},false,['sign']),bytes=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['olympus-private-production-control-original-v1','POST',pathname,CONTROL_TREE,JSON.stringify([CONTROL_VERSION,f.controlMetadata.tag,f.controlMetadata.timestamp]),raw])));
 return new Request('https://privacy-production-control.invalid'+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':Buffer.from(bytes).toString('hex')},body:raw});
}

const fixtureProfile=require('./privacy_cookie_profile_migration_native_test.cjs'),epochInstaller=require('../scripts/install-rejection-provenance-epoch.cjs');
const originalControl=operatorLoad('privacy-production-control-origin');
const privateAdapter=operatorLoad('privacy-private-control-adapter');
const installPlanCases=[];
function nativePlanBusiness(layout,sourceKind){
 const f=fixtureProfile.fixture(layout,sourceKind),trace=[];
 if(sourceKind!=='public-predecessor')epochInstaller.closeFixtureEpochForWholeMigration(f.db,layout,sourceKind,WE);
 f.db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 function statement(sql,values=[]){return{statement:sql,params:values,bind(...next){return statement(sql,next);},async first(column){trace.push({sql,parameters:values.length});const row=DatabaseSync.prototype.prepare.call(f.db,sql).get(...values)??null;return column===undefined?row:row?.[column]??null;},async all(){throw Error('install-plan-all-not-selected');},async run(){throw Error('install-plan-write-not-selected');}};}
 const binding={prepare(sql){return statement(sql);},async batch(){throw Error('install-plan-batch-not-selected');}};
 return{...f,binding,trace};
}
async function originalOwnedCut(f,o){
 const response=await initializerEntry.default.fetch(o.request(),f.initEnv);eq('plan setup actual mounted CLOSED initialization',response.status,200);
 return originalControl.captureOriginalPrivateControlCut(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx);
}
async function installPlanNativeCases(){
 for(const [layout,sourceKind]of [['canonical','marker'],['recorded-live-20261010','marker'],['recorded-live-20261010','public-predecessor']]){
  const f=setup(),business=nativePlanBusiness(layout,sourceKind);try{
   f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;f.env.PRIVACY_INSTALL_SOURCE_KIND=sourceKind;
   const o=await original(f),cut=await originalOwnedCut(f,o),plan=await originalControl.captureOriginalPrivateInstallPlan(cut),facts=originalControl.originalPrivateInstallPlanFacts(plan);
   eq(layout+'/'+sourceKind+' actual original full-profile read only',business.trace.length,1);
   eq(layout+'/'+sourceKind+' opaque plan exports no data or Native',Reflect.ownKeys(plan),[]);
   eq(layout+'/'+sourceKind+' exact cut/layout/source/epoch and fixed300 facts',[facts.operationId,facts.layout,facts.sourceKind,facts.originalEpoch,facts.nextEpoch,facts.originalCreatedAt,facts.originalExpiresAt],[o.value.operationId,layout,sourceKind,sourceKind==='public-predecessor'?null:WE,NEXT,T,T+300]);
   eq(layout+'/'+sourceKind+' preparation never qualifies privileged execution',[facts.nativeProfileReadOnly,facts.externalDrainQualified,facts.productionExecutionAvailable,facts.readyToReopen],[true,false,false,false]);
   eq(layout+'/'+sourceKind+' public legacy mode stays explicit',facts.capturedProfileMode,sourceKind==='public-predecessor'?'legacy_control_without_mode':'closed');
   let held=false;try{originalControl.assertOriginalPrivateInstallPlan({...plan});}catch{held=true;}eq(layout+'/'+sourceKind+' copied plan has no authority',held,true);
   held=false;try{await originalControl.captureOriginalPrivateInstallPlan(cut);}catch{held=true;}eq(layout+'/'+sourceKind+' same-cut capture spent before second Native read',[held,business.trace.length],[true,1]);
   clock=T+300;held=false;try{originalControl.assertOriginalPrivateInstallPlan(plan);}catch{held=true;}eq(layout+'/'+sourceKind+' capture lease never renews original close300',[held,business.trace.length],[true,1]);
   eq(layout+'/'+sourceKind+' original D1 installation unchanged',business.db.prepare('SELECT protocol FROM privacy_write_admission').get().protocol,sourceKind==='public-predecessor'?'olympus-write-admission-experiment-1':'olympus-write-admission-epoch-2');
   installPlanCases.push({layout,sourceKind,originalProfileReads:business.trace.length,originalEpoch:facts.originalEpoch,originalCreatedAt:T,originalExpiresAt:T+300,nativeMigrationDispatched:false,externalDrainQualified:false,productionExecutionAvailable:false});
  }finally{business.db.close();f.close();}
 }
 {const f=setup(),business=nativePlanBusiness('canonical','marker');try{
  f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';let getters=0;Object.defineProperty(f.env,'PRIVACY_INSTALL_SOURCE_KIND',{get(){getters++;throw Error('plan config accessor forbidden');}});
  const o=await original(f),cut=await originalOwnedCut(f,o);let held=false;try{await originalControl.captureOriginalPrivateInstallPlan(cut);}catch{held=true;}
  eq('plan own config accessor refused before Native read getter0',[held,getters,business.trace.length],[true,0,0]);
 }finally{business.db.close();f.close();}}
}
// Additional actual Native stage, separate from the retained read-only B1 cases.
const installationCases=[];
const RAID_ALTERS=["ALTER TABLE \"community_event_signups\" ADD COLUMN remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1))","ALTER TABLE \"community_event_signups\" ADD COLUMN decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined'))","ALTER TABLE \"community_event_signups\" ADD COLUMN decided_by TEXT","ALTER TABLE \"community_event_signups\" ADD COLUMN decided_at INTEGER","ALTER TABLE \"community_event_signups\" ADD COLUMN decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0)","ALTER TABLE \"community_event_reminders\" ADD COLUMN mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))"];
function writablePlanBusiness(layout,sourceKind,owner,options={}){
 const f=fixtureProfile.fixture(layout,sourceKind),trace=[],groups=[],batchRecords=[];let batches=0;
 if(!options.mounted&&sourceKind!=='public-predecessor')epochInstaller.closeFixtureEpochForWholeMigration(f.db,layout,sourceKind,WE);
 f.db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 function statement(sql,values=[]){
  const exec=()=>{trace.push({sql,parameters:values.length});const p=DatabaseSync.prototype.prepare.call(f.db,sql);const rows=p.columns().length?p.all(...values):(p.run(...values),[]);return{success:true,results:rows,meta:{changes:f.db.prepare('SELECT changes() n').get().n}};};
  return{statement:sql,params:values,bind(...next){return statement(sql,next);},async first(column){const row=exec().results[0]??null;return column===undefined?row:row?.[column]??null;},async all(){return exec();},async run(){return exec();},exec};
 }
 const binding={prepare(sql){return statement(sql);},async batch(statements){
  // This is the source's one actual underlying batch; the independent reserve is already Native.
  const journal=owner.db.prepare("SELECT state,created_at,expires_at FROM recovery_journal WHERE purpose='reserve'").all();
  assert.deepEqual(journal.map(r=>[r.state,r.created_at,r.expires_at]),options.mounted&&batches===0?[]:[['reserved',T,T+300]],'same-original fence precedes reservation; migration follows durable reserve');
  batches++;groups.push(statements.length);batchRecords.push(statements.map(s=>Object.freeze({sql:s.statement,values:Object.freeze(s.params.slice())})));if(options.beforeBatch)options.beforeBatch();f.db.exec('BEGIN IMMEDIATE');let out;
  try{out=statements.map(s=>s.exec());f.db.exec('COMMIT');}catch(error){f.db.exec('ROLLBACK');throw error;}
  if(options.afterBatch)options.afterBatch();if(options.lostNativeACK||options.mounted&&options.failMigrationACK&&batches===2)throw Error('original Native ACK lost after actual COMMIT');return out;
 }};
 return{...f,binding,trace,groups,batchRecords,batches:()=>batches};
}

async function mountedInstallationCases(){
 for(const [layout,sourceKind]of [['canonical','marker'],['recorded-live-20261010','marker'],['recorded-live-20261010','public-predecessor']]){
  const f=setup(),business=writablePlanBusiness(layout,sourceKind,f,{mounted:true});try{
   f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;f.env.PRIVACY_INSTALL_SOURCE_KIND=sourceKind;
   const o=await original(f),initialized=await initializerEntry.default.fetch(o.request(),f.initEnv);eq(layout+'/'+sourceKind+' mounted pipeline genuine CLOSED initializer',initialized.status,200);
   const response=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/prepare-install'),f.env,f.ctx),body=await response.json();
   eq(layout+'/'+sourceKind+' mounted source install confirmed',response.status,200);
   eq(layout+'/'+sourceKind+' mounted source fence then complete migration',business.groups,sourceKind==='public-predecessor'?[5,465]:[3,460]);
   const migrationBatch=business.batchRecords[1],raid=migrationBatch.filter(r=>RAID_ALTERS.includes(r.sql));
   eq(layout+'/'+sourceKind+' mounted exact six A4 ALTERs with empty binds',raid.map(r=>[r.sql,r.values]),RAID_ALTERS.map(sql=>[sql,[]]));
   eq(layout+'/'+sourceKind+' mounted original batch cardinality after six fixed additions',migrationBatch.filter(r=>!RAID_ALTERS.includes(r.sql)).length,sourceKind==='public-predecessor'?459:454);
   const targets=epochInstaller.manifest[layout==='canonical'?'canonicalObjects':'recordedLiveObjects'],cf=business.oldObjects.filter(r=>r[1]==='_cf_KV'||r[2]==='_cf_KV'),target=[...targets,...cf].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0),terminal=migrationBatch.at(-1);
   eq(layout+'/'+sourceKind+' mounted terminal proof exact source profile and original epoch/deadline binds',terminal.values,[JSON.stringify(target),'',NEXT,String(T+300),String(T)]);

   eq(layout+'/'+sourceKind+' mounted install exact original data',fixtureProfile.data(business.db,business.p),business.oldData);
   eq(layout+'/'+sourceKind+' mounted install closed next epoch and original deadline',[body.state,body.servingMode,body.installation.originalCreatedAt,body.installation.originalExpiresAt,business.db.prepare('SELECT epoch,mode FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode])],['installed_closed','closed',T,T+300,[[NEXT,'closed']]]);
   eq(layout+'/'+sourceKind+' mounted source independent completion durable',f.db.prepare("SELECT state,created_at,expires_at FROM recovery_journal WHERE purpose='reserve'").all().map(r=>[r.state,r.created_at,r.expires_at]),[['complete',T,T+300]]);
   const before=[business.batches(),f.calls.length],again=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/prepare-install'),f.env,f.ctx),observed=await again.json();
   eq(layout+'/'+sourceKind+' mounted same command only observes retained result',[again.status,observed.state,business.batches(),f.calls.length,observed.automaticRetry],[200,'installed_closed',...before,false]);
   eq(layout+'/'+sourceKind+' mounted install FK unchanged',[business.db.prepare('PRAGMA foreign_keys').get().foreign_keys,business.db.prepare('PRAGMA foreign_key_check').all()],[1,[]]);
   installationCases.push({case:'mounted-private-installation',layout,sourceKind,nativeBatches:business.batches(),nativeGroups:business.groups,nativeStatements:business.trace.length,independentCompletionConfirmed:true,originalCreatedAt:T,originalExpiresAt:T+300,providerDrainQualified:false,readyToReopen:false});
  }finally{business.db.close();f.close();}
 }
 {const f=setup(),business=writablePlanBusiness('canonical','marker',f,{mounted:true,failMigrationACK:true});try{
  f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';f.env.PRIVACY_INSTALL_SOURCE_KIND='marker';const o=await original(f);await initializerEntry.default.fetch(o.request(),f.initEnv);
  const response=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/prepare-install'),f.env,f.ctx);eq('mounted actual migration lost ACK held',response.status,503);
  eq('mounted migration lost ACK retains actual committed closed next epoch',business.db.prepare('SELECT epoch,mode FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode]),[[NEXT,'closed']]);
  const before=[business.batches(),f.calls.length],again=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/prepare-install'),f.env,f.ctx);eq('mounted unknown command cannot repeat Native or independent effects',[again.status,business.batches(),f.calls.length],[503,...before]);
  eq('mounted lost ACK remains durable reserved',f.db.prepare("SELECT state FROM recovery_journal WHERE purpose='reserve'").all().map(r=>r.state),['reserved']);
 }finally{business.db.close();f.close();}}
}
async function actualInstallationCases(){
 for(const [layout,sourceKind]of [['canonical','marker'],['recorded-live-20261010','marker'],['recorded-live-20261010','public-predecessor']]){
  const f=setup(),business=writablePlanBusiness(layout,sourceKind,f);try{
   f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;f.env.PRIVACY_INSTALL_SOURCE_KIND=sourceKind;
   const o=await original(f),cut=await originalOwnedCut(f,o),plan=await originalControl.captureOriginalPrivateInstallPlan(cut);
   const result=await originalControl.executeOriginalPrivateInstallPlan(plan),facts=originalControl.originalPrivateInstallationFacts(result),receipt=JSON.parse(facts.migrationReceipt);
   eq(layout+'/'+sourceKind+' real private installation one Native batch',business.batches(),1);
   eq(layout+'/'+sourceKind+' original values types rowids sequence clocks survive actual source batch',fixtureProfile.data(business.db,business.p),business.oldData);
   const system=business.oldObjects.filter(x=>x[1]==='_cf_KV'||x[2]==='_cf_KV'),expected=[...epochInstaller.manifest[business.k+'Objects'],...system].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
   eq(layout+'/'+sourceKind+' real source readback complete target objects',fixtureProfile.objects(business.db),expected);
   eq(layout+'/'+sourceKind+' real source closed next epoch and original counters',business.db.prepare('SELECT epoch,mode,active,nonce,purpose,entry_changes,logical_changes FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode,r.active,r.nonce,r.purpose,r.entry_changes,r.logical_changes]),[[NEXT,'closed',0,'','',sourceKind==='public-predecessor'?1:0,sourceKind==='public-predecessor'?1:0]]);
   eq(layout+'/'+sourceKind+' actual source migration receipt17/null legacy custody',[receipt.length,receipt[0],receipt[3],receipt[7],receipt[8],receipt[9],receipt[10],receipt[15],receipt[16]],[17,'closed-profile-migration-v2',o.value.operationId,sourceKind,sourceKind==='public-predecessor'?null:WE,NEXT,layout,T,T]);
   eq(layout+'/'+sourceKind+' four owned digests are full lowercase64',receipt.slice(11,15).map(v=>typeof v==='string'&&v.length===64&&!/[^0-9a-f]/.test(v)),[true,true,true,true]);
   eq(layout+'/'+sourceKind+' independent completion is durable original300',f.db.prepare("SELECT state,created_at,expires_at,completed_at FROM recovery_journal WHERE operation_id=?").all(facts.executionOperationId).map(r=>[r.state,r.created_at,r.expires_at,r.completed_at]),[['complete',T,T+300,T]]);
   eq(layout+'/'+sourceKind+' real stage still grants no provider replay opener authority',[facts.nativeMigrationCommitted,facts.nativeReadbackConfirmed,facts.independentCompletionConfirmed,facts.productionInstallationQualified,facts.providerDrainQualified,facts.replayQualified,facts.readyToReopen],[true,true,true,false,false,false,false]);
   eq(layout+'/'+sourceKind+' private result carries no callable or scalar authority',Reflect.ownKeys(result),[]);
   let held=false;try{originalControl.originalPrivateInstallationFacts({...result});}catch{held=true;}eq(layout+'/'+sourceKind+' copied result cannot mint migration receipt',held,true);
   held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}eq(layout+'/'+sourceKind+' same plan one-use after complete',[held,business.batches()],[true,1]);
   eq(layout+'/'+sourceKind+' actual source FK remains ON/valid',[business.db.prepare('PRAGMA foreign_keys').get().foreign_keys,business.db.prepare('PRAGMA foreign_key_check').all()],[1,[]]);
   installationCases.push({case:'actual-private-installation',layout,sourceKind,nativeBatches:business.batches(),nativeGroups:business.groups,nativeStatements:business.trace.length,independentCompletionConfirmed:true,originalCreatedAt:T,originalExpiresAt:T+300,publicLegacyOriginalEpoch:receipt[8],providerDrainQualified:false,replayQualified:false,readyToReopen:false});
  }finally{business.db.close();f.close();}
 }
 {const f=setup(),business=writablePlanBusiness('canonical','marker',f,{beforeBatch(){clock=T+300;}});try{
  f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';f.env.PRIVACY_INSTALL_SOURCE_KIND='marker';const o=await original(f),cut=await originalOwnedCut(f,o);
  clock=T+1;const plan=await originalControl.captureOriginalPrivateInstallPlan(cut),oldObjects=fixtureProfile.objects(business.db),oldData=fixtureProfile.data(business.db,business.p);
  clock=T+299;let held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}
  eq('original close Native deadline reached despite later capture lease',[held,business.batches(),clock],[true,1,T+300]);
  eq('late actual Native batch rolls back exact original schema and data',[fixtureProfile.objects(business.db),fixtureProfile.data(business.db,business.p)],[oldObjects,oldData]);
  eq('late actual Native batch leaves original epoch closed',business.db.prepare('SELECT epoch,mode FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode]),[[WE,'closed']]);
  eq('late actual Native batch retains durable reserved outcome',[f.db.prepare("SELECT state,expires_at FROM recovery_journal WHERE purpose='reserve'").all().map(r=>[r.state,r.expires_at])],[ [['reserved',T+300]] ]);
  installationCases.push({case:'late-native-original-close-deadline',capturedAt:T+1,originalExpiresAt:T+300,nativeExecutionAt:T+300,nativeBatches:business.batches(),rolledBack:true,completionConfirmed:false,automaticRetry:false});
 }finally{business.db.close();f.close();}}
 {const f=setup(),business=writablePlanBusiness('canonical','marker',f),nativeDecode=Object.getOwnPropertyDescriptor(TextDecoder.prototype,'decode');let getters=0;try{
  f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';f.env.PRIVACY_INSTALL_SOURCE_KIND='marker';const o=await original(f),cut=await originalOwnedCut(f,o),plan=await originalControl.captureOriginalPrivateInstallPlan(cut);
  f.hook(async(name,next)=>{const response=await next();if(name==='/v1/reserve')Object.defineProperty(TextDecoder.prototype,'decode',{configurable:true,get(){getters++;throw Error('late Native decoder getter forbidden');}});return response;});
  let held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}
  eq('late captured decode method accessor held getter0 before business',[held,getters,business.batches()],[true,0,0]);
  eq('late decode drift preserves one independent Native reservation',f.db.prepare("SELECT state FROM recovery_journal WHERE purpose='reserve'").all().map(r=>r.state),['reserved']);
  installationCases.push({case:'late-decoder-accessor',nativeBatches:0,decoderGetterHits:getters,completionConfirmed:false,automaticRetry:false});
 }finally{Object.defineProperty(TextDecoder.prototype,'decode',nativeDecode);business.db.close();f.close();}}
 for(const failure of ['reserve-ACK','native-ACK','completion-ACK','source-kind-drift']){
  const f=setup();let getters=0;const options=failure==='native-ACK'?{lostNativeACK:true}:failure==='source-kind-drift'?{afterBatch(){Object.defineProperty(f.env,'PRIVACY_INSTALL_SOURCE_KIND',{get(){getters++;throw Error('late config getter forbidden');},configurable:true});}}:{};
  const business=writablePlanBusiness('canonical','marker',f,options);try{
   f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';f.env.PRIVACY_INSTALL_SOURCE_KIND='marker';
   const o=await original(f),cut=await originalOwnedCut(f,o),plan=await originalControl.captureOriginalPrivateInstallPlan(cut);
   f.hook(async(name,next)=>{const response=await next();if(failure==='reserve-ACK'&&name==='/v1/reserve'||failure==='completion-ACK'&&name==='/v1/complete')throw Error('original private journal ACK lost after LAND');return response;});
   let held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}eq(failure+' actual stage unconfirmed remains held',held,true);
   const before=business.batches();held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}eq(failure+' original stage cannot retry business batch',[held,business.batches()],[true,before]);
   eq(failure+' durable reservation exists before uncertain action',f.db.prepare("SELECT state FROM recovery_journal WHERE purpose='reserve'").all().map(r=>r.state),[failure==='completion-ACK'?'complete':'reserved']);
   eq(failure+' actual Native mutation scope retained',[business.batches(),business.db.prepare('SELECT epoch,mode FROM privacy_write_admission').get().epoch],[failure==='reserve-ACK'?0:1,failure==='reserve-ACK'?WE:NEXT]);
   eq(failure+' late config getter0',getters,0);
   if(failure==='reserve-ACK'){
    // A new current read changes nativeCut.observedAt; it must not create a new execution ID.
    f.hook(null);clock=T+1;const nextCut=await originalControl.captureOriginalPrivateControlCut(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx),nextPlan=await originalControl.captureOriginalPrivateInstallPlan(nextCut);
    let secondHeld=false;try{await originalControl.executeOriginalPrivateInstallPlan(nextPlan);}catch{secondHeld=true;}
    eq('new observed cut after reserve lostACK cannot dispatch same original again',[secondHeld,business.batches(),f.db.prepare("SELECT count(*) n FROM recovery_journal WHERE purpose='reserve'").get().n],[true,0,1]);
   }
   installationCases.push({case:'actual-private-installation-unknown',failure,nativeBatches:business.batches(),nativeGroups:business.groups,completionConfirmed:false,automaticRetry:false,lateConfigGetters:getters,providerDrainQualified:false,readyToReopen:false});
  }finally{business.db.close();f.close();}
 }
 {const f=setup(),business=writablePlanBusiness('canonical','marker',f);try{
  f.env.DB=business.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT='canonical';f.env.PRIVACY_INSTALL_SOURCE_KIND='marker';const o=await original(f),cut=await originalOwnedCut(f,o),plan=await originalControl.captureOriginalPrivateInstallPlan(cut);
  let held=false;try{await originalControl.executeOriginalPrivateInstallPlan({...plan});}catch{held=true;}eq('foreign private plan no durable or Native action',[held,business.batches(),f.db.prepare("SELECT count(*) n FROM recovery_journal WHERE purpose='reserve'").get().n],[true,0,0]);
  clock=T+300;held=false;try{await originalControl.executeOriginalPrivateInstallPlan(plan);}catch{held=true;}eq('actual expired close cannot reserve or install',[held,business.batches(),f.db.prepare("SELECT count(*) n FROM recovery_journal WHERE purpose='reserve'").get().n],[true,0,0]);
 }finally{business.db.close();f.close();}}
}

async function main(){
 const measurements=[];
 {let getters=0;const env={};for(const key of ['PRIVACY_RECOVERY_FLOOR','PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_RECOVERY_INITIALIZER_SECRET','DB'])Object.defineProperty(env,key,{get(){getters++;throw Error('default-OFF binding accessor');}});
  eq('owner HTTP entry always404 without touching env',(await floorEntry.default.fetch(new Request('https://privacy-production-control.invalid/v1/control/initialize-closed'),env)).status,404);
  eq('initializer absent flag404 before namespace access',(await initializerEntry.default.fetch(new Request('https://privacy-production-control.invalid/v1/control/initialize-closed'),env)).status,404);
  eq('operator absent flag404 before namespace or D1 access',(await operatorEntry.default.fetch(new Request('https://privacy-production-control.invalid/v1/control/close'),env,{})).status,404);
  eq('all default-OFF secret and binding getters0',getters,0);
 }
 {const f=setup();try{const o=await original(f);eq('original exported DO constructor creates no Floor row',f.db.prepare('SELECT count(*) n FROM recovery_floor').get().n,0);
  const response=await initializerEntry.default.fetch(o.request(),f.initEnv),body=await response.json();eq('mounted genuine initializer200',response.status,200);eq('actual original Floor then CLOSED gate calls',f.calls,['/v1/initialize','/v1/serving/initialize-closed']);
  eq('distinct three deployment versions bind correct serving Floor',JSON.parse(body.floor)[9],SERVING_VERSION);
  eq('original native gate CLOSED with fixed300',f.db.prepare('SELECT state,operation_id,created_at,expires_at,next_write_epoch FROM recovery_serving_gate').get(),{state:'closing_held',operation_id:o.value.operationId,created_at:T,expires_at:T+300,next_write_epoch:NEXT});
  const cutResponse=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx),cut=await cutResponse.json();eq('mounted original operator observes native cut200',cutResponse.status,200);
  eq('actual cut local zero census is not provider drainage',[cut.localPending,cut.localUnknown,cut.providerPending,cut.providerUnknown,cut.providerDrainQualified,cut.readyToReopen],[0,0,0,0,false,false]);
  eq('actual16 receipt preserves original300',[JSON.parse(cut.allWriterCut).length,JSON.parse(cut.allWriterCut)[7],JSON.parse(cut.allWriterCut)[8]],[16,T,T+300]);
  for(const suffix of ['prepare-install','reopen']){const before=f.calls.length,r=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/'+suffix),f.env,f.ctx),v=await r.json();eq('mounted '+suffix+' stays409 no DO work',[r.status,f.calls.length-before,f.d1Calls(),v.installationQualified,v.readyToReopen],[409,0,0,false,false]);}
  clock=T+300;const before=f.calls.length,expired=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx);eq('mounted expired original cannot renew or dispatch',[expired.status,f.calls.length-before,f.d1Calls()],[503,0,0]);
  eq('expiry preserves original Native gate clock',f.db.prepare('SELECT state,created_at,expires_at FROM recovery_serving_gate').get(),{state:'closing_held',created_at:T,expires_at:T+300});
  measurements.push({case:'mounted-original-initialize-and-cut',originalCreatedAt:T,originalExpiresAt:T+300,doInitializedClosed:true,d1BusinessCalls:f.d1Calls(),nativeOpenerDispatched:false,providerDrainQualified:false});
 }finally{f.close();}}
 {const f=setup();try{const o=await original(f);f.hook(async(name,next)=>{const response=await next();if(name==='/v1/serving/initialize-closed')throw Error('original mounted ACK lost after LAND');return response;});const r=await initializerEntry.default.fetch(o.request(),f.initEnv),v=await r.json();eq('mounted initializer LAND lost ACK unknown with no retry',[r.status,v.scope,v.retryInitializationAllowed], [409,'same_original_outcome_unknown',false]);eq('lost ACK preserves single original CLOSED gate',f.db.prepare('SELECT state,operation_id FROM recovery_serving_gate').get(),{state:'closing_held',operation_id:o.value.operationId});measurements.push({case:'mounted-original-lost-ack',doInitializedClosed:true,completionConfirmed:false,automaticRetry:false});}finally{f.close();}}
 {const f=setup();try{const o=await original(f);f.initEnv.PRIVACY_RECOVERY_OPERATOR_SECRET=OPERATOR;const init=await initializerEntry.default.fetch(o.request(),f.initEnv);eq('mounted initializer refuses operator-root mixing before RPC',[init.status,f.calls.length],[409,0]);
  f.env.PRIVACY_RECOVERY_INITIALIZER_SECRET=INITIALIZER;const control=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx);eq('mounted operator refuses initializer-root mixing before RPC',[control.status,f.calls.length,f.d1Calls()],[503,0,0]);
 }finally{f.close();}}
 {const f=setup();try{const o=await original(f);let getters=0;Object.defineProperty(f.env,'PRIVACY_PRODUCTION_CONTROL_ENABLED',{get(){getters++;throw Error('enabled accessor forbidden');}});const r=await operatorEntry.default.fetch(await controlRequest(f,o,'/v1/control/observe-cut'),f.env,f.ctx);eq('mounted operator flag accessor rejected getter0',[r.status,getters,f.calls.length,f.d1Calls()],[503,0,0,0]);}finally{f.close();}}
 {const f=setup();try{
  const o=await original(f),init=o.request(),initPath='/private-production-control/initialize-closed';let initializations=0;
  const initialized=await privateAdapter.forwardPrivateProductionControl(new Request('https://olympus-verify.roach-council.workers.dev'+initPath,{method:'POST',headers:init.headers,body:await init.text()}),{PRIVACY_PRODUCTION_INITIALIZER:{async fetch(request){initializations++;return initializerEntry.default.fetch(request,f.initEnv);}}},initPath);
  eq('private adapter separate initializer reaches actual CLOSED original Floor',[initialized.status,(await initialized.json()).scope,initializations,f.d1Calls()],[200,'source_original_native_closed_initialization',1,0]);
  const pathname='/private-production-control/observe-cut';let forwarded=0;
  const binding={async fetch(request){forwarded++;eq('private adapter fixed internal target and credential minimization',[request.url,request.headers.get('Cookie'),request.headers.get('Authorization')],['https://privacy-production-control.invalid/v1/control/observe-cut',null,null]);return operatorEntry.default.fetch(request,f.env,f.ctx);}};
  const request=async()=>{const source=await controlRequest(f,o,'/v1/control/observe-cut'),headers=new Headers(source.headers);headers.set('Cookie','must-not-forward');headers.set('Authorization','must-not-forward');return new Request('https://olympus-verify.roach-council.workers.dev'+pathname,{method:'POST',headers,body:await source.text()});};
  eq('private adapter absent binding held before dispatch',(await privateAdapter.forwardPrivateProductionControl(await request(),{},pathname)).status,503);
  const response=await privateAdapter.forwardPrivateProductionControl(await request(),{PRIVACY_PRODUCTION_CONTROL:binding},pathname);eq('private adapter actual authenticated original native cut',[response.status,(await response.json()).scope,forwarded],[200,'private_source_original_native_cut',1]);
  const artifactPath='/private-production-control/install-and-reopen-artifact',artifactInternal='/v1/control/install-and-reopen-artifact';let artifactForwards=0;
  const artifactBinding={async fetch(request){artifactForwards++;eq('artifact adapter finite target and credentials',[request.url,request.headers.get('Cookie'),request.headers.get('Authorization')],['https://privacy-production-control.invalid'+artifactInternal,null,null]);return operatorEntry.default.fetch(request,f.env,f.ctx);}};
  const artifactRequest=async()=>{const original=await controlRequest(f,o,artifactInternal),headers=new Headers(original.headers);headers.set('Cookie','must-not-forward');headers.set('Authorization','must-not-forward');return new Request('https://olympus-verify.roach-council.workers.dev'+artifactPath,{method:'POST',headers,body:await original.text()});};
  const artifactBefore=[f.calls.length,f.d1Calls()],artifactResponse=await privateAdapter.forwardPrivateProductionControl(await artifactRequest(),{PRIVACY_PRODUCTION_CONTROL:artifactBinding},artifactPath),artifactBody=await artifactResponse.json();
  eq('artifact command reaches original authenticated operator but absent install config holds',[artifactResponse.status,artifactBody.scope,artifactBody.reason,artifactForwards,f.calls.length,f.d1Calls()],[409,'private_original_control_held','original_install_configuration_required',1,...artifactBefore]);
  const artifactBad=await artifactRequest();artifactBad.headers.set('X-Olympus-Control-Proof','0'.repeat(64));
  eq('artifact command wrong original HMAC holds before DO or D1',[(await privateAdapter.forwardPrivateProductionControl(artifactBad,{PRIVACY_PRODUCTION_CONTROL:artifactBinding},artifactPath)).status,f.calls.length,f.d1Calls()],[503,...artifactBefore]);
  const artifactNoProof=await artifactRequest();artifactNoProof.headers.delete('X-Olympus-Control-Proof');const artifactCount=artifactForwards;
  eq('artifact command absent proof never invokes private service',[(await privateAdapter.forwardPrivateProductionControl(artifactNoProof,{PRIVACY_PRODUCTION_CONTROL:artifactBinding},artifactPath)).status,artifactForwards],[401,artifactCount]);
  const before=f.calls.length,bad=await request();bad.headers.set('X-Olympus-Control-Proof','0'.repeat(64));eq('private adapter wrong HMAC rejected by original operator without DO effect',[(await privateAdapter.forwardPrivateProductionControl(bad,{PRIVACY_PRODUCTION_CONTROL:binding},pathname)).status,f.calls.length],[503,before]);
  const count=forwarded,noProof=await request();noProof.headers.delete('X-Olympus-Control-Proof');eq('private adapter missing proof never dispatches',[(await privateAdapter.forwardPrivateProductionControl(noProof,{PRIVACY_PRODUCTION_CONTROL:binding},pathname)).status,forwarded],[401,count]);
  const large=new Request('https://olympus-verify.roach-council.workers.dev'+pathname,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':'a'.repeat(64)},body:' '.repeat(8193)});eq('private adapter actual streamed byte limit before private dispatch',[(await privateAdapter.forwardPrivateProductionControl(large,{PRIVACY_PRODUCTION_CONTROL:binding},pathname)).status,forwarded],[503,count]);
  eq('private adapter finite path and method allowlist',[(await privateAdapter.forwardPrivateProductionControl(new Request('https://olympus-verify.roach-council.workers.dev'+pathname),{},pathname)).status,(await privateAdapter.forwardPrivateProductionControl(new Request('https://olympus-verify.roach-council.workers.dev/private-production-control/arbitrary'),{},'/private-production-control/arbitrary')).status],[405,404]);
 }finally{f.close();}}
 await installPlanNativeCases();
 await actualInstallationCases();
 await mountedInstallationCases();
 eq('no provider network attempt in private mounting',providerAttempts,0);
 const result={schema:'genuine-private-entry-mounts-native-v1',complete:true,entryCachesSeparate:true,naturalEntryGraphsLoadedFirst:true,sourceOwnedInitializerAndControl:true,syntheticManagedOpenBootstrap:false,measurements,providerActions:0,providerOriginQualified:false,providerDrainQualified:false,installationQualified:false,privateOpenerQualified:false,allWriterBootstrapQualified:false,productionActivation:false,readyToReopen:false,installPlanCases,installationCases,actualPrivateNativeInstallationAvailable:true,sourceOwnedReplayExecutorAvailable:false,fixtureProfileAssertions:fixtureProfile.checks(),passedAssertions:checks+fixtureProfile.checks()};
 console.log('MEASURED_PRIVATE_ENTRY_MOUNTS '+JSON.stringify(result));console.log('private entry mounts native: '+(checks+fixtureProfile.checks())+'/'+(checks+fixtureProfile.checks())+' passed');
}
module.exports=Object.freeze({setup,original,originalOwnedCut,originalControl,operatorLoad,fixtureChecks:()=>checks,fixtureClockNow:()=>clock,fixtureAdvance(value){assert.ok(Number.isSafeInteger(value)&&value>0);clock=value;}});
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

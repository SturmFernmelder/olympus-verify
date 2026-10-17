// Prospective provenance only: actual serving source, signed POST, Native SQLite and original Floor.
// The existing fixture's appended read-only observation pattern exposes no production registrar.
const fs=require('node:fs'),Module=require('node:module');
const original=fs.readFileSync(require('node:path').join(__dirname,'privacy_serving_integration_test.cjs'),'utf8'),marker='(async()=>{';
if(original.split(marker).length!==2)throw Error('original integration fixture changed');
const seam=" if(name==='privacy-serving-erase')code+=";
let prefix=original.slice(0,original.indexOf(marker));
if(prefix.split(seam).length!==2)throw Error('original read-only loader observation seam changed');
const observation=String.raw`
module.exports.testOnlyRejectionObservation=function(job){
 const r=nativeRejections.get(job);if(!r)return null;const f=nativeFrames.get(r.frame);
 return Object.freeze({evidence:r.evidence,error:r.error,frame:r.frame,intent:r.intent,phase:f?.phase,
  exact:!!f&&f.owner===r.child&&r.child.frame===r.frame&&r.child.job===r.job&&r.job===job&&r.child.intent===r.intent&&r.child.reservation===r.reservation&&r.child.rejectionSource===r.source&&r.child.spent===true&&f.packet===null,
  request:r.source.request,workRequest:r.source.workRequest,requestTuple:r.source.requestTuple,workRequestTuple:r.source.workRequestTuple});
};
module.exports.testOnlyActiveFrame=function(){const a=active.getStore(),c=a&&terminalChildren.get(a.context);return c?.frame??null;};
module.exports.testOnlyFramePhase=function(frame){return nativeFrames.get(frame)?.phase??null;};
`;
prefix=prefix.replace(seam," if(name==='privacy-global-serving-origin')code+="+JSON.stringify('\n'+observation)+";\n"+seam);
const cases=String.raw`
const origin=load('privacy-global-serving-origin'),jobs=load('privacy-serving-jobs'),assert=require('node:assert/strict');
const GUARD='original_recovery_companion_changed_held',CLAIM='UPDATE privacy_serving_jobs SET last_attempt_at=';
const originalDispatch=origin.dispatchOriginalAccountErasureTerminalBatch,seenJobs=[];
origin.dispatchOriginalAccountErasureTerminalBatch=function(e,job,group,statements){seenJobs.push(job);return originalDispatch(e,job,group,statements);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),lastJob=()=>seenJobs.at(-1),evidence=()=>lastJob()?origin.testOnlyRejectionObservation(lastJob()):null;
const journal=()=>doDb.prepare('SELECT * FROM recovery_suppression_journal ORDER BY operation_id').all();
const companion=()=>doDb.prepare('SELECT * FROM recovery_suppression_companion ORDER BY operation_id').all();
const unknown=()=>doDb.prepare("SELECT * FROM recovery_serving_ticket WHERE state IN('running','unknown') ORDER BY ticket_id").all();
const job=()=>raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP);
function fresh(flag='true'){reset();seenJobs.length=0;currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE='true';if(flag===undefined)delete currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE;else currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE=flag;}
async function post(cookie){
 const pending=[],request=new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({operationId:OP})});
 const response=await load('index').default.fetch(request,{...env(),DB:native},{waitUntil(p){pending.push(p);}});
 for(const p of pending)await p;
 return {status:response.status,pending:pending.length,errorBody:response.status===503?await response.text():null};
}
// Configured index joins the original deferred child; unresolved custody returns this exact held response.
const heldPost=response=>response.status===503&&response.pending===1&&response.errorBody==='{"error":"original_serving_held"}';
async function prepare(flag='true'){fresh(flag);await ready();return originalCookie();}
function terminal(plan){return plan.some(s=>s._sql.includes(GUARD));}
function refusedFrame(label,r){let error;try{origin.assertOriginalAccountErasureNativeFrame(r.frame,r.intent);}catch(e){error=e;}check(label,!!error&&origin.testOnlyFramePhase(r.frame)==='unknown');}
function installFault(kind,error){
 const savedBatch=native.batch;let reached=0,frame=null;
 hooks.beforeBatch=async plan=>{if(terminal(plan)){reached++;frame=origin.testOnlyActiveFrame();}};
 if(kind==='sync'||kind==='immediate-descriptor'){
  const wrapped=function(plan){if(terminal(plan)){reached++;frame=origin.testOnlyActiveFrame();if(kind==='sync')throw error;native.batch=async()=>[];return Promise.resolve().then(()=>{native.batch=wrapped;return [];});}return Reflect.apply(savedBatch,this,[plan]);};
  native.batch=wrapped;
 }
 if(kind==='reject'||kind==='late')hooks.beforeStatement=sql=>{if(sql.includes(GUARD)){if(kind==='late')clock+=301;throw error;}};
 if(kind==='lost'||kind==='packet'||kind==='post-descriptor')hooks.afterBatch=async(plan,out)=>{if(terminal(plan)){if(kind==='lost')throw error;if(kind==='packet')out.at(-1).success=false;if(kind==='post-descriptor')native.batch=async()=>{throw Error('changed original batch');};}};
 return {get reached(){return reached;},get frame(){return frame;},restore(){hooks={};native.batch=savedBatch;}};
}
async function originalRejections(){
 for(const kind of ['sync','reject','lost']){
  const cookie=await prepare(),originalError=Object.freeze({kind,source:'actual Native adapter rejection'}),fault=installFault(kind,originalError),response=await post(cookie);fault.restore();
  const r=evidence();check(kind+' uses the real admitted POST and one terminal dispatch',heldPost(response)&&seenJobs.length===1&&fault.reached===1);
  check(kind+' retains opaque exact original job/intent/child/reservation/frame and error identity',!!r&&r.exact&&r.error===originalError&&Object.isFrozen(r.evidence)&&Reflect.ownKeys(r.evidence).length===0&&r.frame===fault.frame);
  check(kind+' is bound to the original captured POST and its actual clone',r?.request instanceof Request&&r.workRequest instanceof Request&&r.request!==r.workRequest&&JSON.parse(r.requestTuple)[1]==='POST'&&new URL(JSON.parse(r.requestTuple)[0]).pathname==='/api/me/erasure'&&same(JSON.parse(r.requestTuple),JSON.parse(r.workRequestTuple)));
  check(kind+' leaves the original journal/companion and ticket custody unresolved',journal().length===1&&journal()[0].state==='reserved'&&companion().length===1&&unknown().length>0);
  check(kind+' does not confuse rejection with rollback',kind!=='lost'?!!raw('SELECT 1 FROM site_users WHERE discord_id=?',ID)&&job().completed_at===null:!raw('SELECT 1 FROM site_users WHERE discord_id=?',ID)&&job().state==='complete'&&raw('SELECT COUNT(*) n FROM privacy_restore_replay').n===1);
  if(r)refusedFrame(kind+' cannot revive or acknowledge the unknown original frame',r);
  check(kind+' copied job object has no retained evidence',origin.testOnlyRejectionObservation(Object.freeze({}))===null);
  if(kind==='reject'){
   const beforeJournal=journal(),beforeCompanion=companion(),beforeUnknown=unknown(),beforeJob=job(),before=seenJobs.length,retained=r?.evidence;
   clock+=121;await post(cookie);
   check('later POST cannot turn historical unknown into a new rejection or reservation',seenJobs.length===before&&evidence()?.evidence===retained&&same(journal(),beforeJournal)&&same(companion(),beforeCompanion)&&same(job(),beforeJob)&&beforeUnknown.every(x=>unknown().some(y=>same(x,y))));
  }
 }
}
async function wrapperAndClockRefusals(){
 for(const kind of ['packet','immediate-descriptor','post-descriptor','late']){
  const cookie=await prepare(),fault=installFault(kind,Error('actual '+kind)),response=await post(cookie);fault.restore();
  check(kind+' reaches actual terminal Native dispatch',heldPost(response)&&fault.reached===1&&seenJobs.length===1);
  check(kind+' never issues rejection provenance',evidence()===null&&origin.testOnlyFramePhase(fault.frame)==='unknown');
 }
 const cookie=await prepare(),savedPrepare=native.prepare,savedBatch=native.batch;let changed=0,terminalDispatches=0;
 native.prepare=function(sql){const s=Reflect.apply(savedPrepare,this,[sql]);if(sql.includes(GUARD)){changed++;native.batch=async()=>{terminalDispatches++;throw Error('unexpected changed dispatch');};}return s;};
 try{await post(cookie);}finally{native.prepare=savedPrepare;native.batch=savedBatch;hooks={};}
 check('descriptor drift during materialization refuses before Native dispatch and provenance',changed===1&&terminalDispatches===0&&seenJobs.length===1&&evidence()===null);
}
async function lostReservation(){
 for(const target of ['/v2/suppression/reserve','/v3/suppression/associate-original']){
  const cookie=await prepare(),ns=currentEnv.PRIVACY_RECOVERY_FLOOR,id=ns.idFromName(load('privacy-recovery-floor').RECOVERY_FLOOR_NAME),stub=ns.get(id),saved=stub.fetch;let losses=0,nativeTerminal=0;
  stub.fetch=async function(request){const response=await Reflect.apply(saved,this,[request]);if(!losses&&new URL(request.url).pathname===target){losses++;throw Error('lost original reservation ACK');}return response;};
  hooks.beforeBatch=async plan=>{if(terminal(plan))nativeTerminal++;};
  try{await post(cookie);}finally{stub.fetch=saved;hooks={};}
  check(target+' genuine landed ACK loss cannot issue rejection provenance',losses===1&&journal().length===1&&nativeTerminal===0&&seenJobs.length===1&&evidence()===null);
 }
}
async function nonPostAndPreterminal(){
 await prepare();await admission();const fault=installFault('reject',Error('non-POST Native rejection'));let caught;
 try{await originalServingWork(env(),e=>jobs.runServingErasureJob(e));}catch(e){caught=e;}finally{fault.restore();}
 check('existing job-body fixture without captured POST cannot issue provenance',!!caught&&fault.reached===1&&evidence()===null);
 const cookie=await prepare();let failures=0;hooks.beforeStatement=sql=>{if(sql.includes(' AS references_clear')){failures++;throw Error('generic preterminal failure');}};
 await post(cookie);hooks={};check('generic preterminal failure has no original terminal job/reservation/evidence',failures===1&&seenJobs.length===0&&journal().length===0&&evidence()===null);
}
async function knownHoldReplay(){
 // Use the unchanged fixture's beta retention phase before the original cookie/Floor captures.
 fresh();clock+=900;await ready();const cookie=await originalCookie(),beta=load('beta-reset-policy'),cursor=load('beta-reset-scan'),retention=load('privacy-retention');
 const scan=JSON.stringify({version:1,epoch:beta.BETA_RESET_EPOCH,digest:'a'.repeat(64),pass:1,after:ID,lease:'',leaseUntil:0,passStartedAt:clock-1000,scanned:1000,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null});
 await setupWrite('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)',cursor.BETA_RESET_SCAN_KEY,scan,clock-300,'system:beta-reset');
 const first=await post(cookie);check('known preterminal POST hold creates no original reservation',first.status===202&&job().hold_reason==='ambiguous_personal_reference'&&journal().length===0&&seenJobs.length===0);
 const cleared=await originalServingWork(env(),e=>retention.sweepServingRetention(e,retention.captureServingRetentionSchedule()));
 check('original beta-phase retention clears the known cursor before replay',cleared===1&&JSON.parse(raw('SELECT value FROM site_settings WHERE key=?',cursor.BETA_RESET_SCAN_KEY).value).after==='0'&&journal().length===0&&seenJobs.length===0);clock+=121;
 const error=Error('first genuine reservation on replay'),fault=installFault('reject',error),second=await post(cookie);fault.restore();
 check('later genuine POST after a known hold remains eligible on its first reservation',heldPost(second)&&fault.reached===1&&seenJobs.length===1&&evidence()?.error===error&&evidence()?.exact&&journal().length===1);
}
async function offParityAndSuccess(){
 const results=[];
 for(const flag of [undefined,'false','true']){
  fresh();if(flag===undefined)delete currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE;else currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE=flag;
  const cookie=await originalCookie(),sql=[];hooks.beforeStatement=s=>sql.push(s);const response=await post(cookie);hooks={};
  check(String(flag)+' actual signed POST succeeds without rejection evidence',response.status===202&&job().state==='complete'&&journal()[0]?.state==='committed'&&unknown().length===0&&evidence()===null);
  const j=job(),pairs=[[j.subject_generation,'<generation>'],[j.request_digest,'<digest>'],[j.original_account_incarnation,'<birth>']];
  results.push(sql.map(s=>pairs.reduce((v,[from,to])=>from?v.split(from).join(to):v,s)));
 }
 check('absent/false preserve every actual Native SQL statement and count',same(results[0],results[1]));
 check('fence mode adds no Native statement to the original completing POST',results[1].length===results[2].length);
 check('source exports no rejection registrar, classifier, lookup or retry API',Object.keys(origin).filter(k=>!k.startsWith('testOnly')).every(k=>!k.includes('Rejection')));
}
(async()=>{
 for(const [name,run] of [['original rejection',originalRejections],['wrapper/clock',wrapperAndClockRefusals],['lost reservation',lostReservation],['non-POST/preterminal',nonPostAndPreterminal],['known hold replay',knownHoldReplay],['OFF/success',offParityAndSuccess]]){
  try{await run();}catch(error){console.error(name,error);check(name+' completed',false);}finally{hooks={};}
 }
 check('all loaded production bytes remain unchanged',Array.from(pins).every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
 console.log('ORIGINAL_TERMINAL_REJECTION_SUMMARY '+JSON.stringify({checks,passes,retryImplemented:false,fenceIssued:false,originalUnknownResolved:false,providerDrainQualified:false,fullCIQualified:false}));
 if(checks!==passes)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{db?.close();doDb?.close();});
`;
const mod=new Module(__filename,module);mod.filename=__filename;mod.paths=module.paths;
mod._compile(prefix+cases,__filename);

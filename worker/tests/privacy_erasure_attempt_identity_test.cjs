// Prospective Phase 2 foundation only: real acknowledged claims and the real consuming guard.
// Same original signed admission, serving origin, Native SQLite, Floor and fake Discord as the existing family.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=fs.readFileSync(path.join(__dirname,'privacy_serving_integration_test.cjs'),'utf8'),marker='(async()=>{';
if(original.split(marker).length!==2)throw Error('original integration fixture changed');
const cases=String.raw`
const jobs=load('privacy-serving-jobs'),identity=load('privacy-erasure-attempt-identity'),assert=require('node:assert/strict');
const UNRESOLVED='attempt_unresolved',CLAIM='UPDATE privacy_serving_jobs SET last_attempt_at=',READ=' AS recovery_companion,j.operation_id',GUARD='original_recovery_companion_changed_held';
const MAX=253402300798;
const job=()=>raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const count=(table)=>doDb.prepare('SELECT COUNT(*) n FROM '+table).get().n;
const unknown=()=>doDb.prepare("SELECT ticket_id,parent_ticket_id,state FROM recovery_serving_ticket WHERE state IN('running','unknown') ORDER BY ticket_id").all();
function flags(fence,discipline='true'){currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE=discipline;if(fence===undefined)delete currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE;else currentEnv.PRIVACY_ERASURE_ATTEMPT_FENCE=fence;}
async function fresh(fence){if(arguments.length===0)fence='true';reset();flags(fence);return admission();}
async function observe(work){const sql=[],groups=[],start=attempts,network=calls.length,previous=hooks.beforeStatement,batch=hooks.beforeBatch;
 hooks.beforeStatement=s=>{sql.push(s);previous?.(s);};hooks.beforeBatch=async plan=>{groups.push(plan.map(s=>({sql:s._sql,binds:Array.from(s.params)})));await batch?.(plan);};
 let value=null,error=null;try{value=await originalServingWork(env(),work);}catch(e){error=e;}finally{hooks.beforeStatement=previous;hooks.beforeBatch=batch;}
 return{value,error,sql,groups,physical:attempts-start,network:calls.length-network};
}
const cron=()=>observe(e=>jobs.runServingErasureJob(e));
const noTerminal=()=>count('recovery_suppression_journal')===0&&count('recovery_suppression_companion')===0&&raw('SELECT COUNT(*) n FROM privacy_restore_replay').n===0;
function normalize(sql,p){for(const [from,to] of [[p.subjectGeneration,'<generation>'],[p.requestDigest,'<digest>'],[p.accountIncarnation,'<birth>']])if(from)sql=sql.split(from).join(to);return sql;}
async function rejectsWithoutWork(label,work){const before=attempts,network=calls.length;let caught=null;try{await work();}catch(e){caught=e;}check(label,!!caught&&attempts===before&&calls.length===network);}

async function offAndPositive(){
 const runs=[];
 for(const flag of [undefined,'false','true']){
  const p=await fresh(flag),out=await cron(),j=job();
  check('flag '+String(flag)+': original claimed continuation completes',!out.error&&out.value?.completed===1&&j.state==='complete'&&!raw('SELECT 1 FROM site_users WHERE discord_id=?',ID));
  check('flag '+String(flag)+': genuine committed journal and replay remain the authority',count('recovery_suppression_journal')===1&&doDb.prepare('SELECT state FROM recovery_suppression_journal').get().state==='committed'&&raw('SELECT COUNT(*) n FROM privacy_restore_replay').n===1&&unknown().length===0);
  runs.push({flag,p,out,j});
 }
 const [absent,off,on]=runs;
 check('absent and false preserve every issued Native SQL text and count',absent.out.physical===off.out.physical&&same(absent.out.sql.map(s=>normalize(s,absent.p)),off.out.sql.map(s=>normalize(s,off.p))));
 const a=off.out.sql.map(s=>normalize(s,off.p)),b=on.out.sql.map(s=>normalize(s,on.p)),changed=b.flatMap((s,i)=>s===a[i]?[]:[s]);
 check('ON adds no Native statement: only claim, original job read and consuming companion guard change',on.out.physical===off.out.physical&&a.length===b.length&&changed.length===3&&changed.some(s=>s.includes(CLAIM))&&changed.some(s=>s.includes(READ))&&changed.some(s=>s.includes(GUARD)));
 const claim=changed.find(s=>s.includes(CLAIM)),read=on.out.groups.flat().find(s=>s.sql.includes(READ)),guard=on.out.groups.flat().find(s=>s.sql.includes(GUARD));
 check('ON original claim uses MAX and retains both unresolved exclusions',claim.includes('MAX(')&&claim.includes('COALESCE(last_attempt_at,0)+1')&&claim.includes("NOT IN('attempt_unresolved','independent_suppression_outcome_unknown')"));
 check('same acknowledged token is bound to the actual job read and terminal guard',read?.binds[7]===on.j.last_attempt_at&&guard?.binds[7]===on.j.last_attempt_at&&read.sql.includes("j.hold_reason='attempt_unresolved'")&&guard.sql.includes("j.hold_reason='attempt_unresolved'"));
 check('existing installed scheduled allowance stays 700 / erasure 196',load('scheduled-budget').ADMISSION_SCHEDULED_WORST_CASE===700&&load('scheduled-budget').ADMISSION_SCHEDULED_BUDGET.find(x=>x.job==='runServingErasureJob').worst===196);
}

async function consumingRaces(){
 for(const change of ['token','marker']){
  await fresh();let reached=0,guardAttempt=0;
  hooks.beforeStatement=sql=>{if(sql.includes(GUARD))guardAttempt++;};
  hooks.beforeBatch=async plan=>{if(reached||!plan.some(s=>s._sql.includes(GUARD)))return;reached++;const previous=hooks.beforeBatch;hooks.beforeBatch=null;try{
   if(change==='token')await setupWrite('UPDATE privacy_serving_jobs SET last_attempt_at=last_attempt_at+1 WHERE operation_id=?',OP);
   else await setupWrite("UPDATE privacy_serving_jobs SET hold_reason='synthetic_concurrent_hold' WHERE operation_id=?",OP);
  }finally{hooks.beforeBatch=previous;}};
  const out=await cron(),j=job();hooks={};
  check(change+' race: original terminal batch reaches and rejects its consuming guard',reached===1&&guardAttempt===1&&!!out.error);
  check(change+' race: no cleanup or replay commits',!!raw('SELECT 1 FROM site_users WHERE discord_id=?',ID)&&raw('SELECT state FROM privacy_subjects WHERE subject_id=?',ID).state==='retiring'&&j.completed_at===null&&raw('SELECT COUNT(*) n FROM privacy_restore_replay').n===0);
  check(change+' race: original reserved journal/companion and unknown custody remain',count('recovery_suppression_journal')===1&&count('recovery_suppression_companion')===1&&doDb.prepare('SELECT state FROM recovery_suppression_journal').get().state==='reserved'&&unknown().length>0);
  check(change+' race: original finally cannot overwrite changed claim facts',change==='token'?j.last_attempt_at===clock+1&&j.hold_reason===UNRESOLVED:j.last_attempt_at===clock&&j.hold_reason==='synthetic_concurrent_hold');
 }
 await fresh();let changed=0;
 hooks.afterRead=async sql=>{if(changed||!sql.includes(' AS references_clear'))return;changed++;await setupWrite('UPDATE privacy_serving_jobs SET last_attempt_at=last_attempt_at+1 WHERE operation_id=?',OP);};
 const readRace=await cron();hooks={};
 check('token changed before the original job read is refused before any reservation',changed===1&&!!readRace.error&&readRace.sql.filter(s=>s.includes(READ)).length===1&&!readRace.sql.some(s=>s.includes(GUARD))&&noTerminal());
 check('pre-read race retains the concurrent token and unresolved marker',job().last_attempt_at===clock+1&&job().hold_reason===UNRESOLVED&&!!raw('SELECT 1 FROM site_users WHERE discord_id=?',ID));
}

async function sourceIdentity(){
 const p=await fresh();
 await rejectsWithoutWork('raw admitted environment outside an original active entry cannot claim',()=>identity.claimOriginalErasureAttempt(env(),p,null));
 await originalServingWork(env(),async e=>{
  await rejectsWithoutWork('raw admitted environment cannot substitute the active original tracked database',()=>identity.claimOriginalErasureAttempt(env(),p,null));
  const before=attempts,network=calls.length,out=await eraser.continueServingErasure(e,p);
  check('ON direct continuation without acknowledged claim holds before any I/O',out.state==='held'&&out.reason==='erasure_attempt_identity_required'&&attempts===before&&calls.length===network);
  await rejectsWithoutWork('copied empty handle cannot issue a claim',()=>eraser.continueServingErasure(e,p,Object.freeze({})));
  const cap=await identity.claimOriginalErasureAttempt(e,p,null),facts=identity.originalErasureAttemptFacts(cap,e,p);
  check('source-issued facts retain exact original proof, birth, generation, prior and claimed token',facts.previous===null&&facts.claimed===clock&&facts.proof.operationId===p.operationId&&facts.proof.subjectGeneration===p.subjectGeneration&&facts.proof.accountIncarnation===p.accountIncarnation&&facts.proof.requestDigest===p.requestDigest);
  await rejectsWithoutWork('another environment object cannot consume the claim',()=>eraser.continueServingErasure({...e},p,cap));
  await rejectsWithoutWork('another generation cannot consume the claim',()=>eraser.continueServingErasure(e,{...p,subjectGeneration:'f'.repeat(32)},cap));
  await rejectsWithoutWork('another original birth cannot consume the claim',()=>eraser.continueServingErasure(e,{...p,accountIncarnation:'f'.repeat(32)},cap));
  const done=await eraser.continueServingErasure(e,p,cap);
  check('the original claim still completes after rejected foreign consumers',done.state==='complete');
  await rejectsWithoutWork('a consumed claim cannot start a second continuation',()=>eraser.continueServingErasure(e,p,cap));
 });
}

async function tokens(){
 let p=await fresh();
 await originalServingWork(env(),async e=>{
  const first=await identity.claimOriginalErasureAttempt(e,p,null),f=identity.originalErasureAttemptFacts(first,e,p);
  // Fixed test race: a known pre-terminal hold permits a same-second second claim. No terminal dispatch occurred.
  await setupWrite("UPDATE privacy_serving_jobs SET state='held',hold_reason='synthetic_known_preterminal_hold' WHERE operation_id=?",OP);
  const second=await identity.claimOriginalErasureAttempt(e,p,f.claimed),s=identity.originalErasureAttemptFacts(second,e,p);
  check('same-second claims strictly increase without using elapsed time as authority',s.previous===f.claimed&&s.claimed===f.claimed+1&&clock===f.claimed&&job().last_attempt_at===s.claimed);
  const stale=await identity.claimOriginalErasureAttempt(e,p,f.claimed);
  check('stale consuming CAS cannot recapture the newer unresolved attempt',stale===null&&job().last_attempt_at===s.claimed&&job().hold_reason===UNRESOLVED);
 });
 check('token-only claims do not mint a terminal reservation or completion',noTerminal());
 p=await fresh();await setupWrite("UPDATE privacy_serving_jobs SET last_attempt_at=?,hold_reason='synthetic_known_preterminal_hold' WHERE operation_id=?",MAX-1,OP);
 await originalServingWork(env(),async e=>{
  const cap=await identity.claimOriginalErasureAttempt(e,p,MAX-1);
  check('last permitted token is acknowledged exactly',identity.originalErasureAttemptFacts(cap,e,p).claimed===MAX&&job().last_attempt_at===MAX);
  await setupWrite("UPDATE privacy_serving_jobs SET hold_reason='synthetic_known_preterminal_hold' WHERE operation_id=?",OP);
  const before=JSON.stringify(job()),overflow=await identity.claimOriginalErasureAttempt(e,p,MAX);
  check('overflow refuses with the original job unchanged',overflow===null&&JSON.stringify(job())===before&&noTerminal());
 });
}

async function lostAndInvalid(){
 await fresh();let losses=0;
 hooks.afterBatch=async plan=>{if(!losses&&plan.some(s=>s._sql.includes(CLAIM)&&s._sql.includes('MAX('))){losses++;throw Error('synthetic original committed claim reply lost');}};
 const lost=await cron();hooks={};const oldUnknown=unknown().map(x=>x.ticket_id);
 check('lost original claim ACK issues no continuation or terminal reservation',losses===1&&!!lost.error&&job().hold_reason===UNRESOLVED&&job().last_attempt_at===clock&&lost.network===0&&!lost.sql.some(s=>s.includes(READ))&&noTerminal()&&oldUnknown.length>0);
 clock+=121;const later=await cron();
 check('later ticks cannot turn the lost claim reply into a retry',later.value?.attempted===0&&!later.error&&!later.sql.some(s=>s.includes(CLAIM))&&noTerminal()&&oldUnknown.every(id=>unknown().some(x=>x.ticket_id===id)));
 for(const [fence,discipline] of [['TRUE','true'],['true','false'],['true',undefined]]){
  await fresh(fence);if(discipline===undefined)delete currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE;else currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE=discipline;
  const before=JSON.stringify(job()),out=await cron();
  check('invalid flag/dependency '+String(fence)+'/'+String(discipline)+' leaves jobs untouched',out.value?.attempted===0&&!out.error&&!out.sql.some(s=>s.includes('privacy_serving_jobs'))&&JSON.stringify(job())===before&&noTerminal());
 }
 const plain={...env()};delete plain.PRIVACY_RECOVERY_FLOOR;
 check('ON without complete configured serving admission is invalid',identity.erasureAttemptFenceMode(plain)===null);
 await fresh();let eRef=null,mutations=0;
 hooks.afterBatch=async plan=>{if(!mutations&&plan.some(s=>s._sql.includes(CLAIM)&&s._sql.includes('MAX('))){mutations++;eRef.PRIVACY_ERASURE_ATTEMPT_FENCE='false';}};
 const altered=await observe(e=>{eRef=e;return jobs.runServingErasureJob(e);});hooks={};
 check('environment mutation after committed claim cannot issue a capability',mutations===1&&!!altered.error&&noTerminal()&&job().hold_reason===UNRESOLVED&&altered.network===0);
}

async function site(){
 reset();flags('true');await ready();const cookie=await originalCookie(),pending=[],sql=[],before=hooks.beforeStatement;
 hooks.beforeStatement=s=>{sql.push(s);before?.(s);};
 const request=new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({operationId:OP})});
 const response=await load('index').default.fetch(request,{...env(),DB:native},{waitUntil(work){pending.push(work);}});
 for(const work of pending)await work;hooks.beforeStatement=before;
 check('real site POST uses the same acknowledged claim and consuming guard',response.status===202&&pending.length>0&&job().state==='complete'&&sql.filter(s=>s.includes(CLAIM)&&s.includes('MAX(')).length===1&&sql.filter(s=>s.includes(GUARD)&&s.includes('j.last_attempt_at=?8')).length===1);
 check('site path retains one committed original reservation and settled custody',count('recovery_suppression_journal')===1&&doDb.prepare('SELECT state FROM recovery_suppression_journal').get().state==='committed'&&unknown().length===0);
}

(async()=>{
 for(const [name,run] of [['OFF/positive',offAndPositive],['guard races',consumingRaces],['source identity',sourceIdentity],['tokens',tokens],['lost/invalid',lostAndInvalid],['site',site]]){
  try{await run();}catch(e){console.error('case '+name+' stopped:',e.stack);check(name+' completed',false);}finally{hooks={};}
 }
 check('loaded application sources remain unchanged',Array.from(pins).every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
 console.log('PRIVACY_ERASURE_ATTEMPT_IDENTITY_SUMMARY '+JSON.stringify({checks,passes,fullCIQualified:false,recoveryImplemented:false}));
 if(checks!==passes)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{db?.close();doDb?.close();});
`;
const mod=new Module(__filename,module);mod.filename=__filename;mod.paths=module.paths;
mod._compile(original.slice(0,original.indexOf(marker))+cases,__filename);

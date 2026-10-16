// Item 11 Phase 1: default-off PRIVACY_ERASURE_ATTEMPT_DISCIPLINE through the actual serving harness (original
// signed admission, original serving entry, Native SQLite and the genuine recovery floor). Absent or 'false' keeps
// the legacy SQL and request sequence; 'true' adds the shared post-scrub pre-check and the durable claim marker;
// any other value holds. The consuming in-batch guard stays the authority; nothing here replaces it.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=fs.readFileSync(path.join(__dirname,'privacy_serving_integration_test.cjs'),'utf8'),marker='(async()=>{';
if(original.split(marker).length!==2)throw Error('serving integration fixture changed');
const cases=String.raw`
const beta=load('beta-reset-policy'),cursor=load('beta-reset-scan'),retention=load('privacy-retention'),jobs=load('privacy-serving-jobs');
const {RecoveryFloorHeld}=load('privacy-recovery-held'),assert=require('node:assert/strict'),hash=v=>require('node:crypto').createHash('sha256').update(v).digest('hex');
const MARKER='attempt_unresolved',KNOWN='ambiguous_personal_reference',INVALID='erasure_attempt_discipline_invalid';
const FINALLY_MARK="UPDATE privacy_serving_jobs SET state='held',hold_reason=COALESCE(?5,hold_reason)";
const LEGACY_FINALLY_MARK="UPDATE privacy_serving_jobs SET state='held',hold_reason=?5";
const CLAIM_MARK='UPDATE privacy_serving_jobs SET last_attempt_at=';
const CRON_SELECT_MARK="FROM privacy_serving_jobs WHERE state IN('waiting_role','held')";
const SITE_SELECT_MARK="FROM privacy_serving_jobs WHERE operation_id=?1 AND state IN('waiting_role','held') AND retain_until>";
const POST_SCRUB_MARK="site_applications a WHERE a.discord_id<>?2 AND CASE WHEN NOT json_valid";
const TICKET_BOUND=256;
let currentCase='setup';const caseTally={},shapeTable=[],tickTable=[],info=[];
function caseCheck(label,value,details){const before=passes;check(currentCase+': '+label,!!value);const t=caseTally[currentCase]??(caseTally[currentCase]={checks:0,passes:0,failed:[]});t.checks++;if(passes>before)t.passes++;else{t.failed.push(label);if(details!==undefined)console.log('OBSERVED '+JSON.stringify(details));}}
function discipline(value){if(value===undefined)delete currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE;else currentEnv.PRIVACY_ERASURE_ATTEMPT_DISCIPLINE=value;}
function fresh(value){const t=reset();discipline(value);return t;}
const jobRow=()=>raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP);
const floorHeld=e=>e instanceof RecoveryFloorHeld&&e.message==='recovery_floor_held';
const errorFact=e=>e?{name:e.constructor?.name??null,message:String(e.message),floorHeld:floorHeld(e)}:null;
const unresolvedTickets=c=>c.tickets.filter(x=>x.state==='unknown'||x.state==='running');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function doCount(name){return doDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)?doDb.prepare('SELECT COUNT(*) n FROM '+name).get().n:0;}
// The lifecycle test's custody() snapshot (same tables and non-mutation proof); logged as a compact digest line.
function custody(label){
 const counter=()=>({native:attempts,http:calls.length,controlSQL:fixtureControlStatements,controlHTTP:fixtureControlRequests,nativeChanges:db.prepare('SELECT total_changes() n').get().n,controlChanges:doDb.prepare('SELECT total_changes() n').get().n});
 const before=counter(),tables=new Set(doDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const select=(name,where='',bindings=[])=>tables.has(name)?doDb.prepare('SELECT * FROM '+name+where).all(...bindings):[];
 const tickets=select('recovery_serving_ticket',' ORDER BY ticket_id');assert.ok(tickets.length<=TICKET_BOUND,'bounded original fixture ticket snapshot');
 const tupleSQL=load('privacy-serving-recovery-gate').SERVING_TICKET_TUPLE_SQL;
 const tuples=doDb.prepare('SELECT ticket_id,'+tupleSQL+' AS tuple FROM recovery_serving_ticket ORDER BY ticket_id').all().map(r=>({ticket_id:r.ticket_id,tuple:r.tuple,sha256:hash(r.tuple)}));
 const out={label,clock,account:raw('SELECT * FROM site_users WHERE discord_id=?',ID),subject:raw('SELECT * FROM privacy_subjects WHERE subject_id=?',ID),job:raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP),cursor:raw('SELECT * FROM site_settings WHERE key=?',cursor.BETA_RESET_SCAN_KEY),replayCount:raw('SELECT COUNT(*) n FROM privacy_restore_replay').n,journal:select('recovery_suppression_journal',' WHERE operation_id=?',[OP]),companion:select('recovery_suppression_companion',' WHERE operation_id=?',[OP]),tickets,tuples,floor:select('recovery_floor'),gate:select('recovery_serving_gate')};
 out.journalAll=select('recovery_suppression_journal').length;out.companionAll=select('recovery_suppression_companion').length;
 assert.deepEqual(counter(),before,'custody reads do not mutate SQLite, Native counters, control calls, or provider calls');
 out.observationNonmutating=true;
 console.log('DISCIPLINE_CUSTODY '+JSON.stringify({label,clock,job:out.job&&{state:out.job.state,hold_reason:out.job.hold_reason,last_attempt_at:out.job.last_attempt_at,completed_at:out.job.completed_at},account:!!out.account,subject:out.subject?.state??null,journal:out.journal.map(j=>j.state),companion:out.companion.length,journalAll:out.journalAll,companionAll:out.companionAll,tickets:out.tickets.length,unresolvedTickets:unresolvedTickets(out).length,replayCount:out.replayCount,sha256:hash(JSON.stringify(out))}));
 return out;
}
function jobKind(sql){if(sql.includes(SITE_SELECT_MARK))return 'site-select';if(sql.includes(CRON_SELECT_MARK))return 'cron-select';if(sql.includes(CLAIM_MARK))return 'claim';if(sql.includes(FINALLY_MARK))return 'finally';if(sql.includes(LEGACY_FINALLY_MARK))return 'legacy-finally';return null;}
const jobStatements=list=>list.map(sql=>({kind:jobKind(sql),sql})).filter(x=>x.kind);
// SQL texts embed the run's own original birth facts (generation, digest, account incarnation); compare modulo those values.
function normalizer(job){const pairs=[[job?.subject_generation,'<generation>'],[job?.request_digest,'<digest>'],[job?.original_account_incarnation,'<incarnation>']].filter(([v])=>typeof v==='string'&&v.length>=16);return sql=>pairs.reduce((text,[v,n])=>text.split(v).join(n),sql);}
const normalized=(o,job)=>o.statements.map(normalizer(job));
function firstDifference(x,y){for(let i=0;i<Math.max(x.length,y.length);i++)if(x[i]!==y[i]){const a=x[i]??'',b=y[i]??'';let j=0;while(j<a.length&&a[j]===b[j])j++;return{index:i,at:j,left:a.slice(Math.max(0,j-80),j+80),right:b.slice(Math.max(0,j-80),j+80)};}return null;}
function legacyDelta(disciplined,dJob,legacy,lJob){const x=normalized(disciplined,dJob),y=normalized(legacy,lJob),diffs=[];for(let i=0;i<Math.max(x.length,y.length);i++)if(x[i]!==y[i])diffs.push(jobKind(x[i]??'')??((x[i]??'').includes(POST_SCRUB_MARK)?'shared-predicate':'other'));return{sameLength:x.length===y.length,diffs,first:firstDifference(x,y)};}
function boundParams(o,mark){for(const g of o.groups)for(const s of g)if(s.sql.includes(mark))return s.params;return null;}
// Observation around one original serving entry: preflight/atomic predicate capture exactly as the lifecycle test does,
// plus every attempted Native statement and every Native batch plan (with its bound values).
async function observed(label,work,e=env(),request){
 const before=attempts,net=calls.length,controlSQL=fixtureControlStatements,controlHTTP=fixtureControlRequests;
 const preflight=[],atomic=[],statements=[],groups=[];
 const beforeStatement=hooks.beforeStatement,afterRead=hooks.afterRead,beforeBatch=hooks.beforeBatch;
 hooks.beforeStatement=sql=>{statements.push(sql);if(sql.includes('privacy_completion_refused')){const start=sql.lastIndexOf('AND NOT('),end=sql.indexOf("THEN 1 ELSE json_extract('privacy_completion_refused'");assert.ok(start>=0&&end>start);atomic.push(sql.slice(start+'AND NOT('.length,end).trimEnd().slice(0,-1));}return beforeStatement?.(sql);};
 hooks.beforeBatch=async plan=>{groups.push(plan.map(s=>({sql:s._sql,params:Array.from(s.params??[])})));await beforeBatch?.(plan);};
 hooks.afterRead=async(sql,row)=>{if(sql.includes(' AS references_clear')){const m='AS custody_clear,CASE WHEN NOT(',start=sql.indexOf(m),end=sql.lastIndexOf(') THEN 1 ELSE 0 END AS references_clear');assert.ok(start>=0&&end>start);const d=row&&Object.getOwnPropertyDescriptor(row,'references_clear');preflight.push({sql:sql.slice(start+m.length,end),value:d&&Object.hasOwn(d,'value')?d.value:null});}await afterRead?.(sql,row);};
 let value=null,error=null;
 try{value=await originalServingWork(e,work,request);}catch(caught){error=caught;}finally{hooks.beforeStatement=beforeStatement;hooks.afterRead=afterRead;hooks.beforeBatch=beforeBatch;}
 const predicateIdentical=preflight.length>=1&&preflight.every(p=>p.sql===preflight[0].sql)&&atomic.every(sql=>sql===preflight[0].sql);
 const out={label,value,error,preflight,atomic,predicateIdentical,statements,groups,physical:attempts-before,http:calls.length-net,controlSQL:fixtureControlStatements-controlSQL,controlHTTP:fixtureControlRequests-controlHTTP};
 console.log('DISCIPLINE_OBSERVATION '+JSON.stringify({label,clock,physical:out.physical,http:out.http,controlSQL:out.controlSQL,controlHTTP:out.controlHTTP,returned:value&&typeof value==='object'?{state:value.state,reason:value.reason,attempted:value.attempted,completed:value.completed,held:value.held}:value,thrown:errorFact(error),preflight:preflight.map(p=>({value:p.value,bytes:p.sql.length,sha256:hash(p.sql),postScrub:p.sql.split(POST_SCRUB_MARK).length-1})),atomicGuards:atomic.length,predicateIdentical,jobSQL:jobStatements(statements).map(s=>s.kind)}));
 return out;
}
const cron=label=>observed(label,e=>jobs.runServingErasureJob(e));
// The real POST /api/me/erasure through the deployed Worker entry; its deferred continuation is awaited like waitUntil.
async function sitePost(cookie,label){
 await ready();const request=new Request('https://guild.example/api/me/erasure',{method:'POST',headers:{Cookie:cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({operationId:OP})});
 const pending=[],statements=[],before=attempts,net=calls.length,previous=hooks.beforeStatement,preflight=[],previousRead=hooks.afterRead;
 hooks.beforeStatement=sql=>{statements.push(sql);return previous?.(sql);};
 hooks.afterRead=async(sql,row)=>{if(sql.includes(' AS references_clear')){const d=row&&Object.getOwnPropertyDescriptor(row,'references_clear');preflight.push(d&&Object.hasOwn(d,'value')?d.value:null);}await previousRead?.(sql,row);};
 let response=null;const settled=[];
 try{response=await load('index').default.fetch(request,{...env(),DB:native},{waitUntil(work){pending.push(work);}});for(const work of pending){try{settled.push({ok:true,value:await work});}catch(error){settled.push({ok:false,error:errorFact(error)});}}}
 finally{hooks.beforeStatement=previous;hooks.afterRead=previousRead;}
 const body=await response.clone().json().catch(()=>null);
 const out={status:response.status,body,pending:pending.length,settled,statements,preflight,physical:attempts-before,http:calls.length-net};
 console.log('DISCIPLINE_SITE_POST '+JSON.stringify({label,clock,status:out.status,pending:out.pending,settled:settled.map(s=>s.ok?'ok':s.error),physical:out.physical,http:out.http,preflight,jobSQL:jobStatements(statements).map(s=>s.kind)}));
 return out;
}
const scan=t=>JSON.stringify({version:1,epoch:beta.BETA_RESET_EPOCH,digest:'a'.repeat(64),pass:1,after:ID,lease:'',leaseUntil:0,passStartedAt:t-1000,scanned:1000,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null});
const seedCursor=t=>db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)').run(cursor.BETA_RESET_SCAN_KEY,scan(t),t-300,'system:beta-reset');
async function cleanupCursor(){const schedule=retention.captureServingRetentionSchedule(),network=calls.length,statementsBefore=attempts;const retained=await originalServingWork(env(),e=>retention.sweepServingRetention(e,schedule));console.log('DISCIPLINE_RETENTION '+JSON.stringify({clock,capturedPhase:Math.floor(clock/900)%2===0?'general':'beta',physical:attempts-statementsBefore,http:calls.length-network,changes:retained}));return{network,retained};}
function entryTree(freshTickets){const roots=freshTickets.filter(x=>x.parent_ticket_id===null),ids=new Set(freshTickets.map(x=>x.ticket_id));if(roots.length!==1||roots[0].purpose!=='fetch')return false;
 return freshTickets.every(x=>{if(x.state!=='settled')return false;let p=x;const seen=new Set();while(p.parent_ticket_id!==null){if(seen.has(p.ticket_id)||!ids.has(p.parent_ticket_id))return false;seen.add(p.ticket_id);p=freshTickets.find(y=>y.ticket_id===p.parent_ticket_id);}return p.ticket_id===roots[0].ticket_id;});}
// Later cron ticks against a job that must not be selected again; each tick is one original serving entry.
async function quietTicks(prefix,count,step,reference){
 const rows=[],callsBefore=calls.length;
 for(let i=1;i<=count;i++){
  clock+=step;const before=custody(prefix+' tick '+i+' before'),o=await cron(prefix+' tick '+i),after=custody(prefix+' tick '+i+' after');
  const freshTickets=after.tickets.filter(x=>!before.tickets.some(y=>y.ticket_id===x.ticket_id));
  rows.push({tick:i,clock,attempted:o.value?.attempted??null,thrown:errorFact(o.error),claims:jobStatements(o.statements).filter(s=>s.kind==='claim').length,selections:jobStatements(o.statements).filter(s=>s.kind==='cron-select').length,preflight:o.preflight.length,http:o.http,
   totalTickets:after.tickets.length,newTickets:freshTickets.length,newTicketPurposes:freshTickets.map(x=>(x.parent_ticket_id===null?'root:':'child:')+x.purpose+':'+x.state).sort(),newTicketsAreOwnSettledEntryTree:entryTree(freshTickets),preExistingTicketsUnchanged:before.tickets.every(x=>same(x,after.tickets.find(y=>y.ticket_id===x.ticket_id))),
   unresolvedTickets:unresolvedTickets(after).length,journalSame:same(after.journal,reference.journal),companionSame:same(after.companion,reference.companion),journalAll:after.journalAll,companionAll:after.companionAll,jobSame:same(after.job,reference.job),hold_reason:after.job?.hold_reason??null});
 }
 return{rows,providerDelta:calls.length-callsBefore};
}

async function case1(){
 currentCase='1 flag absent keeps legacy SQL';const runs={};
 for(const mode of [undefined,'false']){
  const tag=mode===undefined?'absent':'false',r={};
  fresh(mode);let proof=await admission();r.aJob=jobRow();r.a=await observed('1 '+tag+' direct continuation',e=>eraser.continueServingErasure(e,proof));
  let t=fresh(mode);seedCursor(t);proof=await admission();r.b=await cron('1 '+tag+' cron known hold');r.bJob=jobRow();
  await cleanupCursor();clock+=121;r.c=await cron('1 '+tag+' cron completion after cleanup');r.cJob=jobRow();r.cCustody=custody('1 '+tag+' after cron completion');
  fresh(mode);const cookie=await originalCookie();r.d=await sitePost(cookie,'1 '+tag+' site continuation');r.dJob=jobRow();r.dCustody=custody('1 '+tag+' after site continuation');
  runs[tag]=r;
  const a=r.a,b=r.b,c=r.c,d=r.d,kinds=o=>jobStatements(o.statements).map(s=>s.kind).join(',');
  caseCheck(tag+': captured preflight predicate equals captured atomic predicate',a.value?.state==='complete'&&a.preflight.length===1&&a.preflight[0].value===1&&a.atomic.length===1&&a.predicateIdentical&&a.preflight[0].sql===a.atomic[0],{state:a.value?.state,preflight:a.preflight.length,atomic:a.atomic.length});
  caseCheck(tag+': predicate carries no post-scrub clause',[...a.preflight.map(p=>p.sql),...a.atomic].every(sql=>!sql.includes(POST_SCRUB_MARK)&&!sql.includes('WITH RECURSIVE')&&!sql.includes('mention_scrub')));
  caseCheck(tag+': cron known hold issues legacy selection, claim and finally',b.value?.attempted===1&&b.value.held===1&&kinds(b)==='cron-select,claim,legacy-finally'&&r.bJob.state==='held'&&r.bJob.hold_reason===KNOWN,{returned:b.value,kinds:kinds(b),job:r.bJob});
  caseCheck(tag+': cron completion after cleanup issues legacy selection and claim only',c.value?.completed===1&&kinds(c)==='cron-select,claim'&&r.cJob.state==='complete'&&r.cCustody.journal.length===1&&r.cCustody.journal[0].state==='committed',{returned:c.value,kinds:kinds(c)});
  const jobSQL=[b,c].flatMap(o=>jobStatements(o.statements));
  caseCheck(tag+': selection/claim/finally SQL contains no attempt_unresolved and no RETURNING',jobSQL.length===5&&jobSQL.every(s=>!s.sql.includes(MARKER)&&!/RETURNING/i.test(s.sql)));
  caseCheck(tag+': no issued statement mentions the marker or the post-scrub clause',[a,b,c,d].every(o=>o.statements.every(sql=>!sql.includes(MARKER)&&!sql.includes(POST_SCRUB_MARK))));
  caseCheck(tag+': site POST keeps the legacy unclaimed continuation',d.status===202&&d.settled.every(s=>s.ok)&&jobStatements(d.statements).length===0&&r.dJob.state==='complete'&&r.dJob.last_attempt_at===null&&r.dCustody.journal.length===1,{status:d.status,kinds:kinds(d),job:r.dJob});
 }
 const job={a:'aJob',b:'bJob',c:'bJob',d:'dJob'};
 for(const step of ['a','b','c','d']){const x=normalized(runs.absent[step],runs.absent[job[step]]),y=normalized(runs.false[step],runs.false[job[step]]);
  caseCheck("absent and 'false' issue the byte-identical statement sequence ("+step+', modulo the run birth values)',x.length>0&&same(x,y)&&runs.absent[step].physical===runs.false[step].physical,{absent:x.length,false:y.length,first:firstDifference(x,y)});}
 return runs;
}

const legacyShapes=[
 ['non-array object',{references:{kind:'discord',key:ID,label:'Target'}}],
 ['non-array string',{references:ID}],
 ['null plus target text',{references:null,text:ID}],
 ['number plus target text',{references:7,text:ID}],
 ['boolean plus target text',{references:false,text:ID}],
 ['array duplicate key','{"references":[{"kind":"discord","key":"'+ID+'","key":"'+OTHER+'"}]}'],
 ['array duplicate kind','{"references":[{"kind":"discord","kind":"name","key":"'+ID+'"}]}'],
 ['array target primitive',{references:[null,ID,3]}],
 ['array nested target',{references:[{kind:'discord',key:{account:ID}}]}],
 ['array valid plus target free text',{references:[{kind:'discord',key:ID}],text:'Account '+ID}],
 ['array empty plus target free text',{references:[],text:'Account '+ID}],
 ['duplicate root references','{"references":[],"references":[{"kind":"discord","key":"'+ID+'"}]}'],
 ['invalid JSON','broken '+ID],
 ['valid structured primitives plus other reference',{references:[null,7,{kind:'discord',key:ID,label:'Target'},{kind:'discord',key:OTHER,label:'Other'}],text:'Other owner text'}],
 ['two exact discord references',{references:[{kind:'discord',key:ID},{kind:'discord',key:OTHER}]}],
 ['subject own malformed document',{references:{key:ID},text:ID},ID],
 ['single exact discord reference',{references:[{kind:'discord',key:ID}]}],
 ['single exact discord reference plus target text',{references:[{kind:'discord',key:ID}],text:ID}],
].map(([label,answers,owner])=>({label,source:'legacy-review',owner:owner??OTHER,text:typeof answers==='string'?answers:JSON.stringify(answers)}));
// Additional shapes for the character half of the ordered scrub (the legacy review fixtures have no name references).
const extraShapes=[
 {label:'owned character reference keyed by the subject ID',source:'extra',owner:OTHER,character:ID,text:JSON.stringify({references:[{kind:'name',key:ID}]})},
 {label:'owned character then exact discord reference (ordered scrubs)',source:'extra',owner:OTHER,character:ID,text:JSON.stringify({references:[{kind:'name',key:ID},{kind:'discord',key:ID},{kind:'discord',key:OTHER}],text:'Other owner text'})},
 {label:'unowned character reference keyed by the subject ID',source:'extra',owner:OTHER,text:JSON.stringify({references:[{kind:'name',key:ID}]})},
];
async function runShape(shape,mode){
 const t=fresh(mode),tag=mode===undefined?'absent':mode;
 db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?,?,?,'submitted',?,?)").run(shape.owner,'member',shape.text,t,t);
 if(shape.character){await setupWrite('INSERT INTO members(discord_id,username)VALUES(?,?)',ID,'Synthetic shape member');await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at,source,guid)VALUES(?,?,?,'member',?,'fixture',?)",shape.character,'Shape Fixture',ID,t-40,'Player-0-00000001');}
 const proof=await admission(),before=custody('2 '+shape.label+' '+tag+' before');
 const o=await observed('2 '+shape.label+' '+tag,e=>eraser.continueServingErasure(e,proof)),after=custody('2 '+shape.label+' '+tag+' after');
 const guardAttempted=o.statements.some(s=>s.includes('privacy_ambiguous_reference_held')),terminalAttempted=o.statements.some(s=>s.includes('privacy_terminal_unconfirmed'));
 const outcome=o.value?.state==='complete'?'complete':o.value?.state==='held'?'held:'+o.value.reason:o.error?(floorHeld(o.error)?'floor_held':'thrown:'+o.error.message):'unknown:'+(o.value?.reason??null);
 const inBatchRefusal=outcome==='floor_held'&&o.atomic.length===1&&guardAttempted&&!terminalAttempted;
 return{o,before,after,outcome,inBatchRefusal,doc:raw('SELECT answers FROM site_applications WHERE discord_id=?',shape.owner)?.answers??null};
}
async function case2(){
 currentCase='2 flag on exact pre-check';
 for(const shape of [...legacyShapes,...extraShapes]){
  const legacy=await runShape(shape,undefined),disc=await runShape(shape,'true');
  const legacyClass=legacy.outcome==='complete'?'completes':legacy.inBatchRefusal?'in-batch guard refusal (unknown custody)':legacy.outcome==='held:'+KNOWN&&legacy.o.preflight[0]?.value===0?'legacy preflight known hold':'other:'+legacy.outcome;
  const d=disc.o,a=disc.after,row={shape:shape.label,source:shape.source,legacy:{class:legacyClass,outcome:legacy.outcome,preflight:legacy.o.preflight.map(p=>p.value),atomic:legacy.o.atomic.length,journal:legacy.after.journal.map(j=>j.state),unresolvedTickets:unresolvedTickets(legacy.after).length},
   disciplined:{outcome:disc.outcome,preflight:d.preflight.map(p=>p.value),postScrubClauses:d.preflight.map(p=>p.sql.split(POST_SCRUB_MARK).length-1),atomic:d.atomic.length,predicateIdentical:d.predicateIdentical,journal:a.journal.map(j=>j.state),companion:a.companion.length,unresolvedTickets:unresolvedTickets(a).length}};
  let pass;
  if(legacyClass==='completes'){row.expectation='still completes';pass=disc.outcome==='complete'&&d.preflight.length===1&&d.preflight[0].value===1&&d.atomic.length===1&&d.predicateIdentical&&a.journal.length===1&&a.journal[0].state==='committed'&&unresolvedTickets(a).length===0;}
  else{row.expectation='known held '+KNOWN+' before any terminal custody';pass=disc.outcome==='held:'+KNOWN&&d.value.state==='held'&&d.preflight.length===1&&d.preflight[0].value===0&&d.atomic.length===0&&a.journal.length===0&&a.companion.length===0&&a.journalAll===0&&unresolvedTickets(a).length===0&&disc.doc===shape.text&&!!a.account&&same(a.job,disc.before.job)&&a.replayCount===0;}
  pass=pass&&d.preflight.every(p=>p.sql.split(POST_SCRUB_MARK).length-1===1);
  row.pass=!!pass;shapeTable.push(row);
  caseCheck('shape "'+shape.label+'" ('+legacyClass+') '+row.expectation,pass,row);
 }
 const classes=shapeTable.reduce((m,r)=>(m[r.legacy.class]=(m[r.legacy.class]??0)+1,m),{});
 console.log('DISCIPLINE_SHAPE_CLASSES '+JSON.stringify(classes));
 caseCheck('every legacy-review shape was driven through the real continuation in both modes',shapeTable.filter(r=>r.source==='legacy-review').length===legacyShapes.length&&legacyShapes.length===18);
 caseCheck('the legacy fixture set includes shapes that today reach the in-batch guard as unknown custody',(classes['in-batch guard refusal (unknown custody)']??0)>0);
 caseCheck('no legacy-review shape falls outside the three observed classes',shapeTable.every(r=>!r.legacy.class.startsWith('other:')),classes);
}

async function case3(){
 currentCase='3 flag on cron race';
 const t=fresh('true');await admission();const baseline=custody('3 before cron race');let raced=0;
 hooks.afterRead=async sql=>{if(raced===0&&sql.includes(' AS references_clear')){raced++;await setupWrite('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',cursor.BETA_RESET_SCAN_KEY,scan(t),t-300,'system:beta-reset');}};
 const race=await cron('3 cron after-preflight reference race');hooks.afterRead=null;
 const afterRace=custody('3 after cron race'),claimParams=boundParams(race,CLAIM_MARK),finallyParams=boundParams(race,FINALLY_MARK);
 console.log('DISCIPLINE_RACE '+JSON.stringify({returned:race.value,thrown:errorFact(race.error),claimParams,finallyParams,job:afterRace.job}));
 caseCheck('after-preflight write reaches the unchanged atomic guard (shared predicate)',raced===1&&race.preflight.length===1&&race.preflight[0].value===1&&race.atomic.length===1&&race.predicateIdentical);
 caseCheck('outcome is unknown/held, not complete',(floorHeld(race.error)||race.value?.held===1)&&race.value?.completed!==1&&afterRace.job.state!=='complete');
 caseCheck('job keeps the attempt_unresolved marker',afterRace.job.hold_reason===MARKER&&afterRace.job.last_attempt_at===t,afterRace.job);
 caseCheck('race baseline is the actual reserved journal with unknown original custody',afterRace.journal.length===1&&afterRace.journal[0].state==='reserved'&&unresolvedTickets(afterRace).length>0&&baseline.journal.length===0);
 const callsAfterRace=calls.length,ticks=await quietTicks('3',12,600,afterRace),rows=ticks.rows,last=custody('3 after twelve ticks');
 tickTable.push(...rows.map(r=>({case:'3',...r})));
 caseCheck('12 ticks x 600 s: attempted stays 0, no claim and no preflight',rows.length===12&&rows.every(r=>r.attempted===0&&!r.thrown&&r.claims===0&&r.preflight===0));
 caseCheck('provider call count stays exactly constant',ticks.providerDelta===0&&calls.length===callsAfterRace&&rows.every(r=>r.http===0));
 caseCheck('journal and companion rows stay exactly constant',rows.every(r=>r.journalSame&&r.companionSame&&r.journalAll===afterRace.journalAll&&r.companionAll===afterRace.companionAll));
 caseCheck('job row (marker) stays byte-identical',rows.every(r=>r.jobSame)&&same(last.job,afterRace.job));
 caseCheck('unknown/running ticket count stays exactly constant and every earlier ticket row is unchanged',rows.every(r=>r.unresolvedTickets===unresolvedTickets(afterRace).length&&r.preExistingTicketsUnchanged));
 const perTick=rows.map(r=>r.newTickets);
 caseCheck('the only new ticket rows are each tick\'s own settled entry tree, with a constant per-tick footprint',rows.every(r=>r.newTicketsAreOwnSettledEntryTree)&&perTick.every(n=>n===perTick[0]),{perTick});
 info.push({case:'3',note:'every original serving entry claims its own settled root ticket and settled d1 children, so the TOTAL ticket row count cannot stay constant across entries; asserted instead: no unknown/running growth, earlier rows byte-identical, new rows only the own settled entry tree of each tick',totalTicketsAfterRace:afterRace.tickets.length,totalTicketsAfterTicks:last.tickets.length,perTickEntryTickets:perTick[0],perTickPurposes:rows[0]?.newTicketPurposes??null});
}

async function case4(){
 currentCase='4 flag on lost finally keeps marker';
 // 4a: an explicit known hold whose finally write never lands.
 let t=fresh('true');seedCursor(t);await admission();let injected=0;const prior=hooks.beforeStatement;
 hooks.beforeStatement=sql=>{if(sql.includes(FINALLY_MARK)){injected++;throw Error('synthetic lost finally write');}return prior?.(sql);};
 const lost=await cron('4a known hold with lost finally');hooks.beforeStatement=prior;
 let c=custody('4a after lost finally');const params=boundParams(lost,FINALLY_MARK);
 console.log('DISCIPLINE_LOST_FINALLY '+JSON.stringify({injected,returned:lost.value,thrown:errorFact(lost.error),finallyParams:params,job:c.job}));
 caseCheck('4a the attempt reached an explicit known no-terminal outcome',lost.preflight.length===1&&lost.preflight[0].value===0&&lost.atomic.length===0&&(params===null||params[4]===KNOWN),{params});
 caseCheck('4a the finally write was attempted once and its failure is not swallowed',injected===1&&lost.error!==null&&lost.value===null);
 caseCheck('4a the marker stays attempt_unresolved',c.job.hold_reason===MARKER&&c.job.last_attempt_at===t&&c.journal.length===0&&c.companion.length===0,c.job);
 let ticks=await quietTicks('4a',4,600,c);tickTable.push(...ticks.rows.map(r=>({case:'4a',...r})));
 caseCheck('4a later ticks (>120 s apart) never reselect or claim the job',ticks.rows.every(r=>r.attempted===0&&r.claims===0&&r.preflight===0&&r.jobSame&&r.hold_reason===MARKER)&&ticks.providerDelta===0);
 // 4b: a generic throw inside the continuation.
 t=fresh('true');await admission();let thrown=0;const prior2=hooks.beforeStatement;
 hooks.beforeStatement=sql=>{if(sql.includes(' AS references_clear')&&thrown===0){thrown++;throw Error('synthetic generic continuation failure');}return prior2?.(sql);};
 const generic=await cron('4b generic throw inside continuation');hooks.beforeStatement=prior2;c=custody('4b after generic throw');
 caseCheck('4b a generic throw keeps the marker',thrown===1&&generic.error!==null&&c.job.hold_reason===MARKER&&c.job.last_attempt_at===t&&c.journal.length===0,{job:c.job,thrown:errorFact(generic.error),finallyParams:boundParams(generic,FINALLY_MARK)});
 ticks=await quietTicks('4b',3,600,c);tickTable.push(...ticks.rows.map(r=>({case:'4b',...r})));
 caseCheck('4b later ticks never reselect the job',ticks.rows.every(r=>r.attempted===0&&r.claims===0&&r.jobSame));
 // 4c: an unknown disposition (lost landed role DELETE) is not an explicit known hold.
 t=fresh('true');hasRole=true;loseDelete=true;await admission();
 const unknown=await cron('4c unknown role disposition');c=custody('4c after unknown disposition');const deletes=calls.filter(x=>x.startsWith('DELETE ')).length;
 caseCheck('4c an unknown disposition keeps the marker',c.job.hold_reason===MARKER&&c.job.last_attempt_at===t&&c.journal.length===0&&deletes===1,{job:c.job,returned:unknown.value,thrown:errorFact(unknown.error),finallyParams:boundParams(unknown,FINALLY_MARK)});
 ticks=await quietTicks('4c',3,600,c);tickTable.push(...ticks.rows.map(r=>({case:'4c',...r})));
 caseCheck('4c later ticks never reselect the job or repeat the provider effect',ticks.rows.every(r=>r.attempted===0&&r.claims===0&&r.jobSame)&&ticks.providerDelta===0&&calls.filter(x=>x.startsWith('DELETE ')).length===1);
 hasRole=false;loseDelete=false;
 // 4d: an explicit known hold whose finally write COMMITS but whose reply is lost after COMMIT.
 t=fresh('true');seedCursor(t);await admission();let lostReply=0;const priorBatch=hooks.afterBatch;
 hooks.afterBatch=async(stmts,out)=>{await priorBatch?.(stmts,out);if(lostReply===0&&stmts.some(s=>s._sql.includes(FINALLY_MARK))){lostReply++;throw Error('synthetic lost committed finally reply');}};
 const committedLost=await cron('4d known hold whose committed finally reply is lost');hooks.afterBatch=priorBatch;
 c=custody('4d after committed finally with lost reply');const unknown4d=unresolvedTickets(c).map(x=>x.ticket_id);
 console.log('DISCIPLINE_COMMITTED_LOST_FINALLY '+JSON.stringify({lostReply,returned:committedLost.value,thrown:errorFact(committedLost.error),job:c.job,unresolved:unknown4d}));
 caseCheck('4d the committed known reason remains although the finally reply is lost',lostReply===1&&committedLost.error!==null&&c.job.state==='held'&&c.job.hold_reason===KNOWN&&c.job.last_attempt_at===t&&c.journal.length===0&&c.companion.length===0,{job:c.job,thrown:errorFact(committedLost.error)});
 caseCheck('4d the lost finally reply leaves its own serving custody unknown rather than acknowledged',unknown4d.length>0,{unresolved:unknown4d});
 await cleanupCursor();clock+=121;
 const retried=await cron('4d retry of the same proof after cleanup'),afterRetry=custody('4d after retry');
 caseCheck('4d the committed known reason permits a later retry that completes the same proof',retried.value?.attempted===1&&retried.value.completed===1&&afterRetry.job.state==='complete'&&afterRetry.journal.length===1&&afterRetry.journal[0].state==='committed',{returned:retried.value,job:afterRetry.job});
 caseCheck('4d the earlier unknown finally custody is still unknown after the retry completes',unknown4d.every(id=>unresolvedTickets(afterRetry).some(x=>x.ticket_id===id)),{before:unknown4d,after:unresolvedTickets(afterRetry).map(x=>x.ticket_id)});
 // 4e: an unknown disposition (known=null) whose finally write COMMITS but whose reply is lost keeps the marker.
 t=fresh('true');hasRole=true;loseDelete=true;await admission();let lostReply2=0;const priorBatch2=hooks.afterBatch;
 hooks.afterBatch=async(stmts,out)=>{await priorBatch2?.(stmts,out);if(lostReply2===0&&stmts.some(s=>s._sql.includes(FINALLY_MARK))){lostReply2++;throw Error('synthetic lost committed finally reply');}};
 const unknownLost=await cron('4e unknown disposition whose committed finally reply is lost');hooks.afterBatch=priorBatch2;
 c=custody('4e after committed finally with lost reply');
 caseCheck('4e an unknown disposition keeps the marker although its committed finally reply is lost',lostReply2===1&&c.job.state==='held'&&c.job.hold_reason===MARKER&&c.job.last_attempt_at===t&&c.journal.length===0,{job:c.job,thrown:errorFact(unknownLost.error)});
 ticks=await quietTicks('4e',3,600,c);tickTable.push(...ticks.rows.map(r=>({case:'4e',...r})));
 caseCheck('4e later ticks never reselect the job or repeat the provider effect',ticks.rows.every(r=>r.attempted===0&&r.claims===0&&r.jobSame)&&ticks.providerDelta===0);
 hasRole=false;loseDelete=false;
}

async function case5(legacyRuns){
 currentCase='5 flag on known hold replaces marker and retries';
 const t=fresh('true');seedCursor(t);await admission();const job5=jobRow();
 const hold=await cron('5 cron known hold');const held=custody('5 after known hold'),params=boundParams(hold,FINALLY_MARK),claim=jobStatements(hold.statements).find(s=>s.kind==='claim');
 caseCheck('the claim writes the marker and returns the claimed second',!!claim&&claim.sql.includes("hold_reason='"+MARKER+"'")&&claim.sql.includes('RETURNING last_attempt_at AS claimed')&&claim.sql.includes("NOT IN('"+MARKER+"','independent_suppression_outcome_unknown')"));
 caseCheck('a known hold replaces the marker with its reason and creates no journal',hold.value?.attempted===1&&hold.value.held===1&&hold.preflight.length===1&&hold.preflight[0].value===0&&hold.atomic.length===0&&held.job.state==='held'&&held.job.hold_reason===KNOWN&&held.job.last_attempt_at===t&&held.journal.length===0&&held.journalAll===0&&unresolvedTickets(held).length===0&&(params===null||params[4]===KNOWN),{job:held.job,params});
 await cleanupCursor();clock+=60;const early=await cron('5 tick inside the 120 s backoff after cleanup');
 caseCheck('inside the 120 s window the cleaned job is still not reselected',early.value?.attempted===0&&jobStatements(early.statements).every(s=>s.kind!=='claim')&&same(jobRow(),held.job));
 clock+=61;
 const done=await cron('5 cron retry of the same proof after cleanup'),complete=custody('5 after retry');
 caseCheck('the next tick claims and completes the same proof',done.value?.attempted===1&&done.value.completed===1&&done.preflight.length===1&&done.preflight[0].value===1&&done.atomic.length===1&&done.predicateIdentical&&complete.job.state==='complete'&&complete.job.operation_id===OP&&complete.job.request_digest===held.job.request_digest&&complete.journal.length===1&&complete.journal[0].state==='committed'&&complete.replayCount===1&&!complete.account);
 caseCheck('the completed retry carries exactly one post-scrub clause in the shared predicate',done.preflight[0].sql.split(POST_SCRUB_MARK).length-1===1&&done.atomic[0].split(POST_SCRUB_MARK).length-1===1);
 const lh=legacyRuns.absent.b,lc=legacyRuns.absent.c;
 caseCheck('zero additional scheduled statements: known-hold tick',hold.physical===lh.physical&&hold.statements.length===lh.statements.length,{disciplined:hold.physical,legacy:lh.physical});
 caseCheck('zero additional scheduled statements: completing tick',done.physical===lc.physical&&done.statements.length===lc.statements.length,{disciplined:done.physical,legacy:lc.physical});
 const dh=legacyDelta(hold,job5,lh,legacyRuns.absent.bJob),dc=legacyDelta(done,job5,lc,legacyRuns.absent.bJob);
 console.log('DISCIPLINE_LEGACY_DELTA '+JSON.stringify({knownHoldTick:dh.diffs,completingTick:dc.diffs}));
 caseCheck('the known-hold tick differs from legacy only in selection, claim, finally and the shared predicate read',dh.sameLength&&dh.diffs.join()==='cron-select,claim,shared-predicate,finally',dh);
 caseCheck('the completing tick differs from legacy only in selection, claim and the shared predicate (preflight and atomic guard)',dc.sameLength&&dc.diffs.join()==='cron-select,claim,shared-predicate,shared-predicate',dc);
}

async function case6(){
 currentCase='6 flag on stale snapshots';
 async function nested(label,{race=false,mutate=false}={}){
  let fired=false,inner=null,snapshot=null,phase='outer',raced=0,mutated=null;const claims=[];const prevS=hooks.beforeStatement;
  hooks.beforeStatement=sql=>{if(sql.includes(CLAIM_MARK))claims.push(phase);return prevS?.(sql);};
  hooks.afterRead=async(sql,row)=>{
   if(race&&raced===0&&phase==='inner'&&sql.includes(' AS references_clear')){raced++;await setupWrite('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',cursor.BETA_RESET_SCAN_KEY,scan(clock),clock-300,'system:beta-reset');}
   if(!fired&&sql.includes(CRON_SELECT_MARK)&&row){fired=true;snapshot={...row};phase='inner';try{inner=await cron(label+' inner cron');}finally{phase='outer';}
    if(mutate){mutated=jobRow().last_attempt_at;row.last_attempt_at=mutated;}}};
  const outer=await cron(label+' outer cron');hooks.afterRead=null;hooks.beforeStatement=prevS;
  return{outer,inner,snapshot,claims,raced,mutated,outerClaimParams:(()=>{const all=[];for(const g of outer.groups)for(const s of g)if(s.sql.includes(CLAIM_MARK))all.push(s.params);return all;})()};
 }
 // 6a: genuine NULL snapshot; the inner attempt claims and ends in a known hold in the same second.
 let t=fresh('true');seedCursor(t);await admission();
 let r=await nested('6a');let c=custody('6a after');
 caseCheck('6a stale NULL snapshot cannot recapture after a same-second known hold',r.snapshot?.last_attempt_at===null&&r.inner?.value?.attempted===1&&r.inner.value.held===1&&r.outer.value?.attempted===0&&r.claims.join()==='inner,outer'&&c.job.hold_reason===KNOWN&&c.job.last_attempt_at===t&&c.journalAll===0,{claims:r.claims,outer:r.outer.value,inner:r.inner?.value,job:c.job});
 // 6b: whole-second snapshot of the earlier attempt; the inner attempt claims the new second first.
 clock+=121;const t1=clock;r=await nested('6b');c=custody('6b after');
 caseCheck('6b stale whole-second snapshot cannot recapture',r.snapshot?.last_attempt_at===t&&r.inner?.value?.attempted===1&&r.outer.value?.attempted===0&&r.claims.join()==='inner,outer'&&c.job.last_attempt_at===t1&&c.job.hold_reason===KNOWN&&c.journalAll===0,{claims:r.claims,snapshot:r.snapshot,job:c.job});
 // 6c: runServingErasureJob twice without advancing the clock.
 const again=await cron('6c second tick in the same second');
 caseCheck('6c a second tick in the same second claims nothing',again.value?.attempted===0&&jobStatements(again.statements).every(s=>s.kind!=='claim')&&same(jobRow(),c.job));
 // 6d: a snapshot equal to the claimed second while the marker is present (synthetic same-second snapshot).
 t=fresh('true');await admission();r=await nested('6d',{race:true,mutate:true});c=custody('6d after');
 const outerClaim=r.outerClaimParams.at(-1)??null;
 const oracle={matchesWithoutExclusion:raw('SELECT COUNT(*) n FROM privacy_serving_jobs WHERE operation_id=? AND last_attempt_at IS ?',OP,r.mutated).n,matchesWithExclusion:raw("SELECT COUNT(*) n FROM privacy_serving_jobs WHERE operation_id=? AND last_attempt_at IS ? AND COALESCE(hold_reason,'') NOT IN('attempt_unresolved','independent_suppression_outcome_unknown')",OP,r.mutated).n};
 console.log('DISCIPLINE_SAME_SECOND '+JSON.stringify({raced:r.raced,mutated:r.mutated,outerClaimParams:r.outerClaimParams,oracle,job:c.job}));
 caseCheck('6d the inner attempt left the marker after an unknown terminal outcome',r.raced===1&&c.job.hold_reason===MARKER&&c.job.last_attempt_at===t&&c.journal.length===1&&c.journal[0].state==='reserved');
 caseCheck('6d the claim CAS excludes the marker even when the snapshot equals the claimed second',r.mutated===t&&(outerClaim===null||outerClaim[4]===t)&&oracle.matchesWithoutExclusion===1&&oracle.matchesWithExclusion===0&&r.outer.value?.attempted===0&&r.claims.join()==='inner,outer'&&c.journalAll===1&&r.outer.preflight.length===1,{claims:r.claims,outer:r.outer.value,outerClaim});
 // 6e (informational): the same synthetic same-second snapshot after a known hold already replaced the marker.
 t=fresh('true');seedCursor(t);await admission();r=await nested('6e',{mutate:true});c=custody('6e after');
 info.push({case:'6e',note:'synthetic snapshot equal to the claimed second after a known hold (not reachable through either selection predicate, both require last_attempt_at<=now-120)',outerAttempted:r.outer.value?.attempted??null,claims:r.claims,preflightReads:r.outer.preflight.map(p=>p.value),job:c.job&&{state:c.job.state,hold_reason:c.job.hold_reason,last_attempt_at:c.job.last_attempt_at},journalAll:c.journalAll});
 console.log('DISCIPLINE_INFO '+JSON.stringify(info.at(-1)));
}

async function case7(){
 currentCase='7 flag on site and cron';
 async function interleave(label,{cursorSeed=false,during='site-select'}={}){
  const t=fresh('true');if(cursorSeed)seedCursor(t);await ready();const cookie=await originalCookie();
  let fired=false,phase='site',cronRun=null;const claims=[],bound=[],prevS=hooks.beforeStatement,prevB=hooks.beforeBatch;
  hooks.beforeStatement=sql=>{if(sql.includes(CLAIM_MARK))claims.push({path:phase,sql});return prevS?.(sql);};
  hooks.beforeBatch=async plan=>{for(const s of plan)if(s._sql.includes(CLAIM_MARK))bound.push({path:phase,params:Array.from(s.params)});await prevB?.(plan);};
  hooks.afterRead=async(sql,row)=>{const trigger=during==='site-select'?sql.includes(SITE_SELECT_MARK)&&!!row:sql.includes(' AS references_clear');if(!fired&&phase==='site'&&trigger){fired=true;phase='cron';try{cronRun=await cron(label+' interleaved cron');}finally{phase='site';}}};
  const post=await sitePost(cookie,label+' site POST');hooks.afterRead=null;hooks.beforeStatement=prevS;hooks.beforeBatch=prevB;
  const c=custody(label+' after');console.log('DISCIPLINE_SITE_CRON_CLAIMS '+JSON.stringify({label,claims:claims.map(x=>x.path),bound}));return{post,cronRun,claims,bound,c,fired,t};
 }
 // 7a: cron runs between the site selection and the site claim, and completes.
 let r=await interleave('7a');let site=r.claims.filter(x=>x.path==='site'),cronClaims=r.claims.filter(x=>x.path==='cron');
 caseCheck('7a the site POST admits and schedules the continuation',r.post.status===202&&r.post.pending>=1&&r.post.settled.every(s=>s.ok)&&r.fired);
 caseCheck('7a cron completes; the site claim on the same original proof claims nothing',r.cronRun?.value?.completed===1&&cronClaims.length===1&&site.length===1&&r.c.job.state==='complete'&&r.c.replayCount===1&&r.post.preflight.length===1);
 caseCheck('7a at most one reservation and zero unknown tickets',r.c.journalAll===1&&r.c.journal.length===1&&r.c.journal[0].state==='committed'&&unresolvedTickets(r.c).length===0);
 caseCheck('7a the site path issued the byte-identical claim SQL text as cron',site.length===1&&cronClaims.length===1&&site[0].sql===cronClaims[0].sql);
 const proofOf=(list,p)=>list.filter(x=>x.path===p).map(x=>JSON.stringify(x.params.slice(0,4)));
 caseCheck('7a site and cron bind the same original proof to the claim',proofOf(r.bound,'site').length===1&&proofOf(r.bound,'site')[0]===proofOf(r.bound,'cron')[0]&&proofOf(r.bound,'site')[0]===JSON.stringify([OP,ID,r.c.job.subject_generation,r.c.job.request_digest]),r.bound);
 // 7b: cron ticks while the site attempt holds the claim.
 r=await interleave('7b',{during:'preflight'});site=r.claims.filter(x=>x.path==='site');cronClaims=r.claims.filter(x=>x.path==='cron');
 caseCheck('7b a cron tick during the site attempt is excluded by the marker',r.fired&&r.cronRun?.value?.attempted===0&&cronClaims.length===0&&jobStatements(r.cronRun.statements).every(s=>s.kind!=='claim'));
 caseCheck('7b the site attempt completes with exactly one reservation and zero unknown tickets',site.length===1&&r.c.job.state==='complete'&&r.c.journalAll===1&&r.c.journal[0]?.state==='committed'&&unresolvedTickets(r.c).length===0&&r.c.replayCount===1);
 // 7c: known hold by cron between the site selection and the site claim; only the CAS separates them.
 r=await interleave('7c',{cursorSeed:true});site=r.claims.filter(x=>x.path==='site');cronClaims=r.claims.filter(x=>x.path==='cron');
 caseCheck('7c cron known hold then the site claim on its stale snapshot claims nothing',r.cronRun?.value?.attempted===1&&r.cronRun.value.held===1&&site.length===1&&cronClaims.length===1&&r.post.preflight.length===1&&r.c.job.state==='held'&&r.c.job.hold_reason===KNOWN&&r.c.job.last_attempt_at===r.t);
 caseCheck('7c zero reservations and zero unknown tickets',r.c.journalAll===0&&r.c.companionAll===0&&unresolvedTickets(r.c).length===0);
 caseCheck('7c the site path issued the byte-identical claim SQL text as cron',site.length===1&&cronClaims.length===1&&site[0].sql===cronClaims[0].sql);
 caseCheck('7c site and cron bind the same original proof; the site snapshot is the stale pre-claim value',proofOf(r.bound,'site').length===1&&proofOf(r.bound,'site')[0]===proofOf(r.bound,'cron')[0]&&r.bound.filter(x=>x.path==='site').every(x=>x.params[4]===null)&&r.c.job.last_attempt_at===r.t,r.bound);
}

async function case8(){
 currentCase='8 invalid flag value fails closed';
 const map=v=>eraser.erasureAttemptDiscipline(v===undefined?{}:{PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:v});
 caseCheck('only absent/false/true are accepted',map(undefined)===false&&map('false')===false&&map('true')===true&&['TRUE','True','1','',' true','false ','on'].every(v=>map(v)===null));
 fresh('TRUE');const proof=await admission(),before=custody('8 before');
 const o=await observed('8 continueServingErasure with TRUE',e=>eraser.continueServingErasure(e,proof)),after=custody('8 after continuation');
 caseCheck("'TRUE' continuation returns held "+INVALID+' with no terminal custody',o.value?.state==='held'&&o.value.reason===INVALID&&o.value.servingAccountErased===false&&o.physical===0&&o.preflight.length===0&&o.atomic.length===0&&after.journalAll===0&&after.companionAll===0&&unresolvedTickets(after).length===0&&same(after.job,before.job)&&!!after.account&&after.replayCount===0,{returned:o.value,physical:o.physical});
 const j=await cron('8 runServingErasureJob with TRUE'),afterJob=custody('8 after cron');
 caseCheck("'TRUE' cron returns attempted 0 without touching the jobs table; only the independent provider-message debt read runs",j.value?.attempted===0&&j.value.completed===0&&j.value.held===0&&!j.error&&j.physical===j.statements.length&&j.statements.filter(sql=>sql.includes('FROM privacy_provider_messages m')).length===1&&j.statements.every(sql=>sql.includes('FROM privacy_provider_messages m')||sql.startsWith('WITH business AS MATERIALIZED'))&&j.statements.length<=2&&j.http===0&&j.statements.every(sql=>!sql.includes('privacy_serving_jobs'))&&same(afterJob.job,before.job),{returned:j.value,physical:j.physical,statements:j.statements});
 fresh('TRUE');const cookie=await originalCookie(),post=await sitePost(cookie,'8 site POST with TRUE'),c=custody('8 after site POST');
 caseCheck("'TRUE' site POST admits but runs no continuation",post.status===202&&post.settled.every(s=>s.ok)&&jobStatements(post.statements).length===0&&post.preflight.length===0&&c.job.state==='waiting_role'&&c.job.last_attempt_at===null&&c.job.hold_reason===null&&c.journalAll===0&&!!c.account,{status:post.status,job:c.job});
}

(async()=>{
 let legacyRuns=null;
 for(const [name,run] of [['1',async()=>{legacyRuns=await case1();}],['2',case2],['3',case3],['4',case4],['5',async()=>case5(legacyRuns)],['6',case6],['7',case7],['8',case8]]){
  try{await run();}catch(error){console.error('case '+name+' stopped:',error.stack);caseCheck('case ran to completion without harness exception',false,{error:String(error.message)});}finally{hooks={};hasRole=false;loseDelete=false;}
 }
 currentCase='source';
 caseCheck('all actually loaded runtime source inputs remain unchanged',Array.from(pins).every(([file,b])=>fs.readFileSync(file).equals(b)));
 console.log('DISCIPLINE_SHAPE_TABLE '+JSON.stringify(shapeTable));
 console.log('DISCIPLINE_TICK_TABLE '+JSON.stringify(tickTable.map(r=>({case:r.case,tick:r.tick,clock:r.clock,attempted:r.attempted,claims:r.claims,totalTickets:r.totalTickets,newTickets:r.newTickets,unresolvedTickets:r.unresolvedTickets,hold_reason:r.hold_reason}))));
 console.log('DISCIPLINE_INFO_ALL '+JSON.stringify(info));
 console.log('PRIVACY_ERASURE_ATTEMPT_DISCIPLINE_SUMMARY '+JSON.stringify({checks,passes,cases:Object.fromEntries(Object.entries(caseTally).map(([k,v])=>[k,{checks:v.checks,passes:v.passes,failed:v.failed}])),shapes:shapeTable.length,fullCIQualified:false}));
 if(checks!==passes)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{db?.close();doDb?.close();});
`;
let harness=original.slice(0,original.indexOf(marker));
if(harness.split('clock=1800000000;').length!==3)throw Error('original fixture clock seams changed');
harness=harness.replaceAll('clock=1800000000;','clock=1800000900;');
const firstReadSeam='async first(c){const r=s.exec().results[0]??null;await hooks.afterRead?.(sql);return';
if(harness.split(firstReadSeam).length!==2)throw Error('original Native read observation seam changed');
harness=harness.replace(firstReadSeam,'async first(c){const r=s.exec().results[0]??null;await hooks.afterRead?.(sql,r);return');
const batchReadSeam="for(const statement of stmts)if(/^\\s*(SELECT|WITH)\\b/i.test(statement._sql))await hooks.afterRead?.(statement._sql);";
if(harness.split(batchReadSeam).length!==2)throw Error('original batch observation seam changed');
harness=harness.replace(batchReadSeam,"for(const [index,statement] of stmts.entries())if(/^\\s*(SELECT|WITH)\\b/i.test(statement._sql))await hooks.afterRead?.(statement._sql,out[index]?.results[0]);");
for(const [oldText,newText] of [
 ['const s=doDb.prepare(sql),result=','fixtureControlStatements++;const s=doDb.prepare(sql),result='],
 ['const response=await object.fetch(request);','fixtureControlRequests++;const response=await object.fetch(request);']
]){if(harness.split(oldText).length!==2)throw Error('original control observer seam changed');harness=harness.replace(oldText,newText);}
const mod=new Module(__filename,module);mod.filename=__filename;mod.paths=module.paths;mod._compile('let fixtureControlStatements=0,fixtureControlRequests=0;\n'+harness+cases,__filename);

// Actual original-cookie admission and central role absence through serving-account completion.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=fs.readFileSync(path.join(__dirname,'privacy_serving_integration_test.cjs'),'utf8'),marker='(async()=>{';
if(original.split(marker).length!==2)throw Error('serving integration fixture changed');
const cases=String.raw`
const beta=load('beta-reset-policy'),cursor=load('beta-reset-scan'),retention=load('privacy-retention');
const {RecoveryFloorHeld}=load('privacy-recovery-held'),assert=require('node:assert/strict'),hash=v=>require('node:crypto').createHash('sha256').update(v).digest('hex');
let terminalObservations=[];
function custody(label){
 const counter=()=>({native:attempts,http:calls.length,controlSQL:fixtureControlStatements,controlHTTP:fixtureControlRequests,nativeChanges:db.prepare('SELECT total_changes() n').get().n,controlChanges:doDb.prepare('SELECT total_changes() n').get().n});
 const before=counter(),tables=new Set(doDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const select=(name,where='',bindings=[])=>tables.has(name)?doDb.prepare('SELECT * FROM '+name+where).all(...bindings):[];
 const tickets=select('recovery_serving_ticket',' ORDER BY ticket_id');assert.ok(tickets.length<=256,'bounded original fixture ticket snapshot');
 const tupleSQL=load('privacy-serving-recovery-gate').SERVING_TICKET_TUPLE_SQL;
 const tuples=doDb.prepare('SELECT ticket_id,'+tupleSQL+' AS tuple FROM recovery_serving_ticket ORDER BY ticket_id').all().map(r=>({ticket_id:r.ticket_id,tuple:r.tuple,sha256:hash(r.tuple)}));
 const out={label,clock,account:raw('SELECT * FROM site_users WHERE discord_id=?',ID),subject:raw('SELECT * FROM privacy_subjects WHERE subject_id=?',ID),job:raw('SELECT * FROM privacy_serving_jobs WHERE operation_id=?',OP),cursor:raw('SELECT * FROM site_settings WHERE key=?',cursor.BETA_RESET_SCAN_KEY),replayCount:raw('SELECT COUNT(*) n FROM privacy_restore_replay').n,journal:select('recovery_suppression_journal',' WHERE operation_id=?',[OP]),companion:select('recovery_suppression_companion',' WHERE operation_id=?',[OP]),tickets,tuples,floor:select('recovery_floor'),gate:select('recovery_serving_gate')};
 assert.deepEqual(counter(),before,'custody reads do not mutate SQLite, Native counters, control calls, or provider calls');
 out.observationNonmutating=true;console.log('ERASURE_CUSTODY '+JSON.stringify(out));return out;
}
function observeTerminal(){terminalObservations=[];const previous=hooks.beforeBatch;hooks.beforeBatch=async plan=>{await previous?.(plan);if(plan.some(s=>s._sql.includes('privacy_completion_refused'))){const c=custody('before-original-terminal-native-batch');const original=c.tuples.find(t=>t.sha256===c.journal[0]?.original_ticket_digest);assert.ok(original,'suppression journal matches an actually observed original ticket tuple');c.originalChild=original.ticket_id;c.originalRoot=c.tickets.find(t=>t.ticket_id===original.ticket_id).parent_ticket_id;terminalObservations.push(c);console.log('ERASURE_ORIGINAL_CUSTODY_LINK '+JSON.stringify({child:c.originalChild,root:c.originalRoot,tupleSHA256:original.sha256,journalTicketDigest:c.journal[0].original_ticket_digest}));}};}
async function continueResetErasure(proof){
 const before=attempts,net=calls.length,controlSQL=fixtureControlStatements,controlHTTP=fixtureControlRequests;let value,error;
 const preflight=[],atomic=[],beforeStatement=hooks.beforeStatement,afterRead=hooks.afterRead;
 hooks.beforeStatement=sql=>{beforeStatement?.(sql);if(sql.includes('privacy_completion_refused')){const start=sql.lastIndexOf('AND NOT('),end=sql.indexOf("THEN 1 ELSE json_extract('privacy_completion_refused'");assert.ok(start>=0&&end>start);atomic.push(sql.slice(start+'AND NOT('.length,end).trimEnd().slice(0,-1));}};
 hooks.afterRead=async(sql,row)=>{if(sql.includes(' AS references_clear')){const marker='AS custody_clear,CASE WHEN NOT(',start=sql.indexOf(marker),end=sql.lastIndexOf(') THEN 1 ELSE 0 END AS references_clear');assert.ok(start>=0&&end>start);const d=Object.getOwnPropertyDescriptor(row,'references_clear');assert.ok(d&&Object.hasOwn(d,'value'));preflight.push({sql:sql.slice(start+marker.length,end),value:d.value});}await afterRead?.(sql,row);};
 try{value=await originalServingWork(env(),async originalEnv=>eraser.continueServingErasure(originalEnv,proof));}catch(caught){if(!(caught instanceof RecoveryFloorHeld)||caught.message!=='recovery_floor_held')throw caught;error=caught;}finally{hooks.beforeStatement=beforeStatement;hooks.afterRead=afterRead;}
 const predicateIdentical=atomic.every(sql=>preflight.length===1&&preflight[0].sql===sql);
 console.log('ERASURE_PREDICATE_SQL '+JSON.stringify({preflight,atomic,predicateIdentical}));
 console.log('NATIVE_ERASURE_OBSERVATION '+JSON.stringify({physical:attempts-before,http:calls.length-net,controlSQL:fixtureControlStatements-controlSQL,controlHTTP:fixtureControlRequests-controlHTTP,returned:value??null,thrown:error?{name:error.constructor.name,message:error.message}:null,preflightReads:preflight.length,atomicGuards:atomic.length,predicateIdentical}));return{value,error,preflight,atomic,predicateIdentical};
}
async function cleanupCursor(){const schedule=retention.captureServingRetentionSchedule(),network=calls.length,statementsBefore=attempts,controlSQL=fixtureControlStatements,controlHTTP=fixtureControlRequests;const retained=await originalServingWork(env(),e=>retention.sweepServingRetention(e,schedule));console.log('NATIVE_ERASURE_RETENTION_OBSERVATION '+JSON.stringify({clock,capturedPhase:Math.floor(clock/900)%2===0?'general':'beta',physical:attempts-statementsBefore,http:calls.length-network,controlSQL:fixtureControlStatements-controlSQL,controlHTTP:fixtureControlRequests-controlHTTP,changes:retained}));return{network,retained};}
function originalDebtStillExact(before,after){return JSON.stringify(before.journal)===JSON.stringify(after.journal)&&JSON.stringify(before.companion)===JSON.stringify(after.companion)&&before.tickets.every(t=>JSON.stringify(t)===JSON.stringify(after.tickets.find(x=>x.ticket_id===t.ticket_id)))&&JSON.stringify(before.floor)===JSON.stringify(after.floor)&&JSON.stringify(before.gate)===JSON.stringify(after.gate);}
const policy=()=>JSON.stringify({version:2,epoch:beta.BETA_RESET_EPOCH,cutoff:beta.BETA_RESET_CUTOFF,guildId:beta.BETA_RESET_GUILD_ID,roleIds:beta.BETA_RESET_ROLE_IDS,armedAt:Math.min(beta.BETA_RESET_CUTOFF,Math.floor(Date.now()/1000)-100)});
const scan=t=>JSON.stringify({version:1,epoch:beta.BETA_RESET_EPOCH,digest:'a'.repeat(64),pass:1,after:ID,lease:'',leaseUntil:0,passStartedAt:t-1000,scanned:1000,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null});
(async()=>{
 let t=reset(),rawPolicy=policy();db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)').run(beta.BETA_RESET_POLICY_KEY,rawPolicy,t,ID);
 let proof=await admission(),observed=await continueResetErasure(proof);if(observed.error)throw observed.error;let out=observed.value;
 check('real serving-account erasure clears arming attribution',out.state==='complete'&&!raw('SELECT * FROM site_users')&&raw('SELECT updated_by FROM site_settings WHERE key=?',beta.BETA_RESET_POLICY_KEY).updated_by===null);
 check('real actor erasure preserves valid exact actor-free policy',raw('SELECT value FROM site_settings WHERE key=?',beta.BETA_RESET_POLICY_KEY).value===rawPolicy&&!!beta.parseBetaResetPolicy(rawPolicy,env()));
 check('actor completion consumes one original preflight and byte-identical atomic predicate',observed.preflight.length===1&&observed.preflight[0].value===1&&observed.atomic.length===1&&observed.predicateIdentical);
 custody('completed-actor-case-before-next-original-reset');
 t=reset();db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)').run(cursor.BETA_RESET_SCAN_KEY,scan(t),t-300,'system:beta-reset');
 proof=await admission();const originalProof=proof,before=custody('valid-cursor-before-continuation');observeTerminal();observed=await continueResetErasure(proof);
 check('valid cursor returns acknowledged retriable reference hold without thrown completion',!observed.error&&observed.value?.state==='held'&&observed.value.reason==='ambiguous_personal_reference'&&observed.value.servingAccountErased===false);
 check('actual erasure conservatively holds while current cursor names subject',observed.value?.state==='held'&&!!raw('SELECT * FROM site_users'));
 const held=custody('valid-cursor-after-original-preflight-refusal');
 check('refusal preserves exact account, retiring generation, cursor and original job without replay',JSON.stringify(held.account)===JSON.stringify(before.account)&&JSON.stringify(held.subject)===JSON.stringify(before.subject)&&JSON.stringify(held.cursor)===JSON.stringify(before.cursor)&&JSON.stringify(held.job)===JSON.stringify(before.job)&&held.replayCount===0);
 check('known negative read creates no terminal reservation, companion or unknown ticket',observed.preflight.length===1&&observed.preflight[0].value===0&&observed.atomic.length===0&&terminalObservations.length===0&&held.journal.length===0&&held.companion.length===0&&held.tickets.every(t=>t.state!=='unknown'));
 const cleaned=await cleanupCursor();check('stale cursor cleanup uses no provider call',calls.length===cleaned.network&&!raw('SELECT value FROM site_settings WHERE key=?',cursor.BETA_RESET_SCAN_KEY).value.includes(ID));
 const afterCleanup=custody('valid-cursor-after-original-retention');observed=await continueResetErasure(proof);out=observed.value;
 const sameProofLivenessQualified=!observed.error&&out?.state==='complete'&&!raw('SELECT * FROM site_users')&&raw('SELECT state FROM privacy_serving_jobs').state==='complete';
 check('same original erasure proof completes after cursor cleanup',sameProofLivenessQualified);
 check('same-proof retry uses unchanged proof and real original terminal completion',proof===originalProof&&!observed.error&&out?.state==='complete'&&observed.preflight.length===1&&observed.preflight[0].value===1&&observed.atomic.length===1&&observed.predicateIdentical);
 const retry=custody('valid-cursor-after-one-original-same-proof-retry-before-next-reset');
 check('stable retry creates its first terminal reservation only after clear preflight',held.journal.length===0&&afterCleanup.journal.length===0&&terminalObservations.length===1&&retry.journal.length===1&&retry.journal[0].state==='committed'&&retry.replayCount===1&&retry.job.state==='complete'&&!retry.account);
 t=reset();const malformed='{bad '+ID;db.prepare('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?)').run(cursor.BETA_RESET_SCAN_KEY,malformed,t-300);
 proof=await admission();await cleanupCursor();const malformedBefore=custody('malformed-before-preflight');observeTerminal();observed=await continueResetErasure(proof);
 check('malformed cursor returns acknowledged reference hold without terminal reservation',!observed.error&&observed.value?.state==='held'&&observed.value.reason==='ambiguous_personal_reference'&&observed.preflight.length===1&&observed.preflight[0].value===0&&observed.atomic.length===0);
 check('malformed personal cursor remains explicit attended erasure hold',observed.value?.state==='held'&&!!raw('SELECT * FROM site_users')&&raw('SELECT value FROM site_settings WHERE key=?',cursor.BETA_RESET_SCAN_KEY).value===malformed);
 const malformedHeld=custody('malformed-cursor-final-original-custody');
 check('malformed preflight preserves original account, subject, job and no suppression custody',terminalObservations.length===0&&malformedHeld.journal.length===0&&malformedHeld.companion.length===0&&malformedHeld.replayCount===0&&JSON.stringify(malformedHeld.account)===JSON.stringify(malformedBefore.account)&&JSON.stringify(malformedHeld.subject)===JSON.stringify(malformedBefore.subject)&&JSON.stringify(malformedHeld.job)===JSON.stringify(malformedBefore.job));
 // Explicit residual: a genuine admitted fixture write lands after preflight, before the unchanged terminal guard.
 t=reset();proof=await admission();const raceProof=proof;observeTerminal();let raceWrites=0;
 hooks.afterRead=async sql=>{if(sql.includes(' AS references_clear')){hooks.afterRead=null;raceWrites++;await setupWrite('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',cursor.BETA_RESET_SCAN_KEY,scan(t),t-300,'system:beta-reset');}};
 observed=await continueResetErasure(proof);hooks.afterRead=null;
 const raced=custody('after-preflight-reference-race-preserved-unknown');
 check('after-preflight reference reaches identical atomic guard and genuine typed hold',raceWrites===1&&observed.preflight.length===1&&observed.preflight[0].value===1&&observed.atomic.length===1&&observed.predicateIdentical&&observed.error instanceof RecoveryFloorHeld&&observed.value===undefined);
 check('atomic race retains actual reserved journal and unknown original child/root',terminalObservations.length===1&&raced.journal[0]?.state==='reserved'&&raced.tickets.find(t=>t.ticket_id===terminalObservations[0].originalChild)?.state==='unknown'&&raced.tickets.find(t=>t.ticket_id===terminalObservations[0].originalRoot)?.state==='unknown'&&raced.replayCount===0&&!!raced.account&&raced.subject.state==='retiring');
 const terminalCount=terminalObservations.length;observed=await continueResetErasure(proof);const oldUnknown=custody('historical-unknown-after-known-preflight-refusal');
 check('later known negative preflight preserves all original unknown custody exactly',!observed.error&&observed.value?.reason==='ambiguous_personal_reference'&&originalDebtStillExact(raced,oldUnknown)&&JSON.stringify(raced.account)===JSON.stringify(oldUnknown.account)&&JSON.stringify(raced.subject)===JSON.stringify(oldUnknown.subject)&&JSON.stringify(raced.job)===JSON.stringify(oldUnknown.job)&&terminalObservations.length===terminalCount);
 await cleanupCursor();const raceCleanup=custody('historical-unknown-after-original-cleanup');observed=await continueResetErasure(proof);const raceRetry=custody('historical-unknown-after-same-proof-retry');
 const atomicRaceLivenessQualified=!observed.error&&observed.value?.state==='complete';
 check('cleanup cannot adopt or release historical unknown suppression reservation',proof===raceProof&&!atomicRaceLivenessQualified&&observed.error instanceof RecoveryFloorHeld&&observed.value===undefined&&originalDebtStillExact(raced,raceCleanup)&&originalDebtStillExact(raced,raceRetry)&&terminalObservations.length===terminalCount&&raceRetry.replayCount===0&&!!raceRetry.account);
 // Retained ACK descriptors are checked again after the existing current-proof await.
 for(const drift of ['value','getter']){t=reset();proof=await admission();let retained=null,changed=false,invoked=0;
  hooks.afterRead=async(sql,row)=>{if(sql.includes(' AS references_clear'))retained=row;else if(retained&&!changed){changed=true;if(drift==='value')retained.references_clear=0;else Object.defineProperty(retained,'references_clear',{get(){invoked++;throw Error('getter must not be invoked');},configurable:true});}};
  observed=await continueResetErasure(proof);hooks.afterRead=null;const changedAck=custody('reference-ack-'+drift+'-held');
  check('retained reference ACK '+drift+' drift cannot acquire terminal authority',changed&&invoked===0&&!observed.error&&observed.value?.state==='unknown'&&observed.value.reason==='current_role_custody_ack_changed'&&changedAck.journal.length===0&&changedAck.companion.length===0&&changedAck.replayCount===0&&!!changedAck.account);
 }
 check('all lifecycle provider work is read-only role qualification',calls.every(x=>x.startsWith('GET ')));
 check('all actually loaded runtime source inputs remain unchanged',Array.from(pins).every(([file,b])=>fs.readFileSync(file).equals(b)));
 console.log('BETA_RESET_ERASURE_LIFECYCLE_SUMMARY '+JSON.stringify({checks,passes,malformedHold:true,sameProofLivenessQualified,atomicRaceLivenessQualified,historicalUnknownRecoveryQualified:false,preflightMitigationOnly:true,fullCIQualified:false}));if(checks!==passes)process.exitCode=1;
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

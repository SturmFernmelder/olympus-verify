// Test-only runtime composition: actual immutable Worker/SQLite; no provider effects.
const fs=require('fs'),Module=require('module');
const original=require('path').join(__dirname,'community_event_reminders_test.cjs');
let source=fs.readFileSync(original,'utf8');
const marker='(async () => {';
if(source.split(marker).length!==2)throw Error('fixture setup boundary drift');
source=source.slice(0,source.indexOf(marker));
source+=`(async()=>{
 const mutations=[
 ['actor',async()=>await fixtureRun('UPDATE community_event_reminders SET actor=?',OTHER)],
 ['consent version',async()=>{await fixtureRun('UPDATE site_users SET session_version=2 WHERE discord_id=?',ORG);await fixtureRun('UPDATE community_event_reminders SET consent_version=2');}],
 ['event revision',async()=>{await fixtureRun('UPDATE community_events SET revision=2');await fixtureRun('UPDATE community_event_reminders SET event_revision=2');}],
 ['start',async()=>{await fixtureRun('UPDATE community_events SET starts_at=starts_at+10,ends_at=ends_at+10');await fixtureRun('UPDATE community_event_reminders SET starts_at=starts_at+10');}],
 ['guild',async()=>await fixtureRun('UPDATE community_event_reminders SET guild_id=?',WRONG)],
 ['channel',async()=>await fixtureRun('UPDATE community_event_reminders SET channel_id=?',WRONG)],
 ['host',async()=>await fixtureRun("UPDATE community_event_reminders SET host='other.example'")],
 ['operation',async()=>await fixtureRun('UPDATE community_event_reminders SET op_id=?',NEXT)],
 ['nonce',async()=>await fixtureRun('UPDATE community_event_reminders SET claim_nonce=?',NEXT)],
 ['pointer',async()=>await fixtureRun('UPDATE community_event_reminders SET message_id=?',ONE)],
 ['content',async()=>await fixtureRun("UPDATE community_event_reminders SET frozen_content='Replacement public content'")],
 ['cleanup',async()=>await fixtureRun('UPDATE community_event_reminders SET cleanup_requested=1')],
 ['deadline',async()=>await fixtureRun('UPDATE community_event_reminders SET retain_until=retain_until+5')],
 ['created time',async()=>await fixtureRun('UPDATE community_event_reminders SET created_at=created_at+1')],
 ['update time',async()=>await fixtureRun('UPDATE community_event_reminders SET updated_at=updated_at+1')],
 ['rotation time',async()=>await fixtureRun('UPDATE community_event_reminders SET last_attempt_at=last_attempt_at+1')],
 ['state',async()=>await fixtureRun("UPDATE community_event_reminders SET state='cancelled'")],
 ['absence to active',async()=>await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)",ORG,'e'.repeat(32),at(),at())],
 ['generation replacement',async()=>await fixtureRun("UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?",'f'.repeat(32),ORG)],
 ['retiring',async()=>await fixtureRun("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?",ORG)],
 ];
 for(const phase of ['prerequisite','final proof'])for(const[name,mutate]of mutations){
  await fresh();await arm();
  // The genuine OAuth issuer seeds a generation. Recreate only these three original
  // fixture preconditions through admitted setup after the real consent operation.
  if(['absence to active','generation replacement','retiring'].includes(name)){
   await fixtureRun('DELETE FROM privacy_subjects WHERE subject_id=?',ORG);
   check(phase+' admitted original '+name+' absence precondition',!one('SELECT subject_id FROM privacy_subjects WHERE subject_id=?',ORG));
  }
  if(name==='generation replacement'||name==='retiring')await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'active',1,?,?)",ORG,'e'.repeat(32),at(),at());
  if(name==='generation replacement'||name==='retiring'){
   const seeded=one('SELECT generation,state,revision FROM privacy_subjects WHERE subject_id=?',ORG);
   check(phase+' admitted original '+name+' active precondition',seeded?.generation==='e'.repeat(32)&&seeded.state==='active'&&seeded.revision===1);
  }
  let fired=0,mutationCompleted=0;
  if(phase==='prerequisite')hooks.http=async(req)=>{if(req.url==='/api/v10/channels/'+CHANNEL){hooks.http=null;fired++;await mutate();mutationCompleted++;}};
  // Current Native ABI: commit the competing admitted write before this same
  // proof-containing batch begins, not inside its atomic transaction.
  else hooks.beforeBatch=async(plan)=>{if(plan.some(s=>s.statement.includes('SELECT 1 AS ok FROM community_event_reminders r'))){hooks.beforeBatch=null;fired++;await mutate();mutationCompleted++;}};
  let failed;try{await tick();}catch(e){failed=e;}
  check(phase+' competing admitted '+name+' mutation completed',mutationCompleted===1);
  check(phase+' consumes original '+name+' with zero provider effect',fired===1&&!failed&&effects().length===0,failed?.stack);
  check(phase+' original '+name+' fits 19-binding cap',maxParameters<=19);
 }
 await fresh();await arm();SQL=[];
 const observationCrypto=require('node:crypto');
 const observationHash=value=>observationCrypto.createHash('sha256').update(value).digest('hex');
 const observationStatement=(statement,params,ordinal)=>({ordinal,sqlBytes:Buffer.byteLength(statement,'utf8'),sqlSHA256:observationHash(statement),parameterCount:params.length,parameterTypes:params.map(v=>v===null?'null':Array.isArray(v)?'array':typeof v),parametersSHA256:observationHash(JSON.stringify(params))});
 const observationEffects=items=>items.map((r,ordinal)=>({ordinal,method:r.method,url:r.url,body:r.body}));
 const beforeTickPositions={sqlLength:SQL.length,nativeTraceLength:nativePort.nativeTrace.length,nativeGroupLength:nativePort.nativeGroups.length};
 await tick();
 // Reuse the original row/effects evaluations in the original conjunctive check.
 const firstTickRow=row(),firstTickEffects=effects();
 const firstTickObservation={scope:'existing selected-row first tick; observation only',beforeTickPositions,row:firstTickRow,effects:observationEffects(firstTickEffects),sql:SQL.map((s,i)=>({...observationStatement(s.sql,s.params,i),fixtureSetup:s.fixtureSetup})),nativeTrace:nativePort.nativeTrace.map((s,i)=>observationStatement(s.sql,s.params,i)),nativeGroups:nativePort.nativeGroups.map((g,i)=>({ordinal:i,length:g.length,statements:g.map((s,j)=>observationStatement(s.sql,s.params,j))})),sqlLength:SQL.length,nativeTraceLength:nativePort.nativeTrace.length,nativeGroupLength:nativePort.nativeGroups.length,maxParameters,terms:{posted:firstTickRow.state==='posted',exactlyOneEffect:firstTickEffects.length===1,exactlySevenSQL:SQL.length===7}};
 console.log('SELECTED_ROW_FIRST_TICK_OBSERVATION '+JSON.stringify(firstTickObservation));
 check('unchanged consent delivers once in the declared 21 physical SQL statements',firstTickRow.state==='posted'&&firstTickEffects.length===1&&SQL.length===21);
 const beforeSecondTickPositions={sqlLength:SQL.length,nativeTraceLength:nativePort.nativeTrace.length,nativeGroupLength:nativePort.nativeGroups.length};
 await tick();const secondTickEffects=effects();
 console.log('SELECTED_ROW_SECOND_TICK_OBSERVATION '+JSON.stringify({scope:'existing selected-row second tick; observation only',beforeSecondTickPositions,effects:observationEffects(secondTickEffects),effectCountBefore:firstTickEffects.length,effectCountAfter:secondTickEffects.length,effectCountDelta:secondTickEffects.length-firstTickEffects.length,sqlLength:SQL.length,nativeTraceLength:nativePort.nativeTrace.length,nativeGroupLength:nativePort.nativeGroups.length,sql:SQL.map((s,i)=>({...observationStatement(s.sql,s.params,i),fixtureSetup:s.fixtureSetup})),nativeGroups:nativePort.nativeGroups.map((g,i)=>({ordinal:i,length:g.length,statements:g.map((s,j)=>observationStatement(s.sql,s.params,j))}))}));
 check('settled reminder never redispatches',secondTickEffects.length===1);
 console.log(passed+'/'+total+' selected-row race checks passed');db.close();if(passed!==total)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});`;
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(require('path').dirname(original));mod._compile(source,original);

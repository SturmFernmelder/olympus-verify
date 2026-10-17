// Item 15 (17 Oct 2026) receipt command, deliberately NOT part of test:all: npm run receipt:beta-item15-absent-differential
// With BETA_RESET_DISPATCH_SEAL_MODE absent, every covered path of the current source must issue exactly the SQL text,
// binds, provider requests (method, path, X-Audit-Log-Reason) and outcome of the exact Codex 76e7e3c sources. The pinned
// sources are rebuilt in memory from tests/fixtures/beta_item15_baseline_76e7e3c.json (written by
// scripts/pin-item15-baseline.cjs, which has a --check mode) and verified by SHA-256; the shared modules and schema.sql are
// bound by digest. On any other source state the receipt refuses rather than compares: re-pin only after a reviewed change.
// Each comparison also carries a positive expectation so it cannot pass vacuously. Only Discord is simulated.
const fs=require('node:fs'),path=require('node:path'),nodeCrypto=require('node:crypto');
const H=require('./helpers/beta_item15_harness.cjs');
const {applyReverse,sharedDigest,BASE_COMMIT,BASE_TREE}=require('../scripts/pin-item15-baseline.cjs');
const {NEW,execute,view,check,scenarios:sc,deletes,puts,onlyGets,settlements,row,reasonOf,pair,removalRow,erasureIntent,rankIntent,heldAudit,
 TWELVE,SUBJECT,FRESH,FRESH2,OTHER_GUILD,PARENT,CHILD,PROOF}=H;
const FIXTURE=path.join(__dirname,'fixtures','beta_item15_baseline_76e7e3c.json');
const sha=text=>nodeCrypto.createHash('sha256').update(text,'utf8').digest('hex'),lf=text=>text.replace(/\r\n/g,'\n');
function refuse(reason){console.error('RECEIPT REFUSED: '+reason+'.\nRe-pin only after review: node scripts/pin-item15-baseline.cjs, then node scripts/pin-item15-baseline.cjs --check, then rerun this receipt.');process.exit(1);}

function pinnedSources(){
 let B;try{B=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));}catch(e){refuse('fixture unreadable ('+e.message+')');}
 if(B.schema!=='item15-pinned-baseline-v2'||B.commit!==BASE_COMMIT||B.tree!==BASE_TREE||!Array.isArray(B.shared)||!B.files)refuse('fixture is not an item15-pinned-baseline-v2 pin of '+BASE_COMMIT);
 const src=path.join(H.root,'src'),read=name=>lf(fs.readFileSync(path.join(src,name+'.ts'),'utf8'));
 if(sha(lf(fs.readFileSync(path.join(H.root,'schema.sql'),'utf8')))!==B.schemaSha256)refuse('worker/schema.sql changed since the pin');
 let shared;try{shared=sharedDigest(B.shared,read);}catch(e){refuse('a shared module of the pin is missing ('+e.message+')');}
 if(shared!==B.sharedDigest)refuse('a worker/src module outside the pinned set changed since the pin');
 const out={};
 for(const [name,spec] of Object.entries(B.files)){const current=read(name);
  if(sha(current)!==spec.currentSha256)refuse('worker/src/'+name+'.ts changed since the pin');
  let text;try{text=applyReverse(current,spec.reverse,name);}catch(e){refuse(e.message);}
  if(sha(text)!==spec.sha256)refuse('reconstructed worker/src/'+name+'.ts is not the pinned 76e7e3c source');
  out[name]=text;}
 return {files:out,baseline:B};
}
const {files,baseline}=pinnedSources();
const OLD=H.modules(H.makeLoader(files,'pinned76e7e3c'));
console.log('receipt base '+baseline.commit+' tree '+baseline.tree+'; pinned '+Object.entries(baseline.files).map(([n,f])=>n+'.ts '+f.sha256.slice(0,12)).join(', ')+'; shared '+baseline.shared.length+' modules '+baseline.sharedDigest.slice(0,12));

async function same(label,scenario,expectation,why){
 const before=await execute(OLD,'absent',scenario),after=await execute(NEW,'absent',scenario),a=view(before),b=view(after);
 if(a!==b){const x=JSON.parse(a),y=JSON.parse(b);for(const part of ['trace','requests']){const n=Math.max(x[part].length,y[part].length);
  for(let k=0;k<n;k++)if(JSON.stringify(x[part][k])!==JSON.stringify(y[part][k])){console.error('FIRST '+part+' DIFFERENCE at '+k,JSON.stringify(x[part][k])?.slice(0,600),JSON.stringify(y[part][k])?.slice(0,600));break;}}
  console.error('OUTCOMES',JSON.stringify(x.outcome)?.slice(0,600),JSON.stringify(y.outcome)?.slice(0,600));}
 check(label+': absent mode keeps every SQL text, bind, provider request and outcome of 76e7e3c ('+before.trace.length+' statements, '+before.requests.length+' requests)',a===b&&before.trace.length>0);
 check(label+': positive expectation, '+why,!!expectation(after)&&!!expectation(before));
}
const oneDelete=(role,reason)=>s=>deletes(s).length===1&&deletes(s,role).length===1&&(reason===undefined||reasonOf(deletes(s)[0])===reason);

(async()=>{
 // The two graphs really differ: 76e7e3c had no central item-15 fence, so a direct central removal in v1 still deletes there.
 {const old=await execute(OLD,'v1',sc.centralBan()),current=await execute(NEW,'v1',sc.centralBan());
  check('graph sanity: the pinned graph runs the 76e7e3c central writer (v1 direct removal deletes there, held in the current source)',deletes(old,TWELVE[0]).length===1&&deletes(current).length===0&&current.outcome.reason===H.HELD);}
 await same('raw /ban',sc.rawBan(),oneDelete(TWELVE[0],'olympus-verify: banned by officer-fixture'),'one original DELETE with its original reason');
 await same('raw /ban, fresh role',sc.rawBan({ROLE_GUILD_MEMBER:FRESH}),oneDelete(FRESH),'one DELETE of the fresh role');
 await same('durable /ban',sc.durableBan(),oneDelete(TWELVE[0]),'one central DELETE');
 await same('raw departure (roster.demote)',sc.departure(),oneDelete(TWELVE[0],'olympus-verify: Actual Member left the guild (fixture)'),'one original DELETE with its original reason');
 await same('raw departure with a threaded absent entry pair',sc.departure({},(t,N)=>pair(N,t.env)),oneDelete(TWELVE[0]),'one original DELETE');
 await same('central ban removal',sc.centralBan(),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[0])(s),'settled with one DELETE');
 await same('central ban removal, other guild',sc.centralBan({GUILD_ID:OTHER_GUILD}),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[0])(s),'settled with one DELETE');
 await same('central ban: prior spent receipt reconcile',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});t.members[SUBJECT]=[];}),
  s=>s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&s.requests.length>0&&onlyGets(s),'GET-only observation, no DELETE');
 await same('central ban: existing intent, member already lacks the role',sc.centralBan({},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0],state:'pending',attempts:0,reason:'awaiting_dispatch'});t.members[SUBJECT]=[];}),
  s=>s.outcome.state==='settled'&&s.outcome.reason==='absent'&&deletes(s).length===0,'ACK-free absent receipt');
 await same('retired fixed target pair',sc.retiredBan(TWELVE[0]),s=>s.outcome.state==='settled'&&deletes(s,FRESH).length===1&&deletes(s,TWELVE[0]).length===1,'both targets removed once');
 await same('fixed current + fresh retired pair',sc.retiredBan(FRESH2,undefined,{ROLE_GUILD_MEMBER:TWELVE[0]}),s=>s.outcome.state==='settled'&&deletes(s,TWELVE[0]).length===1&&deletes(s,FRESH2).length===1,'both targets removed once');
 await same('retired pair: prior spent removal reconcile',sc.retiredBan(TWELVE[0],undefined,{},async t=>{await removalRow(t,{purpose:'ban',role:TWELVE[0]});t.members[SUBJECT]=[FRESH];}),
  s=>s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s),'GET-only observation, no DELETE');
 await same('central departure delegation (roles.settleGuildDepartureRole)',sc.centralDeparture(),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[0])(s),'settled with one DELETE');
 await same('grant compensation (producer2)',sc.compensation(),s=>puts(s).length===1&&oneDelete(TWELVE[0])(s)&&settlements(s).some(r=>r.purpose==='grant_compensation'),'PUT then one compensating DELETE');
 await same('owned retirement (producer4)',sc.retire(TWELVE[0]),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[0])(s),'one DELETE of the retired role');
 await same('owned retirement: existing spent child reconcile',sc.retire(TWELVE[0],async t=>{await removalRow(t,{id:CHILD,purpose:'grant_compensation',role:TWELVE[0],digest:PARENT,reason:'membership_retirement_dispatching'});t.members[SUBJECT]=[FRESH];}),
  s=>s.outcome.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s),'GET-only observation, no DELETE');
 await same('attended retirement route (producer3, handleMembershipRetirement)',sc.attendedRoute(TWELVE[0]),s=>s.outcome.status===200&&s.outcome.data.state==='settled'&&oneDelete(TWELVE[0])(s),'one DELETE, settled');
 await same('attended retirement route: spent child recovery',sc.attendedRoute(TWELVE[0],{child:true,act:t=>{t.members[SUBJECT]=[FRESH];return t.call('POST','/reconcile',{parentGrantId:PARENT,operationId:t.preview.data.child?.operationId,form:t.preview.data.form});}}),
  s=>s.outcome.status===200&&s.outcome.data.reason==='beta_removal_observed_absent_unconfirmed'&&deletes(s).length===0&&onlyGets(s),'GET-only recovery, no DELETE');
 await same('attended retirement direct admission',sc.attendedDirect(TWELVE[0]),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[0])(s),'one DELETE, settled');
 await same('account erasure with a current job',sc.erasure(),s=>s.outcome.state==='removed'&&oneDelete(TWELVE[0])(s)&&row(s,PROOF.operationId)?.reason==='removed','claim and exactly one DELETE');
 await same('account erasure: existing intent, member already lacks the role',sc.erasure({},async t=>{await erasureIntent(t);t.members[SUBJECT]=[];}),s=>s.outcome.state==='absent'&&deletes(s).length===0,'ACK-free absent receipt');
 await same('fixed native rank removal (settleRoleIntent)',sc.rank(TWELVE.slice(2)),s=>s.outcome.state==='settled'&&oneDelete(TWELVE[2])(s),'one DELETE of the fixed rank role');
 await same('fresh native rank removal (settleRoleIntent)',sc.rank(H.LABELS),s=>s.outcome.state==='settled'&&oneDelete(H.LABELS[0])(s),'one DELETE of the fresh rank role');
 await same('fixed native rank: spent row reconcile',{...sc.rank(TWELVE.slice(2),async t=>{await t.write("UPDATE role_settlements SET state='dispatching',attempts=1,claim_nonce=?2,reason='dispatching' WHERE id=?1",t.rankIntent,'3'.repeat(32));t.members[SUBJECT]=[];}),act:(t,N)=>N.rs.settleRoleIntent(t.env,t.rankIntent,true)},
  s=>s.outcome.state==='unknown'&&deletes(s).length===0&&onlyGets(s)&&rankIntent(s).attempts===1,'GET-only observation, no DELETE');
 await same('watcher postEvents departure',sc.postEvents(),oneDelete(TWELVE[0],'olympus-verify: Actual Member left the guild (fixture)'),'one original DELETE');
 await same('ingestRoster confirmed departure',sc.ingestRoster(),oneDelete(TWELVE[0],'olympus-verify: Actual Member left the guild (roster (absent from two exports))'),'one original DELETE');
 await same('syncFromLatest manual-sync departure',sc.syncDeparture(),oneDelete(TWELVE[0],'olympus-verify: Actual Member left the guild (manual sync)'),'one original DELETE');
 await same('syncFromLatest namesake release (reconcileIdentities -> releaseBinding)',sc.syncNamesake(),oneDelete(TWELVE[0],'olympus-verify: Actual Member left the guild (a different character now has this name)'),'one original DELETE');
 await same('roster central branch from postEvents (settlement ON)',sc.postEventsCentral(),s=>oneDelete(TWELVE[0])(s)&&settlements(s).some(r=>r.purpose==='guild_departure'&&r.state==='settled'),'one central DELETE, settled receipt');
 // Review fix 1: the departure export now reaches the central writer in every mode; absent mode through afterDeparture with a
 // prior spent guild_departure row is still the 76e7e3c GET-only reconcile.
 {const base=sc.postEventsCentral();await same('roster central branch: prior spent guild_departure receipt reconcile',{...base,prepare:async(t,N)=>{await base.prepare(t,N);await removalRow(t,{purpose:'guild_departure',role:TWELVE[0]});t.members[SUBJECT]=[];}},
  s=>deletes(s).length===0&&s.requests.length>0&&onlyGets(s)&&row(s,'9'.repeat(32))?.state==='unknown','GET-only observation through afterDeparture, no DELETE');}
 await same('continueRosterEffects pending departure',sc.continueRoster(),s=>s.pendingBefore===1&&s.outcome?.applied===1&&oneDelete(TWELVE[0])(s),'the pending depart item applied with one DELETE');
 H.finish('item15 absent differential receipt');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(H.restore);

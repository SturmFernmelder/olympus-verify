// Corrected acceptance cases for the separately preserved adversarial failure evidence.
// Reuse the real-source/native-SQLite harness; only Discord and specific receipt reply loss are simulated.
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'beta_reset_grants_test.cjs'),'utf8');
const marker='(async()=>{';
if(source.split(marker).length!==2)throw Error('fixture harness boundary changed');
const harness=source.slice(0,source.indexOf(marker));
const scenarios=String.raw`
// This transport hook runs AFTER COMMIT. Throwing inside q.exec would roll back an admitted batch,
// which models a refused transaction rather than a committed receipt with a lost reply.
let receiptReplyHook=null,beforeRunHook=null;
d1=function(){originalNative=currentEntry.originalNativePort(db,{beforeRun:async(sql,values)=>{if(beforeRunHook)await beforeRunHook(sql,values);},statement(sql,values){physical++;if(sqlHook)sqlHook(sql,values);},afterBatch:async(plan,out)=>{if(receiptReplyHook)await receiptReplyHook(plan.map(s=>s.sql),out);}});return originalNative;};
const preserved=[officer,moderator];
function protectedRoles(){members[subject]=[...preserved];}
function exactAccounting(name){check(name+' counts every HTTP attempt',b.attempts===requests.length&&b.calls===requests.length&&b.retries===0);}
async function compensated(name,fn){
 const outcome=await measure(name,fn);
 check(name+' returns held',typeof outcome==='string'?outcome==='held':outcome.state==='held');
 check(name+' removes only the attempted target',JSON.stringify(members[subject])===JSON.stringify(preserved));
 check(name+' dispatches one PUT and one DELETE',effects().map(x=>x.method).join(',')==='PUT,DELETE');
 const debt=rows().filter(x=>x.purpose==='grant_compensation');
 check(name+' has one durable spent compensation',debt.length===1&&debt[0].attempts===1&&debt[0].state==='settled');
 exactAccounting(name);
 const count=effects().length;
 const closed=await measure(name+' GET-only receipt check',()=>central.reconcileRemovalReceipt(env,debt[0].id,b));
 check(name+' reconciles without duplicate DELETE',closed.state==='settled'&&effects().length===count);
 check(name+' later grant cannot redispatch',(await grant())==='held'&&effects().length===count);
 exactAccounting(name+' replay');
}
(async()=>{
 for(const installed of [false,true]){
  const label=installed?'admitted':'native';
  await reset(installed);protectedRoles();let failed=false;
  sqlHook=sql=>{if(sql.includes("reason='legacy_put_acknowledged'")){sqlHook=null;failed=true;clock=policy.BETA_RESET_CUTOFF;throw Error('synthetic receipt storage failure');}};
  await compensated(label+' legacy receipt write failure at cutoff',grant);
  check(label+' acknowledged receipt failure exercised',failed);

  await reset(installed);protectedRoles();failed=false;
  effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};losePut=true;
  sqlHook=sql=>{if(sql.includes("reason='beta_put_outcome_unknown'")){sqlHook=null;failed=true;throw Error('synthetic unknown-receipt storage failure');}};
  await compensated(label+' lost PUT plus unknown receipt failure',grant);
  check(label+' unknown receipt failure exercised',failed);

  await reset(installed);protectedRoles();const unknown=await centralId();losePut=true;
  const initial=await measure(label+' central spent lost PUT',()=>central.settleRoleIntent(env,unknown,false,undefined,b));
  check(label+' initial lost PUT stays unknown',initial.state==='unknown'&&members[subject].includes(memberRole)&&effects().length===1);
  losePut=false;members[subject]=[...preserved];clock=policy.BETA_RESET_CUTOFF;const priorEffects=effects().length;
  const reconciliation=await measure(label+' closed beta spent grant reconciliation',()=>central.settleRoleIntent(env,unknown,true,undefined,b));
  check(label+' cutoff GET-only absence preserves original unknown PUT',reconciliation.reason==='beta_put_observed_absent_unconfirmed'&&db.prepare('SELECT state FROM role_settlements WHERE id=?').get(unknown).state==='unknown');
  check(label+' reconciliation adds no role effect',effects().length===priorEffects&&JSON.stringify(members[subject])===JSON.stringify(preserved));
  exactAccounting(label+' reconciliation');

  await reset(installed);protectedRoles();env.MEMBERSHIP_ROLE_SETTLEMENT_ENABLED='true';let replaced=false;
  beforeRunHook=async sql=>{if(!replaced&&sql.startsWith('INSERT INTO role_settlements')&&sql.includes("'roster_membership'")){replaced=true;beforeRunHook=null;const changed=JSON.stringify(JSON.parse(arm()),null,2);await fixtureRun('UPDATE site_settings SET value=? WHERE key=?',changed,policy.BETA_RESET_POLICY_KEY);assert.equal(db.prepare('SELECT value FROM site_settings WHERE key=?').get(policy.BETA_RESET_POLICY_KEY).value,changed,'competing policy replacement really committed');}};
  const replacement=await measure(label+' original policy replaced during central queue',()=>legacy.grantMemberRole(env,subject,'fixture','fixture',undefined,b,{subjectGeneration:generation}));
  check(label+' central handoff cannot adopt replacement policy',replaced&&replacement==='held'&&effects().length===0&&JSON.stringify(members[subject])===JSON.stringify(preserved));
  exactAccounting(label+' queue replacement');

  await reset(installed);protectedRoles();let getterCalls=0;
  Object.defineProperty(env,'BETA_RESET_REMOVALS_ENABLED',{get(){getterCalls++;return 'false';}});clock=policy.BETA_RESET_CUTOFF;
  const accessor=await measure(label+' malformed flag accessor',grant);
  check(label+' accessor cannot bypass guard or execute',accessor==='held'&&getterCalls===0&&requests.length===0&&rows().length===0);

  for(const writer of ['legacy','central']){
   await reset(installed);protectedRoles();const id=writer==='central'?await centralId():null;let committed=false,durableAtCleanup=false;
   const reason=writer==='legacy'?'legacy_put_acknowledged':'effect_and_current_server_confirmed';
   receiptReplyHook=(sqls,results)=>{const at=sqls.findIndex(sql=>sql.startsWith('UPDATE role_settlements SET ')&&sql.includes("reason='"+reason+"'"));if(at!==-1){
    receiptReplyHook=null;const out=results[at].results;assert.equal(out.length,1,'receipt must really commit before reply loss');committed=true;
    const committedId=out[0].id;assert.equal(db.prepare('SELECT state FROM role_settlements WHERE id=?').get(committedId).state,'settled');
    sqlHook=sql=>{if(sql.startsWith('INSERT INTO role_settlements')&&sql.includes("'grant_compensation'")){sqlHook=null;durableAtCleanup=db.prepare('SELECT state FROM role_settlements WHERE id=?').get(committedId).state==='settled';assert.ok(durableAtCleanup,'committed receipt must survive lost reply until compensation claims it');}};
    clock=policy.BETA_RESET_CUTOFF;throw Error('synthetic committed receipt lost reply');
   }};
   await compensated(label+' '+writer+' committed receipt lost reply',writer==='legacy'?grant:()=>central.settleRoleIntent(env,id,false,undefined,b));
   check(label+' '+writer+' committed receipt reply loss exercised',committed&&durableAtCleanup);
  }
 }
 console.log('BETA_GUARD_REGRESSIONS '+JSON.stringify({checks:n,maxPhysical:Math.max(...costs.map(x=>x.physical)),maxNetwork:Math.max(...costs.map(x=>x.network)),costs}));
 console.log(n+'/'+n+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',harness+scenarios)(__dirname,require);

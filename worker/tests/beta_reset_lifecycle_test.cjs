// Genuine owner route, real scan, admission wrapper, and current-row retention SQL. No live providers.
const fs=require('node:fs'),path=require('node:path');
const slice=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),route=fs.readFileSync(path.join(__dirname,'beta_reset_route_test.cjs'),'utf8');
const marker='(async()=>{',start="const entry=load('index').default";
if(slice.split(marker).length!==2||route.split(start).length!==2)throw Error('fixture harness changed');
const helpers=route.slice(route.indexOf(start),route.indexOf(marker,route.indexOf(start)));
// The original 299/300-second boundary and later clock deltas all land in beta
// phases from cutoff+1400 (1400,1699,1700,2700,3000,3120,3300 modulo the
// original half-hour). Select progress time before any reset/source operation.
const originalHarness=slice.slice(0,slice.indexOf(marker));
const resetClock='clock=policy.BETA_RESET_CUTOFF;physical=0;';
if(originalHarness.split(resetClock).length!==2)throw Error('original reset clock seam changed');
const phaseHarness=originalHarness.replace(resetClock,'clock=policy.BETA_RESET_CUTOFF+1400;physical=0;');
const cases=String.raw`
const retention=load('privacy-retention'),cursor=load('beta-reset-scan'),qr=load('qr-phase1-data');
const rawScan=()=>db.prepare('SELECT * FROM site_settings WHERE key=?').get(cursor.BETA_RESET_SCAN_KEY);
const cursorCosts=[];
async function cleanup(label){const p=physical,n=requests.length,groupBefore=originalNative.nativeGroups.length,out=await retention.sweepServingRetention({...env,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false',BETA_RESET_REMOVALS_ENABLED:'false'});const cost={label,physical:physical-p,http:requests.length-n,changes:out,nativeGroups:originalNative.nativeGroups.slice(groupBefore).map(g=>g.length)};cursorCosts.push(cost);console.log('NATIVE_RETENTION_OBSERVATION '+JSON.stringify({...cost,clock,capturedPhase:Math.floor(clock/900)%2===0?'general':'beta'}));const competing=label.endsWith('consuming cleanup sees newly acquired lease');check(label+' bounded cleanup, no providers',cost.physical===(competing?13:8)&&JSON.stringify(cost.nativeGroups)===JSON.stringify(competing?[5,8]:[8])&&cost.http===0);return out;}
let installedMode=false;
(async()=>{
 for(const installed of [false,true]){installedMode=installed;const label=installed?'admitted':'native';
  await routeReset(installed);let p=await preview(),r=await armRequest(p.data.form),raw=policyRow();
  check(label+' actual signed arming creates closed actor-free policy',r.status===200&&JSON.parse(raw).version===2&&!raw.includes(actor));
  // This is the exact existing attribution cleanup operation, not a claim that all erasure prerequisites passed.
  await mutate('UPDATE site_settings SET updated_by=NULL WHERE updated_by=?1',actor);
  env.SITE_ADMINS=owner;clock=policy.BETA_RESET_CUTOFF;
  const captured=await policy.captureBetaGrant(env,guild,memberRole);
  check(label+' erased operator attribution does not invalidate fixed policy',policyRow()===raw&&await policy.betaResetCurrent(env,captured)&&db.prepare('SELECT updated_by FROM site_settings WHERE key=?').get(policy.BETA_RESET_POLICY_KEY).updated_by===null);
  const actual=await engine.runBetaResetSlice(env);check(label+' actor-free policy still dispatches qualified exact target after attribution cleanup',actual.settled===1&&effects().length===1);preservedWebsite(label);
  await routeReset(installed);await mutate('INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,?)',policy.BETA_RESET_POLICY_KEY,JSON.stringify({...JSON.parse(arm()),version:1,armedBy:actor}),clock);
  p=await preview();check(label+' old actor-bearing shape is held and cannot be replaced',p.data.phase==='held'&&!p.data.canArm&&!p.data.form);const old=policyRow();r=await armRequest({});check(label+' old policy not silently migrated',r.status>=400&&policyRow()===old);

  await reset(installed,1005,[]);await engine.runBetaResetSlice(env);let before=rawScan(),record=scan();
  check(label+' real roleless page retains only final member cursor',record.after===subject(999)&&record.scanned===1000&&jobs().length===0);
  clock+=299;await cleanup(label+' before stale boundary');check(label+' fresh progress is preserved exactly',rawScan().value===before.value&&rawScan().updated_at===before.updated_at);
  clock++;await cleanup(label+' exact stale boundary');
  check(label+' expired cursor removed without dropping pass diagnostics',scan().after==='0'&&scan().pass===record.pass+1&&scan().scanned===0&&scan().observedAssignments===0&&scan().completedPasses===record.completedPasses&&!rawScan().value.includes(subject(999)));
  const cleared=rawScan();clock+=1000;await cleanup(label+' already clear');check(label+' empty cursor does not renew itself',rawScan().value===cleared.value&&rawScan().updated_at===cleared.updated_at);
  await engine.runBetaResetSlice(env);check(label+' next active invocation starts fresh from zero',requests.filter(x=>x.path.endsWith('/members')).at(-1).after==='0'&&scan().after===subject(999));

  before=rawScan();clock+=300;let raced=false;
  sqlBefore=async sql=>{if(!raced&&sql.startsWith('UPDATE site_settings SET')&&sql.includes("'$.after','0'")){raced=true;const live={...JSON.parse(before.value),lease:'e'.repeat(32),leaseUntil:clock+120};await fixtureRun('UPDATE site_settings SET value=?,updated_at=? WHERE key=?',JSON.stringify(live),clock,cursor.BETA_RESET_SCAN_KEY);assert.equal(rawScan().value,JSON.stringify(live),'competing live lease really committed');}};
  await cleanup(label+' consuming cleanup sees newly acquired lease');sqlBefore=null;
  check(label+' cleanup never overwrites a different current live lease',raced&&scan().lease==='e'.repeat(32)&&scan().after===subject(999));
  before=rawScan();clock+=120;await cleanup(label+' lease expired but recent progress');check(label+' expiry alone does not erase recent progress',rawScan().value===before.value);
  clock+=180;await cleanup(label+' stopped reacquired lease');check(label+' stale expired lease also loses cursor',scan().after==='0'&&scan().lease==='');

  for(const mutation of ['missing','old-format']){await reset(installed,1000,[]);await engine.runBetaResetSlice(env);if(mutation==='missing')await mutate('DELETE FROM site_settings WHERE key=?',policy.BETA_RESET_POLICY_KEY);else await mutate('UPDATE site_settings SET value=? WHERE key=?',JSON.stringify({...JSON.parse(arm()),version:1,armedBy:owner}),policy.BETA_RESET_POLICY_KEY);clock+=300;await cleanup(label+' '+mutation+' policy cursor');check(label+' policy '+mutation+' cannot strand old cursor',scan().after==='0');}

  await reset(installed,1005,[]);await engine.runBetaResetSlice(env);let cleaned=false;
  pageHook=async()=>{pageHook=null;clock+=300;await cleanup(label+' old slice waiting for provider');cleaned=scan().after==='0';};
  const waiting=await engine.runBetaResetSlice(env);
  check(label+' old slice cannot commit cursor or effects after cleanup',cleaned&&waiting.state==='held'&&scan().after==='0'&&effects().length===0);
  await engine.runBetaResetSlice(env);check(label+' fresh lease can resume after stale waiter',requests.filter(x=>x.path.endsWith('/members')).at(-1).after==='0'&&scan().after===subject(999));

  await reset(installed,1000,[]);members.get(subject(0)).push(memberRole);loseDelete=true;await engine.runBetaResetSlice(env);loseDelete=false;
  const debt=JSON.stringify(jobs()),spent=jobs().find(x=>x.attempts===1);clock+=300;await cleanup(label+' unknown operation retained');
  check(label+' cursor cleanup never changes original unknown receipt',spent.state==='unknown'&&JSON.stringify(jobs())===debt&&scan().after==='0');
  let refused=false;try{await env.DB.batch(qr.qrErasureStatements(env,subject(0)));}catch(e){refused=/malformed JSON|qr_provider_custody_held/.test(String(e));}
  const status=await engine.betaRoleResetStatus(env);check(label+' original custody still blocks actual QR erasure and status',refused&&JSON.stringify(jobs())===debt&&status.removals.unknown===1&&status.phase==='held'&&!status.roleReuseReady);

  await reset(installed,1000,[]);await engine.runBetaResetSlice(env);const valid=rawScan();clock+=300;
  const bad=[valid.value.replace('{','{"after":"'+subject(0)+'",'),valid.value.replace('{','{"\\u0061fter":"'+subject(0)+'",'),'{bad '+subject(0),JSON.stringify({...JSON.parse(valid.value),extra:subject(0)}),JSON.stringify({...JSON.parse(valid.value),leaseUntil:'0'}),JSON.stringify({...JSON.parse(valid.value),digest:'x'.repeat(64)}),JSON.stringify({...JSON.parse(valid.value),pass:9007199254740991}),JSON.stringify({...JSON.parse(valid.value),after:subject(0)+'\u0000'+subject(1)}),JSON.stringify({...JSON.parse(valid.value),digest:JSON.parse(valid.value).digest+'\u0000'}),JSON.stringify({...JSON.parse(valid.value),lease:'a'.repeat(32)+'\u0000'})];
  for(const [i,value]of bad.entries()){await mutate('UPDATE site_settings SET value=?,updated_at=? WHERE key=?',value,clock-300,cursor.BETA_RESET_SCAN_KEY);await cleanup(label+' malformed scan '+i);check(label+' malformed scan '+i+' remains explicit attended HOLD',rawScan().value===value&&cursor.parseBetaResetScan(value,JSON.parse(valid.value).digest)===null&&(await engine.betaRoleResetStatus(env)).phase==='held');}
 }
 console.log('BETA_RESET_LIFECYCLE_SUMMARY '+JSON.stringify({checks,maxCleanupPhysical:Math.max(...cursorCosts.map(x=>x.physical)),cleanupHttp:0,malformedRows:'attended hold; no finite erasure claim',terminalReceiptRetentionQualified:false}));console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',phaseHarness+helpers+cases)(__dirname,require);

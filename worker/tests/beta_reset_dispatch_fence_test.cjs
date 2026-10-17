// Actual beta source + the existing current-epoch Native fixture. No seal issuer is modeled.
// Test-only setting inserts exercise the fence, not an owner/provider-drain authorization.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),entry=require('./helpers/privacy129_fixture.cjs');
const root=path.join(__dirname,'..'),cache={},realNow=Date.now,realFetch=globalThis.fetch;
globalThis.crypto=require('node:crypto').webcrypto;
let clock=0,db,env,native,writer,requests=[],roles=[],beforeRun=null,afterRead=null,afterBatch=null,effectHook=null,pageHook=null;
Date.now=()=>clock*1000;
globalThis.fetch=async(input,init={})=>{
 if(input instanceof Request){init={method:input.method,headers:input.headers,...init};input=input.url;}
 const url=new URL(String(input)),method=init.method||'GET';requests.push({method,path:url.pathname});
 if(url.pathname.endsWith('/members')&&method==='GET'){
  assert.equal(url.searchParams.get('limit'),'1000');if(pageHook)await pageHook();
  return new Response(JSON.stringify([{user:{id:subject},roles:[...roles]}]),{headers:{'Content-Type':'application/json'}});
 }
 const match=url.pathname.match(/\/members\/(\d+)(?:\/roles\/(\d+))?$/);
 assert.ok(match,'only the existing beta grant and discovery provider paths');assert.equal(match[1],subject);
 if(match[2]){
  assert.equal(match[2],memberRole);assert.ok(['PUT','DELETE'].includes(method));
  roles=method==='PUT'?[...new Set([...roles,match[2]])]:roles.filter(x=>x!==match[2]);
  if(effectHook)await effectHook(method);return new Response(null,{status:204});
 }
 return new Response(JSON.stringify({user:{id:subject},roles:[...roles]}),{headers:{'Content-Type':'application/json'}});
};
function load(name){if(name==='node:async_hooks')return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>load(p));return m.exports;}
const policy=load('beta-reset-policy'),grants=load('beta-reset-grants'),engine=load('beta-reset'),admission=load('privacy-write-admission');
const guild=policy.BETA_RESET_GUILD_ID,memberRole=policy.BETA_RESET_ROLE_IDS[0],subject='400000000000000002',owner='700000000000000001';
const modeKey='BETA_RESET_DISPATCH_SEAL_MODE',sealKey=policy.BETA_RESET_DISPATCH_SEAL_KEY;
const arm=()=>JSON.stringify({version:2,epoch:policy.BETA_RESET_EPOCH,cutoff:policy.BETA_RESET_CUTOFF,guildId:guild,roleIds:[...policy.BETA_RESET_ROLE_IDS],armedAt:policy.BETA_RESET_CUTOFF-100});
const fixtureRun=(sql,...values)=>writer.prepare(sql).bind(...values).run();
const seal=(raw='{malformed')=>fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',sealKey,raw,clock,owner);
const rows=()=>db.prepare('SELECT * FROM role_settlements ORDER BY created_at,id').all();
const effects=()=>requests.filter(x=>x.method==='PUT'||x.method==='DELETE');
const scanRaw=()=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(engine.BETA_RESET_SCAN_KEY)?.value??null;
async function fresh(layout,mode='v1',armed=true){
 if(db)db.close();clock=policy.BETA_RESET_CUTOFF-10;requests=[];roles=[];beforeRun=null;afterRead=null;afterBatch=null;effectHook=null;pageHook=null;
 db=new DatabaseSync(':memory:');db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 entry.installCurrentEntryEpoch(db,{now:clock,layout});
 native=entry.originalNativePort(db,{beforeRun:async(sql,values)=>{if(beforeRun)await beforeRun(sql,values);},
  afterRead(sql,values,row){if(afterRead)afterRead(sql,values,row);},afterBatch:async(plan,out)=>{if(afterBatch)await afterBatch(plan,out);}});
 env=entry.currentEntryEnvironment({DB:native,GUILD_ID:guild,SITE_GUILD_ID:guild,SITE_ADMINS:owner,DISCORD_APP_ID:'700000000000000002',DISCORD_BOT_TOKEN:'fixture-only',
  ROLE_GUILD_MEMBER:memberRole,ROLE_GUILD_MASTER:'',ROLE_GUILD_LEADER:'1554261979684933742',ROLE_OFFICER:'1554262223038324840',ROLE_RAID_LEADER:'1554262510650007602',ROLE_MODERATOR:'571363393555136512',
  QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'beta-five',roles:[policy.BETA_RESET_ROLE_IDS[2],policy.BETA_RESET_ROLE_IDS[4],policy.BETA_RESET_ROLE_IDS[7],policy.BETA_RESET_ROLE_IDS[9],policy.BETA_RESET_ROLE_IDS[11]]}),BETA_RESET_REMOVALS_ENABLED:'true'},{layout});
 writer=admission.createPrivacyWriteAdmissionDatabase(native,'writer',layout,entry.ENTRY_EPOCH);env.DB=writer;
 if(mode!==null)env[modeKey]=mode;
 await fixtureRun('INSERT INTO members(discord_id) VALUES(?)',subject);
 if(armed)await fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',policy.BETA_RESET_POLICY_KEY,arm(),clock,owner);
 native.nativeTrace.length=0;native.nativeGroups.length=0;
}
const capture=()=>policy.captureBetaGrant(env,guild,memberRole);
async function begin(){return grants.beginBetaLegacyGrant(env,await capture(),subject);}
async function dispatch(receipt){return grants.dispatchBetaLegacyGrant(env,receipt,'fixture',{limit:40,attempts:0,retries:0});}
let passed=0;function check(name,ok){assert.ok(ok,name);passed++;console.log('PASS '+name);}
async function slice(name){const start=native.nativeTrace.length,net=requests.length,out=await engine.runBetaResetSlice(env);
 check(name+' preserves original slice caps',native.nativeTrace.length-start<=300&&requests.length-net<=40&&out.processed<=6&&out.discoveryPages<=1&&out.http===requests.length-net);return out;}
(async()=>{
 for(const layout of ['canonical','recorded-live-20261010']){
  await fresh(layout,null);
  for(const value of [undefined,null,false,true,'false','','V1','unknown']){
   env[modeKey]=value;const c=await capture();
   check(layout+' invalid own mode '+String(value)+' holds dispatch but retains policy',c.mode==='open'&&c.raw===arm()&&policy.betaResetDispatchMode(env,c)==='held'&&await grants.beginBetaLegacyGrant(env,c,subject)===null&&rows().length===0&&effects().length===0);
  }
  delete env[modeKey];let getters=0;Object.defineProperty(env,modeKey,{get(){getters++;return 'v1';},configurable:true});
  let bad=await capture();check(layout+' accessor mode holds dispatch without invoking getter',bad.mode==='open'&&policy.betaResetDispatchMode(env,bad)==='held'&&getters===0);delete env[modeKey];
  const proto=Object.getPrototypeOf(env);Object.setPrototypeOf(env,{[modeKey]:'v1'});
  bad=await capture();check(layout+' inherited mode is not accepted for dispatch',bad.mode==='open'&&policy.betaResetDispatchMode(env,bad)==='held');Object.setPrototypeOf(env,proto);
  env[modeKey]='invalid';const outside=await policy.captureBetaGrant(env,'700000000000000099',memberRole);
  check(layout+' invalid mode does not expand the fixed guild scope',outside.mode==='off'&&policy.betaResetDispatchSql(env,outside,'1=1')==='1=1');delete env[modeKey];
  let c=await capture(),g=policy.betaGrantSql(c,6);
  check(layout+' absent mode preserves exact guard SQL and values',policy.betaResetDispatchMode(env,c)==='legacy'&&policy.betaResetDispatchSql(env,c,g.sql)===g.sql&&g.values.length===3);
  check(layout+' copied capture cannot select legacy',policy.betaResetDispatchMode(env,{...c})==='held');
  env[modeKey]='v1';check(layout+' adding mode invalidates only new-dispatch gate',policy.betaResetDispatchMode(env,c)==='held'&&policy.betaGrantSql(c,6).sql===g.sql);
  delete env[modeKey];await seal();let r=await begin();
  check(layout+' absent-mode legacy remains unchanged even with a setting',!!r&&await dispatch(r)==='granted'&&effects().length===1&&rows()[0].state==='settled');
  const legacyStatements=native.nativeTrace.filter(x=>/^(INSERT INTO role_settlements|UPDATE role_settlements|SELECT 1 FROM role_settlements)/.test(x.sql));
  check(layout+' absent-mode application statements do not add seal predicates',legacyStatements.length>=3&&legacyStatements.every(x=>!x.sql.includes("key='betaResetDispatchSealV1'")));

  await fresh(layout);r=await begin();check(layout+' unsealed v1 grant uses original durable claim',!!r&&rows()[0].attempts===1&&rows()[0].state==='dispatching');
  check(layout+' unsealed v1 grant has its original ACK',await dispatch(r)==='granted'&&effects().length===1&&rows()[0].state==='settled');
  for(const raw of ['{malformed','null','{}']){
   await fresh(layout);await seal(raw);c=await capture();g=policy.betaGrantSql(c,6);
   check(layout+' any seal presence blocks begin '+raw,await grants.beginBetaLegacyGrant(env,c,subject)===null&&rows().length===0&&effects().length===0);
   check(layout+' seal is not added to shared receipt predicate '+raw,!g.sql.includes(sealKey)&&await policy.betaGrantCurrent(env,c));
  }
  await fresh(layout);beforeRun=async sql=>{if(sql.includes("'beta_guard_grant'")&&sql.startsWith('INSERT INTO role_settlements')){beforeRun=null;await seal();}};
  check(layout+' seal immediately before grant INSERT wins atomically',await begin()===null&&rows().length===0&&effects().length===0);
  await fresh(layout);r=await begin();await seal();
  check(layout+' seal after claim blocks pre-PUT read without erasing custody',await dispatch(r)==='held'&&effects().length===0&&rows()[0].state==='dispatching'&&rows()[0].attempts===1&&!!rows()[0].claim_nonce);
  await fresh(layout);r=await begin();afterRead=sql=>{if(sql.startsWith('SELECT 1 FROM role_settlements')){afterRead=null;delete env[modeKey];}};
  check(layout+' mode drift during final read holds before PUT',await dispatch(r)==='held'&&effects().length===0&&rows()[0].state==='dispatching');
  await fresh(layout);afterRead=sql=>{if(sql.startsWith('SELECT (SELECT value FROM site_settings')){afterRead=null;delete env[modeKey];}};c=await capture();
  check(layout+' mode is captured before the first policy await',c.mode==='open'&&policy.betaResetDispatchMode(env,c)==='held'&&await grants.beginBetaLegacyGrant(env,c,subject)===null&&rows().length===0&&effects().length===0);
  await fresh(layout);afterBatch=async plan=>{if(plan.some(x=>x.sql.startsWith('INSERT INTO role_settlements')&&x.sql.includes("'beta_guard_grant'"))){afterBatch=null;delete env[modeKey];}};
  r=await begin();check(layout+' mode drift while claim ACK is awaited preserves spent custody',!!r&&await dispatch(r)==='held'&&effects().length===0&&rows().length===1&&rows()[0].state==='dispatching'&&rows()[0].attempts===1&&!!rows()[0].claim_nonce);
  await fresh(layout);r=await begin();effectHook=async method=>{if(method==='PUT')await seal();};
  check(layout+' seal during PUT leaves exact ACK writer available',await dispatch(r)==='granted'&&rows()[0].reason==='legacy_put_acknowledged'&&rows()[0].state==='settled');
  await fresh(layout);r=await begin();effectHook=()=>{delete env[modeKey];};
  check(layout+' mode drift during PUT does not poison its original ACK',await dispatch(r)==='granted'&&rows()[0].reason==='legacy_put_acknowledged'&&rows()[0].state==='settled');
  await fresh(layout);r=await begin();effectHook=async()=>{await seal();throw Error('fixture lost PUT response');};let lost=false;
  try{await dispatch(r);}catch{lost=true;}
  check(layout+' seal during lost PUT preserves unknown attempt',lost&&rows().length===1&&rows()[0].state==='unknown'&&rows()[0].attempts===1&&effects().length===1);

  await fresh(layout);r=await begin();effectHook=async method=>{if(method==='PUT'){clock=policy.BETA_RESET_CUTOFF;await seal();}};
  check(layout+' sealed late compensation does not create a child or DELETE',await dispatch(r)==='held'&&effects().map(x=>x.method).join(',')==='PUT'&&rows().length===1&&rows()[0].state==='dispatching');
  for(const sealed of [false,true]){
   await fresh(layout);r=await begin();afterBatch=async plan=>{if(plan.some(x=>x.sql.includes("reason='legacy_put_acknowledged'"))){afterBatch=null;clock=policy.BETA_RESET_CUTOFF;if(sealed)await seal();throw Error('fixture committed grant ACK reply lost');}};
   const out=await dispatch(r),all=rows();
   check(layout+' committed-parent late compensation '+(sealed?'is fenced':'still works'),out==='held'&&(sealed
    ?all.length===1&&all[0].state==='settled'&&all[0].reason==='legacy_put_acknowledged'&&effects().length===1
    :all.length===2&&all.some(x=>x.purpose==='grant_compensation'&&x.state==='settled')&&effects().map(x=>x.method).join(',')==='PUT,DELETE'));
  }
  await fresh(layout);r=await begin();effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};
  beforeRun=async sql=>{if(sql.startsWith('INSERT INTO role_settlements')&&sql.includes("'grant_compensation'")){beforeRun=null;await seal();}};
  check(layout+' seal at compensation INSERT prevents claim and DELETE',await dispatch(r)==='held'&&rows().length===1&&effects().length===1);
  await fresh(layout);r=await begin();effectHook=method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;};
  afterBatch=async plan=>{if(plan.some(x=>x.sql.startsWith('INSERT INTO role_settlements')&&x.sql.includes("'grant_compensation'"))){afterBatch=null;delete env[modeKey];}};
  await dispatch(r);const stoppedChild=rows().find(x=>x.purpose==='grant_compensation');
  check(layout+' compensation mode drift during claim ACK preserves spent child without DELETE',rows().length===2&&stoppedChild?.state==='dispatching'&&stoppedChild.attempts===1&&!!stoppedChild.claim_nonce&&effects().length===1);
  for(const lostDelete of [false,true]){
   await fresh(layout);r=await begin();effectHook=async method=>{if(method==='PUT')clock=policy.BETA_RESET_CUTOFF;else{await seal();if(lostDelete)throw Error('fixture lost DELETE response');}};
   await dispatch(r);const child=rows().find(x=>x.purpose==='grant_compensation'),parent=rows().find(x=>x.purpose==='beta_guard_grant');
   check(layout+' seal does not block admitted compensation '+(lostDelete?'unknown':'ACK'),child.attempts===1&&!!child.claim_nonce&&child.state===(lostDelete?'unknown':'settled')&&parent.state===(lostDelete?'unknown':'held')&&effects().length===2);
  }

  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;roles=[memberRole];let out=await slice(layout+' v1 discovery');
  check(layout+' real discovery persists intent but bulk effect delegation holds',out.reason==='beta_dispatch_effect_fence_pending'&&out.discoveryPages===1&&out.processed===0&&effects().length===0&&rows().length===1&&rows()[0].attempts===0&&JSON.parse(scanRaw()).lease==='');
  let status=await engine.betaRoleResetStatus(env);
  check(layout+' pending role-file integration is not reported active or reusable',!status.removalsActive&&status.reason==='beta_dispatch_effect_fence_pending'&&status.removals.pending===1&&!status.finalCompletion&&!status.roleReuseReady);
  const existing=scanRaw();beforeRun=async(sql,values)=>{if(sql.startsWith('UPDATE site_settings')&&values[0]===engine.BETA_RESET_SCAN_KEY){beforeRun=null;await seal();}};
  out=await slice(layout+' existing scan claim race');
  check(layout+' existing scan claim consumes seal absence',out.state==='held'&&scanRaw()===existing&&effects().length===0);
  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;roles=[memberRole];beforeRun=async(sql,values)=>{if(sql.startsWith('INSERT INTO site_settings')&&values[0]===engine.BETA_RESET_SCAN_KEY){beforeRun=null;await seal();}};
  out=await slice(layout+' first scan claim race');check(layout+' first scan claim consumes seal absence',out.state==='held'&&scanRaw()===null&&requests.length===0&&rows().length===0);
  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;roles=[memberRole];afterBatch=async plan=>{if(plan.some(x=>x.sql.startsWith('INSERT INTO site_settings')&&x.params[0]===engine.BETA_RESET_SCAN_KEY)){afterBatch=null;await seal();}};
  out=await slice(layout+' sealed before page');check(layout+' page precheck holds sealed source without provider read',out.state==='held'&&requests.length===0&&rows().length===0);
  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;roles=[memberRole];pageHook=async()=>{pageHook=null;await seal();};
  out=await slice(layout+' seal during page');check(layout+' completed page cannot mint observations after seal',out.state==='held'&&rows().length===0&&effects().length===0&&JSON.parse(scanRaw()).completedPasses===0);
  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;roles=[memberRole];let beforeDiscovery;
  beforeRun=async sql=>{if(sql.startsWith('INSERT OR IGNORE INTO role_settlements')){beforeRun=null;beforeDiscovery=scanRaw();await seal();}};
  out=await slice(layout+' seal before discovery batch');check(layout+' both observation and cursor predicates consume seal absence',out.state==='held'&&rows().length===0&&scanRaw()===beforeDiscovery&&effects().length===0);
  await fresh(layout,'v1',false);clock=policy.BETA_RESET_CUTOFF;out=await slice(layout+' absent predecessor');
  check(layout+' absent-after-cutoff is held without synthetic policy or retirement',out.state==='held'&&out.reason==='beta_source_epoch_closed'&&scanRaw()===null&&db.prepare('SELECT COUNT(*) n FROM site_settings WHERE key IN(?,?)').get(policy.BETA_RESET_POLICY_KEY,sealKey).n===0);
  await fresh(layout);clock=policy.BETA_RESET_CUTOFF;const original=arm();await fixtureRun('UPDATE site_settings SET value=? WHERE key=?',JSON.stringify({version:3,state:'retired',originalPolicy:original,retiredAt:clock}),policy.BETA_RESET_POLICY_KEY);await seal();status=await engine.betaRoleResetStatus(env);
  check(layout+' retired original inventory stays distinct from absent predecessor',status.policyRetired&&status.inventoryKnown&&status.phase==='retired_awaiting_drain'&&!status.removalsActive&&!status.canArm&&!status.canRetire&&!status.finalCompletion&&!status.roleReuseReady);
  env[modeKey]='invalid';c=await capture();status=await engine.betaRoleResetStatus(env);
  check(layout+' invalid dispatch mode cannot hide retired original inventory',c.reason==='beta_reset_retired'&&policy.betaPolicyRetirementSql(env,c,1).sql!=='0=1'&&status.policyRetired&&status.inventoryKnown&&status.phase==='retired_awaiting_drain'&&!status.roleReuseReady);
 }
 check('original scheduling qualification and caps unchanged',engine.BETA_RESET_SCHEDULE_QUALIFIED===false&&JSON.stringify(engine.BETA_RESET_CAPS)===JSON.stringify({membersPerPage:1000,roleIntentsPerRun:6,network:40,physicalStatements:300}));
 console.log(`${passed}/${passed} checks passed`);
})().catch(error=>{console.error(error);console.error('BETA_DISPATCH_FENCE_FAILURE '+JSON.stringify({passed,physical:native?.nativeTrace.length??0,providerRequests:requests.length}));process.exitCode=1;})
 .finally(()=>{Date.now=realNow;globalThis.fetch=realFetch;if(db)db.close();});

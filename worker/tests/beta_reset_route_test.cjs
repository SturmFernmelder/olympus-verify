// Actual index/site-api/admin/reset route, real HMAC and SQLite. No runtime module substitutions.
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'beta_reset_slice_test.cjs'),'utf8'),marker='(async()=>{';
if(fixture.split(marker).length!==2)throw Error('slice fixture harness boundary changed');
const harness=fixture.slice(0,fixture.indexOf(marker));
const cases=String.raw`
const entry=load('index').default,core=load('site-core'),schema=load('schema');
const ROOT='/api/admin/beta-role-reset',ownerGeneration='a'.repeat(32);let actor,cookie,originalSignedSession,serial=0;const requestCosts=[];
const policyRow=()=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(policy.BETA_RESET_POLICY_KEY)?.value??null;
const mutate=(sql,...values)=>fixtureRun(sql,...values);
async function routeReset(installed=false,armed=false,at=policy.BETA_RESET_CUTOFF-60,absence=false){
 await reset(installed,1);schema.forgetSchemaCheck();clock=at;actor=String(710000000000000000n+BigInt(++serial));
 Object.assign(env,{SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://bot.example',COOKIE_SECRET:'synthetic-cookie-for-beta-reset-route',VERIFY_SECRET:'synthetic-verify',SITE_ADMINS:actor,PRIVACY_WRITE_ADMISSION_ENABLED:'true',ASSETS:{fetch(){throw Error('unexpected assets');}}});
 await mutate('INSERT INTO site_users(discord_id,username,in_server,denied,session_version,first_login,last_login,checked_at) VALUES(?1,?2,1,0,1,?3,?3,?3)',actor,'PRIVATE_OWNER_NAME',clock);
 if(!absence)await mutate("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',1,?3,?3)",actor,ownerGeneration,clock);
 if(armed)await mutate('UPDATE site_settings SET value=? WHERE key=?',arm(),policy.BETA_RESET_POLICY_KEY);else await mutate('DELETE FROM site_settings WHERE key=?',policy.BETA_RESET_POLICY_KEY);
 const issued=await currentEntry.issueOriginalEntryCookie(load,db,{...env,DB:originalNative},actor);cookie=issued.cookie;originalSignedSession=issued.session;
 console.log('ORIGINAL_OAUTH_FIXTURE '+JSON.stringify({requestedAbsence:absence,originalVersion:issued.session.v,generationPresent:!!issued.session.g,incarnationPresent:!!issued.session.n,privacySubjectPresent:!!db.prepare('SELECT 1 FROM privacy_subjects WHERE subject_id=?').get(actor)}));await mutate('UPDATE site_users SET checked_at=? WHERE discord_id=?',clock,actor);physical=0;requests=[];
}
async function request(method='GET',suffix='',payload,options={}){
 const uri='https://guild.example'+(options.path??ROOT+suffix),headers={Cookie:cookie,Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION,'Content-Type':'application/json',...(options.headers??{})};
 const req=new Request(uri,{method,headers,...(payload===undefined?{}:{body:options.raw??JSON.stringify(payload)})});
 const p=physical,n=requests.length,groupBefore=originalNative.nativeGroups.length,pending=[];const response=await entry.fetch(req,{...env,DB:originalNative},{waitUntil(x){pending.push(x);}});await Promise.all(pending);const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={text};}
 const cost={case:checks,method,suffix,status:response.status,physical:physical-p,http:requests.length-n,nativeGroups:originalNative.nativeGroups.slice(groupBefore).map(g=>g.length)};requestCosts.push(cost);console.log('NATIVE_ROUTE_OBSERVATION '+JSON.stringify(cost));
 assert.equal(cost.http,0,'owner reset route must never call providers');assert.ok(cost.physical<=300,'whole request physical SQL bound');
 return {status:response.status,data,text,cost};
}
const preview=()=>request(),armRequest=form=>request('POST','/arm',{form});
function privateStatus(name,r){check(name+' exposes no member names IDs or private authority',!r.text.includes(actor)&&!r.text.includes(subject(0))&&!r.text.includes('PRIVATE_')&&!/(claim_nonce|subject_generation|session_version|request_digest)/.test(r.text));check(name+' never claims completion or role reuse',r.data.finalCompletion===false&&r.data.roleReuseReady===false);}
function preservedWebsite(name){check(name+' keeps appointments and directory',db.prepare("SELECT value FROM site_settings WHERE key='appointed'").get().value===appointed&&db.prepare("SELECT value FROM site_settings WHERE key='leadership'").get().value==='fixture-preserved-leadership');}
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await routeReset(installed);let p=await preview();check(label+' genuine owner gets source cutoff preview',p.status===200&&p.data.phase==='before_cutoff'&&p.data.sourcePhase==='beta_source_open'&&p.data.canArm&&p.data.form);privateStatus(label+' preview',p);
  let r=await armRequest(p.data.form);check(label+' authentic form arms exact immutable policy without providers',r.status===200&&JSON.parse(policyRow()).version===2&&!policyRow().includes(actor)&&db.prepare('SELECT updated_by FROM site_settings WHERE key=?').get(policy.BETA_RESET_POLICY_KEY).updated_by===actor&&JSON.stringify(JSON.parse(policyRow()).roleIds)===JSON.stringify(policy.BETA_RESET_ROLE_IDS)&&requests.length===0);const raw=policyRow();r=await armRequest(p.data.form);check(label+' replay cannot replace armed policy',r.status===409&&policyRow()===raw);preservedWebsite(label);
  r=await request('POST','',{confirm:'RESET',closedAt:clock}, {path:'/api/admin/beta-reset'});check(label+' legacy website wipe is refused',r.status===410);preservedWebsite(label+' legacy refusal');
  for(const method of ['GET','PUT']){r=await request(method,'',method==='PUT'?{betaClosedAt:clock}:undefined,{path:'/api/admin/beta-reset'+(method==='PUT'?'/closed':'')});check(label+' superseded legacy '+method+' endpoint is refused',r.status===410);}
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF-60,true);const createdSubject=db.prepare('SELECT generation,state FROM privacy_subjects WHERE subject_id=?').get(actor);assert.equal(createdSubject?.state,'active','genuine issuer created active subject');assert.ok(originalSignedSession.g,'genuine issuer signed a nonempty generation');assert.equal(createdSubject.generation,originalSignedSession.g,'actual active generation matches genuine cookie');p=await preview();r=await armRequest(p.data.form);check(label+' genuine issuer creates active generation and arms without replacing original identity',r.status===200&&db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?').get(actor)?.generation===createdSubject.generation&&db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(actor)?.account_incarnation===originalSignedSession.n);
  await routeReset(installed);p=await preview();const concurrent=await Promise.all([armRequest(p.data.form),armRequest(p.data.form)]);check(label+' concurrent valid forms arm once',concurrent.filter(x=>x.status===200).length===1&&concurrent.filter(x=>x.status>=400).length===1&&!!policyRow());
  await routeReset(installed);p=await preview();let committed=false;const lost=sqls=>{if(!committed&&sqls.some(sql=>sql.startsWith('INSERT INTO site_settings(key,value,updated_at,updated_by)')&&sql.includes('ON CONFLICT(key) DO NOTHING RETURNING value'))){committed=true;batchAfter=null;sqlAfter=null;assert.ok(policyRow(),'policy really committed before reply loss');throw Error('synthetic arm committed reply lost');}};
  batchAfter=lost;sqlAfter=sql=>{if(!db.isTransaction)lost([sql]);};r=await armRequest(p.data.form);const durable=policyRow();check(label+' lost committed reply reports uncertainty with one durable policy',committed&&r.status===503&&!!durable);r=await armRequest(p.data.form);check(label+' lost-reply replay never re-arms',r.status===409&&policyRow()===durable);
  await routeReset(installed,false,policy.BETA_RESET_CUTOFF);p=await preview();check(label+' cutoff forbids new arming and reports source closure',p.status===200&&!p.data.canArm&&p.data.form===null&&p.data.sourcePhase==='closed_awaiting_new_source');r=await armRequest({expiresAt:clock+10,formNonce:'a'.repeat(32),token:'A'.repeat(43)});check(label+' cutoff POST never records new mandate',r.status===409&&policyRow()===null);
  for(const mutation of ['version','generation','retired','denied','departed','deleted','current_generation_removed','expiry']){
   await routeReset(installed);p=await preview();const authentic=crypto.subtle.verify.bind(crypto.subtle);let changed=false;
   crypto.subtle.verify=async(...args)=>{const ok=await authentic(...args);if(!changed&&new TextDecoder().decode(args[3]).startsWith('{"purpose":"beta-role-reset-arm-v1"')){changed=true;
    if(mutation==='version'){await mutate('UPDATE site_users SET session_version=? WHERE discord_id=?',originalSignedSession.v+1,actor);assert.equal(db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(actor).session_version,originalSignedSession.v+1,'original version race really changed');}
    if(mutation==='generation')await mutate('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','e'.repeat(32),actor);
    if(mutation==='retired')await mutate("UPDATE privacy_subjects SET state='retired',erased_at=?,retain_until=? WHERE subject_id=?",clock,clock+86400,actor);
    if(mutation==='denied')await mutate('UPDATE site_users SET denied=1 WHERE discord_id=?',actor);
    if(mutation==='departed')await mutate('UPDATE site_users SET in_server=0 WHERE discord_id=?',actor);
    if(mutation==='deleted')await mutate('DELETE FROM site_users WHERE discord_id=?',actor);
    if(mutation==='current_generation_removed'){assert.equal(db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?').get(actor)?.generation,originalSignedSession.g,'original signed generation exists before removal');await mutate('DELETE FROM privacy_subjects WHERE subject_id=?',actor);assert.equal(db.prepare('SELECT 1 FROM privacy_subjects WHERE subject_id=?').get(actor),undefined,'current generation deletion really committed');}
    if(mutation==='expiry')clock=p.data.form.expiresAt;
   }return ok;};try{r=await armRequest(p.data.form);}finally{crypto.subtle.verify=authentic;}
   check(label+' post-HMAC original authority race holds '+mutation,changed&&r.status>=400&&policyRow()===null&&requests.length===0);
  }
  await routeReset(installed);p=await preview();let changed=false;sqlBefore=async sql=>{if(!changed&&sql.startsWith('INSERT INTO site_settings(key,value,updated_at,updated_by)')&&sql.includes('ON CONFLICT(key) DO NOTHING RETURNING value')){changed=true;await mutate('UPDATE site_users SET session_version=? WHERE discord_id=?',originalSignedSession.v+1,actor);assert.equal(db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(actor).session_version,originalSignedSession.v+1,'consuming INSERT race really changed');}};r=await armRequest(p.data.form);check(label+' consuming INSERT repeats original owner fence',changed&&r.status>=400&&policyRow()===null);
 }
 for(const bad of ['anonymous','nonowner','wrongguild','malformedflag','origin','versionheader','query','method','roleinput','guildinput','unknownkey','duplicatekey','huge','token','expiry','nonce','sessionexpiry']){
  await routeReset();const p=await preview();let method='POST',suffix='/arm',payload={form:{...p.data.form}},options={};
  if(bad==='anonymous')cookie='';if(bad==='nonowner')env.SITE_ADMINS='';if(bad==='wrongguild')env.GUILD_ID='900000000000000009';if(bad==='malformedflag')env.BETA_RESET_REMOVALS_ENABLED='TRUE';if(bad==='origin')options.headers={Origin:'https://other.example'};if(bad==='versionheader')options.headers={'X-Olympus':'1'};if(bad==='query')suffix+='?extra=1';if(bad==='method')method='PUT';if(bad==='roleinput')payload.roleIds=[moderator];if(bad==='guildinput')payload.guildId='900000000000000009';if(bad==='unknownkey')payload.extra=true;if(bad==='duplicatekey')options.raw=JSON.stringify(payload).replace('{','{"form":{},');if(bad==='huge')options.raw=' '.repeat(1200)+JSON.stringify(payload);if(bad==='token')payload.form.token=(payload.form.token[0]==='A'?'B':'A')+payload.form.token.slice(1);if(bad==='expiry')payload.form.expiresAt--;if(bad==='nonce')payload.form.formNonce='f'.repeat(32);
  if(bad==='sessionexpiry'){const original=originalSignedSession;clock++;const later=await currentEntry.issueOriginalEntryCookie(load,db,{...env,DB:originalNative},actor);assert.deepEqual([later.session.u,later.session.v,later.session.g,later.session.n],[original.u,original.v,original.g,original.n],'same original identity for expiry mismatch');assert.equal(later.session.e,original.e+1,'genuine issuer changes only original expiry');cookie=later.cookie;}
  const r=await request(method,suffix,payload,options);check('closed route/form rejects '+bad,r.status>=400&&policyRow()===null&&requests.length===0);
 }
 for(const installed of [false,true]){const label=installed?'admitted':'native';
  await routeReset(installed,true,policy.BETA_RESET_CUTOFF);env.BETA_RESET_REMOVALS_ENABLED='false';let r=await preview();check(label+' disabled removals report inactive while source remains closed',r.data.phase==='inactive'&&r.data.sourcePhase==='closed_awaiting_new_source');privateStatus(label+' inactive',r);
  env.BETA_RESET_REMOVALS_ENABLED='true';r=await preview();check(label+' armed fresh run reports discovering',r.data.phase==='discovering');
  // Seed ordinary private continuation rows through the admitted transport; provider requests remain prohibited.
  const digest=await load('account-generation-contracts').sha256(policyRow()),id='b'.repeat(32);
  await mutate("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,created_at,expires_at) VALUES(?,?,'beta_reset',?,?,0,'pending','beta_inventory_observed',?,?,?)",id,subject(0),guild,memberRole,digest,clock,clock+300);
  r=await preview();check(label+' pending intent reports draining',r.data.phase==='draining'&&r.data.removals.pending===1);privateStatus(label+' draining',r);
  await mutate("UPDATE role_settlements SET state='unknown',attempts=1,reason='beta_reset_outcome_unknown' WHERE id=?",id);r=await preview();check(label+' uncertain removal reports held',r.data.phase==='held'&&r.data.removals.unknown===1);
  await mutate("UPDATE role_settlements SET state='settled',reason='beta_reset_absent' WHERE id=?",id);
  const state={version:1,epoch:policy.BETA_RESET_EPOCH,digest,pass:2,after:'0',lease:'',leaseUntil:0,passStartedAt:clock,scanned:0,observedAssignments:0,completedPasses:1,lastPassCompletedAt:clock,lastPassScanned:1,lastPassAssignments:0,lastError:null};
  await mutate('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',engine.BETA_RESET_SCAN_KEY,JSON.stringify(state),clock,'system:beta-reset');r=await preview();check(label+' clean pass awaits new source without completion claim',r.data.phase==='awaiting_new_source'&&r.data.finalCompletion===false&&r.data.roleReuseReady===false);privateStatus(label+' clean pass',r);
  // A clean inventory is not proof that an earlier PUT/compensation outcome is resolved.
  // Old custody deliberately has another digest and an elapsed expiry: neither retires it.
  const earlierGrant='c'.repeat(32),earlierCompensation='d'.repeat(32);
  const seedCustody=(rowId,roleId,grantGuild,purpose,desired,attempts,state)=>mutate("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,attempts,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'PRIVATE_OLD_GRANT_REASON',?,?,?,?)",rowId,subject(0),purpose,grantGuild,roleId,desired,state,'e'.repeat(64),attempts,clock-600,clock-300);
  await seedCustody(earlierGrant,policy.BETA_RESET_ROLE_IDS[11],guild,'legacy_beta_grant',1,1,'unknown');
  const parentBefore=JSON.stringify(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(earlierGrant));
  r=await preview();check(label+' unknown earlier PUT keeps clean pass held with exact aggregate count',r.data.phase==='held'&&r.data.removals.unresolvedGrantCustody===1&&r.data.removals.unknown===0&&JSON.stringify(db.prepare('SELECT * FROM role_settlements WHERE id=?').get(earlierGrant))===parentBefore);privateStatus(label+' earlier PUT custody',r);
  await seedCustody(earlierCompensation,memberRole,guild,'grant_compensation',0,1,'dispatching');
  await seedCustody('e'.repeat(32),moderator,guild,'legacy_beta_grant',1,1,'unknown');
  await seedCustody('f'.repeat(32),memberRole,'900000000000000009','legacy_beta_grant',1,1,'unknown');
  await seedCustody('1'.repeat(32),memberRole,guild,'legacy_beta_grant',1,0,'unknown');
  await seedCustody('2'.repeat(32),memberRole,guild,'unrelated_remove',0,1,'unknown');
  r=await preview();check(label+' unresolved custody counts consumed scoped PUT and compensation only',r.data.phase==='held'&&r.data.removals.unresolvedGrantCustody===2&&requests.length===0);
  await mutate("UPDATE role_settlements SET state='settled' WHERE id=?",earlierGrant);r=await preview();check(label+' unresolved compensation alone still prevents clean completion',r.data.phase==='held'&&r.data.removals.unresolvedGrantCustody===1);
  await mutate("UPDATE role_settlements SET state='settled' WHERE id=?",earlierCompensation);r=await preview();check(label+' resolved grants still expose other uncertain scoped removals',r.data.phase==='held'&&r.data.removals.unresolvedGrantCustody===0&&r.data.removals.unresolvedOtherRoleCustody===1&&db.prepare("SELECT COUNT(*) n FROM role_settlements WHERE id IN(?,?,?,?) AND state='unknown'").get('e'.repeat(32),'f'.repeat(32),'1'.repeat(32),'2'.repeat(32)).n===4);privateStatus(label+' resolved earlier custody',r);
  await mutate('UPDATE site_settings SET value=? WHERE key=?',JSON.stringify({...state,lastError:'PRIVATE_MEMBER_NAME '+subject(0)}),engine.BETA_RESET_SCAN_KEY);r=await preview();privateStatus(label+' malformed scan diagnostic',r);
 }
 console.log('BETA_RESET_ROUTE_SUMMARY '+JSON.stringify({checks,requests:requestCosts.length,maxPhysical:Math.max(...requestCosts.map(x=>x.physical)),maxHttp:Math.max(...requestCosts.map(x=>x.http)),costs:requestCosts}));console.log(checks+'/'+checks+' checks passed');
})().catch(e=>{console.error(e);console.log('PRESERVED_NATIVE_FAILURE '+JSON.stringify({observation:nativeObservation(),checks:typeof checks==='number'?checks:n}));process.exitCode=1;}).finally(()=>{Date.now=realNow;if(db)db.close();});
`;
new Function('__dirname','require',harness+cases)(__dirname,require);

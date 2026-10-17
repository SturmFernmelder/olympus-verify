// Actual source, admitted D1-shaped SQLite and installed source catalogue. No live issuer,
// provider drain mock, optional barrier boolean, original assertion edit or reset activation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),entry=require('./helpers/privacy129_fixture.cjs');
const root=path.join(__dirname,'..'),cache={};globalThis.crypto=require('node:crypto').webcrypto;
function load(name){if(name.startsWith('node:'))return require(name);name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;
 const m={exports:{}};cache[name]=m;const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,p=>load(p));return m.exports;}
const P=load('beta-reset-policy'),C=load('beta-source-closure'),A=load('privacy-write-admission');
const originalNow=Date.now,originalFetch=globalThis.fetch;let clock=P.BETA_RESET_CUTOFF,db,native,writer,env,beforeRun=null,afterBatch=null,outbound=0,passed=0;
Date.now=()=>clock*1000;globalThis.fetch=async()=>{outbound++;throw Error('no provider operation belongs to native closure');};
const epoch='olympus-full-release-test-2026',subject='400000000000000002',owner='700000000000000001';
const freshRaw=()=>JSON.stringify({version:1,epoch,epochStart:1793833200,grants:false,membership:'1600000000000000001',native:Array.from({length:10},(_,i)=>String(1600000000000000002n+BigInt(i)))});
const originalPolicy=()=>JSON.stringify({version:2,epoch:P.BETA_RESET_EPOCH,cutoff:P.BETA_RESET_CUTOFF,guildId:P.BETA_RESET_GUILD_ID,roleIds:[...P.BETA_RESET_ROLE_IDS],armedAt:P.BETA_RESET_CUTOFF-100});
const retired=()=>JSON.stringify({version:3,state:'retired',originalPolicy:originalPolicy(),retiredAt:P.BETA_RESET_CUTOFF});
const run=(sql,...values)=>writer.prepare(sql).bind(...values).run();
const sealRaw=()=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(P.BETA_RESET_DISPATCH_SEAL_KEY)?.value??null;
function check(name,ok){assert.ok(ok,name);passed++;console.log('PASS '+name);}
async function fixture(layout,policy=null){if(db)db.close();clock=P.BETA_RESET_CUTOFF;beforeRun=null;afterBatch=null;outbound=0;
 db=new DatabaseSync(':memory:');db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(clock);});
 entry.installCurrentEntryEpoch(db,{now:clock,layout});native=entry.originalNativePort(db,{beforeRun:async(sql,params)=>{if(beforeRun)await beforeRun(sql,params);},afterBatch:async(plan,result)=>{if(afterBatch)await afterBatch(plan,result);}});
 writer=A.createPrivacyWriteAdmissionDatabase(native,'writer',layout,entry.ENTRY_EPOCH);
 env=entry.currentEntryEnvironment({DB:writer,GUILD_ID:P.BETA_RESET_GUILD_ID,DISCORD_APP_ID:'700000000000000002',DISCORD_BOT_TOKEN:'fixture-only',SITE_ADMINS:owner,
  ROLE_GUILD_MEMBER:P.BETA_RESET_ROLE_IDS[0],ROLE_GUILD_LEADER:'1554261979684933742',ROLE_OFFICER:'1554262223038324840',ROLE_RAID_LEADER:'1554262510650007602',
  ROLE_MODERATOR:'571363393555136512',ROLE_GUILD_MASTER:'',FULL_RELEASE_ROLES:freshRaw(),BETA_RESET_DISPATCH_SEAL_MODE:'v1',BETA_RESET_SOURCE_EPOCH:epoch,
  LINKS_NOT_BEFORE:'1793833200',QR_PRIVILEGED_RANK_MAPPING_ENABLED:'false',BETA_RESET_REMOVALS_ENABLED:'false'},{layout});
 if(policy!==null)await run('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)',P.BETA_RESET_POLICY_KEY,policy,clock,owner);
}
(async()=>{for(const layout of ['canonical','recorded-live-20261010']){
 await fixture(layout);clock=P.BETA_RESET_CUTOFF-1;
 check(layout+' no plan before source cutoff',await C.captureBetaNativeSourceClosure(env)===null&&sealRaw()===null);
 for(const raw of [originalPolicy(),'{malformed','null','{}']){
  await fixture(layout,raw);check(layout+' V2/malformed policy is never absence '+raw.slice(0,20),await C.captureBetaNativeSourceClosure(env)===null&&sealRaw()===null);
 }
 await fixture(layout);delete env.BETA_RESET_SOURCE_EPOCH;
 check(layout+' absent closure profile does not create plan',await C.captureBetaNativeSourceClosure(env)===null);
 env.BETA_RESET_SOURCE_EPOCH=undefined;check(layout+' present undefined closure profile refuses',await C.captureBetaNativeSourceClosure(env)===null);
 let getterCalls=0;Object.defineProperty(env,'BETA_RESET_SOURCE_EPOCH',{get(){getterCalls++;return epoch;},configurable:true});
 check(layout+' accessor refuses without reading getter',await C.captureBetaNativeSourceClosure(env)===null&&getterCalls===0);
 await fixture(layout);env.BETA_RESET_SOURCE_EPOCH=P.BETA_RESET_EPOCH;
 check(layout+' old epoch cannot be selected as a fresh epoch',await C.captureBetaNativeSourceClosure(env)===null);
 await fixture(layout);env.PRIVACY_WRITE_ADMISSION_EPOCH='b'.repeat(32);
 check(layout+' claimed Native epoch must equal the original admitted wrapper epoch',await C.captureBetaNativeSourceClosure(env)===null);
 await fixture(layout);let epochCap=await C.captureBetaNativeSourceClosure(env);assert.ok(epochCap);
 db.prepare("UPDATE privacy_write_admission SET epoch=? WHERE singleton=1").run('b'.repeat(32));
 check(layout+' actual Native epoch drift refuses in the consuming admission transaction',await C.executeBetaNativeSourceClosure(epochCap)===null&&sealRaw()===null);
 await fixture(layout);let cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);env.FULL_RELEASE_ROLES=freshRaw().replace('test-2026','different');
 check(layout+' post-capture fresh configuration drift refuses',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 check(layout+' copied receipt cannot issue a seal',await C.executeBetaNativeSourceClosure({...cap})===null);
 await fixture(layout);cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);
 await run('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)',P.BETA_RESET_POLICY_KEY,originalPolicy(),clock);
 check(layout+' policy inserted after absence capture wins consuming CAS',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 await run('DELETE FROM site_settings WHERE key=?',P.BETA_RESET_POLICY_KEY);
 check(layout+' failed consuming plan cannot be retried',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 await fixture(layout,retired());cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);
 await run('UPDATE site_settings SET value=? WHERE key=?',retired().replace('retiredAt":'+P.BETA_RESET_CUTOFF,'retiredAt":'+(P.BETA_RESET_CUTOFF+1)),P.BETA_RESET_POLICY_KEY);
 check(layout+' changed retirement cannot consume original plan',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 await fixture(layout);cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);db.exec('DROP TRIGGER beta_dispatch_seal_no_delete');
 check(layout+' removed immutable trigger refuses at actual write',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 await fixture(layout);cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);db.exec('CREATE TABLE unexpected_profile_object(x TEXT)');
 check(layout+' unexpected installed object cannot pass the complete catalogue proof',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()===null);
 await fixture(layout);cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);
 afterBatch=async plan=>{if(plan.some(s=>s.sql.includes('system:beta-source-closure'))){afterBatch=null;throw Error('fixture reply lost after actual COMMIT');}};
 check(layout+' committed seal with lost reply remains unknown to issuer',await C.executeBetaNativeSourceClosure(cap)===null&&sealRaw()!==null);
 check(layout+' committed-lost-reply plan is never retried',await C.executeBetaNativeSourceClosure(cap)===null);
 for(const predecessor of ['absent','retired']){
  await fixture(layout,predecessor==='retired'?retired():null);
  for(const [i,state] of ['pending','dispatching','unknown','settled'].entries())await run(`INSERT INTO role_settlements
   (id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at)
   VALUES(?,?,?,?,?,0,?,'fixture-old-custody',?,?,?,?)`,String(i).padStart(32,'0'),subject,'grant_compensation',P.BETA_RESET_GUILD_ID,P.BETA_RESET_ROLE_IDS[0],state,i?1:0,i?'a'.repeat(32):null,clock-10,clock+1000);
  const oldRows=JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all());
  cap=await C.captureBetaNativeSourceClosure(env);assert.ok(cap);const out=await C.executeBetaNativeSourceClosure(cap);assert.ok(out);
  check(layout+' '+predecessor+' returns only Native closure',out.nativeDispatchClosed===true&&out.providerDrainQualified===false&&out.restoreBarrierQualified===false&&out.allVersionClosureQualified===false&&out.allPhysicalCopyReplayQualified===false&&out.roleReuseReady===false);
  const seal=JSON.parse(sealRaw());
  check(layout+' '+predecessor+' binds separate canonical fresh record',seal.oldEpoch===P.BETA_RESET_EPOCH&&seal.freshEpoch.epoch===epoch&&seal.freshEpoch.epoch!==seal.oldEpoch&&seal.freshEpoch.freshConfig===freshRaw()&&seal.freshEpoch.freshConfigDigest===await load('account-generation-contracts').sha256(freshRaw()));
  check(layout+' '+predecessor+' preserves every original custody row byte-for-byte',JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all())===oldRows);
  check(layout+' '+predecessor+' original capability is single-use',await C.executeBetaNativeSourceClosure(cap)===null);
  const second=await C.captureBetaNativeSourceClosure(env);assert.ok(second);
  check(layout+' '+predecessor+' same epoch cannot issue a second seal',await C.executeBetaNativeSourceClosure(second)===null&&sealRaw()===out.seal);
  await assert.rejects(run('DELETE FROM site_settings WHERE key=?',P.BETA_RESET_DISPATCH_SEAL_KEY));passed++;console.log('PASS '+layout+' '+predecessor+' sealed epoch cannot be deleted');
  await assert.rejects(run('UPDATE site_settings SET value=? WHERE key=?',out.seal.replace(epoch,'olympus-full-release-other'),P.BETA_RESET_DISPATCH_SEAL_KEY));passed++;console.log('PASS '+layout+' '+predecessor+' fresh epoch/config cannot be replaced');
  const capture=P.captureBetaRemovalDispatch(env),pair=P.captureBetaRoleDispatch(env);
  check(layout+' '+predecessor+' late receipt-less beta removal stays fenced',!P.betaRemovalDispatchLegacy(env,capture,P.BETA_RESET_GUILD_ID,P.BETA_RESET_ROLE_IDS[0]));
  {const predicate=P.betaRoleDispatchSql(env,pair,"'"+P.BETA_RESET_GUILD_ID+"'","'"+P.BETA_RESET_ROLE_IDS[0]+"'",'1=1');
   const before=JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all());
   await run(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,created_at,expires_at)
    SELECT ?,?,'grant_compensation',?,?,0,'pending','late-producer',?,? WHERE ${predicate}`,'f'.repeat(32),subject,P.BETA_RESET_GUILD_ID,P.BETA_RESET_ROLE_IDS[0],clock,clock+100);
   check(layout+' '+predecessor+' late compensation INSERT consumes real restriction',JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all())===before);
  }
  check(layout+' '+predecessor+' performs zero provider calls and does not arm removal',outbound===0&&env.BETA_RESET_REMOVALS_ENABLED==='false');
 }
 assert.throws(()=>C.requireBetaOldSourceRoleReuse(),/provider_restore_authority_unavailable/);passed++;console.log('PASS '+layout+' external role reuse authority remains unavailable');
 }
 console.log(passed+'/'+passed+' beta source closure checks passed');
})().finally(()=>{Date.now=originalNow;globalThis.fetch=originalFetch;if(db)db.close();}).catch(error=>{console.error(error);process.exitCode=1;});

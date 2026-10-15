// First-stage account downloads: native fixed-deadline credential cleanup without account erasure/retention.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs'),fixtureSource=fs.readFileSync(fixturePath,'utf8'),cut=fixtureSource.indexOf('async function main(){');
if(cut<0)throw Error('genuine fixture boundary changed');
const scenario=String.raw`const retention=load('privacy-retention');
async function seedExpiry(f){const clock=f.time();
 for(let i=0;i<120;i++){const live=i>=110,at=clock+(live?0:-721),oauthAt=clock+(live?0:-301),key=(i+1).toString(16).padStart(64,'0');
 await fixtureWrite(f,"INSERT INTO privacy_access_oauth(state_hash,browser_hash,purpose,created_at,expires_at) VALUES(?,?,'privacy_identify',?,?)",key,'a'.repeat(64),oauthAt,oauthAt+300);
 await fixtureWrite(f,"INSERT INTO privacy_access_grants(session_hash,purpose,grant_id,csrf_hash,subject_id,created_at,expires_at) VALUES(?,'own_export',?,?,?,?,?)",key,(i+1).toString(16).padStart(32,'0'),'b'.repeat(64),A,at,at+720);}
 await fixtureWrite(f,'INSERT INTO audit(ts,actor,action) VALUES(?,?,?)',clock-31536001,A,'retained.account.action');}
const baseSlot=Math.floor(1792688400000/1800000)*1800000;
const phase=(name)=>{context.phaseClock.value=baseSlot+(name==='beta'?900000:0);};
async function mainExpiry(){
 for(const selected of ['general','beta']){
 phase(selected);
 for(const [accessFlag,retentionFlag,want] of [[undefined,undefined,0],['false','false',0],['true','false',2],['true',undefined,2],['true','true',21],['false','true',21],['TRUE','TRUE',0]]){
 const f=fixture();await seedExpiry(f);let attempts=0,batches=[],logical=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>{batches.push(s.length);const admission=load('privacy-write-admission');let lineage=admission.originalPrivacyAdmissionBatchLineage(s);for(let i=0;i<4&&lineage?.kind!=='central';i++)lineage=lineage&&admission.originalPrivacyAdmissionBatchLineage(lineage.parent);assert.equal(lineage?.kind,'central','original central Native batch');logical=lineage.logical;};
 const env={...f.env,PRIVACY_ACCESS_ENABLED:accessFlag,PRIVACY_RETENTION_ENABLED:retentionFlag,BETA_RESET_REMOVALS_ENABLED:'false'},cap=retention.captureServingRetentionSchedule();const n=await retention.sweepServingRetention(env,cap);
 const logicalWant=selected==='general'?want:(want===21?12:want+4);
 const admission=load('privacy-write-admission'),all=admission.originalPrivacyAdmissionGroupProjection(env.DB,retention.servingRetentionStatements(env)).logical;
 const local=admission.originalPrivacyAdmissionGroupProjection(env.DB,[load('beta-reset-scan').betaResetCursorRetentionStatement(env),...load('beta-reset-retention').betaResetReceiptRetentionStatements(env),load('ruleset-publication-data').rulesetActivationAttributionRetentionStatement(env)]).logical;
 const original=want===21?(selected==='general'?all.slice(6):[...all.slice(0,6),...all.slice(7,9)]):want===2?all.slice(7,9):[];
 eq('exact original page and unconditional beta lifecycle '+selected+'/'+accessFlag+'/'+retentionFlag,Array.from(logical,x=>x.sql),Array.from([...original,...(selected==='beta'?local:[])],x=>x.sql));
 eq('exact physical attempts include four Native write controls',attempts,logicalWant?logicalWant+4:0);eq('one original Native batch or none',batches,logicalWant?[logicalWant+4]:[]);
 eq('each credential table removes only first100 expired rows',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants')],want?[20,20]:[120,120]);
 eq('noncredential action held unless general account retention ON',count(f,'audit'),retentionFlag==='true'&&selected==='general'?0:1);
 eq('removed count is genuine native changes',n,want?200+(retentionFlag==='true'&&selected==='general'?1:0):0);
 if(want){f.hooks.statement=null;f.hooks.beforeBatch=null;await retention.sweepServingRetention(env);eq('second bounded page preserves live10',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants')],[10,10]);}
 eq('no provider requests in credential cleanup',calls.length,0);f.db.close();}

 const f=fixture();await seedExpiry(f);const original=[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants'),count(f,'audit')];f.hooks.step=i=>{if(i===3)throw Error('native second credential statement fault');};let failed=false;try{await retention.sweepServingRetention({...f.env,PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'false'});}catch{failed=true;}
 ok('mid-batch expiry error propagated '+selected,failed);eq('native atomic rollback retains both expired sets and action',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants'),count(f,'audit')],original);f.hooks.step=null;
 f.hooks.afterBatch=(list,rows)=>{rows.splice(3,1);};let unknown=false;try{await retention.sweepServingRetention({...f.env,PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'false'});}catch(e){unknown=e.message==='privacy_retention_outcome_unknown';}
 ok('short response refuses claimed cleanup result '+selected,unknown);eq('unknown response does not invent account deletion',count(f,'audit'),1);eq('cleanup contains no grant renewal',[...f.db.prepare('SELECT expires_at-created_at AS seconds FROM privacy_access_grants').all()].every(r=>r.seconds===720),true);f.db.close();
 }
 // An installed epoch refuses raw-native writes. Preserve that guard rather than manufacturing an OFF bypass.
 for(const selected of ['general','beta'])for(const [accessFlag,retentionFlag,want]of [['false','false',0],['true','false',2],['false','true',21],['TRUE','TRUE',0]]){
 phase(selected);const f=fixture();await seedExpiry(f);const at=f.time()-31536000;for(const [key,value]of [['rulesetActivatedBy',A],['rulesetActivatedAt',String(at)]])await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)',key,value,at);
 f.ready();let attempts=0,plans=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>plans.push(s.map(x=>x.sql));
 const env={...f.nativeEnv,DB:f.native,PRIVACY_WRITE_ADMISSION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:accessFlag,PRIVACY_RETENTION_ENABLED:retentionFlag,BETA_RESET_REMOVALS_ENABLED:'false'};
 const expected=selected==='general'?want:want===21?12:want+4;let refusal=false,n=null;
 try{n=await retention.sweepServingRetention(env,retention.captureServingRetentionSchedule());}catch(e){refusal=e.message==='privacy_write_admission_required';}
 eq('raw installed-native '+selected+' flag OFF never bypasses current epoch '+accessFlag+'/'+retentionFlag,refusal,expected>0);
 eq('raw native still submits exact authored logical page or none',plans.map(x=>x.length),expected?[expected]:[]);ok('raw native refusal is bounded before undeclared work',expected?attempts>0&&attempts<=expected:attempts===0&&n===0);
 eq('raw native refused page rolls credentials back',[count(f,'privacy_access_oauth'),count(f,'privacy_access_grants')],[120,120]);
 eq('raw native refusal preserves actor attribution',f.db.prepare("SELECT value FROM site_settings WHERE key='rulesetActivatedBy'").get().value,A);eq('native refusal has no provider traffic',calls.length,0);f.db.close();
 }
 // The fourth statement is the exact reviewed export: beta-only, fixed database-time year, no clock renewal.
 for(const installed of [true]){
 phase('beta');const f=fixture(),at=f.time()-31536000;for(const [key,value]of [['rulesetActivatedBy',A],['rulesetActivatedAt',String(at)],['rulesetMode','full_release'],['rulesetActiveRevision','forever-release-synthetic'],['rulesetActiveDigest','e'.repeat(64)]])await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)',key,value,at,A);
 f.ready();const env={...f.env,DB:installed?f.env.DB:f.native,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false',BETA_RESET_REMOVALS_ENABLED:'false'};
 const pins=()=>f.db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key LIKE 'ruleset%' ORDER BY key").all().map(r=>({...r}));const original=pins();f.advance(-1);await retention.sweepServingRetention(env);eq('activation actor remains one second before original horizon '+installed,pins(),original);
 f.advance(1);await retention.sweepServingRetention(env);const expected=original.map(r=>({...r,value:r.key==='rulesetActivatedBy'?'':r.value}));eq('exact beta horizon clears attribution value only '+installed,pins(),expected);
 await retention.sweepServingRetention(env);eq('activation cleanup is idempotent and never renews activation '+installed,pins(),expected);eq('activation cleanup has no provider calls',calls.length,0);f.db.close();
 }
 // Composition-only rows exercise actual installed-epoch DELETE/UPDATE admission; provider acknowledgement
 // semantics are independently exercised by the public-154 actual-operation receipt suite.
 phase('beta');{
 const f=fixture(),policy=load('beta-reset-policy'),at=policy.BETA_RESET_CUTOFF-10;f.setTime(policy.BETA_RESET_CUTOFF+31536000);
 const ids=['1'.repeat(32),'2'.repeat(32)];for(const [i,subject]of [A,B].entries())await fixtureWrite(f,"INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,claim_nonce,attempts,created_at,expires_at,checked_at)VALUES(?,?,'beta_guard_grant',?,?,1,?,?,?,1,?,?,?)",ids[i],subject,policy.BETA_RESET_GUILD_ID,policy.BETA_RESET_ROLE_IDS[0],i?'unknown':'settled',i?'legacy_put_outcome_unknown':'legacy_put_acknowledged','a'.repeat(32),at,at+300,at);
 const cursor={version:1,epoch:policy.BETA_RESET_EPOCH,digest:'d'.repeat(64),pass:1,after:B,lease:'',leaseUntil:0,passStartedAt:at,scanned:1000,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null};
 await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','betaResetScanV1',JSON.stringify(cursor),f.time()-300);f.ready();const unknown=()=>f.db.prepare('SELECT * FROM role_settlements WHERE id=?').get(ids[1]),original=unknown();
 await retention.sweepServingRetention({...f.env,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false',BETA_RESET_REMOVALS_ENABLED:'false'},retention.captureServingRetentionSchedule());
 eq('installed beta phase expires positively acknowledged original record',f.db.prepare('SELECT COUNT(*)n FROM role_settlements WHERE id=?').get(ids[0]).n,0);
 eq('installed beta phase retains exact original unknown receipt',unknown(),original);const after=JSON.parse(f.db.prepare("SELECT value FROM site_settings WHERE key='betaResetScanV1'").get().value);
 eq('installed beta phase clears valid stale personal cursor',[after.after,after.pass,after.scanned],['0',2,0]);let held=false;try{await f.env.DB.batch(load('qr-phase1-data').qrErasureStatements(f.env,B));}catch(e){held=/qr_provider_custody_held|malformed JSON/.test(e.message);}
 ok('actual installed erasure still refuses unresolved original custody',held);eq('erasure refusal preserves original unknown byte values',unknown(),original);eq('installed receipt/cursor composition has no provider traffic',calls.length,0);f.db.close();
 }
 // Same original clock method and cap across a delayed continuation; no later phase recapture.
 for(const selected of ['general','beta']){
 phase(selected);const f=fixture();f.ready();let attempts=0,logical=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>{let lineage=load('privacy-write-admission').originalPrivacyAdmissionBatchLineage(s);for(let i=0;i<4&&lineage?.kind!=='central';i++)lineage=lineage&&load('privacy-write-admission').originalPrivacyAdmissionBatchLineage(lineage.parent);logical=lineage.logical;};
 const env={...f.env,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false',BETA_RESET_REMOVALS_ENABLED:'false'},cap=retention.captureServingRetentionSchedule();context.phaseClock.value+=900000;
 await retention.sweepServingRetention(env,cap);eq('original '+selected+' phase survives forward boundary',logical.length,selected==='beta'?4:0);const before=attempts;
 await refused('same original phase cap cannot run twice',()=>retention.sweepServingRetention(env,cap));eq('spent cap consumes no SQL',attempts,before);
 await refused('forged phase cap refused',()=>retention.sweepServingRetention(env,{}));eq('forged cap consumes no SQL',attempts,before);f.db.close();
 }
 phase('beta');const f=fixture();f.ready();let attempts=0;f.hooks.statement=()=>attempts++;const env={...f.env,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false'};
 let cap=retention.captureServingRetentionSchedule();context.phaseClock.value--;await refused('clock regression refuses captured phase',()=>retention.sweepServingRetention(env,cap));eq('clock regression consumes no SQL',attempts,0);context.phaseClock.value++;
 cap=retention.captureServingRetentionSchedule();vm.runInContext('savedRetentionNow=Date.now;Date.now=()=>phaseClock.value',context);await refused('replacement Date method cannot renew schedule authority',()=>retention.sweepServingRetention(env,cap));eq('replacement clock consumes no SQL',attempts,0);vm.runInContext('Date.now=savedRetentionNow',context);
 // Two distinct original invocations overlap; each submits one batch. No pass is dispatched twice.
 let reached,release;const ready=new Promise(r=>reached=r),wait=new Promise(r=>release=r);let batches=0;
 f.hooks.beforeBatch=async()=>{batches++;if(batches===1){reached();await wait;}};
 const first=retention.sweepServingRetention(env,retention.captureServingRetentionSchedule());await ready;
 await retention.sweepServingRetention(env,retention.captureServingRetentionSchedule());release();await first;
 eq('two overlapping original caps submit exactly one batch each',batches,2);eq('overlap is fixed16 admitted statements',attempts,16);
 // A lost reply is left unknown to its caller, with no implicit retry or second batch.
 f.hooks.beforeBatch=()=>batches++;f.hooks.afterBatch=()=>{throw Error('synthetic lost acknowledged local reply');};let lost=false;const prior=batches;
 try{await retention.sweepServingRetention(env,retention.captureServingRetentionSchedule());}catch(e){lost=e.message==='synthetic lost acknowledged local reply';}
 ok('lost committed cleanup reply remains an error',lost);eq('lost reply is never retried in the same invocation',batches,prior+1);f.hooks.afterBatch=null;
 await retention.sweepServingRetention(env,retention.captureServingRetentionSchedule());eq('fresh original invocation is one idempotent page',batches,prior+2);eq('all phase and overlap tests use no provider',calls.length,0);f.db.close();
 console.log('privacy_credential_expiry_stage_review_test: '+checks+'/'+checks+' passed');}
mainExpiry().catch(e=>{console.error(e);process.exitCode=1;});`;
const m=new Module(__filename,module);m.filename=__filename;m.paths=module.paths;let prefix=fixtureSource.slice(0,cut);
const seam='const context=vm.createContext({crypto:webcrypto,';
if(prefix.split(seam).length!==2)throw Error('original fresh VM clock seam changed');
prefix=prefix.replace(seam,`const phaseClock={value:Math.floor(1792688400000/1800000)*1800000};class PhaseDate extends Date{static now(){return phaseClock.value;}}
const context=vm.createContext({Date:PhaseDate,phaseClock,crypto:webcrypto,`);
m._compile(prefix+scenario,__filename);

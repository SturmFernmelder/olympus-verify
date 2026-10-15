// Genuine identify-only OAuth export against the actual history projection, not a direct JSON formatter.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const original=fs.readFileSync(path.join(__dirname,'privacy_access_test.cjs'),'utf8'),cut=original.indexOf('async function main(){');
if(cut<0)throw Error('identity fixture changed');
const cases=String.raw`
// The retention sweep takes its phase from the clock the source captured when it loaded ('phase never comes from a later
// clock'): even quarter-hour slots are the general phase, odd ones the beta phase, and the beta-reset cursor retention runs
// in the beta phase only. The cleanup case below asserts the beta-phase outcome, so the suite pins the clock the source will
// capture before the source loads - as beta_reset_schedule_test installs its clock before load - to a clock that starts at the
// beginning of an odd slot (this slot's start when it is odd, the next slot's start when it is even) and then runs at real
// speed: monotonic, and inside that odd slot for fifteen minutes from suite start, so no boundary crossing during the run can
// turn the captured phase back to 'general'. The source runs in this harness's vm context, so the pin is set on that context's
// Date (the one the source captures); this realm's Date.now is mapped identically so each fixture's SQL clock is seeded from the
// same instant. No source path, admission or expiry predicate is bypassed; both clocks are restored after the last sweep.
const sourceDate=vm.runInContext('Date',context),realNow=Date.now,sourceRealNow=sourceDate.now,startReal=realNow();
const pinnedStart=(Math.floor(startReal/900000)|1)*900000,phaseShift=pinnedStart-startReal;
Date.now=()=>pinnedStart+(realNow()-startReal);sourceDate.now=()=>pinnedStart+(sourceRealNow()-startReal);
const beta=load('beta-reset-policy'),cursor=load('beta-reset-scan'),retention=load('privacy-retention'),admission=load('privacy-write-admission');
async function own(f){const connected=await connect(f),frm=await form(f,connected);provider=null;const before=calls.length,response=await copy.exportPrivacyAccess(frm.request({collection:'site.settingUpdates',cursor:''}),f.env),data=await response.json();eq('metadata copy has no further provider calls',calls.length,before);ok('metadata copy excludes foreign IDs and private values',![B,STAFF,'PRIVATE_DATA','a'.repeat(64)].some(x=>JSON.stringify(data).includes(x))&&!JSON.stringify(data.history).includes(A));return data.history;}
const scan=(f,id)=>JSON.stringify({version:1,epoch:beta.BETA_RESET_EPOCH,digest:'a'.repeat(64),pass:1,after:id,lease:'',leaseUntil:0,passStartedAt:f.time()-1000,scanned:1000,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null});
(async()=>{
 for(const installed of [false,true]){const label=installed?'admitted':'native',f=fixture();try{
  const put=f.db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)');
  put.run(beta.BETA_RESET_POLICY_KEY,JSON.stringify({version:2,epoch:beta.BETA_RESET_EPOCH,cutoff:beta.BETA_RESET_CUTOFF,guildId:beta.BETA_RESET_GUILD_ID,roleIds:Array.from(beta.BETA_RESET_ROLE_IDS),armedAt:beta.BETA_RESET_CUTOFF-100}),f.time()-1,A);
  put.run('betaRetentionAnchorV1','PRIVATE_DATA',f.time()-2,A);put.run(cursor.BETA_RESET_SCAN_KEY,scan(f,A),f.time(),'system:beta-reset');
  f.ready();console.log('CURRENT_NATIVE_SETUP '+JSON.stringify({legacyBranch:label,currentAdmission:true,layout:'canonical',epoch:entry.ENTRY_EPOCH,clock:f.time(),capturedPhase:Math.floor(Date.now()/900000)%2===0?'general':'beta'}));
  let h=await own(f);eq(label+' actual own export includes policy attribution, anchor attribution and own cursor',h.entries.map(x=>x.key).sort(),['betaResetPolicyV1','betaResetScanV1','betaRetentionAnchorV1']);ok(label+' every entry contains key/time only',h.entries.every(x=>Object.keys(x).sort().join(',')==='key,updatedAt'));
  await f.env.DB.prepare('UPDATE site_settings SET value=? WHERE key=?').bind(scan(f,B),cursor.BETA_RESET_SCAN_KEY).run();h=await own(f);eq(label+' foreign cursor excluded even under own settings request',h.entries.length,2);
  await f.env.DB.prepare('UPDATE site_settings SET value=?,updated_by=? WHERE key=?').bind(scan(f,B),A,cursor.BETA_RESET_SCAN_KEY).run();h=await own(f);eq(label+' last updater cannot expose foreign cursor',h.entries.length,2);
  await f.env.DB.prepare('UPDATE site_settings SET value=? WHERE key=?').bind(scan(f,A).replace('{','{"after":"'+B+'",'),cursor.BETA_RESET_SCAN_KEY).run();h=await own(f);eq(label+' ambiguous duplicate cursor excluded',h.entries.length,2);
  await f.env.DB.prepare('UPDATE site_settings SET value=? WHERE key=?').bind(scan(f,A),cursor.BETA_RESET_SCAN_KEY).run();
  await f.env.DB.prepare('UPDATE site_settings SET updated_by=NULL WHERE updated_by=?1').bind(A).run();h=await own(f);eq(label+' erased attribution disappears while self cursor remains disclosed',h.entries.map(x=>x.key),['betaResetScanV1']);
  f.advance(300);const beforeStatements=f.native.nativeTrace.length,beforeGroups=f.native.nativeGroups.length;const retained=await retention.sweepServingRetention({...f.env,PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ACCESS_ENABLED:'false'});console.log('NATIVE_OWN_RETENTION_OBSERVATION '+JSON.stringify({clock:f.time(),capturedPhase:Math.floor(Date.now()/900000)%2===0?'general':'beta',clockOffsetMs:phaseShift,physical:f.native.nativeTrace.length-beforeStatements,groups:f.native.nativeGroups.slice(beforeGroups).map(x=>x.length),changes:retained}));h=await own(f);eq(label+' expired cursor metadata disappears after actual cleanup',h.entries.length,0);
 }finally{f.db.close();}}
 console.log('BETA_RESET_OWN_DATA_SUMMARY '+JSON.stringify({checks,fullErasureClaim:false}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{Date.now=realNow;sourceDate.now=sourceRealNow;});
`;
const mod=new Module(__filename,module);mod.filename=__filename;mod.paths=module.paths;mod._compile(original.slice(0,cut)+cases,__filename);

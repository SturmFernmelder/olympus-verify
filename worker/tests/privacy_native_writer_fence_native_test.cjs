// Source-owned same-cut writer fence and exact public7 intermediary. Local Native model only.
'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const H=require('./privacy_private_entry_mounts_native_test.cjs'),F=require('./privacy_cookie_profile_migration_native_test.cjs'),installer=require('../scripts/install-rejection-provenance-epoch.cjs');
const WE='a'.repeat(32),NEXT='d'.repeat(32),TEMP='9'.repeat(32),T=1800000000,BIG=9007199254740993n;
let checks=0;const cases=[],canon=x=>JSON.parse(JSON.stringify(x));
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
async function refused(label,fn){let held=false;try{await fn();}catch{held=true;}eq(label,held,true);}
function slot(db){return db.prepare("SELECT json_array(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes) tuple FROM privacy_write_admission").get().tuple;}
function legacySlot(db){return db.prepare('SELECT json_array(singleton,protocol,active,nonce,purpose,entry_changes,logical_changes) tuple FROM privacy_write_admission').get().tuple;}
async function nativeBusiness(layout,kind,seedCurrentRaid=false){
 const initial=kind==='current-cookie'?'marker':kind,f=F.fixture(layout,initial),trace=[],groups=[],setupTrace=[],setupGroups=[];let hook=null,firstHook=null,seeding=false;
 if(kind==='current-cookie'){
  installer.closeFixtureEpochForWholeMigration(f.db,layout,'marker',WE);
  const prepared=installer.prepareWholeFixtureMigration(f.db,layout,'marker',WE,TEMP);installer.migrateWholeFixtureProfile(prepared);
  f.db.prepare("UPDATE privacy_write_admission SET epoch=?,mode='serving' WHERE singleton=1 AND epoch=? AND mode='closed'").run(WE,TEMP);
  if(layout==='recorded-live-20261010'){
   const cf=installer.manifest.cookieMigrationSources['public-predecessor'].recordedLive.objects.filter(o=>o[1]==='_cf_KV');assert.equal(cf.length,1);f.db.exec(cf[0][3]);f.db.prepare('INSERT INTO _cf_KV(key,value)VALUES(?,?)').run('original-system-companion',new Uint8Array([0,255,1]));
  }
 }
 // Original BigInt counters are initialized after optional admitted fixture seeding.
 f.db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(H.fixtureClockNow());});
 function statement(sql,params=[]){
  const exec=()=>{(seeding?setupTrace:trace).push({sql,parameterCount:params.length});const native=DatabaseSync.prototype.prepare.call(f.db,sql),rows=native.columns().length?native.all(...params):(native.run(...params),[]);return{success:true,results:rows,meta:{changes:f.db.prepare('SELECT changes() n').get().n}};};
  return{statement:sql,params,bind(...values){return statement(sql,values);},async first(column){const row=exec().results[0]??null;if(firstHook)firstHook(row);return column===undefined?row:row?.[column]??null;},async all(){return exec();},async run(){return exec();},exec};
 }
 const binding={prepare(sql){return statement(sql);},async batch(statements){(seeding?setupGroups:groups).push(statements.map(s=>s.statement));const next=()=>{f.db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s.exec());f.db.exec('COMMIT');return out;}catch(error){f.db.exec('ROLLBACK');throw error;}};return hook?hook(statements,next):next();}};
 // Additional synthetic original values enter through the genuine admitted writer while serving.
 if(seedCurrentRaid){
  eq(layout+' current-cookie original epoch is serving before admitted raid seed',f.db.prepare('SELECT epoch,mode FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode]),[[WE,'serving']]);
  const admitted=H.operatorLoad('privacy-write-admission').createPrivacyWriteAdmissionDatabase(binding,'writer',layout,WE);
  seeding=true;try{await admitted.batch([
   admitted.prepare('UPDATE community_event_signups SET remind_mention=?,decision=?,decided_by=?,decided_at=?,decision_revision=? WHERE event_id=? AND discord_id=?').bind(1,'accepted','12345678901234567',T-123,9,'E'.repeat(22),'22345678901234567'),
   admitted.prepare('UPDATE community_event_reminders SET mention_ids=? WHERE event_id=?').bind(JSON.stringify(['22345678901234567','12345678901234567']),'E'.repeat(22)),
  ]);}finally{seeding=false;}
  eq(layout+' admitted raid seed leaves source epoch serving and neutral',f.db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').all().map(r=>[r.epoch,r.mode,r.active,r.nonce,r.purpose]),[[WE,'serving',0,'','']]);
 }
 f.db.prepare('UPDATE privacy_write_admission SET entry_changes=?,logical_changes=? WHERE singleton=1 AND active=0').run(BIG,BIG+2n);
 return{...f,binding,trace,groups,setupTrace,setupGroups,hook:value=>hook=value,firstHook:value=>firstHook=value};
}
function currentRaidSnapshot(db){
 return{
  signups:F.select(db,'SELECT _rowid_ rowid,event_id,discord_id,remind_mention,typeof(remind_mention) consent_type,decision,typeof(decision) decision_type,decided_by,typeof(decided_by) actor_type,decided_at,typeof(decided_at) time_type,decision_revision,typeof(decision_revision) revision_type FROM community_event_signups ORDER BY _rowid_').map(r=>Object.values(r)),
  reminders:F.select(db,'SELECT event_id,mention_ids,typeof(mention_ids) value_type FROM community_event_reminders ORDER BY event_id').map(r=>Object.values(r)),
 };
}
async function originalCase(layout,kind,test){
 H.fixtureAdvance(T);const independent=H.setup(),b=await nativeBusiness(layout,kind,kind==='current-cookie'&&test==='positive'),control=H.originalControl,original=await H.original(independent);
 independent.env.DB=b.binding;independent.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;independent.env.PRIVACY_INSTALL_SOURCE_KIND=kind;
 const cut=await H.originalOwnedCut(independent,original),beforeObjects=F.objects(b.db),beforeData=F.data(b.db,b.p),beforeCF=kind==='public-predecessor'||layout==='recorded-live-20261010'&&kind==='current-cookie'?b.db.prepare("SELECT key,hex(value) bytes FROM _cf_KV ORDER BY key").all():null,before=kind==='public-predecessor'?legacySlot(b.db):slot(b.db);
 const raidBefore=kind==='current-cookie'&&test==='positive'?{values:currentRaidSnapshot(b.db),data:F.data(b.db,installer.manifest[b.k])}:null;
 if(raidBefore){
  eq(layout+' current-cookie actual five nondefault signup values and native types',raidBefore.values.signups.find(r=>r[2]==='22345678901234567'),[211,'E'.repeat(22),'22345678901234567',1,'integer','accepted','text','12345678901234567','text',T-123,'integer',9,'integer']);
  eq(layout+' current-cookie actual nonempty mention vector bytes and type',raidBefore.values.reminders,[['E'.repeat(22),JSON.stringify(['22345678901234567','12345678901234567']),'text']]);
 }
 let capturedRow=null;b.firstHook(row=>{if(row&&Object.hasOwn(row,'closed_tuple'))capturedRow=row;});
 try{
  const fence=await control.captureOriginalPrivateNativeWriterFence(cut);eq(layout+'/'+kind+'/'+test+' opaque original fence keys',Reflect.ownKeys(fence),[]);
  if(test==='foreign-cut'){
   const foreign=H.setup();try{foreign.env.DB=b.binding;foreign.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;foreign.env.PRIVACY_INSTALL_SOURCE_KIND=kind;const other=await H.originalOwnedCut(foreign,await H.original(foreign)),count=b.groups.length;await refused(layout+'/'+kind+' foreign authentic cut refuses before Native',()=>control.dispatchOriginalPrivateNativeWriterFence(other,fence));eq(layout+'/'+kind+' foreign cut has no Native group',b.groups.length,count);}finally{foreign.close();}
  }else if(test==='config-accessor'){
   let getters=0;Object.defineProperty(independent.env,'PRIVACY_INSTALL_SOURCE_KIND',{get(){getters++;throw Error('fixture native fence config accessor');}});await refused(layout+'/'+kind+' original config drift refuses',()=>control.dispatchOriginalPrivateNativeWriterFence(cut,fence));eq(layout+'/'+kind+' config getter0 Native0',[getters,b.groups.length],[0,0]);
  }else if(test==='row-drift'){
   assert.ok(capturedRow);capturedRow.closed_tuple+=' ';await refused(layout+'/'+kind+' original captured row drift refuses',()=>control.dispatchOriginalPrivateNativeWriterFence(cut,fence));eq(layout+'/'+kind+' captured row drift Native0',b.groups.length,0);
  }else{
   let attempts=0;b.hook((ss,next)=>{attempts++;if(test==='delayed-native')H.fixtureAdvance(T+300);const packet=next();if(test==='lost-ack')throw Error('fixture actual fence commit lost ACK');return packet;});
   if(test==='delayed-native'||test==='lost-ack'){
    await refused(layout+'/'+kind+'/'+test+' original dispatch outcome held',()=>control.dispatchOriginalPrivateNativeWriterFence(cut,fence));await refused(layout+'/'+kind+'/'+test+' cannot repeat Native dispatch',()=>control.dispatchOriginalPrivateNativeWriterFence(cut,fence));eq(layout+'/'+kind+'/'+test+' exact one underlying Native attempt',attempts,1);
    if(test==='delayed-native'){eq(layout+'/'+kind+' exact original schema rolls back',F.objects(b.db),beforeObjects);eq(layout+'/'+kind+' exact original slot rolls back',kind==='public-predecessor'?legacySlot(b.db):slot(b.db),before);}else eq(layout+'/'+kind+' lostACK actual Native is closed',b.db.prepare('SELECT mode FROM privacy_write_admission').get().mode,'closed');
   }else{
    await control.dispatchOriginalPrivateNativeWriterFence(cut,fence);const migration=H.operatorLoad('privacy-cookie-profile-migration'),facts=migration.originalNativeWriterFenceFacts(fence,cut);
    eq(layout+'/'+kind+' completed Native fence truthful clock/source',[facts.sourceKind,facts.originalEpoch,facts.fenceEpoch,facts.originalCreatedAt,facts.originalExpiresAt,facts.fencedAt,facts.nativeModeClosed,facts.providerDrainQualified,facts.readyToReopen],[kind,kind==='public-predecessor'?null:WE,WE,T,T+300,T,true,false,false]);
    const wanted=kind==='public-predecessor'?beforeObjects.map(o=>o[0]==='table'&&o[1]==='privacy_write_admission'?[...o.slice(0,3),installer.manifest.recordedLive.slotSQL]:o):beforeObjects;
    eq(layout+'/'+kind+' fence complete objects only control changes',F.objects(b.db),wanted);eq(layout+'/'+kind+' fence exact original data type/rowid/sequence parity',F.data(b.db,b.p),beforeData);
    if(raidBefore){eq(layout+' current-cookie fence preserves all six original raid fields',currentRaidSnapshot(b.db),raidBefore.values);eq(layout+' current-cookie fence preserves complete current typed data',F.data(b.db,installer.manifest[b.k]),raidBefore.data);}
    const after=JSON.parse(slot(b.db));eq(layout+'/'+kind+' closed neutral epoch unchanged',[after[0],after[1],after[2],after[3],after[4],after[5],after[6]],[1,'olympus-write-admission-epoch-2',WE,'closed',0,'','']);
    eq(layout+'/'+kind+' exact Native BigInt counters copied as JSON bytes',slot(b.db).slice(slot(b.db).lastIndexOf(',9007199254740993')),',9007199254740993,9007199254740995]');
    if(beforeCF)eq(layout+'/'+kind+' exact original CF values preserved',b.db.prepare('SELECT key,hex(value) bytes FROM _cf_KV ORDER BY key').all(),beforeCF);
    await refused(layout+'/'+kind+' old writer business write denied after Native fence',async()=>b.db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('fenceOldWriter','denied',?)").run(T));
    const plan=await control.captureOriginalPrivateInstallPlan(cut,fence);
    if(test==='fk-off'||test==='temp-object'){
     const fencedObjects=F.objects(b.db),fencedData=F.data(b.db,b.p),count=b.groups.length;
     if(test==='fk-off')b.db.exec('PRAGMA foreign_keys=OFF');else b.db.exec('CREATE TEMP TABLE original_fence_late_temp(value INTEGER)');
     eq(layout+'/'+kind+'/'+test+' consuming Native precondition actually changed',test==='fk-off'?b.db.prepare('PRAGMA foreign_keys').get().foreign_keys:b.db.prepare('SELECT COUNT(*) n FROM temp.sqlite_master').get().n,test==='fk-off'?0:1);
     await refused(layout+'/'+kind+'/'+test+' original Native migration proof refuses',()=>control.executeOriginalPrivateInstallPlan(plan));eq(layout+'/'+kind+'/'+test+' actual consuming attempt is one batch',b.groups.length-count,1);eq(layout+'/'+kind+'/'+test+' complete application schema rolls back',F.objects(b.db),fencedObjects);eq(layout+'/'+kind+'/'+test+' nonempty data rolls back',F.data(b.db,b.p),fencedData);
     if(test==='fk-off')b.db.exec('PRAGMA foreign_keys=ON');else b.db.exec('DROP TABLE temp.original_fence_late_temp');
    }else{
    const installation=await control.executeOriginalPrivateInstallPlan(plan),installed=control.originalPrivateInstallationFacts(installation),receipt=JSON.parse(installed.migrationReceipt);
    eq(layout+'/'+kind+' same original completed fence Native install and M17',[receipt.length,receipt[7],receipt[8],receipt[9],receipt[10]],[17,kind,kind==='public-predecessor'?null:WE,NEXT,layout]);
    eq(layout+'/'+kind+' M17 original source digest retained',receipt[11],createHash('sha256').update(JSON.stringify(beforeObjects)).digest('hex'));
    const target=installer.manifest[layout==='canonical'?'canonicalObjects':'recordedLiveObjects'],cf=beforeObjects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'),complete=[...target,...cf].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
    eq(layout+'/'+kind+' actual full target and original CF exact',F.objects(b.db),complete);eq(layout+'/'+kind+' same-cut Native install fixed original300',[installed.originalCreatedAt,installed.originalExpiresAt],[T,T+300]);
    if(raidBefore){eq(layout+' current-cookie epoch-only install preserves all six nondefault raid fields',currentRaidSnapshot(b.db),raidBefore.values);eq(layout+' current-cookie epoch-only install preserves complete current typed data',F.data(b.db,installer.manifest[b.k]),raidBefore.data);}
    const custody=control.originalPrivateControlCutCustody(cut),receiver=H.operatorLoad('privacy-migration-receipt-validation');eq(layout+'/'+kind+' actual same-cut M17 receiver accepts complete original target',await receiver.validateOriginalProfileMigrationReceipt(installed.migrationReceipt,custody.floor,custody.gate),receipt);
    if(kind==='public-predecessor'){const incomplete=receipt.slice();incomplete[12]=createHash('sha256').update(JSON.stringify(target)).digest('hex');await refused(layout+' public M17 missing originalCF target digest refuses',()=>receiver.validateOriginalProfileMigrationReceipt(JSON.stringify(incomplete),custody.floor,custody.gate));}
    }
   }
  }
  eq(layout+'/'+kind+'/'+test+' all original application data preserved',F.data(b.db,b.p),beforeData);eq(layout+'/'+kind+'/'+test+' exact Native BigInt counter JSON',b.db.prepare('SELECT json_array(entry_changes,logical_changes) tuple FROM privacy_write_admission').get().tuple,'[9007199254740993,9007199254740995]');eq(layout+'/'+kind+'/'+test+' actual FKON and no violations',[b.db.prepare('PRAGMA foreign_keys').get().foreign_keys,b.db.prepare('PRAGMA foreign_key_check').all().length],[1,0]);
  cases.push({layout,sourceKind:kind,test,raidNondefaultPreservation:raidBefore!==null,setupNativeGroups:b.setupGroups.map(g=>g.length),setupNativeStatements:b.setupTrace.length,setupNativeSQLSHA256:createHash('sha256').update(JSON.stringify(b.setupTrace)).digest('hex'),originalCreatedAt:T,originalExpiresAt:T+300,nativeGroups:b.groups.map(g=>g.length),nativeStatements:b.trace.length,publicOriginalEpoch:kind==='public-predecessor'?null:WE,countersExactBigInt:true,providerDrainQualified:false,readyToReopen:false});
 }finally{b.db.close();independent.close();}
}
async function main(){
 for(const [layout,kind]of [['canonical','current-cookie'],['recorded-live-20261010','current-cookie'],['recorded-live-20261010','public-predecessor'],['canonical','marker'],['recorded-live-20261010','marker']])await originalCase(layout,kind,'positive');
 for(const [layout,kind]of [['canonical','current-cookie'],['recorded-live-20261010','public-predecessor']])for(const test of ['foreign-cut','config-accessor','row-drift','delayed-native','lost-ack','fk-off','temp-object'])await originalCase(layout,kind,test);
 eq('all19 original writer fence cases reached',cases.length,19);const assertions=checks+H.fixtureChecks()+F.checks();console.log('MEASURED_NATIVE_WRITER_FENCE '+JSON.stringify({schema:'same-original-native-writer-fence-v1',complete:true,cases,originalPublicProfile409:true,sameCutNativeFence:true,providerDrainQualified:false,allWriterDrainQualified:false,actualD1OpenerQualified:false,productionActivation:false,passedAssertions:assertions}));console.log('native writer fence: '+assertions+'/'+assertions+' passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

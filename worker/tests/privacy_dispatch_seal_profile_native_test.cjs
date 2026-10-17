// Real local Native transition. No provider effects, seal issuer, restore barrier or reopened source authority.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const H=require('./privacy_private_entry_mounts_native_test.cjs'),F=require('./privacy_cookie_profile_migration_native_test.cjs');
const installer=require('../scripts/install-rejection-provenance-epoch.cjs'),M=H.operatorLoad('privacy-cookie-profile-migration');
const beforeManifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../schema/dispatch-seal-predecessor-160.json'),'utf8'));
const T=1800000000,OLD='a'.repeat(32),NEXT='d'.repeat(32),LAST='e'.repeat(32),BIG=9007199254740993n,ACTOR='12345678901234567',EVENT='E'.repeat(22),OP='O'.repeat(22),KIND='current-cookie-pre-seal';
const canon=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),order=(a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0;
let checks=0;const measured=[];
function eq(label,a,b){assert.deepEqual(canon(a),canon(b),label);checks++;console.log('PASS '+label);}
async function refuses(label,fn,exact){let error;try{await fn();}catch(e){error=e;}assert.ok(error,label);if(exact)assert.equal(error,exact,label+' original exception identity');checks++;console.log('PASS '+label);}
async function refusesSealMutation(label,fn){let error;try{await fn();}catch(e){error=e;}assert.ok(error,label);assert.equal(error.message,'beta_dispatch_seal_immutable',label+' original trigger refusal');checks++;console.log('PASS '+label);}
function slot(db){return db.prepare('SELECT json_array(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes) tuple FROM privacy_write_admission').get().tuple;}
function business(layout,optional=false,seal=false){
 const key=layout==='canonical'?'canonical':'recordedLive',p=beforeManifest[key],db=new DatabaseSync(':memory:',{defensive:true,enableForeignKeyConstraints:true});
 for(const t of p.tables)db.exec(t.sql);db.exec(p.slotSQL);for(const i of p.indexes)db.exec(i.sql);
 db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',?,?)").run(OLD,BIG,BIG+2n);
 db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?),('betaResetPolicyV1','original-policy-bytes',?),('originalBlob',?,?)").run(T,T,new Uint8Array([0,255,1,128]),T);
 if(seal)db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('betaResetDispatchSealV1','malformed-preserved-seal',?)").run(T-1);
 db.prepare('INSERT INTO site_users(_rowid_,discord_id,username,first_login,last_login,session_version)VALUES(91,?,?,?,?,?)').run(ACTOR,'original actor',T-20,T-10,BIG);
 db.prepare("INSERT INTO audit(id,ts,actor,action)VALUES(21,?,'fixture','retained'),(1000,?,'fixture','deleted')").run(T-100,T-1);db.prepare('DELETE FROM audit WHERE id=1000').run();
 db.prepare("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_at,updated_at,retain_until)VALUES(?,?,'Original',?,60,?,?,?,?)").run(EVENT,OP,T+4000,T+7600,T-300,T-200,T+9000);
 db.prepare("INSERT INTO community_event_signups(_rowid_,event_id,discord_id,status,character_name,character_key,raid_role,revision,rsvp_starts_at,updated_at,write_nonce,remind_mention,decision,decided_by,decided_at,decision_revision)VALUES(211,?,?,'yes','Original','original','tank',7,?,?,?,1,'accepted',?,?,9)").run(EVENT,ACTOR,T+4000,T-210,OP,ACTOR,T-123);
 db.prepare("INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,guild_id,channel_id,host,op_id,state,created_at,updated_at,last_attempt_at,retain_until,consent_account_incarnation,mention_ids)VALUES(?,1,?,?,1,'guild','channel','fixture.invalid',?,'armed',?,?,?,?,?,?)").run(EVENT,T+4000,ACTOR,OP,T-300,T-200,T-180,T+9000,'1'.repeat(32),JSON.stringify([ACTOR]));
 for(const [id,state,attempts,nonce]of [['pending','pending',0,null],['unknown','unknown',1,'old-unknown-nonce']])db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,claim_nonce,attempts,created_at,expires_at)VALUES(?,?,'roster_native_rank','guild','role',0,?,'original-custody',?,?,?,?)").run(id,ACTOR,state,nonce,attempts,T-50,T+600);
 const cf=optional?installer.manifest.cookieMigrationSources['public-predecessor'].recordedLive.objects.filter(x=>x[1]==='_cf_KV'||x[2]==='_cf_KV'):[];
 for(const x of cf)db.exec(x[3]);if(optional)db.prepare('INSERT INTO _cf_KV(key,value)VALUES(?,?)').run('original',new Uint8Array([0,255,7]));
 for(const t of p.triggers)db.exec(t.sql);
 db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');return String(H.fixtureClockNow());});
 const groups=[],trace=[];let fault=null;
 function statement(sql,params=[]){
  const exec=()=>{trace.push({sql,params});const s=DatabaseSync.prototype.prepare.call(db,sql),rows=s.columns().length?s.all(...params):(s.run(...params),[]);const out={success:true,results:rows,meta:{changes:db.prepare('SELECT changes() n').get().n}};if(fault)fault(sql,out);return out;};
  return{statement:sql,params,bind(...values){return statement(sql,values);},async first(column){const row=exec().results[0]??null;return column===undefined?row:row?.[column]??null;},async all(){return exec();},async run(){return exec();},exec};
 }
 const binding={prepare(sql){return statement(sql);},async batch(ss){groups.push(ss.map(s=>s.statement));db.exec('BEGIN IMMEDIATE');try{const out=ss.map(s=>s.exec());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const full=[...beforeManifest[key+'Objects'],...cf].sort(order),target=[...installer.manifest[key+'Objects'],...cf].sort(order);
 eq(layout+' exact nonempty pre-seal profile',F.objects(db),full);
 return{db,p,key,binding,groups,trace,full,target,cf,fault:fn=>fault=fn,close:()=>db.close()};
}
function snapshot(b){return{objects:F.objects(b.db),data:F.data(b.db,b.p),slot:slot(b.db),cf:b.cf.length?b.db.prepare('SELECT key,hex(value) value FROM _cf_KV ORDER BY key').all():null};}
function closed(b){b.db.prepare("UPDATE privacy_write_admission SET mode='closed' WHERE singleton=1 AND mode='serving' AND active=0").run();}
function capture(b,kind=KIND,from=OLD,to=NEXT){return M.captureWholeNativeMigration(b.binding,{operationId:'c'.repeat(32),layout:b.key==='canonical'?'canonical':'recorded-live-20261010',sourceKind:kind,originalEpoch:from,nextEpoch:to});}
async function direct(layout,optional){
 H.fixtureAdvance(T);const b=business(layout,optional,true);try{
  // The new serving catalogue never accepts the preserved predecessor, even before a seal is issued.
  const writer=H.operatorLoad('privacy-write-admission').createPrivacyWriteAdmissionDatabase(b.binding,'writer',layout,OLD);
  const beforeRefusal=snapshot(b);await refuses(layout+' new serving writer refuses old catalogue',()=>writer.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('forbidden','x',?)").bind(T).run());eq(layout+' admission refusal preserves entire old state',snapshot(b),beforeRefusal);
  closed(b);const before=snapshot(b);await refuses(layout+' current-cookie cannot adopt pre-seal profile',()=>capture(b,'current-cookie'));
  const cap=await capture(b),count=b.groups.length,result=await M.executeWholeNativeMigration(cap),readback=await M.observeWholeNativeMigration(cap);
  eq(layout+' exact six-statement atomic transition',b.groups.slice(count).map(x=>x.length),[6]);
  eq(layout+' exactly three source DDL then exact epoch CAS',b.groups.at(-1).slice(1,4),installer.manifest.semanticBodies.slice(13).map(x=>x.sql));
  eq(layout+' no rebuild/drop/ALTER in transition',b.groups.at(-1).some(x=>/^(?:DROP|ALTER|INSERT|DELETE)\b/.test(x)),false);
  eq(layout+' complete new target and exact original data', [F.objects(b.db),F.data(b.db,b.p)],[b.target,before.data]);
  eq(layout+' exact counter bytes retained',slot(b.db),before.slot.replace('"'+OLD+'"','"'+NEXT+'"'));
  eq(layout+' actual result does not infer legacy nulls or authority',[result.statements,result.legacyDelayedFieldsNull,result.providerDrainQualified,result.readyToReopen,result.erasureActivationQualified,readback.originalLeaseRenewed],[6,false,false,false,false,false]);
  const owned=await M.getOwnedWholeNativeMigrationObservation(cap,result,readback);M.assertOwnedWholeNativeMigrationObservation(owned);eq(layout+' actual execution/readback original ownership verified',true,true);
  await refuses(layout+' transition original capability spent',()=>M.executeWholeNativeMigration(cap));
  await refuses(layout+' pre-seal kind cannot consume new target',()=>capture(b,KIND,NEXT,LAST));
  const epoch=await capture(b,'current-cookie',NEXT,LAST),start=b.groups.length,epochResult=await M.executeWholeNativeMigration(epoch);
  eq(layout+' current-cookie exact new target remains epoch-only',[b.groups.slice(start).map(x=>x.length),epochResult.legacyDelayedFieldsNull],[[3],false]);
  eq(layout+' epoch-only original data and schema remain exact',[F.data(b.db,b.p),F.objects(b.db)],[before.data,b.target]);
  if(optional)eq(layout+' original optional companion bytes retained',snapshot(b).cf,before.cf);
  measured.push({layout,path:'direct',optionalCompanion:optional,physicalMigrationStatements:6,currentCookieStatements:3,legacyDelayedFieldsNull:false});
 }finally{b.close();}
}
async function fenced(layout,optional){
 H.fixtureAdvance(T);const f=H.setup(),b=business(layout,optional),control=H.originalControl;try{
  f.env.DB=b.binding;f.env.PRIVACY_WRITE_ADMISSION_LAYOUT=layout;f.env.PRIVACY_INSTALL_SOURCE_KIND=KIND;
  const cut=await H.originalOwnedCut(f,await H.original(f)),before=snapshot(b),fence=await control.captureOriginalPrivateNativeWriterFence(cut);
  await control.dispatchOriginalPrivateNativeWriterFence(cut,fence);
  eq(layout+' original same-cut fence only closes original control',[F.objects(b.db),F.data(b.db,b.p),slot(b.db)],[before.objects,before.data,before.slot.replace('"serving"','"closed"')]);
  const plan=await control.captureOriginalPrivateInstallPlan(cut,fence),count=b.groups.length,installation=await control.executeOriginalPrivateInstallPlan(plan),facts=control.originalPrivateInstallationFacts(installation),receipt=JSON.parse(facts.migrationReceipt);
  eq(layout+' fenced migration has six original atomic statements',b.groups.slice(count).map(x=>x.length),[6]);
  eq(layout+' M17 binds distinct exact source and target',[receipt.length,receipt[7],receipt[8],receipt[9],receipt[10],receipt[11],receipt[12]],[17,KIND,OLD,NEXT,layout,hash(b.full),hash(b.target)]);
  const custody=control.originalPrivateControlCutCustody(cut),validator=H.operatorLoad('privacy-migration-receipt-validation');
  eq(layout+' original receipt receiver accepts exact installed transition',await validator.validateOriginalProfileMigrationReceipt(facts.migrationReceipt,custody.floor,custody.gate),receipt);
  for(const [label,index,value]of [['old target masquerades as source',11,hash(b.target)],['old source masquerades as target',12,hash(b.full)],['epoch-only source label',7,'current-cookie'],...(optional?[['missing optional target',12,hash(installer.manifest.recordedLiveObjects)]]:[])]){
   const changed=receipt.slice();changed[index]=value;await refuses(layout+' M17 rejects '+label,()=>validator.validateOriginalProfileMigrationReceipt(JSON.stringify(changed),custody.floor,custody.gate));
  }
  eq(layout+' fenced migration preserves all original data and custody',[F.data(b.db,b.p),F.objects(b.db),snapshot(b).cf],[before.data,b.target,before.cf]);
  measured.push({layout,path:'same-original-writer-fence',optionalCompanion:optional,physicalMigrationStatements:6,receiptSourceKind:KIND});
 }finally{b.close();f.close();}
}
async function rollback(layout){
 for(let position=1;position<=4;position++){
  H.fixtureAdvance(T);const b=business(layout),error=Error('original transition fault '+position);try{
   closed(b);const cap=await capture(b),before=snapshot(b);let index=0;
   b.fault(()=>{if(index++===position)throw error;});
   await refuses(layout+' original failure after transition step '+position,()=>M.executeWholeNativeMigration(cap),error);b.fault(null);
   eq(layout+' step '+position+' rolls back complete schema/data/control',snapshot(b),before);
   await refuses(layout+' failed step '+position+' capability cannot retry',()=>M.executeWholeNativeMigration(cap));
  }finally{b.close();}
 }
 for(const drift of ['extra','missing','changed','clock','slot']){
  H.fixtureAdvance(T);const b=business(layout);try{closed(b);const cap=await capture(b);
   if(drift==='extra')b.db.exec('CREATE TABLE extra_transition_object(x INTEGER)');
   if(drift==='missing')b.db.exec('DROP TRIGGER '+b.p.triggers[0].name);
   if(drift==='changed'){b.db.exec('DROP TRIGGER '+b.p.triggers[0].name);b.db.exec('CREATE TRIGGER '+b.p.triggers[0].name+" BEFORE INSERT ON site_settings BEGIN SELECT RAISE(ABORT,'changed'); END");}
   if(drift==='clock')H.fixtureAdvance(T+300);
   if(drift==='slot')b.db.prepare('UPDATE privacy_write_admission SET logical_changes=logical_changes+1 WHERE singleton=1').run();
   const before=snapshot(b);await refuses(layout+' consuming proof rejects '+drift,()=>M.executeWholeNativeMigration(cap));eq(layout+' '+drift+' refuses without further mutation',snapshot(b),before);
  }finally{b.close();}
 }
}
async function semantics(layout){
 H.fixtureAdvance(T);const b=business(layout);try{
  b.db.exec('PRAGMA recursive_triggers=OFF');
  eq(layout+' rowid REPLACE cases explicitly disable recursive triggers',b.db.prepare('PRAGMA recursive_triggers').get().recursive_triggers,0);
  closed(b);await M.executeWholeNativeMigration(await capture(b));
  // Local fixture-only reopening tests the installed trigger contract, not the production opener.
  b.db.prepare("UPDATE privacy_write_admission SET mode='serving' WHERE singleton=1 AND epoch=? AND mode='closed'").run(NEXT);
  const writer=H.operatorLoad('privacy-write-admission').createPrivacyWriteAdmissionDatabase(b.binding,'writer',layout,NEXT);
  const write=(sql,...binds)=>writer.prepare(sql).bind(...binds).run();
  await write("UPDATE site_settings SET value='new-policy-before-seal',updated_by=? WHERE key='betaResetPolicyV1'",ACTOR);
  eq(layout+' policy can change before any seal',b.db.prepare("SELECT value FROM site_settings WHERE key='betaResetPolicyV1'").get().value,'new-policy-before-seal');
  await write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('betaResetDispatchSealV1','malformed-is-still-presence',?,?)",T,ACTOR);
  const expected=F.data(b.db,b.p);
  const attempts=[
   ["INSERT OR REPLACE INTO site_settings(key,value,updated_at)VALUES('betaResetDispatchSealV1','replacement',?)",T],
   ["INSERT OR REPLACE INTO site_settings(key,value,updated_at)VALUES('betaResetPolicyV1','replacement',?)",T],
   // REPLACE can delete a conflicting row without firing DELETE triggers: protect the physical row too.
   ["REPLACE INTO site_settings(rowid,key,value,updated_at) SELECT rowid,'rowidReplacement','replacement',? FROM site_settings WHERE key='betaResetDispatchSealV1'",T],
   ["REPLACE INTO site_settings(rowid,key,value,updated_at) SELECT rowid,'rowidReplacement','replacement',? FROM site_settings WHERE key='betaResetPolicyV1'",T],
   ["UPDATE OR REPLACE site_settings SET rowid=(SELECT rowid FROM site_settings WHERE key='betaResetDispatchSealV1') WHERE key='auditTypedNames'"],
   ["UPDATE site_settings SET rowid=rowid+1000,updated_by=NULL WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET rowid=rowid+1000,updated_by=NULL WHERE key='betaResetPolicyV1'"],
   ["INSERT INTO site_settings(key,value,updated_at)VALUES('betaResetPolicyV1','x',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",T],
   ["UPDATE site_settings SET value='x' WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET key='movedSeal' WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET value='x' WHERE key='betaResetPolicyV1'"],
   ["UPDATE site_settings SET key='movedPolicy' WHERE key='betaResetPolicyV1'"],
   ["UPDATE site_settings SET key='betaResetDispatchSealV1' WHERE key='auditTypedNames'"],
   ["UPDATE site_settings SET key='betaResetPolicyV1' WHERE key='auditTypedNames'"],
   ["DELETE FROM site_settings WHERE key='betaResetDispatchSealV1'"],
   ["DELETE FROM site_settings WHERE key='betaResetPolicyV1'"],
   ["UPDATE site_settings SET updated_by='replacement-owner' WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET updated_by='replacement-owner' WHERE key='betaResetPolicyV1'"],
   ["UPDATE site_settings SET updated_at=updated_at+1 WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET updated_by=NULL,value='changed-with-redaction' WHERE key='betaResetPolicyV1'"],
   ["UPDATE site_settings SET updated_by=NULL,value='changed-with-redaction' WHERE key='betaResetDispatchSealV1'"],
   ["UPDATE site_settings SET value=value WHERE key='betaResetDispatchSealV1'"],
  ];
  for(const [index,[sql,...binds]]of attempts.entries()){await refusesSealMutation(layout+' installed semantic guard refuses mutation '+index,()=>write(sql,...binds));eq(layout+' rejected mutation '+index+' preserves all rows',F.data(b.db,b.p),expected);}
  const redaction='UPDATE site_settings SET updated_by=NULL WHERE updated_by=?1';
  eq(layout+' redaction uses exact existing erasure statement',fs.readFileSync(path.join(__dirname,'../src/privacy-serving-erase.ts'),'utf8').includes(redaction),true);
  const retained=b.db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key IN('betaResetPolicyV1','betaResetDispatchSealV1') ORDER BY key").all();
  eq(layout+' both sealed settings start with original attribution',retained.map(r=>r.updated_by),[ACTOR,ACTOR]);
  await write(redaction,ACTOR);
  eq(layout+' existing erasure redacts only attribution on both sealed settings',b.db.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key IN('betaResetPolicyV1','betaResetDispatchSealV1') ORDER BY key").all(),retained.map(r=>({...r,updated_by:null})));
  await refusesSealMutation(layout+' null attribution cannot be reassigned',()=>write("UPDATE site_settings SET updated_by=? WHERE key='betaResetDispatchSealV1'",ACTOR));
  await refusesSealMutation(layout+' null attribution does not permit no-op updates',()=>write("UPDATE site_settings SET updated_by=NULL WHERE key='betaResetDispatchSealV1'"));
  await write("INSERT INTO site_settings(key,value,updated_at)VALUES('unrelatedAfterSeal','allowed',?)",T);eq(layout+' unrelated admitted setting remains writable',b.db.prepare("SELECT value FROM site_settings WHERE key='unrelatedAfterSeal'").get().value,'allowed');
  eq(layout+' FK graph still enabled and valid',[b.db.prepare('PRAGMA foreign_keys').get().foreign_keys,b.db.prepare('PRAGMA foreign_key_check').all()],[1,[]]);
 }finally{b.close();}
}
async function main(){
 eq('preserved source file exact accepted pre-seal bytes',createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../schema/dispatch-seal-predecessor-160.json'))).digest('hex'),'287668140aff83df1fc0ae757e77d87f733a6e67dc8365eb7db2e31ae6a7533e');
 const generated=H.operatorLoad('privacy-write-admission-catalogue');
 eq('legacy combined source export remains byte-identical',generated.ADMISSION_COOKIE_MIGRATION_SOURCES_JSON,JSON.stringify(beforeManifest.cookieMigrationSources));
 for(const name of ['ADMISSION_COOKIE_MIGRATION_SOURCES_JSON','ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON'])eq(name+' stays within unchanged parser byte bound',Buffer.byteLength(generated[name],'utf8')<=2000000,true);
 eq('all original thirteen semantic bodies byte-identical',installer.manifest.semanticBodies.slice(0,13),beforeManifest.semanticBodies);
 for(const key of ['canonical','recordedLive']){
  eq(key+' exact preserved predecessor source',installer.manifest.cookieMigrationSources[KIND][key],{profile:beforeManifest[key],objects:beforeManifest[key+'Objects']});
  eq(key+' target changes only three fixed triggers',installer.manifest[key],{...beforeManifest[key],triggers:[...beforeManifest[key].triggers,...installer.manifest[key].triggers.slice(-3)]});
  eq(key+' exact original and target counts',[beforeManifest[key].tables.length,beforeManifest[key].indexes.length,beforeManifest[key].triggers.length,installer.manifest[key].triggers.length],[69,84,221,224]);
 }
 for(const layout of ['canonical','recorded-live-20261010']){await direct(layout,false);await fenced(layout,false);await rollback(layout);await semantics(layout);}
 await direct('recorded-live-20261010',true);await fenced('recorded-live-20261010',true);
 const total=checks+H.fixtureChecks();console.log('MEASURED_DISPATCH_SEAL_PROFILE '+JSON.stringify({complete:true,cases:measured,checks:total,providerActions:0,providerDrainQualified:false,allWriterDrainQualified:false,roleReuseReady:false,productionActivation:false}));console.log('dispatch seal profile native: '+total+'/'+total+' passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

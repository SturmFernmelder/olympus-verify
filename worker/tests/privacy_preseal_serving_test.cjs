// Exact, explicit .161 Native profile compatibility for the owner's OFF-mode .163 release.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),cache=new Map(),EPOCH='a'.repeat(32),LAYOUT='recorded-live-pre-seal-20261017';
function load(name){if(cache.has(name))return cache.get(name).exports;const file=path.join(root,'src',name+'.ts'),mod={exports:{}};cache.set(name,mod);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(n=>n.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(name),n))):require(n),mod,mod.exports);return mod.exports;}
const A=load('privacy-write-admission'),C=load('privacy-write-admission-catalogue'),prior=JSON.parse(C.ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile,next=JSON.parse(C.ADMISSION_PHYSICAL_EXPECTED_JSON);
let count=0;const check=(label,condition)=>{assert.ok(condition,label);count++;console.log('PASS '+label);};
async function refuses(label,work){let error;try{await work();}catch(e){error=e;}check(label,!!error);}
function fixture(profile){
 const db=new DatabaseSync(':memory:');for(const t of profile.tables)db.exec(t.sql);for(const i of profile.indexes)db.exec(i.sql);db.exec(profile.slotSQL);
 db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?,'serving',0,'','',0,0)").run(EPOCH);
 db.exec("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0);INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',1)");for(const t of profile.triggers)db.exec(t.sql);
 const run=(sql,values)=>{const q=db.prepare(sql),rows=q.columns().length?q.all(...values):(q.run(...values),[]);return{success:true,results:rows,meta:{changes:Number(db.prepare('SELECT changes() n').get().n)}};};
 const stmt=(sql,values=[])=>({sql,values,bind(...v){return stmt(sql,v);},async first(column){const r=run(sql,values).results[0]??null;return column===undefined?r:r?.[column]??null;},async all(){return run(sql,values);},async run(){return run(sql,values);}});
 const native={prepare:sql=>stmt(sql),async batch(list){db.exec('BEGIN IMMEDIATE');try{const out=list.map(s=>run(s.sql,s.values));db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return{db,native,close:()=>db.close()};
}
(async()=>{
 check('pre-seal whole profile equals exact previously shipping physical profile',crypto.createHash('sha256').update(JSON.stringify(prior)).digest('hex')==='2dec7adbdbf12ba0cda9d46fd8a8de7eb945a713491a0a2ab0dd716917c587d3');
 check('pre-seal compatibility does not install or claim immutable seal triggers',prior.triggers.every(t=>!t.name.startsWith('beta_dispatch_seal_')));
 const old=fixture(prior);try{
  const db=A.createPrivacyWriteAdmissionDatabase(old.native,'writer',LAYOUT,EPOCH);
  check('explicit compatibility writer recognizes exact old Native catalogue',await A.admissionCatalogueCurrent(db));await A.assertAdmissionCurrentSchema(db);check('explicit compatibility current-schema read succeeds without migration',true);
  const before=JSON.stringify(old.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
  await db.prepare("INSERT INTO audit(ts,actor,action)VALUES(1,'system','preseal.test')").run();check('real guarded ordinary write commits on existing epoch',old.db.prepare("SELECT count(*) n FROM audit WHERE action='preseal.test'").get().n===1);
  check('ordinary write leaves complete installed schema unchanged',JSON.stringify(old.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all())===before);
  const slot=old.db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').get();check('ordinary write retains serving epoch and neutral control',slot.epoch===EPOCH&&slot.mode==='serving'&&slot.active===0&&slot.nonce===''&&slot.purpose==='');
  await refuses('raw legacy write still refused by original Native trigger',()=>old.native.prepare("INSERT INTO audit(ts,actor,action)VALUES(1,'system','raw')").run());
  const newer=A.createPrivacyWriteAdmissionDatabase(old.native,'writer','recorded-live-20261010',EPOCH);check('new sealed layout does not silently accept predecessor',!(await A.admissionCatalogueCurrent(newer)));
  const wrongEpoch=A.createPrivacyWriteAdmissionDatabase(old.native,'writer',LAYOUT,'b'.repeat(32));await refuses('pre-seal writer still rejects wrong Native epoch',()=>wrongEpoch.prepare("INSERT INTO audit(ts,actor,action)VALUES(1,'system','wrong')").run());
  old.db.exec('CREATE TABLE unexpected_preseal(subject TEXT)');check('compatibility rejects an added unknown physical table',!(await A.admissionCatalogueCurrent(db)));await refuses('unknown physical profile cannot mutate payload',()=>db.prepare("INSERT INTO audit(ts,actor,action)VALUES(1,'system','bad')").run());check('refused payloads leave prior known write only',old.db.prepare('SELECT count(*) n FROM audit').get().n===1);
 }finally{old.close();}
 const target=fixture(next);try{const db=A.createPrivacyWriteAdmissionDatabase(target.native,'writer','recorded-live-20261010',EPOCH),old=A.createPrivacyWriteAdmissionDatabase(target.native,'writer',LAYOUT,EPOCH);check('existing sealed layout retains its qualified positive case',await A.admissionCatalogueCurrent(db));check('pre-seal compatibility rejects the distinct sealed whole profile',!(await A.admissionCatalogueCurrent(old)));}finally{target.close();}
 console.log(`\n${count}/${count} privacy pre-seal serving checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});

// Dormant source experiment/native SQLite only. No provider, credentials, deployment or installed database.
const fs=require('node:fs'),path=require('node:path'),cryptoNode=require('node:crypto'),ts=require('typescript'),{DatabaseSync}=require('node:sqlite');
const root=process.env.PRIVACY_ADMISSION_WORKER||path.join(__dirname,'..'),pins=new Map();
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:cryptoNode.webcrypto});
let checks=0,passed=0;
function check(name,condition,data){checks++;if(condition)passed++;else console.error('FAIL',name,data??'');}
function graph(){const cache={};function load(name){if(cache[name])return cache[name].exports;const filename=path.join(root,'src',name.replace(/^\.\//,'')+'.ts'),bytes=fs.readFileSync(filename);pins.set(filename,cryptoNode.createHash('sha256').update(bytes).digest('hex'));const mod={exports:{}};cache[name]=mod;new Function('require','module','exports',ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(p=>p.startsWith('.')?load(p):require(p),mod,mod.exports);return mod.exports;}load('./index');return load;}
const load=graph(),a=load('./privacy-write-admission'),m=load('./privacy-write-admission-catalogue'),schema=load('./schema'),catalog=load('./privacy-business-catalog'),authority=load('./privacy-serving-authority'),manifest=JSON.parse(m.ADMISSION_EXPECTED_JSON);
let db,native,protectedDb,count,plans,failAt=null,loseReply=false;
function fresh(){db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));db.exec(m.ADMISSION_CONTROL_DDL.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS '));db.prepare(`INSERT OR IGNORE INTO ${m.ADMISSION_CONTROL_TABLE} VALUES(1,?,0,'','',0,0)`).run(m.ADMISSION_PROTOCOL);db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',1)").run();for(const t of manifest.triggers)db.exec(t.sql);count=0;plans=[];failAt=null;loseReply=false;
 const exec=(sql,values)=>{const st=db.prepare(sql);if(/^\s*(SELECT|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql)){const results=st.all(...values);return {success:true,results,meta:{changes:/^\s*(SELECT|WITH)\b/i.test(sql)?0:Number(db.prepare('SELECT changes()n').get().n),last_row_id:Number(db.prepare('SELECT last_insert_rowid()n').get().n)}};}const r=st.run(...values);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};};
 const stmt=(sql,values=[])=>({sql,values,bind(...v){return stmt(sql,v);},async first(column){count++;const row=exec(sql,values).results[0]??null;return column&&row!==null?row[column]??null:row;},async all(){count++;return exec(sql,values);},async run(){count++;return exec(sql,values);},async raw(){count++;return db.prepare(sql).all(...values).map(Object.values);}});
 native={prepare:stmt,async batch(ss){count+=ss.length;plans.push(ss.map(s=>s.sql));db.exec('BEGIN');let out;try{out=ss.map((s,i)=>{if(i===failAt)throw Error('native injected failure');return exec(s.sql,s.values);});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}if(loseReply)throw Error('native committed response lost');return out;}};
 protectedDb=a.createPrivacyWriteAdmissionDatabase(native);return {DB:protectedDb};
}
const neutral=()=>{const row=db.prepare(`SELECT active,nonce,purpose FROM ${m.ADMISSION_CONTROL_TABLE}`).get();return row?.active===0&&row.nonce===''&&row.purpose==='';};
async function refused(name,fn){let error;try{await fn();}catch(e){error=e;}check(name,!!error,String(error));return error;}
(async()=>{
 check('source canonical66/198/78 exact vector',manifest.tables.length===66&&manifest.triggers.length===198&&manifest.indexes.length===78);
 check('manifest hash exact source JSON',cryptoNode.createHash('sha256').update(m.ADMISSION_EXPECTED_JSON).digest('hex')===m.ADMISSION_MANIFEST_SHA256);
 check('schema raw pin exact immutable source',cryptoNode.createHash('sha256').update(fs.readFileSync(path.join(root,'schema.sql'))).digest('hex')===m.ADMISSION_SOURCE_SCHEMA_SHA256);
 let env=fresh();check('known complete catalogue recognized',await a.admissionCatalogueCurrent(protectedDb));check('finite ordinary erasure census recognizes sole validated control',await catalog.servingPrivacyCatalogCurrent(env));check('unwrapped ordinary census refuses additional control',!(await catalog.servingPrivacyCatalogCurrent({DB:native,PRIVACY_WRITE_ADMISSION_ENABLED:'true'})));
 count=0;plans=[];await schema.ensureSchema(env);check('cold current schema proof is exactly one read, no writes',count===1&&plans.length===0&&neutral());
 count=0;await schema.ensureSchema(env);check('protocol schema proof rechecks instead of trusting old isolate cache',count===1);
 const audit="INSERT INTO audit(ts,actor,action,subject,details)VALUES(1,'system','test',NULL,'{}')";
 await refused('old direct business write held by native trigger',()=>native.prepare(audit).run());check('direct held no audit row',db.prepare('SELECT COUNT(*)n FROM audit').get().n===0);
 count=0;const result=await protectedDb.batch([protectedDb.prepare(audit),protectedDb.prepare('SELECT changes() AS n,last_insert_rowid() AS id')]);check('one writer group payload2 + transport4',count===6&&plans.at(-1).length===6);check('original result slots and changes/rowid adjacency preserved',result.length===2&&result[0].meta.changes===1&&result[1].results[0].n===1&&result[1].results[0].id===1);check('writer commits only neutral slot',neutral());
 const id=await protectedDb.prepare('SELECT last_insert_rowid() AS n').first();check('control UPDATE preserves native last_insert_rowid',id.n===1);
 count=0;await protectedDb.prepare('SELECT COUNT(*) AS n FROM audit').all();check('read-only constructor has no transport',count===1&&plans.at(-1).length===1);
 await refused('unknown first changes dependency held',()=>protectedDb.prepare('SELECT changes() AS n').first());
 await refused('mixed migration DDL and DML constructor held',()=>protectedDb.batch([protectedDb.prepare('CREATE TABLE unknown(x)'),protectedDb.prepare(audit)]));check('unsupported DDL did not mutate schema',!db.prepare("SELECT 1 FROM sqlite_master WHERE name='unknown'").get());
 await refused('foreign prepared object held',()=>protectedDb.batch([native.prepare(audit)]));
 const otherFactory=a.createPrivacyWriteAdmissionDatabase(native),otherPurpose=a.createPrivacyWriteAdmissionDatabase(native,'lifecycle'),foreign=protectedDb.prepare(audit);count=0;
 await refused('independently branded factory origin held',()=>otherFactory.batch([foreign]));
 await refused('independently branded purpose origin held',()=>otherPurpose.batch([foreign]));check('foreign origin refused before any native call',count===0);
 await refused('control constructor cannot be caller payload',()=>protectedDb.prepare(`UPDATE ${m.ADMISSION_CONTROL_TABLE} SET active=1`).run());
 for(const slot of[0,1,2,3,4]){fresh();failAt=slot;await refused(`fault slot${slot} rolls whole writer back`,()=>protectedDb.prepare(audit).run());check(`fault slot${slot} row/control rollback`,db.prepare('SELECT COUNT(*)n FROM audit').get().n===0&&neutral());}
 fresh();loseReply=true;await refused('lost known primary response is uncertain without retry',()=>protectedDb.prepare(audit).run());check('lost primary real commit retained once and neutral',db.prepare('SELECT COUNT(*)n FROM audit').get().n===1&&plans.length===1&&neutral());
 for(const mutation of[
  "DELETE FROM privacy_write_admission", "DROP TRIGGER privacy_admit_audit_insert", "CREATE TABLE sqliteX_hidden(subject TEXT)",
  "CREATE TABLE SQLITEY_hidden(subject TEXT)", "CREATE TABLE unexpected(subject TEXT)", "DROP INDEX audit_actor_action",
  "CREATE TRIGGER extra_unknown AFTER UPDATE ON members BEGIN SELECT 1; END",
 ]){fresh();db.exec(mutation);check(`catalogue holds ${mutation}`,!(await a.admissionCatalogueCurrent(protectedDb)));await refused(`payload held ${mutation}`,()=>protectedDb.prepare(audit).run());check('catalogue refusal leaves no audit mutation',db.prepare('SELECT COUNT(*)n FROM audit').get().n===0);}
 fresh();db.exec('CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB)');check('exact provider internal store allowed',await a.admissionCatalogueCurrent(protectedDb));
 for(const mutation of[
  "DELETE FROM site_settings WHERE key='auditTypedNames'", "UPDATE site_settings SET value='114' WHERE key='auditTypedNames'",
  "INSERT INTO site_applications(discord_id,position,region,status,answers,created_at,updated_at)VALUES('100000000000000001','raid_leader','eu','pending','{}',1,1)",
  "INSERT INTO audit(ts,actor,action,subject,details)VALUES(1,'system','site.settings',NULL,'{\"appointed\":{\"x\":\"name\"}}')",
  "INSERT INTO audit(ts,actor,action,subject,details)VALUES(1,'system','site.settings',NULL,'{\"notice\":\"old text\"}')",
  "INSERT INTO audit(ts,actor,action,subject,details)VALUES(1,'system','site.settings',NULL,'malformed')",
 ]){fresh();db.exec('BEGIN');db.prepare(`UPDATE ${m.ADMISSION_CONTROL_TABLE} SET active=1,nonce=?,purpose='writer'`).run('1'.repeat(32));try{db.exec(mutation);db.prepare(`UPDATE ${m.ADMISSION_CONTROL_TABLE} SET active=0,nonce='',purpose=''`).run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}const before=db.prepare('SELECT COUNT(*)n FROM audit').get().n;await refused(`current-schema branch holds unapplied ${mutation}`,()=>schema.ensureSchema({DB:protectedDb}));check('schema refusal has no business rewrite or marker repair',db.prepare('SELECT COUNT(*)n FROM audit').get().n===before&&plans.length===0&&neutral());}
 fresh();const gen='2'.repeat(32),did='100000000000000001';await protectedDb.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',0,1,1)").bind(did,gen).run();
 const original=authority.privacyBoundSubjectEnv({DB:protectedDb},did,{subject:did,subjectGeneration:gen,state:'active',revision:0});
 await protectedDb.prepare("UPDATE privacy_subjects SET generation=?1,revision=1 WHERE subject_id=?2").bind('3'.repeat(32),did).run();const n=db.prepare('SELECT COUNT(*)n FROM audit').get().n;await refused('original generation fence retained through new global transport',()=>original.DB.prepare(audit).run());check('stale subject no payload and neutral control',db.prepare('SELECT COUNT(*)n FROM audit').get().n===n&&neutral());
 for(const[file,pin]of pins)check('source pin stable '+path.basename(file),cryptoNode.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===pin);
 console.log(`${passed}/${checks} dormant write-admission native source checks passed`);if(passed!==checks)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

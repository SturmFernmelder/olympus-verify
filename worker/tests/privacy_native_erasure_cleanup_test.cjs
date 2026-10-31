// Exact account references in the real .164 cleanup SQL over the canonical SQLite schema.
// No display-name inference, provider calls, installed-schema changes or production data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),cache=new Map(),pins=new Map();
const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Request,Response,Headers,URL,URLSearchParams,AbortController,AbortSignal,ReadableStream,ReadableStreamDefaultReader,console,setTimeout,clearTimeout,btoa,atob,fetch:async()=>{throw Error('unexpected provider request');}});
function load(name){if(name==='node:async_hooks')return require(name);const file=path.join(root,'src',name.replace(/^\.\//,'')+'.ts');if(cache.has(file))return cache.get(file).exports;
 const bytes=fs.readFileSync(file);pins.set(file,bytes);const m={exports:{}};cache.set(file,m);
 const code=ts.transpileModule(bytes.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInContext('(function(module,exports,require){'+code+'\n})',context,{filename:file})(m,m.exports,p=>load(p));return m.exports;
}
const cleanup=load('privacy-native-erasure-cleanup');
const ID='300000000000000003',OTHER='300000000000000004',OP='a'.repeat(32),GEN='b'.repeat(32),BIRTH='c'.repeat(32),DIGEST='d'.repeat(64),T=1800000000;
let checks=0,passes=0;const check=(label,ok)=>{checks++;if(ok)passes++;console.log((ok?'PASS ':'FAIL ')+label);};
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(state='waiting_role',accountless=false){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));let at=T,fail=-1,lost=false,after=null;const trace=[];
 db.function('strftime',(format,value)=>{if(format!=='%s'||value!=='now')throw Error('unexpected clock');return String(at);});
 const prepare=(sql,values=[])=>{const p={sql,values,bind(...v){return prepare(sql,v);},execute(){trace.push({sql,values});const st=db.prepare(sql);if(/^\s*SELECT\b/.test(sql))return{success:true,results:st.all(...values),meta:{changes:0}};const r=st.run(...values);return{success:true,results:[],meta:{changes:Number(r.changes)}};}};return p;};
 const DB={prepare,async batch(stmts){db.exec('BEGIN');let result;try{result=stmts.map((s,i)=>{if(i===fail)throw Error('synthetic statement failure');const r=s.execute();after?.(i);return r;});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}if(lost)throw Error('synthetic lost committed reply');return result;}};
 if(!accountless)db.prepare('INSERT INTO site_users(discord_id,username,global_name,nick,first_login,last_login,account_incarnation)VALUES(?,?,?,?,?,?,?)').run(ID,'account-owner','Duplicated display','Duplicated display',T,T,BIRTH);
 db.prepare('INSERT INTO site_users(discord_id,username,global_name,nick,first_login,last_login)VALUES(?,?,?,?,?,?)').run(OTHER,'different-owner','Duplicated display','Duplicated display',T,T);
 db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?,?,'retiring',1,?,?)").run(ID,GEN,T,T);
 db.prepare('INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)VALUES(?,?,?,?,?,?,?,?,?,?)').run(OP,ID,GEN,DIGEST,accountless?0:1,accountless?0:T+300,accountless?null:BIRTH,state,T,T+31622400);
 const env={DB,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true'};
 const proof={purpose:'account_erasure',subject:ID,subjectGeneration:GEN,operationId:OP,requestDigest:DIGEST,accountIncarnation:accountless?null:BIRTH};
 const set=(key,value)=>db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)').run(key,typeof value==='string'?value:JSON.stringify(value),T,OTHER);
 const app=(id,answer)=>db.prepare("INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at)VALUES(?,'member',?,'submitted',?,?)").run(id,typeof answer==='string'?answer:JSON.stringify(answer),T,T);
 const value=key=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(key)?.value;
 const answers=id=>db.prepare('SELECT answers FROM site_applications WHERE discord_id=?').get(id)?.answers;
 const snapshot=()=>JSON.stringify({settings:db.prepare('SELECT * FROM site_settings ORDER BY key').all(),applications:db.prepare('SELECT * FROM site_applications ORDER BY discord_id').all()});
 return{db,env,proof,set,app,value,answers,snapshot,trace,fail(i){fail=i;},lose(v=true){lost=v;},after(f){after=f;},clock(t){at=t;},close(){db.close();}};
}
const directory=()=>Array.from({length:10},(_,i)=>({name:['Olympus I','Olympus II','Olympus III','Olympus IV','Olympus V','Olympus VI','Olympus VII','Olympus VIII','Olympus IX','Olympus X'][i],gm:'',officers:[]}));
function seed(f){
 f.set('appointed',{co_gm:ID,treasurer:'Duplicated display',officer:OTHER,raid_leader_na:'<@!'+ID+'>'});
 const dir=directory();dir[0].gm='<@'+ID+'>';dir[0].officers=[ID,'Duplicated display',OTHER];f.set('leadership',dir);
 f.set('notice','Unattributed free text '+ID+' and Duplicated display');
 f.app(OTHER,{references:[{kind:'discord',key:ID,label:'Original private target label'},{kind:'discord',key:OTHER,label:'Other owner'}],text:'Duplicated display',explicit:ID,nested:{mention:'<@!'+ID+'>',other:OTHER}});
 f.app(ID,{references:[],text:'Own application is deleted later by the account eraser'});
}
(async()=>{
 { const f=fixture('erasing');
  const publication='office_100:publication:'+'a'.repeat(64);
  f.set('appointed',{office_100:'<@'+ID+'>',office_101:OTHER,[publication]:'<@'+ID+'>'});
  const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof), value=JSON.parse(f.value('appointed'));
  check('three-digit Council references and publication pointers are scrubbed without extra statements',out.state==='cleaned'&&value.office_100==='Name withheld'&&value[publication]==='Name withheld'&&value.office_101===OTHER&&Object.keys(value).length===3&&f.trace.length===6);
  f.close();
 }

 for(const state of ['waiting_role','held','erasing']){
  const f=fixture(state);seed(f);const beforeNotice=f.value('notice'),beforeOwn=f.answers(ID),out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);
  const a=JSON.parse(f.value('appointed')),d=JSON.parse(f.value('leadership')),answer=JSON.parse(f.answers(OTHER));
  check(state+': one guarded atomic plan acknowledges only exact reference cleanup',out.state==='cleaned'&&out.changed===4&&out.legacyNames==='not_inferred'&&f.trace.length===6);
  check(state+': explicit account appointments become withheld and remain appointed',a.co_gm==='Name withheld'&&a.raid_leader_na==='Name withheld'&&Object.keys(a).length===4);
  check(state+': duplicated display names and another account appointment survive',a.treasurer==='Duplicated display'&&a.officer===OTHER);
  check(state+': exact directory account slots are withheld without clearing the guild or other people',d.length===10&&d[0].gm==='Name withheld'&&JSON.stringify(d[0].officers)===JSON.stringify(['Name withheld','Duplicated display',OTHER]));
  check(state+': exact Discord reference and its personal label are removed, other reference retained',answer.references.length===1&&answer.references[0].key===OTHER&&answer.references[0].label==='Other owner');
  check(state+': remaining explicit scalar account references are redacted',answer.explicit==='Name withheld'&&answer.nested.mention==='Name withheld'&&answer.nested.other===OTHER);
  check(state+': arbitrary free text and the target application are not silently deleted',f.value('notice')===beforeNotice&&f.answers(ID)===beforeOwn&&answer.text==='Duplicated display');
  check(state+': every executed statement consumes the original four proof values',f.trace.every(s=>JSON.stringify(s.values)===JSON.stringify([OP,ID,GEN,DIGEST])));
  const again=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check(state+': repeated local projection is idempotent and mints no erasure completion',again.state==='cleaned'&&again.changed===0&&!('servingAccountErased'in again)&&f.db.prepare('SELECT state FROM privacy_serving_jobs').get().state===state);
  f.close();
 }
 // No named-account inference: a real username or a non-unique display name alone is not an association.
 {const f=fixture();f.set('appointed',{co_gm:'account-owner',treasurer:'Duplicated display'});const d=directory();d[0].gm='Duplicated display';d[0].officers=['account-owner'];f.set('leadership',d);const before=f.snapshot();const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);
  check('username, nickname and duplicate display name matching cannot remove an appointment',out.state==='cleaned'&&out.changed===0&&f.snapshot()===before);f.close();}
 // Malformed/duplicate-key legacy data is preserved, leaving the caller's residual guard authoritative.
 for(const [key,value] of [['appointed','{"co_gm":"'+ID+'","co_gm":"'+OTHER+'"}'],['appointed','not json '+ID],['leadership','[{"gm":"'+ID+'"}]']]){
  const f=fixture();f.set(key,value);const before=f.snapshot(),out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check(key+' malformed/duplicate-key data is unchanged and not claimed erased',out.state==='cleaned'&&out.changed===0&&f.snapshot()===before&&out.legacyNames==='not_inferred');f.close();
 }
 for(const text of ['{"references":[],"references":[{"kind":"discord","key":"'+ID+'"}]}','{"references":[{"kind":"discord","key":"'+ID+'","key":"'+OTHER+'"}]}','{"references":[{"kind":"name","key":"'+ID+'"}],"text":"Account '+ID+'"}']){
  const f=fixture();f.app(OTHER,text);const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('ambiguous application is preserved rather than deleting another owner document',out.state==='cleaned'&&out.changed===0&&f.answers(OTHER)===text);f.close();
 }
 {const f=fixture();const before=f.snapshot(),out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('missing appointed/directory settings are not inserted and do not reopen default offices',out.state==='cleaned'&&out.changed===0&&f.snapshot()===before);f.close();}
 for(const [field,value] of [['operationId','e'.repeat(32)],['subjectGeneration','e'.repeat(32)],['requestDigest','e'.repeat(64)],['accountIncarnation','e'.repeat(32)],['subject',OTHER]]){
  const f=fixture();seed(f);const before=f.snapshot();f.proof[field]=value;const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('mismatched original '+field+' cannot authorize any personal reference cleanup',out.state==='unknown'&&out.changed===null&&f.snapshot()===before);f.close();
 }
 for(const kind of ['replacement-account','expired-job','active-generation','different-generation','complete-job']){
  const f=fixture();seed(f);
  if(kind==='replacement-account')f.db.prepare('UPDATE site_users SET account_incarnation=? WHERE discord_id=?').run('e'.repeat(32),ID);
  if(kind==='expired-job')f.clock(T+31622400);
  if(kind==='active-generation')f.db.exec("UPDATE privacy_subjects SET state='active'");
  if(kind==='different-generation')f.db.prepare('UPDATE privacy_subjects SET generation=?').run('e'.repeat(32));
  if(kind==='complete-job')f.db.exec('UPDATE privacy_serving_jobs SET state=\'complete\',completed_at='+T);
  const before=f.snapshot(),out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check(kind+' blocks cleanup with no stale-authority effects',out.state==='unknown'&&f.snapshot()===before);f.close();
 }
 for(const flags of [{PRIVACY_NATIVE_ERASURE_ENABLED:'false'},{PRIVACY_ERASURE_ENABLED:'false'},{PRIVACY_NATIVE_ERASURE_ENABLED:undefined}]){
  const f=fixture();Object.assign(f.env,flags);let refused=false;try{cleanup.nativeErasurePersonalReferenceStatements(f.env,f.proof);}catch{refused=true;}check('disabled Native/erasure mode refuses before any SQL',refused&&f.trace.length===0);f.close();
 }
 {const f=fixture();let reads=0;Object.defineProperty(f.proof,'subject',{get(){reads++;return ID;}});let refused=false;try{cleanup.nativeErasurePersonalReferenceStatements(f.env,f.proof);}catch{refused=true;}check('an accessor proof is refused without invoking the accessor or SQL',refused&&reads===0&&f.trace.length===0);f.close();}
 {const f=fixture();seed(f);const before=f.snapshot();f.fail(3);const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('statement failure rolls appointment and directory changes back atomically',out.state==='unknown'&&out.changed===null&&f.snapshot()===before);f.close();}
 {const f=fixture();seed(f);const before=f.snapshot();f.lose();const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('lost after-COMMIT reply is unknown while committed reference cleanup remains real',out.state==='unknown'&&out.changed===null&&f.snapshot()!==before&&JSON.parse(f.value('appointed')).co_gm==='Name withheld');check('lost cleanup reply neither advances the job nor changes its original identity/deadline',f.db.prepare('SELECT state,subject_id,subject_generation,request_digest,retain_until FROM privacy_serving_jobs').get().state==='waiting_role'&&f.db.prepare('SELECT retain_until FROM privacy_serving_jobs').get().retain_until===T+31622400);f.close();}
 {const f=fixture();seed(f);const before=f.snapshot();f.after(i=>{if(i===2)f.clock(T+31622400);});const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('expiry during the atomic batch rolls every earlier cleanup back',out.state==='unknown'&&f.snapshot()===before);f.close();}
 {const f=fixture();seed(f);f.after(i=>{if(i===4)f.env.PRIVACY_ERASURE_ENABLED='false';});const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('configuration drift after dispatch yields unknown rather than invented rollback',out.state==='unknown'&&JSON.parse(f.value('appointed')).co_gm==='Name withheld');f.close();}
 {const f=fixture('held',true);f.set('appointed',{co_gm:ID,treasurer:'Duplicated display'});const out=await cleanup.cleanupNativePersonalReferences(f.env,f.proof);check('a genuine accountless erasure proof cleans explicit references without a synthesized site login',out.state==='cleaned'&&JSON.parse(f.value('appointed')).co_gm==='Name withheld'&&!f.db.prepare('SELECT 1 FROM site_users WHERE discord_id=?').get(ID));f.close();}
 check('the focused run did not change any application source it loaded',[...pins].every(([file,bytes])=>fs.readFileSync(file).equals(bytes)));
 console.log(`${passes}/${checks} Native personal-reference cleanup checks passed`);if(passes!==checks)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

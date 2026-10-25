'use strict';
// The actual source-authored SQL over the unchanged canonical tables/index.
// Selection proof only: no provider, admission, cleanup effect or new schema claim.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(name){if(name==='node:async_hooks')return require(name);const file=path.join(root,'src',name.replace(/^\.\//,'')+'.ts');if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',code)(mod,mod.exports,load);return mod.exports;}
const source=load('./site-news-webhook'),db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));
let n=0;const check=(label,ok)=>{assert.ok(ok,label);n++;console.log('PASS '+label);};
const now=Number(db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").get().t);
const add=(operation,state,requested,created,subject='1')=>db.prepare('INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until)VALUES(?,?,?,?,?,?,?,?,?,?)').run(operation,'notice',JSON.stringify([{id:subject,g:null}]),'300000000000000001','300000000000000002',state,requested,created,now-created+10,created+31622400);
for(const [i,state]of ['known','cleaning','claimed','unknown','removed','refused'].entries())for(const requested of [0,1])add(String(i*2+requested).padStart(32,'a'),state,requested,now-20+i);
for(const [i,kind]of ['expired','current','deleted','malformed'].entries()){
 const id=String(i).padStart(22,'N'),operation=source.NEWS_WEBHOOK_PREFIX+id+':'+'b'.repeat(42);add(operation,'known',0,now-100+i,i%2?'2':'1');
 db.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,NULL)').run('newsWebhook:'+id,kind==='malformed'?'not-json':JSON.stringify({revision:1}),now);
 if(kind==='current'||kind==='expired')db.prepare('INSERT INTO site_news_notices(id,op_hash,revision,title,body,created_at,updated_at,retain_until,created_by,updated_by)VALUES(?,?,1,?,?,?,?,?,?,?)').run(id,'a'.repeat(64),'Synthetic selection title','Synthetic selection body',now-10,now,kind==='current'?now+100:now-1,'300000000000000001','300000000000000001');
}
// A large irrelevant population makes the selected index branches observable.
db.exec('BEGIN');for(let i=0;i<1001;i++)add('unrelated-'+String(i).padStart(22,'0'),'known',0,now-1000-i);db.exec('COMMIT');
const original=`(m.cleanup_requested=1 OR ${source.newsWebhookCleanupDueSql}) AND m.state IN('known','cleaning')`,indexed=`m.operation_id IN(${source.newsWebhookCleanupCandidatesSql}) AND m.state IN('known','cleaning')`;
for(const ordering of ['m.created_at,m.operation_id','m.updated_at,m.created_at,m.operation_id'])for(const limit of [1,5])for(const subject of [null,'1','2']){
 const filter=subject===null?'':" AND EXISTS(SELECT 1 FROM json_each(m.subjects)x WHERE json_extract(x.value,'$.id')=?1)",args=subject===null?[]:[subject];
 const query=where=>`SELECT m.operation_id FROM privacy_provider_messages m WHERE ${where}${filter} ORDER BY ${ordering} LIMIT ${limit}`;
 check('same original ordered page '+ordering+'/'+limit+'/'+subject,JSON.stringify(db.prepare(query(original)).all(...args))===JSON.stringify(db.prepare(query(indexed)).all(...args)));
}
const plan=db.prepare('EXPLAIN QUERY PLAN '+source.newsWebhookCleanupCandidatesSql).all().map(r=>r.detail).join('\n');
check('requested branch searches the unchanged cleanup index',/SEARCH m USING INDEX privacy_provider_messages_cleanup \(cleanup_requested=\? AND state=\?\)/.test(plan));
check('unmarked webhook branch searches only its exact primary-key range',/SEARCH m USING INDEX sqlite_autoindex_privacy_provider_messages_1 \(operation_id>\? AND operation_id<\?\)/.test(plan));
check('neither candidate branch scans the entire message ledger',!/^SCAN m\b/m.test(plan));
console.log('CLEANUP_SELECTION_QUERY_PLAN197 '+plan);db.close();console.log(n+'/'+n+' cleanup selection checks passed');

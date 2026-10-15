// Real TypeScript over the separate test-local paused-P schema fixture. This
// successor preserves the original fault suite; it does not qualify live schema.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require(process.env.PRIVACY129_TYPESCRIPT || 'typescript');
const {DatabaseSync}=require('node:sqlite');const crypto=require('node:crypto');const root=path.join(__dirname,'..'),cache=new Map();let checks=0;
function load(name){if(cache.has(name))return cache.get(name).exports;const module={exports:{}};cache.set(name,module);const src=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,console}, {filename:name})(q=>{if(!q.startsWith('./'))throw Error('external module refused');return load(q.slice(2));},module,module.exports);return module.exports;}
const core=load('account-lifecycle'),erase=load('privacy-erasure'),catalog=load('privacy-store-catalog'),contracts=load('account-generation-contracts');
function ok(name,test){assert.ok(test,name);checks++;}
function eq(name,actual,expected){assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),name);checks++;}
function adapter(db,hooks={}){const attempt={used:0};dormantAttempts.push(attempt);
 const exec=(sql,params)=>{if(sql.startsWith('SELECT CASE'))return {success:true,results:db.prepare(sql).all(...params),meta:{changes:0}};const r=db.prepare(sql).run(...params);return {success:true,results:[],meta:{changes:Number(r.changes)}};};
 const statement=sql=>{const observed={sql,binds:[],operations:[]};dormantPlans.push(observed);if(Buffer.byteLength(sql,'utf8')>=100000)throw Error('native-size fixture bound');hooks.prepare?.(sql);let values=[];const api={bind(...v){const max=Math.max(0,...[...sql.matchAll(/\?(\d+)/g)].map(x=>Number(x[1])));if(max!==v.length)throw Error('bind count '+max+' vs '+v.length);if(v.length>100||v.some(x=>x===undefined))throw Error('binding budget');values=v;observed.binds=v.map(x=>({type:x===null?'null':typeof x,sha256:crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex')}));return api;},async first(){attempt.used++;observed.operations.push('first');hooks.read?.(sql);const row=db.prepare(sql).get(...values)??null;return hooks.readReply?hooks.readReply(sql,row):row;},async all(){attempt.used++;observed.operations.push('all');hooks.read?.(sql);return {success:true,meta:{changes:0},results:db.prepare(sql).all(...values)};},async run(){attempt.used++;observed.operations.push('run');return exec(sql,values);},_exec(index){observed.operations.push('batch:'+index);return hooks.omit?.(index,sql)?exec('UPDATE site_users SET session_version=session_version WHERE 0',[]):exec(sql,values);}};return api;};
 return {prepare:statement,async batch(stmts){attempt.used+=stmts.length;dormantBatchLengths.push(stmts.length);hooks.before?.(stmts);if(hooks.skipBatch)return hooks.reply?.([])??[];db.exec('BEGIN');let out;try{out=stmts.map((s,i)=>{hooks.step?.(i);return s._exec(i);});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}hooks.after?.();return hooks.reply?hooks.reply(out):out;}};
}
const A='123456789012345678',B='987654321098765432',G='1'.repeat(32),P='2'.repeat(32),E='3'.repeat(32),D='4'.repeat(64);
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(fs.readFileSync(path.join(root,'tests/fixtures/privacy-foundation129/dormant-catalog56-schema.sql'),'utf8'));const now=db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").get().t;
 // Fixture clock only: the TTL negative must not depend on crossing a wall-clock
 // second between setup and the consuming INSERT. Boundary tests override this.
 db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');return String(now);});
 db.prepare('INSERT INTO generation_control VALUES(1,?,0,0)').run(E);for(const id of [A,B]){db.prepare("INSERT INTO account_generations VALUES(?,?,'active',0,'reviewed-legacy',?)").run(id,G,D);for(const purpose of ['erasure','role_grant','account_write','privacy_identity','privacy_export'])db.prepare('INSERT INTO account_purpose_generations(account_id,account_generation,purpose,generation,updated_at) VALUES(?,?,?,?,?)').run(id,G,purpose,P,now);db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,0)').run(id);db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,7)').run(id,now,now);}
 db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,status,created_at,claimed_by,claimed_at) VALUES('fixture','Fixture',?,'queued',?,'officer',?)").run(A,now,now);
 db.prepare("INSERT INTO roster_effects(run_id,seq,kind,name_key,name,discord_id) VALUES(1,1,'note','fixture','Fixture',?)").run(A);
 const operation={subject:A,accountGeneration:G,purposeGeneration:P,epoch:E,operationId:'5'.repeat(32),requestDigest:'6'.repeat(64),accountRevision:0,controlRevision:0,provenanceDigest:D,expiresAt:now+3600};return {db,now,operation};}
const count=(db,table,where='',params=[])=>db.prepare('SELECT COUNT(*) AS n FROM '+table+(where?' WHERE '+where:'')).get(...params).n;
function pending(f,id=A,n=1){const s=f.db.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?,?,?,?,?)');for(let i=0;i<n;i++)s.run(id,'fixture'+i,'Fixture '+i,f.now,f.now+3600);}
// Additive dormant-family witnesses. These reads belong to fixture setup/observation, not the source budget.
const dormantPlans=[],dormantBatchLengths=[],dormantAttempts=[],dormantHistoricalRefusals=[];let dormantFirstSlice=null;
const dormantProfile=load('privacy-foundation-schema-profile');
const dormantExpected=[
 [0,'pending','discord_id','shared_or_cross_subject_projection_unqualified'],
 [1,'invite_queue','discord_id','shared_or_cross_subject_projection_unqualified'],
 [2,'bnet_characters','discord_id','shared_or_cross_subject_projection_unqualified'],
 [3,'rename_holds','discord_id','shared_or_cross_subject_projection_unqualified'],
 [4,'characters','discord_id','shared_or_cross_subject_projection_unqualified'],
 [5,'site_applications','discord_id','shared_or_cross_subject_projection_unqualified'],
 [6,'site_votes','voter_id','shared_or_cross_subject_projection_unqualified'],
 [7,'site_board_votes','voter_id','shared_or_cross_subject_projection_unqualified'],
 [8,'site_friends','owner_id','shared_or_cross_subject_projection_unqualified'],
 [9,'site_reserved','owner_id','shared_or_cross_subject_projection_unqualified'],
 [10,'community_refs','discord_id','shared_or_cross_subject_projection_unqualified'],
 [11,'community_profiles','discord_id','shared_or_cross_subject_projection_unqualified'],
 [12,'community_professions','discord_id','shared_or_cross_subject_projection_unqualified'],
 [13,'community_alt_claims','discord_id','shared_or_cross_subject_projection_unqualified'],
 [14,'community_craft_offers','discord_id','shared_or_cross_subject_projection_unqualified'],
 [15,'community_event_signups','discord_id','shared_or_cross_subject_projection_unqualified'],
 [16,'community_event_attendance','discord_id','shared_or_cross_subject_projection_unqualified'],
 [17,'community_trials','discord_id','shared_or_cross_subject_projection_unqualified'],
 [18,'members',null,'retention_and_reentry_policy_unadopted'],
 [19,'roster_snapshots',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [20,'roster_members',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [21,'roster_first_seen',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [22,'roster_effect_runs',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [23,'roster_effects',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [24,'relays',null,'raw_game_notes_and_identity_provenance_unqualified'],
 [25,'audit',null,'legacy_free_text_and_cached_references_unqualified'],
 [26,'intro_posts',null,'shared_or_cross_subject_projection_unqualified'],
 [27,'intro_locks',null,'shared_or_cross_subject_projection_unqualified'],
 [28,'site_users',null,'retention_and_reentry_policy_unadopted'],
 [29,'site_settings',null,'shared_or_cross_subject_projection_unqualified'],
 [30,'seen_interactions',null,'legacy_free_text_and_cached_references_unqualified'],
 [31,'community_events',null,'shared_or_cross_subject_projection_unqualified'],
 [32,'community_event_changes',null,'shared_or_cross_subject_projection_unqualified'],
 [33,'community_restriction_cases',null,'shared_or_cross_subject_projection_unqualified'],
 [34,'community_restriction_characters',null,'shared_or_cross_subject_projection_unqualified'],
 [35,'community_restriction_periods',null,'shared_or_cross_subject_projection_unqualified'],
 [36,'community_departure_reviews',null,'shared_or_cross_subject_projection_unqualified'],
 [37,'community_contribution_policies',null,'shared_or_cross_subject_projection_unqualified'],
 [38,'community_contribution_members',null,'shared_or_cross_subject_projection_unqualified'],
 [39,'community_contribution_obligations',null,'shared_or_cross_subject_projection_unqualified'],
 [40,'community_contribution_receipts',null,'shared_or_cross_subject_projection_unqualified'],
 [41,'community_contribution_allocation_events',null,'shared_or_cross_subject_projection_unqualified'],
 [42,'community_contribution_horizons',null,'shared_or_cross_subject_projection_unqualified'],
 [43,'community_contribution_evidence',null,'shared_or_cross_subject_projection_unqualified'],
 [44,'community_contribution_decisions',null,'shared_or_cross_subject_projection_unqualified'],
 [45,'community_departure_scan',null,'shared_or_cross_subject_projection_unqualified'],
 [46,'community_privacy_cases',null,'case_possession_not_subject_identity'],
 [47,'community_privacy_messages',null,'case_possession_not_subject_identity'],
 [48,'community_privacy_operations',null,'case_possession_not_subject_identity'],
 [49,'site_news_notices',null,'shared_or_cross_subject_projection_unqualified'],
 [50,'site_news_ops',null,'shared_or_cross_subject_projection_unqualified'],
 [51,'site_login_flows','subject','anonymous_expiry_and_shared_provenance_unqualified'],
 [52,'role_grants',null,'role_reference_and_debt_projection_unqualified'],
 [53,'role_attempts',null,'role_reference_and_debt_projection_unqualified'],
 [54,'privacy_rejection_decisions',null,'source_owned_serving_erasure_and_derived_copy_only'],
 [55,'privacy_rejection_expiry_control',null,'nonpersonal_shared_original_expiry_control']
];
function dormantRetiredSetup(f,label){
 eq(label+' actual completed original job',f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs WHERE operation_id=?').get(f.operation.operationId),{completion_admitted:1});
 eq(label+' actual retiring account',f.db.prepare('SELECT state,revision FROM account_generations WHERE account_id=?').get(A),{state:'retiring',revision:1});
 eq(label+' exact original progress before fault',f.db.prepare('SELECT ordinal,store_key,state,held_reason FROM privacy_erasure_progress WHERE operation_id=? ORDER BY ordinal').all(f.operation.operationId),dormantExpected.map(([ordinal,store_key,owner,held_reason])=>({ordinal,store_key,state:owner?'pending':'held',held_reason})));
 eq(label+' held original outbox before fault',count(f.db,'privacy_external_outbox'),1);
}
async function dormantSupplement(){
 eq('literal complete56 catalog tuple mapping',catalog.STORE_CATALOG.map((s,i)=>[i,s.table,s.plan?.owner??null,s.hold]),dormantExpected);
 eq('unchanged original limits',[core.SLICE_ATTEMPTS,core.PURGE_ROWS,core.MAX_OPERATION_SECONDS],[24,100,86400]);
 const progressDDL=core.ACCOUNT_LIFECYCLE_DDL.find(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS privacy_erasure_progress('));
 const fixtureDDL=fs.readFileSync(path.join(root,'tests/fixtures/privacy-foundation129/dormant-catalog56-schema.sql'),'utf8');
 eq('source DDL and fixture ordinal bounds equal authored catalog56',[Number(progressDDL.match(/ordinal<(\d+)/)[1]),Number(fixtureDDL.match(/ordinal<(\d+)/)[1]),catalog.STORE_CATALOG.length,dormantExpected.length],[56,56,56,56]);
 let db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(root,'tests/fixtures/privacy-foundation129/paused-P-schema.sql'),'utf8'));
 eq('historical paused schema remains refused by dedicated contract',await catalog.catalogMatchesSchema(adapter(db)),false);db.close();
 // Parse only the pinned literal; do not execute a serving compiler/issuer or create current authority.
 const servingText=fs.readFileSync(path.join(root,'src/privacy-schema-source-plan.ts'),'utf8');
 const sourceLiteral=servingText.match(/^const SOURCE_PROFILES=Object\.freeze\((\[.*\])\) as readonly string\[\];$/m);
 assert.ok(sourceLiteral,'exact serving source literal');const serving=JSON.parse(sourceLiteral[1]);eq('all original serving alternatives remain present',serving.length,3);
 for(let i=0;i<serving.length;i++){
  db=new DatabaseSync(':memory:');const rows=JSON.parse(serving[i]);
  eq('serving alternative'+i+' exact one native-owned sqlite_sequence declaration',rows.filter(row=>row[1]==='sqlite_sequence'),[['table','sqlite_sequence','sqlite_sequence','CREATE TABLE sqlite_sequence(name,seq)']]);
  // Only this exact asserted name is not executable user DDL. AUTOINCREMENT creates it;
  // the unchanged complete metadata equality below still requires its exact presence.
  for(const type of ['table','index','view','trigger'])for(const row of rows)if(row[0]===type&&row[3]!==null&&row[1]!=='sqlite_sequence')db.exec(row[3]);
  const actual=db.prepare('SELECT type,name,tbl_name,sql FROM main.sqlite_master ORDER BY type,name,tbl_name').all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
  eq('serving alternative'+i+' actual complete DDL metadata',actual,[...rows].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0));
  eq('serving alternative'+i+' is not dormant admission',await catalog.catalogMatchesSchema(adapter(db)),false);db.close();
 }
 for(const [name,change]of [
  ['main extra',d=>d.exec('CREATE TABLE dormant_extra(id TEXT)')],
  ['temp extra',d=>d.exec('CREATE TEMP TABLE dormant_extra(id TEXT)')],
  ['same count substitution',d=>d.exec('DROP INDEX privacy_rejection_decisions_subject; CREATE INDEX dormant_replacement ON privacy_rejection_decisions(subject_key,decision_id)')],
  ['same name changed SQL',d=>d.exec('DROP INDEX privacy_rejection_decisions_subject; CREATE INDEX privacy_rejection_decisions_subject ON privacy_rejection_decisions(subject_key DESC,decision_id)')],
  ['mixed definition',d=>d.exec('ALTER TABLE privacy_rejection_expiry_control ADD COLUMN unreviewed TEXT')]
 ]){
  let f=fixture();pending(f);change(f.db);let r=await core.retireExistingAccount(adapter(f.db),f.operation);
  eq(name+' initial closed physical refusal',r.reason,'unclassified_schema');eq(name+' no initial claim',count(f.db,'privacy_erasure_jobs'),0);eq(name+' original proof retained',count(f.db,'pending'),1);f.db.close();
  f=fixture();pending(f);let reached=0;r=await core.retireExistingAccount(adapter(f.db,{before(){reached++;change(f.db);}}),f.operation);
  eq(name+' actual consuming batch reached after admitted read',reached,1);eq(name+' consuming schema guard no claim',count(f.db,'privacy_erasure_jobs'),0);eq(name+' consuming guard keeps original session',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);eq(name+' consuming failure retains unknown outcome',r.reason,'commit_outcome_unknown');f.db.close();
 }
 const marker=dormantProfile.DORMANT_SCHEMA_SOURCE_MARKER;
 for(const sql of ['SELECT ?','SELECT :name','SELECT @name','SELECT $name','SELECT ?0','SELECT ?01','SELECT ?1x','SELECT ?1?2','SELECT ?101','SELECT ?100 WHERE '+marker,"SELECT 'unterminated",'SELECT /* unterminated','SELECT \0', 'x'.repeat(100000)]){assert.throws(()=>dormantProfile.compileDormantSchemaSQL(sql));checks++;}
 const quoted="SELECT '"+marker+"', \""+marker+"\", ["+marker+"] /* "+marker+" */ -- "+marker;
 eq('quoted/comment markers never lower',dormantProfile.compileDormantSchemaSQL(quoted).sql,quoted);
 const p=dormantProfile.compileDormantSchemaSQL('SELECT ?2,?1,?2 WHERE '+marker),first=p.bind(['first',2]),second=p.bind(['second',3]);
 eq('one private value and exact numbered ordering',[first.length,second.length,first.slice(0,2),second.slice(0,2),first[2]===second[2]],[3,3,['first',2],['second',3],true]);
 assert.throws(()=>p.bind(['wrong']));checks++;assert.throws(()=>p.bind([{},2]));checks++;
 const seen=[],fake={prepare(sql){const s={bind(...values){seen.push({sql,values});return s;},first:async()=>null,all:async()=>({results:[]}),run:async()=>({meta:{changes:0}})};return s;},batch:async()=>[]};
 const budget={used:0},wrapped=core.boundedDatabase(fake,budget),statement=wrapped.prepare('SELECT ?1 WHERE '+marker);statement.bind('one');statement.bind('two');
 eq('rebind appends one fixed private value without accumulation',seen.map(x=>[x.values.length,x.values[0]]),[[2,'one'],[2,'two']]);
 assert.throws(()=>wrapped.prepare('SELECT ?1 WHERE '+marker).first());checks++;eq('unbound attempt still charged at original boundary',budget.used,1);
 // Original outbox is statement11 (zero based). Raise its real existing CHECK inside the original transaction.
 const f=fixture();pending(f);let reached=0,nativeError=null,intermediate=null;
 const result=await core.retireExistingAccount(adapter(f.db,{step(i){if(i!==11)return;reached++;
  intermediate={job:f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs').get(),account:f.db.prepare('SELECT state,revision FROM account_generations WHERE account_id=?').get(A),session:f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,progress:count(f.db,'privacy_erasure_progress'),outbox:count(f.db,'privacy_external_outbox')};
  try{f.db.prepare("INSERT INTO privacy_external_outbox(operation_id,effect_key,subject,account_generation,epoch,state,held_reason,expires_at) SELECT operation_id,'guild-member-remove',subject,account_generation,epoch,'done','native-check-fixture',expires_at FROM privacy_erasure_jobs").run();}catch(e){nativeError=e;throw e;}
 }}),f.operation);
 eq('native CHECK hook reached once inside original14',reached,1);eq('native CHECK sees actual preceding transaction changes',intermediate,{job:{completion_admitted:0},account:{state:'retiring',revision:1},session:8,progress:56,outbox:0});
 ok('actual SQLite CHECK exception captured without replacement',nativeError?.code==='ERR_SQLITE_ERROR'&&/CHECK constraint failed/.test(nativeError.message));
 eq('native CHECK full original transaction rollback',{account:f.db.prepare('SELECT state,revision FROM account_generations WHERE account_id=?').get(A),session:f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,jobs:count(f.db,'privacy_erasure_jobs'),progress:count(f.db,'privacy_erasure_progress'),outbox:count(f.db,'privacy_external_outbox')},{account:{state:'active',revision:0},session:7,jobs:0,progress:0,outbox:0});
 eq('native CHECK does not manufacture a known rollback response',result.reason,'commit_outcome_unknown');f.db.close();
}
function dormantEmittedPlans(){
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'schema/privacy-foundation-dormant-catalog56-profile-v1.json'),'utf8'));
 const json=JSON.stringify(metadata.objects),metadataSHA=crypto.createHash('sha256').update(json).digest('hex');
 const marked=dormantPlans.filter(p=>p.sql.includes('EXISTS(WITH expected AS MATERIALIZED'));
 ok('actual source emitted physical schema plans',marked.length>0);
 let normalized=null;
 for(const p of marked){
  const predicates=[...p.sql.matchAll(/EXISTS\(WITH expected AS MATERIALIZED[\s\S]*?FROM actual\)\)/g)].map(m=>m[0]);
  assert.ok(predicates.length>0);for(const predicate of predicates){const n=predicate.replace(/\?\d+/g,'?PRIVATE');if(normalized===null)normalized=n;assert.equal(n,normalized,'actual reader/consuming physical predicate identity');}
  assert.equal(p.binds.filter(b=>b.sha256===metadataSHA).length,1,'actual fixed metadata bound exactly once');
  assert.equal(p.binds.at(-1).sha256,metadataSHA,'actual private binding last');assert.ok(Buffer.byteLength(p.sql,'utf8')<100000);assert.ok(p.binds.length<=100);
 }
 ok('actual terminal source guard observed',marked.some(p=>p.sql.startsWith('SELECT CASE')&&p.sql.includes('AS checked')&&p.operations.some(x=>x.startsWith('batch:'))));
 ok('actual retirement DELETE source predicate observed',marked.some(p=>p.sql.startsWith('DELETE FROM ')&&p.operations.some(x=>x.startsWith('batch:'))));
 ok('actual current status source fence observed',marked.some(p=>p.sql.startsWith('WITH schema_gate')&&p.operations.includes('first')));
 ok('actual initial profile source read observed',marked.some(p=>p.sql.includes('AS object_count')&&p.operations.includes('first')));
 ok('original14 and4 native batch shapes reached without added members',dormantBatchLengths.includes(14)&&dormantBatchLengths.includes(4)&&dormantBatchLengths.every(n=>n===14||n===4));
 ok('every original physical adapter invocation remains within24 attempts',dormantAttempts.every(x=>x.used<=24));
 ok('actual first original slice group captured from its existing before hook',dormantFirstSlice!==null&&dormantBatchLengths[dormantFirstSlice.batchOrdinal]===4&&dormantFirstSlice.plans.length===4);
 const slice=dormantFirstSlice.plans;
 eq('actual first slice executes all original batch indices',slice.map(p=>p.operations),[['batch:0'],['batch:1'],['batch:2'],['batch:3']]);
 eq('actual four-statement slice guards are0/2/3, not its DELETE',slice.map(p=>p.sql.includes('EXISTS(WITH expected AS MATERIALIZED')),[true,false,true,true]);
 ok('actual first slice statement roles match the original source',slice[0].sql.startsWith('UPDATE privacy_erasure_progress SET revision=revision+1')&&slice[1].sql.startsWith('DELETE FROM pending WHERE discord_id=?2 AND rowid IN(SELECT value FROM json_each(?21)) AND EXISTS(SELECT 1 FROM privacy_erasure_progress')&&slice[2].sql.startsWith('UPDATE privacy_erasure_progress SET revision=CASE WHEN ')&&slice[3].sql.startsWith('SELECT CASE WHEN changes()=1 AND ')&&slice[3].sql.endsWith(' AS checked'));
 eq('actual first slice retains the exact21 binds per statement',slice.map(p=>p.binds.length),[21,21,21,21]);
 const reader=dormantPlans.find(p=>p.sql.includes('AS object_count')&&p.operations.includes('first'));
 const readerPredicate=reader.sql.match(/EXISTS\(WITH expected AS MATERIALIZED[\s\S]*?FROM actual\)\)/)[0].replace(/\?\d+/g,'?PRIVATE');
 ok('actual slice guards repeat the same observed original-reader predicate',[0,2,3].every(i=>[...slice[i].sql.matchAll(/EXISTS\(WITH expected AS MATERIALIZED[\s\S]*?FROM actual\)\)/g)].length>0&&[...slice[i].sql.matchAll(/EXISTS\(WITH expected AS MATERIALIZED[\s\S]*?FROM actual\)\)/g)].every(m=>m[0].replace(/\?\d+/g,'?PRIVATE')===readerPredicate)));
 eq('historical trigger refusal is explicitly witnessed once',dormantHistoricalRefusals.length,1);
 const report={scope:'dormant original lifecycle only; no serving authority',firstSlice:{batchOrdinal:dormantFirstSlice.batchOrdinal,planOrdinals:slice.map(p=>dormantPlans.indexOf(p)),nativeIndices:[0,1,2,3],schemaPredicateIndices:[0,2,3]},historicalRefusals:dormantHistoricalRefusals,plans:dormantPlans,batchLengths:dormantBatchLengths,attempts:dormantAttempts.map(x=>x.used),metadataSHA,maxSQLBytes:Math.max(...dormantPlans.map(p=>Buffer.byteLength(p.sql,'utf8'))),maxBinds:Math.max(...dormantPlans.map(p=>p.binds.length)),maxPhysicalAttempts:Math.max(...dormantAttempts.map(x=>x.used)),sourceLimits:{statements:24,purgeRows:100},fullCIQualified:false};
 if(process.env.PRIVACY_FOUNDATION_EVIDENCE)fs.writeFileSync(process.env.PRIVACY_FOUNDATION_EVIDENCE,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({dormantPhysicalPlans:dormantPlans.length,maxSQLBytes:report.maxSQLBytes,maxBinds:report.maxBinds,maxPhysicalAttempts:report.maxPhysicalAttempts,metadataSHA,fullCIQualified:false}));
}

(async()=>{
await dormantSupplement();
eq('composition closed',Object.values(core.LIFECYCLE_COMPOSITION),[false,false,false,false,false,false]);eq('56 logical catalog stores are distinct from raw schema count',new Set(catalog.STORE_CATALOG.map(x=>x.table)).size,56);ok('catalog immutable',Object.isFrozen(catalog.STORE_CATALOG)&&catalog.STORE_CATALOG.every(x=>Object.isFrozen(x)&&(!x.plan||Object.isFrozen(x.plan))));ok('all reference coverage explicitly unqualified',catalog.STORE_CATALOG.every(x=>x.referenceCoverage==='unqualified'));
eq('seven test-local dormant foundation/login table definitions',core.ACCOUNT_LIFECYCLE_DDL.filter(x=>x.startsWith('CREATE TABLE')).length,7);
let f=fixture();pending(f,A,250);pending(f,B,3);ok('catalog actual schema match',await catalog.catalogMatchesSchema(adapter(f.db)));const original={...f.operation};let r=await core.retireExistingAccount(adapter(f.db),f.operation);eq('retirement remains held',r.status,'held');ok('retirement at most24 attempts',r.attempts<=24);eq('retired active state CAS to retiring',f.db.prepare('SELECT state,revision FROM account_generations WHERE account_id=?').get(A),{state:'retiring',revision:1});eq('ordinary session revoked',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,8);eq('other account unchanged',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(B).session_version,7);eq('ordinary and privacy purposes revoked',count(f.db,'account_purpose_generations','account_id=? AND purpose<>?', [A,'erasure']),0);ok('cleanup purpose fresh',f.db.prepare("SELECT generation FROM account_purpose_generations WHERE account_id=? AND purpose='erasure'").get(A).generation!==P);eq('queue cancelled and claim released',f.db.prepare('SELECT status,claimed_by,claimed_at FROM invite_queue WHERE discord_id=?').get(A),{status:'cancelled',claimed_by:null,claimed_at:null});eq('raw roster effects cancelled',count(f.db,'roster_effects','discord_id=?',[A]),0);eq('held outbox single row',count(f.db,'privacy_external_outbox'),1);eq('56 durable per-store steps',count(f.db,'privacy_erasure_progress'),56);eq('policy records held',count(f.db,'privacy_erasure_progress',"state='held' AND store_key IN('members','site_users','roster_members','audit')"),4);
const ref=core.reference(original);r=await core.retireExistingAccount(adapter(f.db),original);eq('same operation replay one job',count(f.db,'privacy_erasure_jobs'),1);eq('replay does not revoke session twice',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,8);ok('mismatched replay refused',(await core.retireExistingAccount(adapter(f.db),{...original,requestDigest:'7'.repeat(64)})).status==='refused');
r=await erase.runErasureSlice(adapter(f.db,{before(){assert.equal(dormantFirstSlice,null);dormantFirstSlice={batchOrdinal:dormantBatchLengths.length-1,plans:dormantPlans.slice(-4)};}}),ref);eq('first cursor slice100rows',count(f.db,'pending','discord_id=?',[A]),150);r=await erase.runErasureSlice(adapter(f.db),ref);eq('second cursor slice100rows',count(f.db,'pending','discord_id=?',[A]),50);r=await erase.runErasureSlice(adapter(f.db),ref);eq('last cursor slice50rows',count(f.db,'pending','discord_id=?',[A]),0);eq('counterparty rows intact',count(f.db,'pending','discord_id=?',[B]),3);eq('durable progress count250',f.db.prepare("SELECT purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get().purged_rows,250);ok('every slice within24',r.attempts<=24);for(let i=0;i<25&&r.pendingPlans;i++)r=await erase.runErasureSlice(adapter(f.db),ref);eq('finite subset finishes',r.status,'local_plans_finished');ok('never full erasure',r.allStoresErased===false&&r.externalEffects==='held'&&r.authorityAdopted===false&&r.heldPlans>0);eq('held member row retained pending policy',count(f.db,'members','discord_id=?',[A]),1);eq('account not falsely terminal retired',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'retiring');eq('outbox cannot advance without adoption',f.db.prepare('SELECT state FROM privacy_external_outbox').get().state,'held');assert.throws(()=>f.db.prepare("UPDATE privacy_external_outbox SET state='done'").run());checks++;f.db.close();
for(const [name,mutate] of [['missing-account',x=>x.db.prepare('DELETE FROM account_purpose_generations WHERE account_id=?').run(A)&&x.db.prepare('DELETE FROM account_generations WHERE account_id=?').run(A)],['stale-generation',x=>x.operation.accountGeneration='8'.repeat(32)],['stale-purpose',x=>x.operation.purposeGeneration='8'.repeat(32)],['wrong-provenance',x=>x.operation.provenanceDigest='8'.repeat(64)],['restore-hold',x=>x.db.prepare('UPDATE generation_control SET restore_hold=1').run()],['wrong-epoch',x=>x.operation.epoch='8'.repeat(32)],['expired',x=>x.operation.expiresAt=x.now-1],['too-long-ttl',x=>x.operation.expiresAt=x.now+86401],['unknown-table',x=>x.db.exec('CREATE TABLE unclassified_private_rows(id TEXT)')]]){const x=fixture();pending(x);mutate(x);r=await core.retireExistingAccount(adapter(x.db),x.operation);ok(name+' refused/held',r.status!=='local_plans_finished');eq(name+' no job',count(x.db,'privacy_erasure_jobs'),0);eq(name+' no deletion',count(x.db,'pending'),1);eq(name+' no role intent',count(x.db,'privacy_external_outbox'),0);x.db.close();}
f=fixture();pending(f);r=await core.retireExistingAccount(adapter(f.db,{step(i){if(i===6)throw Error('injected failure')}}),f.operation);eq('constraint/fault rollback restores active',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'active');eq('rollback restores site session',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);eq('rollback no partial job',count(f.db,'privacy_erasure_jobs'),0);eq('thrown failure does not assert rollback',r.reason,'commit_outcome_unknown');f.db.close();
f=fixture();pending(f);r=await core.retireExistingAccount(adapter(f.db,{after(){throw Error('lost response after commit')}}),f.operation);eq('lost retirement reply resolved from durable status',r.status,'held');eq('lost reply one retirement',f.db.prepare('SELECT revision FROM account_generations WHERE account_id=?').get(A).revision,1);r=await erase.runErasureSlice(adapter(f.db,{after(){throw Error('lost progress reply')}}),core.reference(f.operation));ok('lost progress reply resolved without false rollback',r.reason!=='commit_outcome_unknown');eq('lost progress only once',f.db.prepare("SELECT purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get().purged_rows,1);f.db.close();
f=fixture();pending(f);let reads=0;r=await core.retireExistingAccount(adapter(f.db,{after(){throw Error('lost reply')},read(sql){if(++reads>1)throw Error('readback unavailable')}}),f.operation);eq('lost commit and unreadable status held unknown',r.reason,'commit_outcome_unknown');eq('unknown reply may have committed',count(f.db,'privacy_erasure_jobs'),1);f.db.close();
f=fixture();pending(f,A,2);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 35');r=await erase.runErasureSlice(adapter(f.db,{before(){f.db.prepare("UPDATE privacy_erasure_progress SET revision=revision+1 WHERE store_key='pending'").run()}}),core.reference(f.operation));eq('stale progress CAS checked rollback held',r.reason,'commit_outcome_unknown');eq('zero claim cannot delete dependents',count(f.db,'pending'),2);f.db.close();
for(const [name,sql] of [['restore','UPDATE generation_control SET restore_hold=1'],['epoch',"UPDATE generation_control SET epoch='99999999999999999999999999999999'"],['new generation',"UPDATE account_generations SET generation='99999999999999999999999999999999'"],['catalog mutation',"UPDATE privacy_erasure_jobs SET catalog_digest='9999999999999999999999999999999999999999999999999999999999999999'"],['new table','CREATE TABLE new_private_data(id TEXT)']]){f=fixture();pending(f);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 36');f.db.exec(sql);r=await erase.runErasureSlice(adapter(f.db),core.reference(f.operation));ok(name+' suspends progress',r.status==='held');eq(name+' no purge',count(f.db,'pending'),1);f.db.close();}
f=fixture();pending(f);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 37');f.db.prepare('UPDATE privacy_erasure_jobs SET expires_at=created_at-99,created_at=created_at-100 WHERE operation_id=?').run(f.operation.operationId);r=await erase.runErasureSlice(adapter(f.db),core.reference(f.operation));eq('expired job holds',r.reason,'operation_expired_policy_pending');eq('expired job no purge',count(f.db,'pending'),1);f.db.close();
f=fixture();pending(f);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 38');f.db.prepare('UPDATE pending SET id=-1').run();r=await erase.runErasureSlice(adapter(f.db),core.reference(f.operation));eq('negative legacy cursor held',r.reason,'unsupported_legacy_rowid');eq('negative legacy row untouched',count(f.db,'pending'),1);f.db.close();
f=fixture();let getter=0;assert.throws(()=>core.snapshotOperation({...f.operation,get subject(){getter++;return A;}}));eq('accessors refused without execution',getter,0);const snap=core.snapshotOperation(f.operation);f.operation.subject=B;eq('snapshot detached subject',snap.subject,A);ok('snapshot frozen',Object.isFrozen(snap));f.db.close();
// Historical assertion names below are retained verbatim, but this is only a closed-schema refusal.
// The separate step11 native CHECK case proves the real transaction-abort/rollback behavior.
f=fixture();pending(f);f.db.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON privacy_external_outbox BEGIN SELECT RAISE(ABORT,'constraint fixture'); END");let dormantRejectOutboxBeforeBatch=0;r=await core.retireExistingAccount(adapter(f.db,{before(){dormantRejectOutboxBeforeBatch++;}}),f.operation);
eq('historical reject_outbox explicitly refused as unclassified schema',r.reason,'unclassified_schema');eq('historical reject_outbox never reaches a native batch',dormantRejectOutboxBeforeBatch,0);
const dormantRejectOutboxDDL=f.db.prepare("SELECT type,name,tbl_name,sql FROM main.sqlite_master WHERE type='trigger' AND name='reject_outbox'").get();
eq('historical reject_outbox actual trigger DDL remains present',dormantRejectOutboxDDL,{type:'trigger',name:'reject_outbox',tbl_name:'privacy_external_outbox',sql:"CREATE TRIGGER reject_outbox BEFORE INSERT ON privacy_external_outbox BEGIN SELECT RAISE(ABORT,'constraint fixture'); END"});
dormantHistoricalRefusals.push({name:'reject_outbox',scope:'initial closed-schema refusal, not transaction rollback',reason:r.reason,beforeBatchHits:dormantRejectOutboxBeforeBatch,retainedDDL:dormantRejectOutboxDDL});eq('actual SQLite abort rolls back retirement',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'active');eq('actual abort leaves no job',count(f.db,'privacy_erasure_jobs'),0);eq('actual abort preserves pending proof',f.db.prepare('SELECT consumed_at FROM pending').get().consumed_at,null);f.db.close();
f=fixture();pending(f);const mutable={...f.operation},wanted=core.reference(f.operation);const promise=core.retireExistingAccount(adapter(f.db),mutable);mutable.subject=B;await promise;eq('mutation across await cannot target another subject',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(B).state,'active');eq('original captured subject retired',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'retiring');f.db.close();
f=fixture();pending(f,A,100);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 42');r=await erase.runErasureSlice(adapter(f.db,{before(){pending(f,A,100)}}),core.reference(f.operation));eq('delete bounded to100 selected rows despite an unadopted writer',count(f.db,'pending'),100);ok('later inserts not falsely all-store erased',r.allStoresErased===false);f.db.close();
f=fixture();f.db.exec('DELETE FROM generation_control');assert.throws(()=>f.db.prepare('INSERT INTO generation_control VALUES(NULL,?,0,0)').run(E));checks++;eq('NULL singleton cannot mint restore control',count(f.db,'generation_control'),0);assert.throws(()=>f.db.prepare("INSERT INTO account_generations VALUES(NULL,?,'active',0,'reviewed-legacy',?)").run(G,D));checks++;eq('NULL account cannot mint provenance',count(f.db,'account_generations'),2);f.db.close();
f=fixture();await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 44');assert.throws(()=>f.db.exec('INSERT INTO privacy_erasure_jobs SELECT NULL,subject,account_generation,epoch,request_digest,catalog_version,catalog_digest,cleanup_generation,claim_nonce,created_at,expires_at,control_revision,original_session_version,completion_admitted FROM privacy_erasure_jobs'));checks++;eq('NULL operation cannot create unreachable job',count(f.db,'privacy_erasure_jobs'),1);assert.throws(()=>f.db.exec("INSERT INTO account_purpose_generations SELECT NULL,account_generation,purpose,generation,revision,updated_at FROM account_purpose_generations LIMIT 1"));checks++;assert.throws(()=>f.db.exec('INSERT INTO privacy_erasure_progress SELECT NULL,ordinal,store_key,state,held_reason,cursor,high_water,revision,claim_nonce,purged_rows FROM privacy_erasure_progress LIMIT 1'));checks++;assert.throws(()=>f.db.exec('INSERT INTO privacy_external_outbox SELECT NULL,effect_key,subject,account_generation,epoch,state,held_reason,expires_at FROM privacy_external_outbox'));checks++;eq('NULL identifiers leave progress and outbox unchanged',[count(f.db,'privacy_erasure_progress'),count(f.db,'privacy_external_outbox')],[56,1]);f.db.close();
for(const [name,change]of [['catalog',x=>x.db.prepare("UPDATE privacy_erasure_jobs SET catalog_digest=?").run('9'.repeat(64))],['schema',x=>x.db.exec('CREATE TABLE newly_unclassified_store(id TEXT)')]]){f=fixture();pending(f,A,2);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 45');r=await erase.runErasureSlice(adapter(f.db,{before(){change(f)}}),core.reference(f.operation));eq(name+' change after selection does not purge',count(f.db,'pending'),2);eq(name+' change after selection cannot advance cursor',f.db.prepare("SELECT revision,cursor,purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get(),{revision:0,cursor:0,purged_rows:0});eq(name+' zero consuming claim checked rollback held',r.reason,'commit_outcome_unknown');ok(name+' changed metadata does not claim full erasure',r.allStoresErased===false);f.db.close();}
for(const table of ['newly_unclassified_store','sqliteX_private']){f=fixture();pending(f);r=await core.retireExistingAccount(adapter(f.db,{before(){f.db.exec('CREATE TABLE '+table+'(id TEXT)')}}),f.operation);eq(table+' in-flight schema cannot mint job',count(f.db,'privacy_erasure_jobs'),0);eq(table+' in-flight schema cannot retire subject',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'active');eq(table+' in-flight schema preserves session',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);f.db.close();}
f=fixture();pending(f);r=await core.retireExistingAccount(adapter(f.db,{step(i){if(i===1)f.db.prepare("UPDATE privacy_erasure_jobs SET catalog_digest=?").run('9'.repeat(64));}}),f.operation);eq('catalog altered during retirement cannot change account',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'active');eq('catalog altered during retirement cannot emit external intent',count(f.db,'privacy_external_outbox'),0);eq('catalog altered during retirement preserves session',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);f.db.close();

f=fixture();pending(f,A,250);let retirementCounts=[];r=await core.retireExistingAccount(adapter(f.db,{after(){retirementCounts=f.db.prepare('SELECT changes() AS n').get().n;}}),f.operation);
eq('fresh retirement increments global control exactly once',f.db.prepare('SELECT revision FROM generation_control').get().revision,1);
eq('fresh retirement completion admits exact own job',f.db.prepare('SELECT completion_admitted,original_session_version,control_revision FROM privacy_erasure_jobs').get(),{completion_admitted:1,original_session_version:7,control_revision:0});
eq('retirement immediate pending cancellation bounded100',count(f.db,'pending','consumed_source=?',['lifecycle-retiring']),100);
eq('retirement account immediately not in server for qualified readers',f.db.prepare('SELECT in_server FROM site_users WHERE discord_id=?').get(A).in_server,0);
await core.retireExistingAccount(adapter(f.db),f.operation);eq('same operation does not advance global twice',f.db.prepare('SELECT revision FROM generation_control').get().revision,1);f.db.close();
f=fixture();pending(f);const oldRandom=contracts.randomGeneration,cleanup='a'.repeat(32),nonce='b'.repeat(32);let randomCalls=0;contracts.randomGeneration=()=>randomCalls++%2===0?cleanup:nonce;
const catHash=await catalog.catalogDigest();f.db.prepare(`INSERT INTO privacy_erasure_jobs(operation_id,subject,account_generation,epoch,request_digest,catalog_version,catalog_digest,cleanup_generation,claim_nonce,created_at,expires_at,control_revision,original_session_version,completion_admitted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).run(f.operation.operationId,A,G,E,f.operation.requestDigest,catalog.CATALOG_VERSION,catHash,cleanup,nonce,f.now,f.operation.expiresAt,0,7);
f.db.exec("UPDATE account_generations SET state='retiring',revision=1; UPDATE generation_control SET revision=1");
try{r=await core.retireExistingAccount(adapter(f.db),f.operation);}finally{contracts.randomGeneration=oldRandom;}
eq('preexisting incomplete job cannot represent fresh INSERT',f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs').get().completion_admitted,0);
eq('refused initial claim cannot rotate cleanup purpose',f.db.prepare("SELECT generation FROM account_purpose_generations WHERE account_id=? AND purpose='erasure'").get(A).generation,P);
eq('refused initial claim cannot increment session',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);
eq('refused initial claim emits no progress or outbox',[count(f.db,'privacy_erasure_progress'),count(f.db,'privacy_external_outbox')],[0,0]);
eq('refused initial claim global unchanged',f.db.prepare('SELECT revision FROM generation_control').get().revision,1);f.db.close();
// Claude N2 (2026-10-08): a real zero-change UPDATE sets SQLite changes() to0;
// it adds no TEMP object and cannot impersonate a schema refusal. Every point asserts an outcome.
for(let point=0;point<14;point++){
 f=fixture();pending(f);let replaced=0;
 const fixturePort=adapter(f.db,{omit(i){if(i===point){replaced++;return true;}return false;}});
 r=await core.retireExistingAccount(fixturePort,f.operation);
 eq('genuine zero-change omission reached point'+point,replaced,1);
 eq('omission point'+point+' leaves temp schema empty',f.db.prepare('SELECT count(*) AS n FROM temp.sqlite_master').get().n,0);
 ok('omission point'+point+' never claims full erasure/authority',r.allStoresErased===false&&r.authorityAdopted===false&&r.externalEffects==='held');
 if(point===0||[1,2,3,4,5,6,10,11,12].includes(point)){
  eq('critical omission'+point+' account remains active',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'active');
  eq('critical omission'+point+' global unchanged',f.db.prepare('SELECT revision FROM generation_control').get().revision,0);
  eq('critical omission'+point+' session unchanged',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);
  eq('critical omission'+point+' no job/progress/outbox',[count(f.db,'privacy_erasure_jobs'),count(f.db,'privacy_erasure_progress'),count(f.db,'privacy_external_outbox')],[0,0,0]);
  eq('critical omission'+point+' pending proof remains',f.db.prepare('SELECT consumed_at FROM pending').get().consumed_at,null);
 }else if(point===13){
  eq('omitted guard with exact completed job has only held status',r.status,'held');
  eq('omitted guard readback confirms existing exact terminal job',f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs').get().completion_admitted,1);
  eq('omitted guard never asserts rollback',f.db.prepare('SELECT state FROM account_generations WHERE account_id=?').get(A).state,'retiring');
 }else{
  eq('bounded cancellation omission'+point+' still only held local work',r.status,'held');
  eq('bounded cancellation omission'+point+' exact final job admitted',f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs').get().completion_admitted,1);
  if(point===7)eq('omitted pending cancellation remains for local cleanup',f.db.prepare('SELECT consumed_at FROM pending').get().consumed_at,null);
  if(point===8)eq('omitted queue cancellation remains queued',f.db.prepare('SELECT status FROM invite_queue').get().status,'queued');
  if(point===9)eq('omitted roster cancellation remains present',count(f.db,'roster_effects'),1);
 }
 f.db.close();
}
for(const [name,change,expected]of [['schema',x=>x.db.exec('CREATE TABLE status_after_initial_read(id TEXT)'),'unclassified_schema'],['catalog',x=>x.db.prepare('UPDATE privacy_erasure_jobs SET catalog_digest=?').run('9'.repeat(64)),'catalog_changed'],['restore',x=>x.db.prepare('UPDATE generation_control SET restore_hold=1').run(),'generation_or_restore_changed']]){
 f=fixture();pending(f);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 93');let reached=0;
 r=await core.readErasureStatus(adapter(f.db,{read(sql){if(sql.includes('AS pendingPlans')){reached++;change(f);}}}),core.reference(f.operation));
 eq(name+' mutation occurs after initial profile read',reached,1);eq(name+' current status statement refuses',r.reason,expected);eq(name+' refused status returns no progress counts',r.pendingPlans+r.heldPlans+r.finishedPlans,0);f.db.close();
}
for(const offset of [-1,0,1]){
 f=fixture();pending(f);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 98');let reached=0,clockReads=0;
 r=await core.readErasureStatus(adapter(f.db,{read(sql){if(sql.includes('AS pendingPlans')){reached++;f.db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');clockReads++;return String(f.operation.expiresAt+offset);});}}}),core.reference(f.operation));
 eq('status original expiry clock offset'+offset+' reached consuming SELECT',reached,1);
 ok('status original expiry offset'+offset+' consumes actual installed DB clock',clockReads>0);
 eq('status original strict expiry offset'+offset,r.reason,offset<0?'local_work_pending':'operation_expired_policy_pending');f.db.close();
}
// V3 original absolute deadline: expiry at advance/final guard aborts the WHOLE
// actual transaction. V2's committed delete/progress gap is preserved privately.
for(const point of [0,1,2,3])for(const offset of [-1,0,1]){
 f=fixture();pending(f,A,3);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 107');let reached=0,clockReads=0;
 r=await erase.runErasureSlice(adapter(f.db,{step(i){if(i===point){reached++;f.db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');clockReads++;return String(f.operation.expiresAt+offset);});}}}),core.reference(f.operation));
 eq('slice deadline point'+point+' offset'+offset+' reached',reached,1);
 ok('slice deadline point'+point+' offset'+offset+' consumes installed two-argument clock',clockReads>0);
 eq('slice deadline point'+point+' offset'+offset+' exact pending outcome',count(f.db,'pending'),offset<0?0:3);
 const p=f.db.prepare("SELECT revision,cursor,purged_rows,state FROM privacy_erasure_progress WHERE store_key='pending'").get();
 eq('slice deadline point'+point+' offset'+offset+' records all or rolls back',offset<0?{revision:p.revision,purged_rows:p.purged_rows,state:p.state}:p,offset<0?{revision:1,purged_rows:3,state:'done'}:{revision:0,cursor:0,purged_rows:0,state:'pending'});
 ok('slice deadline point'+point+' offset'+offset+' never claims full/authority',r.allStoresErased===false&&r.authorityAdopted===false&&r.attempts<=24);f.db.close();
}
for(const offset of [-1,0,1]){
 f=fixture();pending(f,A,3);let reached=0,clockReads=0;r=await core.retireExistingAccount(adapter(f.db,{step(i){if(i===13){reached++;f.db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');clockReads++;return String(f.operation.expiresAt+offset);});}}}),f.operation);
 eq('terminal original deadline offset'+offset+' final guard reached',reached,1);ok('terminal original deadline offset'+offset+' consumes installed two-argument clock',clockReads>0);eq('terminal original deadline offset'+offset+' job commit or rollback',count(f.db,'privacy_erasure_jobs'),offset<0?1:0);eq('terminal original deadline offset'+offset+' session exact',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,offset<0?8:7);eq('terminal original deadline offset'+offset+' original pending retained',count(f.db,'pending'),3);ok('terminal original deadline offset'+offset+' remains dormant',r.allStoresErased===false&&r.authorityAdopted===false);f.db.close();
}
for(const [name,sql]of [['nonce',"UPDATE privacy_erasure_progress SET claim_nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE store_key='pending'"],['revision',"UPDATE privacy_erasure_progress SET revision=2 WHERE store_key='pending'"],['cursor',"UPDATE privacy_erasure_progress SET cursor=1 WHERE store_key='pending'"],['state',"UPDATE privacy_erasure_progress SET state='held' WHERE store_key='pending'"],['missing',"DELETE FROM privacy_erasure_progress WHERE store_key='pending'"],['job nonce',"UPDATE privacy_erasure_jobs SET claim_nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"],['cleanup',"UPDATE privacy_erasure_jobs SET cleanup_generation='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"],['deadline','UPDATE privacy_erasure_jobs SET expires_at=expires_at-1'],['control revision','UPDATE privacy_erasure_jobs SET control_revision=control_revision+1'],['original session','UPDATE privacy_erasure_jobs SET original_session_version=original_session_version+1']]){
 f=fixture();pending(f,A,1);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 121');let reached=0;r=await erase.runErasureSlice(adapter(f.db,{step(i){if(i===2){reached++;f.db.exec(sql);}}}),core.reference(f.operation));
 eq('advance wrong '+name+' reached after DELETE changes1',reached,1);eq('advance wrong '+name+' rolls DELETE back',count(f.db,'pending'),1);eq('advance wrong '+name+' original cursor/count/revision restored',f.db.prepare("SELECT revision,cursor,purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get(),{revision:0,cursor:0,purged_rows:0});ok('advance wrong '+name+' remains held',r.status==='held'&&r.allStoresErased===false);f.db.close();
}
for(const expired of [false,true]){
 f=fixture();pending(f,A,3);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 125');f.db.exec('UPDATE privacy_erasure_jobs SET completion_admitted=0');if(expired)f.db.function('strftime',(format,value)=>{assert.equal(format,'%s');assert.equal(value,'now');return String(f.operation.expiresAt);});
 const want=expired?'operation_incomplete_completion_expired':'operation_incomplete_completion';r=await core.readErasureStatus(adapter(f.db),core.reference(f.operation));eq('existing incomplete '+expired+' explicit diagnostic',r.reason,want);eq('existing incomplete '+expired+' no progress disclosure',r.pendingPlans+r.heldPlans+r.finishedPlans,0);r=await erase.runErasureSlice(adapter(f.db),core.reference(f.operation));eq('existing incomplete '+expired+' cannot purge',count(f.db,'pending'),3);eq('existing incomplete '+expired+' slice stays diagnostic',r.reason,want);await core.retireExistingAccount(adapter(f.db),f.operation);eq('existing incomplete '+expired+' no automatic completion',f.db.prepare('SELECT completion_admitted FROM privacy_erasure_jobs').get().completion_admitted,0);eq('existing incomplete '+expired+' no extra session/control rotation',[f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,f.db.prepare('SELECT revision FROM generation_control').get().revision],[8,1]);f.db.close();
}
// Strict native shape cases are actual consuming calls; readable malformed reply
// after COMMIT can only resolve through the exact own post-state readback.
const malformed=[['false success',out=>{out.at(-1).success=false;return out;}],['wrong checked',out=>{out.at(-1).results=[{checked:0}];return out;}],['string checked',out=>{out.at(-1).results=[{checked:'1'}];return out;}],['null results',out=>{out.at(-1).results=null;return out;}],['extra row',out=>{out.at(-1).results=[{checked:1},{checked:1}];return out;}],['string changes',out=>{out[0].meta.changes='1';return out;}],['boolean changes',out=>{out[0].meta.changes=true;return out;}],['nonenumerable changes',out=>{Object.defineProperty(out[0].meta,'changes',{value:1,enumerable:false});return out;}],['missing entry',out=>out.slice(0,-1)],['inherited success',out=>{out[out.length-1]=Object.assign(Object.create({success:true}),{meta:{changes:0},results:[{checked:1}]});return out;}]];
for(const [name,mutate]of malformed)for(const committed of [false,true]){
 f=fixture();pending(f,A,3);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 132');let intercepted=0;
 r=await erase.runErasureSlice(adapter(f.db,{skipBatch:!committed,reply(out){intercepted++;const shape=committed?out:[{success:true,meta:{changes:1},results:[]},{success:true,meta:{changes:3},results:[]},{success:true,meta:{changes:1},results:[]},{success:true,meta:{changes:0},results:[{checked:1}]}];return mutate(shape);}}),core.reference(f.operation));
 eq('malformed '+name+' committed'+committed+' consumes actual path',intercepted,1);eq('malformed '+name+' committed'+committed+' exact durable rows',count(f.db,'pending'),committed?0:3);eq('malformed '+name+' committed'+committed+' exact progress',f.db.prepare("SELECT revision,purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get(),committed?{revision:1,purged_rows:3}:{revision:0,purged_rows:0});ok('malformed '+name+' committed'+committed+' held/no false authority',r.status==='held'&&r.allStoresErased===false&&r.authorityAdopted===false&&r.attempts<=24);f.db.close();
}
for(const [name,sql]of [['nonce',"UPDATE privacy_erasure_progress SET claim_nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' WHERE store_key='pending'"],['cursor',"UPDATE privacy_erasure_progress SET cursor=0 WHERE store_key='pending'"],['state',"UPDATE privacy_erasure_progress SET state='pending' WHERE store_key='pending'"],['job nonce',"UPDATE privacy_erasure_jobs SET claim_nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"],['deadline','UPDATE privacy_erasure_jobs SET expires_at=expires_at-1']]){
 f=fixture();pending(f,A,3);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 137');r=await erase.runErasureSlice(adapter(f.db,{after(){f.db.exec(sql);throw Error('lost reply after actual COMMIT and malformed restored row');}}),core.reference(f.operation));eq('lost reply altered '+name+' never confirms advancement',r.reason,'commit_outcome_unknown');eq('lost reply altered '+name+' does not infer rollback',count(f.db,'pending'),0);eq('lost reply altered '+name+' returns no progress counts',r.pendingPlans+r.heldPlans+r.finishedPlans,0);f.db.close();
}
f=fixture();pending(f,A,3);await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 139');let getters=0;r=await erase.runErasureSlice(adapter(f.db,{reply(out){Object.defineProperty(out.at(-1),'results',{get(){getters++;throw Error('getter');},enumerable:true});return out;}}),core.reference(f.operation));eq('native guard accessor never invoked',getters,0);eq('native guard accessor may resolve exact durable commit only',f.db.prepare("SELECT purged_rows FROM privacy_erasure_progress WHERE store_key='pending'").get().purged_rows,3);ok('native guard accessor has no full success',r.allStoresErased===false);f.db.close();
for(const malformed of [2,'1',null,{},Infinity]){
 f=fixture();await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 141');r=await core.readErasureStatus(adapter(f.db,{readReply(sql,row){return sql.includes('AS pendingPlans')?{...row,ownCommitCurrent:malformed}:row;}}),core.reference(f.operation));eq('finite status rejects malformed own confirmation '+String(malformed),r.reason,'readback_unavailable');eq('finite status malformed count withheld '+String(malformed),r.pendingPlans+r.heldPlans+r.finishedPlans,0);f.db.close();
}
// Claude LCD2N2: malformed projected native data must not become a fabricated
// finished/pending diagnosis. The actual SQLite SELECT runs before this explicit
// test-only malformed-reply injection; no returned controls replace SQL.
for(const [name,change]of [['null DB time',row=>({...row,at:null})],['string DB time',row=>({...row,at:String(row.at)})],['string original expiry',row=>({...row,expires_at:String(row.expires_at)})],['negative plan count',row=>({...row,pendingPlans:-1,heldPlans:34,finishedPlans:19})],['fractional plan counts',row=>({...row,pendingPlans:0.5,heldPlans:32.5,finishedPlans:19})]]){
 f=fixture();await core.retireExistingAccount(adapter(f.db),f.operation);dormantRetiredSetup(f,'original line 147');let reached=0;r=await core.readErasureStatus(adapter(f.db,{readReply(sql,row){if(!sql.includes('AS pendingPlans'))return row;reached++;return change(row);}}),core.reference(f.operation));eq('native malformed status '+name+' actual consuming SELECT reached',reached,1);eq('native malformed status '+name+' held',r.reason,'readback_unavailable');eq('native malformed status '+name+' no invented counts',r.pendingPlans+r.heldPlans+r.finishedPlans,0);ok('native malformed status '+name+' no false finished',r.status==='held'&&r.localPlansFinished===false&&r.allStoresErased===false);f.db.close();
}
const budget={used:23},bounded=core.boundedDatabase({prepare(){return {bind(){return this},run:async()=>({meta:{}}),first:async()=>null,all:async()=>({results:[]})}},batch:async()=>[]},budget);await bounded.prepare('one').first();assert.throws(()=>bounded.prepare('two').first());eq('budget refuses25th statement',budget.used,24);
dormantEmittedPlans();
console.log(JSON.stringify({suite:'privacy-lifecycle-foundation',passed:checks,total:checks,sql:'real in-memory SQLite; actual source and schema',providerCalls:0,composition:'closed'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

// Genuine identify-only OAuth/form admission, native SQLite, actual 13-family serving/export graph.
// Reuse the house fixture constructor, not a duplicate authorization or projection implementation.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const p=path.join(__dirname,'privacy_access_test.cjs'),s=fs.readFileSync(p,'utf8'),cut=s.indexOf('async function main(){');
if(cut<0)throw Error('fixture seam missing');
const scenario=String.raw`
load('index');
const history=load('privacy-access-history'),family=load('privacy-access-family-history'),data=load('ruleset-publication-data'),community=load('community-context');
const collection='community.ruleset_publication.operations';
async function download(f,c='copy',cursor=''){
 const frm=await form(f,await connect(f));provider=null;let attempts=0,batch=[];
 f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=x=>batch.push(x.length);
 const r=await copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env);
 f.hooks.statement=null;f.hooks.beforeBatch=null;
 eq(c+' exact attempts',attempts,c==='copy'?88:8);eq(c+' exact batch',batch,[c==='copy'?87:7]);
 return r.json();
}
async function mainRulesetPrivacy(){
 let f=fixture();subject(f);
 eq('actual families13',community.communityDataNames().length,13);
 eq('actual registry statements34',community.communityExportPlan(f.env,A).statements.length,34);
 eq('all curated histories37',history.PRIVACY_ALL_HISTORY_COLLECTIONS.length,37);
 eq('new table has23 typed columns',f.db.prepare('PRAGMA table_info(ruleset_publications)').all().length,23);
 const insert=f.db.prepare('INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,parent_id,channel_id,message_id,frozen_payload,payload_hash,claim_nonce,stage,state,result_code,created_at,updated_at,actor_retain_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<1002;i++)insert.run(B,String(i).padStart(22,'0'),'guide',i+1,'forever-beta-pvp2-v1','private-hash',A,G,7,f.time()+100,B,B,STAFF,'private-payload','private-hash','private-nonce','pin','applied','confirmed',f.time(),f.time(),f.time()+365*86400);
 insert.run(B,'x'.repeat(22),'guide',1003,'forever-beta-pvp2-v1','other-private',B,G,7,f.time()+100,B,B,STAFF,'other-private','other-private','other-private','pin','applied','confirmed',f.time(),f.time(),f.time()+365*86400);
 const first=await download(f,collection);eq('real first history exact count',first.history.capture.count,1002);eq('first native bound1000',first.history.entries.length,1000);eq('real incomplete flag',first.history.capture.complete,false);
 ok('curated history no custody/session/counterpart',!JSON.stringify(first.history.entries).includes(B)&&!JSON.stringify(first.history.entries).includes(STAFF)&&!JSON.stringify(first.history.entries).includes('private-'));
 const tail=await download(f,collection,first.history.nextCursor);eq('real native tail2',tail.history.entries.length,2);eq('tail terminates',tail.history.nextCursor,null);eq('tail complete',tail.history.capture.complete,true);eq('original traversal expiry retained',tail.history.capture.expiresAt,first.history.capture.expiresAt);
 const aggregate=await download(f);eq('actual aggregate37 closed paths',Object.keys(aggregate.coverage.histories).length,37);eq('actual nested copy25',aggregate.community.ruleset_publication.operations.rows.length,25);eq('actual nested count1002',aggregate.community.ruleset_publication.operations.total,1002);eq('aggregate same curated fields',aggregate.community.ruleset_publication.operations.rows,first.history.entries.slice(0,25));
 f.db.prepare("UPDATE ruleset_publications SET result_code='private-restored-sentinel',profile_revision='private-restored-sentinel' WHERE actor=?").run(A);
 const unknown=await download(f,collection);ok('unknown restored strings withheld in real history',unknown.history.entries.every(r=>r.result_code===null&&r.profile_revision===null));
 await f.env.DB.batch(data.rulesetPublicationEraseStatements(f.env,A));eq('actual registered scrub preserves all shared rows',count(f,'ruleset_publications'),1003);eq('registered scrub removes own actor authorization',f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications WHERE actor=?').get(A).n,0);
 const erased=await download(f,collection);eq('erased own operation history empty',erased.history.capture.count,0);eq('other actor metadata preserved',f.db.prepare('SELECT COUNT(*)n FROM ruleset_publications WHERE actor=?').get(B).n,1);
 f.db.close();console.log('ruleset_publication_privacy_test: '+checks+' checks PASS');
}
mainRulesetPrivacy().catch(e=>{console.error(e);process.exitCode=1;});
`;
const m=new Module(p,module);m.filename=p;m.paths=Module._nodeModulePaths(path.dirname(p));m._compile(s.slice(0,cut)+scenario,p);

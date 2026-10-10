/** Independent native projection bounds: all original rows, not just the visible preview/sentinel.
 * Run only against a frozen successor. All privacy authority comes from genuine fixture OAuth.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),boundary='async function main(){';
if(source.split(boundary).length!==2)throw Error('canonical genuine OAuth fixture boundary changed');
const casePath=path.join(__dirname,'privacy_history_native_cases.cjs');
async function review(){
 load('index');const ctx={A,B,STAFF,G,load};
 const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).byteLength;
 async function prepared(f){const connection=await connect(f),frm=await form(f,connection);provider=null;return frm;}
 async function own(f,c='copy',cursor=''){
  const frm=await prepared(f),before=calls.length,r=await copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env);
  eq(c+' bounded projection200',r.status,200);eq(c+' size checks have no provider side effect',calls.length,before);return r.json();
 }
 const latest=f=>f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE subject_id=? AND purpose='own_export' ORDER BY rowid DESC LIMIT 1").get(A).consumed_at;
 async function held(f,c,cursor=''){
  const frm=await prepared(f);let batches=0,error;f.hooks.beforeBatch=()=>batches++;
  try{await copy.exportPrivacyAccess(frm.request({collection:c,cursor}),f.env);}catch(e){error=e;}
  f.hooks.beforeBatch=null;ok(c+' oversized original projection refused',!!error);eq(c+' oversize refusal503',error.status,503);
  eq(c+' no native retry after oversize',batches,1);eq(c+' oversize rollback leaves original fresh grant unconsumed',latest(f),null);
  eq(c+' oversize has no ordinary authority creation',[count(f,'site_users'),count(f,'members'),count(f,'privacy_subjects'),count(f,'role_settlements')],[0,0,0,0]);
 }
 // A bounded retained legacy display row below the conservative limit remains complete and untruncated.
 let f=fixture();nativeCases.seed(f,'site.friends',A,31,ctx);f.db.prepare('UPDATE site_friends SET note=? WHERE owner_id=?').run('F'.repeat(3000),A);
 const aggregate=await own(f);eq('large safe preview bounded25',aggregate.site.friends.rows.length,25);eq('large safe preview truthful count31',aggregate.coverage.histories['site.friends'].capture.count,31);
 const all=await own(f,'site.friends',aggregate.coverage.histories['site.friends'].currentCursor);
 eq('safe selected31 complete',all.history.entries.length,31);for(const row of all.history.entries){eq('safe legacy text remains untruncated',row.note,'F'.repeat(3000));ok('safe serialized own row within16KiB',bytes(row)<=16384);}f.db.close();
 // Oversize beyond aggregate25 and selected1000 is still in the original retained range and must hold both.
 for(const c of['copy','site.friends']){
  f=fixture();nativeCases.seed(f,'site.friends',A,1002,ctx);f.db.prepare('UPDATE site_friends SET note=? WHERE rowid=(SELECT MAX(rowid)FROM site_friends)').run('X'.repeat(20000));
  await held(f,c);f.db.close();
 }
 // Neither a captured current page nor its final tail can silently drop a newly oversized original position.
 for(const position of['currentCursor','nextCursor']){
  f=fixture();nativeCases.seed(f,'site.friends',A,1002,ctx);const first=(await own(f,'site.friends')).history;
  f.db.prepare('UPDATE site_friends SET note=? WHERE rowid=(SELECT MAX(rowid)FROM site_friends)').run('😀'.repeat(10000));
  await held(f,'site.friends',first[position]);f.db.close();
 }
 // Other owners and withheld raw provider payloads are outside the safe field/owner projection.
 f=fixture();nativeCases.seed(f,'site.friends',A,1,ctx);nativeCases.seed(f,'site.friends',B,1,ctx,10000);
 f.db.prepare('UPDATE site_friends SET note=? WHERE owner_id=?').run('Other owner '.repeat(20000),B);
 const scoped=await own(f);eq('oversize counterpart cannot block own copy',scoped.site.friends.rows.length,1);eq('oversize counterpart not returned',scoped.site.friends.rows[0].note,'Own note 0');f.db.close();
 for(const [c,field] of[['community.councillor_verification.councillorKeys','public_key'],['community.contributions.receipts','source_id'],['privacyLifecycle.providerCleanup','message_id']]){
  f=fixture();const item=nativeCases.cases.find(x=>x.key===c);nativeCases.seed(f,c,A,1,ctx);
  f.db.prepare('UPDATE '+item.table+' SET '+field+'=?').run('PRIVATE-omitted-'.repeat(20000));
  const result=await own(f,c);eq(c+' omitted oversized data does not refuse safe page',result.history.entries.length,1);ok(c+' omitted oversized data never serialized',!JSON.stringify(result).includes('PRIVATE-omitted-'));f.db.close();
 }
 // Native invalid UTF8 is replaced by the runtime, with the conservative estimate covering the final bytes.
 f=fixture();nativeCases.seed(f,'site.friends',A,1,ctx);f.db.exec("UPDATE site_friends SET note=CAST(x'"+'ff'.repeat(2000)+"' AS TEXT)");
 const invalid=await own(f,'site.friends');ok('native replacement projection remains below final16KiB',bytes(invalid.history.entries[0])<=16384);eq('native invalid UTF8 source is not silently truncated',Array.from(invalid.history.entries[0].note).length,2000);f.db.close();
 provider=null;console.log('privacy_history_size_guard_review_test: '+checks+' checks PASS');
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(boundary))+'\nconst nativeCases=require('+JSON.stringify(casePath)+');\n('+review.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);

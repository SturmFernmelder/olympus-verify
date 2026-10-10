/** Independent original-capture/privacy-purpose/range/response-loss cases for every closed history. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),boundary='async function main(){';
if(source.split(boundary).length!==2)throw Error('genuine OAuth fixture boundary changed');
const casePath=path.join(__dirname,'privacy_history_native_cases.cjs');
async function review(){
 load('index');const ctx={A,B,STAFF,G,load};
 function data(f,c){
  if(c==='actions')f.db.prepare('INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)').run(f.time()-100,A,'own.retained_action',B,JSON.stringify({counterpart:B,staff:STAFF}));
  else if(c==='eventChanges')f.db.prepare('INSERT INTO community_event_changes(event_id,action,actor,at,fields)VALUES(?,?,?,?,?)').run('e'.repeat(22),'updated',A,f.time()-100,'["title"]');
  else if(c==='contributionDecisions')f.db.prepare('INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until)VALUES(?,?,?,?,?,?,?,?,?)').run('olympus',B,1,'state_open','staff:'+A,1,'PRIVATE-decision-nonce',f.time()-100,f.time()+10000);
  else if(c!=='community.privacy_access.connections')nativeCases.seed(f,c,A,1,ctx);
 }
 async function prepared(f,id=A){const connected=await connect(f,id),frm=await form(f,connected);provider=null;return frm;}
 async function page(f,c,cursor=null){const frm=await prepared(f);const r=await copy.exportPrivacyAccess(frm.request({collection:c,cursor:cursor??''}),f.env);eq(c+' native saved capture200',r.status,200);return (await r.json()).history;}
 const latest=f=>f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE subject_id=? AND purpose='own_export' ORDER BY rowid DESC LIMIT 1").get(A).consumed_at;
 async function capture(c,active=true){const f=fixture();if(active)subject(f);data(f,c);return {f,saved:await page(f,c)};}
 // Shared public dispatch cannot grant a weaker family authority than the original three histories.
 for(const c of nativeCases.collections){
  for(const mutation of['generation','revision','state','absence-created','expiry','terminal-expiry']){
   const {f,saved}=await capture(c,mutation!=='absence-created'),frm=await prepared(f);let fired=false;
   const mutate=()=>{fired=true;
    if(mutation==='generation')f.db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run('b'.repeat(32),A);
    else if(mutation==='revision')f.db.prepare('UPDATE privacy_subjects SET revision=revision+1 WHERE subject_id=?').run(A);
    else if(mutation==='state')f.db.prepare("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?").run(A);
    else if(mutation==='absence-created')subject(f);
    else f.advance(720);
   };
   if(mutation==='terminal-expiry')f.hooks.step=i=>{if(i===6)mutate();};
   else f.hooks.beforeBatch=stmts=>{if(stmts.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;mutate();}};
   await refused(c+' '+mutation+' original native authority refuses',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor:saved.currentCursor}),f.env));
   ok(c+' '+mutation+' real atomic race seam reached',fired);eq(c+' '+mutation+' consuming grant rolled back',latest(f),null);f.db.close();
  }
  for(const wrong of['collection','account','purpose','csrf','origin']){
   const {f,saved}=await capture(c),frm=await prepared(f,wrong==='account'?B:A);let req;
   if(wrong==='purpose'){const connection=await connect(f),own=await form(f,connection),erasure=await form(f,connection,'own_erasure');provider=null;req=own.request({collection:c,cursor:saved.currentCursor,grant:erasure.grant,csrf:erasure.csrf});}
   else req=frm.request({collection:wrong==='collection'?c==='actions'?'eventChanges':'actions':c,cursor:saved.currentCursor,...(wrong==='csrf'?{csrf:'z'.repeat(43)}:{})},wrong==='origin'?{Origin:'https://other.invalid'}:{});
   const beforeCalls=calls.length;await refused(c+' wrong '+wrong+' never reads own payload',()=>copy.exportPrivacyAccess(req,f.env));
   eq(c+' wrong '+wrong+' no provider calls',calls.length,beforeCalls);ok(c+' wrong '+wrong+' no fresh export grant spent',f.db.prepare("SELECT COUNT(*)AS n FROM privacy_access_grants WHERE consumed_at IS NOT NULL AND purpose='own_export'").get().n===1);f.db.close();
  }
  for(const terminal of[false,true]){
   const {f,saved}=await capture(c);f.advance(86400-1);const frm=await prepared(f);let fired=false;
   if(terminal)f.hooks.step=i=>{if(i===6){fired=true;f.advance(1);}};
   else f.hooks.beforeBatch=stmts=>{if(stmts.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;fired=true;f.advance(1);}};
   await refused(c+' original cursor24h '+(terminal?'terminal':'start')+' expiry atomic',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor:saved.currentCursor}),f.env));
   ok(c+' cursor expiry seam reached',fired);eq(c+' cursor deadline never spent fresh grant',latest(f),null);f.db.close();
  }
 }
 // Every new native array can lose a retained row without fabricating original completeness.
 for(const item of nativeCases.cases){
  const {f,saved}=await capture(item.key),frm=await prepared(f);
  f.db.prepare('DELETE FROM '+item.table+' WHERE rowid=(SELECT MIN(rowid)FROM '+item.table+')').run();
  let error;try{await copy.exportPrivacyAccess(frm.request({collection:item.key,cursor:saved.currentCursor}),f.env);}catch(e){error=e;}
  ok(item.key+' changed original row count refuses payload',!!error);eq(item.key+' changed original range409',error.status,409);
  ok(item.key+' confirmed changed range spends only fresh read grant',latest(f)!==null);f.db.close();
 }
 // A confirmed native read followed by a lost response is unknown; there is no hidden primary retry or authority refresh.
 for(const c of['site.friends','privacyLifecycle.providerCleanup','community.contributions.receipts','community.councillor_verification.attestations','community.privacy_access.connections']){
  const {f,saved}=await capture(c),frm=await prepared(f);let committed=0;
  f.hooks.afterBatch=stmts=>{if(stmts.length===7){committed++;throw Error('independent lost committed history response');}};
  await refused(c+' lost primary read response remains unknown',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor:saved.currentCursor}),f.env));
  eq(c+' lost primary performs one native transaction',committed,1);ok(c+' original grant actually spent',latest(f)!==null);f.hooks.afterBatch=null;
  await refused(c+' spent same grant never replays payload',()=>copy.exportPrivacyAccess(frm.request({collection:c,cursor:saved.currentCursor}),f.env));
  const recovered=await page(f,c,saved.currentCursor);eq(c+' fresh genuine grant recovers saved exact page',recovered.entries,saved.entries);eq(c+' recovered cursor does not renew24h deadline',recovered.capture.expiresAt,saved.capture.expiresAt);f.db.close();
 }
 // An explicitly mutable display field is allowed to change: the response never advertises an immutable content snapshot.
 const {f,saved}=await capture('site.friends');f.db.prepare('UPDATE site_friends SET note=?').run('Changed own retained note');
 const reread=await page(f,'site.friends',saved.currentCursor);eq('display content mutation preserves original positions/count',reread.capture,saved.capture);eq('display content is truthfully current retained text',reread.entries[0].note,'Changed own retained note');f.db.close();
 provider=null;console.log('privacy_history_family_authority_review_test: '+checks+' checks PASS');
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(boundary))+'\nconst nativeCases=require('+JSON.stringify(casePath)+');\n('+review.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);

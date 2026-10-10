// Addition-only native source tests. Reuse the established genuine identify-only OAuth fixture, not invented grants.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),cut=source.indexOf('async function main(){');
if(cut<0)throw Error('genuine identity fixture boundary changed');
const scenario=String.raw`
const history=load('privacy-access-history');
function seed(f,c,n=1002){
 const at=f.time()-10000;
 let put;
 if(c==='actions')put=i=>f.db.prepare('INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)').run(at+Math.floor(i/3),i%2?A:STAFF,'own.action_'+i,i%2?B:A,JSON.stringify({counterpart:B,staff:STAFF}));
 else if(c==='eventChanges')put=i=>f.db.prepare('INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)').run('e'.repeat(22),'updated',A,at+Math.floor(i/3),JSON.stringify([i%2?'title':'details']));
 else put=i=>f.db.prepare('INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)').run('I',i%3?A:B,i+1,'state_open',i%3?('staff:'+STAFF):('member:'+A),1,'test-only-nonce',at+Math.floor(i/3),f.time()+90000);
 f.db.exec('BEGIN');for(let i=0;i<n;i++)put(i);f.db.exec('COMMIT');
}
async function prepared(f,id=A){const c=await connect(f,id),frm=await form(f,c);provider=null;return frm;}
async function download(f,collection,cursor=null,id=A){
 const frm=await prepared(f,id);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
 const response=await copy.exportPrivacyAccess(frm.request({collection,cursor:cursor??''}),f.env);f.hooks.statement=null;f.hooks.beforeBatch=null;
 eq(collection+' request uses exactly8 native attempts',attempts,8);eq(collection+' batch exactly7 statements',batches,[7]);
 const data=await response.json();eq(collection+' page authority genuine identify only',data.identity.authority,'fresh_identify_only');
 ok(collection+' no structural staff/counterpart identifiers',!JSON.stringify(data).includes(B)&&!JSON.stringify(data).includes(STAFF));
 eq(collection+' no new ordinary accounts or role records',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
 eq(collection+' no provider calls after identity lookup',calls.slice(-2).map(x=>x.url),['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me']);
 eq(collection+' attachment filename closed',response.headers.get('Content-Disposition'),'attachment; filename="olympus-my-'+collection+'-history.json"');
 return {data,frm};
}
const consumed=f=>f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at;
async function expectRefusal(name,f,fields,status,mutate){
 const frm=await prepared(f);if(mutate)f.hooks.beforeBatch=s=>{if(s.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;mutate(f);}};
 let error;try{await copy.exportPrivacyAccess(frm.request(fields),f.env);}catch(e){error=e;}
 ok(name+' refuses',!!error);if(status)eq(name+' bounded status',error.status,status);f.hooks.beforeBatch=null;return error;
}
async function mainHistory(){
 eq('three closed collections',Array.from(history.PRIVACY_HISTORY_COLLECTIONS),['actions','eventChanges','contributionDecisions']);
 eq('cursor traversal fixed86400',history.PRIVACY_HISTORY_SECONDS,86400);
 for(const collection of history.PRIVACY_HISTORY_COLLECTIONS){
  let f=fixture();subject(f);seed(f,collection);const tables=count(f,'sqlite_master');
  const first=await download(f,collection),p=first.data.history;
  eq(collection+' first page1000',p.entries.length,1000);eq(collection+' full selected count1002',p.capture.count,1002);eq(collection+' remaining2',p.capture.remaining,2);eq(collection+' first capture incomplete',p.capture.complete,false);
  ok(collection+' next cursor no raw identity',typeof p.nextCursor==='string'&&!p.nextCursor.includes(A));eq(collection+' cursor length bounded',p.nextCursor.length<=140,true);
  await refused(collection+' one-use original grant cannot read again',()=>copy.exportPrivacyAccess(first.frm.request({collection,cursor:p.currentCursor}),f.env));
  f.advance(721);const last=(await download(f,collection,p.nextCursor)).data.history;
  eq(collection+' fresh grant page returns final2',last.entries.length,2);eq(collection+' full range delivered1002',last.capture.delivered,1002);eq(collection+' no next after complete',last.nextCursor,null);eq(collection+' selected capture complete',last.capture.complete,true);
  eq(collection+' capture time never renews',last.capture.at,p.capture.at);eq(collection+' traversal deadline never renews',last.capture.expiresAt,p.capture.expiresAt);
  eq(collection+' no table creation',count(f,'sqlite_master'),tables);
  const reread=(await download(f,collection,p.currentCursor)).data.history;eq(collection+' current cursor rereads original page',reread.entries,p.entries);
  ok(collection+' reread no all-history assertion',reread.capture.complete===false);f.db.close();
 }
 // Every entry in a larger range is reachable, including equal timestamps crossing page boundaries.
 let f=fixture();seed(f,'actions',3002);let cursor=null,all=[],clock=null;
 for(let page=0;page<4;page++){const p=(await download(f,'actions',cursor)).data.history;all.push(...p.entries);clock??=p.capture.expiresAt;eq('full traversal keeps original deadline',p.capture.expiresAt,clock);cursor=p.nextCursor;}
 eq('3002 entries delivered exactly',all.length,3002);eq('3002 distinct original actions',new Set(all.map(x=>x.action)).size,3002);eq('full traversal terminates',cursor,null);f.db.close();
 f=fixture();for(const c of history.PRIVACY_HISTORY_COLLECTIONS){const p=(await download(f,c)).data.history;eq(c+' empty range honestly complete',p.capture,{at:p.capture.at,expiresAt:p.capture.expiresAt,count:0,delivered:0,remaining:0,complete:true});eq(c+' empty entries',p.entries,[]);}f.db.close();
 // New/backdated rows beyond the original ID high water are excluded, not silently appended to an old capture.
 f=fixture();seed(f,'actions');const original=(await download(f,'actions')).data.history;
 f.db.prepare('INSERT INTO audit(ts,actor,action,subject) VALUES(?,?,?,?)').run(f.time()-20000,A,'new.backdated',A);
 const tail=(await download(f,'actions',original.nextCursor)).data.history;eq('backdated append excludes new ID',tail.entries.map(x=>x.action),['own.action_1000','own.action_1001']);eq('backdated append retains original1002 count',tail.capture.count,1002);f.db.close();
 for(const change of ['delete-delivered','delete-undelivered','move-position','expire-decision']){
  f=fixture();const c=change==='expire-decision'?'contributionDecisions':'actions';seed(f,c);const first=(await download(f,c)).data.history;
  if(change==='delete-delivered')f.db.exec('DELETE FROM audit WHERE id=1');
  if(change==='delete-undelivered')f.db.exec('DELETE FROM audit WHERE id=1002');
  if(change==='move-position')f.db.prepare('UPDATE audit SET ts=? WHERE id=1002').run(f.time()-20000);
  if(change==='expire-decision')f.db.prepare('UPDATE community_contribution_decisions SET retain_until=? WHERE id=1002').run(f.time());
  await expectRefusal(change,f,{collection:c,cursor:first.nextCursor},409);ok(change+' grant consumed after confirmed changed-range read',consumed(f)!==null);f.db.close();
 }
 for(const kind of ['tampered','noncanonical-mac','wrong-collection','wrong-account','null-to-active','active-new-generation','revision','state']){
  f=fixture();if(!kind.startsWith('null'))subject(f);seed(f,'actions');const first=(await download(f,'actions')).data.history;
  let cursor=first.nextCursor,collection='actions',id=A;
  if(kind==='tampered')cursor=cursor.slice(0,-2)+(cursor.at(-2)==='A'?'B':'A')+cursor.at(-1);
  if(kind==='noncanonical-mac'){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';cursor=cursor.slice(0,-1)+chars[chars.indexOf(cursor.at(-1))+1];}
  if(kind==='wrong-collection')collection='eventChanges';if(kind==='wrong-account')id=B;
  if(kind==='null-to-active')subject(f);
  if(kind==='active-new-generation'){f.db.prepare('DELETE FROM privacy_subjects WHERE subject_id=?').run(A);f.db.prepare('INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,\'active\',?,?,?)').run(A,'b'.repeat(32),3,f.time(),f.time());}
  if(kind==='revision')f.db.exec('UPDATE privacy_subjects SET revision=revision+1');if(kind==='state')f.db.exec("UPDATE privacy_subjects SET state='retiring'");
  const frm=await prepared(f,id);await refused(kind+' cursor MAC/original capture refuses',()=>copy.exportPrivacyAccess(frm.request({collection,cursor}),f.env));eq(kind+' invalid cursor does not consume fresh grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at,null);f.db.close();
 }
 for(const kind of ['generation-during-await','null-during-await','revision-during-await','grant-expiry','cursor-start-expiry','cursor-terminal-expiry']){
  f=fixture();if(kind!=='null-during-await')subject(f);seed(f,'actions');const first=(await download(f,'actions')).data.history;
  if(kind.startsWith('cursor-'))f.advance(86400-1);const frm=await prepared(f);let paused=false;
  if(kind==='cursor-terminal-expiry')f.hooks.step=(i,sql)=>{if(i===6){paused=true;f.advance(1);}};
  else f.hooks.beforeBatch=stmts=>{if(stmts.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;paused=true;
   if(kind==='generation-during-await')f.db.prepare('UPDATE privacy_subjects SET generation=?').run('c'.repeat(32));
   if(kind==='null-during-await')subject(f);if(kind==='revision-during-await')f.db.exec('UPDATE privacy_subjects SET revision=revision+1');
   if(kind==='grant-expiry')f.advance(720);if(kind==='cursor-start-expiry')f.advance(1);}};
  await refused(kind+' native guard refuses',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:first.nextCursor}),f.env));ok(kind+' exact native pause fired',paused);eq(kind+' atomic rollback grant unconsumed',consumed(f),null);f.db.close();
 }
 // Atomic faults at admission, payload metadata, and terminal fence cannot spend the grant or produce a partial file.
 for(const fail of [0,4,6]){f=fixture();seed(f,'actions');const frm=await prepared(f);let hit=false;f.hooks.step=i=>{if(i===fail){hit=true;throw Error('synthetic native fault');}};
  await refused('fault'+fail+' refuses',()=>copy.exportPrivacyAccess(frm.request({collection:'actions'}),f.env));ok('fault'+fail+' seam reached',hit);eq('fault'+fail+' consumption rolls back',consumed(f),null);f.db.close();}
 // Lost committed reply is not proof of download. It spends one grant; a fresh grant can reread the saved current page.
 f=fixture();seed(f,'actions');const p=(await download(f,'actions')).data.history,frm=await prepared(f);let lost=false;
 f.hooks.afterBatch=stmts=>{if(stmts.length===7&&!lost){lost=true;throw Error('synthetic lost primary commit reply');}};
 await refused('lost primary reply remains unknown',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:p.nextCursor}),f.env));ok('lost primary batch actually committed',lost&&consumed(f)!==null);f.hooks.afterBatch=null;
 await refused('lost primary grant cannot repeat read',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:p.nextCursor}),f.env));const recovered=(await download(f,'actions',p.nextCursor)).data.history;eq('fresh grant safely rereads lost page',recovered.entries.length,2);f.db.close();
 // Closed forms: cursors cannot travel in addresses, collection/query SQL is never accepted, duplicate fields refuse.
 for(const fields of [{collection:'sqlite_master'},{collection:'copy',cursor:'x'},{collection:'actions',cursor:'x'.repeat(141)},{collection:'actions',cursor:'line\nbreak'},{collection:'actions',table:'audit'}]){
  f=fixture();await expectRefusal('closed '+JSON.stringify(fields),f,fields,400);eq('invalid form never consumes',consumed(f),null);f.db.close();}
 f=fixture();const queryForm=await prepared(f),queryReq=queryForm.request({collection:'actions'});await refused('query cursor forbidden',()=>copy.exportPrivacyAccess(new Request(queryReq.url+'?cursor=x',queryReq),f.env));eq('query never consumes',consumed(f),null);
 const dup=await prepared(f);await refused('duplicate collection forbidden',()=>copy.exportPrivacyAccess(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:dup.request().headers.get('Cookie'),Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dup.csrf,grant:dup.grant,collection:'actions'}).toString()+'&collection=eventChanges'}),f.env));f.db.close();
 f=fixture();seed(f,'actions',1);const connection=await connect(f),eraseForm=await form(f,connection,'own_erasure'),ownForm=await form(f,connection);provider=null;
 await refused('erasure-purpose credentials cannot download history',()=>copy.exportPrivacyAccess(ownForm.request({collection:'actions',csrf:eraseForm.csrf,grant:eraseForm.grant}),f.env));eq('wrong purpose leaves both grants unconsumed',f.db.prepare('SELECT COUNT(*) AS n FROM privacy_access_grants WHERE consumed_at IS NULL').get().n,2);f.db.close();
 f=fixture();seed(f,'actions',1);const concurrent=await prepared(f),races=await Promise.allSettled([copy.exportPrivacyAccess(concurrent.request({collection:'actions'}),f.env),copy.exportPrivacyAccess(concurrent.request({collection:'actions'}),f.env)]);
 eq('concurrent original grant admits exactly one page',races.filter(x=>x.status==='fulfilled').length,1);eq('concurrent loser cannot fabricate second authority',races.filter(x=>x.status==='rejected').length,1);ok('single concurrent grant spent once',consumed(f)!==null);f.db.close();
 f=fixture();const htmlConnection=await connect(f),html=await (await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:htmlConnection.cookie}}),f.env)).text();
 for(const collection of ['copy',...history.PRIVACY_HISTORY_COLLECTIONS])ok('script-free select includes closed '+collection,html.includes('<option value="'+collection+'">'));
 ok('script-free cursor textarea finite140',html.includes('name="cursor" maxlength="140"'));ok('consumed page can explicitly reconnect',html.includes('Reconnect Discord for a fresh page grant'));ok('cursor never placed in URL',!/(href|action)="[^\"]*(cursor|collection)=/.test(html));f.db.close();
 // Root's closed event-field projection applies to every page, including sentinel and later-page legacy rows.
 for(const fields of [JSON.stringify({counterpart:B}),JSON.stringify(['title','title']),JSON.stringify(['unknownField']),JSON.stringify([B]),JSON.stringify(['title',{staff:STAFF}])]){
  f=fixture();seed(f,'eventChanges',1002);f.db.prepare('UPDATE community_event_changes SET fields=? WHERE id=1001').run(fields);
  await expectRefusal('malformed event sentinel '+fields,f,{collection:'eventChanges'},503);ok('malformed confirmed read spends grant',consumed(f)!==null);f.db.close();}
 f=fixture();seed(f,'eventChanges');const good=(await download(f,'eventChanges')).data.history;f.db.prepare('UPDATE community_event_changes SET fields=? WHERE id=1002').run(JSON.stringify({id:B}));
 await expectRefusal('later malformed event field',f,{collection:'eventChanges',cursor:good.nextCursor},503);f.db.close();
 // A malformed legacy JSON file is modeled explicitly; production json_valid constraints stay in force otherwise.
 f=fixture();seed(f,'eventChanges',1);f.db.exec('PRAGMA ignore_check_constraints=ON');f.db.prepare('UPDATE community_event_changes SET fields=?').run('not JSON '+B);f.db.exec('PRAGMA ignore_check_constraints=OFF');
 await expectRefusal('legacy unreadable JSON no payload',f,{collection:'eventChanges'},503);ok('legacy unreadable confirmed read grant consumed',consumed(f)!==null);f.db.close();
 f=fixture();seed(f,'contributionDecisions',3);const decisionsPage=(await download(f,'contributionDecisions')).data.history;
 eq('counterpart decision identities omitted; own relationships retained',decisionsPage.entries.map(x=>x.relation),['actor','subject','subject']);f.db.close();
 // Remaining registered families are measured, not implicitly promoted to comprehensive continuation.
 f=fixture();f.db.exec('BEGIN');for(let i=0;i<1002;i++)f.db.prepare('INSERT INTO verification_requests(code,requester,created_at,expires_at,state) VALUES(?,?,?,?,?)').run('test-only-request-'+i,A,f.time()-i,f.time()+300,'pending');f.db.exec('COMMIT');
 const registry=load('community-context'),plan=registry.communityExportPlan(f.env,A),native=await f.env.DB.batch(plan.statements),shaped=plan.shape(native),qr=shaped.councillor_verification;
 eq('remaining QR requests expose concrete total1002',qr.requests.total,1002);eq('remaining QR request copy still bounded1000',qr.requests.rows.length,1000);eq('remaining QR requests do not claim completion',qr.requests.complete,false);eq('remaining QR has five limited families',Object.keys(qr).length,5);
 const inventory={registeredFamilies:Array.from(registry.communityDataNames()),communityStatementCount:plan.statements.length,
  queryCensus:plan.statements.map((s,i)=>({index:i,tables:Array.from(new Set(Array.from(s.sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_]+)/gi),x=>x[1]))),limit:/\bLIMIT\s+(\d+)/i.exec(s.sql)?.[1]??null,returned:native[i].results.length})),
  qrLimitedFamilies:Object.fromEntries(Object.entries(qr).map(([name,v])=>[name,{total:v.total,returned:v.rows.length,complete:v.complete,limit:v.limit,continuation:false}])),
  limitation:'Three history continuations only. Registered unbounded projections retain their existing semantics and query size limits. Five bounded QR family copies still have no continuation; no all-store completeness claim.'};
 console.log('PRIVACY_HISTORY_REMAINING_INVENTORY '+JSON.stringify(inventory));f.db.close();
 provider=null;console.log('privacy_access_history_test: '+checks+' checks PASS');
}
mainHistory().catch(e=>{console.error('FAIL privacy_access_history_test',e);process.exitCode=1;});
`;
const moduleUnderTest=new Module(__filename,module);moduleUnderTest.filename=__filename;moduleUnderTest.paths=module.paths;
moduleUnderTest._compile(source.slice(0,cut)+scenario,__filename);

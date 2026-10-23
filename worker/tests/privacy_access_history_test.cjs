// Addition-only native source tests. Reuse the established genuine identify-only OAuth fixture, not invented grants.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const fixturePath=path.join(__dirname,'privacy_access_test.cjs');
const source=fs.readFileSync(fixturePath,'utf8'),cut=source.indexOf('async function main(){');
if(cut<0)throw Error('genuine identity fixture boundary changed');
const scenario=String.raw`
const history=load('privacy-access-history');
async function seed(f,c,n=1002){
 const at=f.time()-10000;
 let put;
 if(c==='actions')put=async i=>await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)',at+Math.floor(i/3),i%2?A:STAFF,'own.action_'+i,i%2?B:A,JSON.stringify({counterpart:B,staff:STAFF}));
 else if(c==='eventChanges')put=async i=>await fixtureWrite(f,'INSERT INTO community_event_changes(event_id,action,actor,at,fields) VALUES(?,?,?,?,?)','e'.repeat(22),'updated',A,at+Math.floor(i/3),JSON.stringify([i%2?'title':'details']));
 else put=async i=>await fixtureWrite(f,'INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)','I',i%3?A:B,i+1,'state_open',i%3?('staff:'+STAFF):('member:'+A),1,'test-only-nonce',at+Math.floor(i/3),f.time()+90000);
 f.db.exec('BEGIN');for(let i=0;i<n;i++)await put(i);f.db.exec('COMMIT');
}
async function prepared(f,id=A){const c=await connect(f,id),frm=await form(f,c);provider=null;return frm;}
async function download(f,collection,cursor=null,id=A){
 const frm=await prepared(f,id);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
 const response=await copy.exportPrivacyAccess(frm.request({collection,cursor:cursor??''}),f.env);f.hooks.statement=null;f.hooks.beforeBatch=null;
 eq(collection+' eight logical statements plus five Native admission statements',attempts,13);eq(collection+' physical read/write groups preserve original seven-statement payload',batches,[2,11]);
 const data=await response.json();eq(collection+' page authority genuine identify only',data.identity.authority,'fresh_identify_only');
 ok(collection+' no structural staff/counterpart identifiers',!JSON.stringify(data).includes(B)&&!JSON.stringify(data).includes(STAFF));
 eq(collection+' no new ordinary accounts or role records',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
 eq(collection+' no provider calls after identity lookup',calls.slice(-2).map(x=>x.url),['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me']);
 eq(collection+' attachment filename closed',response.headers.get('Content-Disposition'),'attachment; filename="olympus-my-'+collection+'-history.json"');
 return {data,frm};
}
const consumed=f=>f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at;
async function expectRefusal(name,f,fields,status,mutate){
 const frm=await prepared(f);if(mutate)f.hooks.beforeBatch=async s=>{if(s.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;await mutate(f);}};
 let error;try{await copy.exportPrivacyAccess(frm.request(fields),f.env);}catch(e){error=e;}
 ok(name+' refuses',!!error);if(status)eq(name+' bounded status',error.status,status);f.hooks.beforeBatch=null;return error;
}

const familyOwn=load('privacy-access-family-history');
const extras=Array.from(familyOwn.PRIVACY_COLLECTION_ONLY_HISTORY_COLLECTIONS);
async function seedExtra(f,c,n=1002){
 const at=f.time()-100,initial=!f.installed();
 if(c==='verification.battleNetCharacters'){
  const put=(...values)=>fixtureWrite(f,'INSERT INTO bnet_characters(discord_id,character_id,name,realm_or_ruleset,level,fetched_at) VALUES(?,?,?,?,?,?)',...values);
  if(initial)f.db.exec('BEGIN');for(let i=0;i<n;i++)await put(A,'private-bnet-'+i,'Own Character '+i,i%2?'Original Realm':null,i%2?60:null,at);await put(B,'private-foreign-id','FOREIGN_CHARACTER','FOREIGN_REALM',70,at);if(initial)f.db.exec('COMMIT');
 }else if(c==='verification.rosterEffects'){
  await fixtureWrite(f,'INSERT INTO roster_effect_runs(id,snapshot_id,removals,created_at) VALUES(1,991,0,?)',at-500);
  const put=(...values)=>fixtureWrite(f,'INSERT INTO roster_effects(run_id,seq,kind,name_key,name,discord_id,guid,done_at,claim,subject_generation) VALUES(?,?,?,?,?,?,?,?,?,?)',...values);
  if(initial)f.db.exec('BEGIN');for(let i=0;i<n;i++)await put(i%2?2:1,i,['promote','note','depart'][i%3],'private-name-key-'+i,'Own Character '+i,A,'PRIVATE_GUID',i%3?null:at,'PRIVATE_CLAIM',G);await put(3,9000,'note','private-foreign','FOREIGN_CHARACTER',B,'PRIVATE_FOREIGN_GUID',at,'PRIVATE_FOREIGN_CLAIM',G);await put(3,9001,'note','private-null','NULL_G_CHARACTER',A,null,null,null,null);await put(3,9002,'note','private-old','OLD_G_CHARACTER',A,null,null,null,'b'.repeat(32));if(initial)f.db.exec('COMMIT');
 }else{
  const put=(...values)=>fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)',...values);
  for(const [i,k]of familyOwn.PRIVACY_OWN_SETTING_KEYS.entries())await put(k,'PRIVATE_SETTING_VALUE_'+i,at-i,A);
  await put('officer_digest','PRIVATE_DIGEST_STATE',at,A);await put('betaResetIntent','PRIVATE_RESET_NONCE',at,A);await put('newsFigures','PRIVATE_AUTOMATIC_VALUE',at,A);await fixtureWrite(f,"UPDATE site_settings SET updated_by=? WHERE key='auditTypedNames'",A);await put('unknown_foreign_key','PRIVATE_FOREIGN_VALUE',at,B);
 }
}
/* BEGIN account151 roster history response cases */
async function rosterHistoryMessageCases(){
 const policy=load('policy-forms'),{FormError}=load('policy-form-core');
 const special='This roster-history download needs attended review',generic='The connection or form could not be confirmed.';
 const nativeForm=async f=>{f.env.PRIVACY_ACCESS_ENABLED='true';const connection=await connect(f),frm=await form(f,connection);provider=null;return frm;};
 const ownRoster=async (f,name='Own Character')=>await fixtureWrite(f,"INSERT INTO roster_effects(run_id,seq,kind,name_key,name,discord_id,subject_generation) VALUES(9,0,'note','own-character',?,?,?)",name,A,G);
 const page=async(f,frm,fields)=>{const before=calls.length,response=await policy.handlePolicyForms(frm.request(fields),f.env,'/privacy/access/export',true);ok('roster UI actual source Response',response instanceof Response);eq('roster UI no export provider calls',calls.length,before);return {response,text:await response.text()};};
 const held=(name,result,status,wantSpecial)=>{
  eq(name+' exact status',result.response.status,status);eq(name+' no attachment',result.response.headers.get('Content-Disposition'),null);
  eq(name+' known linkage prose only',result.text.includes(special),wantSpecial);eq(name+' generic reconnect prose only',result.text.includes(generic),!wantSpecial);
  ok(name+' no identity or error internals',![A,B,STAFF,G,'privacy_history_generation_unavailable','privacy_copy_unconfirmed','test-access-token','test-only-oauth-client'].some(x=>result.text.includes(x)));
  ok(name+' script-free response',result.response.headers.get('Content-Security-Policy').includes("script-src 'none'")&&!result.text.includes('<script'));
 };
 {
  const f=fixture();try{
   const frm=await nativeForm(f),result=await page(f,frm,{collection:'verification.rosterEffects'});held('native missing original generation',result,409,true);
   ok('missing generation attended original-link explanation',result.text.includes('original account link')&&result.text.includes('A fresh Discord sign-in alone does not create that link.')&&result.text.includes('/privacy/contact'));
   eq('missing generation fixture has no roster records',[count(f,'roster_effects'),count(f,'roster_effect_runs')],[0,0]);
   ok('missing generation response does not claim records exist',!result.text.includes('these records')&&!result.text.includes('older roster records'));
   eq('missing generation leaves grant unconsumed',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);
   eq('missing generation invents no account link',count(f,'privacy_subjects'),0);
   eq('missing generation creates no ordinary account member role',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
  }finally{f.db.close();}
 }
 {
  const f=fixture();try{
   await subject(f);await ownRoster(f,'x'.repeat(20000));const frm=await nativeForm(f),result=await page(f,frm,{collection:'verification.rosterEffects'});held('native selected roster byte overflow',result,503,false);
   eq('native byte overflow rolls back consume',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);
  }finally{f.db.close();}
 }
 for(const failure of ['expired','csrf']){
  const f=fixture();try{
   await subject(f);await ownRoster(f);const frm=await nativeForm(f);if(failure==='expired')f.advance(720);
   const fields={collection:'verification.rosterEffects',...(failure==='csrf'?{csrf:'z'.repeat(43)}:{})};held('native '+failure+' form',await page(f,frm,fields),403,false);
   eq('native '+failure+' leaves consume unchanged',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);
  }finally{f.db.close();}
 }
 {
  const f=fixture();try{
   await subject(f);await ownRoster(f);const frm=await nativeForm(f),result=await page(f,frm,{collection:'verification.rosterEffects'}),data=JSON.parse(result.text);
   eq('native orphan parent download remains200',result.response.status,200);eq('native orphan remains null',data.history.entries[0].run,null);
   eq('native orphan pending original metadata',[data.history.entries[0].processingStatus,data.history.entries[0].processingRecordedAt],['pending',null]);
   eq('native valid attachment unchanged',result.response.headers.get('Content-Disposition'),'attachment; filename="olympus-my-verification.rosterEffects-history.json"');
  }finally{f.db.close();}
 }
 for(const [name,route,error,status]of [
  ['same code outside export','/privacy/callback',new FormError('privacy_history_generation_unavailable',409),409],
  ['different conflict code','/privacy/access/export',new FormError('privacy_history_changed',409),409],
  ['same code wrong status','/privacy/access/export',new FormError('privacy_history_generation_unavailable',403),403],
  ['untyped same error text','/privacy/access/export',new Error('privacy_history_generation_unavailable'),503],
 ]){const response=access.privacyAccessRefusal(new Request(BASE+route),error);held(name,{response,text:await response.text()},status,false);}
 console.log('ACCOUNT151_ROSTER_MESSAGE_CASES_COMPLETE');
}
/* END account151 roster history response cases */

async function extraCollectionHistoryCases(){
 eq('aggregate exact37 list remains fixed',history.PRIVACY_COPY_HISTORY_COLLECTIONS.length,38);eq('all40 separately downloadable',history.PRIVACY_ALL_HISTORY_COLLECTIONS.length,41);
 eq('three exact extra selectors',extras,['verification.battleNetCharacters','verification.rosterEffects','site.settingUpdates']);
 for(const c of extras){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c);const tableCount=count(f,'sqlite_master'),originalDownload=await download(f,c),first=originalDownload.data.history;
  ok(c+' collection-specific truthful scope note',typeof originalDownload.data.coverage.collectionScope==='string'&&originalDownload.data.coverage.collectionScope.length>60);if(c==='verification.rosterEffects')ok('roster processing explicitly before provider with no success claim',originalDownload.data.coverage.collectionScope.includes('before provider work')&&originalDownload.data.coverage.collectionScope.includes('does not confirm'));if(c==='site.settingUpdates')ok('settings scope is current last-updater not edit history',originalDownload.data.coverage.collectionScope.includes('current last updater')&&originalDownload.data.coverage.collectionScope.includes('not edit history'));
  const wanted=c==='site.settingUpdates'?24:1002;eq(c+' exact selected retained count',first.capture.count,wanted);eq(c+' first bounded1000',first.entries.length,Math.min(wanted,1000));
  const serialized=JSON.stringify(first.entries);ok(c+' private operational/source material omitted',!/(PRIVATE_|FOREIGN_|NULL_G_|OLD_G_|__history|subject_generation|character_id|name_key|discord_id)/.test(serialized));
  if(c==='verification.battleNetCharacters'){eq('original historical fetch time unchanged',first.entries[0].fetchedAt,new Date((f.time()-100)*1000).toISOString());eq('nullable historical realm/level remains explicit',[first.entries[0].realmOrRuleset,first.entries[0].level],[null,null]);eq('bnet character ID never emitted',Object.keys(first.entries[0]).sort(),['fetchedAt','level','name','realmOrRuleset']);}
  if(c==='verification.rosterEffects'){eq('parent run creation is original contextual time',first.entries[0].run.createdAt,new Date((f.time()-600)*1000).toISOString());eq('own orphan retains honest null parent',first.entries[1].run,null);eq('null done time is pending stored intent',[first.entries[1].processingRecordedAt,first.entries[1].processingStatus],[null,'pending']);eq('recorded processing is stored intent, not provider settlement',first.entries[0].processingStatus,'recorded');}
  if(c==='site.settingUpdates'){eq('last-updater keys are exact finite human writes',first.entries.map(r=>r.key),Array.from(familyOwn.PRIVACY_OWN_SETTING_KEYS));eq('updater export contains key and original time only',Object.keys(first.entries[0]).sort(),['key','updatedAt']);eq('no claim to all edits',first.capture.complete,true);}
  await refused(c+' original one-use grant refuses repeated download',()=>copy.exportPrivacyAccess(originalDownload.frm.request({collection:c,cursor:first.currentCursor}),f.env));
  if(first.nextCursor){f.advance(721);const last=(await download(f,c,first.nextCursor)).data.history;eq(c+' tail2 all records reachable',last.entries.length,2);eq(c+' complete original1002 range',last.capture.delivered,1002);eq(c+' no invented terminal cursor',last.nextCursor,null);eq(c+' capture time not renewed',last.capture.at,first.capture.at);eq(c+' traversal deadline not renewed',last.capture.expiresAt,first.capture.expiresAt);}
  const reread=(await download(f,c,first.currentCursor)).data.history;eq(c+' saved current cursor rereads original rows',reread.entries,first.entries);eq(c+' no schema change',count(f,'sqlite_master'),tableCount);f.db.close();
 }
 // Historical filtering uses the native database clock, including the existing exact29-day/future300 boundaries.
 {
  const f=fixture();f.setTime(f.time()-90*86400);const at=f.time(),put=f.db.prepare('INSERT INTO bnet_characters VALUES(?,?,?,?,?,?)');
  for(const [name,time]of [['Fresh',at-29*86400+1],['At cutoff',at-29*86400],['Stale',at-29*86400-1],['Allowed future',at+300],['Beyond future',at+301]])put.run(A,name,name,null,null,time);
  const p=(await download(f,'verification.battleNetCharacters')).data.history;eq('native historical freshness exact old29/future300',p.entries.map(r=>r.name),['Fresh','Allowed future']);eq('native generated clock not host clock',p.capture.at,new Date(at*1000).toISOString());f.db.close();
 }
 // NULL original generation refuses only the roster history. It does not acquire a generation or block other histories.
 {
  const f=fixture();await seedExtra(f,'verification.rosterEffects',1);await expectRefusal('missing original rosterG',f,{collection:'verification.rosterEffects'},409);eq('missingG refusal leaves grant unconsumed',consumed(f),null);
  await seedExtra(f,'verification.battleNetCharacters',1);eq('NULLG historical bnet remains independently admitted',(await download(f,'verification.battleNetCharacters')).data.history.entries.length,1);await seedExtra(f,'site.settingUpdates');eq('NULLG settings remain independently admitted',(await download(f,'site.settingUpdates')).data.history.entries.length,24);eq('read never invents serving generation',count(f,'privacy_subjects'),0);f.db.close();
 }
 for(const state of ['retiring','retired']){const f=fixture();await subject(f,state);await seedExtra(f,'verification.rosterEffects',1);eq(state+' original ownG metadata remains readable without granting authority',(await download(f,'verification.rosterEffects')).data.history.entries.length,1);f.db.close();}
 for(const mutation of ['generation','revision','state','expiry']){
  const f=fixture();await subject(f);await seedExtra(f,'verification.rosterEffects',1);const frm=await prepared(f);let hit=false;
  f.hooks.beforeBatch=async ss=>{if(ss.some(s=>s.sql.includes('privacy_access_action_refused'))){hit=true;f.hooks.beforeBatch=null;if(mutation==='generation')await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','c'.repeat(32));if(mutation==='revision')await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1');if(mutation==='state')await fixtureWrite(f,"UPDATE privacy_subjects SET state='retiring'");if(mutation==='expiry')f.advance(720);}};
  await refused('roster original '+mutation+' race refused',()=>copy.exportPrivacyAccess(frm.request({collection:'verification.rosterEffects'}),f.env));ok('roster '+mutation+' native seam hit',hit);eq('roster '+mutation+' native rollback preserves grant',consumed(f),null);f.db.close();
 }
 for(const c of extras){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c,c==='site.settingUpdates'?24:1002);const first=(await download(f,c)).data.history;
  const frm=await prepared(f);await refused(c+' wrong collection bound cursor refused',()=>copy.exportPrivacyAccess(frm.request({collection:c==='site.settingUpdates'?'verification.battleNetCharacters':'site.settingUpdates',cursor:first.currentCursor}),f.env));eq(c+' invalid cursor does not consume fresh grant',consumed(f),null);
  if(c!=='site.settingUpdates'){
   if(c==='verification.battleNetCharacters')await fixtureWrite(f,'INSERT INTO bnet_characters VALUES(?,?,?,?,?,?)',A,'backdated-extra','New Backdated',null,null,f.time()-500);
   else await fixtureWrite(f,'INSERT INTO roster_effects(run_id,seq,kind,name_key,name,discord_id,subject_generation)VALUES(9,10099,\'promote\',\'backdated-extra\',\'New Backdated\',?,?)',A,G);
   const tail=(await download(f,c,first.nextCursor)).data.history;eq(c+' appended original rowid outside capture excluded',tail.entries.length,2);eq(c+' original highwater count not renewed',tail.capture.count,1002);
  }
  f.db.close();
 }
 for(const c of extras){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c,1);
  if(c==='verification.battleNetCharacters')await fixtureWrite(f,'UPDATE bnet_characters SET realm_or_ruleset=? WHERE discord_id=?','x'.repeat(20000),A);
  else if(c==='verification.rosterEffects')await fixtureWrite(f,'UPDATE roster_effects SET name=? WHERE discord_id=? AND subject_generation=?','x'.repeat(20000),A,G);
  else await fixtureWrite(f,'UPDATE site_settings SET updated_at=? WHERE key=\'leadership\'','x'.repeat(20000));
  await expectRefusal(c+' native projected byte overflow',f,{collection:c},503);eq(c+' overflow rolls back original grant',consumed(f),null);f.db.close();
 }
 for(const c of ['verification.battleNetCharacters','verification.rosterEffects']){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c,1002);
  if(c==='verification.battleNetCharacters')await fixtureWrite(f,'UPDATE bnet_characters SET level=\'malformed\' WHERE character_id=\'private-bnet-1000\'');
  else await fixtureWrite(f,'UPDATE roster_effects SET done_at=-1 WHERE seq=1000');
  await expectRefusal(c+' malformed sentinel1001 no partial attachment',f,{collection:c},503);ok(c+' confirmed malformed read spends one grant only',consumed(f)!==null);f.db.close();
 }
 for(const c of extras){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c,1);
  if(c==='verification.battleNetCharacters')await fixtureWrite(f,'UPDATE bnet_characters SET name=? WHERE discord_id=?','Own\u0000Name',A);
  else if(c==='verification.rosterEffects')await fixtureWrite(f,'UPDATE roster_effects SET name=? WHERE discord_id=? AND subject_generation=?','Own\nName',A,G);
  else await fixtureWrite(f,"UPDATE site_settings SET updated_at=0.5 WHERE key='leadership'");
  await expectRefusal(c+' malformed original metadata refuses bounded503',f,{collection:c},503);f.db.close();
 }
 // Embedded NUL must be refused inside SQLite, before the native string bridge can truncate it.
 for(const [c,column]of [['verification.battleNetCharacters','name'],['verification.battleNetCharacters','realm_or_ruleset'],['verification.rosterEffects','name']]){
  const f=fixture();if(c==='verification.rosterEffects')await subject(f);await seedExtra(f,c,1);const table=c==='verification.rosterEffects'?'roster_effects':'bnet_characters';await fixtureWrite(f,'UPDATE '+table+' SET '+column+'=? WHERE discord_id=?','Own\u0000Suffix',A);await expectRefusal(c+' '+column+' NUL before nativebridge',f,{collection:c},503);eq(c+' '+column+' NUL native rollback preserves grant',consumed(f),null);f.db.close();
 }
 // The same closed shared byte contract protects all37 existing histories and the eight scalar slots.
 for(const sentinel of [false,true]){
  const f=fixture();await seed(f,'actions',sentinel?1002:1);await fixtureWrite(f,'UPDATE audit SET action=? WHERE id=?','own.safe\u0000suffix',sentinel?1001:1);await expectRefusal('shared existing action'+(sentinel?' sentinel1001':'')+' NUL native refusal',f,{collection:'actions'},503);eq('shared action NUL byte read atomically rolls back grant',consumed(f),null);f.db.close();
 }
 {
  const f=fixture();await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)',f.time(),A,'own.visible',A,'omitted\u0000private');await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,?,?,?,?)',f.time(),B,'foreign\u0000private',B,'omitted');
  eq('shared byte NUL in foreign or deliberately omitted field never blocks own data',(await download(f,'actions')).data.history.entries.map(r=>r.action),['own.visible']);f.db.close();
 }
 {
  const f=fixture();await fixtureWrite(f,'INSERT INTO site_users(discord_id,username,first_login,last_login)VALUES(?,?,?,?)',A,'Own\u0000Suffix',f.time(),f.time());await expectRefusal('existing own scalar NUL refuses native503 without truncated attachment',f,{collection:'copy'},503);eq('own scalar NUL original consumption rolled back',consumed(f),null);f.db.close();
 }
 {
  const f=fixture();await fixtureWrite(f,'INSERT INTO site_users(discord_id,username,first_login,last_login)VALUES(?,?,?,?)',B,'Foreign\u0000Suffix',f.time(),f.time());const frm=await prepared(f),r=await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env),data=await r.json();eq('foreign scalar NUL excluded independently',r.status,200);eq('foreign NUL does not invent own account',data.account,null);f.db.close();
 }
 // Adding selectable histories never adds their two queries to the aggregate37 preview transaction.
 {
  const f=fixture();await subject(f);for(const c of extras)await seedExtra(f,c,1);const frm=await prepared(f);let attempts=0,batches=[],sql=[];f.hooks.statement=s=>{attempts++;sql.push(s);};f.hooks.beforeBatch=ss=>batches.push(ss.length);
  const r=await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env),data=await r.json();f.hooks.statement=null;f.hooks.beforeBatch=null;
  eq('aggregate original92 logical plus5 controls plus1 packed metadata read',attempts,98);ok('aggregate physical attempts stay strictly below100',attempts<100);eq('aggregate original payload group plus1 metadata read',batches,[2,96]);eq('aggregate descriptors remain exact38',Object.keys(data.coverage.histories).sort(),Array.from(history.PRIVACY_COPY_HISTORY_COLLECTIONS).sort());
  for(const c of extras)ok(c+' never silently previewed',!Object.hasOwn(data.coverage.histories,c));ok('aggregate no bnet/roster/settings history SQL',!sql.some(s=>/FROM bnet_characters|FROM roster_effects e|FROM site_settings WHERE updated_by/.test(s)));
  for(const table of ['bnet_characters','roster_effects']){const row=data.coverage.storeInventory.stores.find(r=>r.store===table);eq(table+' aggregate truthful collection-only coverage',[row.coverage,row.selectedInThisFile],['collection',false]);}
  const settingCoverage=data.coverage.storeInventory.stores.find(r=>r.store==='site_settings');eq('settings updater history stays separate while bounded new own metadata is selected',[settingCoverage.coverage,settingCoverage.selectedInThisFile,Array.from(settingCoverage.collections)],['selected',true,['community.discord_directory_visibility','community.news_webhook.deliveries','site.settingUpdates']]);
  const con=await connect(f),html=await (await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:con.cookie}}),f.env)).text();for(const c of extras)ok(c+' exact script-free selectable control',html.includes('<option value="'+c+'">'));ok('actual private page distinguishes37previews and40download options',html.includes('previews 38 selected histories')&&html.includes('41 individual history download options')&&html.includes('Those three are not in the account-copy file'));f.db.close();
 }
 // Closed original-generation context cannot accept an arbitrary field or mutable string object.
 for(const contextValue of [null,{originalGeneration:G},Object.freeze({originalGeneration:new String(G)}),Object.freeze({originalGeneration:G,extra:'private'}),Object.freeze({originalGeneration:null}),Object.freeze({originalGeneration:'A'.repeat(32)})]){
  const f=fixture();let refusedContext=false;try{history.boundedPrivacyHistoryStatements(f.env,A,'SELECT rowid AS __history_id,0 AS __history_at FROM roster_effects WHERE discord_id=?1 AND subject_generation=?7',['__history_id'],'__history_id','__history_at',null,1000,contextValue);}catch(e){refusedContext=e.status===503&&e.code==='privacy_copy_unconfirmed';}ok('closed original generation context bounded503 for malformed/mutable input',refusedContext);f.db.close();
 }
}

async function mainHistory(){
 await require('./privacy_registered196_families.cjs').run(root);
 eq('three closed collections',Array.from(history.PRIVACY_HISTORY_COLLECTIONS),['actions','eventChanges','contributionDecisions']);
 eq('cursor traversal fixed86400',history.PRIVACY_HISTORY_SECONDS,86400);
 for(const collection of history.PRIVACY_HISTORY_COLLECTIONS){
  let f=fixture();await subject(f);await seed(f,collection);const tables=count(f,'sqlite_master');
  const first=await download(f,collection),p=first.data.history;
  eq(collection+' first page1000',p.entries.length,1000);eq(collection+' full selected count1002',p.capture.count,1002);eq(collection+' remaining2',p.capture.remaining,2);eq(collection+' first capture incomplete',p.capture.complete,false);
  ok(collection+' next cursor no raw identity',typeof p.nextCursor==='string'&&!p.nextCursor.includes(A));eq(collection+' cursor length bounded',p.nextCursor.length<=140,true);
  await refused(collection+' one-use original grant cannot read again',()=>copy.exportPrivacyAccess(originalDownload.frm.request({collection,cursor:p.currentCursor}),f.env));
  f.advance(721);const last=(await download(f,collection,p.nextCursor)).data.history;
  eq(collection+' fresh grant page returns final2',last.entries.length,2);eq(collection+' full range delivered1002',last.capture.delivered,1002);eq(collection+' no next after complete',last.nextCursor,null);eq(collection+' selected capture complete',last.capture.complete,true);
  eq(collection+' capture time never renews',last.capture.at,p.capture.at);eq(collection+' traversal deadline never renews',last.capture.expiresAt,p.capture.expiresAt);
  eq(collection+' no table creation',count(f,'sqlite_master'),tables);
  const reread=(await download(f,collection,p.currentCursor)).data.history;eq(collection+' current cursor rereads original page',reread.entries,p.entries);
  ok(collection+' reread no all-history assertion',reread.capture.complete===false);f.db.close();
 }
 // Every entry in a larger range is reachable, including equal timestamps crossing page boundaries.
 let f=fixture();await seed(f,'actions',3002);let cursor=null,all=[],clock=null;
 for(let page=0;page<4;page++){const p=(await download(f,'actions',cursor)).data.history;all.push(...p.entries);clock??=p.capture.expiresAt;eq('full traversal keeps original deadline',p.capture.expiresAt,clock);cursor=p.nextCursor;}
 eq('3002 entries delivered exactly',all.length,3002);eq('3002 distinct original actions',new Set(all.map(x=>x.action)).size,3002);eq('full traversal terminates',cursor,null);f.db.close();
 f=fixture();for(const c of history.PRIVACY_HISTORY_COLLECTIONS){const p=(await download(f,c)).data.history;eq(c+' empty range honestly complete',p.capture,{at:p.capture.at,expiresAt:p.capture.expiresAt,count:0,delivered:0,remaining:0,complete:true});eq(c+' empty entries',p.entries,[]);}f.db.close();
 // New/backdated rows beyond the original ID high water are excluded, not silently appended to an old capture.
 f=fixture();await seed(f,'actions');const original=(await download(f,'actions')).data.history;
 await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject) VALUES(?,?,?,?)',f.time()-20000,A,'new.backdated',A);
 const tail=(await download(f,'actions',original.nextCursor)).data.history;eq('backdated append excludes new ID',tail.entries.map(x=>x.action),['own.action_1000','own.action_1001']);eq('backdated append retains original1002 count',tail.capture.count,1002);f.db.close();
 for(const change of ['delete-delivered','delete-undelivered','move-position','expire-decision']){
  f=fixture();const c=change==='expire-decision'?'contributionDecisions':'actions';await seed(f,c);const first=(await download(f,c)).data.history;
  if(change==='delete-delivered')await fixtureWrite(f,'DELETE FROM audit WHERE id=1');
  if(change==='delete-undelivered')await fixtureWrite(f,'DELETE FROM audit WHERE id=1002');
  if(change==='move-position')await fixtureWrite(f,'UPDATE audit SET ts=? WHERE id=1002',f.time()-20000);
  if(change==='expire-decision')await fixtureWrite(f,'UPDATE community_contribution_decisions SET retain_until=? WHERE id=1002',f.time());
  await expectRefusal(change,f,{collection:c,cursor:first.nextCursor},409);ok(change+' grant consumed after confirmed changed-range read',consumed(f)!==null);f.db.close();
 }
 for(const kind of ['tampered','noncanonical-mac','wrong-collection','wrong-account','null-to-active','active-new-generation','revision','state']){
  f=fixture();if(!kind.startsWith('null'))await subject(f);await seed(f,'actions');const first=(await download(f,'actions')).data.history;
  let cursor=first.nextCursor,collection='actions',id=A;
  if(kind==='tampered')cursor=cursor.slice(0,-2)+(cursor.at(-2)==='A'?'B':'A')+cursor.at(-1);
  if(kind==='noncanonical-mac'){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';cursor=cursor.slice(0,-1)+chars[chars.indexOf(cursor.at(-1))+1];}
  if(kind==='wrong-collection')collection='eventChanges';if(kind==='wrong-account')id=B;
  if(kind==='null-to-active')await subject(f);
  if(kind==='active-new-generation'){await fixtureWrite(f,'DELETE FROM privacy_subjects WHERE subject_id=?',A);await fixtureWrite(f,'INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,\'active\',?,?,?)',A,'b'.repeat(32),3,f.time(),f.time());}
  if(kind==='revision')await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1');if(kind==='state')await fixtureWrite(f,"UPDATE privacy_subjects SET state='retiring'");
  const frm=await prepared(f,id);await refused(kind+' cursor MAC/original capture refuses',()=>copy.exportPrivacyAccess(frm.request({collection,cursor}),f.env));eq(kind+' invalid cursor does not consume fresh grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at,null);f.db.close();
 }
 for(const kind of ['generation-during-await','null-during-await','revision-during-await','grant-expiry','cursor-start-expiry','cursor-terminal-expiry']){
  f=fixture();if(kind!=='null-during-await')await subject(f);await seed(f,'actions');const first=(await download(f,'actions')).data.history;
  if(kind.startsWith('cursor-'))f.advance(86400-1);const frm=await prepared(f);let paused=false;
  if(kind==='cursor-terminal-expiry')f.hooks.step=(_i,sql)=>{if(sql.includes('privacy_access_read_refused')){paused=true;f.advance(1);}};
  else f.hooks.beforeBatch=async stmts=>{if(stmts.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;paused=true;
   if(kind==='generation-during-await')await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','c'.repeat(32));
   if(kind==='null-during-await')await subject(f);if(kind==='revision-during-await')await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1');
   if(kind==='grant-expiry')f.advance(720);if(kind==='cursor-start-expiry')f.advance(1);}};
  await refused(kind+' native guard refuses',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:first.nextCursor}),f.env));ok(kind+' exact native pause fired',paused);eq(kind+' atomic rollback grant unconsumed',consumed(f),null);f.db.close();
 }
 // Atomic faults at admission, payload metadata, and terminal fence cannot spend the grant or produce a partial file.
 for(const fail of [0,4,6]){f=fixture();await seed(f,'actions');const frm=await prepared(f);let hit=false;f.hooks.step=i=>{if(i===fail+2){hit=true;throw Error('synthetic native fault');}};
  await refused('fault'+fail+' refuses',()=>copy.exportPrivacyAccess(frm.request({collection:'actions'}),f.env));ok('fault'+fail+' seam reached',hit);eq('fault'+fail+' consumption rolls back',consumed(f),null);f.db.close();}
 // Lost committed reply is not proof of download. It spends one grant; a fresh grant can reread the saved current page.
 f=fixture();await seed(f,'actions');const p=(await download(f,'actions')).data.history,frm=await prepared(f);let lost=false;
 f.hooks.afterBatch=stmts=>{if(stmts.some(s=>s.sql.includes('privacy_access_action_refused'))&&!lost){lost=true;throw Error('synthetic lost primary commit reply');}};
 await refused('lost primary reply remains unknown',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:p.nextCursor}),f.env));ok('lost primary batch actually committed',lost&&consumed(f)!==null);f.hooks.afterBatch=null;
 await refused('lost primary grant cannot repeat read',()=>copy.exportPrivacyAccess(frm.request({collection:'actions',cursor:p.nextCursor}),f.env));const recovered=(await download(f,'actions',p.nextCursor)).data.history;eq('fresh grant safely rereads lost page',recovered.entries.length,2);f.db.close();
 // Closed forms: cursors cannot travel in addresses, collection/query SQL is never accepted, duplicate fields refuse.
 for(const fields of [{collection:'sqlite_master'},{collection:'copy',cursor:'x'},{collection:'actions',cursor:'x'.repeat(141)},{collection:'actions',cursor:'line\nbreak'},{collection:'actions',table:'audit'}]){
  f=fixture();await expectRefusal('closed '+JSON.stringify(fields),f,fields,400);eq('invalid form never consumes',consumed(f),null);f.db.close();}
 f=fixture();const queryForm=await prepared(f),queryReq=queryForm.request({collection:'actions'});await refused('query cursor forbidden',()=>copy.exportPrivacyAccess(new Request(queryReq.url+'?cursor=x',queryReq),f.env));eq('query never consumes',consumed(f),null);
 const dup=await prepared(f);await refused('duplicate collection forbidden',()=>copy.exportPrivacyAccess(new Request(BASE+'/privacy/access/export',{method:'POST',headers:{Cookie:dup.request().headers.get('Cookie'),Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:dup.csrf,grant:dup.grant,collection:'actions'}).toString()+'&collection=eventChanges'}),f.env));f.db.close();
 f=fixture();await seed(f,'actions',1);const connection=await connect(f),eraseForm=await form(f,connection,'own_erasure'),ownForm=await form(f,connection);provider=null;
 await refused('erasure-purpose credentials cannot download history',()=>copy.exportPrivacyAccess(ownForm.request({collection:'actions',csrf:eraseForm.csrf,grant:eraseForm.grant}),f.env));eq('wrong purpose leaves both grants unconsumed',f.db.prepare('SELECT COUNT(*) AS n FROM privacy_access_grants WHERE consumed_at IS NULL').get().n,2);f.db.close();
 f=fixture();await seed(f,'actions',1);const concurrent=await prepared(f),races=await Promise.allSettled([copy.exportPrivacyAccess(concurrent.request({collection:'actions'}),f.env),copy.exportPrivacyAccess(concurrent.request({collection:'actions'}),f.env)]);
 eq('concurrent original grant admits exactly one page',races.filter(x=>x.status==='fulfilled').length,1);eq('concurrent loser cannot fabricate second authority',races.filter(x=>x.status==='rejected').length,1);ok('single concurrent grant spent once',consumed(f)!==null);f.db.close();
 f=fixture();const htmlConnection=await connect(f),html=await (await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:htmlConnection.cookie}}),f.env)).text();
 for(const collection of ['copy',...history.PRIVACY_HISTORY_COLLECTIONS])ok('script-free select includes closed '+collection,html.includes('<option value="'+collection+'">'));
 ok('script-free cursor textarea finite140',html.includes('name="cursor" maxlength="140"'));ok('consumed page can explicitly reconnect',html.includes('Reconnect Discord for a fresh page grant'));ok('cursor never placed in URL',!/(href|action)="[^\"]*(cursor|collection)=/.test(html));f.db.close();
 // Root's closed event-field projection applies to every page, including sentinel and later-page legacy rows.
 for(const fields of [JSON.stringify({counterpart:B}),JSON.stringify(['title','title']),JSON.stringify(['unknownField']),JSON.stringify([B]),JSON.stringify(['title',{staff:STAFF}])]){
  f=fixture();await seed(f,'eventChanges',1002);await fixtureWrite(f,'UPDATE community_event_changes SET fields=? WHERE id=1001',fields);
  await expectRefusal('malformed event sentinel '+fields,f,{collection:'eventChanges'},503);ok('malformed confirmed read spends grant',consumed(f)!==null);f.db.close();}
 f=fixture();await seed(f,'eventChanges');const good=(await download(f,'eventChanges')).data.history;await fixtureWrite(f,'UPDATE community_event_changes SET fields=? WHERE id=1002',JSON.stringify({id:B}));
 await expectRefusal('later malformed event field',f,{collection:'eventChanges',cursor:good.nextCursor},503);f.db.close();
 // A malformed legacy JSON file is modeled explicitly; production json_valid constraints stay in force otherwise.
 f=fixture();await seed(f,'eventChanges',1);f.db.exec('PRAGMA ignore_check_constraints=ON');await fixtureWrite(f,'UPDATE community_event_changes SET fields=?','not JSON '+B);f.db.exec('PRAGMA ignore_check_constraints=OFF');
 await expectRefusal('legacy unreadable JSON no payload',f,{collection:'eventChanges'},503);ok('legacy unreadable confirmed read grant consumed',consumed(f)!==null);f.db.close();
 f=fixture();await seed(f,'contributionDecisions',3);const decisionsPage=(await download(f,'contributionDecisions')).data.history;
 eq('counterpart decision identities omitted; own relationships retained',decisionsPage.entries.map(x=>x.relation),['actor','subject','subject']);f.db.close();
 // Actual identify-only OAuth download includes the same four exact actor-only legacy spellings.
 for(const spelling of ['raw','user','member','staff']){
  f=fixture();const actor=spelling==='raw'?A:spelling+':'+A,at=f.time()-123;
  const put=f.db.prepare('INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,?,?,?,?)');
  put.run('guild:legacy',B,123,'state_disputed',actor,9,'counterpart-private-nonce',at,f.time()+90000);
  put.run('foreign',B,124,'state_open','user:'+B,9,'foreign-nonce',at,f.time()+90000);
  put.run('expired',B,125,'state_open',actor,9,'expired-nonce',at,f.time());
  put.run('lookalike',B,126,'state_open','user:'+A+'0',9,'lookalike-nonce',at,f.time()+90000);
  const page=(await download(f,'contributionDecisions')).data.history;
  eq('legacy actor-only '+spelling+' counted exactly once',page.capture.count,1);
  eq('legacy actor-only '+spelling+' exact original date and minimal relationship',page.entries,[{action:'state_disputed',at:new Date(at*1000).toISOString(),guildScope:'guild:legacy',retainUntil:new Date((f.time()+90000)*1000).toISOString(),relation:'actor'}]);
  ok('legacy actor-only '+spelling+' counterpart/private details remain excluded',!JSON.stringify(page).includes(B)&&!JSON.stringify(page).includes('counterpart-private'));
  f.db.close();
 }
 // Remaining registered families are measured, not implicitly promoted to comprehensive continuation.
 f=fixture();f.db.exec('BEGIN');for(let i=0;i<1002;i++)await fixtureWrite(f,'INSERT INTO verification_requests(code,requester,created_at,expires_at,state) VALUES(?,?,?,?,?)','test-only-request-'+i,A,f.time()-i,f.time()+300,'pending');f.db.exec('COMMIT');
 const registry=load('community-context'),plan=registry.communityExportPlan(f.env,A),native=await f.env.DB.batch(plan.statements),shaped=plan.shape(native),qr=shaped.councillor_verification;
 eq('remaining QR requests expose concrete total1002',qr.requests.total,1002);eq('remaining QR request copy still bounded1000',qr.requests.rows.length,1000);eq('remaining QR requests do not claim completion',qr.requests.complete,false);eq('remaining QR has six limited families including B1 own metadata',Object.keys(qr).length,6);
 const inventory={registeredFamilies:Array.from(registry.communityDataNames()),communityStatementCount:plan.statements.length,
  queryCensus:load('privacy-write-admission').originalPrivacyAdmissionGroupProjection(f.env.DB,plan.statements).logical.map((s,i)=>({index:i,tables:Array.from(new Set(Array.from(s.sql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_]+)/gi),x=>x[1]))),limit:/\bLIMIT\s+(\d+)/i.exec(s.sql)?.[1]??null,returned:native[i].results.length})),
  qrLimitedFamilies:Object.fromEntries(Object.entries(qr).map(([name,v])=>[name,{total:v.total,returned:v.rows.length,complete:v.complete,limit:v.limit,continuation:false}])),
  limitation:'Three history continuations only. Registered unbounded projections retain their existing semantics and query size limits. Six bounded QR family copies still have no continuation; no all-store completeness claim.'};
 console.log('PRIVACY_HISTORY_REMAINING_INVENTORY '+JSON.stringify(inventory));f.db.close();

 // Existing collectors deliver original own metadata with no additional prepared SQL.
 // Child ownership is independent from profile/event survival; foreign sibling rows are excluded.
 {
  f=fixture();await subject(f);const at=f.time(),ref='r'.repeat(22),event='e'.repeat(22),orphan='o'.repeat(22);
  f.env.SITE_HOST='olympus.roachcouncil.com';f.env.SITE_GUILD_ID=f.env.GUILD_ID;
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,checked_at) VALUES(?,?,?,?)',A,at-1000,at-10,at);
  await fixtureWrite(f,'INSERT INTO members(discord_id,activity_at) VALUES(?,?)',A,at-77);
  await fixtureWrite(f,"INSERT INTO site_applications(discord_id,position,answers,status,reviewed_by,reviewed_at,created_at,updated_at) VALUES(?,'member','{}','approved',?,?,?,?)",A,STAFF,at-400,at-900,at-500);
  await fixtureWrite(f,'INSERT INTO community_refs(discord_id,ref,created_at) VALUES(?,?,?)',A,ref,at-800);
  await fixtureWrite(f,'INSERT INTO community_profiles(discord_id,ref,created_at,updated_at,departed_at) VALUES(?,?,?,?,?)',A,ref,at-700,at-300,at-250);
  await fixtureWrite(f,"INSERT INTO community_professions(discord_id,profession,skill,updated_at) VALUES(?,'alchemy',300,?)",A,at-600);
  await fixtureWrite(f,"INSERT INTO community_alt_claims(discord_id,name,name_key,status,proof,claimed_at,reviewed_by,reviewed_at,updated_at) VALUES(?,'Own Alt','own alt','officer_confirmed','self',?,?,?,?)",A,at-610,STAFF,at-410,at-310);
  await fixtureWrite(f,"INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,capacity,role_targets,created_by,created_at,updated_at,retain_until) VALUES(?,?,'Own event','PRIVATE_DETAILS',?,60,?,NULL,?, ?,?,?,?)",event,event,at+600,at+4200,'{"tank":1,"healer":2,"damage":3}',A,at-500,at-200,at+90000);
  const signup=f.db.prepare("INSERT INTO community_event_signups(event_id,discord_id,status,character_name,character_key,raid_role,rsvp_starts_at,updated_at) VALUES(?,?,'yes','Own Char','own char','healer',?,?)");signup.run(event,A,at+300,at-150);signup.run(orphan,A,at+350,at-140);signup.run(orphan,B,at+350,at-140);
  const attendance=f.db.prepare("INSERT INTO community_event_attendance(event_id,discord_id,state,source,recorded_by,recorded_at) VALUES(?,?,'present','officer',?,?)");attendance.run(event,A,STAFF,at-120);attendance.run(orphan,A,STAFF,at-110);attendance.run(orphan,B,STAFF,at-100);
  for(const [key,signer,requester,label]of [['own-key',B,A,'Own Char'],['foreign-key',A,B,'FOREIGN_CHARACTER']]){
   await fixtureWrite(f,'INSERT INTO councillor_keys(id,signer,signer_guid,public_key,subject_generation,roster_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',key,signer,'PRIVATE_GUID','test-key-'+key,G,1,at-60,at+600);
   await fixtureWrite(f,"INSERT INTO councillor_challenges(nonce,key_id,signer,session_version,session_expires,created_at,expires_at,mode,max_proofs) VALUES(?,?,?,1,?,?,?,'single',1)",'challenge-'+key,key,signer,at+600,at-60,at+600);
   await fixtureWrite(f,"INSERT INTO verification_requests(code,requester,subject_generation,created_at,expires_at,state) VALUES(?,?,?,?,?,'proved')",'code-'+key,requester,G,at-60,at+600);
   await fixtureWrite(f,'INSERT INTO verification_proofs(id,code,challenge,signer,key_id,requester,requester_guid,requester_name,native_rank,rank_name,native_profile,signer_guid,snapshot_id,subject_generation,digest,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','proof-'+key,'code-'+key,'challenge-'+key,signer,key,requester,'PRIVATE_REQUESTER_GUID',requester===A?'n'.repeat(60):label,2,requester===A?'Officer':'FOREIGN_RANK','PRIVATE_PROFILE','PRIVATE_GUID',1,G,'digest-'+key,at-60,at+600);
  }
  await fixtureWrite(f,"INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,native_rank,native_rank_name,created_at,expires_at) VALUES('outcome',?,'rank','PRIVATE_GUILD','PRIVATE_ROLE',1,'held','roster',2,'Officer',?,?)",A,at-55,at+600);
  const cookie=await issueFixtureCookie(f);
  const frm=await prepared(f);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
  const aggregate=await (await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env)).json();f.hooks.statement=null;f.hooks.beforeBatch=null;
  eq('metadata aggregate is original97 plus1 packed metadata Native read',attempts,98);ok('metadata aggregate physical attempts remain below100',attempts<100);eq('metadata original payload plus1 packed read',batches,[2,96]);
  provider=null;
  const ordinaryResponse=await load('site').handleSite(new Request(BASE+'/api/me/export',{headers:{Cookie:cookie}}),f.env,'/api/me/export',true,'test',()=>{});
  eq('metadata ordinary actual signed session route admitted',ordinaryResponse.status,200);const ordinary=await ordinaryResponse.json();
  const isoAt=n=>new Date(n*1000).toISOString();
  for(const [name,data]of [['ordinary',ordinary],['identify',aggregate]]){
   eq(name+' application review date original native seconds, no reviewer',data.site.application.reviewedAt,at-400);ok(name+' reviewer and notes withheld',[STAFF,'PRIVATE_REQUESTER_GUID','PRIVATE_PROFILE','PRIVATE_GUILD','PRIVATE_ROLE','PRIVATE_DETAILS'].every(value=>!JSON.stringify(data).includes(value)));
   eq(name+' genuine activity date preserved',data.verification.lastActivityAt,isoAt(at-77));eq(name+' ref original creation date',data.community.refs.createdAt,isoAt(at-800));
   eq(name+' profile original three dates',[data.community.directory.createdAt,data.community.directory.updatedAt,data.community.directory.departedAt],[isoAt(at-700),isoAt(at-300),isoAt(at-250)]);
   eq(name+' alt original claim/review dates',[data.community.directory.alts[0].claimedAt,data.community.directory.alts[0].reviewedAt],[isoAt(at-610),isoAt(at-410)]);
   const s=data.community.events.signups;eq(name+' direct own signups count including orphan',s.length,2);eq(name+' original RSVP start does not follow rescheduling',s.find(x=>x.eventId===event).rsvpStartsAt,isoAt(at+300));eq(name+' orphan signup parent context explicit null',[s.find(x=>x.eventId===orphan).title,s.find(x=>x.eventId===orphan).startsAt],[null,null]);
   const a=data.community.events.attendance;eq(name+' direct own attendance count including orphan',a.length,2);eq(name+' own attendance source and original time',[a.find(x=>x.eventId===orphan).source,a.find(x=>x.eventId===orphan).recordedAt],['officer',isoAt(at-110)]);eq(name+' orphan attendance parent context null',[a.find(x=>x.eventId===orphan).title,a.find(x=>x.eventId===orphan).startsAt],[null,null]);
   eq(name+' created event metadata closed',[data.community.events.created[0].createdAt,data.community.events.created[0].updatedAt,data.community.events.created[0].endsAt,data.community.events.created[0].durationMin,data.community.events.created[0].capacity,data.community.events.created[0].roleTargets,data.community.events.created[0].retainUntil],[isoAt(at-500),isoAt(at-200),isoAt(at+4200),60,null,{tank:1,healer:2,damage:3},isoAt(at+90000)]);
   const qr=data.community.councillor_verification,proofs=qr.attestations.rows;eq(name+' own requester native facts',proofs.find(x=>x.own_part==='requester').requester_name,'n'.repeat(60));eq(name+' signer has explicit null foreign native facts',[proofs.find(x=>x.own_part==='signer').requester_name,proofs.find(x=>x.own_part==='signer').native_rank,proofs.find(x=>x.own_part==='signer').rank_name],[null,null,null]);ok(name+' no foreign character/rank leak',!JSON.stringify(data).includes('FOREIGN_CHARACTER')&&!JSON.stringify(data).includes('FOREIGN_RANK'));
   eq(name+' own role outcome rank',[qr.roleOutcomes.rows[0].native_rank,qr.roleOutcomes.rows[0].native_rank_name],[2,'Officer']);
  }
  eq('same signup projection across both real admissions',ordinary.community.events.signups.slice().sort((a,b)=>a.eventId.localeCompare(b.eventId)),aggregate.community.events.signups.slice().sort((a,b)=>a.eventId.localeCompare(b.eventId)));
  eq('same own alt projection across both real admissions',ordinary.community.directory.alts,aggregate.community.directory.alts);
  // The profile disappears without deleting the independently owned child rows.
  await fixtureWrite(f,'DELETE FROM community_profiles WHERE discord_id=?',A);
  const orphanForm=await prepared(f),orphans=await (await copy.exportPrivacyAccess(orphanForm.request({collection:'copy'}),f.env)).json();
  eq('identify aggregate retains own orphan professions/alts',[orphans.community.directory.professions.length,orphans.community.directory.alts.length],[1,1]);eq('absent profile dates are null',[orphans.community.directory.createdAt,orphans.community.directory.updatedAt,orphans.community.directory.departedAt],[null,null,null]);
  const ordinaryOrphan=await (await load('site').handleSite(new Request(BASE+'/api/me/export',{headers:{Cookie:cookie}}),f.env,'/api/me/export',true,'test',()=>{})).json();eq('ordinary aggregate retains own orphan professions/alts',[ordinaryOrphan.community.directory.professions.length,ordinaryOrphan.community.directory.alts.length],[1,1]);
  const ownMetadataPage=async collection=>{const pageForm=await prepared(f);return (await (await copy.exportPrivacyAccess(pageForm.request({collection}),f.env)).json()).history;};
  const professionPage=await ownMetadataPage('community.directory.professions');eq('direct own orphan profession is counted and deliverable',professionPage.capture.count,1);eq('orphan profession original update date',professionPage.entries[0].updatedAt,isoAt(at-600));
  const signupPage=await ownMetadataPage('community.events.signups');eq('orphan signup continuation includes direct ownership',signupPage.capture.count,2);eq('orphan continuation nullable parent',[signupPage.entries.find(x=>x.eventId===orphan).title,signupPage.entries.find(x=>x.eventId===orphan).startsAt],[null,null]);
  // No generation/clock/standing is renewed by either copy. Downloads add only existing audit/grant receipts.
  eq('metadata original generation and profile date not fabricated',f.db.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?').get(A).generation,G);eq('metadata original activity remains exact',f.db.prepare('SELECT activity_at FROM members WHERE discord_id=?').get(A).activity_at,at-77);
  // Strict copy validation runs before the older member-facing description with a present profile.
  await fixtureWrite(f,'INSERT INTO community_profiles(discord_id,ref,created_at,updated_at) VALUES(?,?,?,?)',A,ref,at-700,at-300);
  await fixtureWrite(f,'UPDATE community_professions SET updated_at=0.5 WHERE discord_id=?',A);
  const invalidOrdinary=await load('site').handleSite(new Request(BASE+'/api/me/export',{headers:{Cookie:cookie}}),f.env,'/api/me/export',true,'test',()=>{});
  eq('ordinary malformed child has bounded503 instead of legacy RangeError',invalidOrdinary.status,503);eq('ordinary malformed child has no attachment',invalidOrdinary.headers.get('Content-Disposition'),null);eq('ordinary malformed child no partial payload',await invalidOrdinary.json(),{error:'privacy_copy_unconfirmed'});
  const invalidIdentify=await prepared(f);let invalidError;try{await copy.exportPrivacyAccess(invalidIdentify.request({collection:'copy'}),f.env);}catch(e){invalidError=e;}eq('identify same malformed original child date has bounded503',invalidError.status,503);
  f.db.close();
 }
 // Added raw byte descriptors must reject malformed, oversized or misplaced facts rather than leak or drop them.
 {
  const projector=load('privacy-account-coverage'),family=load('privacy-access-family-history');
  for(const value of [undefined,-1,0.5,Infinity,1000000000000,'123'])await refused('metadata invalid original date '+String(value),()=>projector.ownCopyDate(value));
  for(const size of [41,60])eq('supported game name '+size+' preserved',projector.ownCopyProofFacts({own_part:'requester',requester_name:'n'.repeat(size),native_rank:2,rank_name:'Officer'}).requester_name,'n'.repeat(size));
  await refused('unsupported game name61 refuses',()=>projector.ownCopyProofFacts({own_part:'requester',requester_name:'n'.repeat(61),native_rank:2,rank_name:'Officer'}));
  eq('metadata nullable date is explicit null',projector.ownCopyDate(null,true),null);eq('metadata epoch zero is preserved',projector.ownCopyDate(0),'1970-01-01T00:00:00.000Z');
  for(const r of [{native_rank:10,native_rank_name:'rank'},{native_rank:2,native_rank_name:'r'.repeat(65)},{native_rank:null,native_rank_name:'rank'},{native_rank:2,native_rank_name:null}])await refused('metadata malformed bounded rank pair',()=>projector.ownCopyRankFacts(r));
  eq('metadata absent outcome native facts stay null',JSON.parse(JSON.stringify(projector.ownCopyRankFacts({native_rank:null,native_rank_name:null}))),{native_rank:null,native_rank_name:null});
  for(const size of [65,11000]){
   f=fixture();await fixtureWrite(f,"INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,native_rank,native_rank_name,created_at,expires_at) VALUES('bad-own-rank',?,'rank','private-guild','private-role',1,'held','roster',2,?,?,?)",A,'r'.repeat(size),f.time()-100,f.time()+600);
   const badForm=await prepared(f);await refused('native bounded rank '+size+' cannot produce history attachment',()=>copy.exportPrivacyAccess(badForm.request({collection:'community.councillor_verification.roleOutcomes'}),f.env));
   if(size===11000)eq('native added rank raw byte overflow rolls back grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export' ORDER BY rowid DESC LIMIT 1").get().consumed_at,null);f.db.close();
  }
  f=fixture();await fixtureWrite(f,"INSERT INTO community_alt_claims(discord_id,name,name_key,claimed_at,updated_at) VALUES(?,'Own Alt','own alt',-1,?)",A,f.time()-100);
  const dateForm=await prepared(f);await refused('native negative original claim date never fabricated or returned',()=>copy.exportPrivacyAccess(dateForm.request({collection:'community.directory.alts'}),f.env));f.db.close();
  await refused('metadata signer projection refuses accidental foreign tuple',()=>projector.ownCopyProofFacts({own_part:'signer',requester_name:'FOREIGN_CHARACTER',native_rank:2,rank_name:'FOREIGN_RANK'}));
  for(const c of ['community.directory.alts','community.events.signups','community.events.created','community.events.attendance','community.councillor_verification.attestations','community.councillor_verification.roleOutcomes']){
   f=fixture();const d=family.privacyFamilyHistoryDefinition(c),plan=d.statements(f.env,A,null,25);eq(c+' keeps exactly count/list pair',plan.length,2);ok(c+' projected metadata byte bound in both native statements',load('privacy-write-admission').originalPrivacyAdmissionGroupProjection(f.env.DB,plan).logical.every(s=>s.sql.includes('16384')));f.db.close();
  }
 }

 await rosterHistoryMessageCases();
 await extraCollectionHistoryCases();
 // Root-authorized finite nine-store batch: actual SQLite collectors and genuine admissions.
 // Fresh source module instances model worker-isolate rate-limit state; no authority/exporter is stubbed.
 const nmSeed=async f=>{
  await subject(f);const at=f.time();f.env.SITE_GUILD_ID=f.env.GUILD_ID;
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,checked_at) VALUES(?,?,?,?)',A,at-1000,at-10,at);
  await fixtureWrite(f,"INSERT INTO community_contribution_policies(version,amount_copper,anchor_weekday,anchor_hour_utc,grace_hours,final_notice_days,review_days,new_member_exempt_days,created_at) VALUES('P',100,0,0,0,1,1,0,?)",at-900);
  const week=f.db.prepare('INSERT INTO community_contribution_obligations(guild_scope,discord_id,period_start,due_at,policy_version,amount_copper,eligible,state,acknowledged_at,officer_contact_at,final_notice_at,final_acknowledged_at,final_officer_contact_at,retain_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  week.run('guild:own',A,at-700,at+500,'P',100,1,'open',at-60,at-50,null,null,null,at+90000,at-650,at-45);
  const oid=f.db.prepare('SELECT id FROM community_contribution_obligations WHERE discord_id=?').get(A).id;
  week.run('foreign',B,at-700,at+500,'P',100,1,'open',null,null,null,null,null,at+90000,0.5,at-1);
  week.run('expired',A,at-900,at-100,'P',100,1,'open',null,null,null,null,null,at,0.5,at-1);
  const receipt=f.db.prepare('INSERT INTO community_contribution_receipts(id,guild_scope,source,source_id,payload_hash,payer_name,amount_copper,retired_copper,observed_at,observer_discord_id,matched_discord_id,status,retain_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  receipt.run('l'.repeat(22),'guild:own','mail','NM_PRIVATE_SOURCE','NM_PRIVATE_HASH','NM_PRIVATE_PAYER',10000,5,at-500,STAFF,A,'matched',at+90000,at-480);
  receipt.run('x'.repeat(22),'guild:own','bank_log','NM_PRIVATE_EXPIRED_SOURCE','NM_PRIVATE_HASH','NM_PRIVATE_PAYER',10000,5,at-550,STAFF,A,'matched',at-1,at-530);
  receipt.run('z'.repeat(22),'guild:own','mail','NM_PRIVATE_UNALLOCATED','NM_PRIVATE_HASH','NM_PRIVATE_PAYER',10000,0,at-600,STAFF,A,'matched',at,0.5);
  receipt.run('f'.repeat(22),'foreign','mail','NM_PRIVATE_FOREIGN','NM_PRIVATE_HASH','NM_PRIVATE_PAYER',10000,0,at-600,STAFF,B,'matched',at+90000,0.5);
  const alloc=f.db.prepare('INSERT INTO community_contribution_allocation_events(receipt_id,obligation_id,amount_copper,member_revision,nonce,actor,created_at) VALUES(?,?,?,1,?,?,?)');
  alloc.run('l'.repeat(22),oid,40,'NM_PRIVATE_NONCE',STAFF,at-400);alloc.run('x'.repeat(22),oid,30,'NM_PRIVATE_NONCE2',STAFF,at-400);
  const decision=f.db.prepare('INSERT INTO community_contribution_decisions(guild_scope,discord_id,obligation_id,action,actor,member_revision,nonce,at,retain_until) VALUES(?,?,?,?,?,1,?,?,?)');
  decision.run('guild:own',A,oid,'state_open','staff:'+STAFF,'NM_PRIVATE_NONCE',at-40,at+90000);
  decision.run('guild:actor',B,999,'state_disputed','user:'+A,'NM_PRIVATE_COUNTERPART',at-39,at+90000);
  decision.run('foreign\u0000bad',B,998,'state_open','user:'+B,'NM_PRIVATE_FOREIGN',at-38,at+90000);
  decision.run('expired\u0000bad',A,997,'state_open','user:'+A,'NM_PRIVATE_EXPIRED',at-37,at);
  await fixtureWrite(f,"INSERT INTO community_trials(id,op_id,discord_id,sponsor_discord_id,started_at,review_due_at,status,created_by,updated_by,created_at,updated_at,incarnation,retain_until) VALUES(?,?,?,?,?,?,'active',?,?,?,?,?,?)",'t'.repeat(22),'q'.repeat(22),A,B,at-350,at+600,STAFF,STAFF,at-340,at-30,'i'.repeat(22),at+90000);
  await fixtureWrite(f,"INSERT INTO community_trials(id,op_id,discord_id,started_at,review_due_at,created_at,updated_at,incarnation,retain_until) VALUES(?,?,?,?,?,?,?,?,?)",'u'.repeat(22),'v'.repeat(22),B,at-350,at+600,0.5,at-30,'j'.repeat(22),at+90000);
  const restriction=f.db.prepare("INSERT INTO community_restriction_cases(id,discord_id,category,set_by,set_at,review_at,updated_at,updated_by,retain_until,incarnation) VALUES(?,?,'ban',?,?,?,?,?,NULL,?)");
  restriction.run('b'.repeat(22),A,STAFF,at-300,at+600,at-20,STAFF,'k'.repeat(22));restriction.run('c'.repeat(22),B,STAFF,at-300,at+600,0.5,STAFF,'m'.repeat(22));
  const departure=f.db.prepare("INSERT INTO community_departure_reviews(id,discord_id,character_key,character_name,proof_key,kind,observed_at,created_at,retain_until) VALUES(?,?,?,?,?,'left',?,?,?)");
  departure.run('d'.repeat(22),A,'NM_PRIVATE_CHARACTER_KEY','Own Char','NM_PRIVATE_PROOF',at-250,at-200,at+90000);departure.run('n'.repeat(22),B,'NM_PRIVATE_FOREIGN_KEY','Other Char','NM_PRIVATE_FOREIGN_PROOF',at-250,0.5,at+90000);
  const queue=f.db.prepare("INSERT INTO invite_queue(name_key,name,discord_id,note,status,created_at,approved_by,claimed_by,claimed_at) VALUES(?,?,?,?,'queued',?,?,?,?)");
  queue.run('own','Own Char',A,'NM_PRIVATE_NOTE',at-150,STAFF,'NM_PRIVATE_WATCHER',at-15);queue.run('foreign','Other Char',B,'NM_PRIVATE_NOTE',at-150,STAFF,'NM_PRIVATE_WATCHER',0.5);
  const event=f.db.prepare("INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until) VALUES(?,?,'Event','NM_PRIVATE_DETAILS',?,60,?,?,?,?,?)");
  for(const id of ['p'.repeat(22),'r'.repeat(22),'s'.repeat(22)])event.run(id,id,at+600,at+4200,B,at-100,at-10,at+90000);
  const pub=f.db.prepare("INSERT INTO community_event_deliveries(event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,frozen_content,payload_hash,op_id,claim_nonce,state,cleanup_requested,actor,session_version,session_expires,created_at,updated_at,retain_until,result_code) VALUES(?,'publication',1,?,?,?,?,?,?,?,?,'unknown',1,?,1,?,?,?,?,?)");
  pub.run('p'.repeat(22),at+600,'NM_PRIVATE_GUILD','NM_PRIVATE_CHANNEL','NM_PRIVATE_MESSAGE','NM_PRIVATE_CONTENT','NM_PRIVATE_HASH','o'.repeat(22),'w'.repeat(22),A,at+600,at-95,at-12,at+90000,'outcome_unknown');
  pub.run('s'.repeat(22),0.5,'NM_PRIVATE_GUILD','NM_PRIVATE_CHANNEL','NM_PRIVATE_MESSAGE','NM_PRIVATE_CONTENT','NM_PRIVATE_HASH','h'.repeat(22),'a'.repeat(22),B,at+600,at-95,at-12,at+90000,'outcome_unknown');
  const reminder=f.db.prepare("INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,guild_id,channel_id,host,op_id,claim_nonce,state,message_id,frozen_content,cleanup_requested,created_at,updated_at,last_attempt_at,retain_until) VALUES(?,1,?,?,1,?,?,?,?,?,'armed',?,?,1,?,?,0,?)");
  reminder.run('r'.repeat(22),at+600,A,'NM_PRIVATE_GUILD','NM_PRIVATE_CHANNEL','NM_PRIVATE_HOST','g'.repeat(22),'h'.repeat(22),'NM_PRIVATE_MESSAGE','NM_PRIVATE_CONTENT',at-90,at-11,at+90000);
  reminder.run('s'.repeat(22),at+600,B,'NM_PRIVATE_GUILD','NM_PRIVATE_CHANNEL','NM_PRIVATE_HOST','g'.repeat(22),'h'.repeat(22),'NM_PRIVATE_MESSAGE','NM_PRIVATE_CONTENT',at-90,0.5,at+90000);
  f.ordinaryCookie=await issueFixtureCookie(f);return at;
 };
 const nmOrdinary=async f=>{const cookie=f.ordinaryCookie;assert.ok(cookie,'explicit original setup cookie');provider=null;const retained=new Map(cache);cache.clear();try{const source=load('site'),admission=load('privacy-write-admission'),env={...f.env,DB:admission.createPrivacyWriteAdmissionDatabase(f.native,'writer','canonical',entry.ENTRY_EPOCH)};return await source.handleSite(new Request(BASE+'/api/me/export',{headers:{Cookie:cookie}}),env,'/api/me/export',true,'test',()=>{});}finally{cache.clear();for(const[name,module]of retained)cache.set(name,module);}};
 const nmIdentify=async(f,collection='copy')=>{const frm=await prepared(f);return copy.exportPrivacyAccess(frm.request({collection}),f.env);};
 const nmCollections=['community.contributions.obligations','community.contributions.receipts','contributionDecisions','community.trials.trials','community.restrictions.cases','community.departures.departures','verification.inviteQueue','community.event_delivery.publications','community.event_reminders.reminders'];
 const nmQueue=data=>Array.isArray(data.verification.inviteQueue)?data.verification.inviteQueue:data.verification.inviteQueue.rows;
 const nmDecisions=data=>data.contributionDecisions.entries??data.contributionDecisions.rows;
 const nmLedger=data=>({...data,receipts:data.receipts.slice().sort((a,b)=>a.source.localeCompare(b.source))});
 const nmDate=n=>new Date(n*1000).toISOString();
 {
  f=fixture();const at=await nmSeed(f),frm=await prepared(f);let attempts=0,batches=[];f.hooks.statement=()=>attempts++;f.hooks.beforeBatch=s=>batches.push(s.length);
  const response=await copy.exportPrivacyAccess(frm.request({collection:'copy'}),f.env),identify=await response.json();f.hooks.statement=null;f.hooks.beforeBatch=null;
  eq('next metadata original identify admitted',response.status,200);eq('next metadata original97 plus1 packed Native read',attempts,98);ok('next metadata physical aggregate stays below100',attempts<100);eq('next metadata original body plus1 packed read',batches,[2,96]);
  const ordinaryResponse=await nmOrdinary(f);eq('next metadata original ordinary signed-session admitted',ordinaryResponse.status,200);const ordinary=await ordinaryResponse.json();
  for(const [lane,data] of [['ordinary',ordinary],['identify',identify]]){
   const c=data.community,o=c.contributions.obligations,r=c.contributions.receipts;
   eq(lane+' original own obligation dates and exact live filter',o.map(x=>[x.guildScope,x.createdAt,x.updatedAt,x.retainUntil]),[['guild:own',nmDate(at-650),nmDate(at-45),nmDate(at+90000)]]);
   eq(lane+' live original matched receipt dates',r.find(x=>x.source==='mail').createdAt,nmDate(at-480));eq(lane+' exact matched emitted receipt count',r.length,2);
   const expired=r.find(x=>x.source==='bank_log');eq(lane+' expired allocated minimized amount relationship',[expired.amountCopper,expired.allocatedCopper,expired.retiredCopper,expired.unallocatedCopper],[35,30,5,0]);eq(lane+' expired receipt original dates preserved',[expired.createdAt,expired.retainUntil],[nmDate(at-530),nmDate(at-1)]);
   eq(lane+' original trial creation distinct from start',c.trials.trials[0].createdAt,nmDate(at-340));eq(lane+' own live trial foreign malformed excluded',c.trials.trials.length,1);
   eq(lane+' restriction original update and honest indefinite null',[c.restrictions.cases[0].updatedAt,c.restrictions.cases[0].retainUntil,c.restrictions.cases[0].expiresAt],[nmDate(at-20),null,null]);
   eq(lane+' departure original creation distinct from observation',[c.departures.departures[0].createdAt,c.departures.departures[0].observedAt],[nmDate(at-200),nmDate(at-250)]);
   eq(lane+' last watcher hold original nullable date',nmQueue(data)[0].lastWatcherHoldAt,nmDate(at-15));
   eq(lane+' publication stored start and cleanup',[c.event_delivery.publications[0].startsAt,c.event_delivery.publications[0].removalPending],[nmDate(at+600),true]);
   eq(lane+' reminder original update, no scheduler consideration and cleanup',[c.event_reminders.reminders[0].updatedAt,c.event_reminders.reminders[0].lastSchedulerConsideredAt,c.event_reminders.reminders[0].removalPending],[nmDate(at-11),null,true]);
   ok(lane+' no credentials/free text/pointers/staff/counterpart identity',!JSON.stringify(data).includes('NM_PRIVATE_')&&!JSON.stringify(data).includes(B)&&!JSON.stringify(data).includes(STAFF));
   const decisions=nmDecisions(data);eq(lane+' own subject and exact actor-only decisions count',decisions.length,2);eq(lane+' closed own decision context/date',decisions.map(x=>[x.guildScope,x.retainUntil]),[['guild:own',nmDate(at+90000)],['guild:actor',nmDate(at+90000)]]);
  }
  for(const key of ['contributions','trials','restrictions','departures','event_delivery','event_reminders'])eq('next metadata both aggregate DTOs agree '+key,key==='contributions'?nmLedger(ordinary.community[key]):ordinary.community[key],key==='contributions'?nmLedger(identify.community[key]):identify.community[key]);
  for(const collection of nmCollections){const pageResponse=await nmIdentify(f,collection),payload=await pageResponse.json(),page=payload.history;eq(collection+' individual actual identify admitted',pageResponse.status,200);ok(collection+' closes capture exactly',page.capture.complete&&page.capture.count===page.entries.length);ok(collection+' actual individual response includes closed truthful metadata scope',typeof payload.coverage.metadataScope==='string'&&payload.coverage.metadataScope.length>20);if(collection==='contributionDecisions')ok('individual decision states separate own weeks and omitted join',payload.coverage.metadataScope.includes('Own weeks are selected separately')&&payload.coverage.metadataScope.includes('no week join'));if(collection==='community.event_reminders.reminders')ok('individual scheduler consideration is not a provider attempt or actor-history verdict',payload.coverage.metadataScope.includes('may precede eligibility checks')&&payload.coverage.metadataScope.includes('Actor can change'));if(collection==='community.event_delivery.publications')ok('individual publication dates have current actor provenance',payload.coverage.metadataScope.includes('Current stored actor-associated')&&payload.coverage.metadataScope.includes('no immutable original actor'));ok(collection+' closed fields exclude native private metadata',!JSON.stringify(page).includes('NM_PRIVATE_'));}
  await fixtureWrite(f,'UPDATE invite_queue SET claimed_at=NULL WHERE discord_id=?',A);
  await fixtureWrite(f,'UPDATE community_event_reminders SET last_attempt_at=?,updated_at=?,cleanup_requested=0 WHERE actor=?',at-5,at-4,A);
  const nextIdentify=await (await nmIdentify(f)).json(),nextOrdinary=await (await nmOrdinary(f)).json();
  for(const [lane,data] of [['ordinary',nextOrdinary],['identify',nextIdentify]]){eq(lane+' absent watcher hold explicit null',nmQueue(data)[0].lastWatcherHoldAt,null);eq(lane+' consideration is scheduler time not provider success',[data.community.event_reminders.reminders[0].lastSchedulerConsideredAt,data.community.event_reminders.reminders[0].updatedAt,data.community.event_reminders.reminders[0].removalPending],[nmDate(at-5),nmDate(at-4),false]);}
  await fixtureWrite(f,'UPDATE community_event_deliveries SET actor=?,updated_at=? WHERE event_id=?',B,at-3,'p'.repeat(22));await fixtureWrite(f,'UPDATE community_event_reminders SET actor=?,updated_at=? WHERE event_id=?',B,at-3,'r'.repeat(22));
  const changedIdentify=await (await nmIdentify(f)).json(),changedOrdinary=await (await nmOrdinary(f)).json();
  for(const [lane,data] of [['ordinary',changedOrdinary],['identify',changedIdentify]])eq(lane+' actor replacement excludes former association without invented original actor',[data.community.event_delivery.publications.length,data.community.event_reminders.reminders.length],[0,0]);
  await fixtureWrite(f,'UPDATE community_event_deliveries SET actor=?,updated_at=? WHERE event_id=?',A,at-2,'p'.repeat(22));await fixtureWrite(f,'UPDATE community_event_reminders SET actor=?,updated_at=? WHERE event_id=?',A,at-2,'r'.repeat(22));
  const restored=await (await nmIdentify(f)).json();eq('current reassociation preserves original publication/reminder creation dates',[restored.community.event_delivery.publications[0].createdAt,restored.community.event_reminders.reminders[0].createdAt],[nmDate(at-95),nmDate(at-90)]);
  eq('metadata copy never renews original contribution retention',f.db.prepare('SELECT retain_until FROM community_contribution_receipts WHERE id=?').get('x'.repeat(22)).retain_until,at-1);f.db.close();
 }
 // A selected malformed native scalar refuses the actual whole attachment on both admissions.
 for(const [collection,sql,value]of [
  ['community.contributions.obligations','UPDATE community_contribution_obligations SET created_at=? WHERE discord_id=?',-1],
  ['community.contributions.receipts','UPDATE community_contribution_receipts SET created_at=? WHERE matched_discord_id=? AND source=\'mail\' AND retain_until>0',0.5],
  ['contributionDecisions',"UPDATE community_contribution_decisions SET retain_until=? WHERE discord_id=? AND guild_scope='guild:own'",1000000000000],
  ['community.trials.trials','UPDATE community_trials SET created_at=? WHERE discord_id=?',0.5],
  ['community.restrictions.cases','UPDATE community_restriction_cases SET updated_at=? WHERE discord_id=?',-1],
  ['community.departures.departures','UPDATE community_departure_reviews SET created_at=? WHERE discord_id=?',1000000000000],
  ['verification.inviteQueue','UPDATE invite_queue SET claimed_at=? WHERE discord_id=?',0.5],
  ['community.event_delivery.publications','UPDATE community_event_deliveries SET starts_at=? WHERE actor=?',-1],
  ['community.event_reminders.reminders','UPDATE community_event_reminders SET last_attempt_at=? WHERE actor=?',0.5]
 ]){
  f=fixture();await nmSeed(f);await fixtureWrite(f,sql,value,A);const ordinary=await nmOrdinary(f);eq(collection+' native malformed ordinary bounded refusal',ordinary.status,collection==='contributionDecisions'?409:503);eq(collection+' no ordinary partial attachment',ordinary.headers.get('Content-Disposition'),null);
  let error;try{await nmIdentify(f,collection);}catch(e){error=e;}eq(collection+' native malformed identify bounded503',error?.status,503);f.db.close();
 }
 // Every newly selected byte field participates in both count and preview; no extra prepared statements.
 for(const collection of nmCollections){f=fixture();const definition=collection==='contributionDecisions'?null:load('privacy-access-family-history').privacyFamilyHistoryDefinition(collection);if(definition){const statements=definition.statements(f.env,A,null,25);eq(collection+' native count/preview pair unchanged',statements.length,2);ok(collection+' paired projected byte bound remains present',load('privacy-write-admission').originalPrivacyAdmissionGroupProjection(f.env.DB,statements).logical.every(s=>s.sql.includes('16384')));}f.db.close();}
 for(const scope of ['s'.repeat(64),'s'.repeat(65),'s'.repeat(20000),'guild\u0000suffix']){
  f=fixture();await nmSeed(f);await fixtureWrite(f,'UPDATE community_contribution_decisions SET guild_scope=? WHERE discord_id=?',scope,A);
  if(scope.length===64){const data=await (await nmIdentify(f,'contributionDecisions')).json();eq('producer64 scope boundary is admitted exactly',data.history.entries.find(x=>x.relation==='subject').guildScope,scope);const ordinary=await nmOrdinary(f);eq('ordinary producer64 scope boundary admitted',ordinary.status,200);}
  else{const form=await prepared(f);await refused('native invalid bounded scope '+scope.length+' identify refuses',()=>copy.exportPrivacyAccess(form.request({collection:'contributionDecisions'}),f.env));if(scope.length===20000||scope.includes('\u0000'))eq('native scope byte/NUL refusal atomically rolls grant back',consumed(f),null);let ordinary;try{ordinary=await nmOrdinary(f);}catch(e){ordinary=e;}ok('native invalid bounded scope '+scope.length+' ordinary has no successful payload',ordinary.status!==200);}
  f.db.close();
 }

 // Same-SELECT text refusal precedes the native SQLite/Node string boundary for new strict projectors.
 // Closed enum CHECKs normally refuse these strings; explicit legacy CHECK bypass is confined to this fixture.
 for(const [collection,table,column,prefix,constrained,owner]of [
  ['community.trials.trials','community_trials','status','active',true,'discord_id'],
  ['community.trials.trials','community_trials','outcome_reason','review_passed',true,'discord_id'],
  ['community.restrictions.cases','community_restriction_cases','category','ban',true,'discord_id'],
  ['community.restrictions.cases','community_restriction_cases','appeal_status','none',true,'discord_id'],
  ['community.restrictions.cases','community_restriction_cases','review_outcome','continued',true,'discord_id'],
  ['community.departures.departures','community_departure_reviews','character_name','Own Char',false,'discord_id'],
  ['community.departures.departures','community_departure_reviews','kind','left',true,'discord_id'],
  ['community.departures.departures','community_departure_reviews','status','open',true,'discord_id'],
  ['community.event_delivery.publications','community_event_deliveries','event_id','p'.repeat(22),false,'actor'],
  ['community.event_delivery.publications','community_event_deliveries','purpose','publication',true,'actor'],
  ['community.event_delivery.publications','community_event_deliveries','state','unknown',true,'actor'],
  ['community.event_delivery.publications','community_event_deliveries','result_code','outcome_unknown',false,'actor'],
  ['community.event_reminders.reminders','community_event_reminders','event_id','r'.repeat(22),false,'actor'],
  ['community.event_reminders.reminders','community_event_reminders','state','armed',true,'actor']
 ]){
  f=fixture();const at=await nmSeed(f),bad=prefix+'\u0000bad',label=table+'.'+column;
  if(column==='outcome_reason')await fixtureWrite(f,"UPDATE community_trials SET status='passed',concluded_at=?,outcome_reason='review_passed' WHERE discord_id=?",at-1,A);
  if(column==='event_id'){
   // Native SQLite length() permits the prefix-length22 parent; FK integrity stays enabled and satisfied.
   await fixtureWrite(f,'INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until) SELECT ?,?,title,details,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until FROM community_events WHERE id=?',bad,'native-nul-parent-'+table,prefix);
   eq(label+' native length bound cannot exclude embedded NUL',f.db.prepare('SELECT length(id) AS n,instr(id,char(0)) AS nul FROM community_events WHERE id=?').get(bad).n,22);
   eq(label+' parent NUL is actually stored before bridge',f.db.prepare('SELECT instr(id,char(0)) AS nul FROM community_events WHERE id=?').get(bad).nul,23);
  }
  const update=()=>fixtureWrite(f,'UPDATE '+table+' SET '+column+'=? WHERE '+owner+'=?',bad,A);let constraintError;
  try{await update();}catch(e){constraintError=e;}
  eq(label+' actual native CHECK constraint proof',!!constraintError,constrained);
  if(constrained){ok(label+' constraint is CHECK rather than an unrelated failure',constraintError.message.includes('CHECK constraint failed'));f.db.exec('PRAGMA ignore_check_constraints=ON');await update();f.db.exec('PRAGMA ignore_check_constraints=OFF');}
  ok(label+' raw native field has NUL',f.db.prepare('SELECT instr('+column+',char(0)) AS n FROM '+table+' WHERE '+owner+'=?').get(A).n>0);
  let ordinaryResponse,ordinaryError;try{ordinaryResponse=await nmOrdinary(f);}catch(e){ordinaryError=e;}
  eq(label+' ordinary native source read refuses through existing admission wrapper',ordinaryError?.message,'privacy_site_request_held');eq(label+' no ordinary partial response',ordinaryResponse,undefined);
  const individual=await prepared(f);await refused(label+' individual native history cannot attach truncated value',()=>copy.exportPrivacyAccess(individual.request({collection}),f.env));eq(label+' individual native refusal atomically rolls grant back',consumed(f),null);
  const aggregate=await prepared(f);await refused(label+' aggregate native identify cannot attach truncated value',()=>copy.exportPrivacyAccess(aggregate.request({collection:'copy'}),f.env));eq(label+' aggregate native refusal atomically rolls grant back',consumed(f),null);
  f.db.close();
 }
 // A foreign/omitted malformed field does not broaden the selected account's refusal set.
 for(const [collection,table,column,prefix,owner]of [
  ['community.trials.trials','community_trials','status','active','discord_id'],
  ['community.restrictions.cases','community_restriction_cases','appeal_status','none','discord_id'],
  ['community.departures.departures','community_departure_reviews','character_name','Other Char','discord_id'],
  ['community.event_delivery.publications','community_event_deliveries','result_code','outcome_unknown','actor'],
  ['community.event_reminders.reminders','community_event_reminders','state','armed','actor']
 ]){
  f=fixture();await nmSeed(f);f.db.exec('PRAGMA ignore_check_constraints=ON');await fixtureWrite(f,'UPDATE '+table+' SET '+column+'=? WHERE '+owner+'=?',prefix+'\u0000bad',B);f.db.exec('PRAGMA ignore_check_constraints=OFF');
  eq(table+' foreign NUL remains excluded from genuine ordinary source admission',(await nmOrdinary(f)).status,200);
  eq(table+' foreign NUL remains excluded from genuine identify aggregate admission',(await nmIdentify(f)).status,200);
  eq(table+' foreign NUL remains excluded from genuine individual history admission',(await nmIdentify(f,collection)).status,200);f.db.close();
 }

 provider=null;console.log('privacy_access_history_test: '+checks+' checks PASS');
}
mainHistory().catch(e=>{console.error('FAIL privacy_access_history_test',e);process.exitCode=1;});
`;
const moduleUnderTest=new Module(__filename,module);moduleUnderTest.filename=__filename;moduleUnderTest.paths=module.paths;
moduleUnderTest._compile(source.slice(0,cut)+scenario,__filename);

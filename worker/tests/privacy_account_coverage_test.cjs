/** Exact69-store coverage, real source/SQLite and genuine original privacy/session authority. Only synthetic OAuth endpoints. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=path.resolve(__dirname,'..'),original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='async function main(){';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function coverageReview(){
 const coverage=load('privacy-account-coverage'),forms=load('policy-forms'),fcore=load('policy-form-core');
 const actual=JSON.parse(load('privacy-write-admission-catalogue').ADMISSION_EXPECTED_JSON).tables.map(r=>r.name).sort();
 eq('coverage inventory exactly equals actual canonical69 business stores',Array.from(coverage.ACCOUNT_DATA_STORES,r=>r.store).sort(),actual);
 eq('inventory has exactly69 unique rows',new Set(coverage.ACCOUNT_DATA_STORES.map(r=>r.store)).size,69);
 ok('inventory and collection arrays are immutable',Object.isFrozen(coverage.ACCOUNT_DATA_STORES)&&coverage.ACCOUNT_DATA_STORES.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.collections)));
 const manifest=coverage.accountDataCoverage('identify');eq('inventory remains partial and does not claim fields/copies/erasure complete',[manifest.kind,manifest.allStoredFieldsDelivered,manifest.allCopiesIncluded,manifest.completeErasure],['curated_partial',false,false,false]);
 eq('control is separate from business69',manifest.separateSharedControl.store,'privacy_write_admission');ok('control is not downloaded',manifest.separateSharedControl.included===false&&!manifest.stores.some(r=>r.store==='privacy_write_admission'));
 for(const r of manifest.stores){ok(r.store+' exact store is described',typeof r.description==='string'&&r.description.length>0);ok(r.store+' has concrete handling limit',typeof r.handling==='string'&&r.handling.length>0);ok(r.store+' never claims row existence or record total',!Object.hasOwn(r,'count')&&!Object.hasOwn(r,'recordPresent'));}
 for(const r of ['relays','roster_members','roster_first_seen']){const item=manifest.stores.find(x=>x.store===r);eq(r+' actual remaining gap explicitly not in copy',item.coverage,'gap');eq(r+' false completeness refused',item.selectedInThisFile,false);}
 for(const r of ['bnet_characters','roster_effects']){const item=manifest.stores.find(x=>x.store===r);eq(r+' own history is separately downloadable',item.coverage,'collection');eq(r+' not silently added to aggregate',item.selectedInThisFile,false);eq(r+' one exact history selector',item.collections.length,1);}
 for(const r of ['community_privacy_cases','community_privacy_messages','community_privacy_operations']){const item=manifest.stores.find(x=>x.store===r);eq(r+' requires existing case credentials',item.coverage,'case');ok(r+' hints never act as account proof',item.handling.includes('does not grant access'));}
 eq('interactions do not gain guessed ownership',manifest.stores.find(r=>r.store==='seen_interactions').coverage,'unattributable');
 const html=coverage.accountDataCoverageHtml();eq('static readable UI has exactly69 store rows',(html.match(/data-account-store=/g)||[]).length,69);ok('UI is script-free and explicit partial help',!/<script|<form|<input/.test(html)&&html.includes('curated partial copy')&&html.includes('Ask an Olympus officer')&&html.includes('/privacy/case'));
 ok('record inventory is an optional closed disclosure with its full original scope',html.startsWith('<details class="privacy-scope"><summary>Copy scope and data inventory</summary>')&&!html.startsWith('<details open')&&html.includes('every stored field or every external, recovery or local copy')&&html.endsWith('</section></details>'));
 eq('metadata omitted if ordinary lifecycle copy is disabled',coverage.accountDataCoverage('ordinary',false).stores.find(r=>r.store==='privacy_subjects').selectedInThisFile,false);
 const lifecycleStores=['privacy_serving_jobs','privacy_subjects','privacy_provider_messages','privacy_restore_replay','privacy_denial_markers'];
 for(const store of lifecycleStores){
  const off=coverage.accountDataCoverage('ordinary',false).stores.find(r=>r.store===store);
  eq(store+' disabled ordinary projection marked unavailable',off.selectedInThisFile,false);
  eq(store+' disabled ordinary coverage needs review',off.coverage,'gap');
  ok(store+' disabled connection has truthful handling',off.description.includes('not included through this connection')&&off.handling.includes('not proof'));
  const on=coverage.accountDataCoverage('identify').stores.find(r=>r.store===store);
  eq(store+' available identify projection still selected',on.selectedInThisFile,true);
 }
 const disabledHtml=coverage.accountDataCoverageHtml(false);
 const settingsRow=text=>new RegExp('<tr data-account-store="site_settings">([\\s\\S]*?)</tr>').exec(text)?.[1]||'';
 const identifySettings=manifest.stores.find(r=>r.store==='site_settings'),ordinarySettings=coverage.accountDataCoverage('ordinary').stores.find(r=>r.store==='site_settings');
 eq('identify settings select only new owned metadata plus original separate history',[identifySettings.coverage,identifySettings.selectedInThisFile,Array.from(identifySettings.collections)],['selected',true,['community.discord_directory_visibility','community.news_webhook.deliveries','site.settingUpdates']]);
 eq('ordinary settings select own fields, bounded webhook metadata and separate setting history',[ordinarySettings.coverage,ordinarySettings.selectedInThisFile,Array.from(ordinarySettings.collections)],['selected',true,['aggregate singleton','site.settingUpdates','community.news_webhook.deliveries']]);
 ok('ordinary settings description limits selection to exact own offices and excludes counterparts',ordinarySettings.description.includes('your exact supported native-rank or extended-office account-publication associations')&&ordinarySettings.description.includes('account-bound Discord-directory suppression choice')&&ordinarySettings.description.includes('notice bodies and counterparts are withheld'));
 ok('default identify HTML selects bounded metadata without advertising ordinary association fields',settingsRow(html).includes('Selected own fields')&&settingsRow(html).includes('complete/truncated')&&!settingsRow(html).includes('account-publication association'));
 const ordinaryHtml=coverage.accountDataCoverageHtml(true,'ordinary');
 ok('explicit ordinary HTML advertises only its selected own fields',settingsRow(ordinaryHtml).includes('Selected own fields')&&settingsRow(ordinaryHtml).includes('exact supported native-rank or extended-office')&&settingsRow(ordinaryHtml).includes('notice bodies and counterparts are withheld'));
 eq('mode-specific HTML retains the same complete store inventory',(ordinaryHtml.match(/data-account-store=/g)||[]).length,69);
 for(const store of lifecycleStores){
  const row=new RegExp('<tr data-account-store="'+store+'">([\\s\\S]*?)</tr>').exec(disabledHtml);
  ok(store+' disabled rendered row explains unavailable scope',row&&row[1].includes('Attended review')&&row[1].includes('not included through this connection')&&!row[1].includes('Selected own fields'));
 }
 const labels=Object.keys(coverage.projectPrivacySubjectRecord(undefined));eq('missing row absence is a single factual Boolean',labels,['recordPresent']);
 const request=(route,cookie='',method='GET',fields={})=>new Request(BASE+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:new URLSearchParams(fields)}:{})});
 for(const state of ['absent','active','retiring','retired']){
  const statements=[];const f=fixture({statement:(sql,values)=>statements.push({sql,values})});f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED='true';if(state!=='absent')await subject(f,state);
  await fixtureWrite(f,'INSERT INTO privacy_subjects VALUES(?,?,?,?,?,?,?,?)',B,'b'.repeat(32),'active',999,7,8,null,null);
  calls=[];const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length,beforeB=JSON.stringify(f.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(B));
  const page=await access.privacyAccessPage(request('/privacy/access',connection.cookie),f.env),pageHtml=await page.text();eq(state+' genuine identify UI has69 rows',(pageHtml.match(/data-account-store=/g)||[]).length,69);ok(state+' retains truthful OAuth capability disclosure',pageHtml.includes('uses only your account ID, keeps no Discord token'));ok(state+' OFF erasure is not enabled',!pageHtml.includes('action="/privacy/access/erasure"'));
  const r=await copy.exportPrivacyAccess(frm.request(),f.env),b=await r.json();eq(state+' own copy succeeds',r.status,200);eq(state+' copied inventory69',b.coverage.storeInventory.stores.length,69);eq(state+' own subject presence',b.privacyLifecycle.subjectRecord.recordPresent,state!=='absent');
  if(state!=='absent'){eq(state+' original state is factual',b.privacyLifecycle.subjectRecord.state,state);eq(state+' dates are original native dates',b.privacyLifecycle.subjectRecord.createdAt,new Date(f.time()*1000).toISOString());eq(state+' safe metadata exact field whitelist',Object.keys(b.privacyLifecycle.subjectRecord),['recordPresent','state','createdAt','updatedAt','erasedAt','retainUntil']);}
  const json=JSON.stringify(b);ok(state+' no counterpart or authority values copied',!json.includes(B)&&!json.includes('b'.repeat(32))&&!json.includes(G));eq(state+' provider endpoints only original two',calls.length,beforeCalls);eq(state+' exact counterpart unchanged',JSON.stringify(f.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(B)),beforeB);
  ok(state+' actual identify page keeps selected owned metadata and withholds appointments',settingsRow(pageHtml).includes('Selected own fields')&&settingsRow(pageHtml).includes('appointments and counterparts are withheld'));
  const reads=statements.filter(x=>x.sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL));eq(state+' summary read occurs once',reads.length,1);eq(state+' own native parameter exact',Array.from(reads[0].values),[A]);
  ok(state+' attachment and no-store preserved',r.headers.get('Content-Disposition').includes('attachment')&&r.headers.get('Cache-Control').includes('no-store'));
  await refused(state+' spent export does not gain new metadata authority',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(state+' replay no new provider calls',calls.length,beforeCalls);f.db.close();
 }
 for(const [name,mutate]of [['captured absence created',async f=>await subject(f)],['generation ABA',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET generation=? WHERE subject_id=?','c'.repeat(32),A)],['revision changed',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1')],['state changed',async f=>await fixtureWrite(f,"UPDATE privacy_subjects SET state='retiring'")],['original deadline',f=>f.advance(720)]]){
  const f=fixture();if(name!=='captured absence created')await subject(f);const connection=await connect(f),frm=await form(f,connection),providerCount=calls.length;
  f.hooks.beforeBatch=async ss=>{if(ss.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;await mutate(f);}};
  await refused(name+' original guard refuses whole new metadata copy',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(name+' consumption rolled back',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);eq(name+' zero additional provider calls',calls.length,providerCount);f.db.close();
 }
 for(const fault of ['negative timestamp','wrong timestamp type','query abort','lost committed reply']){
  const f=fixture();await subject(f);const connection=await connect(f),frm=await form(f,connection);
  if(fault==='negative timestamp')await fixtureWrite(f,'UPDATE privacy_subjects SET created_at=-1');
  if(fault==='wrong timestamp type')await fixtureWrite(f,"UPDATE privacy_subjects SET created_at='not-a-date'");
  if(fault==='query abort')f.hooks.statement=sql=>{if(sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL))throw Error('synthetic metadata read failure');};
  if(fault==='lost committed reply')f.hooks.afterBatch=ss=>{if(ss.some(s=>s.sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL)))throw Error('synthetic lost actual commit reply');};
  await refused(fault+' download honestly unconfirmed',()=>copy.exportPrivacyAccess(frm.request(),f.env));
  eq(fault+' actual original grant custody',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at!==null,fault==='lost committed reply');f.db.close();
 }
 // Exact original ordinary session, not the privacy cookie or a fabricated account.
 for(const enabled of [false,true]){
  const sql=[];const f=fixture({statement:(s,v)=>sql.push({s,v})});await subject(f);f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED=String(enabled);f.env.PRIVACY_ACCESS_ENABLED='true';
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied) VALUES(?,?,?,?,?,?)',A,f.time(),f.time(),1,7,0);
  const ordinary=await issueFixtureCookie(f);await fixtureWrite(f,'UPDATE site_users SET in_server=0,denied=1 WHERE discord_id=?',A);const nonce='n'.repeat(43),cookies=ordinary+'; '+fcore.FORM_COOKIE+'='+nonce;
  const p=await forms.handlePolicyForms(request('/privacy/account',cookies),f.env,'/privacy/account',true),text=await p.text();eq('ordinary '+enabled+' page status',p.status,200);eq('ordinary '+enabled+' page inventory69',(text.match(/data-account-store=/g)||[]).length,69);
  const section=/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/.exec(text);ok('ordinary '+enabled+' original export form kept',!!section);const fields=Object.fromEntries([...section[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(x=>[x[1],x[2]]));fields.mode='download';
  calls=[];const r=await forms.handlePolicyForms(request('/privacy/account/export',cookies,'POST',fields),f.env,'/privacy/account/export',true),b=await r.json();eq('ordinary '+enabled+' denied/departed original session may read own copy',r.status,200);eq('ordinary '+enabled+' inventory69',b.coverage.storeInventory.stores.length,69);eq('ordinary '+enabled+' provider calls0',calls.length,0);
  eq('ordinary '+enabled+' summary query matches activated read scope',sql.filter(x=>x.s===coverage.PRIVACY_SUBJECT_COPY_SQL).length,enabled?1:0);
  for(const store of lifecycleStores){
   const item=b.coverage.storeInventory.stores.find(r=>r.store===store);
   eq('ordinary '+enabled+' actual downloaded '+store+' scope',item.selectedInThisFile,enabled);
   eq('ordinary '+enabled+' actual downloaded '+store+' coverage',item.coverage,enabled?'selected':'gap');
   const row=new RegExp('<tr data-account-store="'+store+'">([\\s\\S]*?)</tr>').exec(text);
   ok('ordinary '+enabled+' actual rendered '+store+' agrees with download',row&&row[1].includes(enabled?'Selected own fields':'Attended review'));
  }
  if(enabled){eq('ordinary current lifecycle state',b.privacyLifecycle.subjectRecord.state,'active');ok('ordinary no generation credential',!JSON.stringify(b).includes(G));}else eq('ordinary OFF lifecycle metadata not misrepresented as absent',Object.hasOwn(b,'privacyLifecycle'),false);
  f.db.close();
 }
 // The two new families use their actual registered projections, in the
 // genuine identify transaction; no fabricated ordinary session is needed.
 const registry=load('community-data-registry'),webhook=load('site-news-webhook');
 {
  const f=fixture(),names=['discord_directory_visibility','news_webhook'];
  const plan=registry.communityScopedExportPlan(f.env,A,names);
  eq('scoped selected export retains exact named family order and3 reads',plan.statements.length,3);
  assert.throws(()=>registry.communityScopedExportPlan(f.env,A,[]),/community_scoped_export_invalid/);checks++;
  assert.throws(()=>registry.communityScopedExportPlan(f.env,A,[names[0],names[0]]),/community_scoped_export_invalid/);checks++;
  assert.throws(()=>registry.communityScopedExportPlan(f.env,A,['not_registered']),/community_scoped_export_missing/);checks++;
  assert.throws(()=>plan.shape([]),/privacy_copy_unconfirmed/);checks++;
  assert.throws(()=>plan.shape([{success:true,results:[{hidden:0}]},{success:false,results:[{n:0}]},{success:true,results:[]}]),/privacy_copy_unconfirmed/);checks++;
  const shaped=plan.shape([{success:true,results:[{hidden:0}]},{success:true,results:[{n:0}]},{success:true,results:[]}]);
  eq('scoped empty copy exposes two selected families without appointments',Object.keys(shaped),names);
  eq('scoped empty webhook copy is explicitly complete',[shaped.news_webhook.count,shaped.news_webhook.complete,shaped.news_webhook.truncated],[0,true,false]);
  console.log('PASS scoped helper rejects empty/duplicate/missing families and missing/failed results');f.db.close();
 }
 const ownDescriptor=(f,who,i)=>{
  const id=('copy196_'+String(i).padStart(14,'0'));
  return {v:1,id,revision:i+1,operation:webhook.NEWS_WEBHOOK_PREFIX+id+':'+i.toString(16).padStart(42,'0'),payloadHash:'1'.repeat(64),configHash:'2'.repeat(64),credentialPin:'Q'.repeat(43),guild:'55555555555555555',channel:'77777777777777777',webhook:'88888888888888888',actor:who,birth:(who===A?'c':'d').repeat(32),generation:who===A?G:'b'.repeat(32),createdAt:f.time()-100,noticeUntil:f.time()+86400,retainUntil:f.time()-100+366*86400};
 };
 async function seedOwnSettings(f,ownCount=1){
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied,account_incarnation)VALUES(?,?,?,0,7,1,?)',A,f.time(),f.time(),'c'.repeat(32));
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied,account_incarnation)VALUES(?,?,?,1,2,0,?)',B,f.time(),f.time(),'d'.repeat(32));
  await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','discordDirectoryHidden',JSON.stringify({[A]:'c'.repeat(32),[B]:'d'.repeat(32)}),f.time());
  const plans=[];
  for(let i=0;i<=ownCount;i++){
   const who=i===ownCount?B:A,m=ownDescriptor(f,who,i);
   assert.ok(webhook.parseNewsWebhookMetadata(JSON.stringify(m)),'fixture uses exact current source metadata grammar');
   if(f.installed()){
    plans.push(f.env.DB.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)').bind('newsWebhook:'+m.id,JSON.stringify(m),f.time(),who));
    if(plans.length===100)await f.env.DB.batch(plans.splice(0));
   }else await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,?)','newsWebhook:'+m.id,JSON.stringify(m),f.time(),who);
  }
  if(plans.length)await f.env.DB.batch(plans);
 }
 {
  const statements=[],f=fixture({statement:s=>statements.push(s)});await subject(f);await seedOwnSettings(f);f.env.PRIVACY_ERASURE_ENABLED='false';
  const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
  const originalOther=JSON.stringify(f.db.prepare("SELECT value FROM site_settings WHERE key GLOB 'newsWebhook:*' ORDER BY key").all());
  statements.length=0;const response=await copy.exportPrivacyAccess(frm.request(),f.env),body=await response.json();
  eq('denied departed identify-only original grant reads own new metadata',response.status,200);
  eq('denied departed identify keeps factual original account flags',[body.account.inServer,body.account.denied],[false,true]);
  eq('identify own opt-out uses account incarnation without exporting it',body.community.discord_directory_visibility,{listedByDefault:true,optedOut:true,scope:'whole_directory_row',extraProfileDetails:'separate_opt_in'});
  eq('identify webhook own count is exact and complete',[body.community.news_webhook.count,body.community.news_webhook.returnedCount,body.community.news_webhook.complete,body.community.news_webhook.truncated],[1,1,true,false]);
  eq('identify webhook safe entry field whitelist',Object.keys(body.community.news_webhook.deliveries[0]),['noticeId','revision','state','removalPending','createdAt','noticeUntil','retainUntil']);
  eq('identify webhook selects only original own editor row',body.community.news_webhook.deliveries[0].noticeId,ownDescriptor(f,A,0).id);
  const selectedText=JSON.stringify(body.community);
  ok('identify new settings omit counterpart proof pointer destination credentials and body',![B,'d'.repeat(32),'c'.repeat(32),'Q'.repeat(43),'77777777777777777','88888888888888888','credentialPin','payloadHash',ownDescriptor(f,B,1).id].some(v=>selectedText.includes(v)));
  ok('identify new settings do not gain ordinary appointment associations',!Object.hasOwn(body.site,'appointmentPublications'));
  eq('identify new settings actual aggregate cost is historical97 plus1 packed read',statements.length,98);
  eq('identify selected read issues no additional provider endpoints',calls.length,beforeCalls);
  eq('identify selected export leaves exact stored descriptors unchanged',JSON.stringify(f.db.prepare("SELECT value FROM site_settings WHERE key GLOB 'newsWebhook:*' ORDER BY key").all()),originalOther);
  eq('identify new settings consumes the same original grant exactly once',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,f.time());
  await refused('identify new settings original one-use replay remains refused',()=>copy.exportPrivacyAccess(frm.request(),f.env));f.db.close();
 }
 {
  const f=fixture();await subject(f);await seedOwnSettings(f,1001);f.env.PRIVACY_ERASURE_ENABLED='false';
  const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
  const response=await copy.exportPrivacyAccess(frm.request(),f.env),body=await response.json(),section=body.community.news_webhook;
  eq('identify full own count with1001 retained rows is truthful',[section.count,section.returnedCount,section.deliveries.length,section.limit,section.complete,section.truncated],[1001,1000,1000,1000,false,true]);
  ok('identify truncation explicitly requires attended review with no invented cursor',section.scope.includes('attended')&&!Object.hasOwn(section,'nextCursor'));
  ok('identify bounded settings list cannot contain counterpart descriptor',section.deliveries.every(r=>r.noticeId!==ownDescriptor(f,B,1001).id));
  eq('identify large own copy causes no new provider endpoint',calls.length,beforeCalls);f.db.close();
 }
 {
  const f=fixture();await subject(f);await seedOwnSettings(f);f.env.PRIVACY_ERASURE_ENABLED='false';
  const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
  // Derive the exact inert packed source SQL through the original Native fixture port; no statement is executed here.
  const failedPlan196=registry.communityPackedExportPlan({...f.env,DB:f.native},A,['discord_directory_visibility','news_webhook']);
  eq('identify failure fixture selects exactly one packed source statement',failedPlan196.statements.length,1);
  const failedSql196=failedPlan196.statements[0].sql;if(typeof failedSql196!=='string'||!failedSql196)throw Error('packed source SQL not exposed by original Native fixture');
  let injected196=0;f.hooks.statement=sql=>{if(sql===failedSql196){injected196++;throw Error('synthetic original selected metadata read failure');}};
  await refused('identify new scoped query failure refuses whole original copy',()=>copy.exportPrivacyAccess(frm.request(),f.env));
  eq('identify whole-copy refusal actually reaches exact packed-query failure once',injected196,1);
  eq('identify failed scoped query rolls original one-use consumption back',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);
  eq('identify failed scoped query has no provider side effect',calls.length,beforeCalls);f.db.close();
 }
 // Production-shaped installed transport preserves original writer controls; one packed metadata read adds no writer group.
 {
  const statements=[],f=fixture({statement:(s,v)=>statements.push({s,v})});await subject(f);f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED='true';
  eq('setup retains original installed audit-control value',f.db.prepare("SELECT value FROM site_settings WHERE key='auditTypedNames'").get().value,'115');
  const admission=load('privacy-write-admission'),native=f.native,installation=f.ready();eq('native installed exact current224 guards',installation.triggerCount,224);
  f.env.DB=admission.createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH);
  const connection=await connect(f),frm=await form(f,connection);statements.length=0;const r=await copy.exportPrivacyAccess(frm.request(),f.env),body=await r.json();
  eq('installed original identify download succeeds',r.status,200);eq('installed own summary fenced active',body.privacyLifecycle.subjectRecord.state,'active');
  eq('installed aggregate98 physical statements is original97 plus1 packed read',statements.length,98);
  eq('installed summary remains exactly one SELECT',statements.filter(x=>x.s.includes(coverage.PRIVACY_SUBJECT_COPY_SQL)).length,1);
  const neutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('installed one consumed write batch leaves native control neutral',[neutral.active,neutral.nonce,neutral.purpose],[0,'','']);
  eq('installed privacy grant remains consumed once',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,f.time());
  f.db.close();
 }
 // Actual full-index requests: fixture schema/install/OAuth/page setup is excluded only before request accounting.
 const index=load('index').default,admission=load('privacy-write-admission');
 const fullRequestResult=async(name,r,statements,batches,pending)=>{
  await Promise.all(pending);const text=await r.text();
  // Preserve the full original HTTP response and native attempted statements before outcome predicates.
  console.log('FULL_ROUTE_ORIGINAL '+JSON.stringify({name,status:r.status,headers:Object.fromEntries(r.headers),body:text,
   accounting:'D1 statements attempted during this actual index.fetch request; all fixture/schema/install/connect/form setup occurred before reset',
   attemptedStatements:statements.length,nativeBatchLengths:batches.map(b=>b.length),nativeBatchStatements:batches,
   nativeStatementSQL:statements,waitUntilCount:pending.length,credentialBindingsRecorded:false}));
  return JSON.parse(text);
 };
 {
  const statements=[],batches=[],pending=[],f=fixture({statement:s=>statements.push(s),beforeBatch:ss=>batches.push(ss.map(s=>s.sql))});
  await subject(f);Object.assign(f.env,{PUBLIC_BASE_URL:'https://olympus-worker.example.test',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical'});
  eq('setup retains original installed audit-control value',f.db.prepare("SELECT value FROM site_settings WHERE key='auditTypedNames'").get().value,'115');
  const native=f.native,installation=f.ready();eq('full-index identify setup installs current224 guards',installation.triggerCount,224);
  f.env.DB=admission.createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH);
  // Genuine OAuth/CSRF/grant setup uses its registered writer under installed guards. Measured index.fetch receives original native DB and creates its normal wrapper.
  const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
  const setupNeutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('full-index identify guarded setup leaves native control neutral',[setupNeutral.active,setupNeutral.nonce,setupNeutral.purpose],[0,'','']);
  statements.length=0;batches.length=0;
  const r=await index.fetch(frm.request({collection:'copy',cursor:''}),{...f.env,DB:native},{waitUntil:p=>pending.push(p)});
  const body=await fullRequestResult('identify /privacy/access/export installed full-index',r,statements,batches,pending);
  const settings=body.coverage.storeInventory.stores.find(r=>r.store==='site_settings');
  eq('actual identify export selects only new own setting metadata',[settings.coverage,settings.selectedInThisFile,settings.collections],['selected',true,['community.discord_directory_visibility','community.news_webhook.deliveries','site.settingUpdates']]);
  ok('actual identify copy has no ordinary appointment publication section',!Object.hasOwn(body.site||{},'appointmentPublications'));
  eq('full-index identify original download succeeds',r.status,200);eq('full-index identify own original identity',body.identity.discordId,A);
  eq('full-index identify actual curated copy remains partial',body.coverage.kind,'curated_partial');eq('full-index identify erasure never claimed',body.coverage.completeErasure,false);
  eq('full-index identify exact99 physical SQL is original98 plus1 packed read',statements.length,99);
  ok('full-index identify actual HTTP D1 attempts stay below100',statements.length<100);
  eq('full-index identify original grant read2 plus native admitted writer96',batches.map(b=>b.length),[2,96]);
  eq('full-index identify original schema admission and grant-read proof exactly twice',statements.filter(s=>s.includes('privacy_current_schema_requires_attended_setup')).length,2);
  eq('full-index identify packed extension is exactly1 physical read over historical98',statements.length-98,1);eq('full-index identify no background tasks',pending.length,0);eq('full-index identify no additional provider endpoints',calls.length,beforeCalls);
  const neutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('full-index identify native writer neutral',[neutral.active,neutral.nonce,neutral.purpose],[0,'','']);
  const grant=f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get();eq('full-index identify original grant consumed exactly once',grant.consumed_at,f.time());
  eq('full-index identify original generation and revision unchanged',Array.from(Object.values(f.db.prepare('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?').get(A))),[G,3]);
  f.db.close();
 }
 {
  const statements=[],batches=[],pending=[],f=fixture({statement:s=>statements.push(s),beforeBatch:ss=>batches.push(ss.map(s=>s.sql))});
  await subject(f);Object.assign(f.env,{PUBLIC_BASE_URL:'https://olympus-worker.example.test',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical'});
  await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied) VALUES(?,?,?,?,?,?)',A,f.time(),f.time(),1,7,0);
  eq('setup retains original installed audit-control value',f.db.prepare("SELECT value FROM site_settings WHERE key='auditTypedNames'").get().value,'115');
  const installation=f.ready();eq('full-index ordinary setup installs current224 guards',installation.triggerCount,224);
  const ordinary=await issueFixtureCookie(f);await fixtureWrite(f,'UPDATE site_users SET in_server=0,denied=1 WHERE discord_id=?',A);const nonce='n'.repeat(43),cookies=ordinary+'; '+fcore.FORM_COOKIE+'='+nonce;
  const originalSubjectBirth=f.db.prepare('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?').get(A);
  provider=null;calls=[];
  const page=await index.fetch(request('/privacy/account',cookies),{...f.env,DB:f.native},{waitUntil:p=>pending.push(p)}),html=await page.text();
  eq('full-index ordinary setup uses actual current page',page.status,200);
  const section=/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/.exec(html);ok('full-index ordinary actual original export form',!!section);
  const fields=Object.fromEntries([...section[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(x=>[x[1],x[2]]));fields.mode='download';
  await Promise.all(pending);eq('full-index ordinary setup has no background tasks',pending.length,0);
  statements.length=0;batches.length=0;pending.length=0;
  const r=await index.fetch(request('/privacy/account/export',cookies,'POST',fields),{...f.env,DB:f.native},{waitUntil:p=>pending.push(p)});
  const body=await fullRequestResult('ordinary /privacy/account/export installed full-index',r,statements,batches,pending);
  const settings=body.coverage.storeInventory.stores.find(r=>r.store==='site_settings');
  eq('actual ordinary export advertises its selected own fields',[settings.coverage,settings.selectedInThisFile,settings.collections],['selected',true,['aggregate singleton','site.settingUpdates','community.news_webhook.deliveries']]);
  eq('actual ordinary export with no approved association returns only an empty own publication list',body.site.appointmentPublications,[]);
  ok('actual ordinary policy page uses the ordinary selected-field inventory',settingsRow(html).includes('Selected own fields')&&settingsRow(html).includes('exact supported native-rank or extended-office'));
  eq('full-index ordinary original signed session and CSRF copy succeeds',r.status,200);eq('full-index ordinary own identity',body.account.discordId,A);
  eq('full-index ordinary denied/departed session keeps own data scope',[body.account.inServer,body.account.denied],[false,true]);eq('full-index ordinary erasure never claimed',body.coverage.completeErasure,false);
  ok('full-index ordinary actual HTTP D1 attempts stay below100',statements.length<100);
  eq('full-index ordinary five original schema and admitted-read profile checks',statements.filter(s=>s.includes('privacy_current_schema_requires_attended_setup')).length,5);
  // Ordinary export includes its separate audit write: preserve every batch instead of asserting a guessed cardinality.
  const controlled=batches.filter(b=>b[0]?.includes('UPDATE privacy_write_admission'));
  ok('full-index ordinary actual writes retain four original writer controls',controlled.length>=1&&controlled.every(b=>b.length>=4&&b[1].includes('privacy_write_admission')&&b.at(-2).includes('privacy_write_admission')&&b.at(-1).includes('privacy_write_admission')));
  eq('full-index ordinary no background tasks',pending.length,0);eq('full-index ordinary no provider endpoint',calls.length,0);eq('full-index ordinary no identify grant substitution',count(f,'privacy_access_grants'),0);
  const neutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('full-index ordinary native writer neutral',[neutral.active,neutral.nonce,neutral.purpose],[0,'','']);
  eq('full-index ordinary original generation and revision unchanged after genuine OAuth setup',f.db.prepare('SELECT generation,revision FROM privacy_subjects WHERE subject_id=?').get(A),originalSubjectBirth);
  f.db.close();
 }
 {
  const f=fixture(),registry=load('community-data-registry'),names=['discord_directory_visibility','news_webhook'];
  for(const selected of [[],['news_webhook','news_webhook'],['missing_family']]){
   let held=false;try{registry.communityPackedExportPlan(f.env,A,selected);}catch{held=true;}
   ok('packed source selection refuses empty duplicate or missing family '+JSON.stringify(selected),held);
  }
  const plan=registry.communityPackedExportPlan(f.env,A,names);eq('packed selected metadata is one logical statement',plan.statements.length,1);
  const goodDirectory={family:0,entry:'',value:'{"hidden":0}'},goodCount={family:1,entry:'',value:'{"count":0}'};
  for(const result of [[],[{success:false,results:[]}],[{success:true,results:[]}],[{success:true,results:[{family:0,entry:'',value:'not-json'},goodCount]}],[{success:true,results:[{family:0,entry:'',value:'{"hidden":2}'},goodCount]}],[{success:true,results:[goodDirectory,goodDirectory,goodCount]}],[{success:true,results:[goodDirectory,{family:2,entry:'',value:'{}'}]}]]){
   let held=false;try{plan.shape(result);}catch{held=true;}ok('synthetic malformed packed D1 projection is refused',held);
  }
  const emptyPacked196=plan.shape([{success:true,results:[goodDirectory,goodCount]}]);
  // The original source loader uses a VM realm. Compare exact JSON-wire data,
  // retaining explicit raw key sets so serialization cannot hide added fields.
  eq('synthetic empty packed own metadata retains exact raw public key sets',[Object.keys(emptyPacked196).sort(),Object.keys(emptyPacked196.discord_directory_visibility).sort(),Object.keys(emptyPacked196.news_webhook).sort()],[['discord_directory_visibility','news_webhook'],['extraProfileDetails','listedByDefault','optedOut','scope'],['complete','count','deliveries','limit','returnedCount','scope','truncated']]);
  eq('synthetic empty packed own metadata preserves both public projection shapes',JSON.parse(JSON.stringify(emptyPacked196)),{discord_directory_visibility:{listedByDefault:true,optedOut:false,scope:'whole_directory_row',extraProfileDetails:'separate_opt_in'},news_webhook:{deliveries:[],count:0,returnedCount:0,limit:1000,truncated:false,complete:true,scope:'Current retained editor-associated records only; this is not complete immutable publication history.'}});
  f.db.close();
 }
 {
  // The marker is fixture-seeded in the exact attended storage shape. The real
  // attended admin writer is independently tested by the directory leaf; this
  // case proves the genuine identify-only grant and current full HTTP exporter.
  const statements=[],batches=[],pending=[],f=fixture({statement:s=>statements.push(s),beforeBatch:ss=>batches.push(ss.map(s=>s.sql))});
  await subject(f);Object.assign(f.env,{PUBLIC_BASE_URL:'https://olympus-worker.example.test',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:'canonical'});
  const hidden=JSON.stringify({[A]:'discord-only-optout-v1',[B]:'discord-only-optout-v1'});
  await fixtureWrite(f,'INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)','discordDirectoryHidden',hidden,f.time());
  eq('never-signed-in attended-marker fixture has no ordinary site account',f.db.prepare('SELECT COUNT(*) AS n FROM site_users WHERE discord_id=?').get(A).n,0);
  const native=f.native,installation=f.ready();eq('attended-marker identify fixture retains original224 installed guards',installation.triggerCount,224);
  f.env.DB=admission.createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH);
  const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length;
  eq('genuine identify OAuth does not create the absent ordinary account',f.db.prepare('SELECT COUNT(*) AS n FROM site_users WHERE discord_id=?').get(A).n,0);
  statements.length=0;batches.length=0;
  const response=await index.fetch(frm.request({collection:'copy',cursor:''}),{...f.env,DB:native},{waitUntil:p=>pending.push(p)});
  const body=await fullRequestResult('identify attended marker without site_users installed full-index',response,statements,batches,pending);
  eq('genuine identify-only HTTP copy reads never-signed-in attended suppression',response.status,200);
  eq('attended-marker identify copy retains exact own directory preference shape',body.community.discord_directory_visibility,{listedByDefault:true,optedOut:true,scope:'whole_directory_row',extraProfileDetails:'separate_opt_in'});
  ok('attended-marker identify metadata omits marker literal and counterpart',!JSON.stringify(body.community).includes('discord-only-optout-v1')&&!JSON.stringify(body.community).includes(B));
  eq('attended-marker full HTTP copy remains exactly99 physical statements',statements.length,99);
  ok('attended-marker full HTTP copy retains strict below100 limit',statements.length<100);
  eq('attended-marker copy preserves original grant read2 and admitted writer96',batches.map(b=>b.length),[2,96]);
  eq('attended-marker copy consumes only original one-use identify grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,f.time());
  eq('attended-marker copy neither creates ordinary account nor changes another marker',[f.db.prepare('SELECT COUNT(*) AS n FROM site_users WHERE discord_id=?').get(A).n,f.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value],[0,hidden]);
  eq('attended-marker own copy issues no additional provider endpoints',calls.length,beforeCalls);
  eq('attended-marker own copy creates no background work',pending.length,0);
  const neutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('attended-marker original writer is neutral after copy',[neutral.active,neutral.nonce,neutral.purpose],[0,'','']);
  await refused('attended-marker identify grant remains one-use',()=>copy.exportPrivacyAccess(frm.request(),f.env));f.db.close();
 }
 provider=null;console.log(`privacy_account_coverage_test: ${checks} checks PASS`);
}
const m=new Module(__filename,module);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));m._compile(source.slice(0,source.indexOf(marker))+'\n'+coverageReview.toString()+'\ncoverageReview().catch(e=>{console.error("FAIL privacy_account_coverage_test",e);process.exitCode=1;});',original);

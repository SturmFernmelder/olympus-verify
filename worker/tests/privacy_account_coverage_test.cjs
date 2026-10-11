/** Exact66-store coverage, real source/SQLite and genuine original privacy/session authority. Only synthetic OAuth endpoints. */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=path.resolve(__dirname,'..'),original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='async function main(){';
if(source.split(marker).length!==2)throw Error('canonical setup boundary changed');
async function coverageReview(){
 const coverage=load('privacy-account-coverage'),forms=load('policy-forms'),fcore=load('policy-form-core');
 const actual=JSON.parse(load('privacy-write-admission-catalogue').ADMISSION_EXPECTED_JSON).tables.map(r=>r.name).sort();
 eq('coverage inventory exactly equals actual canonical66 business stores',Array.from(coverage.ACCOUNT_DATA_STORES,r=>r.store).sort(),actual);
 eq('inventory has exactly66 unique rows',new Set(coverage.ACCOUNT_DATA_STORES.map(r=>r.store)).size,66);
 ok('inventory and collection arrays are immutable',Object.isFrozen(coverage.ACCOUNT_DATA_STORES)&&coverage.ACCOUNT_DATA_STORES.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.collections)));
 const manifest=coverage.accountDataCoverage('identify');eq('inventory remains partial and does not claim fields/copies/erasure complete',[manifest.kind,manifest.allStoredFieldsDelivered,manifest.allCopiesIncluded,manifest.completeErasure],['curated_partial',false,false,false]);
 eq('control is separate from business66',manifest.separateSharedControl.store,'privacy_write_admission');ok('control is not downloaded',manifest.separateSharedControl.included===false&&!manifest.stores.some(r=>r.store==='privacy_write_admission'));
 for(const r of manifest.stores){ok(r.store+' exact store is described',typeof r.description==='string'&&r.description.length>0);ok(r.store+' has concrete handling limit',typeof r.handling==='string'&&r.handling.length>0);ok(r.store+' never claims row existence or record total',!Object.hasOwn(r,'count')&&!Object.hasOwn(r,'recordPresent'));}
 for(const r of ['bnet_characters','relays','roster_effects','roster_members','roster_first_seen']){const item=manifest.stores.find(x=>x.store===r);eq(r+' actual remaining gap explicitly not in copy',item.coverage,'gap');eq(r+' false completeness refused',item.selectedInThisFile,false);}
 for(const r of ['community_privacy_cases','community_privacy_messages','community_privacy_operations']){const item=manifest.stores.find(x=>x.store===r);eq(r+' requires existing case credentials',item.coverage,'case');ok(r+' hints never act as account proof',item.handling.includes('does not grant access'));}
 eq('interactions do not gain guessed ownership',manifest.stores.find(r=>r.store==='seen_interactions').coverage,'unattributable');
 const html=coverage.accountDataCoverageHtml();eq('static readable UI has exactly66 store rows',(html.match(/data-account-store=/g)||[]).length,66);ok('UI is script-free and explicit partial help',!/<script|<form|<input/.test(html)&&html.includes('curated partial copy')&&html.includes('Ask an Olympus officer')&&html.includes('/privacy/case'));
 eq('metadata omitted if ordinary lifecycle copy is disabled',coverage.accountDataCoverage('ordinary',false).stores.find(r=>r.store==='privacy_subjects').selectedInThisFile,false);
 const labels=Object.keys(coverage.projectPrivacySubjectRecord(undefined));eq('missing row absence is a single factual Boolean',labels,['recordPresent']);
 const request=(route,cookie='',method='GET',fields={})=>new Request(BASE+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:new URLSearchParams(fields)}:{})});
 for(const state of ['absent','active','retiring','retired']){
  const statements=[];const f=fixture({statement:(sql,values)=>statements.push({sql,values})});f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED='true';if(state!=='absent')subject(f,state);
  f.db.prepare('INSERT INTO privacy_subjects VALUES(?,?,?,?,?,?,?,?)').run(B,'b'.repeat(32),'active',999,7,8,null,null);
  calls=[];const connection=await connect(f),frm=await form(f,connection),beforeCalls=calls.length,beforeB=JSON.stringify(f.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(B));
  const page=await access.privacyAccessPage(request('/privacy/access',connection.cookie),f.env),pageHtml=await page.text();eq(state+' genuine identify UI has66 rows',(pageHtml.match(/data-account-store=/g)||[]).length,66);ok(state+' retains truthful OAuth capability disclosure',pageHtml.includes('uses only your account ID, keeps no Discord token'));ok(state+' OFF erasure is not enabled',!pageHtml.includes('action="/privacy/access/erasure"'));
  const r=await copy.exportPrivacyAccess(frm.request(),f.env),b=await r.json();eq(state+' own copy succeeds',r.status,200);eq(state+' copied inventory66',b.coverage.storeInventory.stores.length,66);eq(state+' own subject presence',b.privacyLifecycle.subjectRecord.recordPresent,state!=='absent');
  if(state!=='absent'){eq(state+' original state is factual',b.privacyLifecycle.subjectRecord.state,state);eq(state+' dates are original native dates',b.privacyLifecycle.subjectRecord.createdAt,new Date(f.time()*1000).toISOString());eq(state+' safe metadata exact field whitelist',Object.keys(b.privacyLifecycle.subjectRecord),['recordPresent','state','createdAt','updatedAt','erasedAt','retainUntil']);}
  const json=JSON.stringify(b);ok(state+' no counterpart or authority values copied',!json.includes(B)&&!json.includes('b'.repeat(32))&&!json.includes(G));eq(state+' provider endpoints only original two',calls.length,beforeCalls);eq(state+' exact counterpart unchanged',JSON.stringify(f.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(B)),beforeB);
  const reads=statements.filter(x=>x.sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL));eq(state+' summary read occurs once',reads.length,1);eq(state+' own native parameter exact',Array.from(reads[0].values),[A]);
  ok(state+' attachment and no-store preserved',r.headers.get('Content-Disposition').includes('attachment')&&r.headers.get('Cache-Control').includes('no-store'));
  await refused(state+' spent export does not gain new metadata authority',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(state+' replay no new provider calls',calls.length,beforeCalls);f.db.close();
 }
 for(const [name,mutate]of [['captured absence created',f=>subject(f)],['generation ABA',f=>f.db.prepare('UPDATE privacy_subjects SET generation=? WHERE subject_id=?').run('c'.repeat(32),A)],['revision changed',f=>f.db.exec('UPDATE privacy_subjects SET revision=revision+1')],['state changed',f=>f.db.exec("UPDATE privacy_subjects SET state='retiring'")],['original deadline',f=>f.advance(720)]]){
  const f=fixture();if(name!=='captured absence created')subject(f);const connection=await connect(f),frm=await form(f,connection),providerCount=calls.length;
  f.hooks.beforeBatch=ss=>{if(ss.some(s=>s.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;mutate(f);}};
  await refused(name+' original guard refuses whole new metadata copy',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(name+' consumption rolled back',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);eq(name+' zero additional provider calls',calls.length,providerCount);f.db.close();
 }
 for(const fault of ['negative timestamp','wrong timestamp type','query abort','lost committed reply']){
  const f=fixture();subject(f);const connection=await connect(f),frm=await form(f,connection);
  if(fault==='negative timestamp')f.db.exec('UPDATE privacy_subjects SET created_at=-1');
  if(fault==='wrong timestamp type')f.db.exec("UPDATE privacy_subjects SET created_at='not-a-date'");
  if(fault==='query abort')f.hooks.statement=sql=>{if(sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL))throw Error('synthetic metadata read failure');};
  if(fault==='lost committed reply')f.hooks.afterBatch=ss=>{if(ss.some(s=>s.sql.includes(coverage.PRIVACY_SUBJECT_COPY_SQL)))throw Error('synthetic lost actual commit reply');};
  await refused(fault+' download honestly unconfirmed',()=>copy.exportPrivacyAccess(frm.request(),f.env));
  eq(fault+' actual original grant custody',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at!==null,fault==='lost committed reply');f.db.close();
 }
 // Exact original ordinary session, not the privacy cookie or a fabricated account.
 for(const enabled of [false,true]){
  const sql=[];const f=fixture({statement:(s,v)=>sql.push({s,v})});subject(f);f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED=String(enabled);f.env.PRIVACY_ACCESS_ENABLED='true';
  f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied) VALUES(?,?,?,?,?,?)').run(A,f.time(),f.time(),0,7,1);
  const ordinary=(await core.sessionCookie(f.env,A,7,G)).split(';')[0],nonce='n'.repeat(43),cookies=ordinary+'; '+fcore.FORM_COOKIE+'='+nonce;
  const p=await forms.handlePolicyForms(request('/privacy/account',cookies),f.env,'/privacy/account',true),text=await p.text();eq('ordinary '+enabled+' page status',p.status,200);eq('ordinary '+enabled+' page inventory66',(text.match(/data-account-store=/g)||[]).length,66);
  const section=/<form method="post" action="\/privacy\/account\/export">([\s\S]*?)<\/form>/.exec(text);ok('ordinary '+enabled+' original export form kept',!!section);const fields=Object.fromEntries([...section[1].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(x=>[x[1],x[2]]));fields.mode='download';
  calls=[];const r=await forms.handlePolicyForms(request('/privacy/account/export',cookies,'POST',fields),f.env,'/privacy/account/export',true),b=await r.json();eq('ordinary '+enabled+' denied/departed original session may read own copy',r.status,200);eq('ordinary '+enabled+' inventory66',b.coverage.storeInventory.stores.length,66);eq('ordinary '+enabled+' provider calls0',calls.length,0);
  eq('ordinary '+enabled+' summary query matches activated read scope',sql.filter(x=>x.s===coverage.PRIVACY_SUBJECT_COPY_SQL).length,enabled?1:0);
  if(enabled){eq('ordinary current lifecycle state',b.privacyLifecycle.subjectRecord.state,'active');ok('ordinary no generation credential',!JSON.stringify(b).includes(G));}else eq('ordinary OFF lifecycle metadata not misrepresented as absent',Object.hasOwn(b,'privacyLifecycle'),false);
  f.db.close();
 }
 // Production-shaped installed transport preserves original writer controls; the extra read adds no writer group.
 {
  const statements=[],f=fixture({statement:(s,v)=>statements.push({s,v})});subject(f);f.env.PRIVACY_ERASURE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED='true';
  f.db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',1)").run();
  const admission=load('privacy-write-admission'),native=f.env.DB,installation=await admission.installCurrentPrivacyWriteAdmission(native);eq('native installed exact198 action triggers',installation.triggers,198);
  f.env.DB=admission.createPrivacyWriteAdmissionDatabase(native,'writer');
  const connection=await connect(f),frm=await form(f,connection);statements.length=0;const r=await copy.exportPrivacyAccess(frm.request(),f.env),body=await r.json();
  eq('installed original identify download succeeds',r.status,200);eq('installed own summary fenced active',body.privacyLifecycle.subjectRecord.state,'active');
  eq('installed aggregate total93 SQL attempts including original grant read plus four writer-control statements',statements.length,93);
  eq('installed summary remains exactly one SELECT',statements.filter(x=>x.s.includes(coverage.PRIVACY_SUBJECT_COPY_SQL)).length,1);
  const neutral=f.db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').get();eq('installed one consumed write batch leaves native control neutral',[neutral.active,neutral.nonce,neutral.purpose],[0,'','']);
  eq('installed privacy grant remains consumed once',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,f.time());
  f.db.close();
 }
 provider=null;console.log(`privacy_account_coverage_test: ${checks} checks PASS`);
}
const m=new Module(__filename,module);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));m._compile(source.slice(0,source.indexOf(marker))+'\n'+coverageReview.toString()+'\ncoverageReview().catch(e=>{console.error("FAIL privacy_account_coverage_test",e);process.exitCode=1;});',original);

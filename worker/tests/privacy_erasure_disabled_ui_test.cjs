/** Actual script-free handlers, genuine identify-only grants, native SQLite and fixed original status proof.
 * Only the two Discord OAuth HTTP endpoints use the canonical synthetic fixture. No production provider calls.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='async function main(){';
if(source.split(marker).length!==2)throw Error('canonical native setup boundary changed');
async function review(){
 const forms=load('policy-forms'),formCore=load('policy-form-core'),history=load('privacy-access-family-history');
 const first=load('privacy-access-history'),sql=[];
 const paused='Automatic serving-account erasure is temporarily paused while Olympus checks older account records.';
 const sizeCopy='The file states selected fields and omissions. A record that cannot safely fit holds the download and can require attended help from an officer.';
 const scopeDisclosure='<p>This connection asks Discord only to identify your account. A returned token may also permit a guild membership check. This connection uses only your account ID, keeps no Discord token, and does not sign you in to the ordinary website or grant guild or staff roles.</p>';
 const baselineDir=process.env.PRIVACY_UI_BASELINE_DIR;
 function baseline(name){
  if(!baselineDir)return null;
  const module={exports:{}},text=fs.readFileSync(path.join(baselineDir,name+'.ts'),'utf8');
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext('(function(require,module,exports){'+js+'\n})',context,{filename:'immutable-a947-'+name})(q=>{if(!q.startsWith('./'))throw Error('external module refused');return load(q.slice(2));},module,module.exports);
  return module.exports;
 }
 const oldAccess=baseline('privacy-access'),oldForms=baseline('policy-forms');
 const create=()=>{const f=fixture({statement:s=>sql.push(s)});f.env.PRIVACY_ACCESS_ENABLED='true';f.env.PRIVACY_INTAKE_ENABLED='false';f.env.PRIVACY_RETENTION_ENABLED='false';return f;};
 const request=(route,cookie='',method='GET',fields={},more={})=>new Request(BASE+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:BASE,'Content-Type':'application/x-www-form-urlencoded'}:{}),...more},...(method==='POST'?{body:new URLSearchParams(fields)}:{})});
 const call=(f,route,cookie='',method='GET',fields={},more={})=>forms.handlePolicyForms(request(route,cookie,method,fields,more),f.env,route,true);
 const section=(html,route,index=0)=>{const matches=[...html.matchAll(/<form method="post" action="([^"]+)">([\s\S]*?)<\/form>/g)].filter(x=>x[1]===route);assert.ok(matches[index],route+' form '+index+' missing');return matches[index][2];};
 const fields=body=>Object.fromEntries([...body.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(x=>[x[1],x[2]]));
 const normalize=html=>html.replace(/(<input type="hidden" name="csrf" value=")[^"]+("\s*>)/g,'$1[csrf]$2').replace(/(<input type="hidden" name="operationId" value=")[a-f0-9]{32}("\s*>)/g,'$1[operation]$2').replace(/(<code>)[a-f0-9]{32}(<\/code>)/g,'$1[operation]$2');
 const state=f=>JSON.stringify(['site_users','members','privacy_subjects','privacy_serving_jobs','role_settlements','privacy_provider_messages'].map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
 const grants=f=>JSON.stringify(f.db.prepare('SELECT * FROM privacy_access_grants ORDER BY purpose,grant_id').all());
 function safeHtml(name,r,text){ok(name+' script-free response',r.headers.get('Content-Security-Policy').includes("script-src 'none'")&&!/<script\b/i.test(text));ok(name+' response is private no-store with original same-origin referrer policy',/no-store/.test(r.headers.get('Cache-Control'))&&r.headers.get('Referrer-Policy')==='same-origin');}
 function clearPause(name,r,text){eq(name+' status',r.status,503);ok(name+' explains temporary pause',text.includes(paused));ok(name+' gives attended officer help',text.includes('Ask an Olympus officer for attended help.'));ok(name+' preserves account download and existing status entry',text.includes('/privacy/account'));ok(name+' has no erasure submission or reconnect loop',!/<form\b/.test(text)&&!text.includes('href="/privacy/signin"')&&!text.includes('Reopen the form and try again')&&!text.includes('Reconnect Discord for a fresh twelve-minute'));ok(name+' acknowledges only this refused attempt',text.includes('No new erasure request was submitted by this attempt.'));ok(name+' makes no completion claim',!text.includes('records were erased')&&!text.includes('every copy was erased'));safeHtml(name,r,text);}
 let f=create();calls=[];const connection=await connect(f),ordinaryRow={version:7};
 f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied) VALUES(?,?,?,?,?,?)').run(A,f.time(),f.time(),0,ordinaryRow.version,1);
 f.db.prepare('INSERT INTO members(discord_id,banned) VALUES(?,1)').run(A);
 const ordinary=(await core.sessionCookie(f.env,A,ordinaryRow.version,null)).split(';')[0],nonce='n'.repeat(43),cookies=ordinary+'; '+formCore.FORM_COOKIE+'='+nonce;
 const before=state(f),originalGrants=grants(f),onPage=await call(f,'/privacy/access',connection.cookie),onHtml=await onPage.text();
 eq('enabled identify page status',onPage.status,200);safeHtml('enabled identify page',onPage,onHtml);
 eq('enabled identify page keeps export and original erasure forms',[...onHtml.matchAll(/<form method="post" action="([^"]+)"/g)].map(x=>x[1]),['/privacy/access/export','/privacy/access/erasure']);
 ok('enabled copy retains Root size-refusal disclosure',onHtml.includes(sizeCopy));
 ok('enabled erasure original confirmation is present',section(onHtml,'/privacy/access/erasure').includes('name="confirm" value="yes" required'));
 const staleIdentity=fields(section(onHtml,'/privacy/access/erasure'));
 eq('enabled identify HTML includes the exact reviewed scope disclosure once',onHtml.split(scopeDisclosure).length,2);
 if(oldAccess){
  const oldHtml=await (await oldAccess.privacyAccessPage(request('/privacy/access',connection.cookie),f.env)).text();
  const history36='All 36 listed histories have separate downloads: save nextCursor from the file, reconnect Discord, select the same history and paste it below.';
  const history37='All 37 listed histories have separate downloads: save nextCursor from the file, reconnect Discord, select the same history and paste it below.';
  eq('immutable a947 did not contain the new disclosure',oldHtml.includes(scopeDisclosure),false);
  eq('immutable a947 contains the exact original history copy span once',oldHtml.split(history36).length,2);
  eq('immutable a947 has no current history copy span',oldHtml.includes(history37),false);
  eq('current identify HTML contains the exact Task7 history copy span once',onHtml.split(history37).length,2);
  eq('current identify HTML has no original history copy span',onHtml.includes(history36),false);
  eq('enabled identify HTML exactly equals immutable a947 apart from the single reviewed scope disclosure and exact Task7 history copy span',onHtml.replace(scopeDisclosure,''),oldHtml.replace(history36,history37));
 }
 sql.length=0;const accountOn=await call(f,'/privacy/account',cookies),accountOnHtml=await accountOn.text(),onAccountSql=sql.length;
 eq('enabled ordinary page status',accountOn.status,200);safeHtml('enabled ordinary page',accountOn,accountOnHtml);
 eq('enabled ordinary page retains three copy forms',(accountOnHtml.match(/action="\/privacy\/account\/export"/g)||[]).length,3);
 const staleOrdinary=fields(section(accountOnHtml,'/privacy/account/full-erase'));
 ok('enabled ordinary erasure retains original confirmation and operation ID',section(accountOnHtml,'/privacy/account/full-erase').includes('name="confirm" value="erase" required')&&/^[a-f0-9]{32}$/.test(staleOrdinary.operationId));
 ok('enabled pages do not advertise a disabled pause',!onHtml.includes(paused)&&!accountOnHtml.includes(paused));
 if(oldForms){sql.length=0;const originalHtml=await (await oldForms.handlePolicyForms(request('/privacy/account',cookies),f.env,'/privacy/account',true)).text();eq('enabled ordinary HTML equals immutable a947 apart from original random form values',normalize(accountOnHtml),normalize(originalHtml));eq('enabled ordinary renderer adds zero native SQL',onAccountSql,sql.length);}
 const contactOn=await call(f,'/privacy/contact'),contactOnHtml=await contactOn.text();
 ok('enabled contact keeps original erasure invitation',contactOnHtml.includes('download retained records or request serving-account erasure'));
 if(oldForms)eq('enabled replacement contact HTML exactly equals immutable a947',contactOnHtml,await (await oldForms.handlePolicyForms(request('/privacy/contact'),f.env,'/privacy/contact',true)).text());
 eq('enabled page reads do not change account authority or grant custody',state(f)+'|'+grants(f),before+'|'+originalGrants);
 for(const flag of ['false',undefined,'TRUE']){
  if(flag===undefined)delete f.env.PRIVACY_ERASURE_ENABLED;else f.env.PRIVACY_ERASURE_ENABLED=flag;
  sql.length=0;const page=await call(f,'/privacy/access',connection.cookie),html=await page.text();
  eq('disabled '+String(flag)+' identify page status',page.status,200);safeHtml('disabled '+String(flag)+' identify page',page,html);
  eq('disabled '+String(flag)+' page uses original two grant reads',sql.length,2);
  eq('disabled '+String(flag)+' identify offers only own download',[...html.matchAll(/<form method="post" action="([^"]+)"/g)].map(x=>x[1]),['/privacy/access/export']);
  ok('disabled '+String(flag)+' page explains pause and reconnect cannot enable erasure',html.includes(paused)&&html.includes('Reconnecting Discord does not enable erasure.'));
  ok('disabled '+String(flag)+' page offers officer help and existing status',html.includes('Ask an Olympus officer for attended help.')&&html.includes('Check an erasure request with its private status code'));
  ok('disabled '+String(flag)+' page retains corrected size disclosure',html.includes(sizeCopy));
  const exportFields=fields(section(html,'/privacy/access/export')),options=[...section(html,'/privacy/access/export').matchAll(/<option value="([^"]+)"/g)].map(x=>x[1]);
  eq('disabled '+String(flag)+' select retains copy and exact 36 histories',options,['copy',...first.PRIVACY_HISTORY_COLLECTIONS,...history.PRIVACY_FAMILY_HISTORY_COLLECTIONS]);
  eq('disabled '+String(flag)+' copy retains exact original grant/CSRF',exportFields,fields(section(onHtml,'/privacy/access/export')));
  sql.length=0;const r=await call(f,'/privacy/account',cookies),h=await r.text();
  eq('disabled '+String(flag)+' ordinary page uses original current-user reads',sql.length,onAccountSql);safeHtml('disabled '+String(flag)+' ordinary page',r,h);
  eq('disabled '+String(flag)+' ordinary copy forms retained',(h.match(/action="\/privacy\/account\/export"/g)||[]).length,3);
  eq('disabled '+String(flag)+' ordinary status form retained',(h.match(/action="\/privacy\/account\/erasure-status"/g)||[]).length,1);
  ok('disabled '+String(flag)+' ordinary page has no erase/unlink POST forms',!/<form[^>]+action="\/privacy\/account\/(?:full-erase|site-erase|bnet-unlink)"/.test(h));
  ok('disabled '+String(flag)+' ordinary page clearly explains pause',h.includes(paused)&&h.includes('Downloads and checks of existing erasure requests remain available.'));
  for(const method of ['GET','POST']){const r=await call(f,'/privacy/contact','',method),h=await r.text();eq('disabled '+String(flag)+' contact '+method+' original status',r.status,method==='GET'?200:503);ok('disabled '+String(flag)+' contact '+method+' does not invite unavailable erasure',h.includes(paused)&&h.includes('download retained records;')&&!h.includes('or request serving-account erasure'));safeHtml('disabled '+String(flag)+' contact '+method,r,h);}
  eq('disabled '+String(flag)+' page reads preserve all original grants and account authority',state(f)+'|'+grants(f),before+'|'+originalGrants);
 }
 f.env.PRIVACY_ERASURE_ENABLED='false';
 for(const collection of ['copy',...first.PRIVACY_HISTORY_COLLECTIONS,...history.PRIVACY_FAMILY_HISTORY_COLLECTIONS]){
  const action=await access.privacyAccessExportFormAction(request('/privacy/access/export',connection.cookie,'POST',{...fields(section(onHtml,'/privacy/access/export')),collection}),f.env);
  eq('disabled original form parser retains collection '+collection,action.collection,collection);
  eq('disabled collection '+collection+' retains genuine original grant',action.grant.grantId,fields(section(onHtml,'/privacy/access/export')).grant);
 }
 calls=[];sql.length=0;let r=await call(f,'/privacy/access/erasure',connection.cookie,'POST',{...staleIdentity,confirm:'yes'}),h=await r.text();clearPause('stale enabled identify erasure form',r,h);
 eq('disabled identify erasure refusal performs zero native SQL',sql.length,0);eq('disabled identify erasure refusal changes no original credential/account state',state(f)+'|'+grants(f),before+'|'+originalGrants);
 sql.length=0;r=await call(f,'/privacy/account/full-erase',cookies,'POST',{...staleOrdinary,confirm:'erase'});h=await r.text();clearPause('stale enabled ordinary erasure form',r,h);
 eq('disabled ordinary erasure refusal performs zero native SQL',sql.length,0);eq('disabled ordinary erasure refusal changes no original credential/account state',state(f)+'|'+grants(f),before+'|'+originalGrants);
 sql.length=0;r=await authority.requestServingErasure(f.env,request('/api/me/erasure',ordinary,'POST',{}, {'X-Olympus':core.PAGE_VERSION}),'f'.repeat(32));eq('disabled ordinary native admission remains original feature-disabled guard',await r.json(),{error:'feature_disabled'});eq('disabled ordinary native guard performs zero SQL',sql.length,0);
 sql.length=0;r=await call(f,'/privacy/access/export',connection.cookie,'POST',{...fields(section(onHtml,'/privacy/access/export')),collection:'copy'});const data=await r.json();
 eq('disabled genuine identity aggregate download succeeds',r.status,200);eq('disabled aggregate retains exact 37 coverage histories',Object.keys(data.coverage.histories).sort(),[...first.PRIVACY_HISTORY_COLLECTIONS,...history.PRIVACY_FAMILY_HISTORY_COLLECTIONS].sort());eq('disabled aggregate has only the 37 source-qualified histories',Object.keys(data.coverage.histories).length,37);
 eq('disabled aggregate costs exact88 attempts including two shared-publication queries',sql.length,88);eq('disabled aggregate preserves account authority and role/provider custody',state(f),before);
 eq('disabled aggregate consumes only original own-export grant',JSON.parse(JSON.stringify(f.db.prepare('SELECT purpose,consumed_at IS NOT NULL AS spent FROM privacy_access_grants ORDER BY purpose').all())),[{purpose:'own_erasure',spent:0},{purpose:'own_export',spent:1}]);
 r=await call(f,'/privacy/access',connection.cookie);h=await r.text();ok('spent disabled page does not replace download with unavailable erasure form',!/<form\b/.test(h)&&h.includes('fresh download grant')&&h.includes(paused));
 const second=await connect(f),secondForm=await form(f,second);calls=[];sql.length=0;r=await call(f,'/privacy/access/export',second.cookie,'POST',{csrf:secondForm.csrf,grant:secondForm.grant,collection:'site.votes'});const page=await r.json();
 eq('disabled genuine selected history download succeeds',r.status,200);eq('disabled selected history matches selected collection',page.history.collection,'site.votes');eq('disabled selected history retains 8-attempt bound',sql.length,8);eq('disabled selected history changes no account authority',state(f),before);
 const ordinaryCopy=fields(section(accountOnHtml,'/privacy/account/export',0));r=await call(f,'/privacy/account/export',cookies,'POST',{...ordinaryCopy,mode:'download'});const oldSessionCopy=await r.json();
 eq('disabled original ordinary curated download succeeds',r.status,200);ok('disabled ordinary download remains own scoped',JSON.stringify(oldSessionCopy).includes(A)&&!JSON.stringify(oldSessionCopy).includes(B));eq('disabled ordinary download creates no erasure or role custody',state(f),before);
 eq('all download/refusal paths issue no provider call',calls.length,0);
 eq('privacy credential is never an ordinary website session',await core.readSession(f.env,request('/api/me',connection.cookie)),null);
 f.db.close();
 f=create();f.env.PRIVACY_ERASURE_ENABLED='false';calls=[];const freshOff=await connect(f);
 eq('disabled genuine callback retains exactly two identify endpoints',calls.length,2);ok('disabled OAuth performs no membership or role endpoint',calls.every(x=>!x.url.includes('/guilds/')));
 eq('disabled genuine callback preserves original two-purpose admission',JSON.parse(JSON.stringify(f.db.prepare('SELECT purpose,expires_at-created_at AS ttl FROM privacy_access_grants ORDER BY purpose').all())),[{purpose:'own_erasure',ttl:720},{purpose:'own_export',ttl:720}]);
 eq('disabled callback creates no ordinary account/subject/job/role custody',[count(f,'site_users'),count(f,'members'),count(f,'privacy_subjects'),count(f,'privacy_serving_jobs'),count(f,'role_settlements')],[0,0,0,0,0]);
 r=await call(f,'/privacy/access',freshOff.cookie);h=await r.text();ok('fresh disabled callback lands on operative download form without erase form',h.includes('action="/privacy/access/export"')&&!h.includes('action="/privacy/access/erasure"'));
 f.db.close();
 f=create();const statusConnection=await connect(f),statusForm=await form(f,statusConnection,'own_erasure');calls=[];
 r=await call(f,'/privacy/access/erasure',statusConnection.cookie,'POST',{csrf:statusForm.csrf,grant:statusForm.grant,confirm:'yes'});h=await r.text();
 eq('enabled native admission creates a genuine retained status receipt',r.status,202);eq('enabled native admission creates exactly one original erasure job',count(f,'privacy_serving_jobs'),1);
 const job=f.db.prepare('SELECT * FROM privacy_serving_jobs').get(),token=/<pre>([^<]+)<\/pre>/.exec(h)[1],statusBefore=state(f);
 f.env.PRIVACY_ERASURE_ENABLED='false';const statusGet=await call(f,'/privacy/account'),statusHtml=await statusGet.text(),statusCookie=statusGet.headers.get('Set-Cookie').split(';')[0],statusFields=fields(section(statusHtml,'/privacy/account/erasure-status'));
 ok('disabled signed-out ordinary page exposes retained private-code status form',statusHtml.includes(paused)&&statusHtml.includes('action="/privacy/account/erasure-status"')&&!statusHtml.includes('action="/privacy/account/full-erase"'));
 sql.length=0;r=await call(f,'/privacy/account/erasure-status',statusCookie,'POST',{...statusFields,operationId:job.operation_id,statusToken:token});h=await r.text();
 eq('disabled status reads genuine original body-only proof without session',r.status,200);ok('disabled status truthfully reports queued or held rather than completion',h.includes('The request is queued or held; account erasure is not complete.')&&!h.includes('Serving account records were erased'));
 ok('disabled status retains original request and body-only private token',h.includes(job.operation_id)&&h.includes('<pre>'+token+'</pre>')&&!r.url.includes(token));
 eq('disabled status leaves original request and provider/role state unchanged',state(f),statusBefore);eq('disabled status leaves original fixed retention deadline unchanged',f.db.prepare('SELECT retain_until FROM privacy_serving_jobs').get().retain_until,job.retain_until);
 eq('disabled status query retains original two-attempt bound',sql.length,2);eq('enabled queued admission and disabled status make no provider calls',calls.length,0);
 const pieces=token.split('.'),signature=pieces[1];const invalidToken=pieces[0]+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1);ok('invalid status fixture changes decoded MAC bytes',!Buffer.from(signature,'base64url').equals(Buffer.from(invalidToken.split('.')[1],'base64url')));r=await call(f,'/privacy/account/erasure-status',statusCookie,'POST',{...statusFields,operationId:job.operation_id,statusToken:invalidToken});h=await r.text();eq('disabled status retains original invalid proof refusal',r.status,503);ok('disabled invalid status proof never reports completion',h.includes('The service could not confirm this request.')&&!h.includes('Serving account records were erased'));
 r=await call(f,'/privacy/access','', 'GET',{},{});h=await r.text();ok('disabled signed-out identify page clearly explains pause and still links identify entry',h.includes(paused)&&h.includes('href="/privacy/signin"')&&!h.includes('action="/privacy/access/erasure"'));
 const offEnv={...f.env,PRIVACY_ACCESS_ENABLED:'false'},offAccess=await forms.handlePolicyForms(request('/privacy/access'),offEnv,'/privacy/access',true);eq('access feature OFF original route refusal is unchanged',offAccess.status,503);
 f.db.close();provider=null;console.log(`privacy_erasure_disabled_ui_test: ${checks} checks PASS`);
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error('FAIL privacy_erasure_disabled_ui_test',e.stack);process.exitCode=1;});`,original);

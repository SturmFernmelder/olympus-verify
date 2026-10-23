/** Actual script-free handlers, genuine identify-only grants, native SQLite and fixed original status proof.
 * Only the two Discord OAuth HTTP endpoints use the canonical synthetic fixture. No production provider calls.
 */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.resolve(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='async function main(){';
if(source.split(marker).length!==2)throw Error('canonical native setup boundary changed');
async function review(){
 await require('./privacy_registered196_families.cjs').run(root);
 const forms=load('policy-forms'),formCore=load('policy-form-core'),history=load('privacy-access-family-history');
 const first=load('privacy-access-history'),sql=[];
 const paused='Automatic serving-account erasure is temporarily paused while Olympus checks older account records.';
 const sizeCopy='The file states selected fields and omissions. A record that cannot safely fit holds the download and can require attended help from an officer.';
 const historyCurrent='The account copy previews 38 selected histories. There are 41 individual history download options. The three extra histories are fresh historical Battle.net character labels, roster processing intents attributable to your original account link, and current setting keys/times while you remain their last updater. Those three are not in the account-copy file. The Battle.net connector stays off. Roster rows missing the original linkage require attended review; processing records do not confirm provider success. Settings values and edit history are not included. To continue a history, save nextCursor from its file, reconnect Discord, select the same history and paste it below.';
 const scopeDisclosure='<p>This connection asks Discord only to identify your account. A returned token may also permit reading linked accounts or guild membership, or updating this app&#39;s connection metadata. This privacy connection uses none of those permissions: it uses only your account ID, keeps no Discord token, and does not sign you in to the ordinary website or grant guild or staff roles.</p>';
 const baselineDir=process.env.PRIVACY_UI_BASELINE_DIR;
 function baseline(name){
  if(!baselineDir)return null;
  const module={exports:{}},text=fs.readFileSync(path.join(baselineDir,name+'.ts'),'utf8');
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext('(function(require,module,exports){'+js+'\n})',context,{filename:'immutable-a947-'+name})(q=>{if(!q.startsWith('./'))throw Error('external module refused');return load(q.slice(2));},module,module.exports);
  return module.exports;
 }
 const oldAccess=baseline('privacy-access'),oldForms=baseline('policy-forms');
 const coverageHtml=load('privacy-account-coverage').accountDataCoverageHtml();
 const ordinaryCoverageHtml=load('privacy-account-coverage').accountDataCoverageHtml(true,'ordinary');
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
 let f=create();calls=[];const ordinaryRow={version:7};
 await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied) VALUES(?,?,?,?,?,?)',A,f.time(),f.time(),1,ordinaryRow.version,0);
 await fixtureWrite(f,'INSERT INTO members(discord_id,banned) VALUES(?,1)',A);
 const ordinary=await issueFixtureCookie(f);await fixtureWrite(f,'UPDATE site_users SET in_server=0,denied=1 WHERE discord_id=?',A);const connection=await connect(f),nonce='n'.repeat(43),cookies=ordinary+'; '+formCore.FORM_COOKIE+'='+nonce;
 const before=state(f),originalGrants=grants(f),onPage=await call(f,'/privacy/access',connection.cookie),onHtml=await onPage.text();
 eq('enabled identify page status',onPage.status,200);safeHtml('enabled identify page',onPage,onHtml);
 eq('enabled identify page keeps export and original erasure forms',[...onHtml.matchAll(/<form method="post" action="([^"]+)"/g)].map(x=>x[1]),['/privacy/access/export','/privacy/access/erasure']);
 ok('enabled copy retains Root size-refusal disclosure',onHtml.includes(sizeCopy));
 eq('enabled identify has exact38 aggregate and40 separate disclosure once',onHtml.split(historyCurrent).length,2);
 ok('enabled erasure original confirmation is present',section(onHtml,'/privacy/access/erasure').includes('name="confirm" value="yes" required'));
 const staleIdentity=fields(section(onHtml,'/privacy/access/erasure'));
 eq('enabled identify HTML includes the exact reviewed scope disclosure once',onHtml.split(scopeDisclosure).length,2);
 if(oldAccess){
  const oldHtml=await (await oldAccess.privacyAccessPage(request('/privacy/access',connection.cookie),f.env)).text();
  const history36='All 36 listed histories have separate downloads: save nextCursor from the file, reconnect Discord, select the same history and paste it below.';
  const history37=historyCurrent; // Finite original36 -> current38aggregate/41individual text transform; option source already imports current ALL.
  eq('immutable a947 did not contain the new disclosure',oldHtml.includes(scopeDisclosure),false);
  eq('immutable a947 contains the exact original history copy span once',oldHtml.split(history36).length,2);
  eq('immutable a947 has no current history copy span',oldHtml.includes(history37),false);
  eq('current identify HTML contains exact reviewed38aggregate/41individual history copy span once',onHtml.split(history37).length,2);
  eq('current identify HTML has no original history copy span',onHtml.includes(history36),false);
  eq('enabled identify HTML contains exact reviewed coverage section once',onHtml.split(coverageHtml).length,2);
  eq('immutable identify HTML contains no new coverage section',oldHtml.includes(coverageHtml),false);
  eq('enabled identify HTML exactly equals immutable a947 apart from reviewed scope disclosure, exact38aggregate/41individual history span and exact69-store coverage section',onHtml.replace(coverageHtml,'').replace(scopeDisclosure,''),oldHtml.replace(history36,history37));
 }
 sql.length=0;const accountOn=await call(f,'/privacy/account',cookies),accountOnHtml=await accountOn.text(),onAccountSql=sql.length;
 eq('enabled ordinary page status',accountOn.status,200);safeHtml('enabled ordinary page',accountOn,accountOnHtml);
 eq('enabled ordinary page retains three copy forms',(accountOnHtml.match(/action="\/privacy\/account\/export"/g)||[]).length,3);
 ok('ordinary page offers direct task anchors without a submission or query credential',accountOnHtml.includes('aria-label="Account data tasks"')&&accountOnHtml.includes('href="#account-downloads"')&&accountOnHtml.includes('id="account-downloads"')&&accountOnHtml.includes('href="#erasure-status"')&&accountOnHtml.includes('id="erasure-status"')&&accountOnHtml.includes('href="#account-erasure"')&&accountOnHtml.includes('id="account-erasure"'));
 ok('connection capabilities remain present in a closed script-free disclosure',onHtml.includes('<details class="privacy-connection-scope"><summary>About this Discord connection</summary>'+scopeDisclosure+'</details>'));
 const staleOrdinary=fields(section(accountOnHtml,'/privacy/account/full-erase'));
 ok('enabled ordinary erasure retains original confirmation and operation ID',section(accountOnHtml,'/privacy/account/full-erase').includes('name="confirm" value="erase" required')&&/^[a-f0-9]{32}$/.test(staleOrdinary.operationId));
 ok('enabled pages do not advertise a disabled pause',!onHtml.includes(paused)&&!accountOnHtml.includes(paused));
 if(oldForms){sql.length=0;const originalHtml=await (await oldForms.handlePolicyForms(request('/privacy/account',cookies),f.env,'/privacy/account',true)).text();eq('enabled ordinary contains exact reviewed coverage section once',accountOnHtml.split(ordinaryCoverageHtml).length,2);eq('immutable ordinary contains no new coverage section',originalHtml.includes(ordinaryCoverageHtml),false);eq('enabled ordinary HTML equals immutable a947 apart from exact69-store coverage section and original random form values',normalize(accountOnHtml.replace(ordinaryCoverageHtml,'')),normalize(originalHtml));eq('enabled ordinary renderer adds zero native SQL',onAccountSql,sql.length);}
 const contactOn=await call(f,'/privacy/contact'),contactOnHtml=await contactOn.text();
 ok('enabled contact keeps original erasure invitation',contactOnHtml.includes('download retained records or request serving-account erasure'));
 if(oldForms)eq('enabled replacement contact HTML exactly equals immutable a947',contactOnHtml,await (await oldForms.handlePolicyForms(request('/privacy/contact'),f.env,'/privacy/contact',true)).text());
 eq('enabled page reads do not change account authority or grant custody',state(f)+'|'+grants(f),before+'|'+originalGrants);
 for(const flag of ['false',undefined,'TRUE']){
  if(flag===undefined)delete f.env.PRIVACY_ERASURE_ENABLED;else f.env.PRIVACY_ERASURE_ENABLED=flag;
  sql.length=0;const page=await call(f,'/privacy/access',connection.cookie),html=await page.text();
  eq('disabled '+String(flag)+' identify page status',page.status,200);safeHtml('disabled '+String(flag)+' identify page',page,html);
  eq('disabled '+String(flag)+' page keeps two grant reads with their Native profile proofs',sql.length,4);
  eq('disabled '+String(flag)+' identify offers only own download',[...html.matchAll(/<form method="post" action="([^"]+)"/g)].map(x=>x[1]),['/privacy/access/export']);
  ok('disabled '+String(flag)+' page explains pause and reconnect cannot enable erasure',html.includes(paused)&&html.includes('Reconnecting Discord does not enable erasure.'));
  ok('disabled '+String(flag)+' page offers officer help and existing status',html.includes('Ask an Olympus officer for attended help.')&&html.includes('Check an erasure request with its private status code'));
  ok('disabled '+String(flag)+' page retains corrected size disclosure',html.includes(sizeCopy));
  const exportFields=fields(section(html,'/privacy/access/export')),options=[...section(html,'/privacy/access/export').matchAll(/<option value="([^"]+)"/g)].map(x=>x[1]);
  eq('disabled '+String(flag)+' select retains copy and exact41 individual histories',options,['copy',...first.PRIVACY_ALL_HISTORY_COLLECTIONS]);
  eq('disabled '+String(flag)+' exact42 select options include copy plus41 individual histories',options.length,42);
  eq('disabled '+String(flag)+' exact38aggregate/41individual disclosure once',html.split(historyCurrent).length,2);
  eq('disabled '+String(flag)+' copy retains exact original grant/CSRF',exportFields,fields(section(onHtml,'/privacy/access/export')));
  sql.length=0;const r=await call(f,'/privacy/account',cookies),h=await r.text();
  eq('disabled '+String(flag)+' ordinary page uses original current-user reads',sql.length,onAccountSql);safeHtml('disabled '+String(flag)+' ordinary page',r,h);
  eq('disabled '+String(flag)+' ordinary coverage uses exact unavailable-lifecycle scope once',h.split(load('privacy-account-coverage').accountDataCoverageHtml(false,'ordinary')).length,2);
  eq('disabled '+String(flag)+' ordinary copy forms retained',(h.match(/action="\/privacy\/account\/export"/g)||[]).length,3);
  eq('disabled '+String(flag)+' ordinary status form retained',(h.match(/action="\/privacy\/account\/erasure-status"/g)||[]).length,1);
  ok('disabled '+String(flag)+' ordinary page has no erase/unlink POST forms',!/<form[^>]+action="\/privacy\/account\/(?:full-erase|site-erase|bnet-unlink)"/.test(h));
  ok('disabled '+String(flag)+' ordinary page clearly explains pause',h.includes(paused)&&h.includes('Downloads and checks of existing erasure requests remain available.'));
  for(const method of ['GET','POST']){const r=await call(f,'/privacy/contact','',method),h=await r.text();eq('disabled '+String(flag)+' contact '+method+' original status',r.status,method==='GET'?200:503);ok('disabled '+String(flag)+' contact '+method+' does not invite unavailable erasure',h.includes(paused)&&h.includes('download retained records;')&&!h.includes('or request serving-account erasure'));safeHtml('disabled '+String(flag)+' contact '+method,r,h);}
  eq('disabled '+String(flag)+' page reads preserve all original grants and account authority',state(f)+'|'+grants(f),before+'|'+originalGrants);
 }
 f.env.PRIVACY_ERASURE_ENABLED='false';
 for(const collection of ['copy',...first.PRIVACY_ALL_HISTORY_COLLECTIONS]){
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
 eq('disabled genuine identity aggregate download succeeds',r.status,200);eq('disabled aggregate retains exact 38 coverage histories',Object.keys(data.coverage.histories).sort(),[...first.PRIVACY_HISTORY_COLLECTIONS,...history.PRIVACY_FAMILY_HISTORY_COLLECTIONS].sort());eq('disabled aggregate has only the 38 source-qualified histories',Object.keys(data.coverage.histories).length,38);
 eq('disabled aggregate costs original97 plus1 packed own metadata read',sql.length,98);ok('disabled aggregate actual physical attempts stay strictly below100',sql.length<100);eq('disabled aggregate preserves account authority and role/provider custody',state(f),before);
 eq('disabled aggregate consumes only original own-export grant',JSON.parse(JSON.stringify(f.db.prepare('SELECT purpose,consumed_at IS NOT NULL AS spent FROM privacy_access_grants ORDER BY purpose').all())),[{purpose:'own_erasure',spent:0},{purpose:'own_export',spent:1}]);
 r=await call(f,'/privacy/access',connection.cookie);h=await r.text();ok('spent disabled page does not replace download with unavailable erasure form',!/<form\b/.test(h)&&h.includes('fresh download grant')&&h.includes(paused));
 const second=await connect(f),secondForm=await form(f,second);calls=[];sql.length=0;r=await call(f,'/privacy/access/export',second.cookie,'POST',{csrf:secondForm.csrf,grant:secondForm.grant,collection:'site.votes'});const page=await r.json();
 eq('disabled genuine selected history download succeeds',r.status,200);eq('disabled selected history matches selected collection',page.history.collection,'site.votes');eq('disabled selected history retains 13-physical-attempt bound',sql.length,13);eq('disabled selected history changes no account authority',state(f),before);
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
 // The current private code is minted only by a genuine original managed entry.
 // Reuse the existing Native/DO adapter; no row-to-code formatter or copied receipt is introduced.
 const H=require('./privacy_serving_production_origin_test.cjs'),managed=await H.setup();
 try{
  Object.assign(managed.env,{SITE_HOST:'olympus.roachcouncil.com',PUBLIC_BASE_URL:'https://verify.example',COOKIE_SECRET:'test-only-managed-ui-cookie',DISCORD_APP_ID:'44444444444444444',DISCORD_CLIENT_SECRET:'test-only-managed-identify-client',GUILD_ID:'55555555555555555',SITE_GUILD_ID:'55555555555555555',ROLE_GUILD_MEMBER:'66666666666666666',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_INTAKE_ENABLED:'false',PRIVACY_RETENTION_ENABLED:'false',PRIVACY_ERASURE_ENABLED:'true'});
  const actualIndex=H.load('index').default,currentForms=H.load('policy-forms'),account={db:managed.d.db};
  let providerAttempts=0;
  H.providerFetch(async(input,init)=>{providerAttempts++;const original=input instanceof Request?input:new Request(input,init),url=original.url;
   assert.equal(original.redirect,'manual');
   if(url==='https://discord.com/api/oauth2/token'){assert.equal(original.method,'POST');return new Response(JSON.stringify({access_token:'test-only-managed-identify-token',token_type:'Bearer',scope:'identify'}));}
   if(url==='https://discord.com/api/v10/users/@me'){assert.equal(original.method,'GET');assert.equal(original.headers.get('Authorization'),'Bearer test-only-managed-identify-token');return new Response(JSON.stringify({id:A,username:'ignored-managed-name'}));}
   throw Error('unexpected managed privacy UI provider endpoint');
  });
  const actualCall=(route,cookie='',method='GET',values={},more={})=>actualIndex.fetch(request(route,cookie,method,values,more),managed.env,{waitUntil(p){managed.pending.push(p);}});
  const begin=await actualCall('/privacy/signin'),authorize=new URL(begin.headers.get('Location')),flow=begin.headers.get('Set-Cookie').split(';')[0];
  const callback=await actualCall('/privacy/callback?state='+authorize.searchParams.get('state')+'&code=original_ui_fixture_code&iss=https%3A%2F%2Fdiscord.com',flow);
  if(callback.status!==303)console.log('MANAGED_UI_CALLBACK_DIAGNOSTIC',callback.status,await callback.clone().text(),providerAttempts);eq('managed status genuine identify callback303',callback.status,303);const statusConnectionCookie=callback.headers.get('Set-Cookie').split(', ').find(v=>v.startsWith(access.PRIVACY_ACCESS_COOKIE+'=')).split(';')[0];
  const statusPage=await actualCall('/privacy/access',statusConnectionCookie),statusForm=fields(section(await statusPage.text(),'/privacy/access/erasure'));providerAttempts=0;
  r=await actualCall('/privacy/access/erasure',statusConnectionCookie,'POST',{...statusForm,confirm:'yes'});h=await r.text();
  eq('enabled native admission creates a genuine retained status receipt',r.status,202);eq('enabled native admission creates exactly one original erasure job',count(account,'privacy_serving_jobs'),1);
  const job=managed.d.db.prepare('SELECT * FROM privacy_serving_jobs').get(),tokenMatch=/<pre class="privacy-status-code">([^<]+)<\/pre>/.exec(h);ok('actual original managed admission issues a body-only private code',!!tokenMatch);const token=tokenMatch[1],statusBefore=state(account);
  managed.env.PRIVACY_ERASURE_ENABLED='false';const statusGet=await actualCall('/privacy/account'),statusHtml=await statusGet.text(),statusCookie=statusGet.headers.get('Set-Cookie').split(';')[0],statusFields=fields(section(statusHtml,'/privacy/account/erasure-status'));
  ok('disabled signed-out ordinary page exposes retained private-code status form',statusHtml.includes(paused)&&statusHtml.includes('action="/privacy/account/erasure-status"')&&!statusHtml.includes('action="/privacy/account/full-erase"'));
  const beforeStatus=managed.d.trace.length;r=await actualCall('/privacy/account/erasure-status',statusCookie,'POST',{...statusFields,operationId:job.operation_id,statusToken:token});h=await r.text();
  eq('disabled status reads genuine original body-only proof without session',r.status,200);ok('disabled status truthfully reports queued or held rather than completion',h.includes('The request is queued or held; independent confirmation of account erasure is not available.')&&!h.includes('Serving account records were erased'));
  ok('disabled status retains original request and body-only private token',h.includes(job.operation_id)&&h.includes('<pre class="privacy-status-code">'+token+'</pre>')&&!r.url.includes(token));
  eq('disabled status leaves original request and provider/role state unchanged',state(account),statusBefore);eq('disabled status leaves original fixed retention deadline unchanged',managed.d.db.prepare('SELECT retain_until FROM privacy_serving_jobs').get().retain_until,job.retain_until);
  const statusSQL=managed.d.trace.slice(beforeStatus).map(row=>row.sql);eq('disabled status retains two original payload reads besides Native profile proofs',statusSQL.filter(sql=>sql.startsWith('SELECT state,hold_reason,staff_access,request_digest')||sql.startsWith('SELECT COALESCE(SUM(m.state')).length,2);ok('disabled status performs no D1 mutation',statusSQL.every(sql=>/^\s*(SELECT|WITH)\b/i.test(sql)));eq('enabled queued admission and disabled status make no provider calls',providerAttempts,0);
  console.log('MEASURED_DISABLED_STATUS_NATIVE '+JSON.stringify({physicalStatements:statusSQL.length,originalPayloadReads:2,syntheticManagedOpen:true,currentCompletionClaim:false,providerCalls:providerAttempts}));
  const pieces=token.split('.'),signature=pieces[1],invalidToken=pieces[0]+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1);ok('invalid status fixture changes decoded MAC bytes',!Buffer.from(signature,'base64url').equals(Buffer.from(invalidToken.split('.')[1],'base64url')));r=await actualCall('/privacy/account/erasure-status',statusCookie,'POST',{...statusFields,operationId:job.operation_id,statusToken:invalidToken});h=await r.text();eq('disabled status retains original invalid proof refusal',r.status,503);ok('disabled invalid status proof never reports completion',h.includes('The service could not confirm this request.')&&!h.includes('Serving account records were erased'));
  r=await actualCall('/privacy/access');h=await r.text();ok('disabled signed-out identify page clearly explains pause and still links identify entry',h.includes(paused)&&h.includes('href="/privacy/signin"')&&!h.includes('action="/privacy/access/erasure"'));
  const offEnv={...managed.env,PRIVACY_ACCESS_ENABLED:'false'},offAccess=await actualIndex.fetch(request('/privacy/access'),offEnv,{waitUntil(p){managed.pending.push(p);}});eq('access feature OFF original route refusal is unchanged',offAccess.status,503);
 }finally{H.providerFetch(null);await Promise.allSettled(managed.pending);managed.close();}
 provider=null;console.log(`privacy_erasure_disabled_ui_test: ${checks} checks PASS`);
}
const mod=new Module(original);mod.filename=original;mod.paths=Module._nodeModulePaths(path.dirname(original));
mod._compile(source.slice(0,source.indexOf(marker))+`\n(${review.toString()})().catch(e=>{console.error('FAIL privacy_erasure_disabled_ui_test',e.stack);process.exitCode=1;});`,original);

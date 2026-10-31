// Real source, native SQLite, WebCrypto and bounded identify-only OAuth. Only Discord HTTP is faked.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=new Map(),entry=require('./helpers/privacy129_fixture.cjs');let checks=0,calls=[],provider;
const ok=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
const eq=(name,value,want)=>{assert.deepEqual(value,want,name);checks++;console.log('PASS '+name);};
const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,ReadableStream,ReadableStreamDefaultReader,console,Request,Response,Headers,URL,URLSearchParams,atob,btoa,AbortController,AbortSignal,setTimeout,clearTimeout,
 fetch:async(url,init)=>{calls.push({url:String(url),init});if(!provider)throw Error('network forbidden');return provider(String(url),init);}});
// Cache only immutable compiler output; a cleared module cache still reads source and executes fresh modules.
// Keys include exact raw bytes, module name and the actual compiler options. No exports, VM or authority is cached.
const transpiledSourceCache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name).exports;
 const module={exports:{}};cache.set(name,module);
 const sourceBytes=fs.readFileSync(path.join(root,'src',name+'.ts'));
 const source=sourceBytes.toString('utf8');
 const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022};
 const compileKey=JSON.stringify([name,sourceBytes.toString('base64'),compilerOptions]);
 let js;
 if(transpiledSourceCache.has(compileKey))js=transpiledSourceCache.get(compileKey);
 else{
  js=ts.transpileModule(source,{compilerOptions}).outputText;
  transpiledSourceCache.set(compileKey,js);
 }
 vm.runInContext('(function(require,module,exports){'+js+'\n})',context,{filename:name})(q=>{if(q==='node:async_hooks')return require(q);if(!q.startsWith('./'))throw Error('external module refused');return load(q.slice(2));},module,module.exports);
 return module.exports;
}
function d1(db,hooks={}){
 const exec=(sql,values)=>{hooks.statement?.(sql,values);const s=db.prepare(sql);
  if(/^\s*(SELECT|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql))return {success:true,meta:{changes:Number(db.prepare('SELECT changes() AS n').get().n)},results:s.all(...values)};
  const r=s.run(...values);return {success:true,meta:{changes:Number(r.changes)},results:[]};};
 const prepare=sql=>{let values=[];const statement={sql,bind(...v){if(v.some(x=>x===undefined)||v.length>100)throw Error('binding refused');values=v;return statement;},
  async first(){hooks.beforeRead?.(sql,values);const r=exec(sql,values).results[0]??null;hooks.afterRead?.(sql,values,r);return r;},async all(){return exec(sql,values);},async run(){return exec(sql,values);},_exec:()=>exec(sql,values)};return statement;};
 return {prepare,async batch(statements){hooks.beforeBatch?.(statements);db.exec('BEGIN');try{const rows=statements.map((s,i)=>{hooks.step?.(i,s.sql);return s._exec();});db.exec('COMMIT');hooks.afterBatch?.(statements);return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
const access=load('privacy-access'),ddl=load('privacy-access-schema'),authority=load('privacy-serving-authority'),serving=load('privacy-serving-schema');
const copy=load('privacy-access-export'),erase=load('privacy-access-erasure'),core=load('site-core');
const A='11111111111111111',B='22222222222222222',STAFF='33333333333333333',G='a'.repeat(32),BASE='https://olympus.roachcouncil.com';
function fixture(hooks={}){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 let now=Math.floor(Date.now()/1000);db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(now);});
 // Real initial fixture rows are seeded before the exact current epoch is installed.
 const installer=require('./../scripts/install-rejection-provenance-epoch.cjs'),profile=installer.manifest.canonical;
 for(const table of profile.tables)db.exec(table.sql);for(const index of profile.indexes)db.exec(index.sql);db.exec(profile.slotSQL);
 db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)").run();
 db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)").run(now);
 let installed=false,installation;const ensureInstalled=()=>{if(!installed){installation=installer.installFixtureEpoch(db,'canonical',entry.ENTRY_EPOCH);installed=true;}return installation;};
 const transportHooks={statement(...args){ensureInstalled();return hooks.statement?.(...args);},beforeRead:(...args)=>hooks.beforeRead?.(...args),afterRead:(...args)=>hooks.afterRead?.(...args),step:(...args)=>hooks.step?.(...args),async beforeBatch(plan){ensureInstalled();await hooks.beforeBatch?.(plan);},async afterBatch(...args){await hooks.afterBatch?.(...args);}};
 const native=entry.originalNativePort(db,transportHooks),nativeEnv=entry.currentEntryEnvironment({DB:native,COOKIE_SECRET:'test-only-privacy-cookie-key',DISCORD_APP_ID:'44444444444444444',DISCORD_CLIENT_SECRET:'test-only-oauth-client',SITE_HOST:'olympus.roachcouncil.com',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:'55555555555555555',GUILD_ID:'55555555555555555',ROLE_GUILD_MEMBER:'66666666666666666'});
 const env={...nativeEnv,PRIVACY_ERASURE_ENABLED:'true',DB:load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH)};
 return {db,env,native,nativeEnv,hooks,ready:ensureInstalled,installed:()=>installed,time:()=>now,advance:n=>now+=n,setTime:n=>now=n};}
function fixtureWrite(f,sql,...values){return f.installed()?f.env.DB.prepare(sql).bind(...values).run():f.db.prepare(sql).run(...values);}
function subject(f,state='active'){return fixtureWrite(f,'INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until) VALUES(?,?,?,?,?,?,?,?)',A,G,state,3,f.time(),f.time(),state==='retired'?f.time():null,state==='retired'?f.time()+366*86400:null);}
async function issueFixtureCookie(f,id=A){f.ready();return (await entry.issueOriginalEntryCookie(load,f.db,f.nativeEnv,id)).cookie;}
// A schema snapshot seals test setup before any source operation, so later no-DDL checks measure runtime only.
const count=(f,table)=>{if(table==='sqlite_master')f.ready();return f.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;};
function oauthProvider(id=A,scope='identify'){provider=(url,init)=>{
 if(url==='https://discord.com/api/oauth2/token'){assert.equal(init.redirect,'manual');assert.equal(init.method,'POST');eq('provider callback is allowlisted',init.body.get('redirect_uri'),BASE+'/privacy/callback');return new Response(JSON.stringify({access_token:'test-access-token',token_type:'Bearer',scope}));}
 if(url==='https://discord.com/api/v10/users/@me'){assert.equal(init.redirect,'manual');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-access-token');return new Response(JSON.stringify({id,username:'ignored-new-name'}));}
 throw Error('unexpected provider endpoint '+url);};}
async function start(f){const page=await access.privacyAccessPage(new Request(BASE+'/privacy/access'),f.env),html=await page.text(),section=/<form method="post" action="\/privacy\/signin">([\s\S]*?)<\/form>/.exec(html);assert.ok(section,'actual privacy initiation form');
 const csrf=/name="csrf" value="([^"]+)"/.exec(section[1])[1],cookie=page.headers.get('Set-Cookie').split(';')[0];
 const r=await access.beginPrivacyAccess(new Request(BASE+'/privacy/signin',{method:'POST',headers:{Cookie:cookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':access.privacyAccessRandomId()},body:new URLSearchParams({csrf})}),f.env);const u=new URL(r.headers.get('Location'));
 eq('OAuth scope is identify only',u.searchParams.get('scope'),'identify');eq('OAuth uses registered privacy callback',u.searchParams.get('redirect_uri'),BASE+'/privacy/callback');
 eq('OAuth still requests active consent',u.searchParams.get('prompt'),'consent');
 return {state:u.searchParams.get('state'),flowCookie:r.headers.get('Set-Cookie').split(';')[0]};}
async function finish(f,flow){return access.finishPrivacyAccess(new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:flow.flowCookie}}),f.env);}
async function connect(f,id=A,scope='identify'){oauthProvider(id,scope);const flow=await start(f),r=await finish(f,flow);eq('callback redirects privacy lane',r.headers.get('Location'),'/privacy/access');const cs=r.headers.get('Set-Cookie');ok('callback never issues ordinary cookie',!/(?:^|, )__Host-olg=/.test(cs));return {flow,cookie:cs.split(', ').find(x=>x.startsWith(access.PRIVACY_ACCESS_COOKIE+'=')).split(';')[0]};}
async function form(f,c,purpose='own_export'){const page=await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:c.cookie}}),f.env),html=await page.text();
 ok('privacy page has script-free CSP',page.headers.get('Content-Security-Policy').includes("script-src 'none'"));ok('privacy page has no script',!/<script\b/i.test(html));
 const action=purpose==='own_export'?'export':'erasure',section=new RegExp('<form method="post" action="/privacy/access/'+action+'">([\\s\\S]*?)</form>').exec(html);assert.ok(section);
 const csrf=/name="csrf" value="([^"]+)"/.exec(section[1])[1],grant=/name="grant" value="([^"]+)"/.exec(section[1])[1];
 return {csrf,grant,request:(fields={},headers={})=>new Request(BASE+'/privacy/access/'+action,{method:'POST',headers:{Cookie:c.cookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({csrf,grant,...(purpose==='own_erasure'?{confirm:'yes'}:{}),...fields})})};}
async function refused(name,fn){let threw=false;try{await fn();}catch{threw=true;}ok(name,threw);}
async function main(){
 const privacyNotice=fs.readFileSync(path.join(root,'../policies/privacy.html'),'utf8'),historySource=load('privacy-access-history'),familyHistorySource=load('privacy-access-family-history');
 const disclosedHistoryCount=/preview of up to 25 entries in each of its (\d+) covered history sections/.exec(privacyNotice);
 eq('.204 privacy preview count matches the actual selected history registry',Number(disclosedHistoryCount?.[1]),historySource.PRIVACY_COPY_HISTORY_COLLECTIONS.length);
 eq('.204 separate collection-only histories retain their distinct registry',familyHistorySource.PRIVACY_COLLECTION_ONLY_HISTORY_COLLECTIONS.length,3);
 ok('.204 privacy notice distinguishes the three separate histories from the aggregate download',privacyNotice.includes('Three additional collection-only histories are available separately: historical Battle.net character labels, original-generation roster intents and current setting updater metadata; they are not included in that aggregate file.'));
 eq('schema additions exactly four statements',ddl.PRIVACY_ACCESS_SCHEMA.length,4);
 let f=fixture();const initialTables=f.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n;
 calls=[];const c=await connect(f);eq('fresh identity lookup invokes two endpoints',calls.length,2);ok('no membership endpoint',calls.every(x=>!x.url.includes('/guilds/')));eq('identity never creates website account',count(f,'site_users'),0);eq('identity never creates bot member',count(f,'members'),0);eq('identity never creates serving subject',count(f,'privacy_subjects'),0);eq('identity never creates role intents',count(f,'role_settlements'),0);eq('grants include two purposes',count(f,'privacy_access_grants'),2);eq('grant fixed lifetime720',f.db.prepare('SELECT expires_at-created_at AS ttl FROM privacy_access_grants LIMIT 1').get().ttl,720);
 await refused('callback replay cannot exchange twice',()=>finish(f,c.flow));eq('callback replay leaves provider call count2',calls.length,2);
 ok('privacy cookie cannot be ordinary session',await core.readSession(f.env,new Request(BASE+'/api/me',{headers:{Cookie:c.cookie}}))===null);
 let frm=await form(f,c);const r=await copy.exportPrivacyAccess(frm.request(),f.env),body=await r.json();eq('accountless export succeeds',r.status,200);eq('accountless account is null',body.account,null);eq('identity export subject only',body.identity.discordId,A);ok('export truthfully partial',body.coverage.kind==='curated_partial'&&body.coverage.completeErasure===false);ok('JSON attachment',r.headers.get('Content-Disposition').includes('attachment'));
 await refused('export grant replay rejected',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq('export has no account/session/role changes',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);f.db.close();
 for(const [name,change] of [['csrf',x=>({...x,csrf:'z'.repeat(43)})],['grant',x=>({...x,grant:'f'.repeat(32)})],['purpose',x=>({...x})]]){
  f=fixture();const c=await connect(f),frm=await form(f,c),fields=change({});if(name==='purpose'){const erasureForm=await form(f,c,'own_erasure');fields.csrf=erasureForm.csrf;fields.grant=erasureForm.grant;}
  await refused('wrong '+name+' rejected',()=>copy.exportPrivacyAccess(frm.request(fields),f.env));eq('wrong '+name+' does not consume grant',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 }
 f=fixture();const c2=await connect(f),frm2=await form(f,c2);await refused('wrong origin rejected',()=>copy.exportPrivacyAccess(frm2.request({}, {Origin:'https://other.invalid'}),f.env));await refused('duplicate cookie rejected',()=>copy.exportPrivacyAccess(frm2.request({}, {Cookie:c2.cookie+'; '+c2.cookie}),f.env));f.db.close();
 for(const offset of [-1,0,1]){f=fixture();const c=await connect(f),frm=await form(f,c);const expiry=f.db.prepare('SELECT expires_at FROM privacy_access_grants LIMIT 1').get().expires_at;f.setTime(expiry+offset);if(offset<0)eq('one second before deadline export admitted',(await copy.exportPrivacyAccess(frm.request(),f.env)).status,200);else await refused('deadline offset'+offset+' refused',()=>copy.exportPrivacyAccess(frm.request(),f.env));f.db.close();}
 for(const [name,mutate] of [['absence created',async f=>await subject(f)],['generation ABA',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','b'.repeat(32))],['revision changed',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1')],['retiring',async f=>await fixtureWrite(f,"UPDATE privacy_subjects SET state='retiring'")]]){
  f=fixture();if(name!=='absence created')await subject(f);const c=await connect(f),frm=await form(f,c);f.hooks.beforeBatch=async stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;await mutate(f);}};
  await refused(name+' between original read and native export guarded',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(name+' rolls back consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 }
 f=fixture();await subject(f);const c3=await connect(f),frm3=await form(f,c3);f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;f.advance(721);}};await refused('expiry after grant read refuses native batch',()=>copy.exportPrivacyAccess(frm3.request(),f.env));eq('expired original action never consumed',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 f=fixture();await subject(f);oauthProvider();const flow=await start(f);f.hooks.beforeBatch=async stmts=>{if(stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants'))){f.hooks.beforeBatch=null;await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1');}};await refused('callback original capture race refused',()=>finish(f,flow));eq('callback capture race issues no grants',count(f,'privacy_access_grants'),0);eq('callback capture race changes no site account',count(f,'site_users'),0);f.db.close();
 const fourScopes=['connections','guilds.members.read','identify','role_connections.write'];
 const scopePermutations=values=>values.length===1?[values]:values.flatMap((value,i)=>scopePermutations(values.filter((_,j)=>j!==i)).map(rest=>[value,...rest]));
 const closedFourOrders=scopePermutations(fourScopes).map(tokens=>tokens.join(' '));
 eq('closed four set has24 unique raw orders',new Set(closedFourOrders).size,24);
 // .142 changes only the closed returned-scope pair; frozen .140 refusal evidence
 // is preserved separately. Fresh handler authority is still identity/own-purpose.
 for(const scope of ['identify guilds.members.read','guilds.members.read identify',...closedFourOrders]){
  f=fixture();oauthProvider(A,scope);const flow=await start(f),canary='synthetic142-unused-provider-material';calls=[];
  provider=(url,init)=>{
   if(url==='https://discord.com/api/oauth2/token')return new Response(JSON.stringify({access_token:canary,refresh_token:canary,token_type:'Bearer',scope,private_error:canary}));
   if(url==='https://discord.com/api/v10/users/@me'){eq(scope+' uses returned bearer only for identity',new Headers(init.headers).get('Authorization'),'Bearer '+canary);eq(scope+' identity GET keeps manual redirects',init.redirect,'manual');return new Response(JSON.stringify({id:A,username:canary,email:canary,member:{id:B},extra:canary}));}
   throw Error('unexpected provider endpoint');
  };
  const nativeLog=context.console,recorded=[];context.console={log:(...v)=>recorded.push(v),warn:(...v)=>recorded.push(v),error:(...v)=>recorded.push(v)};
  let response,page,data;
  try{
   response=await finish(f,flow);const cs=response.headers.get('Set-Cookie'),cookie=cs.split(', ').find(x=>x.startsWith(access.PRIVACY_ACCESS_COOKIE+'=')).split(';')[0];
   page=await (await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:cookie}}),f.env)).text();
   const frm=await form(f,{cookie});data=await (await copy.exportPrivacyAccess(frm.request(),f.env)).json();
   ok(scope+' privacy cookie remains unusable as ordinary session',await core.readSession(f.env,new Request(BASE+'/api/me',{headers:{Cookie:cookie}}))===null);
   await refused(scope+' callback cannot repeat exchange',()=>finish(f,flow));await refused(scope+' own export cannot repeat',()=>copy.exportPrivacyAccess(frm.request(),f.env));
  }finally{context.console=nativeLog;}
  eq(scope+' callback redirects only privacy access',response.headers.get('Location'),'/privacy/access');
  eq(scope+' only fixed token and identity endpoints',calls.map(c=>c.url),['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me']);
  ok(scope+' never issues ordinary cookie',!/(?:^|, )__Host-olg=/.test(response.headers.get('Set-Cookie')));
  eq(scope+' two original purpose grants',f.db.prepare('SELECT purpose,expires_at-created_at AS ttl FROM privacy_access_grants ORDER BY purpose').all().map(r=>({...r})),[{purpose:'own_erasure',ttl:720},{purpose:'own_export',ttl:720}]);
  eq(scope+' only own identity export',data.identity.discordId,A);eq(scope+' local authority label unchanged',data.identity.authority,'fresh_identify_only');
  eq(scope+' accountless remains accountless',data.account,null);ok(scope+' no counterpart identity',!JSON.stringify(data).includes(B));
  eq(scope+' no normal account, membership, roles or audit',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements'),count(f,'audit')],[0,0,0,0]);
  const allNative=JSON.stringify(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>[r.name,f.db.prepare('SELECT * FROM "'+r.name.replaceAll('"','""')+'"').all()]));
  const outputs=page+JSON.stringify(data)+allNative+JSON.stringify([...response.headers]);
  ok(scope+' no provider credentials or extra identity fields stored/reflected',!outputs.includes(canary)&&!outputs.includes(await access.privacyAccessHash(canary)));
  ok(scope+' returned scope never stored/reflected',!outputs.includes(scope));eq(scope+' no provider log output',recorded,[]);
  ok(scope+' disclosure explains request and unused membership capability',page.includes('asks Discord only to identify your account')&&page.includes('may also permit reading linked accounts or guild membership, or updating this app&#39;s connection metadata')&&page.includes('uses none of those permissions')&&page.includes('uses only your account ID, keeps no Discord token'));
  f.db.close();
 }
 // RFC 6749 §5.1 variants preserve the original identify-only request, grant
 // lifetimes and one-exchange rule; only the two exact approved orders also pass.
 for(const [name,token,accept] of [
  ['lowercase bearer',{token_type:'bearer',scope:'identify'},true],
  ['uppercase bearer',{token_type:'BEARER',scope:'identify'},true],
  ['mixed bearer',{token_type:'bEaReR',scope:'identify'},true],
  ['unchanged scope omitted',{token_type:'Bearer'},true],
  ['both standard variants',{token_type:'bearer'},true],
  ['closed pair with lowercase bearer',{token_type:'bearer',scope:'identify guilds.members.read'},true],
  ['closed pair reversed with mixed bearer',{token_type:'bEaReR',scope:'guilds.members.read identify'},true],
  ['null scope',{token_type:'Bearer',scope:null},false],
  ['empty scope',{token_type:'Bearer',scope:''},false],
  ['non-string scope',{token_type:'Bearer',scope:['identify']},false],
  ['scope casing',{token_type:'Bearer',scope:'Identify'},false],
  ['other scope',{token_type:'Bearer',scope:'guilds.members.read'},false],
  ['missing type',{scope:'identify'},false],
  ['type whitespace',{token_type:' Bearer',scope:'identify'},false],
  ['type trailing whitespace',{token_type:'Bearer ',scope:'identify'},false],
  ['type trailing newline',{token_type:'Bearer\n',scope:'identify'},false],
  ['other type',{token_type:'MAC',scope:'identify'},false],
 ]){
  f=fixture();oauthProvider();const flow=await start(f),normalProvider=provider;
  provider=(url,init)=>url.endsWith('/oauth2/token')?new Response(JSON.stringify({access_token:'test-access-token',...token})):normalProvider(url,init);calls=[];
  if(accept){const response=await finish(f,flow);eq(name+' callback succeeds',response.status,303);eq(name+' only fixed provider pair',calls.map(x=>x.url),['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me']);eq(name+' two purpose grants',count(f,'privacy_access_grants'),2);eq(name+' original grant TTL',f.db.prepare('SELECT expires_at-created_at AS ttl FROM privacy_access_grants LIMIT 1').get().ttl,720);}
  else{await refused(name+' callback refuses',()=>finish(f,flow));eq(name+' no identity read',calls.length,1);eq(name+' no grants',count(f,'privacy_access_grants'),0);}
  eq(name+' no guild/session/role authority',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
  ok(name+' consumes original flow',f.db.prepare('SELECT consumed_at FROM privacy_access_oauth').get().consumed_at!==null);
  const priorCalls=calls.length;await refused(name+' cannot replay callback',()=>finish(f,flow));eq(name+' replay no further exchange',calls.length,priorCalls);f.db.close();
 }
 for(const scope of ['identify guilds.members.read','guilds.members.read identify',...closedFourOrders]){
  for(const [name,mutate] of [['absence created',async f=>await subject(f)],['generation ABA',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','b'.repeat(32))],['revision changed',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1')],['retiring',async f=>await fixtureWrite(f,"UPDATE privacy_subjects SET state='retiring'")]]){
   f=fixture();if(name!=='absence created')await subject(f);oauthProvider(A,scope);const flow=await start(f);calls=[];
   f.hooks.beforeBatch=async stmts=>{if(stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants'))){f.hooks.beforeBatch=null;await mutate(f);}};
   await refused(scope+' callback original '+name+' refuses',()=>finish(f,flow));eq(scope+' callback race cannot mint grants',count(f,'privacy_access_grants'),0);
   eq(scope+' callback race no normal authority',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
   eq(scope+' callback race still only fixed endpoints',calls.map(c=>c.url),['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me']);
   const priorCalls=calls.length;await refused(scope+' failed capture state stays spent',()=>finish(f,flow));eq(scope+' failed capture replay no provider call',calls.length,priorCalls);f.db.close();
   f=fixture();if(name!=='absence created')await subject(f);const c=await connect(f,A,scope),frm=await form(f,c);
   f.hooks.beforeBatch=async stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;await mutate(f);}};
   await refused(scope+' own export original '+name+' refuses',()=>copy.exportPrivacyAccess(frm.request(),f.env));
   eq(scope+' action race rolls back one-use consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
  }
  for(const fault of ['expiry during provider await','ignored native grant','aborted native grant']){
   f=fixture();oauthProvider(A,scope);const flow=await start(f);calls=[];
   if(fault==='expiry during provider await'){const normal=provider;provider=(url,init)=>{const r=normal(url,init);if(url.endsWith('/oauth2/token'))f.advance(300);return r;};}
   else f.db.exec("CREATE TRIGGER ignore_closed_trial_grant BEFORE INSERT ON privacy_access_grants WHEN NEW.purpose='own_erasure' BEGIN SELECT RAISE("+(fault==='aborted native grant'?"ABORT,'test_only_grant_abort'":"IGNORE")+"); END");
   await refused(scope+' '+fault+' refuses callback',()=>finish(f,flow));eq(scope+' '+fault+' native batch rolls back both grants',count(f,'privacy_access_grants'),0);
   const priorCalls=calls.length;await refused(scope+' '+fault+' cannot renew spent state',()=>finish(f,flow));eq(scope+' '+fault+' replay no provider call',calls.length,priorCalls);f.db.close();
  }
 }
 const secretSentinel='synthetic-private-code-cookie-token-identity-DO-NOT-REFLECT';
 // Every proper subset except the already accepted identify/member pair stays
 // refused. Public names in the diagnostic dictionary do not gain admission.
 const rejectedFourShapes=[];
 for(let mask=1;mask<15;mask++){
  const subset=fourScopes.filter((_,i)=>mask&(1<<i));
  if(subset.length===1&&subset[0]==='identify'||subset.length===2&&subset.includes('identify')&&subset.includes('guilds.members.read'))continue;
  for(const order of scopePermutations(subset))rejectedFourShapes.push(['proper subset '+mask,order.join(' ')]);
 }
 for(const token of fourScopes)rejectedFourShapes.push(['duplicate '+token,[...fourScopes,token].join(' ')]);
 for(const token of ['email','guilds','bot','applications.commands','test_unknown_permission']){
  rejectedFourShapes.push(['added '+token,[...fourScopes,token].join(' ')]);
  for(let i=0;i<fourScopes.length;i++)rejectedFourShapes.push(['substituted '+token+' slot'+i,fourScopes.map((value,j)=>i===j?token:value).join(' ')]);
 }
 for(const [name,scope] of [['leading',' '+closedFourOrders[0]],['trailing',closedFourOrders[0]+' '],['double space',fourScopes.join('  ')],['tab',fourScopes.join('\t')],['newline',closedFourOrders[0]+'\n'],['carriage return',closedFourOrders[0]+'\r'],['NUL',closedFourOrders[0]+'\0'],['Unicode',closedFourOrders[0].replace('identify','ｉdentify')],['uppercase',closedFourOrders[0].replace('identify','Identify')],['comma',fourScopes.join(',')],['huge',closedFourOrders[0]+' '+('test_unknown_permission'.repeat(900))]])rejectedFourShapes.push([name,scope]);
 for(const [name,scope] of rejectedFourShapes){
  f=fixture();const flow=await start(f),request=new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:flow.flowCookie}});calls=[];
  provider=()=>new Response(JSON.stringify({access_token:secretSentinel,refresh_token:secretSentinel,token_type:'Bearer',scope}));let failure;
  try{await access.finishPrivacyAccess(request,f.env);}catch(error){failure=error;}
  ok('closed four negative '+name+' refuses actual callback',!!failure);eq('closed four negative '+name+' no identity/extra API',calls.map(c=>c.url),['https://discord.com/api/oauth2/token']);
  const response=access.privacyAccessRefusal(request,failure),html=await response.text();eq('closed four negative '+name+' status503',response.status,503);
  ok('closed four negative '+name+' no credential/state/code reflection',!html.includes(secretSentinel)&&!html.includes(flow.state)&&!html.includes('original_code')&&!html.includes('test_unknown_permission'));
  eq('closed four negative '+name+' no grants/normal account/member/roles',[count(f,'privacy_access_grants'),count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0,0]);
  const n=calls.length;await refused('closed four negative '+name+' spent callback refuses',()=>finish(f,flow));eq('closed four negative '+name+' replay zero HTTP',calls.length,n);f.db.close();
 }
 const diagnostics=[
  ['token request','PA-T1',(f)=>{provider=()=>{throw Error(secretSentinel);};}],
  ['token HTTP','PA-T2',(f)=>{provider=()=>new Response(secretSentinel,{status:503});}],
  ['token body','PA-T3',(f)=>{provider=()=>new Response(secretSentinel);}],
  ['token shape','PA-T4',(f)=>{provider=()=>new Response(JSON.stringify({token_type:'Bearer',scope:'identify'}));}],
  ['token type','PA-T5',(f)=>{provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'MAC',scope:'identify'}));}],
  ['token scope','PA-T6M',(f)=>{provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'Bearer',scope:'identify email'}));}],
  ['identity request','PA-I1',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?Promise.reject(Error(secretSentinel)):normal(url,init);}],
  ['identity HTTP','PA-I2',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(secretSentinel,{status:503}):normal(url,init);}],
  ['identity body','PA-I3',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(secretSentinel):normal(url,init);}],
  ['identity shape','PA-I4',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(JSON.stringify({id:secretSentinel})):normal(url,init);}],
  ['subject read','PA-S1',(f)=>{f.hooks.beforeRead=sql=>{if(sql.startsWith('SELECT generation,state,revision FROM privacy_subjects'))throw Error(secretSentinel);};}],
  ['grant material','PA-G1',(f)=>{f.env.COOKIE_SECRET=Symbol(secretSentinel);}],
  ['grant batch','PA-G2',(f)=>{f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants')))throw Error(secretSentinel);};}],
  ['grant receipt','PA-G3',(f)=>{f.hooks.afterBatch=(stmts,rows)=>{const i=stmts.findIndex(x=>x.sql.includes("json_extract('privacy_grants_unconfirmed'"));if(i>=0)rows[i].results[0].admitted=0;};}],
 ];
 for(const [name,marker,inject] of diagnostics){
  f=fixture();oauthProvider();const flow=await start(f);inject(f);calls=[];let failure;
  try{await finish(f,flow);}catch(error){failure=error;}
  ok(name+' injected failure refuses callback',!!failure);
  const response=access.privacyAccessRefusal(new Request(BASE+'/privacy/callback?code='+secretSentinel+'&state='+secretSentinel),failure),html=await response.text();
  eq(name+' generic refusal status',response.status,503);ok(name+' closed support marker',html.includes('data-privacy-refusal="'+marker+'"'));
  ok(name+' no sensitive reflection',!html.includes(secretSentinel)&&![...response.headers.values()].some(x=>x.includes(secretSentinel)));
  ok(name+' no privacy grant cookie',!response.headers.has('Set-Cookie'));
  ok(name+' original flow spent',f.db.prepare('SELECT consumed_at FROM privacy_access_oauth').get().consumed_at!==null);
  const priorCalls=calls.length;await refused(name+' spent flow cannot exchange again',()=>finish(f,flow));eq(name+' no replay HTTP',calls.length,priorCalls);f.db.close();
 }
 // .140 fixed refusal categories stay intact for every unapproved .142 value.
 // Each spends native state before refusing identity/grants; no normalization.
 // New known-permission markers classify refusals only. Exercise each exact set
 // through genuine state issuance/consumption and the real callback, in every order.
 const knownRefusalSets=[
  ['PA-T6F',['identify','role_connections.write']],
  ['PA-T6G',['identify','guilds.members.read','role_connections.write']],
  ['PA-T6H',['identify','guilds']],
  ['PA-T6J',['identify','guilds.members.read','guilds']],
  ['PA-T6K',['identify','role_connections.write','guilds']],
  ['PA-T6L',['identify','guilds.members.read','role_connections.write','guilds']],
  ['PA-T6M',['identify','email']],
 ];
 const permutations=tokens=>tokens.length===0?[[]]:tokens.flatMap((v,i)=>permutations(tokens.filter((_,j)=>j!==i)).map(t=>[v,...t]));
 const knownRefusalCases=[];
 for(const [marker,tokens] of knownRefusalSets){
  for(const [i,order] of permutations(tokens).entries())knownRefusalCases.push([marker+' known permutation '+i,order.join(' '),marker]);
  for(const [i,token] of tokens.entries())knownRefusalCases.push([marker+' duplicate token '+i,[...tokens,token].join(' '),'PA-T6N']);
  knownRefusalCases.push([marker+' unknown extra',[...tokens,secretSentinel].join(' '),'PA-T6D']);
  knownRefusalCases.push([marker+' missing exact identity',tokens.filter(t=>t!=='identify').join(' '),'PA-T6E']);
  knownRefusalCases.push([marker+' wrong identity casing',tokens.map(t=>t==='identify'?'Identify':t).join(' '),'PA-T6E']);
  knownRefusalCases.push([marker+' token near-match',tokens.map(t=>t==='identify'?t:'x'+t).join(' '),'PA-T6D']);
  knownRefusalCases.push([marker+' email plus another permission',[...tokens,'email'].join(' '),marker==='PA-T6M'?'PA-T6N':'PA-T6P']);
  for(const [i,value] of [' '+tokens.join(' '),tokens.join(' ')+' ',tokens.join('  '),tokens.join('\t'),tokens.join(' ')+'\n',tokens.join(' ')+'\r',tokens.join(' ')+'\0',tokens.join(' ')+'\u00a0'].entries())knownRefusalCases.push([marker+' malformed '+i,value,'PA-T6']);
 }
 eq('known diagnostic exact-set permutation census',knownRefusalCases.filter(x=>x[0].includes(' known permutation ')).length,48);
 const genericScopeHtml=await access.privacyAccessRefusal(new Request(BASE+'/privacy/callback'),new (load('policy-form-core').FormError)('identity_exchange_scope_refused',503)).text();
 for(const [name,scope,marker] of [
  ...knownRefusalCases,
  ['null',null,'PA-T6A'],['boolean',false,'PA-T6A'],['number',0,'PA-T6A'],
  ['object',{identify:secretSentinel},'PA-T6A'],['array',['identify'],'PA-T6A'],
  ['empty','','PA-T6B'],['leading ASCII space',' identify','PA-T6C'],
  ['trailing ASCII space','identify ','PA-T6C'],['surrounding ASCII spaces','  identify  ','PA-T6C'],
  ['repeated identify','identify identify','PA-T6C'],['repeated formatted identify',' identify  identify ','PA-T6C'],
  ['broader identify first','identify email','PA-T6M'],['broader identify last','email identify','PA-T6M'],
  ['broader repeated identify','identify identify email','PA-T6N'],['case-sensitive extra token','identify Identify','PA-T6D'],
  ['pair plus email','identify guilds.members.read email','PA-T6P'],['pair plus unknown','identify guilds.members.read '+secretSentinel,'PA-T6D'],
  ['other known guild scope','identify guilds','PA-T6H'],['other known role scope','identify role_connections.write','PA-T6F'],
  ['member token casing','identify Guilds.members.read','PA-T6D'],['member token prefix','identify xguilds.members.read','PA-T6D'],
  ...['identify identify guilds.members.read','identify guilds.members.read identify','guilds.members.read identify identify','guilds.members.read guilds.members.read identify','guilds.members.read identify guilds.members.read','identify guilds.members.read guilds.members.read','identify identify guilds.members.read guilds.members.read','guilds.members.read guilds.members.read identify identify'].map((s,i)=>['closed pair duplicate'+i,s,'PA-T6N']),
  ['RFC punctuation boundaries','identify ! # [ ] ~','PA-T6D'],['comma inside RFC token','identify email,other','PA-T6D'],
  ['private broad scope canary','identify '+secretSentinel,'PA-T6D'],
  ['long bounded token','identify '+('a'.repeat(8000)),'PA-T6D'],
  ['missing identify','guilds.members.read email','PA-T6E'],['case-sensitive Identify','Identify','PA-T6E'],
  ['uppercase IDENTIFY','IDENTIFY','PA-T6E'],['comma is not separator','identify,email','PA-T6E'],
  ['identify substring','xidentify identifyx','PA-T6E'],
  ['private missing scope canary',secretSentinel,'PA-T6E'],
  ['spaces only','   ','PA-T6'],['tab separator','identify\temail','PA-T6'],
  ['newline separator','identify\nemail','PA-T6'],['final newline','identify email\n','PA-T6'],
  ['final identify newline','identify\n','PA-T6'],['carriage return','identify\r','PA-T6'],
  ['double broad separator','identify  email','PA-T6'],['leading broad separator',' identify email','PA-T6'],
  ['trailing broad separator','identify email ','PA-T6'],['quote excluded','identify "email"','PA-T6'],
  ...[' identify guilds.members.read','identify guilds.members.read ','identify  guilds.members.read',' guilds.members.read identify','guilds.members.read identify ','guilds.members.read  identify','identify\tguilds.members.read','guilds.members.read\tidentify','identify\nguilds.members.read','guilds.members.read identify\n','identify guilds.members.read\n','identify\u00a0guilds.members.read','identify \uff47uilds.members.read'].map((s,i)=>['closed pair formatting'+i,s,'PA-T6']),
  ...[0,1,9,10,13,31,127,160,0x2003,0x2028,0x2029,0xfeff].map(n=>['closed pair control/U'+n,'identify guilds.members.read'+String.fromCharCode(n),'PA-T6']),
  ['backslash excluded','identify \\email','PA-T6'],['NUL excluded','identify\0email','PA-T6'],
  ['DEL excluded','identify '+String.fromCharCode(127),'PA-T6'],['NBSP separator','identify\u00a0email','PA-T6'],
  ['Unicode space','\u2003identify','PA-T6'],['Unicode token','identify \u00e9mail','PA-T6'],
  ['BOM','\ufeffidentify','PA-T6'],['Unicode lookalike','\uff49dentify','PA-T6'],
  ['response exceeds finite byte cap','identify '+('a'.repeat(16400)),'PA-T3'],
 ]){
  f=fixture();oauthProvider();const flow=await start(f);calls=[];
  provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'Bearer',scope,private_error:secretSentinel}));
  const nativeLog=context.console,recorded=[];context.console={log:(...v)=>recorded.push(v),warn:(...v)=>recorded.push(v),error:(...v)=>recorded.push(v)};
  let failure;try{await finish(f,flow);}catch(error){failure=error;}finally{context.console=nativeLog;}
  ok(name+' scope callback refused',!!failure);
  eq(name+' scope only token endpoint',calls.map(x=>x.url),['https://discord.com/api/oauth2/token']);
  eq(name+' scope no capture or authority rows',[count(f,'privacy_access_grants'),count(f,'privacy_subjects'),count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0,0,0]);
  const response=access.privacyAccessRefusal(new Request(BASE+'/privacy/callback?code='+secretSentinel+'&state='+flow.state),failure),html=await response.text();
  eq(name+' scope refusal status',response.status,503);
  const markers=[...html.matchAll(/data-privacy-refusal="([^"]+)"/g)].map(x=>x[1]);eq(name+' scope exact closed marker',markers,[marker]);
  eq(name+' scope only categorical page difference',html.replace(/data-privacy-refusal="[^"]+"/,'data-privacy-refusal="PA-T6"'),genericScopeHtml);
  ok(name+' scope no token/code/state reflection',!html.includes(secretSentinel)&&!html.includes(flow.state)&&![...response.headers.values()].some(x=>x.includes(secretSentinel)||x.includes(flow.state)));
  ok(name+' scope no credential cookie',!response.headers.has('Set-Cookie'));eq(name+' scope no log output',recorded,[]);
  const flowRow=f.db.prepare('SELECT * FROM privacy_access_oauth').get();ok(name+' scope original state consumed',flowRow.consumed_at!==null);
  ok(name+' scope no provider data in native flow',!JSON.stringify(flowRow).includes(secretSentinel));
  const priorCalls=calls.length;await refused(name+' scope replay refused',()=>finish(f,flow));eq(name+' scope replay zero HTTP',calls.length,priorCalls);f.db.close();
 }
 // .144 public dictionary membership is diagnostic only. Exercise the real native
 // callback with the same original Request as the response renderer; another
 // Request/error must not acquire these one-response-only support details.
 const publicScopes=[
  'activities.read','activities.write','applications.builds.read','applications.builds.upload',
  'applications.commands','applications.commands.update','applications.commands.permissions.update',
  'applications.entitlements','applications.store.update','bot','connections','dm_channels.read',
  'email','gdm.join','guilds','guilds.join','guilds.members.read','identify','identify.premium',
  'messages.read','relationships.read','role_connections.write','rpc','rpc.activities.write',
  'rpc.notifications.read','rpc.voice.read','rpc.voice.write','voice','webhook.incoming',
  'openid','sdk.social_layer_presence','sdk.social_layer',
 ];
 eq('official diagnostic dictionary has32 distinct public names',new Set(publicScopes).size,32);
 const hex=n=>n.toString(16).padStart(8,'0'),identityBit=2**17;
 const singletonMarkers={email:'PA-T6M',guilds:'PA-T6H','role_connections.write':'PA-T6F'};
 const scopeDetails=[];
 for(const [i,name] of publicScopes.entries()){
  if(name==='identify'||name==='guilds.members.read')continue; // Existing accepted values remain unchanged below.
  for(const reverse of [false,true])scopeDetails.push(['public dictionary bit'+i+' order'+Number(reverse),(reverse?[name,'identify']:['identify',name]).join(' '),singletonMarkers[name]??'PA-T6P',hex(identityBit+2**i),'00000000',false,false]);
 }
 scopeDetails.push(
  ['all32 ascending',publicScopes.join(' '),'PA-T6P','ffffffff','00000000',false,false],
  ['all32 descending',[...publicScopes].reverse().join(' '),'PA-T6P','ffffffff','00000000',false,false],
  ['all32 repeated',[...publicScopes,...publicScopes].join(' '),'PA-T6N','ffffffff','ffffffff',false,false],
  ['bit31 repeated','identify sdk.social_layer sdk.social_layer','PA-T6N','80020000','80000000',false,false],
  ['only identity repeated','identify identify identify','PA-T6C','00020000','00020000',false,false],
  ['known noidentity repeated','connections connections','PA-T6E','00000400','00000400',false,false],
  ['one unknown','identify '+secretSentinel,'PA-T6D','00020000','00000000',true,false],
  ['unknown repeated','identify '+secretSentinel+' '+secretSentinel,'PA-T6N','00020000','00000000',true,true],
  ['different unknowns','identify '+secretSentinel+' '+secretSentinel+'_different','PA-T6D','00020000','00000000',true,false],
  ['knownandunknown repeats','identify connections connections '+secretSentinel+' '+secretSentinel,'PA-T6N','00020400','00000400',true,true],
  ['unknown repeat withoutidentity',secretSentinel+' '+secretSentinel,'PA-T6E','00000000','00000000',true,true],
  ['public-name near match','identify sdk.social_layerx','PA-T6D','00020000','00000000',true,false],
 );
 for(const [name,scope,marker,known,repeatedKnown,unknown,repeatedUnknown] of scopeDetails){
  f=fixture();const flow=await start(f);calls=[];const recorded=[],nativeLog=context.console;
  const request=new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:flow.flowCookie}});
  provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'Bearer',scope,private_error:secretSentinel}));
  context.console={log:(...v)=>recorded.push(v),warn:(...v)=>recorded.push(v),error:(...v)=>recorded.push(v)};
  let failure;try{await access.finishPrivacyAccess(request,f.env);}catch(error){failure=error;}finally{context.console=nativeLog;}
  ok(name+' actual callback refuses',!!failure);eq(name+' only token exchange',calls.map(c=>c.url),['https://discord.com/api/oauth2/token']);
  const cloneHtml=await access.privacyAccessRefusal(new Request(request),failure).text();ok(name+' clone Request has no diagnostic metadata',!cloneHtml.includes('data-privacy-scope-'));
  const response=access.privacyAccessRefusal(request,failure),html=await response.text();
  eq(name+' original callback refuses503',response.status,503);ok(name+' fixed rejection marker',html.includes('data-privacy-refusal="'+marker+'"'));
  const attributes=Object.fromEntries([...html.matchAll(/data-privacy-scope-([a-z-]+)="([^"]+)"/g)].map(m=>[m[1],m[2]]));
  eq(name+' exact closed metadata',attributes,{schema:'discord-public-scope-v1',known,'repeated-known':repeatedKnown,unknown:String(unknown),'repeated-unknown':String(repeatedUnknown)});
  const expectedLabels=publicScopes.filter((_,i)=>Math.floor(parseInt(known,16)/2**i)%2===1).join(', ')||'none';
  ok(name+' exact reviewed human labels',html.includes('<p>Recognized permission labels: '+expectedLabels+'.</p>'));
  ok(name+' public support description',html.includes('These details do not grant access.'));
  ok(name+' unknownandcredential never reflected',!html.includes(secretSentinel)&&!html.includes(flow.state)&&!html.includes('original_code')&&![...response.headers.values()].some(v=>v.includes(secretSentinel)||v.includes(flow.state)));
  ok(name+' script-free no-store response',response.headers.get('Content-Security-Policy').includes("script-src 'none'")&&response.headers.get('Cache-Control').includes('no-store')&&!/<script\b/i.test(html));
  ok(name+' no cookie issued',!response.headers.has('Set-Cookie'));eq(name+' no logging',recorded,[]);
  eq(name+' no identity/grant/ordinary mutations',[count(f,'privacy_access_grants'),count(f,'privacy_subjects'),count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0,0,0]);
  const flowRow=f.db.prepare('SELECT * FROM privacy_access_oauth').get();ok(name+' consumed state without metadata storage',flowRow.consumed_at!==null&&!JSON.stringify(flowRow).includes(secretSentinel)&&!JSON.stringify(flowRow).includes('discord-public-scope-v1'));
  const secondHtml=await access.privacyAccessRefusal(request,failure).text();ok(name+' same error metadata spent after one response',!secondHtml.includes('data-privacy-scope-'));
  const forged=new (load('policy-form-core').FormError)(failure.code,503);ok(name+' copied error code cannot acquire metadata',!(await access.privacyAccessRefusal(request,forged).text()).includes('data-privacy-scope-'));
  const prior=calls.length;await refused(name+' state replay refuses',()=>access.finishPrivacyAccess(request,f.env));eq(name+' replay has no newHTTP',calls.length,prior);f.db.close();
 }
 for(const [name,scope,marker] of [
  ['nonstring null',null,'PA-T6A'],['nonstring object',{scope:secretSentinel},'PA-T6A'],['empty','','PA-T6B'],
  ['identity surrounding space',' identify ','PA-T6C'],['mixed leading space',' identify connections','PA-T6'],
  ['mixed doubled space','identify  connections','PA-T6'],['tab separator','identify\tconnections','PA-T6'],
  ['final newline','identify connections\n','PA-T6'],['Unicode','identify \uff43onnections','PA-T6'],
  ['quoted unknown','identify "'+secretSentinel+'"','PA-T6'],['backslash unknown','identify \\'+secretSentinel,'PA-T6'],
  ['finite body exceeded','identify '+secretSentinel+'a'.repeat(16400),'PA-T3'],
 ]){
  f=fixture();const flow=await start(f),request=new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:flow.flowCookie}});calls=[];
  provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'Bearer',scope}));let failure;
  try{await access.finishPrivacyAccess(request,f.env);}catch(error){failure=error;}
  ok(name+' same-request malformed refusal',!!failure);const html=await access.privacyAccessRefusal(request,failure).text();
  ok(name+' fixed malformed marker',html.includes('data-privacy-refusal="'+marker+'"'));ok(name+' malformed receives no enum metadata',!html.includes('data-privacy-scope-'));
  ok(name+' malformed no provider value reflection',!html.includes(secretSentinel));eq(name+' malformed only exchange',calls.map(c=>c.url),['https://discord.com/api/oauth2/token']);
  eq(name+' malformed grant0',count(f,'privacy_access_grants'),0);f.db.close();
 }
 // Even a forged error cannot reflect an arbitrary reason as a public marker.
 for(const reason of ['identity_scope_'+secretSentinel,'PA-T6D','identity_scope_broader_refused '+secretSentinel]){
  const response=access.privacyAccessRefusal(new Request(BASE+'/privacy/callback'),new (load('policy-form-core').FormError)(reason,503)),html=await response.text();
  ok('dynamic scope marker refused',html.includes('data-privacy-refusal="PA-U0"')&&!html.includes(secretSentinel));
 }
 for(const error of [Error(secretSentinel),new (load('policy-form-core').FormError)(secretSentinel,503),new (load('policy-form-core').FormError)('identity_exchange_unconfirmed',503)]){
  const response=access.privacyAccessRefusal(new Request(BASE+'/privacy/access/export'),error),html=await response.text();ok('non-callback errors have only unknown support marker',html.includes('data-privacy-refusal="PA-U0"'));ok('unknown errors never reflect private detail',!html.includes(secretSentinel));
 }
 f=fixture();oauthProvider();const expiredFlow=await start(f);f.advance(300);calls=[];await refused('expired flow cannot exchange',()=>finish(f,expiredFlow));eq('expired flow no provider calls',calls.length,0);f.db.close();
 for(const bad of ['missing','wrong','another-browser']){f=fixture();oauthProvider();const flow=await start(f),other=bad==='another-browser'?await start(f):null;calls=[];
  const cookie=bad==='missing'?'':bad==='wrong'?access.PRIVACY_ACCESS_FLOW_COOKIE+'='+('z'.repeat(43)):other.flowCookie;
  await refused(bad+' browser cannot use OAuth state',()=>access.finishPrivacyAccess(new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:cookie}}),f.env));eq(bad+' browser triggers no exchanges',calls.length,0);eq(bad+' browser issues no grants',count(f,'privacy_access_grants'),0);f.db.close();}
 for(const [name,query] of [['missing',''],['wrong','&iss=https%3A%2F%2Fother.invalid'],['http','&iss=http%3A%2F%2Fdiscord.com'],['slash','&iss=https%3A%2F%2Fdiscord.com%2F'],['port','&iss=https%3A%2F%2Fdiscord.com%3A443'],['userinfo','&iss=https%3A%2F%2Fdiscord.com%40other.invalid'],['query','&iss=https%3A%2F%2Fdiscord.com%3Fx%3Dy'],['fragment','&iss=https%3A%2F%2Fdiscord.com%23x'],['duplicate','&iss=https%3A%2F%2Fdiscord.com&iss=https%3A%2F%2Fdiscord.com'],['unknown parameter','&iss=https%3A%2F%2Fdiscord.com&extra=x']]){
  f=fixture();oauthProvider();const flow=await start(f);calls=[];
  await refused(name+' issuer response rejected',()=>access.finishPrivacyAccess(new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code'+query,{headers:{Cookie:flow.flowCookie}}),f.env));
  eq(name+' issuer causes no provider exchange',calls.length,0);eq(name+' issuer leaves original state unused',f.db.prepare('SELECT consumed_at FROM privacy_access_oauth').get().consumed_at,null);eq(name+' issuer issues no grants',count(f,'privacy_access_grants'),0);
  eq(name+' refusal preserves subsequent exact issuer connection',(await finish(f,flow)).status,303);eq(name+' exact issuer invokes only fixed two endpoints',calls.length,2);f.db.close();
 }
 f=fixture();oauthProvider();const providerExpiry=await start(f),oldProvider=provider;provider=(url,init)=>{const response=oldProvider(url,init);if(url.endsWith('/oauth2/token'))f.advance(300);return response;};calls=[];
 await refused('flow expiry during provider await refuses grants',()=>finish(f,providerExpiry));eq('provider-expired flow has no grants',count(f,'privacy_access_grants'),0);f.db.close();
 f=fixture();oauthProvider();const ignoredGrant=await start(f);f.db.exec("CREATE TRIGGER ignore_erase_grant BEFORE INSERT ON privacy_access_grants WHEN NEW.purpose='own_erasure' BEGIN SELECT RAISE(IGNORE); END");
 await refused('ignored grant insert fails final actual guard',()=>finish(f,ignoredGrant));eq('ignored grant insert rolls back both grants',count(f,'privacy_access_grants'),0);f.db.close();
 f=fixture();const cFinal=await connect(f),formFinal=await form(f,cFinal);f.hooks.step=(_i,sql)=>{if(sql.includes('privacy_access_read_refused'))f.advance(720);};
 await refused('copy final original deadline aborts native transaction',()=>copy.exportPrivacyAccess(formFinal.request(),f.env));eq('copy final deadline rolls back consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 for(const scope of ['identify','identify guilds.members.read','guilds.members.read identify']){
 f=fixture();await fixtureWrite(f,'INSERT INTO members(discord_id,banned,ban_reason) VALUES(?,1,?)',A,'private staff reason');await fixtureWrite(f,'INSERT INTO members(discord_id,banned,ban_reason) VALUES(?,0,?)',B,'counterparty');
 await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied,denied_reason,denied_by) VALUES(?,?,?,?,?,?,?,?)',A,f.time(),f.time(),0,7,1,'private denial',STAFF);
 await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version) VALUES(?,?,?,?,?)',B,f.time(),f.time(),1,2);
 await fixtureWrite(f,'INSERT INTO site_friends(owner_id,friend_kind,friend_key,friend_label,note,created_at) VALUES(?,?,?,?,?,?)',A,'discord',B,'Chosen label','own note',f.time());
 await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)',f.time(),STAFF,'own.action',A,JSON.stringify({staff:STAFF,other:B}));
 await fixtureWrite(f,'INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)',f.time(),STAFF,'other.action',B,'private');
 const c4=await connect(f,A,scope),frm4=await form(f,c4),data=await (await copy.exportPrivacyAccess(frm4.request(),f.env)).json(),serialized=JSON.stringify(data);
 ok('banned departed denied export succeeds',data.verification.bannedFromVerifying&&data.account.inServer===false&&data.account.denied);ok('no counterparty or staff structural identity',!serialized.includes(B)&&!serialized.includes(STAFF));ok('private staff reasons omitted',!serialized.includes('private staff reason')&&!serialized.includes('private denial'));eq('only own actions copied',data.actions.rows.length,1);eq('existing ordinary version unchanged by identity/export',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);f.db.close();
 }
 f=fixture();await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)',A,f.time(),f.time(),4);await fixtureWrite(f,'INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',A,'member',JSON.stringify({references:[null,1,'legacy',[],{kind:'discord',label:'Chosen reference',key:B},{kind:{id:B},label:{id:STAFF}}]}),'submitted',f.time(),f.time());
 const cLegacy=await connect(f),formLegacy=await form(f,cLegacy),legacy=await (await copy.exportPrivacyAccess(formLegacy.request(),f.env)).json();eq('legacy malformed references do not consume without copy',legacy.site.application.answers.references.length,2);ok('legacy reference projection withholds structural identities',!JSON.stringify(legacy).includes(B)&&!JSON.stringify(legacy).includes(STAFF));f.db.close();
 for(const [shape,references] of [['object',{kind:'discord',key:B,label:'Chosen reference'}],['string',B],['number',123],['boolean',true],['null',null]]){
  f=fixture();await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)',A,f.time(),f.time(),4);
  await fixtureWrite(f,'INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',A,'member',JSON.stringify({references,ownText:'User-authored mention '+B}),'submitted',f.time(),f.time());
  const c=await connect(f),frm=await form(f,c),response=await copy.exportPrivacyAccess(frm.request(),f.env),data=await response.json();eq(shape+' references export safely',response.status,200);eq(shape+' malformed references conservatively withheld',data.site.application.answers.references,null);eq(shape+' preserves other user-authored answer text',data.site.application.answers.ownText,'User-authored mention '+B);f.db.close();
 }
 f=fixture();await fixtureWrite(f,'INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)',A,f.time(),f.time(),4);
 await fixtureWrite(f,'INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',A,'member',JSON.stringify({references:[{kind:'discord',key:B,label:'Chosen reference'},null,7,'legacy',[{key:B}],{kind:B,label:{key:STAFF}}]}),'submitted',f.time(),f.time());
 const cMixed=await connect(f),formMixed=await form(f,cMixed),mixed=await (await copy.exportPrivacyAccess(formMixed.request(),f.env)).json();eq('mixed reference arrays preserve valid minimal projection',mixed.site.application.answers.references,[{kind:'discord',label:'Chosen reference'},{kind:null,label:null}]);ok('mixed reference arrays withhold all malformed structural keys',!JSON.stringify(mixed).includes(B)&&!JSON.stringify(mixed).includes(STAFF));f.db.close();
 f=fixture();const c5=await connect(f),frm5=await form(f,c5,'own_erasure'),result=await erase.erasePrivacyAccess(frm5.request(),f.env),html=await result.text();eq('accountless erasure admitted queued',result.status,202);eq('accountless erasure no website account',count(f,'site_users'),0);eq('accountless erasure no bot member',count(f,'members'),0);eq('accountless erasure no direct role intent',count(f,'role_settlements'),0);eq('accountless subject retiring',f.db.prepare('SELECT state FROM privacy_subjects WHERE subject_id=?').get(A).state,'retiring');eq('durable job only one',count(f,'privacy_serving_jobs'),1);eq('job uses fixed identity deadline',f.db.prepare('SELECT original_session_expires FROM privacy_serving_jobs').get().original_session_expires,f.db.prepare("SELECT expires_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().expires_at);ok('erasure no all-copies claim',html.includes('does not mean every copy was erased'));eq('same purpose replay recovers original status',(await erase.erasePrivacyAccess(frm5.request(),f.env)).status,202);eq('erasure replay does not add jobs',count(f,'privacy_serving_jobs'),1);eq('erasure replay does not advance revision',f.db.prepare('SELECT revision FROM privacy_subjects').get().revision,1);f.db.close();
 for(const [name,mutate] of [['generation',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET generation=?','b'.repeat(32))],['revision',async f=>await fixtureWrite(f,'UPDATE privacy_subjects SET revision=revision+1')],['absence',async f=>await subject(f)],['expiry',f=>f.advance(720)]]){
  f=fixture();if(name==='generation'||name==='revision')await subject(f);const c=await connect(f),frm=await form(f,c,'own_erasure');f.hooks.beforeBatch=async stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;await mutate(f);}};
  const r=await erase.erasePrivacyAccess(frm.request(),f.env);eq('stale '+name+' erasure not confirmed',r.status,503);eq('stale '+name+' no job',count(f,'privacy_serving_jobs'),0);eq('stale '+name+' no role intent',count(f,'role_settlements'),0);eq('stale '+name+' grants remain unconsumed',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().consumed_at,null);f.db.close();
 }
 for(const state of ['retiring','retired']){f=fixture();await subject(f,state);const c=await connect(f),frm=await form(f,c,'own_erasure');eq(state+' with no retained job remains held',(await erase.erasePrivacyAccess(frm.request(),f.env)).status,503);eq(state+' not reopened',f.db.prepare('SELECT state FROM privacy_subjects').get().state,state);eq(state+' no new job',count(f,'privacy_serving_jobs'),0);f.db.close();}
 for(const state of ['retiring','retired']){f=fixture();await subject(f,state);const op='9'.repeat(32);await fixtureWrite(f,`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,completed_at,retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)`,op,A,G,'8'.repeat(64),7,f.time()+200,state==='retired'?'complete':'held',f.time(),state==='retired'?f.time():null,f.time()+366*86400);
  const c=await connect(f),frm=await form(f,c,'own_erasure');let lost=false;f.hooks.afterBatch=stmts=>{if(!lost&&stmts.some(x=>x.sql.startsWith('UPDATE privacy_access_grants SET erasure_operation'))){lost=true;throw Error('lost existing status reply');}};
  const r=await erase.erasePrivacyAccess(frm.request(),f.env),html=await r.text();eq(state+' existing status lost reply recovers',r.status,202);ok(state+' existing receipt references original job',html.includes(op));ok(state+' recovered legacy job never claims independent current completion',html.includes('Independent confirmation of account erasure is not available.'));eq(state+' status pointer binds consumed grant',f.db.prepare("SELECT erasure_operation FROM privacy_access_grants WHERE purpose='own_erasure'").get().erasure_operation,op);eq(state+' same form status replay resolves exact old job',(await erase.erasePrivacyAccess(frm.request(),f.env)).status,202);eq(state+' replay never adds another job',count(f,'privacy_serving_jobs'),1);eq(state+' replay never changes revision',f.db.prepare('SELECT revision FROM privacy_subjects').get().revision,3);eq(state+' status replay never creates role intent',count(f,'role_settlements'),0);f.db.close();}
 f=fixture();const cEnd=await connect(f),formEnd=await form(f,cEnd,'own_erasure');f.hooks.step=(_i,sql)=>{if(sql.includes('privacy_identify_erasure_unconfirmed'))f.advance(720);};eq('erasure final original deadline not confirmed',(await erase.erasePrivacyAccess(formEnd.request(),f.env)).status,503);eq('erasure final deadline rolls back subject/job',[count(f,'privacy_subjects'),count(f,'privacy_serving_jobs')],[0,0]);eq('erasure final deadline rolls back grant consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().consumed_at,null);f.db.close();
 f=fixture();const c6=await connect(f),frm6=await form(f,c6,'own_erasure');let lost=false;f.hooks.afterBatch=stmts=>{if(!lost&&stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_serving_jobs'))){lost=true;throw Error('lost commit response');}};eq('lost commit reply resolves exact durable job',(await erase.erasePrivacyAccess(frm6.request(),f.env)).status,202);eq('lost reply persists one job',count(f,'privacy_serving_jobs'),1);f.db.close();
 f=fixture();eq('purge exactly two statements',access.privacyAccessPurgeStatements(f.env).length,2);for(let i=0;i<125;i++)await fixtureWrite(f,"INSERT INTO privacy_access_oauth VALUES(?,?,'privacy_identify',?,?,NULL)",i.toString(16).padStart(64,'0'),'a'.repeat(64),f.time()-301,f.time()-1);await f.env.DB.batch(access.privacyAccessPurgeStatements(f.env));eq('purge bounded100 per table',count(f,'privacy_access_oauth'),25);f.db.close();
 // .217: genuine callback fixtures exercise the provider byte/encoding/JSON boundary at both HTTP stages.
 {
  const boundary=load('privacy-provider-body'),encoder=new TextEncoder(),settle=()=>new Promise(resolve=>setTimeout(resolve,0));
  const value=stage=>stage==='token'?{access_token:'test-access-token',token_type:'Bearer',scope:'identify',extra:'Caf\u00e9 \ud83d\ude00'}:{id:A,username:'Caf\u00e9 \ud83d\ude00'};
  const selected=(stage,url)=>url===(stage==='token'?'https://discord.com/api/oauth2/token':'https://discord.com/api/v10/users/@me');
  const chunksResponse=(chunks,headers={})=>{let index=0;return new Response(new ReadableStream({pull(controller){if(index===chunks.length)controller.close();else controller.enqueue(chunks[index++]);}}),{headers});};
  for(const stage of ['token','identity']){
   for(const shape of ['exact byte cap','split UTF-8']){
    const f=fixture(),schemaBefore=count(f,'sqlite_master');oauthProvider();const flow=await start(f),normal=provider,raw=encoder.encode(JSON.stringify(value(stage)));
    let response;if(shape==='exact byte cap'){const bytes=new Uint8Array(boundary.PRIVACY_PROVIDER_BYTES).fill(32);bytes.set(raw);response=chunksResponse([bytes],{'Content-Length':String(bytes.length)});}
    else{const split=raw.findIndex(byte=>byte>=128)+1;ok('.217 '+stage+' split lies inside a UTF-8 sequence',split>0);response=chunksResponse([raw.slice(0,split),raw.slice(split)]);}
    provider=(url,init)=>selected(stage,url)?response:normal(url,init);
    eq('.217 '+stage+' '+shape+' remains a genuine admitted callback',(await finish(f,flow)).status,303);
    eq('.217 '+stage+' '+shape+' grants only two original privacy purposes',count(f,'privacy_access_grants'),2);
    eq('.217 '+stage+' '+shape+' creates no ordinary account or role',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);
    eq('.217 '+stage+' '+shape+' changes no schema',count(f,'sqlite_master'),schemaBefore);f.db.close();
   }
   const negatives=['noncanonical length','declared byte overflow','stream byte overflow','UTF-8 BOM','invalid UTF-8','duplicate key','escaped duplicate key','trailing JSON material','empty body'];
   for(const name of negatives){
    const f=fixture();oauthProvider();const flow=await start(f),normal=provider,text=JSON.stringify(value(stage)),observed={cancelled:0};
    let response;
    if(name==='noncanonical length')response=new Response(text,{headers:{'Content-Length':'01'}});
    else if(name==='declared byte overflow')response=new Response(text,{headers:{'Content-Length':String(boundary.PRIVACY_PROVIDER_BYTES+1)}});
    else if(name==='stream byte overflow'){let pulls=0;response=new Response(new ReadableStream({pull(controller){if(pulls++===0)controller.enqueue(encoder.encode(text));else if(pulls<40)controller.enqueue(new Uint8Array(1024).fill(32));else controller.close();},cancel(){observed.cancelled++;}}));}
    else if(name==='UTF-8 BOM')response=new Response(encoder.encode('\ufeff'+text));
    else if(name==='invalid UTF-8'){const parts=JSON.stringify({...value(stage),extra:'BROKEN217'}).split('BROKEN217');response=new Response(new Uint8Array([...encoder.encode(parts[0]),195,40,...encoder.encode(parts[1])]));}
    else if(name==='duplicate key'||name==='escaped duplicate key'){const key=stage==='token'?'access_token':'id',escaped=stage==='token'?'\\u0061ccess_token':'\\u0069d',replacement=stage==='token'?'test-access-token':A;response=new Response(text.slice(0,-1)+',"'+(name==='duplicate key'?key:escaped)+'":"'+replacement+'"}');}
    else if(name==='trailing JSON material')response=new Response(text+'#');
    else response=new Response(null);
    provider=(url,init)=>selected(stage,url)?response:normal(url,init);const before=calls.length;let failure;
    try{await finish(f,flow);}catch(error){failure=error;}
    ok('.217 '+stage+' '+name+' refuses the genuine callback',!!failure);
    eq('.217 '+stage+' '+name+' does not progress past the selected endpoint',calls.length-before,stage==='token'?1:2);
    eq('.217 '+stage+' '+name+' creates no grant/account/role',[count(f,'privacy_access_grants'),count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0,0]);
    ok('.217 '+stage+' '+name+' leaves original callback state spent',f.db.prepare('SELECT consumed_at FROM privacy_access_oauth').get().consumed_at!==null);
    await settle();if(name==='stream byte overflow')eq('.217 '+stage+' overflow cancels the original unread stream once',observed.cancelled,1);
    const spentCalls=calls.length;await refused('.217 '+stage+' '+name+' spent callback cannot retry',()=>finish(f,flow));eq('.217 '+stage+' '+name+' replay has zero HTTP',calls.length,spentCalls);f.db.close();
   }
  }
  // A local deadline does not erase ownership of a header response that has not arrived yet.
  const work=new boundary.PendingPrivacyIdentityWork(),controller=new AbortController();let complete,cancelled=0;
  const original=new Promise(resolve=>{complete=resolve;});let deadline;
  try{await boundary.fetchPrivacyProvider(original,Date.now()-1,controller,work);}catch(error){deadline=error;}
  ok('.217 expired provider deadline aborts without fabricating drain',!!deadline&&controller.signal.aborted&&work.count===1);
  complete(new Response(new ReadableStream({cancel(){cancelled++;}})));await settle();
  eq('.217 late original header response is cancelled once',cancelled,1);eq('.217 actual header/cancellation settlement drains owned work',work.count,0);
 }
 // .217: opening the privacy connection page is read-only; only its original same-origin form can allocate OAuth state.
 {
  const f=fixture();f.env.PRIVACY_ACCESS_ENABLED='true';const policy=load('policy-forms'),forms=load('policy-form-core');
  const schemaBefore=count(f,'sqlite_master');calls=[];
  const route=request=>policy.handlePolicyForms(request,f.env,'/privacy/signin',true);
  const get=await route(new Request(BASE+'/privacy/signin'));
  eq('.217 privacy sign-in GET renders a non-allocating form',get.status,200);
  eq('.217 privacy sign-in GET allocates no OAuth state',count(f,'privacy_access_oauth'),0);
  const markup=/<form method="post" action="\/privacy\/signin">([\s\S]*?)<\/form>/.exec(await get.text());ok('.217 entry offers the actual POST initiation form',!!markup);
  const csrf=/name="csrf" value="([^"]+)"/.exec(markup[1])[1],cookie=get.headers.get('Set-Cookie').split(';')[0];
  ok('.217 entry cookie is the original privacy form nonce only',cookie.startsWith(forms.FORM_COOKIE+'='));
  const head=await route(new Request(BASE+'/privacy/signin',{method:'HEAD'}));eq('.217 privacy sign-in HEAD is non-allocating',head.status,200);eq('.217 HEAD has no body',await head.text(),'');
  const post=(fields={csrf},over={},url=BASE+'/privacy/signin')=>{const headers=new Headers({Cookie:cookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':access.privacyAccessRandomId()});for(const [key,value]of Object.entries(over)){if(value===null)headers.delete(key);else headers.set(key,value);}return new Request(url,{method:'POST',headers,body:new URLSearchParams(fields)});};
  const wrongPurpose=await forms.formToken(f.env,cookie.slice(cookie.indexOf('=')+1),'copy-export');
  for(const [name,request]of [['missing origin',post({csrf},{Origin:null})],['foreign origin',post({csrf},{Origin:'https://other.invalid'})],['missing nonce',post({csrf},{Cookie:''})],['duplicate nonce',post({csrf},{Cookie:cookie+'; '+cookie})],['wrong purpose',post({csrf:wrongPurpose})],['missing token',post({})],['unknown field',post({csrf,extra:'not-an-initiation-field'})],['query',post({csrf},{},BASE+'/privacy/signin?extra=1')],['wrong media',post({csrf},{'Content-Type':'application/json'})]]){
   const response=await route(request);ok('.217 '+name+' initiation refuses',response.status>=400);eq('.217 '+name+' leaves flow state empty',count(f,'privacy_access_oauth'),0);
  }
  const duplicate=post();const duplicateBody=await duplicate.text(),duplicateRequest=new Request(duplicate.url,{method:'POST',headers:duplicate.headers,body:duplicateBody+'&csrf='+encodeURIComponent(csrf)});
  ok('.217 duplicate token field refuses',(await route(duplicateRequest)).status>=400);eq('.217 duplicate field leaves flow state empty',count(f,'privacy_access_oauth'),0);
  const OriginalDate=vm.runInContext('Date',context);context.Date=class extends OriginalDate{static now(){return OriginalDate.now()+3601000;}};
  try{ok('.217 correctly signed expired initiation token refuses',(await route(post())).status>=400);}finally{context.Date=OriginalDate;}
  eq('.217 rejected initiations make no provider calls',calls.length,0);eq('.217 rejected initiations create no flows',count(f,'privacy_access_oauth'),0);
  const begun=await route(post()),authorize=new URL(begun.headers.get('Location'));
  eq('.217 valid initiation returns the original OAuth redirect',begun.status,303);eq('.217 valid initiation creates one flow',count(f,'privacy_access_oauth'),1);
  eq('.217 valid initiation keeps identify-only scope',authorize.searchParams.get('scope'),'identify');eq('.217 valid initiation retains300-second flow lifetime',f.db.prepare('SELECT expires_at-created_at AS ttl FROM privacy_access_oauth').get().ttl,300);
  eq('.217 initiation creates no account or role authority',[count(f,'site_users'),count(f,'members'),count(f,'role_settlements')],[0,0,0]);eq('.217 initiation performs no DDL',count(f,'sqlite_master'),schemaBefore);f.db.close();
 }
 provider=null;console.log(`privacy_access_test: ${checks} checks PASS`);
}
main().catch(e=>{console.error('FAIL privacy_access_test',e);process.exitCode=1;});

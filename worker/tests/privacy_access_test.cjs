// Real source, native SQLite, WebCrypto and bounded identify-only OAuth. Only Discord HTTP is faked.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),{DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=new Map();let checks=0,calls=[],provider;
const ok=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
const eq=(name,value,want)=>{assert.deepEqual(value,want,name);checks++;console.log('PASS '+name);};
const context=vm.createContext({crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,console,Request,Response,Headers,URL,URLSearchParams,atob,btoa,AbortController,AbortSignal,setTimeout,clearTimeout,
 fetch:async(url,init)=>{calls.push({url:String(url),init});if(!provider)throw Error('network forbidden');return provider(String(url),init);}});
function load(name){
 if(cache.has(name))return cache.get(name).exports;
 const module={exports:{}};cache.set(name,module);
 const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInContext('(function(require,module,exports){'+js+'\n})',context,{filename:name})(q=>{if(!q.startsWith('./'))throw Error('external module refused');return load(q.slice(2));},module,module.exports);
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
function fixture(hooks={}){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(fs.readFileSync(path.join(root,'schema.sql'),'utf8'));for(const s of serving.PRIVACY_SERVING_SCHEMA)db.exec(s);for(const s of ddl.PRIVACY_ACCESS_SCHEMA)db.exec(s);
 let now=Math.floor(Date.now()/1000);db.function('strftime',(format,input)=>{assert.equal(format,'%s');assert.equal(input,'now');return String(now);});
 const env={DB:d1(db,hooks),COOKIE_SECRET:'test-only-privacy-cookie-key',DISCORD_APP_ID:'44444444444444444',DISCORD_CLIENT_SECRET:'test-only-oauth-client',SITE_HOST:'olympus.roachcouncil.com',GUILD_ID:'55555555555555555',ROLE_GUILD_MEMBER:'66666666666666666',PRIVACY_ERASURE_ENABLED:'true'};
 return {db,env,hooks,time:()=>now,advance:n=>now+=n,setTime:n=>now=n};}
function subject(f,state='active'){f.db.prepare('INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until) VALUES(?,?,?,?,?,?,?,?)').run(A,G,state,3,f.time(),f.time(),state==='retired'?f.time():null,state==='retired'?f.time()+366*86400:null);}
const count=(f,table)=>f.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
function oauthProvider(id=A,scope='identify'){provider=(url,init)=>{
 if(url==='https://discord.com/api/oauth2/token'){assert.equal(init.redirect,'manual');assert.equal(init.method,'POST');eq('provider callback is allowlisted',init.body.get('redirect_uri'),BASE+'/privacy/callback');return new Response(JSON.stringify({access_token:'test-access-token',token_type:'Bearer',scope}));}
 if(url==='https://discord.com/api/v10/users/@me'){assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer test-access-token');return new Response(JSON.stringify({id,username:'ignored-new-name'}));}
 throw Error('unexpected provider endpoint '+url);};}
async function start(f){const r=await access.beginPrivacyAccess(new Request(BASE+'/privacy/signin',{headers:{'CF-Connecting-IP':access.privacyAccessRandomId()}}),f.env);const u=new URL(r.headers.get('Location'));
 eq('OAuth scope is identify only',u.searchParams.get('scope'),'identify');eq('OAuth uses registered privacy callback',u.searchParams.get('redirect_uri'),BASE+'/privacy/callback');
 return {state:u.searchParams.get('state'),flowCookie:r.headers.get('Set-Cookie').split(';')[0]};}
async function finish(f,flow){return access.finishPrivacyAccess(new Request(BASE+'/privacy/callback?state='+flow.state+'&code=original_code&iss=https%3A%2F%2Fdiscord.com',{headers:{Cookie:flow.flowCookie}}),f.env);}
async function connect(f,id=A){oauthProvider(id);const flow=await start(f),r=await finish(f,flow);eq('callback redirects privacy lane',r.headers.get('Location'),'/privacy/access');const cs=r.headers.get('Set-Cookie');ok('callback never issues ordinary cookie',!/(?:^|, )__Host-olg=/.test(cs));return {flow,cookie:cs.split(', ').find(x=>x.startsWith(access.PRIVACY_ACCESS_COOKIE+'=')).split(';')[0]};}
async function form(f,c,purpose='own_export'){const page=await access.privacyAccessPage(new Request(BASE+'/privacy/access',{headers:{Cookie:c.cookie}}),f.env),html=await page.text();
 ok('privacy page has script-free CSP',page.headers.get('Content-Security-Policy').includes("script-src 'none'"));ok('privacy page has no script',!/<script\b/i.test(html));
 const action=purpose==='own_export'?'export':'erasure',section=new RegExp('<form method="post" action="/privacy/access/'+action+'">([\\s\\S]*?)</form>').exec(html);assert.ok(section);
 const csrf=/name="csrf" value="([^"]+)"/.exec(section[1])[1],grant=/name="grant" value="([^"]+)"/.exec(section[1])[1];
 return {csrf,grant,request:(fields={},headers={})=>new Request(BASE+'/privacy/access/'+action,{method:'POST',headers:{Cookie:c.cookie,Origin:BASE,'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({csrf,grant,...(purpose==='own_erasure'?{confirm:'yes'}:{}),...fields})})};}
async function refused(name,fn){let threw=false;try{await fn();}catch{threw=true;}ok(name,threw);}
async function main(){
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
 for(const [name,mutate] of [['absence created',f=>subject(f)],['generation ABA',f=>f.db.prepare('UPDATE privacy_subjects SET generation=?').run('b'.repeat(32))],['revision changed',f=>f.db.exec('UPDATE privacy_subjects SET revision=revision+1')],['retiring',f=>f.db.exec("UPDATE privacy_subjects SET state='retiring'")]]){
  f=fixture();if(name!=='absence created')subject(f);const c=await connect(f),frm=await form(f,c);f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;mutate(f);}};
  await refused(name+' between original read and native export guarded',()=>copy.exportPrivacyAccess(frm.request(),f.env));eq(name+' rolls back consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 }
 f=fixture();subject(f);const c3=await connect(f),frm3=await form(f,c3);f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;f.advance(721);}};await refused('expiry after grant read refuses native batch',()=>copy.exportPrivacyAccess(frm3.request(),f.env));eq('expired original action never consumed',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get().consumed_at,null);f.db.close();
 f=fixture();subject(f);oauthProvider();const flow=await start(f);f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants'))){f.hooks.beforeBatch=null;f.db.exec('UPDATE privacy_subjects SET revision=revision+1');}};await refused('callback original capture race refused',()=>finish(f,flow));eq('callback capture race issues no grants',count(f,'privacy_access_grants'),0);eq('callback capture race changes no site account',count(f,'site_users'),0);f.db.close();
 f=fixture();oauthProvider(A,'identify guilds.members.read');const broad=await start(f);calls=[];await refused('broad provider scope rejected',()=>finish(f,broad));eq('broad provider scope never reads identity',calls.length,1);eq('broad provider scope issues no grants',count(f,'privacy_access_grants'),0);f.db.close();
 // RFC 6749 §5.1 variants preserve the original identify-only request, grant
 // lifetimes and one-exchange rule; an explicitly different scope still refuses.
 for(const [name,token,accept] of [
  ['lowercase bearer',{token_type:'bearer',scope:'identify'},true],
  ['uppercase bearer',{token_type:'BEARER',scope:'identify'},true],
  ['mixed bearer',{token_type:'bEaReR',scope:'identify'},true],
  ['unchanged scope omitted',{token_type:'Bearer'},true],
  ['both standard variants',{token_type:'bearer'},true],
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
 const secretSentinel='synthetic-private-code-cookie-token-identity-DO-NOT-REFLECT';
 const diagnostics=[
  ['token request','PA-T1',(f)=>{provider=()=>{throw Error(secretSentinel);};}],
  ['token HTTP','PA-T2',(f)=>{provider=()=>new Response(secretSentinel,{status:503});}],
  ['token body','PA-T3',(f)=>{provider=()=>new Response(secretSentinel);}],
  ['token shape','PA-T4',(f)=>{provider=()=>new Response(JSON.stringify({token_type:'Bearer',scope:'identify'}));}],
  ['token type','PA-T5',(f)=>{provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'MAC',scope:'identify'}));}],
  ['token scope','PA-T6D',(f)=>{provider=()=>new Response(JSON.stringify({access_token:secretSentinel,token_type:'Bearer',scope:'identify email'}));}],
  ['identity request','PA-I1',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?Promise.reject(Error(secretSentinel)):normal(url,init);}],
  ['identity HTTP','PA-I2',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(secretSentinel,{status:503}):normal(url,init);}],
  ['identity body','PA-I3',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(secretSentinel):normal(url,init);}],
  ['identity shape','PA-I4',(f)=>{const normal=provider;provider=(url,init)=>url.endsWith('/users/@me')?new Response(JSON.stringify({id:secretSentinel})):normal(url,init);}],
  ['subject read','PA-S1',(f)=>{f.hooks.beforeRead=sql=>{if(sql.startsWith('SELECT generation,state,revision FROM privacy_subjects'))throw Error(secretSentinel);};}],
  ['grant material','PA-G1',(f)=>{f.env.COOKIE_SECRET=Symbol(secretSentinel);}],
  ['grant batch','PA-G2',(f)=>{f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants')))throw Error(secretSentinel);};}],
  ['grant receipt','PA-G3',(f)=>{const native=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async stmts=>{const rows=await native(stmts);return stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_access_grants'))?rows.slice(0,3):rows;};}],
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
 // .140 categories are diagnosis only. Every alternative spends the same native
 // state and stops before identity HTTP/capture/grants; no normalization admits.
 const genericScopeHtml=await access.privacyAccessRefusal(new Request(BASE+'/privacy/callback'),new (load('policy-form-core').FormError)('identity_exchange_scope_refused',503)).text();
 for(const [name,scope,marker] of [
  ['null',null,'PA-T6A'],['boolean',false,'PA-T6A'],['number',0,'PA-T6A'],
  ['object',{identify:secretSentinel},'PA-T6A'],['array',['identify'],'PA-T6A'],
  ['empty','','PA-T6B'],['leading ASCII space',' identify','PA-T6C'],
  ['trailing ASCII space','identify ','PA-T6C'],['surrounding ASCII spaces','  identify  ','PA-T6C'],
  ['repeated identify','identify identify','PA-T6C'],['repeated formatted identify',' identify  identify ','PA-T6C'],
  ['broader identify first','identify email','PA-T6D'],['broader identify last','email identify','PA-T6D'],
  ['broader repeated identify','identify identify email','PA-T6D'],['case-sensitive extra token','identify Identify','PA-T6D'],
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
 f=fixture();f.db.prepare('INSERT INTO members(discord_id,banned,ban_reason) VALUES(?,1,?)').run(A,'private staff reason');f.db.prepare('INSERT INTO members(discord_id,banned,ban_reason) VALUES(?,0,?)').run(B,'counterparty');
 f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version,denied,denied_reason,denied_by) VALUES(?,?,?,?,?,?,?,?)').run(A,f.time(),f.time(),0,7,1,'private denial',STAFF);
 f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,in_server,session_version) VALUES(?,?,?,?,?)').run(B,f.time(),f.time(),1,2);
 f.db.prepare('INSERT INTO site_friends(owner_id,friend_kind,friend_key,friend_label,note,created_at) VALUES(?,?,?,?,?,?)').run(A,'discord',B,'Chosen label','own note',f.time());
 f.db.prepare('INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)').run(f.time(),STAFF,'own.action',A,JSON.stringify({staff:STAFF,other:B}));
 f.db.prepare('INSERT INTO audit(ts,actor,action,subject,details) VALUES(?,?,?,?,?)').run(f.time(),STAFF,'other.action',B,'private');
 const c4=await connect(f),frm4=await form(f,c4),data=await (await copy.exportPrivacyAccess(frm4.request(),f.env)).json(),serialized=JSON.stringify(data);
 ok('banned departed denied export succeeds',data.verification.bannedFromVerifying&&data.account.inServer===false&&data.account.denied);ok('no counterparty or staff structural identity',!serialized.includes(B)&&!serialized.includes(STAFF));ok('private staff reasons omitted',!serialized.includes('private staff reason')&&!serialized.includes('private denial'));eq('only own actions copied',data.actions.rows.length,1);eq('existing ordinary version unchanged by identity/export',f.db.prepare('SELECT session_version FROM site_users WHERE discord_id=?').get(A).session_version,7);f.db.close();
 f=fixture();f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)').run(A,f.time(),f.time(),4);f.db.prepare('INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(A,'member',JSON.stringify({references:[null,1,'legacy',[],{kind:'discord',label:'Chosen reference',key:B},{kind:{id:B},label:{id:STAFF}}]}),'submitted',f.time(),f.time());
 const cLegacy=await connect(f),formLegacy=await form(f,cLegacy),legacy=await (await copy.exportPrivacyAccess(formLegacy.request(),f.env)).json();eq('legacy malformed references do not consume without copy',legacy.site.application.answers.references.length,2);ok('legacy reference projection withholds structural identities',!JSON.stringify(legacy).includes(B)&&!JSON.stringify(legacy).includes(STAFF));f.db.close();
 for(const [shape,references] of [['object',{kind:'discord',key:B,label:'Chosen reference'}],['string',B],['number',123],['boolean',true],['null',null]]){
  f=fixture();f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)').run(A,f.time(),f.time(),4);
  f.db.prepare('INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(A,'member',JSON.stringify({references,ownText:'User-authored mention '+B}),'submitted',f.time(),f.time());
  const c=await connect(f),frm=await form(f,c),response=await copy.exportPrivacyAccess(frm.request(),f.env),data=await response.json();eq(shape+' references export safely',response.status,200);eq(shape+' malformed references conservatively withheld',data.site.application.answers.references,null);eq(shape+' preserves other user-authored answer text',data.site.application.answers.ownText,'User-authored mention '+B);f.db.close();
 }
 f=fixture();f.db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,session_version) VALUES(?,?,?,?)').run(A,f.time(),f.time(),4);
 f.db.prepare('INSERT INTO site_applications(discord_id,position,answers,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(A,'member',JSON.stringify({references:[{kind:'discord',key:B,label:'Chosen reference'},null,7,'legacy',[{key:B}],{kind:B,label:{key:STAFF}}]}),'submitted',f.time(),f.time());
 const cMixed=await connect(f),formMixed=await form(f,cMixed),mixed=await (await copy.exportPrivacyAccess(formMixed.request(),f.env)).json();eq('mixed reference arrays preserve valid minimal projection',mixed.site.application.answers.references,[{kind:'discord',label:'Chosen reference'},{kind:null,label:null}]);ok('mixed reference arrays withhold all malformed structural keys',!JSON.stringify(mixed).includes(B)&&!JSON.stringify(mixed).includes(STAFF));f.db.close();
 f=fixture();const c5=await connect(f),frm5=await form(f,c5,'own_erasure'),result=await erase.erasePrivacyAccess(frm5.request(),f.env),html=await result.text();eq('accountless erasure admitted queued',result.status,202);eq('accountless erasure no website account',count(f,'site_users'),0);eq('accountless erasure no bot member',count(f,'members'),0);eq('accountless erasure no direct role intent',count(f,'role_settlements'),0);eq('accountless subject retiring',f.db.prepare('SELECT state FROM privacy_subjects WHERE subject_id=?').get(A).state,'retiring');eq('durable job only one',count(f,'privacy_serving_jobs'),1);eq('job uses fixed identity deadline',f.db.prepare('SELECT original_session_expires FROM privacy_serving_jobs').get().original_session_expires,f.db.prepare("SELECT expires_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().expires_at);ok('erasure no all-copies claim',html.includes('does not mean every copy was erased'));eq('same purpose replay recovers original status',(await erase.erasePrivacyAccess(frm5.request(),f.env)).status,202);eq('erasure replay does not add jobs',count(f,'privacy_serving_jobs'),1);eq('erasure replay does not advance revision',f.db.prepare('SELECT revision FROM privacy_subjects').get().revision,1);f.db.close();
 for(const [name,mutate] of [['generation',f=>f.db.prepare('UPDATE privacy_subjects SET generation=?').run('b'.repeat(32))],['revision',f=>f.db.exec('UPDATE privacy_subjects SET revision=revision+1')],['absence',f=>subject(f)],['expiry',f=>f.advance(720)]]){
  f=fixture();if(name==='generation'||name==='revision')subject(f);const c=await connect(f),frm=await form(f,c,'own_erasure');f.hooks.beforeBatch=stmts=>{if(stmts.some(x=>x.sql.includes('privacy_access_action_refused'))){f.hooks.beforeBatch=null;mutate(f);}};
  const r=await erase.erasePrivacyAccess(frm.request(),f.env);eq('stale '+name+' erasure not confirmed',r.status,503);eq('stale '+name+' no job',count(f,'privacy_serving_jobs'),0);eq('stale '+name+' no role intent',count(f,'role_settlements'),0);eq('stale '+name+' grants remain unconsumed',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().consumed_at,null);f.db.close();
 }
 for(const state of ['retiring','retired']){f=fixture();subject(f,state);const c=await connect(f),frm=await form(f,c,'own_erasure');eq(state+' with no retained job remains held',(await erase.erasePrivacyAccess(frm.request(),f.env)).status,503);eq(state+' not reopened',f.db.prepare('SELECT state FROM privacy_subjects').get().state,state);eq(state+' no new job',count(f,'privacy_serving_jobs'),0);f.db.close();}
 for(const state of ['retiring','retired']){f=fixture();subject(f,state);const op='9'.repeat(32);f.db.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,completed_at,retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(op,A,G,'8'.repeat(64),7,f.time()+200,state==='retired'?'complete':'held',f.time(),state==='retired'?f.time():null,f.time()+366*86400);
  const c=await connect(f),frm=await form(f,c,'own_erasure');let lost=false;f.hooks.afterBatch=stmts=>{if(!lost&&stmts.some(x=>x.sql.startsWith('UPDATE privacy_access_grants SET erasure_operation'))){lost=true;throw Error('lost existing status reply');}};
  const r=await erase.erasePrivacyAccess(frm.request(),f.env),html=await r.text();eq(state+' existing status lost reply recovers',r.status,state==='retired'?200:202);ok(state+' existing receipt references original job',html.includes(op));eq(state+' status pointer binds consumed grant',f.db.prepare("SELECT erasure_operation FROM privacy_access_grants WHERE purpose='own_erasure'").get().erasure_operation,op);eq(state+' same form status replay resolves exact old job',(await erase.erasePrivacyAccess(frm.request(),f.env)).status,state==='retired'?200:202);eq(state+' replay never adds another job',count(f,'privacy_serving_jobs'),1);eq(state+' replay never changes revision',f.db.prepare('SELECT revision FROM privacy_subjects').get().revision,3);eq(state+' status replay never creates role intent',count(f,'role_settlements'),0);f.db.close();}
 f=fixture();const cEnd=await connect(f),formEnd=await form(f,cEnd,'own_erasure');f.hooks.step=(_i,sql)=>{if(sql.includes('privacy_identify_erasure_unconfirmed'))f.advance(720);};eq('erasure final original deadline not confirmed',(await erase.erasePrivacyAccess(formEnd.request(),f.env)).status,503);eq('erasure final deadline rolls back subject/job',[count(f,'privacy_subjects'),count(f,'privacy_serving_jobs')],[0,0]);eq('erasure final deadline rolls back grant consumption',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_erasure'").get().consumed_at,null);f.db.close();
 f=fixture();const c6=await connect(f),frm6=await form(f,c6,'own_erasure');let lost=false;f.hooks.afterBatch=stmts=>{if(!lost&&stmts.some(x=>x.sql.startsWith('INSERT INTO privacy_serving_jobs'))){lost=true;throw Error('lost commit response');}};eq('lost commit reply resolves exact durable job',(await erase.erasePrivacyAccess(frm6.request(),f.env)).status,202);eq('lost reply persists one job',count(f,'privacy_serving_jobs'),1);f.db.close();
 f=fixture();eq('purge exactly two statements',access.privacyAccessPurgeStatements(f.env).length,2);for(let i=0;i<125;i++)f.db.prepare("INSERT INTO privacy_access_oauth VALUES(?,?,'privacy_identify',?,?,NULL)").run(i.toString(16).padStart(64,'0'),'a'.repeat(64),f.time()-301,f.time()-1);await f.env.DB.batch(access.privacyAccessPurgeStatements(f.env));eq('purge bounded100 per table',count(f,'privacy_access_oauth'),25);f.db.close();
 provider=null;console.log(`privacy_access_test: ${checks} checks PASS`);
}
main().catch(e=>{console.error('FAIL privacy_access_test',e);process.exitCode=1;});

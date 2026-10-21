'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite'),ts=require('typescript'),entry=require('./helpers/privacy129_fixture.cjs');
const root=path.resolve(__dirname,'..'),SUBJECT='300000000000000002';
let checks=0,providerCalls=0;const logs=[];
function check(name,condition){assert.ok(condition,name);checks++;console.log('PASS '+name);}
function sourceGraph() {
  const cache = new Map();
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    console: { log: (...values) => logs.push(values), error: (...values) => logs.push(values), warn: (...values) => logs.push(values) },
    fetch() { providerCalls++; throw Error('Provider transport is forbidden in the Army staging fixture'); } });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('Fixture source name refused');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })(dependency => {
      if (dependency === 'node:async_hooks') return require(dependency);
      if (!dependency.startsWith('./')) throw Error('External source dependency refused');
      return load(dependency.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

async function fresh(options={}) {
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');entry.installCurrentEntryEpoch(db);
  const now=db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) t").get().t,hooks={},native=entry.originalNativePort(db,{beforeBatch:plan=>hooks.beforeBatch?.(plan)}),load=sourceGraph();
  const rawEnv=entry.currentEntryEnvironment({DB:native,COOKIE_SECRET:'army-publish-fictional-cookie-secret-only',VERIFY_SECRET:'army-publish-fictional-verify-only',SITE_HOST:'guild.example',SITE_GUILD_ID:'236932545793490944',GUILD_ID:'1549537348516188200',DISCORD_APP_ID:'1550176895671341076',SITE_ADMINS:options.admin===false?'':SUBJECT,COMMUNITY_FEATURES:'directory,census',PUBLIC_BASE_URL:'https://verify.example'});
  const writer=load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native,'writer','canonical',entry.ENTRY_EPOCH),env={...rawEnv,DB:writer};
  const write=(sql,...args)=>writer.prepare(sql).bind(...args).run();
  await write('INSERT INTO site_users(discord_id,username,first_login,last_login,checked_at,in_server,denied,session_version) VALUES(?,?,?,?,?,1,0,1)',SUBJECT,'fictional-admin',now,now,now);
  await write('INSERT INTO members(discord_id) VALUES(?)',SUBJECT);
  const issued=await entry.issueOriginalEntryCookie(load,db,rawEnv,SUBJECT),route=load('army-census');
  function request(endpoint,body,options={}){const method=options.method||(endpoint==='reporter'?'GET':'POST');return new Request('https://guild.example/api/army/'+endpoint+(options.query||''),{method,headers:{Cookie:issued.cookie,Origin:'https://guild.example','X-Olympus':'2','Content-Type':'application/json',...options.headers},...(!['GET','HEAD'].includes(method)?{body:typeof body==='string'||body instanceof ReadableStream?body:JSON.stringify(body),duplex:'half'}:{})});}
  async function call(endpoint,body,options={}){const response=await route.armyPrivate(request(endpoint,body,options),env,'/api/army/'+endpoint);return{status:response.status,body:await response.json(),response};}
  const readerRequest=(pathname='/api/army',options={})=>new Request('https://guild.example'+pathname,{method:options.method||'GET',headers:{Cookie:issued.cookie,...options.headers}});
  const publicRead=async(options={})=>{const response=await route.armyPublic(readerRequest('/api/army',options),env);return{status:response.status,body:options.method==='HEAD'?null:await response.json(),response};};
  return{db,now,write,load,env,native,hooks,route,request,readerRequest,call,publicRead,close:()=>db.close()};
}
function snapshot(now,overrides={}){return{format:'olympus-stat-observation-v2',scope:'own-guild',source:'volunteer-client',sourceVerified:false,membershipProof:false,addonVersion:'0.2.0',realmGroup:'World of Warcraft: Forever PvE',faction:'Alliance',observedAt:now-10,guilds:[{name:'Olympus',receivedAt:now-10,reportedCharacters:100,online:25,classes:[20,10,10,10,10,10,10,10,10],levels:[0,0,10,10,10,20,50],ranks:[10,10,10,10,10,10,10,10,10,10]}],...overrides};}
async function scenario(name,run,options){const f=await fresh(options);try{await run(f);console.log('CASE '+name);}finally{f.close();}}
function schema(f){return JSON.stringify(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name").all());}
function epoch(f){return JSON.stringify(f.db.prepare('SELECT * FROM privacy_write_admission').all());}
(async()=>{
  await scenario('explicit publication, signed-in aggregate read and safe idempotence',async f=>{
    const before=schema(f),nativeBefore=epoch(f),value=snapshot(f.now),allBefore=f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n;
    // Canonical local fixture has445 objects; production recorded-live has443 and is checked separately at rollout.
    check('original canonical Native fixture has445 objects before unchanged-schema proof',f.db.prepare('SELECT COUNT(*) n FROM sqlite_schema').get().n===445);
    const cap=await f.call('reporter');check('current site Admin can report without a character proof',cap.status===200&&cap.body.canPublish===true);
    const empty=await f.publicRead();check('signed-in Army starts empty and exposes no private member payload',empty.status===200&&empty.body.snapshots.length===0&&Object.keys(empty.body).join(',')==='format,now,snapshots');
    const preview=await f.call('preview',{snapshot:value});check('preview returns exact reviewed aggregate and short private token without persistence',preview.status===200&&preview.body.persisted===false&&JSON.stringify(preview.body.snapshot)===JSON.stringify(value)&&typeof preview.body.previewToken==='string'&&f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n===allBefore);
    const args={snapshot:preview.body.snapshot,previewToken:preview.body.previewToken,confirm:'PUBLISH'},published=await f.call('publish',args);
    check('explicit confirmed publish persists once under actual original Native admission',published.status===200&&published.body.state==='published');
    const rows=f.db.prepare("SELECT * FROM site_settings WHERE key LIKE 'army:%'").all();check('storage is exactly one aggregate-only row with anonymous updated_by',rows.length===1&&rows[0].key==='army:census:v2:1'&&rows[0].updated_by===null&&rows[0].updated_at===value.observedAt&&rows[0].value===JSON.stringify(value));
    check('row contains no personal ID, original session, preview token or QR frame',![SUBJECT,preview.body.previewToken,'OLCS2|','account_incarnation','username'].some(s=>JSON.stringify(rows).includes(s)));
    const reread=await f.publicRead();check('current signed-in reader sees only the shared aggregate',reread.status===200&&JSON.stringify(reread.body.snapshots[0])===JSON.stringify(value));
    const again=await f.call('publish',args);check('exact replay reports published without another row',again.status===200&&f.db.prepare("SELECT COUNT(*) n FROM site_settings WHERE key LIKE 'army:%'").get().n===1);
    const outcome=await f.call('outcome',{snapshot:value,previewToken:preview.body.previewToken});check('lost-answer recovery reads exact original aggregate without retry',outcome.status===200&&outcome.body.state==='published');
    check('schema DDL and Native E2 control bytes remain exact through publication',schema(f)===before&&epoch(f)===nativeBefore);
    check('no new audit actor or personal attribution was added',f.db.prepare("SELECT COUNT(*) n FROM audit WHERE action LIKE 'army%'").get().n===0);
  });
  await scenario('accepted guild names own distinct fixed storage slots',async f=>{
    const names=['Olympus','Olympus I','Olympus II','Olympus III','Olympus IV','Olympus V','Olympus VI','Olympus VII','Olympus VIII','Olympus IX','Olympus X'];
    for(const [index,name]of names.entries()){
      const value=snapshot(f.now);value.guilds[0].name=name;
      assert.doesNotThrow(()=>f.route.validateArmySnapshot(value,f.now));
      check(name+' owns its unique closed slot',f.route.armyKey(value)==='army:census:v2:'+(index+1));
      if(index<2){const p=await f.call('preview',{snapshot:value}),out=await f.call('publish',{snapshot:value,previewToken:p.body.previewToken,confirm:'PUBLISH'});check(name+' publishes without replacing the other accepted guild',out.status===200);}
      else await f.write('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,NULL)',f.route.armyKey(value),JSON.stringify(value),value.observedAt);
    }
    const out=await f.publicRead();check('all eleven guild reports coexist without aliasing or overwrite',out.status===200&&out.body.snapshots.length===11&&JSON.stringify(out.body.snapshots.map(v=>v.guilds[0].name))===JSON.stringify(names)&&f.db.prepare("SELECT COUNT(*) n FROM site_settings WHERE key GLOB 'army:census:v2:*'").get().n===11);
  });
  await scenario('ordinary signed-in cohort can read without being promoted',async f=>{
    check('ordinary reader has no verified or roster-confirmed character',f.db.prepare('SELECT COUNT(*) n FROM characters WHERE discord_id=?').get(SUBJECT).n===0);
    const read=await f.publicRead();check('ordinary eligible signed-in user reads aggregate without character proof',read.status===200&&read.body.snapshots.length===0);
    const out=await f.call('preview',{snapshot:snapshot(f.now)});check('ordinary signed-in user with guild facts is not a reporter',out.status===403);
    const site=f.load('site-army'),page=await site.armyAfterMemberGate(f.readerRequest('/army'),f.env,'/army');
    check('ordinary unconfirmed user gets the signed-in reader document',page.status===200&&(await page.text()).includes('id="army-results"')&&page.headers.get('Cache-Control')==='private, no-store, no-transform'&&page.headers.get('Vary')==='Cookie');
    check('ordinary reader still cannot open the Admin publisher',(await site.armyAfterMemberGate(f.readerRequest('/army/report'),f.env,'/army/report')).status===403);
  },{admin:false});
  await scenario('finite Army gate replies and assets are cookie-dependent and HEAD-safe',async f=>{
    const site=f.load('site-army'),pages=f.load('army-pages');let assetFetches=0;
    f.env.ASSETS={fetch:async()=>{assetFetches++;return new Response('synthetic finite asset',{headers:{'Content-Type':'text/javascript'}});}};
    for(const method of ['GET','HEAD'])for(const pathname of ['/army','/army/report','/api/army','/api/army/reporter',...pages.ARMY_PUBLIC_ASSETS,...pages.ARMY_REPORTER_ASSETS]){
      const request=f.readerRequest(pathname,{method,headers:{Cookie:''}}),gate=new Response('signed out',{status:401,headers:{'Content-Type':'application/json'}}),out=site.armyGateReply(request,pathname,gate);
      check('finite '+method+' '+pathname+' refuses shared caching',out.status===401&&out.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.headers.get('Vary')==='Cookie'&&(method!=='HEAD'||await out.text()===''));
    }
    const original=new Response('unchanged',{status:403});check('unrelated route gate is returned without any mutation',site.armyGateReply(f.readerRequest('/api/me'),'/api/me',original)===original);
    for(const method of ['GET','HEAD'])for(const pathname of pages.ARMY_PUBLIC_ASSETS){const out=await site.armyAfterMemberGate(f.readerRequest(pathname,{method}),f.env,pathname);check('eligible '+method+' '+pathname+' remains a private asset',out.status===200&&out.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.headers.get('Vary')==='Cookie'&&(method!=='HEAD'||await out.text()===''));}
    check('only the eight deliberate eligible asset requests reached storage',assetFetches===pages.ARMY_PUBLIC_ASSETS.length*2);
    const reporterPage=await site.armyAfterMemberGate(f.readerRequest('/army/report'),f.env,'/army/report');check('private cache wrapper preserves admitted publisher camera and window policy',reporterPage.status===200&&reporterPage.headers.get('Permissions-Policy').includes('camera=(self)')&&reporterPage.headers.get('Permissions-Policy').includes('display-capture=(self)'));
  });
  await scenario('reader gate refuses cookie and User-Agent bypasses',async f=>{
    for(const method of ['GET','HEAD'])for(const headers of [{Cookie:''},{Cookie:'__Host-olg=made-up-session'},{Cookie:'', 'User-Agent':'Googlebot',Authorization:'Bearer pretend'}]){
      const out=await f.publicRead({method,headers});check('signed-out '+method+' remains401 without aggregate payload',out.status===401&&(method==='HEAD'?out.body===null:out.body.error==='signed_out'));
      check('refused '+method+' stays private and cookie-varying',out.response.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.response.headers.get('Vary')==='Cookie');
      if(method==='HEAD')check('refused HEAD has an empty body',(await out.response.text())==='');
    }
    await f.write('UPDATE members SET banned=1 WHERE discord_id=?',SUBJECT);check('current banned account cannot read shared counts',(await f.publicRead()).status===403);
  });
  await scenario('reader payload admission rechecks session and standing at the actual batch',async f=>{
    let rotated=false;
    f.hooks.beforeBatch=async plan=>{if(!rotated&&plan.some(s=>(s.sql||s.statement||'').includes("key GLOB 'army:census:v2:*'"))){rotated=true;await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',SUBJECT);}};
    const out=await f.publicRead();check('session rotation during payload read returns401 and no aggregate',rotated&&out.status===401&&out.body.error==='signed_out'&&!Object.hasOwn(out.body,'snapshots'));
  });
  await scenario('reader asset admission rechecks after awaited storage and never enters reporter controls',async f=>{
    const site=f.load('site-army'),asset='/static/army-live/army.js';let fetched=0;
    f.env.ASSETS={fetch:async()=>{fetched++;await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',SUBJECT);return new Response('private Army source',{headers:{'Content-Type':'text/javascript'}});}};
    const out=await site.armyAfterMemberGate(f.readerRequest(asset),f.env,asset);check('signout during asset fetch returns401 rather than source',fetched===1&&out.status===401&&(await out.text()).includes('signed_out'));
    check('revoked asset response retains private cookie-dependent caching',out.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.headers.get('Vary')==='Cookie');
  });
  for(const method of ['GET','HEAD'])for(const reason of ['retired','denied','banned'])await scenario('reporter '+method+' asset rechecks '+reason+' Admin after awaited storage',async f=>{
    const site=f.load('site-army'),asset='/static/army-live/report.js';let fetched=0;
    f.env.ASSETS={fetch:async()=>{fetched++;if(reason==='retired')await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',SUBJECT);else if(reason==='denied')await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?',SUBJECT);else await f.write('UPDATE members SET banned=1 WHERE discord_id=?',SUBJECT);return new Response('never release reporter source',{headers:{'Content-Type':'text/javascript'}});}};
    const out=await site.armyAfterMemberGate(f.readerRequest(asset,{method}),f.env,asset),body=await out.text();
    check('reporter '+method+' '+reason+' revocation withholds source',fetched===1&&out.status===(reason==='retired'?401:403)&&!body.includes('never release reporter source')&&(method==='HEAD'?body==='':JSON.parse(body).error===(reason==='retired'?'signed_out':'forbidden')));
    check('reporter '+method+' '+reason+' refusal remains private and cookie-varying',out.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.headers.get('Vary')==='Cookie');
  });
  await scenario('admission and request refusals before body use',async f=>{
    const input={snapshot:snapshot(f.now)};
    for(const [label,options,status]of[['signed out',{headers:{Cookie:''}},401],['cross origin',{headers:{Origin:'https://other.example'}},403],['old page',{headers:{'X-Olympus':'1'}},409],['wrong type',{headers:{'Content-Type':'text/plain'}},415],['encoded body',{headers:{'Content-Encoding':'gzip'}},415],['query',{query:'?uploads=true'},400]]){const o=await f.call('preview',input,options);check(label+' cannot publish',o.status===status);}
    await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?',SUBJECT);check('denied Admin cannot preview',(await f.call('preview',input)).status===403);
  });
  await scenario('strict aggregate fields, privacy masking and clocks',async f=>{
    const good=snapshot(f.now),parse=f.route.validateArmySnapshot;
    const P=require('../../tools/army-qr-live/protocol.js');check('canonical synthetic transfer agrees with browser v2 validator',P.validatePayload(new TextEncoder().encode(JSON.stringify(good)),{nowSeconds:f.now}).format===good.format);
    const uppercase=JSON.parse(JSON.stringify(good));uppercase.guilds[0].name='OLYMPUS';
    check('native uppercase guild remains a valid transfer label',P.validatePayload(new TextEncoder().encode(JSON.stringify(uppercase)),{nowSeconds:f.now}).guilds[0].name==='OLYMPUS');
    const rowsBefore=f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n;
    check('direct server preview still requires canonical guild spelling',(await f.call('preview',{snapshot:uppercase})).status===400&&f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n===rowsBefore);
    check('the existing canonical guild remains previewable without persistence',(await f.call('preview',{snapshot:good})).status===200&&f.db.prepare('SELECT COUNT(*) n FROM site_settings').get().n===rowsBefore);
    const mutations=[v=>v.characterNames=['Forbidden'],v=>v.guilds[0].notes='Forbidden',v=>v.guilds[0].reporterId=SUBJECT,v=>v.guilds[0].classes[0]=1,v=>v.guilds[0].levels.push(0),v=>v.guilds[0].ranks[0]=20,v=>v.guilds[0].name='Unlisted Guild',v=>v.observedAt=f.now+1,v=>v.observedAt=f.now-86401,v=>v.realmGroup=SUBJECT,v=>v.realmGroup='Arbitrary personal words',v=>v.faction='Horde',v=>v.membershipProof=true,v=>v.sourceVerified=true];
    for(let i=0;i<mutations.length;i++){const v=JSON.parse(JSON.stringify(good));mutations[i](v);assert.throws(()=>parse(v,f.now));check('aggregate mutation '+i+' refused before persistence',true);}
    const aged=JSON.parse(JSON.stringify(good));aged.observedAt=f.now-901;aged.guilds[0].receivedAt=aged.observedAt;check('direct server preview rejects already stale online even with matching source clocks',(await f.call('preview',{snapshot:aged})).status===400);aged.guilds[0].online=null;check('the same old source with online withheld remains eligible',(await f.call('preview',{snapshot:aged})).status===200);
    const small=JSON.parse(JSON.stringify(good));Object.assign(small.guilds[0],{reportedCharacters:'few',online:null,classes:null,levels:null,ranks:null});assert.doesNotThrow(()=>parse(small,f.now));check('small guild counts and all distributions remain withheld',true);
    const mismatch='{'+JSON.stringify({snapshot:good}).slice(1,-1)+',"snapshot":'+JSON.stringify(good)+'}';check('duplicate JSON keys are refused',(await f.call('preview',mismatch)).status===400);
    check('oversized streaming aggregate input refused',(await f.call('preview','x'.repeat(8193))).status===413);
  });
  await scenario('intent is exact, session-bound and confirm-gated',async f=>{
    const value=snapshot(f.now),preview=await f.call('preview',{snapshot:value}),base={snapshot:value,previewToken:preview.body.previewToken};
    check('missing explicit confirmation refuses publication',(await f.call('publish',{...base,confirm:''})).status===400);
    check('modified signed token refuses publication',(await f.call('publish',{...base,previewToken:base.previewToken.slice(0,-1)+(base.previewToken.endsWith('A')?'B':'A'),confirm:'PUBLISH'})).status===403);
    const changed=JSON.parse(JSON.stringify(value));changed.guilds[0].online=30;
    check('modified reviewed counts cannot reuse original token',(await f.call('publish',{snapshot:changed,previewToken:base.previewToken,confirm:'PUBLISH'})).status===409);
    await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',SUBJECT);
    check('signout/session rotation invalidates publication authority',(await f.call('publish',{...base,confirm:'PUBLISH'})).status===401);
    check('refusals leave no aggregate row',f.db.prepare("SELECT COUNT(*) n FROM site_settings WHERE key LIKE 'army:%'").get().n===0);
  });
  await scenario('concurrent preview cannot overwrite newer publication',async f=>{
    const old=snapshot(f.now),newer=snapshot(f.now,{observedAt:f.now-5});newer.guilds[0].receivedAt=f.now-5;
    const a=await f.call('preview',{snapshot:old}),b=await f.call('preview',{snapshot:newer});
    check('newer confirmed snapshot succeeds',(await f.call('publish',{snapshot:newer,previewToken:b.body.previewToken,confirm:'PUBLISH'})).status===200);
    check('stale concurrent original intent cannot roll numbers backward',(await f.call('publish',{snapshot:old,previewToken:a.body.previewToken,confirm:'PUBLISH'})).status===409);
    check('original outcome distinguishes supersession',(await f.call('outcome',{snapshot:old,previewToken:a.body.previewToken})).body.state==='superseded');
  });
  await scenario('fresh SQL fence defeats revocation between preview and final write',async f=>{
    const value=snapshot(f.now),p=await f.call('preview',{snapshot:value});let revoked=false;
    f.hooks.beforeBatch=async plan=>{if(!revoked&&plan.some(s=>(s.sql||s.statement||'').includes('INSERT INTO site_settings'))){revoked=true;await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?',SUBJECT);}};
    const out=await f.call('publish',{snapshot:value,previewToken:p.body.previewToken,confirm:'PUBLISH'});check('live account denial at D1 execution prevents insert',out.status===409&&revoked&&f.db.prepare("SELECT COUNT(*) n FROM site_settings WHERE key LIKE 'army:%'").get().n===0);
  });
  await scenario('aging signed-in counts remain honest and bounded',async f=>{
    const value=snapshot(f.now);value.observedAt=f.now-901;value.guilds[0].receivedAt=value.observedAt;
    await f.write('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,NULL)','army:census:v2:1',JSON.stringify(value),value.observedAt);
    const out=await f.publicRead();check('signed-in online ages out after15minutes without source clock renewal',out.status===200&&out.body.snapshots[0].guilds[0].online===null&&out.body.snapshots[0].observedAt===value.observedAt);
    check('aggregate response is private and varies on Cookie',out.response.headers.get('Cache-Control')==='private, no-store, no-transform'&&out.response.headers.get('Vary')==='Cookie');
    const head=await f.route.armyPublic(f.readerRequest('/api/army',{method:'HEAD'}),f.env);check('signed-in HEAD is empty',head.status===200&&(await head.text())==='');
    const no=await f.route.armyPublic(new Request('https://guild.example/api/army',{method:'POST',body:'private text'}),f.env);check('anonymous public mutation is unavailable',no.status===405);
    await f.write('UPDATE site_settings SET updated_by=? WHERE key=?',SUBJECT,'army:census:v2:1');check('unexpected personal attribution holds public output',(await f.publicRead()).status===503);
  });
  check('all tested Army paths keep provider transport and logs empty',providerCalls===0&&logs.length===0);
  console.log('Army publication: '+checks+' checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

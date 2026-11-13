'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{build}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),arg=process.argv.slice(2),option=n=>{const i=arg.indexOf(n);return i<0?null:arg[i+1];},out=path.resolve(option('--out'));
fs.mkdirSync(out,{recursive:true});const layout=option('--layout')||'recorded-live-pre-seal-20261017';if(!['canonical','recorded-live-pre-seal-20261017'].includes(layout))throw Error('bad_layout');const kinds=option('--only')?.split(',')||['seq-ordinary','seq-ban','ordinary-last','ban-last','generation-late','generation-late-ban','erase-late','same-ordinary','same-ban','combined-transition','combined-conflict-ordinary','combined-conflict-ban','malformed-ordinary','malformed-ban','malformed-json','unknown-lane','wrap-ordinary','wrap-ban','lost-ordinary','lost-ban','marker-min','observer','read-unknown'];
const H=b=>crypto.createHash('sha256').update(b).digest('hex'),checks=[],observations=[],http=[];
const check=(name,pass,details)=>{checks.push({name,pass:!!pass,details});console.log((pass?'PASS ':'FAIL ')+name);};
const C0='100000000000000000',C1='111111111111111111',C2='222222222222222222',B2='500000000000000005',B0='300000000000000003',B1='400000000000000004',BOT='300000000000000099',G='236932545793490944',MEMBER='1552077551839617104',BASE='https://guild.example';
let mf;const providerGate={arrived:false,released:false};
(async()=>{const built=await build({entryPoints:[path.join(__dirname,'lane_progress280_fixture.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent',define:{TEST_LAYOUT280:JSON.stringify(layout)}}),bundle=built.outputFiles[0].text,pins=Object.keys(built.metafile.inputs).map(p=>({path:path.resolve(root,p),sha256:H(fs.readFileSync(path.resolve(root,p)))}));fs.writeFileSync(path.join(out,'bundle.mjs'),bundle);
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'wm280-'));
 try{mf=new Miniflare(convertV4MiniflareOptions({rootPath:runtime,script:bundle,modules:true,name:'lane-watermark280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(runtime,'t'),resourcePersistencePath:path.join(runtime,'p'),isolatedResourcePersistencePath:path.join(runtime,'i'),d1Databases:Object.fromEntries(kinds.map(k=>['DB_'+k.replaceAll('-','_'),'wm280-'+k])),outboundService:async request=>{
  const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,''),auth=request.headers.get('Authorization');http.push({at:Date.now(),method:request.method,origin:u.origin,path:p});assert.equal(u.origin,'https://discord.com');
  if(request.method==='POST'&&['/oauth2/token','/api/oauth2/token'].includes(p)){const body=new URLSearchParams(await request.text());assert.equal(body.get('client_secret'),'synthetic-watermark-client');assert.equal(body.get('code'),'code-'+B0);return Response.json({access_token:'tok-watermark',token_type:'Bearer',scope:'identify guilds.members.read'});}
  if(auth==='Bearer tok-watermark'&&p==='/users/@me')return Response.json({id:B0,username:'cursor-owner',global_name:'Cursor owner',avatar:null});
  if(auth==='Bearer tok-watermark'&&p==='/users/@me/guilds/'+G+'/member')return Response.json({user:{id:B0},roles:[MEMBER],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});
  if(request.method==='GET'&&p==='/users/@me')return Response.json({id:BOT,bot:true});
  if(request.method==='GET'&&p==='/guilds/'+G+'/roles')return Response.json([{id:G,name:'@everyone',position:0,permissions:'0',managed:false},{id:'888888888888888888',name:'Synthetic bot',position:40,permissions:'268435456',managed:false},...['1554261979684933742','1567917738985398384','1554262223038324840','1561096070040125460','1554262510650007602','1555639603619172504','1555640676287385771','1561096452057596005','1561096598296076460',MEMBER,'1561096900378103808','1561097105974628372'].map((id,i)=>({id,name:'Olympus '+['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Branch GM','Branch Officer','Veteran','Raider','Member','Alt','Initiate'][i],position:30-i,permissions:'0',managed:false}))]);
  const target=p.match(new RegExp('^/guilds/'+G+'/members/([0-9]+)$'));
  if(request.method==='GET'&&target&&auth==='Bot synthetic-watermark-bot-selected-capture'&&target[1]===B1){providerGate.arrived=true;const until=Date.now()+10000;while(!providerGate.released&&Date.now()<until)await new Promise(r=>setTimeout(r,10));if(!providerGate.released)throw Error('provider_gate_timeout');}
  if(request.method==='GET'&&target)return Response.json({user:{id:target[1]},roles:target[1]===BOT?['888888888888888888']:[C1,C2].includes(target[1])?[MEMBER]:[]});
  throw Error('Unplanned provider effect: '+request.method+' '+p);
 }}));await mf.ready;
 const call=async(kind,route,{method='GET',body,headers={}}={})=>{const url=new URL('http://fixture.invalid'+route);url.searchParams.set('case',kind);return mf.dispatchFetch(url.href,{method,redirect:'manual',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});};
 const json=async(kind,route,options)=>{const r=await call(kind,route,options),raw=await r.text();assert.equal(r.status,200,route+' '+raw);return JSON.parse(raw);};
 const waitGate=async(kind,lane)=>{const until=Date.now()+15000;while(Date.now()<until){const status=await json(kind,'/status');if(status.gates[lane])return status;await new Promise(r=>setTimeout(r,20));}throw Error('gate_not_reached:'+kind+':'+lane);};
 const lane=(kind,name)=>json(kind,'/lane?lane='+name,{method:'POST'});
 const release=(kind,name)=>json(kind,'/release?lane='+name,{method:'POST'});
 const disarm=kind=>json(kind,'/disarm',{method:'POST'});
 const eraseAccount=async kind=>{
  const front=route=>'/front'+route,jar=r=>r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const login=await call(kind,front('/auth/login'));const diagnostic={status:login.status,url:login.url,redirected:login.redirected,headers:[...login.headers],body:await login.clone().text()};fs.writeFileSync(path.join(out,'login-diagnostic-'+kind+'.json'),JSON.stringify(diagnostic,null,2));
  assert([302,303].includes(login.status));assert.equal(login.redirected,false);if(login.url)assert(['fixture.invalid','127.0.0.1','localhost'].includes(new URL(login.url).hostname));const authorize=new URL(login.headers.get('Location'));assert.equal(authorize.origin,'https://discord.com');assert.equal(authorize.pathname,'/oauth2/authorize');
  const state=authorize.searchParams.get('state'),callback=await call(kind,front('/auth/callback?code=code-'+B0+'&state='+encodeURIComponent(state)),{headers:{Cookie:jar(login)}});assert.equal(callback.status,303,await callback.clone().text());
  const response=await call(kind,front('/api/me/erasure'),{method:'POST',headers:{Cookie:jar(callback),'X-Olympus':'2'},body:{operationId:'d'.repeat(32)}}),erased={status:response.status,body:await response.json(),callback:callback.status};
  for(let i=0;i<2;i++){const view=await json(kind,'/inspect');if(view.jobs.some(j=>j.state==='complete'))break;const continued=await json(kind,'/continue',{method:'POST'});(erased.continuations??=[]).push(continued.result);}return erased;
 };
 for(const kind of kinds){
  const httpStart=http.length;const initial=await json(kind,'/setup',{method:'POST'}),initialLast=Math.max(0,...initial.initial.rows.map(r=>r.id));let middle=null,after=null,gate=null,erase=null,generation=null,completed=[],followups=[],observer=null;
  if(kind.startsWith('seq-')||kind==='history-1000'){
   for(const name of kind==='seq-ordinary'?['ordinary','ban']:['ban','ordinary'])completed.push(await lane(kind,name));after=await json(kind,'/inspect');
  }else if(['ordinary-last','ban-last','generation-late','generation-late-ban','erase-late'].includes(kind)){
   await json(kind,'/arm',{method:'POST'});const target=kind==='generation-late-ban'?'ban':'ordinary';const firstPromise=lane(kind,target);firstPromise.catch(()=>{});gate=await waitGate(kind,target);
   if(['ordinary-last','ban-last'].includes(kind)){
    const otherPromise=lane(kind,'ban');otherPromise.catch(()=>{});gate=await waitGate(kind,'ban');const first=kind==='ordinary-last'?'ban':'ordinary';await release(kind,first);completed.push(await(first==='ban'?otherPromise:firstPromise));middle=await json(kind,'/inspect');await release(kind,first==='ban'?'ordinary':'ban');completed.push(await(first==='ban'?firstPromise:otherPromise));
   }else{
    if(kind.startsWith('generation-late'))generation=await json(kind,'/generation'+(kind==='generation-late-ban'?'?subject='+B1:''),{method:'POST'});else erase=await eraseAccount(kind);
    middle=await json(kind,'/inspect');await release(kind,target);completed.push(await firstPromise);
   }
   after=await json(kind,'/inspect');await disarm(kind);
  }else if(kind.startsWith('same-')){
   const name=kind.slice(5);await json(kind,'/arm',{method:'POST'});const p1=lane(kind,name);p1.catch(()=>{});await waitGate(kind,name);await json(kind,'/advance?lane='+name,{method:'POST'});const p2=json(kind,'/lane?lane='+name+(name==='ordinary'?'&limit=2':''),{method:'POST'});p2.catch(()=>{});gate=await waitGate(kind,name+'2');await release(kind,name+'2');completed.push(await p2);middle=await json(kind,'/inspect');await release(kind,name);completed.push(await p1);after=await json(kind,'/inspect');await disarm(kind);
   check(kind+' newest own-lane append wins and stale original CAS holds',completed[0].result?.progress?.state==='recorded'&&completed[1].result?.progress?.state==='held'&&after.rows.length===initial.initial.rows.length+1,{completed,rows:after.rows});
   check(kind+' newer work remains retained',name==='ordinary'?after.latest?.a===11&&after.latest?.c===C2:after.latest?.b===B2,{latest:after.latest});
  }else if(kind==='combined-transition'){
   completed.push(await lane(kind,'ordinary'),await lane(kind,'ban'));middle=await json(kind,'/inspect');completed.push(await lane(kind,'combined'));after=await json(kind,'/inspect');
   check(kind+' legacy combined reader consumes latest independent heads',completed[2].result?.checked===0&&after.latest?.a===11&&after.latest?.c===''&&after.latest?.b===''&&!Object.hasOwn(after.latest,'lane')&&completed[2].result?.progress?.state==='recorded',{completed,latest:after.latest});
  }else if(kind.startsWith('combined-conflict-')){
   const name=kind.slice('combined-conflict-'.length);await json(kind,'/arm',{method:'POST'});const p=lane(kind,'combined');p.catch(()=>{});await waitGate(kind,'combined');const q=lane(kind,name);q.catch(()=>{});gate=await waitGate(kind,name);await release(kind,name);completed.push(await q);middle=await json(kind,'/inspect');await release(kind,'combined');completed.push(await p);after=await json(kind,'/inspect');await disarm(kind);
   check(kind+' legacy combined append guards both independent heads',completed[0].result?.progress?.state==='recorded'&&completed[1].result?.progress?.state==='held'&&JSON.stringify(after.rows)===JSON.stringify(middle.rows),{completed,rows:after.rows});
  }else if(kind.startsWith('malformed-')||kind==='unknown-lane'){
   const names=kind.startsWith('malformed-ban')?['ban','ordinary']:['ordinary','ban'];for(const name of names)completed.push(await lane(kind,name));after=await json(kind,'/inspect');
   const original=initial.initial.rows.at(-1);check(kind+' malformed raw original remains exact',after.rows.some(r=>r.id===original.id&&r.ts===original.ts&&r.details===original.details));
   const own=completed[0],other=completed[1],held=completed.filter(run=>run.result?.progress?.state==='held').length;check(kind+' invalid own progress preserves the head and publishes one id-free throttle per held lane',own.result?.progress?.state==='held'&&after.failures.length===held&&after.failures.every(row=>!JSON.stringify(row.details).match(/[0-9]{17,20}/)),{completed,failures:after.failures});
   check(kind+' confirmed corruption only holds progress and retains independent work',kind.startsWith('malformed-ordinary')?other.result?.progress?.state==='recorded'&&other.result.checked===1:kind.startsWith('malformed-ban')?other.result?.progress?.state==='recorded'&&other.result.checked===1:other.result?.progress?.state==='held'&&other.result.checked===1,{completed});
  }else if(kind.startsWith('wrap-')){
   const name=kind.slice(5);completed.push(await lane(kind,name));middle=await json(kind,'/inspect');completed.push(await lane(kind,name));after=await json(kind,'/inspect');
   check(kind+' empty cursor is legitimate wrap then next visit starts again',completed[0].result?.checked===0&&(name==='ordinary'?middle.latest?.c==='':middle.latest?.b==='')&&completed[1].result?.checked===1,{completed,middle:middle.latest,latest:after.latest});
  }else if(kind.startsWith('lost-')){
   const name=kind.slice(5);completed.push(await lane(kind,name));after=await json(kind,'/inspect');
   check(kind+' possibly committed progress reports unknown without retry or failure audit',completed[0].result?.progress?.state==='unknown'&&after.writes.length===1&&after.rows.length===initial.initial.rows.length+1&&after.failures.length===0&&after.writes[0].replyLost,{completed,rows:after.rows,writes:after.writes.map(w=>({lane:w.lane,replyLost:w.replyLost})),failures:after.failures});
   followups.push(await lane(kind,name));const later=await json(kind,'/inspect');check(kind+' fresh passive visit reads persisted progress without changing original unknown result',followups[0].result?.checked===0&&completed[0].result?.progress?.state==='unknown'&&later.unknowns.length===1,{followups});
  }else if(kind==='marker-min'){
   completed.push(await lane(kind,'ordinary'));after=await json(kind,'/inspect');check(kind+' first progress ignores erased replay marker in activity minimum',after.latest?.a===11&&after.latest?.c===C1&&completed[0].result?.checked===1,{latest:after.latest,completed});
  }else if(kind==='read-unknown'){
   completed.push(await lane(kind,'ordinary'));after=await json(kind,'/inspect');check(kind+' original Native read UNKNOWN never continues work or publishes progress',completed[0].result===null&&after.writes.length===0&&http.length===httpStart&&JSON.stringify(after.rows)===JSON.stringify(initial.initial.rows),{completed,failures:after.failures});
  }else if(kind==='selected-capture'){
   const pending=json(kind,'/selected-capture',{method:'POST'});pending.catch(()=>{});const until=Date.now()+10000;while(!providerGate.arrived&&Date.now()<until)await new Promise(r=>setTimeout(r,10));if(!providerGate.arrived){const early=await pending;fs.writeFileSync(path.join(out,'selected-early.json'),JSON.stringify(early,null,2));throw Error('actual first provider await not reached:'+JSON.stringify(early));}const mutation=await json(kind,'/mutate-selected',{method:'POST'});providerGate.released=true;observer=await pending;after=await json(kind,'/inspect');
   check(kind+' every passive selected reference is captured before first provider await',mutation.before.privacy_generation==='7'.repeat(32)&&mutation.after.privacy_generation==='8'.repeat(32)&&observer.result.checked.length===2&&observer.facts?.references.find(r=>r.subject===B2)?.capture?.subjectGeneration==='7'.repeat(32),{observer,mutation});
  }else if(kind==='observer'){
   observer=await json(kind,'/observer',{method:'POST'});after=await json(kind,'/inspect');
   check(kind+' original-result observer retains frozen selected before-await references',observer.available&&observer.frozen&&observer.subjects?.includes(B1)&&observer.originalGeneration==='7'.repeat(32)&&observer.held===false,{observer});
   check(kind+' cloned result/env/DB/cursor/array/accessor cannot adopt metadata',observer.available&&observer.tests.length===6&&observer.tests.every(t=>t.held)&&observer.getterCalls===0,{observer});
   check(kind+' public reconciliation JSON contains no generation or authority refs',observer.available&&!JSON.stringify(observer.publicResult).includes('7'.repeat(32))&&!Object.hasOwn(observer.publicResult,'references')&&!Object.hasOwn(observer.publicResult,'capture'),{publicResult:observer.publicResult});
  }else throw Error('unhandled_case:'+kind);
  if(kind==='history-1000'||kind.startsWith('seq-')||kind==='ordinary-last'||kind==='ban-last'){
   check(kind+' each lane records only its own cursor fields',after.writes.some(w=>w.lane==='ordinary'&&w.details.a===11&&w.details.c===C1&&!Object.hasOwn(w.details,'b'))&&after.writes.some(w=>w.lane==='ban'&&w.details.b===B1&&!Object.hasOwn(w.details,'a')&&!Object.hasOwn(w.details,'c')),{writes:after.writes.map(w=>({lane:w.lane,details:w.details}))});
   followups.push(await lane(kind,'ordinary'),await lane(kind,'ban'));check(kind+' actual next sweeps consume both independent latest heads',followups.every(f=>f.result?.checked===0),{followups});
   if(gate)check(kind+' both original writers reached pre-FFI before either completed',Object.hasOwn(gate.gates,'ordinary')&&Object.hasOwn(gate.gates,'ban'));
  }
  if(['generation-late','generation-late-ban','erase-late'].includes(kind)){
   if(kind==='erase-late'){
    check(kind+' original OAuth Native E2 terminal completes before late append',erase?.callback===303&&middle.jobs.some(j=>j.operation_id==='d'.repeat(32)&&j.state==='complete')&&middle.privacy?.state==='retired'&&middle.users.length===0&&middle.members.length===0&&middle.characters.length===0&&middle.initialAudit.length===0,{erase,privacy:middle.privacy,jobs:middle.jobs});
    check(kind+' generic terminal eraser removed existing references before late release',middle.rows.every(r=>!r.details.includes(B0)),{middle:middle.rows});
   }else{const p=kind==='generation-late-ban'?middle.newBPrivacy:middle.privacy;check(kind+' actual original generation changes before final append',p?.generation==='9'.repeat(32)&&p?.state==='active');}
   const subject=kind==='generation-late-ban'?B1:B0,newRows=after.rows.filter(r=>r.id>initialLast);
   check(kind+' no newly appended row recreates changed/retired b cursor',newRows.every(r=>!r.details.includes(subject)),{newRows,middle:middle.rows});
   check(kind+' final append does not retry/rebase or failure-audit on miss',after.writes.length===1&&after.failures.length===0&&completed[0].result?.progress?.state===(kind==='generation-late'?'recorded':'held'),{completed,attempts:after.writes.length,failures:after.failures});
  }
  check(kind+' seeded unknown tuple/body/clocks remain byte-identical',initial.initial.unknowns.length===1&&JSON.stringify(initial.initial.unknowns)===JSON.stringify(after.unknowns));
  check(kind+' actual Native1000/real-clock context closes idle',initial.actualNativeD1&&initial.rosterRows===1000&&after.control?.active===0&&after.control?.nonce==='');
  const plans=['seq-ordinary','seq-ban','history-1000'].includes(kind)?await json(kind,'/plans'):null;fs.writeFileSync(path.join(out,kind+'.json'),JSON.stringify({kind,layout,plans,initial,gate,middle,after,erase,generation,completed,followups,observer},null,2)+'\n');observations.push({kind,completed,followups,progress:after.rows.map(r=>({id:r.id,details:r.details})),erase});
 }
 check('no provider role/message mutation',http.every(h=>h.method==='GET'||h.method==='POST'&&['/oauth2/token','/api/oauth2/token'].includes(h.path)));
 const stable=pins.every(p=>H(fs.readFileSync(p.path))===p.sha256);check('all compiled exact component source and fixtures stable',stable);
 const result={at:new Date().toISOString(),layout,scope:'Outside actual source sweeps and genuine Native D1, synthetic data/providers, original real clock, no issuer/effect replacement. Erasure scope separately asserted. Component only, not whole schedule or release acceptance.',checks,passed:checks.filter(c=>c.pass).length,total:checks.length,observations,http,pins,stable,bundleSHA256:H(bundle)};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');if(result.passed!==result.total)process.exitCode=1;
 }finally{if(mf)await mf.dispose();}
})().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:String(error.stack),checks,observations},null,2));console.error(error.stack);process.exitCode=2;});

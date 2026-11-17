'use strict';
// Genuine local Workerd/D1, 1000 native rows. Only outbound Discord is synthetic.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build,stop}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-role-audit283-')),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const driver={path:__filename,sha256Before:hash(fs.readFileSync(__filename))},compiledInputs=new Map();
let source=null,inputs=[],compiledInputsComplete=false;
const custody=()=>{const finalDriver={...driver,sha256After:hash(fs.readFileSync(driver.path))},finalInputs=(compiledInputsComplete?inputs:[...compiledInputs].map(([path,sha256])=>({path,sha256,sha256AfterBundle:null}))).map(p=>({...p,sha256After:hash(fs.readFileSync(p.path))}));finalDriver.stable=finalDriver.sha256Before===finalDriver.sha256After;for(const p of finalInputs)p.stable=p.sha256===p.sha256AfterBundle&&p.sha256===p.sha256After;return {driver:finalDriver,inputs:finalInputs,compiledInputsComplete,stable:compiledInputsComplete&&finalDriver.stable&&finalInputs.every(p=>p.stable)};};
const argv=process.argv.slice(2),only=argv.length===2&&argv[0]==='--only'&&['final-d1-expired','final-d1-delete-expired','read-pacing','read-prefix'].includes(argv[1])?argv[1]:null;
if(argv.length&&!only)throw Error('Supported isolated cases: --only final-d1-expired, final-d1-delete-expired, read-pacing or read-prefix');
let mf,fixture,http=[],cases=[],setup,prefixWindowReads=0;const BASE=800000000000001000n,effectKinds=only?only.startsWith('read-')?[]:[only]:['baseline','before-denied','after-denied','before-export','wrong-role','preview-expired','preview-control','preview-reserve','serving-v1'],effectRoles=new Map(),effectMutated=new Set(),effectWaits=new Map();
const check=(name,pass,detail)=>{cases.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(pass?'':' '+JSON.stringify(detail?.diagnostic??detail).slice(0,1800)));if(!pass)throw Error('First failing audit check: '+name);};
const run=async spec=>{const r=await mf.dispatchFetch('http://fixture.invalid/run',{method:'POST',body:JSON.stringify({cookie:setup?.cookie,...spec})});assert.equal(r.status,200);return r.json();};
const mutate=async(kind,extra={})=>{const r=await mf.dispatchFetch('http://fixture.invalid/mutate',{method:'POST',body:JSON.stringify({kind,...extra})});assert.equal(r.status,200,await r.text());};
const whole=setTimeout(()=>{console.error('role-audit283 whole-command deadline');process.exitCode=1;mf?.dispose();},180000);
(async()=>{try{
 const built=await build({entryPoints:[path.join(__dirname,'site_role_audit283_fixture.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent',plugins:[{name:'actual-source-byte-custody',setup(builder){builder.onLoad({filter:/\.(?:[cm]?js|tsx?|json)$/},args=>{if(args.namespace!=='file')return;const contents=fs.readFileSync(args.path),sha256=hash(contents),prior=compiledInputs.get(args.path);if(prior&&prior!==sha256)throw Error('Compiled input changed during bundling: '+args.path);compiledInputs.set(args.path,sha256);const ext=path.extname(args.path);return {contents,loader:ext==='.ts'?'ts':ext==='.tsx'?'tsx':ext==='.json'?'json':'js'};});}}]});
 source=built.outputFiles[0].text;inputs=Object.keys(built.metafile.inputs).map(p=>{const absolute=path.resolve(root,p),sha256=compiledInputs.get(absolute);if(!sha256)throw Error('Compiler input was not witnessed: '+absolute);return {path:absolute,sha256,sha256AfterBundle:hash(fs.readFileSync(absolute))};});compiledInputsComplete=true;
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:source,modules:true,name:'site-role-audit283',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'site-role-audit283',...Object.fromEntries(effectKinds.map(k=>['DB_EFFECT_'+k.replaceAll('-','_'),'role-effect-'+k]))},outboundService:async request=>{
  const u=new URL(request.url),mode=request.headers.get('authorization')?.replace('Bot role-audit-',''),after=BigInt(u.searchParams.get('after')||'0');
  http.push({method:request.method,path:u.pathname,mode,after:String(after)});
  assert.equal(u.origin,'https://discord.com');
  if(mode?.startsWith('effect-')){
   const kind=mode.slice(7),p=u.pathname.replace(/^\/api\/v10/,''),BOT='800000000000000003',BOTROLE='800000000000000004',EXTERNAL='900000000000000005',G='236932545793490944',effectSubject=kind==='serving-v1'?String(BASE+2n):kind==='final-d1-delete-expired'?String(BASE+1n):String(BASE);
   if(!effectRoles.has(kind))effectRoles.set(kind,new Set([EXTERNAL,...(['preview-control','preview-reserve'].includes(kind)?[setup.officer]:[])]));const held=effectRoles.get(kind);
   const change=async what=>{effectMutated.add(kind);const r=await mf.dispatchFetch('http://fixture.invalid/effect-mutate',{method:'POST',body:JSON.stringify({kind,change:what})});assert.equal(r.status,200,await r.text());};
   if(request.method==='GET'&&p==='/users/@me')return Response.json({id:BOT,bot:true});
   if(request.method==='GET'&&p==='/guilds/'+G+'/roles'){
    if(!effectMutated.has(kind)&&['preview-expired','preview-control'].includes(kind)){
     effectMutated.add(kind);const beganAt=Math.floor(Date.now()/1000);await new Promise(resolve=>setTimeout(resolve,5000));effectWaits.set(kind,{beganAt,finishedAt:Math.floor(Date.now()/1000),waitedMilliseconds:5000});
    }
    if(!effectMutated.has(kind)&&kind==='before-denied')await change('denied');
    if(!effectMutated.has(kind)&&kind==='before-export')await change('export');
    return Response.json([{id:G,position:0,permissions:'0',managed:false},{id:BOTROLE,position:40,permissions:'268435456',managed:false},{id:EXTERNAL,position:1,permissions:'0',managed:false},...setup.ranks.map((r,i)=>({id:r.roleId,name:r.name,position:30-i,permissions:'0',managed:false}))]);
   }
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+BOT)return Response.json({user:{id:BOT,bot:true},roles:[BOTROLE]});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members/'+effectSubject)return Response.json({user:{id:effectSubject,username:'synthetic_member',bot:false},roles:[...held],pending:false});
   if(request.method==='GET'&&p==='/guilds/'+G+'/members')return Response.json(Array.from({length:20},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},roles:i===0?[...held]:[],pending:false})));
   const prefix='/guilds/'+G+'/members/'+effectSubject+'/roles/';
   if(['PUT','DELETE'].includes(request.method)&&p.startsWith(prefix)){
    const role=p.slice(prefix.length);assert.ok(setup.ranks.some(r=>r.roleId===role));
    if(request.method==='PUT'){held.add(role);if(kind==='after-denied'&&!effectMutated.has(kind))await change('denied');}else held.delete(role);
    return new Response(null,{status:204});
   }
   throw Error('Unexpected synthetic writer provider request '+request.method+' '+p);
  }
  assert.equal(request.method,'GET','audit cannot directly mutate provider');assert.match(u.pathname,/\/guilds\/236932545793490944\/members(?:\/[0-9]+)?$/);
  if(mode?.startsWith('pacing-')){
   const suffix=mode.slice(7);
   if(suffix.startsWith('window')){
    const index=prefixWindowReads++,id=u.pathname.split('/').at(-1),member=()=>Response.json({user:{id,username:'synthetic_'+String(BigInt(id)-BASE)},roles:[],pending:false});
    if(suffix==='window-deadline'&&index===0)await new Promise(resolve=>setTimeout(resolve,6100));
    if(suffix==='window-one'&&id===String(BASE)||suffix==='window-reverse'&&id===String(BASE+1n))return member();
    if(suffix==='window-late404'&&id===String(BASE+3n)||suffix==='window-404'&&id===String(BASE))return Response.json({message:'Unknown Member'},{status:404});
    if(!['window-one','window-reverse'].includes(suffix)&&index<2)return member();
    if(index===2&&suffix==='window-privacy')await mutate('privacy');
    if(index===2&&suffix==='window-retired')await mutate('retired');
    if(index===2&&suffix==='window-source')await mutate('source-change');
    if(index===2&&suffix==='window-admission')await mutate('denied',{actor:'800000000000000002'});
    if(index===3&&suffix==='window-mixed')return Response.json({message:'Unavailable'},{status:503});
    return Response.json({message:'Limited',retry_after:0.1,global:false},{status:429,headers:{'Retry-After':'0.1','X-RateLimit-Scope':'user'}});
   }
   if(suffix==='pair'){
    const second=BigInt(u.pathname.split('/').at(-1))%2n===1n;
    if(second)await new Promise(resolve=>setTimeout(resolve,75));
    return Response.json({message:'Limited',retry_after:second?2.25:1.1,global:second},{status:429,headers:{'Retry-After':second?'2.2':'1.05','X-RateLimit-Scope':second?'global':'shared'}});
   }
   if(suffix.startsWith('mixed-')){
    const second=BigInt(u.pathname.split('/').at(-1))%2n===1n;
    if(!second)return Response.json({message:'Limited',retry_after:2,global:false},{status:429});
    if(suffix==='mixed-rejected')throw undefined;
    return suffix==='mixed-unknown'?Response.json({message:'Limited',global:true},{status:429}):Response.json({message:'Unavailable'},{status:503});
   }
   if(suffix==='header')return new Response(null,{status:429,headers:{'Retry-After':'0.1'}});
   if(suffix==='body')return Response.json({message:'Limited',retry_after:0.1,global:false},{status:429});
   if(suffix==='neither')return Response.json({message:'Limited',global:true},{status:429});
   if(suffix==='invalid')return Response.json({message:'Limited',retry_after:-1,global:false},{status:429,headers:{'Retry-After':'1'}});
   if(suffix==='oversize')return Response.json({message:'x'.repeat(4097),retry_after:1,global:false},{status:429});
   if(suffix==='truncated')return new Response(JSON.stringify({message:'Limited',retry_after:1,global:false}),{status:429,headers:{'Content-Type':'application/json','Content-Length':'999'}});
   if(suffix==='long')return Response.json({message:'Limited',retry_after:0,global:false},{status:429,headers:{'Retry-After':'1200'}});
   throw Error('Unexpected pacing mode');
  }
  if(mode==='forbidden')return Response.json({message:'Forbidden'},{status:403});
  if(mode==='limited')return Response.json({message:'Limited',retry_after:0.01},{status:429});
  if(mode==='unavailable')return Response.json({message:'Unavailable'},{status:503});
  if(mode==='timeout')throw new Error('Synthetic network timeout');
  if(mode==='actor-change')await mutate('session');
  if(mode?.startsWith('guard-'))await mutate(mode.slice(6));
  if(mode==='bad-page')return Response.json([{user:{id:String(BASE),username:'a'},roles:[]},{user:{id:String(BASE),username:'duplicate'},roles:[]}]);
  const singleId=/\/members\/([0-9]+)$/.exec(u.pathname)?.[1];
  if(singleId){if(mode==='missing')return Response.json({message:'Unknown Member'},{status:404});if(mode==='source-change')await mutate('source-change');return Response.json({user:{id:singleId,username:'synthetic_'+String(BigInt(singleId)-BASE),bot:mode==='bot'},roles:mode==='unowned'?[setup.officer]:[],pending:mode==='pending'});}
  const all=Array.from({length:1000},(_,i)=>({user:{id:String(BASE+BigInt(i)),username:'synthetic_'+i},nick:'Synthetic '+i,roles:i<20?[]:mode==='overflow'?[setup.role]:[],joined_at:'2026-11-01T10:00:00Z',pending:false}));
  if(mode==='unowned')all[0].roles=[setup.officer];
  if(mode==='pending')all[1].pending=true;
  return Response.json(all.filter(m=>BigInt(m.user.id)>after).slice(0,1000));
 }}));await mf.ready;
 let response=await mf.dispatchFetch('http://fixture.invalid/setup');const setupBody=await response.text();assert.equal(response.status,200,setupBody);setup=JSON.parse(setupBody);
 const pageLimit=setup.pageLimit,focusedPageLimit=setup.focusedPageLimit;
 assert.ok(Number.isInteger(pageLimit)&&pageLimit>0&&pageLimit<20&&Number.isInteger(focusedPageLimit)&&focusedPageLimit>0&&focusedPageLimit<8,'Fixture must expose actual bounded audit page sizes');
 const collectScope=async(spec,first=null)=>{const pages=first?[first]:[await run(spec)];
  while(pages.at(-1).result.nextCursor){assert.ok(pages.length<16,'Bounded fixture traversal cannot loop indefinitely');pages.push(await run({...spec,cursor:pages.at(-1).result.nextCursor}));}
  return {pages,rows:pages.flatMap(p=>p.result.rows||[])};
 };
 if(!only||only==='read-prefix'){
  const before=http.length,read=spec=>run({cookie:setup.secondCookie,scopeQuery:'native',...spec}),windowRead=spec=>{prefixWindowReads=0;return read({mode:'pacing-window',...spec});};
  const inspect=async(token,kind)=>{const r=await mf.dispatchFetch('http://fixture.invalid/'+(kind?'rewrite-audit-cursor':'inspect-audit-cursor'),{method:'POST',body:JSON.stringify({cookie:setup.secondCookie,token,...(kind?{kind}:{})})});assert.equal(r.status,200);return r.json();};
  const wait=async p=>new Promise(resolve=>setTimeout(resolve,Math.max(0,p.notBefore*1000-Date.now())+25));
  const first=await windowRead({});
  check('a genuine later-pair429 publishes the completed contiguous prefix instead of restarting the first pair',first.status===200&&first.result.rows?.length===2&&first.result.coverage?.providerRowsProcessed===2&&first.result.nextCursor&&first.result.coverage.complete===false,{status:first.status,result:first.result,traffic:http.slice(before)});
  const born=await inspect(first.result.nextCursor),p=first.result.readPacing;
  check('prefix exposes original429 timing and counts every startedGET without counting uncompleted candidates',first.result.coverage.completedPrefix&&first.result.coverage.providerRequests===4&&p.kind==='original-discord-get429'&&p.observations.length===2&&p.observations.every(o=>o.retryAfterHeaderSeconds===0.1&&o.retryAfterBodySeconds===0.1&&o.global===false&&o.rateScope==='user')&&first.result.resumeCursor===first.result.nextCursor,p);
  check('prefix cursor contains no cached identity or roles and stays within its original bounded encrypted shape',first.result.nextCursor.length<4096&&Object.keys(born).sort().join(',')==='after,expiresAt,issuedAt,page,readNotBefore,snapshotAt,snapshotId'&&born.after===String(BASE+1n)&&born.page===1,born);
  check('read-only prefix has actual per-member observation times and no repair authority',first.result.rows.every(r=>Number.isSafeInteger(r.discordObservedAt)&&r.discordObservedAt>=born.issuedAt&&r.discordObservedAt<=first.result.generatedAt&&r.previewToken===null),first.result.rows.map(r=>({id:r.id,at:r.discordObservedAt,preview:r.previewToken})));
  const earlyBefore=http.length,early=await read({cursor:first.result.nextCursor});
  check('early prefix resume enforces original notBefore before any providerGET and discloses no cached rows',early.status===429&&early.result.readPacing.kind==='retained-discord-get429'&&!early.result.rows&&http.length===earlyBefore,early.result);
  const invalidBefore=http.length;
  for(const token of [first.result.nextCursor+'x','x'.repeat(4097)]){const invalid=await read({cursor:token});check('tampered or oversized prefix cursor is refused before provider I/O',invalid.status===400&&invalid.result.error==='invalid_token'&&http.length===invalidBefore,invalid.result);}
  const injected=await inspect(first.result.nextCursor,'unknown-field'),injectedRead=await read({cursor:injected.token});
  check('even authenticated synthetic cursor cannot add cached members or unrecognized progress fields',injectedRead.status===400&&injectedRead.result.error==='invalid_cursor'&&http.length===invalidBefore,injectedRead.result);
  await wait(p);
  const pages=[first];
  while(pages.length<3){const previous=pages.at(-1),r=await windowRead({cursor:previous.result.nextCursor});check('each explicit resume advances past completed IDs and retains the same original source and deadline',r.status===200&&r.result.rows.length===2&&r.result.rows[0].id===String(BASE+BigInt(pages.length*2))&&r.result.coverage.providerRowsProcessed===2,r.result.coverage);const current=await inspect(r.result.nextCursor);check('prefix continuation never renews issue time expiry or pinned native export',current.issuedAt===born.issuedAt&&current.expiresAt===born.expiresAt&&current.snapshotId===born.snapshotId&&current.snapshotAt===born.snapshotAt&&current.after===r.result.rows.at(-1).id,current);pages.push(r);await wait(r.result.readPacing);}
  check('three limited windows cover six original accounts exactly once instead of repeatedly reading the first pair',new Set(pages.flatMap(x=>x.result.rows.map(r=>r.id))).size===6&&http.slice(before).filter(x=>BigInt(x.path.split('/').at(-1))<BASE+2n).length===2,{traffic:http.slice(before)});
  const one=await windowRead({mode:'pacing-window-one'}),oneCursor=await inspect(one.result.nextCursor);
  check('first200 then second429 publishes exactly one contiguous position',one.status===200&&one.result.rows.length===1&&one.result.coverage.providerRowsProcessed===1&&one.result.coverage.providerRequests===2&&oneCursor.after===String(BASE),one.result.coverage);
  const reverse=await windowRead({mode:'pacing-window-reverse'}),reverseCursor=await inspect(reverse.result.resumeCursor);
  check('first429 then second200 cannot skip the failed account or publish the later success',reverse.status===429&&!reverse.result.rows&&reverseCursor.after==='0'&&reverseCursor.page===0,reverse.result);
  const missing=await windowRead({mode:'pacing-window-404'});
  check('404 is only an unavailable prefix position and never a character absence or removal decision',missing.status===200&&missing.result.rows.length===1&&missing.result.coverage.providerRowsProcessed===2&&missing.result.coverage.linkedUnavailable===1&&missing.result.coverage.convergenceConfirmed===false,missing.result.coverage);
  const lateMissing=await windowRead({mode:'pacing-window-late404'});
  check('404 after an earlier failed ID cannot inflate committed-prefix unavailable counts',lateMissing.status===200&&lateMissing.result.coverage.providerRowsProcessed===2&&lateMissing.result.coverage.linkedUnavailable===0&&lateMissing.result.coverage.providerRequests===4,lateMissing.result.coverage);
  const mixed=await windowRead({mode:'pacing-window-mixed'});
  check('mixed unknown failure after successes stays held and cannot publish prefix or mint resume authority',mixed.status===503&&!mixed.result.rows&&mixed.result.readPacing.kind==='original-discord-get429-floor'&&mixed.result.readPacing.resumeAvailable===false&&mixed.result.resumeCursor===null,mixed.result);
  const privacy=await windowRead({mode:'pacing-window-privacy'});
  check('subject retiring after its provider read is rechecked before any prefix identity disclosure',privacy.status===200&&privacy.result.rows.length===1&&!JSON.stringify(privacy.result.rows).includes(String(BASE))&&privacy.result.withheld.privacy===1&&privacy.result.coverage.providerRowsProcessed===2,privacy.result.coverage);await mutate('privacy-restore');
  const retired=await windowRead({mode:'pacing-window-retired'});
  check('retired erasure tombstone appearing after its provider read withholds the original identity from prefix rows',retired.status===200&&retired.result.rows.length===1&&!JSON.stringify(retired.result.rows).includes(String(BASE))&&retired.result.withheld.privacy===1&&retired.result.coverage.providerRowsProcessed===2,retired.result.coverage);await mutate('privacy-restore');
  const sourceChange=await windowRead({mode:'pacing-window-source'});
  check('native source changed during a later pair refuses all prefix disclosure',sourceChange.status===409&&sourceChange.result.error==='roster_changed_during_page'&&!sourceChange.result.rows,sourceChange.result);await mutate('source-restore');
  const admission=await windowRead({mode:'pacing-window-admission'});
  check('revoked original administrator cannot receive previously read prefix rows',admission.status===403&&!admission.result.rows,admission.result);await mutate('restore',{actor:'800000000000000002'});
  const expiredToken=await inspect(first.result.nextCursor,'expired'),expiredBefore=http.length,expired=await read({cursor:expiredToken.token});
  check('expired prefix cannot renew or dispatch another provider read',expired.status===409&&expired.result.error==='preview_expired'&&http.length===expiredBefore,expired.result);
  const normal=await read({}),short=await inspect(normal.result.nextCursor,'near-deadline'),deadline=await windowRead({cursor:short.token,mode:'pacing-window-deadline'});
  check('real provider latency crossing the original deadline cannot disclose an expired prefix or renew a cursor',!deadline.result.rows&&(deadline.status===409&&deadline.result.error==='preview_expired'||deadline.status===429&&deadline.result.readPacing.resumeAvailable===false&&deadline.result.resumeCursor===null),deadline.result);
  const shortFinal=await inspect(normal.result.nextCursor,'near-deadline'),lateFinal=await windowRead({cursor:shortFinal.token,mode:'pacing-window-final-deadline'});
  check('unchanged genuine finalD1 response returned after the original deadline cannot release prefix rows',lateFinal.status===409&&lateFinal.result.error==='preview_expired'&&!lateFinal.result.rows&&lateFinal.prefixFinalObserved?.executedAt<shortFinal.expiresAt&&lateFinal.prefixFinalObserved.returnedAt>=shortFinal.expiresAt,{response:lateFinal.result,timing:lateFinal.prefixFinalObserved,originalExpiry:shortFinal.expiresAt});
  check('all prefix progress traffic remains original DiscordGET only',http.slice(before).every(x=>x.method==='GET'),{requests:http.length-before});
 }
 if(!only||only==='read-pacing'){
  const pacingStart=http.length;
  const pacingRun=spec=>run({cookie:setup.secondCookie,...spec});
  const state=async()=>{const r=await mf.dispatchFetch('http://fixture.invalid/read-pacing-state');assert.equal(r.status,200);return r.json();};
  const beforeState=await state();
  const inspect=async token=>{const r=await mf.dispatchFetch('http://fixture.invalid/inspect-audit-cursor',{method:'POST',body:JSON.stringify({cookie:setup.secondCookie,token})});assert.equal(r.status,200);return r.json();};
  const first=await pacingRun({scopeQuery:'native'}),original=await inspect(first.result.nextCursor),beforePair=http.length;
  const held=await pacingRun({scopeQuery:'native',cursor:first.result.nextCursor,mode:'pacing-pair'}),p=held.result.readPacing,heldCursor=await inspect(held.result.resumeCursor);
  check('focused genuine429 settles both started reads and retains both original header/body/global/scope observations',held.status===429&&p?.observations?.length===2&&http.length-beforePair===2&&p.observations.some(o=>o.retryAfterHeaderSeconds===2.2&&o.retryAfterBodySeconds===2.25&&o.global===true&&o.rateScope==='global')&&p.observations.some(o=>o.retryAfterHeaderSeconds===1.05&&o.retryAfterBodySeconds===1.1&&o.global===false&&o.rateScope==='shared')&&p.notBefore===Math.max(...p.observations.map(o=>o.notBefore))&&Number(held.retryAfter)===p.retryAfterSeconds,{p,traffic:http.slice(beforePair)});
  check('restriction-only cursor keeps exact original page boundary source birth and expiry',Object.entries(original).every(([k,v])=>heldCursor[k]===v)&&Object.keys(heldCursor).length===Object.keys(original).length+1&&heldCursor.readNotBefore===p.notBefore,{original,heldCursor});
  const beforeEarly=http.length,early=await pacingRun({scopeQuery:'native',cursor:held.result.resumeCursor});
  check('server refuses an early resume before any Discord I/O without extending the original wait',early.status===429&&early.result.readPacing?.kind==='retained-discord-get429'&&early.result.readPacing.notBefore===p.notBefore&&early.result.readPacing.observations.length===0&&http.length===beforeEarly,early.result);
  const tampered=await pacingRun({scopeQuery:'native',cursor:held.result.resumeCursor+'x'});
  check('a copied or tampered restriction token cannot bypass original cursor authentication',tampered.status===400&&tampered.result.error==='invalid_token'&&http.length===beforeEarly,tampered.result);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,p.notBefore*1000-Date.now())+25));
  const secondBefore=http.length,second=await pacingRun({scopeQuery:'native',cursor:held.result.resumeCursor,mode:'pacing-body'}),secondCursor=await inspect(second.result.resumeCursor);
  check('another original429 during explicit resume retains progress and original clocks again',second.status===429&&second.result.readPacing?.observations.every(o=>o.retryAfterHeaderSeconds===null&&o.retryAfterBodySeconds===0.1&&o.global===false)&&http.length-secondBefore===2&&Object.entries(original).every(([k,v])=>secondCursor[k]===v),second.result.readPacing);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,second.result.readPacing.notBefore*1000-Date.now())+25));
  const resumed=await pacingRun({scopeQuery:'native',cursor:second.result.resumeCursor});
  check('resuming after the original wait reads the same next page without skipped or repeated completed accounts',resumed.status===200&&resumed.result.rows?.[0]?.id===String(BASE+BigInt(focusedPageLimit))&&new Set([...first.result.rows,...resumed.result.rows].map(r=>r.id)).size===focusedPageLimit*2&&resumed.result.rows.length===focusedPageLimit,resumed.result.coverage);
  for(const mode of ['header','body']){
   const r=await pacingRun({scopeQuery:'native',mode:'pacing-'+mode}),o=r.result.readPacing?.observations;
   check('original '+mode+'-only GET429 pacing is retained without inventing missing global or timing fields',r.status===429&&o?.length===2&&o.every(v=>mode==='header'?v.retryAfterHeaderSeconds===0.1&&v.retryAfterBodySeconds===null&&v.global===null:v.retryAfterHeaderSeconds===null&&v.retryAfterBodySeconds===0.1&&v.global===false),r.result.readPacing);
  }
  for(const mode of ['mixed-unknown','mixed-unavailable','mixed-rejected']){
   const before=http.length,r=await pacingRun({scopeQuery:'native',mode:'pacing-'+mode});
   check('known minimum wait survives '+mode+' pair while unknown read remains held without resume authority',r.status===(mode==='mixed-unknown'?429:503)&&r.result.coverage.gap===(mode==='mixed-unknown'?'discord_rate_limited':'provider_or_admission_unavailable')&&r.result.readPacing?.kind==='original-discord-get429-floor'&&r.result.readPacing.observations.length===1&&r.result.readPacing.observations[0].retryAfterBodySeconds===2&&r.result.readPacing.resumeAvailable===false&&r.result.resumeCursor===null&&http.length-before===2,r.result);
  }
  for(const mode of ['neither','invalid','oversize','truncated']){
   const before=http.length,r=await pacingRun({scopeQuery:'native',mode:'pacing-'+mode});
   check('unknown '+mode+' original GET429 metadata stays held without a fabricated wait or resume cursor',(mode==='truncated'?r.status===503&&r.result.coverage.gap==='provider_or_admission_unavailable':r.status===429&&r.result.coverage.gap==='discord_rate_limited')&&!r.result.readPacing&&!r.result.resumeCursor&&r.retryAfter===null&&http.length-before===2,r.result);
  }
  const long=await pacingRun({scopeQuery:'native',mode:'pacing-long'});
  check('provider wait longer than the original traversal is not clamped shorter or issued a renewed cursor',long.status===429&&long.result.readPacing?.retryAfterSeconds>=1200&&long.result.readPacing.resumeAvailable===false&&long.result.resumeCursor===null,long.result.readPacing);
  const unit=await (await mf.dispatchFetch('http://fixture.invalid/get-pacing-unit',{method:'POST',body:JSON.stringify({mode:'pacing-body'})})).json();
  check('original GET pacing cannot be forged from a copied error or moved to another environment/path or changed error',unit.facts?.retryAfterBodySeconds===0.1&&unit.copied===null&&unit.wrongEnv===null&&unit.wrongPath===null&&unit.changed===null,unit);
  await mutate('source-change');const changedBefore=http.length,changed=await pacingRun({scopeQuery:'native',cursor:held.result.resumeCursor});
  check('a paused traversal cannot reopen against a replacement native source',changed.status===409&&changed.result.error==='focused_source_changed'&&http.length===changedBefore,changed.result);await mutate('source-restore');
  check('read pacing sends GETs only and leaves all original role receipts and audit records byte-identical',http.slice(pacingStart).every(r=>r.method==='GET')&&JSON.stringify(beforeState)===JSON.stringify(await state()),{requests:http.length-pacingStart});
 }
 if(!only){
 const unit=await (await mf.dispatchFetch('http://fixture.invalid/unit')).json();
 check('unowned manual rank stays review-only and suppresses repair despite missing desired rank',unit.noReceipt.extraOwned.length===0&&unit.noReceipt.extraUnowned.length===1&&unit.noReceipt.missing.length===1&&unit.noReceipt.repairable===false,unit.noReceipt);
 check('old native232 staff grant is conservatively unowned here and cannot expose repair',unit.nativeStaff.extraUnowned.length===1&&unit.nativeStaff.repairable===false,unit.nativeStaff);
 check('an expired attempted unknown still blocks repair',unit.unknown.unknown===1&&unit.unknown.repairable===false,unit.unknown);
 const baseline=await run({}),page=baseline.result;
 check('current Steward v3 1000-row native source is read through real admission with a bounded qualified page',baseline.status===200&&page.rows?.length===pageLimit&&page.rows.every((r,i)=>r.expected===(i<2?setup.council:setup.role)&&!r.sourceHeld&&r.repairable)&&page.rows[0].nativeRank==='Steward'&&page.rows[1].nativeRank==='High Council'&&page.source?.member_count===1000,baseline);
 check('actual whole private read request remains below100 physical D1 statements',baseline.statements>20&&baseline.statements<100,{statements:baseline.statements});
 const unowned=await run({mode:'unowned'});
 check('extra unowned role suppresses encrypted repair preview on actual GET',unowned.status===200&&unowned.result.rows?.[0]?.extraUnowned.includes(setup.officer)&&!unowned.result.rows[0].repairable&&unowned.result.rows[0].previewToken===null,unowned.result.rows?.[0]);
 const pending=await run({mode:'pending'});
 check('screening-pending candidates have counts-only coverage with no identity row',pending.status===200&&pending.result.withheld?.membershipScreening===1&&!pending.result.rows.some(r=>r.id===String(BASE+1n))&&!JSON.stringify(pending.result).includes('synthetic_1\"'),pending.result.counts);
 const activeV1=await run({activeV1:true}),planning=await run({activeV1:true,policyPreview:'steward-v3'});
 check('inactive v3 plan uses real Steward source while preserving serving-v1 name-qualified roles and Steward hold',activeV1.status===200&&activeV1.result.activePolicy.version===1&&activeV1.result.rows.every((r,i)=>r.expected===(i===0?null:i===1?setup.council:setup.role))&&planning.status===200&&planning.result.activePolicy.version===1&&planning.result.proposedPolicy.version===3&&planning.result.activationRequired===true&&planning.result.rows.every((r,i)=>r.expected===(i<2?setup.council:setup.role)&&r.activeExpected===(i===0?null:i===1?setup.council:setup.role)&&r.activationRequired&&!r.repairable&&r.previewToken===null),{active:activeV1.result.counts,planning:planning.result.counts});
 check('planning and active policy projections share one validated read per member below100 physical statements',planning.statements>20&&planning.statements<100,{statements:planning.statements});
 await mutate('alt-case');const altActive=await run({activeV1:true,subjectQuery:String(BASE+2n)}),altPlanning=await run({activeV1:true,policyPreview:'steward-v3',subjectQuery:String(BASE+2n)});
 check('same genuine qualified Alt7 identity remains held under servingv1 and read-only maps to v3Alt without token',altActive.status===200&&altActive.result.counts.unavailable===1&&altPlanning.status===200&&altPlanning.result.rows?.[0]?.expected===setup.ranks[10].roleId&&altPlanning.result.rows[0].nativeRank==='Alt'&&altPlanning.result.rows[0].activeExpected===null&&altPlanning.result.rows[0].activationRequired&&!altPlanning.result.rows[0].repairable&&altPlanning.result.rows[0].previewToken===null,{active:altActive.result,planning:altPlanning.result.rows?.[0]});await mutate('alt-restore');
 const planningPost=await run({activeV1:true,policyPreview:'steward-v3',method:'POST',body:{subject:setup.subject,previewToken:'unused',confirm:true}}),crossView=await run({activeV1:true,cursor:planning.result.nextCursor});
 check('planning cannot POST or reuse its cursor in the active view',planningPost.status===400&&planningPost.result.error==='planning_view_read_only'&&crossView.status===400&&crossView.result.error==='invalid_token',{planningPost,crossView});
 check('native-linked denominator is separate and absent accounts are explicitly unchecked',page.coverage?.nativeLinkedCandidateSubjects===20&&page.coverage.nativeLinkedAccountsAbsentFromDiscord==='not_individually_checked'&&page.coverage.convergenceConfirmed===false,page.coverage);
 check('overflow stops at the last reviewed candidate without claiming unrelated-account coverage',page.coverage?.providerRowsProcessed===pageLimit&&page.coverage.observedOnly===0&&page.rows.length===pageLimit&&!!page.nextCursor&&!page.coverage.complete,page.coverage);
 const fullResponse=await mf.dispatchFetch('http://fixture.invalid/full-route',{method:'POST',body:JSON.stringify({cookie:setup.cookie})}),full=await fullResponse.json();
 check('normal full Worker route admits the signed administrator and returns the bounded private audit',full.status===200&&full.result.rows?.length===pageLimit&&full.result.coverage?.nativeLinkedCandidateSubjects===20,{status:full.status,error:full.error,result:full.result.error,statements:full.statements});
 check('full Worker private request stays below100 physical D1 statements',full.statements>20&&full.statements<100,{statements:full.statements});
 const focusedBefore=http.length,focused=await run({scopeQuery:'native'}),focusedTraffic=http.slice(focusedBefore),focusedAll=await collectScope({scopeQuery:'native'},focused);
 check('focused native scope reads a bounded exact-account page instead of enumerating the guild inventory',focused.status===200&&focused.result.comparisonScope==='native'&&focused.result.rows.length===focusedPageLimit&&focusedTraffic.length===focusedPageLimit&&focusedTraffic.every(r=>r.method==='GET'&&/\/members\/[0-9]+$/.test(r.path))&&focused.result.coverage.providerRowsProcessed===focusedPageLimit&&focused.result.coverage.providerRequests===focusedPageLimit&&focused.result.rows.every(r=>r.previewToken===null),{status:focused.status,coverage:focused.result.coverage,traffic:focusedTraffic});
 check('focused physical D1 work stays below100 statements on1000 native rows',focusedAll.pages.every(p=>p.statements<100),{statements:focusedAll.pages.map(p=>p.statements)});
 check('focused keyset traversal covers every linked native account exactly once',focusedAll.pages.every(p=>p.status===200&&p.result.rows.length<=focusedPageLimit)&&focusedAll.pages.at(-1).result.coverage.complete&&!focusedAll.pages.at(-1).result.nextCursor&&focusedAll.rows.length===20&&new Set(focusedAll.rows.map(r=>r.id)).size===20,{pages:focusedAll.pages.map(p=>p.result.coverage)});
 const crossed=await run({scopeQuery:'linked',cursor:focused.result.nextCursor});check('focused cursor cannot cross into another account scope',crossed.status===400&&crossed.result.error==='invalid_token',crossed.result);
 await mutate('source-change');const changedFocusBefore=http.length,changedFocus=await run({scopeQuery:'native',cursor:focused.result.nextCursor});
 check('focused cursor pins the original native source before another provider request',changedFocus.status===409&&changedFocus.result.error==='focused_source_changed'&&http.length===changedFocusBefore,changedFocus.result);await mutate('source-restore');
 const limitedFocusBefore=http.length,limitedFocus=await run({scopeQuery:'native',mode:'limited'});
 check('focused429 stops at the bounded current read pair without retries or later targets',limitedFocus.status===429&&limitedFocus.result.coverage.gap==='discord_rate_limited'&&http.length-limitedFocusBefore>=1&&http.length-limitedFocusBefore<=2,http.slice(limitedFocusBefore));
 const absentFocus=await run({scopeQuery:'native',mode:'missing'});
 check('unavailable focused reads disclose counts only without inferring departure or removing the cursor boundary',absentFocus.status===200&&absentFocus.result.rows.length===0&&absentFocus.result.coverage.linkedUnavailable===focusedPageLimit&&absentFocus.result.coverage.providerRowsProcessed===focusedPageLimit&&!!absentFocus.result.nextCursor&&!absentFocus.result.coverage.convergenceConfirmed,absentFocus.result);
 check('legacy name-only and Discord joined dates retain separate provenance with no native join/episode claim',page.rows?.[0]?.characters?.[0]?.legacyNameFirstObservedAt&&page.rows[0].characters[0].actualJoinedAt===null&&page.rows[0].characters[0].currentEpisodeFirstObservedAt===null&&page.rows[0].discordJoinedAt&&page.rows[0].firstObservedProvenance.includes('not current character/GUID'),page.rows?.[0]);
 const done=await run({cursor:page.nextCursor});check('next provider page completes all20 candidates while other accounts remain counts only',done.status===200&&done.result.coverage.complete===true&&!done.result.nextCursor&&done.result.rows.length===20-pageLimit&&new Set([...page.rows,...done.result.rows].map(r=>r.id)).size===20&&page.coverage.providerRowsProcessed+done.result.coverage.providerRowsProcessed===1000&&page.coverage.observedOnly+done.result.coverage.observedOnly===980,done.result.coverage);
 const beforeOverflow=http.length,overflow=await run({mode:'overflow'}),second=await run({mode:'overflow',cursor:overflow.result.nextCursor});
 check('overflow cursor resumes after last actually reviewed candidate',overflow.result.rows?.length===pageLimit&&second.result.rows?.[0]?.id===String(BASE+BigInt(pageLimit))&&http[beforeOverflow+1]?.after===String(BASE+BigInt(pageLimit-1)),{first:overflow.result.coverage,secondFirst:second.result.rows?.[0]?.id,http:http.slice(beforeOverflow)});
 const unlinkedOverflow=second.result.rows?.filter(r=>BigInt(r.id)>=BASE+20n);
 check('source-held unlinked role holders receive a closed no-link reason without a token',unlinkedOverflow?.length>0&&unlinkedOverflow.every(r=>r.sourceHeld&&r.holdReason==='no_link_record'&&r.previewToken===null),unlinkedOverflow?.[0]);
 await mutate('proof-required');const linkedAll=await collectScope({scopeQuery:'linked'}),required=linkedAll.rows.find(r=>r.id===String(BASE+21n)),unfinished=linkedAll.rows.find(r=>r.id===String(BASE+20n));
 check('all-links view distinguishes unfinished proof from a matched native member missing an original anchor',linkedAll.pages.every(p=>p.status===200)&&unfinished?.holdReason==='unfinished_verification'&&required?.holdReason==='identity_proof_missing'&&[unfinished,required].every(r=>r.sourceHeld&&!r.repairable&&r.previewToken===null),{unfinished,required});
 const nativeOnly=await collectScope({scopeQuery:'native'});
 check('current-native scope excludes queued verification while retaining read-only diagnosis of exact unproved matches',nativeOnly.pages.every(p=>p.status===200)&&nativeOnly.rows.some(r=>r.id===String(BASE+21n)&&r.holdReason==='identity_proof_missing')&&!nativeOnly.rows.some(r=>r.id===String(BASE+20n)),nativeOnly.rows.at(-1));
 for(const [mode,status,gap]of [['forbidden',403,'discord_forbidden_members_intent_or_permissions'],['limited',429,'discord_rate_limited'],['unavailable',503,'provider_or_admission_unavailable'],['timeout',503,'provider_or_admission_unavailable'],['bad-page',503,'discord_reply_unconfirmed']]){
  const before=http.length,r=await run({mode});check(mode+' is an explicit coverage gap with one provider request and no retry',r.status===status&&r.result.coverage?.complete===false&&r.result.coverage.gap===gap&&http.length===before+1,{status:r.status,result:r.result,calls:http.length-before});
 }
 const refreshBefore=http.length,fresh=await run({subjectQuery:setup.subject}),freshRow=fresh.result.rows?.[0],refreshTraffic=http.slice(refreshBefore),token=freshRow?.previewToken;
 check('whole traversal supplies no repair token; exact per-row Review performs one member GET and no guild list or effect',page.rows.every(r=>r.previewToken===null)&&fresh.status===200&&freshRow?.id===setup.subject&&refreshTraffic.length===1&&refreshTraffic[0].method==='GET'&&refreshTraffic[0].path.endsWith('/members/'+setup.subject)&&fresh.result.coverage.scope==='single_discord_member_read'&&fresh.result.coverage.singleMemberReadComplete===true&&fresh.result.coverage.complete===false&&!fresh.result.nextCursor,{coverage:fresh.result.coverage,refreshTraffic});
 const previewClock=await (await mf.dispatchFetch('http://fixture.invalid/rewrite-preview',{method:'POST',body:JSON.stringify({cookie:setup.cookie,token,kind:'inspect'})})).json();
 check('new original per-row preview gets up to300s, bounded by genuine Native deadline and original session',previewClock.expiresAt-previewClock.issuedAt>112&&previewClock.expiresAt-previewClock.issuedAt<=300&&previewClock.expiresAt<=freshRow.deadline&&previewClock.expiresAt<=previewClock.sessionExpiresAt&&freshRow.previewExpiresAt===previewClock.expiresAt,{previewClock,deadline:freshRow.deadline});
 check('preview exposes earlier conservative UI confirm cutoff without changing original expiry',freshRow.confirmReserveSeconds===112&&freshRow.confirmBy===previewClock.expiresAt-112&&freshRow.confirmBy>previewClock.issuedAt,{confirmBy:freshRow.confirmBy,previewClock});
 const sessionBound=await run({cookie:setup.shortCookie,subjectQuery:setup.subject});
 check('short original session caps newly issued preview without renewing that session',sessionBound.status===200&&sessionBound.result.rows?.[0]?.previewExpiresAt===setup.shortSessionExpiresAt&&sessionBound.result.rows[0].previewExpiresAt<=sessionBound.result.rows[0].deadline,sessionBound.result.rows?.[0]);
 const heldFresh=await run({mode:'unowned',subjectQuery:setup.subject}),plannedFresh=await run({activeV1:true,policyPreview:'steward-v3',subjectQuery:setup.subject});
 check('fresh unowned and inactive-planning per-row reads remain tokenless',heldFresh.status===200&&!heldFresh.result.rows?.[0]?.repairable&&heldFresh.result.rows[0].previewToken===null&&plannedFresh.status===200&&plannedFresh.result.rows?.[0]?.activationRequired&&plannedFresh.result.rows[0].previewToken===null,{held:heldFresh.result.counts,planning:plannedFresh.result.counts});
 const sourceChanged=await run({mode:'source-change',subjectQuery:setup.subject});
 check('changed original export during exact member GET withholds the whole fresh preview',sourceChanged.status===409&&sourceChanged.result.error==='roster_changed_during_page'&&!sourceChanged.result.rows,sourceChanged.result);await mutate('source-restore');
 check('repair preview is opaque, not plaintext target identity',typeof token==='string'&&!token.includes(setup.subject)&&!token.includes(setup.cookie),{hasToken:!!token});
 const invalid=await run({method:'POST',body:{subject:setup.subject,previewToken:token+'x',confirm:true}});
 check('tampered preview refuses before the normal writer with genuine not-started witness',invalid.status===400&&invalid.result.error==='invalid_token'&&invalid.result.outcome==='not_started'&&invalid.result.roleChangeSent===false,invalid);
 const repair=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('valid preview enters existing Native reconciliation and preserves its current venue hold',repair.status===200&&repair.result.oldReceiptsPreserved===true&&repair.result.result?.results?.[0]?.state==='held'&&repair.result.result.results[0].reason.includes('venue'),repair);
 check('repair records confirmed officer request intent without claiming a provider result',repair.result.requestIntentRecorded===true&&typeof repair.result.requestId==='string'&&repair.result.maxPlannedEffects===2,repair.result);
 const changedRoles=await run({mode:'unowned',method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('fresh POST unowned role change holds before writer entry even with older safe token',changedRoles.status===409&&changedRoles.result.error==='preview_roles_changed_or_unowned',changedRoles.result);
 // A separate genuine signed officer keeps independent boundary cases within
 // the unchanged production POST10/min account allowance; no limiter reset.
 const secondPreview=await run({cookie:setup.secondCookie,subjectQuery:setup.subject}),secondToken=secondPreview.result.rows[0].previewToken;
 for(const [kind,status,error]of [['expired',409,'preview_expired'],['future',409,'preview_expired'],['overlong',409,'preview_expired'],['unknown-field',400,'invalid_repair'],['wrong-export',409,'preview_source_changed'],['wrong-snapshot',409,'preview_source_changed'],['wrong-role',409,'preview_source_changed']]){
  const rewritten=await (await mf.dispatchFetch('http://fixture.invalid/rewrite-preview',{method:'POST',body:JSON.stringify({cookie:setup.secondCookie,token:secondToken,kind})})).json();
  const r=await run({cookie:setup.secondCookie,method:'POST',body:{subject:setup.subject,previewToken:rewritten.token,confirm:true}});
  check(kind+' original sealed preview cannot be renewed or reinterpreted',r.status===status&&r.result.error===error,{status:r.status,result:r.result});
 }
 for(const kind of ['denied','left','banned']){
  const g=await mf.dispatchFetch('http://fixture.invalid/guard',{method:'POST',body:JSON.stringify({kind,cookie:setup.cookie})}),r=await g.json();
  check('original admin '+kind+' during provider await blocks the next Native database group',g.status===200&&r.prior?.ok===1&&r.refused&&(kind==='denied'?r.actual.denied===1:kind==='left'?r.actual.in_server===0:r.actual.banned===1),r);
  await mutate('restore');
 }
 for(const kind of ['denied','left','banned']){
  const g=await mf.dispatchFetch('http://fixture.invalid/native-guard',{method:'POST',body:JSON.stringify({kind:'guard-'+kind,cookie:setup.cookie})}),r=await g.json();
  check('actual Native capture→custody→new-effect predicate retains original admin '+kind+' fence after provider wait',g.status===200&&r.captured&&r.matches&&r.prior?.ok===1&&r.after?.ok===0&&r.receipt?.ok===1,r);
  await mutate('restore');
 }
 for(const wrong of ['subject','snapshot','export','role','expired','malformed-expiry','missing-expiry','unknown-field']){
  const g=await mf.dispatchFetch('http://fixture.invalid/native-guard',{method:'POST',body:JSON.stringify({wrong,cookie:setup.cookie})}),r=await g.json();
  check('Native action retains exact preview '+wrong+' pin',g.status===200&&(wrong==='role'?r.captured&&r.matches===false:r.captured===false),r);
 }
 await mutate('unknown');const unknown=await run({});
 check('old unknown is visible without replay and suppresses current repair',unknown.result.rows?.[0]?.unknown===1&&!unknown.result.rows[0].repairable&&unknown.result.rows[0].previewToken===null,unknown.result.rows?.[0]);
 const unknownFresh=await run({subjectQuery:setup.subject});check('fresh single-account read cannot issue a new token around historical unknown effects',unknownFresh.status===200&&unknownFresh.result.rows?.[0]?.unknown===1&&!unknownFresh.result.rows[0].repairable&&unknownFresh.result.rows[0].previewToken===null,unknownFresh.result.rows?.[0]);
 const changed=await run({method:'POST',body:{subject:setup.subject,previewToken:token,confirm:true}});
 check('preview cannot survive changed historical outcomes',changed.status===409&&changed.result.error==='preview_source_changed',changed);
 await mutate('history');const boundedHistory=await run({}),boundedRow=boundedHistory.result.rows?.[0];
 check('retained history is bounded while full unknown count survives truncation',boundedHistory.status===200&&boundedRow?.historyTruncated&&boundedRow.retainedReceiptCount===100&&boundedRow.unknown===1&&boundedRow.expiredUnattempted===105&&!boundedRow.previewToken&&!boundedRow.repairable,boundedRow);
 await mutate('characters');const boundedCharacters=await run({}),boundedCharacterRow=boundedCharacters.result.rows?.find(r=>r.id===String(BASE+2n));
 check('character detail is bounded and incomplete history suppresses a preview',boundedCharacters.status===200&&boundedCharacterRow?.characters.length===50&&boundedCharacterRow.historyTruncated&&boundedCharacterRow.unknown===0&&!boundedCharacterRow.repairable&&!boundedCharacterRow.previewToken,boundedCharacterRow);
 await mutate('privacy');const privacy=await run({});
 check('privacy-held identity/history is aggregate-only with no row, raw ID, name or token',privacy.status===200&&privacy.result.withheld?.privacy===1&&privacy.result.counts.withheldCandidates===1&&!privacy.result.rows.some(r=>r.id===setup.subject)&&!JSON.stringify(privacy.result.rows).includes(setup.subject)&&!JSON.stringify(privacy.result.rows).includes('synthetic_0\"'),privacy.result.counts);
 const privateFocusBefore=http.length,privateFocus=await run({scopeQuery:'native'}),privateFocusTraffic=http.slice(privateFocusBefore);
 check('focused selection fences a privacy-held account before its exact Discord lookup and discloses no reason',privateFocus.status===200&&!privateFocusTraffic.some(r=>r.path.endsWith('/members/'+setup.subject))&&!privateFocus.result.rows.some(r=>r.id===setup.subject)&&!JSON.stringify(privateFocus.result.rows).includes('synthetic_0\"'),{coverage:privateFocus.result.coverage,traffic:privateFocusTraffic});
 const privateFresh=await run({subjectQuery:setup.subject}),pendingFresh=await run({mode:'pending',subjectQuery:String(BASE+1n)}),botFresh=await run({mode:'bot',subjectQuery:String(BASE+1n)}),outsideFresh=await run({subjectQuery:String(BASE+500n)}),missingFresh=await run({mode:'missing',subjectQuery:String(BASE+1n)});
 check('chosen privacy/screening/bot/noncandidate/404 outcomes have identical generic unavailable response and no identifying classifier',privateFresh.status===200&&privateFresh.result.rows.length===0&&privateFresh.result.counts.unavailable===1&&[pendingFresh,botFresh,outsideFresh,missingFresh].every(r=>r.status===200&&JSON.stringify(r.result)===JSON.stringify(privateFresh.result))&&!JSON.stringify(privateFresh.result).includes('privacy')&&!privateFresh.result.withheld&&!('nativeLinkedCandidateSubjects'in privateFresh.result.coverage),{privateFresh:privateFresh.result,pendingFresh:pendingFresh.result,botFresh:botFresh.result,outsideFresh:outsideFresh.result,missingFresh:missingFresh.result});
 await mutate('stale');const stale=await run({});
 const staleExpectedIds=Array.from({length:pageLimit-1},(_v,i)=>String(BASE+BigInt(i+1)));
 check('stale original roster holds every expected-role claim and repair',stale.status===200&&JSON.stringify(stale.result.rows.map(r=>r.id))===JSON.stringify(staleExpectedIds)&&stale.result.rows.every(r=>r.sourceHeld&&r.expected===null&&!r.previewToken),stale.result.counts);
 check('dated full-inventory observations explain source staleness without issuing authority',JSON.stringify(stale.result.rows.map(r=>r.id))===JSON.stringify(staleExpectedIds)&&stale.result.rows.every(r=>r.holdReason==='source_stale'),stale.result.rows?.[0]);
 const staleFresh=await run({subjectQuery:String(BASE+1n)});check('single stale native-source hold shares generic unavailable response without target cause or token',staleFresh.status===200&&JSON.stringify(staleFresh.result)===JSON.stringify(privateFresh.result),staleFresh.result);
 const actor=await run({mode:'actor-change',subjectQuery:String(BASE+1n)});
 check('original actor invalidation during exact-account provider await returns no private page',[403,503].includes(actor.status)&&!actor.result.rows&&actor.result.coverage?.complete===false,actor);
 check('audit and rejected repairs made no direct role writes',http.every(r=>r.method==='GET'),http);
 const planResponse=await mf.dispatchFetch('http://fixture.invalid/plans'),plans=await planResponse.json(),targetPlan=plans.plans?.find(p=>p.prefix.startsWith('WITH audit_never_sent_shape284 AS MATERIALIZED'));
 const focusPlan=plans.plans?.find(p=>p.prefix.startsWith('SELECT DISTINCT c.discord_id'));
 check('exact bounded audit SQL plans use indexed account links and role subjects on1000 native rows',planResponse.status===200&&JSON.stringify(targetPlan).includes('characters_discord')&&JSON.stringify(targetPlan).includes('role_settlement_subject')&&plans.plans.length===4&&plans.plans.every(p=>p.sqlBytes<100000&&p.bindings<100),plans);
 check('focused keyset selection uses account and current-privacy-job indexes without automatic indexes or full scans',JSON.stringify(focusPlan).includes('SEARCH c USING INDEX characters_discord (discord_id>?)')&&JSON.stringify(focusPlan).includes('SEARCH j USING INDEX privacy_serving_jobs_open (subject_id=?)')&&!JSON.stringify(focusPlan).includes('USING AUTOMATIC')&&!JSON.stringify(focusPlan).includes('SCAN '),focusPlan);
 }
 for(const kind of effectKinds){
  if(kind==='final-d1-delete-expired'){
   const step=async name=>{const before=http.length,response=await mf.dispatchFetch('http://fixture.invalid/effect-run',{method:'POST',body:JSON.stringify({kind,step:name})}),raw=await response.text();let result;try{result=JSON.parse(raw);}catch{result={error:raw.slice(0,1600)};}return {status:response.status,result,traffic:http.slice(before).filter(h=>h.mode==='effect-'+kind)};};
   const mutations=part=>part.traffic.filter(h=>['PUT','DELETE'].includes(h.method)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   const bootstrap=await step('bootstrap'),original=bootstrap.result.originalOwned,firstEffects=mutations(bootstrap);
   check('isolated serving-v1 Officer3 bootstrap uses genuine fresh admin preview and original-writer acknowledged PUT',bootstrap.status===200&&bootstrap.result.servingPolicy===1&&bootstrap.result.subject===String(BASE+1n)&&bootstrap.result.preview.status===200&&bootstrap.result.action?.status===200&&firstEffects.length===1&&firstEffects[0].method==='PUT'&&firstEffects[0].path.endsWith('/roles/'+setup.officer)&&original?.state==='settled'&&original.attempts===1&&original.reason==='canonical233_put_acknowledged_and_confirmed'&&original.native_profile==='olympus-canonical-ranks-20261106-v1'&&original.native_rank===3&&original.native_rank_name==='Officer'&&original.roster_id===1&&effectRoles.get(kind).has(setup.officer)&&effectRoles.get(kind).has('900000000000000005'),bootstrap);
   const expired=await step('expire'),e=expired.result,child=e.neverSent,expiredEffects=mutations(expired);
   check('isolated real final DELETE-D1 answer executes before original120s expiry and returns identical admitted row after121s',expired.status===200&&e.servingPolicy===1&&e.preview.status===200&&e.preview.body.rows?.[0]?.extraOwned.includes(setup.officer)&&e.lateFinal?.executedAt<e.previewExpiresAt&&e.lateFinal.returnedAt>=e.previewExpiresAt&&e.lateFinal.returnedAt-e.lateFinal.executedAt>=121&&e.nativeDeadline>e.lateFinal.returnedAt&&same(e.lateFinal.columns,['1'])&&same(e.lateFinal.result,[[1]])&&e.lateFinal.params[0]===child?.id&&e.lateFinal.params[1]===String(BASE+1n)&&e.lateFinal.params[2]==='236932545793490944'&&e.lateFinal.params[3]===setup.officer&&e.lateFinal.params[4]===child.subject_generation&&e.lateFinal.params[5]===original.id&&e.lateFinal.params[6]===2&&e.lateFinal.params[7]===child.native_guid&&e.lateFinal.params[8]===child.expires_at&&e.lateFinal.params[9]===0&&e.lateFinal.params[10]==='canonical_routine233'&&e.lateFinal.params[11]===2&&e.lateFinal.params[12]==='High Council'&&e.lateFinal.params.at(-1)===child.claim_nonce,{diagnostic:{status:expired.status,previewStatus:e.preview?.status,previewReady:typeof e.preview?.body.rows?.[0]?.previewToken==='string',lateFinalObserved:!!e.lateFinal,executedAt:e.lateFinal?.executedAt,returnedAt:e.lateFinal?.returnedAt,previewExpiresAt:e.previewExpiresAt,nativeDeadline:e.nativeDeadline,writerResults:e.action?.body?.result?.results?.map(r=>({state:r.state,reason:r.reason})),writerStatements:e.action?.body?.result?.statements,writerRequests:e.action?.body?.result?.requests,transport:e.stageTransport284,child:child?{state:child.state,attempts:child.attempts,reason:child.reason,noncePresent:!!child.claim_nonce}:null,mutations:expiredEffects.length},...expired,scope:'Real final D1 response delay; no SQL/result/clock/capability substitution or Discord retry.'});
   check('original-preview expiry after final DELETE read sends zero physical mutations and retains strict attempted no-send child',expiredEffects.length===0&&effectRoles.get(kind).has(setup.officer)&&!effectRoles.get(kind).has(setup.council)&&child?.desired===0&&child.attempts===1&&child.state==='held'&&child.reason==='canonical233_never_dispatched'&&child.request_digest===original.id&&child.roster_id===2&&child.native_profile==='olympus-canonical-ranks-20261106-v1'&&child.native_rank===2&&child.native_rank_name==='High Council'&&/^[0-9a-f]{32}$/.test(child.id)&&/^[0-9a-f]{32}$/.test(child.claim_nonce),expired);
   check('blocked DELETE preserves real original Officer ACK, old source and existing unrelated unknown exactly',same(e.originalOwnedAfter,original)&&same(e.snapshot1After,bootstrap.result.snapshot1)&&same(e.unrelatedUnknown,e.unrelatedUnknownAfter)&&same(e.unrelatedUnknown,bootstrap.result.unrelatedUnknown),{original:e.originalOwnedAfter,snapshot:e.snapshot1After,unknown:e.unrelatedUnknownAfter});
   const recovered=await step('recover'),recovery=recovered.result,review=recovery.review?.body.rows?.[0],lastEffects=mutations(recovered),lastRow=recovery.after?.body.rows?.[0];
   check('fresh immutable snapshot3 Review retains old owned Officer grant without manual or unknown misclassification',recovered.status===200&&recovery.snapshot3?.id===3&&recovery.snapshot3.rank_index===2&&recovery.snapshot3.member_count===1000&&recovery.snapshot3.complete===1&&recovery.review?.status===200&&review?.expected===setup.council&&review.extraOwned.includes(setup.officer)&&review.extraUnowned.length===0&&review.unknown===0&&review.repairable===true&&typeof review.previewToken==='string',recovered);
   check('fresh normal sweep creates new intents and physically removes Officer then grants HC exactly once',lastEffects.length===2&&lastEffects[0].method==='DELETE'&&lastEffects[0].path.endsWith('/roles/'+setup.officer)&&lastEffects[1].method==='PUT'&&lastEffects[1].path.endsWith('/roles/'+setup.council)&&!effectRoles.get(kind).has(setup.officer)&&effectRoles.get(kind).has(setup.council)&&effectRoles.get(kind).has('900000000000000005')&&recovery.history.some(r=>r.id!==child.id&&r.desired===0&&r.attempts===1&&r.state==='settled'&&r.reason==='canonical233_delete_acknowledged_and_confirmed'&&r.request_digest===original.id&&r.roster_id===3)&&recovery.history.some(r=>r.desired===1&&r.attempts===1&&r.state==='settled'&&r.reason==='canonical233_put_acknowledged_and_confirmed'&&r.native_rank===2&&r.roster_id===3),{recovery,traffic:recovered.traffic});
   check('fresh-source recovery never resets or replays old no-send nonce, ACK, snapshots or unrelated unknown',same(recovery.neverSentAfter,child)&&same(recovery.originalOwnedAfter,original)&&same(recovery.snapshot1After,bootstrap.result.snapshot1)&&same(recovery.snapshot2After,e.snapshot2)&&same(recovery.unrelatedUnknownAfter,bootstrap.result.unrelatedUnknown)&&recovery.after?.status===200&&lastRow?.expected===setup.council&&lastRow.missing.length===0&&lastRow.extraOwned.length===0&&lastRow.extraUnowned.length===0&&lastRow.unknown===0&&!lastRow.repairable,{recovery,allMutations:http.filter(h=>h.mode==='effect-'+kind&&['PUT','DELETE'].includes(h.method))});
   check('only the two attended requests carry original-officer intent attribution; normal recovery is separately scoped',recovery.intents?.length===2&&recovery.intents.every(i=>i.actor==='800000000000000110'&&i.subject===String(BASE+1n)&&JSON.parse(i.details)._privacySubjectIds.includes(i.subject)&&JSON.parse(i.details).maxPlannedEffects===2),recovery.intents);
   continue;
  }

  const r=await mf.dispatchFetch('http://fixture.invalid/effect-run',{method:'POST',body:JSON.stringify({kind})}),body=await r.text();let result;try{result=JSON.parse(body);}catch{result={error:body.slice(0,1600)};}
  const traffic=http.filter(h=>h.mode==='effect-'+kind),puts=traffic.filter(h=>h.method==='PUT'),deletes=traffic.filter(h=>h.method==='DELETE'),recorded=result.receipts||[];
  if(kind==='baseline')check('actual Native writer baseline acknowledges one current grant with manual external role preserved',r.status===200&&result.previewReady&&puts.length===1&&deletes.length===0&&effectRoles.get(kind).has(setup.council)&&effectRoles.get(kind).has('900000000000000005')&&recorded.some(x=>x.desired===1&&x.attempts===1&&x.state==='settled'&&x.reason==='canonical233_put_acknowledged_and_confirmed'),{result,traffic});
  if(kind==='serving-v1')check('serving-v1 real Steward-table Member8 fresh admin preview and POST acknowledge a legitimate original-profile Member grant',r.status===200&&result.servingPolicy===1&&result.subject===String(BASE+2n)&&result.previewReady&&result.action?.status===200&&puts.length===1&&deletes.length===0&&effectRoles.get(kind).has(setup.role)&&effectRoles.get(kind).has('900000000000000005')&&recorded.some(x=>x.purpose==='canonical_routine233'&&x.desired===1&&x.attempts===1&&x.state==='settled'&&x.reason==='canonical233_put_acknowledged_and_confirmed'&&x.native_profile==='olympus-canonical-ranks-20261106-v1'&&x.native_rank===8&&x.native_rank_name==='Member'),{result,traffic});
  if(kind==='before-denied')check('actual Native writer blocks PUT when original admin is denied during inventory GET',r.status===200&&result.previewReady&&result.actor?.denied===1&&puts.length===0&&deletes.length===0&&!recorded.some(x=>x.attempts===1),{result,traffic});
  if(kind==='before-export')check('actual Native writer blocks PUT when sealed original export changes during inventory GET',r.status===200&&result.previewReady&&effectMutated.has(kind)&&puts.length===0&&deletes.length===0&&!recorded.some(x=>x.attempts===1),{result,traffic});
  if(kind==='wrong-role')check('actual Native writer rejects a different expected role before any effect',r.status===200&&result.previewReady&&puts.length===0&&deletes.length===0&&result.action?.body?.results?.[0]?.reason==='attended_role_preview_changed',{result,traffic});
  if(kind==='preview-expired')check('original5s grant-only preview is now held by full-plan reserve before provider inventory or any new intent',r.status===200&&result.previewReady&&!effectWaits.has(kind)&&puts.length===0&&deletes.length===0&&recorded.length===1&&recorded[0].purpose==='canonical_identity233'&&result.action?.body?.result?.requests===0&&result.action.body.result.results?.[0]?.reason==='canonical233_plan_deadline_insufficient',{result,traffic,scope:'Early reservation evidence only; post-await expiry path was not reached.'});
  if(kind==='preview-control')check('full original120s preview with real5s provider wait permits bounded acknowledged owned removal plus desired grant',r.status===200&&result.previewReady&&effectWaits.has(kind)&&effectWaits.get(kind).finishedAt<result.previewExpiresAt&&puts.length===1&&deletes.length===1&&!effectRoles.get(kind).has(setup.officer)&&effectRoles.get(kind).has(setup.council)&&JSON.stringify(result.originalOwned)===JSON.stringify(result.originalOwnedAfter)&&recorded.some(x=>x.desired===1&&x.attempts===1&&x.state==='settled'),{result,traffic,wait:effectWaits.get(kind)});
  if(kind==='preview-reserve')check('still-valid original30s preview cannot borrow longer Native deadline for owned remove+replacement reserve',r.status===200&&result.previewReady&&Math.floor(Date.now()/1000)<result.previewExpiresAt&&result.nativeDeadline-Math.floor(Date.now()/1000)>112&&puts.length===0&&deletes.length===0&&effectRoles.get(kind).has(setup.officer)&&!effectRoles.get(kind).has(setup.council)&&JSON.stringify(result.originalOwned)===JSON.stringify(result.originalOwnedAfter)&&result.action?.body?.result?.results?.[0]?.reason==='canonical233_plan_deadline_insufficient'&&!recorded.some(x=>x.id!==result.originalOwned.id&&x.attempts===1),{result,traffic});
  if(kind==='final-d1-expired'){
   const claim=recorded.find(x=>x.purpose==='canonical_routine233'&&x.desired===1&&x.attempts===1);
   check('isolated real final-D1 answer executes admitted before original70s expiry and returns unchanged after71s await',r.status===200&&result.previewReady&&result.lateFinal?.executedAt<result.previewExpiresAt&&result.lateFinal.returnedAt>=result.previewExpiresAt&&result.lateFinal.returnedAt-result.lateFinal.executedAt>=71&&result.nativeDeadline>result.lateFinal.returnedAt&&result.lateFinal.result.length===1&&result.lateFinal.params[0]===claim?.id&&result.lateFinal.params[1]===String(BASE)&&result.lateFinal.params[3]===setup.council&&result.lateFinal.params[9]===1&&result.lateFinal.params.at(-1)===claim.claim_nonce,{result,traffic,scope:'Real D1 response latency; no Discord retry or clock override.'});
   check('synchronous original-preview fence prevents physical PUT after late final-D1 response and preserves original claimed never-dispatch receipt',puts.length===0&&deletes.length===0&&!effectRoles.get(kind).has(setup.council)&&claim?.state==='held'&&claim.reason==='canonical233_never_dispatched'&&/^[0-9a-f]{32}$/.test(claim.claim_nonce)&&!recorded.some(x=>x.attempts===1&&x.state==='settled'),{claim,action:result.action,traffic});
   check('late final-D1 case does not reset or rewrite existing unrelated uncertainty',result.unrelatedUnknown?.state==='unknown'&&result.unrelatedUnknown.attempts===1&&JSON.stringify(result.unrelatedUnknown)===JSON.stringify(result.unrelatedUnknownAfter),{before:result.unrelatedUnknown,after:result.unrelatedUnknownAfter});
  }
  if(kind==='after-denied'){
   const originals=recorded.filter(x=>x.desired===1&&x.attempts===1),compensations=recorded.filter(x=>x.desired===0&&x.attempts===1);
   check('post-PUT original admin revocation performs at most one owned compensation or retains an explicit uncertain outcome',r.status===200&&result.previewReady&&result.actor?.denied===1&&puts.length===1&&deletes.length<=1&&effectRoles.get(kind).has('900000000000000005')&&
    (deletes.length===1&&!effectRoles.get(kind).has(setup.council)&&compensations.some(x=>x.state==='settled'&&x.request_digest===originals[0]?.id)||originals.some(x=>['unknown','dispatching'].includes(x.state))),{result,traffic});
   check('post-writer admission loss returns honest unconfirmed copy without private result',result.action?.body?.error==='repair_outcome_unconfirmed'&&result.action.body.outcome==='roles_may_have_changed'&&!result.action.body.result,result.action);
  }
  if(kind!=='wrong-role')check(kind+' intent is attributed to original officer with privacy subject reference, never scheduled role.request242',result.intents?.length===1&&/^80000000000000010[0-9]$/.test(result.intents[0].actor)&&result.intents[0].subject===result.subject&&JSON.parse(result.intents[0].details)._privacySubjectIds.includes(result.subject)&&JSON.parse(result.intents[0].details).maxPlannedEffects===2,result.intents);
 }
 const evidenceCustody=custody(),receipt={at:new Date().toISOString(),bundleSHA256:source===null?null:hash(source),...evidenceCustody,cases,http,ok:evidenceCustody.stable&&cases.every(c=>c.pass)};
 fs.writeFileSync(path.join(out,'site-role-audit283.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({ok:receipt.ok,checks:cases.length,evidence:out}));if(!receipt.ok)process.exitCode=1;
 }finally{clearTimeout(whole);if(mf)await mf.dispose();stop();}})().catch(e=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({at:new Date().toISOString(),ok:false,error:String(e.stack||e),bundleSHA256:source===null?null:hash(source),...custody(),cases,http},null,2)+'\n');console.error(e.stack);console.error('Preserved failure: '+out);process.exitCode=1;});

'use strict';
// Real source/clock/Workerd/D1. The external Discord service alone is replaced.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olv-roster-pacing271-'));
const started=performance.now();
const sourceFiles=['src/site-launch229.ts','src/launch-discord-reads271.ts','src/launch-operations229.ts','src/officer-invites233.ts'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const http=[],checks=[],perMode=new Map();let mf,active=0,maxActive=0,sourceChanged=false;
const check=(name,value)=>{assert(value,name);checks.push({name,passed:true});};
const modes={'429-body':{header:'1.1',body:3.2,reset:'2.4',expected:4},
  '429-header':{header:'5.2',body:2.1,reset:'3.1',expected:6},
  '429-reset':{header:'2.1',body:1.2,reset:'7.2',expected:8},
  '429-persistent':{header:'1',body:1,reset:'1',expected:1}};
async function fixtureCall(route,body={}){
  const response=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
  const raw=await response.text();assert.equal(response.status,200,raw);const result=JSON.parse(raw);
  assert.equal(result.complete,true,raw);return result;
}
async function refused(route,body,code,status){
  const before=http.length,response=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
  const raw=await response.text();assert.equal(response.status,status,raw);assert.equal(JSON.parse(raw).complete,false);
  assert(raw.includes(code),raw);assert.equal(http.length,before,'a refused cursor cannot dispatch Discord reads');
}
async function run(){
  const seed=await fixtureCall('seed');check('fixture runs inside actual local Workerd with genuine D1',seed.actualLocalWorkerdD1);
  let cursor=null,originalScan,offset=0;const recommendations=new Set(),pages=[];
  do{
    const before=http.length,{page}=await fixtureCall('page',{mode:'full',cursor});pages.push(page);
    assert.equal(page.entitlements.offset,offset);assert.equal(page.entitlements.total,1000);assert.equal(page.entitlements.scanned,20);
    assert.equal(page.entitlements.retryAfterSeconds,null);assert.equal(page.promotions.length,20);assert.equal(page.invites.length,0);
    assert(page.pageCursor&&typeof page.pageCursor==='string');assert.equal(page.snapshotAt,seed.at-120);
    assert(page.expiresAt<=page.fetchedAt+60&&page.scan.expiresAt===seed.at-120+600);
    if(!originalScan)originalScan=page.scan;else assert.deepEqual(page.scan,originalScan);
    for(const row of page.promotions){assert(!recommendations.has(row.guid));recommendations.add(row.guid);assert.equal(row.currentSlot,9);assert.equal(row.targetSlot,8);assert.equal(row.targetName,'Member');}
    assert.equal(http.length-before,20,'each real page uses exactly 20 external role reads');
    cursor=page.nextCursor;offset+=20;
  }while(cursor);
  check('all 50 signed cursor pages cover 1000 unique current native GUID recommendations',pages.length===50&&recommendations.size===1000);
  check('the final native row retains its Member recommendation',recommendations.has('Player-6933-000003e8'));
  check('all source snapshot and 60/600-second deadlines remain original',pages.every(p=>p.snapshotId===1&&p.snapshotAt===seed.at-120&&p.scan.expiresAt===originalScan.expiresAt));
  const full=http.filter(r=>r.mode==='full');
  check('real Discord role reads are serialized',maxActive===1&&full.length===1000);
  const paced=full.filter(r=>r.resetMilliseconds);
  check('fractional successful-response bucket resets are honored before the next dispatch',paced.length>=50&&paced.every(r=>{
    const next=full[full.indexOf(r)+1];return !next||next.started-r.completed>=r.resetMilliseconds-3;
  }));
  const beforePartial=http.length,firstPartial=(await fixtureCall('page',{mode:'partial-recover'})).page;
  assert.equal(http.length-beforePartial,6);assert.equal(firstPartial.promotions.length,5);assert.equal(firstPartial.nextCursor,null);
  const captured=JSON.parse(Buffer.from(firstPartial.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.equal(captured.version,2);assert.equal(captured.roleReads.length,5);
  const recovered=(await fixtureCall('page',{mode:'partial-recover',cursor:firstPartial.pageCursor})).page;
  assert.equal(http.length-beforePartial,21);assert.equal(recovered.promotions.length,20);assert.deepEqual(recovered.scan,firstPartial.scan);
  assert.equal(recovered.snapshotAt,firstPartial.snapshotAt);assert(recovered.expiresAt<=Math.min(...captured.roleReads.map(row=>row[2]+60)));
  const recoveredCursor=JSON.parse(Buffer.from(recovered.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.deepEqual(recoveredCursor.roleReads,[]);
  const partialHTTP=http.slice(beforePartial);
  check('signed same-page retry reuses only original fresh successes without rereading or renewing them',captured.roleReads.every(row=>{
    const index=parseInt(row[0].split('-').at(-1),16)-1,subject=String(800000000000001000n+BigInt(index));
    return partialHTTP.filter(request=>request.subject===subject).length===1;
  }));
  const beforeRecheck=http.length,rechecked=(await fixtureCall('page',{mode:'partial-recover',cursor:recovered.pageCursor})).page;
  check('a successful same-page cursor requires 20 fresh role reads for an explicit recheck',http.length-beforeRecheck===20&&rechecked.promotions.length===20);
  const beforeStale=http.length,stale=await fixtureCall('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'expired-role'});
  check('synthetic signed-input boundary rereads stale role observations under real clock and source',stale.syntheticSignedInputBoundary&&http.length-beforeStale===20&&stale.page.promotions.length===20);
  const [tamperBody,tamperMAC]=firstPartial.pageCursor.split('.'),tampered=JSON.parse(Buffer.from(tamperBody,'base64url').toString('utf8'));
  tampered.roleReads[0][1]='knight';
  await refused('page',{mode:'partial-recover',cursor:Buffer.from(JSON.stringify(tampered)).toString('base64url')+'.'+tamperMAC},'invalid_launch_cursor',400);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'wrong-guid'},'launch_cursor_role_source_changed',409);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'wrong-role-scope'},'launch_cursor_role_source_changed',409);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'expired-scan'},'expired_or_invalid_launch_cursor',400);
  await refused('page',{mode:'credential-change',cursor:firstPartial.pageCursor},'invalid_launch_cursor',400);
  check('tampered expired wrong-target and credential-mismatched cache cursors are refused before HTTP',true);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'shared-secret-forgery'},'invalid_launch_cursor',400);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'legacy-v1-cache-forgery'},'expired_or_invalid_launch_cursor',400);
  check('the shared addon secret cannot mint v2 cached roles or inject a cache into legacy v1',true);
  const beforeLegacy=http.length,legacy=await fixtureCall('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'legacy-v1'});
  check('exact cache-free legacy v1 selection requires fresh genuine role reads',legacy.syntheticSignedInputBoundary&&http.length-beforeLegacy===20&&legacy.page.promotions.length===20);
  for(const kind of ['privacy','link']){
    await fixtureCall('source-state',{kind});
    await refused('page',{mode:'partial-recover',cursor:firstPartial.pageCursor},'launch_cursor_source_changed',409);
    await fixtureCall('source-state',{kind,restore:true});
  }
  check('actual D1 privacy or exact-link source change rejects previously valid cached successes',true);
  const cursors=[...pages.flatMap(p=>[p.pageCursor,p.nextCursor]),firstPartial.pageCursor,recovered.pageCursor].filter(Boolean);
  check('serialized cursor data contains no Discord ID or raw fixture credential',cursors.every(cursor=>{
    const text=Buffer.from(cursor.split('.')[0],'base64url').toString('utf8');
    return !['800000000000001000','synthetic-roster-pacing','DISCORD_BOT_TOKEN','discordId','discord_id'].some(value=>text.includes(value));
  }));
  for(const [mode,spec] of Object.entries(modes)){
    let samePage=null,sameScan;
    for(let attempt=0;attempt<(mode==='429-persistent'?3:1);attempt++){
      const before=http.length,{page}=await fixtureCall('page',{mode,cursor:samePage});
      assert.equal(page.promotions.length,0);assert.equal(page.invites.length,0);assert.equal(page.entitlements.retryAfterSeconds,spec.expected);
      assert.equal(page.status,'partial');assert(page.heldReasons.includes('discord-rate-limited'));assert(page.pageCursor);assert.equal(page.nextCursor,null);
      assert.equal(http.length-before,1,'429 stops additional role dispatch and never retries within this read');
      if(sameScan)assert.deepEqual(page.scan,sameScan);
      sameScan=page.scan;
      samePage=page.pageCursor;
    }
    check(mode+' takes the greatest header/body/reset delay and stays held without an in-call retry',true);
  }
  const malformed=await fixtureCall('page',{mode:'malformed'});
  check('malformed headers and role bodies cannot invent an entitlement',malformed.page.promotions.length===0&&malformed.page.held.length===20&&malformed.page.entitlements.retryAfterSeconds===null);
  const beforeSlow=http.length,slowStarted=performance.now(),slow=await fixtureCall('page',{mode:'slow-read'}),slowDuration=performance.now()-slowStarted;
  check('real local read window exhaustion is held separately from an upstream Discord 429',slowDuration>=9000&&slowDuration<16000&&http.length-beforeSlow<=10&&slow.page.status==='held'&&slow.page.promotions.length===0&&slow.page.heldReasons.includes('launch-read-window-exhausted')&&!slow.page.heldReasons.includes('discord-rate-limited')&&slow.page.entitlements.retryAfterSeconds===null);
  await fixtureCall('ranks');const beforeSkip=http.length,skip=await fixtureCall('page',{mode:'skip-native'});
  const expected=Array.from({length:7},(_,i)=>'Player-6933-'+(i+1).toString(16).padStart(8,'0'));
  check('exact native ranks 0 through 6 need neither Discord reads nor unknown-entitlement holds',http.length-beforeSkip===13&&skip.page.promotions.length===13&&http.slice(beforeSkip).every(row=>BigInt(row.subject)-800000000000001000n>=7n)&&expected.every(id=>!skip.page.held.some(r=>r.guid===id)&&!skip.page.promotions.some(r=>r.guid===id)));
  const changed=await fixtureCall('page',{mode:'source-change'});
  check('actual D1 native source change during Discord await refuses the whole projection',sourceChanged&&changed.page.status==='held'&&changed.page.promotions.length===0&&changed.page.heldReasons.includes('native-snapshot-changed'));
  const audit=await fixtureCall('audit');for(const item of audit.checks){assert(item.passed);checks.push(item);}
  check('all mocked external traffic is Discord GET only',http.every(r=>r.method==='GET'));
  return {complete:true,actualLocalWorkerdD1:true,checks,syntheticDiscordGETs:http.length,providerCalls:0,pages:pages.length};
}
(async()=>{
  let timer;
  try{
    const sourceSHA256=hashes();
    fs.writeFileSync(path.join(out,'source-sha256.json'),JSON.stringify(sourceSHA256,null,2)+'\n',{flag:'wx'});
    const script=buildSync({entryPoints:[path.join(__dirname,'launch_roster_pacing271_runtime.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'}).outputFiles[0].text;
    mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script,modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'roster-pacing271'},resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),outboundService:async request=>{
      const url=new URL(request.url),match=url.pathname.match(/^\/api\/v10\/guilds\/800000000000000001\/members\/(\d{18})$/),mode=(request.headers.get('Authorization')||'').replace('Bot synthetic-roster-pacing-','');
      assert.equal(url.origin,'https://discord.com');assert.equal(url.search,'');assert.equal(request.method,'GET');assert(match);
      const index=BigInt(match[1])-800000000000001000n;assert(index>=0n&&index<1000n);
      const n=(perMode.get(mode)||0)+1;perMode.set(mode,n);
      const row={mode,method:request.method,subject:match[1],started:performance.now(),completed:0,resetMilliseconds:mode==='full'&&n%10===0?30:0};http.push(row);
      active++;maxActive=Math.max(maxActive,active);
      try{
        await new Promise(resolve=>setTimeout(resolve,mode==='slow-read'?1000:2)); // real external latency, never a fake clock
        if(mode==='source-change'&&!sourceChanged){sourceChanged=true;await fixtureCall('source-change');}
        const limited=mode==='partial-recover'&&n===6?{header:'0.03',body:0.03,reset:'0.03'}:modes[mode];
        if(limited)return Response.json({retry_after:limited.body,global:false},{status:429,headers:{'Retry-After':limited.header,'X-RateLimit-Reset-After':limited.reset}});
        return Response.json({user:{id:match[1]},roles:mode==='malformed'?'invalid-role-body':[]},{headers:mode==='malformed'?{'X-RateLimit-Remaining':'not-a-number','X-RateLimit-Reset-After':'Infinity'}:row.resetMilliseconds?{'X-RateLimit-Remaining':'0','X-RateLimit-Reset-After':'0.03'}:{'X-RateLimit-Remaining':'1','X-RateLimit-Reset-After':'0'}});
      }finally{row.completed=performance.now();active--;}
    }}));
    const result=await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('roster pacing qualification exceeded 170 seconds')),170000);})]);
    assert.deepEqual(hashes(),sourceSHA256,'source files changed during qualification');
    result.sourceSHA256=sourceSHA256;result.bundleSHA256=createHash('sha256').update(script).digest('hex');
    result.elapsedSeconds=(performance.now()-started)/1000;
    fs.writeFileSync(path.join(out,'runtime-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    for(const item of result.checks)console.log('PASS '+item.name);
    console.log('ROSTER_PACING271_RESULT '+JSON.stringify({...result,checks:undefined,passed:result.checks.length,evidence:out}));
  }finally{
    clearTimeout(timer);if(mf)await mf.dispose();
    fs.writeFileSync(path.join(out,'synthetic-http.json'),JSON.stringify(http,null,2)+'\n',{flag:'wx'});
  }
})().catch(error=>{console.error(error);console.error('ROSTER_PACING271_EVIDENCE '+out);process.exitCode=1;});

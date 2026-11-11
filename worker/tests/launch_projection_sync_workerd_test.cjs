'use strict';
// Explicit changed-path check: real current Worker module and genuine local D1.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olv-promotion-sync-')),http=[];
let mf;
(async()=>{
  try{
    const script=buildSync({entryPoints:[path.join(__dirname,'launch_projection_sync_runtime.mjs')],absWorkingDir:root,
      bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],
      tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'}).outputFiles[0].text;
    mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script,modules:true,compatibilityDate:'2026-09-01',
      compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),
      logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,
      d1Databases:{DB:'promotion-sync'},resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),
      isolatedResourcePersistencePath:path.join(out,'isolated'),outboundService:request=>{
        const url=new URL(request.url),match=url.pathname.match(/^\/api\/v10\/guilds\/800000000000000001\/members\/(80000000000000010[1-9])$/);
        assert.equal(url.origin,'https://discord.com');assert.equal(url.search,'');assert.equal(request.method,'GET');assert(match);
        http.push({method:request.method,subject:match[1]});
        return Response.json({user:{id:match[1]},roles:match[1]==='800000000000000102'?['1299841745550311535']:[]});
      }}));
    const response=await mf.dispatchFetch('http://fixture.invalid/check',{method:'POST'}),raw=await response.text();
    fs.writeFileSync(path.join(out,'runtime-result.json'),raw+'\n',{flag:'wx'});
    assert.equal(response.status,200,raw);const result=JSON.parse(raw);
    assert.equal(result.complete,true);assert.equal(result.actualLocalWorkerdD1,true);
    assert(result.checks.length>0&&result.checks.every(check=>check.passed));
    assert.deepEqual(http.map(row=>row.subject).sort(),['800000000000000101','800000000000000102'],'only fresh eligible original anchors may reach entitlement reads');
    for(const check of result.checks)console.log('PASS '+check.name);
    console.log('PROMOTION_SYNC_RESULT '+JSON.stringify({passed:result.checks.length,actualLocalWorkerdD1:true,syntheticDiscordGETs:http.length,providerCalls:0,evidence:out}));
  }finally{
    if(mf)await mf.dispose();
    fs.writeFileSync(path.join(out,'synthetic-http.json'),JSON.stringify(http,null,2)+'\n',{flag:'wx'});
  }
})().catch(error=>{console.error(error);console.error('PROMOTION_SYNC_EVIDENCE '+out);process.exitCode=1;});

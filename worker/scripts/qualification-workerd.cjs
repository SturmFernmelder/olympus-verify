'use strict';
// One local Workerd process, genuine D1 bindings, synthetic Discord HTTP only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=process.argv[2],targets=process.argv.slice(3);
if(!out||!path.isAbsolute(out)||!fs.statSync(out).isDirectory()||targets.some(x=>!['lease','treasury','reconciliation'].includes(x))||new Set(targets).size!==targets.length)throw Error('invalid_runtime_arguments');
const kinds=['baseline',...targets],calls=[],handoffs=[],present=new Set(),blocked='800000000000000103';
const bundle=buildSync({entryPoints:[path.join(root,'tests/qualification_runtime_test.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'}).outputFiles[0].text;
let mf,complete=false;
const observations=[];
async function run(){
  try{
    mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:bundle,modules:true,name:'bounded-qualification',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,
      resourceTmpPath:path.join(out,'runtime-tmp'),resourcePersistencePath:path.join(out,'runtime-persist'),isolatedResourcePersistencePath:path.join(out,'runtime-isolated'),
      d1Databases:Object.fromEntries(kinds.map(k=>['DB_'+k,'qualification-'+k])),outboundService:async request=>{
        const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,'');
        if(u.origin==='https://verify.example'&&u.pathname==='/internal/roles242/continue'){
          assert.equal(request.method,'POST');assert.equal(u.search,'');
          const text=await request.text(),body=JSON.parse(text),signature=crypto.createHmac('sha256','qualification-secret-only').update('role-continuation242\n'+text).digest('hex');
          assert.equal(request.headers.get('X-Olympus-Role-Continuation'),signature,'actual handoff HMAC');
          assert(['requests','sweep'].includes(body.kind));assert.equal(Object.keys(body).sort().join(','),body.kind==='requests'?'at,kind,nonce':'at,kind,nonce,sweep');
          assert(Number.isSafeInteger(body.at)&&Math.abs(Math.floor(Date.now()/1000)-body.at)<=60);
          if(body.kind==='sweep')assert.deepEqual(body.sweep,{id:'f'.repeat(32),n:5});
          handoffs.push({kind:body.kind,sweep:body.sweep??null,status:body.kind==='requests'?503:202});
          return new Response(null,{status:body.kind==='requests'?503:202});
        }
        assert.equal(u.origin,'https://discord.com','only synthetic Discord HTTP is permitted');
        assert.equal(u.search,'','unexpected outbound query');
        calls.push({method:request.method,path:p});
        if(request.method==='GET'&&p==='/guilds/800000000000000001/roles')return Response.json([{id:'800000000000000010'},{id:'800000000000000011'}]);
        const member=p.match(/^\/guilds\/800000000000000001\/members\/(80000000000000010[123])$/);
        if(request.method==='GET'&&member)return Response.json({user:{id:member[1]},roles:member[1]===blocked?['800000000000000011']:present.has(member[1])?['800000000000000010']:[]});
        if(request.method==='PUT'&&p==='/guilds/800000000000000001/members/800000000000000101/roles/800000000000000010'){present.add('800000000000000101');return new Response(null,{status:204});}
        throw Error('unexpected synthetic Discord effect: '+request.method+' '+p);
      }}));
    await mf.ready;
    for(const target of kinds){
      const started=performance.now(),response=await mf.dispatchFetch('http://fixture.invalid/'+target,{method:'POST'}),raw=await response.text();
      fs.writeFileSync(path.join(out,'runtime-'+target+'.json'),raw+'\n',{flag:'wx'});
      assert.equal(response.status,200,target+' runtime failure: '+raw);
      const observation=JSON.parse(raw);observations.push({...observation,elapsedSeconds:(performance.now()-started)/1000});
      assert.equal(observation.complete,true);assert.equal(observation.actualLocalWorkerdD1,true);assert(observation.checks.length>0&&observation.checks.every(x=>x.passed===true));
      for(const check of observation.checks)console.log('PASS '+target+': '+check.name);
    }
    const effects=calls.filter(x=>x.method!=='GET');
    assert.deepEqual(effects,[{method:'PUT',path:'/guilds/800000000000000001/members/800000000000000101/roles/800000000000000010'}],'only the eligible synthetic grant may dispatch');
    console.log('PASS only one eligible synthetic Discord effect; no banned, blocked or unproven Native effect');
    assert.deepEqual(handoffs.map(x=>[x.kind,x.status]),targets.includes('reconciliation')?[['requests',503],['sweep',202]]:[],'failed requests handoff must not suppress or repeat the independent sweep');
    if(targets.includes('reconciliation'))console.log('PASS signed request503 and independent same-generation sweep202 each attempted once in order');
    complete=true;
  }finally{
    if(mf)await mf.dispose();
    fs.writeFileSync(path.join(out,'runtime-result.json'),JSON.stringify({complete,actualLocalWorkerdD1:observations.some(x=>x.actualLocalWorkerdD1===true),targets:kinds,observations,syntheticHTTP:calls,syntheticHandoffs:handoffs,providerCalls:0,clockOverrides:false,d1MethodOverrides:false,scope:'Local behavioral verification; no production or aggregate Native acceptance claim.'},null,2)+'\n',{flag:'wx'});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

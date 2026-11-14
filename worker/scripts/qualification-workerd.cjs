'use strict';
// One local Workerd process, genuine D1 bindings, synthetic Discord HTTP only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=process.argv[2],targets=process.argv.slice(3);
if(!out||!path.isAbsolute(out)||!fs.statSync(out).isDirectory()||targets.some(x=>!['lease','treasury','reconciliation'].includes(x))||new Set(targets).size!==targets.length)throw Error('invalid_runtime_arguments');
const kinds=['baseline',...targets],calls=[],handoffs=[],present=new Set(),blocked='800000000000000103';
const canonicalGuild='236932545793490944',canonicalSubject='800000000000000399',canonicalGM='1554261979684933742',canonicalBot='800000000000000002',canonicalBotRole='888888888888888888';
const liveMember='800000000000000400',liveOfficer='800000000000000401',liveAlt='800000000000000402',canonicalMember='1552077551839617104',canonicalOfficer='1554262223038324840';
const canonicalPresent=new Map([canonicalSubject,liveMember,liveOfficer,liveAlt].map(id=>[id,new Set()]));
const canonicalAllowedGrants=new Map([[canonicalSubject,canonicalGM],[liveMember,canonicalMember],[liveOfficer,canonicalOfficer]]);
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
          const text=await request.text(),body=JSON.parse(text),signature=crypto.createHmac('sha256','qualification-cookie-only').update('role-continuation280-v2\n'+u.origin+'\n'+text).digest('hex');
          assert.equal(request.headers.get('X-Olympus-Role-Continuation'),signature,'actual handoff HMAC');
          assert.equal(body.version,2);assert(['requests','sweep'].includes(body.kind));assert.equal(Object.keys(body).sort().join(','),body.kind==='requests'?'at,kind,nonce,version':'at,kind,nonce,sweep,version');
          assert(Number.isSafeInteger(body.at)&&Math.abs(Math.floor(Date.now()/1000)-body.at)<=60);
          if(body.kind==='sweep')assert.deepEqual(body.sweep,{id:'f'.repeat(32),n:5});
          handoffs.push({kind:body.kind,sweep:body.sweep??null,status:body.kind==='requests'?503:202});
          return new Response(null,{status:body.kind==='requests'?503:202});
        }
        assert.equal(u.origin,'https://discord.com','only synthetic Discord HTTP is permitted');
        assert.equal(u.search,'','unexpected outbound query');
         if(u.pathname==='/__fixture/strip-member'){
           assert.equal(request.method,'POST');assert.equal(await request.text(),'');
           const roles=canonicalPresent.get(liveMember);assert(roles.has(canonicalMember),'only an actually granted mock Member may be stripped');roles.delete(canonicalMember);
           calls.push({method:'POST',path:p,fixtureControl:'strip-member'});
           return Response.json({fixtureControl:'strip-member',subject:liveMember,role:canonicalMember,wasPresent:true,present:roles.has(canonicalMember)});
         }
        calls.push({method:request.method,path:p});
        if(p==='/users/@me'||p.startsWith('/guilds/'+canonicalGuild+'/'))assert(u.pathname.startsWith('/api/v10/'),'exact canonical Discord API prefix');
        if(request.method==='GET'&&p==='/users/@me')return Response.json({id:canonicalBot,bot:true});
        if(request.method==='GET'&&p==='/guilds/'+canonicalGuild+'/roles')return Response.json([{id:canonicalGuild,name:'@everyone',position:0,permissions:'0',managed:false},{id:canonicalBotRole,name:'Fixture Bot',position:100,permissions:'268435456',managed:false},{id:canonicalGM,name:'Olympus Guild Master',position:50,permissions:'0',managed:false},{id:canonicalOfficer,name:'Olympus Officer',position:40,permissions:'0',managed:false},{id:canonicalMember,name:'Olympus Member',position:1,permissions:'0',managed:false}]);
        if(request.method==='GET'&&p==='/guilds/'+canonicalGuild+'/members/'+canonicalBot)return Response.json({user:{id:canonicalBot,bot:true},roles:[canonicalBotRole]});
        for(const [id,roles]of canonicalPresent){
          if(request.method==='GET'&&p==='/guilds/'+canonicalGuild+'/members/'+id)return Response.json({user:{id},roles:[...roles]});
          const role=canonicalAllowedGrants.get(id);
          if(role&&request.method==='PUT'&&p==='/guilds/'+canonicalGuild+'/members/'+id+'/roles/'+role){roles.add(role);return new Response(null,{status:204});}
        }
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
      if(target==='baseline'){
        const cache=observation.checks.find(x=>x.name==='current authenticated cache retires the officer-signed wake capability')?.observed;
        assert(cache,'actual Workerd queue response is required for the Watcher round trip');
        const probe=cp.spawnSync(process.env.OLYMPUS_LUA_PYTHON||'python',[path.join(root,'../watcher/tests/queue_capability281_probe.py')],{input:JSON.stringify(cache),encoding:'utf8',windowsHide:true,timeout:20000});
        fs.writeFileSync(path.join(out,'watcher-cache281.stdout.log'),probe.stdout||'',{flag:'wx'});
        fs.writeFileSync(path.join(out,'watcher-cache281.stderr.log'),probe.stderr||'',{flag:'wx'});
        assert.equal(probe.status,0,'actual cache to actual Watcher failed: '+(probe.stderr||probe.error||probe.stdout));
        console.log(probe.stdout.trim());
      }
    }
    const fixtureControl=x=>x.method==='POST'&&x.path==='/__fixture/strip-member'&&x.fixtureControl==='strip-member';
    assert.deepEqual(calls.filter(x=>Object.hasOwn(x,'fixtureControl')),targets.includes('reconciliation')?[{method:'POST',path:'/__fixture/strip-member',fixtureControl:'strip-member'}]:[],'only the exact synthetic Member-strip control is excluded from provider effects');
    const effects=calls.filter(x=>x.method!=='GET'&&!fixtureControl(x));
    assert.deepEqual(effects,[{method:'PUT',path:'/guilds/800000000000000001/members/800000000000000101/roles/800000000000000010'},...(targets.includes('reconciliation')?[{method:'PUT',path:'/guilds/'+canonicalGuild+'/members/'+canonicalSubject+'/roles/'+canonicalGM},{method:'PUT',path:'/guilds/'+canonicalGuild+'/members/'+liveMember+'/roles/'+canonicalMember},{method:'PUT',path:'/guilds/'+canonicalGuild+'/members/'+liveMember+'/roles/'+canonicalMember},{method:'PUT',path:'/guilds/'+canonicalGuild+'/members/'+liveOfficer+'/roles/'+canonicalOfficer}]:[])],'only eligible common and separately proved original-policy GM/Member/Member-restore/Officer grants may dispatch; unknown/cross-policy/drift must not PUT or DELETE');
    console.log('PASS only eligible common and original-policy Native grants; no banned, blocked, mirror or Member-stack effect');
    assert.deepEqual(handoffs.map(x=>[x.kind,x.status]),targets.includes('reconciliation')?[['requests',503],['sweep',202]]:[],'failed requests handoff must not suppress or repeat the independent sweep');
    if(targets.includes('reconciliation'))console.log('PASS signed request503 and independent same-generation sweep202 each attempted once in order');
    complete=true;
  }finally{
    if(mf)await mf.dispose();
    fs.writeFileSync(path.join(out,'runtime-result.json'),JSON.stringify({complete,actualLocalWorkerdD1:observations.some(x=>x.actualLocalWorkerdD1===true),targets:kinds,observations,syntheticHTTP:calls,syntheticHandoffs:handoffs,providerCalls:0,clockOverrides:false,d1MethodOverrides:false,scope:'Local behavioral verification; no production or aggregate Native acceptance claim.'},null,2)+'\n',{flag:'wx'});
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

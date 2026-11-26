'use strict';
// Current Worker/session/CSRF/admission and genuine D1; only Discord HTTP replies are synthetic.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-profile-command307-'));
const modes=['normal','unknown-landed','unknown-absent','conflict','concurrent','appeared','appeared-conflict','foreign','denied','left','banned','stale-session','csrf','stale-page'];
const APP='1550176895671341076',GUILD='236932545793490944',state=new Map(),checks=[];let mf;
const check=(name,yes)=>{checks.push({name,passed:!!yes});console.log((yes?'PASS ':'FAIL ')+name);assert(yes,name);};
(async()=>{try{
 const {OLYMPUS_PROFILE_COMMAND307:definition}=await import(pathToFileURL(path.join(root,'src/discord-profile-command-definition307.ts')).href);
 const bundle=buildSync({entryPoints:[path.join(__dirname,'profile_command307_fixture.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],logLevel:'silent'}).outputFiles[0].text;
 for(const mode of modes){const other={id:'800000000000000901',application_id:APP,guild_id:GUILD,type:1,name:'unchanged-command',name_localizations:{de:'unveraendert'},description:'Keep this exact command',description_localizations:{de:'Unveraenderte Beschreibung'},version:'800000000000000902',options:[{type:3,name:'choice',description:'Unchanged option',required:false}]};
  state.set(mode,{rows:[other],original:JSON.stringify(other),posts:0,gets:0});
  if(mode==='conflict')state.get(mode).rows.push({...definition,id:'800000000000000903',application_id:APP,guild_id:GUILD,description:'A different existing definition'});
 }
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:bundle,modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],cf:false,host:'127.0.0.1',port:0,
  log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,
  resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),
  d1Databases:Object.fromEntries(modes.map(mode=>['DB_'+mode,'profile-command-'+mode])),outboundService:async request=>{
   const url=new URL(request.url),mode=(request.headers.get('Authorization')??'').replace('Bot synthetic-profile-',''),s=state.get(mode);
   assert(s,'only this fixture credential may reach the synthetic provider');assert.equal(url.origin,'https://discord.com');
   assert.equal(url.pathname,`/api/v10/applications/${APP}/guilds/${GUILD}/commands`);
   if(request.method==='GET'){
    assert.equal(url.search,'?with_localizations=true');s.gets++;
    if(s.gets===2&&mode.startsWith('appeared'))s.rows.push({...definition,id:'800000000000000906',application_id:APP,guild_id:GUILD,
      ...(mode==='appeared-conflict'?{description:'A concurrently registered conflicting definition'}:{})});
    return Response.json(s.rows);
   }
   assert.equal(url.search,'');
   assert.equal(request.method,'POST','no guild-wide PUT, PATCH or DELETE is admitted');s.posts++;
   assert.equal(s.posts,1,'one durable POST attempt maximum across duplicate/unknown requests');assert.deepEqual(await request.json(),definition);
   if(mode!=='unknown-absent')s.rows.push({...definition,id:'800000000000000904',application_id:APP,guild_id:GUILD,version:'800000000000000905'});
   if(mode.startsWith('unknown-'))throw Error('synthetic original POST reply lost');
   return Response.json(s.rows.at(-1));
  }}));
 for(const mode of modes){
  const response=await mf.dispatchFetch('http://fixture.invalid/'+mode,{method:'POST'}),raw=await response.text(),s=state.get(mode);
  fs.writeFileSync(path.join(out,mode+'.raw.log'),raw,{flag:'wx'});
  assert.equal(response.status,200,raw.slice(0,2500));const result=JSON.parse(raw);
  assert.equal(response.status,200,JSON.stringify(result));fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  check(mode+' preserves every other command definition byte for byte',JSON.stringify(s.rows[0])===s.original);
  if(['normal','unknown-landed','concurrent'].includes(mode)){
   check(mode+' creates only the fixed profile command once',s.posts===1&&s.rows.length===2&&!!result.claim);
   check(mode+' verifies the actual registry through a current authenticated request',result.responses.some(r=>r.status===200&&r.body.registered===true));
   if(mode==='normal')check('a standalone current registry read makes no invented before/after preservation claim',result.responses[2].body.registered===true&&!Object.hasOwn(result.responses[2].body,'otherCommandsPreserved'));
   if(mode==='unknown-landed')check('a lost reply is described as observation, not an invented ACK',result.responses[0].body.acknowledged===false&&result.responses[0].body.outcome==='observed_after_unconfirmed_attempt');
  }else if(mode==='unknown-absent'){
   check('unknown absent outcome retains its one attempt and never resends',s.posts===1&&!!result.claim&&result.responses[0].status===503&&result.responses[1].status===409&&result.responses[2].body.registered===false);
  }else if(mode==='conflict')check('a conflicting existing command is left unchanged',s.posts===0&&result.responses[0].status===409&&!result.claim);
  else if(mode.startsWith('appeared'))check(mode+' rechecks after claim and never upserts the newly present definition',s.posts===0&&!!result.claim
    &&result.responses[0].status===(mode==='appeared'?200:409)&&result.responses[0].body.postAttempted!==true);
  else check(mode+' refuses before any Discord registry access',s.posts===0&&s.gets===0&&[401,403,409].includes(result.responses[0].status)&&!result.claim);
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({complete:true,actualLocalWorkerdD1:true,providerCalls:0,checks},null,2)+'\n',{flag:'wx'});
 console.log('PROFILE_COMMAND307_RESULT '+JSON.stringify({output:out,passed:checks.length,providerCalls:0}));
}finally{if(mf)await mf.dispose();}})().catch(error=>{console.error('PROFILE_COMMAND307_OUTPUT '+out);console.error(error);process.exitCode=1;});

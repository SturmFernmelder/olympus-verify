'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),args=process.argv.slice(2),outArg=args.indexOf('--out'),phaseArg=args.indexOf('--phase');
if(outArg<0||!args[outArg+1])throw Error('Pass --out <evidence-directory>');
const out=path.resolve(args[outArg+1]),phase=phaseArg<0?'after':args[phaseArg+1],runId='r-'+crypto.randomUUID();fs.mkdirSync(out,{recursive:true});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=['src/index.ts','src/site-admin.ts','src/backfill.ts','tests/security280_runtime_test.mjs','tests/security280_workerd_test.cjs'];
const inputs=()=>Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const before=inputs(),http=[];
const build=buildSync({entryPoints:[path.join(__dirname,'security280_runtime_test.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'});
const bundle=build.outputFiles[0].text,compiledPins=Object.keys(build.metafile.inputs).map(file=>({path:path.resolve(root,file),sha256:hash(fs.readFileSync(path.resolve(root,file)))}));
fs.writeFileSync(path.join(out,'bundle-'+runId+'.mjs'),bundle);
const response=(status,value)=>new Response(value===undefined?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function provider(request){
 const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,''),method=request.method,auth=request.headers.get('Authorization')||'';http.push({method,host:u.hostname,path:p});
 if(u.hostname==='verify.example'&&p==='/internal/roles242/continue'&&method==='POST')return response(202);
 if(u.hostname!=='discord.com')throw Error('unexpected external provider '+u.hostname);
 const user=id=>({id,username:'verification-'+id.slice(-3),global_name:'Verification fixture',avatar:null});
 if(method==='POST'&&p==='/oauth2/token'){
  const body=new URLSearchParams(await request.text()),code=body.get('code');
  if(!code?.startsWith('code-')||body.get('client_secret')!=='verification280-client')return response(400,{error:'invalid_grant'});
  return response(200,{access_token:'tok-'+code.slice(5),token_type:'Bearer',scope:'identify guilds.members.read'});
 }
 if(auth.startsWith('Bearer tok-')){const id=auth.slice('Bearer tok-'.length);if(p==='/users/@me')return response(200,user(id));if(p==='/users/@me/guilds/800000000000000001/member')return response(200,{user:user(id),roles:[],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});}
 if(auth==='Bot verification280-bot'&&p.startsWith('/guilds/800000000000000001/members/')){
  const id=p.split('/').at(-1);if(id==='800000000000000210')return response(404,{code:10007});if(id==='800000000000000211')return response(503,{message:'synthetic unavailable'});return response(200,{user:user(id),roles:[],pending:false,nick:null});
 }
 throw Error('unexpected synthetic Discord '+method+' '+p);
}
(async()=>{let mf;try{
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:bundle,modules:true,name:'security280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.WARN),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(out,runId,'tmp'),resourcePersistencePath:path.join(out,runId,'persist'),isolatedResourcePersistencePath:path.join(out,runId,'isolated'),d1Databases:{DB:'security280-fixture'},outboundService:provider}));
 await mf.ready;const r=await mf.dispatchFetch('http://fixture.invalid/security280?layout='+encodeURIComponent(phase),{method:'POST'}),text=await r.text();
 let result;try{result=JSON.parse(text);}catch{throw Error('fixture returned '+r.status+' '+text);}
 const after=inputs(),compiledStable=compiledPins.every(p=>hash(fs.readFileSync(p.path))===p.sha256),stable=JSON.stringify(before)===JSON.stringify(after)&&compiledStable;
 const receipt={at:new Date().toISOString(),phase,httpStatus:r.status,inputsBefore:before,inputsAfter:after,ownedInputsStable:stable,compiledStable,compiledPins,bundleSHA256:hash(bundle),providerHTTP:http,result};
 fs.writeFileSync(path.join(out,'security280-'+runId+'.json'),JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(out,'security280-'+phase+'.json'),JSON.stringify(receipt,null,2)+'\n');
 for(const row of result.cases??[])console.log((row.pass?'PASS ':'FAIL ')+row.name+(row.observed?' '+JSON.stringify(row.observed):''));
 console.log(JSON.stringify({phase,checks:result.checks,ok:result.ok,ownedInputsStable:stable,bundleSHA256:receipt.bundleSHA256}));
 if(r.status!==200||!result.ok||!stable)process.exitCode=1;
 }finally{if(mf)await mf.dispose();}})().catch(error=>{fs.writeFileSync(path.join(out,'security280-'+runId+'.error.json'),JSON.stringify({at:new Date().toISOString(),phase,inputsBefore:before,bundleSHA256:hash(bundle),error:String(error.stack),scope:'Fixture setup/execution error; not a passing product result.'},null,2)+'\n');console.error(error.stack);process.exitCode=1;});

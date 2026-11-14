'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {build}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),args=process.argv.slice(2),outArg=args.indexOf('--out'),phaseArg=args.indexOf('--phase');
if(outArg<0||!args[outArg+1])throw Error('Pass --out <evidence-directory>');
const out=path.resolve(args[outArg+1]),phase=phaseArg<0?'after':args[phaseArg+1],runId='r-'+crypto.randomUUID();fs.mkdirSync(out,{recursive:true});
const runtimeRoot=fs.mkdtempSync(path.join(os.tmpdir(),'notes280-'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=['src/treasury-note-maintenance280.ts','src/site-admin.ts','tests/receipt_notes280_runtime_test.mjs','tests/receipt_notes_residual280_runtime_test.mjs','tests/receipt_notes280_workerd_test.cjs','tests/receipt_notes_residual280_mutation_test.cjs'];
const inputs=()=>Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
const before=inputs(),http=[];
const residualCases=['supported-apply','precommit-failure','postcommit-lost','status-existing-failure','status-aftercommit-failure','status-read-failure','census-read-failure','max-read-failure','malformed-marker','unsupported-count','representation','capacity','page-version','concurrent','duplicate-note-ffi','manifest-input-bound'],caseArg=args.indexOf('--case'),selectedCases=caseArg>=0?args[caseArg+1].split(','):['original',...residualCases];
if(selectedCases.some(x=>x!=='original'&&!residualCases.includes(x)))throw Error('unknown_fixed_residual_case');
const mutationArg=args.indexOf('--mutation'),mutationName=mutationArg<0?null:args[mutationArg+1];let mutation=null;
const plugins=mutationName?[{name:'bounded-note-behavior-mutant',setup(build){build.onLoad({filter:/treasury-note-maintenance280\.ts$/},args=>{const original=fs.readFileSync(args.path,'utf8'),definition=require('./receipt_notes_residual280_mutation_test.cjs').definitions[mutationName];if(!definition)throw Error('unknown_behavior_mutation');const effective=definition.change(original);mutation={name:mutationName,module:args.path,originalModuleSHA256:hash(original),effectiveModuleSHA256:hash(effective)};return{contents:effective,loader:'ts'};});}}]:[];
let bundle='',compiledInputs=[];
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
 const built=await build({plugins,entryPoints:[path.join(__dirname,'receipt_notes280_runtime_test.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'});
bundle=built.outputFiles[0].text;compiledInputs=Object.keys(built.metafile.inputs).map(file=>({path:path.resolve(root,file),sha256:hash(fs.readFileSync(path.resolve(root,file)))}));
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:runtimeRoot,script:bundle,modules:true,name:'receipt-notes280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.WARN),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(runtimeRoot,'tmp'),resourcePersistencePath:path.join(runtimeRoot,'persist'),isolatedResourcePersistencePath:path.join(runtimeRoot,'isolated'),d1Databases:{DB:'receipt-notes280-fixture',...Object.fromEntries(residualCases.map(k=>['DB_'+k.replaceAll('-','_'),'receipt-notes280-'+k]))},outboundService:provider}));
 await mf.ready;const results=[];
 for(const scenario of selectedCases){
  const r=await mf.dispatchFetch('http://fixture.invalid/receipt-notes280?layout='+encodeURIComponent(phase)+(scenario==='original'?'':'&scenario='+encodeURIComponent(scenario)),{method:'POST'}),text=await r.text();
  fs.writeFileSync(path.join(out,'response-'+scenario+'.json'),text);let result;try{result=JSON.parse(text);}catch{throw Error('fixture returned '+r.status+' '+text);}
  results.push({scenario,httpStatus:r.status,result});for(const row of result.cases??[])console.log((row.pass?'PASS ':'FAIL ')+row.name);
 }
 const after=inputs(),stable=JSON.stringify(before)===JSON.stringify(after),compiledStable=compiledInputs.every(row=>hash(fs.readFileSync(row.path))===row.sha256),checks=results.reduce((n,x)=>n+(x.result.checks??0),0),ok=results.every(x=>x.httpStatus===200&&x.result.ok===true);
 const receipt={at:new Date().toISOString(),phase,selectedCases,mutation,checks,ok,inputsBefore:before,inputsAfter:after,ownedInputsStable:stable,compiledStable,compiledInputs,bundleSHA256:hash(bundle),providerHTTP:http,results};
 fs.writeFileSync(path.join(out,'receipt-notes280-'+runId+'.json'),JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(out,'receipt-notes280-'+phase+'.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({phase,checks,ok,ownedInputsStable:stable,compiledStable,bundleSHA256:receipt.bundleSHA256}));
 if(!ok||!stable||!compiledStable)process.exitCode=1;
 }finally{if(mf)await mf.dispose();}})().catch(error=>{fs.writeFileSync(path.join(out,'receipt-notes280-'+runId+'.error.json'),JSON.stringify({at:new Date().toISOString(),phase,inputsBefore:before,bundleSHA256:hash(bundle),error:String(error.stack),scope:'Fixture setup/execution error; not a passing product result.'},null,2)+'\n');console.error(error.stack);process.exitCode=1;});

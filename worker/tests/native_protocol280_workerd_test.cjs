'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const args=process.argv.slice(2),outAt=args.indexOf('--out');if(outAt<0||!args[outAt+1])throw Error('Pass --out <new evidence directory>');
const root=path.resolve(__dirname,'..'),out=path.resolve(args[outAt+1]);fs.mkdirSync(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),runtimeRoot=path.join(os.tmpdir(),'bh-'+crypto.randomUUID());
const build=buildSync({entryPoints:[path.join(__dirname,'native_protocol280_runtime_test.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'});
const bundle=build.outputFiles[0].text,pins=Object.keys(build.metafile.inputs).map(p=>({path:path.resolve(root,p),sha256:hash(fs.readFileSync(path.resolve(root,p)))}));
fs.writeFileSync(path.join(out,'bundle.mjs'),bundle);const http=[];
(async()=>{let mf;try{
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:runtimeRoot,script:bundle,modules:true,name:'native-protocol280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.WARN),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(runtimeRoot,'tmp'),resourcePersistencePath:path.join(runtimeRoot,'persist'),isolatedResourcePersistencePath:path.join(runtimeRoot,'isolated'),d1Databases:{DB:'native-protocol280'},outboundService:request=>{http.push({method:request.method,url:request.url});if(request.method==='GET'&&new URL(request.url).pathname==='/api/v10/guilds/800000000000000001/roles')return Response.json([]);throw Error('Unexpected synthetic provider route');}}));
 await mf.ready;const response=await mf.dispatchFetch('http://fixture.invalid/'),raw=await response.text();let result;try{result=JSON.parse(raw);}catch{result={nonJSON:raw};}
 const stable=pins.every(p=>hash(fs.readFileSync(p.path))===p.sha256);
 for(const p of pins){const rel=path.relative(root,p.path);if(!rel.startsWith('..')){const dest=path.join(out,'frozen-source','worker',rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p.path,dest);}}
 const receipt={at:new Date().toISOString(),node:process.version,status:response.status,compiledStable:stable,bundleSHA256:hash(bundle),pins,http,result};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2)+'\n');
 for(const row of result.cases??[])console.log((row.pass?'PASS ':'FAIL ')+row.name);
 console.log(JSON.stringify({checks:result.checks,ok:result.ok,stable,bundleSHA256:receipt.bundleSHA256,status:response.status,http:http.length}));
 if(response.status!==200||!result.ok||!stable||(http.length!==1||http.some(x=>x.method!=='GET'||new URL(x.url).pathname!=='/api/v10/guilds/800000000000000001/roles')))process.exitCode=1;
 }finally{if(mf)await mf.dispose();}})().catch(error=>{fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({at:new Date().toISOString(),bundleSHA256:hash(bundle),error:String(error.stack),http},null,2)+'\n');console.error(error.stack);process.exitCode=1;});

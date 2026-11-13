'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),[phase,out,beforeRoot]=process.argv.slice(2);
if(!out||!['before','after'].includes(phase)||phase==='before'&&!beforeRoot)throw Error('Use before|after <new-evidence-directory> [before-source-root]');
fs.mkdirSync(out,{recursive:true});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const imp=(name,file)=>'import {'+name+'} from '+JSON.stringify(file)+';';
const source=imp('exercise280',path.join(__dirname,'bot_response280_runtime_test.mjs'))+
 (phase==='before'?imp('page',path.join(beforeRoot,'original-page.ts'))+imp('json',path.join(beforeRoot,'../security-routes280/frozen-component/worker/src/discord.ts')):
 imp('oauthResultPage280 as page',path.join(root,'src/bot-response280.ts'))+imp('json',path.join(root,'src/discord.ts')))+
 'export default {fetch(){return exercise280(json,page)}};';
const built=buildSync({stdin:{contents:source,resolveDir:root,sourcefile:'bot-response280-entry.mjs'},absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],metafile:true,logLevel:'silent'});
const bundle=built.outputFiles[0].text,pins=Object.keys(built.metafile.inputs).filter(p=>p!=='bot-response280-entry.mjs').map(p=>({path:path.resolve(root,p),sha256:hash(fs.readFileSync(path.resolve(root,p)))}));
fs.writeFileSync(path.join(out,'bundle.mjs'),bundle);
(async()=>{let mf;try{
 mf=new Miniflare(convertV4MiniflareOptions({script:bundle,rootPath:out,modules:true,name:'bot-response280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.WARN),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,outboundService:()=>{throw Error('No external I/O permitted');}}));
 await mf.ready;const response=await mf.dispatchFetch('http://fixture.invalid/'),result=await response.json(),stable=pins.every(p=>hash(fs.readFileSync(p.path))===p.sha256);
 const receipt={at:new Date().toISOString(),phase,status:response.status,bundleSHA256:hash(bundle),stable,pins,result};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2));
 for(const row of result.cases)console.log((row.pass?'PASS ':'FAIL ')+row.name);
 console.log(JSON.stringify({phase,checks:result.checks,ok:result.ok,stable,bundleSHA256:receipt.bundleSHA256}));if(!result.ok||!stable)process.exitCode=1;
 }finally{if(mf)await mf.dispose();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

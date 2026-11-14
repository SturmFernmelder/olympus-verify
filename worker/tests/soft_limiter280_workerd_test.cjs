'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),args=process.argv.slice(2),i=args.indexOf('--out');if(i<0||!args[i+1])throw Error('Pass --out <directory>');
const out=path.resolve(args[i+1]),phase=args.includes('--before')?'before':'after',id=crypto.randomUUID().slice(0,8),hash=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const built=buildSync({entryPoints:[path.join(__dirname,'soft_limiter280_workerd_fixture.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'}),bundle=built.outputFiles[0].text;
const inputs=Object.keys(built.metafile.inputs).map(p=>({path:path.resolve(root,p),sha256:hash(fs.readFileSync(path.resolve(root,p)))})),http=[];
(async()=>{const runs=[];for(const mode of ['unit','routes']){let mf;try{
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:path.join(out,id,mode),script:bundle,modules:true,name:'sl280-'+mode,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'sl280-'+mode},outboundService:async request=>{
  const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,''),authorization=request.headers.get('Authorization');http.push({method:request.method,host:u.hostname,path:p});
  const answer=value=>Response.json(value),user={id:'800000000000000280',username:'limiter-fixture',global_name:'Limiter fixture',avatar:null};
  if(u.hostname==='discord.com'&&request.method==='POST'&&p==='/oauth2/token')return answer({access_token:'limiter-token',token_type:'Bearer',scope:'identify guilds.members.read'});
  if(u.hostname==='discord.com'&&authorization==='Bearer limiter-token'&&p==='/users/@me')return answer(user);
  if(u.hostname==='discord.com'&&authorization==='Bearer limiter-token'&&p==='/users/@me/guilds/800000000000000001/member')return answer({user,roles:[],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});
  throw Error('Unexpected provider request '+request.method+' '+p);
 }}));
 await mf.ready;const r=await mf.dispatchFetch('http://fixture.invalid/'+mode),body=await r.text();let result;try{result=JSON.parse(body);}catch{result={ok:false,error:body};}runs.push({mode,status:r.status,result});for(const c of result.cases??[])console.log((c.pass?'PASS ':'FAIL ')+mode+': '+c.name+(c.observed?' '+JSON.stringify(c.observed):''));if(result.error)console.log(result.error);
 }finally{if(mf)await mf.dispose();}}
 const fresh=http.filter(x=>x.path.startsWith('/guilds/')),stable=inputs.every(p=>hash(fs.readFileSync(p.path))===p.sha256),receipt={at:new Date().toISOString(),phase,bundleSHA256:hash(bundle),compiledInputs:inputs,stable,http,runs,ok:stable&&http.length===3&&fresh.length===0&&runs.every(r=>r.status===200&&r.result.ok),checks:runs.reduce((n,r)=>n+(r.result.checks??0),0)};
 fs.writeFileSync(path.join(out,'soft-limiter280-'+phase+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({phase,ok:receipt.ok,checks:receipt.checks,stable,providerRequests:http.length}));if(!receipt.ok)process.exitCode=1;
})().catch(e=>{fs.writeFileSync(path.join(out,'soft-limiter280-'+phase+'.error.json'),JSON.stringify({error:String(e.stack),bundleSHA256:hash(bundle)},null,2));console.error(e.stack);process.exitCode=1;});

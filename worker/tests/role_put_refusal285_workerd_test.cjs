'use strict';
// Bounded actual REST/native Response -> private witness -> real local D1 plan.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const {build}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const argv=process.argv.slice(2),at=argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(argv[at+1]),root=path.join(__dirname,'..');if(fs.existsSync(out))throw Error('fresh output required');fs.mkdirSync(out,{recursive:true});
const H=b=>crypto.createHash('sha256').update(b).digest('hex'),driverHash=H(fs.readFileSync(__filename)),checks=[],wire=[],loaded=[];
const kinds=['403','404','429','429-later','forged','lost','aborted','short-body','status-only','extra-body','bad429-header','bad429-body','bad429-scope','server500','source-race403','generation-race403','source-race429','generation-race429','cooldown-malformed','tuple-race','wrong-env','wrong-path','wrong-callback','copy-error','copy-cap','delete-isolated','legacy-attempt0','async-callback','bad-code403'];
const check=(name,ok,observed)=>{checks.push({name,pass:!!ok,observed});console.log((ok?'PASS ':'FAIL ')+name);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
(async()=>{let mf,runtime;try{
 const entry='put-refusal285-entry.mjs',built=await build({stdin:{contents:'export {default} from '+JSON.stringify(path.join(__dirname,'role_put_refusal285_workerd_fixture.mjs'))+';',sourcefile:entry,resolveDir:root},bundle:true,write:false,metafile:true,format:'esm',platform:'browser',target:'es2022',absWorkingDir:root,tsconfig:path.join(root,'tsconfig.json'),external:['node:async_hooks'],logLevel:'silent',plugins:[{name:'actual-input-byte-custody',setup(b){b.onLoad({filter:/\.(ts|mjs)$/},args=>{const contents=fs.readFileSync(args.path);loaded.push({path:args.path,sha256:H(contents)});return {contents,loader:args.path.endsWith('.ts')?'ts':'js',resolveDir:path.dirname(args.path)};});}}]});
 const bundle=Buffer.from(built.outputFiles[0].contents);fs.writeFileSync(path.join(out,'bundle.mjs'),bundle);fs.writeFileSync(path.join(out,'INPUTS.json'),JSON.stringify({driverHash,loaded},null,2));
 runtime=fs.mkdtempSync(path.join(os.tmpdir(),'put285-'));mf=new Miniflare(convertV4MiniflareOptions({rootPath:runtime,script:bundle.toString(),modules:true,name:'put-refusal285',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(runtime,'t'),resourcePersistencePath:path.join(runtime,'p'),isolatedResourcePersistencePath:path.join(runtime,'i'),d1Databases:Object.fromEntries(kinds.map(k=>['DB_'+k.replaceAll('-','_'),'put285-'+k])),outboundService:async request=>{
  const kind=request.headers.get('authorization')?.replace(/^Bot synthetic-put285-/,''),u=new URL(request.url);if(!kinds.includes(kind)||u.origin!=='https://discord.com'||!['PUT','DELETE'].includes(request.method))throw Error('unexpected external request');
  const item={kind,method:request.method,reply:null};wire.push(item);
  if(kind.startsWith('source-race')||kind.startsWith('generation-race')){const r=await mf.dispatchFetch('http://fixture.invalid/mutate/'+kind,{method:'POST'});if(r.status!==200)throw Error('fixture mutation failed');}
  if(kind==='lost'){item.reply='lost';throw Error('synthetic original response lost');}
  const limited=kind.includes('429')||kind==='cooldown-malformed',status=kind==='404'?404:kind==='server500'?500:limited?429:403;
  let body=limited?{message:'Rate limited',retry_after:60,global:true}:status===404?{message:'Unknown Member',code:10007}:{message:'Missing Permissions',code:50013};
  const headers={'Content-Type':'application/json'};
  if(kind==='status-only')body={code:50013};if(kind==='extra-body')body.errors={unknown:true};if(kind==='bad-code403')body.code=10004;
  if(kind==='bad429-header')headers['Retry-After']='tomorrow';if(kind==='bad429-body')body.retry_after='60';if(kind==='bad429-scope')headers['X-RateLimit-Scope']='unsupported';
  const text=JSON.stringify(body);if(kind==='short-body')headers['Content-Length']=String(new TextEncoder().encode(text).length+10);item.reply=status;
  if(kind==='aborted')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"message":"Missing'));c.error(Error('synthetic body cut short'));}}),{status,headers});
  return new Response(text,{status,headers});
 }}));await mf.ready;
 for(const kind of kinds){const response=await mf.dispatchFetch('http://fixture.invalid/'+kind,{method:'POST'}),raw=await response.text();fs.writeFileSync(path.join(out,kind+'.json'),raw);let r;try{r=JSON.parse(raw);}catch{check(kind+' fixture completed',false,{status:response.status});continue;}
  check(kind+' actual Workerd/D1 response',response.status===200&&r.actualLocalWorkerdD1===true&&r.nativeIssuer===false);
  const row=r.rows.find(x=>x.id==='a'.repeat(32)),old=r.before.find(x=>x.id==='b'.repeat(32)),history=r.rows.find(x=>x.id===old.id),calls=wire.filter(x=>x.kind===kind);
  check(kind+' original old receipt is byte-identical',same(old,history));
  check(kind+' does not retry the original PUT',(kind==='async-callback'?calls.length<=1:calls.length===(kind==='forged'?0:1))&&r.callbacks===(kind==='forged'?0:1),{physicalRequests:calls.length,callbacks:r.callbacks});
  if(kind==='403')check('all stored reason negative cases executed',r.negativeSql285?.length===9);
  if(kind==='403')for(const n of r.negativeSql285??[])check('strict stored refusal rejects '+n.kind+' while retaining data-reader semantics',n.matched===0&&n.reader===n.readerExpected);
  if(['403','404','429','429-later'].includes(kind)){
   check(kind+' complete original refusal becomes one exact held row',r.bodyCap&&r.refusalKnown&&r.batch?.[0].changes===1&&same(row,r.expected)&&r.known.length===1&&r.known[0].id===row.id);
   check(kind+' refusal is not an ownership ACK and cannot be consumed twice',row.state==='held'&&row.attempts===1&&row.claim_nonce==='c'.repeat(32)&&!row.reason.includes('acknowledged')&&r.consumedAgain&&r.changedSourceReplay);
   if(kind.includes('429')){const value=JSON.parse(r.cooldown.value);check(kind+' records managed cooldown atomically without shortening it',r.batch[1].changes===1&&value.due>=r.facts.due&&(kind!=='429-later'||value.due>=row.created_at+1000));}
   else check(kind+' permission/missing-member refusal has no cooldown row',r.cooldown===null&&r.batch[1].rows.length===0);
  }else if(kind.startsWith('source-race')||kind.startsWith('generation-race')||kind==='tuple-race'||kind==='cooldown-malformed'){
   check(kind+' changed source/G/tuple/service prevents both persistence writes',r.refusalKnown&&r.batch?.[0].changes===0&&r.batch[1].changes===0&&r.known.length===0&&row.state==='dispatching');
   check(kind+' conclusive reply cannot override original fences',kind==='cooldown-malformed'?r.cooldown?.value==='bad':r.cooldown===null);
  }else{
   check(kind+' unsupported or forged evidence remains unclassified',!r.refusalKnown&&r.known.length===0&&row.state==='dispatching'&&r.cooldown===null&&r.batch===null);
   if(kind==='delete-isolated')check('DELETE280 remains a distinct original method witness',r.deleteUntouched===true&&!r.bodyCap);
  }
 }
 const stable=driverHash===H(fs.readFileSync(__filename))&&loaded.every(x=>x.sha256===H(fs.readFileSync(x.path)));check('actual loaded source and driver byte custody',stable);
 const receipt={schema:'put-refusal285-workerd-v1',at:new Date().toISOString(),ok:checks.every(x=>x.pass),checksCount:checks.length,checks,loaded,driverHash,bundleSHA256:H(bundle),sourceStable:stable,runtime,scope:'Actual REST/native Response/private PUT witness and atomic local D1 plan. Synthetic source rows only; central Native writer is tested separately. No live HTTP or ownership ACK.'};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({checks:checks.length,ok:receipt.ok,bundleSHA256:receipt.bundleSHA256}));if(!receipt.ok)process.exitCode=1;
 }catch(error){fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:String(error.stack),runtime,wire,loaded},null,2));console.error(error.stack);process.exitCode=1;}finally{if(mf)await mf.dispose();}})();

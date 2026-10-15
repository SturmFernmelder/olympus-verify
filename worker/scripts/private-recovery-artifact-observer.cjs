'use strict';
// In-memory observation of the pinned original Wrangler CLI. It never reads authentication headers/files.
// The parent owns the original attempt/deadline; this component cannot make a replay or reopen capability.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),{Transform}=require('node:stream');
const fail=()=>{throw Error('PRIVATE_RECOVERY_ARTIFACT_HELD');},sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const inputPath=process.env.OLYMPUS_RECOVERY_ARTIFACT_INPUT,inputHash=process.env.OLYMPUS_RECOVERY_ARTIFACT_INPUT_SHA256,root=process.env.OLYMPUS_RECOVERY_ARTIFACT_OUTPUT;
if(!inputPath||!root||!path.isAbsolute(inputPath)||!path.isAbsolute(root)||!/^[0-9a-f]{64}$/.test(inputHash??''))fail();
function read(file,max){const fd=fs.openSync(file,'r');try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>max||fs.lstatSync(file).isSymbolicLink())fail();const raw=Buffer.alloc(s.size+1),n=fs.readSync(fd,raw,0,raw.length,0);if(n!==s.size)fail();return raw.subarray(0,n);}finally{fs.closeSync(fd);}}
const raw=read(inputPath,16384);if(sha(raw)!==inputHash)fail();const p=JSON.parse(raw),spend=JSON.parse(read(path.join(root,'spend.json'),16384));
const cli=path.resolve(__dirname,'../node_modules/wrangler/wrangler-dist/cli.js'),original=read(cli,16000000);
if(path.resolve(process.argv[1]??'')!==cli||original.length!==14551141||sha(original)!=='e080023d5f709ece8f5b8838280f24cd54b896e635fb314b9a1a3079ef01f2a1'||spend.inputSHA256!==inputHash||spend.operationId!==p.operationId||spend.createdAt!==p.originalCreatedAt||spend.expiresAt!==p.originalExpiresAt||spend.state!=='spent_before_original_cli'||spend.expiresAt!==spend.createdAt+300)fail();
if(process.env.WRANGLER_WRITE_LOGS!=='false'||process.env.WRANGLER_LOG!=='error'||process.env.WRANGLER_SEND_METRICS!=='false')fail();
const now=Date.now.bind(Date),resource=`/accounts/${p.accountId}/d1/database/${p.databaseId}`,output=path.join(root,'original-export.sql');
let previous=spend.createdAt*1000,pending=null,bookmark=null,downloadURL=null,download=null,downloadStarted=false,finished=false,apiAttempts=0,apiResponses=0,importETag=null,importUploaded=false,uploadObservation=null,originalBookmarkLookupEOF=false;
function current(){const t=now();if(!Number.isSafeInteger(t)||t<previous||t<spend.createdAt*1000||t>=spend.expiresAt*1000)fail();previous=t;}
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==keys.slice().sort().join('|'))fail();}
function clean(v,n=256){if(typeof v!=='string'||!v.length||v.length>n||/[^A-Za-z0-9_.-]/.test(v))fail();return v;}
function durable(file,value){const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function beforeAPI(url,method,body,base){
 current();if(base!=='https://api.cloudflare.com/client/v4'||pending)fail();
 const lookup=p.kind==='time_travel'?resource+'/time_travel/bookmark?'+new URLSearchParams({timestamp:new Date(p.bookmark*1000).toISOString()}).toString():null;
 if(lookup!==null&&url===lookup){if(method!=='GET'||body!==undefined||bookmark!==null||++apiAttempts>256)fail();pending={url,requestSHA256:sha(Buffer.from(lookup)),action:'bookmark'};return;}
 const expected=p.kind==='export'?resource+'/export':p.kind==='private_export'?resource+'/import':resource+'/time_travel/restore?bookmark='+encodeURIComponent(bookmark??'');
 if(url!==expected){if(method!=='GET'||typeof url!=='string'||!url.startsWith('/'))fail();return;}
 if(method!=='POST'||++apiAttempts>256||finished)fail();
 if(p.kind==='time_travel'){if(body!==undefined||bookmark===null||!originalBookmarkLookupEOF)fail();pending={url,requestSHA256:sha(Buffer.from('')),action:'restore'};return;}
 if(typeof body!=='string'||Buffer.byteLength(body)>8192)fail();const b=JSON.parse(body);
 if(p.kind==='export'){
  exact(b,bookmark===null?['output_format','dump_options']:['output_format','dump_options','current_bookmark']);exact(b.dump_options,['no_schema','no_data','tables']);
  if(b.output_format!=='polling'||b.dump_options.no_schema!==false||b.dump_options.no_data!==false||!Array.isArray(b.dump_options.tables)||b.dump_options.tables.length||bookmark!==null&&b.current_bookmark!==bookmark)fail();
 }else{
  if(b.action==='init'){exact(b,['action','etag']);if(importETag!==null||!/^[0-9a-f]{32}$/.test(b.etag))fail();importETag=b.etag;}
  else if(b.action==='ingest'){exact(b,['action','filename','etag']);if(!importUploaded||b.etag!==importETag||typeof b.filename!=='string'||b.filename!==downloadURL?.filename)fail();}
  else if(b.action==='poll'){exact(b,['action','current_bookmark']);if(!bookmark||b.current_bookmark!==bookmark)fail();}
  else fail();
 }
 pending={url,requestSHA256:sha(Buffer.from(body)),action:p.kind==='export'?'export':b.action};current();
}
async function afterAPI(url,status,text){
 if(!pending||pending.url!==url)return;current();if(status!==200||typeof text!=='string'||Buffer.byteLength(text)>2097152)fail();const e=JSON.parse(text),r=e.result;
 if(e.success!==true||!r||typeof r!=='object')fail();apiResponses++;
 if(p.kind==='time_travel'&&pending.action==='bookmark'){
  bookmark=clean(r.bookmark);originalBookmarkLookupEOF=true;
 }else if(p.kind==='time_travel'){
  const finalBookmark=clean(r.bookmark),previousBookmark=clean(r.previous_bookmark);
  finish({requestedBookmark:bookmark,originalSnapshotTimestamp:p.bookmark,originalBookmarkLookupEOF,providerBookmark:finalBookmark,previousBookmark,originalRequestSHA256:pending.requestSHA256,originalAPIResponseEOF:true});
 }else if(p.kind==='export'){
  if(r.success!==true||r.type!=='export')fail();const at=clean(r.at_bookmark);if(bookmark!==null&&bookmark!==at)fail();bookmark=at;
  if(r.status==='complete'){const u=new URL(r.result?.signed_url);if(u.protocol!=='https:'||u.username||u.password||u.port)fail();downloadURL={url:u.href,filename:clean(r.result?.filename)};}
  else if(!['active','queued','pending'].includes(r.status))fail();
 }else{
  if(pending.action==='init'&&typeof r.upload_url==='string'){
   const u=new URL(r.upload_url);if(u.protocol!=='https:'||u.username||u.password||u.port)fail();downloadURL={url:u.href,filename:clean(r.filename)};
  }else{
   if(r.success!==true||typeof r.status!=='string'||!['active','queued','pending','complete'].includes(r.status))fail();bookmark=clean(r.at_bookmark);
   if(r.status==='complete'){
    if(!r.result||!Number.isSafeInteger(r.result.num_queries)||r.result.num_queries<1||!importUploaded)fail();
    finish({providerBookmark:clean(r.result.final_bookmark),importBookmark:bookmark,originalRequestSHA256:pending.requestSHA256,originalAPIResponseEOF:true,originalUploadBytesObserved:importUploaded,originalImportETag:importETag,originalQueryCount:r.result.num_queries});
   }
  }
 }
 pending=null;current();
}
function beginDownload(url,response){
 current();if(p.kind!=='export'||downloadStarted||!downloadURL||url!==downloadURL.url||!response||response.status!==200||!response.body)fail();downloadStarted=true;downloadURL=null;
 const clone=response.clone();download=(async()=>{const reader=clone.body.getReader(),hash=crypto.createHash('sha256');let n=0;try{for(;;){current();const r=await reader.read();current();if(r.done)break;if(!(r.value instanceof Uint8Array)||n+r.value.byteLength>p.maximumBytes)fail();n+=r.value.byteLength;hash.update(r.value);}if(!n)fail();return{bytes:n,sha256:hash.digest('hex')};}finally{reader.releaseLock();}})();void download.catch(()=>undefined);return download;
}
function beforeUpload(url,file,size){current();if(p.kind!=='private_export'||!downloadURL||url!==downloadURL.url||path.resolve(file)!==p.artifact.path||size!==p.artifact.bytes)fail();const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size!==p.artifact.bytes)fail();}
function originalUploadStream(stream){
 current();if(p.kind!=='private_export'||uploadObservation!==null||!stream||typeof stream.pipe!=='function')fail();
 const hash=crypto.createHash('sha256'),md5=crypto.createHash('md5');let bytes=0;uploadObservation={complete:false};
 const observer=new Transform({transform(chunk,encoding,done){try{current();if(!Buffer.isBuffer(chunk)||bytes+chunk.length>p.artifact.bytes)fail();bytes+=chunk.length;hash.update(chunk);md5.update(chunk);done(null,chunk);}catch{done(Error('PRIVATE_ORIGINAL_UPLOAD_UNKNOWN'));}},flush(done){try{current();const digest=hash.digest('hex'),etag=md5.digest('hex');if(bytes!==p.artifact.bytes||digest!==p.artifact.sha256||etag!==importETag)fail();uploadObservation={complete:true,bytes,sha256:digest,etag};done();}catch{done(Error('PRIVATE_ORIGINAL_UPLOAD_UNKNOWN'));}}});
 stream.once('error',()=>observer.destroy(Error('PRIVATE_ORIGINAL_UPLOAD_UNKNOWN')));observer.once('error',()=>stream.destroy());return stream.pipe(observer);
}
function afterUpload(response){current();if(p.kind!=='private_export'||!response||response.status!==200||response.headers.get('etag')?.replace(/^"|"$/g,'')!==importETag||uploadObservation?.complete!==true||uploadObservation.sha256!==p.artifact.sha256||uploadObservation.bytes!==p.artifact.bytes)fail();importUploaded=true;}
async function finishOutput(file){
 current();if(p.kind!=='export'||finished||path.resolve(file)!==output||!download)fail();const d=await download;current();
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==d.bytes)fail();const hash=crypto.createHash('sha256');let bytes=0;
 for await(const chunk of fs.createReadStream(file)){current();bytes+=chunk.byteLength;if(bytes>p.maximumBytes)fail();hash.update(chunk);}current();if(bytes!==d.bytes||hash.digest('hex')!==d.sha256)fail();
 const fd=fs.openSync(file,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}finish({providerBookmark:bookmark,exportBytes:bytes,exportSHA256:d.sha256,originalAPIResponseEOF:true,originalDownloadCloneEOF:true,actualOutputBytesMatch:true});
}
function finish(fields){current();if(finished||!apiAttempts||apiResponses!==apiAttempts)fail();durable(path.join(root,'original-artifact-attempt.json'),{schema:'original-private-recovery-artifact-attempt-v1',kind:p.kind,operationId:p.operationId,accountId:p.accountId,databaseId:p.databaseId,createdAt:spend.createdAt,expiresAt:spend.expiresAt,observedAtMilliseconds:previous,apiAttempts,apiResponses,...fields,providerRequestObserved:true,signedURLPersisted:false,authHeadersObserved:false,physicalReplayQualified:false,readyToReopen:false});finished=true;}
const hooks=Object.freeze({beforeAPI,afterAPI,beginDownload,beforeUpload,originalUploadStream,afterUpload,finishOutput});
const patches=[
 ['  logger7.debug("-- END CF API REQUEST");\n  return await (0, import_undici.fetch)(', '  logger7.debug("-- END CF API REQUEST");\n  globalThis[Symbol.for("olympus.private.artifact.original.v1")].beforeAPI(resource, method, init4.body, getCloudflareApiBaseUrl(complianceConfig));\n  return await (0, import_undici.fetch)('],
 ['  const jsonText = await response.text();\n  logger7.debug(', '  const jsonText = await response.text();\n  await globalThis[Symbol.for("olympus.private.artifact.original.v1")].afterAPI(resource, response.status, jsonText);\n  logger7.debug('],
 ['`You can also download your export from the following URL manually. This link will be valid for one hour: ${finalResponse.result.signed_url}`','`Private export URL remains in original process memory.`'],
 ['      await fs$1__namespace.default.writeFile(output, contents.body || "");','      const originalClone = globalThis[Symbol.for("olympus.private.artifact.original.v1")].beginDownload(finalResponse.result.signed_url, contents);\n      await fs$1__namespace.default.writeFile(output, contents.body || "", { flag: "wx" });\n      await originalClone;\n      await globalThis[Symbol.for("olympus.private.artifact.original.v1")].finishOutput(output);'],
 ['  const uploadResponse = await spinnerWhile({\n    promise: (0, import_undici22.fetch)(upload_url, {','  globalThis[Symbol.for("olympus.private.artifact.original.v1")].beforeUpload(upload_url, file3, size);\n  const uploadResponse = await spinnerWhile({\n    promise: (0, import_undici22.fetch)(upload_url, {'],
 ['  const etagResponse = uploadResponse.headers.get("etag");','  globalThis[Symbol.for("olympus.private.artifact.original.v1")].afterUpload(uploadResponse);\n  const etagResponse = uploadResponse.headers.get("etag");']
 ,['      body: fs13.createReadStream(file3),','      body: globalThis[Symbol.for("olympus.private.artifact.original.v1")].originalUploadStream(fs13.createReadStream(file3)),']
];
let source=original.toString('utf8');for(const [before,after]of patches){if(source.split(before).length!==2)fail();source=source.replace(before,after);}
Object.defineProperty(globalThis,Symbol.for('olympus.private.artifact.original.v1'),{value:hooks});
const extension=Module._extensions['.js'];let compiled=false;Module._extensions['.js']=function(module,file){if(path.resolve(file)!==cli)return Reflect.apply(extension,this,[module,file]);if(compiled)fail();compiled=true;Module._extensions['.js']=extension;module._compile(source,file);};
process.on('exit',code=>{if(!finished){try{durable(path.join(root,'original-attempt-unknown.json'),{schema:'original-private-recovery-artifact-unknown-v1',operationId:p.operationId,exitCode:code,apiAttempts,apiResponses,automaticRetry:false});}catch{}}});

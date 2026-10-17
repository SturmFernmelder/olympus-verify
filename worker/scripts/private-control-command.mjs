/** Owner-only transport for the existing private HMAC protocol. Default invocation validates without dispatch. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';

const commands=new Set(['initialize-closed','close','status','observe-cut','prepare-install','install-and-reopen','install-and-reopen-artifact','reopen']);
const target='https://olympus-verify.roach-council.workers.dev';
const args=process.argv.slice(2),execute=args.includes('--execute-original-once'),inputAt=args.indexOf('--input');
if(inputAt<0||args.filter(x=>x==='--input').length!==1||!args[inputAt+1]||args.some((x,i)=>i!==inputAt&&i!==inputAt+1&&x!=='--execute-original-once'))throw Error('usage: node scripts/private-control-command.mjs --input <absolute-original-command.json> [--execute-original-once]');
const filename=args[inputAt+1];if(!path.isAbsolute(filename))throw Error('absolute_input_required');
const inputFd=fs.openSync(filename,'r');let bytes;
try{const stat=fs.fstatSync(inputFd);if(!stat.isFile()||stat.size>16384)throw Error('bounded_input_required');const buffer=Buffer.alloc(16385);let length=0;for(;;){const n=fs.readSync(inputFd,buffer,length,buffer.length-length,null);length+=n;if(n===0||length===buffer.length)break;}if(length>16384||length!==stat.size||fs.fstatSync(inputFd).size!==stat.size)throw Error('bounded_input_required');bytes=buffer.subarray(0,length);}finally{fs.closeSync(inputFd);}
let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('invalid_original_private_input');}
const keys=(value,list)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...list].sort().join('|');
const hex=(value,length)=>typeof value==='string'&&value.length===length&&!/[^0-9a-f]/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
if(!keys(input,['command','controlSourceTree','controlMetadata','original'])||!commands.has(input.command)||!hex(input.controlSourceTree,40)||!keys(input.controlMetadata,['id','tag','timestamp'])||!uuid(input.controlMetadata.id)||typeof input.controlMetadata.tag!=='string'||input.controlMetadata.tag.length>1024||typeof input.controlMetadata.timestamp!=='string'||input.controlMetadata.timestamp.length>128)throw Error('exact_original_private_input_required');
const initialize=input.command==='initialize-closed';
const fields=initialize?['operationId','nonce','requestDigest','createdAt','expiresAt','credentialEpoch','writeEpoch','sourceTree','deploymentVersion','nextWriteEpoch']:['operationId','nonce','createdAt','expiresAt','nextWriteEpoch','controlVersion','servingVersion','sourceTree','credentialEpoch','writeEpoch'],o=input.original;
if(!keys(o,fields)||!hex(o.operationId,32)||!hex(o.nonce,32)||!Number.isSafeInteger(o.createdAt)||o.createdAt<=0||o.createdAt>253402300499||o.expiresAt!==o.createdAt+300||!hex(o.nextWriteEpoch,32)||(initialize?!hex(o.requestDigest,64)||!uuid(o.deploymentVersion):!uuid(o.controlVersion)||o.controlVersion!==input.controlMetadata.id||!uuid(o.servingVersion))||!hex(o.sourceTree,40)||!hex(o.credentialEpoch,32)||!hex(o.writeEpoch,32)||new Set([o.nextWriteEpoch,o.credentialEpoch,o.writeEpoch]).size!==3)throw Error('exact_original_private_command_required');
const raw=JSON.stringify(Object.fromEntries(fields.map(key=>[key,o[key]]))),route='/v1/control/'+input.command;
if(Buffer.byteLength(raw)>8192)throw Error('bounded_command_required');
const digest=createHash('sha256').update(bytes).digest('hex');
if(!execute){console.log(JSON.stringify({scope:'private-control-preparation-only',inputSHA256:digest,command:input.command,operationId:o.operationId,originalCreatedAt:o.createdAt,originalExpiresAt:o.expiresAt,providerDispatch:false}));process.exit(0);}
if(Date.now()<o.createdAt*1000||Date.now()>=o.expiresAt*1000)throw Error('original_deadline_held');
const auth=process.env.OLYMPUS_PRIVATE_CONTROL_AUTH_SECRET;if(typeof auth!=='string'||auth.length<32||auth.length>4096||/[^\x21-\x7e]/.test(auth))throw Error('explicit_private_control_secret_required');
const mac=createHmac('sha256',auth).update(JSON.stringify([initialize?'olympus-private-production-initialization-v1':'olympus-private-production-control-original-v1','POST',route,input.controlSourceTree,JSON.stringify([input.controlMetadata.id,input.controlMetadata.tag,input.controlMetadata.timestamp]),raw])).digest('hex');
// A lost reply stays attempted in this directory. The actual operator/DO original ID is authoritative
// across input directories, processes and machines; this local file never grants or reconstructs authority.
const journal=path.join(path.dirname(filename),'private-control-'+o.operationId+'-'+input.command+'.attempt.json');
const fd=fs.openSync(journal,'wx',0o600);
try{fs.writeSync(fd,JSON.stringify({scope:'original-private-control-command-dispatched',inputSHA256:digest,operationId:o.operationId,command:input.command,createdAt:o.createdAt,expiresAt:o.expiresAt,automaticRetry:false})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),Math.max(1,o.expiresAt*1000-Date.now()));
let complete=false;
try{
 const response=await fetch(target+'/private-production-control/'+input.command,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':mac},body:raw,signal:abort.signal});
 const reader=response.body?.getReader();if(!reader)throw Error('original_response_body_missing');
 const parts=[];let length=0,eof=false;
 try{for(;;){const packet=await reader.read();if(packet.done){eof=true;break;}length+=packet.value.byteLength;if(length>32768)throw Error('original_response_limit');parts.push(packet.value);}}finally{if(!eof)await reader.cancel('original_control_response_unknown');reader.releaseLock();}
 const joined=Buffer.concat(parts.map(value=>Buffer.from(value))),receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||!(typeof receipt.scope==='string'&&(/^private_/.test(receipt.scope)||['source_original_native_closed_initialization','same_original_outcome_unknown','original_entry_refused'].includes(receipt.scope))||receipt.error==='private_initialization_held'))throw Error('original_response_shape_held');
 complete=response.status===200;
 const result={scope:'original-private-control-command-result',inputSHA256:digest,operationId:o.operationId,command:input.command,status:response.status,originalCreatedAt:o.createdAt,originalExpiresAt:o.expiresAt,responseSHA256:createHash('sha256').update(joined).digest('hex'),receipt,complete,automaticRetry:false};
 const output=journal.replace(/\.attempt\.json$/,'.result.json'),out=fs.openSync(output,'wx',0o600);try{fs.writeSync(out,JSON.stringify(result,null,2)+'\n');fs.fsyncSync(out);}finally{fs.closeSync(out);}
 console.log(JSON.stringify(result));
 if(!complete)process.exitCode=1;
}catch{console.error(JSON.stringify({error:'original_private_control_outcome_unknown',operationId:o.operationId,command:input.command,automaticRetry:false,attemptJournal:journal}));process.exitCode=1;}
finally{clearTimeout(timer);}

#!/usr/bin/env node
// .162 guarded recovery successor owner signer. Validate-only by default; it never retries and never prints a secret.
//   node scripts/private-successor-command.mjs --prepare <protected-out.json>          fresh attemptId/nonce/E2/C2 (crypto RNG)
//   node scripts/private-successor-command.mjs --validate <template.json> <census|recover|observe>
//   node scripts/private-successor-command.mjs --execute-once <template.json> <census|recover|observe>
// The owner command root comes only from OLYMPUS_SUCCESSOR_OWNER_SECRET. --execute-once stamps createdAt=now and
// expiresAt=createdAt+300, validates, signs and POSTs exactly once to <botOrigin>/private-production-control/<status|reopen|observe-cut>.
// A non-200 reply, timeout or disconnect is that attempt's own unknown: wait past expiresAt, then census/observe only.
import fs from 'node:fs';import path from 'node:path';import {createHmac,createHash,randomBytes} from 'node:crypto';import {pathToFileURL} from 'node:url';
const DOMAIN='olympus-private-successor-control-v1',ROUTES={census:['status','/v1/control/status'],recover:['reopen','/v1/control/reopen'],observe:['observe-cut','/v1/control/observe-cut']};
const hex=(x,n)=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
class Refused extends Error{}
const fail=m=>{throw new Refused('refusing: '+m);};
function readJSON(file){if(!file||!path.isAbsolute(file))fail('an absolute template path is required');const raw=fs.readFileSync(file);if(raw.length>32768)fail('template is too large');let v;try{v=JSON.parse(raw.toString('utf8'));}catch{fail('template is not JSON');}return v;}
function keys(v,list,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...list].sort().join('|'))fail(label+' must have exactly: '+list.join(','));}
const COMMON=['botOrigin','controlTree','controlMetadata','command'];
const BODY={census:[],observe:['attemptId','recoverRequestDigest'],recover:['attemptId','nonce','sourceWriteEpoch','sourceMode','targetWriteEpoch','targetCredentialEpoch','burnedEpochs','servingTree','servingVersion','layout','expectedFloor','expectedGate','expectedCensusDigest','nativeWatermark','controlVersion']};
export function build(template,kind,now,nonce=()=>randomBytes(16).toString('hex')){
 if(!ROUTES[kind])fail('command must be census, recover or observe');keys(template,COMMON,'template');
 const u=new URL(template.botOrigin);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||template.botOrigin!==u.origin)fail('botOrigin must be an https origin');
 if(!hex(template.controlTree,40))fail('controlTree must be the successor source tree');keys(template.controlMetadata,['id','tag','timestamp'],'controlMetadata');if(!uuid(template.controlMetadata.id)||typeof template.controlMetadata.tag!=='string'||typeof template.controlMetadata.timestamp!=='string')fail('controlMetadata must be the read-back successor version metadata');
 const c=template.command;keys(c,BODY[kind],'command');const createdAt=Math.floor(now/1000),body={...c,nonce:kind==='recover'?c.nonce:nonce(),createdAt,expiresAt:createdAt+300};
 if(kind==='observe'&&(!hex(c.attemptId,32)||!hex(c.recoverRequestDigest,64)))fail('observe needs attemptId and recoverRequestDigest');
 if(kind==='recover'){
  if(!hex(c.attemptId,32)||!hex(c.nonce,32)||c.attemptId===c.nonce||!hex(c.sourceWriteEpoch,32)||!['serving','closed'].includes(c.sourceMode)||!hex(c.targetWriteEpoch,32)||!hex(c.targetCredentialEpoch,32)||new Set([c.sourceWriteEpoch,c.targetWriteEpoch,c.targetCredentialEpoch]).size!==3)fail('recover identity/epochs');
  if(!Array.isArray(c.burnedEpochs)||c.burnedEpochs.length<1||c.burnedEpochs.length>4||c.burnedEpochs.some(b=>!Array.isArray(b)||b.length!==2||!['credential','write'].includes(b[0])||!hex(b[1],32)||b[1]===c.targetWriteEpoch||b[1]===c.targetCredentialEpoch))fail('burnedEpochs');
  if(!hex(c.servingTree,40)||!uuid(c.servingVersion)||!['canonical','recorded-live-20261010'].includes(c.layout)||typeof c.expectedFloor!=='string'||typeof c.expectedGate!=='string'||!hex(c.expectedCensusDigest,64)||!Number.isSafeInteger(c.nativeWatermark)||c.nativeWatermark<0||c.controlVersion!==template.controlMetadata.id)fail('recover target/expected state');
 }
 const raw=JSON.stringify(body);if(Buffer.byteLength(raw)>8192)fail('body exceeds 8192 bytes');
 const metadata=JSON.stringify([template.controlMetadata.id,template.controlMetadata.tag,template.controlMetadata.timestamp]),[suffix,internal]=ROUTES[kind];
 return{raw,metadata,suffix,internal,controlTree:template.controlTree,requestDigest:createHash('sha256').update(JSON.stringify([DOMAIN,template.controlTree,metadata,raw])).digest('hex'),url:template.botOrigin+'/private-production-control/'+suffix};
}
export const ownerMessage=built=>JSON.stringify([DOMAIN,'POST',built.internal,built.controlTree,built.metadata,built.raw]);
async function cli(){
const [flag,a,b]=process.argv.slice(2);
if(flag==='--prepare'){
 if(!a||!path.isAbsolute(a)||fs.existsSync(a))fail('--prepare needs a new absolute protected path');
 const v={attemptId:randomBytes(16).toString('hex'),nonce:randomBytes(16).toString('hex'),targetWriteEpoch:randomBytes(16).toString('hex'),targetCredentialEpoch:randomBytes(16).toString('hex')};
 fs.writeFileSync(a,JSON.stringify(v,null,1)+'\n',{flag:'wx',mode:0o600});console.log('prepared fresh attempt identity and target epochs at '+a+' (values not printed)');process.exit(0);
}
if(flag!=='--validate'&&flag!=='--execute-once')fail('use --prepare, --validate or --execute-once');
const built=build(readJSON(a),b,Date.now());
if(flag==='--validate'){console.log(JSON.stringify({valid:true,command:b,route:built.url,bodyBytes:Buffer.byteLength(built.raw),requestDigest:built.requestDigest}));process.exit(0);}
const secret=process.env.OLYMPUS_SUCCESSOR_OWNER_SECRET;if(typeof secret!=='string'||secret.length<32||secret.length>4096||/[^\x21-\x7e]/.test(secret))fail('OLYMPUS_SUCCESSOR_OWNER_SECRET is required');
const proof=createHmac('sha256',secret).update(ownerMessage(built)).digest('hex');
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),310000);
try{const r=await fetch(built.url,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Control-Proof':proof},body:built.raw,redirect:'manual',signal:controller.signal}),text=await r.text();
 console.log(JSON.stringify({status:r.status,requestDigest:built.requestDigest,reply:text.length>262144?'[reply over 256 KiB not printed]':text}));process.exit(r.status===200?0:2);}
catch(error){console.log(JSON.stringify({status:'unknown',requestDigest:built.requestDigest,reason:String(error&&error.name||'error')}));process.exit(3);}
finally{clearTimeout(timer);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)cli().catch(error=>{console.error(error instanceof Refused?error.message:'refusing: unexpected '+String(error&&error.name));process.exit(1);});

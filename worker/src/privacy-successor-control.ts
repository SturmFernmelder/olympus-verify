/** .162 guarded recovery successor control. Reached only through main's unchanged private-control adapter, by
 * re-pointing main's PRIVACY_PRODUCTION_CONTROL binding: status -> census, reopen -> recover, observe-cut -> observe.
 * Default OFF. It holds only the two successor roots and refuses when any base operator, initializer, serving or
 * original control root is bound, so it can never call a base Floor, gate or suppression route.
 * recover runs ONE single-use chain: S0 Native precheck, S1 DO reserve (acknowledged before any Native write),
 * S2 Native epoch fence, S3 DO fenced, S4 Native open, S5 DO open. DO RPCs are bounded at 5 s; Native batches by
 * the attempt window only (their SQL window predicates stop a late commit). Any failure after S1 starts is this
 * attempt's own unknown: no retry, no clock renewal, and no later read can mint its acknowledgement. */
import {RECOVERY_FLOOR_NAME,RECOVERY_FLOOR_TARGET} from './privacy-recovery-floor';
import {isPrivacyWriteAdmissionDatabase,type AdmissionLayout} from './privacy-write-admission';
import {SUCCESSOR_FLAGS,SUCCESSOR_FLOOR_ORIGIN,SUCCESSOR_CENSUS_DOMAIN,SUCCESSOR_CENSUS_MAX_BYTES,parseSuccessorRecoverCommand,parseSuccessorCensusCommand,parseSuccessorObserveCommand,
 successorHmac,successorVerify,successorSha256,successorOwnerMessage,successorRequestDigestText,successorFloorMessage} from './privacy-successor-floor';
import {observeSuccessorNative,captureSuccessorNativeFence,executeSuccessorNativeFence,successorNativeFenceFacts,captureSuccessorNativeOpen,executeSuccessorNativeOpen,successorNativeOpenFacts} from './privacy-successor-native';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_RESPONSE_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders,checkOriginalNativeResponse,
 captureOriginalNativeRequestBody,captureOriginalNativeResponseBody,checkOriginalNativeBodyReader,readOriginalNativeBodyPacket,cancelOriginalNativeBodyReader,releaseOriginalNativeBodyReader} from './privacy-native-http-intrinsics';

export type PrivateSuccessorControlEnv={DB:D1Database;CF_VERSION_METADATA:{id:string;tag:string;timestamp:string};
 PRIVACY_SUCCESSOR_CONTROL_ENABLED?:string;PRIVACY_SUCCESSOR_RECOVER_ENABLED?:string;PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET?:string;PRIVACY_RECOVERY_SUCCESSOR_SECRET?:string;
 PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE?:string;PRIVACY_SERVING_DATABASE_ID?:string;PRIVACY_WRITE_ADMISSION_LAYOUT?:AdmissionLayout;PRIVACY_RECOVERY_FLOOR:DurableObjectNamespace};
const URL_ORIGIN='https://privacy-production-control.invalid';
const ROUTES=Object.freeze({'/v1/control/status':'census','/v1/control/reopen':'recover','/v1/control/observe-cut':'observe'} as const);
const REQUIRED=['DB','CF_VERSION_METADATA','PRIVACY_SUCCESSOR_CONTROL_ENABLED','PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET','PRIVACY_RECOVERY_SUCCESSOR_SECRET','PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_RECOVERY_FLOOR'] as const;
const FORBIDDEN=['PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_RECOVERY_INITIALIZER_SECRET','PRIVACY_SERVING_GATE_SECRET','PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET','PRIVACY_PRODUCTION_CONTROL_ENABLED'] as const;
export const SUCCESSOR_STEP_MS=5000,SUCCESSOR_FENCE_MARGIN_SECONDS=120,SUCCESSOR_OPEN_MARGIN_SECONDS=60;
const METHOD=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,URL_GET=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,HEADERS=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,HEADER_GET=ORIGINAL_HEADER_DESCRIPTORS.get!.value,STATUS=ORIGINAL_RESPONSE_DESCRIPTORS.status!.get!;
class SuccessorHeld extends Error{constructor(readonly reason:string){super('successor_held');}}
const held=(reason:string):never=>{throw new SuccessorHeld(reason);};
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
type Slot=Readonly<{ref:object;proto:object|null;key:PropertyKey;value:PropertyDescriptor|undefined}>;
const slot=(ref:object,key:PropertyKey):Slot=>Object.freeze({ref,proto:Object.getPrototypeOf(ref),key,value:Object.getOwnPropertyDescriptor(ref,key)});
function same(s:Slot):void{const d=Object.getOwnPropertyDescriptor(s.ref,s.key),a=s.value;if(Object.getPrototypeOf(s.ref)!==s.proto||(a===undefined?d!==undefined:!d||['value','get','set','writable','enumerable','configurable'].some(k=>d[k as keyof PropertyDescriptor]!==a[k as keyof PropertyDescriptor])))return held('successor_custody_drift');}
function data(o:object,k:PropertyKey):unknown{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return held('successor_binding_required');return d.value;}
function secret(x:unknown):string{if(typeof x!=='string'||x.length<32||x.length>4096||/[^\x21-\x7e]/.test(x))return held('successor_root_required');return x;}
type Origin=Readonly<{request:Request;headers:Headers;route:'census'|'recover'|'observe';path:string;native:D1Database;layout:AdmissionLayout;controlTree:string;metadataTuple:string;ownerSecret:string;floorSecret:string;
 recoverEnabled:boolean;stub:object;stubFetch:Function;proof:string|null;contentType:string|null;contentLength:string|null;capturedMs:number;check:()=>void}>;
/** Native request, header, binding and version custody, captured before any await. */
function capture(request:Request,env:PrivateSuccessorControlEnv):Origin{
 if(!env||typeof env!=='object')return held('successor_entry_required');checkOriginalNativeRequest(request);
 const requestSlots=['method','url','headers','body','text','json','arrayBuffer'].map(k=>slot(request,k));if(requestSlots.some(s=>s.value!==undefined))return held('successor_request_shadow');
 requestSlots.push(...['method','url','headers','body'].map(k=>slot(Request.prototype,k)),slot(Headers.prototype,'get'));
 if(Reflect.apply(METHOD,request,[])!=='POST')return held('successor_post_required');const url=Reflect.apply(URL_GET,request,[]) as string,u=new URL(url),route=ROUTES[u.pathname as keyof typeof ROUTES];
 if(u.origin!==URL_ORIGIN||u.search||u.hash||!route)return held('successor_route_required');
 const envSlots=REQUIRED.map(k=>slot(env,k));if(envSlots.some(s=>!s.value||!Object.hasOwn(s.value,'value')))return held('successor_binding_required');envSlots.push(slot(env,'PRIVACY_SUCCESSOR_RECOVER_ENABLED'),...FORBIDDEN.map(k=>slot(env,k)));
 if(FORBIDDEN.some(k=>k in env)||data(env,'PRIVACY_SUCCESSOR_CONTROL_ENABLED')!=='true')return held('successor_off_or_root_mixed');
 const recover=Object.getOwnPropertyDescriptor(env,'PRIVACY_SUCCESSOR_RECOVER_ENABLED');if(recover&&!Object.hasOwn(recover,'value')||!recover&&'PRIVACY_SUCCESSOR_RECOVER_ENABLED' in env)return held('successor_binding_required');
 const native=data(env,'DB') as D1Database,meta=data(env,'CF_VERSION_METADATA') as object,layout=data(env,'PRIVACY_WRITE_ADMISSION_LAYOUT'),controlTree=data(env,'PRIVACY_SUCCESSOR_CONTROL_SOURCE_TREE');
 if(!native||typeof native!=='object'||isPrivacyWriteAdmissionDatabase(native)||!meta||typeof meta!=='object'||layout!=='canonical'&&layout!=='recorded-live-20261010'||!hex(controlTree,40)||data(env,'PRIVACY_SERVING_DATABASE_ID')!==RECOVERY_FLOOR_TARGET.database)return held('successor_target_required');
 const ownerSecret=secret(data(env,'PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET')),floorSecret=secret(data(env,'PRIVACY_RECOVERY_SUCCESSOR_SECRET'));if(ownerSecret===floorSecret)return held('successor_roots_must_differ');
 const metaSlots=['id','tag','timestamp'].map(k=>slot(meta,k)),id=data(meta,'id'),tag=data(meta,'tag'),timestamp=data(meta,'timestamp');
 if(!uuid(id)||typeof tag!=='string'||tag.length>1024||tag.includes('\0')||typeof timestamp!=='string'||timestamp.length>128||timestamp.includes('\0'))return held('successor_version_required');const metadataTuple=JSON.stringify([id,tag,timestamp]);
 const headers=Reflect.apply(HEADERS,request,[]) as Headers;checkOriginalNativeHeaders(headers);const headerSlots=['get','has','entries'].map(k=>slot(headers,k));if(headerSlots.some(s=>s.value!==undefined))return held('successor_headers_shadow');
 const namespace=data(env,'PRIVACY_RECOVERY_FLOOR') as DurableObjectNamespace;if(!namespace||typeof namespace!=='object')return held('successor_floor_binding_required');
 const stub=namespace.get(namespace.idFromName(RECOVERY_FLOOR_NAME)) as unknown as object;let p:object|null=stub,stubFetch:Function|null=null;const stubSlots:Slot[]=[];
 for(let depth=0;p&&depth<32&&!stubFetch;depth++){const s=slot(p,'fetch');stubSlots.push(s);if(s.value){if(!Object.hasOwn(s.value,'value')||typeof s.value.value!=='function')return held('successor_floor_binding_required');stubFetch=s.value.value;}p=s.proto;}
 if(!stubFetch)return held('successor_floor_binding_required');
 const proof=Reflect.apply(HEADER_GET,headers,['X-Olympus-Control-Proof']) as string|null,contentType=Reflect.apply(HEADER_GET,headers,['Content-Type']) as string|null,contentLength=Reflect.apply(HEADER_GET,headers,['Content-Length']) as string|null;
 const all=[...requestSlots,...envSlots,...metaSlots,...headerSlots,...stubSlots];
 const check=()=>{checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);for(const s of all)same(s);
  if(Reflect.apply(HEADERS,request,[])!==headers||Reflect.apply(URL_GET,request,[])!==url||Reflect.apply(HEADER_GET,headers,['X-Olympus-Control-Proof'])!==proof||Reflect.apply(HEADER_GET,headers,['Content-Type'])!==contentType||Reflect.apply(HEADER_GET,headers,['Content-Length'])!==contentLength)return held('successor_custody_drift');};
 const capturedMs=Date.now();if(!Number.isSafeInteger(capturedMs)||capturedMs<=0)return held('successor_clock_held');
 return Object.freeze({request,headers,route,path:u.pathname,native,layout,controlTree,metadataTuple,ownerSecret,floorSecret,recoverEnabled:!!recover&&recover.value==='true',stub,stubFetch,proof,contentType,contentLength,capturedMs,check});
}
async function within<T>(work:Promise<T>,deadline:number,reason:string):Promise<T>{
 const now=Date.now();if(!Number.isSafeInteger(now)||now>=deadline)return held(reason);let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new SuccessorHeld(reason)),Math.max(1,deadline-now));})]);}finally{if(timer!==undefined)clearTimeout(timer);}
}
/** Bounded native body reader; the deadline is fixed before reading and cleanup cannot renew it. */
async function text(source:Request|Response,kind:'request'|'response',deadline:number,maxBytes:number,check:()=>void):Promise<string>{
 const reader=kind==='request'?captureOriginalNativeRequestBody(source as Request):captureOriginalNativeResponseBody(source as Response);if(!reader)return held('successor_body_held');
 const bytes:number[]=[];let eof=false;
 try{for(;;){check();checkOriginalNativeBodyReader(reader);const packet=await within(readOriginalNativeBodyPacket(reader),deadline,'successor_body_held');check();if(packet.done){eof=true;break;}
  const chunk=packet.value;if(!chunk||bytes.length+chunk.byteLength>maxBytes)return held('successor_body_held');for(let i=0;i<chunk.byteLength;i++)bytes.push(chunk[i]!);}}
 finally{if(eof)releaseOriginalNativeBodyReader(reader);else{void cancelOriginalNativeBodyReader(reader,'successor_body_unknown').then(()=>{try{releaseOriginalNativeBodyReader(reader);}catch{}},()=>{try{releaseOriginalNativeBodyReader(reader);}catch{}});}}
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(new Uint8Array(bytes));
}
async function body(o:Origin):Promise<string>{
 if(o.contentType!=='application/json'||o.contentLength!==null&&(!/^[0-9]{1,5}$/.test(o.contentLength)||Number(o.contentLength)>8192))return held('successor_body_required');
 const raw=await text(o.request,'request',o.capturedMs+SUCCESSOR_STEP_MS,8192,o.check);if(o.contentLength!==null&&new TextEncoder().encode(raw).length!==Number(o.contentLength))return held('successor_body_required');return raw;
}
/** One bounded, MAC-authenticated call to the successor Floor routes. Only a 200 JSON reply is accepted. */
async function floor(o:Origin,path:string,payload:string,expiresAt:number,maxBytes=SUCCESSOR_CENSUS_MAX_BYTES):Promise<Record<string,unknown>>{
 o.check();const deadline=Math.min(Date.now()+SUCCESSOR_STEP_MS,expiresAt*1000),proof=await within(successorHmac(o.floorSecret,successorFloorMessage(path,payload)),deadline,'successor_floor_timeout_unknown');o.check();
 const request=new Request(SUCCESSOR_FLOOR_ORIGIN+path,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Successor-Proof':proof},body:payload});
 const response=await within(Reflect.apply(o.stubFetch,o.stub,[request]) as Promise<Response>,deadline,'successor_floor_timeout_unknown');o.check();checkOriginalNativeResponse(response);
 const status=Reflect.apply(STATUS,response,[]),raw=await text(response,'response',deadline,maxBytes,o.check);let v:unknown;try{v=JSON.parse(raw);}catch{return held('successor_floor_reply_unknown');}
 if(status!==200||!v||typeof v!=='object'||Array.isArray(v))return held(status===409||status===403?'successor_floor_refused':'successor_floor_reply_unknown');return v as Record<string,unknown>;
}
function attemptOf(v:Record<string,unknown>,scope:string):unknown[]{if(v.scope!==scope||typeof v.attempt!=='string')return held('successor_floor_reply_unknown');const a=JSON.parse(v.attempt) as unknown[];if(!Array.isArray(a)||a.length!==29)return held('successor_floor_reply_unknown');return a;}
const reply=(v:unknown,status:number)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const isolateAttempts=new Set<string>();

export async function handlePrivateSuccessorControl(request:Request,env:PrivateSuccessorControlEnv,_ctx:ExecutionContext):Promise<Response>{
 let step='entry',effects=false;const timings:[string,number][]=[],mark=(name:string)=>{step=name;timings.push([name,Date.now()]);};
 try{
  const o=capture(request,env);mark('body');const raw=await body(o);o.check();mark('authenticate');
  const clock=(createdAt:number,expiresAt:number)=>{const now=Date.now();if(now<createdAt*1000||now>=expiresAt*1000)return held('successor_command_clock_held');};
  const authenticate=async(expiresAt:number)=>{if(!await within(successorVerify(o.ownerSecret,successorOwnerMessage(o.path,o.controlTree,o.metadataTuple,raw),o.proof),Math.min(o.capturedMs+SUCCESSOR_STEP_MS,expiresAt*1000),'successor_authentication_held'))return held('successor_authentication_required');o.check();};
  if(o.route==='census'){
   const c=parseSuccessorCensusCommand(raw);clock(c.createdAt,c.expiresAt);await authenticate(c.expiresAt);mark('census');
   const v=await floor(o,'/v2/successor/census','{}',c.expiresAt);if(v.scope!=='private_successor_census'||typeof v.safety!=='string'||typeof v.preserved!=='string'||typeof v.successor!=='string')return held('successor_floor_reply_unknown');
   const censusDigest=await successorSha256(JSON.stringify([SUCCESSOR_CENSUS_DOMAIN,v.safety,v.preserved,v.successor]));mark('native-observation');
   const native=await within(observeSuccessorNative(o.native,o.layout),Math.min(Date.now()+SUCCESSOR_STEP_MS,c.expiresAt*1000),'successor_native_observation_held');o.check();mark('done');
   return reply({scope:'private_successor_census_observation',floor:v.floor,gate:v.gate,safety:v.safety,preserved:v.preserved,successor:v.successor,censusDigest,native,controlVersion:JSON.parse(o.metadataTuple)[0],timings,...SUCCESSOR_FLAGS},200);
  }
  if(o.route==='observe'){
   const c=parseSuccessorObserveCommand(raw);clock(c.createdAt,c.expiresAt);await authenticate(c.expiresAt);mark('observe');
   const v=await floor(o,'/v2/successor/observe',JSON.stringify({attemptId:c.attemptId,requestDigest:c.recoverRequestDigest}),c.expiresAt);const a=attemptOf(v,'private_successor_observation');mark('done');
   return reply({scope:'private_successor_observation',attempt:v.attempt,phase:a[19],floor:v.floor,gate:v.gate,timings,...SUCCESSOR_FLAGS},200);
  }
  if(!o.recoverEnabled)return held('successor_recover_off');
  const c=parseSuccessorRecoverCommand(raw);clock(c.createdAt,c.expiresAt);if(c.controlVersion!==JSON.parse(o.metadataTuple)[0]||c.layout!==o.layout)return held('successor_command_mismatch');await authenticate(c.expiresAt);
  if(isolateAttempts.has(c.attemptId))return held('successor_attempt_spent');isolateAttempts.add(c.attemptId);
  const requestDigest=await successorSha256(successorRequestDigestText(o.controlTree,o.metadataTuple,raw));o.check();const expiresMs=c.expiresAt*1000;
  mark('S0-native-precheck');
  const fence=await within(captureSuccessorNativeFence(o.native,{layout:c.layout,sourceEpoch:c.sourceWriteEpoch,sourceMode:c.sourceMode,targetEpoch:c.targetWriteEpoch,createdAt:c.createdAt,expiresAt:c.expiresAt,watermark:c.nativeWatermark}),Math.min(Date.now()+SUCCESSOR_STEP_MS,expiresMs),'successor_native_precheck_held');o.check();
  mark('S1-reserve');effects=true;
  const reserved=attemptOf(await floor(o,'/v2/successor/reserve',JSON.stringify({command:raw,proof:o.proof,controlTree:o.controlTree,metadata:o.metadataTuple}),c.expiresAt),'private_successor_reserved');
  if(reserved[0]!==c.attemptId||reserved[2]!==requestDigest||reserved[19]!=='reserved'||reserved[12]!==c.targetWriteEpoch||reserved[13]!==c.targetCredentialEpoch)return held('successor_reserve_unconfirmed');
  if(Date.now()>(c.expiresAt-SUCCESSOR_FENCE_MARGIN_SECONDS)*1000)return held('successor_fence_margin_held');
  mark('S2-native-fence');const fenceAck=await within(executeSuccessorNativeFence(fence),expiresMs,'successor_native_fence_unknown');o.check();const ff=successorNativeFenceFacts(fenceAck);
  mark('S3-fenced');
  const fenced=attemptOf(await floor(o,'/v2/successor/fenced',JSON.stringify({attemptId:c.attemptId,requestDigest,fenceAck:{preTuple:ff.preTuple,closedTuple:ff.closedTuple,fencedAt:ff.fencedAt,nativeResultDigest:ff.nativeResultDigest,auditSequence:ff.auditSequence}}),c.expiresAt),'private_successor_fenced');
  if(fenced[0]!==c.attemptId||fenced[19]!=='fenced')return held('successor_fenced_unconfirmed');
  if(Date.now()>(c.expiresAt-SUCCESSOR_OPEN_MARGIN_SECONDS)*1000)return held('successor_open_margin_held');
  mark('S4-native-open');const openCap=await within(captureSuccessorNativeOpen(fenceAck),expiresMs,'successor_native_open_held');o.check();
  const openAck=await within(executeSuccessorNativeOpen(openCap),expiresMs,'successor_native_open_unknown');o.check();const of=successorNativeOpenFacts(openAck);
  mark('S5-open');
  const v=await floor(o,'/v2/successor/open',JSON.stringify({attemptId:c.attemptId,requestDigest,openAck:{servingTuple:of.servingTuple,openedAt:of.openedAt,nativeResultDigest:of.nativeResultDigest}}),c.expiresAt),opened=attemptOf(v,'private_successor_opened');
  const f=typeof v.floor==='string'?JSON.parse(v.floor) as unknown[]:[];if(opened[19]!=='opened'||f[6]!==c.targetCredentialEpoch||f[7]!==c.targetWriteEpoch||f[8]!==c.servingTree||f[9]!==c.servingVersion)return held('successor_open_unconfirmed');
  mark('done');return reply({scope:'private_successor_open_confirmed',attemptId:c.attemptId,requestDigest,floor:v.floor,gate:v.gate,attempt:v.attempt,timings,...SUCCESSOR_FLAGS},200);
 }catch(error){
  const reason=error instanceof SuccessorHeld?error.reason:'successor_outcome_unknown';
  return reply(effects?{scope:'private_successor_unknown_or_held',reason,step,timings,...SUCCESSOR_FLAGS}:{scope:'private_successor_held_before_effects',reason,step,...SUCCESSOR_FLAGS},effects?503:409);
 }
}

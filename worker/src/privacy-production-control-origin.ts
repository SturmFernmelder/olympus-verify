/** Private authenticated control producer. Local close receipts cannot authorize installation or opening.
 * This service is unbound/default OFF. It never exposes native DB methods or consumes a caller drain flag. */
import {RecoveryFloorHeld,RECOVERY_FLOOR_TARGET} from './privacy-recovery-floor';
import {createServingRecoveryGateOperator,readServingRecoveryUnresolved,prepareServingCloseCut,dispatchServingCloseCut,
 type ServingOriginalConfig,type ServingGateEnvironment,type ServingGateOperator} from './privacy-serving-recovery-gate-client';
import {isPrivacyWriteAdmissionDatabase} from './privacy-write-admission';
import {servingGateMac} from './privacy-serving-recovery-gate';
import {SUPPRESSION_PROTOCOL} from './privacy-recovery-suppression';
import type {Env} from './env';
import {observeOriginalAcceptedRecoverySource,assertOriginalAcceptedRecoverySource,originalAcceptedRecoverySourceFacts,observeOriginalAcceptedRecoveryArtifact,originalAcceptedRecoveryArtifactFacts,observeOriginalRestoredArtifactAttempt,originalRestoredArtifactAttemptFacts,type OriginalRestoredArtifactAttempt,type OriginalAcceptedRecoveryArtifact,type OriginalAcceptedRecoverySource} from './privacy-accepted-recovery-source';
import {captureOriginalClosedRecoveryCandidatePage,originalClosedRecoveryCandidatePageFacts,captureOriginalClosedRecoveryRetiredProof,originalClosedRecoveryRetiredProofFacts,confirmOriginalClosedRecoveryRetiredSelection,executeOriginalClosedRecoveryErasure,originalClosedRecoveryErasureResultFacts,type OriginalClosedRecoveryRetiredProof,type OriginalClosedRecoveryCandidatePage,type OriginalClosedRecoveryErasureResult} from './privacy-cookie-profile-migration';
import {originalClosedRecoveryCleanupPlans} from './privacy-serving-erase';
import {captureOriginalNativeServingOpen,executeOriginalNativeServingOpen,assertOriginalNativeServingOpenAcknowledgement,originalNativeServingOpenAcknowledgementFacts,type OriginalNativeServingOpen,type OriginalNativeServingOpenAck,captureOriginalNativeWriterFence,executeOriginalNativeWriterFence,assertOriginalNativeWriterFenceCut,assertOriginalNativeWriterFence,originalNativeWriterFenceFacts,captureWholeNativeMigrationAfterWriterFence,type OriginalNativeWriterFence,captureWholeNativeMigration,assertOriginalWholeNativeMigrationCapture,bindOriginalWholeNativeMigrationCloseDeadline,executeWholeNativeMigration,observeWholeNativeMigration,getOwnedWholeNativeMigrationObservation,assertOwnedWholeNativeMigrationObservation,type WholeMigrationCapability,type OwnedWholeNativeMigrationObservation} from './privacy-cookie-profile-migration';
import {recoveryScalarArrayJSON,recoveryScalarArraySha256,recoveryParseDataJSON,recoveryDataUtf8Bytes,assertOriginalRecoveryDataIntrinsics} from './privacy-recovery-data-json';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_RESPONSE_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders,checkOriginalNativeResponse,captureOriginalNativeRequestBody,captureOriginalNativeResponseBody,checkOriginalNativeBodyReader,readOriginalNativeBodyPacket,cancelOriginalNativeBodyReader,releaseOriginalNativeBodyReader} from './privacy-native-http-intrinsics';

export type PrivateProductionControlEnv=ServingGateEnvironment&{
 DB:D1Database;CF_VERSION_METADATA:{id:string;tag:string;timestamp:string};
 PRIVACY_PRODUCTION_CONTROL_ENABLED?:string;PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET?:string;
 PRIVACY_CONTROL_SOURCE_TREE?:string;PRIVACY_SERVING_SOURCE_TREE?:string;PRIVACY_SERVING_DEPLOYMENT_VERSION?:string;
 PRIVACY_SERVING_DATABASE_ID?:string;
 PRIVACY_WRITE_ADMISSION_LAYOUT?:'canonical'|'recorded-live-20261010';
 PRIVACY_INSTALL_SOURCE_KIND?:'pre-marker'|'marker'|'public-predecessor'|'current-cookie'|'current-cookie-pre-seal';
};
type Descriptor=Readonly<{ref:object;proto:object|null;key:PropertyKey;value:PropertyDescriptor|undefined}>;
type Method=Readonly<{receiver:object;fn:Function;slots:readonly Descriptor[]}>;
type Original=Readonly<{operationId:string;nonce:string;createdAt:number;expiresAt:number;nextWriteEpoch:string;
 controlVersion:string;servingVersion:string;sourceTree:string;credentialEpoch:string;writeEpoch:string}>;
type Origin={request:Request;env:PrivateProductionControlEnv;native:D1Database;prepare:Method;batch:Method;wait:Method;recoveryFetch:Method;namespaceId:Method;namespaceGet:Method;
 requestPrototype:object;headers:Headers;headerPrototype:object;metadata:object;metadataTuple:string;
 bindingSlots:readonly Descriptor[];requestSlots:readonly Descriptor[];headerSlots:readonly Descriptor[];
 url:string;path:string;contentType:string|null;proof:string|null;contentLength:string|null;config:ServingOriginalConfig;
 controlTree:string;controlSecret:string;capturedMs:number;lastObservedMs:number;operator:ServingGateOperator;raw:string|null;original:Original|null};
const origins=new WeakMap<object,Origin>();
const PATHS=['/v1/control/close','/v1/control/status','/v1/control/observe-cut','/v1/control/prepare-install','/v1/control/install-and-reopen','/v1/control/install-and-reopen-artifact','/v1/control/reopen'] as const;
const URL_ORIGIN='https://privacy-production-control.invalid';
const DOMAIN='olympus-private-production-control-original-v1';
const encoder=new TextEncoder();
const METHOD=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!;
const URL_GET=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!;
const HEADERS=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!;
const HEADER_GET=ORIGINAL_HEADER_DESCRIPTORS.get!.value;
const held=(reason:string):never=>{throw new RecoveryFloorHeldWithReason(reason);};
class RecoveryFloorHeldWithReason extends RecoveryFloorHeld{constructor(readonly reason:string){super();}}
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const uuid=(x:unknown):x is string=>typeof x==='string'&&x.length===36&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
function data(o:object,k:PropertyKey):unknown{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))return held('original_data_required');return d.value;}
function descriptor(o:object,k:PropertyKey):Descriptor{return Object.freeze({ref:o,proto:Object.getPrototypeOf(o),key:k,value:Object.getOwnPropertyDescriptor(o,k)});}
function sameDescriptor(saved:Descriptor):void{const d=Object.getOwnPropertyDescriptor(saved.ref,saved.key),s=saved.value;
 if(Object.getPrototypeOf(saved.ref)!==saved.proto||(s===undefined?d!==undefined:!d||['value','get','set','writable','enumerable','configurable'].some(k=>d[k as keyof PropertyDescriptor]!==s[k as keyof PropertyDescriptor])))return held('original_descriptor_drift');}
function method(receiver:object,key:string):Method{let p:object|null=receiver;const slots:Descriptor[]=[];
 for(let i=0;i<32&&p&&p!==Object.prototype;i++){const slot=descriptor(p,key);slots.push(slot);if(slot.value){if(!Object.hasOwn(slot.value,'value')||typeof slot.value.value!=='function')return held('original_method_accessor');return Object.freeze({receiver,fn:slot.value.value,slots:Object.freeze(slots)});}p=slot.proto;}
 return held('original_method_absent');}
function sameMethod(m:Method):void{for(const s of m.slots)sameDescriptor(s);}
function secret(x:unknown):string{if(typeof x!=='string'||x.length<32||x.length>4096||/[^\x21-\x7e]/.test(x))return held('separate_private_secret_required');return x;}
function metadata(x:object):string{const id=data(x,'id'),tag=data(x,'tag'),timestamp=data(x,'timestamp');if(!uuid(id)||typeof tag!=='string'||tag.length>1024||typeof timestamp!=='string'||timestamp.length>128||tag.includes('\0')||timestamp.includes('\0'))return held('original_version_required');return JSON.stringify([id,tag,timestamp]);}
function nativeGet(o:Origin,key:string):string|null{return Reflect.apply(HEADER_GET,o.headers,[key]) as string|null;}
function current(handle:object,fresh=false):Origin{const o=origins.get(handle);if(!o)return held('foreign_origin');checkOriginalNativeRequest(o.request);checkOriginalNativeHeaders(o.headers);
 for(const d of [...o.bindingSlots,...o.requestSlots,...o.headerSlots])sameDescriptor(d);sameMethod(o.prepare);sameMethod(o.batch);sameMethod(o.wait);sameMethod(o.recoveryFetch);sameMethod(o.namespaceId);sameMethod(o.namespaceGet);
 if(Object.getPrototypeOf(o.request)!==o.requestPrototype||Object.getPrototypeOf(o.headers)!==o.headerPrototype||Reflect.apply(HEADERS,o.request,[])!==o.headers
 ||Reflect.apply(METHOD,o.request,[])!=='POST'||Reflect.apply(URL_GET,o.request,[])!==o.url||nativeGet(o,'Content-Type')!==o.contentType
 ||nativeGet(o,'X-Olympus-Control-Proof')!==o.proof||nativeGet(o,'Content-Length')!==o.contentLength||metadata(o.metadata)!==o.metadataTuple)return held('original_request_or_version_drift');
 const now=Date.now();if(!Number.isSafeInteger(now)||now<o.capturedMs||now<o.lastObservedMs||fresh&&o.original&&(now<o.original.createdAt*1000||now>=o.original.expiresAt*1000))return held('original_clock_held');o.lastObservedMs=now;return o;}
/** Invoked only by the private module's actual fetch entry before any body/auth/network await.
 * Native platform custody remains externally unqualified until the exact deployment/bindings are accepted. */
function capture(request:Request,env:PrivateProductionControlEnv,ctx:ExecutionContext):object{
 if(!env||typeof env!=='object'||!ctx||typeof ctx!=='object')return held('private_entry_required');checkOriginalNativeRequest(request);
 const requestSlots=['method','url','headers','body','text','json','arrayBuffer'].map(k=>descriptor(request,k));
 if(requestSlots.some(d=>d.value!==undefined))return held('request_shadow_held');
 if(Reflect.apply(METHOD,request,[])!=='POST')return held('private_post_required');const url=Reflect.apply(URL_GET,request,[]) as string,u=new URL(url);
 if(u.origin!==URL_ORIGIN||u.search||u.hash||!PATHS.includes(u.pathname as typeof PATHS[number]))return held('private_route_required');
 const names=['DB','CF_VERSION_METADATA','PRIVACY_PRODUCTION_CONTROL_ENABLED','PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET','PRIVACY_CONTROL_SOURCE_TREE','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DEPLOYMENT_VERSION','PRIVACY_SERVING_DATABASE_ID','PRIVACY_RECOVERY_FLOOR','PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_WRITE_EPOCH'];
 const bindingSlots=names.map(k=>descriptor(env,k));if(bindingSlots.some(d=>!d.value||!Object.hasOwn(d.value,'value')))return held('original_private_binding_required');
 if(data(env,'PRIVACY_PRODUCTION_CONTROL_ENABLED')!=='true'||'PRIVACY_RECOVERY_INITIALIZER_SECRET'in env||'PRIVACY_SERVING_GATE_SECRET'in env)return held('private_control_off_or_root_mixed');
 const native=data(env,'DB') as D1Database,meta=data(env,'CF_VERSION_METADATA') as object,ce=data(env,'PRIVACY_CREDENTIAL_EPOCH'),we=data(env,'PRIVACY_WRITE_EPOCH'),tree=data(env,'PRIVACY_SERVING_SOURCE_TREE'),controlTree=data(env,'PRIVACY_CONTROL_SOURCE_TREE'),version=data(env,'PRIVACY_SERVING_DEPLOYMENT_VERSION');
 if(!native||typeof native!=='object'||isPrivacyWriteAdmissionDatabase(native)||!meta||typeof meta!=='object'||!hex(ce,32)||!hex(we,32)||ce===we||!hex(tree,40)||!hex(controlTree,40)||!uuid(version)||data(env,'PRIVACY_SERVING_DATABASE_ID')!==RECOVERY_FLOOR_TARGET.database)return held('original_target_required');
 const controlSecret=secret(data(env,'PRIVACY_PRODUCTION_CONTROL_AUTH_SECRET')),operatorSecret=secret(data(env,'PRIVACY_RECOVERY_OPERATOR_SECRET'));if(controlSecret===operatorSecret)return held('private_roots_must_differ');
 requestSlots.push(...['method','url','headers','body'].map(k=>descriptor(Request.prototype,k)));
 const headers=Reflect.apply(HEADERS,request,[]) as Headers;checkOriginalNativeHeaders(headers);const headerSlots=['get','has','entries','iterator'].map(k=>descriptor(headers,k));if(headerSlots.some(d=>d.value!==undefined))return held('headers_shadow_held');headerSlots.push(descriptor(Headers.prototype,'get'));
 const config=Object.freeze({credentialEpoch:ce,writeEpoch:we,sourceTree:tree,deploymentVersion:version});
 const namespace=data(env,'PRIVACY_RECOVERY_FLOOR') as object,namespaceId=method(namespace,'idFromName'),namespaceGet=method(namespace,'get'),nativeId=Reflect.apply(namespaceId.fn,namespace,['olympus-verify/7e2cf8fd-a9e3-48f6-975a-890f1360e5d0/recovery-floor-v1']);sameMethod(namespaceId);const stub=Reflect.apply(namespaceGet.fn,namespace,[nativeId]) as object;sameMethod(namespaceGet);const recoveryFetch=method(stub,'fetch');
 const operator=createServingRecoveryGateOperator(env,config),h=Object.freeze({scope:'private_control_original'}),capturedMs=Date.now();if(!Number.isSafeInteger(capturedMs)||capturedMs<=0)return held('original_clock_held');
 origins.set(h,{request,env,native,prepare:method(native,'prepare'),batch:method(native,'batch'),wait:method(ctx,'waitUntil'),recoveryFetch,namespaceId,namespaceGet,requestPrototype:Object.getPrototypeOf(request),headers,headerPrototype:Object.getPrototypeOf(headers),metadata:meta,metadataTuple:metadata(meta),bindingSlots:Object.freeze(bindingSlots),requestSlots:Object.freeze(requestSlots),headerSlots:Object.freeze(headerSlots),url,path:u.pathname,contentType:Reflect.apply(HEADER_GET,headers,['Content-Type']),proof:Reflect.apply(HEADER_GET,headers,['X-Olympus-Control-Proof']),contentLength:Reflect.apply(HEADER_GET,headers,['Content-Length']),config,controlTree,controlSecret,capturedMs,lastObservedMs:capturedMs,operator,raw:null,original:null});current(h);return h;
}
async function bounded<T>(handle:object,operation:(check:()=>void)=>Promise<T>):Promise<T>{const o=current(handle),start=Date.now(),limit=Math.min(start+5000,o.original?.expiresAt===undefined?Infinity:o.original.expiresAt*1000);let spent=false,timer:ReturnType<typeof setTimeout>|undefined;
 const check=()=>{installationIntrinsics();current(handle);if(spent||Date.now()>=limit)return held('original_control_timeout_unknown');};try{check();const result=await Promise.race([operation(check),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{spent=true;reject(new RecoveryFloorHeldWithReason('original_control_timeout_unknown'));},Math.max(1,limit-start));})]);check();return result;}finally{spent=true;if(timer!==undefined){Reflect.apply(installationClearTimer.value as Function,globalThis,[timer]);installationIntrinsics();}}}
/** EOF deadline is fixed before reading; cleanup cannot renew the authenticated operation. */
async function originalNativeText(source:Request|Response,kind:'request'|'response',deadline:number,check:()=>void,maxBytes:8192|262144=8192):Promise<string>{check();const reader=kind==='request'?captureOriginalNativeRequestBody(source as Request):captureOriginalNativeResponseBody(source as Response);if(!reader)return held('original_body_held');const bytes:number[]=[];let eof=false;const timed=async<T>(promise:Promise<T>):Promise<T>=>{const now=Date.now();if(!Number.isSafeInteger(now)||now>=deadline)return held('original_body_held');let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RecoveryFloorHeld()),Math.max(1,deadline-now));})]);}finally{if(timer!==undefined)clearTimeout(timer);}};try{for(;;){check();checkOriginalNativeBodyReader(reader);const originalNow=Date.now();if(!Number.isSafeInteger(originalNow)||originalNow>=deadline)return held('original_body_held');const packet=await timed(readOriginalNativeBodyPacket(reader));check();checkOriginalNativeBodyReader(reader);if(Date.now()>=deadline)return held('original_body_held');if(packet.done){eof=true;break;}const chunk=packet.value;if(!chunk)return held('original_body_held');const length=chunk.byteLength;if(bytes.length+length>maxBytes)return held('original_body_held');for(let j=0;j<length;j++)bytes.push(chunk[j]!);}check();checkOriginalNativeBodyReader(reader);return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(new Uint8Array(bytes));}finally{if(eof)releaseOriginalNativeBodyReader(reader);else{let cleanupTimer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([cancelOriginalNativeBodyReader(reader,'original_private_body_unknown').then(()=>releaseOriginalNativeBodyReader(reader)),new Promise<never>((_,reject)=>{cleanupTimer=setTimeout(()=>reject(new RecoveryFloorHeld()),1000);})]);}finally{if(cleanupTimer!==undefined)clearTimeout(cleanupTimer);}}}}
async function originalBody(handle:object):Promise<string>{const o=current(handle);if(o.contentType!=='application/json'||o.contentLength!==null&&(!/^[0-9]+$/.test(o.contentLength)||o.contentLength.length>5||Number(o.contentLength)>8192))return held('closed_body_required');return originalNativeText(o.request,'request',o.capturedMs+5000,()=>{current(handle);});}
function original(handle:object,raw:string):Original{const o=current(handle);let x:unknown;try{x=JSON.parse(raw);}catch{return held('closed_command_required');}
 const keys=['operationId','nonce','createdAt','expiresAt','nextWriteEpoch','controlVersion','servingVersion','sourceTree','credentialEpoch','writeEpoch'];if(!x||typeof x!=='object'||Array.isArray(x)||JSON.stringify(x)!==raw||Reflect.ownKeys(x).sort().join('|')!==keys.sort().join('|'))return held('closed_command_required');
 const v=Object.fromEntries(keys.map(k=>[k,data(x as object,k)]));if(!hex(v.operationId,32)||!hex(v.nonce,32)||!hex(v.nextWriteEpoch,32)||v.nextWriteEpoch===o.config.writeEpoch||typeof v.createdAt!=='number'||!Number.isSafeInteger(v.createdAt)||v.createdAt<=0||v.createdAt>253402300499||v.expiresAt!==v.createdAt+300||v.controlVersion!==JSON.parse(o.metadataTuple)[0]||v.servingVersion!==o.config.deploymentVersion||v.sourceTree!==o.config.sourceTree||v.credentialEpoch!==o.config.credentialEpoch||v.writeEpoch!==o.config.writeEpoch)return held('original_command_mismatch');
 const value=Object.freeze(v) as Original;o.original=value;o.raw=raw;current(handle,true);return value;}
async function authenticated(handle:object,raw:string):Promise<void>{return bounded(handle,async check=>{const o=current(handle);if(!hex(o.proof,64))return held('operator_authentication_required');
 const key=await crypto.subtle.importKey('raw',encoder.encode(o.controlSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);current(handle,true);
 const ok=await crypto.subtle.verify('HMAC',key,Uint8Array.from(o.proof.match(/../g)!,v=>parseInt(v,16)),encoder.encode(JSON.stringify([DOMAIN,'POST',o.path,o.controlTree,o.metadataTuple,raw])));current(handle,true);check();if(!ok)return held('operator_authentication_required');});}
async function digest(handle:object,raw:string):Promise<string>{return bounded(handle,async check=>{const o=current(handle,true),out=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify([DOMAIN,o.controlTree,o.metadataTuple,raw])));current(handle,true);check();return [...new Uint8Array(out)].map(v=>v.toString(16).padStart(2,'0')).join('');});}
const residuals=Object.freeze(['unmanaged_old_version_closure_unqualified','provider_accepted_work_drain_unqualified','source_root_capacity_acceptance_unqualified','all_physical_copy_replay_unqualified','private_pipeline_live_origin_unqualified']);
const flags=Object.freeze({externalOriginQualified:false,allWriterDrainQualified:false,providerDrainQualified:false,installationQualified:false,readyToReopen:false,B1Qualified:false});
const reply=(value:unknown,status:number)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
/** No initializer/root creation. A lost close stays unknown; status observes its original native cut only. */
export async function handlePrivateProductionControl(request:Request,env:PrivateProductionControlEnv,ctx:ExecutionContext):Promise<Response>{let handle:object|undefined;try{
 if(Reflect.apply(URL_GET,request,[])==='https://privacy-production-control.invalid/v1/control/observe-cut'){const owned=await captureOriginalPrivateControlCut(request,env,ctx),observed=originalPrivateControlCutCustody(owned);return reply({scope:'private_source_original_native_cut',nativeCut:observed.nativeCut,suppressionControl:observed.suppressionControl,allWriterCut:observed.allWriterCut,localPending:observed.pending,localUnknown:observed.unknown,providerPending:observed.providerPending,providerUnknown:observed.providerUnknown,providerDrainQualified:false,readyToReopen:false},200);}
 handle=capture(request,env,ctx);const raw=await originalBody(handle),v=original(handle,raw);await authenticated(handle,raw);const o=current(handle,true),requestDigest=await digest(handle,raw);
 if(o.path==='/v1/control/prepare-install'||o.path==='/v1/control/install-and-reopen'||o.path==='/v1/control/install-and-reopen-artifact'||o.path==='/v1/control/reopen')return await dispatchOriginalPrivateControlPipeline(handle,raw);
 const observation=await readServingRecoveryUnresolved(o.operator);current(handle,true);
 if(o.path==='/v1/control/close'){const action=prepareServingCloseCut(o.operator,observation,{operationId:v.operationId,nonce:v.nonce,requestDigest,createdAt:v.createdAt,expiresAt:v.expiresAt,nextWriteEpoch:v.nextWriteEpoch});current(handle,true);const close=await dispatchServingCloseCut(o.operator,action);current(handle,true);
  return reply({scope:'private_original_control_close_local',operationId:v.operationId,createdAt:v.createdAt,expiresAt:v.expiresAt,nativeClose:close.nativeTuple,residuals,...flags},200);}
 const gate=JSON.parse(observation.nativeTuple) as unknown[];if(gate[3]!=='closing_held'||gate[4]!==v.operationId||gate[5]!==v.nonce||gate[6]!==requestDigest||gate[7]!==v.createdAt||gate[8]!==v.expiresAt||gate[9]!==v.nextWriteEpoch)return held('original_close_observation_mismatch');
 return reply({scope:'private_original_control_status_local',operationId:v.operationId,createdAt:v.createdAt,expiresAt:v.expiresAt,nativeClose:observation.nativeTuple,localUnresolved:observation.localUnresolved,firstTicket:observation.firstTicket,residuals,...flags},200);
 }catch(error){return reply({scope:'private_original_control_unknown_or_held',reason:error instanceof RecoveryFloorHeldWithReason?error.reason:'original_control_outcome_unknown',...flags},503);}}

/** Actual authenticated same-cut producer. Returned tuple shapes are not brands; only these private maps issue custody. */
export type OriginalPrivateControlCut=Readonly<{scope:'source_owned_native_control_cut';nativeCut:string;suppressionControl:string;allWriterCut:string}>;
type CutState={handle:object;gate:string;floor:string;cut:string;control:string;allWriter:string;last:number};
const controlCuts=new WeakMap<OriginalPrivateControlCut,CutState>();
const RESPONSE=ORIGINAL_RESPONSE_DESCRIPTORS;
async function originalCutRPC(handle:object,gate:string,floor:string):Promise<{nativeCut:string;suppressionControl:string}>{return bounded(handle,async check=>{
 const o=current(handle,true),raw=JSON.stringify({originalGate:gate,originalFloor:floor}),secret=data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string,proof=await servingGateMac(secret,'POST','/v1/serving/observe-cut',raw);check();sameMethod(o.recoveryFetch);
 const response=await Reflect.apply(o.recoveryFetch.fn,o.recoveryFetch.receiver,[new Request('https://privacy-recovery-floor.invalid/v1/serving/observe-cut',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Serving-Proof':proof},body:raw})]) as Response;check();sameMethod(o.recoveryFetch);
 checkOriginalNativeResponse(response);if(Reflect.apply(RESPONSE.status!.get!,response,[])!==200)return held('original_native_cut_unconfirmed');const responseRaw=await originalNativeText(response,'response',Math.min(Date.now()+5000,o.original!.expiresAt*1000),()=>{check();checkOriginalNativeResponse(response);});const value=JSON.parse(responseRaw) as unknown;check();if(!value||typeof value!=='object'||Array.isArray(value)||data(value,'scope')!=='private_serving_original_native_cut_observation')return held('original_native_cut_unconfirmed');const nativeCut=data(value,'nativeCut'),suppressionControl=data(value,'suppressionControl');if(typeof nativeCut!=='string'||typeof suppressionControl!=='string')return held('original_native_cut_unconfirmed');return {nativeCut,suppressionControl};
});}
/** Drain only the already-accepted managed ticket cohort of this exact close.
 * Unknown tickets are never settled here. Provider/unmanaged-origin and all-copy proof remain separate. */
async function originalManagedTicketDrainCut(handle:object,gate:string,floor:string):Promise<{nativeCut:string;suppressionControl:string}>{
 const original=current(handle,true).original;if(!original)return held('original_managed_drain_close_required');
 const g=tuple(gate,11);if(g[2]!==floor||g[3]!=='closing_held'||g[4]!==original.operationId||g[7]!==original.createdAt||g[8]!==original.expiresAt)return held('original_managed_drain_close_required');
 const fixed=Object.freeze([original.operationId,original.createdAt,original.expiresAt]);let prior:unknown[]|null=null,priorControl:unknown[]|null=null;
 const check=()=>{installationIntrinsics();const o=current(handle,true);if(!o.original||o.original.operationId!==fixed[0]||o.original.createdAt!==fixed[1]||o.original.expiresAt!==fixed[2])return held('original_managed_drain_close_changed');};
 for(let poll=0;poll<128;poll++){
  check();const observation=await originalCutRPC(handle,gate,floor);check();nativeCutFacts(handle,gate,floor,observation.nativeCut,observation.suppressionControl);
  const now=tuple(observation.nativeCut,17),control=tuple(observation.suppressionControl,5);
  if(now[12]!==0||now[16]!==0)return held('original_managed_drain_unknown');
  if(prior){
   if([0,1,2,3,4,5,6,8,9,13].some(i=>now[i]!==prior![i])||(now[7]as number)<(prior[7]as number)||(now[10]as number)<(prior[10]as number)||(now[11]as number)>(prior[11]as number)||(now[14]as number)<(prior[14]as number)||(now[15]as number)>(prior[15]as number))return held('original_managed_drain_census_changed');
   if(!priorControl||[0,1,2,4].some(i=>control[i]!==priorControl![i])||(control[3]as number)<(priorControl[3]as number))return held('original_managed_drain_control_changed');
  }
  if(now[11]===0&&now[15]===0)return observation;
  if(poll===127)return held('original_managed_drain_poll_bound');prior=now;priorControl=control;
  const remaining=(fixed[2]as number)*1000-originalRecoveryClockMilliseconds(),delay=remaining<250?remaining:250;if(delay<1)return held('original_managed_drain_original_deadline');let timer:ReturnType<typeof setTimeout>|undefined;
  try{check();await Reflect.construct(installationPromise.value as Function,[(resolve:()=>void)=>{timer=Reflect.apply(installationTimer.value as Function,globalThis,[resolve,delay])as ReturnType<typeof setTimeout>;}])as Promise<void>;check();}
  finally{if(timer!==undefined){installationIntrinsics();Reflect.apply(installationClearTimer.value as Function,globalThis,[timer]);installationIntrinsics();}}
 }
 return held('original_managed_drain_poll_bound');
}
function tuple(raw:string,length:number):unknown[]{let value:unknown;try{value=JSON.parse(raw);}catch{return held('original_native_tuple_required');}if(!Array.isArray(value)||value.length!==length||JSON.stringify(value)!==raw)return held('original_native_tuple_required');return value;}
function nativeCutFacts(handle:object,gate:string,floor:string,cut:string,control:string):void{
 const o=current(handle,true),g=tuple(gate,11),f=tuple(floor,12),c=tuple(cut,17),s=tuple(control,5);
 if(g[2]!==floor||g[3]!=='closing_held'||c[0]!=='native-serving-cut-v1'||c[1]!==gate||c[2]!==floor||c[3]!==g[4]||c[4]!==f[5]||c[5]!==g[7]||c[6]!==g[8]||typeof c[7]!=='number'||!Number.isSafeInteger(c[7])||c[7]<(g[10] as number)||c[7]>=o.original!.expiresAt)return held('original_cut_lineage');
 if(f[6]!==o.config.credentialEpoch||f[7]!==o.config.writeEpoch||f[8]!==o.config.sourceTree||f[9]!==o.config.deploymentVersion||c.slice(8).some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0)||Number(c[8])+Number(c[9])!==Number(c[10])+Number(c[11])+Number(c[12])||Number(c[13])!==Number(c[14])+Number(c[15])+Number(c[16]))return held('original_cut_census');
 if(s[0]!==1||s[1]!==SUPPRESSION_PROTOCOL||s[2]!==floor||typeof s[3]!=='number'||!Number.isSafeInteger(s[3])||s[3]<0||!hex(s[4],64))return held('original_suppression_control');
}
/** This is the fixed close/observe route producer, never a caller {drained:true} constructor. */
export async function captureOriginalPrivateControlCut(request:Request,env:PrivateProductionControlEnv,ctx:ExecutionContext):Promise<OriginalPrivateControlCut>{
 const handle=capture(request,env,ctx),raw=await originalBody(handle);original(handle,raw);await authenticated(handle,raw);const requestDigest=await digest(handle,raw);return captureOriginalPrivateControlCutFromOrigin(handle,requestDigest);
}
/** The authenticated HTTP install path consumes the very same captured body and origin, never a reconstructed request. */
async function captureOriginalPrivateControlCutFromOrigin(handle:object,requestDigest:string):Promise<OriginalPrivateControlCut>{
 const o=current(handle,true),v=o.original;if(!v||!['/v1/control/close','/v1/control/observe-cut','/v1/control/prepare-install','/v1/control/install-and-reopen','/v1/control/install-and-reopen-artifact'].includes(o.path))return held('original_cut_route_required');
 const seen=await readServingRecoveryUnresolved(o.operator);current(handle,true);let G=seen.nativeTuple;
 if(o.path==='/v1/control/close'){const action=prepareServingCloseCut(o.operator,seen,{operationId:v.operationId,nonce:v.nonce,requestDigest,createdAt:v.createdAt,expiresAt:v.expiresAt,nextWriteEpoch:v.nextWriteEpoch});current(handle,true);const closed=await dispatchServingCloseCut(o.operator,action);current(handle,true);G=closed.nativeTuple;}
 const g=tuple(G,11);if(g[3]!=='closing_held'||g[4]!==v.operationId||g[5]!==v.nonce||(o.path==='/v1/control/close'&&g[6]!==requestDigest)||g[7]!==v.createdAt||g[8]!==v.expiresAt||g[9]!==v.nextWriteEpoch||typeof g[2]!=='string')return held('same_original_close_required');const F=g[2],{nativeCut:C,suppressionControl:S}=await originalManagedTicketDrainCut(handle,G,F);nativeCutFacts(handle,G,F,C,S);
 const key=await crypto.subtle.importKey('raw',encoder.encode(data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string),{name:'HMAC',hash:'SHA-256'},false,['sign']);current(handle,true);const fingerprint=await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify(['independent-suppression-key-fingerprint-v1'])));current(handle,true);const expected=[...new Uint8Array(fingerprint)].map(v=>v.toString(16).padStart(2,'0')).join('');if(tuple(S,5)[4]!==expected)return held('same_original_suppression_key_required');
 const c=tuple(C,17),f=tuple(F,12),receiptDigest=await digest(handle,JSON.stringify(['all-writer-native-cut-v1',G,F,C,S])),W=JSON.stringify(['all-writer-cut-v1',G,F,v.operationId,f[8],f[9],f[5],g[7],g[8],c[8],c[9],c[11],c[12],c[15],c[16],receiptDigest]);current(handle,true);
 const value=Object.freeze({scope:'source_owned_native_control_cut' as const,nativeCut:C,suppressionControl:S,allWriterCut:W});controlCuts.set(value,{handle,gate:G,floor:F,cut:C,control:S,allWriter:W,last:Date.now()});return value;
}
/** No native DB or secret escapes. The exact same owned cut/control is checked before any consumer signs. */
export function originalPrivateControlCutCustody(value:OriginalPrivateControlCut):Readonly<{gate:string;floor:string;nativeCut:string;suppressionControl:string;allWriterCut:string;actionSequence:number;pending:number;unknown:number;providerPending:number;providerUnknown:number}>{
 privateOriginalCutOwner(value);const saved=controlCuts.get(value)!,c=tuple(saved.cut,17),s=tuple(saved.control,5);return Object.freeze({gate:saved.gate,floor:saved.floor,nativeCut:saved.cut,suppressionControl:saved.control,allWriterCut:saved.allWriter,actionSequence:s[3] as number,pending:c[11] as number,unknown:c[12] as number,providerPending:c[15] as number,providerUnknown:c[16] as number});
}

function privateOriginalCutOwner(value:OriginalPrivateControlCut):Origin{
 const saved=controlCuts.get(value);if(!saved)return held('foreign_control_cut');const o=current(saved.handle,true);nativeCutFacts(saved.handle,saved.gate,saved.floor,saved.cut,saved.control);
 if(value.nativeCut!==saved.cut||value.suppressionControl!==saved.control||value.allWriterCut!==saved.allWriter)return held('original_cut_alias_drift');return o;
}
/** The pre-install restore observer joins this SAME original cut/environment, never caller tuples. */
export function originalPrivateRestoredArtifactOrigin(cut:OriginalPrivateControlCut,env:PrivateProductionControlEnv):Readonly<{operationId:string;createdAt:number;expiresAt:number;nextEpoch:string;metadataTuple:string;check:()=>void}>{
 const saved=controlCuts.get(cut);if(!saved)return held('foreign_restored_artifact_cut');
 const check=()=>{const o=privateOriginalCutOwner(cut);if(o.env!==env||!o.original||data(env,'DB')!==o.native)return held('foreign_restored_artifact_environment');};check();
 const o=origins.get(saved.handle)!,v=o.original!;return Object.freeze({operationId:v.operationId,createdAt:v.createdAt,expiresAt:v.expiresAt,nextEpoch:v.nextWriteEpoch,metadataTuple:o.metadataTuple,check});
}

/** Read-only plan capture. The actual private executor below reserves independent durable custody first.
 * No caller gets Native, SQL or the retained migration capability; HTTP installation/reopening remain held. */
declare const privateInstallPlanBrand:unique symbol;
export type OriginalPrivateInstallPlan=Readonly<{[privateInstallPlanBrand]:true}>;
type InstallPlanState={cut:OriginalPrivateControlCut;writerFence?:OriginalNativeWriterFence;handle:object;slots:readonly Descriptor[];migration:WholeMigrationCapability;
 layout:'canonical'|'recorded-live-20261010';sourceKind:'pre-marker'|'marker'|'public-predecessor'|'current-cookie'|'current-cookie-pre-seal';
 operationId:string;originalEpoch:string|null;nextEpoch:string;originalCreatedAt:number;originalExpiresAt:number;sourceTree:string};
const installPlans=new WeakMap<OriginalPrivateInstallPlan,InstallPlanState>(),installCaptureSpent=new WeakSet<OriginalPrivateControlCut>();
function installPlanCurrent(saved:InstallPlanState):void{
 originalRecoveryClockMilliseconds();
 const o=current(saved.handle,true),cut=originalPrivateControlCutCustody(saved.cut);
 for(const slot of saved.slots)sameDescriptor(slot);
 if(cut.pending!==0||cut.unknown!==0||cut.providerPending!==0||cut.providerUnknown!==0||o.original?.operationId!==saved.operationId
 ||o.original.createdAt!==saved.originalCreatedAt||o.original.expiresAt!==saved.originalExpiresAt||o.original.nextWriteEpoch!==saved.nextEpoch
 ||o.config.sourceTree!==saved.sourceTree||data(o.env,'PRIVACY_WRITE_ADMISSION_LAYOUT')!==saved.layout||data(o.env,'PRIVACY_INSTALL_SOURCE_KIND')!==saved.sourceKind)return held('original_install_plan_drift');
 if(saved.writerFence)assertOriginalNativeWriterFence(saved.writerFence,saved.cut);
 assertOriginalWholeNativeMigrationCapture(saved.migration);
}
/** Captures the existing Native complete-profile read under the actual authenticated cut.
 * Native migration's separate capture clock never renews the original close300 authority. */
export async function captureOriginalPrivateInstallPlan(cut:OriginalPrivateControlCut,writerFence?:OriginalNativeWriterFence):Promise<OriginalPrivateInstallPlan>{
 originalRecoveryClockMilliseconds();
 const savedCut=controlCuts.get(cut);if(!savedCut||installCaptureSpent.has(cut))return held('original_install_capture_foreign_or_spent');
 const o=current(savedCut.handle,true),facts=originalPrivateControlCutCustody(cut),original=o.original;
 if(!original||facts.pending!==0||facts.unknown!==0||facts.providerPending!==0||facts.providerUnknown!==0||original.nextWriteEpoch===o.config.credentialEpoch)return held('original_install_cut_held');
 const slots=Object.freeze(['PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_INSTALL_SOURCE_KIND'].map(key=>descriptor(o.env,key)));
 for(const slot of slots)if(!slot.value||!Object.hasOwn(slot.value,'value'))return held('original_install_config_required');
 const layout=data(o.env,'PRIVACY_WRITE_ADMISSION_LAYOUT'),sourceKind=data(o.env,'PRIVACY_INSTALL_SOURCE_KIND');
 if(layout!=='canonical'&&layout!=='recorded-live-20261010'||sourceKind!=='pre-marker'&&sourceKind!=='marker'&&sourceKind!=='public-predecessor'&&sourceKind!=='current-cookie'&&sourceKind!=='current-cookie-pre-seal'
 ||sourceKind==='public-predecessor'&&layout!=='recorded-live-20261010')return held('original_install_config_required');
 const originalEpoch=writerFence?originalNativeWriterFenceFacts(writerFence,cut).originalEpoch:sourceKind==='public-predecessor'?null:o.config.writeEpoch;
 const check=()=>{originalRecoveryClockMilliseconds();current(savedCut.handle,true);originalPrivateControlCutCustody(cut);for(const slot of slots)sameDescriptor(slot);};
 check();if(writerFence)assertOriginalNativeWriterFence(writerFence,cut);installCaptureSpent.add(cut);
 const migration=await bounded(savedCut.handle,async boundary=>{check();boundary();
  const captured=writerFence?await captureWholeNativeMigrationAfterWriterFence(writerFence,cut,original.nextWriteEpoch,original.operationId):await captureWholeNativeMigration(o.native,Object.freeze({operationId:original.operationId,layout,sourceKind,originalEpoch,nextEpoch:original.nextWriteEpoch}));
  check();boundary();return captured;
 });check();
 if(migration.operationId!==original.operationId||migration.layout!==layout||migration.sourceKind!==sourceKind||migration.originalEpoch!==originalEpoch
 ||migration.nextEpoch!==original.nextWriteEpoch||migration.createdAt<original.createdAt||migration.createdAt>=original.expiresAt
 ||migration.expiresAt!==migration.createdAt+300||migration.mode!==(sourceKind==='public-predecessor'&&!writerFence?'legacy_control_without_mode':'closed'))return held('original_install_capture_unconfirmed');
 bindOriginalWholeNativeMigrationCloseDeadline(migration,original.expiresAt);check();
 const state:InstallPlanState={cut,...(writerFence?{writerFence}:{}),handle:savedCut.handle,slots,migration,layout,sourceKind,operationId:original.operationId,originalEpoch,
 nextEpoch:original.nextWriteEpoch,originalCreatedAt:original.createdAt,originalExpiresAt:original.expiresAt,sourceTree:o.config.sourceTree};
 installPlanCurrent(state);const plan=Object.freeze({}) as OriginalPrivateInstallPlan;installPlans.set(plan,state);return plan;
}
export function assertOriginalPrivateInstallPlan(plan:OriginalPrivateInstallPlan):void{
 const saved=installPlans.get(plan);if(!saved)return held('foreign_install_plan');installPlanCurrent(saved);
}
/** Safe metadata only. It does not expose the retained capability or qualify a production installation. */
export function originalPrivateInstallPlanFacts(plan:OriginalPrivateInstallPlan):Readonly<{
 operationId:string;layout:'canonical'|'recorded-live-20261010';sourceKind:'pre-marker'|'marker'|'public-predecessor'|'current-cookie'|'current-cookie-pre-seal';originalEpoch:string|null;nextEpoch:string;
 originalCreatedAt:number;originalExpiresAt:number;sourceTree:string;capturedProfileMode:'closed'|'legacy_control_without_mode';
 nativeProfileReadOnly:true;externalDrainQualified:false;productionExecutionAvailable:false;readyToReopen:false}>{
 assertOriginalPrivateInstallPlan(plan);const s=installPlans.get(plan)!;
 return Object.freeze({operationId:s.operationId,layout:s.layout,sourceKind:s.sourceKind,originalEpoch:s.originalEpoch,nextEpoch:s.nextEpoch,
 originalCreatedAt:s.originalCreatedAt,originalExpiresAt:s.originalExpiresAt,sourceTree:s.sourceTree,capturedProfileMode:s.migration.mode,
 nativeProfileReadOnly:true as const,externalDrainQualified:false as const,productionExecutionAvailable:false as const,readyToReopen:false as const});
}

/** Actual source-owned Native installation. This API is private-module only, never an HTTP opener.
 * Existing independent Floor reservation is durable BEFORE the one original D1 batch. */
declare const privateInstallationBrand:unique symbol;
export type OriginalPrivateInstallation=Readonly<{[privateInstallationBrand]:true}>;
type InstallationState={plan:OriginalPrivateInstallPlan;phase:'prepared'|'reserving'|'reserved'|'native-dispatched'|'readback'|'committing'|'complete'|'unknown';
 executionOperationId:string;executionNonce:string;requestDigest:string;originalJournal:string|null;originalAttempt:string|null;
 nativeObservation:OwnedWholeNativeMigrationObservation|null;migrationReceipt:string|null;completionJournal:string|null};
const privateInstallations=new WeakMap<OriginalPrivateInstallPlan,InstallationState>(),privateInstallationResults=new WeakMap<OriginalPrivateInstallation,InstallationState>();
function installationSlot(receiver:object,key:string,getter=false):Readonly<{value:unknown;check:()=>void}>{
 const slots:Descriptor[]=[];let p:object|null=receiver;
 for(let depth=0;p&&depth<32;depth++){const slot=descriptor(p,key);slots.push(slot);if(slot.value){const d=slot.value;
  if(!Object.hasOwn(d,'value')&&(!getter||typeof d.get!=='function'||d.set!==undefined))return held('install_intrinsic_required');
  const check=()=>{let current:object|null=receiver;for(const s of slots){if(current!==s.ref)return held('install_intrinsic_drift');sameDescriptor(s);current=s.proto;}};
  check();const value=Object.hasOwn(d,'value')?d.value:Reflect.apply(d.get!,receiver,[]);check();return Object.freeze({value,check});}p=slot.proto;
 }return held('install_intrinsic_required');
}
const installationCrypto=installationSlot(globalThis,'crypto',true);if(!installationCrypto.value||typeof installationCrypto.value!=='object')held('install_intrinsic_required');
const installationSubtle=installationSlot(installationCrypto.value as object,'subtle',true);if(!installationSubtle.value||typeof installationSubtle.value!=='object')held('install_intrinsic_required');
const installationImport=method(installationSubtle.value as object,'importKey'),installationSign=method(installationSubtle.value as object,'sign');
const installationRequest=installationSlot(globalThis,'Request'),installationBytes=installationSlot(globalThis,'Uint8Array'),installationBuffer=installationSlot(globalThis,'ArrayBuffer'),installationDecoder=installationSlot(globalThis,'TextDecoder'),installationPromise=installationSlot(globalThis,'Promise'),installationTimer=installationSlot(globalThis,'setTimeout'),installationClearTimer=installationSlot(globalThis,'clearTimeout');
for(const s of [installationRequest,installationBytes,installationBuffer,installationDecoder,installationPromise,installationTimer,installationClearTimer])if(typeof s.value!=='function')held('install_intrinsic_required');
const installationDecoderPrototype=installationSlot(installationDecoder.value as Function,'prototype');
const installationDecoderInstance=Reflect.construct(installationDecoder.value as Function,['utf-8',{fatal:true,ignoreBOM:false}]) as object,installationDecode=method(installationDecoderInstance,'decode');
if(Object.getPrototypeOf(installationDecoderInstance)!==installationDecoderPrototype.value)held('install_intrinsic_required');
const installationBufferPrototype=installationSlot(installationBuffer.value as Function,'prototype'),installationBufferLength=descriptor(installationBufferPrototype.value as object,'byteLength');
if(!installationBufferLength.value||typeof installationBufferLength.value.get!=='function'||installationBufferLength.value.set!==undefined)held('install_intrinsic_required');
function installationIntrinsics():void{assertOriginalRecoveryDataIntrinsics();for(const s of [installationCrypto,installationSubtle,installationRequest,installationBytes,installationBuffer,installationDecoder,installationPromise,installationTimer,installationClearTimer,installationBufferPrototype,installationDecoderPrototype])s.check();sameMethod(installationDecode);if(Object.getPrototypeOf(installationDecoderInstance)!==installationDecoderPrototype.value)held('install_intrinsic_drift');sameDescriptor(installationBufferLength);sameMethod(installationImport);sameMethod(installationSign);originalRecoveryClockMilliseconds();}
function installationCurrent(s:InstallationState):InstallPlanState{
 installationIntrinsics();const plan=installPlans.get(s.plan);if(!plan||s.phase==='unknown')return held('foreign_or_unknown_installation');installPlanCurrent(plan);
 if(s.nativeObservation)assertOwnedWholeNativeMigrationObservation(s.nativeObservation);
 return plan;
}
async function installationBounded<T>(s:InstallationState,operation:(check:()=>void)=>Promise<T>):Promise<T>{
 const p=installationCurrent(s),start=originalRecoveryClockMilliseconds(),limit=Math.min(start+5000,p.originalExpiresAt*1000);let spent=false,timer:ReturnType<typeof setTimeout>|undefined;
 const check=()=>{installationCurrent(s);const now=originalRecoveryClockMilliseconds();if(spent||now<start||now>=limit)return held('original_install_timeout_unknown');};
 try{check();const value=await Promise.race([operation(check),new Promise<never>((_,reject)=>{timer=Reflect.apply(installationTimer.value as Function,globalThis,[()=>{spent=true;reject(new RecoveryFloorHeldWithReason('original_install_timeout_unknown'));},Math.max(1,limit-start)]) as ReturnType<typeof setTimeout>;})]);check();return value;}
 finally{spent=true;if(timer!==undefined){installationIntrinsics();Reflect.apply(installationClearTimer.value as Function,globalThis,[timer]);installationIntrinsics();}}
}
async function installationMAC(s:InstallationState,secret:string,path:string,raw:string):Promise<string>{
 installationCurrent(s);const key=await Reflect.apply(installationImport.fn,installationImport.receiver,['raw',recoveryDataUtf8Bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']]);installationCurrent(s);
 const out=await Reflect.apply(installationSign.fn,installationSign.receiver,['HMAC',key,recoveryDataUtf8Bytes(recoveryScalarArrayJSON(['privacy-recovery-floor-operator-v1','POST',path,raw]))]);installationCurrent(s);
 if(!out||typeof out!=='object'||Object.getPrototypeOf(out)!==installationBufferPrototype.value||Reflect.ownKeys(out).length||Reflect.apply(installationBufferLength.value!.get!,out,[])!==32)return held('original_install_mac_unconfirmed');
 const bytes=Reflect.construct(installationBytes.value as Function,[out]) as Uint8Array;let value='';for(let i=0;i<32;i++)value+=bytes[i]!.toString(16).padStart(2,'0');installationCurrent(s);return value;
}
function installationText(keys:readonly string[],values:readonly (string|number|null)[]):string{
 if(keys.length!==values.length)return held('install_journal_body');let out='{';
 for(let i=0;i<keys.length;i++){if(i)out+=',';out+=recoveryScalarArrayJSON(keys[i])+':'+recoveryScalarArrayJSON(values[i]);}return out+'}';
}
/** Only fixed source paths and internally constructed bodies; no generic RPC/Native adapter escapes. */
async function installationRPC(s:InstallationState,path:'/v1/reserve'|'/v1/completion-reserve'|'/v1/complete',raw:string):Promise<object>{
 const p=installationCurrent(s);return installationBounded(s,async check=>{
  const o=current(p.handle,true),secret=data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string;
  installationCurrent(s);check();const proof=await installationMAC(s,secret,path,raw);installationCurrent(s);check();sameMethod(o.recoveryFetch);
  const request=Reflect.construct(installationRequest.value as Function,['https://privacy-recovery-floor.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Recovery-Proof':proof},body:raw}]) as Request;checkOriginalNativeRequest(request);
  const response=await Reflect.apply(o.recoveryFetch.fn,o.recoveryFetch.receiver,[request]) as Response;
  installationCurrent(s);check();sameMethod(o.recoveryFetch);checkOriginalNativeResponse(response);
  if(Reflect.apply(RESPONSE.status!.get!,response,[])!==200)return held('original_install_journal_unconfirmed');
  const responseRaw=await originalNativeText(response,'response',Math.min(originalRecoveryClockMilliseconds()+5000,p.originalExpiresAt*1000),()=>{installationCurrent(s);check();checkOriginalNativeResponse(response);});
  installationCurrent(s);check();const value=recoveryParseDataJSON(responseRaw);
  if(!value||typeof value!=='object'||Array.isArray(value)||data(value,'readyToReopen')!==false)return held('original_install_journal_unconfirmed');
  const expected=path==='/v1/reserve'?['journal','readyToReopen']:['journal','attempt','readyToReopen'];
  if(Reflect.ownKeys(value).sort().join('|')!==expected.sort().join('|'))return held('original_install_journal_shape');return value;
 });
}
function installJournalTuple(raw:unknown,length:number):readonly unknown[]{
 if(typeof raw!=='string'||raw.length>8192)return held('original_install_journal_shape');const a=recoveryParseDataJSON(raw);
 if(!Array.isArray(a)||a.length!==length||recoveryScalarArrayJSON(a)!==raw)return held('original_install_journal_shape');return a;
}
/** One attempt per exact retained plan. Unknown Native/DO outcomes cannot be retried or reconstructed from shapes. */
export async function executeOriginalPrivateInstallPlan(plan:OriginalPrivateInstallPlan):Promise<OriginalPrivateInstallation>{
 assertOriginalPrivateInstallPlan(plan);if(privateInstallations.has(plan))return held('original_installation_spent');
 const p=installPlans.get(plan)!,s:InstallationState={plan,phase:'prepared',executionOperationId:'',executionNonce:'',requestDigest:'',originalJournal:null,originalAttempt:null,nativeObservation:null,migrationReceipt:null,completionJournal:null};
 privateInstallations.set(plan,s);
 try{
  const cut=originalPrivateControlCutCustody(p.cut),identity=await recoveryScalarArraySha256(['private-original-installation-v1',cut.floor,cut.gate,p.layout,p.sourceKind,p.originalEpoch,p.nextEpoch,p.originalCreatedAt,p.originalExpiresAt]);
  installationCurrent(s);s.executionOperationId=identity.slice(0,32);s.executionNonce=identity.slice(32);s.requestDigest=identity;
  const originalJournal=recoveryScalarArrayJSON([s.executionOperationId,'reserve',s.executionNonce,cut.floor,identity,p.originalCreatedAt,p.originalExpiresAt,'reserved',null,null]);
  s.phase='reserving';const reserved=await installationRPC(s,'/v1/reserve',installationText(['operationId','nonce','createdAt','expiresAt','requestDigest','originalFloor'],[s.executionOperationId,s.executionNonce,p.originalCreatedAt,p.originalExpiresAt,identity,cut.floor]));installationCurrent(s);
  if(data(reserved,'journal')!==originalJournal)return held('original_install_reservation_mismatch');s.originalJournal=originalJournal;s.phase='reserved';
  // The durable exact Floor row exists before dispatch. No automatic reserve or Native retry exists.
  s.phase='native-dispatched';const executeReturn=await installationBounded(s,async boundary=>{installationCurrent(s);boundary();const value=await executeWholeNativeMigration(p.migration);installationCurrent(s);boundary();return value;});installationCurrent(s);
  s.phase='readback';const observeReturn=await installationBounded(s,async boundary=>{installationCurrent(s);boundary();const value=await observeWholeNativeMigration(p.migration);installationCurrent(s);boundary();return value;});installationCurrent(s);
  const observation=await getOwnedWholeNativeMigrationObservation(p.migration,executeReturn,observeReturn);installationCurrent(s);assertOwnedWholeNativeMigrationObservation(observation);
  if(observation.operationId!==p.operationId||observation.layout!==p.layout||observation.sourceKind!==p.sourceKind||observation.originalEpoch!==p.originalEpoch||observation.nextEpoch!==p.nextEpoch
   ||observation.migrationFinishedAt<p.originalCreatedAt||observation.readbackObservedAt>=p.originalExpiresAt)return held('original_install_native_lineage');
  s.nativeObservation=observation;
  // The public predecessor retains NULL; no current Floor epoch is substituted into this wire.
  const migrationReceipt=recoveryScalarArrayJSON(['closed-profile-migration-v2',cut.floor,cut.gate,p.operationId,observation.operationId,observation.createdAt,observation.expiresAt,p.sourceKind,p.originalEpoch,p.nextEpoch,p.layout,observation.originalProfileDigest64,observation.targetProfileDigest64,observation.nativeResultDigest64,observation.readbackDigest64,observation.migrationFinishedAt,observation.readbackObservedAt]);
  s.migrationReceipt=migrationReceipt;const resultDigest=await recoveryScalarArraySha256(['private-original-installation-complete-v1',originalJournal,migrationReceipt]);installationCurrent(s);
  s.phase='committing';const reservedCompletion=await installationRPC(s,'/v1/completion-reserve',installationText(['originalJournal','result','resultDigest','priorAttempt'],[originalJournal,'complete',resultDigest,null]));installationCurrent(s);
  const originalAttempt=recoveryScalarArrayJSON([s.executionOperationId,0,originalJournal,'complete',resultDigest,'reserved',null]);
  if(data(reservedCompletion,'journal')!==originalJournal||data(reservedCompletion,'attempt')!==originalAttempt)return held('original_install_completion_reservation_mismatch');s.originalAttempt=originalAttempt;
  const committed=await installationRPC(s,'/v1/complete',installationText(['originalAttempt'],[originalAttempt]));installationCurrent(s);
  const attempt=installJournalTuple(data(committed,'attempt'),7),journal=installJournalTuple(data(committed,'journal'),10),finished=attempt[6];
  if(attempt.slice(0,5).some((v,i)=>v!==[s.executionOperationId,0,originalJournal,'complete',resultDigest][i])||attempt[5]!=='complete'
   ||typeof finished!=='number'||!Number.isSafeInteger(finished)||finished<observation.readbackObservedAt||finished>=p.originalExpiresAt
   ||journal.slice(0,7).some((v,i)=>v!==[s.executionOperationId,'reserve',s.executionNonce,cut.floor,identity,p.originalCreatedAt,p.originalExpiresAt][i])||journal[7]!=='complete'||journal[8]!==resultDigest||journal[9]!==finished)return held('original_install_completion_unconfirmed');
  s.completionJournal=data(committed,'journal') as string;s.phase='complete';const result=Object.freeze({}) as OriginalPrivateInstallation;privateInstallationResults.set(result,s);assertOriginalPrivateInstallation(result);return result;
 }catch(error){s.phase='unknown';throw error;}
}
export function assertOriginalPrivateInstallation(result:OriginalPrivateInstallation):void{
 const s=privateInstallationResults.get(result);if(!s||s.phase!=='complete'||!s.nativeObservation||!s.migrationReceipt||!s.completionJournal)return held('foreign_or_unknown_installation');installationCurrent(s);
}
/** Safe data projection of the actual confirmed source chain, never a caller reconstruction or opener. */
export function originalPrivateInstallationFacts(result:OriginalPrivateInstallation):Readonly<{
 operationId:string;executionOperationId:string;migrationReceipt:string;independentCompletionJournal:string;originalCreatedAt:number;originalExpiresAt:number;
 nativeMigrationCommitted:true;nativeReadbackConfirmed:true;independentCompletionConfirmed:true;productionInstallationQualified:false;providerDrainQualified:false;replayQualified:false;readyToReopen:false;
}>{
 assertOriginalPrivateInstallation(result);const s=privateInstallationResults.get(result)!,p=installPlans.get(s.plan)!;
 return Object.freeze({operationId:p.operationId,executionOperationId:s.executionOperationId,migrationReceipt:s.migrationReceipt!,independentCompletionJournal:s.completionJournal!,originalCreatedAt:p.originalCreatedAt,originalExpiresAt:p.originalExpiresAt,
 nativeMigrationCommitted:true as const,nativeReadbackConfirmed:true as const,independentCompletionConfirmed:true as const,productionInstallationQualified:false as const,providerDrainQualified:false as const,replayQualified:false as const,readyToReopen:false as const});
}

export function assertOriginalPrivateInstallationCut(result:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,env?:object):void{
 assertOriginalPrivateInstallation(result);const s=privateInstallationResults.get(result)!,p=installationCurrent(s);
 if(p.cut!==cut||env!==undefined&&current(p.handle,true).env!==env)return held('foreign_installation_cut_or_env');
 originalPrivateControlCutCustody(cut);installationCurrent(s);
}
declare const closedReplayPlanBrand:unique symbol,closedReplaySelectionBrand:unique symbol,privateReplayResultBrand:unique symbol;
export type OriginalPrivateRecoveryReplayPlan=Readonly<{[closedReplayPlanBrand]:true}>;
export type OriginalClosedRecoveryReplaySelection=Readonly<{[closedReplaySelectionBrand]:true}>;
export type OriginalPrivateRecoveryReplayResult=Readonly<{[privateReplayResultBrand]:true}>;
export type OriginalClosedCleanupStep=Readonly<{sql:string;values:readonly (string|number)[]}>;
type ReplayState={sourceKind:'closed_native_source'|'private_export'|'time_travel';resourceKey:string;installation:OriginalPrivateInstallation;cut:OriginalPrivateControlCut;source:OriginalAcceptedRecoverySource;rpc:InstallationState;copy:string;completedCopy:string|null;replayCompletedAt:number|null;journal:string;companion:string;page:OriginalClosedRecoveryCandidatePage;index:number;subject:string;generation:string;accountIncarnation:string|null;markerKey:string|null;markerState:'active'|'none'|'expired';originalRejectedAt:number|null;markerRetainUntil:number|null;erasedAt:number;retainUntil:number;plans:readonly OriginalClosedCleanupStep[];phase:'prepared'|'reserving'|'reserved'|'native-dispatched'|'committing'|'complete'|'unknown';originalJournal:string|null;check:()=>void;native:OriginalClosedRecoveryErasureResult|null;retired:OriginalClosedRecoveryRetiredProof|null};
type EmptyReplayState=Pick<ReplayState,'sourceKind'|'resourceKey'|'installation'|'cut'|'source'|'rpc'|'copy'|'completedCopy'|'replayCompletedAt'|'phase'|'originalJournal'|'check'> & {page:OriginalClosedRecoveryCandidatePage};
const emptyPrivateRecoveryReplayPlans=new WeakMap<OriginalPrivateRecoveryReplayPlan,EmptyReplayState>();
type MultiReplayState=Pick<ReplayState,'sourceKind'|'resourceKey'|'installation'|'cut'|'source'|'rpc'|'copy'|'completedCopy'|'replayCompletedAt'|'phase'|'originalJournal'|'check'>&{records:readonly OriginalPrivateRecoveryReplayPlan[]};
const multiPrivateRecoveryReplayPlans=new WeakMap<OriginalPrivateRecoveryReplayPlan,MultiReplayState>();
const privateRecoveryReplayPlans=new WeakMap<OriginalPrivateRecoveryReplayPlan,ReplayState>(),closedReplaySelections=new WeakMap<OriginalClosedRecoveryReplaySelection,ReplayState>(),privateRecoveryReplayResults=new WeakMap<OriginalPrivateRecoveryReplayResult,ReplayState|EmptyReplayState|MultiReplayState>(),privateRecoveryReplayCaptureSpent=new WeakSet<OriginalPrivateInstallation>();
/** Only a SAME source-owned installation/cut/Native/source8 chain can reach the privileged replay reader. */
export function assertOriginalPrivateReplayMigration(cap:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource):void{
 const s=privateInstallationResults.get(installation);if(!s)return held('foreign_replay_installation');const p=installPlans.get(s.plan);if(!p)return held('foreign_replay_plan');assertOriginalPrivateInstallationCut(installation,cut,current(p.handle,true).env);if(p.migration!==cap)return held('foreign_replay_native');
 assertOriginalAcceptedRecoverySource(source,installation,cut);const f=originalAcceptedRecoverySourceFacts(source,installation,cut),a=installJournalTuple(f.acceptedSourceReceipt,8);if(a[2]!==s.nativeObservation!.targetProfileDigest64||a[6]!==p.nextEpoch||f.profileDigest64!==a[2])return held('foreign_replay_source_profile');
}
function replayCurrent(s:ReplayState|EmptyReplayState|MultiReplayState):InstallPlanState{if(s.phase==='unknown')return held('original_replay_unknown');const p=installationCurrent(s.rpc);assertOriginalPrivateInstallationCut(s.installation,s.cut,current(p.handle,true).env);assertOriginalPrivateReplayMigration(p.migration,s.installation,s.cut,s.source);s.check();return p;}
/** Safe original HMAC inputs are private source literals/Native fields; no signer or key escapes. */
async function privateReplayHmac(rpc:InstallationState,keyText:string,input:string):Promise<string>{
 installationCurrent(rpc);const key=await Reflect.apply(installationImport.fn,installationImport.receiver,['raw',recoveryDataUtf8Bytes(keyText),{name:'HMAC',hash:'SHA-256'},false,['sign']]);installationCurrent(rpc);
 const out=await Reflect.apply(installationSign.fn,installationSign.receiver,['HMAC',key,recoveryDataUtf8Bytes(input)]);installationCurrent(rpc);
 if(!out||typeof out!=='object'||Object.getPrototypeOf(out)!==installationBufferPrototype.value||Reflect.ownKeys(out).length||Reflect.apply(installationBufferLength.value!.get!,out,[])!==32)return held('original_replay_hmac');
 const bytes=Reflect.construct(installationBytes.value as Function,[out]) as Uint8Array;let value='';for(let i=0;i<32;i++)value+=bytes[i]!.toString(16).padStart(2,'0');installationCurrent(rpc);return value;
}
async function originalReplaySuppressionRPC(rpc:InstallationState,path:'/v1/suppression/capture-copy'|'/v1/suppression/copy-page'|'/v3/suppression/resolve-original'|'/v1/suppression/replay-ack',raw:string,receiptProof:string|null=null):Promise<object>{
 return installationBounded(rpc,async check=>{const p=installationCurrent(rpc),o=current(p.handle,true),secret=data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string;
  const proof=await privateReplayHmac(rpc,secret,recoveryScalarArrayJSON(['independent-suppression-operator-v1','POST',path,raw]));installationCurrent(rpc);check();
  const headers:Record<string,string>={'Content-Type':'application/json','X-Olympus-Suppression-Proof':proof};if(receiptProof!==null)headers['X-Olympus-Suppression-Receipt-Proof']=receiptProof;
  const request=Reflect.construct(installationRequest.value as Function,['https://privacy-recovery-floor.invalid'+path,{method:'POST',headers,body:raw}]) as Request;checkOriginalNativeRequest(request);sameMethod(o.recoveryFetch);
  const response=await Reflect.apply(o.recoveryFetch.fn,o.recoveryFetch.receiver,[request]) as Response;installationCurrent(rpc);check();sameMethod(o.recoveryFetch);checkOriginalNativeResponse(response);if(Reflect.apply(RESPONSE.status!.get!,response,[])!==200)return held('original_replay_independent_held');
  const text=await originalNativeText(response,'response',Math.min(originalRecoveryClockMilliseconds()+5000,p.originalExpiresAt*1000),()=>{installationCurrent(rpc);check();checkOriginalNativeResponse(response);},path==='/v1/suppression/copy-page'?262144:8192),value=recoveryParseDataJSON(text);installationCurrent(rpc);check();
  if(!value||typeof value!=='object'||Array.isArray(value)||['allCopiesErased','physicalRecoveryCopiesErased','providerUnknownResolved','unmanagedOldVersionsQualified','readyToReopen'].some(k=>data(value,k)!==false))return held('original_replay_independent_shape');return value;
 });
}
/** Bounded replay of one original closed Native source. All authenticated journal pages and original
 * Native selections are captured before effects. This is not a physical-copy resource qualifier. */
export async function captureOriginalPrivateRecoveryReplay(installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,artifact?:OriginalAcceptedRecoveryArtifact):Promise<OriginalPrivateRecoveryReplayPlan>{
 const installed=privateInstallationResults.get(installation);if(!installed)return held('foreign_replay_installation');const p=installPlans.get(installed.plan);if(!p)return held('foreign_replay_plan');const o=current(p.handle,true);assertOriginalPrivateInstallationCut(installation,cut,o.env);if(privateRecoveryReplayCaptureSpent.has(installation))return held('original_replay_capture_spent');assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);
 const artifactFacts=artifact?originalAcceptedRecoveryArtifactFacts(artifact,source,installation,cut):null;
 const secretCheck=()=>{installationIntrinsics();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);artifactFacts?.check();};secretCheck();
 privateRecoveryReplayCaptureSpent.add(installation);const sf=originalAcceptedRecoverySourceFacts(source,installation,cut),receipt=installJournalTuple(sf.acceptedSourceReceipt,8),custody=originalPrivateControlCutCustody(cut),control=installJournalTuple(custody.suppressionControl,5);
 const sourceKind=artifactFacts?.copyKind??'closed_native_source',copyDigest=artifactFacts?.copyDigest??receipt[7] as string,copyCreatedAt=artifactFacts?.copyCreatedAt??sf.profileObservedAt;
 const resourceKey=artifactFacts?.sourceIncarnationKey??await recoveryScalarArraySha256(['original-current-native-source-incarnation-v1',RECOVERY_FLOOR_TARGET.account,RECOVERY_FLOOR_TARGET.database,RECOVERY_FLOOR_TARGET.worker,p.nextEpoch,custody.floor,custody.gate]);secretCheck();
 const identity=await recoveryScalarArraySha256(['source-owned-closed-native-recovery-v1',custody.floor,custody.gate,sf.acceptedSourceReceipt,p.originalCreatedAt,p.originalExpiresAt,resourceKey]);secretCheck();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);
 const rpc:InstallationState={plan:installed.plan,phase:'prepared',executionOperationId:identity.slice(0,32),executionNonce:identity.slice(32),requestDigest:identity,originalJournal:null,originalAttempt:null,nativeObservation:null,migrationReceipt:null,completionJournal:null};installationCurrent(rpc);
 try{
  // Digest names this genuine accepted closed Native source, not bytes of a claimed physical backup/export.
  const value=await originalReplaySuppressionRPC(rpc,'/v1/suppression/capture-copy',installationText(['operationId','nonce','requestDigest','createdAt','expiresAt','originalFloor','originalGate','copyKind','copyDigest','copyCreatedAt','expectedActionSequence'],[rpc.executionOperationId,rpc.executionNonce,identity,p.originalCreatedAt,p.originalExpiresAt,custody.floor,custody.gate,sourceKind,copyDigest,copyCreatedAt,control[3] as number]));
  const copyRaw=data(value,'copy'),copy=installJournalTuple(copyRaw,17);if(data(value,'scope')!=='independent_original_copy_suppression_capture'||copy[0]!==rpc.executionOperationId||copy[3]!==custody.floor||copy[4]!==custody.gate||copy[5]!==sourceKind||copy[6]!==copyDigest||copy[7]!==copyCreatedAt||copy[8]!==p.originalCreatedAt||copy[9]!==p.originalExpiresAt||copy[10]!==control[3]||typeof copy[11]!=='number'||!Number.isSafeInteger(copy[11])||copy[11]<0||copy[11]>1000||copy[13]!=='captured')return held('original_replay_bounded_record_count_required');
  const records:unknown[]=[],companions:unknown[]=[];let reserveAfter=0;
  for(let pageIndex=0;pageIndex<10;pageIndex++){
   const page=await originalReplaySuppressionRPC(rpc,'/v1/suppression/copy-page',installationText(['originalCopy','afterReserveSequence'],[copyRaw as string,reserveAfter]));secretCheck();
   const rows=data(page,'records'),facts=data(page,'companions');if(data(page,'scope')!=='independent_original_copy_suppression_page'||data(page,'copy')!==copyRaw||data(page,'afterReserveSequence')!==reserveAfter||!Array.isArray(rows)||rows.length>100||!Array.isArray(facts)||facts.length!==rows.length||records.length+rows.length>copy[11])return held('original_replay_original_page_required');
   for(let i=0;i<rows.length;i++){const j=installJournalTuple(rows[i],16);if(typeof j[9]!=='number'||!Number.isSafeInteger(j[9])||j[9]<=reserveAfter)return held('original_replay_page_order');reserveAfter=j[9];records.push(rows[i]);companions.push(facts[i]);}
   if(records.length===copy[11])break;if(rows.length!==100)return held('original_replay_incomplete_original_page');
  }
  if(records.length!==copy[11])return held('original_replay_incomplete_original_page');
  const originalJournalDigest=await recoveryScalarArraySha256([records,companions]);secretCheck();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);if(originalJournalDigest!==copy[12])return held('original_replay_original_page_digest');
  if(copy[11]===0){
   const nativePage=await captureOriginalClosedRecoveryCandidatePage(p.migration,installation,cut,source,''),f=originalClosedRecoveryCandidatePageFacts(nativePage,p.migration);secretCheck();f.check();
   if(f.observedAt<sf.profileObservedAt||f.observedAt>=p.originalExpiresAt)return held('original_empty_replay_native_clock');
   const check=()=>{secretCheck();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);f.check();};check();
   const state:EmptyReplayState={sourceKind,resourceKey,installation,cut,source,rpc,copy:copyRaw as string,completedCopy:null,replayCompletedAt:null,page:nativePage,phase:'prepared',originalJournal:null,check};replayCurrent(state);
   const out=Object.freeze({}) as OriginalPrivateRecoveryReplayPlan;emptyPrivateRecoveryReplayPlans.set(out,state);return out;
  }
  const selected:OriginalPrivateRecoveryReplayPlan[]=[],subjects=new Set<string>();
  for(let i=0;i<records.length;i++){
   const j=installJournalTuple(records[i],16),key=recoveryScalarArrayJSON([j[1],j[2]]);if(subjects.has(key))return held('original_replay_ambiguous_duplicate_generation');subjects.add(key);
   const recordRPC:InstallationState={plan:installed.plan,phase:'prepared',executionOperationId:rpc.executionOperationId,executionNonce:rpc.executionNonce,requestDigest:rpc.requestDigest,originalJournal:null,originalAttempt:null,nativeObservation:null,migrationReceipt:null,completionJournal:null};
   const record=await captureOriginalPrivateReplayRecord(installation,cut,source,recordRPC,copyRaw as string,records[i],companions[i],sourceKind,resourceKey,secretCheck);secretCheck();selected.push(record);
  }
  if(selected.length===1)return selected[0]!;
  const check=()=>{secretCheck();for(const plan of selected){const r=privateRecoveryReplayPlans.get(plan);if(!r)return held('original_replay_record_missing');replayCurrent(r);}};check();
  const state:MultiReplayState={sourceKind,resourceKey,installation,cut,source,rpc,copy:copyRaw as string,completedCopy:null,replayCompletedAt:null,phase:'prepared',originalJournal:null,check,records:Object.freeze(selected)};
  const out=Object.freeze({}) as OriginalPrivateRecoveryReplayPlan;multiPrivateRecoveryReplayPlans.set(out,state);return out;
 }catch(error){rpc.phase='unknown';throw error;}
}

/** Every independent row is resolved before any replay effect. No caller row/clock can issue a selection. */
async function captureOriginalPrivateReplayRecord(installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,rpc:InstallationState,copyRaw:string,journalRaw:unknown,companionRaw:unknown,sourceKind:'closed_native_source'|'private_export'|'time_travel',resourceKey:string,secretCheck:()=>void):Promise<OriginalPrivateRecoveryReplayPlan>{
 const p=installationCurrent(rpc),o=current(p.handle,true);
  const j=installJournalTuple(journalRaw,16),c=installJournalTuple(companionRaw,11);if(j[10]!=='committed'||c[0]!==j[0]||c[8]!=='committed'||c[9]!==j[11]||c[10]!==j[13]||!hex(j[0],32)||!hex(j[1],64)||!hex(j[2],32)||!hex(j[11],64)||typeof j[12]!=='number'||!Number.isSafeInteger(j[12])||j[13]!==j[12]+31622400||!['site','absence'].includes(c[2] as string)||!hex(c[3],64)||!['active','none','expired'].includes(c[4] as string))return held('original_replay_companion_required');
  const operator=data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string;let after='',matched:{page:OriginalClosedRecoveryCandidatePage;index:number;subject:string;n:string|null;g:string|null;markerKey:string|null;retired:OriginalClosedRecoveryRetiredProof|null}|null=null;
  for(let pageNumber=0;pageNumber<100&&!matched;pageNumber++){
   secretCheck();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);const nativePage=await captureOriginalClosedRecoveryCandidatePage(p.migration,installation,cut,source,after),f=originalClosedRecoveryCandidatePageFacts(nativePage,p.migration);secretCheck();f.check();
   for(let index=0;index<f.rows.length;index++){const row=f.rows[index]!,key=await privateReplayHmac(rpc,operator,recoveryScalarArrayJSON(['independent-suppression-pseudo-subject-v1',row.subject]));secretCheck();f.check();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);if(key!==j[1])continue;
    if(row.generation!==null&&row.generation!==j[2])return held('original_replay_new_generation');
    const retired=row.accountIncarnation===null&&row.generation===j[2]&&row.state==='retired'?await captureOriginalClosedRecoveryRetiredProof(p.migration,installation,cut,source,nativePage,index,journalRaw as string):null;secretCheck();f.check();
    const retiredFacts=retired?originalClosedRecoveryRetiredProofFacts(retired,p.migration,nativePage,journalRaw as string):null;retiredFacts?.check();
    const nativeDigest=retiredFacts?.digest??null,originalBirth=retiredFacts?retiredFacts.originalBirth:row.accountIncarnation;
    const receiptProof=retiredFacts?await privateReplayHmac(rpc,operator,recoveryScalarArrayJSON(['original-closed-retired-native-proof-v1',copyRaw,journalRaw,companionRaw,row.subject,row.generation,nativeDigest,p.nextEpoch])):null;secretCheck();f.check();retiredFacts?.check();
    const resolved=await originalReplaySuppressionRPC(rpc,'/v3/suppression/resolve-original',installationText(['originalCopy','originalJournal','originalCompanion','subject','originalBirth','currentGeneration','retiredNativeDigest'],[copyRaw as string,journalRaw as string,companionRaw as string,row.subject,originalBirth,row.generation,nativeDigest]),receiptProof);secretCheck();f.check();retiredFacts?.check();
    if(data(resolved,'scope')!=='independent_original_recovery_birth_matched'||data(resolved,'copy')!==copyRaw||data(resolved,'journal')!==journalRaw||data(resolved,'companion')!==companionRaw)return held('original_replay_native_birth_unmatched');
    const markerKey=data(resolved,'markerKey');if(c[4]==='active'?(typeof markerKey!=='string'||markerKey.length!==43||/[^A-Za-z0-9_-]/.test(markerKey)):markerKey!==null)return held('original_replay_original_marker_key_required');
    matched={page:nativePage,index,subject:row.subject,n:row.accountIncarnation,g:row.generation,markerKey:markerKey as string|null,retired};break;
   }
   if(f.rows.length<1000)break;after=f.rows[f.rows.length-1]!.subject;
  }
  if(!matched)return held('original_replay_native_birth_unknown');const f=originalClosedRecoveryCandidatePageFacts(matched.page,p.migration);
  const check=()=>{secretCheck();assertOriginalPrivateReplayMigration(p.migration,installation,cut,source);f.check();if(matched!.retired)originalClosedRecoveryRetiredProofFacts(matched!.retired,p.migration,matched!.page,journalRaw as string).check();};check();
  const state:ReplayState={sourceKind,resourceKey,installation,cut,source,rpc,copy:copyRaw as string,completedCopy:null,replayCompletedAt:null,journal:journalRaw as string,companion:companionRaw as string,page:matched.page,index:matched.index,subject:matched.subject,generation:j[2] as string,accountIncarnation:matched.n,markerKey:matched.markerKey,markerState:c[4] as 'active'|'none'|'expired',originalRejectedAt:c[6] as number|null,markerRetainUntil:c[7] as number|null,erasedAt:j[12] as number,retainUntil:j[13] as number,plans:Object.freeze([]),phase:'prepared',originalJournal:null,check,native:null,retired:matched.retired};
  const selection=Object.freeze({}) as OriginalClosedRecoveryReplaySelection;closedReplaySelections.set(selection,state);
  state.plans=originalClosedRecoveryCleanupPlans(o.env as unknown as Env,selection);replayCurrent(state);
  const out=Object.freeze({}) as OriginalPrivateRecoveryReplayPlan;privateRecoveryReplayPlans.set(out,state);privateReplaySelectionByPlan.set(out,selection);return out;
}

/** Data-only projection from the actual Native page + independently matched row. No prepared methods/env/key escapes. */
export function originalClosedRecoveryCleanupAccount(selection:OriginalClosedRecoveryReplaySelection,env:Env):Readonly<{subject:string;generation:string;markerKey:string|null;markerState:'active'|'none'|'expired';originalRejectedAt:number|null;markerRetainUntil:number|null;check:()=>void}>{const s=closedReplaySelections.get(selection);if(!s)return held('foreign_closed_replay_selection');const p=replayCurrent(s);if(current(p.handle,true).env!==env)return held('foreign_closed_replay_cleanup_env');return Object.freeze({subject:s.subject,generation:s.generation,markerKey:s.markerKey,markerState:s.markerState,originalRejectedAt:s.originalRejectedAt,markerRetainUntil:s.markerRetainUntil,check:()=>{replayCurrent(s);}});}
export function consumeOriginalClosedRecoveryReplaySelection(selection:OriginalClosedRecoveryReplaySelection,cap:WholeMigrationCapability):Readonly<{subject:string;generation:string;operationId:string;accountIncarnation:string|null;markerKey:string|null;markerState:'active'|'none'|'expired';originalRejectedAt:number|null;markerRetainUntil:number|null;originalControl:string;originalCreatedAt:number;originalExpiresAt:number;erasedAt:number;retainUntil:number;plans:readonly OriginalClosedCleanupStep[];check:()=>void}>{
 const s=closedReplaySelections.get(selection);if(!s||s.phase!=='reserved'||!s.originalJournal)return held('foreign_or_unreserved_closed_replay_selection');const p=replayCurrent(s);if(p.migration!==cap)return held('foreign_closed_replay_native');s.phase='native-dispatched';
 const page=originalClosedRecoveryCandidatePageFacts(s.page,cap),row=page.rows[s.index]!;if(row.subject!==s.subject||row.accountIncarnation!==s.accountIncarnation||row.generation!==null&&row.generation!==s.generation)return held('original_closed_replay_candidate_changed');
 return Object.freeze({subject:s.subject,generation:s.generation,operationId:installJournalTuple(s.journal,16)[0] as string,accountIncarnation:s.accountIncarnation,markerKey:s.markerKey,markerState:s.markerState,originalRejectedAt:s.originalRejectedAt,markerRetainUntil:s.markerRetainUntil,originalControl:row.originalControl,originalCreatedAt:p.originalCreatedAt,originalExpiresAt:p.originalExpiresAt,erasedAt:s.erasedAt,retainUntil:s.retainUntil,plans:s.plans,check:()=>{replayCurrent(s);}});
}
/** Durable independent spend precedes the single Native cleanup. Lost reserve/Native/readback/ACK stays unknown. */
export async function executeOriginalPrivateRecoveryReplay(plan:OriginalPrivateRecoveryReplayPlan):Promise<OriginalPrivateRecoveryReplayResult>{
 const multi=multiPrivateRecoveryReplayPlans.get(plan);if(multi)return executeOriginalPrivateMultiRecoveryReplay(multi);
 return executeOriginalPrivateRecoveryRecord(plan,false);
}
async function executeOriginalPrivateRecoveryRecord(plan:OriginalPrivateRecoveryReplayPlan,deferCopyACK:boolean):Promise<OriginalPrivateRecoveryReplayResult>{
 const empty=emptyPrivateRecoveryReplayPlans.get(plan);if(empty)return executeOriginalPrivateEmptyRecoveryReplay(empty);
 const s=privateRecoveryReplayPlans.get(plan);if(!s||s.phase!=='prepared')return held('original_private_replay_spent');const p=replayCurrent(s);s.phase='reserving';
 try{
  const originalCommit=installJournalTuple(s.journal,16);
  // CURRENT Native source incarnation is the actual persisted post-fence epoch under this exact
  // target/F/G. Fresh receipt, copy, observation or operation IDs cannot rename that incarnation.
  const custody=originalPrivateControlCutCustody(s.cut);
  const identity=await recoveryScalarArraySha256(['private-original-closed-replay-resource-v2',RECOVERY_FLOOR_TARGET.account,RECOVERY_FLOOR_TARGET.database,RECOVERY_FLOOR_TARGET.worker,s.resourceKey,originalCommit[0],originalCommit[1],originalCommit[2],originalCommit[4],originalCommit[11],originalCommit[12],originalCommit[13]]);replayCurrent(s);
  s.rpc.executionOperationId=identity.slice(0,32);s.rpc.executionNonce=identity.slice(32);s.rpc.requestDigest=identity;
  const F=originalPrivateControlCutCustody(s.cut).floor,originalJournal=recoveryScalarArrayJSON([s.rpc.executionOperationId,'reserve',s.rpc.executionNonce,F,identity,p.originalCreatedAt,p.originalExpiresAt,'reserved',null,null]);
  const reserved=await installationRPC(s.rpc,'/v1/reserve',installationText(['operationId','nonce','createdAt','expiresAt','requestDigest','originalFloor'],[s.rpc.executionOperationId,s.rpc.executionNonce,p.originalCreatedAt,p.originalExpiresAt,identity,F]));replayCurrent(s);if(data(reserved,'journal')!==originalJournal)return held('original_replay_reserve_mismatch');s.originalJournal=originalJournal;s.phase='reserved';
  // The exact original selection is retained privately with this plan.
  const owned=privateReplaySelectionByPlan.get(plan);if(!owned)return held('original_replay_selection_missing');
  const native=s.retired?await confirmOriginalClosedRecoveryRetiredSelection(p.migration,owned,s.retired):await executeOriginalClosedRecoveryErasure(p.migration,owned);replayCurrent(s);s.native=native;const result=originalClosedRecoveryErasureResultFacts(native,owned);
  s.phase='committing';const nativeReplayDigest=await recoveryScalarArraySha256(['private-original-closed-replay-native-v1',s.copy,s.journal,s.companion,result.nativeDigest]),readbackDigest=result.readbackDigest;replayCurrent(s);
  if(!deferCopyACK){
  const secret=data(current(p.handle,true).env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string,proof=await privateReplayHmac(s.rpc,secret,recoveryScalarArrayJSON(['independent-suppression-original-replay-readback-v1',s.copy,nativeReplayDigest,readbackDigest]));replayCurrent(s);
  const committed=await originalReplaySuppressionRPC(s.rpc,'/v1/suppression/replay-ack',installationText(['originalCopy','nativeReplayDigest','readbackDigest'],[s.copy,nativeReplayDigest,readbackDigest]),proof);replayCurrent(s);
  const copy=installJournalTuple(data(committed,'copy'),17),old=installJournalTuple(s.copy,17);if(data(committed,'scope')!=='independent_original_copy_replay_readback_ack'||copy.slice(0,13).some((v,i)=>v!==old[i])||copy[13]!=='replayed'||copy[14]!==nativeReplayDigest||copy[15]!==readbackDigest||typeof copy[16]!=='number'||!Number.isSafeInteger(copy[16])||copy[16]<result.observedAt||copy[16]>=p.originalExpiresAt)return held('original_replay_ack_unknown');s.completedCopy=data(committed,'copy') as string;
  }
  const digest=await recoveryScalarArraySha256(['private-original-closed-replay-complete-v1',s.completedCopy??s.copy,result.nativeDigest,readbackDigest]);replayCurrent(s);
  const reservedCompletion=await installationRPC(s.rpc,'/v1/completion-reserve',installationText(['originalJournal','result','resultDigest','priorAttempt'],[originalJournal,'complete',digest,null]));replayCurrent(s);
  const attempt=recoveryScalarArrayJSON([s.rpc.executionOperationId,0,originalJournal,'complete',digest,'reserved',null]);if(data(reservedCompletion,'attempt')!==attempt||data(reservedCompletion,'journal')!==originalJournal)return held('original_replay_completion_reserve_unknown');
  const finished=await installationRPC(s.rpc,'/v1/complete',installationText(['originalAttempt'],[attempt]));replayCurrent(s);const completed=installJournalTuple(data(finished,'journal'),10);if(completed.slice(0,7).some((v,i)=>v!==installJournalTuple(originalJournal,10)[i])||completed[7]!=='complete'||completed[8]!==digest||typeof completed[9]!=='number'||!Number.isSafeInteger(completed[9])||completed[9]<result.observedAt||completed[9]>=p.originalExpiresAt)return held('original_replay_completion_unknown');s.replayCompletedAt=completed[9] as number;
  s.phase='complete';const handle=Object.freeze({}) as OriginalPrivateRecoveryReplayResult;privateRecoveryReplayResults.set(handle,s);return handle;
 }catch(error){s.phase='unknown';s.rpc.phase='unknown';throw error;}
}
const privateReplaySelectionByPlan=new WeakMap<OriginalPrivateRecoveryReplayPlan,OriginalClosedRecoveryReplaySelection>();
/** Serial original history. Every row was captured/resolved before effects; copy ACK follows ALL
 * per-resource Native results and independent completions. Any unknown stops without a second effect. */
async function executeOriginalPrivateMultiRecoveryReplay(s:MultiReplayState):Promise<OriginalPrivateRecoveryReplayResult>{
 if(s.phase!=='prepared'||s.records.length<2||s.records.length>1000)return held('original_multi_replay_spent');const p=replayCurrent(s);s.phase='reserving';
 try{
  const nativeRows:unknown[][]=[],readRows:unknown[][]=[];let observedAt=0;
  for(const plan of s.records){
   replayCurrent(s);const handle=await executeOriginalPrivateRecoveryRecord(plan,true);replayCurrent(s);
   const record=privateRecoveryReplayResults.get(handle);if(!record||!('journal'in record)||record.phase!=='complete'||record.copy!==s.copy||record.installation!==s.installation||record.cut!==s.cut||record.source!==s.source||!record.native||record.replayCompletedAt===null)return held('original_multi_replay_record_unknown');
   const selection=privateReplaySelectionByPlan.get(plan);if(!selection)return held('original_multi_replay_selection_missing');const f=originalClosedRecoveryErasureResultFacts(record.native,selection);replayCurrent(record);
   if(record.replayCompletedAt<f.observedAt||record.replayCompletedAt>=p.originalExpiresAt)return held('original_multi_replay_completion_clock');
   observedAt=Math.max(observedAt,record.replayCompletedAt);nativeRows.push([record.journal,record.companion,f.nativeDigest]);readRows.push([record.journal,f.readbackDigest]);
  }
  s.phase='committing';const nativeDigest=await recoveryScalarArraySha256(['private-original-multi-closed-native-v1',s.copy,nativeRows]),readbackDigest=await recoveryScalarArraySha256(['private-original-multi-closed-readback-v1',s.copy,readRows]);replayCurrent(s);
  const secret=data(current(p.handle,true).env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string,proof=await privateReplayHmac(s.rpc,secret,recoveryScalarArrayJSON(['independent-suppression-original-replay-readback-v1',s.copy,nativeDigest,readbackDigest]));replayCurrent(s);
  const committed=await originalReplaySuppressionRPC(s.rpc,'/v1/suppression/replay-ack',installationText(['originalCopy','nativeReplayDigest','readbackDigest'],[s.copy,nativeDigest,readbackDigest]),proof);replayCurrent(s);
  const raw=data(committed,'copy'),copy=installJournalTuple(raw,17),old=installJournalTuple(s.copy,17);
  if(data(committed,'scope')!=='independent_original_copy_replay_readback_ack'||copy.slice(0,13).some((v,i)=>v!==old[i])||copy[11]!==s.records.length||copy[13]!=='replayed'||copy[14]!==nativeDigest||copy[15]!==readbackDigest||typeof copy[16]!=='number'||!Number.isSafeInteger(copy[16])||copy[16]<observedAt||copy[16]>=p.originalExpiresAt)return held('original_multi_replay_ack_unknown');
  s.completedCopy=raw as string;s.replayCompletedAt=copy[16];s.phase='complete';const out=Object.freeze({}) as OriginalPrivateRecoveryReplayResult;privateRecoveryReplayResults.set(out,s);return out;
 }catch(error){s.phase='unknown';s.rpc.phase='unknown';throw error;}
}

/** Empty journal still needs durable spend, an actual current Native closed readback, independent ACK and completion. */
async function executeOriginalPrivateEmptyRecoveryReplay(s:EmptyReplayState):Promise<OriginalPrivateRecoveryReplayResult>{
 if(s.phase!=='prepared')return held('original_private_replay_spent');const p=replayCurrent(s);s.phase='reserving';
 try{
  const sf=originalAcceptedRecoverySourceFacts(s.source,s.installation,s.cut),before=originalClosedRecoveryCandidatePageFacts(s.page,p.migration);
  const identity=await recoveryScalarArraySha256(['private-original-empty-closed-replay-resource-v1',s.copy,sf.acceptedSourceReceipt]);replayCurrent(s);
  s.rpc.executionOperationId=identity.slice(0,32);s.rpc.executionNonce=identity.slice(32);s.rpc.requestDigest=identity;
  const F=originalPrivateControlCutCustody(s.cut).floor,originalJournal=recoveryScalarArrayJSON([s.rpc.executionOperationId,'reserve',s.rpc.executionNonce,F,identity,p.originalCreatedAt,p.originalExpiresAt,'reserved',null,null]);
  const reserved=await installationRPC(s.rpc,'/v1/reserve',installationText(['operationId','nonce','createdAt','expiresAt','requestDigest','originalFloor'],[s.rpc.executionOperationId,s.rpc.executionNonce,p.originalCreatedAt,p.originalExpiresAt,identity,F]));replayCurrent(s);if(data(reserved,'journal')!==originalJournal)return held('original_empty_replay_reserve_mismatch');s.originalJournal=originalJournal;s.phase='reserved';
  const readback=await captureOriginalClosedRecoveryCandidatePage(p.migration,s.installation,s.cut,s.source,''),after=originalClosedRecoveryCandidatePageFacts(readback,p.migration);replayCurrent(s);after.check();
  if(after.originalControl!==before.originalControl||after.observedAt<before.observedAt||after.observedAt>=p.originalExpiresAt)return held('original_empty_replay_closed_readback');
  const nativeDigest=await recoveryScalarArraySha256(['private-original-empty-closed-native-v1',s.copy,sf.acceptedSourceReceipt,before.originalControl,before.observedAt]),readbackDigest=await recoveryScalarArraySha256(['private-original-empty-closed-readback-v1',s.copy,sf.profileDigest64,after.originalControl,after.observedAt]);replayCurrent(s);after.check();
  const previous=s.check;s.check=()=>{previous();after.check();};replayCurrent(s);s.phase='committing';
  const secret=data(current(p.handle,true).env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string,proof=await privateReplayHmac(s.rpc,secret,recoveryScalarArrayJSON(['independent-suppression-original-replay-readback-v1',s.copy,nativeDigest,readbackDigest]));replayCurrent(s);
  const committed=await originalReplaySuppressionRPC(s.rpc,'/v1/suppression/replay-ack',installationText(['originalCopy','nativeReplayDigest','readbackDigest'],[s.copy,nativeDigest,readbackDigest]),proof);replayCurrent(s);
  const copy=installJournalTuple(data(committed,'copy'),17),old=installJournalTuple(s.copy,17);if(data(committed,'scope')!=='independent_original_copy_replay_readback_ack'||copy.slice(0,13).some((v,i)=>v!==old[i])||copy[11]!==0||copy[13]!=='replayed'||copy[14]!==nativeDigest||copy[15]!==readbackDigest||typeof copy[16]!=='number'||!Number.isSafeInteger(copy[16])||copy[16]<after.observedAt||copy[16]>=p.originalExpiresAt)return held('original_empty_replay_ack_unknown');s.completedCopy=data(committed,'copy') as string;
  const digest=await recoveryScalarArraySha256(['private-original-empty-closed-replay-complete-v1',s.completedCopy,nativeDigest,readbackDigest]);replayCurrent(s);
  const reservedCompletion=await installationRPC(s.rpc,'/v1/completion-reserve',installationText(['originalJournal','result','resultDigest','priorAttempt'],[originalJournal,'complete',digest,null]));replayCurrent(s);
  const attempt=recoveryScalarArrayJSON([s.rpc.executionOperationId,0,originalJournal,'complete',digest,'reserved',null]);if(data(reservedCompletion,'attempt')!==attempt||data(reservedCompletion,'journal')!==originalJournal)return held('original_empty_replay_completion_reserve_unknown');
  const finished=await installationRPC(s.rpc,'/v1/complete',installationText(['originalAttempt'],[attempt]));replayCurrent(s);const completed=installJournalTuple(data(finished,'journal'),10);if(completed.slice(0,7).some((v,i)=>v!==installJournalTuple(originalJournal,10)[i])||completed[7]!=='complete'||completed[8]!==digest||typeof completed[9]!=='number'||!Number.isSafeInteger(completed[9])||completed[9]<after.observedAt||completed[9]>=p.originalExpiresAt)return held('original_empty_replay_completion_unknown');s.replayCompletedAt=completed[9] as number;
  s.phase='complete';const handle=Object.freeze({}) as OriginalPrivateRecoveryReplayResult;privateRecoveryReplayResults.set(handle,s);return handle;
 }catch(error){s.phase='unknown';s.rpc.phase='unknown';throw error;}
}
export function originalPrivateRecoveryReplayFacts(result:OriginalPrivateRecoveryReplayResult):Readonly<{scope:'single_original_closed_native_recovery';selectedRecords:number;nativeCleanupCommitted:boolean;nativeClosedReadbackConfirmed:true;independentReplayConfirmed:true;recoverySourceKind:'closed_native_source'|'private_export'|'time_travel';originalArtifactAttemptVerified:boolean;originalCreatedAt:number;originalExpiresAt:number;rejectionWindowRenewed:false;servingModeEntered:false;allPhysicalBackupsErased:false;providerDrainQualified:false;readyToReopen:false}>{
 const s=privateRecoveryReplayResults.get(result);if(!s||s.phase!=='complete')return held('foreign_private_replay_result');const p=replayCurrent(s),records='records'in s?s.records.map(plan=>{const r=privateRecoveryReplayPlans.get(plan);if(!r)return held('foreign_private_replay_record');return r;}):'journal'in s?[s]:[];
 return Object.freeze({scope:'single_original_closed_native_recovery' as const,selectedRecords:records.length,recoverySourceKind:s.sourceKind,originalArtifactAttemptVerified:s.sourceKind!=='closed_native_source',nativeCleanupCommitted:records.some(r=>r.retired===null),nativeClosedReadbackConfirmed:true as const,independentReplayConfirmed:true as const,originalCreatedAt:p.originalCreatedAt,originalExpiresAt:p.originalExpiresAt,rejectionWindowRenewed:false as const,servingModeEntered:false as const,allPhysicalBackupsErased:false as const,providerDrainQualified:false as const,readyToReopen:false as const});
}

/** Data-only bridge for the fixed Native fence. It never returns Native or accepts a profile/clock/tuple. */
export function originalPrivateNativeWriterFenceCustody(cut:OriginalPrivateControlCut,native:D1Database):Readonly<{layout:'canonical'|'recorded-live-20261010';sourceKind:'pre-marker'|'marker'|'public-predecessor'|'current-cookie'|'current-cookie-pre-seal';operationId:string;fenceEpoch:string;nextEpoch:string;createdAt:number;expiresAt:number;closedAt:number;restoredNative:boolean;check:()=>void}>{
 const saved=controlCuts.get(cut);if(!saved)return held('foreign_native_fence_cut');const o=current(saved.handle,true),facts=originalPrivateControlCutCustody(cut),g=tuple(facts.gate,11),f=tuple(facts.floor,12);
 const slots=Object.freeze(['PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_INSTALL_SOURCE_KIND'].map(key=>descriptor(o.env,key))),layout=data(o.env,'PRIVACY_WRITE_ADMISSION_LAYOUT'),kind=data(o.env,'PRIVACY_INSTALL_SOURCE_KIND');
 if(native!==o.native||isPrivacyWriteAdmissionDatabase(native)||layout!=='canonical'&&layout!=='recorded-live-20261010'||kind!=='pre-marker'&&kind!=='marker'&&kind!=='public-predecessor'&&kind!=='current-cookie'&&kind!=='current-cookie-pre-seal'||kind==='public-predecessor'&&layout!=='recorded-live-20261010'||!hex(f[7],32)||!hex(g[9],32)||typeof g[7]!=='number'||typeof g[8]!=='number'||typeof g[10]!=='number')return held('original_native_fence_identity');
 const restored=restoredWriterAttempts.get(cut),artifact=restored?originalRestoredArtifactAttemptFacts(restored,cut,o.env):null;
 const check=()=>{originalRecoveryClockMilliseconds();artifact?.check();const now=current(saved.handle,true);originalPrivateControlCutCustody(cut);for(const s of slots)sameDescriptor(s);if(now.native!==native||!now.original||now.original.operationId!==g[4]||now.original.createdAt!==g[7]||now.original.expiresAt!==g[8]||now.original.nextWriteEpoch!==g[9])return held('original_native_fence_drift');};check();
 return Object.freeze({layout,sourceKind:kind,operationId:g[4] as string,fenceEpoch:f[7] as string,nextEpoch:g[9] as string,createdAt:g[7],expiresAt:g[8],closedAt:Math.max(g[10],artifact?.providerObservedAt??g[10]),restoredNative:artifact!==null,check});
}
const originalPrivateWriterFenceCaptureSpent=new WeakSet<OriginalPrivateControlCut>(),restoredWriterAttempts=new WeakMap<OriginalPrivateControlCut,OriginalRestoredArtifactAttempt>();
/** Actual private same-cut factory. Source does not infer old provider/version drain from the Native fence. */
export async function captureOriginalPrivateNativeWriterFence(cut:OriginalPrivateControlCut,attempt?:OriginalRestoredArtifactAttempt):Promise<OriginalNativeWriterFence>{
 const saved=controlCuts.get(cut);if(!saved||originalPrivateWriterFenceCaptureSpent.has(cut))return held('foreign_or_spent_native_fence_cut');const o=current(saved.handle,true);if(attempt){originalRestoredArtifactAttemptFacts(attempt,cut,o.env).check();restoredWriterAttempts.set(cut,attempt);}originalPrivateNativeWriterFenceCustody(cut,o.native);originalPrivateWriterFenceCaptureSpent.add(cut);
 const result=await captureOriginalNativeWriterFence(o.native,cut);current(saved.handle,true);return result;
}
/** One actual atomic Native close; no HTTP opener or serving toggle is added by this factory. */
export async function dispatchOriginalPrivateNativeWriterFence(cut:OriginalPrivateControlCut,fence:OriginalNativeWriterFence):Promise<void>{
 const saved=controlCuts.get(cut);if(!saved)return held('foreign_native_fence_cut');current(saved.handle,true);assertOriginalNativeWriterFenceCut(fence,cut);await executeOriginalNativeWriterFence(fence);current(saved.handle,true);assertOriginalNativeWriterFence(fence,cut);
}

/** Private native-open bridge. The exact source installation/replay/cut are required; no caller drain boolean. */
export function originalPrivateNativeOpenCustody(migration:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,replay:OriginalPrivateRecoveryReplayResult,fence:OriginalNativeWriterFence,native:D1Database):Readonly<{createdAt:number;expiresAt:number;profileObservedAt:number;nativeNotBefore:number;profileDigest64:string;check:()=>void}>{
 const installed=privateInstallationResults.get(installation),r=privateRecoveryReplayResults.get(replay);if(!installed||installed.phase!=='complete'||!r||r.phase!=='complete'||r.installation!==installation||r.cut!==cut||r.source!==source||r.completedCopy===null||r.replayCompletedAt===null)return held('original_native_open_custody_required');
 const p=installPlans.get(installed.plan);if(!p||p.cut!==cut||p.migration!==migration||p.writerFence!==fence||current(p.handle,true).native!==native)return held('original_native_open_foreign');
 assertOriginalNativeWriterFence(fence,cut);assertOriginalPrivateInstallation(installation);assertOriginalAcceptedRecoverySource(source,installation,cut);replayCurrent(r);
 const sf=originalAcceptedRecoverySourceFacts(source,installation,cut),f=originalPrivateControlCutCustody(cut),copy=installJournalTuple(r.completedCopy,17);
 if(f.pending!==0||f.unknown!==0||f.providerPending!==0||f.providerUnknown!==0||copy[3]!==f.floor||copy[4]!==f.gate||copy[5]!==r.sourceKind||copy[13]!=='replayed'||copy[9]!==p.originalExpiresAt||copy[8]!==p.originalCreatedAt||copy[10]!==f.actionSequence||typeof copy[16]!=='number'||!Number.isSafeInteger(copy[16])||copy[16]<sf.profileObservedAt||copy[16]>=p.originalExpiresAt||!Number.isSafeInteger(r.replayCompletedAt)||r.replayCompletedAt<copy[16]||r.replayCompletedAt>=p.originalExpiresAt||sf.profileDigest64!==installed.nativeObservation?.targetProfileDigest64)return held('original_native_open_custody_required');
 const check=()=>{originalRecoveryClockMilliseconds();assertOriginalPrivateInstallation(installation);assertOriginalAcceptedRecoverySource(source,installation,cut);assertOriginalNativeWriterFence(fence,cut);replayCurrent(r);const now=originalPrivateControlCutCustody(cut);if(current(p.handle,true).native!==native||now.floor!==f.floor||now.gate!==f.gate||now.actionSequence!==f.actionSequence||now.pending!==0||now.unknown!==0||now.providerPending!==0||now.providerUnknown!==0||r.completedCopy===null)return held('original_native_open_custody_changed');};check();
 return Object.freeze({createdAt:p.originalCreatedAt,expiresAt:p.originalExpiresAt,profileObservedAt:sf.profileObservedAt,nativeNotBefore:r.replayCompletedAt,profileDigest64:sf.profileDigest64,check});
}
declare const originalPrivateServingOpenBrand:unique symbol;
export type OriginalPrivateServingOpen=Readonly<{[originalPrivateServingOpenBrand]:true}>;
declare const originalPrivateServingOpenResultBrand:unique symbol;
export type OriginalPrivateServingOpenResult=Readonly<{[originalPrivateServingOpenResultBrand]:true}>;
type PrivateServingOpen={installation:OriginalPrivateInstallation;cut:OriginalPrivateControlCut;source:OriginalAcceptedRecoverySource;replay:OriginalPrivateRecoveryReplayResult;fence:OriginalNativeWriterFence;native:OriginalNativeServingOpen;rpc:InstallationState;phase:'prepared'|'reserving'|'reserved'|'native-dispatched'|'committing'|'reopening'|'complete'|'unknown';check:()=>void;ack:OriginalNativeServingOpenAck|null;completion:string|null;resultFloor:string|null;resultGate:string|null;requestRaw:string|null;productionEndpointMounted:boolean};
const privateServingOpenPlans=new WeakMap<OriginalPrivateServingOpen,PrivateServingOpen>(),privateServingOpenResults=new WeakMap<OriginalPrivateServingOpenResult,PrivateServingOpen>(),privateServingOpenCaptureSpent=new WeakSet<OriginalPrivateInstallation>();
const privateServingOpenByNative=new WeakMap<OriginalNativeServingOpen,PrivateServingOpen>();
function privateServingOpenCurrent(s:PrivateServingOpen):InstallPlanState{if(s.phase==='unknown')return held('original_private_open_unknown');s.check();const p=installationCurrent(s.rpc);if(s.ack)assertOriginalNativeServingOpenAcknowledgement(s.ack,p.migration,s.installation,s.cut,s.source,s.replay,s.fence);return p;}
/** Source-only/private API. Production HTTP remains held until independent provider/copy closure is qualified. */
export async function captureOriginalPrivateServingOpen(installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,replay:OriginalPrivateRecoveryReplayResult,fence:OriginalNativeWriterFence):Promise<OriginalPrivateServingOpen>{
 const installed=privateInstallationResults.get(installation),r=privateRecoveryReplayResults.get(replay);if(!installed||!r||privateServingOpenCaptureSpent.has(installation))return held('original_private_open_foreign_or_spent');const p=installPlans.get(installed.plan);if(!p)return held('original_private_open_foreign');
 const facts=originalPrivateNativeOpenCustody(p.migration,installation,cut,source,replay,fence,current(p.handle,true).native);privateServingOpenCaptureSpent.add(installation);facts.check();
 const native=await captureOriginalNativeServingOpen(p.migration,installation,cut,source,replay,fence),identity=await recoveryScalarArraySha256(['private-original-serving-open-v1',p.operationId,originalPrivateControlCutCustody(cut).floor,originalPrivateControlCutCustody(cut).gate,installed.migrationReceipt,originalAcceptedRecoverySourceFacts(source,installation,cut).acceptedSourceReceipt,r.completedCopy]);facts.check();if(identity.slice(0,32)===p.operationId)return held('original_private_open_operation_collision');
 const rpc:InstallationState={plan:installed.plan,phase:'prepared',executionOperationId:identity.slice(0,32),executionNonce:identity.slice(32),requestDigest:identity,originalJournal:null,originalAttempt:null,nativeObservation:installed.nativeObservation,migrationReceipt:installed.migrationReceipt,completionJournal:null};
 const state:PrivateServingOpen={installation,cut,source,replay,fence,native,rpc,phase:'prepared',check:facts.check,ack:null,completion:null,resultFloor:null,resultGate:null,requestRaw:null,productionEndpointMounted:false};privateServingOpenCurrent(state);const cap=Object.freeze({}) as OriginalPrivateServingOpen;privateServingOpenPlans.set(cap,state);privateServingOpenByNative.set(native,state);return cap;
}
/** Called only by the owned Native consumer: its original independent reserve is already durable. */
export function originalPrivateNativeOpenDispatchCustody(native:OriginalNativeServingOpen,migration:WholeMigrationCapability,cut:OriginalPrivateControlCut):()=>void{const s=privateServingOpenByNative.get(native);if(!s||s.phase!=='native-dispatched'||s.cut!==cut||!s.rpc.originalJournal)return held('original_private_open_dispatch_unowned');const p=privateServingOpenCurrent(s);if(p.migration!==migration)return held('original_private_open_dispatch_foreign');const original=s.rpc.originalJournal;const check=()=>{if(s.phase!=='native-dispatched'||s.rpc.originalJournal!==original)return held('original_private_open_dispatch_changed');privateServingOpenCurrent(s);};check();return check;}
/** One durable spend, then actual D1 mode serving while DO still closed, then authenticated original DO opener. */
export async function executeOriginalPrivateServingOpen(cap:OriginalPrivateServingOpen):Promise<OriginalPrivateServingOpenResult>{
 const s=privateServingOpenPlans.get(cap);if(!s||s.phase!=='prepared')return held('original_private_open_foreign_or_spent');const p=privateServingOpenCurrent(s),custody=originalPrivateControlCutCustody(s.cut),F=custody.floor,G=custody.gate;s.phase='reserving';
 try{
  const originalJournal=recoveryScalarArrayJSON([s.rpc.executionOperationId,'reserve',s.rpc.executionNonce,F,s.rpc.requestDigest,p.originalCreatedAt,p.originalExpiresAt,'reserved',null,null]);
  const reserved=await installationRPC(s.rpc,'/v1/reserve',installationText(['operationId','nonce','createdAt','expiresAt','requestDigest','originalFloor'],[s.rpc.executionOperationId,s.rpc.executionNonce,p.originalCreatedAt,p.originalExpiresAt,s.rpc.requestDigest,F]));privateServingOpenCurrent(s);if(data(reserved,'journal')!==originalJournal)return held('original_private_open_reserve_unknown');s.rpc.originalJournal=originalJournal;s.phase='reserved';
  s.phase='native-dispatched';s.ack=await executeOriginalNativeServingOpen(s.native);privateServingOpenCurrent(s);const native=originalNativeServingOpenAcknowledgementFacts(s.ack,p.migration,s.installation,s.cut,s.source,s.replay,s.fence);
  // Do not leave an unresolved reserve when the genuine DO opener consumes its fixed journal guards.
  s.phase='committing';const digest=await recoveryScalarArraySha256(['private-original-serving-open-native-v1',originalJournal,native.writeEpoch,native.profileDigest64,native.nativeResultDigest64,native.openedAt]);privateServingOpenCurrent(s);
  const completion=await installationRPC(s.rpc,'/v1/completion-reserve',installationText(['originalJournal','result','resultDigest','priorAttempt'],[originalJournal,'complete',digest,null]));privateServingOpenCurrent(s);const attempt=recoveryScalarArrayJSON([s.rpc.executionOperationId,0,originalJournal,'complete',digest,'reserved',null]);if(data(completion,'journal')!==originalJournal||data(completion,'attempt')!==attempt)return held('original_private_open_completion_unknown');
  const committed=await installationRPC(s.rpc,'/v1/complete',installationText(['originalAttempt'],[attempt]));privateServingOpenCurrent(s);const journal=installJournalTuple(data(committed,'journal'),10);if(journal.slice(0,7).some((v,i)=>v!==installJournalTuple(originalJournal,10)[i])||journal[7]!=='complete'||journal[8]!==digest||typeof journal[9]!=='number'||!Number.isSafeInteger(journal[9])||journal[9]<native.openedAt||journal[9]>=p.originalExpiresAt)return held('original_private_open_completion_unknown');s.completion=data(committed,'journal') as string;
  const installed=privateInstallationResults.get(s.installation)!,replay=privateRecoveryReplayResults.get(s.replay)!,source=originalAcceptedRecoverySourceFacts(s.source,s.installation,s.cut);if(!installed.migrationReceipt||!replay.completedCopy)return held('original_private_open_receipts_required');
  // The Native-open reserve remains immutable; the later DO floor advance owns a distinct durable journal identity.
  const reopenIdentity=await recoveryScalarArraySha256(['private-original-serving-gate-open-v1',s.rpc.executionOperationId,s.completion,F,G,installed.migrationReceipt,source.acceptedSourceReceipt,replay.completedCopy]);privateServingOpenCurrent(s);const reopenOperationId=reopenIdentity.slice(0,32);if(reopenOperationId===s.rpc.executionOperationId||reopenOperationId===p.operationId)return held('original_private_do_open_operation_collision');
  const raw=installationText(['operationId','nonce','requestDigest','createdAt','expiresAt','originalGate','originalFloor','originalCut','allWriterCut','migrationReceipt','acceptedSourceReceipt','suppressionReceipt'],[reopenOperationId,reopenIdentity.slice(32),reopenIdentity,p.originalCreatedAt,p.originalExpiresAt,G,F,custody.nativeCut,custody.allWriterCut,installed.migrationReceipt,source.acceptedSourceReceipt,replay.completedCopy]);s.requestRaw=raw;s.phase='reopening';
  const value=await installationBounded(s.rpc,async boundary=>{privateServingOpenCurrent(s);boundary();const o=current(p.handle,true),secret=data(o.env,'PRIVACY_RECOVERY_OPERATOR_SECRET') as string;
   const action=await privateReplayHmac(s.rpc,secret,recoveryScalarArrayJSON(['olympus-private-serving-reopen-v1','POST','/v1/serving/reopen',raw]));privateServingOpenCurrent(s);boundary();
   const receiptProof=await privateReplayHmac(s.rpc,secret,recoveryScalarArrayJSON(['olympus-private-serving-recovery-receipts-v2',custody.allWriterCut,installed.migrationReceipt,source.acceptedSourceReceipt,replay.completedCopy]));privateServingOpenCurrent(s);boundary();
   const request=Reflect.construct(installationRequest.value as Function,['https://privacy-recovery-floor.invalid/v1/serving/reopen',{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Serving-Proof':action,'X-Olympus-Recovery-Receipt-Proof':receiptProof},body:raw}]) as Request;checkOriginalNativeRequest(request);sameMethod(o.recoveryFetch);const response=await Reflect.apply(o.recoveryFetch.fn,o.recoveryFetch.receiver,[request]) as Response;privateServingOpenCurrent(s);boundary();sameMethod(o.recoveryFetch);checkOriginalNativeResponse(response);if(Reflect.apply(RESPONSE.status!.get!,response,[])!==200)return held('original_private_do_open_unknown');
   const text=await originalNativeText(response,'response',p.originalExpiresAt*1000,()=>{privateServingOpenCurrent(s);boundary();checkOriginalNativeResponse(response);});privateServingOpenCurrent(s);boundary();return recoveryParseDataJSON(text);
  });privateServingOpenCurrent(s);
  if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).sort().join('|')!=='floor|gate|operationId|providerDrainQualified|readyToReopen|scope|servingAdmissionQualified|unmanagedOldVersionClosureQualified'||data(value,'scope')!=='private_serving_original_reopened'||data(value,'operationId')!==reopenOperationId||['providerDrainQualified','readyToReopen','servingAdmissionQualified','unmanagedOldVersionClosureQualified'].some(key=>data(value,key)!==false))return held('original_private_do_open_unknown');
  const nextFloor=data(value,'floor'),nextGate=data(value,'gate'),f=installJournalTuple(nextFloor,12),g=installJournalTuple(nextGate,11),old=installJournalTuple(F,12),sourceTuple=installJournalTuple(source.acceptedSourceReceipt,8);
  if(f.slice(0,5).some((v,i)=>v!==old[i])||f[5]!==Number(old[5])+1||f[6]!==sourceTuple[5]||f[7]!==native.writeEpoch||f[8]!==sourceTuple[3]||f[9]!==sourceTuple[4]||f[10]!==reopenOperationId||typeof f[11]!=='number'||!Number.isSafeInteger(f[11])||f[11]<native.openedAt||f[11]<journal[9]||f[11]>=p.originalExpiresAt||g[0]!==1||g[1]!=='olympus-private-serving-gate-v1'||g[2]!==nextFloor||g[3]!=='managed_open'||g.slice(4).some(x=>x!==null))return held('original_private_do_open_unknown');
  s.resultFloor=nextFloor as string;s.resultGate=nextGate as string;s.phase='complete';privateServingOpenCurrent(s);const result=Object.freeze({}) as OriginalPrivateServingOpenResult;privateServingOpenResults.set(result,s);return result;
 }catch(error){s.phase='unknown';throw error;}
}
export function originalPrivateServingOpenFacts(result:OriginalPrivateServingOpenResult):Readonly<{nativeModeOpened:true;independentOpenReserveCompleted:true;doGateManagedOpen:true;originalCreatedAt:number;originalExpiresAt:number;originalDeadlineRenewed:false;singleCopyScopeOnly:true;allPhysicalBackupsErased:false;providerDrainQualified:false;productionEndpointMounted:boolean;readyToReopen:false}>{const s=privateServingOpenResults.get(result);if(!s||s.phase!=='complete'||!s.ack||!s.completion||!s.resultFloor||!s.resultGate)return held('original_private_open_result_foreign');const p=privateServingOpenCurrent(s);return Object.freeze({nativeModeOpened:true as const,independentOpenReserveCompleted:true as const,doGateManagedOpen:true as const,originalCreatedAt:p.originalCreatedAt,originalExpiresAt:p.originalExpiresAt,originalDeadlineRenewed:false as const,singleCopyScopeOnly:true as const,allPhysicalBackupsErased:false as const,providerDrainQualified:false as const,productionEndpointMounted:s.productionEndpointMounted,readyToReopen:false as const});}

type PrivateControlPipeline={artifactRequired:boolean;handle:object;raw:string;phase:'preparing'|'installed_closed'|'opening'|'complete'|'unknown';cut:OriginalPrivateControlCut|null;fence:OriginalNativeWriterFence|null;installation:OriginalPrivateInstallation|null;opened:OriginalPrivateServingOpenResult|null};
// Only the original raw binding and an authenticated original command can select this retained chain.
// A cold isolate has no chain and holds: journal strings cannot recreate the private capabilities.
const privateControlPipelines=new WeakMap<D1Database,Map<string,PrivateControlPipeline>>();
function pipelineConfiguration(o:Origin):boolean{
 const layout=Object.getOwnPropertyDescriptor(o.env,'PRIVACY_WRITE_ADMISSION_LAYOUT'),kind=Object.getOwnPropertyDescriptor(o.env,'PRIVACY_INSTALL_SOURCE_KIND');
 return !!layout&&Object.hasOwn(layout,'value')&&['canonical','recorded-live-20261010'].includes(layout.value)
  &&!!kind&&Object.hasOwn(kind,'value')&&['pre-marker','marker','public-predecessor','current-cookie','current-cookie-pre-seal'].includes(kind.value)
  &&(kind.value!=='public-predecessor'||layout.value==='recorded-live-20261010');
}
function pipelineCurrent(p:PrivateControlPipeline,handle:object,raw:string):Origin{
 const original=current(p.handle,true),now=current(handle,true);
 if(p.phase==='unknown'||p.raw!==raw||original.native!==now.native||original.controlTree!==now.controlTree||original.controlSecret!==now.controlSecret
  ||original.metadataTuple!==now.metadataTuple||JSON.stringify(original.config)!==JSON.stringify(now.config)
  ||original.recoveryFetch.receiver!==now.recoveryFetch.receiver||original.recoveryFetch.fn!==now.recoveryFetch.fn
  ||original.namespaceId.receiver!==now.namespaceId.receiver||!original.original||!now.original
  ||JSON.stringify(original.original)!==JSON.stringify(now.original))return held('original_pipeline_unknown_or_foreign');
 if(p.cut)originalPrivateControlCutCustody(p.cut);if(p.installation)assertOriginalPrivateInstallation(p.installation);return original;
}
/** Actual operator entry. Every effect uses the same source-issued capabilities and original close deadline.
 * No provider/all-copy claim is inferred from managed drain or from an authenticated operator request. */
async function dispatchOriginalPrivateControlPipeline(handle:object,raw:string):Promise<Response>{
 const o=current(handle,true),original=o.original;if(!original)return held('original_pipeline_command_required');
 if(!pipelineConfiguration(o))return reply({scope:'private_original_control_held',reason:'original_install_configuration_required',operationId:original.operationId,createdAt:original.createdAt,expiresAt:original.expiresAt,residuals,...flags},409);
 let entries=privateControlPipelines.get(o.native);if(!entries){entries=new Map();privateControlPipelines.set(o.native,entries);}
 let pipeline=entries.get(original.operationId);
 const artifactRequired=o.path==='/v1/control/install-and-reopen-artifact',atomic=o.path==='/v1/control/install-and-reopen'||artifactRequired;
 if(pipeline&&atomic&&pipeline.artifactRequired!==artifactRequired)return held('original_pipeline_source_kind_changed');
 if(o.path==='/v1/control/prepare-install'||atomic){
  if(pipeline){pipelineCurrent(pipeline,handle,raw);if(!atomic)return reply({scope:'private_original_installation_observation',operationId:original.operationId,state:pipeline.phase,originalCreatedAt:original.createdAt,originalExpiresAt:original.expiresAt,automaticRetry:false,...flags},pipeline.phase==='installed_closed'||pipeline.phase==='complete'?200:409);}
  else{
  for(const [id,saved]of entries){const old=origins.get(saved.handle)?.original;if(old&&old.expiresAt*1000<=originalRecoveryClockMilliseconds())entries.delete(id);}
  if(entries.size>=32)return held('original_pipeline_capacity_held');
  pipeline={artifactRequired,handle,raw,phase:'preparing',cut:null,fence:null,installation:null,opened:null};entries.set(original.operationId,pipeline);
  try{
   const requestDigest=await digest(handle,raw);pipelineCurrent(pipeline,handle,raw);
   pipeline.cut=await captureOriginalPrivateControlCutFromOrigin(handle,requestDigest);pipelineCurrent(pipeline,handle,raw);
   const restoredAttempt=pipeline.artifactRequired?await observeOriginalRestoredArtifactAttempt(pipeline.cut,o.env):undefined;pipelineCurrent(pipeline,handle,raw);
   pipeline.fence=await captureOriginalPrivateNativeWriterFence(pipeline.cut,restoredAttempt);pipelineCurrent(pipeline,handle,raw);
   await dispatchOriginalPrivateNativeWriterFence(pipeline.cut,pipeline.fence);pipelineCurrent(pipeline,handle,raw);
   const plan=await captureOriginalPrivateInstallPlan(pipeline.cut,pipeline.fence);pipelineCurrent(pipeline,handle,raw);
   pipeline.installation=await executeOriginalPrivateInstallPlan(plan);pipelineCurrent(pipeline,handle,raw);pipeline.phase='installed_closed';
   if(!atomic)return reply({scope:'private_original_installation_confirmed',state:pipeline.phase,installation:originalPrivateInstallationFacts(pipeline.installation),servingMode:'closed',automaticRetry:false,...flags},200);
  }catch(error){pipeline.phase='unknown';throw error;}
  }
 }
 if(o.path!=='/v1/control/reopen'&&!atomic||!pipeline)return reply({scope:'private_original_control_held',reason:'original_pipeline_not_retained',operationId:original.operationId,createdAt:original.createdAt,expiresAt:original.expiresAt,automaticRetry:false,...flags},409);
 const owner=pipelineCurrent(pipeline,handle,raw);
 if(pipeline.phase==='complete'&&pipeline.opened)return reply({scope:'private_original_open_observation',state:'complete',open:originalPrivateServingOpenFacts(pipeline.opened),automaticRetry:false,...flags},200);
 if(pipeline.phase!=='installed_closed'||!pipeline.cut||!pipeline.fence||!pipeline.installation)return held('original_pipeline_not_ready');
 pipeline.phase='opening';
 try{
  const source=await observeOriginalAcceptedRecoverySource(pipeline.cut,pipeline.installation,owner.env);pipelineCurrent(pipeline,handle,raw);
  const artifact=pipeline.artifactRequired?await observeOriginalAcceptedRecoveryArtifact(source,pipeline.installation,pipeline.cut):undefined;pipelineCurrent(pipeline,handle,raw);
  const replayPlan=await captureOriginalPrivateRecoveryReplay(pipeline.installation,pipeline.cut,source,artifact);pipelineCurrent(pipeline,handle,raw);
  const replay=await executeOriginalPrivateRecoveryReplay(replayPlan);pipelineCurrent(pipeline,handle,raw);
  const open=await captureOriginalPrivateServingOpen(pipeline.installation,pipeline.cut,source,replay,pipeline.fence);pipelineCurrent(pipeline,handle,raw);
  const ownedOpen=privateServingOpenPlans.get(open);if(!ownedOpen)return held('original_pipeline_open_custody_required');ownedOpen.productionEndpointMounted=true;
  pipeline.opened=await executeOriginalPrivateServingOpen(open);pipelineCurrent(pipeline,handle,raw);pipeline.phase='complete';
  return reply({scope:'private_original_open_confirmed',state:'complete',open:originalPrivateServingOpenFacts(pipeline.opened),automaticRetry:false,...flags},200);
 }catch(error){pipeline.phase='unknown';throw error;}
}

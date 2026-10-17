/** Fixed transport to the separately authenticated private operator. No DB, operator secret or receipt issuer.
 * The header wait uses the original deadline. The owner client separately bounds response EOF; this adapter
 * does not claim that streaming a returned body is a whole-body completion acknowledgement. */
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {recoveryParseDataJSON} from './privacy-recovery-data-json';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_RESPONSE_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeResponse,captureOriginalNativeRequestBody,readOriginalNativeBodyPacket,cancelOriginalNativeBodyReader,releaseOriginalNativeBodyReader} from './privacy-native-http-intrinsics';

const COMMANDS=new Set(['initialize-closed','close','status','observe-cut','prepare-install','install-and-reopen','install-and-reopen-artifact','reopen']);
const PREFIX='/private-production-control/';
const requestMethod=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,requestUrl=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,requestHeaders=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,headerGet=ORIGINAL_HEADER_DESCRIPTORS.get!.value;
const responseStatus=ORIGINAL_RESPONSE_DESCRIPTORS.status!.get!;
const NativeRequest=Request,NativeResponse=Response,NativeHeaders=Headers,NativePromise=Promise,Bytes=Uint8Array,Decoder=TextDecoder;
const race=Promise.race,timer=setTimeout,clearTimer=clearTimeout,apply=Reflect.apply;
const failure=(error:string,status:number)=>new NativeResponse(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function until<T>(pending:Promise<T>,deadline:number):Promise<T>{
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await apply(race,NativePromise,[[pending,new NativePromise<never>((_,reject)=>{timeout=apply(timer,globalThis,[()=>reject(Error('private_control_transport_unknown')),Math.max(1,deadline-originalRecoveryClockMilliseconds())]);})]])as T;}
 finally{if(timeout!==undefined)apply(clearTimer,globalThis,[timeout]);}
}
function originalFetcher(value:unknown):{receiver:object;fetch:Function;check:()=>void}{
 if(!value||typeof value!=='object')throw Error('private_control_binding_required');let owner:object|null=value;const chain:{owner:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];
 for(let depth=0;owner&&depth<32;depth++){
  const d=Object.getOwnPropertyDescriptor(owner,'fetch'),prototype=Object.getPrototypeOf(owner);chain.push({owner,prototype,descriptor:d});
  if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('private_control_binding_required');
   const check=()=>{for(const s of chain){const now=Object.getOwnPropertyDescriptor(s.owner,'fetch');if(Object.getPrototypeOf(s.owner)!==s.prototype||(s.descriptor===undefined?now!==undefined:!now||['value','get','set','writable','enumerable','configurable'].some(k=>now[k as keyof PropertyDescriptor]!==s.descriptor![k as keyof PropertyDescriptor])))throw Error('private_control_binding_changed');}};
   return{receiver:value,fetch:d.value,check};
  }owner=prototype;
 }throw Error('private_control_binding_required');
}
/** The canonical bot host selects this exact route before the business serving gate, including while it is CLOSED. */
export async function forwardPrivateProductionControl(request:Request,env:object,path:string):Promise<Response>{
 try{
  checkOriginalNativeRequest(request);const method=apply(requestMethod,request,[]),url=new URL(apply(requestUrl,request,[])),suffix=path.slice(PREFIX.length);
  if(!path.startsWith(PREFIX)||!COMMANDS.has(suffix)||url.protocol!=='https:'||url.pathname!==path||url.search||url.hash)return failure('not_found',404);
  if(method!=='POST')return new NativeResponse(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  const headers=apply(requestHeaders,request,[])as Headers,contentType=apply(headerGet,headers,['Content-Type']),length=apply(headerGet,headers,['Content-Length']),proof=apply(headerGet,headers,['X-Olympus-Control-Proof']);
  if(typeof proof!=='string'||!/^[0-9a-f]{64}$/.test(proof))return failure('private_control_authentication_required',401);
  if(contentType!=='application/json'||length!==null&&(typeof length!=='string'||!/^\d{1,5}$/.test(length)||Number(length)>8192))return failure('private_control_body_required',400);
  const bindingName=suffix==='initialize-closed'?'PRIVACY_PRODUCTION_INITIALIZER':'PRIVACY_PRODUCTION_CONTROL';
  const slot=Object.getOwnPropertyDescriptor(env,bindingName);if(!slot||!Object.hasOwn(slot,'value'))return failure('private_control_unavailable',503);
  const fetcher=originalFetcher(slot.value),reader=captureOriginalNativeRequestBody(request);if(!reader)return failure('private_control_body_required',400);
  const deadline=originalRecoveryClockMilliseconds()+5000,values:number[]=[];let eof=false;
  try{for(;;){const packet=await until(readOriginalNativeBodyPacket(reader),deadline);if(originalRecoveryClockMilliseconds()>=deadline)throw Error('private_control_transport_unknown');if(packet.done){eof=true;break;}const part=packet.value;if(!part||values.length+part.byteLength>8192)throw Error('private_control_body_limit');for(let i=0;i<part.byteLength;i++)values.push(part[i]!);}}
  finally{if(eof)releaseOriginalNativeBodyReader(reader);else{try{await until(cancelOriginalNativeBodyReader(reader,'private_control_transport_unknown'),originalRecoveryClockMilliseconds()+1000);}finally{releaseOriginalNativeBodyReader(reader);}}}
  if(length!==null&&Number(length)!==values.length)return failure('private_control_body_required',400);
  const command=recoveryParseDataJSON(new Decoder('utf-8',{fatal:true,ignoreBOM:false}).decode(new Bytes(values)));
  if(!command||typeof command!=='object'||Array.isArray(command))return failure('private_control_body_required',400);
  const created=Object.getOwnPropertyDescriptor(command,'createdAt'),expires=Object.getOwnPropertyDescriptor(command,'expiresAt'),now=originalRecoveryClockMilliseconds();
  if(!created||!expires||!Object.hasOwn(created,'value')||!Object.hasOwn(expires,'value')||!Number.isSafeInteger(created.value)||expires.value!==created.value+300||now<created.value*1000||now>=expires.value*1000)return failure('private_control_original_deadline_held',409);
  // The private operator authenticates these exact bytes and enforces the original command deadline.
  const forwardedHeaders=new NativeHeaders({'Content-Type':'application/json','X-Olympus-Control-Proof':proof});
  const forwarded=new NativeRequest('https://privacy-production-control.invalid/v1/control/'+suffix,{method:'POST',redirect:'manual',headers:forwardedHeaders,body:new Bytes(values)});
  fetcher.check();const response=await until(apply(fetcher.fetch,fetcher.receiver,[forwarded])as Promise<Response>,expires.value*1000);fetcher.check();
  const current=Object.getOwnPropertyDescriptor(env,bindingName);if(!current||!Object.hasOwn(current,'value')||current.value!==slot.value)throw Error('private_control_binding_changed');
  checkOriginalNativeResponse(response);const status=apply(responseStatus,response,[]);if(typeof status!=='number'||status<200||status>599)throw Error('private_control_response_required');
  return new NativeResponse(response.body,{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return failure('private_control_outcome_unknown',503);}
}

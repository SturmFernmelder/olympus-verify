/** Finite identify-only response reads. A local timeout never proves the original provider/cancellation work drained. */
import { uniqueJsonKeys } from './network-profile';
export const PRIVACY_PROVIDER_BYTES=16384,PRIVACY_PROVIDER_DEADLINE_MS=8000;
export class PendingPrivacyIdentityWork {
 #pending=new Set<Promise<unknown>>();
 get count():number{return this.#pending.size;}
 track<T>(promise:Promise<T>):Promise<T>{const owned=Promise.resolve(promise);this.#pending.add(owned);owned.then(()=>this.#pending.delete(owned),()=>this.#pending.delete(owned));return owned;}
}
export const PRIVACY_IDENTITY_WORK=new PendingPrivacyIdentityWork();
export async function waitPrivacyProvider<T>(promise:Promise<T>,until:number,controller:AbortController,work=PRIVACY_IDENTITY_WORK):Promise<T>{
 const owned=work.track(promise),remaining=until-Date.now();let timer:ReturnType<typeof setTimeout>|undefined;
 if(remaining<=0){controller.abort();throw Error('identity_provider_deadline');}
 try{return await Promise.race([owned,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('identity_provider_deadline'));},remaining);})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
export function discardPrivacyProvider(response:Response,work=PRIVACY_IDENTITY_WORK):void {
 if(response.body)void work.track(Promise.resolve().then(()=>response.body!.cancel()).then(()=>undefined)).catch(()=>undefined);
}
/** A header response arriving after local return still owns its unread stream; cancellation remains counted. */
export async function fetchPrivacyProvider(promise:Promise<Response>,until:number,controller:AbortController,work=PRIVACY_IDENTITY_WORK):Promise<Response>{
 let lost=false;const watched=promise.then(response=>{if(lost)discardPrivacyProvider(response,work);return response;});
 try{return await waitPrivacyProvider(watched,until,controller,work);}catch(error){lost=true;throw error;}
}
export async function readPrivacyProviderJson(response:Response,until:number,controller:AbortController,work=PRIVACY_IDENTITY_WORK):Promise<unknown>{
 const declared=response.headers.get('Content-Length');
 if(declared!==null&&(!/^(0|[1-9][0-9]{0,5})$/.test(declared)||Number(declared)>PRIVACY_PROVIDER_BYTES)){discardPrivacyProvider(response,work);throw Error('identity_provider_size');}
 if(!response.body)throw Error('identity_provider_body_missing');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0,done=false;
 try{for(;;){const chunk=await waitPrivacyProvider(reader.read(),until,controller,work);if(chunk.done){done=true;break;}
   total+=chunk.value.byteLength;if(total>PRIVACY_PROVIDER_BYTES)throw Error('identity_provider_size');parts.push(chunk.value);}
  const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  if(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)throw Error('identity_provider_json');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  if(!uniqueJsonKeys(text))throw Error('identity_provider_json');return JSON.parse(text);
 }finally{if(!done)void work.track(Promise.resolve().then(()=>reader.cancel()).then(()=>undefined)).catch(()=>undefined);}
}

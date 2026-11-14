import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
/** Authenticated web verification service. Session and CSRF admission belong to
 * the existing site route; no Discord interaction or character proof is forged. */
import type {Env} from './env';
import {requestCharacterCode242,verificationIssueOutcome280,roleRequestText280} from './interactions';
import {readPrivacySubject,privacyBoundSubjectEnv} from './privacy-serving-authority';
import {ownRoleStatus242,requestRoleReconciliation242,kickRoleWork242,type RoleWorkDefer242} from './role-reconcile242';
import {rateLimited} from './site-core';

export type VerificationUser242={id:string;username?:string;global_name?:string|null};
const answer=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform',...headers}});
/** Keep the original 1024 UTF-16-unit contract, including Workerd Request.text's
 * replacement decoding and retained BOM. A byte limit would reject valid Unicode. */
async function verificationBody280(request:Request):Promise<string|null>{
 if(request.bodyUsed)throw new TypeError('Request body already consumed');
 const reader=request.body?.getReader();if(!reader)return '';
 let text='';
 try{
  const decoder=new TextDecoder('utf-8',{fatal:false,ignoreBOM:true}),prototype=Object.getPrototypeOf(Uint8Array.prototype);
  const getter=(key:string|symbol)=>Object.getOwnPropertyDescriptor(prototype,key)!.get!;
  const tag=getter(Symbol.toStringTag),length=getter('byteLength'),start=getter('byteOffset'),buffer=getter('buffer');
  for(;;){
   const {done,value}=await reader.read();
   if(done){const tail=decoder.decode();return tail.length>1024-text.length?null:text+tail;}
   if(Reflect.apply(tag,value,[])!=='Uint8Array')throw new TypeError('Expected request bytes');
   const size=Reflect.apply(length,value,[]),base=Reflect.apply(start,value,[]),bytes=Reflect.apply(buffer,value,[]);
   // Bound decoding even when the transport supplies a single very large chunk.
   for(let offset=0;offset<size;offset+=2048){
    const part=decoder.decode(new Uint8Array(bytes,base+offset,Math.min(2048,size-offset)),{stream:true});
    if(part.length>1024-text.length){void reader.cancel().catch(()=>undefined);return null;}
    text+=part;
   }
  }
 }finally{reader.releaseLock();}
}
export async function handleSiteVerification242(request:Request,env:Env,user:VerificationUser242,defer?:RoleWorkDefer242,admitWrite?:()=>Promise<Response|null>):Promise<Response>{
 if(!user||!/^[1-9][0-9]{16,19}$/.test(user.id))return answer({error:'authentication_required'},401);
 if(request.method==='POST'){
  // The same account allowance as other site writes; malformed attempts count.
  // This precedes body work, fresh membership HTTP, durable audit and deferral.
  const rateLimitAt40280=consumeRateLimit280('w:'+user.id,30,60);
  if(rateLimitAt40280.limited)return answer({error:'slow_down',message:'Too many verification requests. Wait a moment, then try again.'},429,{...({'Retry-After':'60'}),...rateLimitHeaders280(rateLimitAt40280)});
  const held=await admitWrite?.();if(held)return held;
 }
 const capture=await readPrivacySubject(env,user.id);
 if(capture&&capture.state!=='active')return answer({error:'account_held'},403);
 env=privacyBoundSubjectEnv(env,user.id,capture);
 if(request.method==='GET')return answer(await ownRoleStatus242(env,user.id));
 if(request.method!=='POST')return answer({error:'method_not_allowed'},405);
 const raw=await verificationBody280(request);if(raw===null)return answer({error:'body_too_large'},413);
 let input:{action?:unknown;character?:unknown};try{input=JSON.parse(raw);}catch{return answer({error:'bad_json'},400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='action'&&k!=='character'))return answer({error:'bad_body'},400);
 // A slow body cannot carry an old session/standing observation into a write.
 const held=await admitWrite?.();if(held)return held;
 if(input.action==='refresh'){
  const receipt=await requestRoleReconciliation242(env,user.id,'authenticated_web_refresh');
  if(receipt.kind==='created')defer?.('web_role242',()=>kickRoleWork242(env,'requests'));
  return answer({status:receipt.kind==='created'?'queued':receipt.kind,content:roleRequestText280(receipt)},receipt.kind==='unknown'?503:receipt.kind==='held'?409:200);
 }
 if(input.action!==undefined&&input.action!=='request'||typeof input.character!=='string'||input.character.length>64)return answer({error:'full_character_name_required',content:'Enter your full in-game name as First Last.'},400);
 const response=await requestCharacterCode242(env,user,input.character);
 const message=await response.json() as {data?:{content?:string}};
 const issue=verificationIssueOutcome280(response);
 if(issue?.reconciliation?.kind==='created')defer?.('web_role242',()=>kickRoleWork242(env,'requests'));
 return answer({content:message.data?.content??'The verification request could not be completed.'},issue?.refusal?429:issue?.reconciliation?.kind==='unknown'?503:issue?.reconciliation?.kind==='held'?409:response.status,issue?.refusal?{'Retry-After':String(issue.refusal.retryAfterSeconds)}:{});
}

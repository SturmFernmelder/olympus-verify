/** Original authenticated intake only. This opaque, single-use origin is not
 * available from client JSON, a site session, or a copied HTTP response. */
import type {Env} from './env';
import {snapshotDataFields} from './account-generation-contracts';
import {isPrivacyWriteAdmissionDatabase} from './privacy-write-admission';
import {captureLaunchVerification} from './launch-verification227';
import {checkOriginalNativeRequest,checkOriginalNativeHeaders,ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,captureOriginalNativeRequestBody,readOriginalNativeBodyPacket,cancelOriginalNativeBodyReader,releaseOriginalNativeBodyReader} from './privacy-native-http-intrinsics';
import {uniqueJsonKeys} from './network-profile';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';

export const LATE_FORWARD_SINCE285=1794844114; // Actual16Nov2026 15:48:34UTC design boundary; never renewed.
export type OriginalWatcherIntake285=Readonly<{kind:'original_watcher_intake285'}>;
export type WatcherIntakeFacts285=Readonly<{env:Env;entries:readonly Readonly<Record<string,unknown>>[];bodyDigest:string;expiresAt:number;check:()=>void;spend:()=>void}>;
const origins=new WeakMap<OriginalWatcherIntake285,WatcherIntakeFacts285>(),requests=new WeakSet<Request>();
const encoder=new TextEncoder(),encode=encoder.encode.bind(encoder),subtle=crypto.subtle,digest=subtle.digest.bind(subtle),parse=JSON.parse.bind(JSON),stringify=JSON.stringify.bind(JSON);
const VOLATILE=new Set(['status','acknowledgedAt','outcome','attempts','serverReceipt']);
const held=():never=>{throw Error('original_watcher_intake_held');};
function canonical(value:unknown,depth=0,topVolatile=false):string{
 if(depth>32)return held();
 if(typeof value==='string'){for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return held();}else if(n>=0xdc00&&n<=0xdfff)return held();}return stringify(value);}
 if(value===null||typeof value==='boolean')return stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))return held();return String(value);}
 if(!value||typeof value!=='object'||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))return held();
 if(Array.isArray(value)){
  if(value.length>10000||Reflect.ownKeys(value).length!==value.length+1)return held();
  return '['+Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))return held();return canonical(d.value,depth+1);}).join(',')+']';
 }
 const keys=Reflect.ownKeys(value);if(keys.length>1000||keys.some(k=>typeof k!=='string'||!/^[\x20-\x7e]+$/.test(k)))return held();
 return '{'+(keys as string[]).filter(k=>!topVolatile||!VOLATILE.has(k)).sort().map(k=>{const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return held();return stringify(k)+':'+canonical(d.value,depth+1);}).join(',')+'}';
}
function freeze(value:unknown):unknown{if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze((value as Record<string,unknown>)[key]);Object.freeze(value);}return value;}
const hash=async(value:string)=>Array.from(new Uint8Array(await digest('SHA-256',encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
/** Matches the existing Watcher canonical-body recipe for the closed typed
 * intake schema. Unsupported numbers/keys remain held, never guessed hashes. */
export async function canonicalIntakeBodySHA285(value:unknown):Promise<string>{return hash(canonical(value,0,true));}
const same=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
const equal=(a:string,b:string)=>{let n=a.length^b.length;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return n===0;};

/** The sole production caller is index.ts after watcherAuthorized and normal
 * versioned Native admission. This issuer itself reads the actual native body;
 * no caller-supplied raw text, parsed body or bodyUsed assertion is evidence. */
export async function captureOriginalWatcherIntake285(request:Request,env:Env):Promise<OriginalWatcherIntake285|null>{
 try{
  if(requests.has(request))return null;
  checkOriginalNativeRequest(request);
  const read=(name:string)=>Reflect.apply(ORIGINAL_REQUEST_DESCRIPTORS[name]!.get!,request,[]),url=read('url') as string,method=read('method'),headers=read('headers') as Headers;
  checkOriginalNativeHeaders(headers);const get=(name:string)=>Reflect.apply(ORIGINAL_HEADER_DESCRIPTORS.get!.value,headers,[name]) as string|null;
  const location=new URL(url),auth=get('Authorization'),contentType=get('Content-Type');
  if(method!=='POST'||location.pathname!=='/ingest/intake242'||location.searchParams.size!==1||location.searchParams.get('keyVersion')!=='launch-membership-v1'||read('bodyUsed')!==false||!/^application\/json(?:\s*;|$)/i.test(contentType??''))return null;
  const keys=['DB','GUILD_ID','WATCHER_TOKEN','VERIFY_SECRET','VERIFY_MEMBERSHIP_ONLY','VERIFY_NATIVE_SCOPE','PUBLIC_BASE_URL','DISCORD_BOT_TOKEN','LINKS_NOT_BEFORE','BLOCKING_ROLE_IDS'] as const,proto=Object.getPrototypeOf(env),slots=keys.map(k=>Object.getOwnPropertyDescriptor(env,k));
  if(slots.some((s,i)=>s?!Object.hasOwn(s,'value'):keys[i]! in env)||slots.slice(0,8).some(s=>!s||!Object.hasOwn(s,'value')))return null;
  const token=slots[2]!.value;if(typeof token!=='string'||token.length<32||typeof auth!=='string'||!auth.startsWith('Bearer ')||!isPrivacyWriteAdmissionDatabase(env.DB)||location.origin!==new URL(env.PUBLIC_BASE_URL).origin)return null;
  const launch=captureLaunchVerification(env);if(launch.mode!=='members-only'||!launch.scope)return null;
  requests.add(request); // Reserve before reading/crypto awaits; one original request, one origin.
  const expiresAt=Math.floor(originalRecoveryClockMilliseconds()/1000)+300;
  let bodyComplete=false,spent=false;
  const stream=read('body');
  const check=()=>{checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);
   if(Math.floor(originalRecoveryClockMilliseconds()/1000)>=expiresAt||Object.getPrototypeOf(env)!==proto||keys.some((k,i)=>!same(slots[i],Object.getOwnPropertyDescriptor(env,k))||slots[i]===undefined&&k in env)||!launch.current()||!isPrivacyWriteAdmissionDatabase(env.DB)||read('url')!==url||read('method')!==method||read('headers')!==headers||read('body')!==stream||bodyComplete&&read('bodyUsed')!==true||get('Authorization')!==auth||get('Content-Type')!==contentType)held();
  };check();
  const [given,expected]=await Promise.all([hash(auth.slice(7)),hash(token)]);check();if(!equal(given,expected))return null;
  const reader=captureOriginalNativeRequestBody(request);if(!reader)return null;
  let raw:string;
  try{const chunks:Uint8Array[]=[];let bytes=0;
   for(;;){const packet=await readOriginalNativeBodyPacket(reader);check();if(packet.done)break;
    if(!packet.value)return held();bytes+=packet.value.byteLength;if(bytes>1048576){await cancelOriginalNativeBodyReader(reader);return null;}chunks.push(packet.value);}
   bodyComplete=true;check();const joined=new Uint8Array(bytes);let at=0;for(const part of chunks){joined.set(part,at);at+=part.byteLength;}
   raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(joined);
  }finally{try{releaseOriginalNativeBodyReader(reader);}catch{}}
  if(!uniqueJsonKeys(raw))return null;
  const data=parse(raw),object=snapshotDataFields(data,['entries'],'watcher_intake_body285');
  const entries=Array.isArray(object.entries)?object.entries:object.entries&&typeof object.entries==='object'?Object.values(object.entries):null;
  if(!entries||entries.length>25||entries.some(e=>!e||typeof e!=='object'||Array.isArray(e)))return null;
  const bodyDigest=await hash(canonical(data)),copied=freeze(entries) as WatcherIntakeFacts285['entries'];check();
  const origin=Object.freeze({kind:'original_watcher_intake285' as const}),spend=()=>{check();if(spent)held();spent=true;};
  origins.set(origin,Object.freeze({env,entries:copied,bodyDigest,expiresAt,check,spend}));return origin;
 }catch{return null;}
}
export function originalWatcherIntake285(origin:OriginalWatcherIntake285):WatcherIntakeFacts285{const facts=origins.get(origin);if(!facts)return held();facts.check();return facts;}

/** Canonical cookie protocol and original read witness only; no issuer, row lookup or action authority.
 * The sole issuer lives with the private acknowledged OAuth reply. Normal row recreation is fenced
 * by the signed original n and a same-statement native comparison, not by this parser alone. */
import type {Env} from './env';

export const INCARNATION_SESSION_PURPOSE='session-incarnation-v1';
export const INCARNATION_SESSION_SECONDS=7*86400;
export type OriginalSiteSession=Readonly<{u:string;v:number;e:number;g:string|null;n:string}>;
type Slot=Readonly<{owner:object;key:string;descriptor:PropertyDescriptor}>;
type Read=Readonly<{secret:string;raw:string;check:()=>number}>;
function snowflake(v:unknown):v is string{if(typeof v!=='string'||v.length<17||v.length>20)return false;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c<48||c>57)return false;}return true;}
function lowerHex32(v:unknown):v is string{if(typeof v!=='string'||v.length!==32)return false;for(let i=0;i<32;i++){const c=v.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102))return false;}return true;}
const NativeRequest=Request,NativeHeaders=Headers;
const requestSlots=Object.getOwnPropertyDescriptors(NativeRequest.prototype);
const headersSlot=Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get')!;
const headersGet=headersSlot.value as typeof Headers.prototype.get;
const reads=new WeakMap<OriginalSiteSession,Read>();
const refused=():never=>{throw Error('original_site_session_held');};
function sameDescriptor(a:PropertyDescriptor|undefined,b:PropertyDescriptor):boolean{return !!a&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.configurable===b.configurable&&a.enumerable===b.enumerable;}
function own(o:object,key:string):Slot{const d=Object.getOwnPropertyDescriptor(o,key);if(!d||!Object.hasOwn(d,'value'))return refused();return Object.freeze({owner:o,key,descriptor:Object.freeze({...d})});}
function cookieTuple(request:Request):Readonly<{tuple:string;raw:string}>{
 if(Request!==NativeRequest||Headers!==NativeHeaders||!(request instanceof NativeRequest))return refused();
 for(const name of ['url','method','headers'])if(!sameDescriptor(Object.getOwnPropertyDescriptor(NativeRequest.prototype,name),requestSlots[name]!))return refused();
 if(!sameDescriptor(Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get'),headersSlot))return refused();
 const url=requestSlots.url!.get!.call(request) as string,method=requestSlots.method!.get!.call(request) as string,headers=requestSlots.headers!.get!.call(request) as Headers;
 const raw=headersGet.call(headers,'Cookie')??'';
 if(typeof url!=='string'||url.length>8192||typeof method!=='string'||typeof raw!=='string'||raw.length>8192)return refused();
 return Object.freeze({tuple:JSON.stringify([url,method,raw]),raw});
}
function captureRead(env:Env,request:Request):Read{
 const original=own(env,'COOKIE_SECRET'),secret=original.descriptor.value,snapshot=cookieTuple(request),initialClock=Date.now();
 if(typeof secret!=='string'||!secret||secret.length>4096||!Number.isSafeInteger(initialClock)||initialClock<1000)return refused();let lastClock=initialClock;
 const pieces=snapshot.raw.split(/;\s*/).filter(p=>p.startsWith('__Host-olg='));
 const raw=pieces.length===1?pieces[0]!.slice('__Host-olg='.length):'';
 const check=()=>{const t=Date.now();if(!Number.isSafeInteger(t)||t<lastClock||!sameDescriptor(Object.getOwnPropertyDescriptor(original.owner,original.key),original.descriptor)||cookieTuple(request).tuple!==snapshot.tuple)return refused();lastClock=t;return t;};
 check();return Object.freeze({secret,raw,check});
}
function b64(bytes:Uint8Array):string{return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function bytes(raw:string):Uint8Array{if(!/^[A-Za-z0-9_-]+$/.test(raw))return refused();const p=raw.length%4===0?'':'='.repeat(4-raw.length%4);const out=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+p),c=>c.charCodeAt(0));if(b64(out)!==raw)return refused();return out;}
function integer(v:unknown):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>=1;}
/** Data validation is not a receipt/brand; this utility cannot sign a shaped tuple. */
export function canonicalSiteSession(value:unknown):OriginalSiteSession{
 if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).join('|')!=='u|v|e|g|n')return refused();
 const get=(key:string)=>own(value,key).descriptor.value,u=get('u'),v=get('v'),e=get('e'),g=get('g'),n=get('n');
 if(!snowflake(u)||!integer(v)||!integer(e)||!Number.isSafeInteger(e*1000)||g!==null&&!lowerHex32(g)||!lowerHex32(n))return refused();
 return Object.freeze(Object.assign(Object.create(null),{u,v,e,g:g as string|null,n})) as OriginalSiteSession;
}
export function canonicalSiteSessionBody(value:OriginalSiteSession):string{return b64(new TextEncoder().encode(JSON.stringify(canonicalSiteSession(value))));}
/** Exact five-field MAC/body. Old cookies, duplicate names/JSON keys and late credentials refuse. */
export async function readOriginalSiteSession(env:Env,request:Request):Promise<OriginalSiteSession|null>{
 try{
  const read=captureRead(env,request),raw=read.raw;
  if(!raw||raw.length>512||!/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.test(raw))return null;
  const [body,mac]=raw.split('.'),decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes(body!)),parsed=canonicalSiteSession(JSON.parse(decoded));
  if(JSON.stringify(parsed)!==decoded||canonicalSiteSessionBody(parsed)!==body)return null;
  let t=Math.floor(read.check()/1000);if(!integer(t)||parsed.e<=t)return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`olympus-site/${INCARNATION_SESSION_PURPOSE}|${read.secret}`),{name:'HMAC',hash:'SHA-256'},false,['verify']);read.check();
  const valid=await crypto.subtle.verify('HMAC',key,bytes(mac!),new TextEncoder().encode(body!));read.check();
  t=Math.floor(read.check()/1000);if(!valid||!integer(t)||parsed.e<=t)return null;
  reads.set(parsed,read);return parsed;
 }catch{return null;}
}
/** Original read custody only; callers still repeat original n in the same native positive probe. */
export function assertOriginalSiteSessionRead(session:OriginalSiteSession):void{const read=reads.get(session);if(!read)return refused();const t=read.check();if(session.e<=Math.floor(t/1000))return refused();}

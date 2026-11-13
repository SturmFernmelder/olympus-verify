import {now} from './db';

export type RateLimitResult280=Readonly<{limited:boolean;retryAfterSeconds:number}>;
type Bucket={n:number;reset:number;window:number};
const CAPACITY=5000,buckets=new Map<string,Bucket>();
let earliest=Infinity,addressKey:Promise<CryptoKey>|undefined;
const result=(limited:boolean,retryAfterSeconds:number):RateLimitResult280=>Object.freeze({limited,retryAfterSeconds});
const remaining=(reset:number,t:number)=>Math.max(1,Math.ceil(reset-t));

/** Soft per-isolate admission only. Fresh buckets are never evicted to admit a
 * new key; capacity rejection cannot reset someone else's exhausted allowance. */
export function consumeRateLimit280(key:string,max:number,windowSeconds:number):RateLimitResult280{
 if(typeof key!=='string'||!key.length||key.length>512||!Number.isSafeInteger(max)||max<1||!Number.isSafeInteger(windowSeconds)||windowSeconds<1||windowSeconds>86400)throw Error('invalid_soft_rate_limit');
 const t=now();let b=buckets.get(key);
 if(b&&b.reset<=t){buckets.delete(key);b=undefined;}
 if(!b){
  if(buckets.size>=CAPACITY&&earliest<=t){
   earliest=Infinity;
   for(const [k,v] of buckets){if(v.reset<=t)buckets.delete(k);else earliest=Math.min(earliest,v.reset);}
  }
  if(buckets.size>=CAPACITY)return result(true,remaining(earliest,t));
  b={n:0,reset:t+windowSeconds,window:windowSeconds};buckets.set(key,b);earliest=Math.min(earliest,b.reset);
 }
 // Some trusted callers deliberately share one counter with different read/
 // write thresholds (news webhook GET30 / POST10). Neither threshold nor a
 // lower write cap may reset, lower or split that original count/window.
 if(b.window!==windowSeconds)return result(true,remaining(b.reset,t));
 b.n=Math.min(b.n+1,Number.MAX_SAFE_INTEGER);
 return result(b.n>max,b.n>max?remaining(b.reset,t):0);
}
/** Census needs both its account allowance and the shared preview allowance.
 * Check and spend synchronously as one isolate-local operation: a refusal by
 * either bucket must not consume the other member's capacity. No await, bucket
 * eviction or reset of an existing window is permitted here. */
export function consumeRateLimitPair280(firstKey:string,firstMax:number,secondKey:string,secondMax:number,windowSeconds:number):RateLimitResult280{
 const specs=[{key:firstKey,max:firstMax},{key:secondKey,max:secondMax}];
 if(firstKey===secondKey||!Number.isSafeInteger(windowSeconds)||windowSeconds<1||windowSeconds>86400
  ||specs.some(s=>typeof s.key!=='string'||!s.key.length||s.key.length>512||!Number.isSafeInteger(s.max)||s.max<1))throw Error('invalid_soft_rate_limit');
 const t=now();
 for(const {key} of specs){const b=buckets.get(key);if(b&&b.reset<=t)buckets.delete(key);}
 const missing=()=>specs.reduce((n,s)=>n+(buckets.has(s.key)?0:1),0);
 if(buckets.size+missing()>CAPACITY&&earliest<=t){
  earliest=Infinity;
  for(const [key,b] of buckets){if(b.reset<=t)buckets.delete(key);else earliest=Math.min(earliest,b.reset);}
 }
 let retry=0;
 for(const {key,max} of specs){const b=buckets.get(key);if(b&&(b.window!==windowSeconds||b.n>=max))retry=Math.max(retry,remaining(b.reset,t));}
 if(retry)return result(true,retry);
 if(buckets.size+missing()>CAPACITY)return result(true,remaining(earliest,t));
 for(const {key} of specs){
  const b=buckets.get(key);
  if(b)b.n++;
  else{const reset=t+windowSeconds;buckets.set(key,{n:1,reset,window:windowSeconds});earliest=Math.min(earliest,reset);}
 }
 return result(false,0);
}
/** Compatibility for non-HTTP callers; consuming and boolean paths share state. */
export function rateLimited(key:string,max:number,windowSeconds:number):boolean{return consumeRateLimit280(key,max,windowSeconds).limited;}
export function rateLimitHeaders280(receipt:RateLimitResult280):Record<string,string>{return receipt.limited?{'Retry-After':String(receipt.retryAfterSeconds)}:{};}

function ipv4(s:string):number[]|null{
 if(!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s))return null;
 const a=s.split('.').map(Number);return a.every(n=>n<=255)?a:null;
}
// Same IPv6/mapped-v4 vocabulary as Link's MIT upstream normalization. Link
// mode retains its existing /64 grouping; other address callers retain hosts.
function ipv6(s:string):number[]|null{
 const halves=s.toLowerCase().split('::');if(halves.length>2)return null;
 const groups=(part:string,last:boolean):number[]|null=>{
  if(part==='')return [];const out:number[]=[],parts=part.split(':');
  for(let i=0;i<parts.length;i++){const v4=last&&i===parts.length-1?ipv4(parts[i]!):null;
   if(v4)out.push((v4[0]!<<8)|v4[1]!, (v4[2]!<<8)|v4[3]!);
   else if(/^[0-9a-f]{1,4}$/.test(parts[i]!))out.push(parseInt(parts[i]!,16));else return null;
  }return out;
 };
 const left=groups(halves[0]!,halves.length===1),right=halves.length===2?groups(halves[1]!,true):[];
 if(!left||!right)return null;if(halves.length===1)return left.length===8?left:null;
 const fill=8-left.length-right.length;return fill>=1?[...left,...Array<number>(fill).fill(0),...right]:null;
}
function normalizedAddress(value:string,mode:'full'|'link64'):string{
 if(typeof value!=='string'||value.length>128)return 'invalid';const s=value.trim();if(!s)return 'missing';
 const v4=ipv4(s);if(v4)return 'v4:'+v4.join('.');const h=ipv6(s);if(!h)return 'invalid';
 if(h.slice(0,5).every(n=>n===0)&&h[5]===0xffff)return 'v4:'+[(h[6]!>>8),h[6]!&255,h[7]!>>8,h[7]!&255].join('.');
 return 'v6:'+h.slice(0,mode==='link64'?4:8).map(n=>n.toString(16)).join(':')+(mode==='link64'?'::/64':'');
}
/** Raw trusted CF address text is used only transiently. No raw address or
 * stable cross-isolate digest enters the bucket map, audit, D1 or a response. */
export async function consumeAddressRateLimit280(purpose:string,address:string,max:number,windowSeconds:number,mode:'full'|'link64'='full'):Promise<RateLimitResult280>{
 if(!/^[A-Za-z0-9:./_-]{1,96}$/.test(purpose)||mode!=='full'&&mode!=='link64')throw Error('invalid_address_rate_limit');
 const normalized=normalizedAddress(address,mode);
 const pending=addressKey??(addressKey=crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'},false,['sign']).then(key=>{if('privateKey' in key||key.type!=='secret'||key.extractable)throw Error('address_rate_key_unavailable');return key;}));
 const key=await pending;
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('soft-address280-v1|'+purpose+'|'+normalized));
 const digest=Array.from(new Uint8Array(mac),n=>n.toString(16).padStart(2,'0')).join('');
 return consumeRateLimit280('address280:'+purpose+':'+digest,max,windowSeconds);
}

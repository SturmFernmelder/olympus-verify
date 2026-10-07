/** Dormant finite v1 profile. New proposed wire format, NOT claimed compatible with a released client/API. */
export const NETWORK_PATH="/network/roster";
export const NETWORK_PROFILE="olympus-network-roster-v1";
export const NETWORK_LIMITS={guids:1000,bodyBytes:64000,sources:100,links:1000,effects:2000,statements:24,deadlineMs:8000} as const;
const TOKEN=/^[A-Za-z0-9_-]{22}$/;
const SF=/^[1-9][0-9]{16,19}$/;
export const token=(v:unknown):v is string=>typeof v==="string"&&TOKEN.test(v);
export const snowflake=(v:unknown):v is string=>typeof v==="string"&&SF.test(v);
export const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function record(raw:unknown,keys:readonly string[]):Record<string,unknown>|null {
  if(!raw||typeof raw!=="object")return null;
  try{
    if(Array.isArray(raw)||![null,Object.prototype].includes(Object.getPrototypeOf(raw)))return null;
    const descriptors=Object.getOwnPropertyDescriptors(raw),own=Reflect.ownKeys(raw);
    if(own.length!==keys.length||own.some(k=>typeof k!=="string"||!keys.includes(k)))return null;
    const out:Record<string,unknown>=Object.create(null);
    for(const key of keys){const d=descriptors[key];if(!d||!("value"in d)||!d.enumerable)return null;out[key]=d.value;}
    return out;
  }catch{return null;}
}
export function guid(raw:unknown):string|null {
  if(typeof raw!=="string"||!/^Player-[1-9][0-9]{0,5}-[0-9A-Fa-f]{4,16}$/i.test(raw))return null;
  return raw.toUpperCase(); // equality also canonicalizes existing committed proof GUIDs in SQL
}
export function origin(raw:unknown):string|null {
  if(typeof raw!=="string"||raw.length>256)return null;
  try{const u=new URL(raw);return u.protocol==="https:"&&u.origin===raw&&!u.username&&!u.password&&!u.port&&u.hostname!=="localhost"?raw:null;}catch{return null;}
}
function label(raw:unknown,max:number):raw is string {
  return typeof raw==="string"&&raw.length>=1&&raw.length<=max&&raw===raw.trim()&&!/[\u0000-\u001f\u007f]/.test(raw);
}
export interface SourceInput { guildNumber:number;guildName:string;realm:string;ruleset:string;serverId:string;officerGuid:string;freshnessSeconds:number|null;minimumMembers:number;maximumShrinkPercent:number }
export function sourceInput(raw:unknown):SourceInput|null {
  const r=record(raw,["guildNumber","guildName","realm","ruleset","serverId","officerGuid","freshnessSeconds","minimumMembers","maximumShrinkPercent"]);
  const officer=r&&guid(r.officerGuid);
  if(!r||!integer(r.guildNumber,2,10)||!label(r.guildName,128)||!label(r.realm,128)||!label(r.ruleset,64)||typeof r.serverId!=="string"||!/^[1-9][0-9]{0,5}$/.test(r.serverId)||!officer||officer.split("-")[1]!==r.serverId||!(r.freshnessSeconds===null||integer(r.freshnessSeconds,60,604800))||!integer(r.minimumMembers,1,1000)||!integer(r.maximumShrinkPercent,0,100))return null;
  return Object.freeze({...r,officerGuid:officer}) as unknown as SourceInput;
}
export interface ExportInput { profile:typeof NETWORK_PROFILE;guildNumber:number;realm:string;ruleset:string;sourceEpoch:string;sequence:number;exportedAt:number;guids:readonly string[] }
export function exportInput(raw:unknown):ExportInput|null {
  const r=record(raw,["profile","guildNumber","realm","ruleset","sourceEpoch","sequence","exportedAt","guids"]);
  if(!r||r.profile!==NETWORK_PROFILE||!integer(r.guildNumber,2,10)||!label(r.realm,128)||!label(r.ruleset,64)||!token(r.sourceEpoch)||!integer(r.sequence,1)||!integer(r.exportedAt,1))return null;
  try{
    if(!Array.isArray(r.guids)||Object.getPrototypeOf(r.guids)!==Array.prototype)return null;
    const ds=Object.getOwnPropertyDescriptors(r.guids) as unknown as Record<string,PropertyDescriptor>,length=ds.length?.value;
    if(!integer(length,0,1000)||Reflect.ownKeys(r.guids).length!==length+1)return null;
    const values:string[]=[],seen=new Set<string>();
    for(let n=0;n<length;n++){const d=ds[String(n)],g=d&&"value"in d&&guid(d.value);if(!g||seen.has(g))return null;seen.add(g);values.push(g);}
    values.sort();return Object.freeze({...r,guids:Object.freeze(values)}) as unknown as ExportInput;
  }catch{return null;}
}
/** No credentials, transport, queue API or filesystem capability. Only the fixed network endpoint can be constructed. */
export function networkWatcherRequest(botOrigin:string,input:ExportInput):Readonly<{url:string;method:"POST";body:string;redirect:"error"}>|null {
  const base=origin(botOrigin),body=exportInput(input);
  if(!base||!body)return null;
  const encoded=JSON.stringify(body);
  if(new TextEncoder().encode(encoded).length>NETWORK_LIMITS.bodyBytes)return null;
  return Object.freeze({url:base+NETWORK_PATH,method:"POST",body:encoded,redirect:"error"});
}
/** Stream byte cap before parse, strict UTF8; duplicate decoded keys are rejected by a finite JSON recognizer. */
export async function readNetworkBody(request:Request):Promise<ExportInput|null> {
  const type=request.headers.get("Content-Type")?.split(";",1)[0].trim().toLowerCase();
  if(type!=="application/json"||!request.body)return null;
  const declared=request.headers.get("Content-Length");
  if(declared!==null&&(!/^(0|[1-9][0-9]{0,5})$/.test(declared)||Number(declared)>NETWORK_LIMITS.bodyBytes))return null;
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let total=0;const end=Date.now()+NETWORK_LIMITS.deadlineMs;
  try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;
      const remaining=end-Date.now();if(remaining<=0)return null;
      let chunk:ReadableStreamReadResult<Uint8Array>;
      try{chunk=await Promise.race([reader.read(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("network_body_deadline")),remaining);})]);}
      finally{if(timer!==undefined)clearTimeout(timer);}
      const {done,value}=chunk;if(done)break;total+=value.byteLength;if(total>NETWORK_LIMITS.bodyBytes)return null;parts.push(value);}
    const bytes=new Uint8Array(total);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
    const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);
    if(!uniqueJsonKeys(text))return null;
    return exportInput(JSON.parse(text));
  }catch{return null;}finally{try{void reader.cancel().catch(()=>{});}catch{}}
}
// Bounded by64000 bytes/depth8. This parses JSON syntax only to reject decoded duplicate object keys.
export function uniqueJsonKeys(text:string):boolean {
  let p=0,nodes=0;const ws=()=>{while(/[\x20\t\r\n]/.test(text[p]??"x"))p++;};
  const string=():string=>{const start=p;if(text[p++]!=='"')throw 0;let escaped=false;for(;p<text.length;p++){const c=text[p];if(!escaped&&c==='"'){p++;return JSON.parse(text.slice(start,p));}if(!escaped&&c.charCodeAt(0)<32)throw 0;if(!escaped&&c==='\\')escaped=true;else escaped=false;}throw 0;};
  const value=(depth:number):void=>{if(depth>8||++nodes>10100)throw 0;ws();const c=text[p];if(c==='"'){string();return;}if(c==='{'||c==='['){p++;ws();const object=c==='{',close=object?'}':']',keys=new Set<string>();if(text[p]===close){p++;return;}for(;;){if(object){const key=string();if(keys.has(key))throw 0;keys.add(key);ws();if(text[p++]!==':')throw 0;}value(depth+1);ws();if(text[p]===close){p++;return;}if(text[p++]!==',')throw 0;ws();}}const m=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(p));if(!m)throw 0;p+=m[0].length;};
  try{if(typeof text!=="string"||new TextEncoder().encode(text).length>64000)return false;value(0);ws();return p===text.length;}catch{return false;}
}

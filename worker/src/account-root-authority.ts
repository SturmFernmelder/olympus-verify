/** Dormant root issuer. This module supplies no dispatcher, scope bootstrap or other-mode adapter. */
import { id,token,digest,snapshotDataFields,snapshotDataArray } from './account-generation-contracts';
import { verify, b64u, PAGE_VERSION, SESSION_COOKIE } from './site-core';
import { rootScopeProvenance,rootDeploymentIdentity } from './account-root-scope';
import { ROOT_CAPTURE_SITE_SQL,ROOT_SITE_TICKET_FENCE,ROOT_SITE_TICKET_READBACK } from './account-root-fences';
export const ROOT_AUTHORITY_ENTRY_ENABLED=false as const;
export type RootPurpose='account_write'|'role_grant'|'role_remove'|'erasure';
declare const brand:unique symbol;
export type RootCapture=Readonly<{[brand]:true}>;
export interface RootDatabase {prepare(sql:string):{bind(...v:unknown[]):{all():Promise<unknown>}}}
type Config=Readonly<{db:RootDatabase;origin:string;guildId:string;roleGuildId:string;applicationId:string;cookieSecret:string}>;
export type RootTuple=Readonly<{subject:string;purpose:RootPurpose;accountGeneration:string;accountState:'active';accountRevision:number;provenanceKind:'reviewed-legacy'|'verified-new';provenanceDigest:string;purposeGeneration:string;purposeRevision:number;epoch:string;controlRevision:number;scopeRevision:number;scopeProvenanceDigest:string;guildId:string;applicationId:string;mode:'site';acceptedAt:number;deadline:number;originalSessionVersion:number;originalCheckedAt:number|null;originalInServer:1;originalDenied:0;originalBanned:0}>;
const KEYS=['subject','purpose','accountGeneration','accountState','accountRevision','provenanceKind','provenanceDigest','purposeGeneration','purposeRevision','epoch','controlRevision','scopeRevision','scopeProvenanceDigest','guildId','applicationId','mode','acceptedAt','deadline','originalSessionVersion','originalCheckedAt','originalInServer','originalDenied','originalBanned'] as const;
const held=()=>Object.freeze({state:'held' as const});
const number=(v:unknown,min=0,max=9007199254740989):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const own=<T>(raw:unknown,keys:readonly string[]):T=>snapshotDataFields(raw,keys,'root_data') as T;
function rows(raw:unknown):readonly unknown[]{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('root_reply');
 const ds=Object.getOwnPropertyDescriptors(raw),ks=Reflect.ownKeys(ds);
 if(ks.length>4||ks.some(k=>typeof k!=='string'||!['success','results','meta','error'].includes(k))||ks.some(k=>!Object.hasOwn(ds[k as string]!,'value'))||Object.hasOwn(ds,'error')||ds.success?.value!==true||!ds.results||!ds.meta)throw Error('root_reply');
 const meta=ds.meta.value;if(!meta||typeof meta!=='object'||Array.isArray(meta))throw Error('root_reply');
 const md=Object.getOwnPropertyDescriptors(meta),mk=Reflect.ownKeys(md);
 // G1E1 (root v76, 8 Oct 2026): D1 timings are telemetry only, never authority or time.
 if(mk.length>24||Object.hasOwn(md,'error')||(Reflect.has(meta,'timings')&&!Object.hasOwn(md,'timings')))throw Error('root_reply');
 for(const k of mk){
  if(typeof k!=='string'||!Object.hasOwn(md[k]!,'value'))throw Error('root_reply');
  const value=md[k]!.value;
  if(k==='timings'){
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('root_reply');
   const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)throw Error('root_reply');
   const td=Object.getOwnPropertyDescriptors(value),tk=Reflect.ownKeys(td),duration=td.sql_duration_ms;
   if(tk.length!==1||tk[0]!=='sql_duration_ms'||!duration||!Object.hasOwn(duration,'value')||typeof duration.value!=='number'||!Number.isFinite(duration.value)||duration.value<0)throw Error('root_reply');
  }else if(!['string','number','boolean'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value))||(typeof value==='string'&&value.length>256))throw Error('root_reply');
 }
 return snapshotDataArray(ds.results.value,2,'root_reply');
}
function tuple(raw:unknown):RootTuple{
 const t=own<RootTuple>(raw,KEYS);id(t.subject);id(t.guildId);id(t.applicationId);
 for(const s of [t.accountGeneration,t.purposeGeneration,t.epoch])token(s);
 for(const s of [t.provenanceDigest,t.scopeProvenanceDigest])digest(s);
 if(!['account_write','role_grant','role_remove','erasure'].includes(t.purpose)||t.accountState!=='active'||t.mode!=='site'||!['reviewed-legacy','verified-new'].includes(t.provenanceKind)||![t.accountRevision,t.purposeRevision,t.controlRevision,t.scopeRevision].every(n=>number(n))||!number(t.acceptedAt,1)||!number(t.deadline,t.acceptedAt+1,t.acceptedAt+604800)||!number(t.originalSessionVersion,1,9007199254740990)||(t.originalCheckedAt!==null&&!number(t.originalCheckedAt))||t.originalInServer!==1||t.originalDenied!==0||t.originalBanned!==0)throw Error('root_tuple');
 return t;
}
const requestGetters=Object.getOwnPropertyDescriptors(Request.prototype),headerGet=Headers.prototype.get;
function requestSnapshot(request:Request,origin:string){
 const url=requestGetters.url!.get!.call(request) as string,method=requestGetters.method!.get!.call(request) as string,headers=requestGetters.headers!.get!.call(request) as Headers;
 const cookie=headerGet.call(headers,'Cookie')??'',sentOrigin=headerGet.call(headers,'Origin'),csrf=headerGet.call(headers,'X-Olympus'),fetchSite=headerGet.call(headers,'Sec-Fetch-Site');
 const u=new URL(url);if(url.length>8192||cookie.length>8192||u.origin!==origin||u.username||u.password||!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))throw Error('root_request');
 if(sentOrigin!==null&&sentOrigin!==origin)throw Error('root_origin');
 if(!['GET','HEAD'].includes(method)&&(sentOrigin!==origin||csrf!==PAGE_VERSION||(fetchSite!==null&&fetchSite!=='same-origin')))throw Error('root_csrf');
 const found=cookie.split(';').map(p=>p.trim()).filter(p=>p.startsWith(SESSION_COOKIE+'='));
 if(found.length!==1)throw Error('root_cookie');
 const match=found[0]!.slice(SESSION_COOKIE.length+1).match(/^([A-Za-z0-9_-]{1,1024})\.([A-Za-z0-9_-]{43})$/);if(!match)throw Error('root_cookie');
 return Object.freeze({url,method,sentOrigin,csrf,body:match[1]!,mac:match[2]!});
}
/** Root-only server construction: fixed DB identity and configuration are captured before the first await. */
function buildRootAuthority(raw:unknown){
 const c=own<Config>(raw,['db','origin','guildId','roleGuildId','applicationId','cookieSecret']);
 rootDeploymentIdentity(c.guildId,c.roleGuildId,c.applicationId);if(typeof c.origin!=='string')throw Error('root_config');const url=new URL(c.origin);
 if(!c.db||typeof c.db!=='object'||typeof c.origin!=='string'||url.protocol!=='https:'||url.origin!==c.origin||c.origin.length>256||typeof c.cookieSecret!=='string'||c.cookieSecret.length<1||c.cookieSecret.length>4096)throw Error('root_config');
 type Context=Readonly<{tuple:RootTuple;request:ReturnType<typeof requestSnapshot>;db:RootDatabase}>;
 const tickets=new WeakMap<object,Context>();let closed=false;
 const register=(context:Context):RootCapture=>{const ticket=Object.freeze(Object.create(null)) as RootCapture;tickets.set(ticket,context);return ticket;};
 const lookup=(ticket:unknown):Context|undefined=>!closed&&ticket!==null&&(typeof ticket==='object'||typeof ticket==='function')?tickets.get(ticket as object):undefined;
 const read=async(sql:string,payload:string)=>rows(await c.db.prepare(sql).bind(payload).all());
 return Object.freeze({
  async captureSite(request:Request,purpose:RootPurpose){try{
   if(closed||!['account_write','role_grant','role_remove','erasure'].includes(purpose))return held();
   const r=requestSnapshot(request,c.origin),scopeDigest=await rootScopeProvenance(c.origin,c.guildId,c.applicationId);
   if(!await verify(c.cookieSecret,'session',r.body,r.mac)||closed)return held();
   const bytes=Uint8Array.from(atob(r.body.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-r.body.length%4)%4)),c=>c.charCodeAt(0));
   const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),s=own<{u:string;v:number;e:number}>(JSON.parse(text),['u','v','e']);id(s.u);
   if(!number(s.v,1,9007199254740990)||!number(s.e,1)||text!==JSON.stringify({u:s.u,v:s.v,e:s.e})||b64u(bytes)!==r.body)return held();
   const payload=JSON.stringify({subject:s.u,purpose,originalSessionVersion:s.v,deadline:s.e,guildId:c.guildId,applicationId:c.applicationId,scopeProvenanceDigest:scopeDigest});
   const rr=await read(ROOT_CAPTURE_SITE_SQL,payload);if(rr.length!==1||closed)return held();const t=tuple(rr[0]);
   if(t.subject!==s.u||t.purpose!==purpose||t.originalSessionVersion!==s.v||t.deadline!==s.e||t.guildId!==c.guildId||t.applicationId!==c.applicationId||t.scopeProvenanceDigest!==scopeDigest)return held();
   return Object.freeze({state:'captured' as const,ticket:register(Object.freeze({tuple:t,request:r,db:c.db}))});
  }catch{return held();}},
  describe(ticket:unknown):RootTuple|null{const context=lookup(ticket);return context?Object.freeze({...context.tuple}):null;},
  copy(ticket:unknown):RootCapture|null{const context=lookup(ticket);return context?register(context):null;},
  consumePlan(ticket:unknown){const context=lookup(ticket);return context?Object.freeze({state:'registered' as const,payload:JSON.stringify(context.tuple),predicate:ROOT_SITE_TICKET_FENCE}):held();},
  async current(ticket:unknown){const context=lookup(ticket);if(!context)return held();try{const rr=await read(ROOT_SITE_TICKET_READBACK,JSON.stringify(context.tuple));if(rr.length!==1||closed||lookup(ticket)!==context)return held();const d=own<{admitted:number}>(rr[0],['admitted']);return d.admitted===1?Object.freeze({state:'current' as const}):held();}catch{return held();}},
  captureScheduled:held,captureRetirement:held,captureInteraction:held,
  close(){closed=true;},
 });
}
/** A missing/malformed issuer configuration never falls back to a shaped capture. */
export function createRootAuthority(raw:unknown){
 try{return buildRootAuthority(raw);}catch{return Object.freeze({
  captureSite:async(_request:Request,_purpose:RootPurpose)=>held(),describe:(_ticket:unknown):RootTuple|null=>null,
  copy:(_ticket:unknown):RootCapture|null=>null,consumePlan:(_ticket:unknown)=>held(),current:async(_ticket:unknown)=>held(),
  captureScheduled:held,captureRetirement:held,captureInteraction:held,close(){},
 });}
}

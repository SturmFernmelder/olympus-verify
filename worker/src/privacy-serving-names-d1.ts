/** Names-only owned handler custody. External platform qualification, activation and drain remain separate. */
import type {Env} from './env';
import {recordNames,type DiscordNames} from './names';
import {RecoveryFloorHeld} from './privacy-recovery-floor';
import type {AdmissionLayout} from './privacy-write-admission';
import {handlerNamesOriginCustody,executeHandlerNamesNative,type HandlerServingOrigin} from './privacy-serving-production-origin';
import {privacyBoundSubjectEnv,privacyGenerationLiteralFenceSql,type PrivacySubject} from './privacy-serving-authority';
import {runServingChild,servingContextCustody,type ServingContext} from './privacy-serving-recovery-context';
import type {ServingOriginalConfig} from './privacy-serving-recovery-gate-client';

export type ServingNamesD1Bridge=Readonly<{scope:'handler_names_native_custody';readyToReopen:false}>;
export type ServingNamesD1Attempt=Readonly<{ticketId:string;readyToReopen:false}>;
export type ServingNamesD1Summary=Readonly<{ticketId:string;state:'acknowledged_local'|'unknown';changes:0|1|null;externalOriginQualified:false;providerDrainQualified:false;readyToReopen:false}>;
type Method={receiver:object;owner:object;fn:Function};
type Custody=ReturnType<typeof servingContextCustody>;
type Bridge={parent:ServingContext;custody:Custody;origin:HandlerServingOrigin;config:ServingOriginalConfig;layout:AdmissionLayout;databaseId:string;subject:string;capture:PrivacySubject|null;captureInput:PrivacySubject|null};
type Attempt={parent:ServingContext;bridge:ServingNamesD1Bridge;ticketId:string;nonce:string;user:DiscordNames;sql:string;spent:boolean;phase:'prepared'|'spent'|'acknowledged_local'|'unknown';result:ServingNamesD1Summary|null};
const bridges=new WeakMap<ServingNamesD1Bridge,Bridge>(),attempts=new WeakMap<ServingNamesD1Attempt,Attempt>(),scopes=new WeakMap<ServingContext,Attempt>();
const held=():never=>{throw new RecoveryFloorHeld();};
const hex=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length===n&&!/[^0-9a-f]/.test(v);
function data(object:object,name:string):unknown{const d=Object.getOwnPropertyDescriptor(object,name);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;}
function closed(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).sort().join('|')!==[...keys].sort().join('|'))return held();const out:Record<string,unknown>={};for(const key of keys)out[key]=data(value,key);return Object.freeze(out);}
function method(receiver:object,name:string):Method{let owner:object|null=receiver;for(let depth=0;depth<4&&owner&&owner!==Object.prototype;depth++){const d=Object.getOwnPropertyDescriptor(owner,name);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return held();return {receiver,owner,fn:d.value};}owner=Object.getPrototypeOf(owner);}return held();}
function same(m:Method,name:string):void{const now=method(m.receiver,name);if(now.owner!==m.owner||now.fn!==m.fn)return held();}
function configuration(value:unknown):ServingOriginalConfig{const c=closed(value,['credentialEpoch','writeEpoch','sourceTree','deploymentVersion']);if(!hex(c.credentialEpoch,32)||!hex(c.writeEpoch,32)||c.credentialEpoch===c.writeEpoch||!hex(c.sourceTree,40)||typeof c.deploymentVersion!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(c.deploymentVersion))return held();return c as ServingOriginalConfig;}
function capture(value:unknown,subject:string):PrivacySubject|null{if(value===null)return null;const c=closed(value,['subject','subjectGeneration','state','revision']);if(c.subject!==subject||!hex(c.subjectGeneration,32)||c.state!=='active'||typeof c.revision!=='number'||!Number.isSafeInteger(c.revision)||c.revision<0)return held();return c as PrivacySubject;}
function current(parent:ServingContext,h:ServingNamesD1Bridge):Bridge{const b=bridges.get(h);if(!b||b.parent!==parent)return held();const p=servingContextCustody(parent),o=handlerNamesOriginCustody(b.origin,parent),F=JSON.parse((JSON.parse(p.nativeTuple) as unknown[])[2] as string) as unknown[];
 if(p.nativeTuple!==b.custody.nativeTuple||JSON.stringify(o.config)!==JSON.stringify(b.config)||o.layout!==b.layout||o.databaseId!==b.databaseId||o.subject!==b.subject||JSON.stringify(o.originalCapture)!==JSON.stringify(b.capture)||JSON.stringify(capture(b.captureInput,b.subject))!==JSON.stringify(b.capture)||F[6]!==b.config.credentialEpoch||F[7]!==b.config.writeEpoch||F[8]!==b.config.sourceTree||F[9]!==b.config.deploymentVersion)return held();return b;}
function namesSql(generation:string|null):string{return `UPDATE members SET username = ?2, global_name = ?3, names_at = ?4
      WHERE discord_id = ?1 AND ${privacyGenerationLiteralFenceSql('discord_id',generation)}
       AND (?6 = 1 OR username IS NOT ?2 OR global_name IS NOT ?3 OR names_at IS NULL OR names_at < ?5)`;}
function user(value:unknown,subject:string):DiscordNames{const u=closed(value,['id','username','global_name']);if(u.id!==subject||typeof u.username!=='string'||!u.username||u.username.length>4096||u.username.includes('\0')||u.global_name!==null&&(typeof u.global_name!=='string'||u.global_name.length>4096||u.global_name.includes('\0')))return held();return Object.freeze({id:subject,username:u.username.slice(0,64),global_name:u.global_name?(u.global_name as string).slice(0,64):null});}
function summary(a:Attempt,state:'acknowledged_local'|'unknown',changes:0|1|null):ServingNamesD1Summary{return Object.freeze({ticketId:a.ticketId,state,changes,externalOriginQualified:false as const,providerDrainQualified:false as const,readyToReopen:false as const});}
async function digest(tuple:unknown[]):Promise<string>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(tuple)));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');}

/** A shaped origin cannot issue this bridge. The real handler source owns its native record. */
export function createHandlerServingNamesBridge(parent:ServingContext,origin:HandlerServingOrigin,subject:string,captureInput:PrivacySubject|null):ServingNamesD1Bridge{const o=handlerNamesOriginCustody(origin,parent);if(o.subject!==subject||!/^\d{17,20}$/.test(subject))return held();const h=Object.freeze({scope:'handler_names_native_custody' as const,readyToReopen:false as const});bridges.set(h,{parent,custody:servingContextCustody(parent),origin,config:o.config,layout:o.layout,databaseId:o.databaseId,subject,capture:capture(captureInput,subject),captureInput});current(parent,h);return h;}

export function prepareServingNamesD1(parent:ServingContext,bridge:ServingNamesD1Bridge,original:unknown):ServingNamesD1Attempt{const b=current(parent,bridge),v=closed(original,['ticketId','nonce','user']),projected=user(v.user,b.subject);if(scopes.has(parent)||!hex(v.ticketId,32)||!hex(v.nonce,32)||v.ticketId===b.custody.id||JSON.stringify(projected)!==JSON.stringify(handlerNamesOriginCustody(b.origin,parent).originalUser))return held();const a:Attempt={parent,bridge,ticketId:v.ticketId,nonce:v.nonce,user:projected,sql:namesSql(b.capture?.subjectGeneration??null),spent:false,phase:'prepared',result:null};const h=Object.freeze({ticketId:a.ticketId,readyToReopen:false as const});attempts.set(h,a);scopes.set(parent,a);return h;}

/** The payload acknowledgement is closed; arbitrary resolved objects/void do not establish known work. */
function changes(result:unknown):0|1{if(!result||typeof result!=='object'||Array.isArray(result)||data(result,'success')!==true)return held();const rows=data(result,'results'),meta=data(result,'meta');if(!Array.isArray(rows)||rows.length!==0||!meta||typeof meta!=='object'||Array.isArray(meta))return held();const n=data(meta,'changes');if(n!==0&&n!==1)return held();return n;}

async function producer(a:Attempt):Promise<0|1>{const b=current(a.parent,a.bridge);let prepared=false,bound=false,ran=false,confirmed:0|1|null=null;
 const check=()=>{current(a.parent,a.bridge);if(a.phase!=='spent'||scopes.get(a.parent)!==a)return held();};
 const producerDB=Object.freeze({prepare(sql:unknown){check();if(prepared||sql!==a.sql)return held();prepared=true;return Object.freeze({bind(...values:unknown[]){check();if(bound||values.length!==6)return held();bound=true;const t=values[3];if(values[0]!==b.subject||values[1]!==a.user.username||values[2]!==a.user.global_name||typeof t!=='number'||!Number.isSafeInteger(t)||t<b.custody.createdAt||t>=b.custody.expiresAt||values[4]!==t-86400||values[5]!==0)return held();const binds=Object.freeze([...values]);
   return Object.freeze({async run(){if(ran)return held();ran=true;check();
    const intent=await digest(['private-serving-names-d1-intent-v1',b.databaseId,b.layout,b.custody.nativeTuple,b.config,b.subject,b.capture,a.ticketId,a.nonce,a.sql,binds]);check();
    const result=await runServingChild(a.parent,{ticketId:a.ticketId,purpose:'d1',nonce:a.nonce,requestDigest:intent},async child=>{check();const childCustody=servingContextCustody(child);if(childCustody.createdAt!==b.custody.createdAt||childCustody.expiresAt!==b.custody.expiresAt)return held();
     // This narrow source dispatcher exposes no raw DB and starts only after the original D1 ACK.
     const rawResult=await executeHandlerNamesNative(b.origin,a.parent,child,b.subject,b.capture,a.sql,binds);check();servingContextCustody(child);const n=changes(rawResult),resultDigest=await digest(['private-serving-names-d1-result-v1',intent,n]);check();servingContextCustody(child);return {kind:'known_local' as const,value:n,resultDigest};});
    check();if(!result.claimed||result.state!=='settled'||!result.nativeTerminal||(result.value!==0&&result.value!==1))return held();confirmed=result.value;return Object.freeze({success:true,results:[],meta:{changes:confirmed}});
   }});
  }});
 }});
 // recordNames creates its real timestamp/SQL/binds here, after root ACK and before the sole d1 claim.
 await recordNames({DB:producerDB} as unknown as Env,a.user,false,b.capture);check();if(!prepared||!bound||!ran||confirmed===null)return held();return confirmed;
}

/** One attempt is spent before any asynchronous producer/digest/claim work. Unknown is never retried. */
export async function dispatchServingNamesD1(h:ServingNamesD1Attempt):Promise<ServingNamesD1Summary>{const a=attempts.get(h);if(!a||a.spent)return held();a.spent=true;a.phase='spent';try{current(a.parent,a.bridge);const n=await producer(a);current(a.parent,a.bridge);a.phase='acknowledged_local';return a.result=summary(a,'acknowledged_local',n);}catch{a.phase='unknown';return a.result=summary(a,'unknown',null);}}
/** Local saved observation only; does not dispatch GET, create authority or settle an unknown ticket. */
export function observeServingNamesD1(h:ServingNamesD1Attempt):ServingNamesD1Summary{const a=attempts.get(h);if(!a||!a.spent||!a.result)return held();return a.result;}

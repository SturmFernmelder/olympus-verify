/** A server seal identifies an attended plan, never a native-command acknowledgement. */
import { DIRECTIVE_NATIVE_PROFILE, DIRECTIVE_RANK_DIGEST } from './native-rank-schemes';
export type PromotionIntent = Readonly<{version:1;id:string;actorGuid:string;targetGuid:string;name:string;subjectDigest:string;rankProfile:typeof DIRECTIVE_NATIVE_PROFILE;rankSchemeDigest:typeof DIRECTIVE_RANK_DIGEST;originSnapshotId:number;originSnapshotAt:number;originContext:string;startSlot:number;finalSlot:5|7;reason:'knight-veteran'|'verified-initiate';issuedAt:number;expiresAt:number;acknowledgedSteps:number;lastSnapshotId:number;lastObservedAt:number}>;
const GUID=/^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/;
const PURPOSE='olympus-directive-promotion-intent|1|';
const keys='version,id,actorGuid,targetGuid,name,subjectDigest,rankProfile,rankSchemeDigest,originSnapshotId,originSnapshotAt,originContext,startSlot,finalSlot,reason,issuedAt,expiresAt,acknowledgedSteps,lastSnapshotId,lastObservedAt';
const whole=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
export function validPromotionIntent(v:unknown,at:number):v is PromotionIntent{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const d=Object.getOwnPropertyDescriptors(v);if(Object.keys(d).join(',')!==keys||Object.values(d).some(p=>!Object.hasOwn(p,'value')))return false;
 const p=v as PromotionIntent;
 return p.version===1&&typeof p.id==='string'&&p.id.length>=8&&p.id.length<=160&&!/[\x00-\x1f\x7f]/.test(p.id)&&typeof p.actorGuid==='string'&&typeof p.targetGuid==='string'&&GUID.test(p.actorGuid)&&GUID.test(p.targetGuid)&&p.actorGuid!==p.targetGuid
  &&typeof p.name==='string'&&p.name.length>0&&p.name.length<=100&&!/[\x00-\x1f\x7f]/.test(p.name)&&typeof p.subjectDigest==='string'&&/^[a-f0-9]{64}$/.test(p.subjectDigest)
  &&p.rankProfile===DIRECTIVE_NATIVE_PROFILE&&p.rankSchemeDigest===DIRECTIVE_RANK_DIGEST
  &&whole(p.originSnapshotId,1,Number.MAX_SAFE_INTEGER)&&whole(p.originSnapshotAt,1,at)&&typeof p.originContext==='string'&&/^[a-f0-9]{32}$/.test(p.originContext)
  &&whole(p.startSlot,6,9)&&((p.finalSlot===5&&p.reason==='knight-veteran')||(p.finalSlot===7&&p.startSlot===9&&p.reason==='verified-initiate'))
  &&p.finalSlot<p.startSlot&&whole(p.issuedAt,p.originSnapshotAt,at)&&whole(p.expiresAt,p.issuedAt+1,p.issuedAt+600)&&at<p.expiresAt
  &&whole(p.acknowledgedSteps,0,p.startSlot-p.finalSlot-1)&&whole(p.lastSnapshotId,p.originSnapshotId,Number.MAX_SAFE_INTEGER)&&whole(p.lastObservedAt,p.originSnapshotAt,at)
  &&(p.acknowledgedSteps===0?p.lastSnapshotId===p.originSnapshotId:p.lastSnapshotId>p.originSnapshotId);
}
function encode(value:string):string{const bytes=new TextEncoder().encode(value);let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(value:string):string{const text=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(text,c=>c.charCodeAt(0)));}
async function key(secret:string){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function sealPromotionIntent(intent:PromotionIntent,serverSecret:string,at:number):Promise<string>{
 if(!validPromotionIntent(intent,at)||!serverSecret)throw Error('promotion_intent_held');
 const body=encode(JSON.stringify(intent));return body+'.'+hex(await crypto.subtle.sign('HMAC',await key(serverSecret),new TextEncoder().encode(PURPOSE+body)));
}
export async function readPromotionIntent(token:unknown,serverSecret:string,at:number):Promise<PromotionIntent|null>{
 if(typeof token!=='string'||token.length>4096||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(token)||!serverSecret)return null;
 try{const [body,mac]=token.split('.');const bytes=Uint8Array.from(mac!.match(/../g)!,x=>parseInt(x,16));if(!await crypto.subtle.verify('HMAC',await key(serverSecret),bytes,new TextEncoder().encode(PURPOSE+body)))return null;
 const parsed:unknown=JSON.parse(decode(body!));if(!validPromotionIntent(parsed,at)||encode(JSON.stringify(parsed))!==body)return null;return Object.freeze(parsed);}catch{return null;}
}
/** Fresh native observations may replace source context, never the immutable original intent. */
export function continuationAdmitted(intent:PromotionIntent,input:{actorGuid:string;guid:string;name:string;subjectDigest:string;snapshotId:number;snapshotAt:number;slot:number;rankProfile:string;rankSchemeDigest:string;knight:'knight'|'non-knight'|'unknown';confirmedFrom:number;confirmedTo:number;confirmedAt:number},at:number):boolean{
 return validPromotionIntent(intent,at)&&input.actorGuid===intent.actorGuid&&input.guid===intent.targetGuid&&input.name===intent.name&&input.subjectDigest===intent.subjectDigest
  &&input.rankProfile===intent.rankProfile&&input.rankSchemeDigest===intent.rankSchemeDigest&&input.snapshotId>intent.lastSnapshotId&&input.snapshotAt>=intent.originSnapshotAt
  &&input.confirmedFrom===intent.startSlot-intent.acknowledgedSteps&&input.confirmedTo===input.confirmedFrom-1&&input.slot===input.confirmedTo&&input.slot>intent.finalSlot
  &&whole(input.confirmedAt,Math.max(intent.issuedAt,intent.lastObservedAt),at)&&input.snapshotAt>=input.confirmedAt
  &&(intent.reason==='knight-veteran'?input.knight==='knight':input.knight==='non-knight'&&intent.startSlot===9&&input.confirmedFrom===9&&input.slot===8);
}

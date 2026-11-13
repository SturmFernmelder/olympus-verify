/** Minimal native gold evidence; never a payment allocator, role writer or donor identity claim. */
import type {Env} from './env';
import {normalizeCharacter} from './codes';
import {now} from './db';
import {captureLaunchVerification} from './launch-verification227';
import {nativeMembershipSourceMatches,nativeMembershipSourceSql} from './native-rank-schemes';

export const TITHE_COLLECTOR280='Fern Melder',TITHE_SOURCE280='tithe-gold-v2';
const BASE=['id','type','source','character','guid','requestedAt','requestedBy','guild','realm','clientVersion'];
const FINANCIAL=[...BASE,'donation','evidence'];
const VERIFY=[...BASE,'name','code','nativeMembership','locallyValid','guidSource','observationId','observedAt','rankName','rankIndex','bridgeUntrusted','bridgeSender','mailProof242'];
const ROLE=[...BASE,'name','nativeDiscord','observedAt','rankName','rankIndex','bridgeUntrusted','bridgeSender'];
const GUID=/^Player-[0-9]+-[0-9A-Fa-f]+$/,HEX32=/^[0-9a-f]{32}$/,ID=/^[A-Za-z0-9:._-]{1,128}$/;
const bytes=(s:string)=>new TextEncoder().encode(s),hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
function object(v:unknown,allowed:readonly string[],required:readonly string[]=[]):v is Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const keys=Reflect.ownKeys(v);return keys.every(k=>typeof k==='string'&&allowed.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'))&&required.every(k=>keys.includes(k));
}
const text=(v:unknown,max=96,min=1):v is string=>typeof v==='string'&&bytes(v).length>=min&&bytes(v).length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const name=(v:unknown,max=96):v is string=>text(v,max,2)&&!/[|()\[\]]/.test(v);
const integer=(v:unknown,min=1,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const guid=(v:unknown,empty=false):v is string=>empty&&v===''||text(v,64)&&GUID.test(v);
export const normalizeFullTitheName280=(s:string)=>s.replace(/[ \t\r\n\v\f]+/g,' ').replace(/^ | $/g,'').replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+32));
export type TitheReceipt280=Readonly<{id:string;type:'donation';source:typeof TITHE_SOURCE280;character:string;guid:string;requestedAt:number;requestedBy:typeof TITHE_COLLECTOR280;guild:string;realm:string;clientVersion:string;donation:Readonly<{version:2;kind:'mail'|'trade';copper:number;recipient:typeof TITHE_COLLECTOR280;collectorGuid:string;reference:string}>;evidence:Readonly<{kind:string;confirmedLocal:true;automaticCredit:false;mac:string}>}>;
export function titheMessage280(r:TitheReceipt280):string{
 const d=r.donation,e=r.evidence,fields=[r.id,String(r.requestedAt),d.kind,String(d.copper),normalizeFullTitheName280(r.character),r.guid,normalizeFullTitheName280(d.recipient),d.collectorGuid,r.guild,r.realm,d.reference,r.clientVersion,e.kind,d.recipient];
 return 'tithe-gold-v2|'+fields.map(v=>bytes(v).length+':'+v).join('');
}
export function financialShape280(v:unknown,at=now()):v is TitheReceipt280{
 if(!object(v,FINANCIAL,FINANCIAL)||v.type!=='donation'||v.source!==TITHE_SOURCE280||typeof v.id!=='string'||!/^([0-9a-f]{24})$/.test(v.id)||v.requestedBy!==TITHE_COLLECTOR280||!name(v.character)||!guid(v.guid,true)||!name(v.guild)||!name(v.realm)||!text(v.clientVersion,32)||!/^[A-Za-z0-9._+-]+$/.test(v.clientVersion)||!integer(v.requestedAt)||v.requestedAt<=at-2592000||v.requestedAt>at+5)return false;
 const d=v.donation,e=v.evidence;
 if(!object(d,['version','kind','copper','recipient','collectorGuid','reference'],['version','kind','copper','recipient','collectorGuid','reference'])||!object(e,['kind','confirmedLocal','automaticCredit','mac'],['kind','confirmedLocal','automaticCredit','mac'])||d.version!==2||!integer(d.copper,1,2147483647)||d.recipient!==TITHE_COLLECTOR280||!guid(d.collectorGuid)||typeof d.reference!=='string'||!/^TITHE-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(d.reference)||e.confirmedLocal!==true||e.automaticCredit!==false||typeof e.mac!=='string'||!HEX32.test(e.mac))return false;
 return d.kind==='trade'&&e.kind==='trade_complete_and_money_delta'||d.kind==='mail'&&e.kind==='take_money_inbox_depletion_and_money_delta';
}
/** Read-side qualification of the actual minimized stored shape. This checks
 * original evidence, never signs it again or treats restored bytes as new proof. */
export function storedTitheShape280(v:unknown,storedAt:number):v is Record<string,unknown>&{evidence:Record<string,unknown>}{
 const fields=['version','sourceId','source','character','characterKey','guid','copper','kind','recipient','collectorGuid','guild','realm','reference','clientVersion','evidence','observedAt','classification','retainUntil','payloadHash'];
 if(!object(v,fields,fields)||v.version!==2||v.source!==TITHE_SOURCE280||typeof v.sourceId!=='string'||!/^[0-9a-f]{24}$/.test(v.sourceId)||!name(v.character)||v.characterKey!==normalizeCharacter(v.character)||!guid(v.guid,true)||!integer(v.copper,1,2147483647)||v.recipient!==TITHE_COLLECTOR280||!guid(v.collectorGuid)||!name(v.guild)||!name(v.realm)||!text(v.clientVersion,32)||!/^[A-Za-z0-9._+-]+$/.test(v.clientVersion)||typeof v.reference!=='string'||!/^TITHE-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(v.reference)||v.classification!=='unclassified_receipt'||typeof v.payloadHash!=='string'||!/^[0-9a-f]{64}$/.test(v.payloadHash)||!integer(storedAt)||!integer(v.observedAt)||v.observedAt>storedAt+5||v.retainUntil!==v.observedAt+2592000)return false;
 const e=v.evidence;
 if(!object(e,['kind','confirmedLocal','automaticCredit','mac'],['kind','confirmedLocal','automaticCredit','mac'])||e.confirmedLocal!==true||e.automaticCredit!==false||typeof e.mac!=='string'||!HEX32.test(e.mac))return false;
 return v.kind==='trade'&&e.kind==='trade_complete_and_money_delta'||v.kind==='mail'&&e.kind==='take_money_inbox_depletion_and_money_delta';
}
function membership(v:unknown):boolean{return object(v,['version','member','observedAt','scopeHash','mac'],['version','member','observedAt','scopeHash','mac'])&&v.version===1&&typeof v.member==='boolean'&&integer(v.observedAt)&&typeof v.scopeHash==='string'&&/^[0-9a-f]{16}$/.test(v.scopeHash)&&typeof v.mac==='string'&&HEX32.test(v.mac);}
function mail(v:unknown):boolean{const fields=['version','sender','code','observedAt','guild','realm','collectorGuid','fingerprint','mac'];return object(v,fields,fields)&&v.version===242&&name(v.sender,128)&&text(v.code,7,6)&&integer(v.observedAt)&&name(v.guild,128)&&name(v.realm,128)&&guid(v.collectorGuid)&&typeof v.fingerprint==='string'&&/^[0-9a-f]{64}$/.test(v.fingerprint)&&typeof v.mac==='string'&&HEX32.test(v.mac);}
function discord(v:unknown):boolean{const fields=['version','userID','lastOnlineName','lastOnlineGUID','fromDiscord','observedAt','collectorGuid','guild','realm','mac'];return object(v,fields,fields)&&v.version===242&&typeof v.userID==='string'&&/^[0-9]{17,20}$/.test(v.userID)&&name(v.lastOnlineName,128)&&guid(v.lastOnlineGUID)&&v.fromDiscord===true&&integer(v.observedAt)&&guid(v.collectorGuid)&&name(v.guild,128)&&name(v.realm,128)&&typeof v.mac==='string'&&HEX32.test(v.mac);}
/** Other intake uses its actual native proof-factory fields, never a free-text side channel. */
export function ordinaryIntakeShape280(v:unknown):v is Record<string,unknown>{
 if(!v||typeof v!=='object')return false;const kind=Object.getOwnPropertyDescriptor(v,'type');if(!kind||!Object.hasOwn(kind,'value')||!['verify','role','guild'].includes(kind.value))return false;
 if(!object(v,kind.value==='verify'?VERIFY:ROLE,['id','type','source','character'])||typeof v.id!=='string'||!ID.test(v.id)||!name(v.character,128)||typeof v.source!=='string'||!/^[A-Za-z0-9:._-]{1,64}$/.test(v.source))return false;
 for(const k of ['requestedBy','guild','realm','rankName','name','bridgeSender'])if(k in v&&!name(v[k],128))return false;
 for(const k of ['requestedAt','observedAt'])if(k in v&&!integer(v[k]))return false;
 if('clientVersion'in v&&!text(v.clientVersion,32)||'guid'in v&&!guid(v.guid,true)||'rankIndex'in v&&!integer(v.rankIndex,0,9))return false;
 for(const k of ['locallyValid','bridgeUntrusted'])if(k in v&&typeof v[k]!=='boolean')return false;
 if('observationId'in v&&(typeof v.observationId!=='string'||!HEX32.test(v.observationId))||'guidSource'in v&&!['native-whisper-event','unavailable','UnitGUID-player'].includes(v.guidSource as string))return false;
 if(v.type==='verify'&&(typeof v.code!=='string'||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,7}$/.test(v.code)))return false;
 for(const [key,check]of [['nativeMembership',membership],['mailProof242',mail],['nativeDiscord',discord]] as const)if(key in v&&!check(v[key]))return false;
 return true;
}
export class TitheReceiptPolicyHeld280 extends Error{constructor(){super('intake_policy_held');}}
export type TitheNoEffect280=Readonly<{id:string;character:string;guid:string;observedAt:number;bodySHA256:string;outcome:'receipt_collector_pending';originalNoEffect:true}>;
export class TitheCollectorPending280 extends Error{constructor(readonly original:TitheNoEffect280){super('receipt_collector_pending');}}
async function digest(value:unknown):Promise<string>{return hex(await crypto.subtle.digest('SHA-256',bytes(JSON.stringify(value))));}
function canonicalOriginal280(value:unknown):unknown{
 return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalOriginal280((value as Record<string,unknown>)[key])])):value;
}
/** Validation and current collector corroboration precede one ordinary admitted native transaction. */
export async function recordTitheReceipt280(env:Env,input:unknown):Promise<'unclassified_receipt_recorded'>{
 if(!financialShape280(input))throw new TitheReceiptPolicyHeld280();
 // Capture primitives: later caller changes cannot substitute another original after the MAC await.
 const r=Object.freeze({...input,donation:Object.freeze({...input.donation}),evidence:Object.freeze({...input.evidence})}),launch=captureLaunchVerification(env);
 const original=Object.freeze({id:r.id,character:r.character,guid:r.guid,observedAt:r.requestedAt,bodySHA256:await digest(canonicalOriginal280(r)),outcome:'receipt_collector_pending' as const,originalNoEffect:true as const});
 const pending=()=>new TitheCollectorPending280(original);
 if(launch.mode!=='members-only'||!launch.scope||!launch.current())throw pending();
 const scope=launch.scope;if(typeof env.VERIFY_SECRET!=='string'||!env.VERIFY_SECRET)throw new TitheReceiptPolicyHeld280();if(r.guild!==scope.guild||r.realm!==scope.realm)throw new TitheReceiptPolicyHeld280();
 const key=await crypto.subtle.importKey('raw',bytes(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);if(!launch.current())throw pending();
 const actual=hex(await crypto.subtle.sign('HMAC',key,bytes(titheMessage280(r)))).slice(0,32);if(!launch.current())throw pending();let difference=0;for(let i=0;i<32;i++)difference|=actual.charCodeAt(i)^r.evidence.mac.charCodeAt(i);if(difference!==0)throw new TitheReceiptPolicyHeld280();
 const collectorKey=normalizeCharacter(TITHE_COLLECTOR280),sourceScope=nativeMembershipSourceSql('s.source','?3');
 const snapshot=`s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND ${sourceScope} AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER) AND s.member_count=(SELECT COUNT(*) FROM roster_members count_rows WHERE count_rows.snapshot_id=s.id)`;
 const rows=await env.DB.prepare(`SELECT s.id,s.source,r.guid,r.name,r.name_key FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id WHERE ${snapshot} AND (r.guid=?1 OR r.name_key=?2) LIMIT 3`).bind(r.donation.collectorGuid,collectorKey,scope.provenance).all<{id:number;source:string;guid:string;name:string;name_key:string}>();
 if(!launch.current()||rows.results.length!==1)throw pending();const selected=rows.results[0]!;
 if(!Number.isSafeInteger(selected.id)||selected.id<1||selected.guid!==r.donation.collectorGuid||selected.name!==TITHE_COLLECTOR280||selected.name_key!==collectorKey||!nativeMembershipSourceMatches(selected.source,scope.guild,scope.realm))throw pending();
 const value={version:2,sourceId:r.id,source:TITHE_SOURCE280,character:r.character,characterKey:normalizeCharacter(r.character),guid:r.guid,copper:r.donation.copper,kind:r.donation.kind,recipient:r.donation.recipient,collectorGuid:r.donation.collectorGuid,guild:r.guild,realm:r.realm,reference:r.donation.reference,clientVersion:r.clientVersion,evidence:r.evidence,observedAt:r.requestedAt,classification:'unclassified_receipt',retainUntil:r.requestedAt+2592000};
 const payloadHash=await digest(value),details=JSON.stringify({...value,payloadHash}),subject='intake242:'+r.id;if(!launch.current())throw pending();
 const out=await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM roster_snapshots s WHERE ${snapshot} AND s.id=?4 AND s.source=?5 AND (SELECT COUNT(*) FROM roster_members r WHERE r.snapshot_id=s.id AND (r.guid=?1 OR r.name_key=?2))=1 AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND r.guid=?1 AND r.name_key=?2 AND r.name=?6)) AND ?7>CAST(strftime('%s','now') AS INTEGER)-2592000 AND ?7<=CAST(strftime('%s','now') AS INTEGER)+5 THEN 1 ELSE json_extract('tithe_collector_original_held','$') END AS admitted`).bind(r.donation.collectorGuid,collectorKey,scope.provenance,selected.id,selected.source,TITHE_COLLECTOR280,r.requestedAt),
  env.DB.prepare("INSERT INTO audit(ts,actor,action,subject,details) SELECT ?1,'watcher','treasury.receipt242',?2,?3 WHERE NOT EXISTS(SELECT 1 FROM audit WHERE action='treasury.receipt242' AND subject=?2)").bind(now(),subject,details),
  env.DB.prepare("SELECT CASE WHEN COUNT(*)=1 AND MIN(CASE WHEN json_valid(details) THEN json_extract(details,'$.payloadHash') END)=?2 THEN 1 ELSE json_extract('tithe_original_receipt_conflict_held','$') END AS recorded FROM audit WHERE action='treasury.receipt242' AND subject=?1").bind(subject,payloadHash),
 ]);
 if(!launch.current()||out.length!==3||(out[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1||(out[2]?.results[0] as {recorded?:number}|undefined)?.recorded!==1)throw Error('tithe_receipt_unknown');
 return 'unclassified_receipt_recorded';
}

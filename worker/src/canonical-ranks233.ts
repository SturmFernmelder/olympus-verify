/** Owner .233 policy. One applicable canonical rank grants member access directly;
 * the technical-partner role is separate. This module is pure configuration and
 * planning, never Native admission, provider ownership or a migration capability. */
import {DIRECTIVE_CANONICAL_PROFILE,DIRECTIVE_CANONICAL_INDEX,DIRECTIVE_RANK_NAMES} from './native-rank-constants';
export const CANONICAL_GUILD233='236932545793490944';
export const CANONICAL_PROFILE233='olympus-canonical-ranks-20261106-v1';
export const CANONICAL_RANKS233=Object.freeze([
 ['guild-master','Olympus Guild Master','1554261979684933742'],
 ['high-council','Olympus High Council','1567917738985398384'],
 ['officer','Olympus Officer','1554262223038324840'],
 ['officer-alt','Olympus Officer Alt','1561096070040125460'],
 ['raid-leader','Olympus Raid Leader','1554262510650007602'],
 ['branch-gm','Olympus Branch GM','1555639603619172504'],
 ['branch-officer','Olympus Branch Officer','1555640676287385771'],
 ['veteran','Olympus Veteran','1561096452057596005'],
 ['raider','Olympus Raider','1561096598296076460'],
 ['member','Olympus Member','1552077551839617104'],
 ['alt','Olympus Alt','1561096900378103808'],
 ['initiate','Olympus Initiate','1561097105974628372'],
].map(([key,name,roleId])=>Object.freeze({key:key!,name:name!,roleId:roleId!})));
export const ADDON_DEVELOPER233=Object.freeze({key:'addon-developer',name:'Olympus Addon Developer',roleId:'1555944857380458556'});
export const LEGACY_RANK_ROLE_IDS233=Object.freeze(['1561095726115725373','1561095748039221339','1561095893007073371','1561096328409251880','1561096679778947113','1568117859970842735']);
export const CANONICAL_MANAGED_ROLE_IDS233=Object.freeze([...new Set([...CANONICAL_RANKS233.map(r=>r.roleId),...LEGACY_RANK_ROLE_IDS233])]);
export const NATIVE_NAMES233=Object.freeze(['Guild Master','Stewart','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Initiate']);
/** Intentional many-to-one mapping of two native names; canonical IDs themselves
 * are unique. Branch offices and Alt are never inferred from a native ordinal. */
export const NATIVE_CANONICAL_INDEX233=Object.freeze([0,1,1,2,3,4,7,8,9,11]);
export type CanonicalRank233=Readonly<{key:string;name:string;roleId:string;permissions:string}>;
export type CanonicalRankPolicy233=Readonly<{version:1|2;enabled:boolean;profile:typeof CANONICAL_PROFILE233|typeof DIRECTIVE_CANONICAL_PROFILE;guildId:typeof CANONICAL_GUILD233;ranks:readonly CanonicalRank233[]}>;
export type CanonicalRankCapture233=Readonly<{present:boolean;mode:'off'|'held'|'enabled';raw:string|null;policy:CanonicalRankPolicy233|null;current:()=>boolean}>;
export type CanonicalEntitlements233=Readonly<{version:1;profile:typeof CANONICAL_PROFILE233;guildId:typeof CANONICAL_GUILD233;packetSHA256:string;entries:readonly Readonly<{subject:string;generation:string|null;roleKey:'branch-gm'|'branch-officer'|'alt'}>[]} >;
const ENTITLEMENT_KEYS233=Object.freeze(['branch-gm','branch-officer','alt']);
const originals=new WeakSet<object>(),ID=/^[1-9][0-9]{16,19}$/;
const held=(reason:string):never=>{throw Error(reason);};
const keys=(o:Record<string,unknown>,expected:string)=>Object.keys(o).join(',')===expected;
const own=(o:unknown,k:string):unknown=>{if(!o||typeof o!=='object')return held('canonical233_data');const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:held('canonical233_descriptor');};
export function parseCanonicalRankPolicy233(raw:unknown):CanonicalRankPolicy233{
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>8192)return held('canonical233_configuration');
 let x:unknown;try{x=JSON.parse(raw);}catch{return held('canonical233_configuration');}
 if(!x||typeof x!=='object'||Array.isArray(x)||!keys(x as Record<string,unknown>,'version,enabled,profile,guildId,ranks'))return held('canonical233_keys');
 const v=x as Record<string,unknown>;
 if(!(v.version===1&&v.profile===CANONICAL_PROFILE233||v.version===2&&v.profile===DIRECTIVE_CANONICAL_PROFILE)||typeof v.enabled!=='boolean'||v.guildId!==CANONICAL_GUILD233||!Array.isArray(v.ranks)||v.ranks.length!==12)return held('canonical233_scope');
 const ranks=v.ranks.map((r:unknown,index:number)=>{const expected=CANONICAL_RANKS233[index]!;
  if(!r||typeof r!=='object'||Array.isArray(r)||!keys(r as Record<string,unknown>,'key,name,roleId,permissions'))return held('canonical233_rank');
  const a=r as Record<string,unknown>;
  if(a.key!==expected.key||a.name!==expected.name||a.roleId!==expected.roleId||a.permissions!=='0')return held('canonical233_rank');
  return Object.freeze({...expected,permissions:a.permissions});
 });
 if(new Set(ranks.map(r=>r.roleId)).size!==12)return held('canonical233_duplicate');
 const policy:CanonicalRankPolicy233=Object.freeze({version:v.version as 1|2,enabled:v.enabled,profile:v.profile as CanonicalRankPolicy233['profile'],guildId:CANONICAL_GUILD233,ranks:Object.freeze(ranks)});
 if(JSON.stringify(policy)!==raw)return held('canonical233_canonical');originals.add(policy);return policy;
}
export function captureCanonicalRankConfig233(env:unknown):CanonicalRankCapture233{
 if(!env||typeof env!=='object')return Object.freeze({present:false,mode:'off',raw:null,policy:null,current:()=>true});
 let initial:PropertyDescriptor|undefined,proto:object|null,inherited=false;
 try{proto=Object.getPrototypeOf(env);initial=Object.getOwnPropertyDescriptor(env,'CANONICAL_RANKS233');inherited=!initial&&'CANONICAL_RANKS233' in env;}catch{return Object.freeze({present:true,mode:'held',raw:null,policy:null,current:()=>false});}
 const current=()=>{try{if(Object.getPrototypeOf(env)!==proto)return false;const d=Object.getOwnPropertyDescriptor(env,'CANONICAL_RANKS233');if(!initial)return !d&&!('CANONICAL_RANKS233' in (env as object));return !!d&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(d[k as keyof PropertyDescriptor],initial![k as keyof PropertyDescriptor]));}catch{return false;}};
 if(inherited||initial&&!Object.hasOwn(initial,'value'))return Object.freeze({present:true,mode:'held',raw:null,policy:null,current});
 const raw=initial?.value,present=raw!==undefined&&raw!==''&&raw!=='off';
 if(!present)return Object.freeze({present:false,mode:'off',raw:typeof raw==='string'?raw:null,policy:null,current});
 try{const policy=parseCanonicalRankPolicy233(raw);return Object.freeze({present:true,mode:policy.enabled?'enabled':'off',raw:raw as string,policy,current});}
 catch{return Object.freeze({present:true,mode:'held',raw:typeof raw==='string'?raw:null,policy:null,current});}
}
/** Caller must use fresh server roles and retain its original config capture
 * across awaits. This predicate grants no verified character or office proof. */
export function hasCanonicalMemberAccess233(env:unknown,roles:unknown):boolean{
 const c=captureCanonicalRankConfig233(env),guild=env&&typeof env==='object'?Object.getOwnPropertyDescriptor(env,'GUILD_ID'):undefined;
 return c.mode==='enabled'&&!!c.policy&&c.current()&&!!guild&&Object.hasOwn(guild,'value')&&guild.value===c.policy.guildId&&Array.isArray(roles)&&roles.length<=250&&roles.every(r=>typeof r==='string'&&ID.test(r))&&new Set(roles).size===roles.length&&roles.some(r=>c.policy!.ranks.some(rank=>rank.roleId===r));
}
export function canonicalNativeRole233(policy:CanonicalRankPolicy233,index:unknown,name:unknown):CanonicalRank233|null{
 if(!originals.has(policy)||!policy.enabled)return null;
 const current=policy.profile===DIRECTIVE_CANONICAL_PROFILE,names=current?DIRECTIVE_RANK_NAMES:NATIVE_NAMES233,mapping=current?DIRECTIVE_CANONICAL_INDEX:NATIVE_CANONICAL_INDEX233;
 if(typeof index!=='number'||!Number.isInteger(index)||index<0||index>=10||name!==names[index])return null;
 return policy.ranks[mapping[index]!]??null;
}
/** Current writer selection only. A retained v1 policy can still describe old
 * receipts and present-role access; it cannot issue a new Directive conversion. */
export function currentDirectiveCanonicalPolicy233(policy:CanonicalRankPolicy233|null):policy is CanonicalRankPolicy233{
 return !!policy&&originals.has(policy)&&policy.enabled&&policy.version===2&&policy.profile===DIRECTIVE_CANONICAL_PROFILE;
}
/** Preserve the serving policy's original mapping without activating Directive
 * or reviving the older .232 mirror-role producer. Parsed policy identity matters. */
export function currentOriginalCanonicalPolicy233(policy:CanonicalRankPolicy233|null):policy is CanonicalRankPolicy233{
 return !!policy&&originals.has(policy)&&policy.enabled&&policy.version===1&&policy.profile===CANONICAL_PROFILE233;
}
/** A present selection suppresses old producers even if malformed/disabled. It
 * never changes an old ACK or supplies authority to delete a role. */
export function canonicalProducerHeld233(env:unknown,guild:string,role:string):boolean{
 const c=captureCanonicalRankConfig233(env);return c.present&&guild===CANONICAL_GUILD233&&CANONICAL_MANAGED_ROLE_IDS233.includes(role);
}
/** Select a native entitlement plus explicit, separately qualified manual
 * entitlements. Raw provider presence is intentionally not an entitlement input. */
export function highestCanonicalRank233(policy:CanonicalRankPolicy233,native:Readonly<{index:number;name:string}>|null,entitlements:readonly string[]=[]):CanonicalRank233|null{
 if(!originals.has(policy)||!policy.enabled||!Array.isArray(entitlements)||entitlements.length>12||entitlements.some(id=>!policy.ranks.some(r=>r.roleId===id))||new Set(entitlements).size!==entitlements.length)return null;
 const role=native?canonicalNativeRole233(policy,own(native,'index'),own(native,'name')):null;
 if(native&&!role)return null;
 return policy.ranks.find(r=>r.roleId===role?.roleId||entitlements.includes(r.roleId))??null;
}
export function parseCanonicalEntitlements233(raw:unknown):CanonicalEntitlements233{
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>131072)return held('canonical233_entitlement_configuration');
 let x:unknown;try{x=JSON.parse(raw);}catch{return held('canonical233_entitlement_configuration');}
 if(!x||typeof x!=='object'||Array.isArray(x)||!keys(x as Record<string,unknown>,'version,profile,guildId,packetSHA256,entries'))return held('canonical233_entitlement_keys');
 const v=x as Record<string,unknown>;if(v.version!==1||v.profile!==CANONICAL_PROFILE233||v.guildId!==CANONICAL_GUILD233||typeof v.packetSHA256!=='string'||!/^[0-9a-f]{64}$/.test(v.packetSHA256)||!Array.isArray(v.entries)||v.entries.length>1000)return held('canonical233_entitlement_scope');
 let prior='';const entries=v.entries.map((r:unknown)=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||!keys(r as Record<string,unknown>,'subject,generation,roleKey'))return held('canonical233_entitlement_entry');const a=r as Record<string,unknown>;
  if(typeof a.subject!=='string'||!ID.test(a.subject)||BigInt(a.subject)>18446744073709551615n||a.generation!==null&&(typeof a.generation!=='string'||!/^[0-9a-f]{32}$/.test(a.generation))||typeof a.roleKey!=='string'||!ENTITLEMENT_KEYS233.includes(a.roleKey))return held('canonical233_entitlement_entry');
  const order=a.subject+'|'+(a.generation??'')+'|'+a.roleKey;if(order<=prior)return held('canonical233_entitlement_order');prior=order;
  return Object.freeze({subject:a.subject,generation:a.generation as string|null,roleKey:a.roleKey as 'branch-gm'|'branch-officer'|'alt'});
 });
 const manifest=Object.freeze({version:1 as const,profile:CANONICAL_PROFILE233,guildId:CANONICAL_GUILD233,packetSHA256:v.packetSHA256,entries:Object.freeze(entries)});
 if(JSON.stringify(manifest)!==raw)return held('canonical233_entitlement_canonical');return manifest;
}
export function captureCanonicalEntitlements233(env:unknown):Readonly<{present:boolean;mode:'off'|'held'|'enabled';raw:string|null;manifest:CanonicalEntitlements233|null;current:()=>boolean}>{
 if(!env||typeof env!=='object')return Object.freeze({present:false,mode:'off',raw:null,manifest:null,current:()=>true});
 let descriptor:PropertyDescriptor|undefined,proto:object|null;
 try{descriptor=Object.getOwnPropertyDescriptor(env,'CANONICAL_ENTITLEMENTS233');proto=Object.getPrototypeOf(env);}catch{return Object.freeze({present:true,mode:'held',raw:null,manifest:null,current:()=>false});}
 const current=()=>{try{const now=Object.getOwnPropertyDescriptor(env,'CANONICAL_ENTITLEMENTS233');return Object.getPrototypeOf(env)===proto&&(descriptor?!!now&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(descriptor![k as keyof PropertyDescriptor],now[k as keyof PropertyDescriptor])):!now&&!('CANONICAL_ENTITLEMENTS233' in env));}catch{return false;}};
 if(!descriptor&&'CANONICAL_ENTITLEMENTS233' in env||descriptor&&!Object.hasOwn(descriptor,'value'))return Object.freeze({present:true,mode:'held',raw:null,manifest:null,current});
 const raw=descriptor?.value;if(raw===undefined||raw===''||raw==='off')return Object.freeze({present:false,mode:'off',raw:typeof raw==='string'?raw:null,manifest:null,current});
 try{return Object.freeze({present:true,mode:'enabled',raw:raw as string,manifest:parseCanonicalEntitlements233(raw),current});}catch{return Object.freeze({present:true,mode:'held',raw:typeof raw==='string'?raw:null,manifest:null,current});}
}

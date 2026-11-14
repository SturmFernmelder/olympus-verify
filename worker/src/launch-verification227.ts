/** Restricted launch verification. Native membership facts, never a typed guild claim.
 * Absent/false retains the separately documented historical admission workflow. */
import type { Env } from './env';
import { linksNotBefore } from './db';
import { createPrivacyAdmissionAlias,isPrivacyWriteAdmissionDatabase } from './privacy-write-admission';
import { normalizeCharacter,normalizeCodeInput } from './codes';
import { isApprovedNativeGuildName } from './guild-affiliation229';
import { nativeMembershipSourceMatches } from './native-rank-schemes';
export class LaunchVerificationHeld extends Error { constructor() { super('launch_verification_source_held'); } }
export type LaunchNativeScope=Readonly<{version:1;guild:string;realm:string;provenance:`addon-native-v1:${string}`} >;
export function parseLaunchNativeScope(raw:unknown):LaunchNativeScope|null {
  if(typeof raw!=='string'||raw.length>512)return null;
  try{
    const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='guild,realm,version'||v.version!==1)return null;
    if(!isApprovedNativeGuildName(v.guild)||typeof v.realm!=='string'||!v.realm||v.realm.length>96||new TextEncoder().encode(v.realm).byteLength>128||v.realm.trim()!==v.realm||/[\x00-\x1f\x7f<>]/.test(v.realm)||/\bbeta\b|^unknown$|^pending$|^unconfirmed$/i.test(v.realm))return null;
    const canonical=JSON.stringify({version:1,guild:v.guild,realm:v.realm});
    // Operator configuration is canonical, preventing duplicate-key or ambiguous projections.
    if(canonical!==raw)return null;
    return Object.freeze({version:1,guild:v.guild,realm:v.realm,provenance:('addon-native-v1:'+canonical) as `addon-native-v1:${string}`});
  }catch{return null;}
}
export type LaunchVerificationCapture = Readonly<{ mode: 'legacy' | 'members-only' | 'held'; scope:LaunchNativeScope|null; current: () => boolean }>;
export function captureLaunchVerification(env: Env): LaunchVerificationCapture {
  let own = false, value: unknown, mode: LaunchVerificationCapture['mode'] = 'held';
  let scope:LaunchNativeScope|null=null;
  const scopes:Readonly<{key:string;own:boolean;value:unknown}>[]=[];
  try {
    const d = Object.getOwnPropertyDescriptor(env, 'VERIFY_MEMBERSHIP_ONLY');
    own = !!d;
    if (!d) { if (!('VERIFY_MEMBERSHIP_ONLY' in env)) mode = 'legacy'; }
    else if (Object.hasOwn(d, 'value')) {
      value = d.value;
      mode = value === 'true' ? 'members-only' : value === undefined || value === 'false' ? 'legacy' : 'held';
    }
    if(mode==='members-only')for(const key of ['LINKS_NOT_BEFORE','LINKS_NOT_BEFORE_CLOCK_GATED','VERIFY_NATIVE_SCOPE','VERIFY_SECRET']){
      const d=Object.getOwnPropertyDescriptor(env,key);if(d&&!Object.hasOwn(d,'value')||!d&&key in env){mode='held';break;}
      scopes.push(Object.freeze({key,own:!!d,value:d?.value}));
    }
    if(mode==='members-only'){scope=parseLaunchNativeScope(Object.getOwnPropertyDescriptor(env,'VERIFY_NATIVE_SCOPE')?.value);if(!scope)mode='held';}
  } catch { mode='held'; /* Invalid environment selection is held without invoking a getter. */ }
  return Object.freeze({ mode, scope,current: () => {
    try {
      const d = Object.getOwnPropertyDescriptor(env, 'VERIFY_MEMBERSHIP_ONLY');
      const selected=own ? !!d && Object.hasOwn(d, 'value') && d.value === value : !d && !('VERIFY_MEMBERSHIP_ONLY' in env);
      return selected&&scopes.every(scope=>{const s=Object.getOwnPropertyDescriptor(env,scope.key);return scope.own?!!s&&Object.hasOwn(s,'value')&&s.value===scope.value:!s&&!(scope.key in env);});
    } catch { return false; }
  } });
}
/** Preserve the original mode witness through the existing registered Native adapter.
 * A lost reply/late invalidation never proves that an already dispatched batch rolled back. */
export function launchVerificationEnv(env:Env,capture:LaunchVerificationCapture):Env {
  const check=()=>{if(capture.mode==='held'||!capture.current())throw new LaunchVerificationHeld();};check();
  if(!isPrivacyWriteAdmissionDatabase(env.DB)){if(capture.mode==='members-only')throw new LaunchVerificationHeld();return env;}
  return {...env,DB:createPrivacyAdmissionAlias(env.DB,check)};
}
export type NativeMembershipProof=Readonly<{version:1;member:boolean;observedAt:number;scopeHash:string;mac:string}>;
const verifiedNativeProofs=new WeakMap<object,Readonly<{mode:LaunchVerificationCapture;nameKey:string;guid:string}>>();
/** JSON data only; no getter or mutable caller view can change a proof during crypto. */
export function captureNativeMembershipProof(value:unknown):NativeMembershipProof|null {
  try{
    if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
    const names=['mac','member','observedAt','scopeHash','version'];if(Reflect.ownKeys(value).length!==names.length||Object.keys(value).sort().join(',')!==names.join(','))return null;
    const copy:Record<string,unknown>={};for(const name of names){const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!Object.hasOwn(d,'value'))return null;copy[name]=d.value;}
    if(copy.version!==1||typeof copy.member!=='boolean'||!Number.isSafeInteger(copy.observedAt)||Number(copy.observedAt)<1||typeof copy.scopeHash!=='string'||!/^[0-9a-f]{16}$/.test(copy.scopeHash)||typeof copy.mac!=='string'||!/^[0-9a-f]{32}$/.test(copy.mac))return null;
    return Object.freeze(copy) as unknown as NativeMembershipProof;
  }catch{return null;}
}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const equalHex=(a:string,b:string)=>{let mismatch=a.length^b.length;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return mismatch===0;};
export async function verifyNativeMembershipProof(env:Env,mode:LaunchVerificationCapture,proof:NativeMembershipProof|null,name:string,guid:string|null,code:string):Promise<NativeMembershipProof|null> {
  if(mode.mode!=='members-only'||!mode.scope||!proof||!guid)return null;
  const check=()=>{if(!mode.current())throw new LaunchVerificationHeld();};check();
  const secret=Object.getOwnPropertyDescriptor(env,'VERIFY_SECRET');if(!secret||!Object.hasOwn(secret,'value')||typeof secret.value!=='string'||!secret.value)return null;
  const now=Math.floor(Date.now()/1000);if(proof.observedAt<now-600||proof.observedAt>now+5)return null;
  const scopeHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('native-scope|1|'+mode.scope.guild+'|'+mode.scope.realm))).slice(0,16);check();
  if(!equalHex(scopeHash,proof.scopeHash))return null;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret.value),{name:'HMAC',hash:'SHA-256'},false,['sign']);check();
  const message='membership|1|'+normalizeCharacter(name)+'|'+guid+'|'+normalizeCodeInput(code)+'|'+(proof.member?'1':'0')+'|'+proof.observedAt+'|'+scopeHash;
  const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))).slice(0,32);check();
  if(!equalHex(expected,proof.mac))return null;
  const after=Math.floor(Date.now()/1000);if(proof.observedAt<after-600||proof.observedAt>after+5)return null;
  verifiedNativeProofs.set(proof,Object.freeze({mode,nameKey:normalizeCharacter(name),guid}));return proof;
}
export type LaunchMembershipSource=Readonly<{snapshotId:number;exportedAt:number;nameKey:string;guid:string;cutoff:number;provenance:string;nativeObservedAt:number;mode:LaunchVerificationCapture}>;
const originalSources=new WeakSet<object>();
export function captureLaunchMembershipSource(env:Env,mode:LaunchVerificationCapture,row:Readonly<{snapshotId:number;exportedAt:number;guid:string|null;source:string}>,nameKey:string,nativeProof:NativeMembershipProof|null):LaunchMembershipSource|null {
  if(mode.mode==='legacy')return null;
  const verified=nativeProof?verifiedNativeProofs.get(nativeProof):null;
  if(!nativeProof||!nativeProof.member||!verified||verified.mode!==mode||verified.nameKey!==nameKey||verified.guid!==row.guid||mode.mode!=='members-only'||!mode.scope||!nativeMembershipSourceMatches(row.source,mode.scope.guild,mode.scope.realm)||!mode.current()||!Number.isSafeInteger(row.snapshotId)||row.snapshotId<1||!Number.isSafeInteger(row.exportedAt)||!row.guid||!nameKey)throw new LaunchVerificationHeld();
  const source=Object.freeze({snapshotId:row.snapshotId,exportedAt:row.exportedAt,nameKey,guid:row.guid,cutoff:linksNotBefore(env),provenance:row.source,nativeObservedAt:nativeProof.observedAt,mode});originalSources.add(source);return source;
}
/** A verified own-roster absence can contradict an older positive snapshot. Quarantine
 * only that still-current snapshot; it is not proof of departure from a sister guild.
 * The caller places this restriction in the original request's admitted atomic group. */
export function launchContradictionRestriction(env:Env,mode:LaunchVerificationCapture,proof:NativeMembershipProof|null,row:Readonly<{snapshotId:number;exportedAt:number;guid:string|null;source:string}>|null,nameKey:string):D1PreparedStatement|null {
  const verified=proof?verifiedNativeProofs.get(proof):null;
  if(!proof||proof.member||!verified||verified.mode!==mode||verified.nameKey!==nameKey||!row||verified.guid!==row.guid||mode.mode!=='members-only'||!mode.scope||!nativeMembershipSourceMatches(row.source,mode.scope.guild,mode.scope.realm)||proof.observedAt<row.exportedAt)return null;
  if(!mode.current())throw new LaunchVerificationHeld();
  return env.DB.prepare(`UPDATE roster_snapshots SET trusted=0 WHERE id=?1 AND id=(SELECT MAX(id) FROM roster_snapshots)
    AND exported_at=?2 AND source=?3 AND complete=1 AND trusted=1
    AND member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=roster_snapshots.id)
    AND exported_at<=?6 AND ?6>=CAST(strftime('%s','now') AS INTEGER)-600 AND ?6<=CAST(strftime('%s','now') AS INTEGER)+5
    AND EXISTS(SELECT 1 FROM roster_members WHERE snapshot_id=roster_snapshots.id AND name_key=?4 AND guid=?5)
    AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=roster_snapshots.id AND guid=?5)=1`)
    .bind(row.snapshotId,row.exportedAt,row.source,nameKey,row.guid,proof.observedAt);
}
export function assertLaunchMembershipMode(env:Env,source:LaunchMembershipSource):void {
  const mode=Object.getOwnPropertyDescriptor(env,'VERIFY_MEMBERSHIP_ONLY');
  const configured=Object.getOwnPropertyDescriptor(env,'VERIFY_NATIVE_SCOPE'),scope=configured&&Object.hasOwn(configured,'value')?parseLaunchNativeScope(configured.value):null;
  if(!originalSources.has(source)||!mode||!Object.hasOwn(mode,'value')||mode.value!=='true'||!scope||!nativeMembershipSourceMatches(source.provenance,scope.guild,scope.realm)||source.mode.mode!=='members-only'||!source.mode.current()||source.cutoff!==linksNotBefore(env))throw new LaunchVerificationHeld();
}
const SOURCE_CURRENT=`EXISTS(SELECT 1 FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id
 WHERE s.id=?1 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.exported_at=?2
 AND s.complete=1 AND s.trusted=1 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER) AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at>=?5
 AND r.name_key=?3 AND r.guid=?4 AND s.source=?6 AND ?7>=CAST(strftime('%s','now') AS INTEGER)-600 AND ?7<=CAST(strftime('%s','now') AS INTEGER)+5
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=?4)=1)`;
export function launchMembershipPredicate(env:Env,source:LaunchMembershipSource,start=1):Readonly<{sql:string;values:readonly (string|number)[]}> {
  assertLaunchMembershipMode(env,source);if(!Number.isSafeInteger(start)||start<1||start>100)throw new LaunchVerificationHeld();
  return Object.freeze({sql:SOURCE_CURRENT.replace(/\?(\d+)/g,(_all,n)=>'?'+(start+Number(n)-1)),values:Object.freeze([source.snapshotId,source.exportedAt,source.nameKey,source.guid,source.cutoff,source.provenance,source.nativeObservedAt])});
}
export function launchMembershipFence(env:Env,source:LaunchMembershipSource):D1PreparedStatement {
  assertLaunchMembershipMode(env,source);
  return env.DB.prepare(`SELECT CASE WHEN ${SOURCE_CURRENT} THEN 1 ELSE json_extract('launch_membership_changed','$') END AS admitted`)
    .bind(source.snapshotId,source.exportedAt,source.nameKey,source.guid,source.cutoff,source.provenance,source.nativeObservedAt);
}
export async function launchMembershipCurrent(env:Env,source:LaunchMembershipSource):Promise<boolean> {
  try{assertLaunchMembershipMode(env,source);const row=await env.DB.prepare(`SELECT (${SOURCE_CURRENT}) AS current`).bind(source.snapshotId,source.exportedAt,source.nameKey,source.guid,source.cutoff,source.provenance,source.nativeObservedAt).first<{current:number}>();assertLaunchMembershipMode(env,source);return row?.current===1;}catch{return false;}
}
export function launchVerificationRefusal(capture: LaunchVerificationCapture, facts: Readonly<{
  current: boolean; exportedAt: number | null; rosterGuid: string | null; whisperGuid: string | null;source:string|null;nativeMembership:boolean;
}>, at: number): Readonly<{ result: string; error: string; roleGranted: false; inviteQueued: false; pendingConsumed: false }> | null {
  if (capture.mode === 'held' || !capture.current()) return {
    result: 'verification_configuration_held', error: 'Verification configuration is unavailable or changed. No role or invite was issued.',
    roleGranted: false, inviteQueued: false, pendingConsumed: false,
  };
  if (capture.mode === 'legacy') return null;
  // Ten minutes is the existing roster GUID-pin window. A name alone and an arbitrary
  // whispered guild label are not a native membership proof, even when a code is valid.
  if (!facts.nativeMembership||!capture.scope||!nativeMembershipSourceMatches(facts.source,capture.scope.guild,capture.scope.realm)||!facts.current || !Number.isSafeInteger(at) || !Number.isSafeInteger(facts.exportedAt) ||
      facts.exportedAt! > at || facts.exportedAt! <= at - 600 || !facts.whisperGuid || !facts.rosterGuid || facts.whisperGuid !== facts.rosterGuid) return {
    result: 'membership_not_confirmed', error: 'Your character is not confirmed by a fresh, trusted Olympus membership source. No role or invite was issued. For the collector\'s own guild, ask the owner to refresh the native roster, then press Get my code and whisper that fresh code. Sister-guild roles require the official signed-GUID QR website flow and remain held until that integration is qualified.',
    roleGranted: false, inviteQueued: false, pendingConsumed: false,
  };
  return null;
}

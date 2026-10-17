/** Native beta-source closure only. Unmounted/default OFF: this is not a provider drain,
 * restore barrier, all-version closure or authority to reuse an old physical role. */
import type {Env} from './env';
import {DB_NOW,sha256} from './account-generation-contracts';
import {BETA_RESET_POLICY_KEY,BETA_RESET_DISPATCH_SEAL_KEY,BETA_RESET_EPOCH,BETA_RESET_CUTOFF,
 BETA_RESET_GUILD_ID,parseBetaResetRetirement} from './beta-reset-policy';
import {captureLaneConfig,laneDigest,type LaneCapture} from './full-release-roles';
import {isPrivacyWriteAdmissionDatabase,privacyAdmissionEpochMatches,type AdmissionLayout} from './privacy-write-admission';
import {ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON} from './privacy-write-admission-catalogue';
import {PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL,PROVIDER_METADATA_CURRENT_SQL} from './privacy-provider-metadata';

const SOURCE_EPOCH_BINDING='BETA_RESET_SOURCE_EPOCH',MODE_BINDING='BETA_RESET_DISPATCH_SEAL_MODE';
const EPOCH=/^olympus-full-release-[a-z0-9-]{1,32}$/,HEX32=/^[0-9a-f]{32}$/;
const profileObjects=JSON.parse(ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON) as Record<'canonical'|'recordedLive',(string|null)[][]>;
const KEYS=[SOURCE_EPOCH_BINDING,MODE_BINDING,'DB','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_WRITE_ADMISSION_EPOCH'] as const;
type Descriptor=PropertyDescriptor|undefined;
function own(env:object,key:string):Descriptor{const d=Object.getOwnPropertyDescriptor(env,key);if(d&&!Object.hasOwn(d,'value')||!d&&key in env)throw Error('beta_source_configuration_held');return d?Object.freeze({...d}):undefined;}
function same(a:Descriptor,b:Descriptor):boolean{return a===undefined||b===undefined?a===b:['value','writable','enumerable','configurable'].every(k=>a[k as keyof PropertyDescriptor]===b[k as keyof PropertyDescriptor]);}
export type BetaFreshSourceEpoch=Readonly<{version:1;epoch:string;freshConfig:string;freshConfigDigest:string;writeEpoch:string}>;
export type BetaNativeSourceSeal=Readonly<{version:1;scope:'native_beta_dispatch_closed';oldEpoch:typeof BETA_RESET_EPOCH;cutoff:typeof BETA_RESET_CUTOFF;
 guildId:typeof BETA_RESET_GUILD_ID;predecessor:Readonly<{kind:'retired';raw:string}|{kind:'post_cutoff_absent'}>;
 source:Readonly<{layout:AdmissionLayout;writeEpoch:string;profileDigest:string}>;freshEpoch:BetaFreshSourceEpoch;observedAt:number}>;
export type BetaNativeSourceClosure=Readonly<{kind:'original_native_beta_source_closure'}>;
type Plan={env:Env;slots:Descriptor[];lane:LaneCapture;db:D1Database;rawPolicy:string|null;at:number;objects:string;seal:BetaNativeSourceSeal;raw:string;spent:boolean};
const plans=new WeakMap<BetaNativeSourceClosure,Plan>();
function current(p:Plan):boolean{try{return p.lane.current()&&KEYS.every((k,i)=>same(p.slots[i],own(p.env,k)))&&privacyAdmissionEpochMatches(p.db,p.seal.source.writeEpoch);}catch{return false;}}
const residuals=Object.freeze({providerDrainQualified:false,restoreBarrierQualified:false,allVersionClosureQualified:false,allPhysicalCopyReplayQualified:false,roleReuseReady:false});
export type BetaNativeSourceClosureResult=Readonly<{nativeDispatchClosed:true;seal:string;freshEpoch:BetaFreshSourceEpoch;
 providerDrainQualified:false;restoreBarrierQualified:false;allVersionClosureQualified:false;allPhysicalCopyReplayQualified:false;roleReuseReady:false}>;

/** The full source catalogue, including the three exact immutable-seal triggers, is
 * compared inside the consuming INSERT. Neither a trigger count nor a caller digest is proof.
 * This conservative component accepts no optional _cf_KV companion: that future deployment
 * needs its own exact catalogue before this issuer can proceed. Provider metadata has the
 * existing separately checked shape and is never read as business data. */
function installedProfileSql(index:number):string{
 return `${PROVIDER_METADATA_CURRENT_SQL} AND
 (SELECT COUNT(*) FROM main.sqlite_master WHERE ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL})=json_array_length(?${index})
 AND NOT EXISTS(SELECT 1 FROM json_each(?${index}) e WHERE NOT EXISTS(SELECT 1 FROM main.sqlite_master a
  WHERE a.type COLLATE BINARY=json_extract(e.value,'$[0]') COLLATE BINARY
   AND a.name COLLATE BINARY=json_extract(e.value,'$[1]') COLLATE BINARY
   AND a.tbl_name COLLATE BINARY=json_extract(e.value,'$[2]') COLLATE BINARY
   AND a.sql IS json_extract(e.value,'$[3]')))`;
}
/** Capture original configuration and a real post-cutoff predecessor. V2 is not silently
 * retired; malformed rows are not absence. Every captured fact is consumed again in SQL.
 * A new epoch is a separate canonical record embedded in the immutable seal, not a mutable
 * site-setting alias. This old source admits exactly one such record for its entire lifetime. */
export async function captureBetaNativeSourceClosure(env:Env):Promise<BetaNativeSourceClosure|null>{
 try{
  const slots=KEYS.map(k=>own(env,k)),read=(k:typeof KEYS[number])=>slots[KEYS.indexOf(k)]?.value;
  const lane=captureLaneConfig(env),db=read('DB');
  if(read(MODE_BINDING)!=='v1'||typeof read(SOURCE_EPOCH_BINDING)!=='string'||!EPOCH.test(read(SOURCE_EPOCH_BINDING) as string)
   ||!lane.current()||!lane.cfg||!lane.raw||lane.fresh==='held'||lane.fresh==='absent'||lane.cfg.epoch!==read(SOURCE_EPOCH_BINDING)
   ||lane.cfg.epoch===BETA_RESET_EPOCH||lane.guild!==BETA_RESET_GUILD_ID
   ||read('PRIVACY_WRITE_ADMISSION_ENABLED')!=='true'||!db||typeof db!=='object'||!isPrivacyWriteAdmissionDatabase(db as D1Database)
   ||!HEX32.test(String(read('PRIVACY_WRITE_ADMISSION_EPOCH')))||!privacyAdmissionEpochMatches(db as D1Database,String(read('PRIVACY_WRITE_ADMISSION_EPOCH'))))return null;
  const layout=read('PRIVACY_WRITE_ADMISSION_LAYOUT');if(layout!=='canonical'&&layout!=='recorded-live-20261010')return null;
  const selected=profileObjects[layout==='canonical'?'canonical':'recordedLive'];
  if(!Array.isArray(selected)||!['beta_dispatch_seal_no_replace','beta_dispatch_seal_no_update','beta_dispatch_seal_no_delete'].every(name=>selected.some(r=>r[0]==='trigger'&&r[1]===name)))return null;
  const database=db as D1Database,row=await database.prepare(`SELECT (SELECT value FROM site_settings WHERE key=?1) raw,
   (SELECT COUNT(*) FROM site_settings WHERE key=?1) matches,${DB_NOW} at`).bind(BETA_RESET_POLICY_KEY).first<{raw:unknown;matches:number;at:number}>();
  if(!row||!Number.isSafeInteger(row.at)||row.at<BETA_RESET_CUTOFF||!lane.current()||!KEYS.every((k,i)=>same(slots[i],own(env,k))))return null;
  let predecessor:BetaNativeSourceSeal['predecessor'],rawPolicy:string|null=null;
  if(row.matches===0&&row.raw===null)predecessor=Object.freeze({kind:'post_cutoff_absent'});
  else{
   if(row.matches!==1||typeof row.raw!=='string')return null;
   const retired=parseBetaResetRetirement(row.raw,env);if(!retired||retired.retiredAt>row.at)return null;
   rawPolicy=row.raw;predecessor=Object.freeze({kind:'retired',raw:row.raw});
  }
  const objects=JSON.stringify(selected),writeEpoch=read('PRIVACY_WRITE_ADMISSION_EPOCH') as string;
  const freshEpoch:BetaFreshSourceEpoch=Object.freeze({version:1,epoch:lane.cfg.epoch,freshConfig:lane.raw,freshConfigDigest:await laneDigest(lane.raw),writeEpoch});
  const seal:BetaNativeSourceSeal=Object.freeze({version:1,scope:'native_beta_dispatch_closed',oldEpoch:BETA_RESET_EPOCH,cutoff:BETA_RESET_CUTOFF,
   guildId:BETA_RESET_GUILD_ID,predecessor,source:Object.freeze({layout,writeEpoch,profileDigest:await sha256(objects)}),freshEpoch,observedAt:row.at});
  const p:Plan={env,slots,lane,db:database,rawPolicy,at:row.at,objects,seal,raw:JSON.stringify(seal),spent:false};
  if(!current(p))return null;const cap=Object.freeze({kind:'original_native_beta_source_closure' as const});plans.set(cap,p);return cap;
 }catch{return null;}
}
/** One-use same-source Native closure. It does not dispatch a role effect or claim that
 * earlier accepted provider work is drained. Unknown/dispatching/pending rows are untouched. */
export async function executeBetaNativeSourceClosure(cap:BetaNativeSourceClosure):Promise<BetaNativeSourceClosureResult|null>{
 const p=plans.get(cap);if(!p||p.spent||!current(p))return null;p.spent=true;
 const predecessor=p.rawPolicy===null?`?3='' AND NOT EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}')`
  :`EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_POLICY_KEY}' AND typeof(value)='text' AND value=?3 COLLATE BINARY)`;
 const sql=`INSERT INTO site_settings(key,value,updated_at,updated_by)
  SELECT '${BETA_RESET_DISPATCH_SEAL_KEY}',?1,${DB_NOW},'system:beta-source-closure'
  WHERE ${DB_NOW}>=?2 AND ${DB_NOW}>=${BETA_RESET_CUTOFF} AND ${predecessor}
   AND NOT EXISTS(SELECT 1 FROM site_settings WHERE key='${BETA_RESET_DISPATCH_SEAL_KEY}')
   AND json_extract(?1,'$.source.writeEpoch')=?4 COLLATE BINARY
   AND ${installedProfileSql(5)} RETURNING value`;
 try{
  const row=await p.db.prepare(sql).bind(p.raw,p.at,p.rawPolicy??'',p.seal.source.writeEpoch,p.objects).first<{value:string}>();
  if(!row||row.value!==p.raw||!current(p))return null;
  return Object.freeze({nativeDispatchClosed:true as const,seal:p.raw,freshEpoch:p.seal.freshEpoch,...residuals});
 }catch{return null;}
}
/** There is no source-owned provider/all-version/restore exclusion capability in this build.
 * Production all-source issuance is deliberately unavailable; no boolean, count, elapsed
 * quiet interval or GET result can upgrade a native closure into role reuse authority. */
export function requireBetaOldSourceRoleReuse():never{throw Error('beta_source_provider_restore_authority_unavailable');}

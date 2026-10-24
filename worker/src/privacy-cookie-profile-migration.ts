/** Source-owned original D1 statement/custody seam. Dormant: no HTTP route or provider orchestration.
 * Nine-field private sources require a genuine original closed tuple. The exact observed public seven-field
 * source has no mode: its capture explicitly says legacy_control_without_mode, never closed/drained.
 * This privileged Native operation must be coupled to Root's external close/drain before remote execution.
 * All SQL is source-owned; the seven delayed stores are ALTERed in place with foreign keys enabled.
 */
import {ADMISSION_COOKIE_MIGRATION_SOURCES_JSON,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_COOKIE_MIGRATION_DECLARATIONS_JSON,
 ADMISSION_EXPECTED_JSON,ADMISSION_PHYSICAL_EXPECTED_JSON,ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON} from './privacy-write-admission-catalogue';
import {isPrivacyWriteAdmissionDatabase,PrivacyWriteAdmissionHeld,type AdmissionLayout} from './privacy-write-admission';
import {originalPrivateNativeOpenCustody,originalPrivateNativeOpenDispatchCustody,type OriginalPrivateRecoveryReplayResult,originalPrivateNativeWriterFenceCustody,assertOriginalPrivateReplayMigration,consumeOriginalClosedRecoveryReplaySelection,type OriginalPrivateInstallation,type OriginalPrivateControlCut,type OriginalClosedRecoveryReplaySelection} from './privacy-production-control-origin';
import type {OriginalAcceptedRecoverySource} from './privacy-accepted-recovery-source';
import {PROVIDER_METADATA_CURRENT_SQL,PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} from './privacy-provider-metadata';
type Profile={tables:{name:string;sql:string;columns:string[]}[];indexes:{name:string;sql:string;tbl_name:string}[];triggers:{name:string;sql:string}[];slotSQL:string;slotColumns:string[]};
type SourceKind='pre-marker'|'marker'|'public-predecessor'|'current-cookie'|'current-cookie-pre-seal';
type Source={profile:Profile;objects:(string|null)[][]};
type Original=Readonly<{operationId:string;layout:AdmissionLayout;sourceKind:SourceKind;originalEpoch:string|null;nextEpoch:string}>;
export type WholeMigrationCapability=Readonly<Original&{kind:'original_native_cookie_profile_migration';createdAt:number;expiresAt:number;mode:'closed'|'legacy_control_without_mode';readyToReopen:false}>;
type Step=Readonly<{sql:string;binds:readonly (string|number)[]}>;
type Witness={assert:()=>void};
type Stored={native:D1Database;witness:Witness;rowWitness:Witness;old:Source;next:Profile;objects:(string|null)[][];tuple:string;plan:readonly Step[];epochStep:number;spent:boolean;executionExpiresAt:number;originalObjects?:(string|null)[][];captureEpoch?:string;captureLegacy?:boolean};
const originalCaptures=new WeakMap<WholeMigrationCapability,Stored>();
const sources={...JSON.parse(ADMISSION_COOKIE_MIGRATION_SOURCES_JSON),'current-cookie-pre-seal':JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON)} as Record<SourceKind,Record<'canonical'|'recordedLive',Source>>;
const declarations=JSON.parse(ADMISSION_COOKIE_MIGRATION_DECLARATIONS_JSON) as Record<string,string>;
const objects=JSON.parse(ADMISSION_COOKIE_MIGRATION_OBJECTS_JSON) as Record<'canonical'|'recordedLive',(string|null)[][]>;
const fields=[['community_event_deliveries','actor_account_incarnation'],['community_event_reminders','consent_account_incarnation'],['ruleset_publications','actor_account_incarnation'],['councillor_keys','signer_account_incarnation'],['councillor_challenges','signer_account_incarnation'],['verification_requests','requester_account_incarnation'],['privacy_serving_jobs','original_account_incarnation'],['councillor_keys','beta_window_id'],['councillor_challenges','beta_window_id'],['verification_requests','beta_window_id'],['verification_proofs','beta_window_id']] as const;
const NOW="CAST(strftime('%s','now') AS INTEGER)",SLOT='privacy_write_admission',VERSION='olympus-write-admission-epoch-2';
// Paid D1 structural limits only. The original provider's entire batch must separately qualify <=30s.
// Only schema metadata crosses a bound parameter. Business values remain in same-original Native SQL.
const encoder=new TextEncoder(),MAX_SQL=100000,MAX_BOUND=2000000,MAX_PARAMETERS=100,MAX_QUERIES=1000;
function bounded(sql:string,binds:readonly (string|number)[]):void{
 if(typeof sql!=='string'||encoder.encode(sql).length>MAX_SQL||binds.length>MAX_PARAMETERS)throw new PrivacyWriteAdmissionHeld('migration_d1_statement_limit');
 for(const v of binds)if(typeof v==='string'?encoder.encode(v).length>MAX_BOUND:typeof v!=='number'||!Number.isFinite(v))throw new PrivacyWriteAdmissionHeld('migration_d1_bound_limit');
}
const TUPLE='json_array(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)',LEGACY_TUPLE='json_array(singleton,protocol,active,nonce,purpose,entry_changes,logical_changes)';
function lower32(x:unknown):x is string{if(typeof x!=='string'||x.length!==32)return false;for(let i=0;i<32;i++){const c=x.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102))return false;}return true;}
function id(s:string):string{if(!s||[...s].some(c=>!/[A-Za-z0-9_]/.test(c)))throw new PrivacyWriteAdmissionHeld('migration_source_identifier');return '"'+s+'"';}
function own(x:unknown,key:string):unknown{if(!x||typeof x!=='object')throw new PrivacyWriteAdmissionHeld('migration_original_data');const d=Object.getOwnPropertyDescriptor(x,key);if(!d||!Object.hasOwn(d,'value'))throw new PrivacyWriteAdmissionHeld('migration_original_data');return d.value;}
function equalDescriptor(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean{return !!a&&!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>a[k as keyof PropertyDescriptor]===b[k as keyof PropertyDescriptor]);}
function methods(native:D1Database):Witness{
 if(!native||typeof native!=='object'||isPrivacyWriteAdmissionDatabase(native))throw new PrivacyWriteAdmissionHeld('migration_original_native_required');
 const slots=['prepare','batch'] as const,chains=slots.map(key=>{let p:object|null=native;const chain:{ref:object;proto:object|null;descriptor:PropertyDescriptor|undefined}[]=[];
  for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,key),proto=Object.getPrototypeOf(p);chain.push({ref:p,proto,descriptor:d});if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw new PrivacyWriteAdmissionHeld('migration_native_accessor');return chain;}p=proto;}
  throw new PrivacyWriteAdmissionHeld('migration_native_method_absent');});
 const assert=()=>{for(let i=0;i<slots.length;i++){let p:object|null=native;for(const saved of chains[i]!){if(p!==saved.ref||Object.getPrototypeOf(saved.ref)!==saved.proto)throw new PrivacyWriteAdmissionHeld('migration_native_method_drift');const actual=Object.getOwnPropertyDescriptor(saved.ref,slots[i]!);if(saved.descriptor?!equalDescriptor(actual,saved.descriptor):actual!==undefined)throw new PrivacyWriteAdmissionHeld('migration_native_method_drift');p=saved.proto;}}};assert();return {assert};
}
function rowSnapshot(x:unknown,keys:readonly string[]):{values:unknown[];witness:Witness}{
 if(!x||typeof x!=='object'||Array.isArray(x))throw new PrivacyWriteAdmissionHeld('migration_native_row');const proto=Object.getPrototypeOf(x),names=Reflect.ownKeys(x);
 if(names.length!==keys.length||!keys.every(k=>names.includes(k)))throw new PrivacyWriteAdmissionHeld('migration_native_row');const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(x,k));
 if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))throw new PrivacyWriteAdmissionHeld('migration_native_row');const values=descriptors.map(d=>d!.value);
 const assert=()=>{const n=Reflect.ownKeys(x);if(Object.getPrototypeOf(x)!==proto||n.length!==names.length||!names.every(k=>n.includes(k))||!keys.every((k,i)=>equalDescriptor(Object.getOwnPropertyDescriptor(x,k),descriptors[i])))throw new PrivacyWriteAdmissionHeld('migration_native_row_drift');};return {values,witness:{assert}};
}
function statementWitness(s:object):Witness{
 const proto=Object.getPrototypeOf(s),names=Reflect.ownKeys(s),descriptors=names.map(k=>Object.getOwnPropertyDescriptor(s,k));
 if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))throw new PrivacyWriteAdmissionHeld('migration_statement_accessor');
 const arrays=descriptors.flatMap(d=>Array.isArray(d!.value)?[{ref:d!.value as unknown[],proto:Object.getPrototypeOf(d!.value),keys:Reflect.ownKeys(d!.value),descriptors:Reflect.ownKeys(d!.value).map(k=>Object.getOwnPropertyDescriptor(d!.value,k))}]:[]);
 if(arrays.some(a=>a.descriptors.some(d=>!d||!Object.hasOwn(d,'value'))))throw new PrivacyWriteAdmissionHeld('migration_statement_bind_accessor');
 const assert=()=>{const keys=Reflect.ownKeys(s);if(Object.getPrototypeOf(s)!==proto||keys.length!==names.length||!names.every(k=>keys.includes(k))||!names.every((k,i)=>equalDescriptor(Object.getOwnPropertyDescriptor(s,k),descriptors[i])))throw new PrivacyWriteAdmissionHeld('migration_statement_drift');
  for(const a of arrays){const keys=Reflect.ownKeys(a.ref);if(Object.getPrototypeOf(a.ref)!==a.proto||keys.length!==a.keys.length||!a.keys.every(k=>keys.includes(k))||!a.keys.every((k,i)=>equalDescriptor(Object.getOwnPropertyDescriptor(a.ref,k),a.descriptors[i])))throw new PrivacyWriteAdmissionHeld('migration_statement_bind_drift');}
 };assert();return {assert};
}
function statementMethod(s:object,key:string):{value:Function;assert:()=>void}{
 let p:object|null=s;const chain:{ref:object;proto:object|null;descriptor:PropertyDescriptor|undefined}[]=[];
 for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,key),proto=Object.getPrototypeOf(p);chain.push({ref:p,proto,descriptor:d});if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw new PrivacyWriteAdmissionHeld('migration_statement_method');
  const assert=()=>{let current:object|null=s;for(const original of chain){if(current!==original.ref||Object.getPrototypeOf(original.ref)!==original.proto)throw new PrivacyWriteAdmissionHeld('migration_statement_method_drift');const actual=Object.getOwnPropertyDescriptor(original.ref,key);if(original.descriptor?!equalDescriptor(actual,original.descriptor):actual!==undefined)throw new PrivacyWriteAdmissionHeld('migration_statement_method_drift');current=original.proto;}};return {value:d.value,assert};
 }p=proto;}throw new PrivacyWriteAdmissionHeld('migration_statement_method_absent');
}
function prepared(native:D1Database,witness:Witness,sql:string,binds:readonly (string|number)[]):{statement:D1PreparedStatement;witness:Witness}{
 bounded(sql,binds);witness.assert();const unbound=native.prepare(sql);if(!unbound||typeof unbound!=='object')throw new PrivacyWriteAdmissionHeld('migration_statement');const initial=statementWitness(unbound),bind=statementMethod(unbound,'bind');initial.assert();bind.assert();const statement=bind.value.call(unbound,...binds) as D1PreparedStatement;initial.assert();bind.assert();witness.assert();
 if(!statement||typeof statement!=='object')throw new PrivacyWriteAdmissionHeld('migration_statement');const final=statementWitness(statement);return {statement,witness:{assert(){initial.assert();bind.assert();final.assert();witness.assert();}}};
}
function input(x:Original):Original{
 if(!x||typeof x!=='object'||Reflect.ownKeys(x).length!==5)throw new PrivacyWriteAdmissionHeld('migration_input');
 const operationId=own(x,'operationId'),layout=own(x,'layout'),sourceKind=own(x,'sourceKind'),originalEpoch=own(x,'originalEpoch'),nextEpoch=own(x,'nextEpoch');
 const legacy=sourceKind==='public-predecessor';
 if(!lower32(operationId)||!lower32(nextEpoch)||(legacy?originalEpoch!==null||layout!=='recorded-live-20261010':!lower32(originalEpoch)||originalEpoch===nextEpoch))throw new PrivacyWriteAdmissionHeld('migration_input');
 if(!['canonical','recorded-live-20261010'].includes(layout as string)||!['pre-marker','marker','public-predecessor','current-cookie','current-cookie-pre-seal'].includes(sourceKind as string))throw new PrivacyWriteAdmissionHeld('migration_input');
 return Object.freeze({operationId:operationId as string,layout:layout as AdmissionLayout,sourceKind:sourceKind as SourceKind,originalEpoch:originalEpoch as string|null,nextEpoch:nextEpoch as string});
}
function proof(checkOriginal:boolean,legacy=false,oneNativeClock=false):string{const tuple=legacy?LEGACY_TUPLE:TUPLE,protocol=legacy?'olympus-write-admission-experiment-1':VERSION,epoch=legacy?" AND ?3=''":" AND epoch=?3 AND mode='closed'";const observed=oneNativeClock?'(SELECT observed_at FROM native_clock)':NOW;return `WITH ${oneNativeClock?`native_clock AS MATERIALIZED(SELECT ${NOW} AS observed_at),`:''}actual AS MATERIALIZED(SELECT type,name,tbl_name,sql FROM sqlite_master WHERE ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL}),
 expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1))
 SELECT CASE WHEN ${PROVIDER_METADATA_CURRENT_SQL} AND (SELECT COUNT(*) FROM actual)=json_array_length(?1)
 AND NOT EXISTS(SELECT type,name,tbl_name,sql FROM actual EXCEPT SELECT type,name,tbl_name,sql FROM expected)
 AND NOT EXISTS(SELECT type,name,tbl_name,sql FROM expected EXCEPT SELECT type,name,tbl_name,sql FROM actual)
 AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)
 AND (SELECT COUNT(*) FROM ${SLOT})=1 AND EXISTS(SELECT 1 FROM ${SLOT} WHERE singleton=1 AND protocol='${protocol}'${epoch} AND active=0 AND nonce='' AND purpose='' AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0${checkOriginal?` AND ${tuple}=?2`:''})
 AND typeof(${observed})='integer' AND ${observed}>0 AND ${observed}<=253402300799 AND ${observed}>=CAST(?5 AS INTEGER) AND ${observed}<CAST(?4 AS INTEGER)
 THEN 1 ELSE json_extract('original_cookie_migration_refused','$') END AS admitted,
 (SELECT ${tuple} FROM ${SLOT} WHERE singleton=1) AS original_tuple,${observed} AS observed_at`;
}
function originalDataGuard(old:Profile):string{
 const equality=['site_users','site_applications'].map(name=>{const columns=old.tables.find(t=>t.name===name)!.columns,values=['_rowid_',...columns.map(c=>id(c)+' COLLATE BINARY')],typed=columns.map(c=>'typeof('+id(c)+')');
  const a=`SELECT ${values.concat(typed).join(',')} FROM ${id(name)}`,b=`SELECT __cookie_original_rowid,${columns.map(c=>id(c)+' COLLATE BINARY').concat(typed).join(',')} FROM ${id('cookie_original_'+name+'_v1')}`;
  return `NOT EXISTS(${a} EXCEPT ${b}) AND NOT EXISTS(${b} EXCEPT ${a})`;});
 const validBirth=`NOT EXISTS(SELECT 1 FROM site_users WHERE typeof(account_incarnation)<>'text' OR length(account_incarnation)<>32 OR length(CAST(account_incarnation AS BLOB))<>32 OR instr(account_incarnation,char(0))<>0 OR account_incarnation GLOB '*[^0-9a-f]*') AND (SELECT COUNT(*) FROM site_users)=(SELECT COUNT(DISTINCT account_incarnation) FROM site_users)`;
 return `SELECT CASE WHEN ${equality.join(' AND ')} AND ${validBirth} AND (SELECT COUNT(*) FROM privacy_rejection_decisions)=0 AND EXISTS(SELECT 1 FROM privacy_rejection_expiry_control WHERE singleton=1 AND protocol='original-guild-rejection-expiry-v1' AND observed_at=0 AND selected_count=0) AND (SELECT COUNT(*) FROM privacy_rejection_expiry_control)=1 THEN 1 ELSE json_extract('original_cookie_legacy_data_changed','$') END AS preserved`;
}
// Six exact dated raid columns; old rows acquire no inferred decisions or mention consent.
const raidFields=[["community_event_signups","remind_mention","remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1))",0],["community_event_signups","decision","decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined'))",null],["community_event_signups","decided_by","decided_by TEXT",null],["community_event_signups","decided_at","decided_at INTEGER",null],["community_event_signups","decision_revision","decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0)",0],["community_event_reminders","mention_ids","mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))",null]] as const;
// Closed exact tables derived independently from the six dated ALTERs, including layout bytes.
const raidTargetLayouts=[{"sourceSignupSQL":"CREATE TABLE community_event_signups (               -- one effective answer per member and event\n  event_id       TEXT NOT NULL,\n  discord_id     TEXT NOT NULL,\n  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n  character_key  TEXT,                                             -- communityKey(character_name)\n  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)\n  updated_at     INTEGER NOT NULL,\n  write_nonce    TEXT,\n  PRIMARY KEY (event_id, discord_id),\n  CHECK ((character_name IS NULL) = (character_key IS NULL))\n)","signupSQL":"CREATE TABLE community_event_signups (               -- one effective answer per member and event\n  event_id       TEXT NOT NULL,\n  discord_id     TEXT NOT NULL,\n  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n  character_key  TEXT,                                             -- communityKey(character_name)\n  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)\n  updated_at     INTEGER NOT NULL,\n  write_nonce    TEXT, remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1)), decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined')), decided_by TEXT, decided_at INTEGER, decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0),\n  PRIMARY KEY (event_id, discord_id),\n  CHECK ((character_name IS NULL) = (character_key IS NULL))\n)","reminderSQL":"CREATE TABLE community_event_reminders (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),\n  starts_at INTEGER NOT NULL,\n  actor TEXT,\n  consent_version INTEGER,\n  guild_id TEXT NOT NULL,\n  channel_id TEXT NOT NULL,\n  host TEXT NOT NULL,\n  op_id TEXT NOT NULL CHECK (length(op_id) = 22),\n  claim_nonce TEXT,\n  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),\n  message_id TEXT,\n  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),\n  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  last_attempt_at INTEGER NOT NULL DEFAULT 0,\n  retain_until INTEGER NOT NULL\n, consent_account_incarnation TEXT CHECK(consent_account_incarnation IS NULL OR (typeof(consent_account_incarnation)='text' AND length(consent_account_incarnation)=32 AND length(CAST(consent_account_incarnation AS BLOB))=32 AND instr(consent_account_incarnation,char(0))=0 AND consent_account_incarnation NOT GLOB '*[^0-9a-f]*')), mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array')))"},{"sourceSignupSQL":"CREATE TABLE community_event_signups (\n     event_id       TEXT NOT NULL,\n     discord_id     TEXT NOT NULL,\n     status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n     character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n     character_key  TEXT,\n     raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n     revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n     rsvp_starts_at INTEGER NOT NULL,\n     updated_at     INTEGER NOT NULL,\n     write_nonce    TEXT,\n     PRIMARY KEY (event_id, discord_id),\n     CHECK ((character_name IS NULL) = (character_key IS NULL))\n   )","signupSQL":"CREATE TABLE community_event_signups (\n     event_id       TEXT NOT NULL,\n     discord_id     TEXT NOT NULL,\n     status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),\n     character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),\n     character_key  TEXT,\n     raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),\n     revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),\n     rsvp_starts_at INTEGER NOT NULL,\n     updated_at     INTEGER NOT NULL,\n     write_nonce    TEXT, remind_mention INTEGER NOT NULL DEFAULT 0 CHECK (remind_mention IN (0, 1)), decision TEXT CHECK (decision IS NULL OR decision IN ('accepted', 'bench', 'declined')), decided_by TEXT, decided_at INTEGER, decision_revision INTEGER NOT NULL DEFAULT 0 CHECK (decision_revision >= 0),\n     PRIMARY KEY (event_id, discord_id),\n     CHECK ((character_name IS NULL) = (character_key IS NULL))\n   )","reminderSQL":"CREATE TABLE community_event_reminders (\n  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,\n  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),\n  starts_at INTEGER NOT NULL,\n  actor TEXT,\n  consent_version INTEGER,\n  guild_id TEXT NOT NULL,\n  channel_id TEXT NOT NULL,\n  host TEXT NOT NULL,\n  op_id TEXT NOT NULL CHECK (length(op_id) = 22),\n  claim_nonce TEXT,\n  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),\n  message_id TEXT,\n  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),\n  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  last_attempt_at INTEGER NOT NULL DEFAULT 0,\n  retain_until INTEGER NOT NULL\n, consent_account_incarnation TEXT CHECK(consent_account_incarnation IS NULL OR (typeof(consent_account_incarnation)='text' AND length(consent_account_incarnation)=32 AND length(CAST(consent_account_incarnation AS BLOB))=32 AND instr(consent_account_incarnation,char(0))=0 AND consent_account_incarnation NOT GLOB '*[^0-9a-f]*')), mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array')))"}] as const;
function raidUninitializedSQL():string{return raidFields.map(([table,column,,value])=>`NOT EXISTS(SELECT 1 FROM ${id(table)} WHERE ${value===null?`${id(column)} IS NOT NULL`:`typeof(${id(column)})<>'integer' OR ${id(column)}<>0`})`).join(' AND ');}
/** One closed declaration/set guard for both original capture paths and their common planner. */
function assertClosedMigrationPlan(old:Profile,next:Profile,kind:SourceKind):void{
 const layout=raidTargetLayouts.find(x=>x.sourceSignupSQL===old.tables.find(t=>t.name==='community_event_signups')?.sql);
 if(!layout||next.tables.find(t=>t.name==='community_event_signups')?.sql!==layout.signupSQL||next.tables.find(t=>t.name==='community_event_reminders')?.sql!==layout.reminderSQL)throw new PrivacyWriteAdmissionHeld('migration_source_raid_table');
 if(!['pre-marker','marker','public-predecessor'].includes(kind))throw new PrivacyWriteAdmissionHeld('migration_closed_source_kind');
 const names=(p:Profile)=>p.tables.map(t=>t.name),before=names(old),after=names(next);
 if(new Set(before).size!==before.length||new Set(after).size!==after.length)throw new PrivacyWriteAdmissionHeld('migration_closed_source_set');
 const changed=old.tables.filter(t=>next.tables.find(n=>n.name===t.name)?.sql!==t.sql).map(t=>t.name).sort();
 const allowed=[...new Set([...fields.map(x=>x[0]),...raidFields.map(x=>x[0]),...(kind!=='marker'?['site_users','site_applications']:[])])].sort();
 const added=after.filter(name=>!before.includes(name)).sort(),removed=before.filter(name=>!after.includes(name));
 const additions=['qr_beta_fern_windows',...(kind!=='marker'?['privacy_rejection_decisions','privacy_rejection_expiry_control']:[])].sort();
 if(JSON.stringify(changed)!==JSON.stringify(allowed)||JSON.stringify(added)!==JSON.stringify(additions)||removed.length)throw new PrivacyWriteAdmissionHeld('migration_closed_source_set');
 for(const [table,column,declaration] of raidFields){
  const prior=old.tables.find(t=>t.name===table),target=next.tables.find(t=>t.name===table);
  if(!prior||!target||prior.columns.includes(column)||target.columns.filter(c=>c===column).length!==1||target.sql.split(declaration).length!==2)throw new PrivacyWriteAdmissionHeld('migration_source_raid_column');
 }
 for(const table of ['community_event_signups','community_event_reminders']){
  const prior=old.tables.find(t=>t.name===table)!,target=next.tables.find(t=>t.name===table)!;
  const columns=[...prior.columns,...fields.filter(x=>x[0]===table).map(x=>x[1]),...raidFields.filter(x=>x[0]===table).map(x=>x[1])].sort();
  if(JSON.stringify(target.columns.slice().sort())!==JSON.stringify(columns))throw new PrivacyWriteAdmissionHeld('migration_source_raid_column');
 }
}
function plan(old:Profile,next:Profile,kind:SourceKind,originalEpoch:string|null,nextEpoch:string,originalTuple:string,publicFenceEpoch?:string):{steps:readonly Step[];epochStep:number}{
 assertClosedMigrationPlan(old,next,kind);
 const steps:Step[]=[];const add=(sql:string,binds:(string|number)[]=[])=>steps.push(Object.freeze({sql,binds:Object.freeze(binds.slice())}));
 const legacy=kind==='public-predecessor'&&publicFenceEpoch===undefined,rebuild=kind!=='marker';let epochStep=-1;
 for(const t of old.triggers)add('DROP TRIGGER '+id(t.name));
 if(legacy){
  add(`CREATE TABLE cookie_original_admission_v1 AS SELECT singleton,protocol,active,nonce,purpose,entry_changes,logical_changes FROM ${SLOT}`);add('DROP TABLE '+SLOT);add(next.slotSQL);epochStep=steps.length;
  add(`INSERT INTO ${SLOT}(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes) SELECT singleton,'${VERSION}',?1,'closed',active,nonce,purpose,entry_changes,logical_changes FROM cookie_original_admission_v1 WHERE ${LEGACY_TUPLE}=?2 RETURNING epoch,mode`,[nextEpoch,originalTuple]);
  add(`SELECT CASE WHEN (SELECT COUNT(*) FROM ${SLOT})=1 AND NOT EXISTS(SELECT singleton,active,nonce,purpose,entry_changes,logical_changes FROM ${SLOT} EXCEPT SELECT singleton,active,nonce,purpose,entry_changes,logical_changes FROM cookie_original_admission_v1) AND NOT EXISTS(SELECT singleton,active,nonce,purpose,entry_changes,logical_changes FROM cookie_original_admission_v1 EXCEPT SELECT singleton,active,nonce,purpose,entry_changes,logical_changes FROM ${SLOT}) THEN 1 ELSE json_extract('original_cookie_control_changed','$') END AS preserved`);add('DROP TABLE cookie_original_admission_v1');
 }
 if(rebuild){
  for(const name of ['site_users','site_applications']){const t=old.tables.find(t=>t.name===name)!,target=next.tables.find(t=>t.name===name)!,cols=t.columns.map(id).join(',');
   add(`CREATE TABLE ${id('cookie_original_'+name+'_v1')} AS SELECT _rowid_ AS __cookie_original_rowid,${cols} FROM ${id(name)}`);add('DROP TABLE '+id(name));add(target.sql);add(`INSERT INTO ${id(name)}(_rowid_,${cols}) SELECT __cookie_original_rowid,${cols} FROM ${id('cookie_original_'+name+'_v1')} ORDER BY __cookie_original_rowid`);
  }
  for(const name of ['privacy_rejection_decisions','privacy_rejection_expiry_control'])add(next.tables.find(t=>t.name===name)!.sql);add("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)");
  add(originalDataGuard(old));for(const name of ['site_users','site_applications'])add('DROP TABLE '+id('cookie_original_'+name+'_v1'));
 }
 add(next.tables.find(t=>t.name==='qr_beta_fern_windows')!.sql);
 for(const [table,column] of fields){const d=declarations[column];if(typeof d!=='string'||(column==='beta_window_id'?d!=="beta_window_id TEXT REFERENCES qr_beta_fern_windows(id)":!d.startsWith(column+' TEXT CHECK(')))throw new PrivacyWriteAdmissionHeld('migration_source_column');add('ALTER TABLE '+id(table)+' ADD COLUMN '+d);}
 for(const [table,,declaration] of raidFields)add('ALTER TABLE '+id(table)+' ADD COLUMN '+declaration);
 for(const index of next.indexes){const prior=old.indexes.find(t=>t.name===index.name);if(!prior||rebuild&&['site_users','site_applications'].includes(index.tbl_name))add(index.sql);else if(JSON.stringify(prior)!==JSON.stringify(index))throw new PrivacyWriteAdmissionHeld('migration_source_index');}
 for(const t of next.triggers)add(t.sql);
 const nulls=fields.map(([table,column])=>`NOT EXISTS(SELECT 1 FROM ${id(table)} WHERE ${id(column)} IS NOT NULL)`).join(' AND ');add(`SELECT CASE WHEN ${nulls} AND ${raidUninitializedSQL()} AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE json_extract('original_cookie_delayed_birth_adopted','$') END AS preserved`);
 if(!legacy){epochStep=steps.length;add(`UPDATE ${SLOT} SET epoch=?1 WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?2 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?3 RETURNING epoch,mode`,[nextEpoch,publicFenceEpoch??originalEpoch!,originalTuple]);}
 if(steps.length+4>MAX_QUERIES)throw new PrivacyWriteAdmissionHeld('migration_d1_query_limit');for(const step of steps)bounded(step.sql,step.binds);
 return {steps:Object.freeze(steps),epochStep};
}
/** Source-owned additive transition from the exact .160 cookie profile. No business writes or rebuild. */
const dispatchSealTriggers=[{"name":"beta_dispatch_seal_no_replace","sql":"CREATE TRIGGER beta_dispatch_seal_no_replace BEFORE INSERT ON site_settings WHEN (NEW.key IN('betaResetDispatchSealV1','betaResetPolicyV1') AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')) OR EXISTS(SELECT 1 FROM site_settings AS protected WHERE protected.rowid=NEW.rowid AND (protected.key='betaResetDispatchSealV1' OR (protected.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')))) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"},{"name":"beta_dispatch_seal_no_update","sql":"CREATE TRIGGER beta_dispatch_seal_no_update BEFORE UPDATE ON site_settings WHEN ((OLD.key='betaResetDispatchSealV1' OR NEW.key='betaResetDispatchSealV1' OR ((OLD.key='betaResetPolicyV1' OR NEW.key='betaResetPolicyV1') AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1'))) OR EXISTS(SELECT 1 FROM site_settings AS protected WHERE protected.rowid=NEW.rowid AND (protected.key='betaResetDispatchSealV1' OR (protected.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1'))))) AND NOT (NEW.rowid IS OLD.rowid AND NEW.key IS OLD.key AND typeof(NEW.key)=typeof(OLD.key) AND NEW.value IS OLD.value AND typeof(NEW.value)=typeof(OLD.value) AND NEW.updated_at IS OLD.updated_at AND typeof(NEW.updated_at)=typeof(OLD.updated_at) AND OLD.updated_by IS NOT NULL AND NEW.updated_by IS NULL) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"},{"name":"beta_dispatch_seal_no_delete","sql":"CREATE TRIGGER beta_dispatch_seal_no_delete BEFORE DELETE ON site_settings WHEN OLD.key='betaResetDispatchSealV1' OR (OLD.key='betaResetPolicyV1' AND EXISTS(SELECT 1 FROM site_settings WHERE key='betaResetDispatchSealV1')) BEGIN SELECT RAISE(ABORT,'beta_dispatch_seal_immutable'); END"}] as const;
function planDispatchSealProfile(old:Profile,next:Profile,originalEpoch:string,nextEpoch:string,originalTuple:string):{steps:readonly Step[];epochStep:number}{
 if(JSON.stringify(next)!==JSON.stringify({...old,triggers:[...old.triggers,...dispatchSealTriggers]})
  ||new Set(next.triggers.map(t=>t.name)).size!==next.triggers.length)throw new PrivacyWriteAdmissionHeld('migration_dispatch_seal_source_set');
 const steps:Step[]=dispatchSealTriggers.map(t=>Object.freeze({sql:t.sql,binds:Object.freeze([])}));
 steps.push(Object.freeze({sql:`UPDATE ${SLOT} SET epoch=?1 WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?2 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?3 RETURNING epoch,mode`,binds:Object.freeze([nextEpoch,originalEpoch,originalTuple])}));
 for(const step of steps)bounded(step.sql,step.binds);return {steps:Object.freeze(steps),epochStep:3};
}
/** The capture performs an actual Native complete-layout/FK/closed tuple read. It never accepts a boolean proof. */
export async function captureWholeNativeMigration(native:D1Database,original:Original):Promise<WholeMigrationCapability>{
 const x=input(original);if(x.sourceKind==='current-cookie'||x.sourceKind==='current-cookie-pre-seal')return captureCurrentCookieProfileEpoch(native,x);const witness=methods(native),key=x.layout==='canonical'?'canonical':'recordedLive',old=sources[x.sourceKind]?.[key],next=JSON.parse(x.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Profile;
 const legacy=x.sourceKind==='public-predecessor';if(!old||!next||old.profile.slotColumns.length!==(legacy?7:9))throw new PrivacyWriteAdmissionHeld('migration_installed_source_kind');
 assertClosedMigrationPlan(old.profile,next,x.sourceKind);
 const incoming=x.sourceKind!=='marker'?" AND NOT EXISTS(SELECT 1 FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type='table' AND f.\"table\" IN('site_users','site_applications','privacy_write_admission'))":'';
 witness.assert();const p0=prepared(native,witness,proof(false,legacy).replace('AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)','AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)'+incoming),[JSON.stringify(old.objects),'',x.originalEpoch??'','253402300800','1']),first=statementMethod(p0.statement,'first');p0.witness.assert();first.assert();const row:unknown=await first.value.call(p0.statement);p0.witness.assert();first.assert();
 const snapshot=rowSnapshot(row,['admitted','original_tuple','observed_at']);witness.assert();snapshot.witness.assert();const [admitted,tuple,time]=snapshot.values;
 if(admitted!==1||typeof tuple!=='string'||!Number.isSafeInteger(time)||typeof time!=='number'||time<=0||time>253402300499)throw new PrivacyWriteAdmissionHeld('migration_capture_unconfirmed');
 const c=Object.freeze({...x,kind:'original_native_cookie_profile_migration' as const,createdAt:time,expiresAt:time+300,mode:legacy?'legacy_control_without_mode' as const:'closed' as const,readyToReopen:false as const}),p=plan(old.profile,next,x.sourceKind,x.originalEpoch,x.nextEpoch,tuple);
 const system=legacy?old.objects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[];
 originalCaptures.set(c,{native,witness,rowWitness:snapshot.witness,old,next,objects:[...objects[key],...system].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0),tuple,plan:p.steps,epochStep:p.epochStep,spent:false,executionExpiresAt:c.expiresAt});return c;
}
function stored(c:WholeMigrationCapability):Stored{const s=originalCaptures.get(c);if(!s)throw new PrivacyWriteAdmissionHeld('migration_foreign_capability');s.witness.assert();s.rowWitness.assert();return s;}
/** Read-only original capture witness; no Native, SQL, dispatch or observation authority escapes. */
export function assertOriginalWholeNativeMigrationCapture(c:WholeMigrationCapability):void{stored(c);}
/** Only attenuation of an already branded capture: this cannot mint or renew a Native lease. */
export function bindOriginalWholeNativeMigrationCloseDeadline(c:WholeMigrationCapability,originalExpiresAt:number):void{
 const s=stored(c);if(s.spent||typeof originalExpiresAt!=='number'||!Number.isSafeInteger(originalExpiresAt)||originalExpiresAt<=c.createdAt||originalExpiresAt>s.executionExpiresAt)throw new PrivacyWriteAdmissionHeld('migration_original_close_deadline');
 s.executionExpiresAt=originalExpiresAt;stored(c);
}
function resultRow(packet:unknown):unknown{
 const success=own(packet,'success'),results=own(packet,'results');if(success!==true||!Array.isArray(results)||own(results,'length')!==1)throw new PrivacyWriteAdmissionHeld('migration_original_result');return own(results,'0');
}
/** Private transport custody for the SAME Native migration capability and exact source-issued returns.
 * No caller profile, SQL, tuple, copied receipt, provider drain or reopen authority enters this map. */
export type OwnedWholeNativeMigrationObservation=Readonly<{
 operationId:string;layout:AdmissionLayout;sourceKind:SourceKind;originalEpoch:string|null;nextEpoch:string;
 createdAt:number;expiresAt:number;originalProfileDigest64:string;targetProfileDigest64:string;nativeResultDigest64:string;readbackDigest64:string;
 migrationFinishedAt:number;readbackObservedAt:number;mode:'closed';providerDrainQualified:false;readyToReopen:false;
}>;
type OriginalMigrationGraph={copy:unknown;witness:Witness};
type OriginalMigrationExecution={cap:WholeMigrationCapability;copy:unknown;witness:Witness;finishedAt:number};
type OriginalMigrationReadback={cap:WholeMigrationCapability;copy:unknown;witness:Witness;observedAt:number};
const originalMigrationExecutions=new WeakMap<object,OriginalMigrationExecution>();
const originalMigrationReadbacks=new WeakMap<object,OriginalMigrationReadback>();
const migrationObservationSpent=new WeakSet<WholeMigrationCapability>();
const originalMigrationObservations=new WeakMap<OwnedWholeNativeMigrationObservation,Witness>();
// Capture the module's original WebCrypto receiver/method once. Replacements cannot manufacture digests.
const originalMigrationSubtle=crypto.subtle,originalMigrationDigestMethod=originalMigrationSubtle.digest,originalMigrationPrimitiveJSON=JSON.stringify;
// Only own indexed arrays and primitive scalars enter this serializer. No prototype toJSON is consulted.
function originalMigrationJSON(value:unknown):string{
 let slots=0;
 const encode=(v:unknown,depth:number):string=>{
  if(depth>16||++slots>100000)throw new PrivacyWriteAdmissionHeld('migration_transport_digest_bound');
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return originalMigrationPrimitiveJSON(v);
  if(!Array.isArray(v))throw new PrivacyWriteAdmissionHeld('migration_transport_digest_shape');
  const names=Reflect.ownKeys(v),length=own(v,'length');
  if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||names.length!==length+1||!names.includes('length'))throw new PrivacyWriteAdmissionHeld('migration_transport_digest_shape');
  let out='[';for(let i=0;i<length;i++){if(!names.includes(String(i)))throw new PrivacyWriteAdmissionHeld('migration_transport_digest_shape');if(i)out+=',';out+=encode(own(v,String(i)),depth+1);}return out+']';
 };return encode(value,0);
}
function migrationGraph(value:unknown):OriginalMigrationGraph{
 const originals:{ref:object;proto:object|null;keys:(string|symbol)[];descriptors:PropertyDescriptor[]}[]=[],seen=new Set<object>();let slots=0,bytes=0;
 const capture=(v:unknown,depth:number):unknown=>{
  if(depth>8||++slots>50000)throw new PrivacyWriteAdmissionHeld('migration_transport_graph_bound');
  if(v===null)return ['null'];if(v===undefined)return ['undefined'];
  if(typeof v==='boolean')return ['boolean',v];
  if(typeof v==='number'){if(!Number.isFinite(v))throw new PrivacyWriteAdmissionHeld('migration_transport_number');return ['number',Object.is(v,-0)?'-0':String(v)];}
  if(typeof v==='string'){bytes+=encoder.encode(v).length;if(bytes>MAX_BOUND)throw new PrivacyWriteAdmissionHeld('migration_transport_graph_bound');return ['string',v];}
  if(!v||typeof v!=='object'||seen.has(v))throw new PrivacyWriteAdmissionHeld('migration_transport_graph');seen.add(v);
  const proto=Object.getPrototypeOf(v),keys=Reflect.ownKeys(v);
  if(keys.some(k=>typeof k!=='string')||keys.length>4096)throw new PrivacyWriteAdmissionHeld('migration_transport_graph');
  const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(v,k));
  if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))throw new PrivacyWriteAdmissionHeld('migration_transport_accessor');
  originals.push({ref:v,proto,keys,descriptors:descriptors as PropertyDescriptor[]});
  if(Array.isArray(v)){
   const length=own(v,'length');if(!Number.isSafeInteger(length)||typeof length!=='number'||length<0||keys.length!==length+1||!keys.includes('length'))throw new PrivacyWriteAdmissionHeld('migration_transport_array');
   const copied:unknown[]=[];for(let i=0;i<length;i++){if(!keys.includes(String(i)))throw new PrivacyWriteAdmissionHeld('migration_transport_array');copied.push(capture(own(v,String(i)),depth+1));}return ['array',copied];
  }
  const copied:unknown[]=[];for(const key of (keys as string[]).slice().sort())copied.push([key,capture(own(v,key),depth+1)]);return ['object',copied];
 };
 const copy=capture(value,0),assert=()=>{
  for(const original of originals){const keys=Reflect.ownKeys(original.ref);if(Object.getPrototypeOf(original.ref)!==original.proto||keys.length!==original.keys.length||!original.keys.every(k=>keys.includes(k)))throw new PrivacyWriteAdmissionHeld('migration_transport_original_drift');
   for(let i=0;i<original.keys.length;i++){const actual=Object.getOwnPropertyDescriptor(original.ref,original.keys[i]!),saved=original.descriptors[i]!;if(!actual||!['get','set','writable','enumerable','configurable'].every(k=>actual[k as keyof PropertyDescriptor]===saved[k as keyof PropertyDescriptor])||!Object.hasOwn(actual,'value')||!Object.is(actual.value,saved.value))throw new PrivacyWriteAdmissionHeld('migration_transport_original_drift');}
  }
 };assert();return {copy,witness:{assert}};
}
async function originalMigrationDigest(value:unknown,witness:Witness):Promise<string>{
 const bytes=encoder.encode(originalMigrationJSON(value));if(bytes.length>MAX_BOUND)throw new PrivacyWriteAdmissionHeld('migration_transport_digest_bound');witness.assert();
 const out=await originalMigrationDigestMethod.call(originalMigrationSubtle,'SHA-256',bytes);witness.assert();
 if(!(out instanceof ArrayBuffer)||out.byteLength!==32)throw new PrivacyWriteAdmissionHeld('migration_transport_digest_unconfirmed');
 const values=new Uint8Array(out);let hex='';for(let i=0;i<32;i++)hex+=values[i]!.toString(16).padStart(2,'0');return hex;
}
/** One source-issued transport observation. Failed/unknown execution cannot be repaired by readback. */
export async function getOwnedWholeNativeMigrationObservation(cap:WholeMigrationCapability,exactExecuteReturn:object,exactObserveReturn:object):Promise<OwnedWholeNativeMigrationObservation>{
 const s=stored(cap),executed=originalMigrationExecutions.get(exactExecuteReturn),observed=originalMigrationReadbacks.get(exactObserveReturn);
 if(!executed||!observed||executed.cap!==cap||observed.cap!==cap||migrationObservationSpent.has(cap))throw new PrivacyWriteAdmissionHeld('migration_transport_foreign_or_spent');
 migrationObservationSpent.add(cap);
 const assert=()=>{s.witness.assert();s.rowWitness.assert();executed.witness.assert();observed.witness.assert();};assert();
 if(!Number.isSafeInteger(executed.finishedAt)||!Number.isSafeInteger(observed.observedAt)||executed.finishedAt<cap.createdAt||executed.finishedAt>=cap.expiresAt||observed.observedAt<executed.finishedAt)throw new PrivacyWriteAdmissionHeld('migration_transport_original_clock');
 const originalProfileDigest64=await originalMigrationDigest(s.originalObjects??s.old.objects,{assert});assert();
 const targetProfileDigest64=await originalMigrationDigest(s.objects,{assert});assert();
 const nativeResultDigest64=await originalMigrationDigest(executed.copy,{assert});assert();
 const readbackDigest64=await originalMigrationDigest(observed.copy,{assert});assert();
 const out:OwnedWholeNativeMigrationObservation=Object.freeze({operationId:cap.operationId,layout:cap.layout,sourceKind:cap.sourceKind,originalEpoch:cap.originalEpoch,nextEpoch:cap.nextEpoch,createdAt:cap.createdAt,expiresAt:cap.expiresAt,originalProfileDigest64,targetProfileDigest64,nativeResultDigest64,readbackDigest64,migrationFinishedAt:executed.finishedAt,readbackObservedAt:observed.observedAt,mode:'closed',providerDrainQualified:false,readyToReopen:false});
 originalMigrationObservations.set(out,{assert});return out;
}
/** Consumers call around each actual MAC/transport await; copied returned shapes never acquire custody. */
export function assertOwnedWholeNativeMigrationObservation(observation:OwnedWholeNativeMigrationObservation):void{
 const witness=originalMigrationObservations.get(observation);if(!witness)throw new PrivacyWriteAdmissionHeld('migration_transport_unowned_observation');witness.assert();
}

/** One original batch. A thrown or unconfirmed result leaves the capability spent; observation is read-only. */
export async function executeWholeNativeMigration(c:WholeMigrationCapability):Promise<Readonly<Record<string,unknown>>>{
 const s=originalCaptures.get(c);if(!s||s.spent)throw new PrivacyWriteAdmissionHeld('migration_original_spent_or_foreign');s.spent=true;s.witness.assert();s.rowWitness.assert();
 const all=[{sql:s.captureEpoch!==undefined?writerFenceProof(true,false,'closed'):proof(true,c.sourceKind==='public-predecessor'),binds:[JSON.stringify(s.old.objects),s.tuple,s.captureEpoch??c.originalEpoch??'',String(s.executionExpiresAt),String(c.createdAt)]},...s.plan,{sql:s.captureEpoch!==undefined?writerFenceProof(false,false,'closed'):proof(false),binds:[JSON.stringify(s.objects),'',c.nextEpoch,String(s.executionExpiresAt),String(c.createdAt)]}];
 if(all.length+2>MAX_QUERIES)throw new PrivacyWriteAdmissionHeld('migration_d1_query_limit');for(const step of all)bounded(step.sql,step.binds);
 s.witness.assert();s.rowWitness.assert();const preparedStatements=all.map(x=>prepared(s.native,s.witness,x.sql,x.binds)),statements=preparedStatements.map(p=>p.statement);preparedStatements.forEach(p=>p.witness.assert());s.witness.assert();s.rowWitness.assert();const out=await s.native.batch(statements);const originalPacket=migrationGraph(out);
 preparedStatements.forEach(p=>p.witness.assert());s.witness.assert();s.rowWitness.assert();if(!Array.isArray(out)||own(out,'length')!==all.length)throw new PrivacyWriteAdmissionHeld('migration_commit_unconfirmed');
 for(let i=0;i<out.length;i++){const packet=own(out,String(i)),error=packet&&typeof packet==='object'?Object.getOwnPropertyDescriptor(packet,'error'):undefined;if(own(packet,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined))throw new PrivacyWriteAdmissionHeld('migration_commit_unconfirmed');}
 const first=rowSnapshot(resultRow(own(out,'0')),['admitted','original_tuple','observed_at']),last=rowSnapshot(resultRow(own(out,String(out.length-1))),['admitted','original_tuple','observed_at']),epoch=resultRow(own(out,String(s.epochStep+1)));
 const epochSnapshot=rowSnapshot(epoch,['epoch','mode']);if(first.values[0]!==1||first.values[1]!==s.tuple||last.values[0]!==1||epochSnapshot.values[0]!==c.nextEpoch||epochSnapshot.values[1]!=='closed'||own(own(own(out,String(s.epochStep+1)),'meta'),'changes')!==1)throw new PrivacyWriteAdmissionHeld('migration_commit_unconfirmed');
 if(typeof first.values[2]!=='number'||typeof last.values[2]!=='number'||!Number.isSafeInteger(first.values[2])||!Number.isSafeInteger(last.values[2])||first.values[2]<c.createdAt||last.values[2]<first.values[2]||last.values[2]>=s.executionExpiresAt)throw new PrivacyWriteAdmissionHeld('migration_original_clock_unconfirmed');
 first.witness.assert();last.witness.assert();epochSnapshot.witness.assert();s.witness.assert();s.rowWitness.assert();
 const returned=Object.freeze({operationId:c.operationId,originalEpoch:c.originalEpoch,epoch:c.nextEpoch,mode:'closed',statements:all.length,nativeSchemaCommitted:true,legacyValuesPreservedWithinOriginalAtomicGroup:true,legacyDelayedFieldsNull:c.sourceKind!=='current-cookie'&&c.sourceKind!=='current-cookie-pre-seal',providerQualification:'unqualified',authenticatedProductionOrigin:false,providerDrainQualified:false,readyToReopen:false,erasureActivationQualified:false}),returnedGraph=migrationGraph(returned);
 const transportWitness={assert(){originalPacket.witness.assert();returnedGraph.witness.assert();preparedStatements.forEach(p=>p.witness.assert());first.witness.assert();last.witness.assert();epochSnapshot.witness.assert();s.witness.assert();s.rowWitness.assert();}};transportWitness.assert();
 originalMigrationExecutions.set(returned,{cap:c,copy:originalPacket.copy,witness:transportWitness,finishedAt:last.values[2] as number});return returned;
}
/** Same original handle/source/epoch only; this cannot retry installation or renew its 300-second lease. */
export async function observeWholeNativeMigration(c:WholeMigrationCapability):Promise<Readonly<Record<string,unknown>>>{
 const s=stored(c);if(!s.spent)throw new PrivacyWriteAdmissionHeld('migration_observation_requires_original');s.witness.assert();s.rowWitness.assert();const p0=prepared(s.native,s.witness,s.captureEpoch!==undefined?writerFenceProof(false,false,'closed'):proof(false),[JSON.stringify(s.objects),'',c.nextEpoch,'253402300800',String(c.createdAt)]),first=statementMethod(p0.statement,'first');p0.witness.assert();first.assert();const row:unknown=await first.value.call(p0.statement);p0.witness.assert();first.assert();
 const r=rowSnapshot(row,['admitted','original_tuple','observed_at']);s.witness.assert();s.rowWitness.assert();r.witness.assert();if(r.values[0]!==1||typeof r.values[2]!=='number'||!Number.isSafeInteger(r.values[2])||r.values[2]<c.createdAt)throw new PrivacyWriteAdmissionHeld('migration_readback_unconfirmed');
 const returned=Object.freeze({operationId:c.operationId,epoch:c.nextEpoch,mode:'closed',nativeProfileObserved:true,migrationRetryAllowed:false,originalLeaseRenewed:false,providerQualification:'unqualified',authenticatedProductionOrigin:false,providerDrainQualified:false,readyToReopen:false,erasureActivationQualified:false}),nativeRow=migrationGraph(row),returnedGraph=migrationGraph(returned);
 const transportWitness={assert(){nativeRow.witness.assert();returnedGraph.witness.assert();p0.witness.assert();first.assert();r.witness.assert();s.witness.assert();s.rowWitness.assert();}};transportWitness.assert();
 originalMigrationReadbacks.set(returned,{cap:c,copy:nativeRow.copy,witness:transportWitness,observedAt:r.values[2] as number});return returned;
}

declare const closedCandidatePageBrand:unique symbol,closedReplayResultBrand:unique symbol;
export type OriginalClosedRecoveryCandidatePage=Readonly<{[closedCandidatePageBrand]:true}>;
export type OriginalClosedRecoveryErasureResult=Readonly<{[closedReplayResultBrand]:true}>;
type Candidate=Readonly<{subject:string;accountIncarnation:string|null;generation:string|null;state:'active'|'retiring'|'retired'|null;observedAt:number;originalControl:string}>;
const closedCandidatePages=new WeakMap<OriginalClosedRecoveryCandidatePage,{cap:WholeMigrationCapability;rows:readonly Candidate[];check:()=>void;originalControl:string;observedAt:number}>();
const closedRecoveryResults=new WeakMap<OriginalClosedRecoveryErasureResult,{selection:OriginalClosedRecoveryReplaySelection;check:()=>void;nativeDigest:string;readbackDigest:string;observedAt:number;statements:number;cleanupCommitted?:boolean}>();
/** Fixed structured account-reference census. Free text/hints, credentials and provider payloads are not scanned. */
const recoveryCandidateColumns=Object.freeze(["acknowledged_by","actor","added_by","approved_by","candidate_id","claimed_by","closed_by","created_by","decided_by","denied_by","discord_id","matched_discord_id","observer_discord_id","owner_id","recorded_by","released_by","renewed_by","requester","requester_id","resolved_by","reviewed_by","set_by","signer","sponsor_discord_id","subject","subject_id","updated_by","voter_id"]);
const recoveryCandidateRelations="[[\"audit\",\"actor\"],[\"audit\",\"subject\"],[\"bnet_characters\",\"discord_id\"],[\"characters\",\"discord_id\"],[\"community_alt_claims\",\"discord_id\"],[\"community_alt_claims\",\"reviewed_by\"],[\"community_contribution_allocation_events\",\"actor\"],[\"community_contribution_decisions\",\"actor\"],[\"community_contribution_decisions\",\"discord_id\"],[\"community_contribution_members\",\"discord_id\"],[\"community_contribution_obligations\",\"discord_id\"],[\"community_contribution_receipts\",\"matched_discord_id\"],[\"community_contribution_receipts\",\"observer_discord_id\"],[\"community_craft_offers\",\"discord_id\"],[\"community_departure_reviews\",\"discord_id\"],[\"community_departure_reviews\",\"reviewed_by\"],[\"community_event_attendance\",\"discord_id\"],[\"community_event_attendance\",\"recorded_by\"],[\"community_event_changes\",\"actor\"],[\"community_event_deliveries\",\"actor\"],[\"community_event_reminders\",\"actor\"],[\"community_event_signups\",\"decided_by\"],[\"community_event_signups\",\"discord_id\"],[\"community_events\",\"created_by\"],[\"community_professions\",\"discord_id\"],[\"community_profiles\",\"discord_id\"],[\"community_refs\",\"discord_id\"],[\"community_restriction_cases\",\"acknowledged_by\"],[\"community_restriction_cases\",\"discord_id\"],[\"community_restriction_cases\",\"resolved_by\"],[\"community_restriction_cases\",\"reviewed_by\"],[\"community_restriction_cases\",\"set_by\"],[\"community_restriction_cases\",\"updated_by\"],[\"community_restriction_characters\",\"added_by\"],[\"community_restriction_characters\",\"renewed_by\"],[\"community_restriction_periods\",\"discord_id\"],[\"community_trials\",\"created_by\"],[\"community_trials\",\"discord_id\"],[\"community_trials\",\"sponsor_discord_id\"],[\"community_trials\",\"updated_by\"],[\"councillor_challenges\",\"signer\"],[\"councillor_keys\",\"signer\"],[\"invite_queue\",\"approved_by\"],[\"invite_queue\",\"claimed_by\"],[\"invite_queue\",\"discord_id\"],[\"members\",\"discord_id\"],[\"pending\",\"discord_id\"],[\"privacy_access_grants\",\"subject_id\"],[\"privacy_restore_replay\",\"subject_id\"],[\"privacy_serving_jobs\",\"subject_id\"],[\"privacy_subjects\",\"subject_id\"],[\"qr_beta_fern_windows\",\"actor\"],[\"qr_beta_fern_windows\",\"requester_id\"],[\"rename_holds\",\"closed_by\"],[\"rename_holds\",\"decided_by\"],[\"rename_holds\",\"discord_id\"],[\"role_settlements\",\"subject\"],[\"roster_effects\",\"discord_id\"],[\"ruleset_publications\",\"actor\"],[\"site_applications\",\"discord_id\"],[\"site_applications\",\"reviewed_by\"],[\"site_board_votes\",\"candidate_id\"],[\"site_board_votes\",\"voter_id\"],[\"site_friends\",\"owner_id\"],[\"site_news_notices\",\"created_by\"],[\"site_news_notices\",\"updated_by\"],[\"site_news_ops\",\"created_by\"],[\"site_reserved\",\"approved_by\"],[\"site_reserved\",\"owner_id\"],[\"site_reserved\",\"released_by\"],[\"site_settings\",\"updated_by\"],[\"site_users\",\"denied_by\"],[\"site_users\",\"discord_id\"],[\"site_votes\",\"voter_id\"],[\"verification_proofs\",\"requester\"],[\"verification_proofs\",\"signer\"],[\"verification_requests\",\"requester\"]]";
/** Fixed stored mention vector; aliases and bounds are source-owned, never caller SQL. */
function originalClosedRecoveryMentionShapeSQL():string{return `/* closed_recovery_mentions_shape_v1 */ CASE
 WHEN r.mention_ids IS NULL THEN 1
 WHEN typeof(r.mention_ids)<>'text' THEN 0
 WHEN NOT json_valid(r.mention_ids) THEN 0
 WHEN json_type(r.mention_ids)<>'array' THEN 0
 WHEN json_array_length(r.mention_ids)>50 THEN 0
 ELSE NOT EXISTS(SELECT 1 FROM json_each(r.mention_ids) m WHERE m.type<>'text' OR NOT(
 m.value='0' COLLATE BINARY OR (length(m.value) BETWEEN 17 AND 20
 AND length(CAST(m.value AS BLOB))=length(m.value) AND instr(m.value,char(0))=0
 AND m.value NOT GLOB '*[^0-9]*')))
 END /* closed_recovery_mentions_shape_end_v1 */`;}

function originalClosedRecoveryCandidateSQL(next:Profile):string{
 const relations=next.tables.flatMap(t=>t.columns.filter(c=>recoveryCandidateColumns.includes(c)).map(c=>[t.name,c])).sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0);
 if(JSON.stringify(relations)!==recoveryCandidateRelations)throw new PrivacyWriteAdmissionHeld('recovery_candidate_census_changed');
 const mentions=next.tables.filter(t=>t.name==='community_event_reminders');
 const declaration="mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))";
 if(mentions.length!==1||mentions[0]!.columns.filter(c=>c==='mention_ids').length!==1||mentions[0]!.sql.split(declaration).length!==2||!raidTargetLayouts.some(layout=>layout.reminderSQL===mentions[0]!.sql))throw new PrivacyWriteAdmissionHeld('recovery_candidate_mentions_declaration');
 const branches=relations.map(([table,column])=>`SELECT ${id(column!)} AS subject FROM ${id(table!)}`);
 // Exact counterpart spelling and JSON shape already consumed by fixed source cleanup.
 branches.push("SELECT nominee_key AS subject FROM site_votes WHERE nominee_kind='discord'","SELECT friend_key AS subject FROM site_friends WHERE friend_kind='discord'");
 for(const table of ['community_contribution_allocation_events','community_contribution_decisions'])for(const prefix of ['user:','member:','staff:'])branches.push(`SELECT substr(actor,${prefix.length+1}) AS subject FROM ${id(table)} WHERE substr(actor,1,${prefix.length})='${prefix}' COLLATE BINARY`);
 branches.push(`SELECT CASE WHEN e.type='object' AND(SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='kind')=1 AND(SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='key')=1 AND json_type(e.value,'$.key')='text' THEN json_extract(e.value,'$.key') ELSE json_extract('recovery_candidate_reference_shape_held','$') END AS subject
 FROM site_applications a,json_each(CASE WHEN json_valid(a.answers) AND json_type(a.answers)='object' THEN a.answers ELSE json_extract('recovery_candidate_answers_held','$') END,'$.references')e WHERE e.type='object' AND json_extract(e.value,'$.kind')='discord'`);
 branches.push(`SELECT CASE WHEN e.type='object' AND(SELECT COUNT(*) FROM json_each(e.value) f WHERE f.key='id')=1 AND json_type(e.value,'$.id')='text' THEN json_extract(e.value,'$.id') ELSE json_extract('recovery_candidate_provider_subject_held','$') END AS subject
 FROM privacy_provider_messages p,json_each(CASE WHEN json_valid(p.subjects) AND json_type(p.subjects)='array' THEN p.subjects ELSE json_extract('recovery_candidate_provider_shape_held','$') END)e`);
 // Validate the entire vector before json_each; invalid slots cannot disappear through page filters.
 branches.push(`SELECT e.value AS subject FROM community_event_reminders r,
 json_each(CASE WHEN r.mention_ids IS NULL THEN '[]' WHEN ${originalClosedRecoveryMentionShapeSQL()} THEN r.mention_ids ELSE json_extract('recovery_candidate_mentions_held','$') END)e WHERE e.type='text' AND e.value<>'0' COLLATE BINARY`);
 // Workerd permits at most five terms in each compound SELECT. Keep every original
 // branch and UNION deduplication inside bounded source-owned materialized groups.
 const groups:string[]=[];let level=branches,ordinal=0;
 while(level.length>5){const next:string[]=[];for(let offset=0;offset<level.length;offset+=5){const name=`recovery_candidate_${ordinal++}`;groups.push(`${name} AS MATERIALIZED(${level.slice(offset,offset+5).join(' UNION ')})`);next.push(`SELECT subject FROM ${name}`);}level=next;}
 return `WITH candidate_proof AS MATERIALIZED(${proof(false,false,true)}),${groups.length?groups.join(',')+',':''}candidates AS MATERIALIZED(${level.join(' UNION ')}),candidate_page AS MATERIALIZED(SELECT c.subject,(SELECT u.account_incarnation FROM site_users u WHERE u.discord_id=c.subject) AS account_incarnation,(SELECT p.generation FROM privacy_subjects p WHERE p.subject_id=c.subject) AS generation,(SELECT p.state FROM privacy_subjects p WHERE p.subject_id=c.subject) AS subject_state FROM candidates c WHERE typeof(c.subject)='text' AND length(c.subject) BETWEEN 17 AND 20 AND length(CAST(c.subject AS BLOB))=length(c.subject) AND instr(c.subject,char(0))=0 AND c.subject NOT GLOB '*[^0-9]*' AND c.subject>?6 COLLATE BINARY ORDER BY c.subject COLLATE BINARY LIMIT 1000) SELECT c.subject,c.account_incarnation,c.generation,c.subject_state,p.observed_at,p.original_tuple AS original_control,p.admitted FROM candidate_proof p LEFT JOIN candidate_page c ON 1 ORDER BY c.subject COLLATE BINARY`;
}
/** Original accepted source/installation identity is checked by the private owner, before this readonly Native batch. */
export async function captureOriginalClosedRecoveryCandidatePage(c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,afterSubject:string):Promise<OriginalClosedRecoveryCandidatePage>{
 assertOriginalPrivateReplayMigration(c,installation,cut,source);const s=stored(c);if(!s.spent||typeof afterSubject!=='string'||afterSubject!==''&&(afterSubject.length<17||afterSubject.length>20||/[^0-9]/.test(afterSubject)))throw new PrivacyWriteAdmissionHeld('recovery_candidate_cursor');
 const steps=[{sql:originalClosedRecoveryCandidateSQL(s.next),binds:[JSON.stringify(s.objects),'',c.nextEpoch,String(s.executionExpiresAt),String(c.createdAt),afterSubject]}];
 const plans=steps.map(x=>prepared(s.native,s.witness,x.sql,x.binds)),statements=plans.map(x=>x.statement);for(const p of plans)p.witness.assert();
 const packet=await s.native.batch(statements),graph=migrationGraph(packet);for(const p of plans)p.witness.assert();assertOriginalPrivateReplayMigration(c,installation,cut,source);
 if(!Array.isArray(packet)||own(packet,'length')!==1)throw new PrivacyWriteAdmissionHeld('recovery_candidate_packet');
 const result=own(packet,'0'),nativeRows=own(result,'results'),error=result&&typeof result==='object'?Object.getOwnPropertyDescriptor(result,'error'):undefined;if(own(result,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined)||!Array.isArray(nativeRows))throw new PrivacyWriteAdmissionHeld('recovery_candidate_rows');const nativeLength=own(nativeRows,'length');if(typeof nativeLength!=='number'||!Number.isSafeInteger(nativeLength)||nativeLength<1||nativeLength>1000)throw new PrivacyWriteAdmissionHeld('recovery_candidate_rows');
 const keys=['subject','account_incarnation','generation','subject_state','observed_at','original_control','admitted'] as const,first=rowSnapshot(own(nativeRows,'0'),keys),at=first.values[4],control=first.values[5];
 if(first.values[6]!==1||typeof control!=='string'||typeof at!=='number'||!Number.isSafeInteger(at)||at<=0||at>253402300799||at<c.createdAt||at>=s.executionExpiresAt)throw new PrivacyWriteAdmissionHeld('recovery_candidate_proof');
 const rowChecks:Witness[]=[],rows:Candidate[]=[];
 for(let i=0;i<nativeLength;i++){const r=i===0?first:rowSnapshot(own(nativeRows,String(i)),keys),[subject,n,g,state,rowAt,rowControl,admitted]=r.values;rowChecks.push(r.witness);
  if(admitted!==1||rowAt!==at||rowControl!==control)throw new PrivacyWriteAdmissionHeld('recovery_candidate_original_row');
  if(subject===null){if(nativeLength!==1||n!==null||g!==null||state!==null)throw new PrivacyWriteAdmissionHeld('recovery_candidate_original_row');continue;}
  if(typeof subject!=='string'||subject.length<17||subject.length>20||/[^0-9]/.test(subject)||subject<=afterSubject||rows.length&&subject<=rows[rows.length-1]!.subject||n!==null&&!lower32(n)||g!==null&&!lower32(g)||state!==null&&!['active','retiring','retired'].includes(state as string)||(g===null)!==(state===null))throw new PrivacyWriteAdmissionHeld('recovery_candidate_original_row');
  rows.push(Object.freeze({subject,accountIncarnation:n as string|null,generation:g as string|null,state:state as 'active'|'retiring'|'retired'|null,observedAt:at,originalControl:control}));
 }
 const check=()=>{stored(c);assertOriginalPrivateReplayMigration(c,installation,cut,source);graph.witness.assert();first.witness.assert();for(const p of plans)p.witness.assert();for(const p of rowChecks)p.assert();};check();
 const out=Object.freeze({}) as OriginalClosedRecoveryCandidatePage;closedCandidatePages.set(out,{cap:c,rows:Object.freeze(rows),check,originalControl:control,observedAt:at});return out;
}
export function originalClosedRecoveryCandidatePageFacts(page:OriginalClosedRecoveryCandidatePage,cap:WholeMigrationCapability):Readonly<{rows:readonly Candidate[];originalControl:string;observedAt:number;check:()=>void}>{const s=closedCandidatePages.get(page);if(!s||s.cap!==cap)throw new PrivacyWriteAdmissionHeld('recovery_candidate_foreign');s.check();return Object.freeze({rows:s.rows,originalControl:s.originalControl,observedAt:s.observedAt,check:s.check});}
declare const closedRetiredProofBrand:unique symbol;
export type OriginalClosedRecoveryRetiredProof=Readonly<{[closedRetiredProofBrand]:true}>;
const closedRetiredProofs=new WeakMap<OriginalClosedRecoveryRetiredProof,{cap:WholeMigrationCapability;page:OriginalClosedRecoveryCandidatePage;journal:string;installation:OriginalPrivateInstallation;cut:OriginalPrivateControlCut;source:OriginalAcceptedRecoverySource;index:number;subject:string;originalBirth:string|null;retainedJob:boolean;observedAt:number;markerConfirmed:boolean;digest:string;check:()=>void}>();
/** This permits a current Native retirement to stand without a live account birth only after
 * the original complete job/replay/generation and the entire structured-reference census agree.
 * It is a readonly proof, never a cleanup plan or evidence about an exported physical copy. */
export async function captureOriginalClosedRecoveryRetiredProof(c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,page:OriginalClosedRecoveryCandidatePage,index:number,originalJournal:string):Promise<OriginalClosedRecoveryRetiredProof>{return captureClosedRetiredProof(c,installation,cut,source,page,index,originalJournal);}
async function captureClosedRetiredProof(c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,page:OriginalClosedRecoveryCandidatePage,index:number,originalJournal:string,selection?:ReturnType<typeof consumeOriginalClosedRecoveryReplaySelection>):Promise<OriginalClosedRecoveryRetiredProof>{
 assertOriginalPrivateReplayMigration(c,installation,cut,source);const s=stored(c),f=originalClosedRecoveryCandidatePageFacts(page,c);
 if(!Number.isSafeInteger(index)||index<0||index>=f.rows.length||typeof originalJournal!=='string'||originalJournal.length>8192)throw new PrivacyWriteAdmissionHeld('recovery_retired_original_required');
 let j:unknown;try{j=JSON.parse(originalJournal);}catch{throw new PrivacyWriteAdmissionHeld('recovery_retired_original_required');}
 if(!Array.isArray(j)||j.length!==16||JSON.stringify(j)!==originalJournal||!lower32(j[0])||!lower32(j[2])||j[10]!=='committed'||typeof j[12]!=='number'||!Number.isSafeInteger(j[12])||j[12]<1||j[13]!==j[12]+31622400)throw new PrivacyWriteAdmissionHeld('recovery_retired_original_required');
 const row=f.rows[index]!;if(row.accountIncarnation!==null||row.generation!==j[2]||row.state!=='retired')throw new PrivacyWriteAdmissionHeld('recovery_retired_current_generation');
 originalClosedRecoveryCandidateSQL(s.next); // Fails if the fixed complete relation census has drifted.
 const relations=JSON.parse(recoveryCandidateRelations) as [string,string][],purpose=new Set(['privacy_subjects','privacy_restore_replay','privacy_serving_jobs']);
 const absent=relations.filter(([table])=>!purpose.has(table)).map(([table,column])=>`NOT EXISTS(SELECT 1 FROM ${id(table)} WHERE ${id(column)}=?1)`);
 absent.push("NOT EXISTS(SELECT 1 FROM site_votes WHERE nominee_kind='discord' AND nominee_key=?1)","NOT EXISTS(SELECT 1 FROM site_friends WHERE friend_kind='discord' AND friend_key=?1)");
 for(const table of ['community_contribution_allocation_events','community_contribution_decisions'])for(const prefix of ['user:','member:','staff:'])absent.push(`NOT EXISTS(SELECT 1 FROM ${id(table)} WHERE actor='${prefix}'||?1 COLLATE BINARY)`);
 // Ambiguous JSON/text references hold; no other owner's payload is edited by this proof.
 absent.push("NOT EXISTS(SELECT 1 FROM site_applications WHERE instr(answers,?1)>0)","NOT EXISTS(SELECT 1 FROM privacy_provider_messages WHERE instr(subjects,?1)>0)");
 absent.push(`NOT EXISTS(SELECT 1 FROM community_event_reminders r WHERE CASE WHEN r.mention_ids IS NULL THEN 0 WHEN NOT(${originalClosedRecoveryMentionShapeSQL()}) THEN 1 ELSE EXISTS(SELECT 1 FROM json_each(r.mention_ids) e WHERE e.type='text' AND e.value=?1 COLLATE BINARY) END)`);
 let marker='1';if(selection){selection.check();if(selection.subject!==row.subject||selection.generation!==j[2]||selection.operationId!==j[0]||selection.erasedAt!==j[12]||selection.retainUntil!==j[13]||selection.originalControl!==f.originalControl)throw new PrivacyWriteAdmissionHeld('recovery_retired_selection');
  if(selection.markerState==='active'){if(typeof selection.markerKey!=='string'||selection.markerKey.length!==43||/[^A-Za-z0-9_-]/.test(selection.markerKey)||typeof selection.originalRejectedAt!=='number'||!Number.isSafeInteger(selection.originalRejectedAt)||selection.markerRetainUntil!==selection.originalRejectedAt+31536000)throw new PrivacyWriteAdmissionHeld('recovery_retired_marker');marker=`EXISTS(SELECT 1 FROM privacy_denial_markers WHERE subject_key='${selection.markerKey}' COLLATE BINARY AND denied_at=${selection.originalRejectedAt} AND retain_until=${selection.markerRetainUntil} AND reason='rejected_guild_application_or_membership' AND denied_at<=${NOW} AND retain_until>${NOW})`;}
  else if(selection.markerKey!==null||selection.originalRejectedAt!==null||selection.markerRetainUntil!==null)throw new PrivacyWriteAdmissionHeld('recovery_retired_marker');
 }
 const validJob="operation_id=?3 AND subject_id=?1 AND subject_generation=?2 AND state='complete' AND completed_at=?4 AND typeof(created_at)='integer' AND created_at>0 AND created_at<=?4 AND retain_until=created_at+31622400 AND (original_account_incarnation IS NULL OR(typeof(original_account_incarnation)='text' AND length(original_account_incarnation)=32 AND length(CAST(original_account_incarnation AS BLOB))=32 AND instr(original_account_incarnation,char(0))=0 AND original_account_incarnation NOT GLOB '*[^0-9a-f]*'))";
 const validReplay="operation_id=?3 AND subject_id=?1 AND retired_generation=?2 AND erased_at=?4 AND retain_until=?5 AND scope='serving_account'";
 const sql=`SELECT CASE WHEN (${marker}) AND ${absent.join(' AND ')}
 AND EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?2 AND state='retired' AND erased_at=?4 AND retain_until=?5)
 AND EXISTS(SELECT 1 FROM privacy_restore_replay WHERE ${validReplay})
 AND NOT EXISTS(SELECT 1 FROM privacy_restore_replay WHERE subject_id=?1 AND (${validReplay}) IS NOT 1)
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE (subject_id=?1 OR operation_id=?3) AND (${validJob}) IS NOT 1)
 AND ?4<=${NOW} AND ?5>${NOW} AND ?5=?4+31622400 THEN 1 ELSE json_extract('closed_recovery_retired_references_held','$') END AS retired,
 (SELECT original_account_incarnation FROM privacy_serving_jobs WHERE ${validJob}) AS original_birth,
 EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE ${validJob}) AS retained_job,${NOW} AS observed_at`;
 const check=()=>{stored(c);assertOriginalPrivateReplayMigration(c,installation,cut,source);f.check();selection?.check();};check();
 const guard=writerFenceProof(true,false,'closed'),bounds=[JSON.stringify(s.objects),f.originalControl,c.nextEpoch,String(s.executionExpiresAt),String(c.createdAt)];
 const plans=[prepared(s.native,s.witness,guard,bounds),prepared(s.native,s.witness,sql,[row.subject,j[2] as string,j[0] as string,j[12] as number,j[13] as number]),prepared(s.native,s.witness,guard,bounds)];
 for(const p of plans)p.witness.assert();const packet=await s.native.batch(plans.map(p=>p.statement)),graph=migrationGraph(packet);check();for(const p of plans)p.witness.assert();
 if(!Array.isArray(packet)||own(packet,'length')!==3)throw new PrivacyWriteAdmissionHeld('recovery_retired_packet');
 for(let i=0;i<3;i++)if(own(own(packet,String(i)),'success')!==true)throw new PrivacyWriteAdmissionHeld('recovery_retired_packet');
 const before=rowSnapshot(resultRow(own(packet,'0')),['admitted','original_tuple','observed_at']),r=rowSnapshot(resultRow(own(packet,'1')),['retired','original_birth','retained_job','observed_at']),after=rowSnapshot(resultRow(own(packet,'2')),['admitted','original_tuple','observed_at']);
 const at=r.values[3];if(before.values[0]!==1||after.values[0]!==1||before.values[1]!==f.originalControl||after.values[1]!==f.originalControl||r.values[0]!==1||r.values[1]!==null&&!lower32(r.values[1])||r.values[2]!==0&&r.values[2]!==1||r.values[2]===0&&r.values[1]!==null||typeof at!=='number'||!Number.isSafeInteger(at)||at<f.observedAt||at<c.createdAt||at>=s.executionExpiresAt||typeof before.values[2]!=='number'||typeof after.values[2]!=='number'||before.values[2]>at||after.values[2]<at||after.values[2]>=s.executionExpiresAt)throw new PrivacyWriteAdmissionHeld('recovery_retired_readback');
 const current=()=>{check();graph.witness.assert();before.witness.assert();r.witness.assert();after.witness.assert();for(const p of plans)p.witness.assert();};current();
 const digest=await originalMigrationDigest(graph.copy,{assert:current});current();const out=Object.freeze({}) as OriginalClosedRecoveryRetiredProof;closedRetiredProofs.set(out,{cap:c,page,journal:originalJournal,installation,cut,source,index,subject:row.subject,originalBirth:r.values[1] as string|null,retainedJob:r.values[2]===1,observedAt:at,markerConfirmed:selection!==undefined,digest,check:current});return out;
}
export function originalClosedRecoveryRetiredProofFacts(proof:OriginalClosedRecoveryRetiredProof,cap:WholeMigrationCapability,page:OriginalClosedRecoveryCandidatePage,originalJournal:string):Readonly<{originalBirth:string|null;retainedJob:boolean;observedAt:number;markerConfirmed:boolean;digest:string;check:()=>void}>{const s=closedRetiredProofs.get(proof);if(!s||s.cap!==cap||s.page!==page||s.journal!==originalJournal)throw new PrivacyWriteAdmissionHeld('recovery_retired_foreign');s.check();return Object.freeze({originalBirth:s.originalBirth,retainedJob:s.retainedJob,observedAt:s.observedAt,markerConfirmed:s.markerConfirmed,digest:s.digest,check:s.check});}

/** After the independent durable reserve, repeat the genuine readonly proof and verify the
 * exact original marker supplied by the authenticated private selection. No cleanup is executed. */
export async function confirmOriginalClosedRecoveryRetiredSelection(c:WholeMigrationCapability,selection:OriginalClosedRecoveryReplaySelection,initial:OriginalClosedRecoveryRetiredProof):Promise<OriginalClosedRecoveryErasureResult>{
 const s=closedRetiredProofs.get(initial);if(!s||s.cap!==c||s.markerConfirmed)throw new PrivacyWriteAdmissionHeld('recovery_retired_foreign');s.check();const a=consumeOriginalClosedRecoveryReplaySelection(selection,c);a.check();
 const native=await captureClosedRetiredProof(c,s.installation,s.cut,s.source,s.page,s.index,s.journal,a);a.check();const read=await captureClosedRetiredProof(c,s.installation,s.cut,s.source,s.page,s.index,s.journal,a);a.check();const n=closedRetiredProofs.get(native)!,r=closedRetiredProofs.get(read)!;
 const check=()=>{a.check();n.check();r.check();if(!n.markerConfirmed||!r.markerConfirmed||r.observedAt<n.observedAt)throw new PrivacyWriteAdmissionHeld('recovery_retired_readback');};check();const result=Object.freeze({}) as OriginalClosedRecoveryErasureResult;closedRecoveryResults.set(result,{selection,check,nativeDigest:n.digest,readbackDigest:r.digest,observedAt:r.observedAt,statements:6,cleanupCommitted:false});return result;
}
/** Source-owned CLOSED cleanup. Only its original independent durable-spend producer can issue a selection.
 * Admission triggers are restored in this SAME original atomic batch; semantic guards are never dropped.
 * The slot never enters serving mode and its epoch/counters are preserved byte-for-byte. */
export async function executeOriginalClosedRecoveryErasure(c:WholeMigrationCapability,selection:OriginalClosedRecoveryReplaySelection):Promise<OriginalClosedRecoveryErasureResult>{
 const a=consumeOriginalClosedRecoveryReplaySelection(selection,c),s=stored(c);a.check();
 const neutral=JSON.parse(a.originalControl) as unknown[];if(!Array.isArray(neutral)||neutral.length!==9||neutral[2]!==c.nextEpoch||neutral[3]!=='closed'||neutral[4]!==0||neutral[5]!==''||neutral[6]!==''||neutral.slice(7).some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0))throw new PrivacyWriteAdmissionHeld('recovery_original_closed_slot');
 const admission=s.next.triggers.filter(t=>t.name.startsWith('privacy_admit_'));if(admission.length!==s.next.tables.length*3)throw new PrivacyWriteAdmissionHeld('recovery_admission_trigger_set');
 const birth=a.accountIncarnation===null?`NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1)`:`EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND typeof(account_incarnation)='text' AND account_incarnation='${a.accountIncarnation}' COLLATE BINARY)`;
 const guard=`SELECT CASE WHEN ${birth} AND NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation<>?2) AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE subject_id=?1 AND subject_generation<>?2) AND NOT EXISTS(SELECT 1 FROM privacy_restore_replay WHERE operation_id=?3 AND(subject_id<>?1 OR retired_generation<>?2 OR erased_at<>?4 OR retain_until<>?5)) AND ?4<=${NOW} AND ?5>${NOW} AND ?5=?4+31622400 AND(SELECT foreign_keys FROM pragma_foreign_keys)=1 THEN 1 ELSE json_extract('closed_recovery_original_birth_held','$') END AS admitted`;
 const terminal=`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1) AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=?1) AND EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?2 AND state='retired' AND erased_at=?4 AND retain_until=?5) AND EXISTS(SELECT 1 FROM privacy_restore_replay WHERE operation_id=?3 AND subject_id=?1 AND retired_generation=?2 AND erased_at=?4 AND retain_until=?5) AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) AND(SELECT foreign_keys FROM pragma_foreign_keys)=1 THEN 1 ELSE json_extract('closed_recovery_terminal_unconfirmed','$') END AS recorded,${NOW} AS observed_at`;
 const values=[a.subject,a.generation,a.operationId,a.erasedAt,a.retainUntil],profile=JSON.stringify(s.objects),bounds=[profile,a.originalControl,c.nextEpoch,String(a.originalExpiresAt),String(a.originalCreatedAt)];
 const all:Step[]=[{sql:proof(true),binds:bounds},{sql:guard,binds:values},...admission.map(t=>({sql:'DROP TRIGGER '+id(t.name),binds:[]})),...a.plans.map(p=>({sql:p.sql,binds:p.values})),
  {sql:'DELETE FROM privacy_serving_jobs WHERE subject_id=?1 AND subject_generation=?2',binds:[a.subject,a.generation]},
  {sql:"INSERT INTO privacy_restore_replay(operation_id,subject_id,retired_generation,erased_at,retain_until,scope) VALUES(?3,?1,?2,?4,?5,'serving_account') ON CONFLICT(operation_id)DO NOTHING",binds:values},
  {sql:`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until) VALUES(?1,?2,'retired',0,?3,${NOW},?3,?4) ON CONFLICT(subject_id)DO UPDATE SET state='retired',revision=privacy_subjects.revision+1,updated_at=${NOW},erased_at=excluded.erased_at,retain_until=excluded.retain_until WHERE privacy_subjects.generation=excluded.generation`,binds:[a.subject,a.generation,a.erasedAt,a.retainUntil]},
  {sql:terminal,binds:values},...admission.map(t=>({sql:t.sql,binds:[]})),{sql:proof(true),binds:bounds}];
 if(all.length>MAX_QUERIES)throw new PrivacyWriteAdmissionHeld('recovery_d1_batch_limit');for(const p of all)bounded(p.sql,p.binds);a.check();s.witness.assert();
 const preparedPlans=all.map(p=>prepared(s.native,s.witness,p.sql,p.binds)),native=preparedPlans.map(p=>p.statement);for(const p of preparedPlans)p.witness.assert();a.check();
 const packet=await s.native.batch(native),graph=migrationGraph(packet);a.check();s.witness.assert();for(const p of preparedPlans)p.witness.assert();
 if(!Array.isArray(packet)||own(packet,'length')!==all.length)throw new PrivacyWriteAdmissionHeld('recovery_native_unknown');
 for(let i=0;i<all.length;i++){const row=own(packet,String(i)),error=row&&typeof row==='object'?Object.getOwnPropertyDescriptor(row,'error'):undefined;if(own(row,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined))throw new PrivacyWriteAdmissionHeld('recovery_native_unknown');}
 const first=rowSnapshot(resultRow(own(packet,'0')),['admitted','original_tuple','observed_at']),last=rowSnapshot(resultRow(own(packet,String(all.length-1))),['admitted','original_tuple','observed_at']);
 if(first.values[0]!==1||last.values[0]!==1||first.values[1]!==a.originalControl||last.values[1]!==a.originalControl||typeof last.values[2]!=='number'||!Number.isSafeInteger(last.values[2])||last.values[2]<a.originalCreatedAt||last.values[2]>=a.originalExpiresAt)throw new PrivacyWriteAdmissionHeld('recovery_original_closed_readback');
 const terminalReadback=terminal.replace(`,${NOW} AS observed_at`,'').replace(/\?([1-5])\b/g,(_,position:string)=>'?'+String(Number(position)+5));
 const readSQL=`WITH readback_proof AS MATERIALIZED(${proof(true,false,true)}),terminal_proof AS MATERIALIZED(${terminalReadback}) SELECT p.admitted,p.original_tuple,p.observed_at,t.recorded FROM readback_proof p CROSS JOIN terminal_proof t`,readPlan=prepared(s.native,s.witness,readSQL,[...bounds,...values]);a.check();const read=await s.native.batch([readPlan.statement]),readGraph=migrationGraph(read);a.check();readPlan.witness.assert();
 if(!Array.isArray(read)||own(read,'length')!==1)throw new PrivacyWriteAdmissionHeld('recovery_readback_unknown');
 const readResult=own(read,'0'),readError=readResult&&typeof readResult==='object'?Object.getOwnPropertyDescriptor(readResult,'error'):undefined;if(readError&&(!Object.hasOwn(readError,'value')||readError.value!==undefined))throw new PrivacyWriteAdmissionHeld('recovery_readback_unknown');
 const r=rowSnapshot(resultRow(readResult),['admitted','original_tuple','observed_at','recorded']),at=r.values[2];
 if(r.values[0]!==1||r.values[1]!==a.originalControl||r.values[3]!==1||typeof at!=='number'||!Number.isSafeInteger(at)||at<=0||at>253402300799||at<a.originalCreatedAt||at<(last.values[2] as number)||at>=a.originalExpiresAt)throw new PrivacyWriteAdmissionHeld('recovery_readback_unknown');
 const check=()=>{a.check();stored(c);graph.witness.assert();readGraph.witness.assert();for(const p of preparedPlans)p.witness.assert();readPlan.witness.assert();first.witness.assert();last.witness.assert();r.witness.assert();};check();
 const nativeDigest=await originalMigrationDigest(graph.copy,{assert:check}),readbackDigest=await originalMigrationDigest(readGraph.copy,{assert:check});check();
 const result=Object.freeze({}) as OriginalClosedRecoveryErasureResult;closedRecoveryResults.set(result,{selection,check,nativeDigest,readbackDigest,observedAt:at,statements:all.length});return result;
}
export function originalClosedRecoveryErasureResultFacts(result:OriginalClosedRecoveryErasureResult,selection:OriginalClosedRecoveryReplaySelection):Readonly<{nativeDigest:string;readbackDigest:string;observedAt:number;statements:number;nativeAtomicCleanupAndTriggerRestoration:boolean;nativeCleanupCommitted:boolean;nativeClosedReadbackConfirmed:true;physicalBackupErasureQualified:false;providerDrainQualified:false;readyToReopen:false}>{const s=closedRecoveryResults.get(result);if(!s||s.selection!==selection)throw new PrivacyWriteAdmissionHeld('recovery_result_foreign');s.check();return Object.freeze({nativeDigest:s.nativeDigest,readbackDigest:s.readbackDigest,observedAt:s.observedAt,statements:s.statements,nativeAtomicCleanupAndTriggerRestoration:s.cleanupCommitted!==false,nativeCleanupCommitted:s.cleanupCommitted!==false,nativeClosedReadbackConfirmed:true as const,physicalBackupErasureQualified:false as const,providerDrainQualified:false as const,readyToReopen:false as const});}

/** Existing current-cookie backups already have their genuine original births and delayed fields.
 * Rebinding their closed epoch must never rebuild accounts or adopt/change those values. */
async function captureCurrentCookieProfileEpoch(native:D1Database,x:Original):Promise<WholeMigrationCapability>{
 const witness=methods(native),key=x.layout==='canonical'?'canonical':'recordedLive',next=JSON.parse(x.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Profile;
 const before=x.sourceKind==='current-cookie-pre-seal'?sources['current-cookie-pre-seal'][key]:{profile:next,objects:objects[key]};
 const optional=x.layout==='recorded-live-20261010'?sources['public-predecessor'].recordedLive.objects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[];
 const query=proof(false).replace("expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1))","expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1) UNION ALL SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?6) WHERE EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV'))")
 .replace('(SELECT COUNT(*) FROM actual)=json_array_length(?1)','(SELECT COUNT(*) FROM actual)=(SELECT COUNT(*) FROM expected)')
 .replace(' AS observed_at',' AS observed_at,EXISTS(SELECT 1 FROM actual WHERE name=\'_cf_KV\') AS cfkv_present');
 const p=prepared(native,witness,query,[JSON.stringify(before.objects),'',x.originalEpoch!,'253402300500','1',JSON.stringify(optional)]),first=statementMethod(p.statement,'first');p.witness.assert();first.assert();
 const row=await Reflect.apply(first.value,p.statement,[]),r=rowSnapshot(row,['admitted','original_tuple','observed_at','cfkv_present']);p.witness.assert();first.assert();witness.assert();r.witness.assert();
 const [admitted,originalTuple,createdAt,cfkv]=r.values;if(admitted!==1||typeof originalTuple!=='string'||typeof createdAt!=='number'||!Number.isSafeInteger(createdAt)||createdAt<1||createdAt>253402300499||cfkv!==0&&cfkv!==1||cfkv===1&&optional.length===0)throw new PrivacyWriteAdmissionHeld('current_cookie_epoch_capture_held');
 const currentObjects=[...before.objects,...(cfkv===1?optional:[])].sort((a,b)=>a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0),c=Object.freeze({...x,kind:'original_native_cookie_profile_migration' as const,createdAt,expiresAt:createdAt+300,mode:'closed' as const,readyToReopen:false as const});
 const step=Object.freeze({sql:`UPDATE ${SLOT} SET epoch=?1 WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?2 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?3 RETURNING epoch,mode`,binds:Object.freeze([x.nextEpoch,x.originalEpoch!,originalTuple])});
 const selected=x.sourceKind==='current-cookie-pre-seal'?planDispatchSealProfile(before.profile,next,x.originalEpoch!,x.nextEpoch,originalTuple):{steps:Object.freeze([step]),epochStep:0},targetObjects=[...objects[key],...(cfkv===1?optional:[])].sort(writerFenceObjectOrder);
 originalCaptures.set(c,{native,witness,rowWitness:{assert(){p.witness.assert();first.assert();r.witness.assert();witness.assert();}},old:{profile:before.profile,objects:currentObjects},next,objects:targetObjects,tuple:originalTuple,plan:selected.steps,epochStep:selected.epochStep,spent:false,executionExpiresAt:c.expiresAt});return c;
}

declare const originalNativeWriterFenceBrand:unique symbol;
export type OriginalNativeWriterFence=Readonly<{[originalNativeWriterFenceBrand]:true}>;
type WriterFence={cut:OriginalPrivateControlCut;native:D1Database;witness:Witness;rowWitness:Witness;check:()=>void;layout:AdmissionLayout;sourceKind:SourceKind;originalEpoch:string|null;fenceEpoch:string;created:number;expires:number;closedAt:number;before:Source;originalObjects:(string|null)[][];objects:(string|null)[][];originalTuple:string;closedTuple:string;phase:'prepared'|'dispatched'|'complete'|'unknown';packet:Witness|null;observedAt:number|null;migrationSpent:boolean};
const nativeWriterFences=new WeakMap<OriginalNativeWriterFence,WriterFence>();
const writerFenceHeld=():never=>{throw new PrivacyWriteAdmissionHeld('original_native_writer_fence_held');};
function writerFenceCurrent(cap:OriginalNativeWriterFence):WriterFence{const s=nativeWriterFences.get(cap);if(!s||s.phase==='unknown')return writerFenceHeld();
 // The completed packet asserts the original row witness; that witness already checks SAME cut,
 // native methods and every original statement/row slot. Run the full conjunction once, not again
 // at each wrapper level (there is no await or inspected getter between these synchronous checks).
 if(s.packet)s.packet.assert();else s.rowWitness.assert();return s;}
function writerFenceObjectOrder(a:(string|null)[],b:(string|null)[]):number{return a[0]!<b[0]!?-1:a[0]!>b[0]!?1:a[1]!<b[1]!?-1:a[1]!>b[1]!?1:0;}
/** Fixed whole-profile reader. The only optional object is the exact original source-owned _cf_KV row. */
function writerFenceProof(original:boolean,legacy:boolean,mode:'both'|'closed'):string{
 const raw=proof(original,legacy),closed=legacy?raw:mode==='both'?raw.replace("mode='closed'","mode IN('serving','closed')"):raw;
 return closed.replace('AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)','AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) AND(SELECT foreign_keys FROM pragma_foreign_keys)=1 AND NOT EXISTS(SELECT 1 FROM temp.sqlite_master)');
}
/** The actual private control module checks native identity against its SAME authenticated cut before this read. */
export async function captureOriginalNativeWriterFence(native:D1Database,cut:OriginalPrivateControlCut):Promise<OriginalNativeWriterFence>{
 const input=originalPrivateNativeWriterFenceCustody(cut,native),check=input.check;check();const witness=methods(native),legacy=input.sourceKind==='public-predecessor',key=input.layout==='canonical'?'canonical':'recordedLive';
 const next=JSON.parse(input.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Profile;
 const before=input.sourceKind==='current-cookie'?{profile:next,objects:objects[key]}:sources[input.sourceKind][key];
 const optional=(input.sourceKind==='current-cookie'||input.sourceKind==='current-cookie-pre-seal')&&key==='recordedLive'?sources['public-predecessor'].recordedLive.objects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[];
 let query=writerFenceProof(false,legacy,'both');
 // Only an authenticated original provider attempt permits Native to select its restored old epoch.
 // Full source schema, neutral control, original clock/FK/temp proofs remain in this SAME query.
 if(input.restoredNative&&!legacy)query=query.replace('epoch=?3',"length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*' AND epoch<>?3");
 if(optional.length)query=query.replace("expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1))","expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1) UNION ALL SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?6) WHERE EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV'))").replace('(SELECT COUNT(*) FROM actual)=json_array_length(?1)','(SELECT COUNT(*) FROM actual)=(SELECT COUNT(*) FROM expected)');
 const closedTuple=legacy?`json_array(singleton,'${VERSION}',?7,'closed',active,nonce,purpose,entry_changes,logical_changes)`:`json_array(singleton,protocol,epoch,'closed',active,nonce,purpose,entry_changes,logical_changes)`;
 query=query.replace(' AS observed_at',` AS observed_at,EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV') AS cfkv_present,(SELECT ${closedTuple} FROM ${SLOT} WHERE singleton=1) AS closed_tuple`);
 const values:(string|number)[]=[JSON.stringify(before.objects),'',legacy?'':input.restoredNative?input.nextEpoch:input.fenceEpoch,String(input.expiresAt),String(input.closedAt)];
 if(optional.length)values.push(JSON.stringify(optional));else if(legacy)values.push('');if(legacy)values.push(input.fenceEpoch);
 const p=prepared(native,witness,query,values),first=statementMethod(p.statement,'first');check();p.witness.assert();first.assert();
 const row=await Reflect.apply(first.value,p.statement,[]),snapshot=rowSnapshot(row,['admitted','original_tuple','observed_at','cfkv_present','closed_tuple']);check();p.witness.assert();first.assert();witness.assert();snapshot.witness.assert();
 const [admitted,originalTuple,at,cf,expected]=snapshot.values;
 if(admitted!==1||typeof originalTuple!=='string'||typeof expected!=='string'||typeof at!=='number'||!Number.isSafeInteger(at)||at<input.closedAt||at>=input.expiresAt||cf!==0&&cf!==1||optional.length===0&&cf!==(legacy?1:0))return writerFenceHeld();
 const restoredTuple=JSON.parse(originalTuple) as unknown[],observedEpoch=legacy?input.fenceEpoch:restoredTuple[2];
 if(!lower32(observedEpoch)||!legacy&&(restoredTuple.length!==9||observedEpoch===input.nextEpoch||!input.restoredNative&&observedEpoch!==input.fenceEpoch))return writerFenceHeld();
 const originalObjects=[...before.objects,...(optional.length&&cf===1?optional:[])].sort(writerFenceObjectOrder);
 const fencedObjects=legacy?originalObjects.map(o=>o[0]==='table'&&o[1]===SLOT?[o[0],o[1],o[2],next.slotSQL]:o):originalObjects;
 const fixedBefore={profile:legacy?{...before.profile,slotSQL:next.slotSQL,slotColumns:next.slotColumns}:before.profile,objects:fencedObjects};
 const originalWitness={assert(){check();p.witness.assert();first.assert();snapshot.witness.assert();witness.assert();}},s:WriterFence={cut,native,witness,rowWitness:originalWitness,check,layout:input.layout,sourceKind:input.sourceKind,originalEpoch:legacy?null:observedEpoch,fenceEpoch:observedEpoch,created:input.createdAt,expires:input.expiresAt,closedAt:input.closedAt,before:fixedBefore,originalObjects,objects:fencedObjects,originalTuple,closedTuple:expected,phase:'prepared',packet:null,observedAt:null,migrationSpent:false};
 const cap=Object.freeze({}) as OriginalNativeWriterFence;nativeWriterFences.set(cap,s);writerFenceCurrent(cap);return cap;
}
/** One original atomic fence. Public7 changes ONLY slot DDL/protocol; all original counters stay Native integers. */
export async function executeOriginalNativeWriterFence(cap:OriginalNativeWriterFence):Promise<void>{
 const s=writerFenceCurrent(cap);if(s.phase!=='prepared')return writerFenceHeld();s.phase='dispatched';const legacy=s.sourceKind==='public-predecessor',target=JSON.parse(s.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Profile;
 const before={sql:writerFenceProof(true,legacy,'both'),binds:[JSON.stringify(s.originalObjects),s.originalTuple,legacy?'':s.fenceEpoch,String(s.expires),String(s.closedAt)]};
 const steps:Step[]=[before];
 if(legacy){
  steps.push({sql:`DROP TABLE ${SLOT}`,binds:[]},{sql:target.slotSQL,binds:[]},{sql:`INSERT INTO ${SLOT}(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes) SELECT 1,'${VERSION}',?1,'closed',0,'','',json_extract(?2,'$[5]'),json_extract(?2,'$[6]') WHERE ?3<=${NOW} AND ?4>${NOW} RETURNING ${TUPLE} AS original_tuple`,binds:[s.fenceEpoch,s.originalTuple,s.closedAt,s.expires]});
 }else steps.push({sql:`UPDATE ${SLOT} SET mode='closed' WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?1 AND mode IN('serving','closed') AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?2 AND ?3<=${NOW} AND ?4>${NOW} RETURNING ${TUPLE} AS original_tuple`,binds:[s.fenceEpoch,s.originalTuple,s.closedAt,s.expires]});
 const mutation=steps.length-1;steps.push({sql:writerFenceProof(true,false,'closed'),binds:[JSON.stringify(s.objects),s.closedTuple,s.fenceEpoch,String(s.expires),String(s.closedAt)]});
 try{
  for(const step of steps)bounded(step.sql,step.binds);const materialized=steps.map(step=>prepared(s.native,s.witness,step.sql,step.binds));s.check();materialized.forEach(p=>p.witness.assert());
  const out=await s.native.batch(materialized.map(p=>p.statement)),packet=migrationGraph(out);s.check();materialized.forEach(p=>p.witness.assert());s.witness.assert();s.rowWitness.assert();packet.witness.assert();
  if(!Array.isArray(out)||own(out,'length')!==steps.length)return writerFenceHeld();for(let i=0;i<steps.length;i++){const item=own(out,String(i)),error=Object.getOwnPropertyDescriptor(item as object,'error');if(own(item,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined))return writerFenceHeld();}
  const first=rowSnapshot(resultRow(own(out,'0')),['admitted','original_tuple','observed_at']),last=rowSnapshot(resultRow(own(out,String(out.length-1))),['admitted','original_tuple','observed_at']),changed=rowSnapshot(resultRow(own(out,String(mutation))),['original_tuple']);
  if(first.values[0]!==1||first.values[1]!==s.originalTuple||last.values[0]!==1||last.values[1]!==s.closedTuple||changed.values[0]!==s.closedTuple||own(own(own(out,String(mutation)),'meta'),'changes')!==1||typeof last.values[2]!=='number'||!Number.isSafeInteger(last.values[2])||last.values[2]<s.closedAt||last.values[2]>=s.expires)return writerFenceHeld();
  const check={assert(){s.check();packet.witness.assert();materialized.forEach(p=>p.witness.assert());first.witness.assert();last.witness.assert();changed.witness.assert();s.witness.assert();s.rowWitness.assert();}};check.assert();s.packet=check;s.observedAt=last.values[2];s.phase='complete';writerFenceCurrent(cap);
 }catch(error){s.phase='unknown';throw error;}
}
export function assertOriginalNativeWriterFenceCut(cap:OriginalNativeWriterFence,cut:OriginalPrivateControlCut):void{const s=writerFenceCurrent(cap);if(s.cut!==cut)return writerFenceHeld();}
export function assertOriginalNativeWriterFence(cap:OriginalNativeWriterFence,cut:OriginalPrivateControlCut):void{assertOriginalNativeWriterFenceCut(cap,cut);const s=writerFenceCurrent(cap);if(s.phase!=='complete'||s.observedAt===null)return writerFenceHeld();}
export function originalNativeWriterFenceFacts(cap:OriginalNativeWriterFence,cut:OriginalPrivateControlCut):Readonly<{sourceKind:SourceKind;originalEpoch:string|null;fenceEpoch:string;originalCreatedAt:number;originalExpiresAt:number;fencedAt:number;nativeModeClosed:true;providerDrainQualified:false;readyToReopen:false}>{assertOriginalNativeWriterFence(cap,cut);const s=writerFenceCurrent(cap);return Object.freeze({sourceKind:s.sourceKind,originalEpoch:s.originalEpoch,fenceEpoch:s.fenceEpoch,originalCreatedAt:s.created,originalExpiresAt:s.expires,fencedAt:s.observedAt!,nativeModeClosed:true as const,providerDrainQualified:false as const,readyToReopen:false as const});}
/** Private SAME fenced-source consumer. Public provenance stays old409/NULL; physical capture reads closed9. */
export async function captureWholeNativeMigrationAfterWriterFence(cap:OriginalNativeWriterFence,cut:OriginalPrivateControlCut,nextEpoch:string,operationId:string):Promise<WholeMigrationCapability>{
 assertOriginalNativeWriterFence(cap,cut);const s=writerFenceCurrent(cap),input=originalPrivateNativeWriterFenceCustody(cut,s.native);if(s.migrationSpent||nextEpoch!==input.nextEpoch||operationId!==input.operationId)return writerFenceHeld();s.migrationSpent=true;
 const next=JSON.parse(s.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Profile;
 if(s.sourceKind!=='current-cookie'&&s.sourceKind!=='current-cookie-pre-seal')assertClosedMigrationPlan(s.before.profile,next,s.sourceKind);
 const query=writerFenceProof(true,false,'closed'),p=prepared(s.native,s.witness,query,[JSON.stringify(s.objects),s.closedTuple,s.fenceEpoch,String(s.expires),String(s.closedAt)]),first=statementMethod(p.statement,'first');writerFenceCurrent(cap);p.witness.assert();first.assert();
 const row=await Reflect.apply(first.value,p.statement,[]),r=rowSnapshot(row,['admitted','original_tuple','observed_at']);writerFenceCurrent(cap);p.witness.assert();first.assert();r.witness.assert();
 if(r.values[0]!==1||r.values[1]!==s.closedTuple||typeof r.values[2]!=='number'||!Number.isSafeInteger(r.values[2])||r.values[2]<s.closedAt||r.values[2]>=s.expires)return writerFenceHeld();
 const at=r.values[2],x={operationId,layout:s.layout,sourceKind:s.sourceKind,originalEpoch:s.originalEpoch,nextEpoch},c=Object.freeze({...x,kind:'original_native_cookie_profile_migration' as const,createdAt:at,expiresAt:at+300,mode:'closed' as const,readyToReopen:false as const});
 const selected=s.sourceKind==='current-cookie'?{steps:Object.freeze([{sql:`UPDATE ${SLOT} SET epoch=?1 WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?2 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?3 RETURNING epoch,mode`,binds:Object.freeze([nextEpoch,s.fenceEpoch,s.closedTuple])}]),epochStep:0}:s.sourceKind==='current-cookie-pre-seal'?planDispatchSealProfile(s.before.profile,next,s.fenceEpoch,nextEpoch,s.closedTuple):plan(s.before.profile,next,s.sourceKind,s.originalEpoch,nextEpoch,s.closedTuple,s.sourceKind==='public-predecessor'?s.fenceEpoch:undefined);
 const retainedCf=s.originalObjects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'),targetObjects=[...objects[s.layout==='canonical'?'canonical':'recordedLive'],...retainedCf].sort(writerFenceObjectOrder),witness={assert(){writerFenceCurrent(cap);p.witness.assert();first.assert();r.witness.assert();}};
 originalCaptures.set(c,{native:s.native,witness:s.witness,rowWitness:witness,old:s.before,next,objects:targetObjects,tuple:s.closedTuple,plan:selected.steps,epochStep:selected.epochStep,spent:false,executionExpiresAt:s.expires,originalObjects:s.originalObjects,captureEpoch:s.fenceEpoch,captureLegacy:false});return c;
}

declare const originalNativeServingOpenBrand:unique symbol;
export type OriginalNativeServingOpen=Readonly<{[originalNativeServingOpenBrand]:true}>;
declare const originalNativeServingOpenAckBrand:unique symbol;
export type OriginalNativeServingOpenAck=Readonly<{[originalNativeServingOpenAckBrand]:true}>;
type ServingOpen={migration:WholeMigrationCapability;installation:OriginalPrivateInstallation;cut:OriginalPrivateControlCut;source:OriginalAcceptedRecoverySource;replay:OriginalPrivateRecoveryReplayResult;fence:OriginalNativeWriterFence;stored:Stored;check:()=>void;row:Witness;closedTuple:string;servingTuple:string;created:number;expires:number;profileAt:number;profileDigest:string;phase:'prepared'|'dispatched'|'complete'|'unknown';packet:Witness|null;openedAt:number|null;nativeDigest:string|null};
const originalNativeServingOpens=new WeakMap<OriginalNativeServingOpen,ServingOpen>(),originalNativeServingOpenAcks=new WeakMap<OriginalNativeServingOpenAck,ServingOpen>();
function servingOpenCurrent(s:ServingOpen):void{if(s.phase==='unknown')throw new PrivacyWriteAdmissionHeld('original_native_open_unknown');s.check();s.stored.witness.assert();s.stored.rowWitness.assert();s.row.assert();s.packet?.assert();}
/** Source-owned closed profile -> serving transition. It accepts no caller profile/SQL/clock/row/drain flag. */
export async function captureOriginalNativeServingOpen(c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,replay:OriginalPrivateRecoveryReplayResult,fence:OriginalNativeWriterFence):Promise<OriginalNativeServingOpen>{
 const s=stored(c),facts=originalPrivateNativeOpenCustody(c,installation,cut,source,replay,fence,s.native);facts.check();if(!s.spent||s.captureEpoch===undefined)throw new PrivacyWriteAdmissionHeld('original_native_open_fenced_install_required');
 const sql=writerFenceProof(false,false,'closed').replace(' AS observed_at',` AS observed_at,(SELECT json_array(singleton,protocol,epoch,'serving',active,nonce,purpose,entry_changes,logical_changes) FROM ${SLOT} WHERE singleton=1) AS serving_tuple`),p=prepared(s.native,s.witness,sql,[JSON.stringify(s.objects),'',c.nextEpoch,String(facts.expiresAt),String(facts.nativeNotBefore)]),first=statementMethod(p.statement,'first');facts.check();p.witness.assert();first.assert();
 const raw=await Reflect.apply(first.value,p.statement,[]),row=rowSnapshot(raw,['admitted','original_tuple','observed_at','serving_tuple']);facts.check();p.witness.assert();first.assert();row.witness.assert();s.witness.assert();s.rowWitness.assert();
 const [admitted,closedTuple,at,servingTuple]=row.values;if(admitted!==1||typeof closedTuple!=='string'||typeof servingTuple!=='string'||typeof at!=='number'||!Number.isSafeInteger(at)||at<facts.nativeNotBefore||at>=facts.expiresAt)throw new PrivacyWriteAdmissionHeld('original_native_open_capture_unconfirmed');
 const current=()=>{facts.check();p.witness.assert();first.assert();row.witness.assert();s.witness.assert();s.rowWitness.assert();},record:ServingOpen={migration:c,installation,cut,source,replay,fence,stored:s,check:facts.check,row:{assert:current},closedTuple,servingTuple,created:facts.createdAt,expires:facts.expiresAt,profileAt:facts.nativeNotBefore,profileDigest:facts.profileDigest64,phase:'prepared',packet:null,openedAt:null,nativeDigest:null};
 servingOpenCurrent(record);const cap=Object.freeze({}) as OriginalNativeServingOpen;originalNativeServingOpens.set(cap,record);return cap;
}
/** Same original atomic Native batch. The DO is still CLOSED and source custody is rechecked across the result digest. */
export async function executeOriginalNativeServingOpen(cap:OriginalNativeServingOpen):Promise<OriginalNativeServingOpenAck>{
 const s=originalNativeServingOpens.get(cap);if(!s||s.phase!=='prepared')throw new PrivacyWriteAdmissionHeld('original_native_open_foreign_or_spent');const consume=originalPrivateNativeOpenDispatchCustody(cap,s.migration,s.cut);consume();servingOpenCurrent(s);s.phase='dispatched';
 const steps:Step[]=[{sql:writerFenceProof(true,false,'closed'),binds:[JSON.stringify(s.stored.objects),s.closedTuple,s.migration.nextEpoch,String(s.expires),String(s.profileAt)]},
 {sql:`UPDATE ${SLOT} SET mode='serving' WHERE singleton=1 AND protocol='${VERSION}' AND epoch=?1 AND mode='closed' AND active=0 AND nonce='' AND purpose='' AND ${TUPLE}=?2 AND ?3<=${NOW} AND ?4>${NOW} RETURNING ${TUPLE} AS original_tuple`,binds:[s.migration.nextEpoch,s.closedTuple,s.profileAt,s.expires]},
 {sql:writerFenceProof(true,false,'closed').replace("mode='closed'","mode='serving'"),binds:[JSON.stringify(s.stored.objects),s.servingTuple,s.migration.nextEpoch,String(s.expires),String(s.profileAt)]}];
 try{for(const step of steps)bounded(step.sql,step.binds);const plans=steps.map(step=>prepared(s.stored.native,s.stored.witness,step.sql,step.binds));servingOpenCurrent(s);for(const p of plans)p.witness.assert();
  consume();const out=await s.stored.native.batch(plans.map(p=>p.statement)),graph=migrationGraph(out);consume();servingOpenCurrent(s);for(const p of plans)p.witness.assert();graph.witness.assert();if(!Array.isArray(out)||own(out,'length')!==3)throw new PrivacyWriteAdmissionHeld('original_native_open_ack');
  for(let i=0;i<3;i++){const item=own(out,String(i)),error=item&&typeof item==='object'?Object.getOwnPropertyDescriptor(item,'error'):undefined;if(own(item,'success')!==true||error&&(!Object.hasOwn(error,'value')||error.value!==undefined))throw new PrivacyWriteAdmissionHeld('original_native_open_ack');}
  const pre=rowSnapshot(resultRow(own(out,'0')),['admitted','original_tuple','observed_at']),changed=rowSnapshot(resultRow(own(out,'1')),['original_tuple']),last=rowSnapshot(resultRow(own(out,'2')),['admitted','original_tuple','observed_at']);
  if(pre.values[0]!==1||pre.values[1]!==s.closedTuple||changed.values[0]!==s.servingTuple||last.values[0]!==1||last.values[1]!==s.servingTuple||own(own(own(out,'1'),'meta'),'changes')!==1||typeof pre.values[2]!=='number'||typeof last.values[2]!=='number'||!Number.isSafeInteger(pre.values[2])||!Number.isSafeInteger(last.values[2])||pre.values[2]<s.profileAt||last.values[2]<pre.values[2]||last.values[2]>=s.expires)throw new PrivacyWriteAdmissionHeld('original_native_open_ack');
  const check=()=>{consume();servingOpenCurrent(s);graph.witness.assert();for(const p of plans)p.witness.assert();pre.witness.assert();changed.witness.assert();last.witness.assert();};check();const digest=await originalMigrationDigest(graph.copy,{assert:check});check();
  s.packet={assert(){graph.witness.assert();for(const p of plans)p.witness.assert();pre.witness.assert();changed.witness.assert();last.witness.assert();}};s.openedAt=last.values[2];s.nativeDigest=digest;s.phase='complete';servingOpenCurrent(s);const ack=Object.freeze({}) as OriginalNativeServingOpenAck;originalNativeServingOpenAcks.set(ack,s);return ack;
 }catch(error){s.phase='unknown';throw error;}
}
/** Assertion-only counterpart to facts(...).check(): no facts allocation or intervening factory boundary. */
export function assertOriginalNativeServingOpenAcknowledgement(ack:OriginalNativeServingOpenAck,c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,replay:OriginalPrivateRecoveryReplayResult,fence:OriginalNativeWriterFence):void{
 const s=originalNativeServingOpenAcks.get(ack);if(!s||s.phase!=='complete'||s.migration!==c||s.installation!==installation||s.cut!==cut||s.source!==source||s.replay!==replay||s.fence!==fence||s.openedAt===null||s.nativeDigest===null)throw new PrivacyWriteAdmissionHeld('original_native_open_ack_foreign');servingOpenCurrent(s);
}
export function originalNativeServingOpenAcknowledgementFacts(ack:OriginalNativeServingOpenAck,c:WholeMigrationCapability,installation:OriginalPrivateInstallation,cut:OriginalPrivateControlCut,source:OriginalAcceptedRecoverySource,replay:OriginalPrivateRecoveryReplayResult,fence:OriginalNativeWriterFence):Readonly<{openedAt:number;originalCreatedAt:number;originalExpiresAt:number;writeEpoch:string;profileDigest64:string;nativeResultDigest64:string;nativeOpened:true;providerDrainQualified:false;readyToReopen:false;check:()=>void}>{
 const s=originalNativeServingOpenAcks.get(ack);if(!s||s.phase!=='complete'||s.migration!==c||s.installation!==installation||s.cut!==cut||s.source!==source||s.replay!==replay||s.fence!==fence||s.openedAt===null||s.nativeDigest===null)throw new PrivacyWriteAdmissionHeld('original_native_open_ack_foreign');servingOpenCurrent(s);return Object.freeze({openedAt:s.openedAt,originalCreatedAt:s.created,originalExpiresAt:s.expires,writeEpoch:c.nextEpoch,profileDigest64:s.profileDigest,nativeResultDigest64:s.nativeDigest,nativeOpened:true as const,providerDrainQualified:false as const,readyToReopen:false as const,check:()=>{servingOpenCurrent(s);}});
}
/** .162 guarded recovery successor (additive only). Exposes the EXISTING source-owned Native statement, row,
 * packet-graph and digest seams and the exact current-cookie whole-profile proof used by the writer fence.
 * No existing function, capability, custody check or caller changes; nothing here issues authority by itself. */
export type SuccessorNativeWitness=Witness;
export const SUCCESSOR_NATIVE_SEAMS=Object.freeze({methods,prepared,statementMethod,rowSnapshot,resultRow,own,graph:migrationGraph,digest:originalMigrationDigest,bounded,TUPLE,SLOT,VERSION,NOW});
/** Current-cookie whole-profile proof (writerFenceProof plus the exact optional original _cf_KV row, as
 * captured at mig:469-477) at one exact epoch and mode. Binds: ?1 objects, ?2 tuple ('' when unbound),
 * ?3 epoch, ?4 window end, ?5 window start, and ?6 optional objects only when the layout records them. */
export function successorCurrentProfileProof(layout:AdmissionLayout,mode:'serving'|'closed',bound:boolean):Readonly<{sql:string;objects:string;optional:string|null}>{
 if(layout!=='canonical'&&layout!=='recorded-live-20261010'||mode!=='serving'&&mode!=='closed'||typeof bound!=='boolean')throw new PrivacyWriteAdmissionHeld('successor_profile_proof_input');
 const key=layout==='canonical'?'canonical':'recordedLive',optional=key==='recordedLive'?sources['public-predecessor'].recordedLive.objects.filter(o=>o[1]==='_cf_KV'||o[2]==='_cf_KV'):[];
 let sql=writerFenceProof(bound,false,'closed');if(mode==='serving')sql=sql.replace("mode='closed'","mode='serving'");
 if(optional.length)sql=sql.replace("expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1))","expected AS MATERIALIZED(SELECT json_extract(value,'$[0]') type,json_extract(value,'$[1]') name,json_extract(value,'$[2]') tbl_name,json_extract(value,'$[3]') sql FROM json_each(?1) UNION ALL SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?6) WHERE EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV'))").replace('(SELECT COUNT(*) FROM actual)=json_array_length(?1)','(SELECT COUNT(*) FROM actual)=(SELECT COUNT(*) FROM expected)');
 sql=sql.replace(' AS observed_at'," AS observed_at,EXISTS(SELECT 1 FROM actual WHERE name='_cf_KV') AS cfkv_present");
 if(sql.split(' AS cfkv_present').length!==2||optional.length&&!sql.includes('json_each(?6)'))throw new PrivacyWriteAdmissionHeld('successor_profile_proof_shape');
 return Object.freeze({sql,objects:JSON.stringify(objects[key]),optional:optional.length?JSON.stringify(optional):null});
}

/** Storage preparation only (2026-10-16). No row in this family authorizes a retry.
 * Original suppression journal/companion layouts and their identities are not migrated. */
import type {FloorStorage} from './privacy-recovery-floor';

export const RECOVERY_ATTEMPT_PROTOCOL='olympus-erasure-attempt-storage-preparation-v1';
export const RECOVERY_ATTEMPT_SCHEMA_DIGEST='02f0d29f6715efe487802c3954ae52da35f20863ffa713c76f805ac7306f9fca';
const NOW="CAST(strftime('%s','now') AS INTEGER)",REPLAY=31622400;
const digest=(name:string)=>`${name} TEXT NOT NULL CHECK(length(${name})=64 AND ${name} NOT GLOB '*[^0-9a-f]*')`;
const nullableDigest=(name:string)=>`${name} TEXT CHECK(${name} IS NULL OR(length(${name})=64 AND ${name} NOT GLOB '*[^0-9a-f]*'))`;
const id=(name:string)=>`${name} TEXT NOT NULL CHECK(length(${name})=32 AND ${name} NOT GLOB '*[^0-9a-f]*')`;
const token=(name:string)=>`${name} INTEGER NOT NULL CHECK(typeof(${name})='integer' AND ${name} BETWEEN 1 AND 253402300798)`;
export const RECOVERY_ATTEMPT_CONTROL_DDL=`CREATE TABLE recovery_erasure_attempt_control(
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),protocol TEXT NOT NULL CHECK(protocol='${RECOVERY_ATTEMPT_PROTOCOL}'),
 ${digest('schema_digest')},${id('installation_operation_id')},${id('nonce')},${digest('request_digest')},
 original_floor TEXT NOT NULL CHECK(json_valid(original_floor)),original_gate TEXT NOT NULL CHECK(json_valid(original_gate)),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 253402300499),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=created_at+300),
 installed_at INTEGER NOT NULL CHECK(typeof(installed_at)='integer' AND installed_at>=created_at AND installed_at<expires_at),
 installation_sequence INTEGER NOT NULL CHECK(typeof(installation_sequence)='integer' AND installation_sequence BETWEEN 1 AND 9007199254740991))`;
/** Stable digests commit to acknowledged, redaction-invariant source facts. Nullable pseudonyms/birth
 * facts expire separately. An expired row remains a permanent operation-consumption tombstone. */
export const RECOVERY_ATTEMPT_FENCE_DDL=`CREATE TABLE recovery_erasure_attempt_fence(
 ${id('operation_id')} PRIMARY KEY,${id('fence_id')} UNIQUE,
 ${digest('original_relation_digest')},${digest('original_ticket_digest')},${digest('original_job_read_digest')},
 ${digest('terminal_intent_digest')},${digest('status_binding_digest')},${digest('fence_native_digest')},${digest('fence_child_digest')},
 ${id('original_nonce')},original_reserve_sequence INTEGER NOT NULL CHECK(typeof(original_reserve_sequence)='integer' AND original_reserve_sequence>0),
 ${token('from_token')},${token('to_token')},
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 253370678099),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=created_at+300),
 recorded_at INTEGER NOT NULL CHECK(typeof(recorded_at)='integer' AND recorded_at>=created_at AND recorded_at<expires_at),
 receipt_sequence INTEGER NOT NULL CHECK(typeof(receipt_sequence)='integer' AND receipt_sequence>0),
 retain_until INTEGER NOT NULL CHECK(typeof(retain_until)='integer' AND retain_until=expires_at+${REPLAY}),
 action_sequence INTEGER NOT NULL CHECK(typeof(action_sequence)='integer' AND action_sequence BETWEEN receipt_sequence AND 9007199254740991),
 ${nullableDigest('subject_key')},retired_generation TEXT CHECK(retired_generation IS NULL OR(length(retired_generation)=32 AND retired_generation NOT GLOB '*[^0-9a-f]*')),
 birth_kind TEXT NOT NULL CHECK(birth_kind IN('site','absence','expired')),${nullableDigest('birth_digest')},
 identity_state TEXT NOT NULL CHECK(identity_state IN('retained','expired')),UNIQUE(operation_id,fence_id),CHECK(to_token>from_token),
 CHECK((identity_state='retained' AND subject_key IS NOT NULL AND retired_generation IS NOT NULL AND birth_kind IN('site','absence') AND birth_digest IS NOT NULL)
 OR(identity_state='expired' AND subject_key IS NULL AND retired_generation IS NULL AND birth_kind='expired' AND birth_digest IS NULL)))`;
export const RECOVERY_ATTEMPT_RETRY_DDL=`CREATE TABLE recovery_erasure_attempt_retry(
 ${id('retry_id')} PRIMARY KEY,${id('operation_id')} UNIQUE,${id('fence_id')} UNIQUE,
 ${digest('fence_receipt_digest')},${token('claimed_token')},${digest('original_ticket_digest')},${digest('original_job_read_digest')},
 ${digest('terminal_intent_digest')},${digest('status_binding_digest')},${id('nonce')},
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 253370678099),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=created_at+300),
 reserve_sequence INTEGER NOT NULL CHECK(typeof(reserve_sequence)='integer' AND reserve_sequence>0),
 state TEXT NOT NULL CHECK(state IN('reserved','unknown','committed','expired_unknown','expired_committed')),
 ${nullableDigest('native_result_digest')},erased_at INTEGER,retain_until INTEGER NOT NULL CHECK(typeof(retain_until)='integer'),
 action_sequence INTEGER NOT NULL CHECK(typeof(action_sequence)='integer' AND action_sequence BETWEEN reserve_sequence AND 9007199254740991),
 ${nullableDigest('subject_key')},retired_generation TEXT CHECK(retired_generation IS NULL OR(length(retired_generation)=32 AND retired_generation NOT GLOB '*[^0-9a-f]*')),
 FOREIGN KEY(operation_id,fence_id) REFERENCES recovery_erasure_attempt_fence(operation_id,fence_id),
 CHECK((state IN('reserved','unknown') AND subject_key IS NOT NULL AND retired_generation IS NOT NULL AND native_result_digest IS NULL AND erased_at IS NULL AND retain_until=expires_at+${REPLAY})
 OR(state='committed' AND subject_key IS NOT NULL AND retired_generation IS NOT NULL AND native_result_digest IS NOT NULL AND typeof(erased_at)='integer' AND erased_at>=created_at AND erased_at<expires_at AND retain_until=erased_at+${REPLAY})
 OR(state='expired_unknown' AND subject_key IS NULL AND retired_generation IS NULL AND native_result_digest IS NULL AND erased_at IS NULL AND retain_until=expires_at+${REPLAY})
 OR(state='expired_committed' AND subject_key IS NULL AND retired_generation IS NULL AND native_result_digest IS NOT NULL AND typeof(erased_at)='integer' AND erased_at>=created_at AND erased_at<expires_at AND retain_until=erased_at+${REPLAY})))`;
export const RECOVERY_ATTEMPT_COMPANION_DDL=`CREATE TABLE recovery_erasure_attempt_companion(
 ${id('retry_id')} PRIMARY KEY REFERENCES recovery_erasure_attempt_retry(retry_id),${digest('original_relation_digest')},
 ${nullableDigest('source_digest')},birth_kind TEXT NOT NULL CHECK(birth_kind IN('site','absence','expired')),${nullableDigest('birth_digest')},
 marker_state TEXT NOT NULL CHECK(marker_state IN('none','active','expired')),${nullableDigest('marker_key_digest')},
 original_marker_key TEXT CHECK(original_marker_key IS NULL OR(typeof(original_marker_key)='text' AND length(original_marker_key)=43 AND length(CAST(original_marker_key AS BLOB))=43 AND original_marker_key NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(original_marker_key,43,1) IN('A','E','I','M','Q','U','Y','c','g','k','o','s','w','0','4','8'))),
 original_rejected_at INTEGER,marker_retain_until INTEGER,
 state TEXT NOT NULL CHECK(state IN('reserved','committed','expired')),${nullableDigest('native_result_digest')},
 replay_retain_until INTEGER NOT NULL CHECK(typeof(replay_retain_until)='integer' AND replay_retain_until BETWEEN 1 AND 253402300799),
 action_sequence INTEGER NOT NULL CHECK(typeof(action_sequence)='integer' AND action_sequence BETWEEN 1 AND 9007199254740991),
 CHECK((marker_state='active' AND source_digest IS NOT NULL AND marker_key_digest IS NOT NULL AND original_marker_key IS NOT NULL AND typeof(original_rejected_at)='integer' AND original_rejected_at>0 AND typeof(marker_retain_until)='integer' AND marker_retain_until=original_rejected_at+31536000)
 OR(marker_state IN('none','expired') AND original_marker_key IS NULL AND original_rejected_at IS NULL AND marker_retain_until IS NULL AND(marker_state='none' OR marker_key_digest IS NULL))),
 CHECK((state='reserved' AND source_digest IS NOT NULL AND birth_kind IN('site','absence') AND birth_digest IS NOT NULL AND native_result_digest IS NULL)
 OR(state='committed' AND birth_kind IN('site','absence') AND birth_digest IS NOT NULL AND native_result_digest IS NOT NULL)
 OR(state='expired' AND source_digest IS NULL AND birth_kind='expired' AND birth_digest IS NULL AND marker_state='expired' AND marker_key_digest IS NULL AND original_rejected_at IS NULL AND marker_retain_until IS NULL)))`;
export const RECOVERY_ATTEMPT_TABLES=Object.freeze([
 Object.freeze(['recovery_erasure_attempt_control',RECOVERY_ATTEMPT_CONTROL_DDL]),
 Object.freeze(['recovery_erasure_attempt_fence',RECOVERY_ATTEMPT_FENCE_DDL]),
 Object.freeze(['recovery_erasure_attempt_retry',RECOVERY_ATTEMPT_RETRY_DDL]),
 Object.freeze(['recovery_erasure_attempt_companion',RECOVERY_ATTEMPT_COMPANION_DDL]),
]);
export const RECOVERY_ATTEMPT_INSTALL_SQL='json_array(singleton,protocol,schema_digest,installation_operation_id,nonce,request_digest,original_floor,original_gate,created_at,expires_at,installed_at,installation_sequence)';
const refuse=():never=>{throw Error('recovery_attempt_storage_preparation_held');};
function rows(s:FloorStorage,sql:string,...bindings:(string|number|null)[]){return s.sql.exec(sql,...bindings).toArray();}
/** Both-direction fixed layout check, including temp shadows, aliases and added indexes/triggers.
 * SQLite's own null-SQL primary/unique indexes are part of the exact CREATE declarations. */
export function recoveryAttemptLayout(s:FloorStorage):'absent'|'installed'{
 const predicate="(lower(name) GLOB 'recovery_erasure_attempt_*' OR lower(tbl_name) GLOB 'recovery_erasure_attempt_*') AND NOT(type='index' AND sql IS NULL AND name GLOB 'sqlite_autoindex_*')";
 const actual=rows(s,`SELECT 'main' AS db,type,name,sql FROM sqlite_master WHERE ${predicate} UNION ALL SELECT 'temp' AS db,type,name,sql FROM sqlite_temp_master WHERE ${predicate}`);
 if(!actual.length)return 'absent';
 if(actual.length!==4||actual.some(r=>r.db!=='main'||r.type!=='table'||!RECOVERY_ATTEMPT_TABLES.some(([name,ddl])=>r.name===name&&r.sql===ddl)))return refuse();
 return 'installed';
}
export function recoveryAttemptInstallation(s:FloorStorage):string{
 if(recoveryAttemptLayout(s)!=='installed')return refuse();
 const r=rows(s,`SELECT ${RECOVERY_ATTEMPT_INSTALL_SQL} AS tuple FROM recovery_erasure_attempt_control`);
 if(r.length!==1||typeof r[0]!.tuple!=='string')return refuse();
 const a:unknown=JSON.parse(r[0]!.tuple);if(!Array.isArray(a)||a.length!==12||a[0]!==1||a[1]!==RECOVERY_ATTEMPT_PROTOCOL||a[2]!==RECOVERY_ATTEMPT_SCHEMA_DIGEST||JSON.stringify(a)!==r[0]!.tuple)return refuse();
 return r[0]!.tuple;
}
/** Old receipt formats cannot represent ANY new row, including permanent consumed/unknown tombstones. */
export function assertNoRecoveryAttemptData(s:FloorStorage):void{
 if(recoveryAttemptLayout(s)==='absent')return;recoveryAttemptInstallation(s);
 if(rows(s,'SELECT 1 AS present FROM recovery_erasure_attempt_fence UNION ALL SELECT 1 FROM recovery_erasure_attempt_retry UNION ALL SELECT 1 FROM recovery_erasure_attempt_companion LIMIT 1').length)return refuse();
}
const oldDue=`(state IN('reserved','committed') AND marker_state='active' AND marker_retain_until<=${NOW}) OR(state IN('reserved','committed') AND replay_retain_until<=${NOW})`;
const redactCompanion=`source_digest=CASE WHEN state='committed' AND marker_state='active' AND marker_retain_until<=${NOW} OR replay_retain_until<=${NOW} THEN NULL ELSE source_digest END,
 birth_kind=CASE WHEN replay_retain_until<=${NOW} THEN 'expired' ELSE birth_kind END,birth_digest=CASE WHEN replay_retain_until<=${NOW} THEN NULL ELSE birth_digest END,
 marker_state='expired',marker_key_digest=NULL,original_marker_key=NULL,original_rejected_at=NULL,marker_retain_until=NULL,
 state=CASE WHEN replay_retain_until<=${NOW} THEN 'expired' ELSE state END`;
const deadlines=`SELECT 'original' AS family,operation_id AS id,MIN(CASE WHEN marker_state='active' THEN MIN(marker_retain_until,replay_retain_until) ELSE replay_retain_until END) AS at FROM recovery_suppression_companion WHERE state IN('reserved','committed') GROUP BY operation_id
 UNION ALL SELECT 'journal',operation_id,retain_until FROM recovery_suppression_journal WHERE state IN('reserved','unknown','committed')
 UNION ALL SELECT 'fence',operation_id,retain_until FROM recovery_erasure_attempt_fence WHERE identity_state='retained'
 UNION ALL SELECT 'retry',retry_id,retain_until FROM recovery_erasure_attempt_retry WHERE state IN('reserved','unknown','committed')
 UNION ALL SELECT 'companion',retry_id,CASE WHEN marker_state='active' THEN MIN(marker_retain_until,replay_retain_until) ELSE replay_retain_until END FROM recovery_erasure_attempt_companion WHERE state IN('reserved','committed')`;
/** Invoked inside the original alarm/copy transaction. One TOTAL 100-row page across all families.
 * No DELETE, no renewed deadline, no state transition from unknown to committed, no reusable identity. */
export function redactRecoveryAttemptPage(s:FloorStorage):number|null{
 if(recoveryAttemptLayout(s)==='absent')return null;recoveryAttemptInstallation(s);
 const selected=rows(s,`SELECT family,id,at FROM(${deadlines}) WHERE at<=${NOW} ORDER BY at,family,id LIMIT 100`);
 if(!selected.length)return 0;
 if(selected.length>100||selected.some(r=>!['original','journal','fence','retry','companion'].includes(r.family as string)||typeof r.id!=='string'||!/^[0-9a-f]{32}$/.test(r.id)||typeof r.at!=='number'||!Number.isSafeInteger(r.at)||r.at<1))return refuse();
 const sequence=rows(s,'UPDATE recovery_suppression_control SET action_sequence=action_sequence+1 WHERE singleton=1 AND action_sequence<9007199254740991 RETURNING action_sequence');
 if(sequence.length!==1||typeof sequence[0]!.action_sequence!=='number'||!Number.isSafeInteger(sequence[0]!.action_sequence))return refuse();const seq=sequence[0]!.action_sequence;
 for(const family of ['original','journal','fence','retry','companion']){
  const ids=selected.filter(r=>r.family===family).map(r=>r.id as string);if(!ids.length)continue;const json=JSON.stringify(ids);let changed:Record<string,unknown>[];
  if(family==='original')changed=rows(s,`UPDATE recovery_suppression_companion SET ${redactCompanion} WHERE operation_id IN(SELECT value FROM json_each(?1)) AND(${oldDue}) RETURNING operation_id AS id`,json);
  else if(family==='journal')changed=rows(s,`UPDATE recovery_suppression_journal SET subject_key=NULL,retired_generation=NULL,state=CASE WHEN state='committed' THEN 'expired_committed' ELSE 'expired_unknown' END,action_sequence=?2 WHERE operation_id IN(SELECT value FROM json_each(?1)) AND state IN('reserved','unknown','committed') AND retain_until<=${NOW} RETURNING operation_id AS id`,json,seq);
  else if(family==='fence')changed=rows(s,`UPDATE recovery_erasure_attempt_fence SET subject_key=NULL,retired_generation=NULL,birth_kind='expired',birth_digest=NULL,identity_state='expired',action_sequence=?2 WHERE operation_id IN(SELECT value FROM json_each(?1)) AND identity_state='retained' AND retain_until<=${NOW} RETURNING operation_id AS id`,json,seq);
  else if(family==='retry')changed=rows(s,`UPDATE recovery_erasure_attempt_retry SET subject_key=NULL,retired_generation=NULL,state=CASE WHEN state='committed' THEN 'expired_committed' ELSE 'expired_unknown' END,action_sequence=?2 WHERE retry_id IN(SELECT value FROM json_each(?1)) AND state IN('reserved','unknown','committed') AND retain_until<=${NOW} RETURNING retry_id AS id`,json,seq);
  else changed=rows(s,`UPDATE recovery_erasure_attempt_companion SET ${redactCompanion},action_sequence=?2 WHERE retry_id IN(SELECT value FROM json_each(?1)) AND(${oldDue}) RETURNING retry_id AS id`,json,seq);
  if(changed.length!==ids.length||new Set(changed.map(r=>r.id)).size!==ids.length||changed.some(r=>!ids.includes(r.id as string)))return refuse();
 }
 return selected.length;
}
/** undefined means the original uninstalled family; null means installed with no pending redaction. */
export function recoveryAttemptNextAlarm(s:FloorStorage):number|null|undefined{
 if(recoveryAttemptLayout(s)==='absent')return undefined;recoveryAttemptInstallation(s);
 const r=rows(s,`SELECT MIN(at) AS next_at FROM(${deadlines})`);if(r.length!==1)return refuse();const at=r[0]!.next_at;
 if(at!==null&&(typeof at!=='number'||!Number.isSafeInteger(at)||at<1||at>253402300799))return refuse();return at as number|null;
}

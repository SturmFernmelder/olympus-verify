/** Called only by the existing MAC-authenticated suppression OPERATOR ingress. This installs storage
 * while CLOSED; it does not mint a source fence, retry reservation or serving authorization. */
import type {FloorStorage} from './privacy-recovery-floor';
import {FLOOR_DDL,JOURNAL_DDL,COMPLETION_DDL,EPOCH_CLAIM_DDL} from './privacy-recovery-floor';
import {SERVING_GATE_DDL,SERVING_TICKET_DDL,SERVING_TICKET_FLOOR_INDEX_DDL,SERVING_TICKET_PARENT_INDEX_DDL,SERVING_CUT_DDL,SERVING_LIFECYCLE_DDL,SERVING_GATE_TUPLE_SQL} from './privacy-serving-recovery-gate';
import {SUPPRESSION_CONTROL_DDL,SUPPRESSION_JOURNAL_DDL,SUPPRESSION_COPY_DDL,SUPPRESSION_CONTROL_SQL} from './privacy-recovery-suppression';
import {SUPPRESSION_COMPANION_DDL} from './privacy-recovery-erasure-companion';
import {recoveryDataStringSha256,recoveryScalarArrayJSON} from './privacy-recovery-data-json';
import {RECOVERY_ATTEMPT_PROTOCOL,RECOVERY_ATTEMPT_SCHEMA_DIGEST,RECOVERY_ATTEMPT_TABLES,recoveryAttemptLayout,recoveryAttemptInstallation,assertNoRecoveryAttemptData} from './privacy-recovery-attempt-schema';

export const ATTEMPT_INSTALL_PATH='/v1/suppression/install-attempt-storage';
export const ATTEMPT_INSTALL_OBSERVE_PATH='/v1/suppression/observe-attempt-installation';
export const ATTEMPT_INSTALL_KEYS=Object.freeze(['operationId','nonce','requestDigest','createdAt','expiresAt','originalFloor','originalGate','expectedActionSequence']);
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const refuse=():never=>{throw Error('recovery_attempt_installation_held');};
type Original=Readonly<{floor:string;gate:string;control:string;sequence:number}>;
function rows(s:FloorStorage,sql:string,...values:(string|number|null)[]){return s.sql.exec(sql,...values).toArray();}
function validateInstallRequest(v:Record<string,unknown>):void{
 if(Object.keys(v).sort().join('|')!==[...ATTEMPT_INSTALL_KEYS].sort().join('|'))return refuse();
 for(const key of ['operationId','nonce'])if(typeof v[key]!=='string'||!/^[0-9a-f]{32}$/.test(v[key] as string))return refuse();
 if(typeof v.requestDigest!=='string'||!/^[0-9a-f]{64}$/.test(v.requestDigest)||typeof v.createdAt!=='number'||!Number.isSafeInteger(v.createdAt)||v.createdAt<1||v.createdAt>253402300499||v.expiresAt!==v.createdAt+300||typeof v.expectedActionSequence!=='number'||!Number.isSafeInteger(v.expectedActionSequence)||v.expectedActionSequence<0||v.expectedActionSequence>=9007199254740991||typeof v.originalFloor!=='string'||typeof v.originalGate!=='string')return refuse();
}
function baseSchema(s:FloorStorage):void{
 const expected=[['table','recovery_floor',FLOOR_DDL],['table','recovery_journal',JOURNAL_DDL],['table','recovery_completion_attempt',COMPLETION_DDL],['table','recovery_epoch_claim',EPOCH_CLAIM_DDL],
 ['table','recovery_serving_gate',SERVING_GATE_DDL],['table','recovery_serving_ticket',SERVING_TICKET_DDL],['index','recovery_serving_ticket_floor_state',SERVING_TICKET_FLOOR_INDEX_DDL],['index','recovery_serving_ticket_parent_state',SERVING_TICKET_PARENT_INDEX_DDL],
 ['table','recovery_serving_cut',SERVING_CUT_DDL],['table','recovery_serving_lifecycle',SERVING_LIFECYCLE_DDL],['table','recovery_suppression_control',SUPPRESSION_CONTROL_DDL],['table','recovery_suppression_journal',SUPPRESSION_JOURNAL_DDL],['table','recovery_suppression_copy',SUPPRESSION_COPY_DDL],['table','recovery_suppression_companion',SUPPRESSION_COMPANION_DDL]];
 const names=JSON.stringify(expected.map(r=>r[1])),condition="(lower(name) IN(SELECT value FROM json_each(?1)) OR lower(tbl_name) IN(SELECT value FROM json_each(?1))) AND NOT(type='index' AND sql IS NULL AND name GLOB 'sqlite_autoindex_*')";
 const found=rows(s,`SELECT 'main' AS db,type,name,sql FROM sqlite_master WHERE ${condition} UNION ALL SELECT 'temp' AS db,type,name,sql FROM sqlite_temp_master WHERE ${condition}`,names);
 if(found.length!==expected.length||found.some(r=>r.db!=='main'||!expected.some(e=>r.type===e[0]&&r.name===e[1]&&r.sql===e[2]!.replace('CREATE TABLE IF NOT EXISTS ','CREATE TABLE '))))return refuse();
}
function freshClosed(s:FloorStorage,v:Record<string,unknown>,o:Original):void{
 if(v.originalFloor!==o.floor||v.originalGate!==o.gate||v.expectedActionSequence!==o.sequence)return refuse();
 const g:unknown=JSON.parse(o.gate);if(!Array.isArray(g)||g.length!==11||g[3]!=='closing_held')return refuse();
 const r=rows(s,`SELECT CASE WHEN ?1<=${NOW} AND ?2>${NOW}
  AND ?3=(SELECT ${SERVING_GATE_TUPLE_SQL} FROM recovery_serving_gate WHERE singleton=1 AND state='closing_held')
  AND ?4=(SELECT ${SUPPRESSION_CONTROL_SQL} FROM recovery_suppression_control WHERE singleton=1)
  AND NOT EXISTS(SELECT 1 FROM recovery_serving_ticket WHERE state IN('running','unknown'))
  AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE state IN('reserved','unknown'))
  AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE state IN('reserved','unknown'))
  AND NOT EXISTS(SELECT 1 FROM recovery_suppression_journal WHERE state IN('reserved','unknown','expired_unknown'))
  AND NOT EXISTS(SELECT 1 FROM recovery_suppression_companion WHERE state='reserved')
  AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE operation_id=?5)
  AND NOT EXISTS(SELECT 1 FROM recovery_serving_lifecycle WHERE operation_id=?5)
  AND NOT EXISTS(SELECT 1 FROM recovery_suppression_journal WHERE operation_id=?5)
  AND NOT EXISTS(SELECT 1 FROM recovery_suppression_copy WHERE operation_id=?5)
  THEN 1 ELSE json_extract('recovery_attempt_closed_installation_held','$') END admitted`,v.createdAt as number,v.expiresAt as number,o.gate,o.control,v.operationId as string);
 if(r.length!==1||r[0]!.admitted!==1)return refuse();
}
/** Authentication is the caller's unchanged native Request/Headers/HMAC path. No boolean attestation,
 * dynamic DDL, callback-created receipt or caller-selected source metadata is accepted here. */
export async function installRecoveryAttemptStorage(s:FloorStorage,v:Record<string,unknown>,original:()=>Original,check:()=>void):Promise<string>{
 validateInstallRequest(v);
 check();const schemaDigest=await recoveryDataStringSha256(recoveryScalarArrayJSON(RECOVERY_ATTEMPT_TABLES));check();if(schemaDigest!==RECOVERY_ATTEMPT_SCHEMA_DIGEST)return refuse();
 return s.transactionSync(()=>{
  check();baseSchema(s);const o=original();freshClosed(s,v,o);
  if(recoveryAttemptLayout(s)!=='absent')return refuse();
  for(const [,ddl] of RECOVERY_ATTEMPT_TABLES)rows(s,ddl!);
  const changed=rows(s,`UPDATE recovery_suppression_control SET action_sequence=action_sequence+1 WHERE singleton=1 AND ${SUPPRESSION_CONTROL_SQL}=?1 AND action_sequence<9007199254740991 RETURNING action_sequence`,o.control);
  if(changed.length!==1||changed[0]!.action_sequence!==o.sequence+1)return refuse();
  const saved=rows(s,`INSERT INTO recovery_erasure_attempt_control(singleton,protocol,schema_digest,installation_operation_id,nonce,request_digest,original_floor,original_gate,created_at,expires_at,installed_at,installation_sequence)
   SELECT 1,?1,?2,?3,?4,?5,?6,?7,?8,?9,${NOW},?10 WHERE ?8<=${NOW} AND ?9>${NOW} RETURNING installed_at`,RECOVERY_ATTEMPT_PROTOCOL,schemaDigest,v.operationId as string,v.nonce as string,v.requestDigest as string,o.floor,o.gate,v.createdAt as number,v.expiresAt as number,o.sequence+1);
  if(saved.length!==1)return refuse();
  const result=recoveryAttemptInstallation(s),expected=recoveryScalarArrayJSON([1,RECOVERY_ATTEMPT_PROTOCOL,schemaDigest,v.operationId,v.nonce,v.requestDigest,o.floor,o.gate,v.createdAt,v.expiresAt,saved[0]!.installed_at,o.sequence+1]);
  if(result!==expected)return refuse();assertNoRecoveryAttemptData(s);baseSchema(s);
  const after=original();if(after.floor!==o.floor||after.gate!==o.gate||after.sequence!==o.sequence+1)return refuse();
  const end=rows(s,`SELECT CASE WHEN ?1<=${NOW} AND ?2>${NOW} THEN 1 ELSE json_extract('recovery_attempt_installation_expired','$') END admitted`,v.createdAt as number,v.expiresAt as number);
  if(end.length!==1||end[0]!.admitted!==1)return refuse();check();return result;
 });
}
/** Same immutable installation only: a lost reply cannot trigger another install or renew its deadline.
 * This historical observation is not a current receipt for reopening, retrying or resolving any unknown. */
export async function observeRecoveryAttemptInstallation(s:FloorStorage,value:unknown,original:()=>Original,check:()=>void):Promise<string>{
 if(typeof value!=='string'||value.length>8192)return refuse();
 const parsed:unknown=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||JSON.stringify(parsed)!==value)return refuse();const v=parsed as Record<string,unknown>;validateInstallRequest(v);
 check();const schemaDigest=await recoveryDataStringSha256(recoveryScalarArrayJSON(RECOVERY_ATTEMPT_TABLES));check();if(schemaDigest!==RECOVERY_ATTEMPT_SCHEMA_DIGEST)return refuse();
 return s.transactionSync(()=>{check();baseSchema(s);original();const installed=recoveryAttemptInstallation(s),a=JSON.parse(installed) as unknown[];
  const known=[v.operationId,v.nonce,v.requestDigest,v.originalFloor,v.originalGate,v.createdAt,v.expiresAt];
  if(a[2]!==schemaDigest||known.some((field,i)=>field!==a[i+3])||a[11]!==Number(v.expectedActionSequence)+1)return refuse();check();return installed;
 });
}

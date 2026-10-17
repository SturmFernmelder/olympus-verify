/** Fixed retained-status SQL/data. Shape validation never issues Native or journal authority. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
import {recoveryParseDataJSON,recoveryIsDataArray,recoveryScalarArrayJSON} from './privacy-recovery-data-json';
import {snapshotErasureStatusData} from './privacy-erasure-status-credential';
const held=():never=>{throw new RecoveryFloorHeld();};
const NOW="CAST(strftime('%s','now') AS INTEGER)",RETAIN=31622400;
export const ERASURE_STATUS_TERMINAL_SQL=`json_array(j.operation_id,j.subject_id,j.subject_generation,j.request_digest,j.created_at,j.retain_until,j.completed_at,
 (SELECT r.erased_at FROM privacy_restore_replay r WHERE r.operation_id=j.operation_id AND r.subject_id=j.subject_id AND r.retired_generation=j.subject_generation AND r.scope='serving_account'),
 (SELECT r.retain_until FROM privacy_restore_replay r WHERE r.operation_id=j.operation_id AND r.subject_id=j.subject_id AND r.retired_generation=j.subject_generation AND r.scope='serving_account'),
 CASE WHEN j.state='complete' AND typeof(j.created_at)='integer' AND j.created_at BETWEEN 1 AND 253370678399
 AND typeof(j.retain_until)='integer' AND j.retain_until=j.created_at+31622400 AND j.retain_until>${NOW}
 AND typeof(j.completed_at)='integer' AND j.completed_at BETWEEN j.created_at AND 253370678399 AND j.completed_at<=${NOW}
 AND EXISTS(SELECT 1 FROM privacy_restore_replay r WHERE r.operation_id=j.operation_id AND r.subject_id=j.subject_id AND r.retired_generation=j.subject_generation AND r.scope='serving_account'
  AND typeof(r.erased_at)='integer' AND r.erased_at=j.completed_at AND typeof(r.retain_until)='integer' AND r.retain_until=r.erased_at+31622400)
 AND EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=j.subject_id AND p.generation=j.subject_generation AND p.state='retired'
  AND typeof(p.erased_at)='integer' AND p.erased_at=j.completed_at AND typeof(p.retain_until)='integer' AND p.retain_until=p.erased_at+31622400)
 AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=j.subject_id) AND NOT EXISTS(SELECT 1 FROM characters WHERE discord_id=j.subject_id)
 THEN 1 ELSE 0 END)`;
const projection=`SELECT state,hold_reason,staff_access,request_digest,subject_generation,retain_until,${ERASURE_STATUS_TERMINAL_SQL} AS status_terminal FROM privacy_serving_jobs j`;
export const ERASURE_STATUS_CODE_READ_SQL=`${projection} WHERE operation_id=?1 AND request_digest=?2 AND subject_generation=?3 AND retain_until=?4 AND retain_until>${NOW}`;
const birth=(n:string|null,column:string)=>{if(n===null)return `${column} IS NULL`;if(typeof n!=='string'||n.length!==32||/[^0-9a-f]/.test(n))return held();return `(typeof(${column})='text' AND length(${column})=32 AND length(CAST(${column} AS BLOB))=32 AND instr(${column},char(0))=0 AND ${column} NOT GLOB '*[^0-9a-f]*' AND ${column}='${n}' COLLATE BINARY)`;};
export const erasureStatusProofReadSql=(n:string|null)=>`${projection} WHERE operation_id=?1 AND subject_id=?2 AND subject_generation=?3 AND request_digest=?4 AND ${birth(n,'j.original_account_incarnation')} AND retain_until>${NOW}`;
export const erasureStatusSessionReadSql=(n:string)=>`${projection} WHERE operation_id=?1 AND subject_id=?2 AND ${birth(n,'original_account_incarnation')} AND original_session_version=?3 AND original_session_expires=?4 AND ?4>${NOW} AND retain_until>${NOW}`;
/** Full fixed-source grammar comparison, not a marker substring or raw-row registrar. */
export function originalErasureStatusReadKind(sql:string):'code'|'proof'|'session'|null{
 if(sql===ERASURE_STATUS_CODE_READ_SQL)return 'code';if(sql===erasureStatusProofReadSql(null))return 'proof';
 const m=sql.match(/original_account_incarnation='([0-9a-f]{32})' COLLATE BINARY/);if(!m)return null;
 if(sql===erasureStatusProofReadSql(m[1]!))return 'proof';if(sql===erasureStatusSessionReadSql(m[1]!))return 'session';return null;
}
export type ErasureStatusNativeTuple=Readonly<{operationId:string;subject:string;generation:string;requestDigest:string;createdAt:number;retainUntil:number;completedAt:number;replayErasedAt:number;replayRetainUntil:number}>;
export function originalErasureStatusTerminalData(row:object):Readonly<{facts:ErasureStatusNativeTuple;check:()=>void}>{
 const original=snapshotErasureStatusData(row),d=Object.getOwnPropertyDescriptor(row,'status_terminal');if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>1024)return held();
 const a=recoveryParseDataJSON(d.value);if(!recoveryIsDataArray(a)||a.length!==10||recoveryScalarArrayJSON(a)!==d.value)return held();const parsed=snapshotErasureStatusData(a),v:unknown[]=[];
 for(let i=0;i<10;i++){const s=Object.getOwnPropertyDescriptor(a,String(i));if(!s||!Object.hasOwn(s,'value'))return held();v.push(s.value);}
 const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x),clock=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=253402300799;
 if(!hex(v[0],32)||typeof v[1]!=='string'||v[1].length<17||v[1].length>20||/[^0-9]/.test(v[1])||!hex(v[2],32)||!hex(v[3],64)||!clock(v[4])||!clock(v[5])||!clock(v[6])||!clock(v[7])||!clock(v[8])||v[9]!==1||v[5]!==v[4]+RETAIN||v[6]<v[4]||v[7]!==v[6]||v[8]!==v[6]+RETAIN)return held();
 const facts=Object.freeze({operationId:v[0],subject:v[1],generation:v[2],requestDigest:v[3],createdAt:v[4],retainUntil:v[5],completedAt:v[6],replayErasedAt:v[7],replayRetainUntil:v[8]});const check=()=>{original.check();parsed.check();};check();return Object.freeze({facts,check});
}

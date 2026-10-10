/** Bounded local subset execution only. Not a public eraser, rights identity or external effect worker. */
import { randomGeneration, token, type Database } from './account-generation-contracts';
import { STORE_CATALOG, catalogDigest, catalogMatchesSchema } from './privacy-store-catalog';
import { boundedDatabase, checkedRow, confirmLifecycleBatch, currentJobFence, FAILED_POSTCONDITION, nativeDataFields, PURGE_ROWS, refValues, result, selectedNativeRows, snapshotRef, statusWithBudget, type LocalStatus, type OperationRef } from './account-lifecycle';

type Progress={store_key:string;cursor:number;high_water:number|null;revision:number;catalog_digest:string;purged_rows:number;expires_at:number;job_nonce:string;cleanup_generation:string;control_revision:number;original_session_version:number;created_at:number};
/** Caller must already be the adopted trusted coordinator; this dormant library provides no caller authorization. */
export async function runErasureSlice(rawDb:Database,input:OperationRef):Promise<LocalStatus> {
 const ref=snapshotRef(input),budget={used:0},db=boundedDatabase(rawDb,budget);
 try {
 if(!await catalogMatchesSchema(db))return result(ref,'unclassified_schema',budget.used);
 const expectedDigest=await catalogDigest(),initialCurrent=currentJobFence(expectedDigest);
 const rawStep=await db.prepare(`SELECT p.store_key,p.cursor,p.high_water,p.revision,j.catalog_digest,p.purged_rows,j.expires_at,j.claim_nonce AS job_nonce,j.cleanup_generation,j.control_revision,j.original_session_version,j.created_at FROM privacy_erasure_progress p JOIN privacy_erasure_jobs j ON j.operation_id=p.operation_id
 WHERE p.operation_id=?1 AND p.state='pending' AND ${initialCurrent} ORDER BY p.ordinal LIMIT 1`).bind(...refValues(ref)).first<unknown>();
 if(rawStep===null)return statusWithBudget(db,ref,budget);
 const fields=nativeDataFields(rawStep,['store_key','cursor','high_water','revision','catalog_digest','purged_rows','expires_at','job_nonce','cleanup_generation','control_revision','original_session_version','created_at']);
 if(typeof fields.store_key!=='string'||typeof fields.catalog_digest!=='string')return result(ref,'invalid_progress',budget.used);
 const step=fields as Progress;
 token(step.job_nonce);token(step.cleanup_generation);
 if(!Number.isSafeInteger(step.purged_rows)||step.purged_rows<0||step.purged_rows>Number.MAX_SAFE_INTEGER-PURGE_ROWS||!Number.isSafeInteger(step.expires_at)||step.expires_at<=0)return result(ref,'invalid_progress',budget.used);
 if(!Number.isSafeInteger(step.created_at)||step.created_at<=0||step.expires_at<=step.created_at||step.expires_at>step.created_at+86400||!Number.isSafeInteger(step.control_revision)||step.control_revision<0||step.control_revision>Number.MAX_SAFE_INTEGER-2||!Number.isSafeInteger(step.original_session_version)||step.original_session_version<1||step.original_session_version>Number.MAX_SAFE_INTEGER-1)return result(ref,'invalid_progress',budget.used);
 if(step.catalog_digest!==expectedDigest)return result(ref,'catalog_changed',budget.used);
 const entry=STORE_CATALOG.find(s=>s.table===step.store_key),plan=entry?.plan;
 if(!plan)return result(ref,'unclassified_store',budget.used);
 if(!Number.isSafeInteger(step.cursor)||step.cursor<0||!Number.isSafeInteger(step.revision)||step.revision<0)return result(ref,'invalid_progress',budget.used);
 let high=step.high_water;
 if(high===null){const raw=await db.prepare(`SELECT COALESCE(MAX(rowid),0) AS high,COALESCE(MIN(rowid),1) AS low FROM ${entry.table} WHERE ${plan.owner}=?1`).bind(ref.subject).first<unknown>();if(raw===null)return result(ref,'unsupported_legacy_rowid',budget.used);const row=nativeDataFields(raw,['high','low']);if(!Number.isSafeInteger(row.low)||(row.low as number)<1)return result(ref,'unsupported_legacy_rowid',budget.used);high=row.high as number;}
 if(!Number.isSafeInteger(high)||high<step.cursor)return result(ref,'invalid_high_water',budget.used);
 const selected=await db.prepare(`SELECT rowid AS row_id FROM ${entry.table} WHERE ${plan.owner}=?1 AND rowid>?2 AND rowid<=?3 ORDER BY rowid LIMIT ${PURGE_ROWS}`).bind(ref.subject,step.cursor,high).all<{row_id:number}>();
 const rows=selectedNativeRows(selected).map(raw=>nativeDataFields(raw,['row_id']) as {row_id:number});
 if(rows.some((r,i)=>!Number.isSafeInteger(r.row_id)||r.row_id<=step.cursor||r.row_id>high!||(i>0&&r.row_id<=rows[i-1]!.row_id)))return result(ref,'invalid_selected_range',budget.used);
 const end=rows.at(-1)?.row_id??high,done=rows.length<PURGE_ROWS||end===high,nonce=randomGeneration();
 const v=[...refValues(ref),step.store_key,step.revision,nonce,step.cursor,high,end,done?1:0,step.purged_rows,step.purged_rows+rows.length,step.expires_at,step.job_nonce,step.cleanup_generation,step.control_revision,step.original_session_version,step.created_at];
 const current=`${currentJobFence(expectedDigest)} AND EXISTS(SELECT 1 FROM privacy_erasure_jobs WHERE operation_id=?1 AND expires_at=?15 AND claim_nonce=?16 AND cleanup_generation=?17 AND control_revision=?18 AND original_session_version=?19 AND created_at=?20)`;
 const claimedRow=`EXISTS(SELECT 1 FROM privacy_erasure_progress p WHERE p.operation_id=?1 AND p.store_key=?6 AND p.state='pending' AND p.revision=?7+1 AND p.claim_nonce=?8 AND p.cursor=?9 AND p.high_water=?10 AND p.purged_rows=?13)`;
 const claimed=`${claimedRow} AND ${current}`;
 const advanced=`EXISTS(SELECT 1 FROM privacy_erasure_progress p WHERE p.operation_id=?1 AND p.store_key=?6 AND p.state=CASE WHEN ?12=1 THEN 'done' ELSE 'pending' END AND p.revision=?7+1 AND p.claim_nonce=?8 AND p.cursor=?11 AND p.high_water=?10 AND p.purged_rows BETWEEN ?13 AND ?14) AND ${current}`;
 let out;
 try {out=await db.batch([
 db.prepare(`UPDATE privacy_erasure_progress SET revision=revision+1,claim_nonce=?8,high_water=COALESCE(high_water,?10) WHERE operation_id=?1 AND store_key=?6 AND state='pending' AND revision=?7 AND cursor=?9 AND purged_rows=?13 AND (high_water IS NULL OR high_water=?10) AND ${current}`).bind(...v),
 db.prepare(`DELETE FROM ${entry.table} WHERE ${plan.owner}=?2 AND rowid IN(SELECT value FROM json_each(?21)) AND ${claimedRow}`).bind(...v,JSON.stringify(rows.map(r=>r.row_id))),
 // A failed current admission must fail the native batch, not silently match0
 // after DELETE. The exact profile admits the existing revision>=0 CHECK.
 db.prepare(`UPDATE privacy_erasure_progress SET revision=CASE WHEN ${current} THEN revision ELSE -1 END,cursor=?11,state=CASE WHEN ?12=1 THEN 'done' ELSE 'pending' END,purged_rows=purged_rows+changes() WHERE operation_id=?1 AND store_key=?6 AND ${claimedRow}`).bind(...v),
 db.prepare(`SELECT CASE WHEN changes()=1 AND ${advanced} THEN 1 ELSE ${FAILED_POSTCONDITION} END AS checked`).bind(...v),
 ]);}catch{
 // A thrown batch is not proof of rollback. Read the durable revision/nonce before returning any advancement claim.
 const observed=await db.prepare(`SELECT CASE WHEN ${advanced} THEN 1 ELSE 0 END AS checked`).bind(...v).first<unknown>();
 if(!checkedRow(observed))return result(ref,'commit_outcome_unknown',budget.used);
 return statusWithBudget(db,ref,budget);
 }
 let changes:readonly number[];
 try{changes=confirmLifecycleBatch(out,4);if(changes[0]!==1||changes[2]!==1)throw Error('unconfirmed_advance');}
 catch{
  const observed=await db.prepare(`SELECT CASE WHEN ${advanced} THEN 1 ELSE 0 END AS checked`).bind(...v).first<unknown>();
  if(!checkedRow(observed))return result(ref,'commit_outcome_unknown',budget.used);
 }
 return statusWithBudget(db,ref,budget);
 }catch{return result(ref,'slice_outcome_unknown',budget.used);}
}

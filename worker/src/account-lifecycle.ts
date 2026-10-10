/** Internal local foundation only. No route, identity minting, writer adoption or restore authority is composed here. */
import { DB_NOW, digest, id, randomGeneration, snapshotDataArray, snapshotDataFields, token, type Database, type Statement } from './account-generation-contracts';
import { CATALOG_VERSION, STORE_CATALOG, SCHEMA_CURRENT_SQL, catalogDigest, catalogMatchesSchema } from './privacy-store-catalog';

export const LIFECYCLE_COMPOSITION = Object.freeze({ routes: false, writers: false, restoreAuthority: false, identity: false, retention: false, externalEffects: false });
export const SLICE_ATTEMPTS = 24, PURGE_ROWS = 100, MAX_OPERATION_SECONDS = 86400;
export type Operation = Readonly<{ subject: string; accountGeneration: string; purposeGeneration: string; epoch: string; operationId: string; requestDigest: string; accountRevision: number; controlRevision: number; provenanceDigest: string; expiresAt: number }>;
export type OperationRef = Readonly<Pick<Operation, 'subject'|'accountGeneration'|'epoch'|'operationId'|'requestDigest'>>;
export type LocalStatus = Readonly<{ status: 'refused'|'held'|'local_plans_finished'; reason: string; operationId: string; pendingPlans: number; heldPlans: number; finishedPlans: number; localPlansFinished: boolean; allStoresErased: false; externalEffects: 'held'; authorityAdopted: false; attempts: number }>;
export function snapshotOperation(raw: Operation): Operation {
 const d = snapshotDataFields(raw,['subject','accountGeneration','purposeGeneration','epoch','operationId','requestDigest','accountRevision','controlRevision','provenanceDigest','expiresAt'],'invalid_operation');
 id(d.subject as string); for(const k of ['accountGeneration','purposeGeneration','epoch','operationId']) token(d[k] as string);
 digest(d.requestDigest as string); digest(d.provenanceDigest as string);
 if(!Number.isSafeInteger(d.accountRevision)||Number(d.accountRevision)<0||Number(d.accountRevision)>Number.MAX_SAFE_INTEGER-2||!Number.isSafeInteger(d.controlRevision)||Number(d.controlRevision)<0||Number(d.controlRevision)>Number.MAX_SAFE_INTEGER-2||!Number.isSafeInteger(d.expiresAt)||Number(d.expiresAt)<=0)throw Error('invalid_operation');
 return Object.freeze({...d}) as Operation;
}
export function snapshotRef(raw: OperationRef): OperationRef {
 const d=snapshotDataFields(raw,['subject','accountGeneration','epoch','operationId','requestDigest'],'invalid_operation_ref');
 id(d.subject as string);for(const k of ['accountGeneration','epoch','operationId'])token(d[k] as string);digest(d.requestDigest as string);
 return Object.freeze({...d}) as OperationRef;
}
export const reference=(o:Operation):OperationRef=>Object.freeze({subject:o.subject,accountGeneration:o.accountGeneration,epoch:o.epoch,operationId:o.operationId,requestDigest:o.requestDigest});
export function result(ref:OperationRef,reason:string,attempts:number,status:LocalStatus['status']='held',counts={pendingPlans:0,heldPlans:0,finishedPlans:0}):LocalStatus {
 return Object.freeze({status,reason,operationId:ref.operationId,...counts,localPlansFinished:status==='local_plans_finished',allStoresErased:false,externalEffects:'held',authorityAdopted:false,attempts});
}

const RAW=Symbol('lifecycle-statement');
export interface AttemptBudget { used: number }
/** Conservative statement-attempt accounting, including refused batches/readback. Never a provider billing claim. */
export function boundedDatabase(db:Database,budget:AttemptBudget):Database {
 const take=(n:number)=>{if(budget.used+n>SLICE_ATTEMPTS)throw Error('lifecycle_budget');budget.used+=n;};
 const wrap=(s:Statement):Statement=>({bind:(...v)=>wrap(s.bind(...v)),run:()=>{take(1);return s.run();},first:<T>()=>{take(1);return s.first<T>();},all:<T>()=>{take(1);return s.all<T>();},[RAW]:s} as Statement);
 // Claude F3 (2026-10-08): the bound applies to every lifecycle prepare, including
 // status and erasure readback, before the underlying database sees any SQL.
 return {prepare:q=>{if(new TextEncoder().encode(q).length>=100000)throw Error('lifecycle_statement_size');return wrap(db.prepare(q));},batch:ss=>{take(ss.length);return db.batch(ss.map(s=>(s as unknown as {[RAW]?:Statement})[RAW]??s));}};
}
/** Parameters 1..5: operation, subject, account generation, epoch, request digest. */
// Source successor (2026-10-10): the complete authored catalog is a slice admission
// predicate, not merely a final status count. Old 52-step jobs and count-correct
// substitutions cannot authorize a destructive local slice.
const progressRows=`SELECT column1 AS ordinal,column2 AS store_key,column3 AS planned,column4 AS held_reason FROM (VALUES ${STORE_CATALOG.map((s,i)=>`(${i},'${s.table}',${s.plan?1:0},'${s.hold}')`).join(',')})`;
export const PROGRESS_CATALOG_CURRENT=`(SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=?1)=${STORE_CATALOG.length}
 AND NOT EXISTS(SELECT 1 FROM (${progressRows}) s WHERE NOT EXISTS(SELECT 1 FROM privacy_erasure_progress p WHERE p.operation_id=?1 AND p.ordinal=s.ordinal AND p.store_key=s.store_key AND p.held_reason=s.held_reason
 AND ((s.planned=1 AND p.state IN('pending','done')) OR (s.planned=0 AND p.state='held'))))`;
export const JOB_CURRENT=`EXISTS(SELECT 1 FROM privacy_erasure_jobs j JOIN account_generations a ON a.account_id=j.subject AND a.generation=j.account_generation
 JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation AND p.purpose='erasure'
 JOIN generation_control g ON g.singleton=1 WHERE j.operation_id=?1 AND j.subject=?2 AND j.account_generation=?3 AND j.epoch=?4 AND j.request_digest=?5
 AND j.catalog_version='${CATALOG_VERSION}' AND j.completion_admitted=1 AND p.generation=j.cleanup_generation AND a.state='retiring' AND g.epoch=j.epoch AND g.restore_hold=0 AND j.created_at<=${DB_NOW} AND j.expires_at>${DB_NOW}) AND ${PROGRESS_CATALOG_CURRENT}`;
/** The authored hash is captured from the immutable catalog, never supplied by a request or read back as authority. */
function currentJobPredicate(expectedCatalogDigest:string):string {
 digest(expectedCatalogDigest);
 return `${JOB_CURRENT} AND EXISTS(SELECT 1 FROM privacy_erasure_jobs j WHERE j.operation_id=?1 AND j.catalog_digest='${expectedCatalogDigest}')`;
}
export function currentJobFence(expectedCatalogDigest:string):string{return `${currentJobPredicate(expectedCatalogDigest)} AND ${SCHEMA_CURRENT_SQL}`;}
export const refValues=(r:OperationRef):unknown[]=>[r.operationId,r.subject,r.accountGeneration,r.epoch,r.requestDigest];

/** A fixed false CASE branch raises a native error; it never contains caller data.
 * A zero-row UPDATE is not itself a transaction failure. */
export const FAILED_POSTCONDITION="json_extract('!lifecycle_checked_postcondition!','$')";
export function nativeDataFields(raw:unknown,keys:readonly string[]):Readonly<Record<string,unknown>> {
 const d=snapshotDataFields(raw,keys,'invalid_native_fields');for(const key of keys)if(Object.getOwnPropertyDescriptor(raw,key)?.enumerable!==true)throw Error('invalid_native_fields');return d;
}
function nativeArray(raw:unknown,max:number):readonly unknown[] {
 const rows=snapshotDataArray(raw,max,'invalid_native_array');for(let i=0;i<rows.length;i++)if(Object.getOwnPropertyDescriptor(raw,String(i))?.enumerable!==true)throw Error('invalid_native_array');return rows;
}
function nativeResult(raw:unknown):Readonly<{results:unknown;changes:number}> {
 const d=nativeDataFields(raw,['success','meta','results']);
 if(d.success!==true||!d.meta||typeof d.meta!=='object'||Array.isArray(d.meta))throw Error('invalid_native_result');
 const keys=Reflect.ownKeys(d.meta);if(keys.length>32||keys.some(k=>typeof k!=='string'))throw Error('invalid_native_meta');
 for(const key of keys){const desc=Object.getOwnPropertyDescriptor(d.meta,key);if(!desc||!Object.hasOwn(desc,'value'))throw Error('invalid_native_meta');}
 const changes=Object.getOwnPropertyDescriptor(d.meta,'changes');
 if(!changes||changes.enumerable!==true||!Object.hasOwn(changes,'value')||!Number.isSafeInteger(changes.value)||changes.value<0||changes.value>100)throw Error('invalid_native_changes');
 return Object.freeze({results:d.results,changes:changes.value as number});
}
export function checkedRow(raw:unknown):boolean {
 const d=nativeDataFields(raw,['checked']);if(d.checked!==0&&d.checked!==1)throw Error('invalid_checked_row');return d.checked===1;
}
/** Own native shapes only. Null/empty write results cannot impersonate a SELECT guard. */
export function confirmLifecycleBatch(raw:unknown,size:number):readonly number[] {
 const entries=nativeArray(raw,SLICE_ATTEMPTS);if(entries.length!==size)throw Error('invalid_native_batch');
 const changes:number[]=[];
 for(let i=0;i<entries.length;i++){const row=nativeResult(entries[i]);changes.push(row.changes);
  if(i===size-1){const results=nativeArray(row.results,1);if(row.changes!==0||results.length!==1||!checkedRow(results[0]))throw Error('invalid_guard_confirmation');}
  else if(row.results!==null&&nativeArray(row.results,0).length!==0)throw Error('invalid_write_results');
 }
 return Object.freeze(changes);
}
export function selectedNativeRows(raw:unknown):readonly unknown[] {
 const row=nativeResult(raw);if(row.changes!==0)throw Error('invalid_select_meta');return nativeArray(row.results,PURGE_ROWS);
}

/** Private status for an already authorized coordinator. No identity/session authorization is supplied by this function. */
export async function statusWithBudget(db:Database,ref:OperationRef,budget:AttemptBudget):Promise<LocalStatus>{return readStatus(db,ref,budget);}
/** Confirmation SQL and bindings are compiled by this module only, never a public argument. */
async function readStatus(db:Database,ref:OperationRef,budget:AttemptBudget,confirmation='1',values=refValues(ref)):Promise<LocalStatus> {
 try {
 if(!await catalogMatchesSchema(db))return result(ref,'unclassified_schema',budget.used);
 const expectedDigest=await catalogDigest(),current=currentJobPredicate(expectedDigest);
 // One materialized, current schema result inside this same consuming statement
 // supplies both refusal classification and admission. The earlier read is no lease.
 const row=await db.prepare(`WITH schema_gate AS MATERIALIZED (SELECT CASE WHEN ${SCHEMA_CURRENT_SQL} THEN 1 ELSE 0 END AS schemaCurrent)
 SELECT j.catalog_digest,j.expires_at,${DB_NOW} AS at,CASE WHEN ${current} AND schema_gate.schemaCurrent=1 THEN 1 ELSE 0 END AS admitted,schema_gate.schemaCurrent,j.completion_admitted,
 CASE WHEN j.subject=?2 AND j.account_generation=?3 AND j.epoch=?4 AND j.request_digest=?5 THEN 1 ELSE 0 END AS identityCurrent,
 CASE WHEN ${confirmation} THEN 1 ELSE 0 END AS ownCommitCurrent,
 (SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=j.operation_id AND state='pending') AS pendingPlans,
 (SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=j.operation_id AND state='held') AS heldPlans,
 (SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=j.operation_id AND state='done') AS finishedPlans
 FROM privacy_erasure_jobs j CROSS JOIN schema_gate WHERE j.operation_id=?1`).bind(...values).first<unknown>();
 if(row===null)return result(ref,'operation_absent_or_mismatch',budget.used,'refused');
 const d=nativeDataFields(row,['catalog_digest','expires_at','at','admitted','schemaCurrent','completion_admitted','identityCurrent','ownCommitCurrent','pendingPlans','heldPlans','finishedPlans']);
 digest(d.catalog_digest as string);
 for(const key of ['expires_at','at'])if(!Number.isSafeInteger(d[key])||(d[key] as number)<=0)throw Error('invalid_status_time');
 for(const key of ['admitted','schemaCurrent','completion_admitted','identityCurrent','ownCommitCurrent'])if(d[key]!==0&&d[key]!==1)throw Error('invalid_status_boolean');
 for(const key of ['pendingPlans','heldPlans','finishedPlans'])if(!Number.isSafeInteger(d[key])||(d[key] as number)<0||(d[key] as number)>STORE_CATALOG.length)throw Error('invalid_status_count');
 const status=d as {catalog_digest:string;expires_at:number;at:number;admitted:number;schemaCurrent:number;completion_admitted:number;identityCurrent:number;ownCommitCurrent:number;pendingPlans:number;heldPlans:number;finishedPlans:number};
 if(status.schemaCurrent!==1)return result(ref,'unclassified_schema',budget.used);
 if(status.identityCurrent!==1)return result(ref,'operation_identity_mismatch',budget.used,'refused');
 if(status.catalog_digest!==expectedDigest)return result(ref,'catalog_changed',budget.used);
 if(status.completion_admitted===0)return result(ref,status.expires_at<=status.at?'operation_incomplete_completion_expired':'operation_incomplete_completion',budget.used);
 if(status.expires_at<=status.at)return result(ref,'operation_expired_policy_pending',budget.used);
 if(status.admitted!==1)return result(ref,'generation_or_restore_changed',budget.used);
 if(status.ownCommitCurrent!==1)return result(ref,'retirement_invocation_unconfirmed',budget.used);
 const counts={pendingPlans:status.pendingPlans,heldPlans:status.heldPlans,finishedPlans:status.finishedPlans};
 if(counts.pendingPlans+counts.heldPlans+counts.finishedPlans!==STORE_CATALOG.length)return result(ref,'catalog_progress_incomplete',budget.used);
 return result(ref,counts.pendingPlans?'local_work_pending':'local_subset_finished_remaining_stores_and_effects_held',budget.used,counts.pendingPlans?'held':'local_plans_finished',counts);
 }catch{return result(ref,'readback_unavailable',budget.used);}
}
export async function readErasureStatus(db:Database,input:OperationRef):Promise<LocalStatus>{const ref=snapshotRef(input),budget={used:0};return statusWithBudget(boundedDatabase(db,budget),ref,budget);}

/** Fresh retirement claim only; all legacy cancellation writes are bounded to100.
 * The account immediately becomes retiring, which qualified ordinary writers must refuse.
 * Local subset progress and held effects are not terminal retirement or full erasure.
 */
export async function retireExistingAccount(rawDb:Database,input:Operation):Promise<LocalStatus> {
 const c=snapshotOperation(input),ref=reference(c),budget={used:0},db=boundedDatabase(rawDb,budget),cleanup=randomGeneration(),nonce=randomGeneration(),hash=await catalogDigest();
 const v=[...refValues(ref),c.purposeGeneration,c.accountRevision,c.provenanceDigest,c.expiresAt,cleanup,nonce,c.controlRevision];
 const job=`j.operation_id=?1 AND j.subject=?2 AND j.account_generation=?3 AND j.epoch=?4 AND j.request_digest=?5 AND j.claim_nonce=?11 AND j.cleanup_generation=?10 AND j.control_revision=?12 AND j.catalog_version='${CATALOG_VERSION}' AND j.catalog_digest='${hash}' AND j.completion_admitted=0 AND j.created_at<j.expires_at AND j.expires_at<=j.created_at+${MAX_OPERATION_SECONDS}`;
 const account=`a.account_id=?2 AND a.generation=?3 AND a.state='retiring' AND a.revision=?7+1 AND a.provenance_digest=?8`;
 const accepted=`EXISTS(SELECT 1 FROM privacy_erasure_jobs j JOIN account_generations a ON a.account_id=j.subject AND a.generation=j.account_generation JOIN generation_control g ON g.singleton=1 WHERE ${job} AND ${account} AND g.epoch=?4 AND g.revision=?12+1 AND g.restore_hold=0) AND ${SCHEMA_CURRENT_SQL}`;
 const purposeCurrent=`EXISTS(SELECT 1 FROM account_purpose_generations p WHERE p.account_id=?2 AND p.account_generation=?3 AND p.purpose='erasure' AND p.generation=?10) AND NOT EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=?2 AND account_generation=?3 AND purpose<>'erasure')`;
 const profileCurrent=`EXISTS(SELECT 1 FROM site_users u JOIN privacy_erasure_jobs j ON j.subject=u.discord_id WHERE ${job} AND u.session_version=j.original_session_version+1 AND u.in_server=0)`;
 // These finite authored rows preserve the same projection without exceeding
 // native D1's measured compound-SELECT term limit. No caller data supplies SQL.
 const steps=`SELECT column1 AS ordinal,column2 AS store_key,column3 AS state,column4 AS held_reason FROM (VALUES ${STORE_CATALOG.map((s,i)=>`(${i},'${s.table}','${s.plan?'pending':'held'}','${s.hold}')`).join(',')})`;
 const completedJob=job.replace('j.completion_admitted=0','j.completion_admitted=1');
 // The same original deadline is a final refusal boundary, never a renewed lease.
 const completed=`EXISTS(SELECT 1 FROM privacy_erasure_jobs j JOIN account_generations a ON a.account_id=j.subject AND a.generation=j.account_generation JOIN generation_control g ON g.singleton=1 JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation AND p.purpose='erasure' JOIN site_users u ON u.discord_id=j.subject
 WHERE ((((${completedJob}) AND ((${account}) AND (j.expires_at=?9))) AND ((((j.created_at<=${DB_NOW}) AND (j.expires_at>${DB_NOW})) AND (g.epoch=?4)) AND ((g.revision=?12+1) AND (g.restore_hold=0)))) AND (((p.generation=?10) AND ((u.session_version=j.original_session_version+1) AND (u.in_server=0))) AND (((NOT EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=?2 AND account_generation=?3 AND purpose<>'erasure')) AND ((SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=?1)=${STORE_CATALOG.length})) AND ((NOT EXISTS(SELECT 1 FROM (${steps}) s WHERE NOT EXISTS(SELECT 1 FROM privacy_erasure_progress x WHERE x.operation_id=?1 AND x.ordinal=s.ordinal AND x.store_key=s.store_key AND x.state=s.state AND x.held_reason=s.held_reason AND x.cursor=0 AND x.high_water IS NULL AND x.revision=0 AND x.claim_nonce IS NULL AND x.purged_rows=0))) AND (EXISTS(SELECT 1 FROM privacy_external_outbox WHERE operation_id=?1 AND effect_key='guild-member-remove' AND subject=?2 AND account_generation=?3 AND epoch=?4 AND state='held' AND held_reason='writer_restore_identity_retention_unadopted' AND expires_at=?9)))))))`;
 const queries=[
 `INSERT INTO privacy_erasure_jobs(operation_id,subject,account_generation,epoch,request_digest,catalog_version,catalog_digest,cleanup_generation,claim_nonce,created_at,expires_at,control_revision,original_session_version,completion_admitted)
 SELECT ?1,?2,?3,?4,?5,'${CATALOG_VERSION}','${hash}',?10,?11,${DB_NOW},?9,?12,u.session_version,0 FROM account_generations a JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation JOIN site_users u ON u.discord_id=a.account_id JOIN generation_control g ON g.singleton=1
 WHERE ?9>${DB_NOW} AND ?9<=${DB_NOW}+${MAX_OPERATION_SECONDS} AND a.account_id=?2 AND a.generation=?3 AND a.state='active' AND a.revision=?7 AND a.provenance_digest=?8 AND p.purpose='erasure' AND p.generation=?6 AND p.revision BETWEEN 0 AND 9007199254740989 AND u.session_version BETWEEN 1 AND 9007199254740990 AND g.epoch=?4 AND g.revision=?12 AND g.restore_hold=0 AND ${SCHEMA_CURRENT_SQL}
 ON CONFLICT(operation_id) DO NOTHING`,
 // A preexisting incomplete row must not impersonate this invocation's successful
 // INSERT. The invalid value aborts before account/global or dependent mutation.
 `UPDATE privacy_erasure_jobs AS j SET completion_admitted=CASE WHEN changes()=1 THEN 0 ELSE 2 END WHERE ${job}`,
 `UPDATE account_generations SET state='retiring',revision=revision+1 WHERE changes()=1 AND account_id=?2 AND generation=?3 AND state='active' AND revision=?7 AND provenance_digest=?8 AND ${SCHEMA_CURRENT_SQL} AND EXISTS(SELECT 1 FROM privacy_erasure_jobs j JOIN generation_control g ON g.singleton=1 WHERE ${job} AND g.epoch=?4 AND g.revision=?12 AND g.restore_hold=0)`,
 `UPDATE generation_control SET revision=revision+1 WHERE changes()=1 AND singleton=1 AND epoch=?4 AND revision=?12 AND restore_hold=0 AND ${SCHEMA_CURRENT_SQL} AND EXISTS(SELECT 1 FROM privacy_erasure_jobs j JOIN account_generations a ON a.account_id=j.subject WHERE ${job} AND ${account})`,
 `DELETE FROM account_purpose_generations WHERE account_id=?2 AND account_generation=?3 AND purpose<>'erasure' AND ${accepted}`,
 `UPDATE account_purpose_generations SET generation=?10,revision=revision+1,updated_at=(SELECT created_at FROM privacy_erasure_jobs WHERE operation_id=?1) WHERE account_id=?2 AND account_generation=?3 AND purpose='erasure' AND generation=?6 AND revision BETWEEN 0 AND 9007199254740989 AND NOT EXISTS(SELECT 1 FROM account_purpose_generations WHERE account_id=?2 AND account_generation=?3 AND purpose<>'erasure') AND ${accepted}`,
 `UPDATE site_users SET session_version=session_version+1,in_server=0,checked_at=(SELECT created_at FROM privacy_erasure_jobs WHERE operation_id=?1) WHERE discord_id=?2 AND changes()=1 AND session_version=(SELECT original_session_version FROM privacy_erasure_jobs WHERE operation_id=?1) AND ${purposeCurrent} AND ${accepted}`,
 `UPDATE pending SET consumed_at=COALESCE(consumed_at,(SELECT created_at FROM privacy_erasure_jobs WHERE operation_id=?1)),consumed_source='lifecycle-retiring' WHERE id IN(SELECT id FROM pending WHERE discord_id=?2 ORDER BY id LIMIT 100) AND ${profileCurrent} AND ${accepted}`,
 `UPDATE invite_queue SET status='cancelled',claimed_by=NULL,claimed_at=NULL WHERE id IN(SELECT id FROM invite_queue WHERE discord_id=?2 AND status IN('queued','written','invited') ORDER BY id LIMIT 100) AND ${profileCurrent} AND ${accepted}`,
 `DELETE FROM roster_effects WHERE rowid IN(SELECT rowid FROM roster_effects WHERE discord_id=?2 ORDER BY rowid LIMIT 100) AND ${profileCurrent} AND ${accepted}`,
 `INSERT INTO privacy_erasure_progress(operation_id,ordinal,store_key,state,held_reason) SELECT ?1,s.ordinal,s.store_key,s.state,s.held_reason FROM (${steps}) s WHERE ${purposeCurrent} AND ${profileCurrent} AND ${accepted}`,
 `INSERT INTO privacy_external_outbox(operation_id,effect_key,subject,account_generation,epoch,state,held_reason,expires_at) SELECT ?1,'guild-member-remove',?2,?3,?4,'held','writer_restore_identity_retention_unadopted',?9 WHERE changes()=${STORE_CATALOG.length} AND ${purposeCurrent} AND ${profileCurrent} AND ${accepted}`,
 // Invalid completion value deliberately violates the authored CHECK, rolling back
 // the ENTIRE native batch after an accepted claim whose dependents were refused.
 `UPDATE privacy_erasure_jobs AS j SET completion_admitted=CASE WHEN changes()=1 AND ${purposeCurrent} AND ${profileCurrent} AND ${accepted} AND (SELECT COUNT(*) FROM privacy_erasure_progress WHERE operation_id=?1)=${STORE_CATALOG.length} AND EXISTS(SELECT 1 FROM privacy_external_outbox WHERE operation_id=?1 AND effect_key='guild-member-remove' AND subject=?2 AND account_generation=?3 AND epoch=?4 AND state='held' AND expires_at=?9) THEN 1 ELSE 2 END WHERE j.operation_id=?1 AND j.subject=?2 AND j.account_generation=?3 AND j.request_digest=?5 AND j.claim_nonce=?11 AND j.completion_admitted=0`,
 `SELECT CASE WHEN changes()=1 AND ${completed} AND ${SCHEMA_CURRENT_SQL} THEN 1 ELSE ${FAILED_POSTCONDITION} END AS checked`
 ];
 try {
 if(!await catalogMatchesSchema(db))return result(ref,'unclassified_schema',budget.used,'refused');
 confirmLifecycleBatch(await db.batch(queries.map(sql=>db.prepare(sql).bind(...v))),queries.length);
 }catch{
 const observed=await readStatus(db,ref,budget,completed,v);
 if(observed.reason==='operation_identity_mismatch')return observed;
 return observed.status==='refused'||observed.reason==='readback_unavailable'||observed.reason==='unclassified_schema'?result(ref,'commit_outcome_unknown',budget.used):observed;
 }
 return readStatus(db,ref,budget,completed,v);
}

/** DDL is additive and contains no seed/account minting. Runtime schema application does not adopt this library. */
export const ACCOUNT_LIFECYCLE_DDL = [
 `CREATE TABLE IF NOT EXISTS site_login_flows (
 state_hash TEXT NOT NULL PRIMARY KEY CHECK(length(state_hash)=64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
 pkce_digest TEXT NOT NULL CHECK(length(pkce_digest)=64 AND pkce_digest NOT GLOB '*[^0-9a-f]*'),
 epoch TEXT NOT NULL CHECK(length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 control_revision INTEGER NOT NULL CHECK(control_revision BETWEEN 0 AND 9007199254740989),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+600),
 state TEXT NOT NULL CHECK(state IN('pending','consuming','writing','completed')),
 callback_nonce TEXT CHECK(callback_nonce IS NULL OR (length(callback_nonce)=32 AND callback_nonce NOT GLOB '*[^0-9a-f]*')),
 subject TEXT CHECK(subject IS NULL OR (length(subject) BETWEEN 17 AND 20 AND subject NOT GLOB '*[^0-9]*')),
 receipt_digest TEXT CHECK(receipt_digest IS NULL OR (length(receipt_digest)=64 AND receipt_digest NOT GLOB '*[^0-9a-f]*')),
 account_generation TEXT CHECK(account_generation IS NULL OR (length(account_generation)=32 AND account_generation NOT GLOB '*[^0-9a-f]*')),
 purpose_generation TEXT CHECK(purpose_generation IS NULL OR (length(purpose_generation)=32 AND purpose_generation NOT GLOB '*[^0-9a-f]*')),
 session_version INTEGER CHECK(session_version IS NULL OR session_version BETWEEN 1 AND 9007199254740990),
 account_revision INTEGER CHECK(account_revision IS NULL OR account_revision BETWEEN 0 AND 9007199254740990),
 accepted_at INTEGER,
 committed_at INTEGER,
 CHECK((state='pending' AND callback_nonce IS NULL AND subject IS NULL AND receipt_digest IS NULL AND account_generation IS NULL AND purpose_generation IS NULL AND session_version IS NULL AND account_revision IS NULL AND accepted_at IS NULL AND committed_at IS NULL)
 OR (state='consuming' AND callback_nonce IS NOT NULL AND subject IS NULL AND receipt_digest IS NULL AND account_generation IS NULL AND purpose_generation IS NULL AND session_version IS NULL AND account_revision IS NULL AND accepted_at IS NULL AND committed_at IS NULL)
 OR (state IN('writing','completed') AND callback_nonce IS NOT NULL AND subject IS NOT NULL AND receipt_digest IS NOT NULL AND account_generation IS NOT NULL AND purpose_generation IS NOT NULL AND session_version IS NOT NULL AND account_revision IS NOT NULL AND accepted_at IS NOT NULL AND accepted_at>=created_at AND accepted_at<expires_at AND ((state='writing' AND committed_at IS NULL) OR (state='completed' AND committed_at IS NOT NULL AND committed_at=accepted_at))))
)`,
 `CREATE INDEX IF NOT EXISTS site_login_flow_expiry ON site_login_flows(expires_at,state_hash)`,
 `CREATE TABLE IF NOT EXISTS generation_control(singleton INT NOT NULL PRIMARY KEY CHECK(singleton=1),epoch TEXT NOT NULL CHECK(length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),restore_hold INTEGER NOT NULL CHECK(restore_hold IN(0,1)),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0))`,
 `CREATE TABLE IF NOT EXISTS account_generations(account_id TEXT NOT NULL PRIMARY KEY CHECK(length(account_id) BETWEEN 17 AND 20 AND account_id NOT GLOB '*[^0-9]*'),generation TEXT NOT NULL CHECK(length(generation)=32 AND generation NOT GLOB '*[^0-9a-f]*'),state TEXT NOT NULL CHECK(state IN('active','retiring','retired')),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),provenance_kind TEXT NOT NULL CHECK(provenance_kind IN('reviewed-legacy','verified-new')),provenance_digest TEXT NOT NULL CHECK(length(provenance_digest)=64 AND provenance_digest NOT GLOB '*[^0-9a-f]*'))`,
 `CREATE TABLE IF NOT EXISTS account_purpose_generations(account_id TEXT NOT NULL REFERENCES account_generations(account_id),account_generation TEXT NOT NULL CHECK(length(account_generation)=32 AND account_generation NOT GLOB '*[^0-9a-f]*'),purpose TEXT NOT NULL CHECK(purpose IN('account_write','role_grant','role_remove','erasure','beta_reset','restore','bot_post','privacy_identity','privacy_export','privacy_site_erase','privacy_full_erase','privacy_bnet_unlink')),generation TEXT NOT NULL CHECK(length(generation)=32 AND generation NOT GLOB '*[^0-9a-f]*'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),updated_at INTEGER NOT NULL,PRIMARY KEY(account_id,purpose))`,
 `CREATE TABLE IF NOT EXISTS privacy_erasure_jobs(operation_id TEXT NOT NULL PRIMARY KEY CHECK(length(operation_id)=32 AND operation_id NOT GLOB '*[^0-9a-f]*'),subject TEXT NOT NULL REFERENCES account_generations(account_id),account_generation TEXT NOT NULL,epoch TEXT NOT NULL,request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),catalog_version TEXT NOT NULL,catalog_digest TEXT NOT NULL CHECK(length(catalog_digest)=64),cleanup_generation TEXT NOT NULL CHECK(length(cleanup_generation)=32),claim_nonce TEXT NOT NULL CHECK(length(claim_nonce)=32),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+86400),control_revision INTEGER NOT NULL CHECK(control_revision BETWEEN 0 AND 9007199254740989),original_session_version INTEGER NOT NULL CHECK(original_session_version BETWEEN 1 AND 9007199254740990),completion_admitted INTEGER NOT NULL DEFAULT 0 CHECK(completion_admitted IN(0,1)))`,
 `CREATE TABLE IF NOT EXISTS privacy_erasure_progress(operation_id TEXT NOT NULL REFERENCES privacy_erasure_jobs(operation_id) ON DELETE CASCADE,ordinal INTEGER NOT NULL CHECK(ordinal>=0 AND ordinal<54),store_key TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('pending','held','done')),held_reason TEXT NOT NULL,cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor>=0),high_water INTEGER CHECK(high_water IS NULL OR high_water>=0),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),claim_nonce TEXT,purged_rows INTEGER NOT NULL DEFAULT 0 CHECK(purged_rows>=0),PRIMARY KEY(operation_id,store_key),UNIQUE(operation_id,ordinal))`,
 `CREATE TABLE IF NOT EXISTS privacy_external_outbox(operation_id TEXT NOT NULL REFERENCES privacy_erasure_jobs(operation_id) ON DELETE CASCADE,effect_key TEXT NOT NULL CHECK(effect_key='guild-member-remove'),subject TEXT NOT NULL,account_generation TEXT NOT NULL,epoch TEXT NOT NULL,state TEXT NOT NULL CHECK(state='held'),held_reason TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(operation_id,effect_key))`,
 `CREATE INDEX IF NOT EXISTS privacy_erasure_expiry ON privacy_erasure_jobs(expires_at,operation_id)`,
 `CREATE INDEX IF NOT EXISTS privacy_erasure_pending ON privacy_erasure_progress(operation_id,state,ordinal)`,
 `CREATE INDEX IF NOT EXISTS privacy_external_expiry ON privacy_external_outbox(expires_at,operation_id)`,
] as const;

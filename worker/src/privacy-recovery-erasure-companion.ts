/** Private independent recovery facts. Never a raw account, credential, staff note or new denial clock.
 * The existing suppression journal remains exactly sixteen fields. This separate row is associated
 * before its source terminal batch and committed in the SAME independent suppression transaction. */
import type {FloorStorage} from './privacy-recovery-floor';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
const NOW="CAST(strftime('%s','now') AS INTEGER)",REPLAY=31622400;
/** Separate private DO inventory; it is not a serving account-copy store or a new denial event. */
export const ORIGINAL_RECOVERY_COMPANION_INVENTORY=Object.freeze({
 store:'recovery_suppression_companion',location:'configured independent recovery Durable Object',
 purpose:'same-original erasure commit and closed recovery birth/rejection continuity',
 persistedFields:Object.freeze(['operation_id','source_digest','birth_kind','birth_digest','marker_state','marker_key_digest','original_marker_key','original_rejected_at','marker_retain_until','state','native_result_digest','replay_retain_until']),
 rawDiscordIdStored:false,rawAccountBirthNonceStored:false,staffTextStored:false,credentialsStored:false,
 rejectionFactsDeadline:'original_rejected_at + 31536000; never renewed',
 erasureReplayDeadline:'original Native erased_at + 31622400; never renewed',
 expiryMechanism:'original Native clock predicates and actual original Durable Object storage alarm',
 missingOriginalCompanionOrChangedBirthOrOriginalActiveMarkerKey:'held; never reconstructed',servingAccountCopyIncluded:false,
 sourcePrepared:true,nativeQualified:false,providerQualified:false,
});
export const SUPPRESSION_COMPANION_DDL=`CREATE TABLE recovery_suppression_companion(
 operation_id TEXT PRIMARY KEY REFERENCES recovery_suppression_journal(operation_id),
 source_digest TEXT CHECK(source_digest IS NULL OR(length(source_digest)=64 AND source_digest NOT GLOB '*[^0-9a-f]*')),
 birth_kind TEXT NOT NULL CHECK(birth_kind IN('site','absence','expired')),
 birth_digest TEXT CHECK(birth_digest IS NULL OR(length(birth_digest)=64 AND birth_digest NOT GLOB '*[^0-9a-f]*')),
 marker_state TEXT NOT NULL CHECK(marker_state IN('none','active','expired')),
 marker_key_digest TEXT CHECK(marker_key_digest IS NULL OR(length(marker_key_digest)=64 AND marker_key_digest NOT GLOB '*[^0-9a-f]*')),
 original_marker_key TEXT CHECK(original_marker_key IS NULL OR(typeof(original_marker_key)='text' AND length(original_marker_key)=43 AND length(CAST(original_marker_key AS BLOB))=43 AND original_marker_key NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(original_marker_key,43,1) IN('A','E','I','M','Q','U','Y','c','g','k','o','s','w','0','4','8'))),
 original_rejected_at INTEGER,marker_retain_until INTEGER,
 state TEXT NOT NULL CHECK(state IN('reserved','committed','expired')),
 native_result_digest TEXT CHECK(native_result_digest IS NULL OR(length(native_result_digest)=64 AND native_result_digest NOT GLOB '*[^0-9a-f]*')),
 replay_retain_until INTEGER NOT NULL CHECK(typeof(replay_retain_until)='integer' AND replay_retain_until>0),
 CHECK((marker_state='active' AND source_digest IS NOT NULL AND marker_key_digest IS NOT NULL AND original_marker_key IS NOT NULL AND typeof(original_rejected_at)='integer' AND original_rejected_at>0 AND typeof(marker_retain_until)='integer' AND marker_retain_until=original_rejected_at+31536000)
  OR(marker_state IN('none','expired') AND original_marker_key IS NULL AND original_rejected_at IS NULL AND marker_retain_until IS NULL AND(marker_state='none' OR marker_key_digest IS NULL))),
 CHECK((state='reserved' AND source_digest IS NOT NULL AND birth_kind IN('site','absence') AND birth_digest IS NOT NULL AND native_result_digest IS NULL)
  OR(state='committed' AND birth_kind IN('site','absence') AND birth_digest IS NOT NULL AND native_result_digest IS NOT NULL)
  OR(state='expired' AND source_digest IS NULL AND birth_kind='expired' AND birth_digest IS NULL AND marker_state='expired' AND marker_key_digest IS NULL AND original_rejected_at IS NULL AND marker_retain_until IS NULL)))`;
export const SUPPRESSION_COMPANION_SQL='json_array(operation_id,source_digest,birth_kind,birth_digest,marker_state,marker_key_digest,original_rejected_at,marker_retain_until,state,native_result_digest,replay_retain_until)';
export const SUPPRESSION_COMPANION_JOIN_SQL='json_array(c.operation_id,c.source_digest,c.birth_kind,c.birth_digest,c.marker_state,c.marker_key_digest,c.original_rejected_at,c.marker_retain_until,c.state,c.native_result_digest,c.replay_retain_until)';
const refuse=():never=>{throw Error('independent_recovery_companion_held');};
function scalar(row:unknown,key:string):unknown{if(!row||typeof row!=='object')return refuse();const d=Object.getOwnPropertyDescriptor(row,key);if(!d||!Object.hasOwn(d,'value'))return refuse();return d.value;}
function rows(storage:FloorStorage,sql:string,...values:(string|number|null)[]):Record<string,unknown>[]{return storage.sql.exec(sql,...values).toArray();}
function schema(storage:FloorStorage):void{const r=rows(storage,"SELECT type,name,sql FROM sqlite_master WHERE name='recovery_suppression_companion' OR(tbl_name='recovery_suppression_companion' AND sql IS NOT NULL AND type IN('index','trigger'))");if(r.length!==1||scalar(r[0],'type')!=='table'||scalar(r[0],'name')!=='recovery_suppression_companion'||scalar(r[0],'sql')!==SUPPRESSION_COMPANION_DDL)return refuse();}
/** Native clock and fixed predicates only. Redaction changes the original independent action sequence,
 * invalidating any earlier captured recovery page; it never changes either rejection or replay deadline. */
export function redactOriginalSuppressionCompanionFacts(storage:FloorStorage):number{
 schema(storage);
 const due=`(state IN('reserved','committed') AND marker_state='active' AND marker_retain_until<=${NOW}) OR(state IN('reserved','committed') AND replay_retain_until<=${NOW})`;
 const selected=rows(storage,`SELECT operation_id FROM recovery_suppression_companion WHERE ${due} ORDER BY replay_retain_until,operation_id LIMIT 100`);
 if(!selected.length)return 0;
 const changed=rows(storage,`UPDATE recovery_suppression_companion SET
 source_digest=CASE WHEN state='committed' AND marker_state='active' AND marker_retain_until<=${NOW} OR replay_retain_until<=${NOW} THEN NULL ELSE source_digest END,
 birth_kind=CASE WHEN replay_retain_until<=${NOW} THEN 'expired' ELSE birth_kind END,
 birth_digest=CASE WHEN replay_retain_until<=${NOW} THEN NULL ELSE birth_digest END,
 marker_state='expired',marker_key_digest=NULL,original_marker_key=NULL,original_rejected_at=NULL,marker_retain_until=NULL,
 state=CASE WHEN replay_retain_until<=${NOW} THEN 'expired' ELSE state END
 WHERE operation_id IN(SELECT operation_id FROM recovery_suppression_companion WHERE ${due} ORDER BY replay_retain_until,operation_id LIMIT 100) RETURNING operation_id`);
 if(changed.length!==selected.length)return refuse();
 const sequence=rows(storage,"UPDATE recovery_suppression_control SET action_sequence=action_sequence+1 WHERE singleton=1 AND action_sequence<9007199254740991 RETURNING action_sequence");if(sequence.length!==1)return refuse();
 return changed.length;
}
type Alarm=Readonly<{receiver:object;fn:Function;check:()=>void}>;
function originalAlarm(storage:FloorStorage):Alarm{let p:object|null=storage;const chain:{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,'setAlarm'),next=Object.getPrototypeOf(p);chain.push({ref:p,prototype:next,descriptor:d?Object.freeze({...d}):undefined});if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return refuse();const check=()=>{let at:object|null=storage;for(const s of chain){const now=Object.getOwnPropertyDescriptor(s.ref,'setAlarm');if(at!==s.ref||Object.getPrototypeOf(s.ref)!==s.prototype||(s.descriptor?(!now||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(now[k as keyof PropertyDescriptor],s.descriptor![k as keyof PropertyDescriptor]))):now!==undefined))return refuse();at=s.prototype;}};check();return Object.freeze({receiver:storage,fn:d.value,check});}p=next;}return refuse();}
/** An actual original DO storage alarm is required for NEW companion custody. No caller boolean fallback. */
export async function armOriginalSuppressionCompanionAlarm(storage:FloorStorage):Promise<void>{
 schema(storage);const r=rows(storage,`SELECT MIN(at) AS next_at FROM(SELECT marker_retain_until AS at FROM recovery_suppression_companion WHERE state IN('reserved','committed') AND marker_state='active' UNION ALL SELECT replay_retain_until AS at FROM recovery_suppression_companion WHERE state IN('reserved','committed'))`);
 if(r.length!==1)return refuse();const at=scalar(r[0],'next_at');if(at===null)return;
 if(typeof at!=='number'||!Number.isSafeInteger(at)||at<1||at>253402300799)return refuse();const alarm=originalAlarm(storage),before=originalRecoveryClockMilliseconds(),when=Math.max(before+1,at*1000);if(!Number.isSafeInteger(when))return refuse();
 alarm.check();await Reflect.apply(alarm.fn,alarm.receiver,[when]);alarm.check();if(originalRecoveryClockMilliseconds()<before)return refuse();schema(storage);
}
/** Actual Durable Object alarm entry; no authenticated request, arbitrary row or caller deadline. */
export async function runOriginalSuppressionCompanionAlarm(storage:FloorStorage):Promise<void>{storage.transactionSync(()=>redactOriginalSuppressionCompanionFacts(storage));await armOriginalSuppressionCompanionAlarm(storage);}

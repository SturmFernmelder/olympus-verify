/** Source-selected roster service, not a website session or a new scheduled job (10 October 2026).
 * Root's existing worklist owns account rotation and reserves membership plus this whole account before entry.
 * Only fresh qualified roster facts can create new intents; spent/unknown effects are GET-only forever.
 */
import type { CallBudget } from './roles';
import type { QrEnv } from './qr-phase1';
import { queueRosterRankRoles,settleRosterRankAbsences,settleRoleIntent,type Settlement } from './role-settlements';

export const RANK_CONTINUATION_HTTP_RESERVE=20;
export const RANK_CONTINUATION_SQL_RESERVE=35;
export const RANK_CONTINUATION_EFFECT_LIMIT=2;
type Capture=Readonly<{subjectGeneration:string|null}>;
export type RankContinuation=Readonly<{
 state:'done'|'pending'|'held'|'budget';reason:string;rotate:true;visited:number;closedAbsent:number;
 pending:number|null;unknown:number|null;held:number|null;attempts:number;outcomes:readonly Settlement[];
}>;
const ID=/^\d{17,20}$/,GEN=/^[0-9a-f]{32}$/;
/** Debit each actual central-writer request immediately, even when it throws or compensates.
 * The dynamic limit also sees other users of the shared parent during an await; no copied budget can overdraw it.
 */
function childBudget(parent:CallBudget):CallBudget {
 let attempts=0,calls=0,retries=0;
 return {
  get limit(){return Math.min(RANK_CONTINUATION_HTTP_RESERVE,attempts+Math.max(0,parent.limit-parent.attempts));},
  get attempts(){return attempts;},set attempts(value:number){const delta=value-attempts;if(!Number.isSafeInteger(value)||delta<0||value>RANK_CONTINUATION_HTTP_RESERVE||delta>parent.limit-parent.attempts){parent.exhausted=true;throw Error('shared_role_budget');}parent.attempts+=delta;attempts=value;},
  get calls(){return calls;},set calls(value:number){parent.calls+=value-calls;calls=value;},
  get retries(){return retries;},set retries(value:number){parent.retries+=value-retries;retries=value;},
  exhausted:false,audited:false,inventoryFailed:false
 };
}
export async function continueRosterRanks(env:QrEnv,subject:string,snapshotId:number,capture:Capture,parent:CallBudget):Promise<RankContinuation> {
 const empty=(state:RankContinuation['state'],reason:string):RankContinuation=>({state,reason,rotate:true,visited:0,closedAbsent:0,pending:0,unknown:0,held:0,attempts:0,outcomes:[]});
 if(env.QR_RANK_MAPPING_ENABLED!=='true'&&env.QR_PRIVILEGED_RANK_MAPPING_ENABLED!=='true')return empty('held','rank_mapping_disabled');
 if(typeof subject!=='string'||!ID.test(subject)||!Number.isSafeInteger(snapshotId)||snapshotId<1||!capture||!Object.prototype.hasOwnProperty.call(capture,'subjectGeneration')||capture.subjectGeneration!==null&&(typeof capture.subjectGeneration!=='string'||!GEN.test(capture.subjectGeneration)))return empty('held','original_generation_required');
 if(!parent||!Number.isSafeInteger(parent.limit)||!Number.isSafeInteger(parent.attempts)||parent.attempts<0||parent.limit<parent.attempts||!Number.isSafeInteger(parent.calls)||!Number.isSafeInteger(parent.retries))return empty('held','shared_budget_required');
 if(parent.limit-parent.attempts<RANK_CONTINUATION_HTTP_RESERVE){parent.exhausted=true;return empty('budget','whole_account_reservation_required');}
 const b=childBudget(parent),outcomes:Settlement[]=[];let closedAbsent=0,sourceHeld=false,budgetHeld=false;
 try{
 try{await queueRosterRankRoles(env,subject,snapshotId,capture.subjectGeneration);}catch{sourceHeld=true;}
 // The lookup fence is repeated by every receipt/effect. An unknown older dispatch gets only an outcome GET.
 try{if(!sourceHeld){const absence=await settleRosterRankAbsences(env,subject,snapshotId,capture.subjectGeneration,b);closedAbsent=absence.closed;if(absence.state==='held')sourceHeld=true;}}
 catch{sourceHeld=true;}
 const rows=await env.DB.prepare(`SELECT id,state,attempts FROM role_settlements WHERE subject=?1 AND subject_generation IS ?3 AND guild_id=?4
 AND purpose IN('roster_native_rank','roster_privileged_rank') AND ((roster_id=?2 AND state='pending' AND attempts=0)
 OR (roster_id<=?2 AND state IN('dispatching','unknown') AND attempts=1))
 ORDER BY CASE WHEN attempts=1 THEN 0 ELSE 1 END,desired,created_at,id LIMIT 2`).bind(subject,snapshotId,capture.subjectGeneration,env.GUILD_ID).all<{id:string;state:string;attempts:number}>();
 for(const row of rows.results){if(b.limit-b.attempts<8){parent.exhausted=true;budgetHeld=true;break;}
  try{const r=await settleRoleIntent(env,row.id,row.attempts===1||row.state==='unknown'||row.state==='dispatching',undefined,b);outcomes.push(r);
   if(r.state==='unknown')break;}catch{outcomes.push({state:'held',reason:'central_settlement_failed',operationId:row.id,checkedAt:null});}
 }
 const counts=await env.DB.prepare(`SELECT COALESCE(SUM(state='pending'),0) AS pending,COALESCE(SUM(state IN('dispatching','unknown')),0) AS unknown,
 COALESCE(SUM(state='held'),0) AS held FROM role_settlements WHERE subject=?1 AND subject_generation IS ?3 AND guild_id=?4
 AND purpose IN('roster_native_rank','roster_privileged_rank') AND (roster_id=?2 OR (roster_id<=?2 AND attempts=1 AND state IN('dispatching','unknown')))`)
 .bind(subject,snapshotId,capture.subjectGeneration,env.GUILD_ID).first<{pending:number;unknown:number;held:number}>();
 const pending=counts?.pending||0,unknown=counts?.unknown||0,held=counts?.held||0;
 const state:RankContinuation['state']=budgetHeld?'budget':sourceHeld||unknown||held||outcomes.some(r=>r.state!=='settled')?'held':pending?'pending':'done';
 return {state,reason:budgetHeld?'effect_reservation_required':sourceHeld?'current_source_held':unknown?'provider_outcome_held':held||outcomes.some(r=>r.state!=='settled')?'target_held':pending?'bounded_continuation':'rank_receipts_complete',rotate:true,visited:outcomes.length,closedAbsent,pending,unknown,held,attempts:b.attempts,outcomes};
 }catch{
  // An unreadable local ledger is not an empty ledger. Rotate this account with an explicit hold, never retry HTTP.
  return {state:'held',reason:'source_or_receipt_unavailable',rotate:true,visited:outcomes.length,closedAbsent,pending:null,unknown:null,held:null,attempts:b.attempts,outcomes};
 }
}

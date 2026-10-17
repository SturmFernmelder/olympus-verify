/** Fresh-role lanes (Revision 4, Q2): one shared Discord-request allowance per invocation.
 * laneChildBudget has childBudget's semantics (role-rank-continuation.ts:21-30) with an explicit per-lane cap.
 * Only the CallBudget type is imported; role-settlements.ts never imports this module, so there is no cycle.
 */
import type { CallBudget } from './roles';

export const LANE_CHILD_CAP_MAX=20;
export const FRESH_GRANT_CHILD_CAP=20;
export const FRESH_REMOVAL_CHILD_CAP=19;
export const FRESH_CAUSE_CHILD_CAP=20;
export const STAFF_CHILD_CAP=20;
/** What the shared parent can still admit. Admission never reads `exhausted`: the legacy sweep may already have set it
 * on the same parent (restore.ts:316-317, roles.ts:116-118) while requests remain. An unreadable parent admits nothing.
 */
export function laneRoom(parent:CallBudget):number{
 if(!parent||!Number.isSafeInteger(parent.limit)||!Number.isSafeInteger(parent.attempts))return 0;
 return Math.max(0,parent.limit-parent.attempts);
}
/** Debit each actual request to the parent immediately, even when it throws or compensates.
 * The dynamic limit also sees other users of the shared parent during an await; no copied budget can overdraw it.
 */
export function laneChildBudget(parent:CallBudget,cap:number):CallBudget{
 if(!Number.isSafeInteger(cap)||cap<1||cap>LANE_CHILD_CAP_MAX)throw Error('lane_child_cap');
 let attempts=0,calls=0,retries=0;
 return {
  get limit(){return Math.min(cap,attempts+Math.max(0,parent.limit-parent.attempts));},
  get attempts(){return attempts;},set attempts(value:number){const delta=value-attempts;if(!Number.isSafeInteger(value)||delta<0||value>cap||delta>parent.limit-parent.attempts){parent.exhausted=true;throw Error('shared_role_budget');}parent.attempts+=delta;attempts=value;},
  get calls(){return calls;},set calls(value:number){parent.calls+=value-calls;calls=value;},
  get retries(){return retries;},set retries(value:number){parent.retries+=value-retries;retries=value;},
  exhausted:false,audited:false,inventoryFailed:false
 };
}

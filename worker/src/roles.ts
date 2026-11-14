/**
 * .55 (1 Oct 2026): the one place the Guild Member role is granted (tracker A02 "one role writer", D04 "restrictions
 * prevent initial, repeated and restore grants"; Codex's coverage matrix of 1 Oct 00:00 UTC).
 *
 * Every grant path (roster promotion, /verify-status and the guide's restore, the sweep, the backfill) comes through
 * grantMemberRole, which reads the member's current roles when the caller does not already have them, refuses while a
 * blocking role (BLOCKING_ROLE_IDS: Quarantine, Flagellant in Asmongold's server) is held, and makes the one addRole
 * call. The sweep also takes the role away while a blocking role is held (removeIfBlocked) and gives it back on a later
 * pass once the restriction is lifted. A ban (interactions.ts) is the only other remover. New feature modules read
 * membership facts; they never call addRole or removeRole.
 *
 * .114 (2 Oct 2026, Viktor's item 9): a rename Blizzard required. When a site administrator marks one (rename-review.ts),
 * the member applies again and the character is verified again: revokeForReapply takes Guild Member away once, at that
 * decision (the one remover added since .55, named here so the contract stays complete), and every grant is held ("held")
 * while the account has a rename_holds row in state 'reapply', until an administrator approves the new application or
 * withdraws the decision; both only where no other current member character of the account supports the role
 * (reapplyHeld). A grant's PUT that lands after a hold is undone like one after a ban, and held accounts join the sweep's
 * banned reconciliation.
 *
 * Fail closed on configuration (.58, Codex's role-boundary probes, 1 Oct 01:35 UTC): the guild's roles are read and
 * kept ten minutes per isolate, keyed by the guild and the configured role ids, so a changed configuration is read
 * afresh; when ROLE_GUILD_MEMBER is not among them no grant is attempted ("misconfigured"); when the read itself fails
 * nothing is granted either ("unverified"), the failure is not cached, and the next request tries again. A transient
 * refusal during a Discord outage is the truthful answer; the sweep retries on its own.
 *
 * Fresh at the effect (.58, .60): whatever roles a caller already holds (an interaction payload, a sweep's lookup), the
 * writer re-reads the member from Discord and then, after that await, the ban from D1, immediately before addRole; and
 * after addRole it reads the ban once more: a ban that landed during the write is undone on the spot (the role removed,
 * `role.revoked_after_ban`), and a removal that fails is recorded (`role.revoke_pending`) for the sweep. The sweep
 * (restore.ts) also reconciles banned accounts every run: a banned member still holding Guild Member loses it
 * (`role.revoked_banned`), bounded per run, so a late PUT that landed after a ban is undone within a sweep, not left
 * held (Codex's .58 probes, 1 Oct 01:56 UTC). A read and a write on two providers are still two steps; a restriction
 * applied in the milliseconds between them can be missed once and is corrected by the next sweep. That bounded
 * residual is named here rather than claimed away; no cross-provider atomicity is promised.
 */
import type { Env } from "./env";
import { intVar } from "./env";
import { audit, now, type PrivacyReference } from "./db";
import { addRole, DiscordError, guildMember, removeRole, rest, type AttemptBudget } from "./discord";
import { membershipSettlementEnabled as durableServingRoles,membershipTransitionEnabled,membershipTargetsCurrent,type MembershipTargets } from './membership-role-transition';
import { privacyCaptureFromColumns } from './privacy-serving-authority';
import { BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS,captureBetaRemovalDispatch,captureBetaRoleDispatch,betaRoleDispatchHeld,betaGrantDispatchHeld,betaSourceEpochState,type BetaRoleDispatch,type BetaRemovalDispatchCapture } from './beta-reset-policy';
import { captureLaunchVerification,assertLaunchMembershipMode,launchMembershipCurrent,LaunchVerificationHeld,type LaunchMembershipSource } from './launch-verification227';
import type { OriginalConsumedMembership230 } from './ingest';
import { oldSharedMemberProducerHeld230 } from './shared-membership-cutover230';
import { captureCanonicalRankConfig233 } from './canonical-ranks233';

function assertLegacyMemberDispatch230(env:Env,role:string):void {
  if(oldSharedMemberProducerHeld230(env,env.GUILD_ID,role))throw Error('shared_member230_old_producer_held');
}

export const blockingRoleIds = (env: Env): string[] =>
  (env.BLOCKING_ROLE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{17,20}$/.test(s));

/** The first blocking role among `roles`, or null. */
export function heldBlockingRole(env: Env, roles: readonly string[]): string | null {
  const blocking = blockingRoleIds(env);
  if (!blocking.length) return null;
  for (const r of roles) if (blocking.includes(r)) return r;
  return null;
}

export type GrantOutcome = "granted" | "has-role" | "blocked" | "banned" | "held" | "unknown" | "not-in-server" | "no-role" | "misconfigured" | "unverified" | "budget";

/**
 * .90 (P-20, 1 Oct 2026): the Discord calls one role-writing RUN may make: a sweep, a roster export's promotions, a manual
 * sync, a batch of join events, a backfill page. The free plan allows 50 subrequests per invocation; the default leaves
 * room for the run's own other reads. A run that reaches its budget stops where it is and says so once
 * (`role.budget_exhausted`); what it left undone is picked up by the next run (the sweep's rotation resumes at the last
 * account it finished; a promotion's deferred grant is restored by the sweep). A single interaction's grant
 * (restoreMemberRole) carries no budget: it makes two or three calls. Never a role change on its own.
 *
 * .95 (Codex's review of .90, 1 Oct 08:15 UTC): the budget bounds REQUESTS, not logical calls: the 429 retry inside
 * discord.ts rest() is counted (and refused when the run cannot afford it, unless the call is a mandatory removal), the
 * guild-roles inventory read is counted when it is actually made (never while the ten-minute copy is valid; a run that
 * asked in vain does not ask again), and the removal a grant may owe after a ban is reserved before the PUT and counted.
 * Every caller reserves a whole account before its first request (`affords`: two requests per call, the retry included),
 * so a stop never leaves an account half-handled. Receipts distinguish `attempts` (requests), `calls` and `retries`.
 */
export interface CallBudget extends AttemptBudget {
  /** requests this run may make to Discord through the role writer (ROLE_CALL_BUDGET, 4..50) */
  limit: number;
  /** .95: requests made: every call's first request and every 429 retry */
  attempts: number;
  /** .95: logical calls begun (a look, an inventory read, a grant, a removal) */
  calls: number;
  /** .95: 429 retries made, each one a request */
  retries: number;
  exhausted: boolean;
  audited: boolean;
  /** .95: this run asked Discord for the guild's roles once and got no answer: it does not ask again (the next run does) */
  inventoryFailed: boolean;
}
export const CALL_BUDGET_DEFAULT = 40;
export const callBudget = (env: Env): CallBudget => ({ limit: Math.min(50, Math.max(4, intVar(env.ROLE_CALL_BUDGET, CALL_BUDGET_DEFAULT))), attempts: 0, calls: 0, retries: 0, exhausted: false, audited: false, inventoryFailed: false });
/** .95: what `calls` logical calls may cost in requests: each may be retried once after a 429 (discord.ts rest). */
export const reserve = (calls: number) => 2 * calls;
/** .95: whether the run can still afford `calls` logical calls with their retries. Without a budget: always. */
export const affords = (budget: CallBudget | undefined, calls: number): boolean => !budget || budget.limit - budget.attempts >= reserve(calls);
/** Begin one logical call (its first request); false (and the budget marked exhausted) when no request is left. Without a budget: unbounded. */
export function takeCall(budget: CallBudget | undefined): boolean {
  if (!budget) return true;
  if (budget.attempts >= budget.limit) {
    budget.exhausted = true;
    return false;
  }
  budget.attempts++;
  budget.calls++;
  return true;
}
/** .95: a mandatory call (a removal after a ban, or while a restriction is held) is counted whatever is left and never skipped; its caller reserved it. */
export function takeMandatory(budget: CallBudget | undefined): void {
  if (!budget) return;
  budget.attempts++;
  budget.calls++;
}
/** The calls a grant may make after the caller's own look: the writer's fresh look, the PUT, the mandatory removal after a ban (.95). */
export const GRANT_CALLS = 3;
/** Says so once per run; the caller stops. The receipt distinguishes requests, logical calls and retries (.95). */
export async function budgetExhausted(env: Env, budget: CallBudget, source: string): Promise<"budget"> {
  budget.exhausted = true;
  if (!budget.audited) {
    budget.audited = true;
    await audit(env, "system", "role.budget_exhausted", source, { attempts: budget.attempts, calls: budget.calls, retries: budget.retries, limit: budget.limit });
  }
  return "budget";
}

/**
 * Grant Guild Member to `userId` unless something says no. `roles` a caller already holds are a hint for its own
 * bookkeeping only: the decision is made on a fresh member read and a fresh ban read, immediately before the write.
 * Throws what addRole throws, so every caller keeps its own failure handling and audit.
 */
export async function grantMemberRole(env: Env, userId: string, reason: string, source: string, _roles?: readonly string[], budget?: CallBudget, generationCapture?:{subjectGeneration:string|null;membershipContext?:Readonly<{central:boolean;targets:MembershipTargets|null}>;launchSource?:LaunchMembershipSource;originalConsumed230?:OriginalConsumedMembership230},originalDispatch?:BetaRoleDispatch): Promise<GrantOutcome> {
  const launchMode=captureLaunchVerification(env);
  if(launchMode.mode==='held'||launchMode.mode==='members-only'&&!durableServingRoles(env))return 'held';
  // A fresh consumed Native request has its own source-qualified venue. It never
  // reinterprets a beta purpose or supplies authority to any ordinary restoration.
  const consumed230=generationCapture?.originalConsumed230;
  if(consumed230){
    const selectedGeneration=generationCapture!.subjectGeneration,selectedSource=generationCapture!.launchSource;
    let centralStarted=false;
    try{
      const original=await import('./ingest'),cap=consumed230;
      original.assertConsumed230Original(env,cap);const facts=original.consumed230Facts(cap);
      if(facts.subject!==userId||facts.subjectGeneration!==selectedGeneration||facts.source!==selectedSource)return 'held';
      const venue=await (await import('./shared-membership-cutover230')).captureRuntimeVenue230(env);
      original.assertConsumed230Original(env,cap);if(venue.mode!=='enabled')return 'held';
      const central=await import('./role-settlements');centralStarted=true;
      const r=await central.queueAndSettleLaunchMembership230(env,cap,venue.venue,budget);
      return r.state==='settled'?(r.reason==='fresh_server_confirmed'?'has-role':'granted'):r.state==='unknown'?'unknown':r.reason==='role_request_budget'?'budget':'held';
    }catch{return centralStarted?'unknown':'held';}
  }
  if(oldSharedMemberProducerHeld230(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return 'held';
  const dispatch=originalDispatch??captureBetaRoleDispatch(env),removalDispatch=dispatch.capture;
  if(betaGrantDispatchHeld(env,dispatch,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return 'held';
  // .152: an optional backfill selection stays original across this writer's own awaits. Other callers retain their existing contract.
  const originalCapture=generationCapture===undefined?undefined:Object.freeze({subjectGeneration:generationCapture.subjectGeneration});
  const launchSource=generationCapture?.launchSource;
  const launchCurrent=()=>launchSource?launchMembershipCurrent(env,launchSource):Promise.resolve(true);
  const launchBeforeDispatch=()=>{if(!launchMode.current())throw new LaunchVerificationHeld();if(launchSource)assertLaunchMembershipMode(env,launchSource);assertLegacyMemberDispatch230(env,env.ROLE_GUILD_MEMBER);};
  if(launchSource&&!await launchCurrent())return 'held';
  const context=generationCapture?.membershipContext;
  const originalContext=context===undefined?undefined:Object.freeze({central:context.central,targets:context.targets===null?null:Object.freeze({guild:context.targets.guild,current:context.targets.current,retired:context.targets.retired,transition:context.targets.transition})});
  const originalMembershipCurrent=()=>launchMode.current()&&(originalContext===undefined||durableServingRoles(env)===originalContext.central&&(!originalContext.central||originalContext.targets!==null&&membershipTargetsCurrent(env,originalContext.targets)));
  if(!originalMembershipCurrent())return 'held';
  // The old beta source epoch expires independently of the bulk-removal activation flag.
  // This fixed-scope fast gate leaves unrelated guilds and roles unchanged; the policy module
  // revalidates the exact scope and configuration before deciding anything.
  const betaSourceTarget=env.GUILD_ID===BETA_RESET_GUILD_ID&&BETA_RESET_ROLE_IDS.includes(env.ROLE_GUILD_MEMBER);
  // Capture once before any writer/provider await;
  // a policy armed or changed later is never substituted for this original capture.
  const betaFlag=Object.getOwnPropertyDescriptor(env,'BETA_RESET_REMOVALS_ENABLED');
  const betaSelected=betaFlag?!Object.hasOwn(betaFlag,'value')||betaFlag.value!==undefined&&betaFlag.value!=='false':'BETA_RESET_REMOVALS_ENABLED' in env;
  const betaPolicy=betaSelected||betaSourceTarget?await import('./beta-reset-policy'):null;
  const betaCapture=betaPolicy?await betaPolicy.captureBetaGrant(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER,dispatch):null;
  if(betaCapture?.mode==='held')return 'held';
  if(durableServingRoles(env)){
    // The serving caller passes its ORIGINAL selection/cookie capture. Missing authority is never repaired by reading a new generation.
    if(!originalCapture)return 'held';
    try{const central=await import('./role-settlements'),snapshot=launchSource?{id:launchSource.snapshotId}:await env.DB.prepare('SELECT MAX(id) AS id FROM roster_snapshots').first<{id:number}>();
      if(!originalMembershipCurrent()||betaCapture&&betaPolicy&&!await betaPolicy.betaGrantCurrent(env,betaCapture))return 'held';
      const operation=await central.queueRosterMembershipRole(env,userId,snapshot?.id??0,originalCapture.subjectGeneration,dispatch);
      if(betaCapture&&betaPolicy&&!await betaPolicy.betaGrantCurrent(env,betaCapture))return 'held';
      if(launchSource&&!await launchCurrent())return 'held';
      const r=await central.settleRoleIntent(env,operation,false,undefined,budget,betaCapture??undefined,dispatch,launchSource);
      return r.state==='settled'?(r.reason==='fresh_server_confirmed'?'has-role':'granted'):r.reason==='role_request_budget'?'budget':'held';
    }catch{return 'held';}
  }
  const role = env.ROLE_GUILD_MEMBER;
  if (!role) return "no-role";
  // .95: the whole grant reserved before its first request: the inventory read when it is due, the fresh look, the PUT and
  // the mandatory removal after a ban, each with its possible 429 retry, so the budget never half-handles an account
  if (!affords(budget, GRANT_CALLS + inventoryCalls(env, budget))) return budgetExhausted(env, budget!, source);
  const configured = await rolesConfigured(env, budget);
  if (configured === "budget") return budgetExhausted(env, budget!, source); // unreachable after the reservation; kept so a changed cost can never half-handle an account
  if (configured === "missing") {
    await audit(env, "system", "role.misconfigured", userId, { source, role });
    return "misconfigured";
  }
  if (configured === "unknown") return "unverified"; // the inventory could not be read: nothing is granted, nothing cached
  if (!takeCall(budget)) return budgetExhausted(env, budget!, source); // .90: the run's budget, before each Discord call
  const m = await guildMember(env, userId, budget);
  if(launchSource&&!await launchCurrent())return 'held';
  if(!originalMembershipCurrent())return 'held';
  if(betaGrantDispatchHeld(env,dispatch,env.GUILD_ID,role))return 'held';
  if (!m) return "not-in-server";
  const blocker = heldBlockingRole(env, m.roles);
  if (blocker) {
    await audit(env, "system", "role.blocked", userId, { source, blockedBy: blocker });
    return "blocked";
  }
  if (m.roles.includes(role)) return "has-role";
  // .60: the ban is read AFTER the member await, as the last thing before the write
  if (await isBanned(env, userId)) return "banned";
  // .114: and the reapply hold (a rename Blizzard required), from D1 with the ban
  if (await reapplyHeld(env, userId)) {
    await audit(env, "system", "role.held_reapply", userId, { source });
    return "held";
  }
  if(launchSource&&!await launchCurrent())return 'held';
  // .95: the PUT and the removal it may owe, reserved together before the PUT
  if (!affords(budget, 2)) return budgetExhausted(env, budget!, source);
  if(!originalMembershipCurrent())return 'held';
  if(betaGrantDispatchHeld(env,dispatch,env.GUILD_ID,role))return 'held';
  if(betaCapture?.mode==='open'){
    // The old beta writer has no request-bound native source callback. Restricted
    // launch proofs use the central writer above; never broaden this historical path.
    if(launchSource)return 'held';
    const guarded=await import('./beta-reset-grants'),receipt=await guarded.beginBetaLegacyGrant(env,betaCapture,userId);
    if(!receipt||await guarded.dispatchBetaLegacyGrant(env,receipt,reason,budget)!=='granted')return 'held';
  }else{
    if (!takeCall(budget)) return budgetExhausted(env, budget!, source);
    await addRole(env, userId, role, reason, budget,launchBeforeDispatch);
    launchBeforeDispatch?.();
  }
  // .60: and once more after the write: a ban that landed while the PUT was in flight is undone here, not left held
  if (await isBanned(env, userId)) {
    takeMandatory(budget); // .95: reserved above, counted here, never skipped
    await revokeForBan(env, userId, role, `${source}:after-grant`, budget, undefined, removalDispatch,dispatch);
    return "banned";
  }
  // .114 (Codex, log 18:47 UTC): the reapply hold the same way: a hold stored, and its one-time removal done, while this PUT
  // was in flight would otherwise be undone by the PUT landing last. The sweep's reconciliation (reconcileBanned) covers a
  // removal that fails here.
  if (await reapplyHeld(env, userId)) {
    takeMandatory(budget); // the same reserved removal; only one of the two can be needed
    await revokeHeld(env, userId, role, `${source}:after-grant`, removalDispatch, budget,undefined,dispatch);
    return "held";
  }
  return "granted";
}

const isBanned = async (env: Env, userId: string): Promise<boolean> =>
  !!(await env.DB.prepare("SELECT banned FROM members WHERE discord_id = ?1").bind(userId).first<{ banned: number }>())?.banned;

/**
 * .114: an account an administrator asked to apply again after a rename Blizzard required (rename-review.ts), whose Guild
 * Member no other character supports: held while a hold is open and none of the account's OTHER characters (another name
 * key, and not the same GUID) is a current member (Codex, log 18:47 and 19:17 UTC: a legitimate member character keeps
 * the role; the renamed one still has to be verified again and the member still applies again).
 */
export const reapplyHeld = async (env: Env, userId: string): Promise<boolean> =>
  !!(await env.DB.prepare(
    // a supporting character is a current member that NO open hold of the account names, by key or by GUID (Codex, log
    // 19:51 UTC: two held characters must not count as each other's support); either match excludes it, the cautious side
    `SELECT 1 AS held FROM rename_holds h WHERE h.discord_id = ?1 AND h.state = 'reapply'
       AND NOT EXISTS (SELECT 1 FROM characters c WHERE c.discord_id = ?1 AND c.status IN ('member','left_pending')
                       AND NOT EXISTS (SELECT 1 FROM rename_holds h2 WHERE h2.discord_id = ?1 AND h2.state = 'reapply'
                                       AND (c.name_key = h2.char_key OR (h2.guid IS NOT NULL AND c.guid = h2.guid))))
     LIMIT 1`,
  ).bind(userId).first<{ held: number }>());

/**
 * .114: take Guild Member away at the moment an administrator marks a rename as required by Blizzard. Called once by
 * rename-review.ts after the hold is stored, so no grant can follow it. A member without the role, or outside the server,
 * needs nothing; a failed removal is recorded (`role.revoke_pending`) and reported to the administrator, who removes the
 * role by hand: the account may have no roster character left for the sweep to visit, and the hold keeps it from coming back.
 */
export async function revokeForReapply(env: Env, userId: string, source: string, generationCapture?:{subjectGeneration:string|null},originalDispatch?:BetaRoleDispatch): Promise<"removed" | "not-held" | "failed"> {
  const dispatch=originalDispatch??captureBetaRoleDispatch(env),removalDispatch=dispatch.capture;
  const held=()=>betaRoleDispatchHeld(env,dispatch,env.GUILD_ID,env.ROLE_GUILD_MEMBER);
  if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return 'failed';
  if(durableServingRoles(env)){const central=await import('./role-settlements');if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return 'failed';const r=await central.settleMembershipRemoval(env,userId,'rename_hold',generationCapture,undefined,dispatch);return r.state==='settled'?'removed':r.reason==='removal_cause_withdrawn'?'not-held':'failed';}
  if(held()||oldSharedMemberProducerHeld230(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return 'failed';
  const role = env.ROLE_GUILD_MEMBER;
  if (!role) return "not-held";
  let m: Awaited<ReturnType<typeof guildMember>>;
  try {
    m = await guildMember(env, userId);
  } catch (e) {
    await audit(env, "system", "role.revoke_pending", userId, { source, error: e instanceof DiscordError ? `read ${e.status}` : "read failed" });
    return "failed";
  }
  if (!m || !m.roles.includes(role)) return "not-held";
  // .114 (Codex, log 18:47 and 19:17 UTC): the hold is read again after the member GET, at the effect: a hold withdrawn,
  // or another member character confirmed, while that read was in flight is not followed by a stale removal
  if (!(await reapplyHeld(env, userId))) return "not-held";
  return (await revokeHeld(env, userId, role, source, removalDispatch,undefined,undefined,dispatch)) ? "removed" : "failed";
}

/** .114: remove Guild Member from an account under a reapply hold; a failure is recorded as pending for the sweep's reconciliation. */
async function revokeHeld(env: Env, userId: string, role: string, source: string, removalDispatch: BetaRemovalDispatchCapture, budget?: CallBudget, generationCapture?:{subjectGeneration:string|null},originalDispatch?:BetaRoleDispatch): Promise<boolean> {
  const dispatch=originalDispatch??{env,capture:removalDispatch},held=()=>betaRoleDispatchHeld(env,dispatch,env.GUILD_ID,role);
  if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return false;
  if(durableServingRoles(env)){if(role!==env.ROLE_GUILD_MEMBER)return false;const central=await import('./role-settlements');if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return false;return (await central.settleMembershipRemoval(env,userId,'rename_hold',generationCapture,budget,dispatch)).state==='settled';}
  if(held()||oldSharedMemberProducerHeld230(env,env.GUILD_ID,role))return false;
  try {
    await removeRole(env, userId, role, "olympus-verify: a rename Blizzard required; the account applies again", budget, true,()=>assertLegacyMemberDispatch230(env,role));
    await audit(env, "system", source.endsWith(":after-grant") ? "role.revoked_after_hold" : "role.revoked_reapply", userId, { source });
    return true;
  } catch (e) {
    await audit(env, "system", "role.revoke_pending", userId, { source, error: e instanceof DiscordError ? `remove ${e.status}` : "remove failed" });
    return false;
  }
}

/**
 * .60: take Guild Member away from a banned account. A failed removal is recorded as pending; the sweep's banned
 * reconciliation (restore.ts) retries it on its next run, and a 403 there stops that run like any other grant failure.
 */
export async function revokeForBan(env: Env, userId: string, role: string, source: string, budget?: CallBudget, generationCapture?:{subjectGeneration:string|null}, removalDispatch: BetaRemovalDispatchCapture=captureBetaRemovalDispatch(env),originalDispatch?:BetaRoleDispatch): Promise<boolean> {
  const dispatch=originalDispatch??{env,capture:removalDispatch},held=()=>betaRoleDispatchHeld(env,dispatch,env.GUILD_ID,role);
  if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return false;
  if(durableServingRoles(env)){if(role!==env.ROLE_GUILD_MEMBER)return false;const central=await import('./role-settlements');if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return false;return (await central.settleMembershipRemoval(env,userId,'ban',generationCapture,budget,dispatch)).state==='settled';}
  if(held()||oldSharedMemberProducerHeld230(env,env.GUILD_ID,role))return false;
  try {
    await removeRole(env, userId, role, "olympus-verify: banned from verifying; Guild Member removed", budget, true,()=>assertLegacyMemberDispatch230(env,role)); // .95: mandatory: its retry is never refused
    await audit(env, "system", source.endsWith(":after-grant") ? "role.revoked_after_ban" : "role.revoked_banned", userId, { source });
    return true;
  } catch (e) {
    await audit(env, "system", "role.revoke_pending", userId, { source, error: e instanceof DiscordError ? `remove ${e.status}` : "remove failed" });
    return false;
  }
}

/**
 * .60/.63: banned accounts that may still hold Guild Member: the sweep checks up to `limit` of them per run, in discord
 * id order after `after` (a rotation of its own), and removes the role where held. Returns the ids checked, the ids
 * revoked, and the cursor for the next run.
 *
 * .63 (Codex's review of .60, 1 Oct 02:23 UTC): EVERY banned account is eligible, whatever its characters' status. .60
 * required a `member`/`left_pending` character, but a failed role removal does not stop roster.demote committing `left`
 * (roster.ts audits and swallows its own removal error), so a banned holder whose character then left the roster was
 * excluded from every future sweep and kept the role. And the ban is read AGAIN after the awaited member GET: an unban
 * that completes during that read must not be followed by a removal of a role the account may now hold.
 */
type BannedSweepReferences280=Readonly<{cursor:string;retained:boolean;references:readonly PrivacyReference[];held:boolean}>;
const bannedSweepReferences280=new WeakMap<object,{env:Env;check:()=>void;facts:BannedSweepReferences280}>();
/** Original selected-row references for the passive sweep audit only. No role
 * authority or raw generations are added to the public reconciliation result. */
export function readBannedSweepReferences280(env:Env,result:object):BannedSweepReferences280{
 const source=bannedSweepReferences280.get(result);if(!source||source.env!==env)throw Error('banned_sweep_reference_source_held');source.check();return source.facts;
}
export async function reconcileBanned(env: Env, after: string, limit: number, budget?: CallBudget,originalDispatch?:BetaRoleDispatch): Promise<{ checked: string[]; revoked: string[]; held: string[]; failed: string[]; cursor: string; rank: boolean; remaining: number; observed: number }> {
  const dispatch=originalDispatch??captureBetaRoleDispatch(env),removalDispatch=dispatch.capture;
  const captureGeneration=membershipTransitionEnabled(env)||durableServingRoles(env);
  const role = env.ROLE_GUILD_MEMBER;
  // remaining: rank roles a standing ban still has to lose after this run's visit (one per run; REV-BAN-1, 12 Nov 2026).
  // observed (successor, 12 Nov 2026): unresolved ban rank-role rows whose role a visit's read showed absent. Observation
  // data for the sweep audit only; no row is changed and nothing reads it as authority.
  const out = { checked: [] as string[], revoked: [] as string[], held: [] as string[], failed: [] as string[], cursor: after, rank: false, remaining: 0, observed: 0 };
  // Passive audit references only: capture them from the same selected rows before
  // any provider await. They never alter a role writer's original generation rules.
  const selectedReferences280=new Map<string,PrivacyReference>();
  const originalDB280=Object.getOwnPropertyDescriptor(env,'DB'),originalProto280=Object.getPrototypeOf(env);
  const finish=()=>{
    const cursor=out.cursor,checked=Object.freeze([...out.checked]);
    const subjects=[...new Set([...checked,...(cursor&&cursor!==after?[cursor]:[])])];
    const references=Object.freeze(subjects.flatMap(id=>selectedReferences280.has(id)?[selectedReferences280.get(id)!]:[]));
    const held=subjects.some(id=>!selectedReferences280.has(id));
    const cd=Object.getOwnPropertyDescriptor(out,'cursor'),qd=Object.getOwnPropertyDescriptor(out,'checked'),qa=out.checked,qp=Object.getPrototypeOf(out.checked),items=checked.map((_,i)=>Object.getOwnPropertyDescriptor(out.checked,String(i)));
    const sameDescriptor=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>!!a&&!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
    bannedSweepReferences280.set(out,{env,check:()=>{
      if(Object.getPrototypeOf(env)!==originalProto280||!sameDescriptor(originalDB280,Object.getOwnPropertyDescriptor(env,'DB'))||!originalDB280||!Object.hasOwn(originalDB280,'value')||
       !sameDescriptor(cd,Object.getOwnPropertyDescriptor(out,'cursor'))||!sameDescriptor(qd,Object.getOwnPropertyDescriptor(out,'checked'))||out.cursor!==cursor||out.checked!==qa||qa.length!==checked.length||Object.getPrototypeOf(qa)!==qp||checked.some((_,i)=>!sameDescriptor(items[i],Object.getOwnPropertyDescriptor(qa,String(i)))))throw Error('banned_sweep_reference_source_held');
    },facts:Object.freeze({cursor,retained:cursor===after,references,held})});
    return out;
  };
  if (!role) return finish();
  // .114: accounts under a reapply hold (a rename Blizzard required) join the same rotation: a removal that failed at the
  // decision, or a grant that landed after it, is undone here (Codex, log 18:47 UTC)
  // Owner ruling, 12 Nov 2026: with the canonical ranks selected, a standing ban's rank roles (all 18 fixed IDs, manual
  // grants included) go through the one source-owned ban writer, one DELETE per visit; the old Guild Member remover is
  // not run against the same role. Rename holds keep their own path below.
  const canonicalBan=captureCanonicalRankConfig233(env).present;
  const central=canonicalBan?await import('./role-settlements'):null;
  // Repair round, 12 Nov 2026: an account with an expired unresolved ban rank-role row joins the rotation after an unban,
  // for a GET-only visit (observeBanRankDebt1112). Successor, 12 Nov 2026: that visit only observes. The row stays
  // unresolved and keeps fencing its role for that member until an attended resolution exists.
  const debt=central?` UNION SELECT s.subject FROM role_settlements s WHERE s.purpose='${central.BAN_RANK_PURPOSE1112}' AND s.desired=0 AND s.attempts=1 AND s.state IN('dispatching','unknown') AND s.expires_at<=CAST(strftime('%s','now') AS INTEGER)`:'';
  // Retired subjects keep ban/debt safety rows, but cannot supply a current
  // passive cursor reference. Skip them in the original selection, as the
  // ordinary rotation does, rather than stalling later standing bans.
  const rows = await env.DB.prepare(
    `SELECT selected.discord_id,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision
      FROM (SELECT m.discord_id FROM members m WHERE m.banned = 1 UNION SELECT h.discord_id FROM rename_holds h WHERE h.state = 'reapply'${debt}) selected
      LEFT JOIN privacy_subjects p ON p.subject_id=selected.discord_id WHERE selected.discord_id > ?1 ${captureGeneration?"AND (p.state IS NULL OR p.state='active')":''} ORDER BY selected.discord_id LIMIT ?2`,
  ).bind(after, limit).all<{ discord_id: string;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null }>();
  // Fill passive references for the complete original selection before any
  // provider await. Effect admission keeps its existing per-row checks below.
  for (const r of rows.results) {
    try{selectedReferences280.set(r.discord_id,Object.freeze({subject:r.discord_id,capture:privacyCaptureFromColumns(r.discord_id,r)}));}
    catch{/* An inactive/malformed passive reference holds publication, not ban safety. */}
  }
  let stopped = false;
  for (const r of rows.results) {
    if(captureGeneration&&r.privacy_state&&r.privacy_state!=='active'){out.failed.push(r.discord_id);out.cursor=r.discord_id;continue;}
    const originalCapture=captureGeneration?privacyCaptureFromColumns(r.discord_id,r):undefined;
    const generation=originalCapture===undefined?undefined:originalCapture?.subjectGeneration??null;
    if(central&&await isBanned(env,r.discord_id)){
      if(!budget||budget.limit-budget.attempts<central.BAN_RANK1112_MIN_REQUESTS){if(budget)await budgetExhausted(env,budget,"sweep:banned");stopped=true;break;}
      const before=out.cursor;out.cursor=r.discord_id;
      const banned=await central.removeBanRankRoles1112(env,r.discord_id,{kind:'sweep'},generation,budget,dispatch);
      out.checked.push(r.discord_id);out.rank=true;out.observed+=banned.observed;
      if(banned.removed.length)out.revoked.push(r.discord_id);
      // Follow-up REV-BAN-1, 12 Nov 2026: a visit that removed a role and only left the rest for later runs is progress,
      // not a failure ("revoke failed" in the sweep audit). Any held or unconfirmed role, or a visit that removed
      // nothing, is still reported as failed.
      const progressing=banned.removed.length>0&&!banned.held.length&&!banned.unknown.length;
      if(banned.state!=='settled'&&!progressing)out.failed.push(r.discord_id);
      // Repair round, 12 Nov 2026: a standing ban stays at the head of the rotation while each visit removes a role and
      // admitted roles remain, so its rank roles go one per run instead of one per pass over every banned account. A
      // visit that removes nothing (a 429, an unknown outcome, a hold) rotates on, so no account can stall the others.
      if(banned.removed.length&&banned.deferred.length){out.remaining+=banned.deferred.length;out.cursor=before;stopped=true;break;}
      continue;
    }
    if(central&&budget&&!(await reapplyHeld(env,r.discord_id))){
      // Not banned (any more) and no rename hold: only an expired unresolved ban rank-role row brought it here.
      const before=out.cursor;out.cursor=r.discord_id;
      const seen=await central.observeBanRankDebt1112(env,r.discord_id,generation,budget);
      out.checked.push(r.discord_id);out.observed+=seen.observed;if(seen.state==='held'&&seen.reason==='role_request_budget'){out.cursor=before;stopped=true;break;}
      continue;
    }
    // .90: a look and possibly a removal: stop before an account the run's budget cannot finish, the cursor at the last one done
    if ((membershipTransitionEnabled(env)?!!budget&&budget.limit-budget.attempts<17:!affords(budget, 2)) || !takeCall(budget)) {
      await budgetExhausted(env, budget!, "sweep:banned");
      stopped = true;
      break;
    }
    out.cursor = r.discord_id;
    let member: Awaited<ReturnType<typeof guildMember>>;
    try {
      member = await guildMember(env, r.discord_id, budget);
    } catch {
      out.failed.push(r.discord_id);
      continue;
    }
    out.checked.push(r.discord_id);
    if (!member || !membershipTransitionEnabled(env)&&!member.roles.includes(role)) continue;
    if (await isBanned(env, r.discord_id)) {
      if(!durableServingRoles(env))takeMandatory(budget); // Central requests account for themselves; legacy removal includes its reserved retry.
      if (await revokeForBan(env, r.discord_id, role, "sweep:banned", budget,originalCapture===undefined?undefined:{subjectGeneration:originalCapture?.subjectGeneration??null},removalDispatch,dispatch)) out.revoked.push(r.discord_id);
      else out.failed.push(r.discord_id);
      continue;
    }
    // .63: unbanned while the member read was in flight: nothing to take away for a ban; .114: unless a reapply hold is open
    if (!(await reapplyHeld(env, r.discord_id))) continue;
    if(!durableServingRoles(env))takeMandatory(budget);
    if (await revokeHeld(env, r.discord_id, role, "sweep:held", removalDispatch,budget,originalCapture===undefined?undefined:{subjectGeneration:originalCapture?.subjectGeneration??null},dispatch)) out.held.push(r.discord_id);
    else out.failed.push(r.discord_id);
  }
  if (!stopped && rows.results.length < limit) out.cursor = ""; // wrap at the end
  return finish();
}

/** While a blocking role is held, Guild Member is taken away. Returns the blocking role id when it did, else null. */
export async function removeIfBlocked(env: Env, userId: string, roles: readonly string[], source: string, budget?: CallBudget, generationCapture?:{subjectGeneration:string|null},originalDispatch?:BetaRoleDispatch): Promise<string | null> {
  const dispatch=originalDispatch??captureBetaRoleDispatch(env),held=()=>betaRoleDispatchHeld(env,dispatch,env.GUILD_ID,env.ROLE_GUILD_MEMBER);
  if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return null;
  if(durableServingRoles(env)){const central=await import('./role-settlements');if(held()&&betaSourceEpochState(dispatch.env,dispatch.capture).mode!=='active')return null;const r=await central.settleMembershipRemoval(env,userId,'blocking_role',generationCapture,budget,dispatch);return r.state==='settled'?'current-server-restriction':null;}
  if(held()||oldSharedMemberProducerHeld230(env,env.GUILD_ID,env.ROLE_GUILD_MEMBER))return null;
  const role = env.ROLE_GUILD_MEMBER;
  if (!role || !roles.includes(role)) return null;
  const blocker = heldBlockingRole(env, roles);
  if (!blocker) return null;
  takeMandatory(budget); // .90/.95: counted (the caller reserved it); a removal while a restriction is held is never skipped
  await removeRole(env, userId, role, "olympus-verify: Guild Member held back while a server restriction is on the account", budget, true,()=>assertLegacyMemberDispatch230(env,role));
  await audit(env, "system", "role.blocked_removed", userId, { source, blockedBy: blocker });
  return blocker;
}

export type RolesCheck = "ok" | "missing" | "unknown";
const CHECK_TTL_S = 600;
/** The guild's role ids as last read, kept ten minutes under the key of the config that read them; a failed read is never kept. */
let cache: { key: string; at: number; state: "ok" | "missing"; ids: Set<string> } | null = null;
const cacheKey = (env: Env) => `${env.GUILD_ID}|${env.ROLE_GUILD_MEMBER}|${blockingRoleIds(env).join(",")}`;
/** Tests only. */
export const forgetRolesCheck = () => {
  cache = null;
};

/** New durable writer: privacy job proof, CAS dispatch and SQL-confirmable absence receipt. */
export async function settleAccountErasureMemberRole(env:Env,proof:import('./role-settlements').ErasureProof) {
  // Item 15: the dispatch mode is captured here, before this export's first await, and threaded to the central writer.
  const removalDispatch=captureBetaRemovalDispatch(env);
  return (await import('./role-settlements')).settleErasure(env,proof,undefined,{env,capture:removalDispatch});
}
/** Departure authority is the original capture plus current last-character roster absence, never an erasure proof.
 * Item 15: the caller's entry capture (roster.ts passes one with the env it was read from) or one taken here before the
 * first await, passed straight to the central writer. This export holds nothing itself: settleMembershipRemoval and
 * settleVerifiedRemoval hold new dispatch on a fixed target (creation, claim and the final pre-effect point, the effect
 * env's own mode descriptor included), while a prior spent guild_departure row is still reconciled GET-only and an
 * existing intent can still settle its ACK-free absent receipt in every mode. A hold is a settlement with reason
 * beta_dispatch_mode_held, which roster.ts audits as role.remove_held. */
export async function settleGuildDepartureRole(env:Env,subject:string,capture:{subjectGeneration:string|null},budget?:AttemptBudget,removalDispatch?:import('./role-settlements').RemovalDispatch) {
  const dispatch=removalDispatch??{env,capture:captureBetaRemovalDispatch(env)};
  return (await import('./role-settlements')).settleMembershipRemoval(env,subject,'guild_departure',capture,budget,dispatch);
}
export async function reconcileAccountErasureRoleDebt(env:Env,proof:import('./role-settlements').ErasureProof) {
  return (await import('./role-settlements')).reconcileAccountErasureRoleDebt(env,proof);
}
export const accountErasureRoleSettledSql=`EXISTS(SELECT 1 FROM role_settlements r WHERE r.id=?1 AND r.subject=?2 AND r.subject_generation=?3 AND r.request_digest=?4
 AND r.purpose='account_erasure' AND r.desired=0 AND r.state='settled' AND r.reason IN('absent','removed')
 AND r.checked_at<=CAST(strftime('%s','now') AS INTEGER) AND r.checked_at>CAST(strftime('%s','now') AS INTEGER)-60)`;

/** The valid ten-minute copy of the guild's roles for this configuration, or null. */
const cachedSnapshot = (env: Env) => {
  const key = cacheKey(env);
  return cache && cache.key === key && now() - cache.at < CHECK_TTL_S ? cache : null;
};
/** .95: the requests a grant's inventory check costs now: none while the copy is valid or this run already asked in vain. */
export const inventoryCalls = (env: Env, budget?: CallBudget): number => (cachedSnapshot(env) || budget?.inventoryFailed ? 0 : 1);

/** Whether ROLE_GUILD_MEMBER exists in GUILD_ID: read at most every ten minutes per isolate and configuration (.95: a request of the run's budget when one is given). */
export async function rolesConfigured(env: Env, budget?: CallBudget): Promise<RolesCheck | "budget"> {
  return (await rolesSnapshot(env, budget)).state;
}

async function rolesSnapshot(env: Env, budget?: CallBudget): Promise<{ state: RolesCheck | "budget"; ids: Set<string> | null }> {
  const hit = cachedSnapshot(env);
  if (hit) return hit;
  if (budget?.inventoryFailed) return { state: "unknown", ids: null }; // .95: asked once this run and unanswered: fail closed without asking again; the next run asks
  if (budget && !takeCall(budget)) return { state: "budget", ids: null }; // .95: the read is a request of this run's budget
  const t = now();
  const key = cacheKey(env);
  try {
    const list = await rest<Array<{ id: string }>>(env, "GET", `/guilds/${env.GUILD_ID}/roles`, undefined, 0, undefined, budget);
    const ids = new Set(Array.isArray(list) ? list.map((r) => r.id) : []);
    const state = !env.ROLE_GUILD_MEMBER || ids.has(env.ROLE_GUILD_MEMBER) ? ("ok" as const) : ("missing" as const);
    cache = { key, at: t, state, ids };
    return cache;
  } catch {
    if (budget) budget.inventoryFailed = true; // .95: this run does not ask again
    return { state: "unknown", ids: null }; // not cached: the next run asks again
  }
}

/** For the watcher's /health: the configured roles against the guild, ids and booleans only. */
export async function rolesStatus(env: Env): Promise<{ guildMember: boolean | null; blocking: string[]; blockingMissing: string[] }> {
  const blocking = blockingRoleIds(env);
  // No configured role is being checked: preserve unknown rather than ask Discord for an unused inventory.
  if (!env.ROLE_GUILD_MEMBER && !env.ROLE_OFFICER && !env.ROLE_MODERATOR && !env.ROLE_GUILD_LEADER && !env.ROLE_GUILD_MASTER && !env.ROLE_RAID_LEADER && !blocking.length) return { guildMember: null, blocking, blockingMissing: [] };
  const snap = await rolesSnapshot(env);
  return { guildMember: snap.state === "unknown" ? null : snap.state === "ok", blocking, blockingMissing: snap.ids ? blocking.filter((id) => !snap.ids!.has(id)) : [] };
}

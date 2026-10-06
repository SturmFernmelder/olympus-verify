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
import { audit, now } from "./db";
import { addRole, DiscordError, guildMember, removeRole, rest, type AttemptBudget } from "./discord";

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

export type GrantOutcome = "granted" | "has-role" | "blocked" | "banned" | "held" | "not-in-server" | "no-role" | "misconfigured" | "unverified" | "budget";

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
export async function grantMemberRole(env: Env, userId: string, reason: string, source: string, _roles?: readonly string[], budget?: CallBudget): Promise<GrantOutcome> {
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
  // .95: the PUT and the removal it may owe, reserved together before the PUT
  if (!affords(budget, 2) || !takeCall(budget)) return budgetExhausted(env, budget!, source);
  await addRole(env, userId, role, reason, budget);
  // .60: and once more after the write: a ban that landed while the PUT was in flight is undone here, not left held
  if (await isBanned(env, userId)) {
    takeMandatory(budget); // .95: reserved above, counted here, never skipped
    await revokeForBan(env, userId, role, `${source}:after-grant`, budget);
    return "banned";
  }
  // .114 (Codex, log 18:47 UTC): the reapply hold the same way: a hold stored, and its one-time removal done, while this PUT
  // was in flight would otherwise be undone by the PUT landing last. The sweep's reconciliation (reconcileBanned) covers a
  // removal that fails here.
  if (await reapplyHeld(env, userId)) {
    takeMandatory(budget); // the same reserved removal; only one of the two can be needed
    await revokeHeld(env, userId, role, `${source}:after-grant`, budget);
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
export async function revokeForReapply(env: Env, userId: string, source: string): Promise<"removed" | "not-held" | "failed"> {
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
  return (await revokeHeld(env, userId, role, source)) ? "removed" : "failed";
}

/** .114: remove Guild Member from an account under a reapply hold; a failure is recorded as pending for the sweep's reconciliation. */
async function revokeHeld(env: Env, userId: string, role: string, source: string, budget?: CallBudget): Promise<boolean> {
  try {
    await removeRole(env, userId, role, "olympus-verify: a rename Blizzard required; the account applies again", budget, true);
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
export async function revokeForBan(env: Env, userId: string, role: string, source: string, budget?: CallBudget): Promise<boolean> {
  try {
    await removeRole(env, userId, role, "olympus-verify: banned from verifying; Guild Member removed", budget, true); // .95: mandatory: its retry is never refused
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
export async function reconcileBanned(env: Env, after: string, limit: number, budget?: CallBudget): Promise<{ checked: string[]; revoked: string[]; held: string[]; failed: string[]; cursor: string }> {
  const role = env.ROLE_GUILD_MEMBER;
  const out = { checked: [] as string[], revoked: [] as string[], held: [] as string[], failed: [] as string[], cursor: after };
  if (!role) return out;
  // .114: accounts under a reapply hold (a rename Blizzard required) join the same rotation: a removal that failed at the
  // decision, or a grant that landed after it, is undone here (Codex, log 18:47 UTC)
  const rows = await env.DB.prepare(
    `SELECT discord_id FROM (SELECT m.discord_id FROM members m WHERE m.banned = 1 UNION SELECT h.discord_id FROM rename_holds h WHERE h.state = 'reapply')
      WHERE discord_id > ?1 ORDER BY discord_id LIMIT ?2`,
  ).bind(after, limit).all<{ discord_id: string }>();
  let stopped = false;
  for (const r of rows.results) {
    // .90: a look and possibly a removal: stop before an account the run's budget cannot finish, the cursor at the last one done
    if (!affords(budget, 2) || !takeCall(budget)) {
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
    if (!member || !member.roles.includes(role)) continue;
    if (await isBanned(env, r.discord_id)) {
      takeMandatory(budget); // counted (the reservation above covers it and its retry); a removal for a ban is never skipped
      if (await revokeForBan(env, r.discord_id, role, "sweep:banned", budget)) out.revoked.push(r.discord_id);
      else out.failed.push(r.discord_id);
      continue;
    }
    // .63: unbanned while the member read was in flight: nothing to take away for a ban; .114: unless a reapply hold is open
    if (!(await reapplyHeld(env, r.discord_id))) continue;
    takeMandatory(budget);
    if (await revokeHeld(env, r.discord_id, role, "sweep:held", budget)) out.held.push(r.discord_id);
    else out.failed.push(r.discord_id);
  }
  if (!stopped && rows.results.length < limit) out.cursor = ""; // wrap at the end
  return out;
}

/** While a blocking role is held, Guild Member is taken away. Returns the blocking role id when it did, else null. */
export async function removeIfBlocked(env: Env, userId: string, roles: readonly string[], source: string, budget?: CallBudget): Promise<string | null> {
  const role = env.ROLE_GUILD_MEMBER;
  if (!role || !roles.includes(role)) return null;
  const blocker = heldBlockingRole(env, roles);
  if (!blocker) return null;
  takeMandatory(budget); // .90/.95: counted (the caller reserved it); a removal while a restriction is held is never skipped
  await removeRole(env, userId, role, "olympus-verify: Guild Member held back while a server restriction is on the account", budget, true);
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

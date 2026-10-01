/**
 * One-off backfill of the Guild Member role.
 *
 * Why this has to exist. promote() is the only thing that grants ROLE_GUILD_MEMBER, and every caller guards it with
 * `status !== "member"` — it fires on the TRANSITION into membership, once. That is correct while the server stays
 * put: a member who already holds the role must not be re-granted it on every roster pass. It becomes a trap the
 * moment GUILD_ID changes, because the role lives in Discord and the status lives in D1. After a move, everyone
 * already at status='member' arrives in the new server with no role, is skipped by every future roster pass for
 * exactly the reason above, and nothing ever fixes them.
 *
 * The tempting shortcut — resetting characters.status in SQL so promote() re-fires — is wrong: it replays welcome
 * notifications, audit rows and log lines for the entire membership, and loses member_since.
 *
 * The second reason to run it (25 Sep 2026): MEE6's role menus can take Guild Member away again in the same moment
 * this bot grants it, because MEE6 writes the whole role list from its own, older copy (see restore.ts). Those
 * members are at status='member' with no role, exactly like the server move, and this finds them the same way.
 *
 * Banned accounts are skipped: /olympus-admin ban removes the role but leaves the characters at 'member' until the
 * in-game kick reaches the roster, and a backfill must not hand the role straight back.
 *
 * Dry by default. Applying is a bulk write against real people's accounts, so it takes an explicit ?apply=1.
 */
import type { Env } from "./env";
import { DiscordError, guildMember } from "./discord";
import { grantMemberRole, heldBlockingRole, callBudget, takeCall, affords, inventoryCalls, GRANT_CALLS } from "./roles";
import { audit } from "./db";

export interface BackfillOptions {
  apply: boolean;
  limit: number;
  after: string;
}

export function backfillOptions(q: URLSearchParams): BackfillOptions {
  const limit = Math.min(200, Math.max(1, parseInt(q.get("limit") ?? "25", 10) || 25));
  const after = (q.get("after") ?? "").replace(/[^0-9]/g, "");
  return { apply: q.get("apply") === "1", limit, after };
}

export async function backfillRoles(env: Env, opts: BackfillOptions) {
  const role = env.ROLE_GUILD_MEMBER;
  if (!role) return { error: "ROLE_GUILD_MEMBER is not set" };

  // Distinct because one Discord account can hold several characters; the role is per account, not per character.
  const total = await env.DB.prepare(
    "SELECT COUNT(DISTINCT discord_id) AS n FROM characters WHERE status = 'member' AND discord_id IS NOT NULL AND discord_id <> '' " +
      "AND NOT EXISTS (SELECT 1 FROM members m WHERE m.discord_id = characters.discord_id AND m.banned = 1)",
  ).first<{ n: number }>();

  const rows = await env.DB.prepare(
    "SELECT DISTINCT discord_id FROM characters WHERE status = 'member' AND discord_id IS NOT NULL AND discord_id <> '' AND discord_id > ?1 " +
      "AND NOT EXISTS (SELECT 1 FROM members m WHERE m.discord_id = characters.discord_id AND m.banned = 1) ORDER BY discord_id LIMIT ?2",
  )
    .bind(opts.after, opts.limit)
    .all<{ discord_id: string }>();

  const granted: string[] = [];
  const already: string[] = [];
  const absent: string[] = [];
  const blocked: string[] = [];
  const wouldGrant: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  let last = opts.after; // .95: the last account finished; `next` continues after it, so a stop never skips an unfinished one
  let examined = 0;
  const calls = callBudget(env); // .90 (P-20): this page's Discord-call budget (.95: it bounds requests, retries included)

  /** One account; "done", or the note to stop the page with (this account not finished: the next page starts at it). */
  const handle = async (r: { discord_id: string }): Promise<"done" | string> => {
    let member: Awaited<ReturnType<typeof guildMember>>;
    try {
      member = await guildMember(env, r.discord_id, calls);
    } catch (e) {
      // .99 (Codex's review of .95, 09:15): a lookup Discord did not answer (403, 500, a network error) is not a finished
      // account: the page stops here, `next` continues AT this account (the last finished one is the cursor), and the
      // operator sees why; a 404 is a definitive answer (not in the server, below) and finishes the account
      const status = e instanceof DiscordError ? String(e.status) : "no answer";
      failed.push({ id: r.discord_id, error: String(e).slice(0, 160) });
      return `stopped: Discord did not answer a member lookup (${status}); run the page again from the cursor once it does`;
    }
    // Not in this server. Expected right after a move for anyone who has not joined the new one yet, so it is
    // reported rather than treated as an error — re-running later picks them up.
    if (!member) {
      absent.push(r.discord_id);
      return "done";
    }
    if (member.roles.includes(role)) {
      already.push(r.discord_id);
      return "done";
    }
    // .55: a held blocking role (Quarantine, Flagellant) is reported and never granted, in the dry run and for real.
    if (heldBlockingRole(env, member.roles)) {
      blocked.push(r.discord_id);
      return "done";
    }
    if (!opts.apply) {
      wouldGrant.push(r.discord_id);
      return "done";
    }
    try {
      const outcome = await grantMemberRole(env, r.discord_id, "olympus-verify: role backfill (member on the roster, role missing)", "backfill", member.roles, calls);
      if (outcome === "budget") return "stopped: this run's Discord-call budget is used up (ROLE_CALL_BUDGET); run the page again from the cursor";
      if (outcome === "misconfigured") return "stopped: ROLE_GUILD_MEMBER is not a role of this server";
      if (outcome === "unverified") return "stopped: the guild's roles could not be read from Discord; run the page again";
      if (outcome === "blocked") {
        blocked.push(r.discord_id);
        return "done";
      }
      if (outcome !== "granted") return "done";
      granted.push(r.discord_id);
      await audit(env, "system", "role.backfilled", r.discord_id, { role });
      // rest() retries a 429 once, which is not enough under a sustained burst against one route. Spacing the
      // grants costs a few seconds per page and keeps the whole pass off Discord's rate limiter.
      await new Promise((res) => setTimeout(res, 200));
      return "done";
    } catch (e) {
      const msg = e instanceof DiscordError ? `${e.status}: ${e.body.slice(0, 120)}` : String(e).slice(0, 160);
      failed.push({ id: r.discord_id, error: msg });
      // 403 here almost always means the bot's own role sits below ROLE_GUILD_MEMBER in the destination server.
      // That is a one-line fix in Discord and it will fail identically for every remaining row, so stop.
      if (e instanceof DiscordError && e.status === 403) return "stopped: Discord refused with 403 — the bot's role is probably below the Guild Member role";
      return "done";
    }
  };

  for (const r of rows.results) {
    // .90/.95: the whole account reserved before its first request (a dry run: the look; applying: the look, then the grant's
    // inventory read when it is due, fresh look, PUT and mandatory removal, each with its possible 429 retry): stop before
    // an account the budget cannot finish, `next` after the last one finished
    const need = opts.apply ? 1 + GRANT_CALLS + inventoryCalls(env, calls) : 1;
    if (!affords(calls, need) || !takeCall(calls)) return summary("stopped: this run's Discord-call budget is used up (ROLE_CALL_BUDGET); run the page again from the cursor", true);
    const outcome = await handle(r);
    if (outcome !== "done") return summary(outcome, true);
    last = r.discord_id;
    examined++;
  }

  /** .95: a page is finished only when every selected account was handled and the page was short; a stop reports the accounts actually examined and continues after the last one finished. */
  function summary(note?: string, stopped = false) {
    const done = !stopped && rows.results.length < opts.limit;
    return {
      apply: opts.apply,
      note: note ?? (opts.apply ? undefined : "dry run — nothing was changed; add &apply=1 to grant"),
      totalMembers: total?.n ?? 0,
      selected: rows.results.length,
      examined,
      granted: granted.length,
      wouldGrant: wouldGrant.length,
      alreadyHad: already.length,
      notInServer: absent.length,
      blocked: blocked.length,
      failed,
      calls: calls.calls,
      attempts: calls.attempts,
      retries: calls.retries,
      cursor: last,
      finished: done,
      // Paging is explicit so one call can never run away across the whole membership unattended.
      next: done ? null : `/admin/backfill-roles?limit=${opts.limit}&after=${last}${opts.apply ? "&apply=1" : ""}`,
      sample: { granted: granted.slice(0, 10), wouldGrant: wouldGrant.slice(0, 10), notInServer: absent.slice(0, 10), blocked: blocked.slice(0, 10) },
    };
  }

  if (opts.apply && granted.length) await audit(env, "system", "role.backfill_page", String(granted.length), { cursor: last });
  return summary();
}

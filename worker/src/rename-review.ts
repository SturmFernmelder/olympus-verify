/**
 * .114 (2 Oct 2026, Viktor's item 9): renames Blizzard required.
 *
 * The roster follows a renamed character by its pinned GUID and keeps the link (roster.ts moveBinding, audited as
 * `roster.renamed` with the old name, the account and the GUID). That stays the rule for an ordinary rename. Nothing in
 * an export says WHY a character was renamed, and a paid or allowed rename must not be punished, so nothing here guesses:
 * a site administrator reads the list (Admin -> Renames) and marks a rename as required by Blizzard. Viktor's rule (relayed
 * by Codex, log 17:57 UTC): such a member applies again, with BOTH a new application that the leadership reviews AND a
 * fresh in-game verification of that character.
 *
 * The decision names exactly one character (Codex, log 19:17 UTC): the one this account holds under the GUID the rename
 * was recorded with, or, when the roster had pinned none, the one bound under the recorded new name; anything else
 * (renamed again, re-bound, unbound, gone, or a record older than RENAMES_WINDOW_DAYS) is refused for a person to sort out
 * by hand. One batch, whose first statement stores the hold only while that character is still bound to the account as it
 * was resolved, and whose other statements require that row's nonce:
 *   - a rename_holds row in state 'reapply' (the account, both names, the character's key and GUID, who decided and when);
 *   - that character is unbound the way /olympus-admin unbind does it (status 'unbound', GUID cleared, its open code
 *     requests used up, its queued invites cancelled), so it has to be verified again with a new code;
 *   - the account's site application is set back to 'withdrawn' with a staff note, so the member submits it anew.
 * Then, outside the batch, Guild Member is removed once (roles.ts revokeForReapply) unless another of the account's current
 * member characters supports it, and the member is pointed privately at /verify-status (dm.ts: the public line only says
 * there is an update). While the row is 'reapply', grants are held (roles.ts reapplyHeld, the same exception).
 *
 * Closing it: 'approved' only once both steps have actually happened after the decision: the member saved the application
 * again (their own audited save), the leadership accepted it (a review after the decision), and the character was verified
 * again in game (a fresh verified_at on the same key or GUID). 'cancelled' when the mark was a mistake: the character stays
 * unbound and is verified again; the application stays withdrawn until saved. A closed row is deleted thirty days after it
 * was closed (sweepRenameHolds, from the cron). Bot data: listed in the member's copy, erased by hand with
 * queries/forget-member.sql. Nothing here reads the reason a name broke Blizzard's rules: there is no such data.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { normalizeCharacter } from "./codes";
import { logLine } from "./discord";
import { notify } from "./dm";
import { revokeForReapply } from "./roles";
import { b64u, forgetBoardCounts } from "./site-core";

/** How far back the list reaches, and how old a rename may be to be decided at all. */
export const RENAMES_WINDOW_DAYS = 120;
const LIST_LIMIT = 200;
/** A closed hold is kept this long after it was closed, then deleted by the cron. */
export const CLOSED_HOLD_DAYS = 30;

export interface RenameItem {
  auditId: number;
  at: number;
  from: string;
  to: string;
  discordId: string;
  username: string | null;
  displayName: string | null;
  hold: { id: number; state: string; decidedAt: number; closedAt: number | null } | null;
}

interface RenameDetails {
  from?: unknown;
  discordId?: unknown;
  guid?: unknown;
}

const parse = (raw: string | null): RenameDetails => {
  try {
    const v = JSON.parse(raw ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as RenameDetails) : {};
  } catch {
    return {};
  }
};
const isId = (v: unknown): v is string => typeof v === "string" && /^\d{17,20}$/.test(v);

/** The roster renames of the last RENAMES_WINDOW_DAYS, newest first, each with its decision if one was made, plus every open hold. */
export async function listRenames(env: Env): Promise<{ renames: RenameItem[]; openHolds: Array<{ id: number; discordId: string; from: string; to: string; decidedAt: number }> }> {
  const since = now() - RENAMES_WINDOW_DAYS * 86400;
  const rows = await env.DB.prepare(
    `SELECT a.id, a.ts, a.subject, a.details, h.id AS hold_id, h.state, h.decided_at, h.closed_at
       FROM audit a LEFT JOIN rename_holds h ON h.audit_id = a.id
      WHERE a.actor = 'system' AND a.action = 'roster.renamed' AND a.ts >= ?1
      ORDER BY a.id DESC LIMIT ?2`,
  )
    .bind(since, LIST_LIMIT)
    .all<{ id: number; ts: number; subject: string | null; details: string | null; hold_id: number | null; state: string | null; decided_at: number | null; closed_at: number | null }>();
  const items: RenameItem[] = [];
  for (const r of rows.results) {
    const d = parse(r.details);
    if (!isId(d.discordId) || typeof d.from !== "string" || !r.subject) continue;
    items.push({
      auditId: r.id,
      at: r.ts,
      from: d.from,
      to: r.subject,
      discordId: d.discordId,
      username: null,
      displayName: null,
      hold: r.hold_id ? { id: r.hold_id, state: r.state ?? "", decidedAt: r.decided_at ?? 0, closedAt: r.closed_at } : null,
    });
  }
  const ids = [...new Set(items.map((i) => i.discordId))];
  if (ids.length) {
    // one bound parameter whatever the list's length (the house rule: under 100 per statement)
    const names = await env.DB.prepare(
      "SELECT discord_id, username, global_name FROM site_users WHERE discord_id IN (SELECT value FROM json_each(?1))",
    )
      .bind(JSON.stringify(ids))
      .all<{ discord_id: string; username: string | null; global_name: string | null }>();
    const by = new Map(names.results.map((n) => [n.discord_id, n]));
    for (const i of items) {
      const n = by.get(i.discordId);
      if (n) {
        i.username = n.username;
        i.displayName = n.global_name;
      }
    }
  }
  const open = await env.DB.prepare("SELECT id, discord_id, old_name, new_name, decided_at FROM rename_holds WHERE state = 'reapply' ORDER BY decided_at DESC LIMIT ?1")
    .bind(LIST_LIMIT)
    .all<{ id: number; discord_id: string; old_name: string; new_name: string; decided_at: number }>();
  return { renames: items, openHolds: open.results.map((h) => ({ id: h.id, discordId: h.discord_id, from: h.old_name, to: h.new_name, decidedAt: h.decided_at })) };
}

export type ForcedResult =
  | { ok: true; holdId: number; role: "removed" | "not-held" | "failed"; unbound: number; applicationWithdrawn: boolean }
  | { ok: false; status: number; error: string; message: string };

const refused = (status: number, error: string, message: string): ForcedResult => ({ ok: false, status, error, message });

/** An administrator marks the rename recorded by audit row `auditId` as required by Blizzard. */
export async function markForcedRename(env: Env, actor: string, auditId: number): Promise<ForcedResult> {
  const row = await env.DB.prepare("SELECT id, ts, subject, details FROM audit WHERE id = ?1 AND actor = 'system' AND action = 'roster.renamed'")
    .bind(auditId)
    .first<{ id: number; ts: number; subject: string | null; details: string | null }>();
  const d = parse(row?.details ?? null);
  if (!row || !row.subject || !isId(d.discordId) || typeof d.from !== "string") return refused(404, "not_found", "That rename is not in the roster's record.");
  if (row.ts < now() - RENAMES_WINDOW_DAYS * 86400) return refused(409, "too_old", `That rename is older than ${RENAMES_WINDOW_DAYS} days; decide it by hand if it still matters.`);
  const existing = await env.DB.prepare("SELECT id FROM rename_holds WHERE audit_id = ?1").bind(auditId).first<{ id: number }>();
  if (existing) return refused(409, "decided", "That rename has already been decided.");
  const discordId = d.discordId;
  const from = d.from.slice(0, 64);
  const to = row.subject.slice(0, 64);
  const guid = typeof d.guid === "string" && d.guid ? d.guid : null;
  // exactly one current character: by the GUID the rename was recorded with, or (none pinned) by the recorded new name
  const found = guid
    ? await env.DB.prepare("SELECT name_key, name FROM characters WHERE discord_id = ?1 AND guid = ?2 AND status NOT IN ('unbound','denied')").bind(discordId, guid).all<{ name_key: string; name: string }>()
    : await env.DB.prepare("SELECT name_key, name FROM characters WHERE discord_id = ?1 AND name_key = ?2 AND guid IS NULL AND status NOT IN ('unbound','denied')").bind(discordId, normalizeCharacter(to)).all<{ name_key: string; name: string }>();
  if (found.results.length !== 1) {
    return refused(409, "unresolved", "The renamed character cannot be found as one current character of this account (renamed again, unbound or re-bound since). Decide it by hand.");
  }
  const target = found.results[0]!;
  const t = now();
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const note = "A rename Blizzard required: the member applies again (a new application and a fresh in-game verification).";
  // every statement after the first requires the row the first one stored, by its nonce
  const mine = (n: number) => `EXISTS (SELECT 1 FROM rename_holds WHERE nonce = ?${n})`;
  let done: D1Result[];
  try {
    done = await env.DB.batch([
      // stored only while the character is still bound to this account exactly as resolved (requalified at the effect)
      env.DB.prepare(
        `INSERT INTO rename_holds (discord_id, old_name, new_name, char_key, guid, nonce, audit_id, state, decided_by, decided_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'reapply', ?8, ?9
          WHERE EXISTS (SELECT 1 FROM characters WHERE name_key = ?4 AND discord_id = ?1 AND status NOT IN ('unbound','denied')
                        AND ((?5 IS NULL AND guid IS NULL) OR guid = ?5))`,
      ).bind(discordId, from, to, target.name_key, guid, nonce, auditId, actor, t),
      env.DB.prepare(`UPDATE characters SET status = 'unbound', left_at = ?3, guid = NULL WHERE name_key = ?1 AND discord_id = ?2 AND ${mine(4)}`).bind(target.name_key, discordId, t, nonce),
      env.DB.prepare(`UPDATE pending SET consumed_at = ?2, consumed_source = 'rename' WHERE name_key = ?1 AND discord_id = ?3 AND consumed_at IS NULL AND ${mine(4)}`).bind(target.name_key, t, discordId, nonce),
      env.DB.prepare(`UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND discord_id = ?2 AND status IN ('queued','written') AND ${mine(3)}`).bind(target.name_key, discordId, nonce),
      env.DB.prepare(
        `UPDATE site_applications SET status = 'withdrawn', admin_note = CASE WHEN admin_note IS NULL OR admin_note = '' THEN ?2 ELSE admin_note || char(10) || ?2 END, updated_at = ?3
          WHERE discord_id = ?1 AND status <> 'withdrawn' AND ${mine(4)}`,
      ).bind(discordId, note, t, nonce),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return refused(409, "decided", "That rename has already been decided.");
    throw e;
  }
  if (!Number(done[0]?.meta?.changes ?? 0)) return refused(409, "changed", "The character changed while this was being decided. Reload the list and decide again.");
  const holdId = Number(done[0]?.meta?.last_row_id ?? 0);
  const unbound = Number(done[1]?.meta?.changes ?? 0);
  const applicationWithdrawn = Number(done[4]?.meta?.changes ?? 0) > 0;
  if (applicationWithdrawn) forgetBoardCounts();
  await audit(env, actor, "rename.forced", target.name, { from, discordId, holdId, unbound, applicationWithdrawn });
  const role = await revokeForReapply(env, discordId, "rename-forced");
  await logLine(env, `\u{1F501} rename: **${from}** → **${target.name}** (<@${discordId}>) marked by a site administrator as required by Blizzard; that character is verified again and the member applies again. Guild Member: ${role === "removed" ? "removed and held until the new application is approved" : role === "failed" ? "could NOT be removed (remove it by hand); held until the new application is approved" : "kept where another member character of the account supports it, otherwise held"}.`);
  await notify(env, discordId, "A rename Blizzard required: run /verify-status.", "rename-reapply");
  return { ok: true, holdId, role, unbound, applicationWithdrawn };
}

export type CloseResult = { ok: true } | { ok: false; status: number; error: string; message: string; missing?: string[] };

/**
 * An administrator closes an open hold. 'approved' needs both of Viktor's steps to have happened after the decision; the
 * check and the update are one statement, so nothing that changes in between can let it through. 'cancelled' (the mark was
 * a mistake) needs nothing.
 */
export async function closeRenameHold(env: Env, actor: string, holdId: number, outcome: "approved" | "cancelled"): Promise<CloseResult> {
  const h = await env.DB.prepare("SELECT discord_id, new_name, char_key, guid, decided_at, state FROM rename_holds WHERE id = ?1")
    .bind(holdId)
    .first<{ discord_id: string; new_name: string; char_key: string; guid: string | null; decided_at: number; state: string }>();
  if (!h || h.state !== "reapply") return { ok: false, status: 409, error: "not_open", message: "That hold is no longer open." };
  const t = now();
  if (outcome === "approved") {
    const missing = await approvalMissing(env, h);
    if (missing.length) return { ok: false, status: 409, error: "not_ready", message: `Not yet: ${missing.join("; ")}.`, missing };
  }
  const r = await env.DB.prepare(
    outcome === "approved"
      ? `UPDATE rename_holds SET state = 'approved', closed_by = ?2, closed_at = ?3 WHERE id = ?1 AND state = 'reapply' AND ${READY_SQL}`
      : "UPDATE rename_holds SET state = 'cancelled', closed_by = ?2, closed_at = ?3 WHERE id = ?1 AND state = 'reapply'",
  )
    .bind(holdId, actor, t)
    .run();
  if (!r.meta.changes) return { ok: false, status: 409, error: "not_open", message: "That hold changed meanwhile. Reload and try again." };
  await audit(env, actor, outcome === "approved" ? "rename.approved" : "rename.cancelled", h.new_name, { discordId: h.discord_id, holdId });
  return { ok: true };
}

// The three facts an approval needs, for the hold row `rename_holds` itself (?1 = its id in the closing UPDATE):
const RESUBMITTED = `EXISTS (SELECT 1 FROM audit a WHERE a.actor = rename_holds.discord_id AND a.action IN ('site.application_submitted','site.application_updated') AND a.ts > rename_holds.decided_at)`;
// accepted after the decision AND after the member's latest save of it (updated_at is the save's time): the reviewed version is
// the current one (Codex, log 19:56 UTC; saveApplication also refuses to overwrite a decided application)
const ACCEPTED = `EXISTS (SELECT 1 FROM site_applications sa WHERE sa.discord_id = rename_holds.discord_id AND sa.status = 'accepted' AND sa.reviewed_at > rename_holds.decided_at AND sa.reviewed_at >= sa.updated_at)`;
// the character's identity: its GUID EXCLUSIVELY when the hold recorded one (a different character verified under a reused
// name is not this one), its name key only for a hold recorded without a GUID (Codex, log 19:51 UTC)
const REVERIFIED = `EXISTS (SELECT 1 FROM characters c WHERE c.discord_id = rename_holds.discord_id AND c.status IN ('verified','queued','member') AND c.verified_at > rename_holds.decided_at AND ((rename_holds.guid IS NOT NULL AND c.guid = rename_holds.guid) OR (rename_holds.guid IS NULL AND c.name_key = rename_holds.char_key)))`;
const READY_SQL = `${RESUBMITTED} AND ${ACCEPTED} AND ${REVERIFIED}`;

/** In words, which of the three facts are still missing (for the administrator; the closing UPDATE checks them again). */
async function approvalMissing(env: Env, h: { discord_id: string; char_key: string; guid: string | null; decided_at: number }): Promise<string[]> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM audit WHERE actor = ?1 AND action IN ('site.application_submitted','site.application_updated') AND ts > ?4) AS resubmitted,
       (SELECT COUNT(*) FROM site_applications WHERE discord_id = ?1 AND status = 'accepted' AND reviewed_at > ?4 AND reviewed_at >= updated_at) AS accepted,
       (SELECT COUNT(*) FROM characters WHERE discord_id = ?1 AND status IN ('verified','queued','member') AND verified_at > ?4 AND ((?3 IS NOT NULL AND guid = ?3) OR (?3 IS NULL AND name_key = ?2))) AS reverified`,
  )
    .bind(h.discord_id, h.char_key, h.guid, h.decided_at)
    .first<{ resubmitted: number; accepted: number; reverified: number }>();
  const missing: string[] = [];
  if (!row?.resubmitted) missing.push("the member has not submitted the application again");
  else if (!row?.accepted) missing.push("the application as the member last saved it has not been accepted (Applications tab)");
  if (!row?.reverified) missing.push(h.guid ? "the renamed character has not been verified again in game (by its in-game identifier, which the roster or the whisper confirms)" : "the renamed character has not been verified again in game");
  return missing;
}

/** The account's open hold, newest first, for /verify-status and the site's Home page. */
export async function openRenameHold(env: Env, discordId: string): Promise<{ from: string; to: string; decidedAt: number } | null> {
  const h = await env.DB.prepare("SELECT old_name, new_name, decided_at FROM rename_holds WHERE discord_id = ?1 AND state = 'reapply' ORDER BY decided_at DESC LIMIT 1")
    .bind(discordId)
    .first<{ old_name: string; new_name: string; decided_at: number }>();
  return h ? { from: h.old_name, to: h.new_name, decidedAt: h.decided_at } : null;
}

/** What /verify-status says while a hold is open. */
export const reapplyText = (h: { from: string; to: string }) =>
  `Blizzard required your character **${h.from}** to be renamed (now **${h.to}**), so Olympus asks you to apply again: save your application on the guild website once more, and verify **${h.to}** again with **Get my code**. Unless another of your characters is in the guild, your Guild Member role is on hold until the leadership approves the new application.`;

/** The cron: closed holds go thirty days after they were closed. Open ones stay until an administrator decides. */
export async function sweepRenameHolds(env: Env): Promise<number> {
  const r = await env.DB.prepare("DELETE FROM rename_holds WHERE state <> 'reapply' AND closed_at IS NOT NULL AND closed_at < ?1").bind(now() - CLOSED_HOLD_DAYS * 86400).run();
  return Number(r.meta?.changes ?? 0);
}

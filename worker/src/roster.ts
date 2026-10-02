/** Roster snapshots and the diff that grants/strips the Guild Member role. The roster is the source of truth. */
import type { Env } from "./env";
import { audit, linksNotBefore, now } from "./db";
import { intVar, officerRankNames, rankCheckExempt, staffChannel, staffRoles } from "./env";
import { normalizeCharacter } from "./codes";
import { explainDiscordError, guildMember, logLine, postMessage, removeRole, setNickname, staffNotice } from "./discord";
import { grantMemberRole, callBudget, type CallBudget } from "./roles";
import { flushNotices, notify, noticeBatch, type NoticeBatch } from "./dm";

export interface RosterMemberIn {
  name: string;
  rank?: string;
  rankIndex?: number;
  level?: number;
  class?: string;
  note?: string;
  officerNote?: string;
  guid?: string;
  lastOnline?: number;
}

const NOTE_RE = /^D:(\d{17,20})$/;

/**
 * How old the newest roster may be and still be believed about who is in the guild right now, when something other
 * than a roster export asks (a code confirmed in game, a join line in the chat log). The newest export is from the
 * officer's last /reload or logout, so a few hours is normal; a roster from days ago, or from before LINKS_NOT_BEFORE
 * (the beta's last export, on launch day), is not evidence about anyone on live. Past this, the next export decides.
 */
export const ROSTER_CURRENT_FOR = 12 * 3600;
/**
 * A GUID is pinned from the stored roster at verification only when the export is this fresh (see postVerify): the
 * roster row is only the character that had the name when it was exported, and the name may have changed hands since.
 * Otherwise the next export pins it.
 */
export const ROSTER_PIN_WITHIN = 600;

export interface RosterEntry {
  name: string;
  guid: string | null;
  exportedAt: number;
}

/** The newest roster's row for a name (its GUID and the export's time included), or null when the name is not on it. */
export async function latestRosterEntry(env: Env, nameKey: string): Promise<RosterEntry | null> {
  return await env.DB.prepare(
    `SELECT rm.name AS name, rm.guid AS guid, s.exported_at AS exportedAt
       FROM roster_members rm JOIN roster_snapshots s ON s.id = rm.snapshot_id
      WHERE rm.name_key = ?1 AND rm.snapshot_id = (SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1)`,
  )
    .bind(nameKey)
    .first<RosterEntry>();
}

/** True when a roster recent enough to speak for the present (ROSTER_CURRENT_FOR, after LINKS_NOT_BEFORE) has the name. */
export function isCurrentRoster(env: Env, e: RosterEntry | null): boolean {
  return !!e && e.exportedAt >= linksNotBefore(env) && now() - e.exportedAt <= ROSTER_CURRENT_FOR;
}

/** The name is in the guild according to a current roster (see isCurrentRoster). */
export async function onLatestRoster(env: Env, nameKey: string): Promise<boolean> {
  return isCurrentRoster(env, await latestRosterEntry(env, nameKey));
}

// ---------- GUID-pinned links (27 Sep 2026) ----------
// A link used to be a character NAME. Names are not identities: a character can be renamed (Blizzard is already
// forcing renames on beta characters that break the naming policy), deleted and recreated, and -- if beta characters
// do not carry over to live -- taken by someone else entirely. So the GUID the roster export carries is pinned the
// first time a link meets a roster, and after that the link follows the GUID rather than the name.

interface BoundRow {
  name_key: string;
  name: string;
  discord_id: string;
  status: string;
  guid: string | null;
  bound_at: number;
}

/** A GUID as an export gives it: a non-empty string, or nothing. A number or a table from a damaged file is nothing. */
export function guidOf(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type Release = { c: BoundRow; rosterGuid: string | null; why: "namesake" | "stale" };

/**
 * Let go of a link that belongs to a different character than the one now on the roster under that name. The role
 * goes the usual way (demote keeps it while another linked character is still in the guild), then the name is freed
 * so the character's actual owner can verify it; the old account keeps its history in the audit log.
 */
async function releaseBinding(env: Env, c: BoundRow, rosterGuid: string | null, why: "namesake" | "stale", notices: NoticeBatch) {
  if (c.status === "member" || c.status === "left_pending") {
    await demote(env, c.discord_id, c.name_key, c.name, why === "namesake" ? "a different character now has this name" : "link predates LINKS_NOT_BEFORE", { batch: notices });
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE characters SET status = 'unbound', left_at = ?2, guid = NULL WHERE name_key = ?1").bind(c.name_key, now()),
    env.DB.prepare("UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND status IN ('queued','written')").bind(c.name_key),
  ]);
  await audit(env, "system", why === "namesake" ? "roster.namesake_released" : "roster.stale_link_released", c.name, {
    discordId: c.discord_id,
    oldGuid: c.guid,
    rosterGuid,
    boundAt: c.bound_at,
  });
  await logLine(
    env,
    why === "namesake"
      ? `♻️ roster: **${c.name}** on the roster is a different character from the one <@${c.discord_id}> linked (new GUID). The link is released; the character's owner can verify it.`
      : `♻️ roster: the link of **${c.name}** to <@${c.discord_id}> dates from before LINKS_NOT_BEFORE and was never tied to a character ID, so it is released; they verify again with a new code.`,
  );
}

export interface IdentityResult {
  renamed: string[]; // "Old → New"
  released: string[];
  held: Set<string>; // name keys left exactly as they are this time: neither promoted, pinned, stripped nor released
}

/**
 * Makes every link follow its character rather than its name, before anything is promoted or stripped.
 *
 *   renamed   a pinned link whose GUID is on the roster under another name: the link moves to the new name -- even when
 *             somebody else has already taken the old one (matching by GUID first is what keeps that member linked)
 *   namesake  the name is on the roster on a different character: the link is released. That includes an unpinned link
 *             whose name now carries a GUID another link has pinned, because that GUID is proven to be someone else's
 *   stale     a link from before LINKS_NOT_BEFORE that never met a roster: nothing proves it is this character
 *
 * `confirmWith` (roster exports; the previous export's name -> GUID): a namesake is released only when two exports in a
 * row agree the name is on that other character, just as a departure needs two. One export that happens to miss a
 * renamed member while the new holder of their old name is on it would otherwise unlink someone still in the guild.
 *
 * `cap` (roster exports; a manual sync passes neither): more releases than that in one go are held back and reported
 * instead of applied. A systematic change of character IDs -- a guild moving realm -- looks exactly like every pinned
 * member turning into a namesake at once, and that is a decision for a person, not for an export.
 */
export async function reconcileIdentities(
  env: Env,
  roster: Array<{ name: string; guid?: unknown }>,
  byKey: Map<string, BoundRow>,
  opts: { cap?: number; confirmWith?: Map<string, string | null>; notices: NoticeBatch },
): Promise<IdentityResult> {
  const out: IdentityResult = { renamed: [], released: [], held: new Set() };
  const cutoff = linksNotBefore(env);
  const rosterByKey = new Map<string, { name: string; guid: string | null }>();
  const rosterByGuid = new Map<string, { name: string; key: string }>();
  for (const m of roster) {
    const key = normalizeCharacter(m.name ?? "");
    if (!key) continue;
    const g = guidOf(m.guid);
    rosterByKey.set(key, { name: m.name, guid: g });
    if (g) rosterByGuid.set(g, { name: m.name, key });
  }
  const pinnedBy = new Map<string, BoundRow>();
  for (const c of byKey.values()) if (c.guid) pinnedBy.set(c.guid, c);

  // 1. Renames: found by GUID, whatever is (or is not) under the old name now.
  const renames: Array<{ c: BoundRow; to: { name: string; key: string } }> = [];
  for (const c of byKey.values()) {
    const at = c.guid ? rosterByGuid.get(c.guid) : undefined;
    if (at && at.key !== c.name_key) renames.push({ c, to: at });
  }
  const leaving = new Set(renames.map((r) => r.c.name_key));

  // 2. Links whose name is on the roster on some other character.
  const releases: Release[] = [];
  for (const [key, m] of rosterByKey) {
    const c = byKey.get(key);
    if (!c || leaving.has(key)) continue; // a link moving to its character's new name is not a namesake of this one
    const namesake = !!m.guid && ((!!c.guid && c.guid !== m.guid) || (!c.guid && pinnedBy.has(m.guid) && pinnedBy.get(m.guid) !== c));
    if (namesake && opts.confirmWith && guidOf(opts.confirmWith.get(key)) !== m.guid) {
      out.held.add(key); // first sighting: wait for the next export to agree
      await audit(env, "system", "roster.namesake_seen", m.name, { discordId: c.discord_id, linkedGuid: c.guid, rosterGuid: m.guid });
      continue;
    }
    if (namesake) releases.push({ c, rosterGuid: m.guid, why: "namesake" });
    else if (!c.guid && cutoff > 0 && c.bound_at < cutoff) releases.push({ c, rosterGuid: m.guid, why: "stale" });
  }

  if (opts.cap !== undefined && releases.length > opts.cap) {
    for (const r of releases) out.held.add(r.c.name_key);
    await reportHeldReleases(env, releases, opts.cap);
  } else {
    for (const r of releases) {
      await releaseBinding(env, r.c, r.rosterGuid, r.why, opts.notices);
      byKey.delete(r.c.name_key);
      out.released.push(rosterByKey.get(r.c.name_key)?.name ?? r.c.name);
    }
  }

  // 3. Apply the renames. Each move is conditional on the new name being free once any dead row there has been set
  //    aside, so a move can be refused but never breaks the table. A chain (A -> B while B -> C) resolves by running the
  //    move out of B first; a true swap (A <-> B) cannot resolve without a person, so both are held and reported.
  let todo = renames;
  for (let pass = 0; pass <= renames.length && todo.length; pass++) {
    const blockedBySource = new Set(todo.map((r) => r.c.name_key));
    const later: typeof todo = [];
    for (const r of todo) {
      if (blockedBySource.has(r.to.key)) {
        later.push(r); // the name it moves to is still held by a link that is itself about to move
        continue;
      }
      blockedBySource.delete(r.c.name_key);
      if (out.held.has(r.to.key)) {
        // the link under the new name is being held back this time (see `cap`), so this move waits with it
        out.held.add(r.c.name_key);
        await auditOnce(env, "roster.rename_waiting", `${r.c.name_key}>${r.to.key}`, { from: r.c.name, to: r.to.name, discordId: r.c.discord_id });
        continue;
      }
      if (await moveBinding(env, r.c, r.to)) {
        out.renamed.push(`${r.c.name} → ${r.to.name}`);
        byKey.delete(r.c.name_key);
        r.c.name_key = r.to.key;
        r.c.name = r.to.name;
        byKey.set(r.to.key, r.c);
      } else {
        out.held.add(r.c.name_key);
        if (await auditOnce(env, "roster.rename_blocked", `${r.c.name_key}>${r.to.key}`, { from: r.c.name, to: r.to.name, discordId: r.c.discord_id })) {
          await logLine(env, `⚠️ roster: **${r.c.name}** (<@${r.c.discord_id}>) is now called **${r.to.name}**, but that name is still linked to another account. Left as it is — an officer decides.`);
        }
      }
    }
    if (later.length === todo.length) {
      for (const r of later) out.held.add(r.c.name_key);
      const swap = later.map((r) => `${r.c.name_key}>${r.to.key}`).sort().join(",");
      if (await auditOnce(env, "roster.rename_swap", swap.slice(0, 500), { moves: later.map((r) => ({ from: r.c.name, to: r.to.name, discordId: r.c.discord_id })) })) {
        await logLine(env, `⚠️ roster: ${later.map((r) => `**${r.c.name}** → **${r.to.name}**`).join(", ")} look like characters that swapped names. Left as they are — an officer decides.`);
      }
      break;
    }
    todo = later;
  }
  return out;
}

/**
 * Record something that is true on every export until a person acts -- a blocked rename, a swap -- once, and again only
 * after `every` seconds, so the log says it rather than repeating it after each /reload. True when it was recorded.
 */
async function auditOnce(env: Env, action: string, subject: string, details: unknown, every = 6 * 3600): Promise<boolean> {
  const last = await env.DB.prepare("SELECT ts FROM audit WHERE action = ?1 AND subject = ?2 ORDER BY id DESC LIMIT 1").bind(action, subject).first<{ ts: number }>();
  if (last && now() - last.ts < every) return false;
  await audit(env, "system", action, subject, details);
  return true;
}

/** One rename in one transaction. A dead row under the new name (unbound, denied, left) is kept under an archive key
 *  rather than deleted: it is another account's history. Returns false when the name is still taken. */
async function moveBinding(env: Env, c: BoundRow, to: { name: string; key: string }): Promise<boolean> {
  const done = await env.DB.batch([
    env.DB.prepare(
      "UPDATE characters SET name_key = name_key || '~' || bound_at || '~' || rowid WHERE name_key = ?1 AND status IN ('unbound','denied','left')",
    ).bind(to.key),
    env.DB.prepare("UPDATE characters SET name_key = ?2, name = ?3 WHERE name_key = ?1 AND NOT EXISTS (SELECT 1 FROM characters WHERE name_key = ?2)").bind(
      c.name_key,
      to.key,
      to.name,
    ),
    env.DB.prepare(
      `UPDATE invite_queue SET name_key = ?2, name = ?3 WHERE name_key = ?1 AND status IN ('queued','written','invited')
         AND EXISTS (SELECT 1 FROM characters WHERE name_key = ?2 AND discord_id = ?4)`,
    ).bind(c.name_key, to.key, to.name, c.discord_id),
  ]);
  if (!done[1]?.meta?.changes) return false;
  await audit(env, "system", "roster.renamed", to.name, { from: c.name, discordId: c.discord_id, guid: c.guid });
  await logLine(env, `\u{1F501} roster: **${c.name}** is now **${to.name}** (same character) — link to <@${c.discord_id}> kept.`);
  return true;
}

/** Posted when the cap holds releases back: once, and again only when the number changes or six hours have passed. */
async function reportHeldReleases(env: Env, releases: Release[], cap: number) {
  const last = await env.DB.prepare("SELECT ts, details FROM audit WHERE action = 'roster.identity_held' ORDER BY id DESC LIMIT 1").first<{ ts: number; details: string | null }>();
  let lastCount = -1;
  try {
    lastCount = Number(JSON.parse(last?.details ?? "{}").count ?? -1);
  } catch {
    /* unreadable: report again */
  }
  if (last && lastCount === releases.length && now() - last.ts < 6 * 3600) return;
  const stale = releases.filter((r) => r.why === "stale").length;
  await audit(env, "system", "roster.identity_held", undefined, { count: releases.length, stale, cap, names: releases.slice(0, 40).map((r) => r.c.name) });
  await logLine(
    env,
    `⚠️ roster: ${releases.length} links would be released at once (limit ${cap} per export)` +
      (stale ? ` — ${stale} of them older than LINKS_NOT_BEFORE` : "") +
      ` — because the character on the roster under their name is not the one that was linked. Held back; nothing changed for them. ` +
      `If they really are different characters (the first export after launch, say), run \`/olympus-admin sync\` to release them. ` +
      `If the guild moved realm and every character got a new ID, clear the pins instead (docs/deploy-checklist.md, "Re-pinning").`,
  );
}

/** How many links one roster export may release (namesakes and pre-cutoff links) before it holds them all back. */
export function releaseCap(bound: number): number {
  return Math.max(5, Math.ceil(bound * 0.02));
}

/**
 * Fingerprint of everything in an export that can change a decision: who is on the roster, their rank index, their
 * public note and their character ID (a namesake swap changes nothing else, and the stored snapshot must not keep the
 * old ID -- postVerify pins from it). Level and last-online are deliberately excluded — they move on nearly every export
 * for anyone currently online, and including them would mean no two exports ever matched, which is the whole point.
 */
async function rosterFingerprint(members: RosterMemberIn[]): Promise<string> {
  const canon = members
    .map((m) => `${normalizeCharacter(m.name)}|${m.rankIndex ?? ""}|${(m.note ?? "").trim()}|${guidOf(m.guid) ?? ""}`)
    .sort()
    .join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** One roster sync can promote or strip many people at once. Their notices are collected and posted together at the end
 *  (dm.ts), in a `finally` so notices for work that did complete still go out if something later throws. */
export async function ingestRoster(env: Env, exportedAt: number, members: RosterMemberIn[], source: "addon" | "api") {
  const notices = noticeBatch();
  try {
    return await ingestRosterInner(env, exportedAt, members, source, notices);
  } finally {
    await flushNotices(env, notices);
  }
}

async function ingestRosterInner(env: Env, exportedAt: number, members: RosterMemberIn[], source: "addon" | "api", notices: NoticeBatch) {
  const calls = callBudget(env); // .90 (P-20): one Discord-call budget for this export's promotions; a deferred grant is the sweep's
  const prev = await env.DB.prepare("SELECT id, exported_at, member_count, content_hash FROM roster_snapshots ORDER BY id DESC LIMIT 1")
    .first<{ id: number; exported_at: number; member_count: number; content_hash: string | null }>();
  if (prev && prev.exported_at >= exportedAt) return { skipped: true, reason: "older than the last snapshot" };

  // A roster export that is much smaller than the last one is far more likely to be truncated than real: the client
  // returns only the *displayed* roster, so a missing SetGuildRosterShowOffline(true), or a GUILD_ROSTER_UPDATE that
  // fires before the full list has arrived, yields a short list. Acting on one would strip the role from everyone
  // missing. The snapshot is still stored (it is evidence), but the demotion pass is skipped and staff are told.
  const minMembers = intVar(env.ROSTER_MIN_MEMBERS, 0);
  const maxShrinkPct = intVar(env.ROSTER_MAX_SHRINK_PCT, 10);
  let trusted = true;
  let distrustReason = "";
  if (minMembers > 0 && members.length < minMembers) {
    trusted = false;
    distrustReason = `only ${members.length} members, floor is ${minMembers}`;
  } else if (prev && prev.member_count > 0) {
    const shrinkPct = ((prev.member_count - members.length) / prev.member_count) * 100;
    if (shrinkPct > maxShrinkPct) {
      trusted = false;
      distrustReason = `${members.length} members vs ${prev.member_count} in the last export (${shrinkPct.toFixed(1)}% smaller, limit ${maxShrinkPct}%)`;
    }
  }

  // An export that is identical to the last one is the common case: the addon re-exports on every roster update, so
  // during a recruiting session almost every snapshot repeats the previous one verbatim. Rewriting a thousand
  // identical rows each time is what exhausted D1's free-tier write allowance on 18 September and made every
  // /ingest/roster return 500. So an unchanged roster refreshes the existing snapshot row and reuses its members.
  // The diff below still runs either way: somebody may have *verified* since the last export even though the guild
  // itself did not move, and that still has to grant a role.
  const fingerprint = await rosterFingerprint(members);
  let snapId: number;
  const unchanged = !!prev && prev.content_hash === fingerprint;

  if (unchanged) {
    await env.DB.prepare("UPDATE roster_snapshots SET exported_at = ?2, received_at = ?3 WHERE id = ?1").bind(prev!.id, exportedAt, now()).run();
    snapId = prev!.id;
  } else {
    const ins = await env.DB.prepare("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(exportedAt, now(), source, members.length, fingerprint)
      .run();
    snapId = ins.meta.last_row_id as number;

    const stmts = members.map((m) =>
      env.DB.prepare(
        "INSERT OR REPLACE INTO roster_members (snapshot_id, name_key, name, rank, rank_index, level, class, public_note, officer_note, guid, last_online) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
      ).bind(snapId, normalizeCharacter(m.name), m.name, m.rank ?? null, m.rankIndex ?? null, m.level ?? null, m.class ?? null, m.note ?? null, m.officerNote ?? null, guidOf(m.guid), m.lastOnline ?? null),
    );
    try {
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    } catch (e) {
      // The member rows failed partway through, so this snapshot is a lie: it claims member_count members and holds
      // fewer. Left in place it also poisons every retry, because the next attempt sees a snapshot with the same
      // exported_at and answers "older than the last snapshot" instead of trying again — which is exactly what
      // happened for half an hour on 18 September. Take the snapshot row back out and let the caller retry for real.
      await env.DB.prepare("DELETE FROM roster_members WHERE snapshot_id = ?1").bind(snapId).run();
      await env.DB.prepare("DELETE FROM roster_snapshots WHERE id = ?1").bind(snapId).run();
      await audit(env, "watcher", "roster.ingest_failed", String(snapId), { members: members.length, error: String(e).slice(0, 300) });
      throw e;
    }
    // First appearance per character: the unverified-removal grace period is measured from it, because the game
    // gives addons no join date. Only a NEW snapshot can hold a new name, so the unchanged path above skips this.
    // Best effort by design: a missing table (migration not yet applied) must never cost us a roster.
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO roster_first_seen (name_key, first_seen) SELECT name_key, ?2 FROM roster_members WHERE snapshot_id = ?1",
      )
        .bind(snapId, exportedAt)
        .run();
    } catch (e) {
      await audit(env, "watcher", "roster.first_seen_failed", String(snapId), { error: String(e).slice(0, 200) });
    }
  }

  const current = new Map(members.map((m) => [normalizeCharacter(m.name), m] as const));
  const previous = new Set<string>();
  const previousGuids = new Map<string, string | null>(); // name -> GUID in the previous export, to confirm namesakes
  if (prev) {
    const rows = await env.DB.prepare("SELECT name_key, guid FROM roster_members WHERE snapshot_id = ?1").bind(prev.id).all<{ name_key: string; guid: string | null }>();
    for (const r of rows.results) {
      previous.add(r.name_key);
      previousGuids.set(r.name_key, r.guid);
    }
  }

  const summary = {
    snapshot: snapId,
    members: members.length,
    trusted,
    unchanged,
    promoted: [] as string[],
    stripped: [] as string[],
    pendingLeft: [] as string[],
    returned: [] as string[],
    noteBound: [] as string[],
    renamed: [] as string[],
    released: [] as string[],
    held: 0,
    pinned: 0,
    rankMismatches: 0,
  };
  if (!trusted) {
    await audit(env, "watcher", "roster.distrusted", String(snapId), { members: members.length, reason: distrustReason });
    await logLine(
      env,
      `\u26a0\ufe0f roster: export #${snapId} looks truncated — ${distrustReason}. Stored, but **no roles were removed**. ` +
        `If the guild really did shrink that much, run \`/olympus-admin sync\` to apply it.`,
    );
  }

  // 1. Anyone on the roster whose binding is verified/queued/invited becomes a member (covers first snapshot + re-syncs).
  //    A link only counts for the character it was made for (reconcileIdentities): renames carry it, namesakes and
  //    pre-cutoff links that never met a roster release it, and the first sighting pins the GUID. Renames and namesakes
  //    are positive evidence (the GUID is on this roster), so they apply even to a distrusted, possibly truncated
  //    export -- capped, so a systematic change of character IDs is held for a person instead of applied.
  const bound = await env.DB.prepare(
    "SELECT name_key, name, discord_id, status, guid, bound_at FROM characters WHERE status IN ('verified','queued','member','left','left_pending')",
  ).all<BoundRow>();
  const byKey = new Map(bound.results.map((c) => [c.name_key, c] as const));
  const ident = await reconcileIdentities(env, members, byKey, { cap: releaseCap(byKey.size), confirmWith: previousGuids, notices });
  summary.renamed = ident.renamed;
  summary.released = ident.released;
  summary.held = ident.held.size;

  for (const [key, m] of current) {
    const c = byKey.get(key);
    if (c && ident.held.has(key)) continue; // left exactly as it is until a person decides (see reconcileIdentities)
    const g = guidOf(m.guid);
    if (c && g && c.guid && c.guid !== g) continue; // not this link's character; reconcileIdentities has reported it
    if (c && g && !c.guid) {
      await env.DB.prepare("UPDATE characters SET guid = ?2 WHERE name_key = ?1 AND guid IS NULL").bind(key, g).run();
      c.guid = g;
      summary.pinned++;
    }
    if (c && c.status === "left_pending") {
      // They were missing from one export and are back in this one — the gap was a truncated or mid-load snapshot.
      // The role was never removed, so this is a status correction, not a promotion: no DM, no welcome line.
      await env.DB.prepare("UPDATE characters SET status = 'member', left_at = NULL WHERE name_key = ?1").bind(key).run();
      await audit(env, "system", "roster.returned", m.name, { discordId: c.discord_id });
      summary.returned.push(m.name);
      continue;
    }
    if (c && c.status !== "member") {
      await promote(env, c.discord_id, c.name_key, m.name, notices, g, calls);
      summary.promoted.push(m.name);
      continue;
    }
    if (!c) {
      // Manual path: an officer set the public note to D:<discord id> by hand.
      const mt = (m.note ?? "").trim().match(NOTE_RE);
      if (mt) {
        const linked = await env.DB.prepare("SELECT discord_id, banned FROM members WHERE discord_id = ?1").bind(mt[1]).first<{ discord_id: string; banned: number }>();
        if (linked && !linked.banned) {
          // A dead row under this name (a released namesake, an unbind) is another account's history: set it aside
          // rather than letting the officer's note promote a row that belongs to somebody else.
          const done = await env.DB.batch([
            env.DB.prepare(
              "UPDATE characters SET name_key = name_key || '~' || bound_at || '~' || rowid WHERE name_key = ?1 AND discord_id <> ?2 AND status IN ('unbound','denied','left')",
            ).bind(key, mt[1]),
            env.DB.prepare(
              `INSERT INTO characters (name_key, name, discord_id, status, bound_at, source) VALUES (?1, ?2, ?3, 'verified', ?4, 'note')
               ON CONFLICT(name_key) DO UPDATE SET status = 'verified', source = 'note', guid = NULL
                WHERE characters.discord_id = ?3 AND characters.status IN ('unbound','denied','left')`,
            ).bind(key, m.name, mt[1], now()),
          ]);
          if (done[1]?.meta?.changes) {
            await promote(env, mt[1], key, m.name, notices, g, calls);
            summary.noteBound.push(m.name);
          }
        }
      }
    }
  }

  // 2. Members who disappeared lose the character — but only after two consecutive exports agree. One short or
  //    mid-load export should never cost anyone their role, so the first absence only arms the removal.
  if (trusted) {
    for (const c of byKey.values()) {
      if (current.has(c.name_key) || ident.held.has(c.name_key)) continue;
      if (c.status === "member") {
        if (!previous.has(c.name_key)) continue; // never seen in a snapshot yet; nothing to conclude
        await env.DB.prepare("UPDATE characters SET status = 'left_pending' WHERE name_key = ?1").bind(c.name_key).run();
        await audit(env, "system", "roster.left_pending", c.name, { discordId: c.discord_id });
        summary.pendingLeft.push(c.name);
      } else if (c.status === "left_pending") {
        await demote(env, c.discord_id, c.name_key, c.name, "roster (absent from two exports)", { batch: notices });
        summary.stripped.push(c.name);
      }
    }
  }

  // 3. In-game rank vs Discord staff roles. Deliberately a report, not an action: the Officer role is what gates
  //    /olympus-admin and every member's BattleTag, so granting it from an in-game rank would let anyone who can
  //    promote in game hand out access to personal data. A human clicks; the discrepancy is merely made visible.
  if (trusted) summary.rankMismatches = await reportRankMismatches(env, members);

  await audit(env, "watcher", "roster.ingested", String(snapId), {
    members: members.length,
    promoted: summary.promoted.length,
    stripped: summary.stripped.length,
    renamed: summary.renamed.length,
    released: summary.released.length,
    pinned: summary.pinned,
  });
  return summary;
}

/**
 * Re-apply the newest snapshot by hand: promote everyone on it who has a verified binding, and remove the role from
 * every member character that is not on it. Used by `/olympus-admin sync` after a distrusted (short) export, and as
 * the officer's answer to "it says I should have the role and I don't". Bypasses the two-export rule on purpose —
 * a human asked for it.
 */
export async function syncFromLatest(env: Env): Promise<SyncResult | null> {
  const notices = noticeBatch();
  try {
    return await syncFromLatestInner(env, notices);
  } finally {
    await flushNotices(env, notices);
  }
}

export interface SyncResult {
  snapshot: number;
  promoted: string[];
  stripped: string[];
  released: string[];
  renamed: string[];
  held: number;
}

async function syncFromLatestInner(env: Env, notices: NoticeBatch): Promise<SyncResult | null> {
  const calls = callBudget(env); // .90 (P-20)
  const snap = await env.DB.prepare("SELECT id, member_count FROM roster_snapshots ORDER BY id DESC LIMIT 1").first<{ id: number; member_count: number }>();
  if (!snap) return null;
  const rows = await env.DB.prepare("SELECT name_key, name, guid FROM roster_members WHERE snapshot_id = ?1").bind(snap.id).all<{ name_key: string; name: string; guid: string | null }>();
  const onRoster = new Map(rows.results.map((r) => [r.name_key, r] as const));
  const bound = await env.DB.prepare(
    "SELECT name_key, name, discord_id, status, guid, bound_at FROM characters WHERE status IN ('verified','queued','member','left','left_pending')",
  ).all<BoundRow>();
  const byKey = new Map(bound.results.map((c) => [c.name_key, c] as const));
  // Same identity rules as a roster export, without the cap: a person asked, and this is how a held batch is applied.
  // Only a name swap between two linked characters is still held (reconcileIdentities).
  const ident = await reconcileIdentities(env, rows.results, byKey, { notices });
  const out: SyncResult = { snapshot: snap.id, promoted: [], stripped: [], released: ident.released, renamed: ident.renamed, held: ident.held.size };
  for (const c of byKey.values()) {
    if (ident.held.has(c.name_key) || c.status === "left") continue;
    const row = onRoster.get(c.name_key);
    const g = guidOf(row?.guid);
    if (row && g && c.guid && c.guid !== g) continue;
    if (row && g && !c.guid) await env.DB.prepare("UPDATE characters SET guid = ?2 WHERE name_key = ?1 AND guid IS NULL").bind(c.name_key, g).run();
    if (row && c.status !== "member") {
      await promote(env, c.discord_id, c.name_key, row.name, notices, g, calls);
      out.promoted.push(row.name);
    } else if (!row && (c.status === "member" || c.status === "left_pending")) {
      await demote(env, c.discord_id, c.name_key, c.name, "manual sync", { batch: notices });
      out.stripped.push(c.name);
    }
  }
  await audit(env, "system", "roster.sync", String(snap.id), {
    promoted: out.promoted.length,
    stripped: out.stripped.length,
    released: out.released.length,
    renamed: out.renamed.length,
    held: out.held,
  });
  return out;
}

/** A member character is gone from the guild (roster diff, or a "has left/been kicked" line relayed by the watcher). */
export async function demote(env: Env, discordId: string, nameKey: string, name: string, how: string, opts: { space?: boolean; batch?: NoticeBatch } = {}) {
  await env.DB.prepare("UPDATE characters SET status = 'left', left_at = ?2 WHERE name_key = ?1").bind(nameKey, now()).run();
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS n FROM characters WHERE discord_id = ?1 AND status = 'member'").bind(discordId).first<{ n: number }>();
  const last = (remaining?.n ?? 0) === 0;
  let kept: string[] = [];
  if (last) {
    if (env.ROLE_GUILD_MEMBER) {
      try {
        await removeRole(env, discordId, env.ROLE_GUILD_MEMBER, `olympus-verify: ${name} left the guild (${how})`);
      } catch (e) {
        await audit(env, "system", "role.remove_failed", name, { error: String(e) });
      }
    }
    // Removing Guild Member does not necessarily remove access: Raid Leader, Officer, Moderator, Guild Leader and
    // Guild Master each carry their own View allows on the private categories. Say so rather than implying the
    // person has been locked out.
    try {
      const m = await guildMember(env, discordId);
      const staff = new Set(staffRoles(env));
      kept = (m?.roles ?? []).filter((r) => staff.has(r));
    } catch (e) {
      await audit(env, "system", "roles.read_failed", name, { discordId, error: String(e) });
    }
  }
  await audit(env, "system", opts.space ? "roster.freed_seat" : "roster.left", name, { discordId, how, keptRoles: kept });
  if (opts.space) {
    // Removed to make room, not for cause. The binding is left intact, so coming back is one invite rather than a
    // fresh verification, and the person is told that rather than being left to guess why their access vanished.
    await notify(
      env,
      discordId,
      `The guild filled up and **${name}** was removed to free a seat — nothing you did, and nothing held against you. ` +
        `You are still verified here, so an officer can invite you straight back in when a place opens; ask in the help channel and we will put you at the front.`,
      "seat-freed",
      opts.batch,
    );
  }
  const keptNote = kept.length
    ? ` \u2014 but they still hold ${kept.map((r) => `<@&${r}>`).join(", ")}, which keeps their channel access; remove those by hand if they should lose it`
    : "";
  await logLine(
    env,
    opts.space
      ? `\u{1FA91} seat freed: **${name}** (<@${discordId}>) was removed to make room${last ? " \u2014 Guild Member role removed" : ""}${keptNote}. Their verification is kept, so a re-invite needs no new code.`
      : `\u2796 roster: **${name}** (<@${discordId}>) is no longer in the guild (${how})${last ? " \u2014 Guild Member role removed" : ""}${keptNote}.`,
  );
}

/** Character confirmed on the roster with a verified binding → member: Guild Member role, nickname, log line, DM. */
export async function promote(env: Env, discordId: string, nameKey: string, name: string, batch?: NoticeBatch, guid?: string | null, calls?: CallBudget) {
  const t = now();
  const g = guidOf(guid); // pinned only if none is: a pin is never overwritten here (reconcileIdentities decides that)
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE characters SET status = 'member', member_since = COALESCE(member_since, ?2), left_at = NULL, guid = COALESCE(guid, ?3) WHERE name_key = ?1",
    ).bind(nameKey, t, g),
    env.DB.prepare("UPDATE invite_queue SET status = 'joined', joined_at = ?2 WHERE name_key = ?1 AND status IN ('queued','written','invited')").bind(nameKey, t),
  ]);
  // The role grant is optional (ROLE_GUILD_MEMBER may be unset once the role is retired), and nothing below depends
  // on it succeeding. Until 26 Sep the nickname and welcome sat after addRole inside one try, so any role failure —
  // including the role simply having been deleted — silently stopped nicknames as well.
  let granted = false;
  let blocked = false;
  if (env.ROLE_GUILD_MEMBER) {
    try {
      // .55: through the one role writer (roles.ts): a held blocking role withholds the grant, fail-closed config too.
      const outcome = await grantMemberRole(env, discordId, `olympus-verify: ${name} confirmed on the guild roster`, "promote", undefined, calls); // .90: within the run's Discord-call budget
      granted = outcome === "granted" || outcome === "has-role";
      blocked = outcome === "blocked";
      if (blocked) await logLine(env, `⛔ roster: **${name}** (<@${discordId}>) is on the roster, but a server restriction is on the account; Guild Member withheld until it is lifted.`);
      else if (outcome === "held") await logLine(env, `⏸️ roster: **${name}** (<@${discordId}>) is on the roster, but the account must apply again after a rename Blizzard required; Guild Member withheld until an administrator approves it.`); // .114
      else if (outcome === "misconfigured") await logLine(env, `⚠️ roster: ROLE_GUILD_MEMBER is not a role of this server; no Guild Member granted for **${name}**.`);
      else if (outcome === "unverified" || outcome === "budget") await audit(env, "system", "role.deferred", name, { discordId, source: "promote", reason: outcome }); // the sweep grants it once Discord answers, or on its next run (.90: the run's budget)
      else if (outcome === "banned") await audit(env, "system", "role.refused_banned", name, { discordId });
    } catch (e) {
      await audit(env, "system", "role.add_failed", name, { discordId, error: String(e) });
      await logLine(env, `⚠️ roster: could not grant Guild Member to <@${discordId}> for **${name}**: ${explainDiscordError(e)}`);
    }
  }
  if (env.SET_NICKNAME === "true") {
    try {
      await setNickname(env, discordId, name.slice(0, 32));
    } catch (e) {
      await audit(env, "system", "nick.failed", name, { error: String(e) }); // owner/higher roles cannot be renamed by a bot
    }
  }
  await audit(env, "system", "roster.member", name, { discordId, roleGranted: granted, roleBlocked: blocked });
  await logLine(env, `➕ roster: **${name}** (<@${discordId}>) confirmed on the roster${granted ? " — Guild Member granted" : ""}.`);
  await notify(env, discordId, `Welcome to Olympus — **${name}** is on the guild roster.`, "welcome", batch);
}

/**
 * Compare in-game rank against the Discord Officer role and post the differences. Deliberately a report, not a sync:
 * the Officer role is what gates /olympus-admin and every member's BattleTag, so deriving it from an in-game rank
 * would let anyone who can promote in game grant access to personal data with no Discord-side record of the decision.
 * It is also not currently possible — the bot's role sits below Officer, so Discord would refuse the assignment.
 */
async function reportRankMismatches(env: Env, members: RosterMemberIn[]): Promise<number> {
  const ranks = officerRankNames(env);
  const channel = staffChannel(env);
  if (!ranks.length || !channel || !env.ROLE_OFFICER) return 0;
  // Characters whose rank is expected not to match, listed in RANK_CHECK_EXEMPT. The guild owner is the usual case:
  // a Discord server owner already has every permission without holding the role, so the check flags them forever
  // and the notice becomes something staff learn to scroll past -- which is how a real mismatch would be missed.
  const exempt = rankCheckExempt(env).map(normalizeCharacter);

  const bound = await env.DB.prepare("SELECT name_key, name, discord_id FROM characters WHERE status = 'member'")
    .all<{ name_key: string; name: string; discord_id: string }>();
  const owner = new Map(bound.results.map((c) => [c.name_key, c] as const));

  const shouldBeOfficer = new Map<string, string[]>(); // discord id -> their characters sitting at an officer rank
  for (const m of members) {
    if (!ranks.includes((m.rank ?? "").trim().toLowerCase())) continue;
    if (exempt.includes(normalizeCharacter(m.name))) continue;
    const c = owner.get(normalizeCharacter(m.name));
    if (!c) continue;
    shouldBeOfficer.set(c.discord_id, [...(shouldBeOfficer.get(c.discord_id) ?? []), m.name]);
  }
  if (!shouldBeOfficer.size) return 0;

  // Check the throttle BEFORE asking Discord about anyone. The report is limited to one a day, but the member
  // lookups below used to run on every roster export regardless -- roughly ninety times a day, to re-derive an
  // answer that was not going to be shown and that had not changed since the last export. The count returned while
  // the throttle is closed is the number of candidates rather than the number confirmed missing the role, which is
  // what the watcher's `rankMismatches` has been echoing all along.
  const recent = await env.DB.prepare("SELECT ts FROM audit WHERE action = 'rank.mismatch_reported' ORDER BY id DESC LIMIT 1").first<{ ts: number }>();
  if (recent && now() - recent.ts < 20 * 3600) return shouldBeOfficer.size;

  const missing: string[] = [];
  for (const [discordId, names] of shouldBeOfficer) {
    try {
      const m = await guildMember(env, discordId);
      if (m && !m.roles.includes(env.ROLE_OFFICER)) missing.push(`<@${discordId}> (${names.join(", ")})`);
    } catch {
      /* one unreadable member should not stop the report */
    }
  }
  if (!missing.length) return 0;

  const posted = await staffNotice(
    env,
    {
      content:
        `**Officer rank check** \u2014 these accounts hold an officer rank in game but not the <@&${env.ROLE_OFFICER}> role in Discord:\n` +
        missing.map((m) => `\u2022 ${m}`).join("\n") +
        `\nThe bot does not grant it: that role gates \`/olympus-admin\` and every member's BattleTag, so it stays a human decision.`,
      allowed_mentions: { parse: [] },
    },
    "officer rank check",
  );
  // The throttle row is written whether or not the post landed. A failed notice that is retried on every single
  // roster export is how one missing channel permission turned into hundreds of failed Discord calls.
  await audit(env, "system", "rank.mismatch_reported", undefined, { count: missing.length, posted, who: missing });
  return missing.length;
}

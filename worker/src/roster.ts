/** Roster snapshots and the diff that grants/strips the Guild Member role. The roster is the source of truth. */
import type { Env } from "./env";
import { audit, linksNotBefore, now,type PrivacyReference } from "./db";
import { intVar, officerRankNames, rankCheckExempt, staffChannel, staffRoles } from "./env";
import { normalizeCharacter } from "./codes";
import { explainDiscordError, guildMember, logLine, postMessage, removeRole, setNickname, staffNotice } from "./discord";
import { grantMemberRole, callBudget, affords, GRANT_CALLS, type CallBudget } from "./roles";
import { flushNotices, notify, noticeBatch, type NoticeBatch } from "./dm";
import { prepareRosterCronNotice,parseRosterCronNotice,settleRosterCronNotice } from './privacy-provider-messages';
import { errorRef } from "./log";
import { privacyProviderCustodyDatabase,privacyCaptureFromColumns,privacyGenerationExpressionFenceSql,privacyGenerationFenceSql,privacyGenerationLiteralFenceSql,readPrivacySubject,type PrivacySubject } from './privacy-serving-authority';
import { ROSTER_INGEST_STATEMENTS, ROSTER_SYNC_STATEMENTS, SCHEDULED_CAPS } from "./scheduled-budget";
import {
  countStatements,
  derivationWorst,
  EFFECT_DEFERRED_WORST,
  EFFECT_WORST,
  effectWorst,
  IDENTITY_FIXED,
  inParts,
  NOTICE_FLUSH_FIXED,
  noticeStatementsPending,
  RELEASE_WORST,
  RENAME_WORST,
  ROSTER_EFFECTS_PER_STATEMENT,
  room,
  RUN_HISTORY_S,
  RUN_IS_CURRENT,
  sightingsWorst,
  SLICE_FIXED,
  type Admission,
} from "./roster-effects";

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
 * .115 (Viktor, item B, 2 Oct 2026): how old the newest roster may be and still say whether Olympus I has room
 * (guild-seats.ts). A seat count changes only when someone joins or leaves, so a count up to two days old still
 * describes the guild's room, which is not true of one person's presence (ROSTER_CURRENT_FOR, 12 h). The seat rule
 * keeps the LINKS_NOT_BEFORE cut: the beta's last export is no evidence about live.
 */
export const ROSTER_SEATS_FOR = 48 * 3600;
/**
 * .115 (review of 3 Oct 2026): a snapshot row still `complete = 0` this long after it first arrived was left unfinished:
 * the isolate stopped between two member batches. The last member batch carries the completion stamp, so a finished
 * export is never left at 0, and an ingest takes seconds, so ten minutes is never a write still in progress. The next
 * export then writes the roster again in full (ingestRoster), and /olympus-admin sync may vouch for such a row once all of
 * its member rows are there.
 */
export const SNAPSHOT_WRITE_GRACE_S = 600;
/**
 * .115 (review of 3 Oct 2026, D1's per-invocation statement limit): members written by one INSERT ... SELECT over
 * json_each, one such statement in each member batch (the batches are the same 50 members as before). A changed export of
 * 1,000 members writes its rows in 20 statements instead of 1,000; guild_seats_test holds a whole changed full-guild
 * ingest to ROSTER_INGEST_STATEMENTS_FULL_GUILD.
 */
export const ROSTER_ROWS_PER_STATEMENT = 50;
/**
 * .115 (review of 3 Oct 2026): the statements one /ingest/roster invocation sends for a changed export of 1,000 members
 * after a full one (seatBase's walk, the snapshot, its rows, stamp and effects run, the first-seen dates, the derivation's
 * reads and batch, the audits), when nobody is promoted, removed or renamed. Measured by guild_seats_test (33, and 35 when
 * the trust base is read; 27 and 29 before the effects run), far below D1's 1,000. The member effects that follow are not
 * bounded by the role writer's call budget, which counts Discord requests (Codex, 3 Oct 2026 16:48 UTC, finding A): they
 * are a worklist, each item admitted at its worst case against ROSTER_INGEST_STATEMENTS before it starts (roster-effects.ts).
 */
export const ROSTER_INGEST_STATEMENTS_FULL_GUILD = 40;
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
  privacy_generation:string|null;
  privacy_state:'active'|'retiring'|'retired'|null;
  privacy_revision:number|null;
}
const BOUND_SELECT=`SELECT c.name_key,c.name,c.discord_id,c.status,c.guid,c.bound_at,s.generation AS privacy_generation,s.state AS privacy_state,s.revision AS privacy_revision
 FROM characters c LEFT JOIN privacy_subjects s ON s.subject_id=c.discord_id WHERE c.status IN ('verified','queued','member','left','left_pending')`;
const BOUND_AND_NOTE_SELECT=BOUND_SELECT+` UNION ALL SELECT NULL,NULL,m.discord_id,'privacy_note_capture',NULL,0,s.generation,s.state,s.revision FROM members m LEFT JOIN privacy_subjects s ON s.subject_id=m.discord_id WHERE m.banned=0`;
const capturedActive=(c:BoundRow)=>c.privacy_state===null||c.privacy_state==='active';
const captureOf=(c:BoundRow)=>privacyCaptureFromColumns(c.discord_id,c);
const referenceOf=(c:BoundRow):PrivacyReference=>({subject:c.discord_id,capture:captureOf(c)});

/** A GUID as an export gives it: a non-empty string, or nothing. A number or a table from a damaged file is nothing. */
export function guidOf(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type Release = { c: BoundRow; rosterGuid: string | null; why: "namesake" | "stale" };

/** An identity change belongs to the snapshot read by this invocation; derivation also belongs to its unfinished run. */
interface IdentityFence {
  snapshotId: number;
  runId?: number;
}
// Rechecked by every identity mutation in its atomic batch, alongside the exact binding read earlier. A newer snapshot,
// a completed/superseded run, or a freshly verified owner/GUID makes the old mutation a no-op, including its queue change.
// Both paths prove the stored count. Worklist derivation also requires complete 1; manual sync has already admitted its
// deliberate full-row legacy/stuck override before calling without a run ID.
const EXPECTED_BINDING = `c.name_key = ?1 AND c.discord_id = ?2 AND c.guid IS ?3 AND c.bound_at = ?4 AND c.status = ?5
  AND ${privacyGenerationFenceSql(2,10)}
  AND ?6 = (SELECT MAX(id) FROM roster_snapshots)
  AND EXISTS (SELECT 1 FROM roster_snapshots s WHERE s.id = ?6
        AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id))
  AND (?7 IS NULL OR EXISTS (SELECT 1 FROM roster_effect_runs r
        JOIN roster_snapshots s ON s.id = r.snapshot_id
        WHERE r.id = ?7 AND r.id = (SELECT MAX(id) FROM roster_effect_runs) AND r.snapshot_id = ?6 AND s.complete = 1
          AND r.derived_at IS NULL AND r.superseded_at IS NULL))`;
const identityBinds = (c: BoundRow, fence: IdentityFence) => [c.name_key, c.discord_id, c.guid, c.bound_at, c.status, fence.snapshotId, fence.runId ?? null];

/**
 * Let go of a link that belongs to a different character than the one now on the roster under that name. The role
 * goes the usual way (a departure keeps it while another linked character is still in the guild), after the name is freed
 * so the character's actual owner can verify it; the old account keeps its history in the audit log.
 */
async function releaseBinding(env: Env, c: BoundRow, rosterGuid: string | null, why: "namesake" | "stale", notices: NoticeBatch, fence: IdentityFence): Promise<boolean> {
  const binds = identityBinds(c, fence);
  const done = await env.DB.batch([
    // Queue first: both predicates see the unchanged expected binding in the same transaction.
    env.DB.prepare(`UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND status IN ('queued','written')
      AND EXISTS (SELECT 1 FROM characters c WHERE ${EXPECTED_BINDING})`).bind(...binds,null,null,c.privacy_generation),
    env.DB.prepare(`UPDATE characters AS c SET status = 'unbound', left_at = ?8, guid = NULL WHERE ${EXPECTED_BINDING}`).bind(...binds, now(),null,c.privacy_generation),
  ]);
  if (!Number(done[1]?.meta?.changes ?? 0)) return false;
  if (c.status === "member" || c.status === "left_pending") {
    await afterDeparture(env, c.discord_id, c.name, why === "namesake" ? "a different character now has this name" : "link predates LINKS_NOT_BEFORE", { batch: notices,capture:captureOf(c) });
  }
  await audit(env, "system", why === "namesake" ? "roster.namesake_released" : "roster.stale_link_released", c.name, {
    discordId: c.discord_id,
    oldGuid: c.guid,
    rosterGuid,
    boundAt: c.bound_at,
  },referenceOf(c));
  await logLine(
    env,
    why === "namesake"
      ? `♻️ roster: **${c.name}** on the roster is a different character from the one <@${c.discord_id}> linked (new GUID). The link is released; the character's owner can verify it.`
      : `♻️ roster: the link of **${c.name}** to <@${c.discord_id}> dates from before LINKS_NOT_BEFORE and was never tied to a character ID, so it is released; they verify again with a new code.`,
    [referenceOf(c)],
  );
  return true;
}

export interface IdentityResult {
  renamed: string[]; // "Old → New"
  released: string[];
  held: Set<string>; // name keys left exactly as they are this time: neither promoted, pinned, stripped nor released
  /** .115 (Codex, 3 Oct 2026 16:48 UTC, finding A): how many of `held` were left for this invocation's statement budget
   *  (`admit`), not for a person; a later export or sync finds them again and applies them */
  deferred: number;
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
 *
 * `admit` (.115, Codex, 3 Oct 2026 16:48 UTC, finding A): asked before each release (RELEASE_WORST statements) and each
 * rename (RENAME_WORST); when it says no, that link is held exactly as it is, silently, and counted in `deferred`, so a
 * realm move or a wave of forced renames never runs an invocation past its statement limit. The namesake sightings, one
 * audit row each, are written in bulk (a statement per ROSTER_EFFECTS_PER_STATEMENT), never one statement per member.
 */
export async function reconcileIdentities(
  env: Env,
  roster: Array<{ name: string; guid?: unknown }>,
  byKey: Map<string, BoundRow>,
  opts: { cap?: number; confirmWith?: Map<string, string | null>; notices: NoticeBatch; fence: IdentityFence; admit?: (cost: number) => boolean },
): Promise<IdentityResult> {
  const out: IdentityResult = { renamed: [], released: [], held: new Set(), deferred: 0 };
  const admitted = (cost: number) => !opts.admit || opts.admit(cost);
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
  const sightings: Array<[string, string]> = []; // [subject, details] of each roster.namesake_seen row
  for (const [key, m] of rosterByKey) {
    const c = byKey.get(key);
    if (!c || leaving.has(key)) continue; // a link moving to its character's new name is not a namesake of this one
    const namesake = !!m.guid && ((!!c.guid && c.guid !== m.guid) || (!c.guid && pinnedBy.has(m.guid) && pinnedBy.get(m.guid) !== c));
    if (namesake && opts.confirmWith && guidOf(opts.confirmWith.get(key)) !== m.guid) {
      out.held.add(key); // first sighting: wait for the next export to agree
      sightings.push([m.name, JSON.stringify({ discordId: c.discord_id, linkedGuid: c.guid, rosterGuid: m.guid })]);
      continue;
    }
    if (namesake) releases.push({ c, rosterGuid: m.guid, why: "namesake" });
    else if (!c.guid && cutoff > 0 && c.bound_at < cutoff) releases.push({ c, rosterGuid: m.guid, why: "stale" });
  }
  // .115 (finding A): the same rows audit() wrote one statement each, in one statement per part: a realm move sights every
  // pinned member at once
  for (const part of inParts(sightings)) {
    await env.DB.prepare(
      `INSERT INTO audit (ts, actor, action, subject, details)
       SELECT ?1, 'system', 'roster.namesake_seen', json_extract(s.value, '$[0]'), json_extract(s.value, '$[1]') FROM json_each(?2) s ORDER BY s.key`,
    )
      .bind(now(), JSON.stringify(part))
      .run();
  }

  if (opts.cap !== undefined && releases.length > opts.cap) {
    for (const r of releases) out.held.add(r.c.name_key);
    await reportHeldReleases(env, releases, opts.cap);
  } else {
    for (const r of releases) {
      if (!admitted(RELEASE_WORST)) {
        out.held.add(r.c.name_key); // .115 (finding A): this invocation's statement budget; the next export or sync releases it
        out.deferred++;
        continue;
      }
      if (!(await releaseBinding(env, r.c, r.rosterGuid, r.why, opts.notices, opts.fence))) {
        out.held.add(r.c.name_key);
        continue;
      }
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
      if (!admitted(RENAME_WORST)) {
        out.held.add(r.c.name_key); // .115 (finding A): left under its old name for this invocation; the next export moves it
        out.deferred++;
        continue;
      }
      if (out.held.has(r.to.key)) {
        // the link under the new name is being held back this time (see `cap`), so this move waits with it
        out.held.add(r.c.name_key);
        await auditOnce(env, "roster.rename_waiting", `${r.c.name_key}>${r.to.key}`, { from: r.c.name, to: r.to.name, discordId: r.c.discord_id },undefined,[referenceOf(r.c)]);
        continue;
      }
      const moved = await moveBinding(env, r.c, r.to, opts.fence);
      if (moved === "moved") {
        out.renamed.push(`${r.c.name} → ${r.to.name}`);
        byKey.delete(r.c.name_key);
        r.c.name_key = r.to.key;
        r.c.name = r.to.name;
        byKey.set(r.to.key, r.c);
      } else {
        out.held.add(r.c.name_key);
        if (moved === "blocked" && await auditOnce(env, "roster.rename_blocked", `${r.c.name_key}>${r.to.key}`, { from: r.c.name, to: r.to.name, discordId: r.c.discord_id },undefined,[referenceOf(r.c)])) {
          await logLine(env, `⚠️ roster: **${r.c.name}** (<@${r.c.discord_id}>) is now called **${r.to.name}**, but that name is still linked to another account. Left as it is — an officer decides.`,[referenceOf(r.c)]);
        }
      }
    }
    if (later.length === todo.length) {
      for (const r of later) out.held.add(r.c.name_key);
      const swap = later.map((r) => `${r.c.name_key}>${r.to.key}`).sort().join(",");
      if (await auditOnce(env, "roster.rename_swap", swap.slice(0, 500), { moves: later.map((r) => ({ from: r.c.name, to: r.to.name, discordId: r.c.discord_id })) },undefined,later.map(r=>referenceOf(r.c)))) {
        await logLine(env, `⚠️ roster: ${later.map((r) => `**${r.c.name}** → **${r.to.name}**`).join(", ")} look like characters that swapped names. Left as they are — an officer decides.`,later.map(r=>referenceOf(r.c)));
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
async function auditOnce(env: Env, action: string, subject: string, details: unknown, every = 6 * 3600,references?:PrivacyReference[]): Promise<boolean> {
  const last = await env.DB.prepare("SELECT ts FROM audit WHERE action = ?1 AND subject = ?2 ORDER BY id DESC LIMIT 1").bind(action, subject).first<{ ts: number }>();
  if (last && now() - last.ts < every) return false;
  await audit(env, "system", action, subject, details,references);
  return true;
}

/** One rename in one transaction. A dead row under the new name (unbound, denied, left) is kept under an archive key
 *  rather than deleted: it is another account's history. Neither it nor the queue is touched when the source is stale. */
async function moveBinding(env: Env, c: BoundRow, to: { name: string; key: string }, fence: IdentityFence): Promise<"moved" | "blocked" | "stale"> {
  const binds = identityBinds(c, fence);
  const done = await env.DB.batch([
    env.DB.prepare(`SELECT 1 AS valid FROM characters c WHERE ${EXPECTED_BINDING}`).bind(...binds,null,null,c.privacy_generation),
    env.DB.prepare(`UPDATE characters SET name_key = name_key || '~' || bound_at || '~' || rowid
      WHERE name_key = ?8 AND status IN ('unbound','denied','left')
        AND EXISTS (SELECT 1 FROM characters c WHERE ${EXPECTED_BINDING})`).bind(...binds, to.key,null,c.privacy_generation),
    // Move the queue before the source key. The target has just been freed and both changes use the original binding.
    env.DB.prepare(`UPDATE invite_queue SET name_key = ?8, name = ?9 WHERE name_key = ?1 AND status IN ('queued','written','invited')
      AND NOT EXISTS (SELECT 1 FROM characters WHERE name_key = ?8)
      AND EXISTS (SELECT 1 FROM characters c WHERE ${EXPECTED_BINDING})`).bind(...binds, to.key, to.name,c.privacy_generation),
    env.DB.prepare(`UPDATE characters AS c SET name_key = ?8, name = ?9 WHERE ${EXPECTED_BINDING}
      AND NOT EXISTS (SELECT 1 FROM characters WHERE name_key = ?8)`).bind(...binds, to.key, to.name,c.privacy_generation),
  ]);
  if (!(done[0]?.results as Array<{ valid: number }> | undefined)?.[0]?.valid) return "stale";
  if (!Number(done[3]?.meta?.changes ?? 0)) return "blocked";
  await audit(env, "system", "roster.renamed", to.name, { from: c.name, discordId: c.discord_id, guid: c.guid },referenceOf(c));
  await logLine(env, `\u{1F501} roster: **${c.name}** is now **${to.name}** (same character) — link to <@${c.discord_id}> kept.`,[referenceOf(c)]);
  return "moved";
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
  await audit(env, "system", "roster.identity_held", undefined, { count: releases.length, stale, cap, names: releases.slice(0, 40).map((r) => r.c.name) },releases.slice(0,40).map(r=>referenceOf(r.c)));
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

/**
 * .115 (Codex's review of f975, 3 Oct 2026, 13:15 UTC, finding 2): the names of an export that collide once normalised
 * (codes.ts normalizeCharacter ignores case, extra spaces and a realm after a hyphen; the addon already sends the name
 * without its realm), each key with the export's spellings of it. The bot tells characters apart by that key everywhere
 * (roster_members' primary key, characters.name_key), so two entries under one key are a roster it cannot represent:
 * INSERT OR REPLACE would keep one row while member_count counted both (a complete stamp over an inflated count, which
 * the seat state would believe), and the identity rules would read the second GUID as a namesake of the first.
 */
export function duplicateNames(members: RosterMemberIn[]): Array<{ key: string; names: string[] }> {
  const seen = new Map<string, string[]>();
  for (const m of members) {
    const key = normalizeCharacter(m.name);
    const names = seen.get(key);
    if (names) names.push(m.name);
    else seen.set(key, [m.name]);
  }
  return [...seen].filter(([, names]) => names.length > 1).map(([key, names]) => ({ key, names }));
}

/** Staff are told once, and again only after six hours (auditOnce), while the same names keep colliding: the addon
 *  re-exports on every roster update, and each of those exports is refused the same way. */
async function reportDuplicateNames(env: Env, count: number, dupes: Array<{ key: string; names: string[] }>) {
  const shown = dupes.slice(0, 10).map((d) => d.names.join(" / "));
  const subject = dupes.map((d) => d.key).sort().join(",").slice(0, 500);
  if (await auditOnce(env, "roster.duplicate_names", subject, { members: count, duplicates: dupes.length, names: shown })) {
    await logLine(
      env,
      `⚠️ roster: an export of ${count} members was refused: ${shown.map((s) => `**${s}**`).join(", ")}${dupes.length > shown.length ? `, … (${dupes.length} in all)` : ""} ` +
        `— the same name more than once, ignoring case and realm. The bot tells characters apart by that name, so nothing was stored ` +
        `and no role or link changed; the last export still stands. Every export is refused until each name appears once.`,
    );
  }
}

/**
 * One roster sync can promote or strip many people at once. Their notices are collected and posted together at the end
 * (dm.ts), in a `finally` so notices for work that did complete still go out if something later throws.
 *
 * .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): every statement attempt of the invocation is counted
 * from here on (roster-effects.ts countStatements), the notices' flush included, and each member effect is admitted
 * against ROSTER_INGEST_STATEMENTS (scheduled-budget.ts) before it starts; whatever does not fit stays in the worklist for
 * the next export or the cron.
 */
export async function ingestRoster(env: Env, exportedAt: number, members: RosterMemberIn[], source: "addon" | "api") {
  const count = { used: 0 };
  const counted = countStatements(env, count);
  const notices = noticeBatch();
  try {
    return await ingestRosterInner(counted, { count, limit: ROSTER_INGEST_STATEMENTS }, exportedAt, members, source, notices);
  } finally {
    await flushNotices(counted, notices);
  }
}

/** An export within the shrink limit of a base count (a base of 0 is no limit: the ingest skips the shrink check there too). */
const withinShrink = (base: number, count: number, maxShrinkPct: number) => base <= 0 || ((base - count) / base) * 100 <= maxShrinkPct;
/** How many pre-.115 rows seatBase re-judges at most; an older chain starts from the first row of that window. */
const SEAT_BASE_WALK = 1000;

/**
 * .115 (review of 3 Oct 2026): the member count an export is judged against for the seat count when the row before it
 * is not itself trusted. It is the newest snapshot up to `upTo` that counts, exported on or after LINKS_NOT_BEFORE (the
 * beta's last export is no evidence about live). A .115 row counts when it is complete and trusted. A pre-.115 row
 * (complete NULL) is re-judged here in id order, exactly as the back-fill judges it: the ingest never distrusted it and it
 * is within the shrink limit of the base before it; so 1000 -> 850 (distrusted) -> 851 -> 852 written before .115 never
 * makes 852 a base. Only the rows after the newest trusted .115 row are walked, which is none once one exists. Null when
 * nothing counts; the caller then keeps the ingest's own decision.
 */
async function seatBase(env: Env, upTo: number, cut: number, maxShrinkPct: number): Promise<number | null> {
  const [last, older] = await env.DB.batch([
    env.DB.prepare("SELECT member_count FROM roster_snapshots WHERE id <= ?1 AND exported_at >= ?2 AND trusted = 1 AND complete = 1 ORDER BY id DESC LIMIT 1").bind(upTo, cut),
    env.DB.prepare(
      `SELECT s.member_count AS member_count,
              EXISTS (SELECT 1 FROM audit WHERE actor = 'watcher' AND action = 'roster.distrusted' AND subject = CAST(s.id AS TEXT)) AS distrusted
         FROM roster_snapshots s
        WHERE s.id <= ?1 AND s.exported_at >= ?2 AND s.complete IS NULL
          AND s.id > COALESCE((SELECT MAX(id) FROM roster_snapshots WHERE id <= ?1 AND exported_at >= ?2 AND trusted = 1 AND complete = 1), 0)
        ORDER BY s.id DESC LIMIT ${SEAT_BASE_WALK}`,
    ).bind(upTo, cut),
  ]);
  let base = ((last?.results ?? [])[0] as { member_count: number } | undefined)?.member_count ?? null;
  const chain = ((older?.results ?? []) as Array<{ member_count: number; distrusted: number }>).reverse();
  for (const r of chain) if (!r.distrusted && (base === null || withinShrink(base, r.member_count, maxShrinkPct))) base = r.member_count;
  return base;
}

async function ingestRosterInner(env: Env, adm: Admission, exportedAt: number, members: RosterMemberIn[], source: "addon" | "api", notices: NoticeBatch) {
  // .115 (Codex's review of f975, 3 Oct 2026, 13:15 UTC, finding 2): an export naming one character key twice is refused
  // before anything is read or written: no snapshot, no member rows, no first-seen dates, no link, character or role
  // change. ingest.ts answers 422, which the watcher takes as final (a 4xx is not retried); the next export is judged
  // afresh. Fail closed: the last export still stands, as after an export that never arrived.
  const dupes = duplicateNames(members);
  if (dupes.length) {
    await reportDuplicateNames(env, members.length, dupes);
    return { refused: "duplicate_names" as const, members: members.length, duplicates: dupes.length };
  }
  const calls = callBudget(env); // .90 (P-20): one Discord-call budget for this export's promotions; a deferred grant is the sweep's
  // .115 (finding A): the newest effects run comes with the newest snapshot, in the same read (LATEST_SNAPSHOT_AND_RUN)
  const prev = await env.DB.prepare(LATEST_SNAPSHOT_AND_RUN).first<LatestRow>();
  // .115 (review of 3 Oct 2026): a latest row left unfinished (SNAPSHOT_WRITE_GRACE_S) is not a snapshot to refresh. This
  // export is written again in full, even when it is identical or the same export sent again, so an unfinished row cannot
  // outlive an unchanged roster (a full guild hardly changes). Inside the grace it may still be another export's write.
  const stuck = !!prev && prev.complete === 0 && (prev.first_received_at ?? 0) <= now() - SNAPSHOT_WRITE_GRACE_S;
  if (prev?.complete === 0 && !stuck) {
    // The first request may still be storing rows. Do not acknowledge its retry (the watcher would drop the packet), or
    // refresh an identical fingerprint and derive from a partial row set. A 5xx keeps the packet pending until the
    // original finishes or the grace expires, when the same export can rebuild the snapshot in full.
    throw new Error("Roster snapshot is still being written; retry this export");
  }
  const fullyStored = !!prev && prev.complete === 1 && prev.stored_count === prev.member_count;
  if (prev && (prev.exported_at > exportedAt || (prev.exported_at === exportedAt && !stuck && fullyStored))) {
    // .115 (finding A): an export older than the stored one, or the same one sent again, still changes no snapshot. But the
    // newest snapshot's effects may be unfinished (its invocation stopped partway, or its slice did not reach every item),
    // and a retry is exactly when the watcher is back: it resumes them rather than answering "older" and leaving them.
    const effects = await resumeEffects(env, adm, prev, calls, notices);
    return { skipped: true, reason: "older than the last snapshot", effects };
  }
  const cut = linksNotBefore(env);

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
  const unchanged = !!prev && !stuck && prev.content_hash === fingerprint;
  let run: EffectRun | null = null; // .115 (finding A): the effects run this export derives, if any
  let waiting = false; // .115 (finding A): the newest run is this snapshot's, underived, and inside the grace

  // .115 (Viktor, item B, 2 Oct 2026): seats and News read whether an export was complete and trusted against the last
  // trusted one; received_at and exported_at move with identical re-exports. `trusted` above is still the ingest's own
  // decision (against the previous row) and still the only thing that decides removals; what the row records for the
  // seat count is stricter, so 1000 -> 850 (distrusted) -> 851 stays distrusted until an officer runs /olympus-admin sync.
  if (unchanged) {
    // ?4 is this run's floor check (the shrink check against an identical row is always 0). A refresh never raises
    // trust; a row still being written by another export (complete 0, inside the grace) is left alone; a pre-.115 row
    // (complete NULL) is judged once, from its own ingest audit, a member count and (review of 3 Oct 2026, ?6) the shrink
    // limit of the base before it (seatBase), and a failed count leaves it trusted 0 (fail closed). Codex's review of f975
    // (3 Oct 2026, 13:15 UTC, finding 2): its complete stamp proves the same count, so `complete = 1` always means every
    // member row is stored; a pre-.115 row with rows missing becomes complete 0 instead, an unfinished row (first_received_at
    // is NULL, so at once "stuck"), which the next export writes again in full and /olympus-admin sync never applies.
    let baseOk = 1;
    if (prev!.complete === null && prev!.trusted === null) {
      const base = await seatBase(env, prev!.id - 1, cut, maxShrinkPct);
      baseOk = base === null || withinShrink(base, prev!.member_count, maxShrinkPct) ? 1 : 0;
    }
    const refreshed = await env.DB.prepare(
      `UPDATE roster_snapshots SET exported_at = ?2, received_at = ?3,
              trusted = CASE
                WHEN complete IS NULL AND trusted IS NULL THEN (CASE WHEN ?4 = 1 AND ?6 = 1
                       AND NOT EXISTS (SELECT 1 FROM audit WHERE actor = 'watcher' AND action = 'roster.distrusted' AND subject = ?5)
                       AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = ?1) = member_count THEN 1 ELSE 0 END)
                WHEN complete = 0 THEN trusted
                ELSE MIN(trusted, ?4) END,
              complete = CASE WHEN (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = ?1) = member_count
                THEN COALESCE(complete, 1) ELSE 0 END
         WHERE id = ?1 RETURNING complete`,
    )
      .bind(prev!.id, exportedAt, now(), trusted ? 1 : 0, String(prev!.id), baseOk)
      .first<{ complete: number }>();
    // The count check may have just exposed a pre-.115 row with missing members. Keep the packet retryable so the
    // incomplete snapshot is rebuilt after its write grace; never create a run or apply any effect from that row.
    if (refreshed?.complete !== 1) throw new Error("Roster snapshot is incomplete; retry this export");
    snapId = prev!.id;
    // .115 (finding A): an identical export still has its diff applied (someone may have verified since the last one). The
    // newest run is resumed when it is this snapshot's and was never derived (its invocation stopped first; within
    // SNAPSHOT_WRITE_GRACE_S of its start another export may be deriving it right now, and it is left to that one).
    // Otherwise a new run of this snapshot is started, judged against itself (an identical export arms no first absence,
    // and confirms a namesake the stored export sighted, as before), and it supersedes any older run.
    if (prev!.run_id !== null && prev!.run_snapshot === snapId && prev!.run_derived === null) {
      run = now() - (prev!.run_created ?? 0) >= SNAPSHOT_WRITE_GRACE_S ? runOf(prev!) : null;
      waiting = run === null;
      // The cron applies derived items only. Until derivation is safe to resume, retain this packet at the watcher so
      // there is a guaranteed later attempt even when the guild roster never changes again.
      if (waiting) throw new Error("Roster effects are awaiting derivation; retry this export");
    } else {
      const ins = await env.DB.prepare(`INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at)
        SELECT ?1, ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM roster_snapshots s
          WHERE s.id = ?1 AND s.id = (SELECT MAX(id) FROM roster_snapshots) AND s.complete = 1
            AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id))`)
        .bind(snapId, trusted ? 1 : 0, now())
        .run();
      if (Number(ins.meta.changes) !== 1) throw new Error("Roster snapshot changed before its effects; retry this export");
      run = { id: Number(ins.meta.last_row_id), snapshot_id: snapId, prev_snapshot_id: snapId, removals: trusted ? 1 : 0 };
    }
  } else {
    // A new export after a row that is not itself trusted (distrusted, unfinished, or pre-.115 and not yet judged) is
    // judged against the last export that counts (seatBase), not that row (only here: a refresh of an identical export
    // never raises trust, so it needs no base). Review of 3 Oct 2026: a previous row from before LINKS_NOT_BEFORE, or no
    // base on or after it, keeps the ingest's own decision (the floor, and the shrink against the previous row), so the
    // live guild's first exports after the beta's 1000 are not distrusted for being smaller than the beta.
    let recordTrusted = trusted;
    if (trusted && prev && prev.trusted !== 1 && prev.exported_at >= cut) {
      const base = await seatBase(env, prev.id, cut, maxShrinkPct);
      if (base !== null) recordTrusted = withinShrink(base, members.length, maxShrinkPct);
    }
    // complete 0 until the last member batch is in, so a half-written snapshot never counts; trusted stays NULL until then.
    const t = now();
    const ins = await env.DB.prepare(
      "INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, first_received_at, complete) VALUES (?1, ?2, ?3, ?4, ?5, ?2, 0)",
    )
      .bind(exportedAt, t, source, members.length, fingerprint)
      .run();
    snapId = ins.meta.last_row_id as number;

    // Review of 3 Oct 2026 (D1's per-invocation statement limit; CLAUDE.md "The cron's D1 budget"): D1 counts every
    // statement of a batch toward one invocation's 1,000, so one INSERT per member made a changed export of a full guild
    // about 1,007 statements, over the limit in its last batch, exactly when the seat count matters. Each batch is now ONE
    // INSERT ... SELECT over json_each of up to ROSTER_ROWS_PER_STATEMENT members (the house pattern of departureIntake),
    // so an export of N members writes its rows in ceil(N / 50) statements, in the same batches as before. The values are
    // the ones the per-member binds carried (name key and GUID computed here), in column order.
    const rowValues = members.map((m) => [normalizeCharacter(m.name), m.name, m.rank ?? null, m.rankIndex ?? null, m.level ?? null, m.class ?? null, m.note ?? null, m.officerNote ?? null, guidOf(m.guid), m.lastOnline ?? null]);
    const col = (k: number) => `json_extract(j.value, '$[${k}]')`;
    const chunks: D1PreparedStatement[][] = [];
    for (let i = 0; i < rowValues.length; i += ROSTER_ROWS_PER_STATEMENT) {
      chunks.push([
        env.DB.prepare(
          `INSERT OR REPLACE INTO roster_members (snapshot_id, name_key, name, rank, rank_index, level, class, public_note, officer_note, guid, last_online)
           SELECT ?1, ${[0,1,2,3,4,5].map(col).join(',')},
             CASE WHEN EXISTS(SELECT 1 FROM privacy_subjects ps WHERE (ps.state<>'active' OR ps.erased_at IS NOT NULL) AND instr(COALESCE(${col(6)},''),ps.subject_id)>0) THEN NULL ELSE ${col(6)} END,
             CASE WHEN EXISTS(SELECT 1 FROM privacy_subjects ps WHERE (ps.state<>'active' OR ps.erased_at IS NOT NULL) AND instr(COALESCE(${col(7)},''),ps.subject_id)>0) THEN NULL ELSE ${col(7)} END,
             ${col(8)},${col(9)} FROM json_each(?2) j`,
        ).bind(snapId, JSON.stringify(rowValues.slice(i, i + ROSTER_ROWS_PER_STATEMENT))),
      ]);
    }
    // .115: the snapshot is complete, and records its trust for the seat count, in the same transaction as its last member
    // rows (review of 3 Oct 2026): a separate stamp could fail after every row was in and leave the row unfinished while
    // the watcher heard success. An export with no members writes the stamp alone. Codex's review of f975 (3 Oct 2026,
    // 13:15 UTC, finding 2): the stamp also proves, inside that transaction, that the stored rows number member_count, so
    // no snapshot is ever complete over an inflated count. Duplicate names are refused above, so it always holds.
    if (chunks.length === 0) chunks.push([]);
    // .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): the snapshot's effects run is created in that same
    // transaction, and only when the stamp held, so a complete snapshot always has its run and no run outlives a snapshot
    // taken back out. Departures are judged against the last snapshot whose diff was applied (LatestRow), which is the
    // previous one unless an earlier invocation stopped before deriving its own (its first absences would otherwise never
    // be armed).
    const applied = prev ? prev.applied_snapshot : null;
    chunks[chunks.length - 1].push(
      env.DB.prepare(
        "UPDATE roster_snapshots SET complete = 1, trusted = ?2 WHERE id = ?1 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = ?1) = member_count",
      ).bind(snapId, recordTrusted ? 1 : 0),
      env.DB.prepare(
        "INSERT INTO roster_effect_runs (snapshot_id, prev_snapshot_id, removals, created_at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM roster_snapshots WHERE id = ?1 AND complete = 1)",
      ).bind(snapId, applied, trusted ? 1 : 0, t),
    );
    let stamped = 0;
    let made: { changes?: number; last_row_id?: number } | undefined;
    try {
      for (const chunk of chunks) {
        const res = await env.DB.batch(chunk);
        stamped = Number(res[res.length - 2]?.meta?.changes ?? 0); // the last chunk ends with the stamp and the run
        made = res[res.length - 1]?.meta as { changes?: number; last_row_id?: number } | undefined;
      }
    } catch (e) {
      // The member rows (or the last batch with the stamp) failed partway through, so this snapshot is a lie: it claims
      // member_count members and holds fewer. Left in place it also poisons every retry, because the next attempt sees a
      // snapshot with the same exported_at and answers "older than the last snapshot" instead of trying again — which is
      // exactly what happened for half an hour on 18 September. Take the snapshot row back out and let the caller retry
      // for real (a 500; the watcher keeps the post and sends it again).
      await env.DB.prepare("DELETE FROM roster_members WHERE snapshot_id = ?1").bind(snapId).run();
      await env.DB.prepare("DELETE FROM roster_snapshots WHERE id = ?1").bind(snapId).run();
      await audit(env, "watcher", "roster.ingest_failed", String(snapId), { members: members.length, error: String(e).slice(0, 300) });
      throw e;
    }
    if (stamped !== 1) {
      // Review of 3 Oct 2026 (of the fixes for Codex's 13:15 UTC findings): every batch committed, and the stamp still found
      // the stored rows short of the count. That is no passing failure: sending the same export again stores the same rows,
      // and a 500 would make the watcher hold every later post (verifications, joins, invites) behind this one, because its
      // outbox stops at the first failure to keep the order (watcher.py flush_outbox). So the snapshot goes back out as
      // above, and the export is refused as final: a 422 like duplicate names (ingest.ts), which the watcher does not
      // retry. Fail closed: nothing is applied and the last export still stands. Staff are told, with counts only.
      const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM roster_members WHERE snapshot_id = ?1").bind(snapId).first<{ n: number }>();
      await env.DB.prepare("DELETE FROM roster_members WHERE snapshot_id = ?1").bind(snapId).run();
      await env.DB.prepare("DELETE FROM roster_snapshots WHERE id = ?1").bind(snapId).run();
      const stored = Number(kept?.n ?? 0);
      if (await auditOnce(env, "roster.ingest_unusable", "stamp", { members: members.length, stored })) {
        await logLine(
          env,
          `⚠️ roster: an export of ${members.length} members was refused: only ${stored} of its member rows were stored, so it cannot say who is in the guild. ` +
            `Nothing was applied and no role or link changed; the last export still stands. Tell the bot's maintainers.`,
        );
      }
      return { refused: "unusable" as const, members: members.length, stored };
    }
    const madeId = Number(made?.changes ?? 0) === 1 ? Number(made?.last_row_id) : NaN;
    run = Number.isInteger(madeId) && madeId > 0 ? { id: madeId, snapshot_id: snapId, prev_snapshot_id: applied, removals: trusted ? 1 : 0 } : await runOfSnapshot(env, snapId);
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
    effects: null as EffectsReport | null,
  };
  if (!trusted) {
    await audit(env, "watcher", "roster.distrusted", String(snapId), { members: members.length, reason: distrustReason });
    await logLine(
      env,
      `\u26a0\ufe0f roster: export #${snapId} looks truncated — ${distrustReason}. Stored, but **no roles were removed**. ` +
        `If the guild really did shrink that much, run \`/olympus-admin sync\` to apply it.`,
    );
  }

  // 1 and 2, the diff (.115, third review round; Codex, 3 Oct 2026 16:48 UTC, finding A): derived for this export's run in
  // a bounded number of statements (deriveRun: the identity rules, then the pins, returns and first absences in bulk, and
  // every promotion, D: note and confirmed departure as an item of the worklist), then a slice of the worklist applied, each
  // item admitted at its worst case against what this invocation has left. The next export or the cron applies the rest.
  const rows = members.map((m) => ({ name_key: normalizeCharacter(m.name), name: m.name, guid: guidOf(m.guid), public_note: m.note ?? null }));
  const derived = run ? await deriveRun(env, adm, run, rows, notices, SLICE_FIXED + INGEST_TAIL) : null;
  if (derived) {
    summary.renamed = derived.renamed;
    summary.released = derived.released;
    summary.held = derived.held;
    summary.pinned = derived.pinned;
    summary.returned = derived.returned;
    summary.pendingLeft = derived.pendingLeft;
  }
  const slice = await applyEffects(env, adm, INGEST_TAIL, calls, notices);
  summary.promoted = slice.promoted;
  summary.noteBound = slice.noteBound;
  summary.stripped = slice.stripped;
  summary.effects = effectsReport(run?.id ?? (waiting ? prev!.run_id : null), derived, slice, waiting);

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
    effects: summary.effects, // .115 (finding A): the run, its items and this slice, counts only
  });
  return summary;
}

/**
 * Re-apply the newest snapshot by hand: promote everyone on it who has a verified binding, and remove the role from
 * every member character that is not on it. Used by `/olympus-admin sync` after a distrusted (short) export, and as
 * the officer's answer to "it says I should have the role and I don't". Bypasses the two-export rule on purpose —
 * a human asked for it. Since .115 (Codex's review of f975, 3 Oct 2026) it first refuses, changing nothing, a snapshot
 * that is still being written or whose member rows are not all stored (SyncRefused below).
 *
 * .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): the same per-member effects as an export, so the
 * same bound. Every statement attempt is counted and each effect admitted against ROSTER_SYNC_STATEMENTS before it starts;
 * what does not fit is left exactly as it is and counted in `deferred`, and the officer runs sync again (each run applies
 * only what is still due, so a repeat continues where the last one stopped).
 */
export async function syncFromLatest(env: Env): Promise<SyncResult | SyncRefused | null> {
  const count = { used: 0 };
  const counted = countStatements(env, count);
  const notices = noticeBatch();
  try {
    return await syncFromLatestInner(counted, { count, limit: ROSTER_SYNC_STATEMENTS }, notices);
  } finally {
    await flushNotices(counted, notices);
  }
}

export interface SyncResult {
  snapshot: number;
  promoted: string[];
  stripped: string[];
  released: string[];
  renamed: string[];
  held: number;
  /** .115 (finding A): links, promotions and removals left for the next sync by this one's statement budget */
  deferred: number;
}

/**
 * .115 (Codex's review of f975, 3 Oct 2026, 13:15 UTC, finding 1): why /olympus-admin sync applied nothing. A sync removes
 * the role from every member character missing from the latest snapshot, so it may act only on a snapshot whose member
 * rows are all there, and that is decided before any link, character or role changes. "writing": still complete 0 inside
 * SNAPSHOT_WRITE_GRACE_S (its export may still be adding rows). "incomplete": it stores fewer member rows than its export
 * listed (left unfinished, a pre-.115 row with rows missing). A fully stored export that is distrusted (a large shrink) is
 * not refused: applying it anyway is the person's override this command exists for, and so is a row left unfinished
 * whose member rows turn out to be all there.
 */
export interface SyncRefused {
  snapshot: number;
  refused: "writing" | "incomplete";
  memberCount: number;
  stored: number;
  firstReceivedAt: number | null;
}

/** What a sync still needs after its effects: roster.sync (1) and the notices' read. */
const SYNC_TAIL = 1 + NOTICE_FLUSH_FIXED;

async function syncFromLatestInner(env: Env, adm: Admission, notices: NoticeBatch): Promise<SyncResult | SyncRefused | null> {
  const calls = callBudget(env); // .90 (P-20)
  const snap = await env.DB.prepare("SELECT id, member_count, complete, first_received_at FROM roster_snapshots ORDER BY id DESC LIMIT 1").first<{
    id: number;
    member_count: number;
    complete: number | null;
    first_received_at: number | null;
  }>();
  if (!snap) return null;
  const rows = await env.DB.prepare("SELECT name_key, name, guid FROM roster_members WHERE snapshot_id = ?1").bind(snap.id).all<{ name_key: string; name: string; guid: string | null }>();
  // The admission (finding 1 above), on the rows exactly as read: they are the ones the sync would apply, and roster_members'
  // primary key makes their number the number of distinct characters stored.
  const stored = rows.results.length;
  const refuse = (refused: SyncRefused["refused"]): SyncRefused => ({ snapshot: snap.id, refused, memberCount: snap.member_count, stored, firstReceivedAt: snap.first_received_at ?? null });
  if (snap.complete === 0 && (snap.first_received_at ?? 0) > now() - SNAPSHOT_WRITE_GRACE_S) return refuse("writing");
  if (stored !== snap.member_count) return refuse("incomplete");
  const onRoster = new Map(rows.results.map((r) => [r.name_key, r] as const));
  const bound = await env.DB.prepare(
    BOUND_SELECT,
  ).all<BoundRow>();
  const byKey = new Map(bound.results.filter(capturedActive).map((c) => [c.name_key, c] as const));
  // Same identity rules as a roster export, without the cap: a person asked, and this is how a held batch is applied.
  // Only a name swap between two linked characters is still held (reconcileIdentities).
  const ident = await reconcileIdentities(env, rows.results, byKey, {
    notices,
    fence: { snapshotId: snap.id },
    admit: (cost) => room(adm, IDENTITY_FIXED + SYNC_TAIL + noticeStatementsPending(notices)) >= cost,
  });
  const out: SyncResult = {
    snapshot: snap.id,
    promoted: [],
    stripped: [],
    released: ident.released,
    renamed: ident.renamed,
    held: ident.held.size - ident.deferred,
    deferred: ident.deferred,
  };
  for (const c of byKey.values()) {
    if (ident.held.has(c.name_key) || c.status === "left") continue;
    const row = onRoster.get(c.name_key);
    const g = guidOf(row?.guid);
    if (row && g && c.guid && c.guid !== g) continue;
    const pin = !!row && !!g && !c.guid;
    const promoting = !!row && c.status !== "member";
    const removing = !row && (c.status === "member" || c.status === "left_pending");
    // .115 (finding A): admitted before it starts, at its worst case: a pin and a promotion cost what a worklist promotion
    // does (the pin in place of the claim; the grant's share smaller once the call budget cannot afford one), a removal
    // what a departure does, a pin alone one statement
    const worst = promoting ? (env.PRIVACY_ERASURE_ENABLED==='true'||affords(calls, GRANT_CALLS) ? effectWorst(env).promote : EFFECT_DEFERRED_WORST.promote) : removing ? effectWorst(env).depart : pin ? 1 : 0;
    if (!worst) continue;
    if (room(adm, SYNC_TAIL + noticeStatementsPending(notices)) < worst) {
      out.deferred++;
      continue;
    }
    if (pin) await env.DB.prepare(`UPDATE characters SET guid = ?2 WHERE name_key = ?1 AND guid IS NULL AND discord_id=?3 AND ${privacyGenerationFenceSql(3,4)}`).bind(c.name_key, g,c.discord_id,c.privacy_generation).run();
    if (promoting) {
      await promote(env, c.discord_id, c.name_key, row!.name, notices, g, calls,captureOf(c));
      out.promoted.push(row!.name);
    } else if (removing) {
      await demote(env, c.discord_id, c.name_key, c.name, "manual sync", { batch: notices,capture:captureOf(c) });
      out.stripped.push(c.name);
    }
  }
  await audit(env, "system", "roster.sync", String(snap.id), {
    promoted: out.promoted.length,
    stripped: out.stripped.length,
    released: out.released.length,
    renamed: out.renamed.length,
    held: out.held,
    deferred: out.deferred,
  });
  return out;
}

/** A member character is gone from the guild (roster diff, or a "has left/been kicked" line relayed by the watcher). */
export async function demote(env: Env, discordId: string, nameKey: string, name: string, how: string, opts: { space?: boolean; batch?: NoticeBatch;capture?:PrivacySubject|null } = {}) {
  const capture=opts.capture===undefined?await readPrivacySubject(env,discordId):opts.capture;
  const changed=await env.DB.prepare(`UPDATE characters SET status = 'left', left_at = ?2 WHERE name_key = ?1 AND discord_id=?3 AND ${privacyGenerationFenceSql(3,4)}`).bind(nameKey, now(),discordId,capture?.subjectGeneration??null).run();
  if(!changed.meta.changes)return;
  opts={...opts,capture};
  await afterDeparture(env, discordId, name, how, opts);
}

/**
 * What follows a departure's status change (.115, finding A: shared by demote and the worklist's departures, whose status
 * change rides in the item's claim): Guild Member removed when it was the account's last member character, the staff roles
 * that still give access read, roster.left, the log line, and the seat notice when the seat was freed. At most four
 * statements (roster-effects.ts EFFECT_WORST.depart).
 */
async function afterDeparture(env: Env, discordId: string, name: string, how: string, opts: { space?: boolean; batch?: NoticeBatch;capture?:PrivacySubject|null }) {
  const capture=opts.capture===undefined?await readPrivacySubject(env,discordId):opts.capture,reference={subject:discordId,capture};
  const remaining = await env.DB.prepare(`SELECT COUNT(*) AS n,(${privacyGenerationFenceSql(1,2)}) AS current FROM characters WHERE discord_id = ?1 AND status = 'member'`).bind(discordId,capture?.subjectGeneration??null).first<{ n: number;current:number }>();
  if(!remaining?.current)return;
  const last = (remaining?.n ?? 0) === 0;
  let removed=false;
  let kept: string[] = [];
  if (last) {
    if (env.ROLE_GUILD_MEMBER) {
      try {
        const central=await import('./roles') as unknown as {settleGuildDepartureRole?:(env:Env,subject:string,capture:{subjectGeneration:string|null})=>Promise<{state:string;reason?:string}>};
        if(env.PRIVACY_ERASURE_ENABLED!=='true'){await removeRole(env,discordId,env.ROLE_GUILD_MEMBER,`olympus-verify: ${name} left the guild (${how})`);removed=true;}
        else if(!central.settleGuildDepartureRole)await audit(env,'system','role.remove_held',name,{reason:'central_departure_adapter_unavailable'},reference);
        else {const outcome=await central.settleGuildDepartureRole({...env,DB:privacyProviderCustodyDatabase(env)},discordId,{subjectGeneration:capture?.subjectGeneration??null});
         removed=outcome.state==='absent'||outcome.state==='removed'||outcome.state==='settled';
         if(!removed)await audit(env,'system','role.remove_held',name,{reason:outcome.reason??outcome.state},reference);
        }
      } catch (e) {
        await audit(env, "system", "role.remove_failed", name, { error: String(e) },reference);
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
      await audit(env, "system", "roles.read_failed", name, { discordId, error: String(e) },reference);
    }
  }
  await audit(env, "system", opts.space ? "roster.freed_seat" : "roster.left", name, { discordId, how, keptRoles: kept },reference);
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
      capture,
    );
  }
  const keptNote = kept.length
    ? ` \u2014 but they still hold ${kept.map((r) => `<@&${r}>`).join(", ")}, which keeps their channel access; remove those by hand if they should lose it`
    : "";
  await logLine(
    env,
    opts.space
      ? `\u{1FA91} seat freed: **${name}** (<@${discordId}>) was removed to make room${last ? removed?" \u2014 Guild Member role absent or removed":" \u2014 Guild Member removal remains held" : ""}${keptNote}. Their verification is kept, so a re-invite needs no new code.`
      : `\u2796 roster: **${name}** (<@${discordId}>) is no longer in the guild (${how})${last ? removed?" \u2014 Guild Member role absent or removed":" \u2014 Guild Member removal remains held" : ""}${keptNote}.`,
    [reference],
  );
}

/** Character confirmed on the roster with a verified binding → member: Guild Member role, nickname, log line, DM. */
export async function promote(env: Env, discordId: string, nameKey: string, name: string, batch?: NoticeBatch, guid?: string | null, calls?: CallBudget,originalCapture?:PrivacySubject|null) {
  const capture=originalCapture===undefined?await readPrivacySubject(env,discordId):originalCapture;
  if(capture&&capture.state!=='active')return;
  const t = now();
  const g = guidOf(guid); // pinned only if none is: a pin is never overwritten here (reconcileIdentities decides that)
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE characters SET status = 'member', member_since = COALESCE(member_since, ?2), left_at = NULL, guid = COALESCE(guid, ?3) WHERE name_key = ?1 AND discord_id=?4 AND ${privacyGenerationFenceSql(4,5)}`,
    ).bind(nameKey, t, g,discordId,capture?.subjectGeneration??null),
    env.DB.prepare(`UPDATE invite_queue SET status = 'joined', joined_at = ?2 WHERE name_key = ?1 AND discord_id=?3 AND status IN ('queued','written','invited') AND ${privacyGenerationFenceSql(3,4)}`).bind(nameKey, t,discordId,capture?.subjectGeneration??null),
  ]);
  await afterPromotion(env, discordId, name, batch, calls,capture);
}

/**
 * What follows a promotion's database change (.115, finding A: shared by promote and the worklist's promotions, whose
 * change rides in the item's claim): the role through the one writer within the run's call budget, the nickname,
 * roster.member (which the role sweep reads to grant a deferred role), the log line and the welcome. At most twelve
 * statements, the welcome's share of the notices' flush included (roster-effects.ts EFFECT_WORST.promote less the claim).
 */
async function afterPromotion(env: Env, discordId: string, name: string, batch?: NoticeBatch, calls?: CallBudget,capture:PrivacySubject|null=null,deferCronRole=false) {
  const reference={subject:discordId,capture};
  if(!(await env.DB.prepare(`SELECT (${privacyGenerationFenceSql(1,2)}) AS current`).bind(discordId,capture?.subjectGeneration??null).first<{current:number}>())?.current)return;
  // The role grant is optional (ROLE_GUILD_MEMBER may be unset once the role is retired), and nothing below depends
  // on it succeeding. Until 26 Sep the nickname and welcome sat after addRole inside one try, so any role failure —
  // including the role simply having been deleted — silently stopped nicknames as well.
  let granted = false;
  let blocked = false;
  if (env.ROLE_GUILD_MEMBER) {
    try {
      // .55: through the one role writer (roles.ts): a held blocking role withholds the grant, fail-closed config too.
      const writer=grantMemberRole as unknown as (...args:[Env,string,string,string,string[]|undefined,CallBudget|undefined,{subjectGeneration:string|null}])=>ReturnType<typeof grantMemberRole>;
      const roleEnv=env.PRIVACY_ERASURE_ENABLED==='true'?{...env,DB:privacyProviderCustodyDatabase(env)}:env;
      const roleCalls=deferCronRole&&calls?{...calls,limit:0}:calls;
      const outcome = await writer(roleEnv, discordId, `olympus-verify: ${name} confirmed on the guild roster`, "promote", undefined, roleCalls,{subjectGeneration:capture?.subjectGeneration??null});
      granted = outcome === "granted" || outcome === "has-role";
      blocked = outcome === "blocked";
      if(deferCronRole)await audit(env,"system","role.deferred",name,{discordId,source:"promote",reason:outcome},reference);
      else {
      if (blocked) await logLine(env, `⛔ roster: **${name}** (<@${discordId}>) is on the roster, but a server restriction is on the account; Guild Member withheld until it is lifted.`,[reference]);
      else if (outcome === "held") await logLine(env, `⏸️ roster: **${name}** (<@${discordId}>) is on the roster, but the account must apply again after a rename Blizzard required; Guild Member withheld until an administrator approves it.`,[reference]); // .114
      else if (outcome === "misconfigured") await logLine(env, `⚠️ roster: ROLE_GUILD_MEMBER is not a role of this server; no Guild Member granted for **${name}**.`,[reference]);
      else if (outcome === "unverified" || outcome === "budget") await audit(env, "system", "role.deferred", name, { discordId, source: "promote", reason: outcome },reference);
      else if (outcome === "banned") await audit(env, "system", "role.refused_banned", name, { discordId },reference);
      }
    } catch (e) {
      await audit(env, "system", "role.add_failed", name, { discordId, error: String(e) },reference);
      if(!deferCronRole)await logLine(env, `⚠️ roster: could not grant Guild Member to <@${discordId}> for **${name}**: ${explainDiscordError(e)}`,[reference]);
    }
  }
  if (env.SET_NICKNAME === "true") {
    if(!(await env.DB.prepare(`SELECT (${privacyGenerationFenceSql(1,2)}) AS current`).bind(discordId,capture?.subjectGeneration??null).first<{current:number}>())?.current)return;
    try {
      await setNickname(env, discordId, name.slice(0, 32));
    } catch (e) {
      await audit(env, "system", "nick.failed", name, { error: String(e) },reference); // owner/higher roles cannot be renamed by a bot
    }
  }
  await audit(env, "system", "roster.member", name, { discordId, roleGranted: granted, roleBlocked: blocked },reference);
  if(deferCronRole)return; // the original claim retains the cron welcome/log; attended and manual behavior is unchanged
  await logLine(env, `➕ roster: **${name}** (<@${discordId}>) confirmed on the roster${granted ? " — Guild Member granted" : deferCronRole ? " — Guild Member pending the central role sweep" : ""}.`,[reference]);
  await notify(env, discordId, `Welcome to Olympus — **${name}** is on the guild roster.`, "welcome", batch,capture);
}

// ---------- the member effects as a worklist (.115, third review round; Codex, 3 Oct 2026 16:48 UTC, finding A) ----------
// roster-effects.ts says why and how; this part needs promote, demote and the identity rules, so it lives here.

/** What the rest of an ingest still needs after its slice: the rank check (3), roster.ingested (1), the notices' flush. */
const INGEST_TAIL = 3 + 1 + NOTICE_FLUSH_FIXED;

/** A run as the derivation reads it. `prev_snapshot_id` is what departures are judged against; `removals` the ingest's trust. */
interface EffectRun {
  id: number;
  snapshot_id: number;
  prev_snapshot_id: number | null;
  removals: number;
}

/**
 * The newest snapshot with the newest run (NULLs when there is none) and `applied_snapshot`, the newest snapshot whose diff
 * was applied: complete (or from before .115) and either with a derived run or with no run at all (handled before runs
 * existed). A snapshot whose only runs were never derived does not count, so the next export judges departures against the
 * one before it and a first absence it saw is not lost; with no such snapshot nothing is armed (fail closed).
 */
interface LatestRow {
  id: number;
  exported_at: number;
  member_count: number;
  content_hash: string | null;
  trusted: number | null;
  complete: number | null;
  stored_count: number;
  first_received_at: number | null;
  run_id: number | null;
  run_snapshot: number | null;
  run_prev: number | null;
  run_removals: number | null;
  run_created: number | null;
  run_derived: number | null;
  applied_snapshot: number | null;
}
const LATEST_SNAPSHOT_AND_RUN = `SELECT s.id AS id, s.exported_at AS exported_at, s.member_count AS member_count, s.content_hash AS content_hash,
       s.trusted AS trusted, s.complete AS complete, s.first_received_at AS first_received_at,
       (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id) AS stored_count,
       r.id AS run_id, r.snapshot_id AS run_snapshot, r.prev_snapshot_id AS run_prev, r.removals AS run_removals,
       r.created_at AS run_created, r.derived_at AS run_derived,
       (SELECT a.id FROM roster_snapshots a
         WHERE COALESCE(a.complete, 1) = 1
           AND a.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = a.id)
           AND (EXISTS (SELECT 1 FROM roster_effect_runs d WHERE d.snapshot_id = a.id AND d.derived_at IS NOT NULL)
                OR NOT EXISTS (SELECT 1 FROM roster_effect_runs u WHERE u.snapshot_id = a.id))
         ORDER BY a.id DESC LIMIT 1) AS applied_snapshot
  FROM roster_snapshots s LEFT JOIN roster_effect_runs r ON r.id = (SELECT MAX(id) FROM roster_effect_runs)
 ORDER BY s.id DESC LIMIT 1`;
const runOf = (p: LatestRow): EffectRun => ({ id: p.run_id!, snapshot_id: p.run_snapshot!, prev_snapshot_id: p.run_prev, removals: p.run_removals ?? 0 });

/** The run the stamp's batch made for a snapshot, read back when the batch did not report its id. */
async function runOfSnapshot(env: Env, snapId: number): Promise<EffectRun | null> {
  return await env.DB.prepare("SELECT id, snapshot_id, prev_snapshot_id, removals FROM roster_effect_runs WHERE snapshot_id = ?1 ORDER BY id DESC LIMIT 1")
    .bind(snapId)
    .first<EffectRun>();
}

/** A member of the roster as the diff reads it: the export's own (an ingest) or the stored rows (a resumed derivation). */
interface RosterRow {
  name_key: string;
  name: string;
  guid: string | null;
  public_note: string | null;
}
type EffectKind = "promote" | "note" | "depart";

interface Derived {
  /** false when a newer run or snapshot took over first (or another invocation derived this one): nothing was applied */
  took: boolean;
  items: number;
  pinned: number;
  returned: string[];
  pendingLeft: string[];
  renamed: string[];
  released: string[];
  held: number;
  deferred: number;
}

// Each derivation statement carries RUN_IS_CURRENT (?1 the run), so a run overtaken by a newer export applies nothing.
const DERIVE_PINS = `UPDATE characters SET guid = (SELECT json_extract(p.value, '$[1]') FROM json_each(?2) p WHERE json_extract(p.value, '$[0]') = characters.name_key)
  WHERE guid IS NULL AND status IN ('verified','queued','member','left','left_pending')
    AND EXISTS(SELECT 1 FROM json_each(?2)p WHERE json_extract(p.value,'$[0]')=characters.name_key AND json_extract(p.value,'$[2]')=characters.discord_id
      AND ${privacyGenerationExpressionFenceSql("json_extract(p.value,'$[2]')","json_extract(p.value,'$[3]')")}) AND ${RUN_IS_CURRENT}`;
const DERIVE_RETURNED_AUDIT = `INSERT INTO audit (ts, actor, action, subject, details)
  SELECT ?3, 'system', 'roster.returned', json_extract(r.value, '$[1]'), json_object('discordId', c.discord_id)
    FROM json_each(?2) r JOIN characters c ON c.name_key = json_extract(r.value, '$[0]') AND c.discord_id = json_extract(r.value, '$[2]')
   WHERE c.status = 'left_pending' AND ${privacyGenerationExpressionFenceSql('c.discord_id',"json_extract(r.value,'$[3]')")} AND ${RUN_IS_CURRENT} ORDER BY r.key`;
const DERIVE_RETURNED = `UPDATE characters SET status = 'member', left_at = NULL
  WHERE status = 'left_pending'
    AND EXISTS (SELECT 1 FROM json_each(?2) r WHERE json_extract(r.value, '$[0]') = characters.name_key AND json_extract(r.value, '$[2]') = characters.discord_id
      AND ${privacyGenerationExpressionFenceSql('characters.discord_id',"json_extract(r.value,'$[3]')")})
    AND ${RUN_IS_CURRENT}`;
const DERIVE_ARMED_AUDIT = `INSERT INTO audit (ts, actor, action, subject, details)
  SELECT ?3, 'system', 'roster.left_pending', c.name, json_object('discordId', c.discord_id)
    FROM json_each(?2) a JOIN characters c ON c.name_key = json_extract(a.value, '$[0]') AND c.discord_id = json_extract(a.value, '$[1]')
   WHERE c.status = 'member' AND ${privacyGenerationExpressionFenceSql('c.discord_id',"json_extract(a.value,'$[2]')")} AND ${RUN_IS_CURRENT} ORDER BY a.key`;
const DERIVE_ARMED = `UPDATE characters SET status = 'left_pending'
  WHERE status = 'member'
    AND EXISTS (SELECT 1 FROM json_each(?2) a WHERE json_extract(a.value, '$[0]') = characters.name_key AND json_extract(a.value, '$[1]') = characters.discord_id
      AND ${privacyGenerationExpressionFenceSql('characters.discord_id',"json_extract(a.value,'$[2]')")})
    AND ${RUN_IS_CURRENT}`;
// an officer's D: note names an account that must exist and not be banned (checked again when the item is applied)
const DERIVE_ITEMS = `INSERT OR IGNORE INTO roster_effects (run_id, seq, kind, name_key, name, discord_id, guid,subject_generation)
  SELECT ?1, ?2 + i.key, json_extract(i.value, '$[0]'), json_extract(i.value, '$[1]'), json_extract(i.value, '$[2]'), json_extract(i.value, '$[3]'), json_extract(i.value, '$[4]'),json_extract(i.value,'$[5]')
    FROM json_each(?3) i
   WHERE ${RUN_IS_CURRENT}
     AND ${privacyGenerationExpressionFenceSql("json_extract(i.value,'$[3]')","json_extract(i.value,'$[5]')")}
     AND (json_extract(i.value, '$[0]') <> 'note' OR EXISTS (SELECT 1 FROM members m WHERE m.discord_id = json_extract(i.value, '$[3]') AND m.banned = 0))`;
const DERIVE_DONE = `UPDATE roster_effect_runs SET derived_at = ?2, items = (SELECT COUNT(*) FROM roster_effects WHERE run_id = ?1),
       done_at = CASE WHEN EXISTS (SELECT 1 FROM roster_effects WHERE run_id = ?1 AND done_at IS NULL) THEN NULL ELSE ?2 END
 WHERE id = ?1 AND derived_at IS NULL AND ${RUN_IS_CURRENT}`;

/**
 * Derive a run: the identity rules (renames, namesakes, stale links; each release and rename admitted), then the diff as
 * before (comments 1 and 2 below), written in ONE batch: older runs superseded and their items dropped, the GUID pins,
 * the returns and the first absences applied in bulk with their audit rows, every effect that needs Discord stored as an
 * item, and derived_at. A statement per ROSTER_EFFECTS_PER_STATEMENT members at most, never one per member. `after` is
 * what the caller still needs once this returns, kept out of the identity rules' admission.
 */
async function deriveRun(env: Env, adm: Admission, run: EffectRun, given: RosterRow[] | null, notices: NoticeBatch, after: number): Promise<Derived> {
  const rows =
    given ??
    (await env.DB.prepare(`SELECT name_key, name, guid, public_note FROM roster_members WHERE snapshot_id = ?1
      AND EXISTS (SELECT 1 FROM roster_snapshots s WHERE s.id = ?1 AND s.complete = 1
        AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id)) ORDER BY rowid`).bind(run.snapshot_id).all<RosterRow>()).results;
  // name -> GUID in the snapshot departures are judged against: it confirms namesakes, and a first absence needs the name on it
  const previous = new Map<string, string | null>();
  if (run.prev_snapshot_id === run.snapshot_id) {
    for (const r of rows) previous.set(r.name_key, guidOf(r.guid));
  } else if (run.prev_snapshot_id !== null) {
    const p = await env.DB.prepare("SELECT name_key, guid FROM roster_members WHERE snapshot_id = ?1").bind(run.prev_snapshot_id).all<{ name_key: string; guid: string | null }>();
    for (const r of p.results) previous.set(r.name_key, r.guid);
  }

  // 1. Anyone on the roster whose binding is verified/queued/invited becomes a member (covers first snapshot + re-syncs).
  //    A link only counts for the character it was made for (reconcileIdentities): renames carry it, namesakes and
  //    pre-cutoff links that never met a roster release it, and the first sighting pins the GUID. Renames and namesakes
  //    are positive evidence (the GUID is on this roster), so they apply even to a distrusted, possibly truncated
  //    export -- capped, so a systematic change of character IDs is held for a person instead of applied.
  const bound = await env.DB.prepare(
    BOUND_AND_NOTE_SELECT,
  ).all<BoundRow>();
  const noteCaptures=new Map(bound.results.filter(c=>c.status==='privacy_note_capture'&&capturedActive(c)).map(c=>[c.discord_id,c]));
  const byKey = new Map(bound.results.filter(c=>c.status!=='privacy_note_capture'&&capturedActive(c)).map((c) => [c.name_key, c] as const));
  const batchWorst = derivationWorst(rows.length, byKey.size);
  const ident = await reconcileIdentities(env, rows, byKey, {
    cap: releaseCap(byKey.size),
    confirmWith: previous,
    notices,
    fence: { snapshotId: run.snapshot_id, runId: run.id },
    admit: (cost) => room(adm, IDENTITY_FIXED + sightingsWorst(rows.length) + batchWorst + after + noticeStatementsPending(notices)) >= cost,
  });

  const current = new Map(rows.map((r) => [r.name_key, r] as const));
  const pins: Array<[string, string,string,string|null]> = []; // key, GUID, original subject/generation
  const returns: Array<[string, string, string,string|null]> = [];
  const arms: Array<[string, string,string|null]> = [];
  const pendingLeft: string[] = [];
  const returned: string[] = [];
  const items: Array<[EffectKind, string, string, string, string | null,string|null]> = [];
  for (const [key, m] of current) {
    const c = byKey.get(key);
    if (c && ident.held.has(key)) continue; // left exactly as it is until a person decides (see reconcileIdentities)
    const g = guidOf(m.guid);
    if (c && g && c.guid && c.guid !== g) continue; // not this link's character; reconcileIdentities has reported it
    if (c && g && !c.guid) {
      pins.push([key, g,c.discord_id,c.privacy_generation]);
      c.guid = g;
    }
    if (c && c.status === "left_pending") {
      // They were missing from one export and are back in this one — the gap was a truncated or mid-load snapshot.
      // The role was never removed, so this is a status correction, not a promotion: no DM, no welcome line.
      returns.push([key, m.name, c.discord_id,c.privacy_generation]);
      returned.push(m.name);
      continue;
    }
    if (c && c.status !== "member") {
      items.push(["promote", key, m.name, c.discord_id, g,c.privacy_generation]);
      continue;
    }
    if (!c) {
      // Manual path: an officer set the public note to D:<discord id> by hand. Whether that account exists and is not
      // banned is decided where the item is stored and again where it is applied, never by a read per member.
      const mt = (m.public_note ?? "").trim().match(NOTE_RE);
      const original=mt?noteCaptures.get(mt[1]):undefined;
      if (mt&&original) items.push(["note", key, m.name, mt[1], g,original.privacy_generation]);
    }
  }

  // 2. Members who disappeared lose the character — but only after two consecutive exports agree. One short or
  //    mid-load export should never cost anyone their role, so the first absence only arms the removal.
  if (run.removals) {
    for (const c of byKey.values()) {
      if (current.has(c.name_key) || ident.held.has(c.name_key)) continue;
      if (c.status === "member") {
        if (!previous.has(c.name_key)) continue; // never seen in a snapshot yet; nothing to conclude
        arms.push([c.name_key, c.discord_id,c.privacy_generation]);
        pendingLeft.push(c.name);
      } else if (c.status === "left_pending") {
        items.push(["depart", c.name_key, c.name, c.discord_id, null,c.privacy_generation]);
      }
    }
  }

  const t = now();
  const id = run.id;
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE roster_effect_runs SET superseded_at = ?2 WHERE id < ?1 AND done_at IS NULL AND superseded_at IS NULL").bind(id, t),
    env.DB.prepare(`DELETE FROM roster_effects WHERE run_id < ?1 AND NOT ${CRON_NOTICE_CLAIM}`).bind(id),
    // finished runs kept RUN_HISTORY_S, and always the newest derived one (the next export's departures are judged against it)
    env.DB.prepare("DELETE FROM roster_effect_runs WHERE id < ?1 AND created_at < ?2 AND id < (SELECT MAX(id) FROM roster_effect_runs WHERE derived_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM roster_effects WHERE run_id=roster_effect_runs.id)").bind(
      id,
      t - RUN_HISTORY_S,
    ),
  ];
  const pinAt: number[] = [];
  for (const part of inParts(pins)) pinAt.push(stmts.push(env.DB.prepare(DERIVE_PINS).bind(id, JSON.stringify(part))) - 1);
  for (const part of inParts(returns)) stmts.push(env.DB.prepare(DERIVE_RETURNED_AUDIT).bind(id, JSON.stringify(part), t), env.DB.prepare(DERIVE_RETURNED).bind(id, JSON.stringify(part)));
  for (const part of inParts(arms)) stmts.push(env.DB.prepare(DERIVE_ARMED_AUDIT).bind(id, JSON.stringify(part), t), env.DB.prepare(DERIVE_ARMED).bind(id, JSON.stringify(part)));
  const itemAt: number[] = [];
  inParts(items).forEach((part, k) => itemAt.push(stmts.push(env.DB.prepare(DERIVE_ITEMS).bind(id, k * ROSTER_EFFECTS_PER_STATEMENT, JSON.stringify(part))) - 1));
  stmts.push(env.DB.prepare(DERIVE_DONE).bind(id, t));
  const res = await env.DB.batch(stmts);
  const changes = (k: number) => Number(res[k]?.meta?.changes ?? 0);
  const took = changes(stmts.length - 1) === 1;
  return {
    took,
    items: itemAt.reduce((n, k) => n + changes(k), 0),
    pinned: pinAt.reduce((n, k) => n + changes(k), 0),
    returned: took ? returned : [],
    pendingLeft: took ? pendingLeft : [],
    renamed: ident.renamed,
    released: ident.released,
    held: ident.held.size,
    deferred: ident.deferred,
  };
}

/** One slice of the newest run: what it applied, and whether the run is now done. */
export interface EffectsSlice {
  run: number | null;
  applied: number;
  /** items claimed whose effect was no longer due (already applied elsewhere, the link changed): marked done, nothing done */
  skipped: number;
  /** a claim was refused (a newer run or snapshot exists, or another invocation took the item): the slice ended there */
  refused: boolean;
  promoted: string[];
  noteBound: string[];
  stripped: string[];
  done: boolean;
  failed: boolean;
  /** Original cron welcome/log remains durable; this is not provider completion. */
  noticePending?:boolean;
  noticeHeld?:boolean;
}

interface SliceRow {
  run: number;
  seq: number | null;
  kind: EffectKind;
  name_key: string;
  name: string;
  discord_id: string;
  guid: string | null;
  subject_generation:string|null;
}
const CRON_NOTICE_CLAIM="(CASE WHEN json_valid(claim) THEN json_extract(claim,'$.p')='roster_cron_notice_v1' ELSE 0 END)";
// the newest run, only when it is derived, unfinished and of the newest snapshot, with its pending items in order (a row with
// a NULL seq when none is left, so the end batch can still record that it is done)
const SLICE_ROWS = `SELECT r.id AS run, e.seq AS seq, e.kind AS kind, e.name_key AS name_key, e.name AS name, e.discord_id AS discord_id, e.guid AS guid,e.subject_generation
  FROM roster_effect_runs r JOIN roster_snapshots s ON s.id = r.snapshot_id
    LEFT JOIN roster_effects e ON e.run_id = r.id AND e.done_at IS NULL
  WHERE r.id = (SELECT MAX(id) FROM roster_effect_runs) AND r.derived_at IS NOT NULL AND r.done_at IS NULL
    AND r.snapshot_id = (SELECT MAX(id) FROM roster_snapshots)
    AND s.complete = 1 AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id)
 ORDER BY e.seq LIMIT ?1`;
// The claim: ?1 run, ?2 seq, ?3 this slice's nonce, ?4 the time. Only a pending item of the current run is claimed; the
// statements after it in the same batch act only when it was (CLAIMED), so the item is done exactly when its change is.
const CLAIM = `UPDATE roster_effects SET done_at = ?4, claim = ?3 WHERE run_id = ?1 AND seq = ?2 AND done_at IS NULL
 AND subject_generation IS ?5 AND discord_id=?6 AND name_key=?7 AND kind=?8 AND guid IS ?9
 AND ${privacyGenerationExpressionFenceSql('roster_effects.discord_id','roster_effects.subject_generation')} AND ${RUN_IS_CURRENT}`;
const CLAIMED = `EXISTS (SELECT 1 FROM roster_effects WHERE run_id = ?1 AND seq = ?2 AND claim = ?3
 AND ${privacyGenerationExpressionFenceSql('roster_effects.discord_id','roster_effects.subject_generation')})`;
// promote: ?5 key, ?6 account, ?7 GUID, ?8 1 for a D: note (the link that batch just made), 0 for a verified link
const EFFECT_PROMOTE = `UPDATE characters SET status = 'member', member_since = COALESCE(member_since, ?4), left_at = NULL, guid = COALESCE(guid, ?7)
  WHERE name_key = ?5 AND discord_id = ?6 AND ${CLAIMED}
    AND ((?8 = 0 AND status IN ('verified','queued','left')) OR (?8 = 1 AND status = 'verified' AND source = 'note'))`;
const EFFECT_QUEUE = `UPDATE invite_queue SET status = 'joined', joined_at = ?4 WHERE name_key = ?5 AND status IN ('queued','written','invited') AND ${CLAIMED}
    AND EXISTS (SELECT 1 FROM characters WHERE name_key = ?5 AND discord_id = ?6 AND status = 'member')`;
// a D: note: ?4 key, ?5 account, ?6 name, ?7 time. A dead row under this name (a released namesake, an unbind) is another
// account's history: it is set aside rather than letting the officer's note promote a row that belongs to somebody else.
const EFFECT_NOTE_SET_ASIDE = `UPDATE characters SET name_key = name_key || '~' || bound_at || '~' || rowid
  WHERE name_key = ?4 AND discord_id <> ?5 AND status IN ('unbound','denied','left') AND ${CLAIMED}
    AND EXISTS (SELECT 1 FROM members WHERE discord_id = ?5 AND banned = 0)`;
const EFFECT_NOTE_LINK = `INSERT INTO characters (name_key, name, discord_id, status, bound_at, source)
  SELECT ?4, ?6, ?5, 'verified', ?7, 'note' WHERE ${CLAIMED} AND EXISTS (SELECT 1 FROM members WHERE discord_id = ?5 AND banned = 0)
  ON CONFLICT(name_key) DO UPDATE SET status = 'verified', source = 'note', guid = NULL
   WHERE characters.discord_id = ?5 AND characters.status IN ('unbound','denied','left')`;
const EFFECT_DEPART = `UPDATE characters SET status = 'left', left_at = ?4 WHERE name_key = ?5 AND discord_id = ?6 AND status = 'left_pending' AND ${CLAIMED}`;

/**
 * Apply a slice of the newest run. Before each item its kind's worst case is admitted against what the invocation has
 * left after `after` (and this slice's own end batch and failure audit); the first item that does not fit ends the slice,
 * and it and the rest stay pending for the next export or cron run. An item is claimed in the transaction of its database
 * change, so a fault before that commit leaves it pending and one after it never repeats it; what follows the change
 * (the role, the audits, the log line, the welcome) is best effort, as before, and a grant it defers is the role sweep's.
 * A failure stops the slice and is audited (counts only); it is never thrown at the export, which is already stored.
 */
async function applyEffects(env: Env, adm: Admission, after: number, calls: CallBudget, notices: NoticeBatch,deferCronRole=false): Promise<EffectsSlice> {
  const out: EffectsSlice = { run: null, applied: 0, skipped: 0, refused: false, promoted: [], noteBound: [], stripped: [], done: false, failed: false };
  const fits = room(adm, after + SLICE_FIXED + noticeStatementsPending(notices));
  if (fits < effectWorst(env).depart) return out; // not even the cheapest item: the next invocation
  const rows = (await env.DB.prepare(SLICE_ROWS).bind(Math.floor(fits / effectWorst(env).depart) + 1).all<SliceRow>()).results;
  if (!rows.length) return out;
  const run = rows[0].run;
  out.run = run;
  const keep = after + SLICE_FIXED - 1; // the selection is spent; the end batch (2) and a failure's audit (1) remain
  const nonce = crypto.randomUUID();
  let at = -1;
  try {
    for (const it of rows) {
      if (it.seq === null) break;
      const worst = it.kind === "depart" ? effectWorst(env).depart : env.PRIVACY_ERASURE_ENABLED==='true'||affords(calls, GRANT_CALLS) ? effectWorst(env)[it.kind] : EFFECT_DEFERRED_WORST[it.kind];
      // The kind's worst case reserves this item's notice; notices from all earlier items still owe SQL at flush.
      if (room(adm, keep + noticeStatementsPending(notices)) < worst) break;
      at = it.seq;
      const result = await applyEffect(env, run, it, nonce, calls, notices,deferCronRole);
      if (result === "refused") {
        out.refused = true; // the run is no longer the current one, or another invocation is ahead in it: nothing more here
        break;
      }
      if (result === "applied") {
        out.applied++;
        (it.kind === "promote" ? out.promoted : it.kind === "note" ? out.noteBound : out.stripped).push(it.name);
      } else out.skipped++;
      // The dormant protocol cron lane consumes one original item; ordinary/manual slices retain their admission.
      if(deferCronRole&&adm.count.protocol&&out.applied+out.skipped>=1)break;
    }
  } catch (e) {
    out.failed = true;
    try {
      await audit(env, "system", "roster.effects_failed", String(run), { seq: at, applied: out.applied, error: errorRef(e) });
    } catch {
      /* D1 itself may be what failed; the item is pending or done, never half of each */
    }
  }
  try {
    // done items leave the table (it holds only what is still due); the run is done once nothing is left
    const end = await env.DB.batch([
      env.DB.prepare(`DELETE FROM roster_effects WHERE run_id = ?1 AND done_at IS NOT NULL AND NOT ${CRON_NOTICE_CLAIM}`).bind(run),
      env.DB.prepare(
        `UPDATE roster_effect_runs SET done_at = ?2 WHERE id = ?1 AND done_at IS NULL AND derived_at IS NOT NULL AND superseded_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM roster_effects WHERE run_id = ?1) AND ${RUN_IS_CURRENT}`,
      ).bind(run, now()),
    ]);
    out.done = Number(end[1]?.meta?.changes ?? 0) === 1;
  } catch {
    out.failed = true; // the next slice records it
  }
  return out;
}

/**
 * One item: its claim and database change in one batch, then what follows the change. "applied" when the change was made;
 * "skipped" when the item was claimed but its change was no longer due (the link changed, or the effect was made another
 * way since), so it is done with nothing done; "refused" when it could not be claimed.
 */
async function applyEffect(env: Env, run: number, it: SliceRow, nonce: string, calls: CallBudget, notices: NoticeBatch,deferCronRole=false): Promise<"applied" | "skipped" | "refused"> {
  const t = now();
  const seq = it.seq as number;
  const proof=deferCronRole&&it.kind!=='depart'?await prepareRosterCronNotice(env,{run,seq,subject:it.discord_id,generation:it.subject_generation,name:it.name,nameKey:it.name_key,guid:it.guid,createdAt:t}):nonce;
  const claim = env.DB.prepare(CLAIM).bind(run, seq, proof, t,it.subject_generation,it.discord_id,it.name_key,it.kind,it.guid);
  if (it.kind === "depart") {
    const res = await env.DB.batch([claim, env.DB.prepare(EFFECT_DEPART).bind(run, seq, nonce, t, it.name_key, it.discord_id)]);
    if (!Number(res[0]?.meta?.changes ?? 0)) return "refused";
    if (!Number(res[1]?.meta?.changes ?? 0)) return "skipped";
    await afterDeparture(env, it.discord_id, it.name, "roster (absent from two exports)", { batch: notices,capture:it.subject_generation===null?null:{subject:it.discord_id,subjectGeneration:it.subject_generation,state:'active',revision:0} });
    return "applied";
  }
  const note = it.kind === "note";
  const stmts = [claim];
  if (note) {
    stmts.push(
      env.DB.prepare(EFFECT_NOTE_SET_ASIDE).bind(run, seq, proof, it.name_key, it.discord_id),
      env.DB.prepare(EFFECT_NOTE_LINK).bind(run, seq, proof, it.name_key, it.discord_id, it.name, t),
    );
  }
  const promoteAt = stmts.push(env.DB.prepare(EFFECT_PROMOTE).bind(run, seq, proof, t, it.name_key, it.discord_id, guidOf(it.guid), note ? 1 : 0)) - 1;
  if(deferCronRole)stmts.push(env.DB.prepare(`UPDATE roster_effects SET claim=?4 WHERE run_id=?1 AND seq=?2 AND claim=?3 AND changes()=0`).bind(run,seq,proof,nonce));
  stmts.push(env.DB.prepare(EFFECT_QUEUE).bind(run, seq, proof, t, it.name_key, it.discord_id));
  const res = await env.DB.batch(stmts);
  if (!Number(res[0]?.meta?.changes ?? 0)) return "refused";
  if (!Number(res[promoteAt]?.meta?.changes ?? 0)) return "skipped";
  const capture=it.subject_generation===null?null:{subject:it.discord_id,subjectGeneration:it.subject_generation,state:'active' as const,revision:0};
  await afterPromotion(env, it.discord_id, it.name, notices, calls,capture,deferCronRole);
  return "applied";
}

/** The ingest's report of its effects, counts only (the summary and roster.ingested carry it). */
export interface EffectsReport {
  run: number | null;
  derived: boolean;
  items: number | null;
  applied: number;
  skipped: number;
  /** items of the newest run still waiting for the next export or cron run */
  pending: boolean;
  /** identity effects (releases, renames) left for the next export by this one's statement budget */
  deferredIdentity: number;
  failed: boolean;
}
function effectsReport(runId: number | null, d: Derived | null, s: EffectsSlice, waiting = false): EffectsReport {
  return {
    run: runId ?? s.run,
    derived: !!d?.took,
    items: d ? d.items : null,
    applied: s.applied,
    skipped: s.skipped,
    // `waiting`: the newest run is still to be derived (inside the grace another export may be deriving it right now)
    pending: waiting || (s.run !== null ? !s.done : !!d && d.took && d.items > 0),
    deferredIdentity: d?.deferred ?? 0,
    failed: s.failed,
  };
}

/**
 * The skip path's share (an older or repeated export): derive the newest run if it is the newest snapshot's and was never
 * derived (its invocation stopped before; not within SNAPSHOT_WRITE_GRACE_S of its start, when another export may still be
 * deriving it), then apply a slice. The departures it arms are judged against the run's own stored snapshot, so a stop
 * between the stamp and the derivation loses nothing.
 */
async function resumeEffects(env: Env, adm: Admission, prev: LatestRow, calls: CallBudget, notices: NoticeBatch): Promise<EffectsReport> {
  if (prev.complete !== 1 || prev.stored_count !== prev.member_count) throw new Error("Roster snapshot is incomplete; retry this export");
  let derived: Derived | null = null;
  const underived = prev.run_id !== null && prev.run_snapshot === prev.id && prev.run_derived === null;
  const stale = underived && now() - (prev.run_created ?? 0) >= SNAPSHOT_WRITE_GRACE_S;
  if (underived && !stale) throw new Error("Roster effects are awaiting derivation; retry this export");
  if (stale) derived = await deriveRun(env, adm, runOf(prev), null, notices, SLICE_FIXED + NOTICE_FLUSH_FIXED);
  const slice = await applyEffects(env, adm, NOTICE_FLUSH_FIXED, calls, notices);
  return effectsReport(prev.run_id, derived, slice, underived && !stale);
}

/**
 * The cron's slice (scheduled-budget.ts SCHEDULED_CAPS.rosterEffectsStatements): the newest run's pending items, admitted
 * one by one against that line, so the scheduled invocation stays within its target while a backlog is worked off between
 * exports. It never derives (an export does: the identity rules may need more than this line). Never throws: it runs
 * inside waitUntil.
 */
export async function continueRosterEffects(env: Env): Promise<EffectsSlice | null> {
  const count = { used: 0,protocol:false };
  const counted = countStatements(env, count);
  const notices = noticeBatch();
  try {
    const dormant=count.protocol===true&&env.PRIVACY_ERASURE_ENABLED==='true';
    if(dormant){
      const owed=await counted.DB.prepare(`SELECT claim FROM roster_effects WHERE done_at IS NOT NULL AND ${CRON_NOTICE_CLAIM}
       AND json_extract(claim,'$.run')=run_id AND json_extract(claim,'$.seq')=seq AND json_extract(claim,'$.createdAt')=done_at
       AND json_extract(claim,'$.subject')=discord_id AND json_extract(claim,'$.generation') IS subject_generation
       AND (json_extract(claim,'$.welcome.state')='pending' OR json_extract(claim,'$.log.state')='pending') ORDER BY done_at,run_id,seq LIMIT 1`).first<{claim:string}>();
      if(owed){const original=parseRosterCronNotice(owed.claim);if(!original)throw Error('cron_notice_original_invalid');
        const state=await settleRosterCronNotice(counted,owed.claim);return{run:original.run,applied:0,skipped:0,refused:false,promoted:[],noteBound:[],stripped:[],done:state.finished,failed:false,noticePending:!state.finished,noticeHeld:['held','refused','unknown'].includes(state.state)};
      }
    }
    const slice=await applyEffects(counted, { count, limit: SCHEDULED_CAPS.rosterEffectsStatements }, NOTICE_FLUSH_FIXED, callBudget(env), notices,dormant);
    if(dormant&&slice.applied>0&&slice.stripped.length===0)slice.noticePending=true;
    return slice;
  } catch (e) {
    console.error("roster effects failed", errorRef(e));
    return null;
  } finally {
    await flushNotices(counted, notices);
  }
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

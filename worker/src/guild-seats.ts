/**
 * Whether Olympus I has room: Viktor's request (2 Oct 2026, item B). While the guild is at its member limit no invite
 * can go out, and a member who reads "queued" for days reads it as broken; this module says so plainly where people
 * look (/verify-status, the guide's My status button, Home and Apply on the site, the staff commands and /health).
 *
 * The state is informational only: it never changes getQueue, claims, codes, grants, removals or invite attempts.
 * Only the LATEST roster snapshot decides, and only when it is complete, trusted against the last trusted export
 * (roster.ts), exported on or after LINKS_NOT_BEFORE and no older than ROSTER_SEATS_FOR (48 h); a newer distrusted,
 * unfinished or unchecked export is never skipped in favour of an older good one. A refused invite (the addon's
 * guild_full event) counts for six hours, and only when it is newer than the deciding roster. Anything else is
 * "unknown", which makes no claim. The bot never DMs: these texts are ephemeral replies, the member's own pages and
 * staff views. Times shown to members are rounded down to the hour, so they do not reveal when the officer was online;
 * staff views keep exact times.
 */
import type { Env } from "./env";
import { linksNotBefore, now } from "./db";
import { errorRef } from "./log";
import { visitorLine } from "./guide";
import { ROSTER_SEATS_FOR, SNAPSHOT_WRITE_GRACE_S } from "./roster";
import { isSnowflake } from "./site-data";

/** The game's own guild member limit. */
export const GAME_GUILD_CAP = 1000;
/** The lowest cap GUILD_MEMBER_CAP may set, so a typo can never announce a full guild. */
export const CAP_FLOOR = 900;
/** How long a refused invite ("the guild is full") is believed when no newer roster says otherwise. */
export const REFUSED_FULL_S = 6 * 3600;

export type CapConfigured = "default" | "set" | "invalid";
/** Why the latest roster does not decide: no export at all, still being written, left unfinished (review of 3 Oct 2026:
 *  still unfinished SNAPSHOT_WRITE_GRACE_S after it arrived), from before .115 and not yet checked, not trusted, from before
 *  LINKS_NOT_BEFORE, too old; or the state could not be read. */
export type SeatReason = "none" | "writing" | "stuck" | "unchecked" | "distrusted" | "before_links" | "stale" | "error";

export interface SeatState {
  state: "full" | "open" | "unknown";
  full: boolean;
  source: "roster" | "refused_invite" | null;
  reason: SeatReason | null; // null when the roster decides
  cap: number;
  capConfigured: CapConfigured;
  members: number | null; // these three only when the roster decides
  free: number | null;
  rosterAt: number | null; // min(exported_at, received_at): an officer clock ahead of ours cannot make a roster look newer
  refusedAt: number | null; // only when the refusal counts
}

/** One of the viewer's own queue rows and its place in getQueue's order (reserved names first, then arrival). */
export interface SeatPlace {
  nameKey: string;
  name: string;
  position: number;
}

/**
 * The roster count at which Olympus I counts as full. Unset or empty: the game's 1000. A value of three or four digits
 * from 900 to 1000 is used as given; anything else ("0", "899", "1001", "1e3", "900x") is reported as invalid and 1000
 * is used, so a mistyped setting can only ever make the bot more cautious about saying "full".
 */
export function seatCap(env: Env): { cap: number; configured: CapConfigured } {
  const raw = (env.GUILD_MEMBER_CAP ?? "").trim();
  if (!raw) return { cap: GAME_GUILD_CAP, configured: "default" };
  if (/^[0-9]{3,4}$/.test(raw)) {
    const n = Number(raw);
    if (n >= CAP_FLOOR && n <= GAME_GUILD_CAP) return { cap: n, configured: "set" };
  }
  return { cap: GAME_GUILD_CAP, configured: "invalid" };
}

// The latest snapshot only, whatever its state.
const LATEST_SNAPSHOT = "SELECT id, member_count, exported_at, received_at, trusted, complete, first_received_at FROM roster_snapshots ORDER BY id DESC LIMIT 1";
// The addon's guild_full event, written by the watcher's endpoint (ingest.ts postEvents); the audit_actor_action index.
const LAST_REFUSAL = "SELECT ts FROM audit WHERE actor = 'watcher' AND action = 'guild.full' ORDER BY id DESC LIMIT 1";
// The account's own live rows with their global place, counted exactly as getQueue and waitlistPosition count it
// (retry_after ignored: a row backing off is still ahead of you). Never another account's row, even one with the same
// name_key.
const OWN_PLACES =
  `SELECT q.name_key AS nameKey, q.name AS name,
          1 + (SELECT COUNT(*) FROM invite_queue o WHERE o.status IN ('queued','written')
                 AND (o.priority > q.priority OR (o.priority = q.priority AND o.id < q.id))) AS position
     FROM invite_queue q
    WHERE q.discord_id = ?1 AND q.status IN ('queued','written')
    ORDER BY q.priority DESC, q.id LIMIT 5`;

interface SnapshotRow {
  id: number;
  member_count: number;
  exported_at: number;
  received_at: number;
  trusted: number | null;
  complete: number | null;
  first_received_at?: number | null; // only to tell a write in progress from an unfinished one
}

const rowsOf = <T>(r: D1Result<unknown> | undefined): T[] => ((r?.results ?? []) as T[]);

/** The seat state from the latest snapshot and the last refusal, at time `at`. Pure: the reads are the caller's. */
export function seatsFrom(env: Env, at: number, snap: SnapshotRow | null, refusedTs: number | null): SeatState {
  const { cap, configured } = seatCap(env);
  const cut = linksNotBefore(env);
  let reason: SeatReason | null = null;
  let rosterTime = 0;
  if (!snap) reason = "none";
  else if (snap.complete === 0) reason = (snap.first_received_at ?? 0) <= at - SNAPSHOT_WRITE_GRACE_S ? "stuck" : "writing";
  else if (snap.complete === null || snap.trusted === null) reason = "unchecked";
  else if (snap.complete !== 1 || snap.trusted !== 1) reason = "distrusted";
  else if (snap.exported_at < cut) reason = "before_links";
  else {
    rosterTime = Math.min(snap.exported_at, snap.received_at);
    if (!(rosterTime > at - ROSTER_SEATS_FOR)) reason = "stale";
  }
  const decides = reason === null && !!snap;
  const members = decides ? snap!.member_count : null;
  const rosterFull = decides && snap!.member_count >= cap;
  const refusedFull = typeof refusedTs === "number" && refusedTs > at - REFUSED_FULL_S && refusedTs >= cut && (!decides || refusedTs > rosterTime);
  const full = rosterFull || refusedFull;
  return {
    state: full ? "full" : decides ? "open" : "unknown",
    full,
    source: rosterFull ? "roster" : refusedFull ? "refused_invite" : null,
    reason,
    cap,
    capConfigured: configured,
    members,
    free: members === null ? null : Math.max(0, cap - members),
    rosterAt: decides ? rosterTime : null,
    refusedAt: refusedFull ? (refusedTs as number) : null,
  };
}

/** The statements of one guarded batch and how to read their answers (the viewer's own places only with discordId). */
export function seatsPlan(env: Env, at: number, discordId?: string) {
  const statements = [env.DB.prepare(LATEST_SNAPSHOT), env.DB.prepare(LAST_REFUSAL)];
  if (discordId) statements.push(env.DB.prepare(OWN_PLACES).bind(discordId));
  const shape = (res: D1Result<unknown>[]): { seats: SeatState; places: SeatPlace[] } => {
    const snap = rowsOf<SnapshotRow>(res[0])[0] ?? null;
    const refused = rowsOf<{ ts: number }>(res[1])[0];
    const places = discordId
      ? rowsOf<SeatPlace>(res[2]).map((p) => ({ nameKey: String(p.nameKey), name: String(p.name), position: Number(p.position) }))
      : [];
    return { seats: seatsFrom(env, at, snap, typeof refused?.ts === "number" ? refused.ts : null), places };
  };
  return { statements, shape };
}

function unknownSeats(env: Env, reason: SeatReason): SeatState {
  const { cap, configured } = seatCap(env);
  return { state: "unknown", full: false, source: null, reason, cap, capConfigured: configured, members: null, free: null, rosterAt: null, refusedAt: null };
}

/**
 * The seat state (and, with discordId, that account's own places) in one batch. Never throws: any failure is the
 * unknown state with reason "error" and no places, logged as a bounded category only (log.ts errorRef), so a page or a
 * command that shows the state still answers without it.
 */
export async function guildSeats(env: Env, at: number = now(), discordId?: string): Promise<{ seats: SeatState; places: SeatPlace[] }> {
  try {
    const plan = seatsPlan(env, at, discordId);
    return plan.shape(await env.DB.batch(plan.statements));
  } catch (e) {
    console.error("guild seats failed", errorRef(e));
    return { seats: unknownSeats(env, "error"), places: [] };
  }
}

/** A time shown to members: rounded down to the hour. */
export const hourOf = (t: number) => Math.floor(t / 3600) * 3600;

/** Discord's address of the visitors channel, when both ids are real snowflakes; otherwise null (the page shows text). */
export function visitorsUrl(env: Env): string | null {
  const guild = (env.GUILD_ID ?? "").trim();
  const channel = (env.CHANNEL_VISITOR_CHAT ?? "").trim();
  return isSnowflake(guild) && isSnowflake(channel) ? `https://discord.com/channels/${guild}/${channel}` : null;
}

/** What the site's member pages get: no reason, no exact times, the hour of the deciding evidence. */
export function memberSeats(env: Env, s: SeatState) {
  const at = s.source === "refused_invite" ? s.refusedAt : s.rosterAt;
  return { state: s.state, source: s.source, members: s.members, cap: s.cap, free: s.free, asOf: at === null ? null : hourOf(at), visitorsUrl: visitorsUrl(env) };
}

/**
 * The full-guild paragraph of /verify-status ("" unless full). It promises nothing the bot does not do: being full
 * costs no invite attempt (ingest.ts: a guild_full refusal is a free miss), the bot removes nobody to make room, and
 * no text says a code stays valid.
 */
export function seatsText(env: Env, s: SeatState): string {
  if (!s.full) return "";
  const lead =
    s.source === "roster" && s.rosterAt !== null && s.members !== null
      ? `**Olympus I is full**: the officers' latest roster export (<t:${hourOf(s.rosterAt)}:R>) counts ${s.members} of ${s.cap} members.`
      : `**Olympus I is full**: the last invite was refused for lack of space (<t:${hourOf(s.refusedAt ?? 0)}:R>).`;
  return (
    `${lead} Being full changes nothing about your verification: a full guild never costs you an invite attempt, the bot ` +
    `removes nobody (officers may remove inactive characters to free seats), and an officer sends the next invite when a ` +
    `seat opens, in queue order (reserved names from the site go first). ${visitorLine(env)}`
  );
}

const REASON_WORDS: Record<SeatReason, string> = {
  none: "no roster export has arrived yet",
  writing: "the latest export is still being written",
  stuck: "the latest export was left unfinished; the addon's next export writes it again",
  unchecked: "the latest export has not been checked yet; the next export from the addon, or /olympus-admin sync, checks it",
  distrusted: "the latest export is not trusted: run /olympus-admin sync if the guild really shrank",
  before_links: "the latest export is from before LINKS_NOT_BEFORE",
  stale: "the latest export is more than 48 hours old",
  error: "the seat state could not be read",
};

/** The staff line (exact times): the four states in words, and how many wait when the caller knows. */
export function seatsStaffLine(s: SeatState, waiting?: number): string {
  let line: string;
  if (s.full && s.source === "roster") line = `Olympus I: **full**, ${s.members} of ${s.cap} on the latest roster export <t:${s.rosterAt}:R>`;
  else if (s.full) line = `Olympus I: **full** (an invite was refused for space <t:${s.refusedAt}:R>)`;
  else if (s.state === "open") line = `${s.free} seat${s.free === 1 ? "" : "s"} free on Olympus I (${s.members} of ${s.cap}, latest roster export <t:${s.rosterAt}:R>)`;
  else line = `Olympus I room: unknown (${REASON_WORDS[s.reason ?? "error"]})`;
  return waiting === undefined ? line : `${line} · ${waiting} waiting in the invite queue`;
}

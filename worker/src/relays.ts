/**
 * Who can take a verification whisper right now.
 *
 * Every watcher polls GET /queue every 30 seconds. Since 27 Sep 2026 it adds whether its game client is in the world
 * (relay=<character>&online=1|0). The reply to /verify then names an officer who is actually online, instead of always
 * naming the same one and letting applicants whisper someone who is offline and get "not currently playing".
 *
 * The character is the one the officer is actually playing: the addon writes a signed note at every login and reload
 * ("Olympus: relay <Name> is in the world (addon <version>, ref OLVr-...)") that the watcher reads from the chat log,
 * so an officer on an alt is named as that alt. The same note carries the addon's version, which is how the Worker
 * knows request codes will be understood in game before it hands any out (ticketsReady).
 *
 * Writes are rationed (D1's free tier ran out of writes once, on 18 Sep): a report that changes nothing is written at
 * most every RELAY_WRITE_EVERY seconds, and a relay that has not reported for RELAY_FRESH seconds counts as offline,
 * which is also what happens when the officer's PC is simply switched off. A relay silent for RELAY_KNOWN seconds no
 * longer counts at all, so switching presence reports off (or going back to an older watcher) falls back to the
 * configured names instead of "no officer is online" forever.
 *
 * Since .62 (1 Oct 2026; the v3 proposal's presence repair, Codex manifest a086e904…, countersigned 02:15 UTC, ported
 * with watcher 0.6.5): a watcher that cannot tell omits `online`, and the Worker records that as what it is. The
 * sighting still refreshes the character and the versions (so the whisper target and ticketsReady stay right), but the
 * relay's `unknown_since` is set and, while it is, the relay is neither online nor "known": the reply names the
 * character without claiming anyone is online or that nobody is. Until .61 that silence was skipped, so after
 * RELAY_FRESH the reply said "No officer is online right now", a claim the watcher never made. A report that states
 * presence clears the mark.
 *
 * .68 (Codex's review of .62, 1 Oct 03:07 UTC): (1) a relay whose latest word, within RELAY_FRESH, is "cannot tell"
 * keeps the whole answer uncertain unless some relay is positively online: a stated-offline relay beside an unknown one
 * no longer makes the reply say nobody is online. (2) A report is judged against the row's current `seen_at` INSIDE the
 * upsert (`WHERE excluded.seen_at >= relays.seen_at`), so a heartbeat that read the row, then resumed after a strictly
 * newer poll had been recorded, cannot regress `seen_at`, clear or reintroduce `unknown_since`, or restore a stale
 * addon: the addon fallback is the current row's (`COALESCE(?, relays.addon)`), not the copy read before the await.
 * Same-second ambiguity is bounded separately (equal seconds may overwrite); no cross-provider atomicity is claimed.
 */
import type { Env } from "./env";
import { now } from "./db";

export const RELAY_FRESH = 600;
export const RELAY_WRITE_EVERY = 300;
export const RELAY_KNOWN = 24 * 3600;
/** How recently a capable relay must have checked in for the Verify button to hand out request codes. */
export const TICKETS_SEEN_WITHIN = 30 * 86400;
/** The first watcher and addon builds that understand 7-symbol request codes. */
export const TICKETS_MIN_WATCHER = "0.6.0";
export const TICKETS_MIN_ADDON = "0.6.0";

export interface RelayRow {
  officer_id: string;
  character: string;
  online: number;
  seen_at: number;
  changed_at: number;
  version: string | null; // the watcher's
  addon?: string | null; // the addon's, from its signed login note (watcher 0.6.0+)
  unknown_since?: number | null; // .62: set while the watcher's latest report could not tell; NULL once a report states presence
}

export interface RelayReport {
  officer: string;
  character: string;
  online: boolean | null; // null: the watcher cannot tell, so nothing is claimed
  version?: string;
  addon?: string;
}

/** Parse the relay part of a /queue query. Returns null when this watcher does not report presence (older build). */
export function relayReportFromQuery(q: URLSearchParams): RelayReport | null {
  const officer = (q.get("officer") ?? "").trim().slice(0, 64);
  const character = (q.get("relay") ?? "").trim().slice(0, 48);
  if (!officer || !character) return null;
  const on = q.get("online");
  return {
    officer,
    character,
    online: on === "1" ? true : on === "0" ? false : null,
    version: (q.get("v") ?? "").slice(0, 32) || undefined,
    addon: (q.get("addon") ?? "").slice(0, 32) || undefined,
  };
}

export async function recordRelay(env: Env, r: RelayReport): Promise<"written" | "unchanged" | "skipped"> {
  if (!r.officer || !r.character) return "skipped";
  const t = now();
  const row = await env.DB.prepare("SELECT * FROM relays WHERE officer_id = ?1").bind(r.officer).first<RelayRow>();
  // An older watcher sends no addon version: keep the one on record rather than forgetting it.
  const addon = r.addon ?? row?.addon ?? null;
  const sameSighting = (x: RelayRow) => x.character === r.character && (x.version ?? null) === (r.version ?? null) && (x.addon ?? null) === addon && t - x.seen_at < RELAY_WRITE_EVERY;
  // .68: the write judges the order itself: a report older than what the row already holds changes nothing, and the
  // addon fallback is the row's current value, not the copy read above (a heartbeat resuming after a newer poll)
  if (r.online === null) {
    // .62: the watcher cannot tell. The sighting counts (character, versions, seen_at); the presence is marked unknown
    // from now until a report states it again. The stored online flag is left as it was and is no longer read as a claim.
    if (row && (row.unknown_since ?? null) !== null && sameSighting(row)) return "unchanged";
    const res = await env.DB.prepare(
      `INSERT INTO relays (officer_id, character, online, seen_at, changed_at, version, addon, unknown_since) VALUES (?1, ?2, 0, ?3, ?3, ?4, ?5, ?3)
       ON CONFLICT(officer_id) DO UPDATE SET character = ?2, seen_at = ?3, version = ?4, addon = COALESCE(?5, relays.addon), unknown_since = COALESCE(relays.unknown_since, ?3)
       WHERE ?3 >= relays.seen_at`,
    )
      .bind(r.officer, r.character, t, r.version ?? null, r.addon ?? null)
      .run();
    return (res.meta?.changes ?? 0) > 0 ? "written" : "unchanged";
  }
  const on = r.online ? 1 : 0;
  if (row && (row.unknown_since ?? null) === null && row.online === on && sameSighting(row)) return "unchanged";
  const res = await env.DB.prepare(
    `INSERT INTO relays (officer_id, character, online, seen_at, changed_at, version, addon, unknown_since) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, NULL)
     ON CONFLICT(officer_id) DO UPDATE SET character = ?2, online = ?3, seen_at = ?4, version = ?5, addon = COALESCE(?6, relays.addon), unknown_since = NULL,
       changed_at = CASE WHEN relays.online = ?3 AND relays.unknown_since IS NULL THEN relays.changed_at ELSE ?4 END
     WHERE ?4 >= relays.seen_at`,
  )
    .bind(r.officer, r.character, on, t, r.version ?? null, r.addon ?? null)
    .run();
  return (res.meta?.changes ?? 0) > 0 ? "written" : "unchanged";
}

/** "0.6.0" >= "0.5.10" and so on: numeric per part, anything unparseable is "too old". */
export function versionAtLeast(have: string | null | undefined, want: string): boolean {
  const parse = (v: string) => v.trim().split(/[.\-+]/).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (!have || !/^\d/.test(have.trim())) return false;
  const a = parse(have), b = parse(want);
  for (let i = 0; i < b.length; i++) {
    const x = Number.isNaN(a[i] ?? 0) ? -1 : (a[i] ?? 0);
    if (x !== b[i]) return x > b[i];
  }
  return true;
}

/** Both halves on an officer's PC understand request codes: the watcher relays them and the addon accepts them. */
export const ticketCapable = (r: Pick<RelayRow, "version" | "addon">) =>
  versionAtLeast(r.version, TICKETS_MIN_WATCHER) && versionAtLeast(r.addon, TICKETS_MIN_ADDON);

/**
 * Whether the Verify button hands out request codes, or asks for the character name as it did before 27 Sep.
 * REQUEST_CODES = "on" / "off" forces it; the default, "auto", waits until an officer's watcher has reported that it
 * and the addon beside it both understand request codes. That makes the rollout order irrelevant: deploying the Worker
 * first changes nothing until an upgraded officer PC has checked in.
 */
export async function ticketsReady(env: Env): Promise<boolean> {
  const mode = (env.REQUEST_CODES ?? "").trim().toLowerCase();
  if (mode === "on") return true;
  if (mode === "off") return false;
  try {
    const rows = (await env.DB.prepare("SELECT version, addon FROM relays WHERE seen_at > ?1").bind(now() - TICKETS_SEEN_WITHIN).all<RelayRow>()).results ?? [];
    return rows.some(ticketCapable);
  } catch {
    return false; // no relays table (or no addon column) yet: nothing has reported, so nothing is known to be ready
  }
}

export interface RelayStatus {
  known: boolean; // a watcher has reported presence within RELAY_KNOWN; false means "fall back to the configured names"
  online: RelayRow[]; // freshest first
  recent?: RelayRow[]; // everyone who could take it, most recently seen first: who to name when nobody is online
}

/**
 * `tickets`: only relays whose addon accepts request codes count as someone to whisper one to -- including when nobody
 * is online, so the reply names the officer who can take the code rather than whoever is first in OFFICER_CHARACTERS.
 */
export async function relayStatus(env: Env, opts: { tickets?: boolean } = {}): Promise<RelayStatus> {
  let rows: RelayRow[] = [];
  const t = now();
  try {
    rows = (await env.DB.prepare("SELECT * FROM relays WHERE seen_at > ?1").bind(t - (opts.tickets ? TICKETS_SEEN_WITHIN : RELAY_KNOWN)).all<RelayRow>()).results ?? [];
  } catch {
    return { known: false, online: [] }; // table not there yet: behave exactly as before
  }
  if (opts.tickets) rows = rows.filter(ticketCapable);
  const recent = [...rows].sort((a, b) => b.seen_at - a.seen_at);
  // .62: a relay whose latest report could not tell (unknown_since set) is neither online nor known; it is still named
  const stated = (r: RelayRow) => (r.unknown_since ?? null) === null;
  const online = recent.filter((r) => stated(r) && r.online === 1 && t - r.seen_at < RELAY_FRESH);
  // .68: while any relay is currently saying "cannot tell" and nobody is positively online, the answer stays uncertain
  const unsure = recent.some((r) => !stated(r) && t - r.seen_at < RELAY_FRESH);
  const known = online.length > 0 || (!unsure && rows.some((r) => stated(r) && t - r.seen_at < RELAY_KNOWN));
  return { known, online, recent };
}

/** OFFICER_CHARACTERS as a list: "Fern Melder" or "Fern Melder, Other Officer". */
export function configuredOfficers(env: Env): string[] {
  return (env.OFFICER_CHARACTERS || "")
    .split(/\s*(?:,|;|\/|\bor\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => /^\p{L}[\p{L}' ]{1,30}$/u.test(s));
}

/**
 * The instructions under a code: the whole whisper line ready to paste, and who is online to receive it.
 * `from` names the character when the code is bound to one; a request code works from any character.
 */
export function whisperInstructions(env: Env, code: string, expiresAt: number, status: RelayStatus, from?: string): string[] {
  const configured = configuredOfficers(env);
  const target = status.online[0]?.character ?? status.recent?.[0]?.character ?? configured[0] ?? "";
  const who = from ? `logged in as **${from}**` : "logged in as the character you want linked (any of yours)";
  if (!target) {
    return [`In game, ${who}, whisper \`!verify ${code}\` to an online officer, or mail it to one with that text in the body.`];
  }
  const lines = [`In game, ${who}, paste this into the chat box and press Enter:`, "```", `/w ${target} !verify ${code}`, "```"];
  if (status.online.length > 0) {
    const names = status.online.map((r) => `**${r.character}**`);
    lines.push(`${names.join(" or ")} ${names.length === 1 ? "is" : "are"} online now${names.length > 1 ? " — whisper any of them" : ""}.`);
  } else if (status.known) {
    lines.push(
      `No officer is online right now. The code stays valid until <t:${expiresAt}:f>; send it once ${target} is online ` +
        `(\`/who ${target}\` in game shows it), or mail it to them with that text in the body.`,
    );
  } else {
    const others = status.recent?.length ? [] : configured.filter((c) => c !== target);
    lines.push(`Send it while ${target}${others.length ? ` (or ${others.join(", ")})` : ""} is online, or mail it to them with that text in the body.`);
  }
  return lines;
}

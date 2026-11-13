import { discordCommandOwner225 } from './discord-command-owner225';
import { discordMemberFenceSql as commandMemberFenceSql } from './discord-member-fence219';
/**
 * Owner item 3, stage 1 (14 Oct 2026): the sign-up buttons under a raid announcement in #raid-signups.
 *
 * A click is one Ed25519-signed, ledgered interaction: index.ts claims the interaction id before this runs and stores
 * the answer with the claim, so a repeat of the id gets the first answer and never runs this again. The click runs the
 * calendar's own RSVP statements (community-events.ts rsvpStatements) in ONE batch whose first statement is a Discord
 * member fence: the live site account (in the server, not denied) under the account incarnation and the privacy
 * generation captured just before the batch, a roster-confirmed character, no ban, no open erasure job. No session is
 * minted and the signed member.roles snapshot only decides the ephemeral text; the character and the raid role stay as
 * the member last set them on the site. A member without a site account is pointed to the site (community data stays
 * keyed by the site identity). Every answer is ephemeral with no mentions. No DM, no public message, no role.
 */
import type { Env } from "./env";
import { now } from "./db";
import { reply, userOf, type Interaction } from "./discord";
import { rateLimited } from "./site-core";
import { communityFeatures, DB_NOW, randomToken } from "./community-context";
import { scanLimit } from "./community-directory";
import { destination } from "./community-event-delivery";
import { rsvpRefusalState, rsvpStatements, type RsvpStatus } from "./community-events";
import { privacyAccountIncarnation, readPrivacySubject } from "./privacy-serving-authority";
import { captureLaneConfig } from "./full-release-roles";
import { siteMemberLink } from "./site-return";
import {captureCanonicalRankConfig233,hasCanonicalMemberAccess233} from './canonical-ranks233';

const BUTTON = /^raid:(rsvp|remind):([A-Za-z0-9_-]{22}):([1-9]\d{0,8})(?::(yes|tentative|no))?$/; // stage 2: raid:remind:<event>:<revision> has no status
const SNOWFLAKE = /^\d{17,20}$/;
const SAID: Record<RsvpStatus, string> = { yes: "Signed up for this raid. The organizer confirms the roster.", tentative: "Marked tentative for this raid.", no: "Marked as not coming to this raid." };
const ROSTER_SAID: Record<string, string> = { accepted: "The organizer has you on the roster.", bench: "The organizer has you on the bench.", declined: "The organizer has declined your sign-up for this raid." };

/** SQL true when the account at ?id may answer now: the same facts as the site's confirmedGuildData fence, without a session. */
export function discordMemberFenceSql(id: number, generation: string | null, incarnation: string, ownerAccess = false): string {
  return commandMemberFenceSql(id, generation, incarnation, ownerAccess);
}

export async function handleRaidComponent(env: Env, i: Interaction): Promise<Response> {
  // Revision 4 (A6): captured here, before any await, for the read-only member-role check below; absent configuration has no cfg.
  const freshMember = captureLaneConfig(env).cfg?.membership ?? null;
  const canonical = captureCanonicalRankConfig233(env);
  const m = BUTTON.exec(i.data?.custom_id ?? "");
  if (!m || (m[1] === "rsvp") !== (m[4] !== undefined)) return reply("Unknown component.");
  const kind = m[1] as "rsvp" | "remind", eventId = m[2]!, revision = Number(m[3]), status = (m[4] ?? "yes") as RsvpStatus;
  const d = destination(env);
  if (env.EVENT_DISCORD_DELIVERY !== "on" || !communityFeatures(env).has("events") || !d) return reply("Raid sign-ups by button are switched off. Use the calendar on the guild site.");
  const site = siteMemberLink(d.host, `community/calendar/${eventId}`);
  if (i.guild_id !== d.guild || (typeof i.channel_id === "string" && i.channel_id !== d.channel)) return reply("These buttons only work under the configured Olympus raid notice. Open the calendar or ask an Olympus officer for the current notice.");
  const user = userOf(i);
  if (!user || !SNOWFLAKE.test(user.id)) return reply("Unknown member.");
  const ownerAtEntry = discordCommandOwner225(env, user.id, i.guild_id ?? "");
  const ownerDeadline = now() + 180;
  // In configured mode the fresh member role (FULL_RELEASE_ROLES membership) is accepted too.
  if (!ownerAtEntry && (canonical.present
    ? !canonical.current() || !hasCanonicalMemberAccess233(env, i.member?.roles)
    : env.ROLE_GUILD_MEMBER && !(i.member?.roles ?? []).includes(env.ROLE_GUILD_MEMBER) && !(freshMember && (i.member?.roles ?? []).includes(freshMember)))) return reply(`Raid sign-ups are for verified guild members. Verify a character first, or open the calendar: ${site}`);
  if (rateLimited(`cr:${user.id}`, 30, 60)) return reply("Too many answers in one minute. Wait a moment, then try again.");
  // The capture: the live account and its incarnation, then the privacy generation, before the batch; the fence inside
  // the batch holds them, so anything that changes in between refuses the write instead of adopting a newer fact.
  const account = await env.DB.prepare("SELECT account_incarnation,session_version FROM site_users WHERE discord_id=?1 AND in_server=1 AND denied=0").bind(user.id).first<{ account_incarnation: unknown; session_version: number }>();
  if (!account) return reply(`Sign in on the guild site once with Discord; after that the buttons work for you. ${site}`);
  let incarnation: string;
  try { incarnation = privacyAccountIncarnation(account.account_incarnation); } catch { return reply(`Your site account could not be confirmed. Open the calendar: ${site}`); }
  const subject = await readPrivacySubject(env, user.id);
  if (subject && subject.state !== "active") return reply(`Your account is being closed, so no sign-up is recorded. ${site}`);
  const generation = subject?.subjectGeneration ?? null;
  if (ownerAtEntry && !Number.isSafeInteger(account.session_version)) return reply(`Your site account could not be confirmed. Open the calendar: ${site}`);
  const fence = (parameter: number) => {
    if (ownerAtEntry && !discordCommandOwner225(env, user.id, i.guild_id ?? "")) return `(?${parameter} IS NULL AND 0)`;
    const base = discordMemberFenceSql(parameter, generation, incarnation, ownerAtEntry);
    return ownerAtEntry ? `(${base} AND EXISTS(SELECT 1 FROM site_users ov226 WHERE ov226.discord_id=?${parameter} AND ov226.session_version=${account.session_version}) AND ${DB_NOW}<${ownerDeadline})` : base;
  };
  const limit = scanLimit(env), nonce = randomToken(), newRef = randomToken(), t = now();
  const probe = env.DB.prepare(`SELECT CASE WHEN ${fence(1)} THEN 1 ELSE json_extract('privacy_discord_request_refused','$') END AS admitted`).bind(user.id);
  if (kind === "remind") {
    // Stage 2: flip the reminder-mention choice of an existing sign-up under the same fence; the event must be open and the button current.
    const flip = env.DB.prepare(`UPDATE community_event_signups SET remind_mention = 1 - remind_mention, revision = revision + 1, updated_at = ?3, write_nonce = ?4
      WHERE event_id = ?1 AND discord_id = ?2 AND EXISTS (SELECT 1 FROM community_events e WHERE e.id = ?1 AND e.status = 'scheduled' AND e.starts_at > ${DB_NOW} AND e.revision = ?5) AND ${fence(2)} RETURNING remind_mention`).bind(eventId, user.id, t, nonce, revision);
    const note = env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?2, 'community.rsvp', ?1, NULL WHERE EXISTS (SELECT 1 FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2 AND write_nonce = ?4)").bind(eventId, user.id, t, nonce);
    let flipped: D1Result[];
    try { flipped = (await env.DB.batch([probe, flip, note])).slice(1); } catch { return reply(`Your account could not be confirmed. Open the calendar: ${site}`); }
    const after = (flipped[0]?.results[0] as { remind_mention: number } | undefined)?.remind_mention;
    if (after === 1) return reply(`You will be mentioned in the raid reminder the organizer may send an hour before the start, while your answer is yes. Press again to stop that. ${site}`);
    if (after === 0) return reply(`You will not be mentioned in the raid reminder. ${site}`);
    const state = await rsvpRefusalState(env, eventId, user.id, limit);
    if (!state) return reply(`This raid is no longer on the calendar. ${site}`);
    if (state.status === "cancelled") return reply("This raid was cancelled.");
    if (state.started === 1) return reply("This raid has already started.");
    if (state.revision !== revision) return reply(`This raid changed since these buttons were posted. Use the newest notice or the calendar: ${site}`);
    if (state.mine_status === null) return reply(`Sign up first (Sign up or Tentative), then press Remind me. ${site}`);
    return reply(`Your choice could not be confirmed (your site account or roster standing changed). Open the calendar: ${site}`);
  }
  const statements = rsvpStatements(env, { eventId, me: user.id, status, character: null, raidRole: null, keepChar: true, keepRole: true, revision: 0, anyRevision: true, eventRevision: revision, nonce, newRef, at: t, limit,
    fence: fence(2), sessionVersion: 0, expiresAt: 0, remindMention: null });
  let results: D1Result[];
  try { results = (await env.DB.batch([probe, ...statements])).slice(1); } catch { return reply(`Your account could not be confirmed for this sign-up. Open the calendar: ${site}`); }
  if ((results[0]?.meta?.changes ?? 0) > 0) {
    // stage 2: the organizer's standing decision for this sign-up, if any (a 'no' just cleared it)
    const d = status === "no" ? null : await env.DB.prepare("SELECT decision FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2 AND decision IS NOT NULL").bind(eventId, user.id).first<{ decision: string }>();
    return reply(`${SAID[status]}${d && ROSTER_SAID[d.decision] ? ` ${ROSTER_SAID[d.decision]}` : ""} Change your answer any time with these buttons or on the site: ${site}`);
  }
  // Refused: the same questions the site asks, from fresh facts, in the site's order; nothing private of anyone else.
  const state = await rsvpRefusalState(env, eventId, user.id, limit);
  if (!state) return reply(`This raid is no longer on the calendar. ${site}`);
  if (state.status === "cancelled") return reply("This raid was cancelled.");
  if (state.started === 1) return reply("This raid has already started; sign-ups are closed.");
  if (state.revision !== revision) return reply(`This raid changed since these buttons were posted. Use the newest notice or the calendar: ${site}`);
  if (status === "yes" && state.capacity !== null && state.mine_status !== "yes" && state.yes >= state.capacity) return reply(`This raid is full. You can still answer Tentative, or open the calendar: ${site}`);
  if (state.in_calendar !== 1 && state.calendar_room !== 1) return reply(`The calendar cannot take more members right now. Try again later, or on the site: ${site}`);
  return reply(`Your sign-up could not be confirmed (your site account or roster standing changed). Open the calendar: ${site}`);
}

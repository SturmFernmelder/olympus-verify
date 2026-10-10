/** Owner task 3 (10 Oct 2026): one explicitly opted reminder, due sixty minutes before the event.
 * The half-hour cron sends at its next eligible tick, not at a promised exact minute. A lost send is held.
 * Consent is durable, but execution rechecks today's account/organizer/member facts; it never fabricates a session.
 */
import type { Env } from "./env";
import { apiJson, isSiteAdmin, PAGE_VERSION, sameOrigin } from "./site-core";
import { admitted, admittedRead, DB_NOW, fenceSql, FENCE_REFUSED, organizerIds, communityFeatures, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { contentOf, destination, discord, eventDiscordMemberPresent, exactContent, knownRefusal, ownMessage, qualifyDestination } from "./community-event-delivery";
import { secondsToIso } from "./community-time";

const ID = /^[A-Za-z0-9_-]{22}$/;
interface Event { id: string; title: string; starts_at: number; duration_min: number; status: string; revision: number; created_at: number; retain_until: number; publication_closed: number; reminder_closed: number }
interface Reminder {
  event_id: string; event_revision: number; starts_at: number; actor: string | null; consent_version: number | null;
  guild_id: string; channel_id: string; host: string; op_id: string; claim_nonce: string | null;
  state: "armed" | "claimed" | "posted" | "refused" | "unknown" | "cancelled" | "removed";
  message_id: string | null; frozen_content: string | null; cleanup_requested: number; retain_until: number; expired?: number;
}
const enabled = (env: Env) => env.EVENT_DISCORD_REMINDERS === "on" && env.EVENT_DISCORD_DELIVERY === "on" && communityFeatures(env).has("events");
const organizers = (env: Env) => {
  const staff = (env.SITE_ADMINS ?? "").split(",").map((v) => v.trim()).filter((v) => /^[0-9]{17,20}$/.test(v));
  return JSON.stringify({ organizers: [...new Set([...organizerIds(env), ...staff])], staff });
};
// Deliberately independent of cookie expiry: revocation/session-version change still invalidates stored consent.
// This matches communityContext's organizer policy (keeper confirmation/ban and configured organizer), with an extra
// live guild-presence proof. Discord role changes are not a second authorization system for this calendar action.
const authority = `EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=r.actor AND u.session_version=r.consent_version AND u.denied=0 AND u.in_server=1)
  AND EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=r.actor AND c.status='member')
  AND NOT EXISTS(SELECT 1 FROM members m WHERE m.discord_id=r.actor AND m.banned=1)
  AND r.actor IN(SELECT value FROM json_each(?2,'$.organizers'))
  AND EXISTS(SELECT 1 FROM community_events e WHERE e.id=r.event_id AND (e.created_by=r.actor OR r.actor IN(SELECT value FROM json_each(?2,'$.staff'))))`;
const current = `r.cleanup_requested=0 AND r.retain_until>${DB_NOW} AND EXISTS(SELECT 1 FROM community_events e WHERE e.id=r.event_id
  AND e.reminder_closed=0 AND e.revision=r.event_revision AND e.starts_at=r.starts_at AND e.status='scheduled'
  AND e.starts_at>${DB_NOW} AND e.starts_at<=${DB_NOW}+3600 AND e.starts_at<=e.created_at+366*86400 AND e.retain_until>${DB_NOW})`;
const description = (e: Event, env: Env) => { const d = destination(env); return d ? `**Raid reminder**\n${contentOf(e, d)}` : null; };
async function gate(request: Request, env: Env, ctx: CommunityContext, write = false) {
  if (!ctx.subject || !ctx.capabilities.confirmedGuildData) return refusal(env, request, "confirmedGuildData");
  if (!ctx.capabilities.organizer) return apiJson({ error: "not_organizer" }, 403);
  if (write && (!sameOrigin(request) || request.headers.get("X-Olympus") !== PAGE_VERSION)) return apiJson({ error: "reload" }, 409);
  return null;
}
async function read(env: Env, ctx: CommunityContext, eventId: string) {
  const s = ctx.subject!;
  const out = await admittedRead(env, ctx, "confirmedGuildData", [
    env.DB.prepare(`SELECT * FROM community_events WHERE id=?1 AND (created_by=?2 OR ?3=1) AND retain_until>${DB_NOW}`).bind(eventId, s.discordId, isSiteAdmin(env, s.discordId) ? 1 : 0),
    env.DB.prepare(`SELECT *,retain_until<=${DB_NOW} AS expired FROM community_event_reminders WHERE event_id=?1
      AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND (created_by=?2 OR ?3=1) AND retain_until>${DB_NOW})`).bind(eventId, s.discordId, isSiteAdmin(env, s.discordId) ? 1 : 0),
  ]);
  if (out === FENCE_REFUSED) return out;
  const event = out[0]!.results[0] as unknown as Event | undefined;
  return event ? { event, row: (out[1]!.results[0] as unknown as Reminder | undefined) ?? null } : null;
}
async function answer(request: Request, env: Env, ctx: CommunityContext, eventId: string, error?: string) {
  const out = await read(env, ctx, eventId);
  if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if (!out) return apiJson({ error: "event_not_found" }, 404);
  const e = out.event, r = out.row, content = description(e, env);
  return apiJson({ eventId, revision: e.revision, enabled: enabled(env), closed: e.reminder_closed === 1 || r?.expired === 1,
    canArm: enabled(env) && !!content && e.reminder_closed === 0 && r?.expired !== 1 && e.status === "scheduled" && e.starts_at > Date.now()/1000 && (!r || ["armed", "cancelled", "refused"].includes(r.state)) && !r?.message_id && r?.cleanup_requested !== 1,
    payload: content ? { content, allowed_mentions: { parse: [] } } : null,
    reminder: r ? { state: r.state, revision: r.event_revision, stale: r.event_revision !== e.revision, operationId: r.op_id,
      removalPending: r.cleanup_requested === 1, dueAt: secondsToIso(r.starts_at-3600), retainUntil: secondsToIso(r.retain_until),
      messageUrl: r.message_id ? `https://discord.com/channels/${r.guild_id}/${r.channel_id}/${r.message_id}` : null } : null,
    ...(error ? { error } : {}) }, error ? 409 : 200);
}
async function body(request: Request, keys: string[]): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader(); if (!reader) return null;
  let text = "", bytes = 0; const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  try { while (true) { const n = await reader.read(); if (n.done) break; bytes += n.value.length; if (bytes > 4096) { await reader.cancel(); return null; } text += decoder.decode(n.value, { stream: true }); } text += decoder.decode();
    const v = JSON.parse(text); return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((k) => keys.includes(k)) ? v : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
export async function eventReminderStatus(request: Request, env: Env, ctx: CommunityContext) {
  const no = await gate(request, env, ctx); if (no) return no;
  const eventId = new URL(request.url).searchParams.get("eventId");
  return eventId && ID.test(eventId) ? answer(request, env, ctx, eventId) : apiJson({ error: "invalid_event_id" }, 400);
}
export async function eventReminderConsent(request: Request, env: Env, ctx: CommunityContext) {
  const no = await gate(request, env, ctx, true); if (no) return no;
  const v = await body(request, ["eventId", "revision", "enabled"]);
  if (!v || typeof v.eventId !== "string" || !ID.test(v.eventId) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || typeof v.enabled !== "boolean") return apiJson({ error: "invalid_request" }, 400);
  const out = await read(env, ctx, v.eventId);
  if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if (!out) return apiJson({ error: "event_not_found" }, 404);
  if (out.event.revision !== v.revision) return answer(request, env, ctx, v.eventId, "stale_revision");
  if (v.enabled && out.row?.expired === 1) return answer(request, env, ctx, v.eventId, "reminder_expired");
  const s = ctx.subject!, staff = isSiteAdmin(env, s.discordId) ? 1 : 0;
  const managed = `EXISTS(SELECT 1 FROM community_events e WHERE e.id=?1 AND e.revision=?5 AND (e.created_by=?2 OR ?6=1) AND e.retain_until>${DB_NOW}) AND ${fenceSql("confirmedGuildData", 2, 3, 4)}`;
  let stmt: D1PreparedStatement;
  if (v.enabled) {
    const d = destination(env), content = description(out.event, env);
    if (!enabled(env) || !d || !content) return apiJson({ error: "feature_disabled" }, 503);
    stmt = env.DB.prepare(`INSERT INTO community_event_reminders(event_id,event_revision,starts_at,actor,consent_version,guild_id,channel_id,host,op_id,state,frozen_content,created_at,updated_at,last_attempt_at,retain_until)
      SELECT e.id,e.revision,e.starts_at,?2,?3,?7,?8,?9,?10,'armed',?11,${DB_NOW},${DB_NOW},0,e.retain_until FROM community_events e
      WHERE e.id=?1 AND e.reminder_closed=0 AND e.status='scheduled' AND e.starts_at>${DB_NOW} AND e.starts_at<=e.created_at+366*86400 AND ${managed}
      ON CONFLICT(event_id) DO UPDATE SET event_revision=excluded.event_revision,starts_at=excluded.starts_at,actor=excluded.actor,consent_version=excluded.consent_version,
        guild_id=excluded.guild_id,channel_id=excluded.channel_id,host=excluded.host,op_id=excluded.op_id,state='armed',frozen_content=excluded.frozen_content,claim_nonce=NULL,
        updated_at=${DB_NOW},last_attempt_at=0,retain_until=MIN(community_event_reminders.retain_until,excluded.retain_until)
      WHERE community_event_reminders.retain_until>${DB_NOW} AND community_event_reminders.state IN('armed','cancelled','refused') AND community_event_reminders.message_id IS NULL AND community_event_reminders.cleanup_requested=0`)
      .bind(v.eventId, s.discordId, s.sessionVersion, s.expiresAt, v.revision, staff, d.guild, d.channel, d.host, randomToken(), content);
  } else stmt = env.DB.prepare(`UPDATE community_event_reminders SET state=CASE WHEN state IN('claimed','unknown') THEN 'unknown' WHEN state='posted' THEN state ELSE 'cancelled' END,
    cleanup_requested=CASE WHEN message_id IS NOT NULL OR state IN('claimed','unknown') THEN 1 ELSE cleanup_requested END,updated_at=${DB_NOW} WHERE event_id=?1 AND ${managed}`)
    .bind(v.eventId, s.discordId, s.sessionVersion, s.expiresAt, v.revision, staff);
  const result = await admitted(env, ctx, [stmt, env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?1,'community.event_reminder_consent',?2,?3 WHERE changes()=1`).bind(s.discordId, v.eventId, JSON.stringify({ enabled: v.enabled }))]);
  return answer(request, env, ctx, v.eventId, result === FENCE_REFUSED ? "reminder_not_changed" : undefined);
}

/** One due candidate per invocation; failed prerequisites rotate by last_attempt_at. Unknown sends never enter this scan. */
export async function runEventReminders(env: Env): Promise<number> {
  if (!enabled(env)) return 0;
  const d = destination(env); if (!d) return 0;
  const r = await env.DB.prepare(`SELECT r.* FROM community_event_reminders r WHERE r.state='armed' AND ${current} ORDER BY r.last_attempt_at,r.starts_at,r.event_id LIMIT 1`).first<Reminder>();
  if (!r) return 0;
  await env.DB.prepare(`UPDATE community_event_reminders SET last_attempt_at=${DB_NOW} WHERE event_id=?1 AND state='armed' AND op_id=?2`).bind(r.event_id, r.op_id).run();
  if (!r.actor || r.guild_id !== d.guild || r.channel_id !== d.channel || r.host !== d.host || !r.frozen_content) return 0;
  const bot = await qualifyDestination(env, d);
  if (!bot || !(await eventDiscordMemberPresent(env, r.actor, d.guild))) return 0;
  const nonce = randomToken(), ids = organizers(env);
  const claim = await env.DB.prepare(`UPDATE community_event_reminders AS r SET state='claimed',claim_nonce=?3,updated_at=${DB_NOW} WHERE event_id=?1 AND state='armed' AND op_id=?4 AND ${current} AND ${authority}`)
    .bind(r.event_id, ids, nonce, r.op_id).run();
  if (claim.meta.changes !== 1) return 0;
  // HTTP prerequisite reads yielded: final current consent/account/event/config checks precede the one effect.
  const proof = await env.DB.prepare(`SELECT 1 AS ok FROM community_event_reminders r WHERE event_id=?1 AND state='claimed' AND claim_nonce=?3 AND ${current} AND ${authority}`).bind(r.event_id, ids, nonce).first<{ ok: number }>();
  if (!proof || !enabled(env) || JSON.stringify(destination(env)) !== JSON.stringify(d)) {
    await env.DB.prepare(`UPDATE community_event_reminders SET state='cancelled',updated_at=${DB_NOW} WHERE event_id=?1 AND claim_nonce=?2 AND state='claimed'`).bind(r.event_id, nonce).run(); return 0;
  }
  let state = "unknown", pointer: string | null = null;
  try {
    const sent = await discord(env, "POST", `/channels/${d.channel}/messages`, { content: r.frozen_content, allowed_mentions: { parse: [] }, nonce, enforce_nonce: true });
    if (knownRefusal(sent.status)) state = "refused";
    else if (sent.status >= 200 && sent.status < 300 && ownMessage(sent.value, d, bot)) {
      pointer = sent.value.id; if (exactContent(sent.value, r.frozen_content)) state = "posted";
    }
  } catch { /* unknown transport/redirect/abort/body result stays held; no automatic resend */ }
  await env.DB.batch([
    env.DB.prepare(`UPDATE community_event_reminders AS r SET message_id=COALESCE(?4,message_id),state=CASE WHEN ?3='posted' AND (${current}) AND (${authority}) THEN 'posted' WHEN ?3='posted' THEN 'unknown' ELSE ?3 END,
      updated_at=${DB_NOW} WHERE event_id=?1 AND claim_nonce=?5 AND state IN('claimed','unknown')`).bind(r.event_id, ids, state, pointer, nonce),
    env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},'cron','community.event_reminder_delivery',?1,?2 WHERE changes()=1`).bind(r.event_id, JSON.stringify({ result: state })),
  ]);
  return state === "posted" ? 1 : 0;
}

export async function eventReminderMessage(request: Request, env: Env, ctx: CommunityContext, remove = false) {
  const no = await gate(request, env, ctx, true); if (no) return no;
  const v = await body(request, remove ? ["eventId", "opId"] : ["eventId", "opId", "messageId"]);
  if (!v || typeof v.eventId !== "string" || !ID.test(v.eventId) || typeof v.opId !== "string" || !ID.test(v.opId) || (!remove && (typeof v.messageId !== "string" || !/^[0-9]{17,20}$/.test(v.messageId)))) return apiJson({ error: "invalid_request" }, 400);
  const out = await read(env, ctx, v.eventId);
  if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if (!out) return apiJson({ error: "event_not_found" }, 404);
  const r = out.row;
  if (!r || r.op_id !== v.opId || !r.claim_nonce || (remove ? !r.message_id : !["claimed", "unknown"].includes(r.state))) return answer(request, env, ctx, v.eventId, "reminder_custody_unqualified");
  if (!remove && r.message_id && r.message_id !== v.messageId) return answer(request, env, ctx, v.eventId, "reminder_custody_unqualified");
  const d = { guild: r.guild_id, channel: r.channel_id, host: r.host };
  if (env.SITE_GUILD_ID !== d.guild) return answer(request, env, ctx, v.eventId, "reminder_destination_changed");
  const bot = await qualifyDestination(env, d); if (!bot || !(await eventDiscordMemberPresent(env, ctx.subject!.discordId, d.guild))) return answer(request, env, ctx, v.eventId, "reminder_destination_unqualified");
  const messageId = remove ? r.message_id! : v.messageId as string;
  const found = await discord(env, "GET", `/channels/${d.channel}/messages/${messageId}`);
  if (!(remove && found.status === 404) && (found.status !== 200 || !ownMessage(found.value, d, bot) || found.value.id !== messageId || (!remove && (!exactContent(found.value, r.frozen_content) || (!r.message_id && found.value.nonce !== r.claim_nonce))))) return answer(request, env, ctx, v.eventId, "reminder_custody_unqualified");
  const s = ctx.subject!, staff = isSiteAdmin(env, s.discordId) ? 1 : 0, nonce = randomToken();
  const claim = await admitted(env, ctx, [env.DB.prepare(`UPDATE community_event_reminders SET claim_nonce=?5,state='claimed',message_id=COALESCE(message_id,?9),updated_at=${DB_NOW} WHERE event_id=?1 AND claim_nonce=?6 AND op_id=?7 AND state IN('claimed','unknown','posted')
    AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND (created_by=?2 OR ?8=1) AND retain_until>${DB_NOW}) AND ${fenceSql("confirmedGuildData", 2, 3, 4)}`)
    .bind(r.event_id, s.discordId, s.sessionVersion, s.expiresAt, nonce, r.claim_nonce, r.op_id, staff, messageId)]);
  if (claim === FENCE_REFUSED) return answer(request, env, ctx, r.event_id, "reminder_not_changed");
  const proof = await admittedRead(env, ctx, "confirmedGuildData", [env.DB.prepare(`SELECT 1 AS ok FROM community_event_reminders WHERE event_id=?1 AND claim_nonce=?2 AND state='claimed' AND retain_until>${DB_NOW}
    AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND (created_by=?3 OR ?4=1) AND retain_until>${DB_NOW})`).bind(r.event_id, nonce, s.discordId, staff)]);
  if (proof === FENCE_REFUSED || !proof[0]!.results.length) return answer(request, env, ctx, r.event_id, "reminder_held");
  let state = "posted";
  if (remove) {
    state = "unknown";
    try { if (found.status === 404) state = "removed"; else { const deleted = await discord(env, "DELETE", `/channels/${d.channel}/messages/${messageId}`); if (deleted.status === 204 || deleted.status === 404) state = "removed"; } } catch { /* preserve deletion debt */ }
  }
  await env.DB.prepare(`UPDATE community_event_reminders SET message_id=CASE WHEN ?3='removed' THEN NULL ELSE ?4 END,state=CASE WHEN ?3='posted' AND cleanup_requested=1 THEN 'unknown' ELSE ?3 END,
    frozen_content=CASE WHEN ?3='removed' THEN NULL ELSE frozen_content END,cleanup_requested=CASE WHEN ?3='removed' THEN 0 ELSE cleanup_requested END,updated_at=${DB_NOW}
    WHERE event_id=?1 AND claim_nonce=?2 AND state IN('claimed','unknown')`).bind(r.event_id, nonce, state, messageId).run();
  return answer(request, env, ctx, r.event_id);
}

export function eventReminderChanged(env: Env, eventId: string, eventNonce: string): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_event_reminders SET state=CASE WHEN state IN('claimed','unknown') THEN 'unknown' WHEN state='armed' THEN 'cancelled' ELSE state END,
    cleanup_requested=CASE WHEN message_id IS NOT NULL OR state IN('claimed','unknown') THEN 1 ELSE cleanup_requested END,
    retain_until=MIN(retain_until,(SELECT retain_until FROM community_events WHERE id=?1)),updated_at=${DB_NOW} WHERE event_id=?1 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND nonce=?2)`).bind(eventId, eventNonce);
}
const expired = "event_id IN(SELECT event_id FROM community_event_reminders WHERE retain_until<=?1 ORDER BY retain_until,event_id LIMIT ?2) OR event_id IN(SELECT id FROM community_events WHERE retain_until<=?1 ORDER BY retain_until,id LIMIT ?2)";
export function eventReminderCloseExpired(env: Env, at: number, limit: number): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_events SET reminder_closed=1 WHERE reminder_closed=0 AND id IN(SELECT event_id FROM community_event_reminders WHERE (${expired}) AND (message_id IS NOT NULL OR state IN('claimed','unknown','posted','removed')))` ).bind(at, limit);
}
export function eventReminderExpiry(env: Env, at: number, limit: number): D1PreparedStatement {
  return env.DB.prepare(`DELETE FROM community_event_reminders WHERE ${expired}`).bind(at, limit);
}
export function eventReminderOwnerErase(env: Env, who: string): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_event_reminders SET actor=NULL,consent_version=NULL,frozen_content=NULL,cleanup_requested=1,
    state=CASE WHEN state IN('claimed','unknown') THEN 'unknown' WHEN state='armed' THEN 'cancelled' ELSE state END,updated_at=${DB_NOW}
    WHERE event_id IN(SELECT id FROM community_events WHERE created_by=?1)`).bind(who);
}
registerCommunityData("event_reminders", (env, who) => [env.DB.prepare(`UPDATE community_event_reminders SET actor=NULL,consent_version=NULL,frozen_content=NULL,cleanup_requested=1,
  state=CASE WHEN state IN('claimed','unknown') THEN 'unknown' WHEN state='armed' THEN 'cancelled' ELSE state END,updated_at=${DB_NOW}
  WHERE actor=?1`).bind(who)],
  (env, who) => ({ statements: [env.DB.prepare("SELECT event_id,event_revision,state,starts_at,created_at,retain_until FROM community_event_reminders WHERE actor=?1 ORDER BY event_id").bind(who)],
    shape: ([rows]) => ({ reminders: (rows!.results as Record<string, unknown>[]).map((r) => ({ eventId: r.event_id, revision: r.event_revision, state: r.state, startsAt: secondsToIso(r.starts_at as number), createdAt: secondsToIso(r.created_at as number), retainUntil: secondsToIso(r.retain_until as number) })) }) }));

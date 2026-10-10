/**
 * Explicit organizer publication of an existing calendar event (owner task 3/9, 10 Oct 2026).
 * A durable claim precedes each Discord effect. A lost response is held, never treated as permission to post again.
 * This is publication only: it registers no command, scheduler, reminder, role writer or new authority capability.
 */
import type { Env } from "./env";
import { now } from "./db";
import { API, credentialFetch } from "./discord";
import { apiJson, isSiteAdmin, PAGE_VERSION, sameOrigin } from "./site-core";
import { admitted, admittedRead, communityFeatures, DB_NOW, fenceSql, FENCE_REFUSED, organizerIds, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { secondsToIso } from "./community-time";
import { privacyProviderCustodyDatabase } from "./privacy-serving-authority";

const ID = /^[A-Za-z0-9_-]{22}$/;
const SNOWFLAKE = /^[0-9]{17,20}$/;
const BODY_LIMIT = 4096;
const DISCORD_BODY_LIMIT = 32768;
const START_HORIZON_S = 366 * 86400; // accepted event creation clock; an edit must not move this boundary forward
const RESULTS = ["published", "reconciled", "removed", "admission_changed", "discord_refused", "outcome_unknown"] as const;
const safeResult = (v: unknown) => typeof v === "string" && (RESULTS as readonly string[]).includes(v) ? v : null;
type State = "claimed" | "posted" | "refused" | "unknown" | "removed";
export interface Destination { guild: string; channel: string; host: string }
interface EventRow { id: string; title: string; starts_at: number; duration_min: number; status: string; revision: number; created_at: number; retain_until: number; publication_closed: number }
interface Delivery {
  event_id: string; purpose: "publication"; event_revision: number; starts_at: number; guild_id: string; channel_id: string;
  message_id: string | null; frozen_content: string | null; payload_hash: string | null; op_id: string; claim_nonce: string;
  state: State; cleanup_requested: number; actor: string | null; session_version: number | null; session_expires: number | null;
  created_at: number; updated_at: number; retain_until: number; result_code: string | null;
}
interface Message { id: string; channel_id: string; author: { id: string; bot: boolean }; content: string; nonce?: string; webhook_id?: unknown; type: number; embeds: unknown[]; attachments: unknown[] }
class Bad extends Error { constructor(public code: string, public status = 400) { super(code); } }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown, code = "invalid_event_id") => { if (typeof v !== "string" || !ID.test(v)) throw new Bad(code); return v; };
const revision = (v: unknown) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) throw new Bad("invalid_revision"); return v; };
const bad = (e: unknown) => e instanceof Bad ? apiJson({ error: e.code }, e.status) : null;

/** No client-supplied destination or bot-host URL enters the frozen announcement. Ambiguous mappings refuse. */
export function destination(env: Env): Destination | null {
  const guild = env.SITE_GUILD_ID ?? "", host = (env.SITE_HOST ?? "").toLowerCase();
  const maps = (env.INTROS_CHANNELS ?? "").split(",").map((v) => v.split("=").map((s) => s.trim())).filter(([k]) => k === "raid-signups");
  if (!SNOWFLAKE.test(guild) || env.INTROS_GUILD_ID !== guild || maps.length !== 1 || maps[0]!.length !== 2 || !SNOWFLAKE.test(maps[0]![1]!)) return null;
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host)) return null;
  try { if (new URL(`https://${host}`).host !== host) return null; } catch { return null; }
  return { guild, channel: maps[0]![1]!, host };
}
const enabled = (env: Env) => env.EVENT_DISCORD_DELIVERY === "on" && communityFeatures(env).has("events");
const sameDestination = (a: Destination, b: Destination | null) => !!b && a.guild === b.guild && a.channel === b.channel && a.host === b.host;
const organizer = (env: Env, ctx: CommunityContext) => !!ctx.subject && (isSiteAdmin(env, ctx.subject.discordId) || organizerIds(env).has(ctx.subject.discordId));
async function gate(request: Request, env: Env, ctx: CommunityContext, write = false): Promise<Response | null> {
  if (!ctx.subject || !ctx.capabilities.confirmedGuildData) return refusal(env, request, "confirmedGuildData");
  if (!organizer(env, ctx)) return apiJson({ error: "not_organizer" }, 403);
  if (write && (request.headers.get("X-Olympus") !== PAGE_VERSION || !sameOrigin(request))) return apiJson({ error: "reload" }, 409);
  return null;
}
async function readJsonBounded(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Bad("invalid_request");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > limit) { await reader.cancel(); throw new Bad("invalid_request"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}
async function bodyOf(request: Request, keys: string[]): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await readJsonBounded(new Response(request.body), BODY_LIMIT); } catch { throw new Bad("invalid_request"); }
  if (!record(value) || Object.keys(value).some((k) => !keys.includes(k))) throw new Bad("invalid_request");
  return value;
}
const escapeTitle = (text: string) => text.replace(/[\\`*_{}\[\]()<>#|~]/g, "\\$&");
export function contentOf(e: EventRow, d: Destination): string {
  return `**${escapeTitle(e.title)}**\n<t:${e.starts_at}:F> · <t:${e.starts_at}:R>\nDuration: ${e.duration_min} minutes\n[Sign up on the Olympus calendar](https://${d.host}/#/community/calendar/${e.id})\nA sign-up reserves a place; the organizer confirms the raid roster.`;
}
const hashOf = async (content: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)))].map((b) => b.toString(16).padStart(2, "0")).join("");
function summary(row: Delivery | null, e: EventRow) {
  return row ? { state: row.state, revision: row.event_revision, stale: row.event_revision !== e.revision, removalPending: row.cleanup_requested === 1, operationId: ID.test(row.op_id) ? row.op_id : null,
    messageUrl: row.message_id ? `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}` : null,
    retainUntil: secondsToIso(row.retain_until), result: safeResult(row.result_code) } : null;
}
/** One admitted read, with event-management authority inside the payload SQL as well as the original session probe. */
async function read(env: Env, ctx: CommunityContext, eventId: string): Promise<{ event: EventRow; delivery: Delivery | null } | typeof FENCE_REFUSED | null> {
  const me = ctx.subject!.discordId, staff = isSiteAdmin(env, me) ? 1 : 0;
  if (!organizer(env, ctx)) return FENCE_REFUSED;
  const managed = `(created_by = ?2 OR ?3 = 1) AND retain_until > ${DB_NOW}`;
  const out = await admittedRead(env, ctx, "confirmedGuildData", [
    env.DB.prepare(`SELECT id,title,starts_at,duration_min,status,revision,created_at,retain_until,publication_closed FROM community_events WHERE id=?1 AND ${managed}`).bind(eventId, me, staff),
    env.DB.prepare(`SELECT * FROM community_event_deliveries WHERE event_id=?1 AND purpose='publication' AND retain_until>${DB_NOW}
      AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND ${managed})`).bind(eventId, me, staff),
  ]);
  if (out === FENCE_REFUSED) return out;
  const event = out[0]!.results[0] as unknown as EventRow | undefined;
  return event ? { event, delivery: (out[1]!.results[0] as unknown as Delivery | undefined) ?? null } : null;
}
async function answer(request: Request, env: Env, ctx: CommunityContext, eventId: string, extra: Record<string, unknown> = {}, status = 200, outcome = false): Promise<Response> {
  const out = await read(env, ctx, eventId);
  if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if (!out) return apiJson({ error: "event_not_found" }, 404);
  const held = outcome && out.delivery && ["claimed", "unknown", "refused"].includes(out.delivery.state);
  return apiJson({ eventId, revision: out.event.revision, delivery: summary(out.delivery, out.event), ...extra,
    ...(held ? { error: out.delivery!.state === "refused" ? "delivery_refused" : "delivery_held" } : {}) }, held ? 409 : status);
}

/** GET preview is the exact safe content a publish must bind with payloadHash; member/sign-up DTOs never enter it. */
export async function eventDeliveryPreview(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx); if (no) return no;
  try {
    const eventId = id(new URL(request.url).searchParams.get("eventId"));
    const out = await read(env, ctx, eventId);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    if (!out) return apiJson({ error: "event_not_found" }, 404);
    const d = destination(env), content = d ? contentOf(out.event, d) : null;
    const payloadHash = content ? await hashOf(content) : null;
    // Hashing yields: a final original-session read refuses revocation or an intervening event revision.
    const current = await read(env, ctx, eventId);
    if (current === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    if (!current) return apiJson({ error: "event_not_found" }, 404);
    if (current.event.revision !== out.event.revision || (d ? !sameDestination(d, destination(env)) : destination(env) !== null)) return apiJson({ error: "stale_revision" }, 409);
    return apiJson({ eventId, revision: current.event.revision, enabled: enabled(env), payload: content ? { content, allowed_mentions: { parse: [] } } : null,
      payloadHash, publicationClosed: current.event.publication_closed === 1, publicationBlock: current.event.publication_closed === 1 ? "publication_closed" : null,
      canPublish: !!content && enabled(env) && current.event.publication_closed === 0 && current.event.status === "scheduled" && current.event.starts_at > now() && current.event.starts_at <= current.event.created_at + START_HORIZON_S && current.delivery?.cleanup_requested !== 1,
      delivery: summary(current.delivery, current.event) });
  } catch (e) { return bad(e) ?? Promise.reject(e); }
}

/** Exactly one bounded credential-bearing request. Error bodies, tokens and provider text are neither stored nor returned. */
export async function discord(env: Env, method: string, path: string, body?: unknown): Promise<{ status: number; value: unknown }> {
  const response = await credentialFetch(API + path, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204 || !response.ok) { await response.body?.cancel(); return { status: response.status, value: null }; }
  try { return { status: response.status, value: await readJsonBounded(response, DISCORD_BODY_LIMIT) }; }
  catch { return { status: response.status, value: null }; }
}
export async function qualifyDestination(env: Env, d: Destination): Promise<string | null> {
  const app = env.DISCORD_APP_ID?.trim();
  if (!app || !SNOWFLAKE.test(app)) return null;
  try {
    const channel = await discord(env, "GET", `/channels/${d.channel}`);
    if (channel.status !== 200 || !record(channel.value) || channel.value.id !== d.channel || channel.value.guild_id !== d.guild || channel.value.type !== 0) return null;
    const self = await discord(env, "GET", "/users/@me");
    if (self.status !== 200 || !record(self.value) || self.value.id !== app || self.value.bot !== true) return null;
    return self.value.id;
  } catch { return null; }
}
/** Membership failure/outage is HOLD, never an inferred departure or an authorization grant. */
async function memberPresent(env: Env, ctx: CommunityContext, guild: string): Promise<boolean> {
  return eventDiscordMemberPresent(env, ctx.subject!.discordId, guild);
}
export async function eventDiscordMemberPresent(env: Env, actor: string, guild: string): Promise<boolean> {
  try {
    const result = await discord(env, "GET", `/guilds/${guild}/members/${actor}`);
    return result.status === 200 && record(result.value) && record(result.value.user) && result.value.user.id === actor;
  } catch { return false; }
}
export function ownMessage(v: unknown, d: Destination, bot: string): v is Message {
  return record(v) && typeof v.id === "string" && SNOWFLAKE.test(v.id) && v.channel_id === d.channel && record(v.author) && v.author.id === bot && v.author.bot === true && v.webhook_id == null && v.type === 0;
}
export const exactContent = (m: Message, content: string | null) => content !== null && m.content === content && Array.isArray(m.embeds) && m.embeds.length === 0 && Array.isArray(m.attachments) && m.attachments.length === 0;
export const knownRefusal = (status: number) => [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(status);

/** Captured before the provider await; never refreshed from a replacement account or operation. */
export interface EventCustodyProof {
  eventId: string; revision: number; startsAt: number; opId: string; nonce: string;
  guild: string; channel: string; pointer: string | null; retainUntil: number;
}
/** Update only exact erasure-adopted event/operation/claim custody. Legacy purpose:op rows remain held.
 * No new subject/content record or renewed deadline is created. Already cleaning/removed custody
 * cannot be overwritten by a late response; a different known pointer also refuses.
 */
export function eventAdoptedCustody(db: D1Database, purpose: "event_publication" | "event_reminder", p: EventCustodyProof,
  result: "posted" | "refused" | "unknown" | "removed", pointer: string | null): D1PreparedStatement {
  return db.prepare(`UPDATE privacy_provider_messages SET
    message_id=CASE WHEN ?3='removed' THEN NULL ELSE COALESCE(?4,message_id) END,
    state=CASE WHEN ?3='removed' THEN 'removed' WHEN ?4 IS NOT NULL THEN 'known'
      WHEN ?3='refused' AND message_id IS NULL THEN 'refused' ELSE state END,updated_at=${DB_NOW}
    WHERE operation_id=?1 AND purpose=?2 AND channel_id=?5 AND retain_until<=?6
      AND state IN('claimed','unknown','known') AND (message_id IS NULL OR message_id=?4 OR message_id IS ?7)`)
    .bind(`${purpose}:${p.eventId}:${p.opId}:${p.nonce}`, purpose, result, pointer, p.channel, p.retainUntil, p.pointer);
}
/** Response-only custody uses the native database; admission, dispatch and response disclosure stay fenced. */
async function settle(env: Env, ctx: CommunityContext, p: EventCustodyProof, result: "posted" | "refused" | "unknown" | "removed", code: string, pointer: string | null = null) {
  const me = ctx.subject!.discordId, staff = isSiteAdmin(env, me) ? 1 : 0, db = privacyProviderCustodyDatabase(env);
  const stillCurrent = `actor=?5 AND session_version=?6 AND session_expires=?7 AND cleanup_requested=0
    AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND publication_closed=0 AND revision=?8 AND starts_at=?15 AND status='scheduled' AND starts_at>${DB_NOW} AND starts_at<=created_at+${START_HORIZON_S} AND retain_until>${DB_NOW} AND (created_by=?5 OR ?9=1))
    AND ${fenceSql("confirmedGuildData", 5, 6, 7, ctx.subject!.privacyGeneration ?? null)}`;
  await db.batch([
    db.prepare(`UPDATE community_event_deliveries SET message_id=CASE WHEN ?3='removed' THEN NULL ELSE COALESCE(?10,message_id) END,
      state=CASE WHEN ?3='posted' THEN CASE WHEN state IN('claimed','unknown') AND ${stillCurrent} THEN 'posted' ELSE 'unknown' END ELSE ?3 END,
      frozen_content=CASE WHEN ?3='removed' THEN NULL ELSE frozen_content END, payload_hash=CASE WHEN ?3='removed' THEN NULL ELSE payload_hash END,
      cleanup_requested=CASE WHEN ?3='removed' THEN 0 WHEN ?10 IS NOT NULL AND NOT(${stillCurrent}) THEN 1 ELSE cleanup_requested END,
      updated_at=${DB_NOW}, result_code=?4
      WHERE event_id=?1 AND purpose='publication' AND claim_nonce=?2 AND op_id=?11 AND guild_id=?12 AND channel_id=?13
        AND event_revision=?8 AND starts_at=?15 AND retain_until<=?16 AND (message_id IS ?14 OR message_id=?10) AND state IN('claimed','unknown')`)
      .bind(p.eventId, p.nonce, result, code, me, ctx.subject!.sessionVersion, ctx.subject!.expiresAt, p.revision, staff, pointer,
        p.opId, p.guild, p.channel, p.pointer, p.startsAt, p.retainUntil),
    eventAdoptedCustody(db, "event_publication", p, result, pointer),
  ]);
}
async function beforeSend(env: Env, ctx: CommunityContext, e: EventRow, nonce: string, d: Destination, remove = false): Promise<boolean> {
  if (!organizer(env, ctx) || (!remove && (!enabled(env) || !sameDestination(d, destination(env))))) return false;
  const s = ctx.subject!, staff = isSiteAdmin(env, s.discordId) ? 1 : 0;
  const active = remove ? "" : `AND publication_closed=0 AND revision=?5 AND status='scheduled' AND starts_at>${DB_NOW} AND starts_at<=created_at+${START_HORIZON_S}`;
  const proof = await env.DB.prepare(`SELECT (${fenceSql("confirmedGuildData", 2, 3, 4)}) AS ok FROM community_event_deliveries d
    WHERE event_id=?1 AND purpose='publication' AND claim_nonce=?6 AND state='claimed' AND actor=?2 AND session_version=?3 AND session_expires=?4 AND retain_until>${DB_NOW}
    AND guild_id=?8 AND channel_id=?9 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND (created_by=?2 OR ?7=1) AND retain_until>${DB_NOW} ${active})`)
    .bind(e.id, s.discordId, s.sessionVersion, s.expiresAt, e.revision, nonce, staff, d.guild, d.channel).first<{ ok: number }>();
  return proof?.ok === 1;
}

/** POST publication {eventId,revision,opId,payloadHash}; only a definite refused send can be explicitly retried. */
export async function eventDeliveryPublish(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, true); if (no) return no;
  if (!enabled(env)) return apiJson({ error: "feature_disabled" }, 503);
  const d = destination(env); if (!d) return apiJson({ error: "delivery_not_configured" }, 503);
  try {
    const body = await bodyOf(request, ["eventId", "revision", "opId", "payloadHash"]), eventId = id(body.eventId), rev = revision(body.revision), op = id(body.opId, "invalid_op_id");
    if (typeof body.payloadHash !== "string" || !/^[0-9a-f]{64}$/.test(body.payloadHash)) throw new Bad("invalid_payload_hash");
    const out = await read(env, ctx, eventId);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    if (!out) return apiJson({ error: "event_not_found" }, 404);
    const e = out.event, old = out.delivery, content = contentOf(e, d), hash = await hashOf(content);
    if (e.publication_closed !== 0) return answer(request, env, ctx, eventId, { error: "publication_closed" }, 409);
    if (e.revision !== rev) return answer(request, env, ctx, eventId, { error: "stale_revision" }, 409);
    if (e.status !== "scheduled" || e.starts_at <= now()) return answer(request, env, ctx, eventId, { error: "event_not_scheduled" }, 409);
    if (e.starts_at > e.created_at + START_HORIZON_S) return answer(request, env, ctx, eventId, { error: "event_creation_horizon" }, 409);
    if (hash !== body.payloadHash) throw new Bad("preview_changed", 409);
    if (old?.cleanup_requested === 1) return answer(request, env, ctx, eventId, { error: "removal_pending" }, 409);
    if (old && ["claimed", "unknown"].includes(old.state)) return answer(request, env, ctx, eventId, { error: "delivery_held" }, 409);
    if (old?.op_id === op && old.payload_hash !== hash) throw new Bad("op_conflict", 409);
    if (old?.state === "posted" && old.payload_hash === hash) return answer(request, env, ctx, eventId, { replay: true });
    if (old?.message_id && (old.guild_id !== d.guild || old.channel_id !== d.channel)) throw new Bad("delivery_destination_changed", 409);
    const bot = await qualifyDestination(env, d);
    if (!bot) return answer(request, env, ctx, eventId, { error: "delivery_destination_unqualified" }, 409);
    if (!(await memberPresent(env, ctx, d.guild))) return answer(request, env, ctx, eventId, { error: "membership_unconfirmed" }, 409);
    if (old?.message_id) {
      const message = await discord(env, "GET", `/channels/${d.channel}/messages/${old.message_id}`);
      if (message.status !== 200 || !ownMessage(message.value, d, bot) || message.value.id !== old.message_id) return answer(request, env, ctx, eventId, { error: "delivery_custody_unqualified" }, 409);
    }
    const s = ctx.subject!, nonce = randomToken(), staff = isSiteAdmin(env, s.discordId) ? 1 : 0;
    const custody: EventCustodyProof = { eventId, revision: e.revision, startsAt: e.starts_at, opId: op, nonce,
      guild: d.guild, channel: d.channel, pointer: old?.state === "removed" ? null : old?.message_id ?? null,
      retainUntil: Math.min(old?.retain_until ?? e.retain_until, e.retain_until) };
    const claimed = await admitted(env, ctx, [env.DB.prepare(`INSERT INTO community_event_deliveries
      (event_id,purpose,event_revision,starts_at,guild_id,channel_id,message_id,frozen_content,payload_hash,op_id,claim_nonce,state,cleanup_requested,actor,session_version,session_expires,created_at,updated_at,retain_until,result_code)
      SELECT id,'publication',revision,starts_at,?8,?9,?10,?11,?12,?13,?14,'claimed',0,?2,?3,?4,${DB_NOW},${DB_NOW},retain_until,NULL FROM community_events
      WHERE id=?1 AND publication_closed=0 AND revision=?5 AND status='scheduled' AND starts_at>${DB_NOW} AND starts_at<=created_at+${START_HORIZON_S} AND retain_until>${DB_NOW} AND (created_by=?2 OR ?7=1)
      AND title=?15 AND starts_at=?16 AND duration_min=?17 AND ${fenceSql("confirmedGuildData", 2, 3, 4)}
      ON CONFLICT(event_id,purpose) DO UPDATE SET event_revision=excluded.event_revision,starts_at=excluded.starts_at,guild_id=excluded.guild_id,channel_id=excluded.channel_id,
        message_id=excluded.message_id,frozen_content=excluded.frozen_content,payload_hash=excluded.payload_hash,op_id=excluded.op_id,claim_nonce=excluded.claim_nonce,state='claimed',
        actor=excluded.actor,session_version=excluded.session_version,session_expires=excluded.session_expires,updated_at=excluded.updated_at,retain_until=MIN(community_event_deliveries.retain_until,excluded.retain_until),result_code=NULL
      WHERE community_event_deliveries.claim_nonce=?6 AND community_event_deliveries.state IN('posted','refused','removed') AND community_event_deliveries.cleanup_requested=0`)
      .bind(eventId, s.discordId, s.sessionVersion, s.expiresAt, rev, old?.claim_nonce ?? "", staff, d.guild, d.channel, old?.state === "removed" ? null : old?.message_id ?? null, content, hash, op, nonce, e.title, e.starts_at, e.duration_min)]);
    if (claimed === FENCE_REFUSED) return answer(request, env, ctx, eventId, { error: "delivery_not_claimed" }, 409);
    if (!(await beforeSend(env, ctx, e, nonce, d))) {
      await settle(env, ctx, custody, "refused", "admission_changed");
      return answer(request, env, ctx, eventId, { error: "delivery_not_sent" }, 409);
    }
    let result: "posted" | "refused" | "unknown" = "unknown", code = "outcome_unknown", pointer: string | null = null;
    try {
      const target = old?.state === "removed" ? null : old?.message_id ?? null;
      const response = await discord(env, target ? "PATCH" : "POST", `/channels/${d.channel}/messages${target ? `/${target}` : ""}`,
        { content, allowed_mentions: { parse: [] }, attachments: [], ...(target ? {} : { nonce, enforce_nonce: true }) });
      if (knownRefusal(response.status)) { result = "refused"; code = "discord_refused"; }
      else if (response.status >= 200 && response.status < 300 && ownMessage(response.value, d, bot)) {
        if (!target || response.value.id === target) pointer = response.value.id;
        if (pointer && exactContent(response.value, content)) { result = "posted"; code = "published"; }
      }
    } catch { /* transport/abort/redirect/unreadable outcome stays held; no retry */ }
    await settle(env, ctx, custody, result, code, pointer);
    return answer(request, env, ctx, eventId, {}, result === "unknown" ? 409 : 200, true);
  } catch (e) { return bad(e) ?? Promise.reject(e); }
}

/** Reconciliation accepts only an exact known pointer, or the unknown create's stored nonce AND exact frozen content. */
export async function eventDeliveryReconcile(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, true); if (no) return no;
  try {
    const body = await bodyOf(request, ["eventId", "opId", "messageId"]), eventId = id(body.eventId), op = id(body.opId, "invalid_op_id");
    if (typeof body.messageId !== "string" || !SNOWFLAKE.test(body.messageId)) throw new Bad("invalid_message_id");
    const out = await read(env, ctx, eventId);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    if (!out) return apiJson({ error: "event_not_found" }, 404);
    const row = out.delivery;
    if (!row || row.op_id !== op || !["claimed", "unknown"].includes(row.state)) return answer(request, env, ctx, eventId, { error: "delivery_not_held" }, 409);
    if (row.message_id && row.message_id !== body.messageId) throw new Bad("delivery_custody_unqualified", 409);
    const d = { guild: row.guild_id, channel: row.channel_id, host: (env.SITE_HOST ?? "").toLowerCase() };
    if (env.SITE_GUILD_ID !== d.guild) throw new Bad("delivery_destination_changed", 409);
    const bot = await qualifyDestination(env, d); if (!bot) throw new Bad("delivery_destination_unqualified", 409);
    if (!(await memberPresent(env, ctx, d.guild))) throw new Bad("membership_unconfirmed", 409);
    const response = await discord(env, "GET", `/channels/${d.channel}/messages/${body.messageId}`);
    if (response.status !== 200 || !ownMessage(response.value, d, bot) || response.value.id !== body.messageId || !exactContent(response.value, row.frozen_content)
      || (!row.message_id && response.value.nonce !== row.claim_nonce)) throw new Bad("delivery_custody_unqualified", 409);
    const custody: EventCustodyProof = { eventId, revision: row.event_revision, startsAt: row.starts_at, opId: row.op_id,
      nonce: row.claim_nonce, guild: row.guild_id, channel: row.channel_id, pointer: row.message_id, retainUntil: row.retain_until };
    await settle(env, ctx, custody, "posted", "reconciled", body.messageId);
    return answer(request, env, ctx, eventId, {}, 200, true);
  } catch (e) { return bad(e) ?? Promise.reject(e); }
}

/** Explicit removal remains available with publication OFF. It never guesses a pointer or deletes a non-bot message. */
export async function eventDeliveryRemove(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  const no = await gate(request, env, ctx, true); if (no) return no;
  try {
    const body = await bodyOf(request, ["eventId", "opId"]), eventId = id(body.eventId), op = id(body.opId, "invalid_op_id");
    const out = await read(env, ctx, eventId);
    if (out === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
    if (!out) return apiJson({ error: "event_not_found" }, 404);
    const row = out.delivery;
    if (!row || row.state === "removed") return answer(request, env, ctx, eventId, { replay: true });
    if (!row.message_id) return answer(request, env, ctx, eventId, { error: "delivery_held" }, 409);
    const d = { guild: row.guild_id, channel: row.channel_id, host: (env.SITE_HOST ?? "").toLowerCase() };
    if (env.SITE_GUILD_ID !== d.guild) throw new Bad("delivery_destination_changed", 409);
    const bot = await qualifyDestination(env, d); if (!bot) throw new Bad("delivery_destination_unqualified", 409);
    if (!(await memberPresent(env, ctx, d.guild))) throw new Bad("membership_unconfirmed", 409);
    const message = await discord(env, "GET", `/channels/${d.channel}/messages/${row.message_id}`);
    if (message.status !== 404 && (message.status !== 200 || !ownMessage(message.value, d, bot) || message.value.id !== row.message_id)) throw new Bad("delivery_custody_unqualified", 409);
    const s = ctx.subject!, nonce = randomToken(), staff = isSiteAdmin(env, s.discordId) ? 1 : 0;
    const custody: EventCustodyProof = { eventId, revision: row.event_revision, startsAt: row.starts_at, opId: op,
      nonce, guild: row.guild_id, channel: row.channel_id, pointer: row.message_id, retainUntil: row.retain_until };
    const claim = await admitted(env, ctx, [env.DB.prepare(`UPDATE community_event_deliveries SET state='claimed',cleanup_requested=1,claim_nonce=?5,op_id=?6,actor=?2,session_version=?3,session_expires=?4,updated_at=${DB_NOW}
      WHERE event_id=?1 AND purpose='publication' AND claim_nonce=?7 AND message_id=?8 AND state IN('posted','refused','unknown') AND retain_until>${DB_NOW}
      AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND (created_by=?2 OR ?9=1) AND retain_until>${DB_NOW}) AND ${fenceSql("confirmedGuildData", 2, 3, 4)}`)
      .bind(eventId, s.discordId, s.sessionVersion, s.expiresAt, nonce, op, row.claim_nonce, row.message_id, staff)]);
    if (claim === FENCE_REFUSED) return answer(request, env, ctx, eventId, { error: "delivery_not_claimed" }, 409);
    if (!(await beforeSend(env, ctx, out.event, nonce, d, true))) {
      await settle(env, ctx, custody, "unknown", "admission_changed", row.message_id);
      return answer(request, env, ctx, eventId, { error: "delivery_not_sent" }, 409);
    }
    let result: "removed" | "unknown" = message.status === 404 ? "removed" : "unknown";
    if (message.status !== 404) { try { const response = await discord(env, "DELETE", `/channels/${d.channel}/messages/${row.message_id}`); if (response.status === 204 || response.status === 404) result = "removed"; } catch { /* unknown removal stays held */ } }
    await settle(env, ctx, custody, result, result === "removed" ? "removed" : "outcome_unknown", row.message_id);
    return answer(request, env, ctx, eventId, {}, result === "unknown" ? 409 : 200, true);
  } catch (e) { return bad(e) ?? Promise.reject(e); }
}

/** Calendar update/cancel hooks execute in the parent's admitted transaction, after its nonce-bearing first write. */
export function eventDeliveryChanged(env: Env, eventId: string, eventNonce: string, cancelled = false): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_event_deliveries SET retain_until=MIN(retain_until,(SELECT retain_until FROM community_events WHERE id=?1)),
    state=CASE WHEN state='claimed' THEN 'unknown' ELSE state END, cleanup_requested=CASE WHEN ?3=1 THEN 1 ELSE cleanup_requested END,updated_at=${DB_NOW}
    WHERE event_id=?1 AND EXISTS(SELECT 1 FROM community_events WHERE id=?1 AND nonce=?2)`).bind(eventId, eventNonce, cancelled ? 1 : 0);
}
/** Erasure removes the only copied event text and actor evidence, preserving only finite known/unknown deletion custody. */
export function eventDeliveryOwnerErase(env: Env, owner: string): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_event_deliveries SET frozen_content=NULL,payload_hash=NULL,actor=NULL,session_version=NULL,session_expires=NULL,
    cleanup_requested=1,state=CASE WHEN state='claimed' THEN 'unknown' ELSE state END,updated_at=${DB_NOW}
    WHERE event_id IN(SELECT id FROM community_events WHERE created_by=?1)`).bind(owner);
}
/** Expiry disposes local metadata at the parent's deadline. RETURNING counts unresolved external custody, never claims provider deletion. */
const EXPIRED_DELIVERIES = "event_id IN(SELECT event_id FROM community_event_deliveries WHERE retain_until<=?1 ORDER BY retain_until,event_id LIMIT ?2) OR event_id IN(SELECT id FROM community_events WHERE retain_until<=?1 ORDER BY retain_until,id LIMIT ?2)";
/** Runs before local disposal in the same transaction; a finite parent flag prevents later duplicate creation. */
export function eventDeliveryCloseExpired(env: Env, at: number, limit: number): D1PreparedStatement {
  return env.DB.prepare(`UPDATE community_events SET publication_closed=1 WHERE publication_closed=0 AND id IN(SELECT event_id FROM community_event_deliveries
    WHERE (${EXPIRED_DELIVERIES}) AND (message_id IS NOT NULL OR state IN('claimed','unknown')))` ).bind(at, limit);
}
export function eventDeliveryExpiry(env: Env, at: number, limit: number): D1PreparedStatement {
  return env.DB.prepare(`DELETE FROM community_event_deliveries WHERE ${EXPIRED_DELIVERIES}
    RETURNING CASE WHEN message_id IS NOT NULL OR state IN('claimed','unknown') THEN 1 ELSE 0 END AS incomplete`).bind(at, limit);
}

registerCommunityData("event_delivery", (env, who) => [env.DB.prepare(`UPDATE community_event_deliveries SET actor=NULL,session_version=NULL,session_expires=NULL,frozen_content=NULL,payload_hash=NULL,
  cleanup_requested=1,state=CASE WHEN state='claimed' THEN 'unknown' ELSE state END,updated_at=${DB_NOW} WHERE actor=?1`).bind(who)],
  (env, who) => ({ statements: [env.DB.prepare("SELECT event_id,purpose,event_revision,state,cleanup_requested,created_at,updated_at,retain_until,result_code FROM community_event_deliveries WHERE actor=?1 ORDER BY event_id").bind(who)],
    shape: ([rows]) => ({ publications: (rows!.results as Record<string, unknown>[]).map((r) => ({ eventId: r.event_id, purpose: r.purpose, revision: r.event_revision, state: r.state,
      removalPending: r.cleanup_requested === 1, createdAt: secondsToIso(r.created_at as number), updatedAt: secondsToIso(r.updated_at as number), retainUntil: secondsToIso(r.retain_until as number), result: safeResult(r.result_code) })) }) }));

/** Explicit Town Crier webhook delivery. Existing443 tables only; no automatic sends or retries.
 * site_settings holds immutable descriptors, never a token or a copied notice body.
 * privacy_provider_messages is the sole outcome/debt ledger, including unknown sends.
 */
import type { Env } from './env';
import { API, credentialFetch } from './discord';
import { apiJson, PAGE_VERSION, rateLimited, sameOrigin, sign, verify, type SiteUser } from './site-core';
import { admitted, admittedRead, captureCommunitySubject, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, registerCommunityData, type CommunityContext, type ExportPlan } from './community-context';
import { capturePublishedOfficeAuthority, publishedOfficeAuthorityCondition, type PublishedOfficeAuthority } from './site-appointed-identities';
import { PRIVACY_REPLAY, privacyGenerationExpressionFenceSql, privacyProviderCustodyDatabase } from './privacy-serving-authority';
import { isPrivacyWriteAdmissionDatabase } from './privacy-write-admission';
import { secondsToIso } from './community-time';

export const NEWS_WEBHOOK_PREFIX = 'news_webhook_v1:';
const PURPOSE = 'town-crier-webhook-confirmation-v1';
const ID = /^\d{17,20}$/, NOTICE = /^[A-Za-z0-9_-]{22}$/, HEX = /^[0-9a-f]{64}$/;
const snowflake = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const ON = "(SELECT value FROM site_settings WHERE key='newsOn') IN('1','true')";
const CURRENT = privacyGenerationExpressionFenceSql("json_extract(x.value,'$.id')", "json_extract(x.value,'$.g')");
const keyOf = (id: string) => 'newsWebhook:' + id;
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const int = (v: unknown, min = 1): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const revision = (v: string | null) => v && /^[1-9]\d{0,14}$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
const rows = <T>(r: D1Result | undefined) => (r?.results ?? []) as T[];
type Notice = { id: string; revision: number; title: string; body: string; created_at: number; retain_until: number; db_now: number; news_on?: number };
type Destination = Readonly<{ guild: string; channel: string; webhook: string; token: string; configHash: string; credentialPin: string; raw: readonly (string | undefined)[] }>;
type Proof = { v: 1; id: string; revision: number; payloadHash: string; configHash: string; credentialPin: string; actor: string; birth: string; generation: string | null; session: number; sessionExpires: number; issuedAt: number; expiresAt: number; noticeUntil: number; nonce: string };
export type NewsWebhookMetadata = { v: 1; id: string; revision: number; operation: string; payloadHash: string; configHash: string; credentialPin: string; guild: string; channel: string; webhook: string; actor: string | null; birth: string | null; generation: string | null; createdAt: number; noticeUntil: number; retainUntil: number };
type Stored = { metadata: string | null; operation_id: string | null; purpose: string | null; channel_id: string | null; created_at: number | null; retain_until: number | null; state: string | null; cleanup_requested: number | null; message_id: string | null; notice_current: number };
export type NewsWebhookCustodyRow = { operation_id: string; purpose: string; channel_id: string; message_id: string; state: string; subjects: string; created_at: number; retain_until: number; webhook_metadata: string | null };

/** The fixed normal text/announcement destination is operator configuration, never client input. */
async function destination(env: Env): Promise<Destination | null> {
  const raw = [env.TOWN_CRIER_WEBHOOK, env.TOWN_CRIER_WEBHOOK_TOKEN, env.GUILD_ID, env.SITE_GUILD_ID, env.COOKIE_SECRET, env.TOWN_CRIER_WEBHOOK_ENABLED, env.PRIVACY_ERASURE_ENABLED, env.DISCORD_BOT_TOKEN] as const;
  if (!raw[0] || !raw[1]) return null;
  let c: unknown; try { c = JSON.parse(raw[0]); } catch { return null; }
  if (!exact(c, ['guild', 'channel', 'webhook']) || !snowflake(c.guild) || !snowflake(c.channel) || !snowflake(c.webhook)
    || c.guild !== env.GUILD_ID || c.guild !== env.SITE_GUILD_ID || !/^[A-Za-z0-9._-]{40,200}$/.test(raw[1])) return null;
  const configHash = await sha(JSON.stringify(['town-crier-destination-v1', c.guild, c.channel, c.webhook]));
  const credentialPin = await sign(env.COOKIE_SECRET, 'town-crier-webhook-credential-v1', JSON.stringify([configHash, raw[1]]));
  return Object.freeze({ guild: c.guild as string, channel: c.channel as string, webhook: c.webhook as string, token: raw[1], configHash, credentialPin, raw });
}
function configCurrent(env: Env, d: Destination): void {
  if ([env.TOWN_CRIER_WEBHOOK, env.TOWN_CRIER_WEBHOOK_TOKEN, env.GUILD_ID, env.SITE_GUILD_ID, env.COOKIE_SECRET, env.TOWN_CRIER_WEBHOOK_ENABLED, env.PRIVACY_ERASURE_ENABLED, env.DISCORD_BOT_TOKEN].some((v, i) => v !== d.raw[i])) throw Error('news_webhook_configuration_changed');
}
export function newsWebhookOperationNotice(operation: string): string | null {
  const m = /^news_webhook_v1:([A-Za-z0-9_-]{22}):[0-9a-f]{42}$/.exec(operation); return m?.[1] ?? null;
}
export function parseNewsWebhookMetadata(text: unknown): NewsWebhookMetadata | null {
  if (typeof text !== 'string' || text.length > 2500) return null;
  let x: unknown; try { x = JSON.parse(text); } catch { return null; }
  if (!exact(x, ['v', 'id', 'revision', 'operation', 'payloadHash', 'configHash', 'credentialPin', 'guild', 'channel', 'webhook', 'actor', 'birth', 'generation', 'createdAt', 'noticeUntil', 'retainUntil'])
    || x.v !== 1 || typeof x.id !== 'string' || !NOTICE.test(x.id) || typeof x.operation !== 'string' || newsWebhookOperationNotice(x.operation) !== x.id
    || !int(x.revision) || !HEX.test(String(x.payloadHash)) || !HEX.test(String(x.configHash)) || typeof x.credentialPin !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(x.credentialPin)
    || !snowflake(x.guild) || !snowflake(x.channel) || !snowflake(x.webhook) || x.actor !== null && !snowflake(x.actor)
    || x.birth !== null && !/^[0-9a-f]{32}$/.test(String(x.birth)) || x.generation !== null && !/^[0-9a-f]{32}$/.test(String(x.generation))
    || (x.actor === null) !== (x.birth === null) || !int(x.createdAt) || !int(x.noticeUntil) || !int(x.retainUntil) || x.retainUntil !== x.createdAt + PRIVACY_REPLAY) return null;
  return x as NewsWebhookMetadata;
}
/** Text stays plain inside one fixed embed. No mentions, components, files or client-supplied URL. */
export function newsWebhookPayload(notice: Pick<Notice, 'title' | 'body'>) {
  if (typeof notice.title !== 'string' || typeof notice.body !== 'string' || !notice.title.length || Array.from(notice.title).length > 80 || !notice.body.length || Array.from(notice.body).length > 2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notice.title + notice.body)) throw Error('news_webhook_notice_invalid');
  return { embeds: [{ title: notice.title, description: notice.body }], allowed_mentions: { parse: [] as string[] } };
}
const payloadHash = async (n: Notice) => sha(JSON.stringify(newsWebhookPayload(n)));
const encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function proofToken(env: Env, p: Proof) { const data = JSON.stringify(p); return encode(data) + '.' + await sign(env.COOKIE_SECRET, PURPOSE, data); }
async function parseProof(env: Env, value: unknown): Promise<Proof | null> {
  if (typeof value !== 'string' || value.length > 2500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const [b, mac] = value.split('.'), data = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0)));
    if (encode(data) !== b || !await verify(env.COOKIE_SECRET, PURPOSE, data, mac)) return null;
    const p = JSON.parse(data) as Proof;
    if (!exact(p, ['v', 'id', 'revision', 'payloadHash', 'configHash', 'credentialPin', 'actor', 'birth', 'generation', 'session', 'sessionExpires', 'issuedAt', 'expiresAt', 'noticeUntil', 'nonce']) || p.v !== 1 || !NOTICE.test(p.id)
      || !int(p.revision) || !HEX.test(p.payloadHash) || !HEX.test(p.configHash) || !/^[A-Za-z0-9_-]{43}$/.test(p.credentialPin) || !ID.test(p.actor) || !/^[0-9a-f]{32}$/.test(p.birth)
      || p.generation !== null && !/^[0-9a-f]{32}$/.test(p.generation) || !int(p.session) || !int(p.sessionExpires) || !int(p.issuedAt) || !int(p.expiresAt) || !int(p.noticeUntil)
      || p.expiresAt > p.issuedAt + 600 || p.expiresAt > p.noticeUntil || p.expiresAt > p.sessionExpires || p.expiresAt <= p.issuedAt || !/^[A-Za-z0-9_-]{22}$/.test(p.nonce)) return null;
    return p;
  } catch { return null; }
}
type Editor = { ctx: CommunityContext; authority?: PublishedOfficeAuthority; check: () => void };
async function editor(env: Env, request: Request, user: SiteUser): Promise<Editor | null> {
  const ctx = await communityContext(env, request);
  if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.applicantWrite || ctx.facts.banned) return null;
  const capture = captureCommunitySubject(ctx.subject), original = ctx.subject, admins = env.SITE_ADMINS;
  const check = () => { capture.check(); if (ctx.subject !== original || env.SITE_ADMINS !== admins) throw Error('news_webhook_original_actor_changed'); };
  const authority = ctx.capabilities.communityStaff ? undefined : await capturePublishedOfficeAuthority(env, original.discordId, ['office_50']); check();
  if (!ctx.capabilities.communityStaff && !authority) return null;
  return { ctx, authority: authority ?? undefined, check };
}
function condition(e: Editor, first: number) { return e.authority ? publishedOfficeAuthorityCondition(e.authority, first) : { sql: '1', values: [] as readonly string[] }; }
async function read(env: Env, e: Editor, plans: D1PreparedStatement[]) {
  e.check(); const c = condition(e, 1);
  const result = await admittedRead(env, e.ctx, 'applicantWrite', [env.DB.prepare(`SELECT (${c.sql}) AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?${c.values.length + 1} AND banned=1) AS ok`).bind(...c.values, e.ctx.subject!.discordId), ...plans]); e.check();
  return result === FENCE_REFUSED || rows<{ ok: number }>(result[0])[0]?.ok !== 1 ? FENCE_REFUSED : result.slice(1);
}
const stateRead = (env: Env, id: string) => env.DB.prepare(`SELECT s.value AS metadata,m.operation_id,m.purpose,m.channel_id,m.created_at,m.retain_until,m.state,m.cleanup_requested,m.message_id,EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=?2 AND n.revision=json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.revision') AND n.retain_until>${DB_NOW}) AS notice_current FROM site_settings s LEFT JOIN privacy_provider_messages m ON m.operation_id=json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.operation') WHERE s.key=?1`).bind(keyOf(id), id);
const safeState = (s: Stored | undefined) => ({ state: s?.state ?? 'not_published', removalPending: s?.cleanup_requested === 1, uncertain: s?.state === 'claimed' || s?.state === 'unknown' || s?.state === 'cleaning' });
function retainedDescriptor(env: Env, id: string, s: Stored | undefined): NewsWebhookMetadata | null {
  const m = parseNewsWebhookMetadata(s?.metadata);
  return m && m.id === id && m.guild === env.GUILD_ID && m.guild === env.SITE_GUILD_ID && s?.operation_id === m.operation && s.purpose === 'notice' && s.channel_id === m.channel
    && s.created_at === m.createdAt && s.retain_until === m.retainUntil && ['claimed', 'unknown', 'known', 'cleaning', 'removed', 'refused'].includes(s.state ?? '') ? m : null;
}
export const NEWS_WEBHOOK_RETAINED_PAGE_LIMIT = 50;
/** One bounded metadata page plus the existing admitted authority read. Each
 * page authenticates again; the last inspected notice ID conveys no authority.
 * The inner LIMIT bounds custody joins to 51 slots, including terminal/invalid
 * descriptors. Advancing over every inspected slot prevents those slots from
 * hiding later original operations. No notice body or provider call is needed.
 */
async function retainedPage(request: Request, env: Env, e: Editor): Promise<Response> {
  if (request.method !== 'GET') return apiJson({ error: 'not_found' }, 404);
  const url = new URL(request.url), after = url.searchParams.get('after');
  if ([...url.searchParams.keys()].some(k => k !== 'after') || url.searchParams.getAll('after').length > 1
    || after !== null && !NOTICE.test(after)) return apiJson({ error: 'invalid_request' }, 400);
  const guild = env.GUILD_ID, siteGuild = env.SITE_GUILD_ID;
  const out = await read(env, e, [env.DB.prepare(`SELECT s.key AS settings_key,s.value AS metadata,m.operation_id,m.purpose,m.channel_id,m.created_at,m.retain_until,m.state,m.cleanup_requested,m.message_id,0 AS notice_current
    FROM (SELECT key,CASE WHEN length(value)<=2500 THEN value ELSE NULL END AS value FROM site_settings
      WHERE key>?1 AND key<'newsWebhook;' AND length(key)=34 AND substr(key,13) NOT GLOB '*[^A-Za-z0-9_-]*'
      ORDER BY key LIMIT ${NEWS_WEBHOOK_RETAINED_PAGE_LIMIT + 1}) s
    LEFT JOIN privacy_provider_messages m ON m.operation_id=json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.operation')
    ORDER BY s.key`).bind(after === null ? 'newsWebhook:' : keyOf(after))]);
  if (out === FENCE_REFUSED) return forbidden();
  e.check(); if (env.GUILD_ID !== guild || env.SITE_GUILD_ID !== siteGuild) return forbidden();
  const found = rows<Stored & { settings_key: string }>(out[0]), page = found.slice(0, NEWS_WEBHOOK_RETAINED_PAGE_LIMIT);
  const records: { id: string; cleanupRevision: number; cleanupDestination: { guild: string; channel: string }; state: string; removalPending: boolean; uncertain: boolean }[] = [];
  let invalidCount = 0;
  for (const row of page) {
    const id = row.settings_key.slice('newsWebhook:'.length), m = retainedDescriptor(env, id, row);
    if (!m) { invalidCount++; continue; }
    if (row.state === 'removed' || row.state === 'refused') continue;
    records.push({ id, cleanupRevision: m.revision, cleanupDestination: { guild: m.guild, channel: m.channel }, ...safeState(row) });
  }
  const truncated = found.length > page.length, nextCursor = truncated ? page[page.length - 1].settings_key.slice('newsWebhook:'.length) : null;
  return apiJson({ records, returnedCount: records.length, inspectedCount: page.length, invalidCount, limit: NEWS_WEBHOOK_RETAINED_PAGE_LIMIT,
    nextCursor, truncated, exhausted: !truncated, complete: !truncated && invalidCount === 0, readOnly: true,
    scope: 'One page of original retained cross-post custody. Terminal records are omitted; unavailable descriptors require attended review. Earlier-page omissions and concurrent changes are not a complete-history claim.' });
}
const forbidden = () => apiJson({ error: 'news_editor_forbidden' }, 403);
const conflict = (error = 'news_webhook_held') => apiJson({ error, message: 'No new Discord send was authorized. Inspect the current notice and delivery state.' }, 409);
async function jsonResponse(response: Response): Promise<unknown> {
  if (!response.body) throw Error('news_webhook_response_empty');
  const reader = response.body.getReader(); let total = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const r = await reader.read(); if (r.done) break; total += r.value.byteLength; if (total > 32768) throw Error('news_webhook_response_large'); chunks.push(r.value); } }
  catch (e) { await reader.cancel().catch(() => {}); throw e; }
  const bytes = new Uint8Array(total); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
}
const webhookUrl = (d: Destination) => `${API}/webhooks/${d.webhook}/${d.token}`;
async function qualifyWebhook(env: Env, d: Destination, check: () => void, forSend: boolean): Promise<void> {
  check(); configCurrent(env, d); const response = await credentialFetch(webhookUrl(d), { method: 'GET' }); check(); configCurrent(env, d);
  if (response.status !== 200) throw Error('news_webhook_destination_unconfirmed');
  const raw = await jsonResponse(response) as Record<string, unknown>; check(); configCurrent(env, d);
  if (raw.id !== d.webhook || raw.type !== 1 || raw.guild_id !== d.guild || raw.channel_id !== d.channel) throw Error('news_webhook_destination_mismatch');
  if (forSend) {
    const channelResponse = await credentialFetch(`${API}/channels/${d.channel}`, { method: 'GET', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }); check(); configCurrent(env, d);
    if (channelResponse.status !== 200) throw Error('news_webhook_channel_unconfirmed');
    const channel = await jsonResponse(channelResponse) as Record<string, unknown>; check(); configCurrent(env, d);
    if (channel.id !== d.channel || channel.guild_id !== d.guild || channel.type !== 0 && channel.type !== 5) throw Error('news_webhook_channel_unsupported');
  }
}
function sameProof(p: Proof, e: Editor, d: Destination) {
  const s = e.ctx.subject!; return p.actor === s.discordId && p.birth === s.accountIncarnation && p.generation === s.privacyGeneration && p.session === s.sessionVersion && p.sessionExpires === s.expiresAt && p.configHash === d.configHash && p.credentialPin === d.credentialPin;
}
function spendAllowed(s: Stored | undefined, rev: number): boolean {
  if (!s) return true; const m = parseNewsWebhookMetadata(s.metadata);
  return !!m && m.revision < rev && s.operation_id === m.operation && (s.state === 'removed' || s.state === 'refused');
}

/** Root routes /api/news/editor/webhook/{retained,preview,publish,revoke,reconcile}. */
export async function handleTownCrierWebhook(request: Request, env: Env, parts: string[], user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const e = await editor(env, request, user); if (!e) return forbidden();
  const sub = parts.join('/');
  if (request.method !== 'GET' && request.method !== 'POST' || !['retained', 'preview', 'publish', 'revoke', 'reconcile'].includes(sub)) return apiJson({ error: 'not_found' }, 404);
  if (request.method === 'POST' && (!sameOrigin(request) || request.headers.get('X-Olympus') !== PAGE_VERSION)) return apiJson({ error: 'reload_or_origin' }, 403);
  if (rateLimited(`news-wh:${e.ctx.subject!.discordId}`, request.method === 'GET' ? 30 : 10, 60)) return apiJson({ error: 'slow_down' }, 429);
  if (sub === 'retained') return retainedPage(request, env, e);
  if (sub === 'revoke' || sub === 'reconcile') {
    if (request.method !== 'POST' || !exact(body, ['id', 'revision']) || typeof body.id !== 'string' || !NOTICE.test(body.id) || !int(body.revision)) return apiJson({ error: 'invalid_request' }, 400);
    return control(env, e, body.id, body.revision, sub === 'revoke');
  }
  const d = await destination(env); e.check();
  const enabled = !!d && env.TOWN_CRIER_WEBHOOK_ENABLED === 'true' && env.PRIVACY_ERASURE_ENABLED === 'true' && isPrivacyWriteAdmissionDatabase(privacyProviderCustodyDatabase(env));
  if (sub === 'preview') {
    if (request.method !== 'GET') return apiJson({ error: 'not_found' }, 404);
    const u = new URL(request.url), id = u.searchParams.get('id'), rev = revision(u.searchParams.get('revision'));
    if (!id || !NOTICE.test(id) || rev === null || [...u.searchParams.keys()].some(k => k !== 'id' && k !== 'revision') || u.searchParams.getAll('id').length !== 1 || u.searchParams.getAll('revision').length !== 1) return apiJson({ error: 'invalid_request' }, 400);
    const out = await read(env, e, [env.DB.prepare(`SELECT id,revision,title,body,created_at,retain_until,${DB_NOW} AS db_now,(${ON}) AS news_on FROM site_news_notices WHERE id=?1 AND revision=?2 AND retain_until>${DB_NOW}`).bind(id, rev), stateRead(env, id)]);
    if (out === FENCE_REFUSED) return forbidden(); const notice = rows<Notice>(out[0])[0], stored = rows<Stored>(out[1])[0], retained = retainedDescriptor(env, id, stored);
    // Read-only removal custody has its own original tuple. It remains visible
    // to a current editor while sends are OFF, after an edit, or after expiry.
    if ((!enabled || notice?.news_on !== 1) && !retained) return apiJson({ enabled: false, available: false, error: 'news_webhook_unavailable', message: 'Optional Discord cross-posting is not configured and qualified for use.' }, 409);
    if (!notice && !retained) return conflict('news_webhook_notice_changed');
    if (d) configCurrent(env, d); const hash = notice ? await payloadHash(notice) : null; e.check();
    const canPublish = enabled && !!d && !!notice && notice.news_on === 1 && spendAllowed(stored, rev), s = e.ctx.subject!;
    let confirmation: string | null = null, expiresAt: number | null = null;
    if (canPublish && d && notice && hash) {
      const p: Proof = { v: 1, id, revision: rev, payloadHash: hash, configHash: d.configHash, credentialPin: d.credentialPin, actor: s.discordId, birth: s.accountIncarnation, generation: s.privacyGeneration, session: s.sessionVersion, sessionExpires: s.expiresAt, issuedAt: notice.db_now, expiresAt: Math.min(notice.db_now + 600, notice.retain_until, s.expiresAt), noticeUntil: notice.retain_until, nonce: randomToken() };
      expiresAt = p.expiresAt; if (p.expiresAt > p.issuedAt) confirmation = await proofToken(env, p);
    }
    e.check(); if (d) configCurrent(env, d);
    const shownDestination = !canPublish && retained ? retained : d;
    return apiJson({ enabled, canPublish: !!confirmation, cleanupOnly: !canPublish, id, revision: rev, cleanupRevision: retained?.revision ?? null,
      cleanupDestination: retained ? { guild: retained.guild, channel: retained.channel } : null,
      destination: shownDestination ? { guild: shownDestination.guild, channel: shownDestination.channel } : null,
      payload: notice ? newsWebhookPayload(notice) : null, payloadHash: hash, configHash: d?.configHash ?? null, expiresAt, confirmation, ...safeState(retained ? stored : undefined) });
  }
  if (!enabled || !d) return apiJson({ enabled: false, available: false, error: 'news_webhook_unavailable', message: 'Optional Discord cross-posting is not configured and qualified for use.' }, 409);
  if (request.method !== 'POST' || !exact(body, ['confirmation', 'confirm']) || body.confirm !== true) return apiJson({ error: 'explicit_confirmation_required' }, 400);
  const p = await parseProof(env, body.confirmation); e.check(); if (!p || !sameProof(p, e, d)) return conflict('news_webhook_confirmation_invalid');
  const out = await read(env, e, [env.DB.prepare(`SELECT id,revision,title,body,created_at,retain_until,${DB_NOW} AS db_now FROM site_news_notices WHERE id=?1 AND revision=?2 AND retain_until=?3 AND retain_until>${DB_NOW} AND ${DB_NOW}>=?4 AND ${DB_NOW}<?5 AND ${ON}`).bind(p.id, p.revision, p.noticeUntil, p.issuedAt, p.expiresAt), stateRead(env, p.id)]);
  if (out === FENCE_REFUSED) return forbidden(); const n = rows<Notice>(out[0])[0], old = rows<Stored>(out[1])[0];
  if (!n || await payloadHash(n) !== p.payloadHash || !spendAllowed(old, p.revision)) return conflict('news_webhook_confirmation_spent_or_changed'); e.check();
  try { await qualifyWebhook(env, d, e.check, true); } catch { return conflict('news_webhook_destination_unconfirmed'); }
  const operation = NEWS_WEBHOOK_PREFIX + p.id + ':' + (await sha(JSON.stringify(p))).slice(0, 42); e.check(); configCurrent(env, d);
  const meta: NewsWebhookMetadata = { v: 1, id: p.id, revision: p.revision, operation, payloadHash: p.payloadHash, configHash: d.configHash, credentialPin: d.credentialPin, guild: d.guild, channel: d.channel, webhook: d.webhook, actor: p.actor, birth: p.birth, generation: p.generation, createdAt: n.db_now, noticeUntil: p.noticeUntil, retainUntil: n.db_now + PRIVACY_REPLAY };
  const metadata = JSON.stringify(meta), refs = JSON.stringify([{ id: p.actor, g: p.generation }]), c = condition(e, 12), s = e.ctx.subject!;
  // The old descriptor must be the exact original value and its old effect terminal.
  // The notice bytes, revision, deadline, original session, office and clock are rechecked after all provider reads.
  let claim: D1Result[] | typeof FENCE_REFUSED;
  try { claim = await admitted(env, e.ctx, [
    env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
      SELECT ?4,?5,${DB_NOW},?1 WHERE ${fenceSql('applicantWrite', 1, 2, 3, s.privacyGeneration, s.accountIncarnation)}
      AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AND (${c.sql}) AND ${ON}
      AND ${DB_NOW}>=?6 AND ${DB_NOW}<?7 AND EXISTS(SELECT 1 FROM site_news_notices WHERE id=?8 AND revision=?9 AND title=?10 AND body=?11 AND retain_until=${p.noticeUntil} AND retain_until>${DB_NOW})
      AND ${old ? "EXISTS(SELECT 1 FROM site_settings old JOIN privacy_provider_messages m ON m.operation_id=json_extract(old.value,'$.operation') WHERE old.key=?4 AND old.value=?" + (12 + c.values.length) + " AND m.state IN('removed','refused') AND json_extract(old.value,'$.revision')<?9)" : 'NOT EXISTS(SELECT 1 FROM site_settings WHERE key=?4)'}
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .bind(s.discordId, s.sessionVersion, s.expiresAt, keyOf(p.id), metadata, p.issuedAt, p.expiresAt, p.id, p.revision, n.title, n.body, ...c.values, ...(old ? [old.metadata] : [])),
    env.DB.prepare(`INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,state,created_at,updated_at,retain_until)
      SELECT ?1,'notice',?2,?3,'claimed',?4,?4,?4+${PRIVACY_REPLAY} WHERE changes()=1 AND EXISTS(SELECT 1 FROM site_settings WHERE key=?5 AND value=?6)
      AND NOT EXISTS(SELECT 1 FROM json_each(?2)x WHERE NOT(${CURRENT}))`).bind(operation, refs, d.channel, meta.createdAt, keyOf(p.id), metadata),
    env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM privacy_provider_messages WHERE operation_id=?1 AND state='claimed' AND subjects=?2 AND created_at=?3) THEN 1 ELSE json_extract('news_webhook_claim_unconfirmed','$') END AS ok`).bind(operation, refs, meta.createdAt),
  ]); } catch { return conflict('news_webhook_claim_unconfirmed'); }
  e.check(); if (claim === FENCE_REFUSED) return conflict('news_webhook_claim_refused'); configCurrent(env, d);
  // A claim can outlive a lost response. Never POST again for that notice revision.
  let state: 'known' | 'refused' | 'unknown' = 'unknown', pointer: string | null = null, accepted = false;
  try {
    const response = await credentialFetch(webhookUrl(d) + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newsWebhookPayload(n)) });
    if ([400, 401, 403, 404, 405, 429].includes(response.status)) state = 'refused';
    else if (response.status === 200) {
      const message = await jsonResponse(response) as Record<string, unknown>;
      if (typeof message.id === 'string' && ID.test(message.id) && message.channel_id === d.channel && message.webhook_id === d.webhook) {
        pointer = message.id; state = 'known'; const embeds = message.embeds;
        accepted = Array.isArray(embeds) && embeds.length === 1 && embeds[0]?.title === n.title && embeds[0]?.description === n.body && (message.content === '' || message.content === undefined);
      }
    }
  } catch { /* original claim is retained; no inferred refusal, retry or alternate destination */ }
  try { configCurrent(env, d); } catch { accepted = false; }
  // Late ACK adoption is operational custody, never renewed actor authority or a second send.
  const DB = privacyProviderCustodyDatabase(env);
  const saved = await DB.prepare(`UPDATE privacy_provider_messages SET state=?2,message_id=?3,updated_at=${DB_NOW},cleanup_requested=MAX(cleanup_requested,
    CASE WHEN ?9=0 OR EXISTS(SELECT 1 FROM json_each(subjects)x WHERE NOT(${CURRENT})) OR NOT EXISTS(SELECT 1 FROM site_news_notices WHERE id=?7 AND revision=?8 AND retain_until>${DB_NOW}) THEN 1 ELSE 0 END)
    WHERE operation_id=?1 AND purpose='notice' AND channel_id=?4 AND state IN('claimed','unknown') AND message_id IS NULL
    AND created_at=?5 AND retain_until=?5+${PRIVACY_REPLAY} AND (subjects=?6 OR subjects='[]' AND cleanup_requested=1)`)
    .bind(operation, state, pointer, d.channel, meta.createdAt, refs, p.id, p.revision, accepted ? 1 : 0).run();
  if (saved.meta.changes !== 1) return conflict('news_webhook_custody_unconfirmed');
  // Do not disclose any earlier payload after the original editor/session is revoked.
  const current = await read(env, e, [stateRead(env, p.id)]); if (current === FENCE_REFUSED) return forbidden();
  const currentRow = rows<Stored>(current[0])[0];
  accepted = state === 'known' && accepted && currentRow?.operation_id === operation && currentRow.cleanup_requested === 0 && currentRow.notice_current === 1;
  return apiJson({ id: p.id, revision: p.revision, state, accepted, removalPending: currentRow?.cleanup_requested === 1, uncertain: state === 'unknown', message: state === 'unknown' ? 'The Discord outcome is unknown. Do not resend; attended review is required.' : undefined }, accepted ? 200 : 409);
}

async function control(env: Env, e: Editor, id: string, rev: number, revoke: boolean): Promise<Response> {
  const c = condition(e, 4), s = e.ctx.subject!;
  const out = await read(env, e, [stateRead(env, id)]); if (out === FENCE_REFUSED) return forbidden(); const stored = rows<Stored>(out[0])[0], m = retainedDescriptor(env, id, stored);
  if (!m || m.revision !== rev) return conflict('news_webhook_not_found');
  if (revoke) {
    const write = await admitted(env, e.ctx, [env.DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE operation_id=?1 AND purpose='notice' AND state NOT IN('removed','refused')
      AND EXISTS(SELECT 1 FROM site_settings WHERE key=?2 AND value=?3) AND (${c.sql})
      AND ${fenceSql('applicantWrite', 4 + c.values.length, 5 + c.values.length, 6 + c.values.length, s.privacyGeneration, s.accountIncarnation)}
      AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?${4 + c.values.length} AND banned=1)`)
      .bind(m.operation, keyOf(id), stored.metadata, ...c.values, s.discordId, s.sessionVersion, s.expiresAt)]);
    if (write === FENCE_REFUSED && !['removed', 'refused'].includes(stored.state ?? '')) return conflict();
  }
  // Reconciliation can only inspect an existing known/cleaning pointer after requesting removal.
  // It never scans history or adopts an unknown send, nor does a second invocation repeat DELETE.
  if (stored.state === 'known' || stored.state === 'cleaning') {
    if (!revoke && stored.cleanup_requested !== 1) return apiJson({ id, revision: rev, ...safeState(stored) });
    const DB = privacyProviderCustodyDatabase(env), row = await DB.prepare(`SELECT operation_id,purpose,channel_id,message_id,state,subjects,created_at,retain_until,?2 AS webhook_metadata FROM privacy_provider_messages WHERE operation_id=?1 AND cleanup_requested=1`).bind(m.operation, stored.metadata).first<NewsWebhookCustodyRow>();
    if (row) await cleanupNewsWebhookMessage(env, row, DB);
  }
  const fresh = await read(env, e, [stateRead(env, id)]); if (fresh === FENCE_REFUSED) return forbidden();
  return apiJson({ id, revision: rev, ...safeState(rows<Stored>(fresh[0])[0]) });
}

/** Existing News edit/delete batches append this only after their exact notice nonce is stored. */
export function newsWebhookMutationPlan(env: Env, id: string, nonce: string): D1PreparedStatement {
  return env.DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE purpose='notice' AND state NOT IN('removed','refused')
    AND operation_id=(SELECT json_extract(value,'$.operation') FROM site_settings WHERE key=?1 AND json_valid(value))
    AND EXISTS(SELECT 1 FROM site_news_notices WHERE id=?2 AND nonce=?3)`).bind(keyOf(id), id, nonce);
}
/** Same page SELECT/visit as existing custody: no extra cron statement or metadata query. */
export const newsWebhookCleanupMetadataSql = `(SELECT value FROM site_settings WHERE key='newsWebhook:'||substr(m.operation_id,17,22))`;
export const newsWebhookCleanupDueSql = `(substr(m.operation_id,1,16)='${NEWS_WEBHOOK_PREFIX}' AND NOT EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=substr(m.operation_id,17,22) AND n.revision=json_extract(CASE WHEN json_valid(${newsWebhookCleanupMetadataSql}) THEN ${newsWebhookCleanupMetadataSql} ELSE '{}' END,'$.revision') AND n.retain_until>${DB_NOW}))`;

/** Called before bot-only cleanup. Fixed webhook identity and exact pointer; one DELETE or GET-only absence proof. */
export async function cleanupNewsWebhookMessage(env: Env, row: NewsWebhookCustodyRow, DB: D1Database): Promise<'removed' | 'held' | 'unchanged'> {
  const meta = parseNewsWebhookMetadata(row.webhook_metadata), id = newsWebhookOperationNotice(row.operation_id);
  if (!meta || !id || meta.id !== id || meta.operation !== row.operation_id || row.purpose !== 'notice' || meta.channel !== row.channel_id || !ID.test(row.message_id)
    || row.created_at !== meta.createdAt || row.retain_until !== meta.retainUntil || !['known', 'cleaning'].includes(row.state)) return 'held';
  const d = await destination(env); if (!d || d.configHash !== meta.configHash || d.credentialPin !== meta.credentialPin || d.webhook !== meta.webhook || d.channel !== meta.channel || d.guild !== meta.guild) return 'held';
  const check = () => configCurrent(env, d); let absent = false;
  try {
    await qualifyWebhook(env, d, check, false);
    const response = await credentialFetch(webhookUrl(d) + '/messages/' + row.message_id, { method: 'GET' }); check();
    if (response.status === 404) absent = true;
    else if (response.status === 200) { const raw = await jsonResponse(response) as Record<string, unknown>; check(); if (raw.id !== row.message_id || raw.channel_id !== row.channel_id || raw.webhook_id !== d.webhook) return 'held'; }
    else return 'held';
  } catch { return 'held'; }
  if (row.state === 'known') {
    // Exact original custody only. A naturally expired/deleted/revised notice is
    // eligible even when no Native page-visit marked cleanup_requested first.
    // Recheck that due condition atomically; never mark another editor message.
    const claim = await DB.prepare(`UPDATE privacy_provider_messages SET state='cleaning',cleanup_requested=1,updated_at=${DB_NOW} WHERE operation_id=?1 AND purpose='notice' AND state='known' AND channel_id=?2 AND message_id=?3 AND subjects=?4 AND created_at=?5 AND retain_until=?6
      AND (cleanup_requested=1 OR NOT EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=?7 AND n.revision=?8 AND n.retain_until>${DB_NOW}))`)
      .bind(row.operation_id, row.channel_id, row.message_id, row.subjects, row.created_at, row.retain_until, meta.id, meta.revision).run();
    if (claim.meta.changes !== 1) return 'unchanged';
    if (!absent) { try { check(); const response = await credentialFetch(webhookUrl(d) + '/messages/' + row.message_id, { method: 'DELETE' }); absent = response.status === 204 || response.status === 404; } catch { /* GET-only on a later invocation */ } }
  }
  if (!absent) return 'held';
  const removed = await DB.prepare(`UPDATE privacy_provider_messages SET state='removed',subjects='[]',updated_at=${DB_NOW} WHERE operation_id=?1 AND purpose='notice' AND state='cleaning' AND cleanup_requested=1 AND channel_id=?2 AND message_id=?3 AND (subjects=?4 OR subjects='[]') AND created_at=?5 AND retain_until=?6`)
    .bind(row.operation_id, row.channel_id, row.message_id, row.subjects, row.created_at, row.retain_until).run();
  return removed.meta.changes === 1 ? 'removed' : 'held';
}

/** Optional bounded metadata retention hook. Root must budget it; never invoked implicitly by News. */
export function newsWebhookMetadataExpiryPlan(env: Env, limit = 20): D1PreparedStatement {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error('news_webhook_page_invalid');
  return env.DB.prepare(`DELETE FROM site_settings WHERE key IN(SELECT s.key FROM site_settings s WHERE s.key GLOB 'newsWebhook:*' AND json_valid(s.value)
    AND json_extract(s.value,'$.retainUntil')<=${DB_NOW} AND NOT EXISTS(SELECT 1 FROM privacy_provider_messages m WHERE m.operation_id=json_extract(s.value,'$.operation') AND m.state NOT IN('removed','refused'))
    AND NOT EXISTS(SELECT 1 FROM site_news_notices n WHERE n.id=json_extract(s.value,'$.id')) ORDER BY s.key LIMIT ?1)`).bind(limit);
}
/** One admitted DELETE in the existing scheduled family; Root must observe its actual remaining budget first. */
export const NEWS_WEBHOOK_METADATA_EXPIRY_PHYSICAL_BOUND = 5;
export const newsWebhookErasePlan = (env: Env, who: string): D1PreparedStatement[] => [
  env.DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE purpose='notice' AND substr(operation_id,1,16)='${NEWS_WEBHOOK_PREFIX}' AND state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(who),
  env.DB.prepare(`UPDATE site_settings SET value=json_set(value,'$.actor',NULL,'$.birth',NULL,'$.generation',NULL),updated_by=NULL WHERE key GLOB 'newsWebhook:*' AND json_valid(value) AND json_extract(value,'$.actor')=?1`).bind(who),
];
export const NEWS_WEBHOOK_OWN_COPY_LIMIT = 1000;
const ownCopyWhere = "s.key GLOB 'newsWebhook:*' AND json_valid(s.value) AND json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.actor')=?1";
function projectNewsWebhookOwnCopy(who: string, count: unknown, found: { value: string; state: string | null; cleanup_requested: number | null }[]): Record<string, unknown> {
    if (!int(count, 0) || found.length !== Math.min(count, NEWS_WEBHOOK_OWN_COPY_LIMIT + 1)) throw Error('privacy_copy_unconfirmed');
    const deliveries = found.slice(0, NEWS_WEBHOOK_OWN_COPY_LIMIT).map(row => {
      const m = parseNewsWebhookMetadata(row.value);
      if (!m || m.actor !== who || row.state !== null && !['claimed', 'unknown', 'known', 'cleaning', 'removed', 'refused'].includes(row.state) || row.cleanup_requested !== null && row.cleanup_requested !== 0 && row.cleanup_requested !== 1) throw Error('privacy_copy_unconfirmed');
      return { noticeId: m.id, revision: m.revision, state: row.state ?? 'retained_metadata', removalPending: row.cleanup_requested === 1, createdAt: secondsToIso(m.createdAt), noticeUntil: secondsToIso(m.noticeUntil), retainUntil: secondsToIso(m.retainUntil) };
    });
    return { deliveries, count, returnedCount: deliveries.length, limit: NEWS_WEBHOOK_OWN_COPY_LIMIT, truncated: count > deliveries.length, complete: count === deliveries.length,
      scope: count > deliveries.length ? 'First retained editor-associated records only; request attended account-copy review for the remaining records. This is not complete history.' : 'Current retained editor-associated records only; this is not complete immutable publication history.' };
}
/** Original own-copy batch carries both exact count and bounded rows. No hidden truncation or refreshed cursor authority. */
export function newsWebhookCopyPlan(env: Env, who: string): ExportPlan {
  return { statements: [
    env.DB.prepare(`SELECT COUNT(*) AS n FROM site_settings s WHERE ${ownCopyWhere}`).bind(who),
    env.DB.prepare(`SELECT s.value,m.state,m.cleanup_requested FROM site_settings s LEFT JOIN privacy_provider_messages m ON m.operation_id=json_extract(CASE WHEN json_valid(s.value) THEN s.value ELSE '{}' END,'$.operation') WHERE ${ownCopyWhere} ORDER BY s.key LIMIT ${NEWS_WEBHOOK_OWN_COPY_LIMIT + 1}`).bind(who),
  ], shape: ([countResult, result]) => {
    const count = rows<{ n: number }>(countResult)[0]?.n, found = rows<{ value: string; state: string | null; cleanup_requested: number | null }>(result);
    return projectNewsWebhookOwnCopy(who, count, found);
  }, packed: {
    maxRows: NEWS_WEBHOOK_OWN_COPY_LIMIT + 2,
    selectSql: `SELECT '' AS entry,json_object('count',(SELECT COUNT(*) FROM site_settings s WHERE ${ownCopyWhere})) AS value
      UNION ALL SELECT q.key AS entry,json_object('value',CASE WHEN length(q.value)<=2500 THEN q.value ELSE json_extract('privacy_copy_unconfirmed','$') END,'state',m.state,'cleanup_requested',m.cleanup_requested) AS value
      FROM (SELECT s.key,s.value FROM site_settings s WHERE ${ownCopyWhere} ORDER BY s.key LIMIT ${NEWS_WEBHOOK_OWN_COPY_LIMIT + 1}) q
      LEFT JOIN privacy_provider_messages m ON m.operation_id=json_extract(CASE WHEN json_valid(q.value) THEN q.value ELSE '{}' END,'$.operation')`,
    shape: records => {
      if (!records.length || records[0]!.entry !== '' || !exact(records[0]!.value, ['count'])) throw Error('privacy_copy_unconfirmed');
      const found = records.slice(1).map(row => {
        if (!row.entry || !exact(row.value, ['value', 'state', 'cleanup_requested'])) throw Error('privacy_copy_unconfirmed');
        return row.value as {value: string; state: string | null; cleanup_requested: number | null};
      });
      return projectNewsWebhookOwnCopy(who, records[0]!.value.count, found);
    },
  } };
}
registerCommunityData('news_webhook', newsWebhookErasePlan, newsWebhookCopyPlan);

/** Owner-attended additional-gold recognition. No module-level I/O, automatic
 * grant, schema change, public balance or authority from a cosmetic title.
 * Physical Discord effects stay in the central role-settlements writer. */
import type { Env } from './env';
import { now } from './db';
import { apiJson, b64u, isSiteAdmin, PAGE_VERSION, rateLimited, sameOrigin, sign, verify, type SiteUser } from './site-core';
import { admittedRead, captureCommunitySubject, communityContext, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, type CommunityContext } from './community-context';
import { contributionRetentionDays, contributionsWritable, contributionScope, mailReference } from './community-contributions';
import { privacyGenerationLiteralFenceSql } from './privacy-serving-authority';
import { BETA_RESET_ROLE_IDS } from './beta-reset-policy';
import { parseNativeRoleMap } from './native-rank-adapter';

export const TREASURY_PURPOSE = 'treasury_cosmetic';
export const TREASURY_EXTRA_PREFIX = 'treasury-extra-v1:';
export const TREASURY_WINDOW_SECONDS = 90 * 86400;
const ROLE_KEYS = ['tithePayer', 'patron', 'benefactor'] as const;
type RoleKey = typeof ROLE_KEYS[number];
export const TREASURY_TIERS: readonly Readonly<{ key: RoleKey; label: string; copper: number }>[] = Object.freeze([{ key: 'tithePayer', label: 'Tithe Payer', copper: 250000 }, { key: 'patron', label: 'Patron of the Treasury', copper: 1000000 }, { key: 'benefactor', label: 'Benefactor of Olympus', copper: 5000000 }].map(t => Object.freeze(t as { key: RoleKey; label: string; copper: number })));
export type TreasuryConfig = Readonly<{ raw: string; guildId: string; applicationId: string; seasonStartsAt: number; roles: Readonly<Record<RoleKey, string>> }>;
type TreasuryEnv = Env & { TREASURY_COSMETIC_ROLES?: string; TREASURY_COSMETIC_ENABLED?: string };
const ID = /^[1-9][0-9]{16,19}$/, HEX = /^[0-9a-f]{32}$/;
const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && BigInt(v) <= 18446744073709551615n;
const literal = (v: string | number | null) => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;
class TreasuryHeld extends Error { constructor(readonly code: string, readonly status = 409) { super(code); } }
const fail = (code: string, status = 409): never => { throw new TreasuryHeld(code, status); };
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(',') === expected.sort().join(',');
export function parseTreasuryConfig(raw: unknown, guild: string, app: string, reserved: readonly string[]): TreasuryConfig {
  if (typeof raw !== 'string' || raw.length > 1024 || !id(guild) || !id(app)) return fail('treasury_unconfigured', 503);
  let v: Record<string, unknown>; try { v = JSON.parse(raw); } catch { return fail('treasury_configuration', 503); }
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).join(',') !== 'version,guildId,applicationId,seasonStartsAt,roles' || v.version !== 1 || v.guildId !== guild || v.applicationId !== app || !Number.isSafeInteger(v.seasonStartsAt) || (v.seasonStartsAt as number) < 1 || !v.roles || typeof v.roles !== 'object' || Array.isArray(v.roles)) return fail('treasury_configuration', 503);
  const roles = v.roles as Record<RoleKey, string>;
  if (Object.keys(roles).join(',') !== ROLE_KEYS.join(',') || JSON.stringify(v) !== raw || !ROLE_KEYS.every(k => id(roles[k])) || new Set(Object.values(roles)).size !== 3 || Object.values(roles).some(r => [guild, app, ...reserved].includes(r))) return fail('treasury_configuration', 503);
  return Object.freeze({ raw, guildId: guild, applicationId: app, seasonStartsAt: v.seasonStartsAt as number, roles: Object.freeze({ ...roles }) });
}
const ENV_KEYS = ['DB', 'COOKIE_SECRET', 'VERIFY_SECRET', 'GUILD_ID', 'SITE_GUILD_ID', 'DISCORD_APP_ID', 'DISCORD_BOT_TOKEN', 'SITE_ADMINS', 'TREASURY_COSMETIC_ROLES', 'TREASURY_COSMETIC_ENABLED', 'ROLE_GUILD_MEMBER', 'MEMBERSHIP_RETIRED_ROLE_ID', 'ROLE_OFFICER', 'ROLE_MODERATOR', 'ROLE_GUILD_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_RAID_LEADER', 'LINK_ROLE_ID', 'BLOCKING_ROLE_IDS', 'INTROS_ROLES', 'QR_NATIVE_ROLE_MAP', 'FULL_RELEASE_ROLES', 'CONTRIBUTIONS_MODE', 'CONTRIBUTIONS_RETENTION_DAYS', 'CONTRIBUTIONS_SCOPE','PRIVACY_NATIVE_ERASURE_ENABLED','PRIVACY_ERASURE_ENABLED'] as const;
function environment(env: TreasuryEnv) {
  const proto = Object.getPrototypeOf(env), slots = ENV_KEYS.map(k => Object.getOwnPropertyDescriptor(env, k));
  if (slots.some((d, i) => !d && ENV_KEYS[i]! in env || d && !Object.hasOwn(d, 'value'))) return fail('treasury_configuration', 503);
  const check = () => { if (Object.getPrototypeOf(env) !== proto) fail('treasury_configuration_changed'); for (let i = 0; i < slots.length; i++) { const old = slots[i], live = Object.getOwnPropertyDescriptor(env, ENV_KEYS[i]!); if (!old ? !!live : !live || ['value', 'writable', 'enumerable', 'configurable', 'get', 'set'].some(k => old[k as keyof PropertyDescriptor] !== live[k as keyof PropertyDescriptor])) fail('treasury_configuration_changed'); } };
  const text = (k: typeof ENV_KEYS[number]): string | undefined => { const value = slots[ENV_KEYS.indexOf(k)]?.value; if (value !== undefined && typeof value !== 'string') return fail('treasury_configuration', 503); return value; };
  const reserved: string[] = [...BETA_RESET_ROLE_IDS];
  for (const k of ['ROLE_GUILD_MEMBER', 'MEMBERSHIP_RETIRED_ROLE_ID', 'ROLE_OFFICER', 'ROLE_MODERATOR', 'ROLE_GUILD_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_RAID_LEADER', 'LINK_ROLE_ID'] as const) { const value = text(k); if (value) { if (!id(value)) fail('treasury_configuration', 503); reserved.push(value); } }
  for (const k of ['BLOCKING_ROLE_IDS', 'INTROS_ROLES'] as const) for (const value of (text(k) ?? '').split(',').map(s => s.trim()).filter(Boolean)) { if (!id(value)) fail('treasury_configuration', 503); reserved.push(value); }
  const native = text('QR_NATIVE_ROLE_MAP'); if (native) try { reserved.push(...parseNativeRoleMap(native).roles); } catch { return fail('treasury_configuration', 503); }
  const full = text('FULL_RELEASE_ROLES'); if (full) { let f: Record<string, unknown>; try { f = JSON.parse(full); } catch { return fail('treasury_configuration', 503); } if (!f || !id(f.membership) || !Array.isArray(f.native) || f.native.length !== 10 || !f.native.every(id)) return fail('treasury_configuration', 503); reserved.push(f.membership, ...f.native); }
  check(); if (env.SITE_GUILD_ID !== env.GUILD_ID || !env.COOKIE_SECRET || !env.DISCORD_BOT_TOKEN) return fail('treasury_configuration', 503);
  return { check, config: parseTreasuryConfig(text('TREASURY_COSMETIC_ROLES'), env.GUILD_ID, env.DISCORD_APP_ID, reserved) };
}
type Target = { id: string; birth: string; generation: string | null; revision: number | null };
const targetStanding = (alias: string) => `${alias}.in_server=1 AND ${alias}.denied=0 AND NOT EXISTS(SELECT 1 FROM members m WHERE m.discord_id=${alias}.discord_id AND m.banned=1)
 AND EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=${alias}.discord_id AND c.status='member')
 AND NOT EXISTS(SELECT 1 FROM rename_holds h WHERE h.discord_id=${alias}.discord_id AND h.state='reapply')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=${alias}.discord_id AND j.state IN('waiting_role','held','erasing'))`;
function targetCondition(t: Target) { return `EXISTS(SELECT 1 FROM site_users tu WHERE tu.discord_id=${literal(t.id)} AND tu.account_incarnation=${literal(t.birth)} AND ${targetStanding('tu')} AND ${privacyGenerationLiteralFenceSql('tu.discord_id', t.generation)} AND (SELECT revision FROM privacy_subjects WHERE subject_id=tu.discord_id) IS ${literal(t.revision)})`; }
const receiptSql = (target: string, guild: string, seasonStart: number) => `SELECT id,source_id,payload_hash,amount_copper,observed_at,retain_until FROM community_contribution_receipts WHERE guild_scope=${literal(guild)} AND matched_discord_id=${literal(target)} AND source='officer_manual' AND substr(source_id,1,${TREASURY_EXTRA_PREFIX.length})=${literal(TREASURY_EXTRA_PREFIX)} AND status='matched' AND voided_at IS NULL AND retain_until>${DB_NOW} AND observed_at>=${seasonStart} AND observed_at<${seasonStart+TREASURY_WINDOW_SECONDS} AND observed_at>${DB_NOW}-${TREASURY_WINDOW_SECONDS} AND observed_at<=${DB_NOW} ORDER BY id LIMIT 101`;
const receiptSetSql = (target: string, guild: string, seasonStart: number) => `(SELECT COALESCE(json_group_array(json_array(id,source_id,payload_hash,amount_copper,observed_at,retain_until)),'[]') FROM (${receiptSql(target, guild, seasonStart)}))`;
type Receipt = { id: string; source_id: string; payload_hash: string; amount_copper: number; observed_at: number; retain_until: number };
const receiptJson = (rows: readonly Receipt[]) => JSON.stringify(rows.map(r => [r.id, r.source_id, r.payload_hash, r.amount_copper, r.observed_at, r.retain_until]));
const receiptProofPayload = (r: Omit<Receipt, 'payload_hash'>, target: Target, guild: string, guildScope: string) => JSON.stringify([r.id, r.source_id, r.amount_copper, r.observed_at, r.retain_until, guild, guildScope, target.id, target.birth, target.generation]);
export interface TreasuryAuthority { readonly operation: 'treasury_cosmetic' }
type TreasuryActor = Readonly<{ discordId: string; accountIncarnation: string; privacyGeneration: string | null; sessionVersion: number; expiresAt: number }>;
type Authority = { actor: TreasuryActor; env: TreasuryEnv; guildScope: string; config: TreasuryConfig; target: Target; ctx: CommunityContext; check: () => void; baseSQL: string; sql: string; receiptJSON: string; total: number; expires: number; digest?: string; operationId?: string; roleId?: string; desired?: 0 | 1; recognitionConsent?: boolean };
const authorities = new WeakMap<TreasuryAuthority, Authority>();
function authority(value: Authority): TreasuryAuthority { const a = Object.freeze({ operation: TREASURY_PURPOSE }); authorities.set(a, value); return a; }
export function treasuryAuthorityFacts(env: Env, given: TreasuryAuthority) { const a = authorities.get(given); if (!a || a.env !== env) return fail('treasury_authority'); a.check(); return a; }
export async function treasuryAuthorityCurrent(env: Env, given: TreasuryAuthority): Promise<boolean> { const a = treasuryAuthorityFacts(env, given); const result = await env.DB.prepare(`SELECT (${a.sql}) AS ok`).first<{ ok: number }>(); a.check(); return result?.ok === 1; }
/** Original actor and target are captured by the same admitted authority as the
 * operation. These private audit details never authorize a role or replace its
 * exact one-attempt custody. Registered subject references follow existing
 * audit account-copy/erasure treatment; no schema or retention extension. */
export function treasuryAuditValues(env: Env, given: TreasuryAuthority, facts: Readonly<Record<string, unknown>>) {
  const a = treasuryAuthorityFacts(env, given);
  return Object.freeze({ actor: a.actor.discordId, details: JSON.stringify({ ...facts,
    actorAccountIncarnation: a.actor.accountIncarnation, actorPrivacyGeneration: a.actor.privacyGeneration,
    actorSessionVersion: a.actor.sessionVersion, targetAccountIncarnation: a.target.birth,
    targetPrivacyGeneration: a.target.generation, _privacySubjectIds: [a.actor.discordId, a.target.id] }) });
}
async function capture(env: TreasuryEnv, request: Request, user: SiteUser, targetId: string, ctx: CommunityContext, e: ReturnType<typeof environment>): Promise<TreasuryAuthority> {
  const guildScope = contributionScope(env);
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/.test(guildScope)) return fail('treasury_ledger_scope', 503);
  if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.communityStaff || !isSiteAdmin(env, user.discord_id) || !id(targetId)) return fail('treasury_forbidden', 403);
  const originalSubject = ctx.subject, s = captureCommunitySubject(originalSubject), check = () => { e.check(); s.check(); if (ctx.subject !== originalSubject) fail('treasury_actor_changed'); if (!isSiteAdmin(env, s.subject.discordId)) fail('treasury_forbidden', 403); };
  check(); const read = await admittedRead(env, ctx, 'applicantWrite', [env.DB.prepare(`SELECT u.discord_id AS id,u.account_incarnation AS birth,p.generation,p.revision FROM site_users u LEFT JOIN privacy_subjects p ON p.subject_id=u.discord_id WHERE u.discord_id=?1 AND ${targetStanding('u')} AND (p.subject_id IS NULL OR p.state='active')`).bind(targetId), env.DB.prepare(receiptSql(targetId, guildScope, e.config.seasonStartsAt))]); check();
  if (read === FENCE_REFUSED) return fail('treasury_actor_changed', 403);
  const target = read[0]!.results[0] as Target | undefined;
  if (!target || !HEX.test(target.birth) || target.generation !== null && !HEX.test(target.generation) || target.revision !== null && (!Number.isSafeInteger(target.revision) || target.revision < 0)) return fail('treasury_target_unavailable', 403);
  const rows = read[1]!.results as Receipt[]; if (rows.length > 100) return fail('treasury_receipts_too_large', 503);
  let total = 0, expires = Math.min(now() + 180, s.subject.expiresAt);
  for (const r of rows) { if (!Number.isSafeInteger(r.amount_copper) || r.amount_copper < 1 || !Number.isSafeInteger(r.observed_at) || !Number.isSafeInteger(r.retain_until) || !r.payload_hash.startsWith(TREASURY_EXTRA_PREFIX) || !await verify(env.COOKIE_SECRET, TREASURY_EXTRA_PREFIX, receiptProofPayload(r, target, e.config.guildId, guildScope), r.payload_hash.slice(TREASURY_EXTRA_PREFIX.length))) return fail('treasury_receipt_unconfirmed'); check(); total += r.amount_copper; if (!Number.isSafeInteger(total)) return fail('treasury_amount_overflow'); expires = Math.min(expires, r.retain_until, r.observed_at + TREASURY_WINDOW_SECONDS); }
  const original = s.subject, json = receiptJson(rows), baseSQL = `${fenceSql('applicantWrite', 1, 2, 3, original.privacyGeneration, original.accountIncarnation).replace(/\?1\b/g, literal(original.discordId)).replace(/\?2\b/g, literal(original.sessionVersion)).replace(/\?3\b/g, literal(original.expiresAt))}
   AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=${literal(original.discordId)} AND banned=1) AND ${targetCondition(target)} AND ${expires}>${DB_NOW}`;
  const actor = Object.freeze({ discordId: original.discordId, accountIncarnation: original.accountIncarnation, privacyGeneration: original.privacyGeneration, sessionVersion: original.sessionVersion, expiresAt: original.expiresAt });
  const out = authority({ actor, env, guildScope, config: e.config, target: Object.freeze({ ...target }), ctx, check, baseSQL, sql: `${baseSQL} AND ${receiptSetSql(target.id, guildScope, e.config.seasonStartsAt)}=${literal(json)}`, receiptJSON: json, total, expires });
  if (!await treasuryAuthorityCurrent(env, out)) return fail('treasury_facts_changed'); return out;
}
export function treasuryTier(totalCopper: number): RoleKey | null { if (!Number.isSafeInteger(totalCopper) || totalCopper < 0) return fail('treasury_amount'); return [...TREASURY_TIERS].reverse().find(t => totalCopper >= t.copper)?.key ?? null; }
/** Public role labels only; no ledger, amount or receipt read. Caller still
 * requires actual current Discord role membership and ordinary directory
 * eligibility. At season end the website label lapses independently of cleanup. */
export function treasuryDirectoryRoles(env: Env): readonly (readonly [string,string])[] {
  // Labels are optional presentation only. A held Treasury configuration never
  // widens directory eligibility or disables the independently admitted reader.
  try {
    const slot = Object.getOwnPropertyDescriptor(env, 'TREASURY_COSMETIC_ROLES');
    if (!slot || !Object.hasOwn(slot, 'value') || !slot.value) return [];
    const config = environment(env).config;
    if (now() < config.seasonStartsAt || now() >= config.seasonStartsAt + TREASURY_WINDOW_SECONDS) return [];
    return TREASURY_TIERS.map(t => [config.roles[t.key], t.label] as const);
  } catch { return []; }
}
/** This fresh provider check supplements the original keeper member/standing
 * predicate. A cosmetic title or former keeper record is never membership. */
export function treasuryHasOlympusMembershipRole(env: Env, roles: readonly string[]): boolean {
  const eligible: string[] = env.ROLE_GUILD_MEMBER ? [env.ROLE_GUILD_MEMBER] : [];
  if (env.QR_NATIVE_ROLE_MAP) eligible.push(...parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP).roles);
  if (env.FULL_RELEASE_ROLES) { const full = JSON.parse(env.FULL_RELEASE_ROLES); eligible.push(full.membership, ...full.native); }
  return roles.some(role => eligible.includes(role));
}

type Role = { id: string; position: number; permissions: string; managed: boolean; hoist?: boolean; mentionable?: boolean };
/** A zero base permission role can still allow access through channel overrides.
 * The caller must supply the full GET guild channels response, never a page or a
 * name-filtered selection. Threads inherit their parent's role overrides. */
export function validateTreasuryInventory(config: TreasuryConfig, roles: unknown, channels: unknown, bot: unknown, target: unknown, owner: unknown): readonly string[] {
  if (!Array.isArray(roles) || roles.length > 250 || roles.some(r => !r || !id(r.id) || !Number.isSafeInteger(r.position) || r.position < 0 || typeof r.permissions !== 'string' || !/^(0|[1-9][0-9]{0,31})$/.test(r.permissions) || typeof r.managed !== 'boolean') || new Set(roles.map(r => r.id)).size !== roles.length) return fail('treasury_role_inventory');
  const inventory = new Map((roles as Role[]).map(r => [r.id, r])), b = bot as { user?: { id?: string }; roles?: unknown }, t = target as { user?: { id?: string }; roles?: unknown; pending?: unknown }, g = owner as { id?: string; owner_id?: string };
  if (!b || b.user?.id !== config.applicationId || !Array.isArray(b.roles) || b.roles.some(r => !id(r) || !inventory.has(r)) || !t || !id(t.user?.id) || !Array.isArray(t.roles) || t.roles.some(r => !id(r) || !inventory.has(r)) || t.pending !== undefined && t.pending !== false || g?.id !== config.guildId || !id(g.owner_id) || g.owner_id === t.user!.id || t.user!.id === config.applicationId) return fail('treasury_member_inventory');
  const own = [inventory.get(config.guildId), ...b.roles.map(r => inventory.get(r))].filter((r): r is Role => !!r), highest = Math.max(0, ...own.map(r => r.position)), permissions = own.reduce((all, r) => all | BigInt(r.permissions), 0n);
  if (!(permissions & 268435456n) || Math.max(0, ...t.roles.map(r => inventory.get(r)!.position)) >= highest) return fail('treasury_hierarchy');
  const cosmetic = new Set(Object.values(config.roles)); for (const role of cosmetic) { const r = inventory.get(role); if (!r || r.managed || r.permissions !== '0' || r.hoist !== false || r.mentionable !== false || r.position >= highest || ['Olympus Council GM','Olympus Council Officer'].includes((r as Role & {name?:string}).name ?? '')) return fail('treasury_role_not_cosmetic'); }
  if (!Array.isArray(channels) || channels.length > 500 || new Set(channels.map(c => c?.id)).size !== channels.length) return fail('treasury_channel_inventory');
  for (const c of channels) { if (!c || !id(c.id) || c.guild_id !== undefined && c.guild_id !== config.guildId || !Number.isSafeInteger(c.type) || !Array.isArray(c.permission_overwrites) || c.permission_overwrites.length > 1000) return fail('treasury_channel_inventory'); for (const o of c.permission_overwrites) if (!o || !id(o.id) || ![0, 1].includes(o.type) || typeof o.allow !== 'string' || !/^(0|[1-9][0-9]{0,31})$/.test(o.allow) || typeof o.deny !== 'string' || !/^(0|[1-9][0-9]{0,31})$/.test(o.deny) || o.type === 0 && cosmetic.has(o.id) && (o.allow !== '0' || o.deny !== '0')) return fail('treasury_channel_access'); }
  return Object.freeze((t.roles as string[]).slice());
}
const encoder = new TextEncoder();
async function tokenKey(secret: string) { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode('treasury-preview-v1\0' + secret)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(secret: string, value: unknown) { const iv = crypto.getRandomValues(new Uint8Array(12)), encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(secret), encoder.encode(JSON.stringify(value))); return `1.${b64u(iv)}.${b64u(new Uint8Array(encrypted))}`; }
async function open(secret: string, token: unknown): Promise<Record<string, unknown>> { if (typeof token !== 'string' || token.length > 60000 || !/^1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(token)) return fail('treasury_preview_invalid', 400); const parts = token.split('.'), bytes = (s: string) => { const value = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0)); if (b64u(value) !== s) return fail('treasury_preview_invalid', 400); return value; }; try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(parts[1]!) }, await tokenKey(secret), bytes(parts[2]!)))); } catch { return fail('treasury_preview_invalid', 400); } }
async function hash(value: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function record(env: TreasuryEnv, request: Request, user: SiteUser, body: Record<string, unknown>, ctx: CommunityContext, e: ReturnType<typeof environment>) {
  if (!keys(body, ['reference', 'discordId', 'amountCopper', 'observedAt', 'mailReference', 'verifiedAdditionalGold']) || typeof body.reference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(body.reference) || typeof body.discordId !== 'string' || typeof body.mailReference !== 'string' || body.verifiedAdditionalGold !== true || !Number.isSafeInteger(body.amountCopper) || (body.amountCopper as number) < 1 || (body.amountCopper as number) > 2147483647 || !Number.isSafeInteger(body.observedAt)) return fail('treasury_invalid_receipt', 400);
  if (!contributionsWritable(env) || (contributionRetentionDays(env) ?? 0) < 90) return fail('treasury_retention_unconfigured', 503);
  const auth = await capture(env, request, user, body.discordId, ctx, e), a = treasuryAuthorityFacts(env, auth), source = TREASURY_EXTRA_PREFIX + a.config.seasonStartsAt + ':' + body.reference;
  if (now() < a.config.seasonStartsAt || now() >= a.config.seasonStartsAt + TREASURY_WINDOW_SECONDS) return fail('treasury_season_closed');
  if (body.mailReference !== await mailReference(env, a.guildScope, a.target.id)) return fail('treasury_mail_reference_mismatch', 400); a.check();
  const old = await admittedRead(env, a.ctx, 'applicantWrite', [env.DB.prepare('SELECT id,source_id,payload_hash,amount_copper,observed_at,retain_until,matched_discord_id,status,voided_at FROM community_contribution_receipts WHERE guild_scope=?1 AND source=?2 AND source_id=?3').bind(a.guildScope, 'officer_manual', source)]); a.check();
  if (old === FENCE_REFUSED || !await treasuryAuthorityCurrent(env, auth)) return fail('treasury_actor_changed', 403);
  const existing = old[0]!.results[0] as Receipt & { matched_discord_id: string; status: string; voided_at: number | null } | undefined;
  if (existing) { if (existing.matched_discord_id !== a.target.id || existing.status !== 'matched' || existing.voided_at !== null || existing.amount_copper !== body.amountCopper || existing.observed_at !== body.observedAt || existing.retain_until <= now() || !existing.payload_hash.startsWith(TREASURY_EXTRA_PREFIX) || !await verify(env.COOKIE_SECRET, TREASURY_EXTRA_PREFIX, receiptProofPayload(existing, a.target, a.config.guildId, a.guildScope), existing.payload_hash.slice(TREASURY_EXTRA_PREFIX.length))) return fail('treasury_receipt_conflict'); if (!await treasuryAuthorityCurrent(env, auth)) return fail('treasury_facts_changed'); return apiJson({ recorded: true, replay: true, receiptId: existing.id }); }
  const r = { id: randomToken(), source_id: source, amount_copper: body.amountCopper as number, observed_at: body.observedAt as number, retain_until: (body.observedAt as number) + contributionRetentionDays(env)! * 86400 }, proof = TREASURY_EXTRA_PREFIX + await sign(env.COOKIE_SECRET, TREASURY_EXTRA_PREFIX, receiptProofPayload(r, a.target, a.config.guildId, a.guildScope)); a.check();
  const recordAudit=treasuryAuditValues(env,auth,{version:1,receiptId:r.id,verifiedAdditionalGoldAttestedByAdmin:true});
  const recorded = await env.DB.batch([
    env.DB.prepare(`INSERT INTO community_contribution_receipts(id,guild_scope,source,source_id,payload_hash,amount_copper,observed_at,observer_discord_id,matched_discord_id,status,retain_until,created_at) SELECT ?1,?2,'officer_manual',?3,?4,?5,?6,?7,?8,'matched',?9,${DB_NOW} WHERE ${a.sql} AND ?6<=${DB_NOW} AND ?6>=${a.config.seasonStartsAt} AND ?6<${a.config.seasonStartsAt+TREASURY_WINDOW_SECONDS} AND ?6>${DB_NOW}-${TREASURY_WINDOW_SECONDS} AND ?9>${DB_NOW} AND COALESCE((SELECT TOTAL(CAST(amount_copper AS REAL)) FROM community_contribution_receipts WHERE guild_scope=?2 AND matched_discord_id=?8),0)+?5<=9007199254740991.0 AND ?6>COALESCE((SELECT horizon FROM community_contribution_horizons WHERE guild_scope=?2 AND kind='receipt:officer_manual'),0) ON CONFLICT(guild_scope,source,source_id)DO NOTHING RETURNING id`).bind(r.id, a.guildScope, source, proof, r.amount_copper, r.observed_at, a.ctx.subject!.discordId, a.target.id, r.retain_until),
    env.DB.prepare(`INSERT INTO community_contribution_members(guild_scope,discord_id,incarnation,revision,nonce,updated_at) SELECT ?1,?2,?3,1,NULL,${DB_NOW} WHERE EXISTS(SELECT 1 FROM community_contribution_receipts WHERE id=?4 AND matched_discord_id=?2) ON CONFLICT(guild_scope,discord_id)DO UPDATE SET revision=revision+1,updated_at=${DB_NOW}`).bind(a.guildScope,a.target.id,randomToken(),r.id),
    env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?1,'treasury.extra_gold_recorded',?2,?3 WHERE EXISTS(SELECT 1 FROM community_contribution_receipts WHERE id=?4 AND matched_discord_id=?2 AND observer_discord_id=?1) AND ${a.baseSQL}`).bind(recordAudit.actor,a.target.id,recordAudit.details,r.id),
    env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM community_contribution_receipts WHERE id=?1 AND observer_discord_id=?2 AND matched_discord_id=?3) AND EXISTS(SELECT 1 FROM audit WHERE actor=?2 AND action='treasury.extra_gold_recorded' AND subject=?3 AND details=?4) THEN 1 ELSE json_extract('treasury_record_audit_held','$') END AS recorded_with_audit`).bind(r.id,recordAudit.actor,a.target.id,recordAudit.details),
  ]); a.check(); const out = recorded[0]!.results[0] as {id:string}|undefined;
  if (!out) return fail('treasury_receipt_not_recorded');
  // A committed receipt stays committed; only the original reader/target may
  // receive its acknowledgement after the exact receipt set has changed.
  if ((await env.DB.prepare(`SELECT (${a.baseSQL}) AS ok`).first<{ ok: number }>())?.ok !== 1) return fail('treasury_facts_changed'); a.check(); return apiJson({ recorded: true, receiptId: out.id });
}
export async function handleTreasuryCosmeticAdmin(request: Request, env: TreasuryEnv, parts: string[], user: SiteUser, body: Record<string, unknown>): Promise<Response> {
  try {
    if (request.method !== 'POST' || !sameOrigin(request) || request.headers.get('X-Olympus') !== PAGE_VERSION) return apiJson({ error: 'treasury_request_refused' }, 403);
    // Capture the original current administrator before the soft per-isolate
    // limiter. This context does not request guildRoleRead or provider work and
    // is reused by the original admitted target/receipt capture below.
    const e = environment(env), ctx = await communityContext(env, request); e.check();
    if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.communityStaff || !isSiteAdmin(env, user.discord_id)) return fail('treasury_forbidden', 403);
    const originalSubject = ctx.subject, actor = captureCommunitySubject(originalSubject);
    const requestCurrent = () => { e.check(); actor.check(); if (ctx.subject !== originalSubject || !isSiteAdmin(env, actor.subject.discordId)) return fail('treasury_actor_changed', 403); };
    requestCurrent();
    if (rateLimited(`treasury:${actor.subject.discordId}`, 30, 60)) return apiJson({ error: 'slow_down' }, 429);
    requestCurrent();
    const sub = parts.join('/');
    if (sub === 'target') {
      if (!keys(body,['discordId']) || typeof body.discordId !== 'string') return fail('treasury_invalid_target',400);
      const auth = await capture(env,request,user,body.discordId,ctx,e), a = treasuryAuthorityFacts(env,auth), reference = await mailReference(env,a.guildScope,a.target.id); a.check();
      if (!await treasuryAuthorityCurrent(env,auth)) return fail('treasury_facts_changed');
      return apiJson({discordId:a.target.id,mailReference:reference,recipient:'Fernmelder',seasonStartsAt:a.config.seasonStartsAt,seasonEndsAt:a.config.seasonStartsAt+TREASURY_WINDOW_SECONDS,tiers:TREASURY_TIERS.map(t=>({key:t.key,label:t.label,gold:t.copper/10000})),note:'The mail reference is a lookup aid, never proof that extra gold was received.'});
    }
    if (sub === 'record') return await record(env, request, user, body, ctx, e);
    if (sub === 'preview') {
      if (!keys(body, ['discordId', 'recognitionConsent']) || typeof body.discordId !== 'string' || typeof body.recognitionConsent !== 'boolean') return fail('treasury_consent_required', 400);
      const auth = await capture(env, request, user, body.discordId, ctx, e), a = treasuryAuthorityFacts(env, auth), central = await import('./role-settlements');
      const held = await central.inspectTreasuryCosmeticRoles(env, auth); a.check(); if (!await treasuryAuthorityCurrent(env, auth)) return fail('treasury_facts_changed');
      const recognitionConsent = body.recognitionConsent as boolean, recognitionMode = recognitionConsent ? 'recognize' : 'decline';
      const seasonOpen = now() >= a.config.seasonStartsAt && now() < a.config.seasonStartsAt + TREASURY_WINDOW_SECONDS, tier = recognitionConsent && seasonOpen ? treasuryTier(a.total) : null, desired = new Set(tier ? [a.config.roles[tier]] : []);
      if (seasonOpen) a.expires = Math.min(a.expires, a.config.seasonStartsAt + TREASURY_WINDOW_SECONDS);
      const nonce = randomToken(), changes = await Promise.all(ROLE_KEYS.filter(k => held.includes(a.config.roles[k]) !== desired.has(a.config.roles[k])).map(async k => ({ operationId: (await hash(JSON.stringify([TREASURY_PURPOSE, nonce, a.config.roles[k]]))).slice(0, 32), roleId: a.config.roles[k], label: TREASURY_TIERS.find(t => t.key === k)!.label, desired: desired.has(a.config.roles[k]) ? 1 : 0 })));
      const s = a.ctx.subject!, token = await seal(env.COOKIE_SECRET, { v: 1, actor: [s.discordId, s.sessionVersion, s.expiresAt, s.accountIncarnation, s.privacyGeneration], target: a.target, receipts: a.receiptJSON, config: a.config.raw, expires: a.expires, nonce, recognitionConsent, changes }); a.check();
      const previewAudit=treasuryAuditValues(env,auth,{version:1,previewDigest:await hash(token),operationIds:changes.map(c=>c.operationId),roleIds:changes.map(c=>c.roleId),tier,seasonStartsAt:a.config.seasonStartsAt,seasonEndsAt:a.config.seasonStartsAt+TREASURY_WINDOW_SECONDS,recognitionConsent,recognitionMode,recognitionConsentAttestedByAdmin:recognitionConsent,recognitionDeclinedAttestedByAdmin:!recognitionConsent,liveEffectClaimed:false});
      await env.DB.batch([
        env.DB.prepare(`SELECT CASE WHEN ${a.sql} THEN 1 ELSE json_extract('treasury_preview_audit_held','$') END AS current`),
        env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?1,'treasury.cosmetic_previewed',?2,?3 WHERE ${a.sql}`).bind(previewAudit.actor,a.target.id,previewAudit.details),
        env.DB.prepare(`SELECT CASE WHEN ${a.sql} AND EXISTS(SELECT 1 FROM audit WHERE actor=?1 AND action='treasury.cosmetic_previewed' AND subject=?2 AND details=?3) THEN 1 ELSE json_extract('treasury_preview_audit_held','$') END AS preview_with_audit`).bind(previewAudit.actor,a.target.id,previewAudit.details),
      ]);a.check();
      return apiJson({ token, recognitionConsent, recognitionMode, expiresAt: a.expires, tier, qualifyingGold: a.total / 10000, seasonStartsAt: a.config.seasonStartsAt, seasonEndsAt: a.config.seasonStartsAt + TREASURY_WINDOW_SECONDS, changes, liveEffectClaimed: false, dispatchEnabled: env.TREASURY_COSMETIC_ENABLED === 'true' });
    }
    if (sub === 'confirm') {
      if (!keys(body, ['token', 'operationId', 'confirmed']) || body.confirmed !== true || typeof body.operationId !== 'string' || !HEX.test(body.operationId)) return fail('treasury_confirmation_required', 400);
      const originalEnvironment = environment(env), token = await open(env.COOKIE_SECRET, body.token); originalEnvironment.check(); if (token.v !== 1 || typeof token.recognitionConsent !== 'boolean' || typeof token.expires !== 'number' || token.expires <= now() || !token.target || typeof token.target !== 'object' || !Array.isArray(token.changes)) return fail('treasury_preview_expired');
      const t = token.target as Target, auth = await capture(env, request, user, t.id, ctx, e), a = treasuryAuthorityFacts(env, auth), s = a.ctx.subject!, selected = (token.changes as { operationId: string; roleId: string; desired: 0 | 1 }[]).find(c => c.operationId === body.operationId);
      if (!selected || token.recognitionConsent === false && selected.desired !== 0 || !Object.values(a.config.roles).includes(selected.roleId) || ![0, 1].includes(selected.desired) || JSON.stringify(token.actor) !== JSON.stringify([s.discordId, s.sessionVersion, s.expiresAt, s.accountIncarnation, s.privacyGeneration]) || JSON.stringify(t) !== JSON.stringify(a.target) || token.receipts !== a.receiptJSON || token.config !== a.config.raw || token.expires > a.expires) return fail('treasury_preview_changed');
      a.recognitionConsent = token.recognitionConsent; a.expires = token.expires; a.digest = await hash(body.token as string); a.operationId = selected.operationId; a.roleId = selected.roleId; a.desired = selected.desired; a.sql += ` AND ${a.expires}>${DB_NOW}`; a.check();
      const result = await (await import('./role-settlements')).settleTreasuryCosmeticRole(env, auth); return apiJson(result, result.state === 'settled' ? 200 : 409);
    }
    if (sub === 'status') {
      if (!keys(body, ['operationId']) || typeof body.operationId !== 'string' || !HEX.test(body.operationId)) return fail('treasury_invalid_operation', 400);
      requestCurrent(); if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.communityStaff || !isSiteAdmin(env, user.discord_id)) return fail('treasury_forbidden', 403);
      const rows = await admittedRead(env, ctx, 'applicantWrite', [env.DB.prepare("SELECT id,state,reason,attempts,checked_at FROM role_settlements WHERE id=?1 AND guild_id=?2 AND purpose='treasury_cosmetic'").bind(body.operationId, e.config.guildId)]); e.check(); if (rows === FENCE_REFUSED) return fail('treasury_actor_changed', 403); return apiJson({ operation: rows[0]!.results[0] ?? null, noRetry: true });
    }
    return apiJson({ error: 'not_found' }, 404);
  } catch (e) { return apiJson({ error: e instanceof TreasuryHeld ? e.code : 'treasury_unavailable' }, e instanceof TreasuryHeld ? e.status : 503); }
}

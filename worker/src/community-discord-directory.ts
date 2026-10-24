/** On-demand Discord membership, independent of optional self-published profiles.
 * One bounded REST page; no roster mirror, account creation or role write.
 * Attended preference writes retain only a counts/choice audit, never target identity.
 * The original reader and captured target birth/generation are re-admitted after
 * provider and crypto waits. A traversal is not an atomic whole-server snapshot. */
import type { Env } from './env';
import { now } from './db';
import { rest, DiscordError } from './discord';
import { apiJson, avatarUrl, b64u, foundDiscordMember, PAGE_VERSION, isSiteAdmin, rateLimited, sameOrigin, sign, type Found } from './site-core';
import { admitted, admittedRead, admittedCommunityRead, captureCommunitySubject, communityReadRefusal, DB_NOW, fenceSql, FENCE_REFUSED, registerCommunityData, type CommunityContext } from './community-context';
import { secondsToIso } from './community-time';
import { parseNativeRoleMap, namesFor } from './native-rank-adapter';
import { NATIVE_RANKS } from './qr-phase1';
import { treasuryDirectoryRoles } from './treasury-cosmetic';

export const DISCORD_DIRECTORY_PAGE_SIZE = 100; // retained output/captured-target bound
export const DISCORD_DIRECTORY_SOURCE_PAGE_SIZE = 1000; // existing ListGuildMembers maximum, one request only
export const DISCORD_DIRECTORY_CURSOR_SECONDS = 900;
const VERSION = 'discord-directory-v2';
const MAX_CHARACTERS = 50;
const ID = /^[1-9][0-9]{16,19}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const encoder = new TextEncoder();
const PUBLIC_ROLE_BINDINGS = [
  ['ROLE_GUILD_MASTER', 'Guild Master'], ['ROLE_GUILD_LEADER', 'Guild Leader'],
  ['ROLE_OFFICER', 'Officer'], ['ROLE_RAID_LEADER', 'Raid Leader'], ['ROLE_GUILD_MEMBER', 'Guild Member'],
] as const;
const ENV_KEYS = ['DB', 'COOKIE_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_APP_ID', 'SITE_ADMINS', 'GUILD_ID', 'SITE_GUILD_ID', 'QR_NATIVE_ROLE_MAP', 'FULL_RELEASE_ROLES', 'TREASURY_COSMETIC_ROLES', ...PUBLIC_ROLE_BINDINGS.map(r => r[0])] as const;
const VISIBILITY_KEY = 'discordDirectoryHidden';
const hiddenValue = `CASE WHEN NOT json_valid(ds.value) THEN json_extract('discord_directory_visibility_unconfirmed','$') WHEN json_type(ds.value)<>'object' OR (SELECT COUNT(*) FROM json_each(ds.value))<>(SELECT COUNT(DISTINCT key) FROM json_each(ds.value)) OR EXISTS(SELECT 1 FROM json_each(ds.value) hidden WHERE length(hidden.key) NOT BETWEEN 17 AND 20 OR hidden.key GLOB '*[^0-9]*' OR hidden.type<>'text' OR (hidden.value<>'discord-only-optout-v1' AND (length(hidden.value)<>32 OR hidden.value GLOB '*[^0-9a-f]*'))) THEN json_extract('discord_directory_visibility_unconfirmed','$') ELSE ds.value END`;
function publicRoles(env: Env): readonly (readonly [string, string])[] {
  const roles: (readonly [string, string])[] = PUBLIC_ROLE_BINDINGS.flatMap(([key, label]) => validId(env[key]) ? [[env[key]!, label] as const] : []);
  if (env.QR_NATIVE_ROLE_MAP) {
    const map = parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP), names = namesFor(map.profile);
    if (names.length !== map.roles.length) throw new PageFault('discord_directory_unavailable', 503);
    for (let i = 0; i < map.roles.length; i++) { if (!validId(map.roles[i])) throw new PageFault('discord_directory_unavailable', 503); roles.push([map.roles[i]!, `Olympus ${names[i]}`]); }
  }
  if (env.FULL_RELEASE_ROLES) {
    const f = JSON.parse(env.FULL_RELEASE_ROLES);
    if (!f || Object.keys(f).join(',') !== 'version,epoch,epochStart,grants,membership,native' || f.version !== 1 || !validId(f.membership) || !Array.isArray(f.native) || f.native.length !== NATIVE_RANKS.length || !f.native.every(validId) || new Set([f.membership, ...f.native]).size !== 11 || JSON.stringify(f) !== env.FULL_RELEASE_ROLES) throw new PageFault('discord_directory_unavailable', 503);
    roles.push([f.membership, 'Guild Member']); for (let i = 0; i < f.native.length; i++) roles.push([f.native[i], `Historical ten-rank profile — ${NATIVE_RANKS[i]}`]);
  }
  if (!roles.length) throw new PageFault('discord_directory_unavailable', 503);
  return roles;
}
const validId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && BigInt(v) <= 18446744073709551615n;
class PageFault extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
type Cursor = { after: string; issuedAt: number; expiresAt: number; page: number };
type Member = Found & { roles: string[] };
type Target = { id: string; birth: string | null; generation: string | null; revision: number | null };
type Hydrated = Target & { characters: string };

function sourceCapture(env: Env) {
  const slots = ENV_KEYS.map(key => ({ key, descriptor: Object.getOwnPropertyDescriptor(env, key) }));
  for (const slot of slots) if (slot.descriptor && !Object.hasOwn(slot.descriptor, 'value')) throw new PageFault('discord_directory_unavailable', 503);
  const check = () => {
    for (const slot of slots) {
      const current = Object.getOwnPropertyDescriptor(env, slot.key);
      if (!!current !== !!slot.descriptor || current && (!Object.hasOwn(current, 'value') || current.value !== slot.descriptor!.value)) throw new PageFault('discord_directory_unavailable', 503);
    }
  };
  check(); return check;
}
const bytes = (raw: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new PageFault('invalid_cursor', 400);
  const decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4));
  const value = Uint8Array.from(decoded, c => c.charCodeAt(0));
  if (b64u(value) !== raw) throw new PageFault('invalid_cursor', 400);
  return value;
};
async function cursorKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`${VERSION}\0${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
/** Encryption also keeps the provider cursor and original reader identity out of URLs. */
async function cursorWrite(secret: string, binding: string, cursor: Cursor): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)), key = await cursorKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(binding) }, key, encoder.encode(JSON.stringify(cursor)));
  return `1.${b64u(iv)}.${b64u(new Uint8Array(encrypted))}`;
}
async function cursorRead(secret: string, binding: string, raw: string): Promise<Cursor> {
  if (raw.length > 1024) throw new PageFault('invalid_cursor', 400);
  const parts = /^1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!parts) throw new PageFault('invalid_cursor', 400);
  let cursor: Cursor;
  try {
    const key = await cursorKey(secret), decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(parts[1]!), additionalData: encoder.encode(binding) }, key, bytes(parts[2]!));
    cursor = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decoded));
  } catch { throw new PageFault('invalid_cursor', 400); }
  if (!cursor || Object.keys(cursor).sort().join(',') !== 'after,expiresAt,issuedAt,page' || !validId(cursor.after)
    || !Number.isSafeInteger(cursor.issuedAt) || !Number.isSafeInteger(cursor.expiresAt) || cursor.issuedAt > now()
    || cursor.expiresAt > cursor.issuedAt + DISCORD_DIRECTORY_CURSOR_SECONDS || cursor.expiresAt <= cursor.issuedAt
    || !Number.isSafeInteger(cursor.page) || cursor.page < 1 || cursor.page > 100000) throw new PageFault('invalid_cursor', 400);
  if (cursor.expiresAt <= now()) throw new PageFault('cursor_expired', 409);
  return cursor;
}

function memberPage(raw: unknown, after: string): { members: Member[]; last: string; complete: boolean; scanned: number } {
  if (!Array.isArray(raw) || raw.length > DISCORD_DIRECTORY_SOURCE_PAGE_SIZE) throw new PageFault('discord_directory_unavailable', 503);
  let previous = BigInt(after), last = after;
  const members: Member[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !item.user || typeof item.user !== 'object'
      || !validId(item.user.id) || BigInt(item.user.id) <= previous || !Array.isArray(item.roles)
      || item.roles.length > 250 || item.roles.some((r: unknown) => !validId(r))
      || new Set(item.roles).size !== item.roles.length || item.pending !== undefined && typeof item.pending !== 'boolean'
      || item.user.bot !== undefined && typeof item.user.bot !== 'boolean') throw new PageFault('discord_directory_unavailable', 503);
    previous = BigInt(item.user.id); last = item.user.id;
    if (item.user.bot === true || item.pending === true) continue;
    const found = foundDiscordMember(item);
    if (!found) throw new PageFault('discord_directory_unavailable', 503);
    members.push({ ...found, roles: [...item.roles] });
  }
  return { members, last, complete: raw.length < DISCORD_DIRECTORY_SOURCE_PAGE_SIZE, scanned: raw.length };
}

const permitted = `COALESCE(m.banned,0)=0 AND (u.discord_id IS NULL OR (
 u.in_server=1 AND u.denied=0 AND typeof(u.account_incarnation)='text' AND length(u.account_incarnation)=32
 AND length(CAST(u.account_incarnation AS BLOB))=32 AND u.account_incarnation NOT GLOB '*[^0-9a-f]*'))
 AND (p.subject_id IS NULL OR (p.state='active' AND typeof(p.generation)='text' AND length(p.generation)=32
 AND p.generation NOT GLOB '*[^0-9a-f]*' AND typeof(p.revision)='integer' AND p.revision>=0))
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=wanted.value AND j.state IN('waiting_role','held','erasing'))
 AND NOT EXISTS(SELECT 1 FROM site_settings ds WHERE ds.key='${VISIBILITY_KEY}' AND json_extract(${hiddenValue},'$.'||'"'||wanted.value||'"') IN(u.account_incarnation,'discord-only-optout-v1'))`;
const targetFrom = `FROM json_each(?1) wanted LEFT JOIN site_users u ON u.discord_id=wanted.value
 LEFT JOIN members m ON m.discord_id=wanted.value LEFT JOIN privacy_subjects p ON p.subject_id=wanted.value`;
function captureTargets(env: Env, ids: readonly string[]): D1PreparedStatement {
  return env.DB.prepare(`SELECT wanted.value AS id,u.account_incarnation AS birth,p.generation,p.revision ${targetFrom} WHERE ${permitted}`).bind(JSON.stringify(ids));
}
function hydrateTargets(env: Env, targets: readonly Target[]): D1PreparedStatement {
  return env.DB.prepare(`SELECT wanted.value AS id,u.account_incarnation AS birth,p.generation,p.revision,
   (SELECT json_group_array(json_object('name',c.name,'status',c.status,'verifiedAt',c.verified_at))
    FROM (SELECT name,status,verified_at FROM characters WHERE discord_id=u.discord_id
     AND status IN('verified','queued','member') AND typeof(verified_at)='integer' AND verified_at>0
     AND verified_at<=CAST(strftime('%s','now') AS INTEGER) ORDER BY name_key LIMIT ${MAX_CHARACTERS + 1}) c) AS characters
   ${targetFrom} JOIN json_each(?2) original ON json_extract(original.value,'$.id')=wanted.value
   WHERE ${permitted} AND u.account_incarnation IS json_extract(original.value,'$.birth')
   AND p.generation IS json_extract(original.value,'$.generation') AND p.revision IS json_extract(original.value,'$.revision')`)
    .bind(JSON.stringify(targets.map(t => t.id)), JSON.stringify(targets));
}
function targetRows(rows: unknown[]): Target[] {
  if (rows.length > DISCORD_DIRECTORY_PAGE_SIZE) throw new PageFault('discord_directory_unavailable', 503);
  return rows.map(raw => {
    const t = raw as Target;
    if (!validId(t.id) || t.birth !== null && (typeof t.birth !== 'string' || !HEX32.test(t.birth))
      || t.generation !== null && (typeof t.generation !== 'string' || !HEX32.test(t.generation))
      || t.revision !== null && (!Number.isSafeInteger(t.revision) || t.revision < 0)
      || (t.generation === null) !== (t.revision === null)) throw new PageFault('discord_directory_unavailable', 503);
    return { id: t.id, birth: t.birth, generation: t.generation, revision: t.revision };
  });
}
function characters(raw: string) {
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > MAX_CHARACTERS + 1) throw new PageFault('discord_directory_unavailable', 503);
  const all = rows.map(c => {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || c.name.length > 100 || !c.name
      || !['verified', 'queued', 'member'].includes(c.status) || !Number.isSafeInteger(c.verifiedAt) || c.verifiedAt <= 0 || c.verifiedAt > now()) throw new PageFault('discord_directory_unavailable', 503);
    return { name: c.name, status: c.status as 'verified' | 'queued' | 'member', verifiedAt: secondsToIso(c.verifiedAt) };
  });
  return { verifiedCharacters: all.slice(0, MAX_CHARACTERS), charactersTruncated: all.length > MAX_CHARACTERS };
}

export async function discordDirectoryList(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has('directory')) return apiJson({ error: 'feature_disabled' }, 503);
  if (!ctx.subject || !ctx.capabilities.communityRead) return communityReadRefusal(env, request);
  if (rateLimited(`dcd:${ctx.subject.discordId}`, 40, 60)) return apiJson({ error: 'slow_down' }, 429);
  try {
    const originalSubject = ctx.subject, checkEnv = sourceCapture(env), capture = captureCommunitySubject(originalSubject), subject = capture.subject;
    const check = () => { checkEnv(); capture.check(); if (ctx.subject !== originalSubject) throw new PageFault('discord_directory_unavailable', 503); };
    const guild = env.SITE_GUILD_ID!, secret = env.COOKIE_SECRET, allowedRoles = publicRoles(env), cosmeticRoles = treasuryDirectoryRoles(env);
    if (!validId(guild) || env.GUILD_ID !== guild || typeof secret !== 'string' || !secret || !env.DISCORD_BOT_TOKEN) throw new PageFault('discord_directory_unavailable', 503);
    const binding = JSON.stringify([VERSION, guild, DISCORD_DIRECTORY_PAGE_SIZE, DISCORD_DIRECTORY_SOURCE_PAGE_SIZE, subject.discordId, subject.sessionVersion, subject.expiresAt, subject.accountIncarnation, subject.privacyGeneration]);
    check();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => k !== 'cursor') || params.getAll('cursor').length > 1) throw new PageFault('invalid_cursor', 400);
    const rawCursor = params.get('cursor');
    const cursor = rawCursor ? await cursorRead(secret, binding, rawCursor) : { after: '0', issuedAt: now(), expiresAt: Math.min(now() + DISCORD_DIRECTORY_CURSOR_SECONDS, subject.expiresAt), page: 0 };
    check();
    const before = await admittedCommunityRead(env, ctx, [env.DB.prepare('SELECT 1 AS directory_admitted')]); check();
    if (before === FENCE_REFUSED) return communityReadRefusal(env, request);
    const raw = await rest<unknown>(env, 'GET', `/guilds/${guild}/members?limit=${DISCORD_DIRECTORY_SOURCE_PAGE_SIZE}&after=${cursor.after}`, undefined, 1); check();
    const scannedPage = memberPage(raw, cursor.after);
    const eligible = scannedPage.members.filter(m => allowedRoles.some(([role]) => m.roles.includes(role)));
    const selected = eligible.slice(0, DISCORD_DIRECTORY_PAGE_SIZE), overflow = eligible.length > selected.length;
    // Never advance past an eligible row that did not fit this output page.
    const page = { ...scannedPage, members: selected, last: overflow ? selected[selected.length - 1]!.id : scannedPage.last, complete: scannedPage.complete && !overflow };
    const captured = await admittedCommunityRead(env, ctx, [captureTargets(env, page.members.map(m => m.id))]); check();
    if (captured === FENCE_REFUSED) return communityReadRefusal(env, request);
    const targets = targetRows(captured[0]!.results), references = new Map<string, string>();
    for (const target of targets) {
      references.set(target.id, `dm_${await sign(secret, 'discord-directory-member-ref-v1', JSON.stringify([guild, target.id, target.birth, target.generation]))}`); check();
    }
    const nextCursor = page.complete ? null : await cursorWrite(secret, binding, { ...cursor, after: page.last, page: cursor.page + 1 }); check();
    // The only character payload is read after all provider/ref/cursor awaits.
    // Each target must retain the captured birth/generation and standing here.
    const hydrated = await admittedCommunityRead(env, ctx, [hydrateTargets(env, targets)]); check();
    if (hydrated === FENCE_REFUSED) return communityReadRefusal(env, request);
    const byId = new Map((hydrated[0]!.results as Hydrated[]).map(t => [t.id, t]));
    const members = page.members.flatMap(member => {
      const target = byId.get(member.id), ref = references.get(member.id);
      if (!target || !ref) return [];
      const displayName = member.nick || member.displayName || member.username;
      const label = displayName.trim().toLowerCase() === member.username.trim().toLowerCase() ? displayName : `${displayName} (${member.username})`;
      const roles = [...new Set([...allowedRoles, ...cosmeticRoles].filter(([role]) => member.roles.includes(role)).map(([, label]) => label))];
      return [{ ref, displayName, username: member.username, label, avatarUrl: avatarUrl(env, member.id, member.avatar), roles, ...characters(target.characters) }];
    });
    check();
    if (cursor.expiresAt <= now()) throw new PageFault('cursor_expired', 409);
    return apiJson({ source: 'discord_members', guildId: guild, scope: 'configured_olympus_members', generatedAt: secondsToIso(now()),
      members, nextCursor, complete: page.complete, scanned: page.scanned, returned: members.length,
      traversal: { atomicSnapshot: false, expiresAt: secondsToIso(cursor.expiresAt) } });
  } catch (error) {
    if (error instanceof PageFault) return apiJson({ error: error.code, message: error.status === 409 ? 'This directory traversal expired. Start again.' : 'The Discord member directory could not be confirmed.' }, error.status);
    return apiJson({ error: 'discord_directory_unavailable', message: error instanceof DiscordError && error.status === 429 ? 'Discord is busy. Wait a moment before loading this page again.' : 'Current Discord membership could not be confirmed. Try again shortly.' }, error instanceof DiscordError && error.status === 429 ? 429 : 503);
  }
}

const ERASURE_VISIBILITY_NOTICE = 'Account erasure deletes this preference. An eligible Discord account may then appear in the directory; a fresh attended opt-out can hide it again.';
function visibilityFacts(marker: unknown, birth: unknown) {
  const selfOwned = typeof birth === 'string' && HEX32.test(birth) && marker === birth;
  return { listed: marker !== 'discord-only-optout-v1' && !selfOwned,
    visibilityOrigin: selfOwned ? 'self_service' : marker === 'discord-only-optout-v1' ? 'attended_request' : marker === null ? 'default' : 'previous_account',
    restoreAllowed: !selfOwned, erasureNotice: ERASURE_VISIBILITY_NOTICE };
}
/** Own-only opt-out, independent of profile publication and role proof. A person
 * may hide their row even while they cannot qualify for Community content. */
export async function discordDirectoryVisibility(request: Request, env: Env, ctx: CommunityContext, body: Record<string, unknown> = {}): Promise<Response> {
  if (!ctx.subject) return apiJson({ error: 'signed_out' }, 401);
  const original = ctx.subject, capture = captureCommunitySubject(original), s = capture.subject;
  const check = () => { capture.check(); if (ctx.subject !== original) throw Error('discord_directory_original_reader_changed'); };
  const path = '$."' + s.discordId + '"';
  const read = () => admittedRead(env, ctx, 'authenticatedIdentity', [env.DB.prepare(`SELECT (SELECT json_extract(${hiddenValue},?2) FROM site_settings ds WHERE ds.key=?1) AS marker`).bind(VISIBILITY_KEY, path)]);
  if (request.method === 'PUT') {
    if (!sameOrigin(request) || request.headers.get('X-Olympus') !== PAGE_VERSION) return apiJson({ error: 'bad_origin' }, 403);
    if (Object.keys(body).join(',') !== 'listed' || typeof body.listed !== 'boolean') return apiJson({ error: 'invalid_visibility' }, 400);
    if (rateLimited(`dvv:${s.discordId}`, 20, 60)) return apiJson({ error: 'slow_down' }, 429);
    const value = `COALESCE((SELECT ${hiddenValue} FROM site_settings ds WHERE ds.key=?4),'{}')`;
    check(); const written = await admitted(env, ctx, [env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT ?4,CASE WHEN ?7=1 THEN json_remove(${value},?5) ELSE json_set(${value},?5,?6) END,${DB_NOW},NULL WHERE ${fenceSql('authenticatedIdentity', 1, 2, 3, s.privacyGeneration, s.accountIncarnation)} AND (?7=1 OR (SELECT COUNT(*) FROM json_each(${value}))<10000 OR json_type(${value},?5) IS NOT NULL) ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=NULL`).bind(s.discordId, s.sessionVersion, s.expiresAt, VISIBILITY_KEY, path, s.accountIncarnation, body.listed ? 1 : 0)]); check();
    if (written === FENCE_REFUSED) return apiJson({ error: 'visibility_not_saved' }, 409);
  } else if (request.method !== 'GET') return apiJson({ error: 'not_found' }, 404);
  check(); const result = await read(); check(); if (result === FENCE_REFUSED) return apiJson({ error: 'signed_out' }, 401);
  const facts = visibilityFacts((result[0]!.results[0] as { marker: unknown }).marker, s.accountIncarnation);
  return apiJson({ ...facts, restoreAllowed: true, default: 'listed_if_olympus_member', scope: 'whole_directory_row', optionalProfileDetails: 'separate_opt_in' });
}
/** Attended suppression also covers Olympus role holders who never created a site account.
 * Exact-ID preference only: no profile, role, roster, account or provider write. */
export async function discordDirectoryAttendedVisibility(request: Request, env: Env, ctx: CommunityContext, action: string, body: Record<string, unknown>): Promise<Response> {
  if (request.method !== 'POST' || !sameOrigin(request) || request.headers.get('X-Olympus') !== PAGE_VERSION) return apiJson({ error: 'bad_origin' }, 403);
  if (!ctx.subject || !ctx.capabilities.communityStaff || !isSiteAdmin(env, ctx.subject.discordId)) return apiJson({ error: 'forbidden' }, 403);
  if (!['status', 'visibility'].includes(action) || !validId(body.discordId) || Object.keys(body).sort().join(',') !== (action === 'status' ? 'discordId' : 'discordId,listed,requestConfirmed') || action === 'visibility' && (typeof body.listed !== 'boolean' || body.requestConfirmed !== true)) return apiJson({ error: 'invalid_visibility' }, 400);
  const original = ctx.subject, captured = captureCommunitySubject(original), subject = captured.subject, checkEnv = sourceCapture(env);
  const check = () => { checkEnv(); captured.check(); if (ctx.subject !== original || !isSiteAdmin(env, subject.discordId)) throw Error('discord_directory_original_staff_changed'); };
  if (rateLimited('dva:' + subject.discordId, 20, 60)) return apiJson({ error: 'slow_down' }, 429);
  const target = body.discordId, targetPath = '$."' + target + '"';
  const value = `COALESCE((SELECT ${hiddenValue} FROM site_settings ds WHERE ds.key=?4),'{}')`;
  if (action === 'visibility') {
    // Capture explicit presence, rather than interpreting a malformed NULL birth as absence.
    check(); const captureRows = await admittedRead(env, ctx, 'authenticatedIdentity', [env.DB.prepare(`SELECT
      CASE WHEN u.discord_id IS NULL THEN 0 ELSE 1 END AS sitePresent,u.account_incarnation AS birth,
      CASE WHEN p.subject_id IS NULL THEN 0 ELSE 1 END AS privacyPresent,p.state,p.generation,p.revision,
      EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=?1 AND j.state IN('waiting_role','held','erasing')) AS activeJob,
      (SELECT json_extract(${hiddenValue},?3) FROM site_settings ds WHERE ds.key=?2) AS marker
      FROM (SELECT ?1 AS id) wanted LEFT JOIN site_users u ON u.discord_id=wanted.id LEFT JOIN privacy_subjects p ON p.subject_id=wanted.id`).bind(target, VISIBILITY_KEY, targetPath)]); check();
    if (captureRows === FENCE_REFUSED) return apiJson({ error: 'forbidden' }, 403);
    const targetRows = captureRows[0]!.results;
    const fact = targetRows.length === 1 ? targetRows[0] as {sitePresent:unknown;birth:unknown;privacyPresent:unknown;state:unknown;generation:unknown;revision:unknown;activeJob:unknown;marker:unknown} : null;
    if (!fact || ![0,1].includes(fact.sitePresent as number) || ![0,1].includes(fact.privacyPresent as number) || fact.activeJob !== 0
      || (fact.sitePresent === 1 ? typeof fact.birth !== 'string' || !HEX32.test(fact.birth) : fact.birth !== null)
      || (fact.privacyPresent === 1 ? fact.state !== 'active' || typeof fact.generation !== 'string' || !HEX32.test(fact.generation) || !Number.isSafeInteger(fact.revision) || (fact.revision as number) < 0 : fact.state !== null || fact.generation !== null || fact.revision !== null)
      || (fact.marker !== null && fact.marker !== 'discord-only-optout-v1' && (typeof fact.marker !== 'string' || !HEX32.test(fact.marker)))) return apiJson({error:'visibility_target_changed'},409);
    // An attended request cannot replace the current person's own decision, even
    // with another hide. The exact marker is also part of the final write CAS.
    const originalVisibility = visibilityFacts(fact.marker, fact.birth);
    if (!originalVisibility.restoreAllowed) return apiJson({ error: 'visibility_owned_by_member', message: 'The member controls this self-service preference. Ask them to change it while signed in.', discordId: target, ...originalVisibility, scope: 'whole_directory_row', noAccountCreated: true, noDiscordWrite: true }, 409);
    const targetFence = `((?9=0 AND NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?8)) OR (?9=1 AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?8 AND u.account_incarnation=?10)))
      AND ((?11=0 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=?8)) OR (?11=1 AND EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=?8 AND p.state='active' AND p.generation=?12 AND p.revision=?13)))
      AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=?8 AND j.state IN('waiting_role','held','erasing'))
      AND json_extract(${value},?5) IS ?14`;
    check(); const written = await admitted(env, ctx, [env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT ?4,CASE WHEN ?7=1 THEN json_remove(${value},?5) ELSE json_set(${value},?5,?6) END,${DB_NOW},NULL WHERE ${fenceSql('applicantWrite', 1, 2, 3, subject.privacyGeneration, subject.accountIncarnation)} AND ${targetFence} AND (?7=1 OR (SELECT COUNT(*) FROM json_each(${value}))<10000 OR json_type(${value},?5) IS NOT NULL) ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=NULL`).bind(subject.discordId, subject.sessionVersion, subject.expiresAt, VISIBILITY_KEY, targetPath, 'discord-only-optout-v1', body.listed ? 1 : 0, target, fact.sitePresent, fact.birth, fact.privacyPresent, fact.generation, fact.revision, fact.marker),
      env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${DB_NOW},?1,'community.discord_directory_visibility',NULL,?2 WHERE changes()=1`).bind(subject.discordId, JSON.stringify({ rows: 1, listed: body.listed, origin: 'attended_request' }))]); check();
    if (written === FENCE_REFUSED || written[0]?.meta.changes !== 1 || written[1]?.meta.changes !== 1) return apiJson({ error: 'visibility_not_saved' }, 409);
  }
  check(); const rows = await admittedRead(env, ctx, 'authenticatedIdentity', [env.DB.prepare(`SELECT (SELECT json_extract(${hiddenValue},?3) FROM site_settings ds WHERE ds.key=?1) AS marker,(SELECT account_incarnation FROM site_users WHERE discord_id=?2) AS birth`).bind(VISIBILITY_KEY, target, targetPath)]); check();
  if (rows === FENCE_REFUSED) return apiJson({ error: 'forbidden' }, 403);
  const fact = rows[0]!.results[0] as { marker: unknown; birth: unknown };
  return apiJson({ discordId: target, ...visibilityFacts(fact.marker, fact.birth), scope: 'whole_directory_row', noAccountCreated: true, noDiscordWrite: true });
}

registerCommunityData('discord_directory_visibility', (env, account) => [env.DB.prepare(`UPDATE site_settings SET value=json_remove((SELECT ${hiddenValue} FROM site_settings ds WHERE ds.key=?1),?2),updated_at=${DB_NOW},updated_by=NULL WHERE key=?1`).bind(VISIBILITY_KEY, '$."' + account + '"')], (env, account) => ({
  statements: [env.DB.prepare(`SELECT EXISTS(SELECT 1 FROM site_settings ds WHERE ds.key=?1 AND json_extract(${hiddenValue},?3) IN('discord-only-optout-v1',(SELECT u.account_incarnation FROM site_users u WHERE u.discord_id=?2))) AS hidden`).bind(VISIBILITY_KEY, account, '$."' + account + '"')],
  shape: rows => ({ listedByDefault: true, optedOut: ((rows[0]!.results[0] as { hidden: number })?.hidden ?? 0) === 1, scope: 'whole_directory_row', extraProfileDetails: 'separate_opt_in' }),
  packed: {
    maxRows: 1,
    selectSql: `SELECT '' AS entry,json_object('hidden',EXISTS(SELECT 1 FROM site_settings ds WHERE ds.key='${VISIBILITY_KEY}' AND json_extract(${hiddenValue},'$."'||?1||'"') IN('discord-only-optout-v1',(SELECT u.account_incarnation FROM site_users u WHERE u.discord_id=?1)))) AS value`,
    shape: rows => {
      const value = rows.length === 1 && rows[0]!.entry === '' ? rows[0]!.value : null;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'hidden')) throw Error('privacy_copy_unconfirmed');
      const hidden = (value as {hidden: unknown}).hidden;
      if (hidden !== 0 && hidden !== 1) throw Error('privacy_copy_unconfirmed');
      return {listedByDefault:true,optedOut:hidden === 1,scope:'whole_directory_row',extraProfileDetails:'separate_opt_in'};
    },
  },
}));

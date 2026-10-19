/** Explicit publication for the two supported appointment offices only.
 * Canonical Discord pointers stay in the existing appointed setting: they confer
 * no permissions and the unchanged Native eraser already withholds exact pointers.
 * Names and characters are derived afresh; no identity/character snapshot is stored.
 */
import type { Env } from './env';
import { apiJson, shownName, sign, verify, type Found } from './site-core';
import { admittedCommunityRead, communityReadRefusal, communityContext, FENCE_REFUSED } from './community-context';
import { rest, DiscordError } from './discord';
import { secondsToIso } from './community-time';
import { FormError } from './policy-form-core';

export const APPOINTMENT_IDENTITY_ROLES = ['co_gm', 'treasurer'] as const;
type IdentityRole = typeof APPOINTMENT_IDENTITY_ROLES[number];
export type AppointmentAccountStatus = 'eligible' | 'unavailable';
const MAX_CHARACTERS = 50;
const PROOF_PURPOSE = 'appointed-character-publication-v1';
const DISCORD_PROOF_PURPOSE = 'appointed-discord-profile-publication-v1';
const PROOF_MARKER = ':publication:';
const own = (v: object, key: string): unknown => {
  const d = Object.getOwnPropertyDescriptor(v, key);
  return d && Object.hasOwn(d, 'value') ? d.value : undefined;
};

/** A typed username, raw snowflake, noncanonical mention or fuzzy match is not opt-in. */
export function appointmentAccountId(value: unknown): string | null {
  return typeof value === 'string' ? /^<@([0-9]{17,20})>$/.exec(value)?.[1] ?? null : null;
}

/** Keeping a pointer in a submitted map also needs the explicit publication check.
 * This protects old generic admin forms from silently carrying the new disclosure.
 */
export function appointmentPublicationConfirmation(appointed: Record<string, string>, body: Record<string, unknown>): boolean {
  return !APPOINTMENT_IDENTITY_ROLES.some(role => appointmentAccountId(own(appointed, role))) || own(body, 'appointedCharactersConfirmed') === true;
}

const proofPayload = (role: IdentityRole, pointer: string, birth: string) => JSON.stringify([role, pointer, birth]);
const discordProofPayload = (role: IdentityRole, pointer: string) => JSON.stringify([role, pointer]);

type DiscordAppointmentMember = { user?: { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown; bot?: unknown }; nick?: unknown; avatar?: unknown; pending?: unknown };
function foundAppointmentMember(raw: DiscordAppointmentMember, expectedId?: string): Found | null {
  const u = raw?.user;
  if (!u || typeof u.id !== 'string' || !/^[0-9]{17,20}$/.test(u.id) || expectedId && u.id !== expectedId
    || typeof u.username !== 'string' || !u.username || u.username.length > 80 || u.bot === true
    || u.bot !== undefined && typeof u.bot !== 'boolean' || raw.pending !== undefined && raw.pending !== false) return null;
  const text = (v: unknown) => typeof v === 'string' ? v : null;
  return { id: u.id, username: u.username, displayName: text(u.global_name), nick: text(raw.nick),
    avatar: typeof raw.avatar === 'string' ? `g:${raw.avatar}` : typeof u.avatar === 'string' ? `u:${u.avatar}` : null };
}
async function freshAppointmentMember(env: Env, id: string): Promise<Found | null> {
  if (!/^[0-9]{17,20}$/.test(env.SITE_GUILD_ID ?? '') || !env.DISCORD_BOT_TOKEN) throw Error('appointed_discord_unavailable');
  try {
    const member = await rest<DiscordAppointmentMember>(env, 'GET', `/guilds/${env.SITE_GUILD_ID}/members/${id}`, undefined, 1);
    return foundAppointmentMember(member, id);
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) return null;
    throw e;
  }
}
/** The owner's .176 choice: an appointment identifies a real current Discord guild
 * member, not a fabricated website account. No cache or account/profile write.
 */
export async function searchAppointmentMembers(env: Env, q: string): Promise<{ found: Found[]; limited?: boolean }> {
  const exactId = /^[0-9]{17,20}$/.test(q) ? q : /^<@!?([0-9]{17,20})>$/.exec(q)?.[1];
  try {
    if (exactId) {
      const member = await freshAppointmentMember(env, exactId);
      return { found: member ? [member] : [] };
    }
    const members = await rest<DiscordAppointmentMember[]>(env, 'GET', `/guilds/${env.SITE_GUILD_ID}/members/search?query=${encodeURIComponent(q)}&limit=25`, undefined, 1);
    if (!Array.isArray(members) || members.length > 25) throw Error('appointed_discord_unavailable');
    return { found: members.map(m => foundAppointmentMember(m)).filter((m): m is Found => m !== null) };
  } catch (e) {
    if (e instanceof DiscordError && e.status === 429) return { found: [], limited: true };
    throw e;
  }
}
function hexMac(mac: string): string {
  return [...atob(mac.replace(/-/g, '+').replace(/_/g, '/') + '=')].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}
function base64Mac(hex: string): string {
  return btoa(String.fromCharCode(...hex.match(/../g)!.map(v => Number.parseInt(v, 16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function containsInternalAppointmentProof(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v).some(key => key.includes(PROOF_MARKER));
}

// A duplicate-key or non-object legacy setting cannot supply publication authority.
const validSetting = `CASE WHEN NOT json_valid(s.value) THEN 0 WHEN json_type(s.value)<>'object' THEN 0
 ELSE (SELECT COUNT(*) FROM json_each(s.value))=(SELECT COUNT(DISTINCT key) FROM json_each(s.value)) END`;
const entries = `site_settings s,json_each(CASE WHEN ${validSetting} THEN s.value ELSE '{}' END) a`;
const supported = "a.key IN('co_gm','treasurer') AND a.type='text'";
const activeAccount = `u.in_server=1 AND u.denied=0 AND COALESCE(m.banned,0)=0
 AND typeof(u.account_incarnation)='text' AND length(u.account_incarnation)=32
 AND length(CAST(u.account_incarnation AS BLOB))=32 AND u.account_incarnation NOT GLOB '*[^0-9a-f]*'
 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id AND p.state<>'active')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=u.discord_id AND j.state IN('waiting_role','held','erasing'))`;
// Absence of a website profile never bypasses a separate keeper ban/privacy hold.
// An existing profile retains every original incarnation and standing check.
const allowedAccount = (id: string) => `COALESCE(m.banned,0)=0 AND (u.discord_id IS NULL OR (${activeAccount}))
 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=${id} AND p.state<>'active')
 AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=${id} AND j.state IN('waiting_role','held','erasing'))`;
const proofEntries = `(SELECT json_group_array(p.key) FROM (
 SELECT p.key FROM json_each(CASE WHEN ${validSetting} THEN s.value ELSE '{}' END) p
 WHERE p.type='text' AND p.value=a.value AND substr(p.key,1,length(a.key)+${PROOF_MARKER.length})=a.key||'${PROOF_MARKER}'
 AND length(p.key)=length(a.key)+${PROOF_MARKER.length + 64}
 AND substr(p.key,length(a.key)+${PROOF_MARKER.length + 1}) NOT GLOB '*[^0-9a-f]*' ORDER BY p.key LIMIT 2) p)`;

type PublicationTarget = { role: IdentityRole; id: string; birth: string | null };
type AppointmentAccount = { id: string; birth: string | null; status: AppointmentAccountStatus };
export type AppointmentPublicationFailure = { ok: false; role: IdentityRole; status: 'unavailable' | 'discord_unavailable' | 'account_changed' };
async function readAppointmentAccounts(env: Env, ids: readonly string[]): Promise<AppointmentAccount[]> {
  if (!ids.length) return [];
  const rows = await env.DB.prepare(`SELECT wanted.value AS id,u.account_incarnation AS birth,
   CASE WHEN ${allowedAccount('wanted.value')} THEN 'eligible' ELSE 'unavailable' END AS status
   FROM json_each(?1) wanted LEFT JOIN site_users u ON u.discord_id=wanted.value
   LEFT JOIN members m ON m.discord_id=wanted.value`).bind(JSON.stringify(ids)).all<AppointmentAccount>();
  return rows.results;
}

/** Admin search hint only; the save still captures the current birth and fences it atomically.
 * A refusal discloses no privacy case, erasure state or account incarnation to the picker.
 */
export async function appointmentAccountStatuses(env: Env, ids: readonly string[]): Promise<Map<string, AppointmentAccountStatus>> {
  return new Map((await readAppointmentAccounts(env, ids)).map(r => [r.id, r.status]));
}

export async function appointmentPublicationTargetFailure(env: Env, targets: readonly PublicationTarget[]): Promise<AppointmentPublicationFailure | null> {
  const accounts = new Map((await readAppointmentAccounts(env, targets.map(t => t.id))).map(r => [r.id, r]));
  for (const target of targets) {
    const current = accounts.get(target.id);
    if (!current || current.status !== 'eligible') return { ok: false, role: target.role, status: 'unavailable' };
    if (current.birth !== target.birth) return { ok: false, role: target.role, status: 'account_changed' };
  }
  return null;
}
/** The private internal key is not a ballot, appointment, permission or client field.
 * Its value repeats the exact pointer so the UNCHANGED Native eraser withholds both.
 * Lowercase hex obeys that eraser's existing flat-key grammar. An invalidated opaque
 * key can remain until a later authorized settings save; no physical purge is claimed.
 */
export async function prepareAppointmentPublication(env: Env, appointed: Record<string, string>): Promise<{ ok: true; stored: Record<string, string>; targets: PublicationTarget[] } | AppointmentPublicationFailure> {
  const associations = APPOINTMENT_IDENTITY_ROLES.flatMap(role => {
    const pointer = own(appointed, role), id = appointmentAccountId(pointer);
    return id ? [{ role, pointer: pointer as string, id }] : [];
  });
  const stored = { ...appointed }, targets: PublicationTarget[] = [];
  const secret = env.COOKIE_SECRET;
  for (const a of associations) {
    let target = (await readAppointmentAccounts(env, [a.id]))[0];
    if (!target || target.status !== 'eligible') return { ok: false, role: a.role, status: 'unavailable' };
    const capturedBirth = target.birth;
    try {
      if (!await freshAppointmentMember(env, a.id)) return { ok: false, role: a.role, status: 'unavailable' };
    } catch { return { ok: false, role: a.role, status: 'discord_unavailable' }; }
    // Recheck keeper privacy/standing after the external read, then carry the
    // captured presence/birth into the same original all-settings atomic CAS.
    target = (await readAppointmentAccounts(env, [a.id]))[0];
    if (!target || target.status !== 'eligible') return { ok: false, role: a.role, status: 'unavailable' };
    if (target.birth !== capturedBirth) return { ok: false, role: a.role, status: 'account_changed' };
    const mac = target.birth
      ? await sign(secret, PROOF_PURPOSE, proofPayload(a.role, a.pointer, target.birth))
      : await sign(secret, DISCORD_PROOF_PURPOSE, discordProofPayload(a.role, a.pointer));
    stored[a.role + PROOF_MARKER + hexMac(mac)] = a.pointer;
    targets.push({ role: a.role, id: a.id, birth: target.birth });
  }
  return { ok: true, stored, targets };
}

/** Repeats each captured target birth and standing in the EXISTING atomic map CAS. */
export function appointmentPublicationTargetsCurrentSql(parameter: number): string {
  return `NOT EXISTS(SELECT 1 FROM json_each(?${parameter}) t LEFT JOIN site_users u ON u.discord_id=json_extract(t.value,'$.id')
   LEFT JOIN members m ON m.discord_id=json_extract(t.value,'$.id')
   WHERE u.account_incarnation IS NOT json_extract(t.value,'$.birth') OR NOT(${allowedAccount("json_extract(t.value,'$.id')")}))`;
}

type ProofRow = { role: IdentityRole; appointment: string; birth: string | null; proofs: string };
function proofMac(r: ProofRow): string | null {
  if (!APPOINTMENT_IDENTITY_ROLES.includes(r.role) || !appointmentAccountId(r.appointment)) return null;
  const proofs: unknown = JSON.parse(r.proofs);
  if (!Array.isArray(proofs) || proofs.length !== 1 || typeof proofs[0] !== 'string') return null;
  const prefix = r.role + PROOF_MARKER, key = proofs[0];
  return key.startsWith(prefix) && /^[0-9a-f]{64}$/.test(key.slice(prefix.length)) ? base64Mac(key.slice(prefix.length)) : null;
}
async function hasCurrentProof(env: Env, r: ProofRow): Promise<boolean> {
  const mac = proofMac(r);
  return !!mac && typeof r.birth === 'string' && /^[0-9a-f]{32}$/.test(r.birth)
    && verify(env.COOKIE_SECRET, PROOF_PURPOSE, proofPayload(r.role, r.appointment, r.birth), mac);
}
async function hasDiscordProfileProof(env: Env, r: ProofRow): Promise<boolean> {
  const mac = proofMac(r);
  return !!mac && verify(env.COOKIE_SECRET, DISCORD_PROOF_PURPOSE, discordProofPayload(r.role, r.appointment), mac);
}

/** One source-authored payload statement, consumed behind the reader's original
 * confirmed-member session/birth admission in the same Native transaction.
 * Only currently verified/queued/member links with a real verification time are
 * published. Departed, pending, note-only, rejected and unbound links are excluded.
 */
export function appointedIdentitiesStatement(env: Env): D1PreparedStatement {
  return env.DB.prepare(`SELECT a.key AS role,a.value AS appointment,u.username,u.global_name,u.nick,u.account_incarnation AS birth,${proofEntries} AS proofs,
   (SELECT json_group_array(json_object('name',c.name,'status',c.status,'verifiedAt',c.verified_at))
    FROM (SELECT name,status,verified_at FROM characters WHERE discord_id=u.discord_id
      AND status IN('verified','queued','member') AND typeof(verified_at)='integer' AND verified_at>0
      AND verified_at<=CAST(strftime('%s','now') AS INTEGER) ORDER BY name_key LIMIT ${MAX_CHARACTERS + 1}) c) AS characters
   FROM ${entries} LEFT JOIN site_users u ON a.value='<@'||u.discord_id||'>'
   LEFT JOIN members m ON a.value='<@'||m.discord_id||'>'
   WHERE s.key='appointed' AND ${supported} AND length(a.value) BETWEEN 20 AND 23
   AND substr(a.value,1,2)='<@' AND substr(a.value,-1)='>' AND substr(a.value,3,length(a.value)-3) NOT GLOB '*[^0-9]*'
   AND ${allowedAccount('substr(a.value,3,length(a.value)-3)')}
   ORDER BY a.key LIMIT 2`);
}

type IdentityRow = ProofRow & { username: string | null; global_name: string | null; nick: string | null; characters: string };
export async function projectAppointedIdentities(env: Env, rows: unknown[], discordProfiles: ReadonlyMap<string, Found> = new Map()) {
  return (await Promise.all(rows.map(async raw => {
    const r = raw as IdentityRow, currentSiteProof = await hasCurrentProof(env, r);
    const profile = !currentSiteProof && await hasDiscordProfileProof(env, r) ? discordProfiles.get(appointmentAccountId(r.appointment)!) : null;
    if (!currentSiteProof && !profile || currentSiteProof && (typeof r.username !== 'string' || !r.username)) return null;
    // A Discord-only association can NEVER acquire private character authority
    // through a later login, recreated site account or unrelated legacy rows.
    const parsed: unknown = currentSiteProof ? JSON.parse(r.characters) : [];
    if (!Array.isArray(parsed) || parsed.length > MAX_CHARACTERS + 1) throw Error('appointed_identity_unconfirmed');
    const characters = parsed.map(c => {
      if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !['verified', 'queued', 'member'].includes(c.status) || !Number.isSafeInteger(c.verifiedAt) || c.verifiedAt <= 0) throw Error('appointed_identity_unconfirmed');
      return { name: c.name, status: c.status as 'verified'|'queued'|'member', verifiedAt: secondsToIso(c.verifiedAt) };
    });
    const name = profile ?? { username: r.username!, displayName: r.global_name, nick: r.nick };
    return { role: r.role, appointment: r.appointment, displayName: name.nick || name.displayName || name.username,
      username: name.username, label: shownName(name),
      characters: characters.slice(0, MAX_CHARACTERS), charactersTruncated: characters.length > MAX_CHARACTERS };
  }))).filter(r => r !== null);
}

export async function appointedIdentitiesPage(request: Request, env: Env): Promise<Response> {
  const ctx = await communityContext(env, request, { guildRoleRead: true });
  let out = await admittedCommunityRead(env, ctx, [appointedIdentitiesStatement(env)]);
  if (out === FENCE_REFUSED) return communityReadRefusal(env, request);
  const profiles = new Map<string, Found>();
  let providerRead = false;
  for (const raw of out[0]!.results) {
    const row = raw as IdentityRow;
    if (!await hasDiscordProfileProof(env, row)) continue;
    providerRead = true;
    try {
      const profile = await freshAppointmentMember(env, appointmentAccountId(row.appointment)!);
      if (profile) profiles.set(profile.id, profile);
    } catch { return apiJson({ error: 'appointed_identity_unavailable', message: 'The current Discord appointment profile could not be confirmed. Try again shortly.' }, 503); }
  }
  if (providerRead) {
    // Do not deliver a pre-network reader/session, erased target or replaced map.
    out = await admittedCommunityRead(env, ctx, [appointedIdentitiesStatement(env)]);
    if (out === FENCE_REFUSED) return communityReadRefusal(env, request);
  }
  return apiJson({ scope: 'qualified_community_readers', identities: await projectAppointedIdentities(env, out[0]!.results, profiles) });
}

/** Own-only association metadata; source names/characters already have their own
 * sections. No counterpart ID, approver, snapshot or other appointment is exported.
 */
export function ownAppointmentPublicationsStatement(env: Env, id: string): D1PreparedStatement {
  return env.DB.prepare(`SELECT a.key AS role,a.value AS appointment,u.account_incarnation AS birth,${proofEntries} AS proofs,s.updated_at AS recorded_at,
   CASE WHEN ${activeAccount} THEN 1 ELSE 0 END AS available FROM ${entries}
   JOIN site_users u ON u.discord_id=?1 LEFT JOIN members m ON m.discord_id=u.discord_id
   WHERE s.key='appointed' AND ${supported} AND a.value='<@'||?1||'>' ORDER BY a.key LIMIT 2`).bind(id);
}

export async function projectOwnAppointmentPublications(env: Env, rows: unknown[]) {
  return (await Promise.all(rows.map(async raw => {
    const r = raw as ProofRow & { recorded_at: number; available: number };
    if (!APPOINTMENT_IDENTITY_ROLES.includes(r.role) || !Number.isSafeInteger(r.recorded_at) || r.recorded_at < 0) throw new FormError('privacy_copy_unconfirmed', 503);
    const currentSiteProof = await hasCurrentProof(env, r);
    if (!currentSiteProof && !await hasDiscordProfileProof(env, r)) return null;
    return { role: r.role, publication: currentSiteProof ? 'discord_profile_and_current_verified_characters' : 'discord_profile_only', audience: 'qualified_community_readers', currentlyPublished: r.available === 1, recordedAt: secondsToIso(r.recorded_at) };
  }))).filter(r => r !== null);
}

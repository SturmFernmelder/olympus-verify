/** Explicit publication for the two supported appointment offices only.
 * Canonical Discord pointers stay in the existing appointed setting: they confer
 * no permissions and the unchanged Native eraser already withholds exact pointers.
 * Names and characters are derived afresh; no identity/character snapshot is stored.
 */
import type { Env } from './env';
import { apiJson, shownName, sign, verify } from './site-core';
import { admittedRead, communityContext, FENCE_REFUSED, refusal } from './community-context';
import { secondsToIso } from './community-time';
import { FormError } from './policy-form-core';

export const APPOINTMENT_IDENTITY_ROLES = ['co_gm', 'treasurer'] as const;
type IdentityRole = typeof APPOINTMENT_IDENTITY_ROLES[number];
const MAX_CHARACTERS = 50;
const PROOF_PURPOSE = 'appointed-character-publication-v1';
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
const proofEntries = `(SELECT json_group_array(p.key) FROM (
 SELECT p.key FROM json_each(CASE WHEN ${validSetting} THEN s.value ELSE '{}' END) p
 WHERE p.type='text' AND p.value=a.value AND substr(p.key,1,length(a.key)+${PROOF_MARKER.length})=a.key||'${PROOF_MARKER}'
 AND length(p.key)=length(a.key)+${PROOF_MARKER.length + 64}
 AND substr(p.key,length(a.key)+${PROOF_MARKER.length + 1}) NOT GLOB '*[^0-9a-f]*' ORDER BY p.key LIMIT 2) p)`;

type PublicationTarget = { id: string; birth: string };
/** The private internal key is not a ballot, appointment, permission or client field.
 * Its value repeats the exact pointer so the UNCHANGED Native eraser withholds both.
 * Lowercase hex obeys that eraser's existing flat-key grammar. An invalidated opaque
 * key can remain until a later authorized settings save; no physical purge is claimed.
 */
export async function prepareAppointmentPublication(env: Env, appointed: Record<string, string>): Promise<{ stored: Record<string, string>; targets: PublicationTarget[] } | null> {
  const associations = APPOINTMENT_IDENTITY_ROLES.flatMap(role => {
    const pointer = own(appointed, role), id = appointmentAccountId(pointer);
    return id ? [{ role, pointer: pointer as string, id }] : [];
  });
  const stored = { ...appointed }, targets: PublicationTarget[] = [];
  const secret = env.COOKIE_SECRET;
  for (const a of associations) {
    const target = await env.DB.prepare(`SELECT u.account_incarnation AS birth FROM site_users u
     LEFT JOIN members m ON m.discord_id=u.discord_id WHERE u.discord_id=?1 AND ${activeAccount}`).bind(a.id).first<{ birth: string }>();
    if (!target) return null;
    const mac = await sign(secret, PROOF_PURPOSE, proofPayload(a.role, a.pointer, target.birth));
    stored[a.role + PROOF_MARKER + hexMac(mac)] = a.pointer;
    targets.push({ id: a.id, birth: target.birth });
  }
  return { stored, targets };
}

/** Repeats each captured target birth and standing in the EXISTING atomic map CAS. */
export function appointmentPublicationTargetsCurrentSql(parameter: number): string {
  return `NOT EXISTS(SELECT 1 FROM json_each(?${parameter}) t LEFT JOIN site_users u ON u.discord_id=json_extract(t.value,'$.id')
   LEFT JOIN members m ON m.discord_id=u.discord_id WHERE u.discord_id IS NULL
   OR u.account_incarnation IS NOT json_extract(t.value,'$.birth') OR NOT(${activeAccount}))`;
}

type ProofRow = { role: IdentityRole; appointment: string; birth: string; proofs: string };
async function hasCurrentProof(env: Env, r: ProofRow): Promise<boolean> {
  if (!APPOINTMENT_IDENTITY_ROLES.includes(r.role) || !appointmentAccountId(r.appointment) || !/^[0-9a-f]{32}$/.test(r.birth)) return false;
  const proofs: unknown = JSON.parse(r.proofs);
  if (!Array.isArray(proofs) || proofs.length !== 1 || typeof proofs[0] !== 'string') return false;
  const prefix = r.role + PROOF_MARKER, key = proofs[0];
  if (!key.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(key.slice(prefix.length))) return false;
  return verify(env.COOKIE_SECRET, PROOF_PURPOSE, proofPayload(r.role, r.appointment, r.birth), base64Mac(key.slice(prefix.length)));
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
   FROM ${entries} JOIN site_users u ON a.value='<@'||u.discord_id||'>'
   LEFT JOIN members m ON m.discord_id=u.discord_id
   WHERE s.key='appointed' AND ${supported} AND ${activeAccount}
   ORDER BY a.key LIMIT 2`);
}

type IdentityRow = ProofRow & { username: string | null; global_name: string | null; nick: string | null; characters: string };
export async function projectAppointedIdentities(env: Env, rows: unknown[]) {
  return (await Promise.all(rows.map(async raw => {
    const r = raw as IdentityRow;
    if (typeof r.username !== 'string' || !r.username || !await hasCurrentProof(env, r)) return null;
    const parsed: unknown = JSON.parse(r.characters);
    if (!Array.isArray(parsed) || parsed.length > MAX_CHARACTERS + 1) throw Error('appointed_identity_unconfirmed');
    const characters = parsed.map(c => {
      if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !['verified', 'queued', 'member'].includes(c.status) || !Number.isSafeInteger(c.verifiedAt) || c.verifiedAt <= 0) throw Error('appointed_identity_unconfirmed');
      return { name: c.name, status: c.status as 'verified'|'queued'|'member', verifiedAt: secondsToIso(c.verifiedAt) };
    });
    return { role: r.role, appointment: r.appointment, displayName: r.nick || r.global_name || r.username,
      username: r.username, label: shownName({ username: r.username, displayName: r.global_name, nick: r.nick }),
      characters: characters.slice(0, MAX_CHARACTERS), charactersTruncated: characters.length > MAX_CHARACTERS };
  }))).filter(r => r !== null);
}

export async function appointedIdentitiesPage(request: Request, env: Env): Promise<Response> {
  const ctx = await communityContext(env, request);
  const out = await admittedRead(env, ctx, 'confirmedGuildData', [appointedIdentitiesStatement(env)]);
  if (out === FENCE_REFUSED) return refusal(env, request, 'confirmedGuildData');
  return apiJson({ scope: 'confirmed_guild_members', identities: await projectAppointedIdentities(env, out[0]!.results) });
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
    if (!await hasCurrentProof(env, r)) return null;
    return { role: r.role, publication: 'discord_profile_and_current_verified_characters', audience: 'confirmed_guild_members', currentlyPublished: r.available === 1, recordedAt: secondsToIso(r.recorded_at) };
  }))).filter(r => r !== null);
}

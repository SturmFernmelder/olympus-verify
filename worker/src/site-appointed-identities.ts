/** Explicit publication for the source-authored appointment catalogue.
 * Canonical Discord pointers stay in the existing appointed setting: they confer
 * no permissions and the unchanged Native eraser already withholds exact pointers.
 * Names and characters are derived afresh; no identity/character snapshot is stored.
 */
import type { Env } from './env';
import { apiJson, foundDiscordMember, isSiteAdmin, shownName, sign, verify, rateLimited, type Found } from './site-core';
import { admittedCommunityRead, communityReadRefusal, communityContext, FENCE_REFUSED } from './community-context';
import { rest, DiscordError } from './discord';
import { secondsToIso } from './community-time';
import { FormError } from './policy-form-core';
import { OFFICE_APPOINTMENTS } from './governance-offices';
import { privacyGenerationLiteralFenceSql } from './privacy-serving-authority';
import { LEADERSHIP_POSITION_KEYS, LEADERSHIP_POSITIONS, LEADERSHIP_PROOF_PURPOSE, leadershipEnvelopeSql, leadershipPublication, leadershipProofPayload } from './site-leadership-data';

export const APPOINTMENT_IDENTITY_ROLES: readonly string[] = Object.freeze(OFFICE_APPOINTMENTS.map(office => office.key));
type IdentityRole = typeof APPOINTMENT_IDENTITY_ROLES[number];
const MAX_OFFICES = APPOINTMENT_IDENTITY_ROLES.length;
// 32 holder reads leave room for both original role-reader admissions and refusal
// explanation below the existing 40-call working ceiling / 50-call plan limit.
const IDENTITY_PAGE = 32;
const FRESH_SAVE_MEMBERS = 32;
const PAGE_PURPOSE = 'appointed-identities-page-v1';
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
  return foundDiscordMember(raw, expectedId);
}
export async function freshAppointmentMember(env: Env, id: string): Promise<Found | null> {
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
// These keys are source constants, never request text. An unrelated flat setting
// key cannot opt in or acquire a proof merely by resembling an office.
if (!MAX_OFFICES || MAX_OFFICES > 250 || new Set(APPOINTMENT_IDENTITY_ROLES).size !== MAX_OFFICES
  || APPOINTMENT_IDENTITY_ROLES.some(key => !/^[a-z][a-z0-9_:]{0,79}$/.test(key))) throw Error('appointment_catalogue_invalid');
const supported = `a.key IN(${APPOINTMENT_IDENTITY_ROLES.map(key => `'${key}'`).join(',')}) AND a.type='text'`;
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

export type PublicationTarget = { role: IdentityRole; id: string; birth: string | null; generation: string | null };
export type AppointmentAccount = { id: string; birth: string | null; generation: string | null; status: AppointmentAccountStatus };
export type AppointmentPublicationFailure = { ok: false; role: IdentityRole; status: 'unavailable' | 'discord_unavailable' | 'account_changed' | 'fresh_check_limit' };
export async function readAppointmentAccounts(env: Env, ids: readonly string[]): Promise<AppointmentAccount[]> {
  if (!ids.length) return [];
  const rows = await env.DB.prepare(`SELECT wanted.value AS id,u.account_incarnation AS birth,p.generation AS generation,
   CASE WHEN ${allowedAccount('wanted.value')} AND (p.subject_id IS NULL OR
    (typeof(p.generation)='text' AND length(p.generation)=32 AND length(CAST(p.generation AS BLOB))=32 AND p.generation NOT GLOB '*[^0-9a-f]*'))
    THEN 'eligible' ELSE 'unavailable' END AS status
   FROM json_each(?1) wanted LEFT JOIN site_users u ON u.discord_id=wanted.value
   LEFT JOIN members m ON m.discord_id=wanted.value LEFT JOIN privacy_subjects p ON p.subject_id=wanted.value`).bind(JSON.stringify(ids)).all<AppointmentAccount>();
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
    if (current.birth !== target.birth || current.generation !== target.generation) return { ok: false, role: target.role, status: 'account_changed' };
  }
  return null;
}
/** The private internal key is not a ballot, appointment, permission or client field.
 * Its value repeats the exact pointer so the UNCHANGED Native eraser withholds both.
 * Lowercase hex obeys that eraser's existing flat-key grammar. An invalidated opaque
 * key can remain until a later authorized settings save; no physical purge is claimed.
 */
/** Only the server's original raw setting is eligible for reuse. A JSON duplicate,
 * malformed proof, changed pointer, changed site birth or client proof is never
 * carried forward. Discord-only consent remains Discord-only after later login. */
async function originalPublicationProofs(env: Env, originalValue: string | null): Promise<ProofRow[]> {
  if (originalValue === null) return [];
  const out = await env.DB.prepare(`SELECT a.key AS role,a.value AS appointment,u.account_incarnation AS birth,${proofEntries} AS proofs
   FROM (SELECT ?1 AS value) s,json_each(CASE WHEN ${validSetting} THEN s.value ELSE '{}' END) a
   LEFT JOIN site_users u ON a.value='<@'||u.discord_id||'>'
   WHERE ${supported} ORDER BY a.key LIMIT ${MAX_OFFICES}`).bind(originalValue).all<ProofRow>();
  return out.results;
}
export async function prepareAppointmentPublication(env: Env, appointed: Record<string, string>, originalValue: string | null = null): Promise<{ ok: true; stored: Record<string, string>; targets: PublicationTarget[] } | AppointmentPublicationFailure> {
  const associations = APPOINTMENT_IDENTITY_ROLES.flatMap(role => {
    const pointer = own(appointed, role), id = appointmentAccountId(pointer);
    return id ? [{ role, pointer: pointer as string, id }] : [];
  });
  const stored = { ...appointed }, targets: PublicationTarget[] = [];
  const secret = env.COOKIE_SECRET;
  const ids = [...new Set(associations.map(a => a.id))];
  const captured = new Map((await readAppointmentAccounts(env, ids)).map(t => [t.id, t]));
  const originals = new Map((await originalPublicationProofs(env, originalValue)).map(row => [row.role, row]));
  const reused = new Map<string, string>(), fresh = new Map<string, IdentityRole>();
  for (const a of associations) {
    const target = captured.get(a.id);
    if (!target || target.status !== 'eligible') return { ok: false, role: a.role, status: 'unavailable' };
    const row = originals.get(a.role);
    if (row && row.appointment === a.pointer && row.birth === target.birth &&
      (await hasCurrentProof(env, row) || await hasDiscordProfileProof(env, row))) {
      // Copy this exact original key, never sign a replacement with a new purpose,
      // generation, person or character authority. No proof leaves the server.
      reused.set(a.role, (JSON.parse(row.proofs) as string[])[0]!);
    } else fresh.set(a.id, a.role);
  }
  // Count before the FIRST provider call. This limits changed work, not the map:
  // a qualified 131-office map remains editable and can be built in finite batches.
  if (fresh.size > FRESH_SAVE_MEMBERS) return { ok: false, role: fresh.values().next().value!, status: 'fresh_check_limit' };
  for (const [id, role] of fresh) {
    try {
      if (!await freshAppointmentMember(env, id)) return { ok: false, role, status: 'unavailable' };
    } catch { return { ok: false, role, status: 'discord_unavailable' }; }
  }
  // One original current read after all external/crypto waits; unchanged retained
  // proofs do not bypass birth, privacy generation, standing or the final map CAS.
  const current = new Map((await readAppointmentAccounts(env, ids)).map(t => [t.id, t]));
  for (const a of associations) {
    const target = current.get(a.id), before = captured.get(a.id)!;
    if (!target || target.status !== 'eligible') return { ok: false, role: a.role, status: 'unavailable' };
    if (target.birth !== before.birth || target.generation !== before.generation) return { ok: false, role: a.role, status: 'account_changed' };
    const originalKey = reused.get(a.role);
    if (originalKey) stored[originalKey] = a.pointer;
    else {
      const mac = target.birth
        ? await sign(secret, PROOF_PURPOSE, proofPayload(a.role, a.pointer, target.birth))
        : await sign(secret, DISCORD_PROOF_PURPOSE, discordProofPayload(a.role, a.pointer));
      stored[a.role + PROOF_MARKER + hexMac(mac)] = a.pointer;
    }
    targets.push({ role: a.role, id: a.id, birth: target.birth, generation: target.generation });
  }
  return { ok: true, stored, targets };
}

/** Repeats each captured target birth and standing in the EXISTING atomic map CAS. */
export function appointmentPublicationTargetsCurrentSql(parameter: number): string {
  return `NOT EXISTS(SELECT 1 FROM json_each(?${parameter}) t LEFT JOIN site_users u ON u.discord_id=json_extract(t.value,'$.id')
   LEFT JOIN members m ON m.discord_id=json_extract(t.value,'$.id')
   LEFT JOIN privacy_subjects p ON p.subject_id=json_extract(t.value,'$.id')
   WHERE u.account_incarnation IS NOT json_extract(t.value,'$.birth') OR p.generation IS NOT json_extract(t.value,'$.generation')
    OR NOT(${allowedAccount("json_extract(t.value,'$.id')")}))`;
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
  return env.DB.prepare(`SELECT a.key AS role,a.value AS appointment,u.username,u.global_name,u.nick,u.account_incarnation AS birth,(SELECT generation FROM privacy_subjects WHERE subject_id=substr(a.value,3,length(a.value)-3)) AS generation,${proofEntries} AS proofs,
   (SELECT json_group_array(json_object('name',c.name,'status',c.status,'verifiedAt',c.verified_at))
    FROM (SELECT name,status,verified_at FROM characters WHERE discord_id=u.discord_id
      AND status IN('verified','queued','member') AND typeof(verified_at)='integer' AND verified_at>0
      AND verified_at<=CAST(strftime('%s','now') AS INTEGER) ORDER BY name_key LIMIT ${MAX_CHARACTERS + 1}) c) AS characters
   FROM ${entries} LEFT JOIN site_users u ON a.value='<@'||u.discord_id||'>'
   LEFT JOIN members m ON a.value='<@'||m.discord_id||'>'
   WHERE s.key='appointed' AND ${supported} AND length(a.value) BETWEEN 20 AND 23
   AND substr(a.value,1,2)='<@' AND substr(a.value,-1)='>' AND substr(a.value,3,length(a.value)-3) NOT GLOB '*[^0-9]*'
   AND ${allowedAccount('substr(a.value,3,length(a.value)-3)')}
   ORDER BY a.key LIMIT ${MAX_OFFICES}`);
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
  // This authentic context is zero-provider. Charge the original reader before
  // either Guild Member admission or any appointee lookup; no anonymous bucket.
  const ctx = await communityContext(env, request);
  if (!ctx.subject) return apiJson({ error: 'signed_out' }, 401);
  if (rateLimited('appointed-read:' + ctx.subject.discordId, 20, 60)) return apiJson({ error: 'slow_down' }, 429);
  const q = new URL(request.url).searchParams, after = q.get('after'), revision = q.get('revision'), role = q.get('role');
  if ((after === null) !== (revision === null) || after !== null && (!APPOINTMENT_IDENTITY_ROLES.includes(after) || !/^[A-Za-z0-9_-]{43}$/.test(revision!)) ||
      role !== null && (!APPOINTMENT_IDENTITY_ROLES.includes(role) || after !== null || revision !== null) ||
      [...q.keys()].some(key => !['after', 'revision', 'role'].includes(key)) || [...q.keys()].length !== new Set(q.keys()).size)
    return apiJson({ error: 'invalid_appointment_cursor' }, 400);
  const statements = () => [env.DB.prepare("SELECT value FROM site_settings WHERE key='appointed'"), appointedIdentitiesStatement(env)];
  let out = await admittedCommunityRead(env, ctx, statements());
  if (out === FENCE_REFUSED) return communityReadRefusal(env, request);
  const originalValue = (out[0]!.results[0] as { value: string } | undefined)?.value ?? null;
  // Only an opaque MAC and public office key are returned. Birth, generation,
  // session version, raw map and internal publication proof keys stay private.
  const subject = ctx.subject, originalRows = out[1]!.results;
  // The full original Native payload is already bounded at 131 offices x 51
  // character rows. Bind it privately so a prior page's birth, lifecycle, names
  // or current characters cannot change unnoticed before collection completes.
  const revisionWitness = [subject.discordId, subject.sessionVersion, subject.expiresAt, subject.accountIncarnation, subject.privacyGeneration, originalValue, originalRows, APPOINTMENT_IDENTITY_ROLES];
  const revisionPayload = JSON.stringify(role === null ? revisionWitness : [...revisionWitness, { role }]);
  if (revision !== null && !await verify(env.COOKIE_SECRET, PAGE_PURPOSE, revisionPayload, revision))
    return apiJson({ error: 'appointed_identities_changed', message: 'The appointment view changed. Refresh the page before reading it again.' }, 409);
  const pageRevision = revision ?? await sign(env.COOKIE_SECRET, PAGE_PURPOSE, revisionPayload);
  // A dialog can request one closed catalogue office without collecting all131.
  // The original complete private witness and final admitted reread stay intact.
  const pageRows = originalRows.filter(raw => role === null ? (raw as IdentityRow).role > (after ?? '') : (raw as IdentityRow).role === role).slice(0, IDENTITY_PAGE + 1);
  const rows = pageRows.slice(0, IDENTITY_PAGE), profiles = new Map<string, Found>(), checked = new Set<string>();
  for (const raw of rows) {
    const row = raw as IdentityRow;
    if (!await hasDiscordProfileProof(env, row)) continue;
    const id = appointmentAccountId(row.appointment)!;
    if (checked.has(id)) continue;
    checked.add(id);
    try {
      const profile = await freshAppointmentMember(env, id);
      if (profile) profiles.set(profile.id, profile);
    } catch { return apiJson({ error: 'appointed_identity_unavailable', message: 'The current Discord appointment profile could not be confirmed. Try again shortly.' }, 503); }
  }
  // Repeat the admitted payload even on a no-provider page: crypto and revision
  // checks also await. A changed map never releases a mixed-page projection.
  // Finish all projection crypto before that final current Native witness; no
  // further crypto/network await can reopen a target lifecycle race afterwards.
  const identities = await projectAppointedIdentities(env, rows, profiles);
  out = await admittedCommunityRead(env, ctx, statements());
  if (out === FENCE_REFUSED) return communityReadRefusal(env, request);
  if (((out[0]!.results[0] as { value: string } | undefined)?.value ?? null) !== originalValue || JSON.stringify(out[1]!.results) !== JSON.stringify(originalRows))
    return apiJson({ error: 'appointed_identities_changed', message: 'The appointment view changed. Refresh the page before reading it again.' }, 409);
  const finalRows = rows;
  const nextCursor = pageRows.length > IDENTITY_PAGE ? (finalRows[finalRows.length - 1] as IdentityRow).role : null;
  return apiJson({ scope: 'qualified_community_readers', identities,
    revision: pageRevision, nextCursor, complete: nextCursor === null });
}

/** Own-only association metadata; source names/characters already have their own
 * sections. No counterpart ID, approver, snapshot or other appointment is exported.
 */
export function ownAppointmentPublicationsStatement(env: Env, id: string): D1PreparedStatement {
  return ownPublicationStatement(env, id);
}
function ownPublicationStatement(env: Env, id: string, authorityKeys?: readonly string[]): D1PreparedStatement {
  const authorityColumns = authorityKeys ? ',s.value AS appointed_value,(SELECT generation FROM privacy_subjects WHERE subject_id=?1) AS generation' : '';
  const selected = authorityKeys ? `AND a.key IN(${authorityKeys.map(key => `'${key}'`).join(',')})` : '';
  // Branch display records share the original one physical copy slot only. They
  // NEVER enter office authority selection or the 131-office proof catalogue.
  const branch = authorityKeys ? '' : ` UNION ALL SELECT p.key AS role,json_extract(p.value,'$.pointer') AS appointment,u.account_incarnation AS birth,p.value AS proofs,s.updated_at AS recorded_at,
   CASE WHEN ${activeAccount} AND u.account_incarnation IS json_extract(p.value,'$.birth')
    AND (SELECT generation FROM privacy_subjects WHERE subject_id=u.discord_id) IS json_extract(p.value,'$.generation') THEN 1 ELSE 0 END AS available
   FROM site_settings s,json_each(CASE WHEN ${leadershipEnvelopeSql('s.value')} THEN s.value ELSE '{}' END,'$.publications') p
   JOIN site_users u ON u.discord_id=?1 LEFT JOIN members m ON m.discord_id=u.discord_id
   WHERE s.key='leadership' AND json_extract(p.value,'$.pointer')='<@'||?1||'>'`;
  return env.DB.prepare(`SELECT a.key AS role,a.value AS appointment,u.account_incarnation AS birth,${proofEntries} AS proofs,s.updated_at AS recorded_at,
   CASE WHEN ${activeAccount} THEN 1 ELSE 0 END AS available ${authorityColumns} FROM ${entries}
   JOIN site_users u ON u.discord_id=?1 LEFT JOIN members m ON m.discord_id=u.discord_id
   WHERE s.key='appointed' AND ${supported} ${selected} AND a.value='<@'||?1||'>'${branch} ORDER BY role LIMIT ${authorityKeys?.length ?? MAX_OFFICES + LEADERSHIP_POSITION_KEYS.length}`).bind(id);
}

export async function projectOwnAppointmentPublications(env: Env, rows: unknown[]) {
  return (await Promise.all(rows.map(async raw => {
    const r = raw as ProofRow & { recorded_at: number; available: number };
    if (LEADERSHIP_POSITION_KEYS.includes(r.role)) {
      const p: unknown = JSON.parse(r.proofs), slot = LEADERSHIP_POSITIONS.find(p => p.key === r.role)!;
      if (!Number.isSafeInteger(r.recorded_at) || r.recorded_at < 0 || !leadershipPublication(p)) throw new FormError('privacy_copy_unconfirmed',503);
      if (p.pointer !== r.appointment || p.birth !== r.birth || !await verify(env.COOKIE_SECRET,LEADERSHIP_PROOF_PURPOSE,leadershipProofPayload(env.SITE_GUILD_ID??'',r.role,p),p.mac)) return null;
      return {role:r.role,kind:'branch_leadership' as const,branch:slot.branch,position:slot.position,officerIndex:slot.officerIndex,
        publication:'discord_profile_only',audience:'qualified_community_readers',currentlyPublished:r.available===1,recordedAt:secondsToIso(r.recorded_at)};
    }
    if (!APPOINTMENT_IDENTITY_ROLES.includes(r.role) || !Number.isSafeInteger(r.recorded_at) || r.recorded_at < 0) throw new FormError('privacy_copy_unconfirmed', 503);
    const currentSiteProof = await hasCurrentProof(env, r);
    if (!currentSiteProof && !await hasDiscordProfileProof(env, r)) return null;
    return { role: r.role, publication: currentSiteProof ? 'discord_profile_and_current_verified_characters' : 'discord_profile_only', audience: 'qualified_community_readers', currentlyPublished: r.available === 1, recordedAt: secondsToIso(r.recorded_at) };
  }))).filter(r => r !== null);
}

/** Caller must place this payload behind its ORIGINAL admitted reader. The map
 * and all target births/generations/standing are read in the same transaction. */
export function leadershipIdentitySnapshotStatement(env:Env):D1PreparedStatement {
  return env.DB.prepare(`SELECT s.value,s.updated_at,CASE WHEN ${leadershipEnvelopeSql('s.value')} THEN
   (SELECT json_group_array(json_object('slot',p.key,'id',substr(json_extract(p.value,'$.pointer'),3,length(json_extract(p.value,'$.pointer'))-3),
    'birth',u.account_incarnation,'generation',life.generation,'status',CASE WHEN ${allowedAccount("substr(json_extract(p.value,'$.pointer'),3,length(json_extract(p.value,'$.pointer'))-3)")}
     AND(life.subject_id IS NULL OR(typeof(life.generation)='text' AND length(life.generation)=32 AND life.generation NOT GLOB '*[^0-9a-f]*')) THEN 'eligible' ELSE 'unavailable' END))
    FROM json_each(s.value,'$.publications') p LEFT JOIN site_users u ON json_extract(p.value,'$.pointer')='<@'||u.discord_id||'>'
    LEFT JOIN members m ON json_extract(p.value,'$.pointer')='<@'||m.discord_id||'>'
    LEFT JOIN privacy_subjects life ON json_extract(p.value,'$.pointer')='<@'||life.subject_id||'>') ELSE '[]' END AS targets
   FROM site_settings s WHERE s.key='leadership'`);
}

/** Private source-issued capability to repeat a currently published office in a
 * caller's original atomic write. It is never returned in a member DTO. */
export interface PublishedOfficeAuthority { readonly officeKeys: readonly string[] }
type OfficeAuthorityRecord = { id: string; appointedValue: string; birth: string; generation: string | null };
const officeAuthorities = new WeakMap<PublishedOfficeAuthority, OfficeAuthorityRecord>();
export async function capturePublishedOfficeAuthority(env: Env, id: string, keys: readonly string[]): Promise<PublishedOfficeAuthority | null> {
  if (!/^[0-9]{17,20}$/.test(id) || !keys.length || keys.some(key => !APPOINTMENT_IDENTITY_ROLES.includes(key))) return null;
  const selected = [...new Set(keys)];
  const before = await ownPublicationStatement(env, id, selected).all<ProofRow & { available: number; appointed_value: string; generation: string | null }>();
  const found: string[] = [];
  for (const row of before.results) {
    if (keys.includes(row.role) && row.available === 1 && (await hasCurrentProof(env, row) || await hasDiscordProfileProof(env, row))) found.push(row.role);
  }
  if (!found.length) return null;
  // Crypto awaits do not authorize a changed map, recreated account or lifecycle.
  const after = await ownPublicationStatement(env, id, selected).all<ProofRow & { available: number; appointed_value: string; generation: string | null }>();
  if (JSON.stringify(before.results) !== JSON.stringify(after.results)) return null;
  const row = after.results[0];
  if (!row || typeof row.birth !== 'string' || !/^[0-9a-f]{32}$/.test(row.birth) || typeof row.appointed_value !== 'string'
    || row.generation !== null && (typeof row.generation !== 'string' || !/^[0-9a-f]{32}$/.test(row.generation))) return null;
  const authority = Object.freeze({ officeKeys: Object.freeze(found) });
  officeAuthorities.set(authority, Object.freeze({ id, appointedValue: row.appointed_value, birth: row.birth, generation: row.generation }));
  return authority;
}
/** This predicate alone is not write authority: combine it with the caller's
 * original Native session/CSRF admission in the SAME committing statement. */
export function publishedOfficeAuthorityCondition(authority: PublishedOfficeAuthority, firstParameter: number): { sql: string; values: readonly string[] } {
  const record = officeAuthorities.get(authority);
  if (!record || !Number.isSafeInteger(firstParameter) || firstParameter < 1 || firstParameter > 90) throw Error('published_office_authority_held');
  return { sql: `EXISTS(SELECT 1 FROM site_settings WHERE key='appointed' AND value=?${firstParameter})
    AND EXISTS(SELECT 1 FROM site_users u LEFT JOIN members m ON m.discord_id=u.discord_id
     WHERE u.discord_id=?${firstParameter + 1} AND u.account_incarnation=?${firstParameter + 2}
     AND ${activeAccount} AND ${privacyGenerationLiteralFenceSql('u.discord_id', record.generation)})`,
    values: Object.freeze([record.appointedValue, record.id, record.birth]) };
}
/** Presentation preference only. VIP alone is not a Broadcaster appointment. */
export async function canUseStreamShield(env: Env, id: string): Promise<boolean> {
  if (isSiteAdmin(env, id)) return true;
  try { return !!await capturePublishedOfficeAuthority(env, id, ['office_12']); } catch { return false; }
}
/** Lead Correspondent's editor authority still needs the captured predicate at
 * commit; a boolean in the page or boot state cannot authorize a news write. */
export async function canEditTownCrier(env: Env, id: string): Promise<boolean> {
  if (isSiteAdmin(env, id)) return true;
  try { return !!await capturePublishedOfficeAuthority(env, id, ['office_50']); } catch { return false; }
}

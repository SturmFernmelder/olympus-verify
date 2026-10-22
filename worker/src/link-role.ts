/**
 * Build .186 (Olympus Link, Phase 1a): the one writer of the Olympus Link role, LINK_ROLE_ID in GUILD_ID (the owner's
 * ruling of 21 Oct 2026: the role lives in Asmongold's server, where /verify lives). link-core calls it as promote() when a
 * proof is accepted and as demote() for the player's own "Delete my link"; nothing else calls it in this phase (the ban
 * and erasure hooks are Phase 1b). It is a new module beside roles.ts and role-settlements.ts and touches neither.
 *
 * It never throws. It answers { ok: true } or { ok: false, reason }, the shape link-core's promoted() reads
 * (link-core.mjs :597-610). link-core turns 'not-in-server' into "Join the Olympus Discord server first" and every other
 * failure into "Discord did not take the role change: try again in a minute" and undoes the link, so the code stays
 * usable. Upstream offers no other reason a page can show (the owner's ruling: use the closest existing value and add
 * nothing the page cannot show), so the eligibility refusals answer 'discord' and the real reason goes to the audit row.
 *
 * PUT (promote) is granted only when, in this order:
 *   1. the account is not verification-banned (members.banned) and its privacy subject is active (no privacy_subjects
 *      row, or state 'active': the house generation fence) -- one main-database read;
 *   2. the member is in GUILD_ID ('not-in-server' otherwise) and holds none of BLOCKING_ROLE_IDS -- one GET;
 *   3. LINK_ROLE_ID exists there with no permissions and is not managed (cached ten minutes per isolate, looked at again
 *      after any failed PUT) -- one GET;
 *   4. the PUT itself, with attempt=1: no sleeping retry on 429 (discord.ts rest()).
 * DELETE (demote) skips 1-3: a player's own delete is never held back by eligibility (it reads the privacy subject only
 * to fence its audit rows, and goes ahead when that read fails). A role that no longer exists
 * (404/10011) counts as removed. A call that ends without an HTTP status (timeout, abort) is reconciled with one GET of
 * the member and never sent again (the role-settlements.ts rule). DELETE remains unconfirmed even if that GET finds absence;
 * it does not prove a delayed DELETE has ended. The core retains its persistent admission guard in that case.
 * A documented terminal 400/401/403/404/405/429 instead carries internal notApplied evidence, so core may release
 * only that admission without cleanup or an automatic resend. Server failures remain uncertain.
 *
 * Audit rows are written only here, so only while Link is on, and carry the Discord status and code, never a message.
 * A row that names the player goes through audit()'s privacy reference (db.ts): the subject's generation is read first
 * (with the eligibility on PUT, by itself on DELETE) and the INSERT happens only while that generation is still the
 * active one, as restore.ts and dm.ts write theirs. So a retiring or erased account, or one erased meanwhile, never gets
 * a new row naming it; the 'inactive' refusal writes none at all. A fault of the server's own configuration
 * (link.role_misconfigured) names no player.
 */
import type { Env } from './env';
import { audit, type PrivacyReference } from './db';
import { DiscordError, rest } from './discord';
import { linkState } from './link';
import { errorRef } from './log';
import { readPrivacySubject, type PrivacySubject } from './privacy-serving-authority';

export type LinkRoleResult = { ok: true } | { ok: false; reason: 'not-in-server' | 'discord'; notApplied?: true };

const OK: LinkRoleResult = Object.freeze({ ok: true });
const NOT_IN_SERVER: LinkRoleResult = Object.freeze({ ok: false, reason: 'not-in-server' });
const REFUSED: LinkRoleResult = Object.freeze({ ok: false, reason: 'discord' });
// Internal terminal no-application evidence; not a new public page reason and never inferred from transport errors.
const NOT_APPLIED: LinkRoleResult = Object.freeze({ ok: false, reason: 'discord', notApplied: true });
const SNOWFLAKE = /^\d{17,20}$/;
const AUDIT_REASON = 'olympus-verify: Olympus Link';
const ROLE_CHECK_MS = 10 * 60 * 1000;

/** The last good check of the role's configuration in this isolate: (guild, role) and until when it holds. */
let roleChecked: { key: string; until: number } | null = null;

function discordCode(e: DiscordError): number | null {
  try {
    const code = (JSON.parse(e.body) as { code?: unknown }).code;
    return typeof code === 'number' && Number.isSafeInteger(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * An audit row about the player, fenced by the privacy reference read before the effect: audit() inserts it only while
 * the subject is still absent (capture null) or still active in the captured generation. No reference (it could not be
 * read): no row, since nothing could fence it.
 */
async function note(env: Env, action: string, ref: PrivacyReference | null, details: Record<string, unknown>): Promise<void> {
  if (!ref) return;
  try {
    await audit(env, 'system', action, ref.subject, details, ref);
  } catch (e) {
    console.error('olympus-link audit not written', errorRef(e));
  }
}
/** An audit row about the server's own configuration: it names no player. */
async function noteServer(env: Env, action: string, details: Record<string, unknown>): Promise<void> {
  try {
    await audit(env, 'system', action, undefined, details);
  } catch (e) {
    console.error('olympus-link audit not written', errorRef(e));
  }
}

type Eligibility = { why: 'banned' | 'inactive' | null; ref: PrivacyReference };
/** The ban and the privacy subject (state and generation), in one statement: why the account may not get the role
 * (null when it may), and the reference that fences any audit row about it. */
async function eligibility(env: Env, discordId: string): Promise<Eligibility> {
  const row = await env.DB.prepare('SELECT (SELECT banned FROM members WHERE discord_id = ?1) AS banned, (SELECT subject_id FROM privacy_subjects WHERE subject_id = ?1) AS subject, '
    + '(SELECT generation FROM privacy_subjects WHERE subject_id = ?1) AS subjectGeneration, (SELECT state FROM privacy_subjects WHERE subject_id = ?1) AS state, '
    + '(SELECT revision FROM privacy_subjects WHERE subject_id = ?1) AS revision')
    .bind(discordId)
    .first<{ banned: number | null; subject: string | null; subjectGeneration: string | null; state: string | null; revision: number | null }>();
  if (!row) throw new Error('link_eligibility_unread');
  let capture: PrivacySubject | null = null;
  if (row.subject !== null && row.subject !== undefined) {
    if (row.subject !== discordId || typeof row.subjectGeneration !== 'string' || !/^[0-9a-f]{32}$/.test(row.subjectGeneration)
      || (row.state !== 'active' && row.state !== 'retiring' && row.state !== 'retired') || !Number.isSafeInteger(row.revision)) throw new Error('link_privacy_subject_invalid');
    capture = Object.freeze({ subject: discordId, subjectGeneration: row.subjectGeneration, state: row.state, revision: row.revision as number });
  }
  const ref: PrivacyReference = { subject: discordId, capture };
  if (capture && capture.state !== 'active') return { why: 'inactive', ref }; // first: no row may name it, banned or not
  if (row.banned) return { why: 'banned', ref };
  return { why: null, ref };
}
/** DELETE: the reference alone (readPrivacySubject), or null when it cannot be read; the removal goes ahead either way. */
async function deleteReference(env: Env, discordId: string): Promise<PrivacyReference | null> {
  try {
    return { subject: discordId, capture: await readPrivacySubject(env, discordId) };
  } catch (e) {
    console.error('olympus-link subject not read', errorRef(e));
    return null;
  }
}

/** The member's roles in GUILD_ID, or null when they are not in the server (404 Unknown Member). */
async function memberRoles(env: Env, discordId: string): Promise<string[] | null> {
  try {
    const m = await rest<{ roles?: unknown; user?: { id?: unknown } }>(env, 'GET', `/guilds/${env.GUILD_ID}/members/${discordId}`, undefined, 1);
    if (!m || !Array.isArray(m.roles) || m.user?.id !== discordId) throw new Error('link_member_unreadable');
    return m.roles.filter((r): r is string => typeof r === 'string');
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404 && discordCode(e) === 10007) return null;
    throw e;
  }
}

const blocked = (env: Env, roles: string[]) => (env.BLOCKING_ROLE_IDS ?? '').split(',').map((r) => r.trim()).some((r) => r && roles.includes(r));

/**
 * LINK_ROLE_ID exists in GUILD_ID with permissions "0" and managed false; otherwise one audit row (naming no player:
 * it is the server's configuration) and false. A good answer is kept ten minutes per isolate, and forgotten as soon as
 * a PUT fails, so the next promote looks again.
 */
async function roleConfigured(env: Env): Promise<boolean> {
  const role = env.LINK_ROLE_ID!, key = `${env.GUILD_ID}:${role}`;
  if (roleChecked && roleChecked.key === key && roleChecked.until > Date.now()) return true;
  const roles = await rest<unknown>(env, 'GET', `/guilds/${env.GUILD_ID}/roles`, undefined, 1);
  const found = Array.isArray(roles) ? (roles as Array<{ id?: unknown; permissions?: unknown; managed?: unknown }>).find((r) => r && r.id === role) : undefined;
  const problem = !found ? 'missing' : found.managed !== false ? 'managed' : found.permissions !== '0' ? 'permissions' : null;
  if (problem) {
    roleChecked = null;
    await noteServer(env, 'link.role_misconfigured', { role, problem });
    return false;
  }
  roleChecked = { key, until: Date.now() + ROLE_CHECK_MS };
  return true;
}

/** No HTTP status came back: one diagnostic GET, never a resend. DELETE remains uncertain even if absent. */
async function reconcile(env: Env, method: 'PUT' | 'DELETE', discordId: string, ref: PrivacyReference | null): Promise<LinkRoleResult> {
  let roles: string[] | null;
  try {
    roles = await memberRoles(env, discordId);
  } catch (e) {
    await note(env, 'link.role_unconfirmed', ref, { method, status: e instanceof DiscordError ? e.status : null });
    return REFUSED;
  }
  // Absence cannot prove a timed-out DELETE has drained; a delayed DELETE could remove a later PUT.
  if (method === 'DELETE') {
    await note(env, 'link.role_unconfirmed', ref, { method, status: null });
    return REFUSED;
  }
  if (roles === null) return NOT_IN_SERVER;
  const has = roles.includes(env.LINK_ROLE_ID!);
  if (has) return OK;
  await note(env, 'link.role_unconfirmed', ref, { method, status: null });
  return REFUSED;
}

async function write(env: Env, method: 'PUT' | 'DELETE', discordId: string, ref: PrivacyReference | null): Promise<LinkRoleResult> {
  try {
    await rest(env, method, `/guilds/${env.GUILD_ID}/members/${discordId}/roles/${env.LINK_ROLE_ID}`, undefined, 1, AUDIT_REASON);
    return OK;
  } catch (e) {
    if (method === 'PUT') roleChecked = null; // the role may have changed (moved above the bot, given a permission): look again next time
    if (!(e instanceof DiscordError)) return reconcile(env, method, discordId, ref);
    const code = discordCode(e);
    if (e.status === 404 && code === 10007) return NOT_IN_SERVER;
    if (method === 'DELETE' && e.status === 404 && code === 10011) return OK; // the role itself was deleted: nothing to remove
    await note(env, 'link.role_failed', ref, { method, status: e.status, code });
    if (method === 'DELETE' && [400, 401, 403, 404, 405, 429].includes(e.status)) return NOT_APPLIED;
    return REFUSED;
  }
}

/** Grant (PUT) or remove (DELETE) the Olympus Link role. Never throws. */
export async function linkRole(env: Env, method: 'PUT' | 'DELETE', discordId: string): Promise<LinkRoleResult> {
  let ref: PrivacyReference | null = null;
  try {
    if (linkState(env) !== 'on' || (method !== 'PUT' && method !== 'DELETE') || typeof discordId !== 'string' || !SNOWFLAKE.test(discordId)) return REFUSED;
    if (method === 'PUT') {
      const checked = await eligibility(env, discordId);
      ref = checked.ref;
      if (checked.why === 'inactive') return REFUSED; // a retiring or erased account: no row may name it
      if (checked.why) {
        await note(env, 'link.promote_refused', ref, { why: checked.why });
        return REFUSED;
      }
      const roles = await memberRoles(env, discordId);
      if (roles === null) return NOT_IN_SERVER;
      if (blocked(env, roles)) {
        await note(env, 'link.promote_refused', ref, { why: 'blocking_role' });
        return REFUSED;
      }
      if (!(await roleConfigured(env))) return REFUSED;
    } else {
      ref = await deleteReference(env, discordId);
    }
    return await write(env, method, discordId, ref);
  } catch (e) {
    console.error('olympus-link role not changed', method, errorRef(e));
    if (linkState(env) === 'on') await note(env, 'link.role_failed', ref, { method, status: e instanceof DiscordError ? e.status : null, code: e instanceof DiscordError ? discordCode(e) : null });
    return REFUSED;
  }
}

/** Tests only: forget the cached role check. */
export function resetLinkRoleCache(): void {
  roleChecked = null;
}

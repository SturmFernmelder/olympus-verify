/**
 * Live Link membership (candidate, OFF): a GUID-version Olympus Link (OLB6) that a High Councillor's addon observed
 * gives Guild Member through the central writer (role-settlements.ts queueAndSettleLiveLinkMembership), once.
 *
 * Shipped OFF. `captureLiveLinkMembership` is synchronous and reads own data properties only:
 *   off   LINK_MEMBERSHIP_ENABLED absent, "" or "false";
 *   on    exactly "true", Link itself on (linkState), a canonical LINK_MEMBERSHIP_SCOPE naming the flagship guild, and
 *         VERIFY_NATIVE_SCOPE (when valid) naming the same guild;
 *   held  anything else.
 * Nothing here edits the generated core or calls its acceptProof, linkRole or logProof: LINK_DB codes and keys are only READ
 * (checkProof). The one-use state is a per-code site_settings marker (keyed by a hash of the request tag, expiring) that holds no account. docs/olympus-link.md is the operator's page.
 */
import type { Env } from './env';
import { errorRef } from './log';
import { isApprovedNativeGuildName, isFlagshipGuildName } from './guild-affiliation229';
import { parseLaunchNativeScope, captureLaunchVerification } from './launch-verification227';
import { linkState, linkEnv, linkCors, loadLinkCore } from './link';
import { normalizeCharacter } from './codes';
import { admittedPrivacySubjectWrite, privacyGenerationFenceSql, privacyProviderCustodyDatabase, readPrivacySubject, type PrivacySubject } from './privacy-serving-authority';

export const LIVE_LINK_PURPOSE = 'live_link_membership';
export const LIVE_LINK_PROFILE = 'live-link-v1';
export const LIVE_LINK_PREFIX = 'livelink:';
export const LIVE_LINK_SETTINGS_FILTER = "(key < 'livelink:' OR key >= 'livelink;')";
/** A link is taken for membership until its code's expiry plus one day (upstream's cosmetic path allows seven). */
export const LIVE_LINK_SUBMIT_GRACE = 86400;
/** The line between the Link block and the whisper reply in /verify when membership is on. */
export const LIVE_LINK_FALLBACK = "Can't use Olympus Link right now? Whisper instead:"; // link.ts keeps the same text (it cannot import this module statically)
const LIVE_LINK_DEADLINE = 300;

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const GUID = /^Player-([1-9][0-9]{0,5})-[0-9A-F]{8}$/;
const SERVER = /^[1-9][0-9]{0,5}$/;
const REQUEST_TAG = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------------------------------------------------
// The gate

export type LiveLinkScope = Readonly<{ version: 1; guild: string; faction: 'Alliance' | 'Horde'; servers: readonly string[] }>;
export type LiveLinkGate = Readonly<{ mode: 'off' | 'held' | 'on'; reason: string; scope: LiveLinkScope | null; guildId: string | null; check: () => boolean }>;
const GATE_KEYS = ['LINK_MEMBERSHIP_ENABLED', 'LINK_MEMBERSHIP_SCOPE', 'VERIFY_NATIVE_SCOPE', 'GUILD_ID', 'LINK_ENABLED'] as const;

/** Canonical JSON only: {"version":1,"guild":…,"faction":"Alliance|Horde","servers":["4613",…]}. */
export function parseLiveLinkScope(raw: unknown): LiveLinkScope | null {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'faction,guild,servers,version' || v.version !== 1) return null;
    if (!isApprovedNativeGuildName(v.guild) || !isFlagshipGuildName(v.guild) || (v.faction !== 'Alliance' && v.faction !== 'Horde')) return null;
    if (!Array.isArray(v.servers) || v.servers.length < 1 || v.servers.length > 16 || !v.servers.every((s: unknown) => typeof s === 'string' && SERVER.test(s)) || new Set(v.servers).size !== v.servers.length) return null;
    if (JSON.stringify({ version: 1, guild: v.guild, faction: v.faction, servers: v.servers }) !== raw) return null;
    return Object.freeze({ version: 1, guild: v.guild, faction: v.faction, servers: Object.freeze([...v.servers]) });
  } catch { return null; }
}

function dataSlot(env: Env, key: string): { present: boolean; ok: boolean; value: unknown } {
  const d = env && typeof env === 'object' ? Object.getOwnPropertyDescriptor(env, key) : undefined;
  if (!d) return { present: false, ok: !(env && key in env), value: undefined };
  return { present: true, ok: Object.hasOwn(d, 'value'), value: d.value };
}

export function captureLiveLinkMembership(env: Env): LiveLinkGate {
  const slots = GATE_KEYS.map(k => ({ k, d: env && typeof env === 'object' ? Object.getOwnPropertyDescriptor(env, k) : undefined }));
  const proto = env && typeof env === 'object' ? Object.getPrototypeOf(env) : null;
  const check = (): boolean => {
    try {
      if (Object.getPrototypeOf(env) !== proto) return false;
      for (const { k, d } of slots) {
        const a = Object.getOwnPropertyDescriptor(env, k);
        if (d === undefined ? !!a || k in env : !a || !Object.hasOwn(a, 'value') || !Object.hasOwn(d, 'value') || !Object.is(a.value, d.value)) return false;
      }
      return true;
    } catch { return false; }
  };
  const out = (mode: LiveLinkGate['mode'], reason: string, scope: LiveLinkScope | null = null, guildId: string | null = null): LiveLinkGate => Object.freeze({ mode, reason, scope, guildId, check });
  try {
    const flag = dataSlot(env, 'LINK_MEMBERSHIP_ENABLED');
    if (!flag.ok) return out('held', 'flag_shape');
    if (!flag.present || flag.value === undefined || flag.value === '' || flag.value === 'false') return out('off', 'flag_off');
    if (flag.value !== 'true') return out('held', 'flag_value');
    if (linkState(env) !== 'on') return out('held', 'link_not_on');
    const raw = dataSlot(env, 'LINK_MEMBERSHIP_SCOPE');
    const scope = raw.ok && raw.present ? parseLiveLinkScope(raw.value) : null;
    if (!scope) return out('held', 'scope');
    const native = dataSlot(env, 'VERIFY_NATIVE_SCOPE');
    if (!native.ok) return out('held', 'native_scope_shape');
    const parsed = native.present ? parseLaunchNativeScope(native.value) : null;
    if (parsed && parsed.guild !== scope.guild) return out('held', 'scope_disagrees');
    const guild = dataSlot(env, 'GUILD_ID');
    if (!guild.ok || typeof guild.value !== 'string' || !SNOWFLAKE.test(guild.value)) return out('held', 'guild_id');
    return out('on', 'on', scope, guild.value);
  } catch { return out('held', 'gate_error'); }
}

/** /verify asks only this: the Link block goes first exactly when membership is on. */
export const liveLinkMembershipOn = (env: Env): boolean => captureLiveLinkMembership(env).mode === 'on';

// ---------------------------------------------------------------------------------------------------------------------
// The state row

export type LiveLinkState = 'consumed' | 'settled' | 'held';
export type LiveLinkRecord = Readonly<{ v: 1; state: LiveLinkState; reason: string; createdAt: number; updatedAt: number; expiresAt: number }>;
const RECORD_KEYS = 'createdAt,expiresAt,reason,state,updatedAt,v';
/** The marker outlives its code's refusal window (expiry plus the submit grace) by one day, then is deleted. */
export const LIVE_LINK_MARKER_TTL = 86400;

/**
 * The one-use marker's key: a hash of the request tag (the code's own random identifier), never the account. The value holds
 * no account, name, character, GUID, code or signature, and nothing derived from the tag or from the settlement fingerprint: only a state, times and an expiry. It keeps no
 * subject identifier, it is deleted once its code can no longer be submitted, and so the Native erasure job (whose statement
 * budget is exactly full) has nothing of the subject to erase here. The account is recorded only in rows that are already
 * account data: the character binding and role_settlements.
 */
export async function liveLinkKey(R: string): Promise<string> {
  if (!REQUEST_TAG.test(R)) throw Error('live_link_tag_held');
  return LIVE_LINK_PREFIX + await sha256Hex(`live-link|v1|key|${R}`);
}
export function parseLiveLinkRecord(raw: unknown): LiveLinkRecord | null {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  let r: Record<string, unknown>;
  try { r = JSON.parse(raw); } catch { return null; }
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).sort().join(',') !== RECORD_KEYS || r.v !== 1
    || !['consumed', 'settled', 'held'].includes(r.state as string) || typeof r.reason !== 'string' || r.reason.length > 64
    || !Number.isSafeInteger(r.createdAt) || (r.createdAt as number) < 1 || !Number.isSafeInteger(r.updatedAt) || (r.updatedAt as number) < (r.createdAt as number)
    || !Number.isSafeInteger(r.expiresAt) || (r.expiresAt as number) <= (r.createdAt as number)) return null;
  return Object.freeze(r) as unknown as LiveLinkRecord;
}
// Not in the community registry (registerCommunityData), by design: the marker is keyed by the code, not the account, holds
// no subject identifier and expires, so there is nothing of the account to export or erase here. A registered family would
// add a statement to the Native erasure job, whose budget (196 statements) is full, and change the exact namespace list
// that closed recovery checks. The character binding and the role record are ordinary account data, exported and erased
// with the account like any other. If Fern rules a code-keyed marker personal, it needs a registered family (docs 5a).

// ---------------------------------------------------------------------------------------------------------------------
// The original consumption: minted only by the batch below, spent by the central writer once

declare const liveBrand: unique symbol;
export type OriginalLiveLinkConsumption = Readonly<{ [liveBrand]: true }>;
export type LiveLinkFacts = Readonly<{ subject: string; subjectGeneration: string | null; fingerprint: string; deadline: number; admittedAt: number; op: string; stateKey: string;
  source: Readonly<{ snapshotId: null; guid: string; nameKey: string }>; createdAt: number }>;
type Saved = { facts: LiveLinkFacts; db: D1Database; check: () => void; values: readonly (string | number | null)[] };
const originals = new WeakMap<OriginalLiveLinkConsumption, Saved>();
const LIVE_CONFIG = ['LINK_ENABLED', 'LINK_MEMBERSHIP_ENABLED', 'LINK_MEMBERSHIP_SCOPE', 'CANONICAL_ENTITLEMENTS233', 'CANONICAL_RANKS233', 'GUILD_ID', 'ROLE_GUILD_MEMBER',
  'VERIFY_MEMBERSHIP_ONLY', 'VERIFY_NATIVE_SCOPE', 'VERIFY_SECRET', 'LINKS_NOT_BEFORE', 'LINKS_NOT_BEFORE_CLOCK_GATED', 'PRIVACY_WRITE_ADMISSION_ENABLED',
  'PRIVACY_WRITE_ADMISSION_LAYOUT', 'PRIVACY_WRITE_ADMISSION_EPOCH', 'SHARED_MEMBERSHIP230_MODE', 'SHARED_MEMBERSHIP230_CLOSURE_JSON', 'SHARED_MEMBERSHIP230_CLOSURE_SHA256',
  'PRIVACY_ERASURE_ENABLED', 'PRIVACY_NATIVE_ERASURE_ENABLED', 'MEMBERSHIP_ROLE_SETTLEMENT_ENABLED', 'QR_PHASE1_ENABLED', 'DISCORD_APP_ID', 'DISCORD_BOT_TOKEN',
  'BLOCKING_ROLE_IDS', 'ROLE_OFFICER', 'ROLE_MODERATOR', 'ROLE_GUILD_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_RAID_LEADER', 'LINK_ROLE_ID', 'MEMBERSHIP_RETIRED_ROLE_ID',
  'QR_NATIVE_ROLE_MAP', 'FULL_RELEASE_ROLES', 'INTROS_ROLES', 'TREASURY_COSMETIC_ROLES', 'BETA_RESET_SOURCE_EPOCH', 'BETA_RESET_DISPATCH_SEAL_MODE',
  'BETA_RESET_REMOVALS_ENABLED', 'ROLE_CALL_BUDGET'] as const;
function held(): never { throw Error('live_link_held'); }
function slotWitness(object: object, keys: readonly string[]): () => void {
  const proto = Object.getPrototypeOf(object), slots = keys.map(k => Object.getOwnPropertyDescriptor(object, k));
  const check = () => {
    if (Object.getPrototypeOf(object) !== proto) held();
    for (let n = 0; n < keys.length; n++) {
      const a = slots[n], b = Object.getOwnPropertyDescriptor(object, keys[n]!);
      if (a === undefined) { if (b || keys[n]! in object) held(); }
      else if (!Object.hasOwn(a, 'value') || !b || !Object.hasOwn(b, 'value') || ['value', 'writable', 'enumerable', 'configurable'].some(k => !Object.is(a[k as keyof PropertyDescriptor], b[k as keyof PropertyDescriptor]))) held();
    }
  };
  check(); return check;
}
export function assertLiveLinkOriginal(env: Env, cap: OriginalLiveLinkConsumption): void {
  const saved = originals.get(cap), database = env && typeof env === 'object' ? Object.getOwnPropertyDescriptor(env, 'DB') : undefined;
  if (!saved || !database || !Object.hasOwn(database, 'value') || database.value !== saved.db) held();
  saved.check();
}
export function liveLinkFacts(cap: OriginalLiveLinkConsumption): LiveLinkFacts {
  const saved = originals.get(cap); if (!saved) held(); saved.check(); return saved.facts;
}
/** The consuming state row is still this very consumption, the character is bound to this account and GUID, and the deadline holds. */
export function liveLinkPredicate(env: Env, cap: OriginalLiveLinkConsumption, start = 1): Readonly<{ sql: string; values: readonly (string | number | null)[]; next: number }> {
  assertLiveLinkOriginal(env, cap);
  if (!Number.isSafeInteger(start) || start < 1 || start > 75) held();
  const saved = originals.get(cap)!, at = (n: number) => '?' + (start + n), f = saved.facts;
  return Object.freeze({
    sql: `EXISTS(SELECT 1 FROM site_settings s WHERE s.key=${at(0)} AND json_valid(s.value) AND json_extract(s.value,'$.state')='consumed' AND json_extract(s.value,'$.createdAt')=${at(1)})
    AND ${privacyGenerationFenceSql(start + 2, start + 3)}
    AND EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=${at(2)} AND c.name_key=${at(4)} AND c.guid=${at(5)} AND c.status IN('verified','member'))
    AND (SELECT COUNT(*) FROM characters WHERE guid=${at(5)} AND status IN('verified','queued','member','left_pending'))=1
    AND ${at(6)}>CAST(strftime('%s','now') AS INTEGER)`,
    values: Object.freeze([f.stateKey, f.createdAt, f.subject, f.subjectGeneration, f.source.nameKey, f.source.guid, f.deadline]),
    next: start + 7,
  });
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (text: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
/** First 32 hex of SHA-256('live-link|v1|op|' + R): one per code. It feeds only the settlement fingerprint and is never stored in the marker. */
export const liveLinkOp = async (R: string) => (await sha256Hex(`live-link|v1|op|${R}`)).slice(0, 32);

// ---------------------------------------------------------------------------------------------------------------------
// POST /proof for an OLB6 link

type Core = {
  proofText(input: unknown): string | null;
  parseBundle(text: string): { ok: boolean; bundle?: { version?: number; guid?: string; requester: string; guild: string; faction: string; R: string } };
  checkProof(env: Readonly<Record<string, unknown>>, text: string, opts: { discordId?: string; t?: number }): Promise<Record<string, unknown>>;
  tooManyRequests(env: Readonly<Record<string, unknown>>, who: { ip?: string | null; discordToken?: string }, t?: number): Promise<boolean>;
  tooManyProofs(env: Readonly<Record<string, unknown>>, id: string, t?: number): Promise<boolean>;
  discordUser(token: string, o: { clientId?: unknown; fetchImpl: unknown }): Promise<{ ok: boolean; user?: { id: string }; [k: string]: unknown }>;
  respond(answer: unknown, headers?: Record<string, string>, status?: number): Response;
  failure(reason: string, message: string): unknown;
  reject(reason: string, message: string, R?: string): unknown;
  bearer(request: Request): string;
  sameSecret(given: string, expected: string): Promise<boolean>;
};

const MESSAGES: Record<string, string> = {
  'membership-off': 'Guild Member is not given through Olympus Link yet.',
  'name-only': 'This link was made by an older Olympus_Link, which cannot give Guild Member.',
  'guid-unobserved': 'No High Councillor saw this character in the guild roster. Get a new code and try again while one is online.',
  'guild-scope': 'Guild Member is for characters of the main guild.',
  'guid-mismatch': 'The guild roster lists this character under another ID. The High Council needs to look at it.',
  blocked: 'This account or character cannot be given Guild Member.',
  'linked-elsewhere': 'This character is linked to another account.',
  'member-pending': 'A link for this account is still being settled.',
  'member-already': 'This account is already Guild Member through Olympus Link.',
  member: 'Sanctioned by the High Council: you are Guild Member.',
  expired: 'This code is too old to give Guild Member. Run /verify again for a new one.',
  'code-used': 'This code was already used.',
};

/** True when `text` is an OLB6 link, or an OLB5 one while membership is on (it is refused there as name-only, with no write):
 * the only thing routeProof needs to hand the request over. Never throws. */
export function isLiveLinkBody(core: Pick<Core, 'proofText'>, body: string, olb5 = false): boolean {
  try {
    const j = JSON.parse(body);
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.forget === true || typeof j.text !== 'string') return false;
    const t = core.proofText(j.text);
    return typeof t === 'string' && (t.startsWith('OLB6~') || (olb5 && t.startsWith('OLB5~')));
  } catch { return false; }
}

export async function routeLiveLinkMembership(request: Request, env: Env, cors: Record<string, string>, body: string): Promise<Response> {
  const core = (await loadLinkCore()) as unknown as Core;
  const headers = cors;
  const send = (answer: unknown, status?: number) => core.respond(answer, headers, status);
  const refuse = (reason: string, R?: string) => send(core.reject(reason, MESSAGES[reason] ?? 'Not linked.', R));
  try {
    const lenv = linkEnv(env);
    if (lenv.LINK_SITE_TOKEN && !(await core.sameSecret(core.bearer(request), String(lenv.LINK_SITE_TOKEN)))) return send(core.failure('site', 'This page is not allowed to send links right now.'));
    if (body.length > 8 * 1024) return send(core.reject('format', 'This request is too large.'));
    let j: Record<string, unknown>;
    try { j = JSON.parse(body); } catch { return send(core.failure('format', 'Send {"text": "<the link>", "discordToken": "<the Discord sign-in>"}.')); }
    if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.discordToken !== 'string' || typeof j.text !== 'string') return send(core.failure('format', 'Send {"text": "<the link>", "discordToken": "<the Discord sign-in>"}.'));
    const text = core.proofText(j.text);
    const parsed = text ? core.parseBundle(text) : null;
    if (!text || !parsed || !parsed.ok || !parsed.bundle) return send(core.reject('format', 'This is not a complete Olympus link.'));
    if (parsed.bundle.version !== 6) return refuse('name-only', parsed.bundle.R);

    // 1. Membership is a separate switch: off, or held, answers before Discord, LINK_DB or the bot's database are touched.
    const gate = captureLiveLinkMembership(env);
    if (gate.mode !== 'on' || !gate.scope || !gate.guildId) return refuse('membership-off', parsed.bundle.R);
    // The venue (the qualified shared Guild Member role writer) must be enabled before anything is consumed.
    const venueSel = await (await import('./shared-membership-cutover230')).captureRuntimeVenue230(env);
    if (venueSel.mode !== 'enabled') return refuse('membership-off', parsed.bundle.R);

    const t = Math.floor(Date.now() / 1000);
    if (await core.tooManyRequests(lenv, { ip: request.headers.get('CF-Connecting-IP'), discordToken: j.discordToken }, t)) return send(core.failure('limit', 'Too many tries: wait a while and send it again.'));
    const { credentialFetch } = await import('./discord');
    const who = await core.discordUser(j.discordToken, { clientId: lenv.DISCORD_CLIENT_ID, fetchImpl: credentialFetch });
    if (!who.ok || !who.user) return send(who);
    const subject = who.user.id;
    if (!SNOWFLAKE.test(subject)) return send(core.failure('login', 'Sign in with Discord again.'));
    if (await core.tooManyProofs(lenv, subject, t)) return send(core.failure('limit', 'Too many tries: wait a while and send it again.'));

    // 2. The read-only verdict: LINK_DB's codes and keys are the single source of R, the tag and the councillors.
    const verdict = await core.checkProof(lenv, text, { discordId: subject, t });
    if (verdict.ok !== true) return send(verdict);
    const R = String(verdict.R ?? parsed.bundle.R);
    if (verdict.already === true) return refuse('code-used', R);
    if (verdict.version !== 6 || typeof verdict.guid !== 'string' || !GUID.test(verdict.guid)) return refuse('name-only', R);
    const guid = verdict.guid, character = String(verdict.character), guild = String(verdict.guild), faction = String(verdict.faction);

    // 3. A submitted link is good for the code's expiry plus one day.
    const codeRow = await (lenv.LINK_DB as D1Database).prepare('SELECT exp FROM codes WHERE r = ?').bind(R).first<{ exp: number }>();
    if (!codeRow || !Number.isSafeInteger(codeRow.exp)) return refuse('expired', R);
    if (t > codeRow.exp + LIVE_LINK_SUBMIT_GRACE) return refuse('expired', R);

    // 4. Only a GUID that a councillor's own guild roster listed counts.
    if (verdict.guidObserved !== true) return refuse('guid-unobserved', R);

    // 5. Main guild, faction and server.
    const server = GUID.exec(guid)![1]!;
    if (guild !== gate.scope.guild || faction !== gate.scope.faction || !gate.scope.servers.includes(server)) return refuse('guild-scope', R);

    // 6. Account and character standing, from the bot's database.
    const nameKey = normalizeCharacter(character);
    if (!nameKey) return refuse('format', R);
    const standing = await env.DB.prepare(`SELECT
      EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) OR EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND denied=1)
        OR EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?1 AND state='reapply') AS blocked,
      EXISTS(SELECT 1 FROM characters WHERE (name_key=?2 OR guid=?3) AND discord_id<>?1 AND status IN('verified','queued','member','left','left_pending')) AS elsewhere`)
      .bind(subject, nameKey, guid).first<{ blocked: number; elsewhere: number }>();
    if (!standing) throw Error('live_link_standing_unread');
    if (standing.blocked) return refuse('blocked', R);
    if (standing.elsewhere) return refuse('linked-elsewhere', R);

    // 7. GUID wins over name, but a roster that lists the name under another GUID holds the request.
    const roster = await env.DB.prepare(`SELECT m.guid AS guid FROM roster_members m WHERE m.name_key=?1
      AND m.snapshot_id=(SELECT s.id FROM roster_snapshots s WHERE s.complete=1 AND s.trusted=1 ORDER BY s.id DESC LIMIT 1)`).bind(nameKey).first<{ guid: string | null }>();
    if (roster && roster.guid && roster.guid !== guid) return refuse('guid-mismatch', R);

    // 8. Read back before any write: this code's marker, then the account's own settlement record.
    const stateKey = await liveLinkKey(R), op = await liveLinkOp(R);
    const already = (): Response => send({ ok: true, status: 'linked', reason: 'member-already', message: MESSAGES['member-already'], R, character, guild, faction, characters: [character] });
    const readBack = async (): Promise<Response | null> => {
      const raw = await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(stateKey).first<{ value: string }>();
      if (raw) {
        const prior = parseLiveLinkRecord(raw.value);
        if (!prior) return refuse('member-pending', R);
        return prior.state === 'settled' ? already() : refuse('member-pending', R); // consumed or held: this same link is not retried
      }
      // Another code for an account that already has (or is being given) the role: role_settlements is the account's record.
      const own = await env.DB.prepare(`SELECT
        EXISTS(SELECT 1 FROM role_settlements WHERE subject=?1 AND purpose=?2 AND desired=1 AND state='settled') AS settled,
        EXISTS(SELECT 1 FROM role_settlements WHERE subject=?1 AND purpose=?2 AND desired=1 AND state IN('pending','dispatching','unknown')) AS open`)
        .bind(subject, LIVE_LINK_PURPOSE).first<{ settled: number; open: number }>();
      if (!own) throw Error('live_link_standing_unread');
      if (own.settled) return already();
      if (own.open) return refuse('member-pending', R);
      return null;
    };
    const first = await readBack();
    if (first) return first;

    // Markers whose code can no longer be submitted are deleted (bounded, best effort; a failure changes nothing else).
    try {
      await env.DB.prepare(`DELETE FROM site_settings WHERE key IN(SELECT key FROM site_settings WHERE key>='livelink:' AND key<'livelink;'
        AND json_valid(value) AND json_extract(value,'$.expiresAt')<?1 LIMIT 50)`).bind(t).run();
    } catch (e) { console.error('olympus-link live membership expiry', errorRef(e)); }

    // 9. Consume, once: the state row, the account row and the character binding in one admitted batch.
    const capture: PrivacySubject | null = await readPrivacySubject(env, subject);
    const generation = capture?.subjectGeneration ?? null;
    const fingerprint = await sha256Hex(`live-link-request|v1|${op}|${subject}|${guid}`);
    const expiresAt = Math.max(t, codeRow.exp) + LIVE_LINK_SUBMIT_GRACE + LIVE_LINK_MARKER_TTL;
    const value = JSON.stringify({ v: 1, state: 'consumed', reason: 'consumed', createdAt: t, updatedAt: t, expiresAt });
    const refused = (n: string) => `json_extract('${n}','$')`;
    let done: D1Result[];
    try {
      done = await admittedPrivacySubjectWrite(env, subject, capture, [
        env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM site_settings WHERE key=?1)
          AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND purpose=?3 AND desired=1 AND state IN('settled','pending','dispatching','unknown'))
          THEN 1 ELSE ${refused('live_link_state_refused')} END AS admitted`).bind(stateKey, subject, LIVE_LINK_PURPOSE),
        env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM characters WHERE (name_key=?1 OR guid=?2) AND discord_id<>?3 AND status IN('verified','queued','member','left','left_pending'))
          AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?3 AND banned=1) AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?3 AND denied=1)
          AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=?3 AND state='reapply') THEN 1 ELSE ${refused('live_link_standing_refused')} END AS admitted`).bind(nameKey, guid, subject),
        env.DB.prepare('INSERT INTO members (discord_id) VALUES (?1) ON CONFLICT(discord_id) DO NOTHING').bind(subject),
        env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?1,?2,?3,NULL)
          RETURNING key,CAST(strftime('%s','now') AS INTEGER) AS admitted_at`).bind(stateKey, value, t),
        env.DB.prepare(`INSERT INTO characters (name_key, name, discord_id, status, bound_at, verified_at, source, guid)
          SELECT ?1, ?2, ?3, 'verified', ?4, ?4, 'link', ?5 WHERE EXISTS (SELECT 1 FROM site_settings WHERE key=?6 AND json_extract(value,'$.createdAt')=?7 AND json_extract(value,'$.state')='consumed')
          ON CONFLICT(name_key) DO UPDATE SET name = ?2, discord_id = ?3, status = 'verified', bound_at = ?4, verified_at = ?4, left_at = NULL, source = 'link', guid = ?5
          WHERE NOT (characters.discord_id = ?3 AND characters.status = 'member')`).bind(nameKey, character, subject, t, guid, stateKey, t),
      ]);
    } catch {
      // A concurrent submit or a changed standing refused the batch: nothing was written. Read back what is there now.
      const again = await readBack();
      if (again) return again;
      throw Error('live_link_consume_unknown');
    }
    const consumed = done[3];
    const row = consumed?.results?.[0] as { key?: unknown; admitted_at?: unknown } | undefined;
    if (done.length !== 5 || consumed?.meta?.changes !== 1 || !row || row.key !== stateKey || !Number.isSafeInteger(row.admitted_at)) throw Error('live_link_consume_unknown');

    // 10. Mint the original consumption and hand it to the central writer, once.
    const admittedAt = Number(row.admitted_at);
    const facts: LiveLinkFacts = Object.freeze({ subject, subjectGeneration: generation, fingerprint, deadline: admittedAt + LIVE_LINK_DEADLINE, admittedAt, op, stateKey,
      source: Object.freeze({ snapshotId: null, guid, nameKey }), createdAt: t });
    const cap = Object.freeze({}) as OriginalLiveLinkConsumption;
    const db = privacyProviderCustodyDatabase(env), witness = slotWitness(env, LIVE_CONFIG);
    originals.set(cap, { facts, db, check: witness, values: [] });
    let settlement: { state: string; reason: string; operationId: string | null } | null = null;
    try {
      const central = await import('./role-settlements');
      // Like the whisper lane's effect environment: the same configuration, the provider-custody database.
      const effect = { ...env, DB: db } as Env;
      settlement = await central.queueAndSettleLiveLinkMembership(effect, cap, venueSel.venue);
    } catch (e) {
      console.error('olympus-link live membership settle', errorRef(e));
    }
    const settled = settlement?.state === 'settled';
    const reason = (settlement?.reason ?? 'settlement_unknown').slice(0, 64);
    // Nothing was sent when the writer returned nothing or held: a new code may try again. An unknown outcome stays consumed.
    const next = settled ? 'settled' : settlement === null || settlement.state === 'held' ? 'held' : 'consumed';
    try {
      await env.DB.prepare(`UPDATE site_settings SET value=json_set(value,'$.state',?2,'$.reason',?3,'$.updatedAt',MAX(?4,json_extract(value,'$.createdAt'))),updated_at=?4
        WHERE key=?1 AND json_valid(value) AND json_extract(value,'$.createdAt')=?5 AND json_extract(value,'$.state')='consumed'`)
        .bind(stateKey, next, reason, Math.floor(Date.now() / 1000), t).run();
    } catch (e) { console.error('olympus-link live membership record', errorRef(e)); }
    if (settled) return send({ ok: true, status: 'linked', reason: 'member', message: MESSAGES.member, R, character, guild, faction, characters: [character] });
    return refuse('member-pending', R);
  } catch (e) {
    console.error('olympus-link live membership', errorRef(e));
    return send(core.failure('server', 'Something went wrong on our side.'));
  }
}

export { linkCors };
void captureLaunchVerification;
void HEX64;

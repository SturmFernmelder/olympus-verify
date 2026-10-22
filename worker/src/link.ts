/**
 * Build .186 (Olympus Link, Phase 1a; the reviewed integration plan of 21 Oct 2026 and the owner's rulings of the same
 * day): the gate and the adapters between this Worker and Daniel's link-core (src/link-core.ts, GENERATED from the
 * vendored upstream file; never edited by hand). docs/olympus-link.md is the operator's page.
 *
 * Shipped OFF. `linkState` decides, synchronously and from own data properties only (no D1, no await, no Discord):
 *   off  LINK_ENABLED absent, "" or "false": every caller returns before doing anything, so /verify and the routes are
 *        byte-identical to .185 and no statement is added anywhere (link_integration_186_test proves both);
 *   on   LINK_ENABLED exactly "true" AND the complete configuration below;
 *   held anything else (another value, or "true" with a missing or malformed requirement): /verify answers exactly as
 *        when off, POST answers 503 (the preflight answers as when on, so the page can read that 503), and one
 *        fixed-category line is logged, at most once a minute per isolate.
 *
 * Phase 1a only: issuing a code at /verify, POST /proof (link and the player's own "Delete my link") and POST
 * /api/link/keys on the bot host. Erasure, account-copy, ban hooks and the prune placement are Phase 1b and absent here.
 * link-core is loaded only by dynamic import behind the gate and only ever sees `linkEnv`: a frozen copy with LINK_DB and
 * no DB key, so it can never reach the bot's database (patch P1 removes its `env.DB` fallback as well).
 */
import type { Env } from './env';
import { errorRef } from './log';
import { nativeErasureMode } from './privacy-native-mode';
import { BETA_RESET_ROLE_IDS } from './beta-reset-policy';

export type LinkState = 'off' | 'on' | 'held';

/** The part of link-core this adapter calls, typed here: the generated module is upstream JavaScript under @ts-nocheck. */
type LinkAnswer = { ok: boolean; status: string; reason?: string; message?: string; reply?: string };
type RoleOutcome = { ok: true } | { ok: false; reason: 'not-in-server' | 'discord' };
interface LinkCore {
  issueCode(env: Readonly<Record<string, unknown>>, user: { id: string; username?: string }, source?: string): Promise<LinkAnswer>;
  handleProof(request: Request, env: Readonly<Record<string, unknown>>, opts: {
    promote?: (discordId: string) => Promise<RoleOutcome>;
    demote?: (discordId: string) => Promise<RoleOutcome>;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  }): Promise<Response>;
  handleKeys(request: Request, env: Readonly<Record<string, unknown>>): Promise<Response>;
  adminAuthorized(request: Request, env: Readonly<Record<string, unknown>>): Promise<boolean>;
  respond(answer: LinkAnswer, headers?: Record<string, string>, status?: number): Response;
  failure(reason: string, message: string, extra?: Record<string, unknown>): LinkAnswer;
}
/** The only way this Worker loads link-core: on demand, behind the gate. */
const loadCore = async (): Promise<LinkCore> => (await import('./link-core')) as unknown as LinkCore;

/** Discord caps a message at 2000 characters; the whisper reply keeps a margin, and the Link block is dropped (never
 * split or cut) when the two together would pass this. */
export const LINK_REPLY_MAX = 1990;
/** How long /verify waits for the Link code (link-core's issueCode: up to four LINK_DB round trips) before it answers
 * without the block. Discord wants the reply within 3 s, and the whisper reply must never miss that for Link. */
export const LINK_CODE_DEADLINE_MS = 1200;
/** The Link page's only origin (Daniel's GitHub Pages site). Link is on only when LINK_ORIGIN is exactly this, and no
 * other origin ever gets CORS from this Worker, held or on. */
export const LINK_PAGE_ORIGIN = 'https://dnl-gentile.github.io';

const SNOWFLAKE = /^\d{17,20}$/;
const PUBLIC_HEX = /^[0-9a-f]{64}$/;
const SEED = /^[A-Za-z0-9_-]{43}$/; // an Ed25519 seed as base64url (32 bytes), what link-keys.py backend prints
const LINK_KEYS = ['LINK_DB', 'LINK_BACKEND_SEED', 'LINK_BACKEND_PUBLIC', 'LINK_BACKEND_PREVIOUS', 'LINK_CA_PUBLIC', 'LINK_COUNCIL_CHARACTERS',
  'LINK_MODE', 'LINK_GUILD_POLICY', 'LINK_ORIGIN', 'LINK_SITE_TOKEN', 'LINK_ADMIN_TOKEN'] as const;

/** A held configuration, logged by its errorRef category only (the .51 logging rule). */
class LinkHeld extends Error {
  constructor() {
    super('olympus_link_held');
    this.name = 'LinkHeld';
  }
}
/** The Link code did not come within LINK_CODE_DEADLINE_MS; errorRef files it as 'timeout'. */
class LinkCodeDeadline extends Error {
  constructor() {
    super('olympus_link_code_deadline');
    this.name = 'TimeoutError';
  }
}

type Slot = { present: false } | { present: true; data: false } | { present: true; data: true; value: unknown };
function slot(env: Env, key: string): Slot {
  const d = env && typeof env === 'object' ? Object.getOwnPropertyDescriptor(env, key) : undefined;
  if (!d) return { present: false };
  if (!Object.hasOwn(d, 'value')) return { present: true, data: false };
  return { present: true, data: true, value: d.value };
}
/** An own string data property, or undefined when absent; null when present in any other shape. */
function text(env: Env, key: string): string | undefined | null {
  const s = slot(env, key);
  if (!s.present) return undefined;
  if (!s.data) return null;
  if (s.value === undefined) return undefined;
  return typeof s.value === 'string' ? s.value : null;
}
const tokens = (v: string) => v.split(/[\s,]+/).filter(Boolean);
const ids = (v: string | null | undefined) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

/**
 * Role ids the Link role must never be: @everyone, the bot, every role this Worker writes or protects, the staff roles,
 * the server restrictions (BLOCKING_ROLE_IDS), the intros roles, every id named in FULL_RELEASE_ROLES or
 * QR_NATIVE_ROLE_MAP, and the fixed beta-reset roles. Pointing LINK_ROLE_ID at any of them holds Link.
 */
export function linkRoleCollisions(env: Env): Set<string> {
  const out = new Set<string>(BETA_RESET_ROLE_IDS);
  for (const k of ['GUILD_ID', 'DISCORD_APP_ID', 'ROLE_GUILD_MEMBER', 'MEMBERSHIP_RETIRED_ROLE_ID', 'ROLE_OFFICER', 'ROLE_MODERATOR',
    'ROLE_GUILD_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_RAID_LEADER']) {
    const v = text(env, k);
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  }
  for (const k of ['BLOCKING_ROLE_IDS', 'INTROS_ROLES']) for (const v of ids(text(env, k))) out.add(v);
  // Any snowflake-shaped id inside these JSON values counts: conservative, and it needs no parser that could fail.
  for (const k of ['FULL_RELEASE_ROLES', 'QR_NATIVE_ROLE_MAP']) {
    const v = text(env, k);
    if (typeof v === 'string') for (const m of v.matchAll(/\d{17,20}/g)) out.add(m[0]);
  }
  return out;
}

/** The first requirement of "on" that does not hold, as a fixed name (never a value), or null when all hold. */
export function linkConfigProblem(env: Env): string | null {
  // The erasure hook planned for Phase 1b exists only on the Native path (privacy-native-mode.ts), live since .164.
  if (!nativeErasureMode(env)) return 'native_mode';
  const db = slot(env, 'LINK_DB');
  if (!db.present || !db.data || !db.value || typeof db.value !== 'object'
    || typeof (db.value as D1Database).prepare !== 'function' || typeof (db.value as D1Database).batch !== 'function') return 'LINK_DB';
  const seed = text(env, 'LINK_BACKEND_SEED');
  if (typeof seed !== 'string' || !SEED.test(seed)) return 'LINK_BACKEND_SEED';
  const pub = text(env, 'LINK_BACKEND_PUBLIC');
  if (typeof pub !== 'string' || !PUBLIC_HEX.test(pub)) return 'LINK_BACKEND_PUBLIC';
  for (const k of ['LINK_BACKEND_PREVIOUS', 'LINK_CA_PUBLIC']) {
    const v = text(env, k);
    if (v === null || typeof v === 'string' && !tokens(v).every((t) => PUBLIC_HEX.test(t))) return k;
  }
  const admin = text(env, 'LINK_ADMIN_TOKEN');
  if (typeof admin !== 'string' || admin.length < 32) return 'LINK_ADMIN_TOKEN';
  // Exactly the page's origin: one value, https, no list (an extra origin would get CORS from upstream's handleProof).
  if (text(env, 'LINK_ORIGIN') !== LINK_PAGE_ORIGIN) return 'LINK_ORIGIN';
  const mode = text(env, 'LINK_MODE');
  if (mode === null || mode !== undefined && mode !== 'c' && mode !== 'a') return 'LINK_MODE';
  const policy = text(env, 'LINK_GUILD_POLICY');
  if (policy === null || policy !== undefined && policy !== 'verified' && policy !== 'claimed') return 'LINK_GUILD_POLICY';
  for (const k of ['LINK_SITE_TOKEN', 'LINK_COUNCIL_CHARACTERS']) if (text(env, k) === null) return k;
  const guild = text(env, 'GUILD_ID'), app = text(env, 'DISCORD_APP_ID'), role = text(env, 'LINK_ROLE_ID'), bot = text(env, 'DISCORD_BOT_TOKEN');
  if (typeof guild !== 'string' || !SNOWFLAKE.test(guild)) return 'GUILD_ID';
  if (typeof app !== 'string' || !SNOWFLAKE.test(app)) return 'DISCORD_APP_ID';
  if (typeof bot !== 'string' || !bot) return 'DISCORD_BOT_TOKEN';
  if (typeof role !== 'string' || !SNOWFLAKE.test(role)) return 'LINK_ROLE_ID';
  if (linkRoleCollisions(env).has(role)) return 'LINK_ROLE_ID_collision';
  return null;
}

/** off, on or held, as described at the top. Pure and synchronous. */
export function linkState(env: Env): LinkState {
  const flag = slot(env, 'LINK_ENABLED');
  if (!flag.present) return 'off';
  if (!flag.data) return 'held';
  if (flag.value === undefined || flag.value === '' || flag.value === 'false') return 'off';
  if (flag.value !== 'true') return 'held';
  return linkConfigProblem(env) === null ? 'on' : 'held';
}

/** When this isolate last logged a held configuration: a held Link answers unauthenticated requests, so a flood of
 * them must not become a flood of log lines. */
const HELD_LOG_MS = 60 * 1000;
let heldLoggedAt: number | null = null;
function logHeld(env: Env, where: string): void {
  const t = Date.now();
  if (heldLoggedAt !== null && Math.abs(t - heldLoggedAt) < HELD_LOG_MS) return;
  heldLoggedAt = t;
  const s = slot(env, 'LINK_ENABLED');
  const problem = s.present && s.data && s.value === 'true' ? linkConfigProblem(env) ?? 'unknown' : 'LINK_ENABLED';
  console.error('olympus-link held', where, problem, errorRef(new LinkHeld()));
}

/**
 * What link-core may see: a frozen copy with LINK_DB and the Link settings, DISCORD_CLIENT_ID mapped from DISCORD_APP_ID
 * (upstream's name for the same application id), and no DB key at all.
 */
export function linkEnv(env: Env): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const k of LINK_KEYS) {
    const s = slot(env, k);
    if (s.present && s.data && s.value !== undefined) out[k] = s.value;
  }
  const app = text(env, 'DISCORD_APP_ID');
  if (typeof app === 'string') out.DISCORD_CLIENT_ID = app;
  return Object.freeze(out);
}

/**
 * /verify (both reply builders in interactions.ts, after the ban checks and every main-database statement): the Link
 * code block appended last. Off: the very same string, before anything else runs. Held, a failure anywhere (a seed that
 * does not match its public key, LINK_DB down, no free code), no code within LINK_CODE_DEADLINE_MS, or a reply that
 * would pass LINK_REPLY_MAX: the unchanged whisper reply. It never throws: an exception here would turn the whole reply
 * into INTERACTION_FAILED, which the replay ledger stores, hiding the whisper code on every repeat. A code that lands
 * after the deadline is handed out again on the next press (upstream reuses an open code).
 */
export async function appendLinkBlock(env: Env, user: { id: string; username?: string }, reply: string): Promise<string> {
  try {
    const state = linkState(env);
    if (state === 'off') return reply;
    if (state === 'held') {
      logHeld(env, 'verify');
      return reply;
    }
    // Only a real username counts: upstream's String(undefined) would pass its username check as "undefined".
    const username = typeof user.username === 'string' ? user.username : '';
    const work = (async () => (await loadCore()).issueCode(linkEnv(env), { id: user.id, username }, 'discord'))();
    work.catch(() => undefined); // a failure after the deadline is no unhandled rejection; the race below still sees one before it
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LINK_CODE_DEADLINE_MS);
    });
    let code: LinkAnswer | null;
    try {
      code = await Promise.race([work, deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (code === null) throw new LinkCodeDeadline();
    // ok: the code and how to paste it; 'limit' and 'username': upstream's own one-line reasons. 'login' cannot happen
    // for a Discord interaction's own id, and a sign-in prompt would make no sense here.
    if (!code || typeof code.reply !== 'string' || !code.ok && code.reason !== 'limit' && code.reason !== 'username') return reply;
    const out = `${reply}\n\n${code.reply}`;
    return out.length <= LINK_REPLY_MAX ? out : reply;
  } catch (e) {
    console.error('olympus-link code not issued', errorRef(e));
    return reply;
  }
}

/** A local copy of upstream's allowedOrigins/corsHeaders (link-core.mjs :870-886) for the answers given before
 * link-core is loaded (the preflight, held, limits), narrowed to LINK_PAGE_ORIGIN: whatever LINK_ORIGIN holds (held
 * included), no other origin gets CORS. The integration test keeps it equal to upstream's for that origin and null for
 * every other one. */
export function linkAllowedOrigins(value: unknown): string[] {
  return String(value || '').split(/[\s,]+/).filter((o) => /^https?:\/\/[^/]+$/.test(o));
}
export function linkCors(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin');
  if (origin !== LINK_PAGE_ORIGIN || !linkAllowedOrigins(text(env, 'LINK_ORIGIN')).includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' };
}

/**
 * The in-memory first filter's key for an address, grouped as upstream's own D1 limit groups it (a local copy of
 * link-core.mjs limitAddress, ipv4Bytes and ipv6Groups, MIT): an IPv4 address itself, an IPv6 address by its /64 (one
 * host routinely holds a whole /64), ::ffff:a.b.c.d as a.b.c.d; anything else as it is written.
 */
export function linkAddressKey(ip: string): string {
  const v4 = ipv4Bytes(ip);
  if (v4) return v4.join('.');
  const h = ipv6Groups(ip);
  if (!h) return `?${ip}`;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return [h[6]! >> 8, h[6]! & 255, h[7]! >> 8, h[7]! & 255].join('.');
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}
function ipv4Bytes(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const bytes = m.slice(1).map(Number);
  return bytes.every((b) => b <= 255) ? bytes : null;
}
function ipv6Groups(s: string): number[] | null {
  const halves = s.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const groups = (part: string, last: boolean): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    const parts = part.split(':');
    for (let i = 0; i < parts.length; i++) {
      const v4 = last && i === parts.length - 1 ? ipv4Bytes(parts[i]!) : null;
      if (v4) out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
      else if (/^[0-9a-f]{1,4}$/.test(parts[i]!)) out.push(parseInt(parts[i]!, 16));
      else return null;
    }
    return out;
  };
  const left = groups(halves[0]!, halves.length === 1);
  const right = halves.length === 2 ? groups(halves[1]!, true) : [];
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const fill = 8 - left.length - right.length;
  return fill >= 1 ? [...left, ...new Array<number>(fill).fill(0), ...right] : null;
}
const addressKey = (request: Request) => linkAddressKey(request.headers.get('CF-Connecting-IP') ?? '');

/** A JSON answer in upstream's shape ({ ok, status, reason, message }) and headers. */
function answer(reason: string, message: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ok: false, status: 'error', reason, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
const pageHeaders = (cors: Record<string, string> | null) => cors ?? { Vary: 'Origin' };
const held = (cors: Record<string, string> | null) => answer('server', 'Olympus Link is not available right now.', 503, pageHeaders(cors));

/**
 * OPTIONS /proof on the bot host, called by index.ts before the policy branch and before any await or database work.
 * Off: null, so the request continues exactly as in .185 (it ends at the final 404). On and held: upstream's preflight
 * answer (204 with CORS for the page's origin, 403 otherwise). A browser treats any other preflight status as a network
 * error and never sends the POST, so held answers the preflight as on does and lets the POST carry the readable 503.
 */
export function linkPreflight(request: Request, env: Env): Response | null {
  const state = linkState(env);
  if (state === 'off') return null;
  const cors = linkCors(request, env);
  if (state === 'held') logHeld(env, 'preflight');
  return new Response(null, { status: cors ? 204 : 403, headers: cors ? { ...cors, 'Access-Control-Max-Age': '600' } : { Vary: 'Origin' } });
}

/** The request link-core reads, with the body already read under our own cap (upstream reads it whole first). */
function bodyShim(request: Request, body: string): Request {
  return { method: request.method, headers: request.headers, text: async () => body } as unknown as Request;
}

/**
 * POST /proof and POST /api/link/keys, bot host only (index.ts checks the host), inside route() after ensureSchema and
 * before the final 404. Off: null, so they reach today's 404. Held: 503.
 */
export async function routeLink(request: Request, env: Env, path: string, schemaReady: boolean): Promise<Response | null> {
  if (path !== '/proof' && path !== '/api/link/keys') return null;
  const state = linkState(env);
  if (state === 'off') return null;
  const proof = path === '/proof';
  const cors = proof ? linkCors(request, env) : null;
  if (state === 'held') {
    logHeld(env, proof ? 'proof' : 'keys');
    return proof ? held(cors) : answer('server', 'Olympus Link is not available right now.', 503);
  }
  try {
    return proof ? await routeProof(request, env, cors, schemaReady) : await routeKeys(request, env);
  } catch (e) {
    console.error('olympus-link route failed', errorRef(e));
    return proof ? answer('server', 'Something went wrong on our side.', 500, pageHeaders(cors)) : answer('server', 'Something went wrong on our side.', 500);
  }
}

const PROOF_BODY_MAX = 16 * 1024; // upstream refuses a body over 8 KiB after reading it; nothing larger is read here
const KEYS_BODY_MAX = 4 * 1024; // upstream's own cap for the keys route

async function routeProof(request: Request, env: Env, cors: Record<string, string> | null, schemaReady: boolean): Promise<Response> {
  const core = await loadCore();
  const lenv = linkEnv(env);
  // Upstream answers these before it reads a body: another method (405) and another origin (403).
  if (request.method !== 'POST' || !cors) return core.handleProof(bodyShim(request, ''), lenv, {});
  // The eligibility checks of the role writer read the bot's database.
  if (!schemaReady) return answer('server', 'The bot is updating its database: try again in a minute.', 503, cors);
  // A first filter in memory, per isolate (site-core.ts), ahead of upstream's own D1 limits before Discord is asked; an
  // IPv6 address counts by its /64, as upstream's limit counts it.
  const { rateLimited } = await import('./site-core');
  if (rateLimited(`link:proof:${addressKey(request)}`, 20, 60)) {
    return answer('limit', 'Too many tries: wait a while and send it again.', 429, { ...cors, 'Retry-After': '60' });
  }
  const { readInteractionBody, credentialFetch } = await import('./discord');
  const body = await readInteractionBody(request, PROOF_BODY_MAX);
  if (body === null) return answer('format', 'This request is too large.', 413, cors);
  const { linkRole } = await import('./link-role');
  return core.handleProof(bodyShim(request, body), lenv, {
    promote: (discordId: string) => linkRole(env, 'PUT', discordId),
    demote: (discordId: string) => linkRole(env, 'DELETE', discordId),
    fetchImpl: credentialFetch,
  });
}

async function routeKeys(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return answer('method', 'POST only.', 405, { Allow: 'POST' });
  const { rateLimited } = await import('./site-core');
  if (rateLimited(`link:keys:${addressKey(request)}`, 10, 60)) {
    return answer('limit', 'Too many tries: wait a while and send it again.', 429, { 'Retry-After': '60' });
  }
  const core = await loadCore();
  const lenv = linkEnv(env);
  // The bearer first (upstream's constant-time compare of SHA-256 digests, a token of 32 characters or more), so an
  // unauthorized caller never has its body read.
  if (!(await core.adminAuthorized(request, lenv))) return core.respond(core.failure('auth', 'Wrong admin token.'));
  const { readInteractionBody } = await import('./discord');
  const body = await readInteractionBody(request, KEYS_BODY_MAX);
  if (body === null) return answer('format', 'This request is too large.', 413);
  return core.handleKeys(bodyShim(request, body), lenv);
}

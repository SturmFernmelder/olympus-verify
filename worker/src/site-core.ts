/**
 * What every part of the guild site shares (build .41): the signed-in user, the session cookie, the JSON and security
 * headers, avatars, the member search and the shape of an application. site.ts (pages and sign-in), site-api.ts
 * (members) and site-admin.ts (admins) all import from here and never from each other's internals.
 */
import type { Env } from "./env";
import { now } from "./db";
import { privacyGenerationLiteralFenceSql } from "./privacy-serving-authority";
import { DiscordError, rest } from "./discord";
import { currentPosition, LIMITS, raidFit, roleKeyOf } from "./site-data";

export const siteHost = (env: Env) => (env.SITE_HOST ?? "").trim().toLowerCase();
/** Build .49: hosts the site used to live on (the hostname swap keeps them as 301s to SITE_HOST). */
export const siteLegacyHosts = (env: Env) =>
  new Set((env.SITE_LEGACY_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
export const siteAdmins = (env: Env) =>
  new Set((env.SITE_ADMINS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s)));
export const isSiteAdmin = (env: Env, id: string) => siteAdmins(env).has(id);

export interface SiteUser {
  discord_id: string;
  privacyGeneration?: string|null;
  username: string | null;
  global_name: string | null;
  nick: string | null;
  avatar: string | null;
  account_created: number | null;
  server_joined: number | null;
  first_login: number;
  last_login: number;
  checked_at: number | null;
  in_server: number;
  session_version: number;
  denied: number;
  denied_reason: string | null;
  denied_at: number | null;
  denied_by: string | null;
}

export const SESSION_COOKIE = "__Host-olg";
const SESSION_SECONDS = 7 * 86400;

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  // .112: images from this site only (the official game art and the crest); no embedded images. .114 (Viktor, 2 Oct 2026): one
  // exception, the signed-in member's own Discord picture in the top bar, from Discord's picture host and nowhere else (the
  // page's script accepts only an avatar address there, app.js ownAvatar)
  "img-src 'self' https://cdn.discordapp.com",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

export function securityHeaders(h: Headers, html = false) {
  if (html) h.set("Content-Security-Policy", CSP);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "same-origin");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Strict-Transport-Security", "max-age=31536000");
  // no-transform: Cloudflare's proxy then leaves the response alone. Without it, the zone's Web Analytics injects its
  // beacon script into every HTML page (seen live on 29 Sep): the CSP blocked it on the site's own pages, one console
  // error per load, and on the policy pages, which carry no CSP of their own until .42, it ran.
  h.set("Cache-Control", "no-store, no-transform");
  return h;
}


export function apiJson(obj: unknown, status = 200, extra: Record<string, string> = {}): Response {
  const h = securityHeaders(new Headers({ "Content-Type": "application/json; charset=utf-8", ...extra }));
  return new Response(JSON.stringify(obj), { status, headers: h });
}

// ---------- sessions ----------

export function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();
function macKey(secret: string, purpose: string): Promise<CryptoKey> {
  if (!secret) throw new Error("COOKIE_SECRET is not set \u2014 run: npx wrangler secret put COOKIE_SECRET");
  const id = purpose + "|" + secret;
  let k = keys.get(id);
  if (!k) {
    // A key per purpose: a state cookie can never pass as a session, even though both are signed with COOKIE_SECRET.
    k = crypto.subtle.importKey("raw", new TextEncoder().encode(`olympus-site/${purpose}|${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keys.set(id, k);
  }
  return k;
}

export async function sign(secret: string, purpose: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await macKey(secret, purpose), new TextEncoder().encode(data));
  return b64u(new Uint8Array(sig));
}

/** crypto.subtle.verify compares in constant time. */
export async function verify(secret: string, purpose: string, data: string, mac: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify("HMAC", await macKey(secret, purpose), unb64u(mac), new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

export async function sessionCookie(env: Env, discordId: string, version: number,originalGeneration?:string|null): Promise<string> {
  const issuedExpires=now()+SESSION_SECONDS;
  const generation=originalGeneration===undefined?(await env.DB.prepare('SELECT generation FROM privacy_subjects WHERE subject_id=?1').bind(discordId).first<{generation:string}>())?.generation??null:originalGeneration;
  if(generation!==null&&!/^[0-9a-f]{32}$/.test(generation))throw Error('privacy_cookie_generation_invalid');
  const body = b64u(new TextEncoder().encode(JSON.stringify({ u: discordId, v: version, e: issuedExpires, g:generation })));
  const mac = await sign(env.COOKIE_SECRET, "session", body);
  return `${SESSION_COOKIE}=${body}.${mac}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const clearCookie = (name: string) => `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

export function cookie(request: Request, name: string): string {
  for (const part of (request.headers.get("Cookie") ?? "").split(/;\s*/)) {
    if (part.startsWith(name + "=")) return part.slice(name.length + 1);
  }
  return "";
}

export async function readSession(env: Env, request: Request): Promise<{ u: string; v: number; e: number; g:string|null } | null> {
  const raw = cookie(request, SESSION_COOKIE);
  const dot = raw.indexOf(".");
  if (dot < 1 || !env.COOKIE_SECRET) return null;
  const body = raw.slice(0, dot);
  if (!(await verify(env.COOKIE_SECRET, "session", body, raw.slice(dot + 1)))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(body))) as { u: string; v: number; e: number; g?:string|null };
    if (typeof s.u !== "string" || typeof s.v !== "number" || typeof s.e !== "number" || s.e < now()) return null;
    if(s.g!==undefined&&s.g!==null&&(typeof s.g!=='string'||!/^[0-9a-f]{32}$/.test(s.g)))return null;
    return {...s,g:s.g??null};
  } catch {
    return null;
  }
}

/** The signed-in user, or null. A cookie from before the last sign-out (older version) no longer counts. */
export async function currentUser(env: Env, request: Request): Promise<SiteUser | null> {
  const s = await readSession(env, request);
  if (!s) return null;
  const row = await env.DB.prepare(`SELECT * FROM site_users WHERE discord_id = ?1 AND ${privacyGenerationLiteralFenceSql("discord_id",s.g)}`).bind(s.u).first<SiteUser>();
  if (!row || row.session_version !== s.v) return null;
  return {...row,privacyGeneration:s.g};
}

/**
 * A state-changing request from this site's own page: the custom header plus a same-origin Origin. The header's value
 * is the page's version: "2" since .43. A page loaded before that still sends "1"; it is ours, but out of date.
 */
export const PAGE_VERSION = "2";
export function sameOrigin(request: Request): boolean {
  // Any page version counts as this site's own page here: an old one is then told to reload (409), not refused as a
  // stranger. A cross-site form cannot set this header at all, which is what the check is for.
  const v = request.headers.get("X-Olympus");
  if (!v || !/^\d{1,3}$/.test(v)) return false;
  const origin = request.headers.get("Origin");
  if (origin) return origin === new URL(request.url).origin;
  const site = request.headers.get("Sec-Fetch-Site");
  return !site || site === "same-origin";
}

export const clearSessionCookie = () => clearCookie(SESSION_COOKIE);

/** A Discord CDN URL for this avatar (server avatar when set), or Discord's default one. */
export function avatarUrl(env: Env, id: string, avatar: string | null | undefined): string {
  if (avatar && /^[gu]:(a_)?[0-9a-f]{32}$/.test(avatar)) {
    const hash = avatar.slice(2);
    return avatar.startsWith("g:")
      ? `https://cdn.discordapp.com/guilds/${env.SITE_GUILD_ID}/users/${id}/avatars/${hash}.png?size=64`
      : `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64`;
  }
  let index = 0;
  try {
    index = Number((BigInt(id) >> 22n) % 6n);
  } catch {
    /* not a snowflake: first default */
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// ---------- applications, search, request plumbing ----------

export interface AppRow {
  discord_id: string;
  position: string;
  class_lead: string | null;
  backup1?: string | null;  // .43: up to two backup choices, as role keys (site-data.ts choiceOf)
  backup2?: string | null;
  fallback: number;
  character: string | null;
  class: string | null;
  role: string | null;
  region: string | null;
  avail?: string | null;    // .43: the weekly grid, 168 UTC hours as hex (site-data.ts availBits)
  avail_tz?: string | null; // the time zone the applicant filled it in
  fit_na?: number | null;   // .43: NA and EU raid evenings a week, from the grid at save time (for the board's filter)
  fit_eu?: number | null;
  board_at?: number | null; // .43: when they agreed to their leadership application being on the voting board
  answers: string;
  status: string;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

export const parseAnswers = (raw: string | null | undefined): Record<string, unknown> => {
  try {
    const v = JSON.parse(raw ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {}; // an unreadable row shows empty answers rather than failing the page
  }
};

/** The role keys an application names, first choice first: what the voting board lists it under. */
export function choicesOf(a: Pick<AppRow, "position" | "class_lead" | "region" | "backup1" | "backup2">): string[] {
  const first = roleKeyOf(currentPosition(a.position, a.region), a.class_lead);
  return [first, a.backup1, a.backup2].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
}

export function appOut(a: AppRow, withAdmin = false) {
  return {
    position: currentPosition(a.position, a.region),
    classLead: a.class_lead,
    backups: [a.backup1, a.backup2].filter((x): x is string => !!x),
    fallback: !!a.fallback,
    character: a.character,
    class: a.class,
    role: a.role,
    region: a.region,
    avail: a.avail ?? null,
    availTz: a.avail_tz ?? null,
    fit: raidFit(a.avail),
    boardAt: a.board_at ?? null,
    answers: parseAnswers(a.answers),
    status: a.status,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    ...(withAdmin ? { adminNote: a.admin_note, reviewedBy: a.reviewed_by, reviewedAt: a.reviewed_at } : {}),
  };
}

// ---------- the voting board, in SQL (site_applications a JOIN site_users u) ----------

/** An application's first choice as a role key (Class Lead carries its class). */
export const ROLE_OF_FIRST = "CASE WHEN a.position = 'class_lead' THEN 'class_lead:' || a.class_lead ELSE a.position END";
/**
 * On the board: open applications (submitted or under review) whose applicant agreed to the board (board_at: the .43
 * form asks; an application saved before the board existed was promised privacy, so it stays off until re-saved), of
 * accounts that are not denied and still in the server. `u` is the applicant's site_users alias.
 */
export const onBoardSql = (u = "u") => `a.status IN ('submitted','reviewing') AND a.board_at IS NOT NULL AND ${u}.denied = 0 AND ${u}.in_server = 1`;
export const ON_BOARD = onBoardSql("u");
/** Listed under the role bound at ?n: their first choice or either backup. */
export const UNDER_ROLE = (n: number) => `(${ROLE_OF_FIRST} = ?${n} OR a.backup1 = ?${n} OR a.backup2 = ?${n})`;
/** How many applications each role has on the board, as rows of {rk, n}. */
export const BOARD_COUNTS = `SELECT rk, COUNT(*) AS n FROM (
       SELECT ${ROLE_OF_FIRST} AS rk FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE ${ON_BOARD}
       UNION ALL SELECT a.backup1 FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE ${ON_BOARD} AND a.backup1 IS NOT NULL
       UNION ALL SELECT a.backup2 FROM site_applications a JOIN site_users u ON u.discord_id = a.discord_id WHERE ${ON_BOARD} AND a.backup2 IS NOT NULL
     ) GROUP BY rk`;

export interface Found {
  id: string;
  username: string;
  displayName: string | null;
  nick: string | null;
  avatar: string | null; // "g:hash" | "u:hash" | null
}

const searchCache = new Map<string, { at: number; found: Found[] }>();
const SEARCH_TTL = 300;

/** Discord's member search in SITE_GUILD_ID (names that START with the query), cached for five minutes. */
export async function searchMembers(env: Env, q: string): Promise<{ found: Found[]; limited?: boolean }> {
  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit && now() - hit.at < SEARCH_TTL) return { found: hit.found };
  try {
    const res = await rest<Array<{ user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean }; nick?: string | null; avatar?: string | null }>>(
      env,
      "GET",
      `/guilds/${env.SITE_GUILD_ID}/members/search?query=${encodeURIComponent(q)}&limit=25`,
      undefined,
      1, // no retry: a person is waiting, and they can type the name instead
    );
    const found: Found[] = res
      .filter((m) => m.user && !m.user.bot)
      .map((m) => ({
        id: m.user!.id,
        username: m.user!.username,
        displayName: m.user!.global_name ?? null,
        nick: m.nick ?? null,
        avatar: m.avatar ? `g:${m.avatar}` : m.user!.avatar ? `u:${m.user!.avatar}` : null,
      }));
    if (searchCache.size > 500) searchCache.clear();
    searchCache.set(key, { at: now(), found });
    return { found };
  } catch (e) {
    if (e instanceof DiscordError && e.status === 429) return { found: [], limited: true };
    throw e;
  }
}

export const labelOf = (f: { username: string | null; displayName: string | null; nick?: string | null }) => {
  const shown = f.nick || f.displayName || f.username || "";
  return (shown && f.username && shown.toLowerCase() !== f.username.toLowerCase() ? `${shown} (@${f.username})` : `@${f.username ?? shown}`).slice(0, LIMITS.label);
};

/**
 * .114 (Viktor, 2 Oct 2026: "show both their display name and username"): how a found member is SHOWN in a search: every
 * name that differs, the server nickname, the display name, then the @username, e.g. "Fern · Fernmelder (@fernmelder)".
 * Until .114 a nickname hid a different display name. Display only: labelOf stays the label a pick stores (votes,
 * friends and references keep the format they were saved with).
 */
export const shownName = (f: { username: string | null; displayName: string | null; nick?: string | null }) => {
  const user = f.username ?? "";
  const seen = new Set([user.toLowerCase()]);
  const names: string[] = [];
  for (const n of [f.nick, f.displayName]) {
    const v = (n ?? "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      names.push(v);
    }
  }
  return (names.length ? `${names.join(" · ")} (@${user})` : `@${user}`).slice(0, 140);
};

/** A JSON object body, {} when empty, or null when it is not one (or over 64 KB). */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 64_000) return null;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const buckets = new Map<string, { n: number; reset: number }>();
/** Per isolate, so a soft limit: enough to stop a stuck script or a held-down key, not a determined attacker. */
export function rateLimited(key: string, max: number, windowSeconds: number): boolean {
  const t = now();
  let b = buckets.get(key);
  if (!b || b.reset <= t) {
    if (buckets.size > 5000) buckets.clear();
    b = { n: 0, reset: t + windowSeconds };
    buckets.set(key, b);
  }
  b.n++;
  return b.n > max;
}

// How many applicants each role has on the board: the same for everyone, so an isolate keeps it for half a minute.
// Anything that moves an application on or off the board clears it (in the isolate that made the change).
export const boardCountCache: { value: { at: number; counts: Map<string, number> } | null } = { value: null };
export const forgetBoardCounts = () => { boardCountCache.value = null; };

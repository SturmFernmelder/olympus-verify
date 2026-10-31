/** .218 officer-tier Treasury plan (owner rulings, 31 Oct 2026: officers and above only; "Either source").
 * Admits a site admin, a currently published Co-Guild Master or Treasurer appointment proved again inside the same
 * admitted read, an officer rank on a CURRENT roster export (the configured ten-rank profile only, after the launch cut,
 * fresh, complete, trusted and GUID-pinned; see currentLadder and ROSTER_SQL), or a configured Discord leader/officer/
 * raid-leader role read once from Discord. Display names, application tracks and beta-era ranks grant nothing.
 * Never caches a role, never writes, never retries. */
import type { Env } from "./env";
import { apiJson, currentUser, originalUserSession, isSiteAdmin, rateLimited } from "./site-core";
import { privacyBoundSiteEnv, PrivacySiteRequestHeld } from "./privacy-serving-authority";
import { communityContext, captureCommunitySubject, admittedRead, FENCE_REFUSED } from "./community-context";
import { checkOriginalNativeRequest, checkOriginalNativeHeaders } from "./privacy-native-http-intrinsics";
import { capturePublishedOfficeAuthority, publishedOfficeAuthorityCondition } from "./site-appointed-identities";
import { rest, DiscordError } from "./discord";
import { parseNativeRoleMap, namesFor } from "./native-rank-adapter";
import { linksNotBefore } from "./db";
import { ROSTER_CURRENT_FOR } from "./roster";
import { DB_NOW } from "./account-generation-contracts";
import { privateSiteAsset } from "./site-access";

/** The planning programme's renderer, financial model, content and stylesheet. Royal Writs stay member-readable. */
export const TREASURY_PLAN_ASSETS = Object.freeze(["/static/treasury-plan207.js", "/static/treasury-plan-model207.js", "/static/treasury-plan-content207.js", "/static/treasury-plan207.css"]);
export const TREASURY_ACCESS_PATH = "/api/treasury-plan/access";
const OFFICER_RANKS = new Set(["Guild Master", "High Council", "Treasurer", "Officer", "Officer Alt", "Raid Leader"]);
const HEADER_NAMES = ["Cookie", "Origin", "Sec-Fetch-Site", "X-Olympus"];
const DISCORD_KEYS = ["SITE_GUILD_ID", "GUILD_ID", "DISCORD_BOT_TOKEN", "ROLE_GUILD_MASTER", "ROLE_GUILD_LEADER", "ROLE_OFFICER", "ROLE_RAID_LEADER"] as const;
const ROSTER_KEYS = ["QR_NATIVE_ROLE_MAP", "LINKS_NOT_BEFORE", "LINKS_NOT_BEFORE_CLOCK_GATED"] as const;

/** The configuration values that chose a read. assertSameConfig checks them again after the read's await, so one decision
 * never mixes two configurations (the officer/Army reader discipline). The bound site env is a frozen copy, so in normal
 * operation the check cannot fire; it makes the invariant explicit and testable. */
export function configSnapshot(env: Env, keys: readonly string[]): readonly unknown[] {
  return Object.freeze(keys.map(key => (env as unknown as Record<string, unknown>)[key]));
}
export function assertSameConfig(env: Env, keys: readonly string[], snapshot: readonly unknown[]): void {
  if (keys.length !== snapshot.length || keys.some((key, i) => (env as unknown as Record<string, unknown>)[key] !== snapshot[i])) throw Error("treasury_original_request_held");
}
// One Treasury page load by a Discord-role officer can cost six reads (the nav check, the route check and the four plan
// files); twenty a minute leaves room for normal reloads while still bounding provider use per account.
export const TREASURY_DISCORD_READS_PER_MINUTE = 20;
const ID = /^\d{17,20}$/;

/** An officer-tier rank name at exactly its index in the configured current ladder (no fallback ladder). */
export function officerRank(rank: unknown, index: unknown, names: readonly string[]): boolean {
  return typeof rank === "string" && Number.isInteger(index) && OFFICER_RANKS.has(rank) && names[index as number] === rank;
}

/** The configured current native ladder and launch cut, or null while native authority is beta-era or prelaunch: the
 * beta-five profile never carries into this read, and a clock-gated cut that has not opened yet (0) withholds the path. */
export function currentLadder(env: Env): { names: readonly string[]; cutoff: number } | null {
  let profile: ReturnType<typeof parseNativeRoleMap>["profile"];
  try { profile = parseNativeRoleMap(env.QR_NATIVE_ROLE_MAP).profile; } catch { return null; }
  if (profile === "beta-five") return null;
  const cutoff = linksNotBefore(env);
  return Number.isSafeInteger(cutoff) && cutoff > 0 ? { names: namesFor(profile), cutoff } : null;
}

export type TreasurySource = "admin" | "appointment" | "roster" | "discord";
type Access = { canRead: boolean; source: TreasurySource | null; check: () => void; readmit: () => Promise<Response | null> };

const refusal = (error: string, status: number, message?: string) => privateSiteAsset(apiJson(message ? { error, message } : { error }, status));
// A roster that speaks for the present (roster.ts isCurrentRoster, plus the read-applicable boundaries of
// full-release-roles.ts LANE_ROSTER_CURRENT): the newest export only, complete, trusted, row-count exact, not from the
// future, at most ROSTER_CURRENT_FOR old and at or after the launch cut; the character is GUID-pinned, its GUID is unique
// on the export and among bound characters, and the account is neither banned nor under a rename re-apply hold.
// Binds: ?1 subject, ?2 launch cut, ?3 freshness seconds; the closed current ladder supplies officer name/index pairs below.
const ROSTER_SQL = `SELECT r.rank AS rank, r.rank_index AS rank_index FROM roster_snapshots s
  JOIN roster_members r ON r.snapshot_id = s.id
  JOIN characters c ON c.guid IS NOT NULL AND c.guid = r.guid AND c.discord_id = ?1 AND c.status = 'member'
  WHERE s.id = (SELECT MAX(id) FROM roster_snapshots) AND s.complete = 1 AND s.trusted = 1
   AND s.exported_at <= ${DB_NOW} AND s.exported_at > ${DB_NOW} - ?3 AND s.exported_at >= ?2
   AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id)
   AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id AND guid = r.guid) = 1
   AND (SELECT COUNT(*) FROM characters WHERE guid = r.guid AND status IN ('member', 'left_pending')) = 1
   AND NOT EXISTS (SELECT 1 FROM members WHERE discord_id = ?1 AND banned = 1)
   AND NOT EXISTS (SELECT 1 FROM rename_holds WHERE discord_id = ?1 AND state = 'reapply')`;

/** Any independently valid officer character admits its account. Filter before limiting: lower-rank alts and a second
 * valid officer do not disqualify the first, while every candidate still has its own unique exported and bound GUID. */
function rosterOfficerStatement(env: Env, discordId: string, ladder: { names: readonly string[]; cutoff: number }): D1PreparedStatement {
  const officers = ladder.names.flatMap((rank, index) => officerRank(rank, index, ladder.names) ? [{ rank, index }] : []);
  const pairs = officers.map((_, i) => `(r.rank=?${4 + i * 2} AND r.rank_index=?${5 + i * 2})`).join(" OR ") || "0";
  return env.DB.prepare(`${ROSTER_SQL} AND (${pairs}) LIMIT 1`)
    .bind(discordId, ladder.cutoff, ROSTER_CURRENT_FOR, ...officers.flatMap(({ rank, index }) => [rank, index]));
}
function rosterOfficerResult(out: D1Result | undefined, names: readonly string[]): boolean {
  const rows = out?.results ?? [];
  return rows.length === 1 && officerRank((rows[0] as { rank?: unknown }).rank, (rows[0] as { rank_index?: unknown }).rank_index, names);
}

async function discordOfficerRole(env: Env, discordId: string, check: () => void): Promise<boolean> {
  const guild = env.SITE_GUILD_ID;
  const wanted = [env.ROLE_GUILD_MASTER, env.ROLE_GUILD_LEADER, env.ROLE_OFFICER, env.ROLE_RAID_LEADER].filter((id): id is string => typeof id === "string" && ID.test(id));
  if (!env.DISCORD_BOT_TOKEN || !ID.test(guild ?? "") || env.GUILD_ID !== guild || !wanted.length) return false;
  // The guild and role configuration that chose this read must still be the configuration that judges its answer.
  const config = configSnapshot(env, DISCORD_KEYS), same = () => { check(); assertSameConfig(env, DISCORD_KEYS, config); };
  same();
  try {
    const member = await rest<{ user?: { id?: string; bot?: boolean }; roles?: unknown; pending?: boolean }>(env, "GET", `/guilds/${guild}/members/${discordId}`, undefined, 1);
    same();
    return member?.user?.id === discordId && (member.pending === undefined || member.pending === false)
      && (member.user.bot === undefined || member.user.bot === false) && Array.isArray(member.roles)
      && member.roles.every(value => typeof value === "string" && ID.test(value)) && member.roles.some(value => wanted.includes(value as string));
  } catch (error) {
    same();
    // A refused or unavailable provider withholds this extra path only; privacy and custody failures still propagate.
    if (error instanceof DiscordError || error instanceof TypeError || (typeof DOMException !== "undefined" && error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))) return false;
    throw error;
  }
}

/** The current caller's Treasury plan admission. Refusals are complete responses; a decision carries its re-check. */
export async function treasuryAccess(request: Request, env: Env): Promise<Access | Response> {
  checkOriginalNativeRequest(request); checkOriginalNativeHeaders(request.headers);
  const user = await currentUser(env, request);
  if (!user) return refusal("signed_out", 401);
  if (user.denied || user.in_server !== 1) return refusal(user.denied ? "denied" : "not_member", 403);
  env = privacyBoundSiteEnv(env, originalUserSession(user));
  const ctx = await communityContext(env, request);
  if (!ctx.subject || ctx.subject.discordId !== user.discord_id || !ctx.capabilities.applicantWrite || ctx.facts.banned) return refusal("forbidden", 403);
  const subject = ctx.subject, capture = captureCommunitySubject(subject), url = request.url, method = request.method, headers = request.headers, values = HEADER_NAMES.map(h => headers.get(h)), admins = env.SITE_ADMINS;
  const check = () => {
    capture.check(); checkOriginalNativeRequest(request); checkOriginalNativeHeaders(headers);
    if (ctx.subject !== subject || request.url !== url || request.method !== method || request.headers !== headers || HEADER_NAMES.some((h, i) => headers.get(h) !== values[i]) || env.SITE_ADMINS !== admins) throw Error("treasury_original_request_held");
  };
  check();
  // Re-admission of the ORIGINAL subject and session after the last await. D1-based admissions also repeat their
  // captured appointment or current roster proof in the SAME admitted batch; admin and Discord are independent paths.
  const readmit = async (proof?: { statement: () => D1PreparedStatement; allows: (out: D1Result | undefined) => boolean; check?: () => void }): Promise<Response | null> => {
    check(); proof?.check?.();
    let out: D1Result[] | typeof FENCE_REFUSED;
    try {
      out = await admittedRead(env, ctx, "applicantWrite", [
        env.DB.prepare("SELECT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AS banned").bind(subject.discordId),
        ...(proof ? [proof.statement()] : [])
      ]);
    } catch (error) {
      if (!(error instanceof PrivacySiteRequestHeld)) throw error;
      check(); return refusal("account_changed", 403);
    }
    check(); proof?.check?.();
    if (out === FENCE_REFUSED) return refusal("account_changed", 403);
    if ((out[0]?.results?.[0] as { banned?: number } | undefined)?.banned !== 0) return refusal("forbidden", 403);
    return !proof || proof.allows(out[1]) ? null : refusal("officer_only", 403, OFFICER_ONLY);
  };
  if (isSiteAdmin(env, subject.discordId)) return { canRead: true, source: "admin", check, readmit };
  const authority = await capturePublishedOfficeAuthority(env, subject.discordId, ["co_gm", "treasurer"]);
  check();
  if (authority) {
    const condition = publishedOfficeAuthorityCondition(authority, 1);
    const proof = { statement: () => env.DB.prepare(`SELECT (${condition.sql}) AS office_ok`).bind(...condition.values),
      allows: (out: D1Result | undefined) => (out?.results?.[0] as { office_ok?: number } | undefined)?.office_ok === 1 };
    const out = await admittedRead(env, ctx, "applicantWrite", [proof.statement()]);
    check();
    if (out !== FENCE_REFUSED && proof.allows(out[0])) return { canRead: true, source: "appointment", check, readmit: () => readmit(proof) };
  }
  const rosterConfig = configSnapshot(env, ROSTER_KEYS), ladder = currentLadder(env);
  if (ladder) {
    const proof = { statement: () => rosterOfficerStatement(env, subject.discordId, ladder),
      allows: (out: D1Result | undefined) => rosterOfficerResult(out, ladder.names),
      check: () => assertSameConfig(env, ROSTER_KEYS, rosterConfig) };
    const roster = await admittedRead(env, ctx, "applicantWrite", [proof.statement()]);
    check(); proof.check();
    if (roster === FENCE_REFUSED) return refusal("account_changed", 403);
    if (proof.allows(roster[0])) return { canRead: true, source: "roster", check, readmit: () => readmit(proof) };
  }
  // Only the Discord path costs a provider call, so only it is limited (per isolate, per account).
  if (rateLimited(`tpd:${subject.discordId}`, TREASURY_DISCORD_READS_PER_MINUTE, 60)) return privateSiteAsset(apiJson({ error: "slow_down", message: "Too many checks. Wait a minute and try again." }, 429, { "Retry-After": "60" }));
  // Discord authority is one fresh provider-response snapshot per request, before asset storage.
  // A caller whose role changes during that asset await can still receive that one response. Later requests
  // check a new provider response; no cross-request result cache or strong upstream consistency
  // is claimed. The final Native admission rechecks original identity/session/standing/ban,
  // not an atomic upstream Discord-role revocation. Refused members never read plan storage.
  if (await discordOfficerRole(env, subject.discordId, check)) return { canRead: true, source: "discord", check, readmit };
  return { canRead: false, source: null, check, readmit };
}

const OFFICER_ONLY = "The treasury programme is for officers and above: Guild Master, High Council, Officers, Officer Alts, Raid Leaders, the Treasurer and the Co-Guild Master.";
const methodRefused = () => privateSiteAsset(apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" }));
const bodyless = (request: Request, response: Response) => request.method === "HEAD" ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers }) : response;

/** Called only after the original member delivery gate, beside the Army gate. */
export async function treasuryAfterMemberGate(request: Request, env: Env, path: string): Promise<Response | null> {
  const asset = (TREASURY_PLAN_ASSETS as readonly string[]).includes(path);
  if (!asset && path !== TREASURY_ACCESS_PATH) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return methodRefused();
  if (path === TREASURY_ACCESS_PATH && new URL(request.url).search) return refusal("bad_request", 400);
  const access = await treasuryAccess(request, env);
  if (access instanceof Response) return bodyless(request, access);
  if (path === TREASURY_ACCESS_PATH) {
    // The Discord read (or any earlier await) is over: the answer is given only to the still-admitted original caller.
    const held = await access.readmit(); if (held) return bodyless(request, held);
    access.check();
    return bodyless(request, privateSiteAsset(apiJson({ format: "olympus-treasury-access-v1", canRead: access.canRead })));
  }
  if (!access.canRead) return bodyless(request, refusal("officer_only", 403, OFFICER_ONLY));
  const response = await env.ASSETS.fetch(request);
  access.check();
  // Asset storage was awaited: no plan byte leaves unless the original caller is still admitted now.
  const held = await access.readmit(); if (held) return bodyless(request, held);
  access.check();
  return bodyless(request, privateSiteAsset(response));
}

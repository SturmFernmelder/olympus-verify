import {consumeRateLimit280,rateLimitHeaders280} from './soft-rate-limit280';
/** .218 officer-tier Treasury plan (owner rulings, 31 Oct 2026: officers and above only; "Either source").
 * Admits a site admin, a currently published Co-Guild Master or Treasurer appointment proved again inside the same
 * admitted read, an officer rank on a CURRENT roster export (the active policy's own ten-rank ladder only, after the launch cut,
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
import { linksNotBefore } from "./db";
import { ROSTER_CURRENT_FOR } from "./roster";
import { DB_NOW } from "./account-generation-contracts";
import { privateSiteAsset } from "./site-access";
import { captureCanonicalRankConfig233, currentDirectiveCanonicalPolicy233, canonicalNativeRole233, CANONICAL_PROFILE233, NATIVE_NAMES233, type CanonicalRankPolicy233 } from './canonical-ranks233';
import { captureLaunchVerification } from './launch-verification227';
import { canonicalOlympusGuildName, FLAGSHIP_GUILD_NAME } from './guild-affiliation229';
import { DIRECTIVE_RANK_NAMES, qualifiedNativeSnapshotSource } from './native-rank-schemes';

/** The planning programme's renderer, financial model, content and stylesheet. Royal Writs stay member-readable. */
export const TREASURY_PLAN_ASSETS = Object.freeze(["/static/treasury-plan207.js", "/static/treasury-plan-model207.js", "/static/treasury-plan-content207.js", "/static/treasury-plan207.css"]);
export const TREASURY_ACCESS_PATH = "/api/treasury-plan/access";
/** CL2-091: two published seat families. The source catalogue retains co_gm
 * as office_19's alias, and treasurer/rank_treasurer as office_86's aliases.
 * Admit only these closed keys with their own original current publication proof;
 * never retarget a signature, migrate the stored map or infer a native rank.
 * Final raw-map, account/session and privacy-generation readmission is unchanged. */
export const TREASURY_APPOINTMENT_SEATS = Object.freeze(["office_19", "office_86", "co_gm", "treasurer", "rank_treasurer"] as const);
/** Officer tier on the Directive ladder (DIRECTIVE_RANK_NAMES, owner ladder of 12 Nov 2026, slots 0-4). */
// Private, frozen lists: nothing outside this module can reach or change them (Codex Root's review of 98dc690, 13 Nov
// 2026: a Set handed out through currentLadder stayed mutable, whatever its TypeScript type said).
const OFFICER_RANKS: readonly string[] = Object.freeze(["Guild Master", "High Council", "Officer", "Officer Alt", "Raid Leader"]);
/** Officer tier on the ORIGINAL v1 ladder (NATIVE_NAMES233), exactly the names dfca7a2 admitted there: its seven-name set
 * intersected with that ladder. "Treasurer" is not on NATIVE_NAMES233, so dfca7a2 could never match it and it is left
 * out. "Stewart" exists only on this ladder (slot 1) and is never offered to the Directive ladder (round 5, 13 Nov 2026). */
const ORIGINAL_OFFICER_RANKS233: readonly string[] = Object.freeze(["Guild Master", "Stewart", "High Council", "Officer", "Officer Alt", "Raid Leader"]);
export type TreasuryLadderPolicy = "original233" | "directive";
const officersOf = (policy: TreasuryLadderPolicy): readonly string[] => policy === "original233" ? ORIGINAL_OFFICER_RANKS233 : policy === "directive" ? OFFICER_RANKS : [];
const HEADER_NAMES = ["Cookie", "Origin", "Sec-Fetch-Site", "X-Olympus"];
const DISCORD_KEYS = ["SITE_GUILD_ID", "GUILD_ID", "DISCORD_BOT_TOKEN", "ROLE_GUILD_MASTER", "ROLE_GUILD_LEADER", "ROLE_OFFICER", "ROLE_RAID_LEADER", "CANONICAL_RANKS233"] as const;
const ROSTER_KEYS = ["QR_NATIVE_ROLE_MAP", "LINKS_NOT_BEFORE", "LINKS_NOT_BEFORE_CLOCK_GATED", "CANONICAL_RANKS233", "VERIFY_MEMBERSHIP_ONLY", "VERIFY_NATIVE_SCOPE", "GUILD_ID"] as const;

/** The configuration values that chose a read. assertSameConfig checks them again after the read's await, so one decision
 * never mixes two configurations (the officer/Army reader discipline). The bound site env is a frozen copy, so in normal
 * operation the check cannot fire; it makes the invariant explicit and testable. */
export function configSnapshot(env: Env, keys: readonly string[]): readonly unknown[] {
  return Object.freeze(keys.map(key => {
    const d=Object.getOwnPropertyDescriptor(env,key);
    if(d&&!Object.hasOwn(d,'value')||!d&&key in env)throw Error('treasury_original_request_held');
    return d?.value;
  }));
}
export function assertSameConfig(env: Env, keys: readonly string[], snapshot: readonly unknown[]): void {
  const current=configSnapshot(env,keys);
  if (keys.length !== snapshot.length || current.some((value, i) => value !== snapshot[i])) throw Error("treasury_original_request_held");
}
// One Treasury page load by a Discord-role officer can cost six reads (the nav check, the route check and the four plan
// files); twenty a minute leaves room for normal reloads while still bounding provider use per account.
export const TREASURY_DISCORD_READS_PER_MINUTE = 20;
const ID = /^\d{17,20}$/;

/** An officer-tier rank name at exactly its index in the given ladder, judged by THAT ladder's officer set (no fallback
 * ladder). The policy names the ladder (default: Directive); the officer names for it stay inside this module, so a
 * name/index pair from one ladder is never read under the other and no caller can alter either list. */
export function officerRank(rank: unknown, index: unknown, names: readonly string[], policy: TreasuryLadderPolicy = "directive"): boolean {
  return typeof rank === "string" && Number.isInteger(index) && officersOf(policy).includes(rank) && names[index as number] === rank;
}

/** The original .233 policy, by the parser's own closed pair (version 1 with CANONICAL_PROFILE233, never "not version 2")
 * and enabled. canonicalNativeRole233 answers only for a parser-issued, enabled policy whose ladder is NATIVE_NAMES233,
 * so a non-null answer for slot 1 ("Stewart", v1-only) is the same origin witness currentDirectiveCanonicalPolicy233 uses. */
function originalCanonicalPolicy233(policy: CanonicalRankPolicy233 | null): policy is CanonicalRankPolicy233 {
  return !!policy && policy.enabled && policy.version === 1 && policy.profile === CANONICAL_PROFILE233
    && canonicalNativeRole233(policy, 1, NATIVE_NAMES233[1]) !== null;
}

export type TreasuryLadder = Readonly<{ policy: TreasuryLadderPolicy; names: readonly string[]; cutoff: number; source: string }>;

/** Two closed cases, nothing else (round 5, 13 Nov 2026; owner ruling of 31 Oct, "Either source"):
 * - the current Directive policy (version 2): DIRECTIVE_RANK_NAMES on the exact qualified native-v2 source;
 * - the ORIGINAL policy still running in production (version 1, CANONICAL_PROFILE233): NATIVE_NAMES233 on the exact
 *   configured native scope (launch.scope.provenance), as dfca7a2 read it, so officers admitted by in-game rank today
 *   keep that route at rollout.
 * Both need the same fences dfca7a2 required: enabled and current configuration, the policy's guild, members-only launch
 * verification on the flagship scope, and an opened launch cut. Absent, disabled, held, other profiles and unknown
 * versions give null. Neither case falls through to the other; the returned object names its policy and carries no
 * permission list. */
export function currentLadder(env: Env): TreasuryLadder | null {
  const canonical=captureCanonicalRankConfig233(env),cutoff=linksNotBefore(env);
  const launch=captureLaunchVerification(env),policy=canonical.policy;
  if(!policy||canonical.mode!=='enabled'||!canonical.current()||env.GUILD_ID!==policy.guildId
    ||launch.mode!=='members-only'||!launch.scope||!launch.current()||canonicalOlympusGuildName(launch.scope.guild)!==FLAGSHIP_GUILD_NAME||!Number.isSafeInteger(cutoff)||cutoff<=0)return null;
  if(currentDirectiveCanonicalPolicy233(policy))
    return Object.freeze({policy:'directive',names:DIRECTIVE_RANK_NAMES,cutoff,source:qualifiedNativeSnapshotSource(launch.scope.guild,launch.scope.realm)});
  if(originalCanonicalPolicy233(policy))
    return Object.freeze({policy:'original233',names:NATIVE_NAMES233,cutoff,source:launch.scope.provenance});
  return null;
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
function rosterOfficerStatement(env: Env, discordId: string, ladder: TreasuryLadder): D1PreparedStatement {
  const officers = ladder.names.flatMap((rank, index) => officerRank(rank, index, ladder.names, ladder.policy) ? [{ rank, index }] : []);
  const pairs = officers.map((_, i) => `(r.rank=?${4 + i * 2} AND r.rank_index=?${5 + i * 2})`).join(" OR ") || "0";
  const values=[discordId,ladder.cutoff,ROSTER_CURRENT_FOR,...officers.flatMap(({rank,index})=>[rank,index])];
  return env.DB.prepare(`${ROSTER_SQL} AND (${pairs}) AND s.source=?${values.length+1} LIMIT 1`)
    .bind(...values,ladder.source);
}
function rosterOfficerResult(out: D1Result | undefined, ladder: TreasuryLadder): boolean {
  const rows = out?.results ?? [];
  return rows.length === 1 && officerRank((rows[0] as { rank?: unknown }).rank, (rows[0] as { rank_index?: unknown }).rank_index, ladder.names, ladder.policy);
}

/** The Discord roles whose holders the Discord path admits under this configuration, or null when that path admits
 * nobody (no bot token, a guild mismatch, or canonical rank roles present but not enabled and current). The gate below
 * and treasuryGateDescription both read this one function (REV-SITEA-3, 12 Nov 2026), so the refusal text cannot name a
 * role the gate does not accept. */
export function treasuryDiscordRoles(env: Env): { guild: string; wanted: string[] } | null {
  const guild = env.SITE_GUILD_ID;
  const wanted = [env.ROLE_GUILD_MASTER, env.ROLE_GUILD_LEADER, env.ROLE_OFFICER, env.ROLE_RAID_LEADER].filter((id): id is string => typeof id === "string" && ID.test(id));
  const canonical=captureCanonicalRankConfig233(env);
  if(canonical.present){
    if(canonical.mode!=='enabled'||!canonical.policy||!canonical.current()||guild!==canonical.policy.guildId)return null;
    for(const rank of canonical.policy.ranks.slice(0,5))if(!wanted.includes(rank.roleId))wanted.push(rank.roleId);
  }
  if (!env.DISCORD_BOT_TOKEN || !ID.test(guild ?? "") || env.GUILD_ID !== guild || !wanted.length) return null;
  return { guild: guild as string, wanted };
}

// Member-facing names follow the owner's ten-rank ladder (12 Nov 2026): the runtime's "Guild Master" rank is shown as
// Leader, and runtime-only names (Stewart, Treasurer) are not named. On the original v1 ladder the in-game "Stewart" slot
// is the High Council rank (NATIVE_CANONICAL_INDEX233[1] is canonical high-council), so it is shown as High Council.
const ROSTER_LABELS: Readonly<Record<string, string>> = Object.freeze({ "Guild Master": "Leader", "High Council": "High Council", "Officer": "Officer", "Officer Alt": "Officer Alt", "Raid Leader": "Raid Leader" });
const ORIGINAL_ROSTER_LABELS233: Readonly<Record<string, string>> = Object.freeze({ ...ROSTER_LABELS, "Stewart": "High Council" });
const DISCORD_LABELS: Readonly<Record<string, string>> = Object.freeze({ "guild-master": "Guild Master", "high-council": "High Council", "officer": "Officer", "officer-alt": "Officer Alt", "raid-leader": "Raid Leader" });
const listOf = (items: readonly string[]) => items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];

/** REV-SITEA-3 (12 Nov 2026): who the gate admits under THIS configuration, in one sentence for the refusal page. Each
 * clause is built from the same reads the gate uses (currentLadder with officerRank, treasuryDiscordRoles), so a path
 * the configuration closes is not named. Appointments and site administrators are configuration-independent paths. */
export function treasuryGateDescription(env: Env): string {
  const clauses: string[] = [];
  const ladder = currentLadder(env);
  if (ladder) {
    const labels = ladder.policy === "original233" ? ORIGINAL_ROSTER_LABELS233 : ROSTER_LABELS;
    const ranks = [...new Set(ladder.names.flatMap((rank, index) => officerRank(rank, index, ladder.names, ladder.policy) && labels[rank] ? [labels[rank]!] : []))];
    if (ranks.length) clauses.push(`${listOf(ranks)} rank on the latest verified roster`);
  }
  const discord = treasuryDiscordRoles(env);
  if (discord) {
    const canonical = captureCanonicalRankConfig233(env);
    const named = (canonical.present && canonical.policy ? canonical.policy.ranks.slice(0, 5) : []).filter(rank => discord.wanted.includes(rank.roleId)).map(rank => DISCORD_LABELS[rank.key] ?? rank.name);
    // Without canonical rank roles, the configured legacy keys name their own roles (ROLE_GUILD_LEADER is the Guild Master ID).
    const legacy: Array<[unknown, string]> = [[env.ROLE_GUILD_MASTER, "Guild Master"], [env.ROLE_GUILD_LEADER, "Guild Master"], [env.ROLE_OFFICER, "Officer"], [env.ROLE_RAID_LEADER, "Raid Leader"]];
    const extra = legacy.filter(([id, label]) => typeof id === "string" && discord.wanted.includes(id) && !named.includes(label)
      && !(canonical.policy?.ranks.slice(0, 5).some(rank => rank.roleId === id))).map(([, label]) => label);
    const roles = [...new Set([...named, ...extra])];
    if (roles.length) clauses.push(`the Discord ${listOf(roles)} role${roles.length > 1 ? "s" : ""}`);
  }
  clauses.push("the holders of the published Co-Guild Master and Lord High Treasurer seats", "site administrators");
  // Round 3 (12 Nov 2026): with only the two configuration-independent paths left, the sentence is a plain pair, not a list.
  if (clauses.length === 2) return `The treasury programme and financial model are open to ${clauses[0]} and to ${clauses[1]}.`;
  return `The treasury programme and financial model are open to: ${clauses.slice(0, -1).join("; ")}; and ${clauses[clauses.length - 1]}.`;
}

async function discordOfficerRole(env: Env, discordId: string, check: () => void): Promise<boolean> {
  const roles = treasuryDiscordRoles(env);
  if (!roles) return false;
  const { guild, wanted } = roles;
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
  const authority = await capturePublishedOfficeAuthority(env, subject.discordId, TREASURY_APPOINTMENT_SEATS);
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
      allows: (out: D1Result | undefined) => rosterOfficerResult(out, ladder),
      check: () => assertSameConfig(env, ROSTER_KEYS, rosterConfig) };
    const roster = await admittedRead(env, ctx, "applicantWrite", [proof.statement()]);
    check(); proof.check();
    if (roster === FENCE_REFUSED) return refusal("account_changed", 403);
    if (proof.allows(roster[0])) return { canRead: true, source: "roster", check, readmit: () => readmit(proof) };
  }
  // Only the Discord path costs a provider call, so only it is limited (per isolate, per account).
  const rateLimitAt188280=consumeRateLimit280(`tpd:${subject.discordId}`,TREASURY_DISCORD_READS_PER_MINUTE,60);
  if (rateLimitAt188280.limited) return privateSiteAsset(apiJson({ error: "slow_down", message: "Too many checks. Wait a minute and try again." }, 429, rateLimitHeaders280(rateLimitAt188280)));
  // Discord authority is one fresh provider-response snapshot per request, before asset storage.
  // A caller whose role changes during that asset await can still receive that one response. Later requests
  // check a new provider response; no cross-request result cache or strong upstream consistency
  // is claimed. The final Native admission rechecks original identity/session/standing/ban,
  // not an atomic upstream Discord-role revocation. Refused members never read plan storage.
  if (await discordOfficerRole(env, subject.discordId, check)) return { canRead: true, source: "discord", check, readmit };
  return { canRead: false, source: null, check, readmit };
}

const OFFICER_ONLY = "The treasury programme is for officers and above: Guild Master, High Council, Officers, Officer Alts, Raid Leaders, the Lord High Treasurer and the Co-Guild Master.";
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
    // REV-SITEA-3 (12 Nov 2026): a refused caller also gets the gate's own description, which the refusal page shows.
    return bodyless(request, privateSiteAsset(apiJson(access.canRead ? { format: "olympus-treasury-access-v1", canRead: true }
      : { format: "olympus-treasury-access-v1", canRead: false, admits: treasuryGateDescription(env) })));
  }
  if (!access.canRead) return bodyless(request, refusal("officer_only", 403, OFFICER_ONLY));
  const response = await env.ASSETS.fetch(request);
  access.check();
  // Asset storage was awaited: no plan byte leaves unless the original caller is still admitted now.
  const held = await access.readmit(); if (held) return bodyless(request, held);
  access.check();
  return bodyless(request, privateSiteAsset(response));
}

export {registerCommunityData,communityDataNames,communityEraseStatements,communityExportPlan,communityExport,type Eraser,type ExportPlan,type Exporter} from './community-data-registry';
import { privacyGenerationLiteralFenceSql, privacyAccountIncarnation, privacyAccountIncarnationLiteralFenceSql } from './privacy-serving-authority';
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
/**
 * .56 (1 Oct 2026): the adapter contract for the community modules ported from Olympus Forever (consolidation batch 1
 * of Codex's keeper adapter map, evidence/forever-keeper-adapter-map.md, 1 Oct 01:07 UTC).
 *
 * One identity: the keeper's signed `__Host-olg` session (site-core.ts readSession) checked against site_users'
 * session_version. One set of facts, all read from keeper state and never from a donor table: denied, in the server,
 * a character on the roster (`characters.status = 'member'`, the keeper's in-game proof), banned (`members.banned`),
 * SITE_ADMINS. Capabilities are derived from those facts and name requirements, not grants:
 *   authenticatedIdentity   a valid session
 *   applicantWrite          not denied and in the server (what site-api.ts requires of every save today)
 *   confirmedGuildData      applicantWrite, a roster-confirmed character, not banned
 *   communityStaff          applicantWrite and SITE_ADMINS (distinct from the bot's officer roles, which a site session
 *                           cannot see; a staff capability for Discord roles would be a separate, reviewed design)
 * No capability here ever writes a Discord role (roles.ts is the only writer) or grants admission.
 *
 * Writes: a community write is one D1 batch whose FIRST statement is admitted by `fenceSql` (the live site_users row
 * with the session's version, not denied, in the server, and for guild data a roster-confirmed, unbanned member, AND
 * the session's expiry, bound from the cookie, still ahead of the database's own clock) and stores a random write
 * nonce; every later statement of the batch requires that nonce, so a refused first statement leaves the rest without
 * effect. The admission instant is the moment D1 executes that first statement: every fact it tests is read then,
 * including the clock (`strftime('%s','now')` in the statement, never a JavaScript time captured earlier; Codex's
 * review of .56, 1 Oct 01:50 UTC). `admitted` also refuses an already-expired session before any SQL as a zero-I/O
 * fast path. A refused write is answered by re-reading the facts (`refusal`): signed_out, denied, not_member,
 * guild_unconfirmed, or conflict when the facts still hold (a compare-and-set lost).
 *
 * Time: every persisted value is Unix seconds (db.ts now()); community-time.ts converts at the DTO boundary only.
 * Character names: community-names.ts. Labels are keyed by `communityKey`, the FULL normalized name (a hyphen is never
 * a cut), and bound to the keeper's proof only through `resolveCharacter`; the keeper's own proof key
 * (codes.ts normalizeCharacter, which cuts at the first hyphen) is unchanged and used for proof only.
 * Erasure and export: every feature registers its statements here (registerCommunityData); site-admin.ts
 * deleteSiteData runs them in the same batch as the keeper's own deletions, and the account copy (site-export.ts) runs
 * every feature's export statements in the SAME admitted batch as the keeper's own (.74: one transaction, one instant).
 */
import type { Env } from "./env";
import { now } from "./db";
import { apiJson, isSiteAdmin, readSession, type SiteUser } from "./site-core";

export const COMMUNITY_FEATURES = ["directory", "crafting", "events", "attendance", "trials", "restrictions", "departures", "contributions", "privacy_intake", "rights", "census"] as const;
export type CommunityFeature = (typeof COMMUNITY_FEATURES)[number];

/** COMMUNITY_FEATURES is a comma list of the names above; unknown names are ignored; crafting needs directory. */
export function communityFeatures(env: Env): Set<CommunityFeature> {
  const on = new Set<CommunityFeature>();
  for (const part of (env.COMMUNITY_FEATURES ?? "").split(",")) {
    const k = part.trim().toLowerCase();
    if ((COMMUNITY_FEATURES as readonly string[]).includes(k)) on.add(k as CommunityFeature);
  }
  if (on.has("crafting") && !on.has("directory")) on.delete("crafting"); // the donor's rule: crafting is part of a listed profile
  if (on.has("attendance") && !on.has("events")) on.delete("attendance");
  return on;
}

export interface CommunitySubject {
  discordId: string;
  privacyGeneration:string|null;
  accountIncarnation:string;
  /** Private original read witness. DTOs never serialize this reference. */
  originalSession:OriginalSiteSession;
  sessionVersion: number;
  /** Unix seconds, from the cookie: bound into the fence and compared with the database clock inside the first statement (.59); the code check in admitted() is only a zero-I/O fast refusal. */
  expiresAt: number;
}

export interface CommunityFacts {
  signedIn: boolean;
  denied: boolean;
  inServer: boolean;
  /** a character of this account is on the officer-exported roster (characters.status = 'member') */
  confirmedGuild: boolean;
  banned: boolean;
  staff: boolean;
  /** listed in COMMUNITY_ORGANIZERS (SITE_ADMINS organize anyway) */
  organizerListed: boolean;
}

export interface CommunityCapabilities {
  authenticatedIdentity: boolean;
  applicantWrite: boolean;
  confirmedGuildData: boolean;
  communityStaff: boolean;
  /** .59: may create, edit and cancel events and record attendance: confirmedGuildData and (SITE_ADMINS or COMMUNITY_ORGANIZERS) */
  organizer: boolean;
}

/** .59: Discord ids allowed to organize events besides SITE_ADMINS (comma list). Never a role grant. */
export const organizerIds = (env: Env): Set<string> => new Set((env.COMMUNITY_ORGANIZERS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s)));

/**
 * .59: SQL true when the account named by `idExpr` qualifies for guild data right now: in the server, not denied, a
 * roster-confirmed character, not banned. The same facts as capabilitiesOf, for use inside listing and counting
 * statements (who holds a place, who appears in a list) so nothing is decided on a stale read.
 */
export const qualifiesSql = (idExpr: string): string =>
  `EXISTS (SELECT 1 FROM site_users qu WHERE qu.discord_id = ${idExpr} AND qu.in_server = 1 AND qu.denied = 0)
   AND EXISTS (SELECT 1 FROM characters qc WHERE qc.discord_id = ${idExpr} AND qc.status = 'member')
   AND NOT EXISTS (SELECT 1 FROM members qm WHERE qm.discord_id = ${idExpr} AND qm.banned = 1)`;

export interface CommunityContext {
  subject: CommunitySubject | null;
  user: SiteUser | null;
  facts: CommunityFacts;
  capabilities: CommunityCapabilities;
  features: Set<CommunityFeature>;
}

const NOBODY: CommunityFacts = { signedIn: false, denied: false, inServer: false, confirmedGuild: false, banned: false, staff: false, organizerListed: false };

export function capabilitiesOf(f: CommunityFacts): CommunityCapabilities {
  const applicantWrite = f.signedIn && !f.denied && f.inServer;
  const confirmedGuildData = applicantWrite && f.confirmedGuild && !f.banned;
  return {
    authenticatedIdentity: f.signedIn,
    applicantWrite,
    confirmedGuildData,
    communityStaff: applicantWrite && f.staff,
    organizer: confirmedGuildData && (f.staff || f.organizerListed),
  };
}

/** The facts for one account, from keeper tables only. */
export async function communityFacts(env: Env, user: SiteUser): Promise<CommunityFacts> {
  const row = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM characters WHERE discord_id = ?1 AND status = 'member') AS n, (SELECT banned FROM members WHERE discord_id = ?1) AS banned",
  )
    .bind(user.discord_id)
    .first<{ n: number; banned: number | null }>();
  return {
    signedIn: true,
    denied: !!user.denied,
    inServer: !!user.in_server,
    confirmedGuild: (row?.n ?? 0) > 0,
    banned: !!row?.banned,
    staff: isSiteAdmin(env, user.discord_id),
    organizerListed: organizerIds(env).has(user.discord_id),
  };
}

/** The context for a request: the keeper session, the live row, the facts and what they allow. Never throws for a stranger. */
export async function communityContext(env: Env, request: Request): Promise<CommunityContext> {
  const features = communityFeatures(env);
  const s = await readSession(env, request);
  if (!s) return { subject: null, user: null, facts: NOBODY, capabilities: capabilitiesOf(NOBODY), features };
  assertOriginalSiteSessionRead(s);
  const user = await env.DB.prepare(`SELECT * FROM site_users WHERE discord_id = ?1 AND ${privacyGenerationLiteralFenceSql("discord_id",s.g)} AND ${privacyAccountIncarnationLiteralFenceSql("account_incarnation",s.n)}`).bind(s.u).first<SiteUser>();
  assertOriginalSiteSessionRead(s);
  if (!user || user.session_version !== s.v || user.account_incarnation !== s.n) return { subject: null, user: null, facts: NOBODY, capabilities: capabilitiesOf(NOBODY), features };
  user.privacyGeneration=s.g;user.privacyOriginalSession=s;
  assertOriginalSiteSessionRead(s);const facts = await communityFacts(env, user);assertOriginalSiteSessionRead(s);
  return { subject: Object.freeze({ discordId:s.u,sessionVersion:s.v,expiresAt:s.e,privacyGeneration:s.g,accountIncarnation:s.n,originalSession:s }), user, facts, capabilities: capabilitiesOf(facts), features };
}

/** What the page may know: the capabilities, the flags, and the member's own id (which /api/me already gives them). */
export function contextDto(ctx: CommunityContext) {
  const features: Record<string, boolean> = {};
  for (const f of COMMUNITY_FEATURES) features[f] = ctx.features.has(f);
  return { subject: ctx.subject ? { discordId: ctx.subject.discordId } : null, capabilities: ctx.capabilities, features, now: now() };
}

// ---------- the write fence ----------

/** .71: `authenticatedIdentity` is the reader boundary for a member's own copy: a valid session alone, denied or departed or not. */
export type FenceCapability = "authenticatedIdentity" | "applicantWrite" | "confirmedGuildData";

/** The database's own clock, in Unix seconds, read inside the statement that uses it. */
export const DB_NOW = "CAST(strftime('%s', 'now') AS INTEGER)";

/**
 * The SQL that admits a community write's first statement. `id`, `version` and `expires` are the 1-based positions of
 * the three bound parameters (the member's Discord id, the session version, the cookie's expiry in Unix seconds); the
 * caller binds them at those positions. Mirrors capabilitiesOf exactly, evaluated inside the statement so nothing can
 * change between the check and the write, and the expiry is compared with the database clock at execution.
 */
export function fenceSql(cap:FenceCapability,id:number,version:number,expires:number,generation:string|null,accountIncarnation:string):string{
 const birth=privacyAccountIncarnationLiteralFenceSql('fu.account_incarnation',accountIncarnation),lifecycle=privacyGenerationLiteralFenceSql('fu.discord_id',generation);
 if(cap==='authenticatedIdentity')return `EXISTS(SELECT 1 FROM site_users fu WHERE fu.discord_id=?${id} AND fu.session_version=?${version} AND ${birth} AND ${lifecycle}) AND ?${expires}>${DB_NOW}`;
 const applicant=`EXISTS(SELECT 1 FROM site_users fu WHERE fu.discord_id=?${id} AND fu.session_version=?${version} AND fu.denied=0 AND fu.in_server=1 AND ${birth} AND ${lifecycle}) AND ?${expires}>${DB_NOW}`;
 if(cap==='applicantWrite')return applicant;
 return `${applicant} AND EXISTS(SELECT 1 FROM characters fc WHERE fc.discord_id=?${id} AND fc.status='member') AND NOT EXISTS(SELECT 1 FROM members fm WHERE fm.discord_id=?${id} AND fm.banned=1)`;
}

/** Existing read identity is retained; these copies mint no session or operation authority. */
export function captureCommunitySubject(value:CommunitySubject):Readonly<{subject:Readonly<CommunitySubject>;check:()=>void}>{
 const names=['discordId','sessionVersion','expiresAt','privacyGeneration','accountIncarnation','originalSession'] as const;
 const slots=names.map(key=>{const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error('privacy_community_original_held');return Object.freeze({key,value:d.value});});
 const row=Object.fromEntries(slots.map(s=>[s.key,s.value])) as unknown as CommunitySubject;
 const s=row.originalSession;assertOriginalSiteSessionRead(s);
 if(row.discordId!==s.u||row.sessionVersion!==s.v||row.expiresAt!==s.e||row.privacyGeneration!==s.g||privacyAccountIncarnation(row.accountIncarnation)!==s.n)throw Error('privacy_community_original_held');
 const check=()=>{assertOriginalSiteSessionRead(s);for(const slot of slots){const d=Object.getOwnPropertyDescriptor(value,slot.key);if(!d||!Object.hasOwn(d,'value')||d.value!==slot.value)throw Error('privacy_community_original_held');}};
 check();return Object.freeze({subject:Object.freeze(row),check});
}
export const FENCE_REFUSED = Symbol("fence_refused");

/** 22 base64url characters from 16 random bytes: write nonces and member refs. */
export function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Runs an admitted write. The code check of the expiry is a zero-I/O fast refusal only; the fence inside the first
 * statement decides against the database clock. The first statement must have changed a row (the fence held and any
 * compare-and-set matched); otherwise FENCE_REFUSED, and the caller answers with `refusal`. The later statements must
 * each require the first statement's nonce (see the module header).
 */
export async function admitted(env: Env, ctx: CommunityContext, statements: D1PreparedStatement[]): Promise<D1Result[] | typeof FENCE_REFUSED> {
  if (!ctx.subject || ctx.subject.expiresAt <= now() || statements.length === 0) return FENCE_REFUSED;
  const originalSubject=ctx.subject,capture=captureCommunitySubject(originalSubject),original=capture.subject;capture.check();
  const probe=env.DB.prepare(`SELECT CASE WHEN ${fenceSql("authenticatedIdentity",1,2,3,original.privacyGeneration,original.accountIncarnation)} THEN 1 ELSE json_extract('privacy_community_request_refused','$') END AS admitted`).bind(original.discordId,original.sessionVersion,original.expiresAt);
  capture.check();const results = (await env.DB.batch([probe,...statements])).slice(1);capture.check();if(ctx.subject!==originalSubject)throw Error("privacy_community_original_held");
  if ((results[0]?.meta?.changes ?? 0) === 0) return FENCE_REFUSED;
  return results;
}

/**
 * .66: the reader admission boundary (Codex's trial and calendar reviews, 1 Oct 02:50 UTC). A read's payload statements
 * run in ONE batch behind a first statement that re-states the reader's facts (fenceSql: the live row, the session
 * version, the cookie's expiry by the database clock, and for guild data the roster proof and no ban) at that instant;
 * when it does not hold the payload is discarded unread and the caller answers with `refusal`, so a viewer denied,
 * signed out, banned, departed or expired between the context read and the payload cannot receive it. Returns the
 * payload results without the probe.
 */
export async function admittedRead(env: Env, ctx: CommunityContext, cap: FenceCapability, statements: D1PreparedStatement[]): Promise<D1Result[] | typeof FENCE_REFUSED> {
  if (!ctx.subject) return FENCE_REFUSED;
  return admittedReadAs(env, ctx.subject, cap, statements);
}
/** .75: the same reader admission for a module that holds the acting session itself (community-contributions.ts readAs). */
export async function admittedReadAs(env: Env, subject: CommunitySubject, cap: FenceCapability, statements: D1PreparedStatement[]): Promise<D1Result[] | typeof FENCE_REFUSED> {
  if (subject.expiresAt <= now()) return FENCE_REFUSED;
  const originalSubject=subject,capture=captureCommunitySubject(originalSubject);subject=capture.subject;capture.check();
  const probe = env.DB.prepare(`SELECT (${fenceSql(cap, 1, 2, 3,subject.privacyGeneration,subject.accountIncarnation)}) AS ok`).bind(subject.discordId, subject.sessionVersion, subject.expiresAt);
  capture.check();const results = await env.DB.batch([probe, ...statements]);capture.check();
  if (((results[0]?.results[0] as { ok?: number } | undefined)?.ok ?? 0) !== 1) return FENCE_REFUSED;
  return results.slice(1);
}

/** Why a write was refused, decided from fresh facts: the session, the standing, the guild proof, or just a lost race. */
export async function refusal(env: Env, request: Request, cap: FenceCapability): Promise<Response> {
  const ctx = await communityContext(env, request);
  if (!ctx.subject) return apiJson({ error: "signed_out", message: "You are signed out. Sign in with Discord again." }, 401);
  if (ctx.facts.denied) return apiJson({ error: "denied", message: "Your registration with Olympus has been permanently denied." }, 403);
  if (!ctx.facts.inServer) return apiJson({ error: "not_member", message: "You are no longer in Asmongold's Discord server, so this cannot be saved. Rejoin it, then sign in again." }, 403);
  if (cap === "confirmedGuildData" && !ctx.capabilities.confirmedGuildData) {
    return apiJson({ error: "guild_unconfirmed", message: "This is for members whose character the officers' roster export has confirmed. Verify a character first; the roster then confirms it." }, 403);
  }
  return apiJson({ error: "conflict", message: "Someone else saved this first, or the page is out of date. Reload and try again." }, 409);
}

// Erasure/export registry implementation is reexported from the data-only leaf above.

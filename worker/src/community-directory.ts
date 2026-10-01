/**
 * .57 (1 Oct 2026): the member directory and crafting offers, consolidation batch 2 of Codex's adapter map, ported from
 * Olympus Forever's src/directory.ts and src/crafting.ts (frozen candidate manifest 296db2c8…) onto the keeper's door
 * (community-context.ts): the keeper session, keeper facts, the write fence with nonces, seconds, community keys.
 *
 * What a member may say about themselves, opt-in: a main character, a raid role, up to four professions with a skill,
 * up to ten claimed alts, up to fifty crafting offers. A profile is shown to other members only while `listed` AND its
 * owner still qualifies at read time (in the server, not denied, a roster-confirmed character, not banned): the same
 * predicate as the write fence, evaluated in the listing query, so a member who stopped qualifying disappears at once.
 * Other members see a member by their random `ref` and display name, never a Discord id.
 *
 * Names (Codex, 1 Oct 01:19): a main or an alt is a LABEL. At save time it is run through community-names.ts
 * resolveCharacter: `proven` (the keeper holds this exact full name bound to this account) is recorded as
 * source/proof "keeper", `unproven` as "self", and `conflict` (bound to another account, a different full name under
 * the same proof key, or a GUID another account holds) refuses the whole save (409 name_conflict) and is audited for
 * review; nothing is ever merged or overwritten on a collision. Rows are keyed by communityKey (the full name).
 *
 * Writes: PUT /api/community/profile replaces whole sets (professions, alts, crafts), with a revision compare-and-set;
 * the first statement carries the fence and the listing-room check (HL-1: the 2,501st listed profile is refused with
 * 409 directory_full, in the statement, so two racing saves cannot both take the last place); every later statement
 * requires the write nonce. An unchanged save writes nothing and says so. Lists are read with a keyset cursor that
 * carries the digest of the whole visible order (D20), so a rename, an unlisting or a departure between pages is
 * 409 cursor_stale and the page starts again instead of skipping or repeating a member.
 *
 * Retention: a profile whose owner stops qualifying gets `departed_at`; thirty days later the maintenance step deletes
 * it (professions, alts, offers and the ref with it); a return clears the clock. Erasure and export are registered
 * with community-context.ts, so deleteSiteData and the account copy cover every row here. Turning the feature off
 * hides it; it never erases a member's own data, and the maintenance step runs regardless.
 *
 * .64 (Codex's independent directory review on .59, 1 Oct 02:21 UTC; five grouped CHANGES):
 *  1. Capacity truth: a save that would list a profile at the limit now SAVES everything else and leaves the profile
 *     unlisted (listed is decided inside the statement), answered 409 directory_full with `saved: true` and the saved
 *     profile; nothing a member typed is dropped. The audit row carries the listed state the statement produced.
 *  2. Staff writes carry the staff fence: adminAltDecision's first statement requires the admin's live session row,
 *     session version and cookie expiry (fenceSql applicantWrite; no guild proof, by design) and every later row the
 *     nonce; the current-page header is required of staff writes exactly as of member writes.
 *  3. Payload eligibility: the listing's scan and its hydration, and the search's owner scan and its offers, run in
 *     ONE batch (one transaction) and every payload statement repeats VISIBLE_OWNER, so a denial, ban, departure or
 *     unlisting between the scan and the payload cannot expose a row, and counts and cursors describe one instant.
 *  4. The crafting cursor carries the digest of the visible order (display name, ref and profile revision of every
 *     qualifying owner with a matching offer) and is 409 cursor_stale when that order changed (D20), like the directory.
 *  5. Name/proof truth at write time: the binding facts resolveCharacter read (no keeper row for a self label; for a
 *     keeper-proven label the exact row, bound to this account, with its name and GUID, and no other account on that
 *     GUID) are re-stated inside the first statement, so a label whose binding changed between resolution and the
 *     write is refused (name_conflict if it now collides, else 409 conflict to reload), never saved as stale proof.
 *
 * .72 (Codex's independent directory reader review of .66, 1 Oct 03:55 UTC): every payload here is read under the
 * reader's admission. The four reads (own profile, listing, search, staff review) run behind `admittedRead` (guild data
 * for members, the staff fence for staff), so a reader denied, departed, signed out, erased or expired between the
 * context read and the payload batch receives a refusal and no row; a save's pre-write state and the fallback that
 * explains a refusal are admitted reads too; and the saved profile a successful save answers is read as the LAST
 * statements of the write's own batch (the same transaction and instant as the fence), so a committed save is
 * acknowledged with what it wrote, never undone, and never followed by a fresh unadmitted read.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, readJson, type SiteUser } from "./site-core";
import { admitted, admittedRead, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { refAfter } from "./community-refs";
import { communityKey, resolveCharacter, validateName } from "./community-names";
import { secondsToIso } from "./community-time";

export const PROFESSIONS = ["alchemy", "blacksmithing", "enchanting", "engineering", "herbalism", "leatherworking", "mining", "skinning", "tailoring", "cooking", "fishing", "first_aid"] as const;
export type Profession = (typeof PROFESSIONS)[number];
export const RAID_ROLES = ["tank", "healer", "damage"] as const;
export type RaidRole = (typeof RAID_ROLES)[number];
export const LIMITS = { maxProfessions: 4, maxAlts: 10, nameMin: 2, nameMax: 40, skillMax: 450, maxCrafts: 50, recipeMin: 2, recipeMax: 60, professions: PROFESSIONS } as const;
export const PAGE_SIZE = 100;
/** Listed profiles one read evaluates; also the directory's size (HL-1). COMMUNITY_DIRECTORY_LIMIT overrides it (1..10000). */
export const DEFAULT_SCAN_LIMIT = 2500;
export const scanLimit = (env: Env): number => {
  const n = Number.parseInt(env.COMMUNITY_DIRECTORY_LIMIT ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : DEFAULT_SCAN_LIMIT;
};
/** Thirty days after the owner stopped qualifying (Viktor's ordinary-departure horizon, reused by the donor; our proposal). */
export const DEPARTED_RETENTION_S = 30 * 86400;
const REF = /^[A-Za-z0-9_-]{22}$/;
const DISPLAY = "COALESCE(u.nick, u.global_name, u.username, '')";
/** The owner still qualifies: the fence's facts, for the listing and the search (aliases p = profile, u = site_users). */
const VISIBLE_OWNER = `u.in_server = 1 AND u.denied = 0
  AND EXISTS (SELECT 1 FROM characters vc WHERE vc.discord_id = p.discord_id AND vc.status = 'member')
  AND NOT EXISTS (SELECT 1 FROM members vm WHERE vm.discord_id = p.discord_id AND vm.banned = 1)`;
const roomSql = (limitParam: string) =>
  `(SELECT COUNT(*) FROM (SELECT 1 FROM community_profiles rp JOIN site_users ru ON ru.discord_id = rp.discord_id WHERE rp.listed = 1 LIMIT ${limitParam})) < ${limitParam}`;
const ADMITTED = "EXISTS (SELECT 1 FROM community_profiles WHERE discord_id = ?1 AND write_nonce = ?2)";

// ---------- shapes ----------
type ProfileRow = { discord_id: string; ref: string; revision: number; listed: number; main_name: string | null; main_key: string | null; main_source: string | null; main_updated_at: number | null; raid_role: RaidRole | null; role_updated_at: number | null; departed_at: number | null };
type ProfessionRow = { discord_id: string; profession: Profession; skill: number | null; updated_at: number };
type AltRow = { discord_id: string; name: string; name_key: string; status: "claimed" | "officer_confirmed" | "rejected"; proof: "self" | "keeper"; claimed_at: number; reviewed_by: string | null; reviewed_at: number | null; updated_at: number };
export type CraftRow = { discord_id: string; profession: Profession; recipe_name: string; recipe_key: string; updated_at: number };
const PROFILE_COLUMNS = "discord_id, ref, revision, listed, main_name, main_key, main_source, main_updated_at, raid_role, role_updated_at, departed_at";

function describe(p: ProfileRow, professions: ProfessionRow[], alts: AltRow[], crafts: CraftRow[], own: boolean) {
  return {
    main: p.main_name !== null ? { name: p.main_name, source: p.main_source, updatedAt: secondsToIso(p.main_updated_at!) } : null,
    raidRole: p.raid_role !== null ? { value: p.raid_role, updatedAt: secondsToIso(p.role_updated_at!) } : null,
    professions: [...professions].sort((a, b) => PROFESSIONS.indexOf(a.profession) - PROFESSIONS.indexOf(b.profession)).map((r) => ({ name: r.profession, skill: r.skill, updatedAt: secondsToIso(r.updated_at) })),
    alts: alts.filter((a) => own || a.status !== "rejected").sort((a, b) => (a.name_key < b.name_key ? -1 : a.name_key > b.name_key ? 1 : 0)).map((a) => ({ name: a.name, status: a.status, proof: a.proof, updatedAt: secondsToIso(a.updated_at) })),
    crafts: [...crafts].sort((a, b) => (a.recipe_key < b.recipe_key ? -1 : a.recipe_key > b.recipe_key ? 1 : 0)).map((c) => ({ profession: c.profession, recipe: c.recipe_name, source: "self" as const, updatedAt: secondsToIso(c.updated_at) })),
  };
}

interface Own { profile: ProfileRow | null; professions: ProfessionRow[]; alts: AltRow[]; crafts: CraftRow[]; ref: string | null }
/** The member's own rows: five statements, run behind the reader's admission, as the tail of a write's batch (.72) or in the account copy's one batch (.74). */
const ownStatements = (env: Env, id: string): D1PreparedStatement[] => [
  env.DB.prepare(`SELECT ${PROFILE_COLUMNS} FROM community_profiles WHERE discord_id = ?1`).bind(id),
  env.DB.prepare("SELECT discord_id, profession, skill, updated_at FROM community_professions WHERE discord_id = ?1").bind(id),
  env.DB.prepare("SELECT discord_id, name, name_key, status, proof, claimed_at, reviewed_by, reviewed_at, updated_at FROM community_alt_claims WHERE discord_id = ?1").bind(id),
  env.DB.prepare("SELECT discord_id, profession, recipe_name, recipe_key, updated_at FROM community_craft_offers WHERE discord_id = ?1").bind(id),
  env.DB.prepare("SELECT ref FROM community_refs WHERE discord_id = ?1").bind(id),
];
function ownFrom([p, prof, alts, crafts, ref]: D1Result[]): Own {
  return { profile: ((p!.results as ProfileRow[])[0] ?? null), professions: prof!.results as ProfessionRow[], alts: alts!.results as AltRow[], crafts: crafts!.results as CraftRow[], ref: ((ref!.results as { ref: string }[])[0]?.ref ?? null) };
}
/** .72: the member's own rows behind the reader's admission (guild data, as the member routes require). */
async function readOwnAdmitted(env: Env, ctx: CommunityContext, id: string): Promise<Own | typeof FENCE_REFUSED> {
  const out = await admittedRead(env, ctx, "confirmedGuildData", ownStatements(env, id));
  return out === FENCE_REFUSED ? FENCE_REFUSED : ownFrom(out);
}
function ownShape(own: Own) {
  if (!own.profile) return { ref: own.ref, revision: 0, listed: false, main: null, raidRole: null, professions: [], alts: [], crafts: own.crafts.map((c) => ({ profession: c.profession, recipe: c.recipe_name, source: "self" as const, updatedAt: secondsToIso(c.updated_at) })) };
  const p = own.profile;
  return { ref: p.ref, revision: p.revision, listed: p.listed === 1, ...describe(p, own.professions, own.alts, own.crafts, true) };
}

// ---------- cursors and the order digest ----------
const b64uEncode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b64uDecode(raw: string): string {
  const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (raw.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export const encodeCursor = (parts: unknown[]) => b64uEncode(JSON.stringify(parts));
/** The JSON array a cursor carries, or null for none; anything else is invalid. */
export function cursorParts(raw: string | null): unknown[] | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) return "invalid";
  try {
    const parts: unknown = JSON.parse(b64uDecode(raw));
    return Array.isArray(parts) ? parts : "invalid";
  } catch {
    return "invalid";
  }
}
/** 32 hex characters over the visible order, so a cursor knows whether its list still exists (D20). */
export async function orderDigest(keys: unknown[]): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(keys)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;

// ---------- recipes ----------
export const normalizeRecipe = (raw: string) => raw.normalize("NFC").trim().replace(/\s+/g, " ");
export const recipeKeyOf = (normalized: string) => normalized.toLowerCase();
const RECIPE_TEXT = /^[\p{L}\p{N} '\-:,()]+$/u;
const UNSAFE = /[\p{Cc}\u202A-\u202E\u2066-\u2069\uFEFF]|\p{Cs}/u;

// ---------- the save: parsing ----------
class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const FIELDS = ["revision", "listed", "main", "raidRole", "professions", "alts", "crafts"] as const;
interface Input { revision: number; listed?: boolean; main?: { name: string; key: string } | null; raidRole?: RaidRole | null; professions?: { profession: Profession; skill: number | null }[]; alts?: { name: string; key: string }[]; crafts?: { profession: Profession; recipe: string; key: string }[] }
function nameOf(value: unknown, code: string): { name: string; key: string } {
  const raw = isRecord(value) ? value.name : value;
  const v = validateName(raw);
  if (!v.ok) throw new Bad(code);
  return { name: v.name, key: v.key };
}
export function parseProfileInput(body: Record<string, unknown>): Input {
  for (const k of Object.keys(body)) if (!(FIELDS as readonly string[]).includes(k)) throw new Bad("invalid_request");
  const { revision } = body;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Bad("invalid_revision");
  const input: Input = { revision };
  if (body.listed !== undefined) {
    if (typeof body.listed !== "boolean") throw new Bad("invalid_listed");
    input.listed = body.listed;
  }
  if (body.main !== undefined) input.main = body.main === null ? null : nameOf(body.main, "invalid_main");
  if (body.raidRole !== undefined) {
    const raw = isRecord(body.raidRole) ? body.raidRole.value : body.raidRole;
    if (raw !== null && !(RAID_ROLES as readonly unknown[]).includes(raw)) throw new Bad("invalid_raid_role");
    input.raidRole = raw as RaidRole | null;
  }
  if (body.professions !== undefined) {
    const list = body.professions;
    if (!Array.isArray(list) || list.length > LIMITS.maxProfessions) throw new Bad("invalid_professions");
    const seen = new Set<string>();
    input.professions = list.map((item) => {
      if (!isRecord(item) || Object.keys(item).some((k) => k !== "name" && k !== "skill" && k !== "updatedAt")) throw new Bad("invalid_professions");
      const { name, skill = null } = item;
      if (typeof name !== "string" || !(PROFESSIONS as readonly string[]).includes(name) || seen.has(name)) throw new Bad("invalid_professions");
      if (skill !== null && (typeof skill !== "number" || !Number.isInteger(skill) || skill < 0 || skill > LIMITS.skillMax)) throw new Bad("invalid_professions");
      seen.add(name);
      return { profession: name as Profession, skill: skill as number | null };
    });
  }
  if (body.alts !== undefined) {
    const list = body.alts;
    if (!Array.isArray(list) || list.length > LIMITS.maxAlts) throw new Bad("invalid_alts");
    const seen = new Set<string>();
    input.alts = list.map((item) => {
      if (isRecord(item) && Object.keys(item).some((k) => !["name", "status", "proof", "updatedAt"].includes(k))) throw new Bad("invalid_alts");
      const alt = nameOf(item, "invalid_alts");
      if (seen.has(alt.key)) throw new Bad("invalid_alts");
      seen.add(alt.key);
      return alt;
    });
  }
  if (body.crafts !== undefined) {
    const list = body.crafts;
    if (!Array.isArray(list) || list.length > LIMITS.maxCrafts) throw new Bad("invalid_crafts");
    const seen = new Set<string>();
    input.crafts = list.map((item) => {
      if (!isRecord(item) || Object.keys(item).some((k) => !["profession", "recipe", "source", "updatedAt"].includes(k))) throw new Bad("invalid_crafts");
      const { profession, recipe } = item;
      if (typeof profession !== "string" || !(PROFESSIONS as readonly string[]).includes(profession) || typeof recipe !== "string" || recipe.length > LIMITS.recipeMax * 4) throw new Bad("invalid_crafts");
      const name = normalizeRecipe(recipe);
      if (name.length < LIMITS.recipeMin || name.length > LIMITS.recipeMax || !RECIPE_TEXT.test(name) || UNSAFE.test(name)) throw new Bad("invalid_crafts");
      const key = recipeKeyOf(name);
      if (seen.has(key)) throw new Bad("invalid_crafts"); // unique per member across professions
      seen.add(key);
      return { profession: profession as Profession, recipe: name, key };
    });
  }
  return input;
}

// ---------- routes: member ----------
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const guildOnly = (ctx: CommunityContext, request: Request, env: Env) => (ctx.capabilities.confirmedGuildData ? null : refusal(env, request, "confirmedGuildData"));

/** GET /api/community/profile → the member's own profile, listed or not, with the limits. */
export async function profileGet(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("directory")) return featureOff();
  const no = await guildOnly(ctx, request, env);
  if (no) return no;
  const own = await readOwnAdmitted(env, ctx, ctx.subject!.discordId); // .72
  if (own === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  return apiJson({ profile: ownShape(own), limits: LIMITS });
}

/** PUT /api/community/profile {revision, listed?, main?, raidRole?, professions?, alts?, crafts?} → {profile} */
export async function profilePut(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("directory")) return featureOff();
  const no = await guildOnly(ctx, request, env);
  if (no) return no;
  if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409);
  const id = ctx.subject!.discordId;
  if (rateLimited(`c:${id}`, 30, 60)) return apiJson({ error: "slow_down", message: "Too many saves in one minute. Wait a moment, then try again." }, 429);
  const body = await readJson(request);
  if (body === null) return apiJson({ error: "bad_request", message: "That request could not be read." }, 400);
  if (body.crafts !== undefined && !ctx.features.has("crafting")) return featureOff();
  let input: Input;
  try {
    input = parseProfileInput(body);
  } catch (e) {
    if (e instanceof Bad) return apiJson({ error: e.code }, e.status);
    throw e;
  }
  const current = await readOwnAdmitted(env, ctx, id); // .72: the pre-write state, behind the reader's admission
  if (current === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  const p = current.profile;
  if (input.revision !== (p?.revision ?? 0)) return apiJson({ error: "stale_revision", profile: ownShape(current) }, 409);
  const t = now();

  // names: labels resolved against the keeper's proof; a collision refuses the whole save (Codex, 01:19)
  const names = [...(input.main ? [input.main] : []), ...(input.alts ?? [])];
  const resolveAll = async () => {
    const conflicts: string[] = [];
    const proofs = new Map<string, "self" | "keeper">();
    const facts: { proofKey: string; name: string | null; guid: string | null }[] = []; // what the write re-states (.64)
    for (const n of names) {
      const r = await resolveCharacter(env, id, n.name);
      if (r.state === "conflict") conflicts.push(n.name);
      else {
        proofs.set(n.key, r.state === "proven" ? "keeper" : "self");
        facts.push(r.state === "proven" ? { proofKey: r.proofKey, name: r.name, guid: r.guid } : { proofKey: r.proofKey, name: null, guid: null });
      }
    }
    return { conflicts, proofs, facts };
  };
  const nameConflict = async (conflicts: string[]) => {
    await audit(env, id, "community.name_conflict", id, { names: conflicts.length }); // counts only: a name is a label
    return apiJson({ error: "name_conflict", message: "One of these character names is bound to another account or does not match the character the officers confirmed. Check the spelling, or ask an officer.", names: conflicts }, 409);
  };
  const { conflicts, proofs, facts } = await resolveAll();
  if (conflicts.length) return nameConflict(conflicts);

  const changed: string[] = p ? [] : ["created"];
  const listed = input.listed ?? (p ? p.listed === 1 : false);
  if (p && listed !== (p.listed === 1)) changed.push("listed");
  let main = p?.main_name != null ? { name: p.main_name, key: p.main_key!, source: p.main_source!, updatedAt: p.main_updated_at! } : null;
  if (input.main !== undefined) {
    const next = input.main;
    const nextSource = next ? proofs.get(next.key)! : null;
    if (next === null ? main !== null : !main || main.name !== next.name || main.source !== nextSource) {
      main = next === null ? null : { name: next.name, key: next.key, source: nextSource!, updatedAt: t };
      changed.push("main");
    }
  }
  let role = p?.raid_role != null ? { value: p.raid_role, updatedAt: p.role_updated_at! } : null;
  if (input.raidRole !== undefined && input.raidRole !== (role?.value ?? null)) {
    role = input.raidRole === null ? null : { value: input.raidRole, updatedAt: t };
    changed.push("raidRole");
  }
  let professions: { profession: Profession; skill: number | null; updatedAt: number }[] | null = null;
  if (input.professions !== undefined) {
    professions = input.professions.map((n) => {
      const old = current.professions.find((o) => o.profession === n.profession);
      return { ...n, updatedAt: old && old.skill === n.skill ? old.updated_at : t };
    });
    if (!(professions.length === current.professions.length && professions.every((n) => current.professions.some((o) => o.profession === n.profession && o.skill === n.skill)))) changed.push("professions");
  }
  let alts: AltRow[] | null = null;
  if (input.alts !== undefined) {
    alts = input.alts.map((n) => {
      const old = current.alts.find((o) => o.name_key === n.key);
      const proof = proofs.get(n.key)!;
      return old
        ? { ...old, name: n.name, proof, updated_at: old.name === n.name && old.proof === proof ? old.updated_at : t }
        : { discord_id: id, name: n.name, name_key: n.key, status: "claimed" as const, proof, claimed_at: t, reviewed_by: null, reviewed_at: null, updated_at: t };
    });
    if (!(alts.length === current.alts.length && alts.every((n) => current.alts.some((o) => o.name_key === n.name_key && o.name === n.name && o.proof === n.proof)))) changed.push("alts");
  }
  let crafts: CraftRow[] | null = null;
  if (input.crafts !== undefined) {
    crafts = input.crafts.map((n) => {
      const old = current.crafts.find((o) => o.recipe_key === n.key);
      const same = old !== undefined && old.profession === n.profession && old.recipe_name === n.recipe;
      return { discord_id: id, profession: n.profession, recipe_name: n.recipe, recipe_key: n.key, updated_at: same ? old!.updated_at : t };
    });
    if (crafts.length !== current.crafts.length || crafts.some((n) => !current.crafts.some((o) => o.recipe_key === n.recipe_key && o.profession === n.profession && o.recipe_name === n.recipe_name))) changed.push("crafts");
  }
  const altKeys = new Set((alts ?? current.alts).map((a) => a.name_key));
  if (main && altKeys.has(main.key)) return apiJson({ error: input.alts !== undefined ? "invalid_alts" : "invalid_main" }, 400);
  if (changed.length === 0) return apiJson({ profile: ownShape(current), unchanged: true });

  const nonce = randomToken();
  const newRef = randomToken();
  const limit = scanLimit(env);
  const version = ctx.subject!.sessionVersion, expires = ctx.subject!.expiresAt;
  // ?1 id, ?2 version (the fence), ?3 revision/newRef, ?4.. values, ?13 limit, ?14 expiry (the fence), ?15.. the name facts (.64)
  const values = [listed ? 1 : 0, main?.name ?? null, main?.key ?? null, main?.source ?? null, main?.updatedAt ?? null, role?.value ?? null, role?.updatedAt ?? null, nonce, t];
  // .64 (5): the binding facts resolveCharacter read, re-stated inside the statement so they must still hold at the write
  const nameParams: (string | null)[] = [];
  const nameFence = facts
    .map((f) => {
      const k = 15 + nameParams.length;
      if (f.name === null) {
        nameParams.push(f.proofKey);
        return `NOT EXISTS (SELECT 1 FROM characters nc WHERE nc.name_key = ?${k})`;
      }
      nameParams.push(f.proofKey, f.name, f.guid);
      return `EXISTS (SELECT 1 FROM characters nc WHERE nc.name_key = ?${k} AND nc.discord_id = ?1 AND nc.name = ?${k + 1} AND nc.guid IS ?${k + 2})
        AND NOT EXISTS (SELECT 1 FROM characters ng WHERE ng.guid IS NOT NULL AND ng.guid = ?${k + 2} AND ng.discord_id <> ?1)`;
    })
    .map((sql) => `AND ${sql}`)
    .join(" ");
  // .64 (1): the listing is decided inside the statement; a full directory leaves the profile unlisted and saves the rest
  const statements: D1PreparedStatement[] = p
    ? [
        env.DB.prepare(
          `UPDATE community_profiles SET revision = revision + 1, listed = CASE WHEN ?4 = 0 THEN 0 WHEN listed = 1 THEN 1 WHEN ${roomSql("?13")} THEN 1 ELSE 0 END,
             main_name = ?5, main_key = ?6, main_source = ?7, main_updated_at = ?8, raid_role = ?9, role_updated_at = ?10, write_nonce = ?11, updated_at = ?12, departed_at = NULL
           WHERE discord_id = ?1 AND revision = ?3 AND ${fenceSql("confirmedGuildData", 1, 2, 14)} ${nameFence}`,
        ).bind(id, version, p.revision, ...values, limit, expires, ...nameParams),
      ]
    : [
        env.DB.prepare(
          `INSERT INTO community_profiles (discord_id, ref, revision, listed, main_name, main_key, main_source, main_updated_at, raid_role, role_updated_at, write_nonce, created_at, updated_at)
           SELECT ?1, COALESCE((SELECT r.ref FROM community_refs r WHERE r.discord_id = ?1), ?3), 1, CASE WHEN ?4 = 1 AND ${roomSql("?13")} THEN 1 ELSE 0 END, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12
           WHERE ${fenceSql("confirmedGuildData", 1, 2, 14)} ${nameFence}
           ON CONFLICT(discord_id) DO NOTHING`,
        ).bind(id, version, newRef, ...values, limit, expires, ...nameParams),
        refAfter(env, id, "community_profiles", nonce, newRef, t),
      ];
  if (professions) {
    statements.push(env.DB.prepare(`DELETE FROM community_professions WHERE discord_id = ?1 AND ${ADMITTED}`).bind(id, nonce));
    if (professions.length) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO community_professions (discord_id, profession, skill, updated_at)
           SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]') FROM json_each(?3) j WHERE ${ADMITTED}`,
        ).bind(id, nonce, JSON.stringify(professions.map((r) => [r.profession, r.skill, r.updatedAt]))),
      );
    }
  }
  if (crafts) {
    statements.push(env.DB.prepare(`DELETE FROM community_craft_offers WHERE discord_id = ?1 AND ${ADMITTED}`).bind(id, nonce));
    if (crafts.length) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO community_craft_offers (discord_id, profession, recipe_name, recipe_key, updated_at)
           SELECT ?1, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]') FROM json_each(?3) j WHERE ${ADMITTED}`,
        ).bind(id, nonce, JSON.stringify(crafts.map((r) => [r.profession, r.recipe_name, r.recipe_key, r.updated_at]))),
      );
    }
  }
  if (alts) {
    // a server-side diff: removed keys deleted, kept keys updated in place (never their review), new keys inserted unreviewed
    const known = (key: string) => current.alts.find((o) => o.name_key === key);
    const kept = alts.filter((a) => known(a.name_key));
    statements.push(env.DB.prepare(`DELETE FROM community_alt_claims WHERE discord_id = ?1 AND ${ADMITTED} AND name_key NOT IN (SELECT value FROM json_each(?3))`).bind(id, nonce, JSON.stringify(kept.map((a) => a.name_key))));
    for (const a of kept) {
      const o = known(a.name_key)!;
      if (o.name === a.name && o.proof === a.proof) continue;
      statements.push(env.DB.prepare(`UPDATE community_alt_claims SET name = ?3, proof = ?4, updated_at = ?5 WHERE discord_id = ?1 AND name_key = ?6 AND ${ADMITTED}`).bind(id, nonce, a.name, a.proof, a.updated_at, a.name_key));
    }
    for (const a of alts.filter((x) => !known(x.name_key))) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO community_alt_claims (discord_id, name, name_key, status, proof, claimed_at, reviewed_by, reviewed_at, updated_at)
           SELECT ?1, ?3, ?4, 'claimed', ?5, ?6, NULL, NULL, ?6 WHERE ${ADMITTED} ON CONFLICT(discord_id, name_key) DO NOTHING`,
        ).bind(id, nonce, a.name, a.name_key, a.proof, t),
      );
    }
  }
  statements.push(
    // the audit row says which fields were asked for and the listed state the statement actually produced (.64)
    env.DB.prepare(`INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?1, ?4, ?1, json_object('fields', json(?5), 'listed', (SELECT listed FROM community_profiles WHERE discord_id = ?1)) WHERE ${ADMITTED}`).bind(id, nonce, t, p ? "community.profile_updated" : "community.profile_created", JSON.stringify(changed.filter((f) => f !== "created"))),
  );
  const payloadAt = statements.length;
  statements.push(...ownStatements(env, id)); // .72: the saved profile, read in the write's own transaction (the accepted snapshot)
  const out = await admitted(env, ctx, statements);
  if (out !== FENCE_REFUSED) {
    const after = ownFrom(out.slice(payloadAt));
    if (listed && after.profile?.listed !== 1) {
      // HL-1 (.64): the directory is full. Everything else was saved; only the listing was refused, inside the statement.
      return apiJson({ error: "directory_full", saved: true, message: "The directory is full, so your profile stays unlisted; everything else you changed was saved. Try listing it later.", profile: ownShape(after) }, 409);
    }
    return apiJson({ profile: ownShape(after) });
  }
  const after = await readOwnAdmitted(env, ctx, id); // .72: the refusal explained from an admitted read
  if (after === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  if ((after.profile?.revision ?? 0) !== input.revision) return apiJson({ error: "stale_revision", profile: ownShape(after) }, 409);
  if (names.length) {
    // .64 (5): did the keeper's binding of one of these names change between the resolution and the write?
    const again = await resolveAll();
    if (again.conflicts.length) return nameConflict(again.conflicts);
    if (names.some((n) => again.proofs.get(n.key) !== proofs.get(n.key)) || JSON.stringify(again.facts) !== JSON.stringify(facts)) {
      return apiJson({ error: "conflict", message: "The officers' record of one of these character names changed while you were saving. Reload the page, then try again." }, 409);
    }
  }
  return refusal(env, request, "confirmedGuildData");
}

/** GET /api/community/directory[?cursor=] → {generatedAt, members, counts: {listed}, nextCursor} */
export async function directoryList(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("directory")) return featureOff();
  const no = await guildOnly(ctx, request, env);
  if (no) return no;
  if (rateLimited(`cd:${ctx.subject!.discordId}`, 90, 60)) return apiJson({ error: "slow_down", message: "Too many pages in one minute. Wait a moment, then carry on." }, 429);
  const parts = cursorParts(new URL(request.url).searchParams.get("cursor"));
  if (parts === "invalid") return apiJson({ error: "invalid_cursor" }, 400);
  let cursor: { digest: string; displayName: string; ref: string } | null = null;
  if (parts) {
    const [version, kind, digest, displayName, ref] = parts;
    if (parts.length === 5 && version === 2 && kind === "directory" && text(digest, 32) && /^[0-9a-f]{32}$/.test(digest) && text(displayName) && text(ref) && REF.test(ref)) cursor = { digest, displayName, ref };
    else if (parts.length === 2 && parts.every((x) => text(x)) && REF.test(parts[1] as string)) return apiJson({ error: "cursor_stale" }, 409); // a v1 cursor from an older page
    else return apiJson({ error: "invalid_cursor" }, 400);
  }
  const limit = scanLimit(env);
  // .64 (3): the scan and the hydration are ONE batch (one transaction); the page is selected in SQL from the same scan,
  // and every payload statement repeats the owner's eligibility, so nothing decided here is older than anything else.
  const scanSql = `SELECT p.discord_id, p.ref, ${DISPLAY} AS display_name,
            (?3 = 0 OR ${DISPLAY} > ?1 COLLATE NOCASE OR (${DISPLAY} = ?1 COLLATE NOCASE AND p.ref > ?2)) AS after
     FROM community_profiles p JOIN site_users u ON u.discord_id = p.discord_id
     WHERE p.listed = 1 AND ${VISIBLE_OWNER}
     ORDER BY ${DISPLAY} COLLATE NOCASE, p.ref LIMIT ?4`;
  const pageIds = `SELECT s.discord_id FROM (${scanSql}) s WHERE s.after = 1 ORDER BY s.display_name COLLATE NOCASE, s.ref LIMIT ?5`;
  const owner = `JOIN site_users u ON u.discord_id = p.discord_id WHERE p.listed = 1 AND ${VISIBLE_OWNER} AND p.discord_id IN (${pageIds})`;
  const scanParams = [cursor?.displayName ?? "", cursor?.ref ?? "", cursor ? 1 : 0, limit + 1];
  const pageParams = [...scanParams, PAGE_SIZE];
  const statements = [
    env.DB.prepare(scanSql).bind(...scanParams),
    env.DB.prepare(`SELECT ${PROFILE_COLUMNS.split(", ").map((c) => `p.${c}`).join(", ")} FROM community_profiles p ${owner}`).bind(...pageParams),
    env.DB.prepare(`SELECT x.discord_id, x.profession, x.skill, x.updated_at FROM community_professions x JOIN community_profiles p ON p.discord_id = x.discord_id ${owner}`).bind(...pageParams),
    env.DB.prepare(`SELECT x.discord_id, x.name, x.name_key, x.status, x.proof, x.claimed_at, NULL AS reviewed_by, x.reviewed_at, x.updated_at FROM community_alt_claims x JOIN community_profiles p ON p.discord_id = x.discord_id ${owner} AND x.status <> 'rejected'`).bind(...pageParams),
  ];
  if (ctx.features.has("crafting")) statements.push(env.DB.prepare(`SELECT x.discord_id, x.profession, x.recipe_name, x.recipe_key, x.updated_at FROM community_craft_offers x JOIN community_profiles p ON p.discord_id = x.discord_id ${owner}`).bind(...pageParams));
  const read = await admittedRead(env, ctx, "confirmedGuildData", statements); // .72: the reader's admission, in the payload's transaction
  if (read === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  const [scan, profiles, professions, alts, crafts] = read;
  const visible = scan!.results as { discord_id: string; ref: string; display_name: string; after: number }[];
  if (visible.length > limit) return apiJson({ error: "directory_too_large" }, 503);
  const digest = await orderDigest(visible.map((r) => [r.display_name, r.ref]));
  if (cursor && cursor.digest !== digest) return apiJson({ error: "cursor_stale" }, 409);
  const remaining = visible.filter((r) => r.after === 1);
  const page = remaining.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = remaining.length > PAGE_SIZE && last ? encodeCursor([2, "directory", digest, last.display_name, last.ref]) : null;
  const group = <T extends { discord_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of list) m.set(r.discord_id, [...(m.get(r.discord_id) ?? []), r]);
    return m;
  };
  const byId = new Map((profiles!.results as ProfileRow[]).map((r) => [r.discord_id, r]));
  const prof = group(professions!.results as ProfessionRow[]), alt = group(alts!.results as AltRow[]), craft = group((crafts?.results ?? []) as CraftRow[]);
  const members = page.flatMap((r) => {
    const pr = byId.get(r.discord_id);
    return pr ? [{ ref: pr.ref, displayName: r.display_name, ...describe(pr, prof.get(pr.discord_id) ?? [], alt.get(pr.discord_id) ?? [], craft.get(pr.discord_id) ?? [], false) }] : [];
  });
  return apiJson({ generatedAt: secondsToIso(now()), members, counts: { listed: visible.length }, nextCursor });
}

/** GET /api/community/crafting?q=&profession=&cursor= → {results, nextCursor}: offers on listed, qualifying profiles. */
export async function craftingSearch(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("crafting")) return featureOff();
  const no = await guildOnly(ctx, request, env);
  if (no) return no;
  if (rateLimited(`cc:${ctx.subject!.discordId}`, 90, 60)) return apiJson({ error: "slow_down", message: "Too many searches in one minute. Wait a moment, then carry on." }, 429);
  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q"), rawP = url.searchParams.get("profession");
  let q: string | null = null;
  if (rawQ) {
    if (rawQ.length > LIMITS.recipeMax * 4) return apiJson({ error: "invalid_q" }, 400);
    const k = recipeKeyOf(normalizeRecipe(rawQ));
    if (k.length < 2 || k.length > 40 || UNSAFE.test(k)) return apiJson({ error: "invalid_q" }, 400);
    q = k;
  }
  let profession: Profession | null = null;
  if (rawP) {
    if (!(PROFESSIONS as readonly string[]).includes(rawP)) return apiJson({ error: "invalid_profession" }, 400);
    profession = rawP as Profession;
  }
  if (q === null && profession === null) return apiJson({ error: "invalid_query" }, 400);
  const parts = cursorParts(url.searchParams.get("cursor"));
  if (parts === "invalid") return apiJson({ error: "invalid_cursor" }, 400);
  let after: { digest: string; key: string; name: string; ref: string } | null = null;
  if (parts) {
    const [version, kind, cq, cp, digest, key, name, ref] = parts;
    if (parts.length === 7 && parts[0] === 1 && parts[1] === "crafting") return apiJson({ error: "cursor_stale" }, 409); // a .57 cursor from an older page
    if (parts.length !== 8 || version !== 2 || kind !== "crafting" || cq !== q || cp !== profession || !text(digest, 32) || !/^[0-9a-f]{32}$/.test(digest) || !text(key) || !text(name, 512) || !text(ref) || !REF.test(ref)) return apiJson({ error: "invalid_cursor" }, 400);
    after = { digest, key, name, ref };
  }
  const limit = scanLimit(env);
  // .64 (3, 4): the owner scan and the offers are ONE batch (one transaction); the offers statement repeats the owner's
  // eligibility itself; the cursor carries the digest of the visible order (every qualifying owner with a matching offer,
  // by display name and ref, with the profile revision that every save of their offers bumps), so a rename, an edit, a
  // departure or an unlisting between pages is 409 cursor_stale and the page starts again (D20).
  const filter = (qp: string, pp: string) => `(${qp} IS NULL OR instr(o.recipe_key, ${qp}) > 0) AND (${pp} IS NULL OR o.profession = ${pp})`;
  const read = await admittedRead(env, ctx, "confirmedGuildData", [ // .72: the reader's admission, in the payload's transaction
    env.DB.prepare(
      `SELECT p.ref, p.revision, ${DISPLAY} AS display_name FROM community_profiles p JOIN site_users u ON u.discord_id = p.discord_id
       WHERE p.listed = 1 AND ${VISIBLE_OWNER} AND EXISTS (SELECT 1 FROM community_craft_offers o WHERE o.discord_id = p.discord_id AND ${filter("?2", "?3")})
       ORDER BY ${DISPLAY} COLLATE NOCASE, p.ref LIMIT ?1`,
    ).bind(limit + 1, q, profession),
    env.DB.prepare(
      `SELECT o.profession, o.recipe_name, o.recipe_key, o.updated_at, p.ref, ${DISPLAY} AS display_name
       FROM community_craft_offers o JOIN community_profiles p ON p.discord_id = o.discord_id AND p.listed = 1 JOIN site_users u ON u.discord_id = o.discord_id
       WHERE ${VISIBLE_OWNER} AND ${filter("?1", "?2")}
         AND (?3 = 0 OR o.recipe_key > ?4 OR (o.recipe_key = ?4 AND (${DISPLAY} > ?5 COLLATE NOCASE OR (${DISPLAY} = ?5 COLLATE NOCASE AND p.ref > ?6))))
       ORDER BY o.recipe_key, ${DISPLAY} COLLATE NOCASE, p.ref LIMIT ?7`,
    ).bind(q, profession, after ? 1 : 0, after?.key ?? "", after?.name ?? "", after?.ref ?? "", PAGE_SIZE + 1),
  ]);
  if (read === FENCE_REFUSED) return refusal(env, request, "confirmedGuildData");
  const [owners, rows] = read;
  const visibleOwners = owners!.results as { ref: string; revision: number; display_name: string }[];
  if (visibleOwners.length > limit) return apiJson({ error: "directory_too_large" }, 503);
  const digest = await orderDigest(visibleOwners.map((o) => [o.display_name, o.ref, o.revision]));
  if (after && after.digest !== digest) return apiJson({ error: "cursor_stale" }, 409);
  const offers = rows!.results as { profession: Profession; recipe_name: string; recipe_key: string; updated_at: number; ref: string; display_name: string }[];
  const page = offers.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return apiJson({
    results: page.map((r) => ({ recipe: r.recipe_name, profession: r.profession, source: "self", crafter: { ref: r.ref, displayName: r.display_name }, updatedAt: secondsToIso(r.updated_at) })),
    nextCursor: offers.length > PAGE_SIZE && last ? encodeCursor([2, "crafting", q, profession, digest, last.recipe_key, last.display_name, last.ref]) : null,
  });
}

// ---------- routes: staff (SITE_ADMINS, through site-admin.ts) ----------
export const ADMIN_PAGE = 100;
/** GET /api/admin/community/directory[?cursor=] → pending alt claims and every key two accounts use. No Discord ids. .72: behind the staff member's own admission (no guild proof, by design). */
export async function adminDirectory(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  const parts = cursorParts(url.searchParams.get("cursor"));
  if (parts === "invalid" || (parts && (parts.length !== 3 || !parts.every((x) => text(x)) || !REF.test(parts[1] as string) || (parts[2] !== "alt" && parts[2] !== "main")))) return apiJson({ error: "invalid_cursor" }, 400);
  const cursor = parts as string[] | null;
  const entries = `entries AS (
      SELECT c.discord_id, c.name, c.name_key AS k, 'alt' AS kind, c.status, c.proof, c.claimed_at AS at, c.reviewed_at FROM community_alt_claims c
      UNION ALL
      SELECT p.discord_id, p.main_name, p.main_key, 'main', NULL, p.main_source, p.main_updated_at, NULL FROM community_profiles p WHERE p.main_key IS NOT NULL),
    dup AS (SELECT k FROM entries WHERE COALESCE(status, '') <> 'rejected' GROUP BY k HAVING COUNT(DISTINCT discord_id) > 1)`;
  const read = await admittedRead(env, ctx, "applicantWrite", [
    env.DB.prepare(
      `WITH ${entries}
       SELECT e.name, e.k, e.kind, e.status, e.proof, e.at, e.reviewed_at, p.ref, p.revision, ${DISPLAY} AS display_name, (e.k IN (SELECT k FROM dup)) AS conflict
       FROM entries e JOIN community_profiles p ON p.discord_id = e.discord_id LEFT JOIN site_users u ON u.discord_id = e.discord_id
       WHERE ((e.kind = 'alt' AND e.status = 'claimed') OR e.k IN (SELECT k FROM dup))
         AND (?4 = 0 OR e.k > ?1 OR (e.k = ?1 AND (p.ref > ?2 OR (p.ref = ?2 AND e.kind > ?3))))
       ORDER BY e.k, p.ref, e.kind LIMIT ?5`,
    ).bind(cursor?.[0] ?? "", cursor?.[1] ?? "", cursor?.[2] ?? "", cursor ? 1 : 0, ADMIN_PAGE + 1),
    env.DB.prepare(`WITH ${entries} SELECT (SELECT COUNT(*) FROM community_alt_claims WHERE status = 'claimed') AS pending, (SELECT COUNT(*) FROM dup) AS conflicts`),
  ]);
  if (read === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const [rows, counts] = read;
  type Row = { name: string; k: string; kind: "alt" | "main"; status: string | null; proof: string | null; at: number; reviewed_at: number | null; ref: string; revision: number; display_name: string | null; conflict: number };
  const list = rows!.results as Row[];
  const page = list.slice(0, ADMIN_PAGE);
  const last = page.at(-1);
  const c = (counts!.results[0] ?? {}) as { pending?: number; conflicts?: number };
  return apiJson({
    generatedAt: secondsToIso(now()),
    entries: page.map((r) => ({ ref: r.ref, revision: r.revision, displayName: r.display_name, kind: r.kind, name: r.name, key: r.k, status: r.kind === "alt" ? r.status : null, proof: r.proof, at: secondsToIso(r.at), reviewedAt: r.reviewed_at === null ? null : secondsToIso(r.reviewed_at), conflict: r.conflict === 1 })),
    counts: { pendingClaims: c.pending ?? 0, conflictKeys: c.conflicts ?? 0 },
    nextCursor: list.length > ADMIN_PAGE && last ? encodeCursor([last.k, last.ref, last.kind]) : null,
  });
}

/**
 * POST /api/admin/community/directory/alt {ref, key, decision, revision} → {claim, revision}. Never on the admin's own
 * profile. .64 (2): the first statement carries the admin's own fence (live row, session version, cookie expiry; no
 * guild proof, by design), the later rows need its nonce, and the current-page header is required as for member writes.
 */
export async function adminAltDecision(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409);
  const { ref, key, decision, revision } = body;
  if (Object.keys(body).some((k) => !["ref", "key", "decision", "revision"].includes(k))) return apiJson({ error: "invalid_request" }, 400);
  if (!text(ref) || !REF.test(ref)) return apiJson({ error: "invalid_ref" }, 400);
  if (!text(key, LIMITS.nameMax * 4) || !validateName(key).ok || communityKey(key) !== key) return apiJson({ error: "invalid_key" }, 400);
  if (decision !== "confirm" && decision !== "reject") return apiJson({ error: "invalid_decision" }, 400);
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return apiJson({ error: "invalid_revision" }, 400);
  const t = now();
  const status = decision === "confirm" ? "officer_confirmed" : "rejected";
  const pre = await admittedRead(env, ctx, "applicantWrite", [env.DB.prepare("SELECT discord_id FROM community_profiles WHERE ref = ?1").bind(ref)]); // .72
  if (pre === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  if ((pre[0]!.results[0] as { discord_id: string } | undefined)?.discord_id === admin.discord_id) return apiJson({ error: "own_record" }, 409);
  const nonce = randomToken();
  // ?1 ref, ?2 revision, ?3 nonce, ?4 now, ?5 key, ?6 admin, ?7 session version, ?8 cookie expiry (the staff fence, .64)
  const out = await admitted(env, ctx, [
    env.DB.prepare(
      `UPDATE community_profiles SET revision = revision + 1, write_nonce = ?3, updated_at = ?4
       WHERE ref = ?1 AND revision = ?2 AND discord_id <> ?6 AND EXISTS (SELECT 1 FROM community_alt_claims c WHERE c.discord_id = community_profiles.discord_id AND c.name_key = ?5)
         AND ${fenceSql("applicantWrite", 6, 7, 8)}`,
    ).bind(ref, revision, nonce, t, key, admin.discord_id, ctx.subject?.sessionVersion ?? -1, ctx.subject?.expiresAt ?? 0),
    env.DB.prepare(
      `UPDATE community_alt_claims SET status = ?3, reviewed_by = ?4, reviewed_at = ?5, updated_at = ?5
       WHERE name_key = ?6 AND discord_id = (SELECT discord_id FROM community_profiles WHERE ref = ?1 AND write_nonce = ?2)
       RETURNING name, status, reviewed_at`,
    ).bind(ref, nonce, status, admin.discord_id, t, key),
    env.DB.prepare(`INSERT INTO audit (ts, actor, action, subject, details) SELECT ?3, ?4, ?5, discord_id, NULL FROM community_profiles WHERE ref = ?1 AND write_nonce = ?2`).bind(ref, nonce, t, admin.discord_id, decision === "confirm" ? "community.alt_confirmed" : "community.alt_rejected"),
  ]);
  const decided = out === FENCE_REFUSED ? undefined : (out[1]?.results[0] as { name: string; status: string; reviewed_at: number } | undefined);
  if (decided) return apiJson({ claim: { ref, name: decided.name, key, status: decided.status, reviewedAt: secondsToIso(decided.reviewed_at) }, revision: revision + 1 });
  // .72: the refusal explained from an admitted read
  const after = await admittedRead(env, ctx, "applicantWrite", [env.DB.prepare(`SELECT p.revision, c.name, p.discord_id = ?3 AS own FROM community_profiles p LEFT JOIN community_alt_claims c ON c.discord_id = p.discord_id AND c.name_key = ?2 WHERE p.ref = ?1`).bind(ref, key, admin.discord_id)]);
  if (after === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
  const row = after[0]!.results[0] as { revision: number; name: string | null; own: number } | undefined;
  if (!row) return apiJson({ error: "profile_not_found" }, 404);
  if (row.own === 1) return apiJson({ error: "own_record" }, 409);
  if (row.name === null) return apiJson({ error: "claim_not_found" }, 404);
  if (row.revision !== revision) return apiJson({ error: "stale_revision", revision: row.revision }, 409);
  return refusal(env, request, "applicantWrite"); // the admin's own standing or session, judged inside the statement (.64)
}

// ---------- retention, erasure, export ----------
/**
 * Cron step: start the departure clock for profiles whose owner no longer qualifies, clear it for those who do again,
 * and delete profiles thirty days departed (their professions, claims, offers and the member's ref with them). Runs
 * whatever COMMUNITY_FEATURES says: a feature switched off still keeps its retention promise.
 */
export async function sweepCommunityProfiles(env: Env, at = now()): Promise<{ departed: number; returned: number; deleted: number }> {
  const qualifies = `EXISTS (SELECT 1 FROM site_users u WHERE u.discord_id = p.discord_id AND ${VISIBLE_OWNER})`;
  const [d, r] = await env.DB.batch([
    env.DB.prepare(`UPDATE community_profiles AS p SET departed_at = ?1 WHERE departed_at IS NULL AND NOT ${qualifies}`).bind(at),
    env.DB.prepare(`UPDATE community_profiles AS p SET departed_at = NULL WHERE departed_at IS NOT NULL AND ${qualifies}`),
  ]);
  const gone = await env.DB.prepare("SELECT discord_id FROM community_profiles WHERE departed_at IS NOT NULL AND departed_at <= ?1 LIMIT 100").bind(at - DEPARTED_RETENTION_S).all<{ discord_id: string }>();
  let deleted = 0;
  for (const row of gone.results) {
    await env.DB.batch(eraseStatements(env, row.discord_id));
    deleted++;
  }
  if (deleted) await audit(env, "cron", "community.profiles_expired", undefined, { deleted }); // counts only
  return { departed: d?.meta?.changes ?? 0, returned: r?.meta?.changes ?? 0, deleted };
}

function eraseStatements(env: Env, id: string): D1PreparedStatement[] {
  return [
    env.DB.prepare("DELETE FROM community_craft_offers WHERE discord_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community_alt_claims WHERE discord_id = ?1").bind(id),
    env.DB.prepare("UPDATE community_alt_claims SET reviewed_by = NULL WHERE reviewed_by = ?1").bind(id), // their identity as a reviewer goes too
    env.DB.prepare("DELETE FROM community_professions WHERE discord_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community_profiles WHERE discord_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community_refs WHERE discord_id = ?1").bind(id),
  ];
}

registerCommunityData("directory", eraseStatements, (env, id) => ({ statements: ownStatements(env, id), shape: (rows) => ownShape(ownFrom(rows)) })); // .74: a plan, run in the copy's one admitted batch

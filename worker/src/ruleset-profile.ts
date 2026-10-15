/** Public game identity only. This module never selects admission, roster, role, invite or launch settings.
 *
 * 14 Oct 2026 (owner item 7): the identity the site, the intros, the guide and the staff publication project is a
 * RESOLVED SNAPSHOT, never a module constant: the public beta until the owner activates the full-release identity,
 * which lives only in the private secret RULESET_FUTURE_PROFILE until that day. Activation pins the opaque revision and
 * the secret's digest in site_settings (ruleset-publication.ts switchRulesetMode, one admitted batch). While the mode is
 * full_release, a missing, changed or malformed secret, a corrupt mode or incomplete pins HOLD every projection; they
 * never fall back to the beta. An absent mode row alone is the legitimate beta default.
 */
export interface RulesetProfile {
  readonly schema: "olympus-ruleset-profile-v1";
  readonly revision: string;
  readonly phase: "beta" | "full_release";
  readonly game: "World of Warcraft: Forever";
  readonly guild: "Olympus";
  readonly realm: string;
  readonly ruleset: "Normal" | "PvP" | "Roleplaying" | "Hardcore";
  readonly faction: "Alliance" | "Horde";
}

const KEYS = ["schema", "revision", "phase", "game", "guild", "realm", "ruleset", "faction"] as const;
const LABEL = /^[\p{L}\p{N} .:'()-]{1,80}$/u;
const REVISION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** The opaque revision a future profile must carry: it names nothing about the identity itself. */
export const FUTURE_REVISION = /^forever-release-[a-z0-9][a-z0-9.-]{0,31}$/;
const REVEALING = ["normal", "pvp", "roleplay", "hardcore", "alliance", "horde"];

/** A closed data parser, not evidence that a future profile is eligible or active. No input values enter errors. */
export function parseRulesetProfile(input: unknown): RulesetProfile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(input).length !== KEYS.length) return null;
  const record: Record<string, unknown> = {};
  for (const key of KEYS) {
    const own = Object.getOwnPropertyDescriptor(input, key);
    if (!own || !("value" in own) || typeof own.value !== "string") return null;
    record[key] = own.value;
  }
  if (record.schema !== "olympus-ruleset-profile-v1" || !REVISION.test(record.revision as string)
    || !["beta", "full_release"].includes(record.phase as string) || record.game !== "World of Warcraft: Forever"
    || record.guild !== "Olympus" || !LABEL.test(record.realm as string) || record.realm !== (record.realm as string).trim()
    || record.realm !== (record.realm as string).normalize("NFC")
    || !["Normal", "PvP", "Roleplaying", "Hardcore"].includes(record.ruleset as string)
    || !["Alliance", "Horde"].includes(record.faction as string)) return null;
  return Object.freeze(record) as unknown as RulesetProfile;
}

// Owner-confirmed public beta identity. The future identity is never provisioned here.
const BETA = parseRulesetProfile({
  schema: "olympus-ruleset-profile-v1", revision: "forever-beta-pvp2-v1", phase: "beta",
  game: "World of Warcraft: Forever", guild: "Olympus", realm: "Classic Beta PvP 2", ruleset: "PvP", faction: "Alliance",
});
if (!BETA) throw new Error("Invalid public beta ruleset profile");

/** The public beta identity as a constant (the QR profile and fixtures pin it). Projections use the resolved snapshot. */
export function currentRulesetProfile(): RulesetProfile { return BETA!; }

export function rulesetLabel(profile: RulesetProfile = currentRulesetProfile()): string {
  const checked = parseRulesetProfile(profile);
  if (!checked) throw new Error("Invalid ruleset profile");
  return `${checked.game} · ${checked.phase === "beta" ? "Beta" : "Full release"} · ${checked.realm} · ${checked.ruleset} · ${checked.faction}`;
}

/** Canonical bytes of a parsed profile: the parser builds the record in KEYS order, so this is deterministic. */
export const canonicalRulesetJson = (profile: RulesetProfile): string => JSON.stringify(parseRulesetProfile(profile));
export async function rulesetDigest(profile: RulesetProfile): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalRulesetJson(profile));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The private future identity, read only from the secret. A revision that names the identity is refused. */
export function parseFutureProfileSecret(raw: unknown): RulesetProfile | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const profile = parseRulesetProfile(value);
  if (!profile || profile.phase !== "full_release" || profile.revision === BETA!.revision || !FUTURE_REVISION.test(profile.revision)) return null;
  const lowered = profile.revision.toLowerCase();
  if (REVEALING.some((word) => lowered.includes(word))) return null;
  return profile;
}

/** The five site_settings rows the activation batch binds together; absent mode = beta, anything else is resolved below. */
export const RULESET_SETTINGS_KEYS = ["rulesetMode", "rulesetActiveRevision", "rulesetActiveDigest", "rulesetActivatedAt", "rulesetActivatedBy"] as const;

export type RulesetHold = "ruleset_mode_corrupt" | "activation_pins_incomplete" | "future_profile_missing" | "future_profile_changed";
export interface RulesetSnapshot {
  readonly mode: "beta" | "full_release";
  /** The stored mode value exactly as observed (null when the row is absent): the switch's admission compares this, so a corrupt value can be returned from. */
  readonly modeRaw: string | null;
  readonly profile: RulesetProfile | null; // null while held
  readonly held: RulesetHold | null;
  readonly revision: string;               // the pinned revision ("" while held before the pins were readable)
  readonly digest: string | null;
  readonly activatedAt: number | null;
  /** Attribution only (v2, finding 4): the registered scrub empties it; an empty pin never holds the identity. */
  readonly activatedBy: string | null;
}

const BETA_SNAPSHOT: RulesetSnapshot = Object.freeze({ mode: "beta", modeRaw: null, profile: BETA!, held: null, revision: BETA!.revision, digest: null, activatedAt: null, activatedBy: null });
export function betaRulesetSnapshot(modeRaw: string | null = null): RulesetSnapshot { return modeRaw === null ? BETA_SNAPSHOT : Object.freeze({ ...BETA_SNAPSHOT, modeRaw }); }
const heldSnapshot = (held: RulesetHold, modeRaw: string | null, pins: Partial<Pick<RulesetSnapshot, "revision" | "activatedAt" | "activatedBy">> = {}): RulesetSnapshot =>
  Object.freeze({ mode: "full_release", modeRaw, profile: null, held, revision: pins.revision ?? "", digest: null, activatedAt: pins.activatedAt ?? null, activatedBy: pins.activatedBy ?? null });

/** Resolve the active identity from the site_settings rows already read and the secret. Fail closed while active. */
export async function resolveRulesetSnapshot(rows: ReadonlyArray<{ key: string; value: string }>, env: { RULESET_FUTURE_PROFILE?: string }): Promise<RulesetSnapshot> {
  const m = new Map<string, string>();
  for (const row of rows) if ((RULESET_SETTINGS_KEYS as readonly string[]).includes(row.key) && typeof row.value === "string") m.set(row.key, row.value);
  const mode = m.get("rulesetMode") ?? null;
  const [revision, digest, atText, by] = ["rulesetActiveRevision", "rulesetActiveDigest", "rulesetActivatedAt", "rulesetActivatedBy"].map((k) => m.get(k) ?? "");
  const anyPin = [revision, digest, atText, by].some((v) => v !== "");
  // v2 (finding 1): the beta is the internally consistent absent/'beta' state with NO surviving activation pin; a lost or
  // edited mode row beside pins is a contradiction and holds, never a silent return to the beta.
  if (mode === null || mode === "beta") return anyPin ? heldSnapshot("ruleset_mode_corrupt", mode) : betaRulesetSnapshot(mode);
  if (mode !== "full_release") return heldSnapshot("ruleset_mode_corrupt", mode);
  const at = Number(atText);
  if (!FUTURE_REVISION.test(revision!) || !/^[0-9a-f]{64}$/.test(digest!) || !/^\d{1,12}$/.test(atText!) || !Number.isSafeInteger(at) || at <= 0 || !(by === "" || /^\d{17,20}$/.test(by!))) return heldSnapshot("activation_pins_incomplete", mode);
  const pins = { revision: revision!, activatedAt: at, activatedBy: by === "" ? null : by! }; // an emptied actor pin is lawful attribution removal (finding 4)
  const profile = parseFutureProfileSecret(env.RULESET_FUTURE_PROFILE);
  if (!profile) return heldSnapshot("future_profile_missing", mode, pins);
  if (profile.revision !== revision || (await rulesetDigest(profile)) !== digest) return heldSnapshot("future_profile_changed", mode, pins);
  return Object.freeze({ mode: "full_release", modeRaw: mode, profile, held: null, revision: revision!, digest: digest!, activatedAt: at, activatedBy: pins.activatedBy });
}

/** One bounded read of the five rows, then the resolution above. Callers resolve once per request and thread it through. */
export async function activeRulesetSnapshot(env: { DB: D1Database; RULESET_FUTURE_PROFILE?: string }): Promise<RulesetSnapshot> {
  const rows = await env.DB.prepare(`SELECT key, value FROM site_settings WHERE key IN (${RULESET_SETTINGS_KEYS.map(() => "?").join(",")})`).bind(...RULESET_SETTINGS_KEYS).all<{ key: string; value: string }>();
  return resolveRulesetSnapshot(rows.results, env);
}

/** The day a full-release identity was activated, for the "(decided …)" line; the beta keeps its original date. */
export function rulesetDecidedText(snapshot: RulesetSnapshot): string {
  if (snapshot.mode === "beta" || !snapshot.activatedAt) return "decided 16 September 2026";
  const d = new Date(snapshot.activatedAt * 1000);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `decided ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface RulesetSwitchPublic {
  readonly available: false;
  readonly code: "full_release_unavailable" | "full_release_active" | "ruleset_held" | "unsupported_switch_target";
  readonly currentRevision: string;
  readonly mode: "beta" | "full_release";
  readonly held: RulesetHold | null;
  readonly futureProfileConfigured: false;
  readonly ownerEligibilityQualified: false;
  readonly projectionSyncQualified: false;
}
/**
 * The PUBLIC readiness shape (boot and /api/public): booleans stay false here on purpose; whether a secret is configured
 * and who may switch are staff facts (ruleset-publication.ts status). Shape or request input never opens activation.
 */
export function rulesetSwitchReadiness(target: unknown): RulesetSwitchPublic {
  const snapshot = target && typeof target === "object" && !Array.isArray(target) && "mode" in target && "held" in target ? (target as RulesetSnapshot) : null;
  if (!snapshot) {
    return Object.freeze({ available: false as const, code: target === "full_release" ? "full_release_unavailable" as const : "unsupported_switch_target" as const, currentRevision: BETA!.revision, mode: "beta" as const, held: null, futureProfileConfigured: false as const, ownerEligibilityQualified: false as const, projectionSyncQualified: false as const });
  }
  return Object.freeze({
    available: false as const,
    code: snapshot.held ? "ruleset_held" as const : snapshot.mode === "full_release" ? "full_release_active" as const : "full_release_unavailable" as const,
    currentRevision: snapshot.revision, mode: snapshot.mode, held: snapshot.held,
    futureProfileConfigured: false as const, ownerEligibilityQualified: false as const, projectionSyncQualified: false as const,
  });
}

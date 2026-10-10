/** Public game identity only. This module never selects admission, roster, role, invite or launch settings. */
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

// Owner-confirmed public beta identity. No private future identity or mutable selection is provisioned here.
const BETA = parseRulesetProfile({
  schema: "olympus-ruleset-profile-v1", revision: "forever-beta-pvp2-v1", phase: "beta",
  game: "World of Warcraft: Forever", guild: "Olympus", realm: "Classic Beta PvP 2", ruleset: "PvP", faction: "Alliance",
});
if (!BETA) throw new Error("Invalid public beta ruleset profile");

/** Every active projection captures this immutable revision; environment and request input cannot replace it. */
export function currentRulesetProfile(): RulesetProfile { return BETA!; }

export function rulesetLabel(profile: RulesetProfile = currentRulesetProfile()): string {
  const checked = parseRulesetProfile(profile);
  if (!checked) throw new Error("Invalid ruleset profile");
  return `${checked.game} · ${checked.phase === "beta" ? "Beta" : "Full release"} · ${checked.realm} · ${checked.ruleset} · ${checked.faction}`;
}

/** Shape validation never opens activation. A future durable switch must qualify these existing prerequisites. */
export function rulesetSwitchReadiness(target: unknown) {
  return Object.freeze({
    available: false as const,
    code: target === "full_release" ? "full_release_unavailable" as const : "unsupported_switch_target" as const,
    currentRevision: currentRulesetProfile().revision,
    futureProfileConfigured: false as const,
    ownerEligibilityQualified: false as const,
    projectionSyncQualified: false as const,
  });
}

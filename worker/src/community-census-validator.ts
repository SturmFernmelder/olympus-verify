/** Unattached, pure validation of unsigned community observations. No authority grants. */
export const CENSUS_LIMITS = Object.freeze({
  inputBytes: 327680,
  jsonDepth: 8,
  jsonNodes: 4096,
  guilds: 300,
  nameBytes: 128,
  realmGroupBytes: 128,
  addonVersionBytes: 32,
  characters: 1000,
  freshSeconds: 900,
  countedSeconds: 86400,
  retainedSeconds: 604800,
  maximumTimestamp: 253402300799,
});

export interface CensusGuild {
  readonly name: string;
  readonly reportedCharacters: number;
  readonly receivedAt: number;
  readonly fresh: boolean;
  readonly counted: boolean;
  readonly online?: number;
}
export interface CensusSnapshot {
  readonly format: "olympus-census-v1";
  readonly addonVersion: string;
  readonly realmGroup: string;
  readonly faction: "Alliance" | "Horde";
  readonly observedAt: number;
  readonly source: "community-observation";
  readonly membershipProof: false;
  readonly guilds: readonly CensusGuild[];
}
export interface CensusAtReceipt {
  readonly receiptNow: number;
  readonly snapshotAgeSeconds: number;
  readonly guilds: readonly {
    readonly name: string;
    readonly ageSeconds: number;
    readonly fresh: boolean;
    readonly counted: boolean;
    readonly retained: boolean;
  }[];
}
export type CensusValidation =
  | { readonly ok: true; readonly snapshot: CensusSnapshot; readonly atReceipt: CensusAtReceipt }
  | { readonly ok: false; readonly reason: string };

class Refusal extends Error {}
function refuse(reason: string): never { throw new Refusal(reason); }

/** Counts Unicode scalar values as UTF-8 bytes; rejects lone UTF-16 surrogates. */
function utf8Bytes(value: string, maximum: number): number {
  if (value.length > maximum) refuse("input_size");
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) bytes++;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) refuse("invalid_unicode");
      bytes += 4;
    } else if (code >= 0xdc00 && code <= 0xdfff) refuse("invalid_unicode");
    else bytes += 3;
    if (bytes > maximum) refuse("input_size");
  }
  return bytes;
}

/** Small bounded JSON reader: duplicate decoded keys are rejected before assignment. */
function parseBoundedJson(raw: string): unknown {
  let cursor = 0;
  let nodes = 0;
  const whitespace = () => {
    while (cursor < raw.length && (raw[cursor] === " " || raw[cursor] === "\t" ||
      raw[cursor] === "\n" || raw[cursor] === "\r")) cursor++;
  };
  const string = (): string => {
    if (raw[cursor] !== '"') refuse("invalid_json");
    const start = cursor++;
    while (cursor < raw.length) {
      const code = raw.charCodeAt(cursor++);
      if (code === 34) {
        let decoded: string;
        try { decoded = JSON.parse(raw.slice(start, cursor)) as string; }
        catch { return refuse("invalid_json"); }
        utf8Bytes(decoded, CENSUS_LIMITS.inputBytes);
        return decoded;
      }
      if (code < 32) refuse("invalid_json");
      // Skip the escaped code unit here; JSON.parse validates the escape grammar.
      if (code === 92) cursor++;
    }
    return refuse("invalid_json");
  };
  const value = (depth: number): unknown => {
    if (depth > CENSUS_LIMITS.jsonDepth) refuse("json_depth");
    if (++nodes > CENSUS_LIMITS.jsonNodes) refuse("json_nodes");
    whitespace();
    const char = raw[cursor];
    if (char === '"') return string();
    if (char === "{") {
      cursor++;
      const object: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      whitespace();
      if (raw[cursor] === "}") { cursor++; return object; }
      while (cursor < raw.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) refuse("duplicate_json_key");
        keys.add(key);
        whitespace();
        if (raw[cursor++] !== ":") refuse("invalid_json");
        object[key] = value(depth + 1);
        whitespace();
        const delimiter = raw[cursor++];
        if (delimiter === "}") return object;
        if (delimiter !== ",") refuse("invalid_json");
      }
      return refuse("invalid_json");
    }
    if (char === "[") {
      cursor++;
      const array: unknown[] = [];
      whitespace();
      if (raw[cursor] === "]") { cursor++; return array; }
      while (cursor < raw.length) {
        array.push(value(depth + 1));
        whitespace();
        const delimiter = raw[cursor++];
        if (delimiter === "]") return array;
        if (delimiter !== ",") refuse("invalid_json");
      }
      return refuse("invalid_json");
    }
    for (const [token, decoded] of [["true", true], ["false", false], ["null", null]] as const) {
      if (raw.startsWith(token, cursor)) { cursor += token.length; return decoded; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(raw.slice(cursor));
    if (!number) return refuse("invalid_json");
    cursor += number[0].length;
    const parsed = Number(number[0]);
    if (!Number.isFinite(parsed)) refuse("invalid_json_number");
    // Every number in this contract is integral. Reject fractional values that
    // would round/underflow to an integer in JavaScript (for example 1.0000000000000001).
    const decimal = /^-?([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(number[0])!;
    const digits = decimal[1] + (decimal[2] || "");
    const integerPlaces = decimal[1].length + Number(decimal[3] || 0);
    if (/[^0]/.test(digits.slice(Math.max(0, integerPlaces)))) refuse("invalid_json_number");
    return parsed;
  };
  const parsed = value(1);
  whitespace();
  if (cursor !== raw.length) refuse("invalid_json");
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) refuse("object_shape");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) refuse("closed_shape");
}
function integer(value: unknown, maximum: number, reason: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) refuse(reason);
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || /[\x00-\x1f\x7f]/.test(value)) refuse("invalid_text");
  if (utf8Bytes(value, CENSUS_LIMITS.inputBytes) > maximum) refuse("text_size");
  return value;
}
function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, char => String.fromCharCode(char.charCodeAt(0) + 32));
}

/**
 * Pure API. Caller must decode network bytes with a fatal UTF-8 decoder before passing a string.
 * receiptNow is a trusted server clock in integer Unix seconds, not supplied client authority.
 * Valid historical snapshots remain historical: no upload TTL is assumed here.
 */
export function validateCensusJson(raw: string, receiptNow: number): CensusValidation {
  try {
    integer(receiptNow, CENSUS_LIMITS.maximumTimestamp, "invalid_receipt_clock");
    if (typeof raw !== "string") refuse("invalid_input_type");
    utf8Bytes(raw, CENSUS_LIMITS.inputBytes);
    const input = record(parseBoundedJson(raw));
    exactKeys(input, ["format", "addonVersion", "realmGroup", "faction", "observedAt", "source", "membershipProof", "guilds"]);
    if (input.format !== "olympus-census-v1" || input.source !== "community-observation" ||
      input.membershipProof !== false) refuse("invalid_provenance_labels");
    const addonVersion = text(input.addonVersion, CENSUS_LIMITS.addonVersionBytes);
    const realmGroup = text(input.realmGroup, CENSUS_LIMITS.realmGroupBytes);
    if (input.faction !== "Alliance" && input.faction !== "Horde") refuse("invalid_faction");
    const observedAt = integer(input.observedAt, CENSUS_LIMITS.maximumTimestamp, "invalid_observed_clock");
    if (observedAt > receiptNow) refuse("future_snapshot");
    if (!Array.isArray(input.guilds) || input.guilds.length > CENSUS_LIMITS.guilds) refuse("guild_array");
    const names = new Set<string>();
    const guilds: CensusGuild[] = [];
    const atReceipt: CensusAtReceipt["guilds"][number][] = [];
    for (const item of input.guilds) {
      const row = record(item);
      const name = text(row.name, CENSUS_LIMITS.nameBytes);
      const folded = asciiFold(name);
      if (names.has(folded)) refuse("duplicate_guild");
      names.add(folded);
      const reportedCharacters = integer(row.reportedCharacters, CENSUS_LIMITS.characters, "invalid_count");
      const receivedAt = integer(row.receivedAt, CENSUS_LIMITS.maximumTimestamp, "invalid_received_clock");
      if (receivedAt > observedAt) refuse("future_receipt");
      const age = observedAt - receivedAt;
      if (age > CENSUS_LIMITS.retainedSeconds) refuse("expired_export_row");
      const fresh = age <= CENSUS_LIMITS.freshSeconds;
      const counted = age <= CENSUS_LIMITS.countedSeconds;
      if (row.fresh !== fresh || row.counted !== counted) refuse("invalid_freshness_claim");
      exactKeys(row, fresh
        ? ["name", "reportedCharacters", "receivedAt", "fresh", "counted", "online"]
        : ["name", "reportedCharacters", "receivedAt", "fresh", "counted"]);
      const copy: CensusGuild = fresh
        ? { name, reportedCharacters, receivedAt, fresh, counted,
          online: integer(row.online, reportedCharacters, "invalid_online") }
        : { name, reportedCharacters, receivedAt, fresh, counted };
      guilds.push(Object.freeze(copy));
      const ageAtReceipt = receiptNow - receivedAt;
      atReceipt.push(Object.freeze({ name, ageSeconds: ageAtReceipt,
        fresh: ageAtReceipt <= CENSUS_LIMITS.freshSeconds,
        counted: ageAtReceipt <= CENSUS_LIMITS.countedSeconds,
        retained: ageAtReceipt <= CENSUS_LIMITS.retainedSeconds }));
    }
    const snapshot: CensusSnapshot = Object.freeze({ format: "olympus-census-v1", addonVersion,
      realmGroup, faction: input.faction, observedAt, source: "community-observation",
      membershipProof: false, guilds: Object.freeze(guilds) });
    return Object.freeze({ ok: true, snapshot, atReceipt: Object.freeze({ receiptNow,
      snapshotAgeSeconds: receiptNow - observedAt, guilds: Object.freeze(atReceipt) }) });
  } catch (error) {
    return Object.freeze({ ok: false, reason: error instanceof Refusal ? error.message : "invalid_json" });
  }
}

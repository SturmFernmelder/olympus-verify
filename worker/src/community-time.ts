/**
 * .56: time at the adapter boundary. The keeper persists Unix seconds everywhere (db.ts now()); Olympus Forever's
 * modules and their clients speak milliseconds and ISO-8601. Conversion is exact by default and any loss of precision
 * is an explicit call-site decision, never guessed from a value's size (ported from Codex's pure helper candidate,
 * consolidation-2026-09-30/candidates/keeper-adapters/adapters.mjs, manifest df85ff7f…, 33 checks, 1 Oct 2026).
 */
export const MAX_DATE_MS = 8_640_000_000_000_000;
export const MAX_DATE_S = MAX_DATE_MS / 1000;
export type Rounding = "exact" | "floor" | "ceil";

function epoch(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError("invalid_epoch_timestamp");
  return value;
}

export const secondsToMs = (s: number): number => epoch(s, MAX_DATE_S) * 1000;

/** A subsecond value needs a stated policy; "exact" refuses it so a cutoff is never moved by accident. */
export function msToSeconds(ms: number, rounding: Rounding = "exact"): number {
  if (rounding !== "exact" && rounding !== "floor" && rounding !== "ceil") throw new RangeError("unsupported_rounding"); // refused before any value is read
  const v = epoch(ms, MAX_DATE_MS);
  if (rounding === "exact") {
    if (v % 1000 !== 0) throw new RangeError("subsecond_timestamp_requires_policy");
    return v / 1000;
  }
  return rounding === "ceil" ? Math.ceil(v / 1000) : Math.floor(v / 1000);
}

export const secondsToIso = (s: number): string => new Date(secondsToMs(s)).toISOString();

/** An ISO-8601 instant to seconds; subsecond parts follow the stated rounding. */
export function isoToSeconds(iso: string, rounding: Rounding = "exact"): number {
  if (typeof iso !== "string" || iso.length > 40) throw new RangeError("invalid_iso_timestamp");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError("invalid_iso_timestamp");
  return msToSeconds(ms, rounding);
}

/** Only the named own fields, converted; null stays null, a missing field stays missing. */
export function projectSeconds<T extends Record<string, unknown>>(row: T, fields: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    if (!Object.hasOwn(row, f)) continue;
    const v = row[f];
    out[f] = v === null ? null : secondsToIso(epoch(v, MAX_DATE_S));
  }
  return out;
}

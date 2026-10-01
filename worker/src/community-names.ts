/**
 * .56: character names in the community modules (Codex, 1 Oct 01:19 UTC: the keeper's legacy key must not collapse two
 * distinct full names into one community primary key, and a feature's character binding must resolve uniquely through
 * the keeper's own proof, or be refused for review; never last-writer-wins, never an inferred "same character").
 *
 * Two keys, two jobs:
 *  - `communityKey(name)` is the label key for community tables: NFC, whitespace collapsed, ASCII A-Z lowercased, the
 *    FULL name kept (a hyphen is a letter joiner, never a cut). "Anne-Marie Smith" and "Anne-Beth Smith" are distinct.
 *  - `normalizeCharacter` (codes.ts) stays the proof key: it is what the whisper codes, the roster export and the
 *    `characters` table are keyed by, and it cuts at the first hyphen (a realm suffix in other games). It is not
 *    changed here: the existing proof path and every existing binding keep their bytes.
 *
 * `resolveCharacter` joins the two: a claim is `proven` for a subject only when the keeper holds a `characters` row
 * under the claim's proof key that is bound to that subject AND whose stored full name has the same community key;
 * when the row belongs to another account, or its full name differs (two names sharing one proof key), or another
 * account's row carries the same GUID, the answer is `conflict` and the caller refuses and files it for review;
 * when no row exists the claim is `unproven` (a self label only, never proof). A feature that needs proof treats
 * anything but `proven` as a refusal.
 */
import type { Env } from "./env";
import { normalizeCharacter } from "./codes";

export const NAME_MIN = 2;
export const NAME_MAX = 40;
/** Letters joined by single spaces, hyphens or apostrophes; never at an end, never two in a row. */
const SHAPE = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

export type NameResult = { ok: true; name: string; key: string; proofKey: string } | { ok: false; error: "name_not_string" | "name_too_short" | "name_too_long" | "name_invalid" };

export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** The community label key: the whole normalized name, ASCII capitals lowered, nothing cut. */
export function communityKey(name: string): string {
  let out = "";
  for (const ch of normalizeName(name)) {
    const c = ch.charCodeAt(0);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : ch;
  }
  return out;
}

export function validateName(raw: unknown): NameResult {
  if (typeof raw !== "string") return { ok: false, error: "name_not_string" };
  if (raw.length > NAME_MAX * 4) return { ok: false, error: "name_too_long" };
  const name = normalizeName(raw);
  if ([...name].length < NAME_MIN) return { ok: false, error: "name_too_short" };
  if (name.length > NAME_MAX) return { ok: false, error: "name_too_long" };
  if (!SHAPE.test(name)) return { ok: false, error: "name_invalid" };
  return { ok: true, name, key: communityKey(name), proofKey: normalizeCharacter(name) };
}

export type Resolution =
  | { state: "proven"; proofKey: string; guid: string | null; name: string }
  | { state: "unproven"; proofKey: string }
  | { state: "conflict"; proofKey: string; reason: "other_account" | "name_mismatch" | "guid_other_account" };

/**
 * Does the keeper's proof say this subject controls the character named by `claim`? Reads `characters` (the
 * roster-confirmed or verified rows) and refuses anything ambiguous.
 */
export async function resolveCharacter(env: Env, discordId: string, claim: string): Promise<Resolution> {
  const proofKey = normalizeCharacter(claim);
  const row = await env.DB.prepare("SELECT name, discord_id, status, guid FROM characters WHERE name_key = ?1")
    .bind(proofKey)
    .first<{ name: string; discord_id: string; status: string; guid: string | null }>();
  if (!row) return { state: "unproven", proofKey };
  if (row.discord_id !== discordId) return { state: "conflict", proofKey, reason: "other_account" };
  if (communityKey(row.name) !== communityKey(claim)) return { state: "conflict", proofKey, reason: "name_mismatch" };
  if (row.guid) {
    const other = await env.DB.prepare("SELECT 1 AS hit FROM characters WHERE guid = ?1 AND discord_id <> ?2 LIMIT 1").bind(row.guid, discordId).first<{ hit: number }>();
    if (other) return { state: "conflict", proofKey, reason: "guid_other_account" };
  }
  return { state: "proven", proofKey, guid: row.guid, name: row.name };
}

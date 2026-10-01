import type { Env } from "./env";

export const now = () => Math.floor(Date.now() / 1000);

/**
 * A LIKE pattern for "contains" (or, with prefix, "starts with"), with the caller's %, _ and backslash taken literally
 * (the SQL must say ESCAPE and a backslash), cut short so the whole pattern stays within D1's 50-byte limit on LIKE
 * patterns: a longer one fails the query ("LIKE or GLOB pattern too complex") instead of matching nothing.
 */
export function likeArg(s: string, prefix = false): string {
  const enc = new TextEncoder();
  const lead = prefix ? "" : "%";
  let body = "";
  for (const ch of s) {
    const piece = /[\\%_]/.test(ch) ? "\\" + ch : ch;
    if (enc.encode(`${lead}${body}${piece}%`).length > 50) break;
    body += piece;
  }
  return `${lead}${body}%`;
}

export async function audit(env: Env, actor: string, action: string, subject?: string, details?: unknown) {
  await env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(now(), actor, action, subject ?? null, details === undefined ? null : JSON.stringify(details))
    .run();
}

export interface MemberRow {
  discord_id: string;
  discord_name: string | null;
  battletag: string | null;
  bnet_conn_id: string | null;
  linked_at: number | null;
  banned: number;
  ban_reason: string | null;
}

export interface CharacterRow {
  name_key: string;
  name: string;
  discord_id: string;
  status: string;
  bound_at: number;
  verified_at: number | null;
  member_since: number | null;
  left_at: number | null;
  source: string | null;
  guid?: string | null; // pinned when the link first meets a roster export (schema.ts)
}

export interface PendingRow {
  id: number;
  discord_id: string;
  name_key: string;
  name: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
  nonce?: string | null; // a request code ("ticket"): no character until someone whispers it
}

export interface QueueRow {
  id: number;
  name_key: string;
  name: string;
  discord_id: string;
  note: string | null;
  status: string;
  created_at: number;
}

export const getMember = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM members WHERE discord_id = ?1").bind(id).first<MemberRow>();

export const getCharacter = (env: Env, nameKey: string) =>
  env.DB.prepare("SELECT * FROM characters WHERE name_key = ?1").bind(nameKey).first<CharacterRow>();

export const openPendingFor = (env: Env, nameKey: string) =>
  env.DB.prepare(
    "SELECT * FROM pending WHERE name_key = ?1 AND consumed_at IS NULL AND expires_at > ?2 ORDER BY id DESC LIMIT 1",
  )
    .bind(nameKey, now())
    .first<PendingRow>();

/** The open request code with this nonce (unique among open requests by construction), or null. */
export const openTicket = (env: Env, nonce: string) =>
  env.DB.prepare("SELECT * FROM pending WHERE nonce = ?1 AND consumed_at IS NULL AND expires_at > ?2 ORDER BY id DESC LIMIT 1")
    .bind(nonce, now())
    .first<PendingRow>();

/** This account's open request code, so pressing Verify twice shows the same code instead of minting another. */
export const openTicketFor = (env: Env, discordId: string) =>
  env.DB.prepare(
    "SELECT * FROM pending WHERE discord_id = ?1 AND nonce IS NOT NULL AND consumed_at IS NULL AND expires_at > ?2 ORDER BY id DESC LIMIT 1",
  )
    .bind(discordId, now())
    .first<PendingRow>();

/**
 * LINKS_NOT_BEFORE: links made before this moment only count once a roster export has pinned their GUID. Set it to the
 * live launch so a beta link can never pass to whoever takes the same name on live. Unix seconds or YYYY-MM-DD (UTC).
 */
export function linksNotBefore(env: Env): number {
  const raw = (env.LINKS_NOT_BEFORE ?? "").trim();
  if (!raw) return 0;
  if (/^\d{9,11}$/.test(raw)) return Number(raw);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

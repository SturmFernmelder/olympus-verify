/**
 * .56: one opaque, random, stable reference per member (the donor's member_refs, migration 0014). Directory profiles,
 * crafting results and attendance lists show this `ref` to other members, never a Discord id. It is created inside a
 * member's first admitted community write (the statement below requires that write's nonce, so a refused write creates
 * nothing), never changes, and goes with the account (deleteSiteData) or when nothing addresses it any more.
 */
import type { Env } from "./env";
import { randomToken, registerCommunityData } from "./community-context";

export const REF_RE = /^[A-Za-z0-9_-]{22}$/;
export const newRef = (): string => randomToken();

/**
 * After an admitted first statement on `table` (which stored `nonce` in its write_nonce column for `discordId`): the
 * member's ref row, if they have none yet.
 */
export function refAfter(env: Env, discordId: string, table: "community_profiles", nonce: string, ref: string, at: number): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO community_refs (discord_id, ref, created_at)
     SELECT ?1, ?3, ?4 WHERE EXISTS (SELECT 1 FROM ${table} WHERE discord_id = ?1 AND write_nonce = ?2)
     ON CONFLICT(discord_id) DO NOTHING`,
  ).bind(discordId, nonce, ref, at);
}

/** .59: after an admitted RSVP (its nonce on the signup row): the member's ref, a profile's ref winning over the new one. */
export function refAfterSignup(env: Env, eventId: string, discordId: string, nonce: string, ref: string, at: number): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO community_refs (discord_id, ref, created_at)
     SELECT ?2, COALESCE((SELECT p.ref FROM community_profiles p WHERE p.discord_id = ?2), ?4), ?5
     WHERE EXISTS (SELECT 1 FROM community_event_signups WHERE event_id = ?1 AND discord_id = ?2 AND write_nonce = ?3)
     ON CONFLICT(discord_id) DO NOTHING`,
  ).bind(eventId, discordId, nonce, ref, at);
}

export async function refOf(env: Env, discordId: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT ref FROM community_refs WHERE discord_id = ?1").bind(discordId).first<{ ref: string }>();
  return row?.ref ?? null;
}

registerCommunityData(
  "refs",
  (env, id) => [env.DB.prepare("DELETE FROM community_refs WHERE discord_id = ?1").bind(id)],
  (env, id) => ({ statements: [env.DB.prepare("SELECT ref FROM community_refs WHERE discord_id = ?1").bind(id)], shape: ([r]) => ({ ref: (r!.results as { ref: string }[])[0]?.ref ?? null }) }), // .74: a plan, run in the copy's one admitted batch
);

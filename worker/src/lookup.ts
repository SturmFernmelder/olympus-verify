/**
 * "Who is this?" for officers (build .41, 29 Sep 2026): one Discord account and everything the bot knows about it, or
 * a character and the account that linked it.
 *
 * Three ways in, one answer:
 *   - /olympus-lookup member: or character: in Asmongold's server (INTROS_GUILD_ID), and right-click a member ->
 *     Apps -> "Olympus linked characters" there. index.ts routes both ahead of the "only serves Olympus" guard, the
 *     same way as /olympus-intros, and they are gated the same way: INTROS_ROLES or Administrator.
 *   - /olympus-admin lookup and the same right-click in the Olympus server (interactions.ts, officer roles).
 *   - The guild site's admin page (site-admin.ts), as JSON.
 * Replies are ephemeral: only the officer who asked sees them.
 */
import type { Env } from "./env";
import { bnetFresh } from "./bnet-retention";
import { likeArg, now } from "./db";
import { normalizeCharacter } from "./codes";
import { autocomplete, focusedOption, option, reply, type Interaction } from "./discord";
import { mayManageIntros } from "./intros";
import { currentPosition, roleKeyOf, roleLabel } from "./site-data";

export const LOOKUP_COMMAND = "olympus-lookup";
/** The user command's name. The Olympus server has one with the same name (interactions.ts USER_MENU_LOOKUP). */
export const LOOKUP_USER_MENU = "Olympus linked characters";

export interface AccountInfo {
  id: string;
  names: { username: string | null; displayName: string | null; nick: string | null };
  accountCreated: number | null;
  member: { battletag: string | null; linkedAt: number | null; banned: boolean; banReason: string | null } | null;
  characters: Array<{ name: string; status: string; boundAt: number; verifiedAt: number | null; memberSince: number | null; leftAt: number | null; source: string | null }>;
  openCodes: Array<{ name: string; expiresAt: number }>;
  queue: Array<{ name: string; status: string; priority: number; createdAt: number }>;
  site: {
    signedUp: boolean;
    lastLogin: number | null;
    serverJoined: number | null;
    inServer: boolean;
    denied: boolean;
    deniedReason: string | null;
    application: { position: string; classLead: string | null; backups: string[]; status: string; updatedAt: number } | null;
    reserved: Array<{ id: number; name: string; status: string }>;
    friends: number;
    listedBy: number;
    writtenIn: number; // other members' write-in nominations naming this account (.43: staff can remove them)
    referencedBy: number; // other members' applications that list this account as a reference
    votesCast: number;
  };
}

export async function accountInfo(env: Env, id: string): Promise<AccountInfo> {
  const m = await env.DB.prepare("SELECT * FROM members WHERE discord_id = ?1").bind(id).first<{
    battletag: string | null; linked_at: number | null; banned: number; ban_reason: string | null; username?: string | null; global_name?: string | null;
  }>();
  const su = await env.DB.prepare("SELECT * FROM site_users WHERE discord_id = ?1").bind(id).first<{
    username: string | null; global_name: string | null; nick: string | null; account_created: number | null; server_joined: number | null;
    last_login: number; in_server: number; denied: number; denied_reason: string | null;
  }>();
  const chars = await env.DB.prepare(
    "SELECT name, status, bound_at AS boundAt, verified_at AS verifiedAt, member_since AS memberSince, left_at AS leftAt, source FROM characters WHERE discord_id = ?1 ORDER BY bound_at",
  )
    .bind(id)
    .all<AccountInfo["characters"][number]>();
  const codes = await env.DB.prepare("SELECT name, expires_at AS expiresAt FROM pending WHERE discord_id = ?1 AND consumed_at IS NULL AND expires_at > ?2")
    .bind(id, now())
    .all<{ name: string; expiresAt: number }>();
  const queue = await env.DB.prepare(
    "SELECT name, status, priority, created_at AS createdAt FROM invite_queue WHERE discord_id = ?1 AND status IN ('queued','written','invited') ORDER BY id",
  )
    .bind(id)
    .all<{ name: string; status: string; priority: number; createdAt: number }>();
  const appRow = await env.DB.prepare("SELECT position, class_lead AS classLead, region, backup1, backup2, status, updated_at AS updatedAt FROM site_applications WHERE discord_id = ?1")
    .bind(id)
    .first<{ position: string; classLead: string | null; region: string | null; backup1: string | null; backup2: string | null; status: string; updatedAt: number }>();
  const app = appRow
    ? { position: currentPosition(appRow.position, appRow.region), classLead: appRow.classLead, backups: [appRow.backup1, appRow.backup2].filter((x): x is string => !!x), status: appRow.status, updatedAt: appRow.updatedAt }
    : null;
  const reserved = await env.DB.prepare("SELECT id, name, status FROM site_reserved WHERE owner_id = ?1 AND status <> 'released' ORDER BY id")
    .bind(id)
    .all<{ id: number; name: string; status: string }>();
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM site_friends WHERE owner_id = ?1) AS friends,
            (SELECT COUNT(*) FROM site_friends WHERE friend_kind = 'discord' AND friend_key = ?1) AS listedBy,
            (SELECT COUNT(*) FROM site_votes WHERE nominee_kind = 'discord' AND nominee_key = ?1) AS writtenIn,
            (SELECT COUNT(*) FROM site_votes WHERE voter_id = ?1) AS votesCast`,
  )
    .bind(id)
    .first<{ friends: number; listedBy: number; writtenIn: number; votesCast: number }>();
  let created: number | null = su?.account_created ?? null;
  if (created === null) {
    try {
      created = Math.floor(Number((BigInt(id) >> 22n) + 1420070400000n) / 1000);
    } catch {
      created = null;
    }
  }
  return {
    id,
    names: { username: su?.username ?? m?.username ?? null, displayName: su?.global_name ?? m?.global_name ?? null, nick: su?.nick ?? null },
    accountCreated: created,
    // .48: a stale link (older than 29 days, not yet purged) is not shown to anyone.
    member: m ? { battletag: bnetFresh(m.linked_at) ? m.battletag : null, linkedAt: bnetFresh(m.linked_at) ? m.linked_at : null, banned: !!m.banned, banReason: m.ban_reason } : null,
    characters: chars.results,
    openCodes: codes.results,
    queue: queue.results,
    site: {
      signedUp: !!su,
      lastLogin: su?.last_login ?? null,
      serverJoined: su?.server_joined ?? null,
      inServer: su ? !!su.in_server : false,
      denied: !!su?.denied,
      deniedReason: su?.denied_reason ?? null,
      application: app ?? null,
      reserved: reserved.results,
      friends: counts?.friends ?? 0,
      listedBy: counts?.listedBy ?? 0,
      writtenIn: counts?.writtenIn ?? 0,
      referencedBy: (await referencesNaming(env, id)).length,
      votesCast: counts?.votesCast ?? 0,
    },
  };
}

/**
 * Other members' applications that list this account as a reference, each with that reference taken out (the new
 * answers, ready to save). The LIKE only narrows the rows cheaply (an id is 17 to 20 digits, well inside D1's limit for
 * a LIKE pattern); the parsed JSON decides.
 */
export async function referencesNaming(env: Env, id: string): Promise<Array<{ owner: string; answers: string }>> {
  if (!/^\d{17,20}$/.test(id)) return [];
  const rows = await env.DB.prepare("SELECT discord_id, answers FROM site_applications WHERE discord_id <> ?1 AND answers LIKE ?2")
    .bind(id, `%${id}%`)
    .all<{ discord_id: string; answers: string }>();
  const out: Array<{ owner: string; answers: string }> = [];
  for (const r of rows.results) {
    let a: Record<string, unknown>;
    try {
      a = JSON.parse(r.answers) as Record<string, unknown>;
    } catch {
      continue;
    }
    const refs = Array.isArray(a.references) ? (a.references as Array<{ kind?: unknown; key?: unknown }>) : [];
    const kept = refs.filter((p) => !(p && p.kind === "discord" && p.key === id));
    if (kept.length !== refs.length) out.push({ owner: r.discord_id, answers: JSON.stringify({ ...a, references: kept }) });
  }
  return out;
}

const CHAR_STATUS: Record<string, (c: AccountInfo["characters"][number]) => string> = {
  member: (c) => `in the guild${c.memberSince ? ` since <t:${c.memberSince}:d>` : ""}`,
  verified: (c) => `verified${c.verifiedAt ? ` <t:${c.verifiedAt}:d>` : ""}, not on the roster yet`,
  queued: () => "verified, invite queued",
  left: (c) => `left the guild${c.leftAt ? ` <t:${c.leftAt}:d>` : ""}`,
  left_pending: () => "missing from the last roster export (the role goes if the next one agrees)",
  denied: () => "application denied",
  unbound: () => "unbound by an officer",
};

const positionLabel = (key: string, cls: string | null) => roleLabel(roleKeyOf(key, cls));

/** The Discord reply: at most ~1900 characters, the most useful lines first. */
export function accountText(a: AccountInfo): string {
  const who = a.names.username ? `**@${a.names.username}**${a.names.displayName && a.names.displayName !== a.names.username ? ` (${a.names.displayName})` : ""}` : "This account";
  const lines = [`${who} — <@${a.id}>${a.accountCreated ? `, on Discord since <t:${a.accountCreated}:D>` : ""}`];
  if (a.characters.length) {
    lines.push("**Linked characters:**");
    for (const c of a.characters) lines.push(`• **${c.name}** — ${(CHAR_STATUS[c.status] ?? (() => c.status))(c)}`);
  } else {
    lines.push("No characters linked.");
  }
  for (const p of a.openCodes) lines.push(`• ${p.name || "(any character)"} — code issued, not whispered yet (expires <t:${p.expiresAt}:R>)`);
  for (const q of a.queue) lines.push(`• ${q.name} — invite ${q.status}${q.priority > 0 ? " (reserved name, top of the queue)" : ""}`);
  if (a.member?.battletag) lines.push(`Battle.net: **${a.member.battletag}**${a.member.linkedAt ? ` (linked <t:${a.member.linkedAt}:d>)` : ""}`);
  if (a.member?.banned) lines.push(`⛔ **Banned from verifying**${a.member.banReason ? ` — ${a.member.banReason}` : ""}`);
  const s = a.site;
  if (s.signedUp) {
    const bits: string[] = [];
    if (s.application) {
      const also = s.application.backups.length ? `, backups: ${s.application.backups.map(roleLabel).join(", ")}` : "";
      bits.push(`applied for **${positionLabel(s.application.position, s.application.classLead)}**${also} (${s.application.status}, <t:${s.application.updatedAt}:R>)`);
    }
    if (s.reserved.length) bits.push(`reserved names: ${s.reserved.map((r) => `${r.name} (${r.status})`).join(", ")}`);
    if (s.friends) bits.push(`${s.friends} friend${s.friends === 1 ? "" : "s"} listed`);
    if (s.listedBy) bits.push(`listed as a friend by ${s.listedBy}`);
    lines.push(`**Guild site:** ${bits.length ? bits.join(" · ") : "signed in, nothing entered yet"}${s.serverJoined ? ` · in Asmongold's server since <t:${s.serverJoined}:D>` : ""}${s.inServer ? "" : " · **left Asmongold's server**"}`);
    // The reason stays on the site's admin page: the deny dialog tells the admin only site admins read it.
    if (s.denied) lines.push("⛔ **Permanently denied on the guild site**");
  } else {
    lines.push("Guild site: never signed in.");
  }
  const text = lines.join("\n");
  return text.length > 1900 ? text.slice(0, 1890) + "…" : text;
}

/** For a character name: the account that linked it, or the site user who entered it as a reserved name. */
export async function ownerOfCharacter(env: Env, raw: string): Promise<{ id: string; how: string } | null> {
  const key = normalizeCharacter(raw);
  if (!key) return null;
  const c = await env.DB.prepare("SELECT discord_id, name, status FROM characters WHERE name_key = ?1").bind(key).first<{ discord_id: string; name: string; status: string }>();
  if (c) return { id: c.discord_id, how: `**${c.name}** is linked to this account (${c.status}).` };
  const r = await env.DB.prepare("SELECT owner_id, name FROM site_reserved WHERE name_key = ?1 AND status <> 'released' ORDER BY id LIMIT 1")
    .bind(key)
    .first<{ owner_id: string; name: string }>();
  if (r) return { id: r.owner_id, how: `**${r.name}** is not linked to anyone yet; this account entered it as a reserved name on the guild site.` };
  return null;
}

/** True when this interaction is one of the lookup commands in Asmongold's server (and that server is not GUILD_ID). */
export function isAsmongoldLookup(env: Env, i: Interaction): boolean {
  const guild = (env.INTROS_GUILD_ID ?? "").trim();
  if (!guild || guild === env.GUILD_ID || i.guild_id !== guild) return false;
  if (i.type === 2) return i.data?.name === LOOKUP_COMMAND || (i.data?.type === 2 && i.data?.name === LOOKUP_USER_MENU);
  if (i.type === 4) return i.data?.name === LOOKUP_COMMAND;
  return false;
}

export async function handleLookup(env: Env, i: Interaction): Promise<Response> {
  if (i.type === 4) return lookupAutocomplete(env, i);
  if (!mayManageIntros(env, i)) return reply("Olympus officers only.");
  const target = i.data?.type === 2 ? i.data?.target_id : option<string>(i, "member");
  if (target) return reply(accountText(await accountInfo(env, target)));
  const raw = (option<string>(i, "character") ?? "").trim();
  if (!raw) return reply("Pick a member, or give a character name.");
  const owner = await ownerOfCharacter(env, raw);
  if (!owner) return reply(`Nobody has linked **${raw.slice(0, 40)}**, and nobody entered it as a reserved name.`);
  const text = `${owner.how}\n${accountText(await accountInfo(env, owner.id))}`;
  return reply(text.length > 1990 ? text.slice(0, 1985) + "…" : text);
}

/** Character names from the newest roster export and the linked characters, for the character: option. */
async function lookupAutocomplete(env: Env, i: Interaction): Promise<Response> {
  if (!mayManageIntros(env, i)) return autocomplete([]);
  const f = focusedOption(i);
  if (!f || f.name !== "character") return autocomplete([]);
  const q = normalizeCharacter(f.value);
  if ([...q].length < 2) return autocomplete([]);
  const rows = await env.DB.prepare(
    `SELECT name FROM (
       SELECT name, name_key FROM characters WHERE name_key LIKE ?1 ESCAPE '\\' AND status NOT IN ('unbound','denied')
       UNION
       SELECT rm.name, rm.name_key FROM roster_members rm
        WHERE rm.snapshot_id = (SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1) AND rm.name_key LIKE ?1 ESCAPE '\\'
     ) ORDER BY name LIMIT 25`,
  )
    .bind(likeArg(q, true))
    .all<{ name: string }>();
  return autocomplete(rows.results.map((r) => ({ name: r.name, value: r.name })));
}

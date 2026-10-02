/** Slash commands and message components. Discord calls POST /interactions (HTTP interactions, no gateway). */
import type { Env } from "./env";
import { audit, getCharacter, getMember, likeArg, now, openPendingFor, openTicketFor, type PendingRow } from "./db";
import { banApproverRoles, officerRankNames, officerRoles, staffChannel } from "./env";
import { codeFor, dayBucket, normalizeCharacter, randomNonce, ticketFor } from "./codes";
import { autocomplete, banMember, DiscordError, editMessage, explainDiscordError, focusedOption, hasAnyRole, type Interaction, json, logLine, modalField, option, postMessage, removeRole, reply, rest, subcommand, updateMessage, userOf } from "./discord";
import { syncFromLatest } from "./roster";
import { explainRefusal, guildIsFull, waitlistPosition } from "./ingest";
import { approvePending, denyPending } from "./review";
import { GUIDE_FIELD, GUIDE_MODAL, GUIDE_STATUS, GUIDE_VERIFY, guideMessage, verifyModal, visitorChat } from "./guide";
import { unverifiedReport } from "./unverified";
import { restoreMemberRole, restoreNote } from "./restore";
import { relayStatus, ticketsReady, whisperInstructions } from "./relays";
import { accountInfo, accountText, ownerOfCharacter } from "./lookup";
import { BNET_TTL_S, bnetFresh, everLinked } from "./bnet-retention";
import { bnetLoginOn } from "./bnet-switch";
import { openRenameHold, reapplyText } from "./rename-review";

/** The pinned guide is one of the bot's own messages, so no human account can edit it from the Discord UI — only
 *  the author can, and the author is the bot. Reposting leaves the stale pinned copy behind, so this finds the
 *  pinned guide and PATCHes it in place: same message, same pin, same position, new text. */
async function refreshPinnedGuide(env: Env, channel: string): Promise<{ edited: string } | { error: string }> {
  const me = await rest<{ id: string }>(env, "GET", "/users/@me");
  // Discord deprecated GET /channels/{id}/pins in favour of the paginated /messages/pins, which returns
  // {items:[{message}]} rather than a bare array. Try the current shape, fall back to the old one.
  let pins: Array<{ id: string; author?: { id: string }; embeds?: unknown[] }> = [];
  try {
    const paged = await rest<{ items?: Array<{ message: { id: string; author?: { id: string }; embeds?: unknown[] } }> }>(
      env, "GET", `/channels/${channel}/messages/pins`);
    pins = (paged.items ?? []).map((p) => p.message);
  } catch {
    pins = await rest<Array<{ id: string; author?: { id: string }; embeds?: unknown[] }>>(env, "GET", `/channels/${channel}/pins`);
  }
  const mine = pins.filter((m) => m.author?.id === me.id && (m.embeds?.length ?? 0) > 0);
  if (mine.length === 0) return { error: "no pinned message from this bot in that channel" };
  if (mine.length > 1) return { error: `${mine.length} pinned bot messages in that channel — unpin the old ones so there is only one guide to edit` };
  await editMessage(env, channel, mine[0].id, guideMessage(env));
  return { edited: mine[0].id };
}

const PENDING_TTL = 24 * 3600; // one code per character per day, plus the boundary tolerance in codes.ts
// A request code is accepted on its issue day and the next (codes.ts), so a nonce is not handed out again for 48 hours.
const NONCE_REUSE_AFTER = 48 * 3600;
// Forever uses two-part names; allow one space and apostrophes, and accented letters (EU realms) via Unicode classes.
const NAME_RE = /^\p{L}[\p{L}' ]{1,30}$/u;
export const USER_MENU_LOOKUP = "Olympus linked characters"; // user context-menu command (right-click a member → Apps)

export async function handleInteraction(env: Env, i: Interaction): Promise<Response> {
  if (i.type === 1) return json({ type: 1 }); // PING
  // .58: every admitted interaction names the configured guild; one without a guild_id (a DM, a user-installed context)
  // used to pass this guard and could open a code request (Codex's probe, 1 Oct 01:35 UTC).
  if (i.guild_id !== env.GUILD_ID) return reply("This bot only serves Olympus.");

  if (i.type === 2) {
    if (i.data?.type === 2) return cmdUserMenu(env, i);
    switch (i.data?.name) {
      case "verify": {
        // With a character: a code bound to that name (the original path). Without one: a request code, and the
        // character is whichever one whispers it (27 Sep). The option is optional once scripts/register.mjs has run.
        const character = (option<string>(i, "character") ?? "").trim();
        return character ? issueCode(env, i, character) : issueTicket(env, i);
      }
      case "verify-status":
        return cmdStatus(env, i);
      case "olympus-admin":
        return cmdAdmin(env, i);
    }
    return reply("Unknown command.");
  }
  if (i.type === 4) return handleAutocomplete(env, i);
  if (i.type === 3) return handleComponent(env, i);
  if (i.type === 5) {
    // modal submit — the "Verify a character" button in the pinned guide
    if (i.data?.custom_id === GUIDE_MODAL) return issueCode(env, i, modalField(i, GUIDE_FIELD) ?? "");
    return reply("Unknown form.");
  }
  return reply("Unsupported interaction.");
}

// ---------- /verify <character>: a code bound to that character (the guide's button issues request codes below) ----------
async function issueCode(env: Env, i: Interaction, input: string): Promise<Response> {
  const user = userOf(i);
  const raw = input.trim();
  if (!NAME_RE.test(raw)) return reply("Give the character name exactly as it appears in game (letters only; two-part names with one space).");

  // Battle.net is not required. The bnet login only ever requested scope=openid, so it proved "this Discord
  // account holds BattleTag X" and nothing about who controls the character — the in-game whisper is the actual
  // proof of control. getMember is null for a first-time applicant, so `banned` is read optionally here.
  const member = await getMember(env, user.id);
  if (member?.banned) return reply("This account cannot verify. Contact an officer if you think that is a mistake.");

  const nameKey = normalizeCharacter(raw);
  const existing = await getCharacter(env, nameKey);
  if (existing && existing.discord_id !== user.id && existing.status !== "unbound") {
    await audit(env, user.id, "verify.refused_bound", raw, { boundTo: existing.discord_id });
    return reply(
      `**${raw}** is already linked to another Discord account. If that character is yours, ask an officer in #help-desk — the bot never re-links a name on its own.`,
    );
  }
  if (existing && existing.discord_id === user.id && existing.status === "member") {
    // This is the answer someone gets after MEE6 has taken their role away (see restore.ts), so it comes back here.
    const note = restoreNote(await restoreMemberRole(env, user.id, i.member?.roles, "verify"));
    return reply(`**${existing.name}** is already verified and in the guild.${note ? `\n${note}` : ""}`);
  }

  // One open request per character name at a time (first come, first served, 24 h).
  const open = await openPendingFor(env, nameKey);
  if (open && open.discord_id !== user.id) {
    return reply(`A verification for **${raw}** is already in progress from another account. It expires <t:${open.expires_at}:R>; if the character is yours, whisper the code from it or ask an officer.`);
  }
  let expiresAt = open?.expires_at;
  if (!open) {
    expiresAt = now() + PENDING_TTL;
    await env.DB.prepare("INSERT INTO pending (discord_id, name_key, name, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(user.id, nameKey, raw, now(), expiresAt)
      .run();
    await audit(env, user.id, "verify.requested", raw);
  }
  const code = await codeFor(env.VERIFY_SECRET, raw, dayBucket(new Date()));
  return reply(
    [
      `Your code for **${raw}**: \`${code}\`  (valid until <t:${expiresAt}:f>)`,
      ``,
      ...whisperInstructions(env, code, expiresAt!, await relayStatus(env), raw),
      env.ROLE_GUILD_MEMBER
        ? `Your Guild Member role follows automatically once you are on the guild roster${env.ADMISSION_MODE === "review" ? ", after an officer approves" : ""} \u2014 already in the guild? Then it follows as soon as the code is confirmed.`
        : `Your guild invite is queued as soon as the code is confirmed${env.ADMISSION_MODE === "review" ? " and an officer approves" : ""} \u2014 already in the guild? Then your Discord account is linked to the character on the spot.`,
      `This is for the **main Olympus guild** only \u2014 Olympus 2 and the later Olympus guilds are not verified here (their members use ${visitorChat(env)}).`,
    ].join("\n"),
  );
}

/**
 * The guide's Verify button, and /verify with no character: a request code (a "ticket", see codes.ts). Nothing to type
 * in Discord, and no name to get wrong: the character linked is whichever one whispers the code, which the game server
 * vouches for. Pressing it again while the code is unused shows the same code rather than minting another.
 *
 * Deliberately not reserving anything: the old name-first flow let anyone hold a name they did not own for 24 hours
 * ("already in progress from another account"). A ticket holds nothing until a character whispers it. The cost is
 * that a leaked code could be whispered from the wrong character; the link then shows that character to its owner
 * in /verify-status, and an officer unbinds it.
 */
async function issueTicket(env: Env, i: Interaction): Promise<Response> {
  const user = userOf(i);
  const member = await getMember(env, user.id);
  if (member?.banned) return reply("This account cannot verify. Contact an officer if you think that is a mistake.");
  // Until an officer's addon and watcher that understand request codes have checked in (relays.ts), a request code
  // would be refused in game ("not valid") and dropped by the watcher, so the button asks for the character instead,
  // exactly as it did before 27 Sep. This is what makes the rollout order not matter.
  if (!(await ticketsReady(env))) return json(verifyModal());

  let row: PendingRow | null = await openTicketFor(env, user.id);
  for (let tries = 0; tries < 20 && !row; tries++) {
    const nonce = randomNonce();
    const t = now();
    // A nonce is handed out again only after every earlier code made from it has stopped passing anywhere (the issue
    // day and the next, so at most 48 hours; postVerify also insists on the exact code a request showed). The check
    // and the insert are one statement, so two presses racing for the same nonce cannot both get it: D1 runs
    // statements one at a time.
    const ins = await env.DB.prepare(
      `INSERT INTO pending (discord_id, name_key, name, created_at, expires_at, nonce)
       SELECT ?1, '', '', ?2, ?3, ?4
        WHERE NOT EXISTS (SELECT 1 FROM pending WHERE nonce = ?4 AND created_at > ?5)`,
    )
      .bind(user.id, t, t + PENDING_TTL, nonce, t - NONCE_REUSE_AFTER)
      .run();
    if (!ins.meta.changes) continue;
    row = { id: Number(ins.meta.last_row_id), discord_id: user.id, name_key: "", name: "", created_at: t, expires_at: t + PENDING_TTL, consumed_at: null, nonce };
    await audit(env, user.id, "verify.ticket_issued", undefined, { expiresAt: row.expires_at });
  }
  if (!row) return reply("Could not issue a code just now \u2014 please try again in a minute.");
  // The mac is over the issue day; the addon accepts that day and the next, which covers the whole 24-hour lifetime.
  const code = await ticketFor(env.VERIFY_SECRET, row.nonce!, dayBucket(new Date(row.created_at * 1000)));
  return reply(
    [
      `Your code: \`${code}\`  (valid until <t:${row.expires_at}:f>)`,
      ``,
      ...whisperInstructions(env, code, row.expires_at, await relayStatus(env, { tickets: true })),
      `The character that sends it is the one linked to your Discord account. Another character later? Press the button again once this one is confirmed.`,
      env.ROLE_GUILD_MEMBER
        ? `Your Guild Member role follows automatically once that character is on the guild roster${env.ADMISSION_MODE === "review" ? ", after an officer approves" : ""} \u2014 already in the guild? Then it follows as soon as the code is confirmed.`
        : `Your guild invite is queued as soon as the code is confirmed${env.ADMISSION_MODE === "review" ? " and an officer approves" : ""}.`,
      `This is for the **main Olympus guild** only \u2014 Olympus 2 and the later Olympus guilds are not verified here (their members use ${visitorChat(env)}).`,
    ].join("\n"),
  );
}

// ---------- /verify-status ----------
async function cmdStatus(env: Env, i: Interaction): Promise<Response> {
  const user = userOf(i);
  const member = await getMember(env, user.id);
  const chars = await env.DB.prepare("SELECT name, status, verified_at, member_since FROM characters WHERE discord_id = ?1 ORDER BY bound_at")
    .bind(user.id)
    .all<{ name: string; status: string; verified_at: number | null; member_since: number | null }>();
  const pend = await env.DB.prepare("SELECT name, expires_at FROM pending WHERE discord_id = ?1 AND consumed_at IS NULL AND expires_at > ?2")
    .bind(user.id, now())
    .all<{ name: string; expires_at: number }>();
  // Battle.net is optional now, so its absence is not worth a line; showing it when present keeps the older
  // links meaningful for anyone who already did it.
  const lines: string[] = [];
  // /verify-status and the guide's "My status" button are where people look when their access has gone missing.
  const restored = restoreNote(await restoreMemberRole(env, user.id, i.member?.roles, "status"));
  if (restored) lines.push(restored);
  // .114: a rename Blizzard required (rename-review.ts): the account applies again, and this is where the member reads why
  const hold = await openRenameHold(env, user.id);
  if (hold) lines.push(reapplyText(hold));
  // .48: a link is shown only while it is fresh (29 days from the last Battle.net login); the cron purges it after that.
  // .114: and only while Battle.net sign-in is switched on (bnet-switch.ts): while it is off the bot says nothing about
  // keeping a link (Viktor, 2 Oct 2026: no Battle.net retention text until there is a Battle.net login worth having).
  const bnetOn = await bnetLoginOn(env);
  if (bnetOn && member?.battletag && bnetFresh(member.linked_at)) {
    lines.push(`Battle.net: linked (${member.battletag}) \u2014 optional; kept until <t:${(member.linked_at ?? 0) + BNET_TTL_S}:d> unless you link again`);
  }
  // .50: builds before this one also copied the BattleTag into Discord's own record of the connection, where no purge
  // of ours reaches it. Everyone who ever linked is told how it goes away; nobody else needs the line. .114: while the
  // switch is off, linking again is no remedy, so the line names the one that is left.
  if (await everLinked(env, user.id)) {
    lines.push(bnetOn
      ? "Discord's own record of this connection may still carry your BattleTag from an earlier link; linking again replaces it, and removing the connection in Discord's settings (Connections) clears it."
      : "Discord's own record of your earlier Battle.net link for this bot may still carry your BattleTag; removing the connection in Discord's settings (Connections) clears it.");
  }
  // While the guild is at its cap an invite simply cannot go out, and saying "queued" forever reads as broken.
  // Telling someone they are twelfth in line is the difference between waiting and being ignored.
  // The same argument covers every other refusal, and harder: a full guild clears on its own, but someone still in
  // another guild waits forever, and this is the only place they can find out why. The addon whispers them as it
  // happens, which reaches whoever is online at that moment; DMs are barred while the app is flagged. A slash
  // command reaches everyone, so the reason is read off the queue row rather than guessed at from the status.
  const full = await guildIsFull(env);
  const qrows = await env.DB.prepare(
    "SELECT name_key, status AS qstatus, last_reason, attempts FROM invite_queue " +
      "WHERE discord_id = ?1 AND status IN ('queued','written','invited','expired','declined') ORDER BY id DESC",
  )
    .bind(user.id)
    .all<{ name_key: string; qstatus: string; last_reason: string | null; attempts: number | null }>();
  const latest = new Map<string, { qstatus: string; last_reason: string | null; attempts: number | null }>();
  for (const r of qrows.results) if (!latest.has(r.name_key)) latest.set(r.name_key, r); // id DESC: first seen is newest
  // Somebody with four characters stuck behind the same guild does not need the same paragraph four times, and the
  // reply has a 2000-character ceiling that the roster command already found the hard way.
  const explained = new Set<string>();
  const why = (code: string | null): string => {
    const c = code || "other";
    if (explained.has(c)) return "same reason as above";
    explained.add(c);
    return explainRefusal(c);
  };
  for (const c of chars.results) {
    const q = latest.get(normalizeCharacter(c.name));
    let extra = "";
    if (q?.qstatus === "expired") {
      extra =
        ` \u2014 **we stopped retrying** after ${q.attempts ?? 0} refused invites: ${why(q.last_reason)}. ` +
        `Run \`/verify ${c.name}\` once that is sorted and you go straight back in the queue`;
    } else if (q && q.last_reason && q.last_reason !== "guild_full" && q.last_reason !== "other") {
      extra = ` \u2014 ${why(q.last_reason)}`;
    } else if ((full || q?.last_reason === "guild_full") && (c.status === "queued" || c.status === "verified")) {
      const pos = await waitlistPosition(env, normalizeCharacter(c.name));
      extra = pos > 0
        ? ` \u2014 the guild is currently **full**; you are **#${pos}** in line for a seat`
        : " \u2014 the guild is currently **full**, so the invite waits for a seat";
    }
    lines.push(
      `\u2022 ${c.name}: ${c.status === "left_pending" ? "in the guild (pending a roster re-check)" : c.status}${c.member_since ? ` since <t:${c.member_since}:d>` : ""}${extra}`,
    );
  }
  for (const p of pend.results) {
    lines.push(
      p.name
        ? `• ${p.name}: code issued, waiting for the in-game whisper (expires <t:${p.expires_at}:R>)`
        : `• a code for any of your characters: issued, waiting for the in-game whisper (expires <t:${p.expires_at}:R>)`,
    );
  }
  if (chars.results.length === 0 && pend.results.length === 0) lines.push("No characters yet \u2014 press **Get my code** in the pinned guide, or run `/verify`.");
  // Discord rejects an interaction response over 2000 characters and the client reports it as "did not respond in
  // time", which sends you hunting for a timeout that was never there. Once was enough.
  const body = lines.join("\n");
  return reply(body.length > 1900 ? body.slice(0, 1890) + "\u2026" : body);
}

// ---------- who is who (officers): Discord account ↔ BattleTag ↔ characters ----------
interface CharSummary {
  name: string;
  status: string;
  verified_at: number | null;
  member_since: number | null;
  left_at: number | null;
  source: string | null;
}

function describeStatus(c: CharSummary): string {
  switch (c.status) {
    case "member":
      return `in the guild${c.member_since ? ` since <t:${c.member_since}:d>` : ""}`;
    case "verified":
      return `verified${c.verified_at ? ` <t:${c.verified_at}:d>` : ""}, not on the roster yet`;
    case "queued":
      return "invite queued";
    case "left":
      return `left the guild${c.left_at ? ` <t:${c.left_at}:d>` : ""}`;
    case "left_pending":
      return "missing from the last roster export \u2014 the role goes if the next one agrees";
    case "denied":
      return "application denied";
    case "unbound":
      return "unbound";
    default:
      return c.status;
  }
}

/** One account, everything the bot knows: BattleTag, ban flag, every character ever bound, open codes. */
async function describeUser(env: Env, userId: string): Promise<{ text: string; inGuild: string[] }> {
  const m = await getMember(env, userId);
  const chars = await env.DB.prepare(
    "SELECT name, status, verified_at, member_since, left_at, source FROM characters WHERE discord_id = ?1 ORDER BY bound_at",
  )
    .bind(userId)
    .all<CharSummary>();
  const pend = await env.DB.prepare("SELECT name, expires_at FROM pending WHERE discord_id = ?1 AND consumed_at IS NULL AND expires_at > ?2")
    .bind(userId, now())
    .all<{ name: string; expires_at: number }>();
  // .50: this text goes into the ban card and the staff log, persistent Discord messages that no purge of ours
  // reaches (Codex's second review, 1 Oct 00:05 UTC), so the tag itself is never written here: a fresh link is
  // reported as linked with the day it goes, a stale one (not yet purged) as not linked. The officer lookups, which
  // answer ephemerally, still show a fresh tag.
  const fresh = !!m?.battletag && bnetFresh(m.linked_at);
  // .114: while Battle.net sign-in is switched off, "not linked" is not worth a line; a still-fresh earlier link is shown until it expires
  const bnetOn = await bnetLoginOn(env);
  const bnetPart = fresh ? ` — Battle.net: linked (until <t:${(m!.linked_at ?? 0) + BNET_TTL_S}:d>)` : bnetOn ? " — Battle.net: not linked" : "";
  const lines = [
    `<@${userId}>${bnetPart}` +
      (m?.banned ? ` — **banned from verifying**${m.ban_reason ? ` (${m.ban_reason})` : ""}` : ""),
  ];
  for (const c of chars.results) lines.push(`• **${c.name}** — ${describeStatus(c)}`);
  for (const p of pend.results) lines.push(`• ${p.name || "(any character)"} — code issued, not whispered yet (expires <t:${p.expires_at}:R>)`);
  if (chars.results.length === 0 && pend.results.length === 0) lines.push("No characters linked.");
  const inGuild = chars.results.filter((c) => c.status === "member").map((c) => c.name);
  return { text: lines.join("\n"), inGuild };
}

/** Right-click a member → Apps → "Olympus linked characters". Same answer as /olympus-admin lookup user:. */
async function cmdUserMenu(env: Env, i: Interaction): Promise<Response> {
  if (i.data?.name !== USER_MENU_LOOKUP) return reply("Unknown command.");
  if (!hasAnyRole(i, officerRoles(env))) return reply("Officers only.");
  const target = i.data?.target_id;
  if (!target) return reply("No member selected.");
  // Build .41: the same answer as /olympus-lookup in Asmongold's server, guild-site entries included (lookup.ts).
  return reply(accountText(await accountInfo(env, target)));
}

// ---------- /olympus-admin ... (Officer / Moderator / Guild Leader) ----------
async function cmdAdmin(env: Env, i: Interaction): Promise<Response> {
  if (!hasAnyRole(i, officerRoles(env))) return reply("Officers only.");
  const actor = userOf(i).id;
  switch (subcommand(i)) {
    case "unbind": {
      const raw = option<string>(i, "character") ?? "";
      const key = normalizeCharacter(raw);
      const row = await getCharacter(env, key);
      if (!row) return reply(`No binding for **${raw}**.`);
      await env.DB.batch([
        env.DB.prepare("UPDATE characters SET status = 'unbound', left_at = ?2, guid = NULL WHERE name_key = ?1").bind(key, now()),
        env.DB.prepare("UPDATE pending SET consumed_at = ?2, consumed_source = 'unbind' WHERE name_key = ?1 AND consumed_at IS NULL").bind(key, now()),
        env.DB.prepare("UPDATE invite_queue SET status = 'cancelled' WHERE name_key = ?1 AND status IN ('queued','written')").bind(key),
      ]);
      await audit(env, actor, "admin.unbind", row.name, { was: row.discord_id });
      return reply(`**${row.name}** unbound from <@${row.discord_id}>. They can run \`/verify\` again. The Guild Member role is left as it is; remove it in Discord by hand if they should lose it.`); // .114: roster exports manage bound characters only, so nothing takes the role away later
    }
    case "ban": {
      const target = option<string>(i, "user") ?? "";
      const reason = option<string>(i, "reason") ?? "";
      await env.DB.prepare(
        "INSERT INTO members (discord_id, banned, ban_reason) VALUES (?1, 1, ?2) ON CONFLICT(discord_id) DO UPDATE SET banned = 1, ban_reason = ?2",
      )
        .bind(target, reason)
        .run();
      // .48: a ban binds this Discord account and the characters bound to it; the BattleTag is purged 29 days after
      // its last login like everyone's and nothing derived from it is kept (bnet-retention.ts).
      await env.DB.prepare("UPDATE invite_queue SET status = 'cancelled' WHERE discord_id = ?1 AND status IN ('queued','written')").bind(target).run();
      // Their open codes die with the ban, so one whispered afterwards links nothing (postVerify checks the ban too).
      await env.DB.prepare("UPDATE pending SET consumed_at = ?2, consumed_source = 'banned' WHERE discord_id = ?1 AND consumed_at IS NULL").bind(target, now()).run();
      await audit(env, actor, "admin.ban", target, { reason });

      // Take the Discord access away now — a ban that leaves the guild channels open is not a ban.
      // With ROLE_GUILD_MEMBER unset there is no member role to take away, and saying "could not remove" on every
      // ban would be noise about a role that no longer exists.
      let roleNote = "";
      if (env.ROLE_GUILD_MEMBER) {
        try {
          await removeRole(env, target, env.ROLE_GUILD_MEMBER, `olympus-verify: banned by ${actor}`);
          roleNote = "\nGuild Member removed.";
        } catch (e) {
          roleNote = `\n\u26a0\ufe0f Could not remove Guild Member: ${explainDiscordError(e)}`;
          await audit(env, "system", "role.remove_failed", target, { error: String(e) });
        }
      }

      const who = await describeUser(env, target);
      const inGame = who.inGuild.length
        ? `\n**Still in the guild in game:** ${who.inGuild.join(", ")} \u2014 remove them there (/gkick); the next roster export then reconciles.`
        : "";

      // The Discord ban itself is irreversible and wider than this command's audience, so it is a separate,
      // deliberate click by a narrower set of people, recorded where staff will see it.
      const channel = staffChannel(env);
      let cardNote = "";
      if (channel) {
        try {
          // .55: the Discord-ban button needs the bot to hold Ban Members, a separate approval (tracker D03); until
          // BAN_BUTTON_ENABLED is on, the card lists the account and says what a Guild Leader can do by hand.
          const button = env.BAN_BUTTON_ENABLED === "true";
          await postMessage(env, channel, {
            content: `\u{1F528} **Verification ban** \u2014 <@${target}> banned from verifying by <@${actor}>${reason ? ` \u2014 ${reason}` : ""}.${roleNote}\n${who.text}${inGame}${button ? "" : `\nA Discord ban, if wanted, is a <@&${env.ROLE_GUILD_LEADER}> decision made in the server settings; the bot does not hold Ban Members here.`}`,
            components: button
              ? [
                  {
                    type: 1,
                    components: [
                      { type: 2, style: 4, label: "Ban from Discord", custom_id: `ban:discord:${target}` },
                      { type: 2, style: 2, label: "Leave it", custom_id: "ban:dismiss" },
                    ],
                  },
                ]
              : [],
            allowed_mentions: { parse: [] },
          });
          cardNote = button
            ? `\nA card with the **Ban from Discord** button is in <#${channel}> \u2014 only <@&${env.ROLE_GUILD_LEADER}> can press it.`
            : `\nA card is in <#${channel}>; a Discord ban, if wanted, is a <@&${env.ROLE_GUILD_LEADER}> decision made by hand (the bot does not hold Ban Members).`;
        } catch (e) {
          cardNote = `\n\u26a0\ufe0f Could not post the ban card: ${String(e).slice(0, 140)}`;
        }
      }
      await logLine(env, `\u{1F528} ban: <@${target}> banned from verifying by <@${actor}>${reason ? ` \u2014 ${reason}` : ""}.${roleNote}\n${who.text}${inGame}`);
      return reply(
        `<@${target}> marked banned for verification: this Discord account cannot verify or link again, and the characters bound to it stay bound.${roleNote}\n${who.text}${inGame}${cardNote}`,
      );
    }
    case "unban": {
      const target = option<string>(i, "user") ?? "";
      await env.DB.prepare("UPDATE members SET banned = 0, ban_reason = NULL WHERE discord_id = ?1").bind(target).run();
      await audit(env, actor, "admin.unban", target);
      return reply(`<@${target}> can verify again.`);
    }
    case "queue": {
      const q = await env.DB.prepare(
        "SELECT name, discord_id, status, created_at, claimed_by, priority FROM invite_queue WHERE status IN ('queued','written','invited') ORDER BY priority DESC, id",
      ).all<{ name: string; discord_id: string; status: string; created_at: number; claimed_by: string | null; priority: number | null }>();
      if (q.results.length === 0) return reply("Invite queue is empty.");
      // claimed_by matters once a second officer runs the addon: it says whose client is going to send each invite.
      // Build .41: reserved names from the guild site go first and are marked; the reply is capped like /roster's,
      // because a long queue would pass Discord's 2000-character limit and read as a timeout.
      const lines = q.results.map(
        (r) =>
          `\u2022 ${r.priority ? "\u2b50 " : ""}${r.name} (<@${r.discord_id}>) \u2014 ${r.status}, <t:${r.created_at}:R>${r.claimed_by ? ` \u2014 with **${r.claimed_by}**` : ""}`,
      );
      let body = "";
      let shown = 0;
      for (const l of lines) {
        if (body.length + l.length + 1 > 1850) break;
        body += (body ? "\n" : "") + l;
        shown++;
      }
      if (shown < lines.length) body += `\n\u2026 and ${lines.length - shown} more (${lines.length} in all).`;
      if (q.results.some((r) => r.priority)) body += "\n\u2b50 = reserved name from the guild site (top of the queue).";
      return reply(body);
    }
    case "roster": {
      const s = await env.DB.prepare("SELECT id, exported_at, received_at, source, member_count FROM roster_snapshots ORDER BY id DESC LIMIT 1")
        .first<{ id: number; exported_at: number; received_at: number; source: string; member_count: number }>();
      if (!s) return reply("No roster export received yet.");
      // Same definition the addon's removal panel uses (unverified.ts), so the numbers here and in game always agree.
      const rep = await unverifiedReport(env);

      // The rank names are listed because OFFICER_RANK_NAMES must match them exactly, and a guild can rename any
      // rank — this makes that setting checkable from Discord rather than guessed.
      const ranks = await env.DB.prepare(
        "SELECT rank, rank_index, COUNT(*) AS n FROM roster_members WHERE snapshot_id = ?1 AND rank IS NOT NULL AND rank <> '' GROUP BY rank, rank_index ORDER BY rank_index",
      )
        .bind(s.id)
        .all<{ rank: string; rank_index: number | null; n: number }>();
      const configured = officerRankNames(env);
      const rankLine = ranks.results.length
        ? `Ranks in game: ${ranks.results.map((r) => `${r.rank}${r.rank_index === null ? "" : ` [${r.rank_index}]`} \u00d7${r.n}`).join(", ")}\n`
        : "";
      const matches = ranks.results.some((r) => configured.includes(r.rank.trim().toLowerCase()));
      const rankNote = configured.length
        ? `\nOFFICER_RANK_NAMES = ${configured.join(", ")}${matches ? " \u2014 matches the roster." : " \u2014 **matches no rank on the roster**, so the officer-rank report never fires."}`
        : "\nOFFICER_RANK_NAMES is unset, so the officer-rank report is off.";
      // Discord rejects an interaction response whose content exceeds 2000 characters, and the client then shows
      // "The application didn't respond in time" — which looks like a timeout and is not one. In a 1,000-member guild
      // the unlinked list is routinely hundreds of names, i.e. many thousands of characters, so it is capped here and
      // the count carries the real information.
      const t = now();
      const officerRanks = new Set(configured);
      const byRank = rep.ranks
        .filter((r) => r.unverified > 0)
        .map((r) => `${r.rank ?? "?"} ${r.unverified}/${r.total}${r.rank && officerRanks.has(r.rank.trim().toLowerCase()) ? " (protected)" : ""}`)
        .join(" \u00b7 ");
      const removable = rep.members.filter((m) => m.eligibleAt !== null && m.eligibleAt <= t && !m.pending);
      const waiting = rep.members.map((m) => m.eligibleAt).filter((e): e is number => e !== null && e > t);
      const pendingN = rep.members.filter((m) => m.pending).length;
      const SHOWN = 20;
      const names = rep.members.map((m) => m.name);
      const unlinkedLine = rep.members.length
        ? `Not verified (${rep.members.length}): ${byRank}.\n` +
          (rep.firstSeenAvailable
            ? `Removable in game now: ${removable.length}` +
              (waiting.length ? ` \u2014 ${waiting.length} more from <t:${Math.min(...waiting)}:f> (grace ${rep.graceDays}d, counted from first seen or <t:${rep.verifyOpenSince}:d>, whichever is later)` : "") +
              (pendingN ? ` \u2014 ${pendingN} hold a live /verify code and are never offered` : "") +
              ".\n" +
              (rep.openTickets
                ? `${rep.openTickets} request code${rep.openTickets === 1 ? " is" : "s are"} issued and not whispered yet; a request code names no character until it is, so its holder may be in this list.\n`
                : "")
            : "\u26a0\ufe0f First-seen dates are missing, so nobody is offered for removal. Apply migrations/2026-09-25-first-seen.sql.\n") +
          `${names.slice(0, SHOWN).join(", ")}` +
          (names.length > SHOWN ? `, \u2026 and ${names.length - SHOWN} more` : "")
        : "Not verified: none \u2014 every character on the roster is linked.";
      const body =
        `Last roster: ${s.member_count} members, exported <t:${s.exported_at}:R> (${s.source}), received <t:${s.received_at}:R>.\n` +
        rankLine +
        unlinkedLine +
        rankNote;
      // Belt and braces: the rank line grows with the number of distinct ranks, so clamp the whole thing too.
      return reply(body.length > 1900 ? body.slice(0, 1890) + "\u2026" : body);
    }
    case "lookup": {
      // either a member (→ BattleTag + every character they linked) or a character name (→ its owner, then the same)
      const userId = option<string>(i, "user");
      if (userId) return reply(accountText(await accountInfo(env, userId)));
      const raw = option<string>(i, "character") ?? "";
      if (!raw) return reply("Pick a member or give a character name.");
      const row = await getCharacter(env, normalizeCharacter(raw));
      if (!row) {
        // Not linked; maybe someone entered it as a reserved name on the guild site (build .41).
        const owner = await ownerOfCharacter(env, raw);
        if (!owner) return reply(`No record for **${raw}**.`);
        const text = `${owner.how}\n${accountText(await accountInfo(env, owner.id))}`;
        return reply(text.length > 1990 ? text.slice(0, 1985) + "\u2026" : text);
      }
      const text =
        `**${row.name}** — bound <t:${row.bound_at}:f>${row.verified_at ? `, verified <t:${row.verified_at}:f> via ${row.source}` : ""}, status ${row.status}. Owner:\n` +
        accountText(await accountInfo(env, row.discord_id));
      return reply(text.length > 1990 ? text.slice(0, 1985) + "\u2026" : text);
    }
    case "sync": {
      const out = await syncFromLatest(env);
      if (!out) return reply("No roster export has been received yet, so there is nothing to sync from.");
      await audit(env, actor, "admin.sync", String(out.snapshot), { promoted: out.promoted.length, stripped: out.stripped.length, released: out.released.length, renamed: out.renamed.length });
      const body =
        `Re-applied roster snapshot #${out.snapshot}.\n` +
        `Granted (${out.promoted.length}): ${out.promoted.join(", ") || "\u2014"}\n` +
        `Removed (${out.stripped.length}): ${out.stripped.join(", ") || "\u2014"}` +
        (out.renamed.length ? `\nRenamed, link kept (${out.renamed.length}): ${out.renamed.join(", ")}` : "") +
        (out.released.length ? `\nLinks released \u2014 not the character that was linked (${out.released.length}): ${out.released.join(", ")}` : "") +
        (out.held ? `\nLeft for an officer (${out.held}): characters that appear to have swapped names \u2014 see the server log.` : "");
      return reply(body.length > 1900 ? body.slice(0, 1890) + "\u2026" : body);
    }
    case "refresh-guide": {
      // Editing beats reposting: the pin, the position and the message link all survive, and no stale copy is left.
      const channel = option<string>(i, "channel") ?? i.channel_id ?? "";
      if (!channel) return reply("Pick a channel.");
      try {
        const out = await refreshPinnedGuide(env, channel);
        if ("error" in out) return reply(`Nothing edited in <#${channel}> \u2014 ${out.error}. Use \`post-guide\` to place a fresh one, then pin it.`);
        await audit(env, actor, "admin.refresh_guide", channel, { message: out.edited });
        return reply(`Pinned guide in <#${channel}> updated in place \u2014 same message, still pinned.`);
      } catch (e) {
        return reply(`Could not edit the guide in <#${channel}>: ${explainDiscordError(e)}`);
      }
    }
    case "post-guide": {
      // the pinned how-to with buttons — into the channel given, else the one the command was typed in
      const channel = option<string>(i, "channel") ?? i.channel_id ?? "";
      if (!channel) return reply("Pick a channel.");
      try {
        const msg = await postMessage(env, channel, guideMessage(env));
        await audit(env, actor, "admin.post_guide", channel, { message: msg.id });
        return reply(`Guide posted in <#${channel}>. Pin it from the message menu; after a later redeploy use \`refresh-guide\` to update it in place rather than posting a second copy.`);
      } catch (e) {
        const why = explainDiscordError(e);
        const hint = e instanceof DiscordError && e.status === 403
          ? "\nThe bot's role needs View Channel, Send Messages and Embed Links there (channel \u2192 Permissions \u2192 add the Olympus Verify role)."
          : "";
        return reply(`Could not post in <#${channel}>: ${why}${hint}`);
      }
    }
  }
  return reply("Unknown admin subcommand.");
}

// ---------- buttons: the pinned guide (anyone) and the review card (officers) ----------
async function handleComponent(env: Env, i: Interaction): Promise<Response> {
  const id = i.data?.custom_id ?? "";
  // One click, no typing: a request code whose character is decided by who whispers it (27 Sep). The modal that asked
  // for the name is still answered below, for anyone who had it open across the deploy.
  if (id === GUIDE_VERIFY) return issueTicket(env, i);
  if (id === GUIDE_STATUS) return cmdStatus(env, i);
  const [ns, action, arg] = id.split(":");

  if (ns === "ban") {
    if (action === "dismiss") {
      if (!hasAnyRole(i, officerRoles(env))) return reply("Officers only.");
      return updateMessage({ content: `${i.message ? "" : ""}Left as it is by <@${userOf(i).id}> \u2014 no Discord ban.`, components: [] });
    }
    if (action !== "discord" || !arg) return reply("Unknown component.");
    // Deliberately narrower than the officer gate: a Discord ban is irreversible from here and hides the account's
    // history, so it is a Guild Leader decision rather than anything an officer can do on their own.
    if (!hasAnyRole(i, banApproverRoles(env))) {
      return reply(`Only <@&${env.ROLE_GUILD_LEADER}> can ban from Discord. An officer can mark someone banned from verifying with \`/olympus-admin ban\`.`);
    }
    if (env.BAN_BUTTON_ENABLED !== "true") return reply("The Discord-ban button is switched off in this server (the bot does not hold Ban Members). Ban from the server settings if you decide to."); // .55
    const who = await describeUser(env, arg);
    try {
      await banMember(env, arg, `olympus-verify: banned by ${userOf(i).id}`);
    } catch (e) {
      const msg = String(e);
      const hint = msg.includes("50013") || msg.includes("Missing Permissions")
        ? " The bot's role needs **Ban Members**, and it must sit above the target's highest role (Server Settings \u2192 Roles \u2192 Olympus Verify)."
        : "";
      await audit(env, userOf(i).id, "admin.discord_ban_failed", arg, { error: msg.slice(0, 200) });
      return reply(`Could not ban <@${arg}>: ${msg.slice(0, 250)}${hint}`);
    }
    await audit(env, userOf(i).id, "admin.discord_ban", arg);
    await logLine(env, `\u{1F6AB} Discord ban: <@${arg}> banned by <@${userOf(i).id}>.${who.inGuild.length ? ` Still in the guild in game: ${who.inGuild.join(", ")} \u2014 /gkick them.` : ""}`);
    return updateMessage({
      content: `\u{1F6AB} <@${arg}> has been **banned from this Discord** by <@${userOf(i).id}>.${who.inGuild.length ? `\nStill in the guild in game: ${who.inGuild.join(", ")} \u2014 remove them with /gkick.` : ""}`,
      components: [],
    });
  }

  if (ns !== "review") return reply("Unknown component.");
  if (!hasAnyRole(i, officerRoles(env))) return reply("Officers only.");
  const actor = userOf(i).id;
  const result = action === "approve" ? await approvePending(env, Number(arg), actor) : await denyPending(env, Number(arg), actor);
  if (!result.ok) return reply(result.message);
  return updateMessage({ content: result.message, components: [] });
}

/**
 * Autocomplete for /verify <character>: offer names from the newest roster export. Typing a character name exactly
 * as it appears in game is the step people get wrong most often, and the roster is the only authoritative spelling
 * we hold. Names already bound to someone else are left out — they cannot be verified anyway.
 */
async function handleAutocomplete(env: Env, i: Interaction): Promise<Response> {
  const f = focusedOption(i);
  if (!f || f.name !== "character") return autocomplete([]);
  const q = normalizeCharacter(f.value);
  const rows = await env.DB.prepare(
    `SELECT rm.name AS name, c.discord_id AS owner
       FROM roster_members rm
       LEFT JOIN characters c ON c.name_key = rm.name_key AND c.status IN ('member','verified','queued')
      WHERE rm.snapshot_id = (SELECT id FROM roster_snapshots ORDER BY id DESC LIMIT 1)
        AND (?1 = '' OR rm.name_key LIKE ?2 ESCAPE '\\')
      ORDER BY rm.name
      LIMIT 50`,
  )
    .bind(q, likeArg(q))
    .all<{ name: string; owner: string | null }>();
  const me = userOf(i).id;
  const choices = rows.results
    .filter((r) => !r.owner || r.owner === me)
    .map((r) => ({ name: r.name, value: r.name }));
  return autocomplete(choices);
}

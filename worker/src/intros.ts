/**
 * Bot-branded channel intros for the Olympus category in Asmongold's server (build .39, 29 Sep 2026).
 *
 * One pinned embed message per channel, and one pinned "Read first" post per forum, posted and kept current by the
 * bot. Any Olympus officer can put them back or update them with `/olympus-intros refresh`, so they no longer depend
 * on whoever happened to post them. The text lives here, in code: change it, deploy, run refresh. Every intro whose
 * text changed is edited IN PLACE (same message, same pin, same link), a deleted one is posted again, an unpinned
 * one is pinned again, and one that is already current is left alone.
 *
 * Verification still serves GUILD_ID (the beta server) until the move in docs/asmongold-move.md. The only thing the
 * bot does in INTROS_GUILD_ID is this command: index.ts routes it ahead of the "only serves Olympus" guard in
 * interactions.ts, and handleIntros checks the guild itself.
 *
 * Channels are named by key in the text ({#olympus-info}) and resolved through INTROS_CHANNELS, so the copy never
 * hard-codes an id, and a channel missing from the config degrades to plain "#name" text instead of a broken mention.
 */
import { errorRef } from "./log";
import type { Env } from "./env";
import { audit, now } from "./db";
import { DiscordError, EPHEMERAL, explainDiscordError, json, option, reply, rest, subcommand, userOf, type Interaction } from "./discord";

export const INTROS_COMMAND = "olympus-intros";

/** Discord calls one refresh may spend. The free Workers plan allows 50 subrequests per invocation; the follow-up
 *  edit of the deferred reply and a 429 retry need room too. A run that would pass it stops and says to run again. */
export const BUDGET = 40;
const PINNED = 1 << 1; // channel flag: a forum post pinned to the top of its forum
const LOCK_SECONDS = 120; // longer than a refresh can run (waitUntil ends after 30 s), so a crashed run frees itself

const GOLD = 0xc9a227; // the verification guide's colour (guide.ts)
const RAID = 0xe67e22; // the Olympus Raid Leader role's colour

export interface EmbedField { name: string; value: string; inline?: boolean }
export interface Embed { title?: string; description?: string; color?: number; fields?: EmbedField[]; footer?: { text: string } }
export interface Intro {
  key: string; // stable id in D1: renaming an intro that has been posted makes the next refresh post a second copy
  channel: string; // INTROS_CHANNELS key of the channel or forum it lives in
  forum?: { title: string; tag: string }; // forums only: the post's title and the tag it carries (matched by name)
  // A plain line above the embeds. Forums show it as the post's preview; without it they show "Click to see attachment".
  content?: string;
  embeds: Embed[]; // {#key} anywhere in the text becomes a channel mention
}

/** Checked 28 Sep 2026: all live and the pages their labels say. Blizzard is the source of every fact; the others
 *  are linked as unofficial guides only (asmongold-channel-copy.md). */
const LINKS = {
  foreverSite: "https://worldofwarcraft.blizzard.com/en-us/forever",
  foreverForum: "https://us.forums.blizzard.com/en/wow/c/wow-forever/346",
  datesEditions: "https://news.blizzard.com/en-us/article/24301508/pre-purchase-world-of-warcraft-forever-upgrades-and-begin-your-next-journey-in-azeroth",
  whatsNext: "https://news.blizzard.com/en-us/article/24303862/world-of-warcraft-forever-whats-next-panel-recap",
  deepDive: "https://news.blizzard.com/en-us/article/24303313/world-of-warcraft-forever-deep-dive-panel-recap",
  wowheadHub: "https://www.wowhead.com/forever",
  icyHub: "https://www.icy-veins.com/wow-forever/",
  tavernProfessions: "https://www.warcrafttavern.com/forever/guides/professions/",
  wowheadDungeons: "https://www.wowhead.com/forever/guide/dungeons-overview-locations-details",
  icyDungeons: "https://www.icy-veins.com/wow-forever/dungeon-and-raid-guides",
  wowheadZones: "https://www.wowhead.com/forever/guide/zones-maps-locations-rewards",
  wowheadTalents: "https://www.wowhead.com/forever/talent-calc",
  icyTalents: "https://www.icy-veins.com/wow-forever/talent-calculator",
  icyClasses: "https://www.icy-veins.com/wow-forever/class-guides",
  icyChoosing: "https://www.icy-veins.com/wow-forever/choosing-your-main",
  wowheadCombos: "https://www.wowhead.com/forever/guide/new-race-class-combinations",
  icyCamping: "https://www.icy-veins.com/wow-forever/camping",
  icyLegacy: "https://www.icy-veins.com/wow-forever/legacy-system",
  wowheadRaids: "https://www.wowhead.com/forever/guide/raids-overview-hub-dates-locations",
} as const;

/** Hosts an intro may link to: Blizzard, and editorial guide sites. No boosting, gold or account sellers. */
export const LINK_HOSTS = [
  "worldofwarcraft.blizzard.com", "us.forums.blizzard.com", "news.blizzard.com",
  "www.wowhead.com", "www.icy-veins.com", "www.warcrafttavern.com",
];

export const INTROS: Intro[] = [
  {
    key: "olympus-info",
    channel: "olympus-info",
    embeds: [
      {
        title: "Olympus — Asmongold's guild in World of Warcraft: Forever",
        color: GOLD,
        description: [
          "We play on the **PvP ruleset** as **Alliance**.",
          "",
          "**Get into the guild channels**",
          "1. Read the server rules in {#server-rules}; they apply here too.",
          // .52 (Codex's content candidate, 1 Oct 00:37 UTC): the supported flow queues an invite; nobody has to be in the guild first.
          "2. Follow the pinned guide in {#join-olympus}: get a code and send the shown line from your character in game. You can request a guild invite this way before joining. The member channels open after the bot confirms your character on the officer-exported guild roster and the access checks pass.",
          "3. In Olympus 2 or a later Olympus guild? Chat in {#olympus-visitors}; only the main guild is verified here.",
          "",
          "**Good to know**",
          "• Access updates appear in {#olympus-notices}; the bot never DMs you.",
          "• Olympus staff never ask for your password, authenticator codes or payment details.",
          "• Raid times and loot rules are set per event by raid leaders.",
        ].join("\n"),
      },
      {
        title: "World of Warcraft: Forever at a glance",
        color: GOLD,
        fields: [
          { name: "Launch", value: "<t:1793833200:F> (November 4, 2026, 3:00 p.m. PST, global). Included with a WoW subscription or Game Time." },
          { name: "Beta", value: "September 17 – October 21, 2026. Access is available to selected invited testers and eligible Skyborne Epic Pack or Warcraft Forever Collection accounts. Check Blizzard's current beta instructions; a guild application does not grant beta access." },
          { name: "Early name reservation", value: "October 27 – November 3, 2026 with an eligible upgrade purchase; up to three characters, first come, first served. A name on our guild planning list does not reserve it in the game." },
          { name: "First new raids", value: "Unlock December 9, 2026." },
          { name: "Rulesets instead of realms", value: "Normal, PvP, Roleplaying and Hardcore (after launch). No grouping across rulesets; Horde and Alliance stay separate." },
          { name: "New in Forever", value: "The Skyborne race (Zephras Isle), Mount Hyjal, Shen'dralas and Riverglades, nine new dungeons, the Hyjal Summit (20-player) and Barrow Deeps (10-player) raids, the Darkspear Islands 15 vs 15 battleground, Legacy progression for alts, camping and opt-in transmog." },
        ],
        footer: { text: "Official Blizzard announcements checked October 1, 2026. Planned details may change." },
      },
      {
        title: "Guides and resources",
        color: GOLD,
        description: [
          "**Official (Blizzard)**",
          `• [Forever website](${LINKS.foreverSite})`,
          `• [Forever forum](${LINKS.foreverForum})`,
          `• [Dates and editions](${LINKS.datesEditions})`,
          `• [What's Next panel recap](${LINKS.whatsNext})`,
          `• [Deep Dive panel recap](${LINKS.deepDive})`,
          "",
          "**Community guides** (unofficial; written from the beta, so details can change before launch)",
          `• [Wowhead Forever hub](${LINKS.wowheadHub}): overview, zones, dungeons, raids, talent calculator`,
          `• [Icy Veins Forever hub](${LINKS.icyHub}): class and spec guides, choosing a class, races, rulesets, camping, Legacy`,
          `• [Warcraft Tavern professions guide](${LINKS.tavernProfessions})`,
          "",
          // .52: no claim about what Blizzard has not published; point at what is checked and at the vendor's rules.
          "**Add-ons:** use the guild's reviewed release for officer verification and check compatibility before installing other add-ons. Never install an executable or add-on from an unknown source. Follow Blizzard's add-on rules and the release instructions in {#classes-and-builds}.",
        ].join("\n"),
        footer: { text: "Editorial guide sites only: no boosting, gold or account sellers." },
      },
    ],
  },
  {
    key: "olympus-notices",
    channel: "olympus-notices",
    embeds: [{
      title: "Verification notices",
      color: GOLD,
      description: "The Olympus verification bot posts here when your guild access changes and mentions you when a notice is about you. It never DMs. Nothing to post here.",
    }],
  },
  {
    key: "olympus-visitors",
    channel: "olympus-visitors",
    embeds: [{
      title: "Olympus visitors",
      color: GOLD,
      description: "For Olympus 2 and later, and for anyone curious about Olympus. Only the main Olympus guild is verified in {#join-olympus}.\nThe server rules apply: no recruitment spam, gold or account sales, or boosting ads.",
    }],
  },
  {
    key: "guild-announcements",
    channel: "guild-announcements",
    embeds: [{
      title: "Guild announcements",
      color: GOLD,
      description: "News from Olympus leadership.\n**Ruleset: PvP · Faction: Alliance** (decided 16 September 2026).\nRaid notices are in {#raid-announcements}. React to acknowledge; questions go to {#guild-chat}.",
    }],
  },
  {
    key: "guild-chat",
    channel: "guild-chat",
    embeds: [{
      title: "Welcome home",
      color: GOLD,
      description: "Everyday chat, wins and plans. Keep requests findable: groups in {#looking-for-group}, crafting and trades in {#professions-and-trade}, raids in {#raid-announcements}. Voice: {#the-tavern}.",
    }],
  },
  {
    key: "looking-for-group",
    channel: "looking-for-group",
    forum: { title: "Read first: how to post a group", tag: "Other" },
    content: "How to post a group, and where the dungeon guides are.",
    embeds: [{
      title: "How to post a group",
      color: GOLD,
      description: [
        "One post per group, so the list stays readable.",
        "• **Title:** activity and level range, e.g. \"Hall of Thanes · 13–18\".",
        "• **In the post:** roles still needed (Tank / Healer / DPS), start time with timezone or a Discord timestamp, and whether you use voice ({#dungeon-party-1} and {#dungeon-party-2}).",
        "• **Tags:** pick one; add ✅ Full when you're done. Posts hide after 24 hours without activity.",
        "",
        "**Dungeon guides** (unofficial, written from the beta)",
        `• [Wowhead dungeons overview](${LINKS.wowheadDungeons})`,
        `• [Icy Veins dungeon guides](${LINKS.icyDungeons})`,
        `• [Wowhead zones](${LINKS.wowheadZones})`,
      ].join("\n"),
    }],
  },
  {
    key: "classes-and-builds",
    channel: "classes-and-builds",
    forum: { title: "Read first: how to post here", tag: "Guide" },
    content: "How to post here, and where the class guides and talent calculators are.",
    embeds: [{
      title: "How to post here",
      color: GOLD,
      description: [
        "One post per topic: class advice, talent builds, gear, macros and logs.",
        "• Start the title with class and spec (\"Warrior - Fury\") and pick the class tag; add ❓ Question if you're asking.",
        `• Share builds as a talent-calculator link: [Wowhead](${LINKS.wowheadTalents}) or [Icy Veins](${LINKS.icyTalents}).`,
        "• 📗 Guide marks posts staff have checked.",
        "",
        "**Class guides** (unofficial, written from the beta)",
        `• [Icy Veins class and spec guides](${LINKS.icyClasses})`,
        `• [Choosing your class](${LINKS.icyChoosing})`,
        `• [New race and class combinations](${LINKS.wowheadCombos})`,
        "",
        // .113: the same supported add-on guidance as #olympus-info (no claim about what Blizzard has not published).
        "**Add-ons:** use the guild's reviewed release for officer verification and check compatibility before installing other add-ons. Never install an executable or add-on from an unknown source, and follow Blizzard's add-on rules and the release instructions. No download links from unknown sites; staff will add a checked list here.",
      ].join("\n"),
    }],
  },
  {
    key: "professions-and-trade",
    channel: "professions-and-trade",
    embeds: [{
      title: "Professions and trade",
      color: GOLD,
      description: [
        "Crafts, materials, camping blueprints and in-game trades. Say the profession, item, materials supplied and any fee. No real-money trading, gold selling or account sales.",
        "",
        "**Guides** (unofficial)",
        `• [Professions (Warcraft Tavern)](${LINKS.tavernProfessions})`,
        `• [Camping (Icy Veins)](${LINKS.icyCamping})`,
        `• [Legacy system and profession talents (Icy Veins)](${LINKS.icyLegacy})`,
      ].join("\n"),
    }],
  },
  {
    key: "raid-announcements",
    channel: "raid-announcements",
    embeds: [{
      title: "Raid announcements",
      color: RAID,
      description: "Confirmed raids only, posted by Olympus raid leaders. Every notice states the raid, the date and start time as a Discord timestamp, expected duration, requirements, how the roster is confirmed and the loot rules that apply ({#loot-and-raid-rules}).\nThe first Forever raids unlock on December 9, 2026. Sign up in {#raid-signups}.",
    }],
  },
  {
    key: "raid-signups",
    channel: "raid-signups",
    embeds: [{
      title: "Raid sign-ups",
      color: RAID,
      description: [
        "Sign up in the thread linked from the raid notice:",
        "**Character:**",
        "**Class / spec:**",
        "**Role:** Tank / Healer / DPS",
        "**Availability:** full run, late or early leave (with time and timezone)",
        "",
        "A sign-up is a request, not a confirmed roster slot. The raid leader confirms the roster and bench. Update your sign-up as soon as your plans change.",
      ].join("\n"),
    }],
  },
  {
    key: "raid-discussion",
    channel: "raid-discussion",
    embeds: [{
      title: "Raid discussion",
      color: RAID,
      description: `Preparation, strategies, assignments and follow-up: one thread per raid.\n• [Wowhead raids overview](${LINKS.wowheadRaids})\nEncounter guides will be pinned here once they exist.`,
    }],
  },
  {
    key: "loot-and-raid-rules",
    channel: "loot-and-raid-rules",
    embeds: [{
      title: "Before you join a raid",
      color: RAID,
      description: "Olympus has no standing guild-wide loot system yet. Each raid leader publishes or links the rules for that raid before sign-ups close: loot eligibility, reserves or priorities, tie-breaks, bench treatment and how disputes are handled.\nRead them and ask before you join. Loot disputes go privately to the raid leader or an officer, not into public channels.",
    }],
  },
  {
    key: "council-info",
    channel: "council-info",
    embeds: [{
      title: "Olympus I–X Council",
      color: GOLD,
      description: [
        "Shared coordination for Guild Masters and officers across Olympus I–X. These Council channels retain private access. The separate Olympus Council GM and Olympus Council Officer roles remain unassigned.",
        "",
        "**Provisional until the Council charter is ratified.** The governance documents are drafts; no ratification or appointments under those drafts have been recorded. Existing Olympus I leadership and permissions remain separate.",
        "",
        "Council roles are given by hand after review. They provide access to these Council channels and grant no website, bot or in-game authority.",
        "",
        "Use {#council-chat} for discussion and {#council-decisions} for short notes of what was agreed. Voice: Olympus I–X Council.",
        "",
        "**Private is not confidential:** server administrators and bots with Administrator can access these channels. Keep member case files, appeals, personal data and credentials out of Council channels. Use the existing private staff tools or contact an officer.",
        "",
        "When restricting an account, remove its Council roles and review its other roles: a Council role allow or Administrator access can override restrictions.",
      ].join("\n"),
    }],
  },
  {
    key: "council-chat",
    channel: "council-chat",
    embeds: [{
      title: "Council discussion",
      color: GOLD,
      description: [
        "Discussion and coordination between the Guild Masters and officers of Olympus I–X. Keep the topic clear; record short agreed notes in {#council-decisions}.",
        "",
        "Council arrangements remain provisional until the charter is ratified. Discussion here does not appoint anyone or grant website, bot or in-game authority.",
        "",
        "No personal reports, appeals, member case details or credentials. Use the existing private staff tools or contact an officer. Server administrators and bots with Administrator can read this channel.",
      ].join("\n"),
    }],
  },
  {
    key: "council-decisions",
    channel: "council-decisions",
    embeds: [{
      title: "Council agreed notes",
      color: GOLD,
      description: [
        "Short factual notes of what the Council agreed: the topic, affected guilds, practical next step and anything still unresolved. Refer to {#council-chat} for the discussion where useful.",
        "",
        "The Council charter and governance documents remain drafts. How binding decisions are made is set by the charter once ratified. A note here does not ratify a draft, appoint anyone or grant website, bot or in-game authority.",
        "",
        "Keep personal data, member case files, appeals and credentials out of these notes. Use the existing private staff tools or contact an officer.",
      ].join("\n"),
    }],
  },
  {
    key: "addon-development",
    channel: "addon-development",
    embeds: [{
      title: "Olympus addon development",
      color: GOLD,
      description: [
        "For Olympus leadership and the developers of the community census addon **Olympus** (CurseForge project **olympus-guild**). Share design notes, reproducible bugs and proposed improvements.",
        "",
        "The addon and its signed lists are maintained by its author outside the guild bot and website code. Discussion here is collaboration, not approval of a release or a grant of access.",
        "",
        "Do not post credentials, passwords, authenticator codes, tokens or member case records. Use sample data for bug reports and remove personal details from screenshots and logs. Private channel access does not make this a confidential case inbox.",
      ].join("\n"),
    }],
  },
  {
    key: "guild-suggestions",
    channel: "guild-suggestions",
    embeds: [{
      title: "Suggestions for Olympus",
      color: GOLD,
      description: [
        "**Proposal, reason, affected guilds, practical next step.** Explain what you would change, why it helps, which Olympus guilds are affected and how to begin.",
        "",
        "A suggestion is a request, not a promise. Keep discussion constructive and focused on the idea.",
        "",
        "Personal reports, appeals and anything about an individual belong with an officer or in the existing private staff tools, not in this channel. Do not post credentials, passwords, authenticator codes or tokens.",
      ].join("\n"),
    }],
  },
];

// ---------- rendering ----------

/** INTROS_CHANNELS, "key=id,key=id", as a map. Entries whose id is not a snowflake are dropped (status shows them). */
export function parseChannels(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && /^[0-9]{17,20}$/.test(v)) out[k] = v;
  }
  return out;
}

/** {#key} -> <#id>, or plain "#key" when that channel is not configured: never a broken mention. */
export function resolveText(text: string, channels: Record<string, string>): string {
  return text.replace(/\{#([a-z0-9-]+)\}/g, (_m, k: string) => (channels[k] ? `<#${channels[k]}>` : `#${k}`));
}

export function renderEmbeds(intro: Intro, channels: Record<string, string>): Embed[] {
  return JSON.parse(JSON.stringify(intro.embeds), (_k, v) => (typeof v === "string" ? resolveText(v, channels) : v)) as Embed[];
}

/** What the bot last posted is compared by this, so a refresh edits only what changed. A forum post's title counts. */
export async function introHash(intro: Intro, embeds: Embed[]): Promise<string> {
  // Without a content line the hash is exactly what build .39 stored, so adding the field changed no posted intro.
  const base: Record<string, unknown> = { embeds, title: intro.forum?.title ?? null };
  if (intro.content) base.content = intro.content;
  const data = new TextEncoder().encode(JSON.stringify(base));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

/** Anything Discord would answer with a 400, found before a deploy instead of by an officer. Lengths are UTF-16
 *  units, which never undercount Discord's characters. */
export function validateEmbeds(embeds: Embed[]): string[] {
  const p: string[] = [];
  if (embeds.length < 1 || embeds.length > 10) p.push(`${embeds.length} embeds (1 to 10 allowed)`);
  let total = 0;
  embeds.forEach((e, n) => {
    const at = `embed ${n + 1}`;
    const title = e.title ?? "", desc = e.description ?? "", foot = e.footer?.text ?? "";
    if (title.length > 256) p.push(`${at}: title is ${title.length} characters (256 allowed)`);
    if (desc.length > 4096) p.push(`${at}: description is ${desc.length} characters (4096 allowed)`);
    if (foot.length > 2048) p.push(`${at}: footer is ${foot.length} characters (2048 allowed)`);
    const fields = e.fields ?? [];
    if (fields.length > 25) p.push(`${at}: ${fields.length} fields (25 allowed)`);
    for (const f of fields) {
      if (!f.name || f.name.length > 256) p.push(`${at}: field name "${f.name}" is empty or over 256`);
      if (!f.value || f.value.length > 1024) p.push(`${at}: field "${f.name}" value is empty or over 1024`);
      total += f.name.length + f.value.length;
    }
    if (!title && !desc && fields.length === 0) p.push(`${at}: empty`);
    total += title.length + desc.length + foot.length;
  });
  if (total > 6000) p.push(`${total} characters across the embeds (6000 allowed per message)`);
  return p;
}

// ---------- records: what the bot posted where (D1 intro_posts), and one refresh at a time (intro_locks) ----------

interface IntroRow {
  guild_id: string;
  intro_key: string;
  parent_id: string; // the configured channel or forum
  channel_id: string; // where the message lives: the channel itself, or the forum post (thread) for forums
  message_id: string; // for a forum post, the starter message, whose id is the thread's id
  hash: string;
  posted_at: number;
  updated_at: number;
}

async function loadRows(env: Env, guild: string): Promise<Map<string, IntroRow>> {
  const { results } = await env.DB.prepare("SELECT * FROM intro_posts WHERE guild_id = ?1").bind(guild).all<IntroRow>();
  return new Map((results ?? []).map((r) => [r.intro_key, r]));
}

async function saveRow(env: Env, r: IntroRow) {
  await env.DB.prepare(
    `INSERT INTO intro_posts (guild_id, intro_key, parent_id, channel_id, message_id, hash, posted_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(guild_id, intro_key) DO UPDATE SET parent_id = excluded.parent_id, channel_id = excluded.channel_id,
       message_id = excluded.message_id, hash = excluded.hash, posted_at = excluded.posted_at, updated_at = excluded.updated_at`,
  ).bind(r.guild_id, r.intro_key, r.parent_id, r.channel_id, r.message_id, r.hash, r.posted_at, r.updated_at).run();
}

/** Two officers pressing refresh at once would otherwise both see "not posted" and both post. */
export async function takeLock(env: Env, guild: string, holder: string): Promise<boolean> {
  const t = now();
  const r = await env.DB.prepare(
    `INSERT INTO intro_locks (guild_id, holder, until) VALUES (?1, ?2, ?3)
     ON CONFLICT(guild_id) DO UPDATE SET holder = excluded.holder, until = excluded.until WHERE intro_locks.until < ?4`,
  ).bind(guild, holder, t + LOCK_SECONDS, t).run();
  return (r.meta?.changes ?? 0) > 0;
}

async function dropLock(env: Env, guild: string, holder: string) {
  await env.DB.prepare("DELETE FROM intro_locks WHERE guild_id = ?1 AND holder = ?2").bind(guild, holder).run();
}

// ---------- refresh ----------

export type Action = "posted" | "edited" | "reposted" | "repinned" | "current" | "moved" | "skipped" | "failed" | "not-reached";
export interface Outcome { key: string; action: Action; channelId?: string; note?: string }
export interface RefreshResult { outcomes: Outcome[]; stoppedEarly: boolean; busy?: boolean; callsUsed: number }

class OutOfBudget extends Error {}
interface Run { env: Env; left: number; reason: string }
type Msg = { id: string; pinned?: boolean };
type Thread = { id: string; name?: string; flags?: number; thread_metadata?: { archived?: boolean } };

async function call<T>(run: Run, method: string, path: string, body?: unknown): Promise<T> {
  if (run.left <= 0) throw new OutOfBudget("budget spent");
  run.left -= 1;
  return rest<T>(run.env, method, path, body, 0, method === "GET" ? undefined : run.reason);
}

const gone = (e: unknown) => e instanceof DiscordError && e.status === 404;
const discordCode = (e: DiscordError) => {
  try {
    return (JSON.parse(e.body) as { code?: number }).code ?? 0;
  } catch {
    return 0;
  }
};

/** Discord moved pinning to /messages/pins in 2025; the old route is the fallback, never for "unknown message". */
async function pin(run: Run, channelId: string, messageId: string) {
  try {
    await call(run, "PUT", `/channels/${channelId}/messages/pins/${messageId}`);
  } catch (e) {
    if (e instanceof DiscordError && (e.status === 404 || e.status === 405) && discordCode(e) !== 10008) {
      await call(run, "PUT", `/channels/${channelId}/pins/${messageId}`);
    } else throw e;
  }
}

type Payload = { content?: string; embeds: Embed[]; allowed_mentions: { parse: string[] } };

async function refreshText(run: Run, intro: Intro, parent: string, payload: Payload, hash: string, row: IntroRow | undefined): Promise<Outcome & { messageId?: string; where?: string }> {
  let msg: Msg | null = null;
  let action: Action = "current";
  if (row) {
    try {
      msg = row.hash === hash
        ? await call<Msg>(run, "GET", `/channels/${row.channel_id}/messages/${row.message_id}`)
        : await call<Msg>(run, "PATCH", `/channels/${row.channel_id}/messages/${row.message_id}`, payload);
      if (row.hash !== hash) action = "edited";
    } catch (e) {
      if (!gone(e)) throw e;
      msg = null;
      action = "reposted"; // someone deleted it
    }
  }
  if (!msg) {
    msg = await call<Msg>(run, "POST", `/channels/${parent}/messages`, payload);
    if (action !== "reposted") action = "posted";
  }
  let note = "";
  if (!msg.pinned) {
    try {
      await pin(run, parent, msg.id);
      if (action === "current") action = "repinned";
    } catch (e) {
      if (e instanceof OutOfBudget) throw e;
      note = `not pinned: ${explainDiscordError(e)}`;
    }
  }
  return { key: intro.key, action, channelId: parent, note, messageId: msg.id, where: parent };
}

async function refreshForum(run: Run, intro: Intro, forum: string, payload: Payload, hash: string, row: IntroRow | undefined): Promise<Outcome & { messageId?: string; where?: string }> {
  const title = intro.forum!.title;
  let thread: Thread | null = null;
  let action: Action = "current";
  const notes: string[] = [];
  if (row) {
    try {
      thread = await call<Thread>(run, "GET", `/channels/${row.channel_id}`);
    } catch (e) {
      if (!gone(e)) throw e;
      thread = null;
      action = "reposted";
    }
  }
  if (thread) {
    // One PATCH puts back whatever drifted: an archived post (a message in it cannot be edited), the title, the pin.
    const patch: Record<string, unknown> = {};
    if (thread.thread_metadata?.archived) patch.archived = false;
    if (thread.name !== undefined && thread.name !== title) patch.name = title;
    if (((thread.flags ?? 0) & PINNED) === 0) patch.flags = (thread.flags ?? 0) | PINNED;
    if (Object.keys(patch).length) {
      try {
        await call(run, "PATCH", `/channels/${thread.id}`, patch);
        if (patch.flags !== undefined && action === "current") action = "repinned";
      } catch (e) {
        if (e instanceof OutOfBudget) throw e;
        notes.push(`could not update the post itself: ${explainDiscordError(e)}`);
      }
    }
    if (row!.hash !== hash) {
      try {
        await call(run, "PATCH", `/channels/${thread.id}/messages/${thread.id}`, payload);
        action = "edited";
      } catch (e) {
        if (!gone(e)) throw e;
        thread = null; // the post survived but its first message did not: start a clean post
        action = "reposted";
      }
    }
  }
  if (!thread) {
    const info = await call<{ available_tags?: Array<{ id: string; name: string }> }>(run, "GET", `/channels/${forum}`);
    const want = intro.forum!.tag.toLowerCase();
    const tag = (info.available_tags ?? []).find((t) => t.name.toLowerCase() === want);
    if (!tag) notes.push(`no "${intro.forum!.tag}" tag in that forum`);
    thread = await call<Thread>(run, "POST", `/channels/${forum}/threads`, {
      name: title,
      message: payload,
      ...(tag ? { applied_tags: [tag.id] } : {}),
    });
    if (action !== "reposted") action = "posted";
    try {
      await call(run, "PATCH", `/channels/${thread.id}`, { flags: PINNED });
    } catch (e) {
      if (e instanceof OutOfBudget) throw e;
      notes.push(`not pinned: ${explainDiscordError(e)}`);
    }
  }
  return { key: intro.key, action, channelId: forum, note: notes.join("; "), messageId: thread.id, where: thread.id };
}

/** Worst case per intro: a vanished message (1) posted again (1) and pinned (1, or 2 on the old pin route); a forum
 *  post needs a lookup, the forum's tags, the new post, its pin and room for an edit. */
const cost = (intro: Intro) => (intro.forum ? 5 : 4);

export async function refreshIntros(env: Env, guild: string, actor: string, only?: string, budget = BUDGET): Promise<RefreshResult> {
  const channels = parseChannels(env.INTROS_CHANNELS);
  const list = INTROS.filter((x) => !only || channels[x.channel] === only);
  const holder = `${actor}:${crypto.randomUUID()}`;
  if (!(await takeLock(env, guild, holder))) return { outcomes: [], stoppedEarly: false, busy: true, callsUsed: 0 };
  const run: Run = { env, left: budget, reason: `Olympus intros: /olympus-intros refresh by ${actor}` };
  const outcomes: Outcome[] = [];
  let stoppedEarly = false;
  try {
    const rows = await loadRows(env, guild);
    for (const intro of list) {
      const parent = channels[intro.channel];
      if (!parent) {
        outcomes.push({ key: intro.key, action: "skipped", note: `no "${intro.channel}" channel in INTROS_CHANNELS` });
        continue;
      }
      if (stoppedEarly || run.left < cost(intro)) {
        stoppedEarly = true;
        outcomes.push({ key: intro.key, action: "not-reached", channelId: parent });
        continue;
      }
      const embeds = renderEmbeds(intro, channels);
      const problems = validateEmbeds(embeds);
      if ((intro.content ?? "").length > 2000) problems.push(`the content line is ${intro.content!.length} characters (2000 allowed)`);
      if (problems.length) {
        outcomes.push({ key: intro.key, action: "failed", channelId: parent, note: `over Discord's limits: ${problems.join("; ")}` });
        continue;
      }
      const hash = await introHash(intro, embeds);
      // An edit that drops the line has to send "" explicitly, or Discord keeps the old text.
      const payload: Payload = { content: intro.content ? resolveText(intro.content, channels) : "", embeds, allowed_mentions: { parse: [] } };
      const old = rows.get(intro.key);
      const row = old && old.parent_id === parent ? old : undefined; // configured elsewhere now: post in the new place
      try {
        const out = intro.forum
          ? await refreshForum(run, intro, parent, payload, hash, row)
          : await refreshText(run, intro, parent, payload, hash, row);
        if (old && !row && out.action === "posted") {
          out.action = "moved";
          out.note = [out.note, `the old copy in <#${old.channel_id}> was left alone`].filter(Boolean).join("; ");
        }
        if (out.action !== "current" && out.messageId && out.where) {
          const t = now();
          const fresh = out.action === "posted" || out.action === "reposted" || out.action === "moved";
          await saveRow(env, {
            guild_id: guild, intro_key: intro.key, parent_id: parent, channel_id: out.where, message_id: out.messageId,
            hash, posted_at: fresh || !row ? t : row.posted_at, updated_at: t,
          });
        }
        outcomes.push({ key: out.key, action: out.action, channelId: out.channelId, note: out.note || undefined });
      } catch (e) {
        if (e instanceof OutOfBudget) {
          stoppedEarly = true;
          outcomes.push({ key: intro.key, action: "not-reached", channelId: parent });
          continue;
        }
        outcomes.push({ key: intro.key, action: "failed", channelId: parent, note: explainDiscordError(e) });
      }
    }
  } finally {
    await dropLock(env, guild, holder);
  }
  const changed = outcomes.filter((o) => o.action !== "current" && o.action !== "not-reached");
  await audit(env, actor, "intros.refresh", guild, {
    only: only ?? null,
    changed: changed.map((o) => ({ key: o.key, action: o.action, ...(o.note ? { note: o.note.slice(0, 160) } : {}) })),
    stoppedEarly,
  });
  return { outcomes, stoppedEarly, callsUsed: budget - run.left };
}

const LABEL: Record<Action, string> = {
  posted: "➕ posted",
  edited: "✏️ updated in place",
  reposted: "♻️ was deleted, posted again",
  repinned: "📌 pinned again",
  current: "✅ current",
  moved: "↪️ posted in its new channel",
  skipped: "⏭️ skipped",
  failed: "⚠️ failed",
  "not-reached": "⏳ not reached",
};

export function summarize(res: RefreshResult): string {
  if (res.busy) return "Another intro refresh is running right now. Try again in a minute; nothing was changed.";
  const changed = res.outcomes.filter((o) => o.action !== "current" && o.action !== "not-reached" && o.action !== "skipped").length;
  const lines = [`**Olympus intros:** ${changed} changed, ${res.outcomes.length - changed} not.`];
  for (const o of res.outcomes) lines.push(`${LABEL[o.action]}: ${o.channelId ? `<#${o.channelId}>` : o.key}${o.note ? ` (${o.note})` : ""}`);
  if (res.stoppedEarly) lines.push("", "Stopped early to stay inside Cloudflare's per-request limit. Run `/olympus-intros refresh` again to finish; nothing gets posted twice.");
  const text = lines.join("\n");
  return text.length > 1990 ? text.slice(0, 1985) + "…" : text;
}

/** From the records only (no Discord calls): posted or not, and whether the text changed since the last refresh. */
export async function introStatus(env: Env, guild: string): Promise<string> {
  const channels = parseChannels(env.INTROS_CHANNELS);
  const rows = await loadRows(env, guild);
  const lines = [
    `**Olympus intros (${INTROS.length})**, from the bot's records. \`/olympus-intros refresh\` posts, updates and re-pins them, and also notices deleted or unpinned ones.`,
  ];
  for (const intro of INTROS) {
    const parent = channels[intro.channel];
    if (!parent) {
      lines.push(`⏭️ #${intro.channel}: no channel set in INTROS_CHANNELS`);
      continue;
    }
    const row = rows.get(intro.key);
    if (!row || row.parent_id !== parent) {
      lines.push(`➕ <#${parent}>: not posted yet`);
      continue;
    }
    const hash = await introHash(intro, renderEmbeds(intro, channels));
    const where = row.channel_id === parent ? `<#${parent}>` : `<#${row.channel_id}> in <#${parent}>`;
    lines.push(row.hash === hash ? `✅ ${where}: current` : `♻️ ${where}: text changed since the last refresh`);
  }
  const text = lines.join("\n");
  return text.length > 1990 ? text.slice(0, 1985) + "…" : text;
}

// ---------- the command ----------

/** Olympus Officer or Guild Leader (INTROS_ROLES), or anyone holding Administrator in that server. */
export function mayManageIntros(env: Env, i: Interaction): boolean {
  const roles = (env.INTROS_ROLES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if ((i.member?.roles ?? []).some((r) => roles.includes(r))) return true;
  const perms = (i.member as unknown as { permissions?: string } | undefined)?.permissions;
  try {
    return (BigInt(perms ?? "0") & 8n) === 8n; // ADMINISTRATOR
  } catch {
    return false;
  }
}

/**
 * /olympus-intros refresh [channel] | status. A refresh makes up to BUDGET Discord calls, far past the three seconds
 * Discord waits for an answer, so it is deferred (type 5, only the officer sees it) and finished in waitUntil, which
 * edits the reply with the summary.
 */
export async function handleIntros(env: Env, i: Interaction, waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
  const guild = (env.INTROS_GUILD_ID ?? "").trim();
  if (!guild || i.guild_id !== guild) return reply("This command only works in the server that holds the Olympus intros.");
  if (!mayManageIntros(env, i)) return reply("Olympus officers only.");
  const actor = userOf(i).id;
  switch (subcommand(i)) {
    case "status":
      return reply(await introStatus(env, guild));
    case "refresh": {
      const only = option<string>(i, "channel");
      const channels = parseChannels(env.INTROS_CHANNELS);
      if (only && !INTROS.some((x) => channels[x.channel] === only)) return reply(`There is no Olympus intro for <#${only}>.`);
      waitUntil(
        (async () => {
          let content: string;
          try {
            content = summarize(await refreshIntros(env, guild, actor, only));
          } catch (e) {
            content = `The refresh stopped: ${explainDiscordError(e)}`;
          }
          try {
            await rest(env, "PATCH", `/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, { content, allowed_mentions: { parse: [] } });
          } catch (e) {
            console.error("intros: could not edit the deferred reply", errorRef(e));
          }
        })(),
      );
      return json({ type: 5, data: { flags: EPHEMERAL } });
    }
  }
  return reply("Unknown subcommand.");
}

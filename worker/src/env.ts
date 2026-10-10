/** Bindings, vars and secrets. Vars live in wrangler.toml; secrets are set with `wrangler secret put`. */
export interface Env {
  QR_PHASE1_ENABLED?: string;
  QR_RANK_MAPPING_ENABLED?: string;
  QR_NATIVE_ROLE_MAP?: string;
  QR_PRIVILEGED_RANK_MAPPING_ENABLED?: string;
  DB: D1Database;
  ASSETS: Fetcher;                  // .51: the site's static files (wrangler.toml [assets] binding; run_worker_first, so index.ts hands them over itself)

  // --- vars (wrangler.toml [vars]) ---
  GUILD_ID: string;                 // Discord server id (Olympus: 1549537348516188200)
  ROLE_GUILD_MEMBER: string;        // role granted on roster confirmation
  ROLE_OFFICER: string;             // may approve/deny, unbind, run admin commands
  ROLE_MODERATOR: string;           // same admin rights as Officer for this bot
  ROLE_GUILD_LEADER: string;
  ROLE_GUILD_MASTER: string;        // top role; same admin rights (leave "" if the server has no such role)
  ROLE_RAID_LEADER: string;         // no bot rights; named so a departure log line can say the person still has access
  CHANNEL_RECRUITMENT_REVIEW: string; // review cards (ADMISSION_MODE=review) and, under auto, staff notices
  CHANNEL_MOD_ALERTS: string;         // ban cards with the Discord-ban button (leave "" to fall back to the review channel)
  CHANNEL_SERVER_LOG: string;         // audit lines
  OFFICER_RANK_NAMES: string;         // comma-separated in-game rank names that ought to hold the Discord Officer role ("" = no report)
  RANK_CHECK_EXEMPT?: string;         // characters that check never reports, as in game (typically the guild owner)
  UNVERIFIED_GRACE_DAYS?: string;     // days an unverified member is protected from removal (see unverified.ts)
  VERIFY_OPEN_SINCE?: string;         // ISO date or unix time verification became possible for everyone (.32)
  QUEUE_CLAIM_TTL_MINUTES: string;    // how long one officer's hold on a queued invite survives without a poll
  QUEUE_CLAIM_LIMIT: string;          // most rows one officer may hold at once
  QUEUE_CLAIM_PRIORITY_EXTRA?: string; // reserved names (priority rows) an officer may hold on top of that (ingest.ts getQueue, default 10)
  ROSTER_MIN_MEMBERS: string;         // refuse to act on a roster export smaller than this (0 = no floor)
  ROSTER_MAX_SHRINK_PCT: string;      // refuse to strip roles when an export shrank by more than this percentage
  GUILD_MEMBER_CAP?: string;          // .115: roster count at which Olympus I counts as full for the status texts (guild-seats.ts); 900..1000, anything else = 1000; informational only. Set only as an owner secret or through a reviewed profile change
  ADMISSION_MODE: "review" | "auto";  // review = officer clicks Approve; auto = valid code queues an invite
  SET_NICKNAME: "true" | "false";     // set Discord nickname to the character name on admission
  SET_GUILD_NOTE: "true" | "false";   // addon writes the Discord ID into the public note — forbidden for addons on the Forever beta (1.60.1.69893); keep false there
  OFFICER_CHARACTERS: string;         // names of the characters running the addon, shown in /verify instructions when no watcher reports presence
  LINKS_NOT_BEFORE?: string;          // links older than this (unix seconds or YYYY-MM-DD) count only once a roster pinned their GUID — set to the live launch
  REQUEST_CODES?: string;             // "auto" (default): the Verify button issues request codes once an upgraded officer PC has checked in; "on" / "off" force it
  PUBLIC_BASE_URL: string;            // https://verify.example.workers.dev
  // .50: the Phase 3 vars (PHASE3_BNET_API, BNET_REGION, BNET_PROFILE_NAMESPACE, BNET_GUILD_*) are gone with the path.

  // --- secrets ---
  DISCORD_APP_ID: string;
  DISCORD_PUBLIC_KEY: string;       // interactions Ed25519 key (hex)
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_SECRET: string;    // OAuth2 (linked role)
  VERIFY_SECRET: string;            // shared with addon + watcher (HMAC codes)
  WATCHER_TOKEN: string;            // bearer for /ingest/* and /queue
  INVITE_MAX_ATTEMPTS?: string;     // refused invites tolerated before a queue row is retired (default 6)
  CHANNEL_NOTICES?: string;         // #bot-announcements: where member notices are posted, mentioning the member. The bot never DMs (dm.ts)
  CHANNEL_VISITOR_CHAT?: string;    // #olympus-2-x: the chat for people outside the main guild; the guide and /verify point there
  ROLE_SWEEP_PER_RUN?: string;      // accounts one Guild Member sweep may check (default 10; restore.ts)
  ROLE_CALL_BUDGET?: string;        // .90: Discord calls one role-writing run may make (a sweep, an export's promotions, a sync, a batch of join events, a backfill page; default 40 of the free plan's 50 subrequests; roles.ts)
  BLOCKING_ROLE_IDS?: string;       // .55: comma-separated role ids whose holders never get Guild Member (Quarantine, Flagellant); roles.ts
  BAN_BUTTON_ENABLED?: "true" | "false"; // .55: show the "Ban from Discord" button on the ban card (needs Ban Members, a separate approval)
  NOTICE_RATE_CAP?: string;         // most notice posts in any 60s window (default 10); over it, notices are dropped, not queued
  INTROS_GUILD_ID?: string;         // build .39: the server holding the bot's pinned channel intros (Asmongold's); "" = off
  INTROS_ROLES?: string;            // roles there that may run /olympus-intros (Olympus Officer, Guild Leader); Administrators always may
  INTROS_CHANNELS?: string;         // "key=channelId,..." for the channels the intros live in or mention (intros.ts)
  // --- build .41: the guild site (site.ts) and the lookups in Asmongold's server (lookup.ts) ---
  SITE_HOST?: string;               // guild.roachcouncil.com: the site answers on this host only ("" = no site)
  SITE_LEGACY_HOSTS?: string;       // build .49: former site hosts, comma-separated; a GET there is a 301 to SITE_HOST, anything else 404
  SITE_GUILD_ID?: string;           // the server whose members may sign in (Asmongold's)
  SITE_ADMINS?: string;             // Discord user ids that see results, applications and the admin pages (comma-separated)
  SITE_JOIN_URL?: string;           // invite link shown to someone who is not in SITE_GUILD_ID ("" = no link)
  COMMUNITY_FEATURES?: string;      // .56: comma list of community modules switched on (community-context.ts); "" = none
  COMMUNITY_DIRECTORY_LIMIT?: string; // .57: listed profiles the directory holds and one read evaluates (default 2500; community-directory.ts); .59: also the calendar's member bound
  COMMUNITY_ORGANIZERS?: string;    // .59: Discord ids (comma list) who may organize events besides SITE_ADMINS; they must still be confirmed guild members
  EVENT_DISCORD_DELIVERY?: string;  // 10 Oct 2026: "on" allows explicit organizer publication to the configured raid-signups channel; default OFF
  EVENT_DISCORD_REMINDERS?: string; // 10 Oct 2026: "on" permits separately opted sixty-minute reminders; default OFF
  CONTRIBUTIONS_MODE?: string;      // .75: "off" (default) or "ledger": the contribution ledger takes writes only in ledger mode with a retention (community-contributions.ts)
  CONTRIBUTIONS_RETENTION_DAYS?: string; // .75: 1..3650 days every ledger record is kept from its week or observation; "" = no writes
  CONTRIBUTIONS_SCOPE?: string;     // .75: the guild scope the ledger records carry (default "olympus")
  PRIVACY_INTAKE_ENABLED?: string;  // .82: "true" accepts new private requests (with the flag privacy_intake, PRIVACY_INTAKE_MONITORED and a retention); existing cases stay readable
  PRIVACY_INTAKE_MONITORED?: string; // .82: "true" once someone actually reads the staff queue; without it no new case is accepted
  PRIVACY_INTAKE_RETENTION_DAYS?: string; // .82: 1..3650 days a case is kept from its last activity, fixed per case when it is created
  PRIVACY_ERASURE_ENABLED?: string; // serving request admission only; completion also needs current role/removal and all-store custody checks
  PRIVACY_ACCESS_ENABLED?: string; // identify-only privacy connection, separate from ordinary guild access
  PRIVACY_RETENTION_ENABLED?: string; // bounded fixed-deadline local sweeper; provider/recovery custody remains separate
  PRIVACY_WRITE_ADMISSION_ENABLED?: string; // .139: exact source-installed control/triggers required; absent/default OFF, no automatic installation
  PRIVACY_WRITE_ADMISSION_LAYOUT?: 'canonical'|'recorded-live-20261010'; // closed complete source layouts only; no per-table mix or live-schema learning
  OFFICER_DIGEST_ENABLED?: string;  // .85: "true" posts the daily officer digest (counts only) to the staff channel after 15:00 UTC (community-digest.ts); anything else only removes a digest it posted earlier
  NAME_RESERVATION_AT?: string;     // default for when Blizzard's name reservation opens (ISO or unix); the admin page overrides it
  LAUNCH_AT?: string;               // default launch time (ISO or unix): approved reserved names are queued from then
  NAMES_PER_RUN?: string;           // Discord names refreshed per cron run for linked members (names.ts, default 5)
  COOKIE_SECRET: string;            // signs the OAuth state cookie and the site's session cookie
  BNET_CLIENT_ID?: string;          // Battle.net API client (develop.battle.net) — enables the Battle.net-login fallback in /linked-role, and Phase 3
  BNET_CLIENT_SECRET?: string;      // same client; redirect URLs to register: <PUBLIC_BASE_URL>/bnet/link and, for Phase 3, /bnet/callback
}

export const isAdminMode = (env: Env) => env.ADMISSION_MODE === "review";
export const flag = (v: string | undefined) => v === "true";

/**
 * Roles allowed to run /olympus-admin and the officer context menu. Empty ids are dropped so an unset var is harmless.
 * .55: ROLE_MODERATOR is no longer in this set (tracker D03; plan V4): in Asmongold's server that var names the
 * server's own Discord Moderator team, who should see departure lines (staffRoles) but not bind, unbind or ban guild
 * accounts. Olympus Officer and Guild Leader are the officers; Guild Leader (or Guild Master where one exists) approves
 * a Discord ban.
 */
export const officerRoles = (env: Env) => [env.ROLE_OFFICER, env.ROLE_GUILD_LEADER, env.ROLE_GUILD_MASTER].filter(Boolean);

/** Roles allowed to press the irreversible "Ban from Discord" button — deliberately narrower than officerRoles. */
export const banApproverRoles = (env: Env) => [env.ROLE_GUILD_LEADER, env.ROLE_GUILD_MASTER].filter(Boolean);

/** Roles that grant channel access independently of Guild Member, so a departure can say the access did not fully go. */
export const staffRoles = (env: Env) =>
  [env.ROLE_RAID_LEADER, env.ROLE_OFFICER, env.ROLE_MODERATOR, env.ROLE_GUILD_LEADER, env.ROLE_GUILD_MASTER].filter(Boolean);

/** Channel for staff notices that need a decision (ban cards, rank mismatches). */
export const staffChannel = (env: Env) => env.CHANNEL_MOD_ALERTS || env.CHANNEL_RECRUITMENT_REVIEW || "";

export const officerRankNames = (env: Env) =>
  (env.OFFICER_RANK_NAMES || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);

/**
 * Characters the officer-rank check should ignore, as written in game.
 *
 * Returned raw: the caller runs them through normalizeCharacter, so the comparison cannot drift from the way every
 * other character name in this codebase is keyed. A second normalizer here would differ on the first name carrying
 * a non-ASCII capital -- normalizeCharacter lowercases only A-Z, and the roster has names like "Ðismas Ðanero".
 */
export const rankCheckExempt = (env: Env) =>
  (env.RANK_CHECK_EXEMPT || "").split(",").map((r) => r.trim()).filter(Boolean);

export const intVar = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

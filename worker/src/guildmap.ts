/**
 * A read-only map of the Discord server: guild settings, every role, every category and channel, and every
 * permission overwrite — with the bitfields decoded into names — in one request.
 *
 * Why this exists: the structure of a Discord server lives only inside Discord's UI, where it can be read one
 * dialog at a time and compared not at all. Moving Olympus into an existing server means rebuilding that structure
 * somewhere else by hand. This turns it into a document that can be read, diffed, reviewed by somebody who does
 * not have admin, and replayed deliberately.
 *
 * Deliberately read-only. Creating or editing roles and channels inside a community this bot does not own is
 * irreversible and visible to everyone in it, so the output is a plan for a human to apply, never something the
 * bot applies on its own.
 */
import type { Env } from "./env";
import { rest } from "./discord";

/**
 * Discord permission bits, as documented for API v10. Discord adds bits over time and this table was written in
 * September 2026, so any bit not listed is reported as UNKNOWN_BIT_<n> rather than dropped: a permission silently
 * missing from a migration manifest is far more dangerous than an ugly name in one.
 */
const PERMISSION_BITS: Record<number, string> = {
  0: "CREATE_INSTANT_INVITE", 1: "KICK_MEMBERS", 2: "BAN_MEMBERS", 3: "ADMINISTRATOR",
  4: "MANAGE_CHANNELS", 5: "MANAGE_GUILD", 6: "ADD_REACTIONS", 7: "VIEW_AUDIT_LOG",
  8: "PRIORITY_SPEAKER", 9: "STREAM", 10: "VIEW_CHANNEL", 11: "SEND_MESSAGES",
  12: "SEND_TTS_MESSAGES", 13: "MANAGE_MESSAGES", 14: "EMBED_LINKS", 15: "ATTACH_FILES",
  16: "READ_MESSAGE_HISTORY", 17: "MENTION_EVERYONE", 18: "USE_EXTERNAL_EMOJIS", 19: "VIEW_GUILD_INSIGHTS",
  20: "CONNECT", 21: "SPEAK", 22: "MUTE_MEMBERS", 23: "DEAFEN_MEMBERS",
  24: "MOVE_MEMBERS", 25: "USE_VAD", 26: "CHANGE_NICKNAME", 27: "MANAGE_NICKNAMES",
  28: "MANAGE_ROLES", 29: "MANAGE_WEBHOOKS", 30: "MANAGE_GUILD_EXPRESSIONS", 31: "USE_APPLICATION_COMMANDS",
  32: "REQUEST_TO_SPEAK", 33: "MANAGE_EVENTS", 34: "MANAGE_THREADS", 35: "CREATE_PUBLIC_THREADS",
  36: "CREATE_PRIVATE_THREADS", 37: "USE_EXTERNAL_STICKERS", 38: "SEND_MESSAGES_IN_THREADS", 39: "USE_EMBEDDED_ACTIVITIES",
  40: "MODERATE_MEMBERS", 41: "VIEW_CREATOR_MONETIZATION_ANALYTICS", 42: "USE_SOUNDBOARD", 43: "CREATE_GUILD_EXPRESSIONS",
  44: "CREATE_EVENTS", 45: "USE_EXTERNAL_SOUNDS", 46: "SEND_VOICE_MESSAGES", 47: "USE_CLYDE_AI",
  48: "SET_VOICE_CHANNEL_STATUS", 49: "SEND_POLLS", 50: "USE_EXTERNAL_APPS", 51: "PIN_MESSAGES",
  52: "BYPASS_SLOWMODE",
};

/**
 * Permissions Discord has retired. The bit stays set on any role that had it before removal, so it keeps turning up
 * in a map of an older server — and there is no longer a checkbox for it in the role editor. Flagged separately so
 * nobody wastes time hunting for a control that no longer exists while rebuilding a role somewhere else.
 */
const DEPRECATED_PERMISSIONS = new Set(["USE_CLYDE_AI"]);

const CHANNEL_TYPES: Record<number, string> = {
  0: "text", 2: "voice", 4: "category", 5: "announcement", 13: "stage", 14: "directory", 15: "forum", 16: "media",
};

/** Bitfield string -> permission names, plus any bit this build does not recognise. */
export function decodePermissions(raw: string | null | undefined): { names: string[]; unknown: string[] } {
  const names: string[] = [];
  const unknown: string[] = [];
  let value: bigint;
  try {
    value = BigInt(raw ?? "0");
  } catch {
    return { names: [], unknown: [`UNPARSEABLE(${String(raw).slice(0, 32)})`] };
  }
  for (let bit = 0; bit < 64; bit++) {
    if ((value & (1n << BigInt(bit))) === 0n) continue;
    const name = PERMISSION_BITS[bit];
    if (name) names.push(name);
    else unknown.push(`UNKNOWN_BIT_${bit}`);
  }
  return { names, unknown };
}

interface RawRole {
  id: string; name: string; position: number; color: number; hoist: boolean;
  managed: boolean; mentionable: boolean; permissions: string;
  tags?: { bot_id?: string; integration_id?: string; premium_subscriber?: null };
  icon?: string | null; unicode_emoji?: string | null;
}

interface RawOverwrite { id: string; type: number; allow: string; deny: string }

interface RawChannel {
  id: string; name: string; type: number; position: number; parent_id?: string | null;
  topic?: string | null; nsfw?: boolean; rate_limit_per_user?: number; bitrate?: number;
  user_limit?: number; permission_overwrites?: RawOverwrite[];
}

interface RawGuild {
  id: string; name: string; description?: string | null; owner_id: string;
  verification_level: number; explicit_content_filter: number; default_message_notifications: number;
  mfa_level: number; premium_tier: number; premium_subscription_count?: number;
  features: string[]; system_channel_id?: string | null; rules_channel_id?: string | null;
  public_updates_channel_id?: string | null; afk_channel_id?: string | null; afk_timeout?: number;
  vanity_url_code?: string | null; preferred_locale?: string; nsfw_level?: number;
  approximate_member_count?: number; approximate_presence_count?: number;
}

/**
 * The whole server, in one object.
 *
 * Three Discord calls plus one for the bot's own membership. Roles and channels each come back complete in a
 * single response, so this does not paginate and does not touch the member list — a member fetch on a large server
 * is enormously expensive and nothing here needs it.
 */
export async function guildMap(env: Env, guildId = "") {
  // Defaults to the configured server, but takes any guild the bot is a member of, so the destination server can be
  // mapped and diffed against this one before anything is rebuilt there. When it points somewhere else the config
  // wiring below reports every id as missing, which is not a fault: that list IS the migration checklist.
  const gid = /^[0-9]{5,25}$/.test(guildId) ? guildId : env.GUILD_ID;
  const [guild, roles, channels] = await Promise.all([
    rest<RawGuild>(env, "GET", `/guilds/${gid}?with_counts=true`),
    rest<RawRole[]>(env, "GET", `/guilds/${gid}/roles`),
    rest<RawChannel[]>(env, "GET", `/guilds/${gid}/channels`),
  ]);

  const unknownBits = new Set<string>();
  const deprecated = new Set<string>();
  const noteDeprecated = (names: string[]) => names.forEach((n) => { if (DEPRECATED_PERMISSIONS.has(n)) deprecated.add(n); });
  const roleName = new Map<string, string>();
  for (const r of roles) roleName.set(r.id, r.name);

  const mappedRoles = [...roles]
    .sort((a, b) => b.position - a.position) // highest first, the order that decides who can manage whom
    .map((r) => {
      const p = decodePermissions(r.permissions);
      p.unknown.forEach((u) => unknownBits.add(u));
      noteDeprecated(p.names);
      return {
        id: r.id,
        name: r.name,
        position: r.position,
        colorHex: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : null,
        hoist: r.hoist,
        mentionable: r.mentionable,
        // A managed role belongs to an integration (a bot, a Twitch sub tier, Nitro booster). It cannot be created
        // by hand in the destination server -- installing the integration there is what makes it appear.
        managed: r.managed,
        managedBy: r.tags?.bot_id ? "bot" : r.tags?.integration_id ? "integration" : r.tags?.premium_subscriber === null ? "nitro-booster" : null,
        permissionsRaw: r.permissions,
        permissions: p.names,
        isAdministrator: p.names.includes("ADMINISTRATOR"),
      };
    });

  const describeOverwrites = (ows: RawOverwrite[] | undefined) =>
    (ows ?? []).map((o) => {
      const allow = decodePermissions(o.allow);
      const deny = decodePermissions(o.deny);
      [...allow.unknown, ...deny.unknown].forEach((u) => unknownBits.add(u));
      noteDeprecated(allow.names);
      noteDeprecated(deny.names);
      return {
        // type 0 is a role, type 1 is a single member. A member overwrite does not port: the person has to exist
        // in the destination server first, so these are the entries a migration has to handle by hand.
        kind: o.type === 0 ? "role" : "member",
        id: o.id,
        name: o.type === 0 ? roleName.get(o.id) ?? "(deleted role)" : "(member)",
        allow: allow.names,
        deny: deny.names,
        allowRaw: o.allow,
        denyRaw: o.deny,
      };
    });

  const mapChannel = (c: RawChannel) => ({
    id: c.id,
    name: c.name,
    type: CHANNEL_TYPES[c.type] ?? `unknown(${c.type})`,
    typeId: c.type,
    position: c.position,
    topic: c.topic ?? null,
    nsfw: !!c.nsfw,
    slowmodeSeconds: c.rate_limit_per_user ?? 0,
    bitrate: c.bitrate ?? null,
    userLimit: c.user_limit ?? null,
    // Empty means the channel simply inherits its category. Discord shows nothing in the UI for this case, which
    // is exactly why it gets missed when a structure is rebuilt by hand.
    syncedWithCategory: (c.permission_overwrites ?? []).length === 0,
    overwrites: describeOverwrites(c.permission_overwrites),
  });

  const categories = channels
    .filter((c) => c.type === 4)
    .sort((a, b) => a.position - b.position)
    .map((cat) => ({
      ...mapChannel(cat),
      children: channels
        .filter((c) => c.parent_id === cat.id)
        .sort((a, b) => a.position - b.position)
        .map(mapChannel),
    }));

  const uncategorised = channels
    .filter((c) => c.type !== 4 && !c.parent_id)
    .sort((a, b) => a.position - b.position)
    .map(mapChannel);

  // What the bot itself can do here. Without this the map says what the server looks like but not whether the
  // account reading it could rebuild any of it, which is the first question anyone asks about a migration.
  let self: Record<string, unknown> = { error: "could not read the bot's own membership" };
  try {
    // Two calls, not one. `/guilds/{id}/members/@me` looks like it should work by analogy with `/users/@me` and
    // does not — that endpoint requires a real snowflake and rejects "@me" with a 400 (code 50035,
    // NUMBER_TYPE_COERCE). The bot's own id has to be fetched first.
    const who = await rest<{ id: string; username: string }>(env, "GET", "/users/@me");
    const me = await rest<{ roles: string[] }>(env, "GET", `/guilds/${gid}/members/${who.id}`);
    const mine = mappedRoles.filter((r) => me.roles.includes(r.id));
    const effective = new Set<string>();
    const everyone = mappedRoles.find((r) => r.id === gid); // @everyone always carries the guild's own id
    for (const r of [...mine, ...(everyone ? [everyone] : [])]) r.permissions.forEach((p) => effective.add(p));
    const admin = effective.has("ADMINISTRATOR");
    const highest = mine.reduce((max, r) => Math.max(max, r.position), 0);
    const memberRole = mappedRoles.find((r) => r.id === env.ROLE_GUILD_MEMBER);
    self = {
      userId: who.id,
      username: who.username,
      roles: mine.map((r) => r.name),
      highestRolePosition: highest,
      permissions: [...effective].sort(),
      // Administrator overrides every other permission, including overwrites that deny.
      isAdministrator: admin,
      canManageRoles: admin || effective.has("MANAGE_ROLES"),
      canManageChannels: admin || effective.has("MANAGE_CHANNELS"),
      // A role can only be granted or edited if it sits strictly below the bot's highest role. The bot's OWN roles
      // are excluded: it cannot manage them either, but listing them reads as an obstacle when it is not one.
      rolesAboveBot: mappedRoles
        .filter((r) => r.position >= highest && r.id !== gid && !me.roles.includes(r.id))
        .map((r) => r.name),
      // The one question this whole section exists to answer. Everything else about the hierarchy is context; this
      // is whether verification will actually work, and it is the first thing to break after a move because role
      // positions are not carried over with the ids.
      guildMemberRole: memberRole ? { name: memberRole.name, position: memberRole.position } : null,
      canGrantGuildMemberRole: admin || (!!memberRole && effective.has("MANAGE_ROLES") && memberRole.position < highest),
    };
  } catch (e) {
    self = { error: String(e).slice(0, 200) };
  }

  // Every id in wrangler.toml, resolved against what is actually here. Answers "is this config still pointing at
  // something real" without opening Discord, and after a move it is the checklist of what still needs swapping.
  const channelById = new Map(channels.map((c) => [c.id, c] as const));
  const configured: Array<{ key: string; id: string; kind: "role" | "channel" }> = [
    { key: "ROLE_GUILD_MEMBER", id: env.ROLE_GUILD_MEMBER, kind: "role" },
    { key: "ROLE_OFFICER", id: env.ROLE_OFFICER, kind: "role" },
    { key: "ROLE_MODERATOR", id: env.ROLE_MODERATOR, kind: "role" },
    { key: "ROLE_GUILD_LEADER", id: env.ROLE_GUILD_LEADER, kind: "role" },
    { key: "ROLE_GUILD_MASTER", id: env.ROLE_GUILD_MASTER, kind: "role" },
    { key: "ROLE_RAID_LEADER", id: env.ROLE_RAID_LEADER, kind: "role" },
    { key: "CHANNEL_RECRUITMENT_REVIEW", id: env.CHANNEL_RECRUITMENT_REVIEW, kind: "channel" },
    { key: "CHANNEL_MOD_ALERTS", id: env.CHANNEL_MOD_ALERTS, kind: "channel" },
    { key: "CHANNEL_SERVER_LOG", id: env.CHANNEL_SERVER_LOG, kind: "channel" },
    { key: "CHANNEL_NOTICES", id: env.CHANNEL_NOTICES ?? "", kind: "channel" },
    { key: "CHANNEL_VISITOR_CHAT", id: env.CHANNEL_VISITOR_CHAT ?? "", kind: "channel" },
  ];
  const wiring = configured.map((c) => {
    const id = (c.id ?? "").trim();
    if (!id) return { ...c, id: "", status: "unset", name: null as string | null };
    const found = c.kind === "role" ? roleName.get(id) ?? null : channelById.get(id)?.name ?? null;
    return { ...c, status: found ? "ok" : "missing", name: found };
  });

  return {
    fetchedAt: Math.floor(Date.now() / 1000),
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description ?? null,
      ownerId: guild.owner_id,
      approximateMembers: guild.approximate_member_count ?? null,
      approximateOnline: guild.approximate_presence_count ?? null,
      verificationLevel: guild.verification_level,
      explicitContentFilter: guild.explicit_content_filter,
      defaultMessageNotifications: guild.default_message_notifications,
      mfaLevel: guild.mfa_level,
      premiumTier: guild.premium_tier,
      boosts: guild.premium_subscription_count ?? 0,
      preferredLocale: guild.preferred_locale ?? null,
      vanityUrlCode: guild.vanity_url_code ?? null,
      nsfwLevel: guild.nsfw_level ?? null,
      afkTimeout: guild.afk_timeout ?? null,
      systemChannelId: guild.system_channel_id ?? null,
      rulesChannelId: guild.rules_channel_id ?? null,
      publicUpdatesChannelId: guild.public_updates_channel_id ?? null,
      afkChannelId: guild.afk_channel_id ?? null,
      features: guild.features ?? [],
    },
    bot: self,
    counts: {
      roles: mappedRoles.length,
      categories: categories.length,
      channels: channels.filter((c) => c.type !== 4).length,
      uncategorised: uncategorised.length,
      overwrites: channels.reduce((n, c) => n + (c.permission_overwrites ?? []).length, 0),
    },
    roles: mappedRoles,
    categories,
    uncategorised,
    configWiring: wiring,
    // Non-empty means this build is older than the server's Discord: re-check the table before trusting a manifest.
    unknownPermissionBits: [...unknownBits].sort(),
    // Present but retired by Discord — they cannot be set again in the destination, and do not need to be.
    deprecatedPermissions: [...deprecated].sort(),
  };
}

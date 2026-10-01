/**
 * The bot's commands in Asmongold's server (INTROS_GUILD_ID), shared by register-intros.mjs and register.mjs:
 * /olympus-intros (build .39, src/intros.ts), and /olympus-lookup with its right-click twin (build .41, src/lookup.ts).
 */
const CHANNEL = 7, SUB = 1, STRING = 3, USER = 6;

export const introsCommand = {
  name: "olympus-intros",
  description: "Olympus officers: post, update and re-pin the bot's intro in each Olympus channel",
  // "0" hides it from everyone except Administrators until the server allows roles for it under Server Settings ->
  // Integrations -> Olympus Verify. The Worker checks INTROS_ROLES or Administrator on every use as well.
  default_member_permissions: "0",
  options: [
    {
      type: SUB,
      name: "refresh",
      description: "Post missing intros, update changed ones in place, re-pin unpinned ones",
      options: [{ type: CHANNEL, name: "channel", description: "Only this channel or forum (default: all of them)", required: false, channel_types: [0, 5, 15] }],
    },
    { type: SUB, name: "status", description: "Which intros are posted and current, from the bot's records (changes nothing)" },
  ],
};

/** /olympus-lookup: a member's linked characters and guild-site entries, or who owns a character (src/lookup.ts). */
export const lookupCommand = {
  name: "olympus-lookup",
  description: "Olympus officers: a member's linked characters and guild-site entries, or who owns a character",
  default_member_permissions: "0", // Administrators until roles are allowed under Integrations; the Worker checks INTROS_ROLES too
  options: [
    { type: USER, name: "member", description: "A member of this server", required: false },
    { type: STRING, name: "character", description: "A character name, as in game (First Last)", required: false, autocomplete: true, max_length: 32 },
  ],
};

/** Right-click a member -> Apps -> "Olympus linked characters". The name must match LOOKUP_USER_MENU in src/lookup.ts. */
export const lookupUserCommand = { name: "Olympus linked characters", type: 2, default_member_permissions: "0" };

/** Everything register-intros.mjs puts in that server, one POST each (the server's other commands are left alone). */
export const asmongoldCommands = [introsCommand, lookupCommand, lookupUserCommand];

/** The verification guide: one embed with three buttons, posted by `/olympus-admin post-guide` (meant for #join-guild, pinned). */
import type { Env } from "./env";
import { rulesetLabel } from "./ruleset-profile";

export const GUIDE_VERIFY = "guide:verify"; // button → a request code, nothing to type (27 Sep; it opened a name modal before)
export const GUIDE_STATUS = "guide:status"; // button → same answer as /verify-status
export const GUIDE_MODAL = "guide:verify-modal"; // the old name modal's custom_id, still answered for anyone who has it open
export const GUIDE_FIELD = "character"; // the text input inside it

const GOLD = 0xc9a227;

/** Where people outside the main guild are pointed: a channel mention when CHANNEL_VISITOR_CHAT is set. */
export function visitorChat(env: Env): string {
  const id = (env.CHANNEL_VISITOR_CHAT ?? "").trim();
  // .52: no made-up channel name when unconfigured (#olympus-2-x exists in no server the bot serves).
  return /^[0-9]{5,25}$/.test(id) ? `<#${id}>` : "the visitors channel";
}

/**
 * Olympus has overflow guilds (Olympus 2 and later) that this server does not verify. Saying so stops their members
 * applying to the main guild's queue by mistake, and tells them where they are welcome. .115 (item B, 2 Oct 2026): one
 * sentence shared by the guide and the full-guild paragraph of /verify-status (guild-seats.ts); the guide's posted
 * text is unchanged.
 */
export const visitorLine = (env: Env) => `Olympus 2 and the later Olympus guilds are welcome in ${visitorChat(env)}; this flow verifies the main Olympus guild.`;

/**
 * .52 (1 Oct 2026): the copy is Codex's reviewed content candidate (evidence/discord-content-candidate.json, 00:37 UTC),
 * conditioned on effective config: the role sentence only when ROLE_GUILD_MEMBER is set, the nickname only when
 * SET_NICKNAME is on, officer review only under ADMISSION_MODE=review, and no channel named that may not exist (the
 * footer no longer says #help-desk). Nothing is promised that the bot's permissions do not deliver.
 */
export function guideMessage(env: Env) {
  const officers = env.OFFICER_CHARACTERS || "an officer";
  const review = env.ADMISSION_MODE === "review";
  const role = !!env.ROLE_GUILD_MEMBER;
  const nickname = env.SET_NICKNAME === "true";
  const invite = review
    ? "If you are applying, an officer reviews the confirmed request before your invite enters the queue; an officer sends the invite from the game client when the guild has room."
    : "If you are applying, your invite enters the queue; an officer sends it from the game client when the guild has room.";
  const access = role
    ? " Your **Olympus Guild Member** role opens the member channels once your verified character appears on the officer-exported guild roster and the access checks pass."
    : "";
  const nick = nickname ? " When enabled by guild staff, your Discord nickname updates to your verified character name." : "";
  return {
    embeds: [
      {
        title: role ? "Join Olympus or restore your guild access" : "Join Olympus",
        color: GOLD,
        description: [
          `Current game: **${rulesetLabel()}**.`,
          "",
          "For a character in, or applying to, the main Olympus guild. The website is optional for this verification flow.", // .114: no Battle.net promise while its sign-in is switched off (bnet-switch.ts)
          "",
          "**1. Get a code** — press **Get my code**. The bot shows the line to use in game. If the current officer relay needs a character name first, enter it exactly as it appears in game.",
          `**2. Send it from your character** — log in as the character you want linked, paste the shown line into the in-game chat box and press Enter. It whispers the code to an available officer (${officers}); the character that sends it is the one linked. Follow the bot's current instructions if no officer is online; mailing the code to an officer works too.`,
          "",
          `The officer's checked addon confirms the code from that character. ${invite}${access}${nick}`,
          role
            ? "Already a member? Use the same steps. **My status** shows your progress and can restore a missing role when your membership proof is current and no access restriction prevents it."
            : "Already in the guild? Use the same steps; there is nothing to approve, and **My status** shows your progress.",
          "",
          visitorLine(env), // the overflow guilds (Olympus 2 and later) are not verified here; see visitorLine
          "Keep your verification code private. Never post passwords, authenticator codes, payment details or personal documents. The bot never sends you a DM.",
        ].join("\n"),
        footer: { text: "Olympus Verify · My status for progress · Ask an Olympus officer for account help" },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "Get my code", custom_id: GUIDE_VERIFY },
          { type: 2, style: 2, label: "My status", custom_id: GUIDE_STATUS },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Interaction response type 9: a modal with one text input for the character name. */
export const verifyModal = () => ({
  type: 9,
  data: {
    custom_id: GUIDE_MODAL,
    title: "Verify a character",
    components: [
      {
        type: 1,
        components: [
          {
            type: 4, // text input
            custom_id: GUIDE_FIELD,
            label: "Character name, exactly as in game",
            style: 1, // short
            min_length: 2,
            max_length: 32,
            required: true,
            placeholder: "e.g. Fern Melder",
          },
        ],
      },
    ],
  },
});

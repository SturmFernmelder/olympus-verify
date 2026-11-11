/** The verification guide: one embed with three buttons, posted by `/olympus-admin post-guide` (meant for #join-guild, pinned). */
import type { Env } from "./env";
import { rulesetLabel, type RulesetProfile } from "./ruleset-profile";
import { FLAGSHIP_GUILD_NAME } from "./guild-affiliation229";
import { nicknameButtons233 } from './member-nickname233';
import {captureCanonicalRankConfig233} from './canonical-ranks233';
import {captureLaunchVerification} from './launch-verification227';

export const GUIDE_VERIFY = "guide:verify"; // button → a request code, nothing to type (27 Sep; it opened a name modal before)
export const GUIDE_STATUS = "guide:status"; // button → same answer as /verify-status
export const GUIDE_MODAL = "guide:verify-modal"; // the old name modal's custom_id, still answered for anyone who has it open
export const GUIDE_FIELD = "character"; // the text input inside it

const GOLD = 0xc9a227;

/** Resolve the Worker mode at render time without a static dependency back through guild-seats. */
export async function usesLegacyInviteQueue(env: Env): Promise<boolean> {
  const { captureLaunchVerification } = await import("./launch-verification227");
  return captureLaunchVerification(env).mode === "legacy";
}

/** Where people outside the main guild are pointed: a channel mention when CHANNEL_VISITOR_CHAT is set. */
export function visitorChat(env: Env): string {
  const id = (env.CHANNEL_VISITOR_CHAT ?? "").trim();
  // .52: no made-up channel name when unconfigured (#olympus-2-x exists in no server the bot serves).
  return /^[0-9]{5,25}$/.test(id) ? `<#${id}>` : "the visitors channel";
}

/**
 * Olympus has overflow guilds (Olympus 2 and later) that this server does not verify. Saying so stops their members
 * applying to the main guild's queue by mistake, and tells them where they are welcome. .115 (item B, 2 Oct 2026): one
 * sentence shared by the guide and the full-guild paragraph of /verify-status (guild-seats.ts).
 * The owner's 5 Nov 2026 flagship display name does not rewrite the stored ruleset profile.
 */
export const visitorLine = (env: Env) => `Olympus 2 and the later Olympus guilds are welcome in ${visitorChat(env)}; this flow verifies ${FLAGSHIP_GUILD_NAME}.`;

/**
 * .52 (1 Oct 2026): the copy is Codex's reviewed content candidate (evidence/discord-content-candidate.json, 00:37 UTC),
 * conditioned on effective config: the role sentence only when ROLE_GUILD_MEMBER is set, the nickname only when
 * SET_NICKNAME is on, officer review only under ADMISSION_MODE=review, and no channel named that may not exist (the
 * footer no longer says #help-desk). Nothing is promised that the bot's permissions do not deliver.
 */
/** 14 Oct 2026 (item 7): the caller resolves the active identity; a held identity means no guide. `freshRoles` (Revision 4,
 * A6): the caller's captured lane grants fresh roles now (configured and past epochStart); otherwise the .160 wording. */
export function guideMessage(env: Env, profile: RulesetProfile, freshRoles = false, legacyInviteQueue = true) {
  const officers = env.OFFICER_CHARACTERS || "High Council";
  const review = env.ADMISSION_MODE === "review";
  const role = !!env.ROLE_GUILD_MEMBER;
  const nickname = env.SET_NICKNAME === "true";
  const canonical=captureCanonicalRankConfig233(env).mode==='enabled';
  const invite = !legacyInviteQueue ? "" : review
    ? " If you are applying, High Council reviews the confirmed request before your invite enters the queue; High Council sends the invite from the game client when the guild has room."
    : " If you are applying, your invite enters the queue; High Council sends it from the game client when the guild has room.";
  const access = canonical
    ? " Your single highest applicable Olympus rank opens the member channels after the current verification and access checks pass; a second stacked Member role is not required."
    : freshRoles
    ? " Your guild roles open the member channels once your verified character appears on a current guild roster export and the access checks pass."
    : role
    ? " Your **Olympus Guild Member** role opens the member channels once your verified character appears on the High Council-exported guild roster and the access checks pass."
    : "";
  const nick = canonical ? " Use the nickname buttons below to choose your verified character and guild name, or restore your saved previous server nickname." : nickname ? " When enabled by guild staff, your Discord nickname updates to your verified character name." : "";
  return {
    embeds: [
      {
        title: role ? `Verify ${FLAGSHIP_GUILD_NAME} or check your guild access` : `Verify ${FLAGSHIP_GUILD_NAME}`,
        color: GOLD,
        description: [
          `${profile.phase === "public_direction" ? `${FLAGSHIP_GUILD_NAME} guild direction` : "Current game"}: **${rulesetLabel(profile)}**.`,
          "",
          legacyInviteQueue
            ? `For a character in, or applying to, ${FLAGSHIP_GUILD_NAME}. The website is optional for this verification flow.`
            : `Joining ${FLAGSHIP_GUILD_NAME}? Ask ${FLAGSHIP_GUILD_NAME} High Council for an in-game invite. The website invite queue is paused. Once your character is in ${FLAGSHIP_GUILD_NAME}, follow the steps below to link Discord. The website is optional for this verification flow.`,
          "",
          "**1. Get a code** — press **Get my code**. The bot shows the line to use in game. If the current High Council relay needs a character name first, enter it exactly as it appears in game.",
          `**2. Send it from your character** — log in as the character you want linked, paste the shown line into the in-game chat box and press Enter. It whispers the code to an available High Council relay (${officers}); the character that sends it is the one linked. Follow the bot's current instructions if no High Council relay is online; mailing the code to High Council works too.`,
          "",
          `The High Council relay addon confirms the code from that character.${invite}${access}${nick} Use **/verify-status** here for current server access. In game, **/olv status** shows delivery information; the Watcher roster display is a dated snapshot.`,
          `Already linked? **Get my code** refreshes your current trusted roster rank without another whisper. **My status** shows progress. For a different character, use **Verify another character**. Follow the current instructions, or ask High Council if access is on hold.`,
          "",
          visitorLine(env), // the overflow guilds (Olympus 2 and later) are not verified here; see visitorLine
          "Keep your verification code private. Never post passwords, authenticator codes, payment details or personal documents. The bot never sends you a DM.",
        ].join("\n"),
        footer: { text: `Olympus Verify · My status for progress · Ask ${FLAGSHIP_GUILD_NAME} High Council for account help` },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "Get my code", custom_id: GUIDE_VERIFY },
          { type: 2, style: 2, label: "My status", custom_id: GUIDE_STATUS },
          ...nicknameButtons233(),
          ...(!legacyInviteQueue?[{type:2,style:2,label:"Verify another character",custom_id:"guide:another"}]:[]),
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

/** Interaction response type 9: a modal with one text input for the character name. */
export const verifyModal = (env?:Env) => {
  const capture=env?captureLaunchVerification(env):null;
  const native=capture?.mode==='members-only'&&capture.scope!==null&&capture.current();
  return {
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
            min_length: native?3:2,
            max_length: 32,
            required: true,
            placeholder: "e.g. Fern Melder",
          },
        ],
      },
    ],
  },
  };
};

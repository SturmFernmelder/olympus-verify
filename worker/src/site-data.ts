/**
 * The guild site's fixed vocabulary and every rule about what a submission may contain (build .41, 29 Sep 2026;
 * .43, 30 Sep: raid roles split NA/EU, backup choices, the weekly availability grid, the voting board; .44, 30 Sep:
 * Leveling Lead, Liaison and PvP Team, and every role's description; .45, 30 Sep: the Co-Guild Master, roles chosen
 * without a public vote, and the professions an applicant plans to take; .46, 30 Sep: what each role comes with in
 * game).
 *
 * One file on purpose: the Worker validates with it and sends the same lists to the page (/api/me carries `meta`), so
 * the form can never offer a choice the server then refuses. Positions follow what the top raiding guilds recruit for
 * (guild master, raid leader and assists, class leads, recruitment/HR, community, loot council, bank), plus the jobs
 * the community's own org charts asked for (leveling at launch, relations with other guilds, a co-guild master), and
 * the plain ways in: raider, PvP team and member.
 */
import type { Env } from "./env";
import { normalizeCharacter } from "./codes";
import { resolveRulesetSnapshot, rulesetSwitchReadiness, type RulesetSnapshot } from "./ruleset-profile";
import { OFFICE_APPOINTMENTS, NATIVE_RANKS_199, APPLICATION_TRACKS_199 } from "./governance-offices";
import { ROYAL_WRIT_POLICY, ROYAL_WRITS, STOCKADES_CHECKLIST, ROYAL_WRIT_CATEGORIES } from './royal-writs199';
import { TALENT_SNAPSHOT_REVISION } from "./talent-build-contract";
import { TALENT_BUILD_COLLECTION_LIMITS } from "./talent-build-attachment";
import { reservedApplication201 } from './application-track199';
import { OFFICE_ROLE_GUIDES_201, NATIVE_RANK_GUIDES_201, roleGuides201 } from './site-role-guides201';
import { ROLE_DIRECTORY_203 } from './site-role-directory203';

/**
 * What a role is and what taking it on means (.44, 30 Sep 2026): the page shows it on the application form (each
 * choice's "Details"), above the role's voting board, and on the Roles page, so people know what they are applying for.
 * `about` says what the role is, `duties` what the holder does, `expect` what the guild expects of them, `time` roughly
 * how long it takes, `works` who they work with. Plain text: the page puts all of it on screen with textContent.
 *
 * `game` is informational guidance, not a grant of ranks, permissions or AddOn access. The current native ladder
 * is Leader, High Council, Officer, Officer Alt, Raid Leader, Veteran, Raider, Member, Alt and Initiate.
 * Co-Guild Master and Treasurer are appointments within Leader / High Council, not additional native ranks.
 * Historical position copy below is projected through the current rank catalogue before publication.
 * The website recommendation does not apply a native permission preset. Historical High Council signer and
 * role bindings remain separately qualified. No numeric bank allowances have been approved.
 * The current in-game ladder is not certified here. Each Guild Master must review and configure ranks and bank
 * permissions in an attended session. Application choices do not change the native ladder or AddOn permissions.
 */
export interface RoleInfo { about: string; duties: string[]; expect: string[]; time: string; works?: string; game: string }
export interface Position { key: string; label: string; group: "leadership" | "membership"; blurb: string; raidTime?: "na" | "eu"; info: RoleInfo }

/** NA and EU raid evenings, as the page describes them (the hours themselves are PRIME below). */
const NA_EVENINGS = "evenings Eastern time, about 7 pm to midnight (4 to 9 pm Pacific)";
const EU_EVENINGS = "evenings Central European time, about 7 pm to midnight (6 to 11 pm UK)";

/** The two raid roles read the same for NA and EU but for the region and its evenings. */
const raidLeaderInfo = (region: string, evenings: string): RoleInfo => ({
  about: `The Raid Leader plans and calls Olympus's ${region} raids, ${evenings}. Once the pull timer starts, yours is the voice the raid follows, whether its encounter calls for 10, 20 or 40 players.`,
  duties: [
    "Set your region's raid schedule with the officers, and post it well ahead.",
    "Learn every fight first and explain it before the pull: strategy, positions, assignments.",
    "Build each raid from the sign-ups, with your Raid Assists and the Class Leads.",
    "Call the raid: pulls, wipes, pace and breaks.",
    "Go over what went wrong after a hard night, and fix it for the next one.",
    "Work with the Loot Council so loot follows the published rules.",
  ],
  expect: [
    "At nearly every raid in your region, on time and prepared.",
    "A microphone and a clear, steady voice.",
    "You know the encounters and every class's job in them, or learn them first.",
    "No flaming after a wipe: you correct people without humiliating them.",
  ],
  time: "Your region's raid nights, plus 2 to 3 hours of preparation a week.",
  works: "The Raid Assists, the Class Leads, the Loot Council and the officers.",
  game: "Post-beta guidance: Raid Leader includes officer chat and notes, Invite Member, Guild Bank Repair and the authenticator safeguard. The Guild Master must review and set rank permissions, raid-tab access and bank limits in game.",
});
const raidAssistInfo = (region: string, evenings: string): RoleInfo => ({
  about: `The Raid Assist is the Raid Leader's second in command for the ${region} raids, ${evenings}. You keep the raid running so the Raid Leader can focus on the fight.`,
  duties: [
    "Send the raid invites and sort the groups.",
    "Set the marks and hand out assignments: tanks, healers, interrupts, crowd control.",
    "Track attendance: who came, who was late, who sat out.",
    "Help with loot when the Raid Leader asks.",
    "Lead the raid yourself when the Raid Leader can't be there.",
  ],
  expect: [
    "At nearly every raid in your region, early enough to set up.",
    "A microphone, and ready to call the raid if you have to.",
    "You know the fights as well as the Raid Leader does.",
  ],
  time: "Your region's raid nights, plus about an hour of setup a week.",
  works: "The Raid Leader, the Loot Council and the Class Leads.",
  game: "Post-beta guidance: Raid Assist is an appointment, not a separate native rank. The planning crosswalk recommends Raid Leader (Slot 5), subject to separate Guild Master review; the appointment grants no rank, permissions or AddOn access. The holder keeps their current rank until an attended Guild Master decision. If assigned Raid Leader to stand in, the same authenticator safeguard applies; raid assistant is assigned within each raid.",
});

const HISTORICAL_POSITION_COPY: Position[] = [
  {
    // .45: most of the rank drafts in the community's Rank Codex had one. Out of the box it is chosen without a public
    // vote (SiteSettings.noVote): a second in command is the Guild Master's pick, not a popularity contest.
    key: "co_gm", label: "Co-Guild Master", group: "leadership", blurb: "Asmongold's second in command in Olympus: keeps the guild running day to day and leads the officers when he is offline.",
    info: {
      about: "Only one character can hold a guild's Guild Master rank, and in Olympus that is Asmongold, who cannot be online every evening. The Co-Guild Master is his second in command: they keep Olympus running day to day, lead the officers, and make the calls that cannot wait when he is away.",
      duties: [
        "Lead the officers: share out the work, run the officer meetings, and make sure every lead has what they need.",
        "Make the day-to-day calls that cannot wait, and tell Asmongold and the officers what you decided and why.",
        "Keep the ranks, permissions and guild bank access in order with the Guild Master, who sets them in game.",
        "Work with the Guild Masters of the other Olympus guilds on the rules and events all the guilds share.",
        "Take the hardest cases: appeals, disputes between officers, and removing well-known members.",
      ],
      expect: [
        "Online most evenings, NA or EU, and reachable on Discord every day.",
        "An authenticator on your Battle.net account, and two-factor authentication on Discord.",
        "Someone Asmongold and the officers already know and trust.",
        "Calm and fair in public, with disagreements raised privately: you speak for Asmongold's guild.",
        "In it for the long run: the guild leans on you.",
      ],
      time: "15 hours a week or more, most of it in the evenings.",
      works: "Asmongold, the officers and every lead, and the Guild Masters of the other Olympus guilds.",
      game: "Recommended post-beta placement: Co-Guild Master is a core High Council appointment alongside Guild Master and Treasurer, mapped to High Council in native Slot 2. This is a planning recommendation, not verification of the holder’s current game rank. The Guild Master must appoint the holder and review any delegation in game. Applying here grants no rank, bank permission or AddOn access.",
    },
  },
  {
    key: "guild_master", label: "Guild Master (Olympus 2 and later)", group: "leadership", blurb: "Leads one of the Olympus guilds after the first: its rules, its officers, its roster. Answers to the Olympus leadership.",
    info: {
      about: "Olympus uses a 1,000-character branch planning boundary; the current Forever game cap has not been independently verified here. To organize demand, the community plans several guilds: Olympus 2, Olympus 3 and so on. Each needs a Guild Master who holds the top rank in game, leads it day to day, and answers to the Olympus leadership.",
      duties: [
        "Found your guild at launch: the charter and its signatures, the tabard, and ranks and permissions set up the way Olympus does it.",
        "Pick your officers with the Olympus leadership, and hold them to the same rules as everyone else.",
        "Run your roster: invites, promotions, and removals when the guild is full.",
        "Enforce the Olympus rules in your guild, and settle what your officers cannot.",
        "Speak for your guild to the Olympus leadership and the other Guild Masters: shared events, raids, and problems that cross guilds.",
      ],
      expect: [
        "Online most evenings, NA or EU, and a lot in the first weeks after launch.",
        "An authenticator on your Battle.net account.",
        "Calm and fair in public: you represent Asmongold's community.",
        "You follow the Olympus leadership's decisions, and raise disagreements privately.",
        "In it for the long run: a guild needs its leader.",
      ],
      time: "15 hours a week or more, most of it in the evenings.",
      works: "The Olympus leadership, your officers and the other Guild Masters.",
      game: "Post-beta guidance: the Guild Master holds the top native rank of their own guild and configures its ranks and permissions in game. This description does not certify the current setup or grant AddOn access.",
    },
  },
  {
    key: "officer", label: "Officer", group: "leadership", blurb: "Runs the guild day to day: invites, disputes, rules, events, and the calls nobody else wants to make.",
    info: {
      about: "Officers run Olympus day to day. You are the one members come to with a question, a problem or a report, and you have the rank in game to act on it.",
      duties: [
        "Invite players who have linked their character, working through the guild's invite queue.",
        "Answer questions and settle disputes before they turn into drama.",
        "Enforce the rules: warnings and, when it comes to that, removals.",
        "Keep officer notes current, and promote and demote by the guild's rules.",
        "Help the leads with raids, events and recruitment when they need a hand.",
        "Take part in officer decisions, and keep them confidential.",
      ],
      expect: [
        "Online most evenings in your region, NA or EU.",
        "An authenticator on your Battle.net account.",
        "In the officer channels on Discord regularly, with a microphone for raids and meetings.",
        "Fair to everyone, friends included, and calm under pressure.",
        "What is said in officer channels and notes stays there.",
      ],
      time: "About 8 to 15 hours a week.",
      works: "The Guild Master, the other officers and every lead.",
      game: "Recommended post-beta placement: Officer occupies native Slot 4, below Guild Master, High Council and Treasurer. This is a planning recommendation, not verification of the holder’s current game rank. The Guild Master must review and set permissions in game; applying here grants no rank or AddOn access.",
    },
  },
  { key: "raid_leader_na", label: "Raid Leader (NA raids)", group: "leadership", raidTime: "na", blurb: `Plans and calls the North American raids, ${NA_EVENINGS}: strategy, assignments and pace for the encounter's 10-, 20- or 40-player group.`, info: raidLeaderInfo("North American", NA_EVENINGS) },
  { key: "raid_leader_eu", label: "Raid Leader (EU raids)", group: "leadership", raidTime: "eu", blurb: `Plans and calls the European raids, ${EU_EVENINGS}: strategy, assignments and pace for the encounter's 10-, 20- or 40-player group.`, info: raidLeaderInfo("European", EU_EVENINGS) },
  { key: "raid_assist_na", label: "Raid Assist (NA raids)", group: "leadership", raidTime: "na", blurb: `Backs up the NA raid leader, ${NA_EVENINGS}: marks, assignments, invites, loot and attendance.`, info: raidAssistInfo("North American", NA_EVENINGS) },
  { key: "raid_assist_eu", label: "Raid Assist (EU raids)", group: "leadership", raidTime: "eu", blurb: `Backs up the EU raid leader, ${EU_EVENINGS}: marks, assignments, invites, loot and attendance.`, info: raidAssistInfo("European", EU_EVENINGS) },
  {
    key: "class_lead", label: "Class Lead", group: "leadership", blurb: "The go-to expert for one class: builds, consumables, gear advice and helping players improve.",
    info: {
      about: "Each class has one Class Lead: the go-to expert for everyone who plays it. You help them get better, and you help the Raid Leaders use the class well.",
      duties: [
        "Keep a short guide for your class up to date on Discord: talents, gear, consumables and rotations.",
        "Answer your class's questions and help newer players improve.",
        "Work out your class's raid jobs with the Raid Leaders and Assists of both regions: buffs, curses and the like.",
        "Check your class's gear and consumables before progress raids, and say when something is missing.",
        "Tell the Loot Council which items matter most for your class.",
      ],
      expect: [
        "You know your class inside out, and keep up as Forever changes it.",
        "You raid regularly in one region, and keep in touch with your class's players in the other.",
        "Patient with new players: you help them rather than gatekeep.",
      ],
      time: "About 3 to 5 hours a week besides raiding.",
      works: "The Raid Leaders and Assists, the Loot Council and the Profession Coordinator.",
      game: "Class Lead is an appointment, not an extra native rank. The planning crosswalk recommends Officer (Slot 4), subject to the Guild Master’s separate review. The appointment itself grants no rank, permissions or AddOn access.",
    },
  },
  {
    key: "recruitment", label: "Recruitment Officer", group: "leadership", blurb: "Finds and vets new members, runs trials and keeps the roster healthy.",
    info: {
      about: "More people want a place in Olympus than it has room for. The Recruitment Officer makes sure the places go to the right people, and keeps the roster healthy once they are in.",
      duties: [
        "Go through applications with the officers, and talk to applicants on Discord.",
        "Run trials for raiders, and report back to the Raid Leaders.",
        "Keep the waiting list moving: who is next, who went quiet, who joined.",
        "When the guild is full, help the officers decide which inactive members make room.",
        "Help new members settle in during their first week.",
      ],
      expect: [
        "Good judgment and discretion: what applicants tell the leadership privately stays private.",
        "On Discord several days a week.",
        "Fair to every applicant, friends included.",
      ],
      time: "About 5 to 10 hours a week, more around launch.",
      works: "The officers, the Raid Leaders and the Guild Master.",
      game: "Post-beta guidance: Recruitment Officer is an appointment using Officer permissions approved by the Guild Master. Inviting or removing members requires the character's configured in-game permissions; applying here does not grant them.",
    },
  },
  {
    key: "community", label: "Community & Events Lead", group: "leadership", blurb: "Guild events, contests and social nights; keeps the Olympus channels friendly.",
    info: {
      about: "The Community & Events Lead makes Olympus more than a raid roster: guild events, contests and social nights, and a welcoming tone in the Olympus channels.",
      duties: [
        "Plan a regular calendar of guild events: races, contests, costume nights, world boss outings.",
        "Run events, or find someone who will, and announce them well ahead.",
        "Write guild announcements, and keep the event calendar current.",
        "Keep the Olympus channels welcoming, with the moderators.",
        "Collect members' ideas and feedback, and act on the good ones.",
      ],
      expect: [
        "Organized: what you announce actually happens.",
        "Comfortable talking to a crowd in voice chat.",
        "Around for most of the events you schedule.",
      ],
      time: "About 4 to 8 hours a week.",
      works: "The officers, the Discord Moderators, the Leveling Lead and the PvP Leader.",
      game: "Community & Events Lead is an appointment, not an extra native rank. The planning crosswalk recommends Member (Slot 8); actual rank and any AddOn delegation remain separately assigned.",
    },
  },
  {
    key: "leveling", label: "Leveling Lead", group: "leadership", blurb: "Organizes leveling groups and dungeon runs at launch, and helps newcomers and alts catch up after.",
    info: {
      about: "When Forever launches, everyone starts at level 1. The Leveling Lead turns a thousand people leveling alone into groups that level together, and later helps newcomers and alts catch up.",
      duties: [
        "Organize leveling groups by level range and time zone, above all in the first weeks.",
        "Set up dungeon runs and groups for elite quests as people reach them.",
        "Keep a leveling guide current on Discord: routes, zones, and what is new in Forever.",
        "Pair new and returning players with experienced ones.",
        "Plan leveling events, like a race to level 10 or a dungeon night.",
      ],
      expect: [
        "Playing a lot at launch: you are leveling too, in NA or EU hours.",
        "You know the old world well, and learn Forever's changes fast.",
        "Patient and encouraging with new players.",
      ],
      time: "About 5 to 10 hours a week in the first month besides your own leveling, then less.",
      works: "The Community & Events Lead, the Class Leads and the Profession Coordinator.",
      game: "No rank of its own. In the Olympus addon, a Hand of the King if he names you, to put leveling groups on the King's week.",
    },
  },
  {
    key: "pvp_leader", label: "PvP Leader", group: "leadership", blurb: "Organizes optional battlegrounds and agreed competitive events. Olympus plays PvE · Alliance.",
    info: {
      about: "Olympus follows a PvE ruleset direction, as Alliance. The PvP Leader organizes optional battlegrounds and competitive events under the guild's conduct rules; participation never changes the server ruleset.",
      duties: [
        "Lead optional scheduled battleground premades and agreed competitive events, and call targets in voice chat.",
        "Arrange opt-in practice and agreed team events without changing the guild’s PvE ruleset direction.",
        "Schedule regular PvP nights and battleground premades.",
        "Keep the PvP Team's roster and roles current.",
        "Work out the guild's PvP conduct with the officers, and deal with other guilds through the Liaison.",
      ],
      expect: [
        "Experience leading PvP groups, and a cool head in chaos.",
        "Around in the evenings, NA or EU, when the fights happen.",
        "A microphone for calls.",
      ],
      time: "About 5 to 10 hours a week.",
      works: "The PvP Team, the officers and the Liaison.",
      game: "PvP Leader is an optional activity appointment, not an extra native rank. The planning crosswalk recommends Raid Leader (Slot 5), subject to separate Guild Master review; no rank, permissions or AddOn access follows from this title.",
    },
  },
  {
    key: "liaison", label: "Liaison", group: "leadership", blurb: "Speaks for Olympus to other guilds, the other Olympus guilds included, and keeps the peace within the shared PvE community.",
    info: {
      about: "The Liaison speaks for Olympus to other guilds: the other Olympus guilds, and the wider ruleset community, Horde included. Within the shared PvE ruleset, good relations prevent a lot of trouble.",
      duties: [
        "Be the day-to-day contact for the other Olympus guilds: news, shared events and problems, so their Guild Masters always know whom to ask.",
        "Be the contact for other guilds' leaders: world bosses, raid times and shared events.",
        "Sort out incidents with other guilds, such as griefing, stolen kills or ninja pulls, calmly and with the officers.",
        "Keep a list of who leads the other guilds and how to reach them.",
        "Tell the leadership what is going on outside Olympus.",
      ],
      expect: [
        "Diplomatic and patient, even when the other side is not.",
        "You never make promises for Olympus without the leadership's go-ahead.",
        "On Discord regularly, and comfortable talking to strangers.",
      ],
      time: "About 2 to 5 hours a week.",
      works: "The Guild Master and officers, the PvP Leader and the other Olympus guilds.",
      game: "Post-beta guidance: Liaison is an appointment, not a separate native rank. Any Officer rank, private channel or AddOn access must be assigned and reviewed separately; applying here does not grant them.",
    },
  },
  {
    key: "loot_council", label: "Loot Council", group: "leadership", blurb: "Decides contested loot fairly, openly and by the published rules.",
    info: {
      about: "When more than one raider needs the same item, the Loot Council decides who gets it, openly and by the guild's published loot rules.",
      duties: [
        "Decide contested items quickly during the raid, by the published rules.",
        "Keep the loot record: who got what, and why.",
        "Explain decisions openly and politely when asked.",
        "Review the loot rules with the officers when they need to change.",
      ],
      expect: [
        "At most raids in your region.",
        "You step aside from any decision about your own loot or your close friends'.",
        "A thick skin: someone will always disagree.",
      ],
      time: "Raid nights, plus about an hour a week on the record.",
      works: "The Raid Leaders and Assists, and the Class Leads.",
      game: "Loot Council is an appointment, not an extra native rank. The planning crosswalk recommends Raid Leader (Slot 5), subject to separate Guild Master review; no rank, bank permission or AddOn access follows from this title.",
    },
  },
  {
    key: "treasurer", label: "Treasurer / Guild Bank", group: "leadership", blurb: "Guild bank, consumables and repairs: what comes in, what goes out, and why.",
    info: {
      about: "The Treasurer looks after the guild's gold and the guild bank: what comes in, what goes out, and why.",
      duties: [
        "Propose the bank's tabs, who can take what, and the daily limits; the Guild Master sets them in game.",
        "Record the gold coming in and going out, and keep a ledger members can check.",
        "Budget repairs and raid consumables with the Raid Leaders and the Profession Coordinator.",
        "Buy what the guild needs, and sell what it does not.",
        "Report to the leadership regularly.",
      ],
      expect: [
        "An authenticator on your Battle.net account.",
        "Complete honesty: guild gold is never lent, spent or moved privately.",
        "Open books: anything you do with the bank can be explained.",
      ],
      time: "About 3 to 6 hours a week.",
      works: "The Guild Master, the officers, the Raid Leaders and the Profession Coordinator.",
      game: "Recommended post-beta placement: Treasurer occupies native Slot 3 (zero-based slot 2) above Officer and is a core High Council appointment alongside Guild Master and Co-Guild Master. This is a planning recommendation, not verification of the holder’s current game rank. A qualified account association is shown through the appointment-identity listing; a legacy typed entry is a staff-entered label, not verified identity or game-rank proof. The Guild Master must review bank permissions and limits in game; the website recommendation grants none.",
    },
  },
  {
    key: "professions", label: "Profession Coordinator", group: "leadership", blurb: "Maps crafters and recipes and organizes crafting for raids.",
    info: {
      about: "The Profession Coordinator knows who can craft what in Olympus, and makes sure the raids have what they need.",
      duties: [
        "Keep a list of crafters, their professions and their rare recipes.",
        "Organize raid consumables (flasks, potions, food) and gear crafts with the Raid Leaders.",
        "Match members who need a craft with someone who can make it.",
        "Coordinate gathering and materials for guild projects, with the Treasurer.",
        "Point members toward the professions the guild is short of.",
      ],
      expect: [
        "You know Forever's professions and recipes well.",
        "Organized: lists, requests and deadlines.",
        "Around several days a week, NA or EU.",
      ],
      time: "About 3 to 6 hours a week.",
      works: "The Treasurer, the Raid Leaders and the Class Leads.",
      game: "Profession Coordinator is an appointment. The planning crosswalk recommends Officer (Slot 4), subject to separate Guild Master review; no rank or bank access is granted here. Craft listings remain each crafter’s separate choice.",
    },
  },
  {
    key: "moderator", label: "Discord Moderator", group: "leadership", blurb: "Keeps the Olympus channels in Asmongold's server clean and civil.",
    info: {
      about: "Discord Moderators keep the Olympus channels in Asmongold's Discord server clean and civil, so members can talk without wading through spam or fights.",
      duties: [
        "Watch the Olympus channels, and remove spam, scams and abuse.",
        "Handle reports and tickets, and warn or time out people who break the rules.",
        "Pass problems that happen in game on to the officers.",
        "Follow the server's own rules, and work with Asmongold's moderators.",
        "Keep a record of the actions you take.",
      ],
      expect: [
        "Two-factor authentication on your Discord account.",
        "Calm and impartial, friends included, and no public arguments.",
        "Checking in most days, at different times of day.",
      ],
      time: "About 3 to 6 hours a week, spread out.",
      works: "The officers and Asmongold's moderators.",
      game: "Discord Moderator is a Discord appointment, not an in-game rank. The planning crosswalk recommends Member (Slot 8); the office itself grants no native rank or new permissions.",
    },
  },
  {
    key: "raider", label: "Raider", group: "membership", blurb: "Raid nights with prepared gear, consumables and steady attendance.",
    info: {
      about: "Raiders are the core of Olympus's raid teams, NA or EU. A place on the team is earned through attendance and preparation.",
      duties: [
        "Sign up for raids, and show up on time.",
        "Come prepared: consumables, repaired gear, and the fight read beforehand.",
        "Follow the Raid Leader's calls and your assignments.",
        "Keep improving, with your Class Lead's help.",
      ],
      expect: [
        "At most raid nights in your region.",
        "On Discord voice chat during raids: listening is enough.",
        "You accept loot decisions made by the published rules.",
      ],
      time: "Your region's raid nights.",
      works: "The Raid Leaders and Assists, and your Class Lead.",
      game: "Recommended post-beta placement: Raider in the current ten-rank plan. Bank repairs and raid-tab access need attended Guild Master review; this is not verification of active permissions or a game rank. The historical beta five-rank profile remains separate.",
    },
  },
  {
    key: "pvp_team", label: "PvP Team", group: "membership", blurb: "Optional battleground premades and agreed competitive events with the PvP Leader.",
    info: {
      about: "The PvP Team organizes opt-in battlegrounds, premades and agreed competitive events within Olympus's PvE ruleset direction.",
      duties: [
        "Join the PvP Leader's scheduled events when you choose to take part.",
        "Join the scheduled PvP nights and battleground premades.",
        "Follow the target calls in voice chat.",
        "Keep your PvP gear and consumables ready.",
      ],
      expect: [
        "Around some evenings in your region.",
        "On Discord voice chat for fights: listening is enough.",
        "You play by the guild's rules in PvP too: you represent Olympus.",
      ],
      time: "A couple of evenings a week, plus calls when the guild needs help.",
      works: "The PvP Leader.",
      game: "The Member rank, or Raider if you raid too.",
    },
  },
  {
    key: "member", label: "Member", group: "membership", blurb: "Play with the guild at your own pace: leveling, dungeons, events.",
    info: {
      about: "Members are the heart of Olympus: play with the guild at your own pace, whether that is leveling, dungeons, events or whatever you enjoy.",
      duties: [
        "Keep your character linked to your Discord account: it is how the guild knows who you are.",
        "Join guild groups, events and chat whenever you like.",
        "Help other members when you can.",
      ],
      expect: [
        "You follow the guild rules, in game and on Discord.",
        "You stay active: Olympus plans up to 1,000 characters per branch; actual game capacity is separately unverified, so when it is full, characters that stop logging in can be removed to make room, low-level ones soonest.",
        "You treat everyone with respect: you represent Asmongold's guild.",
      ],
      time: "No minimum.",
      game: "Recommended post-beta placement: Member, with new invites planned to start as Initiate. This is the current ten-rank recommendation, not an observed game rank or automatic promotion. The historical beta five-rank profile remains separate.",
    },
  },
];
/** Current guide uses one .199 ladder; these mappings do not certify or change the game client. */
const OFFICE_APPLICATION_POSITIONS_199: Position[] = OFFICE_APPOINTMENTS
  .filter(row => /^office_[0-9]{2}$/.test(row.key) && row.applicationEligible && ['officer', 'high_council'].includes(row.applicationTrack))
  .filter(row => row.applicationRoleKeys.includes(row.key))
  .filter(row => !HISTORICAL_POSITION_COPY.some(position => position.key === row.key))
  .map(row => {
    const guide = OFFICE_ROLE_GUIDES_201[row.key];
    return { key: row.key, label: row.applicationLabel || row.label, group: 'leadership', blurb: guide.definition,
      info: { about: guide.definition, duties: [...guide.responsibilities], expect: [...guide.expectations], time: guide.commitment, works: guide.worksWith, game: guide.boundaries } };
  });
export const POSITIONS: Position[] = [...HISTORICAL_POSITION_COPY, ...OFFICE_APPLICATION_POSITIONS_199].map(position => {
  const office = OFFICE_APPOINTMENTS.find(row => row.key === position.key)
    ?? (position.key === 'class_lead' ? OFFICE_APPOINTMENTS.find(row => row.group === 'class') : undefined);
  const rank = office ? NATIVE_RANKS_199.find(row => row.nativeSlot === office.nativeSlot) : NATIVE_RANKS_199[7];
  const game = rank ? `Rank ${rank.nativeRankOrdinal} ${rank.name} (zero-based slot ${rank.nativeSlot}). This is not verification of the holder’s current game rank. Co-Guild Master and Treasurer are appointments, not additional native ranks. Applying grants no rank, moderation, bank permission or addon access; the Guild Master reviews actual game permissions separately.` : 'Actual rank and permissions require separate Guild Master review.';
  return { ...position, info: { ...position.info, game } };
});
export const POSITION_KEYS = new Set(POSITIONS.map((p) => p.key));
const POSITION_BY_KEY = new Map(POSITIONS.map((p) => [p.key, p]));
export const isLeadership = (position: string) => POSITION_BY_KEY.get(position)?.group === "leadership";

/**
 * Before .43 there was one Raid Leader and one Raid Assist. schema.ts moves those applications to NA or EU by the
 * region the applicant gave; this is the same rule for anything still sending the old key (a page open since then).
 */
export function currentPosition(position: string, region: string | null | undefined): string {
  if (position === "raid_leader" || position === "raid_assist") return `${position}_${region === "eu" ? "eu" : "na"}`;
  return position;
}

export interface ClassInfo { key: string; label: string; color: string }
/** Class colours are the game's standard ones. */
export const CLASSES: ClassInfo[] = [
  { key: "warrior", label: "Warrior", color: "#C69B6D" },
  { key: "paladin", label: "Paladin", color: "#F48CBA" },
  { key: "hunter", label: "Hunter", color: "#AAD372" },
  { key: "rogue", label: "Rogue", color: "#FFF468" },
  { key: "priest", label: "Priest", color: "#FFFFFF" },
  { key: "shaman", label: "Shaman", color: "#0070DD" },
  { key: "mage", label: "Mage", color: "#3FC7EB" },
  { key: "warlock", label: "Warlock", color: "#8788EE" },
  { key: "druid", label: "Druid", color: "#FF7C0A" },
];
const CLASS_KEYS = new Set(CLASSES.map((c) => c.key));

export const ROLES = [
  { key: "tank", label: "Tank" },
  { key: "healer", label: "Healer" },
  { key: "dps", label: "Damage" },
  { key: "flex", label: "Flexible" },
];
export const REGIONS = [
  { key: "na_east", label: "North America: Eastern" },
  { key: "na_central", label: "North America: Central" },
  { key: "na_mountain", label: "North America: Mountain" },
  { key: "na_west", label: "North America: Pacific" },
  { key: "latam", label: "Latin America" },
  { key: "eu", label: "Europe" },
  { key: "oce", label: "Oceania" },
  { key: "asia", label: "Asia" },
  { key: "other", label: "Somewhere else" },
];
export const HOURS = [
  { key: "lt5", label: "Under 5 hours a week" },
  { key: "5to10", label: "5 to 10 hours" },
  { key: "10to20", label: "10 to 20 hours" },
  { key: "gt20", label: "More than 20 hours" },
];
export const VOICE = [
  { key: "yes", label: "Yes, with a microphone" },
  { key: "listen", label: "I can listen, not speak" },
  { key: "no", label: "No" },
];

/**
 * Forever's professions (.45): the original game's, so no Jewelcrafting or Inscription. A character learns at most two
 * primary ones; the three secondary ones come on top. The application asks which the applicant plans to take on their
 * main (optional, stored with the answers as `professions`, keys in this list's order), so the Profession Coordinator
 * can see who will craft what before launch. Only the leadership sees them. `icon` is the art in static/wow/.
 */
export interface Profession { key: string; label: string; kind: "primary" | "secondary"; icon: string }
export const PROFESSIONS: Profession[] = [
  { key: "alchemy", label: "Alchemy", kind: "primary", icon: "prof-alchemy" },
  { key: "blacksmithing", label: "Blacksmithing", kind: "primary", icon: "prof-blacksmithing" },
  { key: "enchanting", label: "Enchanting", kind: "primary", icon: "prof-enchanting" },
  { key: "engineering", label: "Engineering", kind: "primary", icon: "prof-engineering" },
  { key: "herbalism", label: "Herbalism", kind: "primary", icon: "prof-herbalism" },
  { key: "leatherworking", label: "Leatherworking", kind: "primary", icon: "prof-leatherworking" },
  { key: "mining", label: "Mining", kind: "primary", icon: "prof-mining" },
  { key: "skinning", label: "Skinning", kind: "primary", icon: "prof-skinning" },
  { key: "tailoring", label: "Tailoring", kind: "primary", icon: "prof-tailoring" },
  { key: "cooking", label: "Cooking", kind: "secondary", icon: "prof-cooking" },
  { key: "first_aid", label: "First Aid", kind: "secondary", icon: "prof-first_aid" },
  { key: "fishing", label: "Fishing", kind: "secondary", icon: "prof-fishing" },
];
const PROFESSION_BY_KEY = new Map(PROFESSIONS.map((p) => [p.key, p]));
export const professionOf = (key: string) => PROFESSION_BY_KEY.get(key);

/**
 * Free-text answers stored in site_applications.answers. `leadership` ones are asked when any of the choices is a
 * leadership role. `board` ones are shown on the voting board with the applicant's name; the rest stay with the admins.
 * (Before .43 there was also a free-text "availability" answer; old applications keep it, the grid replaced it.)
 */
export interface Question { key: string; label: string; max: number; required: boolean; leadership?: boolean; board?: boolean; long: boolean; hint?: string }
export const QUESTIONS: Question[] = [
  { key: "experience", label: "Your World of Warcraft experience", hint: "Guilds, raids, roles you have held. Classic, retail, private servers: all of it counts.", max: 1500, required: true, board: true, long: true },
  { key: "why", label: "Why Olympus, and what would you bring?", max: 1500, required: true, board: true, long: true },
  { key: "leadership", label: "Tell us about a time you led people", hint: "In WoW or anywhere else. What went wrong, and what did you do?", max: 1500, required: true, leadership: true, board: true, long: true },
  { key: "scenario", label: "Two raiders start arguing in guild chat about a loot call, and it is getting personal. What do you do?", max: 1500, required: true, leadership: true, board: true, long: true },
  { key: "logs", label: "Logs or armory link", hint: "Optional. A Warcraft Logs link or similar.", max: 200, required: false, long: false },
  { key: "talentBuild", label: "Talent build attachment", hint: "Optional. Paste a current Olympus talent build code or its shared link. It stays with the guild's leadership and must match your selected class.", max: 512, required: false, long: false },
  { key: "extra", label: "Anything else we should know?", hint: "Optional.", max: 1000, required: false, long: true },
];
export const BOARD_ANSWERS = QUESTIONS.filter((q) => q.board).map((q) => q.key);

// ---------- leadership roles: what the board and the nominations are about ----------

/**
 * A role is a leadership position, with Class Lead split per class ("class_lead:mage"). The voting board and the
 * write-in nominations both use these keys; so do an application's backup choices.
 */
export interface Ballot { key: string; label: string; seats: number; group: "leadership" | "class"; position: string; classLead: string | null }
const SEATS: Record<string, number> = {
  co_gm: 1, guild_master: 3, officer: 3, raid_leader_na: 2, raid_leader_eu: 2, raid_assist_na: 2, raid_assist_eu: 2,
  recruitment: 1, community: 1, leveling: 2, pvp_leader: 1, liaison: 1, loot_council: 3, treasurer: 1, professions: 1, moderator: 2,
};
/** Every leadership role, then one Class Lead per class. `seats` is how many write-in picks one voter has. */
export const BALLOTS: Ballot[] = [
  ...POSITIONS.filter((p) => p.group === "leadership" && p.key !== "class_lead").map((p) => ({ key: p.key, label: p.label, seats: SEATS[p.key] ?? 1, group: "leadership" as const, position: p.key, classLead: null })),
  ...CLASSES.map((c) => ({ key: `class_lead:${c.key}`, label: `${c.label} Class Lead`, seats: 1, group: "class" as const, position: "class_lead", classLead: c.key })),
];
const BALLOT_BY_KEY = new Map(BALLOTS.map((b) => [b.key, b]));
export const ballotOf = (key: string) => BALLOT_BY_KEY.get(key);

/** The role key of a choice: the position, or "class_lead:<class>". */
export const roleKeyOf = (position: string, classLead: string | null | undefined) => (position === "class_lead" && classLead ? `class_lead:${classLead}` : position);

/** Any choice an application can name, as a role key: every position (Class Lead per class) except plain Member. */
export function choiceOf(key: string): { key: string; position: string; classLead: string | null; label: string; leadership: boolean } | null {
  if (key.startsWith("class_lead:")) {
    const cls = key.slice("class_lead:".length);
    const c = CLASSES.find((x) => x.key === cls);
    return c ? { key, position: "class_lead", classLead: cls, label: `Class Lead (${c.label})`, leadership: true } : null;
  }
  const p = POSITION_BY_KEY.get(key);
  if (!p || p.key === "class_lead" || p.key === "member") return null;
  return { key, position: p.key, classLead: null, label: p.label, leadership: p.group === "leadership" };
}

/** A role key as people read it, old keys included. */
export function roleLabel(key: string): string {
  if (key === "raid_leader") return "Raid Leader (before the NA/EU split)";
  if (key === "raid_assist") return "Raid Assist (before the NA/EU split)";
  if (key === "class_lead") return "Class Lead";
  return choiceOf(key)?.label ?? POSITION_BY_KEY.get(key)?.label ?? OFFICE_APPOINTMENTS.find(office => office.key === key)?.label ?? key;
}

export const LIMITS = { friends: 10, reserved: 3, references: 3, backups: 2, reason: 200, friendNote: 100, label: 80, typedName: 40, primaryProfessions: 2 };

// ---------- availability: the weekly grid ----------

/**
 * When someone can play is 168 hours of a week in UTC (hour 0 = Monday 00:00 UTC), stored as 42 hex digits: digit i
 * holds hours 4i..4i+3, the first of them in its highest bit. The page shows the grid in each viewer's own time zone
 * and converts with that zone's offset in the week of 9 November 2026 (after launch, winter time on both sides of the
 * Atlantic), so the same evening means the same hours whether someone applied in September or December.
 */
export const AVAIL_HOURS = 168;
export const AVAIL_HEX = /^[0-9a-f]{42}$/;
export const AVAIL_REFERENCE = Date.UTC(2026, 10, 11, 12) / 1000; // Wednesday 11 Nov 2026, noon UTC

export function availBits(hex: string | null | undefined): number[] | null {
  if (!hex || !AVAIL_HEX.test(hex)) return null;
  const out: number[] = [];
  for (const d of hex) {
    const v = parseInt(d, 16);
    out.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
  }
  return out;
}

export function availHex(bits: number[]): string {
  let s = "";
  for (let i = 0; i < AVAIL_HOURS; i += 4) s += ((bits[i] ? 8 : 0) | (bits[i + 1] ? 4 : 0) | (bits[i + 2] ? 2 : 0) | (bits[i + 3] ? 1 : 0)).toString(16);
  return s;
}

/**
 * Raid evenings in UTC hours of the reference week: NA 19:00-24:00 Eastern (UTC-5 in winter) is 00:00-05:00 UTC of the
 * next day; EU 19:00-24:00 Central European (UTC+1) is 18:00-23:00 UTC. Seven evenings each, Monday first.
 */
const evenings = (fromUtcHour: number) => Array.from({ length: 7 }, (_, d) => Array.from({ length: 5 }, (_, h) => (d * 24 + fromUtcHour + h) % AVAIL_HOURS));
export const PRIME = { na: evenings(24), eu: evenings(18), min: 3 };

/** How many NA and EU raid evenings someone can make: at least three of that evening's five hours. */
export function fitFromBits(bits: number[]): { na: number; eu: number } {
  const count = (ev: number[][]) => ev.filter((hours) => hours.filter((h) => bits[h]).length >= PRIME.min).length;
  return { na: count(PRIME.na), eu: count(PRIME.eu) };
}
export function raidFit(hex: string | null | undefined): { na: number; eu: number } | null {
  const bits = availBits(hex);
  return bits ? fitFromBits(bits) : null;
}

/** An IANA time zone name as the browser reports it ("Europe/Stockholm"), or null. Only its shape is checked. */
export function cleanTimeZone(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^(?:[A-Za-z][A-Za-z0-9_+-]{0,30})(?:\/[A-Za-z0-9_+-]{1,30}){0,2}$/.test(s) ? s : null;
}

// ---------- settings (site_settings rows override these defaults) ----------

export interface SiteSettings {
  namesOpenAt: number;        // when Blizzard's name reservation opens: the countdown, and when the names form opens
  namesTimeConfirmed: boolean; // saved admin choice; absent defaults confirm only the announced North American hour
  namesOpen: boolean;         // entering names at all (still only from namesOpenAt)
  launchAt: number;           // the live launch; approved names are queued from then when autoQueue is on
  autoQueue: boolean;
  applicationsOpen: boolean;
  votingOpen: boolean;        // the voting board and the write-in nominations
  notice: string;             // a short announcement shown on every page ("" = none)
  appointed: Record<string, string>; // roles filled by appointment: role key -> who holds it, as members see it
  noVote: string[];           // roles that take applications but are chosen without a public vote (.45)
  newsOn: boolean;            // .115: the members' News page (site-news.ts); off until an administrator switches it on
  loginAnimation: boolean;    // owner-selected nonpersonal login artwork; approved stills by default
  royalWritsOn: boolean;      // .200: display the Royal Writs schedule only after an administrator enables it
}

/**
 * Roles filled by appointment rather than by the board (.43). An appointed role cannot be chosen on the application
 * form (first choice or backup), its board and its write-ins close, and members see who holds it. Admin -> Settings
 * edits the list; until it is first saved, the Treasurer is appointed: custody of the guild's gold is not a popularity
 * contest (Viktor, 30 Sep 2026).
 */
export const DEFAULT_APPOINTED: Record<string, string> = { treasurer: "Fernmelder" };

/** Website office records include the complete catalog and native-rank display slots; they confer no authority. */
export function cleanAppointed(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(v as Record<string, unknown>)) {
    const who = cleanText(name, 40);
    if (OFFICE_APPOINTMENTS.some(office => office.key === key) && who) out[key] = who;
  }
  return out;
}

/** Whether a role is appointed (own keys only: a role key never reaches Object.prototype). */
/** Only eligible leadership adapters share ballot seats; membership-form routes are not appointment identities. */
const applicationLeadershipSeat199 = (row: (typeof OFFICE_APPOINTMENTS)[number] | undefined) => !!row?.applicationEligible && ['officer', 'high_council'].includes(row.applicationTrack);
export const applicationSeatKeys199 = (key: string): readonly string[] => {
  const row = OFFICE_APPOINTMENTS.find(row => row.key === key);
  return applicationLeadershipSeat199(row) ? row!.applicationRoleKeys : [];
};
const applicationParent199 = (key: string) => OFFICE_APPOINTMENTS.find(row => /^office_\d{2}$/.test(row.key) && applicationLeadershipSeat199(row) && row.applicationRoleKeys.includes(key));
export const isAppointed = (s: { appointed: Record<string, string> }, key: string): boolean => {
  const owns = (k: string) => Object.prototype.hasOwnProperty.call(s.appointed, k);
  if (owns(key)) return true;
  const parent = applicationParent199(key);
  if (parent && parent.key !== key && owns(parent.key)) return true;
  const children = applicationSeatKeys199(key);
  if (children.length && !children.includes(key) && children.every(owns)) return true;
  return key === 'treasurer' ? owns('office_86') : key === 'office_86' ? owns('treasurer') : false;
};

function parseAppointed(raw: string | undefined): Record<string, string> {
  if (raw === undefined) return { ...DEFAULT_APPOINTED };
  try {
    return cleanAppointed(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

/**
 * Roles chosen without a public vote (.45): people can still apply (first choice or backup), but the role has no voting
 * board and no write-ins, and the leadership reads its applications on the admin page. An applicant whose leadership
 * choices are all such roles is not asked to be on the board. Admin -> Settings edits the list; until it is first
 * saved, the Co-Guild Master is the one (Viktor, 30 Sep 2026).
 */
export const DEFAULT_NO_VOTE: readonly string[] = ["co_gm"];

/** An admin's list of roles without a public vote, cleaned: real roles only (the board's keys), each once; null if unreadable. */
export function cleanNoVote(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const keys = new Set(v.flatMap(raw => {
    const key = String(raw ?? "");
    return ballotOf(key) ? [key] : applicationSeatKeys199(key).filter(k => ballotOf(k));
  }));
  return BALLOTS.map((b) => b.key).filter((k) => keys.has(k)); // the board's own order
}

/** Whether a role takes applications without a public vote. An appointed role is closed altogether, which comes first. */
export const isNoVote = (s: { noVote: readonly string[] }, key: string) => s.noVote.includes(key) || !!applicationParent199(key) && s.noVote.includes(applicationParent199(key)!.key);

function parseNoVote(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_NO_VOTE];
  try {
    return cleanNoVote(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

/** Blizzard's 20 Oct announcement: North America opens 27 Oct 2026 at 13:00 PDT = 20:00 UTC. Other regions differ.
 * https://news.blizzard.com/en-us/article/24303866/claim-your-world-of-warcraft-forever-character-names */
export const DEFAULT_NAMES_OPEN_AT = 1793131200;
/** 4 Nov 2026, 3:00 p.m. PST: Blizzard's announced launch (the same timestamp the channel intros show). */
export const DEFAULT_LAUNCH_AT = 1793833200;

export function parseTime(raw: string | undefined | null, fallback: number): number {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  if (/^\d{9,11}$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / 1000) : fallback;
}

const bool = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : v === "1" || v === "true");

export function settingsFrom(env: Env, rows: Array<{ key: string; value: string }>): SiteSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const namesOpenAt = parseTime(m.get("namesOpenAt"), parseTime(env.NAME_RESERVATION_AT, DEFAULT_NAMES_OPEN_AT));
  return {
    namesOpenAt,
    namesTimeConfirmed: bool(m.get("namesTimeConfirmed"), namesOpenAt === DEFAULT_NAMES_OPEN_AT),
    namesOpen: bool(m.get("namesOpen"), true),
    launchAt: parseTime(m.get("launchAt"), parseTime(env.LAUNCH_AT, DEFAULT_LAUNCH_AT)),
    autoQueue: bool(m.get("autoQueue"), true),
    applicationsOpen: bool(m.get("applicationsOpen"), true),
    votingOpen: bool(m.get("votingOpen"), true),
    notice: (m.get("notice") ?? "").slice(0, 300),
    appointed: parseAppointed(m.get("appointed")),
    noVote: parseNoVote(m.get("noVote")),
    newsOn: bool(m.get("newsOn"), false), // .115: a missing row means off (fail closed)
    loginAnimation: m.get("loginAnimation") === "1", // strict operator boolean; malformed values retain the approved still
    royalWritsOn: m.get("royalWritsOn") === "1", // absent or malformed settings keep the schedule off
  };
}

export async function loadSettings(env: Env): Promise<SiteSettings> {
  const rows = await env.DB.prepare("SELECT key, value FROM site_settings WHERE key < 'newsWebhook:' OR key >= 'newsWebhook;'").all<{ key: string; value: string }>();
  return settingsFrom(env, rows.results);
}

/** One read for the settings and the resolved game identity (item 7, 14 Oct 2026); the boot and /api/public use it. */
export async function loadSiteState(env: Env): Promise<{ settings: SiteSettings; ruleset: RulesetSnapshot }> {
  const rows = await env.DB.prepare("SELECT key, value FROM site_settings WHERE key < 'newsWebhook:' OR key >= 'newsWebhook;'").all<{ key: string; value: string }>();
  return { settings: settingsFrom(env, rows.results), ruleset: await resolveRulesetSnapshot(rows.results, env) };
}

/** Everything the page needs to draw the forms; sent with /api/me and in the page's boot data. */
export function meta(ruleset?: RulesetSnapshot) {
  return {
    // Item 7 (14 Oct 2026): the resolved identity, or null with the hold code; a caller without a snapshot gets no identity.
    ruleset: ruleset?.profile ?? null,
    rulesetHeld: ruleset ? ruleset.held : ("ruleset_unresolved" as const),
    rulesetSwitch: rulesetSwitchReadiness(ruleset ?? "unresolved"),
    positions: POSITIONS.map(position => ({ ...position, reservedSeat201: !!reservedApplication201({position:position.key}) })),
    classes: CLASSES,
    roles: ROLES,
    regions: REGIONS,
    hours: HOURS,
    voice: VOICE,
    talentSnapshotRevision: TALENT_SNAPSHOT_REVISION,
    talentBuilds: TALENT_BUILD_COLLECTION_LIMITS,
    questions: QUESTIONS,
    professions: PROFESSIONS,
    ballots: BALLOTS,
    // The .199 seat adapters remain historical vocabulary for old applications.
    // The owner's 26 Oct decision closes current leadership applications, including empty seats.
    appointments: OFFICE_APPOINTMENTS.map(office => {
      const reservedSeat201 = !!reservedApplication201({targetOffice:office.key});
      return { ...office, historicalApplicationEligible:office.applicationEligible,
        applicationEligible:office.applicationEligible && !reservedSeat201, reservedSeat201,
        acquisition:reservedSeat201 ? 'Reserved seat — filled by appointment. Applications are not accepted, including when no holder is recorded.' : office.acquisition };
    }),
    rankHierarchy: NATIVE_RANKS_199,
    applicationTracks: APPLICATION_TRACKS_199,
    roleGuides201: roleGuides201(POSITIONS),
    roleDirectory203: ROLE_DIRECTORY_203,
    nativeRankGuides201: NATIVE_RANK_GUIDES_201,
    applicationPolicy201: { reservedTiers:['leader','high_council','officer_corps'],
      notice:'Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them. An empty listing is not an open vacancy.' },
    royalWritPolicy: ROYAL_WRIT_POLICY,
    royalWrits: ROYAL_WRITS,
    royalWritCategories: ROYAL_WRIT_CATEGORIES,
    stockadesChecklist: STOCKADES_CHECKLIST,
    limits: LIMITS,
    avail: { reference: AVAIL_REFERENCE, prime: PRIME },
  };
}

// ---------- cleaning what people type ----------

/** Control characters out (newlines kept for long answers), whitespace tidied, then cut to `max` characters. */
export function cleanText(raw: unknown, max: number, multiline = false): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.normalize("NFC").replace(/\r\n?/g, "\n");
  s = multiline ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "") : s.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ");
  s = multiline ? s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  s = s.trim();
  return Array.from(s).slice(0, max).join("");
}

export const isSnowflake = (v: unknown): v is string => typeof v === "string" && /^\d{17,20}$/.test(v);

/** When a Discord account was created, from its id. */
export function snowflakeTime(id: string): number | null {
  try {
    return Math.floor(Number((BigInt(id) >> 22n) + 1420070400000n) / 1000);
  } catch {
    return null;
  }
}

/**
 * Olympus's local planning-name input: two parts, 2-12 letters each ("Fern Melder"), normalized to a capital
 * first letter and lower-case remainder. Blizzard confirms two-part names, but these local length/alphabet rules
 * are not independent validation of Blizzard's full naming policy or availability. The key is the invite queue's own normalization (codes.ts), so a reserved name
 * lines up with the roster and the queue exactly.
 */
export function parseCharacterName(raw: unknown): { name: string; key: string } | { error: string } {
  const s = cleanText(raw, 40);
  if (!s) return { error: "Type the character's name." };
  const parts = s.split(" ");
  if (parts.length !== 2) return { error: "Use two parts for this guild planning list, a first and a last name, like Fern Melder. Blizzard makes the final naming decision in game." };
  for (const p of parts) {
    if (!/^\p{L}{2,12}$/u.test(p)) return { error: "This guild planning list accepts 2 to 12 letters per part, without digits or symbols. This is a local input rule, not a Blizzard name-availability check." };
  }
  const name = parts.map((p) => { const [first, ...rest] = Array.from(p); return first.toUpperCase() + rest.join("").toLowerCase(); }).join(" ");
  return { name, key: normalizeCharacter(name) };
}

/** Someone typed by hand because they are not on Discord (or could not be found): a nominee, a friend, a reference. */
export function parseTypedName(raw: unknown): { label: string; key: string } | { error: string } {
  const label = cleanText(raw, LIMITS.typedName);
  if (Array.from(label).length < 2) return { error: "Type at least two characters." };
  if (/[<>@#]|https?:|www\.|discord\.gg|\.com\b/i.test(label)) return { error: "Just the name, please: no links, mentions or tags." };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u.test(label)) return { error: "Names may use letters, digits, spaces, apostrophes, dots, dashes and underscores." };
  return { label, key: label.toLowerCase().replace(/\s+/g, " ") };
}

/** A pick of a person, from the member search or typed by hand. */
export interface Pick { kind: "discord" | "name"; key: string; label: string }

export function parsePick(raw: unknown): Pick | { error: string } {
  const r = (raw ?? {}) as { kind?: unknown; key?: unknown; label?: unknown };
  if (r.kind === "discord") {
    if (!isSnowflake(r.key)) return { error: "That Discord member could not be read. Pick them from the search again." };
    const label = cleanText(r.label, LIMITS.label) || "Discord member";
    return { kind: "discord", key: r.key, label };
  }
  if (r.kind === "name") {
    const t = parseTypedName(r.label ?? r.key);
    if ("error" in t) return t;
    return { kind: "name", key: t.key, label: t.label };
  }
  return { error: "Pick someone from the search, or type their name." };
}

/** An https link, nothing else, or "" when the field was left empty. */
export function parseLink(raw: unknown): string | { error: string } {
  const s = cleanText(raw, 200);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return { error: "Links must start with https://" };
    return u.toString();
  } catch {
    return { error: "That does not look like a link." };
  }
}

export const CLASS_KEY_SET = CLASS_KEYS;
export const ROLE_KEYS = new Set(ROLES.map((r) => r.key));
export const REGION_KEYS = new Set(REGIONS.map((r) => r.key));
export const HOUR_KEYS = new Set(HOURS.map((r) => r.key));
export const VOICE_KEYS = new Set(VOICE.map((r) => r.key));

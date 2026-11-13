import type { RoleGuide201 } from './site-role-guides201';
import { ROLE_DIRECTORY_203 } from './site-role-directory203';

/** Owner .219: one edited job specification per family. Existing keys remain
 * identities for search/holders; aliases never concatenate job descriptions. */
export const ROLE_EDITORIAL_219 = {
"social": {
  "definition": "Social and Casual participants belong to Olympus through conversation, leveling, dungeons, community events and friendships. The same guide covers a social main or an eligible verified alt; participation preference does not establish a second identity, reserve a branch place or promise progression-team priority.",
  "responsibilities": [
    "Keep your main and verified-alt labels accurate so organizers can distinguish one player from several characters.",
    "Choose the activities that fit your available time and keep any RSVP you accept accurate.",
    "Welcome unfamiliar members, help with ordinary questions and refer access or conduct disputes to the appropriate officer.",
    "Respect current branch capacity and ask Intake about placement rather than assuming an extra flagship slot."
  ],
  "expectations": [
    "Be considerate in conversation and groups, including when declining an invitation or changing plans.",
    "Give notice when an accepted commitment becomes impractical; casual participation still depends on honest communication."
  ],
  "commitment": "Flexible participation with no universal weekly quota; allow the preparation and attendance needed for the individual groups you accept.",
  "worksWith": "Guild Members, Intake and Recruitment, community event organizers, and branch officers when identity or capacity needs review."
},
"recruiter": {
  "definition": "Guild Recruiters guide prospective members through the current admissions process and hand complete, accurate applications to the appropriate decision maker. Recruiter and Guild Recruiter are the same intake job; they do not approve their own candidates, promise reserved seats or waive verification and branch-capacity requirements.",
  "responsibilities": [
    "Explain the available member, raider and artisan routes using the current published requirements.",
    "Check that an application contains the requested character, availability and supporting information before handing it over.",
    "Record unresolved questions and waiting-list context clearly so another officer can continue the same conversation.",
    "Coordinate approved next steps and branch placement with Intake without promising an invitation or a particular team."
  ],
  "expectations": [
    "Protect applicant privacy and discuss applications only through the authorized review surfaces.",
    "Treat applicants consistently, distinguish missing evidence from a refusal, and escalate conflicts of interest.",
    "Use the current process rather than asking applicants to disclose credentials or send payment for an ordinary review."
  ],
  "commitment": "Regular agreed intake coverage, with timely handovers whenever applicants or waiting-list cases would otherwise be left unanswered.",
  "worksWith": "The Intake Minister, branch officers, application reviewers and the relevant raiding or artisan lead for specialist questions."
},
  "member": {
    "definition": "Guild Members make up Olympus’s everyday community: leveling, dungeons, crafting, raids and conversation. Members choose how they participate while sharing the same standards of respect and reliability.",
    "responsibilities": [
      "Keep your main and alt character links accurate through the supported verification process.",
      "Use sign-ups honestly, arrive for the groups you accept and give notice when plans change.",
      "Help guildmates when you can and direct unfamiliar questions to the right mentor or organizer.",
      "Follow the current conduct, activity and branch-capacity policies."
    ],
    "expectations": [
      "Treat people respectfully in game and on Discord, including when a group struggles.",
      "Keep officers informed about an extended absence when your branch’s published activity policy asks for it.",
      "Respect each team’s attendance, loot and roster decisions. The 1,000-character branch cap is a planning boundary; actual game capacity is separately unverified, and membership guarantees no team place."
    ],
    "commitment": "Play at your own pace; there is no universal weekly quota. Honour the schedule of any team or event you choose to join.",
    "worksWith": "Fellow members, Recruiters, Mentors and activity organizers."
  },
  "raider": {
    "definition": "Raiders form Olympus’s organized NA and EU raid teams. They earn a team’s confidence through preparation, dependable attendance and constructive teamwork rather than a rank label alone.",
    "responsibilities": [
      "Keep your RSVP, role and availability accurate; warn the organizer promptly if you cannot attend.",
      "Arrive on time with repaired gear, the announced consumables and the encounter preparation your team requires.",
      "Follow the Raid Leader’s calls and your assigned position or mechanic; ask when an instruction is unclear.",
      "Review specific improvement goals with your Class Lead and practise them between raids."
    ],
    "expectations": [
      "Attend the nights agreed with your regional team and listen in its Discord voice channel.",
      "Keep feedback useful after a wipe and take responsibility for mistakes without blaming teammates.",
      "Follow the published loot and bench-rotation rules, using the stated review route for concerns."
    ],
    "commitment": "Your regional team’s agreed raid nights, plus personal preparation and a prompt absence notice when needed.",
    "worksWith": "Regional Raid Leaders, Raid Assists, Class Leads and the team’s loot reviewers."
  },
  "officer": {
    "definition": "An Officer runs a clearly assigned part of Olympus’s day-to-day operations under the responsible Council portfolio and branch leadership. Members should know what that officer can decide, where to bring a problem and who provides cover.",
    "responsibilities": [
      "Work the assigned recruitment, event or member-support queue and keep unresolved work ready for handover.",
      "Explain routine decisions and escalate exceptional cases, conflicts or requests outside your delegation.",
      "Maintain relevant officer notes and carry out invite, rank or conduct actions only through the separately authorized process.",
      "Coordinate with activity leads and brief a named deputy before an absence."
    ],
    "expectations": [
      "Be fair to friends and strangers, protect private reports and correct mistakes with the responsible leadership.",
      "Use the required account protection and check officer channels during your agreed coverage.",
      "Give clear instructions without claiming authority over another branch or portfolio."
    ],
    "commitment": "Agree a regular regional coverage rota with leadership; general-officer service has historically been about 8–15 hours a week.",
    "worksWith": "The responsible Council portfolio holder, branch Guild Master, fellow Officers and activity leads."
  },
  "co_gm": {
    "definition": "The Co-Guild Master is the Sovereign’s appointed second in command and a High Council portfolio holder. The role keeps daily leadership moving, coordinates departments and provides continuity within an expressly recorded delegation.",
    "responsibilities": [
      "Turn the Guild Master’s priorities into named officer assignments and track their completion.",
      "Chair agreed leadership meetings and record decisions, reasons, dissent and follow-up.",
      "Make time-sensitive day-to-day decisions within the delegation and report them to the Guild Master and affected officers.",
      "Coordinate cross-branch issues with other Guild Masters and arrange leadership cover.",
      "Refer contested appeals, conflicts and irreversible decisions to the proper unconflicted authority."
    ],
    "expectations": [
      "Maintain trust through reliable availability, discretion and clear handovers.",
      "Use Battle.net account protection and Discord two-factor authentication.",
      "Remain calm in public and separate private consultation from adopted policy."
    ],
    "commitment": "A substantial continuing leadership role, historically 15 or more hours a week across agreed evening coverage; reachability and cover are agreed with the Guild Master.",
    "worksWith": "The Sovereign, branch Guild Masters, Chief of Staff, Treasurer and Council portfolio holders."
  },
  "treasurer": {
    "definition": "The Treasurer is the High Council’s steward of guild gold, budgets and financial records. Every receipt and expenditure should have an explainable purpose, with custody kept separate from independent audit and trading execution.",
    "responsibilities": [
      "Prepare repair, consumable and project budgets with the organizers who will use them.",
      "Record receipts, approved spending and unresolved transactions, then reconcile them against available bank evidence.",
      "Propose tab organization, access and daily limits for the Guild Master’s attended configuration.",
      "Authorize bounded procurement and trading capital, monitor reserves and review the resulting reconciliations.",
      "Give leadership a regular financial report and make suitably redacted records available for independent review."
    ],
    "expectations": [
      "Use the required account protection and keep personal loans, purchases and inventory separate from guild funds.",
      "Disclose conflicts before approving a transaction and never describe an unknown bank or provider outcome as settled.",
      "Keep source receipts available to authorized auditors and protect private counterparty information."
    ],
    "commitment": "About 3–6 hours a week, with additional time for budgets, significant transactions and audit reviews.",
    "worksWith": "The Guild Master, Bank Manager, Quartermaster, Head of Trading, independent Bank Auditor and raid supply leads."
  },
  "events": {
    "definition": "The Community & Events Lead builds a varied Olympus calendar beyond progression raids, with approachable invitations and dependable organizers. Social nights, contests and shared adventures should be easy to join and clear about what participants are agreeing to.",
    "responsibilities": [
      "Plan a balanced calendar across regions and recruit a named organizer for each event.",
      "Publish the start time, preparation, rules and participation limits before sign-ups open.",
      "Coordinate announcements and practical delivery with assigned Event Coordinators and Officers.",
      "Collect feedback and adjust future events for interest, accessibility and time zones."
    ],
    "expectations": [
      "Attend the events you undertake to run or arrange cover and explain cancellations early.",
      "Give clear instructions in text or voice.",
      "Keep participation welcoming and refer harassment to authorized moderators."
    ],
    "commitment": "About 4–8 hours a week, adjusted to the agreed calendar and the events you personally cover.",
    "worksWith": "Event Coordinators, Community Officers, Moderators, Leveling Lead and optional PvP organizers."
  },
  "moderator": {
    "definition": "A Discord Moderator keeps Olympus’s channels usable and civil within Asmongold’s server rules and the moderator’s assigned scope. Moderation is an accountable service, with evidence, proportionate action and a clear escalation route.",
    "responsibilities": [
      "Review reports and intervene in spam, scams or abuse using approved procedures and actual permissions.",
      "Record relevant evidence and reasons for a warning, timeout or escalation.",
      "Hand severe safety matters to the server’s responsible moderation team and in-game disputes to guild officers.",
      "Provide the appropriate review or appeal route without arguing a private case in public."
    ],
    "expectations": [
      "Use Discord two-factor authentication and keep case information within the authorized review group.",
      "Remain impartial, recuse from personal disputes and apply the same rules to friends and strangers.",
      "Arrange cover rather than implying permanent availability or promising an unban outside your authority."
    ],
    "commitment": "About 3–6 hours a week across agreed checking windows, with a clear handover for active cases.",
    "worksWith": "Asmongold’s server moderators, the Justice portfolio and Community Officers."
  },
  "recruitment": {
    "definition": "The Recruitment Officer connects applications, interviews, ordinary trials and genuine branch capacity into a clear route for newcomers. The role gives applicants useful decisions and helps approved members settle in without promising a place the branch cannot provide.",
    "responsibilities": [
      "Review ordinary membership and raid applications with the relevant officers and arrange a focused conversation where needed.",
      "Coordinate raid trials with the Regional Raid Leader and Trial Officer, recording specific feedback.",
      "Keep waiting-list progress and branch-capacity handovers accurate.",
      "Help approved newcomers through first-week verification, orientation and group introductions.",
      "Bring inactive-roster or capacity concerns to authorized branch leadership for review."
    ],
    "expectations": [
      "Protect private applicant information and use the same published standards for friends and strangers.",
      "Check the queue during agreed coverage and explain significant delays.",
      "Distinguish an application, an approval recommendation and a completed in-game invitation."
    ],
    "commitment": "About 5–10 hours a week, with additional agreed coverage around launch and recruitment drives.",
    "worksWith": "Chief of Intake, branch Guild Masters, Recruiters, Trial Officers and Regional Raid Leaders."
  },
  "loot_council": {
    "definition": "The Loot Council decides contested drops under the team’s published loot policy. Its work is timely, explainable and consistent, with conflicts disclosed before a decision rather than after an award.",
    "responsibilities": [
      "Compare eligible requests with published priorities and the raid’s actual needs.",
      "Resolve contested items promptly and record the recipient and reasons for a disputed award.",
      "Explain decisions respectfully and refer procedural appeals through the agreed raid process.",
      "Recommend policy improvements between raids without changing criteria after an item drops."
    ],
    "expectations": [
      "Attend the raids you are assigned to cover and keep the relevant loot record current.",
      "Recuse from your own loot decisions and material personal conflicts, including close friends’ competing claims.",
      "Handle disagreement without retaliation or promises of a compensating future award."
    ],
    "commitment": "Assigned regional raid nights, plus about an hour a week maintaining and reviewing the loot record.",
    "worksWith": "Regional Raid Leaders, Raid Assists, Class Leads and the designated appeal authority."
  },
  "profession_coordinator": {
    "definition": "The Profession Coordinator turns guild craft needs into practical requests matched with willing crafters. The role maintains useful opt-in knowledge of professions and rare recipes without treating every listing as verified ownership or permanent availability.",
    "responsibilities": [
      "Keep opted-in profession and recipe listings accurate and remove outdated offers promptly.",
      "Match each requested craft with an available crafter and clarify materials, permitted charges and delivery time.",
      "Coordinate raid consumables, gear crafts and gathering plans with supply contacts and the Treasurer.",
      "Identify profession gaps and arrange voluntary teaching or recipe-development projects."
    ],
    "expectations": [
      "Understand the applicable Forever professions and verify uncertain recipe details before promising a craft.",
      "Respect a crafter’s choice to decline, change availability or delist.",
      "Keep requests organized and communicate missing materials or likely delays early."
    ],
    "commitment": "About 3–6 hours a week, depending on agreed supply and teaching projects.",
    "worksWith": "The Minister of Artisanry, crafters, gatherers, Treasurer, Raid Leaders and Class Leads."
  },
  "pvp_team": {
  "definition": "The PvP Team brings willing Olympus members together for optional battleground premades and agreed PvP events. It is a member activity within the PvE Alliance guild, not an Officer appointment or an attendance condition for ordinary membership.",
  "responsibilities": [
    "Keep your RSVP and chosen combat role accurate for the optional sessions you accept.",
    "Bring the gear and consumables agreed for your assigned event role.",
    "Listen to the Captain’s target and regroup calls in the agreed voice channel.",
    "Give useful feedback afterwards and follow guild conduct during rivalry."
  ],
  "expectations": [
    "Attend sessions you choose or notify the organizer promptly when plans change.",
    "Respect opponents and teammates; optional PvP does not excuse harassment or cheating."
  ],
  "commitment": "Only the optional NA/EU sessions you accept, plus their preparation; ordinary membership has no PvP attendance quota.",
  "worksWith": "Regional PvP Leads, PvP Captains and willing teammates."
},
  "pvp_leadership": {
    "definition": "The regional or branch PvP Lead organizes optional battleground premades and agreed competitive events for Olympus’s Alliance community on the PvE ruleset. This Officer Corps role delivers the local programme; the alliance-wide Lord High Marshal of PvP · Minister of Battlegrounds & Honor remains a separate Council portfolio.",
    "responsibilities": [
      "Publish optional PvP nights and keep the willing team’s availability, roles and composition current.",
      "Prepare strategy and practice sessions, assign Captains and call or delegate target priorities in voice.",
      "Brief participants on event objectives, conduct and safe escalation before play begins.",
      "Review the event afterwards and route inter-guild disputes through the appropriate Liaison."
    ],
    "expectations": [
      "Bring practical group-leading experience, a clear microphone and calm decisions under pressure.",
      "Cover the NA or EU evenings agreed for your team and arrange a Captain when absent.",
      "Keep competition voluntary and within guild, platform and game rules."
    ],
    "commitment": "About 5–10 hours a week during an active regional programme, including preparation and review.",
    "worksWith": "The Lord High Marshal of PvP · Minister of Battlegrounds & Honor, PvP Captains, the optional PvP Team, Class Leads and Liaison."
  }
} as const;

/** `nativeSource` maps each native-rank key to the office its rank guide describes (rank_guild_master → office_43).
 * REV-GOV-1, round 3 (12 Nov 2026): a native rank copies that office's edited text, not the family primary's. Since
 * CL2-037 the Leader family opens with the Sovereign (office_81), but every branch Guild Master holds Rank 1, so Rank 1
 * keeps the branch Guild Master's guide as on dfca7a2; for the other nine ranks the source office is (or aliases) the
 * family primary, so their text is unchanged. Aliases and historical keys still share their family primary's text. */
export function editorialRoleGuides219(input: Readonly<Record<string, RoleGuide201>>, nativeSource: Readonly<Record<string, string>> = {}): Readonly<Record<string, RoleGuide201>> {
  const result: Record<string, RoleGuide201> = { ...input };
  const copy = (key: string, guide: RoleGuide201) => { const own = input[key]; if (own) result[key] = Object.freeze({ ...own, definition: guide.definition, responsibilities: guide.responsibilities, expectations: guide.expectations, commitment: guide.commitment, worksWith: guide.worksWith }); };
  const natives: string[] = [];
  for (const family of ROLE_DIRECTORY_203.families) {
    const original = input[family.primaryKey];
    if (!original) throw new Error('Missing canonical role guide');
    const edit = ROLE_EDITORIAL_219[family.key as keyof typeof ROLE_EDITORIAL_219];
    const guide = { ...original, ...edit };
    result[family.primaryKey] = Object.freeze(guide);
    for (const variant of family.variants) {
      if (variant.presentation === 'native') natives.push(variant.key);
      else if (['alias','historical'].includes(variant.presentation)) copy(variant.key, guide);
    }
  }
  // After every family is edited, so a source office that is another family's primary or alias carries its edited text.
  for (const key of natives) {
    const source = result[nativeSource[key]];
    if (!source) throw new Error('Missing native-rank source guide: ' + key);
    copy(key, source);
  }
  return Object.freeze(result);
}

/* The original 26 rank ideas are preserved from the user-supplied Forever Guild Rank Codex.
 * High Council is separately attributed to the owner's October 2026 decisions.
 * No document script is executed; all governance remains draft-only.
 */
(function(root) {
  const catalogue = {
  "source": {
    "attachment": "Forever Guild Rank Codex.html",
    "sha256": "40BC6DF51C769ADAEDE8A0F29E7483970644B79643C3DDE4B475BA5D9E41EAA8",
    "status": "User-supplied recommendations; draft popularity is not verification."
  },
  "ranks": [
    {
      "id": "highcouncil",
      "name": "High Council",
      "aliases": ["High Councillor"],
      "cat": "leadership",
      "tier": 2.1,
      "pos": "Olympus slot 2",
      "purpose": "Olympus-wide leadership and departmental appointments. Treasurer is an appointment within High Council, rather than a separate rank in the Olympus preset.",
      "perms": {"bundle": true, "promote": true, "demote": true, "invite": true, "remove": true, "repair": true, "gold": true, "tabs": true, "auth": true},
      "limits": "Highest daily allowance after Guild Master; amount and each bank tab need Guild Master review. Draft withdrawals start at zero.",
      "note": "Owner-approved Olympus preset: Withdraw Gold and Modify Bank Tabs apply to every High Council character, including those without a Treasurer appointment. Co-GM is also an appointment. This draft applies no live permissions.",
      "origin": "Olympus owner decisions, October 2026",
      "src": []
    },
    {
      "id": "gm",
      "name": "Guild Master",
      "aliases": [
        "Leader",
        "Guild Leader",
        "General",
        "Guild Mother / Father",
        "Great Wyrm"
      ],
      "cat": "leadership",
      "tier": 1,
      "pos": "Slot 1, fixed",
      "purpose": "Owns the guild. The only rank that can disband it, hand off leadership, edit ranks and permissions, or link the Discord channel on its own authority.",
      "perms": {
        "all": true
      },
      "limits": "Unlimited gold and tabs.",
      "note": "Always slot 1. The client will not let you edit, move or delete it.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "cogm",
      "name": "Co-GM",
      "aliases": [
        "Senior Officer",
        "Deputy GM",
        "Executive Officer",
        "Co-Leader",
        "High Command",
        "GP"
      ],
      "cat": "leadership",
      "tier": 2,
      "pos": "Slot 2",
      "purpose": "Second in command with everything short of the GM-only actions, so the guild keeps running while the GM is offline. Only one character can hold leadership, which is why this rank exists.",
      "perms": {
        "bundle": true,
        "promote": true,
        "demote": true,
        "invite": true,
        "remove": true,
        "repair": true,
        "gold": true,
        "tabs": true,
        "auth": true
      },
      "limits": "High gold per day.",
      "note": "In the Forever model this is an Officer plus Withdraw Gold and Modify Bank Tabs. Spend a slot on it only if plain Officers do not get those two.",
      "src": [
        2,
        3,
        5,
        7,
        9,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "officer",
      "name": "Officer",
      "aliases": [
        "Council",
        "Lord",
        "Wyrm Commander"
      ],
      "cat": "leadership",
      "tier": 3,
      "pos": "Slot 2–3",
      "purpose": "Day-to-day administration: recruiting, kicks, promotions, notes, MOTD, guild info and the Discord link.",
      "perms": {
        "bundle": true,
        "promote": true,
        "demote": true,
        "invite": true,
        "remove": true,
        "repair": true,
        "auth": true
      },
      "limits": "Repair gold per day; Withdraw Gold only if no Treasurer rank.",
      "note": "One of the five defaults. The Officer checkbox is a bundle of eleven rights; you cannot hand out notes or MOTD editing without the rest.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "officeralt",
      "name": "Officer Alt",
      "aliases": [
        "Officer-Alt"
      ],
      "cat": "leadership",
      "tier": 3.5,
      "pos": "Slot 3–4",
      "purpose": "Secondary characters of officers keep officer chat and can invite without logging over to a main.",
      "perms": {
        "bundle": true,
        "invite": true,
        "auth": true
      },
      "limits": "No gold; deposit-only tabs.",
      "note": "Worth a slot only if officers spend real time on alts. The bundle gives the alt note and MOTD rights too.",
      "src": [
        6,
        8,
        11,
        13,
        14,
        15
      ]
    },
    {
      "id": "treasurer",
      "name": "Treasurer",
      "aliases": [
        "Banker",
        "Bank",
        "Quartermaster",
        "Trustee",
        "Bank Alt",
        "Bank Mule"
      ],
      "cat": "leadership",
      "tier": 2.5,
      "pos": "Slot 2–3",
      "purpose": "Custody of guild gold and tab layout, separated from general officers. Also the rank for a dedicated bank character.",
      "perms": {
        "gold": true,
        "tabs": true,
        "auth": true
      },
      "limits": "Highest gold per day.",
      "note": "Withdraw Gold and Modify Bank Tabs are separate toggles, so custody can sit on one rank while Officers stay repair-only. Add the Officer bundle only if the treasurer needs officer chat.",
      "src": [
        1,
        6,
        7,
        11,
        12,
        13,
        15
      ]
    },
    {
      "id": "raidlead",
      "name": "Raid Leader",
      "aliases": [
        "Raid Officer",
        "Raid Lead",
        "Operations Officer",
        "Assistant Officer",
        "Field Marshal"
      ],
      "cat": "officer",
      "tier": 4,
      "pos": "Slot 3–4",
      "purpose": "Runs the raids: roster, strategy, calendar. Needs officer chat and notes for roster work.",
      "perms": {
        "bundle": true,
        "invite": true,
        "repair": true
      },
      "limits": "Raid tab access; repair gold per day.",
      "note": "The bundle is required for officer chat and notes. There is no raid-warning, calendar or combat-log rank toggle; those claims in the drafts were invented.",
      "src": [
        1,
        2,
        3,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "classlead",
      "name": "Class Lead",
      "aliases": [
        "Class Leader",
        "Class Officer",
        "Role Lead",
        "Junior Officer"
      ],
      "cat": "officer",
      "tier": 4.5,
      "pos": "Slot 3–5",
      "purpose": "Coaches one class or role, reviews logs, advises on loot for that class.",
      "perms": {
        "repair": true
      },
      "limits": "Invite Member optional; officer bundle only if they need officer chat.",
      "note": "If they only coach, keep them off the bundle and give them a Discord role instead of a slot.",
      "src": [
        1,
        2,
        3,
        6,
        7,
        9,
        10,
        11,
        13,
        14,
        15
      ]
    },
    {
      "id": "recruiter",
      "name": "Recruiter",
      "aliases": [
        "Recruitment Officer"
      ],
      "cat": "officer",
      "tier": 4.6,
      "pos": "Slot 3–5",
      "purpose": "Invites and onboards without the rest of the officer powers.",
      "perms": {
        "invite": true,
        "recruit": true
      },
      "limits": "No bank rights needed.",
      "note": "Invite Member is its own toggle, so this rank needs no bundle. Inviting guild-finder applicants, however, sits inside the bundle.",
      "src": [
        1,
        7,
        12,
        13
      ]
    },
    {
      "id": "moderator",
      "name": "Moderator",
      "aliases": [],
      "cat": "officer",
      "tier": 3.6,
      "pos": "Slot 3",
      "purpose": "Chat and voice moderation for large guilds: delete messages, remove people from voice, kick.",
      "perms": {
        "bundle": true,
        "remove": true
      },
      "limits": "No promote, demote, invite or bank.",
      "note": "Delete messages and remove-from-voice live in the Officer bundle, so a moderator is an Officer without the roster and bank toggles.",
      "src": [
        13
      ]
    },
    {
      "id": "lootcouncil",
      "name": "Loot Council",
      "aliases": [
        "Loot Master"
      ],
      "cat": "officer",
      "tier": 4.2,
      "pos": "Slot 3–4",
      "purpose": "Decides loot. Historically the rank whose officer notes held DKP or priority data.",
      "perms": {
        "bundle": true
      },
      "limits": "Officer notes come with the bundle.",
      "note": "In the beta, addons cannot write guild notes (C_GuildInfo.SetNote is blocked), so note-based loot tracking is manual or lives outside the game.",
      "src": [
        7,
        9,
        15
      ]
    },
    {
      "id": "eventofficer",
      "name": "Event Officer",
      "aliases": [
        "Event Host",
        "Event Coordinator",
        "Event / Raid Lead"
      ],
      "cat": "officer",
      "tier": 4.7,
      "pos": "Slot 3–5",
      "purpose": "Schedules calendar events and social nights.",
      "perms": {},
      "limits": "No dedicated toggle; deleting other people's events is inside the Officer bundle.",
      "note": "Event creation is not rank-gated in the Forever UI, so this is usually a Discord role rather than a guild rank.",
      "src": [
        7,
        12,
        13
      ]
    },
    {
      "id": "pvplead",
      "name": "PvP Lead",
      "aliases": [
        "PvP Officer",
        "Premade Captain",
        "Premade Commander",
        "Combat Officer",
        "PvP Member"
      ],
      "cat": "officer",
      "tier": 4.3,
      "pos": "Slot 3–5",
      "purpose": "Organises battleground premades and world PvP.",
      "perms": {
        "bundle": true,
        "invite": true,
        "repair": true
      },
      "limits": "Same shape as Raid Leader; drop the bundle if they never need officer chat.",
      "note": "On the PvP ruleset the whole account is one faction, which is why PvP-focused tiers show up more often there.",
      "src": [
        7,
        8,
        9,
        10,
        12,
        15
      ]
    },
    {
      "id": "mentor",
      "name": "Mentor",
      "aliases": [],
      "cat": "officer",
      "tier": 5,
      "pos": "Slot 4–5",
      "purpose": "Experienced members who actively help new players.",
      "perms": {},
      "limits": "Invite Member optional.",
      "note": "Recognition rank. Only worth a slot if mentors get a permission other members lack, such as inviting.",
      "src": [
        10,
        14
      ]
    },
    {
      "id": "veteran",
      "name": "Veteran",
      "aliases": [
        "Elder",
        "Legacy",
        "Founder",
        "Wyrm",
        "Champion"
      ],
      "cat": "community",
      "tier": 5.5,
      "pos": "Slot 4–5",
      "purpose": "Tenure and trust. No administrative powers, better bank limits than Member.",
      "perms": {},
      "limits": "Higher tab and repair limits; Invite Member optional in social guilds.",
      "note": "One of the five defaults. Keep it as a prestige tier or rename it; several drafts use it for a designated or founders list.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "coreraider",
      "name": "Core Raider",
      "aliases": [
        "Senior Raider",
        "Champion",
        "Mythic Team"
      ],
      "cat": "progression",
      "tier": 6,
      "pos": "Slot 4–5",
      "purpose": "Guaranteed roster spot, highest attendance, first call on contested loot under a loot council.",
      "perms": {
        "repair": true
      },
      "limits": "Highest repair gold per day; raid consumables tab.",
      "note": "Use it only if you also keep a plain Raider tier below it; otherwise it is Raider with a fancier name.",
      "src": [
        1,
        2,
        3,
        5,
        6,
        8,
        9,
        10,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "raider",
      "name": "Raider",
      "aliases": [
        "Knight",
        "PvE Raider",
        "Team A / Team B Raider"
      ],
      "cat": "progression",
      "tier": 6.5,
      "pos": "Slot 5–6",
      "purpose": "Active raid roster: meets attendance, arrives with consumables, follows the loot rules.",
      "perms": {
        "repair": true
      },
      "limits": "Standard repair gold per day; raid tab withdrawals.",
      "note": "With 10- and 20-player tiers, multi-team guilds split this by team, which eats slots fast. Team membership is better tracked in Discord.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "trialraider",
      "name": "Trial Raider",
      "aliases": [
        "Raider Initiate",
        "Trial (raid)"
      ],
      "cat": "progression",
      "tier": 8.5,
      "pos": "Slot 7–8",
      "purpose": "Two to four week raid evaluation before promotion to Raider.",
      "perms": {},
      "limits": "Deposit only; no repair.",
      "note": "Distinct from a guild-wide Trial rank only if you take non-raiding members as well.",
      "src": [
        1,
        2,
        7,
        8,
        9,
        12,
        15
      ]
    },
    {
      "id": "bench",
      "name": "Bench",
      "aliases": [
        "Standby",
        "Backup Raider"
      ],
      "cat": "progression",
      "tier": 7,
      "pos": "Slot 6–7",
      "purpose": "Raiders outside the current lineup who fill in on short notice.",
      "perms": {
        "repair": true
      },
      "limits": "Lower repair limit than Raider.",
      "note": "Rotates to keep morale; in a 10-slot ladder it is often folded into Raider with a note.",
      "src": [
        7,
        9,
        13,
        15
      ]
    },
    {
      "id": "member",
      "name": "Member",
      "aliases": [
        "Dragon",
        "Social Member"
      ],
      "cat": "community",
      "tier": 7.5,
      "pos": "Slot 6–7",
      "purpose": "Full member baseline: guild chat, tabard, the general bank tab.",
      "perms": {},
      "limits": "General tab with modest limits.",
      "note": "One of the five defaults and the rank most guilds keep unchanged.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "social",
      "name": "Social",
      "aliases": [
        "Casual",
        "Friends & Family",
        "Free Agent",
        "Friend",
        "Honorary",
        "Community"
      ],
      "cat": "community",
      "tier": 8,
      "pos": "Slot 7–8",
      "purpose": "Non-raiders who are here for the community: family, friends, retired raiders.",
      "perms": {},
      "limits": "Deposit only.",
      "note": "Only needed when Member would otherwise mix raiders and non-raiders with different bank access.",
      "src": [
        1,
        2,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "trial",
      "name": "Trial / Recruit",
      "aliases": [
        "Applicant",
        "Probation",
        "Newcomer",
        "Whelpling",
        "Hatchling"
      ],
      "cat": "community",
      "tier": 9,
      "pos": "Slot 8–9",
      "purpose": "Probation before full membership, usually one to four weeks.",
      "perms": {},
      "limits": "Deposit only; no invite.",
      "note": "Almost always the renamed Initiate. Leave Guild Chat Speak on; you cannot judge someone who is not allowed to talk.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "initiate",
      "name": "Initiate",
      "aliases": [
        "Recruit (default)"
      ],
      "cat": "community",
      "tier": 9.3,
      "pos": "Slot 9–10",
      "purpose": "The default lowest rank; new invites land here.",
      "perms": {},
      "limits": "Guild chat only.",
      "note": "One of the five defaults. Most guilds rename it Trial or Recruit rather than keeping both.",
      "src": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "alt",
      "name": "Alt",
      "aliases": [
        "Alts",
        "Member Alt",
        "Veteran-Alt"
      ],
      "cat": "utility",
      "tier": 9.5,
      "pos": "Slot 8–9",
      "purpose": "Secondary characters kept off the main roster tiers so attendance, loot and bank limits stay tied to the main.",
      "perms": {},
      "limits": "No withdrawals; no repair.",
      "note": "Every character takes a roster seat, so alts can be a large share of a big guild. Main-to-alt links belong in a note or an external record, not in extra ranks.",
      "src": [
        1,
        2,
        3,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "crafter",
      "name": "Crafter",
      "aliases": [
        "Gatherer",
        "Profession rank"
      ],
      "cat": "utility",
      "tier": 7.2,
      "pos": "Slot 6–8",
      "purpose": "Members who craft for the guild and need a materials tab.",
      "perms": {},
      "limits": "Withdraw from a materials tab.",
      "note": "Per-tab bank permissions can do this on Member; give it a slot only if crafters need more than Member gets.",
      "src": [
        1,
        7,
        15
      ]
    },
    {
      "id": "inactive",
      "name": "Inactive",
      "aliases": [
        "Retired",
        "On Leave",
        "MIA",
        "AFK",
        "Vacation"
      ],
      "cat": "utility",
      "tier": 10,
      "pos": "Slot 10",
      "purpose": "Parking rank for people who have gone quiet. Protects the bank if a dormant account is compromised.",
      "perms": {},
      "limits": "No bank access; Guild Chat Speak on or off.",
      "note": "Demote after a set absence, prune later. Also makes the roster readable without kicking.",
      "src": [
        1,
        2,
        6,
        8,
        10,
        11,
        12,
        14,
        15
      ]
    },
    {
      "id": "muted",
      "name": "Muted",
      "aliases": [
        "Timeout",
        "Silenced",
        "Probation (disciplinary)",
        "GratsMacroJail"
      ],
      "cat": "utility",
      "tier": 10.2,
      "pos": "Slot 10",
      "purpose": "Discipline without kicking: chat off, bank off, invites off.",
      "perms": {
        "speak": false
      },
      "limits": "No bank.",
      "note": "Guild Chat Speak is the only chat toggle; listening cannot be revoked, so a muted member still reads guild chat.",
      "src": [
        2,
        5,
        7,
        8,
        9,
        13,
        15
      ]
    }
  ]
};
  if (typeof module === "object" && module.exports) module.exports = catalogue;
  else root.OlympusStaffRankCatalogue = catalogue;
})(typeof globalThis !== "undefined" ? globalThis : this);

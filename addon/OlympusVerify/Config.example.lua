-- Copy to Config.lua (same folder). Config.lua is private: it holds the shared secret.
OlympusVerifyConfig = {
  -- Same value as the Worker secret VERIFY_SECRET and the watcher config.json "verify_secret".
  secret = "REPLACE_WITH_THE_SHARED_SECRET",
  -- Public notes: C_GuildInfo.SetNote is forbidden for addons on the Forever beta (probe, 17 Sep 2026), so leave this
  -- false there. true only on a client where a key press may set notes (the addon switches off on the first refusal).
  setNotes = false,
  -- Ignored since 0.6.3. It turned chat logging off and on after every whisper to push WoWChatLog.txt to disk, but
  -- measured on 27 Sep that never wrote the file early (a /olv logtest marker waited 37 minutes, until logout), and
  -- lines arriving while logging was off were lost. The client writes the file every 48 KiB and at /reload or logout.
  flushLog = false,
  -- Open the officer panel (/olv) by itself when a new invite lands. false = sound and NEW marker only.
  uiAutoShow = true,
  -- Seconds between re-merges of the OlympusQueue table loaded at login or /reload; a new queue file needs a /reload (Sync & reload). 0 = only then.
  mergeSeconds = 45,
  -- Read mail bodies looking for "!verify" when the subject does not contain it. GetInboxText marks a mail read, so
  -- set this false if you would rather the addon never touch your mailbox; senders must then put !verify CODE in the
  -- SUBJECT for mail verification to work.
  readMail = true,
  -- Freeing a seat when the guild is full. The addon never removes anyone by itself: it ranks candidates in the
  -- officer panel and each removal takes two clicks. These are the guards on that ranking — loosen them carefully,
  -- because a removed member also loses their Discord access (the roster diff sees the departure).
  protectRankIndex = 1,   -- rank index <= this is never suggested (0 = Guild Master, 1 = Officer on the default ladder)
  -- Inactivity thresholds, by level: how long someone must have been offline before the panel will suggest them.
  -- A flat number could not say what was meant. On a guild two days old, "21 days" matched nobody while the guild
  -- sat at its cap -- and the seats were being held by level 1s made in the launch rush and never logged into
  -- again. The lowest applicable tier wins, so a level 1 needs a day, a level 9 needs a week, and anyone at all
  -- becomes a candidate at 30 days. Nothing here removes anybody: it ranks, and an officer clicks twice.
  offlineTiers = {
    { level = 1,  days = 1 },    -- level 1, away a day
    { level = 9,  days = 7 },    -- below 10, away a week
    { level = 19, days = 14 },   -- below 20, a fortnight
    { level = 29, days = 21 },   -- below 30, three weeks
  },
  offlineDaysAny = 30,    -- any level, once they have been gone this long

  -- How the panel's removal button behaves, and what the macro it writes contains.
  --
  -- C_GuildInfo.Uninvite is forbidden for addons on the Forever beta, so the button aims a one-line macro called
  -- OlvKick at the member instead and you click that on your action bar -- a macro body runs because you pressed
  -- it, not because an addon asked. Set removeVia = "api" on a client where the direct call is permitted.
  --
  -- The command is read from the client: SLASH_GUILDUNINVITE1..8 first, then any SLASH_ global holding a command
  -- we recognise. The Forever beta declares none of them (measured 19 Sep 2026), so it falls back to /guildremove,
  -- which is the one verified to work there -- /gkick is not registered on that client and fails silently.
  -- kickCommand = "/guildremove",
  -- removeVia = "macro",
  holdNote = "hold",      -- a public or officer note containing this word protects the member
  maxCandidates = 8,      -- how many to rank; the panel shows the top five

  -- Blizzard's guild roster limit. At it, the panel stops offering to send invites -- every one would be refused
  -- before it left -- and shows the removal candidates instead. One click arms "Send anyway" for six seconds, so a
  -- seat you just watched open is never blocked by a roster count that is up to a minute stale.
  guildCap = 1000,

  -- Presence: the invite queue lists only applicants who are online and in no guild. The addon learns both with
  -- /who, which the game allows only from a key press or click, so each press of the flush key (or the panel's
  -- Check / Send button) either invites the next applicant confirmed that way or runs one /who on the next one in
  -- line -- never both. Applicants found in another guild are whispered how to leave it (the same text, and the same
  -- once-a-day / three-times limit, as a refused invite). /olv all lists everyone; /olv queue prints each one's
  -- standing. false turns it all off and restores "every press invites the next queued".
  -- checkBeforeInvite = true,
  -- readyMinutes = 10,           -- how long "online, no guild" is trusted before the next press checks again
  -- offlineRecheckMinutes = 15,  -- how long an offline applicant stays off the list before being checked again
  -- guildedRecheckMinutes = 60,  -- likewise for one in another guild (a whisper from them clears it at once)
  -- whoGapSeconds = 5,           -- the server refuses a /who sent sooner than this after the last one; each refusal
  --                               adds half a second for the rest of the session
  -- whoTimeoutSeconds = 8,       -- how long a press waits for a /who answer; after that the person goes back in line
  --                               (answers take well under a second; /olv trace shows the timings)

  -- Whispers: the addon whispers only characters that have whispered you in the last 14 days (answers to a code
  -- whisper, the notices below, and the welcome on joining). Nobody else is ever whispered; for them a join is signed
  -- in a whisper to yourself, which the watcher reads and the chat window hides.
  -- Optional overrides (%s = character name in replyValid):
  -- replyValid   = "Olympus: code confirmed for %s. Your guild invite is queued; watch for it from an officer. Discord access follows once you are on the roster.",
  -- replyInvalid = "Olympus: that code is not valid or has expired. Press Get my code in #join-guild on the Olympus Discord for a fresh one.",
  -- replyMember  = "Olympus: code confirmed for %s. You are already on the guild roster, so no invite is needed; your Discord access follows on the next sync.",
  -- replyUsed    = "Olympus: that code has already been used by another character. Press Get my code in #join-guild on the Olympus Discord for your own.",
  -- Sent when the addon sees the character appear on the roster. The watcher trusts a join because of the signed
  -- "(ref OLVj-...)" marker the addon appends to this whisper, so keep it as a whisper — "X has joined the guild."
  -- in the chat log is exactly what any player can produce with /emote.
  -- replyJoined  = "Olympus: you are on the guild roster. Your Discord access follows within a minute.",

  -- Whispered to the applicant when the server refuses the invite for a reason they can see and we cannot fix for
  -- them. Only sent for refusals the server produced by name, which means the character is online and the whisper
  -- lands; "not found" (they are offline) sends nothing. Keep each under 255 bytes or the client truncates it
  -- without saying so. Discord DMs cover the same ground but are barred while the app is flagged, and
  -- /verify-status carries the same wording for anyone who was not online to be told.
  -- replyGuildFull      = "Olympus: we cannot invite you yet. The guild is at the 1000-member cap, so no invite can go out. You keep your place in the queue and we invite you the moment a seat frees. Nothing for you to do, and no need to verify again.",
  -- replyInAnotherGuild: no longer sent -- someone in another guild is taken off the queue and not whispered.
  -- replyInAnotherGuild = "Olympus: we cannot invite you while you are in another guild. This verification is for Olympus and no other guild. Type /gquit to leave your current guild, then wait for our invite. Your place in the queue is kept.",
  -- How often the same character may hear the same thing, and how many times in total. The defaults (once a day,
  -- three times) exist because the Worker re-queues a refused invite every six hours: without them, somebody who
  -- stays in their old guild for a week would be whispered twenty-eight times.
  -- noticeRepeat = 86400,
  -- noticeMax    = 3,

  -- Unverified-member removal (/olv unverified, and the panel's "Unverified" list). Who is unverified, and when each
  -- may be offered, comes from the Worker (UNVERIFIED_GRACE_DAYS, VERIFY_OPEN_SINCE in wrangler.toml). This only
  -- decides whether someone who is online right now may be offered too; by default they are held back, since
  -- whispering them to verify is kinder than removing them while they play.
  -- unverifiedIncludeOnline = false,
}

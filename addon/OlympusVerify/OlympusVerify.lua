--[[ OlympusVerify — officer-side addon for the Olympus Discord verification pipeline.

  What it does:
    * validates `!verify CODE` whispers (and mailed codes when a mailbox is open) offline with the shared secret,
      whispers back, and queues the guild invite
    * merges OlympusQueue.lua (written by the watcher from Discord approvals) into the same queue at login / reload
    * lists only applicants who are online and in no guild: /who (C_FriendList.SendWho, one per key press, like an
      invite) answers both, and "not found" / "already in a guild" replies to invites feed the same record. A press
      of the flush key invites the next applicant confirmed that way, or checks the next one in line. Anyone /who
      finds in another guild is taken off the queue and never whispered (their own code whisper puts them back)
    * whispers nobody who has not whispered this character first (within 14 days): refusal notices and the welcome
      on joining go only to such people; for anyone else a join is signed in a whisper to ourselves instead
    * fires ONE queued invite per press of the flush key / click of the on-screen button. C_GuildInfo.Invite needs a
      hardware event and each event allows exactly one protected call (measured on the Forever beta, 1.60.1.69893:
      allowed from a key press, blocked from a timer, and the second Invite in the same press is blocked too); the
      addon never manufactures an event. The server's answer ("not found", "is full", "has joined") is attached to
      the invite record.
    * notices accepted invites with C_GuildInfo.MemberExistsByName (callable any time) and marks them "joined"
    * public notes: C_GuildInfo.SetNote is forbidden for addons on the Forever beta even from a key press, so notes
      are off unless Config.lua sets setNotes = true; the first ADDON_ACTION_FORBIDDEN turns them off for the session
    * exports the full roster into SavedVariables (read by the watcher after logout / reload)
    * turns on chat logging so the watcher can read whispers from Logs\WoWChatLog.txt between reloads (the client
      flushes that file every 48 KiB of chat — minutes while guild chat is busy, longer when it is quiet)

  It sends no input, keeps nothing awake, and calls nothing protected outside a hardware event. ]]

local ADDON = ...
local L = OlympusHmac
local cfg = OlympusVerifyConfig or {}

BINDING_HEADER_OLYMPUSVERIFY = "Olympus Verify"
BINDING_NAME_OLYMPUSVERIFY_FLUSH = "Send queued guild invites"

local SECRET = cfg.secret
local VERSION = (C_AddOns and C_AddOns.GetAddOnMetadata and C_AddOns.GetAddOnMetadata(ADDON, "Version"))
  or (GetAddOnMetadata and GetAddOnMetadata(ADDON, "Version")) or "?"
local SET_NOTES = cfg.setNotes == true  -- SetNote is forbidden for addons on the Forever beta; leave false there
local notesForbidden = false            -- flipped by ADDON_ACTION_FORBIDDEN during a SetNote call
local flushingNotes = false
local removingMember = false          -- true only across the Uninvite call, so ADDON_ACTION_FORBIDDEN can be attributed
local editingMacro = false            -- likewise, across CreateMacro/EditMacro
local macroForbidden = false          -- this client will not let an addon touch macros either
local kickMacroTarget                 -- who the macro currently points at, so it is not rewritten every refresh
local KICK_MACRO = "OlvKick"
-- Unverified-member removal (see the section of that name). One table rather than a dozen locals, because this chunk
-- sits close enough to Lua 5.1's 200-local ceiling that new state belongs in a namespace. Declared here, above the
-- whisper handler, so a code confirmed mid-session takes that character off the list before the next /reload.
local Unverified = { session = {}, aim = {}, lastRosterAsk = 0 }
-- Who in the invite queue can accept an invite right now: online, and in no guild. Filled by /who checks, one per
-- key press, and by what invites and whispers give away. Same one-table reasoning; see the "presence" section.
local Presence = { lastSentAt = 0, misses = 0, open = {}, consumed = {} }
-- How the panel's removal button behaves. "macro" by default because C_GuildInfo.Uninvite is forbidden for addons
-- on this client, and attempting it costs a Blizzard warning popup every session. Set removeVia = "api" on a client
-- where the direct call works.
local REMOVE_VIA = (cfg.removeVia == "api") and "api" or "macro"
local JOIN_CHECK_INTERVAL = 30          -- seconds between MemberExistsByName checks for invited entries
local JOIN_CHECK_WINDOW = 15 * 60       -- how long after the invite we keep checking
local REPLY_WINDOW = 8                  -- seconds after an invite during which a system message is taken as its answer
local MAX_INVITE_ATTEMPTS = 5           -- "not found" (the applicant is offline) and "guild is full" are retried on later presses
local pendingReply                      -- { event = <invite event>, entry = <queue entry>, until = time }
local REPLY_OK = cfg.replyValid or "Olympus: code confirmed for %s. Your guild invite is queued; watch for it from an officer. Discord access follows once you are on the roster."
local REPLY_BAD = cfg.replyInvalid or "Olympus: that code is not valid or has expired. Press Get my code in #join-guild on the Olympus Discord for a fresh one."
local REPLY_MEMBER = cfg.replyMember or "Olympus: code confirmed for %s. You are already on the guild roster, so no invite is needed; your Discord access follows on the next sync."
local REPLY_RATE = 30            -- seconds between replies to the same sender
local MAX_ATTEMPTS = 10          -- per sender per session
-- A request code (7 symbols, 27 Sep) links whichever character whispers it first -- here, in the watcher and in the
-- Worker alike -- and is refused from anyone else for as long as it could still be valid.
local REPLY_USED = cfg.replyUsed or "Olympus: that code has already been used by another character. Press Get my code in #join-guild on the Olympus Discord for your own."
local TICKET_HOLD = 48 * 3600
local READ_MAIL_BODIES = cfg.readMail ~= false
local REPLY_JOINED = cfg.replyJoined or "Olympus: you are on the guild roster. Your Discord access follows within a minute."
-- Told to the applicant when the server refuses the invite for a reason they can see but we cannot explain in
-- silence. Both are whispers, because the Discord DM path is unavailable while the app is under review and this is
-- the one channel that reaches the right person at the moment it happens. Keep each under 255 bytes: the client
-- truncates a longer whisper without saying so.
local REPLY_FULL = cfg.replyGuildFull or "Olympus: we cannot invite you yet. The guild is at the 1000-member cap, so no invite can go out. You keep your place in the queue and we invite you the moment a seat frees. Nothing for you to do, and no need to verify again."
local REPLY_DECLINED = cfg.replyDeclined or "Olympus: you declined the guild invite, so we will not send another. If that was a mis-click, press Get my code in #join-guild on the Olympus Discord and whisper the new code, and you go back in the queue."
-- Two versions, because the useful one needs a code and the code needs the shared secret.
--
-- Telling somebody to leave their guild and then wait is the worst of both worlds: they pay the whole cost of
-- /gquit immediately and get nothing back until the queue happens to come round again, which at the member cap
-- can be never. Handing them their own code turns it into an exchange -- leave, whisper it back, and the Worker
-- lifts the hold on the row they already hold, at the position they already had.
-- No longer whispered (26 Sep: someone in another guild is taken off the queue, never whispered). Kept, with
-- InGuildReply below, only so an old Config.lua that overrides it still loads.
local REPLY_IN_GUILD = cfg.replyInAnotherGuild or "Olympus: we cannot invite you while you are in another guild. Type /gquit to leave it, then whisper me this code and you go straight back to the place you already hold in the queue: %s"
local REPLY_IN_GUILD_NOCODE = "Olympus: we cannot invite you while you are in another guild. This verification is for Olympus and no other guild. Type /gquit to leave your current guild, then wait for our invite. Your place in the queue is kept."
local NOTICE_REPEAT = tonumber(cfg.noticeRepeat) or 86400  -- seconds before the same character hears the same thing again
local NOTICE_MAX = tonumber(cfg.noticeMax) or 3            -- times in total; after that it is nagging, not informing
local NOTICE_KEEP = 30 * 86400                             -- how long the sent-notice record is kept before pruning
local GUILD_CAP = tonumber(cfg.guildCap) or 1000            -- Blizzard's guild roster limit; the panel greys out sending at it
local MERGE_INTERVAL = tonumber(cfg.mergeSeconds) or 45  -- how often to re-merge the OlympusQueue table loaded at login or /reload (0 = only then); a new file needs /reload
-- Freeing a seat when the guild is full. The addon never removes anyone on its own: it ranks candidates and an
-- officer clicks. See docs/design.md — the heuristics below are weak proxies for "inactive", and the cost of a wrong
-- removal (the member also loses their Discord access, because the roster diff sees the departure) is far higher than
-- the cost of asking a human.
local PROTECT_RANK_INDEX = tonumber(cfg.protectRankIndex) or 1   -- rank index <= this is never suggested (0 = GM, 1 = Officer)
-- How long a character must have been offline before the panel will even suggest it, by level.
--
-- A single threshold could not express what "inactive" actually means here. Olympus is two days old, so a flat
-- 21 days matched nobody at all while the guild sat at its cap -- and the characters actually holding those seats
-- are level 1s made during the launch rush and never logged into again. A level 1 that has not been seen in a day
-- is a placeholder; a level 40 that has not been seen in a week is somebody on holiday. The lowest applicable
-- threshold wins, which falls out of testing the tiers in ascending order.
local OFFLINE_TIERS = cfg.offlineTiers or {
  { level = 1,  days = 1 },    -- level 1, a day away
  { level = 9,  days = 7 },    -- below 10
  { level = 19, days = 14 },   -- below 20
  { level = 29, days = 21 },   -- below 30
}
table.sort(OFFLINE_TIERS, function(a, b) return (a.level or 0) < (b.level or 0) end)  -- the lookup needs ascending
local OFFLINE_DAYS_ANY = tonumber(cfg.offlineDaysAny) or 30      -- any level at all, once they have been gone this long

local function RequiredDaysOffline(level)
  level = tonumber(level) or 0
  for _, t in ipairs(OFFLINE_TIERS) do
    if level <= (t.level or 0) then return t.days or OFFLINE_DAYS_ANY end
  end
  return OFFLINE_DAYS_ANY
end

-- Built from the tiers rather than written out, so the description can never drift from the rule it describes.
local function OfflineRuleText()
  local parts = {}
  for _, t in ipairs(OFFLINE_TIERS) do
    parts[#parts + 1] = ((t.level or 0) <= 1 and "L1" or ("<" .. ((t.level or 0) + 1))) .. " " .. tostring(t.days) .. "d"
  end
  parts[#parts + 1] = "any " .. tostring(OFFLINE_DAYS_ANY) .. "d"
  return table.concat(parts, " \194\183 ")
end

-- "away 1 days" is a poor way to say 30 hours, and at a one-day threshold that is the common case.
local function AwayText(days)
  days = days or 0
  if days < 2 then return string.format("%dh", math.floor(days * 24)) end
  return string.format("%dd", math.floor(days))
end
local HOLD_NOTE = string.lower(cfg.holdNote or "hold")           -- a public or officer note containing this protects the member
local MAX_CANDIDATES = tonumber(cfg.maxCandidates) or 8          -- how many to rank
local CONFIRM_WINDOW = 6                                          -- seconds a removal stays armed after the first click
local ROSTER_THROTTLE = 60       -- seconds between roster exports
local MAX_EVENTS = 500           -- SavedVariables event ring

local FLUSH_LOG = false                     -- no automatic flush since 0.6.3 (see FlushChatLog); cfg.flushLog is ignored
local FLUSH_LOG_DELAY = 2                   -- seconds; coalesces bursts and lets the reply whisper land in the same write
local ALERT_SOUND = 8959                    -- SOUNDKIT.RAID_WARNING; played when a new invite lands in the queue
local ALERT_WINDOW = 120                    -- seconds the button stays highlighted after a new invite

local frame = CreateFrame("Frame", "OlympusVerifyFrame")
local booted = false                    -- file scope, so it resets on every load: InitDB runs twice per session
local lastReply, attempts = {}, {}
local lastRosterExport = 0
local mailboxOpen = false
local flushScheduled = false
local alertTimer                        -- true while the NEW-marker expiry refresh is scheduled
local guildFullAt = 0                   -- last time the server answered an invite with "Guild is full."
local kickForbidden = false             -- flipped if the client refuses Uninvite to addons at all
local armedRemoval                      -- { name = , until_ = } — first click arms, second confirms
local alertUntil = 0

local function Print(msg) DEFAULT_CHAT_FRAME:AddMessage("|cffc9a227Olympus|r: " .. tostring(msg)) end

-- The client writes WoWChatLog.txt in 48 KiB chunks (measured on the Forever beta, 17 Sep 2026), so a whisper can sit
-- in the buffer for minutes. Turning logging off and on again should close and reopen the file and so write the buffer
-- out. Measured 27 Sep with off and on in the same frame: nothing was written -- lines still waited 40 s to 6 min for
-- the next 48 KiB batch -- so the client seems to act only on the state at the end of the frame. This version turns it
-- back on a fifth of a second later instead, so the off state is real; /olv logtest measures whether that writes the
-- buffer (the watcher reports the seconds). Lines arriving in that fifth of a second are not logged, which is why the
-- flush follows only the events the watcher waits for. LoggingChat is not protected, and it is silent.
-- It did not: /olv logtest on 27 Sep (0.6.2, the fifth-of-a-second version) put its marker in the file 37 minutes
-- later, at the 19:08 logout. So the automatic flush is off from 0.6.3 (FLUSH_LOG): it never wrote the file early,
-- and every toggle can drop the lines that arrive while logging is off. The client writes the file every 48 KiB of
-- chat and at /reload or logout; the Sync & reload button is the way to push it now. /olv flushlog, the panel's
-- Flush chat log button and /olv logtest still toggle it by hand, for measuring.
local function FlushChatLog()
  if not FLUSH_LOG or not LoggingChat or flushScheduled then return end
  flushScheduled = true
  local function reopen()
    pcall(LoggingChat, true)
    flushScheduled = false
  end
  local function doFlush()
    if LoggingChat() then
      pcall(LoggingChat, false)
      if C_Timer and C_Timer.After then C_Timer.After(0.2, reopen) else reopen() end
    else
      flushScheduled = false
    end
  end
  if C_Timer and C_Timer.After then C_Timer.After(FLUSH_LOG_DELAY, doFlush) else doFlush() end
end

-- A new invite is waiting for a key press: make it hard to miss for the officer who is online anyway.
local function AlertNewInvite()
  alertUntil = time() + ALERT_WINDOW
  if PlaySound then pcall(PlaySound, ALERT_SOUND, "Master") end
  if OlympusVerifyUI and OlympusVerifyUI.Alert then OlympusVerifyUI.Alert() end
end

local function InitDB()
  OlympusVerifyDB = OlympusVerifyDB or {}
  local db = OlympusVerifyDB
  db.version = 1
  db.events = db.events or {}
  db.queue = db.queue or {}          -- { {id=, name=, target=, discordId=, note=, status=queued|invited|joined|failed, reply=, ts=, source=} }
  db.notePending = db.notePending or {} -- { {name=, note=, ts=} }
  db.roster = db.roster or {}
  db.processedMail = db.processedMail or {}
  -- Remembered, so the panel does not have to learn it again -- and show the Blizzard warning again -- every
  -- session. Delete the SavedVariables file if a future client ever allows addon removals.
  if db.kickForbidden then kickForbidden = true end
  -- What each character has already been told, keyed by name so it survives the queue entry being replaced.
  -- The Worker re-serves a refused invite every few hours; without this, "you are in another guild" would be
  -- whispered again on every one of those passes.  { [nameKey] = { [kind] = { at = <ts>, n = <count> } } }
  db.notices = db.notices or {}
  -- How many times this database has been loaded. If it never goes above 1, SavedVariables is not persisting and
  -- the queue, the event ring and the notice history all start empty every session -- which is what the panel has
  -- been showing ("0 events" beside a busy queue) and what no amount of reading the files could explain.
  -- InitDB runs on both ADDON_LOADED and PLAYER_LOGIN, hence the once-per-load guard rather than a bare increment.
  if not booted then booted = true; db.boots = (db.boots or 0) + 1 end
  -- Last known presence per character: { [nameKey] = { state = free|guilded|offline|member, at =, guild =, level =,
  -- what =, zone =, seenAt = } }. Kept across /reload, which the queue file forces often; a day old is worthless.
  db.presence = db.presence or {}
  for k, rec in pairs(db.presence) do
    if math.max(rec.at or 0, rec.seenAt or 0) < time() - 86400 then db.presence[k] = nil end
  end
  local cutoff = time() - NOTICE_KEEP
  for k, kinds in pairs(db.notices) do
    local live = false
    for _, rec in pairs(kinds) do if (rec.at or 0) > cutoff then live = true break end end
    if not live then db.notices[k] = nil end
  end
  return db
end

local function Event(e)
  local db = OlympusVerifyDB
  e.ts = e.ts or time()
  table.insert(db.events, e)
  while #db.events > MAX_EVENTS do table.remove(db.events, 1) end
end

local function BaseName(full) return (string.match(full or "", "^([^%-]+)")) end

local function FindQueued(nameKey)
  for _, q in ipairs(OlympusVerifyDB.queue) do
    if L.normalizeCharacter(q.name) == nameKey and q.status == "queued" then return q end
  end
end

local function Enqueue(entry)
  local key = L.normalizeCharacter(entry.name)
  if FindQueued(key) then return false end
  entry.status = "queued"
  entry.ts = entry.ts or time()
  table.insert(OlympusVerifyDB.queue, entry)
  return true
end

local function QueuedCount()
  local n = 0
  for _, q in ipairs(OlympusVerifyDB.queue) do if q.status == "queued" then n = n + 1 end end
  return n
end

-- ---------------------------------------------------------------- code intake
-- Already on the roster? (an existing member linking their Discord, or someone an officer invited by hand)
-- C_GuildInfo.MemberExistsByName answers from the client's roster copy and is not protected (measured on the beta).
local function InGuildAlready(...)
  if not (C_GuildInfo and C_GuildInfo.MemberExistsByName) then return false end
  for i = 1, select("#", ...) do
    local name = select(i, ...)
    if name and name ~= "" then
      local ok, exists = pcall(C_GuildInfo.MemberExistsByName, name)
      if ok and exists then return true end
    end
  end
  return false
end

-- ---------------------------------------------------------------- who may be whispered
-- Viktor, 26 Sep: "ensure I don't whisper people unless they whisper me first". The addon whispers a character only
-- if that character has whispered this one within CONTACT_DAYS. Every whisper the addon starts goes through here:
-- the refusal notices (NoticeApplicant) and the welcome on joining (ConfirmJoin). Replies to a code whisper need no
-- check -- the code whisper is the first whisper.
local CONTACT_DAYS = 14

local function NoteContact(sender)
  local db = OlympusVerifyDB
  local base = BaseName(sender)
  if not db or not base or base == "" then return end
  db.contacts = db.contacts or {}
  db.contacts[L.normalizeCharacter(base)] = time()
end

local function IsContact(name)
  local db = OlympusVerifyDB
  local base = BaseName(name)
  if not db or not db.contacts or not base or base == "" then return false end
  local at = db.contacts[L.normalizeCharacter(base)]
  return at ~= nil and time() - at <= CONTACT_DAYS * 86400
end

-- At login: forget contacts older than CONTACT_DAYS, and count the whispers already in the event log (from before
-- this list existed), so nobody who did whisper first is treated as a stranger.
local function SeedContacts(db)
  db.contacts = db.contacts or {}
  local cutoff = time() - CONTACT_DAYS * 86400
  for _, e in ipairs(db.events or {}) do
    if type(e) == "table" and e.type == "whisper" and type(e.name) == "string" and (e.ts or 0) > cutoff then
      local key = L.normalizeCharacter(e.name)
      if (db.contacts[key] or 0) < e.ts then db.contacts[key] = e.ts end
    end
  end
  for k, at in pairs(db.contacts) do if type(at) ~= "number" or at < cutoff then db.contacts[k] = nil end end
end

-- The token after "!verify" -- any case, since a phone keyboard capitalises the first letter -- or nil when the text is
-- not a verify command. Only the run of letters and digits is taken, so trailing punctuation does not matter; whether
-- that run is a code at all is OlympusHmac.strictCode's call, the same rule the watcher applies.
local function VerifyToken(text, anchored)
  if type(text) ~= "string" then return nil end
  local _, e = string.find(string.lower(text), anchored and "^%s*!verify%s+" or "!verify%s+")
  if not e then return nil end
  return string.match(text, "^(%w+)", e + 1)
end

-- guid: the sender's character ID, from the whisper event itself (arg 12), when the client lets the addon read it
local function HandleCode(source, sender, text, guid)
  if not SECRET then Print("Config.lua is missing or has no secret — codes cannot be checked.") return end
  local token = VerifyToken(text, true)
  if not token then return end
  local base = BaseName(sender)
  local key = L.normalizeCharacter(base)
  attempts[key] = (attempts[key] or 0) + 1
  if attempts[key] > MAX_ATTEMPTS then return end
  -- A 6-symbol code is bound to this character; a 7-symbol request code (27 Sep) is bound to the Discord request, and
  -- the sender -- vouched for by the server -- is the character it links. Both are checked offline with the secret.
  local code = L.strictCode(token)
  local kind = code and L.checkCode(SECRET, base, code) or nil
  if kind == "ticket" then
    -- First sender wins. Without this one leaked request code queued an invite for every character that sent it.
    local db = OlympusVerifyDB
    db.tickets = db.tickets or {}
    local held = db.tickets[code]
    if type(held) == "table" and held.name ~= key and time() - (held.at or 0) < TICKET_HOLD then
      Event({ type = source, name = base, target = sender, code = code, ok = false, kind = kind, detail = "request code already used by another character" })
      Print(string.format("%s from %s: that request code was already used by another character — refused.", source, base))
      if source == "whisper" and (lastReply[key] or 0) + REPLY_RATE <= time() then
        lastReply[key] = time()
        SendChatMessage(REPLY_USED, "WHISPER", nil, sender)
      end
      return
    end
    if type(held) ~= "table" or held.name ~= key then db.tickets[code] = { name = key, at = time() } end
  end
  local ok = kind ~= nil
  code = code or string.sub(string.upper(token), 1, 12)
  local member = ok and InGuildAlready(sender, base) or false
  guid = ok and Presence.IsGuid(guid) and guid or nil
  Event({ type = source, name = base, target = sender, code = code, ok = ok, inGuild = member, kind = kind, guid = guid })
  if ok then
    Unverified.session[key] = true  -- verified now: the unverified list on disk predates this
    local reply
    if member then
      -- no invite to send: the Worker grants the role as soon as the watcher relays this code (it checks its roster copy)
      Print(string.format("%s from %s: code confirmed — already on the roster, no invite needed.", source, base))
      reply = string.format(REPLY_MEMBER, base)
    else
      -- Taken off for being in another guild, and now here with their code: the same row goes back in the queue.
      local queued = Presence.Revive(key) or Enqueue({ name = base, target = sender, source = source })
      Print(string.format("%s from %s: code confirmed%s.", source, base, queued and " — invite queued" or " (already queued)"))
      reply = string.format(REPLY_OK, base)
      if queued then AlertNewInvite() end
    end
    if source == "whisper" then
      local now = time()
      if (lastReply[key] or 0) + REPLY_RATE <= now then
        lastReply[key] = now
        SendChatMessage(reply, "WHISPER", nil, sender)
      end
      -- which character this is, signed, for the watcher: the link is pinned to it at once rather than to whatever
      -- character has this name at the next roster export
      if guid then Presence.Safely("noting the whisperer's character", Presence.NoteIdentity, base, guid) end
      FlushChatLog() -- the watcher reads this whisper from the chat log; push it to disk now
    end
    frame:UpdateButton()
  else
    Print(string.format("%s from %s: invalid or expired code (%s).", source, base, code))
    if source == "whisper" then
      local now = time()
      if (lastReply[key] or 0) + REPLY_RATE <= now then
        lastReply[key] = now
        SendChatMessage(REPLY_BAD, "WHISPER", nil, sender)
      end
    end
  end
end

local mailBodyChecked = {}   -- per session: MAIL_INBOX_UPDATE fires repeatedly, and GetInboxText marks mail read
local function ScanMailbox()
  if not mailboxOpen then return end
  local n = GetInboxNumItems and GetInboxNumItems() or 0
  for i = 1, n do
    local _, _, sender, subject = GetInboxHeaderInfo(i)
    if sender then
      local text = subject or ""
      if not string.find(string.lower(text), "!verify", 1, true) and READ_MAIL_BODIES then
        -- GetInboxText marks the mail read, and this event fires on every inbox refresh, so each mail is opened at
        -- most once per session. Officers who would rather the addon never touch their mail set readMail = false.
        local mailKey = sender .. "|" .. (subject or "") .. "|" .. i
        if not mailBodyChecked[mailKey] then
          mailBodyChecked[mailKey] = true
          local body = GetInboxText(i)
          text = body or ""
        end
      end
      local code = VerifyToken(text, false)
      if code then
        local mkey = sender .. ":" .. string.upper(code)
        if not OlympusVerifyDB.processedMail[mkey] then
          OlympusVerifyDB.processedMail[mkey] = time()
          HandleCode("mail", sender, "!verify " .. code)
        end
      end
    end
  end
end

-- ---------------------------------------------------------------- roster export
-- GetGuildRosterInfo indexes the *displayed* roster, so without this the export silently contains only the members
-- who happen to be online — and the Worker would then strip the role from everyone else. Measured on the beta:
-- GetNumGuildMembers() returned 450 total / 422 online.
local function ShowOfflineMembers()
  if SetGuildRosterShowOffline then pcall(SetGuildRosterShowOffline, true) end
  if C_GuildInfo and C_GuildInfo.GuildRoster then pcall(C_GuildInfo.GuildRoster)
  elseif GuildRoster then pcall(GuildRoster) end
end

local function ExportRoster(force)
  if not IsInGuild() then return end
  local now = time()
  if not force and now - lastRosterExport < ROSTER_THROTTLE then return end
  ShowOfflineMembers()
  local total, online = GetNumGuildMembers()
  if not total or total == 0 then return end
  lastRosterExport = now
  local members = {}
  for i = 1, total do
    local name, rank, rankIndex, level, _, _, note, onote, online, _, classFile, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    if name then
      local lastOnline = 0
      if not online and GetGuildRosterLastOnline then
        local y, m, d, h = GetGuildRosterLastOnline(i)
        lastOnline = ((y or 0) * 365 + (m or 0) * 30 + (d or 0)) * 86400 + (h or 0) * 3600
      end
      members[#members + 1] = { name = BaseName(name), full = name, rank = rank, rankIndex = rankIndex, level = level, class = classFile, note = note, onote = onote, guid = guid, lastOnline = lastOnline }
    end
  end
  -- Second guard, on this side of the wire: an export far smaller than the last one is almost certainly truncated
  -- (show-offline off, or a GUILD_ROSTER_UPDATE that fired before the full list arrived). Keep the previous one.
  local prev = OlympusVerifyDB.roster
  local prevCount = prev and prev.members and #prev.members or 0
  if not force and prevCount > 0 and #members < prevCount * 0.9 then
    Print(string.format("roster export looked short (%d members vs %d last time) — kept the previous export. /olv roster forces one.", #members, prevCount))
    return nil
  end
  OlympusVerifyDB.roster = { exportedAt = now, members = members, total = total, online = online }
  return #members
end

-- ---------------------------------------------------------------- freeing a seat when the guild is full
-- Ranks who could be removed, with the evidence, and removes nobody. Three things make an automatic version a bad
-- idea and they are all encoded here as guards instead:
--   * GetGuildRosterLastOnline is a DURATION since last seen and reads 0 for anyone currently online, so an unguarded
--     "longest offline" sort puts the people playing right now at the top.
--   * removing a member also strips their Discord access, because the roster diff sees the departure.
--   * "inactive" is a guess; rank, a hold note and a minimum absence are cheap ways to stop the guess being costly.
local function DaysOffline(i, online)
  if online then return 0 end
  if not GetGuildRosterLastOnline then return nil end
  local y, m, d, h = GetGuildRosterLastOnline(i)
  if y == nil and m == nil and d == nil and h == nil then return nil end
  return (y or 0) * 365 + (m or 0) * 30 + (d or 0) + (h or 0) / 24
end

local function RemovalCandidates(limit)
  if not IsInGuild() then return {} end
  ShowOfflineMembers()
  local me = Presence.MyName()  -- the whole name: on the 27 Sep client UnitName("player") gives only its first part
  local total = GetNumGuildMembers()
  local out = {}
  for i = 1, (total or 0) do
    local name, rank, rankIndex, level, _, _, note, onote, online, _, classFile = GetGuildRosterInfo(i)
    if name then
      local base = BaseName(name)
      local days = DaysOffline(i, online)
      local need = RequiredDaysOffline(level)
      local held = (string.find(string.lower(note or ""), HOLD_NOTE, 1, true) ~= nil)
        or (string.find(string.lower(onote or ""), HOLD_NOTE, 1, true) ~= nil)
      -- every exclusion is deliberate: online now, senior rank, an explicit hold, not away long enough, yourself,
      -- or a client that would not tell us how long they have been gone
      if not online
        and base ~= me
        and not held
        and days ~= nil
        and days >= need
        and (rankIndex == nil or rankIndex > PROTECT_RANK_INDEX)
      then
        out[#out + 1] = { name = base, full = name, rank = rank, rankIndex = rankIndex, level = level or 0,
                          class = classFile, days = days, need = need, note = note, index = i }
      end
    end
  end
  -- Ranked by how far past its own threshold each one is, not by raw days. With tiered thresholds raw days would
  -- bury a level 1 abandoned for three days beneath a level 40 away for three weeks, when the first is far more
  -- clearly a seat nobody is using. A lower level still breaks a tie: less invested.
  table.sort(out, function(a, b)
    local ea, eb = (a.days or 0) - (a.need or 0), (b.days or 0) - (b.need or 0)
    if ea ~= eb then return ea > eb end
    if (a.level or 0) ~= (b.level or 0) then return (a.level or 0) < (b.level or 0) end
    return a.name < b.name
  end)
  local capped = {}
  for i = 1, math.min(#out, limit or MAX_CANDIDATES) do capped[i] = out[i] end
  return capped, #out
end

-- Point a one-line macro at a member, so removing them is one click on an action bar.
--
-- The client refuses C_GuildInfo.Uninvite from an addon (ADDON_ACTION_FORBIDDEN, measured 19 Sep), and there is no
-- way around that -- nor should there be. But /gkick typed by a player is ordinary, and a macro is the same thing:
-- its body runs because the officer pressed the button, not because an addon asked. So the addon keeps doing the
-- part it is allowed to do, which is working out who is least invested, and hands over a single click for the part
-- only a person may do. The alternative was reading a name out of a chat frame that cannot even be selected.
-- Which slash command this client actually uses to remove a guild member.
--
-- /gkick, /guildremove, /gremove, /guildkick, /guilduninvite and /guninvite are all aliases of one handler, so on a
-- stock client it makes no difference which is written into the macro. This is not a stock client, and a macro
-- containing a command the client does not register fails silently -- the game answers "Type /help for a listing"
-- and nothing happens, which looks exactly like the removal being blocked. So rather than pick one and hope, read
-- the aliases the client itself declares and use the first it offers. Config.lua can still override.
-- Measured on the Forever beta, 19 Sep: SLASH_GUILDUNINVITE1..8 are all nil -- this client declares no alias under
-- the documented constant at all, so the loop below finds nothing and the fallback decides everything. /gkick was
-- the wrong fallback: it is not registered here, and a macro containing an unregistered command fails silently,
-- which is indistinguishable from the removal being blocked. /guildremove works, confirmed by hand.
local KICK_COMMANDS = { "/guildremove", "/gremove", "/guilduninvite", "/guninvite", "/guildkick", "/gkick" }
local kickCommandCache, kickCommandSource

local function GuildKickCommand()
  if type(cfg.kickCommand) == "string" and cfg.kickCommand ~= "" then return cfg.kickCommand, "Config.lua" end
  if kickCommandCache then return kickCommandCache, kickCommandSource end
  -- 1. the documented constant, for clients that do declare it
  for i = 1, 8 do
    local s = _G["SLASH_GUILDUNINVITE" .. i]
    if type(s) == "string" and s ~= "" then kickCommandCache, kickCommandSource = s, "SLASH_GUILDUNINVITE" .. i; return kickCommandCache, kickCommandSource end
  end
  -- 2. any SLASH_* global holding a command we recognise, in case it is registered under another name here
  local known = {}
  for _, c in ipairs(KICK_COMMANDS) do known[c] = true end
  for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "string" and string.sub(k, 1, 6) == "SLASH_" and known[string.lower(v)] then
      kickCommandCache, kickCommandSource = v, k
      return kickCommandCache, kickCommandSource
    end
  end
  -- 3. the one measured to work on this client
  kickCommandCache, kickCommandSource = "/guildremove", "fallback — no SLASH_ alias declared; /guildremove verified by hand on this client"
  return kickCommandCache, kickCommandSource
end

local function PointKickMacro(name)
  if macroForbidden or type(name) ~= "string" or name == "" then return false, "unavailable" end
  if not (CreateMacro and EditMacro and GetMacroIndexByName) then return false, "no macro API on this client" end
  if InCombatLockdown and InCombatLockdown() then return false, "not in combat" end
  if kickMacroTarget == name then return true end
  local body = GuildKickCommand() .. " " .. name
  editingMacro = true
  local idx = GetMacroIndexByName(KICK_MACRO)
  local ok
  if idx and idx > 0 then
    ok = pcall(EditMacro, idx, KICK_MACRO, "INV_Misc_QuestionMark", body)
  else
    ok = pcall(CreateMacro, KICK_MACRO, "INV_Misc_QuestionMark", body, false)
    if not ok then ok = pcall(CreateMacro, KICK_MACRO, 1, body, false) end  -- older clients want an icon index
  end
  editingMacro = false
  if macroForbidden then return false, "macros are forbidden for addons on this client" end
  if not ok then return false, "the macro list may be full (18 per character)" end
  kickMacroTarget = name
  if OlympusVerifyDB then OlympusVerifyDB.kickMacro = true end
  return true
end

-- Called only from a button in the panel, so it is a hardware event and gets its one protected call. Two clicks:
-- the first arms, the second inside CONFIRM_WINDOW performs it. Nothing else in this addon removes a member.
function OlympusVerify_RemoveMember(name, reason)
  if type(name) ~= "string" or name == "" then return end
  if kickForbidden then
    Print("this client does not let addons remove guild members — do it by hand with /gkick " .. name .. ".")
    return false
  end
  if not (armedRemoval and armedRemoval.name == name and time() <= armedRemoval.until_) then
    armedRemoval = { name = name, until_ = time() + CONFIRM_WINDOW }
    Print(string.format("click again within %ds to remove %s from the guild.", CONFIRM_WINDOW, name))
    if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
    return false
  end
  armedRemoval = nil
  local ok, err
  -- Bracketed the same way SetNote is. ADDON_ACTION_FORBIDDEN is an event, not a Lua error, so pcall returns
  -- success and the call quietly does nothing -- the flag is the only way to know it was ours.
  removingMember = true
  if C_GuildInfo and C_GuildInfo.Uninvite then ok, err = pcall(C_GuildInfo.Uninvite, name)
  elseif GuildUninvite then ok, err = pcall(GuildUninvite, name)
  else ok, err = false, "no uninvite API" end
  removingMember = false
  if kickForbidden then ok, err = false, "forbidden for addons on this client" end
  Event({ type = "removed", name = name, ok = ok and true or false, reason = reason or "space",
          detail = ok and ((reason == "unverified") and "not verified" or "freed a seat") or tostring(err) })
  if ok and reason == "unverified" then
    Print(string.format("%s removed from the guild (not verified).", name))
  elseif ok then
    Print(string.format("%s removed to free a seat. Send the invite with your flush key.", name))
  else
    Print(string.format("could not remove %s: %s", name, tostring(err)))
  end
  FlushChatLog()
  if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
  return ok
end

-- ---------------------------------------------------------------- unverified members
-- Who the Worker reports as in the guild but not verified, re-checked against what this client can see right now.
--
-- The Worker owns the definition and the grace period (worker/src/unverified.ts), so Discord and this panel always
-- agree. A member is offered only once the LATER of first appearing on the roster and the day verification started
-- working again (build .32, 25 Sep 2026) plus the grace days has passed. Almost everyone unverified on 25 Sep had
-- tried and been stopped by the Battle.net outage, so their clock starts at the fix, not at their join.
--
-- The addon adds only what it can see live: still in the guild, current rank, online now, a hold note, a code
-- confirmed since login. It removes nobody. It chooses; the officer aims the OlvKick macro and presses it.
Unverified.includeOnline = cfg.unverifiedIncludeOnline == true  -- someone online now can simply be whispered
Unverified.kickedPattern = (function()
  -- Built from the client's own format string so a localized client matches too. Every magic character is escaped,
  -- % included, and the escaped %s placeholders then become captures.
  local s = type(ERR_GUILD_REMOVE_SS) == "string" and ERR_GUILD_REMOVE_SS or "%s has been kicked out of the guild by %s."
  s = string.gsub(s, "([%^%$%(%)%.%[%]%*%+%-%?%%])", "%%%1")
  s = string.gsub(s, "%%%%s", "(.+)")
  return "^" .. s .. "$"
end)()

function Unverified.Source()
  local q = OlympusQueue
  local u = type(q) == "table" and q.unverified or nil
  if type(u) ~= "table" or type(u.members) ~= "table" then return nil end
  return u
end

-- Ranks switched off in the panel or with /olv unverified. Empty means every rank is shown. Kept in SavedVariables
-- so the choice survives a /reload -- which is exactly when a fresh list arrives.
function Unverified.Excluded()
  local db = OlympusVerifyDB
  if type(db) ~= "table" then return {} end
  if type(db.unverifiedExcluded) ~= "table" then db.unverifiedExcluded = {} end
  return db.unverifiedExcluded
end

function Unverified.ToggleRank(rank)
  if type(rank) ~= "string" or rank == "" then return end
  local ex = Unverified.Excluded()
  if ex[rank] then ex[rank] = nil else ex[rank] = true end
end

function Unverified.GrabRoster()
  -- Offline members only appear while show-offline is on. Asking the server for a fresh roster is throttled: the
  -- panel refreshes every few seconds and every request comes back as a GUILD_ROSTER_UPDATE.
  if SetGuildRosterShowOffline then pcall(SetGuildRosterShowOffline, true) end
  local t = time()
  if t - (Unverified.lastRosterAsk or 0) >= 30 then
    Unverified.lastRosterAsk = t
    if C_GuildInfo and C_GuildInfo.GuildRoster then pcall(C_GuildInfo.GuildRoster) elseif GuildRoster then pcall(GuildRoster) end
  end
end

function Unverified.When(ts)
  ts = tonumber(ts)
  if not ts then return "?" end
  return date("%a %d %b %H:%M", ts)
end

-- Returns the offered candidates (best first, capped), a summary, and an error text when there is nothing to judge.
-- Held members are counted by reason rather than listed: the panel acts on the top row, and "why is X not here" is
-- answered by /olv unverified.
function Unverified.Candidates(limit)
  local info = { total = 0, inGuild = 0, gone = 0, offered = 0, held = {}, byRank = {}, nextEligible = nil }
  local src = Unverified.Source()
  if not src then return {}, info, "no list yet — deploy Worker .34, restart the watcher, then /reload" end
  if not IsInGuild() then return {}, info, "you are not in a guild" end
  info.noFirstSeen = (src.firstSeenAvailable == false)
  info.graceDays = tonumber(src.graceDays)
  -- request codes out that nobody has whispered yet: their holders are not marked "verifying now" (no name until then)
  info.openTickets = tonumber(src.openTickets) or 0
  info.listAt = tonumber(src.snapshotAt)
  Unverified.GrabRoster()
  local live = {}
  for i = 1, (GetNumGuildMembers() or 0) do
    local name, rank, rankIndex, level, _, _, note, onote, online, _, classFile = GetGuildRosterInfo(i)
    if name then
      live[L.normalizeCharacter(BaseName(name))] = { i = i, full = name, rank = rank, rankIndex = rankIndex, level = level,
                                                    note = note, onote = onote, online = online, class = classFile }
    end
  end
  local me = L.normalizeCharacter(Presence.MyName() or "")
  local now = time()
  local ex = Unverified.Excluded()
  local out = {}
  for _, m in ipairs(src.members) do
    info.total = info.total + 1
    local nk = L.normalizeCharacter(m.name or "")
    local lv = (nk ~= "") and live[nk] or nil
    if not lv then
      info.gone = info.gone + 1  -- left, or removed, since the list was written
    else
      info.inGuild = info.inGuild + 1
      local rank = lv.rank or m.rank or "?"
      local rankIndex = lv.rankIndex
      local protected = rankIndex ~= nil and rankIndex <= PROTECT_RANK_INDEX
      local hold = (string.find(string.lower(lv.note or ""), HOLD_NOTE, 1, true) ~= nil)
        or (string.find(string.lower(lv.onote or ""), HOLD_NOTE, 1, true) ~= nil)
      local eligibleAt = tonumber(m.eligibleAt)
      -- Every exclusion is deliberate, and they are checked from most to least certain.
      local why
      if nk == me then why = "you"
      elseif Unverified.session[nk] then why = "verified since login"
      elseif protected then why = "protected rank"
      elseif hold then why = "hold note"
      elseif m.pending then why = "verifying now"
      elseif not eligibleAt then why = "join date unknown"
      elseif eligibleAt > now then why = "grace period"
      elseif lv.online and not Unverified.includeOnline then why = "online now"
      end
      local br = info.byRank[rank]
      if not br then
        br = { rank = rank, rankIndex = rankIndex, offered = 0, held = 0, protected = protected }
        info.byRank[rank] = br
      end
      if why == "grace period" and (not info.nextEligible or eligibleAt < info.nextEligible) then info.nextEligible = eligibleAt end
      local shown = not ex[rank]
      if why then
        br.held = br.held + 1
        if shown then info.held[why] = (info.held[why] or 0) + 1 end
      else
        br.offered = br.offered + 1
        if shown then
          out[#out + 1] = { name = BaseName(lv.full), full = lv.full, rank = rank, rankIndex = rankIndex or 99,
                            level = lv.level or m.level or 0, class = lv.class, days = DaysOffline(lv.i, lv.online),
                            here = tonumber(m.firstSeen) and ((now - m.firstSeen) / 86400) or nil, reason = "unverified" }
        end
      end
    end
  end
  -- Lowest rank first, then longest away, then least invested: the order an officer would work down by hand.
  table.sort(out, function(a, b)
    if a.rankIndex ~= b.rankIndex then return a.rankIndex > b.rankIndex end
    local da, dz = a.days or 0, b.days or 0
    if da ~= dz then return da > dz end
    if (a.level or 0) ~= (b.level or 0) then return (a.level or 0) < (b.level or 0) end
    return a.name < b.name
  end)
  info.offered = #out
  local capped = {}
  for i = 1, math.min(#out, limit or #out) do capped[i] = out[i] end
  return capped, info
end

-- The ranks seen in the list, lowest first, protected ones included so the panel can say they exist.
function Unverified.Ranks(info)
  local list = {}
  for _, br in pairs(info and info.byRank or {}) do list[#list + 1] = br end
  table.sort(list, function(a, b)
    if (a.rankIndex or 99) ~= (b.rankIndex or 99) then return (a.rankIndex or 99) > (b.rankIndex or 99) end
    return tostring(a.rank) < tostring(b.rank)
  end)
  return list
end

-- ---------------------------------------------------------------- the roster window's data (0.6.4)
-- Every guild member, live from the client's roster, with whether they have linked Discord and, from Worker .41 on,
-- their Discord username and display name. The verified list comes in OlympusQueue.lua like the unverified one, so it
-- is as fresh as the last /reload. Read-only: OlympusVerifyRoster.lua filters and sorts this and changes nothing.
local Roster = {}
Roster.STATUS_ORDER = { verified = 1, pending = 2, unverified = 3, unknown = 4 }

-- The verified list, keyed by character GUID (survives a rename) and by name.
function Roster.Linked()
  local q = OlympusQueue
  local v = type(q) == "table" and type(q.verified) == "table" and q.verified or nil
  if not v or type(v.members) ~= "table" then return nil end
  local byGuid, byName = {}, {}
  for _, m in ipairs(v.members) do
    if type(m) == "table" and type(m.name) == "string" and m.name ~= "" then
      if type(m.guid) == "string" and m.guid ~= "" then byGuid[m.guid] = m end
      byName[L.normalizeCharacter(m.name)] = m
    end
  end
  return { byGuid = byGuid, byName = byName, fetchedAt = tonumber(v.fetchedAt) }
end

local function nonEmpty(s) return (type(s) == "string" and s ~= "") and s or nil end

-- Discord names as text the client draws as written. A display name may hold "|", which starts an escape in anything
-- WoW puts on screen (|c colour, |T texture, |H link); doubled it shows as itself. Control characters become spaces.
-- Typing "|" into an edit box gives "||" as well, so searching still matches.
function Roster.UIText(s)
  s = nonEmpty(s)
  if not s then return nil end
  return (s:gsub("%c", " "):gsub("|", "||"))
end

-- Returns the members and a summary. status: verified (linked), pending (holds an unexpired code), unverified, or
-- unknown (not in the lists the watcher wrote: joined since, or an older Worker that sends no verified list).
function Roster.Members()
  local info = { total = 0, verified = 0, pending = 0, unverified = 0, unknown = 0, online = 0, hasNames = false, listAt = nil, ranks = {}, classes = {} }
  local out = {}
  if not IsInGuild() then return out, info end
  Unverified.GrabRoster()
  local linked = Roster.Linked()
  info.hasNames = linked ~= nil
  info.listAt = linked and linked.fetchedAt or nil
  local unv = {}
  local src = Unverified.Source()
  if src then for _, m in ipairs(src.members) do unv[L.normalizeCharacter(m.name or "")] = m end end
  local rankSeen, classSeen = {}, {}
  for i = 1, (GetNumGuildMembers() or 0) do
    local name, rank, rankIndex, level, _, _, _, _, online, _, classFile, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    if name then
      local base = BaseName(name)
      local nk = L.normalizeCharacter(base)
      local link = linked and ((guid and linked.byGuid[guid]) or linked.byName[nk]) or nil
      local u = unv[nk]
      local status
      if link or Unverified.session[nk] then status = "verified"
      elseif u then status = u.pending and "pending" or "unverified"
      else status = "unknown" end
      info[status] = info[status] + 1
      info.total = info.total + 1
      if online then info.online = info.online + 1 end
      if rank and not rankSeen[rank] then rankSeen[rank] = true; info.ranks[#info.ranks + 1] = { rank = rank, rankIndex = rankIndex or 99 } end
      if classFile and not classSeen[classFile] then classSeen[classFile] = true; info.classes[#info.classes + 1] = classFile end
      out[#out + 1] = {
        name = base, full = name, rank = rank or "?", rankIndex = rankIndex or 99, level = level or 0, class = classFile,
        online = online and true or false, days = DaysOffline(i, online), status = status,
        discord = link and Roster.UIText(link.username) or nil, display = link and Roster.UIText(link.displayName) or nil,
        discordId = link and nonEmpty(link.discordId) or nil, linkStatus = link and nonEmpty(link.status) or nil,
        sinceLogin = (not link and Unverified.session[nk]) and true or nil,
      }
    end
  end
  table.sort(info.ranks, function(a, b) if a.rankIndex ~= b.rankIndex then return a.rankIndex < b.rankIndex end return a.rank < b.rank end)
  table.sort(info.classes)
  return out, info
end

-- opts: text (matches character, Discord username or display name, any case), status ("all", "verified", "pending",
-- "unverified", "unknown", or "not" = anything but verified), rank, class (the class file, e.g. "PRIEST"), online.
function Roster.Filter(list, opts)
  opts = opts or {}
  local text = string.lower(opts.text or "")
  local out = {}
  for _, m in ipairs(list) do
    local ok = true
    if opts.status and opts.status ~= "all" then
      if opts.status == "not" then ok = m.status ~= "verified" else ok = m.status == opts.status end
    end
    if ok and opts.rank then ok = m.rank == opts.rank end
    if ok and opts.class then ok = m.class == opts.class end
    if ok and opts.online then ok = m.online end
    if ok and text ~= "" then
      ok = string.find(string.lower(m.name), text, 1, true) ~= nil
        or (m.discord and string.find(string.lower(m.discord), text, 1, true) ~= nil)
        or (m.display and string.find(string.lower(m.display), text, 1, true) ~= nil) or false
    end
    if ok then out[#out + 1] = m end
  end
  return out
end

-- key: name, level, rank, status, discord, display, seen. Blanks sort last either way; the name breaks every tie.
function Roster.Sort(list, key, desc)
  local function val(m)
    if key == "level" then return m.level or 0
    elseif key == "rank" then return m.rankIndex or 99
    elseif key == "status" then return Roster.STATUS_ORDER[m.status] or 9
    elseif key == "discord" then return m.discord and string.lower(m.discord) or nil
    elseif key == "display" then return m.display and string.lower(m.display) or nil
    elseif key == "seen" then return m.online and -1 or (m.days or 1e9)
    end
    return string.lower(m.name)
  end
  table.sort(list, function(a, b)
    local va, vb = val(a), val(b)
    if va == nil and vb ~= nil then return false end
    if vb == nil and va ~= nil then return true end
    if va ~= nil and va ~= vb then
      if desc then return va > vb end
      return va < vb
    end
    return string.lower(a.name) < string.lower(b.name)
  end)
  return list
end

-- Point OlvKick at nothing once its target is gone, so a second press cannot quietly act on stale state.
function Unverified.DisarmMacro()
  kickMacroTarget = nil
  if macroForbidden or not (EditMacro and GetMacroIndexByName) then return end
  if InCombatLockdown and InCombatLockdown() then return end
  local idx = GetMacroIndexByName(KICK_MACRO)
  if idx and idx > 0 then
    editingMacro = true
    pcall(EditMacro, idx, KICK_MACRO, "INV_Misc_QuestionMark", "/olv unaimed")
    editingMacro = false
  end
end

-- Can this client's addons write macros at all? Nothing has recorded it yet, and the whole click-to-remove path depends
-- on it, so this answers it with one command instead of by trying it on a real member.
function Unverified.TestMacro()
  if macroForbidden then return false, "this client forbids addons from writing macros" end
  if not (CreateMacro and EditMacro and GetMacroIndexByName) then return false, "no macro API on this client" end
  if InCombatLockdown and InCombatLockdown() then return false, "not in combat" end
  editingMacro = true
  local idx = GetMacroIndexByName(KICK_MACRO)
  local ok
  if idx and idx > 0 then
    ok = pcall(EditMacro, idx, KICK_MACRO, "INV_Misc_QuestionMark", "/olv unaimed")
  else
    ok = pcall(CreateMacro, KICK_MACRO, "INV_Misc_QuestionMark", "/olv unaimed", false)
    if not ok then ok = pcall(CreateMacro, KICK_MACRO, 1, "/olv unaimed", false) end
  end
  editingMacro = false
  if macroForbidden then return false, "this client forbids addons from writing macros" end
  if not ok then return false, "could not create it — the macro list may be full" end
  kickMacroTarget = nil
  if OlympusVerifyDB then OlympusVerifyDB.kickMacro = true end
  return true
end

-- "<Name> has been kicked out of the guild by <Officer>." The addon receives CHAT_MSG_SYSTEM straight from the client,
-- which a player cannot fake (an /emote arrives as CHAT_MSG_EMOTE), so a removal we aimed is recorded here as a trusted
-- event with its reason. The chat-log copy the watcher also relays is the untrusted duplicate.
function Unverified.OnSystemMessage(msg)
  -- the visible text, as SignGuildLine reads it: a kick line may name the player as a link
  local victim, by = string.match(Presence.Visible(msg), Unverified.kickedPattern)
  if not victim then return end
  local base = Presence.ShownName(victim)
  by = Presence.ShownName(by)
  local nk = L.normalizeCharacter(base or "")
  local reason = Unverified.aim[nk]
  if reason then
    Unverified.aim[nk] = nil
    Event({ type = "removed", name = base, ok = true, reason = reason,
            detail = (reason == "unverified" and "not verified" or "freed a seat") .. ", by " .. tostring(BaseName(by) or by) })
  end
  if kickMacroTarget and L.normalizeCharacter(kickMacroTarget) == nk then Unverified.DisarmMacro() end
  if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
end

function Unverified.Print(n)
  local cands, info, err = Unverified.Candidates(n or 10)
  if err then Print("unverified: " .. err) return end
  if info.noFirstSeen then Print("unverified: the Worker has no first-seen dates (migration not applied), so nobody can be offered yet.") end
  local ex = Unverified.Excluded()
  local parts = {}
  for _, br in ipairs(Unverified.Ranks(info)) do
    parts[#parts + 1] = string.format("%s%s %d/%d%s", ex[br.rank] and "(off) " or "", tostring(br.rank), br.offered,
      br.offered + br.held, br.protected and " protected" or "")
  end
  Print(string.format("not verified and still in the guild: %d%s. Removable / total by rank: %s", info.inGuild,
    info.gone > 0 and string.format(" (%d more have left since the list was made)", info.gone) or "", table.concat(parts, " · ")))
  local held = {}
  for why, k in pairs(info.held) do held[#held + 1] = string.format("%s %d", why, k) end
  table.sort(held)
  if #held > 0 then Print("  held back: " .. table.concat(held, ", ")) end
  if info.nextEligible then Print("  next grace period ends " .. Unverified.When(info.nextEligible) .. ".") end
  if (info.openTickets or 0) > 0 then
    Print(string.format("  %d request code%s issued in Discord and not whispered yet: a request code names no character until it is, so its holder could be on this list.",
      info.openTickets, info.openTickets == 1 and " is" or "s are"))
  end
  for i, c in ipairs(cands) do
    Print(string.format("  %d. %s — level %s %s, away %s%s", i, c.name, tostring(c.level), tostring(c.rank), AwayText(c.days),
      c.here and string.format(", on the roster %dd", math.floor(c.here)) or ""))
  end
  if #cands == 0 then Print("  nobody is removable with the current filter.") end
  Print("  /olv aim points " .. KICK_MACRO .. " at #1  ·  /olv unverified Initiate,Member filters  ·  /olv unverified all resets")
end

-- The server said the guild is full. Record it, rank the candidates and tell Discord, so the decision is visible to
-- the other officers rather than happening quietly in one person's client.
local function NoteGuildFull()
  guildFullAt = time()
  local list, totalEligible = RemovalCandidates(MAX_CANDIDATES)
  local slim = {}
  for i = 1, math.min(#list, 5) do
    local c = list[i]
    slim[i] = { name = c.name, level = c.level, rank = c.rank, days = math.floor(c.days) }
  end
  Event({ type = "guild_full", ok = false, detail = string.format("%d eligible for removal", totalEligible or 0), candidates = slim })
  if #list > 0 then
    Print(string.format("guild is full — %d member(s) are past their inactivity threshold (%s). /olv full lists them; the panel has a Remove button per row.", totalEligible or 0, OfflineRuleText()))
  else
    Print(string.format("guild is full, and nobody meets the removal criteria (%s). Relax offlineTiers in Config.lua, or raise the cap.", OfflineRuleText()))
  end
  if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
  FlushChatLog()
end

local function RosterEntry(nameKey)
  for i = 1, (GetNumGuildMembers() or 0) do
    local name, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    if name and L.normalizeCharacter(BaseName(name)) == nameKey then return i, guid, name end
  end
end

-- ---------------------------------------------------------------- accepted invites (no hardware event needed)
-- C_GuildInfo.MemberExistsByName is callable from timers on the Forever beta; it answers from the client's roster copy.
-- Tell the new member, and — the real point — put a line into the chat log that only this client could have written.
-- The watcher trusts a join when it carries this HMAC, because "X has joined the guild." in the log is exactly what
-- any player can produce with /emote. Outgoing whispers are recorded verbatim ("To <name>: ..."), so this is the one
-- channel the addon has that reaches the log and cannot be forged.
--
-- Only someone who has whispered us gets that welcome (see IsContact). For anyone else the same signed line goes to
-- this character itself -- "To <officer>: Olympus: <Name> joined the guild (ref OLVj-...)" -- which the watcher reads
-- the same way (the MAC is over the new member's name), and which ChatFilterJoin keeps out of the chat window.
local JOIN_SELF_FORMAT = "Olympus: %s joined the guild"

-- ---------------------------------------------------------------- signed joins and departures (27 Sep)
-- CHAT_MSG_SYSTEM reaches this client straight from the server; no other player can produce it (an /emote arrives as
-- CHAT_MSG_EMOTE). Its chat-log copy is only text, though, and /emote writes the same words -- which is why the
-- watcher used to trust none of it. So for every guild join and departure this client can read, it writes a signed
-- note to itself, the one kind of line only this client can put in the log. The watcher grants or removes the role on
-- that within seconds instead of waiting for the next roster export. During chat lockdown the system line is a secret
-- value, nothing is signed, and the roster export settles it as before.
local function PatternFrom(fmt, fallback)
  local s = type(fmt) == "string" and fmt or fallback
  s = string.gsub(s, "([%^%$%(%)%.%[%]%*%+%-%?%%])", "%%%1")
  s = string.gsub(s, "%%%%s", "(.+)")
  return "^" .. s .. "$"
end
local JOINED_PATTERN = PatternFrom(rawget(_G, "ERR_GUILD_JOIN_S"), "%s has joined the guild.")
local LEFT_PATTERN = PatternFrom(rawget(_G, "ERR_GUILD_LEAVE_S"), "%s has left the guild.")
-- The kind is part of the text the watcher reads and part of what the MAC covers (OlympusHmac.leaveToken).
local DEPARTURE_TEXT = {
  left = "%s left the guild",
  kicked = "%s was removed from the guild",
  space = "%s was removed to free a seat",
  unverified = "%s was removed as unverified",
}
local SIGN_WINDOW = 600
local signedAt = {}  -- this session: "j:<name>" / "l:<name>" -> when it was signed, so one event makes one note

-- ---------------------------------------------------------------- this character's name, as other players whisper it
-- UnitName("player") gave the whole two-part name on the 17 Sep beta build ("Fern Melder" in the probe), and the 18 Sep
-- log test reached "To Fern Melder:". The build Viktor ran on 27 Sep gives only the first part, "Fern". Every note to
-- self that day went to "Fern", and the server answered "No player named 'Fern' is currently playing." (46 times): no
-- login, identity, departure or log-test note was ever sent, and SavedVariables named "Fern" as the one to whisper.
-- The guild roster still lists the whole name beside the character's GUID, so that is the source. A whisper to
-- ourselves, typed by hand, is the fallback (its sender is us as the server names us); UnitName only while it still
-- looks whole (two parts). Guild chat is not used: a line bridged from Discord could carry our GUID beside a Discord
-- display name. Until one of them answers, notes wait in Presence.pendingNotes and nothing is whispered.
do
  local mine, via, scanned
  Presence.rosterVersion = 0  -- bumped on every GUILD_ROSTER_UPDATE: the roster is searched again only after one
  local function PlayerGuid()
    local ok, g = pcall(UnitGUID, "player")
    if not ok then return nil end
    g = Presence.Readable(g)
    return (g and g ~= "") and g or nil
  end
  Presence.PlayerGuid = PlayerGuid
  local function TwoParts(n) return n ~= nil and string.find(n, "%S%s+%S") ~= nil end
  -- The shown name when (name, guid) is this character, else nil.
  local function Ours(name, guid)
    name, guid = Presence.Readable(name), Presence.Readable(guid)
    local me = PlayerGuid()
    if not (name and guid and me) or guid ~= me then return nil end
    local shown = Presence.ShownName(name)
    return (shown and shown ~= "") and shown or nil
  end
  local function NameAndGuid(i)
    local name, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    return name, guid
  end
  -- A whisper whose sender GUID is ours. Returns the known name (from whichever source), or nil.
  function Presence.LearnMyName(name, guid)
    if mine then return mine end
    local shown = Ours(name, guid)
    if shown and TwoParts(shown) then mine, via = shown, "chat" end
    return mine
  end
  function Presence.MyName()
    if mine and via ~= "chat" then return mine end
    if scanned ~= Presence.rosterVersion and PlayerGuid() and IsInGuild and IsInGuild() and GetNumGuildMembers then
      scanned = Presence.rosterVersion
      for i = 1, (GetNumGuildMembers() or 0) do
        local ok, name, guid = pcall(NameAndGuid, i)
        local shown = ok and Ours(name, guid)
        if shown then mine, via = shown, "roster" return mine end  -- the roster outranks a name learned from a whisper
      end
    end
    if mine then return mine end
    local ok, n = pcall(UnitName, "player")
    n = ok and Presence.Readable(n) or nil
    if TwoParts(n) then mine, via = Presence.ShownName(n), "UnitName" end
    return mine
  end
  function Presence.MyNameVia() return via end
end

Presence.pendingNotes = {}
local function AskForRoster()
  if C_GuildInfo and C_GuildInfo.GuildRoster then pcall(C_GuildInfo.GuildRoster) elseif GuildRoster then pcall(GuildRoster) end
end

local function NoteToSelf(text)
  local me = Presence.MyName()
  if not me then
    -- The roster has not named us yet (the first seconds after login): the note waits for the update that does.
    local q = Presence.pendingNotes
    q[#q + 1] = { text = text, at = time() }
    while #q > 10 do table.remove(q, 1) end
    AskForRoster()
    return false
  end
  local ok = pcall(SendChatMessage, text, "WHISPER", nil, me)
  FlushChatLog()
  return ok
end

-- What waited for the name goes out once it is known: notes still inside the signing window, in order, one flush.
function Presence.SendPendingNotes()
  local q = Presence.pendingNotes
  if #q == 0 then return 0 end
  local me = Presence.MyName()
  if not me then return 0 end
  Presence.pendingNotes = {}
  local sent = 0
  for _, n in ipairs(q) do
    if time() - (n.at or 0) <= SIGN_WINDOW and pcall(SendChatMessage, n.text, "WHISPER", nil, me) then sent = sent + 1 end
  end
  if sent > 0 then FlushChatLog() end
  return sent
end

local function SignJoin(name)
  if not (SECRET and L.joinToken) or not name or name == "" then return false end
  local key = "j:" .. L.normalizeCharacter(name)
  if (signedAt[key] or 0) + SIGN_WINDOW > time() then return false end
  signedAt[key] = time()
  return NoteToSelf(string.format(JOIN_SELF_FORMAT, name) .. " (ref OLVj-" .. L.joinToken(SECRET, name, L.utcDay(time())) .. ")")
end

local function SignDeparture(name, kind)
  if not (SECRET and L.leaveToken) or not name or name == "" or not DEPARTURE_TEXT[kind] then return false end
  local key = "l:" .. L.normalizeCharacter(name)
  if (signedAt[key] or 0) + SIGN_WINDOW > time() then return false end
  signedAt[key] = time()
  return NoteToSelf("Olympus: " .. string.format(DEPARTURE_TEXT[kind], name) .. " (ref OLVl-" .. L.leaveToken(SECRET, kind, name, L.utcDay(time())) .. ")")
end

-- The character behind a confirmed code (27 Sep): "Olympus: <Name> is <GUID> (ref OLVg-...)". The whisper event carries
-- the sender's GUID, which the server vouches for exactly as it vouches for the name; the chat log does not. With it the
-- Worker pins the link to the character that whispered, instead of to whichever character has the name when the next
-- roster export arrives -- which, if the name changed hands in between, is somebody else's.
function Presence.IsGuid(g)
  return type(g) == "string" and string.match(g, "^Player%-%d+%-%x+$") ~= nil
end

function Presence.NoteIdentity(name, guid)
  if not (SECRET and L.guidToken) or not Presence.IsGuid(guid) or not name or name == "" then return false end
  return NoteToSelf(string.format("Olympus: %s is %s (ref OLVg-%s)", name, guid, L.guidToken(SECRET, name, guid, L.utcDay(time()))))
end

-- One readable system line in, at most one signed note out. Runs before Unverified.OnSystemMessage, which clears the
-- reason a removal was aimed for; that reason (a seat freed, or not verified) travels in the note.
local function SignGuildLine(msg)
  -- What the line shows, not how it is encoded: a name sent as a player link ("|Hplayer:...|h[Name]|h") would otherwise
  -- be signed link and all, and the watcher would relay a "name" no roster has.
  msg = Presence.Visible(msg)
  local joined = string.match(msg, JOINED_PATTERN)
  if joined then SignJoin(Presence.ShownName(joined)) return "joined" end
  local left = string.match(msg, LEFT_PATTERN)
  if left then SignDeparture(Presence.ShownName(left), "left") return "left" end
  local victim = string.match(msg, Unverified.kickedPattern)
  if victim then
    local base = Presence.ShownName(victim)
    local reason = Unverified.aim[L.normalizeCharacter(base or "")]
    SignDeparture(base, (reason == "space" or reason == "unverified") and reason or "kicked")
    return "kicked"
  end
end

local function ConfirmJoin(q)
  local target = q and (q.target or q.name)
  if not target or target == "" then return end
  if (IsContact(target) or IsContact(q.name)) and SECRET and L.joinToken then
    -- they whispered us first, so they get the welcome, signed; that whisper is the note
    signedAt["j:" .. L.normalizeCharacter(q.name)] = time()
    pcall(SendChatMessage, string.format(REPLY_JOINED, q.name) .. " (ref OLVj-" .. L.joinToken(SECRET, q.name, L.utcDay(time())) .. ")", "WHISPER", nil, target)
    FlushChatLog()
  else
    -- usually signed already, from the "has joined the guild" line the moment they accepted
    SignJoin(q.name)
  end
end

-- Keeps the incoming copy of those signed notes-to-self out of the chat window. Only that half: the watcher reads the
-- "To <officer>:" half, which stays visible, once per note. Whether a line a message filter hides still reaches
-- WoWChatLog.txt is not settled -- the 27 Sep evidence for "no" turned out to be notes that were never sent (they went
-- to "Fern", see Presence.MyName) -- and this split settles it: the log either has the hidden incoming copy or not.
-- During chat lockdown the text and author arrive as secret values, which cannot even be compared: those are left alone.
local function ChatFilterJoin(_, _, msg, author)
  msg, author = Presence.Readable(msg), Presence.Readable(author)
  if not (msg and author) then return false end
  local me = Presence.MyName()
  if not me or BaseName(author) ~= me then return false end
  return string.match(msg, "^Olympus: .-ref OLV[jlrg]%-%x+%)$") ~= nil
end

-- At every login and reload: which character is in the world and which addon build it runs, signed, into the chat log.
-- The watcher reports that character as the one to whisper (not always the configured main), and the Worker hands out
-- request codes only once an addon that understands them has said so. The name is the whole one from the roster; if
-- the roster has not named us yet, the next roster update sends the note (Presence.SendWaiting).
local function AnnounceRelay()
  if not (SECRET and L.relayToken) then return end
  local me = Presence.MyName()
  if not me then
    Presence.relayPending = true
    AskForRoster()
    return
  end
  Presence.relayPending = nil
  if OlympusVerifyDB then OlympusVerifyDB.lastCharacter = me end
  NoteToSelf(string.format("Olympus: relay %s is in the world (addon %s, ref OLVr-%s)", me, VERSION, L.relayToken(SECRET, me, VERSION, L.utcDay(time()))))
end

-- On every roster update and on any chat line of our own: once the name is known, the login note and whatever else
-- waited for it go out. Cheap when nothing waits.
function Presence.SendWaiting()
  if not (Presence.relayPending or Presence.pendingNotes[1]) then return 0 end
  if not Presence.MyName() then return 0 end
  if Presence.relayPending then AnnounceRelay() end
  return Presence.SendPendingNotes()
end
do
  local addFilter = ChatFrame_AddMessageEventFilter or (ChatFrameUtil and ChatFrameUtil.AddMessageEventFilter)
  if addFilter then
    addFilter("CHAT_MSG_WHISPER", ChatFilterJoin)  -- not CHAT_MSG_WHISPER_INFORM: that half must reach the chat log
  end
end

local function CheckJoined()
  local db = OlympusVerifyDB
  if not db or not (C_GuildInfo and C_GuildInfo.MemberExistsByName) then return 0 end
  local joined, pending = 0, 0
  for _, q in ipairs(db.queue) do
    if q.status == "invited" and (time() - (q.invitedAt or 0)) < JOIN_CHECK_WINDOW then
      local ok, exists = pcall(C_GuildInfo.MemberExistsByName, q.target or q.name)
      if ok and exists then
        q.status = "joined"; q.joinedAt = time(); joined = joined + 1
        Event({ type = "joined", name = q.name, ok = true })
        ConfirmJoin(q)
        Print(q.name .. " has joined the guild.")
      else
        pending = pending + 1
      end
    end
  end
  return joined, pending
end

local joinTicker
local function StartJoinTicker()
  if joinTicker or not (C_Timer and C_Timer.NewTicker) then return end
  joinTicker = C_Timer.NewTicker(JOIN_CHECK_INTERVAL, function()
    local _, pending = CheckJoined()
    if (pending or 0) == 0 then joinTicker:Cancel(); joinTicker = nil end
  end)
end

-- ---------------------------------------------------------------- flush (hardware event only)
local function Invite(target)
  if C_GuildInfo and C_GuildInfo.Invite then return pcall(C_GuildInfo.Invite, target) end
  if GuildInvite then return pcall(GuildInvite, target) end
  return false, "no invite API"
end

local function SetNote(index, guid, note)
  if C_GuildInfo and C_GuildInfo.SetNote and guid then return pcall(C_GuildInfo.SetNote, guid, note, true) end
  if GuildRosterSetPublicNote then return pcall(GuildRosterSetPublicNote, index, note) end
  return false, "no note API"
end

-- Called from the key binding, the pill button, /olv flush, or a row button in the panel (entry given): all hardware
-- events. Exactly one invite per event — the client blocks the second protected call in the same press.
--
-- With presence checks on (the default), a press with no entry given is spent on exactly one of two things: an invite
-- to the first applicant confirmed online and in no guild, or -- when nobody is confirmed, or the guild is at its cap
-- -- a /who on the next applicant in line. Both are protected calls, so never both in one press. opts.force is the
-- panel's "Send anyway": it invites at the cap, for when the roster count is stale and a seat has just opened.
function OlympusVerify_Flush(entry, opts)
  local db = OlympusVerifyDB
  if not db then return end
  local invited, noted = 0, 0
  local target
  if type(entry) == "table" then
    if entry.status == "queued" then target = entry
    elseif entry.status == "failed" then entry.status = "queued"; entry.failedAt = nil; entry.reply = nil; entry.removedReason = nil; target = entry -- officer retry
    end
  elseif Presence.Available() then
    local atCap = ((db.roster and db.roster.total) or 0) >= GUILD_CAP and not (opts and opts.force)
    local ready = Presence.NextReady()
    if ready and not atCap then
      target = ready
    else
      Presence.Step(ready and atCap)
      frame:UpdateButton()
      return
    end
  else
    -- 0.6.4: a reserved name from the guild site goes first; otherwise the first queued row, exactly as before.
    local top = Presence.Ordered()[1]
    if top and (tonumber(top.priority) or 0) > 0 then
      target = top
    else
      for _, q in ipairs(db.queue) do if q.status == "queued" then target = q break end end
    end
  end
  if target then
    local q = target
    local ok, err = Invite(q.target or q.name)
    local ev = { type = "invite", name = q.name, ok = ok and true or false, detail = ok and nil or tostring(err) }
    Event(ev)
    if ok then
      q.status = "invited"; q.invitedAt = time(); q.attempts = (q.attempts or 0) + 1; invited = invited + 1
      pendingReply = { event = ev, entry = q, until_ = time() + REPLY_WINDOW }
      if SET_NOTES and q.note and q.note ~= "" then
        local dup = false
        for _, p in ipairs(db.notePending) do if p.name == q.name then dup = true break end end
        if not dup then table.insert(db.notePending, { name = q.name, note = q.note, ts = time() }) end
      end
    else
      Print("invite for " .. q.name .. " failed: " .. tostring(err))
    end
  end
  if invited > 0 then StartJoinTicker() end
  -- notes for applicants who have joined since (only with setNotes = true in Config.lua, and only until the client
  -- says no: on the Forever beta SetNote raises ADDON_ACTION_FORBIDDEN even from a key press)
  local keep = db.notePending -- untouched unless notes are processed below
  if SET_NOTES and not notesForbidden then
    keep = {}
    flushingNotes = true
    for _, p in ipairs(db.notePending) do
      if notesForbidden then table.insert(keep, p)
      else
        local idx, guid = RosterEntry(L.normalizeCharacter(p.name))
        if idx then
          local ok, err = SetNote(idx, guid, p.note)
          if notesForbidden then ok, err = false, "forbidden for addons on this client" end
          Event({ type = "note", name = p.name, ok = ok and true or false, detail = ok and p.note or tostring(err) })
          if ok then noted = noted + 1 else table.insert(keep, p) end
        elseif time() - (p.ts or 0) < 7 * 86400 then
          table.insert(keep, p) -- not on the roster yet; keep for a week
        end
      end
    end
    flushingNotes = false
  end
  db.notePending = keep
  local remaining = QueuedCount()
  local sent = invited > 0 and ("invite sent to " .. (pendingReply and pendingReply.entry.name or "?")) or "nothing to send"
  local more = remaining > 0 and string.format("; %d more waiting — press again", remaining) or ""
  if remaining > 0 and Presence.Available() then
    local c = Presence.Counts()
    more = string.format("; %d more ready, %d waiting in all — press again", c.ready, remaining)
  end
  if SET_NOTES then
    Print(string.format("flush: %s%s; %d note(s) set, %d waiting.", sent, more, noted, #keep))
  else
    Print(string.format("flush: %s%s.", sent, more))
  end
  CheckJoined()
  ExportRoster(true)
  frame:UpdateButton()
end

-- Which player the server's answer is about, normalized -- or nil when it is about no one in particular.
--
-- This is the guard that was missing. The old test accepted any message containing "guild" as the answer to
-- whatever invite was pending, and the server answers asynchronously while an officer pressing through a batch has
-- several in flight. On 19 September that attached "Trifle Luck is already in a guild." to Volkihar Volkihar, who
-- was not in another guild: the wrong record was marked failed and backed off, and once .19 added whispers, the
-- wrong person was told something untrue about themselves.
--
-- Blizzard puts the name first in every per-player answer and names nobody in the global ones ("You cannot invite
-- new members, your guild is full."), so the two cases are cleanly separable. The server sometimes shortens a
-- two-word name to its first word ("Ferre has already been invited to a guild." for Ferre Evangelium), so the
-- comparison accepts the full name or its first word and nothing else.
local REPLY_SUBJECT_PATTERNS = {
  '^"(.-)" not found',
  "^(.-) not found",
  "^(.-) is already in a guild",
  "^(.-) has already been invited",
  "^(.-) declines your guild invitation",
  "^(.-) has joined the guild",
  "^(.-) has been invited to join",
}
local function ReplySubject(lower)
  for _, pat in ipairs(REPLY_SUBJECT_PATTERNS) do
    local who = string.match(lower, pat)
    if who and who ~= "" then return L.normalizeCharacter((string.gsub(who, '"', ""))) end
  end
  return nil
end

-- True when the server's named answer is about this queue entry.
local function SubjectMatches(subject, entryName)
  if not subject then return true end            -- global answer: it is about the invite we just sent
  local full = L.normalizeCharacter(entryName or "")
  if subject == full then return true end
  local first = string.match(entryName or "", "^(%S+)")
  return first ~= nil and subject == L.normalizeCharacter(first)
end

-- Tell the applicant why their invite did not arrive.
--
-- Only for refusals the server produced by name, which means it found the character, which means they are online
-- and the whisper lands. "Not found" is deliberately not one of them: they are offline, so there is nobody to tell.
--
-- Rate limited hard, and keyed by character rather than by queue entry, because the Worker puts a refused invite
-- back in the queue every few hours and each pass arrives as a fresh entry. Per character: once per NOTICE_REPEAT,
-- at most NOTICE_MAX times ever. Somebody who has been told three times over three days that they are in another
-- guild has been told; a fourth whisper is not information.
-- The applicant's own verification code, recomputed from the shared secret and their character name. It is the
-- same code /verify already showed them in Discord, not a second credential, and it only ever goes to that
-- character in a whisper. Deterministic, so no state has to be kept for this.
local function ApplicantCode(name)
  -- Guard the name rather than trusting codeFor to reject it. If a future normalizeCharacter turned nil into ""
  -- instead of erroring, this would whisper a code computed for an empty name -- which the watcher would refuse,
  -- so the applicant would follow the instructions exactly and silently get nowhere.
  if type(name) ~= "string" or name == "" then return nil end
  if not (SECRET and L and L.codeFor and L.utcDay) then return nil end
  local ok, code = pcall(L.codeFor, SECRET, name, L.utcDay(time()))
  if ok and type(code) == "string" and code ~= "" then return code end
  return nil
end

-- Builds the in-another-guild whisper. Falls back to the older leave-and-wait wording when there is no secret
-- loaded, and appends rather than formats when an operator has overridden the text without leaving a %s in it --
-- whispering somebody the literal word "nil" would be worse than saying less.
local function InGuildReply(q)
  local code = ApplicantCode(q and q.name)
  if not code then return REPLY_IN_GUILD_NOCODE end
  if string.find(REPLY_IN_GUILD, "%%s") then
    local ok, s = pcall(string.format, REPLY_IN_GUILD, code)
    if ok then return s end
  end
  return REPLY_IN_GUILD .. " " .. code
end

local function NoticeApplicant(q, kind, text)
  if not q or type(text) ~= "string" or text == "" then return false end
  local target = q.target or q.name
  if not target or target == "" then return false end
  -- Never a stranger: only someone who has whispered us is whispered back (see IsContact).
  if not (IsContact(target) or IsContact(q.name)) then return false, "not a contact" end
  local db = OlympusVerifyDB
  if not db then return false end
  db.notices = db.notices or {}
  local key = L.normalizeCharacter(q.name or target)
  local kinds = db.notices[key] or {}
  db.notices[key] = kinds
  local rec = kinds[kind] or { at = 0, n = 0 }
  kinds[kind] = rec
  local now = time()
  if (rec.n or 0) >= NOTICE_MAX then return false end
  if (rec.at or 0) + NOTICE_REPEAT > now then return false end
  if #text > 255 then text = string.sub(text, 1, 255) end
  local ok = pcall(SendChatMessage, text, "WHISPER", nil, target)
  -- Recorded either way. A whisper that failed to send is not worth retrying in a loop, and the record is what
  -- stops the loop; the event carries the failure so the Worker still sees it.
  rec.at, rec.n = now, (rec.n or 0) + 1
  Event({ type = "notice", name = q.name, ok = ok and true or false, detail = kind })
  FlushChatLog()
  return ok and true or false
end

-- The server answers an invite with a system message a moment later; attach the first relevant one to the record.
local function NoteServerReply(msg)
  if not pendingReply or type(msg) ~= "string" then return end
  if time() > pendingReply.until_ then pendingReply = nil; return end
  local q = pendingReply.entry
  local lower, name = string.lower(msg), string.lower(q.name or "")
  local subject = ReplySubject(lower)
  if not SubjectMatches(subject, q.name) then
    -- Someone else's answer, arriving while this invite happens to be pending. It is not ours to act on: applying
    -- it here is what produced the 19 September misattributions. Dropping it costs nothing -- the entry stays
    -- `invited` and the Worker's 30-minute recheck offers it again.
    return
  end
  if not subject and not (string.find(lower, "guild", 1, true) or string.find(lower, "invit", 1, true)) then
    return  -- a global message about something else entirely
  end
  pendingReply.event.detail = msg
  q.reply = msg
  -- The name check that used to live here is now ReplySubject's job, which also handles the server shortening a
  -- two-word name to its first word -- that form used to fail this test and lose the join.
  if string.find(lower, "has joined the guild", 1, true) then
    q.status = "joined"; q.joinedAt = time()
    Event({ type = "joined", name = q.name, ok = true })
  elseif string.find(lower, "not found", 1, true) or string.find(lower, "is full", 1, true)
      or string.find(lower, "already been invited", 1, true) or string.find(lower, "already invited", 1, true) then
    -- Three refusals that clear on their own: the applicant is offline, the guild is at its cap, or an invite from
    -- somewhere else is still open on them. None are final, so the entry goes back for a later press. The last of
    -- them used to fall through to "already" below and be marked failed, which is wrong: it expires in seconds.
    pendingReply.event.ok = false
    if string.find(lower, "not found", 1, true) then
      -- Same reasoning as the full guild below: nobody can arrange to be logged in for an invite that arrives at
      -- an unpredictable moment, so a miss does not count against them. Without this the local cap retired people
      -- for being asleep, which is the one refusal in this list that is nobody's doing at all.
      q.attempts = math.max(0, (q.attempts or 1) - 1)
      Presence.Mark(q.name, "offline") -- the server just answered the question a /who would ask; off the list for now
    end
    if string.find(lower, "is full", 1, true) then
      NoteGuildFull()
      NoticeApplicant(q, "guild_full", REPLY_FULL)
      -- A full guild is not the applicant's doing, so refund the attempt the flush charged (the Worker counts the
      -- same way -- see INVITE_RETRY_FULL in ingest.ts). Otherwise waiting out the cap silently burns their tries
      -- and the entry dies of a problem that was never theirs.
      q.attempts = math.max(0, (q.attempts or 1) - 1)
    end
    if (q.attempts or 0) < MAX_INVITE_ATTEMPTS then
      q.status = "queued"
      Print(string.format("server: %s — will retry on the next press (attempt %d of %d).", msg, q.attempts or 0, MAX_INVITE_ATTEMPTS))
    else
      q.status = "failed"; q.failedAt = time()
      Print(string.format("server: %s — giving up after %d attempts.", msg, MAX_INVITE_ATTEMPTS))
    end
    pendingReply = nil
    frame:UpdateButton()
    return
  elseif string.find(lower, "already in a guild", 1, true) then
    -- The one refusal only the applicant can clear. Viktor, 26 Sep: someone in another guild is taken off and never
    -- whispered -- "it shouldn't do that, it should just take them off". The row fails, as it always did, with the
    -- same reason a /who would give it, so Presence.Revive puts it back if they whisper their code after /gquit.
    pendingReply.event.ok = false
    q.status = "failed"; q.failedAt = time()
    q.removedReason = "in_another_guild"
    Presence.Mark(q.name, "guilded")
  elseif string.find(lower, "declin", 1, true) then
    -- They said no, and nothing retries after this. The one useful thing left is that they know it stopped and
    -- know the way back, and this is the moment to say so: they just clicked a popup, so they are online and the
    -- whisper lands. Told nothing, a mis-click looks exactly like being quietly dropped.
    pendingReply.event.ok = false
    q.status = "failed"; q.failedAt = time()
    NoticeApplicant(q, "declined", REPLY_DECLINED)
  elseif string.find(lower, "already", 1, true) then
    pendingReply.event.ok = false
    q.status = "failed"; q.failedAt = time()
  end
  Print("server: " .. msg)
  pendingReply = nil
  frame:UpdateButton()
end

-- ---------------------------------------------------------------- presence: who can accept an invite right now
-- Viktor, 25 Sep: the invite list should show only applicants who are online and in no guild. Anyone else costs a key
-- press for nothing -- the server answers "not found" or "is already in a guild" -- and while the guild sits at its
-- cap, the online and guildless are the only people worth having lined up for the next seat.
--
-- The game tells an addon both facts about a stranger in one place only: /who. C_FriendList.SendWho needs a hardware
-- event (warcraft.wiki.gg lists that for Forever 1.60.1 too), so a check is spent from a key press or click exactly
-- like an invite -- one per press, never from a timer, never in the same press as an invite. A missing answer means
-- "unknown", never "offline".
--
-- A name query answers in chat: up to three matches arrive as CHAT_MSG_SYSTEM lines in WHO_LIST_FORMAT, then an
-- "N players total" line. Four or more arrive as WHO_LIST_UPDATE instead (and open the Who window), which a full
-- two-word name practically never produces. While a check is ours, those lines are kept out of the chat frame and
-- the addon prints one summary in their place.
--
-- 0.5.3, 25 Sep evening. Up to 0.5.2 not a single answer was ever used: every check ended in "no answer", while the
-- chat log shows every /who answered ("1 player total"). Two things produce exactly that, and nothing on disk told
-- them apart, so this version deals with both and records what it sees (/olv trace, and whoTrace in SavedVariables):
--   * An answer slower than the 6.5 s the check used to wait arrived to nobody. (Ruled out afterwards: 0.5.2's own
--     timestamps put each answer within about a second of its /who.) The wait is now WHO_TIMEOUT (8 s), and after
--     that the button moves on while the answer is still taken for LATE_WINDOW (a minute). The server answers /who in
--     the order they were asked, so every answer goes to the oldest open question -- or, when its lines name
--     somebody, to the open question about that name.
--   * Lines in a shape the parser did not expect. Every hyperlink is now reduced to the text it shows and every colour
--     code dropped before anything is matched, the name's brackets are optional, and the total line is found the same
--     way. A line the client hands over as a secret value is recorded as such instead of throwing.
--
-- 0.5.5, 26 Sep: Viktor -- "If people are already in a guild, I want to remove them from the queue (also to ensure I
-- don't whisper people unless they whisper me first)". Presence.Dequeue takes them off; NoticeApplicant and
-- ConfirmJoin whisper only contacts (IsContact).
-- 0.5.6, 26 Sep: "It still whispers people who are in other guilds, it shouldn't do that, it should just take them
-- off". Nobody found in another guild is whispered now, contact or not, by /who or by an invite refusal.
-- 0.5.7, 26 Sep: "It keeps checking 2 at the same time and the check next number going up again". The server refuses a
-- /who sent under 5s after the last one ("You must wait a moment longer..."); that question stayed open and took the
-- next answer, and from then on every answer was reported against the check before. Refusals now close the check at
-- once (Presence.Throttled), the gap is measured on GetTime, a total goes only to the check still waiting, a timeout
-- closes its check, and never-checked applicants come before re-checks (NextToCheck).
--
-- 0.5.4, 26 Sep: the second one it was. 0.5.3's login trace recorded this client's WHO_NUM_RESULTS as
-- "%d |4player:players; total", and the total line reaches an addon in exactly that form: the "|4" grammar escape is
-- resolved only when the chat window draws the line (and the chat log records the drawn form, which is why the log
-- read "1 player total"). The player lines were being read all along; the total line, which closes every answer,
-- never matched. ParseTotal now matches the client's own format string first, and Visible resolves "|4" escapes.
Presence.READY_TTL = (tonumber(cfg.readyMinutes) or 10) * 60             -- "online, no guild" is trusted this long
Presence.OFFLINE_TTL = (tonumber(cfg.offlineRecheckMinutes) or 15) * 60  -- then re-checked
Presence.GUILDED_TTL = (tonumber(cfg.guildedRecheckMinutes) or 60) * 60  -- then re-checked
Presence.WHO_GAP = tonumber(cfg.whoGapSeconds) or 5                      -- the server refuses a /who sent sooner
                                                                         -- (measured, 26 Sep: 4.8s refused, 5.07s
                                                                         -- answered); each refusal adds half a second
Presence.WHO_TIMEOUT = tonumber(cfg.whoTimeoutSeconds) or 8              -- the button waits this long, then moves on
Presence.LATE_WINDOW = 60                                                -- an answer this late is still used
Presence.TRACE_MAX = 300
Presence.enabled = cfg.checkBeforeInvite ~= false

local function Clock() return GetTime and (math.floor(GetTime() * 1000 + 0.5) / 1000) or nil end
local function Clip(s, n)
  s, n = tostring(s or ""), n or 220
  if #s > n then return string.sub(s, 1, n) .. "..." end
  return s
end
local function FirstWord(name) return string.match(name or "", "^(%S+)") or (name or "") end

-- A ring of what the /who machinery saw, kept in SavedVariables (written at /reload or logout) and printed by
-- /olv trace. It records only around a check, so ordinary system chatter is not collected.
function Presence.Trace(kind, e)
  local db = OlympusVerifyDB
  if not db then return end
  e = e or {}
  e.k, e.t, e.g = kind, time(), Clock()
  db.whoTrace = db.whoTrace or {}
  local tr = db.whoTrace
  tr[#tr + 1] = e
  while #tr > Presence.TRACE_MAX do table.remove(tr, 1) end
end

function Presence.TraceLine(e)
  local parts = { (date and date("%H:%M:%S", e.t or 0) or tostring(e.t)) .. (e.g and string.format(" (%.2f)", e.g) or ""), tostring(e.k) }
  for _, f in ipairs({ "n", "q", "st", "via", "late", "dt", "total", "r", "why", "w", "c", "s", "list", "was", "e", "v" }) do
    if e[f] ~= nil then parts[#parts + 1] = f .. "=" .. (string.gsub(tostring(e[f]), "|", "||")) end
  end
  return table.concat(parts, " ")
end

-- An event argument as text, or nil and why not. CHAT_MSG_SYSTEM is marked SecretInChatMessagingLockdown in this
-- client's API documentation: a secret may be passed around but not read, and reading one throws.
local isSecret = rawget(_G, "issecretvalue")
function Presence.Readable(v)
  -- Secrecy first, before any comparison: a secret cannot be compared, not even with nil. rawequal inside pcall is the
  -- nil test that cannot throw.
  if isSecret then
    local ok, secret = pcall(isSecret, v)
    if ok and secret then return nil, "secret" end
    if not ok then
      local okNil, isNil = pcall(rawequal, v, nil)
      return nil, (okNil and isNil) and "nil" or "secret (check refused)"
    end
  end
  local okNil, isNil = pcall(rawequal, v, nil)
  if not okNil then return nil, "unreadable" end
  if isNil then return nil, "nil" end
  local okType, ty = pcall(type, v)
  if not okType then return nil, "unreadable" end
  if ty ~= "string" then return nil, ty end
  local ok, copy = pcall(string.sub, v, 1)
  if not ok or type(copy) ~= "string" then return nil, "unreadable" end
  return copy
end

Presence.reported = {}
function Presence.Failed(what, err)
  Presence.Trace("error", { w = what, e = Clip(err, 300) })
  if not Presence.reported[what] then
    Presence.reported[what] = true
    Print(string.format("error while %s: %s — /olv trace has the details.", what, tostring(err)))
  end
end

function Presence.Safely(what, fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then Presence.Failed(what, err) end
  return ok
end

-- Presence checks need the /who API, the switch in Config.lua, and a client that has not refused /who to addons.
-- When any of those is missing, everything below reports every queued entry as ready: the pre-presence behaviour.
function Presence.Available()
  if not Presence.enabled or Presence.blocked then return false end
  return ((C_FriendList and C_FriendList.SendWho) or SendWho) ~= nil
end

function Presence.Ago(ts)
  local d = math.max(0, time() - (tonumber(ts) or 0))
  if d < 60 then return d .. "s" elseif d < 3600 then return math.floor(d / 60) .. "m" end
  return math.floor(d / 3600) .. "h"
end

function Presence.Rec(name, create)
  local db = OlympusVerifyDB
  if not db or type(name) ~= "string" or name == "" then return nil end
  db.presence = db.presence or {}
  local key = L.normalizeCharacter(name)
  if create and not db.presence[key] then db.presence[key] = {} end
  return db.presence[key]
end

function Presence.Mark(name, state, info)
  local rec = Presence.Rec(name, true)
  if not rec then return end
  rec.state, rec.at = state, time()
  rec.noAnswer = nil
  rec.guild = info and info.guild or nil
  rec.level = info and info.level or nil
  rec.what = info and info.what or nil
  rec.zone = info and info.zone or nil
  return rec
end

-- A queued applicant whispered us: online this minute. That puts them first in line for the next check, and it
-- overrules an old "offline" or "in another guild" on the spot: the whisper we tell guilded applicants to send is
-- their code, after /gquit, and making them wait out GUILDED_TTL for doing exactly that would be absurd.
function Presence.Seen(name)
  local base = BaseName(name)
  if not base or not FindQueued(L.normalizeCharacter(base)) then return end
  local rec = Presence.Rec(base, true)
  if not rec then return end
  rec.seenAt = time()
  if rec.state == "offline" or rec.state == "guilded" or rec.state == "unread" then rec.state, rec.at = nil, nil
  elseif rec.state == "free" then rec.at = time() end  -- still online, and nobody joins a guild mid-whisper
end

-- ---- the questions still out: every /who sent and not yet answered, oldest first
Presence.open = Presence.open or {}
Presence.consumed = Presence.consumed or {}
Presence.seen = Presence.seen or {}

-- A line can reach us three ways: our own CHAT_MSG_SYSTEM handler, the chat frame's message filter (ChatFilter), and
-- the chat window itself (OnAddMessage). Whichever gets a line first takes it; this is true if the same line was
-- already taken in the last 2 seconds, and marks it taken otherwise. Two different answers never look alike that
-- close together: /who goes out at most once every WHO_GAP seconds.
function Presence.Already(msg)
  local now, key = Clock() or time(), Presence.Key(msg)
  for k, at in pairs(Presence.seen) do if now - at > 10 then Presence.seen[k] = nil end end
  local at = Presence.seen[key]
  if at and now - at <= 2 then return true end
  Presence.seen[key] = now
  return false
end

-- The same line, however it reached us: the chat window's copy may carry a timestamp and colour codes the event's
-- copy does not.
function Presence.Key(msg)
  local s = Presence.Visible(msg)
  s = string.gsub(s, "^%s*%[?%d%d?:%d%d:?%d?%d?%s*[AaPp]?%.?[Mm]?%.?%]?%s+", "")
  return (string.match(s, "^%s*(.-)%s*$"))
end

function Presence.Live()
  local now, live = time(), {}
  for _, o in ipairs(Presence.open) do
    if now - o.sentAt < Presence.LATE_WINDOW then live[#live + 1] = o end
  end
  return live
end

function Presence.IsOpen(o)
  for _, x in ipairs(Presence.open) do if x == o then return true end end
  return false
end

function Presence.Close(o)
  for i, x in ipairs(Presence.open) do
    if x == o then table.remove(Presence.open, i) return true end
  end
  return false
end

-- An unanswered question about this person (one whose answer would still be news: not settled by an earlier one).
function Presence.OpenFor(key)
  local now = time()
  for _, o in ipairs(Presence.open) do
    if o.key == key and not o.settled and now - o.sentAt < Presence.LATE_WINDOW then return o end
  end
end

-- One queue entry's standing:
--   ready      online and in no guild at a check within READY_TTL -- the only queued rows the panel lists
--   checking   its /who is out right now (the button waits for it, up to WHO_TIMEOUT)
--   awaiting   its /who got no answer within WHO_TIMEOUT; an answer arriving within LATE_WINDOW is still used, and
--              meanwhile nobody asks about them again
--   offline    not online at the last check or invite (re-checked after OFFLINE_TTL)
--   guilded    in another guild at the last check or invite (re-checked after GUILDED_TTL)
--   member     already on our own roster: nothing to send
--   unread     /who found them but the answer could not be read, or two questions in a row were never answered
--   unchecked  never checked, or the last answer has aged out
function Presence.Of(q)
  if not q then return "unchecked" end
  if not Presence.Available() then return "ready" end
  if InGuildAlready(q.target, q.name) then return "member" end
  local rec = Presence.Rec(q.name or q.target or "")
  local key = L.normalizeCharacter(q.name or "")
  local p = Presence.pending
  if p and p.key == key then return "checking", rec end
  if Presence.OpenFor(key) then return "awaiting", rec end
  local age = (rec and rec.at) and (time() - rec.at) or math.huge
  if rec and rec.state == "free" and age < Presence.READY_TTL then return "ready", rec end
  if rec and rec.state == "offline" and age < Presence.OFFLINE_TTL then return "offline", rec end
  if rec and (rec.state == "guilded" or rec.state == "member") and age < Presence.GUILDED_TTL then return rec.state, rec end
  if rec and rec.state == "unread" and age < Presence.OFFLINE_TTL then return "unread", rec end
  return "unchecked", rec
end

-- Queued entries in the order invites go out and the panel lists them: reserved names from the guild site first
-- (priority 1, 0.6.4), then rows queued here from a whisper (no Worker id yet), then by the Worker's row id -- the
-- same order the Worker numbers them in, and the one OlympusVerifyUI sorts by.
function Presence.Ordered()
  local list, seq = {}, {}
  for i, q in ipairs((OlympusVerifyDB and OlympusVerifyDB.queue) or {}) do
    if q.status == "queued" then list[#list + 1] = q; seq[q] = i end
  end
  table.sort(list, function(a, b)
    local pa, pb = tonumber(a.priority) or 0, tonumber(b.priority) or 0
    if pa ~= pb then return pa > pb end
    local ia, ib = a.id or -1, b.id or -1
    if ia ~= ib then return ia < ib end
    return seq[a] < seq[b]
  end)
  return list
end

function Presence.NextReady()
  for _, q in ipairs(Presence.Ordered()) do
    if Presence.Of(q) == "ready" then return q end
  end
end

-- Front of the line first, with two exceptions ahead of it: somebody who has just whispered us (online now) and
-- somebody who says they left their old guild. Last known to be in another guild goes to the back of the checks;
-- they are only in the file again because the Worker's six-hour backoff ran out.
--
-- After those, everyone never checked, in queue order, before anyone is checked a second time; then the re-checks,
-- the longest since their last answer first. Otherwise the front of the line was re-checked every OFFLINE_TTL and the
-- button never got to the people further back (26 Sep: "the check next number going up again").
function Presence.NextToCheck()
  local list, now = Presence.Ordered(), time()
  local fresh, stale, staleAt, parked
  for _, q in ipairs(list) do
    local st, rec = Presence.Of(q)
    if st == "unchecked" then
      if q.lastReason == "ready_after_gquit" or (rec and rec.seenAt and now - rec.seenAt < Presence.READY_TTL) then return q end
      if q.lastReason == "in_another_guild" then
        parked = parked or q
      elseif not (rec and rec.at) then
        fresh = fresh or q
      elseif not stale or rec.at < staleAt then
        stale, staleAt = q, rec.at
      end
    end
  end
  return fresh or stale or parked
end

-- The queue by Presence.Of state. total is everyone still waiting (status "queued"). takenOff is everyone taken off
-- for being in another guild (by /who, at login, or by the server refusing the invite): they no longer wait, so they
-- are in none of the states and not in total. The PLAYER_LOGIN housekeeping keeps those rows for a week, /olv all
-- lists them with a Retry, and their own code whisper puts them back.
function Presence.Counts()
  local c = { ready = 0, checking = 0, awaiting = 0, offline = 0, guilded = 0, member = 0, unchecked = 0, unread = 0, total = 0, takenOff = 0 }
  for _, q in ipairs(Presence.Ordered()) do
    local st = Presence.Of(q)
    c[st] = (c[st] or 0) + 1
    c.total = c.total + 1
  end
  for _, q in ipairs((OlympusVerifyDB and OlympusVerifyDB.queue) or {}) do
    if q.status == "failed" and q.removedReason == "in_another_guild" then c.takenOff = c.takenOff + 1 end
  end
  c.filtering = Presence.Available()
  return c
end

-- Viktor, 26 Sep (0.5.8): the panel said "0 in another guild" right under four "taken off the queue — in <...>"
-- lines. Both were true -- "guilded" counts people still waiting, and since 0.5.6 nobody found in a guild waits --
-- but side by side they read as a contradiction. So the summaries name only the states somebody is in, and count the
-- people taken off separately, as what they are.
--
-- Pure: they format a Counts() table (or the preview's stand-in) and read nothing else, so the panel shares them
-- through OlympusVerifyAPI.Text. The parts add up to total - ready. "in another guild" only shows up for a row an
-- officer put back by hand (Retry) whose last /who still says so.
local BREAKDOWN = {
  { "unchecked", "%d not checked" },
  { "offline", "%d offline" },
  { "guilded", "%d in another guild" },
  { "unread", "%d with no usable /who answer" },
  { "member", "%d already in our guild" },
  { "checking", "%d being checked" },
  { "awaiting", "%d with an answer still to come" },
}

function Presence.Breakdown(c)
  local parts = {}
  for _, b in ipairs(BREAKDOWN) do
    local n = tonumber(c and c[b[1]]) or 0
    if n > 0 then parts[#parts + 1] = string.format(b[2], n) end
  end
  return #parts > 0 and table.concat(parts, ", ") or "none"
end

-- "4 applicants already in another guild were taken off the queue", or nil when nobody was.
function Presence.TakenOffText(c)
  local n = tonumber(c and c.takenOff) or 0
  if n <= 0 then return nil end
  return string.format("%d applicant%s already in another guild %s taken off the queue", n, n == 1 and "" or "s", n == 1 and "was" or "were")
end

-- The Who list as a short signature ("2:Name One,Name Two"), for the trace and for Poll.
function Presence.WhoListSignature()
  if not (C_FriendList and C_FriendList.GetNumWhoResults and C_FriendList.GetWhoInfo) then return nil end
  local ok, sig = pcall(function()
    local n = C_FriendList.GetNumWhoResults() or 0
    local names = {}
    for i = 1, math.min(n, 4) do
      local w = C_FriendList.GetWhoInfo(i)
      names[#names + 1] = w and tostring(w.fullName or w.name) or "?"
    end
    return tostring(n) .. ":" .. table.concat(names, ",")
  end)
  return ok and sig or ("error " .. Clip(sig, 80))
end

function Presence.FromWhoInfo(w)
  local guild = w.fullGuildName or w.guild
  local what = string.format("%s %s", w.raceStr or w.race or "", w.classStr or w.class or "")
  what = string.match(what, "^%s*(.-)%s*$")
  return { name = BaseName(w.fullName or w.name), level = w.level, guild = (guild and guild ~= "") and guild or nil,
           what = (what ~= "") and what or nil, zone = w.area or w.zone }
end

-- Hardware event only. Sends one /who for q, or returns false and the reason nothing was sent.
function Presence.Check(q)
  if not q then return false, "nobody is waiting on a check" end
  if not Presence.Available() then return false, "presence checks are off" end
  local now, p = time(), Presence.pending
  if p and now - p.sentAt < Presence.WHO_TIMEOUT then
    return false, string.format("still waiting for the /who answer about %s (%ds so far)", p.name, now - p.sentAt)
  end
  -- Measured on GetTime, not time(): whole seconds let a /who go out 4.4s after the last one, which the server refuses.
  local g = Clock()
  local wait
  if g and Presence.lastSentG then wait = Presence.lastSentG + Presence.WHO_GAP - g
  else wait = Presence.lastSentAt + math.ceil(Presence.WHO_GAP) - now end
  if wait > 0 then
    return false, string.format("the server takes one /who every %gs — press again in %ds", Presence.WHO_GAP, math.ceil(wait))
  end
  local name = BaseName(q.target or q.name) or q.name
  local toUi = (C_FriendList and C_FriendList.SetWhoToUi) or SetWhoToUI
  if toUi then pcall(toUi, false) end  -- small answers to chat, not into the Who window
  local send = (C_FriendList and C_FriendList.SendWho) or SendWho
  local query = 'n-"' .. name .. '"'
  -- Asked exactly as the game's own /who asks (SlashCommands.lua: SendWho(msg, Enum.SocialWhoOrigin.Chat)), so the
  -- answer takes the same road as a typed /who. Clients without the origin argument ignore it.
  local origin = Enum and Enum.SocialWhoOrigin and Enum.SocialWhoOrigin.Chat
  Presence.sending = true
  local ok, err = pcall(send, query, origin)
  Presence.sending = false
  if not ok then
    Presence.Trace("send failed", { n = q.name, q = query, e = Clip(err) })
    return false, tostring(err)
  end
  if Presence.blocked then return false, "this client refuses /who to addons" end  -- set by ADDON_ACTION_BLOCKED during the call
  local o = { key = L.normalizeCharacter(q.name), name = q.name, entry = q, sentAt = now, g = Clock() }
  o.snapshot = Presence.WhoListSignature()
  Presence.open[#Presence.open + 1] = o
  Presence.pending = o
  Presence.lastSentAt = now
  Presence.lastSentG = g
  local lockdown
  if C_ChatInfo and C_ChatInfo.InChatMessagingLockdown then
    local okL, v = pcall(C_ChatInfo.InChatMessagingLockdown)
    lockdown = okL and tostring(v) or "error"
  end
  Presence.Trace("send", { n = q.name, q = query, c = #Presence.open, list = o.snapshot,
    why = string.format("origin %s, chat lockdown %s", tostring(origin), tostring(lockdown)) })
  if C_Timer and C_Timer.After then
    C_Timer.After(3, function() Presence.Safely("reading the Who list", Presence.Poll, o, "3s") end)
    C_Timer.After(Presence.WHO_TIMEOUT + 0.5, function() Presence.Safely("timing out a /who", Presence.Timeout, o) end)
    C_Timer.After(Presence.LATE_WINDOW + 0.5, function() Presence.Safely("expiring a /who", Presence.Expire, o) end)
  end
  return true
end

-- What a press does when it does not invite (see OlympusVerify_Flush). atCapWithReady: somebody is ready, but the
-- guild is full, so the press looks further down the line instead.
function Presence.Step(atCapWithReady)
  local q = Presence.NextToCheck()
  if q then
    local ok, why = Presence.Check(q)
    if ok then
      Print(string.format("checking %s…%s", q.name, atCapWithReady and " (the guild is full, so this press looks further down the line; Send anyway in the panel invites once a seat opens)" or ""))
    else
      Print("check: " .. tostring(why) .. ".")
    end
    return ok
  end
  local c = Presence.Counts()
  local off = Presence.TakenOffText(c)
  off = off and (" " .. off .. ".") or ""
  if c.checking > 0 then
    Print("check: still waiting for the last /who answer.")
  elseif atCapWithReady then
    Print(string.format("guild is full — %d ready and waiting for a seat. Send anyway in the panel invites the next once one opens.", c.ready))
  elseif c.ready > 0 then
    Print(string.format("everyone waiting has a recent answer: %d ready to invite%s.%s", c.ready,
      c.total > c.ready and (", " .. Presence.Breakdown(c)) or "", off))
  elseif c.total == 0 then
    Print("nobody is waiting." .. off)
  else
    Print(string.format("nobody to invite: of %d waiting, none is confirmed online and guildless (%s). Each is checked again once their answer ages out.%s",
      c.total, Presence.Breakdown(c), off))
  end
  return false
end

-- The Who list, read a few seconds after a /who whose answer went to chat. Recorded for the trace; and when the
-- list changed after the /who went out and now holds exactly the name asked about, that is the answer, even if no
-- chat line about it could be read.
function Presence.Poll(o, when)
  if not Presence.IsOpen(o) then return false end
  local sig = Presence.WhoListSignature()
  Presence.Trace("who list", { n = o.name, w = when, list = sig, was = o.snapshot })
  if not sig or sig == o.snapshot or (o.lines or 0) > 0 then return false end
  local ok, hit = pcall(function()
    for i = 1, (C_FriendList.GetNumWhoResults() or 0) do
      local w = C_FriendList.GetWhoInfo(i)
      if w and L.normalizeCharacter(BaseName(w.fullName or w.name) or "") == o.key then return Presence.FromWhoInfo(w) end
    end
  end)
  if ok and hit then
    Presence.Close(o)
    Presence.Resolve(o, hit, "who list")
    return true
  end
  return false
end

-- WHO_TIMEOUT passed without an answer: the question is closed, and the person goes back in line (twice in a row sets
-- them aside, see Expire). It is not kept open for a late answer any more: the whoTrace of 25-26 Sep shows every answer
-- within half a second of its /who, and every "late answer" it recorded was really the next check's answer, taken for
-- a /who the server had refused -- which is what made each press report on the person before.
function Presence.Timeout(o)
  if Presence.pending ~= o then return end
  if Presence.Poll(o, "timeout") then return end
  Presence.pending = nil
  o.timedOut = true
  Presence.misses = Presence.misses + 1
  Presence.Trace("timeout", { n = o.name, dt = time() - o.sentAt })
  Presence.Expire(o)
end

-- LATE_WINDOW passed and still nothing (or skipped: the server answered a later /who, so it never will). Once is the
-- server's business, and they are asked again on a later press; twice in a row for the same person sets them aside
-- like an unreadable answer, so no press is ever spent on one name over and over.
function Presence.Expire(o, skipped)
  if not Presence.Close(o) then return end
  if Presence.pending == o then Presence.pending = nil end
  Presence.Trace("expired", { n = o.name, dt = time() - o.sentAt })
  local rec = Presence.Rec(o.name, true)
  if not rec or Presence.OpenFor(o.key) or (rec.at and rec.at >= o.sentAt) then
    if not skipped then frame:UpdateButton() end
    return
  end
  local again = (rec.noAnswer or 0) + 1
  if again >= 2 then
    Presence.Mark(o.name, "unread")
    Print(string.format("still no /who answer about %s, twice in a row — set aside for %dm. /olv trace shows what came back.",
      o.name, math.floor(Presence.OFFLINE_TTL / 60)))
  else
    rec.noAnswer = again
    Print(string.format("no answer to the /who for %s%s — back in line; a later press asks again.%s", o.name,
      skipped and " (the server answered the next /who instead)" or "",
      Presence.misses >= 3 and " Three in a row: /olv trace shows what the client handed the addon." or ""))
  end
  if not skipped then frame:UpdateButton() end
end

-- What a chat line looks like on screen: colour codes, textures and atlases dropped, every hyperlink replaced by the
-- text it shows. A /who line may carry the player as "|Hplayer:...|h[Name]|h", as a link without brackets, or as
-- plain text (the Forever client's chat log shows "Daz Thepriest: Level 10 Human Priest <OLYMPUS XV> - Stormwind
-- City"); all three read the same after this.
-- The same goes for the grammar escape "|4singular:plural;": the chat window picks the form when it draws the line,
-- after the number before it, so the text an addon receives still carries the escape.
-- A name as a line shows it: a player link's "[Name]" loses its brackets, "Name-Realm" its realm.
function Presence.ShownName(n)
  if type(n) ~= "string" then return n end
  return BaseName(string.match(n, "^%[(.-)%]$") or n)
end

function Presence.Visible(msg)
  local s = msg
  s = string.gsub(s, "|c%x%x%x%x%x%x%x%x", "")
  s = string.gsub(s, "|cn[%w_]+:", "")
  s = string.gsub(s, "|r", "")
  s = string.gsub(s, "|H.-|h(.-)|h", "%1")
  s = string.gsub(s, "|T.-|t", "")
  s = string.gsub(s, "|A.-|a", "")
  s = string.gsub(s, "(%d+)(%s*)|4([^:;|]*):([^;|]*);", function(n, gap, one, many)
    return n .. gap .. ((tonumber(n) == 1) and one or many)
  end)
  s = string.gsub(s, "|4([^:;|]*):([^;|]*);", "%2")
  return s
end

-- "Name: Level 12 Human Warrior <Guild> - Elwynn Forest" (no <...> when guildless), in any of the shapes above.
-- Loose on purpose: a word and a number first ("Level 12"), then " - " before the zone. Returns nil for anything else.
function Presence.ParseWhoLine(msg)
  if type(msg) ~= "string" then return nil end
  local s = Presence.Visible(msg)
  local head, rest = string.match(s, "^%s*(.-)%s*:%s+(.+)$")
  if not head or head == "" or #head > 60 then return nil end
  head = string.match(head, "^%[(.*)%]$") or head
  if head == "" or string.find(head, "[%[%]|:]") then return nil end
  if not (string.match(rest, "^%S+%s+%d+%s") and string.find(rest, " - ", 1, true)) then return nil end
  local guild = string.match(rest, "<(.-)>")
  local zone = guild and string.match(rest, ">%s*%-%s+(.+)$") or string.match(rest, "^%S+%s+%d+%s+.-%s%-%s(.+)$")
  return {
    name = BaseName(head),
    level = tonumber(string.match(rest, "^%S+%s+(%d+)")),
    guild = (guild and guild ~= "") and guild or nil,
    what = string.match(rest, "^%S+%s+%d+%s+(.-)%s*<") or string.match(rest, "^%S+%s+%d+%s+(.-)%s+%-%s"),
    zone = zone and string.match(zone, "^(.-)%s*$") or nil,
  }
end

-- "1 player total" / "0 players total": WHO_NUM_RESULTS, which this client defines as "%d |4player:players; total".
-- The line arrives exactly that way -- "1 |4player:players; total" -- and only the chat window turns it into
-- "1 player total" (which is also what its chat log records). Up to 0.5.3 only the drawn form was matched, so the
-- line that closes every /who answer was never recognised, in any version: every check waited out its timeout, and
-- "0 players total" never marked anybody offline either. Now the client's own format string is matched first, as
-- delivered, and the drawn form (any shape above) after it.
local totalPattern
function Presence.TotalPattern()
  if totalPattern == nil then
    totalPattern = false
    local fmt = rawget(_G, "WHO_NUM_RESULTS")
    if type(fmt) == "string" and string.find(fmt, "%d", 1, true) then
      local p = string.gsub(fmt, "[%^%$%(%)%%%.%[%]%*%+%-%?]", "%%%0")  -- every character literal ...
      p = string.gsub(p, "%%%%d", "(%%d+)")                                -- ... except the number
      totalPattern = "^%s*" .. p
    end
  end
  return totalPattern or nil
end

function Presence.ParseTotal(msg)
  if type(msg) ~= "string" then return nil end
  local stripped = string.gsub(string.gsub(msg, "|c%x%x%x%x%x%x%x%x", ""), "|r", "")
  local pattern = Presence.TotalPattern()
  local n = pattern and string.match(stripped, pattern)
  if not n then n = string.match(Presence.Visible(msg), "^%s*(%d+)%s+[Pp]layers?%s+[Tt]otal") end
  return n and tonumber(n) or nil
end

-- "You must wait a moment longer before using /who again." -- the server's refusal of a /who sent too soon after the
-- last one (whoTrace, 26 Sep: refused 4.4-4.8s after the previous /who, answered from 5.07s). No answer ever comes for
-- it. Left open, the refused question took the next check's answer, and each answer after that went to the check
-- before -- Viktor, 26 Sep: "It keeps checking 2 at the same time". So the question is closed on the spot, the person
-- stays first in line, and the gap between checks grows by half a second.
function Presence.IsThrottle(msg)
  if type(msg) ~= "string" then return false end
  local s = string.lower(Presence.Visible(msg))
  return string.find(s, "/who", 1, true) ~= nil and string.find(s, "wait", 1, true) ~= nil
end

function Presence.Throttled(msg)
  local p = Presence.pending
  if not p or not Presence.IsOpen(p) then return "a /who refusal, no check waiting" end
  Presence.Close(p)
  Presence.pending = nil
  Presence.consumed[msg] = time()
  Presence.WHO_GAP = math.min((Presence.WHO_GAP or 5) + 0.5, 8)
  Presence.lastSentG, Presence.lastSentAt = Clock(), time()  -- counted from the refusal
  Presence.Trace("refused", { n = p.name, w = string.format("gap now %gs", Presence.WHO_GAP) })
  Print(string.format("the server refused the /who for %s (too soon after the last one) — %s stays first in line; press again in %ds.",
    p.name, p.name, math.ceil(Presence.WHO_GAP)))
  frame:UpdateButton()
  return "refused: " .. p.name
end

-- Which open question a line about `name` answers. n-"Tater Toe" only returns names containing it, so the line must
-- contain the first word of the name asked about; an exact match wins over that, and older questions over newer.
function Presence.Owner(name, open)
  local key, lname = L.normalizeCharacter(name or ""), string.lower(name or "")
  for _, o in ipairs(open) do if o.key == key then return o end end
  for _, o in ipairs(open) do
    if string.find(lname, string.lower(FirstWord(o.name)), 1, true) then return o end
  end
end

-- One readable CHAT_MSG_SYSTEM line. Returns what it made of it, for the trace (nil: nothing to do with /who).
function Presence.OnSystem(msg)
  local open = Presence.Live()
  if #open == 0 or type(msg) ~= "string" then return nil end
  local now = time()
  for k, at in pairs(Presence.consumed) do if now - at > 10 then Presence.consumed[k] = nil end end
  if Presence.IsThrottle(msg) then return Presence.Throttled(msg) end
  local who = Presence.ParseWhoLine(msg)
  if who then
    -- Anything else that happens to look like a /who line (an officer's own /who, a chat message shaped like one) is
    -- not part of our answer and must not count as a line of it.
    local o = Presence.Owner(who.name, open)
    if not o then return "a /who line, not ours" end
    o.lines = (o.lines or 0) + 1
    local key = L.normalizeCharacter(who.name or "")
    if key == o.key then
      o.found = who
    elseif not o.found and key == L.normalizeCharacter(FirstWord(o.name)) then
      o.partial = who  -- the server shortens a two-word name to its first word in some answers
    end
    Presence.consumed[msg] = now
    return "line about " .. tostring(who.name) .. " for " .. o.name
  end
  local total = Presence.ParseTotal(msg)
  if not total then return nil end
  -- The question whose lines this answer carried gets it; failing that, the one still waiting for its answer. Never
  -- one that has timed out: a total names nobody, and handing it to an older question is how every answer came to be
  -- reported against the check before (26 Sep).
  local idx
  for i, o in ipairs(open) do if (o.lines or 0) > 0 then idx = i; break end end
  if not idx then
    for i = #open, 1, -1 do if not open[i].timedOut then idx = i; break end end
  end
  if not idx then return "a total nobody is waiting for" end
  Presence.consumed[msg] = now
  for i = 1, idx - 1 do Presence.Expire(open[i], true) end
  local o = open[idx]
  Presence.Close(o)
  Presence.Answer(o, total)
  return string.format("total %d for %s", total, o.name)
end

function Presence.Answer(o, total)
  local hit = o.found or (total == 1 and o.partial) or nil
  if total > 0 and not hit and (o.lines or 0) == 0 then
    -- Somebody matched, but no line of the answer could be read. Never guess "offline" from that: it would hide
    -- people who are standing right there. Set them aside for OFFLINE_TTL so the next press moves on.
    if Presence.pending == o then Presence.pending = nil end
    Presence.Trace("answer", { n = o.name, st = "unread", total = total, dt = time() - o.sentAt })
    Presence.Mark(o.name, "unread")
    Print(string.format("could not read the /who answer about %s (%d match%s) — skipped for %dm; the next press checks the next in line. /olv trace shows the lines as the client delivered them.",
      o.name, total, total == 1 and "" or "es", math.floor(Presence.OFFLINE_TTL / 60)))
    frame:UpdateButton()
    return
  end
  Presence.Resolve(o, hit)
end

-- Takes a queued applicant off the queue because /who found them in another guild. Local to this client: the row
-- becomes "failed", which the panel does not list and the queue file cannot re-add (MergeQueueFile keeps a known
-- Worker row as it is). Retry in /olv all puts it back by hand; and so does their own whisper, since a code whispered
-- after /gquit queues them afresh, first in line to be checked.
function Presence.Dequeue(q, guild)
  if not q or q.status ~= "queued" then return false end
  q.status, q.failedAt = "failed", time()
  q.reply = string.format("in another guild <%s>, found by /who", tostring(guild or "?"))
  q.removedReason = "in_another_guild"
  Event({ type = "dequeued", name = q.name, ok = true, detail = "in <" .. tostring(guild or "?") .. ">" })
  return true
end

-- Their own code, whispered after they were taken off for being in another guild (which is what the notice asks
-- them to do after /gquit): the same row goes back in the queue, keeping its Worker id and place, and Presence.Seen,
-- which runs right after, puts them first in line for the next check.
function Presence.Revive(key)
  for _, q in ipairs((OlympusVerifyDB and OlympusVerifyDB.queue) or {}) do
    if q.status == "failed" and q.removedReason == "in_another_guild" and L.normalizeCharacter(q.name or "") == key then
      q.status, q.failedAt, q.reply, q.removedReason = "queued", nil, nil, nil
      return true
    end
  end
  return false
end

function Presence.Resolve(o, hit, via)
  if Presence.pending == o then Presence.pending = nil end
  -- A second question about the same person may still be out (the first answer came late): its answer is not news,
  -- so it is taken quietly, and it no longer holds the button.
  local p = Presence.pending
  if p and p.key == o.key then Presence.pending = nil end
  for _, other in ipairs(Presence.open) do if other.key == o.key then other.settled = true end end
  Presence.misses = 0
  local quiet = o.settled
  local late = o.timedOut and " (answer came late)" or ""
  local q, name = o.entry, o.name
  local ours = GetGuildInfo and GetGuildInfo("player")
  local state
  if not hit then
    state = "offline"
    Presence.Mark(name, "offline")
    if not quiet then Print(string.format("%s: offline — off the list; checked again in %dm%s.", name, math.floor(Presence.OFFLINE_TTL / 60), late)) end
  elseif hit.guild and ours and string.lower(hit.guild) == string.lower(ours) then
    state = "member"
    Presence.Mark(name, "member", hit)
    if not quiet then Print(string.format("%s: already in %s — nothing to send%s.", name, hit.guild, late)) end
  elseif hit.guild then
    state = "guilded"
    Presence.Mark(name, "guilded", hit)
    if not quiet then
      -- Viktor, 26 Sep: someone already in a guild comes off the queue, and is not whispered -- not even someone who
      -- whispered us before ("it shouldn't do that, it should just take them off").
      local removed = Presence.Dequeue(q, hit.guild)
      Print(string.format("%s: online but in <%s> — %s%s.", name, hit.guild, removed and "taken off the queue, not whispered" or "off the list", late))
    end
  else
    state = "free"
    Presence.Mark(name, "free", hit)
    if not quiet then
      Print(string.format("%s: online, no guild%s — ready to invite%s.", name,
        hit.level and string.format(" (level %d%s)", hit.level, hit.zone and (", " .. hit.zone) or "") or "", late))
    end
  end
  Presence.Trace("answer", { n = name, st = state, via = via, late = o.timedOut or nil, dt = time() - o.sentAt })
  frame:UpdateButton()
end

function Presence.OnWhoList()
  if not (C_FriendList and C_FriendList.GetNumWhoResults and C_FriendList.GetWhoInfo) then return end
  local open = Presence.Live()
  local n = C_FriendList.GetNumWhoResults() or 0
  if #open > 0 or time() - (Presence.lastSentAt or 0) <= Presence.LATE_WINDOW then
    Presence.Trace("WHO_LIST_UPDATE", { c = n, list = Presence.WhoListSignature() })
  end
  if #open == 0 or n == 0 then return end  -- an empty answer to a name query comes as "0 players total" in chat
  -- Ours only if every result could have come from our name query: n-"Tater Toe" returns names containing it. An
  -- officer's own /who landing while ours is out must not be read as "not online".
  for _, o in ipairs(open) do
    local first, all = string.lower(FirstWord(o.name)), true
    for i = 1, n do
      local w = C_FriendList.GetWhoInfo(i)
      local full = w and (w.fullName or w.name)
      if not (full and string.find(string.lower(full), first, 1, true)) then all = false; break end
    end
    if all then
      local hit
      for i = 1, n do
        local w = C_FriendList.GetWhoInfo(i)
        if w and L.normalizeCharacter(BaseName(w.fullName or w.name) or "") == o.key then hit = Presence.FromWhoInfo(w); break end
      end
      Presence.Close(o)
      Presence.Resolve(o, hit, "WHO_LIST_UPDATE")
      return
    end
  end
end

-- Keeps our own /who answers out of the chat frame: only lines about a name we asked for, and total lines while one
-- of our questions is open, so an officer's own /who is swallowed only if it lands inside one of ours (and then it
-- would have been taken as ours anyway). Our summary line replaces them. The chat frame calls this for every chat
-- frame showing system messages, before or after our own handler has seen the line, hence the consumed list.
function Presence.ShouldHide(msg)
  if type(msg) ~= "string" then return false end
  local at = Presence.consumed[msg]
  if at and time() - at <= 3 then return true end
  local open = Presence.Live()
  if #open == 0 then return false end
  if Presence.IsThrottle(msg) then return Presence.pending ~= nil end  -- our summary says it instead
  local who = Presence.ParseWhoLine(msg)
  if who then return Presence.Owner(who.name, open) ~= nil end
  if Presence.ParseTotal(msg) == nil then return false end
  for _, o in ipairs(open) do if (o.lines or 0) > 0 or not o.timedOut then return true end end
  return false
end

-- The chat frame hands its filters the same line our own handler gets. Should our handler ever not see it (the
-- event not delivered to addon frames, for whatever reason), the chat frame's copy is used instead: on the next
-- frame, after our handler has had its turn, and only if the line was not taken already.
function Presence.FromChatFrame(msg)
  if #Presence.Live() == 0 or Presence.Already(msg) then return end
  local res = Presence.OnSystem(msg)
  Presence.Trace("system (chat frame)", { s = Clip(msg), r = res, c = #Presence.Live() })
end

-- A third way: some system text is printed straight into the chat window, with no event an addon could see. While
-- a question is open, lines there that look like a /who answer are taken too -- on the next frame, and only if
-- neither of the other two ways had them. Chat lines typed by players always carry a "[Channel] Name:" or
-- "Name says:" prefix there, which neither parser accepts, so nobody can answer for the server by typing.
Presence.hooked = {}
function Presence.HookChatWindows()
  if not hooksecurefunc then return end
  for i = 1, (tonumber(rawget(_G, "NUM_CHAT_WINDOWS")) or 10) do
    local cf = rawget(_G, "ChatFrame" .. i)
    if type(cf) == "table" and cf.AddMessage and not Presence.hooked[cf] then
      Presence.hooked[cf] = true
      hooksecurefunc(cf, "AddMessage", Presence.OnAddMessage)
    end
  end
end

local function WatchAddMessage(text)
  local msg = Presence.Readable(text)
  if not msg or string.find(msg, "Olympus|r:", 1, true) then return end  -- our own lines
  local key = Presence.Key(msg)
  -- A /who line starts with the player link WHO_LIST_FORMAT builds, "|Hplayer:Name|h[Name]|h:", whose data is the name
  -- alone. A line a player typed starts with a channel, or with a sender link that carries more after the name
  -- ("|Hplayer:Name:lineID:CHANNEL:2|h"), so neither can pass for one.
  local raw = string.gsub(string.gsub(msg, "|c%x%x%x%x%x%x%x%x", ""), "|r", "")
  raw = string.gsub(raw, "^%s*%[?%d%d?:%d%d:?%d?%d?%s*[AaPp]?%.?[Mm]?%.?%]?%s+", "")  -- a chat timestamp, if shown
  local whoLine = Presence.ParseWhoLine(key) and (string.find(raw, "^|Hplayer:[^:|]+|h") or not string.find(key, "^%["))
  if not (Presence.ParseTotal(key) or Presence.ParseTotal(msg) or whoLine) then return end
  if C_Timer and C_Timer.After then
    C_Timer.After(0, function() Presence.Safely("reading a /who answer from the chat window", Presence.FromChatWindow, key, msg) end)
  end
end

-- Runs after every line any code adds to a chat window, so it does nothing unless a question is open, and it can
-- never throw into the code that printed the line.
function Presence.OnAddMessage(_, text)
  if #Presence.open == 0 then return end
  pcall(WatchAddMessage, text)
end

function Presence.FromChatWindow(key, raw)
  if #Presence.Live() == 0 or Presence.Already(key) then return end
  local res = Presence.OnSystem(key)
  Presence.Trace("system (chat window)", { s = Clip(raw or key), r = res, c = #Presence.Live() })
end

function Presence.ChatFilter(_, _, msg)
  local ok, hide = pcall(Presence.ShouldHide, msg)
  if type(msg) == "string" and #Presence.open > 0 and C_Timer and C_Timer.After then
    C_Timer.After(0, function() Presence.Safely("reading a /who answer from the chat frame", Presence.FromChatFrame, msg) end)
  end
  return (ok and hide) and true or false
end
do
  local addFilter = ChatFrame_AddMessageEventFilter or (ChatFrameUtil and ChatFrameUtil.AddMessageEventFilter)
  if addFilter then addFilter("CHAT_MSG_SYSTEM", Presence.ChatFilter) end
end

-- CHAT_MSG_SYSTEM, all of it that concerns /who: read the line if the client lets us, hand it to OnSystem, and write
-- down what happened while a question is open or was sent in the last 20 seconds.
function Presence.OnSystemEvent(raw)
  local msg, why = Presence.Readable(raw)
  -- Also while an invite waits for its answer: the same record then shows the shape of the server's invite replies.
  local recent = time() - (Presence.lastSentAt or 0) <= 20 or pendingReply ~= nil
  if #Presence.open == 0 and not recent then return msg end
  local live = #Presence.Live()
  if live == 0 and not recent then return msg end
  if msg and Presence.Already(msg) then return msg end  -- the chat frame's copy was taken first
  local ok, res = true, nil
  if msg then ok, res = pcall(Presence.OnSystem, msg) end
  if recent or res ~= nil or not ok then
    Presence.Trace("system", { s = msg and Clip(msg) or nil, why = why, r = ok and res or nil, c = live })
  end
  if not ok then Presence.Failed("reading a /who answer", res) end
  return msg
end

-- At login: note what this client is (the /who format strings, secret values, chat lockdown) in the trace, and drop
-- the "no readable answer" marks that 0.5.2 and earlier left behind -- every one of them was the bug, not the person.
function Presence.Boot(db)
  -- Anyone still queued whose last /who (within GUILDED_TTL) said "in another guild" comes off the queue now, as
  -- they would have if this rule had existed when they were checked.
  local off = 0
  for _, q in ipairs(db.queue or {}) do
    local rec = q.status == "queued" and Presence.Rec(q.name or "") or nil
    if rec and rec.state == "guilded" and rec.at and time() - rec.at < Presence.GUILDED_TTL and Presence.Dequeue(q, rec.guild) then
      off = off + 1
    end
  end
  if off > 0 then Print(string.format("%d applicant(s) already found in another guild taken off the queue.", off)) end
  if db.presenceVersion ~= VERSION then
    for _, rec in pairs(db.presence or {}) do
      if type(rec) == "table" then
        if rec.state == "unread" then rec.state, rec.at = nil, nil end
        rec.noAnswer = nil
      end
    end
    db.presenceVersion = VERSION
  end
  local lockdown
  if C_ChatInfo and C_ChatInfo.InChatMessagingLockdown then
    local ok, v = pcall(C_ChatInfo.InChatMessagingLockdown)
    lockdown = ok and tostring(v) or "error"
  end
  Presence.Trace("login", { v = VERSION, w = string.format("timeout %ds, late %ds, gap %ds", Presence.WHO_TIMEOUT, Presence.LATE_WINDOW, Presence.WHO_GAP),
    s = string.format("WHO_LIST_FORMAT=%s WHO_LIST_GUILD_FORMAT=%s WHO_NUM_RESULTS=%s", tostring(rawget(_G, "WHO_LIST_FORMAT")),
      tostring(rawget(_G, "WHO_LIST_GUILD_FORMAT")), tostring(rawget(_G, "WHO_NUM_RESULTS"))),
    why = string.format("issecretvalue %s, chat lockdown %s", isSecret and "present" or "absent", tostring(lockdown)) })
  Presence.Safely("watching the chat window", Presence.HookChatWindows)
end

function Presence.PrintTrace(arg)
  local db = OlympusVerifyDB
  if not db then return end
  if arg == "clear" then db.whoTrace = {}; Print("/who trace cleared.") return end
  local tr = db.whoTrace or {}
  local n = math.max(1, math.min(tonumber(arg) or 12, 60))
  Print(string.format("/who trace, last %d of %d (all of it goes to SavedVariables at /reload or logout; /olv trace 40 shows more, /olv trace clear empties it):",
    math.min(n, #tr), #tr))
  for i = math.max(1, #tr - n + 1), #tr do Print("  " .. Presence.TraceLine(tr[i])) end
  if #tr == 0 then Print("  (empty — press Check next once, then /olv trace)") end
end

-- ---------------------------------------------------------------- queue file (written by the watcher)
local function MergeQueueFile()
  local q = OlympusQueue
  if type(q) ~= "table" or type(q.entries) ~= "table" then return 0 end
  local added, ready = 0, 0
  local recent = time() - 86400
  for _, e in ipairs(q.entries) do
    if e.character and e.character ~= "" then
      local known = nil
      local nk = L.normalizeCharacter(e.character)
      -- The same Worker row first, then the same name already queued / invited / joined here within a day (the addon
      -- queues straight from the whisper, so the Worker's copy of the same invite usually arrives second).
      if e.id ~= nil then
        for _, existing in ipairs(OlympusVerifyDB.queue) do
          if existing.id == e.id then known = existing break end
        end
      end
      if not known then
        for _, existing in ipairs(OlympusVerifyDB.queue) do
          if L.normalizeCharacter(existing.name) == nk and (existing.status == "queued"
            or ((existing.status == "invited" or existing.status == "joined") and math.max(existing.ts or 0, existing.invitedAt or 0, existing.joinedAt or 0) > recent)) then
            known = existing
            -- 0.6.4: take the Worker's current id. The Worker replaces its row for a name when the owner verifies or
            -- an officer queues it again; holding on to the old id made the withdrawal pass below drop this row as
            -- cancelled while the new one was live, and the name went missing until the next merge.
            if e.id ~= nil then known.id = e.id end
            break
          end
        end
      end
      if known then
        -- Refresh the place in line on a row already held. Every invite that goes out moves everyone behind it up,
        -- and a row is only ever enqueued once, so without this the panel would keep showing whatever the number
        -- was at the moment the entry first arrived -- worse than showing nothing, because it still looks live.
        if (e.position or 0) > 0 then known.position = e.position end
        -- Worker .41: a reserved name the guild site moved to the front (or a row that lost that place again).
        if e.priority ~= nil then known.priority = tonumber(e.priority) or 0 end
        -- Worker .41 also takes a row over in place when the name is verified again, possibly by another account.
        if known.source == "worker" and known.id ~= nil and known.id == e.id then
          if (e.discordId or "") ~= "" then known.discordId = e.discordId end
          if SET_NOTES and q.setGuildNote and (e.note or "") ~= "" then known.note = e.note end
        end
        -- They left their old guild and whispered their code back, so the Worker lifted the hold on this row.
        -- It is the one queue change an officer should act on at once, and nothing else would announce it: the
        -- row was already here, so the "new entries" alert never fires for it.
        local was = known.lastReason
        if (e.lastReason or "") ~= "" then known.lastReason = e.lastReason end
        if was ~= "ready_after_gquit" and known.lastReason == "ready_after_gquit" then
          known.status = "queued"
          known.readyAt = time()
          ready = ready + 1
        end
      else
        Enqueue({ id = e.id, name = e.character, target = e.character, discordId = e.discordId, note = (SET_NOTES and q.setGuildNote and e.note) or nil, source = "worker", position = e.position, lastReason = e.lastReason, priority = tonumber(e.priority) or 0 })
        added = added + 1
      end
    end
  end
  -- Entries the Worker has withdrawn. A row leaves the queue file when it is cancelled in Discord (an officer ran
  -- /olympus-admin ban or unbind) or when another officer's client has taken it over. Without this the invite still
  -- sat in this client's queue and would have been sent anyway — the applicant gets an invite the Worker has already
  -- decided against, or two officers invite the same person. Only untouched worker-sourced rows are dropped: anything
  -- queued here from a whisper, and anything already invited, is left alone. A missing or unparseable queue file
  -- returned earlier, so a bad read can never clear the queue.
  local present = {}
  for _, e in ipairs(q.entries) do if e.id ~= nil then present[e.id] = true end end
  local removed, kept = 0, {}
  for _, existing in ipairs(OlympusVerifyDB.queue) do
    if existing.source == "worker" and existing.status == "queued" and existing.id ~= nil and not present[existing.id] then
      removed = removed + 1
    else
      kept[#kept + 1] = existing
    end
  end
  if removed > 0 then
    OlympusVerifyDB.queue = kept
    Print(string.format("%d queued invite(s) withdrawn by the Worker (cancelled in Discord, or taken by another officer).", removed))
  end
  if ready > 0 then
    Print(string.format("%d applicant(s) left their old guild and are ready to invite now.", ready))
  end
  if added > 0 or ready > 0 then AlertNewInvite() end
  return added, removed
end


-- The watcher writes OlympusQueue.lua continuously, but until 18 Sep the addon only read it at PLAYER_LOGIN, so a
-- Discord approval sat in the file until the officer relogged or /reload'ed. That wait — not the invite key press —
-- was the longest step in the pipeline. Correction, 25 Sep: the timer below does NOT remove that wait. WoW executes an
-- addon's files only at login and /reload, and nothing here reassigns OlympusQueue, so this re-merges the copy loaded
-- then and never sees a newer file. Kept because it is harmless; new approvals and the unverified list need a /reload.
local mergeTicker
local function StartMergeTicker()
  if mergeTicker or MERGE_INTERVAL <= 0 or not (C_Timer and C_Timer.NewTicker) then return end
  mergeTicker = C_Timer.NewTicker(MERGE_INTERVAL, function()
    local added = MergeQueueFile()
    if added and added > 0 then
      Print(string.format("%d new invite(s) arrived from Discord.", added))
      if frame.UpdateButton then frame:UpdateButton() end
      if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
    end
  end)
end

-- ---------------------------------------------------------------- UI: a small button that is itself the hardware event
-- Left click sends the next invite; right click opens the panel (OlympusVerifyUI.lua). Drag to move.
local button = CreateFrame("Button", "OlympusVerifyButton", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
button:SetSize(300, 32)
button:SetPoint("TOP", UIParent, "TOP", 0, -120)
if button.SetClampedToScreen then button:SetClampedToScreen(true) end
if button.SetFrameStrata then button:SetFrameStrata("MEDIUM") end
if button.SetBackdrop then
  button:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", edgeSize = 10,
    insets = { left = 2, right = 2, top = 2, bottom = 2 } })
  button:SetBackdropColor(0.063, 0.071, 0.09, 0.97)
  button:SetBackdropBorderColor(0.788, 0.659, 0.424, 0.45)
end
local launcherText = button:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
launcherText:SetPoint("CENTER", button, "CENTER", 0, 0)
if launcherText.SetWordWrap then launcherText:SetWordWrap(false) end
if launcherText.SetTextColor then launcherText:SetTextColor(0.910, 0.867, 0.773) end
if button.SetFontString then button:SetFontString(launcherText) end
if button.SetPushedTextOffset then button:SetPushedTextOffset(1, -1) end
if button.SetHighlightTexture then
  button:SetHighlightTexture("Interface\\Buttons\\WHITE8X8")
  local highlight = button.GetHighlightTexture and button:GetHighlightTexture()
  if highlight and highlight.SetVertexColor then highlight:SetVertexColor(0.79, 0.66, 0.42, 0.12) end
end
if button.SetPushedTexture then
  button:SetPushedTexture("Interface\\Buttons\\WHITE8X8")
  local pressed = button.GetPushedTexture and button:GetPushedTexture()
  if pressed and pressed.SetVertexColor then pressed:SetVertexColor(0.788, 0.659, 0.424, 0.18) end
end
local launcherRestored, launcherDetail, launcherDragging = false, "", false
button:SetMovable(true); button:EnableMouse(true); button:RegisterForDrag("LeftButton")
if button.RegisterForClicks then button:RegisterForClicks("LeftButtonUp", "RightButtonUp") end
button:SetScript("OnDragStart", function(self) launcherDragging = true; self:StartMoving() end)
local function StopLauncherDrag(self)
  self:StopMovingOrSizing()
  launcherDragging = false
  -- SavedVariables are the single source of truth, rather than a competing layout-local.txt position.
  if self.SetUserPlaced then self:SetUserPlaced(false) end
  if not OlympusVerifyDB or not self.GetPoint then return end
  local point, _, relPoint, x, y = self:GetPoint()
  if point then
    OlympusVerifyDB.ui = OlympusVerifyDB.ui or {}
    OlympusVerifyDB.ui.launcher = { point = point, relPoint = relPoint, x = x, y = y }
  end
end
button:SetScript("OnDragStop", StopLauncherDrag)
button:SetScript("OnHide", function(self)
  if launcherDragging then StopLauncherDrag(self) end
  if GameTooltip and GameTooltip.IsOwned and GameTooltip:IsOwned(self) then GameTooltip:Hide() end
end)
local function ShowLauncherTip(self)
  if not GameTooltip then return end
  GameTooltip:SetOwner(self, "ANCHOR_BOTTOM")
  GameTooltip:SetText("Olympus Verify", 0.79, 0.66, 0.42)
  GameTooltip:AddLine(launcherDetail, 0.91, 0.87, 0.77, true)
  GameTooltip:AddLine("Right-click: toggle officer panel", 0.910, 0.867, 0.773)
  GameTooltip:AddLine("Drag: move this button", 0.62, 0.64, 0.68)
  GameTooltip:Show()
end
button:SetScript("OnEnter", function(self)
  if launcherText.SetTextColor then launcherText:SetTextColor(0.788, 0.659, 0.424) end
  ShowLauncherTip(self)
end)
button:SetScript("OnLeave", function()
  if launcherText.SetTextColor then launcherText:SetTextColor(0.910, 0.867, 0.773) end
  if GameTooltip then GameTooltip:Hide() end
end)
button:SetScript("OnClick", function(_, mouseButton)
  if mouseButton == "RightButton" then
    if OlympusVerifyUI and OlympusVerifyUI.Toggle then OlympusVerifyUI.Toggle() end
  else
    OlympusVerify_Flush()
  end
end)
button:Hide()

function frame:UpdateButton()
  -- SavedVariables are ready after login, not when this file first creates the button.
  if not launcherRestored and OlympusVerifyDB then
    local saved = OlympusVerifyDB.ui and OlympusVerifyDB.ui.launcher
    if saved and saved.point and button.ClearAllPoints then
      button:ClearAllPoints()
      button:SetPoint(saved.point, UIParent, saved.relPoint or saved.point, tonumber(saved.x) or 0, tonumber(saved.y) or 0)
    end
    launcherRestored = true
  end
  local n = QueuedCount()
  local notes = (SET_NOTES and OlympusVerifyDB) and #OlympusVerifyDB.notePending or 0
  if n > 0 or notes > 0 then
    local fresh = time() < alertUntil and "|cffE8BE65NEW|r  " or ""
    local total = (OlympusVerifyDB and OlympusVerifyDB.roster and OlympusVerifyDB.roster.total) or 0
    local atCap = total >= GUILD_CAP
    local c = Presence.Available() and Presence.Counts() or nil
    if SET_NOTES then
      button:SetText(string.format("%sOlympus  |cff9EA3AD·|r  %d invite%s  |cff9EA3AD·|r  %d note%s", fresh, n, n == 1 and "" or "s", notes, notes == 1 and "" or "s"))
      launcherDetail = "Left-click: process the next invite and eligible pending notes when possible. Presence checks may use the click for /who first. Right-click to review their status first."
    elseif atCap then
      -- The same thing the panel says. A floating button reading "click to send the next" over a guild that cannot
      -- accept anyone is the same false offer the panel used to make, and it is the one an officer sees first.
      button:SetText(string.format("%sOlympus  |cff9EA3AD·|r  |cffE8BE65Guild full|r  |cff9EA3AD·|r  %d waiting", fresh, n))
      launcherDetail = string.format("%d applicant%s waiting%s. Open the panel to review the queue. %s", n, n == 1 and "" or "s",
        c and string.format("; %d confirmed online and guildless", c.ready) or " for a seat",
        c and "Left-click: check the next applicant with /who while the guild is full." or "Left-click: attempt the next invite; the guild needs an open seat.")
    elseif c and c.ready > 0 then
      button:SetText(string.format("%sOlympus  |cff9EA3AD·|r  |cff8AC69A%d ready to invite|r", fresh, c.ready))
      launcherDetail = string.format("%d applicant%s confirmed online and guildless. Left-click: invite the next applicant. One invite per click.", c.ready, c.ready == 1 and "" or "s")
    elseif c then
      button:SetText(string.format("%sOlympus  |cff9EA3AD·|r  %d waiting  |cff9EA3AD·|r  Check next", fresh, n))
      launcherDetail = string.format("%d applicant%s waiting; none confirmed online and guildless. Left-click: check the next applicant with /who.", n, n == 1 and "" or "s")
    else
      button:SetText(string.format("%sOlympus  |cff9EA3AD·|r  %d invite%s queued", fresh, n, n == 1 and "" or "s"))
      launcherDetail = "Left-click: send the next invite. Each invite requires a separate click."
    end
    -- Compact labels stay bounded while the full explanation is available on hover.
    local fs = button.GetFontString and button:GetFontString()
    if fs and fs.GetStringWidth then
      if fs.SetWidth then fs:SetWidth(0) end -- measure without last refresh's clipping bound
      local measured = fs:GetStringWidth()
      local w = type(measured) == "number" and math.min(440, math.max(300, math.ceil(measured) + 36)) or 300
      button:SetWidth(w)
      if fs.SetWidth then fs:SetWidth(w - 32) end
    end
    if button.SetBackdropBorderColor then
      if fresh ~= "" then button:SetBackdropBorderColor(0.910, 0.745, 0.396, 1)
      elseif atCap then button:SetBackdropBorderColor(0.788, 0.659, 0.424, 1)
      else button:SetBackdropBorderColor(0.788, 0.659, 0.424, 0.45) end
    end
    button:Show()
    if GameTooltip and GameTooltip.IsOwned and GameTooltip:IsOwned(button) then ShowLauncherTip(button) end
    if fresh ~= "" and not alertTimer and C_Timer and C_Timer.After then
      alertTimer = true -- one refresh when the NEW marker expires; not one per redraw
      C_Timer.After(ALERT_WINDOW + 1, function() alertTimer = nil; frame:UpdateButton() end)
    end
  else
    button:Hide()
  end
  if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
end

-- What the panel reads. Everything here is a snapshot; the panel never touches the queue except through the calls below.
OlympusVerifyAPI = {
  Flush = OlympusVerify_Flush,                       -- Flush() = next ready (or check the next); Flush(entry) = that one (also retries a failed one)
  -- Presence. Check() is a hardware-event call like Flush: one /who per click.
  Check = function()
    local ok = Presence.Step(false)
    frame:UpdateButton()
    return ok
  end,
  PresenceOf = function(q) return Presence.Of(q) end,           -- state, record (see Presence.Of)
  PresenceCounts = function() return Presence.Counts() end,     -- { ready, checking, awaiting, offline, guilded, member, unchecked, unread, total, takenOff, filtering }
  -- Text helpers, not actions: pure formatters of a PresenceCounts() table. A table rather than functions on purpose --
  -- /olv preview swaps every function in this table for a sample stand-in, and these have nothing to stand in for.
  Text = { Breakdown = Presence.Breakdown, TakenOff = Presence.TakenOffText },
  -- Where notes to self go (the whole name, see Presence.MyName), where that came from, and what waits for it. A table
  -- for the same reason as Text: nothing here for /olv preview to stand in for.
  Name = { Mine = Presence.MyName, Via = Presence.MyNameVia, Pending = function() return Presence.pendingNotes end },
  PointKickMacro = function(name, reason)
    local ok, why = PointKickMacro(name)
    -- remembered so the removal, when the officer presses the macro, is recorded with why it was made
    if ok and type(name) == "string" then Unverified.aim[L.normalizeCharacter(name)] = reason or "space" end
    if ok then
      Print(string.format("macro \"%s\" now removes %s. Drag it from the macro window (Esc > Macros) onto a bar, then click it.", KICK_MACRO, name))
    else
      Print(string.format("could not point the macro at %s: %s.", tostring(name), tostring(why or "unknown")))
    end
    if OlympusVerifyUI and OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
    return ok
  end,
  Remove = function(entry)
    local db = OlympusVerifyDB
    for i, q in ipairs(db.queue) do if q == entry then table.remove(db.queue, i) break end end
    frame:UpdateButton()
  end,
  ClearQueue = function() OlympusVerifyDB.queue = {}; OlympusVerifyDB.notePending = {}; frame:UpdateButton() end,
  ExportRoster = function()
    if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
    local n = ExportRoster(true)
    frame:UpdateButton()
    return n
  end,
  FlushChatLog = function() local was = FLUSH_LOG; FLUSH_LOG = true; FlushChatLog(); FLUSH_LOG = was end,
  -- Export the roster and reload: the reload writes SavedVariables (roster, events) for the watcher to send, and loads
  -- the newest OlympusQueue.lua (Discord approvals) -- the two things WoW only exchanges at a reload. From a click only.
  Sync = function()
    ExportRoster(true)
    local reload = (C_UI and C_UI.Reload) or rawget(_G, "ReloadUI")
    if reload then reload() else Print("this client offers no reload call — type /reload.") end
  end,
  Candidates = function(n) return RemovalCandidates(n) end,
  RemoveMember = function(name, reason) return OlympusVerify_RemoveMember(name, reason) end,
  -- The roster window's reads (0.6.4). A table for the same reason as Text and Name: nothing here acts, so /olv
  -- preview has nothing to stand in for.
  Roster = { Members = Roster.Members, Filter = Roster.Filter, Sort = Roster.Sort },
  UnverifiedList = function(n) return Unverified.Candidates(n) end,
  UnverifiedRanks = function(info) return Unverified.Ranks(info) end,
  ToggleUnverifiedRank = function(rank) Unverified.ToggleRank(rank) end,
  UnverifiedExcluded = function() return Unverified.Excluded() end,
  When = function(ts) return Unverified.When(ts) end,
  Status = function()
    local db = OlympusVerifyDB or {}
    local q = OlympusQueue
    return {
      secret = SECRET and true or false,
      chatLogging = (LoggingChat and LoggingChat()) and true or false,
      flushLog = FLUSH_LOG,
      notes = SET_NOTES and not notesForbidden,
      queued = QueuedCount(),
      queue = db.queue or {},
      events = db.events or {},
      rosterCount = (db.roster and db.roster.members) and #db.roster.members or 0,
      rosterAt = (db.roster and db.roster.exportedAt) or 0,
      queueFileAt = (type(q) == "table" and tonumber(q.generatedAt)) or 0,
      queueFileEntries = (type(q) == "table" and type(q.entries) == "table") and #q.entries or 0,
      alertUntil = alertUntil,
      oldestQueuedAt = (function()
        local oldest
        for _, q in ipairs(db.queue or {}) do
          if q.status == "queued" and (not oldest or (q.ts or 0) < oldest) then oldest = q.ts or 0 end
        end
        return oldest or 0
      end)(),
      mergeSeconds = MERGE_INTERVAL,
      guildFullAt = guildFullAt,
      kickForbidden = kickForbidden,
      armedRemoval = armedRemoval and armedRemoval.name or nil,
      armedUntil = armedRemoval and armedRemoval.until_ or 0,
      offlineRule = OfflineRuleText(),
      kickMacroName = KICK_MACRO,
      kickMacroTarget = kickMacroTarget,
      macroForbidden = macroForbidden,
      removeVia = REMOVE_VIA,
      kickCommand = (GuildKickCommand()),
      rosterTotal = (db.roster and db.roster.total) or 0,
      guildCap = GUILD_CAP,
      version = VERSION,
    }
  end,
}

-- ---------------------------------------------------------------- events
-- ---------------------------------------------------------------- diagnostics (27 Sep): read-only
-- Two open questions the design depends on, answered from inside the client instead of guessed at:
--   * Blizzard's own Discord link. Guild chat messages relayed from a linked Discord channel carry a discordInfo record
--     (Discord user ID plus the name and GUID of the character that user last played), and guild member records have
--     an optional discordInfo field. If those are filled in and readable, Blizzard itself says "Discord user X is
--     character Y" -- which could replace the code whisper. Diag.OnGuildChat counts what arrives; /olv diag discord
--     asks C_Discord and C_Club directly. Nothing is sent anywhere: the results stay in SavedVariables.
--   * C_Log.LogMessage as a faster way out of the client than the chat log. /olv diag clog writes timing markers; the
--     watcher reports which Logs file each one reached and how many seconds it took.
local Diag = {}
local TWO_53 = 9007199254740992

function Diag.Store()
  local db = OlympusVerifyDB
  if not db then return nil end
  db.diag = db.diag or {}
  return db.diag
end

-- A value as text for the record: its type, and for numbers whether it can be an exact 64-bit Discord ID at all.
function Diag.Describe(v)
  if isSecret then
    local ok, secret = pcall(isSecret, v)
    if ok and secret then return "secret" end
    if not ok then
      local okNil, isNil = pcall(rawequal, v, nil)
      return (okNil and isNil) and "nil" or "secret"
    end
  end
  if rawequal(v, nil) then return "nil" end
  local ty = type(v)
  if ty == "number" then
    return string.format("number %.0f%s", v, v > TWO_53 and " (above 2^53: not exact)" or "")
  elseif ty == "string" then
    return "string " .. string.sub(v, 1, 64)
  elseif ty == "boolean" then
    return tostring(v)
  end
  return ty
end

function Diag.Field(t, k)
  local ok, v = pcall(function() return t[k] end)
  if ok then return v end
  return nil
end

-- A readable value that says something (not nil, 0, "0" or ""). A secret cannot be compared, so it is never "set" here;
-- Describe records it as "secret" instead.
function Diag.HasValue(v)
  if v == nil or Diag.Describe(v) == "secret" then return false end
  local ok, has = pcall(function() return v ~= 0 and v ~= "0" and v ~= "" end)
  return ok and has == true
end

function Diag.IsTrue(v)
  if v == nil or Diag.Describe(v) == "secret" then return false end
  local ok, yes = pcall(function() return v == true end)
  return ok and yes == true
end

-- Guild chat, passively. Only counts, plus a few samples of messages that came from Discord.
function Diag.OnGuildChat(...)
  local store = Diag.Store()
  if not store then return end
  local gc = store.guildChat or { seen = 0, secret = 0, discord = 0, samples = {} }
  store.guildChat = gc
  gc.seen = gc.seen + 1
  local info = select(18, ...)
  local desc = Diag.Describe(info)
  if desc == "nil" then return end
  if desc == "secret" then gc.secret = gc.secret + 1 return end
  if type(info) ~= "table" then return end
  local user, fromDiscord = Diag.Field(info, "userID"), Diag.IsTrue(Diag.Field(info, "fromDiscord"))
  local hasUser = Diag.HasValue(user) or Diag.Describe(user) == "secret"
  if not (hasUser or fromDiscord) then return end
  gc.discord = gc.discord + 1
  gc.lastAt = time()
  if #gc.samples < 12 then
    gc.samples[#gc.samples + 1] = {
      at = time(),
      userID = Diag.Describe(user),
      fromDiscord = fromDiscord,
      lastOnlineName = Presence.Readable(Diag.Field(info, "lastOnlineName")),
      lastOnlineGUID = Presence.Readable(Diag.Field(info, "lastOnlineGUID")),
      globalName = Presence.Readable(Diag.Field(info, "globalName")),
    }
  end
end

-- /olv diag discord: what C_Discord and the guild's member records say, from a typed command.
function Diag.Discord()
  local store = Diag.Store()
  if not store then return end
  local out = { at = time(), calls = {} }
  local function try(label, fn, ...)
    local r = { pcall(fn, ...) }
    if r[1] then
      out.calls[label] = { Diag.Describe(r[2]), Diag.Describe(r[3]), Diag.Describe(r[4]) }
    else
      out.calls[label] = { "error: " .. string.sub(tostring(r[2]), 1, 160) }
    end
    return r[1], r[2], r[3], r[4]
  end
  if C_Discord then
    for _, f in ipairs({ "IsEnabled", "IsUserOAuthed", "GetDiscordUserID", "GetDiscordUserName", "GetGuildLinkStatus", "IsGuildChannelLinked", "GetDisplayNameType" }) do
      if C_Discord[f] then try(f, C_Discord[f]) end
    end
  else
    out.calls.C_Discord = { "absent" }
  end
  if C_Club and C_Club.GetGuildClubId then
    local okId, clubId = try("GetGuildClubId", C_Club.GetGuildClubId)
    if okId and clubId then
      if C_Club.GetMemberInfoForSelf then
        local okSelf, me = pcall(C_Club.GetMemberInfoForSelf, clubId)
        local d = okSelf and type(me) == "table" and Diag.Field(me, "discordInfo") or nil
        local dd = Diag.Describe(d)
        local readable = dd ~= "nil" and dd ~= "secret"
        out.self = { ok = okSelf, discordInfo = dd ~= "nil", userID = readable and Diag.Describe(Diag.Field(d, "userID")) or (dd == "secret" and "secret" or nil),
                     lastOnlineName = readable and Presence.Readable(Diag.Field(d, "lastOnlineName")) or nil }
      end
      local okM, ids = pcall(C_Club.GetClubMembers, clubId)
      local members = { listed = okM and type(ids) == "table" and #ids or 0, read = 0, withDiscord = 0, withUser = 0, secret = 0, samples = {} }
      if okM and type(ids) == "table" then
        for _, id in ipairs(ids) do
          local okI, info = pcall(C_Club.GetMemberInfo, clubId, id)
          if okI and type(info) == "table" then
            members.read = members.read + 1
            local d = Diag.Field(info, "discordInfo")
            local dd = Diag.Describe(d)
            if dd ~= "nil" then
              members.withDiscord = members.withDiscord + 1
              local u = dd ~= "secret" and Diag.Field(d, "userID") or nil
              local desc = dd == "secret" and "secret" or Diag.Describe(u)
              if desc == "secret" then members.secret = members.secret + 1 end
              if desc == "secret" or Diag.HasValue(u) then
                members.withUser = members.withUser + 1
                if #members.samples < 5 then
                  members.samples[#members.samples + 1] = { name = Presence.Readable(Diag.Field(info, "name")), userID = desc,
                    lastOnlineName = Presence.Readable(Diag.Field(d, "lastOnlineName")), fromDiscord = Diag.IsTrue(Diag.Field(d, "fromDiscord")) }
                end
              end
            end
          end
        end
      end
      out.members = members
    end
  else
    out.calls.C_Club = { "absent" }
  end
  store.discord = out
  local c = out.calls
  Print(string.format("diag discord: enabled %s, your account linked %s, guild chat linked %s.",
    c.IsEnabled and c.IsEnabled[1] or "?", c.IsUserOAuthed and c.IsUserOAuthed[1] or "?", c.IsGuildChannelLinked and c.IsGuildChannelLinked[1] or "?"))
  if out.members then
    Print(string.format("diag discord: %d guild members read; %d carry a Discord record, %d with a user ID%s.",
      out.members.read, out.members.withDiscord, out.members.withUser, out.members.secret > 0 and string.format(" (%d secret)", out.members.secret) or ""))
  end
  local gc = store.guildChat
  Print(string.format("diag discord: guild chat since login-ish: %d messages, %d from Discord. Saved for the watcher side at your next /reload.",
    gc and gc.seen or 0, gc and gc.discord or 0))
end

-- /olv diag clog: timing markers through each C_Log call; the watcher reports where and when they land.
function Diag.CLog()
  local store = Diag.Store()
  if not store then return end
  local t, wrote = time(), {}
  if C_Log then
    for _, v in ipairs({ { "LogMessage", "clog-message" }, { "LogWarningMessage", "clog-warning" }, { "LogErrorMessage", "clog-error" } }) do
      local fn = C_Log[v[1]]
      if fn then
        local ok = pcall(fn, "OLVDIAG " .. v[2] .. " " .. t)
        wrote[#wrote + 1] = v[2] .. (ok and "" or " (refused)")
      end
    end
    if C_Log.LogMessageWithPriority then
      local prio = (Enum and Enum.LogPriority and Enum.LogPriority.Normal) or 10
      local ok = pcall(C_Log.LogMessageWithPriority, prio, "OLVDIAG clog-priority " .. t)
      wrote[#wrote + 1] = "clog-priority" .. (ok and "" or " (refused)")
    end
  end
  store.clog = { at = t, wrote = wrote }
  if #wrote == 0 then
    Print("diag clog: this client has no C_Log calls.")
  else
    Print("diag clog: wrote " .. table.concat(wrote, ", ") .. ". The watcher's window names the file each one reached and how many seconds it took.")
  end
end

-- What this client calls the player, at login and at logout (27 Sep: UnitName had dropped the second part of the name).
-- Recorded, not used: Presence.MyName decides, and this says which source it went by.
function Diag.Name()
  local store = Diag.Store()
  if not store then return nil end
  local out = { at = time() }
  local function grab(label, fn, ...)
    if type(fn) ~= "function" then out[label] = "missing" return end
    local r = { pcall(fn, ...) }
    out[label] = r[1] and (Diag.Describe(r[2]) .. " | " .. Diag.Describe(r[3])) or ("error: " .. string.sub(tostring(r[2]), 1, 120))
  end
  grab("UnitName", rawget(_G, "UnitName"), "player")
  grab("UnitFullName", rawget(_G, "UnitFullName"), "player")
  grab("GetUnitName", rawget(_G, "GetUnitName"), "player", true)
  grab("UnitGUID", rawget(_G, "UnitGUID"), "player")
  out.resolved = Presence.MyName()
  out.via = Presence.MyNameVia()
  store.name = out
  return out
end

function Diag.Print()
  local store = Diag.Store() or {}
  local gc = store.guildChat
  Print(string.format("diag: guild chat %d messages, %d from Discord; discord check %s; C_Log markers %s.",
    gc and gc.seen or 0, gc and gc.discord or 0, store.discord and ("ran " .. date("%H:%M", store.discord.at)) or "not run",
    store.clog and ("written " .. date("%H:%M", store.clog.at)) or "not written"))
  local me = Presence.MyName()
  local via = ({ roster = "the guild roster", chat = "a whisper to yourself", UnitName = "UnitName" })[Presence.MyNameVia() or ""]
  Print(string.format("diag: notes to self go to %s%s; UnitName says %s.", me or "nobody yet (the roster has not named you)",
    via and (" (from " .. via .. ")") or "", tostring(store.name and store.name.UnitName or "?")))
  Print("/olv diag discord  ·  /olv diag clog  ·  /olv logtest (does the chat-log flush work?)")
end

frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_LOGIN")
frame:RegisterEvent("CHAT_MSG_WHISPER")
frame:RegisterEvent("MAIL_SHOW")
frame:RegisterEvent("MAIL_CLOSED")
frame:RegisterEvent("MAIL_INBOX_UPDATE")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")
frame:RegisterEvent("PLAYER_LOGOUT")
frame:RegisterEvent("ADDON_ACTION_FORBIDDEN")
frame:RegisterEvent("ADDON_ACTION_BLOCKED")
frame:RegisterEvent("CHAT_MSG_SYSTEM")
frame:RegisterEvent("CHAT_MSG_GUILD")  -- read-only: counts what Blizzard's Discord link carries (Diag.OnGuildChat)
frame:RegisterEvent("UI_ERROR_MESSAGE")
if C_FriendList then frame:RegisterEvent("WHO_LIST_UPDATE") end

frame:SetScript("OnEvent", function(self, event, ...)
  if event == "ADDON_LOADED" then
    if ... == ADDON then InitDB() end
  elseif event == "PLAYER_LOGIN" then
    local db = InitDB()
    -- housekeeping: drop invited entries older than a week and mail keys older than a month
    local cutoff, kept = time() - 7 * 86400, {}
    for _, q in ipairs(db.queue) do if q.status == "queued" or math.max(q.invitedAt or 0, q.joinedAt or 0, q.failedAt or 0) > cutoff then kept[#kept + 1] = q end end
    db.queue = kept
    for k, ts in pairs(db.processedMail) do if ts < time() - 30 * 86400 then db.processedMail[k] = nil end end
    for k, t in pairs(db.tickets or {}) do if type(t) ~= "table" or time() - (t.at or 0) > TICKET_HOLD then db.tickets[k] = nil end end
    -- Which build is loaded and who is playing, for the watcher to read after the next /reload or logout. The chat log
    -- gets the same in the signed login note, but only when the client next writes it (every 48 KiB of chat). The GUID
    -- is what the watcher goes by (it looks the name up in the roster export); the name is the whole one, or nothing
    -- until the roster has named us (AnnounceRelay fills it in then) -- never UnitName's first part.
    db.addonVersion = VERSION
    db.lastCharacterGuid = Presence.PlayerGuid()
    db.lastCharacter = Presence.MyName()
    Presence.Safely("recording what this client calls you", Diag.Name)
    if (db.boots or 0) <= 1 then
      Print("session #1 — if this still says #1 after a /reload, SavedVariables is not persisting: the queue, the event ring and the notice history are starting empty every time.")
    else
      Print(string.format("session #%d.", db.boots))
    end
    if not SECRET then Print("Config.lua missing — copy Config.example.lua to Config.lua and set the secret.") end
    SeedContacts(db)
    Presence.Safely("starting the /who trace", Presence.Boot, db)
    if LoggingChat and not LoggingChat() then LoggingChat(true) end
    -- a few seconds in, once the chat log is open and the world has loaded
    if C_Timer and C_Timer.After then C_Timer.After(6, function() Presence.Safely("announcing this character to the watcher", AnnounceRelay) end) else AnnounceRelay() end
    local added = MergeQueueFile()
    StartMergeTicker()
    ShowOfflineMembers()
    local n = QueuedCount()
    if n > 0 and Presence.Available() then
      Print(string.format("%d waiting (%d new from Discord). Each press of your flush key invites the next one confirmed online and guildless, or checks the next in line with /who.", n, added))
    elseif n > 0 then
      Print(string.format("%d invite(s) queued (%d new from Discord). Press your flush key or click the button to send them.", n, added))
    end
    if Presence.enabled and not Presence.Available() then
      Print("presence checks are on in Config.lua, but this client has no /who API — the queue lists everyone.")
    end
    if C_Timer and C_Timer.After then C_Timer.After(10, function() local _, pending = CheckJoined(); if (pending or 0) > 0 then StartJoinTicker() end end) end
    self:UpdateButton()
  elseif event == "CHAT_MSG_WHISPER" then
    -- 0.6.0 pushed the chat log to disk here on every whisper; measured, that never wrote it early, so from 0.6.3
    -- FlushChatLog does nothing unless asked by hand (see its comment). During chat lockdown the text and the sender
    -- arrive as secret values the addon cannot read; the client still writes the line to the log.
    FlushChatLog()
    local text, sender = Presence.Readable((select(1, ...))), Presence.Readable((select(2, ...)))
    if not (text and sender) then return end
    local senderGuid = Presence.Readable((select(12, ...)))
    if Presence.LearnMyName(sender, senderGuid) then Presence.Safely("sending notes that waited for your name", Presence.SendWaiting) end
    NoteContact(sender)  -- before anything else: they have now whispered us, so they may be answered
    HandleCode("whisper", sender, text, senderGuid)
    Presence.Seen(sender)  -- after HandleCode, which may just have queued them
  elseif event == "CHAT_MSG_GUILD" then
    Presence.Safely("reading Discord identity in guild chat", Diag.OnGuildChat, ...)
  elseif event == "WHO_LIST_UPDATE" then
    Presence.Safely("reading the Who list", Presence.OnWhoList)
  elseif event == "MAIL_SHOW" then
    mailboxOpen = true
  elseif event == "MAIL_CLOSED" then
    mailboxOpen = false
  elseif event == "MAIL_INBOX_UPDATE" then
    ScanMailbox()
  elseif event == "GUILD_ROSTER_UPDATE" then
    Presence.rosterVersion = Presence.rosterVersion + 1
    ExportRoster(false)
    Presence.Safely("sending notes that waited for your name", Presence.SendWaiting)
  elseif event == "PLAYER_LOGOUT" then
    ExportRoster(true)
    local db = OlympusVerifyDB
    if db then db.lastCharacter = Presence.MyName() or db.lastCharacter end
    Presence.Safely("recording what this client calls you", Diag.Name)
  elseif event == "CHAT_MSG_SYSTEM" then
    -- Each consumer on its own: an error in one (or a line the client will not let us read) must not cost the
    -- others their look at it. Up to 0.5.2 one handler did all of this, and no /who answer was ever used.
    local raw = ...
    local okEvent, msg = pcall(Presence.OnSystemEvent, raw)
    if not okEvent then
      Presence.Failed("reading a system message", msg)
      msg = Presence.Readable(raw)
    end
    if msg then
      if pendingReply then Presence.Safely("reading the server's answer to an invite", NoteServerReply, msg) end
      Presence.Safely("signing a guild join or departure", SignGuildLine, msg)
      Presence.Safely("reading a removal notice", Unverified.OnSystemMessage, msg)
      -- guild joins and departures reach Discord through the chat log; push them to disk right away
      if msg:find("has joined the guild", 1, true) or msg:find("has left the guild", 1, true) or msg:find("kicked out of the guild", 1, true) then
        FlushChatLog()
      end
    end
  elseif event == "UI_ERROR_MESSAGE" then
    local text = Presence.Readable((select(2, ...)))
    if text and (#Presence.open > 0 or time() - (Presence.lastSentAt or 0) <= 20) then Presence.Trace("UI_ERROR_MESSAGE", { s = text }) end
    -- the /who refusal has so far come as a system line; should a client send it as an error instead, it counts the same
    if text and Presence.pending and Presence.IsThrottle(text) then Presence.Safely("reading a /who refusal", Presence.Throttled, text) end
    if pendingReply and text then Presence.Safely("reading the server's answer to an invite", NoteServerReply, text) end
  elseif event == "ADDON_ACTION_FORBIDDEN" then
    local addon = ...
    -- Keyed on the call we were making, not on how recently the server said the guild was full. The old test
    -- required a refusal inside the last five minutes, which was already fragile and became wrong the moment the
    -- panel started refusing to send invites at the cap: nothing gets refused, guildFullAt goes stale, and a
    -- forbidden removal was no longer recognised as one -- so the button kept offering an action that cannot work.
    if addon == ADDON and removingMember and not kickForbidden then
      kickForbidden = true
      if OlympusVerifyDB then OlympusVerifyDB.kickForbidden = true end
      Print("this client does not let addons remove guild members (ADDON_ACTION_FORBIDDEN) — use /gkick by hand; the panel still ranks who to remove.")
    end
    if addon == ADDON and editingMacro and not macroForbidden then
      macroForbidden = true
      Print("this client does not let addons write macros either — the panel can only name who to remove; type /gkick <name> by hand.")
    end
    if addon == ADDON and flushingNotes and not notesForbidden then
      notesForbidden = true
      Print("this client does not let addons set guild notes (ADDON_ACTION_FORBIDDEN) — notes are off for this session; set setNotes = false in Config.lua.")
    end
  end
  -- A /who the client refused. Presence.sending is set only across the SendWho call, so this cannot be someone
  -- else's refusal. Checks go off for the session and the queue lists everyone again, as before presence existed.
  if (event == "ADDON_ACTION_FORBIDDEN" or event == "ADDON_ACTION_BLOCKED") and (...) == ADDON and Presence.sending and not Presence.blocked then
    Presence.blocked = true
    Presence.pending = nil
    Print("this client does not let addons run /who (" .. event .. ") — presence checks are off for this session and the queue lists everyone again.")
    self:UpdateButton()
  end
end)

-- ---------------------------------------------------------------- slash commands
SLASH_OLYMPUSVERIFY1 = "/olv"
SlashCmdList.OLYMPUSVERIFY = function(msg)
  local cmd = string.lower(string.match(msg or "", "^%s*(%S*)") or "")
  local db = OlympusVerifyDB
  if cmd == "ranks" then
    if OlympusVerifyRanks and OlympusVerifyRanks.Print then OlympusVerifyRanks.Print(Print)
    else Print("rank guide not loaded — restart the game once after updating the addon.") end
  elseif cmd == "flush" then
    OlympusVerify_Flush() -- typed slash commands count as hardware events
  elseif cmd == "roster" then
    if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
    local n = ExportRoster(true)
    Print(string.format("roster exported: %s members (written to SavedVariables at logout or /reload).", tostring(n or 0)))
  elseif cmd == "clear" then
    db.queue = {}; db.notePending = {}
    frame:UpdateButton()
    Print("queue cleared.")
  elseif cmd == "sync" then
    OlympusVerifyAPI.Sync()
  elseif cmd == "flushlog" then
    if not LoggingChat then Print("LoggingChat is not available on this client.") return end
    local was = FLUSH_LOG; FLUSH_LOG = true
    FlushChatLog(); FLUSH_LOG = was
    Print(string.format("chat log flush requested (logging %s, delay %ds).", LoggingChat() and "on" or "off", FLUSH_LOG_DELAY))
  elseif cmd == "logtest" then
    -- Does the flush work? This writes a whisper to yourself carrying the time it was sent, and flushes. The watcher
    -- notes how many seconds that line took to reach Logs\\WoWChatLog.txt: seconds means the toggle writes the
    -- buffer out, minutes means lines wait for the client's 48 KiB batch (27 Sep).
    local me = Presence.MyName()
    if not me then
      if C_GuildInfo and C_GuildInfo.GuildRoster then pcall(C_GuildInfo.GuildRoster) end
      Print("your whole character name is not known yet (the guild roster has not arrived) — try again in a few seconds.")
      return
    end
    pcall(SendChatMessage, "Olympus log test OLVDIAG flush " .. time(), "WHISPER", nil, me)
    local was = FLUSH_LOG; FLUSH_LOG = true; FlushChatLog(); FLUSH_LOG = was
    Print("wrote a test whisper to " .. me .. " and flushed. Give it a minute before any /reload (a /reload writes the chat log by itself and would hide the answer). The watcher's window shows how many seconds it took (\"diag: marker 'flush' reached WoWChatLog.txt ...\").")
  elseif cmd == "diag" then
    local arg = string.lower(string.match(msg or "", "^%s*%S+%s+(%S+)") or "")
    if arg == "discord" then Diag.Discord()
    elseif arg == "clog" then Diag.CLog()
    else Diag.Print() end
  elseif cmd == "unverified" or cmd == "unv" then
    local arg = string.match(msg or "", "^%s*%S+%s+(.-)%s*$")
    if arg and arg ~= "" then
      local ex = Unverified.Excluded()
      for k in pairs(ex) do ex[k] = nil end
      if string.lower(arg) == "all" then
        Print("unverified: showing every rank.")
      else
        -- keep only the named ranks, matched case-insensitively against the ranks actually present
        local want, matched = {}, {}
        for r in string.gmatch(arg, "[^,]+") do want[string.lower((string.gsub(r, "^%s*(.-)%s*$", "%1")))] = true end
        local _, info = Unverified.Candidates(0)
        for _, br in ipairs(Unverified.Ranks(info)) do
          if want[string.lower(tostring(br.rank))] then matched[#matched + 1] = br.rank else ex[br.rank] = true end
        end
        if #matched == 0 then
          for k in pairs(ex) do ex[k] = nil end
          Print("unverified: no rank by that name here, so the filter is reset — the ranks are listed below.")
        else
          Print("unverified: showing " .. table.concat(matched, ", ") .. ".")
        end
      end
    end
    Unverified.Print(10)
  elseif cmd == "aim" then
    local top = Unverified.Candidates(1)
    if not top[1] then Print("aim: nobody is removable with the current filter — /olv unverified says why.") return end
    OlympusVerifyAPI.PointKickMacro(top[1].name, "unverified")
  elseif cmd == "unaimed" then
    Print(string.format("%s is not aimed at anyone. Open /olv > Unverified and press Macro on a row, or type /olv aim.", KICK_MACRO))
  elseif cmd == "macrotest" then
    local ok, why = Unverified.TestMacro()
    if ok then
      Print(string.format("macro editing works. \"%s\" exists and is disarmed — drag it from Esc > Macros onto an action bar once; pressing it now only prints a reminder.", KICK_MACRO))
    else
      Print("macro test failed: " .. tostring(why) .. string.format(". Removal still works by typing %s <name> yourself.", (GuildKickCommand())))
    end
  elseif cmd == "kick" then
    -- Everything that decides whether a removal can happen at all, in one place. "It didn't work" has at least four
    -- distinct causes here and they are indistinguishable from the outside.
    local command, source = GuildKickCommand()
    Print("guild removal diagnostics:")
    Print(string.format("  addon removal (C_GuildInfo.Uninvite): %s", kickForbidden and "FORBIDDEN by this client" or "not yet refused"))
    Print(string.format("  addon macro writes: %s", macroForbidden and "FORBIDDEN by this client" or "allowed so far"))
    Print(string.format("  macro API present: CreateMacro=%s EditMacro=%s GetMacroIndexByName=%s",
      tostring(CreateMacro ~= nil), tostring(EditMacro ~= nil), tostring(GetMacroIndexByName ~= nil)))
    local aliases = {}
    for i = 1, 8 do local s = _G["SLASH_GUILDUNINVITE" .. i]; if type(s) == "string" and s ~= "" then aliases[#aliases + 1] = s end end
    Print(string.format("  this client's removal commands: %s", #aliases > 0 and table.concat(aliases, " ") or "NONE DECLARED"))
    Print(string.format("  macro would use: %s   (from %s)", command, source))
    local idx = GetMacroIndexByName and GetMacroIndexByName(KICK_MACRO) or 0
    if idx and idx > 0 and GetMacroBody then
      Print(string.format("  macro \"%s\" exists at slot %d, body: %s", KICK_MACRO, idx, tostring(GetMacroBody(idx))))
    else
      Print(string.format("  macro \"%s\": not created yet", KICK_MACRO))
    end
    Print(string.format("  can you remove members at all? guild rank permission: %s",
      (CanGuildRemove and tostring(CanGuildRemove())) or "CanGuildRemove() not available on this client"))
  elseif cmd == "full" then
    local list, total = RemovalCandidates(MAX_CANDIDATES)
    if #list == 0 then
      Print(string.format("no removal candidates: nobody is past their inactivity threshold (%s) and below rank index %d without a \"%s\" note.", OfflineRuleText(), PROTECT_RANK_INDEX, HOLD_NOTE))
    else
      if kickForbidden then
        Print(string.format("%d eligible, showing %d. This client will not let an addon remove members, so these are for /gkick by hand:", total or 0, #list))
      else
        Print(string.format("%d eligible, showing %d (longest past their threshold first). Remove from the panel — /olv opens it.", total or 0, #list))
      end
      for i, c in ipairs(list) do
        Print(string.format("  %d. %s%s — level %s, %s, away %s (threshold %dd)%s", i, kickForbidden and "/gkick " or "", c.name,
          tostring(c.level), tostring(c.rank), AwayText(c.days), c.need or 0, (c.note and c.note ~= "") and (", note: " .. c.note) or ""))
      end
    end
  elseif cmd == "members" or cmd == "who" then
    -- The roster window (OlympusVerifyRoster.lua): every member, verified or not, with Discord names. Anything after
    -- the command is the search text.
    local arg = string.match(msg or "", "^%s*%S+%s+(.-)%s*$")
    if OlympusVerifyRoster and OlympusVerifyRoster.Show then
      OlympusVerifyRoster.Show(arg)
    else
      local list, info = Roster.Members()
      Print(string.format("%d members: %d verified, %d verifying, %d not verified, %d not in the last list. The roster window is not loaded: restart the game once after updating the addon.",
        info.total, info.verified, info.pending, info.unverified, info.unknown))
      for _, m in ipairs(Roster.Sort(Roster.Filter(list, { text = arg }), "name")) do
        if arg and arg ~= "" then Print(string.format("  %s — %s%s", m.name, m.status, m.discord and (", Discord @" .. m.discord .. (m.display and (" (" .. m.display .. ")") or "")) or "")) end
      end
    end
  elseif cmd == "merge" then
    local added = MergeQueueFile()
    Print(string.format("queue table re-merged: %d new entry(ies); %d queued in total (a new queue file needs /reload).", added or 0, QueuedCount()))
  elseif cmd == "queue" then
    -- Everyone, including the rows the panel leaves out, with what the last check said about each.
    local label = { ready = "READY (online, no guild)", checking = "checking…", awaiting = "asked, answer not in yet",
                    offline = "offline", guilded = "in another guild", member = "already in the guild",
                    unchecked = "not checked yet", unread = "no usable /who answer — skipped for now" }
    for _, q in ipairs(db.queue) do
      local extra = ""
      if q.status == "queued" and Presence.Available() then
        local st, rec = Presence.Of(q)
        extra = " — " .. (label[st] or st)
        if rec and rec.at and st ~= "unchecked" then extra = extra .. " " .. Presence.Ago(rec.at) .. " ago" end
        if rec and rec.guild and st == "guilded" then extra = extra .. " <" .. rec.guild .. ">" end
      end
      Print(string.format("%s%s — %s (%s)%s%s", (q.position or 0) > 0 and ("#" .. q.position .. " ") or "", q.name, q.status,
        q.source or "?", extra, q.reply and (" — " .. q.reply) or ""))
    end
    if #db.queue == 0 then Print("queue is empty.") end
  elseif cmd == "trace" then
    -- What the /who machinery saw: each /who sent, every system line around it as the client delivered it, how it
    -- was read, and each answer, timeout and error. Read-only except "clear".
    Presence.PrintTrace(string.lower(string.match(msg or "", "^%s*%S+%s+(%S+)") or ""))
  elseif cmd == "check" then
    OlympusVerifyAPI.Check() -- a typed command is a hardware event, so this can spend the /who
  elseif cmd == "all" then
    if OlympusVerifyUI then
      OlympusVerifyUI.showAll = not OlympusVerifyUI.showAll
      Print(OlympusVerifyUI.showAll and "panel lists everyone in the queue (this session)." or "panel lists only applicants online and in no guild.")
      if OlympusVerifyUI.Refresh then OlympusVerifyUI.Refresh() end
    end
  elseif cmd == "status" or cmd == "help" then
    if kickForbidden then Print("removals: blocked for addons here — /olv kick shows why and what the macro would run.") end
    Print(string.format("queued %d, notes %s, events %d, roster %d members, chat logging %s.",
      QueuedCount(), SET_NOTES and (tostring(#db.notePending) .. " pending") or "off", #db.events, db.roster.members and #db.roster.members or 0, (LoggingChat and LoggingChat()) and "on" or "off"))
    Print(string.format("queue file (Discord approvals, unverified list) loads at login and /reload — WoW cannot re-read a file while running; trusted-join whispers %s.", (SECRET and OlympusHmac and OlympusHmac.joinToken) and "on" or "OFF (no secret)"))
    if Presence.Available() then
      local c = Presence.Counts()
      local off = Presence.TakenOffText(c)
      Print(string.format("presence: %d ready (online, no guild)%s%s — /olv check looks up the next one.",
        c.ready, c.total > c.ready and (", " .. Presence.Breakdown(c)) or "", off and ("; " .. off) or ""))
    else
      Print(string.format("presence checks: %s — the queue lists everyone.", Presence.blocked and "refused by this client" or (Presence.enabled and "no /who API here" or "off in Config.lua")))
    end
    Print("/olv (panel) | members [name] | ranks | flush | check | queue | all | trace | merge | full | unverified [ranks|all] | aim | macrotest | roster | clear | flushlog | logtest | diag [discord|clog] | sync | preview [state|list|off] | status")
  elseif cmd == "show" or cmd == "hide" or cmd == "" then
    if OlympusVerifyUI and OlympusVerifyUI.Toggle then
      if cmd == "show" then OlympusVerifyUI.Show() elseif cmd == "hide" then OlympusVerifyUI.Hide() else OlympusVerifyUI.Toggle() end
    else
      Print("panel not loaded — /olv status")
    end
  else
    Print("unknown command — /olv status lists them.")
  end
end

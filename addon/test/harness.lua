-- Smoke test for OlympusVerify.lua outside the game: stubs the handful of WoW APIs the addon touches.
-- Run from addon/:  lua5.1 test/harness.lua        (needs lua-bitop for `bit`)
bit = require("bit")
date = function(fmt, t) return os.date(fmt, t) end
time = function() return os.time() end

local calls = { whispers = {}, invites = {}, notes = {}, messages = {}, uninvites = {}, showOffline = nil }
local roster = {}  -- { {name=, rank=, rankIndex=, level=, class=, note=, onote=, online=, guid=} }

-- Widgets: the few methods the tests inspect are real; every other method is a no-op (the panel calls dozens).
local noop = function() end
local Frame
local widgetMeta = { __index = function(_, k) if type(k) == "string" and k:match("^%u") then return noop end end }
Frame = function()
  local f = setmetatable({ scripts = {}, events = {}, shown = true }, widgetMeta)
  function f:RegisterEvent(e) self.events[e] = true end
  function f:SetScript(k, fn) self.scripts[k] = fn end
  function f:Fire(event, ...) if self.scripts.OnEvent then self.scripts.OnEvent(self, event, ...) end end
  function f:Hide() self.shown = false end
  function f:Show() self.shown = true end
  function f:IsShown() return self.shown end
  function f:SetText(t) self.text = t end
  function f:GetText() return self.text end
  function f:CreateFontString() return Frame() end
  function f:CreateTexture() return Frame() end
  function f:GetPoint() return "CENTER", nil, "CENTER", 0, 0 end
  function f:Click(btn) if self.scripts.OnClick then self.scripts.OnClick(self, btn or "LeftButton") end end
  return f
end
local frames = {}
CreateFrame = function(_, name) local f = Frame(); if name then frames[name] = f end; return f end
UIParent = {}
BackdropTemplateMixin = {}
GameTooltip = Frame()
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(calls.messages, m); print("  [chat] " .. m) end }
SendChatMessage = function(text, kind, _, target) table.insert(calls.whispers, { text = text, kind = kind, target = target }) end
IsInGuild = function() return true end
UnitName = function() return "Fern Melder" end
GetNumGuildMembers = function() return #roster end
GetGuildRosterInfo = function(i)
  local m = roster[i]; if not m then return end
  return m.name, m.rank, m.rankIndex, m.level, m.class, "Orgrimmar", m.note or "", m.onote or "", m.online, 0, string.upper(m.class or ""), 0, 0, false, false, 0, m.guid
end
GetGuildRosterLastOnline = function(i)
  local m = roster[i]
  local d = m and m.daysOffline or 1
  return 0, math.floor(d / 30), d % 30, 2
end
SetGuildRosterShowOffline = function(v) calls.showOffline = v end
C_GuildInfoUninviteCalls = {}
local forbidNotes = false
local timers, tickers = {}, {}
C_GuildInfo = {
  Invite = function(target) table.insert(calls.invites, target) end,
  Uninvite = function(name) table.insert(calls.uninvites, name) end,
  SetNote = function(guid, note, isPublic)
    if forbidNotes then frames.OlympusVerifyFrame:Fire("ADDON_ACTION_FORBIDDEN", "OlympusVerify", "UNKNOWN()"); return end
    table.insert(calls.notes, { guid = guid, note = note, public = isPublic })
  end,
  GuildRoster = function() end,
  MemberExistsByName = function(name) for _, m in ipairs(roster) do if m.name == name then return true end end return false end,
}
C_Timer = {
  After = function(_, fn) table.insert(timers, fn) end,
  NewTicker = function(_, fn) local t = { Cancel = function(self) self.cancelled = true end }; table.insert(tickers, { t = t, fn = fn }); return t end,
}
-- time() never advances here, so a timer that re-arms itself until a deadline passes would spin forever: cap the drain
local function runTimers()
  local budget = 200
  while #timers > 0 and budget > 0 do table.remove(timers, 1)(); budget = budget - 1 end
  for _, tk in ipairs(tickers) do if not tk.t.cancelled then tk.fn() end end
end
local logging = false
LoggingChat = function(v) if v ~= nil then logging = v end return logging end
GetInboxNumItems = function() return 1 end
GetInboxHeaderInfo = function() return nil, nil, "Mailer", "hello" end
GetInboxText = function() return "!verify " .. OlympusHmac.codeFor("olympus-test-secret", "Mailer", OlympusHmac.utcDay(time())) end
SlashCmdList = {}

-- load the addon the way the client does (TOC order)
dofile("OlympusVerify/Libs/OlympusHmac.lua")
OlympusVerifyConfig = { secret = "olympus-test-secret", setNotes = true }
OlympusQueue = { version = 1, generatedAt = 1, setGuildNote = true, entries = { { id = 7, character = "Aelin Stormwarden", discordId = "123456789012345678", note = "D:123456789012345678" } } }
local chunk = assert(loadfile("OlympusVerify/OlympusVerify.lua"))
chunk("OlympusVerify")
local uiChunk = assert(loadfile("OlympusVerify/OlympusVerifyUI.lua"))
uiChunk("OlympusVerify")
local f = frames.OlympusVerifyFrame

f:Fire("ADDON_LOADED", "OlympusVerify")
f:Fire("PLAYER_LOGIN")
assert(logging == true, "chat logging on")
assert(#OlympusVerifyDB.queue == 1 and OlympusVerifyDB.queue[1].name == "Aelin Stormwarden", "queue file merged")
assert(frames.OlympusVerifyButton.shown, "button visible with a queued invite")

local good = OlympusHmac.codeFor("olympus-test-secret", "Thrall", OlympusHmac.utcDay(time()))
f:Fire("CHAT_MSG_WHISPER", "!verify " .. string.lower(good), "Thrall-Whitemane")
f:Fire("CHAT_MSG_WHISPER", "!verify " .. good, "Thrall-Whitemane")     -- duplicate: no second reply within 30 s, no second queue entry
f:Fire("CHAT_MSG_WHISPER", "!verify ZZZZZZ", "Impostor-Whitemane")
f:Fire("CHAT_MSG_WHISPER", "hello there", "Someone-Whitemane")
assert(#calls.whispers == 2, "two replies, got " .. #calls.whispers)
assert(calls.whispers[1].target == "Thrall-Whitemane" and calls.whispers[1].text:find("confirmed"), "valid reply")
assert(calls.whispers[2].target == "Impostor-Whitemane" and calls.whispers[2].text:find("not valid"), "invalid reply")
assert(#OlympusVerifyDB.queue == 2 and OlympusVerifyDB.queue[2].target == "Thrall-Whitemane", "whisper queued with realm-qualified target")

f:Fire("MAIL_SHOW"); f:Fire("MAIL_INBOX_UPDATE"); f:Fire("MAIL_INBOX_UPDATE"); f:Fire("MAIL_CLOSED")
assert(#OlympusVerifyDB.queue == 3 and OlympusVerifyDB.queue[3].source == "mail", "mail code queued once")

OlympusVerify_Flush()
assert(#calls.invites == 1, "one invite per press, got " .. #calls.invites)
assert(frames.OlympusVerifyButton.shown and frames.OlympusVerifyButton.text:find("2 invite"), "button counts the two still waiting: " .. tostring(frames.OlympusVerifyButton.text))
-- the server answers "not found" (applicant offline): back to queued, retried on the next press
f:Fire("CHAT_MSG_SYSTEM", '"Aelin Stormwarden" not found.')
-- "not found" refunds the attempt: nobody can arrange to be online for an invite, so a miss is not theirs
assert(OlympusVerifyDB.queue[1].status == "queued" and OlympusVerifyDB.queue[1].attempts == 0 and OlympusVerifyDB.queue[1].reply:find("not found"), "offline applicant re-queued, attempt refunded")
assert(OlympusVerifyDB.events[#OlympusVerifyDB.events - 0].type == "invite" and OlympusVerifyDB.events[#OlympusVerifyDB.events].ok == false, "invite event marked failed with the server's answer")
OlympusVerify_Flush()   -- Aelin again (first queued)
OlympusVerify_Flush()   -- Thrall
OlympusVerify_Flush()   -- Mailer
assert(#calls.invites == 4, "four invite calls after four presses, got " .. #calls.invites)
assert(calls.invites[1] == "Aelin Stormwarden" and calls.invites[2] == "Aelin Stormwarden" and calls.invites[3] == "Thrall-Whitemane" and calls.invites[4] == "Mailer", "invite order")
assert(OlympusVerifyDB.queue[1].status == "invited" and OlympusVerifyDB.queue[1].attempts == 1, "second invite outstanding; only it counts")
assert(#OlympusVerifyDB.notePending == 1 and OlympusVerifyDB.notePending[1].name == "Aelin Stormwarden", "note pending for the Discord-approved entry")
assert(not frames.OlympusVerifyButton.shown or frames.OlympusVerifyButton.text:find("1 note"), "button reflects pending note")

-- Aelin accepts and appears on the roster; the next flush sets her note; roster export captures everyone
roster = {
  { name = "Fernmelder", rank = "Guild Master", rankIndex = 0, level = 60, class = "Warlock", online = true, guid = "Player-1-A" },
  { name = "Aelin Stormwarden", rank = "Member", rankIndex = 4, level = 5, class = "Hunter", online = true, guid = "Player-1-B" },
}
f:Fire("GUILD_ROSTER_UPDATE")
runTimers()
assert(OlympusVerifyDB.queue[1].status == "joined", "Aelin detected as joined via MemberExistsByName, got " .. tostring(OlympusVerifyDB.queue[1].status))
assert(OlympusVerifyDB.queue[2].status == "invited", "Thrall still only invited")
OlympusVerify_Flush()
assert(#calls.notes == 1 and calls.notes[1].guid == "Player-1-B" and calls.notes[1].note == "D:123456789012345678" and calls.notes[1].public == true, "note set via C_GuildInfo.SetNote")
assert(#OlympusVerifyDB.notePending == 0, "note cleared")
assert(OlympusVerifyDB.roster.members and #OlympusVerifyDB.roster.members == 2 and OlympusVerifyDB.roster.members[2].guid == "Player-1-B", "roster exported")
assert(OlympusVerifyDB.roster.members[1].lastOnline == 0 and OlympusVerifyDB.roster.exportedAt > 0, "roster fields")

local types = {}
for _, e in ipairs(OlympusVerifyDB.events) do types[e.type] = (types[e.type] or 0) + 1 end
assert(types.whisper == 3 and types.mail == 1 and types.invite == 4 and types.note == 1 and types.joined == 1, "event ring")

-- "has joined the guild" arriving within the reply window marks the entry joined at once
OlympusQueue = { version = 1, generatedAt = 3, setGuildNote = false, entries = { { id = 9, character = "Cara Swift", discordId = "323456789012345678", note = "" } } }
f:Fire("PLAYER_LOGIN")
OlympusVerify_Flush()
f:Fire("CHAT_MSG_SYSTEM", "Cara Swift has joined the guild.")
local cara
for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Cara Swift" then cara = q end end
assert(cara and cara.status == "joined", "joined via the server message, got " .. tostring(cara and cara.status))
-- a full guild is not the applicant's doing: every "Guild is full." refunds the attempt (since 19 Sep, matching the
-- Worker's INVITE_RETRY_FULL), so five of them leave the entry queued with nothing used instead of retiring it
OlympusQueue = { version = 1, generatedAt = 4, setGuildNote = false, entries = { { id = 10, character = "Dorn Late", discordId = "423456789012345678", note = "" } } }
f:Fire("PLAYER_LOGIN")
for i = 1, 5 do OlympusVerify_Flush(); f:Fire("UI_ERROR_MESSAGE", 0, "Guild is full.") end
local dorn
for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Dorn Late" then dorn = q end end
assert(dorn and dorn.status == "queued" and (dorn.attempts or 0) == 0, "five full-guild answers use up nothing, got " .. tostring(dorn and dorn.status) .. "/" .. tostring(dorn and dorn.attempts))

-- the Forever beta case: SetNote raises ADDON_ACTION_FORBIDDEN → notes switch off for the session, nothing else changes
forbidNotes = true
OlympusQueue = { version = 1, generatedAt = 2, setGuildNote = true, entries = { { id = 8, character = "Brann Ironfoot", discordId = "223456789012345678", note = "D:223456789012345678" } } }
f:Fire("PLAYER_LOGIN")
OlympusVerify_Flush()                                   -- invite fires; note queued
roster[#roster + 1] = { name = "Brann Ironfoot", rank = "Member", rankIndex = 4, level = 3, class = "Warrior", online = true, guid = "Player-1-C" }
f:Fire("GUILD_ROSTER_UPDATE")
local before = #calls.messages
OlympusVerify_Flush()                                   -- SetNote → forbidden → notes off
assert(#calls.notes == 1, "no further note calls after the forbidden event")
assert(#OlympusVerifyDB.notePending == 1, "the note stays pending, not lost")
local saidOff = false
for i = before + 1, #calls.messages do if calls.messages[i]:find("notes are off") then saidOff = true end end
assert(saidOff, "officer told that notes are off")
local noteCallsBefore = #calls.notes
OlympusVerify_Flush()
assert(#calls.notes == noteCallsBefore, "SetNote is not attempted again this session")
assert(calls.invites[#calls.invites] == "Brann Ironfoot" or calls.invites[#calls.invites - 1] == "Brann Ironfoot", "invite still went out")
assert(#OlympusVerifyDB.notePending == 1, "pending note survives later flushes while notes are off")

-- an existing guild member verifies (e.g. the officer's own character): confirmed, no invite queued, different reply
roster[#roster + 1] = { name = "Fern Melder", rank = "Initiate", rankIndex = 4, level = 1, class = "Warrior", online = true, guid = "Player-1-D" }
local queueBefore, whispersBefore = #OlympusVerifyDB.queue, #calls.whispers
local memberCode = OlympusHmac.codeFor("olympus-test-secret", "Fern Melder", OlympusHmac.utcDay(time()))
f:Fire("CHAT_MSG_WHISPER", "!verify " .. memberCode, "Fern Melder")
assert(#OlympusVerifyDB.queue == queueBefore, "no invite queued for someone already on the roster")
assert(#calls.whispers == whispersBefore + 1 and calls.whispers[#calls.whispers].text:find("already on the guild roster"), "member reply: " .. tostring(calls.whispers[#calls.whispers].text))
local last = OlympusVerifyDB.events[#OlympusVerifyDB.events]
assert(last.type == "whisper" and last.ok == true and last.inGuild == true and last.code == memberCode, "whisper event still recorded for the watcher, flagged inGuild")

-- the panel: opens on a new invite, lists the queue, sends one invite per row click, removes entries
local panel = frames.OlympusVerifyPanel
assert(panel and panel.shown, "panel auto-opened when the first invite landed")
OlympusVerifyUI.Hide(); assert(not panel.shown, "panel hides")
SlashCmdList.OLYMPUSVERIFY("")            -- bare /olv toggles it back
assert(panel.shown, "/olv toggles the panel")
local newcomer = OlympusHmac.codeFor("olympus-test-secret", "Row Tester", OlympusHmac.utcDay(time()))
f:Fire("CHAT_MSG_WHISPER", "!verify " .. newcomer, "Row Tester")
local rowEntry
for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Row Tester" then rowEntry = q end end
assert(rowEntry and rowEntry.status == "queued", "newcomer queued")
-- Since the 25 Sep panel redesign the NEW marker is a badge beside a fixed-width title, and the counts are on the
-- summary line under it (they used to share the title string and drew into the version text).
local badge = OlympusVerifyUI.newBadge
assert(badge and badge.shown and tostring(badge.label.text):find("NEW invite"), "NEW badge shows: " .. tostring(badge and badge.label.text))
assert(tostring(OlympusVerifyUI.summary.text):find("waiting") or tostring(OlympusVerifyUI.summary.text):find("to send"), "summary counts the queue: " .. tostring(OlympusVerifyUI.summary.text))
local invitesBefore = #calls.invites
OlympusVerifyAPI.Flush(rowEntry)              -- what a row's Invite button does
assert(#calls.invites == invitesBefore + 1 and calls.invites[#calls.invites] == "Row Tester", "row click invites exactly that character")
assert(rowEntry.status == "invited", "row entry marked invited")
f:Fire("CHAT_MSG_SYSTEM", "Row Tester is already in a guild.")
assert(rowEntry.status == "failed", "server answer marks it failed: " .. tostring(rowEntry.status))
OlympusVerifyAPI.Flush(rowEntry)              -- retry from the row
assert(rowEntry.status == "invited" and #calls.invites == invitesBefore + 2, "failed entry can be retried from its row")
OlympusVerifyAPI.Remove(rowEntry)
for _, q in ipairs(OlympusVerifyDB.queue) do assert(q ~= rowEntry, "entry removed") end
local st = OlympusVerifyAPI.Status()
assert(st.secret and st.chatLogging and st.rosterCount == 4 and #st.events > 0, "status snapshot")
OlympusVerifyUI.Refresh()
runTimers()

SlashCmdList.OLYMPUSVERIFY("status")
SlashCmdList.OLYMPUSVERIFY("queue")

-- ---------------------------------------------------------------- freeing a seat when the guild is full
-- The addon ranks and an officer clicks; nothing here removes a member on its own. These assertions pin the guards,
-- because every one of them is the difference between a useful shortlist and kicking the wrong person.
do
  local savedRoster = {}
  for i, m in ipairs(roster) do savedRoster[i] = m end
  for i = #roster, 1, -1 do roster[i] = nil end
  local function add(t) roster[#roster + 1] = t end
  add({ name = "Fern Melder", rank = "Initiate", rankIndex = 4, level = 60, class = "WARRIOR", online = true, daysOffline = 0 })   -- me
  add({ name = "Online Now", rank = "Member", rankIndex = 3, level = 60, class = "MAGE", online = true, daysOffline = 0 })          -- online
  add({ name = "Old Officer", rank = "Officer", rankIndex = 1, level = 60, class = "PRIEST", online = false, daysOffline = 200 })   -- senior rank
  add({ name = "Held Member", rank = "Member", rankIndex = 3, level = 60, class = "ROGUE", online = false, daysOffline = 300, note = "hold - deployed" })
  add({ name = "Recent Away", rank = "Member", rankIndex = 3, level = 60, class = "DRUID", online = false, daysOffline = 5 })       -- too recent
  add({ name = "Long Gone", rank = "Initiate", rankIndex = 4, level = 22, class = "HUNTER", online = false, daysOffline = 120 })
  add({ name = "Longer Gone", rank = "Member", rankIndex = 3, level = 60, class = "SHAMAN", online = false, daysOffline = 180 })

  local list, total = OlympusVerifyAPI.Candidates(10)
  local names = {}
  for _, c in ipairs(list) do names[#names + 1] = c.name end
  local joined = table.concat(names, ",")
  assert(joined == "Longer Gone,Long Gone", "longest away first, everyone else excluded — got: " .. joined)
  assert(total == 2, "two eligible, got " .. tostring(total))
  assert(calls.showOffline == true, "the roster is read with offline members shown, or the ranking sees nobody")

  -- two clicks to remove: the first only arms it
  local before = #calls.uninvites
  OlympusVerifyAPI.RemoveMember("Longer Gone")
  assert(#calls.uninvites == before, "the first click arms, it does not remove")
  OlympusVerifyAPI.RemoveMember("Longer Gone")
  assert(#calls.uninvites == before + 1 and calls.uninvites[#calls.uninvites] == "Longer Gone", "the second click removes")

  -- arming one name must not confirm another
  OlympusVerifyAPI.RemoveMember("Long Gone")
  local mid = #calls.uninvites
  OlympusVerifyAPI.RemoveMember("Longer Gone")
  assert(#calls.uninvites == mid, "a click on a different row re-arms rather than confirming the first")

  local removed
  for _, e in ipairs(OlympusVerifyDB.events) do if e.type == "removed" then removed = e end end
  assert(removed and removed.name == "Longer Gone" and removed.reason == "space" and removed.ok == true,
    "the removal is reported to the Worker as a seat freed, not an ordinary departure")

  -- the "guild is full" answer ranks and reports, and still removes nobody by itself
  local uninvitesBefore = #calls.uninvites
  local eventsBefore = #OlympusVerifyDB.events
  table.insert(OlympusVerifyDB.queue, { name = "Hopeful One", target = "Hopeful One", status = "queued", source = "worker", id = 77, ts = time() })
  OlympusVerify_Flush()
  f:Fire("CHAT_MSG_SYSTEM", "Guild is full.")
  local full
  for i = eventsBefore + 1, #OlympusVerifyDB.events do
    if OlympusVerifyDB.events[i].type == "guild_full" then full = OlympusVerifyDB.events[i] end
  end
  assert(full, "a full guild is reported to Discord")
  assert(full.candidates and #full.candidates > 0, "with the shortlist attached")
  assert(#calls.uninvites == uninvitesBefore, "and nobody is removed automatically")
  print("  free a seat: ranking guards hold, removal needs two clicks, a full guild reports and removes nobody")

  for i = #roster, 1, -1 do roster[i] = nil end
  for i, m in ipairs(savedRoster) do roster[i] = m end
end

-- ---------------------------------------------------------------- withdrawn queue entries
-- A row leaves OlympusQueue.lua when Discord cancels it (ban/unbind) or when another officer's client claims it.
-- Before 18 Sep the invite stayed in this client's queue and was sent anyway.
do
  OlympusQueue = { version = 1, generatedAt = 10, setGuildNote = false, entries = {
    { id = 91, character = "Withdrawn One", discordId = "911", note = "" },
    { id = 92, character = "Kept One", discordId = "922", note = "" },
  } }
  SlashCmdList.OLYMPUSVERIFY("merge")
  local function find(name)
    for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == name then return q end end
  end
  assert(find("Withdrawn One") and find("Kept One"), "both worker entries merged in")

  -- a whisper-queued entry must survive regardless: it was never the Worker's to withdraw
  local localCode = OlympusHmac.codeFor("olympus-test-secret", "Local Queued", OlympusHmac.utcDay(time()))
  f:Fire("CHAT_MSG_WHISPER", "!verify " .. localCode, "Local Queued")
  assert(find("Local Queued"), "whisper-queued entry present")

  OlympusQueue = { version = 1, generatedAt = 11, setGuildNote = false, entries = {
    { id = 92, character = "Kept One", discordId = "922", note = "" },
  } }
  SlashCmdList.OLYMPUSVERIFY("merge")
  assert(not find("Withdrawn One"), "a worker entry dropped from the file is withdrawn from the queue")
  assert(find("Kept One"), "an entry still in the file stays")
  assert(find("Local Queued"), "a whisper-queued entry is never withdrawn by the queue file")

  -- an entry already invited is left alone even if the Worker withdraws it: the invite is already out
  local kept = find("Kept One")
  kept.status = "invited"; kept.invitedAt = time()
  OlympusQueue = { version = 1, generatedAt = 12, setGuildNote = false, entries = {} }
  SlashCmdList.OLYMPUSVERIFY("merge")
  assert(find("Kept One"), "an already-invited entry is not withdrawn")

  -- and an unreadable queue file must never clear the queue
  OlympusQueue = nil
  SlashCmdList.OLYMPUSVERIFY("merge")
  assert(find("Kept One") and find("Local Queued"), "a missing queue file leaves the queue untouched")
  print("  queue withdrawals: cancelled and reclaimed invites are dropped, local and invited ones kept")
end

-- ---------------------------------------------------------------- cross-implementation vectors
-- watcher/tests/vectors.json is generated from the Python implementation. Nothing used to check the Lua against it,
-- so "all three produce identical codes" was an assertion in a document rather than a property the tests held.
do
  local paths = { "../watcher/tests/vectors.json", "watcher/tests/vectors.json", "../../watcher/tests/vectors.json" }
  local body
  for _, path in ipairs(paths) do
    local fh = io.open(path, "r")
    if fh then body = fh:read("*a"); fh:close(); break end
  end
  assert(body, "vectors.json not found — run the harness from addon/")
  local n, tickets, relays, stricts, guids = 0, 0, 0, 0, 0
  for obj in body:gmatch("{(.-)}") do
    local secret = obj:match('"secret":%s*"(.-)"')
    local character = obj:match('"character":%s*"(.-)"')
    local day = obj:match('"day":%s*"(.-)"')
    local normalized = obj:match('"normalized":%s*"(.-)"')
    local code = obj:match('"code":%s*"(.-)"')
    local token = obj:match('"joinToken":%s*"(.-)"')
    local nonce, ticket = obj:match('"nonce":%s*"(.-)"'), obj:match('"ticket":%s*"(.-)"')
    local leaveKind, leaveTok = obj:match('"leaveKind":%s*"(.-)"'), obj:match('"leaveToken":%s*"(.-)"')
    local relayVersion, relayTok = obj:match('"relayVersion":%s*"(.-)"'), obj:match('"relayToken":%s*"(.-)"')
    local strictIn, strictOut = obj:match('"strictIn":%s*"(.-)"'), obj:match('"strictOut":%s*"(.-)"')
    local guid, guidTok = obj:match('"guid":%s*"(.-)"'), obj:match('"guidToken":%s*"(.-)"')
    if secret and character and day then
      n = n + 1
      local gotNorm = OlympusHmac.normalizeCharacter(character)
      assert(gotNorm == normalized, string.format("normalize(%q): lua %q vs python %q", character, gotNorm, normalized))
      local gotCode = OlympusHmac.codeFor(secret, character, day)
      assert(gotCode == code, string.format("code(%q, %s): lua %s vs python %s", character, day, gotCode, code))
      if token then
        local gotTok = OlympusHmac.joinToken(secret, character, day)
        assert(gotTok == token, string.format("joinToken(%q, %s): lua %s vs python %s", character, day, gotTok, token))
      end
      if ticket then
        local gotTicket = OlympusHmac.ticketFor(secret, nonce, day)
        assert(gotTicket == ticket, string.format("ticket(%s, %s): lua %s vs python %s", nonce, day, gotTicket, ticket))
        tickets = (tickets or 0) + 1
      end
      if leaveTok then
        local gotLeave = OlympusHmac.leaveToken(secret, leaveKind, character, day)
        assert(gotLeave == leaveTok, string.format("leaveToken(%s, %q, %s): lua %s vs python %s", leaveKind, character, day, gotLeave, leaveTok))
      end
      if relayTok then
        local gotRelay = OlympusHmac.relayToken(secret, character, relayVersion, day)
        assert(gotRelay == relayTok, string.format("relayToken(%q, %s, %s): lua %s vs python %s", character, relayVersion, day, gotRelay, relayTok))
        relays = relays + 1
      end
      if guidTok then
        local gotGuid = OlympusHmac.guidToken(secret, character, guid, day)
        assert(gotGuid == guidTok, string.format("guidToken(%q, %s, %s): lua %s vs python %s", character, guid, day, gotGuid, guidTok))
        guids = guids + 1
      end
      if strictIn then
        local gotStrict = OlympusHmac.strictCode(strictIn) or ""
        assert(gotStrict == strictOut, string.format("strictCode(%q): lua %q vs python %q", strictIn, gotStrict, strictOut))
        stricts = stricts + 1
      end
    end
  end
  assert(n >= 8, "expected the full vector set, saw " .. n)
  assert((tickets or 0) == n, "every vector carries a ticket")
  assert(relays == n and stricts == n and guids == n, "every vector carries a relay token, a GUID token and a strict-code case")
  print(string.format("  vectors: %d cases match the Python implementation (codes, tickets, normalization, join, leave, relay and GUID tokens, strict codes)", n))
end

-- ---------------------------------------------------------------- trusted join confirmation
-- The watcher only believes a join when the officer's own outgoing whisper carries this HMAC, because
-- "X has joined the guild." in the chat log is exactly what any player can produce with /emote.
do
  local before = #calls.whispers
  local q = { name = "Signed Joiner", target = "Signed Joiner", status = "invited", invitedAt = time() }
  table.insert(OlympusVerifyDB.queue, q)
  table.insert(roster, { name = "Signed Joiner", rank = "Member", rankIndex = 4, level = 60, class = "WARRIOR", guid = "Player-1-Z" })
  f:Fire("GUILD_ROSTER_UPDATE")
  runTimers()
  assert(q.status == "joined", "the addon saw the join via MemberExistsByName, got " .. tostring(q.status))
  local found
  for i = before + 1, #calls.whispers do
    local w = calls.whispers[i]
    if type(w) == "table" and tostring(w.text or ""):find("OLVj%-") then found = w end
  end
  assert(found, "a confirmed join sends a signed whisper the watcher can trust")
  local mac = tostring(found.text):match("OLVj%-([0-9a-f]+)")
  assert(mac == OlympusHmac.joinToken("olympus-test-secret", "Signed Joiner", OlympusHmac.utcDay(time())),
    "the signature verifies against the shared secret")
  -- Signed Joiner never whispered us, so the signed line is a note to ourselves naming them, never a whisper to them
  -- (Viktor, 26 Sep: no whispers to anyone who has not whispered first).
  assert(found.target == "Fern Melder" and tostring(found.text):find("^Olympus: Signed Joiner joined the guild %(ref OLVj%-"),
    "a stranger's join is signed to ourselves: " .. tostring(found.target) .. " / " .. tostring(found.text))
  for i = before + 1, #calls.whispers do
    assert(calls.whispers[i].target ~= "Signed Joiner", "nothing is whispered to someone who never whispered us")
  end
  print("  trusted join: signed confirmation verified (note to self, no whisper to the new member)")
end

print("addon smoke test: ok")

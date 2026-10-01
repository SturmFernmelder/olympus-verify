-- 0.6.0 (27 Sep 2026): request codes, the chat-log flush on every whisper (off since 0.6.3), signed joins and departures, the Sync
-- button and the read-only diagnostics. Loads the real addon files against the mocked client.
-- Run from this folder through run_lua_suites.py (LuaJIT via Lupa), or: lua5.1 test_signed.lua
-- Uses a made-up secret; never point it at Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = (want == nil) and (got ~= nil and got ~= false) or (got == want)
  if not ok then fails = fails + 1 end
  print(string.format("%s %-78s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function lastPrint(pat) for i = #PRINTS, 1, -1 do if PRINTS[i]:find(pat, 1, true) then return PRINTS[i] end end end

-- what the client does with chat logging, and with timers (fired by hand)
TOGGLES, TIMERS = {}, {}
local logging = true
LoggingChat = function(v) if v ~= nil then logging = v; TOGGLES[#TOGGLES + 1] = v end return logging end
C_Timer.After = function(d, fn) TIMERS[#TIMERS + 1] = { at = NOW + d, fn = fn } end
local function later(sec)
  NOW = NOW + sec
  table.sort(TIMERS, function(a, b) return a.at < b.at end)
  local due, keep = {}, {}
  for _, t in ipairs(TIMERS) do if t.at <= NOW then due[#due + 1] = t else keep[#keep + 1] = t end end
  TIMERS = keep
  for _, t in ipairs(due) do t.fn() end
end
-- a secret value, as the 12.x API hands chat text over during lockdown
local SECRET_MARK = {}
issecretvalue = function(v) return v == SECRET_MARK end
FILTERS = {}
ChatFrame_AddMessageEventFilter = function(ev, fn) FILTERS[ev] = FILTERS[ev] or {}; table.insert(FILTERS[ev], fn) end
RELOADS = 0
C_UI = { Reload = function() RELOADS = RELOADS + 1 end }
LOGGED = {}
C_Log = {
  LogMessage = function(m) LOGGED[#LOGGED + 1] = m end,
  LogWarningMessage = function(m) LOGGED[#LOGGED + 1] = m end,
  LogErrorMessage = function(m) error("not for addons") end,
  LogMessageWithPriority = function(p, m) LOGGED[#LOGGED + 1] = p .. ":" .. m end,
}
C_Discord = {
  IsEnabled = function() return true end,
  IsUserOAuthed = function() error("restricted") end,
  GetDiscordUserID = function() return 1549537348516188200 end,
  GetGuildLinkStatus = function() return false, "", "" end,
  IsGuildChannelLinked = function() return false end,
}
C_Club = {
  GetGuildClubId = function() return 7 end,
  GetMemberInfoForSelf = function() return { name = "Fern Melder" } end,
  GetClubMembers = function() return { 1, 2, 3 } end,
  GetMemberInfo = function(_, id)
    if id == 2 then return { name = "Linked Lin", discordInfo = { userID = 1550176895671341076, lastOnlineName = "Linked Lin", fromDiscord = false } } end
    return { name = "Plain " .. id }
  end,
}

OlympusQueue = { version = 1, generatedAt = NOW, setGuildNote = false, entries = {} }
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret", uiAutoShow = false }
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
local frame = OlympusVerifyFrame
local onEvent = frame:GetScript("OnEvent")
onEvent(frame, "ADDON_LOADED", "OlympusVerify"); onEvent(frame, "PLAYER_LOGIN")
local L, SECRET = OlympusHmac, "harness-only-not-a-real-secret"
local API = OlympusVerifyAPI
local function entry(n) for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == n then return q end end end
-- the login note ("Olympus: relay ...") is counted separately, by relayNotes: most checks are about the other notes
local function isRelayNote(text) return text:find("^Olympus: relay ") ~= nil end
local function whispersTo(from, who) local out = {} for i = from + 1, #WHISPERS do if WHISPERS[i].to == who and not isRelayNote(WHISPERS[i].text) then out[#out + 1] = WHISPERS[i].text end end return out end
local function relayNotes(from) local out = {} for i = from + 1, #WHISPERS do if isRelayNote(WHISPERS[i].text) then out[#out + 1] = WHISPERS[i] end end return out end
local ME = "Fern Melder"

print("\n== request codes ==")
local ticket = L.ticketFor(SECRET, "K7Q", L.utcDay(NOW))
check("the library agrees with itself on a ticket", L.checkCode(SECRET, "Anyone", ticket), "ticket")
check("  and a character code is still a character code", L.checkCode(SECRET, "Thrall", L.codeFor(SECRET, "Thrall", L.utcDay(NOW))), "character")
check("  a ticket from yesterday is still good", L.checkCode(SECRET, "Anyone", L.ticketFor(SECRET, "ABC", L.utcDay(NOW - 86400))), "ticket")
check("  from the day before, not", L.checkCode(SECRET, "Anyone", L.ticketFor(SECRET, "ABC", L.utcDay(NOW - 2 * 86400))), nil)
local w0 = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. string.lower(ticket), "Kira Moonfall")
check("a request code from any character queues that character", entry("Kira Moonfall") and entry("Kira Moonfall").status, "queued")
check("  and answers them with the confirmation", (whispersTo(w0, "Kira Moonfall")[1] or ""):find("code confirmed for Kira Moonfall", 1, true) ~= nil, true)
local ev = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("  the event records the code and its kind for the watcher", ev.type == "whisper" and ev.code == ticket and ev.kind == "ticket", true)
local w1 = #WHISPERS
local bad = string.sub(ticket, 1, 3) .. (string.sub(ticket, 4, 4) == "A" and "B" or "A") .. string.sub(ticket, 5)
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. bad, "Guess Work")
check("a wrong mac is refused", entry("Guess Work"), nil)
check("  with the new wording that points at the Discord button", (whispersTo(w1, "Guess Work")[1] or ""):find("Get my code", 1, true) ~= nil, true)

print("\n== no automatic chat-log flush (0.6.3: measured, it never wrote the file early) ==")
local function toggles() local t = {} for i, v in ipairs(TOGGLES) do t[i] = tostring(v) end return table.concat(t, ",") end
TOGGLES = {}
later(5); later(1)  -- settle anything the code whispers above scheduled
TOGGLES = {}
onEvent(frame, "CHAT_MSG_WHISPER", "hey, are you recruiting?", "Random Person")
later(3); later(1)
check("an ordinary whisper leaves chat logging alone", toggles(), "")
local okLocked = pcall(onEvent, frame, "CHAT_MSG_WHISPER", SECRET_MARK, SECRET_MARK)
later(3); later(1)
check("a whisper during chat lockdown (secret text and sender) raises no error", okLocked, true)
check("  and toggles nothing either", toggles(), "")
onEvent(frame, "CHAT_MSG_WHISPER", "one", "A One"); onEvent(frame, "CHAT_MSG_WHISPER", "two", "B Two")
later(3); later(1)
check("nor does a burst", toggles(), "")
SlashCmdList.OLYMPUSVERIFY("flushlog")
later(3)
check("/olv flushlog still does it by hand: off ...", toggles(), "false")
later(1)
check("  ... and back on a moment later", toggles(), "false,true")
check("  and logging is left on", LoggingChat(), true)
check("the status says so (the panel's CHAT LOG tile reads 'manual')", API.Status().flushLog, false)

print("\n== signed joins and departures ==")
local w2 = #WHISPERS
onEvent(frame, "CHAT_MSG_SYSTEM", "Quiet Joiner has joined the guild.")
local notes = whispersTo(w2, ME)
check("a join line becomes a signed note to self", notes[1], "Olympus: Quiet Joiner joined the guild (ref OLVj-" .. L.joinToken(SECRET, "Quiet Joiner", L.utcDay(NOW)) .. ")")
onEvent(frame, "CHAT_MSG_SYSTEM", "Quiet Joiner has joined the guild.")
check("  the same join again is not signed twice", #whispersTo(w2, ME), 1)
local w3 = #WHISPERS
onEvent(frame, "CHAT_MSG_SYSTEM", "Gone Gus has left the guild.")
check("a departure is signed with its kind", whispersTo(w3, ME)[1], "Olympus: Gone Gus left the guild (ref OLVl-" .. L.leaveToken(SECRET, "left", "Gone Gus", L.utcDay(NOW)) .. ")")
local w4 = #WHISPERS
onEvent(frame, "CHAT_MSG_SYSTEM", "Kicked Kim has been kicked out of the guild by Other Officer.")
check("a removal by someone else: kind 'kicked'", whispersTo(w4, ME)[1], "Olympus: Kicked Kim was removed from the guild (ref OLVl-" .. L.leaveToken(SECRET, "kicked", "Kicked Kim", L.utcDay(NOW)) .. ")")
local w5 = #WHISPERS
-- the panel aims the kick macro with a reason; the addon keeps it in Unverified.aim (reached through the API)
API.PointKickMacro("Seat Sam", "space")
onEvent(frame, "CHAT_MSG_SYSTEM", "Seat Sam has been kicked out of the guild by Fern Melder.")
check("a removal aimed to free a seat: kind 'space', reason carried in the note", whispersTo(w5, ME)[1], "Olympus: Seat Sam was removed to free a seat (ref OLVl-" .. L.leaveToken(SECRET, "space", "Seat Sam", L.utcDay(NOW)) .. ")")
local last = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("  and the addon's own removal event is still recorded", last.type == "removed" and last.name == "Seat Sam" and last.reason == "space", true)
local w6 = #WHISPERS
local okLockedSys = pcall(onEvent, frame, "CHAT_MSG_SYSTEM", SECRET_MARK)
check("a secret system line signs nothing and raises nothing", okLockedSys and #whispersTo(w6, ME) == 0, true)
local hide = function(ev2, msg, author) for _, fn in ipairs(FILTERS[ev2] or {}) do if fn(nil, ev2, msg, author) then return true end end return false end
check("the departure note's sent half stays in the chat window, so it reaches the chat log", hide("CHAT_MSG_WHISPER_INFORM", whispersTo(w3, ME)[1], ME), false)
check("  and the received half", hide("CHAT_MSG_WHISPER", whispersTo(w3, ME)[1], ME), true)
check("  the same text from someone else is shown", hide("CHAT_MSG_WHISPER", whispersTo(w3, ME)[1], "Some Prankster"), false)

print("\n== a join the addon invited: welcomed if they whispered first, signed once either way ==")
OlympusVerifyDB.queue[#OlympusVerifyDB.queue + 1] = { name = "Chatty Joiner", target = "Chatty Joiner", status = "invited", invitedAt = NOW, source = "whisper" }
onEvent(frame, "CHAT_MSG_WHISPER", "thanks!", "Chatty Joiner")
C_GuildInfo.MemberExistsByName = function(n) return n == "Chatty Joiner" end
local w7 = #WHISPERS
onEvent(frame, "CHAT_MSG_SYSTEM", "Chatty Joiner has joined the guild.")
onEvent(frame, "PLAYER_LOGIN"); later(10)
check("the contact gets the signed welcome", (whispersTo(w7, "Chatty Joiner")[1] or ""):find("(ref OLVj-", 1, true) ~= nil, true)
check("  and exactly one note to self came from the join line", #whispersTo(w7, ME), 1)

print("\n== diagnostics, read-only ==")
local w8 = #WHISPERS
SlashCmdList.OLYMPUSVERIFY("logtest")
check("/olv logtest whispers you a timing marker", whispersTo(w8, ME)[1], "Olympus log test OLVDIAG flush " .. NOW)
SlashCmdList.OLYMPUSVERIFY("diag clog")
check("/olv diag clog writes a marker through each C_Log call", #LOGGED == 3 and LOGGED[1] == "OLVDIAG clog-message " .. NOW, true)
check("  and says which call was refused", lastPrint("clog-error (refused)") ~= nil, true)
SlashCmdList.OLYMPUSVERIFY("diag discord")
local d = OlympusVerifyDB.diag.discord
check("/olv diag discord records what C_Discord answers", d.calls.IsEnabled[1], "true")
check("  a restricted call is recorded as refused, not fatal", (d.calls.IsUserOAuthed[1] or ""):find("error", 1, true) ~= nil, true)
check("  a Discord ID as a Lua number is flagged as inexact", (d.calls.GetDiscordUserID[1] or ""):find("above 2^53", 1, true) ~= nil, true)
check("  guild records: 3 read, 1 with a Discord user", d.members.read == 3 and d.members.withUser == 1 and d.members.samples[1].name == "Linked Lin", true)
local info = { userID = 1550176895671341076, fromDiscord = true, lastOnlineName = "Linked Lin", lastOnlineGUID = "Player-4613-00ABCDEF", globalName = "linkedlin" }
onEvent(frame, "CHAT_MSG_GUILD", "hi from discord", "linkedlin", "", "", "", "", 0, 0, "", 0, 1, "", 0, false, false, false, false, info)
onEvent(frame, "CHAT_MSG_GUILD", "plain guild chat", "Some Member", "", "", "", "", 0, 0, "", 0, 2, "Player-1", 0, false, false, false, false, { userID = 0, fromDiscord = false })
onEvent(frame, "CHAT_MSG_GUILD", SECRET_MARK, SECRET_MARK, "", "", "", "", 0, 0, "", 0, 3, SECRET_MARK, 0, false, false, false, false, SECRET_MARK)
local gc = OlympusVerifyDB.diag.guildChat
check("guild chat: every message counted, Discord ones sampled, secrets only counted", gc.seen == 3 and gc.discord == 1 and gc.secret == 1, true)
check("  the sample keeps the character Blizzard ties to that Discord user", gc.samples[1].lastOnlineName == "Linked Lin" and gc.samples[1].fromDiscord, true)

print("\n== one request code, one character; exact tokens (review, 27 Sep) ==")
local t2 = L.ticketFor(SECRET, "HJK", L.utcDay(NOW))
local w9 = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!Verify " .. t2 .. ".", "First Finn")
check("a phone-capitalised !Verify, with a full stop after the code, works", entry("First Finn") and entry("First Finn").status, "queued")
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. t2, "Second Sid")
check("the same request code from another character is refused", entry("Second Sid"), nil)
check("  and they are told why", (whispersTo(w9, "Second Sid")[1] or ""):find("already been used by another character", 1, true) ~= nil, true)
local evSid = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("  recorded as not ok, so the watcher relays nothing from it", evSid.name == "Second Sid" and evSid.ok == false and evSid.kind == "ticket", true)
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. t2, "First Finn")
check("  while its first sender may send it again", entry("First Finn").status == "queued" and OlympusVerifyDB.events[#OlympusVerifyDB.events].ok == true, true)
later(49 * 3600)
onEvent(frame, "PLAYER_LOGIN")
check("  the record is dropped once the code can no longer be valid", OlympusVerifyDB.tickets[t2], nil)
local w10 = #WHISPERS
local t3 = L.ticketFor(SECRET, "Q3R", L.utcDay(NOW))
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. t3 .. "1", "Extra Digit")
onEvent(frame, "CHAT_MSG_WHISPER", "!verify 0" .. string.sub(t3, 1, 6), "Leading Zero")
check("a code with anything added to it is not a code (the watcher agrees)", entry("Extra Digit") == nil and entry("Leading Zero") == nil, true)
check("  and is answered as not valid", (whispersTo(w10, "Extra Digit")[1] or ""):find("not valid", 1, true) ~= nil, true)
check("the library's rule matches the watcher's", L.strictCode("k7qystg") == "K7QYSTG" and L.strictCode("K7QYSTG1") == nil and L.strictCode("0K7QYST") == nil and L.strictCode("abcde") == nil, true)

print("\n== the character behind a confirmed code is signed with its GUID ==")
local tg = L.ticketFor(SECRET, "PPP", L.utcDay(NOW))
later(40)  -- past the reply rate limit of anyone above
local wg = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. tg, "Guid Gail", "", "", "", "", 0, 0, "", 0, 77, "Player-4613-0ABCDEF1")
local idNote = whispersTo(wg, ME)[1]
check("a note to self names the character and its GUID, with a MAC over both", idNote,
  "Olympus: Guid Gail is Player-4613-0ABCDEF1 (ref OLVg-" .. L.guidToken(SECRET, "Guid Gail", "Player-4613-0ABCDEF1", L.utcDay(NOW)) .. ")")
check("  the event carries the GUID for the SavedVariables route", OlympusVerifyDB.events[#OlympusVerifyDB.events].guid, "Player-4613-0ABCDEF1")
check("  its incoming copy is kept out of the chat window; the sent half is left for the chat log",
  (function() for _, fn in ipairs(FILTERS.CHAT_MSG_WHISPER or {}) do if fn(nil, "CHAT_MSG_WHISPER", idNote, ME) then return true end end return false end)()
  and not (function() for _, fn in ipairs(FILTERS.CHAT_MSG_WHISPER_INFORM or {}) do if fn(nil, "CHAT_MSG_WHISPER_INFORM", idNote, ME) then return true end end return false end)(), true)
local wg2 = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. L.ticketFor(SECRET, "D2F", L.utcDay(NOW)), "Locked Lara", "", "", "", "", 0, 0, "", 0, 78, SECRET_MARK)
check("a GUID the client will not let us read: no note, the code still counts", #whispersTo(wg2, ME) == 0 and entry("Locked Lara") ~= nil, true)
local wg3 = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!verify ZZZZZZZ", "Wrong Wes", "", "", "", "", 0, 0, "", 0, 79, "Player-4613-0ABCDEF2")
check("an invalid code: no note", #whispersTo(wg3, ME), 0)

print("\n== the login note: which character is in the world, which addon ==")
later(10)  -- let anything the login above scheduled go out first
local w11 = #WHISPERS
onEvent(frame, "PLAYER_LOGIN")
check("nothing is sent at once: the world loads first", #relayNotes(w11), 0)
later(7)
local rn = relayNotes(w11)
check("a few seconds in, one signed note to self", #rn == 1 and rn[1].to == ME, true)
check("  naming this character and the addon build, with a MAC over both",
  rn[1] and rn[1].text == string.format("Olympus: relay %s is in the world (addon %s, ref OLVr-%s)", ME, "0.4.0", L.relayToken(SECRET, ME, "0.4.0", L.utcDay(NOW))), true)
local hideRn = function(ev2, msg, author) for _, fn in ipairs(FILTERS[ev2] or {}) do if fn(nil, ev2, msg, author) then return true end end return false end
check("  the incoming copy hidden, the sent half left for the chat log", hideRn("CHAT_MSG_WHISPER", rn[1].text, ME) and not hideRn("CHAT_MSG_WHISPER_INFORM", rn[1].text, ME), true)
local okSecretFilter, shown = pcall(hideRn, "CHAT_MSG_WHISPER", SECRET_MARK, SECRET_MARK)
check("the filter meets secret values without an error (and hides nothing)", okSecretFilter and shown == false, true)

check("SavedVariables carries the loaded build and the character, for the watcher", OlympusVerifyDB.addonVersion == "0.4.0" and OlympusVerifyDB.lastCharacter == ME, true)

print("\n== a system line that names the player as a link is signed by the name shown ==")
local w12 = #WHISPERS
onEvent(frame, "CHAT_MSG_SYSTEM", "|Hplayer:Linked Larry-Forever|h[Linked Larry]|h has joined the guild.")
check("the note names Linked Larry, and its MAC is over that name", whispersTo(w12, ME)[1],
  "Olympus: Linked Larry joined the guild (ref OLVj-" .. L.joinToken(SECRET, "Linked Larry", L.utcDay(NOW)) .. ")")
local w13 = #WHISPERS
API.PointKickMacro("Link Lou", "unverified")
onEvent(frame, "CHAT_MSG_SYSTEM", "|Hplayer:Link Lou-Forever|h[Link Lou]|h has been kicked out of the guild by |Hplayer:Fern Melder|h[Fern Melder]|h.")
local lastE = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("a kick line in links: the removal is recorded under the shown name, with its reason", lastE.type == "removed" and lastE.name == "Link Lou" and lastE.reason == "unverified", true)
check("  signed the same way", whispersTo(w13, ME)[1], "Olympus: Link Lou was removed as unverified (ref OLVl-" .. L.leaveToken(SECRET, "unverified", "Link Lou", L.utcDay(NOW)) .. ")")

print("\n== diagnostics compare nothing secret ==")
local okDiag = pcall(onEvent, frame, "CHAT_MSG_GUILD", "hi", "Someone", "", "", "", "", 0, 0, "", 0, 4, "", 0, false, false, false, false,
  { userID = SECRET_MARK, fromDiscord = SECRET_MARK, lastOnlineName = "Hidden Hal" })
check("a secret Discord user ID inside readable guild chat raises nothing", okDiag and lastPrint("error while reading Discord identity") == nil, true)
C_Club.GetMemberInfo = function(_, id) return { name = "Secret " .. id, discordInfo = { userID = SECRET_MARK, fromDiscord = SECRET_MARK } } end
local okDiscord = pcall(SlashCmdList.OLYMPUSVERIFY, "diag discord")
check("/olv diag discord with secret IDs in the guild records raises nothing", okDiscord and OlympusVerifyDB.diag.discord.members.secret == 3, true)

print("\n== open Discord codes are mentioned next to the removal list ==")
OlympusQueue.unverified = { snapshotAt = NOW, graceDays = 3, verifyOpenSince = NOW - 86400 * 10, firstSeenAvailable = true, openTickets = 2, ranks = {}, members = {} }
local _, uinfo = API.UnverifiedList(5)
check("the panel learns how many request codes are out", uinfo.openTickets, 2)
SlashCmdList.OLYMPUSVERIFY("unverified")
check("  and /olv unverified says what that means", lastPrint("2 request codes are issued in Discord and not whispered yet") ~= nil, true)

print("\n== Sync & reload ==")
local before = RELOADS
API.Sync()
check("Sync exports the roster and reloads, once", RELOADS, before + 1)
SlashCmdList.OLYMPUSVERIFY("sync")
check("  and so does /olv sync", RELOADS, before + 2)

print(string.format("\n%d/%d passed", tests - fails, tests))
os.exit(fails == 0 and 0 or 1)

-- Loads the real addon files against a mocked WoW client and exercises presence: the invite queue lists only
-- applicants confirmed online and in no guild, and each press of the flush key either invites one of them or spends
-- itself on exactly one /who.
-- Run from this folder: lua5.1 test_presence.lua   (needs Lua 5.1 and LuaBitOp, which WoW itself ships as bit)
-- Uses a made-up secret; never point it at Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = (want == nil) and (got ~= nil and got ~= false) or (got == want)
  if not ok then fails = fails + 1 end
  print(string.format("%s %-72s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function lastPrint(pat) for i = #PRINTS, 1, -1 do if PRINTS[i]:find(pat, 1, true) then return PRINTS[i] end end end
local function plain(s) return (tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end

-- ---- the parts of the client presence needs ----
WHO_SENT, WHO_TOUI, WHO_LIST, INVITES, TIMERS, FILTERS, WHO_ORIGIN = {}, {}, {}, {}, {}, {}, {}
C_FriendList = {
  SendWho = function(filter, origin) table.insert(WHO_SENT, filter); WHO_ORIGIN[#WHO_SENT] = origin end,
  SetWhoToUi = function(v) table.insert(WHO_TOUI, v) end,
  GetNumWhoResults = function() return #WHO_LIST, #WHO_LIST end,
  GetWhoInfo = function(i) return WHO_LIST[i] end,
}
C_GuildInfo.Invite = function(n) table.insert(INVITES, n) end
GetGuildInfo = function(unit) if unit == "player" then return "Olympus", "Officer", 1 end end
ChatFrame_AddMessageEventFilter = function(ev, fn) FILTERS[ev] = fn end
C_Timer.After = function(d, fn) table.insert(TIMERS, { at = NOW + d, fn = fn }) end
-- The /who trace keeps GetTime() stamps; the mock clock is the whole-second one the addon's time() reads.
GetTime = function() return NOW end

ROSTER = {
  { name = "Fern Melder", rank = "Officer", rankIndex = 1, level = 60, online = true },
  { name = "Some Member", rank = "Member", rankIndex = 3, level = 20, away = 2 },
}
local function E(id, name, pos, reason) return { id = id, character = name, discordId = tostring(1000 + id), note = "", position = pos, lastReason = reason or "" } end
OlympusQueue = { version = 1, generatedAt = NOW, setGuildNote = false, entries = {
  E(1, "Conzec Eightynine", 1), E(2, "Niko Woyyer", 2), E(3, "Petite Girl", 3), E(5, "Takwar Skyweaver", 4),
  E(6, "Tater Toe", 5, "in_another_guild"), E(7, "Aradan Galestrike", 6, "ready_after_gquit"),
} }
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret", guildCap = 5, uiAutoShow = false }
-- The Forever client's own format strings (its GlobalStrings, as the addon's login trace recorded them on 26 Sep 2026).
WHO_LIST_FORMAT = "|Hplayer:%s|h[%s]|h: Level %d %s %s - %s"
WHO_LIST_GUILD_FORMAT = "|Hplayer:%s|h[%s]|h: Level %d %s %s <%s> - %s"
WHO_NUM_RESULTS = "%d |4player:players; total"
-- The 12.x API the Forever client has: a table stands in for a secret string here.
issecretvalue = function(v) return type(v) == "table" and v.secret == true end
-- A chat window, and hooksecurefunc for its AddMessage: lines some clients print with no event behind them.
HOOKS = {}
ChatFrame1 = { AddMessage = function() end }
hooksecurefunc = function(obj, name, fn) if type(obj) == "table" and name == "AddMessage" then HOOKS[#HOOKS + 1] = { obj = obj, fn = fn } end end
OlympusVerifyDB = nil

local okLoad, err = pcall(function()
  assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
end)
check("both files load in TOC order", okLoad, true)
if not okLoad then print(err) os.exit(1) end
local frame = OlympusVerifyFrame
local onEvent = frame:GetScript("OnEvent")
-- Timers fire when the mock clock reaches them, earliest first, like C_Timer.After. After(0) is "next frame": due now.
local function fireTimers()
  table.sort(TIMERS, function(a, b) return a.at < b.at end)
  local due, keep = {}, {}
  for _, x in ipairs(TIMERS) do if x.at <= NOW then due[#due + 1] = x else keep[#keep + 1] = x end end
  TIMERS = keep
  for _, x in ipairs(due) do x.fn() end
end
local function later(sec) NOW = NOW + sec; fireTimers() end
-- A system line as the client delivers it: our handler's copy, then the frame after.
local function sys(msg) onEvent(frame, "CHAT_MSG_SYSTEM", msg); fireTimers() end
local function who(name, rest) return string.format("|Hplayer:%s|h[%s]|h: %s", name, name, rest) end
-- The chat frame's copy: its filter decides whether the line shows, and the frame after, anything our handler did not
-- take is taken from here.
local function hidden(msg)
  local h = FILTERS.CHAT_MSG_SYSTEM and FILTERS.CHAT_MSG_SYSTEM(nil, "CHAT_MSG_SYSTEM", msg)
  fireTimers()
  return h
end
onEvent(frame, "ADDON_LOADED", "OlympusVerify"); onEvent(frame, "PLAYER_LOGIN")
local API = OlympusVerifyAPI
check("WHO_LIST_UPDATE is registered", frame._events.WHO_LIST_UPDATE, true)
check("a chat filter for CHAT_MSG_SYSTEM is installed", type(FILTERS.CHAT_MSG_SYSTEM), "function")
check("login message explains what a press does", lastPrint("or checks the next in line with /who") ~= nil, true)

-- panel, built and open
OlympusVerifyUI.Show()
local panel = OlympusVerifyPanel
local rows = {}
for _, f in ipairs(FRAMES) do if f._parent == panel and f._kind == "Frame" and f.invite then rows[#rows + 1] = f end end
local function listed()
  local out = {}
  for _, r in ipairs(rows) do if r:IsShown() and r.entry then out[#out + 1] = r.entry.name end end
  return table.concat(out, ",")
end
local sendBtn, checkBtn
for _, f in ipairs(FRAMES) do
  if f._parent == panel and f._kind == "Button" and f._text then
    if f._text:find("Check next", 1, true) or f._text:find("Send next", 1, true) then sendBtn = sendBtn or f end
    if f._text:find("^Check %(") then checkBtn = f end
  end
end

print("\n== nothing checked yet ==")
local c = API.PresenceCounts()
check("six waiting, all unchecked", c.unchecked, 6)
check("filtering is on", c.filtering, true)
check("the panel lists nobody", listed(), "")
local function fontWith(txt) for _, f in ipairs(FONTS) do if f._shown ~= false and f._text and plain(f._text):find(txt, 1, true) then return plain(f._text) end end end
check("  and says why, with counts", (fontWith("Nobody confirmed online and guildless: 6 not checked") ~= nil), true)
check("the big button offers a check, not an invite", plain(sendBtn and sendBtn._text), "Check next (6)")
check("the header Check button shows the count", plain(checkBtn and checkBtn._text), "Check (6)")
check("the launcher offers a presence check when nobody is ready", plain(OlympusVerifyButton._text):find("Check next", 1, true) ~= nil, true)
OlympusVerifyButton:GetScript("OnEnter")(OlympusVerifyButton)
check("hovering the unchecked launcher does not spend a /who", #WHO_SENT, 0)

print("\n== press 1: /who for the one who said they left their guild (ahead of #1) ==")
OlympusVerify_Flush()
check("one /who went out", #WHO_SENT, 1)
check("  for Aradan Galestrike, quoted for the space", WHO_SENT[1], 'n-"Aradan Galestrike"')
check("  answers routed to chat, not the Who window", WHO_TOUI[1], false)
check("no invite in the same press", #INVITES, 0)
check("row state is 'checking'", (API.PresenceOf({ name = "Aradan Galestrike", target = "Aradan Galestrike", status = "queued" })), "checking")
local line = who("Aradan Galestrike", "Level 7 Human Paladin - Elwynn Forest")
check("our /who line is kept out of chat", hidden(line), true)
check("an unrelated /who line is not", hidden(who("Somebody Else", "Level 60 Dwarf Hunter <Pals> - Ironforge")), false)
check("an ordinary system message is not", hidden("Niko Woyyer has come online."), false)
sys(line); sys("1 player total")
check("the total line is kept out of chat too", hidden("1 player total"), true)
check("Aradan is ready", (API.PresenceOf({ name = "Aradan Galestrike", status = "queued" })), "ready")
check("summary printed", lastPrint("Aradan Galestrike: online, no guild (level 7, Elwynn Forest)") ~= nil, true)
OlympusVerifyUI.Refresh()
check("the panel lists exactly Aradan", listed(), "Aradan Galestrike")
check("  with what /who saw", plain(rows[1].status._text), "#6 online, 7 Paladin, Elwynn Forest")
check("the big button now invites", plain(sendBtn._text), "Invite next ready (1)")
check("the launcher distinguishes a ready applicant", plain(OlympusVerifyButton._text):find("1 ready to invite", 1, true) ~= nil, true)

print("\n== press 2: the invite ==")
OlympusVerify_Flush()
check("the invite went to Aradan", INVITES[1], "Aradan Galestrike")
check("and no /who in that press", #WHO_SENT, 1)
sys("You have invited Aradan Galestrike to join your guild.")

print("\n== press 3 inside the /who pace: nothing is sent ==")
NOW = NOW + 2
OlympusVerify_Flush()
check("no second /who within 5s", #WHO_SENT, 1)
check("  and it says when", lastPrint("press again in 3s") ~= nil, true)

print("\n== press 4: #1 is offline ==")
NOW = NOW + 5
OlympusVerify_Flush()
check("/who for #1, Conzec", WHO_SENT[2], 'n-"Conzec Eightynine"')
sys("0 players total")
check("Conzec is offline", (API.PresenceOf({ name = "Conzec Eightynine", status = "queued" })), "offline")
check("  printed", lastPrint("Conzec Eightynine: offline") ~= nil, true)

print("\n== press 5: #2 is in another guild -- taken off the queue, and not whispered: he never whispered us ==")
-- Viktor, 26 Sep: "If people are already in a guild, I want to remove them from the queue (also to ensure I don't
-- whisper people unless they whisper me first)".
NOW = NOW + 5
local whispersBefore = #WHISPERS
OlympusVerify_Flush()
check("/who for #2, Niko", WHO_SENT[3], 'n-"Niko Woyyer"')
sys(who("Niko Woyyer", "Level 14 Night Elf Druid <Moonglade Wardens> - Darkshore")); sys("1 player total")
local st, rec = API.PresenceOf({ name = "Niko Woyyer", status = "queued" })
check("Niko is guilded", st, "guilded")
check("  in <Moonglade Wardens>", rec and rec.guild, "Moonglade Wardens")
check("Niko was not whispered: he has never whispered us", #WHISPERS, whispersBefore)
local function entry(n) for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == n then return q end end end
check("Niko is taken off the queue", entry("Niko Woyyer").status, "failed")
check("  marked as in another guild, with the guild", entry("Niko Woyyer").removedReason == "in_another_guild" and entry("Niko Woyyer").reply:find("Moonglade Wardens", 1, true) ~= nil, true)
check("  the summary says both", lastPrint("Niko Woyyer: online but in <Moonglade Wardens> — taken off the queue, not whispered.") ~= nil, true)
local lastEv = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("  the event log records it", lastEv.type == "dequeued" and lastEv.name == "Niko Woyyer", true)

print("\n== the summaries count Niko as taken off, not as '0 in another guild' ==")
-- Viktor, 26 Sep (0.5.8): "It says they are in another guild but then it says 0 in another guild".
local c5 = API.PresenceCounts()
check("Niko counts as taken off", c5.takenOff, 1)
check("  not as someone waiting in another guild", c5.guilded, 0)
check("  and not as waiting at all", c5.total, 4)
-- (the panel's own wording is checked further down, with the list empty: Aradan's invite row is listed here)
SlashCmdList.OLYMPUSVERIFY("status")
check("/olv status says the same",
  lastPrint("presence: 0 ready (online, no guild), 3 not checked, 1 offline; 1 applicant already in another guild was taken off the queue — /olv check looks up the next one.") ~= nil, true)
check("the text helpers are shared as a table, which /olv preview leaves alone", type(API.Text) == "table" and type(API.Text.Breakdown) == "function", true)
check("  a breakdown leaves out the empty states", API.Text.Breakdown({ unchecked = 0, offline = 2, guilded = 0, awaiting = 1 }), "2 offline, 1 with an answer still to come")
check("  and says so when there is nothing to break down", API.Text.Breakdown({}), "none")
check("  nobody taken off: no sentence", API.Text.TakenOff({ takenOff = 0 }), nil)
check("  several: plural", API.Text.TakenOff({ takenOff = 4 }), "4 applicants already in another guild were taken off the queue")

print("\n== press 6: no answer at all ==")
NOW = NOW + 5
OlympusVerify_Flush()
check("/who for #3, Petite", WHO_SENT[4], 'n-"Petite Girl"')
later(7)
check("7s on: still checking", (API.PresenceOf({ name = "Petite Girl", status = "queued" })), "checking")
OlympusVerify_Flush()
check("  a press meanwhile sends nothing", #WHO_SENT, 4)
check("  and says how long it has waited", lastPrint("still waiting for the /who answer about Petite Girl (7s so far)") ~= nil, true)
later(2)
check("no answer within the wait: back in line, not offline", (API.PresenceOf({ name = "Petite Girl", status = "queued" })), "unchecked")
check("  and says so", lastPrint("no answer to the /who for Petite Girl — back in line; a later press asks again.") ~= nil, true)
check("  never 'offline' for want of an answer", (API.PresenceCounts().offline), 1)
check("  and the question is closed: a stray total now is nobody's", hidden("0 players total"), false)

print("\n== press 7: the unanswered one is asked again ==")
OlympusVerify_Flush()
check("/who again for Petite", WHO_SENT[5], 'n-"Petite Girl"')
sys(who("Petite", "Level 9 Dwarf Warrior - Dun Morogh")); sys("1 player total")
check("a first-word answer with a single result still counts", (API.PresenceOf({ name = "Petite Girl", status = "queued" })), "ready")
check("  and nothing about it is called late", lastPrint("came late") == nil, true)

print("\n== the invite answers feed presence too ==")
NOW = NOW + 5
OlympusVerify_Flush()
check("the ready one is invited (Petite)", INVITES[2], "Petite Girl")
sys("Petite Girl not found.")
check("'not found' marks them offline", (API.PresenceOf({ name = "Petite Girl", status = "queued" })), "offline")

print("\n== a whisper jumps the check order (Tater, parked in a guild, ahead of #4 Takwar) ==")
NOW = NOW + 5
onEvent(frame, "CHAT_MSG_WHISPER", "hi, am I next?", "Tater Toe-Forever")
OlympusVerify_Flush()
check("/who for Tater, who just whispered", WHO_SENT[6], 'n-"Tater Toe"')

print("\n== an officer's own /who landing mid-check is not taken as the answer ==")
WHO_LIST = {
  { fullName = "Random Rogue", fullGuildName = "", level = 60, raceStr = "Human", classStr = "Rogue", area = "Stormwind" },
  { fullName = "Other Person", fullGuildName = "", level = 60, raceStr = "Dwarf", classStr = "Priest", area = "Ironforge" },
  { fullName = "Third Wheel", fullGuildName = "", level = 60, raceStr = "Gnome", classStr = "Mage", area = "Ironforge" },
  { fullName = "Fourth Guy", fullGuildName = "", level = 60, raceStr = "Human", classStr = "Warrior", area = "Stormwind" },
}
onEvent(frame, "WHO_LIST_UPDATE")
check("still checking Tater", (API.PresenceOf({ name = "Tater Toe", status = "queued" })), "checking")

print("\n== four or more matches arrive as WHO_LIST_UPDATE ==")
WHO_LIST = {
  { fullName = "Tater Toes", fullGuildName = "", level = 3, raceStr = "Gnome", classStr = "Mage", area = "Dun Morogh" },
  { fullName = "Tater Toe", fullGuildName = "", level = 5, raceStr = "Human", classStr = "Priest", area = "Goldshire" },
  { fullName = "Tater Tot", fullGuildName = "Fries", level = 2, raceStr = "Human", classStr = "Rogue", area = "Goldshire" },
  { fullName = "Tater Totter", fullGuildName = "", level = 1, raceStr = "Dwarf", classStr = "Hunter", area = "Coldridge" },
}
onEvent(frame, "WHO_LIST_UPDATE")
local st2, rec2 = API.PresenceOf({ name = "Tater Toe", status = "queued" })
check("exact name picked out of the list", st2, "ready")
check("  with its own zone", rec2 and rec2.zone, "Goldshire")

print("\n== at the member cap a press looks ahead instead of inviting ==")
for i = 1, 3 do ROSTER[#ROSTER + 1] = { name = "Filler " .. i, rank = "Member", rankIndex = 3, level = 10, away = 1 } end
API.ExportRoster()
local invitesBefore = #INVITES
NOW = NOW + 5
OlympusVerify_Flush()
check("no invite at the cap, though Tater is ready", #INVITES, invitesBefore)
check("  the press went on a /who for #4 Takwar instead", WHO_SENT[#WHO_SENT], 'n-"Takwar Skyweaver"')
check("  and says why", lastPrint("the guild is full, so this press looks further down the line") ~= nil, true)
sys("0 players total")
NOW = NOW + 5
OlympusVerifyUI.Refresh()
check("the panel's button reads 'Guild is full (1)'", plain(sendBtn._text), "Guild is full (1)")
check("the launcher identifies a full guild with ready applicants", plain(OlympusVerifyButton._text):find("Guild full", 1, true) ~= nil, true)
OlympusVerifyButton:GetScript("OnEnter")(OlympusVerifyButton)
check("at-cap launcher tooltip explains its presence-check action", table.concat(GameTooltip._lines, " "):find("check the next applicant with /who", 1, true) ~= nil, true)
sendBtn:Click()
check("  first click arms", plain(sendBtn._text), "Send anyway")
sendBtn:Click()
check("  second click invites the ready one anyway", INVITES[#INVITES], "Tater Toe")

print("\n== /olv queue shows everyone with their standing; /olv all lists everyone ==")
SlashCmdList.OLYMPUSVERIFY("queue")
check("/olv queue names the guild", lastPrint("Niko Woyyer") and lastPrint("Niko Woyyer"):find("<Moonglade Wardens>", 1, true) ~= nil, true)
OlympusVerifyUI.Refresh()
local before = listed()
SlashCmdList.OLYMPUSVERIFY("all")
check("/olv all lists more than the filter does", #listed() > #before, true)
SlashCmdList.OLYMPUSVERIFY("all")
check("  and toggles back", listed(), before)

print("\n== the guilded applicant does what we asked: /gquit, then whispers their code ==")
check("Niko is still parked as guilded", (API.PresenceOf({ name = "Niko Woyyer", status = "queued" })), "guilded")
onEvent(frame, "CHAT_MSG_WHISPER", "hello?", "Niko Woyyer")
check("a whisper without the code does not put him back", entry("Niko Woyyer").status, "failed")
local nikoCode = OlympusHmac.codeFor("harness-only-not-a-real-secret", "Niko Woyyer", OlympusHmac.utcDay(NOW))
local whispersNiko = #WHISPERS
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. nikoCode, "Niko Woyyer")
check("his code puts the same row back in the queue", entry("Niko Woyyer").status, "queued")
check("  keeping its Worker id", entry("Niko Woyyer").id, 2)
check("  and no second row", (function() local n = 0 for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Niko Woyyer" then n = n + 1 end end return n end)(), 1)
check("  the code reply goes to him: he whispered first", #WHISPERS == whispersNiko + 1 and WHISPERS[#WHISPERS].to == "Niko Woyyer", true)
check("the whisper overrules 'in another guild' at once", (API.PresenceOf({ name = "Niko Woyyer", status = "queued" })), "unchecked")
NOW = NOW + 5
OlympusVerify_Flush()
check("and the next press checks Niko first", WHO_SENT[#WHO_SENT], 'n-"Niko Woyyer"')
sys("Niko Woyyer waves at you."); sys("1 player total")
check("an answer that cannot be read is set aside, never taken as offline", (API.PresenceOf({ name = "Niko Woyyer", status = "queued" })), "unread")
check("  and says so", lastPrint("could not read the /who answer about Niko Woyyer") ~= nil, true)
-- The bug from 25 Sep: an unreadable answer left Niko unchecked and first in line, so every press asked again.
NOW = NOW + 5
local sentBefore = #WHO_SENT
OlympusVerify_Flush()
check("  the next press does not ask about Niko again", #WHO_SENT == sentBefore or WHO_SENT[#WHO_SENT] ~= 'n-"Niko Woyyer"', true)
if #WHO_SENT > sentBefore then sys("0 players total") end
NOW = NOW + 5
onEvent(frame, "CHAT_MSG_WHISPER", "!verify ABCD1234", "Niko Woyyer")
check("  until Niko whispers again, which puts them back in line", (API.PresenceOf({ name = "Niko Woyyer", status = "queued" })), "unchecked")
OlympusVerify_Flush()
check("  and first", WHO_SENT[#WHO_SENT], 'n-"Niko Woyyer"')
sys("|cffffffff|Hplayer:Niko Woyyer|h[Niko Woyyer]|h: Level 15 Night Elf Druid - Darkshore|r"); sys("1 player total")
local st3, rec3 = API.PresenceOf({ name = "Niko Woyyer", status = "queued" })
check("a colour-coded line is read", st3, "ready")
check("  zone without the colour codes", rec3 and rec3.zone, "Darkshore")

print("\n== the Forever client's /who line has no player link ==")
-- Its chat log, 25 Sep 2026 22:48 UTC: "Derkaderka Muhamedjihad: Level 9 Gnome Mage <OLYMPUS XLI> - Stone Cairn Lake"
NOW = NOW + 60 * 16   -- every earlier answer has aged out, so everyone still queued is unchecked again
local sent0 = #WHO_SENT
OlympusVerify_Flush()
check("a press sends a /who", #WHO_SENT, sent0 + 1)
local asked1 = WHO_SENT[#WHO_SENT]
local who1 = asked1:match('^n%-"(.+)"$')
local plainGuilded = who1 .. ": Level 9 Gnome Mage <OLYMPUS XLI> - Stone Cairn Lake"
check("  the plain line is kept out of chat", hidden(plainGuilded), true)
sys(plainGuilded); sys("1 player total")
local st4, rec4 = API.PresenceOf({ name = who1, status = "queued" })
check("  and read: in another guild", st4, "guilded")
check("  <OLYMPUS XLI>", rec4 and rec4.guild, "OLYMPUS XLI")
check("  zone read", rec4 and rec4.zone, "Stone Cairn Lake")
NOW = NOW + 5
OlympusVerify_Flush()
local asked2 = WHO_SENT[#WHO_SENT]
check("the next press asks about somebody else", asked2 ~= asked1, true)
local who2 = asked2:match('^n%-"(.+)"$')
sys(who2 .. ": Level 12 Dwarf Warrior - Dun Morogh"); sys("1 player total")
local st5, rec5 = API.PresenceOf({ name = who2, status = "queued" })
check("a plain guildless line: ready", st5, "ready")
check("  with level, class and zone", (rec5 and rec5.level) == 12 and rec5.what == "Dwarf Warrior" and rec5.zone == "Dun Morogh", true)
NOW = NOW + 5
OlympusVerify_Flush()
local whoM = WHO_SENT[#WHO_SENT]:match('^n%-"(.+)"$')
sys("Levelling tip: Level 20 - get your mount")   -- looks like a /who line, but about nobody we asked for
check("  a look-alike line about someone else is not hidden", hidden("Levelling tip: Level 20 - get your mount"), false)
sys("1 player total")
check("  nor taken as the answer: set aside, never 'offline'", (API.PresenceOf({ name = whoM, status = "queued" })), "unread")

-- From here on each section brings its own queue, so what a press picks is known exactly.
local savedQueue = OlympusVerifyDB.queue
local function Q(name, id) return { name = name, target = name, status = "queued", source = "worker", id = id, ts = NOW } end
local function PO(n) return (API.PresenceOf({ name = n, target = n, status = "queued" })) end

print("\n== the server refuses a /who sent too soon: the check is closed at once, and the person stays first ==")
-- whoTrace, 26 Sep: "You must wait a moment longer before using /who again." 4.4-4.8s after the previous /who. The
-- refused question used to stay open and take the next check's answer, so every answer after it was reported against
-- the check before: "checking Charles Milksteak... / Derkaderka Muhamedjihad: offline (answer came late)".
OlympusVerifyDB.queue = { Q("Derka Derka", 201), Q("Charles Milksteak", 202), Q("Rage Reaper", 203) }
local REFUSED = "You must wait a moment longer before using /who again."
later(60 * 16)
OlympusVerify_Flush()
check("asks about Derka", WHO_SENT[#WHO_SENT], 'n-"Derka Derka"')
sys("0 players total")
check("Derka: offline", PO("Derka Derka"), "offline")
later(6)
OlympusVerify_Flush()
check("asks about Charles", WHO_SENT[#WHO_SENT], 'n-"Charles Milksteak"')
check("  the server's refusal is kept out of chat", hidden(REFUSED), true)
sys(REFUSED)
check("the refused check is closed at once, not left waiting", PO("Charles Milksteak"), "unchecked")
check("  says so", lastPrint("the server refused the /who for Charles Milksteak (too soon after the last one) — Charles Milksteak stays first in line; press again in 6s.") ~= nil, true)
check("  and a refusal is not an unanswered check", OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Charles Milksteak")] == nil
  or OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Charles Milksteak")].noAnswer == nil, true)
later(5)
local sentR = #WHO_SENT
OlympusVerify_Flush()
check("the gap grew by half a second: 5s later nothing is sent yet", #WHO_SENT, sentR)
check("  and it says when", lastPrint("the server takes one /who every 5.5s — press again in 1s") ~= nil, true)
later(1)
OlympusVerify_Flush()
check("Charles is asked again, not Rage", WHO_SENT[#WHO_SENT], 'n-"Charles Milksteak"')
sys("0 players total")
check("Charles's own answer is his", PO("Charles Milksteak"), "offline")
check("  and not called late", lastPrint("came late") == nil, true)
later(6)
OlympusVerify_Flush()
check("then Rage", WHO_SENT[#WHO_SENT], 'n-"Rage Reaper"')
sys("0 players total")
check("  Rage's answer is Rage's", PO("Rage Reaper"), "offline")
later(4)
sys("0 players total")
check("a total nobody is waiting for is not taken", PO("Rage Reaper"), "offline")
check("  nor hidden", hidden("0 players total"), false)

print("\n== a check never answered: back in line at once; twice in a row, and it is set aside ==")
OlympusVerifyDB.queue = { Q("Never Mind", 204), Q("Last One", 205) }
later(6)
OlympusVerify_Flush()
check("asks about Never Mind", WHO_SENT[#WHO_SENT], 'n-"Never Mind"')
later(9)
check("no answer: back in line straight away", PO("Never Mind"), "unchecked")
OlympusVerify_Flush()
check("  and asked again, being first in line", WHO_SENT[#WHO_SENT], 'n-"Never Mind"')
later(9)
check("twice without an answer: set aside", PO("Never Mind"), "unread")
check("  and says so", lastPrint("still no /who answer about Never Mind, twice in a row") ~= nil, true)
OlympusVerify_Flush()
check("  the next press asks about somebody else", WHO_SENT[#WHO_SENT], 'n-"Last One"')
sys("0 players total")
check("  whose answer is theirs", PO("Last One"), "offline")

print("\n== everyone is checked once before anyone is checked again ==")
-- 26 Sep: "the check next number going up again". The front of the line came back every OFFLINE_TTL and was asked
-- again before the button ever reached the people further back.
OlympusVerifyDB.queue = { Q("Front Fran", 301), Q("Middle Mo", 302), Q("Back Bo", 303) }
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Front Fran")] = { state = "offline", at = NOW - 20 * 60 }
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Middle Mo")] = { state = "offline", at = NOW - 40 * 60 }
later(6)
OlympusVerify_Flush()
check("the never-checked one goes first, though last in line", WHO_SENT[#WHO_SENT], 'n-"Back Bo"')
sys("0 players total")
later(6)
OlympusVerify_Flush()
check("then the re-check that has waited longest", WHO_SENT[#WHO_SENT], 'n-"Middle Mo"')
sys("0 players total")
later(6)
OlympusVerify_Flush()
check("  then the next", WHO_SENT[#WHO_SENT], 'n-"Front Fran"')
sys("0 players total")

print("\n== line shapes: a link without brackets, a class-coloured name, a coloured total ==")
OlympusVerifyDB.queue = { Q("Daz Thepriest", 401), Q("Kaldorei Nationalist", 402), Q("Marks Locke", 403) }
later(6)
OlympusVerify_Flush()
check("asks about Daz", WHO_SENT[#WHO_SENT], 'n-"Daz Thepriest"')
local bare = "|Hplayer:Daz Thepriest|hDaz Thepriest|h: Level 10 Human Priest <OLYMPUS XV> - Stormwind City"
check("  a link without brackets is hidden as ours", hidden(bare), true)
sys(bare); sys("|cffffd2001 player total|r")
local stD, recD = API.PresenceOf({ name = "Daz Thepriest", status = "queued" })
check("a link without brackets is read", stD, "guilded")
check("  guild and zone", (recD and recD.guild) == "OLYMPUS XV" and recD.zone == "Stormwind City", true)
later(6)
OlympusVerify_Flush()
sys("|Hplayer:Kaldorei Nationalist-Forever:1:WHISPER|h|cff40c7eb[Kaldorei Nationalist]|r|h: Level 15 Night Elf Hunter <OLYMPUS XXL> - Stormwind City")
sys("1 player total")
check("a class-coloured name inside the link is read", PO("Kaldorei Nationalist"), "guilded")
later(6)
OlympusVerify_Flush()
sys("Marks Locke: Level 20 High Order Skyborne Hunter <OLYMPUS VI> - Valley of Heroes"); sys("1 player total")
local _, recM = API.PresenceOf({ name = "Marks Locke", status = "queued" })
check("a three-word race is read whole", recM and recM.what, "High Order Skyborne Hunter")
check("  and the zone", recM and recM.zone, "Valley of Heroes")

print("\n== a line the client will not let us read is recorded, not thrown ==")
OlympusVerifyDB.queue = { Q("Hidden Hal", 501) }
later(6)
OlympusVerify_Flush()
local okSecret = pcall(onEvent, frame, "CHAT_MSG_SYSTEM", { secret = true })
check("a secret line does not throw", okSecret, true)
local lastSys
for i = #OlympusVerifyDB.whoTrace, 1, -1 do if OlympusVerifyDB.whoTrace[i].k == "system" then lastSys = OlympusVerifyDB.whoTrace[i] break end end
check("  the trace says it was secret", lastSys and lastSys.why, "secret")
sys("0 players total")
check("  a readable answer after it still counts", PO("Hidden Hal"), "offline")

print("\n== the Who list, changed after our /who and holding exactly our name, is an answer too ==")
OlympusVerifyDB.queue = { Q("Listy Lou", 601) }
later(6)
WHO_LIST = {}
OlympusVerify_Flush()
WHO_LIST = { { fullName = "Listy Lou", fullGuildName = "", level = 8, raceStr = "Human", classStr = "Rogue", area = "Goldshire" } }
later(3)
check("read from the Who list 3s on", PO("Listy Lou"), "ready")
check("  with what it showed", lastPrint("Listy Lou: online, no guild (level 8, Goldshire)") ~= nil, true)

print("\n== an answer our own handler never gets is taken from the chat frame's copy ==")
OlympusVerifyDB.queue = { Q("Framed Fred", 701) }
later(6)
OlympusVerify_Flush()
check("asks about Fred", WHO_SENT[#WHO_SENT], 'n-"Framed Fred"')
check("the line shows only to the chat frame, and is kept out of chat", hidden("Framed Fred: Level 4 Orc Shaman <Totems> - Durotar"), true)
check("  the total too", hidden("1 player total"), true)
local stF, recF = API.PresenceOf({ name = "Framed Fred", status = "queued" })
check("  and the answer is used", stF, "guilded")
check("  guild read", recF and recF.guild, "Totems")
local viaFrame
for i = #OlympusVerifyDB.whoTrace, 1, -1 do if OlympusVerifyDB.whoTrace[i].k == "system (chat frame)" then viaFrame = true break end end
check("  the trace says which way it came", viaFrame, true)
OlympusVerifyDB.queue = { Q("Once Only", 702) }
later(6)
OlympusVerify_Flush()
local traceMark = #OlympusVerifyDB.whoTrace
local line1 = "Once Only: Level 8 Orc Warrior - Durotar"
sys(line1); hidden(line1)   -- the same line, reaching us both ways
sys("1 player total"); hidden("1 player total")
check("a line that arrives both ways is read", PO("Once Only"), "ready")
local copies1 = 0
for i = traceMark + 1, #OlympusVerifyDB.whoTrace do local e = OlympusVerifyDB.whoTrace[i]; if e.k == "system (chat frame)" then copies1 = copies1 + 1 end end
check("  once: the chat frame's copies were recognised and skipped", copies1, 0)

print("\n== an answer printed straight into the chat window, with no event at all ==")
local function chatWindow(text) ChatFrame1.AddMessage(ChatFrame1, text); for _, h in ipairs(HOOKS) do h.fn(h.obj, text) end; fireTimers() end
check("the chat window is watched (hooked once, at login)", #HOOKS, 1)
OlympusVerifyDB.queue = { Q("Windowed Wes", 801), Q("Stamped Sue", 802) }
later(6)
OlympusVerify_Flush()
check("asks about Wes", WHO_SENT[#WHO_SENT], 'n-"Windowed Wes"')
chatWindow("Windowed Wes: Level 6 Troll Priest - Durotar"); chatWindow("1 player total")
check("the chat window's lines are the answer", PO("Windowed Wes"), "ready")
local viaWindow
for i = #OlympusVerifyDB.whoTrace, 1, -1 do if OlympusVerifyDB.whoTrace[i].k == "system (chat window)" then viaWindow = true break end end
check("  and the trace says which way it came", viaWindow, true)
later(6)
OlympusVerify_Flush()
check("asks about Sue", WHO_SENT[#WHO_SENT], 'n-"Stamped Sue"')
sys("Stamped Sue: Level 9 Human Mage <Arcane> - Stormwind City")
chatWindow("|cff888888[18:11:36]|r Stamped Sue: Level 9 Human Mage <Arcane> - Stormwind City")
local copies = 0
for _, e in ipairs(OlympusVerifyDB.whoTrace) do if e.k == "system (chat window)" and tostring(e.s):find("Stamped Sue", 1, true) then copies = copies + 1 end end
check("a timestamped copy of a line the event already gave is not taken again", copies, 0)
sys("1 player total")
check("  and the answer stands", PO("Stamped Sue"), "guilded")
OlympusVerifyDB.queue = { Q("Quiet Quinn", 803) }
later(6)
OlympusVerify_Flush()
chatWindow("|cffc9a227Olympus|r: 0 players total")
check("our own printed lines are never read as an answer", PO("Quiet Quinn"), "checking")
chatWindow("[2. General] [Quiet]: 0 players total")
check("  nor a player's chat line shaped like a total", PO("Quiet Quinn"), "checking")
chatWindow("[Quiet]: Level 60 Human Warrior - Stormwind City")
check("  nor one shaped like a /who line about them", PO("Quiet Quinn"), "checking")
chatWindow("|Hplayer:Quiet:4711:CHANNEL:2|h[Quiet]|h: Level 60 Human Warrior - Stormwind City")
check("  nor one behind a chat sender's link", PO("Quiet Quinn"), "checking")
sys("0 players total")
check("  the real answer still is one", PO("Quiet Quinn"), "offline")

print("\n== asked the way the game's own /who asks ==")
Enum = { SocialWhoOrigin = { Unknown = 0, Social = 1, Chat = 2, Item = 3 } }
C_ChatInfo = { InChatMessagingLockdown = function() return false end }
OlympusVerifyDB.queue = { Q("Origin Olly", 901) }
later(6)
OlympusVerify_Flush()
check("SendWho gets Enum.SocialWhoOrigin.Chat, as /who does", WHO_ORIGIN[#WHO_SENT], 2)
local sendRec
for i = #OlympusVerifyDB.whoTrace, 1, -1 do if OlympusVerifyDB.whoTrace[i].k == "send" then sendRec = OlympusVerifyDB.whoTrace[i] break end end
check("  the trace notes the origin and the chat lockdown", sendRec and sendRec.why, "origin 2, chat lockdown false")
sys("0 players total")
Enum, C_ChatInfo = nil, nil

print("\n== the lines exactly as this client sends them (26 Sep: the total line was never read, in any version) ==")
-- string.format with the client's own format strings: the total arrives as "1 |4player:players; total", and only the
-- chat window turns it into "1 player total".
local function rawWho(name, level, race, class, guild, zone)
  if guild then return string.format(WHO_LIST_GUILD_FORMAT, name, name, level, race, class, guild, zone) end
  return string.format(WHO_LIST_FORMAT, name, name, level, race, class, zone)
end
local function rawTotal(n) return string.format(WHO_NUM_RESULTS, n) end
check("the raw total line really carries the escape", rawTotal(1), "1 |4player:players; total")
OlympusVerifyDB.queue = { Q("Raw Rita", 1001), Q("Raw Ron", 1002), Q("Raw Rae", 1003) }
later(6)
OlympusVerify_Flush()
check("asks about Rita", WHO_SENT[#WHO_SENT], 'n-"Raw Rita"')
local ritaLine = rawWho("Raw Rita", 10, "Human", "Priest", "OLYMPUS XV", "Stormwind City")
check("  her line is kept out of chat", hidden(ritaLine), true)
check("  and so is the raw total", hidden(rawTotal(1)), true)
sys(ritaLine); sys(rawTotal(1))
local stR, recR = API.PresenceOf({ name = "Raw Rita", status = "queued" })
check("a raw answer is read: in another guild", stR, "guilded")
check("  <OLYMPUS XV>, Stormwind City", (recR and recR.guild) == "OLYMPUS XV" and recR.zone == "Stormwind City", true)
check("  and closed at once, not after a timeout", lastPrint("no /who answer about Raw Rita") == nil, true)
later(6)
OlympusVerify_Flush()
check("asks about Ron", WHO_SENT[#WHO_SENT], 'n-"Raw Ron"')
sys(rawTotal(0))
check("'0 |4player:players; total' is offline", PO("Raw Ron"), "offline")
later(6)
OlympusVerify_Flush()
sys(rawWho("Raw Rae", 7, "Night Elf", "Druid", nil, "Teldrassil")); sys(rawTotal(1))
local stE, recE = API.PresenceOf({ name = "Raw Rae", status = "queued" })
check("a raw guildless answer: ready", stE, "ready")
check("  with level, class and zone", (recE and recE.level) == 7 and recE.what == "Night Elf Druid" and recE.zone == "Teldrassil", true)
OlympusVerifyDB.queue = { Q("Raw Wendy", 1004) }
later(6)
OlympusVerify_Flush()
chatWindow(rawWho("Raw Wendy", 12, "Gnome", "Mage", nil, "Dun Morogh")); chatWindow(rawTotal(1))
check("the chat window's raw copy is read the same way", PO("Raw Wendy"), "ready")
OlympusVerifyDB.queue = { Q("Stamp Stan", 1005) }
later(6)
OlympusVerify_Flush()
chatWindow("|cff777777[20:58:31]|r " .. rawTotal(0))
check("  a chat-window total behind a timestamp is read too", PO("Stamp Stan"), "offline")

print("\n== /olv trace ==")
SlashCmdList.OLYMPUSVERIFY("trace 60")
check("prints its header", lastPrint("/who trace, last") ~= nil, true)
check("  each /who sent", lastPrint('send n=Listy Lou q=n-"Listy Lou"') ~= nil, true)
check("  each line as delivered, pipes shown", lastPrint("s=||Hplayer:Raw Rae||h[Raw Rae]||h: Level 7 Night Elf Druid - Teldrassil") ~= nil, true)
check("  the raw total too", lastPrint("s=1 ||4player:players; total") ~= nil, true)
check("  each answer and how it came", lastPrint("answer n=Listy Lou st=free via=who list") ~= nil, true)
local kinds = {}
for _, e in ipairs(OlympusVerifyDB.whoTrace) do kinds[e.k] = (kinds[e.k] or 0) + 1 end
check("  the ring keeps the timeouts", (kinds.timeout or 0) > 0, true)
check("  and the refusals", (kinds.refused or 0) > 0, true)
check("the ring is capped", #OlympusVerifyDB.whoTrace <= 300, true)
SlashCmdList.OLYMPUSVERIFY("trace clear")
check("  and can be cleared", #OlympusVerifyDB.whoTrace, 0)
OlympusVerifyDB.queue = savedQueue

print("\n== whispers go only to people who whispered first (Viktor, 26 Sep) ==")
-- the addon's login note to itself ("Olympus: relay ...", 0.6.0) is not what these checks are about
local function isRelayNote(w) return w.text and w.text:find("^Olympus: relay ") ~= nil end
local function onlyTo(from, name) for i = from + 1, #WHISPERS do if WHISPERS[i].to == name and not isRelayNote(WHISPERS[i]) then return WHISPERS[i] end end end
OlympusVerifyDB.queue = { Q("Chatty Cathy", 1101), Q("Silent Sam", 1102) }
later(60 * 16)
onEvent(frame, "CHAT_MSG_WHISPER", "hi, is there room?", "Chatty Cathy")
OlympusVerify_Flush()
check("Cathy, who just whispered, is checked first", WHO_SENT[#WHO_SENT], 'n-"Chatty Cathy"')
local w0 = #WHISPERS
sys(rawWho("Chatty Cathy", 30, "Human", "Rogue", "Other Guild", "Stormwind City")); sys(rawTotal(1))
-- Viktor, 26 Sep: "It still whispers people who are in other guilds, it shouldn't do that, it should just take them off"
check("someone in another guild is not whispered, even after whispering us first", onlyTo(w0, "Chatty Cathy"), nil)
check("  just taken off the queue", entry("Chatty Cathy").status, "failed")
later(6)
OlympusVerify_Flush()
check("then Sam", WHO_SENT[#WHO_SENT], 'n-"Silent Sam"')
local w1 = #WHISPERS
sys(rawWho("Silent Sam", 30, "Dwarf", "Hunter", "Other Guild", "Ironforge")); sys(rawTotal(1))
check("a stranger in another guild is not whispered at all", #WHISPERS, w1)
check("  and is taken off the queue", entry("Silent Sam").status, "failed")
OlympusVerifyDB.queue = savedQueue

print("\n== nobody due a check: the press and the panel say who is where, and count the people taken off ==")
local keepQueue = OlympusVerifyDB.queue
OlympusVerifyDB.queue = { Q("Fresh Fay", 1400), Q("Away Andy", 1401), Q("Guilded Gus", 1402) }
OlympusVerifyDB.queue[3].status, OlympusVerifyDB.queue[3].removedReason = "failed", "in_another_guild"
later(10)
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Away Andy")] = { state = "offline", at = NOW }
OlympusVerifyUI.Refresh()
check("the panel names only the states somebody is in, and Gus on his own",
  fontWith("Nobody confirmed online and guildless:"),
  "Nobody confirmed online and guildless: 1 not checked, 1 offline. 1 applicant already in another guild was taken off the queue. " ..
  "Check (or your flush key) looks up the next in line; /olv all lists everyone.")
check("  no 'in another guild' bucket among the people waiting", fontWith("0 in another guild") == nil, true)
check("  under the usual title", fontWith("Check the next applicant to fill this list") ~= nil, true)
table.remove(OlympusVerifyDB.queue, 1)   -- Fay out of the way: only Andy waits now, and his answer is fresh
local sentBefore = #WHO_SENT
OlympusVerify_Flush()
check("no /who: Andy's answer is still fresh", #WHO_SENT, sentBefore)
check("  the press explains, Gus counted as taken off",
  lastPrint("nobody to invite: of 1 waiting, none is confirmed online and guildless (1 offline). Each is checked again once their answer ages out. 1 applicant already in another guild was taken off the queue.") ~= nil, true)
OlympusVerifyUI.Refresh()
check("the panel's title no longer says 'or in another guild'", fontWith("Everyone waiting has been checked") ~= nil, true)
check("  and its text does not offer a check there is nobody for",
  fontWith("Nobody confirmed online and guildless:"),
  "Nobody confirmed online and guildless: 1 offline. 1 applicant already in another guild was taken off the queue. " ..
  "Each is checked again once their answer ages out; /olv all lists everyone.")
OlympusVerifyDB.queue = { OlympusVerifyDB.queue[2] }
OlympusVerifyUI.Refresh()
check("nobody waiting at all: the empty queue still accounts for Gus",
  fontWith("Nothing waiting."),
  "Nothing waiting. 1 applicant already in another guild was taken off the queue; /olv all lists them, with a Retry. " ..
  "Codes whispered to you appear here; Discord approvals arrive after /reload.")
OlympusVerifyDB.queue = keepQueue
OlympusVerifyUI.Refresh()

print("\n== a client that refuses /who to addons ==")
NOW = NOW + 60 * 16
local refuse = C_FriendList.SendWho
C_FriendList.SendWho = function(f) onEvent(frame, "ADDON_ACTION_BLOCKED", "OlympusVerify", "C_FriendList.SendWho") end
OlympusVerify_Flush()
check("presence switches off", API.PresenceCounts().filtering, false)
check("  and says so", lastPrint("does not let addons run /who") ~= nil, true)
OlympusVerifyUI.Refresh()
check("the panel lists everyone waiting again", #listed() >= 3, true)
C_FriendList.SendWho = refuse

print("\n== help ==")
SlashCmdList.OLYMPUSVERIFY("status")
check("status line lists the new commands", lastPrint("| check | queue | all |") ~= nil, true)

print("\n== an upgrade drops the 'no usable answer' marks the old versions left behind ==")
OlympusVerifyDB.presence["stale sam"] = { state = "unread", at = NOW, noAnswer = 1 }
OlympusVerifyDB.presenceVersion = "0.5.2"
onEvent(frame, "PLAYER_LOGIN")
check("cleared", OlympusVerifyDB.presence["stale sam"].state, nil)
check("  and the no-answer count with it", OlympusVerifyDB.presence["stale sam"].noAnswer, nil)
check("  version noted, so the next login keeps what it finds", OlympusVerifyDB.presenceVersion ~= "0.5.2", true)
check("  the login is in the trace", OlympusVerifyDB.whoTrace[#OlympusVerifyDB.whoTrace].k, "login")

print("\n== the server's answers to an invite follow the same rule ==")
OlympusVerifyDB.queue = { Q("Refused Rick", 1103), Q("Refused Rhea", 1104), Q("Full Fiona", 1105) }
onEvent(frame, "CHAT_MSG_WHISPER", "hey", "Refused Rhea")
later(6)   -- also lets the login note above go out, so it is not counted below
local w2 = #WHISPERS
OlympusVerify_Flush(entry("Refused Rick"))
check("an invite went to Rick", INVITES[#INVITES], "Refused Rick")
sys("Refused Rick is already in a guild.")
check("'already in a guild' does not whisper a stranger", #WHISPERS, w2)
check("  his row fails as before", entry("Refused Rick").status, "failed")
later(6)
OlympusVerify_Flush(entry("Refused Rhea"))
sys("Refused Rhea is already in a guild.")
check("  nor someone who whispered first: in another guild means taken off, never whispered", onlyTo(w2, "Refused Rhea"), nil)
check("  her row is off the queue for the same reason a /who would give", entry("Refused Rhea").status == "failed" and entry("Refused Rhea").removedReason == "in_another_guild", true)
local rheaCode = OlympusHmac.codeFor("harness-only-not-a-real-secret", "Refused Rhea", OlympusHmac.utcDay(NOW))
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. rheaCode, "Refused Rhea")
check("  and her code whispered after /gquit puts the row back", entry("Refused Rhea").status, "queued")
later(6)
local w3 = #WHISPERS
OlympusVerify_Flush(entry("Full Fiona"))
sys("Guild is full.")
check("'guild is full' does not whisper a stranger either", onlyTo(w3, "Full Fiona"), nil)

print("\n== a join: the member is welcomed only if they whispered first; otherwise the signed line is a note to self ==")
OlympusVerifyDB.queue = {
  { name = "Quiet Joiner", target = "Quiet Joiner", status = "invited", invitedAt = NOW, source = "worker", id = 1201 },
  { name = "Chatty Joiner", target = "Chatty Joiner", status = "invited", invitedAt = NOW, source = "whisper" },
}
onEvent(frame, "CHAT_MSG_WHISPER", "thanks!", "Chatty Joiner")
ROSTER[#ROSTER + 1] = { name = "Quiet Joiner", rank = "Initiate", rankIndex = 4, level = 5 }
ROSTER[#ROSTER + 1] = { name = "Chatty Joiner", rank = "Initiate", rankIndex = 4, level = 5 }
local w4 = #WHISPERS
onEvent(frame, "PLAYER_LOGIN"); later(10)   -- the login's ten-second join check
check("both joined", entry("Quiet Joiner").status == "joined" and entry("Chatty Joiner").status == "joined", true)
local selfNote = onlyTo(w4, "Fern Melder")
check("the stranger is not whispered", onlyTo(w4, "Quiet Joiner"), nil)
check("  their join is signed in a whisper to ourselves", selfNote ~= nil and selfNote.text:find("^Olympus: Quiet Joiner joined the guild %(ref OLVj%-%x+%)$") ~= nil, true)
check("  the MAC is over the new member's name, as the watcher checks it",
  selfNote and selfNote.text:match("OLVj%-(%x+)") == OlympusHmac.joinToken("harness-only-not-a-real-secret", "Quiet Joiner", OlympusHmac.utcDay(NOW)), true)
local toChatty = onlyTo(w4, "Chatty Joiner")
check("someone who whispered first gets the welcome, signed as before", toChatty ~= nil and toChatty.text:find("OLVj-", 1, true) ~= nil, true)
-- 27 Sep: a line a message filter hides is not written to the chat log either, so the sent half is left alone
check("the note's sent half is left in the chat window, so it reaches the chat log", FILTERS.CHAT_MSG_WHISPER_INFORM, nil)
check("  and the received half", FILTERS.CHAT_MSG_WHISPER(nil, "CHAT_MSG_WHISPER", selfNote.text, "Fern Melder-Forever"), true)
check("  but the same text from anyone else is not", FILTERS.CHAT_MSG_WHISPER(nil, "CHAT_MSG_WHISPER", selfNote.text, "Some Prankster"), false)
check("  nor an ordinary whisper of our own", FILTERS.CHAT_MSG_WHISPER(nil, "CHAT_MSG_WHISPER", "see you in a bit", "Fern Melder"), false)

print("\n== contacts: kept for two weeks, and seeded from the whispers already in the event log ==")
OlympusVerifyDB.contacts = {}
table.insert(OlympusVerifyDB.events, { type = "whisper", name = "Old Friend", ts = NOW - 86400, ok = true })
table.insert(OlympusVerifyDB.events, { type = "whisper", name = "Ancient One", ts = NOW - 30 * 86400, ok = true })
OlympusVerifyDB.contacts[OlympusHmac.normalizeCharacter("Stale Contact")] = NOW - 20 * 86400
onEvent(frame, "PLAYER_LOGIN")
check("a whisper from yesterday in the event log counts", OlympusVerifyDB.contacts[OlympusHmac.normalizeCharacter("Old Friend")] ~= nil, true)
check("  one from a month ago does not", OlympusVerifyDB.contacts[OlympusHmac.normalizeCharacter("Ancient One")], nil)
check("  and older contacts are forgotten", OlympusVerifyDB.contacts[OlympusHmac.normalizeCharacter("Stale Contact")], nil)

print("\n== at login, anyone the last version found in another guild comes off the queue ==")
-- (whisper-sourced, so the queue file merge at login cannot withdraw them as rows the Worker no longer lists)
OlympusVerifyDB.queue = { Q("Found Before", 1301), Q("Offline Before", 1302) }
for _, q in ipairs(OlympusVerifyDB.queue) do q.source = "whisper" end
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Found Before")] = { state = "guilded", at = NOW - 600, guild = "OLYMPUS XV" }
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Offline Before")] = { state = "offline", at = NOW - 600 }
onEvent(frame, "PLAYER_LOGIN")
check("taken off", entry("Found Before").status, "failed")
check("  with the guild it was in", entry("Found Before").reply:find("OLYMPUS XV", 1, true) ~= nil, true)
check("  and said so", lastPrint("1 applicant(s) already found in another guild taken off the queue.") ~= nil, true)
check("someone merely offline stays queued", entry("Offline Before").status, "queued")

print(string.format("\n%d/%d passed", tests - fails, tests))
os.exit(fails == 0 and 0 or 1)

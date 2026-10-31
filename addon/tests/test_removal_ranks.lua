-- Current ten-rank safety boundary, with only the existing synthetic WoW client.
dofile("wow_mock.lua")
local fails, total = 0, 0
local function check(label, condition)
  total = total + 1
  if not condition then fails = fails + 1 end
  print((condition and "PASS " or "FAIL ") .. label)
end
local ladder = { "Leader", "High Council", "Officer", "Officer Alt", "Raid Leader", "Veteran", "Raider", "Member", "Alt", "Initiate" }
ROSTER = { { name = "Fern Melder", rank = "Leader", rankIndex = 0, level = 60, online = true } }
local members = {}
NOW = UTC(2026, 10, 28, 12)
for i, rank in ipairs(ladder) do
  local name = "Rank Person " .. i
  ROSTER[#ROSTER + 1] = { name = name, rank = rank, rankIndex = i - 1, level = 60, away = 200 }
  members[#members + 1] = { name = name, rank = rank, rankIndex = i - 1, firstSeen = NOW - 100 * 86400, eligibleAt = NOW - 90 * 86400 }
end
OlympusVerifyConfig = { secret = "synthetic-only", protectRankIndex = 1, uiAutoShow = false }
OlympusQueue = { version = 1, entries = {}, unverified = { members = members, firstSeenAvailable = true, graceDays = 3, snapshotAt = NOW } }
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
local event = OlympusVerifyFrame:GetScript("OnEvent")
event(OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
event(OlympusVerifyFrame, "PLAYER_LOGIN")
local API = OlympusVerifyAPI
local ok, inactivity = pcall(API.Candidates, 100)
check("canonical roster produces an inactivity review", ok)
local allowed = {}
if ok then for _, row in ipairs(inactivity) do allowed[row.name] = true end end
local okUnverified, unverified = pcall(API.UnverifiedList, 100)
check("canonical roster produces an unverified review", okUnverified)
local unverifiedAllowed = {}
if okUnverified then for _, row in ipairs(unverified) do unverifiedAllowed[row.name] = true end end
for i, rank in ipairs(ladder) do
  local wanted = i > 4
  check(rank .. " inactivity eligibility matches current rank boundary", (allowed["Rank Person " .. i] == true) == wanted)
  check(rank .. " unverified eligibility matches current rank boundary", (unverifiedAllowed["Rank Person " .. i] == true) == wanted)
end
for i, index in ipairs({ false, -1, 2.5, 10, "7", 0/0, math.huge, -math.huge }) do
  local name = "Unknown Rank " .. i
  local row = { name = name, rank = "Unknown", level = 60, away = 200 }
  if index ~= false then row.rankIndex = index end
  ROSTER[#ROSTER + 1] = row
  members[#members + 1] = { name = name, rank = "Unknown", firstSeen = NOW - 100 * 86400, eligibleAt = NOW - 90 * 86400 }
  local a, candidates = pcall(API.Candidates, 100)
  local b, unverifiedRows = pcall(API.UnverifiedList, 100)
  local held = a and b
  if held then
    for _, candidate in ipairs(candidates) do if candidate.name == name then held = false end end
    for _, candidate in ipairs(unverifiedRows) do if candidate.name == name then held = false end end
  end
  check("unknown rank " .. i .. " is held from both lists without crashing", held)
  table.remove(ROSTER)
  table.remove(members)
end
local calls = 0
C_GuildInfo.Uninvite = function() calls = calls + 1 end
API.RemoveMember("Rank Person 3")
API.RemoveMember("Rank Person 3")
check("direct two-click API cannot remove a protected Officer", calls == 0)
check("protected Officer cannot be aimed by the public macro API", API.PointKickMacro("Rank Person 3", "space") == false)
local count = #ROSTER
calls = 0
API.RemoveMember("Rank Person 8")
ROSTER[9].rank, ROSTER[9].rankIndex = "Officer", 2
API.RemoveMember("Rank Person 8")
check("promotion between confirmation clicks cancels the removal", calls == 0)
check("stale promoted row cannot be aimed", API.PointKickMacro("Rank Person 8", "space") == false)
check("synthetic test does not change roster membership", #ROSTER == count)
ROSTER[9].rank, ROSTER[9].rankIndex = "Member", 7
calls = 0
check("eligible first click only arms", API.RemoveMember("Rank Person 8") == false and calls == 0)
check("eligible second click performs one removal", API.RemoveMember("Rank Person 8") == true and calls == 1)
check("third click cannot duplicate a confirmed removal", API.RemoveMember("Rank Person 8") == false and calls == 1)
API.RemoveMember("Rank Person 7", "space")
check("changing removal reason requires a fresh confirmation", API.RemoveMember("Rank Person 7", "unverified") == false and calls == 1)
check("eligible macro targets the exact current member", API.PointKickMacro("Rank Person 8", "space") == true and MACROS[1].body == "/guildremove Rank Person 8")
local timerCalls, rosterRequests = 0, ROSTER_ASKS
local timerAfter = C_Timer.After
C_Timer.After = function(...) timerCalls = timerCalls + 1; return timerAfter(...) end
event(OlympusVerifyFrame, "GUILD_ROSTER_UPDATE")
check("an eligible armed target causes no roster response feedback or timer", ROSTER_ASKS == rosterRequests and timerCalls == 0 and MACROS[1].body == "/guildremove Rank Person 8")
C_Timer.After = timerAfter
ROSTER[9].rank, ROSTER[9].rankIndex = "Officer", 2
event(OlympusVerifyFrame, "GUILD_ROSTER_UPDATE")
check("observed promotion disarms an existing macro", MACROS[1].body == "/olv unaimed")
ROSTER[9].rank, ROSTER[9].rankIndex = "Member", 7
check("eligible macro can be aimed again", API.PointKickMacro("Rank Person 8", "space") == true)
InCombatLockdown = function() return true end
ROSTER[9].rank, ROSTER[9].rankIndex = "Officer", 2
event(OlympusVerifyFrame, "GUILD_ROSTER_UPDATE")
check("combat keeps the existing body until editing is allowed", MACROS[1].body == "/guildremove Rank Person 8")
InCombatLockdown = function() return false end
event(OlympusVerifyFrame, "PLAYER_REGEN_ENABLED")
check("leaving combat completes the deferred macro disarm", MACROS[1].body == "/olv unaimed")
ROSTER[9].rank, ROSTER[9].rankIndex = "Member", 7
check("unverified current member can be aimed", API.PointKickMacro("Rank Person 8", "unverified") == true)
event(OlympusVerifyFrame, "CHAT_MSG_WHISPER", "!verify ZZZZZZ", "Rank Person 8-Forever")
check("an invalid code does not disarm an eligible target", MACROS[1].body == "/guildremove Rank Person 8")
local code = OlympusHmac.codeFor(OlympusVerifyConfig.secret, "Rank Person 7", OlympusHmac.utcDay(NOW))
event(OlympusVerifyFrame, "CHAT_MSG_WHISPER", "!verify " .. code, "Rank Person 7-Forever")
check("another member verifying does not disarm this target", MACROS[1].body == "/guildremove Rank Person 8")
code = OlympusHmac.codeFor(OlympusVerifyConfig.secret, "Rank Person 8", OlympusHmac.utcDay(NOW))
event(OlympusVerifyFrame, "CHAT_MSG_WHISPER", "!verify " .. code, "Rank Person 8-Forever")
check("a valid whisper disarms the now-verified target immediately", MACROS[1].body == "/olv unaimed")
local eventCount = #OlympusVerifyDB.events
event(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Rank Person 8-Forever has been kicked out of the guild by Fern Melder.")
check("a later unrelated kick is not attributed to the canceled unverified aim", #OlympusVerifyDB.events == eventCount)
check("a second unverified member can be aimed", API.PointKickMacro("Rank Person 9", "unverified") == true)
code = OlympusHmac.codeFor(OlympusVerifyConfig.secret, "Rank Person 9", OlympusHmac.utcDay(NOW))
GetInboxNumItems = function() return 1 end
GetInboxHeaderInfo = function() return nil, nil, "Rank Person 9-Forever", "!verify " .. code end
event(OlympusVerifyFrame, "MAIL_SHOW")
event(OlympusVerifyFrame, "MAIL_INBOX_UPDATE")
check("valid verification mail disarms the now-verified target immediately", MACROS[1].body == "/olv unaimed")
check("eligible targets can be retargeted", API.PointKickMacro("Rank Person 5", "space") == true and API.PointKickMacro("Rank Person 6", "space") == true)
eventCount = #OlympusVerifyDB.events
event(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Rank Person 5-Forever has been kicked out of the guild by Fern Melder.")
check("retargeting cancels the previous target's removal attribution", #OlympusVerifyDB.events == eventCount)
SlashCmdList.OLYMPUSVERIFY("macrotest")
eventCount = #OlympusVerifyDB.events
event(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Rank Person 6-Forever has been kicked out of the guild by Fern Melder.")
check("macrotest cancels the previous target's removal attribution", #OlympusVerifyDB.events == eventCount and MACROS[1].body == "/olv unaimed")

-- A stricter operator floor still works; no game data or private config is read.
dofile("wow_mock.lua")
ROSTER = {
  { name = "Fern Melder", rank = "Leader", rankIndex = 0, level = 60, online = true },
  { name = "Raid Person", rank = "Raid Leader", rankIndex = 4, level = 60, away = 200 },
  { name = "Member Person", rank = "Member", rankIndex = 7, level = 60, away = 200 },
}
OlympusVerifyConfig = { protectRankIndex = 5, uiAutoShow = false }
OlympusQueue = { version = 1, entries = {} }
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
OlympusVerifyFrame:GetScript("OnEvent")(OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
local stricter = OlympusVerifyAPI.Candidates(100)
check("a stricter configured floor holds Raid Leader and still offers Member", #stricter == 1 and stricter[1].name == "Member Person")

-- Guidance must use the same selected command as the actual attended macro.
-- All refusals below are delivered inside the synthetic protected API call.
local strictAPI = OlympusVerifyAPI
local strictEvent = OlympusVerifyFrame:GetScript("OnEvent")
local function printedSince(start, text)
  for i = start + 1, #PRINTS do if PRINTS[i]:find(text, 1, true) then return true end end
  return false
end
OlympusVerifyConfig.kickCommand = "/gremove"
local removalAttempts = 0
C_GuildInfo.Uninvite = function()
  removalAttempts = removalAttempts + 1
  strictEvent(OlympusVerifyFrame, "ADDON_ACTION_FORBIDDEN", "OlympusVerify")
end
check("selected-command refusal still needs an attended first click", strictAPI.RemoveMember("Member Person") == false and removalAttempts == 0)
local printed = #PRINTS
check("synthetic forbidden removal is not reported as successful", strictAPI.RemoveMember("Member Person") == false and removalAttempts == 1)
check("removal refusal names the configured command", printedSince(printed, "use /gremove by hand"))
printed = #PRINTS
check("blocked removal does not repeat the protected call", strictAPI.RemoveMember("Member Person") == false and removalAttempts == 1)
check("blocked-row guidance includes the selected command and exact name", printedSince(printed, "/gremove Member Person"))
printed = #PRINTS
SlashCmdList.OLYMPUSVERIFY("full")
check("full-list header uses the selected command", printedSince(printed, "for /gremove by hand:"))
check("full-list row uses the selected command and exact name", printedSince(printed, "/gremove Member Person"))
check("configured command is also used by the real macro path", strictAPI.PointKickMacro("Member Person", "space") == true and MACROS[1].body == "/gremove Member Person")
local oldEditMacro = EditMacro
EditMacro = function(...)
  strictEvent(OlympusVerifyFrame, "ADDON_ACTION_FORBIDDEN", "OlympusVerify")
  return oldEditMacro(...)
end
printed = #PRINTS
SlashCmdList.OLYMPUSVERIFY("macrotest")
check("macro refusal also names the selected manual command", printedSince(printed, "type /gremove <name> by hand"))
EditMacro = oldEditMacro
OlympusVerifyConfig.kickCommand = nil
printed = #PRINTS
strictAPI.RemoveMember("Member Person")
check("fallback guidance retains the existing measured command", printedSince(printed, "/guildremove Member Person"))
check("copy checks perform only the one synthetic attempted removal", removalAttempts == 1)
print(string.format("\n%d/%d passed", total - fails, total))
os.exit(fails == 0 and 0 or 1)

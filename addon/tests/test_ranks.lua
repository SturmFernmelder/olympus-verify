-- Informational rank guide against the real module and slash handler.
-- Only synthetic client/state: no Config.lua, game files or network calls.
dofile("wow_mock.lua")
local failures, total = 0, 0
local function check(label, value, expected)
  total = total + 1
  local ok = value == expected
  if not ok then failures = failures + 1 end
  print(string.format("%s %s%s", ok and "ok  " or "FAIL", label,
    ok and "" or (" (got " .. tostring(value) .. ", expected " .. tostring(expected) .. ")")))
end
local function contains(lines, text)
  for _, line in ipairs(lines) do if line:find(text, 1, true) then return true end end
  return false
end
local function messagesSince(start)
  local lines = {}
  for i = start + 1, #PRINTS do lines[#lines + 1] = PRINTS[i] end
  return lines
end
local function copy(value)
  if type(value) ~= "table" then return value end
  local result = {}
  for key, item in pairs(value) do result[key] = copy(item) end
  return result
end
local function same(left, right)
  if type(left) ~= type(right) then return false end
  if type(left) ~= "table" then return left == right end
  for key, value in pairs(left) do if not same(value, right[key]) then return false end end
  for key in pairs(right) do if left[key] == nil then return false end end
  return true
end

local beforePrint, beforeFrames, beforeWhispers = #PRINTS, #FRAMES, #WHISPERS
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/OlympusVerifyRanks.lua"))("OlympusVerify", {})
check("loading the guide prints nothing", #PRINTS, beforePrint)
check("loading the guide creates no UI", #FRAMES, beforeFrames)
check("loading the guide sends no whispers", #WHISPERS, beforeWhispers)
check("loading the guide does not initialise persisted state", OlympusVerifyDB, nil)
check("a missing printer is refused without a client call", OlympusVerifyRanks.Print(nil), false)

local guide = {}
check("the standalone guide can use a supplied printer", OlympusVerifyRanks.Print(function(line) guide[#guide + 1] = line end), true)
local expectedRanks = { "Guild Master (GM)", "High Council", "Officer", "Officer Alt", "Raid Leader", "Veteran", "Raider", "Member", "Alt", "Initiate" }
check("the heading distinguishes a recommended preset from live configuration", guide[1], "Recommended ten-rank preset (highest first; native indices 0-9):")
for i, rank in ipairs(expectedRanks) do
  check("native index " .. (i - 1) .. " is " .. rank, guide[i + 1], "  " .. (i - 1) .. ": " .. rank)
end
check("appointments are outside the ten native ranks", guide[12], "Appointments: Treasurer belongs within High Council; Co-Guild Master (Co-GM) is an appointment, not an extra native rank.")
check("withdrawal and tab management explicitly apply to every High Council member", contains(guide, "every High Council member Withdraw Gold and Modify Bank Tabs"), true)
check("Raid Leader keeps the authenticator safeguard", contains(guide, "Raid Leader retains the authenticator safeguard"), true)
check("numeric bank allowances are explicitly unapproved", contains(guide, "No numeric bank withdrawal allowances have been approved"), true)
check("setup and review still require attended Guild Master action", contains(guide, "native Guild Master setup and permission review remain attended in-game actions"), true)
check("the guide explains its read-only boundary", contains(guide, "This command changes no ranks, appointments or permissions"), true)
check("the complete guide has ten rank lines plus six guidance lines", #guide, 16)

local tocFile = assert(io.open("../OlympusVerify/OlympusVerify.toc", "r"))
local toc = tocFile:read("*a"); tocFile:close()
local version = toc:match("## Version:%s*([^\r\n]+)")
check("TOC version is 0.6.5", version, "0.6.5")
check("TOC loads the guide before the slash handler", toc:find("OlympusVerifyRanks.lua\nOlympusVerify.lua", 1, true) ~= nil, true)
C_AddOns.GetAddOnMetadata = function(_, field) if field == "Version" then return version end end
OlympusVerifyConfig = { uiAutoShow = false, checkBeforeInvite = false }
OlympusQueue = { version = 1, generatedAt = NOW, entries = {} }
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
beforePrint = #PRINTS
local ok = pcall(SlashCmdList.OLYMPUSVERIFY, "ranks")
check("rank guidance works before persisted state is initialised", ok, true)
check("pre-initialisation ranks command leaves state absent", OlympusVerifyDB, nil)
check("slash output uses the existing coloured Olympus chat printer", contains(messagesSince(beforePrint), "|cffc9a227Olympus|r: "), true)
check("slash output includes the final native rank", contains(messagesSince(beforePrint), "9: Initiate"), true)

local originalPrint = OlympusVerifyRanks.Print
OlympusVerifyRanks.Print = function(printer) printer("delegated guide sentinel") end
beforePrint = #PRINTS
SlashCmdList.OLYMPUSVERIFY("  RaNkS  ")
check("slash dispatch is case-insensitive and delegates to the module", contains(messagesSince(beforePrint), "delegated guide sentinel"), true)
OlympusVerifyRanks.Print = originalPrint
local module = OlympusVerifyRanks
OlympusVerifyRanks = nil
beforePrint = #PRINTS
ok = pcall(SlashCmdList.OLYMPUSVERIFY, "ranks")
check("a missing module does not crash the existing command handler", ok, true)
check("a missing module explains that a client restart is needed", contains(messagesSince(beforePrint), "rank guide not loaded"), true)
OlympusVerifyRanks = module

local frame = OlympusVerifyFrame
frame:GetScript("OnEvent")(frame, "ADDON_LOADED", "OlympusVerify")
OlympusVerifyDB.queue = { { name = "Waiting Member", status = "queued", ts = NOW - 60 } }
OlympusVerifyDB.notePending = { { name = "Pending Note", note = "synthetic" } }
OlympusVerifyDB.events = { { type = "synthetic", at = NOW } }
local db, snapshot = OlympusVerifyDB, copy(OlympusVerifyDB)
local actions = 0
local function forbiddenAction() actions = actions + 1; error("informational guide attempted a game action") end
for _, key in ipairs({ "Invite", "Uninvite", "SetNote", "GuildRoster", "Promote", "Demote", "SetGuildRankOrder", "SetGuildRankFlag" }) do C_GuildInfo[key] = forbiddenAction end
SendChatMessage, GuildControlSetRank, GuildControlSetRankFlag = forbiddenAction, forbiddenAction, forbiddenAction
GuildControlSetRankName, GuildControlSetRankAllowance, SetGuildBankTabPermissions = forbiddenAction, forbiddenAction, forbiddenAction
GuildPromote, GuildDemote, GuildInvite, GuildUninvite = forbiddenAction, forbiddenAction, forbiddenAction, forbiddenAction
CreateMacro, EditMacro = forbiddenAction, forbiddenAction
beforePrint, beforeWhispers = #PRINTS, #WHISPERS
ok = pcall(SlashCmdList.OLYMPUSVERIFY, "ranks")
check("ranks runs with protected and communication APIs forbidden", ok, true)
check("ranks invokes no guild, bank, invite, macro or messaging action", actions, 0)
check("ranks preserves persisted state identity", OlympusVerifyDB, db)
check("ranks preserves the full synthetic queue, notes, events and state", same(OlympusVerifyDB, snapshot), true)
check("ranks sends no whisper", #WHISPERS, beforeWhispers)
check("ranks prints one complete guide", #messagesSince(beforePrint), #guide)
check("ordinary status still derives version from the TOC metadata", OlympusVerifyAPI.Status().version, "0.6.5")
beforePrint = #PRINTS
SlashCmdList.OLYMPUSVERIFY("help")
check("help makes ranks discoverable", contains(messagesSince(beforePrint), "| ranks |"), true)
check("ordinary help retains existing queue status", contains(messagesSince(beforePrint), "queued 1, notes off, events 1"), true)
check("ordinary help still performs no protected action", actions, 0)

print(string.format("\n%d/%d passed", total - failures, total))
os.exit(failures == 0 and 0 or 1)

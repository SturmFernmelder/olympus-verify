-- Loads the real addon files against a mocked WoW client and exercises the unverified-removal feature end to end.
-- Run from this folder: lua5.1 test_unverified.lua   (needs Lua 5.1 and LuaBitOp, which WoW itself ships as bit)
-- Uses a made-up secret; never point it at Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = (want == nil) and (got ~= nil and got ~= false) or (got == want)
  if not ok then fails = fails + 1 end
  print(string.format("%s %-66s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function lastPrint(pat) for i = #PRINTS, 1, -1 do if PRINTS[i]:find(pat, 1, true) then return PRINTS[i] end end end

-- ---- fixtures: the live roster, and the unverified list the watcher wrote ----
local P, OPEN, GRACE = 1, UTC(2026, 9, 25), 3 * 86400
ROSTER = {
  { name = "Fern Melder", rank = "Officer", rankIndex = 1, level = 60, online = true },
  { name = "Tater Toe",    rank = "Initiate", rankIndex = 4, level = 1,  away = 10 },
  { name = "Lazy Larry",   rank = "Initiate", rankIndex = 4, level = 5,  away = 2 },
  { name = "Online Olly",  rank = "Initiate", rankIndex = 4, level = 9,  online = true },
  { name = "Holdy Hold",   rank = "Member",   rankIndex = 3, level = 30, away = 40, note = "HOLD - alt of Fern" },
  { name = "Pending Pat",  rank = "Initiate", rankIndex = 4, level = 3,  away = 9 },
  { name = "Officer Ollie",rank = "Officer",  rankIndex = 1, level = 60, away = 50 },
  { name = "New Nancy",    rank = "Initiate", rankIndex = 4, level = 2,  away = 1 },
  { name = "Unknown Una",  rank = "Initiate", rankIndex = 4, level = 4,  away = 20 },
  { name = "Veteran Vic",  rank = "Veteran",  rankIndex = 2, level = 40, away = 20 },
  { name = "Mid Member",   rank = "Member",   rankIndex = 3, level = 20, away = 30 },
  { name = "Whisper Wendy",rank = "Initiate", rankIndex = 4, level = 7,  away = 15 },
}
local function M(name, rank, ri, first, pending, elig)
  return { name = name, rank = rank, rankIndex = ri, level = 1, firstSeen = first, pending = pending or false,
           eligibleAt = elig == false and nil or (elig or (first and math.max(first, OPEN) + GRACE)) }
end
OlympusQueue = { version = 1, entries = {}, unverified = { graceDays = 3, verifyOpenSince = OPEN, firstSeenAvailable = true, snapshotAt = OPEN,
  members = {
    M("Tater Toe", "Initiate", 4, UTC(2026,9,20)), M("Lazy Larry", "Initiate", 4, UTC(2026,9,21)), M("Online Olly", "Initiate", 4, UTC(2026,9,20)),
    M("Holdy Hold", "Member", 3, UTC(2026,9,20)), M("Pending Pat", "Initiate", 4, UTC(2026,9,20), true), M("Officer Ollie", "Officer", 1, UTC(2026,9,20)),
    M("New Nancy", "Initiate", 4, UTC(2026,9,28)), M("Unknown Una", "Initiate", 4, nil, false, false), M("Veteran Vic", "Veteran", 2, UTC(2026,9,20)),
    M("Mid Member", "Member", 3, UTC(2026,9,21)), M("Whisper Wendy", "Initiate", 4, UTC(2026,9,20)), M("Gone Gary", "Initiate", 4, UTC(2026,9,20)),
  } } }
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret" }
OlympusVerifyDB = nil

-- ---- load exactly as WoW does (TOC order), then fire the startup events ----
local okLoad, err = pcall(function()
  assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
end)
check("both files load in TOC order", okLoad, true)
if not okLoad then print(err) os.exit(1) end
local onEvent = OlympusVerifyFrame:GetScript("OnEvent")
check("ADDON_LOADED + PLAYER_LOGIN run", pcall(function() onEvent(OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify"); onEvent(OlympusVerifyFrame, "PLAYER_LOGIN") end), true)
local API = OlympusVerifyAPI

print("\n== 26 Sep, inside the grace period ==")
local c, info = API.UnverifiedList(10)
check("nobody offered while every grace period is still running", #c, 0)
check("next grace end = Mon 28 Sep 00:00 UTC (the fix + 3 days)", info.nextEligible, OPEN + GRACE)
check("'gone' counts the one on the list who has left", info.gone, 1)

print("\n== 29 Sep, grace over for launch members ==")
NOW = UTC(2026, 9, 29, 12)
c, info = API.UnverifiedList(10)
local order = {} for i, x in ipairs(c) do order[i] = x.name end
check("offered, lowest rank first then longest away", table.concat(order, ","), "Whisper Wendy,Tater Toe,Lazy Larry,Mid Member,Veteran Vic")
check("held: online now", info.held["online now"], 1)
check("held: hold note (case-insensitive)", info.held["hold note"], 1)
check("held: verifying now (live code)", info.held["verifying now"], 1)
check("held: protected rank (officer)", info.held["protected rank"], 1)
check("held: joined after the fix, still in grace", info.held["grace period"], 1)
check("held: join date unknown is never offered", info.held["join date unknown"], 1)
check("held: the officer running the panel is never on it", info.held["you"], nil)
check("candidate carries reason=unverified", c[1] and c[1].reason, "unverified")
check("realm suffix stripped from names", c[1] and c[1].name, "Whisper Wendy")

print("\n== a code whispered mid-session takes effect before the next /reload ==")
local code = OlympusHmac.codeFor(OlympusVerifyConfig.secret, "Whisper Wendy", OlympusHmac.utcDay(NOW))
onEvent(OlympusVerifyFrame, "CHAT_MSG_WHISPER", "!verify " .. code, "Whisper Wendy-Forever")
c, info = API.UnverifiedList(10)
check("Wendy is no longer offered", c[1] and c[1].name, "Tater Toe")
check("counted as 'verified since login'", info.held["verified since login"], 1)

print("\n== rank filter ==")
API.ToggleUnverifiedRank("Initiate")
c = API.UnverifiedList(10); order = {} for i, x in ipairs(c) do order[i] = x.name end
check("Initiate off: only Member + Veteran offered", table.concat(order, ","), "Mid Member,Veteran Vic")
API.ToggleUnverifiedRank("Initiate")
check("Initiate back on", (API.UnverifiedList(10))[1].name, "Tater Toe")
SlashCmdList.OLYMPUSVERIFY("unverified member, VETERAN")
c = API.UnverifiedList(10); order = {} for i, x in ipairs(c) do order[i] = x.name end
check("/olv unverified member, VETERAN (case/space tolerant)", table.concat(order, ","), "Mid Member,Veteran Vic")
check("  and it says which ranks it kept", lastPrint("showing ") ~= nil, true)
SlashCmdList.OLYMPUSVERIFY("unverified nonsense")
check("unknown rank name resets the filter instead of hiding everyone", (API.UnverifiedList(10))[1].name, "Tater Toe")
SlashCmdList.OLYMPUSVERIFY("unverified all")
check("/olv unverified all", #(API.UnverifiedList(10)), 4)
check("filter survives in SavedVariables (the /reload that brings a new list)", type(OlympusVerifyDB.unverifiedExcluded), "table")

print("\n== the macro path ==")
SlashCmdList.OLYMPUSVERIFY("macrotest")
check("/olv macrotest creates OlvKick, disarmed", MACROS[1] and MACROS[1].body, "/olv unaimed")
check("  and records that macro editing works", OlympusVerifyDB.kickMacro, true)
SlashCmdList.OLYMPUSVERIFY("aim")
check("/olv aim points it at the top candidate", MACROS[1].body, "/guildremove Tater Toe")
PRINTS = {}
SlashCmdList.OLYMPUSVERIFY("unaimed")
check("pressing a disarmed macro only prints a reminder", lastPrint("is not aimed") ~= nil, true)

print("\n== the officer presses it: the server's system line ==")
local before = #OlympusVerifyDB.events
table.remove(ROSTER, 2)  -- Tater leaves the roster
onEvent(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Tater Toe-Forever has been kicked out of the guild by Fern Melder.")
local ev = OlympusVerifyDB.events[#OlympusVerifyDB.events]
check("a trusted 'removed' event is recorded", #OlympusVerifyDB.events, before + 1)
check("  reason = unverified", ev.reason, "unverified")
check("  ok = true, name without realm", ev.ok == true and ev.name == "Tater Toe", true)
check("  detail names who did it", ev.detail, "not verified, by Fern Melder")
check("macro disarmed after its target is gone", MACROS[1].body, "/olv unaimed")
check("next candidate moves up", (API.UnverifiedList(10))[1].name, "Lazy Larry")
before = #OlympusVerifyDB.events
onEvent(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Someone Else has been kicked out of the guild by Other Officer.")
check("a kick we did not aim records nothing here (the chat log carries it)", #OlympusVerifyDB.events, before)
onEvent(OlympusVerifyFrame, "CHAT_MSG_SYSTEM", "Lazy Larry has joined the guild.")
check("unrelated system lines are ignored", #OlympusVerifyDB.events, before)

print("\n== the panel ==")
local okUI, uiErr = pcall(function() OlympusVerifyUI.Show() end)
check("panel builds and shows", okUI, true); if not okUI then print(uiErr) end
local unv, fbtn, rows = nil, {}, {}
for _, f in ipairs(FRAMES) do
  if f.unverifiedToggle then unv = f end
  if f.rankFilter then table.insert(fbtn, f) end
  if f.kick then table.insert(rows, f) end
end
check("the Unverified toggle exists", unv ~= nil, true)
check("five rank-filter buttons, hidden until used", #fbtn == 5 and not fbtn[1]:IsShown(), true)
unv:Click()
local header; for _, fs in ipairs(FONTS) do if type(fs._text) == "string" and fs._text:find("Unverified|r", 1, true) then header = fs._text end end
check("header counts the removable", header and header:find("3 removable of", 1, true) ~= nil, true)
check("toggle now reads 'Close list'", unv._text, "Close list")
local labels = {} for _, b in ipairs(fbtn) do if b:IsShown() then table.insert(labels, (b._text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end end
check("filter shows non-protected ranks, lowest first, with counts", table.concat(labels, ","), "Initiate 1,Member 1,Veteran 1")
check("row 1 shows the top candidate", rows[1].name._text:find("Lazy Larry", 1, true) ~= nil, true)
check("row button offers to aim the macro", rows[1].kick._text, "Macro")
rows[1].kick:Click()
check("clicking it aims OlvKick at that member", MACROS[1].body, "/guildremove Lazy Larry")
OlympusVerifyUI.Refresh()
check("and the button then reads 'Aimed'", rows[1].kick._text, "Aimed")
fbtn[1]:Click()
check("clicking a filter button hides that rank", rows[1].name._text:find("Mid Member", 1, true) ~= nil, true)
fbtn[1]:Click()
unv:Click()
check("closing the list hides the filter bar", not fbtn[1]:IsShown(), true)
check("closing restores the toggle label", unv._text, "Unverified")

print("\n== degraded inputs ==")
local saved = OlympusQueue.unverified
OlympusQueue.unverified = nil
local _, _, e1 = API.UnverifiedList(5)
check("older watcher (no list in the file): says so, offers nobody", e1 and e1:find("no list yet", 1, true) ~= nil, true)
OlympusQueue.unverified = { firstSeenAvailable = false, members = { M("Veteran Vic", "Veteran", 2, nil, false, false) } }
local c2, i2 = API.UnverifiedList(5)
check("migration missing: nobody offered", #c2, 0)
check("  and the panel/print can say why", i2.noFirstSeen, true)
OlympusQueue.unverified = saved
check("the panel's refresh survives both", pcall(OlympusVerifyUI.Refresh), true)

print(string.format("\n%d/%d passed", tests - fails, tests))
os.exit(fails == 0 and 0 or 1)

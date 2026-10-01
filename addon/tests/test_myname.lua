-- 0.6.2 (27 Sep 2026): on the client Viktor ran that day UnitName("player") gives only the first part of a two-part
-- name ("Fern" for Fern Melder), and every note to self went to "Fern" -- "No player named 'Fern' is currently
-- playing." This plays that client: the whole name has to come from the guild roster (by GUID) or from a chat line of
-- our own, notes wait until one of them has answered, and nothing is ever whispered to the first part alone.
-- Run from this folder through run_lua_suites.py (LuaJIT via Lupa), or: lua5.1 test_myname.lua
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
local SECRET_MARK = {}
issecretvalue = function(v) return v == SECRET_MARK end

-- the 27 Sep client
UnitName = function(u) if u == "player" then return "Fern" end end
UnitFullName = function(u) if u == "player" then return "Fern", "ClassicBetaPvP2" end end
local ME, FIRST, GUID = "Fern Melder", "Fern", PLAYER_GUID
local SECRET = "harness-only-not-a-real-secret"
local OFFICER_ROW = { name = ME, guid = GUID, rank = "Officer", rankIndex = 1, level = 1, online = true }
local OTHER_ROW = { name = "Other Olga", guid = "Player-4613-00000001", rank = "Member", rankIndex = 4, level = 10, online = true }

local L
local function load(db)
  TIMERS, FILTERS = {}, {}
  ChatFrame_AddMessageEventFilter = function(ev, fn) FILTERS[ev] = FILTERS[ev] or {}; table.insert(FILTERS[ev], fn) end
  OlympusQueue = { version = 1, generatedAt = NOW, setGuildNote = false, entries = {} }
  OlympusVerifyConfig = { secret = SECRET, uiAutoShow = false }
  OlympusVerifyDB = db
  assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
  L = OlympusHmac
  local frame = OlympusVerifyFrame
  local onEvent = frame:GetScript("OnEvent")
  onEvent(frame, "ADDON_LOADED", "OlympusVerify")
  onEvent(frame, "PLAYER_LOGIN")
  return frame, onEvent
end
local function sentTo(from, who) local out = {} for i = from + 1, #WHISPERS do if WHISPERS[i].to == who then out[#out + 1] = WHISPERS[i].text end end return out end
local function hides(ev, msg, author) for _, fn in ipairs(FILTERS[ev] or {}) do if fn(nil, ev, msg, author) then return true end end return false end

print("\n== a login on the 27 Sep client, before the roster has arrived ==")
ROSTER = {}
local asks0 = ROSTER_ASKS
local w0 = #WHISPERS
local frame, onEvent = load({ lastCharacter = FIRST, addonVersion = "0.6.1" })  -- what 0.6.1 left in SavedVariables
local db = OlympusVerifyDB
check("the first part left by 0.6.1 is not carried over as the character", db.lastCharacter, nil)
check("  the GUID is recorded for the watcher at once", db.lastCharacterGuid, GUID)
check("  what the client calls the player is on record", db.diag and db.diag.name and db.diag.name.UnitName, "string Fern | nil")
check("  and nothing resolved yet", db.diag.name.resolved, nil)
later(7)
check("the login note is not sent while the whole name is unknown", #WHISPERS - w0, 0)
check("  the roster is asked for", ROSTER_ASKS > asks0, true)
onEvent(frame, "CHAT_MSG_SYSTEM", "New Nora has joined the guild.")
check("a join meanwhile writes nothing yet", #WHISPERS - w0, 0)
check("  it waits instead", #OlympusVerifyAPI.Name.Pending(), 1)
SlashCmdList.OLYMPUSVERIFY("logtest")
check("/olv logtest refuses to guess", #WHISPERS - w0, 0)
check("  and says why", lastPrint("not known yet") ~= nil, true)

print("\n== the roster arrives and names us ==")
ROSTER = { OTHER_ROW, OFFICER_ROW }
onEvent(frame, "GUILD_ROSTER_UPDATE")
local mine = sentTo(w0, ME)
check("two notes go to the whole name", #mine, 2)
check("  first the login note, naming the whole name, its MAC over that name", mine[1],
  string.format("Olympus: relay %s is in the world (addon %s, ref OLVr-%s)", ME, "0.4.0", L.relayToken(SECRET, ME, "0.4.0", L.utcDay(NOW))))
check("  then the join that waited", mine[2], "Olympus: New Nora joined the guild (ref OLVj-" .. L.joinToken(SECRET, "New Nora", L.utcDay(NOW)) .. ")")
check("SavedVariables now names the whole name", db.lastCharacter, ME)
check("nothing is left waiting", #OlympusVerifyAPI.Name.Pending(), 0)
local w1 = #WHISPERS
onEvent(frame, "GUILD_ROSTER_UPDATE")
check("a later roster update sends nothing again", #WHISPERS - w1, 0)
check("the incoming copy of a note from the whole name is hidden", hides("CHAT_MSG_WHISPER", mine[1], ME), true)
check("  the sent half is not", hides("CHAT_MSG_WHISPER_INFORM", mine[1], ME), false)
check("  the same text from the first part alone is shown", hides("CHAT_MSG_WHISPER", mine[1], FIRST), false)

print("\n== once known, notes go out straight away ==")
later(40)
local w2 = #WHISPERS
local tg = L.ticketFor(SECRET, "Q7M", L.utcDay(NOW))
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. tg, "Guid Gail", "", "", "", "", 0, 0, "", 0, 77, "Player-4613-0ABCDEF1")
check("an identity note goes to the whole name", sentTo(w2, ME)[1],
  "Olympus: Guid Gail is Player-4613-0ABCDEF1 (ref OLVg-" .. L.guidToken(SECRET, "Guid Gail", "Player-4613-0ABCDEF1", L.utcDay(NOW)) .. ")")
local w3 = #WHISPERS
SlashCmdList.OLYMPUSVERIFY("logtest")
check("/olv logtest whispers the whole name", sentTo(w3, ME)[1], "Olympus log test OLVDIAG flush " .. NOW)
check("  and asks for a minute before any /reload", lastPrint("before any /reload") ~= nil, true)
SlashCmdList.OLYMPUSVERIFY("diag")
check("/olv diag says where notes go and from which source", lastPrint("notes to self go to Fern Melder (from the guild roster)") ~= nil, true)
onEvent(frame, "PLAYER_LOGOUT")
check("at logout the record says which source named us", db.diag.name.resolved == ME and db.diag.name.via == "roster", true)
check("nothing, all session, went to the first part alone", #sentTo(w0, FIRST), 0)

print("\n== no roster entry for us: a whisper to ourselves names us ==")
ROSTER = { OTHER_ROW }
local w4 = #WHISPERS
frame, onEvent = load(nil)
later(7)
check("nothing sent without a name", #WHISPERS - w4, 0)
onEvent(frame, "CHAT_MSG_GUILD", "evening all", ME, "", "", "", "", 0, 0, "", 0, 7, GUID)
onEvent(frame, "CHAT_MSG_GUILD", "from discord", "Viktor", "", "", "", "", 0, 0, "", 0, 8, GUID, nil, nil, nil, nil, nil, { userID = 1 })
check("guild chat teaches nothing (a Discord-bridged line could carry our GUID)", #WHISPERS - w4 == 0 and OlympusVerifyAPI.Name.Mine() == nil, true)
onEvent(frame, "CHAT_MSG_WHISPER", "hello", "Other Olga", "", "", "", "", 0, 0, "", 0, 5, OTHER_ROW.guid)
check("somebody else's whisper teaches nothing", #sentTo(w4, ME) + #sentTo(w4, FIRST), 0)
local okSecret = pcall(onEvent, frame, "CHAT_MSG_WHISPER", SECRET_MARK, SECRET_MARK, "", "", "", "", 0, 0, "", 0, 6, SECRET_MARK)
check("a whisper the client will not let us read raises nothing", okSecret and #sentTo(w4, ME) + #sentTo(w4, FIRST) == 0, true)
onEvent(frame, "CHAT_MSG_WHISPER", "hi", FIRST, "", "", "", "", 0, 0, "", 0, 9, GUID)
check("a sender shown by the first part alone is not taken", OlympusVerifyAPI.Name.Mine(), nil)
onEvent(frame, "CHAT_MSG_WHISPER", "hi", ME, "", "", "", "", 0, 0, "", 0, 10, GUID)
local rn = sentTo(w4, ME)
check("a whisper to ourselves names us, and the login note goes out", #rn == 1 and rn[1]:find("^Olympus: relay Fern Melder is in the world") ~= nil, true)
check("  recorded as learned from that whisper", OlympusVerifyAPI.Name.Via(), "chat")
ROSTER = { OTHER_ROW, OFFICER_ROW }
onEvent(frame, "GUILD_ROSTER_UPDATE")
check("once the roster lists us, it is the source", OlympusVerifyAPI.Name.Mine() == ME and OlympusVerifyAPI.Name.Via() == "roster", true)
check("nothing went to the first part alone", #sentTo(w4, FIRST), 0)

print("\n== the roster is searched again only after it changes ==")
ROSTER = { OTHER_ROW }
local calls = 0
local realInfo = GetGuildRosterInfo
GetGuildRosterInfo = function(i) calls = calls + 1 return realInfo(i) end
frame, onEvent = load(nil)
local afterLogin = calls
for _ = 1, 5 do hides("CHAT_MSG_WHISPER", "Olympus: x (ref OLVr-0000000000)", "Some Body") end
check("the chat filter, while we are unlisted, does not search the roster each time", calls - afterLogin, 0)
onEvent(frame, "GUILD_ROSTER_UPDATE")
local afterUpdate = calls
for _ = 1, 5 do hides("CHAT_MSG_WHISPER", "Olympus: x (ref OLVr-0000000000)", "Some Body") end
check("  after a roster update it searches once more, not five times", calls - afterUpdate, #ROSTER)
GetGuildRosterInfo = realInfo

print("\n== an unreadable GUID: no roster match, never the first part ==")
local realGuid = UnitGUID
UnitGUID = function() return SECRET_MARK end
ROSTER = { OTHER_ROW, OFFICER_ROW }
local w5 = #WHISPERS
frame, onEvent = load(nil)
later(7)
onEvent(frame, "GUILD_ROSTER_UPDATE")
check("nothing is sent", #WHISPERS - w5, 0)
check("  and SavedVariables names nobody", OlympusVerifyDB.lastCharacter == nil and OlympusVerifyDB.lastCharacterGuid == nil, true)
UnitGUID = realGuid

print("\n== the 17 Sep client, whose UnitName gave the whole name ==")
UnitName = function(u) if u == "player" then return ME end end
ROSTER = {}
local w6 = #WHISPERS
frame, onEvent = load(nil)
later(7)
check("with no roster yet, a two-part UnitName is used as it is", #sentTo(w6, ME), 1)
check("  and said so", OlympusVerifyAPI.Name.Via(), "UnitName")

print(string.format("\n%d/%d passed", tests - fails, tests))
if fails > 0 then os.exit(1) end

-- 0.6.4: reserved names at the top of the queue, and the roster window with Discord names. Loads the real addon files
-- in TOC order against the mocked client. Run from this folder: lua5.1 test_roster.lua (or run_lua_suites.py).
-- Uses a made-up secret; never point it at Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = (want == nil) and (got ~= nil and got ~= false) or (got == want)
  if not ok then fails = fails + 1 end
  print(string.format("%s %-72s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function plain(s) return (tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
local INVITES = {}
C_GuildInfo.Invite = function(name) INVITES[#INVITES + 1] = name end
RAID_CLASS_COLORS = { PRIEST = { r = 1, g = 1, b = 1, colorStr = "ffffffff" }, MAGE = { r = 0.25, g = 0.78, b = 0.92, colorStr = "ff3fc7eb" } }

-- ---- the guild, and the file the watcher wrote ----
ROSTER = {
  { name = "Fern Melder", rank = "Guild Master", rankIndex = 0, level = 60, online = true, class = "PRIEST", guid = "Player-1-A" },
  { name = "Grace Hope", rank = "Member", rankIndex = 3, level = 42, away = 2, class = "MAGE", guid = "Player-1-B" },
  { name = "Renamed Rita", rank = "Member", rankIndex = 3, level = 30, away = 1, class = "MAGE", guid = "Player-1-C" },  -- linked as "Old Rita"
  { name = "Pending Pat", rank = "Initiate", rankIndex = 4, level = 3, away = 9, class = "WARRIOR", guid = "Player-1-D" },
  { name = "Plain Paul", rank = "Initiate", rankIndex = 4, level = 5, away = 30, class = "WARRIOR", guid = "Player-1-E" },
  { name = "Newbie Nell", rank = "Initiate", rankIndex = 4, level = 1, online = true, class = "PRIEST", guid = "Player-1-F" },   -- joined after the lists
}
local T = NOW
OlympusQueue = {
  version = 1, generatedAt = T, setGuildNote = false,
  entries = {
    { id = 11, character = "Early Bird", discordId = "1", note = "", position = 2, lastReason = "", priority = 0 },
    { id = 12, character = "Late Comer", discordId = "2", note = "", position = 3, lastReason = "" },           -- an older watcher: no priority
    { id = 30, character = "Reserved Rose", discordId = "3", note = "", position = 1, lastReason = "", priority = 1 },
  },
  unverified = { fetchedAt = T, snapshotAt = T, graceDays = 3, verifyOpenSince = T, firstSeenAvailable = true, openTickets = 0, ranks = {},
    members = {
      { name = "Pending Pat", rank = "Initiate", rankIndex = 4, level = 3, firstSeen = T - 86400, eligibleAt = T + 86400, pending = true },
      { name = "Plain Paul", rank = "Initiate", rankIndex = 4, level = 5, firstSeen = T - 9 * 86400, eligibleAt = T - 86400, pending = false },
    } },
  verified = { fetchedAt = T - 600, members = {
    { name = "Fern Melder", guid = "Player-1-A", status = "member", discordId = "472099715253796864", username = "fernmelder", displayName = "Fern" },
    { name = "Grace Hope", guid = "", status = "member", discordId = "300000000000000007", username = "grace_new", displayName = "" },
    { name = "Old Rita", guid = "Player-1-C", status = "member", discordId = "300000000000000009", username = "rita", displayName = "Rita the Red" },
  } },
}
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret" }
OlympusVerifyDB = nil

local okLoad, err = pcall(function()
  assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerifyPreview.lua"))("OlympusVerify", {})
  assert(loadfile("../OlympusVerify/OlympusVerifyRoster.lua"))("OlympusVerify", {})
end)
check("all five files load in TOC order", okLoad, true)
if not okLoad then print(err) os.exit(1) end
local onEvent = OlympusVerifyFrame:GetScript("OnEvent")
check("ADDON_LOADED + PLAYER_LOGIN run", pcall(function() onEvent(OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify"); onEvent(OlympusVerifyFrame, "PLAYER_LOGIN") end), true)
local API = OlympusVerifyAPI

print("\n== reserved names go first ==")
local byName = {}
for _, q in ipairs(OlympusVerifyDB.queue) do byName[q.name] = q end
check("merged rows carry the Worker's priority", byName["Reserved Rose"] and byName["Reserved Rose"].priority, 1)
check("  an entry from an older watcher reads as 0", byName["Late Comer"] and byName["Late Comer"].priority, 0)
OlympusVerify_Flush()
check("the next invite (no presence checks) is the reserved name, not the oldest row", INVITES[1], "Reserved Rose")
OlympusVerify_Flush()
check("  then the Worker's order", INVITES[2], "Early Bird")
-- The Worker moves Late Comer to the front (their name was approved on the site after they verified): a re-merge carries it.
OlympusQueue.entries[2].priority = 1
SlashCmdList.OLYMPUSVERIFY("merge")
check("a changed priority on a known row is picked up by the merge", byName["Late Comer"].priority, 1)
OlympusVerifyUI.Show()
local first
for _, frame in ipairs(FRAMES) do
  if frame._parent == OlympusVerifyPanel and frame.invite and frame.entry and frame._point and frame._point[5] == -200 then first = frame end
end
check("the panel lists the reserved row first", first and first.entry and first.entry.name, "Late Comer")
check("  and marks it Reserved in the source column", first and plain(first.source._text), "Reserved")
local tipTitle, tipLines = nil, nil
GameTooltip._lines = {}
first:GetScript("OnEnter")(first)
local tip = plain(table.concat(GameTooltip._lines or {}, " "))
check("  its tooltip says why it is first", tip:find("Reserved name", 1, true) ~= nil, true)
first:GetScript("OnLeave")(first)
check("the panel has a Members button", OlympusVerifyUI.membersButton ~= nil, true)
-- The Worker replaced Late Comer's row (they verified, say): same name, new id. The row stays, under the new id.
OlympusQueue.entries[2].id = 13
local printedBefore = #PRINTS
SlashCmdList.OLYMPUSVERIFY("merge")
local lateRows, lateId = 0, nil
for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Late Comer" then lateRows = lateRows + 1 lateId = q.id end end
check("a replaced Worker row keeps its place: one row, under the new id", lateRows == 1 and lateId == 13, true)
local saidWithdrawn = false
for i = printedBefore + 1, #PRINTS do if tostring(PRINTS[i]):find("withdrawn", 1, true) then saidWithdrawn = true end end
check("  and the merge does not report it withdrawn", saidWithdrawn, false)
-- Someone else proved the name in game: the Worker keeps the row and changes its owner, and the merge follows.
OlympusQueue.entries[2].discordId = "22"
SlashCmdList.OLYMPUSVERIFY("merge")
local lateOwner
for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == "Late Comer" then lateOwner = q.discordId end end
check("a row taken over in place follows its new Discord owner", lateOwner, "22")

print("\n== the roster's data ==")
local list, info = API.Roster.Members()
local m = {}
for _, x in ipairs(list) do m[x.name] = x end
check("every roster member is listed", #list, 6)
check("linked by name: verified with Discord names", m["Grace Hope"].status == "verified" and m["Grace Hope"].discord == "grace_new", true)
check("  an empty display name reads as none", m["Grace Hope"].display, nil)
check("linked by GUID: a renamed character keeps its Discord", m["Renamed Rita"].status == "verified" and m["Renamed Rita"].discord == "rita" and m["Renamed Rita"].display == "Rita the Red", true)
check("a code out: verifying", m["Pending Pat"].status, "pending")
check("on the unverified list: not verified", m["Plain Paul"].status, "unverified")
check("in neither list (joined since): not in list", m["Newbie Nell"].status, "unknown")
check("summary counts", string.format("%d/%d/%d/%d/%d", info.total, info.verified, info.pending, info.unverified, info.unknown), "6/3/1/1/1")
check("  with the list's date and the ranks, highest first", info.hasNames and info.listAt == T - 600 and info.ranks[1].rank == "Guild Master", true)
-- A display name with WoW escape codes in it (|c colour, |T texture) is drawn as written, not interpreted.
OlympusQueue.verified.members[3].displayName = "Rita |cffff0000Red|r |TInterface\\Icons\\X:0|t\nTwo"
local esc = {}
for _, x in ipairs((API.Roster.Members())) do esc[x.name] = x end
check("a \"|\" in a Discord name is doubled, so the client shows it as text", esc["Renamed Rita"].display, "Rita ||cffff0000Red||r ||TInterface\\Icons\\X:0||t Two")
check("  and search still finds it by the doubled pipe an edit box gives", #API.Roster.Filter({ esc["Renamed Rita"] }, { text = "red||r" }), 1)
OlympusQueue.verified.members[3].displayName = "Rita the Red"

print("\n== filter and sort ==")
local names = function(l) local o = {} for _, x in ipairs(l) do o[#o + 1] = x.name end return table.concat(o, ",") end
check("text matches a Discord username", names(API.Roster.Filter(list, { text = "GRACE_" })), "Grace Hope")
check("text matches a display name", names(API.Roster.Filter(list, { text = "the red" })), "Renamed Rita")
check("status 'not' = everyone not verified", names(API.Roster.Sort(API.Roster.Filter(list, { status = "not" }), "name")), "Newbie Nell,Pending Pat,Plain Paul")
check("rank filter", #API.Roster.Filter(list, { rank = "Member" }), 2)
check("class filter", names(API.Roster.Sort(API.Roster.Filter(list, { class = "PRIEST" }), "name")), "Fern Melder,Newbie Nell")
check("online only", names(API.Roster.Sort(API.Roster.Filter(list, { online = true }), "name")), "Fern Melder,Newbie Nell")
check("sort by Discord name puts the blanks last", names(API.Roster.Sort(API.Roster.Filter(list, {}), "discord")), "Fern Melder,Grace Hope,Renamed Rita,Newbie Nell,Pending Pat,Plain Paul")
check("  and reversed, the blanks stay last", names(API.Roster.Sort(API.Roster.Filter(list, {}), "discord", true)), "Renamed Rita,Grace Hope,Fern Melder,Newbie Nell,Pending Pat,Plain Paul")
check("sort by status: verified, verifying, not verified, not in list", names(API.Roster.Sort(API.Roster.Filter(list, {}), "status")), "Fern Melder,Grace Hope,Renamed Rita,Pending Pat,Plain Paul,Newbie Nell")
check("sort by last seen: online first, then the most recent", names(API.Roster.Sort(API.Roster.Filter(list, {}), "seen")), "Fern Melder,Newbie Nell,Renamed Rita,Grace Hope,Pending Pat,Plain Paul")

print("\n== the window ==")
SlashCmdList.OLYMPUSVERIFY("members grace")
local W = OlympusVerifyRoster
check("/olv members opens the window with the search filled in", W.frame and W.frame:IsShown() and W.view.text == "grace", true)
check("  the placeholder belongs to the search box (drawn above its backdrop)", W.search.hint and W.search.hint._parent == W.search, true)
check("  and is hidden while the box has text", W.search.hint:IsShown(), false)
local shownRows = {}
for _, frame in ipairs(FRAMES) do if frame._parent == W.frame and frame.cells and frame._shown then shownRows[#shownRows + 1] = frame end end
check("  one row for the one match", #shownRows, 1)
check("  showing the Discord username", plain(shownRows[1] and shownRows[1].cells.discord._text), "@grace_new")
check("  and 'verified'", plain(shownRows[1] and shownRows[1].cells.status._text), "verified")
W.search:SetText(""); W.search:GetScript("OnTextChanged")(W.search)
local all = 0
for _, frame in ipairs(FRAMES) do if frame._parent == W.frame and frame.cells and frame._shown then all = all + 1 end end
check("clearing the search shows everyone", all, 6)
W.Toggle()
check("Toggle closes it", W.frame:IsShown(), false)
check("Escape closes it too (UISpecialFrames)", (function() for _, n in ipairs(UISpecialFrames) do if n == "OlympusVerifyRosterFrame" then return true end end return false end)(), true)
local before = 0
for _, x in ipairs(INVITES) do before = before + 1 end
OlympusVerifyUI.membersButton:Click()
check("the panel's Members button opens it", W.frame:IsShown(), true)
check("  and the window changes nothing: no invite, no whisper", #INVITES == before and #WHISPERS == 0, true)

print("\n== an older Worker: no verified list ==")
OlympusQueue.verified = nil
list, info = API.Roster.Members()
check("no Discord names, and the window says so", info.hasNames, false)
W.Show()
check("  footer explains where names come from", plain(W.frame and select(1, (function() for _, fs in ipairs(FONTS) do if fs._parent == W.frame and plain(fs._text):find("No Discord names yet", 1, true) then return true end end return false end)())), "true")

print(string.format("\n%d/%d passed", tests - fails, tests))
os.exit(fails == 0 and 0 or 1)

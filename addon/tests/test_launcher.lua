-- Real addon launcher, synthetic client only. No real Config.lua or client files.
dofile("wow_mock.lua")
local failures, total = 0, 0
local function check(label, value, expected)
  total = total + 1
  local ok = value == expected
  if not ok then failures = failures + 1 end
  print(string.format("%s %s%s", ok and "ok  " or "FAIL", label,
    ok and "" or (" (got " .. tostring(value) .. ", expected " .. tostring(expected) .. ")")))
end
local function plain(text) return tostring(text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "") end
local function includes(text, part) return plain(text):find(part, 1, true) ~= nil end
local actions = { invites = 0, kicks = 0, notes = 0 }
C_GuildInfo.Invite = function() actions.invites = actions.invites + 1 end
C_GuildInfo.Uninvite = function() actions.kicks = actions.kicks + 1 end
C_GuildInfo.SetNote = function() actions.notes = actions.notes + 1 end
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret", checkBeforeInvite = false, uiAutoShow = false, setNotes = false }
OlympusVerifyDB = { ui = { launcher = { point = "TOPLEFT", relPoint = "TOPLEFT", x = 72, y = -88 } } }
OlympusQueue = { version = 1, generatedAt = NOW, entries = {} }
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
local frame, button = OlympusVerifyFrame, OlympusVerifyButton
local onEvent = frame:GetScript("OnEvent")
onEvent(frame, "ADDON_LOADED", "OlympusVerify")
onEvent(frame, "PLAYER_LOGIN")
check("launcher is clamped to the screen", button._clamped, true)
check("custom launcher owns a visible font string", type(button:GetFontString()), "table")
check("custom launcher explicitly assigns its native font", button:GetFontString()._template, "GameFontHighlight")
check("launcher restores saved anchor after SavedVariables are available", button._point[1], "TOPLEFT")
check("launcher restores saved x coordinate", button._point[4], 72)
check("launcher restores saved y coordinate", button._point[5], -88)
check("idle launcher stays hidden", button:IsShown(), false)

local q = { id = 1, name = "Synthetic Applicant", target = "Synthetic Applicant", source = "worker", status = "queued", ts = NOW, at = NOW }
OlympusVerifyDB.queue = { q }
frame:UpdateButton()
check("queued applicant shows launcher", button:IsShown(), true)
check("normal label has compact singular invite count", includes(button._text, "1 invite queued"), true)
check("normal launcher width is bounded", button._w >= 300 and button._w <= 440, true)
check("launcher font has a width bound within its button", button:GetFontString():GetWidth() > 0 and button:GetFontString():GetWidth() < button:GetWidth(), true)
local enter, leave = button:GetScript("OnEnter"), button:GetScript("OnLeave")
check("launcher has a hover explanation", type(enter), "function")
enter(button)
check("tooltip is owned by the launcher", GameTooltip._owner, button)
check("tooltip explains left click", includes(table.concat(GameTooltip._lines, " "), "Left-click"), true)
check("tooltip explains right click", includes(table.concat(GameTooltip._lines, " "), "Right-click"), true)
leave(button)
check("leaving launcher hides tooltip", GameTooltip:IsShown(), false)
button:Click("RightButton")
check("right click opens officer panel", OlympusVerifyPanel:IsShown(), true)
OlympusVerifyUI.Refresh()
frame:UpdateButton()
check("opening, refresh and hover sent no invites", actions.invites, 0)
check("opening, refresh and hover removed nobody", actions.kicks, 0)
check("opening, refresh and hover wrote no notes", actions.notes, 0)
check("opening, refresh and hover sent no whispers", #WHISPERS, 0)
check("opening, refresh and hover preserve the queued entry", OlympusVerifyDB.queue[1], q)
button:Click("RightButton")
check("second right click hides officer panel", OlympusVerifyPanel:IsShown(), false)

button:ClearAllPoints()
button:SetPoint("BOTTOMRIGHT", UIParent, "BOTTOMRIGHT", -42, 91)
button:GetScript("OnDragStop")(button)
check("drag saves anchor", OlympusVerifyDB.ui.launcher.point, "BOTTOMRIGHT")
check("drag saves x coordinate", OlympusVerifyDB.ui.launcher.x, -42)
check("drag saves y coordinate", OlympusVerifyDB.ui.launcher.y, 91)
frame:UpdateButton()
check("refresh keeps newly dragged anchor", button._point[1], "BOTTOMRIGHT")
check("drag sends no invites", actions.invites, 0)
button:GetScript("OnDragStart")(button)
button:ClearAllPoints()
button:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 35, 77)
OlympusVerifyDB.queue = {}
frame:UpdateButton()
check("hiding during a drag stops movement", button._moving, false)
check("hiding during a drag saves its final position", OlympusVerifyDB.ui.launcher.x == 35 and OlympusVerifyDB.ui.launcher.y == 77, true)
check("saved placement avoids a competing client layout flag", button._userPlaced, false)
OlympusVerifyDB.queue = { q }
frame:UpdateButton()

OlympusVerifyDB.roster.total = 1000
frame:UpdateButton()
check("full guild gets distinct launcher label", includes(button._text, "Guild full"), true)
enter(button)
check("full guild tooltip describes fallback invite behavior", includes(table.concat(GameTooltip._lines, " "), "attempt the next invite"), true)
OlympusVerifyDB.queue[2] = { id = 2, name = "Second Synthetic Applicant", status = "queued", ts = NOW }
frame:UpdateButton()
check("open tooltip refreshes when the queue changes", includes(table.concat(GameTooltip._lines, " "), "2 applicants waiting"), true)
OlympusVerifyDB.queue[2] = nil
frame:UpdateButton()
check("open tooltip drops stale applicant count", includes(table.concat(GameTooltip._lines, " "), "1 applicant waiting") and not includes(table.concat(GameTooltip._lines, " "), "2 applicants waiting"), true)
check("full label remains bounded", button._w <= 440, true)
button:GetFontString():SetFont("mock-font", 1000)
frame:UpdateButton()
check("exceptionally wide measured text cannot expand launcher past cap", button._w, 440)
button:GetFontString():SetFont("mock-font", 12)
OlympusVerifyDB.roster.total = 0
frame:UpdateButton()
button:Click("LeftButton")
check("left click sends exactly one invite", actions.invites, 1)
check("left click never removes a member", actions.kicks, 0)
check("left click never writes a note when notes are off", actions.notes, 0)
check("no pending work hides launcher after invite", button:IsShown(), false)
print(string.format("\n%d/%d passed", total - failures, total))
os.exit(failures == 0 and 0 or 1)

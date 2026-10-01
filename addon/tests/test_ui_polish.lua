-- UI layout contracts with synthetic records and instrumented action methods.
-- Font metrics in wow_mock.lua are synthetic: this is not client rendering evidence.
dofile("wow_mock.lua")
local failures, total, actions = 0, 0, 0
local function check(label, value, expected)
  total = total + 1
  local ok = value == expected
  if not ok then failures = failures + 1 end
  print(string.format("%s %s%s", ok and "ok  " or "FAIL", label,
    ok and "" or (" (got " .. tostring(value) .. ", expected " .. tostring(expected) .. ")")))
end
local function plain(text) return tostring(text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "") end
local function contains(text, fragment) return plain(text):find(fragment, 1, true) ~= nil end
local function validUTF8(text)
  local i = 1
  while i <= #text do
    local b, n = text:byte(i), 1
    if b < 128 then n = 1 elseif b >= 194 and b <= 223 then n = 2 elseif b >= 224 and b <= 239 then n = 3 elseif b >= 240 and b <= 244 then n = 4 else return false end
    for j = 1, n - 1 do local c = text:byte(i + j); if not c or c < 128 or c > 191 then return false end end
    i = i + n
  end
  return true
end
local function hover(widget)
  GameTooltip._text, GameTooltip._lines = "", {}
  local script = widget and widget:GetScript("OnEnter")
  if script then script(widget) end
  return plain(GameTooltip._text) .. " " .. plain(table.concat(GameTooltip._lines or {}, " "))
end
local function tooltipText() return plain(GameTooltip._text) .. " " .. plain(table.concat(GameTooltip._lines or {}, " ")) end
local function bounded(widget)
  return widget and ((widget._w and widget._w > 0) or #(widget._points or {}) >= 2) and true or false
end
-- Resolve the real widget anchors, independently of the UI file's layout constants.
local anchors = { TOPLEFT = {0, 0}, TOP = {.5, 0}, TOPRIGHT = {1, 0}, LEFT = {0, .5}, CENTER = {.5, .5}, RIGHT = {1, .5}, BOTTOMLEFT = {0, 1}, BOTTOM = {.5, 1}, BOTTOMRIGHT = {1, 1} }
local function rect(widget)
  if widget == UIParent then return { x = 0, y = 0, w = widget:GetWidth(), h = widget:GetHeight() } end
  local point = assert(widget._point, "widget has no recorded anchor")
  local target = rect(point[2])
  local at, own = anchors[point[3]], anchors[point[1]]
  local width, height = widget:GetWidth(), widget:GetHeight()
  return { x = target.x + target.w * at[1] + point[4] - width * own[1], y = target.y + target.h * at[2] - point[5] - height * own[2], w = width, h = height }
end
local function separated(left, right)
  local a, b = rect(left), rect(right)
  return a.x + a.w <= b.x
end
local tickers = {}
C_Timer.NewTicker = function(_, fn) tickers[#tickers + 1] = fn; return { Cancel = function() end } end
local state = {
  version = "0.5.0", secret = true, chatLogging = true, flushLog = true, notes = false,
  queued = 0, queue = {}, events = {}, rosterCount = 952, rosterTotal = 952, rosterAt = NOW - 120,
  queueFileAt = NOW - 45, queueFileEntries = 0, guildCap = 1000, alertUntil = 0,
  kickMacroName = "OlvKick", kickCommand = "/guildremove", removeVia = "macro", offlineRule = "offline eligibility rule",
}
local pc = { filtering = false, ready = 0, unchecked = 0, checking = 0, offline = 0, guilded = 0 }
local candidates = {}
OlympusVerifyConfig = { uiAutoShow = false }
OlympusVerifyDB = {}
OlympusVerifyAPI = {
  Status = function() return state end,
  PresenceCounts = function() return pc end,
  PresenceOf = function(q) return "ready", { level = 60, what = "Human Paladin", zone = "The Hinterlands - very long synthetic zone name" } end,
  Candidates = function() return candidates end,
  UnverifiedList = function() return candidates, { offered = #candidates, inGuild = 99 } end,
  UnverifiedRanks = function() return { { rank = "Initiate", offered = #candidates, protected = false } } end,
  UnverifiedExcluded = function() return {} end,
  When = function() return "a synthetic future date" end,
}
for _, name in ipairs({ "Flush", "Check", "Remove", "ClearQueue", "ExportRoster", "FlushChatLog", "PointKickMacro", "RemoveMember", "ToggleUnverifiedRank", "Sync" }) do
  OlympusVerifyAPI[name] = function() actions = actions + 1 end
end
assert(loadfile("../OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
local UI = OlympusVerifyUI
UI.Show()
local panel = OlympusVerifyPanel
check("opening empty panel performs no action", actions, 0)
check("panel stays clamped", panel._clamped, true)
local escaped = 0
for _, name in ipairs(UISpecialFrames) do if name == "OlympusVerifyPanel" then escaped = escaped + 1 end end
check("Escape registers exactly one panel", escaped, 1)
check("title has a bounded layout region", bounded(UI.title), true)
check("title leaves room for its alert badge", separated(UI.title, UI.newBadge), true)
check("alert badge ends before the version field", separated(UI.newBadge, UI.version), true)
check("queue header ends before the Check control", separated(UI.queueHeader, UI.checkButton), true)
check("Check and Unverified controls have separate bounds", separated(UI.checkButton, UI.unvButton), true)
check("toolbar actions have separate bounds", separated(UI.sendButton, UI.exportButton) and separated(UI.exportButton, UI.flushButton) and separated(UI.flushButton, UI.clearButton), true)
check("0.6.4 Members button fits between Flush chat log and Clear queue", separated(UI.flushButton, UI.membersButton) and separated(UI.membersButton, UI.clearButton), true)
check("custom primary action owns its assigned font string", UI.sendButton:GetFontString(), UI.sendButton.label)
local title = plain(UI.title._text)
local rows = {}
for _, frame in ipairs(FRAMES) do if frame._parent == panel and frame.invite then rows[#rows + 1] = frame end end
check("empty queue has no visible applicant rows", (function() for _, r in ipairs(rows) do if r:IsShown() then return false end end return true end)(), true)
local ghosts, ghostCount = {}, 0
for _, texture in ipairs(TEXTURES) do
  if texture._parent == panel and texture._w == rows[1]._w and texture._h == rows[1]._h then
    for i, row in ipairs(rows) do
      if texture._point and row._point and texture._point[4] == row._point[4] and texture._point[5] == row._point[5] then ghosts[i] = texture; ghostCount = ghostCount + 1 end
    end
  end
end
check("empty queue has four alternate placeholder slots", ghostCount, 4)
check("empty placeholder slots are visible", (function() for _, texture in pairs(ghosts) do if not texture:IsShown() then return false end end return true end)(), true)

for i = 1, 20 do
  -- The old 21-byte substring bisected the eleventh accented character.
  state.queue[i] = { id = i, name = string.rep("É", 11) .. string.format(" Forêt %02d", i), status = "queued", ts = NOW - i * 60, source = "worker", position = i }
end
state.queued, state.oldestQueuedAt, state.alertUntil = 20, NOW - 4 * 86400, NOW + 30
local fullServerDetail = string.rep("Synthetic server explanation; ", 8) .. "important final reason."
state.events = { { type = "invite", name = "Synthetic Applicant", ok = false, ts = NOW, detail = fullServerDetail } }
pc.filtering, pc.ready = true, 20
UI.Refresh()
local populatedTitle = plain(UI.title._text)
check("queue counts and age stay out of the bounded title", contains(populatedTitle, title) and not contains(populatedTitle, "ready") and not contains(populatedTitle, "waiting") and not contains(populatedTitle, "oldest"), true)
check("visible row count fits fixed page", #rows, 8)
check("placeholders are hidden beneath every populated row", (function() for _, texture in pairs(ghosts) do if texture:IsShown() then return false end end return true end)(), true)
check("first visible entry is the first queued applicant", rows[1] and rows[1].entry, state.queue[1])
for i, r in ipairs(rows) do
  check("row " .. i .. " name preserves valid UTF-8", validUTF8(plain(r.name._text)), true)
end
check("row hover reveals full untruncated character name", contains(hover(rows[1]), state.queue[1].name), true)
check("row hover reveals full status location", contains(hover(rows[1]), "The Hinterlands - very long synthetic zone name"), true)
local eventRow
for _, frame in ipairs(FRAMES) do if frame.event == state.events[1] then eventRow = frame end end
check("event hover preserves the complete server explanation", contains(hover(eventRow), fullServerDetail), true)
local retainedEvents = state.events
for _, example in ipairs({
  { type = "guild_full", ok = false, phrase = "Guild full: an invite was refused" },
  { type = "removed", name = "Synthetic Member", ok = true, phrase = "removed from the guild" },
  { type = "removed", name = "Synthetic Member", ok = false, phrase = "removal failed" },
  { type = "notice", name = "Synthetic Applicant", ok = true, phrase = "notice whispered" },
  { type = "notice", name = "Synthetic Applicant", ok = false, phrase = "notice not sent" },
}) do
  local event = { type = example.type, name = example.name, ok = example.ok, ts = NOW, detail = fullServerDetail }
  state.events = { event }
  UI.Refresh()
  local feed
  for _, frame in ipairs(FRAMES) do if frame.event == event then feed = frame end end
  check(example.type .. " " .. tostring(example.ok) .. " feed uses readable wording", feed and contains(feed.text._text, example.phrase) and not contains(feed.text._text, "?:"), true)
  check(example.type .. " " .. tostring(example.ok) .. " hover retains full detail", contains(hover(feed), fullServerDetail), true)
end
state.events = retainedEvents
UI.Refresh()

local originalCenter, originalEffective = rawget(rows[1], "GetCenter"), rawget(rows[1], "GetEffectiveScale")
for _, example in ipairs({
  { x = 1700, scale = 1, uiScale = 1, side = "ANCHOR_LEFT", label = "right-half owner" },
  { x = 300, scale = 1, uiScale = 1, side = "ANCHOR_RIGHT", label = "left-half owner" },
  { x = 1500, scale = 0.5, uiScale = 1, side = "ANCHOR_RIGHT", label = "scaled owner moves into left screen half" },
  { x = 800, scale = 1, uiScale = 0.75, side = "ANCHOR_LEFT", label = "UIParent effective scale changes screen midpoint" },
  { x = 1400, scale = 0.5, uiScale = 0.75, side = "ANCHOR_RIGHT", label = "both scales compared in screen units" },
  { scale = 1, uiScale = 1, side = "ANCHOR_RIGHT", label = "missing owner geometry uses safe fallback" },
}) do
  rows[1].GetCenter = function() return example.x, 400 end
  rows[1].GetEffectiveScale = function() return example.scale end
  UIParent:SetScale(example.uiScale)
  hover(rows[1])
  check("tooltip side: " .. example.label, GameTooltip._anchor, example.side)
end
rows[1].GetCenter, rows[1].GetEffectiveScale = originalCenter, originalEffective
UIParent:SetScale(1)
hover(rows[1])
panel:GetScript("OnMouseWheel")(panel, -4)
check("scroll selects the fifth queued applicant", rows[1].entry, state.queue[5])
check("stationary row tooltip refreshes without another OnEnter", GameTooltip:IsShown() and contains(tooltipText(), state.queue[5].name) and not contains(tooltipText(), state.queue[1].name), true)
check("reused row hover follows its current character", contains(hover(rows[1]), state.queue[5].name), true)
check("reused row hover does not retain the previous character", contains(hover(rows[1]), state.queue[1].name), false)
for _, tick in ipairs(tickers) do tick() end
check("render, hover, scroll and ticker perform no action", actions, 0)
check("rendering preserves all source queue entries", #state.queue, 20)

state.rosterTotal, state.kickForbidden = 1000, true
candidates[1] = { name = "Synthetic Member", rank = "Initiate", level = 60, days = 20, need = 14, note = "Synthetic long offline note", reason = "offline" }
UI.Refresh()
local candRows = {}
for _, frame in ipairs(FRAMES) do if frame._parent == panel and frame.kick then candRows[#candRows + 1] = frame end end
check("full guild offers its read-only removal candidate", candRows[1] and candRows[1].cand, candidates[1])
check("full guild disables ordinary row invite buttons", rows[1].invite:IsEnabled(), false)
check("full guild rendering performs no removal or other action", actions, 0)
local candHeader
for _, font in ipairs(FONTS) do if font._parent == panel and contains(font._text, "Guild is full") then candHeader = font end end
check("candidate instruction is a wrapping text region", candHeader and candHeader._wrap, true)
check("candidate instruction has room for two synthetic lines", candHeader and candHeader:GetHeight() >= 2 * 14, true)
check("candidate instruction fits its allocated height with synthetic metrics", candHeader and candHeader:GetStringHeight() <= candHeader:GetHeight(), true)
local headRect, firstRect = rect(candHeader), rect(candRows[1])
check("candidate starts below the full instruction region", firstRect.y >= headRect.y + headRect.h, true)
check("candidate hover retains its complete offline note", contains(hover(candRows[1]), candidates[1].note), true)

for i = 2, 5 do candidates[i] = { name = "Synthetic Member " .. i, rank = "Initiate", level = 60, days = 20, need = 14, reason = "offline" } end
UI.Refresh()
local panelRect, lastRect = rect(panel), rect(candRows[5])
check("expanded panel keeps last candidate above its bottom inset", lastRect.y + lastRect.h <= panelRect.y + panelRect.h - 10, true)

UI.removalView = "unverified"
UI.Refresh()
check("unverified rendering performs no action", actions, 0)
local filterRect, unverifiedFirst = rect(UI.rankFilters[1]), rect(candRows[1])
check("unverified candidate begins below the rank-filter row", unverifiedFirst.y >= filterRect.y + filterRect.h, true)
UIParent:SetSize(640, 480)
UI.Refresh()
check("small viewport scales the whole expanded panel down", panel:GetScale() > 0 and panel:GetScale() < 1, true)
check("small viewport contains the expanded panel height", panel:GetHeight() * panel:GetScale() <= UIParent:GetHeight() * 0.94 + 0.01, true)
check("small viewport contains the panel width", panel:GetWidth() * panel:GetScale() <= UIParent:GetWidth() * 0.96 + 0.01, true)
UIParent:SetSize(1920, 1080)
UI.Refresh()
check("roomy viewport restores native UI scale", panel:GetScale(), 1)
candidates = {}
UI.removalView = nil
UI.Refresh()
panelRect, headRect = rect(panel), rect(candHeader)
check("zero-candidate instruction keeps a bottom margin", headRect.y + headRect.h <= panelRect.y + panelRect.h - 10, true)
check("zero-candidate view hides old candidate rows", candRows[1]:IsShown(), false)
local retainedQueue, retainedQueued, retainedReady = state.queue, state.queued, pc.ready
state.queue, state.queued, pc.ready = { retainedQueue[1], retainedQueue[2] }, 2, 2
UI.Refresh()
check("short-list populated second slot hides its placeholder", ghosts[2]:IsShown(), false)
check("short-list empty slots keep their placeholders", ghosts[4]:IsShown() and ghosts[6]:IsShown() and ghosts[8]:IsShown(), true)
hover(rows[1])
state.queue, state.queued, pc.ready = {}, 0, 0
UI.Refresh()
check("stationary row tooltip closes when its row disappears", GameTooltip:IsShown(), false)
check("all placeholders return when the queue becomes empty", (function() for _, texture in pairs(ghosts) do if not texture:IsShown() then return false end end return true end)(), true)
state.queue, state.queued, pc.ready = retainedQueue, retainedQueued, retainedReady
UI.Refresh()
UI.Hide(); UI.Show()
local duplicate = 0
for _, name in ipairs(UISpecialFrames) do if name == "OlympusVerifyPanel" then duplicate = duplicate + 1 end end
check("reopening does not duplicate Escape registration", duplicate, 1)
check("reopening and refreshing still perform no action", actions, 0)
print(string.format("\n%d/%d passed", total - failures, total))
os.exit(failures == 0 and 0 or 1)

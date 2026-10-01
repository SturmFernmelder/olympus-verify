--[[ OlympusVerify — roster window (0.6.4).

  Every member of the guild in one list: whether they have linked Discord, their Discord username and, when it is
  different, their display name, with rank, level and when they were last seen. Filter by typing (character or Discord
  name), by status, rank and class, or online only; click a column heading to sort by it, again to reverse.

  Where the data comes from: the client's own guild roster (live), the unverified list and the verified list the watcher
  writes into OlympusQueue.lua (Worker build .41 sends the verified list with the Discord names). Like every other part
  of that file, the lists are as fresh as the last /reload.

  Read-only. Nothing here invites, removes, whispers or writes anything; it reads OlympusVerifyAPI.Roster. Open it with
  /olv members [search], or the Members button on the officer panel. Loads after OlympusVerify.lua (TOC order). Only
  client-shipped textures and fonts, in the palette the panel uses (see OlympusVerifyUI.lua). ]]

local API = OlympusVerifyAPI
if type(API) ~= "table" or type(API.Roster) ~= "table" then return end
local R = API.Roster

OlympusVerifyRoster = OlympusVerifyRoster or {}
local W = OlympusVerifyRoster

local GOLD, GREY, WHITE, GREEN, YELLOW, RED = "|cffc9a86c", "|cff9ea3ad", "|cffe8ddc5", "|cff8ac69a", "|cffe8be65", "|cffe57572"
local C = {
  bg = { 0.063, 0.071, 0.090 }, band = { 0.090, 0.102, 0.129 }, tile = { 0.114, 0.125, 0.157 },
  gold = { 0.788, 0.659, 0.424 }, text = { 0.910, 0.867, 0.773 }, muted = { 0.620, 0.639, 0.678 },
}
local WHITE8 = "Interface\\Buttons\\WHITE8X8"
local BACKDROP_TEMPLATE = (BackdropTemplateMixin and "BackdropTemplate") or nil
local PANEL_BACKDROP = { bgFile = WHITE8, edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border", tile = false, edgeSize = 24, insets = { left = 6, right = 6, top = 6, bottom = 6 } }
local CHIP_BACKDROP = { bgFile = WHITE8, edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = false, edgeSize = 10, insets = { left = 2, right = 2, top = 2, bottom = 2 } }

local WIDTH, PAD, ROWS, ROW_H = 820, 18, 16, 22
local INNER = WIDTH - 2 * PAD
local FILTER_Y, COLS_Y = -62, -100
local ROWS_Y = COLS_Y - 20
local HEIGHT = -ROWS_Y + ROWS * ROW_H + 44

-- Columns: key (sort), heading, x, width. The character column is class-coloured.
local COLS = {
  { key = "name", text = "Character", x = 10, w = 160 },
  { key = "level", text = "Lvl", x = 174, w = 32 },
  { key = "rank", text = "Rank", x = 210, w = 104 },
  { key = "status", text = "Status", x = 318, w = 100 },
  { key = "discord", text = "Discord", x = 422, w = 150 },
  { key = "display", text = "Display name", x = 576, w = 136 },
  { key = "seen", text = "Last seen", x = 716, w = 60 },
}
local STATUS_TEXT = {
  verified = GREEN .. "verified|r",
  pending = YELLOW .. "verifying|r",
  unverified = RED .. "not verified|r",
  unknown = GREY .. "not in list|r",
}
local STATUS_FILTERS = { { "all", "All members" }, { "verified", "Verified" }, { "not", "Not verified" }, { "pending", "Verifying now" }, { "unknown", "Not in the list" } }

local frame, search, statusBtn, rankBtn, classBtn, onlineBtn, summary, footer, rows, headers
local offset = 0
local view = { text = "", status = 1, rank = 0, class = 0, online = false, sort = "status", desc = false }
local cache = { list = {}, info = nil }

-- ASCII "..." cut on a character boundary, as the panel does.
local function trunc(s, n)
  s = tostring(s or "")
  if #s <= n then return s end
  local cut = n - 3
  while cut > 0 do
    local b = string.byte(s, cut + 1)
    if not b or b < 128 or b >= 192 then break end
    cut = cut - 1
  end
  local last = string.byte(s, cut)
  if last and last >= 192 then cut = cut - 1 end
  return string.sub(s, 1, cut) .. "..."
end

local function seenText(m)
  if m.online then return GREEN .. "online|r" end
  local d = m.days
  if not d then return GREY .. "?|r" end
  if d < 1 then return math.floor(d * 24 + 0.5) .. "h" end
  return math.floor(d) .. "d"
end

local function classColor(file)
  local c = file and RAID_CLASS_COLORS and RAID_CLASS_COLORS[file]
  if not c then return WHITE end
  if c.colorStr then return "|c" .. c.colorStr end
  return string.format("|cff%02x%02x%02x", math.floor((c.r or 1) * 255), math.floor((c.g or 1) * 255), math.floor((c.b or 1) * 255))
end

local function className(file)
  local names = LOCALIZED_CLASS_NAMES_MALE
  return (names and file and names[file]) or (file and (string.sub(file, 1, 1) .. string.lower(string.sub(file, 2)))) or "?"
end

local function Fill(parent, layer, rgb, a, sub)
  local t = parent:CreateTexture(nil, layer, nil, sub)
  if t.SetColorTexture then t:SetColorTexture(rgb[1], rgb[2], rgb[3], a) else t:SetTexture(WHITE8) end
  return t
end

local function Label(parent, template, text, x, y, w, justify)
  local fs = parent:CreateFontString(nil, "OVERLAY", template)
  fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
  if w then fs:SetWidth(w) end
  fs:SetJustifyH(justify or "LEFT")
  if fs.SetWordWrap then fs:SetWordWrap(false) end
  fs:SetText(text or "")
  return fs
end

local function Tip(owner, title, lines)
  if not GameTooltip then return end
  GameTooltip:SetOwner(owner, "ANCHOR_RIGHT")
  GameTooltip:SetText(title or "", C.gold[1], C.gold[2], C.gold[3])
  for _, l in ipairs(lines or {}) do GameTooltip:AddLine(l, C.text[1], C.text[2], C.text[3], true) end
  GameTooltip:Show()
end
local function HideTip() if GameTooltip then GameTooltip:Hide() end end

local function Button(parent, text, w, h, onClick, tipTitle, tipText)
  local b = CreateFrame("Button", nil, parent, BACKDROP_TEMPLATE)
  b:SetSize(w, h)
  if b.SetBackdrop then
    b:SetBackdrop(CHIP_BACKDROP)
    if b.SetBackdropColor then b:SetBackdropColor(C.tile[1], C.tile[2], C.tile[3], 0.95) end
    if b.SetBackdropBorderColor then b:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 0.55) end
  end
  local fs = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  fs:SetPoint("CENTER", b, "CENTER", 0, 0)
  if fs.SetWidth then fs:SetWidth(w - 8) end
  fs:SetText(text)
  if b.SetFontString then b:SetFontString(fs) end
  b.label = fs
  b:SetScript("OnClick", onClick)
  if tipTitle then
    b:SetScript("OnEnter", function(self) Tip(self, tipTitle, { tipText }) end)
    b:SetScript("OnLeave", HideTip)
  end
  return b
end

-- The label is the button's own font string (SetFontString), so setting it directly is the whole job.
local function SetButtonText(b, text) if b.label then b.label:SetText(text) end end

-- ---------------------------------------------------------------- data
local function Reload()
  local list, info = R.Members()
  cache.list, cache.info = list or {}, info
end

local function CurrentRank()
  local ranks = cache.info and cache.info.ranks or {}
  local r = ranks[view.rank]
  return r and r.rank or nil
end
local function CurrentClass()
  local classes = cache.info and cache.info.classes or {}
  return classes[view.class]
end

local function Visible()
  local list = R.Filter(cache.list, {
    text = view.text,
    status = STATUS_FILTERS[view.status][1],
    rank = CurrentRank(),
    class = CurrentClass(),
    online = view.online,
  })
  return R.Sort(list, view.sort, view.desc)
end

-- ---------------------------------------------------------------- drawing
local function RowTip(r)
  local m = r.member
  if not m then return end
  local lines = { string.format("Level %s %s, %s", tostring(m.level), className(m.class), tostring(m.rank)) }
  if m.status == "verified" then
    if m.discord then
      lines[#lines + 1] = "Discord: @" .. m.discord .. (m.display and (" (" .. m.display .. ")") or "")
    elseif m.sinceLogin then
      lines[#lines + 1] = "Verified since your login: the Discord name arrives with the next list (/reload)."
    else
      lines[#lines + 1] = "Linked; the bot has not read this account's Discord names yet."
    end
    if m.discordId then lines[#lines + 1] = GREY .. "Discord id " .. m.discordId .. "|r" end
    if m.linkStatus and m.linkStatus ~= "member" then lines[#lines + 1] = GREY .. "Link status: " .. m.linkStatus .. "|r" end
  elseif m.status == "pending" then
    lines[#lines + 1] = "Holds an unexpired verification code: part-way through verifying."
  elseif m.status == "unverified" then
    lines[#lines + 1] = "No Discord account linked. The Unverified list on the panel says when they may be removed."
  else
    lines[#lines + 1] = "Not in the lists from the last /reload: joined since, or the Worker is older than build .41."
  end
  Tip(r, m.full or m.name, lines)
end

function W.Refresh()
  if not frame or not frame:IsShown() then return end
  local list = Visible()
  local info = cache.info or {}
  local maxOffset = math.max(0, #list - ROWS)
  if offset > maxOffset then offset = maxOffset end
  if offset < 0 then offset = 0 end
  for i = 1, ROWS do
    local r, m = rows[i], list[offset + i]
    if m then
      r.member = m
      r.cells.name:SetText(classColor(m.class) .. trunc(m.name, 26) .. "|r")
      r.cells.level:SetText(WHITE .. tostring(m.level or "") .. "|r")
      r.cells.rank:SetText(WHITE .. trunc(m.rank, 16) .. "|r")
      r.cells.status:SetText(STATUS_TEXT[m.status] or m.status)
      r.cells.discord:SetText(m.discord and (WHITE .. trunc("@" .. m.discord, 24) .. "|r") or (m.status == "verified" and (GREY .. "linked|r") or ""))
      r.cells.display:SetText(m.display and (WHITE .. trunc(m.display, 22) .. "|r") or "")
      r.cells.seen:SetText(seenText(m))
      r:Show()
    else
      r.member = nil
      r:Hide()
    end
  end
  for _, hdr in ipairs(headers) do
    local col = hdr.col
    local arrow = (view.sort == col.key) and (view.desc and " v" or " ^") or ""
    SetButtonText(hdr, (view.sort == col.key and GOLD or GREY) .. col.text .. arrow .. "|r")
  end
  local shown = #list
  summary:SetText(string.format("%s%d members|r  %s%d verified|r  %s%d not verified|r  %s%d verifying|r%s   %s%s|r",
    WHITE, info.total or 0, GREEN, info.verified or 0, RED, info.unverified or 0, YELLOW, info.pending or 0,
    (info.unknown or 0) > 0 and string.format("  %s%d not in list|r", GREY, info.unknown) or "",
    GREY, shown ~= (info.total or 0) and string.format("showing %d", shown) or ""))
  local names = info.hasNames and (info.listAt and ("Discord names as of " .. date("%d %b %H:%M", info.listAt)) or "Discord names loaded")
    or "No Discord names yet: they arrive with Worker build .41 and watcher 0.6.4, then a /reload"
  footer:SetText(GREY .. names .. (#list > ROWS and string.format(" · %d-%d of %d, scroll", offset + 1, math.min(#list, offset + ROWS), #list) or "") .. "|r")
  SetButtonText(statusBtn, STATUS_FILTERS[view.status][2])
  SetButtonText(rankBtn, CurrentRank() or "All ranks")
  SetButtonText(classBtn, CurrentClass() and className(CurrentClass()) or "All classes")
  SetButtonText(onlineBtn, view.online and (GREEN .. "Online only|r") or "Online and offline")
end

local function Wheel(_, delta)
  offset = offset - (tonumber(delta) or 0) * 3
  W.Refresh()
end

-- ---------------------------------------------------------------- building
local function Build()
  frame = CreateFrame("Frame", "OlympusVerifyRosterFrame", UIParent, BACKDROP_TEMPLATE)
  frame:SetSize(WIDTH, HEIGHT)
  if frame.SetFrameStrata then frame:SetFrameStrata("DIALOG") end
  if frame.SetToplevel then frame:SetToplevel(true) end
  if frame.SetClampedToScreen then frame:SetClampedToScreen(true) end
  if frame.SetBackdrop then
    frame:SetBackdrop(PANEL_BACKDROP)
    if frame.SetBackdropColor then frame:SetBackdropColor(C.bg[1], C.bg[2], C.bg[3], 0.97) end
    if frame.SetBackdropBorderColor then frame:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 1) end
  end
  local pos = OlympusVerifyDB and OlympusVerifyDB.rosterWindow
  if type(pos) == "table" and pos.point then frame:SetPoint(pos.point, UIParent, pos.point, pos.x or 0, pos.y or 0)
  else frame:SetPoint("CENTER", UIParent, "CENTER", 0, 20) end
  frame:SetMovable(true); frame:EnableMouse(true); frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, _, x, y = self:GetPoint()
    if OlympusVerifyDB and point then OlympusVerifyDB.rosterWindow = { point = point, x = x, y = y } end
  end)
  frame:Hide()
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "OlympusVerifyRosterFrame") end

  local band = Fill(frame, "BORDER", C.band, 0.96, -1)
  band:SetPoint("TOPLEFT", frame, "TOPLEFT", 10, -10)
  band:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -10, -50)
  Label(frame, "GameFontNormalLarge", GOLD .. "Olympus roster|r", PAD, -17, 170)
  summary = Label(frame, "GameFontHighlightSmall", "", PAD + 176, -22, INNER - 176 - 40)
  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -5, -5)
  close:SetScript("OnClick", function() W.Hide() end)

  -- filters: search, then four toggles that cycle through their values
  search = CreateFrame("EditBox", "OlympusVerifyRosterSearch", frame, BACKDROP_TEMPLATE)
  search:SetSize(232, 24)
  search:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, FILTER_Y)
  if search.SetBackdrop then
    search:SetBackdrop(CHIP_BACKDROP)
    if search.SetBackdropColor then search:SetBackdropColor(0.04, 0.045, 0.06, 1) end
    if search.SetBackdropBorderColor then search:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 0.55) end
  end
  if search.SetFontObject then search:SetFontObject(ChatFontNormal or GameFontHighlightSmall) end
  if search.SetTextInsets then search:SetTextInsets(8, 8, 0, 0) end
  if search.SetAutoFocus then search:SetAutoFocus(false) end
  if search.SetMaxLetters then search:SetMaxLetters(40) end
  search:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  search:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
  search:SetScript("OnTextChanged", function(self)
    view.text = self:GetText() or ""
    if search.hint then if view.text == "" then search.hint:Show() else search.hint:Hide() end end
    offset = 0
    W.Refresh()
  end)
  search:SetScript("OnEnter", function(self) Tip(self, "Search", { "Part of a character name, a Discord username or a display name. Any case." }) end)
  search:SetScript("OnLeave", HideTip)
  -- A placeholder, shown while the box is empty. It belongs to the box itself: on the window it sat below the box's
  -- backdrop (a child frame draws over its parent's font strings whatever their layer) and never showed.
  local hint = search:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hint:SetPoint("LEFT", search, "LEFT", 9, 0)
  hint:SetWidth(214)
  hint:SetJustifyH("LEFT")
  if hint.SetWordWrap then hint:SetWordWrap(false) end
  hint:SetText("Search character or Discord name")
  search.hint = hint
  statusBtn = Button(frame, "All members", 118, 24, function()
    view.status = view.status % #STATUS_FILTERS + 1; offset = 0; W.Refresh()
  end, "Status", "Click to step through: all, verified, not verified, verifying now, not in the list.")
  statusBtn:SetPoint("LEFT", search, "RIGHT", 8, 0)
  rankBtn = Button(frame, "All ranks", 118, 24, function()
    local n = #(cache.info and cache.info.ranks or {})
    view.rank = (n > 0) and ((view.rank + 1) % (n + 1)) or 0; offset = 0; W.Refresh()
  end, "Rank", "Click to step through the guild's ranks, highest first.")
  rankBtn:SetPoint("LEFT", statusBtn, "RIGHT", 6, 0)
  classBtn = Button(frame, "All classes", 108, 24, function()
    local n = #(cache.info and cache.info.classes or {})
    view.class = (n > 0) and ((view.class + 1) % (n + 1)) or 0; offset = 0; W.Refresh()
  end, "Class", "Click to step through the classes in the guild.")
  classBtn:SetPoint("LEFT", rankBtn, "RIGHT", 6, 0)
  onlineBtn = Button(frame, "Online and offline", 132, 24, function()
    view.online = not view.online; offset = 0; W.Refresh()
  end, "Online", "Only members who are online right now, or everyone.")
  onlineBtn:SetPoint("LEFT", classBtn, "RIGHT", 6, 0)

  -- column headings: click to sort, again to reverse
  local cols = Fill(frame, "BORDER", C.band, 0.96, -1)
  cols:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, COLS_Y)
  cols:SetSize(INNER, 18)
  headers = {}
  for _, col in ipairs(COLS) do
    local hdr = CreateFrame("Button", nil, frame)
    hdr:SetSize(col.w, 18)
    hdr:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD + col.x, COLS_Y)
    local fs = hdr:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    fs:SetPoint("LEFT", hdr, "LEFT", 0, 0)
    fs:SetWidth(col.w)
    fs:SetJustifyH("LEFT")
    fs:SetText(GREY .. col.text .. "|r")
    if hdr.SetFontString then hdr:SetFontString(fs) end
    hdr.label = fs
    hdr.col = col
    hdr:SetScript("OnClick", function()
      if view.sort == col.key then view.desc = not view.desc else view.sort = col.key; view.desc = false end
      W.Refresh()
    end)
    headers[#headers + 1] = hdr
  end

  rows = {}
  for i = 1, ROWS do
    local r = CreateFrame("Frame", nil, frame)
    r:SetSize(INNER - 6, ROW_H)
    r:SetPoint("TOPLEFT", frame, "TOPLEFT", PAD, ROWS_Y - (i - 1) * ROW_H)
    if i % 2 == 0 then
      local z = Fill(r, "BACKGROUND", { 1, 1, 1 }, 0.035)
      z:SetAllPoints(r)
    end
    local hoverTex = Fill(r, "BORDER", C.gold, 0.09)
    hoverTex:SetAllPoints(r)
    hoverTex:Hide()
    r.cells = {}
    for _, col in ipairs(COLS) do
      local fs = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
      fs:SetPoint("LEFT", r, "LEFT", col.x, 0)
      fs:SetWidth(col.w)
      fs:SetJustifyH("LEFT")
      if fs.SetWordWrap then fs:SetWordWrap(false) end
      r.cells[col.key] = fs
    end
    if r.EnableMouse then r:EnableMouse(true) end
    if r.EnableMouseWheel then r:EnableMouseWheel(true) end
    r:SetScript("OnMouseWheel", Wheel)
    r:SetScript("OnEnter", function(self) hoverTex:Show(); RowTip(self) end)
    r:SetScript("OnLeave", function() hoverTex:Hide(); HideTip() end)
    r:Hide()
    rows[i] = r
  end
  frame:EnableMouseWheel(true)
  frame:SetScript("OnMouseWheel", Wheel)
  footer = Label(frame, "GameFontDisableSmall", "", PAD, -(HEIGHT - 26), INNER)
  W.frame = frame
  W.search = search
end

-- ---------------------------------------------------------------- public
function W.Show(text)
  if not frame then Build() end
  Reload()
  if type(text) == "string" and text ~= "" then
    view.text = text
    if search.SetText then search:SetText(text) end
    if search.hint then search.hint:Hide() end
  end
  offset = 0
  frame:Show()
  W.Refresh()
end

function W.Hide()
  if frame then frame:Hide() end
  HideTip()
end

function W.Toggle()
  if frame and frame:IsShown() then W.Hide() else W.Show() end
end

-- The roster changes under the window (people log in and out, join, leave): re-read it when the client says so,
-- at most every few seconds, and only while the window is open.
local watcher = CreateFrame("Frame")
local lastRead = 0
watcher:RegisterEvent("GUILD_ROSTER_UPDATE")
watcher:SetScript("OnEvent", function()
  if not frame or not frame:IsShown() then return end
  local t = time()
  if t - lastRead < 5 then return end
  lastRead = t
  Reload()
  W.Refresh()
end)

-- For the tests: what the window would show right now.
W.Visible = function() Reload(); return Visible() end
W.view = view

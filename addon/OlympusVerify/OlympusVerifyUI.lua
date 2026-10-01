--[[ OlympusVerify — officer panel.

  A movable window (/olv, or right-click the launcher button). From the top:
    - a header: the title, a NEW badge while an invite has just landed, and one summary line (ready, waiting,
      oldest, guild full) that stays inside its own bounds;
    - six status tiles: secret, chat log, guild notes, roster export, Discord queue file, events to relay. Each tile
      shows a word or a number; its tooltip carries the sentence that used to be squeezed into a status line;
    - the toolbar: "Send next invite" (each click is its own hardware event, and the client allows exactly one
      protected call per event, so one invite per click), roster export, chat-log flush and clear;
    - the invite queue: an Invite and a remove button per row, the mouse wheel scrolls, and hovering a row shows
      everything the row had to cut;
    - the last four events;
    - when the guild is full, or the Unverified list is open, a removal section below.

  The queue lists only applicants confirmed online and in no guild (plus invites still awaiting an answer). "Check"
  runs one /who on the next applicant in line; /olv all lists everyone for the session.

  Reads everything through OlympusVerifyAPI (OlympusVerify.lua); never touches the queue directly. Loads after the
  main file (TOC order) and is optional: without it the launcher button and /olv commands still work.

  Look (25 Sep, the owner asked Codex and Claude together for the best in-game look). Codex's readback at 2560x1440
  over Stormwind found the old panel close to see-through, every label centre-justified (a FontString with a width
  and no SetJustifyH centres), the status lines clipped, and the title and queue header drawing into their
  neighbours. Hence a near-opaque charcoal fill, every label explicitly LEFT, a fixed box for every text, and the
  full text in tooltips. Palette agreed with Codex in the log: gold C9A86C, text E8DDC5, charcoal 101217/171A21,
  muted 9EA3AD, warning E8BE65, red E57572, green 8AC69A, blue 83B8D8. Only client-shipped textures and fonts. ]]

local API = OlympusVerifyAPI
local candHeader, candRows, candSep
local unvButton, filterButtons  -- the unverified view: its toggle in the queue header, and its rank filter
local checkButton               -- one /who on the next applicant in line, beside the unverified toggle
if not API then return end

OlympusVerifyUI = OlympusVerifyUI or {}
local UI = OlympusVerifyUI

local cfg = OlympusVerifyConfig or {}
local AUTO_SHOW = cfg.uiAutoShow ~= false     -- open the panel when a new invite lands
local ROWS = 8                                -- queue rows visible at once; mouse wheel scrolls
local ROW_H = 26
local CAND_ROWS = 5                           -- removal candidates shown when the guild is full
local FULL_CONFIRM = 6                        -- seconds a "send anyway" stays armed at the cap
local fullBlocked, fullArmedUntil = false, 0  -- set in Refresh from the roster count, read by the send button

-- Geometry, top down, in UI units from the panel's top-left. Every text gets a width here so nothing can draw into
-- its neighbour; the numbers below are the whole layout.
local WIDTH = 700
local PAD = 18                    -- content inset; the dialog border itself is about 8 wide
local INNER = WIDTH - 2 * PAD     -- 664
local ROW_W = INNER - 10          -- queue and candidate rows; the last 10 hold the scroll thumb
local BAND_B = 58                 -- bottom of the header band
local TILE_Y, TILE_H, TILE_GAP = -68, 40, 6
local BAR_Y = -120                -- toolbar
local QHEAD_Y = -156              -- "Invite queue" line; its two buttons sit on it
local COLS_Y = -180               -- column header band, 18 tall
local ROWS_Y = -200               -- first queue row
local FEED_Y = ROWS_Y - ROWS * ROW_H - 12
local FEED_LINE = 17
local HEIGHT = -FEED_Y + 20 + 4 * FEED_LINE + 12
local CAND_TOP = -(HEIGHT - 6)    -- the removal section starts where the panel used to end
local CAND_HEAD_H = 30            -- two wrapped lines: the guidance there is a sentence, not a label
local FILTER_H = 24

-- Colours as chat codes (text) and as numbers (textures, backdrops, SetTextColor). The code names are the old ones
-- so every existing format string reads the same; only the values moved to the agreed palette.
local GOLD = "|cffc9a86c"
local GREY = "|cff9ea3ad"
local WHITE = "|cffe8ddc5"
local GREEN = "|cff8ac69a"
local YELLOW = "|cffe8be65"
local RED = "|cffe57572"
local BLUE = "|cff83b8d8"
local C = {
  bg    = { 0.063, 0.071, 0.090 },  -- 101217
  band  = { 0.090, 0.102, 0.129 },  -- 171A21
  tile  = { 0.114, 0.125, 0.157 },  -- 1D2028, one step up from the band
  gold  = { 0.788, 0.659, 0.424 },
  text  = { 0.910, 0.867, 0.773 },
  muted = { 0.620, 0.639, 0.678 },
  warn  = { 0.910, 0.745, 0.396 },
  red   = { 0.898, 0.459, 0.447 },
  green = { 0.541, 0.776, 0.604 },
  blue  = { 0.514, 0.722, 0.847 },
}

local WHITE8 = "Interface\\Buttons\\WHITE8X8"
local BACKDROP_TEMPLATE = (BackdropTemplateMixin and "BackdropTemplate") or nil
-- The native dialog border, tinted gold, around a flat fill. The old fill was UI-DialogBox-Background-Dark, which
-- is itself translucent: against Stormwind's stone the status text all but disappeared.
local PANEL_BACKDROP = {
  bgFile = WHITE8, edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
  tile = false, edgeSize = 24,
  insets = { left = 6, right = 6, top = 6, bottom = 6 },
}
-- Buttons and badges: the tooltip's rounded edge at a small size, so they read as part of the same frame.
local CHIP_BACKDROP = {
  bgFile = WHITE8, edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
  tile = false, edgeSize = 10,
  insets = { left = 2, right = 2, top = 2, bottom = 2 },
}

local panel, rows, feedLines, tiles, queueHeader, emptyLabel, sendButton, scrollTrack, scrollThumb
local emptyTitle, ghostRows
local headerBand, previewPill
local offset = 0
local refreshTicker

local function ago(ts)
  ts = tonumber(ts) or 0
  if ts <= 0 then return "never" end
  local d = time() - ts
  if d < 5 then return "just now" end
  if d < 60 then return d .. "s ago" end
  if d < 3600 then return math.floor(d / 60) .. "m ago" end
  if d < 86400 then return math.floor(d / 3600) .. "h ago" end
  return math.floor(d / 86400) .. "d ago"
end

local function clock(ts)
  ts = tonumber(ts) or 0
  if ts <= 0 then return "--:--" end
  return date("%H:%M", ts)
end

-- ASCII "..." rather than U+2026: the client font has no guarantee of the glyph, and the width-bound font strings
-- below already end in "..." when the client cuts them, so a cut reads the same whoever made it. The cut backs off
-- to a character boundary: a byte limit through "É" (two bytes) left half a character, which the client draws as
-- garbage and which is no longer valid UTF-8 (Codex's ui_polish test, 25 Sep).
local function trunc(s, n)
  s = tostring(s or "")
  if #s <= n then return s end
  local cut = n - 3
  -- a continuation byte (10xxxxxx) at cut+1 means the character that starts at or before cut runs past it
  while cut > 0 do
    local b = string.byte(s, cut + 1)
    if not b or b < 128 or b >= 192 then break end
    cut = cut - 1
  end
  -- cut now ends before a lead byte or an ASCII byte; drop a lead byte left dangling at the very end
  local last = string.byte(s, cut)
  if last and last >= 192 then cut = cut - 1 end
  return string.sub(s, 1, cut) .. "..."
end

local STATUS_COLOR = { queued = WHITE, invited = YELLOW, joined = GREEN, failed = RED }
local STATUS_RGB = { queued = C.muted, invited = C.warn, joined = C.green, failed = C.red }
local SOURCE_LABEL = { whisper = "whisper", mail = "mail", worker = "Discord" }

local function statusText(q, filtering)
  local s = q.status or "?"
  if s == "queued" then
    local extra = (q.attempts or 0) > 0 and string.format(" (attempt %d)", (q.attempts or 0) + 1) or ""
    -- Place in line, as the Worker counts it, so this panel and the /verify-status the applicant reads quote the
    -- same number. Absent (a row queued from a whisper the Worker has not confirmed, or an older Worker) shows no
    -- number at all, which is honest, where "#0" would not be.
    local place = (q.position or 0) > 0 and string.format("#%d ", q.position) or ""
    -- What the last /who said. Only "ready" rows are listed unless /olv all is on, so the other wordings are for
    -- that view. A ready row shows what /who showed -- level, class, zone -- enough to tell a fresh alt standing in
    -- Goldshire from a main who wandered off.
    if filtering and API.PresenceOf then
      local st, rec = API.PresenceOf(q)
      if st == "ready" then
        -- ASCII separators: trunc() cuts by bytes, and a cut through a multi-byte "·" would draw as garbage.
        -- The class is the last word of what /who shows ("Night Elf Druid"); the race is dropped for room.
        local bits = { "online" }
        if rec and rec.level then
          local class = rec.what and string.match(rec.what, "(%S+)%s*$")
          bits[#bits + 1] = tostring(rec.level) .. (class and (" " .. class) or "")
        end
        if rec and rec.zone then bits[#bits + 1] = rec.zone end
        return place .. table.concat(bits, ", ") .. extra
      elseif st == "checking" then return place .. "checking..."
      elseif st == "awaiting" then return place .. "asked, answer not in yet"
      elseif st == "offline" then return place .. "offline (checked " .. ago(rec and rec.at) .. ")"
      elseif st == "guilded" then return place .. "in " .. ((rec and rec.guild) and ("<" .. rec.guild .. ">") or "another guild")
      elseif st == "member" then return place .. "already in the guild"
      elseif st == "unread" then return place .. "no usable /who answer - skipped for now"
      end
      return place .. "not checked yet"
    end
    -- The one row in the list that somebody is actively standing there waiting on: they gave up their old guild
    -- because we asked them to, and right now they are in no guild at all. It outranks the ordinary wording.
    if q.lastReason == "ready_after_gquit" then return place .. "LEFT THEIR GUILD - invite now" end
    return place .. "waiting for a click" .. extra
  elseif s == "invited" then
    return "invited " .. ago(q.invitedAt) .. (q.reply and (" — " .. q.reply) or "")
  elseif s == "joined" then
    return "joined " .. ago(q.joinedAt)
  elseif s == "failed" then
    if q.removedReason == "in_another_guild" then
      return "off the queue" .. (q.reply and (" — " .. q.reply) or "") .. " — Retry puts them back"
    end
    return "failed" .. (q.reply and (" — " .. q.reply) or "") .. " — click Retry"
  end
  return s
end

-- full = true for the hover: the row keeps a server answer short, the tooltip shows all of it (Codex review, 22:03).
local function eventText(e, full)
  local t, name = e.type, e.name or "?"
  if t == "whisper" or t == "mail" then
    if e.ok then
      return (e.inGuild and GREEN or WHITE) .. name .. "|r" .. GREY .. ": code confirmed via " .. t .. (e.inGuild and " (already on the roster)" or "") .. "|r"
    end
    return RED .. name .. "|r" .. GREY .. ": invalid or expired code via " .. t .. "|r"
  elseif t == "invite" then
    if e.ok then return YELLOW .. name .. "|r" .. GREY .. ": invite sent|r" end
    return RED .. name .. "|r" .. GREY .. ": invite failed" .. (e.detail and (" — " .. (full and tostring(e.detail) or trunc(e.detail, 60))) or "") .. "|r"
  elseif t == "joined" then
    return GREEN .. name .. "|r" .. GREY .. ": joined the guild|r"
  elseif t == "note" then
    return (e.ok and WHITE or RED) .. name .. "|r" .. GREY .. ": note " .. (e.ok and "set" or "not set") .. "|r"
  -- The three below have no name worth leading with, or a detail that is the point. Without their own wording the
  -- feed read "?: guild_full" in game (Codex's native readback, 25 Sep 22:20).
  elseif t == "guild_full" then
    return YELLOW .. "Guild full|r" .. GREY .. ": an invite was refused" .. (e.detail and (" — " .. (full and tostring(e.detail) or trunc(e.detail, 60))) or "") .. "|r"
  elseif t == "removed" then
    if e.ok then return RED .. name .. "|r" .. GREY .. ": removed from the guild" .. (e.detail and (" (" .. tostring(e.detail) .. ")") or "") .. "|r" end
    return RED .. name .. "|r" .. GREY .. ": removal failed" .. (e.detail and (" — " .. (full and tostring(e.detail) or trunc(e.detail, 60))) or "") .. "|r"
  elseif t == "notice" then
    return (e.ok and WHITE or RED) .. name .. "|r" .. GREY .. ": notice " .. (e.ok and "whispered" or "not sent") .. (e.detail and (" (" .. tostring(e.detail) .. ")") or "") .. "|r"
  elseif t == "dequeued" then
    return YELLOW .. name .. "|r" .. GREY .. ": taken off the queue" .. (e.detail and (" — " .. tostring(e.detail)) or "") .. "|r"
  end
  return WHITE .. name .. "|r" .. GREY .. ": " .. tostring(t) .. "|r"
end

-- ---------------------------------------------------------------- building blocks
-- The side a tooltip opens on. ANCHOR_RIGHT alone ran off the screen for every row of a panel parked on the right
-- (Codex's native readback at 2560x1440, 25 Sep 22:19), so it opens towards whichever half of the screen the owner
-- is not in. Positions are compared in screen units: the panel may be scaled down by FitToScreen.
local function TipAnchor(owner)
  if not (owner and owner.GetCenter and UIParent and UIParent.GetWidth) then return "ANCHOR_RIGHT" end
  local x = tonumber((owner:GetCenter()))
  local w = tonumber((UIParent:GetWidth())) or 0
  if not x or w <= 0 then return "ANCHOR_RIGHT" end
  local s = owner.GetEffectiveScale and tonumber((owner:GetEffectiveScale())) or 1
  local us = UIParent.GetEffectiveScale and tonumber((UIParent:GetEffectiveScale())) or 1
  return (x * s > w * us / 2) and "ANCHOR_LEFT" or "ANCHOR_RIGHT"
end

-- What the open tooltip was built from, so a refresh can rebuild it: a row is recycled under a cursor that has not
-- moved, and its tooltip went on describing the previous applicant (Codex, native readback 25 Sep 22:22).
local tipOwner, tipTitle, tipText

local function HideTip()
  tipOwner = nil
  if GameTooltip then GameTooltip:Hide() end
end

local function ShowTip(owner, title, text)
  if not GameTooltip or not title then return end
  tipOwner, tipTitle, tipText = owner, title, text
  if type(title) == "function" then
    title, text = title(owner)
    if not title then HideTip() return end
  end
  GameTooltip:SetOwner(owner, TipAnchor(owner))
  GameTooltip:SetText(title, 1, 1, 1)
  if type(text) == "table" then
    for _, line in ipairs(text) do GameTooltip:AddLine(line, C.text[1], C.text[2], C.text[3], true) end
  elseif text then
    GameTooltip:AddLine(text, 0.8, 0.8, 0.8, true)
  end
  GameTooltip:Show()
end


-- title and text may be strings, or title a function returning both when the content is only known at hover time
local function Tooltip(widget, title, text)
  if not widget.SetScript then return end
  if widget.EnableMouse then widget:EnableMouse(true) end
  widget:SetScript("OnEnter", function(self) ShowTip(self, title, text) end)
  widget:SetScript("OnLeave", HideTip)
end

local function Fill(parent, layer, rgb, a, sublevel)
  local t = parent:CreateTexture(nil, layer or "BACKGROUND", nil, sublevel)
  if t.SetColorTexture then t:SetColorTexture(rgb[1], rgb[2], rgb[3], a or 1) end
  return t
end

-- Every label is explicitly LEFT unless told otherwise, and never wraps unless told to: a width alone makes a
-- FontString centre and wrap, which is what put the old feed lines in the middle of the panel.
local function Label(parent, template, text, x, y, w, justify)
  local fs = parent:CreateFontString(nil, "OVERLAY", template or "GameFontHighlightSmall")
  fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
  if w then fs:SetWidth(w) end
  if fs.SetJustifyH then fs:SetJustifyH(justify or "LEFT") end
  if fs.SetWordWrap then fs:SetWordWrap(false) end
  fs:SetText(text or "")
  return fs
end

-- A cell in a row: vertically centred on the row, so the row height can change without re-measuring offsets.
local function Cell(row, template, x, w, justify)
  local fs = row:CreateFontString(nil, "OVERLAY", template or "GameFontHighlightSmall")
  fs:SetPoint("LEFT", row, "LEFT", x, 0)
  fs:SetWidth(w)
  if fs.SetJustifyH then fs:SetJustifyH(justify or "LEFT") end
  if fs.SetWordWrap then fs:SetWordWrap(false) end
  fs:SetText("")
  return fs
end

-- Button tones. The primary action is gold, destructive ones red, a pending confirmation amber; everything else is
-- a quiet charcoal chip. The label carries no colour codes, so a disabled button can grey the whole thing.
local TONE = {
  primary = { fill = { 0.30, 0.23, 0.10, 0.97 }, edge = C.gold,  edgeA = 1.0,  text = { 1.00, 0.90, 0.68 } },
  normal  = { fill = { 0.13, 0.14, 0.18, 0.97 }, edge = C.muted, edgeA = 0.55, text = C.text },
  accent  = { fill = { 0.17, 0.14, 0.08, 0.97 }, edge = C.gold,  edgeA = 0.8,  text = C.gold },
  danger  = { fill = { 0.22, 0.09, 0.09, 0.97 }, edge = C.red,   edgeA = 0.8,  text = { 0.96, 0.66, 0.64 } },
  armed   = { fill = { 0.42, 0.28, 0.07, 0.98 }, edge = C.warn,  edgeA = 1.0,  text = { 1.00, 0.93, 0.72 } },
  good    = { fill = { 0.09, 0.17, 0.12, 0.97 }, edge = C.green, edgeA = 0.8,  text = C.green },
  quiet   = { fill = { 0.10, 0.11, 0.14, 0.70 }, edge = C.muted, edgeA = 0.30, text = C.muted },
}

local function Paint(b)
  local t = TONE[b.tone or "normal"] or TONE.normal
  local on = true
  if b.IsEnabled then on = b:IsEnabled() and true or false end
  local k = on and 1 or 0.55
  local ea = (t.edgeA or 1) * (on and (b.hover and 1.3 or 1) or 0.45)
  if b.SetBackdropColor then b:SetBackdropColor(t.fill[1] * k, t.fill[2] * k, t.fill[3] * k, t.fill[4]) end
  if b.SetBackdropBorderColor then b:SetBackdropBorderColor(t.edge[1], t.edge[2], t.edge[3], math.min(1, ea)) end
  if b.label and b.label.SetTextColor then
    if on then b.label:SetTextColor(t.text[1], t.text[2], t.text[3])
    else b.label:SetTextColor(C.muted[1] * 0.75, C.muted[2] * 0.75, C.muted[3] * 0.75) end
  end
end

local function SetTone(b, tone)
  if b.tone ~= tone then b.tone = tone; Paint(b) end
end

local function SetEnabled(b, on)
  if b.SetEnabled then b:SetEnabled(on and true or false) end
  Paint(b)  -- OnEnable/OnDisable repaint too; this covers a client that does not fire them for SetEnabled
end

local function Button(parent, text, w, h, onClick, tipTitle, tipText, tone)
  local b = CreateFrame("Button", nil, parent, BACKDROP_TEMPLATE)
  b:SetSize(w, h)
  if b.SetBackdrop then b:SetBackdrop(CHIP_BACKDROP) end
  local fs = b:CreateFontString(nil, "OVERLAY", h >= 24 and "GameFontHighlight" or "GameFontHighlightSmall")
  fs:SetPoint("CENTER", b, "CENTER", 0, 0)
  fs:SetWidth(w - 8)
  if fs.SetJustifyH then fs:SetJustifyH("CENTER") end
  if fs.SetWordWrap then fs:SetWordWrap(false) end
  if b.SetFontString then b:SetFontString(fs) end
  b.label = fs
  b.tone = tone or "normal"
  b:SetText(text)
  if b.SetPushedTextOffset then b:SetPushedTextOffset(1, -1) end
  local hl = b:CreateTexture(nil, "HIGHLIGHT")
  hl:SetPoint("TOPLEFT", b, "TOPLEFT", 2, -2)
  hl:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -2, 2)
  if hl.SetColorTexture then hl:SetColorTexture(1, 1, 1, 0.07) end
  b:SetScript("OnClick", onClick)
  b:SetScript("OnEnter", function(self) self.hover = true; Paint(self); ShowTip(self, tipTitle, tipText) end)
  b:SetScript("OnLeave", function(self) self.hover = nil; Paint(self); HideTip() end)
  b:SetScript("OnEnable", Paint)
  b:SetScript("OnDisable", Paint)
  Paint(b)
  return b
end

local function Chip(parent, w, h, rgbEdge, rgbFill)
  local f = CreateFrame("Frame", nil, parent, BACKDROP_TEMPLATE)
  f:SetSize(w, h)
  if f.SetBackdrop then
    f:SetBackdrop(CHIP_BACKDROP)
    f:SetBackdropColor(rgbFill[1], rgbFill[2], rgbFill[3], rgbFill[4] or 0.95)
    f:SetBackdropBorderColor(rgbEdge[1], rgbEdge[2], rgbEdge[3], 0.9)
  end
  f.label = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  f.label:SetPoint("CENTER", f, "CENTER", 0, 0)
  if f.label.SetWordWrap then f.label:SetWordWrap(false) end
  return f
end

local function SavePosition()
  if not panel.GetPoint then return end
  local point, _, relPoint, x, y = panel:GetPoint()
  if point then
    OlympusVerifyDB = OlympusVerifyDB or {}
    OlympusVerifyDB.ui = OlympusVerifyDB.ui or {}
    OlympusVerifyDB.ui.point, OlympusVerifyDB.ui.relPoint, OlympusVerifyDB.ui.x, OlympusVerifyDB.ui.y = point, relPoint, x, y
  end
end

local function RestorePosition()
  local ui = OlympusVerifyDB and OlympusVerifyDB.ui
  if ui and ui.point and panel.ClearAllPoints then
    panel:ClearAllPoints()
    panel:SetPoint(ui.point, UIParent, ui.relPoint or ui.point, ui.x or 0, ui.y or 0)
  else
    panel:SetPoint("CENTER", UIParent, "CENTER", 0, 60)
  end
end

-- The panel grows by the removal section (up to about 750 units). On a small window or a large UI scale that is
-- taller than the screen, and a clamped frame taller than the screen cannot be dragged into view, so the panel
-- shrinks to fit instead. Never above 1: the officer's own UI scale is the size they chose.
local function FitToScreen()
  if not (panel and panel.SetScale and UIParent and UIParent.GetHeight) then return end
  local sh = tonumber((UIParent:GetHeight())) or 0
  local sw = UIParent.GetWidth and tonumber((UIParent:GetWidth())) or 0
  local h = panel.GetHeight and tonumber((panel:GetHeight())) or 0
  if sh <= 0 or h <= 0 then return end
  local s = math.min(1, (sh * 0.94) / h)
  if sw > 0 then s = math.min(s, (sw * 0.96) / WIDTH) end
  local cur = panel.GetScale and tonumber((panel:GetScale())) or 1
  if math.abs(cur - s) > 0.001 then panel:SetScale(s) end
end

local function SetPanelHeight(h)
  panel:SetHeight(h)
  FitToScreen()
end

local function Wheel(_, delta)
  offset = offset - (tonumber(delta) or 0)
  UI.Refresh()
end

-- A row the mouse can rest on: zebra shading, a hover wash, a thin status stripe at the left, a tooltip built at
-- hover time from whatever the row holds, and the wheel passed through so the list still scrolls from any row.
local function Row(i, y, tip)
  local r = CreateFrame("Frame", nil, panel)
  r:SetSize(ROW_W, ROW_H)
  r:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, y)
  if i % 2 == 0 then
    local z = Fill(r, "BACKGROUND", { 1, 1, 1 }, 0.035)
    z:SetAllPoints(r)
  end
  r.stripe = Fill(r, "ARTWORK", C.muted, 0.8)
  r.stripe:SetPoint("TOPLEFT", r, "TOPLEFT", 0, -4)
  r.stripe:SetPoint("BOTTOMLEFT", r, "BOTTOMLEFT", 0, 4)
  r.stripe:SetWidth(2)
  r.hoverTex = Fill(r, "BORDER", C.gold, 0.09)
  r.hoverTex:SetAllPoints(r)
  r.hoverTex:Hide()
  if r.EnableMouse then r:EnableMouse(true) end
  if r.EnableMouseWheel then r:EnableMouseWheel(true) end
  r:SetScript("OnMouseWheel", Wheel)
  r:SetScript("OnEnter", function(self) self.hoverTex:Show(); ShowTip(self, tip) end)
  r:SetScript("OnLeave", function(self) self.hoverTex:Hide(); HideTip() end)
  r:Hide()
  return r
end

local function queueRowTip(r)
  local q = r.entry
  if not q then return nil end
  local lines = {}
  lines[#lines + 1] = "Status: " .. tostring(r.fullStatus or q.status or "?")
  lines[#lines + 1] = "From: " .. (SOURCE_LABEL[q.source] or tostring(q.source or "?")) .. ", queued " .. ago(q.ts) .. " (" .. clock(q.ts) .. ")"
  if (q.position or 0) > 0 then lines[#lines + 1] = "Place in line: #" .. q.position .. " (the number /verify-status shows them)" end
  if (tonumber(q.priority) or 0) > 0 then lines[#lines + 1] = GOLD .. "Reserved name:|r picked on the guild site, so it goes before the rest. They still whisper their code to link Discord." end
  if q.reply and q.reply ~= "" then lines[#lines + 1] = "Server said: " .. q.reply end
  if q.status == "queued" or q.status == "failed" then
    lines[#lines + 1] = GREY .. "Invite/Retry sends exactly this invite; x drops the row here only.|r"
  end
  return q.name or "?", lines
end

local function candRowTip(r)
  local c = r.cand
  if not c then return nil end
  local lines = { string.format("Level %s, %s", tostring(c.level), tostring(c.rank)) }
  if c.days then lines[#lines + 1] = "Away " .. (r.away or "?") .. (c.need and string.format(" (threshold %dd)", c.need) or "") end
  if c.here then lines[#lines + 1] = string.format("In the guild %dd", math.floor(c.here)) end
  if c.note and c.note ~= "" then lines[#lines + 1] = "Note: " .. c.note end
  lines[#lines + 1] = GREY .. "Removing also ends their Discord access. The addon never removes anyone by itself.|r"
  return c.name or "?", lines
end

local function feedTip(f)
  local e = f.event
  if not e then return nil end
  local lines = { eventText(e, true) }
  -- Only the failed-invite wording carries the detail; any other event that has one still gets it, whole.
  local worded = (e.type == "invite" and not e.ok) or e.type == "guild_full" or e.type == "removed" or e.type == "notice"
  if e.detail and e.detail ~= "" and not worded then lines[#lines + 1] = "Detail: " .. tostring(e.detail) end
  return clock(e.ts) .. "  " .. (e.name or "?"), lines
end

local function tileTip(t)
  if not t.tipTitle then return nil end
  return t.tipTitle, t.tipText
end

-- ---------------------------------------------------------------- building
-- Build is split by section for the same reason as Refresh: one function holding every widget passes Lua 5.1's
-- limit of 60 upvalues.
local function BuildShell()
  panel = CreateFrame("Frame", "OlympusVerifyPanel", UIParent, BACKDROP_TEMPLATE)
  panel:SetSize(WIDTH, HEIGHT)
  if panel.SetFrameStrata then panel:SetFrameStrata("DIALOG") end
  if panel.SetToplevel then panel:SetToplevel(true) end
  if panel.SetClampedToScreen then panel:SetClampedToScreen(true) end
  if panel.SetBackdrop then
    panel:SetBackdrop(PANEL_BACKDROP)
    if panel.SetBackdropColor then panel:SetBackdropColor(C.bg[1], C.bg[2], C.bg[3], 0.97) end
  end
  panel:SetMovable(true); panel:EnableMouse(true); panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", panel.StartMoving)
  panel:SetScript("OnDragStop", function(self) self:StopMovingOrSizing(); SavePosition() end)
  panel:Hide()
  RestorePosition()
  -- Esc closes it like any Blizzard window.
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "OlympusVerifyPanel") end
  UI.panel = panel
end

local function BuildHeader()
  -- header band: title, NEW badge, summary, version, close
  -- BORDER, not BACKGROUND: the backdrop's own centre fill is a BACKGROUND texture and drew over the band, so in
  -- game the band (and its amber preview tint) never showed (pixel samples of Codex's 22:18 screenshots). Sublevel
  -- -1 keeps the gold rule, also on BORDER, above it.
  headerBand = Fill(panel, "BORDER", C.band, 0.96, -1)
  -- 10 in: the border art is opaque from about 4 to 9 units in, with its shadow to about 12 (measured on the
  -- extracted UI-DialogBox-Border at edgeSize 24), so the band starts inside the line rather than on it.
  headerBand:SetPoint("TOPLEFT", panel, "TOPLEFT", 10, -10)
  headerBand:SetPoint("BOTTOMRIGHT", panel, "TOPRIGHT", -10, -BAND_B)
  local rule = Fill(panel, "BORDER", C.gold, 0.45)
  rule:SetPoint("TOPLEFT", panel, "TOPLEFT", 10, -BAND_B)
  rule:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -10, -BAND_B)
  rule:SetHeight(1)
  UI.rule = rule

  -- The title is its own bounded box: measured once, since the text never changes, so the badge sits right after it.
  UI.title = Label(panel, "GameFontNormalLarge", GOLD .. "Olympus Verify|r", PAD, -17)
  local tw = UI.title.GetStringWidth and tonumber((UI.title:GetStringWidth())) or 0
  UI.title:SetWidth((tw > 0 and tw < 220) and (math.ceil(tw) + 4) or 150)
  -- The NEW marker is its own badge now; in the title string it pushed the counts into the version text.
  local badge = Chip(panel, 78, 18, C.warn, { 0.28, 0.20, 0.06, 0.95 })
  badge:SetPoint("LEFT", UI.title, "RIGHT", 10, 0)
  badge.label:SetText("NEW invite")
  if badge.label.SetTextColor then badge.label:SetTextColor(C.warn[1], C.warn[2], C.warn[3]) end
  badge:Hide()
  UI.newBadge = badge
  -- 150 short of the right edge: the preview pill, the version and the close button live there
  UI.summary = Label(panel, "GameFontHighlightSmall", "", PAD, -39, INNER - 150)
  UI.version = Label(panel, "GameFontDisableSmall", "", 0, 0, 84, "RIGHT")
  UI.version:ClearAllPoints()
  UI.version:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -40, -21)
  local close = CreateFrame("Button", nil, panel, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -5, -5)
  close:SetScript("OnClick", function() UI.Hide() end)

  -- Shown only while /olv preview fills the panel with sample data (OlympusVerifyPreview.lua). Together with the
  -- amber border and header it is impossible to mistake the sample queue for the real one.
  previewPill = Chip(panel, 150, 20, C.warn, { 0.30, 0.21, 0.05, 0.97 })
  previewPill:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -130, -16)
  if previewPill.label.SetTextColor then previewPill.label:SetTextColor(C.warn[1], C.warn[2], C.warn[3]) end
  Tooltip(previewPill, "Preview: sample data",
    "Every row is invented. The buttons change only the sample, so each state change can be seen; nothing reaches the guild, and the launcher and the flush key are disconnected too. /olv preview off returns to the real queue.")
  previewPill:Hide()
end

local function BuildTiles()
  -- status tiles
  tiles = {}
  local span = INNER + TILE_GAP
  for i = 1, 6 do
    local x0 = math.floor((i - 1) * span / 6)
    local x1 = math.floor(i * span / 6) - TILE_GAP
    local t = CreateFrame("Frame", nil, panel)
    t:SetSize(x1 - x0, TILE_H)
    t:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD + x0, TILE_Y)
    local bg = Fill(t, "BACKGROUND", C.tile, 0.95)
    bg:SetAllPoints(t)
    t.accent = Fill(t, "ARTWORK", C.muted, 0.9)
    t.accent:SetPoint("TOPLEFT", t, "TOPLEFT", 0, 0)
    t.accent:SetPoint("BOTTOMLEFT", t, "BOTTOMLEFT", 0, 0)
    t.accent:SetWidth(2)
    t.name = Label(t, "GameFontDisableSmall", "", 9, -7, x1 - x0 - 14)
    t.value = Label(t, "GameFontHighlightSmall", "", 9, -22, x1 - x0 - 14)
    Tooltip(t, tileTip)
    tiles[i] = t
  end
end

local function BuildToolbar()
  -- toolbar
  -- At the member cap every invite is refused before it leaves, so the button stops offering to send them: 25 clicks
  -- against a full guild cost 25 refusals, 25 backed-off rows and 25 whispers telling people something they could
  -- read from /verify-status. It is not locked, though — the roster re-exports about once a minute, so an officer
  -- who has just watched someone leave would otherwise be told "full" by a stale count. One click arms, the next sends.
  sendButton = Button(panel, "Send next invite", 214, 24, function()
      -- Nobody confirmed online and guildless yet: the click goes on the next /who instead. Never both -- each is a
      -- protected call, and a click buys exactly one.
      local p = UI.presence
      if p and p.filtering and p.ready == 0 then
        fullArmedUntil = 0
        API.Check()
        return
      end
      if fullBlocked and time() > fullArmedUntil then
        fullArmedUntil = time() + FULL_CONFIRM
        UI.Refresh()
        return
      end
      local force = fullBlocked  -- armed and confirmed: the officer knows better than a minute-old roster count
      fullArmedUntil = 0
      API.Flush(nil, force and { force = true } or nil)
    end,
    "Invite the next applicant who is online and in no guild",
    "One invite per click — the game allows exactly one protected action per key press or click. Same as the flush key binding. When nobody is confirmed online yet, the click checks the next applicant with /who instead. At the member cap it asks once before trying anyway.",
    "primary")
  sendButton:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, BAR_Y)
  UI.sendButton = sendButton
  -- Was "Export roster", which only filled SavedVariables in memory: nothing reached Discord until a /reload anyway.
  -- The reload is the one exchange WoW allows in both directions, so the button does it (27 Sep).
  local exportBtn = Button(panel, "Sync & reload", 118, 24, function()
    if API.Sync then API.Sync() else API.ExportRoster(); UI.Refresh() end
  end, "Sync with Discord (reloads the UI)",
    "Exports the roster and reloads: the reload writes the roster and the event log for the watcher to send, and loads the newest Discord queue file. The screen reloads for a few seconds.")
  exportBtn:SetPoint("LEFT", sendButton, "RIGHT", 8, 0)
  UI.exportButton = exportBtn
  local flushBtn = Button(panel, "Flush chat log", 126, 24, function() API.FlushChatLog(); UI.Refresh() end,
    "Push the chat log to disk", "Turns chat logging off and on again so the watcher sees buffered whispers and guild messages now instead of at the next 48 KiB.")
  flushBtn:SetPoint("LEFT", exportBtn, "RIGHT", 6, 0)
  UI.flushButton = flushBtn
  local clearBtn = Button(panel, "Clear queue", 104, 24, function() API.ClearQueue() end,
    "Clear the queue", "Removes every entry, including invited and joined records. Discord keeps its own copy.", "danger")
  clearBtn:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -PAD, BAR_Y)
  UI.clearButton = clearBtn
  -- 0.6.4: the roster window (OlympusVerifyRoster.lua), in the gap left of Clear queue. Read-only, so it stays live
  -- in /olv preview too.
  local membersBtn = Button(panel, "Members", 76, 24, function()
      if OlympusVerifyRoster and OlympusVerifyRoster.Toggle then OlympusVerifyRoster.Toggle()
      elseif DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86cOlympus Verify|r: the roster window is not loaded yet: restart the game once after updating the addon.") end
    end,
    "Guild roster with Discord names", "Every guild member: verified or not, their Discord username and display name, rank and last seen. Filter and sort it; it changes nothing. Same as /olv members.")
  membersBtn:SetPoint("RIGHT", clearBtn, "LEFT", -6, 0)
  UI.membersButton = membersBtn
end

local function BuildQueue()
  -- queue header: the counts get a fixed width that ends before the two buttons on the same line
  queueHeader = Label(panel, "GameFontNormal", GOLD .. "Invite queue|r", PAD, QHEAD_Y, INNER - 2 * 104 - 6 - 12)
  UI.queueHeader = queueHeader
  unvButton = Button(panel, "Unverified", 104, 20, function()
      UI.removalView = (UI.removalView ~= "unverified") and "unverified" or nil
      UI.Refresh()
    end,
    "Members who have not verified",
    "Guild members with no linked Discord account, lowest rank first. \"Macro\" on a row aims your OlvKick macro at that member; pressing the macro removes them. Nobody is offered before their grace period ends, and officers never are. /olv unverified prints the full breakdown.")
  unvButton:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -PAD, QHEAD_Y + 4)
  unvButton.unverifiedToggle = true
  UI.unvButton = unvButton
  checkButton = Button(panel, "Check", 104, 20, function() API.Check(); UI.Refresh() end,
    "Check the next applicant with /who",
    "Looks up the next applicant in line: online or not, and in which guild. One /who per click — the game needs a click or key press for each, and the server answers about one every 5 seconds. Online and in no guild puts them on the list; anyone else stays off it until they are checked again.")
  checkButton:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -PAD - 104 - 6, QHEAD_Y + 4)
  UI.checkButton = checkButton

  -- column header band
  local cols = Fill(panel, "BORDER", C.band, 0.96, -1)  -- above the backdrop's centre, like the header band
  cols:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, COLS_Y)
  cols:SetSize(INNER, 18)
  local function Col(text, x, w) return Label(panel, "GameFontDisableSmall", GREY .. text .. "|r", PAD + x, COLS_Y - 4, w) end
  Col("Character", 10, 150); Col("Source", 166, 62); Col("Status", 232, 262); Col("Since", 500, 60)
  -- Faint placeholder stripes wherever a row is missing, so a short or empty list still reads as a table. Empty is
  -- the usual state at the cap (nobody is confirmed online until a /who says so), and the first native readback
  -- showed 208 units of plain charcoal there.
  ghostRows = {}
  for i = 2, ROWS, 2 do
    local g = Fill(panel, "BORDER", { 1, 1, 1 }, 0.025, -2)
    g:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, ROWS_Y - (i - 1) * ROW_H)
    g:SetSize(ROW_W, ROW_H)
    ghostRows[i] = g
  end
  -- The empty state is a centred block in the middle of the list: a heading that says what to do, then the
  -- explanation. Centred on purpose; everything that labels a column or a row stays LEFT.
  emptyTitle = Label(panel, "GameFontNormal", "", PAD + 10, ROWS_Y - 68, ROW_W - 20, "CENTER")
  emptyLabel = Label(panel, "GameFontHighlight", "Nothing queued. Codes whispered to you appear here; Discord approvals arrive after /reload.", PAD + 60, ROWS_Y - 90, ROW_W - 120, "CENTER")
  if emptyLabel.SetWordWrap then emptyLabel:SetWordWrap(true) end  -- the presence explanation runs to two lines
  if emptyLabel.SetMaxLines then emptyLabel:SetMaxLines(4) end
  if emptyLabel.SetTextColor then emptyLabel:SetTextColor(C.muted[1], C.muted[2], C.muted[3]) end

  -- rows
  rows = {}
  for i = 1, ROWS do
    local r = Row(i, ROWS_Y - (i - 1) * ROW_H, queueRowTip)
    r.name = Cell(r, "GameFontHighlightSmall", 10, 150)
    r.source = Cell(r, "GameFontHighlightSmall", 166, 62)
    r.status = Cell(r, "GameFontHighlightSmall", 232, 262)
    r.since = Cell(r, "GameFontHighlightSmall", 500, 60)
    -- Right to left from the row's end, so the last button stays inside the frame whatever the width.
    r.remove = Button(r, "x", 22, 18, function() if r.entry then API.Remove(r.entry) end end,
      "Remove from the queue", "Drops the entry here only; the applicant can whisper again.", "quiet")
    r.remove:SetPoint("RIGHT", r, "RIGHT", -4, 0)
    r.invite = Button(r, "Invite", 58, 18, function() if r.entry then API.Flush(r.entry) end end,
      "Invite this character now", "This click is the hardware event: one invite goes out.", "accent")
    r.invite:SetPoint("RIGHT", r, "RIGHT", -30, 0)
    rows[i] = r
  end
  UI.rows = rows
  panel:EnableMouseWheel(true)
  panel:SetScript("OnMouseWheel", Wheel)
  -- A slim thumb in the gutter right of the rows, shown only when the list is longer than the window onto it.
  scrollTrack = Fill(panel, "ARTWORK", C.muted, 0.12)
  scrollTrack:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD + ROW_W + 5, ROWS_Y)
  scrollTrack:SetSize(3, ROWS * ROW_H)
  scrollThumb = Fill(panel, "OVERLAY", C.gold, 0.7)
  scrollThumb:SetWidth(3)
  scrollTrack:Hide(); scrollThumb:Hide()
end

local function BuildFeed()
  -- feed
  Label(panel, "GameFontNormal", GOLD .. "Recent|r", PAD, FEED_Y)
  local feedRule = Fill(panel, "BORDER", C.muted, 0.18)
  feedRule:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD + 62, FEED_Y - 7)
  feedRule:SetSize(INNER - 62, 1)
  feedLines = {}
  for i = 1, 4 do
    local f = CreateFrame("Frame", nil, panel)
    f:SetSize(ROW_W, 16)
    f:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, FEED_Y - 20 - (i - 1) * FEED_LINE)
    f.time = Cell(f, "GameFontHighlightSmall", 10, 40)
    f.text = Cell(f, "GameFontHighlightSmall", 54, ROW_W - 58)
    Tooltip(f, feedTip)
    if f.EnableMouseWheel then f:EnableMouseWheel(true) end
    f:SetScript("OnMouseWheel", Wheel)
    feedLines[i] = f
  end
end

local function BuildRemoval()
  -- free a seat: only built once, shown when the guild is full or the Unverified list is open. The addon never
  -- removes anyone by itself — this section exists so the choice is informed and takes one deliberate click.
  candSep = Fill(panel, "BORDER", C.gold, 0.35)
  candSep:SetPoint("TOPLEFT", panel, "TOPLEFT", 10, CAND_TOP)
  candSep:SetPoint("TOPRIGHT", panel, "TOPRIGHT", -10, CAND_TOP)
  candSep:SetHeight(1)
  candSep:Hide()
  candHeader = Label(panel, "GameFontHighlight", "", PAD, CAND_TOP - 10, INNER)
  if candHeader.SetWordWrap then candHeader:SetWordWrap(true) end
  if candHeader.SetMaxLines then candHeader:SetMaxLines(2) end
  if candHeader.SetHeight then candHeader:SetHeight(CAND_HEAD_H) end
  if candHeader.SetJustifyV then candHeader:SetJustifyV("TOP") end
  candRows = {}
  for i = 1, CAND_ROWS do
    local r = Row(i, CAND_TOP - 10 - CAND_HEAD_H - (i - 1) * ROW_H, candRowTip)
    r.name = Cell(r, "GameFontHighlightSmall", 10, 150)
    r.detail = Cell(r, "GameFontHighlightSmall", 166, 392)
    r.kick = Button(r, "Remove", 76, 18, function()
        if not r.cand then return end
        if UI.macroRoute and API.PointKickMacro then API.PointKickMacro(r.cand.name, r.cand.reason) else API.RemoveMember(r.cand.name, r.cand.reason) end
      end,
      "Remove from the guild", "Click once to arm, again to confirm. This is the only thing in the addon that removes a member, and it also ends their Discord access. Where the client forbids addon removals this points your OlvKick macro at them instead, and you click that.",
      "danger")
    r.kick:SetPoint("RIGHT", r, "RIGHT", -4, 0)
    candRows[i] = r
  end
  UI.candRows = candRows

  filterButtons = {}
  for i = 1, 5 do
    local b = Button(panel, "", 94, 20, nil, "Rank filter",
      "Click to show or hide this rank. The Guild Master and officers are never offered, whatever the filter says.")
    b:SetScript("OnClick", function(self) if self.rank then API.ToggleUnverifiedRank(self.rank); UI.Refresh() end end)
    b:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD + (i - 1) * 100, CAND_TOP - 10 - CAND_HEAD_H)
    b.rankFilter = true
    b:Hide()
    filterButtons[i] = b
  end
  UI.rankFilters = filterButtons
end

local function Build()
  if panel then return end
  BuildShell(); BuildHeader(); BuildTiles(); BuildToolbar(); BuildQueue(); BuildFeed(); BuildRemoval()
end

-- ---------------------------------------------------------------- refresh
-- Refresh is split by section: one function holding every widget and colour would pass Lua 5.1's limit of 60
-- upvalues per function, and each part reads on its own anyway.

-- Candidate rows sit one filter bar lower when the unverified view shows its rank filter above them.
local function AnchorCandRows(shift)
  if not candRows then return end
  for i, r in ipairs(candRows) do
    r:ClearAllPoints()
    r:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD, CAND_TOP - 10 - CAND_HEAD_H - (shift or 0) - (i - 1) * ROW_H)
  end
end

-- Height with the removal section open: its header, the filter bar if any, the rows shown, and a little air (more
-- with no rows, so a two-line header never lands on the frame's bottom edge).
local function CandHeight(bar, n)
  return -CAND_TOP + 10 + CAND_HEAD_H + (bar or 0) + n * ROW_H + (n > 0 and 12 or 10)
end

local function SetTile(i, name, value, rgb, tipTitle, tipText)
  local t = tiles[i]
  t.name:SetText(GREY .. name .. "|r")
  t.value:SetText(value)
  if t.accent.SetColorTexture then t.accent:SetColorTexture(rgb[1], rgb[2], rgb[3], 0.9) end
  t.tipTitle, t.tipText = tipTitle, tipText
end

local function RefreshHeader(s, pc)
  local p = UI.preview
  if panel.SetBackdropBorderColor then
    if p then panel:SetBackdropBorderColor(C.warn[1], C.warn[2], C.warn[3], 1)
    else panel:SetBackdropBorderColor(1, 0.86, 0.60, 1) end  -- the stone border, warmed towards the gold
  end
  if headerBand.SetColorTexture then
    if p then headerBand:SetColorTexture(0.20, 0.15, 0.06, 0.97) else headerBand:SetColorTexture(C.band[1], C.band[2], C.band[3], 0.96) end
  end
  if p then
    previewPill.label:SetText("PREVIEW: " .. tostring(p))
    local w = previewPill.label.GetStringWidth and tonumber((previewPill.label:GetStringWidth())) or 0
    if w > 0 then previewPill:SetWidth(math.min(220, math.ceil(w) + 22)) end
    previewPill:Show()
  else
    previewPill:Hide()
  end
  UI.version:SetText(p and (YELLOW .. "sample data|r") or (GREY .. "v" .. tostring(s.version or "?") .. "|r"))
  if s.alertUntil and time() < s.alertUntil then UI.newBadge:Show() else UI.newBadge:Hide() end

  -- The number of key presses still owed, and how long the oldest applicant has been waiting, are the two facts an
  -- officer needs at a glance, so they get the line under the title rather than a place in the list.
  local bits = {}
  if (s.queued or 0) > 0 then
    if pc.filtering then
      bits[#bits + 1] = ((pc.ready or 0) > 0 and GREEN or GREY) .. string.format("%d ready", pc.ready or 0) .. "|r"
      bits[#bits + 1] = WHITE .. string.format("%d waiting", s.queued) .. "|r"
    else
      bits[#bits + 1] = WHITE .. string.format("%d to send", s.queued) .. "|r"
    end
    if (s.oldestQueuedAt or 0) > 0 then bits[#bits + 1] = GREY .. "oldest " .. ago(s.oldestQueuedAt) .. "|r" end
  else
    bits[#bits + 1] = GREY .. "nobody waiting|r"
  end
  if fullBlocked then bits[#bits + 1] = RED .. string.format("guild full (%d of %d)", s.rosterTotal or 0, s.guildCap or 0) .. "|r" end
  UI.summary:SetText(table.concat(bits, GREY .. "  ·  |r"))
end

local function RefreshTiles(s)
  if s.secret then
    SetTile(1, "SECRET", GREEN .. "loaded|r", C.green, "Secret loaded", "Config.lua is in place: whispered and mailed codes can be checked, and join confirmations are signed.")
  else
    SetTile(1, "SECRET", RED .. "missing|r", C.red, "Config.lua missing", "Codes cannot be checked. Copy Config.example.lua to Config.lua, set the secret, and /reload.")
  end
  if s.chatLogging then
    SetTile(2, "CHAT LOG", GREEN .. "on|r" .. (s.flushLog and "" or (GREY .. " · manual|r")), C.green, "Chat log on",
      "Whispers and guild messages go to Logs\\WoWChatLog.txt, which the watcher reads. " ..
      (s.flushLog and "The addon pushes it to disk after every whisper and every guild join or departure; /olv logtest measures how fast." or "The client writes it every 48 KiB of chat and at /reload or logout; Sync & reload pushes everything at once."))
  else
    SetTile(2, "CHAT LOG", RED .. "OFF|r", C.red, "Chat log OFF", "Whispers do not reach Discord until chat logging is back on (/chatlog, or /reload: the addon turns it on at login).")
  end
  SetTile(3, "GUILD NOTES", s.notes and (GREEN .. "on|r") or (GREY .. "off|r"), s.notes and C.green or C.muted,
    "Guild notes " .. (s.notes and "on" or "off"),
    s.notes and "New members get their verification note written after they join." or "The addon writes no guild notes (setNotes in Config.lua, or this client forbids it).")
  local rosterAge = (s.rosterAt or 0) > 0 and ago(s.rosterAt) or "never"
  SetTile(4, "ROSTER", (fullBlocked and RED or WHITE) .. tostring(s.rosterCount or 0) .. "|r" .. GREY .. " · " .. rosterAge .. "|r",
    fullBlocked and C.red or C.muted, "Roster export",
    string.format("%d members exported %s; %d on the roster against a cap of %d. The export refreshes about once a minute and goes to Discord at your next /reload or logout.",
      s.rosterCount or 0, rosterAge, s.rosterTotal or 0, s.guildCap or 0))
  if (s.queueFileAt or 0) > 0 then
    SetTile(5, "DISCORD QUEUE", WHITE .. tostring(s.queueFileEntries or 0) .. "|r" .. GREY .. " · " .. ago(s.queueFileAt) .. "|r", C.blue,
      "Discord queue file", string.format("OlympusQueue.lua from the watcher: %d entr%s, written %s. WoW reads it at login and /reload only; Sync & reload picks up anything newer.",
        s.queueFileEntries or 0, (s.queueFileEntries or 0) == 1 and "y" or "ies", ago(s.queueFileAt)))
  else
    SetTile(5, "DISCORD QUEUE", GREY .. "none yet|r", C.muted, "Discord queue file",
      "No OlympusQueue.lua has been read this session. Approvals from Discord arrive through it, at login and /reload.")
  end
  -- The count is the local event ring (up to 500 kept in SavedVariables), not a backlog: the addon never learns
  -- which of them the watcher has already relayed, so the tile must not suggest they are all still undelivered
  -- (Codex review, 22:03).
  local nev = #(s.events or {})
  SetTile(6, "EVENT LOG", (nev > 0 and WHITE or GREY) .. string.format("%d kept", nev) .. "|r", C.muted,
    "Event log", string.format("%d recent event%s (codes, invites, joins, server answers) kept in SavedVariables on this client. The client writes them to disk at /reload or logout, and the watcher relays what is new from there; this count includes events already relayed.",
      nev, nev == 1 and "" or "s"))
end

local function RefreshQueue(s, pc, filtering)
  -- Queue rows: waiting first, then invited, joined, failed. The waiting group is a work list and goes in the order
  -- the invites will actually go out; the rest are a log and stay newest-first.
  local order = { queued = 1, invited = 2, failed = 3, joined = 4 }
  local list, seq = {}, {}
  -- seq is db.queue's own order, which is already the Worker's order, keyed by the entry table so nothing is
  -- written into the SavedVariable. It is the last tiebreak everywhere: table.sort is quicksort and not stable, so
  -- without it any two rows with equal keys come back in whatever order the partition happened to leave them.
  --
  -- With presence on, the list is the people who can be invited this minute: queued applicants confirmed online and
  -- in no guild, plus invites sent in the last 15 minutes (the window the addon watches for them joining), so a
  -- click shows its result. Everyone else is counted in the header, not listed. /olv all shows the lot.
  for i, q in ipairs(s.queue) do
    seq[q] = i
    local keep = true
    if filtering then
      if q.status == "queued" then keep = API.PresenceOf(q) == "ready"
      elseif q.status == "invited" then keep = time() - (q.invitedAt or 0) < 15 * 60
      else keep = false end
    end
    if keep then list[#list + 1] = q end
  end
  table.sort(list, function(a, b)
    local oa, ob = order[a.status] or 9, order[b.status] or 9
    if oa ~= ob then return oa < ob end
    if oa == 1 then
      -- Oldest first, by the Worker's row id -- the same key Flush() serves on, since db.queue is appended from a
      -- queue file the Worker sorts ORDER BY id and Flush takes the first queued entry in that array.
      --
      -- This group used to sort newest-first, so the longest-waiting applicant sat at the BOTTOM of the panel while
      -- the send button fired on them: the officer read the top of a list and invited someone off the end of it.
      -- And because one MergeQueueFile pass enqueues the whole batch inside a single second, ts tied across every
      -- row, which left the order not merely reversed but arbitrary.
      --
      -- A row queued here from a whisper has no Worker id yet and stays ahead of the numbered ones: it is the most
      -- recent thing this officer actually watched happen.
      --
      -- 0.6.4: reserved names from the guild site (priority 1) go before everything else, as they do in the Worker.
      local pa, pb = tonumber(a.priority) or 0, tonumber(b.priority) or 0
      if pa ~= pb then return pa > pb end
      local ia, ib = a.id or -1, b.id or -1
      if ia ~= ib then return ia < ib end
      return seq[a] < seq[b]
    end
    if (a.ts or 0) ~= (b.ts or 0) then return (a.ts or 0) > (b.ts or 0) end
    return seq[a] < seq[b]
  end)
  local maxOffset = math.max(0, #list - ROWS)
  if offset > maxOffset then offset = maxOffset end
  if offset < 0 then offset = 0 end
  local more = #list > ROWS and string.format(" — %d–%d, scroll", offset + 1, math.min(#list, offset + ROWS)) or ""
  if filtering then
    queueHeader:SetText(string.format("%sInvite queue|r   %s%d ready of %d%s|r", GOLD, (pc.ready > 0 and GREEN or GREY), pc.ready, s.queued, more))
  else
    queueHeader:SetText(string.format("%sInvite queue|r   %s%d waiting, %d total%s%s|r", GOLD, GREY, s.queued, #list,
      UI.showAll and pc.filtering and " (all)" or "", more))
  end
  if checkButton then
    checkButton:SetText(pc.filtering and string.format("Check (%d)", (pc.unchecked or 0)) or "Check")
    SetEnabled(checkButton, pc.filtering and (pc.unchecked or 0) > 0 and (pc.checking or 0) == 0)
    if pc.filtering then checkButton:Show() else checkButton:Hide() end
  end
  if pc.filtering and pc.ready == 0 then
    -- Nobody to invite yet, so the big button is the Check button: same /who, one per click.
    sendButton:SetText((pc.unchecked or 0) > 0 and string.format("Check next (%d)", pc.unchecked) or "Nobody ready")
    SetTone(sendButton, "primary")
    SetEnabled(sendButton, (pc.unchecked or 0) > 0 and (pc.checking or 0) == 0)
  else
    local n = pc.filtering and pc.ready or s.queued
    if fullBlocked and time() <= fullArmedUntil then
      sendButton:SetText("Send anyway")
      SetTone(sendButton, "armed")
    elseif fullBlocked then
      sendButton:SetText(string.format("Guild is full (%d)", n))
      SetTone(sendButton, "danger")
    else
      sendButton:SetText(n > 0 and string.format("%s (%d)", pc.filtering and "Invite next ready" or "Send next invite", n) or "Send next invite")
      SetTone(sendButton, "primary")
    end
    SetEnabled(sendButton, n > 0)
  end
  for i = 1, ROWS do
    local r, q = rows[i], list[offset + i]
    if q then
      r.entry = q
      local st = statusText(q, pc.filtering)
      r.fullStatus = st
      r.name:SetText(WHITE .. trunc(q.name, 24) .. "|r")
      if (tonumber(q.priority) or 0) > 0 then
        r.source:SetText(GOLD .. "Reserved|r")  -- a name the guild's leadership picked on the guild site (0.6.4)
      else
        r.source:SetText((q.source == "worker" and BLUE or GREY) .. (SOURCE_LABEL[q.source] or q.source or "?") .. "|r")
      end
      r.status:SetText((STATUS_COLOR[q.status] or WHITE) .. trunc(st, 64) .. "|r")
      r.since:SetText(GREY .. ago(q.ts) .. "|r")
      local ready = q.status == "queued" and pc.filtering and API.PresenceOf and API.PresenceOf(q) == "ready"
      local rgb = ready and C.green or (STATUS_RGB[q.status] or C.muted)
      if r.stripe.SetColorTexture then r.stripe:SetColorTexture(rgb[1], rgb[2], rgb[3], 0.85) end
      if q.status == "queued" or q.status == "failed" then
        r.invite:SetText(q.status == "failed" and "Retry" or "Invite")
        r.invite:Show()
      else
        r.invite:Hide()
      end
      -- Greyed rather than hidden: the queue should still read as a queue at the cap, just not an actionable one.
      SetEnabled(r.invite, not fullBlocked)
      r:Show()
    else
      r.entry = nil
      r.fullStatus = nil
      r:Hide()
    end
  end
  if #list > ROWS then
    local trackH = ROWS * ROW_H
    local thumbH = math.max(18, math.floor(trackH * ROWS / #list))
    scrollThumb:ClearAllPoints()
    scrollThumb:SetPoint("TOPLEFT", panel, "TOPLEFT", PAD + ROW_W + 5, ROWS_Y - math.floor((trackH - thumbH) * offset / maxOffset))
    scrollThumb:SetHeight(thumbH)
    scrollTrack:Show(); scrollThumb:Show()
  else
    scrollTrack:Hide(); scrollThumb:Hide()
  end
  -- Who is where, in the words /olv status and the check button print (OlympusVerifyAPI.Text). Applicants taken off
  -- for being in another guild are no longer waiting, so they get their own sentence rather than a "0 in another
  -- guild" bucket next to the Recent lines that name them (26 Sep).
  local text = type(API.Text) == "table" and API.Text or nil
  local takenOff = text and text.TakenOff and text.TakenOff(pc) or nil
  local canCheck = (pc.unchecked or 0) > 0   -- somebody a press would look up; otherwise the answers have to age out
  if #list == 0 and filtering and (s.queued or 0) > 0 then
    -- The list is empty because of the filter, not because nobody is waiting: say who is where, and what to press.
    local breakdown = text and text.Breakdown and text.Breakdown(pc)
      or string.format("%d not checked, %d offline", pc.unchecked or 0, pc.offline or 0)
    emptyLabel:SetText("Nobody confirmed online and guildless: " .. breakdown .. ". " ..
      (takenOff and (takenOff .. ". ") or "") ..
      (canCheck and "Check (or your flush key) looks up the next in line; /olv all lists everyone."
        or "Each is checked again once their answer ages out; /olv all lists everyone."))
  elseif takenOff and filtering then
    emptyLabel:SetText("Nothing waiting. " .. takenOff .. "; /olv all lists them, with a Retry. " ..
      "Codes whispered to you appear here; Discord approvals arrive after /reload.")
  else
    emptyLabel:SetText("Nothing queued. Codes whispered to you appear here; Discord approvals arrive after /reload.")
  end
  if #list == 0 then
    local t
    if filtering and (s.queued or 0) > 0 then
      if (pc.checking or 0) > 0 then t = "Checking the next applicant..."
      elseif (pc.unchecked or 0) > 0 then t = "Check the next applicant to fill this list"
      else t = "Everyone waiting has been checked" end
    else
      t = "The queue is empty"
    end
    emptyTitle:SetText(GOLD .. t .. "|r")
    emptyTitle:Show(); emptyLabel:Show()
  else
    emptyTitle:Hide(); emptyLabel:Hide()
  end
  for i = 2, ROWS, 2 do
    if list[offset + i] then ghostRows[i]:Hide() else ghostRows[i]:Show() end
  end
end

-- feed: last four events, newest first
local function RefreshFeed(s)
  local n = #s.events
  for i = 1, 4 do
    local e, f = s.events[n - i + 1], feedLines[i]
    f.event = e
    if e then
      f.fullText = eventText(e)
      f.time:SetText(GREY .. clock(e.ts) .. "|r")
      f.text:SetText(f.fullText)
      f:Show()
    else
      f.fullText = nil
      f.time:SetText(""); f.text:SetText("")
      f:Hide()
    end
  end
end

-- One candidate row, for either list. detail is the grey middle column; the button says what one click will do.
local function FillCandRow(r, c, s, detail, stripe)
  r.cand = c
  r.name:SetText(WHITE .. trunc(c.name, 24) .. "|r")
  r.detail:SetText(GREY .. detail .. "|r")
  if r.stripe.SetColorTexture then r.stripe:SetColorTexture(stripe[1], stripe[2], stripe[3], 0.85) end
  if UI.macroRoute then
    -- The addon cannot remove anyone here, so the button stops pretending to. It aims the macro instead, and says so
    -- when it is already aimed, which is the only way to tell one click from the next.
    local aimed = s.kickMacroTarget == c.name
    r.kick:SetText(aimed and "Aimed" or "Macro")
    SetTone(r.kick, aimed and "good" or "accent")
    SetEnabled(r.kick, not s.macroForbidden)
  else
    local armed = s.armedRemoval == c.name and time() <= (s.armedUntil or 0)
    r.kick:SetText(armed and "Confirm?" or "Remove")
    SetTone(r.kick, armed and "armed" or "danger")
    SetEnabled(r.kick, true)
  end
  r:Show()
end

local function AwayText(days)
  days = days or 0
  return days < 2 and string.format("%dh", math.floor(days * 24)) or string.format("%dd", math.floor(days))
end

-- unverified members: opened from the queue header; while open it replaces the guild-full block entirely
local function RefreshUnverified(s)
  local cands, info, err = API.UnverifiedList(CAND_ROWS)
  if unvButton then unvButton:SetText("Close list"); SetTone(unvButton, "accent") end
  local hdr
  if err then
    hdr = GOLD .. "Unverified|r  " .. GREY .. "— " .. err .. "|r"
  elseif info.noFirstSeen then
    hdr = RED .. "Unverified|r  " .. GREY .. "— the Worker has no join dates yet (apply the migration); nobody can be offered.|r"
  elseif info.offered == 0 then
    hdr = GOLD .. "Unverified|r  " .. GREY .. string.format("— %d in the guild, none removable yet%s|r", info.inGuild,
      info.nextEligible and (". First grace period ends " .. API.When(info.nextEligible)) or "")
  else
    hdr = GOLD .. "Unverified|r  " .. GREY .. string.format("— %d removable of %d. \"Macro\" aims %s; then press it on your bar.|r",
      info.offered, info.inGuild, s.kickMacroName or "OlvKick")
  end
  if not err and (info.openTickets or 0) > 0 then
    -- a request code names no character until it is whispered, so its holder cannot be marked "verifying now" (27 Sep)
    hdr = hdr .. GREY .. string.format("  %d open Discord code%s not whispered yet — a holder may be listed.|r", info.openTickets, info.openTickets == 1 and "" or "s")
  end
  candSep:Show()
  candHeader:SetText(hdr)
  candHeader:Show()
  local ranks = err and {} or API.UnverifiedRanks(info)
  local ex = API.UnverifiedExcluded()
  local shown = 0
  for _, br in ipairs(ranks) do
    if not br.protected and shown < #filterButtons then
      shown = shown + 1
      local b = filterButtons[shown]
      b.rank = br.rank
      b:SetText(string.format("%s %d", trunc(tostring(br.rank), 10), br.offered))
      SetTone(b, ex[br.rank] and "quiet" or "normal")  -- a hidden rank reads as switched off
      b:Show()
    end
  end
  for i = shown + 1, #filterButtons do filterButtons[i].rank = nil; filterButtons[i]:Hide() end
  local bar = shown > 0 and FILTER_H or 0
  AnchorCandRows(bar)
  for i = 1, CAND_ROWS do
    local r, c = candRows[i], cands[i]
    if c then
      r.away = AwayText(c.days)
      FillCandRow(r, c, s, string.format("level %s · %s · away %s%s", tostring(c.level), tostring(c.rank), r.away,
        c.here and string.format(" · here %dd", math.floor(c.here)) or ""), C.warn)
    else
      r.cand = nil
      r:Hide()
    end
  end
  SetPanelHeight(CandHeight(bar, math.min(#cands, CAND_ROWS)))
end

local function RefreshRemoval(s)
  UI.macroRoute = s.kickForbidden or s.removeVia == "macro"  -- read by the row buttons, built once and outliving any refresh
  if UI.removalView == "unverified" and API.UnverifiedList then return RefreshUnverified(s) end
  if unvButton then unvButton:SetText("Unverified"); SetTone(unvButton, "normal") end
  if filterButtons then for _, b in ipairs(filterButtons) do b.rank = nil; b:Hide() end end
  AnchorCandRows(0)

  -- free a seat: shown whenever the guild is actually at the cap, and for an hour after the server last said so
  local full = fullBlocked or ((s.guildFullAt or 0) > 0 and (time() - s.guildFullAt) < 3600)
  local cands = full and API.Candidates and API.Candidates(CAND_ROWS) or {}
  if full then
    if #cands == 0 then
      candHeader:SetText(GOLD .. "Guild is full|r  " .. GREY .. "— nobody is eligible to remove. /olv full explains why.|r")
    elseif s.kickForbidden and s.macroForbidden then
      candHeader:SetText(RED .. "Guild is full|r  " .. GREY .. string.format("— this client blocks addon removals and macros; type %s <name> by hand|r", s.kickCommand or "/guildremove"))
    elseif s.kickForbidden then
      candHeader:SetText(RED .. "Guild is full|r  " .. GREY .. string.format("— \"Macro\" aims %s at that member (%s); click it on your bar.|r", s.kickMacroName or "OlvKick", s.kickCommand or "/guildremove"))
    else
      candHeader:SetText(GOLD .. "Guild is full|r  " .. GREY .. string.format("— %s. Officers and \"hold\" notes excluded. Two clicks.|r", s.offlineRule or ""))
    end
    candSep:Show()
    candHeader:Show()
    -- Derived from where the block actually sits: the panel reaches the section's top, its header, the rows shown
    -- and a little air, so the header can never land on the frame's bottom edge.
    SetPanelHeight(CandHeight(0, math.min(#cands, CAND_ROWS)))
  else
    candHeader:SetText("")
    candHeader:Hide()
    candSep:Hide()
    SetPanelHeight(HEIGHT)
  end
  for i = 1, CAND_ROWS do
    local r, c = candRows[i], cands[i]
    if full and c then
      r.away = AwayText(c.days)
      FillCandRow(r, c, s, string.format("level %s · %s · away %s of %dd%s", tostring(c.level), tostring(c.rank), r.away, c.need or 0,
        (c.note and c.note ~= "") and (" · " .. trunc(c.note, 24)) or ""), C.red)
    else
      r.cand = nil
      r:Hide()
    end
  end
end

-- The tooltip the cursor is resting on is rebuilt from the row's new contents, or closed if the row is gone.
local function RefreshTip()
  if not tipOwner or not GameTooltip then return end
  if not (GameTooltip.IsOwned and GameTooltip:IsOwned(tipOwner)) then tipOwner = nil return end
  if tipOwner.IsVisible and not tipOwner:IsVisible() then HideTip() return end
  ShowTip(tipOwner, tipTitle, tipText)
end

function UI.Refresh()
  if not panel or not panel:IsShown() then return end
  local s = API.Status()
  -- Presence: counted once per refresh and read by the rows, the header, the buttons and the send click.
  local pc = API.PresenceCounts and API.PresenceCounts() or { filtering = false }
  UI.presence = pc
  -- The roster count is the signal, not guildFullAt: the export refreshes every minute or so on its own, whereas
  -- guildFullAt only moves when somebody clicks and gets refused -- so a panel driven by it says nothing is wrong
  -- right up until an officer wastes a key press finding out.
  fullBlocked = (s.rosterTotal or 0) >= (s.guildCap or 1000)
  if not fullBlocked then fullArmedUntil = 0 end
  RefreshHeader(s, pc)
  RefreshTiles(s)
  RefreshQueue(s, pc, pc.filtering and not UI.showAll)
  RefreshFeed(s)
  RefreshRemoval(s)
  RefreshTip()
end

-- ---------------------------------------------------------------- show / hide
local function StartTicker()
  if refreshTicker or not (C_Timer and C_Timer.NewTicker) then return end
  refreshTicker = C_Timer.NewTicker(5, function()
    if panel and panel:IsShown() then UI.Refresh() else if refreshTicker then refreshTicker:Cancel() end refreshTicker = nil end
  end)
end

function UI.Show()
  Build()
  panel:Show()
  UI.Refresh()
  StartTicker()
end

function UI.Hide()
  if panel then panel:Hide() end
end

function UI.Toggle()
  if panel and panel:IsShown() then UI.Hide() else UI.Show() end
end

-- a new invite landed: open the panel unless the officer turned that off
function UI.Alert()
  if AUTO_SHOW then UI.Show() else UI.Refresh() end
end

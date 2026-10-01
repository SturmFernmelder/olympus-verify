bit = require("bit")  -- LuaBitOp: the same library WoW exposes as the global bit
-- Just enough of the WoW client for OlympusVerify + OlympusVerifyUI to load, handle events and build the panel.
local function D(y, mo, d, h) return os.time({ year = y, month = mo, day = d, hour = (h or 0), min = 0, sec = 0, isdst = false }) - (os.time({year=1970,month=1,day=1,hour=0}) ) end
UTC = D
NOW = D(2026, 9, 26, 12)
time = function() return NOW end
date = function(fmt, t) return os.date("!" .. fmt, t) end
wipe = function(t) for k in pairs(t) do t[k] = nil end return t end
unpack = unpack or table.unpack
PRINTS = {}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(PRINTS, m) end }
local FrameMT = {}
FrameMT.__index = function(t, k)
  local v = rawget(FrameMT, k)
  if v ~= nil then return v end
  -- WoW widget methods are CamelCase; anything else is a field the addon sets itself, and must read as nil
  if type(k) == "string" and k:match("^%u") then return function() end end
  return nil
end
function FrameMT.SetScript(self, ev, fn) self._scripts = self._scripts or {}; self._scripts[ev] = fn end
function FrameMT.GetScript(self, ev) return self._scripts and self._scripts[ev] end
function FrameMT.RegisterEvent(self, e) self._events = self._events or {}; self._events[e] = true end
function FrameMT.SetText(self, t) self._text = t; if self._fontString then self._fontString._text = t end end
function FrameMT.GetText(self) return self._text end
function FrameMT.Show(self)
  local old = self._shown; self._shown = true
  if old ~= true then local script = self:GetScript("OnShow"); if script then script(self) end end
end
function FrameMT.Hide(self)
  local old = self._shown; self._shown = false
  if old == true then local script = self:GetScript("OnHide"); if script then script(self) end end
end
function FrameMT.IsShown(self) return self._shown == true end
function FrameMT.IsVisible(self) return self._shown ~= false and (not self._parent or self._parent:IsVisible()) end
function FrameMT.SetShown(self, v) self._shown = v and true or false end
function FrameMT.SetPoint(self, ...)
  local p = { ... }
  self._point = p
  self._points = self._points or {}
  for i, old in ipairs(self._points) do if old[1] == p[1] then self._points[i] = p; return end end
  self._points[#self._points + 1] = p
end
function FrameMT.ClearAllPoints(self) self._point = nil; self._points = {} end
function FrameMT.GetPoint(self) if self._point then return unpack(self._point) end end
function FrameMT.SetSize(self, w, h) self._w, self._h = w, h end
function FrameMT.SetHeight(self, h) self._h = h end
function FrameMT.GetHeight(self) return self._h or (self._kind == "FontString" and self:GetStringHeight()) or 0 end
function FrameMT.SetWidth(self, w) self._w = w end
function FrameMT.GetWidth(self) return self._w or 0 end
function FrameMT.SetEnabled(self, e) self._enabled = e end
function FrameMT.IsEnabled(self) return self._enabled ~= false end
function FrameMT.SetClampedToScreen(self, v) self._clamped = v end
function FrameMT.StartMoving(self) self._moving = true end
function FrameMT.StopMovingOrSizing(self) self._moving = false end
function FrameMT.SetUserPlaced(self, v) self._userPlaced = v end
function FrameMT.SetScale(self, v) self._scale = v end
function FrameMT.GetScale(self) return self._scale or 1 end
function FrameMT.GetEffectiveScale(self) return self:GetScale() end
function FrameMT.SetWordWrap(self, v) self._wrap = v end
function FrameMT.SetJustifyH(self, v) self._justifyH = v end
function FrameMT.SetJustifyV(self, v) self._justifyV = v end
function FrameMT.SetFontObject(self, v) self._fontObject = v end
function FrameMT.SetFont(self, path, size, flags) self._fontPath, self._fontSize, self._fontFlags = path, size, flags end
function FrameMT.GetFont(self) return self._fontPath or "mock-font", self._fontSize or 12, self._fontFlags or "" end
-- Synthetic text metrics are only for layout contracts, never proof of client font rendering.
local function lineWidth(self, line)
  local _, chars = line:gsub("[^\128-\191]", "")
  return chars * (self._fontSize or 12) * 0.55
end
function FrameMT.GetStringWidth(self)
  local s = tostring(self._text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  local width = 0
  for line in (s .. "\n"):gmatch("(.-)\n") do width = math.max(width, lineWidth(self, line)) end
  return width
end
function FrameMT.GetStringHeight(self)
  local s = tostring(self._text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  local lines = 0
  for line in (s .. "\n"):gmatch("(.-)\n") do
    lines = lines + (self._wrap and self._w and self._w > 0 and math.max(1, math.ceil(lineWidth(self, line) / self._w)) or 1)
  end
  return ((self._fontSize or 12) + 2) * lines
end
function FrameMT.GetFontString(self)
  return self._fontString
end
function FrameMT.SetFontString(self, font) self._fontString = font end
function FrameMT.SetNormalFontObject(self, object)
  self._normalFontObject = object
  if not self._fontString then self._fontString = self:CreateFontString(nil, "OVERLAY", object) end
  self._fontString:SetFontObject(object)
  self._fontString._text = self._text
end
function FrameMT.SetOwner(self, owner, anchor) self._owner, self._anchor = owner, anchor; self._lines = {} end
function FrameMT.IsOwned(self, owner) return self._shown == true and self._owner == owner end
function FrameMT.AddLine(self, text) self._lines = self._lines or {}; self._lines[#self._lines + 1] = text end
function FrameMT.Click(self, mouseButton) local f = self._scripts and self._scripts.OnClick; if self._enabled ~= false and f then f(self, mouseButton or "LeftButton") end end
FONTS, FRAMES, TEXTURES = {}, {}, {}
function FrameMT.CreateFontString(self, name, layer, template)
  local fs = setmetatable({ _parent = self, _kind = "FontString", _template = template, _shown = true }, FrameMT)
  table.insert(FONTS, fs); return fs
end
function FrameMT.SetColorTexture(self, ...) self._color = { ... } end
function FrameMT.CreateTexture(self, name, layer, template, sublevel)
  local texture = setmetatable({ _parent = self, _kind = "Texture", _layer = layer, _sublevel = sublevel, _shown = true }, FrameMT)
  table.insert(TEXTURES, texture)
  return texture
end
CreateFrame = function(kind, name, parent, template)
  local f = setmetatable({ _kind = kind, _name = name, _parent = parent, _template = template }, FrameMT)
  if kind == "Button" and template == "UIPanelButtonTemplate" then f:SetNormalFontObject("GameFontNormal") end
  if name then _G[name] = f end
  table.insert(FRAMES, f)
  return f
end
UIParent = CreateFrame("Frame", "UIParent")
UIParent:SetSize(1920, 1080)
GameTooltip = CreateFrame("GameTooltip", "GameTooltip")
GetAddOnMetadata = function() return "0.4.0" end
C_AddOns = { GetAddOnMetadata = function() return "0.4.0" end }
InCombatLockdown = function() return false end
LoggingChat = function() return true end
WHISPERS = {}
SendChatMessage = function(text, chan, _, to) table.insert(WHISPERS, { text = text, to = to }) end
hooksecurefunc = function() end
GetBuildInfo = function() return "1.15.x", "0", "", 11509 end
UISpecialFrames, SlashCmdList = {}, {}
ERR_GUILD_REMOVE_SS = "%s has been kicked out of the guild by %s."
C_Timer = { NewTicker = function(_, fn) return { Cancel = function() end } end, After = function() end }
ROSTER = {}
IsInGuild = function() return true end
GetNumGuildMembers = function() return #ROSTER, #ROSTER end
GetGuildRosterInfo = function(i)
  local m = ROSTER[i]; if not m then return nil end
  return m.name .. "-Forever", m.rank, m.rankIndex, m.level, "", "", m.note or "", m.onote or "", m.online or false, 0, m.class or "WARRIOR",
    nil, nil, nil, nil, nil, m.guid  -- 17th: the member's GUID
end
GetGuildRosterLastOnline = function(i) local m = ROSTER[i]; if not m or m.online then return nil end; return 0, 0, m.away or 0, 0 end
SetGuildRosterShowOffline = function() end
ROSTER_ASKS = 0
C_GuildInfo = { GuildRoster = function() ROSTER_ASKS = ROSTER_ASKS + 1 end, Invite = function() end, Uninvite = function() end, SetNote = function() end,
                MemberExistsByName = function(n) for _, m in ipairs(ROSTER) do if m.name == n or (m.name .. "-Forever") == n then return true end end return false end }
UnitName = function() return "Fern Melder" end  -- the 17 Sep client; test_myname.lua plays the 27 Sep one ("Fern")
PLAYER_GUID = "Player-4613-005A70D8"
UnitGUID = function(u) if u == "player" then return PLAYER_GUID end end
MACROS = {}
GetMacroIndexByName = function(n) for i, m in ipairs(MACROS) do if m.name == n then return i end end return 0 end
CreateMacro = function(name, icon, body) table.insert(MACROS, { name = name, body = body }); return #MACROS end
EditMacro = function(i, name, icon, body) MACROS[i].name = name; MACROS[i].body = body; return i end

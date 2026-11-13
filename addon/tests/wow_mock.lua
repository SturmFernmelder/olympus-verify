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
function FrameMT.HookScript(self, ev, fn)
  local prior=self:GetScript(ev)
  self:SetScript(ev,function(...) if prior then prior(...) end;return fn(...) end)
end
function FrameMT.SetAttribute(self, key, value) self._attributes=self._attributes or {};self._attributes[key]=value end
function FrameMT.GetAttribute(self, key) return self._attributes and self._attributes[key] end
function FrameMT.RegisterForClicks(self, ...) self._registeredClicks={...} end
function FrameMT.RegisterEvent(self, e) self._events = self._events or {}; self._events[e] = true end
function FrameMT.SetText(self, t) self._text = t; if self._fontString then self._fontString._text = t end end
function FrameMT.GetText(self) return self._text end
-- MOCK_PROPAGATE_HIDE (opt-in, CL2-003 suite): like the client, hiding or showing
-- a parent also runs OnHide/OnShow on its children that are shown themselves.
local function propagate(self, event)
  if MOCK_PROPAGATE_HIDE ~= true then return end
  for _, child in ipairs(FRAMES or {}) do
    if child._parent == self and child._shown == true then
      local script = child:GetScript(event); if script then script(child) end
      propagate(child, event)
    end
  end
end
function FrameMT.Show(self)
  local old = self._shown; self._shown = true
  if old ~= true then local script = self:GetScript("OnShow"); if script then script(self) end; propagate(self, "OnShow") end
end
function FrameMT.Hide(self)
  local old = self._shown; self._shown = false
  if old == true then local script = self:GetScript("OnHide"); if script then script(self) end; propagate(self, "OnHide") end
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
function FrameMT.Click(self, mouseButton, down)
  if self._enabled==false then return end
  local button=mouseButton or "LeftButton"
  local pre=self:GetScript("PreClick");if pre then pre(self,button,down==true) end
  local click=self:GetScript("OnClick");local result
  if click then result=click(self,button,down==true) end
  local post=self:GetScript("PostClick");if post then post(self,button,down==true) end
  return result
end
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
  if kind == "Button" and type(template)=="string" and template:find("UIPanelButtonTemplate",1,true) then f:SetNormalFontObject("GameFontNormal") end
  if kind=="Button" and type(template)=="string" and template:find("SecureActionButtonTemplate",1,true) then
    -- Model the client-owned handler, not a Lua call to the protected promotion
    -- API. Suites provide only the synthetic native slash-command execution.
    local function secureClick(self,button,down)
      if button~="LeftButton" or down or self:GetAttribute("type1")~="macro" then return end
      local text=self:GetAttribute("macrotext1") or self:GetAttribute("macrotext")
      if type(text)~="string" or text=="" then return end
      if type(SECURE_MACRO_EXECUTE)~="function" then error("secure macro executor not supplied by fixture") end
      local ok,result=pcall(SECURE_MACRO_EXECUTE,text,self)
      self._secureError=not ok and result or nil
      return ok and result or false
    end
    f._secureHandler=secureClick;f:SetScript("OnClick",secureClick)
  end
  if name then _G[name] = f end
  table.insert(FRAMES, f)
  return f
end
UIParent = CreateFrame("Frame", "UIParent")
UIParent:SetSize(1920, 1080)
GameTooltip = CreateFrame("GameTooltip", "GameTooltip")
GetAddOnMetadata = function() return "0.4.0" end
C_AddOns = { GetAddOnMetadata = function() return "0.4.0" end }
-- Lockdown is false unless a suite starts mock combat (MockCombatStart below).
-- Suites that replace InCombatLockdown themselves keep the earlier permissive model.
MOCK_LOCKDOWN, MOCK_COMBAT = false, false
InCombatLockdown = function() return MOCK_LOCKDOWN == true end
IsModifierKeyDown = function() return false end
IsShiftKeyDown = function() return false end
IsControlKeyDown = function() return false end
IsAltKeyDown = function() return false end
SLASH_GUILD_PROMOTE1,SLASH_GUILD_PROMOTE2 = "/gpromote","/guildpromote"
LoggingChat = function() return true end
WHISPERS = {}
SendChatMessage = function(text, chan, _, to) table.insert(WHISPERS, { text = text, to = to }) end
hooksecurefunc = function() end
GetBuildInfo = function() return "1.15.x", "0", "", 11509 end
OlympusVerifySlash234 = nil -- Each new mock is a fresh client, not a duplicate main-file load.
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

-- Combat lockdown model (CL2-003, 13 Nov 2026). Active only while MOCK_LOCKDOWN is
-- true, which MockCombatStart/MockCombatEnd drive. While it is true, insecure code
-- may not show, hide, move, resize, enable or set attributes on a protected frame
-- (one built from a Secure template, or a parent or anchor of one), may not
-- register a state driver on one and may not create a secure frame. As in the
-- client, a refused call does nothing; the mock records it in MOCK_BLOCKED, so a
-- suite fails if the addon makes one. Secure code (a state driver's snippet) runs
-- with MOCK_SECURE > 0; scripts it triggers on addon frames run insecure again.
MOCK_SECURE, MOCK_BLOCKED, MOCK_SECURE_ERRORS, MOCK_STATE_DRIVERS = 0, {}, {}, {}
local function region(self) return self._kind == "FontString" or self._kind == "Texture" end
function FrameMT.IsProtected(self)
  if region(self) then return false, false end
  if self._protected then return true, true end
  for _, f in ipairs(FRAMES) do
    if f._protected and f ~= self then
      local p = f._parent
      while p do if p == self then return true, false end; p = p._parent end
      for _, point in ipairs(f._points or {}) do if point[2] == self then return true, false end end
    end
  end
  return false, false
end
local function refused(self, call)
  if MOCK_LOCKDOWN ~= true or MOCK_SECURE > 0 then return false end
  if self ~= nil and not self:IsProtected() then return false end
  MOCK_BLOCKED[#MOCK_BLOCKED + 1] = { call = call, frame = self and (self._name or self._template or self._kind) or nil }
  return true
end
for _, method in ipairs({ "Show", "Hide", "SetShown", "SetPoint", "ClearAllPoints", "SetAllPoints", "SetSize", "SetWidth", "SetHeight",
  "SetParent", "SetScale", "SetAttribute", "SetEnabled", "Enable", "Disable", "RegisterForClicks", "SetFrameStrata", "SetFrameLevel" }) do
  local original = rawget(FrameMT, method)
  local visibility = method == "Show" or method == "Hide" or method == "SetShown"
  FrameMT[method] = function(self, ...)
    if refused(self, method) then return end
    if not original then return end
    if visibility and MOCK_SECURE > 0 then
      -- The visibility change is secure; the frame's own OnShow/OnHide scripts are addon code.
      local depth = MOCK_SECURE; MOCK_SECURE = 0
      local ok, err = pcall(original, self, ...)
      MOCK_SECURE = depth
      if not ok then error(err, 0) end
      return
    end
    return original(self, ...)
  end
end
local createFrame = CreateFrame
CreateFrame = function(kind, name, parent, template)
  local secure = type(template) == "string" and template:find("Secure", 1, true) ~= nil
  if secure and MOCK_LOCKDOWN == true and MOCK_SECURE == 0 then
    MOCK_BLOCKED[#MOCK_BLOCKED + 1] = { call = "CreateFrame", frame = name or template }
  end
  local f = createFrame(kind, name, parent, template)
  if secure then f._protected = true end
  if secure and template:find("SecureHandler", 1, true) then
    f._frameRefs = {}
    f.SetFrameRef = function(self, label, ref)
      if refused(self, "SetFrameRef") then return end
      self._frameRefs[label] = ref
    end
  end
  return f
end
SecureHandlerSetFrameRef = function(frame, label, ref) return frame:SetFrameRef(label, ref) end
-- Restricted-environment frame handles: only these methods, and protected-only Show/Hide in combat.
local function handle(frame)
  if type(frame) ~= "table" then return nil end
  local function restricted(name)
    if MOCK_LOCKDOWN == true and not frame:IsProtected() then error("restricted " .. name .. " on an unprotected frame in combat") end
  end
  return {
    GetFrameRef = function(_, label) return handle(frame._frameRefs and frame._frameRefs[label]) end,
    IsShown = function() return frame:IsShown() end,
    IsProtected = function() return frame:IsProtected() end,
    Hide = function() restricted("Hide"); frame:Hide() end,
    Show = function() restricted("Show"); frame:Show() end,
  }
end
local function conditional(values)
  for clause in (tostring(values) .. ";"):gmatch("([^;]*);") do
    clause = clause:match("^%s*(.-)%s*$")
    local condition, value = clause:match("^%[(.-)%]%s*(.*)$")
    if not condition then return clause ~= "" and clause or nil end
    if condition == "combat" and MOCK_COMBAT == true or condition == "nocombat" and MOCK_COMBAT ~= true then return value end
  end
end
local function secureRun(fn)
  MOCK_SECURE = MOCK_SECURE + 1
  local ok, err = pcall(fn)
  MOCK_SECURE = MOCK_SECURE - 1
  if not ok then MOCK_SECURE_ERRORS[#MOCK_SECURE_ERRORS + 1] = tostring(err) end
end
function MockEvaluateStateDrivers()
  for _, driver in ipairs(MOCK_STATE_DRIVERS) do
    if driver.active then
      local frame, state = driver.frame, driver.state
      local value = conditional(driver.values)
      if frame:GetAttribute("state-" .. state) ~= value then
        secureRun(function()
          frame:SetAttribute("state-" .. state, value)
          local body = frame:GetAttribute("_onstate-" .. state)
          if type(body) == "string" then
            local chunk = assert(loadstring(body))
            setfenv(chunk, { self = handle(frame), stateid = state, newstate = value })
            chunk()
          end
        end)
      end
    end
  end
end
RegisterStateDriver = function(frame, state, values)
  if refused(frame, "RegisterStateDriver") then return end
  if not frame or not frame._protected then error("RegisterStateDriver needs a protected frame") end
  for _, driver in ipairs(MOCK_STATE_DRIVERS) do
    if driver.frame == frame and driver.state == state then driver.values, driver.active = values, true; MockEvaluateStateDrivers(); return end
  end
  MOCK_STATE_DRIVERS[#MOCK_STATE_DRIVERS + 1] = { frame = frame, state = state, values = values, active = true }
  MockEvaluateStateDrivers()
end
UnregisterStateDriver = function(frame, state)
  if refused(frame, "UnregisterStateDriver") then return end
  for _, driver in ipairs(MOCK_STATE_DRIVERS) do if driver.frame == frame and driver.state == state then driver.active = false end end
end
-- Deliver an event to every mock frame registered for it, in creation order.
function MockFireEvent(event, ...)
  local targets = {}
  for _, f in ipairs(FRAMES) do if f._events and f._events[event] then targets[#targets + 1] = f end end
  for _, f in ipairs(targets) do local script = f:GetScript("OnEvent"); if script then script(f, event, ...) end end
end
-- Combat start: by default the client fires PLAYER_REGEN_DISABLED before lockdown
-- begins. lockdownFirst models the case Codex raised, where it does not.
function MockCombatStart(lockdownFirst)
  MOCK_COMBAT = true
  if lockdownFirst then MOCK_LOCKDOWN = true end
  MockFireEvent("PLAYER_REGEN_DISABLED")
  MOCK_LOCKDOWN = true
  MockEvaluateStateDrivers()
end
function MockCombatEnd()
  MOCK_COMBAT, MOCK_LOCKDOWN = false, false
  MockEvaluateStateDrivers()
  MockFireEvent("PLAYER_REGEN_ENABLED")
end

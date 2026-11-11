-- .233 pending file-exchange alert. Timers never call Sync/ReloadUI or a guild action.
local API = OlympusVerifyAPI
if type(API) ~= "table" then return end
local A = { REFRESH_INTERVAL = 180, CHIME_INTERVAL = 30 }
OlympusVerifyAutoSync = A
local f, state = CreateFrame("Frame"), { active = false, contexts = {}, held = "off", attempted = false, timerReady = false }
local function pref(create)
  if type(OlympusVerifyDB) ~= "table" then return nil end
  if type(OlympusVerifyDB.pendingSync233) ~= "table" then
    if create == false then return nil end
    OlympusVerifyDB.pendingSync233 = { sound = true }
  end
  return OlympusVerifyDB.pendingSync233
end
local function mono()
  if type(GetTime)~="function" then return nil end
  local ok,value=pcall(GetTime)
  if not ok then return nil end
  if type(issecretvalue)=="function" then local known,secret=pcall(issecretvalue,value);if not known or secret then return nil end end
  if type(value)=="number" and value==value and value>=0 and value<math.huge then return value end
end
local function readable(value)
  if type(issecretvalue) == "function" then local ok, secret = pcall(issecretvalue, value); if not ok or secret then return false end end
  return true
end
local function seconds(value)
  return readable(value) and type(value)=="number" and value==math.floor(value)
    and value>0 and value<=time() and value or nil
end
local function stamp(value, format)
  if not seconds(value) or type(date)~="function" then return "unavailable" end
  local ok,text=pcall(date,format or "%d %b %H:%M:%S",value)
  return ok and type(text)=="string" and text or "unavailable"
end
local function facts()
  local ok, value = pcall(API.AutoSyncFacts)
  return ok and type(value) == "table" and value.strict == true and type(value.digest) == "string" and value or nil
end
local function activity()
  state.lastInput = mono()
end
local function facingHeld()
  if type(GetPlayerFacing) ~= "function" then return "facing status unavailable" end
  local ok, facing = pcall(GetPlayerFacing)
  if not ok or not readable(facing) or type(facing) ~= "number" or facing ~= facing then return "facing status unavailable" end
  local changed = state.facing ~= nil and math.abs(facing - state.facing) > 0.00001
  state.facing = facing
  if changed then activity(); return "turning" end
end
local function boolean(name, required, ...)
  local fn = rawget(_G, name)
  if type(fn) ~= "function" then if required then return nil end; return false end
  local ok, value = pcall(fn, ...)
  if not ok or not readable(value) or type(value) ~= "boolean" then return nil end
  return value
end
local function contextHeld(hardware)
  if not state.active then return "loading" end
  local combat = boolean("InCombatLockdown", true)
  if combat == nil then return "combat status unavailable" elseif combat then return "combat" end
  for _, spec in ipairs({ { "UnitAffectingCombat", "combat", "player" }, { "UnitIsDeadOrGhost", "dead", "player" },
    { "UnitOnTaxi", "taxi", "player" }, { "IsFalling", "falling" }, { "IsFlying", "flying" },
    { "CursorHasItem", "item on cursor" }, { "SpellIsTargeting", "spell targeting" }, { "IsMouseButtonDown", "mouse button held" } }) do
    local value
    if hardware and spec[1] == "IsMouseButtonDown" then value=false else value=boolean(spec[1], true, spec[3]) end
    if value == nil then return "activity status unavailable" elseif value then return spec[2] end
  end
  if type(GetUnitSpeed) ~= "function" then return "movement status unavailable" end
  local ok, speed = pcall(GetUnitSpeed, "player")
  if not ok or not readable(speed) or type(speed) ~= "number" or speed ~= speed then return "movement status unavailable" end
  if speed ~= 0 then activity(); return "moving" end
  for _, name in ipairs({ "UnitCastingInfo", "UnitChannelInfo" }) do
    local fn = rawget(_G, name)
    if type(fn) == "function" then
      local success, value = pcall(fn, "player")
      if not success or not readable(value) then return "cast status unavailable" end
      if value ~= nil then activity(); return "casting" end
    else return "cast status unavailable" end
  end
  if type(GetCurrentKeyBoardFocus) ~= "function" then return "keyboard focus unavailable" end
  local focusOK, focus = pcall(GetCurrentKeyBoardFocus)
  if not focusOK or not readable(focus) then return "keyboard focus unavailable" end
  if focus ~= nil then activity(); return "typing" end
  for _, held in pairs(state.contexts) do if held then return held end end
  for _, name in ipairs({ "TradeFrame", "MailFrame", "OpenMailFrame", "BankFrame", "GuildBankFrame", "AuctionHouseFrame", "AuctionFrame",
    "MerchantFrame", "LootFrame", "QuestFrame", "GossipFrame", "ItemTextFrame", "TradeSkillFrame", "CraftFrame", "ProfessionsFrame",
    "CinematicFrame", "MovieFrame", "GameMenuFrame", "SettingsPanel", "InterfaceOptionsFrame", "StaticPopup1", "StaticPopup2", "StaticPopup3", "StaticPopup4",
    "ReadyCheckFrame", "LFGDungeonReadyDialog", "LFDRoleCheckPopup", "PVPReadyDialog" }) do
    local frame = rawget(_G, name)
    if frame then
      if type(frame.IsShown) ~= "function" then return "UI status unavailable" end
      local success, shown = pcall(frame.IsShown, frame)
      if not success or not readable(shown) or type(shown) ~= "boolean" then return "UI status unavailable" end
      if shown then return "interaction window open" end
    end
  end
  if not hardware then for _, name in ipairs({ "CharacterFrame", "SpellBookFrame", "TalentFrame", "PlayerSpellsFrame", "CollectionsJournal", "EncounterJournal", "CommunitiesFrame", "GuildFrame", "FriendsFrame", "WorldMapFrame", "PVEFrame", "PVPQueueFrame", "CalendarFrame", "AchievementFrame", "HelpFrame", "VideoOptionsFrame", "AudioOptionsFrame", "ChatConfigFrame", "EditModeManagerFrame", "OlympusLaunch229Window" }) do
    local frame = rawget(_G, name)
    if frame then
      if type(frame.IsShown) ~= "function" then return "UI status unavailable" end
      local success, shown = pcall(frame.IsShown, frame)
      if not success or not readable(shown) or type(shown) ~= "boolean" then return "UI status unavailable" end
      if shown then return "review window open" end
    end
  end end
end

local function UpdateAlert()
  if not A.button then
    local b = CreateFrame("Button", "OlympusPendingSync233", UIParent, "UIPanelButtonTemplate")
    b:SetSize(320, 46); b:SetMovable(true); b:EnableMouse(true); b:SetClampedToScreen(true)
    b:SetFrameStrata("FULLSCREEN_DIALOG"); b:SetToplevel(true)
    b:RegisterForClicks("AnyDown", "AnyUp")
    b:RegisterForDrag("RightButton")
    b:SetScript("OnDragStart", function(self) self:StartMoving() end)
    b:SetScript("OnDragStop", function(self)
      self:StopMovingOrSizing()
      local point, _, relative, x, y = self:GetPoint()
      local p = pref()
      local allowed = { TOP=true, BOTTOM=true, LEFT=true, RIGHT=true, CENTER=true, TOPLEFT=true, TOPRIGHT=true, BOTTOMLEFT=true, BOTTOMRIGHT=true }
      if p and allowed[point] and allowed[relative] and type(x)=="number" and type(y)=="number" and x==x and y==y and math.abs(x)<10000 and math.abs(y)<10000 then
        p.position = { point=point, relative=relative, x=x, y=y }
      end
    end)
    b:SetScript("OnClick", function(_, mouse, down) if mouse == "LeftButton" and not down then A.HardwareSync() end end)
    local p = pref(false); local pos = p and p.position
    local allowed = { TOP=true, BOTTOM=true, LEFT=true, RIGHT=true, CENTER=true, TOPLEFT=true, TOPRIGHT=true, BOTTOMLEFT=true, BOTTOMRIGHT=true }
    if type(pos)=="table" and allowed[pos.point] and allowed[pos.relative] and type(pos.x)=="number" and type(pos.y)=="number" and pos.x==pos.x and pos.y==pos.y and math.abs(pos.x)<10000 and math.abs(pos.y)<10000 then
      b:SetPoint(pos.point, UIParent, pos.relative, pos.x, pos.y)
    else b:SetPoint("TOP", UIParent, "TOP", 0, -140) end
    A.button=b
  end
  local status=A.Status()
  local detail=status.lastRequestedAt and ("Requested "..stamp(status.lastRequestedAt,"%H:%M")
    .."; loaded "..stamp(status.loadedListAt,"%H:%M")..(status.displayState=="stale" and " (stale)" or ""))
    or "Click or press Sync (right-drag to move)"
  A.button:SetText((state.requested and "Sync requested: confirm the UI reload" or "Pending Verification Sync").."\n"..detail)
  A.button:SetScript("OnEnter",function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self,"ANCHOR_RIGHT");GameTooltip:SetText("Sync request and loaded server data")
    for _,line in ipairs(A.Description()) do GameTooltip:AddLine(line,0.9,0.86,0.75,true) end
    GameTooltip:Show()
  end)
  A.button:SetScript("OnLeave",function() if GameTooltip then GameTooltip:Hide() end end)
  if state.pendingAt and state.active then A.button:Show() else A.button:Hide() end
end
local function Chime()
  local p, clock = pref(false), mono()
  if p and p.sound~=false and state.active and clock and (not state.lastChime or clock-state.lastChime>=A.CHIME_INTERVAL) and type(PlaySound)=="function" then
    state.lastChime=clock
    pcall(PlaySound, SOUNDKIT and SOUNDKIT.RAID_WARNING or 8959, "Master")
  end
end
function A.Status()
  local p=pref(false)
  local display
  if type(API.Roster)=="table" and type(API.Roster.DisplayFacts)=="function" then
    local ok,value=pcall(API.Roster.DisplayFacts)
    if ok and type(value)=="table" then display=value end
  end
  return { enabled=false, mode="hardware-pending", sound=p and p.sound~=false or false,
    held=state.held or "waiting for native data", pending=state.pendingAt~=nil, requested=state.requested==true,
    lastRequestedAt=p and seconds(p.lastRequestedAt or p.lastSyncAt) or nil,
    capturedRosterAt=p and seconds(p.lastRequestRosterAt) or nil,
    loadedListAt=display and seconds(display.queriedAt) or nil,
    loadedRosterAt=display and seconds(display.rosterObservedAt) or nil,
    displayState=display and (display.state=="loaded" or display.state=="stale") and display.state or "unavailable" }
end
function A.Description()
  local s=A.Status()
  return {
    "Last Sync requested: "..stamp(s.lastRequestedAt)..". This is a local request, not a server confirmation.",
    "Loaded server list queried: "..stamp(s.loadedListAt).."; server roster observed: "..stamp(s.loadedRosterAt).." ("..s.displayState..").",
    "Sync exports pending data and reloads once. The Watcher processes that export afterward; the reload can still load the older result.",
    "Wait for the Watcher result, then use Sync once more to load its newer file. If dates still do not advance, check the Watcher; repeated clicks do not confirm success.",
    "Loaded dates keep their original values. Current access is checked in Discord /verify-status. Live updates without reload are on hold.",
    s.held,
  }
end
local function RequestWithFacts(reason, source)
  if reason~="whisper" and reason~="native-change" and reason~="periodic" and reason~="queue-check" then return false end
  if not pref() then return false end
  if reason~="whisper" and not source then return false end
  local first=state.pendingAt==nil
  state.pendingAt=state.pendingAt or mono() or 0
  state.reason=state.reason=="whisper" and state.reason or reason
  if not state.requested then state.held="hardware click or keybind required" end
  if first then Chime() end
  UpdateAlert()
  return true
end
function A.Request(reason)
  if reason~="whisper" and reason~="native-change" and reason~="periodic" and reason~="queue-check" then return false end
  if not pref() then return false end
  if reason=="whisper" then pcall(API.ExportRoster); return RequestWithFacts(reason) end
  return RequestWithFacts(reason, facts())
end
local function NativeChangedWithFacts(source)
  if not source then return end
  local p=pref(false)
  if source.digest~=(state.digest or p and p.lastSyncedDigest) then RequestWithFacts("native-change", source) end
  state.digest=source.digest
end
function A.NativeChanged() return NativeChangedWithFacts(facts()) end
function A.RecordSync()
  local p,source=pref(),facts()
  if not p then return end
  p.lastRequestedAt=time()
  p.lastSyncAt=p.lastRequestedAt -- legacy cadence field; it never meant server completion
  p.lastRequestRosterAt=source and seconds(source.exportedAt) or nil
  if source then p.lastSyncedDigest=source.digest end
  state.requested=true
  state.held="sync requested; confirm that the UI reloads"
  UpdateAlert()
end
-- This function is reached only from the addon button, a key binding or a typed slash command.
-- Timer and event callbacks below only export/read/update the alert.
function A.HardwareSync()
  if OlympusVerifyUI and OlympusVerifyUI.preview then return false end
  -- The officer's explicit click/slash is the hardware event. Idle/movement,
  -- keyboard focus and a mailbox window do not veto a deliberate sync.
  local held=boolean("InCombatLockdown", true) ~= false and "combat or combat status unavailable" or nil
  if held then state.held=held; UpdateAlert(); return false end
  if state.requested then state.held="request unconfirmed; use the normal /reload command if needed"; UpdateAlert(); return false end
  if type(API.Sync)~="function" or not ((C_UI and type(C_UI.Reload)=="function") or type(ReloadUI)=="function") then
    state.held="reload API unavailable; type /reload in normal chat"; UpdateAlert(); return false
  end
  state.requested=true
  local success,result=pcall(API.Sync)
  if not success or result==false then state.held="client refused Sync; use the normal /reload command" end
  UpdateAlert()
  return success and result~=false
end
function A.SetEnabled(value)
  -- Compatibility with the retired timer preference never starts automatic reloads.
  local p=pref(); if not p or type(value)~="boolean" then return false end
  p.sound=value; UpdateAlert(); return true
end
function A.Command(argument)
  local arg=string.lower(argument or "")
  if arg=="sound on" then A.SetEnabled(true) elseif arg=="sound off" then A.SetEnabled(false) end
  local s=A.Status()
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("Olympus: timer reloads are disabled. Pending Sync "..(s.pending and "waiting" or "clear").."; "..s.held..". Click the alert or use the Sync keybind. /olv pending sound on|off.") end
  if DEFAULT_CHAT_FRAME then for _,line in ipairs(A.Description()) do DEFAULT_CHAT_FRAME:AddMessage("Olympus: "..line) end end
end
function A.Tick()
  if not state.active then return end
  -- Throttled request only; its native roster event publishes the complete export.
  -- No timer dispatches Sync, ReloadUI, invite, promote, purge or MOTD.
  if type(API.RefreshRosterForPending235)=="function" then pcall(API.RefreshRosterForPending235) end
  local source,p=facts(),pref(false)
  if source then
    NativeChangedWithFacts(source)
    local last=p and p.lastSyncAt or state.wallBoot
    if type(last)=="number" and time()>=last and time()-last>=A.REFRESH_INTERVAL then RequestWithFacts("periodic", source) end
  end
  if state.pendingAt then state.held=state.requested and state.held or contextHeld(false) or "hardware click or keybind required" end
  UpdateAlert()
end
local open={TRADE_SHOW="trade",MAIL_SHOW="mail",BANKFRAME_OPENED="bank",GUILDBANKFRAME_OPENED="guild bank",AUCTION_HOUSE_SHOW="auction",MERCHANT_SHOW="merchant",CINEMATIC_START="cinematic",LOADING_SCREEN_ENABLED="loading"}
local close={TRADE_CLOSED="TRADE_SHOW",MAIL_CLOSED="MAIL_SHOW",BANKFRAME_CLOSED="BANKFRAME_OPENED",GUILDBANKFRAME_CLOSED="GUILDBANKFRAME_OPENED",AUCTION_HOUSE_CLOSED="AUCTION_HOUSE_SHOW",MERCHANT_CLOSED="MERCHANT_SHOW",CINEMATIC_STOP="CINEMATIC_START",LOADING_SCREEN_DISABLED="LOADING_SCREEN_ENABLED"}
f:SetScript("OnEvent",function(_,event)
  if event=="PLAYER_LOGIN" then
    if state.started then return end
    state.started=true; state.wallBoot=time(); pref()
    if C_Timer and type(C_Timer.NewTicker)=="function" then pcall(C_Timer.NewTicker,5,function() pcall(A.Tick) end) end
  elseif event=="PLAYER_ENTERING_WORLD" then state.active=true
  elseif event=="PLAYER_LEAVING_WORLD" then state.active=false
  elseif event=="ADDON_ACTION_FORBIDDEN" or event=="ADDON_ACTION_BLOCKED" then
    if state.requested then state.held="client blocked reload; use normal /reload, no bypass or automatic retry" end
  elseif open[event] then state.contexts[event]=open[event]
  elseif close[event] then state.contexts[close[event]]=nil end
  UpdateAlert()
end)
for _,event in ipairs({"PLAYER_LOGIN","PLAYER_ENTERING_WORLD","PLAYER_LEAVING_WORLD","ADDON_ACTION_FORBIDDEN","ADDON_ACTION_BLOCKED"}) do pcall(f.RegisterEvent,f,event) end
for event in pairs(open) do pcall(f.RegisterEvent,f,event) end
for event in pairs(close) do pcall(f.RegisterEvent,f,event) end
A.frame=f
function OlympusVerify_Sync() return A.HardwareSync() end

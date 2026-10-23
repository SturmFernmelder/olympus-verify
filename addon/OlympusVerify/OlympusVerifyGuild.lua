-- Guild roster display and one-click editable reminders. No message is sent by this module.
-- Lists are watcher snapshots, not live Discord authority. Olympus Guild's optional public
-- bridge supplies display hints only; it can never mark a character verified here.
local API = OlympusVerifyAPI
if type(API) ~= "table" or type(API.Roster) ~= "table" then return end
local G = {}
OlympusVerifyGuild = G
local MAX_MEMBERS, LIST_AGE, MAX_ROWS = 1000, 3600, 60
local COLUMN_WIDTH, NAV_GUTTER, SCREEN_MARGIN = 116, 48, 8
local REMINDER = "Hi! Please verify your Olympus character at https://olympus.roachcouncil.com/ — sign in with Discord and follow the verification steps. Happy to help if you get stuck!"
local LABEL = { verified = "Verified", unverified = "Not verified", pending = "Verifying", unknown = "Unknown", stale = "Stale list" }
local COLOR = { verified = "|cff8ac69a", unverified = "|cffe57572", pending = "|cffe8be65", unknown = "|cff9ea3ad", stale = "|cffe8be65" }
local nativeNames, nativeGuids, nativeAliases, nativeAt, loadedIdentity, changedGuild = {}, {}, {}, nil, nil, false
local sourceIndex
local hosts, bridgeEnabled = {}, false -- session-only opt-in, never SavedVariables

local function Text(v, limit)
  if type(issecretvalue) == "function" then
    local ok, secret = pcall(issecretvalue, v)
    if not ok or secret then return nil end
  end
  if type(v) ~= "string" or v == "" or #v > (limit or 100) or v:find("[%c|]") then return nil end
  return v
end
local function Key(v) local s = Text(v); return s and string.lower(s) end
-- The watcher uses the existing shared character-name codec (plain name, no realm).
-- Resolve that alias only inside this client's unique current guild roster; never use it for green/GUID proof.
local function WatcherKey(v)
  local s = Text(v)
  local normalize = OlympusHmac and OlympusHmac.normalizeCharacter
  return s and type(normalize) == "function" and normalize(s) or nil
end
local function Preview()
  return OlympusVerifyUI and OlympusVerifyUI.preview ~= nil
    or OlympusVerifyPreview and OlympusVerifyPreview.State and OlympusVerifyPreview.State() ~= nil
end
local function Combat() return InCombatLockdown and InCombatLockdown() end
local function Gamepad()
  local style = C_InputInterfaceStyle and C_InputInterfaceStyle.GetCurrentStyle
  local pad = Enum and Enum.InputDeviceInterfaceType and Enum.InputDeviceInterfaceType.Gamepad
  if style and pad then local ok, value = pcall(style); return not ok or value == pad end
  return false
end
local function Identity()
  if not IsInGuild or not IsInGuild() or not GetGuildInfo then return nil end
  local guild, _, _, realm = GetGuildInfo("player")
  guild, realm = Text(guild), Text(realm) or (GetRealmName and Text(GetRealmName()))
  return guild and realm and guild .. "\n" .. realm or nil
end
local function Fresh(at, now)
  return type(at) == "number" and at == math.floor(at) and at > 0 and now >= at and now - at <= LIST_AGE
end
local function Scan()
  local names, guids, aliases, count = {}, {}, {}, GetNumGuildMembers and GetNumGuildMembers() or 0
  if type(count) ~= "number" or count ~= math.floor(count) or count < 0 or count > MAX_MEMBERS then nativeNames, nativeGuids, nativeAliases, nativeAt = {}, {}, {}, nil; return end
  for i = 1, count do
    local name, _, _, _, _, _, _, _, online, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    name, guid = Text(name), Text(guid, 40)
    if name then
      local m = { name = name, guid = guid, online = online and true or false }
      local nk = Key(name)
      if names[nk] ~= nil then names[nk] = false else names[nk] = m end
      if guid then if guids[guid] ~= nil then guids[guid] = false else guids[guid] = m end end
      local alias = WatcherKey(name)
      if alias then if aliases[alias] ~= nil then aliases[alias] = false else aliases[alias] = m end end
    end
  end
  nativeNames, nativeGuids, nativeAliases, nativeAt = names, guids, aliases, time()
end
local function Live(name, guid)
  local nk = Key(name)
  if not nk then return nil end
  local hit
  if guid then hit = nativeGuids[guid] else hit = nativeNames[nk] end
  if not hit or nativeNames[nk] == false or Key(hit.name) ~= nk or guid and hit.guid ~= guid then return nil end
  return hit
end
local function Index(v, u, now)
  if sourceIndex and sourceIndex.v == v and sourceIndex.u == u and now >= sourceIndex.at and now - sourceIndex.at < 5 then return sourceIndex end
  local ix = { v = v, u = u, at = now, guids = {}, names = {}, unverified = {}, ambiguous = #v.members > MAX_MEMBERS or #u.members > MAX_MEMBERS }
  for i = 1, math.min(#v.members, MAX_MEMBERS) do
    local r = v.members[i]
    if type(r) == "table" then
      local rg, rn = Text(r.guid, 40), WatcherKey(r.name)
      if rg then if ix.guids[rg] ~= nil then ix.guids[rg] = false else ix.guids[rg] = r end end
      if rn then ix.names[rn] = true end
    end
  end
  for i = 1, math.min(#u.members, MAX_MEMBERS) do
    local r = u.members[i]
    local rn = type(r) == "table" and WatcherKey(r.name)
    if rn then if ix.unverified[rn] ~= nil then ix.unverified[rn] = false else ix.unverified[rn] = r end end
  end
  sourceIndex = ix
  return ix
end

-- Only exact GUID matches are green. A name-only legacy link remains explicitly unknown;
-- a new character reusing a linked name must not inherit that character's verification.
function G.Verification(name, guid)
  local now, identity = time(), Identity()
  if not identity or changedGuild or not loadedIdentity or identity ~= loadedIdentity then
    return { status = "unknown", reason = "Guild changed or snapshot scope is unknown. Reload with the current watcher's list." }
  end
  if not nativeAt or now < nativeAt or now - nativeAt > 5 then
    local ok = pcall(Scan)
    if not ok then nativeNames, nativeGuids, nativeAliases, nativeAt = {}, {}, {}, nil end
  end
  if not nativeAt then return { status = "unknown", reason = "The current native guild roster could not be read." } end
  local m = Live(Text(name), Text(guid, 40))
  if not m then return { status = "unknown", reason = "No unique matching character in the current native guild roster." } end
  local q = type(OlympusQueue) == "table" and OlympusQueue or nil
  local v, u = q and q.verified, q and q.unverified
  if type(v) ~= "table" or type(u) ~= "table" or type(v.members) ~= "table" or type(u.members) ~= "table" then
    return { status = "unknown", reason = "No complete watcher verification lists are loaded. Sync and reload first." }
  end
  if not Fresh(v.fetchedAt, now) or not Fresh(u.fetchedAt, now) or not Fresh(u.snapshotAt, now) then
    return { status = "stale", reason = "Watcher list or its server roster is over one hour old, missing a date, or from a future clock. Sync and reload." }
  end
  local ix, nk = Index(v, u, now), WatcherKey(m.name)
  local matched, unverified = m.guid and ix.guids[m.guid], nk and ix.unverified[nk]
  if ix.ambiguous or matched == false or unverified == false or matched and unverified then
    return { status = "unknown", reason = "The loaded verification lists are ambiguous or disagree. Refresh them before contacting anyone." }
  end
  if matched and matched.status == "member" then
    return { status = "verified", reason = "Exact live GUID matched the watcher's linked-member list; this is a dated display snapshot.", at = v.fetchedAt, guid = m.guid, name = m.name }
  end
  if matched or nk and ix.names[nk] or not m.guid then
    return { status = "unknown", reason = "Only a name/old account state matched, or the native GUID is unavailable. No current GUID verification is claimed." }
  end
  if unverified then
    if nativeAliases[nk] ~= m or Text(unverified.name):find("-", 2, true) and Key(unverified.name) ~= Key(m.name) then
      return { status = "unknown", reason = "The watcher's plain-name alias is ambiguous in the native guild roster or its explicit realm differs. No reminder is offered." }
    end
    return { status = unverified.pending and "pending" or "unverified", reason = unverified.pending and "The watcher reports a verification already in progress." or "The current watcher's unverified list names this unique native character.", at = u.fetchedAt, guid = m.guid, name = m.name, online = m.online }
  end
  return { status = "unknown", reason = "This character is absent from the loaded watcher lists. Absence is not proof of being unverified." }
end
API.Roster.Verification = G.Verification

function G.OpenWhisper(name, guid)
  if Preview() then return false, "Preview is on; no reminder can be opened." end
  if Combat() or Gamepad() then return false, "Open the reminder out of combat using mouse and keyboard." end
  -- Re-read the current native roster and the dated lists at the click, never trust a recycled row.
  local ok = pcall(Scan)
  if not ok then return false, "The current native roster could not be read." end
  sourceIndex = nil
  local r = G.Verification(name, guid)
  if r.status ~= "unverified" or not r.online then return false, "Only an online character currently shown as not verified can receive this editable reminder." end
  local util = ChatFrameUtil
  local choose = util and util.ChooseBoxForSend or ChatEdit_ChooseBoxForSend
  local open = util and util.OpenChat or ChatFrame_OpenChat
  if type(choose) ~= "function" or type(open) ~= "function" then
    return false, "This client cannot open an addressed editable whisper. Use the game's whisper UI for " .. r.name .. "."
  end
  local edit = choose()
  if not edit or not edit.GetText or edit:GetText() ~= "" then return false, "Finish or close your existing chat draft before opening a reminder." end
  -- Direct native recipient setters preserve Forever's multiword names without slash parsing.
  if type(edit.SetTellTarget) ~= "function" or type(edit.SetChatType) ~= "function" or type(edit.GetTellTarget) ~= "function" then
    return false, "This chat layout has no exact-name whisper editor. Use the game's whisper UI for " .. r.name .. "."
  end
  edit:SetTellTarget(r.name); edit:SetChatType("WHISPER"); open("", edit.chatFrame)
  local active = util and util.GetActiveWindow or ChatEdit_GetActiveWindow
  if type(active) ~= "function" or active() ~= edit or edit:GetTellTarget() ~= r.name
    or not edit.GetChatType or edit:GetChatType() ~= "WHISPER" then
    return false, "The game's whisper editor or target changed. No reminder was inserted."
  end
  edit:SetText(REMINDER)
  if edit.HighlightText then edit:HighlightText() end
  return true -- deliberately no SendChatMessage / Enter / queued send
end
API.Roster.OpenWhisper = G.OpenWhisper

-- Read-only session opt-in. Source inspected: dnl-gentile/olympus-addon 1.2.3,
-- f60f18814f2426a5c21f97e207611871a06366b4, Olympus/Bridge.lua (MIT).
-- API v1 exports council names, NOT a census or guild-member snapshot. Do not read ns/OlympusDB.
function G.OlympusSnapshot()
  if not bridgeEnabled then return nil, "Optional Olympus Guild bridge is off (/olv olympus on)." end
  local bridge = rawget(_G, "OlympusBridge")
  if type(bridge) ~= "table" or rawget(bridge, "API_VERSION") ~= 1 or type(rawget(bridge, "GetCouncil")) ~= "function" then
    return nil, "Olympus Guild public bridge v1 is unavailable. No private census is read."
  end
  local ok, names, realm = pcall(bridge.GetCouncil)
  if not ok or type(names) ~= "table" or #names > 64 then return nil, "Olympus Guild bridge returned an unsupported snapshot." end
  local out = { source = "Olympus Guild public bridge v1", authority = "display-only", observedAt = time(), realm = Text(realm, 200), council = {}, censusAvailable = false }
  for i = 1, #names do local name = Text(names[i], 80); if not name then return nil, "Olympus Guild bridge names are unreadable." end; out.council[i] = name end
  return out
end
local function Say(s) if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cffc9a86cOlympus Verify:|r " .. s) end end
function G.OlympusCommand(arg)
  if arg == "off" then bridgeEnabled = false; Say("Optional Olympus Guild bridge off."); return end
  if arg == "on" then bridgeEnabled = true end
  local s, why = G.OlympusSnapshot()
  if not s then Say(why); return end
  Say(string.format("Optional local bridge: %d public council names, realm %s. Display hints only; no census API and no Discord verification authority.", #s.council, s.realm or "not supplied"))
end

local function Tooltip(button, r)
  if not GameTooltip then return end
  GameTooltip:SetOwner(button, "ANCHOR_RIGHT")
  GameTooltip:SetText(r.status == "unverified" and "Whisper Unverified" or "Olympus Discord verification")
  GameTooltip:AddLine(r.reason, 0.9, 0.86, 0.75, true)
  if r.at then GameTooltip:AddLine("Watcher fetched " .. date("%d %b %H:%M", r.at), 0.7, 0.7, 0.7) end
  if r.status == "unverified" then GameTooltip:AddLine("Online: click to open an editable whisper. Nothing is sent until you press Enter.", 0.9, 0.8, 0.5, true) end
  GameTooltip:Show()
end
-- CommunitiesFrame.xml owns this exact popup (frameLevel 1000); the addon's column must yield to it.
local function MemberDetailsShown(frame)
  local detail = frame.GuildMemberDetailFrame
  return detail and type(detail.IsShown) == "function" and detail:IsShown()
    and (not detail.IsVisible or detail:IsVisible())
end
local function LayerColumn(h)
  local f = h.frame
  h.column:SetFrameStrata((f.GetFrameStrata and f:GetFrameStrata()) or "MEDIUM")
  local level = f.GetFrameLevel and f:GetFrameLevel()
  if type(level) == "number" then h.column:SetFrameLevel(level) end
end
local function HideAll() for _, h in ipairs(hosts) do if h.column then h.column:Hide() end; if h.fallback then h.fallback:Hide() end end end
local function NewButton(parent)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(100, 20)
  local text = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  text:SetAllPoints(b); text:SetJustifyH("LEFT"); b.text = text
  b:SetScript("OnEnter", function(self) if self.result then Tooltip(self, self.result) end end)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  b:SetScript("OnClick", function(self)
    if not self.result then return end
    local row = self.nativeRow
    if row then
      local list = self.memberList
      if not row:IsShown() or row.IsVisible and not row:IsVisible() or not list or not list:IsShown()
        or list.IsVisible and not list:IsVisible() or list.expandedDisplay ~= true
        or list:GetSelectedClubId() ~= C_Club.GetGuildClubId() then Say("The native guild view changed. Read the current row before clicking again."); return end
      local ok, m = pcall(row.GetMemberInfo, row)
      if not ok or type(m) ~= "table" or Text(m.name) ~= self.rowName or Text(m.guid, 40) ~= self.rowGuid then
        Say("The native row changed while scrolling. Read the refreshed row before clicking again."); return
      end
    end
    local called, ok, why = pcall(G.OpenWhisper, self.result.name, self.result.guid)
    if not called then Say("The current native whisper editor could not be opened.") elseif not ok then Say(why) end
  end)
  return b
end
local function Discover()
  if Combat() or Gamepad() then return end
  local known = {}; for _, h in ipairs(hosts) do known[h.frame] = true end
  for _, f in ipairs({ CommunitiesFrame or false, GuildFrame or false, ClassicUIForeverGuildPanel or false }) do
    if f and not known[f] and type(f.IsShown) == "function" then
      local h = { frame = f, rows = {} }; hosts[#hosts + 1] = h; known[f] = true
      -- Separate addon-owned column: native widths, row handlers, sorting and notes stay intact.
      h.column = CreateFrame("Frame", nil, UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
      h.column:SetWidth(COLUMN_WIDTH)
      LayerColumn(h)
      local fill = h.column:CreateTexture(nil, "BACKGROUND")
      fill:SetAllPoints(h.column); fill:SetColorTexture(0.04, 0.045, 0.06, 1)
      if h.column.SetBackdrop then
        h.column:SetBackdrop({ bgFile = "Interface\\Buttons\\WHITE8X8", edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
          tile = false, edgeSize = 24, insets = { left = 6, right = 6, top = 6, bottom = 6 } })
        if h.column.SetBackdropColor then h.column:SetBackdropColor(0.04, 0.045, 0.06, 1) end
      end
      h.header = h.column:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
      h.header:SetPoint("TOPLEFT", h.column, "TOPLEFT", 8, -14); h.header:SetWidth(100)
      h.header:SetJustifyH("LEFT"); h.header:SetText("Discord\nverification")
      h.fallback = CreateFrame("Button", nil, UIParent, "UIPanelButtonTemplate")
      h.fallback:SetSize(116, 22); h.fallback:SetPoint("TOPRIGHT", f, "TOPRIGHT", -44, -28); h.fallback:SetText("Verify members")
      h.fallback:SetScript("OnClick", function() if not Combat() and not Preview() and OlympusVerifyRoster then OlympusVerifyRoster.Show() end end)
      if f.HookScript then f:HookScript("OnHide", function() h.column:Hide(); h.fallback:Hide() end) end
      local detail = f.GuildMemberDetailFrame
      if detail and detail.HookScript then
        detail:HookScript("OnShow", function() h.column:Hide(); h.fallback:Hide() end)
      end
      h.column:Hide(); h.fallback:Hide()
    end
  end
end
local function Paint()
  if Combat() or Gamepad() or Preview() then HideAll(); return end
  for _, h in ipairs(hosts) do
    local f, list, used = h.frame, h.frame.MemberList, 0
    local rosterVisible = f:IsShown() and (not f.IsVisible or f:IsVisible()) and (not f.GetAlpha or f:GetAlpha() > 0)
      and not MemberDetailsShown(f)
      and list and type(list.IsShown) == "function" and list:IsShown() and (not list.IsVisible or list:IsVisible())
      and list.expandedDisplay == true and type(list.GetSelectedClubId) == "function"
      and C_Club and type(C_Club.GetGuildClubId) == "function" and list:GetSelectedClubId() == C_Club.GetGuildClubId()
    if rosterVisible then
      local guildList = list.ScrollBox and type(list.ScrollBox.ForEachFrame) == "function"
      if guildList then
        -- ScrollBox can end inside the Guild window's navigation controls. Dock beyond the WHOLE window,
        -- leaving a fixed navigation gutter, and compare screen edges in UIParent coordinates.
        local right = f.GetRight and f:GetRight()
        local edge = UIParent.GetRight and UIParent:GetRight()
        local scale = f.GetEffectiveScale and f:GetEffectiveScale()
        local uiScale = UIParent.GetEffectiveScale and UIParent:GetEffectiveScale()
        guildList = type(right) == "number" and type(edge) == "number" and type(scale) == "number" and scale > 0
          and type(uiScale) == "number" and uiScale > 0
          and right * scale / uiScale + NAV_GUTTER + COLUMN_WIDTH + SCREEN_MARGIN <= edge
      end
      if guildList then
        h.fallback:Hide(); LayerColumn(h); h.column:ClearAllPoints()
        h.column:SetPoint("TOPLEFT", f, "TOPRIGHT", NAV_GUTTER, 0)
        h.column:SetPoint("BOTTOMLEFT", f, "BOTTOMRIGHT", NAV_GUTTER, 0); h.column:Show()
        list.ScrollBox:ForEachFrame(function(row)
          if used >= MAX_ROWS or not row:IsShown() or type(row.GetMemberInfo) ~= "function" or row.isInvitation then return end
          local m = row:GetMemberInfo()
          if type(m) ~= "table" or not Text(m.name) then return end
          used = used + 1
          local b = h.rows[used]
          if not b then b = NewButton(h.column); h.rows[used] = b end
          local r = G.Verification(m.name, m.guid)
          b.result, b.nativeRow, b.rowName, b.rowGuid = r, row, Text(m.name), Text(m.guid, 40)
          b.memberList = list
          b.text:SetText((COLOR[r.status] or COLOR.unknown) .. LABEL[r.status] .. "|r")
          b:ClearAllPoints(); b:SetPoint("LEFT", h.column, "LEFT", 8, 0); b:SetPoint("TOP", row, "TOP", 0, 0)
          b:SetHeight(row:GetHeight()); b:Show()
        end)
      else h.column:Hide(); h.fallback:Show() end
    else h.column:Hide(); h.fallback:Hide() end
    for i = used + 1, #h.rows do h.rows[i].result = nil; h.rows[i]:Hide() end
  end
end

local events, elapsed, discoveryElapsed = CreateFrame("Frame"), 0, 0
events:RegisterEvent("PLAYER_LOGIN"); events:RegisterEvent("ADDON_LOADED"); events:RegisterEvent("GUILD_ROSTER_UPDATE")
events:RegisterEvent("PLAYER_GUILD_UPDATE"); events:RegisterEvent("PLAYER_REGEN_ENABLED"); events:RegisterEvent("PLAYER_REGEN_DISABLED")
events:SetScript("OnEvent", function(_, event, unit)
  if event == "PLAYER_LOGIN" then loadedIdentity = Identity()
  elseif event == "PLAYER_GUILD_UPDATE" and (unit == nil or unit == "player") then
    if loadedIdentity and Identity() ~= loadedIdentity then changedGuild = true end
  elseif event == "GUILD_ROSTER_UPDATE" then
    nativeAt, sourceIndex = nil, nil
    if not loadedIdentity and not changedGuild then loadedIdentity = Identity() end
  end
  if event == "PLAYER_REGEN_DISABLED" then HideAll(); return end
  pcall(Discover)
end)
events:SetScript("OnUpdate", function(_, dt)
  elapsed, discoveryElapsed = elapsed + dt, discoveryElapsed + dt
  if elapsed < 0.25 then return end; elapsed = 0
  if discoveryElapsed >= 2 then discoveryElapsed = 0; pcall(Discover) end
  if #hosts == 0 then return end
  local ok = pcall(Paint); if not ok then HideAll() end -- unreadable/unsupported client data never invents a status
end)

local previous = SlashCmdList and SlashCmdList.OLYMPUSVERIFY
if type(previous) == "function" then
  SlashCmdList.OLYMPUSVERIFY = function(msg, ...)
    local arg = type(msg) == "string" and msg:match("^%s*olympus%s*(.-)%s*$")
    if arg then if Preview() then Say("Leave preview before reading an optional bridge."); return end; return G.OlympusCommand(arg) end
    return previous(msg, ...)
  end
end

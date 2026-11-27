-- Shared officer desk. Only the chrome hides alongside a protected page in combat.
-- Its positioning parent is transparent and never reparented or hidden during lockdown.
local S = { pages = {}, tabs = {} }
OlympusVerifyWorkspace = S

local WIDTH, HEADER = 1200, 74
-- On a short display show fewer roster rows before shrinking the fonts.
local w, h = UIParent:GetWidth(), UIParent:GetHeight()
S.visibleRows = 14
if w and h and w>30 and h>30 then
  local available=(h-16)/math.min(1,(w-16)/WIDTH)
  S.visibleRows=math.max(8,math.min(14,14+math.floor((available-810)/22)))
end
local HEIGHT = 810 - (14-S.visibleRows)*22
S.contentHeight = HEIGHT-HEADER
local texture = "Interface\\Buttons\\WHITE8X8"
local template = BackdropTemplateMixin and "BackdropTemplate" or nil
local tabs = {
  { "roster", "Members", function() OlympusVerifyRoster.ShowRoster() end },
  { "promotions", "Promotions", function() OlympusVerifyRoster.ShowPromotions() end },
  { "inactive", "Inactive", function() OlympusVerifyRoster.ShowInactive() end },
  { "activity", "Guild activity", function() OlympusVerifyRoster.ShowActivity() end },
  { "operations", "Operations", function() OlympusVerifyUI.Show() end },
}

local function locked()
  return InCombatLockdown and InCombatLockdown()
end

local function fill(parent, layer, r, g, b, a)
  local t = parent:CreateTexture(nil, layer)
  t:SetColorTexture(r, g, b, a or 1)
  return t
end

local function button(parent, caption, width, onClick)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(width, 28)
  local label = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  label:SetPoint("CENTER")
  b:SetFontString(label)
  b:SetText(caption)
  b:SetScript("OnClick", onClick)
  b:SetHighlightTexture(texture)
  local hover = b:GetHighlightTexture()
  if hover and hover.SetVertexColor then hover:SetVertexColor(.22, .52, .54, .2) end
  return b
end

function S.IsShown()
  local page = S.pages[S.active]
  return page and page:IsShown() or false
end

function S.ShowMenu(menu)
  if S.openMenu and S.openMenu ~= menu then S.openMenu:Hide() end
  S.openMenu = menu
  menu:Show()
end

function S.Highlight(key)
  S.section = key
  if S.viewButton then
    local names={roster="Members",promotions="Promotions",inactive="Inactive"}
    if names[key] then S.viewButton:SetText("View: "..names[key].." v") end
    if S.back then S.back:SetShown(key=="activity" or key=="operations" or key=="inactive" and S.active=="inactive") end
    S.toolsButton:SetText(key=="activity" and "Tools: Guild activity v" or key=="operations" and "Tools: Operations v" or "Tools v")
  end
  if S.navigation then S.navigation:Hide() end
end

local function fit()
  if locked() then return end
  local w, h = UIParent:GetWidth(), UIParent:GetHeight()
  if w and h and w > 30 and h > 30 then S.shell:SetScale(math.min(1, (w-16)/WIDTH, (h-16)/HEIGHT)) end
end

function S.UpdateSyncGuidance(status)
  if S.syncHint then
    local sync=OlympusVerifyAutoSync
    S.syncHint:SetText(sync and type(sync.NextStep)=="function" and sync.NextStep(status) or "")
  end
end

function S.Parent()
  if S.shell then return S.shell end
  local shell = CreateFrame("Frame", "OlympusVerifyWorkspaceFrame", UIParent)
  S.shell = shell
  shell:SetSize(WIDTH, HEIGHT)
  shell:SetFrameStrata("DIALOG")
  shell:SetClampedToScreen(true)
  shell:SetMovable(true)
  local pos = OlympusVerifyDB and OlympusVerifyDB.deskPosition
  if pos and pos.point then shell:SetPoint(pos.point, UIParent, pos.relative or pos.point, pos.x, pos.y)
  else shell:SetPoint("CENTER", UIParent, "CENTER", 0, 0) end
  fit()
  local dragging=false
  local function finishDrag()
    -- The shell parents protected rows. A release or hide in lockdown must wait,
    -- even when the header has disappeared and will receive no further mouse event.
    if not dragging or locked() then return end
    shell:StopMovingOrSizing(); dragging=false
    local point, _, relative, x, y = shell:GetPoint()
    if OlympusVerifyDB and point then OlympusVerifyDB.deskPosition={point=point,relative=relative,x=x,y=y} end
  end
  shell:RegisterEvent("DISPLAY_SIZE_CHANGED")
  shell:RegisterEvent("UI_SCALE_CHANGED")
  shell:RegisterEvent("PLAYER_REGEN_DISABLED")
  shell:RegisterEvent("PLAYER_REGEN_ENABLED")
  shell:SetScript("OnEvent", function(_,event)
    if event=="PLAYER_REGEN_DISABLED" or event=="PLAYER_REGEN_ENABLED" then finishDrag() end
    if event~="PLAYER_REGEN_DISABLED" and S.IsShown() then fit() end
  end)

  local chrome = CreateFrame("Frame", nil, shell, template)
  S.chrome = chrome
  chrome:SetAllPoints(shell)
  chrome:Hide()
  chrome:SetScript("OnHide",finishDrag)
  if chrome.SetBackdrop then
    chrome:SetBackdrop({bgFile=texture, edgeFile=texture, edgeSize=1})
    chrome:SetBackdropColor(.034,.066,.080,.99)
    chrome:SetBackdropBorderColor(.32,.43,.44,1)
  end
  local bar = CreateFrame("Frame", nil, chrome)
  bar:SetPoint("TOPLEFT", 1, -1); bar:SetPoint("TOPRIGHT", -1, -1); bar:SetHeight(HEADER-1)
  fill(bar, "BACKGROUND", .055,.105,.124):SetAllPoints()
  bar:EnableMouse(true); bar:RegisterForDrag("LeftButton")
  bar:SetScript("OnDragStart", function()
    if not locked() then shell:StartMoving(); dragging=true end
  end)
  bar:SetScript("OnDragStop",finishDrag)
  bar:SetScript("OnHide",finishDrag)
  local title = bar:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 18, -10); title:SetText("Olympus Verify")
  local line = fill(bar,"ARTWORK",.21,.35,.37)
  line:SetPoint("BOTTOMLEFT"); line:SetPoint("BOTTOMRIGHT"); line:SetHeight(1)
  local nav=CreateFrame("Frame",nil,bar,template)
  S.navigation=nav
  -- The roster and Operations raise themselves within DIALOG when clicked. Keep
  -- navigation above either page, while full-screen confirmations retain priority.
  nav:SetFrameStrata("FULLSCREEN")
  nav:SetClampedToScreen(true)
  fill(nav,"BACKGROUND",.06,.12,.14,1):SetAllPoints();nav:EnableMouse(true);nav:Hide()
  local function open(owner, tools)
    if locked() then return end
    if nav:IsShown() and nav.owner==owner then nav:Hide();return end
    nav.owner=owner;nav:ClearAllPoints();nav:SetPoint("TOPLEFT",owner,"BOTTOMLEFT",0,-2)
    local n=0
    for i,spec in ipairs(tabs) do
      local item=S.tabs[spec[1]]
      if (i>3)==tools then
        item:ClearAllPoints();item:SetPoint("TOPLEFT",nav,"TOPLEFT",3,-3-28*n);item:Show();n=n+1
      else item:Hide() end
    end
    nav:SetSize(188,6+28*n);S.ShowMenu(nav)
  end
  S.viewButton=button(bar,"View: Members v",174,function(self) open(self,false) end)
  S.viewButton:SetPoint("BOTTOMLEFT",14,3)
  S.toolsButton=button(bar,"Tools v",160,function(self) open(self,true) end)
  S.toolsButton:SetPoint("LEFT",S.viewButton,"RIGHT",8,0)
  S.back=button(bar,"Back to roster",112,function()
    if not locked() and OlympusVerifyRoster then OlympusVerifyRoster.ReturnToRoster() end
  end)
  S.back:SetPoint("LEFT",S.toolsButton,"RIGHT",8,0);S.back:Hide()
  for _,spec in ipairs(tabs) do
    local fn=spec[3]
    S.tabs[spec[1]]=button(nav,spec[2],182,function() if not locked() then nav:Hide();fn() end end)
  end
  bar:HookScript("OnHide",function() nav:Hide() end)
  S.syncHint=bar:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall")
  S.syncHint:SetPoint("TOPRIGHT",bar,"TOPRIGHT",-135,-7);S.syncHint:SetWidth(530);S.syncHint:SetHeight(55)
  S.syncHint:SetJustifyH("LEFT");S.syncHint:SetWordWrap(true)
  local sync = button(bar, "Sync", 72, function()
    if OlympusVerifyAPI and OlympusVerifyAPI.Sync then OlympusVerifyAPI.Sync() end
  end)
  sync:SetPoint("RIGHT", bar, "RIGHT", -46, 0)
  fill(sync, "BACKGROUND", .12,.30,.31):SetAllPoints()
  sync:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self,"ANCHOR_BOTTOM"); GameTooltip:SetText("Sync")
    local api=OlympusVerifyAutoSync
    local lines=api and api.Description and api.Description() or {"Save pending changes and reload once."}
    for _,line in ipairs(lines) do GameTooltip:AddLine(line,1,1,1,true) end
    GameTooltip:Show()
  end)
  sync:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  S.syncButton = sync
  local close = CreateFrame("Button", nil, bar, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", -6, -5); close:SetScript("OnClick", function() S.Close() end)
  return shell
end

local function alert()
  if OlympusVerifyAutoSync and OlympusVerifyAutoSync.RefreshAlert then OlympusVerifyAutoSync.RefreshAlert() end
end

function S.Attach(which, page)
  local shell = S.Parent()
  S.pages[which] = page
  page.syncButton = S.syncButton
  page:ClearAllPoints()
  page:SetPoint("TOP", shell, "TOP", 0, -HEADER)
  page:SetScale(1)
  if page.HookScript then
    page:HookScript("OnShow", function()
      if which == S.active then S.chrome:Show() end
      alert()
    end)
    page:HookScript("OnHide", function()
      if which == S.active then S.chrome:Hide() end
      alert()
    end)
  end
end

function S.Close()
  local p = S.pages[S.active]
  if not p or not p:IsShown() then return end
  if S.active=="roster" then OlympusVerifyRoster.Hide()
  elseif S.active=="operations" then
    if not locked() then OlympusVerifyUI.Hide() end
  elseif S.active=="inactive" and locked() then
    if OlympusLaunch229 and OlympusLaunch229.DeferCombatClose then OlympusLaunch229.DeferCombatClose(p) end
  else
    p:Hide()
  end
end

function S.Activate(which)
  if locked() then return false end
  if S.active ~= which then S.Close() end
  S.active = which
  S.Highlight(which)
  S.UpdateSyncGuidance()
  fit()
  return true
end

function S.OpenInactive()
  if locked() or not OlympusVerifyInactiveDesk then return false end
  if not S.pages.inactive then
    local page = CreateFrame("Frame", "OlympusVerifyInactiveHost", S.Parent())
    page:SetSize(WIDTH, HEIGHT-HEADER)
    page:Hide()
    S.Attach("inactive", page)
    page:HookScript("OnHide", function() OlympusVerifyInactiveDesk.Hide() end)
    if type(UISpecialFrames)=="table" then table.insert(UISpecialFrames,"OlympusVerifyInactiveHost") end
  end
  if not S.Activate("inactive") then return false end
  local page = S.pages.inactive
  page:Show()
  OlympusVerifyInactiveDesk.Show(page)
  return true
end

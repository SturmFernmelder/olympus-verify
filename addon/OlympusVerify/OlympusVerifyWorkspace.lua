-- One officer window with independently built pages. Secure children are never
-- reparented or hidden while the client is in combat lockdown.
local S={pages={}}
OlympusVerifyWorkspace=S
function S.IsShown()
  local page=S.pages[S.active]
  return page and page:IsShown() or false
end
function S.Parent()
  if not S.shell then
    S.shell=CreateFrame("Frame","OlympusVerifyWorkspaceFrame",UIParent)
    S.shell:SetAllPoints(UIParent)
  end
  return S.shell
end
function S.Attach(which,page)
  S.pages[which]=page
  local choices={{"Operations",function() OlympusVerifyUI.Show() end},
    {"Roster",function() OlympusVerifyRoster.ShowRoster() end},
    {"Inactive",function() OlympusVerifyRoster.ShowInactive() end},
    {"Guild activity",function() OlympusVerifyRoster.ShowActivity() end},
    {"Sync",function() if OlympusVerifyAPI and OlympusVerifyAPI.Sync then OlympusVerifyAPI.Sync() end end}}
  local previous
  for _,choice in ipairs(choices) do
    local tab=CreateFrame("Button",nil,page,"UIPanelButtonTemplate")
    tab:SetSize(100,24);tab:SetText(choice[1]);tab:SetScript("OnClick",choice[2])
    if choice[1]=="Sync" then page.syncButton=tab end
    if previous then tab:SetPoint("LEFT",previous,"RIGHT",2,0) else tab:SetPoint("BOTTOMLEFT",page,"TOPLEFT",4,0) end
    previous=tab
  end
  if page.HookScript then
    local function updateAlert()
      if OlympusVerifyAutoSync and OlympusVerifyAutoSync.RefreshAlert then OlympusVerifyAutoSync.RefreshAlert() end
    end
    page:HookScript("OnShow",updateAlert);page:HookScript("OnHide",updateAlert)
  end
  if page.SetClampRectInsets then page:SetClampRectInsets(0,0,26,0) end
end
function S.Activate(which)
  local page=S.pages[which]
  local previous=S.pages[S.active]
  if previous and previous~=page and previous:IsShown() then
    if InCombatLockdown and InCombatLockdown() then return false end
    local x,y=previous:GetCenter()
    if S.active=="roster" then OlympusVerifyRoster.Hide() else OlympusVerifyUI.Hide() end
    if x and y and page then
      local ratio=previous:GetEffectiveScale()/page:GetEffectiveScale()
      page:ClearAllPoints();page:SetPoint("CENTER",UIParent,"BOTTOMLEFT",x*ratio,y*ratio)
    end
  end
  S.active=which
  return true
end

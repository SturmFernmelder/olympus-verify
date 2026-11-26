-- Exercise the real native desk, filters, checkboxes and reviewed queue against
-- synthetic WoW roster events. No code executes a game command.
dofile("wow_mock.lua")
local defaults = assert(loadfile("directive_fixture280.lua"))()
local names = defaults.ranks(_G)
local realm, guild, inCombat, permission, actorSlot = "", "OLYMPUS PRIME", false, true, 0
GetGuildInfo = function() return guild, names[actorSlot+1], actorSlot end
GetRealmName = function() return realm end
GetGuildRosterShowOffline = function() return true end
IsInGuild = function() return true end
InCombatLockdown = function() return inCombat end
C_GuildInfo.CanGuildRemove = function() return permission end
local effects = 0
local function forbidden() effects = effects + 1 end
C_GuildInfo.Uninvite, GuildUninvite, SendChatMessage, ReloadUI = forbidden, forbidden, forbidden, forbidden
local function row(name, serial, rank, days)
  return {name = name, guid = string.format("Player-9-%08X", serial), rank = names[rank+1],
    rankIndex = rank, level = 60, online = false, away = days}
end
local self, first, second = row("Officer One", 1, 0, 0), row("Hakuho Shö", 2, 9, 70), row("Candidate Two", 3, 8, 48)
self.online, PLAYER_GUID = true, self.guid
local protected, held, recent = row("Staff One", 4, 2, 100), row("Hold One", 5, 9, 100), row("Recent One", 6, 8, 7)
held.onote = "HOLD for school."
ROSTER = {self, first, second, protected, held, recent}
OlympusVerifyConfig = {membershipOnly = true, uiAutoShow = false}
OlympusQueue = {version = 1, entries = {}}
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
local realHash = OlympusHmac.sha256hex
OlympusHmac.sha256hex = function(text)
  if text == "prime-guild-master|1|" .. self.guid then return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16" end
  return realHash(text)
end
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
OlympusVerifyFrame:GetScript("OnEvent")(OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
assert(loadfile("../OlympusVerify/OlympusVerifyInactiveDesk.lua"))("OlympusVerify", {})
local editor = CreateFrame("EditBox", nil, UIParent)
editor:SetText("")
local active = CreateFrame("EditBox", nil, UIParent)
DEFAULT_CHAT_FRAME.editBox = editor
ChatEdit_GetActiveWindow = function() return active end
local opened = 0
ChatFrame_OpenChat = function(text) opened = opened + 1; active:SetText(text) end
ChatFrameUtil = {OpenChat = ChatFrame_OpenChat, GetActiveWindow = ChatEdit_GetActiveWindow}
assert(loadfile("../OlympusVerify/OlympusVerifyWorkspace.lua"))("OlympusVerify", {})
local function open()
  if OlympusVerifyWorkspace.IsShown() then OlympusVerifyWorkspace.Close() end
  assert(OlympusVerifyWorkspace.OpenInactive())
end
local originalRoster = OlympusVerifyDB.roster
OlympusVerifyAPI.Sync, OlympusVerifyAPI.ExportRoster = forbidden, forbidden
local function btn(text)
  for _, b in ipairs(FRAMES) do if b._kind == "Button" and b:GetText() == text then return b end end
  error("Missing button: " .. text)
end
local function click(text) btn(text):Click() end
local function activeRows()
  local list = {}
  for _, b in ipairs(FRAMES) do
    if b._kind == "Button" and b.guid and b:IsShown() then list[b.guid] = b end
  end
  return list
end
local function status(text)
  for _, f in ipairs(FONTS) do if f:GetText() and f:GetText():find(text, 1, true) then return true end end
end
local panel
local function event(ev)
  panel:GetScript("OnEvent")(panel, ev or "GUILD_ROSTER_UPDATE")
  panel:GetScript("OnUpdate")(panel, 1)
end
local function review() click("Select all matches"); click("Review selected") end
local card = CreateFrame("Frame", nil, UIParent)
card:Hide()
card.RemoveButton = CreateFrame("Button", nil, card)
card.RemoveButton:SetScript("OnClick", forbidden)
card.IsProtected = function() return false end
local openedCards, lookups, guildClub, clubOverride = 0, 0, 17, nil
C_Club = {
  GetGuildClubId = function() return guildClub end,
  GetClubMembers = function()
    local ids = {}; for _, member in ipairs(ROSTER) do ids[#ids+1] = member.guid:sub(-8) end; return ids
  end,
  GetMemberInfo = function(id, memberId)
    lookups = lookups + 1
    if id == guildClub then
      for _, member in ipairs(ROSTER) do if member.guid:sub(-8) == memberId then
        return {memberId=memberId,name=member.name,guid=clubOverride or member.guid,guildRankOrder=member.rankIndex+1}
      end end
    end
  end,
}
CommunitiesFrame = CreateFrame("Frame",nil,UIParent)
CommunitiesFrame.GuildMemberDetailFrame = card
COMMUNITIES_FRAME_DISPLAY_MODES = {ROSTER=2}
CommunitiesFrame.GetSelectedClubId = function(self) return self.clubId end
CommunitiesFrame.SelectClub = function(self,id) self.clubId=id end
CommunitiesFrame.SetDisplayMode = function(self,mode) self.mode=mode end
CommunitiesFrame.OpenGuildMemberDetailFrame = function(self,id,info)
  openedCards=openedCards+1; card.clubId,card.memberId=id,info.memberId; card:Show()
end
card.GetMemberInfo = function(self) return C_Club.GetMemberInfo(self.clubId,self.memberId) end
card.GetClubId = function(self) return self.clubId end
ShowUIPanel = function(frame) frame:Show() end
local function onCard(row)
  return card:IsVisible() and card:GetClubId()==guildClub and card:GetMemberInfo()
    and card:GetMemberInfo().guid==row.guid and card:GetMemberInfo().name==row.name
end
local passed = 0
local function check(label, ok) assert(ok, label); print("PASS " .. label); passed = passed + 1 end
open()
local host = OlympusVerifyWorkspace.pages.inactive
for _, f in ipairs(FRAMES) do
  if f._parent == host and f:GetScript("OnEvent") then panel = f end
end
local escapeHost = 0
for _, n in ipairs(UISpecialFrames) do if _G[n] == host then escapeHost = escapeHost + 1 end end
check("Escape points to the real workspace page and its native content has no duplicate name", panel and not panel._name and escapeHost == 1)
local rows = activeRows()
check("blank-realm enrolled GM can review without a saved export or sync", rows[first.guid] and rows[second.guid] and not select(2, OlympusVerifyAPI.Roster.CurrentScope()))
check("held, senior, self and below-threshold members excluded", not rows[self.guid] and not rows[held.guid] and not rows[protected.guid] and not rows[recent.guid])
click("60d+"); check("interactive cutoff filters eligible native rows", activeRows()[first.guid] and not activeRows()[second.guid])
click("Policy"); activeRows()[first.guid].check:Click(); click("Review selected")
check("checkbox review freezes only the selected named row and doesn't send", activeRows()[first.guid] and not activeRows()[second.guid] and opened == 0)
click("Cancel review"); review()
local later = row("Late Arrival", 9, 8, 90)
table.insert(ROSTER, later); event()
check("post-review arrivals cannot join the reviewed set", not activeRows()[later.guid] and opened == 0)
active:SetText("")
card.RemoveButton:Show()
for _, b in ipairs(FRAMES) do
  if b._kind == "Button" and (b:GetText()=="Open member details" or b:GetText()=="Start reviewed queue") then b:Click(); break end
end
check("accented reviewed member opens on the native guild card with another active chat tab",
  onCard(first) and CommunitiesFrame.mode==2 and openedCards==1 and opened==0 and effects==0
  and editor:GetText()=="" and active:GetText()=="")
OlympusVerifyWorkspace.OpenInactive()
check("selecting the active desk tab cannot repeat or advance the native action", openedCards==1 and onCard(first))
editor:SetText("guild chat draft"); active:SetText("another chat tab"); card:Hide(); click("Reopen member details")
check("cancelling native navigation allows revisiting the same member without changing either chat draft", openedCards==2
  and onCard(first) and effects==0 and editor:GetText()=="guild chat draft" and active:GetText()=="another chat tab")
local beforeBurst=lookups
local totalReads, rowReads = 0, 0
local countMembers, inspect = GetNumGuildMembers, GetGuildRosterInfo
GetNumGuildMembers = function() totalReads = totalReads + 1; return countMembers() end
GetGuildRosterInfo = function(i) rowReads = rowReads + 1; return inspect(i) end
for _ = 1, 160 do panel:GetScript("OnEvent")(panel, "GUILD_ROSTER_UPDATE") end
check("160 events immediately validate just the named row without re-enumerating either roster", totalReads == 0 and rowReads == 160 and lookups==beforeBurst)
panel:GetScript("OnUpdate")(panel, 1)
check("a burst causes one full roster read on the visible page", totalReads == 2 and rowReads == 160 + #ROSTER)
GetNumGuildMembers, GetGuildRosterInfo = countMembers, inspect
card:Hide(); active:SetText(""); event()
check("closing native UI and receiving a roster event is not proof of removal", btn("Reopen member details"):IsEnabled() and openedCards==2)
click("Reopen member details"); table.remove(ROSTER,2); panel:GetScript("OnEvent")(panel,"GUILD_ROSTER_UPDATE")
check("a changed native index withdraws the matching card before full readback", not card:IsShown())
panel:GetScript("OnUpdate")(panel,1)
check("confirmed named departure offers the next member without opening or removing them", status("left the guild") and btn("Open next member"):IsEnabled() and openedCards==3)
click("Open next member")
check("second native card belongs to the original reviewed member", onCard(second) and openedCards==4)
clubOverride="Player-9-11111111"; click("Reopen member details")
check("same name with a different club GUID cannot open a card and withdraws the previous card",
  not card:IsShown() and openedCards==4 and status("show offline members and left-click Candidate Two"))
clubOverride=nil; click("Reopen member details")
local priorMembers = C_Club.GetClubMembers
C_Club.GetClubMembers = function() local ids={}; for i=1,1001 do ids[i]=i end; return ids end
local countBefore=lookups; click("Reopen member details")
check("an oversized club list makes no member lookups and offers manual roster navigation", not card:IsShown()
  and lookups==countBefore and status("show offline members and left-click Candidate Two"))
C_Club.GetClubMembers=priorMembers; click("Reopen member details")
card.memberId=self.guid:sub(-8); click("Cancel review")
check("cancelling leaves a different native member card opened by the officer alone", onCard(self))
card:Hide(); activeRows()[second.guid].check:Click(); click("Review selected"); click("Open member details")
ROSTER[2],ROSTER[3]=ROSTER[3],ROSTER[2]; event()
check("a roster reorder needs a fresh look at the same GUID", not card:IsShown() and btn("Reopen member details"):IsEnabled())
click("Reopen member details")
check("reopening after the reorder selects the same member", onCard(second))
ROSTER[2],ROSTER[3]=ROSTER[3],ROSTER[2]; event(); click("Reopen member details")
second.online = true; event()
check("newly online member withdraws their card without touching native chat",
  not card:IsShown() and editor:GetText()=="guild chat draft" and not activeRows()[second.guid])
second.online = false; table.remove(ROSTER); open(); review(); click("Open member details")
editor:SetText("unrelated player text"); click("Cancel review")
check("cancel never deletes another chat draft", editor:GetText() == "unrelated player text")
editor:SetText(""); review(); click("Open member details")
permission = false; event()
check("permission loss withdraws the native card", not card:IsShown() and status("removal permission"))
permission = true; open(); review(); click("Open member details"); inCombat = true; event("PLAYER_REGEN_DISABLED")
check("combat cancels even without a native roster event", not card:IsShown() and status("out of combat"))
inCombat = false; open(); review(); click("Open member details"); host:Hide()
check("closing the actual Escape target clears its child's command", not card:IsShown() and not panel:IsShown())
open(); review(); second.onote = "hold"; click("Open member details")
check("a hold added between review and confirmation prevents staging", editor:GetText() == "" and status("no longer qualifies"))
second.onote = nil; open(); review(); click("Open member details")
ROSTER[2] = row(second.name, 90, 8, 48); event()
check("same-name replacement cannot be confirmed as a departure", not card:IsShown() and status("no longer qualifies"))
ROSTER[2] = second; open(); review(); click("Open member details"); editor:SetText(""); table.remove(ROSTER, 2); event()
check("all departures require a complete native observation", status("all reviewed characters have left") and effects == 0)
table.insert(ROSTER, second); open(); review(); click("Open member details")
local num = GetNumGuildMembers
GetNumGuildMembers = function() return num() + 1 end
event()
check("a partial native roster is never accepted as an exit", editor:GetText() == "" and status("complete roster"))
GetNumGuildMembers = num
guild = "Another Guild"; open()
check("a different blank-realm guild cannot use PRIME's identity", not next(activeRows()) and status("Current guild"))
guild, realm = "Other Guild", "Actual Realm"; open()
check("the native-realm path accepts eligible members without Watcher data", activeRows()[second.guid])
actorSlot, self.rankIndex = 1, 1
table.insert(ROSTER, row("Guild Master", 94, 0, 0))
open()
check("an officer cannot trust masked empty officer notes without permission proof", status("Access to officer notes") and not next(activeRows()))
C_GuildInfo.CanViewOfficerNote = function() return true end
open(); review(); click("Open member details")
C_GuildInfo.CanViewOfficerNote = function() return false end
event()
check("losing officer-note access withdraws an unchanged draft", editor:GetText() == "" and status("Access to officer notes"))

actorSlot, self.rankIndex = 0, 0
guild, realm = "OLYMPUS PRIME", ""
C_GuildInfo.CanViewOfficerNote = function() return true end
local mage, druid, warrior = row("Mage Week", 100, 9, 7), row("Druid Month", 101, 9, 31), row("Warrior Week", 102, 9, 8)
mage.class, druid.class, warrior.class = "MAGE", "DRUID", "WARRIOR"
local otherRank, short, online = row("Member Week", 103, 8, 7), row("Almost Week", 104, 9, 6.99), row("Online", 105, 9, 10)
local unknown = row("Class unavailable", 106, 9, 7)
online.online, unknown.class = true, ""
ROSTER = {self, mage, druid, warrior, otherRank, short, online, held, unknown}
local function classOption(token)
  for _, f in ipairs(FRAMES) do
    if f._kind == "CheckButton" and f.caption and f:IsVisible() and f.token == token then return f end
  end
  error("Missing class option " .. tostring(token))
end
open()
click("7d+")
check("ordinary seven-day filter still respects the higher level policy", not activeRows()[mage.guid] and activeRows()[druid.guid])
click("Initiates 7d+")
rows = activeRows()
check("explicit Initiate week includes the exact seven-day boundary at every level", rows[mage.guid] and rows[warrior.guid] and rows[druid.guid]
  and rows[mage.guid].days:GetText() == "7d / 7d")
check("week scope still excludes other ranks, online members, held notes and under seven days", not rows[otherRank.guid]
  and not rows[short.guid] and not rows[online.guid] and not rows[held.guid])
click("Select all matches")
click("All classes v"); classOption("MAGE"):Click()
rows = activeRows()
check("a specific class selection discards hidden selections and matches only its native class", rows[mage.guid]
  and rows[mage.guid].class:GetText() == "Mage" and not rows[druid.guid] and not rows[unknown.guid] and not btn("Review selected"):IsEnabled())
classOption("DRUID"):Click()
check("two checked classes combine and still exclude the third and unreadable classes", activeRows()[mage.guid] and activeRows()[druid.guid]
  and not activeRows()[warrior.guid] and not activeRows()[unknown.guid])
classOption("DRUID"):Click(); classOption("MAGE"):Click()
check("unchecking the last class shows zero candidates until an officer selects a class or All classes", not next(activeRows())
  and not btn("Select all matches"):IsEnabled())
classOption("MAGE"):Click(); classOption("DRUID"):Click()
click("2 classes v"); review()
check("review contains exactly the matching named characters and locks filter controls", activeRows()[mage.guid] and activeRows()[druid.guid]
  and not activeRows()[warrior.guid] and not btn("2 classes v"):IsEnabled() and not btn("Initiates 7d+"):IsEnabled())
click("Open member details")
check("first copyable member card belongs to the reviewed filtered set", onCard(druid))
druid.class = "WARRIOR"; event()
check("a changed class cancels the reviewed queue and withdraws the member card", not card:IsShown() and status("changed"))
druid.class = "DRUID"; event()
click("2 classes v"); classOption(nil):Click(); click("All classes v")
check("All classes explicitly restores candidates without selecting any", activeRows()[unknown.guid]
  and activeRows()[warrior.guid] and not btn("Review selected"):IsEnabled())
click("Policy")
check("returning to Policy drops every below-floor Initiate and restores the original threshold", not activeRows()[mage.guid]
  and activeRows()[druid.guid].days:GetText() == "31d / 30d")
click("60d+"); click("Initiates 7d+"); open()
check("reopening in PRIME preserves the explicitly selected seven-day mode", activeRows()[mage.guid]
  and activeRows()[mage.guid].days:GetText() == "7d / 7d" and not btn("Initiates 7d+"):IsEnabled())
click("Select all matches")
guild, realm = "Other Guild", "Actual Realm"; event("PLAYER_GUILD_UPDATE")
check("a confirmed guild change resets the PRIME preset to Policy and clears selections", not btn("Policy"):IsEnabled()
  and not btn("Review selected"):IsEnabled() and not activeRows()[mage.guid] and activeRows()[druid.guid]
  and activeRows()[druid.guid].days:GetText() == "31d / 30d")
guild, realm = "OLYMPUS PRIME", ""; open(); click("Initiates 7d+"); OlympusVerifyWorkspace.Close()
guild, realm = "Other Guild", "Actual Realm"; open()
click("Initiates 7d+")
check("the PRIME seven-day exception does not change other guilds' level policies", not btn("Initiates 7d+"):IsEnabled()
  and not activeRows()[mage.guid] and activeRows()[druid.guid].days:GetText() == "31d / 30d")
check("no native chat opening, protected call, whisper, export or UI reload took place", opened == 0 and effects == 0 and OlympusVerifyDB.roster == originalRoster and not originalRoster.members)
print(passed .. " inactive desk checks passed")

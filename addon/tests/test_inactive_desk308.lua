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
local issued, atClick = {}, nil
SECURE_MACRO_EXECUTE = function(text, button)
  assert(button:GetScript("OnClick")==button._secureHandler and button:GetAttribute("type1")=="macro")
  issued[#issued+1]=text
  if atClick then atClick(button) end
end
local function remove(row, button, down) btn("Remove "..row.name.."-Forever"):Click(button,down) end
local function noCommand(button)
  return not button:GetAttribute("type1") and not button:GetAttribute("macrotext1")
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
editor:SetText("guild chat draft"); active:SetText("another chat tab")
local action=btn("Remove "..first.name.."-Forever")
for _, modified in ipairs({"IsControlKeyDown","IsShiftKeyDown","IsAltKeyDown"}) do
  local read=_G[modified]; _G[modified]=function() return true end
  action:Click(); _G[modified]=read
end
action:Click("RightButton"); action:Click("LeftButton",true)
check("review, modifiers and non-left release keep the secure button disarmed", #issued==0 and noCommand(action))
remove(first)
check("one secure hardware release admits precisely the reviewed accented name and leaves both chat editors untouched",
  #issued==1 and issued[1]=="/guildremove Hakuho Shö-Forever" and noCommand(action) and opened==0 and effects==0
  and editor:GetText()=="guild chat draft" and active:GetText()=="another chat tab")
action:Click(); OlympusVerifyWorkspace.OpenInactive(); action:Click()
check("unchanged roster, repeated click and reopening the active tab cannot issue a second command", #issued==1 and noCommand(action))
local totalReads, rowReads = 0, 0
local countMembers, inspect = GetNumGuildMembers, GetGuildRosterInfo
GetNumGuildMembers = function() totalReads = totalReads + 1; return countMembers() end
GetGuildRosterInfo = function(i) rowReads = rowReads + 1; return inspect(i) end
for _ = 1, 160 do panel:GetScript("OnEvent")(panel, "GUILD_ROSTER_UPDATE") end
check("160 events while disarmed do not re-enumerate the guild", totalReads == 0 and rowReads == 0)
panel:GetScript("OnUpdate")(panel, 1)
check("a burst causes one full roster read on the visible page", totalReads == 2 and rowReads == #ROSTER)
GetNumGuildMembers, GetGuildRosterInfo = countMembers, inspect
event()
check("a roster event with the member present cannot advance",#issued==1 and not action:IsEnabled())
table.remove(ROSTER,2); event()
check("confirmed single-GUID departure updates the same button without sending",action==btn("Remove Candidate Two-Forever")
  and action:IsEnabled() and #issued==1 and noCommand(action))
second.online=true
action:Click()
check("the click itself catches a newly online target without a roster event",#issued==1 and noCommand(action))
second.online=false; table.remove(ROSTER); open(); review()
second.onote="hold"; remove(second)
check("a hold added after review prevents the command",#issued==1 and status("no longer qualifies"))
second.onote=nil; open(); review()
permission=false; remove(second)
check("loss of permission at click prevents dispatch",#issued==1 and noCommand(action))
permission=true; open(); review()
inCombat=true; remove(second); event("PLAYER_REGEN_DISABLED")
check("combat stops the reviewed queue without a secure action",#issued==1 and noCommand(action))
inCombat=false; open(); review()
host:Hide()
check("closing the Escape target disarms without sending",#issued==1 and not panel:IsShown() and noCommand(action))
open(); review()
ROSTER[2]=row(second.name,90,8,48); remove(second)
check("a same-name replacement cannot inherit the reviewed click",#issued==1 and noCommand(action))
ROSTER[2]=second; open(); review()
local num=GetNumGuildMembers; GetNumGuildMembers=function() return num()+1 end
remove(second)
check("incomplete roster prevents dispatch",#issued==1 and status("complete roster"))
GetNumGuildMembers=num; open(); review(); remove(second)
check("second target is requested exactly once",#issued==2 and issued[2]=="/guildremove Candidate Two-Forever")
click("Cancel review"); open(); click("Select all matches")
check("an unresolved click cannot be retried after cancel and reopen",not btn("Review selected"):IsEnabled() and #issued==2)
check("the unresolved attempt was persisted for the next login",OlympusVerifyDB.inactiveRemovalAttempts[second.guid].name=="Candidate Two-Forever" and #issued==2)
-- Start the remaining independent cases with a distinct native GUID.
second=row("Other Candidate",198,8,48); ROSTER[2]=second
guild="Another Guild"; open()
check("a different blank-realm guild cannot use PRIME's identity",not next(activeRows()) and status("Current guild"))
guild,realm="Other Guild","Actual Realm"; open()
check("the native-realm path accepts eligible members without Watcher data",activeRows()[second.guid])
actorSlot,self.rankIndex=1,1
table.insert(ROSTER,row("Guild Master",94,0,0)); open()
check("an officer cannot trust masked empty officer notes without permission proof",status("Access to officer notes") and not next(activeRows()))
C_GuildInfo.CanViewOfficerNote=function() return true end; open(); review()
C_GuildInfo.CanViewOfficerNote=function() return false end; remove(second)
check("losing officer-note access before the click refuses removal",#issued==2 and status("Access to officer notes"))
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
druid.class="WARRIOR"; remove(druid)
check("a changed class between review and click invalidates the filtered queue",#issued==2 and status("no longer qualifies"))
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
guild,realm="OLYMPUS PRIME",""
local alpha, beta, unsafe = row("Alpha Trial",134,9,40), row("Beta Trial",135,9,39), row("[target] Bogus",136,9,38)
local classRoster = ROSTER
ROSTER={self,alpha,beta,unsafe}
open(); click("Initiates 7d+")
check("macro condition syntax in a native name is never selectable",not activeRows()[unsafe.guid].check:IsEnabled())
check("single-member handoff rejects a name with an unrelated GUID",not OlympusVerifyInactiveDesk.ReviewOne("Beta Trial-Forever",alpha.guid))
check("single-member handoff reviews only this eligible native row without dispatch",OlympusVerifyInactiveDesk.ReviewOne("Alpha Trial-Forever",alpha.guid)
  and activeRows()[alpha.guid] and not activeRows()[beta.guid] and #issued==2)
click("Cancel review"); review()
local fixed = btn("Remove Alpha Trial-Forever")
remove(alpha); table.remove(ROSTER,2); event()
check("one complete same-scope departure reuses the same button for the second reviewed target",#issued==3 and fixed==btn("Remove Beta Trial-Forever") and noCommand(fixed))
remove(beta); table.remove(ROSTER,2); event()
check("a second real release completes that reviewed set without touching any other name",#issued==4 and issued[3]=="/guildremove Alpha Trial-Forever"
  and issued[4]=="/guildremove Beta Trial-Forever" and noCommand(fixed) and status("all reviewed characters have left"))
local receipt = OlympusVerifyDB.inactiveRemovalHistory[1]
check("bounded history distinguishes a witnessed departure from the officer's original removal request",receipt.guid==beta.guid and receipt.actor==self.guid
  and receipt.name=="Beta Trial-Forever" and receipt.requestedAt<=receipt.departedAt and receipt.state=="departure-observed"
  and not OlympusVerifyDB.inactiveRemovalAttempts[beta.guid])
local attempts = OlympusVerifyDB.inactiveRemovalAttempts; OlympusVerifyDB.inactiveRemovalAttempts=false
ROSTER=classRoster; open(); click("Initiates 7d+"); click("Select all matches")
check("malformed request history fails closed",not btn("Review selected"):IsEnabled() and #issued==4)
OlympusVerifyDB.inactiveRemovalAttempts=attempts; open()
activeRows()[mage.guid].check:Click(); click("Review selected")
atClick=function()
  panel:GetScript("OnEvent")(panel,"ADDON_ACTION_FORBIDDEN","OtherAddon","C_GuildInfo.Uninvite")
  panel:GetScript("OnEvent")(panel,"ADDON_ACTION_FORBIDDEN","OlympusVerify","C_GuildInfo.Promote")
  assert(OlympusVerifyDB.inactiveRemovalAttempts[mage.guid].state=="unknown")
  panel:GetScript("OnEvent")(panel,"ADDON_ACTION_FORBIDDEN","OlympusVerify","C_GuildInfo.Uninvite")
end
remove(mage); atClick=nil
check("a matching native refusal holds the exact attempted GUID and stops the queue",#issued==5
  and OlympusVerifyDB.inactiveRemovalAttempts[mage.guid].state=="blocked" and status("blocked"))
open(); click("Select all matches")
check("a client refusal cannot dispatch the next target or retry",not btn("Review selected"):IsEnabled() and #issued==5)
OlympusVerifyWorkspace.Close()
C_AddOns.GetAddOnMetadata=function() return "next-fictional-addon-version" end
assert(loadfile("../OlympusVerify/OlympusVerifyInactiveDesk.lua"))("OlympusVerify", {})
check("a new addon revision retains the refused GUID across reload",not OlympusVerifyInactiveDesk.ReviewOne("Mage Week-Forever",mage.guid)
  and OlympusVerifyDB.inactiveRemovalAttempts[mage.guid].state=="blocked")
check("a previous revision's blanket refusal does not disable an unrelated eligible row on a revised addon",OlympusVerifyInactiveDesk.ReviewOne("Druid Month-Forever",druid.guid) and #issued==5)
check("no native chat opening, protected call, whisper, export or UI reload took place", opened == 0 and effects == 0 and OlympusVerifyDB.roster == originalRoster and not originalRoster.members)
print(passed .. " inactive desk checks passed")

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
local self, first, second = row("Officer One", 1, 0, 0), row("Ñò Example", 2, 9, 70), row("Candidate Two", 3, 8, 48)
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
local active = editor
DEFAULT_CHAT_FRAME.editBox = editor
ChatEdit_GetActiveWindow = function() return active end
local opened = 0
ChatFrame_OpenChat = function(text) opened = opened + 1; editor:SetText(text) end
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
editor:SetText("guild chat draft"); click("Start reviewed queue")
check("an existing chat draft is preserved", opened == 0 and editor:GetText() == "guild chat draft")
active = CreateFrame("EditBox", nil, UIParent)
active:SetText("another chat tab"); editor:SetText(""); click("Prepare next removal")
check("another active chat tab is preserved", opened == 0 and active:GetText() == "another chat tab")
active:SetText(""); editor:SetText("default draft"); click("Prepare next removal")
check("a default chat draft cannot be overwritten from another empty tab", opened == 0 and editor:GetText() == "default draft")
active = editor; editor:SetText(""); click("Prepare next removal")
local firstCommand = "/guildremove " .. first.name .. "-Forever"
check("first explicit action prepares exactly one named native command", opened == 1 and editor:GetText() == firstCommand and effects == 0)
OlympusVerifyWorkspace.OpenInactive()
check("clicking the active tab keeps the draft and cannot prepare it twice", btn("Awaiting departure")._enabled == false and opened == 1 and editor:GetText() == firstCommand)
local totalReads, rowReads = 0, 0
local countMembers, inspect = GetNumGuildMembers, GetGuildRosterInfo
GetNumGuildMembers = function() totalReads = totalReads + 1; return countMembers() end
GetGuildRosterInfo = function(i) rowReads = rowReads + 1; return inspect(i) end
for _ = 1, 160 do panel:GetScript("OnEvent")(panel, "GUILD_ROSTER_UPDATE") end
check("160 events immediately validate only the named draft without re-enumerating the guild", totalReads == 0 and rowReads == 160)
panel:GetScript("OnUpdate")(panel, 1)
check("a burst causes one full roster read on the visible page", totalReads == 2 and rowReads == 160 + #ROSTER)
GetNumGuildMembers, GetGuildRosterInfo = countMembers, inspect
editor:SetText(""); event()
check("closing chat and receiving a roster update is not proof of removal", btn("Awaiting departure")._enabled == false and opened == 1)
table.remove(ROSTER, 2); event()
check("confirmed named departure offers next without sending or opening it", status("left the guild") and btn("Prepare next removal")._enabled and opened == 1)
click("Prepare next removal")
check("second name remains the original reviewed target", opened == 2 and editor:GetText() == "/guildremove Candidate Two-Forever")
second.online = true; event()
check("newly online member cancels and clears an unchanged prepared command", editor:GetText() == "" and status("staged character") and not activeRows()[second.guid])
second.online = false; table.remove(ROSTER); open(); review(); click("Start reviewed queue")
editor:SetText("unrelated player text"); click("Cancel review")
check("cancel never deletes another chat draft", editor:GetText() == "unrelated player text")
editor:SetText(""); review(); click("Start reviewed queue")
permission = false; event()
check("permission loss clears prepared removal", editor:GetText() == "" and status("removal permission"))
permission = true; open(); review(); click("Start reviewed queue"); inCombat = true; event("PLAYER_REGEN_DISABLED")
check("combat cancels even without a native roster event", editor:GetText() == "" and status("out of combat"))
inCombat = false; open(); review(); click("Start reviewed queue"); host:Hide()
check("closing the actual Escape target clears its child's prepared command", editor:GetText() == "" and not panel:IsShown())
open(); review(); second.onote = "hold"; click("Start reviewed queue")
check("a hold added between review and confirmation prevents staging", editor:GetText() == "" and status("no longer qualifies"))
second.onote = nil; open(); review(); click("Start reviewed queue")
ROSTER[2] = row(second.name, 90, 8, 48); event()
check("same-name replacement cannot be confirmed as a departure", editor:GetText() == "" and status("staged character"))
ROSTER[2] = second; open(); review(); click("Start reviewed queue"); editor:SetText(""); table.remove(ROSTER, 2); event()
check("all departures require a complete native observation", status("all reviewed characters have left") and effects == 0)
table.insert(ROSTER, second); open(); review(); click("Start reviewed queue")
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
open(); review(); click("Start reviewed queue")
C_GuildInfo.CanViewOfficerNote = function() return false end
event()
check("losing officer-note access withdraws an unchanged draft", editor:GetText() == "" and status("Access to officer notes"))
check("no protected call, whisper, export or UI reload took place", effects == 0 and OlympusVerifyDB.roster == originalRoster and not originalRoster.members)
print(passed .. " inactive desk checks passed")

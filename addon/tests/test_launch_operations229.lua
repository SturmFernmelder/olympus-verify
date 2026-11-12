-- .229 launch queue safety: real module, synthetic native APIs only.
local passed, failed = 0, 0
local function check(label, yes)
  if yes then passed = passed + 1; print("PASS " .. label) else failed = failed + 1; print("FAIL " .. label) end
end
local function fixture(fallback)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  local f = { env = e, guild = "OLYMPUS PRIME", realm = "Native Realm", promote = 0, direct = 0, legacy = 0, restricted = 0, motd = 0, invites = 0, removals = 0 }
  e.OlympusVerifyConfig = { membershipOnly = true, holdNote = "hold", secret = "synthetic-never-print-secret" }
  e.GetGuildInfo = function() return f.guild, "High Council", 1 end
  e.GetRealmName = function() return f.realm end
  e.UnitGUID = function() return "Player-1-0000AAAA" end
  e.GetGuildRosterShowOffline = function() return true end
  e.InCombatLockdown = function() return false end
  e.GuildControlGetRankName = function(order) return order==7 and "Veteran" or order==9 and "Member" or "Other" end
  e.CanGuildPromote, e.CanEditMOTD = function() return true end, function() return true end
  e.issecretvalue = function() return false end
  e.ROSTER = {
    { name = "Officer", rank = "High Council", rankIndex = 1, level = 60, online = true, guid = "Player-1-0000AAAA" },
    { name = "Candidate", rank = "Initiate", rankIndex = 9, level = 1, online = false, away = 2, guid = "Player-1-0000BBBB" },
  }
  e.C_GuildInfo.IsGuildRankAssignmentAllowed = function() return true end
  e.C_GuildInfo.SetGuildRankOrder = function() f.restricted=f.restricted+1;error("restricted API must never be called") end
  e.SECURE_MACRO_EXECUTE=function(body,button)
    f.promote=f.promote+1
    f.lastBody=body
    assert(body:sub(1,10)=="/gpromote " and not body:find("[\r\n]"),"one literal promotion command")
    local name=body:sub(11)
    f.lastName=name
    local pending=e.OlympusVerifyDB.launchPromotionAttempts[e.ROSTER[2].guid]
    f.reservedBeforeCommand=pending and pending.state=="unknown" and pending.completed==false
    if f.blockPromote then f.emit("ADDON_ACTION_FORBIDDEN", "OlympusVerify", "C_GuildInfo.Promote()");return end
    if f.unknownPromote then return end
    if not f.noRankChange then e.ROSTER[2].rankIndex=e.ROSTER[2].rankIndex-1 end
  end
  e.C_GuildInfo.Promote=function() f.direct=f.direct+1;error("addon must not call protected Lua Promote") end
  e.GuildPromote=function() f.legacy=f.legacy+1;error("addon must not call protected legacy Promote") end
  if fallback then e.C_GuildInfo.Promote=nil end
  e.C_GuildInfo.SetMOTD = function(text) f.motd = f.motd + 1; f.lastMotd = text; if f.failMotd then error("unknown") end end
  e.C_GuildInfo.Invite = function() f.invites = f.invites + 1 end
  e.C_GuildInfo.Uninvite = function() f.removals = f.removals + 1 end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify")
  local h = e.OlympusHmac
  f.page = { protocol = "officer-operations-v233", fetchedAt = e.NOW, expiresAt = e.NOW + 60, status = "ready",
    snapshotId = 12, snapshotAt = e.NOW - 10, guild = f.guild, canonicalGuild = "OLYMPUS PRIME", realm = f.realm,
    scan = { id = string.rep("a",32), startedAt = e.NOW, expiresAt = e.NOW + 590 },
    entitlements = { offset = 0, total = 20 },
    scopeHash = h.sha256hex("native-scope|1|" .. f.guild .. "|" .. f.realm):sub(1, 16), invites = {},
    promotions = {{ name = "Candidate", guid = "Player-1-0000BBBB", currentSlot = 9, targetSlot = 8, targetName = "Member", reason = "verified-initiate" }},
    riskBuffer = {}, held = {}, motd = { short = "Guild rules and Discord: use Get my code.", bytes = 40, maxBytes = 128 },
    actions = { automatic = false, roleGrants = false, removals = false, requiresNativeRecheck = true } }
  f.page.motd.bytes = #f.page.motd.short
  e.OlympusLaunchQueue = { version = 2, controlId = "loaded", scanComplete = true, pages = { f.page } }
  e.OlympusVerifyDB = {}
  e.OlympusVerifyAPI = { Sync = function() f.syncs = (f.syncs or 0) + 1 end }
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")), e)("OlympusVerify")
  f.q = e.OlympusLaunch229
  f.emit = function(event, ...) f.q.Events:GetScript("OnEvent")(f.q.Events, event, ...) end
  f.emit("GUILD_ROSTER_UPDATE")
  f.click=function(id)
    local before=f.promote
    local button=e.CreateFrame("Button",nil,e.UIParent,"SecureActionButtonTemplate,UIPanelButtonTemplate")
    f.q.BindPromotionButton(button,function() return id end)
    button:Show();button:Click()
    f.lastButton=button
    return f.promote>before and not f.blockPromote and not f.unknownPromote
  end
  return f
end
if LAUNCH_FIXTURE_ONLY then return fixture end

do
  local f, pages = fixture(), {}
  local start = f.env.NOW
  for pageIndex = 1, 4 do
    local page = {}
    for key, value in pairs(f.page) do page[key] = value end
    page.entitlements, page.promotions = {offset=(pageIndex-1)*20,total=80}, {}
    for item = 1, 2 do local n = (pageIndex-1)*2+item
      page.promotions[item] = {name="Mixed candidate "..n,guid=string.format("Player-1-%08X",100+n),currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
    end
    pages[pageIndex] = page
  end
  f.env.OlympusLaunchQueue.pages, f.env.NOW = pages, start+100
  f.q.Show(); f.q.tab="initiates"; f.q.Show()
  check("each visible mixed-source recommendation exposes its own recheck button", f.q.rowRecheckButtons and f.q.rowRecheckButtons[8] and f.q.rowRecheckButtons[8]:IsShown())
  if f.q.rowRecheckButtons then
    f.q.rowRecheckButtons[8]:GetScript("OnClick")()
    local c, h = f.env.OlympusVerifyDB.launchControl, f.env.OlympusHmac
    check("stale later recommendation rechecks its source offset60 rather than first offset0", c and c.action == "recheck" and c.offset == 60 and f.syncs == 1)
    local message = c and table.concat({"launch-control","1",c.action,c.id,tostring(c.observedAt),c.scopeHash,c.guid,tostring(c.offset)},"|")
    check("per-row recheck signs the exact own native GUID scope and selected offset", c and c.guid == "Player-1-0000AAAA" and c.mac == h.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
    check("later-page recheck never promotes invites removes or sets MOTD", f.promote == 0 and f.legacy == 0 and f.invites == 0 and f.removals == 0 and f.motd == 0)
  end
end
do
  local f = fixture(); local p2 = {}
  for key, value in pairs(f.page) do p2[key] = value end
  p2.fetchedAt, p2.expiresAt, p2.entitlements, p2.promotions = f.env.NOW + 1, f.env.NOW + 61, { offset = 20, total = 20 }, {}
  f.env.OlympusLaunchQueue.pages[2] = p2
  check("page2 one second later does not require shared action expiry", f.q.Current() ~= nil)
  f.env.NOW = f.env.NOW + 60; f.emit("GUILD_ROSTER_UPDATE")
  check("expired candidate stays visible advisory without protected action", #f.q.Current().promotions == 1 and not f.click("1") and f.promote == 0)
  f.page.fetchedAt, f.page.expiresAt = f.env.NOW, f.env.NOW + 60
  check("fresh candidate page admits hardware action while other page is stale", f.click("1") and f.promote == 1)
end
do
  local f = fixture(); local original, start = f.page, f.env.NOW
  original.promotions = {}
  local pages = {}
  for index = 1, 50 do local p = {}
    for key, value in pairs(original) do p[key] = value end
    p.fetchedAt, p.expiresAt = start+(index-1)*5, start+(index-1)*5+60
    p.status = index < 50 and "partial" or "ready"
    p.entitlements, p.promotions = {offset=(index-1)*20,total=1000}, {}
    pages[index] = p
  end
  pages[3].promotions = {{name="Candidate",guid="Player-1-0000BBBB",currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}}
  f.env.OlympusLaunchQueue.pages = pages; f.env.NOW = start+260; f.emit("GUILD_ROSTER_UPDATE")
  check("full 50-page discovery retains expired pages as advisory", f.q.Current() and #f.q.Current().pages == 50 and not f.click("1") and f.promote == 0)
  check("naturally partial early pages do not contradict completed discovery", f.q.Current().scanComplete and not f.q.Current().partial and f.q.Current().stalePages > 0)
  pages[3].fetchedAt, pages[3].expiresAt = start+260, start+320
  check("50-page scan recheck renews only selected page eligibility", f.click("1") and f.promote == 1 and pages[1].expiresAt == start+60)
end
do
  local f = fixture(); f.q.Show(); f.q.tab="initiates"; f.q.Show()
  check("opening actual native queue frame is read only", f.q.window:IsShown() and f.promote == 0 and f.invites == 0)
  f.q.rowButtons[1]:Click()
  check("native queue button makes exactly one hardware request", f.promote == 1 and f.legacy == 0)
  f = fixture()
  check("explicit scan writes domain separated local control and reloads once", f.q.Control("scan") and f.syncs == 1 and f.promote == 0 and f.invites == 0)
  local c, h = f.env.OlympusVerifyDB.launchControl, f.env.OlympusHmac
  local message = table.concat({"launch-control","1",c.action,c.id,tostring(c.observedAt),c.scopeHash,c.guid,tostring(c.offset)},"|")
  check("control MAC binds exact current native GUID scope action and offset", c.mac == h.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
  check("pending scan invalidates old loaded action data", not f.click("1") and f.promote == 0)
  check("stop is explicit and immediately holds old actions", f.q.Control("stop") and f.env.OlympusVerifyDB.launchControl.action == "stop" and not f.click("1"))
end
do
  local f = fixture()
  check("dated raw-scope Prime projection is admitted without any action", f.q.Current() ~= nil and f.promote == 0 and f.legacy == 0 and f.invites == 0 and f.removals == 0)
  check("GUID hardware selection uses name-only one-rank API without restricted assignment", f.click("Player-1-0000BBBB") and f.promote == 1 and f.lastName == "Candidate-Forever" and f.env.ROSTER[2].rankIndex==8 and f.restricted==0)
  f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed target rank cannot promote again", not f.click("Player-1-0000BBBB") and f.promote == 1)
end
do
  local f = fixture(); f.page.promotions[1].targetSlot, f.page.promotions[1].targetName, f.page.promotions[1].reason = 6, "Veteran", "knight-veteran"
  check("Knight Veteran projection requests only the first rank on its named target path", f.click("1") and f.promote == 1 and f.env.ROSTER[2].rankIndex==8 and f.restricted==0)
end
do
  local f = fixture(true)
  check("missing namespaced Promote still uses the secure player command", f.click("1") and f.promote == 1 and f.legacy == 0 and f.env.ROSTER[2].rankIndex == 8)
  check("fallback waits for a newer native roster before another click", not f.click("1") and f.promote == 1 and f.legacy == 0)
  f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed Member target does not send another fallback", not f.click("1") and f.promote == 1 and f.legacy == 0 and f.env.ROSTER[2].rankIndex == 8)
  f.emit("GUILD_ROSTER_UPDATE")
  check("bounded fallback stops at Member and never skips further", not f.click("1") and f.promote == 1 and f.legacy == 0)
end
for _, case in ipairs({ "expiry", "future", "scope", "rank", "permission", "assignment", "guid", "duplicate", "preview", "combat", "invite" }) do
  local f = fixture()
  if case == "expiry" then f.env.NOW = f.env.NOW + 60
  elseif case == "future" then f.page.fetchedAt, f.page.expiresAt = f.env.NOW + 6, f.env.NOW + 66
  elseif case == "scope" then f.guild = "Olympus I"
  elseif case == "rank" then f.env.ROSTER[2].rankIndex = 8
  elseif case == "permission" then f.env.CanGuildPromote = function() return false end
  elseif case == "assignment" then f.env.C_GuildInfo.IsGuildRankAssignmentAllowed = function() return false end
  elseif case == "guid" then f.env.ROSTER[2].guid = nil
  elseif case == "duplicate" then f.env.ROSTER[2].guid = f.env.ROSTER[1].guid
  elseif case == "preview" then f.env.OlympusVerifyUI = { preview = {} }
  elseif case == "combat" then f.env.InCombatLockdown = function() return true end
  elseif case == "invite" then f.page.invites = {{name="Unknown Guild"}} end
  check(case .. " holds all protected actions", not f.click("1") and f.promote == 0 and f.legacy == 0 and f.invites == 0 and f.removals == 0)
end
do
  local f = fixture(); f.blockPromote = true
  check("known blocked name API retains unknown custody without fallback", not f.click("1") and f.promote == 1 and f.legacy == 0 and f.env.OlympusVerifyDB.launchPromotionAttempts["Player-1-0000BBBB"].state=="unknown")
  check("blocked API cannot repeat in the same native generation", not f.click("1") and f.legacy == 0)
  f.emit("GUILD_ROSTER_UPDATE")
  check("a newer roster cannot clear an unobserved blocked attempt", not f.click("1") and f.promote == 1 and f.legacy == 0)
end
do
  local f = fixture(); f.unknownPromote = true
  check("unknown native action outcome is held", not f.click("1") and f.promote == 1)
  f.emit("GUILD_ROSTER_UPDATE")
  check("a fresh roster does not silently retry an unknown action", not f.click("1") and f.promote == 1 and f.legacy == 0)
end
do
  local f = fixture()
  check("MOTD display is read only", f.q.Motd("show") and f.motd == 0)
  check("MOTD hardware path requests the exact short text once", f.q.Motd("set") and f.motd == 1 and f.lastMotd == f.page.motd.short)
  check("MOTD is not automatically repeated", not f.q.Motd("set") and f.motd == 1)
  f = fixture(); f.failMotd = true
  check("unknown MOTD outcome remains spent", not f.q.Motd("set") and not f.q.Motd("set") and f.motd == 1)
end
do
  local f = fixture(); f.q.Current(); f.emit("PLAYER_GUILD_UPDATE", "player")
  check("same native identity event invalidates roster freshness without a false scope latch", f.q.Current() ~= nil and not f.q.scopeChanged and not f.click("1") and f.promote == 0)
  f = fixture(); f.env.NOW = f.env.NOW + 16
  check("stale native roster refreshes without promoting", not f.click("1") and f.env.ROSTER_ASKS == 1 and f.promote == 0)
end
do
  local f = fixture(); f.page.promotions = {}; f.page.riskBuffer = {}
  local function risk(name, suffix, level, days, note)
    local guid = "Player-1-" .. suffix
    f.env.ROSTER[#f.env.ROSTER+1] = { name=name, guid=guid, rank="Initiate", rankIndex=9, level=level, away=days, note=note, online=false }
    f.page.riskBuffer[#f.page.riskBuffer+1] = { name=name, guid=guid, currentSlot=9, level=level, lastOnlineDays=days, reason="unverified-initiate", reviewOnly=true }
  end
  risk("Small", "0000CCC1", 1, 2)
  risk("Small Long", "0000CCC2", 1, 5)
  risk("High Long", "0000CCC3", 9, 30)
  risk("Protected", "0000CCC4", 1, 40, "HOLD")
  local rows = f.q.RiskBuffer()
  check("risk buffer uses longest measured offline then lowest native level", #rows == 3 and rows[1].name:find("High Long",1,true) and rows[2].name:find("Small Long",1,true) and rows[3].name:find("Small%-Forever"))
  check("risk buffer preserves hold notes and never removes anyone", f.removals == 0 and f.promote == 0 and f.invites == 0)
end
do
  local f=fixture();f.q.Show()
  check("four officer tabs are present and opening them is read only",f.q.tabButtons.invites and f.q.tabButtons.knights and f.q.tabButtons.initiates and f.q.tabButtons.buffer and f.promote==0 and f.invites==0 and f.removals==0)
  f.q.tab="invites";check("unknown unguilded invite queue never dispatches",not f.q.NextAction() and f.invites==0)
  f.q.tab="buffer";check("purge Next action is native review only",not f.q.NextAction() and f.removals==0)
  f.q.tab="initiates";check("Next officer action opens a read-only secure confirmation",f.q.NextAction() and f.promote==0 and f.q.promotionConfirm:IsShown())
  f.q.promotionConfirmButton:Click()
  check("explicit confirmation requests one secure player promotion",f.promote==1 and f.lastName=="Candidate-Forever" and f.direct==0 and f.legacy==0 and f.restricted==0)
  f.emit("GUILD_ROSTER_UPDATE");check("Next action skips confirmed completed native target",not f.q.NextAction() and f.promote==1)
end
for _,case in ipairs({"protocol","targetName","oldSlot7","oldSlot5","wrongCurrent","nativeTargetName","missingNativeTargetName"}) do
  local f=fixture()
  if case=="protocol" then f.page.protocol="launch-operations-v1"
  elseif case=="targetName" then f.page.promotions[1].targetName="Veteran"
  elseif case=="oldSlot7" then f.page.promotions[1].targetSlot=7
  elseif case=="oldSlot5" then f.page.promotions[1].targetSlot=5
  elseif case=="wrongCurrent" then f.page.promotions[1].currentSlot=8
  elseif case=="nativeTargetName" then f.env.GuildControlGetRankName=function() return "Officer" end
  else f.env.GuildControlGetRankName=nil end
  check(case.." holds without a protected request",not f.click("1") and f.promote==0 and f.legacy==0)
end
do
  local f=fixture();f.page.promotions={};f.page.riskBuffer={{name="Candidate",guid="Player-1-0000BBBB",currentSlot=9,level=1,lastOnlineDays=2,reason="unverified-initiate",reviewOnly=true}}
  f.env.NOW=f.env.NOW+61;f.emit("GUILD_ROSTER_UPDATE")
  check("expired unverified classification is never offered as current purge evidence",#f.q.RiskBuffer()==0 and f.removals==0)
end
do
  local f=fixture();local row={queueId=1,proofId=string.rep("a",32),name="Visible Candidate",guid="Player-1-ABCDEF12",fullName="Visible Candidate",scopeHash=f.page.scopeHash,observedAt=f.env.NOW,expiresAt=f.env.NOW+30,reason="knight-unguilded",source="native-who-whisper-v242"}
  f.page.invites={row};local current=f.q.Current()
  check("exact remote v242 officer proof is projected with the shorter native expiry",current and #current.invites==1 and current.freshness[row.guid].expiresAt==row.expiresAt)
  local calls,rowCalls=0,0;f.env.OlympusOfficerInvites233={Next=function(rows) calls=calls+1;return rows and rows[1]==row end,
    HardwareInvite=function(given) if given==row then rowCalls=rowCalls+1 end end,Status=function() return {reason="test status"} end}
  f.q.Show();f.q.tab="invites";f.q.Show();check("invite tab routes only its approved source row to the hardware dispatcher",f.q.NextAction() and calls==1 and f.invites==0 and f.promote==0)
  f.q.rowButtons[1]:Click("RightButton")
  f.env.IsShiftKeyDown=function() return true end;f.q.rowButtons[1]:Click()
  check("reused secure invite row never dispatches from right or modified clicks",rowCalls==0 and f.promote==0)
  f.env.IsShiftKeyDown=function() return false end;f.q.rowButtons[1]:Click()
  check("reused invite row preserves one plain left hardware dispatch",rowCalls==1 and f.promote==0)
  row.scopeHash=string.rep("0",16);check("mismatched invitation scope holds the entire projection",f.q.Current()==nil)
end
do
  local f=fixture();local alerts=0;f.env.OlympusVerifyAutoSync={Request=function(reason) if reason=="queue-check" then alerts=alerts+1 end end}
  f.env.OlympusVerifyDB.launchControl={action="scan",id="new-control",observedAt=f.env.NOW}
  local tick=f.q.Events:GetScript("OnUpdate");tick();check("queue reminder waits a bounded Watcher window and never reloads",alerts==0 and not f.syncs)
  f.env.NOW=f.env.NOW+5;tick();tick();check("second hardware Sync reminder is coalesced and claims no ACK",alerts==1 and not f.syncs and f.invites==0)
  f.env.OlympusLaunchQueue.controlId="second-control";f.env.OlympusVerifyDB.launchControl={action="recheck",id="second-control",observedAt=f.env.NOW-5};tick()
  check("already loaded matching control needs no speculative second-Sync alert",alerts==1)
end
print(string.format("%d passed, %d failed", passed, failed))
if failed > 0 then error("launch operations failed") end

-- .227 native own-roster scope binding: synthetic client APIs only, no game or provider actions.
local passed, failed = 0, 0
local function check(label, value)
  if value then passed = passed + 1; print("PASS " .. label)
  else failed = failed + 1; print("FAIL " .. label) end
end
local function fixture(legacy)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  e.OlympusVerifyDB = nil
  e.OlympusVerifyConfig = { secret = "native-scope-test-only", membershipOnly = not legacy, uiAutoShow = false,
    nativeGuild = "Typed configuration is not native evidence", nativeRealm = "A guessed realm" }
  e.OlympusQueue = { version = 1, generatedAt = e.NOW, entries = {} }
  e.ROSTER = {
    { name = "Fern Melder", rank = "High Council", rankIndex = 1, level = 1, online = true, guid = "Player-1-0000AAAA" },
    { name = "Launch Member", rank = "Member", rankIndex = 7, level = 1, online = true, guid = "Player-1-0000BBBB" },
  }
  local f = { env = e, guild = "Olympus I", realm = "Native Realm - NA", inGuild = true, effects = 0, playerReads = 0 }
  e.IsInGuild = function() return f.inGuild end
  e.GetGuildInfo = function(unit) assert(unit == "player"); f.playerReads = f.playerReads + 1; return f.guild, "High Council", 1 end
  e.GetRealmName = function() return f.realm end
  e.GetGuildRosterShowOffline = function() return true end
  local effect = function() f.effects = f.effects + 1 end
  e.C_GuildInfo.Invite, e.C_GuildInfo.Uninvite, e.C_GuildInfo.SetNote, e.SendChatMessage = effect, effect, effect, effect
  e.issecretvalue = function() return false end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")), e)("OlympusVerify")
  local onEvent = e.OlympusVerifyFrame:GetScript("OnEvent")
  onEvent(e.OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
  f.export = function() return e.OlympusVerifyAPI.ExportRoster() end
  f.snapshot = function() return e.OlympusVerifyDB.roster end
  return f
end

do
  local f = fixture()
  check("complete scoped roster exports its original member count", f.export() == 2)
  local r = f.snapshot()
  check("guild comes from exact GetGuildInfo player value", r.nativeGuild == "Olympus I")
  check("realm comes from exact GetRealmName value", r.nativeRealm == "Native Realm - NA")
  check("typed configuration cannot replace native scope", r.nativeGuild ~= f.env.OlympusVerifyConfig.nativeGuild and r.nativeRealm ~= f.env.OlympusVerifyConfig.nativeRealm)
  check("native guild is sampled again after the full roster", f.playerReads >= 2)
  check("scope capture performs no whisper invite removal or note action", f.effects == 0)
  local initial = r
  f.guild, f.realm = "Olympus II", "Native Second Realm"
  f.env.NOW = f.env.NOW + 1
  check("same-sized roster in a different native scope can export fresh evidence", f.export() == 2)
  check("new successful export retains changed exact guild and realm", f.snapshot().nativeGuild == "Olympus II" and f.snapshot().nativeRealm == "Native Second Realm")
  check("new scoped export does not rewrite the previous source object", initial.nativeGuild == "Olympus I" and initial.nativeRealm == "Native Realm - NA")
end

for _, missing in ipairs({ "GetGuildInfo", "GetRealmName" }) do
  local f = fixture()
  f.env[missing] = false
  check("membership-only missing " .. missing .. " holds the export", f.export() == nil and f.snapshot().members == nil)
  check("missing " .. missing .. " does not create typed fallback evidence", f.snapshot().nativeGuild == nil and f.snapshot().nativeRealm == nil)
end

for _, bad in ipairs({ "", " Native Realm", "Native Realm ", "Native\nRealm", string.rep("x", 129) }) do
  local f = fixture()
  f.realm = bad
  check("invalid native realm is held without trimming or invention", f.export() == nil and f.snapshot().members == nil)
end

do
  local f = fixture()
  f.env.GetGuildInfo = function() error("synthetic native API refusal") end
  check("throwing native guild getter holds the export", f.export() == nil and f.snapshot().members == nil)
end
do
  local f, marker = fixture(), {}
  f.env.issecretvalue = function(v) return v == marker end
  f.env.GetRealmName = function() return marker end
  check("secret native realm is not read or guessed", f.export() == nil and f.snapshot().members == nil)
end

for _, field in ipairs({ "guild", "realm", "inGuild" }) do
  local f = fixture()
  check(field .. " switch fixture first exports", f.export() == 2)
  local prior, info = f.snapshot(), f.env.GetGuildRosterInfo
  f.env.NOW = f.env.NOW + 1
  f.env.GetGuildRosterInfo = function(i)
    local values = { info(i) }
    if i == 1 then f[field] = field == "guild" and "Olympus III" or (field == "realm" and "Different Native Realm" or false) end
    return unpack(values)
  end
  check(field .. " switching during a roster scan refuses whole export", f.export() == nil)
  check(field .. " switch preserves the previous snapshot and timestamp", f.snapshot() == prior and f.snapshot().exportedAt == prior.exportedAt)
end

do
  local f = fixture()
  check("missing scope after a valid prior export fixture works", f.export() == 2)
  local prior = f.snapshot()
  f.env.GetRealmName = false
  f.env.NOW = f.env.NOW + 1
  check("missing scope never refreshes prior membership proof", f.export() == nil and f.snapshot() == prior and f.snapshot().exportedAt ~= f.env.NOW)
end
do
  local f = fixture(true)
  f.env.GetGuildInfo, f.env.GetRealmName = false, false
  check("explicit legacy mode preserves historical unscoped export", f.export() == 2)
  check("legacy mode manufactures no native scope fields", f.snapshot().nativeGuild == nil and f.snapshot().nativeRealm == nil)
  check("legacy export still performs no membership action", f.effects == 0)
end
-- Substitute only the enrollment lookup for a synthetic GM. The production
-- digest has an independent known input in the private enrollment receipt.
local function blankFixture()
  local f = fixture()
  local e = f.env
  f.guild, f.realm, f.slot = "OLYMPUS PRIME", "", 0
  e.PLAYER_GUID = e.ROSTER[1].guid
  e.ROSTER[1].rank, e.ROSTER[1].rankIndex = "Guild Master", 0
  e.ROSTER[2].name = "Ñò Example"
  local readRoster = e.GetGuildRosterInfo
  e.GetGuildRosterInfo = function(i)
    local row = {readRoster(i)}
    if e.ROSTER[i] then row[1] = e.ROSTER[i].name end
    return unpack(row,1,17)
  end
  e.GetGuildInfo = function() return f.guild, "Guild Master", f.slot end
  e.date = function(format,stamp) return os.date(format,stamp) end
  local hash = e.OlympusHmac.sha256hex
  local enrollment = "prime-guild-master|1|" .. e.PLAYER_GUID
  f.enrollmentReads = 0
  e.OlympusHmac.sha256hex = function(data)
    if data == enrollment then
      f.enrollmentReads = f.enrollmentReads + 1
      return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16"
    end
    return hash(data)
  end
  local ranks = assert(loadfile("directive_fixture280.lua"))()
  f.rankNames = ranks.ranks(e)
  f.scope = e.OlympusVerifyAPI.Roster.CurrentScope
  return f
end

do
  local f = blankFixture()
  local e, scopeRealm = f.env, "CAMWOW US2 Realm 3 PvE"
  local _, before = f.scope()
  check("an enrolled GM still waits for a complete roster observation this session", before == nil)
  local row = e.ROSTER[2]
  e.OlympusVerifyLists = {version=2,guild=f.guild,realm=scopeRealm,
    verified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}},
    unverified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={{name=row.name,guid=row.guid,pending=false}}},
    unknown={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}}}
  check("generated display metadata alone never binds a blank realm",e.OlympusVerifyAPI.Roster.DisplaySource()==nil)
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyGuild.lua")),e)("OlympusVerify",{})
  local frame = e.FRAMES[#e.FRAMES]
  frame:GetScript("OnEvent")(frame,"PLAYER_LOGIN")
  check("login before the native roster is populated keeps the Guild tab unknown",
    e.OlympusVerifyGuild.Verification(row.name,row.guid).status=="unknown")
  check("fresh complete native PRIME roster accepts its sole enrolled GM",f.export()==2)
  local r = f.snapshot()
  check("snapshot retains the raw empty realm and explicit provenance", r.nativeRealm == ""
    and r.nativeScopeBinding.version == 1 and r.nativeScopeBinding.kind == "prime-guild-master"
    and r.nativeScopeBinding.observerGuid == e.PLAYER_GUID)
  local guild, realm, observer = f.scope()
  check("captured scope retains the current native observer", guild==f.guild and realm==scopeRealm and observer==e.PLAYER_GUID)
  local firstFacts = e.OlympusVerifyAPI.AutoSyncFacts()
  local secondFacts = e.OlympusVerifyAPI.AutoSyncFacts()
  check("Pending Sync accepts and reuses a scoped snapshot digest", firstFacts and secondFacts
    and firstFacts.strict == true and firstFacts.digest == secondFacts.digest)
  local display = e.OlympusVerifyGuild.Verification(row.name,row.guid)
  check("fresh exact Ñò Example in Guild tab clears blanket Unknown (" .. tostring(display.reason) .. ")",display.status=="unverified")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),e)("OlympusVerify",{})
  local h = e.OlympusHmac
  local code = h.codeFor(e.OlympusVerifyConfig.secret,row.name,h.utcDay(e.NOW))
  local handler = e.OlympusVerifyFrame:GetScript("OnEvent")
  handler(e.OlympusVerifyFrame,"CHAT_MSG_WHISPER","!verify " .. code,row.name,nil,nil,nil,nil,nil,nil,nil,nil,nil,row.guid)
  local event = e.OlympusVerifyDB.events[#e.OlympusVerifyDB.events]
  local intake = e.OlympusVerifyDB.intake242
  local _, request = next(intake.entries)
  check("durable whisper request preserves the accented sender and binds the signed proof",
    request and request.character==row.name and request.guid==row.guid and request.realm==scopeRealm
    and request.nativeMembership and request.nativeMembership.mac==event.nativeMembership.mac)
  local expectedScope = h.sha256hex("native-scope|1|" .. f.guild .. "|" .. scopeRealm):sub(1,16)
  check("accented realmless whisper captures original identity and affirmative native membership",
    event and event.ok and event.name==row.name and event.guid==row.guid and event.nativeMembership
    and event.nativeMembership.member==true and event.nativeMembership.scopeHash==expectedScope)
  local payload = table.concat({"membership","1","Ñò example",row.guid,code,"1",tostring(e.NOW),expectedScope},"|")
  check("code proof authenticates the accented spelling using the original bytes",
    event and event.nativeMembership and event.nativeMembership.mac==h.hmacSha256hex(e.OlympusVerifyConfig.secret,payload):sub(1,32))
  local originalBinding = r.nativeScopeBinding
  r.nativeScopeBinding = nil
  check("stripping the marker leaves the raw realm empty and disables native display", r.nativeRealm==""
    and e.OlympusVerifyAPI.Roster.DisplaySource()==nil)
  r.nativeScopeBinding = originalBinding
  check("restoring a stored binding cannot re-establish scope without a new native capture", select(2,f.scope())==nil)
  check("fresh capture re-establishes scope from live evidence", f.export()==2 and select(2,f.scope())==scopeRealm)
  r = f.snapshot()
  r.nativeScopeBinding.kind = "unknown"
  check("mutated scope metadata invalidates the Pending Sync witness", e.OlympusVerifyAPI.AutoSyncFacts()==nil)
  check("clean capture repairs an invalidated in-memory witness", f.export()==2)
  e.NOW = e.NOW + 601
  local _, expired = f.scope()
  check("the previous session observation cannot perpetuate a stale blank-realm witness", expired==nil)
end

do
  local f = blankFixture()
  local rows = f.env.ROSTER
  for i=3,1000 do
    rows[i]={name=string.format("Test Member %04d",i),guid=string.format("Player-2-%08X",i),
      rank="Member",rankIndex=7,level=50,online=false}
  end
  local started=os.clock()
  check("complete 1,000-member realmless roster preserves all rows",f.export()==1000 and #f.snapshot().members==1000)
  for _=1,60 do f.scope() end
  check("reviewing 60 visible rows hashes the enrolled observer once",f.enrollmentReads==1)
  print(string.format("MEASURE blank-realm 1000-member capture and 60 scope reads %.1f ms",(os.clock()-started)*1000))
end

for _, invalid in ipairs({"guild","slot","other-guid","non-master-row","two-masters","duplicate-observer","changed-realm","changed-guild","unknown-ranks","missing-table","changed-table","inconsistent-rank","empty-name","missing-rank","short-guid","long-guid","long-server","duplicate-member","partial"}) do
  local f = blankFixture()
  check(invalid .. " setup captures original roster", f.export()==2)
  local e, prior = f.env, f.snapshot()
  e.NOW = e.NOW+1
  if invalid=="guild" then f.guild="Olympus I"
  elseif invalid=="slot" then f.slot=1
  elseif invalid=="other-guid" then e.PLAYER_GUID="Player-1-0000CCCC"
  elseif invalid=="non-master-row" then e.ROSTER[1].rankIndex=1
  elseif invalid=="unknown-ranks" then f.rankNames[3]="Unrecognized"
  elseif invalid=="missing-table" then e.GuildControlGetNumRanks=nil
  elseif invalid=="changed-table" then
    local read=e.GetGuildRosterInfo
    e.GetGuildRosterInfo=function(i)
      local row={read(i)}
      if i==2 then f.rankNames[3]="Changed" end
      return unpack(row,1,17)
    end
  elseif invalid=="inconsistent-rank" then e.ROSTER[2].rankLabel="Initiate"
  elseif invalid=="empty-name" then e.ROSTER[2].name="  "
  elseif invalid=="missing-rank" then e.ROSTER[2].rankIndex=nil
  elseif invalid=="two-masters" then e.ROSTER[2].rankIndex=0
  elseif invalid=="short-guid" then e.ROSTER[2].guid="Player-1-ABCD"
  elseif invalid=="long-guid" then e.ROSTER[2].guid="Player-1-0123456789ABCDEF0"
  elseif invalid=="long-server" then e.ROSTER[2].guid="Player-1234567-ABCDEF00"
  elseif invalid=="duplicate-member" then
    e.ROSTER[3]={name="Other Member",guid=e.ROSTER[2].guid:gsub("BBBB","bbbb"),rank="Member",rankIndex=7,level=1,online=true}
  elseif invalid=="duplicate-observer" then e.ROSTER[2].guid=e.PLAYER_GUID
  elseif invalid=="partial" then e.GetNumGuildMembers=function() return 3,2 end
  else
    local getter=e.GetGuildRosterInfo
    e.GetGuildRosterInfo=function(i)
      if i==2 then
        if invalid=="changed-realm" then f.realm="CAMWOW US2 Realm 3 PvE" else f.guild="OLYMPUS II" end
      end
      return getter(i)
    end
  end
  check(invalid .. " holds and preserves the original snapshot", f.export()==nil and f.snapshot()==prior)
end
-- Exercise the real scope capture, signed control, projection reader, roster
-- model and secure-button hooks. Only the client's protected call is simulated.
local function selectedFixture()
  local f=blankFixture()
  local e=f.env
  local row=e.ROSTER[2]
  local steward=e.OlympusVerifyNativeRankConstants.profiles[2]
  for i,name in ipairs(steward.names) do f.rankNames[i]=name end
  row.rankIndex,row.rank=9,"Initiate"
  local granted=0
  e.CanGuildPromote=function() return true end
  e.C_GuildInfo.IsGuildRankAssignmentAllowed=function() return true end
  e.SECURE_MACRO_EXECUTE=function(body)
    assert(body=="/gpromote "..row.name)
    granted=granted+1
    row.rankIndex=row.rankIndex-1
  end
  e.OlympusVerifyAPI.Sync=function() f.syncs=(f.syncs or 0)+1;assert(f.export()==2) end
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
  local q=e.OlympusLaunch229
  f.event=function() q.Events:GetScript("OnEvent")(q.Events,"GUILD_ROSTER_UPDATE") end
  f.event()
  f.click=function()
    local button=e.CreateFrame("Button",nil,e.UIParent,"SecureActionButtonTemplate,UIPanelButtonTemplate")
    q.BindPromotionButton(button,function() return row.guid end)
    button:Show();button:Click()
    return granted
  end
  f.publish=function(finalSlot,startSlot)
    local control=e.OlympusVerifyDB.launchControl
    local d=assert(loadfile("directive_fixture280.lua"))()
    local data,page=d.publish(e,{control=control,guild=f.guild,realm="CAMWOW US2 Realm 3 PvE",total=2,
      specs={{guid=row.guid,name=row.name,start=startSlot or 9,final=finalSlot}}})
    page.rankProfile,page.rankSchemeDigest,page.rankNames=steward.profile,steward.digest,{unpack(steward.names)}
    local recommendation=page.promotions[1]
    recommendation.intent.rankProfile,recommendation.intent.rankSchemeDigest=steward.profile,steward.digest
    if finalSlot==steward.veteran then
      recommendation.targetName,recommendation.reason,recommendation.intent.reason="Veteran","knight-veteran","knight-veteran"
    end
    return data
  end
  f.selectedCount=function() return granted end
  return f,e,q,row
end
do
  local f,e,q,row=selectedFixture()
  row.rankIndex,row.rank=8,"Member"
  assert(f.export()==2)
  e.OlympusVerifyLists={version=2,guild=f.guild,realm="CAMWOW US2 Realm 3 PvE",
    verified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={{name=row.name,guid=row.guid,status="member",username="knightsample"}}},
    unverified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}},unknown={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}}}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRoster.lua")),e)("OlympusVerify")
  local desk=e.OlympusVerifyRoster
  desk.Show()
  local deskRow
  for _,view in ipairs(desk.rows) do if view.member and view.member.guid==row.guid then deskRow=view end end
  check("verified Member has an officer desk check button before a Knight read",deskRow and deskRow.check:IsShown() and not deskRow.promote:IsShown())
  if deskRow and deskRow.check:IsShown() then deskRow.check:Click() end
  check("attended blank-realm Member check accepts one exact native Member",f.syncs==1)
  if e.OlympusVerifyDB.launchControl then
    local c=e.OlympusVerifyDB.launchControl
    check("new Member read uses its own exact signed single-target purpose",c.version==6 and c.action=="select-prime-member" and c.confirmations=="[]" and #c.targetGuids==1)
    f.publish(6,8)
    local current=q.Current()
    check("blank-realm Member receives its original Knight entitlement without a native action",current and current.selection and current.selection.completed and current.promotions[1].targetSlot==6 and f.selectedCount()==0)
    check("blank-realm Member still needs one officer click for one native rank step",f.click()==1 and row.rankIndex==7)
  end
  check("automatic and bulk Initiate checks cannot start a Member Knight path",not q.SelectMany({row.guid}))
  local g,ee,qq,alt=selectedFixture()
  alt.rankIndex,alt.rank=7,"Alt"
  assert(g.export()==2)
  check("unowned Alt cannot start a blank-realm promotion",not qq.Select(alt.guid) and not g.syncs)
end
for _,final in ipairs({8,6}) do
  local f,e,q,row=selectedFixture()
  check("blank selected check waits for the enrolled native capture",not q.SelectMany({row.guid}) and not f.syncs)
  check("native enrolled capture becomes available for the selected check",f.export()==2)
  local shown={{name=row.name,guid=row.guid,rankIndex=9,rank="Initiate",status="verified"}}
  local _,info=e.OlympusVerifyRosterModel.Promotions(shown,q,e.NOW)
  check("verified INITIATE offers a check before any discovery page or selection",info.byGuid[row.guid].state=="check" and info.ready==0)
  check("the button and single row use the blank-realm Initiate-only control",q.Select(row.guid) and f.syncs==1)
  local control=e.OlympusVerifyDB.launchControl
  local bytes=table.concat({"launch-selected-read","5","select-prime-initiates",control.id,tostring(control.observedAt),control.scopeHash,control.guid,row.guid,"[]"},"|")
  check("v5 signs its exact purpose, actor and selected GUID",control.version==5 and control.action=="select-prime-initiates"
    and control.confirmations=="[]" and control.mac==e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret,bytes):sub(1,32))
  check("an unreturned request has zero promotion authority",q.Current().selection.state=="pending" and f.click()==0)
  local data=f.publish(final)
  local result=q.Current()
  check("selected projection covers the original target and retains its genuine entitlement",result and result.selection.completed
    and result.promotions[1].targetSlot==final and result.freshness[row.guid].kind=="selected" and f.selectedCount()==0)
  check("marked selection cannot supply a discovery, MOTD or risk-buffer operation",not q.Control("scan") and not q.Motd("set")
    and #q.RiskBuffer()==0 and #result.pages==0 and f.effects==0)
  local original=data.page.promotions[1].currentSlot
  data.page.promotions[1].currentSlot=8
  check("changing the original native start rank invalidates the recommendation",f.click()==0)
  data.page.promotions[1].currentSlot=original
  e.CanGuildPromote=function() return false end
  check("a ready row cannot override native officer permission",f.click()==0)
  e.CanGuildPromote=function() return true end
  check("one explicit officer click admits exactly the first promotion step",f.click()==1 and row.rankIndex==8)
  f.event()
  check("later clicks cannot reuse the first step; a new read is still required",f.click()==1 and q.Select(row.guid)
    and f.syncs==2 and f.effects==0 and e.OlympusVerifyDB.launchControl.version==6 and f.click()==1)
  check("only an unfinished Knight intent sends its original step confirmation",
    (e.OlympusVerifyDB.launchControl.confirmations~="[]")==(final==6))
end
do
  local f,e,q,row=selectedFixture()
  assert(f.export()==2 and q.SelectMany({row.guid}))
  f.publish(8)
  local control=e.OlympusVerifyDB.launchControl
  local v5mac=control.mac
  control.version,control.action=4,"select-directive"
  check("a different control purpose cannot consume a blank-scope result",q.Current().selection==nil and f.click()==0)
  control.version,control.action,control.mac=5,"select-prime-initiates",v5mac
  f.realm="CAMWOW US2 Realm 3 PvE"
  local observed=q.Current()
  check("ordinary realm cannot consume the blank-realm control",not (observed and observed.selection) and f.click()==0)
  f.realm=""
  e.NOW=e.NOW+601
  check("an expired GM witness cannot consume the signed read",q.Current()==nil and not q.SelectMany({row.guid}) and f.click()==0)
end
print(string.format("%d passed, %d failed", passed, failed))
if failed > 0 then os.exit(1) end

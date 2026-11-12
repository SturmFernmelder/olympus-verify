-- Actual launch validator/model/UI; synthetic native APIs and credentials only.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local passed,failed=0,0
local function check(name,yes) if yes then passed=passed+1;print("PASS "..name) else failed=failed+1;print("FAIL "..name) end end
local function copy(v) if type(v)~="table" then return v end local r={};for k,x in pairs(v) do r[k]=copy(x) end;return r end
local id="Player-1-0000BBBB"
local function selected(f,negative)
  local e=f.env
  check("explicit selected read accepts exact complete current native GUID",f.q.Select(id))
  local c=e.OlympusVerifyDB.launchControl
  local page=copy(f.page)
  page.snapshotId,page.snapshotAt,page.fetchedAt,page.expiresAt=13,e.NOW-2,e.NOW,e.NOW+60
  page.scan={id=string.rep("b",32),startedAt=e.NOW,expiresAt=e.NOW+598}
  page.memberCount=22;page.entitlements={offset=20,pageSize=20,scanned=2,total=22,unscanned=0,retryAfterSeconds=nil}
  page.promotions=negative and {} or {{name="Candidate",guid=id,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}}
  page.held=negative and {{name="Candidate",guid=id,reason="verification-unknown"}} or {}
  e.OlympusLaunchSelected={version=1,protocol="promotion-selection-v273",controlId=c.id,actorGuid=c.guid,targetGuid=id,scopeHash=c.scopeHash,
    observedAt=c.observedAt,snapshotId=13,snapshotAt=e.NOW-2,startedAt=c.observedAt,expiresAt=e.NOW+598,running=false,attempts=1,completed=true,
    page=page,coveredGuids={id,"Player-1-0000CCCC"}}
  return e.OlympusLaunchSelected,c
end
local function model(f)
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),f.env)()
 return f.env.OlympusVerifyRosterModel.Promotions({{guid=id,rankIndex=f.env.ROSTER[2].rankIndex,status="stale"}},f.q,f.env.NOW)
end
do
 local f=fixture();f.env.NOW=f.env.NOW+700;f.emit("GUILD_ROSTER_UPDATE")
 local old=copy(f.page);local d,c=selected(f)
 check("selection signs a new exact v2 GUID control without offset",c.version==2 and c.action=="select" and c.targetGuid==id and c.offset==nil and c.id:match("^(%d+):")==tostring(c.observedAt))
 local message=table.concat({"launch-selected-read","2","select",c.id,tostring(c.observedAt),c.scopeHash,c.guid,c.targetGuid},"|")
 check("selection MAC domain binds actor and target separately",c.mac==f.env.OlympusHmac.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
 local q=f.q.Current();local ready,why=model(f)
 check("fresh selected context survives expired independent discovery",q and q.selection.completed and q.freshness[id].kind=="selected" and ready[id] and why.ready==1)
 check("new GUID selection uses current page20 without rewriting original page0",q.pages[1]==f.page and f.page.snapshotId==old.snapshotId and f.page.fetchedAt==old.fetchedAt and q.freshness[id].offset==20)
 check("selected context does not freshen MOTD or invites",q.actionHeld and #q.invites==0 and not f.q.Motd("set") and f.motd==0)
 check("read controls and model never invoke a native action",f.direct==0 and f.fallback==0 and f.invites==0 and f.removals==0 and f.syncs==1)
 check("separate hardware click uses fresh selected GUID",f.q.HardwarePromote(id) and f.direct==1 and f.lastGuid==id)
end
do
 local f=fixture();f.env.OlympusLaunchQueue=nil;selected(f)
 check("selected-only result cannot show or set MOTD",not f.q.Motd("show") and not f.q.Motd("set") and f.motd==0)
 check("selected result works without a discovery projection",f.q.Current() and f.q.HardwarePromote(id) and f.direct==1)
end
do
 local f=fixture();local d=selected(f,true);local q=f.q.Current();local ready,why=model(f)
 check("fresh negative supersedes historical positive for the same GUID",q and #q.promotions==0 and #q.held==1 and not ready[id] and why.byGuid[id].historical)
 check("negative result never falls back to a fresh historical promotion",not f.q.HardwarePromote(id) and f.direct==0)
end
do
 local f=fixture();f.page.promotions[2]={name="Unrelated",guid="Player-1-0000DDDD",currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
 selected(f)
 local q=f.q.Current();local source=q.freshness["Player-1-0000DDDD"]
 check("selected result never lends its fresh authority to an unrelated discovery GUID",source and source.kind=="discovery" and source.actionHeld and source.snapshotId==12)
end
do
 local f=fixture();f.q.Select(id);local q=f.q.Current()
 check("pending request immediately holds the historical target",q and q.selection.state=="pending" and not f.q.HardwarePromote(id) and f.direct==0)
end
for _,kind in ipairs({"scope","actor","control","duplicate","uncovered","expiry","page-clock","policy","cursor","scanned","scan-start","scan-deadline","invites","risk","unscanned","ack-missing"}) do
 local f=fixture();local d=selected(f)
 if kind=="scope" then d.scopeHash=string.rep("f",16)
 elseif kind=="actor" then d.actorGuid=id
 elseif kind=="control" then d.controlId="other"
 elseif kind=="duplicate" then d.coveredGuids[2]=id
 elseif kind=="uncovered" then d.coveredGuids[1]="Player-1-0000DDDD"
 elseif kind=="expiry" then f.env.NOW=f.env.NOW+60;f.emit("GUILD_ROSTER_UPDATE")
 elseif kind=="page-clock" then d.page.expiresAt=d.page.fetchedAt+61
 elseif kind=="policy" then d.page.actions.automatic=true
 elseif kind=="cursor" then d.page.pageCursor="opaque"
 elseif kind=="scanned" then d.page.entitlements.scanned=20
 elseif kind=="scan-start" then d.page.scan.startedAt=d.startedAt+1
 elseif kind=="scan-deadline" then d.page.scan.expiresAt=d.expiresAt-1
 elseif kind=="invites" then d.page.invites={{guid=id}}
 elseif kind=="risk" then d.page.riskBuffer={{guid=id}}
 elseif kind=="unscanned" then d.page.entitlements.unscanned=1
 elseif kind=="ack-missing" then d.completed=false;d.page=nil;d.snapshotId=nil;d.snapshotAt=nil;d.expiresAt=nil;d.coveredGuids={} end
 check(kind.." cannot enable a selected native request",not f.q.HardwarePromote(id) and f.direct==0)
end
do
 local f=fixture();selected(f);f.unknownDirect=true
 check("unknown selected native outcome records spent custody before dispatch",not f.q.HardwarePromote(id) and f.direct==1 and f.env.OlympusVerifyDB.launchPromotionAttempts[id].state=="unknown")
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify")
 f.q=f.env.OlympusLaunch229;f.q.Events:GetScript("OnEvent")(nil,"GUILD_ROSTER_UPDATE")
 check("reload cannot erase spent unknown attempt custody",not f.q.HardwarePromote(id) and f.direct==1 and f.q.AttemptHeld(id))
end
do
 local f=fixture();f.q.Current();f.emit("PLAYER_GUILD_UPDATE","player")
 check("routine same-identity guild update only expires native roster freshness",not f.q.scopeChanged and f.q.Current() and not f.q.Select(id))
 f.emit("GUILD_ROSTER_UPDATE");check("fresh same-identity roster admits a later read control",f.q.Select(id))
 f.guild="Olympus II";f.emit("PLAYER_GUILD_UPDATE","player");f.guild="OLYMPUS PRIME";f.emit("GUILD_ROSTER_UPDATE")
 check("actual raw guild mismatch stays held after returning",f.q.scopeChanged and not f.q.Select(id) and not f.q.HardwarePromote(id))
end
do
 local f=fixture();selected(f);local d=f.env.OlympusLaunchSelected
 d.page.promotions[1].currentSlot=8;d.page.promotions[1].targetSlot=6;d.page.promotions[1].targetName="Veteran";d.page.promotions[1].reason="knight-veteran"
 f.env.ROSTER[2].rankIndex=8
 local ready,why=model(f)
 check("Knight to Veteran is a separate supported visible native target",ready[id] and why.byGuid[id].targetName=="Veteran")
 check("Knight hardware action retains exact named native target checks",f.q.HardwarePromote(id) and f.lastOrder==7)
end
do
 local f=fixture();selected(f);f.env.ROSTER[2].rankIndex=8
 local original={scopeHash=f.page.scopeHash,actorGuid="Player-1-0000AAAA",targetGuid=id,target=6,snapshotId=9,contextId=string.rep("a",32),attemptedAt=f.env.NOW-5,state="unknown"}
 f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=original}
 check("reaching a weaker new Member target cannot erase original unknown Veteran custody",not f.q.HardwarePromote(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==original and f.direct==0)
 local d=selected(f);d.page.promotions[1].currentSlot=8;d.page.promotions[1].targetSlot=6;d.page.promotions[1].targetName="Veteran";d.page.promotions[1].reason="knight-veteran"
 check("later fresh Veteran evidence still cannot repeat the retained unknown original",not f.q.HardwarePromote(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==original and f.direct==0)
 for _,record in ipairs({"malformed",{actorGuid="Player-1-0000EEEE",target=6},{scopeHash=string.rep("f",16),target=6}}) do
  f.env.OlympusVerifyDB.launchPromotionAttempts[id]=record
  d.page.promotions[1].currentSlot=9;d.page.promotions[1].targetSlot=8;d.page.promotions[1].targetName="Member";d.page.promotions[1].reason="verified-initiate"
  check("no-op preserves foreign or malformed original custody",not f.q.HardwarePromote(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==record and f.direct==0)
 end
end
do
 local f=fixture();f.page.promotions={};f.page.held={{name="Candidate",guid=id,reason="discord-entitlement-unknown"}};f.env.ROSTER[2].rankIndex=8
 local ready,d=model(f)
 check("Member source entitlement hold remains visible without a positive Veteran recommendation",not ready[id] and d.byGuid[id].state=="held" and d.byGuid[id].reason:find("Discord entitlement",1,true))
end
do
 local reasons={
  ["native-roster-receipt-required"]="fresh native roster ACK",["native-roster-changed-or-expired"]="native source changed",
  ["rate-limit-retries-exhausted"]="three rate-limit attempts",["rate-limit-exceeds-scan"]="cooldown exceeds",
  ["selection-admission-expired"]="admission window expired",["selected-target-unavailable"]="GUID is missing or ambiguous",
  ["invalid-selected-page"]="invalid or incompatible",["source-unknown"]="response was unknown",["source-refused"]="source was refused",
  ["scan-expired"]="context expired",["rate-limited-wait"]="known rate-limit wait"}
 for code,phrase in pairs(reasons) do
  local f=fixture();local d=selected(f);d.completed=false;d.running=code=="rate-limited-wait";d.stoppedReason=code;d.page=nil;d.coveredGuids={}
  local q=f.q.Current()
  check("fixed selected guidance for "..code,q and q.selection.reason:find(phrase,1,true) and not f.q.HardwarePromote(id) and f.direct==0)
 end
 local f=fixture();local d=selected(f);d.completed=false;d.stoppedReason="PRIVATE_CANARY";d.page=nil;d.coveredGuids={}
 check("unknown selected hold never echoes source text",not f.q.Current().selection.reason:find("PRIVATE_CANARY",1,true))
end
do
 ROSTER_FIXTURE_ONLY=true;local uiFixture=assert(loadfile("test_roster268.lua"))();ROSTER_FIXTURE_ONLY=nil
 local f=uiFixture();f.e.NOW=f.e.NOW+700;f.emit("GUILD_ROSTER_UPDATE");f.w.Show()
 check("same roster window exposes a disabled selected-read button before selection",f.w.selectButton and not f.w.selectButton:IsEnabled())
 local chosen
 for _,row in ipairs(f.w.rows) do if row.member and row.member.name=="Alpha" then chosen=row;break end end
 chosen:GetScript("OnMouseUp")(chosen,"LeftButton");f.w.Refresh()
 local anchor,relative,relativePoint,gap=f.w.selectButton:GetPoint()
 check("selected-read button follows Copy without sharing Refresh anchor",anchor=="LEFT" and relative==f.w.copyButton and relativePoint=="RIGHT" and gap==6 and relative~=select(2,f.w.refreshButton:GetPoint()))
 check("selecting one row enables its GUID-only read control",f.w.selectButton:IsEnabled())
 local history=copy(f.page);f.w.selectButton:Click()
 local c=f.e.OlympusVerifyDB.launchControl
 check("actual selected button sends read control and exactly one reload, never promotion",c.version==2 and c.targetGuid=="Player-1-0000B002" and c.guid=="Player-1-0000AAAA" and f.reloads==1 and f.attempts==0 and #f.promotions==0)
 f.w.Refresh();check("pending selected request has explicit state instead of stale-history label",f.w.nextButton.label:GetText()=="Promote: awaiting read")
 local page=copy(f.page);page.snapshotId=44;page.snapshotAt=f.e.NOW-2;page.fetchedAt=f.e.NOW;page.expiresAt=f.e.NOW+60
 page.scan={id=string.rep("c",32),startedAt=c.observedAt,expiresAt=f.e.NOW+598};page.memberCount=#f.e.ROSTER
 page.entitlements={offset=0,pageSize=20,scanned=#f.e.ROSTER,total=#f.e.ROSTER,unscanned=0}
 local covered={};for _,row in ipairs(f.e.ROSTER) do covered[#covered+1]=row.guid end
 f.e.OlympusLaunchSelected={version=1,protocol="promotion-selection-v273",controlId=c.id,actorGuid=c.guid,targetGuid=c.targetGuid,scopeHash=c.scopeHash,
  observedAt=c.observedAt,startedAt=c.observedAt,snapshotId=44,snapshotAt=f.e.NOW-2,expiresAt=f.e.NOW+598,running=false,attempts=1,completed=true,page=page,coveredGuids=covered}
 f.w.Refresh();f.choose(f.w.actionFilterButton,2)
 check("fresh selected page shows both current target types while history stays dated",f.names()=="Alpha,Knight,Zulu" and f.page.fetchedAt==history.fetchedAt and f.w.diagnostics.ready==3)
 check("Veteran-ready Members do not reduce the separate not-ready Initiate count",f.w.diagnostics.readyInitiates==2 and f.w.diagnostics.nativeInitiates==5 and f.w.diagnostics.notReadyInitiates==3)
 f.search("Officer")
 check("a ready target outside filters is not mislabelled as stale",f.w.nextButton.label:GetText()=="Ready outside filters" and not f.w.nextButton:IsEnabled())
 f.w.clearButton:Click();f.choose(f.w.actionFilterButton,13)
 check("dated recommendation filter retains the historical candidates",f.names()=="Alpha,Knight,Zulu")
 check("UI refresh filtering and selected-result arrival never promote automatically",#f.promotions==0 and f.attempts==0 and f.reloads==1)
end
-- .274 gives only newly issued selected promotion observations the owner's
-- longer window. Every test still calls the real validator/model/action path.
local function selected274(f)
 local d,c=selected(f)
 d.protocol="promotion-selection-v274"
 d.page.expiresAt=math.min(d.page.fetchedAt+600,d.expiresAt)
 return d,c
end
do
 local f=fixture();local d=selected274(f);local original=copy(d);local history=copy(f.page)
 f.env.NOW=f.env.NOW+300;f.emit("GUILD_ROSTER_UPDATE")
 local ready,why=model(f)
 check("new selected promotion remains actionable at five minutes with a current native roster",ready[id] and why.ready==1 and f.q.HardwarePromote(id) and f.direct==1)
 check("selected readiness states the remaining original window without renewal",why.byGuid[id].reason:find("298 seconds remaining",1,true) and why.byGuid[id].reason:find("Reloading does not renew",1,true))
 check("long selected window preserves issued dates and discovery history",d.page.fetchedAt==original.page.fetchedAt and d.page.expiresAt==original.page.expiresAt and d.expiresAt==original.expiresAt and f.page.expiresAt==history.expiresAt and f.page.fetchedAt==history.fetchedAt)
 check("long selected promotion never freshens shared invites risk or MOTD",#f.q.Current().invites==0 and #f.q.RiskBuffer()==0 and not f.q.Motd("set") and f.invites==0 and f.removals==0 and f.motd==0)
end
do
 local f=fixture();local d=selected274(f);f.env.NOW=d.page.expiresAt;f.emit("GUILD_ROSTER_UPDATE")
 local ready,why=model(f)
 check("new selected promotion is held exactly at its original clipped deadline",not ready[id] and why.byGuid[id].state=="expired" and not f.q.HardwarePromote(id) and f.direct==0)
 check("expired selected result remains dated evidence without changing its expiry",f.q.Current().selection.completed and d.page.expiresAt==d.expiresAt)
end
for _,case in ipairs({"over-600","over-context","unknown-protocol","context-clock"}) do
 local f=fixture();local d=selected274(f)
 if case=="over-600" then d.page.expiresAt=d.page.fetchedAt+601
 elseif case=="over-context" then d.page.expiresAt=d.expiresAt+1
 elseif case=="unknown-protocol" then d.protocol="promotion-selection-v999"
 elseif case=="context-clock" then d.expiresAt=d.expiresAt+1;d.page.scan.expiresAt=d.expiresAt;d.page.expiresAt=d.expiresAt end
 check(case.." cannot expand the selected promotion window",not f.q.HardwarePromote(id) and f.direct==0)
end
for _,age in ipairs({599,600}) do
 local f=fixture();local d=selected274(f)
 d.snapshotAt=d.observedAt;d.page.snapshotAt=d.snapshotAt;d.expiresAt=d.observedAt+600
 d.page.scan.expiresAt=d.expiresAt;d.page.expiresAt=d.expiresAt
 f.env.NOW=f.env.NOW+age;f.emit("GUILD_ROSTER_UPDATE")
 local acted=f.q.HardwarePromote(id)
 check("exact 600-second selected boundary at age "..age,age==599 and acted and f.direct==1 or age==600 and not acted and f.direct==0)
end
do
 local f=fixture();local d=selected274(f);d.page.expiresAt=d.page.fetchedAt+45
 f.env.NOW=f.env.NOW+45;f.emit("GUILD_ROSTER_UPDATE")
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify");f.q=f.env.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE")
 check("v274 reload preserves and enforces a shorter original observation expiry",not f.q.HardwarePromote(id) and f.direct==0 and d.page.expiresAt==d.page.fetchedAt+45)
end
do
 local f=fixture();selected(f);f.env.NOW=f.env.NOW+60;f.emit("GUILD_ROSTER_UPDATE")
 check("legacy v273 selected result keeps its original 60-second expiry",not f.q.HardwarePromote(id) and f.direct==0)
 f=fixture();local d=selected(f);d.page.expiresAt=d.page.fetchedAt+61
 check("legacy v273 cannot borrow the v274 longer cap",not f.q.HardwarePromote(id) and f.direct==0)
 f=fixture();f.page.expiresAt=f.page.fetchedAt+600
 check("shared discovery cannot borrow selected promotion's longer cap",not f.q.HardwarePromote(id) and f.direct==0 and not f.q.Motd("set"))
end
for _,case in ipairs({"stale-native","offline-incomplete","guid","duplicate","name","rank","actor","scope","actor-rank","combat","permission","assignment","named-rank","preview","prior-unknown"}) do
 local f=fixture();selected274(f);f.env.NOW=f.env.NOW+300
 if case~="stale-native" then f.emit("GUILD_ROSTER_UPDATE") end
 if case=="offline-incomplete" then f.env.GetGuildRosterShowOffline=function() return false end
 elseif case=="guid" then f.env.ROSTER[2].guid=nil
 elseif case=="duplicate" then f.env.ROSTER[2].guid=f.env.ROSTER[1].guid
 elseif case=="name" then f.env.ROSTER[2].name="Changed Native Name"
 elseif case=="rank" then f.env.ROSTER[2].rankIndex=8
 elseif case=="actor" then f.env.UnitGUID=function() return "Player-1-0000EEEE" end
 elseif case=="scope" then f.guild="Olympus II"
 elseif case=="actor-rank" then f.env.GetGuildInfo=function() return f.guild,"Member",8 end
 elseif case=="combat" then f.env.InCombatLockdown=function() return true end
 elseif case=="permission" then f.env.CanGuildPromote=function() return false end
 elseif case=="assignment" then f.env.C_GuildInfo.IsGuildRankAssignmentAllowed=function() return false end
 elseif case=="named-rank" then f.env.GuildControlGetRankName=function() return "Changed Rank" end
 elseif case=="preview" then f.env.OlympusVerifyUI={preview={}}
 elseif case=="prior-unknown" then f.env.OlympusVerifyDB.launchPromotionAttempts={[id]={state="unknown"}} end
 check("long selected window retains click-time "..case.." hold",not f.q.HardwarePromote(id) and f.direct==0 and f.fallback==0 and f.invites==0 and f.removals==0 and f.motd==0)
end
do
 local f=fixture();local d=selected274(f);f.env.NOW=f.env.NOW+300;f.emit("GUILD_ROSTER_UPDATE");f.unknownDirect=true
 check("long selected window records unknown native outcome before dispatch",not f.q.HardwarePromote(id) and f.direct==1 and f.q.AttemptHeld(id))
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify");f.q=f.env.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE")
 check("long selected window cannot clear unknown custody by reloading",not f.q.HardwarePromote(id) and f.direct==1 and f.q.AttemptHeld(id) and d.page.expiresAt==d.expiresAt)
end
print(string.format("Selected promotion: %d passed, %d failed",passed,failed));if failed>0 then error("selected promotion failed") end

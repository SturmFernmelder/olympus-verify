-- Actual launch validator/model/UI; synthetic native APIs and credentials only.
-- Moved to the v234 selected Directive read (Stage 2 addon280, 13 Nov 2026):
-- Q.Select writes a signed v4 select-directive control for an exact GUID set,
-- and the result is promotion-selection-directive-v1 with a sealed intent per
-- row. The v273 (60 s) and v274 (600 s) selected protocols were replaced by one
-- 600-second selected cap, so the old v273/v274 window split is gone.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local D=assert(loadfile("directive_fixture280.lua"))()
local passed,failed=0,0
local function check(name,yes) if yes then passed=passed+1;print("PASS "..name) else failed=failed+1;print("FAIL "..name) end end
local function copy(v) if type(v)~="table" then return v end local r={};for k,x in pairs(v) do r[k]=copy(x) end;return r end
local id="Player-1-0000BBBB"
-- o.ttl: page window (60 as the old fixture, up to 600); o.knight/o.start: path.
local function selected(f,negative,o)
  o=o or {}
  local e=f.env
  check("explicit selected read accepts exact complete current native GUID",f.q.Select(id))
  local c=e.OlympusVerifyDB.launchControl
  local spec={guid=id,name="Candidate",start=o.start or 9,final=o.knight and 5 or 7}
  local d=D.publish(e,{guild=f.guild,realm=f.realm,control=c,specs=negative and {} or {spec},
    held=negative and {{name="Candidate",guid=id,reason="verification-unknown"}} or nil,
    snapshotId=13,snapshotAt=o.snapshotAt or e.NOW-2,ttl=o.ttl or 60,total=22,context=string.rep("b",32)})
  f.sel,f.sp,f.srow=d,d.page,d.page.promotions[1]
  return d,c
end
local function model(f)
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),f.env)()
 return f.env.OlympusVerifyRosterModel.Promotions({{guid=id,rankIndex=f.env.ROSTER[2].rankIndex,status="stale"}},f.q,f.env.NOW)
end
do
 local f=fixture();f.env.NOW=f.env.NOW+700;f.emit("GUILD_ROSTER_UPDATE")
 local old=copy(f.page);local d,c=selected(f)
 check("selection signs a new exact v4 select-directive GUID control without offset",c.version==4 and c.action=="select-directive" and #c.targetGuids==1 and c.targetGuids[1]==id
   and c.confirmations=="[]" and c.offset==nil and c.id:match("^(%d+):")==tostring(c.observedAt))
 local message=table.concat({"launch-selected-read","4","select-directive",c.id,tostring(c.observedAt),c.scopeHash,c.guid,c.targetGuids[1],c.confirmations},"|")
 check("selection MAC domain binds actor and target separately",c.mac==f.env.OlympusHmac.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
 local q=f.q.Current();local ready,why=model(f)
 check("fresh selected context survives expired independent discovery",q and q.selection.completed and q.freshness[id].kind=="selected" and ready[id] and why.ready==1)
 check("selected GUID result is its own page and never rewrites original page0",q.pages[1]==f.page and f.page.snapshotId==old.snapshotId and f.page.fetchedAt==old.fetchedAt
   and q.freshness[id].page==d.page and q.freshness[id].offset==0)
 check("selected context does not freshen MOTD or invites",q.actionHeld and #q.invites==0 and not f.q.Motd("set") and f.motd==0)
 check("read controls and model never invoke a native action",f.promote==0 and f.legacy==0 and f.invites==0 and f.removals==0 and f.syncs==1)
 check("separate GUID hardware click uses its exact native name",f.click(id) and f.promote==1 and f.lastName=="Candidate-Forever" and f.restricted==0)
end
do
 local f=fixture();f.env.OlympusLaunchQueue=nil;selected(f)
 check("selected-only result cannot show or set MOTD",not f.q.Motd("show") and not f.q.Motd("set") and f.motd==0)
 check("selected result works without a discovery projection",f.q.Current() and f.click(id) and f.promote==1)
end
do
 local f=fixture();local d=selected(f,true);local q=f.q.Current();local ready,why=model(f)
 check("fresh negative supersedes historical positive for the same GUID",q and #q.promotions==0 and #q.held==1 and not ready[id] and why.byGuid[id].historical)
 check("negative result never falls back to a fresh historical promotion",not f.click(id) and f.promote==0)
end
do
 local f=fixture();f.page.promotions[2]={name="Unrelated",guid="Player-1-0000DDDD",currentSlot=9,targetSlot=7,targetName="Member",reason="verified-initiate"}
 selected(f)
 local q=f.q.Current();local source=q.freshness["Player-1-0000DDDD"]
 check("selected result never lends its fresh authority to an unrelated discovery GUID",source and source.kind=="discovery" and source.actionHeld and source.snapshotId==12)
end
do
 local f=fixture();f.q.Select(id);local q=f.q.Current()
 check("pending request immediately holds the historical target",q and q.selection.state=="pending" and not f.click(id) and f.promote==0)
end
-- page-clock: v273 capped a selected page at 60 s; the v234 cap is the 600-second selected window.
for _,kind in ipairs({"scope","actor","control","duplicate","uncovered","expiry","page-clock","policy","cursor","scanned","scan-start","scan-deadline","invites","risk","unscanned","ack-missing"}) do
 local f=fixture();local d=selected(f)
 if kind=="scope" then d.scopeHash=string.rep("f",16)
 elseif kind=="actor" then d.actorGuid=id
 elseif kind=="control" then d.controlId="other"
 elseif kind=="duplicate" then d.coveredGuids[2]=id
 elseif kind=="uncovered" then d.coveredGuids[1]="Player-1-0000DDDD"
 elseif kind=="expiry" then f.env.NOW=f.env.NOW+60;f.emit("GUILD_ROSTER_UPDATE")
 elseif kind=="page-clock" then d.page.expiresAt=d.page.fetchedAt+601
 elseif kind=="policy" then d.page.actions.automatic=true
 elseif kind=="cursor" then d.page.pageCursor="opaque"
 elseif kind=="scanned" then d.page.entitlements.scanned=20
 elseif kind=="scan-start" then d.page.scan.startedAt=d.startedAt+1
 elseif kind=="scan-deadline" then d.page.scan.expiresAt=d.expiresAt-1
 elseif kind=="invites" then d.page.invites={{guid=id}}
 elseif kind=="risk" then d.page.riskBuffer={{guid=id}}
 elseif kind=="unscanned" then d.page.entitlements.unscanned=1
 elseif kind=="ack-missing" then d.completed=false;d.page=nil;d.snapshotId=nil;d.snapshotAt=nil;d.expiresAt=nil;d.coveredGuids={} end
 check(kind.." cannot enable a selected native request",not f.click(id) and f.promote==0)
end
do
 local f=fixture();selected(f);f.unknownPromote=true
 check("unknown selected native outcome records spent custody before dispatch",not f.click(id) and f.promote==1 and f.env.OlympusVerifyDB.launchPromotionAttempts[id].state=="unknown")
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify")
 f.q=f.env.OlympusLaunch229;f.q.Events:GetScript("OnEvent")(nil,"GUILD_ROSTER_UPDATE")
 check("reload cannot erase spent unknown attempt custody",not f.click(id) and f.promote==1 and f.q.AttemptHeld(id))
end
do
 local f=fixture();f.q.Current();f.emit("PLAYER_GUILD_UPDATE","player")
 check("routine same-identity guild update only expires native roster freshness",not f.q.scopeChanged and f.q.Current() and not f.q.Select(id))
 f.emit("GUILD_ROSTER_UPDATE");check("fresh same-identity roster admits a later read control",f.q.Select(id))
 f.guild="Olympus II";f.emit("PLAYER_GUILD_UPDATE","player");f.guild="OLYMPUS PRIME";f.emit("GUILD_ROSTER_UPDATE")
 check("actual raw guild mismatch stays held after returning",f.q.scopeChanged and not f.q.Select(id) and not f.click(id))
end
do
 local f=fixture();f.env.ROSTER[2].rankIndex=8;selected(f,false,{knight=true,start=8})
 local ready,why=model(f)
 check("Knight to Veteran is a separate supported visible native target",ready[id] and why.byGuid[id].targetName=="Veteran")
 check("Knight hardware action takes only one rank toward the exact named target",f.click(id) and f.lastName=="Candidate-Forever" and f.env.ROSTER[2].rankIndex==7 and f.restricted==0)
end
-- The retained record is loaded before this session first reads the ledger, as
-- SavedVariables are, so each refusal below comes from the record itself rather
-- than from the storage-replacement guard. The v234 Q.Select refuses such a
-- target, so the later selected evidence is published as the server would.
do
 local f=fixture();f.env.ROSTER[2].rankIndex=8
 local original={scopeHash=f.page.scopeHash,actorGuid="Player-1-0000AAAA",targetGuid=id,target=6,snapshotId=9,contextId=string.rep("a",32),attemptedAt=f.env.NOW-5,state="unknown"}
 f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=original}
 check("a new selected read cannot repair the retained unknown original",not f.q.Select(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==original
   and f.env.OlympusVerifyDB.launchControl==f.discovery and not f.syncs)
 f.directive()
 check("reaching a weaker new Member target cannot erase original unknown Veteran custody",not f.click(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==original and f.promote==0)
 f.directive({knight=true,start=8})
 check("later fresh Veteran evidence still cannot repeat the retained unknown original",not f.click(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==original and f.promote==0
   and f.env.OlympusVerifyDB.launchPromotionCustodyConflict==nil)
end
for _,record in ipairs({"malformed",{actorGuid="Player-1-0000EEEE",target=6},{scopeHash=string.rep("f",16),target=6}}) do
 local f=fixture();f.env.ROSTER[2].rankIndex=8
 f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=record}
 f.directive({knight=true,start=8})
 check("no-op preserves foreign or malformed original custody",not f.click(id) and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==record and f.promote==0
   and f.env.OlympusVerifyDB.launchPromotionCustodyConflict==nil)
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
  check("fixed selected guidance for "..code,q and q.selection.reason:find(phrase,1,true) and not f.click(id) and f.promote==0)
 end
 local f=fixture();local d=selected(f);d.completed=false;d.stoppedReason="PRIVATE_CANARY";d.page=nil;d.coveredGuids={}
 check("unknown selected hold never echoes source text",not f.q.Current().selection.reason:find("PRIVATE_CANARY",1,true))
end
do
 ROSTER_FIXTURE_ONLY=true;local uiFixture=assert(loadfile("test_roster268.lua"))();ROSTER_FIXTURE_ONLY=nil
 local f=uiFixture();f.e.OlympusLaunchSelected=nil;f.e.NOW=f.e.NOW+700;f.emit("GUILD_ROSTER_UPDATE");f.w.Show()
 check("same roster window exposes a disabled selected-read button before selection",f.w.selectButton and not f.w.selectButton:IsEnabled())
 local function pick(name)
  for _,row in ipairs(f.w.rows) do if row.member and row.member.name==name then row:GetScript("OnMouseUp")(row,"LeftButton");f.w.Refresh();return end end
  error("missing roster row "..name)
 end
 pick("Alpha")
 local anchor,relative,relativePoint,gap=f.w.selectButton:GetPoint()
 check("selected-read button follows Copy without sharing Refresh anchor",anchor=="LEFT" and relative==f.w.copyButton and relativePoint=="RIGHT" and gap==6 and relative~=select(2,f.w.refreshButton:GetPoint()))
 check("selecting one row enables its GUID-only read control",f.w.selectButton:IsEnabled())
 local history=copy(f.page);f.w.selectButton:Click()
 local c=f.e.OlympusVerifyDB.launchControl
 check("actual selected button sends read control and exactly one reload, never promotion",c.version==4 and #c.targetGuids==1 and c.targetGuids[1]=="Player-1-0000B002" and c.guid=="Player-1-0000AAAA" and f.reloads==1 and f.attempts==0 and #f.promotions==0)
 f.w.Refresh();check("pending selected request has explicit state instead of stale-history label",f.w.nextButton.label:GetText()=="Promote: awaiting read")
 f.publish({control=c,snapshotId=44,specs={{guid="Player-1-0000B002",name="Alpha",start=9,final=7}}})
 f.w.Refresh();f.choose(f.w.actionFilterButton,2)
 -- v273 covered the whole roster in one selected page; a v4 read is the exact
 -- GUID set the officer chose, so only that GUID becomes ready.
 check("fresh selected page makes only its exact GUID ready while history stays dated",f.names()=="Alpha" and f.page.fetchedAt==history.fetchedAt and f.w.diagnostics.ready==1)
 f.w.clearButton:Click();pick("Knight");f.w.selectButton:Click();c=f.e.OlympusVerifyDB.launchControl
 f.publish({control=c,snapshotId=45,specs={{guid="Player-1-0000B007",name="Knight",start=7,final=5}}})
 f.w.Refresh();f.choose(f.w.actionFilterButton,2)
 check("Veteran-ready Members do not reduce the separate not-ready Initiate count",f.names()=="Knight" and f.w.diagnostics.ready==1 and f.w.diagnostics.readyInitiates==0 and f.w.diagnostics.nativeInitiates==5 and f.w.diagnostics.notReadyInitiates==5)
 f.search("Officer")
 check("a ready target outside filters is not mislabelled as stale",f.w.nextButton.label:GetText()=="Ready outside filters" and not f.w.nextButton:IsEnabled())
 f.w.clearButton:Click();f.choose(f.w.actionFilterButton,13)
 check("dated recommendation filter retains the historical candidates",f.names()=="Alpha,Knight,Zulu")
 check("UI refresh filtering and selected-result arrival never promote automatically",#f.promotions==0 and f.attempts==0 and f.reloads==2)
end
-- The longer selected window is now the only selected window (600 s, clipped
-- to the original read and snapshot). Every test calls the real validator/model/action path.
local function selected274(f,o)
 o=o or {};o.ttl=600
 return selected(f,false,o)
end
do
 local f=fixture();local d=selected274(f);local original=copy(d);local history=copy(f.page)
 f.env.NOW=f.env.NOW+300;f.emit("GUILD_ROSTER_UPDATE")
 local ready,why=model(f)
 check("new selected promotion remains actionable at five minutes with a current native roster",ready[id] and why.ready==1 and f.click(id) and f.promote==1)
 check("selected readiness states the remaining original window without renewal",why.byGuid[id].reason:find("298 seconds remaining",1,true) and why.byGuid[id].reason:find("Reloading does not renew",1,true))
 check("long selected window preserves issued dates and discovery history",d.page.fetchedAt==original.page.fetchedAt and d.page.expiresAt==original.page.expiresAt and d.expiresAt==original.expiresAt and f.page.expiresAt==history.expiresAt and f.page.fetchedAt==history.fetchedAt)
 check("long selected promotion never freshens shared invites risk or MOTD",#f.q.Current().invites==0 and #f.q.RiskBuffer()==0 and not f.q.Motd("set") and f.invites==0 and f.removals==0 and f.motd==0)
end
do
 local f=fixture();local d=selected274(f);f.env.NOW=d.page.expiresAt;f.emit("GUILD_ROSTER_UPDATE")
 local ready,why=model(f)
 check("new selected promotion is held exactly at its original clipped deadline",not ready[id] and why.byGuid[id].state=="expired" and not f.click(id) and f.promote==0)
 check("expired selected result remains dated evidence without changing its expiry",f.q.Current().selection.completed and d.page.expiresAt==d.expiresAt)
end
for _,case in ipairs({"over-600","over-context","unknown-protocol","context-clock"}) do
 local f=fixture();local d=selected274(f)
 if case=="over-600" then d.page.expiresAt=d.page.fetchedAt+601
 elseif case=="over-context" then d.page.expiresAt=d.expiresAt+1
 elseif case=="unknown-protocol" then d.protocol="promotion-selection-v999"
 elseif case=="context-clock" then d.expiresAt=d.expiresAt+1;d.page.scan.expiresAt=d.expiresAt;d.page.expiresAt=d.expiresAt end
 check(case.." cannot expand the selected promotion window",not f.click(id) and f.promote==0)
end
for _,age in ipairs({599,600}) do
 -- Snapshot taken at the read itself, so the window is exactly the read plus 600 s.
 local f=fixture();local d=selected274(f,{snapshotAt=f.env.NOW})
 check("selected window at the read is exactly 600 seconds",d.snapshotAt==d.observedAt and d.expiresAt==d.observedAt+600 and d.page.expiresAt==d.expiresAt)
 f.env.NOW=f.env.NOW+age;f.emit("GUILD_ROSTER_UPDATE")
 local acted=f.click(id)
 check("exact 600-second selected boundary at age "..age,age==599 and acted and f.promote==1 or age==600 and not acted and f.promote==0)
end
do
 local f=fixture();local d=selected274(f);d.page.expiresAt=d.page.fetchedAt+45
 f.env.NOW=f.env.NOW+45;f.emit("GUILD_ROSTER_UPDATE")
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify");f.q=f.env.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE")
 check("selected reload preserves and enforces a shorter original observation expiry",not f.click(id) and f.promote==0 and d.page.expiresAt==d.page.fetchedAt+45)
end
do
 local f=fixture();selected(f);f.env.NOW=f.env.NOW+60;f.emit("GUILD_ROSTER_UPDATE")
 check("a selected result keeps its own original 60-second page expiry",not f.click(id) and f.promote==0)
 f=fixture();f.page.expiresAt=f.page.fetchedAt+600
 check("shared discovery cannot borrow selected promotion's longer cap",not f.click(id) and f.promote==0 and not f.q.Motd("set"))
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
 elseif case=="prior-unknown" then
  -- Saved by an earlier session: install it, then reload as the client does.
  f.env.OlympusVerifyDB.launchPromotionAttempts={[id]={state="unknown"}}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify");f.q=f.env.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE") end
 check("long selected window retains click-time "..case.." hold",not f.click(id) and f.promote==0 and f.legacy==0 and f.invites==0 and f.removals==0 and f.motd==0)
end
do
 local f=fixture();local d=selected274(f);f.env.NOW=f.env.NOW+300;f.emit("GUILD_ROSTER_UPDATE");f.unknownPromote=true
 check("long selected window records unknown native outcome before dispatch",not f.click(id) and f.promote==1 and f.q.AttemptHeld(id))
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify");f.q=f.env.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE")
 check("long selected window cannot clear unknown custody by reloading",not f.click(id) and f.promote==1 and f.q.AttemptHeld(id) and d.page.expiresAt==d.expiresAt)
end
print(string.format("Selected promotion: %d passed, %d failed",passed,failed));if failed>0 then error("selected promotion failed") end

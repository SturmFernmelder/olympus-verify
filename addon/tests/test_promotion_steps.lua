-- Actual dispatcher/model; every native API and persisted DB below is synthetic.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local passed,failed=0,0
local id="Player-1-0000BBBB"
local function check(label,yes)
  if yes then passed=passed+1;print("PASS "..label) else failed=failed+1;print("FAIL "..label) end
end
local function record(f) local ledger=f.env.OlympusVerifyDB.launchPromotionAttempts;return ledger and ledger[id] end
local function knight(f)
  local row=f.page.promotions[1]
  row.targetSlot,row.targetName,row.reason=6,"Veteran","knight-veteran"
end
local function model(f)
  if not f.env.OlympusVerifyRosterModel then setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),f.env)("OlympusVerify") end
  return f.env.OlympusVerifyRosterModel.Promotions({{name="Candidate-Forever",guid=id,rankIndex=f.env.ROSTER[2].rankIndex,status="verified"}},f.q,f.env.NOW)
end
local function reload(f)
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),f.env)("OlympusVerify")
  f.q=f.env.OlympusLaunch229
end
do
  local f=fixture()
  check("ordinary verified Initiate requests one named promotion to Member",f.click(id) and f.promote==1 and f.lastName=="Candidate-Forever" and f.env.ROSTER[2].rankIndex==8 and f.restricted==0)
  local r=record(f);local attemptedAt,context=r.attemptedAt,r.contextId
  check("successful API return alone stays unknown",r.state=="unknown" and f.q.pending[id] and f.q.AttemptHeld(id))
  check("without a new native event even an already changed target cannot settle",not f.click(id) and record(f)==r and r.state=="unknown" and f.promote==1)
  f.emit("GUILD_ROSTER_UPDATE")
  check("new complete roster confirms observed target without another API call",r.state=="confirmed" and r.completed and r.observedSlot==8 and not f.q.pending[id] and f.promote==1)
  check("confirmed record retains original context and attempt metadata",r.attemptedAt==attemptedAt and r.contextId==context and r.startSlot==9 and r.steps[1].from==9 and r.steps[1].expected==8 and r.steps[1].state=="rank-observed")
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed SavedVariables survives module reload without repeating",record(f)==r and not f.click(id) and f.promote==1)
  knight(f);f.page.promotions[1].currentSlot=8
  check("different target cannot borrow the same original context",not f.click(id) and record(f)==r and f.promote==1)
  f.page.scan.id=string.rep("b",32)
  check("new fresh context may start a later different promotion retaining history",f.click(id) and f.promote==2 and record(f).previous==r and r.state=="confirmed" and f.env.ROSTER[2].rankIndex==7)
end
do
  local f=fixture();f.click(id);f.env.NOW=f.env.NOW+2;f.emit("GUILD_ROSTER_UPDATE")
  local r=record(f);knight(f);f.page.promotions[1].currentSlot=8;f.page.scan.id=string.rep("b",32)
  check("a different context issued before confirmation cannot authorize a later target",not f.click(id) and record(f)==r and f.promote==1)
end
do
  local f=fixture();knight(f)
  local original=f.page.promotions[1]
  for step=1,3 do
    check("Knight step "..step.." is a separate one-rank hardware call",f.click(id) and f.promote==step and f.env.ROSTER[2].rankIndex==9-step)
    check("Knight step "..step.." cannot repeat before a new native event",not f.click(id) and f.promote==step)
    f.emit("GUILD_ROSTER_UPDATE")
    local ready,d=model(f)
    check("native event never automatically requests the next Knight rank "..step,f.promote==step and f.restricted==0 and f.invites==0 and f.removals==0)
    check("original source row is never rewritten by step "..step,original.currentSlot==9 and original.targetSlot==6 and f.page.promotions[1]==original)
    if step<3 then check("model exposes only the proven next separate step "..step,ready[id] and d.byGuid[id].state=="ready" and f.q.PromotionStatus(id,f.q.Current(),9-step)=="continue")
    else check("final Veteran observation remains confirmed and nonactionable",not ready[id] and record(f).completed and record(f).observedSlot==6 and #record(f).steps==3 and not f.click(id)) end
  end
end
for _,change in ipairs({"name","guid","rank-skip","actor","scope","context","snapshot","expiry","permission","named-target","offline","stale-roster"}) do
  local f=fixture();knight(f);f.click(id)
  if change=="name" then f.env.ROSTER[2].name="Other"
  elseif change=="guid" then f.env.ROSTER[2].guid="Player-1-0000CCCC"
  elseif change=="rank-skip" then f.env.ROSTER[2].rankIndex=7
  elseif change=="actor" then f.env.UnitGUID=function() return "Player-1-0000DDDD" end
  elseif change=="scope" then f.guild="Olympus II"
  elseif change=="context" then f.page.scan.id=string.rep("c",32)
  elseif change=="snapshot" then f.page.snapshotId=13
  elseif change=="expiry" then f.env.NOW=f.env.NOW+60
  elseif change=="permission" then f.env.CanGuildPromote=function() return false end
  elseif change=="named-target" then f.env.GuildControlGetRankName=function() return "Other" end
  elseif change=="offline" then f.env.GetGuildRosterShowOffline=function() return false end end
  f.emit("GUILD_ROSTER_UPDATE")
  if change=="stale-roster" then f.env.NOW=f.env.NOW+16 end
  check("step continuation rechecks "..change,not f.click(id) and f.promote==1 and f.restricted==0)
end
do
  local f=fixture();f.noRankChange=true
  check("nil native return without a rank change is a request rather than an ACK",f.click(id) and record(f).state=="unknown")
  local r=record(f)
  f.emit("ADDON_ACTION_FORBIDDEN","OlympusVerify","C_GuildInfo.Promote()")
  check("delayed blocked event preserves unknown record and marks only client capability",record(f)==r and r.state=="unknown" and f.q.promotionBlocked)
  f.emit("GUILD_ROSTER_UPDATE")
  check("delayed block cannot turn a native event into retry permission",not f.click(id) and f.promote==1 and not record(f).completed)
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("reload cannot erase a delayed blocked unknown attempt",not f.click(id) and record(f)==r and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture()
  f.emit("ADDON_ACTION_FORBIDDEN","OtherAddon","C_GuildInfo.Promote()")
  f.emit("ADDON_ACTION_BLOCKED","OlympusVerify","C_GuildInfo.SetMOTD()")
  check("unrelated delayed block events do not fabricate a promotion outcome",not f.q.promotionBlocked and f.click(id) and record(f).state=="unknown")
end
do
  local f=fixture();f.blockPromote=true
  check("synchronous blocked action is spent before the API returns",not f.click(id) and record(f).state=="unknown" and f.promote==1 and f.legacy==0)
  f.emit("GUILD_ROSTER_UPDATE");reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("synchronous block is never retried through the legacy API",not f.click(id) and f.promote==1 and f.legacy==0)
end
do
  local f=fixture(true)
  check("client without namespaced Promote uses secure command rather than a legacy Lua call",f.click(id) and f.legacy==0 and f.direct==0 and f.promote==1 and f.restricted==0 and f.lastName=="Candidate-Forever")
  f=fixture();f.env.C_GuildInfo.Promote=nil;f.env.GuildPromote=nil
  check("missing direct Lua promotion APIs do not prevent the native secure command",f.click(id) and f.restricted==0 and f.direct==0 and f.legacy==0 and record(f).state=="unknown")
end
for _,legacy in ipairs({{state="unknown"},{state="unknown",target=6},{state="confirmed"},"malformed"}) do
  local f=fixture();f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=legacy};f.env.ROSTER[2].rankIndex=8
  f.emit("GUILD_ROSTER_UPDATE");reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("existing unknown or malformed custody is not retroactively settled",record(f)==legacy and not f.click(id) and f.q.AttemptHeld(id) and f.promote==0)
end
do
  local f=fixture();knight(f);f.click(id);f.emit("GUILD_ROSTER_UPDATE")
  check("intermediate confirmation cannot survive reload as continuation authority",record(f).state=="confirmed" and not record(f).completed)
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("reloaded intermediate step remains held without session confirmation",not f.click(id) and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture();f.noRankChange=true;f.click(id)
  f.env.OlympusVerifyDB.launchPromotionAttempts[id]=nil
  check("loss of durable custody cannot erase the original in-session pending call",not f.click(id) and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture();local readyId,changedId="Player-1-0000CCCC","Player-1-0000DDDD"
  f.env.ROSTER[3]={name="Ready",rankIndex=9,guid=readyId}
  f.env.ROSTER[4]={name="Changed rank",rankIndex=8,guid=changedId}
  local old={state="unknown",target=8}
  f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=old}
  f.page.promotions[2]={name="Changed rank",guid=changedId,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  f.page.promotions[3]={name="Ready",guid=readyId,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  f.env.SECURE_MACRO_EXECUTE=function(body)
    local name=body:sub(11)
    f.promote=f.promote+1;f.lastName=name
    for index,row in ipairs(f.env.ROSTER) do if f.env.GetGuildRosterInfo(index)==name then row.rankIndex=row.rankIndex-1 end end
  end
  check("Promote next selects a separate confirmation after skipping held and changed rows",f.q.NextAction() and f.promote==0 and f.q.confirmGuid==readyId
    and f.env.ROSTER[3].rankIndex==9 and record(f)==old and f.env.OlympusVerifyDB.launchPromotionAttempts[changedId]==nil)
  f.q.promotionConfirmButton:Click()
  check("selected confirmation changes only the exact later native target",f.promote==1 and f.lastName=="Ready-Forever" and f.env.ROSTER[3].rankIndex==8 and record(f)==old)
  check("Promote next never retries held rows after the later single request",not f.q.NextAction() and f.promote==1 and record(f)==old and f.restricted==0)
end
-- Model the secure template separately from addon Lua dispatch. These tests
-- establish arm/disarm/custody behavior, never native secure-code acceptance.
local function bound(f,resolver)
  local b=f.env.CreateFrame("Button",nil,f.env.UIParent,"SecureActionButtonTemplate,UIPanelButtonTemplate")
  b:Show();assert(f.q.BindPromotionButton(b,resolver or function() return id end))
  return b
end
do
  local f=fixture()
  check("slash/direct entry opens confirmation without creating an attempt or calling a promotion API",f.q.HardwarePromote(id)
    and f.q.promotionConfirm:IsShown() and f.promote==0 and f.direct==0 and f.legacy==0 and record(f)==nil)
  local b=f.q.promotionConfirmButton
  check("binding preserves the inherited secure template handler",b:GetScript("OnClick")==b._secureHandler)
  check("confirmation starts with no armed macro",b:GetAttribute("type1")==nil and b:GetAttribute("macrotext1")==nil)
  b:Click()
  check("native command sees durable unknown reservation before it runs",f.reservedBeforeCommand and record(f).steps[1].state=="unknown")
  check("one command has exact full native name and no direct Lua APIs",f.promote==1 and f.lastBody=="/gpromote Candidate-Forever" and f.direct==0 and f.legacy==0 and f.restricted==0)
  check("a sent command requests one read-only native roster without another promotion",f.env.ROSTER_ASKS==1 and f.promote==1 and record(f).state=="unknown")
  check("PostClick removes every armed target immediately",b:GetAttribute("type1")==nil and b:GetAttribute("macrotext1")==nil
    and b:GetAttribute("type")==nil and b:GetAttribute("macrotext")==nil and not f.q.promotionConfirm:IsShown())
end
for _,case in ipairs({"right","down","shift","control","alt","hidden","recycled","expiry","slash-name","backslash-name"}) do
  local f=fixture();local selected=id
  local b=bound(f,function() return selected end)
  -- Simulate an abandoned old attribute to prove every rejected up-click clears it.
  b:SetAttribute("type1","macro");b:SetAttribute("macrotext1","/gpromote Obsolete")
  if case=="shift" then f.env.IsShiftKeyDown=function() return true end
  elseif case=="control" then f.env.IsControlKeyDown=function() return true end
  elseif case=="alt" then f.env.IsAltKeyDown=function() return true end
  elseif case=="hidden" then b:Hide()
  elseif case=="recycled" then selected="Player-1-0000CCCC"
  elseif case=="expiry" then f.env.NOW=f.env.NOW+60;f.emit("GUILD_ROSTER_UPDATE")
  elseif case=="slash-name" then f.env.ROSTER[2].name="Candidate/Other";f.page.promotions[1].name="Candidate/Other"
  elseif case=="backslash-name" then f.env.ROSTER[2].name="Candidate\\Other";f.page.promotions[1].name="Candidate\\Other" end
  b:Click(case=="right" and "RightButton" or "LeftButton",case=="down")
  check("secure guard disarms rejected "..case.." before a native command",f.promote==0 and f.direct==0 and f.legacy==0
    and record(f)==nil and b:GetAttribute("type1")==nil and b:GetAttribute("macrotext1")==nil)
end
do
  local f=fixture();local b=bound(f);local writes=0;local set=b.SetAttribute
  b.SetAttribute=function(self,key,value) writes=writes+1;return set(self,key,value) end
  f.env.InCombatLockdown=function() return true end
  b:Click()
  check("combat click does not mutate protected attributes or issue a command",writes==0 and f.promote==0 and record(f)==nil)
end
do
  local f=fixture();local b=bound(f)
  b:SetAttribute("macrotext1","/gpromote Old");b:SetAttribute("type1","macro");b:Hide()
  check("hiding an out-of-combat control clears stale target attributes",b:GetAttribute("type1")==nil and b:GetAttribute("macrotext1")==nil and f.promote==0)
end
do
  local f=fixture();f.click(id);local original=record(f)
  local d=f.q.PromotionCustodyDiagnostics();local row=d.rows[1]
  check("runtime custody diagnostics compare actual DB ledger and entry references",d.ledgerCount==1 and d.sessionCount==1
    and row.databaseSame and row.ledgerSame and row.entrySame and row.phase=="post-click" and row.state=="unknown")
  f.emit("GUILD_ROSTER_UPDATE");d=f.q.PromotionCustodyDiagnostics();row=d.rows[1]
  check("confirmed diagnostic reports the existing observation without manufacturing another",row.state=="confirmed" and row.completed and row.observedSlot==8
    and row.phase=="rank-observed" and record(f)==original and f.promote==1)
  f.emit("PLAYER_LOGOUT");local saved=f.env.OlympusVerifyDB.launchPromotionCustodyDiagnostic
  check("logout diagnostic snapshot contains only copied scalars and no attempt reference",saved and saved.version==1 and saved.rows[1]~=row
    and saved.rows[1].entrySame and saved.rows[1].state=="confirmed" and saved.rows[1].record==nil and saved.rows[1].ledger==nil
    and f.promote==1 and record(f)==original)
  local old=f.env.OlympusVerifyDB
  old.launchPromotionAttempts={};d=f.q.PromotionCustodyDiagnostics();row=d.rows[1]
  check("diagnostics expose replaced ledger without restoring or borrowing its missing receipt",d.ledgerCount==0 and d.sessionCount==1
    and row.databaseSame and not row.ledgerSame and not row.entrySame and not row.ledgerPresent and original.state=="confirmed"
    and next(old.launchPromotionAttempts)==nil and f.promote==1)
  f.env.OlympusVerifyDB={};d=f.q.PromotionCustodyDiagnostics();row=d.rows[1]
  check("diagnostics expose replaced DB without reattaching prior state",not row.databaseSame and not row.entrySame
    and f.env.OlympusVerifyDB.launchPromotionAttempts==nil and f.promote==1)
  f.emit("PLAYER_LOGOUT")
  check("logout diagnostics never reconstruct missing attempts",f.env.OlympusVerifyDB.launchPromotionAttempts==nil
    and f.env.OlympusVerifyDB.launchPromotionCustodyDiagnostic.rows[1].entrySame==false and old.launchPromotionAttempts~=nil)
end
do
  local f=fixture();local legacy={state="unknown",target=8}
  f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=legacy}
  f.env.NOW=f.env.NOW+1000
  f.q.Print()
  check("expired source still prints bounded custody diagnostics without changing old unknowns",record(f)==legacy and legacy.completed==nil
    and f.env.PRINTS[1]:find("custody (runtime only)",1,true) and f.promote==0 and f.direct==0)
end
print(string.format("Promotion steps: %d passed, %d failed",passed,failed))
if failed>0 then error("promotion steps failed") end

-- Actual dispatcher/model; every native API and persisted DB below is synthetic.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local passed,failed=0,0
local id="Player-1-0000BBBB"
local function check(label,yes)
  if yes then passed=passed+1;print("PASS "..label) else failed=failed+1;print("FAIL "..label) end
end
local function record(f) return f.env.OlympusVerifyDB.launchPromotionAttempts[id] end
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
  check("ordinary verified Initiate requests one named promotion to Member",f.q.HardwarePromote(id) and f.promote==1 and f.lastName=="Candidate-Forever" and f.env.ROSTER[2].rankIndex==8 and f.restricted==0)
  local r=record(f);local attemptedAt,context=r.attemptedAt,r.contextId
  check("successful API return alone stays unknown",r.state=="unknown" and f.q.pending[id] and f.q.AttemptHeld(id))
  check("without a new native event even an already changed target cannot settle",not f.q.HardwarePromote(id) and record(f)==r and r.state=="unknown" and f.promote==1)
  f.emit("GUILD_ROSTER_UPDATE")
  check("new complete roster confirms observed target without another API call",r.state=="confirmed" and r.completed and r.observedSlot==8 and not f.q.pending[id] and f.promote==1)
  check("confirmed record retains original context and attempt metadata",r.attemptedAt==attemptedAt and r.contextId==context and r.startSlot==9 and r.steps[1].from==9 and r.steps[1].expected==8 and r.steps[1].state=="rank-observed")
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed SavedVariables survives module reload without repeating",record(f)==r and not f.q.HardwarePromote(id) and f.promote==1)
  knight(f);f.page.promotions[1].currentSlot=8
  check("different target cannot borrow the same original context",not f.q.HardwarePromote(id) and record(f)==r and f.promote==1)
  f.page.scan.id=string.rep("b",32)
  check("new fresh context may start a later different promotion retaining history",f.q.HardwarePromote(id) and f.promote==2 and record(f).previous==r and r.state=="confirmed" and f.env.ROSTER[2].rankIndex==7)
end
do
  local f=fixture();f.q.HardwarePromote(id);f.env.NOW=f.env.NOW+2;f.emit("GUILD_ROSTER_UPDATE")
  local r=record(f);knight(f);f.page.promotions[1].currentSlot=8;f.page.scan.id=string.rep("b",32)
  check("a different context issued before confirmation cannot authorize a later target",not f.q.HardwarePromote(id) and record(f)==r and f.promote==1)
end
do
  local f=fixture();knight(f)
  local original=f.page.promotions[1]
  for step=1,3 do
    check("Knight step "..step.." is a separate one-rank hardware call",f.q.HardwarePromote(id) and f.promote==step and f.env.ROSTER[2].rankIndex==9-step)
    check("Knight step "..step.." cannot repeat before a new native event",not f.q.HardwarePromote(id) and f.promote==step)
    f.emit("GUILD_ROSTER_UPDATE")
    local ready,d=model(f)
    check("native event never automatically requests the next Knight rank "..step,f.promote==step and f.restricted==0 and f.invites==0 and f.removals==0)
    check("original source row is never rewritten by step "..step,original.currentSlot==9 and original.targetSlot==6 and f.page.promotions[1]==original)
    if step<3 then check("model exposes only the proven next separate step "..step,ready[id] and d.byGuid[id].state=="ready" and f.q.PromotionStatus(id,f.q.Current(),9-step)=="continue")
    else check("final Veteran observation remains confirmed and nonactionable",not ready[id] and record(f).completed and record(f).observedSlot==6 and #record(f).steps==3 and not f.q.HardwarePromote(id)) end
  end
end
for _,change in ipairs({"name","guid","rank-skip","actor","scope","context","snapshot","expiry","permission","named-target","offline","stale-roster"}) do
  local f=fixture();knight(f);f.q.HardwarePromote(id)
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
  check("step continuation rechecks "..change,not f.q.HardwarePromote(id) and f.promote==1 and f.restricted==0)
end
do
  local f=fixture();f.noRankChange=true
  check("nil native return without a rank change is a request rather than an ACK",f.q.HardwarePromote(id) and record(f).state=="unknown")
  local r=record(f)
  f.emit("ADDON_ACTION_FORBIDDEN","OlympusVerify","C_GuildInfo.Promote()")
  check("delayed blocked event preserves unknown record and marks only client capability",record(f)==r and r.state=="unknown" and f.q.promotionBlocked)
  f.emit("GUILD_ROSTER_UPDATE")
  check("delayed block cannot turn a native event into retry permission",not f.q.HardwarePromote(id) and f.promote==1 and not record(f).completed)
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("reload cannot erase a delayed blocked unknown attempt",not f.q.HardwarePromote(id) and record(f)==r and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture()
  f.emit("ADDON_ACTION_FORBIDDEN","OtherAddon","C_GuildInfo.Promote()")
  f.emit("ADDON_ACTION_BLOCKED","OlympusVerify","C_GuildInfo.SetMOTD()")
  check("unrelated delayed block events do not fabricate a promotion outcome",not f.q.promotionBlocked and f.q.HardwarePromote(id) and record(f).state=="unknown")
end
do
  local f=fixture();f.blockPromote=true
  check("synchronous blocked action is spent before the API returns",not f.q.HardwarePromote(id) and record(f).state=="unknown" and f.promote==1 and f.legacy==0)
  f.emit("GUILD_ROSTER_UPDATE");reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("synchronous block is never retried through the legacy API",not f.q.HardwarePromote(id) and f.promote==1 and f.legacy==0)
end
do
  local f=fixture(true)
  check("client without namespaced Promote uses name-only legacy Promote",f.q.HardwarePromote(id) and f.legacy==1 and f.promote==0 and f.restricted==0 and f.lastName=="Candidate-Forever")
  f=fixture();f.env.C_GuildInfo.Promote=nil;f.env.GuildPromote=nil
  check("missing supported promotion APIs never select restricted assignment",not f.q.HardwarePromote(id) and f.restricted==0 and f.env.OlympusVerifyDB.launchPromotionAttempts[id]==nil)
end
for _,legacy in ipairs({{state="unknown"},{state="unknown",target=6},{state="confirmed"},"malformed"}) do
  local f=fixture();f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=legacy};f.env.ROSTER[2].rankIndex=8
  f.emit("GUILD_ROSTER_UPDATE");reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("existing unknown or malformed custody is not retroactively settled",record(f)==legacy and not f.q.HardwarePromote(id) and f.q.AttemptHeld(id) and f.promote==0)
end
do
  local f=fixture();knight(f);f.q.HardwarePromote(id);f.emit("GUILD_ROSTER_UPDATE")
  check("intermediate confirmation cannot survive reload as continuation authority",record(f).state=="confirmed" and not record(f).completed)
  reload(f);f.emit("GUILD_ROSTER_UPDATE")
  check("reloaded intermediate step remains held without session confirmation",not f.q.HardwarePromote(id) and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture();f.noRankChange=true;f.q.HardwarePromote(id)
  f.env.OlympusVerifyDB.launchPromotionAttempts[id]=nil
  check("loss of durable custody cannot erase the original in-session pending call",not f.q.HardwarePromote(id) and f.q.AttemptHeld(id) and f.promote==1)
end
do
  local f=fixture();local readyId,changedId="Player-1-0000CCCC","Player-1-0000DDDD"
  f.env.ROSTER[3]={name="Ready",rankIndex=9,guid=readyId}
  f.env.ROSTER[4]={name="Changed rank",rankIndex=8,guid=changedId}
  local old={state="unknown",target=8}
  f.env.OlympusVerifyDB.launchPromotionAttempts={[id]=old}
  f.page.promotions[2]={name="Changed rank",guid=changedId,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  f.page.promotions[3]={name="Ready",guid=readyId,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  f.env.C_GuildInfo.Promote=function(name)
    f.promote=f.promote+1;f.lastName=name
    for index,row in ipairs(f.env.ROSTER) do if f.env.GetGuildRosterInfo(index)==name then row.rankIndex=row.rankIndex-1 end end
  end
  check("Promote next skips unknown and changed-rank rows without clearing custody",f.q.NextAction() and f.promote==1 and f.lastName=="Ready-Forever"
    and f.env.ROSTER[3].rankIndex==8 and record(f)==old and f.env.OlympusVerifyDB.launchPromotionAttempts[changedId]==nil)
  check("Promote next never retries held rows after the later single request",not f.q.NextAction() and f.promote==1 and record(f)==old and f.restricted==0)
end
print(string.format("Promotion steps: %d passed, %d failed",passed,failed))
if failed>0 then error("promotion steps failed") end

-- Exercise real logout/export, group selection, result validation and secure button.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local D=assert(loadfile("directive_fixture280.lua"))()
local n=0
local function check(label,ok) assert(ok,label);n=n+1;print("PASS "..label) end
local function client(count,blank)
  local f=fixture()
  local e=f.env
  for i=3,count+1 do
    e.ROSTER[i]={name="Initiate "..i,rankIndex=9,level=11,online=false,guid=string.format("Player-2-%08X",i)}
  end
  local rank=blank and 0 or 1
  e.ROSTER[1].rankIndex=rank
  e.GetGuildInfo=function() return f.guild,f.names[rank+1],rank end
  e.GetRealmName=function() return blank and "" or f.realm end
  local verified={{guid=f.id}}
  e.OlympusVerifyAPI.Roster={
    DisplaySource=function() return {verified={members=verified}} end,
    CurrentScope=function() return f.guild,f.realm,f.actor end
  }
  if blank then
    -- The current-session core witness is captured by the launch module on load.
    e.OlympusLaunch229=nil
    setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
    f.q=e.OlympusLaunch229
  end
  f.content="a"
  e.OlympusVerifyAPI.AutoSyncFacts=function()
    return {strict=true,sweepDigest=string.rep(f.content,64),exportedAt=e.NOW}
  end
  local function prepare()
    local rows={}
    for i,r in ipairs(e.ROSTER) do
      local name,title,slot=e.GetGuildRosterInfo(i)
      rows[i]={guid=r.guid,name=name,rank=title,rankIndex=slot}
    end
    local roster={members=rows,total=#rows,exportedAt=e.NOW,nativeGuild=f.guild,nativeRealm=e.GetRealmName(),
      nativeRankTable=e.OlympusVerifyNativeRanks.Observe(),online=1}
    e.OlympusVerifyDB.roster=roster
    f.q.PrepareInitiateChecks(roster)
    return e.OlympusVerifyDB.primeInitiateChecks
  end
  local function record(control,snapshot,positive)
    local specs={}
    if positive then
      local target=positive==true and f.id or positive
      for _,row in ipairs(e.ROSTER) do
        if row.guid==target then specs[1]={guid=target,name=row.name,start=9,final=7};break end
      end
      assert(specs[1])
    end
    local before=e.OlympusLaunchSelected
    local r=D.publish(e,{control=control,guild=f.guild,realm=f.realm,scopeHash=f.scope,actor=f.actor,
      specs=specs,total=#e.ROSTER,snapshotId=snapshot,snapshotAt=e.NOW,ttl=600})
    e.OlympusLaunchSelected=before
    return r
  end
  f.emit("GUILD_ROSTER_UPDATE")
  return f,e,prepare,record,verified
end
local function reviewedPair()
  local f,e,prepare,record=client(43,true)
  local envelope=prepare()
  local id1,id2=f.id,envelope.controls[2].targetGuids[1]
  e.OlympusInitiateChecks={version=1,id=envelope.id,records={record(envelope.controls[1],101,id1),
    record(envelope.controls[2],101,id2),record(envelope.controls[3],101,false)}}
  local function pick(id)
    for i,row in ipairs(e.ROSTER) do if row.guid==id then return {guid=id,name=e.GetGuildRosterInfo(i)},row end end
  end
  local first,row1=pick(id1);local second,row2=pick(id2)
  check("duplicate and renamed picks cannot open a promotion review",not f.q.ReviewDeskPromotions({first,first})
    and not f.q.ReviewDeskPromotions({{guid=id1,name=second.name}}) and f.promote==0)
  check("reviewing two named Initiates spanning pages does not issue a command",f.q.ReviewDeskPromotions({first,second}) and f.promote==0)
  local sent={}
  e.SECURE_MACRO_EXECUTE=function(text) sent[#sent+1]=text end
  local b=f.q.promotionConfirmButton
  return f,e,first,row1,second,row2,b,sent
end
do
  local f,e,first,row1,second,row2,b,sent=reviewedPair()
  local id1,id2=first.guid,second.guid
  b:Click()
  check("the next reviewed promotion is available while the first rank receipt is outstanding",f.q.pending[id1] and not f.q.pending[id2]
    and #sent==1 and sent[1]=="/gpromote "..first.name and f.q.confirmGuid==id2 and b:IsEnabled())
  b:Click();b:Click()
  check("two hardware releases spend two signed names once without receiving prior results",#sent==2 and sent[2]=="/gpromote "..second.name
    and f.q.pending[id1] and f.q.pending[id2] and not b:IsEnabled() and not b:GetAttribute("type1"))
  row2.rankIndex=8;e.NOW=e.NOW+1;f.emit("GUILD_ROSTER_UPDATE")
  check("the second promotion can be observed before the first without issuing or replaying a click",not f.q.pending[id2] and f.q.pending[id1]
    and #sent==2 and f.q.promotionConfirmInfo:GetText():find("1 awaiting a receipt",1,true))
  row1.rankIndex=8;e.NOW=e.NOW+1;f.emit("GUILD_ROSTER_UPDATE")
  check("every rank receipt belongs to its own GUID and exact next rank",not f.q.pending[id1] and not f.q.pending[id2]
    and #sent==2 and f.q.promotionConfirmInfo:GetText():find("2 rank changes observed",1,true))
end
do
  local f,e,first,row1,second,row2,b,sent=reviewedPair()
  b:Click();b:Click()
  row1.rankIndex,row2.rankIndex=8,8;e.NOW=e.NOW+1;f.emit("GUILD_ROSTER_UPDATE")
  check("one fresh roster confirms two exact named rank increases together",not f.q.pending[first.guid] and not f.q.pending[second.guid]
    and #sent==2 and f.q.promotionConfirmInfo:GetText():find("2 rank changes observed",1,true))
end
do
  local f,e,first,row1,second,row2,b,sent=reviewedPair()
  b:Click();row2.rankIndex=8;b:Click()
  check("a rank changed since review cannot spend the next click or dispatch another selected name",#sent==1 and f.q.pending[first.guid]
    and not f.q.pending[second.guid] and not f.q.promotionConfirm:IsShown())
end
do
  local f,e,first,row1,second,row2,b,sent=reviewedPair()
  b:Click();b:Click();f.q.promotionConfirmCancel:Click()
  f.emit("ADDON_ACTION_BLOCKED","OlympusVerify","C_GuildInfo.Promote()")
  row1.rankIndex,row2.rankIndex=8,8;e.NOW=e.NOW+1;f.emit("GUILD_ROSTER_UPDATE")
  check("late unnamed client refusal after close keeps both attempted rank outcomes unknown",f.q.promotionBlocked and f.q.pending[first.guid]
    and f.q.pending[second.guid] and f.q.pending[first.guid].record.state=="unknown" and f.q.pending[second.guid].record.state=="unknown" and #sent==2)
end
for _,blank in ipairs({false,true}) do
  local f,e,prepare,record=client(43,blank)
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),e)("OlympusVerify")
  local rows={}
  for i=2,#e.ROSTER do
    local member=e.ROSTER[i]
    rows[#rows+1]={name=member.name,guid=member.guid,rank="Initiate",rankIndex=9,status="verified"}
  end
  local function readiness() return e.OlympusVerifyRosterModel.Promotions(rows,f.q,e.NOW) end
  local envelope=prepare()
  local mode=blank and "bound blank realm" or "observed realm"
  check(mode.." automatically prepares all 43 Initiates in three pages",envelope and #envelope.controls==3)
  local seen,macs={},{}
  for i,c in ipairs(envelope.controls) do
    check(mode.." page "..i.." bounded and scope-bound",#c.targetGuids==(i<3 and 20 or 3)
      and c.version==(blank and 5 or 4) and c.confirmations=="[]" and c.guid==f.actor and c.scopeHash==f.scope)
    for j,id in ipairs(c.targetGuids) do assert(not seen[id] and (j==1 or c.targetGuids[j-1]<id));seen[id]=true end
    macs[i]=c.mac
  end
  check(mode.." set signature binds exact ordered pages",
    envelope.mac==e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret,"prime-initiate-sweep|1|"..envelope.id.."|"..table.concat(macs,",")):sub(1,32))
  check(mode.." no forced Sync or promotion",not f.syncs and f.promote==0 and f.restricted==0
    and e.OlympusVerifyDB.launchControl==f.discovery and e.OlympusLaunchSelected==nil)
  check(mode.." unchanged export reuses existing controls",prepare()==envelope)
  local ready,details=readiness()
  check(mode.." verified characters await a loaded result without requeueing or promoting",
    not next(ready) and details.byGuid[f.id].state=="checking" and details.byGuid[f.id].label=="Awaiting Watcher result"
    and details.state=="pending" and not f.syncs and f.promote==0 and e.OlympusVerifyDB.primeInitiateChecks==envelope)
  local first=record(envelope.controls[1],101,true)
  e.OlympusInitiateChecks={version=1,id=envelope.id,records={first}}
  local current=f.q.Current()
  check(mode.." partial read only covers the 20 completed targets",current.backgroundChecks.checked==20 and current.backgroundChecks.pending==23
    and current.freshness[f.id].snapshotId==101 and current.backgroundChecks.total==43 and f.promote==0)
  ready,details=readiness()
  local other=envelope.controls[1].targetGuids[1]
  if other==f.id then other=envelope.controls[1].targetGuids[2] end
  check(mode.." a completed read offers Promote immediately only for the recommended character",
    ready[f.id] and details.byGuid[f.id].state=="ready" and not ready[other]
    and details.byGuid[other].label=="No promotion available" and not f.syncs and f.promote==0)
  local name
  for _,row in ipairs(rows) do if row.guid==other then name=row.name end end
  first.page.held={{guid=other,name=name,reason="unverified-initiate"}}
  local secondPending=record(envelope.controls[2],102,false)
  secondPending.running,secondPending.completed=true,false
  e.OlympusInitiateChecks.records[2]=secondPending
  ready,details=readiness()
  check(mode.." shows the returned verification hold even for a locally Verified display",
    not ready[other] and details.byGuid[other].state=="held" and details.byGuid[other].label=="Verification required")
  check(mode.." distinguishes a loaded running check from one awaiting its first result",
    details.byGuid[envelope.controls[2].targetGuids[1]].label=="Watcher check in progress"
    and details.byGuid[envelope.controls[3].targetGuids[1]].label=="Awaiting Watcher result"
    and details.verifiedAwaitingResult==23 and f.promote==0)
  e.NOW=e.NOW+75
  local second=record(envelope.controls[2],102,false)
  e.OlympusInitiateChecks.records[2]=second
  current=f.q.Current()
  check(mode.." later receipt cannot renew earlier group or expire unread groups at 60s",
    current.backgroundChecks.checked==40 and current.backgroundChecks.pending==3
    and current.freshness[f.id].page==first.page and first.page.snapshotAt<second.page.snapshotAt)
  f.emit("GUILD_ROSTER_UPDATE")
  check(mode.." single fresh positive requires an actual separate officer click",f.promote==0 and f.click(f.id) and f.promote==1)
  check(mode.." previous positive or repeated click cannot send a second rank command",not f.click(f.id) and f.promote==1)
  e.NOW=e.NOW+526
  local stillRunning=record(envelope.controls[3],103,false)
  stillRunning.running,stillRunning.completed=true,false
  e.OlympusInitiateChecks.records[3]=stillRunning
  current=f.q.Current()
  check(mode.." initial signed deadline holds incomplete and complete pages",current.backgroundChecks.held==43 and current.backgroundChecks.checked==0)
  ready,details=readiness()
  check(mode.." expired negative results no longer describe current eligibility",
    not next(ready) and details.byGuid[other].state=="expired" and details.byGuid[other].label=="Eligibility check expired")
end
do
  local f,e,prepare=client(201,true)
  local hints={}
  local priority={}
  for _,i in ipairs({39,83,117,149,189}) do
    local guid=e.ROSTER[i].guid
    hints[#hints+1]={guid=guid}
    priority[guid]=true
  end
  e.OlympusVerifyAPI.Roster.DisplaySource=function() return nil,"stale",true,hints end
  local envelope=prepare()
  local prioritized=0
  for _,guid in ipairs(envelope.controls[1].targetGuids) do if priority[guid] then prioritized=prioritized+1 end end
  local current=f.q.Current()
  check("five dated links across 201 native Initiates all reach the first signed page",
    #envelope.controls==11 and prioritized==5 and current.backgroundChecks.total==201)
  check("dated hints alone leave every row awaiting the Worker",current.backgroundChecks.checked==0
    and #current.promotions==0 and not f.click(hints[1].guid) and f.promote==0)
end
do
  local f,e,prepare,record,verified=client(41,false)
  local a=prepare()
  check("unchanged first results-loading reload keeps its original control",prepare()==a)
  e.OlympusInitiateChecks={version=1,id=a.id,records={record(a.controls[1],77,true)}}
  f.content="b"
  local b=prepare()
  check("first changed export immediately replaces partial controls",b.id~=a.id)
  local current=f.q.Current()
  check("new sweep does not take a positive from earlier cycle",current.backgroundChecks.total==41 and current.backgroundChecks.checked==0
    and not f.click(f.id) and f.promote==0)
  e.OlympusInitiateChecks={version=1,id=b.id,records={record(b.controls[1],78,false)}}
  verified[#verified+1]={guid=e.ROSTER[3].guid}
  check("new verification rotates even if its GUID stays on same page",prepare().id~=b.id)
end
for _,blank in ipairs({false,true}) do
  local f,e,prepare,record=client(43,blank)
  local cycle=prepare()
  local pages,first=cycle.controls,record(cycle.controls[1],101,true)
  local secondGuid=pages[2].targetGuids[1]
  local later=record(pages[2],101,secondGuid)
  local waiting=record(pages[3],101,false)
  waiting.page,waiting.coveredGuids,waiting.completed,waiting.running=nil,{},false,true
  e.OlympusInitiateChecks={version=1,id=cycle.id,records={first,later,waiting}}
  -- This session loaded only one result. The Watcher completes the rest on
  -- disk while WoW is running. Lua won't see those bytes until the next load.
  later.page,later.coveredGuids,later.completed,later.running=nil,{},false,true
  e.NOW=e.NOW+30
  check("displayed first page plus pending records does not spend the unchanged-source handoff",
    prepare()==cycle and e.OlympusVerifyDB.primeInitiateInputs.awaitingLoad
      and f.q.Current().backgroundChecks.checked==20 and not f.click(secondGuid))
  e.NOW=e.NOW+30
  check("one normal import reload preserves the signed set while the native content is unchanged",
    prepare()==cycle and e.OlympusVerifyDB.primeInitiateInputs.awaitingLoad)
  e.OlympusInitiateChecks.records[2]=record(pages[2],101,secondGuid)
  e.OlympusInitiateChecks.records[3]=record(pages[3],101,false)
  local full=f.q.Current()
  check("one import sees all 43 results and the second-page positive on its own original dated control",
    full.backgroundChecks.checked==43 and full.backgroundChecks.pending==0 and full.freshness[secondGuid].controlId==pages[2].id
      and full.freshness[secondGuid].page==e.OlympusInitiateChecks.records[2].page and full.freshness[secondGuid].expiresAt==cycle.controls[1].observedAt+600
      and f.promote==0 and not f.syncs)
  f.content="b"
  check("subsequent changed-source export rotates without borrowing the previous positive",
    prepare().id~=cycle.id and f.q.Current().backgroundChecks.checked==0 and not f.click(secondGuid) and f.promote==0)
end
do
  local f,e,prepare,record,verified=client(41,false)
  local cycle=prepare()
  e.OlympusInitiateChecks={version=1,id=cycle.id,records={record(cycle.controls[1],88,true)}}
  f.content="b"
  verified[#verified+1]={guid=e.ROSTER[3].guid}
  check("even a first handoff refuses changed verified targets in an otherwise unchanged partition",prepare().id~=cycle.id)
  cycle=e.OlympusVerifyDB.primeInitiateChecks
  e.OlympusVerifyAPI.AutoSyncFacts=function() return nil end
  check("unknown native content cannot authorize the one-time handoff",prepare().id~=cycle.id)
end
do
  local f,e,prepare,record=client(21,false)
  local q=prepare()
  local held=record(q.controls[2],45,false)
  held.page,held.coveredGuids,held.completed,held.running,held.stoppedReason=nil,{},false,false,"source-refused"
  e.OlympusInitiateChecks={version=1,id=q.id,records={record(q.controls[1],45,true),held}}
  check("a terminal source refusal has no action authority",f.q.Current().backgroundChecks.held==1)
  f.content="b"
  check("all terminal outcomes rotate on a changed source without an extra import",prepare().id~=q.id)
end
for _,changed in ipairs({false,true}) do
  local f,e,prepare,record=client(999,false)
  local cycle=prepare()
  local first=record(cycle.controls[1],92,true)
  e.OlympusInitiateChecks={version=1,id=cycle.id,records={first}}
  e.NOW=e.NOW+350
  if changed then
    f.content="b"
    check("50-page changed native content rotates immediately at 350s",prepare().id~=cycle.id and f.q.Current().backgroundChecks.checked==0)
  else
    check("a fresh 50-page cycle can use one import at age 350s",prepare()==cycle and not e.OlympusVerifyDB.primeInitiateInputs.awaitingLoad)
    check("late import preserves its first page's expiry and pending groups",f.q.Current().backgroundChecks.checked==20
      and f.q.Current().backgroundChecks.pending==979 and first.page.expiresAt==cycle.controls[1].observedAt+600)
    check("350s reuse cannot become a recurring extension",prepare().id~=cycle.id)
  end
end
for _,age in ipairs({301,600}) do
  local f,e,prepare,record=client(21,false)
  local cycle=prepare()
  local records={record(cycle.controls[1],67,true)}
  if age==301 then records[2]=record(cycle.controls[2],67,false) end
  e.OlympusInitiateChecks={version=1,id=cycle.id,records=records}
  e.NOW=e.NOW+age
  if age==600 then
    check("at the original 600-second deadline every covered row is held",f.q.Current().backgroundChecks.held==21 and not f.click(f.id))
  end
  check("routine refresh rotates at 301s and an unspent import cannot cross 600s",prepare().id~=cycle.id)
end
do
  local f,e,prepare,record=client(42,false)
  e.ROSTER[#e.ROSTER].guid=nil
  local init=prepare()
  check("named-realm collection records missing GUIDs and preserves known local targets",init and e.OlympusVerifyDB.primeInitiateMissingGuids==1
    and #init.controls==3 and #init.controls[3].targetGuids==1)
  local data=record(init.controls[1],20,true)
  e.OlympusInitiateChecks={version=1,id=init.id,records={data}}
  init.mac=string.rep("0",32)
  check("changed envelope cannot enable old positives",not f.q.Current().backgroundChecks and not f.click(f.id))
  e.ROSTER[3].guid=f.id
  check("duplicate GUIDs invalidate coverage",prepare()==nil)
  e.ROSTER={e.ROSTER[1]}
  check("empty native pool clears previous cycle",prepare()==nil and not f.q.Current().backgroundChecks)
end
do
  local f,e=client(999,false)
  local function load(name) setfenv(assert(loadfile("../OlympusVerify/"..name)),e)("OlympusVerify") end
  e.PLAYER_GUID=f.actor
  e.UnitName=function() return "Officer" end
  e.OlympusVerifyDB={}
  load("OlympusVerify.lua")
  load("OlympusVerifyLaunch229.lua")
  local core=e.OlympusVerifyFrame
  local event=core:GetScript("OnEvent")
  event(core,"ADDON_LOADED","OlympusVerify")
  event(core,"GUILD_ROSTER_UPDATE")
  check("a native roster event never signs or dispatches 50 background checks on a timer",e.OlympusVerifyDB.primeInitiateChecks==nil and not f.syncs and f.promote==0)
  event(core,"PLAYER_LOGOUT")
  local set=e.OlympusVerifyDB.primeInitiateChecks
  check("real core logout exports the complete 1000-player roster and signs 999 Initiates",set and #set.controls==50 and #set.controls[50].targetGuids==19
    and e.OlympusVerifyDB.roster.total==1000 and not f.syncs and f.promote==0)
  local sweep=e.OlympusLaunch229.Current().backgroundChecks
  check("a 50-group request without replies is fully visible as pending",sweep.total==999 and sweep.pending==999 and sweep.checked==0)
  -- This non-Initiate changes rank on the last row; the other 998 requests
  -- retain the exact same GUIDs, partitions and order across both exports.
  e.ROSTER[1000].rankIndex=7
  event(core,"PLAYER_LOGOUT")
  local partial=e.OlympusVerifyDB.primeInitiateChecks
  check("complete source records its native digest independent of the signed targets",
    partial and type(e.OlympusVerifyDB.primeInitiateInputs.native)=="string" and #partial.controls==50)
  e.NOW=e.NOW+1
  event(core,"PLAYER_LOGOUT")
  check("fresh timestamp alone preserves the partially loaded 1000-row request",e.OlympusVerifyDB.primeInitiateChecks==partial)
  e.ROSTER[1000].rankIndex=6
  event(core,"PLAYER_LOGOUT")
  local rotated=e.OlympusVerifyDB.primeInitiateChecks
  check("native Alt to Veteran in place rotates the incomplete sweep on that first export",
    rotated and rotated.id~=partial.id and rotated.mac~=partial.mac
      and table.concat(rotated.controls[50].targetGuids,",")==table.concat(partial.controls[50].targetGuids,",")
      and f.promote==0 and not f.syncs)
end
local function notifications(blank)
  local f,e,prepare,record=client(23,blank)
  local api=e.OlympusVerifyAPI
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")),e)("OlympusVerify")
  api.Roster.IsEnrolledPrimeGM=e.OlympusVerifyAPI.Roster.IsEnrolledPrimeGM
  e.OlympusVerifyAPI=api
  local hash=e.OlympusHmac.sha256hex
  local enrolled="prime-guild-master|1|"..f.actor
  e.OlympusHmac.sha256hex=function(data)
    if data==enrolled then return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16" end
    return hash(data)
  end
  e.ROSTER[1].name,e.ROSTER[1].rankIndex="Fern Melder",0
  e.GetGuildInfo=function() return f.guild,f.names[e.ROSTER[1].rankIndex+1],e.ROSTER[1].rankIndex end
  f.realm="CAMWOW US2 Realm 3 PvE";f.scope=D.scope(e,f.guild,f.realm)
  api.Name={Mine=function() return e.ROSTER[1].name end}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify");f.q=e.OlympusLaunch229
  f.emit("GUILD_ROSTER_UPDATE")
  local calls={}
  e.OlympusVerifyAutoSync={ShowReadyNotice=function(count,expiry) calls[#calls+1]={count,expiry} end}
  local cycle=prepare()
  local second=cycle.controls[2].targetGuids[1]
  local function publish(first,later)
    e.NOW=e.NOW+1;f.emit("GUILD_ROSTER_UPDATE")
    e.OlympusInitiateChecks={version=1,id=cycle.id,records={record(cycle.controls[1],92,first),record(cycle.controls[2],92,later)}}
    local names={}
    for _,member in ipairs(e.ROSTER) do names[member.guid]=member.name end
    for _,result in ipairs(e.OlympusInitiateChecks.records) do
      local promotion=result.page.promotions[1]
      for _,guid in ipairs(result.coveredGuids) do
        if not promotion or promotion.guid~=guid then
          table.insert(result.page.held,{guid=guid,name=names[guid],reason="unverified-initiate"})
        end
      end
    end
  end
  local function poll(safe) f.q.PollInitiateAlerts(function() return safe~=false end) end
  return f,e,cycle,second,publish,poll,calls
end
do
  local f,e,cycle,_,publish,poll=notifications(false)
  local q=f.q
  local opens=0;e.OlympusVerifyRoster={ShowReadyInitiates=function() opens=opens+1 end}
  check("enrolled observed-realm Fern can request one review",q.ArmReadyReview())
  q.OpenRequestedReview(function() return true end)
  check("requesting a post-import review cannot open or promote before reload",opens==0 and f.promote==0)
  local function reload()
    setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
    f.q=e.OlympusLaunch229;f.emit("GUILD_ROSTER_UPDATE")
  end
  reload()
  local guid=e.UnitGUID;e.UnitGUID=function() return nil end;f.q.OpenRequestedReview(function() return true end);e.UnitGUID=guid
  check("a temporarily unreadable player during login preserves the one-shot review",opens==0 and e.OlympusVerifyDB.primeReadyReview)
  f.q.OpenRequestedReview(function() return false end)
  check("post-import list waits for a safe client",opens==0 and e.OlympusVerifyDB.primeReadyReview)
  f.q.OpenRequestedReview(function() return true end);f.q.OpenRequestedReview(function() return true end)
  check("one requested reload opens the actual review path exactly once even with no new toast or candidate",opens==1 and not e.OlympusVerifyDB.primeReadyReview and f.promote==0 and not f.syncs)
  f.realm="Other Realm";check("another realm cannot arm a review",not f.q.ArmReadyReview())
  f.realm="CAMWOW US2 Realm 3 PvE";e.UnitGUID=function() return "Player-1-00ABCDEF" end
  check("a same-name other GUID on the official realm cannot arm a review",not f.q.ArmReadyReview())
  e.UnitGUID=function() return f.actor end;e.ROSTER[1].rankIndex=1
  check("an enrolled former GM cannot arm a review",not f.q.ArmReadyReview())
end
for _,bad in ipairs({"ok","stale","wrong-scope","extra-field","bad-id","unknown","native-nonempty"}) do
  local f,e,cycle,_,publish,poll,calls=notifications(true)
  local db=e.OlympusVerifyDB
  local previous=e.ROSTER;e.ROSTER={previous[1]}
  if bad=="native-nonempty" then e.ROSTER[2]=previous[2] end
  db.primeInitiateChecks=nil
  e.OlympusInitiateChecks={version=1,kind="no-native-initiates",scopeHash=f.scope,snapshotId=77,snapshotAt=e.NOW,records={}}
  if bad=="stale" then e.OlympusInitiateChecks.snapshotAt=e.NOW-600
  elseif bad=="wrong-scope" then e.OlympusInitiateChecks.scopeHash=string.rep("0",16)
  elseif bad=="extra-field" then e.OlympusInitiateChecks.another=true
  elseif bad=="bad-id" then e.OlympusInitiateChecks.snapshotId=0
  elseif bad=="unknown" then e.OlympusInitiateChecks=nil end
  local reads=0
  local native=e.GetGuildRosterInfo
  e.GetGuildRosterInfo=function(...) reads=reads+1;return native(...) end
  f.emit("GUILD_ROSTER_UPDATE");poll()
  check("only fresh corroborated zero sets an empty baseline: "..bad,(db.primeInitiateNotices and db.primeInitiateNotices.baseline==true or false)==(bad=="ok") and #calls==0)
  if bad=="native-nonempty" then
    local first=reads
    for i=1,5 do e.NOW=e.NOW+5;f.emit("GUILD_ROSTER_UPDATE");poll() end
    check("a contradictory zero cannot read the native roster on every timer or roster update",first>0 and reads==first)
    e.NOW=e.NOW+5;e.ROSTER={previous[1]};f.emit("GUILD_ROSTER_UPDATE");poll()
    check("a genuinely empty roster after the retry delay can corroborate the original zero",reads>first and db.primeInitiateNotices.baseline and #calls==0)
  elseif bad=="ok" then
    local empty=e.OlympusInitiateChecks
    e.ROSTER=previous;db.primeInitiateChecks=cycle;publish(true,false);poll()
    check("first ready member after true zero alerts without a whisper",#calls==1)
    e.ROSTER={previous[1]};db.primeInitiateChecks=nil;e.OlympusInitiateChecks=empty;f.emit("GUILD_ROSTER_UPDATE");poll()
    check("old zero cannot clear a newer dated positive",db.primeInitiateNotices.seen[f.id]>0)
    e.NOW=e.NOW+1;e.OlympusInitiateChecks={version=1,kind="no-native-initiates",scopeHash=f.scope,snapshotId=78,snapshotAt=e.NOW,records={}};poll()
    e.ROSTER=previous;db.primeInitiateChecks=cycle;publish(true,false);poll()
    check("same GUID returning after a true native empty result can alert again",#calls==2)
  end
end
for _,blank in ipairs({false,true}) do
  local f,e,cycle,second,publish,poll,calls=notifications(blank)
  publish(true,false);poll()
  check("first complete eligibility baseline leaves existing ready members quiet",#calls==0 and e.OlympusVerifyDB.primeInitiateNotices.baseline)
  publish(true,second);poll(false)
  check("new readiness waits until safe",#calls==0)
  poll()
  check("new later-page eligible native Initiate is announced without whisper or reload",#calls==1 and calls[1][1]==1 and calls[1][2]==cycle.controls[2].observedAt+600
    and e.PRINTS[#e.PRINTS]:find("/olv ready",1,true) and not f.syncs and f.promote==0)
  poll();publish(true,second);poll()
  check("same eligibility from another page read never repeats a notice",#calls==1)
  publish(true,false);local page=e.OlympusInitiateChecks.records[2]
  page.completed,page.running,page.page,page.coveredGuids=false,true,nil,{}
  poll();publish(true,second);poll()
  check("partial or pending coverage cannot re-arm an old positive",#calls==1)
  publish(true,false);poll();publish(true,second);poll()
  check("explicit later negative followed by positive alerts once for this new opportunity",#calls==2 and f.promote==0)
end
do
  local f,e,cycle,_,publish,poll,calls=notifications(true)
  local proof={member=true,observedAt=e.NOW,scopeHash=f.scope}
  check("an observed whisper matches only its current native Initiate",not f.q.IsInitiateWhisper("Other character",f.id,proof)
    and f.q.IsInitiateWhisper("Candidate",f.id,proof) and #calls==0)
  e.OlympusInitiateChecks={version=1,id=cycle.id,records={}}
  local native=e.GetGuildRosterInfo
  local reads=0;e.GetGuildRosterInfo=function(...) reads=reads+1;return native(...) end
  for i=1,20 do poll() end
  check("pending whisper and missing results do not alert or repeatedly read the native roster",reads==0 and #calls==0 and not f.syncs)
  publish(true,false);poll()
  check("a genuine locally observed candidate can alert on the first accepted positive",#calls==1 and f.promote==0)
  local before=reads;for i=1,20 do poll() end
  check("steady result file incurs no repeated native scan",reads==before)
end
do
  local f,e,_,_,publish,poll,calls=notifications(false)
  publish(true,false)
  local old=e.OlympusInitiateChecks
  e.NOW=e.NOW+2
  check("a new local whisper can be retained before an old result is loaded",f.q.IsInitiateWhisper("Candidate",f.id,{member=true,scopeHash=f.scope,observedAt=e.NOW}))
  poll()
  check("a still-unexpired positive fetched before the whisper cannot consume or announce it",#calls==0 and e.OlympusVerifyDB.primeInitiateNotices.whispers[f.id]==e.NOW)
  publish(true,false);poll()
  check("a later checked positive can announce the pending character",#calls==1)
  publish(false,false);poll()
  e.OlympusInitiateChecks=old;poll()
  check("restoring an older positive cannot reverse a later recorded negative",#calls==1)
  publish(true,false);poll()
  check("an actually newer positive remains observable",#calls==2)
end
do
  local f,e,_,_,publish,poll,calls=notifications(true)
  local function held(reason)
    publish(false,false)
    e.OlympusInitiateChecks.records[1].page.held={{guid=f.id,name="Candidate",reason=reason}}
    return e.OlympusInitiateChecks
  end
  publish(true,false);poll()
  local negative=held("unverified-initiate");poll()
  publish(true,false);poll()
  check("the Worker's explicit unverified-initiate hold rearms once on later verification",#calls==1)
  for _,reason in ipairs({"pending-verification","verification-unknown","selected-rank-changed"}) do
    held(reason);poll();publish(true,false);poll()
    check(reason.." retains previous eligibility history without a repeated alert",#calls==1)
  end
  held("unverified-initiate").records[1].page.held[1].name="A different Initiate";poll()
  publish(true,false);poll()
  check("unverified data for a different native name cannot rearm the covered GUID",#calls==1)
  held("unverified-initiate").records[1].page.held={};poll()
  publish(true,false);poll()
  check("covered GUID without an explicit result preserves previous readiness",#calls==1)
  e.OlympusInitiateChecks=negative;poll();publish(true,false);poll()
  check("replaying the old explicit unverified hold cannot rearm a newer positive",#calls==1)
end
for _,gate in ipairs({"officer","permission","permission-target","rank","custody","tampered","expired"}) do
  local f,e,cycle,_,publish,poll,calls=notifications(false)
  publish(false,false);poll();publish(true,false)
  if gate=="officer" then e.ROSTER[1].name="Another Officer"
  elseif gate=="permission" then e.CanGuildPromote=function() return false end
  elseif gate=="permission-target" then e.C_GuildInfo.IsGuildRankAssignmentAllowed=function() return false end
  elseif gate=="rank" then e.ROSTER[2].rankIndex=8
  elseif gate=="custody" then f.q.pending[f.id]={}
  elseif gate=="tampered" then e.OlympusInitiateChecks.records[1].targetsDigest=string.rep("0",64)
  elseif gate=="expired" then e.NOW=e.NOW+600;f.emit("GUILD_ROSTER_UPDATE") end
  poll();check(gate.." hold prevents a private ready alert or native effect",#calls==0 and not f.syncs and f.promote==0)
end
print(n.." passed, 0 failed")

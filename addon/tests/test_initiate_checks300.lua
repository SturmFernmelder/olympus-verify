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
    return {strict=true,digest=string.rep(f.content,64),exportedAt=e.NOW}
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
    local specs=positive and {{guid=f.id,name="Candidate",start=9,final=7}} or {}
    local before=e.OlympusLaunchSelected
    local r=D.publish(e,{control=control,guild=f.guild,realm=f.realm,scopeHash=f.scope,actor=f.actor,
      specs=specs,total=#e.ROSTER,snapshotId=snapshot,snapshotAt=e.NOW,ttl=600})
    e.OlympusLaunchSelected=before
    return r
  end
  f.emit("GUILD_ROSTER_UPDATE")
  return f,e,prepare,record,verified
end
for _,blank in ipairs({false,true}) do
  local f,e,prepare,record=client(43,blank)
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
  local first=record(envelope.controls[1],101,true)
  e.OlympusInitiateChecks={version=1,id=envelope.id,records={first}}
  local current=f.q.Current()
  check(mode.." partial read only covers the 20 completed targets",current.backgroundChecks.checked==20 and current.backgroundChecks.pending==23
    and current.freshness[f.id].snapshotId==101 and current.backgroundChecks.total==43 and f.promote==0)
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
end
do
  local f,e,prepare,record,verified=client(41,false)
  local a=prepare()
  f.content="b"
  check("first results-loading reload keeps its original control on an unrelated source change",prepare()==a)
  e.OlympusInitiateChecks={version=1,id=a.id,records={record(a.controls[1],77,true)}}
  local b=prepare()
  check("new export rotates after loading a partial result and changed native content",b.id~=a.id)
  local current=f.q.Current()
  check("new sweep does not take a positive from earlier cycle",current.backgroundChecks.total==41 and current.backgroundChecks.checked==0
    and not f.click(f.id) and f.promote==0)
  e.OlympusInitiateChecks={version=1,id=b.id,records={record(b.controls[1],78,false)}}
  verified[#verified+1]={guid=e.ROSTER[3].guid}
  check("new verification rotates even if its GUID stays on same page",prepare().id~=b.id)
end
do
  local f,e,prepare,record=client(42,false)
  e.ROSTER[#e.ROSTER].guid=nil
  local init=prepare()
  check("observed-realm rows missing a GUID cannot starve other target checks",init and e.OlympusVerifyDB.primeInitiateMissingGuids==1
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
end
print(n.." passed, 0 failed")

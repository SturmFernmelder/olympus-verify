-- Real batch admission, loaded-result validator and hardware dispatcher; synthetic native APIs only.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
local passed,failed=0,0
local function check(name,yes) if yes then passed=passed+1;print("PASS "..name) else failed=failed+1;print("FAIL "..name) end end
local function copy(value) if type(value)~="table" then return value end local result={};for k,v in pairs(value) do result[k]=copy(v) end;return result end
local candidate="Player-1-0000BBBB"
local function cohort()
  local f=fixture();local e=f.env;local ids={candidate}
  for i=1,16 do
    local id=string.format("Player-1-%08X",i);ids[#ids+1]=id
    e.ROSTER[#e.ROSTER+1]={name="Initiate "..i,rank="Initiate",rankIndex=9,level=20,online=false,guid=id}
  end
  for i=#e.ROSTER+1,1000 do e.ROSTER[i]={name="Other "..i,rank="Member",rankIndex=8,level=20,online=false,guid=string.format("Player-2-%08X",i)} end
  f.emit("GUILD_ROSTER_UPDATE")
  return f,ids
end
local function result(f,ids)
  check("explicit cohort control is admitted from the complete native roster",f.q.SelectMany(ids))
  local e,c=f.env,f.env.OlympusVerifyDB.launchControl
  local encoded={};for i,id in ipairs(c.targetGuids) do encoded[i]='"'..id..'"' end
  local page=copy(f.page)
  page.snapshotId,page.snapshotAt,page.fetchedAt,page.expiresAt=18,e.NOW,e.NOW,e.NOW+600
  page.scan={id=string.rep("d",32),startedAt=c.observedAt,expiresAt=c.observedAt+600}
  page.memberCount=1000;page.status="partial"
  page.entitlements={offset=0,pageSize=20,scanned=#ids,total=1000,unscanned=1000-#ids}
  page.promotions={};page.held={};page.invites={};page.riskBuffer={}
  for _,id in ipairs(c.targetGuids) do
    local name;for _,row in ipairs(e.ROSTER) do if row.guid==id then name=row.name end end
    page.promotions[#page.promotions+1]={guid=id,name=name,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  end
  local data={version=1,protocol="promotion-selection-v276",coverageKind="selected-guids",controlId=c.id,
    actorGuid=c.guid,targetGuids=copy(c.targetGuids),targetsDigest=e.OlympusHmac.sha256hex("["..table.concat(encoded,",").."]"),
    scopeHash=c.scopeHash,observedAt=c.observedAt,snapshotId=18,snapshotAt=e.NOW,startedAt=c.observedAt,
    expiresAt=c.observedAt+600,running=false,completed=true,attempts=1,coveredGuids=copy(c.targetGuids),page=page}
  e.OlympusLaunchSelected=data
  return data,c
end
do
  local f,ids=cohort();local data,c=result(f,ids)
  local message=table.concat({"launch-selected-read","3","select-many",c.id,tostring(c.observedAt),c.scopeHash,c.guid,table.concat(c.targetGuids,",")},"|")
  check("control signs a sorted exact GUID set in a separate v3 domain",c.version==3 and c.action=="select-many" and #c.targetGuids==17 and c.targetGuids[1]<c.targetGuids[17] and c.mac==f.env.OlympusHmac.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
  local current=f.q.Current()
  check("all seventeen scattered GUIDs get their own fresh selected authority",current and current.selection.completed and #current.promotions==17 and current.freshness[candidate].kind=="selected" and current.freshness[candidate].expiresAt==data.expiresAt)
  check("batch read controls have no promotion side effects",f.promote==0 and f.legacy==0 and f.restricted==0 and f.syncs==1)
  local requested=f.click(candidate)
  local ordinary=requested and f.promote==1 and f.lastName==f.env.GetGuildRosterInfo(2) and f.env.ROSTER[2].rankIndex==8 and f.restricted==0
  if not ordinary then print("DIAG Member request",tostring(requested),f.promote,tostring(f.lastName),f.env.ROSTER[2].rankIndex,f.restricted) end
  check("ordinary verified Initiate uses one supported separate promotion click",ordinary)
  f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed native Member cannot be promoted again by the same batch",not f.click(candidate) and f.promote==1)
end
do
  local f,ids=cohort();result(f,ids);f.env.OlympusLaunchSelected=nil
  local current=f.q.Current();local covered=0;for _ in pairs(current.selection.covered) do covered=covered+1 end
  check("pending batch holds every requested GUID rather than only the first",covered==17 and current.selection.state=="pending" and not f.click(candidate) and f.promote==0)
end
for _,kind in ipairs({"digest","extra-target","missing-target","duplicate","unsorted","coverage","actor","scope","clock","metadata","automatic","outside-positive","unknown-result","mixed-single","invites","risk"}) do
  local f,ids=cohort();local data,c=result(f,ids)
  if kind=="digest" then data.targetsDigest=string.rep("0",64)
  elseif kind=="extra-target" then data.targetGuids[18]="Player-1-0000CCCC"
  elseif kind=="missing-target" then table.remove(data.targetGuids)
  elseif kind=="duplicate" then data.coveredGuids[2]=data.coveredGuids[1]
  elseif kind=="unsorted" then data.targetGuids[1],data.targetGuids[2]=data.targetGuids[2],data.targetGuids[1]
  elseif kind=="coverage" then data.coverageKind="native-page"
  elseif kind=="actor" then data.actorGuid=candidate
  elseif kind=="scope" then data.scopeHash=string.rep("f",16)
  elseif kind=="clock" then data.expiresAt=data.expiresAt+1
  elseif kind=="metadata" then data.page.entitlements.scanned=20
  elseif kind=="automatic" then data.page.actions.automatic=true
  elseif kind=="outside-positive" then data.page.promotions[1].guid="Player-1-0000CCCC"
  elseif kind=="unknown-result" then data.completed=false;data.running=false;data.stoppedReason="source-unknown"
  elseif kind=="mixed-single" then data.targetGuid=candidate
  elseif kind=="invites" then data.page.invites={{guid=candidate}}
  elseif kind=="risk" then data.page.riskBuffer={{guid=candidate}} end
  check(kind.." batch cannot borrow a historical positive or dispatch",not f.click(candidate) and f.promote==0 and f.restricted==0)
end
for _,kind in ipairs({"duplicate","too-many","missing","not-initiate","self","native-stale"}) do
  local f,ids=cohort()
  if kind=="duplicate" then ids[2]=ids[1]
  elseif kind=="too-many" then for i=18,21 do ids[i]=f.env.ROSTER[i+1].guid end
  elseif kind=="missing" then ids[1]="Player-1-FFFFFFFF"
  elseif kind=="not-initiate" then f.env.ROSTER[2].rankIndex=8
  elseif kind=="self" then ids[1]=f.env.ROSTER[1].guid
  elseif kind=="native-stale" then f.env.NOW=f.env.NOW+16 end
  check(kind.." cannot create or export a partial batch control",not f.q.SelectMany(ids) and f.env.OlympusVerifyDB.launchControl==nil and not f.syncs)
end
do
  local f,ids=cohort();local data,c=result(f,ids)
  local original={scopeHash=c.scopeHash,actorGuid=c.guid,targetGuid=candidate,target=8,snapshotId=7,contextId=string.rep("e",32),attemptedAt=f.env.NOW-30,state="unknown"}
  f.env.OlympusVerifyDB.launchPromotionAttempts={[candidate]=original}
  check("fresh batch never clears or retries a pre-existing unknown attempt",not f.click(candidate) and f.env.OlympusVerifyDB.launchPromotionAttempts[candidate]==original and f.promote==0)
  f.env.NOW=f.env.NOW+601;f.emit("GUILD_ROSTER_UPDATE")
  check("batch original clocks expire without extending source or action authority",not f.click(ids[2]) and data.expiresAt==c.observedAt+600 and f.promote==0)
end
print(string.format("%d passed, %d failed",passed,failed));if failed>0 then os.exit(1) end

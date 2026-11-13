-- Real batch admission, loaded-result validator and hardware dispatcher; synthetic native APIs only.
LAUNCH_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_launch_operations229.lua"))()
LAUNCH_FIXTURE_ONLY=nil
-- v234 (Stage 2 addon280, 13 Nov 2026): SelectMany writes a signed v4
-- select-directive control and the result is promotion-selection-directive-v1
-- with one sealed intent per GUID; Member is native slot 7 (Initiate 9 > Alt 8 > Member 7).
local D=assert(loadfile("directive_fixture280.lua"))()
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
  for i=#e.ROSTER+1,1000 do e.ROSTER[i]={name="Other "..i,rank="Member",rankIndex=7,level=20,online=false,guid=string.format("Player-2-%08X",i)} end
  f.emit("GUILD_ROSTER_UPDATE")
  return f,ids
end
local function result(f,ids)
  check("explicit cohort control is admitted from the complete native roster",f.q.SelectMany(ids))
  local e,c=f.env,f.env.OlympusVerifyDB.launchControl
  local specs={}
  for _,id in ipairs(c.targetGuids) do
    local name;for _,row in ipairs(e.ROSTER) do if row.guid==id then name=row.name end end
    specs[#specs+1]={guid=id,name=name,start=9,final=7}
  end
  local data=D.publish(e,{guild=f.guild,realm=f.realm,control=c,specs=specs,snapshotId=18,snapshotAt=e.NOW,ttl=600,total=1000,context=string.rep("d",32)})
  return data,c
end
do
  local f,ids=cohort();local data,c=result(f,ids)
  local message=table.concat({"launch-selected-read","4","select-directive",c.id,tostring(c.observedAt),c.scopeHash,c.guid,table.concat(c.targetGuids,","),c.confirmations},"|")
  check("control signs a sorted exact GUID set in the v4 select-directive domain",c.version==4 and c.action=="select-directive" and c.confirmations=="[]" and #c.targetGuids==17 and c.targetGuids[1]<c.targetGuids[17] and c.mac==f.env.OlympusHmac.hmacSha256hex(f.env.OlympusVerifyConfig.secret,message):sub(1,32))
  local current=f.q.Current()
  check("all seventeen scattered GUIDs get their own fresh selected authority",current and current.selection.completed and #current.promotions==17 and current.freshness[candidate].kind=="selected" and current.freshness[candidate].expiresAt==data.expiresAt)
  check("batch read controls have no promotion side effects",f.promote==0 and f.legacy==0 and f.restricted==0 and f.syncs==1)
  local requested=f.click(candidate)
  local ordinary=requested and f.promote==1 and f.lastName==f.env.GetGuildRosterInfo(2) and f.env.ROSTER[2].rankIndex==8 and f.restricted==0
  if not ordinary then print("DIAG Member request",tostring(requested),f.promote,tostring(f.lastName),f.env.ROSTER[2].rankIndex,f.restricted) end
  check("ordinary verified Initiate uses one supported separate promotion click",ordinary)
  f.emit("GUILD_ROSTER_UPDATE")
  check("confirmed Alt step cannot be promoted again by the same batch",not f.click(candidate) and f.promote==1)
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
  -- The v234 fixture loads its signed discovery control first; it must stay the only control.
  check(kind.." cannot create or export a partial batch control",not f.q.SelectMany(ids) and f.env.OlympusVerifyDB.launchControl==f.discovery and not f.syncs)
end
do
  -- The prior unknown is saved before this session reads the ledger. The v234
  -- SelectMany refuses a batch over it, so the batch result below is signed as
  -- SelectMany would for these GUIDs (the result a reload of an older request returns).
  local f,ids=cohort()
  local original={scopeHash=f.scope,actorGuid=f.actor,targetGuid=candidate,target=8,snapshotId=7,contextId=string.rep("e",32),attemptedAt=f.env.NOW-30,state="unknown"}
  f.env.OlympusVerifyDB.launchPromotionAttempts={[candidate]=original}
  check("a batch check refuses a target with prior attempt history",not f.q.SelectMany(ids) and f.env.OlympusVerifyDB.launchControl==f.discovery and not f.syncs)
  local specs={};for _,id in ipairs(ids) do local name;for _,row in ipairs(f.env.ROSTER) do if row.guid==id then name=row.name end end;specs[#specs+1]={guid=id,name=name,start=9,final=7} end
  local data,_,c=D.publish(f.env,{guild=f.guild,realm=f.realm,actor=f.actor,scopeHash=f.scope,specs=specs,snapshotId=18,snapshotAt=f.env.NOW,ttl=600,total=1000,context=string.rep("d",32)})
  check("fresh batch never clears or retries a pre-existing unknown attempt",not f.click(candidate) and f.env.OlympusVerifyDB.launchPromotionAttempts[candidate]==original and f.promote==0
    and f.env.OlympusVerifyDB.launchPromotionCustodyConflict==nil)
  f.env.NOW=f.env.NOW+601;f.emit("GUILD_ROSTER_UPDATE")
  check("batch original clocks expire without extending source or action authority",not f.click(ids[2]) and data.expiresAt==c.observedAt+600 and f.promote==0)
end
print(string.format("%d passed, %d failed",passed,failed));if failed>0 then os.exit(1) end

-- Current modules, synthetic native APIs. No installed client or provider interaction.
local function fixture(knight)
  local e=setmetatable({}, {__index=_G});e._G=e
  setfenv(assert(loadfile('wow_mock.lua')),e)()
  local f={e=e,clicks=0,direct=0,syncs=0}
  e.OlympusVerifyConfig={membershipOnly=true,secret='synthetic-only-directive-test-secret'}
  e.GetGuildInfo=function() return 'OLYMPUS PRIME','High Council',1 end
  e.GetRealmName=function() return 'Native Realm' end
  e.UnitGUID=function() return 'Player-1-0000AAAA' end
  e.GetGuildRosterShowOffline=function() return true end
  e.InCombatLockdown=function() return false end
  e.CanGuildPromote=function() return true end
  e.issecretvalue=function() return false end
  e.ROSTER={{name='Officer',rank='High Council',rankIndex=1,level=60,online=true,guid='Player-1-0000AAAA'},
    {name='Candidate',rank='Initiate',rankIndex=9,level=60,online=false,guid='Player-1-0000BBBB'}}
  local function load(name) setfenv(assert(loadfile('../OlympusVerify/'..name)),e)('OlympusVerify') end
  load('Libs/OlympusHmac.lua');load('OlympusVerifyNativeRankConstants.lua')
  local c=e.OlympusVerifyNativeRankConstants
  f.names={};for i,v in ipairs(c.names) do f.names[i]=v end
  e.GuildControlGetNumRanks=function() return #f.names end
  e.GuildControlGetRankName=function(i) return f.names[i] end
  load('OlympusVerifyNativeRanks.lua')
  e.C_GuildInfo.IsGuildRankAssignmentAllowed=function() return true end
  e.C_GuildInfo.Promote=function() f.direct=f.direct+1;error('never direct') end
  e.GuildPromote=e.C_GuildInfo.Promote
  e.SECURE_MACRO_EXECUTE=function(body)
    assert(body=='/gpromote Candidate-Forever','unexpected literal command: '..tostring(body))
    f.clicks=f.clicks+1
    local record=e.OlympusVerifyDB.launchPromotionAttempts[e.ROSTER[2].guid]
    assert(record.version==3 and record.state=='unknown' and record.steps[#record.steps].state=='unknown')
    if not f.unknown then local row=e.ROSTER[2];row.rankIndex=row.rankIndex-1;row.rank=f.names[row.rankIndex+1] end
  end
  e.OlympusVerifyDB={}
  e.OlympusVerifyAPI={Sync=function() f.syncs=f.syncs+1 end}
  local guid=e.ROSTER[2].guid
  local scope=e.OlympusHmac.sha256hex('native-scope|1|OLYMPUS PRIME|Native Realm'):sub(1,16)
  f.origin={snapshotId=12,snapshotAt=e.NOW-10,context=string.rep('a',32),issued=e.NOW,expires=e.NOW+500}
  function f.publish(ack)
    local o=f.origin;local now=e.NOW
    local p={version=1,id='synthetic-plan-1',actorGuid=e.ROSTER[1].guid,targetGuid=guid,name='Candidate',subjectDigest=string.rep('b',64),
      rankProfile=c.profile,rankSchemeDigest=c.digest,originSnapshotId=o.snapshotId,originSnapshotAt=o.snapshotAt,originContext=o.context,
      startSlot=9,finalSlot=knight and 5 or 7,reason=knight and 'knight-veteran' or 'verified-initiate',issuedAt=o.issued,expiresAt=o.expires,
      acknowledgedSteps=ack,lastSnapshotId=12+ack,lastObservedAt=ack==0 and o.snapshotAt or now-1}
    local row={guid=guid,name='Candidate',currentSlot=9-ack,targetSlot=p.finalSlot,targetName=knight and 'Veteran' or 'Member',reason=p.reason,
      intent=p,intentToken='c3ludGhldGlj.'..string.rep(tostring(ack),64)}
    local page={protocol='officer-operations-v234',fetchedAt=now,expiresAt=o.expires,status='partial',snapshotId=p.lastSnapshotId,snapshotAt=ack==0 and o.snapshotAt or now,
      memberCount=2,guild='OLYMPUS PRIME',canonicalGuild='OLYMPUS PRIME',realm='Native Realm',scopeHash=scope,rankProfile=c.profile,rankSchemeDigest=c.digest,rankNames={unpack(f.names)},
      entitlements={offset=0,pageSize=20,scanned=1,total=2,unscanned=1},scan={id=ack==0 and o.context or string.rep(tostring(ack),32),startedAt=now,expiresAt=now+500},
      invites={},promotions={row},held={},riskBuffer={},heldReasons={},motd={short='Synthetic'},actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
    local control=e.OlympusVerifyDB.launchControl
    if not control then
      control={version=4,action='select-directive',id=tostring(now)..':1',observedAt=now,scopeHash=scope,guid=e.ROSTER[1].guid,targetGuids={guid},confirmations='[]'}
      control.mac=e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret,table.concat({'launch-selected-read','4','select-directive',control.id,tostring(now),scope,control.guid,guid,'[]'},'|')):sub(1,32)
      e.OlympusVerifyDB.launchControl=control
    end
    page.scan.startedAt=control.observedAt;page.scan.expiresAt=math.min(control.observedAt+600,page.snapshotAt+600)
    e.OlympusLaunchSelected={version=2,protocol='promotion-selection-directive-v1',controlId=control.id,actorGuid=control.guid,targetGuids={guid},targetsDigest=e.OlympusHmac.sha256hex('["'..guid..'"]'),coverageKind='selected-guids',
      confirmations=control.confirmations,scopeHash=scope,observedAt=control.observedAt,snapshotId=page.snapshotId,snapshotAt=page.snapshotAt,startedAt=control.observedAt,expiresAt=page.scan.expiresAt,
      running=false,attempts=1,completed=true,page=page,coveredGuids={guid}}
    return row,page
  end
  f.publish(0)
  function f.reload()
    if f.q then
      f.emit('PLAYER_LOGOUT')
      local function saved(value)
        if type(value)~='table' then return value end
        local copy={};for key,item in pairs(value) do copy[key]=saved(item) end;return copy
      end
      e.OlympusVerifyDB=saved(e.OlympusVerifyDB)
    end
    load('OlympusVerifyLaunch229.lua');f.q=e.OlympusLaunch229;f.emit('GUILD_ROSTER_UPDATE')
  end
  function f.emit(event) f.q.Events:GetScript('OnEvent')(f.q.Events,event) end
  function f.click()
    local before=f.clicks
    local b=e.CreateFrame('Button',nil,e.UIParent,'SecureActionButtonTemplate,UIPanelButtonTemplate')
    f.q.BindPromotionButton(b,function() return guid end);b:Show();b:Click()
    assert(not b._secureError,tostring(b._secureError))
    return f.clicks==before+1
  end
  f.reload();return f
end
if DIRECTIVE_FIXTURE_ONLY then return fixture end
local f=fixture(false)
assert(f.q.Current() and #f.q.Current().promotions==1,'selected initial plan loaded')
assert(f.click() and f.e.ROSTER[2].rankIndex==8,'first hardware click reaches Alt8: '..table.concat(f.e.PRINTS,'; '))
f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE')
local id=f.e.ROSTER[2].guid;local ledger=f.e.OlympusVerifyDB.launchPromotionAttempts
assert(ledger[id].state=='confirmed' and not ledger[id].completed,'first owned step confirmed')
assert(not f.click() and f.clicks==1,'same stale selected source cannot arm step2')
f.e.NOW=f.e.NOW+1;assert(f.q.Select(id),'same intent fresh read request')
assert(f.e.OlympusVerifyDB.launchControl.confirmations:find(ledger[id].intentToken,1,true),'original token in saved control')
f.publish(1);f.reload()
ledger=f.e.OlympusVerifyDB.launchPromotionAttempts
assert(f.q.PromotionStatus(id,f.q.Current(),8)=='continue','confirmed ledger survives reload and fresh read')
assert(f.click() and f.e.ROSTER[2].rankIndex==7,'second distinct hardware click reaches Member7')
f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE')
assert(ledger[id].completed and f.direct==0 and f.clicks==2,'completion observed with no direct API')
assert(ledger[id].originalIntentToken~=ledger[id].intentToken and ledger[id].steps[1].intentToken==ledger[id].originalIntentToken
  and ledger[id].steps[2].intentToken==ledger[id].intentToken,'original and every admitted step seal retained')
local k=fixture(true)
for step=1,4 do
  assert(k.click(),'Knight step '..step)
  k.e.NOW=k.e.NOW+1;k.emit('GUILD_ROSTER_UPDATE')
  if step<4 then k.e.NOW=k.e.NOW+1;assert(k.q.Select(k.e.ROSTER[2].guid));k.publish(step);k.reload() end
end
assert(k.e.ROSTER[2].rankIndex==5 and k.clicks==4 and k.direct==0,'Knight9 toVeteran5 uses four distinct observed clicks')
local unknown=fixture(false);unknown.unknown=true;assert(unknown.click());unknown.reload()
assert(not unknown.click() and not unknown.q.Select(unknown.e.ROSTER[2].guid),'unknown first step held across reload')
for _,kind in ipairs({'missing','string','table','negative','future'}) do
  local malformed=fixture(false);assert(malformed.click());malformed.e.NOW=malformed.e.NOW+1;malformed.emit('GUILD_ROSTER_UPDATE')
  local id=malformed.e.ROSTER[2].guid;local record=malformed.e.OlympusVerifyDB.launchPromotionAttempts[id]
  local value=kind=='string' and 'wrong' or kind=='table' and {} or kind=='negative' and -1 or kind=='future' and 2147483648 or nil
  record.snapshotId=value
  local originalSteps,originalControl=record.steps,malformed.e.OlympusVerifyDB.launchControl
  local ok,status=pcall(malformed.q.PromotionStatus,id,malformed.q.Current(),8)
  assert(ok and status=='pending','malformed original '..kind..' snapshot held without status exception')
  local readOK,selected=pcall(malformed.q.Select,id)
  assert(readOK and selected==false,'malformed original '..kind..' snapshot cannot issue selected continuation')
  assert(record==malformed.e.OlympusVerifyDB.launchPromotionAttempts[id] and record.snapshotId==value and record.steps==originalSteps
    and malformed.e.OlympusVerifyDB.launchControl==originalControl and malformed.syncs==0 and malformed.clicks==1,'malformed original is unchanged with no extra action or proof replay')
end
local legacy=fixture(false)
local prior={version=2,scopeHash=legacy.e.OlympusLaunchSelected.scopeHash,actorGuid=legacy.e.ROSTER[1].guid,targetGuid=legacy.e.ROSTER[2].guid,
  name='Candidate-Forever',target=8,startSlot=9,snapshotId=12,contextId=string.rep('a',32),attemptedAt=legacy.e.NOW,
  state='unknown',completed=false,steps={{from=9,expected=8,attemptedAt=legacy.e.NOW,state='unknown'}}}
legacy.e.OlympusVerifyDB.launchPromotionAttempts={[prior.targetGuid]=prior}
assert(not legacy.click() and not legacy.q.Select(prior.targetGuid),'historical ledger2 unknown cannot acquire Directive action authority')
assert(legacy.e.OlympusVerifyDB.launchPromotionAttempts[prior.targetGuid]==prior and prior.target==8 and prior.version==2,'old original body remains untouched')
legacy.reload()
assert(not legacy.click() and legacy.e.OlympusVerifyDB.launchPromotionAttempts[prior.targetGuid].state=='unknown','historical unknown remains held after reload')
local old=fixture(false);old.names[8]='Steward';assert(not old.click() and old.clicks==0,'changed empty rank blocks actual native action despite valid loaded metadata')
for _,bad in ipairs({'count','throw','secret'}) do
  local held=fixture(false)
  if bad=='count' then held.e.GuildControlGetNumRanks=function() return 9 end
  elseif bad=='throw' then held.e.GuildControlGetRankName=function() error('synthetic unavailable') end
  else
    local marker={};local read=held.e.GuildControlGetRankName
    held.e.issecretvalue=function(value) return value==marker end
    held.e.GuildControlGetRankName=function(i) return i==8 and marker or read(i) end
  end
  assert(not held.click() and held.clicks==0,'actual native '..bad..' rank API holds action')
end
local ordinary=fixture(false);ordinary.e.ROSTER[2].rankIndex=8;ordinary.e.ROSTER[2].rank='Alt'
local row=ordinary.e.OlympusLaunchSelected.page.promotions[1];row.currentSlot=8
assert(not ordinary.click() and ordinary.clicks==0,'ordinary Alt cannot use original-start9 plan without confirmedstep')
do
  local g=fixture(false);local e=g.e
  setfenv(assert(loadfile('../OlympusVerify/OlympusVerify.lua')),e)('OlympusVerify')
  e.OlympusVerifyFrame:GetScript('OnEvent')(e.OlympusVerifyFrame,'ADDON_LOADED','OlympusVerify')
  assert(e.OlympusVerifyAPI.ExportRoster()==2)
  local first=e.OlympusVerifyDB.roster
  assert(e.OlympusVerifyNativeRanks.Qualified(first.nativeRankTable) and #first.nativeRankTable.names==10,'export includes empty native ranks')
  local facts=e.OlympusVerifyAPI.AutoSyncFacts()
  assert(facts.strict and facts.digest,'actual captured table participates in pending facts')
  first.nativeRankTable.names[8]='Tampered empty rank'
  assert(e.OlympusVerifyAPI.AutoSyncFacts()==nil,'mutated captured table invalidates original pending witness')
  local old=e.GetGuildRosterInfo
  e.GetGuildRosterInfo=function(i)
    local values={old(i)}
    if i==1 then g.names[5]='Changed Empty Leader' end
    return unpack(values)
  end
  assert(e.OlympusVerifyAPI.ExportRoster()==2,'unstable rank table does not stop ordinary membership export')
  assert(e.OlympusVerifyDB.roster.nativeRankTable==false,'unstable rank double-read carries unavailable proof')
  assert(first.nativeRankTable.names[8]=='Tampered empty rank','new export does not rewrite prior snapshot')
end
print('PASS Directive table, Initiate2click/reload, Knight4click/reload, ordinaryAlt and unknown controls')

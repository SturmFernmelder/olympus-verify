-- Measured current modules, synthetic client only. No native timing/FPS claims.
DIRECTIVE_FIXTURE_ONLY=true
local fixture=assert(loadfile('test_directive_rank_transition.lua'))()
DIRECTIVE_FIXTURE_ONLY=nil
local passed,failed=0,0
local function test(name,fn)
  local ok,why=pcall(fn)
  if ok then passed=passed+1;print('PASS '..name) else failed=failed+1;print('FAIL '..name..': '..tostring(why)) end
end
local function load(f,name,baseline)
  local path=(baseline and baseline..'/addon/OlympusVerify/' or '../OlympusVerify/')..name
  setfenv(assert(loadfile(path)),f.e)('OlympusVerify',{})
end
test('one validated1000-row50-page projection per Guild paint, no per-row revalidation cache',function()
  local f=fixture(false);local e=f.e;local baseline=ADDON_RESIDUAL_BASELINE
  load(f,'OlympusVerify.lua',baseline)
  e.OlympusVerifyFrame:GetScript('OnEvent')(e.OlympusVerifyFrame,'ADDON_LOADED','OlympusVerify')
  local actor=e.ROSTER[1];e.ROSTER={actor};e.OlympusVerifyLists={version=1,guild='OLYMPUS PRIME',realm='Native Realm',verified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}},unverified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}}}
  e.OlympusVerifyLists.verified.members[1]={name=actor.name,guid=actor.guid,status='member'}
  for i=2,1000 do
    local row={name=string.format('Paint%04d',i),guid=string.format('Player-1-%08X',65536+i),rank='Initiate',rankIndex=9,level=60,online=true}
    e.ROSTER[i]=row;e.OlympusVerifyLists.verified.members[i]={name=row.name,guid=row.guid,status='member',username='synthetic'}
  end
  local scope=e.OlympusHmac.sha256hex('native-scope|1|OLYMPUS PRIME|Native Realm'):sub(1,16)
  local control={version=1,action='scan',id=tostring(e.NOW)..':77',observedAt=e.NOW,scopeHash=scope,guid=actor.guid,offset=0}
  control.mac=e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret,table.concat({'launch-control','1','scan',control.id,tostring(e.NOW),scope,actor.guid,'0'},'|')):sub(1,32)
  e.OlympusVerifyDB.launchControl=control;e.OlympusLaunchSelected=nil
  local pages={}
  for page=1,50 do
    local p={protocol='officer-operations-v234',fetchedAt=e.NOW,expiresAt=e.NOW+60,status=page==50 and 'ready' or 'partial',snapshotId=1,snapshotAt=e.NOW-1,memberCount=1000,guild='OLYMPUS PRIME',canonicalGuild='OLYMPUS PRIME',realm='Native Realm',scopeHash=scope,
      rankProfile=e.OlympusVerifyNativeRankConstants.profile,rankSchemeDigest=e.OlympusVerifyNativeRankConstants.digest,rankNames={unpack(f.names)},scan={id=string.rep('a',32),startedAt=e.NOW,expiresAt=e.NOW+599},
      entitlements={offset=(page-1)*20,pageSize=20,scanned=20,total=1000,unscanned=1000-page*20},invites={},promotions={},riskBuffer={},held={},actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
    for i=(page-1)*20+1,page*20 do if i>1 then local r=e.ROSTER[i];p.promotions[#p.promotions+1]={name=r.name,guid=r.guid,currentSlot=9,targetSlot=7,targetName='Member',reason='verified-initiate'} end end
    pages[page]=p
  end
  e.OlympusLaunchQueue={version=3,controlId=control.id,scanComplete=true,pages=pages}
  load(f,'OlympusVerifyLaunch229.lua',baseline);f.q=e.OlympusLaunch229
  load(f,'OlympusVerifyRosterModel.lua',baseline)
  e.UIParent:Show();e.UIParent.GetRight=function() return 1920 end
  local host=e.CreateFrame('Frame',nil,e.UIParent);host:Show();host:SetSize(900,700);host.GetRight=function() return 900 end;host.GetAlpha=function() return 1 end;host.GuildMemberDetailFrame=false
  local list=e.CreateFrame('Frame',nil,host);list:Show();list.expandedDisplay=true;list.GetSelectedClubId=function() return 77 end;host.MemberList=list;e.CommunitiesFrame=host;e.C_Club={GetGuildClubId=function() return 77 end}
  local nativeRows={}
  for i=2,21 do local row=e.CreateFrame('Button',nil,list);row:Show();row:SetSize(600,20);row.member={name=e.ROSTER[i].name..'-Forever',guid=e.ROSTER[i].guid};row.GetMemberInfo=function(self)return self.member end;nativeRows[#nativeRows+1]=row end
  list.ScrollBox={ForEachFrame=function(_,fn)for _,row in ipairs(nativeRows)do fn(row)end end}
  load(f,'OlympusVerifyGuild.lua',baseline);local events=e.FRAMES[#e.FRAMES];events:GetScript('OnEvent')(events,'PLAYER_LOGIN')
  local calls=0;local current=f.q.Current;f.q.Current=function(...)calls=calls+1;return current(...)end
  for i=1,8 do events:GetScript('OnUpdate')(events,.3) end
  print('MEASURE Guild paints=8 visible=20 native=1000 pages=50 Current='..calls)
  assert(calls==8,'projection validation must be once per paint, observed '..calls)
  local before=calls;pages[1].rankNames[8]='Changed Empty Rank';events:GetScript('OnUpdate')(events,.3)
  assert(calls==before+1 and f.q.Current()==nil,'in-place source mutation is revalidated, never hidden by identity cache')
end)
test('pending reconciliation coalesces bursts and retains original unknowns after expiry',function()
  local f=fixture(false);f.unknown=true;assert(f.click());local id=f.e.ROSTER[2].guid
  local timers={};f.e.C_Timer.After=function(delay,fn)timers[#timers+1]={delay=delay,fn=fn}end
  f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE')
  local calls,reads=0,0;local current=f.q.Current;f.q.Current=function(...)calls=calls+1;return current(...)end
  local native=f.e.GetGuildRosterInfo;f.e.GetGuildRosterInfo=function(...)reads=reads+1;return native(...)end
  for i=1,50 do f.emit('GUILD_ROSTER_UPDATE') end
  f.e.ROSTER[2].rankIndex=8;f.e.ROSTER[2].rank='Alt';f.emit('GUILD_ROSTER_UPDATE')
  print('MEASURE reconciliation burst=51 Current='..calls..' nativeReads='..reads..' timers='..#timers)
  assert(calls==0 and reads==0 and #timers==1,'one delayed read-only check, no repeated immediate enumeration')
  f.e.NOW=f.e.NOW+1;timers[1].fn()
  assert(calls==1 and reads==2 and f.e.OlympusVerifyDB.launchPromotionAttempts[id].state=='confirmed' and f.clicks==1,'latest newer complete cache confirms only original owned step')
  local g=fixture(false);g.unknown=true;assert(g.click());local original=g.e.OlympusVerifyDB.launchPromotionAttempts[g.e.ROSTER[2].guid]
  local checks=0;local read=g.q.Current;g.q.Current=function(...)checks=checks+1;return read(...)end
  g.e.NOW=g.origin.expires+1;g.emit('GUILD_ROSTER_UPDATE')
  assert(checks==0 and g.q.pending[original.targetGuid] and g.e.OlympusVerifyDB.launchPromotionAttempts[original.targetGuid]==original and original.state=='unknown','expired active observation stops work, never removes custody')
end)
test('slash Retry builds one fresh global catalogue and preserves foreign ownership',function()
  local f=fixture(false);load(f,'OlympusVerify.lua');local e=f.e;local r=e.OlympusVerifySlash234
  assert(r.Register('RESIDUAL_A',{'/residuala'},function()end));assert(r.Register('RESIDUAL_B',{'/residualb'},function()end));assert(r.Register('RESIDUAL_C',{'/residualc'},function()end))
  local scans=0;e.pairs=function(value)if value==e then scans=scans+1 end;return pairs(value)end
  assert(r.Retry());print('MEASURE slash Retry globalScans='..scans);assert(scans==1,'one actual global scan per retry')
  e.SLASH_FOREIGN1='/residuala';assert(not r.Retry() and e.SLASH_FOREIGN1=='/residuala','new collision is detected without overwriting foreign slot')
  e.SLASH_FOREIGN1=nil;local foreign=function()end;e.SlashCmdList.RESIDUAL_A=foreign
  assert(not r.Retry() and e.SlashCmdList.RESIDUAL_A==foreign,'foreign dispatcher is never replaced')
end)
test('descriptive current package version is used only for new intake records',function()
  local f=fixture(false);f.e.GetAddOnMetadata=function(_,key)if key=='Version'then return '0.6.37'end end;f.e.C_AddOns.GetAddOnMetadata=f.e.GetAddOnMetadata
  load(f,'OlympusVerify.lua');assert(type(f.e.OlympusVerifyAPI.Version)=='function' and f.e.OlympusVerifyAPI.Version()=='0.6.37')
  load(f,'OlympusVerifyLive242.lua');local v=f.e.OlympusVerifyLive242
  local row=v.Queue({type='verify',source='whisper',character='Candidate',code='ABC123'},'new-version')
  assert(row and row.clientVersion=='0.6.37')
  local old=v.Queue({type='verify',source='whisper',character='Original',code='ABC123',clientVersion='0.6.25'},'old-version')
  assert(old.clientVersion=='0.6.25','original descriptive stamp is not rewritten')
end)
print(string.format('%d passed, %d failed',passed,failed));assert(failed==0,'addon work component failures')

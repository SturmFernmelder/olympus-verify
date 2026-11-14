-- Current public addon controls; synthetic client only. No copied authority implementation.
DIRECTIVE_FIXTURE_ONLY=true
local fixture=assert(loadfile('test_directive_rank_transition.lua'))()
DIRECTIVE_FIXTURE_ONLY=nil
ROSTER_FIXTURE_ONLY=true
local rosterFixture=assert(loadfile('test_roster268.lua'))()
ROSTER_FIXTURE_ONLY=nil
local passed,failed=0,0
local function test(name,fn)
  local ok,why=pcall(fn)
  if ok then passed=passed+1;print('PASS '..name) else failed=failed+1;print('FAIL '..name..': '..tostring(why)) end
end
test('completed current promotion remains settled after expiry and serialized reload',function()
  local f=fixture(false);local id=f.e.ROSTER[2].guid
  assert(f.click());f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE')
  f.e.NOW=f.e.NOW+1;assert(f.q.Select(id));f.publish(1);f.reload();assert(f.click())
  f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE')
  local original=f.e.OlympusVerifyDB.launchPromotionAttempts[id]
  assert(original.completed and original.state=='confirmed')
  f.e.NOW=f.e.NOW+601;f.reload()
  assert(f.q.PromotionStatus(id,f.q.Current(),7)=='settled','expired positive history must not become pending')
  assert(not f.q.AttemptHeld(id,f.q.Current(),7) and not f.click() and f.clicks==2,'history display cannot enable a repeat')
  f.e.OlympusLaunchSelected=nil;f.e.OlympusLaunchQueue=nil
  assert(f.q.PromotionStatus(id,nil,7)=='settled','historical confirmation remains readable without a projection')
end)
test('missing discovery control is actionless while its history remains readable',function()
  local f=fixture(false);local page=f.e.OlympusLaunchSelected.page
  page.expiresAt=f.e.NOW+60;page.promotions={};page.entitlements.scanned=2;page.entitlements.unscanned=0;page.status='ready'
  f.e.OlympusLaunchQueue={version=3,controlId='original-discovery',scanComplete=true,pages={page}}
  f.e.OlympusLaunchSelected=nil;f.e.OlympusVerifyDB.launchControl=nil
  local current=f.q.Current();assert(current and current.actionHeld,'absence of original control must hold actions')
  local writes=0;f.e.CanEditMOTD=function() return true end;f.e.C_GuildInfo.SetMOTD=function() writes=writes+1 end
  page.motd={short='Synthetic',bytes=9,maxBytes=128}
  assert(not f.q.Motd('set') and writes==0)
end)
test('discovery requires the exact original signed actor/scope control',function()
  local f=fixture(false);local page=f.e.OlympusLaunchSelected.page
  page.expiresAt=f.e.NOW+60;page.promotions={};page.entitlements.scanned=2;page.entitlements.unscanned=0;page.status='ready'
  local c={version=1,action='scan',id=tostring(f.e.NOW)..':91',observedAt=f.e.NOW,scopeHash=page.scopeHash,guid=f.e.ROSTER[1].guid,offset=0}
  c.mac=f.e.OlympusHmac.hmacSha256hex(f.e.OlympusVerifyConfig.secret,table.concat({'launch-control','1','scan',c.id,tostring(c.observedAt),c.scopeHash,c.guid,'0'},'|')):sub(1,32)
  f.e.OlympusLaunchQueue={version=3,controlId=c.id,scanComplete=true,pages={page}};f.e.OlympusLaunchSelected=nil;f.e.OlympusVerifyDB.launchControl=c
  assert(not f.q.Current().actionHeld,'exact original control remains admitted')
  c.mac=string.rep('0',32);assert(f.q.Current().actionHeld,'forged same-ID control held')
  c.id=tostring(f.e.NOW)..':92';assert(f.q.Current().actionHeld,'different original control held')
  assert(f.clicks==0 and f.syncs==0)
end)
test('selected row recheck preserves the same target and selected protocol',function()
  local f=fixture(false);f.q.Show();f.q.tabButtons.initiates:Click()
  f.q.rowRecheckButtons[1]:Click()
  local control=f.e.OlympusVerifyDB.launchControl
  assert(control.version==4 and control.action=='select-directive' and #control.targetGuids==1 and control.targetGuids[1]==f.e.ROSTER[2].guid,'selected source must not become discovery page0')
  assert(f.clicks==0 and f.syncs==1)
end)
test('a supported matching loaded selected result suppresses redundant ready reminder',function()
  local f=fixture(false);local requests=0
  f.e.OlympusVerifyAutoSync={Request=function() requests=requests+1 end}
  f.e.NOW=f.e.NOW+6;f.q.Events:GetScript('OnUpdate')(f.q.Events,6)
  assert(requests==0,'matching selected result was already loaded')
  local g=fixture(false);g.e.OlympusLaunchSelected={controlId=g.e.OlympusVerifyDB.launchControl.id}
  local unknown=0;g.e.OlympusVerifyAutoSync={Request=function() unknown=unknown+1 end}
  g.e.NOW=g.e.NOW+6;g.q.Events:GetScript('OnUpdate')(g.q.Events,6)
  assert(unknown==1,'unvalidated same-ID bytes cannot impersonate a recognized loaded result')
end)
test('replacing a factual rank observation is explicit and never changes command custody',function()
  local f=fixture(false);local id=f.e.ROSTER[2].guid
  local first=f.q.RecordCurrentPromotionObservation(id);assert(first)
  f.e.NOW=f.e.NOW+1;local second=f.q.RecordCurrentPromotionObservation(id);assert(second and second~=first and first.observedAt<second.observedAt)
  local explained=false;for _,message in ipairs(f.e.PRINTS) do if message:find('prior factual observation',1,true) then explained=true end end
  assert(explained,'prior factual note replacement must be visible')
  assert(first.historicalOutcomeSettled==false and second.historicalOutcomeSettled==false and f.clicks==0 and f.e.OlympusVerifyDB.launchPromotionAttempts==nil)
end)
test('history observation cannot settle or recreate an unknown native command',function()
  local f=fixture(false);f.unknown=true;assert(f.click());local id=f.e.ROSTER[2].guid
  local original=f.e.OlympusVerifyDB.launchPromotionAttempts[id];local step=original.steps[1]
  assert(f.q.RecordCurrentPromotionObservation(id));f.e.NOW=f.e.NOW+1;assert(f.q.RecordCurrentPromotionObservation(id))
  assert(f.e.OlympusVerifyDB.launchPromotionAttempts[id]==original and original.state=='unknown' and original.steps[1]==step and step.state=='unknown' and f.clicks==1 and f.syncs==0)
end)
test('completed Knight history after expiry is a factual target observation, never a retry',function()
  local f=fixture(true);local id=f.e.ROSTER[2].guid
  for i=1,4 do assert(f.click());f.e.NOW=f.e.NOW+1;f.emit('GUILD_ROSTER_UPDATE');if i<4 then f.e.NOW=f.e.NOW+1;assert(f.q.Select(id));f.publish(i);f.reload() end end
  f.e.NOW=f.e.NOW+601;f.reload()
  setfenv(assert(loadfile('../OlympusVerify/OlympusVerifyRosterModel.lua')),f.e)('OlympusVerify')
  local ready,details=f.e.OlympusVerifyRosterModel.Promotions({{name='Candidate',guid=id,rankIndex=5,status='verified'}},f.q,f.e.NOW)
  assert(f.q.PromotionStatus(id,details.current,5)=='settled' and not ready[id] and details.byGuid[id].label=='Target rank observed (history retained)')
  assert(not f.click() and f.clicks==4 and not f.q.AttemptHeld(id,nil,5))
end)
test('historical beta profile label does not activate an unqualified production tuple',function()
  local f=fixture(false);f.e.GetBuildInfo=function()return '1.60.1','70338',nil,16001 end
  setfenv(assert(loadfile('../OlympusVerify/OlympusVerifyBrowser.lua')),f.e)('OlympusVerify')
  local ok,reason=f.e.OlympusVerifyBrowser.SetChallenge(string.rep('a',32))
  assert(not ok and reason:find('Historical beta-only',1,true) and reason:find('unqualified',1,true))
  assert(f.e.OlympusVerifyBrowser.Command('browser')==false and f.clicks==0 and f.syncs==0)
end)
test('verified Initiate check selects first20 currently filtered and sorted rows',function()
  local f=rosterFixture(35);f.e.ROSTER={f.e.ROSTER[1]};f.e.OlympusVerifyLists.verified.members={}
  for i=1,34 do
    local row={name=string.format('Target%02d',i),guid=string.format('Player-1-%08X',8192+i),rank='Initiate',rankIndex=9,level=60,online=true}
    f.e.ROSTER[#f.e.ROSTER+1]=row
    table.insert(f.e.OlympusVerifyLists.verified.members,{name=row.name,guid=row.guid,status='member',username='synthetic'})
  end
  f.e.OlympusVerifyLists.unverified.members={};f.e.OlympusLaunchQueue=nil;f.emit('GUILD_ROSTER_UPDATE')
  f.w.view.text='Target';f.w.view.sort='name';f.w.view.desc=true;f.w.Refresh()
  local visible=f.w.Visible();assert(#visible==34)
  local expected={};for i=1,20 do expected[visible[i].guid]=true end
  local calls,chosen=0,nil;f.e.OlympusLaunch229.SelectMany=function(ids) calls=calls+1;chosen=ids;return true end
  assert(f.w.RequestVerifiedInitiates() and calls==1 and #chosen==20,'more than20 must be an explicit bounded first page')
  for _,id in ipairs(chosen) do assert(expected[id],'outside current filtered/sorted first20') end
  assert(f.w.view.text=='Target' and f.w.view.desc==true,'do not broaden the user view')
  local remainder=false;for _,s in ipairs(f.e.PRINTS) do if s:find('14 additional',1,true) then remainder=true end end
  assert(remainder and f.attempts==0 and f.reloads==0,'remainder is explicit; no automatic next batch or native action')
end)
print(string.format('%d passed, %d failed',passed,failed))
assert(failed==0,'residual addon component failures')

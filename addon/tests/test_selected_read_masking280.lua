-- Read-only Guild eligibility after a different completed selection. No live game/provider actions.
local handle=assert(io.open("test_directive_rank_transition.lua","r"));local factory=handle:read("*a");handle:close()
factory=assert(factory:match("^(.-)if DIRECTIVE_FIXTURE_ONLY then"))
local anchor="  e.OlympusVerifyAPI={Sync=function() f.syncs=f.syncs+1 end}"
local a,b=factory:find(anchor,1,true);assert(a,"actual Directive factory sync seam")
factory=factory:sub(1,b)..[[
  load('OlympusVerify.lua')
  e.OlympusVerifyFrame:GetScript('OnEvent')(e.OlympusVerifyFrame,'ADDON_LOADED','OlympusVerify')
  e.OlympusVerifyAPI.Sync=function()f.syncs=f.syncs+1 end
  load('OlympusVerifyGuild.lua');f.guildFrame=e.FRAMES[#e.FRAMES]
]]..factory:sub(b+1)
local fixture=assert(loadstring(factory.."\nreturn fixture"))()

local checks={}
local function check(name,yes,kind)checks[#checks+1]={name=name,pass=yes==true,kind=kind or'preservation'}end
local function copy(v)if type(v)~='table'then return v end;local o={};for k,x in pairs(v)do o[k]=copy(x)end;return o end
local function same(a,b)if type(a)~=type(b)then return false end;if type(a)~='table'then return a==b end;for k,v in pairs(a)do if not same(v,b[k])then return false end end;for k in pairs(b)do if a[k]==nil then return false end end;return true end
local function setup()
 local f=fixture(false);local e=f.e;local A=e.ROSTER[2].guid;local B='Player-1-0000CCCC'
 e.ROSTER[3]={name='Other Candidate',rank='Initiate',rankIndex=9,level=60,online=true,guid=B}
 f.emit('GUILD_ROSTER_UPDATE');f.guildFrame:GetScript('OnEvent')(f.guildFrame,'GUILD_ROSTER_UPDATE')
 local scope=e.OlympusHmac.sha256hex('native-scope|1|OLYMPUS PRIME|Native Realm'):sub(1,16)
 e.OlympusVerifyLists={version=2,guild='OLYMPUS PRIME',realm='Native Realm',verified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}},unverified={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}},unknown={fetchedAt=e.NOW,snapshotAt=e.NOW,members={}}}
 for i,r in ipairs(e.ROSTER)do table.insert(e.OlympusVerifyLists.verified.members,{name=r.name,guid=r.guid,status='member',username='synthetic'..i,displayName='Synthetic '..i})end
 e.OlympusLaunchSelected=nil;e.NOW=e.NOW+1;assert(f.q.Control('scan'),'actual signed discovery control');local discoveryControl=e.OlympusVerifyDB.launchControl
 local names=e.OlympusVerifyNativeRankConstants.names
 local page={protocol='officer-operations-v234',fetchedAt=e.NOW,expiresAt=e.NOW+60,status='ready',snapshotId=12,snapshotAt=e.NOW-10,memberCount=3,guild='OLYMPUS PRIME',canonicalGuild='OLYMPUS PRIME',realm='Native Realm',scopeHash=scope,rankProfile=e.OlympusVerifyNativeRankConstants.profile,rankSchemeDigest=e.OlympusVerifyNativeRankConstants.digest,rankNames={unpack(names)},
 entitlements={offset=0,pageSize=20,scanned=3,total=3,unscanned=0},scan={id=string.rep('a',32),startedAt=e.NOW,expiresAt=e.NOW+590},invites={},promotions={{name='Candidate',guid=A,currentSlot=9,targetSlot=7,targetName='Member',reason='verified-initiate'},{name='Other Candidate',guid=B,currentSlot=9,targetSlot=7,targetName='Member',reason='verified-initiate'}},riskBuffer={},held={},heldReasons={},motd={short='Synthetic'},actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
 e.OlympusLaunchQueue={version=3,controlId=discoveryControl.id,scanComplete=true,discoveredPages=1,refreshedPages=0,running=false,pages={page}}
 setfenv(assert(loadfile('../OlympusVerify/OlympusVerifyRosterModel.lua')),e)('OlympusVerify')
 e.UIParent:Show();e.UIParent.GetRight=function()return 1920 end
 local host=e.CreateFrame('Frame',nil,e.UIParent);host:Show();host:SetSize(900,700);host.GetRight=function()return 1100 end;host.GetAlpha=function()return 1 end;host.GuildMemberDetailFrame=false
 local list=e.CreateFrame('Frame',nil,host);list:Show();list.expandedDisplay=true;list.GetSelectedClubId=function()return 77 end
 e.C_Club={GetGuildClubId=function()return 77 end};host.MemberList=list;e.CommunitiesFrame=host
 f.nativeRows={};for i,r in ipairs(e.ROSTER)do local row=e.CreateFrame('Button',nil,list);row:Show();row:SetSize(600,20);row.member={name=r.name..'-Forever',guid=r.guid};row.GetMemberInfo=function(self)return self.member end;f.nativeRows[i]=row end
 list.ScrollBox={ForEachFrame=function(_,fn)for _,r in ipairs(f.nativeRows)do fn(r)end end}
 function f.tick()f.guildFrame:GetScript('OnUpdate')(f.guildFrame,0.3)end
 function f.rosterEvent()f.emit('GUILD_ROSTER_UPDATE');f.guildFrame:GetScript('OnEvent')(f.guildFrame,'GUILD_ROSTER_UPDATE')end
 function f.buttons()local out={};for _,v in ipairs(e.FRAMES)do for i,r in ipairs(f.nativeRows)do if v.nativeRow==r then out[i]=v end end end;return out end
 f.guildFrame:GetScript('OnEvent')(f.guildFrame,'ADDON_LOADED','Blizzard_Communities');f.tick()
 function f.selectedA()
  local a=f.buttons()[2].promote;assert(a:GetText()=='Check'and a:IsEnabled(),'valid A starts with Guild Check');a:Click()
  assert(e.OlympusVerifyDB.launchControl.targetGuids[1]==A,'actual Guild Check generated A control')
  local row,p=f.publish(0);p.memberCount=3;p.entitlements.total=3;p.entitlements.unscanned=2;f.rosterEvent();f.tick()
  local q=f.q.Current();assert(q and q.selection and q.selection.completed and q.freshness[A].kind=='selected','current valid selected A must load')
  return row,p
 end
 return f,A,B,page,discoveryControl
end
local baseline,A,B=setup();local e=baseline.e;local q=baseline.q.Current();local bs=baseline.buttons()
check('positive discovery retains distinct A+B with qualified full Directive rank table',q and #q.promotions==2 and not q.actionHeld)
check('both verified native Initiates initially offer Check rather than Promote',bs[2].promote:GetText()=='Check'and bs[2].promote:IsEnabled()and bs[3].promote:GetText()=='Check'and bs[3].promote:IsEnabled())
local initialSyncs=baseline.syncs;bs[3].promote:Click()
check('positive B Guild Check queues one actual signed B control',e.OlympusVerifyDB.launchControl.targetGuids[1]==B and baseline.syncs==initialSyncs+1)
check('Check executes no native promotion or attempt',baseline.clicks==0 and baseline.direct==0 and next(e.OlympusVerifyDB.launchPromotionAttempts or{})==nil)
local f,A,B,discovery,scanControl=setup();local e=f.e;local row,p=f.selectedA();local selected=copy(e.OlympusLaunchSelected);local control=e.OlympusVerifyDB.launchControl;local controlImage=copy(control);local scanImage=copy(discovery);local pending=e.OlympusVerifyDB.launchPromotionAttempts;local pendingImage=copy(pending)
local view=f.q.Current();local b=f.buttons()[3].promote;local beforeSync=f.syncs
check('valid selected A remains actionable with its own original source',view.freshness[A].kind=='selected'and f.buttons()[2].promote:GetText()=='Promote'and f.buttons()[2].promote:IsEnabled())
check('unrelated B remains current verified native Initiate',f.buttons()[3].result.status=='verified'and e.ROSTER[3].rankIndex==9 and f.q.AttemptHeld(B,view,9)==false)
check('future B Check remains available after selected A load',b:GetText()=='Check'and b:IsEnabled(),'expected-fix')
b:Click();local newControl=e.OlympusVerifyDB.launchControl
check('future B Check queues exactly one separate selected read',newControl.targetGuids and newControl.targetGuids[1]==B and newControl.id~=control.id and f.syncs==beforeSync+1,'expected-fix')
check('A original selected proof and original expiry are not mutated',same(e.OlympusLaunchSelected,selected))
check('A original signed control object is not renewed or rewritten',same(control,controlImage))
check('original discovery data and clocks are not rewritten',same(discovery,scanImage))
check('read-only B click never adds, clears or reclassifies promotion history',same(pending,pendingImage)and f.clicks==0 and f.direct==0)
local mainObserved={BVerified=f.buttons()[3].result.status,BButton=b:GetText(),BEnabled=b:IsEnabled(),globalActionHeld=view.actionHeld,selectionCoversA=view.selection.covered[A],selectionCoversB=view.selection.covered[B]==true,discoveryPromotions=#discovery.promotions,currentPromotions=#view.promotions,loadedReason=view.loadedScan and view.loadedScan.label}
-- Actual independent direct read admission proves B has no Native/custody block.
local direct,A,B=setup();direct.selectedA();local old=copy(direct.e.OlympusLaunchSelected);local syncs=direct.syncs
check('actual Q.Select B still admits read independently of masked display',direct.q.Select(B)==true and direct.syncs==syncs+1)
check('direct positive read does not renew original A proof',same(direct.e.OlympusLaunchSelected,old)and direct.clicks==0)
-- An actual unknown A attempt must never be inferred cancelled by checking B.
local unknown,A,B=setup();unknown.selectedA();unknown.unknown=true;assert(unknown.click(),'synthetic native A command actually issued once')
local attempt=unknown.e.OlympusVerifyDB.launchPromotionAttempts[A];assert(attempt and attempt.state=='unknown');local frozen=copy(attempt);unknown.tick();local b=unknown.buttons()[3].promote;local syncs=unknown.syncs
check('unknown A belongs to A and does not create B custody',unknown.q.AttemptHeld(A,unknown.q.Current(),9)==true and unknown.q.AttemptHeld(B,unknown.q.Current(),9)==false)
check('future B read remains available while original A stays unknown',b:GetText()=='Check'and b:IsEnabled(),'expected-fix')
b:Click();check('B display click never repairs or retries unknown A',same(attempt,frozen)and unknown.clicks==1 and unknown.direct==0)
local directUnknown,A,B=setup();directUnknown.selectedA();directUnknown.unknown=true;assert(directUnknown.click());local original=copy(directUnknown.e.OlympusVerifyDB.launchPromotionAttempts[A])
check('actual separate B read admission preserves unknown A',directUnknown.q.Select(B)==true and same(directUnknown.e.OlympusVerifyDB.launchPromotionAttempts[A],original)and directUnknown.clicks==1)

-- Same-GUID pending read and unknown promotion may never be repaired by this display path.
local pendingB,A,B=setup();local e=pendingB.e;pendingB.buttons()[3].promote:Click();pendingB.tick()
local before=pendingB.syncs;local control=e.OlympusVerifyDB.launchControl;pendingB.buttons()[3].promote:Click()
check('same GUID pending selected read stays disabled with no replacement',not pendingB.buttons()[3].promote:IsEnabled()and pendingB.syncs==before and e.OlympusVerifyDB.launchControl==control)
local ownUnknown,A,B=setup();ownUnknown.selectedA();ownUnknown.unknown=true;assert(ownUnknown.click());ownUnknown.tick()
local unknownImage=copy(ownUnknown.e.OlympusVerifyDB.launchPromotionAttempts[A]);local before=ownUnknown.syncs
ownUnknown.buttons()[2].promote:Click()
check('same GUID unknown original remains disabled and unrepaired',not ownUnknown.buttons()[2].promote:IsEnabled()and ownUnknown.syncs==before and same(unknownImage,ownUnknown.e.OlympusVerifyDB.launchPromotionAttempts[A])and ownUnknown.clicks==1)
for _,reason in ipairs({'source-unknown','operator-stopped','unrecognized-source-hold'})do
 local stopped,A,B=setup();stopped.selectedA();stopped.e.OlympusLaunchQueue.stoppedReason=reason;stopped.tick()
 local before=stopped.syncs;stopped.buttons()[3].promote:Click()
 check(reason..' remains held rather than becoming a read Check',not stopped.buttons()[3].promote:IsEnabled()and stopped.syncs==before)
end
local stopped,A,B=setup();stopped.selectedA();assert(stopped.q.Control('stop'));stopped.tick();local before=stopped.syncs;stopped.buttons()[3].promote:Click()
check('actual explicit Stop control withholds B read without new control',not stopped.buttons()[3].promote:IsEnabled()and stopped.syncs==before and stopped.e.OlympusVerifyDB.launchControl.action=='stop')
for _,kind in ipairs({'held','risk'})do
 local held,A,B,page=setup();page.promotions={page.promotions[1]}
 if kind=='held'then page.held={{name='Other Candidate',guid=B,reason='discord-entitlement-unknown'}}
 else page.riskBuffer={{name='Other Candidate',guid=B,currentSlot=9,reason='unverified-initiate',reviewOnly=true}}end
 held.selectedA();local before=held.syncs;held.buttons()[3].promote:Click()
 check('per-B '..kind..' source retains no read Check',not held.buttons()[3].promote:IsEnabled()and held.syncs==before)
end
local changed,A,B=setup();changed.selectedA();changed.names[8]='Wrong empty rank';changed.tick();local before=changed.syncs;changed.buttons()[3].promote:Click()
check('changed live complete rank table withholds read Check',not changed.buttons()[3].promote:IsEnabled()and changed.syncs==before)
local actor,A,B=setup();actor.selectedA();actor.e.ROSTER[1].guid='Player-1-FFFFEEEE';actor.e.UnitGUID=function()return 'Player-1-FFFFEEEE'end;actor.rosterEvent();actor.tick();local before=actor.syncs;actor.buttons()[3].promote:Click()
check('changed native actor cannot obtain a replacement read',actor.syncs==before)
local expired,A,B=setup();expired.selectedA();local old=copy(expired.e.OlympusLaunchSelected);expired.e.NOW=expired.e.NOW+601;expired.rosterEvent();expired.tick()
local before=expired.syncs;local button=expired.buttons()[3].promote;button:Click()
check('expired A does not gain action authority while B gets separate read',button:GetText()=='Check'and expired.syncs==before+1 and same(old,expired.e.OlympusLaunchSelected)and expired.clicks==0,'expected-fix')
local raced,A,B=setup();raced.selectedA();local e=raced.e;local current=raced.q.Current();local api={}
for k,v in pairs(raced.q)do api[k]=v end
api.Current=function()e.OlympusLaunchQueue.pages=copy(e.OlympusLaunchQueue.pages);return current end
local candidates,details=e.OlympusVerifyRosterModel.Promotions({{name='Other Candidate',guid=B,rankIndex=9,status='verified'}},api,e.NOW)
check('raw page replacement after validated Current cannot enable read',not candidates[B]and details.byGuid[B].state~='check')
-- Changing display verification or native target remains independent of dated A.
local unverified,A,B=setup();unverified.selectedA();unverified.e.OlympusVerifyLists.verified.members[3]=nil;unverified.tick();local before=unverified.syncs;unverified.buttons()[3].promote:Click()
check('unverified B cannot use unrelated selected A as verification',not unverified.buttons()[3].promote:IsEnabled()and unverified.syncs==before)
local pass,fail=0,0;for _,v in ipairs(checks)do if v.pass then pass=pass+1 else fail=fail+1;print('FAIL '..v.name)end end
print('selected read masking280: '..pass..'/'..#checks..' passed')
assert(fail==0,'selected read masking controls failed: '..fail)

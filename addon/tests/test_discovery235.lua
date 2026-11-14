-- Current235 rank-held discovery is data, never promotion authority. Reuse the
-- existing synthetic WHO fixture definition; none of its test assertions run.
local file=assert(io.open('test_officer_invites233.lua','r'))
local fixtureSource=file:read('*a');file:close()
local prefix=assert(fixtureSource:match('^(.-)\ndo\n'),'WHO fixture definition boundary')
local fixture=assert(loadstring(prefix..'\nreturn fixture'))()
local D=assert(loadfile('directive_fixture280.lua'))()
local passed,failed=0,0
local function check(name,value)
 if value then passed=passed+1;print('PASS '..name) else failed=failed+1;print('FAIL '..name) end
end
local function copy(v)
 if type(v)~='table' then return v end
 local result={} for k,x in pairs(v)do result[k]=copy(x)end return result
end
local function setup()
 local f=fixture();local e=f.e
 e.GetGuildInfo=function(unit)if unit=='player'then return 'OLYMPUS PRIME','Guild Master',0 end end
 e.ROSTER={{name='Officer',rankIndex=0,guid='Player-1-00000001'},{name='Candidate',rankIndex=9,guid='Player-1-00000002'}}
 local names=D.ranks(e)
 f.promotions=0;e.CanGuildPromote=function()return true end
 e.C_GuildInfo.Promote=function()f.promotions=f.promotions+1 end;e.GuildPromote=e.C_GuildInfo.Promote
 assert(f.observe() and f.o.HardwareCheck(f.guid));f.answer('');assert(f.records==1)
 f.approve()
 local p={protocol='officer-operations-v235',fetchedAt=e.NOW,expiresAt=e.NOW+59,status='partial',
  snapshotId=12,snapshotAt=e.NOW-10,memberCount=20,guild='OLYMPUS PRIME',canonicalGuild='OLYMPUS PRIME',realm='Native Realm',scopeHash=f.scope,
  scan={id=string.rep('a',32),startedAt=e.NOW,expiresAt=e.NOW+580},
  entitlements={offset=0,pageSize=20,scanned=20,total=20,unscanned=0,retryAfterSeconds=nil},
  promotions={},riskBuffer={},held={},invites={copy(f.row)},heldReasons={'directive-rank-policy-held'},
  motd={short='Guild rules and Discord: use Get my code.',bytes=40,maxBytes=128},
  actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
 p.motd.bytes=#p.motd.short
 e.OlympusLaunchQueue={version=3,scanComplete=true,pages={p}}
 D.signDiscovery(e,e.OlympusLaunchQueue,'Player-1-00000001',f.scope)
 setfenv(assert(loadfile('../OlympusVerify/OlympusVerifyLaunch229.lua')),e)('OlympusVerify')
 local q,why=e.OlympusLaunch229.Current()
 assert(q and q.rankHeld and not q.actionHeld,'positive rank-held baseline: '..tostring(why))
 return f,e,p,q.invites[1]
end
local pages={
 {'rankless235-positive',function()end,true},
 {'legacy234-null-triple',function(p)p.protocol='officer-operations-v234'end},
 {'unknown-protocol',function(p)p.protocol='officer-operations-v999'end},
 {'one-profile-only',function(p)p.rankProfile='unconfirmed'end},
 {'one-digest-only',function(p)p.rankSchemeDigest=string.rep('a',64)end},
 {'one-names-only',function(p,e)p.rankNames=e.OlympusVerifyNativeRankConstants.names end},
 {'ready-null-triple',function(p)p.status='ready'end},
 {'unknown-hold-reason',function(p)p.heldReasons={'arbitrary'}end},
 {'promotion-array-injection',function(p)p.promotions={{name='Candidate',guid='Player-1-00000002',currentSlot=9,targetSlot=7,targetName='Member',reason='verified-initiate'}}end},
 {'promotion-keyed-injection',function(p)p.promotions['unsafe-key']={}end},
 {'risk-keyed-injection',function(p)p.riskBuffer['unsafe-key']={}end},
 {'crossed-native-realm',function(p)p.realm=p.realm..' WRONG'end},
 {'future-source-clock',function(p,e)p.snapshotAt=e.NOW+6 end},
 {'mixed-protocol-pages',function(p,e)p.entitlements.total=40;p.memberCount=40;local c=copy(p);c.protocol='officer-operations-v234';c.invites={};c.entitlements.offset=20;e.OlympusLaunchQueue.pages[2]=c end},
 {'mixed-rank-mode-pages',function(p,e)p.entitlements.total=40;p.memberCount=40;local c=copy(p);c.rankProfile=e.OlympusVerifyNativeRankConstants.profile;c.rankSchemeDigest=e.OlympusVerifyNativeRankConstants.digest;c.rankNames=e.OlympusVerifyNativeRankConstants.names;c.invites={};c.entitlements.offset=20;e.OlympusLaunchQueue.pages[2]=c end},
}
for _,case in ipairs(pages)do
 local f,e,p=setup();case[2](p,e);local q=e.OlympusLaunch229.Current()
 e.OlympusLaunch229.tab='initiates';e.OlympusLaunch229.NextAction()
 check(case[1],(q~=nil)==(case[3]==true) and f.promotions==0)
end
local hardware={
 {'independent-invite-positive',function()end,true},
 {'combat',function(f,e)e.InCombatLockdown=function()return true end end},
 {'permission',function(f,e)e.CanGuildInvite=function()return false end end},
 {'changed-WHO-guild',function(f)f.rows[1].fullGuildName='Another Guild'end},
 {'changed-WHO-name',function(f)f.rows[1].fullName='Another Name'end},
 {'missing-invite-api',function(f,e)e.C_GuildInfo.Invite=nil;e.GuildInvite=nil end},
 {'proof-GUID-drift',function(f,e)local count=0;for _,r in pairs(e.OlympusVerifyDB.officerInvites233.proofs)do r.body.guid='Player-1-FFFF1234';count=count+1 end;assert(count==1)end},
 {'unknown-prior-attempt',function(f,e,p,row)e.OlympusVerifyDB.officerInvites233.attempts[tostring(row.queueId)]={state='unknown'}end},
}
for _,case in ipairs(hardware)do
 local f,e,p,row=setup();case[2](f,e,p,row)
 local requested=f.o.HardwareInvite(row)
 check(case[1],(requested==true)==(case[3]==true) and f.invites==(case[3] and 1 or 0) and f.promotions==0)
end
print(passed..'/'..(passed+failed)..' discovery235 checks')
assert(failed==0,'discovery235 failures')

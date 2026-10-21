-- Additive v2 only. Every roster value below is fictional and stays in this process.
local passed=0
local function check(ok,label) if not ok then error('FAIL '..label) end;passed=passed+1;print('PASS '..label) end
dofile('../OlympusStatsPilot/Core.lua')
dofile('../OlympusStatsPilot/Libs/StatsPilotQr.lua')
CreateFrame=nil
dofile('../OlympusStatsPilot/Army.lua')
local A,B=OlympusStatsPilot,OlympusStatsPilot.Army
local nonce=string.rep('a',32)
local function fill(n,value) local out={};for i=1,n do out[i]=value end;return out end
local function sample() return {guild='Synthetic Army Guild',realmGroup='Synthetic Army Realm',faction='Alliance',observedAt=1792490000,members=90,online=45,classes=fill(9,10),levels={0,0,0,0,0,0,90},ranks=fill(10,9)} end
local canonical='{"format":"olympus-stat-observation-v2","scope":"own-guild","source":"volunteer-client","sourceVerified":false,"membershipProof":false,"addonVersion":"0.2.0","realmGroup":"Synthetic Army Realm","faction":"Alliance","observedAt":1792490000,"guilds":[{"name":"Synthetic Army Guild","receivedAt":1792490000,"reportedCharacters":90,"online":45,"classes":[10,10,10,10,10,10,10,10,10],"levels":[0,0,0,0,0,0,90],"ranks":[9,9,9,9,9,9,9,9,9,9]}]}'
check(type(B)=='table' and B~=A and B.ValidText==A.ValidText and B.MaskCount==A.MaskCount,'independent additive Army namespace reuses only reviewed pure primitives')
check(B.Serialize(sample())==canonical,'exact v2 canonical root and positional distribution order')
local before=A.Serialize(sample())
check(before:find('"format":"olympus-stat-observation-v1"',1,true) and before:find('"addonVersion":"0.1.0"',1,true) and not before:find('"classes"',1,true),'v1 serializer still emits exact separate original contract')
local frames=B.Frames(canonical,nonce)
check(#frames==math.ceil(#canonical/75) and #frames<=14,'v2 retains exact 75-byte chunks and bounded multipart count')
for i,frame in ipairs(frames) do
  check(frame:sub(1,39)=='OLCS2|'..nonce..'|' and #frame<=191,'v2 frame '..i..' uses OLCS2 and original frame limit')
  check(frame:sub(40,82)==A.Base64url(A.Sha256(canonical)) and frame:sub(84,90)==string.format('%03d|%03d',i,#frames),'v2 frame '..i..' binds full SHA256 and exact sequence')
  local matrix=OlympusStatsPilotQr.Encode(frame)
  check(matrix and matrix[0][0]~=nil and matrix[48][48]~=nil,'real unchanged 49-module encoder accepts v2 part '..i)
end
check(A.Frames(before,nonce)[1]:sub(1,6)=='OLCS1|','v1 framing remains OLCS1 after v2 framing')
check(B.Frames(string.rep('x',1023),nonce) and #B.Frames(string.rep('x',1023),nonce)==14 and B.Frames(string.rep('x',1024),nonce)==nil,'v2 retains full payload limit without truncation')
check(B.Frames(canonical,nonce:upper())==nil and B.Frames('',nonce)==nil,'v2 retains exact nonce and nonempty payload guards')
for _,field in ipairs({'classes','levels','ranks'}) do
  local row=sample();row[field]=nil
  check(B.Serialize(row):find('"'..field..'":null',1,true),'missing '..field..' is wholly withheld')
  row=sample();row[field][1]=4
  check(B.Serialize(row):find('"'..field..'":null',1,true),'small bucket withholds entire '..field..' distribution')
  row=sample();row[field][1]=1;row[field][2]=89
  check(B.Serialize(row):find('"'..field..'":null',1,true),'sum-compatible small '..field..' bucket cannot escape suppression')
  row=sample();row[field][1]=-1
  check(B.Serialize(row):find('"'..field..'":null',1,true),'negative '..field..' bucket cannot escape suppression')
  row=sample();row[field][1]='10'
  check(B.Serialize(row):find('"'..field..'":null',1,true),'nonnumeric '..field..' bucket withheld without coercion')
  row=sample();row[field][1]=1.5
  check(B.Serialize(row):find('"'..field..'":null',1,true),'fractional '..field..' bucket withheld')
  row=sample();row[field][1]=nil
  check(B.Serialize(row):find('"'..field..'":null',1,true),'sparse '..field..' distribution withheld')
  row=sample();row[field][100]=0
  check(B.Serialize(row):find('"'..field..'":null',1,true),'unknown position withholds '..field..' distribution')
  row=sample();row[field].privateLabel=90
  check(B.Serialize(row):find('"'..field..'":null',1,true),'named metadata key cannot enter '..field..' distribution')
  row=sample();row[field]=fill(({classes=9,levels=7,ranks=10})[field],0)
  check(B.Serialize(row):find('"'..field..'":null',1,true),'inexact total withholds '..field..' distribution')
end
for total=1,4 do
  local row=sample();row.members=total;row.online=total;row.classes={total,0,0,0,0,0,0,0,0};row.levels={0,0,0,0,0,0,total};row.ranks={total,0,0,0,0,0,0,0,0,0}
  check(B.Serialize(row):find('"reportedCharacters":"few","online":null,"classes":null,"levels":null,"ranks":null',1,true),'small total '..total..' suppresses all auxiliary distributions')
end
for _,case in ipairs({{90,2,'"few"'},{90,89,'null'},{90,86,'null'},{90,85,'85'},{90,0,'0'},{5,5,'5'}}) do
  local row=sample();row.members=case[1];row.online=case[2]
  check(B.Serialize(row):find('"online":'..case[3]..',',1,true),'v2 keeps original online/complement masking '..case[1]..'/'..case[2])
end
local invalid=sample();invalid.online=91;check(B.Serialize(invalid)==nil,'v2 never accepts online greater than complete total')
invalid=sample();invalid.guild=' bad';check(B.Serialize(invalid)==nil,'v2 preserves original native text rejection')
invalid=sample();invalid.guild=string.rep('x',128);invalid.realmGroup=string.rep('y',128);invalid.members=1000;invalid.online=500;invalid.classes={1000,0,0,0,0,0,0,0,0};invalid.levels={0,0,0,0,0,0,1000};invalid.ranks={1000,0,0,0,0,0,0,0,0,0};check(B.Serialize(invalid) and #B.Serialize(invalid)<=1023,'maximum bounded native labels and distributions fit fixed payload cap')

local clock,mono,combatState,offline,inGuild,requestCount,guild,realm,faction,ownGuid,rows,onlineReported,mutateDuringRead
local classes={'WARRIOR','PALADIN','HUNTER','ROGUE','PRIEST','SHAMAN','MAGE','WARLOCK','DRUID'}
local function fixture(n)
  clock=1792490000;mono=1;combatState=false;offline=true;inGuild=true;requestCount=0;guild='Synthetic Army Guild';realm='Synthetic Army Realm';faction='Alliance';ownGuid='Player-4613-00000001';rows={};onlineReported=math.max(1,math.floor(n/2));mutateDuringRead=nil
  for i=1,n do rows[i]={name='SyntheticPrivatePerson'..i,guid=string.format('Player-4613-%08X',i),online=i<=onlineReported,classFile=classes[math.floor((i-1)/10)+1] or 'WARRIOR',rankIndex=math.floor((i-1)/9)%10,level=60} end
  GetServerTime=function()return clock end;GetTime=function()return mono end
  InCombatLockdown=function()return combatState end;IsInGuild=function()return inGuild end
  GetRealmName=function()return realm end;UnitGUID=function()return ownGuid end
  UnitFactionGroup=function()return faction end;GetGuildInfo=function()return guild,'Synthetic private rank',7,realm end
  GetGuildRosterShowOffline=function()return offline end;GetNumGuildMembers=function()return #rows,onlineReported end
  GetGuildRosterInfo=function(i)
    if mutateDuringRead then mutateDuringRead(i) end
    local row=rows[i];if not row then return nil end
    return row.name,'Synthetic private rank',row.rankIndex,row.level,'Localized class label ignored','Synthetic private zone','Synthetic private note','Synthetic private officer note',row.online,nil,row.classFile,nil,nil,nil,nil,nil,row.guid
  end
  C_GuildInfo={GuildRoster=function()requestCount=requestCount+1 end};GuildRoster=nil
end
local function collect(n) fixture(n or 90);assert(B.Start(nonce));assert(B.RequestSnapshot());assert(B.OnEvent('GUILD_ROSTER_UPDATE')) end
local function payload() local copy=B.CopyFrames();if not copy then return nil end;return copy end
fixture(90)
check(not B.Status().enabled and B.CopyFrames()==nil,'v2 runtime starts disabled without inherited frames')
check(not B.Start(nonce:upper()),'v2 runtime refuses malformed browser nonce')
check(B.Start(nonce) and not B.Status().ready and B.OnEvent('GUILD_ROSTER_UPDATE')==nil,'session does not export cached unsolicited roster')
check(B.RequestSnapshot() and requestCount==1 and not B.Status().ready and not B.Display(),'native request cannot expose cached QR before requested update')
check(B.OnEvent('GUILD_ROSTER_UPDATE') and B.Status().ready and not B.Status().showing,'complete requested native roster requires separate QR display action')
local copy=B.CopyFrames();check(copy==table.concat(frames,'\n'),'native stable classes/ranks produce independently expected exact canonical frames')
check(not copy:find('SyntheticPrivatePerson',1,true) and not copy:find('private',1,true) and not copy:find(ownGuid,1,true),'names, notes, rank labels, zones and GUIDs never enter frames')
check(B.Display() and B.Status().showing,'v2 explicit display uses original owned QR encoder')
B.HideDisplay();check(B.Status().ready and not B.Status().showing,'hide clears display without extending or republishing snapshot')
mono=2;clock=clock+1;check(B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==copy and requestCount==1 and B.Status().snapshotAt==1792490000,'duplicate native event preserves exact original frames timestamp and original request count')
collect();rows[1].classFile='PALADIN';check(not B.OnEvent('GUILD_ROSTER_UPDATE') and not B.Status().ready,'changed distribution invalidates existing snapshot even when total and online stay fixed')
collect();rows[1].level=59;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'changed level band invalidates frames')
collect();rows[1].rankIndex=1;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'changed native rank distribution invalidates frames')
for _,field in ipairs({'classFile','level','rankIndex'}) do
  fixture(90);rows[2][field]=nil;assert(B.Start(nonce));assert(B.RequestSnapshot());check(B.OnEvent('GUILD_ROSTER_UPDATE') and B.Status().ready,'unknown native '..field..' withholds only its distribution without fabricating a bucket')
  check(B.CopyFrames()~=copy,'unknown native '..field..' changes payload checksum without exporting metadata')
end
fixture(70);for i,row in ipairs(rows) do row.classFile='WARRIOR';row.rankIndex=0;row.level=({1,10,20,30,40,50,60})[math.floor((i-1)/10)+1] end
assert(B.Start(nonce));assert(B.RequestSnapshot());check(B.OnEvent('GUILD_ROSTER_UPDATE'),'all seven native level band boundaries produce complete observation')
local actual=B.CopyFrames();local expected=sample();expected.members=70;expected.online=35;expected.classes={70,0,0,0,0,0,0,0,0};expected.levels=fill(7,10);expected.ranks={70,0,0,0,0,0,0,0,0,0}
check(actual==table.concat(B.Frames(B.Serialize(expected),nonce),'\n'),'all exact level boundaries and native positional orders match independent expected arrays')
fixture(90);rows[1].classFile='DEATHKNIGHT';assert(B.Start(nonce));assert(B.RequestSnapshot());check(B.OnEvent('GUILD_ROSTER_UPDATE'),'unknown expansion class withholds complete class dimension')
expected=sample();expected.classes=nil;check(B.CopyFrames()==table.concat(B.Frames(B.Serialize(expected),nonce),'\n'),'unsupported class cannot be mislabeled as a supported class')
fixture(90);rows[1].level=61;assert(B.Start(nonce));assert(B.RequestSnapshot());assert(B.OnEvent('GUILD_ROSTER_UPDATE'));expected=sample();expected.levels=nil;check(B.CopyFrames()==table.concat(B.Frames(B.Serialize(expected),nonce),'\n'),'out-of-scope level withholds whole dimension')
fixture(90);rows[1].rankIndex=10;assert(B.Start(nonce));assert(B.RequestSnapshot());assert(B.OnEvent('GUILD_ROSTER_UPDATE'));expected=sample();expected.ranks=nil;check(B.CopyFrames()==table.concat(B.Frames(B.Serialize(expected),nonce),'\n'),'out-of-scope rank withholds whole dimension')
for _,mutate in ipairs({function()rows[2].name=rows[1].name end,function()rows[2].name=nil end,function()rows[2].online=nil end,function()rows[1].guid=nil end,function()rows[2].guid=ownGuid end,function()onlineReported=44 end,function()rows[1].online=false;onlineReported=44 end}) do
  fixture(90);B.Start(nonce);B.RequestSnapshot();mutate();check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'original completeness and own-online-GUID guard refuses malformed native roster')
end
fixture(90);B.Start(nonce);offline=false;check(not B.RequestSnapshot() and requestCount==0,'native offline filter remains owner-controlled and is never toggled')
fixture(90);B.Start(nonce);B.RequestSnapshot();guild='Synthetic Other Guild';check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'changed pending own-guild identity refuses')
fixture(90);B.Start(nonce);B.RequestSnapshot();mutateDuringRead=function(i)if i==90 then mono=16 end end;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'monotonic request deadline also applies during native roster collection')
fixture(90);B.Start(nonce);B.RequestSnapshot();mutateDuringRead=function(i)if i==90 then clock=clock+1 end end;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and B.CopyFrames()==nil,'original exact server-second stability remains required during collection')
fixture(90);B.Start(nonce);B.RequestSnapshot();mono=16;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and not B.Status().ready,'stalled server clock cannot extend original 15-second request with monotonic progress')
fixture(90);B.Start(nonce);B.RequestSnapshot();clock=clock+15;check(not B.OnEvent('GUILD_ROSTER_UPDATE') and not B.Status().ready,'stalled monotonic clock cannot extend original wall request deadline')
collect();mono=61;B.Poll();check(not B.Status().ready and B.CopyFrames()==nil,'stalled server clock cannot extend original 60-second snapshot')
collect();clock=clock+60;B.Poll();check(not B.Status().ready and B.CopyFrames()==nil,'stalled monotonic clock cannot extend original wall snapshot deadline')
fixture(90);B.Start(nonce);mono=301;B.Poll();check(not B.Status().enabled,'stalled server clock cannot extend original 5-minute session')
fixture(90);B.Start(nonce);clock=clock+300;B.Poll();check(not B.Status().enabled,'stalled monotonic clock cannot extend original wall session deadline')
collect();mono=0.5;B.Poll();check(not B.Status().enabled and B.CopyFrames()==nil,'monotonic rollback clears all session output')
collect();clock=clock-1;B.Poll();check(not B.Status().enabled and B.CopyFrames()==nil,'server rollback still clears all session output')
for _,bad in ipairs({false,-1,2147483648,math.huge,0/0,'Synthetic private text'}) do fixture(90);GetTime=function()return bad end;check(not B.Start(nonce),'unreadable monotonic start refuses '..type(bad)) end
fixture(90);GetTime=nil;check(not B.Start(nonce),'missing monotonic API cannot arm a v2 session')
collect();GetTime=function()error('Synthetic private clock error')end;local ok=pcall(B.Poll);check(ok and not B.Status().enabled and B.CopyFrames()==nil,'throwing monotonic API clears output without exposing private error')
collect();combatState=true;B.Poll();check(not B.Status().enabled and B.CopyFrames()==nil,'combat immediately clears v2 session output')
for _,event in ipairs({'PLAYER_GUILD_UPDATE','PLAYER_ENTERING_WORLD','PLAYER_LEAVING_WORLD','PLAYER_LOGOUT','PLAYER_REGEN_DISABLED'}) do collect();B.OnEvent(event);check(not B.Status().enabled and B.CopyFrames()==nil,event..' clears all v2 scope and output') end
collect();check(B.Stop() and not B.Status().enabled and B.CopyFrames()==nil,'final explicit Stop clears v2 memory-only session')
check(A.Serialize(sample())==before and A.Frames(before,nonce)[1]:sub(1,6)=='OLCS1|','v1 canonical serializer and framing remain unchanged after full v2 runtime trials')
print(string.format('%d passed, 0 failed (additive Army v2, local synthetic addon only)',passed))

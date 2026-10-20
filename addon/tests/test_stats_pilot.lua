-- Synthetic own-guild fixtures only. Does not load installed addons or game files.
local passed=0
local function check(ok,label) if not ok then error('FAIL '..label) end;passed=passed+1;print('PASS '..label) end
dofile('../OlympusStatsPilot/Core.lua')
dofile('../OlympusStatsPilot/Libs/StatsPilotQr.lua')
local A=OlympusStatsPilot
local function hex(s) return (s:gsub('.',function(c)return string.format('%02x',c:byte())end)) end
check(hex(A.Sha256(''))=='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','SHA256 empty standard vector')
check(hex(A.Sha256('abc'))=='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','SHA256 abc standard vector')
check(hex(A.Sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))=='248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1','SHA256 multiblock standard vector')
check(A.Sha256(string.rep('x',1024))==nil,'SHA input cap rejects overflow')
for _,v in ipairs({{'',''},{'f','Zg'},{'fo','Zm8'},{'foo','Zm9v'},{'foob','Zm9vYg'},{'fooba','Zm9vYmE'},{'foobar','Zm9vYmFy'},{string.char(251,255,255),'-___'}}) do check(A.Base64url(v[1])==v[2],'base64url standard vector '..#v[1]) end
for n=1,4 do check(A.MaskCount(n)=='few','count '..n..' remains masked') end
check(A.MaskCount(0)==0 and A.MaskCount(5)==5 and A.MaskCount(1000)==1000,'zero and large counts remain precise')
check(A.MaskCount(-1)==nil and A.MaskCount(1001)==nil and A.MaskCount(2.5)==nil,'invalid counts refuse')
local sample={guild='OLYMPUS',realmGroup='Classic Beta PvP 2',faction='Alliance',observedAt=1792490000,members=10,online=2}
local canonical='{"format":"olympus-stat-observation-v1","scope":"own-guild","source":"volunteer-client","sourceVerified":false,"membershipProof":false,"addonVersion":"0.1.0","realmGroup":"Classic Beta PvP 2","faction":"Alliance","observedAt":1792490000,"guilds":[{"name":"OLYMPUS","receivedAt":1792490000,"reportedCharacters":10,"online":"few"}]}'
check(A.Serialize(sample)==canonical,'canonical exact fixed order and original snapshot times')
sample.online=nil;check(A.Serialize(sample):find('"online":null',1,true)~=nil,'unknown online stays null rather than zero')
sample.online=0;check(A.Serialize(sample):find('"online":0',1,true)~=nil,'reported zero is explicit')
sample.members=3;sample.online=1;local masked=A.Serialize(sample);check(masked:find('"reportedCharacters":"few","online":null',1,true)~=nil,'small total masks online to null without recovering member count')
for _,n in ipairs({0,1,4}) do sample.members=4;sample.online=n;check(A.Serialize(sample):find('"reportedCharacters":"few","online":null',1,true)~=nil,'small total suppresses online '..n) end
for _,case in ipairs({{6,5,'null'},{100,99,'null'},{100,96,'null'},{100,95,'95'},{5,5,'5'}}) do
  sample.members=case[1];sample.online=case[2]
  check(A.Serialize(sample):find('"online":'..case[3]..'}]}',1,true)~=nil,'complementary privacy '..case[1]..' total and '..case[2]..' online')
end
sample.members=10;sample.online=11;check(A.Serialize(sample)==nil,'online above complete roster refuses')
sample.online=2;sample.guild='O"L\\Y';check(A.Serialize(sample):find('O\\"L\\\\Y',1,true)~=nil,'canonical JSON escapes native quotes and backslashes')
sample.guild='OLYMPUS';sample.realmGroup='R\195\169alm';check(A.Serialize(sample)~=nil,'valid native UTF8 survives exact bytes')
for _,bad in ipairs({'',' leading','trailing ','Bad\nName',string.char(192,175),string.char(194,128),string.char(194,159),string.char(237,160,128),string.char(244,144,128,128),string.rep('x',129)}) do sample.guild=bad;check(A.Serialize(sample)==nil,'invalid or ambiguous native text refuses '..#bad) end
sample.guild='OLYMPUS';sample.realmGroup='Classic Beta PvP 2'
local nonce=string.rep('a',32)
local frames=A.Frames(canonical,nonce)
check(type(frames)=='table' and #frames==math.ceil(#canonical/75),'full payload split into exact 75-byte raw chunks')
check(frames[1]:sub(1,39)=='OLCS1|'..nonce..'|','distinct OLCS1 browser nonce framing')
local digest=A.Base64url(A.Sha256(canonical));check(#digest==43,'full SHA256 digest is 43 base64url characters')
for i,frame in ipairs(frames) do
  check(#frame<=191 and frame:sub(40,82)==digest,'part '..i..' repeats complete digest within QR cap')
  check(frame:sub(84,90)==string.format('%03d|%03d',i,#frames),'part '..i..' uses exact three-digit order and total')
  local matrix=OlympusStatsPilotQr.Encode(frame);check(matrix and matrix[0] and matrix[48][48]~=nil,'part '..i..' accepted by real fixed QR encoder')
end
local maximum=A.Frames(string.rep('x',1023),nonce);check(#maximum==14 and #maximum[1]==191,'maximum payload has14 parts and max191-byte frame')
check(A.Frames(string.rep('x',1024),nonce)==nil and A.Frames('',nonce)==nil,'multipart no truncation on empty or overflow')
check(A.Frames(canonical,nonce:upper())==nil and A.Frames(canonical,nonce..'a')==nil,'browser nonce exact lowercase32 only')
check(OlympusQr==nil,'pilot QR copy never creates verification QR namespace')

-- Runtime does not create native UI in this pure fixture. Every roster API below is synthetic.
CreateFrame=nil
local clock,wall,combatState,offline,inGuild,requestCount,guild,realm,faction,ownName,ownGuid,rows,onlineReported
local mutateDuringRead
local function fixture(n)
  clock=1792490000;wall=1;combatState=false;offline=true;inGuild=true;requestCount=0
  guild='OLYMPUS';realm='Classic Beta PvP 2';faction='Alliance';ownName='Reporter';ownGuid='Player-4613-00000001';rows={};onlineReported=1;mutateDuringRead=nil
  for i=1,n do rows[i]={name=i==1 and ownName or 'PrivatePerson'..i,guid=string.format('Player-4613-%08X',i),online=i==1} end
  GetServerTime=function()return clock end;GetTime=function()return wall end
  InCombatLockdown=function()return combatState end;IsInGuild=function()return inGuild end
  GetRealmName=function()return realm end;UnitName=function()return ownName,realm end
  UnitGUID=function()return ownGuid end
  UnitFactionGroup=function()return faction end;GetGuildInfo=function()return guild,'Rank never exported',7,realm end
  GetGuildRosterShowOffline=function()return offline end
  GetNumGuildMembers=function()return #rows,onlineReported end
  GetGuildRosterInfo=function(i)
    if mutateDuringRead then mutateDuringRead(i) end
    local row=rows[i];if not row then return nil end
    return row.name,'Private rank',7,60,'Mage','Private zone','Private public note','Private officer note',row.online,nil,nil,nil,nil,nil,nil,nil,row.guid
  end
  C_GuildInfo={GuildRoster=function()requestCount=requestCount+1 end};GuildRoster=nil
end
fixture(10)
dofile('../OlympusStatsPilot/OlympusStatsPilot.lua')
check(not A.Status().enabled and A.CopyFrames()==nil,'runtime starts OFF with no inherited session or frames')
check(not A.Start(nonce:upper()),'runtime refuses uppercase browser command')
check(A.Start(nonce) and A.Status().enabled and not A.Status().ready,'explicit browser nonce arms memory-only session')
check(A.OnEvent('GUILD_ROSTER_UPDATE')==nil and not A.Status().ready,'cached unsolicited roster event cannot export')
check(A.RequestSnapshot() and requestCount==1 and not A.Status().ready,'native request alone never exports cached rows')
check(not A.Display() and A.CopyFrames()==nil,'no QR or copy before native requested update')
check(A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().ready and not A.Status().showing,'requested complete native roster becomes ready but display requires separate click')
local copy=A.CopyFrames()
check(type(copy)=='string' and not copy:find('Private',1,true) and not copy:find('Reporter',1,true),'wire retains no character labels notes ranks zones or GUIDs')
check(A.Display() and A.Status().showing,'explicit display starts multipart QR')
wall=3;A.Poll();check(A.Status().showing,'active requested display cycles only within local session')
A.HideDisplay();check(not A.Status().showing and A.Status().ready,'hide stops display while ready local snapshot remains bounded')
A.OnEvent('GUILD_ROSTER_UPDATE');check(A.Status().ready and not A.Status().showing and requestCount==1,'unchanged later roster event revalidates without displaying or requesting')
local function ready(n)
  fixture(n or 10);assert(A.Start(nonce));assert(A.RequestSnapshot());assert(A.OnEvent('GUILD_ROSTER_UPDATE'))
end
fixture(10);A.Start(nonce);offline=false;check(not A.RequestSnapshot() and requestCount==0,'offline filter false holds and is never changed by request')
offline=true;GetGuildRosterShowOffline=nil;check(not A.RequestSnapshot(),'missing offline filter API holds')
fixture(10);A.Start(nonce);C_GuildInfo=nil;check(not A.RequestSnapshot(),'missing supported roster request holds')
fixture(10);A.Start(nonce);C_GuildInfo.GuildRoster=function()error('synthetic failure')end;check(not A.RequestSnapshot() and not A.Status().ready,'failed native request keeps no snapshot')
fixture(10);A.Start(nonce);A.RequestSnapshot();clock=clock+15;A.Poll();check(not A.Status().ready and not A.OnEvent('GUILD_ROSTER_UPDATE'),'original request expires at15seconds without exporting delayed event')
fixture(10);A.Start(nonce);A.RequestSnapshot();clock=clock+15;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().enabled and not A.Status().ready and A.CopyFrames()==nil and A.Status().message=='No complete roster update arrived within 15 seconds.','native event at exact15second request expiry preserves original refusal diagnosis')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[4].name=rows[3].name;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'duplicate native roster rows refuse')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[3].name=nil;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'unreadable roster label refuses partial snapshot')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[3].online=nil;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'unreadable native online field refuses')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[1].guid='Player-4613-000000FF';check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'missing exact own GUID row refuses')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[1].online=false;onlineReported=0;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'own offline row and contradictory online zero refuse')
fixture(10);A.Start(nonce);A.RequestSnapshot();onlineReported=2;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'native declared online and scanned online disagreement refuses')
check(A.Status().message=='Online count disagrees with readable rows (native 2; readable 1).','count-only diagnostic identifies scanned versus native online refusal')
fixture(10);A.Start(nonce);A.RequestSnapshot();local countReads=0;GetNumGuildMembers=function()countReads=countReads+1;return countReads==1 and 10 or 9,1 end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Roster size changed during collection (before 10; after 9).','exact roster size guard retains count-only diagnostic')
fixture(10);A.Start(nonce);A.RequestSnapshot();countReads=0;GetNumGuildMembers=function()countReads=countReads+1;return countReads==1 and 10 or 'PrivatePerson',1 end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Roster size changed during collection (before 10; after unreadable).','malformed native count cannot expose arbitrary text in diagnostics')
fixture(10);A.Start(nonce);A.RequestSnapshot();countReads=0;GetNumGuildMembers=function()countReads=countReads+1;return 10,countReads==1 and 1 or 2 end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Native online count changed during collection (before 1; after 2).','exact native online stability guard identifies failed operand')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==10 then offline=false end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Native Show Offline stopped exposing the full roster during collection.','exact native offline filter stability guard identifies refusal')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==10 then combatState=true end end;local refusedCombat=not A.OnEvent('GUILD_ROSTER_UPDATE');combatState=false;check(refusedCombat and A.Status().message=='Combat became active during collection.','exact final combat guard retains separate refusal')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==10 then clock=clock+1 end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Server clock changed during collection (start 1792490000; end 1792490001).','exact final server clock equality identifies its failed operand')
fixture(10);A.Start(nonce);A.RequestSnapshot();guild='Different';check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'guild scope change before update refuses')
check(A.Status().message=='The own-guild identity changed or no request is pending.' and not A.Status().ready and A.CopyFrames()==nil,'native event with changed pending identity retains separate identity refusal diagnosis')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==7 then guild='Changed mid-read' end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'guild scope change during rows refuses')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==7 then table.remove(rows) end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'roster size mutation refuses instead of exporting partial count')
fixture(1001);A.Start(nonce);A.RequestSnapshot();check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'native roster above1000 holds')
fixture(0);A.Start(nonce);A.RequestSnapshot();check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'native empty roster holds')
ready();clock=clock+60;A.Poll();check(not A.Status().ready and A.CopyFrames()==nil,'snapshot original60second deadline clears display and copy')
ready();clock=clock+300;A.Poll();check(not A.Status().enabled and not A.Status().ready,'session original5minute deadline turns pilot OFF')
check(A.Status().message=='Local session expired after 5 minutes. Start again from the browser.' and A.CopyFrames()==nil,'exact session expiry identifies its fixed category and keeps no output')
fixture(10);A.Start(nonce);clock=clock+299;A.Poll();check(A.Status().enabled and not A.Status().ready,'unexpired session remains armed at original299seconds without inventing a snapshot')
clock=clock+1;A.Poll();check(not A.Status().enabled and A.Status().message=='Local session expired after 5 minutes. Start again from the browser.','session refuses at exact original300seconds after last unexpired poll')
ready();clock=clock-1;A.Poll();check(not A.Status().enabled,'server clock rollback turns pilot OFF')
check(A.Status().message=='Server clock moved before the session start. Start again from the browser.' and A.CopyFrames()==nil,'pre-start rollback identifies its fixed category and clears original frames')
fixture(10);A.Start(nonce);clock=clock+10;A.Poll();clock=clock-1;A.Poll();check(not A.Status().enabled,'clock rollback after progress turns session OFF even above its start time')
check(A.Status().message=='Server clock moved backwards during the session. Start again from the browser.','progress rollback identifies its fixed category without clock values')
for _,bad in ipairs({false,0,-1,1.5,math.huge,0/0,'Private native text'}) do
  ready();GetServerTime=function()return bad end;A.Poll()
  check(not A.Status().enabled and not A.Status().ready and A.CopyFrames()==nil and A.Status().message=='Server clock is unreadable. Start again from the browser.','invalid native clock clears output with fixed diagnostic '..type(bad))
end
ready();GetServerTime=nil;A.Poll();check(not A.Status().enabled and not A.Status().ready and A.Status().message=='Server clock is unreadable. Start again from the browser.','missing native clock API clears output with fixed unreadable category')
ready();GetServerTime=function()return nil end;A.Poll();check(not A.Status().enabled and A.CopyFrames()==nil and A.Status().message=='Server clock is unreadable. Start again from the browser.','nil native clock clears output with fixed unreadable category')
fixture(10);A.Start(nonce);A.RequestSnapshot();clock=clock+300;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled and A.CopyFrames()==nil and A.Status().message=='Local session expired after 5 minutes. Start again from the browser.','native event at exact300second session expiry preserves original refusal diagnosis')
fixture(10);A.Start(nonce);A.RequestSnapshot();clock=clock-1;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled and A.CopyFrames()==nil and A.Status().message=='Server clock moved before the session start. Start again from the browser.','native event with pre-start rollback preserves original refusal diagnosis')
fixture(10);A.Start(nonce);A.RequestSnapshot();clock=clock+10;A.Poll();clock=clock-1;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled and A.CopyFrames()==nil and A.Status().message=='Server clock moved backwards during the session. Start again from the browser.','native event with progress rollback preserves original refusal diagnosis')
fixture(10);A.Start(nonce);A.RequestSnapshot();GetServerTime=function()return nil end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled and A.CopyFrames()==nil and A.Status().message=='Server clock is unreadable. Start again from the browser.','native event with unreadable clock preserves original refusal diagnosis')
ready();clock=clock+10;A.Poll();clock=clock-1;check(A.CopyFrames()==nil and not A.Status().enabled,'clock rollback after snapshot progress clears output even above its snapshot time')
fixture(10);A.Start(nonce);clock=clock+5;A.RequestSnapshot();A.OnEvent('GUILD_ROSTER_UPDATE');clock=clock+60;A.Poll();local expiredSnapshot=A.Status();clock=clock-1;A.Poll();check(expiredSnapshot.enabled and not expiredSnapshot.ready and not A.Status().enabled,'expiry clock read is retained so rollback165to164 cannot remain armed')
ready();combatState=true;A.Poll();check(not A.Status().enabled and A.CopyFrames()==nil,'combat clears session frames and copy')
ready();guild='Different guild';check(A.CopyFrames()==nil and not A.Status().enabled,'changed native guild scope clears output even before an event arrives')
ready();faction='Horde';check(not A.Display() and not A.Status().enabled,'changed native faction refuses old QR before an event arrives')
fixture(10);UnitName=function()return 'First','Last' end;rows[1].name='Completely Different Full Name';A.Start(nonce);A.RequestSnapshot();check(A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().ready,'exact native GUID selects own beta row without name or guessed realm concatenation')
fixture(10);UnitGUID=nil;check(not A.Start(nonce),'missing native UnitGUID API refuses session')
fixture(10);ownGuid=nil;check(not A.Start(nonce),'unreadable native player GUID refuses session')
for _,bad in ipairs({'Player-4613-BAD','Player-123456789-00000001','Creature-4613-00000001','Player-X-00000001'}) do fixture(10);ownGuid=bad;check(not A.Start(nonce),'malformed native player GUID refuses '..bad) end
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[1].guid=nil;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'missing own roster GUID never falls back to matching name')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[1].guid='Player-4613-BAD';check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'malformed own roster GUID never falls back to matching name')
fixture(10);A.Start(nonce);A.RequestSnapshot();rows[2].guid=ownGuid;rows[2].online=true;onlineReported=2;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().message=='Own online row check refused (matches 2; expected 1).','duplicate own GUID refuses even when names and totals remain readable')
fixture(10);A.Start(nonce);A.RequestSnapshot();ownGuid='Player-4613-000000FF';check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'native player GUID change before roster event refuses')
fixture(10);A.Start(nonce);A.RequestSnapshot();mutateDuringRead=function(i)if i==7 then ownGuid='Player-4613-000000FF' end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE'),'native player GUID change during rows refuses')
ready();ownGuid='Player-4613-000000FF';check(A.CopyFrames()==nil and not A.Status().enabled,'native player GUID change after snapshot clears frames before copy')
ready();ownGuid='Player-4613-000000FF';check(not A.Display() and not A.Status().enabled,'native player GUID change after snapshot refuses display')
ready();ownGuid='Player-4613-000000FF';A.Poll();check(not A.Status().enabled,'native player GUID change after snapshot is independently polled')
ready();local originalCopy=A.CopyFrames();local originalAt=A.Status().snapshotAt;clock=clock+10
local originalSerialize,originalFrames=A.Serialize,A.Frames
A.Serialize=function()error('Revalidation must never serialize')end;A.Frames=function()error('Revalidation must never regenerate frames')end
local unchanged=A.OnEvent('GUILD_ROSTER_UPDATE');A.Serialize,A.Frames=originalSerialize,originalFrames
check(unchanged and A.CopyFrames()==originalCopy and A.Status().snapshotAt==originalAt and not A.Status().showing and requestCount==1,'duplicate native event retains exact original bytes timestamp and display state without request or serialization')
clock=originalAt+60;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'duplicate event does not extend original60second snapshot cutoff')
ready();A.Display();local displayed=A.CopyFrames();clock=clock+1;check(A.OnEvent('GUILD_ROSTER_UPDATE') and A.Status().showing and A.CopyFrames()==displayed,'unchanged revalidation retains already explicit display without restarting it')
fixture(2);A.Start(nonce);A.RequestSnapshot();A.OnEvent('GUILD_ROSTER_UPDATE');rows[3]={name='PrivatePerson3',guid='Player-4613-00000003',online=false};check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.CopyFrames()==nil,'raw total2to3 invalidates even though both serialized totals would be masked')
fixture(10);rows[2].online=true;onlineReported=2;A.Start(nonce);A.RequestSnapshot();A.OnEvent('GUILD_ROSTER_UPDATE');rows[3].online=true;onlineReported=3;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'raw online2to3 invalidates even though both serialized online counts would be masked')
ready();rows[11]={name='PrivatePerson11',guid='Player-4613-0000000B',online=false};check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later complete but changed total clears original snapshot')
ready();GetGuildRosterInfo=function()error('Private unexpected native failure')end;local eventOK,result=pcall(A.OnEvent,'GUILD_ROSTER_UPDATE');check(eventOK and result==false and not A.Status().ready and A.Status().message=='Native roster read failed. No snapshot was kept.','native revalidation read error clears without exposing error text')
ready();rows[1].guid=nil;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later missing exact own GUID invalidates all old frames')
ready();ownGuid='Player-4613-000000FF';check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.CopyFrames()==nil,'later self GUID scope change refuses rather than renewing snapshot')
ready();guild='Changed guild';check(not A.OnEvent('GUILD_ROSTER_UPDATE') and A.CopyFrames()==nil,'later guild scope change clears original snapshot')
ready();offline=false;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later native offline filter failure clears rather than assuming completeness')
ready();rows[3].online=nil;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later incomplete row clears original snapshot')
ready();rows[3].name=rows[2].name;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later duplicate native rows fail original completeness guard')
ready();mutateDuringRead=function(i)if i==10 then clock=clock+1 end end;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().ready,'later event crossing a server second fails original within-read clock equality')
ready();clock=clock+10;A.Poll();clock=clock-1;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled,'later duplicate event cannot revive a rolled-back clock')
ready();combatState=true;check(not A.OnEvent('GUILD_ROSTER_UPDATE') and not A.Status().enabled,'later native event in combat cannot revalidate or renew data')
for _,event in ipairs({'PLAYER_GUILD_UPDATE','PLAYER_ENTERING_WORLD','PLAYER_LEAVING_WORLD','PLAYER_LOGOUT','PLAYER_REGEN_DISABLED'}) do ready();A.OnEvent(event);check(not A.Status().enabled and A.CopyFrames()==nil,event..' clears session and snapshot') end
ready();check(A.Stop() and not A.Status().enabled and A.CopyFrames()==nil,'explicit Stop clears all output')

-- Refusal-only clock measurements remain local scalars, never a fallback acceptance clock.
ready();check(A.Status().clockDiagnostic==nil,'a valid live snapshot produces no clock-refusal diagnostic')
clock=clock+10;wall=1.125;A.Poll();clock=clock-1;wall=1.250;A.Poll()
local clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic and clockDiagnostic.previousServerTime==1792490010 and clockDiagnostic.currentServerTime==1792490009 and clockDiagnostic.serverDeltaSeconds==-1 and clockDiagnostic.previousGetTimeMs==1125 and clockDiagnostic.currentGetTimeMs==1250 and clockDiagnostic.getTimeDeltaMs==125 and clockDiagnostic.providerReferenceStable==true and not A.Status().enabled and A.CopyFrames()==nil,'rollback retains exact prior/current server and local measurements without resuming output')
local clockKeys={previousServerTime=true,currentServerTime=true,previousGetTimeMs=true,currentGetTimeMs=true,serverDeltaSeconds=true,getTimeDeltaMs=true,providerReferenceStable=true}
local clockKeyCount=0
for key,value in pairs(clockDiagnostic) do assert(clockKeys[key] and (type(value)=='number' or type(value)=='boolean'));clockKeyCount=clockKeyCount+1 end
check(clockKeyCount==7,'clock diagnostic exposes only the seven bounded numeric and boolean fields')
clockDiagnostic.previousServerTime=0;clockDiagnostic.providerReferenceStable=false
check(A.Status().clockDiagnostic.previousServerTime==1792490010 and A.Status().clockDiagnostic.providerReferenceStable==true,'status returns a diagnostic copy rather than mutable internal state')
A.Stop();check(A.Status().clockDiagnostic==nil and not A.Status().enabled and A.CopyFrames()==nil,'explicit Stop clears the last diagnostic along with session and output')
fixture(10);A.Start(nonce);clock=clock-1;A.Poll();local hadDiagnostic=A.Status().clockDiagnostic~=nil;A.Start(nonce)
check(hadDiagnostic and A.Status().enabled and A.Status().clockDiagnostic==nil,'a deliberate new Start clears the prior refusal diagnostic')
fixture(10);wall=0;A.Start(nonce);clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic.previousGetTimeMs==0 and clockDiagnostic.currentGetTimeMs==0 and clockDiagnostic.getTimeDeltaMs==0,'zero local time is a valid diagnostic value rather than unknown')
fixture(10);wall=2147483647;A.Start(nonce);clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic.previousGetTimeMs==2147483647000 and clockDiagnostic.currentGetTimeMs==2147483647000,'local time at the diagnostic maximum remains an exactly bounded integer')
for _,bad in ipairs({false,-1,2147483648,math.huge,0/0,'Private local clock text'}) do
  fixture(10);GetTime=function()return bad end;A.Start(nonce);clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
  check(clockDiagnostic and clockDiagnostic.previousGetTimeMs==nil and clockDiagnostic.currentGetTimeMs==nil and clockDiagnostic.getTimeDeltaMs==nil and clockDiagnostic.currentServerTime==1792489999 and not A.Status().enabled,'invalid local diagnostic time stays unknown without changing native refusal '..type(bad))
end
fixture(10);GetTime=nil;A.Start(nonce);clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic and clockDiagnostic.previousGetTimeMs==nil and clockDiagnostic.currentGetTimeMs==nil and not A.Status().enabled,'missing GetTime does not replace or weaken the native rollback guard')
fixture(10);GetTime=function()return nil end;A.Start(nonce);clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic and clockDiagnostic.previousGetTimeMs==nil and clockDiagnostic.currentGetTimeMs==nil,'nil local time is omitted from the diagnostic rather than coerced')
fixture(10);GetTime=function()error('Private local diagnostic failure')end;A.Start(nonce);clock=clock-1;local clockPollOK=pcall(A.Poll);clockDiagnostic=A.Status().clockDiagnostic
check(clockPollOK and clockDiagnostic and clockDiagnostic.previousGetTimeMs==nil and clockDiagnostic.currentGetTimeMs==nil and not A.Status().enabled,'throwing local diagnostic API cannot interrupt the original native refusal or expose error text')
fixture(10);A.Start(nonce);GetServerTime=function()return 'Private native clock text' end;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic and clockDiagnostic.previousServerTime==1792490000 and clockDiagnostic.currentServerTime==nil and clockDiagnostic.serverDeltaSeconds==nil and clockDiagnostic.providerReferenceStable==false and A.Status().message=='Server clock is unreadable. Start again from the browser.','unreadable replacement provider exposes no raw return value or guessed native delta')
fixture(10);A.Start(nonce);GetServerTime=function()return clock end;clock=clock+1;A.Poll()
check(A.Status().enabled and A.Status().clockDiagnostic==nil,'provider reference measurement adds no new acceptance or refusal rule')
clock=clock-1;A.Poll();clockDiagnostic=A.Status().clockDiagnostic
check(clockDiagnostic and clockDiagnostic.serverDeltaSeconds==-1 and clockDiagnostic.providerReferenceStable==false and not A.Status().enabled,'later rollback records that the provider reference differs from the original session')
fixture(10);A.Start(nonce);clock=clock+1;wall=wall-0.5;A.Poll()
check(A.Status().enabled and A.Status().clockDiagnostic==nil,'local diagnostic time never replaces the unchanged server-clock acceptance guards')
A.Stop();check(A.Status().clockDiagnostic==nil,'final Stop leaves no retained clock measurement')
print(string.format('%d passed, 0 failed (local synthetic addon pilot only)',passed))

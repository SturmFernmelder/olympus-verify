local checks=0;local function check(b,m) if not b then error(m) end;checks=checks+1;print('PASS '..m) end
dofile('../OlympusVerify/Libs/OlympusQr.lua')
local matrix,err=OlympusQr.Encode('OLG1|'..string.rep('a',32)..'|'..string.rep('b',32)..'|Player-1234-00000002|Player-1234-00000001|1791660000|70205|16001|Other Member|OLYMPUS|Classic Beta PvP 2|7|1|Member')
check(matrix~=nil,err or 'fixed version8 observation encoded')
check(#matrix==48 and matrix[0]~=nil and matrix[48][48]~=nil,'exact49 by49 modules (zero based)')
check(OlympusQr.Encode(string.rep('x',192))~=nil,'192-byte capacity accepted')
check(OlympusQr.Encode(string.rep('x',193))==nil,'overflow refuses without truncation')
local frames={};local function object()return setmetatable({scripts={},visible=false,text=''},{__index=function(_,k)if k=='CreateTexture' or k=='CreateFontString' then return function()return object()end end;if k=='SetScript' then return function(self,n,f)self.scripts[n]=f end end;if k=='Show' then return function(self)self.visible=true end end;if k=='Hide' then return function(self)self.visible=false end end;if k=='SetText' then return function(self,s)self.text=s end end;return function()end end})end
local delegated,oldGuildCalls=0,0
local oldGuildSlash=function()oldGuildCalls=oldGuildCalls+1 end
CreateFrame=function()local f=object();frames[#frames+1]=f;return f end;UIParent={};SlashCmdList={OLYMPUS=oldGuildSlash,OLYMPUSVERIFY=function(message)delegated=delegated+1;return message end};DEFAULT_CHAT_FRAME={AddMessage=function()end};GetServerTime=function()return 1791660000 end
GetBuildInfo=function()return '1.60.1','70205','Oct 2 2026',16001 end;GetRealmName=function()return 'Classic Beta PvP 2'end
local rank,index='High Council',1;GetGuildInfo=function()return 'OLYMPUS',rank,index end;UnitGUID=function()return 'Player-1234-00000001'end
GetNumGuildMembers=function()return 1 end;GetGuildRosterInfo=function()return 'Other Member','Member',7,1,nil,nil,nil,nil,true,nil,nil,nil,nil,nil,nil,nil,'Player-1234-00000002'end
dofile('../OlympusVerify/OlympusVerifyBrowser.lua')
check(SLASH_OLYMPUSBROWSER1==nil and SlashCmdList.OLYMPUS==oldGuildSlash,'matching bridge preserves installed Olympus Guild /oly dispatcher')
check(SlashCmdList.OLYMPUSVERIFY('members Fern')=='members Fern' and delegated==1,'matching bridge delegates existing /olv roster commands without changing them')
check(SlashCmdList.OLYMPUSVERIFY(' browser '..string.rep('a',32)..' '),'matching bridge exposes normal browser command through existing /olv dispatcher')
OlympusVerifyPreview={State=function()return true end}
check(not SlashCmdList.OLYMPUSVERIFY('browser '..string.rep('a',32)),'matching bridge refuses browser capture while roster preview is enabled')
OlympusVerifyPreview=nil
check(OlympusVerifyBrowser.SetChallenge(string.rep('a',32)),'qualified councillor accepts ephemeral challenge')
check(OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other Member')==nil,'no stale cached roster admitted before native update')
frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE')
local wire=OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other Member')
check(type(wire)=='string' and wire:find('Other Member',1,true),'multiword authenticated whisper name retained')
check(OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other')==nil,'no truncated actor-name match')
rank='Officer';index=1;check(not OlympusVerifyBrowser.SetChallenge(string.rep('a',32)),'betaOfficer1 cannot enroll as HighCouncil')
rank='High Council';index=1;check(OlympusVerifyBrowser.SetChallenge(string.rep('a',32)),'challenge reset is explicit')
frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');GetServerTime=function()return 1791660061 end;check(OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other Member')==nil,'roster observation expires after sixty seconds')
GetServerTime=function()return 1791660100 end;OlympusVerifyBrowser.SetChallenge(string.rep('a',32));frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');frames[1].scripts.OnEvent(frames[1],'CHAT_MSG_WHISPER','!olympus '..string.rep('b',32),'Other Member')
GetServerTime=function()return 1791660161 end;frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');frames[1].scripts.OnUpdate();check(#frames==1,'old queued whisper cannot renew its receipt time or produce a fresh QR')
GetServerTime=function()return 1791660401 end;check(OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other Member')==nil,'challenge expiry closes observation')
-- B01-B11 local portions only. Backend/account/native admission and live game remain separate.
local betaNow=1791800000
local ownGuid,ownFirst,ownSecond,guildRealm,currentGuild,currentRealm,currentVersion,currentBuild,currentInterface,currentRank,currentIndex
local requesterName,requesterGuid,requesterRank,requesterIndex,requesterOnline,rosterCopies
local serial=0
local function nextNonce() serial=serial+1;return string.rep('a',24)..string.format('%08x',serial) end
local function envelope(nonce,created,expiry,windowStart,windowEnd)
 return table.concat({'OLG2C','B1',nonce,tostring(created),tostring(expiry),tostring(windowStart),tostring(windowEnd)},'|')
end
local function nativeBeta()
 betaNow=1791800000;ownGuid='Player-4613-005A70D8';ownFirst='Fern';ownSecond='Melder'
 guildRealm='ClassicBetaPvP';currentGuild='OLYMPUS';currentRealm='Classic Beta PvP 2';currentVersion='1.60.1';currentBuild='70338';currentInterface=16001;currentRank='Officer';currentIndex=1
 requesterName='Other Member';requesterGuid='Player-4613-005A70D9';requesterRank='Member';requesterIndex=3;requesterOnline=true;rosterCopies=1
 GetServerTime=function()return betaNow end;GetBuildInfo=function()return currentVersion,currentBuild,'Oct 9 2026',currentInterface end
 GetRealmName=function()return currentRealm end;GetGuildInfo=function()return currentGuild,currentRank,currentIndex,guildRealm end
 UnitName=function()return ownFirst,ownSecond end;UnitGUID=function()return ownGuid end
 GetNumGuildMembers=function()return rosterCopies end
 GetGuildRosterInfo=function()return requesterName,requesterRank,requesterIndex,1,nil,nil,nil,nil,requesterOnline,nil,nil,nil,nil,nil,nil,nil,requesterGuid end
end
local function betaReady()
 nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true),'beta fixture exact native setup')
 local n=nextNonce();local text=envelope(n,betaNow,betaNow+300,betaNow-60,betaNow+600)
 assert(OlympusVerifyBrowser.SetBetaChallenge(text),'beta fixture original envelope setup')
 frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');return text,n
end
local function observe()return OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),requesterName)end
nativeBeta()
check(not OlympusVerifyBrowser.SetBetaChallenge(envelope(nextNonce(),betaNow,betaNow+300,betaNow-60,betaNow+600)),'B01 beta mode is OFF by default')
check(not OlympusVerifyBrowser.SetChallenge(string.rep('a',32)),'B01 exact Fern Officer cannot enter old HC OLG1 path')
check(OlympusVerifyBrowser.Command==SlashCmdList.OLYMPUSBROWSER,'B02 selected beta command is registered without stealing the guild addon namespace')
check(OlympusVerifyBrowser.Command('browser beta enable'),'B02 explicit local enable accepts exact reported Fern/Melder tuple')
local initialNonce=nextNonce();local initialEnvelope=envelope(initialNonce,betaNow,betaNow+240,betaNow-60,betaNow+600)
check(OlympusVerifyBrowser.Command('browser beta '..initialEnvelope),'B02 exact seven-field absolute challenge accepted')
check(observe()==nil,'B02 beta waits for native roster update')
frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE')
local betaWire=observe();local parts={};for value in betaWire:gmatch('[^|]+') do parts[#parts+1]=value end
check(#parts==14 and parts[1]=='OLG2' and parts[2]==initialNonce and parts[7]=='70338' and parts[8]=='16001' and parts[13]=='B1','B06 exact14 slot OLG2 beta build and distinct B1 mode')
check(parts[4]==requesterGuid and parts[5]=='Player-4613-005A70D8' and parts[9]=='Other Member' and parts[12]=='3' and parts[14]=='Member','B06 native requester beta-five labels and distinct GUIDs retained')
check(#betaWire<=192 and OlympusQr.Encode(betaWire)~=nil,'B06 real fixed49x49 encoder accepts beta observation')
check(not OlympusVerifyBrowser.SetChallenge(initialNonce),'B06 beta enabled never reinterprets bare old OLG1 challenge as Officer')
local wrongNative={
 {'GUID',function()ownGuid='Player-4613-005A70DA'end},
 {'name',function()ownFirst='Other';ownSecond='Melder'end},
 {'guessed name realm',function()ownSecond='Classic Beta PvP 2'end},
 {'guild',function()currentGuild='OTHER'end},
 {'case changed guild',function()currentGuild='olympus'end},
 {'guild realm',function()guildRealm='Classic Beta PvP 2'end},
 {'missing guild realm',function()guildRealm=nil end},
 {'native realm',function()currentRealm='ClassicBetaPvP'end},
 {'version',function()currentVersion='1.60.2'end},
 {'build',function()currentBuild='70205'end},
 {'interface',function()currentInterface=16000 end},
 {'rank',function()currentRank='High Council'end},
 {'rank index',function()currentIndex=2 end},
}
for _,case in ipairs(wrongNative) do nativeBeta();case[2]();check(not OlympusVerifyBrowser.SetBetaEnabled(true),'B03 exact native beta '..case[1]..' mismatch refuses') end
nativeBeta();ownFirst='Fern Melder';ownSecond=nil
check(OlympusVerifyBrowser.SetBetaEnabled(true),'B02 literal complete native Fern Melder name accepted without suffix guessing')
check(not OlympusVerifyBrowser.SetBetaEnabled(1),'B04 malformed local enable never becomes true')
nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true))
check(not OlympusVerifyBrowser.SetBetaChallenge({nonce=nextNonce()}),'B04 table caller cannot supply envelope authority')
local malformed={
 function(n)return 'OLG2C|1|'..n..'|1791800000|1791800300|1791799940|1791800600'end,
 function(n)return 'OLG1C|B1|'..n..'|1791800000|1791800300|1791799940|1791800600'end,
 function(n)return envelope(n:upper(),1791800000,1791800300,1791799940,1791800600)end,
 function(n)return envelope(n,1791800000,1791800300,1791799940,1791800600)..'|extra'end,
 function(n)return envelope(n,1791800000,1791800300,1791799940,1791800600)..'|G|n'end,
 function(n)return envelope(n,1791800001,1791800300,1791799940,1791800600)end,
 function(n)return envelope(n,1791799699,1791800000,1791799600,1791800600)end,
 function(n)return envelope(n,1791800000,1791800301,1791799940,1791800600)end,
 function(n)return envelope(n,1791800000,1791800300,1791800001,1791800600)end,
 function(n)return envelope(n,1791800000,1791800300,1791799940,1791886341)end,
 function(n)return envelope(n,1791800000,1791800300,1791799940,1791800200)end,
 function(n)return ' '..envelope(n,1791800000,1791800300,1791799940,1791800600)end,
}
for i,build in ipairs(malformed) do nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true));check(not OlympusVerifyBrowser.SetBetaChallenge(build(nextNonce())),'B04/B05 malformed or nonoriginal absolute envelope '..i..' refuses') end
local fixedEnvelope,fixedNonce=betaReady();betaNow=betaNow+120
check(OlympusVerifyBrowser.SetBetaChallenge(fixedEnvelope),'B05 identical active copied envelope retained without restarting its clock')
betaNow=1791800300
check(observe()==nil,'B05 original absolute challenge cutoff closes observation after recopy')
nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true))
check(not OlympusVerifyBrowser.SetBetaChallenge(fixedEnvelope),'B05 expired or cleared original nonce never re-arms')
local unchangedEnvelope,unchangedNonce=betaReady()
check(not OlympusVerifyBrowser.SetBetaChallenge(envelope(unchangedNonce,betaNow,betaNow+299,betaNow-60,betaNow+600)),'B05 same original nonce with rewritten deadlines refuses')
betaReady()
check(not OlympusVerifyBrowser.SetBetaChallenge(envelope(nextNonce(),betaNow,betaNow+300,betaNow-60,betaNow+601)),'B05 changing attended window while active closes local mode')
nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true));local shortNonce=nextNonce()
check(OlympusVerifyBrowser.SetBetaChallenge(envelope(shortNonce,betaNow,betaNow+20,betaNow-86380,betaNow+20)),'B05 exact86400 attended window and shorter exception-bound challenge accepted')
frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');betaNow=betaNow+20
check(observe()==nil,'B05 original exception expiry closes challenge without local extension')
betaReady();betaNow=betaNow-1;frames[1].scripts.OnUpdate()
check(observe()==nil,'B05 clock rollback before original creation clears local beta custody')
local labels={[0]='Guild Master','Officer','Veteran','Member','Initiate'}
for i=0,4 do betaReady();requesterRank=labels[i];requesterIndex=i;local w=observe();check(w and w:sub(-#labels[i])==labels[i],'B06 exact beta-five requester ordinal '..i..' retains true label') end
betaReady();requesterRank='Member';requesterIndex=7
check(observe()==nil,'B06 ten-rank requester Member7 cannot enter beta-five wire')
betaReady();requesterRank='High Council';requesterIndex=1
check(observe()==nil,'B06 native HC1 cannot be mislabelled beta Officer1')
betaReady();requesterIndex=3.5
check(observe()==nil,'B06 fractional requester rank refuses')
betaReady();requesterGuid=ownGuid
check(observe()==nil,'B08 signer GUID cannot verify self under distinct sender name')
betaReady();requesterGuid='Player-4613-BAD'
check(observe()==nil,'B08 malformed requester GUID refuses')
betaReady();requesterOnline=false
check(observe()==nil,'B08 offline requester never produces observation')
betaReady();rosterCopies=2
check(observe()==nil,'B08 duplicate matching native roster sender does not select first row')
betaReady()
check(OlympusVerifyBrowser.Observe('!olympus '..string.rep('b',32),'Other')==nil,'B08 beta preserves complete native requester name instead of truncation')
betaReady();requesterName='Bad|Member'
check(observe()==nil,'B08 delimiter in native requester name refuses')
betaReady();requesterName='Bad\nMember'
check(observe()==nil,'B08 control in native requester name refuses')
betaReady();requesterName=string.rep('x',61)
check(observe()==nil,'B06 oversize requester name refuses before wire')
betaReady();requesterName=string.rep('x',60);local longWire=observe()
check(longWire and #longWire>192 and #longWire<=512 and longWire:find(requesterName,1,true) and OlympusQr.Encode(longWire)==nil,'B06 complete bounded long-name observation uses manual fallback without truncation')
local function displayBeta()
 betaReady();frames[1].scripts.OnEvent(frames[1],'CHAT_MSG_WHISPER','!olympus '..string.rep('b',32),requesterName);frames[1].scripts.OnUpdate()
 assert(frames[2] and frames[2].visible and frames[2].copy.text~='','beta display fixture setup');return frames[2]
end
local display=displayBeta()
check(display.title.text=='Olympus · Fern beta membership' and display.note.text:find('Membership verification only',1,true),'B09 local beta display states membership purpose and browser-held key')
local drift={
 {'GUID',function()ownGuid='Player-4613-005A70DA'end},
 {'name',function()ownFirst='Other'end},
 {'rank',function()currentRank='Veteran'end},
 {'rank index',function()currentIndex=2 end},
 {'build',function()currentBuild='70339'end},
 {'interface',function()currentInterface=16000 end},
 {'guild',function()currentGuild='OTHER'end},
 {'realm',function()currentRealm='Other realm'end},
 {'guild realm',function()guildRealm=nil end},
}
for _,case in ipairs(drift) do display=displayBeta();case[2]();frames[1].scripts.OnUpdate();check(not display.visible and display.copy.text=='' and observe()==nil,'B09 active native '..case[1]..' drift clears display and local queues') end
display=displayBeta();betaNow=1791800300;frames[1].scripts.OnUpdate()
check(not display.visible and display.copy.text=='' and observe()==nil,'B09 original beta expiry hides display and clears queues')
display=displayBeta();frames[1].scripts.OnEvent(frames[1],'PLAYER_GUILD_UPDATE')
check(not display.visible and display.copy.text=='' and observe()==nil,'B09 guild event closes beta queues')
display=displayBeta();frames[1].scripts.OnEvent(frames[1],'PLAYER_LOGOUT')
check(not display.visible and display.copy.text=='' and not OlympusVerifyBrowser.SetBetaChallenge(envelope(nextNonce(),betaNow,betaNow+300,betaNow-60,betaNow+600)),'B09 logout disables beta until new explicit enable')
display=displayBeta();check(OlympusVerifyBrowser.Command('browser beta off') and not display.visible and display.copy.text=='','B09 explicit reachable beta off clears complete display custody')
nativeBeta();currentRank='High Council';currentIndex=1;currentBuild='70205'
check(OlympusVerifyBrowser.SetChallenge(string.rep('a',32)),'B01 normal HC70205 remains available after beta off')
requesterRank='Member';requesterIndex=7;frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');local normalWire=observe()
check(normalWire and normalWire:sub(1,5)=='OLG1|' and normalWire:find('|70205|16001|Other Member|OLYMPUS|Classic Beta PvP 2|7|1|Member',1,true),'B01 normal OLG1 fourteen-slot observation retains exact prior profile and labels')
-- v2 finite closure cases: no active challenge, final roster cutoff/drift, no late requeue.
nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true));currentBuild='70339';frames[1].scripts.OnUpdate();currentBuild='70338'
check(not OlympusVerifyBrowser.SetBetaChallenge(envelope(nextNonce(),betaNow,betaNow+300,betaNow-60,betaNow+600)),'B09 enabled opt-in without challenge closes on update build drift')
nativeBeta();assert(OlympusVerifyBrowser.SetBetaEnabled(true));currentRank='Veteran';frames[1].scripts.OnEvent(frames[1],'GUILD_ROSTER_UPDATE');currentRank='Officer'
check(not OlympusVerifyBrowser.SetBetaChallenge(envelope(nextNonce(),betaNow,betaNow+300,betaNow-60,betaNow+600)),'B09 enabled opt-in without challenge closes on native event rank drift')
betaReady();GetGuildRosterInfo=function()betaNow=1791800300;return requesterName,requesterRank,requesterIndex,1,nil,nil,nil,nil,requesterOnline,nil,nil,nil,nil,nil,nil,nil,requesterGuid end
check(observe()==nil,'B05 final native roster scan crossing original absolute cutoff refuses wire')
betaReady();GetGuildRosterInfo=function()ownGuid='Player-4613-005A70DA';return requesterName,requesterRank,requesterIndex,1,nil,nil,nil,nil,requesterOnline,nil,nil,nil,nil,nil,nil,nil,requesterGuid end
check(observe()==nil,'B03 final native GUID drift during requester roster scan refuses wire')
betaReady();local frozenWire=observe();local frozenParts={};for value in frozenWire:gmatch('[^|]+') do frozenParts[#frozenParts+1]=value end
check(frozenParts[6]==tostring(betaNow),'B06 wire serializes the single final native observation timestamp')
display=displayBeta();betaNow=betaNow+5;frames[1].scripts.OnEvent(frames[1],'CHAT_MSG_WHISPER','!olympus '..string.rep('c',32),requesterName)
GetGuildRosterInfo=function()betaNow=1791800300;return requesterName,requesterRank,requesterIndex,1,nil,nil,nil,nil,requesterOnline,nil,nil,nil,nil,nil,nil,nil,requesterGuid end
frames[1].scripts.OnUpdate()
check(not display.visible and display.copy.text=='' and observe()==nil,'B09 final displayed-queue cutoff clears custody without reopening or requeueing')
print(tostring(checks)..' browser bridge checks passed')

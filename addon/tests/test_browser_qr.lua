local function check(b,m) if not b then error(m) end print('PASS '..m) end
dofile('../OlympusVerify/Libs/OlympusQr.lua')
local matrix,err=OlympusQr.Encode('OLG1|'..string.rep('a',32)..'|'..string.rep('b',32)..'|Player-1234-00000002|Player-1234-00000001|1791660000|70205|16001|Other Member|OLYMPUS|Classic Beta PvP 2|7|1|Member')
check(matrix~=nil,err or 'fixed version8 observation encoded')
check(#matrix==48 and matrix[0]~=nil and matrix[48][48]~=nil,'exact49 by49 modules (zero based)')
check(OlympusQr.Encode(string.rep('x',192))~=nil,'192-byte capacity accepted')
check(OlympusQr.Encode(string.rep('x',193))==nil,'overflow refuses without truncation')
local frames={};local function object()return setmetatable({scripts={}},{__index=function(_,k)if k=='CreateTexture' or k=='CreateFontString' then return function()return object()end end;if k=='SetScript' then return function(self,n,f)self.scripts[n]=f end end;return function()end end})end
CreateFrame=function()local f=object();frames[#frames+1]=f;return f end;UIParent={};SlashCmdList={};DEFAULT_CHAT_FRAME={AddMessage=function()end};GetServerTime=function()return 1791660000 end
GetBuildInfo=function()return '1.60.1','70205','Oct 2 2026',16001 end;GetRealmName=function()return 'Classic Beta PvP 2'end
local rank,index='High Council',1;GetGuildInfo=function()return 'OLYMPUS',rank,index end;UnitGUID=function()return 'Player-1234-00000001'end
GetNumGuildMembers=function()return 1 end;GetGuildRosterInfo=function()return 'Other Member','Member',7,1,nil,nil,nil,nil,true,nil,nil,nil,nil,nil,nil,nil,'Player-1234-00000002'end
dofile('../OlympusVerify/OlympusVerifyBrowser.lua')
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
print('13/13 browser bridge checks passed')

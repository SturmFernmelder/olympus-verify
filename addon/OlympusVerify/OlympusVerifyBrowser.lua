-- Browser attestation bridge. The browser owns/signs with the private key.
-- Owner exception (12 October 2026): exact attended Fern beta mode, OFF after reload.
-- The copied beta envelope is a local bound, never Discord/account/server authority.
-- Requests remain local/online; no claim that offline signers process whispers.
OlympusVerifyBrowser = {}
local challenge,expires,window,tiles=nil,0,nil,{}
local rosterFreshAt,refreshAt,displayUntil=nil,0,0
local pending,displayQueue={},{}
local betaEnabled,mode,betaEnvelope=false,'1',nil
local challengeCreated,exceptionCreated,exceptionExpires=nil,nil,nil
local betaNonces,betaNonceCount={},0 -- bounded memory only; no SavedVariables or key
local betaRanks={[0]='Guild Master','Officer','Veteran','Member','Initiate'}
local function say(s) if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage('|cffd4af37Olympus browser:|r '..s) end end
local function clock() return GetServerTime and GetServerTime() or time() end
local function clear(disableBeta)
 challenge=nil;expires=0;rosterFreshAt=nil;pending={};displayQueue={};displayUntil=0
 mode='1';betaEnvelope=nil;challengeCreated=nil;exceptionCreated=nil;exceptionExpires=nil
 if disableBeta then betaEnabled=false end
 if window then window:Hide();window.copy:SetText('') end;for _,t in ipairs(tiles) do t:Hide() end
end
local function refresh()
 if clock()-refreshAt<10 then return end;refreshAt=clock()
 if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
end
local function normalProfile()
 local _,build,_,interface=GetBuildInfo();local guild,rank,index=GetGuildInfo('player')
 return type(guild)=='string' and guild:upper()=='OLYMPUS' and GetRealmName()=='Classic Beta PvP 2' and tonumber(build)==70205 and interface==16001 and rank=='High Council' and index==1
end
local function betaProfile()
 local version,build,_,interface=GetBuildInfo();local guild,rank,index,guildRealm=GetGuildInfo('player')
 if type(UnitName)~='function' or type(UnitGUID)~='function' then return false end
 local first,second=UnitName('player')
 -- These are the exact owner-reported tuple or full name, not a guessed realm suffix.
 local ownName=(first=='Fern' and second=='Melder') or (first=='Fern Melder' and (second==nil or second==''))
 return ownName and UnitGUID('player')=='Player-4613-005A70D8' and guild=='OLYMPUS'
 and guildRealm=='ClassicBetaPvP' and GetRealmName()=='Classic Beta PvP 2'
 and version=='1.60.1' and tonumber(build)==70338 and interface==16001 and rank=='Officer' and index==1
end
local function profile() return mode=='B1' and betaEnabled and betaProfile() or mode=='1' and normalProfile() end
local function betaClock(value) return type(value)=='number' and value>=1000000000 and value<=9999999999 and value==math.floor(value) end
local function betaGuid(value)
 if type(value)~='string' then return false end
 local realm=value:match('^Player%-(%d+)%-%x%x%x%x%x%x%x%x$')
 return realm~=nil and #realm<=8
end
function OlympusVerifyBrowser.SetChallenge(text)
 if type(text)~='string' or not text:match('^[0-9a-f]+$') or #text~=32 then clear(true);return false,'Expected the exact 32-character browser challenge' end
 if not normalProfile() then clear(true);return false,'Requires this client profile and native High Council rank (index 1)' end
 clear(true);challenge=text;expires=clock()+300;refresh();return true
end
function OlympusVerifyBrowser.SetBetaEnabled(enabled)
 clear(true)
 if enabled==false then return true,'Fern beta mode is off' end
 if enabled~=true or not betaProfile() then return false,'Requires the exact attended Fern beta character and client profile' end
 betaEnabled=true;return true,'Fern beta mode enabled locally; copy the original challenge from your qualified browser'
end
function OlympusVerifyBrowser.SetBetaChallenge(text)
 if not betaEnabled or not betaProfile() then clear(true);return false,'Enable the exact attended Fern beta mode first' end
 local nonce,created,expiry,windowStart,windowEnd
 if type(text)=='string' and #text<=128 then nonce,created,expiry,windowStart,windowEnd=text:match('^OLG2C|B1|([0-9a-f]+)|(%d+)|(%d+)|(%d+)|(%d+)$') end
 local function seconds(v) if type(v)~='string' or #v~=10 then return nil end;local n=tonumber(v);return betaClock(n) and n or nil end
 created,expiry,windowStart,windowEnd=seconds(created),seconds(expiry),seconds(windowStart),seconds(windowEnd)
 local current=clock()
 if not nonce or #nonce~=32 or not created or not expiry or not windowStart or not windowEnd or not betaClock(current)
 or windowStart>created or windowEnd<=windowStart or windowEnd>windowStart+86400
 or created>current or expiry<=current or expiry<=created or expiry>created+300 or expiry>windowEnd then
 clear(true);return false,'Expected the complete original beta challenge and fixed absolute deadlines' end
 -- Re-copying an active identical envelope preserves its queues and original clocks.
 -- A cleared/expired nonce or changed envelope never starts a new local lease.
 if betaNonces[nonce] then
 if challenge==nonce and mode=='B1' and betaEnvelope==text then return true end
 clear(true);return false,'That original beta challenge cannot be renewed; obtain a new challenge' end
 if betaNonceCount>=256 then clear(true);return false,'Local beta challenge history is full; close this attended session' end
 if mode=='B1' and (exceptionCreated~=windowStart or exceptionExpires~=windowEnd) then
 clear(true);return false,'The original attended window changed; enable a new session explicitly' end
 clear();betaNonces[nonce]=text;betaNonceCount=betaNonceCount+1;mode='B1';betaEnvelope=text
 challenge=nonce;challengeCreated=created;expires=expiry;exceptionCreated=windowStart;exceptionExpires=windowEnd;refresh();return true
end
local function rosterSender(sender)
 -- Compare complete names; no cut-at-hyphen or whitespace removal.
 if type(sender)~='string' then return nil end
 local found
 for i=1,GetNumGuildMembers() do
 local name,rank,index,_,_,_,_,_,online,_,_,_,_,_,_,_,guid=GetGuildRosterInfo(i)
 if type(name)=='string' and (name==sender or name..'-'..GetRealmName()==sender) then
 if not online or type(guid)~='string' or type(index)~='number' or index<0 or index>9 then return nil end
 if mode=='B1' then
 if online~=true or not betaGuid(guid) or index~=math.floor(index) or betaRanks[index]~=rank or #name>60 or name:find('[%z%c|]') or found then return nil end
 found={name,guid,index,rank}
 else return name,guid,index,rank end
 end end
 if found then return unpack(found) end
end
function OlympusVerifyBrowser.Observe(message,sender)
 if not challenge or clock()>=expires or mode=='B1' and clock()<challengeCreated then clear(mode=='B1');return nil,'Browser challenge expired or clock changed' end
 if not profile() then clear(mode=='B1');return nil,'Signer/native profile changed' end
 if not rosterFreshAt or clock()<rosterFreshAt or clock()-rosterFreshAt>60 then refresh();return nil,'Waiting for a fresh native guild roster' end
 local code=type(message)=='string' and message:match('^!olympus ([0-9a-f]+)$')
 if not code or #code~=32 then return nil,'Not an Olympus browser request' end
 local name,guid,index,rank=rosterSender(sender);local own=UnitGUID('player')
 if not name or not own or own==guid or name:find('|',1,true) then return nil,'Requester must be a distinct online guild roster member' end
 local beta=mode=='B1'
 -- Roster scanning can cross a cutoff or native profile change; freeze one final time.
 if beta and (not betaEnabled or not betaProfile() or own~='Player-4613-005A70D8') then clear(true);return nil,'Beta native profile changed during observation' end
 local observedAt=clock()
 if beta and (not betaClock(observedAt) or observedAt<challengeCreated or observedAt>=expires) then clear(true);return nil,'Original beta observation deadline ended' end
 local wire=table.concat({beta and 'OLG2' or 'OLG1',challenge,code,guid,own,tostring(observedAt),beta and '70338' or '70205','16001',name,'OLYMPUS','Classic Beta PvP 2',tostring(index),beta and 'B1' or '1',rank},'|')
 if #wire>512 then return nil,'Observation exceeds the manual-copy bound' end
 return wire
end
local function show(wire)
 if not window then
 window=CreateFrame('Frame',nil,UIParent,'BasicFrameTemplateWithInset');window:SetSize(410,460);window:SetPoint('CENTER');window:SetMovable(true);window:EnableMouse(true);window:RegisterForDrag('LeftButton');window:SetScript('OnDragStart',window.StartMoving);window:SetScript('OnDragStop',window.StopMovingOrSizing)
 window.title=window:CreateFontString(nil,'OVERLAY','GameFontNormal');window.title:SetPoint('TOP',0,-8);window.title:SetText('Olympus · browser attestation')
 window.copy=CreateFrame('EditBox',nil,window,'InputBoxTemplate');window.copy:SetSize(370,35);window.copy:SetPoint('BOTTOM',0,18);window.copy:SetAutoFocus(false);window.copy:SetScript('OnEscapePressed',function(self)self:ClearFocus()end)
 window.note=window:CreateFontString(nil,'OVERLAY','GameFontNormalSmall');window.note:SetPoint('BOTTOM',0,62);window.note:SetWidth(365)
 local bg=window:CreateTexture(nil,'BACKGROUND');bg:SetColorTexture(1,1,1,1);bg:SetPoint('TOPLEFT',window,'TOPLEFT',25,-38);bg:SetSize(342,342)
 end
 window.title:SetText(mode=='B1' and 'Olympus · Fern beta membership' or 'Olympus · browser attestation')
 for _,t in ipairs(tiles) do t:Hide() end
 window.copy:SetText(wire);window.copy:HighlightText();local matrix,error=OlympusQr.Encode(wire)
 if matrix then
 local k=0;for y=0,48 do for x=0,48 do if matrix[y][x] then k=k+1;local t=tiles[k];if not t then t=window:CreateTexture(nil,'ARTWORK');t:SetColorTexture(0,0,0,1);tiles[k]=t end;t:ClearAllPoints();t:SetPoint('TOPLEFT',window,'TOPLEFT',49+x*6,-62-y*6);t:SetSize(6,6);t:Show() end end end
 window.note:SetText(mode=='B1' and 'Scan in your enrolled Fern beta browser. Membership verification only; the browser signs. This AddOn holds no key.' or 'Scan in your enrolled councillor browser. The browser signs; this AddOn holds no key.')
 else window.note:SetText(error..'. Copy the complete text below to the browser.') end
 window:Show()
end
local function enqueue(message,sender,observedAt)
 if #pending+#displayQueue>=10 then say('Local ten-observation queue full; member may whisper again after it drains');return end
 local code=message:match('^!olympus ([0-9a-f]+)$');if not code or #code~=32 then return end
 for _,r in ipairs(pending) do if r.code==code then return end end;for _,r in ipairs(displayQueue) do if r.code==code then return end end
 pending[#pending+1]={message=message,sender=sender,code=code,at=observedAt or clock()};refresh()
end
local function collect()
 if not rosterFreshAt or clock()-rosterFreshAt>60 then refresh();return end
 local before=pending;pending={};for _,r in ipairs(before) do if clock()-r.at<=60 then local wire=OlympusVerifyBrowser.Observe(r.message,r.sender);if wire then displayQueue[#displayQueue+1]=r end end end
end
local frame=CreateFrame('Frame');frame:RegisterEvent('CHAT_MSG_WHISPER');frame:RegisterEvent('GUILD_ROSTER_UPDATE');frame:RegisterEvent('PLAYER_LOGOUT');frame:RegisterEvent('PLAYER_GUILD_UPDATE')
frame:SetScript('OnEvent',function(_,event,message,sender)
 if betaEnabled and not challenge and not betaProfile() then clear(true);return end
 if challenge and (not profile() or mode=='B1' and clock()<challengeCreated) then clear(mode=='B1');return end
 if event=='GUILD_ROSTER_UPDATE' then if challenge then rosterFreshAt=clock();collect() end;return end
 if event~='CHAT_MSG_WHISPER' then clear(true);return end
 if challenge and type(message)=='string' and message:match('^!olympus ') then enqueue(message,sender);collect() end
end)
frame:SetScript('OnUpdate',function()
 if betaEnabled and not challenge and not betaProfile() then clear(true);return end
 if challenge and (clock()>=expires or not profile() or mode=='B1' and clock()<challengeCreated) then clear(mode=='B1');return end
 if challenge and #pending>0 then collect() end
 if challenge and clock()>=displayUntil and #displayQueue>0 then local r=table.remove(displayQueue,1);if clock()<r.at or clock()-r.at>60 then say('Queued whisper expired; the member may send its still-valid code again') else local wire,reason=OlympusVerifyBrowser.Observe(r.message,r.sender);if wire then show(wire);displayUntil=clock()+5 else if challenge then enqueue(r.message,r.sender,r.at) end;say(reason) end end end
end)
function OlympusVerifyBrowser.Command(message)
 if OlympusVerifyPreview and OlympusVerifyPreview.State and OlympusVerifyPreview.State() then say('Leave preview before starting a browser observation.');return false end
 if type(message)~='string' then return false end
 if message=='browser beta enable' then local ok,reason=OlympusVerifyBrowser.SetBetaEnabled(true);say(reason);return ok end
 if message=='browser beta off' then local ok,reason=OlympusVerifyBrowser.SetBetaEnabled(false);say(reason);return ok end
 local envelope=message:match('^browser beta (.+)$')
 if envelope then local ok,reason=OlympusVerifyBrowser.SetBetaChallenge(envelope);say(ok and 'Original beta challenge ready; keep this game and qualified browser open.' or reason);return ok end
 local code=message:match('^browser ([0-9a-f]+)$');if not code then say('Use /olv browser <challenge>, or /olv browser beta enable then /olv browser beta <original envelope>. /olv browser beta off closes beta mode. Members whisper !olympus <code>.');return false end
 local ok,reason=OlympusVerifyBrowser.SetChallenge(code);say(ok and 'Challenge ready for five minutes; keep this game and browser open.' or reason);return ok
end
SlashCmdList.OLYMPUSBROWSER=OlympusVerifyBrowser.Command
-- Preserve the accepted roster panel's /olv dispatcher and Olympus Guild's /oly alias.
local function olympusInstalled()
 if type(SlashCmdList.OLYMPUS)=='function' then return true end
 local exists=C_AddOns and C_AddOns.DoesAddOnExist
 if type(exists)=='function' then local ok,yes=pcall(exists,'Olympus');return not ok or yes~=false end
 local info=(C_AddOns and C_AddOns.GetAddOnInfo) or GetAddOnInfo
 if type(info)=='function' then local ok,name=pcall(info,'Olympus');return not ok or name~=nil end
 return true
end
if not olympusInstalled() then SLASH_OLYMPUSBROWSER1='/oly' end
local previousSlash=SlashCmdList.OLYMPUSVERIFY
if type(previousSlash)=='function' then
 SlashCmdList.OLYMPUSVERIFY=function(message,...)
  if type(message)=='string' and (message:match('^%s*browser[%s]') or message:match('^%s*browser%s*$')) then return OlympusVerifyBrowser.Command(message:match('^%s*(.-)%s*$')) end
  return previousSlash(message,...)
 end
end
OlympusVerifyBrowser.Clear=function() clear(true) end

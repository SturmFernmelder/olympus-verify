-- Councillor-only browser attestation bridge. The browser owns/signs with the private key.
-- Requests remain local/online; no claim that offline councillors process whispers.
OlympusVerifyBrowser = {}
local challenge,expires,window,tiles=nil,0,nil,{}
local rosterFreshAt,refreshAt,displayUntil=nil,0,0
local pending,displayQueue={},{}
local function say(s) if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage('|cffd4af37Olympus browser:|r '..s) end end
local function clock() return GetServerTime and GetServerTime() or time() end
local function clear() challenge=nil;expires=0;rosterFreshAt=nil;pending={};displayQueue={};displayUntil=0;if window then window:Hide();window.copy:SetText('') end;for _,t in ipairs(tiles) do t:Hide() end end
local function refresh()
 if clock()-refreshAt<10 then return end;refreshAt=clock()
 if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster() elseif GuildRoster then GuildRoster() end
end
local function profile()
 local _,build,_,interface=GetBuildInfo();local guild,rank,index=GetGuildInfo('player')
 return type(guild)=='string' and guild:upper()=='OLYMPUS' and GetRealmName()=='Classic Beta PvP 2' and tonumber(build)==70205 and interface==16001 and rank=='High Council' and index==1
end
function OlympusVerifyBrowser.SetChallenge(text)
 if type(text)~='string' or not text:match('^[0-9a-f]+$') or #text~=32 then clear();return false,'Expected the exact 32-character browser challenge' end
 if not profile() then clear();return false,'Requires this client profile and native High Council rank (index 1)' end
 clear();challenge=text;expires=clock()+300;refresh();return true
end
local function rosterSender(sender)
 -- Compare complete names; no cut-at-hyphen, whitespace removal or guessed realm suffix.
 if type(sender)~='string' then return nil end
 for i=1,GetNumGuildMembers() do
 local name,rank,index,_,_,_,_,_,online,_,_,_,_,_,_,_,guid=GetGuildRosterInfo(i)
 if name==sender or name..'-'..GetRealmName()==sender then
 if not online or type(guid)~='string' or type(index)~='number' or index<0 or index>9 then return nil end
 return name,guid,index,rank
 end end
end
function OlympusVerifyBrowser.Observe(message,sender)
 if not challenge or clock()>=expires then clear();return nil,'Browser challenge expired' end
 if not profile() then clear();return nil,'Councillor/profile changed' end
 if not rosterFreshAt or clock()<rosterFreshAt or clock()-rosterFreshAt>60 then refresh();return nil,'Waiting for a fresh native guild roster' end
 local code=type(message)=='string' and message:match('^!olympus ([0-9a-f]+)$')
 if not code or #code~=32 then return nil,'Not an Olympus browser request' end
 local name,guid,index,rank=rosterSender(sender);local own=UnitGUID('player')
 if not name or not own or own==guid or name:find('|',1,true) then return nil,'Requester must be a distinct online guild roster member' end
 local wire=table.concat({'OLG1',challenge,code,guid,own,tostring(clock()),'70205','16001',name,'OLYMPUS','Classic Beta PvP 2',tostring(index),'1',rank},'|')
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
 for _,t in ipairs(tiles) do t:Hide() end
 window.copy:SetText(wire);window.copy:HighlightText();local matrix,error=OlympusQr.Encode(wire)
 if matrix then
 local k=0;for y=0,48 do for x=0,48 do if matrix[y][x] then k=k+1;local t=tiles[k];if not t then t=window:CreateTexture(nil,'ARTWORK');t:SetColorTexture(0,0,0,1);tiles[k]=t end;t:ClearAllPoints();t:SetPoint('TOPLEFT',window,'TOPLEFT',49+x*6,-62-y*6);t:SetSize(6,6);t:Show() end end end
 window.note:SetText('Scan in your enrolled councillor browser. The browser signs; this AddOn holds no key.')
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
 if event=='GUILD_ROSTER_UPDATE' then if challenge then rosterFreshAt=clock();collect() end;return end
 if event~='CHAT_MSG_WHISPER' then clear();return end
 if challenge and type(message)=='string' and message:match('^!olympus ') then enqueue(message,sender);collect() end
end)
frame:SetScript('OnUpdate',function()
 if challenge and clock()>=expires then clear();return end
 if challenge and #pending>0 then collect() end
 if challenge and clock()>=displayUntil and #displayQueue>0 then local r=table.remove(displayQueue,1);if clock()<r.at or clock()-r.at>60 then say('Queued whisper expired; the member may send its still-valid code again') else local wire,reason=OlympusVerifyBrowser.Observe(r.message,r.sender);if wire then show(wire);displayUntil=clock()+5 else enqueue(r.message,r.sender,r.at);say(reason) end end end
end)
SLASH_OLYMPUSBROWSER1='/oly'
SlashCmdList.OLYMPUSBROWSER=function(message)
 local code=message:match('^browser ([0-9a-f]+)$');if not code then say('Use /oly browser <challenge> from your enrolled browser. Members whisper !olympus <code>.');return end
 local ok,reason=OlympusVerifyBrowser.SetChallenge(code);say(ok and 'Challenge ready for five minutes; keep this game and browser open.' or reason)
end
OlympusVerifyBrowser.Clear=clear

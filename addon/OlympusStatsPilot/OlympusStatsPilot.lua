-- Local memory only. No SavedVariables, network, addon messages, roles or verification bridge.
local A = OlympusStatsPilot
local state = { enabled=false, message='Stopped. Nothing is collected or displayed.' }
local panel, qr, copy, copyContainer, status, partText, textures, eventFrame
local function now()
  if type(GetServerTime)~='function' then return nil end
  local n=GetServerTime();if type(n)=='number' and n==math.floor(n) and n>0 and n<=4102444800 then return n end
end
local function combat() return type(InCombatLockdown)~='function' or InCombatLockdown()~=false end
local function diagnosticMilliseconds()
  -- A separate local measurement only; it never supplies, clamps or extends an acceptance clock.
  if type(GetTime)~='function' then return nil end
  local ok,t=pcall(GetTime)
  if ok and type(t)=='number' and t==t and t>=0 and t<=2147483647 then return math.floor(t*1000) end
end
local function redraw()
  if status then status:SetText(state.message) end
  if not state.showing and qr then qr:Hide() end
  if not state.frames and copy then copy:SetText('');copy:Hide();copyContainer:Hide() end
  if partText then partText:SetText(state.frames and string.format('Part %d of %d',state.part or 1,#state.frames) or '') end
end
local function clearSnapshot(message)
  state.pending=nil;state.identity=nil;state.scope=nil;state.validation=nil;state.frames=nil;state.showing=false;state.part=nil;state.snapshotAt=nil;state.lastDraw=nil
  state.message=message or 'Snapshot cleared. Request a new complete roster.'
  if copy then copy:SetText('');copy:Hide();copyContainer:Hide() end
  redraw()
end
function A.Stop(reason)
  clearSnapshot(reason or 'Stopped. Session, copied frames and QR have been cleared.')
  state.enabled=false;state.nonce=nil;state.started=nil;state.expires=nil;state.lastClock=nil;state.lastGetTimeMs=nil;state.clockProvider=nil;state.clockDiagnostic=nil
  return true
end
local function refuseClock(reason,t,localMs,provider)
  -- Keep only one bounded numeric diagnostic after this refusal. Explicit Stop/Start clears it.
  -- This is not an offset proof, a clock fallback, or permission to resume the stopped session.
  local previous=state.lastClock
  local previousMs=state.lastGetTimeMs
  local diagnostic={previousServerTime=previous,currentServerTime=t,previousGetTimeMs=previousMs,currentGetTimeMs=localMs,
    serverDeltaSeconds=t and previous and t-previous or nil,getTimeDeltaMs=localMs and previousMs and localMs-previousMs or nil,
    providerReferenceStable=provider==state.clockProvider}
  A.Stop(reason)
  state.clockDiagnostic=diagnostic
end
local function currentIdentity()
  if type(IsInGuild)~='function' or not IsInGuild() or type(GetGuildInfo)~='function' or type(GetRealmName)~='function' or type(UnitGUID)~='function' or type(UnitFactionGroup)~='function' then return nil end
  local guild,_,_,guildRealm=GetGuildInfo('player')
  local realm=GetRealmName();local faction=UnitFactionGroup('player')
  local guidOK,guid=pcall(UnitGUID,'player')
  local guidRealm=guidOK and type(guid)=='string' and guid:match('^Player%-(%d+)%-%x%x%x%x%x%x%x%x$')
  if not guidRealm or #guidRealm>8 or not A.ValidText(guild) or not A.ValidText(realm) or (guildRealm~=nil and guildRealm~='' and not A.ValidText(guildRealm)) or (faction~='Alliance' and faction~='Horde') then return nil end
  guildRealm=(guildRealm and guildRealm~='') and guildRealm or realm
  -- Beta UnitName returns first/last, not name/realm. Only an exact native GUID can select our row.
  return {guild=guild,realm=realm,realmGroup=guildRealm,guid=guid,faction=faction}
end
local function same(a,b)
  return a and b and a.guild==b.guild and a.realm==b.realm and a.realmGroup==b.realmGroup and a.guid==b.guid and a.faction==b.faction
end
local function countLabel(value)
  if type(value)=='number' and value==math.floor(value) and value>=0 and value<=1000 then return tostring(value) end
  return 'unreadable'
end
local function live()
  if not state.enabled then return nil end
  local provider=GetServerTime
  local t=now()
  local localMs=diagnosticMilliseconds()
  -- Same original refusal predicates and order; name the failed clock guard without native data.
  -- A generic expired/clock message cannot distinguish normal expiry from an unreadable or rolled-back clock.
  if not t then refuseClock('Server clock is unreadable. Start again from the browser.',t,localMs,provider);return nil end
  if t<state.started then refuseClock('Server clock moved before the session start. Start again from the browser.',t,localMs,provider);return nil end
  if state.lastClock and t<state.lastClock then refuseClock('Server clock moved backwards during the session. Start again from the browser.',t,localMs,provider);return nil end
  if t>=state.expires then refuseClock('Local session expired after 5 minutes. Start again from the browser.',t,localMs,provider);return nil end
  state.lastClock=t;state.lastGetTimeMs=localMs
  if combat() then A.Stop('Stopped for combat. Start a new session after combat.');return nil end
  if state.scope then
    local id=currentIdentity();local scope=state.scope
    if not same(id,scope) then A.Stop('Own-guild scope changed. Start a new session.');return nil end
  end
  if state.snapshotAt and (t<state.snapshotAt or t>=state.snapshotAt+60) then clearSnapshot('Snapshot expired after 60 seconds. Request a new roster.');return nil end
  if state.pending and (t<state.pending or t>=state.pending+15) then clearSnapshot('No complete roster update arrived within 15 seconds.');return nil end
  return t
end
function A.Status()
  live()
  local d=state.clockDiagnostic
  local diagnostic=d and {previousServerTime=d.previousServerTime,currentServerTime=d.currentServerTime,previousGetTimeMs=d.previousGetTimeMs,currentGetTimeMs=d.currentGetTimeMs,
    serverDeltaSeconds=d.serverDeltaSeconds,getTimeDeltaMs=d.getTimeDeltaMs,providerReferenceStable=d.providerReferenceStable} or nil
  return { enabled=state.enabled,ready=state.frames~=nil,showing=state.showing==true,message=state.message,parts=state.frames and #state.frames or 0,expires=state.expires,snapshotAt=state.snapshotAt,clockDiagnostic=diagnostic }
end
function A.Start(nonce)
  A.Stop()
  if type(nonce)~='string' or #nonce~=32 or nonce:find('[^0-9a-f]') then state.message='Copy the exact 32-character lowercase browser challenge.';redraw();return false end
  local provider=GetServerTime
  local t=now()
  if not t or combat() or not currentIdentity() then state.message='A readable own-guild identity, server clock and no combat are required.';redraw();return false end
  state.enabled=true;state.nonce=nonce;state.started=t;state.expires=t+300;state.lastClock=t;state.lastGetTimeMs=diagnosticMilliseconds();state.clockProvider=provider
  state.message='Local session enabled for 5 minutes. Request a complete roster, then choose Display QR.'
  if panel then panel:Show() end
  redraw();return true
end
function A.RequestSnapshot()
  if not live() then return false end
  clearSnapshot()
  if type(GetGuildRosterShowOffline)~='function' or GetGuildRosterShowOffline()~=true then state.message='Enable Show Offline in your native guild roster yourself, then request again. This pilot never changes that filter.';redraw();return false end
  local identity=currentIdentity()
  local request=(C_GuildInfo and type(C_GuildInfo.GuildRoster)=='function' and C_GuildInfo.GuildRoster) or (type(GuildRoster)=='function' and GuildRoster)
  if not identity or not request then state.message='This client has no supported readable guild roster request.';redraw();return false end
  state.pending=now();state.identity=identity;state.message='Waiting for the native guild roster update. No QR is displayed.'
  local ok=pcall(request)
  if not ok then clearSnapshot('The native roster request failed. No snapshot was kept.');return false end
  redraw();return true
end
local function readNative(id,t)
  if type(GetNumGuildMembers)~='function' or type(GetGuildRosterInfo)~='function' or type(GetGuildRosterShowOffline)~='function' or GetGuildRosterShowOffline()~=true then return nil,'The full roster is not readable.' end
  local total,reportedOnline=GetNumGuildMembers()
  if type(total)~='number' or total~=math.floor(total) or total<1 or total>1000 then return nil,'A complete roster count of 1 to 1000 is required.' end
  if reportedOnline~=nil and (type(reportedOnline)~='number' or reportedOnline~=math.floor(reportedOnline) or reportedOnline<1 or reportedOnline>total) then return nil,'The native online count is incomplete.' end
  local seen,online,selfCount={},0,0
  for i=1,total do
    -- Character labels are transient completeness checks only. No row, rank, note or GUID enters output.
    local name,_,_,_,_,_,_,_,isOnline,_,_,_,_,_,_,_,guid=GetGuildRosterInfo(i)
    if not A.ValidText(name) or type(isOnline)~='boolean' then return nil,'A native roster row is incomplete; no partial export is allowed.' end
    local key=name:lower()
    if seen[key] then return nil,'Duplicate native roster rows prevent a complete observation.' end
    seen[key]=true
    if isOnline then online=online+1 end
    if guid==id.guid then
      if not isOnline then return nil,'Your own online roster row is missing.' end
      selfCount=selfCount+1
    end
  end
  local endTotal,endOnline=GetNumGuildMembers()
  -- Keep each original guard intact; bounded count-only diagnostics identify actual client refusals.
  if selfCount~=1 then return nil,'Own online row check refused (matches '..tostring(selfCount)..'; expected 1).' end
  if total~=endTotal then return nil,'Roster size changed during collection (before '..countLabel(total)..'; after '..countLabel(endTotal)..').' end
  if reportedOnline~=endOnline then return nil,'Native online count changed during collection (before '..countLabel(reportedOnline)..'; after '..countLabel(endOnline)..').' end
  if reportedOnline~=nil and online~=reportedOnline then return nil,'Online count disagrees with readable rows (native '..tostring(reportedOnline)..'; readable '..tostring(online)..').' end
  if GetGuildRosterShowOffline()~=true then return nil,'Native Show Offline stopped exposing the full roster during collection.' end
  if not same(id,currentIdentity()) then return nil,'Native own-guild identity changed during collection.' end
  if combat() then return nil,'Combat became active during collection.' end
  local endAt=now()
  if endAt~=t then return nil,'Server clock changed during collection (start '..tostring(t)..'; end '..tostring(endAt)..').' end
  return {members=total,online=online}
end
local function collect()
  local t=live();if not t then return false end
  if not state.pending or not same(state.identity,currentIdentity()) then clearSnapshot('The own-guild identity changed or no request is pending.');return false end
  local id=state.identity
  local counts,readErr=readNative(id,t)
  if not counts then clearSnapshot(readErr);return false end
  local payload,err=A.Serialize({guild=id.guild,realmGroup=id.realmGroup,faction=id.faction,observedAt=t,members=counts.members,online=counts.online})
  if not payload then clearSnapshot(err);return false end
  local frames,frameErr=A.Frames(payload,state.nonce)
  if not frames then clearSnapshot(frameErr);return false end
  -- Scope keeps the native GUID in active memory only; clearSnapshot/Stop discard it with all frames.
  state.scope={guild=id.guild,realm=id.realm,realmGroup=id.realmGroup,guid=id.guid,faction=id.faction}
  state.validation=counts
  state.pending=nil;state.identity=nil;state.frames=frames;state.snapshotAt=t;state.part=1
  state.message='Complete own-guild observation ready for 60 seconds. Counts 1–4 are masked. Local preview only; not verified membership.'
  redraw();return true
end
local function revalidate()
  local t=live();if not t or not state.frames or not state.validation then return false end
  local counts,readErr=readNative(state.scope,t)
  if not counts then clearSnapshot(readErr);return false end
  if counts.members~=state.validation.members or counts.online~=state.validation.online then clearSnapshot('Native aggregate counts changed. Request a new snapshot.');return false end
  -- Duplicate native events must not renew data. Revalidation never serializes, requests or displays anything.
  -- Keep the exact original frames/digest/nonce, snapshotAt, display state and 60-second cutoff.
  return true
end
local function drawPart()
  if not state.frames or not state.showing then return false end
  local matrix,err=OlympusStatsPilotQr.Encode(state.frames[state.part])
  if not matrix then clearSnapshot(err);return false end
  if qr then
    for y=0,48 do for x=0,48 do local texture=textures[y*49+x+1];if matrix[y][x] then texture:Show() else texture:Hide() end end end
    qr:Show()
  end
  state.lastDraw=GetTime and GetTime() or nil
  redraw();return true
end
function A.Display()
  if not live() or not state.frames then return false end
  state.showing=true;state.part=1;return drawPart()
end
function A.CopyFrames()
  if not live() or not state.frames then return nil end
  local value=table.concat(state.frames,'\n')
  if copy then copy:SetText(value);copyContainer:Show();copy:Show();copy:SetFocus();copy:HighlightText() end
  return value
end
function A.HideDisplay()
  state.showing=false;if copy then copy:SetText('');copy:Hide();copyContainer:Hide() end;redraw()
end
function A.OnEvent(event,unit)
  if event=='PLAYER_GUILD_UPDATE' and unit~=nil and unit~='player' then return end
  if event=='GUILD_ROSTER_UPDATE' then
    local action=state.pending and collect or (state.frames and revalidate)
    if action then
      local ok,result=pcall(action)
      if not ok then clearSnapshot('Native roster read failed. No snapshot was kept.');return false end
      return result
    end
  elseif event=='PLAYER_GUILD_UPDATE' or event=='PLAYER_ENTERING_WORLD' or event=='PLAYER_LEAVING_WORLD' or event=='PLAYER_LOGOUT' or event=='PLAYER_REGEN_DISABLED' then A.Stop('Session stopped after a world, guild or combat change.') end
end
function A.Poll()
  if not live() then return end
  if state.showing and state.lastDraw and GetTime and GetTime()-state.lastDraw>=1.25 then state.part=state.part%#state.frames+1;drawPart() end
end

if type(CreateFrame)=='function' then
  panel=CreateFrame('Frame','OlympusStatsPilotPanel',UIParent,'BackdropTemplate')
  panel:SetSize(420,650);panel:SetPoint('CENTER');panel:SetFrameStrata('DIALOG');panel:EnableMouse(true)
  panel:SetBackdrop({bgFile='Interface/Buttons/WHITE8X8',edgeFile='Interface/Tooltips/UI-Tooltip-Border',tile=true,tileSize=16,edgeSize=16,insets={left=4,right=4,top=4,bottom=4}})
  panel:SetBackdropColor(0.04,0.04,0.06,1)
  local title=panel:CreateFontString(nil,'OVERLAY','GameFontNormalLarge');title:SetPoint('TOP',0,-18);title:SetText('Olympus Stats · Local preview')
  status=panel:CreateFontString(nil,'OVERLAY','GameFontHighlight');status:SetPoint('TOPLEFT',18,-48);status:SetWidth(384);status:SetJustifyH('LEFT')
  local function button(label,x,y,width,fn)
    local b=CreateFrame('Button',nil,panel,'UIPanelButtonTemplate');b:SetSize(width,26);b:SetPoint('TOPLEFT',x,y);b:SetText(label);b:SetScript('OnClick',fn);return b
  end
  button('Request snapshot',18,-128,184,A.RequestSnapshot)
  button('Display QR',218,-128,184,A.Display)
  button('Copy complete frames',18,-166,184,A.CopyFrames)
  button('Stop and clear',218,-166,184,function()A.Stop()end)
  qr=CreateFrame('Frame',nil,panel);qr:SetSize(285,285);qr:SetPoint('TOP',0,-210)
  local background=qr:CreateTexture(nil,'BACKGROUND');background:SetAllPoints(qr);background:SetColorTexture(1,1,1,1)
  textures={}
  for y=0,48 do for x=0,48 do local p=qr:CreateTexture(nil,'ARTWORK');p:SetSize(5,5);p:SetPoint('TOPLEFT',(x+4)*5,-(y+4)*5);p:SetColorTexture(0,0,0,1);p:Hide();textures[#textures+1]=p end end
  qr:Hide()
  partText=panel:CreateFontString(nil,'OVERLAY','GameFontHighlight');partText:SetPoint('TOP',0,-505)
  copyContainer=CreateFrame('ScrollFrame',nil,panel,'UIPanelScrollFrameTemplate');copyContainer:SetSize(356,80);copyContainer:SetPoint('TOPLEFT',18,-542)
  copy=CreateFrame('EditBox',nil,copyContainer);copy:SetSize(352,1200);copy:SetMultiLine(true);copy:SetAutoFocus(false);copy:SetMaxLetters(3000);copy:SetFontObject('ChatFontNormal');copy:SetScript('OnEscapePressed',function()copy:ClearFocus()end);copyContainer:SetScrollChild(copy);copy:Hide();copyContainer:Hide()
  local close=CreateFrame('Button',nil,panel,'UIPanelCloseButton');close:SetPoint('TOPRIGHT',-4,-4);close:SetScript('OnClick',function()A.Stop();panel:Hide()end)
  panel:SetScript('OnHide',function()A.Stop()end);panel:Hide()
  eventFrame=CreateFrame('Frame')
  for _,event in ipairs({'GUILD_ROSTER_UPDATE','PLAYER_GUILD_UPDATE','PLAYER_ENTERING_WORLD','PLAYER_LEAVING_WORLD','PLAYER_LOGOUT','PLAYER_REGEN_DISABLED'}) do eventFrame:RegisterEvent(event) end
  eventFrame:SetScript('OnEvent',function(_,event,unit)A.OnEvent(event,unit)end)
  eventFrame:SetScript('OnUpdate',A.Poll)
  SlashCmdList=SlashCmdList or {}
  SLASH_OLYMPUSSTATSPILOT1='/ogstats'
  SlashCmdList.OLYMPUSSTATSPILOT=function(message)
    if message=='stop' then A.Stop();return true end
    local nonce=type(message)=='string' and message:match('^([0-9a-f]+)$')
    if nonce then return A.Start(nonce) end
    panel:Show();state.message='Local preview only. Copy /ogstats <challenge> from the local browser pilot. No SavedVariables or uploads.';redraw();return false
  end
end

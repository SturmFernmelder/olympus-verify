-- Optional unsigned community census. Local attended copy only; OFF after reload.
-- No direct SavedVariables access; aggregates never serve as membership evidence.
OlympusVerifyCensus = {}
local C = OlympusVerifyCensus
local enabled, preview, signature, window = false, nil, nil, nil
local lastObservedAt,lastClock=nil,nil
local MAX_TIME, MAX_JSON = 253402300799, 327680
local topKeys = {format=true,addonVersion=true,realmGroup=true,faction=true,observedAt=true,source=true,membershipProof=true,guilds=true}
local rowKeys = {name=true,reportedCharacters=true,receivedAt=true,fresh=true,counted=true,online=true}
local function integer(n, maximum)
  return type(n)=='number' and n==n and n>=0 and n<=maximum and n==math.floor(n)
end
local function plain(t) return type(t)=='table' and getmetatable(t)==nil end
local function keys(t, allowed, maximum)
  if not plain(t) then return false end
  local n=0
  for k in next,t do n=n+1; if n>maximum or not allowed[k] then return false end end
  return true
end
local function text(s, maximum)
  if type(s)~='string' or #s==0 or #s>maximum then return false end
  local i=1
  while i<=#s do
    local a,b,c,d=s:byte(i,i+3)
    if a<32 or a==127 then return false
    elseif a<128 then i=i+1
    elseif a>=194 and a<=223 and b and b>=128 and b<=191 then i=i+2
    elseif a>=224 and a<=239 and b and c and b>=128 and b<=191 and c>=128 and c<=191
      and (a~=224 or b>=160) and (a~=237 or b<=159) then i=i+3
    elseif a>=240 and a<=244 and b and c and d and b>=128 and b<=191 and c>=128 and c<=191 and d>=128 and d<=191
      and (a~=240 or b>=144) and (a~=244 or b<=143) then i=i+4
    else return false end
  end
  return true
end
local function fold(s) return (s:gsub('[A-Z]',function(c) return string.char(c:byte()+32) end)) end
local checkpointKeys={schema=true,version=true,capturedAt=true,capturedAtServer=true,timeSource=true,scope=true,guilds=true,seenOnly=true,summary=true,retained=true}
local scopeKeys={realm=true,realmGroup=true,faction=true}
local checkpointGuildKeys={key=true,name=true,members=true,online=true,fresh=true,counted=true,observedAt=true,observedAtServer=true,provenance=true}
local provenanceKeys={source=true,reporters=true,disputed=true,singleSource=true,realm=true,heardOn=true}
local seenKeys={key=true,name=true,online=true,capped=true,observedAt=true}
local summaryKeys={members=true,characters=true,linkedAlts=true,online=true,guilds=true,freshGuilds=true,seenOnlyGuilds=true,newestObservedAt=true}
local retainedKeys={realmGroup=true,faction=true,characters=true,people=true,guilds=true,observedAt=true,source=true,counted=true,witnesses=true}
local function arrayLength(t,maximum)
  if not plain(t) then return nil end
  local n=0
  for k in next,t do n=n+1;if n>maximum or not integer(k,maximum) or k<1 then return nil end end
  for i=1,n do if rawget(t,i)==nil then return nil end end
  return n
end
-- Olympus1.5.5's public checkpoint uses local receipt clocks even when it also
-- supplies server clocks. Never replace one with the other or import its people
-- estimate, retained/global totals, seen-only rows or provenance as authority.
local function checkpointSnapshot(s,now,serverNow,addonVersion)
  if not keys(s,checkpointKeys,10) or s.schema~='olympus-census-checkpoint' or s.version~=1
    or s.timeSource~='server' or not integer(now,MAX_TIME) or now<1 or not integer(serverNow,MAX_TIME) or serverNow<1
    or not integer(s.capturedAt,now) or s.capturedAt<1 or not integer(s.capturedAtServer,serverNow) or s.capturedAtServer<1 then
    return nil,'unsupported_checkpoint_clock_or_schema'
  end
  local scope=s.scope
  if not keys(scope,scopeKeys,3) or not text(scope.realm,80) or not text(scope.realmGroup,128)
    or (scope.faction~='Alliance' and scope.faction~='Horde') or not text(addonVersion,32) then return nil,'invalid_checkpoint_scope_or_version' end
  local n,seenCount=arrayLength(s.guilds,256),arrayLength(s.seenOnly,256)
  if not n or not seenCount then return nil,'invalid_checkpoint_array' end
  local function guildKey(name) return 'g1:'..fold(scope.faction)..':'..fold(scope.realmGroup)..':'..fold(name) end
  local rows,seen={},{}
  for i=1,n do
    local r=s.guilds[i];local p=plain(r) and r.provenance
    if not keys(r,checkpointGuildKeys,9) or not text(r.name,96) or r.key~=guildKey(r.name)
      or not integer(r.members,1000) or not integer(r.online,r.members) or type(r.fresh)~='boolean' or type(r.counted)~='boolean'
      or not integer(r.observedAt,s.capturedAt) or r.observedAt<1
      or r.observedAtServer~=nil and (not integer(r.observedAtServer,s.capturedAtServer) or r.observedAtServer<1)
      or not keys(p,provenanceKeys,6) or (p.source~='roster' and p.source~='relay') or not integer(p.reporters,8)
      or p.source=='roster' and p.reporters~=1 or type(p.disputed)~='boolean' or type(p.singleSource)~='boolean'
      or p.realm~=nil and not text(p.realm,80) or p.heardOn~=nil and not text(p.heardOn,80)
      or not r.fresh and r.online~=0 or seen[r.key] then return nil,'invalid_checkpoint_guild' end
    seen[r.key]=true
    rows[i]={name=r.name,reportedCharacters=r.members,receivedAt=r.observedAt,fresh=r.fresh,counted=r.counted,online=r.fresh and r.online or nil}
  end
  -- Validate the public shape of discarded metadata too: identity-bearing or
  -- unknown fields must not be silently treated as an aggregate contract.
  for i=1,seenCount do
    local r=s.seenOnly[i]
    if not keys(r,seenKeys,5) or not text(r.name,96) or r.key~=guildKey(r.name) or seen[r.key]
      or not integer(r.online,1000) or type(r.capped)~='boolean' or not integer(r.observedAt,s.capturedAt) or r.observedAt<1 then return nil,'invalid_checkpoint_seen' end
    seen[r.key]=true
  end
  if not keys(s.summary,summaryKeys,8) then return nil,'invalid_checkpoint_summary' end
  for k in next,summaryKeys do if not integer(s.summary[k],k=='newestObservedAt' and s.capturedAt or MAX_TIME) then return nil,'invalid_checkpoint_summary' end end
  if s.retained~=nil then
    local r=s.retained
    if not keys(r,retainedKeys,9) or r.realmGroup~=scope.realmGroup or r.faction~=scope.faction or type(r.counted)~='boolean'
      or not integer(r.witnesses,8) or r.source~=nil and not text(r.source,16) then return nil,'invalid_checkpoint_retained' end
    for _,k in ipairs({'characters','people','guilds','observedAt'}) do
      if not integer(r[k],k=='observedAt' and s.capturedAt or MAX_TIME) then return nil,'invalid_checkpoint_retained' end
    end
  end
  -- The existing validator retains every900/86400/604800-second refusal and
  -- verifies the producer's booleans; the adapter never fabricates freshness.
  return C.Validate({format='olympus-census-v1',addonVersion=addonVersion,realmGroup=scope.realmGroup,faction=scope.faction,
    observedAt=s.capturedAt,source='community-observation',membershipProof=false,guilds=rows},now)
end
function C.Validate(s, now)
  if not integer(now,MAX_TIME) then return nil,'clock_unavailable' end
  if not keys(s,topKeys,8) or s.format~='olympus-census-v1' or s.source~='community-observation' or s.membershipProof~=false
    or not text(s.addonVersion,32) or not text(s.realmGroup,128) or (s.faction~='Alliance' and s.faction~='Horde')
    or not integer(s.observedAt,now) or not plain(s.guilds) then return nil,'invalid_snapshot' end
  local length=0
  for k in next,s.guilds do
    length=length+1
    if length>300 or not integer(k,300) or k<1 then return nil,'invalid_array' end
  end
  local rows,seen={},{}
  for i=1,length do
    local r=rawget(s.guilds,i)
    if not keys(r,rowKeys,6) or not text(r.name,128) or not integer(r.reportedCharacters,1000)
      or not integer(r.receivedAt,s.observedAt) then return nil,'invalid_row' end
    local age=s.observedAt-r.receivedAt
    if age>604800 or r.fresh~=(age<=900) or r.counted~=(age<=86400)
      or (age<=900 and not integer(r.online,r.reportedCharacters)) or (age>900 and r.online~=nil) then return nil,'invalid_freshness' end
    local key=fold(r.name)
    if seen[key] then return nil,'duplicate_guild' end
    seen[key]=true
    rows[i]={name=r.name,reportedCharacters=r.reportedCharacters,receivedAt=r.receivedAt,fresh=r.fresh,counted=r.counted,online=r.online}
  end
  return {format=s.format,addonVersion=s.addonVersion,realmGroup=s.realmGroup,faction=s.faction,
    observedAt=s.observedAt,source=s.source,membershipProof=false,guilds=rows}
end
-- JSON escaping preserves the value without exposing WoW hyperlink/texture markup.
local function quote(s) return '"'..s:gsub('\\','\\\\'):gsub('"','\\"'):gsub('|','\\u007c')..'"' end
local function number(n) return string.format('%.0f',n) end
local function encode(s, forComparison)
  local rows={}
  for i,r in ipairs(s.guilds) do
    rows[i]='{"name":'..quote(r.name)..',"reportedCharacters":'..number(r.reportedCharacters)..',"receivedAt":'..number(r.receivedAt)
      ..',"fresh":'..tostring(r.fresh)..',"counted":'..tostring(r.counted)..(r.online~=nil and ',"online":'..number(r.online) or '')..'}'
  end
  local result='{"format":"olympus-census-v1","addonVersion":'..quote(s.addonVersion)..',"realmGroup":'..quote(s.realmGroup)
    ..',"faction":'..quote(s.faction)..',"observedAt":'..number(forComparison and 0 or s.observedAt)
    ..',"source":"community-observation","membershipProof":false,"guilds":['..table.concat(rows,',')..']}'
  if #result>MAX_JSON then return nil end
  return result
end
local function clear()
  preview,signature,lastObservedAt,lastClock=nil,nil,nil,nil
  if window then window.copy:SetText(''); window.body:SetText(''); window:Hide() end
end
local function capability()
  local b=rawget(_G,'OlympusBridge')
  if not plain(b) or rawget(b,'API_VERSION')~=1 then return nil end
  local old=rawget(b,'GetCensusSnapshot')
  -- A present legacy method owns its own refusal/masking. Never bypass a nil
  -- result or error by falling through to the checkpoint contract.
  if old~=nil then if type(old)=='function' then return old,'legacy' end;return nil end
  if rawget(b,'CENSUS_CHECKPOINT_API_VERSION')==1 and type(rawget(b,'GetCensusCheckpoint'))=='function' then return rawget(b,'GetCensusCheckpoint'),'checkpoint' end
end
local function read()
  if not enabled then return nil,'session_opt_in_required' end
  if InCombatLockdown and InCombatLockdown() then return nil,'combat_unavailable' end
  if OlympusVerifyUI and OlympusVerifyUI.preview~=nil or OlympusVerifyPreview and OlympusVerifyPreview.State and OlympusVerifyPreview.State()~=nil then
    return nil,'addon_preview_unavailable'
  end
  local method,kind=capability()
  if not method then return nil,'optional_upstream_method_unavailable' end
  local ok,s=pcall(method)
  if not ok or s==nil then return nil,'upstream_unavailable_or_masked' end
  local clock
  if kind=='checkpoint' then clock=time else clock=GetServerTime or time end
  if type(clock)~='function' then return nil,'clock_unavailable' end
  local clockOK,now=pcall(clock)
  if not clockOK then return nil,'clock_unavailable' end
  local copy,why
  if kind=='checkpoint' then
    if type(GetServerTime)~='function' then return nil,'checkpoint_server_clock_unavailable' end
    local serverOK,serverNow=pcall(GetServerTime)
    if not serverOK then return nil,'checkpoint_server_clock_unavailable' end
    local metadata=type(C_AddOns)=='table' and C_AddOns.GetAddOnMetadata or GetAddOnMetadata
    if type(metadata)~='function' then return nil,'upstream_version_unavailable' end
    local versionOK,version=pcall(metadata,'Olympus','Version')
    if not versionOK then return nil,'upstream_version_unavailable' end
    copy,why=checkpointSnapshot(s,now,serverNow,version)
  else copy,why=C.Validate(s,now) end
  return copy,why,now
end
function C.SetEnabled(on)
  clear(); enabled=on==true
  if not enabled then return true,'session_off' end
  if not capability() then return false,'optional_upstream_method_unavailable' end
  return true,'session_on'
end
function C.Preview()
  clear()
  local s,why,now=read(); if not s then return nil,why end
  signature=encode(s,true)
  if not signature then return nil,'export_bound' end
  preview,lastObservedAt,lastClock=s,s.observedAt,now
  -- Return another copy: callers cannot edit the accepted preview.
  return C.Validate(s,s.observedAt)
end
function C.Recheck()
  if not preview then return nil,'preview_required' end
  local s,why,now=read()
  if not s or s.observedAt<lastObservedAt or now<lastClock or encode(s,true)~=signature then
    clear(); return nil,why or 'snapshot_changed_preview_again'
  end
  lastObservedAt,lastClock=s.observedAt,now
  return s
end
function C.Export()
  local s,why=C.Recheck(); if not s then return nil,why end
  local wire=encode(s,false)
  if not wire then clear(); return nil,'export_bound' end
  preview=s
  return wire,C.Validate(s,s.observedAt)
end
function C.Clear() clear() end
local function safe(s) return (s:gsub('|','||')) end
local function say(s) if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage('|cffd4af37Olympus census:|r '..s) end end
local function describe(s)
  local lines={
    'Unsigned community observations. Not membership, Council, native rank, account uniqueness or II-X affiliation.',
    'Upstream '..safe(s.addonVersion)..' | '..safe(s.realmGroup)..' | '..s.faction,
    'Client export time: '..number(s.observedAt)..'. Row receipt times are this client\'s clocks.',
    'Online fresh through 900s; totals counted through 86400s; retained through 604800s.',
  }
  for _,r in ipairs(s.guilds) do
    lines[#lines+1]=safe(r.name)..': '..number(r.reportedCharacters)..' reported characters; '
      ..(r.fresh and number(r.online)..' online (fresh)' or 'online unavailable (stale)')
      ..'; '..(r.counted and 'total counted' or 'history only')..'; received '..number(r.receivedAt)
  end
  if #s.guilds==0 then lines[#lines+1]='No per-guild observations supplied by the bounded bridge; no retained/global total is imported.' end
  return table.concat(lines,'\n')
end
local function show(s,wire)
  if not window then
    window=CreateFrame('Frame',nil,UIParent,'BasicFrameTemplateWithInset')
    window:SetSize(610,510); window:SetPoint('CENTER'); window:SetMovable(true); window:EnableMouse(true)
    window:RegisterForDrag('LeftButton'); window:SetScript('OnDragStart',window.StartMoving); window:SetScript('OnDragStop',window.StopMovingOrSizing)
    local title=window:CreateFontString(nil,'OVERLAY','GameFontNormal')
    title:SetPoint('TOP',0,-8); title:SetText('Olympus census - local aggregate preview')
    local scroll=CreateFrame('ScrollFrame',nil,window,'UIPanelScrollFrameTemplate')
    scroll:SetPoint('TOPLEFT',18,-35); scroll:SetPoint('BOTTOMRIGHT',-35,145)
    local content=CreateFrame('Frame',nil,scroll); content:SetWidth(540); content:SetHeight(1); scroll:SetScrollChild(content)
    window.body=content:CreateFontString(nil,'OVERLAY','GameFontNormalSmall')
    window.body:SetPoint('TOPLEFT'); window.body:SetWidth(540); window.body:SetJustifyH('LEFT'); window.body:SetJustifyV('TOP')
    window.content=content
    local note=window:CreateFontString(nil,'OVERLAY','GameFontNormalSmall')
    note:SetPoint('BOTTOMLEFT',18,119); note:SetWidth(565); note:SetText('Preview first. Export prepares JSON for manual Ctrl+C only. No upload or saved copy. /olv census off clears this session.')
    window.copy=CreateFrame('EditBox',nil,window,'InputBoxTemplate')
    window.copy:SetSize(565,38); window.copy:SetPoint('BOTTOMLEFT',18,65); window.copy:SetAutoFocus(false); window.copy:SetMaxLetters(MAX_JSON)
    if window.copy.SetHyperlinksEnabled then window.copy:SetHyperlinksEnabled(false) end
    window.copy:SetScript('OnEscapePressed',function(self) self:ClearFocus(); clear() end)
    local button=CreateFrame('Button',nil,window,'UIPanelButtonTemplate')
    button:SetSize(150,25); button:SetPoint('BOTTOMLEFT',18,22); button:SetText('Export aggregate JSON')
    button:SetScript('OnClick',function() C.Command('export') end)
    local off=CreateFrame('Button',nil,window,'UIPanelButtonTemplate')
    off:SetSize(150,25); off:SetPoint('BOTTOMRIGHT',-18,22); off:SetText('Turn census off')
    off:SetScript('OnClick',function() C.Command('off') end)
    window:SetScript('OnHide',function() preview,signature,lastObservedAt,lastClock=nil,nil,nil,nil; window.copy:SetText(''); window.body:SetText('') end)
    local elapsed=0
    window:SetScript('OnUpdate',function(_,dt)
      elapsed=elapsed+dt; if elapsed<1 then return end; elapsed=0
      if preview then C.Recheck() end
    end)
  end
  window.body:SetText(describe(s)); window.content:SetHeight(window.body:GetStringHeight()+12)
  window.copy:SetText(wire or ''); window:Show()
  if wire then window.copy:SetFocus(); window.copy:HighlightText() end
end
function C.Command(arg)
  if arg=='off' then C.SetEnabled(false); say('Off; local preview cleared.'); return end
  if InCombatLockdown and InCombatLockdown() then clear(); say('Leave combat before opening a census preview.'); return end
  if OlympusVerifyUI and OlympusVerifyUI.preview~=nil or OlympusVerifyPreview and OlympusVerifyPreview.State and OlympusVerifyPreview.State()~=nil then
    clear(); say('Leave addon preview before reading the optional census.'); return
  end
  if arg=='on' then local ok,why=C.SetEnabled(true); say(ok and 'Enabled for this session. /olv census preview' or why); return end
  if arg=='preview' then local s,why=C.Preview(); if s then show(s) else say(why) end; return end
  if arg=='export' then local wire,s=C.Export(); if wire then show(s,wire) else say(s) end; return end
  say('/olv census on | preview | export | off. Optional upstream method required; no upload.')
end
local function wrapCensusSlash(previous)
  return function(msg,...)
    local arg=type(msg)=='string' and msg:match('^%s*census%s*(.-)%s*$')
    if arg then return C.Command(arg) end
    return previous(msg,...)
  end
end
local slashRegistry=OlympusVerifySlash234
if type(slashRegistry)=='table' and type(slashRegistry.Extend)=='function' then
  slashRegistry.Extend('OLYMPUSVERIFY','census',wrapCensusSlash)
elseif type(SlashCmdList)=='table' and type(SlashCmdList.OLYMPUSVERIFY)=='function' then
  SlashCmdList.OLYMPUSVERIFY=wrapCensusSlash(SlashCmdList.OLYMPUSVERIFY)
end
if type(CreateFrame)=='function' then
  local events=CreateFrame('Frame')
  events:RegisterEvent('PLAYER_LOGOUT'); events:RegisterEvent('PLAYER_REGEN_DISABLED')
  events:SetScript('OnEvent',function(_,event) if event=='PLAYER_LOGOUT' then C.SetEnabled(false) else clear() end end)
end

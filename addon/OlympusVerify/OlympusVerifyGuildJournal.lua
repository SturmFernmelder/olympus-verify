-- Local officer history. The native guild log supplies names and approximate
-- ages. A roster appearance alone supplies neither a join nor an actor.
local J={}
OlympusVerifyGuildJournal=J
local lastRoster,lastRequest,requestRealm,requestAt
local lastPruned
local ageLimit=90*86400
local verbs={invite="invited",promote="promoted",demote="demoted",remove="removed",join="joined",quit="left"}
local function safe(v)
  if type(issecretvalue)=="function" then local ok,s=pcall(issecretvalue,v);if not ok or s then return end end
  return v
end
local function label(v)
  v=safe(v)
  return type(v)=="string" and #v>0 and #v<=128 and not v:find("[%c|]") and v or nil
end
local function integer(v,max)
  v=safe(v);return type(v)=="number" and v>=0 and v<=max and v==math.floor(v)
end
local function realm()
  local roster=OlympusVerifyAPI and OlympusVerifyAPI.Roster
  if not roster or type(roster.CurrentScope)~="function" or type(GetGuildInfo)~="function" then return end
  local ok,guild,_,slot=pcall(GetGuildInfo,"player")
  if not ok or label(guild)~="OLYMPUS PRIME" or not integer(slot,9) then return end
  if slot~=0 then
    local allowed,can=pcall(CanGuildPromote)
    if not allowed or safe(can)~=true then return end
  end
  local read,g,r=pcall(roster.CurrentScope)
  if read and g==guild then return label(r) end
end
local function book(r,create)
  local db=OlympusVerifyDB
  if not r or type(db)~="table" then return end
  if db.guildJournal==nil and create then db.guildJournal={version=1,realm=r,first={},events={}} end
  local j=db.guildJournal
  if type(j)~="table" or j.version~=1 or j.realm~=r or type(j.first)~="table" or type(j.events)~="table" then return end
  local now=time()
  if not lastPruned or now<lastPruned or now-lastPruned>=3600 then
    local current={}
    for i=1,math.min(500,#j.events) do
      local e=j.events[i]
      if type(e)=="table" and verbs[e.kind] and label(e.target) and (not e.actor or label(e.actor))
        and (not e.rank or label(e.rank)) and integer(e.fromAt,2147483647) and integer(e.untilAt,2147483647)
        and e.fromAt<=e.untilAt and e.untilAt<=now and e.untilAt>=now-ageLimit then current[#current+1]=e end
    end
    j.events=current;lastPruned=now
  end
  return j
end
function J.ObserveRoster()
  local r=realm()
  local roster=r and OlympusVerifyDB and OlympusVerifyDB.roster
  if not roster or roster==lastRoster or roster.nativeGuild~="OLYMPUS PRIME"
    or not (roster.nativeRealm==r or roster.nativeRealm=="" and type(roster.nativeScopeBinding)=="table" and roster.nativeScopeBinding.kind=="prime-guild-master")
    or not integer(roster.exportedAt,2147483647) or time()<roster.exportedAt or time()-roster.exportedAt>600
    or not integer(roster.total,1000) or roster.total<1 or type(roster.members)~="table" or #roster.members~=roster.total then return end
  local j=book(r,true);if not j then return end
  local first={}
  for _,m in ipairs(roster.members) do
    local guid=type(m)=="table" and label(m.guid)
    if not guid or not guid:match("^Player%-%d+%-%x+$") or first[guid] then return end
    first[guid]=j.first[guid] or roster.exportedAt
  end
  lastRoster=roster;j.first=first
end
function J.FirstSeen(guid)
  local j=book(realm());return j and j.first[guid]
end
function J.Request()
  local r,now=realm(),time()
  if not r or type(QueryGuildEventLog)~="function" or type(GetNumGuildEvents)~="function" or type(GetGuildEventInfo)~="function" then return false end
  if lastRequest and now>=lastRequest and now-lastRequest<60 then return true end
  lastRequest,requestRealm,requestAt=now,r,now
  if not pcall(QueryGuildEventLog) then requestRealm=nil;return false end
  return true
end
local function collect()
  local r,now=realm(),time()
  if not r or requestRealm~=r or now<requestAt or now-requestAt>60 then return end
  requestRealm=nil
  local ok,n=pcall(GetNumGuildEvents)
  if not ok or not integer(n,500) then return end
  local j=book(r,true);if not j then return end
  local kept,byKey,consumed={},{},{}
  local function key(e) return table.concat({e.kind,e.actor or "",e.target,e.rank or ""},"|") end
  for _,old in ipairs(j.events) do
    if type(old)=="table" and integer(old.fromAt,2147483647) and integer(old.untilAt,2147483647)
      and verbs[old.kind] and label(old.target) and (old.actor==nil or label(old.actor)) and (old.rank==nil or label(old.rank))
      and old.untilAt>=now-ageLimit then
      kept[#kept+1]=old
      local k=key(old);byKey[k]=byKey[k] or {};table.insert(byKey[k],old)
    end
  end
  for i=1,n do
    local valid,kind,p1,p2,rank,y,m,d,h=pcall(GetGuildEventInfo,i)
    kind=label(kind)
    if valid and verbs[kind] and integer(y,100) and integer(m,12) and integer(d,31) and integer(h,24) then
      local solo=kind=="join" or kind=="quit"
      local target=solo and label(p1) or not solo and label(p2)
      local ago=((y*365+m*30+d)*24+h)*3600
      if target and ago<=ageLimit then
        -- The API reports whole hours. Repeated polls of the same entry have
        -- overlapping time windows; match one-to-one so repeated events survive.
        local e={kind=kind,target=target,actor=not solo and label(p1) or nil,
          rank=(kind=="promote" or kind=="demote") and label(rank) or nil,
          fromAt=now-ago-3600,untilAt=now-ago}
        local duplicate
        for _,old in ipairs(byKey[key(e)] or {}) do
          if not consumed[old] and old.fromAt<=e.untilAt and e.fromAt<=old.untilAt then
            consumed[old]=true;duplicate=true;break
          end
        end
        if not duplicate then kept[#kept+1]=e end
      end
    end
  end
  if realm()~=r then return end
  table.sort(kept,function(a,b) return a.untilAt>b.untilAt end)
  for i=#kept,501,-1 do kept[i]=nil end
  j.events=kept
  if J.OnChanged then J.OnChanged() end
end
function J.Read(search)
  local j=book(realm())
  local out={};local needle=(search or ""):lower()
  for _,e in ipairs(j and j.events or {}) do
    if e.untilAt>=time()-ageLimit and ((e.actor or ""):lower():find(needle,1,true) or e.target:lower():find(needle,1,true)) then
      local description=e.actor and (e.actor.." "..verbs[e.kind].." "..e.target)
        or (e.kind=="join" or e.kind=="quit") and (e.target.." "..verbs[e.kind]) or (verbs[e.kind].." "..e.target.." (officer unknown)")
      out[#out+1]="~"..date("%d %b %H:%M",e.untilAt).."  "..description..(e.rank and ("  ·  "..e.rank) or "")
    end
  end
  return out
end
function J.LatestJoin(fullName)
  local j=book(realm())
  if not j or not label(fullName) then return end
  for _,e in ipairs(j.events) do
    if e.kind=="join" and e.target==fullName and e.untilAt>=time()-ageLimit then return e.untilAt end
  end
end
local events=CreateFrame("Frame")
events:RegisterEvent("GUILD_ROSTER_UPDATE")
pcall(events.RegisterEvent,events,"GUILD_EVENT_LOG_UPDATE")
events:RegisterEvent("PLAYER_GUILD_UPDATE")
events:SetScript("OnEvent",function(_,event)
  if event=="GUILD_ROSTER_UPDATE" then J.ObserveRoster();J.Request()
  elseif event=="GUILD_EVENT_LOG_UPDATE" then collect()
  else
    requestRealm,lastRequest,lastRoster,lastPruned=nil,nil,nil,nil
    if J.OnChanged then J.OnChanged() end
  end
end)

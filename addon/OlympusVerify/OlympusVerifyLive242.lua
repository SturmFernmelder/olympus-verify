-- .242 client intake. Native observations are not Discord authority. Pending
-- rows never expire; the authenticated Watcher/Worker returns signed receipts.
local ADDON = ...
local H, API, cfg = OlympusHmac, OlympusVerifyAPI, OlympusVerifyConfig or {}
if not H or not API then return end
local V = { version = 242 }
OlympusVerifyLive242 = V
local f = CreateFrame("Frame")
local state = { mailOpen=false, mailBusy=false, scans={}, replies={}, trade=nil, dirty=false, outbound={}, incoming={} }
local function call(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, a,b,c,d,e,g,h,i,j,k,l,m,n,o,p,q,r = pcall(fn, ...)
  if ok then return a,b,c,d,e,g,h,i,j,k,l,m,n,o,p,q,r end
end
local function text(v, max)
  if type(issecretvalue)=="function" then local ok,hidden=pcall(issecretvalue,v);if not ok or hidden then return nil end end
  return type(v)=="string" and #v<=(max or 1024) and not v:find("[%z\1-\8\11\12\14-\31]") and v or nil
end
local function guid(v) return text(v,64) and v:match("^Player%-%d+%-%x+$") and v or nil end
local function say(s) if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cffc9a227Olympus|r: "..s) end end
local function ownName() return call(API.TreasuryTransport and API.TreasuryTransport.Name) or call(GetUnitName,"player",true) or call(UnitName,"player") end
local function norm(s) return H.normalizeCharacter(s or "") end
local function asciiLower(s) return (s:gsub("[A-Z]",function(c) return string.char(c:byte()+32) end)) end
local function realmKey243(value)
  if not text(value,128) or value=="" or value:find("[%z\1-\31\127|:%[%]()]" ) or value:find("-",1,true) then return nil end
  local key=asciiLower(value:gsub(" +",""));return key~="" and key or nil
end
local function nativeKey243(value,localRealm)
  if not text(value,128) or value:find("[%z\1-\31\127|:%[%]()]" ) then return nil end
  local base,suffix=value:match("^(.-)%-(.+)$")
  if value:find("-",1,true) and not base then return nil end
  base=base or value
  if base:find("-",1,true) or suffix and suffix:find("-",1,true) then return nil end
  base=asciiLower(base:gsub(" +"," "):gsub("^ ",""):gsub(" $",""))
  local realm=realmKey243(suffix or localRealm)
  if #base<2 or not realm then return nil end
  return #base..":"..base..#realm..":"..realm,realm
end
local function selfId243(key,observation)
  return H.sha256hex("olympus-self-request243|"..#key..":"..key..#observation..":"..observation):sub(1,32)
end
local function selfBinding243(row,sender)
  local allowed={id=true,type=true,source=true,character=true,guid=true,guild=true,rankName=true,rankIndex=true,code=true,requestedBy=true,requestedAt=true,observationId=true,observedAt=true,guidSource=true,bridgeUntrusted=true,clientVersion=true,realm=true,status=true}
  if type(row)~="table" or row.type~="verify" or row.source~="self-addon243" or row.status~="pending" then return nil end
  for k in pairs(row) do if not allowed[k] then return nil end end
  if not text(row.observationId,32) or #row.observationId~=32 or not row.observationId:match("^[0-9a-f]+$")
    or not guid(row.guid) or not H.strictCode(row.code or "") or row.guidSource~="UnitGUID-player" or row.bridgeUntrusted~=true
    or type(row.observedAt)~="number" or row.observedAt~=math.floor(row.observedAt) or row.observedAt<=0 or row.requestedAt~=row.observedAt
    or row.observedAt<=time()-600 or row.observedAt>time()+5 then return nil end
  for _,field in ipairs({"guild","rankName"}) do
    local value=row[field]
    if value~=nil and (not text(value,128) or #value<2 or value:find("[%z\1-\31\127|()%[%]]")) then return nil end
  end
  if row.clientVersion~=nil and (not text(row.clientVersion,32) or #row.clientVersion<1 or row.clientVersion:find("[%z\1-\31\127]")) then return nil end
  if row.rankIndex~=nil and (type(row.rankIndex)~="number" or row.rankIndex~=math.floor(row.rankIndex) or row.rankIndex<0 or row.rankIndex>9) then return nil end
  local realm=call(GetRealmName);local key,nativeRealm=nativeKey243(sender,realm)
  if not key or nativeKey243(row.character,realm)~=key or nativeKey243(row.requestedBy,realm)~=key or realmKey243(row.realm)~=nativeRealm then return nil end
  if not text(row.id,32) or row.id~=selfId243(key,row.observationId) then return nil end
  return key
end
local function boundedCount243(t,limit)
  local n=0;for _ in pairs(type(t)=="table" and t or {}) do n=n+1;if n>=limit then return n end end;return n
end
local function capacity243(d,sender)
  for _,field in ipairs({"entries","dedup","observations","mail","mailActive","mailHistory","bridgeMetadata","bridgeReturns242","bridgeOutbound242","bridgeWireIds626","deliveryReceipts242","acknowledgements","transportSchedule243"}) do
    if boundedCount243(d[field],4096)>=4096 then return false,"capacity" end
  end
  if sender then
    local n=0
    for id,route in pairs(d.bridgeReturns242 or {}) do
      local row=d.entries[id]
      if type(route)~="table" or row~=nil and type(row)~="table" then return false,"retained-format" end
      if route.senderKey243==sender and row and row.status=="pending" then n=n+1;if n>=16 then return false,"sender-capacity" end end
    end
  end
  return true
end
local function admissionHeld243(d,reason)
  d.admissionHolds243=d.admissionHolds243 or {count=0}
  d.admissionHolds243.count=math.min(1000000,(tonumber(d.admissionHolds243.count) or 0)+1)
  d.admissionHolds243.reason=reason -- fixed purpose/capacity label, never request text
end
function V.IsAuthorizedWatcher()
  local _,_,rank=call(GetGuildInfo,"player")
  return type(cfg.secret)=="string" and #cfg.secret>=16 and not cfg.secret:find("REPLACE",1,true)
    and call(IsInGuild)==true and type(rank)=="number" and rank<=3
end
local function db()
  if type(OlympusVerifyDB)~="table" then return nil end
  if OlympusVerifyLocalPrivacy280 then OlympusVerifyLocalPrivacy280.Ensure(OlympusVerifyDB) end
  if OlympusVerifyDB.intake242==nil then OlympusVerifyDB.intake242={version=1,nextId=0,entries={},dedup={},acknowledgements={}} end
  local d=OlympusVerifyDB.intake242
  if type(d)~="table" or type(d.entries)~="table" or type(d.dedup)~="table" or type(d.acknowledgements)~="table" then
    if not state.custodyFormatHeld243 then say("Retained intake format is held; existing data was not replaced. Inspect the Watcher before retrying.");state.custodyFormatHeld243=true end
    return nil
  end
  return d
end
local function localOnly280(row,id)
  local privacy=OlympusVerifyLocalPrivacy280
  if not privacy then return type(row)=="table" and row.type=="donation" end
  return privacy.Blocked(OlympusVerifyDB,id or type(row)=="table" and row.id,row)
end
local function localPrivacy280()
  local p=OlympusVerifyLocalPrivacy280
  return p and p.Status(OlympusVerifyDB) or {available=false,complete=false,held=true,reason="privacy-module-unavailable"}
end
local function clone(v, depth)
  if type(v)~="table" then if type(v)=="string" or type(v)=="number" or type(v)=="boolean" then return v end;return nil end
  if (depth or 0)>5 then return nil end
  local out={};for k,x in pairs(v) do if type(k)=="string" or type(k)=="number" then out[k]=clone(x,(depth or 0)+1) end end;return out
end
function V.Queue(row, key,remoteSenderKey)
  local d=db();if not d or type(row)~="table" then return nil end
  -- Only the new minimal native collector receipt may enter financial custody.
  -- Old originals are neither rewritten nor upgraded under their old IDs.
  if row.type=="donation" then
    local allowed={id=true,type=true,source=true,character=true,guid=true,requestedAt=true,requestedBy=true,guild=true,realm=true,clientVersion=true,donation=true,evidence=true}
    local donationKeys={version=true,kind=true,copper=true,recipient=true,collectorGuid=true,reference=true}
    local evidenceKeys={kind=true,confirmedLocal=true,automaticCredit=true,mac=true}
    if row.source~="tithe-gold-v2" or type(row.donation)~="table" or type(row.evidence)~="table" or row.requestedBy~="Fern Melder" then return nil end
    for field in pairs(row) do if not allowed[field] then return nil end end
    for field in pairs(row.donation) do if not donationKeys[field] then return nil end end
    for field in pairs(row.evidence) do if not evidenceKeys[field] then return nil end end
    if row.donation.version~=2 or row.donation.recipient~="Fern Melder" or row.evidence.confirmedLocal~=true or row.evidence.automaticCredit~=false then return nil end
  end
  if type(key)=="string" and key:sub(1,12)=="declaration|" then return nil end
  if localOnly280(row,row.id) then return nil end
  if key and d.dedup[key] and localOnly280(d.entries[d.dedup[key]],d.dedup[key]) then return nil end
  if row.id and d.entries[row.id] and localOnly280(d.entries[row.id],row.id) then return nil end
  if key and d.dedup[key] then return d.entries[d.dedup[key]] end
  if row.id and d.entries[row.id]~=nil then return type(d.entries[row.id])=="table" and d.entries[row.id] or nil end
  local available,why=capacity243(d,remoteSenderKey);if not available then admissionHeld243(d,why);return nil end
  d.nextId=(tonumber(d.nextId) or 0)+1
  row.id=row.id or H.sha256hex(table.concat({guid(call(UnitGUID,"player")) or ownName() or "unknown",tostring(time()),tostring(d.nextId)},"|")):sub(1,32)
  row.requestedAt=row.requestedAt or time();row.requestedBy=row.requestedBy or ownName();row.status="pending"
  if row.clientVersion==nil then
    row.clientVersion=text(call(API.Version),32)
      or text(call(C_AddOns and C_AddOns.GetAddOnMetadata,ADDON,"Version"),32)
      or text(call(GetAddOnMetadata,ADDON,"Version"),32) or "unknown"
  end
  row.guild=row.guild or call(GetGuildInfo,"player");row.realm=row.realm or call(GetRealmName)
  d.entries[row.id]=row;if key then d.dedup[key]=row.id end
  state.creationSerial243=(state.creationSerial243 or 0)+1
  state.lastCreated243={row=row,serial=state.creationSerial243}
  state.dirty=true
  if OlympusVerifyAutoSync and (not state.pendingAlertAt or time()-state.pendingAlertAt>=30) then
    state.pendingAlertAt=time();OlympusVerifyAutoSync.Request("whisper")
  end
  return row
end
-- Bounded typed serialization, never loadstring. This carries requests, not
-- trusted observations: receiving client stamps bridgeUntrusted and sender.
local function pack(v, depth)
  if (depth or 0)>5 then return nil end
  if type(v)=="string" then if #v>4096 then return nil end;return "s"..#v..":"..v end
  if type(v)=="number" and v==v and math.abs(v)<1e15 then local s=tostring(v);return "n"..#s..":"..s end
  if type(v)=="boolean" then return v and "b1" or "b0" end
  if type(v)~="table" then return nil end
  local parts,n,keys={},0,{}
  for k in pairs(v) do
    if type(k)~="string" and type(k)~="number" then return nil end
    keys[#keys+1]=k;if #keys>100 then return nil end
  end
  table.sort(keys,function(a,b) if type(a)~=type(b) then return type(a)=="number" end;return a<b end)
  for _,k in ipairs(keys) do
    local x=v[k]
    local a,b=pack(k,(depth or 0)+1),pack(x,(depth or 0)+1)
    if not a or not b then return nil end
    n=n+1;if n>100 then return nil end;parts[#parts+1]=a..b
  end
  return "t"..n..":"..table.concat(parts)
end
local function unpackWire(data)
  if type(data)~="string" or #data>8192 then return nil end
  local pos,values=1,0
  local function read(depth)
    values=values+1;if depth>5 or values>500 then error("wire limit") end
    local kind=data:sub(pos,pos);pos=pos+1
    if kind=="b" then local b=data:sub(pos,pos);pos=pos+1;if b~="0" and b~="1" then error("wire bool") end;return b=="1" end
    local e=data:find(":",pos,true);if not e or e-pos>5 then error("wire length") end
    local n=tonumber(data:sub(pos,e-1));if not n or n<0 or n~=math.floor(n) then error("wire size") end;pos=e+1
    if kind=="t" then
      if n>100 then error("wire table") end
      local t={};for i=1,n do local k=read(depth+1);if type(k)~="string" and type(k)~="number" or t[k]~=nil then error("wire key") end;t[k]=read(depth+1) end;return t
    end
    if (kind~="s" and kind~="n") or n>4096 or pos+n-1>#data then error("wire atom") end
    local s=data:sub(pos,pos+n-1);pos=pos+n
    if kind=="s" then return s end
    local number=tonumber(s);if not number or number~=number or math.abs(number)>=1e15 then error("wire number") end;return number
  end
  local ok,row=pcall(read,0);return ok and pos==#data+1 and type(row)=="table" and row or nil
end
local function transportId(id)
  if not text(id,64) or #id==0 then return nil end
  if #id==32 and id:match("^%x+$") then return id end
  -- Chunk routing is not the canonical request ID or identity authority.
  return H.sha256hex("OLV242-wire|"..id):sub(1,32)
end
local VOLATILE={status=true,acknowledgedAt=true,outcome=true,attempts=true,serverReceipt=true}
local function bodyBinding(row)
  if type(row)~="table" or localOnly280(row,row.id) then return nil end
  local body={};for k,v in pairs(row) do if not VOLATILE[k] then body[k]=v end end
  local raw=pack(body,0);return raw and H.sha256hex(raw) or nil
end
-- Fern Melder is the existing exact transport destination, not a trust-any-
-- Officer fallback. A fresh unique native GUID/rank remains mandatory.
local function configuredCollector() return text(cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder",128) end
local function existingSecret() return type(cfg.secret)=="string" and #cfg.secret>0 and not cfg.secret:find("REPLACE",1,true) end
local applyBridgeACK,returnBridgeACK,nativeCollector
local function queueWire(row, recipient)
  if localOnly280(row,row and row.id) then return false end
  if not text(recipient,128) or not C_ChatInfo or type(C_ChatInfo.SendAddonMessage)~="function" then return end
  local wireId=transportId(row.id);if not wireId then return end
  local raw=pack(row,0);if not raw or #raw>8192 then return end
  local count=math.ceil(#raw/170)
  if #state.outbound-(state.outboundHead or 0)+count>512 then return false end
  for i=1,count do state.outbound[#state.outbound+1]={target=recipient,message=wireId..":"..i..":"..count..":"..raw:sub((i-1)*170+1,i*170),pendingRequestId=row.id} end
  return true
end
local function sendRow(row, recipient)
  if type(row)~="table" or row.type=="donation" then return end -- collector-local financial evidence
  local d=db();if localOnly280(row,row.id) then return end;local me=ownName();local ownGuid=guid(call(UnitGUID,"player"))
  if not d or not ownGuid or not state.newSelf243 or state.newSelf243[row.id]~=row then return end
  d.transportSchedule243=d.transportSchedule243 or {};local schedule=d.transportSchedule243[row.id]
  if schedule and schedule.attempted then return end -- possible delivery is unknown, never an automatic resend
  if schedule and schedule.nextAt>time() then return end
  local key=selfBinding243(row,me);local recipientKey=nativeKey243(recipient,call(GetRealmName))
  if not key or not recipientKey then return end
  local binding=bodyBinding(row);if not binding then return end
  if schedule and (schedule.bodySHA256~=binding or schedule.recipientKey~=recipientKey or schedule.ownGuid~=ownGuid) then return end
  schedule=schedule or {bodySHA256=binding,recipientKey=recipientKey,ownGuid=ownGuid,attempted=false,nextAt=time(),state="waiting"}
  d.transportSchedule243[row.id]=schedule
  local collector=nativeCollector and nativeCollector(recipient)
  local exact=false
  if collector then
    for i=1,math.min(tonumber(call(GetNumGuildMembers)) or 0,1000) do
      local name,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,id=call(GetGuildRosterInfo,i)
      if id==collector and nativeKey243(name,call(GetRealmName))==recipientKey then exact=true end
    end
  end
  if not exact then schedule.nextAt=time()+30;return end
  d.bridgeOutbound242=d.bridgeOutbound242 or {};d.bridgeWireIds626=d.bridgeWireIds626 or {};d.deliveryFailures242=d.deliveryFailures242 or {}
  local original=d.bridgeOutbound242[row.id]
  if original and (original.bodySHA256~=binding or original.ownGuid~=ownGuid or nativeKey243(original.collector,call(GetRealmName))~=recipientKey) then return end
  local wireId=transportId(row.id);if not wireId or d.bridgeWireIds626[wireId] and d.bridgeWireIds626[wireId]~=row.id then return end
  if not queueWire(row,recipient) then schedule.nextAt=time()+30;return end
  d.bridgeOutbound242[row.id]=original or {bodySHA256=binding,collector=recipient,recipient=me,ownGuid=ownGuid,character=row.character,guid=row.guid or ""}
  d.bridgeWireIds626[wireId]=row.id
  schedule.attempted=true;schedule.state="delivery_unknown";schedule.firstQueuedAt=time()
end
local function legacyReturnRoute626(original,stored,sender,d)
  -- Only the known .625 self-request sanitation can be reconstructed without
  -- guessing a discarded original body. No server work/claim is retried here.
  if localOnly280(stored,stored and stored.id) then return nil end
  if original.source~="self-addon242" or original.clientVersion~="0.6.25" or stored.clientVersion~="0.6.25"
    or original.nativeMembership~=nil or original.nativeDiscord~=nil or original.bridgeSender~=nil
    or original.bridgeUntrusted~=true or not text(original.requestedBy,128) or norm(original.requestedBy)~=norm(sender)
    or stored.source~="addon-bridge242" or stored.bridgeUntrusted~=true or not text(stored.bridgeSender,128) or norm(stored.bridgeSender)~=norm(sender)
    or d.bridgeMetadata and d.bridgeMetadata[original.id] or original.requestedAt~=stored.requestedAt then return nil end
  local candidate=clone(original);candidate.source="addon-bridge242";candidate.bridgeSender=sender
  local proof=stored.nativeMembership
  if proof~=nil then
    if type(proof)~="table" or proof.version~=1 or type(proof.member)~="boolean" or type(proof.observedAt)~="number"
      or proof.observedAt<=0 or proof.observedAt~=math.floor(proof.observedAt) or proof.observedAt>time()+5
      or not text(proof.scopeHash,16) or #proof.scopeHash~=16 or not text(proof.mac,32) or #proof.mac~=32
      or norm(original.character)~=norm(sender) or not guid(original.guid) or not H.strictCode(original.code or "") then return nil end
    local guildName,realm=call(GetGuildInfo,"player"),call(GetRealmName)
    if not text(guildName,128) or not text(realm,128) or proof.scopeHash~=H.sha256hex("native-scope|1|"..guildName.."|"..realm):sub(1,16) then return nil end
    local mac=H.hmacSha256hex(cfg.secret,table.concat({"membership","1",norm(sender),original.guid,original.code,proof.member and "1" or "0",tostring(proof.observedAt),proof.scopeHash},"|")):sub(1,32)
    if mac~=proof.mac then return nil end
    candidate.nativeMembership=clone(proof) -- retain its original clock/MAC
  end
  if bodyBinding(candidate)~=bodyBinding(stored) then return nil end
  return {recipient=sender,bodySHA256=bodyBinding(original),character=original.character,guid=original.guid or "",legacy625SourceRecovered=true}
end
local function receiveWire(message, sender, distribution)
  if distribution~="WHISPER" or not text(sender,128) or not text(message,255) then return end
  if message:sub(1,5)=="A626|" then applyBridgeACK(message,sender);return end
  local id,part,count,payload=message:match("^(%x+):(%d+):(%d+):(.*)$")
  part,count=tonumber(part),tonumber(count)
  if not id or #id~=32 or not part or not count or count>49 or part<1 or part>count then return end
  local key=sender.."|"..id;local entry=state.incoming[key]
  if not entry then
    local n=0;for _ in pairs(state.incoming) do n=n+1 end;if n>=32 then return end
    entry={parts={},count=count,at=time()};state.incoming[key]=entry
  end
  if entry.count~=count or time()-entry.at>120 or entry.parts[part] and entry.parts[part]~=payload then state.incoming[key]=nil;return end
  entry.parts[part]=payload
  for i=1,count do if not entry.parts[i] then return end end
  state.incoming[key]=nil
  local row=unpackWire(table.concat(entry.parts));if not row or transportId(row.id)~=id then return end
  if not V.IsAuthorizedWatcher() or not text(row.character,128) or row.status~="pending"
    or (row.type~="verify" and row.type~="role" and row.type~="guild") then return end
  local d=db();if not d then return end
  d.bridgeReturns242=d.bridgeReturns242 or {}
  local route=d.bridgeReturns242[row.id];local stored=d.entries[row.id]
  if localOnly280(stored or row,row.id) then return end
  if route~=nil and type(route)~="table" or stored~=nil and type(stored)~="table" then return end
  if stored then
    if not route then
      route=legacyReturnRoute626(row,stored,sender,d)
      if not route then return end
      d.bridgeReturns242[row.id]=route
    end
    local sameSender=route.senderKey243 and nativeKey243(sender,call(GetRealmName))==route.senderKey243 or not route.senderKey243 and norm(route.recipient)==norm(sender)
    if not sameSender or route.bodySHA256~=bodyBinding(row) then return end
    local acknowledged=d.acknowledgements[row.id]
    if acknowledged then returnBridgeACK(stored,acknowledged) end
    return -- exact old packet may observe only its original known terminal callback
  end
  if route then return end
  local available,why=capacity243(d,nativeKey243(sender,call(GetRealmName)))
  if not available then admissionHeld243(d,why);return end
  local senderKey=selfBinding243(row,sender)
  if not senderKey then return end
  local binding=bodyBinding(row);if not binding then return end
  local originalName,originalGuid=row.character,row.guid or ""
  -- Remote clients cannot assert officer membership proofs or Native Discord
  -- observations. Keep their original Authority token as untrusted input.
  row.nativeMembership=nil;row.nativeDiscord=nil;row.bridgeUntrusted=true;row.bridgeSender=sender;row.source="addon-bridge242"
  if row.type=="donation" then row.evidence={kind="remote-unconfirmed-declaration",confirmedLocal=false,automaticCredit=false} end
  if row.type=="verify" and norm(row.character)==norm(sender) and guid(row.guid) and H.strictCode(row.code or "") and type(API.NativeBridgeMembership242)=="function" then
    -- Unlike a claimed comm GUID, this positive comes from the collector's
    -- actual native roster plus the server-provided addon-message sender name.
    row.nativeMembership=call(API.NativeBridgeMembership242,sender,row.guid,row.code)
  end
  row.requestedBy=row.requestedBy or sender
  local queued=V.Queue(row,"remote|"..sender.."|"..id,senderKey)
  if queued then
    d.bridgeReturns242[row.id]=route or {recipient=sender,bodySHA256=binding,character=originalName,guid=originalGuid,senderKey243=senderKey}
    local acknowledged=d.acknowledgements[row.id]
    if acknowledged then returnBridgeACK(queued,acknowledged) end
  end
end
-- A local observation ID distinguishes real native events; it is never a code,
-- membership witness or permission to retry an earlier unknown server effect.
function V.NewVerificationObservation(source, sender, senderGuid, lineId)
  local d=db();if not d then return nil end
  local available,why=capacity243(d);if not available then admissionHeld243(d,why);return nil end
  if not state.observationSession then
    d.observationSessions=(tonumber(d.observationSessions) or 0)+1;state.observationSession=d.observationSessions
  end
  local line
  local readable=true
  if type(issecretvalue)=="function" then local ok,hidden=pcall(issecretvalue,lineId);readable=ok and not hidden end
  if readable then
    if type(lineId)=="number" and lineId==lineId and lineId>0 and lineId<1e15 and lineId==math.floor(lineId) then line=string.format("%.0f",lineId)
    elseif text(lineId,64) and lineId:match("^%d+$") then line=lineId end
  end
  d.observationNext=(tonumber(d.observationNext) or 0)+1
  local token=line and ("line|"..line) or ("sequence|"..d.observationNext)
  local id=H.sha256hex(table.concat({"verify-observation249",guid(call(UnitGUID,"player")) or ownName() or "unknown",tostring(state.observationSession),source or "",norm(sender),senderGuid or "",token},"|")):sub(1,32)
  d.observations=d.observations or {}
  if not d.observations[id] then d.observations[id]={id=id,observedAt=time()} end
  return clone(d.observations[id])
end
function V.CaptureVerification(source, sender, code, senderGuid, membership, locallyValid, observation)
  if source=="whisper" and not observation then observation=V.NewVerificationObservation(source,sender,senderGuid) end
  local observed=type(observation)=="table" and text(observation.id,32) and #observation.id==32 and observation.id:match("^%x+$")
    and type(observation.observedAt)=="number" and observation.observedAt>0 and observation or nil
  local key="verify|"..source.."|"..norm(sender).."|"..tostring(code).."|"..tostring(senderGuid)
  if observed then key=key.."|observation|"..observed.id end
  return V.Queue({type="verify",character=sender,guid=guid(senderGuid),code=code,source=source,
    nativeMembership=membership,locallyValid=locallyValid==true,guidSource=senderGuid and "native-whisper-event" or "unavailable",
    observationId=observed and observed.id or nil,observedAt=observed and observed.observedAt or time()},key)
end
local function receiptTransportValid(r, at)
  if type(r.observedAt)~="number" or type(r.expiresAt)~="number" or r.observedAt<=0
    or r.observedAt~=math.floor(r.observedAt) or r.expiresAt~=math.floor(r.expiresAt)
    or r.observedAt>at+5 or r.expiresAt<=at then return false end
  local span=r.expiresAt-r.observedAt
  if span>0 and span<=86400 then return true end -- original delivery ABI
  local offset=span-86400
  -- This renews only a terminal intake ACK, never current verification or a
  -- Native source proof. The signed original ACK time remains unchanged.
  return offset>0 and offset%86340==0 and r.expiresAt-86400<=at+5
end
local function receiptValid(r)
  return type(r)=="table" and text(r.id,64) and #r.id>0 and (r.status=="done" or r.status=="rejected") and text(r.character,128)
    and (r.guid==nil or r.guid=="" or guid(r.guid)) and (r.discordRole==nil or text(r.discordRole,128))
    and text(r.mac,32) and #r.mac==32 and r.mac:match("^%x+$") and receiptTransportValid(r,time())
end
local function receiptMAC(r)
  local payload=table.concat({"intake242",r.id,r.status,r.guid or "",norm(r.character),r.discordRole or "",tostring(r.observedAt),tostring(r.expiresAt)},"|")
  return H.hmacSha256hex(cfg.secret,payload):sub(1,32)==r.mac
end
nativeCollector=function(sender)
  if norm(sender)~=norm(configuredCollector()) or call(IsInGuild)~=true then return nil end
  if not state.guildRosterAt or time()-state.guildRosterAt>60 or state.guildRosterAt>time() then return nil,"stale" end
  local count=call(GetNumGuildMembers)
  if type(count)~="number" or count<1 or count>1000 or count~=math.floor(count) or type(GetGuildRosterInfo)~="function" then return nil end
  local cached=state.collectorCache626;local collectorName=norm(sender)
  if cached and cached.at==state.guildRosterAt and cached.count==count and cached.name==collectorName then return cached.guid or nil end
  -- One full bounded native roster read per burst/event, including refusals.
  state.collectorCache626={at=state.guildRosterAt,count=count,name=collectorName,guid=false}
  local found,hits,rows=nil,0,{}
  for i=1,count do
    local name,_,rank,_,_,_,_,_,online,_,_,_,_,_,_,_,memberGuid=call(GetGuildRosterInfo,i)
    if not text(name,128) or not guid(memberGuid) then return nil end
    rows[#rows+1]=memberGuid
    if norm(name)==norm(sender) then
      hits=hits+1
      if type(rank)=="number" and rank==math.floor(rank) and rank>=0 and rank<=3 and online==true then found=memberGuid end
    end
  end
  if hits~=1 or not found then return nil end
  local matches=0;for _,id in ipairs(rows) do if id==found then matches=matches+1 end end
  if matches==1 then state.collectorCache626.guid=found;return found end
  return nil
end
local function matchingCallback(row,d)
  if localOnly280(row,row and row.id) then return nil end
  if d.bridgeMetadata and d.bridgeMetadata[row.id] then return nil end -- old unqualified foreign original stays held
  return row
end
returnBridgeACK=function(row,r)
  local d=db();local route=d and d.bridgeReturns242 and d.bridgeReturns242[row.id]
  if #state.outbound-(state.outboundHead or 0)>=512 then return end
  if type(route)~="table" or not V.IsAuthorizedWatcher() or not receiptValid(r) or not receiptMAC(r)
    or norm(r.character)~=norm(route.character) or (route.guid~="" and route.guid~=(r.guid or "")) then return end
  state.returnedACKs=state.returnedACKs or {}
  local key=row.id.."|"..route.recipient;local last=state.returnedACKs[key]
  if not last and boundedCount243(state.returnedACKs,4096)>=4096 then return end
  if last and last.mac==r.mac and time()-last.at<2 then return end
  -- A single bounded delivery report. Its MAC uses the existing shared secret;
  -- it is deliberately NOT an intake242 server receipt or a role proof.
  local message=table.concat({"A626",transportId(row.id),route.bodySHA256:sub(1,32),H.sha256hex("bridge-recipient626|"..norm(route.recipient)):sub(1,32),r.status=="done" and "D" or "R",tostring(r.observedAt),tostring(r.expiresAt)},"|")
  message=message.."|"..H.hmacSha256hex(cfg.secret,message):sub(1,32)
  if #message>255 then return end
  state.outbound[#state.outbound+1]={target=route.recipient,message=message,privacyRequestId=row.id}
  state.returnedACKs[key]={at=time(),mac=r.mac}
end
applyBridgeACK=function(message,sender)
  local wire,body,recipient,status,observed,expires,mac=message:match("^A626|(%x+)|(%x+)|(%x+)|([DR])|(%d+)|(%d+)|(%x+)$")
  if not wire or #wire~=32 or #body~=32 or #recipient~=32 or #mac~=32 then return end
  local at,untilAt=tonumber(observed),tonumber(expires)
  if not at or not untilAt or tostring(at)~=observed or tostring(untilAt)~=expires or not receiptTransportValid({observedAt=at,expiresAt=untilAt},time()) then return end
  local d=db();local id=d and d.bridgeWireIds626 and d.bridgeWireIds626[wire]
  local row=d and d.entries[id];local sent=d and d.bridgeOutbound242 and d.bridgeOutbound242[id]
  if localOnly280(row,id) then return end
  if type(row)~="table" or type(sent)~="table" or not text(sent.bodySHA256,64) or #sent.bodySHA256~=64
    or not text(sent.collector,128) or not text(sent.recipient,128) or not text(row.character,128)
    or recipient~=H.sha256hex("bridge-recipient626|"..norm(ownName())):sub(1,32)
    or norm(sent.recipient)~=norm(ownName()) or sent.ownGuid~=guid(call(UnitGUID,"player"))
    or norm(sender)~=norm(sent.collector) or norm(sender)~=norm(configuredCollector())
    or body~=sent.bodySHA256:sub(1,32) or bodyBinding(row)~=sent.bodySHA256
    or row.character~=sent.character or (row.guid or "")~=sent.guid then return end
  if row.source=="self-addon243" and nativeKey243(sender,call(GetRealmName))~=nativeKey243(sent.collector,call(GetRealmName)) then return end
  if existingSecret() and H.hmacSha256hex(cfg.secret,message:sub(1,-34)):sub(1,32)~=mac then return end
  local collector,why=nativeCollector(sender)
  if not collector then
    if why=="stale" then
      state.pendingACKs=state.pendingACKs or {};local n=0;for _ in pairs(state.pendingACKs) do n=n+1 end
      if n<32 or state.pendingACKs[id] then state.pendingACKs[id]={message=message,sender=sender} end
      if not state.rosterRequestAt626 or time()-state.rosterRequestAt626>=30 then
        local request=C_GuildInfo and C_GuildInfo.GuildRoster
        if type(request)~="function" then request=GuildRoster end
        if type(request)=="function" then state.rosterRequestAt626=time();call(request) end
      end
    end
    return
  end
  if sent.collectorGuid and sent.collectorGuid~=collector then return end
  local terminal=status=="D" and "done" or "rejected"
  local observation=H.sha256hex(table.concat({id,body,recipient,terminal,observed},"|"));d.deliveryReceipts242=d.deliveryReceipts242 or {}
  local previous=d.deliveryReceipts242[id]
  if previous and previous.observationSHA256~=observation then return end
  if row.status~="pending" and row.status~=terminal then return end
  if row.serverReceipt and (type(row.serverReceipt)~="table" or row.serverReceipt.status~=terminal or row.serverReceipt.observedAt~=at) then return end
  local callback=matchingCallback(row,d)
  if not callback or callback.status and callback.status~="pending" and callback.status~=terminal then
    d.deliveryFailures242=d.deliveryFailures242 or {};d.deliveryFailures242[row.id]="unsupported_callback";return
  end
  sent.collectorGuid=collector
  d.deliveryReceipts242[row.id]={status=terminal,observedAt=at,expiresAt=untilAt,collector=sender,collectorGuid=collector,observationSHA256=observation,collectorReportedDeliveryOnly=true,existingSecretMACVerified=existingSecret() and true or false}
  row.status=terminal;callback.status=terminal
  if state.pendingACKs then state.pendingACKs[row.id]=nil end
end
local function receipts()
  local d=db();if not d then return end
  for _,r in ipairs(type(OlympusQueue)=="table" and OlympusQueue.intakeReceipts242 or {}) do
    if type(r)=="table" and not localOnly280(d.entries[r.id],r.id) and text(r.id,64) and (r.status=="done" or r.status=="rejected") and text(r.character,128)
      and (r.guid==nil or r.guid=="" or guid(r.guid)) and (r.discordRole==nil or text(r.discordRole,128))
      and receiptTransportValid(r,time()) and type(cfg.secret)=="string" then
      local payload=table.concat({"intake242",r.id,r.status,r.guid or "",norm(r.character),r.discordRole or "",tostring(r.observedAt),tostring(r.expiresAt)},"|")
      if r.mac==H.hmacSha256hex(cfg.secret,payload):sub(1,32) then
        local row=d.entries[r.id]
        if row and not (d.bridgeMetadata and d.bridgeMetadata[r.id]) and norm(row.character)==norm(r.character) and (not row.guid or row.guid=="" or row.guid==r.guid) then
          row.status=r.status;row.serverReceipt=clone(r);d.acknowledgements[r.id]=clone(r)
          returnBridgeACK(row,r)
        end
      end
    end
  end
end
function V.VerificationReply(sender, senderGuid, fallback)
  receipts()
  -- A durable intake ACK means delivery, not current Discord role authority.
  local newest
  for _,r in ipairs(type(OlympusQueue)=="table" and OlympusQueue.verificationResults242 or {}) do
    if type(r)=="table" and guid(r.guid) and r.guid==senderGuid and text(r.character,128) and norm(r.character)==norm(sender)
      and r.status=="verified" and (r.discordRole==nil or text(r.discordRole,128)) and type(r.observedAt)=="number" and type(r.expiresAt)=="number"
      and r.observedAt<=time()+5 and r.expiresAt>time() and r.expiresAt-r.observedAt<=300 and type(cfg.secret)=="string" then
      local payload=table.concat({"verification242",r.guid,norm(r.character),r.status,r.discordRole or "",tostring(r.observedAt),tostring(r.expiresAt)},"|")
      if r.mac==H.hmacSha256hex(cfg.secret,payload):sub(1,32) and (not newest or r.observedAt>newest.observedAt) then newest=r end
    end
  end
  state.replies[norm(sender)]=time()
  if newest then return ("Olympus: already verified. Discord role: "..(text(newest.discordRole,70) or "confirmed; refresh Discord")..". Check Discord /verify-status for current access."):sub(1,255) end
  return "Olympus: code saved; server verification is queued for officer Sync. Check Discord /verify-status for current access. No server role is confirmed yet."
end
local function verificationText(s) return text(s,4096) and s:lower():find("^%s*!verify%s+%w+") end
local function filter(_, event, message, sender)
  if event=="CHAT_MSG_WHISPER" and verificationText(message) then return true end
  if event=="CHAT_MSG_WHISPER_INFORM" and text(message) and message:sub(1,8)=="Olympus:" and state.replies[norm(sender)] then return true end
  return false
end
local function closeVerificationWindow(sender)
  -- Only a dedicated WHISPER frame. A human message on the same conversation
  -- marks it mixed and prevents closing; never close a main chat frame.
  if not state.replies[norm(sender)] or type(FCF_Close)~="function" then return end
  for _,frame in ipairs(CHAT_FRAMES or {}) do
    local c=type(frame)=="string" and _G[frame] or frame
    if c and c~=DEFAULT_CHAT_FRAME and c.chatType=="WHISPER" and norm(c.chatTarget)==norm(sender) and not state["human:"..norm(sender)] then pcall(FCF_Close,c) end
  end
end
local function mailHeader(i)
  local _,_,sender,subject,money,cod,_,items,_,returned,_,canReply=call(GetInboxHeaderInfo,i)
  if not text(sender,128) or not text(subject or "",512) or type(money)~="number" or type(cod)~="number" then return nil end
  local list={}
  for slot=1,math.min(tonumber(ATTACHMENTS_MAX_RECEIVE) or 16,16) do
    local name,itemID,texture,count,quality,usable=call(GetInboxItem,i,slot)
    if name then list[#list+1]={slot=slot,name=text(name,256),itemId=itemID,count=count,link=text(call(GetInboxItemLink,i,slot),512)} end
  end
  return {sender=sender,subject=subject or "",money=money,cod=cod,items=list,hasItems=items and items~=0 or #list>0,returned=returned,canReply=canReply}
end
local function mailSignature(row, body)
  local parts={row.sender,row.subject,tostring(row.money),tostring(row.cod),body or ""}
  for _,item in ipairs(row.items) do parts[#parts+1]=tostring(item.itemId or item.link or item.name)..":"..tostring(item.count) end
  return H.sha256hex(table.concat(parts,"|"))
end
-- Rich financial transfer collection was retired by the owner on12 November2026.
-- Its saved originals remain in their original fields; no new body is read or upgraded.
function V.ScanMailbox()
  if not state.mailOpen or state.mailBusy or cfg.readMail==false or not V.IsAuthorizedWatcher() then return end
  state.mailBusy=true;receipts()
  local d=db();if not d then state.mailBusy=false;return end
  local available,why=capacity243(d);if not available then admissionHeld243(d,why);state.mailBusy=false;return end
  d.mail=d.mail or {};d.mailActive=d.mailActive or {};d.mailHistory=d.mailHistory or {}
  local n,total=call(GetInboxNumItems)
  if type(n)~="number" or type(total)~="number" or n<0 or n>50 or n~=math.floor(n) then
    if type(n)=="number" and n>50 and not state.mailCapacityHeld243 then say("Verification mail scan is held above50 loaded mails. Handle mail manually; existing requests are preserved.");state.mailCapacityHeld243=true end
    state.mailBusy=false;return
  end
  state.mailCapacityHeld243=false
  local complete=n==total
  state.mailCache={};state.mailBalance=call(GetMoney)
  local identities,bodies,headers={},{},{};local readableComplete=complete
  for i=1,n do
    local h=mailHeader(i)
    local body=text(call(GetInboxText,i),8192)
    headers[i]=h;bodies[i]=body
    if h and body then
      local key=H.sha256hex(h.sender.."|"..h.subject.."|"..body)
      identities[key]=(identities[key] or 0)+1
    else readableComplete=false end
  end
  -- Native mail has no UUID. Only a complete readable absence can end an
  -- instance; reordering, closing the mailbox or duplicate content cannot.
  if readableComplete then
    for contentKey,fingerprint in pairs(d.mailActive) do
      if not identities[contentKey] then
        local previous=d.mail[fingerprint]
        if previous then previous.absentQualifiedAt=time() end
        d.mailActive[contentKey]=nil
      end
    end
  end
  -- Read each qualified body once. Native mail-taking/deletion remains manual.
  for i=n,1,-1 do
    local h=headers[i]
    if h then
      state.mailCache[i]=h
      local body=bodies[i]
      local contentKey=body and H.sha256hex(h.sender.."|"..h.subject.."|"..body)
      local unique=contentKey and identities[contentKey]==1
      body=body or ""
      local content=h.subject.."\n"..body;local token=content:match("![Vv][Ee][Rr][Ii][Ff][Yy]%s+([%w]+)")
      if not token then token=h.subject:match("^%s*([%w]+)%s*$") end
      token=token and H.strictCode(token)
      if token then
        local day=H.utcDay(time())
        if not state.mailCodeChecks243 or state.mailCodeChecks243.day~=day then state.mailCodeChecks243={day=day,checks={}} end
        local checks=state.mailCodeChecks243.checks;local key=(contentKey or "").."|"..token;local valid=checks[key]
        if valid==nil then
          if boundedCount243(checks,4096)>=4096 then admissionHeld243(d,"mail-code-capacity");token=nil
          else valid=H.checkCode(cfg.secret,h.sender,token) and true or false;checks[key]=valid end
        end
        if not valid then token=nil end
      end
      if token then
        local fingerprint=H.sha256hex(h.sender.."|"..h.subject.."|"..body.."|"..token)
        local mail=d.mail[fingerprint]
        if mail and mail.absentQualifiedAt and contentKey then
          d.mailHistory[mail.observation and mail.observation.id or mail.verifyId or fingerprint]=mail
          mail=nil
        end
        local available,why=capacity243(d)
        if not mail and not available then admissionHeld243(d,why);state.mailBusy=false;return end
        mail=mail or {};d.mail[fingerprint]=mail
        if contentKey then d.mailActive[contentKey]=fingerprint end
        if contentKey and (identities[contentKey] or 0)>1 then mail.ambiguous=true end
        unique=unique and not mail.ambiguous
        if h.money>0 or h.hasItems then mail.hadValue=true end
        local createdHere=false
        if not mail.verifyId and unique then
          local beforeCreation=state.creationSerial243 or 0
          mail.observation=mail.observation or V.NewVerificationObservation("mail",h.sender,nil)
          API.CaptureMailCode242(h.sender,token,mail.observation)
          local verify=V.CaptureVerification("mail",h.sender,H.strictCode(token) or token,nil,nil,false,mail.observation)
          mail.verifyId=verify and verify.id;mail.firstSeen=time()
          local made=state.lastCreated243
          createdHere=verify and made and made.row==verify and made.serial>beforeCreation and d.entries[verify.id]==verify
        end
        local captured=d.entries[mail.verifyId]
        if captured and not captured.mailProof242 and not createdHere then mail.proofHeld243=true end
        if captured and createdHere and not captured.mailProof242 and V.IsAuthorizedWatcher() then
          local at=mail.observation and mail.observation.observedAt or captured.observedAt;local guildName=call(GetGuildInfo,"player");local realm=call(GetRealmName);local collector=guid(call(UnitGUID,"player"))
          if guildName and realm and collector then
            local proof={version=242,sender=h.sender,code=captured.code,observedAt=at,guild=guildName,realm=realm,collectorGuid=collector,fingerprint=fingerprint}
            proof.mac=H.hmacSha256hex(cfg.secret,table.concat({"mail-origin","242",norm(h.sender),captured.code,tostring(at),guildName,realm,collector,fingerprint},"|")):sub(1,32)
            captured.mailProof242=proof
          end
        end
        -- A delivered verification receipt never authorizes deleting player mail.

      end
    end
  end
  state.mailBusy=false
end
local function restorePending627()
  if state.restoredPending627 then return end
  state.restoredPending627=true;local d=db();if not d then return end
  d.receiptPolicyHolds280=d.receiptPolicyHolds280 or {}
  for _,kind in ipairs({"trade","mail"}) do
    if d[kind=="trade" and "tradeCollection242" or "mailCollection242"] then d.receiptPolicyHolds280[kind]=true end
  end
  -- Existing bodies, hashes, clocks and possible deliveries remain unchanged.
end
function V.Flush(reason)
  receipts()
  local d=db();if d then d.lastFlush={at=time(),reason=reason,pendingPersisted=true};d.lastCharacter=ownName();d.lastGuid=guid(call(UnitGUID,"player")) end
  -- Only newly observed v2 native receipts can enter intake. No legacy upgrade
  -- or sanitization under an old source ID is permitted.
  local treasury=OlympusVerifyDB and OlympusVerifyDB.treasury
  for _,r in ipairs(treasury and treasury.receipts or {}) do
    if type(r)=="table" and r.version==2 and r.status=="confirmed_local" and OlympusVerifyTreasury and OlympusVerifyTreasury.IntakeBody280 then
      local body=OlympusVerifyTreasury.IntakeBody280(r)
      if body then V.Queue(body,"tithe-gold-v2|"..r.id) end
    end
  end
  for _,row in pairs(state.newSelf243 or {}) do if d and d.entries[row.id]==row and row.status=="pending" then sendRow(row,cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder") end end
  -- SavedVariables is flushed by the client at reload/logout, never by a timer.
end
local function officerCount()
  local q=OlympusLaunch229 and OlympusLaunch229.Current();local count=0
  if q and not q.actionHeld then for _,r in ipairs(q.promotions or {}) do if r.reason=="verified-initiate" and not (OlympusLaunch229.pending and OlympusLaunch229.pending[r.guid]) then count=count+1 end end end
  return count
end
local function officerButton()
  if not V.officerButton then
    local b=CreateFrame("Button","OlympusOfficerNext242",UIParent,"UIPanelButtonTemplate")
    b:SetSize(330,32);b:SetPoint("TOP",UIParent,"TOP",0,-195);b:SetFrameStrata("FULLSCREEN_DIALOG");b:SetToplevel(true);b:EnableMouse(true)
    b:RegisterForClicks("AnyDown","AnyUp")
    b:SetScript("OnClick",function(_,button,down)
      if button~="LeftButton" or down then return end
      if OlympusLaunch229 then OlympusLaunch229.tab="initiates";OlympusLaunch229.NextAction() end
      officerButton()
    end)
    V.officerButton=b
  end
  local n=officerCount();V.officerButton:SetText("Promote Verified Initiate ("..n.." remaining)")
  if n>0 then V.officerButton:Show() else V.officerButton:Hide() end
end
function V.Status()
  local d=db();local pending,formatHeld=0,0
  for _,r in pairs(d and d.entries or {}) do if type(r)~="table" then formatHeld=formatHeld+1 elseif r.status=="pending" then pending=pending+1 end end
  local unsupported=0;for _,reason in pairs(d and d.deliveryFailures242 or {}) do if reason=="unsupported_callback" then unsupported=unsupported+1 end end
  local retained=boundedCount243(d and d.heldTransfers627,1001)
  local held=(state.mailRestoreHeld627 and 1 or 0)+retained+formatHeld
  for _,value in pairs(d and type(d.receiptPolicyHolds280)=="table" and d.receiptPolicyHolds280 or {}) do if value==true then held=held+1 end end
  if state.trade and state.trade.heldReason then held=held+1 end
  if state.collecting and state.collecting.heldReason then held=held+1 end
  return {localPrivacy=localPrivacy280(),pending=pending,heldTransfers=held,heldTransfersLimited=retained>=1001,transferCapacityHeld=state.transferCapacityHeld627==true,unsupportedCallbacks=unsupported,mailGuidAvailable=false,serverDurableDeletionOnly=true}
end
local function visibleEntry(row, me, watcher)
  return type(row)=="table" and (watcher or text(row.character,128) and norm(row.character)==me
    or text(row.requestedBy,128) and norm(row.requestedBy)==me)
end
function V.VisibleEntries()
  local d=db();local out={};local me=norm(ownName());local watcher=V.IsAuthorizedWatcher()
  for _,row in pairs(d and d.entries or {}) do if visibleEntry(row,me,watcher) then
    if localOnly280(row,row.id) then out[#out+1]={id=row.id,type=row.type,source=row.source,character=row.character,requestedAt=row.requestedAt,status=row.status,localOnly280=true}
    else out[#out+1]=clone(row) end
  end end
  table.sort(out,function(a,b) return a.requestedAt<b.requestedAt end);return out
end
-- .267: Dan's generic section copier is not a redactor. Export only a bounded
-- delivery view; immutable requests/proofs remain in their existing custody.
function V.BridgeStatus()
  local d=db();local me=norm(ownName());local watcher=V.IsAuthorizedWatcher()
  local out={version=243,deliveryOnly=true,membershipProof=false,roleAuthority=false,total=0,requests={}}
  local kinds={verify=true,role=true,guild=true,donation=true};local selected={}
  local function order(a,b) return a.requestedAt>b.requestedAt or a.requestedAt==b.requestedAt and a.id<b.id end
  for _,row in pairs(d and d.entries or {}) do if visibleEntry(row,me,watcher) then
    out.total=out.total+1
    local at=row.requestedAt
    if text(row.id,128) and row.id:match("^[A-Za-z0-9:._-]+$") and kinds[row.type]
      and type(at)=="number" and at==at and at>0 and at<=253402300799 and at==math.floor(at) then
      selected[#selected+1]={id=row.id,type=row.type,requestedAt=at,row=row}
      table.sort(selected,order);if #selected>20 then table.remove(selected) end
    end
  end end
  -- At most twenty receipt checks, regardless of the retained intake backlog.
  for _,item in ipairs(selected) do
      local row=item.row;local status="unknown"
      if not localOnly280(row,row.id) then
      local ack=d.acknowledgements and d.acknowledgements[row.id]
      local delivery=d.deliveryReceipts242 and d.deliveryReceipts242[row.id]
      local sent=d.bridgeOutbound242 and d.bridgeOutbound242[row.id]
      local server=type(ack)=="table" and ack.id==row.id and text(ack.character,128) and text(row.character,128)
        and norm(ack.character)==norm(row.character) and (not row.guid or row.guid=="" or ack.guid==row.guid)
        and (ack.status=="done" or ack.status=="rejected") and type(cfg.secret)=="string"
      if server then local ok,valid=pcall(receiptMAC,ack);server=ok and valid==true end
      local transport=type(delivery)=="table" and delivery.collectorReportedDeliveryOnly==true
        and type(delivery.observationSHA256)=="string" and #delivery.observationSHA256==64
        and type(sent)=="table" and text(sent.collector,128) and text(delivery.collector,128)
        and norm(sent.collector)==norm(delivery.collector) and sent.collectorGuid==delivery.collectorGuid
        and bodyBinding(row)==sent.bodySHA256
      local receipt=server and ack or transport and delivery
      if receipt and receipt.status==row.status then
        if receipt.status=="done" then status="delivered" elseif receipt.status=="rejected" then status="rejected" end
      elseif d.deliveryFailures242 and d.deliveryFailures242[row.id]=="unsupported_callback" then status="unsupported_callback"
      elseif row.status=="pending" then status="pending" end
      end
      -- Existing native Treasury receipts use24hex IDs; other admitted intake
      -- families have their own IDs. Hash only the selected view's IDs so none
      -- is omitted or exposed as arbitrary external text. Originals stay intact.
      out.requests[#out.requests+1]={id=H.sha256hex("bridge-status243|"..item.id):sub(1,32),type=item.type,requestedAt=item.requestedAt,deliveryState=status}
  end
  table.sort(out.requests,order)
  out.truncated=out.total>#out.requests
  return out
end
function V.PrintOwnStatus()
  local rows=V.VisibleEntries();say("Your verification and role requests: "..#rows..". These are delivery results; check Discord /verify-status for current access.")
  local d=db()
  local privacy=localPrivacy280()
  if privacy.held then
    if type(privacy.heldItems)=="number"then say("Local correspondence cleanup is incomplete ("..privacy.heldItems.." held items). Held financial originals stay local only; recognized items use scoped blanking. Verification requests use their normal checks.")
    else say("Local correspondence cleanup is incomplete; nothing was blanked on this pass. Held financial originals stay local only. Verification requests use their normal checks.") end
  elseif (privacy.blankedLeaves or 0)>0 then say("Local financial correspondence was blanked. Those originals stay local only; delivery history and unconfirmed outcomes were not changed. Watcher copies have separate custody.") end
  for _,r in ipairs(rows) do if r.status=="pending" and r.source=="self-addon242" then say("An older request is preserved for review and will not be resent automatically. Check Discord /verify-status before a new deliberate request.");break end end
  for _,r in ipairs(rows) do local t=d and d.transportSchedule243 and d.transportSchedule243[r.id];if r.status=="pending" and t and t.attempted then say("Delivery is unconfirmed. This request is preserved and will not be resent automatically; check Discord /verify-status before a new deliberate request.");break end end
  if d and d.admissionHolds243 then say("New intake is held at its bounded capacity; existing originals remain preserved.") end
  if state.transferCapacityHeld627 then say("Transfer intake is held at its retained-context capacity. Existing originals and claims are preserved for review.") end
  for i=math.max(1,#rows-19),#rows do local r=rows[i];local unsupported=d and d.deliveryFailures242 and d.deliveryFailures242[r.id]=="unsupported_callback";say((r.type or "request")..": "..(r.localOnly280 and "local-only after correspondence minimization" or unsupported and "unsupported_callback" or r.status or "pending")..(r.serverReceipt and r.serverReceipt.discordRole and " / "..r.serverReceipt.discordRole or "")) end
end
local function selfCode243(value)
  if type(value)~="string" or #value>256 or value:find("[%z\1-\8\11\12\14-\31\127]") then return nil end
  value=value:gsub("^[ \t\r\n]+",""):gsub("[ \t\r\n]+$","")
  local code=H.strictCode(value);if code then return code end
  code=value:match("^![Vv][Ee][Rr][Ii][Ff][Yy]%s+([%w]+)$")
  if code then return H.strictCode(code) end
  local target,token=value:match("^/[Ww]%s+(.-)%s+![Vv][Ee][Rr][Ii][Ff][Yy]%s+([%w]+)$")
  if target and nativeKey243(target,call(GetRealmName))==nativeKey243(configuredCollector(),call(GetRealmName)) then return H.strictCode(token) end
end
function V.QueueSelf(code)
  code=selfCode243(code)
  local me,id=ownName(),guid(call(UnitGUID,"player"));local realm=call(GetRealmName);local key,nativeRealm=nativeKey243(me,realm)
  local guildName,rankName,rankIndex=call(GetGuildInfo,"player")
  if not code or not key or realmKey243(realm)~=nativeRealm or not id then say("Use /olv verify CODE with your own code and a readable native player identity.");return false end
  local observation=V.NewVerificationObservation("self-command",me,id)
  if not observation then say("Request capacity is held. Existing originals are preserved; inspect /olv status.");return false end
  local row=V.Queue({id=selfId243(key,observation.id),type="verify",source="self-addon243",character=me,guid=id,guild=guildName,rankName=rankName,rankIndex=rankIndex,
    code=code,requestedBy=me,requestedAt=observation.observedAt,realm=realm,observationId=observation.id,observedAt=observation.observedAt,guidSource="UnitGUID-player",bridgeUntrusted=true},"self|"..id.."|"..code.."|observation|"..observation.id)
  if row and row.status=="pending" then
    state.newSelf243=state.newSelf243 or {};state.newSelf243[row.id]=row
    sendRow(row,configuredCollector())
    say("Your request is saved. Delivery may be unconfirmed; check /olv status and Discord /verify-status before deliberately creating another request.")
  elseif row then say("Your request delivery is "..tostring(row.status)..". Check Discord /verify-status for current access.") end
  return row~=nil
end
local function nativeDiscord(info)
  if type(info)~="table" or not V.IsAuthorizedWatcher() then return end
  local ok,fromDiscord=pcall(function() return info.fromDiscord==true end)
  local user=text(info.userID,24);local name=text(info.lastOnlineName,128);local id=guid(info.lastOnlineGUID)
  if not ok or not fromDiscord or not user or not user:match("^%d+$") or not name or not id then return end
  local at=time();local guildName=call(GetGuildInfo,"player");local realm=call(GetRealmName);local collector=guid(call(UnitGUID,"player"))
  if not guildName or not realm or not collector then return end
  local proof={version=242,userID=user,lastOnlineName=name,lastOnlineGUID=id,fromDiscord=true,observedAt=at,collectorGuid=collector,guild=guildName,realm=realm}
  proof.mac=H.hmacSha256hex(cfg.secret,table.concat({"native-discord","242",user,id,norm(name),tostring(at),guildName,realm,collector},"|")):sub(1,32)
  V.Queue({type="guild",source="native-discord-event242",character=name,guid=id,nativeDiscord=proof,observedAt=at},"native-discord|"..user.."|"..id.."|"..math.floor(at/300))
end
local function boot()
  db();restorePending627();receipts();officerButton()
  if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then pcall(C_ChatInfo.RegisterAddonMessagePrefix,"OLV242") end
  if OlympusVerifySlash234 and OlympusVerifySlash234.Register then
    state.selfSlash243=state.selfSlash243 or function(message) V.QueueSelf(message) end
    state.noteSlash243=state.noteSlash243 or function(message)
      local treasury=OlympusVerifyTreasury
      local accepted=treasury and treasury.SetTradeReferenceCommand280 and treasury.SetTradeReferenceCommand280(message)
      say(accepted and "TITHE reference set for this open trade only." or "No note was saved. Open the intended trade, then use /olvtithe TITHE-XXXX-XXXX.")
    end
    local selfReady=OlympusVerifySlash234.Register("OLYMPUSVERIFYSELF",{"/olvverify"},state.selfSlash243)
    local noteReady=OlympusVerifySlash234.Register("OLYMPUSDONATIONNOTE",{"/olvdonationnote"},state.noteSlash243)
    if not selfReady and not state.slashHeld243 then say("The /olvverify alias is unavailable; use /olv verify CODE. Existing commands were preserved.") end
    state.slashHeld243=not selfReady or not noteReady

  end
  OlympusVerifyBridge242={QueueSelf=V.QueueSelf,Status=V.BridgeStatus,VisibleEntries=V.VisibleEntries,IsAuthorizedWatcher=V.IsAuthorizedWatcher}
  if OlympusBridge and type(OlympusBridge.RegisterSection)=="function" and not state.bridgeSection then
    state.bridgeSection=call(OlympusBridge.RegisterSection,"verification",243,V.BridgeStatus)
  end
  -- Login never adopts a retained pending original for another transport attempt.
  if not state.pump and C_Timer and C_Timer.NewTicker then
    state.pump=C_Timer.NewTicker(0.3,function()
      local index=(state.outboundHead or 0)+1;local next=state.outbound[index]
      if next then
        state.outboundHead=index
        local current=db();local pending=next.pendingRequestId and current and current.entries[next.pendingRequestId]
        if not localOnly280(pending,next.privacyRequestId or next.pendingRequestId) and (not next.pendingRequestId or pending and pending.status=="pending") then pcall(C_ChatInfo.SendAddonMessage,"OLV242",next.message,"WHISPER",next.target) end
      elseif state.outboundHead then state.outbound={};state.outboundHead=nil end
      -- Only incomplete transport assemblies expire. Saved pending jobs do not.
      if not state.lastWirePrune or time()-state.lastWirePrune>=30 then
        state.lastWirePrune=time();for key,v in pairs(state.incoming) do if time()-v.at>120 then state.incoming[key]=nil end end
      end
    end)
  end
  if ChatFrame_AddMessageEventFilter and not state.filtered then
    state.filtered=true;ChatFrame_AddMessageEventFilter("CHAT_MSG_WHISPER",filter);ChatFrame_AddMessageEventFilter("CHAT_MSG_WHISPER_INFORM",filter)
  end
  if type(SlashCmdList)=="table" and type(SlashCmdList.OLYMPUS)=="function" and not state.olySlash then
    state.olySlash=SlashCmdList.OLYMPUS
    SlashCmdList.OLYMPUS=function(msg,...)
      if (msg or ""):match("^%s*[Ss][Tt][Aa][Tt][Uu][Ss]%s*$") and not V.IsAuthorizedWatcher() then return V.PrintOwnStatus() end
      return state.olySlash(msg,...)
    end
  end
  -- Mail-taking hooks belong solely to the body-free Treasury observer.
end
for _,event in ipairs({"PLAYER_LOGIN","MAIL_SHOW","MAIL_CLOSED","MAIL_INBOX_UPDATE","PLAYER_LOGOUT",
  "CHAT_MSG_WHISPER","CHAT_MSG_WHISPER_INFORM","CHAT_MSG_ADDON","CHAT_MSG_GUILD","GUILD_ROSTER_UPDATE"}) do pcall(f.RegisterEvent,f,event) end
f:SetScript("OnEvent",function(_,event,...)
  if event=="PLAYER_LOGIN" then boot()
  elseif event=="MAIL_SHOW" then state.mailOpen=true;V.ScanMailbox()
  elseif event=="MAIL_CLOSED" then state.mailOpen=false
  elseif event=="MAIL_INBOX_UPDATE" then V.ScanMailbox()
  elseif event=="PLAYER_LOGOUT" then V.Flush("logout")
  elseif event=="CHAT_MSG_WHISPER" then
    local msg,sender=text(select(1,...),4096),text(select(2,...),128)
    if msg and sender and not verificationText(msg) then
      state["human:"..norm(sender)]=true
      -- General whisper text is never retained or treated as a receipt.
    end
  elseif event=="CHAT_MSG_WHISPER_INFORM" then local msg,sender=...;if text(msg) and msg:sub(1,8)=="Olympus:" then closeVerificationWindow(sender) end
  elseif event=="CHAT_MSG_ADDON" then
    local prefix,message,distribution,sender=...
    if prefix=="OLV242" then receiveWire(message,sender,distribution)
    end
  elseif event=="CHAT_MSG_GUILD" then
    -- A Blizzard event GUID is captured as raw evidence. No Discord ID is
    -- inferred from a display name or a chosen character name.
    local message,sender=text(select(1,...),4096),text(select(2,...),128)
    if message and sender then local d=db();if d then d.nativeGuildChatLast={at=time(),sender=sender,senderGuid=guid(select(12,...)),identityQualified=false} end end
    nativeDiscord(select(18,...))
  elseif event=="GUILD_ROSTER_UPDATE" then
    state.guildRosterAt=time();state.collectorCache626=nil;officerButton()
    for _,row in pairs(state.newSelf243 or {}) do if row.status=="pending" then sendRow(row,configuredCollector()) end end
    local pending=state.pendingACKs or {};state.pendingACKs={}
    for _,item in pairs(pending) do applyBridgeACK(item.message,item.sender) end
  end
end)

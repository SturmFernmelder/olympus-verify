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
function V.IsAuthorizedWatcher()
  local _,_,rank=call(GetGuildInfo,"player")
  return type(cfg.secret)=="string" and #cfg.secret>=16 and not cfg.secret:find("REPLACE",1,true)
    and call(IsInGuild)==true and type(rank)=="number" and rank<=3
end
local function db()
  if type(OlympusVerifyDB)~="table" then return nil end
  OlympusVerifyDB.intake242=OlympusVerifyDB.intake242 or {version=1,nextId=0,entries={},dedup={},acknowledgements={}}
  return OlympusVerifyDB.intake242
end
local function clone(v, depth)
  if type(v)~="table" then if type(v)=="string" or type(v)=="number" or type(v)=="boolean" then return v end;return nil end
  if (depth or 0)>5 then return nil end
  local out={};for k,x in pairs(v) do if type(k)=="string" or type(k)=="number" then out[k]=clone(x,(depth or 0)+1) end end;return out
end
local function announce(id)
  -- An untrusted discovery nudge, never an approval or a remotely executable job.
  if C_ChatInfo and type(C_ChatInfo.SendAddonMessage)=="function" and call(IsInGuild) then
    pcall(C_ChatInfo.SendAddonMessage,"OLYMPUS","PEND~"..id,"GUILD")
  end
end
function V.Queue(row, key)
  local d=db();if not d or type(row)~="table" then return nil end
  if key and d.dedup[key] then return d.entries[d.dedup[key]] end
  if row.id and d.entries[row.id] then return d.entries[row.id] end
  d.nextId=(tonumber(d.nextId) or 0)+1
  row.id=row.id or H.sha256hex(table.concat({guid(call(UnitGUID,"player")) or ownName() or "unknown",tostring(time()),tostring(d.nextId)},"|")):sub(1,32)
  row.requestedAt=row.requestedAt or time();row.requestedBy=row.requestedBy or ownName();row.status="pending"
  if row.clientVersion==nil then row.clientVersion="0.6.29" end
  row.guild=row.guild or call(GetGuildInfo,"player");row.realm=row.realm or call(GetRealmName)
  d.entries[row.id]=row;if key then d.dedup[key]=row.id end
  if type(OlympusDB)=="table" then
    OlympusDB.pendingRoleUpdates=OlympusDB.pendingRoleUpdates or {}
    -- IDs are map keys here; no unordered deletion/expiry of another addon's jobs.
    OlympusDB.pendingRoleUpdates[row.id]=clone(row)
  end
  state.dirty=true
  if not state.lastAnnounce or time()-state.lastAnnounce>=2 then state.lastAnnounce=time();announce(row.id) end
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
  if type(row)~="table" then return nil end
  local body={};for k,v in pairs(row) do if not VOLATILE[k] then body[k]=v end end
  local raw=pack(body,0);return raw and H.sha256hex(raw) or nil
end
-- Fern Melder is the existing exact transport destination, not a trust-any-
-- Officer fallback. A fresh unique native GUID/rank remains mandatory.
local function configuredCollector() return text(cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder",128) end
local function existingSecret() return type(cfg.secret)=="string" and #cfg.secret>0 and not cfg.secret:find("REPLACE",1,true) end
local applyBridgeACK,returnBridgeACK
local function queueWire(row, recipient)
  if not text(recipient,128) or not C_ChatInfo or type(C_ChatInfo.SendAddonMessage)~="function" then return end
  local wireId=transportId(row.id);if not wireId then return end
  local raw=pack(row,0);if not raw or #raw>8192 then return end
  local count=math.ceil(#raw/170)
  for i=1,count do state.outbound[#state.outbound+1]={target=recipient,message=wireId..":"..i..":"..count..":"..raw:sub((i-1)*170+1,i*170),pendingRequestId=row.id} end
end
local function sendRow(row, recipient)
  local d=db();local binding=bodyBinding(row);local me=ownName();local ownGuid=guid(call(UnitGUID,"player"))
  if not d or not binding or not me or not ownGuid or norm(row.requestedBy)~=norm(me) then return end
  d.bridgeOutbound242=d.bridgeOutbound242 or {};d.bridgeWireIds626=d.bridgeWireIds626 or {};d.deliveryFailures242=d.deliveryFailures242 or {}
  if d.deliveryFailures242[row.id]=="unsupported_callback" then return end
  local original=d.bridgeOutbound242[row.id]
  if original and (original.bodySHA256~=binding or norm(original.collector)~=norm(recipient) or original.ownGuid~=ownGuid or norm(original.recipient)~=norm(me)) then
    d.deliveryFailures242[row.id]="original_body_or_recipient_changed";return
  end
  d.bridgeOutbound242[row.id]=original or {bodySHA256=binding,collector=recipient,recipient=me,ownGuid=ownGuid,character=row.character,guid=row.guid or ""}
  local wireId=transportId(row.id);if not wireId or d.bridgeWireIds626[wireId] and d.bridgeWireIds626[wireId]~=row.id then return end
  d.bridgeWireIds626[wireId]=row.id
  queueWire(row,recipient)
end
local function legacyReturnRoute626(original,stored,sender,d)
  -- Only the known .625 self-request sanitation can be reconstructed without
  -- guessing a discarded original body. No server work/claim is retried here.
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
    or (row.type~="verify" and row.type~="role" and row.type~="guild" and row.type~="donation") then return end
  local d=db();if not d then return end
  local binding=bodyBinding(row);if not binding then return end
  d.bridgeReturns242=d.bridgeReturns242 or {}
  local route=d.bridgeReturns242[row.id]
  local stored=d.entries[row.id]
  if stored and not route then
    route=legacyReturnRoute626(row,stored,sender,d)
    if not route then d.deliveryFailures242=d.deliveryFailures242 or {};d.deliveryFailures242[row.id]="unsupported_callback";return end
    d.bridgeReturns242[row.id]=route
    local acknowledged=d.acknowledgements[row.id]
    if acknowledged then returnBridgeACK(stored,acknowledged) end
    return -- the retained pending/unknown original is never queued again
  end
  if stored and (norm(route.recipient)~=norm(sender) or route.bodySHA256~=binding) then return end
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
  local queued=V.Queue(row,"remote|"..sender.."|"..id)
  if queued then
    d.bridgeReturns242[row.id]=route or {recipient=sender,bodySHA256=binding,character=originalName,guid=originalGuid}
    local acknowledged=d.acknowledgements[row.id]
    if acknowledged then returnBridgeACK(queued,acknowledged) end
  end
end
-- A local observation ID distinguishes real native events; it is never a code,
-- membership witness or permission to retry an earlier unknown server effect.
function V.NewVerificationObservation(source, sender, senderGuid, lineId)
  local d=db();if not d then return nil end
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
local function nativeCollector(sender)
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
  local metadata=d.bridgeMetadata and d.bridgeMetadata[row.id]
  if not metadata then return row end -- the original OlympusVerify entry
  local container
  if metadata.origin=="Olympus-pendingRoleUpdates" then container=OlympusDB
  elseif metadata.origin=="OlympusRecordDB-pendingRoleUpdates" then container=OlympusRecordDB end
  local candidate=type(container)=="table" and type(container.pendingRoleUpdates)=="table" and container.pendingRoleUpdates[row.id]
  if type(candidate)~="table" or candidate.id~=row.id or candidate.type~=row.type or not text(candidate.character,128) or norm(candidate.character)~=norm(row.character)
    or bodyBinding(candidate)~=bodyBinding(row) then return nil end
  return candidate
end
returnBridgeACK=function(row,r)
  local d=db();local route=d and d.bridgeReturns242 and d.bridgeReturns242[row.id]
  if not route or not V.IsAuthorizedWatcher() or not receiptValid(r) or not receiptMAC(r)
    or norm(r.character)~=norm(route.character) or (route.guid~="" and route.guid~=(r.guid or "")) then return end
  state.returnedACKs=state.returnedACKs or {}
  local key=row.id.."|"..route.recipient;local last=state.returnedACKs[key]
  if last and last.mac==r.mac and time()-last.at<2 then return end
  -- A single bounded delivery report. Its MAC uses the existing shared secret;
  -- it is deliberately NOT an intake242 server receipt or a role proof.
  local message=table.concat({"A626",transportId(row.id),route.bodySHA256:sub(1,32),H.sha256hex("bridge-recipient626|"..norm(route.recipient)):sub(1,32),r.status=="done" and "D" or "R",tostring(r.observedAt),tostring(r.expiresAt)},"|")
  message=message.."|"..H.hmacSha256hex(cfg.secret,message):sub(1,32)
  if #message>255 then return end
  state.outbound[#state.outbound+1]={target=route.recipient,message=message}
  state.returnedACKs[key]={at=time(),mac=r.mac}
end
applyBridgeACK=function(message,sender)
  local wire,body,recipient,status,observed,expires,mac=message:match("^A626|(%x+)|(%x+)|(%x+)|([DR])|(%d+)|(%d+)|(%x+)$")
  if not wire or #wire~=32 or #body~=32 or #recipient~=32 or #mac~=32 then return end
  local at,untilAt=tonumber(observed),tonumber(expires)
  if not at or not untilAt or tostring(at)~=observed or tostring(untilAt)~=expires or not receiptTransportValid({observedAt=at,expiresAt=untilAt},time()) then return end
  local d=db();local id=d and d.bridgeWireIds626 and d.bridgeWireIds626[wire]
  local row=d and d.entries[id];local sent=d and d.bridgeOutbound242 and d.bridgeOutbound242[id]
  if type(row)~="table" or type(sent)~="table" or not text(sent.bodySHA256,64) or #sent.bodySHA256~=64
    or not text(sent.collector,128) or not text(sent.recipient,128) or not text(row.character,128)
    or recipient~=H.sha256hex("bridge-recipient626|"..norm(ownName())):sub(1,32)
    or norm(sent.recipient)~=norm(ownName()) or sent.ownGuid~=guid(call(UnitGUID,"player"))
    or norm(sender)~=norm(sent.collector) or norm(sender)~=norm(configuredCollector())
    or body~=sent.bodySHA256:sub(1,32) or bodyBinding(row)~=sent.bodySHA256
    or row.character~=sent.character or (row.guid or "")~=sent.guid then return end
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
  if OlympusDB and OlympusDB.pendingRoleUpdates then
    local mirrored=OlympusDB.pendingRoleUpdates[row.id]
    if type(mirrored)=="table" and bodyBinding(mirrored)==sent.bodySHA256 then mirrored.status=terminal end
  end
  if state.pendingACKs then state.pendingACKs[row.id]=nil end
end
local function receipts()
  local d=db();if not d then return end
  for _,r in ipairs(type(OlympusQueue)=="table" and OlympusQueue.intakeReceipts242 or {}) do
    if type(r)=="table" and text(r.id,64) and (r.status=="done" or r.status=="rejected") and text(r.character,128)
      and (r.guid==nil or r.guid=="" or guid(r.guid)) and (r.discordRole==nil or text(r.discordRole,128))
      and receiptTransportValid(r,time()) and type(cfg.secret)=="string" then
      local payload=table.concat({"intake242",r.id,r.status,r.guid or "",norm(r.character),r.discordRole or "",tostring(r.observedAt),tostring(r.expiresAt)},"|")
      if r.mac==H.hmacSha256hex(cfg.secret,payload):sub(1,32) then
        local row=d.entries[r.id]
        if row and norm(row.character)==norm(r.character) and (not row.guid or row.guid=="" or row.guid==r.guid) then
          row.status=r.status;row.serverReceipt=clone(r);d.acknowledgements[r.id]=clone(r)
          if OlympusDB and OlympusDB.pendingRoleUpdates and OlympusDB.pendingRoleUpdates[r.id] then OlympusDB.pendingRoleUpdates[r.id].status=r.status end
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
local function bagCount(id)
  return type(id)=="number" and call(GetItemCount,id,false) or nil
end
local function transferId627(kind)
  local d=db();if not d then return nil end
  d.transferNext627=(tonumber(d.transferNext627) or 0)+1
  return H.sha256hex(table.concat({"transfer627",guid(call(UnitGUID,"player")) or ownName() or "",kind,tostring(time()),tostring(d.transferNext627)},"|")):sub(1,32)
end
local function transferBase627(kind,id)
  return {contextVersion=1,kind=kind,transferId=id,ownGuid=guid(call(UnitGUID,"player")),ownName=ownName(),guild=call(GetGuildInfo,"player"),realm=call(GetRealmName),observedAt=time()}
end
local function saveTransfer627(p)
  local d=db();if not d then return false end
  if p.kind=="trade" then d.tradeCollection242=clone(p) else d.mailCollection242=clone(p) end
  return true
end
local function heldCount627(d)
  if state.heldTransferCount627~=nil then return state.heldTransferCount627 end
  local n=0
  for _ in pairs(type(d.heldTransfers627)=="table" and d.heldTransfers627 or {}) do n=n+1;if n>1000 then break end end
  state.heldTransferCount627=n;return n
end
local function transferRoom627()
  local d=db();if not d or heldCount627(d)>=1000 then state.transferCapacityHeld627=true;return false end
  return true
end
local function holdTransfer627(p,reason)
  local d=db();if not d then return end
  if not transferRoom627() then return false end
  d.heldTransfers627=d.heldTransfers627 or {};d.heldTransferNext627=(tonumber(d.heldTransferNext627) or 0)+1
  local key=type(p)=="table" and text(p.transferId,64) or nil
  key=key or ("untyped-"..d.heldTransferNext627)
  if d.heldTransfers627[key] then key=key.."-"..d.heldTransferNext627 end
  d.heldTransfers627[key]={context=p,reason=reason,heldAt=time()}
  state.heldTransferCount627=heldCount627(d)+1
  return true
end
local function validTransfer627(p,kind)
  if type(p)~="table" or p.contextVersion~=1 or p.kind~=kind or not text(p.transferId,32)
    or (#p.transferId~=24 and #p.transferId~=32) or not p.transferId:match("^%x+$")
    or not guid(p.ownGuid) or p.ownGuid~=guid(call(UnitGUID,"player")) or not text(p.ownName,128) or norm(p.ownName)~=norm(ownName())
    or not text(p.guild,128) or not text(p.realm,128) or type(p.observedAt)~="number" or p.observedAt<=0 or p.observedAt~=math.floor(p.observedAt) or p.observedAt>time()+5 then return false end
  if p.completedAt~=nil and (type(p.completedAt)~="number" or p.completedAt<p.observedAt or p.completedAt>time()+5 or p.completedAt~=math.floor(p.completedAt)) then return false end
  local items=kind=="trade" and p.items or type(p.header)=="table" and p.header.items
  if type(items)~="table" or #items>16 or type(p.beforeMoney)~="number" or p.beforeMoney<0 then return false end
  for _,item in ipairs(items) do
    if type(item)~="table" or type(item.itemId)~="number" or item.itemId<=0 or item.itemId~=math.floor(item.itemId)
      or type(item.count)~="number" or item.count<1 or item.count~=math.floor(item.count) then return false end
  end
  if kind=="trade" then return text(p.partner,128) and type(p.incoming)=="number" and p.incoming>=0 and type(p.outgoing)=="number" and p.outgoing>=0 end
  return text(p.header.sender,128) and text(p.header.subject,512) and text(p.body,8192) and type(p.header.money)=="number" and p.header.money>=0
    and type(p.expected)=="table" and type(p.beforeItems)=="table" and type(p.mail)=="table" and text(p.key,128)
end
local function queueTransfer627(p,row,key)
  local d=db();if not d then return nil end
  if p.exportBody~=nil and type(p.exportBody)~="table" then
    p.heldReason="saved_transfer_body_unproved";saveTransfer627(p);return nil
  end
  local at=p.completedAt or p.observedAt
  row.id=p.transferId;row.observedAt=at;row.requestedAt=at;row.requestedBy=p.ownName;row.guild=p.guild;row.realm=p.realm
  row.clientVersion=type(p.exportBody)=="table" and p.exportBody.clientVersion or "0.6.29"
  local expected=bodyBinding(row)
  if not expected or p.exportBody~=nil and bodyBinding(p.exportBody)~=expected then p.heldReason="saved_transfer_body_unproved";saveTransfer627(p);return nil end
  if p.exportBody==nil then p.exportBody=clone(row);saveTransfer627(p) end
  local original=d.entries[p.transferId]
  if original and bodyBinding(original)~=bodyBinding(p.exportBody) then p.heldReason="original_intake_body_conflict";saveTransfer627(p);return nil end
  local queued=V.Queue(clone(p.exportBody),key)
  if queued and (queued.id~=p.transferId or bodyBinding(queued)~=expected) then p.heldReason="original_intake_body_conflict";saveTransfer627(p);return nil end
  if not queued then p.heldReason="intake_queue_unavailable";saveTransfer627(p) end
  return queued
end
local function settleMailCollection()
  local p=state.collecting;if not p then return end
  if not validTransfer627(p,"mail") then p.heldReason="invalid_saved_mail_context";saveTransfer627(p);return end
  if p.treasuryExpected and p.exclusiveClaimed~=true then p.heldReason="mail_claim_unproved";saveTransfer627(p);return end
  if not p.restored then
    local h=mailHeader(p.index);local body=text(call(GetInboxText,p.index),8192)
    if h and h.sender==p.header.sender and h.subject==p.header.subject and body==p.body and h.money==0 and not h.hasItems then p.inboxConfirmed=true end
    local money=call(GetMoney)
    if type(money)=="number" and money-p.beforeMoney==p.header.money then p.moneyConfirmed=true end
    local confirmed=true;for id,count in pairs(p.expected) do local n=bagCount(id);if type(n)~="number" or type(p.beforeItems[id])~="number" or n-p.beforeItems[id]<count then confirmed=false end end
    if confirmed then p.itemsConfirmed=true end
    if p.inboxConfirmed and p.moneyConfirmed and p.itemsConfirmed and not p.completedAt then p.completedAt=time() end
    saveTransfer627(p)
  end
  if p.inboxConfirmed~=true or p.moneyConfirmed~=true or p.itemsConfirmed~=true then p.heldReason=p.restored and "restored_mail_native_proof_incomplete" or "mail_native_proof_pending";saveTransfer627(p);return end
  local row=queueTransfer627(p,{type="donation",source="mail",character=p.header.sender,guidSource="unavailable",
    donation={copper=p.header.money,items=p.header.items,note=p.body or p.header.subject},
    evidence={kind="mail-loot-inbox-empty-and-wallet-bag-delta",confirmedLocal=true,automaticCredit=false}},"mail-loot|"..p.key)
  if row then p.mail.donationId=row.id;p.mail.collected=true;local d=db();if d then d.mailCollection242=nil end;state.collecting=nil end
end
function V.ScanMailbox()
  if not state.mailOpen or state.mailBusy then return end
  state.mailBusy=true;receipts();settleMailCollection()
  local d=db();if not d then state.mailBusy=false;return end
  d.mail=d.mail or {};d.mailActive=d.mailActive or {};d.mailHistory=d.mailHistory or {}
  local n,total=call(GetInboxNumItems)
  if type(n)~="number" or type(total)~="number" or n<0 or n>1000 then state.mailBusy=false;return end
  local complete=n==total
  state.mailCache={};state.mailBalance=call(GetMoney)
  local identities={};local readableComplete=complete
  for i=1,n do
    local h=mailHeader(i)
    local body=text(call(GetInboxText,i),8192)
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
  -- Reverse order tolerates deleting exactly one checked empty mail in a scan.
  for i=n,1,-1 do
    local h=mailHeader(i)
    if h then
      state.mailCache[i]=h
      local body=text(call(GetInboxText,i),8192)
      local contentKey=body and H.sha256hex(h.sender.."|"..h.subject.."|"..body)
      local unique=contentKey and identities[contentKey]==1
      body=body or ""
      local content=h.subject.."\n"..body;local token=content:match("![Vv][Ee][Rr][Ii][Ff][Yy]%s+([%w]+)")
      if not token then for candidate in content:gmatch("[%w]+") do if H.strictCode(candidate) and type(cfg.secret)=="string" and H.checkCode(cfg.secret,h.sender,candidate) then token=candidate;break end end end
      if token then
        local fingerprint=H.sha256hex(h.sender.."|"..h.subject.."|"..body.."|"..token)
        local mail=d.mail[fingerprint]
        if mail and mail.absentQualifiedAt and contentKey then
          d.mailHistory[mail.observation and mail.observation.id or mail.verifyId or fingerprint]=mail
          mail=nil
        end
        mail=mail or {};d.mail[fingerprint]=mail
        if contentKey then d.mailActive[contentKey]=fingerprint end
        if contentKey and (identities[contentKey] or 0)>1 then mail.ambiguous=true end
        unique=unique and not mail.ambiguous
        if h.money>0 or h.hasItems then mail.hadValue=true end
        if not mail.verifyId and unique then
          mail.observation=mail.observation or V.NewVerificationObservation("mail",h.sender,nil)
          API.CaptureMailCode242(h.sender,token,mail.observation)
          local verify=V.CaptureVerification("mail",h.sender,H.strictCode(token) or token,nil,nil,false,mail.observation)
          mail.verifyId=verify and verify.id;mail.firstSeen=time()
        end
        local captured=d.entries[mail.verifyId]
        if captured and not captured.mailProof242 and V.IsAuthorizedWatcher() then
          local at=mail.observation and mail.observation.observedAt or captured.observedAt;local guildName=call(GetGuildInfo,"player");local realm=call(GetRealmName);local collector=guid(call(UnitGUID,"player"))
          if guildName and realm and collector then
            local proof={version=242,sender=h.sender,code=captured.code,observedAt=at,guild=guildName,realm=realm,collectorGuid=collector,fingerprint=fingerprint}
            proof.mac=H.hmacSha256hex(cfg.secret,table.concat({"mail-origin","242",norm(h.sender),captured.code,tostring(at),guildName,realm,collector,fingerprint},"|")):sub(1,32)
            captured.mailProof242=proof
            if OlympusDB and OlympusDB.pendingRoleUpdates then OlympusDB.pendingRoleUpdates[captured.id]=clone(captured) end
          end
        end
        local validCode=H.strictCode(token) and type(cfg.secret)=="string" and H.checkCode(cfg.secret,h.sender,H.strictCode(token))
        local originalProof=captured and captured.mailProof242
        local exactProof=originalProof and originalProof.fingerprint==fingerprint
        if readableComplete and unique and exactProof and validCode and h.cod==0 and (h.money>0 or h.hasItems) and not mail.collected and not state.collecting and not state.mailRestoreHeld627 and transferRoom627() then
          local beforeItems,expected={},{};local safe=true
          for _,item in ipairs(h.items) do
            if type(item.itemId)~="number" or type(item.count)~="number" or type(bagCount(item.itemId))~="number" then safe=false;break end
            beforeItems[item.itemId]=bagCount(item.itemId);expected[item.itemId]=(expected[item.itemId] or 0)+item.count
          end
          local money=call(GetMoney)
          if safe and type(money)=="number" then
          local treasury=OlympusVerifyTreasury;local status=treasury and call(treasury.Status)
          local treasuryExpected=h.money>0 and status and status.enabled
          local transferId=treasuryExpected and call(treasury.MailTransferId627,i) or transferId627("mail")
          if not treasuryExpected or transferId then
          local pending=transferBase627("mail",transferId)
          pending.index=i;pending.header=h;pending.key=mail.observation and mail.observation.id or fingerprint;pending.mail=mail;pending.mailFingerprint=fingerprint
          pending.body=body;pending.beforeMoney=money;pending.beforeItems=beforeItems;pending.expected=expected;pending.treasuryExpected=treasuryExpected
          state.collecting=pending;saveTransfer627(pending)
          if validTransfer627(pending,"mail") and (not treasuryExpected or call(treasury.ClaimMailIntake242,i)==transferId) then
            pending.exclusiveClaimed=treasuryExpected and true or false;saveTransfer627(pending)
            -- Actual loot is confirmed by later mailbox/wallet/bag events; a
            -- successful API return alone never records a donation.
            if h.money>0 then call(TakeInboxMoney,i) end
            if h.hasItems then call(AutoLootMailItem,i) end
          else pending.heldReason="mail_context_or_claim_unproved";saveTransfer627(pending)
          end
          end
          end
        end
        local verify=d.entries[mail.verifyId];local donation=mail.donationId and d.entries[mail.donationId]
        if readableComplete and unique and exactProof and not mail.deleteRequestedAt and h.cod==0 and h.money==0 and not h.hasItems and verify and verify.status=="done" and verify.serverReceipt
          and (not mail.hadValue or mail.collected and donation and donation.status=="done" and donation.serverReceipt) and type(DeleteInboxItem)=="function" then
          -- The current header/body must still match immediately before delete.
          local again=mailHeader(i)
          if again and mailSignature(again,text(call(GetInboxText,i),8192) or "")==mailSignature(h,body) then
            mail.deleteRequestedAt=time();pcall(DeleteInboxItem,i);break
          end
        end
      end
    end
  end
  state.mailBusy=false
end
local function tradeItems()
  local out={}
  for i=1,6 do local name,texture,count=call(GetTradeTargetItemInfo,i);if name then
    local link=text(call(GetTradeTargetItemLink,i),512)
    out[#out+1]={slot=i,name=text(name,256),count=count,link=link,itemId=link and tonumber(link:match("item:(%d+)"))}
  end end
  return out
end
local function finishTrade()
  local t=state.trade
  if state.tradeCapacityBlocked627 then return end
  if not t or t.ambiguous or t.complete~=true or t.accepted~=true or not t.partner or type(t.incoming)~="number" or type(t.outgoing)~="number" then return end
  if not validTransfer627(t,"trade") then t.heldReason="invalid_saved_trade_context";saveTransfer627(t);return end
  if t.treasuryExpected and t.exclusiveClaimed~=true then t.heldReason="trade_claim_unproved";saveTransfer627(t);return end
  local expected={};for _,item in ipairs(t.items) do
    if not item.itemId or type(item.count)~="number" then return end
    expected[item.itemId]=(expected[item.itemId] or 0)+item.count
  end
  if not t.restored then
    local balance=call(GetMoney)
    if type(balance)=="number" and balance-t.beforeMoney==t.incoming-t.outgoing then t.moneyConfirmed=true end
    local confirmed=true
    for id,count in pairs(expected) do
      local now=bagCount(id);if type(now)~="number" or not t.beforeItems or type(t.beforeItems[id])~="number" or now-t.beforeItems[id]<count then confirmed=false end
    end
    if confirmed then t.itemsConfirmed=true end
    saveTransfer627(t)
  end
  if t.moneyConfirmed~=true or t.itemsConfirmed~=true then t.heldReason=t.restored and "restored_trade_native_proof_incomplete" or "trade_native_proof_pending";saveTransfer627(t);return end
  if t.incoming>0 or #t.items>0 then
    if t.incoming>0 and t.treasuryExpected and not t.transferId then return end
    local row=queueTransfer627(t,{type="donation",source="trade",character=t.partner,guid=t.guid,
      donation={copper=t.incoming,outgoingCopper=t.outgoing,items=t.items,note=t.note or ""},
      evidence={kind="native-trade-complete-and-wallet-delta",confirmedLocal=true,automaticCredit=false}},"trade|"..t.transferId)
    if not row then return end
  end
  local d=db();if d then d.tradeCollection242=nil end;state.trade=nil
end
local function restorePending627()
  if state.restoredPending627 then return end
  state.restoredPending627=true;local d=db();if not d then return end
  for _,kind in ipairs({"trade","mail"}) do
    local field=kind=="trade" and "tradeCollection242" or "mailCollection242";local saved=d[field]
    if saved then
      if validTransfer627(saved,kind) then
        local p=clone(saved);p.restored=true
        if kind=="trade" then state.trade=p
        else
          local fingerprint=p.mailFingerprint
          if not fingerprint and d.mailActive then fingerprint=d.mailActive[H.sha256hex(p.header.sender.."|"..p.header.subject.."|"..p.body)] end
          local original=fingerprint and d.mail and d.mail[fingerprint]
          if p.mail.verifyId and (not original or original.verifyId~=p.mail.verifyId) then
            state.mailRestoreHeld627=true;holdTransfer627(saved,"saved_mail_instance_binding_unproved")
          else p.mail=original or p.mail;state.collecting=p end
        end
      else
        d.restoreHeldKinds627=d.restoreHeldKinds627 or {}
        if not d.restoreHeldKinds627[kind] then d.restoreHeldKinds627[kind]=holdTransfer627(saved,"legacy_or_invalid_saved_"..kind.."_context") and true or false end
        if kind=="mail" then state.mailRestoreHeld627=true elseif d.restoreHeldKinds627[kind] then d.tradeCollection242=nil end
      end
    end
  end
  finishTrade();settleMailCollection()
end
local function mirrorBridge()
  local d=db();if not d then return end
  local function mirror(row,origin)
    -- Keep the original body byte-identical across its source and this mirror.
    -- Taint/provenance belongs outside the canonical entry, never in an added
    -- source/clientVersion/proof field under the same durable ID.
    d.bridgeMetadata=d.bridgeMetadata or {}
    d.bridgeMetadata[row.id]={untrusted=true,origin=origin,capturedAt=time(),automaticAuthority=false}
    d.entries[row.id]=clone(row);d.entries[row.id].status=row.status or "pending"
    state.dirty=true
  end
  if type(OlympusDB)=="table" and type(OlympusDB.pendingRoleUpdates)=="table" then
    for key,row in pairs(OlympusDB.pendingRoleUpdates) do
      if type(row)=="table" and row.status~="done" and row.status~="rejected" and text(row.id,64) and not d.entries[row.id]
        and (row.type=="verify" or row.type=="role" or row.type=="guild" or row.type=="donation") then
        -- Preserve data as an untrusted request. Worker independently resolves
        -- ownership/rank/roles; comm payloads never invoke protected APIs here.
        mirror(row,"Olympus-pendingRoleUpdates")
      end
    end
  end
  if type(OlympusRecordDB)=="table" then
    d.recordBridge={present=true,capturedAt=time(),api="OlympusRecordDB",automaticAuthority=false}
    for _,row in pairs(type(OlympusRecordDB.pendingRoleUpdates)=="table" and OlympusRecordDB.pendingRoleUpdates or {}) do
      if type(row)=="table" and text(row.id,64) and not d.entries[row.id] and row.status~="done" and row.status~="rejected" then
        mirror(row,"OlympusRecordDB-pendingRoleUpdates")
      end
    end
  end
end
function V.Flush(reason)
  receipts();mirrorBridge();finishTrade();settleMailCollection()
  local d=db();if d then d.lastFlush={at=time(),reason=reason,pendingPersisted=true};d.lastCharacter=ownName();d.lastGuid=guid(call(UnitGUID,"player")) end
  if d and state.collecting then saveTransfer627(state.collecting) end
  if d and state.trade then saveTransfer627(state.trade) end
  -- A claimed rich transfer owns the original Treasury ID even if its item
  -- proof is still pending. Never export a second body or replace it later.
  local treasury=OlympusVerifyDB and OlympusVerifyDB.treasury
  for _,r in ipairs(treasury and treasury.receipts or {}) do
    if type(r)=="table" and r.status=="confirmed_local" and not (treasury.liveIntakeOwners242 and treasury.liveIntakeOwners242[r.id]) then
      V.Queue({id=r.id,type="donation",character=r.sender,guid=r.senderGuid,source="treasury-receipt242",requestedAt=r.ts,
        donation={copper=r.incomingCopper,outgoingCopper=r.outgoingCopper,items={},note=""},
        evidence={kind=r.evidence,confirmedLocal=true,automaticCredit=false,legacyReceiptId=r.id}},"treasury|"..r.id)
    end
  end
  if d and not V.IsAuthorizedWatcher() then
    for _,row in pairs(d.entries) do if row.status=="pending" and norm(row.requestedBy)==norm(ownName()) then sendRow(row,cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder") end end
  end
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
  local d=db();local pending=0;for _,r in pairs(d and d.entries or {}) do if r.status=="pending" then pending=pending+1 end end
  local unsupported=0;for _,reason in pairs(d and d.deliveryFailures242 or {}) do if reason=="unsupported_callback" then unsupported=unsupported+1 end end
  local held=state.mailRestoreHeld627 and 1 or 0
  if d then held=held+heldCount627(d) end
  if state.trade and state.trade.heldReason then held=held+1 end
  if state.collecting and state.collecting.heldReason then held=held+1 end
  return {pending=pending,heldTransfers=held,transferCapacityHeld=state.transferCapacityHeld627==true,unsupportedCallbacks=unsupported,mailGuidAvailable=false,serverDurableDeletionOnly=true}
end
local function visibleEntry(row, me, watcher)
  return type(row)=="table" and (watcher or text(row.character,128) and norm(row.character)==me
    or text(row.requestedBy,128) and norm(row.requestedBy)==me)
end
function V.VisibleEntries()
  local d=db();local out={};local me=norm(ownName());local watcher=V.IsAuthorizedWatcher()
  for _,row in pairs(d and d.entries or {}) do if visibleEntry(row,me,watcher) then out[#out+1]=clone(row) end end
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
  if state.transferCapacityHeld627 then say("Transfer intake is held at its retained-context capacity. Existing originals and claims are preserved for review.") end
  for i=math.max(1,#rows-19),#rows do local r=rows[i];local unsupported=d and d.deliveryFailures242 and d.deliveryFailures242[r.id]=="unsupported_callback";say((r.type or "request")..": "..(unsupported and "unsupported_callback" or r.status or "pending")..(r.serverReceipt and r.serverReceipt.discordRole and " / "..r.serverReceipt.discordRole or "")) end
end
function V.QueueSelf(code)
  code=H.strictCode(code or "")
  local me,id=ownName(),guid(call(UnitGUID,"player"));local guildName,rankName,rankIndex=call(GetGuildInfo,"player")
  if not code or not me or not id then say("Use /olv verify CODE with your own code and a readable native player identity.");return false end
  local observation=V.NewVerificationObservation("self-command",me,id)
  if not observation then return false end
  local row=V.Queue({type="verify",source="self-addon242",character=me,guid=id,guild=guildName,rankName=rankName,rankIndex=rankIndex,
    code=code,requestedBy=me,observationId=observation.id,observedAt=observation.observedAt,guidSource="UnitGUID-player",bridgeUntrusted=true},"self|"..id.."|"..code.."|observation|"..observation.id)
  if row and row.status=="pending" then sendRow(row,cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder");say("Your request is saved and queued for officer Sync. Use /olv status for delivery; check Discord /verify-status for current access.")
  elseif row then say("Your request delivery is "..tostring(row.status)..". Delivery alone does not confirm current verification or a Discord role. Check Discord /verify-status for current access.") end
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
  db();restorePending627();receipts();mirrorBridge();officerButton()
  if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then pcall(C_ChatInfo.RegisterAddonMessagePrefix,"OLYMPUS") end
  if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then pcall(C_ChatInfo.RegisterAddonMessagePrefix,"OLV242") end
  if OlympusVerifySlash234 and OlympusVerifySlash234.Register then
    OlympusVerifySlash234.Register("OLYMPUSVERIFYSELF242",{"/olvverify"},function(message) V.QueueSelf(message) end)
    OlympusVerifySlash234.Register("OLYMPUSDONATIONNOTE242",{"/olvdonationnote"},function(message)
      state.donationNote=text(message,512) or "";if state.trade and not state.trade.complete then state.trade.note=state.donationNote;saveTransfer627(state.trade) end;say("Note saved for the current/next completed trade; a note is not payment proof.")
    end)
  end
  OlympusVerifyBridge242={QueueSelf=V.QueueSelf,Status=V.BridgeStatus,VisibleEntries=V.VisibleEntries,IsAuthorizedWatcher=V.IsAuthorizedWatcher}
  if OlympusBridge and type(OlympusBridge.RegisterSection)=="function" and not state.bridgeSection then
    state.bridgeSection=call(OlympusBridge.RegisterSection,"verification",243,V.BridgeStatus)
  end
  local d=db();if d and not V.IsAuthorizedWatcher() then
    for _,row in pairs(d.entries) do if row.status=="pending" and norm(row.requestedBy)==norm(ownName()) then sendRow(row,cfg.bridgeRecipient or cfg.treasuryRecipient or "Fern Melder") end end
  end
  if not state.pump and C_Timer and C_Timer.NewTicker then
    state.pump=C_Timer.NewTicker(0.3,function()
      local index=(state.outboundHead or 0)+1;local next=state.outbound[index]
      if next then
        state.outboundHead=index
        local current=db();local pending=next.pendingRequestId and current and current.entries[next.pendingRequestId]
        if not next.pendingRequestId or pending and pending.status=="pending" then pcall(C_ChatInfo.SendAddonMessage,"OLV242",next.message,"WHISPER",next.target) end
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
  if type(hooksecurefunc)=="function" and not state.mailHooks then
    state.mailHooks=true
    local function taking(index)
      if state.collecting or state.mailRestoreHeld627 or not state.mailOpen or not transferRoom627() then return end
      local h=state.mailCache and state.mailCache[index]
      if not h or h.cod~=0 or h.money==0 and not h.hasItems or type(state.mailBalance)~="number" then return end
      local beforeItems,expected={},{}
      for _,item in ipairs(h.items) do
        local count=bagCount(item.itemId);if type(count)~="number" or type(item.count)~="number" then return end
        beforeItems[item.itemId]=count;expected[item.itemId]=(expected[item.itemId] or 0)+item.count
      end
      local body=text(call(GetInboxText,index),8192) or h.subject
      local treasury=OlympusVerifyTreasury;local status=treasury and call(treasury.Status)
      local treasuryExpected=h.money>0 and status and status.enabled
      local transferId=treasuryExpected and call(treasury.MailTransferId627,index) or transferId627("mail")
      if treasuryExpected and not transferId then return end
      local pending=transferBase627("mail",transferId)
      pending.index=index;pending.header=h;pending.key=transferId;pending.mail={};pending.body=body;pending.beforeMoney=state.mailBalance;pending.beforeItems=beforeItems;pending.expected=expected;pending.treasuryExpected=treasuryExpected
      state.collecting=pending;saveTransfer627(pending)
      if treasuryExpected then pending.exclusiveClaimed=call(treasury.ClaimMailIntake242,index)==transferId;if not pending.exclusiveClaimed then pending.heldReason="mail_claim_unproved" end;saveTransfer627(pending) end
    end
    for _,name in ipairs({"TakeInboxMoney","TakeInboxItem","AutoLootMailItem"}) do if type(_G[name])=="function" then pcall(hooksecurefunc,name,taking) end end
  end
end
for _,event in ipairs({"PLAYER_LOGIN","MAIL_SHOW","MAIL_CLOSED","MAIL_INBOX_UPDATE","BAG_UPDATE_DELAYED","PLAYER_MONEY","PLAYER_LOGOUT",
  "TRADE_SHOW","TRADE_MONEY_CHANGED","TRADE_TARGET_ITEM_CHANGED","TRADE_PLAYER_ITEM_CHANGED","TRADE_ACCEPT_UPDATE","TRADE_REQUEST_CANCEL","TRADE_CLOSED","UI_INFO_MESSAGE",
  "CHAT_MSG_WHISPER","CHAT_MSG_WHISPER_INFORM","CHAT_MSG_ADDON","CHAT_MSG_GUILD","GUILD_ROSTER_UPDATE"}) do pcall(f.RegisterEvent,f,event) end
f:SetScript("OnEvent",function(_,event,...)
  if event=="PLAYER_LOGIN" then boot()
  elseif event=="MAIL_SHOW" then state.mailOpen=true;V.ScanMailbox()
  elseif event=="MAIL_CLOSED" then state.mailOpen=false
  elseif event=="MAIL_INBOX_UPDATE" then V.ScanMailbox()
  elseif event=="PLAYER_LOGOUT" then V.Flush("logout")
  elseif event=="BAG_UPDATE_DELAYED" or event=="PLAYER_MONEY" then settleMailCollection();finishTrade()
  elseif event=="TRADE_SHOW" then
    if not transferRoom627() then state.tradeCapacityBlocked627=true;return end
    local partner=text(call(GetUnitName,"npc",true),128) or text(call(UnitName,"npc"),128)
    local money=call(GetMoney)
    if state.trade then
      finishTrade()
      if state.trade then
        if not state.trade.complete then state.tradeUncertainUntil=time()+30 end
        if not holdTransfer627(clone(state.trade),"superseded_by_new_native_trade") then state.tradeCapacityBlocked627=true;return end
        local d=db();if d then d.tradeCollection242=nil end;state.trade=nil
      end
    end
    local treasury=OlympusVerifyTreasury;local status=treasury and call(treasury.Status)
    local treasuryExpected=status and status.enabled
    local transferId=treasuryExpected and call(treasury.TradeTransferId627) or transferId627("trade")
    if partner and type(money)=="number" and transferId then
      local pending=transferBase627("trade",transferId)
      pending.partner=partner;pending.guid=guid(call(UnitGUID,"npc"));pending.beforeMoney=money;pending.items=tradeItems();pending.incoming=call(GetTargetTradeMoney);pending.outgoing=call(GetPlayerTradeMoney)
      pending.ambiguous=time()<(state.tradeUncertainUntil or 0);pending.note=state.donationNote;pending.treasuryExpected=treasuryExpected
      state.trade=pending;saveTransfer627(pending)
      if treasuryExpected then pending.exclusiveClaimed=call(treasury.ClaimTradeIntake242)==transferId;if not pending.exclusiveClaimed then pending.heldReason="trade_claim_unproved" end;saveTransfer627(pending) end
    end
  elseif event=="TRADE_MONEY_CHANGED" or event=="TRADE_TARGET_ITEM_CHANGED" or event=="TRADE_PLAYER_ITEM_CHANGED" then if state.trade and not state.tradeCapacityBlocked627 then state.trade.items=tradeItems();state.trade.incoming=call(GetTargetTradeMoney);state.trade.outgoing=call(GetPlayerTradeMoney);state.trade.accepted=false;state.trade.moneyConfirmed=nil;state.trade.itemsConfirmed=nil;saveTransfer627(state.trade) end
  elseif event=="TRADE_ACCEPT_UPDATE" then local ours,theirs=...;if state.trade and not state.tradeCapacityBlocked627 then
    state.trade.items=tradeItems();state.trade.incoming=call(GetTargetTradeMoney);state.trade.outgoing=call(GetPlayerTradeMoney)
    state.trade.accepted=(ours==1 or ours==true) and (theirs==1 or theirs==true)
    state.trade.beforeItems={};for _,item in ipairs(state.trade.items) do if item.itemId then state.trade.beforeItems[item.itemId]=bagCount(item.itemId) end end
    saveTransfer627(state.trade)
  end
  elseif event=="TRADE_REQUEST_CANCEL" then
    if state.tradeCapacityBlocked627 then return end
    if state.trade then if not holdTransfer627(clone(state.trade),"native_trade_cancelled") then state.tradeCapacityBlocked627=true;return end;local d=db();if d then d.tradeCollection242=nil end end;state.trade=nil
  elseif event=="TRADE_CLOSED" then finishTrade()
  elseif event=="UI_INFO_MESSAGE" then local a,b=...;if state.trade and not state.tradeCapacityBlocked627 and (b or a)==(ERR_TRADE_COMPLETE or "Trade complete.") then state.trade.complete=true;state.trade.completedAt=state.trade.completedAt or time();saveTransfer627(state.trade);finishTrade() end
  elseif event=="CHAT_MSG_WHISPER" then
    local msg,sender=text(select(1,...),4096),text(select(2,...),128)
    if msg and sender and not verificationText(msg) then
      state["human:"..norm(sender)]=true
      if msg:lower():find("donat") or msg:lower():find("treasury") or msg:lower():find("%d+%s*[gsc]%f[%W]") then
        V.Queue({type="donation",source="whisper-declaration",character=sender,guid=guid(select(12,...)),donation={copper=0,items={},note=msg},evidence={kind="unconfirmed-declaration",confirmedLocal=false,automaticCredit=false}},"declaration|"..norm(sender).."|"..msg.."|"..math.floor(time()/30))
      end
    end
  elseif event=="CHAT_MSG_WHISPER_INFORM" then local msg,sender=...;if text(msg) and msg:sub(1,8)=="Olympus:" then closeVerificationWindow(sender) end
  elseif event=="CHAT_MSG_ADDON" then
    local prefix,message,distribution,sender=...
    if prefix=="OLV242" then receiveWire(message,sender,distribution)
    elseif prefix=="OLYMPUS" and text(message,255) and message:match("^PEND~[%w%-]+$") then mirrorBridge() end
  elseif event=="CHAT_MSG_GUILD" then
    -- A Blizzard event GUID is captured as raw evidence. No Discord ID is
    -- inferred from a display name or a chosen character name.
    local message,sender=text(select(1,...),4096),text(select(2,...),128)
    if message and sender then local d=db();if d then d.nativeGuildChatLast={at=time(),sender=sender,senderGuid=guid(select(12,...)),identityQualified=false} end end
    nativeDiscord(select(18,...))
  elseif event=="GUILD_ROSTER_UPDATE" then
    state.guildRosterAt=time();state.collectorCache626=nil;officerButton()
    local pending=state.pendingACKs or {};state.pendingACKs={}
    for _,item in pairs(pending) do applyBridgeACK(item.message,item.sender) end
  end
end)

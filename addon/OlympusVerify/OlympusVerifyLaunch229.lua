-- .229 launch operations. Projections expire; only explicit slash/button hardware paths may act.
-- No event/timer handler invites, promotes, removes or sets MOTD. Unknown unguilded proof stays held.
local ADDON = ...
local Q = { generation = 0, pending = {}, continuations = {}, sessionPromotions = {} }
OlympusLaunch229 = Q
local H, cfg = OlympusHmac, OlympusVerifyConfig or {}
local DirectiveIntent
local DiscoveryControlCurrent
local function Say(text) DEFAULT_CHAT_FRAME:AddMessage("|cffc9a227Olympus|r: " .. text) end
local function Text(value, limit)
  if type(issecretvalue) == "function" then local ok, secret = pcall(issecretvalue, value); if not ok or secret then return nil end end
  return type(value) == "string" and #value <= (limit or 128) and not value:find("[%c|]") and value or nil
end
local function Number(value, low, high)
  if type(issecretvalue) == "function" then local ok, secret = pcall(issecretvalue, value); if not ok or secret then return false end end
  return type(value) == "number" and value == value and value == math.floor(value) and value >= low and value <= high
end
local function Read(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, value = pcall(fn, ...)
  if not ok then return nil end
  if type(issecretvalue) == "function" then local known, secret = pcall(issecretvalue, value); if not known or secret then return nil end end
  return value
end
function Q.CanonicalGuild(value)
  value = Text(value, 96)
  if not value then return nil end
  value = value:match("^%s*(.-)%s*$"):lower()
  if value == "olympus prime" or value == "olympus" or value == "olympus i" then return "OLYMPUS PRIME" end
  for _, numeral in ipairs({ "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X" }) do
    if value == "olympus " .. numeral:lower() then return "Olympus " .. numeral end
  end
end
local function RawIdentity()
  if Read(IsInGuild) ~= true or type(GetGuildInfo) ~= "function" then return nil end
  local ok, guild, _, rank = pcall(GetGuildInfo, "player")
  guild = ok and Text(guild) or nil
  local realm, guid = Text(Read(GetRealmName)), Text(Read(UnitGUID, "player"), 40)
  if not guild or guild ~= guild:match("^%s*(.-)%s*$") or not realm or realm=="" or not guid or not Number(rank,0,9) then return nil end
  return {guild=guild,realm=realm,guid=guid,rank=rank}
end
local function SameIdentity(a,b)
  return a and b and a.guild==b.guild and a.realm==b.realm and a.guid==b.guid
end
local function Identity()
  local value=RawIdentity()
  if not value or Q.CanonicalGuild(value.guild)~="OLYMPUS PRIME" or not H or type(H.sha256hex)~="function" then return nil end
  value.scopeHash=H.sha256hex("native-scope|1|"..value.guild.."|"..value.realm):sub(1,16)
  return value
end
Q.identityBaseline=RawIdentity()
local function Preview()
  return OlympusVerifyUI and OlympusVerifyUI.preview ~= nil
    or OlympusVerifyPreview and OlympusVerifyPreview.State and OlympusVerifyPreview.State() ~= nil
end
-- Diagnostics describe only the projection already loaded in this Lua session.
-- Unknown source strings never become UI text or an instruction to retry.
local LOADED_STATES = {
  ["rate-limited"] = { "Rate limited (last loaded)", "The last loaded scan stopped after an upstream rate limit.", "Staff must review the upstream limit and original scan before separately authorized recovery." },
  ["rate-limited-wait"] = { "Rate-limit wait (last loaded)", "The last loaded scan reported a bounded read-only rate-limit wait; its action hold remains.", "Wait for a newer returned projection, then load it through the approved workflow. The loaded report does not establish the Watcher's current state." },
  ["rate-limit-retries-exhausted"] = { "Rate-limit retries spent (last loaded)", "The last loaded scan exhausted its bounded same-page rate-limit retries.", "Staff must review the stopped original and the upstream limit before authorizing any fresh scan; this view cannot restart it." },
  ["rate-limit-exceeds-scan"] = { "Rate limit exceeds scan window (last loaded)", "The reported retry delay would exceed the original scan window.", "Keep the expired or stopped original intact; obtain a separately authorized fresh trusted scan instead of extending its timestamps." },
  ["discovery-budget-exhausted"] = { "Discovery budget spent (last loaded)", "The last loaded scan exhausted its bounded discovery request budget.", "Staff must review the incomplete coverage and original budget before authorizing a fresh scan." },
  ["refresh-budget-exhausted"] = { "Recheck budget spent (last loaded)", "The last loaded scan exhausted its bounded recheck attempt budget (including rate-limit retries).", "Do not reset its counters; staff must review the original source and authorize any later fresh scan." },
  ["source-unknown"] = { "Source reply unknown (last loaded)", "The last loaded scan could not establish a source reply.", "Staff must inspect the original source outcome and connection; an unknown result is not permission to repeat a member request or native action." },
  ["source-refused"] = { "Source refused (last loaded)", "The last loaded scan reports a refused source read; no specific authentication cause is established here.", "Staff must check the original authenticated source result. This view does not change credentials or retry it." },
  ["operator-stopped"] = { "Operator stopped (last loaded)", "The original scan was explicitly stopped.", "An operator must review the stopped original before authorizing any new scan." },
  superseded = { "Superseded (last loaded)", "The local control no longer matches the loaded scan.", "Wait for the matching returned projection; an old result cannot satisfy the new control." },
  ["scan-expired"] = { "Scan expired (last loaded)", "The original scan has expired.", "Obtain a separately authorized fresh scan; changing displayed dates cannot restore eligibility." },
  ["source-held"] = { "Source held (last loaded)", "The last loaded scan reports a source hold or an unsupported stop reason.", "Staff must review the source; this view does not reset or retry it." },
  running = { "Discovery running (last loaded)", "The last loaded projection reported discovery in progress.", "Wait for a newer returned projection. The Watcher's current process and disk state are not observable here." },
  complete = { "Discovery complete (last loaded)", "The loaded projection reports completed discovery; action freshness remains separate.", "Inspect each original page deadline and exact native target before any hardware action." },
  partial = { "Discovery incomplete (last loaded)", "The loaded projection contains only partial discovery.", "Unscanned members have no eligibility result; staff must review the source before further work." },
}
local LOADED_STOP = { ["rate-limited"]=true,["rate-limited-wait"]=true,["rate-limit-retries-exhausted"]=true,
  ["rate-limit-exceeds-scan"]=true,["discovery-budget-exhausted"]=true,["refresh-budget-exhausted"]=true,
  ["source-unknown"]=true,["source-refused"]=true,["operator-stopped"]=true,["scan-expired"]=true,["source-held"]=true }
local function LoadedScan(data, current, control, now)
  local code
  if control and control.action == "stop" then code = "operator-stopped"
  elseif control and control.id ~= data.controlId then code = "superseded"
  elseif data.stoppedReason then
    local stop=Text(data.stoppedReason,64)
    code=stop and LOADED_STOP[stop] and stop or "source-held"
  else code = data.running == true and "running" or current.scanComplete and "complete" or "partial" end
  local spec = LOADED_STATES[code]
  local report = { code=code, label=spec[1], reason=spec[2], nextStep=spec[3],
    total=current.pages[1].entitlements.total, queriedAt=0, scanExpiresAt=current.pages[1].scan.expiresAt,
    stalePages=current.stalePages, scanned=0, progressKnown=true }
  for index,page in ipairs(current.pages) do
    report.queriedAt=math.max(report.queriedAt,page.fetchedAt)
    local e=page.entitlements
    if not Number(e.scanned,0,20) or e.scanned>math.max(0,e.total-e.offset)
      or not Number(e.unscanned,0,1000) or e.unscanned~=math.max(0,e.total-e.offset-e.scanned)
      or index<#current.pages and e.scanned~=20 then report.progressKnown=false
    else report.scanned=report.scanned+e.scanned end
    if Number(e.retryAfterSeconds,1,86400) then report.retryAfterSeconds=e.retryAfterSeconds end
  end
  if report.progressKnown then report.unscanned=report.total-report.scanned
  else report.scanned=nil end
  report.expiryState=now>=report.scanExpiresAt and "scan-expired" or report.stalePages>0 and "pages-expired" or "original-window"
  if report.expiryState=="scan-expired" and not current.actionHeld then report.label="Scan expired (last loaded)" end
  report.summary=report.label..(report.progressKnown and string.format(": %d/%d inspected; %d unscanned.",report.scanned,report.total,report.unscanned) or "; inspection counts unavailable.")
  if report.expiryState~="original-window" then report.summary=report.summary.." Expired source is advisory." end
  report.reason=report.reason.." "..report.summary
  if report.progressKnown and report.unscanned>0 then report.reason=report.reason.." Zero recommendations in the inspected pages is not a full-roster eligibility result." end
  if report.retryAfterSeconds then report.reason=report.reason.." Source reported Retry-After "..report.retryAfterSeconds.."s; this is a dated hint, not a live countdown or permission to act." end
  if now>=report.scanExpiresAt then report.reason=report.reason.." The original scan is now expired; all rows are advisory."
  elseif report.stalePages>0 then report.reason=report.reason.." "..report.stalePages.." original page(s) are now expired and advisory." end
  report.reason=report.reason.." This reports loaded evidence, not whether the Watcher is alive or currently waiting."
  return report
end
local function HistoricalCurrent(data, selectedPage, selectedTTL)
  local pageTTL = selectedPage and selectedTTL == 600 and 600 or 60
  local identity, now = Identity(), time()
  local function refuse(code, reason) return nil, "[" .. code .. "] " .. reason, code end
  if cfg.membershipOnly ~= true or not identity then return nil, "Current native Prime identity is unavailable; launch actions held." end
  if Q.scopeChanged then return nil, "Native guild identity changed. Refresh the watcher and reload; launch actions held." end
  if (Q.loadedIdentity or Q.identityBaseline) and not SameIdentity(Q.loadedIdentity or Q.identityBaseline,identity) then
    Q.scopeChanged = true; return nil, "Native guild/character identity changed; launch actions held." end
  if Preview() then return nil, "Preview is display only; launch actions held." end
  if type(data) ~= "table" then return refuse("projection_missing", "No dated launch projection is loaded; no action taken.") end
  if data.version ~= 3 then return refuse("projection_version", "The loaded launch container version is incompatible; no action taken.") end
  if type(data.pages) ~= "table" or #data.pages < 1 or #data.pages > 50 then
    local stop=Text(data.stoppedReason,64)
    local spec=stop and LOADED_STOP[stop] and LOADED_STATES[stop]
    return refuse("projection_pages", "No supported launch page list is loaded; no action taken."
      ..(spec and (" Unvalidated loaded container reports: "..spec[1]..". "..spec[2].." Next step: "..spec[3]) or "")) end
  local control = OlympusVerifyDB and OlympusVerifyDB.launchControl
  local held = data.stoppedReason or not selectedPage and not DiscoveryControlCurrent(control,identity,data.controlId,now)
  local result = { identity = identity, invites = {}, promotions = {}, riskBuffer = {}, held = {}, rankHeld = false, partial = data.scanComplete ~= true,
    pages = data.pages, actionHeld = held, freshness = {}, scanComplete = data.scanComplete == true, stalePages = 0 }
  local first, guids = data.pages[1], {}
  if type(first) ~= "table" then return refuse("malformed_page", "The first launch page is malformed; no action taken.") end
  local protocol=first.protocol
  if protocol~="officer-operations-v234" and (selectedPage or protocol~="officer-operations-v235") then
    return refuse("page_protocol", "The loaded launch page protocol is incompatible with this purpose. No action taken; obtain a compatible source projection.") end
  if type(first) ~= "table" or type(first.scan) ~= "table" or not Text(first.scan.id, 32) or #first.scan.id ~= 32
    or not first.scan.id:match("^%x+$") or not Number(first.scan.startedAt, 1, now + 5)
    or not Number(first.scan.expiresAt, first.scan.startedAt + 1, first.scan.startedAt + 600) then
    return refuse("malformed_scan", "The original launch scan identity or clock bounds are malformed; no action taken.") end
  if type(first.entitlements) ~= "table" or not Number(first.entitlements.total, 0, 1000) then
    return refuse("malformed_entitlements", "The first launch page's entitlement metadata is malformed; no action taken.") end
  for index, page in ipairs(data.pages) do
    if type(page) ~= "table" then return refuse("malformed_page", "A launch page is malformed; no action taken.") end
    if page.protocol~=protocol then
      return refuse("page_protocol", "Launch pages have different source purposes; no action taken.") end
    local ranks=OlympusVerifyNativeRankConstants
    local rankQualified=ranks and page.rankProfile==ranks.profile and page.rankSchemeDigest==ranks.digest
      and OlympusVerifyNativeRanks and OlympusVerifyNativeRanks.Qualified({version=1,names=page.rankNames})
    local rankReason
    if type(page.heldReasons)=="table" then
      for _,reason in ipairs(page.heldReasons) do
        if reason=="directive-rank-policy-held" or reason=="native-rank-scheme-unconfirmed" then rankReason=reason;break end
      end
    end
    local rankHeld=not selectedPage and protocol=="officer-operations-v235" and page.status=="partial"
      and page.rankProfile==nil and page.rankSchemeDigest==nil and page.rankNames==nil and rankReason
      and type(page.promotions)=="table" and next(page.promotions)==nil and type(page.riskBuffer)=="table" and next(page.riskBuffer)==nil
    if not rankQualified and not rankHeld then
      return refuse("rank_scheme", "The complete Directive rank table is unconfirmed; rank-dependent actions are held.") end
    if index>1 and (page.rankProfile~=first.rankProfile or page.rankSchemeDigest~=first.rankSchemeDigest
      or rankHeld~=result.rankHeld) then return refuse("rank_scheme", "Launch pages have different rank authority states; no action taken.") end
    if rankHeld then result.rankHeld=rankHeld;result.rankHeldReason=rankReason end
    if page.status ~= "ready" and page.status ~= "partial" then
      return refuse("page_status", "A launch page is not in a supported ready or partial source state; no action taken.") end
    if not Number(page.fetchedAt, 1, 2147483647) or not Number(page.expiresAt, page.fetchedAt, page.fetchedAt + pageTTL)
      or page.fetchedAt > now + 5 or not Number(page.snapshotAt, 1, page.fetchedAt)
      or page.fetchedAt - page.snapshotAt >= 600 or not Number(page.snapshotId, 1, 2147483647) then
      return refuse("malformed_page_dates", "A launch page has invalid original source clocks or snapshot identity; no action taken.") end
    if page.guild ~= identity.guild or page.realm ~= identity.realm or page.scopeHash ~= identity.scopeHash or page.canonicalGuild ~= "OLYMPUS PRIME" then
      return refuse("native_scope_mismatch", "The loaded launch projection does not match this current native Prime guild and realm scope; no action taken.") end
    if page.snapshotId ~= first.snapshotId or page.snapshotAt ~= first.snapshotAt
      or type(page.scan) ~= "table" or page.scan.id ~= first.scan.id or page.scan.startedAt ~= first.scan.startedAt or page.scan.expiresAt ~= first.scan.expiresAt
      or page.scan.expiresAt > page.snapshotAt + 600 or page.fetchedAt < page.scan.startedAt or page.fetchedAt >= page.scan.expiresAt then
      return refuse("original_scan_mismatch", "Launch pages do not share the same original snapshot and scan bounds; no action taken.") end
    if type(page.entitlements) ~= "table" or (not selectedPage and page.entitlements.offset ~= (index-1)*20)
      or selectedPage and (not Number(page.entitlements.offset,0,980) or page.entitlements.offset%20~=0)
      or page.entitlements.total ~= first.entitlements.total then
      return refuse("malformed_entitlements", "A launch page's entitlement offset or total does not match the original page sequence; no action taken.") end
    if type(page.invites) ~= "table" or #page.invites > 3 or index ~= 1 and #page.invites ~= 0 then
      return refuse("unsupported_invitations", "The launch projection contains unsupported invitation placement or count; no action taken.") end
    if type(page.actions) ~= "table" or page.actions.automatic ~= false or page.actions.roleGrants ~= false
      or page.actions.removals ~= false or page.actions.requiresNativeRecheck ~= true then
      return refuse("unsupported_action_policy", "The launch projection does not preserve the required hardware-only action policy; no action taken.") end
    if now >= page.expiresAt or now >= page.scan.expiresAt then result.stalePages = result.stalePages + 1 end
    local queueIds, proofIds = {}, {}
    for _, label in ipairs({ "invites", "promotions", "riskBuffer", "held" }) do
      local rows = page[label]
      if type(rows) ~= "table" or #rows > 20 then return nil, "Malformed launch projection; no action taken." end
      for _, row in ipairs(rows) do
        if type(row) ~= "table" or not Text(row.name, 100) or row.name == "" or not Text(row.guid, 40)
          or not row.guid:match("^Player%-%d+%-%x+$") or guids[row.guid] then return nil, "Ambiguous launch identities; no action taken." end
        guids[row.guid] = true
        result.freshness[row.guid] = { expiresAt = page.expiresAt, scanExpiresAt = page.scan.expiresAt, offset = page.entitlements.offset,
          snapshotId=page.snapshotId, contextId=page.scan.id, row=row, page=page, actionHeld=held, kind="discovery" }
        if label == "invites" then
          if not Number(row.queueId,1,2147483647) or queueIds[row.queueId] or not Text(row.proofId,32) or #row.proofId~=32 or not row.proofId:match("^[0-9a-f]+$") or proofIds[row.proofId]
            or not Text(row.fullName,100) or H.normalizeCharacter(row.fullName)~=H.normalizeCharacter(row.name) or row.scopeHash~=identity.scopeHash
            or not Number(row.observedAt,1,page.fetchedAt+5) or not Number(row.expiresAt,row.observedAt+1,row.observedAt+60)
            or row.reason~="knight-unguilded" or row.source~="native-who-whisper-v242" then return nil,"Unsupported invitation proof; no action taken." end
          queueIds[row.queueId],proofIds[row.proofId]=true,true
          result.freshness[row.guid].expiresAt=math.min(page.expiresAt,row.expiresAt)
        elseif label == "promotions" then
          if not Number(row.currentSlot, 6, 9) or not Number(row.targetSlot, 0, 9) or row.targetSlot >= row.currentSlot
            or not ((row.targetSlot == 5 and row.targetName == "Veteran" and row.reason == "knight-veteran")
              or (row.targetSlot == 7 and row.targetName == "Member" and row.reason == "verified-initiate" and (row.currentSlot == 9 or selectedPage and row.currentSlot==8)))
            or selectedPage and not DirectiveIntent(row,page,identity,now) then
            return refuse("unsupported_promotion_target", "The launch projection contains a malformed or unsupported promotion target; no action taken.") end
        elseif label == "riskBuffer" and (row.currentSlot ~= 9 or row.reviewOnly ~= true or row.reason ~= "unverified-initiate") then
          return nil, "Unsupported risk-buffer entry; no action taken."
        end
        result[label][#result[label] + 1] = row
      end
    end
  end
  result.loadedScan=LoadedScan(data,result,control,now)
  Q.loadedIdentity = identity
  return result
end
-- A selected read is independent evidence. Discovery bytes and clocks stay intact.
local function ExactKeys(value, allowed)
  if type(value)~="table" or getmetatable(value)~=nil then return false end
  for key in pairs(value) do if not allowed[key] then return false end end
  return true
end
DiscoveryControlCurrent=function(control,identity,id,now)
  if not ExactKeys(control,{version=true,action=true,id=true,observedAt=true,scopeHash=true,guid=true,offset=true,mac=true})
    or control.version~=1 or (control.action~="scan" and control.action~="recheck") or control.id~=id
    or not Text(control.id,32) or not Number(control.observedAt,1,now+5) or control.id:match("^(%d+):%d+$")~=tostring(control.observedAt)
    or control.scopeHash~=identity.scopeHash or control.guid~=identity.guid or not Number(control.offset,0,980) or control.offset%20~=0
    or control.action=="scan" and control.offset~=0 or not Text(control.mac,32) or #control.mac~=32
    or not Text(cfg.secret,1024) or type(H.hmacSha256hex)~="function" then return false end
  local message=table.concat({"launch-control","1",control.action,control.id,tostring(control.observedAt),identity.scopeHash,identity.guid,tostring(control.offset)},"|")
  return control.mac==H.hmacSha256hex(cfg.secret,message):sub(1,32)
end
local INTENT_KEYS={version=true,id=true,actorGuid=true,targetGuid=true,name=true,subjectDigest=true,rankProfile=true,rankSchemeDigest=true,
  originSnapshotId=true,originSnapshotAt=true,originContext=true,startSlot=true,finalSlot=true,reason=true,issuedAt=true,expiresAt=true,
  acknowledgedSteps=true,lastSnapshotId=true,lastObservedAt=true}
DirectiveIntent=function(row,page,identity,now)
  local p,ranks=row.intent,OlympusVerifyNativeRankConstants
  if not ranks or not ExactKeys(p,INTENT_KEYS) or p.version~=1 or not Text(p.id,160) or #p.id<8
    or p.actorGuid~=identity.guid or p.targetGuid~=row.guid or p.targetGuid==identity.guid or p.name~=row.name
    or not Text(p.subjectDigest,64) or #p.subjectDigest~=64 or not p.subjectDigest:match("^[0-9a-f]+$")
    or p.rankProfile~=ranks.profile or p.rankSchemeDigest~=ranks.digest
    or not Number(p.originSnapshotId,1,2147483647) or not Number(p.originSnapshotAt,1,now+5)
    or not Text(p.originContext,32) or #p.originContext~=32 or not p.originContext:match("^[0-9a-f]+$")
    or not Number(p.startSlot,6,9) or p.finalSlot~=row.targetSlot or p.reason~=row.reason
    or not ((p.finalSlot==5 and p.reason=="knight-veteran") or (p.finalSlot==7 and p.startSlot==9 and p.reason=="verified-initiate"))
    or not Number(p.acknowledgedSteps,0,p.startSlot-p.finalSlot-1) or row.currentSlot~=p.startSlot-p.acknowledgedSteps
    or not Number(p.issuedAt,p.originSnapshotAt,now+5) or not Number(p.expiresAt,p.issuedAt+1,p.issuedAt+600)
    or page.expiresAt>p.expiresAt or p.lastSnapshotId~=page.snapshotId or p.originSnapshotId>p.lastSnapshotId
    or not Number(p.lastObservedAt,p.originSnapshotAt,page.snapshotAt)
    or p.acknowledgedSteps==0 and p.lastSnapshotId~=p.originSnapshotId or p.acknowledgedSteps>0 and p.lastSnapshotId<=p.originSnapshotId
    or not Text(row.intentToken,4096) or not row.intentToken:match("^[%w_%-]+%.[0-9a-f]+$") then return false end
  return true
end
local SELECT_KEYS={version=true,protocol=true,controlId=true,actorGuid=true,targetGuid=true,scopeHash=true,observedAt=true,
  snapshotId=true,snapshotAt=true,startedAt=true,expiresAt=true,running=true,stoppedReason=true,attempts=true,completed=true,page=true,coveredGuids=true}
local SELECT_CONTROL={version=true,action=true,id=true,observedAt=true,scopeHash=true,guid=true,targetGuid=true,mac=true}
local BATCH_CONTROL={version=true,action=true,id=true,observedAt=true,scopeHash=true,guid=true,targetGuids=true,confirmations=true,mac=true}
local BATCH_KEYS={version=true,protocol=true,controlId=true,actorGuid=true,targetGuids=true,targetsDigest=true,coverageKind=true,confirmations=true,scopeHash=true,observedAt=true,
  snapshotId=true,snapshotAt=true,startedAt=true,expiresAt=true,running=true,stoppedReason=true,attempts=true,completed=true,page=true,coveredGuids=true}
-- GUIDs contain only this fixed alphabet, so canonical JSON needs no free-text escaping.
local function BatchTargets(value, sorted)
  if type(value)~="table" or getmetatable(value)~=nil or #value<1 or #value>20 then return nil end
  local copy,seen,count={}, {},0
  for key,id in pairs(value) do
    if not Number(key,1,#value) or not Text(id,40) or not id:match("^Player%-%d+%-%x+$") or seen[id] then return nil end
    seen[id],count=true,count+1;copy[key]=id
  end
  if count~=#value then return nil end
  if sorted then
    for i=2,#copy do if copy[i-1]>=copy[i] then return nil end end
  else table.sort(copy) end
  local encoded={};for i,id in ipairs(copy) do encoded[i]='"'..id..'"' end
  return copy,"["..table.concat(encoded,",").."]",table.concat(copy,",")
end
local function ValidSelect(control,identity,now)
  local batch=type(control)=="table" and control.version==4 and control.action=="select-directive"
  if not ExactKeys(control,batch and BATCH_CONTROL or SELECT_CONTROL)
    or not batch or not Text(control.confirmations,65536)
    or not Text(control.id,32) or not Number(control.observedAt,1,now+5) or control.id:match("^(%d+):%d+$")~=tostring(control.observedAt)
    or control.scopeHash~=identity.scopeHash or control.guid~=identity.guid or not Text(control.mac,32) or #control.mac~=32
    or not Text(cfg.secret,1024) or not H or type(H.hmacSha256hex)~="function" then return false end
  local targets,encoded,joined
  if batch then targets,encoded,joined=BatchTargets(control.targetGuids,true)
  elseif Text(control.targetGuid,40) and control.targetGuid:match("^Player%-%d+%-%x+$") then targets,joined={control.targetGuid},control.targetGuid end
  if not targets then return false end
  local message=table.concat({"launch-selected-read","4","select-directive",control.id,tostring(control.observedAt),control.scopeHash,control.guid,joined,control.confirmations},"|")
  if control.mac~=H.hmacSha256hex(cfg.secret,message):sub(1,32) then return false end
  return targets,batch,encoded
end
local SELECT_HOLDS={
  ["native-roster-receipt-required"]="A fresh native roster ACK is required. Recheck this selected GUID after a complete current native export is accepted; no older ACK is borrowed.",
  ["native-roster-changed-or-expired"]="The pending native source changed or expired. Make a new explicit selected read from the current complete roster; the old request stays held.",
  ["rate-limit-retries-exhausted"]="The selected read exhausted its three rate-limit attempts. Keep it stopped and review the current source before a new explicit read.",
  ["rate-limit-exceeds-scan"]="The known cooldown exceeds the original selected-read deadline. A later explicit read needs a fresh native source; dates are unchanged.",
  ["selection-admission-expired"]="The initial selected-read admission window expired. Make a new explicit selected read; this request is not restarted.",
  ["selected-target-unavailable"]="The selected GUID is missing or ambiguous in the accepted native source. Refresh the native roster and select the exact current character again.",
  ["invalid-selected-page"]="The selected response was invalid or incompatible. Ask staff to review the source; no historical positive is restored.",
  ["source-unknown"]="The selected response was unknown. Keep this request stopped and inspect Watcher/status before any new explicit read.",
  ["source-refused"]="The selected source was refused. Ask staff to review the current source and access; no promotion is ready.",
  ["source-held"]="The selected source held eligibility. Review the current target with staff; display verification cannot clear that hold.",
  ["scan-expired"]="The original selected-read context expired. Make a new explicit selected read; its old dates remain unchanged.",
  ["operator-stopped"]="The selected read was explicitly stopped. It cannot resume automatically; a later read is a separate explicit request.",
  ["superseded"]="A newer control superseded this selected read. Load the matching current result; no old action authority is restored.",
  ["rate-limited-wait"]="The last loaded selected read reports a known rate-limit wait. Keep its original request and load its later result; this view cannot observe the Watcher process.",
}
local function SelectedCurrent(identity, now, control)
  local data=OlympusLaunchSelected
  local targets,batch,encoded=ValidSelect(control,identity,now)
  if not targets then return nil end
  local requested={};for _,id in ipairs(targets) do requested[id]=true end
  local held={targetGuid=targets[1],targetGuids=batch and targets or nil,covered=requested,state="pending",reason="The selected read is awaiting a matching result; its historical recommendation is held."}
  if not ExactKeys(data,BATCH_KEYS) or data.version~=2 or data.protocol~="promotion-selection-directive-v1" or data.confirmations~=control.confirmations
    or data.controlId~=control.id or data.actorGuid~=identity.guid or not batch and data.targetGuid~=control.targetGuid
    or data.scopeHash~=identity.scopeHash or data.observedAt~=control.observedAt or data.startedAt~=data.observedAt
    or not Number(data.observedAt,1,now+5) or type(data.running)~="boolean" or type(data.completed)~="boolean"
    or not Number(data.attempts,0,3) or data.stoppedReason~=nil and not Text(data.stoppedReason,64) then return held end
  if batch then
    local returned,returnedJSON=BatchTargets(data.targetGuids,true)
    if not returned or returnedJSON~=encoded or data.coverageKind~="selected-guids" or type(H.sha256hex)~="function"
      or data.targetsDigest~=H.sha256hex(encoded) then return held end
  end
  held.state=data.running and "pending" or "held"
  held.reason=SELECT_HOLDS[data.stoppedReason] or (data.running
    and "The last loaded selected read is pending. Load its later dated result; this view cannot observe the Watcher process."
    or "The selected read is held or incomplete. Review the current source with staff; its historical recommendation remains advisory.")
  if not data.completed or data.running or data.stoppedReason~=nil then return held end
  if not Number(data.snapshotId,1,2147483647) or not Number(data.snapshotAt,1,now+5)
    or data.expiresAt~=math.min(data.observedAt+600,data.snapshotAt+600) or not Number(data.expiresAt,data.startedAt+1,data.startedAt+600)
    or type(data.coveredGuids)~="table" or #data.coveredGuids<1 or #data.coveredGuids>20 or type(data.page)~="table" then return held end
  local covered={}
  for key,value in pairs(data.coveredGuids) do
    if not Number(key,1,#data.coveredGuids) or not Text(value,40) or not value:match("^Player%-%d+%-%x+$") or covered[value] then return held end
    covered[value]=true
  end
  if batch then
    if #data.coveredGuids~=#targets then return held end
    for i,id in ipairs(targets) do if data.coveredGuids[i]~=id then return held end end
  elseif not covered[data.targetGuid] then return held end
  local page=data.page
  if type(page.entitlements)~="table" or page.entitlements.scanned~=#data.coveredGuids or page.entitlements.pageSize~=20
    or not Number(page.entitlements.total,1,1000) or page.memberCount~=page.entitlements.total
    or not Number(page.entitlements.offset,0,980) or page.entitlements.offset%20~=0
    or batch and (page.entitlements.offset~=0 or page.entitlements.scanned~=#targets or #targets>page.entitlements.total)
    or not batch and page.entitlements.scanned~=math.min(20,page.entitlements.total-page.entitlements.offset)
    or page.entitlements.unscanned~=math.max(0,page.entitlements.total-page.entitlements.offset-page.entitlements.scanned)
    or page.entitlements.retryAfterSeconds~=nil or type(page.invites)~="table" or next(page.invites)~=nil
    or type(page.riskBuffer)~="table" or next(page.riskBuffer)~=nil then return held end
  if page.snapshotId~=data.snapshotId or page.snapshotAt~=data.snapshotAt or type(page.scan)~="table"
    or page.scan.startedAt~=data.startedAt or page.scan.expiresAt~=data.expiresAt
    or not Number(page.fetchedAt,data.observedAt,now+5) or not Number(page.expiresAt,page.fetchedAt,data.expiresAt)
    or page.nextCursor~=nil or page.pageCursor~=nil then return held end
  -- The owner's longer window applies only to new selected-promotion observations.
  -- Legacy selected results and all discovery actions keep their original 60-second cap.
  local checked=HistoricalCurrent({version=3,controlId=control.id,scanComplete=false,pages={page}},true,600)
  if not checked then return held end
  for _,kind in ipairs({"promotions","held","riskBuffer"}) do
    for _,row in ipairs(checked[kind]) do if not covered[row.guid] then return held end end
  end
  held={targetGuid=targets[1],targetGuids=batch and targets or nil,state="complete",reason=batch
      and ("The explicit "..#targets.."-GUID check is loaded with its original dates. Each promotion requires a separate hardware click and current native checks.")
      or "The selected page is loaded with its original observation dates. A separate hardware click must recheck the current native target.",
    completed=true,page=page,covered=covered,checked=checked,controlId=data.controlId}
  return held
end
function Q.Current()
  local current,why,code=HistoricalCurrent(OlympusLaunchQueue,false)
  local identity,now=Identity(),time()
  if cfg.membershipOnly~=true or not identity or Q.scopeChanged or Preview() then return current,why,code end
  if Q.identityBaseline and not SameIdentity(Q.identityBaseline,identity) then Q.scopeChanged=true;return nil,"Native identity changed; launch actions held." end
  local control=OlympusVerifyDB and OlympusVerifyDB.launchControl
  local selection=SelectedCurrent(identity,now,control)
  if not selection then return current,why,code end
  if not current then
    current={identity=identity,invites={},promotions={},riskBuffer={},held={},pages={},actionHeld=true,freshness={},scanComplete=false,partial=true,stalePages=0}
  end
  current.selection=selection
  local covered=selection.covered or {[selection.targetGuid or ""]=true}
  -- Supersede positive AND negative display rows, even if this result has no recommendation.
  if selection.completed then
    for _,kind in ipairs({"promotions","held","riskBuffer"}) do
      local keep={}
      for _,row in ipairs(current[kind]) do if not covered[row.guid] then keep[#keep+1]=row end end
      for _,row in ipairs(selection.checked[kind]) do keep[#keep+1]=row end
      current[kind]=keep
    end
  end
  for id in pairs(covered) do
    if selection.completed then
      local source=selection.checked.freshness[id]
      if source then source.kind="selected";source.actionHeld=false;source.controlId=selection.controlId;current.freshness[id]=source
      else current.freshness[id]={kind="selected",actionHeld=true,page=selection.page,controlId=selection.controlId} end
    elseif current.freshness[id] then current.freshness[id].actionHeld=true end
  end
  return current
end
local function RequestRoster()
  local cg = type(C_GuildInfo) == "table" and C_GuildInfo or {}
  local fn = type(cg.GuildRoster) == "function" and cg.GuildRoster or GuildRoster
  if type(fn) == "function" then pcall(fn) end
end
local function NativeRoster(identity)
  if not Q.rosterAt or time() < Q.rosterAt or time() - Q.rosterAt > 15 then RequestRoster(); return nil, "Refresh the native roster, then click again." end
  if Read(GetGuildRosterShowOffline) ~= true then return nil, "A complete native offline-inclusive roster is required." end
  local count = Read(GetNumGuildMembers)
  if not Number(count, 1, 1000) or type(GetGuildRosterInfo) ~= "function" then return nil, "Native roster is unknown." end
  local ranks=OlympusVerifyNativeRanks
  local beforeRanks=ranks and ranks.Observe()
  if not ranks or not ranks.Qualified(beforeRanks) then return nil,"The complete Directive rank table is unconfirmed; no rank action is ready." end
  local rows, names = {}, {}
  for index = 1, count do
    local ok, name, rank, slot, level, _, _, note, officerNote, online, _, _, _, _, _, _, _, guid = pcall(GetGuildRosterInfo, index)
    name, guid = ok and Text(name, 100), ok and Text(guid, 40)
    rank=ok and Text(rank,96)
    local key = name and H.normalizeCharacter(name)
    if not name or not guid or not key or not Number(slot, 0, 9) or rank~=beforeRanks.names[slot+1] or rows[guid] or names[key] then return nil, "Native roster or its rank labels are incomplete or ambiguous." end
    local onlineKnown = type(online) == "boolean"
    if type(issecretvalue) == "function" then local known, secret = pcall(issecretvalue, online); if not known or secret then onlineKnown = false end end
    rows[guid] = { name = name, guid = guid, slot = slot, rank=rank, level = level, note = note, officerNote = officerNote,
      online = onlineKnown and online == true, onlineKnown = onlineKnown, index = index }
    names[key] = true
  end
  local final = Identity()
  if not final or final.guild ~= identity.guild or final.realm ~= identity.realm or final.guid ~= identity.guid or final.rank~=identity.rank then return nil, "Native identity changed; no action taken." end
  if not ranks.Same(beforeRanks,ranks.Observe()) then return nil,"The native rank table changed during observation; no rank action is ready." end
  return rows
end
local function ActionContext()
  local current, why = Q.Current()
  if not current then return nil, why end
  if Read(InCombatLockdown) ~= false then return nil, "Leave combat before a hardware action." end
  local roster, held = NativeRoster(current.identity)
  if not roster then return nil, held end
  return current, roster
end
local function ActionFresh(current,source)
  if type(source)~="table" or not Number(source.expiresAt,1,2147483647) or not Number(source.scanExpiresAt,1,2147483647) then return false end
  local held=source.actionHeld
  if held==nil then held=current.actionHeld end
  return not held and time()<source.expiresAt and time()<source.scanExpiresAt
end
function Q.Print()
  Q.PrintPromotionCustody()
  local current, why = Q.Current()
  if not current then Say(why); return false end
  Say(string.format("Launch projection: %d promotion(s), %d risk review(s), %d held; %s. No automatic actions.",
    #current.promotions, #current.riskBuffer, #current.held, current.partial and "partial discovery" or "discovery complete"))
  Say("Discovery and action freshness are separate. Stale rows are advisory; Scan/Stop/Recheck are explicit local controls.")
  Say("Knight invites require an original remote whisper GUID and changed explicit empty-guild WHO result. Unknown remains held.")
  for i, row in ipairs(current.promotions) do if i <= 40 then local fresh = current.freshness[row.guid]; Say(string.format("%d. %s -> slot%d (%s; %s). /olv promote %s", i, row.name, row.targetSlot, row.reason,
    ActionFresh(current,fresh) and "fresh" or "STALE/held", row.guid)) end end
  return true
end
-- Called only by the explicit slash/button hardware path. Events merely invalidate/confirm state.
-- Unknown calls survive reload. Only a newer complete native roster can settle
-- a step created in this session; observing a rank does not prove who changed it.
local storageOwner
local function StorageConflict(db)
  Q.storageConflict=true
  if type(db)=="table" and getmetatable(db)==nil then db.launchPromotionCustodyConflict=true end
end
local function AttemptLedger(create)
  local db=OlympusVerifyDB
  if db==nil and not create then
    if storageOwner then StorageConflict(db);return nil end
    return {}
  end
  if type(db)~="table" or getmetatable(db)~=nil then
    if storageOwner then StorageConflict(db) end
    return nil
  end
  if Q.storageConflict or storageOwner and storageOwner.database~=db then StorageConflict(db);return nil end
  local firstRead=storageOwner==nil
  storageOwner=storageOwner or {database=db,ledger=db.launchPromotionAttempts,entries={}}
  if db.launchPromotionAttempts==nil then
    if storageOwner and storageOwner.ledger~=nil then StorageConflict(db);return nil end
    if not create then return {} end
    db.launchPromotionAttempts={}
    storageOwner.ledger=db.launchPromotionAttempts
  end
  if type(db.launchPromotionAttempts)~="table" or getmetatable(db.launchPromotionAttempts)~=nil then
    if storageOwner then StorageConflict(db) end
    return nil
  end
  if storageOwner and storageOwner.ledger~=db.launchPromotionAttempts then StorageConflict(db);return nil end
  if firstRead then
    local count=0
    for id,record in pairs(db.launchPromotionAttempts) do
      count=count+1;if count>1000 then StorageConflict(db);return nil end
      storageOwner.entries[id]=record
    end
  end
  return db.launchPromotionAttempts
end
local function OwnedEntry(ledger,id,record)
  if storageOwner and storageOwner.ledger==ledger then storageOwner.entries[id]=record end
end
-- Diagnostic scalars only, never consumed by an action guard or used to recreate
-- an attempt. The .36 native tests changed two ranks but their rows were absent
-- after flush (12 November 2026); retain the before/after storage boundary.
function Q.PromotionCustodyDiagnostics()
  local db,ledger=OlympusVerifyDB,AttemptLedger()
  local result={version=1,protocol="secure-promotion279-publication1",capturedAt=time(),ledgerAvailable=ledger~=nil,ledgerCount=0,sessionCount=0,rows={}}
  local seen={}
  local function add(id,record,attempt)
    if not Text(id,40) or #result.rows>=1000 then return end
    seen[id]=true
    local stored=ledger and ledger[id]
    local row={guid=id,ledgerPresent=stored~=nil,sessionPresent=attempt~=nil}
    if type(record)=="table" then
      row.name=Text(record.name,100)
      row.state=(record.state=="unknown" or record.state=="confirmed") and record.state or "invalid"
      row.completed=type(record.completed)=="boolean" and record.completed or false
      row.stepCount=type(record.steps)=="table" and math.min(4,#record.steps) or 0
      if Number(record.observedSlot,0,9) then row.observedSlot=record.observedSlot end
      for _,key in ipairs({"version","startSlot","target","snapshotId","attemptedAt","observedAt","observedGeneration"}) do
        if Number(record[key],0,2147483647) then row[key]=record[key] end
      end
      row.targetGuid=Text(record.targetGuid,40);row.contextId=Text(record.contextId,40)
    else row.state=record==nil and "absent" or "invalid" end
    if attempt then
      row.databaseSame=db==attempt.database
      row.ledgerSame=ledger==attempt.ledger
      row.entrySame=stored==attempt.record
      row.phase=(attempt.phase=="reserved" or attempt.phase=="post-click" or attempt.phase=="blocked" or attempt.phase=="rank-observed") and attempt.phase or "invalid"
    end
    result.rows[#result.rows+1]=row
  end
  for id,attempt in pairs(Q.sessionPromotions) do
    if result.sessionCount>=1000 then result.truncated=true;break end
    result.sessionCount=result.sessionCount+1
    add(id,attempt.record,attempt)
  end
  if ledger then for id,record in pairs(ledger) do
    if result.ledgerCount>=1000 then result.truncated=true;break end
    result.ledgerCount=result.ledgerCount+1
    if not seen[id] then add(id,record) end
  end end
  table.sort(result.rows,function(a,b) return a.guid<b.guid end)
  return result
end
function Q.PrintPromotionCustody()
  local result=Q.PromotionCustodyDiagnostics()
  Say(string.format("Promotion custody (runtime only): %d stored row(s), %d session attempt(s); %s. Diagnostic; never promotion authority.",result.ledgerCount,result.sessionCount,result.protocol))
  for i,row in ipairs(result.rows) do if i<=20 then
    Say(string.format("%s %s: %s; completed=%s; steps=%d; stored=%s; session=%s; DB/ledger/entry=%s/%s/%s; phase=%s.",
      row.guid,row.name or "(name unavailable)",row.state,tostring(row.completed),row.stepCount,tostring(row.ledgerPresent),tostring(row.sessionPresent),
      tostring(row.databaseSame),tostring(row.ledgerSame),tostring(row.entrySame),row.phase or "prior"))
  end end
  return result
end
local function PromotionRow(current,id)
  for _,row in ipairs(current.promotions) do if row.guid==id then return row,current.freshness[id] end end
end
local function SameAttempt(record,id,current)
  if not (type(record)=="table" and getmetatable(record)==nil and record.version==3
    and record.scopeHash==current.identity.scopeHash and record.actorGuid==current.identity.guid
    and record.targetGuid==id and Text(record.name,100) and Number(record.startSlot,6,9)
    and (record.target==5 or record.target==7 and record.startSlot==9) and Number(record.attemptedAt,1,time())
    and OlympusVerifyNativeRankConstants and record.rankProfile==OlympusVerifyNativeRankConstants.profile
    and record.rankSchemeDigest==OlympusVerifyNativeRankConstants.digest
    and Text(record.intentId,160) and Text(record.intentName,100) and Text(record.intentToken,4096) and Text(record.originalIntentToken,4096) and Text(record.subjectDigest,64)
    and Number(record.intentIssuedAt,1,record.attemptedAt) and Number(record.intentExpiresAt,record.intentIssuedAt+1,record.intentIssuedAt+600)
    and Number(record.snapshotId,1,2147483647)
    and Number(record.admittedSteps,0,3) and Number(record.selectedSnapshotId,record.snapshotId,2147483647) and Text(record.selectedContextId,32)
    and type(record.steps)=="table" and getmetatable(record.steps)==nil
    and Number(#record.steps,1,4) and #record.steps<=record.startSlot-record.target and record.admittedSteps==#record.steps-1) then return false end
  local count=0
  for key,step in pairs(record.steps) do
    count=count+1
    if not Number(key,1,#record.steps) or type(step)~="table" or getmetatable(step)~=nil
      or step.from~=record.startSlot-key+1 or step.expected~=step.from-1
      or not Text(step.intentToken,4096) or not Number(step.snapshotId,record.snapshotId,2147483647) or not Text(step.contextId,32) or step.admittedSteps~=key-1
      or not Number(step.attemptedAt,record.attemptedAt,time()) then return false end
    if record.state=="confirmed" and (step.state~="rank-observed" or not Number(step.observedAt,step.attemptedAt,time())) then return false end
  end
  if count~=#record.steps then return false end
  return record.state~="confirmed" or (record.observedSlot==record.startSlot-#record.steps
    and Number(record.observedAt,record.steps[#record.steps].attemptedAt,time())
    and Number(record.observedGeneration,1,2147483647) and record.completed==(record.observedSlot==record.target))
end
local ATTEMPT_KEYS={version=true,scopeHash=true,actorGuid=true,targetGuid=true,name=true,target=true,startSlot=true,
  snapshotId=true,contextId=true,attemptedAt=true,steps=true,previous=true,state=true,completed=true,
  observedSlot=true,observedAt=true,observedGeneration=true,intentId=true,intentName=true,intentToken=true,originalIntentToken=true,subjectDigest=true,rankProfile=true,
  rankSchemeDigest=true,intentIssuedAt=true,intentExpiresAt=true,admittedSteps=true,selectedSnapshotId=true,selectedContextId=true}
local function CopySessionAttempt(record,id,depth)
  if depth>8 or type(record)~="table" or not ExactKeys(record,ATTEMPT_KEYS)
    or not Text(record.actorGuid,40) or not Text(record.scopeHash,16)
    or not Number(record.snapshotId,1,2147483647) or not Text(record.contextId,32) or #record.contextId~=32
    or not SameAttempt(record,id,{identity={guid=record.actorGuid,scopeHash=record.scopeHash}})
    or (record.state~="unknown" and record.state~="confirmed") or type(record.completed)~="boolean" then return nil end
  local copy={}
  for key in pairs(ATTEMPT_KEYS) do
    if key~="steps" and key~="previous" and record[key]~=nil then
      local value=record[key]
      if type(value)~="string" and type(value)~="number" and type(value)~="boolean" then return nil end
      if type(issecretvalue)=="function" then local ok,secret=pcall(issecretvalue,value);if not ok or secret then return nil end end
      copy[key]=value
    end
  end
  copy.steps={}
  for i,step in ipairs(record.steps) do
    if not ExactKeys(step,{from=true,expected=true,attemptedAt=true,state=true,observedAt=true,intentToken=true,snapshotId=true,contextId=true,admittedSteps=true})
      or (step.state~="unknown" and step.state~="rank-observed")
      or step.observedAt~=nil and not Number(step.observedAt,step.attemptedAt,time()) then return nil end
    copy.steps[i]={from=step.from,expected=step.expected,attemptedAt=step.attemptedAt,state=step.state,observedAt=step.observedAt,
      intentToken=step.intentToken,snapshotId=step.snapshotId,contextId=step.contextId,admittedSteps=step.admittedSteps}
  end
  if record.previous~=nil then
    copy.previous=CopySessionAttempt(record.previous,id,depth+1)
    if not copy.previous then return nil end
  end
  return copy
end
local function SaveHolds(create)
  local db=OlympusVerifyDB
  if type(db)~="table" or getmetatable(db)~=nil then return nil end
  local holds=db.launchPromotionSaveHolds
  if holds==nil and create then holds={};db.launchPromotionSaveHolds=holds end
  if holds~=nil and (type(holds)~="table" or getmetatable(holds)~=nil) then return nil end
  return holds
end
-- Publish only actual records reserved in this session, through new plain data
-- tables in the ordinary logout event. Earlier missing receipts are not inferred
-- from a current rank or diagnostics. A conflicting owner/entry stays untouched.
function Q.PublishPromotionCustody()
  local db,ledger=OlympusVerifyDB,AttemptLedger()
  local result={version=1,protocol="promotion-save-publication279",capturedAt=time(),published=0,recovered=0,held=0}
  if ledger and storageOwner then
    for id,record in pairs(storageOwner.entries) do
      local owned=Q.sessionPromotions[id]
      local recoverable=ledger[id]==nil and owned and owned.record==record and owned.database==db and owned.ledger==ledger
      if ledger[id]~=record and not recoverable then StorageConflict(db);break end
    end
    for id,record in pairs(ledger) do if storageOwner.entries[id]~=record then StorageConflict(db);break end end
  end
  for id,attempt in pairs(Q.sessionPromotions) do
    local priorRecord=attempt.record
    local ok,copy=pcall(CopySessionAttempt,priorRecord,id,1)
    if not ok then copy=nil end
    local existing=ledger and ledger[id]
    local sameOwner=db==attempt.database and ledger==attempt.ledger
    local samePending=Q.pending[id]==nil or Q.pending[id]==attempt
    local canPublish=copy and sameOwner and samePending and (existing==nil or existing==priorRecord)
    local published=canPublish and pcall(function() ledger[id]=copy end)
    if published then
      OwnedEntry(ledger,id,copy)
      attempt.record,attempt.step=copy,copy.steps[#copy.steps]
      if Q.continuations[id] and Q.continuations[id].record==priorRecord then Q.continuations[id].record=copy end
      if existing==nil then result.recovered=result.recovered+1 end
      result.published=result.published+1
    else
      local holds=SaveHolds(true)
      local retained=holds and holds[id]~=nil
      if holds then
        local prior=holds[id]
        if prior==nil then
          local count=0;for _ in pairs(holds) do count=count+1 end
          if count<1000 then
            retained=pcall(function() holds[id]={version=1,reason=not copy and "invalid-session-record"
              or not sameOwner and "storage-owner-changed" or "conflicting-attempt",guid=id,capturedAt=time(),retainedAttempt=copy} end)
          end
        end
      end
      -- A root/ledger replacement may have lost older unknown entries too. A
      -- full/unwritable hold store cannot silently restore eligibility on reload.
      if (not sameOwner or not retained) and type(db)=="table" and getmetatable(db)==nil then
        db.launchPromotionCustodyConflict=true
      end
      result.held=result.held+1
    end
  end
  if type(db)=="table" and getmetatable(db)==nil then db.launchPromotionPublication=result end
  return result
end
local function SamePromotion(record,row,source,current)
  local p=row.intent
  return SameAttempt(record,row.guid,current) and p and source.kind=="selected" and DirectiveIntent(row,source.page,current.identity,time())
    and record.intentId==p.id and record.snapshotId==p.originSnapshotId and record.contextId==p.originContext
    and record.target==p.finalSlot and record.startSlot==p.startSlot and record.subjectDigest==p.subjectDigest
    and record.rankProfile==p.rankProfile and record.rankSchemeDigest==p.rankSchemeDigest
    and record.intentIssuedAt==p.issuedAt and record.intentExpiresAt==p.expiresAt and record.intentName==row.name
    and H.normalizeCharacter(record.name)==H.normalizeCharacter(row.name)
end
function Q.PromotionStatus(id,current,nativeSlot)
  if Q.promotionBlocked then return "blocked" end
  if Q.pending[id]~=nil then return "pending" end
  local ledger=AttemptLedger()
  if not ledger then return "pending" end
  local db=OlympusVerifyDB
  if db and db.launchPromotionCustodyConflict~=nil then return "pending" end
  local holds=SaveHolds()
  if db and db.launchPromotionSaveHolds~=nil and (not holds or holds[id]~=nil) then return "pending" end
  local owned=Q.sessionPromotions[id]
  if owned and (db~=owned.database or ledger~=owned.ledger or ledger[id]~=owned.record) then return "pending" end
  if storageOwner and storageOwner.entries[id]~=ledger[id] then StorageConflict(db);return "pending" end
  local record=ledger[id]
  if record==nil then
    local row=current and PromotionRow(current,id)
    if row and row.intent and row.intent.acknowledgedSteps~=0 then return "pending" end
    return "clear"
  end
  -- Without a supplied validated context this is history/read-only status, never continuation admission.
  local identity=current and current.identity or Identity()
  if not identity or not SameAttempt(record,id,current or {identity=identity}) or record.state~="confirmed" then return "pending" end
  if nativeSlot~=nil and nativeSlot~=record.observedSlot then return "pending" end
  local row,source
  if current then row,source=PromotionRow(current,id) end
  if not row or not source or not ActionFresh(current,source) then
    if record.completed then return "settled" end
    return not record.completed and time()<record.intentExpiresAt and (nativeSlot==nil or nativeSlot==record.observedSlot) and "recheck" or "pending" end
  if SamePromotion(record,row,source,current) then
    if record.completed then return "confirmed" end
    -- Only a new server-admitted selected source may carry the confirmed original intent across reload.
    if row.intent.acknowledgedSteps==#record.steps and row.currentSlot==record.observedSlot
      and source.snapshotId>record.selectedSnapshotId and source.page.snapshotAt>=record.observedAt
      and source.page.fetchedAt>=record.observedAt and time()<record.intentExpiresAt
      and record.observedSlot>record.target and #record.steps<record.startSlot-record.target then return "continue" end
    if not record.completed and time()<record.intentExpiresAt then return "recheck" end
  elseif record.completed and record.contextId~=source.contextId and row.currentSlot==record.observedSlot
    and row.targetSlot<record.observedSlot and H.normalizeCharacter(record.name)==H.normalizeCharacter(row.name)
    and source.page and source.page.scan and source.page.scan.startedAt>=record.observedAt and source.page.fetchedAt>=record.observedAt then
    return "clear" -- a different fresh recommendation, retaining the completed history below
  end
  return "pending"
end
function Q.AttemptHeld(id,current,nativeSlot)
  local status=Q.PromotionStatus(id,current,nativeSlot)
  return status=="pending" or status=="blocked"
end
local ReconcilePromotions
local reconcileTimer,lastReconcileAt=false,nil
local function ScheduleReconciliation(delay)
  if reconcileTimer or not (C_Timer and type(C_Timer.After)=="function") then return end
  reconcileTimer=true
  local ok=pcall(C_Timer.After,delay,function() reconcileTimer=false;ReconcilePromotions() end)
  if not ok then reconcileTimer=false end
end
ReconcilePromotions=function()
  if next(Q.pending)==nil then return end
  local now,active=time(),false
  if not Number(now,1,2147483647) then return end
  for _,pending in pairs(Q.pending) do
    if Number(pending.observeUntil,1,2147483647) and now<pending.observeUntil and Q.generation>pending.generation then active=true;break end
  end
  if not active then return end -- Stop observation work at its original bound; retain every unknown original.
  if lastReconcileAt and now<lastReconcileAt then lastReconcileAt=now;ScheduleReconciliation(1);return end
  local delay=lastReconcileAt and 1-(now-lastReconcileAt) or 0
  if delay>0 then ScheduleReconciliation(delay);return end
  lastReconcileAt=now
  local current=Q.Current()
  if not current then return end
  local roster=NativeRoster(current.identity)
  local ledger=AttemptLedger()
  if not roster or not ledger then return end
  for id,pending in pairs(Q.pending) do
    local record,native=ledger[id],roster[id]
    local row,source=PromotionRow(current,id)
    if Number(pending.observeUntil,1,2147483647) and now<pending.observeUntil
      and row and source and record==pending.record and SamePromotion(record,row,source,current) and pending.step==record.steps[#record.steps]
      and row.intent.acknowledgedSteps==record.admittedSteps and source.snapshotId==record.selectedSnapshotId and source.contextId==record.selectedContextId
      and ActionFresh(current,source) and Q.generation>pending.generation
      and native and native.slot==pending.expected and native.name==record.name then
      record.state,record.observedSlot,record.observedAt,record.observedGeneration="confirmed",native.slot,time(),Q.generation
      record.completed=native.slot==record.target
      pending.phase="rank-observed"
      pending.step.state,pending.step.observedAt="rank-observed",time()
      Q.pending[id]=nil
      Q.continuations[id]=not record.completed and {record=record,generation=Q.generation} or nil
    end
  end
end
local function PromotionCommand()
  for _,prefix in ipairs({"SLASH_GUILD_PROMOTE","SLASH_GUILDPROMOTE"}) do
    for i=1,8 do
      local value=_G[prefix..i]
      if value=="/gpromote" or value=="/guildpromote" then return value end
    end
  end
  -- Forever may keep secure command registration private; both independently
  -- inspected Forever addon packages use this native literal command. Its
  -- effect still needs an attended newer complete-roster confirmation.
  return "/gpromote"
end
local function PreparePromotion(target)
  local current, roster = ActionContext()
  if not current then Say(roster); return false end
  local row
  for index, value in ipairs(current.promotions) do if value.guid == target or tostring(index) == target then row = value; break end end
  if not row then Say("No current promotion matches that GUID/index."); return false end
  local fresh = current.freshness[row.guid]
  if not fresh or fresh.kind~="selected" or not DirectiveIntent(row,fresh.page,current.identity,time()) then
    Say("A fresh Directive selected plan is required before a promotion click; discovery remains advisory.");return false end
  if not fresh or (fresh.actionHeld==nil and current.actionHeld or fresh.actionHeld) or not Number(fresh.expiresAt,1,2147483647)
    or not Number(fresh.scanExpiresAt,1,2147483647) or time() >= fresh.expiresAt or time() >= fresh.scanExpiresAt then Say("This page is stale or stopped. Explicitly recheck it and reload before acting."); return false end
  local native = roster[row.guid]
  local command=PromotionCommand()
  if not command then Say("This client has not exposed a supported guild-promotion command; no action taken.");return false end
  if native and (native.name:find("/",1,true) or native.name:find("\\",1,true)) then
    Say("The native target name is not safe for one literal promotion command; no action taken.");return false
  end
  local ledger=AttemptLedger(true)
  if not ledger then Say("Prior native attempt custody is unavailable; no action taken.");return false end
  if not native or H.normalizeCharacter(native.name) ~= H.normalizeCharacter(row.name) or native.guid == current.identity.guid
    or row.targetSlot <= current.identity.rank or Read(CanGuildPromote) ~= true then Say("Current native identity/rank/permission does not admit this promotion."); return false end
  if native.slot <= row.targetSlot then Say("Native target rank already reached; no action taken. Any prior unknown attempt remains retained for review."); return false end
  local status=Q.PromotionStatus(row.guid,current,native.slot)
  if Q.promotionBlocked or status=="pending" then Say("A prior native attempt or client block is unconfirmed. No repeat was sent; review the native roster.");return false end
  if status=="continue" and native.name~=ledger[row.guid].name then Say("The exact native name changed after the prior step; no action taken.");return false end
  if status~="continue" and native.slot~=row.currentSlot then Say("The native rank changed since this projection; refresh it."); return false end
  if Read(GuildControlGetRankName, row.targetSlot + 1) ~= row.targetName then
    Say("The client cannot confirm the named target rank. Use the normal guild roster UI; no promotion sent."); return false end
  if Read(GuildControlGetRankName,native.slot)~=OlympusVerifyNativeRankConstants.names[native.slot] then
    Say("The immediately next native rank label is unconfirmed; no promotion sent.");return false end
  local cg = type(C_GuildInfo) == "table" and C_GuildInfo or {}
  -- Direct promotion API calls were forbidden in the attended .35 client checks
  -- (12 November 2026). Only the inherited secure button executes the command.
  if type(cg.IsGuildRankAssignmentAllowed)=="function" and Read(cg.IsGuildRankAssignmentAllowed,native.guid,row.targetSlot+1)~=true then
    Say("The client does not allow this named target rank; no promotion sent.");return false
  end
  local count=0;for _ in pairs(ledger) do count=count+1 end
  if ledger[row.guid]==nil and count>=1000 then Say("Native attempt custody is full; no action taken.");return false end
  return {current=current,row=row,fresh=fresh,native=native,ledger=ledger,status=status,command=command}
end
local function ReservePromotion(prepared)
  local current,row,fresh,native,ledger,status=prepared.current,prepared.row,prepared.fresh,prepared.native,prepared.ledger,prepared.status
  local record=ledger[row.guid]
  if status~="continue" then
    local previous,depth=record,0
    while previous~=nil do
      depth=depth+1
      if depth>=8 or type(previous)~="table" then Say("Native attempt history needs review; no action taken.");return false end
      previous=previous.previous
    end
    local p=row.intent
    if p.acknowledgedSteps~=0 or p.startSlot~=native.slot then Say("The original promotion intent is unavailable; no action taken.");return false end
    record={version=3,scopeHash=current.identity.scopeHash,actorGuid=current.identity.guid,targetGuid=row.guid,name=native.name,
      target=p.finalSlot,startSlot=p.startSlot,snapshotId=p.originSnapshotId,contextId=p.originContext,attemptedAt=time(),steps={},previous=record,
      intentId=p.id,intentName=p.name,intentToken=row.intentToken,originalIntentToken=row.intentToken,subjectDigest=p.subjectDigest,rankProfile=p.rankProfile,rankSchemeDigest=p.rankSchemeDigest,
      intentIssuedAt=p.issuedAt,intentExpiresAt=p.expiresAt,admittedSteps=p.acknowledgedSteps,selectedSnapshotId=fresh.snapshotId,selectedContextId=fresh.contextId}
    ledger[row.guid]=record
    OwnedEntry(ledger,row.guid,record)
  end
  record.intentToken=row.intentToken;record.admittedSteps=row.intent.acknowledgedSteps
  record.selectedSnapshotId,record.selectedContextId=fresh.snapshotId,fresh.contextId
  local step={from=native.slot,expected=native.slot-1,attemptedAt=time(),state="unknown",intentToken=row.intentToken,
    snapshotId=fresh.snapshotId,contextId=fresh.contextId,admittedSteps=row.intent.acknowledgedSteps}
  record.steps[#record.steps+1]=step;record.state="unknown";record.completed=false
  local attempt={record=record,step=step,generation=Q.generation,expected=step.expected,database=OlympusVerifyDB,ledger=ledger,phase="reserved",
    observeUntil=math.min(fresh.expiresAt,fresh.scanExpiresAt)}
  Q.sessionPromotions[row.guid]=attempt
  Q.continuations[row.guid]=nil
  Q.pending[row.guid], Q.activeAttempt, Q.inAction = attempt, attempt, "promote"
  return attempt
end
local function ClearPromotionButton(button)
  if Read(InCombatLockdown)~=false then return false end
  button:SetAttribute("type",nil);button:SetAttribute("type1",nil)
  button:SetAttribute("macrotext",nil);button:SetAttribute("macrotext1",nil)
  button:SetAttribute("macro",nil);button:SetAttribute("macro1",nil)
  return true
end
-- Public binding for addon-owned SecureActionButtonTemplate controls. Preserve
-- the inherited secure OnClick; invoking a Blizzard handler from addon Lua is not
-- a substitute for a player hardware click. No timer or event arms a command.
function Q.BindPromotionButton(button,resolver,afterClick)
  if type(button)~="table" or type(button.SetAttribute)~="function" or type(resolver)~="function"
    or Read(InCombatLockdown)~=false then return false end
  ClearPromotionButton(button)
  button:RegisterForClicks("AnyUp")
  button:SetAttribute("useOnKeyDown",false)
  button:SetScript("PreClick",function(self,mouseButton,down)
    if not ClearPromotionButton(self) then return end
    self.olympusPromotionAttempt=nil
    if mouseButton~="LeftButton" or down==true or Read(IsShiftKeyDown)~=false
      or Read(IsControlKeyDown)~=false or Read(IsAltKeyDown)~=false then return end
    local ok,target=pcall(resolver,self)
    if not ok or type(target)~="string" or not self:IsVisible() then return end
    local prepared=PreparePromotion(target)
    if not prepared then return end
    local attempt=ReservePromotion(prepared)
    if not attempt then return end
    self.olympusPromotionAttempt=attempt
    -- One literal native name from the just-read complete roster. Text() already
    -- refuses control/newline characters, so it cannot add another macro line.
    self:SetAttribute("macrotext1",prepared.command.." "..prepared.native.name)
    self:SetAttribute("type1","macro")
  end)
  button:SetScript("PostClick",function(self,mouseButton,down)
    local attempt=self.olympusPromotionAttempt
    ClearPromotionButton(self)
    self.olympusPromotionAttempt=nil
    if attempt then
      attempt.phase=attempt.blocked and "blocked" or attempt.record.state=="confirmed" and "rank-observed" or "post-click"
      Q.inAction,Q.activeAttempt=nil,nil
      if not attempt.blocked and Read(InCombatLockdown)==false then RequestRoster() end
      if attempt.blocked then Say("The client reported a blocked promotion action. Its original outcome remains held; no fallback or repeat was queued.")
      else Say("One player promotion command requested. Wait for a fresh roster; another rank needs a separate click.") end
    end
    if type(afterClick)=="function" and mouseButton=="LeftButton" and down~=true
      and Read(InCombatLockdown)==false and Read(IsShiftKeyDown)==false
      and Read(IsControlKeyDown)==false and Read(IsAltKeyDown)==false then afterClick(self,attempt,mouseButton,down) end
  end)
  button:HookScript("OnHide",function(self) ClearPromotionButton(self) end)
  return true
end
-- CL2-003 (Stage 1 MAJOR, 13 Nov 2026): a window that parents a secure promotion
-- button is itself protected, so once combat lockdown starts neither addon code
-- nor the Escape list may hide it, and it covered the screen for the whole fight.
-- Two closers, neither of which makes a call the client forbids in combat:
-- 1. PLAYER_REGEN_DISABLED, while InCombatLockdown() is still false (the Guild
--    column already relies on this): the window's own Close/Cancel path runs.
--    If lockdown has already begun, this handler touches no window.
-- 2. A secure state handler, registered out of combat when the window is built,
--    hides the window from secure code on [combat]; it covers a late event and
--    needs no addon call during lockdown.
-- Closing equals an explicit Close/Cancel: no attempt is reserved, released or
-- retried, and nothing reopens by itself after combat.
local COMBAT_CLOSE_SNIPPET=[[
if newstate=="combat" then
  local window=self:GetFrameRef("window")
  if window and window:IsShown() then window:Hide() end
end
]]
Q.combatWindows={}
function Q.CloseInCombat(frame,close)
  if type(frame)~="table" or type(frame.IsShown)~="function" or Read(InCombatLockdown)~=false then return false end
  for _,entry in ipairs(Q.combatWindows) do if entry.frame==frame then return true end end
  local entry={frame=frame,close=type(close)=="function" and close or function() frame:Hide() end}
  Q.combatWindows[#Q.combatWindows+1]=entry
  if type(RegisterStateDriver)=="function" and type(CreateFrame)=="function" then
    local ok=pcall(function()
      local handler=CreateFrame("Frame",nil,UIParent,"SecureHandlerStateTemplate")
      if type(SecureHandlerSetFrameRef)=="function" then SecureHandlerSetFrameRef(handler,"window",frame)
      else handler:SetFrameRef("window",frame) end
      handler:SetAttribute("_onstate-olympuscombat",COMBAT_CLOSE_SNIPPET)
      RegisterStateDriver(handler,"olympuscombat","[combat] combat; nocombat")
      entry.handler=handler
    end)
    entry.secure=ok and entry.handler~=nil
  end
  return true
end
-- Round 5 item 1 (13 Nov 2026): without the secure handler (the client lacks RegisterStateDriver, or the handler
-- could not be registered) nothing may hide a protected window during lockdown: not Escape, not its Close, Cancel
-- or X button. The window stays, the officer is told once that it closes when combat ends, and at
-- PLAYER_REGEN_ENABLED its own Close path runs once. For Escape, the window's name leaves UISpecialFrames for the
-- fight (a plain table edit, which combat allows), so the client's Escape handler never calls Hide on it and Escape
-- still reaches the game menu and target clearing; the name returns when combat ends. No widget method is replaced.
local function WithdrawEscape(entry)
  if type(UISpecialFrames)~="table" then return end
  for index=#UISpecialFrames,1,-1 do
    local name=UISpecialFrames[index]
    if type(name)=="string" and _G[name]==entry.frame then
      table.remove(UISpecialFrames,index)
      entry.escapeNames=entry.escapeNames or {};entry.escapeNames[#entry.escapeNames+1]=name
    end
  end
end
local function RestoreEscape(entry)
  if type(UISpecialFrames)~="table" or not entry.escapeNames then return end
  for _,name in ipairs(entry.escapeNames) do
    local present=false
    for _,value in ipairs(UISpecialFrames) do if value==name then present=true end end
    if not present then UISpecialFrames[#UISpecialFrames+1]=name end
  end
  entry.escapeNames=nil
end
local function DeferClose(entry)
  if entry.secure or not entry.frame:IsShown() then return false end
  entry.deferred=true
  if not Q.combatNotice then
    Q.combatNotice=true
    Say("Combat lockdown began before the officer windows could close. The game allows closing them only after combat; they close when combat ends. Nothing was sent.")
  end
  return true
end
-- For a Close, Cancel or X button pressed during lockdown: record the close for the end of combat instead.
function Q.DeferCombatClose(frame)
  for _,entry in ipairs(Q.combatWindows) do if entry.frame==frame then return DeferClose(entry) end end
  return false
end
function Q.CloseCombatWindows()
  for _,entry in ipairs(Q.combatWindows) do WithdrawEscape(entry) end
  local shown=0
  for _,entry in ipairs(Q.combatWindows) do if entry.frame:IsShown() then shown=shown+1 end end
  if shown==0 then return 0 end
  if Read(InCombatLockdown)~=false then
    for _,entry in ipairs(Q.combatWindows) do DeferClose(entry) end
    return 0
  end
  local closed=0
  for _,entry in ipairs(Q.combatWindows) do
    if entry.frame:IsShown() then pcall(entry.close) end
    if not entry.frame:IsShown() then closed=closed+1 else DeferClose(entry) end
  end
  if closed>0 then Say("Combat started, so the officer windows were closed. Closing them sent nothing and changed no promotion record; reopen them after combat.") end
  return closed
end
-- PLAYER_REGEN_ENABLED: Escape names return, and each deferred window closes once through its own Close path.
function Q.FinishCombatWindows()
  if Read(InCombatLockdown)~=false then return 0 end
  Q.combatNotice=nil
  local closed=0
  for _,entry in ipairs(Q.combatWindows) do
    RestoreEscape(entry)
    if entry.deferred then
      entry.deferred=nil
      if entry.frame:IsShown() then pcall(entry.close);if not entry.frame:IsShown() then closed=closed+1 end end
    end
  end
  return closed
end
function Q.HardwarePromote(target)
  local prepared=PreparePromotion(target)
  if not prepared then return false end
  if not Q.promotionConfirm then
    local frame=CreateFrame("Frame","OlympusPromotionConfirm",UIParent,"BasicFrameTemplateWithInset")
    frame:SetSize(420,140);frame:SetPoint("CENTER")
    local title=frame:CreateFontString(nil,"OVERLAY","GameFontNormalLarge")
    title:SetPoint("TOP",0,-12);title:SetText("Confirm one guild promotion")
    local info=frame:CreateFontString(nil,"OVERLAY","GameFontHighlight")
    info:SetPoint("TOPLEFT",18,-40);info:SetWidth(384);info:SetJustifyH("LEFT")
    local promote=CreateFrame("Button",nil,frame,"SecureActionButtonTemplate,UIPanelButtonTemplate")
    promote:SetSize(230,28);promote:SetPoint("BOTTOMLEFT",18,16);promote:SetText("Promote one rank")
    Q.BindPromotionButton(promote,function() return Q.confirmGuid end,function() frame:Hide() end)
    local cancel=CreateFrame("Button",nil,frame,"UIPanelButtonTemplate")
    cancel:SetSize(125,28);cancel:SetPoint("LEFT",promote,"RIGHT",12,0);cancel:SetText("Cancel")
    local function close() if Read(InCombatLockdown)==false then frame:Hide() else Q.DeferCombatClose(frame) end end
    cancel:SetScript("OnClick",close)
    if type(frame.CloseButton)=="table" and type(frame.CloseButton.SetScript)=="function" then frame.CloseButton:SetScript("OnClick",close) end
    Q.CloseInCombat(frame,close) -- CL2-003: combat cancels exactly as the Cancel button does.
    Q.promotionConfirm,Q.promotionConfirmInfo,Q.promotionConfirmButton,Q.promotionConfirmCancel=frame,info,promote,cancel
  end
  Q.confirmGuid=prepared.row.guid
  Q.promotionConfirmInfo:SetText(prepared.native.name.."\n"..tostring(prepared.native.slot).." > "..tostring(prepared.native.slot-1).." (target "..prepared.row.targetName..")")
  Q.promotionConfirm:Show()
  Say("Click the visible confirmation button for one player promotion command. No rank action has been sent yet.")
  return true
end
function Q.RecordCurrentPromotionObservation(target)
  local function refuse(why) Say(why);return nil,why end
  if not Text(target,40) or not target:match("^Player%-%d+%-%x+$") then return refuse("Select one exact native GUID for a history observation; no rank action taken.") end
  local identity=Identity()
  if not identity or Preview() or Read(InCombatLockdown)~=false or Read(CanGuildPromote)~=true then return refuse("Current native officer identity is unavailable; no history or rank action taken.") end
  local roster,why=NativeRoster(identity)
  if not roster then return refuse(why) end
  local member=roster[target]
  if not member then return refuse("That exact GUID is absent from the complete native roster; no history or rank action taken.") end
  local rankName=Text(Read(GuildControlGetRankName,member.slot+1),100)
  if not rankName then return refuse("The current native rank name is unavailable; no history or rank action taken.") end
  local db=OlympusVerifyDB
  if type(db)~="table" or getmetatable(db)~=nil then return refuse("History observation storage is unavailable; no rank action taken.") end
  local history=db.launchPromotionObservations
  if history==nil then history={};db.launchPromotionObservations=history end
  if type(history)~="table" or getmetatable(history)~=nil then return refuse("Prior history observations need review; nothing was replaced.") end
  local count=0;for _ in pairs(history) do count=count+1 end
  if history[target]==nil and count>=1000 then return refuse("History observation storage is full; no rank action taken.") end
  local ledger=AttemptLedger();local receipt=ledger and ledger[target]
  local status=not ledger and "unavailable" or receipt==nil and "absent"
    or type(receipt)=="table" and (receipt.state=="unknown" or receipt.state=="confirmed") and receipt.state or "invalid"
  local observation={version=2,origin="current-native-rank-observation",guid=target,name=member.name,actorGuid=identity.guid,
    scopeHash=identity.scopeHash,guild=identity.guild,realm=identity.realm,observedAt=time(),nativeGeneration=Q.generation,
    rankIndex=member.slot,rankName=rankName,rankProfile=OlympusVerifyNativeRankConstants.profile,rankSchemeDigest=OlympusVerifyNativeRankConstants.digest,
    receiptStatus=status,commandAttempted=false,historicalOutcomeSettled=false}
  local previous=history[target]
  if previous~=nil then
    local prior=type(previous)=="table" and Number(previous.observedAt,1,time()) and tostring(previous.observedAt) or "unavailable time"
    Say("Replacing the prior factual observation from "..prior..". This does not settle or alter command attempt history.")
  end
  history[target]=observation
  Say(string.format("Current native rank: %s is %s (slot%d); stored attempt receipt %s. This dated observation records no command and recreates no missing receipt.",member.name,rankName,member.slot,status))
  if status=="unknown" then Say("The original unknown attempt remains unchanged and held; a current rank cannot settle its past effect.")
  else Say("Only a separate fresh recommendation and attended click can request another promotion.") end
  return observation
end
function Q.HoldPromotionHistoryReview(target)
  local observation,why=Q.RecordCurrentPromotionObservation(target)
  if not observation then return nil,why end
  if observation.receiptStatus~="absent" then
    local reason="A stored attempt already exists or is unreadable; its original state was not replaced."
    Say(reason);return nil,reason
  end
  local holds=SaveHolds(true)
  if not holds then Say("History hold storage is unavailable; no rank action taken.");return nil,"hold-storage-unavailable" end
  if holds[target]~=nil then Say("The existing history hold remains unchanged; no rank action taken.");return holds[target] end
  local count=0;for _ in pairs(holds) do count=count+1 end
  if count>=1000 then
    OlympusVerifyDB.launchPromotionCustodyConflict=true
    Say("History hold storage is full; promotions remain held for custody review.");return nil,"hold-storage-full"
  end
  local hold={version=1,origin="operator-history-hold",reason="staff-review-missing-receipt",guid=target,name=observation.name,
    actorGuid=observation.actorGuid,scopeHash=observation.scopeHash,observedAt=observation.observedAt,
    rankIndex=observation.rankIndex,rankName=observation.rankName,commandAttempted=false,historicalOutcomeSettled=false}
  holds[target]=hold
  Say("Promotion held for staff review of the missing earlier receipt. No command receipt was recreated and no rank action was taken.")
  return hold
end
function Q.RiskBuffer()
  local current, roster = ActionContext()
  if not current then Say(roster); return {} end
  local rows = {}
  for _, row in ipairs(current.riskBuffer) do
    local native = roster[row.guid]
    local fresh = current.freshness[row.guid]
    if not current.actionHeld and fresh and time()<fresh.expiresAt and time()<fresh.scanExpiresAt and native and native.slot == 9 and native.guid ~= current.identity.guid and native.onlineKnown and not native.online and Number(native.level, 1, 255)
      and Text(native.note, 1024) and Text(native.officerNote, 1024)
      and not (native.note .. " " .. native.officerNote):lower():find((cfg.holdNote or "hold"):lower(), 1, true)
      and type(GetGuildRosterLastOnline) == "function" then
      local ok, years, months, days, hours = pcall(GetGuildRosterLastOnline, native.index)
      hours = Read(function() return hours end)
      if ok and Number(years, 0, 100) and Number(months, 0, 12) and Number(days, 0, 31) and type(hours) == "number" and hours >= 0 and hours <= 24 then
        local away = years * 365 + months * 30 + days + hours / 24
        if away > 0 then rows[#rows + 1] = { name = native.name, guid = native.guid, level = native.level, days = away } end
      end
    end
  end
  table.sort(rows, function(a, b) if a.days ~= b.days then return a.days > b.days end; if a.level ~= b.level then return a.level < b.level end; return a.name < b.name end)
  Say("Risk buffer is review only. Nothing is removed or automatically selected for removal.")
  for i = 1, math.min(20, #rows) do local row = rows[i]; Say(string.format("%d. %s level%d, offline %.1fd", i, row.name, row.level, row.days)) end
  return rows
end
function Q.Motd(action)
  local current, why = Q.Current()
  if not current then Say(why); return false end
  local discovery=current.pages and current.pages[1]
  if type(discovery)~="table" then Say("No original discovery MOTD page is loaded; selected promotion evidence cannot supply one.");return false end
  local motd = discovery.motd
  if type(motd) ~= "table" or not Text(motd.short, 128) or motd.short == "" or motd.maxBytes ~= 128 or motd.bytes ~= #motd.short then Say("Invalid MOTD projection; no action taken."); return false end
  if action ~= "set" then Say("MOTD proposal: " .. motd.short); Say("/olv motd set requests this text once from a hardware action."); return true end
  if current.actionHeld or time() >= current.pages[1].expiresAt or time() >= current.pages[1].scan.expiresAt then Say("MOTD page is stale or stopped. Recheck page0 and reload."); return false end
  if Preview() or Read(InCombatLockdown) ~= false or Read(CanEditMOTD) ~= true then Say("Current native MOTD permission/combat state does not admit a setter."); return false end
  if Q.motdAttempt then Say("A MOTD attempt is already recorded this session. Check the native guild UI; no automatic retry."); return false end
  local cg = type(C_GuildInfo) == "table" and C_GuildInfo or {}
  local fn = type(cg.SetMOTD) == "function" and cg.SetMOTD or GuildSetMOTD
  if type(fn) ~= "function" then Say("No native MOTD setter is available."); return false end
  Q.motdAttempt = { text = motd.short, scopeHash = current.identity.scopeHash }
  local ok = pcall(fn, motd.short)
  Say(ok and "One MOTD update requested. Confirm it in the native guild UI." or "MOTD outcome is unknown; no retry was queued.")
  return ok
end
-- Local signed read control only. SavedVariables reaches the watcher at the hardware reload;
-- it cannot authorize an invite, Discord role, removal or a protected native action.
function Q.Control(action, offset)
  local identity = Identity()
  if cfg.membershipOnly ~= true or not identity or Q.scopeChanged or Preview() or Read(InCombatLockdown) ~= false
    or (action ~= "scan" and action ~= "stop" and action ~= "recheck")
    or not Text(cfg.secret, 1024) or #cfg.secret < 16 or cfg.secret:find("REPLACE", 1, true)
    or not H or type(H.hmacSha256hex) ~= "function" or not OlympusVerifyAPI or type(OlympusVerifyAPI.Sync) ~= "function" then
    Say("Native identity, local signing or sync is unavailable; scan control held."); return false end
  offset = offset or 0
  if not Number(offset, 0, 980) or offset % 20 ~= 0 or action ~= "recheck" and offset ~= 0 then return false end
  OlympusVerifyDB = OlympusVerifyDB or {}
  local db, now = OlympusVerifyDB, time()
  local sequence = Number(db.launchSequence, 0, 999999999) and db.launchSequence + 1 or 1
  db.launchSequence = sequence
  local value = { version = 1, action = action, id = tostring(now) .. ":" .. tostring(sequence), observedAt = now,
    scopeHash = identity.scopeHash, guid = identity.guid, offset = offset }
  value.mac = H.hmacSha256hex(cfg.secret, table.concat({ "launch-control", "1", action, value.id, tostring(now), identity.scopeHash, identity.guid, tostring(offset) }, "|")):sub(1, 32)
  db.launchControl = value -- immediately invalidates the loaded old projection, including Stop before reload.
  Say("Local " .. action .. " request saved. The watcher reads it after this reload; use Sync & reload later to load its dated results.")
  OlympusVerifyAPI.Sync()
  return true
end
function Q.Select(targetGuid)
  local identity=Identity()
  if cfg.membershipOnly~=true or not identity or Q.scopeChanged or Preview() or Read(InCombatLockdown)~=false
    or Q.identityBaseline and not SameIdentity(Q.identityBaseline,identity) or not Text(targetGuid,40)
    or not targetGuid:match("^Player%-%d+%-%x+$") or targetGuid==identity.guid
    or not Text(cfg.secret,1024) or #cfg.secret<16 or cfg.secret:find("REPLACE",1,true)
    or not H or type(H.hmacSha256hex)~="function" or not OlympusVerifyAPI or type(OlympusVerifyAPI.Sync)~="function" then
    Say("Current native identity, GUID, signing or sync is unavailable; selected read held.");return false end
  local roster,why=NativeRoster(identity)
  if not roster or not roster[targetGuid] then Say(why or "The selected GUID is absent from the complete current native roster.");return false end
  OlympusVerifyDB=OlympusVerifyDB or {}
  local db,now=OlympusVerifyDB,time()
  db.launchSequence=Number(db.launchSequence,0,999999999) and db.launchSequence+1 or 1
  local ledger,confirmations=AttemptLedger(),"[]"
  if not ledger then Say("Prior attempt custody is unavailable; selected read held.");return false end
  local record=ledger[targetGuid]
  if record~=nil and not (type(record)=="table" and record.completed==true) then
    if not SameAttempt(record,targetGuid,{identity=identity}) or record.state~="confirmed" or record.completed~=false
      or roster[targetGuid].slot~=record.observedSlot or now>=record.intentExpiresAt then
      Say("The original attempt is unknown, incompatible or expired; a new selected read cannot repair it.");return false end
    local step=record.steps[#record.steps]
    if not record.intentToken:match("^[%w_%-]+%.[0-9a-f]+$") then return false end
    confirmations='[{"guid":"'..targetGuid..'","token":"'..record.intentToken..'","from":'..tostring(step.from)..',"to":'..tostring(step.expected)..',"observedAt":'..tostring(step.observedAt)..'}]'
  end
  local value={version=4,action="select-directive",id=tostring(now)..":"..tostring(db.launchSequence),observedAt=now,
    scopeHash=identity.scopeHash,guid=identity.guid,targetGuids={targetGuid},confirmations=confirmations}
  value.mac=H.hmacSha256hex(cfg.secret,table.concat({"launch-selected-read","4","select-directive",value.id,tostring(now),identity.scopeHash,identity.guid,targetGuid,confirmations},"|")):sub(1,32)
  db.launchControl=value
  Say("Selected GUID read requested. This reload saves its fresh native source; sync later to load the dated result. Promotion needs a separate hardware click.")
  OlympusVerifyAPI.Sync();return true
end
function Q.SelectMany(targetGuids)
  local identity=Identity()
  if cfg.membershipOnly~=true or not identity or Q.scopeChanged or Preview() or Read(InCombatLockdown)~=false
    or Q.identityBaseline and not SameIdentity(Q.identityBaseline,identity)
    or not Text(cfg.secret,1024) or #cfg.secret<16 or cfg.secret:find("REPLACE",1,true)
    or not H or type(H.hmacSha256hex)~="function" or type(H.sha256hex)~="function"
    or not OlympusVerifyAPI or type(OlympusVerifyAPI.Sync)~="function" then
    Say("Current native identity, signing or sync is unavailable; Initiate check held.");return false end
  local targets,_,joined=BatchTargets(targetGuids,false)
  if not targets then Say("Choose between one and twenty unique native Initiate GUIDs; no check requested.");return false end
  local roster,why=NativeRoster(identity)
  if not roster then Say(why);return false end
  for _,id in ipairs(targets) do
    if id==identity.guid or not roster[id] or roster[id].slot~=9 then
      Say("A selected GUID is absent, ambiguous or no longer a native Initiate. Refresh the roster before checking.");return false end
  end
  OlympusVerifyDB=OlympusVerifyDB or {}
  local db,now=OlympusVerifyDB,time()
  db.launchSequence=Number(db.launchSequence,0,999999999) and db.launchSequence+1 or 1
  local ledger=AttemptLedger()
  if not ledger then Say("Prior attempt custody is unavailable; no check requested.");return false end
  for _,id in ipairs(targets) do if ledger[id]~=nil then Say("Select prior attempts individually; batch checks cannot replace their history.");return false end end
  local control={version=4,action="select-directive",id=tostring(now)..":"..tostring(db.launchSequence),observedAt=now,
    scopeHash=identity.scopeHash,guid=identity.guid,targetGuids=targets,confirmations="[]"}
  control.mac=H.hmacSha256hex(cfg.secret,table.concat({"launch-selected-read","4","select-directive",control.id,tostring(now),identity.scopeHash,identity.guid,joined,"[]"},"|")):sub(1,32)
  db.launchControl=control
  Say("Requested a fresh check of "..#targets.." verified native Initiates. This reload exports the request; load its completed result before promoting. No promotion was sent.")
  OlympusVerifyAPI.Sync();return true
end
local function TabRows(current)
  local rows={}
  if not current then return rows end
  if Q.tab=="invites" then for _,r in ipairs(current.invites) do rows[#rows+1]=r end;return rows end
  if Q.tab=="buffer" then
    for _,r in ipairs(current.riskBuffer) do rows[#rows+1]=r end
    table.sort(rows,function(a,b)
      if (a.lastOnlineDays or -1)~=(b.lastOnlineDays or -1) then return (a.lastOnlineDays or -1)>(b.lastOnlineDays or -1) end
      if (a.level or 999)~=(b.level or 999) then return (a.level or 999)<(b.level or 999) end
      return a.name<b.name
    end)
  else
    for _,r in ipairs(current.promotions) do
      if Q.tab=="knights" and r.reason=="knight-veteran" or Q.tab=="initiates" and r.reason=="verified-initiate" then rows[#rows+1]=r end
    end
  end
  return rows
end
function Q.NextAction()
  local current,why=Q.Current()
  if Q.tab=="invites" then
    if OlympusOfficerInvites233 then return OlympusOfficerInvites233.Next(current and current.invites) end
    Say("Officer WHO/unit capability is unavailable. Use the normal native guild UI; no invite sent.");return false
  end
  if not current then Say(why); return false end
  if Q.tab=="buffer" then Q.RiskBuffer(); Say("Review the selected character in the normal guild roster. No removal has been sent."); return false end
  local action,roster=ActionContext()
  if not action then Say(roster); return false end
  local rows=TabRows(current)
  if not Q.tab then rows=current.promotions end
  local cg=type(C_GuildInfo)=="table" and C_GuildInfo or {}
  local ledger=AttemptLedger()
  for _,row in ipairs(rows) do
    local source=current.freshness[row.guid]
    local native=roster[row.guid]
    local status=native and Q.PromotionStatus(row.guid,current,native.slot)
    local rankReady=native and (status=="clear" and native.slot==row.currentSlot
      or status=="continue" and ledger and ledger[row.guid] and native.name==ledger[row.guid].name)
    if ActionFresh(current,source) and rankReady and native.slot>row.targetSlot
      and native.guid~=current.identity.guid and H.normalizeCharacter(native.name)==H.normalizeCharacter(row.name)
      and row.targetSlot>current.identity.rank and Read(CanGuildPromote)==true
      and Read(GuildControlGetRankName,row.targetSlot+1)==row.targetName
      and (type(cg.IsGuildRankAssignmentAllowed)~="function" or Read(cg.IsGuildRankAssignmentAllowed,native.guid,row.targetSlot+1)==true)
      then
      return Q.HardwarePromote(row.guid) -- display a secure confirmation; never execute addon Lua promotion
    end
  end
  Say("No fresh officer action is ready. Recheck the selected source page and sync; no action taken.")
  return false
end
function Q.Show()
  if Read(InCombatLockdown)~=false then return false end
  if not Q.window then
    local frame=CreateFrame("Frame","OlympusLaunch229Window",UIParent,"BasicFrameTemplateWithInset")
    frame:SetSize(560,550);frame:SetPoint("CENTER");frame:SetMovable(true);frame:EnableMouse(true)
    frame:RegisterForDrag("LeftButton");frame:SetScript("OnDragStart",frame.StartMoving);frame:SetScript("OnDragStop",frame.StopMovingOrSizing)
    local title=frame:CreateFontString(nil,"OVERLAY","GameFontNormalLarge");title:SetPoint("TOP",0,-12);title:SetText("OLYMPUS PRIME officer actions")
    local info=frame:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall");info:SetPoint("TOPLEFT",18,-42);info:SetWidth(520);info:SetJustifyH("LEFT")
    local function button(label,x,y,width,fn)
      local b=CreateFrame("Button",nil,frame,"UIPanelButtonTemplate");b:SetSize(width,24);b:SetPoint("TOPLEFT",x,y);b:SetText(label);b:SetScript("OnClick",fn);return b
    end
    Q.window,Q.windowInfo,Q.rowButtons,Q.rowRecheckButtons,Q.listPage=frame,info,{},{},1
    local tip=CreateFrame("Frame",nil,frame);tip:SetSize(520,52);tip:SetPoint("TOPLEFT",18,-42);tip:EnableMouse(true)
    tip:SetScript("OnEnter",function(self)
      if GameTooltip then GameTooltip:SetOwner(self,"ANCHOR_RIGHT");GameTooltip:SetText("Last loaded scan result");GameTooltip:AddLine(Q.windowDetails or "No supported loaded result.",0.9,0.86,0.75,true);GameTooltip:Show() end
    end)
    tip:SetScript("OnLeave",function() if GameTooltip then GameTooltip:Hide() end end)
    Q.sourceTip=tip
    Q.tab="knights";Q.tabButtons={}
    for i,spec in ipairs({{"invites","Knight invites"},{"knights","Knights > Veteran"},{"initiates","Verified > Member"},{"buffer","Purge buffer"}}) do
      local key=spec[1];Q.tabButtons[key]=button(spec[2],18+(i-1)*132,-100,125,function() Q.tab=key;Q.listPage=1;Q.Show() end)
    end
    button("Scan + reload",18,-134,125,function() Q.Control("scan") end)
    button("Stop + reload",150,-134,125,function() Q.Control("stop") end)
    button("Sync & reload",282,-134,125,function() if OlympusVerify_Sync then OlympusVerify_Sync() elseif OlympusVerifyAPI then OlympusVerifyAPI.Sync() end end)
    -- Round 5 item 1: in lockdown the Close and X buttons defer to the end of combat instead of calling Hide.
    local function close() if Read(InCombatLockdown)==false then frame:Hide() else Q.DeferCombatClose(frame) end end
    Q.windowClose=button("Close",414,-134,125,close)
    if type(frame.CloseButton)=="table" and type(frame.CloseButton.SetScript)=="function" then frame.CloseButton:SetScript("OnClick",close) end
    Q.CloseInCombat(frame,close) -- CL2-003: the same close as the Close button.
    for i=1,8 do local index=i
      local rowButton=CreateFrame("Button",nil,frame,"SecureActionButtonTemplate,UIPanelButtonTemplate")
      rowButton:SetSize(400,24);rowButton:SetPoint("TOPLEFT",18,-171-(i-1)*28)
      Q.rowButtons[i]=rowButton
      Q.BindPromotionButton(rowButton,function()
        local row=(Q.shownRows or {})[(Q.listPage-1)*8+index]
        return Q.tab~="buffer" and Q.tab~="invites" and row and row.guid or nil
      end,function(_,attempt,mouseButton,down)
        local row=(Q.shownRows or {})[(Q.listPage-1)*8+index]
        if row then
          local plainClick=mouseButton=="LeftButton" and down~=true and Read(InCombatLockdown)==false
            and Read(IsShiftKeyDown)==false and Read(IsControlKeyDown)==false and Read(IsAltKeyDown)==false
          if plainClick and Q.tab=="buffer" then
            local current=Q.Current();local source=current and current.freshness[row.guid]
            if source and not current.actionHeld and time()<source.expiresAt and time()<source.scanExpiresAt then Say("Review "..row.name.." in the normal guild roster. This buffer never calls a removal API.")
            else Say("Unverified status is stale or held. Recheck this source page before native review; no removal sent.") end
          elseif plainClick and Q.tab=="invites" then if OlympusOfficerInvites233 then OlympusOfficerInvites233.HardwareInvite(row) end
          end
          Q.Show()
        end
      end)
      Q.rowRecheckButtons[i]=button("Recheck + reload",426,-171-(i-1)*28,112,function()
        local row=(Q.shownRows or {})[(Q.listPage-1)*8+index];local current,why=Q.Current()
        local source=row and current and current.freshness[row.guid]
        if source and source.kind=="selected" then Q.Select(row.guid)
        elseif source then Q.Control("recheck",source.offset) else Say(why or "This recommendation is unavailable; refresh the projection.") end
      end)
    end
    button("Previous",18,-405,100,function() Q.listPage=math.max(1,Q.listPage-1);Q.Show() end)
    button("Next",125,-405,100,function() Q.listPage=math.min(math.max(1,math.ceil(#(Q.shownRows or {})/8)),Q.listPage+1);Q.Show() end)
    button("Recheck MOTD + reload",232,-405,195,function() Q.Control("recheck",0) end)
    Q.nextButton=button("Next officer action",18,-442,220,function() Q.NextAction();Q.Show() end)
    button("Native purge review",245,-442,207,function() Q.RiskBuffer() end)
    button("Show MOTD",18,-480,220,function() Q.Motd("show") end)
    button("Set MOTD once",245,-480,207,function() Q.Motd("set") end)
  end
  local current,why=Q.Current()
  Q.shownRows=TabRows(current)
  Q.listPage=math.min(Q.listPage,math.max(1,math.ceil(#Q.shownRows/8)))
  local used=OlympusLaunchQueue and OlympusLaunchQueue.refreshedPages;used=Number(used,0,50) and used or 0
  local details=current and ((current.scanComplete and "Discovery complete" or "Discovery incomplete").."; "..#current.pages.."/50 pages; "..used.."/50 recheck attempts (including rate-limit retries). Discovery actions use 60-second pages; selected promotions keep their own original expiry. Every action rechecks the native roster.") or why
  if current and current.rankHeld then
    details=(details or "").."\nDiscovery rank recommendations are held: "..(current.rankHeldReason=="directive-rank-policy-held" and "the loaded rank policy is held." or "the loaded complete rank table is unconfirmed.")
      .." Independent invite evidence and separately validated selected reads keep their own original checks."
  end
  if Q.tab=="invites" then
    local status=OlympusOfficerInvites233 and OlympusOfficerInvites233.Status()
    details=(details or "").."\nNext checks the original remote whisperer's explicit WHO guild state. Unknown guild stays held. "..(status and status.reason or "Capability unavailable.")
  elseif Q.tab=="buffer" then details=(details or "").."\nReview only: longest offline, then lowest level. Native guild UI removes; no automatic kick." end
  details=(details or "").."\nScan + reload exports. Wait for the Watcher, then Sync again to load its dated queue. No timer reload or instant delivery."
  if current and current.loadedScan then
    local s=current.loadedScan
    details=s.reason.."\nNext step: "..s.nextStep.."\n"..details
    Q.windowInfo:SetText(s.summary.."\nHover here for the full source reason and next step. Original action guards remain.")
  else Q.windowInfo:SetText(why or "No supported loaded result. Hover here for details.") end
  Q.windowDetails=details
  for i,b in ipairs(Q.rowButtons) do
    local row=Q.shownRows[(Q.listPage-1)*8+i]
    if row then
      local fresh=current.freshness[row.guid];local dated=ActionFresh(current,fresh)
      if Q.tab=="buffer" then b:SetText(row.name.." level "..tostring(row.level or "?")..", offline "..tostring(row.lastOnlineDays or "?").."d"..(dated and " (review only)" or " (STALE/held; recheck)"))
      elseif Q.tab=="invites" then b:SetText(row.name.." > native invite"..(dated and " (click: one request)" or " (STALE/held; recheck)"))
      else b:SetText(row.name.." > "..row.targetName..(dated and " (click: one native request)" or " (STALE/held; recheck)")) end
      b:Show();Q.rowRecheckButtons[i]:SetText("Recheck p"..fresh.offset);Q.rowRecheckButtons[i]:Show()
    else b:Hide();Q.rowRecheckButtons[i]:Hide() end
  end
  Q.window:Show()
end
local events = CreateFrame("Frame")
events:RegisterEvent("GUILD_ROSTER_UPDATE")
events:RegisterEvent("PLAYER_GUILD_UPDATE")
events:RegisterEvent("PLAYER_LEAVING_WORLD")
events:RegisterEvent("PLAYER_LOGOUT")
events:RegisterEvent("ADDON_ACTION_FORBIDDEN")
events:RegisterEvent("ADDON_ACTION_BLOCKED")
events:RegisterEvent("PLAYER_REGEN_DISABLED")
events:RegisterEvent("PLAYER_REGEN_ENABLED")
events:SetScript("OnEvent", function(_, event, addon, functionName)
  if event == "GUILD_ROSTER_UPDATE" then Q.generation = Q.generation + 1; Q.rosterAt = time(); ReconcilePromotions()
  elseif event == "PLAYER_REGEN_DISABLED" then Q.CloseCombatWindows() -- CL2-003; display only, no action state.
  elseif event == "PLAYER_REGEN_ENABLED" then Q.FinishCombatWindows() -- Round 5 item 1; display only, no action state.
  elseif event == "PLAYER_GUILD_UPDATE" and addon == "player" then
    Q.rosterAt=nil
    local raw=RawIdentity();local baseline=Q.loadedIdentity or Q.identityBaseline
    if raw and baseline and not SameIdentity(raw,baseline) then Q.scopeChanged=true
    elseif raw and not baseline then Q.identityBaseline=raw end
  elseif event == "PLAYER_LEAVING_WORLD" then Q.rosterAt = nil
  elseif event == "PLAYER_LOGOUT" then
    local db=OlympusVerifyDB
    Q.PublishPromotionCustody()
    if type(db)=="table" then db.launchPromotionCustodyDiagnostic=Q.PromotionCustodyDiagnostics() end
  elseif (event=="ADDON_ACTION_FORBIDDEN" or event=="ADDON_ACTION_BLOCKED") and addon == ADDON
    and (Q.inAction=="promote" or functionName=="C_GuildInfo.Promote()" or functionName=="GuildPromote()"
      or functionName=="C_GuildInfo.Promote" or functionName=="GuildPromote") then
    -- A delayed event identifies the blocked API, not the member or outcome.
    -- Keep every unknown record; never use the event to clear or retry a call.
    Q.promotionBlocked = true
    if Q.activeAttempt then Q.activeAttempt.blocked = true end
  end
end)
Q.Events = events -- deterministic local tests; contains no action dispatcher.
-- A later disk projection cannot be loaded without a second hardware reload.
-- This bounded reminder only signals a possibility, never a Watcher/server acknowledgment.
events:SetScript("OnUpdate",function()
  local control=OlympusVerifyDB and OlympusVerifyDB.launchControl
  if type(control)~="table" or control.action=="stop" or not Number(control.observedAt,1,time()) then return end
  local age=time()-control.observedAt
  if age<5 or age>=60 or Q.remindedControl==control.id then return end
  local identity=Identity()
  local selected=identity and SelectedCurrent(identity,time(),control)
  if selected and selected.completed then Q.remindedControl=control.id;return end -- Notification-only decision, never cached authority.
  if not OlympusLaunchQueue or OlympusLaunchQueue.controlId~=control.id then
    Q.remindedControl=control.id
    Say("The Watcher queue may be ready. Sync again to load and check its actual dated status; this reminder is not an acknowledgment.")
    if OlympusVerifyAutoSync then OlympusVerifyAutoSync.Request("queue-check") end
  end
end)

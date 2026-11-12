-- .229 launch operations. Projections expire; only explicit slash/button hardware paths may act.
-- No event/timer handler invites, promotes, removes or sets MOTD. Unknown unguilded proof stays held.
local ADDON = ...
local Q = { generation = 0, pending = {}, directBlocked = false }
OlympusLaunch229 = Q
local H, cfg = OlympusHmac, OlympusVerifyConfig or {}
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
local function HistoricalCurrent(data, selectedPage)
  local identity, now = Identity(), time()
  local function refuse(code, reason) return nil, "[" .. code .. "] " .. reason, code end
  if cfg.membershipOnly ~= true or not identity then return nil, "Current native Prime identity is unavailable; launch actions held." end
  if Q.scopeChanged then return nil, "Native guild identity changed. Refresh the watcher and reload; launch actions held." end
  if (Q.loadedIdentity or Q.identityBaseline) and not SameIdentity(Q.loadedIdentity or Q.identityBaseline,identity) then
    Q.scopeChanged = true; return nil, "Native guild/character identity changed; launch actions held." end
  if Preview() then return nil, "Preview is display only; launch actions held." end
  if type(data) ~= "table" then return refuse("projection_missing", "No dated launch projection is loaded; no action taken.") end
  if data.version ~= 2 then return refuse("projection_version", "The loaded launch container version is incompatible; no action taken.") end
  if type(data.pages) ~= "table" or #data.pages < 1 or #data.pages > 50 then
    local stop=Text(data.stoppedReason,64)
    local spec=stop and LOADED_STOP[stop] and LOADED_STATES[stop]
    return refuse("projection_pages", "No supported launch page list is loaded; no action taken."
      ..(spec and (" Unvalidated loaded container reports: "..spec[1]..". "..spec[2].." Next step: "..spec[3]) or "")) end
  local control = OlympusVerifyDB and OlympusVerifyDB.launchControl
  local held = data.stoppedReason or control and (control.action == "stop" or control.id ~= data.controlId)
  local result = { identity = identity, invites = {}, promotions = {}, riskBuffer = {}, held = {}, partial = data.scanComplete ~= true,
    pages = data.pages, actionHeld = held, freshness = {}, scanComplete = data.scanComplete == true, stalePages = 0 }
  local first, guids = data.pages[1], {}
  if type(first) ~= "table" then return refuse("malformed_page", "The first launch page is malformed; no action taken.") end
  if first.protocol ~= "officer-operations-v233" then
    return refuse("page_protocol", "The loaded launch page protocol is incompatible with officer-operations-v233. No action taken; obtain a compatible source projection.") end
  if type(first) ~= "table" or type(first.scan) ~= "table" or not Text(first.scan.id, 32) or #first.scan.id ~= 32
    or not first.scan.id:match("^%x+$") or not Number(first.scan.startedAt, 1, now + 5)
    or not Number(first.scan.expiresAt, first.scan.startedAt + 1, first.scan.startedAt + 600) then
    return refuse("malformed_scan", "The original launch scan identity or clock bounds are malformed; no action taken.") end
  if type(first.entitlements) ~= "table" or not Number(first.entitlements.total, 0, 1000) then
    return refuse("malformed_entitlements", "The first launch page's entitlement metadata is malformed; no action taken.") end
  for index, page in ipairs(data.pages) do
    if type(page) ~= "table" then return refuse("malformed_page", "A launch page is malformed; no action taken.") end
    if page.protocol ~= "officer-operations-v233" then
      return refuse("page_protocol", "The loaded launch page protocol is incompatible with officer-operations-v233. No action taken; obtain a compatible source projection.") end
    if page.status ~= "ready" and page.status ~= "partial" then
      return refuse("page_status", "A launch page is not in a supported ready or partial source state; no action taken.") end
    if not Number(page.fetchedAt, 1, 2147483647) or not Number(page.expiresAt, page.fetchedAt, page.fetchedAt + 60)
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
          if not Number(row.currentSlot, 7, 9) or not Number(row.targetSlot, 0, 9) or row.targetSlot >= row.currentSlot
            or not ((row.targetSlot == 6 and row.targetName == "Veteran" and row.reason == "knight-veteran")
              or (row.targetSlot == 8 and row.targetName == "Member" and row.reason == "verified-initiate" and row.currentSlot == 9)) then
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
local SELECT_KEYS={version=true,protocol=true,controlId=true,actorGuid=true,targetGuid=true,scopeHash=true,observedAt=true,
  snapshotId=true,snapshotAt=true,startedAt=true,expiresAt=true,running=true,stoppedReason=true,attempts=true,completed=true,page=true,coveredGuids=true}
local SELECT_CONTROL={version=true,action=true,id=true,observedAt=true,scopeHash=true,guid=true,targetGuid=true,mac=true}
local function ValidSelect(control,identity,now)
  if not ExactKeys(control,SELECT_CONTROL) or control.version~=2 or control.action~="select"
    or not Text(control.id,32) or not Number(control.observedAt,1,now+5) or control.id:match("^(%d+):%d+$")~=tostring(control.observedAt)
    or control.scopeHash~=identity.scopeHash or control.guid~=identity.guid or not Text(control.targetGuid,40)
    or not control.targetGuid:match("^Player%-%d+%-%x+$") or not Text(control.mac,32) or #control.mac~=32
    or not Text(cfg.secret,1024) or not H or type(H.hmacSha256hex)~="function" then return false end
  return control.mac==H.hmacSha256hex(cfg.secret,table.concat({"launch-selected-read","2","select",control.id,tostring(control.observedAt),control.scopeHash,control.guid,control.targetGuid},"|")):sub(1,32)
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
  if not ValidSelect(control,identity,now) then return nil end
  local held={targetGuid=control.targetGuid,state="pending",reason="The selected read is awaiting a matching result; its historical recommendation is held."}
  if not ExactKeys(data,SELECT_KEYS) or data.version~=1 or data.protocol~="promotion-selection-v273"
    or data.controlId~=control.id or data.actorGuid~=identity.guid or data.targetGuid~=control.targetGuid
    or data.scopeHash~=identity.scopeHash or data.observedAt~=control.observedAt or data.startedAt~=data.observedAt
    or not Number(data.observedAt,1,now+5) or type(data.running)~="boolean" or type(data.completed)~="boolean"
    or not Number(data.attempts,0,3) or data.stoppedReason~=nil and not Text(data.stoppedReason,64) then return held end
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
  if not covered[data.targetGuid] then return held end
  local page=data.page
  if type(page.entitlements)~="table" or page.entitlements.scanned~=#data.coveredGuids or page.entitlements.pageSize~=20
    or not Number(page.entitlements.total,1,1000) or page.memberCount~=page.entitlements.total
    or not Number(page.entitlements.offset,0,980) or page.entitlements.offset%20~=0
    or page.entitlements.scanned~=math.min(20,page.entitlements.total-page.entitlements.offset)
    or page.entitlements.unscanned~=math.max(0,page.entitlements.total-page.entitlements.offset-page.entitlements.scanned)
    or page.entitlements.retryAfterSeconds~=nil or type(page.invites)~="table" or next(page.invites)~=nil
    or type(page.riskBuffer)~="table" or next(page.riskBuffer)~=nil then return held end
  if page.snapshotId~=data.snapshotId or page.snapshotAt~=data.snapshotAt or type(page.scan)~="table"
    or page.scan.startedAt~=data.startedAt or page.scan.expiresAt~=data.expiresAt
    or not Number(page.fetchedAt,data.observedAt,now+5)
    or page.nextCursor~=nil or page.pageCursor~=nil then return held end
  local checked=HistoricalCurrent({version=2,controlId=control.id,scanComplete=false,pages={page}},true)
  if not checked then return held end
  for _,kind in ipairs({"promotions","held","riskBuffer"}) do
    for _,row in ipairs(checked[kind]) do if not covered[row.guid] then return held end end
  end
  held={targetGuid=data.targetGuid,state="complete",reason="The selected page is loaded with its original observation dates. A separate hardware click must recheck the current native target.",
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
  local covered=selection.completed and selection.covered or {[selection.targetGuid or ""]=true}
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
  local rows, names = {}, {}
  for index = 1, count do
    local ok, name, _, slot, level, _, _, note, officerNote, online, _, _, _, _, _, _, _, guid = pcall(GetGuildRosterInfo, index)
    name, guid = ok and Text(name, 100), ok and Text(guid, 40)
    local key = name and H.normalizeCharacter(name)
    if not name or not guid or not key or not Number(slot, 0, 9) or rows[guid] or names[key] then return nil, "Native roster is incomplete or ambiguous." end
    local onlineKnown = type(online) == "boolean"
    if type(issecretvalue) == "function" then local known, secret = pcall(issecretvalue, online); if not known or secret then onlineKnown = false end end
    rows[guid] = { name = name, guid = guid, slot = slot, level = level, note = note, officerNote = officerNote,
      online = onlineKnown and online == true, onlineKnown = onlineKnown, index = index }
    names[key] = true
  end
  local final = Identity()
  if not final or final.guild ~= identity.guild or final.realm ~= identity.realm or final.guid ~= identity.guid then return nil, "Native identity changed; no action taken." end
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
-- SavedVariables retain only spent/unknown native-attempt metadata. A reload
-- cannot turn an unconfirmed call into a new unattempted target.
local function AttemptLedger(create)
  local db=OlympusVerifyDB
  if db==nil and not create then return {} end
  if type(db)~="table" then return nil end
  if db.launchPromotionAttempts==nil then
    if not create then return {} end
    db.launchPromotionAttempts={}
  end
  if type(db.launchPromotionAttempts)~="table" or getmetatable(db.launchPromotionAttempts)~=nil then return nil end
  return db.launchPromotionAttempts
end
function Q.AttemptHeld(id)
  local ledger=AttemptLedger()
  return not ledger or ledger[id]~=nil
end
function Q.HardwarePromote(target)
  local current, roster = ActionContext()
  if not current then Say(roster); return false end
  local row
  for index, value in ipairs(current.promotions) do if value.guid == target or tostring(index) == target then row = value; break end end
  if not row then Say("No current promotion matches that GUID/index."); return false end
  local fresh = current.freshness[row.guid]
  if not fresh or (fresh.actionHeld==nil and current.actionHeld or fresh.actionHeld) or not Number(fresh.expiresAt,1,2147483647)
    or not Number(fresh.scanExpiresAt,1,2147483647) or time() >= fresh.expiresAt or time() >= fresh.scanExpiresAt then Say("This page is stale or stopped. Explicitly recheck it and reload before acting."); return false end
  local native, pending = roster[row.guid], Q.pending[row.guid]
  local ledger=AttemptLedger(true)
  if not ledger then Say("Prior native attempt custody is unavailable; no action taken.");return false end
  if not native or H.normalizeCharacter(native.name) ~= H.normalizeCharacter(row.name) or native.guid == current.identity.guid
    or row.targetSlot <= current.identity.rank or Read(CanGuildPromote) ~= true then Say("Current native identity/rank/permission does not admit this promotion."); return false end
  if native.slot <= row.targetSlot then Say("Native target rank already reached; no action taken. Any prior unknown attempt remains retained for review."); return false end
  if not pending and ledger[row.guid]~=nil then Say("A prior native attempt survives reload and is unconfirmed. Review the current native rank; no repeat was sent.");return false end
  if pending then
    if pending.failed or pending.scopeHash ~= current.identity.scopeHash or pending.snapshotId ~= fresh.snapshotId
      or pending.contextId~=fresh.contextId
      or pending.target ~= row.targetSlot or Q.generation <= pending.generation or native.slot ~= pending.expected
      or pending.attempts >= pending.maximum then Say("Prior attempt is unconfirmed or changed; no automatic retry. Refresh and review the native roster."); return false end
  elseif native.slot ~= row.currentSlot then Say("The native rank changed since this projection; refresh it."); return false end
  if Q.directBlockedGeneration and Q.generation <= Q.directBlockedGeneration then Say("Refresh the native roster before using the hardware fallback."); return false end
  if Read(GuildControlGetRankName, row.targetSlot + 1) ~= row.targetName then
    Say("The client cannot confirm the named target rank. Use the normal guild roster UI; no promotion sent."); return false end
  local cg = type(C_GuildInfo) == "table" and C_GuildInfo or {}
  local direct = not Q.directBlocked and type(cg.SetGuildRankOrder) == "function"
  if direct and Read(cg.IsGuildRankAssignmentAllowed, native.guid, row.targetSlot + 1) ~= true then Say("The client does not allow assigning this native rank."); return false end
  local fn = direct and cg.SetGuildRankOrder or (type(cg.Promote) == "function" and cg.Promote or GuildPromote)
  if type(fn) ~= "function" then Say("No native promotion API is available; use the normal guild UI."); return false end
  local attempt = { scopeHash = current.identity.scopeHash, snapshotId = fresh.snapshotId, contextId=fresh.contextId, target = row.targetSlot,
    generation = Q.generation, expected = direct and row.targetSlot or native.slot - 1,
    attempts = (pending and pending.attempts or 0) + 1, maximum = pending and pending.maximum or native.slot - row.targetSlot }
  local count=0;for _ in pairs(ledger) do count=count+1 end
  if ledger[row.guid]==nil and count>=1000 then Say("Native attempt custody is full; no action taken.");return false end
  ledger[row.guid]={scopeHash=attempt.scopeHash,actorGuid=current.identity.guid,targetGuid=row.guid,target=attempt.target,
    snapshotId=attempt.snapshotId,contextId=attempt.contextId,attemptedAt=time(),state="unknown"}
  Q.pending[row.guid], Q.activeAttempt, Q.inAction = attempt, attempt, direct and "direct" or "fallback"
  local ok
  if direct then ok = pcall(fn, native.guid, row.targetSlot + 1) else ok = pcall(fn, native.name) end
  Q.inAction, Q.activeAttempt = nil, nil
  if attempt.blocked then
    Q.pending[row.guid] = nil;ledger[row.guid]=nil
    Say("This client blocked the direct API. Refresh the roster; a later click may use one-rank hardware fallback.")
    return false
  end
  if not ok then attempt.failed = true; Say("Native promotion outcome is unknown; no retry was queued."); return false end
  Say("One native promotion requested. Wait for a fresh roster; another rank needs a separate click.")
  return true
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
  local value={version=2,action="select",id=tostring(now)..":"..tostring(db.launchSequence),observedAt=now,
    scopeHash=identity.scopeHash,guid=identity.guid,targetGuid=targetGuid}
  value.mac=H.hmacSha256hex(cfg.secret,table.concat({"launch-selected-read","2","select",value.id,tostring(now),identity.scopeHash,identity.guid,targetGuid},"|")):sub(1,32)
  db.launchControl=value
  Say("Selected GUID read requested. This reload saves its fresh native source; sync later to load the dated result. Promotion needs a separate hardware click.")
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
  for _,row in ipairs(rows) do
    local source=current.freshness[row.guid]
    if ActionFresh(current,source) and roster[row.guid] and roster[row.guid].slot>row.targetSlot then
      return Q.HardwarePromote(row.guid) -- exactly one attempted target per hardware action
    end
  end
  Say("No fresh officer action is ready. Recheck the selected source page and sync; no action taken.")
  return false
end
function Q.Show()
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
    button("Close",414,-134,125,function() frame:Hide() end)
    for i=1,8 do local index=i
      Q.rowButtons[i]=button("",18,-171-(i-1)*28,400,function()
        local row=(Q.shownRows or {})[(Q.listPage-1)*8+index]
        if row then
          if Q.tab=="buffer" then
            local current=Q.Current();local source=current and current.freshness[row.guid]
            if source and not current.actionHeld and time()<source.expiresAt and time()<source.scanExpiresAt then Say("Review "..row.name.." in the normal guild roster. This buffer never calls a removal API.")
            else Say("Unverified status is stale or held. Recheck this source page before native review; no removal sent.") end
          elseif Q.tab=="invites" then if OlympusOfficerInvites233 then OlympusOfficerInvites233.HardwareInvite(row) end
          else Q.HardwarePromote(row.guid) end
          Q.Show()
        end
      end)
      Q.rowRecheckButtons[i]=button("Recheck + reload",426,-171-(i-1)*28,112,function()
        local row=(Q.shownRows or {})[(Q.listPage-1)*8+index];local current,why=Q.Current()
        local source=row and current and current.freshness[row.guid]
        if source then Q.Control("recheck",source.offset) else Say(why or "This recommendation is unavailable; refresh the projection.") end
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
  local details=current and ((current.scanComplete and "Discovery complete" or "Discovery incomplete").."; "..#current.pages.."/50 pages; "..used.."/50 recheck attempts (including rate-limit retries). Actions need a fresh 60-second page and native roster.") or why
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
events:RegisterEvent("ADDON_ACTION_FORBIDDEN")
events:RegisterEvent("ADDON_ACTION_BLOCKED")
events:SetScript("OnEvent", function(_, event, addon)
  if event == "GUILD_ROSTER_UPDATE" then Q.generation = Q.generation + 1; Q.rosterAt = time()
  elseif event == "PLAYER_GUILD_UPDATE" and addon == "player" then
    Q.rosterAt=nil
    local raw=RawIdentity();local baseline=Q.loadedIdentity or Q.identityBaseline
    if raw and baseline and not SameIdentity(raw,baseline) then Q.scopeChanged=true
    elseif raw and not baseline then Q.identityBaseline=raw end
  elseif event == "PLAYER_LEAVING_WORLD" then Q.rosterAt = nil
  elseif addon == ADDON and Q.inAction == "direct" then
    Q.directBlocked = true; Q.directBlockedGeneration = Q.generation
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
  if age>=5 and age<60 and Q.remindedControl~=control.id and (not OlympusLaunchQueue or OlympusLaunchQueue.controlId~=control.id) then
    Q.remindedControl=control.id
    Say("The Watcher queue may be ready. Sync again to load and check its actual dated status; this reminder is not an acknowledgment.")
    if OlympusVerifyAutoSync then OlympusVerifyAutoSync.Request("queue-check") end
  end
end)

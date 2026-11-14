-- Read-only explanation of the existing promotion projection. These candidates
-- are button visibility only: HardwarePromote remains the sole action path and
-- repeats its native identity, rank, permission and original-attempt checks.
local M = {}
OlympusVerifyRosterModel = M

local function readable(value)
  if type(issecretvalue) == "function" then
    local ok, secret = pcall(issecretvalue, value)
    if not ok or secret then return false end
  end
  return true
end
local function whole(value, low, high)
  return readable(value) and type(value) == "number" and value == value
    and value == math.floor(value) and value >= low and value <= high
end
local function guid(value)
  return readable(value) and type(value) == "string" and #value <= 40
    and value:match("^Player%-%d+%-%x+$") ~= nil
end
local function array(value, maximum)
  if type(value) ~= "table" or getmetatable(value) ~= nil then return nil end
  local count = 0
  for key in pairs(value) do
    count = count + 1
    if count > maximum or not whole(key, 1, maximum) then return nil end
  end
  for index = 1, count do if rawget(value, index) == nil then return nil end end
  return count
end
local function detail(state, label, reason)
  return { state = state, label = label, reason = reason }
end
local function sourceReason(value)
  if readable(value) and type(value) == "string" then
    return value:gsub("[%c|]", " "):sub(1, 320)
  end
end
local function initiate(row)
  return type(row) == "table" and readable(row.rankIndex) and row.rankIndex == 9
end
local function verified(row)
  local base = row.verification
  return row.status == "verified" and row.historicalLinked ~= true
    and (type(base) ~= "table" or base.status == "verified" and base.historicalLinked ~= true)
end
local function recommendation(row)
  return type(row)=="table" and guid(row.guid) and ((row.reason=="verified-initiate" and (row.currentSlot==9 or row.currentSlot==8 and type(row.intent)=="table" and row.intent.startSlot==9 and row.intent.acknowledgedSteps==1) and row.targetSlot==7 and row.targetName=="Member")
    or (row.reason=="knight-veteran" and whole(row.currentSlot,6,9) and row.targetSlot==5 and row.targetName=="Veteran"))
end
local heldLabels = {
  ["native-rank-unconfirmed"] = "The source could not confirm the native rank; no promotion was recommended.",
  ["pending-verification"] = "The source recorded verification as pending; no promotion was recommended.",
  ["verification-unknown"] = "The source recorded verification as unknown; no promotion was recommended.",
  ["discord-entitlement-unknown"] = "The source could not establish the Discord entitlement; no promotion was recommended.",
}
-- Held-row reason text is not validated by Current. Count only fixed codes and
-- use fixed display text; never copy an arbitrary source reason into the UI.
local function sourceRows(rows, maximum, byGuid, counts, risk)
  local count = array(rows, maximum)
  if not count then return nil end
  for index = 1, count do
    local row = rows[index]
    if type(row) ~= "table" or not guid(row.guid) then return nil end
    local code = readable(row.reason) and type(row.reason) == "string" and row.reason or "other"
    code = risk and code == "unverified-initiate" and code or not risk and heldLabels[code] and code or "other"
    counts[code] = (counts[code] or 0) + 1
    if byGuid[row.guid] ~= nil then byGuid[row.guid] = false
    else byGuid[row.guid] = code end
  end
  return count
end

-- A different completed selected read may supersede discovery without holding
-- an unrelated GUID's deliberate read. This never supplies action authority.
local function UnrelatedReadContext(current)
  local selection=current and current.selection
  local source=OlympusLaunchQueue
  if not current or not current.actionHeld or type(selection)~="table" or selection.completed~=true
    or type(selection.covered)~="table" or type(current.loadedScan)~="table" or current.loadedScan.code~="superseded"
    or type(source)~="table" or getmetatable(source)~=nil or rawget(source,"pages")~=current.pages
    or rawget(source,"stoppedReason")~=nil then return false end -- Raw source only adds denial.
  local native=OlympusVerifyNativeRanks
  if type(native)~="table" or type(native.Observe)~="function" or type(native.Qualified)~="function" then return false end
  local ok,qualified=pcall(function()return native.Qualified(native.Observe())end)
  return ok and qualified==true
end

-- list is the unfiltered native roster with its existing base verification
-- classification. knownVerifiedInitiates is potential only, never action proof.
-- held counts loaded Initiate recommendations without a ready native target;
-- notReadyInitiates also includes members with no recommendation at all.
function M.Promotions(list, launchAPI, now)
  local candidates = {}
  local diagnostics = { nativeInitiates = 0, knownVerifiedInitiates = 0,
    recommendations = 0, ready = 0, readyInitiates = 0, held = 0, notReadyInitiates = 0,
    knownVerifiedNotReady = 0, duplicateGuids = 0, partial = false,
    stalePages = 0, pageCount = 0, queueAvailable = false, legacyUnsupported = false,
    sourceHeld = 0, riskReview = 0, heldReasonCounts = {}, riskReasonCounts = {},
    pageStatusCounts = { ready = 0, partial = 0 },
    byGuid = {}, byRow = {}, byIndex = {}, counts = {} }
  local size = array(list, 1000)
  if not size then
    diagnostics.state, diagnostics.reason, diagnostics.inputUnavailable = "unavailable",
      "The native roster is incomplete or unreadable; promotion readiness is unknown.", true
    return candidates, diagnostics
  end
  local seen = {}
  for index = 1, size do
    local row = list[index]
    if type(row) ~= "table" or getmetatable(row) ~= nil then
      diagnostics.state, diagnostics.reason, diagnostics.inputUnavailable = "unavailable",
        "The native roster contains an unreadable row; promotion readiness is unknown.", true
      return candidates, diagnostics
    end
    if initiate(row) then diagnostics.nativeInitiates = diagnostics.nativeInitiates + 1 end
    if guid(row.guid) then seen[row.guid] = (seen[row.guid] or 0) + 1 end
  end
  for _, count in pairs(seen) do if count > 1 then diagnostics.duplicateGuids = diagnostics.duplicateGuids + 1 end end

  if now == nil and type(time) == "function" then local ok, value = pcall(time); if ok then now = value end end
  local current, unavailable, originalPages, sourceHeld, riskReview = nil, nil, {}, {}, {}
  local historicalPages={}
  if not whole(now, 1, 2147483647) then unavailable = "The current clock is unavailable; source expiry cannot be checked."
  elseif type(launchAPI) ~= "table" or type(launchAPI.Current) ~= "function" then
    diagnostics.legacyUnsupported = true
    unavailable = "A supported dated promotion API is unavailable. Legacy invite queues and verification labels cannot authorize promotion."
  elseif type(launchAPI.HardwarePromote) ~= "function" then
    unavailable = "The hardware promotion action is unavailable; no promotion button can be enabled."
  elseif type(launchAPI.pending) ~= "table" then
    unavailable = "The original pending-attempt ledger is unavailable; an unattempted promotion cannot be established."
  else
    local ok, value, why = pcall(launchAPI.Current) -- existing validated source, dot call; no hardware action
    if ok and type(value) == "table" then current = value
    else unavailable = ok and sourceReason(why) or "The dated promotion projection could not be checked." end
    if not current then
      unavailable = (unavailable or "No dated promotion projection is loaded.")
        .. " A supported current projection is required; legacy invite queues are not promotion authority."
    end
  end
  if current then
    local pages, promotions = array(current.pages, 50), array(current.promotions, 1000)
    if not pages or pages==0 and not current.selection or not promotions or type(current.freshness) ~= "table" then
      unavailable, current = "The validated projection is incomplete; original page freshness is unavailable.", nil
    else
      diagnostics.queueAvailable, diagnostics.pageCount = true, pages
      diagnostics.partial, diagnostics.scanComplete = current.partial == true, current.scanComplete == true
      diagnostics.stalePages = whole(current.stalePages, 0, 50) and current.stalePages or 0
      for pageIndex = 1, pages do
        local page = current.pages[pageIndex]
        local rows = type(page) == "table" and array(page.promotions, 20)
        if not rows or type(page.scan) ~= "table" or type(page.entitlements) ~= "table" then
          unavailable, current = "An original promotion source page is unavailable or malformed.", nil
          break
        end
        if page.status == "ready" or page.status == "partial" then
          diagnostics.pageStatusCounts[page.status] = diagnostics.pageStatusCounts[page.status] + 1
        end
        for index = 1, rows do
          local row = page.promotions[index]
          if recommendation(row) then
            historicalPages[row.guid]=row
            if originalPages[row.guid] ~= nil then originalPages[row.guid] = false
            else originalPages[row.guid] = { row = row, page = page } end
          end
        end
      end
      if current and current.selection and current.selection.completed then
        local chosen=current.selection
        for id in pairs(chosen.covered) do originalPages[id]=nil end
        for _,row in ipairs(chosen.page.promotions) do
          if recommendation(row) then originalPages[row.guid]={row=row,page=chosen.page} end
        end
      end
      if current then
        local heldCount = sourceRows(current.held, 1000, sourceHeld, diagnostics.heldReasonCounts, false)
        local riskCount = sourceRows(current.riskBuffer, 1000, riskReview, diagnostics.riskReasonCounts, true)
        if not heldCount or not riskCount then
          unavailable, current = "Source hold and risk-review diagnostics are unavailable or malformed.", nil
        else diagnostics.sourceHeld, diagnostics.riskReview = heldCount, riskCount end
      end
    end
  end
  local recommendations = {}
  if current then
    for _, row in ipairs(current.promotions) do
      if recommendation(row) then
        diagnostics.recommendations = diagnostics.recommendations + 1
        if recommendations[row.guid] ~= nil then recommendations[row.guid] = false else recommendations[row.guid] = row end
      end
    end
  end
  diagnostics.queueAvailable = current ~= nil
  diagnostics.current = current -- One validated context for this paint; never a persistent authority cache.
  diagnostics.loadedScan=current and current.loadedScan or nil
  diagnostics.selection=current and current.selection or nil

  local unrelatedRead=UnrelatedReadContext(current) -- One complete native rank-table observation per model paint.
  for index = 1, size do
    local row, info = list[index], nil
    local id = guid(row.guid) and row.guid or nil
    local attemptStatus=id and type(launchAPI)=="table" and type(launchAPI.PromotionStatus)=="function"
      and launchAPI.PromotionStatus(id,current,row.rankIndex) or nil
    if initiate(row) and id and seen[id] == 1 and verified(row) then
      diagnostics.knownVerifiedInitiates = diagnostics.knownVerifiedInitiates + 1
    end
    if not id then info = detail("missing_guid", "Native GUID unavailable", "No unique native character GUID is available; a name match cannot enable promotion.")
    elseif seen[id] ~= 1 then info = detail("duplicate_guid", "Duplicate native GUID", "This GUID occurs more than once in the native list; no promotion is ready.")
    elseif not whole(row.rankIndex, 0, 9) then info = detail("unavailable", "Native rank unavailable", "The current native rank slot is unreadable; promotion readiness is unknown.")
    elseif attemptStatus=="settled" or attemptStatus=="confirmed" then info=detail("wrong_rank","Target rank observed (history retained)","A complete native roster previously confirmed this original target. Its command history is retained; this historical fact never enables a repeat.")
    elseif not whole(row.rankIndex,6,9) then info = detail("wrong_rank", "Native rank needs no supported promotion", "Only current native slots 6 through 9 can match a supported Member or Veteran recommendation.")
    elseif not current then info = detail("unavailable", "Promotion source unavailable", unavailable)
    elseif attemptStatus=="blocked" then info=detail("held","Client promotion action blocked","The client reported a blocked promotion API. Original attempt history is retained; this view cannot clear the block or send a fallback.")
    elseif launchAPI.pending[id] ~= nil or attemptStatus=="pending"
      or not attemptStatus and type(launchAPI.AttemptHeld)=="function" and launchAPI.AttemptHeld(id,current,row.rankIndex) then info = detail("pending", "Prior attempt pending", "An original promotion attempt is pending or unconfirmed. It is not retried by this view.")
    elseif attemptStatus=="recheck" then info=detail("recheck","Check next original step","The last owned step was confirmed. Check this GUID against a fresh complete roster before a separate next promotion click; the original intent and expiry stay fixed.")
    elseif unrelatedRead and initiate(row) and verified(row) and current.selection.covered[id]~=true
      and sourceHeld[id]==nil and riskReview[id]==nil
      and (current.freshness[id]==nil or type(current.freshness[id])=="table" and current.freshness[id].kind=="discovery") then
      info=detail("check","Check eligibility","A different completed selected read superseded discovery. This GUID has no loaded action authority. A deliberate Check requests a separate current read; original dates and other characters' attempt history stay unchanged.")
    elseif current.actionHeld and not (current.freshness[id] and current.freshness[id].kind=="selected" and current.freshness[id].actionHeld==false) then info = detail("held", diagnostics.loadedScan and diagnostics.loadedScan.label or "Projection stopped or held",
      diagnostics.loadedScan and (diagnostics.loadedScan.summary.." Next step: "..diagnostics.loadedScan.nextStep)
        or "The loaded projection is stopped or superseded. No promotion is ready; review its original control state.")
    elseif not recommendations[id] then
      if sourceHeld[id] then
        info = detail("held", "Source eligibility held", heldLabels[sourceHeld[id]]
          or "The original source held this character without a supported promotion recommendation. Review the source; display verification cannot clear its hold.")
      elseif riskReview[id] then
        info = detail("no_recommendation", "Source risk review only", "The source lists this Initiate for unverified risk review only. This is not a promotion recommendation or permission to remove a member.")
      else
        info = detail("no_recommendation", "No loaded recommendation", verified(row)
          and "The base display is verified, but no supported Initiate-to-Member recommendation is loaded for this GUID. Display verification alone is not promotion authority."
          or "No supported Member or Veteran recommendation is loaded for this GUID. Verification or other admission checks may still be needed.")
      end
    else
      local source, original = current.freshness[id], originalPages[id]
      local page = original and original.page
      if not original or original.row ~= recommendations[id] or type(source) ~= "table"
        or not whole(source.expiresAt, 1, 2147483647) or not whole(source.scanExpiresAt, 1, 2147483647)
        or source.expiresAt ~= page.expiresAt or source.scanExpiresAt ~= page.scan.expiresAt
        or source.offset ~= page.entitlements.offset or source.row~=original.row or source.page~=page then
        info = detail("unavailable", "Original source unavailable", "The recommendation is not bound to its original page and scan expiry; no promotion is ready.")
      elseif source.actionHeld then info=detail("held","Selected read held","The selected result is pending or held; no historical recommendation can supply its action authority.")
      elseif source.kind~="selected" or type(recommendations[id].intent)~="table" then info=detail("no_recommendation","Check selected GUID","Discovery is advisory. A fresh Directive selected plan is required before a promotion click.")
      elseif row.rankIndex~=recommendations[id].currentSlot and attemptStatus~="continue" then info=detail("wrong_rank","Native rank changed","The current native rank differs from this recommendation. Recheck the selected GUID; no action is ready.")
      elseif now >= source.scanExpiresAt then info = detail("expired", "Original scan expired", "The original scan has expired. Its recommendation is advisory until an explicit source recheck.")
      elseif now >= source.expiresAt then info = detail("expired", "Recommendation page expired", "The original recommendation page has expired. A verified display does not renew its action window.")
      else
        candidates[id], diagnostics.ready = true, diagnostics.ready + 1
        if initiate(row) then diagnostics.readyInitiates=diagnostics.readyInitiates+1 end
        info = detail("ready", "Ready for "..recommendations[id].targetName, "A fresh dated recommendation matches this unique native GUID and current rank. One hardware click must recheck native identity, rank, permission and prior attempts before acting.")
        if attemptStatus=="continue" then info.reason="A newer complete native roster confirmed the previous one-rank step in this original context. One separate hardware click may request the next rank; the named target and original expiry remain unchanged." end
        if source.kind=="selected" then
          info.reason=info.reason.." Original selected recommendation: "..tostring(math.max(0,math.min(source.expiresAt,source.scanExpiresAt)-now)).." seconds remaining. Reloading does not renew it."
        end
        info.targetName,info.targetSlot=recommendations[id].targetName,recommendations[id].targetSlot
      end
    end
    info.historical=historicalPages[id]~=nil
    info.historicalTargetName=historicalPages[id] and historicalPages[id].targetName or nil
    diagnostics.byRow[row], diagnostics.byIndex[index] = info, info
    if id then diagnostics.byGuid[id] = info end
    diagnostics.counts[info.state] = (diagnostics.counts[info.state] or 0) + 1
    if initiate(row) and id and seen[id] == 1 and verified(row) and not candidates[id] then
      diagnostics.knownVerifiedNotReady = diagnostics.knownVerifiedNotReady + 1
    end
  end
  diagnostics.historicalRecommendations=0;for _ in pairs(historicalPages) do diagnostics.historicalRecommendations=diagnostics.historicalRecommendations+1 end
  diagnostics.held = math.max(0, diagnostics.recommendations - diagnostics.ready)
  diagnostics.notReadyInitiates = math.max(0, diagnostics.nativeInitiates - diagnostics.readyInitiates)
  if not current then diagnostics.state, diagnostics.reason = "unavailable", unavailable
  elseif diagnostics.ready>0 then diagnostics.state,diagnostics.reason="ready",tostring(diagnostics.ready).." fresh supported recommendation(s); each hardware click rechecks the exact native target."
  elseif current.selection and current.selection.completed and (diagnostics.counts.expired or 0)>0 then diagnostics.state,diagnostics.reason="expired","The selected recommendation has expired; its original clocks remain unchanged. Recheck the selected GUID for a new read."
  elseif current.selection then diagnostics.state,diagnostics.reason=current.selection.state=="pending" and "pending" or "held",current.selection.reason
  elseif current.actionHeld then diagnostics.state, diagnostics.reason = "held", diagnostics.loadedScan
    and (diagnostics.loadedScan.reason.." No recommendations are actionable. Next step: "..diagnostics.loadedScan.nextStep)
    or "The promotion projection is stopped or superseded. No recommendations are actionable."
  elseif diagnostics.ready > 0 then diagnostics.state, diagnostics.reason = "ready", tostring(diagnostics.ready) .. " fresh recommendation(s) match unique native Initiates; each hardware click rechecks the native action."
  elseif diagnostics.recommendations == 0 then
    diagnostics.state, diagnostics.reason = "no_recommendation", diagnostics.nativeInitiates == 0
      and "No native Initiates (slot 9) are present in the current roster; no promotion is ready."
      or "No supported Member or Veteran recommendations are loaded. Known verified Initiates are potential candidates only."
  elseif (diagnostics.counts.expired or 0) > 0 then diagnostics.state, diagnostics.reason = "expired", "Loaded recommendation pages or their original scan have expired; no promotion is ready."
  elseif (diagnostics.counts.pending or 0) > 0 then diagnostics.state, diagnostics.reason = "pending", "Original promotion attempts remain pending or unconfirmed; no automatic retry is permitted."
  else diagnostics.state, diagnostics.reason = "held", "Loaded recommendations do not match an actionable unique native Initiate. Inspect each row's reason." end
  if diagnostics.partial then diagnostics.reason = diagnostics.reason .. " Discovery is partial; absent recommendations may be undiscovered." end
  if diagnostics.sourceHeld > 0 or diagnostics.riskReview > 0 then
    diagnostics.reason = diagnostics.reason .. " Source projection: " .. diagnostics.sourceHeld .. " held; "
      .. diagnostics.riskReview .. " risk-review only. Neither is a promotion recommendation."
  end
  if diagnostics.pageStatusCounts.partial > 0 then
    diagnostics.reason = diagnostics.reason .. " " .. diagnostics.pageStatusCounts.partial
      .. " page(s) have partial status; completed discovery does not clear source holds."
  end
  if diagnostics.stalePages > 0 then
    diagnostics.reason = diagnostics.reason .. " " .. diagnostics.stalePages .. " stale source page(s) are advisory only."
  end
  if diagnostics.loadedScan and not current.actionHeld and not current.selection then
    diagnostics.reason=diagnostics.reason.." "..diagnostics.loadedScan.reason.." Next step: "..diagnostics.loadedScan.nextStep
  end
  if diagnostics.selection then diagnostics.reason=diagnostics.reason.." Selected read: "..diagnostics.selection.reason.." Original discovery retains "..tostring(diagnostics.historicalRecommendations or 0).." dated recommendation(s)." end
  return candidates, diagnostics
end

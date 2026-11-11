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
  return type(row) == "table" and guid(row.guid) and row.reason == "verified-initiate"
    and row.currentSlot == 9 and row.targetSlot == 8 and row.targetName == "Member"
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

-- list is the unfiltered native roster with its existing base verification
-- classification. knownVerifiedInitiates is potential only, never action proof.
-- held counts loaded Initiate recommendations without a ready native target;
-- notReadyInitiates also includes members with no recommendation at all.
function M.Promotions(list, launchAPI, now)
  local candidates = {}
  local diagnostics = { nativeInitiates = 0, knownVerifiedInitiates = 0,
    recommendations = 0, ready = 0, held = 0, notReadyInitiates = 0,
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
        .. " A supported v2 projection is required; legacy invite queues are not promotion authority."
    end
  end
  if current then
    local pages, promotions = array(current.pages, 50), array(current.promotions, 1000)
    if not pages or pages == 0 or not promotions or type(current.freshness) ~= "table" then
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
            if originalPages[row.guid] ~= nil then originalPages[row.guid] = false
            else originalPages[row.guid] = { row = row, page = page } end
          end
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
  diagnostics.loadedScan=current and current.loadedScan or nil

  for index = 1, size do
    local row, info = list[index], nil
    local id = guid(row.guid) and row.guid or nil
    if initiate(row) and id and seen[id] == 1 and verified(row) then
      diagnostics.knownVerifiedInitiates = diagnostics.knownVerifiedInitiates + 1
    end
    if not id then info = detail("missing_guid", "Native GUID unavailable", "No unique native character GUID is available; a name match cannot enable promotion.")
    elseif seen[id] ~= 1 then info = detail("duplicate_guid", "Duplicate native GUID", "This GUID occurs more than once in the native list; no promotion is ready.")
    elseif not whole(row.rankIndex, 0, 9) then info = detail("unavailable", "Native rank unavailable", "The current native rank slot is unreadable; promotion readiness is unknown.")
    elseif not initiate(row) then info = detail("wrong_rank", "Not a native Initiate", "The current native rank is not Initiate slot 9; a loaded recommendation cannot override it.")
    elseif not current then info = detail("unavailable", "Promotion source unavailable", unavailable)
    elseif launchAPI.pending[id] ~= nil then info = detail("pending", "Prior attempt pending", "An original promotion attempt is pending or unconfirmed. It is not retried by this view.")
    elseif current.actionHeld then info = detail("held", diagnostics.loadedScan and diagnostics.loadedScan.label or "Projection stopped or held",
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
          or "No supported Initiate-to-Member recommendation is loaded for this GUID. Verification or other admission checks may still be needed.")
      end
    else
      local source, original = current.freshness[id], originalPages[id]
      local page = original and original.page
      if not original or original.row ~= recommendations[id] or type(source) ~= "table"
        or not whole(source.expiresAt, 1, 2147483647) or not whole(source.scanExpiresAt, 1, 2147483647)
        or source.expiresAt ~= page.expiresAt or source.scanExpiresAt ~= page.scan.expiresAt
        or source.offset ~= page.entitlements.offset then
        info = detail("unavailable", "Original source unavailable", "The recommendation is not bound to its original page and scan expiry; no promotion is ready.")
      elseif now >= source.scanExpiresAt then info = detail("expired", "Original scan expired", "The original scan has expired. Its recommendation is advisory until an explicit source recheck.")
      elseif now >= source.expiresAt then info = detail("expired", "Recommendation page expired", "The original recommendation page has expired. A verified display does not renew its action window.")
      else
        candidates[id], diagnostics.ready = true, diagnostics.ready + 1
        info = detail("ready", "Ready for Member", "A fresh original Initiate-to-Member recommendation matches this unique native slot-9 GUID. One hardware click must recheck native identity, rank and permission before acting.")
      end
    end
    diagnostics.byRow[row], diagnostics.byIndex[index] = info, info
    if id then diagnostics.byGuid[id] = info end
    diagnostics.counts[info.state] = (diagnostics.counts[info.state] or 0) + 1
    if initiate(row) and id and seen[id] == 1 and verified(row) and not candidates[id] then
      diagnostics.knownVerifiedNotReady = diagnostics.knownVerifiedNotReady + 1
    end
  end
  diagnostics.held = math.max(0, diagnostics.recommendations - diagnostics.ready)
  diagnostics.notReadyInitiates = math.max(0, diagnostics.nativeInitiates - diagnostics.ready)
  if not current then diagnostics.state, diagnostics.reason = "unavailable", unavailable
  elseif current.actionHeld then diagnostics.state, diagnostics.reason = "held", diagnostics.loadedScan
    and (diagnostics.loadedScan.reason.." No recommendations are actionable. Next step: "..diagnostics.loadedScan.nextStep)
    or "The promotion projection is stopped or superseded. No recommendations are actionable."
  elseif diagnostics.ready > 0 then diagnostics.state, diagnostics.reason = "ready", tostring(diagnostics.ready) .. " fresh recommendation(s) match unique native Initiates; each hardware click rechecks the native action."
  elseif diagnostics.recommendations == 0 then
    diagnostics.state, diagnostics.reason = "no_recommendation", diagnostics.nativeInitiates == 0
      and "No native Initiates (slot 9) are present in the current roster; no promotion is ready."
      or "No Initiate-to-Member recommendations are loaded. Known verified Initiates are potential candidates only."
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
  if diagnostics.loadedScan and not current.actionHeld then
    diagnostics.reason=diagnostics.reason.." "..diagnostics.loadedScan.reason.." Next step: "..diagnostics.loadedScan.nextStep
  end
  return candidates, diagnostics
end

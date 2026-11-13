-- Shared synthetic officer-operations-v234 fixture pieces for the legacy launch,
-- selection and roster suites (Stage 2 addon280, 13 Nov 2026). Those suites were
-- written for v233 (container 2, Member slot8/Veteran slot6, discovery pages as
-- action authority). The product now admits a promotion click only through a
-- server-sealed selected Directive intent, so their fixtures build that intent
-- here instead of keeping the retired shapes. Only the inputs move: every guard
-- under test is the real addon code. Nothing here reads Config.lua or client files.
local D = {}

-- The 12 November ladder, read from the generated constants module so the
-- fixture can never drift from the profile and digest the addon checks.
function D.ranks(e)
  local function load(name) setfenv(assert(loadfile("../OlympusVerify/" .. name)), e)("OlympusVerify") end
  load("OlympusVerifyNativeRankConstants.lua")
  local c = e.OlympusVerifyNativeRankConstants
  local names = {}
  for i, v in ipairs(c.names) do names[i] = v end
  e.GuildControlGetNumRanks = function() return #names end
  e.GuildControlGetRankName = function(i) return names[i] end
  load("OlympusVerifyNativeRanks.lua")
  -- The client reports each member's rank label from the same table as
  -- GuildControlGetRankName, so a rank change also changes the label. A row may
  -- set rankLabel to model a client whose label disagrees with the slot.
  local native = e.GetGuildRosterInfo
  e.GetGuildRosterInfo = function(i)
    local values = { native(i) }
    local m = e.ROSTER[i]
    if m and values[1] ~= nil then
      if m.rankLabel ~= nil then values[2] = m.rankLabel
      elseif type(m.rankIndex) == "number" then values[2] = names[m.rankIndex + 1] end
    end
    return unpack(values, 1, 17)
  end
  return names, c
end

function D.scope(e, guild, realm)
  return e.OlympusHmac.sha256hex("native-scope|1|" .. guild .. "|" .. realm):sub(1, 16)
end

-- Stamp a page with the v234 protocol and the complete Directive rank table.
function D.stamp(e, page)
  local c = e.OlympusVerifyNativeRankConstants
  page.protocol = "officer-operations-v234"
  page.rankProfile, page.rankSchemeDigest = c.profile, c.digest
  page.rankNames = { unpack(c.names) }
  return page
end

local sequence = 0
local function nextId(now) sequence = sequence + 1; return tostring(now) .. ":" .. tostring(700 + sequence) end

-- A signed v1 discovery control (Scan or Recheck) that matches the loaded
-- container, so discovery rows are current but still advisory.
function D.signDiscovery(e, data, actor, scopeHash, action, offset, observedAt)
  action, offset, observedAt = action or "scan", offset or 0, observedAt or e.NOW
  local c = { version = 1, action = action, id = nextId(observedAt), observedAt = observedAt, scopeHash = scopeHash, guid = actor, offset = offset }
  c.mac = e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret, table.concat({ "launch-control", "1", c.action, c.id,
    tostring(c.observedAt), c.scopeHash, c.guid, tostring(c.offset) }, "|")):sub(1, 32)
  e.OlympusVerifyDB = e.OlympusVerifyDB or {}
  e.OlympusVerifyDB.launchControl = c
  if data then data.controlId = c.id end
  return c
end

local function sorted(list)
  local copy = {}; for i, v in ipairs(list) do copy[i] = v end
  table.sort(copy); return copy
end
local function encode(ids)
  local out = {}; for i, id in ipairs(ids) do out[i] = '"' .. id .. '"' end
  return "[" .. table.concat(out, ",") .. "]"
end

-- A signed v4 select-directive control, as Q.Select/Q.SelectMany write it.
function D.signSelect(e, actor, scopeHash, targets, confirmations, observedAt)
  observedAt, confirmations = observedAt or e.NOW, confirmations or "[]"
  local ids = sorted(targets)
  local c = { version = 4, action = "select-directive", id = nextId(observedAt), observedAt = observedAt, scopeHash = scopeHash,
    guid = actor, targetGuids = ids, confirmations = confirmations }
  c.mac = e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret, table.concat({ "launch-selected-read", "4", "select-directive",
    c.id, tostring(observedAt), scopeHash, actor, table.concat(ids, ","), confirmations }, "|")):sub(1, 32)
  e.OlympusVerifyDB = e.OlympusVerifyDB or {}
  e.OlympusVerifyDB.launchControl = c
  return c
end

-- Seal one promotion row with a Directive intent. spec: guid, name, start
-- (original native slot), final (5 Veteran or 7 Member), ack (server-acknowledged
-- steps), origin {snapshotId, snapshotAt, context, issued, expires}.
function D.seal(e, actor, page, spec)
  local c = e.OlympusVerifyNativeRankConstants
  local knight = spec.final == 5
  local ack = spec.ack or 0
  local o = spec.origin or {}
  local originId = o.snapshotId or (ack == 0 and page.snapshotId or page.snapshotId - ack)
  local originAt = o.snapshotAt or (ack == 0 and page.snapshotAt or page.snapshotAt - 10)
  local issued = o.issued or originAt
  local expires = o.expires or issued + 600 -- the server's sealed intent window
  local p = { version = 1, id = spec.intentId or ("synthetic-intent-" .. spec.guid), actorGuid = actor, targetGuid = spec.guid, name = spec.name,
    subjectDigest = e.OlympusHmac.sha256hex("synthetic-subject|" .. spec.guid), rankProfile = c.profile, rankSchemeDigest = c.digest,
    originSnapshotId = originId, originSnapshotAt = originAt, originContext = o.context or page.scan.id,
    startSlot = spec.start, finalSlot = spec.final, reason = knight and "knight-veteran" or "verified-initiate",
    issuedAt = issued, expiresAt = expires, acknowledgedSteps = ack, lastSnapshotId = page.snapshotId,
    lastObservedAt = ack == 0 and originAt or page.snapshotAt }
  return { name = spec.name, guid = spec.guid, currentSlot = spec.start - ack, targetSlot = spec.final,
    targetName = knight and "Veteran" or "Member", reason = p.reason, intent = p,
    intentToken = "c3ludGhldGlj." .. e.OlympusHmac.sha256hex("synthetic-token|" .. spec.guid .. "|" .. ack .. "|" .. page.snapshotId) }
end

-- Publish a completed selected-directive result for a signed v4 control.
-- opts: guild, realm, actor, scopeHash, control (else signed here), targets
-- (GUIDs, default the specs'), specs (promotion rows to seal), held (rows),
-- snapshotId, snapshotAt, fetchedAt, ttl (page window, default 60), total.
function D.publish(e, opts)
  local now = e.NOW
  local specs, held = opts.specs or {}, opts.held or {}
  local targets = opts.targets
  if not targets then
    targets = {}
    for _, s in ipairs(specs) do targets[#targets + 1] = s.guid end
    for _, r in ipairs(held) do targets[#targets + 1] = r.guid end
  end
  local control = opts.control or D.signSelect(e, opts.actor, opts.scopeHash, targets, opts.confirmations, opts.observedAt)
  local ids = sorted(control.targetGuids)
  local snapshotAt = opts.snapshotAt or now
  local fetchedAt = opts.fetchedAt or now
  local expires = math.min(control.observedAt + 600, snapshotAt + 600)
  local total = opts.total or #ids
  local page = D.stamp(e, { status = "partial", fetchedAt = fetchedAt, expiresAt = math.min(expires, fetchedAt + (opts.ttl or 60)),
    snapshotId = opts.snapshotId or 12, snapshotAt = snapshotAt, memberCount = total, guild = opts.guild, canonicalGuild = "OLYMPUS PRIME",
    realm = opts.realm, scopeHash = control.scopeHash,
    entitlements = { offset = 0, pageSize = 20, scanned = #ids, total = total, unscanned = total - #ids },
    scan = { id = opts.context or string.rep("d", 32), startedAt = control.observedAt, expiresAt = expires },
    invites = {}, promotions = {}, riskBuffer = {}, held = held,
    actions = { automatic = false, roleGrants = false, removals = false, requiresNativeRecheck = true } })
  -- A next step keeps the original intent, whose expiry the page may not pass.
  for _, s in ipairs(specs) do if s.origin and s.origin.expires then page.expiresAt = math.min(page.expiresAt, s.origin.expires) end end
  for _, s in ipairs(specs) do page.promotions[#page.promotions + 1] = D.seal(e, control.guid, page, s) end
  local covered = {}; for i, id in ipairs(ids) do covered[i] = id end
  local data = { version = 2, protocol = "promotion-selection-directive-v1", controlId = control.id, actorGuid = control.guid,
    targetGuids = sorted(ids), targetsDigest = e.OlympusHmac.sha256hex(encode(ids)), coverageKind = "selected-guids",
    confirmations = control.confirmations, scopeHash = control.scopeHash, observedAt = control.observedAt,
    snapshotId = page.snapshotId, snapshotAt = snapshotAt, startedAt = control.observedAt, expiresAt = expires,
    running = false, attempts = 1, completed = true, page = page, coveredGuids = covered }
  e.OlympusLaunchSelected = data
  return data, page, control
end

return D

-- The actual read-only model consumes the actual launch validator. All native
-- APIs, identities and signing material here are synthetic; Config.lua is not loaded.
local passed, failed = 0, 0
local function check(label, yes)
  if yes then passed = passed + 1; print("PASS " .. label)
  else failed = failed + 1; print("FAIL " .. label) end
end
local function fixture()
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  local f = { e = e, nativeReads = 0, effects = 0, currentReads = 0 }
  e.NOW = 1900000000
  e.issecretvalue = function() return false end
  e.OlympusVerifyConfig = { secret = "synthetic-model-only", membershipOnly = true }
  e.GetGuildInfo = function() return "OLYMPUS PRIME", "High Council", 1 end
  e.GetRealmName = function() return "Native Realm" end
  e.UnitGUID = function() return "Player-1-0000AAAA" end
  local function effect() f.effects = f.effects + 1; error("read model must not act") end
  e.GuildPromote, e.GuildInvite, e.GuildUninvite, e.ReloadUI = effect, effect, effect, effect
  e.C_GuildInfo = { SetGuildRankOrder = effect, GuildRoster = effect }
  e.GetGuildRosterInfo = function() f.nativeReads = f.nativeReads + 1; error("model does not rescan native APIs") end
  e.OlympusVerifyAPI = { Sync = effect }
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify")
  f.rows = {
    { name = "Alpha", guid = "Player-1-0000B001", rank = "Initiate", rankIndex = 9, status = "verified" },
    { name = "Beta", guid = "Player-1-0000B002", rank = "Initiate", rankIndex = 9, status = "verified" },
    { name = "Unknown", guid = "Player-1-0000B003", rank = "Initiate", rankIndex = 9, status = "unknown" },
    { name = "Member", guid = "Player-1-0000B004", rank = "Member", rankIndex = 8, status = "verified" },
    { name = "Knight", guid = "Player-1-0000B005", rank = "Knight", rankIndex = 7, status = "verified" },
  }
  f.recommendation = { name = "Alpha", guid = f.rows[1].guid, currentSlot = 9, targetSlot = 8,
    targetName = "Member", reason = "verified-initiate" }
  f.page = { protocol = "officer-operations-v233", fetchedAt = e.NOW, expiresAt = e.NOW + 60,
    status = "ready", snapshotId = 1, snapshotAt = e.NOW, memberCount = 5,
    guild = "OLYMPUS PRIME", canonicalGuild = "OLYMPUS PRIME", realm = "Native Realm",
    scopeHash = e.OlympusHmac.sha256hex("native-scope|1|OLYMPUS PRIME|Native Realm"):sub(1, 16),
    entitlements = { offset = 0, total = 5 }, scan = { id = string.rep("a", 32), startedAt = e.NOW, expiresAt = e.NOW + 600 },
    promotions = { f.recommendation }, invites = {}, riskBuffer = {}, held = {},
    actions = { automatic = false, roleGrants = false, removals = false, requiresNativeRecheck = true } }
  e.OlympusLaunchQueue = { version = 2, controlId = "loaded", scanComplete = true, pages = { f.page } }
  e.OlympusVerifyDB = {}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")), e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")), e)("OlympusVerify")
  f.q, f.m = e.OlympusLaunch229, e.OlympusVerifyRosterModel
  local current = f.q.Current
  f.q.Current = function() f.currentReads = f.currentReads + 1; return current() end
  f.q.HardwarePromote = effect
  f.read = function() return f.m.Promotions(f.rows, f.q, e.NOW) end
  return f
end

do
  local f = fixture(); local ready, d = f.read()
  check("only exact current native Initiate intersects the original supported recommendation", ready[f.rows[1].guid] == true and ready[f.rows[2].guid] == nil)
  check("known verified potential is distinct from loaded recommendations and action readiness", d.nativeInitiates == 3 and d.knownVerifiedInitiates == 2 and d.recommendations == 1 and d.ready == 1 and d.held == 0 and d.knownVerifiedNotReady == 1)
  check("verified without recommendation has an explicit reason instead of an opaque zero", d.byGuid[f.rows[2].guid].state == "no_recommendation" and d.byGuid[f.rows[2].guid].reason:find("Display verification alone", 1, true))
  check("non-Initiates have a native-rank explanation", d.byGuid[f.rows[4].guid].state == "wrong_rank")
  check("each row has the same diagnostic object through all lookup forms", d.byRow[f.rows[1]] == d.byGuid[f.rows[1].guid] and d.byIndex[1] == d.byRow[f.rows[1]])
  check("read model calls existing Current once and no hardware, sync or native rescan", f.currentReads == 1 and f.effects == 0 and f.nativeReads == 0)
  f.rows[1].status = "unknown"; ready, d = f.read()
  check("display classification cannot create or invalidate an existing original recommendation", ready[f.rows[1].guid] and d.knownVerifiedInitiates == 1)
end

do
  local f = fixture()
  local ready, d = f.m.Promotions(f.rows, nil, f.e.NOW)
  check("missing projection retains potential counts without manufacturing readiness", d.nativeInitiates == 3 and d.knownVerifiedInitiates == 2 and d.ready == 0 and next(ready) == nil and d.state == "unavailable")
  check("legacy queues are explicitly unsupported as promotion authority", d.legacyUnsupported and d.reason:find("Legacy invite queues", 1, true))
  f.e.OlympusLaunchQueue.version = 1; ready, d = f.read()
  check("actual Current refuses a legacy queue and the model retains its diagnostic", d.ready == 0 and d.byGuid[f.rows[1].guid].state == "unavailable" and d.reason:find("legacy invite queues", 1, true))
  f = fixture(); f.q.Current = function() error("synthetic private error") end
  ready, d = f.read()
  check("failed Current is held with fixed guidance rather than raw error material", d.ready == 0 and d.reason:find("could not be checked", 1, true) and not d.reason:find("private", 1, true))
  f = fixture(); f.q.HardwarePromote = nil; ready, d = f.read()
  check("missing hardware action never enables a promotion button or calls Current", next(ready) == nil and d.ready == 0 and d.state == "unavailable" and d.reason:find("hardware promotion action is unavailable", 1, true) and f.currentReads == 0 and f.effects == 0)
  f = fixture(); f.q.HardwarePromote = true; ready, d = f.read()
  check("a non-function hardware action is equally unavailable", next(ready) == nil and d.byGuid[f.rows[1].guid].state == "unavailable" and f.effects == 0)
end

do
  local f = fixture(); f.e.NOW = f.e.NOW + 60
  local ready, d = f.read()
  check("exact source-page expiry preserves recommendation but blocks readiness", not ready[f.rows[1].guid] and d.recommendations == 1 and d.held == 1 and d.byGuid[f.rows[1].guid].state == "expired")
  check("fresh verified labels never renew action expiry", d.knownVerifiedInitiates == 2 and d.byGuid[f.rows[1].guid].reason:find("does not renew", 1, true))
  f = fixture(); f.e.NOW = f.e.NOW + 600; ready, d = f.read()
  check("original scan expiry is separately explained", d.byGuid[f.rows[1].guid].label == "Original scan expired" and d.ready == 0)
  f = fixture(); f.e.OlympusLaunchQueue.stoppedReason = "operator-stopped"; ready, d = f.read()
  check("stopped projection keeps potential and recommendation counts without enabling a button", d.knownVerifiedInitiates == 2 and d.recommendations == 1 and d.ready == 0 and d.state == "held" and d.byGuid[f.rows[1].guid].state == "held")
  f = fixture(); f.e.OlympusLaunchQueue.scanComplete = false; ready, d = f.read()
  check("partial discovery is disclosed without discarding a fresh individually validated page", d.partial and d.ready == 1 and ready[f.rows[1].guid] and d.reason:find("Discovery is partial", 1, true))
end

do
  local f = fixture(); local id = f.rows[1].guid
  local pending = { attempts = 1, failed = true, original = "retained" }; f.q.pending[id] = pending
  local ready, d = f.read()
  check("prior pending or unknown attempt blocks another promotion", d.ready == 0 and d.byGuid[id].state == "pending")
  check("reads never clear or replace pending original custody", f.q.pending[id] == pending and pending.attempts == 1 and pending.failed == true and pending.original == "retained" and f.effects == 0)
  f = fixture(); f.rows[1].rankIndex = 8; ready, d = f.read()
  check("native rank change defeats an older Initiate recommendation", d.ready == 0 and d.byGuid[id].state == "wrong_rank" and f.recommendation.currentSlot == 9)
  f = fixture(); f.rows[#f.rows + 1] = { name = "Duplicate", guid = id, rankIndex = 9, status = "verified" }; ready, d = f.read()
  check("duplicate native GUID defeats exact-target eligibility", not ready[id] and d.duplicateGuids == 1 and d.byGuid[id].state == "duplicate_guid" and d.byRow[f.rows[1]].state == "duplicate_guid")
  f = fixture(); f.rows[1].guid = nil; ready, d = f.read()
  check("missing native GUID never borrows a same-name recommendation", d.ready == 0 and d.byIndex[1].state == "missing_guid" and d.byRow[f.rows[1]].state == "missing_guid")
  f = fixture(); f.rows[1].rankIndex = nil; ready, d = f.read()
  check("unreadable native rank is unknown rather than an inferred Initiate", d.ready == 0 and d.byIndex[1].state == "unavailable" and d.byIndex[1].label == "Native rank unavailable")
end

do
  local f = fixture(); local current = f.q.Current()
  f.q.Current = function() return current end
  current.freshness[f.rows[1].guid].expiresAt = f.e.NOW + 600
  local ready, d = f.read()
  check("edited freshness cannot extend the original source-page window", d.ready == 0 and d.byGuid[f.rows[1].guid].state == "unavailable" and f.page.expiresAt == f.e.NOW + 60)
  f = fixture(); current = f.q.Current(); f.q.Current = function() return current end
  current.freshness[f.rows[1].guid].offset = 20; ready, d = f.read()
  check("freshness from another page cannot authorize the target", d.ready == 0 and d.byGuid[f.rows[1].guid].state == "unavailable")
  f = fixture(); current = f.q.Current(); f.q.Current = function() return current end
  current.promotions[1] = { name = "Alpha", guid = f.rows[1].guid, currentSlot = 9, targetSlot = 8, targetName = "Member", reason = "verified-initiate" }
  ready, d = f.read()
  check("a copied recommendation cannot replace its original page row", d.ready == 0 and d.byGuid[f.rows[1].guid].state == "unavailable")
end

do
  local f = fixture(); f.rows[1].historicalLinked = true
  local ready, d = f.read()
  check("historical display flags do not inflate known-verified potential", d.knownVerifiedInitiates == 1)
  f = fixture(); f.rows[1].verification = { status = "stale" }; ready, d = f.read()
  check("conflicting base classification cannot inflate current verified potential", d.knownVerifiedInitiates == 1)
  f = fixture(); f.rows[8] = f.rows[1]; ready, d = f.read()
  check("a sparse native list is unknown, never a silently truncated ready list", next(ready) == nil and d.inputUnavailable == true)
  f = fixture(); ready, d = f.m.Promotions(f.rows, f.q, 0/0)
  check("an unreadable clock cannot manufacture current readiness", d.ready == 0 and d.state == "unavailable" and f.currentReads == 0)
end

do
  local f = fixture(); f.page.promotions = {}
  local ready, d = f.read()
  check("zero actionable recommendations still explains two known verified Initiates", d.queueAvailable and d.nativeInitiates == 3 and d.knownVerifiedInitiates == 2 and d.recommendations == 0 and d.ready == 0 and d.state == "no_recommendation" and d.knownVerifiedNotReady == 2)
  for _, row in ipairs(f.rows) do if row.rankIndex == 9 then row.rankIndex = 8 end end
  ready, d = f.read()
  check("no native Initiates is distinguished from a missing recommendation", d.nativeInitiates == 0 and d.knownVerifiedInitiates == 0 and d.reason:find("No native Initiates", 1, true))
  f = fixture(); local original = f.page
  local nextPage = {}; for key, value in pairs(original) do nextPage[key] = value end
  original.entitlements = { offset = 0, total = 40 }
  nextPage.fetchedAt, nextPage.expiresAt = f.e.NOW + 1, f.e.NOW + 61
  nextPage.entitlements = { offset = 20, total = 40 }
  nextPage.promotions = { { name = "Beta", guid = f.rows[2].guid, currentSlot = 9, targetSlot = 8, targetName = "Member", reason = "verified-initiate" } }
  f.e.OlympusLaunchQueue.pages[2] = nextPage; f.e.NOW = f.e.NOW + 60
  ready, d = f.read()
  check("fresh later source page remains ready while the first page is expired", not ready[f.rows[1].guid] and ready[f.rows[2].guid] and d.ready == 1 and d.recommendations == 2 and d.stalePages == 1 and d.byGuid[f.rows[1].guid].state == "expired")
  check("stale-page summary explicitly keeps historical source rows advisory", d.reason:find("1 stale source page(s) are advisory only", 1, true))
end

do
  local f = fixture(); f.page.promotions = {}; f.page.status = "partial"
  f.page.held = {
    { name = "Alpha", guid = f.rows[1].guid, reason = "discord-entitlement-unknown" },
    { name = "Beta", guid = f.rows[2].guid, reason = "synthetic private reason | malicious markup" },
  }
  f.page.riskBuffer = { { name = "Unknown", guid = f.rows[3].guid, currentSlot = 9, reviewOnly = true, reason = "unverified-initiate" } }
  local ready, d = f.read()
  check("zero promotions exposes source holds and risk review without converting either to eligibility", next(ready) == nil and d.ready == 0 and d.recommendations == 0 and d.sourceHeld == 2 and d.riskReview == 1 and d.held == 0 and d.knownVerifiedInitiates == 2)
  check("safe reason counts retain known codes and aggregate arbitrary held reason text as other", d.heldReasonCounts["discord-entitlement-unknown"] == 1 and d.heldReasonCounts.other == 1 and d.riskReasonCounts["unverified-initiate"] == 1 and not d.reason:find("private", 1, true) and not d.byGuid[f.rows[2].guid].reason:find("private", 1, true))
  check("per-row held explanation names the source entitlement gap rather than implying verified status is enough", d.byGuid[f.rows[1].guid].state == "held" and d.byGuid[f.rows[1].guid].reason:find("Discord entitlement", 1, true))
  check("risk buffer remains review only and never suggests promotion or removal authority", d.byGuid[f.rows[3].guid].state == "no_recommendation" and d.byGuid[f.rows[3].guid].label == "Source risk review only" and d.byGuid[f.rows[3].guid].reason:find("not a promotion recommendation or permission to remove", 1, true))
  check("completed discovery with partial source pages is disclosed separately", d.scanComplete and not d.partial and d.pageStatusCounts.partial == 1 and d.pageStatusCounts.ready == 0 and d.reason:find("completed discovery does not clear source holds", 1, true))
  f = fixture(); local current = f.q.Current(); f.q.Current = function() return current end
  current.held = { [2] = { name = "Beta", guid = f.rows[2].guid, reason = "verification-unknown" } }
  ready, d = f.read()
  check("malformed source hold diagnostics do not silently permit action", next(ready) == nil and d.state == "unavailable" and d.reason:find("diagnostics are unavailable or malformed", 1, true))
end

do
  local f = fixture()
  for index = #f.rows + 1, 1000 do
    f.rows[index] = { name = "Synthetic " .. index, guid = string.format("Player-1-%08X", index + 10000), rankIndex = 8, status = "verified" }
  end
  local ready, d = f.read()
  check("one-thousand-member diagnostics use one existing projection read and no extra native reads", d.ready == 1 and d.nativeInitiates == 3 and #d.byIndex == 1000 and f.currentReads == 1 and f.nativeReads == 0 and f.effects == 0)
  check("readiness neither changes original source expiry nor rewrites input native ranks", f.page.expiresAt == f.e.NOW + 60 and f.rows[1].rankIndex == 9 and ready[f.rows[1].guid])
end

print(string.format("Roster model: %d passed, %d failed", passed, failed))
if failed > 0 then os.exit(1) end

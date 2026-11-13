-- CL2-003 (13 Nov 2026): the roster window, the Launch window and the promotion
-- confirmation get out of the way when combat starts, and no call the client
-- forbids during combat lockdown is made. Real addon modules on the current
-- protocol (officer-operations-v234, the Directive rank profile, a sealed
-- selected intent); only the client is synthetic (wow_mock.lua's lockdown model).
-- No installed client, Config.lua, SavedVariables or network is used.
local passed, failed = 0, 0
local function check(label, value, detail)
  if value then passed = passed + 1; print("PASS " .. label)
  else failed = failed + 1; print("FAIL " .. label .. (detail and (" -- " .. tostring(detail)) or "")) end
end

local GUID = "Player-1-0000BBBB"
local function fixture(opts)
  opts = opts or {}
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  e.MOCK_PROPAGATE_HIDE = true
  local f = { e = e, clicks = 0, direct = 0, reloads = 0 }
  e.OlympusVerifyConfig = { membershipOnly = true, secret = "synthetic-only-combat-close-secret", uiAutoShow = false }
  e.GetGuildInfo = function() return "OLYMPUS PRIME", "High Council", 1 end
  e.GetRealmName = function() return "Native Realm" end
  e.UnitGUID = function() return "Player-1-0000AAAA" end
  e.GetGuildRosterShowOffline = function() return true end
  e.CanGuildPromote = function() return true end
  e.issecretvalue = function() return false end
  e.ReloadUI = function() f.reloads = f.reloads + 1 end
  e.ROSTER = { { name = "Officer", rank = "High Council", rankIndex = 1, level = 60, online = true, guid = "Player-1-0000AAAA" },
    { name = "Candidate", rank = "Initiate", rankIndex = 9, level = 60, online = false, guid = GUID } }
  e.OlympusQueue = { version = 1, generatedAt = e.NOW, entries = {} }
  e.OlympusVerifyLists = { version = 1, guild = "OLYMPUS PRIME", realm = "Native Realm",
    verified = { fetchedAt = e.NOW, snapshotAt = e.NOW, members = { { name = "Candidate", guid = GUID, status = "member", username = "candidate", displayName = "Candidate" } } },
    unverified = { fetchedAt = e.NOW, snapshotAt = e.NOW, members = {} } }
  local function load(name) setfenv(assert(loadfile("../OlympusVerify/" .. name)), e)("OlympusVerify", {}) end
  load("Libs/OlympusHmac.lua"); load("OlympusVerifyNativeRankConstants.lua")
  local c = e.OlympusVerifyNativeRankConstants
  f.names = {}; for i, v in ipairs(c.names) do f.names[i] = v end
  e.GuildControlGetNumRanks = function() return #f.names end
  e.GuildControlGetRankName = function(i) return f.names[i] end
  e.C_GuildInfo.IsGuildRankAssignmentAllowed = function() return true end
  e.C_GuildInfo.Promote = function() f.direct = f.direct + 1; error("never direct") end
  e.GuildPromote = e.C_GuildInfo.Promote
  e.SECURE_MACRO_EXECUTE = function(body)
    assert(body == "/gpromote Candidate-Forever", "unexpected literal command: " .. tostring(body))
    assert(e.MOCK_LOCKDOWN ~= true, "a promotion command ran during combat lockdown")
    f.clicks = f.clicks + 1
    if not f.unknown then local row = e.ROSTER[2]; row.rankIndex = row.rankIndex - 1; row.rank = f.names[row.rankIndex + 1] end
  end
  e.OlympusVerifyDB = opts.db or {}
  if opts.db then e.ROSTER[2].rankIndex, e.ROSTER[2].rank = opts.slot, f.names[opts.slot + 1] end
  local scope = e.OlympusHmac.sha256hex("native-scope|1|OLYMPUS PRIME|Native Realm"):sub(1, 16)
  -- The sealed selected intent and acknowledgement as in test_directive_rank_transition.lua.
  local o = { snapshotId = 12, snapshotAt = e.NOW - 10, context = string.rep("a", 32), issued = e.NOW, expires = e.NOW + 500 }
  local now = e.NOW
  local p = { version = 1, id = "synthetic-plan-1", actorGuid = e.ROSTER[1].guid, targetGuid = GUID, name = "Candidate", subjectDigest = string.rep("b", 64),
    rankProfile = c.profile, rankSchemeDigest = c.digest, originSnapshotId = o.snapshotId, originSnapshotAt = o.snapshotAt, originContext = o.context,
    startSlot = 9, finalSlot = 7, reason = "verified-initiate", issuedAt = o.issued, expiresAt = o.expires,
    acknowledgedSteps = 0, lastSnapshotId = 12, lastObservedAt = o.snapshotAt }
  local row = { guid = GUID, name = "Candidate", currentSlot = 9, targetSlot = 7, targetName = "Member", reason = p.reason,
    intent = p, intentToken = "c3ludGhldGlj." .. string.rep("0", 64) }
  local page = { protocol = "officer-operations-v234", fetchedAt = now, expiresAt = o.expires, status = "partial", snapshotId = 12, snapshotAt = o.snapshotAt,
    memberCount = 2, guild = "OLYMPUS PRIME", canonicalGuild = "OLYMPUS PRIME", realm = "Native Realm", scopeHash = scope, rankProfile = c.profile,
    rankSchemeDigest = c.digest, rankNames = { unpack(f.names) }, entitlements = { offset = 0, pageSize = 20, scanned = 1, total = 2, unscanned = 1 },
    scan = { id = o.context, startedAt = now, expiresAt = now + 500 }, invites = {}, promotions = { row }, held = {}, riskBuffer = {}, heldReasons = {},
    motd = { short = "Synthetic" }, actions = { automatic = false, roleGrants = false, removals = false, requiresNativeRecheck = true } }
  local control = e.OlympusVerifyDB.launchControl
  if not control then
    control = { version = 4, action = "select-directive", id = tostring(now) .. ":1", observedAt = now, scopeHash = scope, guid = e.ROSTER[1].guid, targetGuids = { GUID }, confirmations = "[]" }
    control.mac = e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret, table.concat({ "launch-selected-read", "4", "select-directive", control.id, tostring(now), scope, control.guid, GUID, "[]" }, "|")):sub(1, 32)
    e.OlympusVerifyDB.launchControl = control
  end
  page.scan.startedAt = control.observedAt; page.scan.expiresAt = math.min(control.observedAt + 600, page.snapshotAt + 600)
  e.OlympusLaunchSelected = { version = 2, protocol = "promotion-selection-directive-v1", controlId = control.id, actorGuid = control.guid, targetGuids = { GUID },
    targetsDigest = e.OlympusHmac.sha256hex('["' .. GUID .. '"]'), coverageKind = "selected-guids", confirmations = control.confirmations, scopeHash = scope,
    observedAt = control.observedAt, snapshotId = page.snapshotId, snapshotAt = page.snapshotAt, startedAt = control.observedAt, expiresAt = page.scan.expiresAt,
    running = false, attempts = 1, completed = true, page = page, coveredGuids = { GUID } }
  -- A reload during combat: the client loads the addon while lockdown is on.
  if opts.combat then e.MOCK_COMBAT, e.MOCK_LOCKDOWN = true, true end
  -- TOC order: core, roster model, roster window, then the launch module.
  load("OlympusVerifyNativeRanks.lua"); load("OlympusVerify.lua"); load("OlympusVerifyRosterModel.lua"); load("OlympusVerifyRoster.lua"); load("OlympusVerifyLaunch229.lua")
  e.MockFireEvent("ADDON_LOADED", "OlympusVerify")
  f.q, f.w = e.OlympusLaunch229, e.OlympusVerifyRoster
  function f.emit(event, ...) e.MockFireEvent(event, ...) end
  function f.roster() e.NOW = e.NOW + 1; f.emit("GUILD_ROSTER_UPDATE") end
  f.emit("GUILD_ROSTER_UPDATE")
  function f.blocked()
    local out = {}
    for _, b in ipairs(e.MOCK_BLOCKED) do out[#out + 1] = tostring(b.call) .. "@" .. tostring(b.frame) end
    for _, err in ipairs(e.MOCK_SECURE_ERRORS) do out[#out + 1] = "secure:" .. err end
    return #out == 0, table.concat(out, ", ")
  end
  function f.saved()
    f.emit("PLAYER_LOGOUT")
    local function copy(value)
      if type(value) ~= "table" then return value end
      local out = {}; for k, v in pairs(value) do out[k] = copy(v) end; return out
    end
    return copy(e.OlympusVerifyDB)
  end
  -- The window's first build selects its default tab; choose the Initiate tab after it.
  function f.launch() f.q.Show(); f.q.tab = "initiates"; return f.q.Show() end
  function f.cancelButton()
    for _, frame in ipairs(e.FRAMES) do if frame._parent == e.OlympusPromotionConfirm and frame:GetText() == "Cancel" then return frame end end
  end
  function f.printed(text) for _, line in ipairs(e.PRINTS) do if line:find(text, 1, true) then return true end end return false end
  function f.escape()
    -- FrameXML's CloseSpecialWindows: names the addon inserted are tainted, so this runs insecure.
    for _, name in ipairs(e.UISpecialFrames) do local w = e[name]; if w and w:IsShown() then w:Hide() end end
  end
  function f.armed()
    for _, frame in ipairs(e.FRAMES) do
      if type(frame._template) == "string" and frame._template:find("SecureActionButtonTemplate", 1, true)
        and (frame:GetAttribute("type1") ~= nil or frame:GetAttribute("macrotext1") ~= nil) then return true end
    end
    return false
  end
  return f
end

-- A canonical, order-independent text of state that combat must not change.
local function dump(value, seen)
  if type(value) ~= "table" then return tostring(value) end
  seen = seen or {}
  if seen[value] then return "<cycle>" end
  seen[value] = true
  local keys = {}; for k in pairs(value) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  local parts = {}
  for _, k in ipairs(keys) do parts[#parts + 1] = tostring(k) .. "=" .. dump(value[k], seen) end
  seen[value] = nil
  return "{" .. table.concat(parts, ",") .. "}"
end
local function promotionState(f)
  local db = f.e.OlympusVerifyDB
  local pending = {}; for id, attempt in pairs(f.q.pending) do pending[id] = { record = attempt.record, phase = attempt.phase, expected = attempt.expected } end
  return dump({ ledger = db.launchPromotionAttempts, holds = db.launchPromotionSaveHolds, control = db.launchControl, pending = pending,
    confirm = f.q.confirmGuid, blocked = f.q.promotionBlocked, clicks = f.clicks, reloads = f.reloads })
end

local function openAll(f)
  f.w.Show(); f.launch()
  return f.q.HardwarePromote(GUID)
end
local function allHidden(f)
  return not f.e.OlympusVerifyRosterFrame:IsShown() and not f.e.OlympusLaunch229Window:IsShown() and not f.e.OlympusPromotionConfirm:IsShown()
end

-- 1. Nothing open: combat start and end make no call at all on any frame.
for _, lockdownFirst in ipairs({ false, true }) do
  local f = fixture()
  local before = promotionState(f)
  f.e.MockCombatStart(lockdownFirst); f.e.MockCombatEnd()
  local ok, why = f.blocked()
  check("nothing open: combat makes no forbidden call (" .. (lockdownFirst and "lockdown first" or "event first") .. ")", ok, why)
  check("nothing open: no window is built and no message is printed", f.e.OlympusVerifyRosterFrame == nil and f.e.OlympusLaunch229Window == nil and not f.printed("officer windows"))
  check("nothing open: promotion state unchanged", promotionState(f) == before)
end

-- 2. Each window open alone, with the event before lockdown and with lockdown first.
for _, lockdownFirst in ipairs({ false, true }) do
  local order = lockdownFirst and "lockdown first" or "event first"
  do
    local f = fixture()
    f.w.Show(); f.w.copyButton:Click(); f.w.statusButton:Click()
    check("roster opens with its menu and copy overlay (" .. order .. ")", f.e.OlympusVerifyRosterFrame:IsShown() and f.w.menu:IsShown() and f.w.copyBox:IsShown())
    local before = promotionState(f)
    f.e.MockCombatStart(lockdownFirst)
    local ok, why = f.blocked()
    check("roster closes when combat starts (" .. order .. ")", not f.e.OlympusVerifyRosterFrame:IsShown() and not f.w.menu:IsShown() and not f.w.copyBox:IsShown())
    check("roster close makes no forbidden call (" .. order .. ")", ok, why)
    f.w.Show(); f.w.Toggle(); f.w.Hide(); f.escape()
    ok, why = f.blocked()
    check("in combat, Show/Toggle/X/Escape on the roster are refused without a forbidden call (" .. order .. ")", ok and not f.e.OlympusVerifyRosterFrame:IsShown(), why)
    check("in combat, opening the roster says to leave combat", f.printed("Leave combat before opening the promotion roster."))
    f.e.MockCombatEnd()
    check("roster stays closed after combat and state is unchanged (" .. order .. ")", not f.e.OlympusVerifyRosterFrame:IsShown() and promotionState(f) == before)
    f.w.Show(); ok, why = f.blocked()
    check("roster reopens after combat (" .. order .. ")", f.e.OlympusVerifyRosterFrame:IsShown() and ok, why)
  end
  do
    local f = fixture()
    f.launch()
    check("launch window opens with its secure row (" .. order .. ")", f.e.OlympusLaunch229Window:IsShown() and f.q.rowButtons[1]:IsShown())
    local before = promotionState(f)
    f.e.MockCombatStart(lockdownFirst)
    local ok, why = f.blocked()
    check("launch window closes when combat starts with no forbidden call (" .. order .. ")", not f.e.OlympusLaunch229Window:IsShown() and ok, why)
    check("in combat, the launch window cannot be reopened", f.q.Show() == false and not f.e.OlympusLaunch229Window:IsShown())
    f.e.MockCombatEnd()
    check("launch window state unchanged after combat (" .. order .. ")", not f.e.OlympusLaunch229Window:IsShown() and promotionState(f) == before)
    f.q.Show(); ok, why = f.blocked()
    check("launch window reopens after combat (" .. order .. ")", f.e.OlympusLaunch229Window:IsShown() and f.q.rowButtons[1]:IsShown() and ok, why)
  end
end

-- 3. A pending confirmation: combat cancels it exactly as the Cancel button does.
local function confirmState(lockdownFirst, useCancel)
  local f = fixture()
  check("confirmation opens for the sealed intent", f.q.HardwarePromote(GUID) and f.e.OlympusPromotionConfirm:IsShown() and f.q.confirmGuid == GUID)
  if useCancel then f.cancelButton():Click() else f.e.MockCombatStart(lockdownFirst); f.e.MockCombatEnd() end
  return f, promotionState(f)
end
do
  local cancelled, afterCancel = confirmState(false, true)
  check("explicit Cancel hides the confirmation and sends nothing", not cancelled.e.OlympusPromotionConfirm:IsShown() and cancelled.clicks == 0)
  for _, lockdownFirst in ipairs({ false, true }) do
    local order = lockdownFirst and "lockdown first" or "event first"
    local f, afterCombat = confirmState(lockdownFirst, false)
    local ok, why = f.blocked()
    check("pending confirmation is cancelled by combat with no forbidden call (" .. order .. ")", not f.e.OlympusPromotionConfirm:IsShown() and ok, why)
    check("combat cancel leaves exactly the state an explicit Cancel leaves (" .. order .. ")", afterCombat == afterCancel, afterCombat .. " vs " .. afterCancel)
    check("combat cancel reserves no attempt and sends nothing (" .. order .. ")", next(f.e.OlympusVerifyDB.launchPromotionAttempts or {}) == nil and next(f.q.pending) == nil and f.clicks == 0 and f.direct == 0)
    check("no secure button is left armed (" .. order .. ")", not f.armed())
    f.q.promotionConfirmButton:Click()
    check("the hidden confirmation button sends nothing after combat (" .. order .. ")", f.clicks == 0)
    check("after combat the officer reopens the same confirmation", f.q.HardwarePromote(GUID) and f.e.OlympusPromotionConfirm:IsShown())
    f.q.promotionConfirmButton:Click()
    ok, why = f.blocked()
    check("one click after combat sends exactly one promotion command (" .. order .. ")", f.clicks == 1 and f.e.ROSTER[2].rankIndex == 8 and f.direct == 0 and ok, why)
  end
end

-- 4. All three open together: one message, all closed, none reopened by itself.
for _, lockdownFirst in ipairs({ false, true }) do
  local order = lockdownFirst and "lockdown first" or "event first"
  local f = fixture()
  check("all three windows open (" .. order .. ")", openAll(f) and f.e.OlympusVerifyRosterFrame:IsShown() and f.e.OlympusLaunch229Window:IsShown() and f.e.OlympusPromotionConfirm:IsShown())
  local before = promotionState(f)
  f.e.MockCombatStart(lockdownFirst)
  local ok, why = f.blocked()
  check("all three close when combat starts with no forbidden call (" .. order .. ")", allHidden(f) and ok, why)
  check("in combat, no secure button is armed and no command runs", not f.armed() and f.clicks == 0)
  if not lockdownFirst then check("the officer is told why the windows closed", f.printed("Combat started, so the officer windows were closed.")) end
  f.e.MockCombatEnd()
  check("after combat none reopens and promotion state is unchanged (" .. order .. ")", allHidden(f) and promotionState(f) == before)
end

-- 5. A click already made when combat starts: the unknown-outcome rules apply unchanged.
for _, unknown in ipairs({ true, false }) do
  local f = fixture(); f.unknown = unknown
  f.launch()
  f.q.rowButtons[1]:Click()
  local ledger = f.e.OlympusVerifyDB.launchPromotionAttempts
  local record = ledger and ledger[GUID]
  check("one row click sends one command and reserves an unknown attempt", f.clicks == 1 and record and record.state == "unknown" and f.q.pending[GUID] ~= nil)
  local attempt, steps = f.q.pending[GUID], #record.steps
  f.e.MockCombatStart(false)
  local ok, why = f.blocked()
  check("combat closes the launch window around an in-flight attempt with no forbidden call", not f.e.OlympusLaunch229Window:IsShown() and ok, why)
  check("the in-flight attempt is untouched by closing", f.q.pending[GUID] == attempt and ledger[GUID] == record and record.state == "unknown" and #record.steps == steps)
  f.q.rowButtons[1]:Click()
  check("a click in combat sends nothing and reserves nothing", f.clicks == 1 and #record.steps == steps)
  f.e.MockCombatEnd(); f.roster()
  if unknown then
    check("unknown outcome stays held after combat", record.state == "unknown" and f.q.PromotionStatus(GUID, f.q.Current(), 9) == "pending")
    f.q.Show(); f.q.rowButtons[1]:Click()
    check("held unknown attempt is not retried after combat", f.clicks == 1 and #record.steps == steps and f.printed("No repeat was sent"))
  else
    check("a step that landed is confirmed by the next roster after combat, as before", record.state == "confirmed" and record.observedSlot == 8 and f.q.pending[GUID] == nil)
  end
  ok, why = f.blocked()
  check("no forbidden call across the in-flight case (" .. (unknown and "unknown" or "landed") .. ")", ok, why)
end

-- 6. During a batch check: the request already saved stays exactly as saved.
for _, lockdownFirst in ipairs({ false, true }) do
  local order = lockdownFirst and "lockdown first" or "event first"
  local f = fixture()
  f.w.Show()
  local requested = f.w.RequestVerifiedInitiates()
  local control = f.e.OlympusVerifyDB.launchControl
  check("batch check saves one signed request and asks for one reload (" .. order .. ")", requested == true and control.targetGuids[1] == GUID and f.reloads == 1)
  local before = promotionState(f)
  f.e.MockCombatStart(lockdownFirst)
  local ok, why = f.blocked()
  check("combat during a batch check closes the roster with no forbidden call (" .. order .. ")", not f.e.OlympusVerifyRosterFrame:IsShown() and ok, why)
  check("in combat a new batch check is refused and the saved request is unchanged", f.w.RequestVerifiedInitiates() == false and f.e.OlympusVerifyDB.launchControl == control and f.reloads == 1)
  f.e.MockCombatEnd()
  check("after combat the saved batch request is unchanged and the roster reopens (" .. order .. ")", promotionState(f) == before and (f.w.Show() or true) and f.e.OlympusVerifyRosterFrame:IsShown())
end

-- 7. A reload during combat, with an unknown attempt from the previous session.
do
  local first = fixture(); first.unknown = true
  first.launch(); first.q.rowButtons[1]:Click()
  check("previous session left one unknown attempt", first.clicks == 1 and first.e.OlympusVerifyDB.launchPromotionAttempts[GUID].state == "unknown")
  first.e.MockCombatStart(false)
  local db = first.saved()
  local f = fixture({ db = db, slot = 9, combat = true }); f.unknown = true
  local ok, why = f.blocked()
  check("loading the addon during combat makes no forbidden call", ok, why)
  f.w.Show(); f.q.Show()
  check("in combat after reload, no window or secure frame is built", f.e.OlympusVerifyRosterFrame == nil and f.e.OlympusLaunch229Window == nil and f.q.HardwarePromote(GUID) == false and f.e.OlympusPromotionConfirm == nil)
  local before = promotionState(f)
  f.e.MockEvaluateStateDrivers(); f.roster()
  ok, why = f.blocked()
  check("in combat after reload, no forbidden call and the unknown attempt is unchanged", ok and promotionState(f) == before and f.e.OlympusVerifyDB.launchPromotionAttempts[GUID].state == "unknown", why)
  f.e.MockCombatEnd()
  check("after combat the windows open normally", (f.w.Show() or true) and f.q.Show() ~= false and f.e.OlympusVerifyRosterFrame:IsShown() and f.e.OlympusLaunch229Window:IsShown())
  f.launch(); f.q.rowButtons[1]:Click()
  check("the unknown attempt from before the reload is still held and not retried", f.clicks == 0 and f.q.PromotionStatus(GUID, f.q.Current(), 9) == "pending")
  f.e.MockCombatStart(false)
  ok, why = f.blocked()
  check("windows opened after the reload also close at the next combat", not f.e.OlympusVerifyRosterFrame:IsShown() and not f.e.OlympusLaunch229Window:IsShown() and ok, why)
end

-- 8. The mock refuses what the client refuses (negative controls for this suite).
do
  local f = fixture()
  f.w.Show(); f.e.MOCK_LOCKDOWN = true
  f.e.OlympusVerifyRosterFrame:Hide()
  check("mock control: an insecure Hide of the roster in lockdown is refused and recorded", f.e.OlympusVerifyRosterFrame:IsShown() and not f.blocked())
end
do
  -- Without the secure state handler (a client lacking it) and with lockdown first,
  -- the windows cannot be closed until combat ends; the addon must still make no forbidden call.
  local f = fixture(); f.e.RegisterStateDriver = nil
  openAll(f)
  f.e.MockCombatStart(true)
  local ok, why = f.blocked()
  check("no secure handler and lockdown first: windows stay open and no forbidden call is made", not allHidden(f) and ok, why)
  check("no secure handler and lockdown first: the officer is told the game forbids closing until combat ends", f.printed("The game allows closing them only after combat"))
  f.e.MockCombatEnd()
  local g = fixture(); g.e.RegisterStateDriver = nil
  openAll(g); g.e.MockCombatStart(false)
  ok, why = g.blocked()
  check("no secure handler, event first: the event closer alone closes all three", allHidden(g) and ok, why)
end

-- 9. Round 5 item 1 (13 Nov 2026): no secure mechanism and lockdown first. Escape, every Close/Cancel/X button,
-- W.Hide and Toggle are pressed during combat. No insecure Hide may reach a protected window while
-- InCombatLockdown() is true; the officer is told once; each window closes once after combat; nothing else changes.
local function protectedHides(f)
  local mt = getmetatable(f.e.UIParent); local original = mt.Hide
  local record = { calls = 0 }
  mt.Hide = function(self, ...)
    if f.e.InCombatLockdown() and f.e.MOCK_SECURE == 0 and self:IsProtected() then record.calls = record.calls + 1 end
    return original(self, ...)
  end
  return record
end
local function rosterX(f)
  for _, frame in ipairs(f.e.FRAMES) do if frame._parent == f.e.OlympusVerifyRosterFrame and frame._template == "UIPanelCloseButton" then return frame end end
end
local function countPrinted(f, text)
  local n = 0; for _, line in ipairs(f.e.PRINTS) do if line:find(text, 1, true) then n = n + 1 end end; return n
end
local function escapeListed(f, name) local n = 0; for _, v in ipairs(f.e.UISpecialFrames) do if v == name then n = n + 1 end end; return n end
for _, variant in ipairs({ "no RegisterStateDriver", "handler registration fails" }) do
  local f = fixture(); f.e.MOCK_TEMPLATE_CLOSE_BUTTONS = true
  if variant == "no RegisterStateDriver" then f.e.RegisterStateDriver = nil
  else f.e.RegisterStateDriver = function() error("synthetic: secure state driver unavailable") end end
  check("all three windows open without the secure mechanism (" .. variant .. ")", openAll(f) and f.e.OlympusVerifyRosterFrame:IsShown()
    and f.e.OlympusLaunch229Window:IsShown() and f.e.OlympusPromotionConfirm:IsShown())
  check("the launch window and the confirmation carry the template X button (" .. variant .. ")",
    type(f.e.OlympusLaunch229Window.CloseButton) == "table" and type(f.e.OlympusPromotionConfirm.CloseButton) == "table")
  local before = promotionState(f); local hides = protectedHides(f)
  local closes = { roster = 0, launch = 0, confirm = 0 }
  for key, frame in pairs({ roster = f.e.OlympusVerifyRosterFrame, launch = f.e.OlympusLaunch229Window, confirm = f.e.OlympusPromotionConfirm }) do
    frame:HookScript("OnHide", function() closes[key] = closes[key] + 1 end)
  end
  f.e.MockCombatStart(true)
  check("lockdown first: no officer window is listed for Escape during combat (" .. variant .. ")", escapeListed(f, "OlympusVerifyRosterFrame") == 0)
  f.escape(); f.escape()
  f.q.windowClose:Click(); f.e.OlympusLaunch229Window.CloseButton:Click()
  f.cancelButton():Click(); f.e.OlympusPromotionConfirm.CloseButton:Click()
  rosterX(f):Click(); f.w.Hide(); f.w.Toggle()
  f.q.Show(); f.w.Show(); f.e.MockEvaluateStateDrivers()
  local ok, why = f.blocked()
  check("in combat: zero insecure Hide calls on a protected window (" .. variant .. ")", hides.calls == 0 and ok, tostring(hides.calls) .. " " .. why)
  check("in combat: all three windows stay open (" .. variant .. ")", f.e.OlympusVerifyRosterFrame:IsShown() and f.e.OlympusLaunch229Window:IsShown() and f.e.OlympusPromotionConfirm:IsShown())
  check("in combat: the officer is told once that the windows close when combat ends (" .. variant .. ")",
    countPrinted(f, "they close when combat ends") == 1 and countPrinted(f, "The game allows closing them only after combat") == 1)
  check("in combat: no command is sent and promotion state is unchanged (" .. variant .. ")", f.clicks == 0 and f.direct == 0 and not f.armed() and promotionState(f) == before)
  check("no widget method was replaced on the windows (" .. variant .. ")", rawget(f.e.OlympusVerifyRosterFrame, "Hide") == nil
    and rawget(f.e.OlympusLaunch229Window, "Hide") == nil and rawget(f.e.OlympusPromotionConfirm, "Hide") == nil)
  f.e.MockCombatEnd()
  ok, why = f.blocked()
  check("after combat each window closes exactly once (" .. variant .. ")", allHidden(f) and closes.roster == 1 and closes.launch == 1 and closes.confirm == 1 and ok,
    closes.roster .. "/" .. closes.launch .. "/" .. closes.confirm .. " " .. why)
  check("after combat the roster is listed for Escape again, once (" .. variant .. ")", escapeListed(f, "OlympusVerifyRosterFrame") == 1)
  check("after combat the deferred close changed no promotion state (" .. variant .. ")", promotionState(f) == before and f.clicks == 0)
  f.q.Show(); f.w.Show()
  check("after combat the windows reopen normally and stay open (" .. variant .. ")", f.e.OlympusLaunch229Window:IsShown() and f.e.OlympusVerifyRosterFrame:IsShown())
  f.escape()
  check("out of combat Escape closes the roster again (" .. variant .. ")", not f.e.OlympusVerifyRosterFrame:IsShown())
  -- A second fight with the event first: the ordinary closer runs, with no deferred close left over.
  f.e.MockCombatStart(false); ok, why = f.blocked()
  check("next combat, event first: the windows close at its start with no forbidden call (" .. variant .. ")", allHidden(f) and ok, why)
  f.e.MockCombatEnd()
  check("next combat: nothing reopens and no second notice is printed (" .. variant .. ")", allHidden(f) and countPrinted(f, "they close when combat ends") == 1)
end
do
  -- Event first without the secure mechanism: the event closer alone closes them, and Escape during the fight touches nothing.
  local f = fixture(); f.e.RegisterStateDriver = nil
  openAll(f); local hides = protectedHides(f)
  f.e.MockCombatStart(false); f.escape(); f.e.MockCombatEnd()
  local ok, why = f.blocked()
  check("no secure handler, event first: closed at combat start, no insecure Hide in lockdown, no notice", allHidden(f) and hides.calls == 0 and ok
    and countPrinted(f, "they close when combat ends") == 0, why)
end

print(string.format("combat_close280: %d passed, %d failed", passed, failed))
if failed > 0 then error(string.format("%d combat-close check(s) failed", failed)) end

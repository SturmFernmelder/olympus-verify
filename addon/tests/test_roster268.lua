-- Real roster window, core display and launch hardware dispatcher; only the native client APIs are synthetic.
-- Run with the focused Lupa runner as roster268. Never loads Config.lua or client SavedVariables.
local passed, failed = 0, 0
local function check(label, yes)
  if yes then passed = passed + 1; print("PASS " .. label)
  else failed = failed + 1; print("FAIL " .. label) end
end
local function plain(s) return (tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
local function fixture(size)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  local f = { e = e, promotions = {}, attempts = 0, reads = 0, removals = 0, invites = 0, reloads = 0 }
  e.OlympusVerifyConfig = { secret = "synthetic-roster268-only", membershipOnly = true, uiAutoShow = false }
  e.GetGuildInfo = function() return "OLYMPUS PRIME", "High Council", 1, "Native Realm" end
  e.GetRealmName = function() return "Native Realm" end
  e.UnitGUID = function() return "Player-1-0000AAAA" end
  e.GetGuildRosterShowOffline = function() return true end
  e.CanGuildPromote = function() return f.permission ~= false end
  e.InCombatLockdown = function() return f.combat == true end
  e.issecretvalue = function() return false end
  e.GuildControlGetRankName = function(order) return order == 9 and "Member" or order == 7 and "Veteran" or "Other" end
  e.ROSTER = {
    { name = "Officer", guid = "Player-1-0000AAAA", rank = "High Council", rankIndex = 1, level = 60, online = true },
    { name = "Zulu", guid = "Player-1-0000B001", rank = "Initiate", rankIndex = 9, level = 10, away = 3 },
    { name = "Alpha", guid = "Player-1-0000B002", rank = "Initiate", rankIndex = 9, level = 20, online = true },
    { name = "NameOnly", guid = "Player-1-0000B003", rank = "Initiate", rankIndex = 9, level = 1, away = 10 },
    { name = "Pending", guid = "Player-1-0000B004", rank = "Initiate", rankIndex = 9, level = 12, online = true },
    { name = "Unlinked", guid = "Player-1-0000B005", rank = "Initiate", rankIndex = 9, level = 8, away = 1 },
    { name = "Member", guid = "Player-1-0000B006", rank = "Member", rankIndex = 8, level = 40, online = true },
    { name = "Knight", guid = "Player-1-0000B007", rank = "Knight", rankIndex = 7, level = 50, away = 2 },
  }
  for i = #e.ROSTER + 1, size or #e.ROSTER do
    e.ROSTER[i] = { name = string.format("Synthetic%04d", i), guid = string.format("Player-1-%08X", i),
      rank = "Member", rankIndex = 8, level = 60, online = false, away = 2 }
  end
  local native = e.GetGuildRosterInfo
  e.GetGuildRosterInfo = function(i) f.reads = f.reads + 1; return native(i) end
  e.C_GuildInfo.IsGuildRankAssignmentAllowed = function() return true end
  e.C_GuildInfo.SetGuildRankOrder = function(guid, order)
    f.promotions[#f.promotions + 1] = { guid = guid, order = order }
    if f.unknown then error("synthetic unknown native outcome") end
    if not f.noAck then
      for _, row in ipairs(e.ROSTER) do
        if row.guid == guid then row.rankIndex, row.rank = order - 1, e.GuildControlGetRankName(order) end
      end
    end
  end
  e.C_GuildInfo.Invite = function() f.invites = f.invites + 1 end
  e.C_GuildInfo.Uninvite = function() f.removals = f.removals + 1 end
  e.ReloadUI = function() f.reloads = f.reloads + 1 end
  e.OlympusQueue = { version = 1, generatedAt = e.NOW, entries = {} }
  e.OlympusVerifyLists = { version = 1, guild = "OLYMPUS PRIME", realm = "Native Realm",
    verified = { fetchedAt = e.NOW, snapshotAt = e.NOW, members = {} },
    unverified = { fetchedAt = e.NOW, snapshotAt = e.NOW, members = {} } }
  for _, i in ipairs({ 2, 3, 4 }) do
    local row = e.ROSTER[i]
    table.insert(e.OlympusVerifyLists.verified.members, { name = row.name, guid = row.guid, status = "member",
      username = row.name == "Alpha" and "alpha_discord" or string.lower(row.name), displayName = row.name .. " display" })
  end
  for _, i in ipairs({ 5, 6 }) do
    local row = e.ROSTER[i]
    table.insert(e.OlympusVerifyLists.unverified.members, { name = row.name, guid = row.guid, pending = i == 5 })
  end
  local function load(name) setfenv(assert(loadfile("../OlympusVerify/" .. name)), e)("OlympusVerify", {}) end
  load("Libs/OlympusHmac.lua"); load("OlympusVerify.lua"); load("OlympusVerifyGuild.lua"); load("OlympusVerifyRoster.lua")
  local h = e.OlympusHmac
  f.page = { protocol = "officer-operations-v233", status = "ready", fetchedAt = e.NOW, expiresAt = e.NOW + 60,
    snapshotAt = e.NOW - 10, snapshotId = 12, guild = "OLYMPUS PRIME", realm = "Native Realm", canonicalGuild = "OLYMPUS PRIME",
    scopeHash = h.sha256hex("native-scope|1|OLYMPUS PRIME|Native Realm"):sub(1, 16),
    scan = { id = string.rep("a", 32), startedAt = e.NOW, expiresAt = e.NOW + 590 },
    entitlements = { offset = 0, total = 3 }, invites = {}, riskBuffer = {}, held = {},
    promotions = {
      { name = "Zulu", guid = "Player-1-0000B001", currentSlot = 9, targetSlot = 8, targetName = "Member", reason = "verified-initiate" },
      { name = "Alpha", guid = "Player-1-0000B002", currentSlot = 9, targetSlot = 8, targetName = "Member", reason = "verified-initiate" },
      { name = "Knight", guid = "Player-1-0000B007", currentSlot = 7, targetSlot = 6, targetName = "Veteran", reason = "knight-veteran" },
    }, actions = { automatic = false, roleGrants = false, removals = false, requiresNativeRecheck = true } }
  e.OlympusLaunchQueue = { version = 2, controlId = "loaded", scanComplete = true, pages = { f.page } }
  load("OlympusVerifyLaunch229.lua")
  f.q, f.w = e.OlympusLaunch229, e.OlympusVerifyRoster
  local promote = f.q.HardwarePromote
  f.q.HardwarePromote = function(guid) f.attempts = f.attempts + 1; return promote(guid) end
  local event = e.OlympusVerifyFrame:GetScript("OnEvent")
  event(e.OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
  for _, frame in ipairs(e.FRAMES) do
    if frame ~= e.OlympusVerifyFrame and frame._events and frame._events.PLAYER_LOGIN then
      frame:GetScript("OnEvent")(frame, "PLAYER_LOGIN")
    end
  end
  f.emit = function(eventName)
    for _, frame in ipairs(e.FRAMES) do
      if frame._events and frame._events[eventName] and frame:GetScript("OnEvent") then
        frame:GetScript("OnEvent")(frame, eventName)
      end
    end
  end
  f.emit("GUILD_ROSTER_UPDATE")
  f.w.Show()
  f.search = function(text) f.w.search:SetText(text); f.w.search:GetScript("OnTextChanged")(f.w.search) end
  f.names = function()
    local out = {}; for _, m in ipairs(f.w.Visible()) do out[#out + 1] = m.name end
    return table.concat(out, ",")
  end
  f.sort = function(key)
    for _, hdr in ipairs(f.w.headers) do if hdr.col.key == key then hdr:Click(); return end end
    error("missing actual sort heading")
  end
  return f
end

do
  local f = fixture()
  check("opening roster is read-only", #f.promotions == 0 and f.invites == 0 and f.removals == 0 and f.reloads == 0)
  f.search("ALPHA_DISCORD"); check("search uses current Discord username without case sensitivity", f.names() == "Alpha")
  f.search("Zulu display"); check("search includes display name", f.names() == "Zulu")
  f.w.clearButton:Click(); f.w.initiateButton:Click()
  check("Initiates shortcut excludes all other native ranks", f.names() == "Alpha,NameOnly,Pending,Unlinked,Zulu")
  f.w.onlineButton:Click(); check("online filter composes with Initiates", f.names() == "Alpha,Pending")
  f.w.clearButton:Click(); f.w.statusButton:Click()
  check("verified filter is a display classification", f.names() == "Alpha,NameOnly,Zulu")
  f.w.statusButton:Click(); check("not verified filter does not conflate unknown or pending", f.names() == "Unlinked")
  f.w.statusButton:Click(); check("pending filter remains separate", f.names() == "Pending")
  f.w.statusButton:Click(); check("unknown filter remains separate", f.names() == "Knight,Member,Officer")
  f.w.clearButton:Click(); f.w.initiateButton:Click(); f.sort("level")
  check("level sort ascending", f.names() == "NameOnly,Unlinked,Zulu,Pending,Alpha")
  f.sort("level"); check("level sort reverses deterministically", f.names() == "Alpha,Pending,Zulu,Unlinked,NameOnly")
  f.w.clearButton:Click(); f.sort("rank")
  check("rank sort respects native rank slot and deterministic name ties", f.names() == "Officer,Knight,Member,Alpha,NameOnly,Pending,Unlinked,Zulu")
  f.sort("seen"); check("last online sorts online first then offline age", f.names() == "Alpha,Member,Officer,Pending,Unlinked,Knight,Zulu,NameOnly")
  f.sort("name"); check("name sort returns deterministic alphabetic order", f.names() == "Alpha,Knight,Member,NameOnly,Officer,Pending,Unlinked,Zulu")
  f.w.readyButton:Click()
  check("Ready intersects exact signed Initiate recommendations, not all verified labels", f.names() == "Alpha,Zulu")
  check("ready view and filtering have made no promotion", #f.promotions == 0 and f.attempts == 0)
  f.w.nextButton:Click()
  check("next click makes exactly one original-dispatcher GUID promotion in visible sort order", #f.promotions == 1 and f.attempts == 1
    and f.promotions[1].guid == "Player-1-0000B002" and f.promotions[1].order == 9)
  check("refresh removes natively confirmed Member from Ready view", f.names() == "Zulu")
  f.w.rows[1].promote:Click()
  check("row click makes exactly one additional target request", #f.promotions == 2 and f.attempts == 2 and f.promotions[2].guid == "Player-1-0000B001")
  check("completion disables next rather than starting unattended work", not f.w.nextButton:IsEnabled() and f.names() == "")
end

do
  local f = fixture(); f.w.readyButton:Click(); f.search("zulu"); f.w.nextButton:Click()
  check("next respects the current search instead of the first global candidate", #f.promotions == 1 and f.promotions[1].guid == "Player-1-0000B001")
  f = fixture(); f.w.readyButton:Click(); f.sort("name"); f.w.nextButton:Click()
  check("next respects reversed visible name order", #f.promotions == 1 and f.promotions[1].guid == "Player-1-0000B001")
end

for _, kind in ipairs({ "expiry", "scan expiry", "stop", "preview", "scope", "name reuse", "duplicate GUID", "native rank" }) do
  local f = fixture(); f.w.readyButton:Click()
  local old = f.w.rows[1].promote
  if kind == "expiry" then f.e.NOW = f.page.expiresAt
  elseif kind == "scan expiry" then f.e.NOW = f.page.scan.expiresAt
  elseif kind == "stop" then f.e.OlympusVerifyDB.launchControl = { action = "stop", id = "loaded" }
  elseif kind == "preview" then f.e.OlympusVerifyUI = { preview = {} }
  elseif kind == "scope" then f.page.realm = "Wrong Realm"
  elseif kind == "name reuse" then f.e.ROSTER[2].guid, f.e.ROSTER[3].guid = "Player-1-0000C001", "Player-1-0000C002"; f.w.Show()
  elseif kind == "duplicate GUID" then f.e.ROSTER[2].guid = f.e.ROSTER[3].guid; f.w.Show()
  elseif kind == "native rank" then f.e.ROSTER[2].rankIndex, f.e.ROSTER[3].rankIndex = 8, 8; f.w.Show() end
  old:Click()
  check(kind .. " cannot make a recycled row promote", #f.promotions == 0)
end

for _, kind in ipairs({ "permission", "combat", "native roster age", "unknown outcome", "unconfirmed outcome" }) do
  local f = fixture(); f.w.readyButton:Click()
  if kind == "permission" then f.permission = false
  elseif kind == "combat" then f.combat = true
  elseif kind == "native roster age" then f.e.NOW = f.e.NOW + 16
  elseif kind == "unknown outcome" then f.unknown = true
  elseif kind == "unconfirmed outcome" then f.noAck = true end
  f.w.nextButton:Click()
  local expected = (kind == "unknown outcome" or kind == "unconfirmed outcome") and 1 or 0
  check(kind .. " retains original native action discipline", #f.promotions == expected and f.attempts == 1)
  if expected == 1 then
    f.search("Alpha"); f.w.nextButton:Click()
    check(kind .. " has no automatic or same-generation retry", #f.promotions == 1 and f.attempts == 1)
  end
end

do
  local f = fixture(); f.e.OlympusLaunchQueue = nil; f.w.readyButton:Click()
  check("fresh verified display cannot manufacture an absent signed promotion", f.names() == "" and not f.w.nextButton:IsEnabled())
  f = fixture(); f.e.OlympusVerifyLists.verified.snapshotAt, f.e.OlympusVerifyLists.unverified.snapshotAt = f.e.NOW - 3601, f.e.NOW - 3601
  f.w.Show(); for _ = 1, 5 do f.w.statusButton:Click() end
  local dated
  for _, row in ipairs(f.w.rows) do if row:IsShown() and row.member and row.member.name == "Alpha" then dated = row end end
  check("stale verification is a separate dated display, never green", dated and dated.member.status == "stale"
    and plain(dated.cells.status:GetText()) == "Linked (dated)")
  if dated then
    dated:GetScript("OnEnter")(dated)
    check("dated tooltip retains current classifier reason", #(f.e.GameTooltip._lines or {}) > 0)
  end
end

do
  local f = fixture()
  local lists = f.e.OlympusVerifyLists
  lists.version = 2
  lists.unknown = { fetchedAt = f.e.NOW, snapshotAt = f.e.NOW,
    members = { { name = "Alpha", guid = "Player-1-0000B002", reason = "linked_before_cutoff" } } }
  for i, row in ipairs(lists.verified.members) do
    if row.guid == "Player-1-0000B002" then table.remove(lists.verified.members, i); break end
  end
  f.w.Show()
  local historical
  for _, row in ipairs(f.w.rows) do if row.member and row.member.guid == "Player-1-0000B002" then historical = row end end
  check("earlier exact-GUID link remains unknown with its historical label", historical and historical.member.status == "unknown"
    and historical.member.historicalLinked == true and plain(historical.cells.status:GetText()) == historical.member.statusLabel)
  if historical then
    check("historical unknown label is amber and fits its status cell", historical.cells.status:GetText():sub(1, 10) == "|cffe8be65"
      and historical.cells.status:GetStringWidth() <= historical.cells.status:GetWidth())
    historical:GetScript("OnEnter")(historical)
    local fullReason = false
    for _, line in ipairs(f.e.GameTooltip._lines or {}) do if line == historical.member.statusReason then fullReason = true end end
    check("historical tooltip keeps the complete source reason", fullReason and historical.member.statusAt == f.e.NOW
      and historical.member.snapshotAt == f.e.NOW)
  end
end

do
  local f = fixture(1000); f.reads = 0
  f.w.clearButton:Click(); local frames = #f.e.FRAMES
  for _ = 1, 20 do f.search("Synthetic"); f.search(""); f.sort("level"); f.sort("level") end
  check("1000-member search/sort reuses one cached native list", f.reads == 0)
  check("1000-member filter/sort creates no frames or action calls", #f.e.FRAMES == frames and f.attempts == 0 and #f.promotions == 0)
  check("1000-member view retains16 recycled rows", #f.w.rows == 16 and #f.w.Visible() == 1000)
  local inside, separated, aligned, edge = true, true, true, 0
  for _, hdr in ipairs(f.w.headers) do
    inside = inside and hdr._point[4] + hdr:GetWidth() <= f.w.frame:GetWidth() - 18
    separated = separated and hdr._point[4] >= edge
    edge = hdr._point[4] + hdr:GetWidth()
    local cell = f.w.rows[1].cells[hdr.col.key]
    aligned = aligned and cell._point[4] + 18 == hdr._point[4] and cell:GetWidth() == hdr:GetWidth()
  end
  check("all columns including row action remain inside the panel padding", inside)
  check("widened status and adjacent columns have no overlap", separated and aligned)
end

print(string.format("%d passed, %d failed", passed, failed))
if failed > 0 then error("roster268 failed") end

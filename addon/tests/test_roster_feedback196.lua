-- Current keeper core only; synthetic client APIs, no Config.lua or protected action.
local tests, fails = 0, 0
local function check(label, value)
  tests = tests + 1
  if not value then fails = fails + 1 end
  print((value and "PASS " or "FAIL ") .. label)
end

local function fixture(mode, options)
  options = options or {}
  local e = setmetatable({}, { __index = _G })
  e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  e.OlympusVerifyDB = nil
  e.OlympusVerifyConfig = { secret = "roster-feedback-synthetic-only", uiAutoShow = false }
  e.OlympusQueue = { version = 1, generatedAt = e.NOW, entries = {}, unverified = { members = {}, snapshotAt = e.NOW } }
  e.ROSTER = {
    { name = "Fixture Officer", rank = "Officer", rankIndex = 1, level = 60, online = true },
    { name = "Fixture Member", rank = "Member", rankIndex = 3, level = 30, away = 3 },
  }
  local f = { env = e, asks = 0, sets = 0, timers = {}, effects = 0, mail = 0, offline = mode == "on" }
  e.IsInGuild = function() return not options.noGuild end
  e.GetGuildRosterShowOffline = function()
    if mode == "throw" then error("synthetic unreadable getter") end
    if mode == "bad" then return "false" end
    return f.offline
  end
  if mode == "missing" then e.GetGuildRosterShowOffline = false end
  if options.honorDisplay then
    local function displayed()
      local rows = {}
      for _, m in ipairs(e.ROSTER) do if f.offline or m.online then rows[#rows + 1] = m end end
      return rows
    end
    e.GetNumGuildMembers = function() local online = 0; for _, m in ipairs(e.ROSTER) do if m.online then online = online + 1 end end; return #e.ROSTER, online end
    e.GetGuildRosterInfo = function(i)
      local m = displayed()[i]; if not m then return nil end
      return m.name .. "-Forever", m.rank, m.rankIndex, m.level, "", "", m.note or "", m.onote or "", m.online or false, 0, m.class or "WARRIOR", nil, nil, nil, nil, nil, m.guid
    end
  end
  -- A restricted boolean is simulated by the client's own issecretvalue gate.
  e.issecretvalue = function() return mode == "restricted" end
  local event
  e.SetGuildRosterShowOffline = function(value)
    f.sets = f.sets + 1
    assert(value == true)
    if options.setterThrow then error("synthetic setter refused") end
    if not options.stuck then f.offline = true end
    if options.echo and event then event(e.OlympusVerifyFrame, "GUILD_ROSTER_UPDATE") end
  end
  e.C_GuildInfo.GuildRoster = function()
    f.asks = f.asks + 1
    if options.requestThrow then error("synthetic roster request refused") end
    if options.requestEcho and event then event(e.OlympusVerifyFrame, "GUILD_ROSTER_UPDATE") end
  end
  if options.noSetter then e.SetGuildRosterShowOffline = false end
  if options.legacy then e.GuildRoster = e.C_GuildInfo.GuildRoster; e.C_GuildInfo.GuildRoster = nil end
  e.C_Timer.After = function(delay, fn)
    assert(delay > 0 and delay <= 5, "roster timer is bounded to the request window")
    f.timers[#f.timers + 1] = { at = e.NOW + delay, fn = fn }
  end
  if options.noTimer then e.C_Timer.After = false end
  local effect = function() f.effects = f.effects + 1 end
  e.GuildInvite, e.SendWho, e.SendChatMessage = effect, effect, effect
  e.C_GuildInfo.Invite = effect
  e.C_FriendList = { SendWho = effect }
  e.GetInboxNumItems = function() f.mail = f.mail + 1; return 0 end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify", {})
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")), e)("OlympusVerify", {})
  event = e.OlympusVerifyFrame:GetScript("OnEvent")
  event(e.OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
  f.event = function() event(e.OlympusVerifyFrame, "GUILD_ROSTER_UPDATE") end
  f.logout = function() event(e.OlympusVerifyFrame, "PLAYER_LOGOUT") end
  f.candidates = function() return e.OlympusVerifyAPI.Candidates(10) end
  f.ask = function() return e.OlympusVerifyAPI.UnverifiedList(1) end
  f.export = function() return e.OlympusVerifyAPI.ExportRoster() end
  f.advance = function(seconds)
    e.NOW = e.NOW + seconds
    local due, keep = {}, {}
    for _, timer in ipairs(f.timers) do
      if timer.at <= e.NOW then due[#due + 1] = timer else keep[#keep + 1] = timer end
    end
    f.timers = keep
    for _, timer in ipairs(due) do timer.fn() end
  end
  return f
end

for _, mode in ipairs({ "on", "off", "missing", "throw", "bad", "restricted" }) do
  local f = fixture(mode, { stuck = true })
  f.ask(); f.event()
  local permitted = mode == "on" or mode == "missing"
  check(mode .. ": first event exports only established visibility (legacy setter success separately attributed)", permitted and f.env.OlympusVerifyDB.roster.members and #f.env.OlympusVerifyDB.roster.members == 2 or not permitted and f.env.OlympusVerifyDB.roster.members == nil)
  for i = 1, 100 do f.event(); f.ask() end
  check(mode .. ": 200 event/UI refreshes retain one request window", f.asks == 1 and #f.timers == 1)
  check(mode .. ": non-on visibility gets at most one bounded setter attempt", f.sets == ((mode == "off" or mode == "missing") and 1 or 0))
  local exportedAt = f.env.OlympusVerifyDB.roster.exportedAt
  f.advance(4)
  check(mode .. ": trailing request does not run before five seconds", f.asks == 1 and #f.timers == 1)
  f.advance(1)
  check(mode .. ": exactly one coalesced trailing request runs at five seconds", f.asks == 2 and #f.timers == 0)
  check(mode .. ": trailing callback retains the original sixty-second export throttle", f.env.OlympusVerifyDB.roster.exportedAt == exportedAt)
  check(mode .. ": timers never invite, Who, whisper or scan mail", f.effects == 0 and f.mail == 0)
end

do
  local f = fixture("off", { stuck = true, echo = true })
  f.ask(); f.event()
  for i = 1, 200 do f.event(); f.ask() end
  check("synchronous setter echoes cannot recursively request or create timer fan-out", f.asks == 1 and f.sets == 1 and #f.timers == 1)
  f.advance(5)
  check("stuck-false echo settles after a single trailing window", f.asks == 2 and f.sets == 2 and #f.timers == 0)
  check("setter feedback has no protected effect", f.effects == 0)
end

do
  local f = fixture("on")
  f.ask()
  f.advance(1); f.ask()
  for i = 1, 100 do f.ask() end
  check("an export blocked behind a prior UI request remains one trailing obligation", f.asks == 1 and f.env.OlympusVerifyDB.roster.members == nil and #f.timers == 1)
  f.advance(4)
  check("the trailing obligation exports once from the actual core", f.asks == 2 and #f.env.OlympusVerifyDB.roster.members == 2 and #f.timers == 0)
  local first = f.env.OlympusVerifyDB.roster
  f.advance(59); f.event()
  check("automatic export remains throttled strictly below sixty seconds", f.env.OlympusVerifyDB.roster == first)
  f.advance(1); f.event()
  check("automatic export resumes at the original sixty-second boundary", f.env.OlympusVerifyDB.roster ~= first)
end

do
  local f = fixture("off", { stuck = true, echo = true, requestEcho = true })
  f.env.ROSTER = {}
  f.ask()
  for i = 1, 200 do f.event() end
  check("empty-cache setter/request responses cannot create their own feedback requests", f.asks == 1 and f.sets == 1 and #f.timers == 0 and f.env.OlympusVerifyDB.roster.members == nil)
  for i = 1, 200 do f.ask() end
  check("an independent empty-cache UI storm retains only one trailing obligation", f.asks == 1 and #f.timers == 1)
  f.advance(5)
  check("empty-cache trailing request settles without scheduling itself forever", f.asks == 2 and f.sets == 2 and #f.timers == 0 and f.env.OlympusVerifyDB.roster.members == nil and f.effects == 0)
end

do
  local f = fixture("on")
  check("explicit export remains immediate", f.export() == 2)
  f.env.ROSTER[#f.env.ROSTER] = nil
  f.advance(1)
  check("manual force retains immediate short-roster export without another request", f.export() == 1 and #f.env.OlympusVerifyDB.roster.members == 1 and f.asks == 1)
  f.advance(4) -- drain the original five-second request before the separate completeness case
  f.env.ROSTER[2] = { name = "Returned Member", rank = "Member", rankIndex = 3, level = 30 }
  f.advance(56); f.event()
  local previous = f.env.OlympusVerifyDB.roster
  f.env.ROSTER[2] = nil
  f.advance(60); f.event()
  check("automatic short-roster completeness guard keeps the previous export", f.env.OlympusVerifyDB.roster == previous and #previous.members == 2)
  check("manual export and timers never act on a proof or protected API", f.effects == 0)
end

for _, option in ipairs({ "setterThrow", "requestThrow", "noTimer", "legacy" }) do
  local f = fixture("off", { [option] = true, stuck = true })
  local ok = pcall(function() f.event(); for i = 1, 50 do f.ask() end end)
  check(option .. ": unavailable/refused client API does not throw through roster/UI handling", ok)
  check(option .. ": all automatic callers still share one five-second attempt", f.asks == 1 and f.sets == 1 and #f.timers == (option == "noTimer" and 0 or 1))
  f.advance(5)
  if option == "noTimer" then f.ask() end
  check(option .. ": next bounded window remains available", f.asks == 2 and f.effects == 0)
end

do
  local f = fixture("off", { stuck = true })
  f.ask(); f.env.NOW = f.env.NOW - 100
  for i = 1, 100 do f.ask() end
  check("wall-clock rollback cannot open an immediate request window", f.asks == 1 and f.sets == 1 and #f.timers == 1)
  f.advance(4)
  check("rollback retains the full bounded five-second delay", f.asks == 1)
  f.advance(1)
  check("rollback trailing timer makes one request without an indefinite old-clock hold", f.asks == 2 and #f.timers == 0 and f.effects == 0)
end

do
  local f = fixture("off", { noGuild = true })
  for i = 1, 100 do f.event(); f.ask() end
  check("not-in-guild state causes no request, switch or timer", f.asks == 0 and f.sets == 0 and #f.timers == 0 and f.effects == 0)
end

-- These new cases model the real API distinction: total includes offline,
-- while GetGuildRosterInfo enumerates only the displayed roster.
do
  local f = fixture("on", { honorDisplay = true, echo = true, requestEcho = true })
  f.event(); local first = f.env.OlympusVerifyDB.roster
  f.advance(61); f.offline = false; f.event()
  check("manual untick before an event re-establishes offline visibility without an event request", f.sets == 1 and f.asks == 0 and #f.env.OlympusVerifyDB.roster.members == 2 and f.env.OlympusVerifyDB.roster ~= first)
  f.ask(); f.advance(1); f.offline = false
  local before = f.env.OlympusVerifyDB.roster; f.logout()
  check("logout within the shared setter window preserves the complete prior snapshot instead of writing a partial one", f.sets == 1 and f.env.OlympusVerifyDB.roster == before and #before.members == 2)
  local safe = f.candidates()
  check("a known-off cache inside the setter window offers no removal candidates", #safe == 0 and f.effects == 0)
  f.advance(4); f.logout()
  check("logout at the next setter boundary exports the complete displayed roster", f.sets == 2 and f.offline and #f.env.OlympusVerifyDB.roster.members == 2)
end
for _, mode in ipairs({ "off", "missing", "throw", "bad", "restricted" }) do
  local f = fixture(mode, { honorDisplay = true, stuck = true, echo = true })
  f.env.OlympusVerifyDB.roster = { exportedAt = f.env.NOW - 30, members = {{ name = "Previously complete" }}, total = 1 }
  local old = f.env.OlympusVerifyDB.roster
  f.event(); f.export(); f.logout()
  check(mode .. ": refused/unknown or incomplete displayed roster cannot overwrite SavedVariables", f.env.OlympusVerifyDB.roster == old and f.sets == ((mode == "off" or mode == "missing") and 1 or 0))
  local list, candidateCount, candidateError = f.candidates()
  check(mode .. ": unavailable shortlist has an explicit reason instead of an empty-roster claim", candidateCount == 0 and type(candidateError) == "string")
  local unverified, info, err = f.ask()
  check(mode .. ": incomplete visibility offers neither removal shortlist and no protected effect", #list == 0 and #unverified == 0 and type(err) == "string" and f.effects == 0 and f.mail == 0)
end
for _, option in ipairs({ "setterThrow", "noSetter" }) do
  local f = fixture("missing", { [option] = true, honorDisplay = true })
  f.event(); f.export(); f.logout()
  check(option .. ": missing getter never claims establishment after an unavailable/refused setter", f.env.OlympusVerifyDB.roster.members == nil and f.effects == 0)
end
do
  local f = fixture("on", { honorDisplay = true })
  for i = 3, 50 do f.env.ROSTER[i] = { name = "Online " .. i, rank = "Member", rankIndex = 3, level = 60, online = true } end
  f.event(); local old = f.env.OlympusVerifyDB.roster
  local read = f.env.GetGuildRosterInfo
  f.env.GetGuildRosterInfo = function(i) if i > 46 then return nil end; return read(i) end
  f.advance(60); f.event(); f.export(); f.logout()
  check("46of50 displayed cache keeps the previous50-member snapshot even though it exceeds90%", #old.members == 50 and f.env.OlympusVerifyDB.roster == old)
  local list = f.candidates(); check("a truncated cache does not become removal evidence", #list == 0 and f.effects == 0)
end

print(string.format("%d/%d roster feedback checks passed", tests - fails, tests))
if fails > 0 then os.exit(1) end

-- Offline test for OlympusVerifyPreview.lua, against the real OlympusVerify.lua and OlympusVerifyUI.lua on a mocked
-- client. What it pins down:
--   * every preview state draws, with UI.preview naming it and the sample shaped like the real Status();
--   * while previewing, nothing a user can press reaches the real guild: every visible enabled button in the panel and
--     the launcher (clicked twice, so removals arm and confirm), the global OlympusVerify_Flush / _RemoveMember the key
--     binding and launcher call, every API action, and every live /olv subcommand -- no invite, removal, /who, whisper,
--     macro write, chat-log toggle or roster request, and OlympusVerifyDB unchanged down to the last field;
--   * sample names never appear in OlympusVerifyDB;
--   * "off" puts back every captured function by identity and the officer's view, and with preview off the /olv
--     wrapper is a pure pass-through (same output, same arguments) and a flush is real again;
--   * without the API, or without the panel, the file loads and changes nothing.
-- Run from addon/:  lua5.1 test/preview.lua   (Lua 5.1 or LuaJIT 2.1 with bit). Uses a made-up secret.
dofile("tests/wow_mock.lua")

local checks = 0
local function check(cond, label)
  checks = checks + 1
  if not cond then error("preview test FAILED: " .. label, 2) end
end
local function plain(s) return (tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
-- Chat lines printed while fn runs, joined.
local function output(fn, ...)
  local n = #PRINTS
  fn(...)
  local out = {}
  for i = n + 1, #PRINTS do out[#out + 1] = PRINTS[i] end
  return table.concat(out, "\n")
end
-- Deterministic dump of a table (keys sorted by type and value), for deep equality and for searching.
local function dump(v, skipTopKey, seen)
  seen = seen or {}
  local t = type(v)
  if t == "string" then return string.format("%q", v) end
  if t ~= "table" then return tostring(v) end
  if seen[v] then return "<cycle>" end
  seen[v] = true
  local keys = {}
  for k in pairs(v) do if k ~= skipTopKey then keys[#keys + 1] = k end end
  table.sort(keys, function(a, b) return type(a) .. ":" .. tostring(a) < type(b) .. ":" .. tostring(b) end)
  local parts = {}
  for _, k in ipairs(keys) do parts[#parts + 1] = "[" .. dump(k, nil, seen) .. "]=" .. dump(v[k], nil, seen) end
  seen[v] = nil
  return "{" .. table.concat(parts, ",") .. "}"
end

-- ---------------------------------------------------------------- everything that would touch the real guild
local fx = { invites = {}, uninvites = {}, whos = {}, whoToUi = 0, macroWrites = 0, logToggles = 0, rosterAsks = 0, notes = 0 }
C_GuildInfo.Invite = function(n) table.insert(fx.invites, n) end
C_GuildInfo.Uninvite = function(n) table.insert(fx.uninvites, n) end
C_GuildInfo.SetNote = function() fx.notes = fx.notes + 1 end
C_GuildInfo.GuildRoster = function() fx.rosterAsks = fx.rosterAsks + 1 end
C_FriendList = {
  SendWho = function(f) table.insert(fx.whos, f) end,
  SetWhoToUi = function() fx.whoToUi = fx.whoToUi + 1 end,
  GetNumWhoResults = function() return 0, 0 end,
  GetWhoInfo = function() return nil end,
}
local mockCreate, mockEdit = CreateMacro, EditMacro
CreateMacro = function(...) fx.macroWrites = fx.macroWrites + 1; return mockCreate(...) end
EditMacro = function(...) fx.macroWrites = fx.macroWrites + 1; return mockEdit(...) end
local logging = true
LoggingChat = function(v) if v ~= nil then fx.logToggles = fx.logToggles + 1; logging = v end return logging end
local TIMERS = {}
C_Timer.After = function(_, fn) TIMERS[#TIMERS + 1] = fn end
GetGuildInfo = function(unit) if unit == "player" then return "Olympus", "Officer", 1 end end
PlaySound = function() end
local function effects()
  return table.concat({ #fx.invites, #fx.uninvites, #fx.whos, fx.whoToUi, fx.macroWrites, fx.logToggles, fx.rosterAsks,
                        fx.notes, #WHISPERS, #MACROS }, ",")
end

-- ---------------------------------------------------------------- the real addon, loaded as the client loads it
ROSTER = {
  { name = "Fern Melder", rank = "Officer", rankIndex = 1, level = 60, online = true },
  { name = "Real Member", rank = "Member", rankIndex = 3, level = 20, away = 40 },
  { name = "Real Initiate", rank = "Initiate", rankIndex = 4, level = 1, away = 9 },
}
OlympusQueue = { version = 1, generatedAt = NOW - 30, setGuildNote = false, entries = {
  { id = 1, character = "Real Applicant", discordId = "1", note = "", position = 1, lastReason = "" },
  { id = 2, character = "Second Applicant", discordId = "2", note = "", position = 2, lastReason = "" },
  { id = 3, character = "Third Applicant", discordId = "3", note = "", position = 3, lastReason = "" },
} }
OlympusVerifyConfig = { secret = "preview-test-not-a-real-secret", uiAutoShow = false }
OlympusVerifyDB = nil
assert(loadfile("OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
assert(loadfile("OlympusVerify/OlympusVerifyUI.lua"))("OlympusVerify", {})
local frame = OlympusVerifyFrame
local onEvent = frame:GetScript("OnEvent")
onEvent(frame, "ADDON_LOADED", "OlympusVerify")
onEvent(frame, "PLAYER_LOGIN")
local API, UI = OlympusVerifyAPI, OlympusVerifyUI
check(#OlympusVerifyDB.queue == 3, "three real applicants queued from the queue file")

-- A spy in front of the real handler: it IS "the original" as far as the preview file is concerned, and it shows
-- exactly what the wrapper forwards.
local realSlash = SlashCmdList.OLYMPUSVERIFY
local forwarded = {}
local function spy(...) forwarded[#forwarded + 1] = { n = select("#", ...), ... }; return realSlash(...) end
SlashCmdList.OLYMPUSVERIFY = spy

local origAPI, origGlobals = {}, {}
for k, v in pairs(API) do if type(v) == "function" then origAPI[k] = v end end
for k, v in pairs(_G) do if type(k) == "string" and k:find("^OlympusVerify_") and type(v) == "function" then origGlobals[k] = v end end
check(origGlobals.OlympusVerify_Flush and origGlobals.OlympusVerify_RemoveMember, "both action globals exist")
for _, k in ipairs({ "Flush", "Check", "Remove", "ClearQueue", "ExportRoster", "FlushChatLog", "PointKickMacro", "RemoveMember",
                     "ToggleUnverifiedRank", "Status", "PresenceOf", "PresenceCounts", "Candidates", "UnverifiedList",
                     "UnverifiedRanks", "UnverifiedExcluded", "When" }) do
  check(origAPI[k], "API." .. k .. " exists before preview loads")
end
local realStatus = origAPI.Status()

-- What read-only commands print with no preview file at all.
local READONLY = { "status", "help", "queue", "full", "kick", "nonsense" }
local baseline = {}
for _, c in ipairs(READONLY) do baseline[c] = output(realSlash, c) end

-- ---------------------------------------------------------------- loading the preview file
assert(loadfile("OlympusVerify/OlympusVerifyPreview.lua"))("OlympusVerify", {})
local wrapper = SlashCmdList.OLYMPUSVERIFY
check(type(wrapper) == "function" and not rawequal(wrapper, spy), "the /olv wrapper is installed at load")
for k, v in pairs(origAPI) do check(rawequal(API[k], v), "API." .. k .. " untouched by loading") end
for k, v in pairs(origGlobals) do check(rawequal(_G[k], v), k .. " untouched by loading") end
check(UI.preview == nil and OlympusVerifyPreview.State() == nil, "preview starts off")

print("== off: the wrapper is a pure pass-through ==")
for _, c in ipairs(READONLY) do
  local n = #forwarded
  local got = output(wrapper, c)
  check(got == baseline[c], "off: /olv " .. c .. " prints exactly what the original prints")
  check(#forwarded == n + 1 and forwarded[#forwarded][1] == c, "off: /olv " .. c .. " reaches the original unchanged")
end
local editBox = {}
wrapper("status", editBox)
check(forwarded[#forwarded][2] == editBox and forwarded[#forwarded].n == 2, "off: the edit box argument is forwarded too")
check(output(wrapper, "preview off"):find("not on", 1, true), "off: 'preview off' says there is nothing to restore")

-- ---------------------------------------------------------------- previewing
-- The officer's own view before previewing, to be put back afterwards. Chosen so that no preview state leaves the
-- same view behind by coincidence.
UI.showAll, UI.removalView = true, "unverified"
UI.Hide()
local dbBefore = dump(OlympusVerifyDB, "ui")
local queueBefore = dump(OlympusVerifyDB.queue)
local eventsBefore = #OlympusVerifyDB.events
local fxBefore = effects()
local timersBefore = #TIMERS
local realEntry = OlympusVerifyDB.queue[1]

print("== entering ==")
local out = output(wrapper, "preview")
check(UI.preview == "queue" and OlympusVerifyPreview.State() == "queue", "bare '/olv preview' enters the queue state")
check(OlympusVerifyPanel and OlympusVerifyPanel:IsShown(), "entering shows the panel")
check(out:find("Olympus preview", 1, true), "entering says so in chat")
for k, v in pairs(origAPI) do check(not rawequal(API[k], v), "API." .. k .. " is swapped while previewing") end
for k, v in pairs(origGlobals) do check(not rawequal(_G[k], v), k .. " is swapped while previewing") end

-- Any visible, enabled widget text in the panel (buttons draw their label as their own text or a child FontString).
local function visible(w)
  while w do
    if w._shown == false then return false end
    w = w._parent
  end
  return true
end
local function shows(fragment)
  for _, list in ipairs({ FRAMES, FONTS }) do
    for _, w in ipairs(list) do
      if w._text and visible(w) and plain(w._text):find(fragment, 1, true) then return true end
    end
  end
  return false
end
local sampleNames = {}
local function collect()
  local s = API.Status()
  for _, q in ipairs(s.queue) do sampleNames[q.name] = true end
  for _, c in ipairs((API.Candidates(50))) do sampleNames[c.name] = true end
  for _, c in ipairs((API.UnverifiedList(100))) do sampleNames[c.name] = true end
  if s.kickMacroTarget then sampleNames[s.kickMacroTarget] = true end
end
local NILABLE = { armedRemoval = true, kickMacroTarget = true }
local function shapeLikeReal(s, st)
  for k, v in pairs(realStatus) do
    if s[k] == nil then check(NILABLE[k], st .. ": Status()." .. k .. " present")
    else check(type(s[k]) == type(v), st .. ": Status()." .. k .. " is a " .. type(v)) end
  end
end

local states = OlympusVerifyPreview.States()
check(#states == 8, "eight states")
local now = time()
for _, st in ipairs(states) do
  print("== state " .. st .. " ==")
  local chat = output(wrapper, "preview " .. st)
  check(UI.preview == st and OlympusVerifyPreview.State() == st, st .. ": UI.preview names it")
  check(not chat:find("failed to draw", 1, true), st .. ": the panel draws it: " .. chat)
  local ok, err = pcall(UI.Refresh)
  check(ok, st .. ": UI.Refresh succeeds: " .. tostring(err))
  check(UI.showAll == false, st .. ": each state starts on the filtered view")
  local s, pc = API.Status(), API.PresenceCounts()
  shapeLikeReal(s, st)
  check(s.guildCap == realStatus.guildCap and s.version == realStatus.version, st .. ": wears the real cap and version")
  collect()
  if st == "empty" then
    check(pc.filtering and pc.ready == 0 and pc.total == 117 and s.queued == 117, "empty: 0 ready of 117 waiting")
    check(s.rosterTotal < s.guildCap, "empty: the guild is not full")
  elseif st == "queue" then
    check(pc.filtering and pc.ready == 5, "queue: five ready")
    local recent = 0
    for _, q in ipairs(s.queue) do if q.status == "invited" and now - q.invitedAt < 900 then recent = recent + 1 end end
    check(recent == 2, "queue: two recently invited")
  elseif st == "busy" then
    check(not pc.filtering and #s.queue >= 14, "busy: presence off, 14+ rows listed")
    local gquit, longFail = false, false
    for _, q in ipairs(s.queue) do
      if q.status == "queued" and q.lastReason == "ready_after_gquit" then gquit = true end
      if q.status == "failed" and #(q.reply or "") >= 40 then longFail = true end
    end
    check(gquit and longFail, "busy: a left-their-guild row and a failed row with a long reply")
    check(s.alertUntil > now and #s.events >= 20, "busy: NEW marker lit and a long feed")
  elseif st == "full" then
    check(s.rosterTotal == s.guildCap and #API.Candidates(5) == 5, "full: at the cap with five candidates")
    check(s.removeVia == "api" and not s.kickForbidden and s.armedRemoval and s.armedUntil >= now, "full: one removal armed")
    check(shows("Confirm?"), "full: the armed row reads Confirm?")
  elseif st == "unverified" then
    check(UI.removalView == "unverified", "unverified: the unverified view is open")
    local cands, info = API.UnverifiedList(5)
    local ranks, ex = API.UnverifiedRanks(info), API.UnverifiedExcluded()
    local protected, excluded = 0, 0
    for _, br in ipairs(ranks) do
      if br.protected then protected = protected + 1 end
      if ex[br.rank] then excluded = excluded + 1 end
    end
    check(#cands == 5 and #ranks >= 4 and #ranks <= 5 and protected == 1 and excluded == 1, "unverified: 5 rows, 4-5 ranks, one protected, one excluded")
    check(s.kickMacroTarget == cands[1].name and info.offered > 5 and info.nextEligible > now, "unverified: one aimed, offered and next-eligible counts")
    check(shows("Aimed"), "unverified: the aimed row reads Aimed")
  elseif st == "macro" then
    check(s.rosterTotal == s.guildCap and s.kickForbidden and not s.macroForbidden and s.kickMacroTarget, "macro: full, removals refused, macro aimed")
    check(shows("Aimed") and shows("Macro"), "macro: rows read Macro / Aimed")
  elseif st == "blocked" then
    check(s.rosterTotal == s.guildCap and s.kickForbidden and s.macroForbidden, "blocked: full, removals and macros refused")
  elseif st == "problems" then
    check(not s.secret and not s.chatLogging and not s.notes and s.queueFileAt == 0 and #s.events == 0, "problems: every warning")
    check(now - s.rosterAt > 7 * 86400, "problems: week-old roster")
    local _, _, err2 = API.UnverifiedList(5)
    check(type(err2) == "string", "problems: no unverified list")
  end

  -- Press everything a user could press, twice (the second press confirms an armed removal).
  local buttons = {}
  for _, f in ipairs(FRAMES) do
    if f._kind == "Button" and f._scripts and f._scripts.OnClick and visible(f) and f._enabled ~= false then buttons[#buttons + 1] = f end
  end
  check(#buttons > 0, st .. ": there are buttons to press")
  for _ = 1, 2 do for _, b in ipairs(buttons) do b:Click("LeftButton") end end
  OlympusVerifyButton:Click("LeftButton")          -- the launcher, whether or not it is on screen
  OlympusVerify_Flush()                              -- the key binding
  OlympusVerify_RemoveMember("Real Member", "space") -- arm ...
  OlympusVerify_RemoveMember("Real Member", "space") -- ... and confirm
  API.Flush(); API.Flush(nil, { force = true }); API.Flush(realEntry); API.Check()
  API.Remove(realEntry); API.ClearQueue(); API.ExportRoster(); API.FlushChatLog()
  API.PointKickMacro("Real Member", "unverified"); API.RemoveMember("Real Initiate"); API.RemoveMember("Real Initiate")
  API.ToggleUnverifiedRank("Member")
  for _, fn in pairs(API) do if type(fn) == "function" then pcall(fn) end end
  wrapper("show")
  check(effects() == fxBefore, st .. ": no invite, removal, /who, whisper, macro write, log toggle or roster request")
  check(dump(OlympusVerifyDB, "ui") == dbBefore, st .. ": OlympusVerifyDB unchanged")
end

print("== live /olv commands are refused ==")
local BLOCKED = { "flush", "clear", "check", "roster", "aim", "macrotest", "logtest", "flushlog", "unverified",
                  "unverified Member", "unv all", "merge", "full", "kick", "queue", "all", "unaimed", "export",
                  "remove Real Member", "FLUSH", "  flush  ", "nonsense" }
for _, c in ipairs(BLOCKED) do
  local n = #forwarded
  local said = output(wrapper, c)
  check(said:find("is disabled while preview is on", 1, true) and said:find("/olv preview off", 1, true), "'/olv " .. c .. "' is refused")
  check(#forwarded == n, "'/olv " .. c .. "' never reaches the original handler")
end
print("== view, help and status still work ==")
for _, c in ipairs({ "status", "help" }) do
  local n = #forwarded
  local said = output(wrapper, c)
  check(#forwarded == n + 1, "'/olv " .. c .. "' reaches the original")
  check(said:sub(1, #baseline[c]) == baseline[c], "'/olv " .. c .. "' prints the real, read-only answer")
  check(said:find("sample", 1, true), "'/olv " .. c .. "' adds that the panel shows samples")
end
wrapper("hide"); check(not OlympusVerifyPanel:IsShown(), "'/olv hide' hides the panel")
wrapper("show"); check(OlympusVerifyPanel:IsShown(), "'/olv show' shows it")
wrapper(""); check(not OlympusVerifyPanel:IsShown(), "bare '/olv' toggles it")
wrapper("")

print("== preview subcommands ==")
check(output(wrapper, "preview list"):find("unverified", 1, true), "'preview list' names the states")
local stateBefore = OlympusVerifyPreview.State()
local said = output(wrapper, "preview bogus")
check(said:find("no state called", 1, true) and said:find("problems", 1, true), "an unknown state prints the list")
check(OlympusVerifyPreview.State() == stateBefore, "an unknown state changes nothing")
wrapper("preview all"); check(UI.showAll == true, "'preview all' lists every sample row")
wrapper("preview empty"); wrapper("preview all")
check(pcall(UI.Refresh), "the empty state draws with every row listed")
wrapper("preview all")
check(UI.showAll == false and UI.removalView == nil, "the preview's own view differs from the officer's before 'off'")

-- Timers set during the preview: run them, in case anything scheduled a chat-log flush.
for i = timersBefore + 1, #TIMERS do pcall(TIMERS[i]) end
check(effects() == fxBefore, "nothing scheduled during preview acts either")
local dbNow = dump(OlympusVerifyDB, "ui")
check(dbNow == dbBefore, "OlympusVerifyDB deep-equal to before")
check(dump(OlympusVerifyDB.queue) == queueBefore and #OlympusVerifyDB.events == eventsBefore, "queue unchanged, no new events")
local whole = dump(OlympusVerifyDB)
local counted = 0
for name in pairs(sampleNames) do
  counted = counted + 1
  check(not whole:find(name, 1, true), "sample name '" .. name .. "' never lands in OlympusVerifyDB")
end
check(counted > 120, "sample names were collected from every state (" .. counted .. ")")

print("== off ==")
said = output(wrapper, "preview off")
check(said:find("off", 1, true), "'preview off' confirms")
for k, v in pairs(origAPI) do check(rawequal(API[k], v), "API." .. k .. " restored by identity") end
for k, v in pairs(origGlobals) do check(rawequal(_G[k], v), k .. " restored by identity") end
check(rawequal(SlashCmdList.OLYMPUSVERIFY, wrapper), "the wrapper stays installed")
check(UI.preview == nil and OlympusVerifyPreview.State() == nil, "UI.preview cleared")
check(UI.showAll == true and UI.removalView == "unverified", "the officer's own view is back")
check(output(wrapper, "preview off"):find("not on", 1, true), "a second 'off' is harmless")

-- Twice more, starting from a view with the unverified list open, to show capture happens once per preview and
-- restores cleanly every time.
-- (Measured only while preview is on: once it is off, the live panel redraws from live data, and with the unverified
-- view open the real Unverified code legitimately asks the server for a roster.)
UI.showAll, UI.removalView = false, "unverified"
local db2, fx2 = dump(OlympusVerifyDB, "ui"), effects()
wrapper("preview busy"); wrapper("preview unverified"); wrapper("preview full")
for _, b in ipairs(FRAMES) do if b._kind == "Button" and b._scripts and b._scripts.OnClick then b:Click("LeftButton") end end
check(dump(OlympusVerifyDB, "ui") == db2 and effects() == fx2, "second round: nothing touched while on")
wrapper("preview queue"); wrapper("preview all")
check(UI.showAll == true and UI.removalView == nil, "second round: the preview's view differs before 'off'")
wrapper("preview off")
for k, v in pairs(origAPI) do check(rawequal(API[k], v), "second round: API." .. k .. " restored") end
for k, v in pairs(origGlobals) do check(rawequal(_G[k], v), "second round: " .. k .. " restored") end
check(UI.showAll == false and UI.removalView == "unverified" and UI.preview == nil, "second round: view restored")
UI.removalView = nil
local db3, fx3 = dump(OlympusVerifyDB, "ui"), effects()
check(OlympusVerifyPreview.Enter("macro") and UI.preview == "macro", "Enter() from Lua works")
check(OlympusVerifyPreview.Enter("nope") == false and UI.preview == "macro", "Enter() refuses an unknown state")
check(dump(OlympusVerifyDB, "ui") == db3 and effects() == fx3, "third round: nothing touched while on")
check(OlympusVerifyPreview.Exit() and UI.preview == nil, "Exit() from Lua works")
for k, v in pairs(origAPI) do check(rawequal(API[k], v), "third round: API." .. k .. " restored") end

print("== off again: everything is live ==")
for _, c in ipairs(READONLY) do
  check(output(wrapper, c) == output(spy, c), "after off: /olv " .. c .. " identical to the original")
end
check(output(wrapper, "status") == baseline.status, "after off: /olv status as before the preview file loaded")
local invites, whos = #fx.invites, #fx.whos
wrapper("flush")
check(#fx.whos == whos + 1 and fx.whos[#fx.whos]:find("Real Applicant", 1, true), "after off: /olv flush sends a real /who again")
OlympusVerifyDB.presence[OlympusHmac.normalizeCharacter("Second Applicant")] = { state = "free", at = time() }
wrapper("flush")
check(#fx.invites == invites + 1 and fx.invites[#fx.invites] == "Second Applicant", "after off: /olv flush invites for real again")
check(rawequal(OlympusVerify_Flush, origGlobals.OlympusVerify_Flush), "after off: the key binding reaches the real flush")

print("== guards ==")
local function sandbox(hidden, extra)
  local env = setmetatable(extra, { __index = function(_, k) if hidden[k] then return nil end return _G[k] end })
  local chunk = assert(loadfile("OlympusVerify/OlympusVerifyPreview.lua"))
  setfenv(chunk, env)
  return env, pcall(chunk, "OlympusVerify", {})
end
local h = function() end
local env1, ok1 = sandbox({ OlympusVerifyAPI = true, OlympusVerifyUI = true, OlympusVerifyPreview = true }, { SlashCmdList = { OLYMPUSVERIFY = h } })
check(ok1 and rawequal(env1.SlashCmdList.OLYMPUSVERIFY, h) and rawget(env1, "OlympusVerifyPreview") == nil, "without the API: loads and installs nothing")
local lonelyFlush = function() error("an original was called") end
local fakeApi = { Flush = lonelyFlush }
local env2, ok2 = sandbox({ OlympusVerifyUI = true, OlympusVerifyPreview = true }, { SlashCmdList = { OLYMPUSVERIFY = h }, OlympusVerifyAPI = fakeApi })
check(ok2 and not rawequal(env2.SlashCmdList.OLYMPUSVERIFY, h), "without the panel: loads, and /olv preview is routable")
said = output(env2.SlashCmdList.OLYMPUSVERIFY, "preview busy")
check(said:find("not loaded", 1, true) and rawequal(fakeApi.Flush, lonelyFlush) and rawget(env2, "OlympusVerifyPreview").State() == nil,
  "without the panel: /olv preview explains and changes nothing")
local env3, ok3 = sandbox({}, { SlashCmdList = { OLYMPUSVERIFY = h } })
check(ok3 and rawequal(env3.SlashCmdList.OLYMPUSVERIFY, h), "a second copy (duplicated TOC line) loads and installs nothing")

print(string.format("%d checks", checks))
print("preview test: ok")

-- 0.6.12: a queued row from Discord that an officer removes (x, Clear queue, /olv clear) must not come back on the next
-- merge of the loaded queue file, and must not raise a false "new invite" alert. Rows the Worker adds later still arrive.
-- Run from this folder through run_lua_suites.py (LuaJIT via Lupa). Uses a made-up secret; never Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = got == want
  if not ok then fails = fails + 1 end
  print(string.format("%s %-78s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function count(pat, from) local n = 0 for i = (from or 0) + 1, #PRINTS do if PRINTS[i]:find(pat, 1, true) then n = n + 1 end end return n end

local tickers = {}
C_Timer = { NewTicker = function(_, fn) local t = { Cancel = function(self) self.cancelled = true end }; tickers[#tickers + 1] = { t = t, fn = fn }; return t end, After = function() end }
local function tick() for _, x in ipairs(tickers) do if not x.t.cancelled then x.fn() end end end

OlympusQueue = { version = 1, generatedAt = NOW, setGuildNote = false, entries = {
  { id = 4101, character = "Dropped Dora", position = 1 },
  { id = 4102, character = "Kept Kara", position = 2 },
} }
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret", uiAutoShow = false, mergeSeconds = 45 }
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
local frame = OlympusVerifyFrame
local onEvent = frame:GetScript("OnEvent")
onEvent(frame, "ADDON_LOADED", "OlympusVerify"); onEvent(frame, "PLAYER_LOGIN")
local API = OlympusVerifyAPI
local function row(n) for _, q in ipairs(OlympusVerifyDB.queue) do if q.name == n then return q end end end

print("\n== removing a Worker row keeps it removed ==")
check("both Worker rows are queued at login", row("Dropped Dora") ~= nil and row("Kept Kara") ~= nil, true)
API.Remove(row("Dropped Dora"))
local p0 = #PRINTS
tick(); tick()
check("the removed row does not come back on the merge ticker", row("Dropped Dora"), nil)
check("  and no 'new invite' alert is printed for it", count("new invite", p0), 0)
check("the other Worker row is untouched", row("Kept Kara") ~= nil, true)

print("\n== Clear queue and /olv clear keep their rows removed too ==")
API.ClearQueue()
tick()
check("Clear queue: nothing returns on the next merge", #OlympusVerifyDB.queue, 0)
OlympusQueue.entries[#OlympusQueue.entries + 1] = { id = 4103, character = "New Nell", position = 3 }
local p1 = #PRINTS
tick()
check("a row the Worker adds afterwards still arrives", row("New Nell") ~= nil, true)
check("  and is announced once", count("new invite", p1), 1)
SlashCmdList.OLYMPUSVERIFY("clear")
tick()
check("/olv clear: the new row stays removed as well", row("New Nell"), nil)

print(string.format("\n%d/%d queue-dismiss checks passed", tests - fails, tests))
if fails > 0 then error(fails .. " queue-dismiss checks failed") end

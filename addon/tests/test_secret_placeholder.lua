-- 0.6.12: a Config.lua copied from Config.example.lua without replacing the public placeholder secret must accept no
-- code made from that placeholder, and must say once per session (not on every whisper) that codes cannot be checked.
-- Run from this folder through run_lua_suites.py (LuaJIT via Lupa). Uses only the public placeholder; never Config.lua.
dofile("wow_mock.lua")
local fails, tests = 0, 0
local function check(label, got, want)
  tests = tests + 1
  local ok = got == want
  if not ok then fails = fails + 1 end
  print(string.format("%s %-78s %s", ok and "ok  " or "FAIL", label, ok and "" or ("got " .. tostring(got) .. " want " .. tostring(want))))
end
local function count(pat, from) local n = 0 for i = (from or 0) + 1, #PRINTS do if PRINTS[i]:find(pat, 1, true) then n = n + 1 end end return n end

local PLACEHOLDER = "REPLACE_WITH_THE_SHARED_SECRET"
OlympusQueue = { version = 1, generatedAt = NOW, setGuildNote = false, entries = {} }
OlympusVerifyConfig = { secret = PLACEHOLDER, uiAutoShow = false }
OlympusVerifyDB = nil
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
local frame = OlympusVerifyFrame
local onEvent = frame:GetScript("OnEvent")
onEvent(frame, "ADDON_LOADED", "OlympusVerify"); onEvent(frame, "PLAYER_LOGIN")
local L = OlympusHmac
local function queued(n) for _, q in ipairs(OlympusVerifyDB.queue or {}) do if q.name == n then return true end end return false end

print("\n== the example's placeholder secret is refused ==")
local p0, w0 = #PRINTS, #WHISPERS
local forged = L.codeFor(PLACEHOLDER, "Forged Fran", L.utcDay(NOW))
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. forged, "Forged Fran")
check("a code made from the public placeholder queues nobody", queued("Forged Fran"), false)
check("  and is not answered as confirmed", #WHISPERS - w0, 0)
onEvent(frame, "CHAT_MSG_WHISPER", "!verify " .. L.ticketFor(PLACEHOLDER, "K7Q", L.utcDay(NOW)), "Ticket Tom")
onEvent(frame, "CHAT_MSG_WHISPER", "hello, are you recruiting?", "Random Rae")
check("a forged request code queues nobody either", queued("Ticket Tom"), false)
check("the missing-secret warning is printed once, not per whisper", count("codes cannot be checked", p0), 1)

print(string.format("\n%d/%d placeholder-secret checks passed", tests - fails, tests))
if fails > 0 then error(fails .. " placeholder-secret checks failed") end

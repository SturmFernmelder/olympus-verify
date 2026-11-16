-- .227 per-whisper native membership proof. Independent vectors below were computed with Python stdlib HMAC.
local passed, failed = 0, 0
local function check(label, value)
  if value then passed = passed + 1; print("PASS " .. label) else failed = failed + 1; print("FAIL " .. label) end
end
local function fixture(legacy)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  e.NOW = 1793720000
  e.date = function(format, at) return os.date(format, at) end -- native date supports !UTC directly
  e.OlympusVerifyConfig = { secret = "synthetic-per-whisper-only", membershipOnly = not legacy, uiAutoShow = false, checkBeforeInvite = false }
  e.OlympusVerifyDB = nil
  e.OlympusQueue = { version = 1, entries = {}, generatedAt = e.NOW }
  e.ROSTER = {
    { name = "Fern Melder", rank = "High Council", rankIndex = 1, level = 1, online = true, guid = e.PLAYER_GUID },
    { name = "Fresh Member", rank = "Member", rankIndex = 7, level = 1, online = true, guid = "Player-1-ABCDEF12" },
  }
  local f = { e = e, member = true, guild = "Olympus", realm = "Native Live Realm", inGuild = true, membershipCalls = 0, actions = 0 }
  e.GetGuildInfo = function(unit) assert(unit == "player"); return f.guild end
  e.GetRealmName = function() return f.realm end
  e.IsInGuild = function() return f.inGuild end
  e.C_GuildInfo.MemberExistsByName = function()
    f.membershipCalls = f.membershipCalls + 1
    if f.change then f.change(f.membershipCalls) end
    return f.member
  end
  e.C_GuildInfo.Invite = function() f.actions = f.actions + 1 end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")), e)("OlympusVerify")
  local handler, frame = e.OlympusVerifyFrame:GetScript("OnEvent"), e.OlympusVerifyFrame
  handler(frame, "ADDON_LOADED", "OlympusVerify")
  f.whisper = function(sender, guid, code)
    sender, guid = sender or "Fresh Member-Realm", guid or "Player-1-ABCDEF12"
    code = code or e.OlympusHmac.codeFor(e.OlympusVerifyConfig.secret, sender, e.OlympusHmac.utcDay(e.NOW))
    handler(frame, "CHAT_MSG_WHISPER", "!verify " .. code, sender, nil, nil, nil, nil, nil, nil, nil, nil, nil, guid)
    return e.OlympusVerifyDB.events[#e.OlympusVerifyDB.events], code
  end
  f.notes = function()
    local out = {}; for _, row in ipairs(e.WHISPERS) do if row.text:find("^Olympus: member ") then out[#out + 1] = row end end; return out
  end
  return f
end

do
  local f = fixture()
  local event, code = f.whisper()
  local p = event.nativeMembership
  check("valid current native member has an affirmative proof", p and p.member == true)
  check("proof object uses the exact v1 shape", p and p.version == 1 and p.observedAt == 1793720000 and p.scopeHash and p.mac)
  local fields = 0; for _ in pairs(p or {}) do fields = fields + 1 end
  check("proof stores no extra authority or identity fields", fields == 5)
  check("actual code agrees with independent Python vector", code == "8ALCWJ")
  check("native scope hash agrees with independent Python vector", p and p.scopeHash == "a32080270acf8d2f")
  check("membership MAC agrees with independent Python HMAC vector", p and p.mac == "a386604f5049ee4c67b2518c302c1b48")
  local note = f.notes()[1]
  local expected = "Olympus: member Fresh Member-Realm Player-1-ABCDEF12 8ALCWJ 1 1793720000 a32080270acf8d2f (ref OLVm-a386604f5049ee4c67b2518c302c1b48)"
  check("self-note serializes the exact same native proof", note and note.text == expected and note.to == "Fern Melder")
  check("native proof self-note stays inside chat byte limit", note and #note.text <= 255)
  local hasGuid = false; for _, row in ipairs(f.e.WHISPERS) do if row.text:find("ref OLVg-", 1, true) then hasGuid = true end end
  check("the legacy native GUID note is retained", hasGuid)
  check("current membership proof never queues an invite or performs game action", #f.e.OlympusVerifyDB.queue == 0 and f.actions == 0)
  local first = p
  f.e.NOW = f.e.NOW + 1
  local again = f.whisper()
  check("a new whisper samples a new timestamp and MAC", again.nativeMembership and again.nativeMembership.observedAt == 1793720001 and again.nativeMembership.mac ~= first.mac)
  check("new capture cannot mutate prior saved proof", first.observedAt == 1793720000 and first.mac == "a386604f5049ee4c67b2518c302c1b48")
end

do
  local f = fixture()
  f.member = false
  f.e.OlympusVerifyDB.roster = { exportedAt = f.e.NOW - 500, members = { { name = "Fresh Member", guid = "Player-1-ABCDEF12" } }, nativeGuild = "Olympus", nativeRealm = "Native Live Realm" }
  local event = f.whisper()
  check("an older positive roster cannot override the current native false", event.nativeMembership and event.nativeMembership.member == false and event.inGuild == false)
  local p = event.nativeMembership
  local payload = table.concat({ "membership", "1", "fresh member", "Player-1-ABCDEF12", "8ALCWJ", "0", "1793720000", p.scopeHash }, "|")
  check("native false is a real distinct HMAC proof", p.mac == f.e.OlympusHmac.hmacSha256hex(f.e.OlympusVerifyConfig.secret, payload):sub(1, 32))
  check("false proof note carries zero instead of a positive assertion", f.notes()[1] and f.notes()[1].text:find(" 8ALCWJ 0 ", 1, true) ~= nil)
  local reply; for _, row in ipairs(f.e.WHISPERS) do if row.to == "Fresh Member-Realm" then reply = row.text end end
  check("native false explains own-roster limit and sister QR fallback", reply and reply:find("this officer's current guild roster", 1, true) and reply:find("QR verification", 1, true))
end

for _, bad in ipairs({ "missing", "throw", "nil", "number", "string", "secret" }) do
  local f, marker = fixture(), {}
  if bad == "missing" then f.e.C_GuildInfo.MemberExistsByName = false
  elseif bad == "throw" then f.e.C_GuildInfo.MemberExistsByName = function() error("synthetic unavailable native membership") end
  elseif bad == "nil" then f.member = nil
  elseif bad == "number" then f.member = 0
  elseif bad == "string" then f.member = "false"
  else f.member = marker; f.e.issecretvalue = function(v) return v == marker end end
  local event = f.whisper()
  check(bad .. " current membership produces no signed claim", event.nativeMembership == nil and #f.notes() == 0)
  check(bad .. " current membership is unknown, not false", event.inGuild == nil)
end

for _, missing in ipairs({ "GetGuildInfo", "GetRealmName" }) do
  local f = fixture()
  f.e[missing] = false
  local event = f.whisper()
  check("missing " .. missing .. " cannot produce affirmative native proof", event.nativeMembership == nil and #f.notes() == 0)
end

for _, change in ipairs({ "guild", "realm", "membership", "collector_guild" }) do
  local f = fixture()
  f.change = function(n)
    if n == 3 then
      if change == "guild" then f.guild = "Olympus II"
      elseif change == "realm" then f.realm = "Different Realm"
      elseif change == "membership" then f.member = false
      else f.inGuild = false end
    end
  end
  local event = f.whisper()
  check("mid-proof " .. change .. " change holds rather than signing stale evidence", event.nativeMembership == nil and #f.notes() == 0)
end

do
  local f = fixture()
  local event = f.whisper(nil, "not-a-native-guid")
  check("missing native whisper GUID produces no proof", event.guid == nil and event.nativeMembership == nil and #f.notes() == 0)
end
do
  local f = fixture()
  local event = f.whisper(nil, nil, "AAAAAA")
  check("invalid verification code produces no native membership proof", event.ok == false and event.nativeMembership == nil and #f.notes() == 0)
end
do
  local f = fixture(true)
  f.member = false
  local event = f.whisper()
  check("legacy mode retains its old event shape and never emits OLVm", event.nativeMembership == nil and #f.notes() == 0)
  check("legacy mode retains its original explicit invite workflow", #f.e.OlympusVerifyDB.queue == 1)
end
do
  local f, reloads = fixture(), 0
  f.e.ReloadUI = function() reloads = reloads + 1 end
  f.whisper()
  check("strict local capture visibly requires the supported exchange", f.e.OlympusVerifyAPI.Status().verificationExchange == "sync-needed")
  local notice = f.e.OlympusVerifyDB.verificationExchange
  local fields = 0; for _ in pairs(notice) do fields = fields + 1 end
  check("pending exchange stores only phase and time, no code or identity", fields == 2 and notice.capturedAt == f.e.NOW)
  check("receiving a verification never reloads unattended", reloads == 0)
  f.e.OlympusVerifyAPI.Sync()
  check("explicit Sync makes exactly one reload request", reloads == 1)
  check("a reload request is not claimed as a Worker acknowledgement", f.e.OlympusVerifyAPI.Status().verificationExchange == "sync-requested")
  check("Sync retains the original captured native proof", f.e.OlympusVerifyDB.events[#f.e.OlympusVerifyDB.events].nativeMembership.observedAt == f.e.NOW)
end
do
  local f = fixture()
  local first, code = f.whisper()
  local firstAt, firstMAC = first.nativeMembership.observedAt, first.nativeMembership.mac
  local before, calls = #f.e.OlympusVerifyDB.events, f.membershipCalls
  f.e.NOW = f.e.NOW + 601
  local fresh = f.whisper(nil, nil, code)
  check("busy601 same genuine code/GUID whisper appends a new original event", #f.e.OlympusVerifyDB.events == before + 1 and fresh.code == code and fresh.guid == first.guid)
  check("busy601 fresh whisper reruns native membership API", f.membershipCalls > calls)
  check("busy601 new proof has current observation and distinct MAC", fresh.nativeMembership and fresh.nativeMembership.observedAt == firstAt + 601 and fresh.nativeMembership.mac ~= firstMAC)
  check("busy601 old proof is never retimestamped or mutated", first.nativeMembership.observedAt == firstAt and first.nativeMembership.mac == firstMAC)
end
do
  local f = fixture()
  local originalAt = f.e.NOW
  local captured
  f.e.OlympusVerifyLive242 = {
    NewVerificationObservation = function() return {id=string.rep("a",32),observedAt=originalAt} end,
    CaptureVerification = function(_,_,_,_,proof,_,observation) captured={proof=proof,observation=observation} end,
    VerificationReply = function(_,_,text) return text end,
  }
  f.change = function(n) if n == 1 then f.e.NOW = f.e.NOW + 1 end end
  local event = f.whisper()
  check("whisper crossing a second boundary keeps one original event/proof timestamp", event.ts == originalAt and event.nativeMembership and event.nativeMembership.observedAt == originalAt)
  check("captured intake shares the exact signed event time", captured and captured.proof.observedAt == captured.observation.observedAt)
end
do
  local f = fixture()
  local originalAt = f.e.NOW
  f.e.OlympusVerifyLive242 = {NewVerificationObservation=function() return {id=string.rep("b",32),observedAt=originalAt} end,CaptureVerification=function() end,VerificationReply=function(_,_,text) return text end}
  f.change = function(n) if n == 1 then f.e.NOW = f.e.NOW + 6 end end
  local event = f.whisper()
  check("an old duplicate event cannot backdate a new native membership proof", event.ts == originalAt and event.nativeMembership == nil)
end
print(string.format("%d passed, %d failed", passed, failed))
if failed > 0 then os.exit(1) end

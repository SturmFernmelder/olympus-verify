-- Status snapshot regressions against the real addon and real imported queue shape.
-- Synthetic client/data only; no Config.lua, live queue export, or game writes.
dofile("wow_mock.lua")
local failures, total = 0, 0
local function check(label, value, expected)
  total = total + 1
  local ok = value == expected
  if not ok then failures = failures + 1 end
  print(string.format("%s %s%s", ok and "ok  " or "FAIL", label,
    ok and "" or (" (got " .. tostring(value) .. ", expected " .. tostring(expected) .. ")")))
end
OlympusVerifyConfig = { secret = "harness-only-not-a-real-secret", checkBeforeInvite = false, uiAutoShow = false }
OlympusVerifyDB = nil
OlympusQueue = { version = 1, generatedAt = NOW, entries = {
  { id = 1, character = "First Applicant", discordId = "1001", note = "" },
  { id = 2, character = "Second Applicant", discordId = "1002", note = "" },
  { id = 3, character = "Third Applicant", discordId = "1003", note = "" },
} }
assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua"))("OlympusVerify", {})
assert(loadfile("../OlympusVerify/OlympusVerify.lua"))("OlympusVerify", {})
local frame = OlympusVerifyFrame
frame:GetScript("OnEvent")(frame, "ADDON_LOADED", "OlympusVerify")
frame:GetScript("OnEvent")(frame, "PLAYER_LOGIN")
local API, queue = OlympusVerifyAPI, OlympusVerifyDB.queue
check("worker entries become three real queue records", #queue, 3)
check("imported queue timestamp is ts", queue[1].ts, NOW)
check("imported queue has no at field", queue[1].at, nil)
check("fresh real queue exposes a nonzero oldest timestamp", API.Status().oldestQueuedAt, NOW)

queue[1].ts, queue[2].ts, queue[3].ts = NOW - 120, NOW - 7200, NOW - 3600
queue[1].at, queue[2].at = NOW - 86400, NOW - 10 -- unrelated legacy-looking fields must not drive waiting age
queue[4] = { name = "Already Invited", status = "invited", ts = NOW - 99999 }
queue[5] = { name = "Already Joined", status = "joined" }
queue[6] = { name = "Failed Record", status = "failed", ts = "not a timestamp" }
local snapshot = API.Status()
check("oldest waiting age uses minimum queued ts regardless of order or at", snapshot.oldestQueuedAt, NOW - 7200)
check("nonqueued records do not enter queued count", snapshot.queued, 3)
check("status exposes original queue identity", snapshot.queue, queue)
check("status does not reorder records or change their timestamps", queue[1].name == "First Applicant" and queue[2].name == "Second Applicant" and queue[2].ts == NOW - 7200, true)
queue[2].status = "invited"
check("inviting oldest entry advances waiting age to next queued record", API.Status().oldestQueuedAt, NOW - 3600)
queue[1].status, queue[3].status = "joined", "failed"
check("no queued records reports unknown age as zero", API.Status().oldestQueuedAt, 0)

-- Preserve the existing contract: a queued record with unknown time makes age
-- unknown, rather than presenting a younger known record as the oldest.
OlympusVerifyDB.queue = { { name = "Unknown Time", status = "queued" } }
check("missing queued timestamp reports zero", API.Status().oldestQueuedAt, 0)
OlympusVerifyDB.queue[2] = { name = "Known Time", status = "queued", ts = NOW - 30 }
check("mixed unknown and known queue times preserve unknown-age sentinel", API.Status().oldestQueuedAt, 0)
OlympusVerifyDB.queue = {}
check("empty queue reports zero", API.Status().oldestQueuedAt, 0)
local before = #PRINTS
SlashCmdList.OLYMPUSVERIFY("help")
local found = false
for i = before + 1, #PRINTS do if PRINTS[i]:find("preview", 1, true) then found = true end end
check("help makes preview discoverable", found, true)
print(string.format("\n%d/%d passed", total - failures, total))
os.exit(failures == 0 and 0 or 1)

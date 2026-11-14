-- Focused .227 offline protocol/observation checks, not a claim of native trade/mail acceptance.
bit = require("bit")
local total, failed = 0, 0
local function check(label, actual, expected)
  total = total + 1
  if actual == expected then print("PASS " .. label) else failed = failed + 1; print("FAIL " .. label .. " actual=" .. tostring(actual) .. " expected=" .. tostring(expected)) end
end
local NOW, wallet, incoming, outgoing = 1793720000, 100000, 0, 0
local collector, trader, guid = "Fern Melder", "Trade Donor-Realm", "Player-1-0000ABCD"
local inbox, timers, notes, hooks, frames, moneyCalls = {}, {}, {}, {}, {}, 0
time = function() return NOW end
GetTime = function() return NOW - 1793720000 end
GetMoney = function() return wallet end
GetGuildInfo = function() return "OLYMPUS PRIME", "Officer", 2 end
GetRealmName = function() return "Realm" end
GetTargetTradeMoney = function() return incoming end
GetPlayerTradeMoney = function() return outgoing end
GetUnitName = function() return trader end
UnitName = GetUnitName
UnitGUID = function(unit) return unit == "player" and guid or nil end
GetInboxNumItems = function() return #inbox, #inbox end
GetInboxHeaderInfo = function(i)
  local r = inbox[i]
  if r then return nil, nil, r.sender, r.subject or "TITHE-ABCD-EFGH", r.money, r.cod or 0, 30, r.items or 0, false, false end
end
TakeInboxMoney = function(i) moneyCalls = moneyCalls + 1; if hooks.TakeInboxMoney then hooks.TakeInboxMoney(i) end end
AutoLootMailItem = function(i) if hooks.AutoLootMailItem then hooks.AutoLootMailItem(i) end end
TakeInboxItem = function(i) if hooks.TakeInboxItem then hooks.TakeInboxItem(i) end end
ReturnInboxItem = function(i) if hooks.ReturnInboxItem then hooks.ReturnInboxItem(i) end end
hooksecurefunc = function(key, fn) hooks[key] = fn end
C_Timer = { After = function(delay, fn) timers[#timers + 1] = { at = NOW + delay, fn = fn } end }
DEFAULT_CHAT_FRAME = { AddMessage = function() end }
ERR_TRADE_COMPLETE = "Trade complete."
SlashCmdList = {}
CreateFrame = function(_, name)
  local f = { RegisterEvent = function() end, SetScript = function(self, script, fn)
    if script == "OnEvent" then self.onEvent = fn elseif script == "OnUpdate" then self.onUpdate = fn end
  end }
  frames[name] = f
  return f
end
OlympusVerifyConfig = { secret = "synthetic-treasury-test-key-do-not-use" }
OlympusVerifyDB = { boots = 1 }
OlympusVerifyAPI = { TreasuryTransport = {
  Name = function() return collector end, Guid = function() return guid end,
  Note = function(text) notes[#notes + 1] = text; return true end,
} }
dofile("../OlympusVerify/Libs/OlympusHmac.lua")
assert(loadfile("../OlympusVerify/OlympusVerifyLocalPrivacy280.lua"))("OlympusVerify")
assert(loadfile("../OlympusVerify/OlympusVerifyTreasury.lua"))("OlympusVerify")
local frame = frames.OlympusVerifyTreasuryFrame
local function event(key, ...) frame.onEvent(frame, key, ...) end
local function receipts() return OlympusVerifyDB.treasury.receipts end
local function observations() return OlympusVerifyDB.treasury.observations end
local function later(seconds)
  NOW = NOW + seconds
  local old = timers; timers = {}
  for _, item in ipairs(old) do if item.at <= NOW then item.fn() else timers[#timers + 1] = item end end
end
local function startTrade(receive, paid, who)
  incoming, outgoing, trader = receive, paid or 0, who or "Trade Donor-Realm"
  event("TRADE_SHOW"); OlympusVerifyTreasury.SetTradeReference280("TITHE-ABCD-EFGH"); event("TRADE_ACCEPT_UPDATE", 1, 1)
end
local function finishTrade()
  event("TRADE_CLOSED"); wallet = wallet + incoming - outgoing
  event("PLAYER_MONEY"); event("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
end
event("ADDON_LOADED", "OlympusVerify"); event("PLAYER_LOGIN")
check("only the collector is enabled", OlympusVerifyTreasury.Status().enabled, true)
check("mail observation hook is registered", OlympusVerifyTreasury.Status().mailHooked, true)
check("boot takes no gold or mail", moneyCalls, 0)
check("normalization preserves a meaningful realm", OlympusVerifyTreasury.Normalize("  FERN   Melder-Realm  "), "fern melder-realm")

startTrade(10000)
check("both accepted trade is not a receipt", #receipts(), 0)
event("TRADE_REQUEST_CANCEL"); event("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
check("cancelled trade is never counted", #receipts(), 0)
check("cancelled trade is disclosed without correspondence", OlympusVerifyDB.treasury.titheObservationCounts280.trade_cancelled, 1)
check("no new named observation was stored",#observations(),0)

startTrade(10000); finishTrade()
check("completed incoming trade is counted", #receipts(), 1)
check("exact full sender and realm retained", receipts()[1].sender, "Trade Donor-Realm")
check("exact recipient retained", receipts()[1].recipient, "Fern Melder")
check("receipt is unclassified, not a tithe", receipts()[1].classification, "unclassified_receipt")
check("receipt is locally confirmed only", receipts()[1].status, "confirmed_local")
check("trade incoming copper exact", receipts()[1].incomingCopper, 10000)
check("receipt has 32-hex MAC", #receipts()[1].mac, 32)
local r = receipts()[1]
local fields={r.id,string.format("%.0f",r.ts),r.kind,"10000","trade donor-realm",r.senderGuid or "","fern melder",r.collectorGuid,r.guild,r.realm,r.reference,r.clientVersion,r.evidence,r.recipient}
local encoded={"tithe-gold-v2|"};for _,value in ipairs(fields)do encoded[#encoded+1]=tostring(#value)..":"..value end
local signed=table.concat(encoded)
check("MAC binds full names, amounts, kind, id and timestamp", r.mac, OlympusHmac.hmacSha256hex(OlympusVerifyConfig.secret, signed):sub(1, 32))
check("new financial evidence emits no legacy self-whisper",#notes,0)
check("v2 original body binds explicit reference",OlympusVerifyTreasury.IntakeBody280(r).donation.reference,"TITHE-ABCD-EFGH")
event("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE); event("PLAYER_MONEY"); event("TRADE_CLOSED")
check("repeated completion events do not duplicate", #receipts(), 1)

startTrade(10000); finishTrade()
check("a second legitimate same-amount trade is distinct", #receipts(), 2)
check("same-second distinct trades have distinct ids", receipts()[1].id ~= receipts()[2].id, true)
startTrade(20000, 5000); finishTrade()
check("mixed outgoing trade is excluded from minimal gold evidence",#receipts(),2)
check("mixed trade stores no raw named observation",#observations(),0)
check("mixed trade creates no financial self-whisper",#notes,0)

startTrade(10000)
event("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE); event("TRADE_CLOSED"); later(4)
check("completion without actual money delta is not counted", #receipts(), 2)
check("unconfirmed money has count-only disclosure",(OlympusVerifyDB.treasury.titheObservationCounts280.trade_balance_or_identity_unconfirmed or 0)>0,true)
startTrade(10000, 0, "Truncated")
finishTrade(); later(4)
check("truncated Forever first name is not misattributed", #receipts(), 2)

collector = "Other Character"; startTrade(10000); finishTrade()
check("another local character is not captured", #receipts(), 2)
collector = "Fern Melder"

inbox = { { sender = "Mail Donor-Realm", money = 10000 } }
event("MAIL_SHOW"); event("MAIL_INBOX_UPDATE"); event("MAIL_INBOX_UPDATE")
check("merely seeing gold in mail never counts a receipt", #receipts(), 2)
TakeInboxMoney(1); TakeInboxMoney(1)
check("take-money action alone is not proof", #receipts(), 2)
inbox[1].money = 0; event("MAIL_INBOX_UPDATE")
check("inbox depletion without money does not count", #receipts(), 2)
wallet = wallet + 10000; event("PLAYER_MONEY")
check("actual collection with matching balance is recorded", #receipts(), 3)
check("mail kind and paid zero are explicit", receipts()[3].kind .. ":" .. receipts()[3].outgoingCopper, "mail:0")
event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY")
check("mail refreshes do not duplicate", #receipts(), 3)

inbox = { { sender = "COD Sender", money = 10000, cod = 5000 } }; event("MAIL_INBOX_UPDATE")
TakeInboxMoney(1); inbox[1].money = 0; wallet = wallet + 10000; event("PLAYER_MONEY"); event("MAIL_INBOX_UPDATE")
check("COD mail is excluded even with a coincident balance change", #receipts(), 3)
check("COD exclusion has count-only disclosure",OlympusVerifyDB.treasury.titheObservationCounts280.cod_excluded,1)

inbox = { { sender = "Twin Sender-Realm", money = 10000 }, { sender = "Twin Sender-Realm", money = 10000 } }
event("MAIL_INBOX_UPDATE"); TakeInboxMoney(1); TakeInboxMoney(2)
inbox[1].money, inbox[2].money = 0, 0; wallet = wallet + 20000
event("PLAYER_MONEY"); event("MAIL_INBOX_UPDATE")
check("identical separate mails preserve multiplicity", #receipts(), 5)
check("identical separate mails get distinct stable ids", receipts()[4].id ~= receipts()[5].id, true)

inbox = { { sender = "First Sender", money = 10000 }, { sender = "Second Sender", money = 20000 } }
event("MAIL_INBOX_UPDATE"); TakeInboxMoney(1); TakeInboxMoney(2)
inbox[1].money = 0; wallet = wallet + 10000
event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY")
check("partial multi-bucket settlement stays held until every intent matches", #receipts(), 5)
inbox[2].money = 0; wallet = wallet + 20000
event("PLAYER_MONEY"); event("MAIL_INBOX_UPDATE")
check("remaining collection later records once", #receipts(), 7)

inbox = { { sender = "Failed Sender", money = 30000 } }
event("MAIL_INBOX_UPDATE"); TakeInboxMoney(1); later(9)
check("failed/timeout collection adds no receipt", #receipts(), 7)
check("failed collection has count-only disclosure",(OlympusVerifyDB.treasury.titheObservationCounts280.mail_collection_unconfirmed or 0)>0,true)
check("addon has only observed the eight manual take actions", moneyCalls, 8)

-- Reload preserves the same IDs; the module never recredits or reissues them.
local savedId, noteCount = receipts()[1].id, #notes
timers = {} -- a real client reload discards the old Lua timers and frames
assert(loadfile("../OlympusVerify/OlympusVerifyTreasury.lua"))("OlympusVerify")
local reloaded = frames.OlympusVerifyTreasuryFrame
reloaded.onEvent(reloaded, "PLAYER_LOGIN")
frame = reloaded
check("saved receipt id survives module reload", receipts()[1].id, savedId)
check("module reload does not reemit receipt notes", #notes, noteCount)
check("no automatic remote/tithe credit advertised", OlympusVerifyTreasury.Status().automaticCredit, false)
check("storage status discloses actual client write boundary", OlympusVerifyTreasury.Status().storage:find("reload/logout", 1, true) ~= nil, true)

-- Worst bounded amount/name still obeys the 255-byte chat limit, otherwise local evidence remains.
check("no financial correspondence is emitted through legacy chat transport",#notes,0)
inbox = { { sender = "Attachment Sender", money = 50000, items = 1 } }
event("MAIL_SHOW"); TakeInboxMoney(1)
inbox[1].items = 0; wallet = wallet + 50000 -- unrelated gold while the take-money request fails
event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY"); later(9)
check("attachment removal plus unrelated credit cannot impersonate gold collection", #receipts(), 7)
check("still-uncollected mail money remains uncredited", inbox[1].money, 50000)
inbox = { { sender = "Open All Sender", money = 10000, items = 1 } }
event("MAIL_INBOX_UPDATE"); AutoLootMailItem(1); TakeInboxItem(1)
inbox[1].money, inbox[1].items = 0, 0; wallet = wallet + 10000
event("PLAYER_MONEY"); event("MAIL_INBOX_UPDATE")
check("open-all path can observe actual money collection", #receipts(), 8)
check("overlapping open-all/item hooks cannot duplicate the receipt", receipts()[8].sender, "Open All Sender")
inbox = { { sender = "Returned Sender", money = 10000 } }
event("MAIL_INBOX_UPDATE"); TakeInboxMoney(1); ReturnInboxItem(1)
inbox = {}; wallet = wallet + 10000
event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY")
check("a returned pending mail plus unrelated credit is not a receipt", #receipts(), 8)
local completeHeader, completeCount = GetInboxHeaderInfo, GetInboxNumItems
local function incompleteInbox(label, change, duplicate)
  inbox = { { sender = "Readable Sender", money = 10000 }, { sender = duplicate and "Readable Sender" or "Held Sender", money = 10000 } }
  GetInboxHeaderInfo, GetInboxNumItems = completeHeader, completeCount
  event("MAIL_SHOW"); TakeInboxMoney(2)
  change()
  wallet = wallet + 10000 -- unrelated receipt; the target mail still contains its gold
  event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY")
  check(label .. " cannot confirm a receipt", #receipts(), 8)
  check(label .. " marks the snapshot incomplete", OlympusVerifyTreasury.Status().mailSnapshotComplete, false)
  GetInboxHeaderInfo, GetInboxNumItems = completeHeader, completeCount
  event("MAIL_INBOX_UPDATE")
  check(label .. " cannot resurrect a receipt after a fresh unchanged snapshot", #receipts(), 8)
  later(9)
end
incompleteInbox("all unreadable headers", function() GetInboxHeaderInfo = function() return nil end end)
incompleteInbox("one unreadable counted header", function()
  GetInboxHeaderInfo = function(i) if i == 2 then return nil end; return completeHeader(i) end
end)
incompleteInbox("a missing transient duplicate bucket row", function()
  GetInboxHeaderInfo = function(i) if i == 2 then return nil end; return completeHeader(i) end
end, true)
incompleteInbox("a partial loaded/total mailbox", function() GetInboxNumItems = function() return 1, 2 end end)
incompleteInbox("a hidden loaded mailbox", function() GetInboxNumItems = function() return 0, 2 end end)
incompleteInbox("a fractional inbox count", function() GetInboxNumItems = function() return 1.5, 1.5 end end)
incompleteInbox("a string inbox count", function() GetInboxNumItems = function() return "2", 2 end end)
incompleteInbox("an unavailable total count", function() GetInboxNumItems = function() return 2 end end)
incompleteInbox("a count changing during the read", function()
  local reads = 0
  GetInboxNumItems = function() reads = reads + 1; if reads == 1 then return 2, 2 end; return 1, 1 end
end)
incompleteInbox("headers changing between passes", function()
  local reads = 0
  GetInboxHeaderInfo = function(i)
    reads = reads + 1
    if reads > 2 and i == 2 then return nil end
    return completeHeader(i)
  end
end)
-- Same-looking mail has no per-message ID: a partially completed same-bucket batch stays unconfirmed.
inbox = { { sender = "Partial Twin", money = 10000 }, { sender = "Partial Twin", money = 10000 } }
event("MAIL_INBOX_UPDATE"); TakeInboxMoney(1); TakeInboxMoney(2)
inbox[1].money = 0; wallet = wallet + 10000
event("MAIL_INBOX_UPDATE"); event("PLAYER_MONEY"); later(9)
check("ambiguous partial same-bucket collection is held rather than overcredited", #receipts(), 8)
collector = "Fern Melder-OtherRealm"
check("realm suffix is not stripped to activate another collector", OlympusVerifyTreasury.Status().enabled, false)
collector = "Fern Melder"
local beforeEdge = #receipts()
startTrade(2147483648); finishTrade(); later(4)
check("out-of-contract copper is never imported", #receipts(), beforeEdge)
wallet = 100000
startTrade(0); finishTrade()
check("zero incoming trade is not a gold receipt", #receipts(), beforeEdge)
startTrade(10000, 0, "Unsafe|Name"); finishTrade(); later(4)
check("wire delimiter in a name is rejected", #receipts(), beforeEdge)
OlympusVerifyConfig.treasuryTracking = false
startTrade(10000); finishTrade()
check("explicit local observation switch disables capture", #receipts(), beforeEdge)
OlympusVerifyConfig.treasuryTracking = true
local oldLedger = OlympusVerifyDB.treasury
OlympusVerifyDB.treasury = { version = 99, receipts = { { id = "preserve" } }, observations = {} }
event("PLAYER_LOGIN")
check("unknown ledger version is preserved, not silently reset", OlympusVerifyDB.treasury.receipts[1].id, "preserve")
OlympusVerifyDB.treasury = oldLedger
later(31)
startTrade(10000, 0, "Previous Payer"); event("TRADE_CLOSED")
startTrade(10000, 0, "Next Payer")
wallet = wallet + 10000; event("PLAYER_MONEY"); event("UI_INFO_MESSAGE", 1, ERR_TRADE_COMPLETE)
check("a delayed predecessor completion cannot be attributed to the next payer", #receipts(), beforeEdge)
event("TRADE_CLOSED")
later(4); later(31)
local keptFirst = receipts()[1].id
for i = #receipts() + 1, 1000 do receipts()[i] = { ts = NOW, id = "synthetic-cap-" .. i } end
startTrade(10000); finishTrade()
check("large pending ledger never overwrites an unexpired receipt", receipts()[1].id, keptFirst)
check("pending receipt1001 is retained rather than dropped at an upload batch limit", #receipts(), 1001)
check("durable pending capture is not falsely reported as an overflow", OlympusVerifyDB.treasury.overflows, 0)
later(10)
later(30 * 86400 + 100)
frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame, 60)
check("periodic retention preserves every old unacknowledged receipt", #OlympusVerifyDB.treasury.receipts, 1001)
check("periodic idle retention also purges old named observations", #OlympusVerifyDB.treasury.observations, 0)
check("unacknowledged pending receipts are not falsely counted as expired", OlympusVerifyDB.treasury.expiredReceipts or 0, 0)
-- This component consumes the intake's already-authenticated ACK cache. Actual
-- signature refusal is exercised by live242; no ACK is minted by Treasury.
OlympusVerifyDB.intake242={version=1,nextId=0,entries={},dedup={},acknowledgements={}}
local acks=OlympusVerifyDB.intake242.acknowledgements
acks["unrelated-id"]={status="done"}
acks[keptFirst]={status="rejected"}
frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame,60)
check("unrelated or rejected ACKs cannot purge old pending value",#receipts(),1001)
acks[keptFirst]={status="done"}
frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame,60)
check("durably ACKed redundant old receipt may be pruned",#receipts(),1000)
check("ACKed receipt pruning keeps the exact expired aggregate",OlympusVerifyDB.treasury.expiredReceipts,1)
local fresh={id="synthetic-recent-acked",ts=NOW}
table.insert(receipts(),fresh);acks[fresh.id]={status="done"}
frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame,60)
check("ACK alone does not shorten the30day local copy retention",#receipts(),1001)
for _,row in ipairs(receipts()) do if row~=fresh then acks[row.id]={status="done"} end end
frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame,60)
check("only old ACKed copies are pruned while the recent copy survives",#receipts()==1 and receipts()[1]==fresh,true)
check("all1001 old receipts remain disclosed after durable pruning",OlympusVerifyDB.treasury.expiredReceipts,1001)
later(30*86400+1);frames.OlympusVerifyTreasuryFrame.onUpdate(frames.OlympusVerifyTreasuryFrame,60)
check("recent ACKed copy is pruned only after its own30day window",#receipts(),0)
check("final pruning aggregate counts each original receipt once",OlympusVerifyDB.treasury.expiredReceipts,1002)
local legacy={id="old-v1-original",ts=NOW,kind="trade",sender="Legacy Sender",recipient="Fern Melder",incomingCopper=123,outgoingCopper=0,mac="unchanged-legacy-mac",status="confirmed_local",classification="unclassified_receipt"}
table.insert(receipts(),legacy)
local legacyNotes=#notes
assert(loadfile("../OlympusVerify/OlympusVerifyTreasury.lua"))("OlympusVerify")
frame=frames.OlympusVerifyTreasuryFrame;event("PLAYER_LOGIN")
check("legacy original row survives reload by exact reference",receipts()[1]==legacy,true)
check("legacy original MAC is never renewed",legacy.mac,"unchanged-legacy-mac")
check("legacy receipt cannot be upgraded to v2 intake",OlympusVerifyTreasury.IntakeBody280(legacy),nil)
check("legacy receipt cannot reemit a financial whisper",#notes,legacyNotes)
print(string.format("%d checks, %d failed", total, failed))
if failed > 0 then os.exit(1) end

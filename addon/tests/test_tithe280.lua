-- Synthetic native APIs, actual Treasury/Live source. No real mail, gold or client action.
local file = assert(io.open("test_live242.lua", "r"))
local prefix = file:read("*a"):match("^(.-)\ndo\n")
file:close()
local fixture = assert(loadstring(prefix .. "\nreturn fixture"))()
local checks = 0
local function check(label, condition)
  assert(condition, label)
  checks = checks + 1
  print("PASS " .. label)
end
local REF = "TITHE-ABCD-EFGH"
local function count(rows)
  local n = 0; for _ in pairs(rows) do n = n + 1 end; return n
end
local function trade(x, ref, amount, outgoing)
  x.incoming = amount or 900
  x.e.GetPlayerTradeMoney = function() return outgoing or 0 end
  x.event("TRADE_SHOW")
  if ref then check("explicit current-trade reference accepted", x.e.OlympusVerifyTreasury.SetTradeReference280(ref)) end
  x.event("TRADE_ACCEPT_UPDATE", 1, 1)
  x.wallet = x.wallet + x.incoming - (outgoing or 0)
  x.event("UI_INFO_MESSAGE", 1, "Trade complete.")
  x.event("PLAYER_MONEY")
end
local x = fixture(true)
x.e.GetAddOnMetadata = function() return "0.6.37" end
x.e.C_AddOns.GetAddOnMetadata = x.e.GetAddOnMetadata
check("boot performs no take or delete", x.takes == 0 and x.deletes == 0)
x.event("CHAT_MSG_WHISPER", "I donated 12g; PRIVATE CORRESPONDENCE", "Another Person")
check("gold-related whisper creates no receipt", count(x.rows()) == 0)
trade(x)
check("trade without explicit reference creates no receipt", count(x.rows()) == 0)
trade(x, REF)
check("positive completed native trade creates one minimal original", count(x.rows()) == 1)
local receipt = x.e.OlympusVerifyDB.treasury.receipts[1]
local original = x.rows()[receipt.id]
check("one original24hex ID is shared by observer and intake", #receipt.id == 24 and original.id == receipt.id)
check("native collector, scope and explicit reference retained", original.requestedBy == "Fern Melder"
  and original.guild == "OLYMPUS PRIME" and original.realm == "Native Realm"
  and original.donation.collectorGuid == "Player-1-1234ABCD" and original.donation.reference == REF)
check("no note/items/subject/body fields created", original.note == nil and original.body == nil and original.subject == nil
  and original.donation.note == nil and original.donation.items == nil and receipt.note == nil and receipt.items == nil)
check("new domain and fixed non-credit evidence", original.source == "tithe-gold-v2" and original.donation.version == 2
  and original.evidence.confirmedLocal == true and original.evidence.automaticCredit == false)
local fields = {receipt.id, tostring(receipt.ts), "trade", "900", "trade donor", "Player-1-9999ABCD", "fern melder",
  "Player-1-1234ABCD", "OLYMPUS PRIME", "Native Realm", REF, "0.6.37", "trade_complete_and_money_delta", "Fern Melder"}
local encoded = "tithe-gold-v2|"
for _, value in ipairs(fields) do encoded = encoded .. #value .. ":" .. value end
check("MAC binds every length-prefixed semantic field", original.evidence.mac == x.e.OlympusHmac.hmacSha256hex(x.e.OlympusVerifyConfig.secret, encoded):sub(1, 32))
local altered = {}; for key, value in pairs(receipt) do altered[key] = value end; altered.note = "PRIVATE EXTRA"
check("unexpected financial source fields hold instead of being stripped", x.e.OlympusVerifyTreasury.IntakeBody280(altered) == nil)
local before = count(x.rows())
x.v.Flush("test")
x.event("PLAYER_MONEY"); x.event("UI_INFO_MESSAGE", 1, "Trade complete.")
check("flush and repeated completion preserve the same original", count(x.rows()) == before)
check("financial evidence is not announced to guild peers", #x.addonMessages == 0)
trade(x)
check("reference does not carry into the next trade", count(x.rows()) == before)
trade(x, REF, 1000, 100)
check("outgoing-gold exchange cannot be treated as a tithe", count(x.rows()) == before)
check("reference cannot be saved without an open intended trade", not x.e.OlympusVerifyTreasury.SetTradeReference280(REF))
x.e.OlympusVerifyAPI.TreasuryTransport.Name = function() return "Another Officer" end
trade(x)
check("another collector cannot capture gold", count(x.rows()) == before)

local mail = fixture(true)
local bodyReads = 0
mail.e.GetInboxText = function() bodyReads = bodyReads + 1; error("private mail body must not reach receipt observer") end
local function receiptEvent(event, ...)
  mail.treasuryFrame:GetScript("OnEvent")(mail.treasuryFrame, event, ...)
end
mail.inbox = {{sender="Mail Donor-Realm",subject="private unrelated subject",money=700}}
receiptEvent("MAIL_SHOW"); mail.e.TakeInboxMoney(1)
mail.inbox[1].money = 0; mail.wallet = mail.wallet + 700
receiptEvent("MAIL_INBOX_UPDATE"); receiptEvent("PLAYER_MONEY")
check("non-TITHE mail is not recorded", count(mail.rows()) == 0)
local invalid = {"TITHE-AAAA-AAAI", REF .. " and " .. REF, "X" .. REF, REF .. "X", REF .. "-EXTRA", "TITHE-ABCD-EFGH and TITHE-bad"}
for _, subject in ipairs(invalid) do
  mail.inbox = {{sender="Mail Donor-Realm",subject=subject,money=700}}
  receiptEvent("MAIL_INBOX_UPDATE"); mail.e.TakeInboxMoney(1)
  mail.inbox[1].money = 0; mail.wallet = mail.wallet + 700
  receiptEvent("MAIL_INBOX_UPDATE"); receiptEvent("PLAYER_MONEY")
  check("ambiguous or malformed reference is not captured: " .. subject, count(mail.rows()) == 0)
end
mail.inbox = {{sender="Mail Donor-Realm",subject="Payment (" .. REF .. ") unrelated PRIVATE TEXT",money=700}}
receiptEvent("MAIL_INBOX_UPDATE"); mail.e.TakeInboxMoney(1)
check("take API return alone is no receipt", count(mail.rows()) == 0)
mail.inbox[1].money = 0
receiptEvent("MAIL_INBOX_UPDATE")
check("inbox depletion alone is no receipt", count(mail.rows()) == 0)
mail.wallet = mail.wallet + 700; receiptEvent("PLAYER_MONEY")
check("matching inbox/wallet native observation creates receipt", count(mail.rows()) == 1)
local mr = mail.e.OlympusVerifyDB.treasury.receipts[1]
check("mail stores only canonical reference and no inferred senderGUID", mr.reference == REF and mr.senderGuid == "" and mr.subject == nil and mr.body == nil)
check("receipt observer never reads mail body", bodyReads == 0)
mail.inbox = {{sender="Twin Sender",subject=REF,money=500},{sender="Twin Sender",subject=REF,money=500}}
receiptEvent("MAIL_INBOX_UPDATE"); mail.e.TakeInboxMoney(1); mail.e.TakeInboxMoney(2)
mail.inbox[1].money, mail.inbox[2].money = 0, 0; mail.wallet = mail.wallet + 1000
receiptEvent("MAIL_INBOX_UPDATE"); receiptEvent("PLAYER_MONEY")
check("identical legitimate mails retain multiplicity", count(mail.rows()) == 3)
check("same-second legitimate mails have distinct originalIDs", mail.e.OlympusVerifyDB.treasury.receipts[2].id ~= mail.e.OlympusVerifyDB.treasury.receipts[3].id)
mail.inbox = {{sender="COD Sender",subject=REF,money=500,cod=20}}
receiptEvent("MAIL_INBOX_UPDATE"); mail.e.TakeInboxMoney(1)
mail.inbox[1].money = 0; mail.wallet = mail.wallet + 500
receiptEvent("MAIL_INBOX_UPDATE"); receiptEvent("PLAYER_MONEY")
check("COD mail cannot become a qualifying receipt", count(mail.rows()) == 3)
local legacy = {id=string.rep("b",32),type="donation",source="mail",character="Legacy Donor",status="pending",donation={note="OLD PRIVATE ORIGINAL",copper=10}}
mail.rows()[legacy.id] = legacy
mail.e.OlympusVerifyDB.intake242.mailCollection242 = {body="OLD PRIVATE ORIGINAL",transferId="old",observedAt=10}
mail.v.Flush("test")
check("legacy pending body remains identical and unresent", mail.rows()[legacy.id] == legacy and legacy.donation.note == "OLD PRIVATE ORIGINAL"
  and legacy.status == "pending" and count(mail.rows()) == 4)
check("legacy gold-v1 cannot be silently upgraded", mail.e.OlympusVerifyTreasury.IntakeBody280({version=1,mac="a"}) == nil)
check("financial extra fields are refused before new custody", mail.v.Queue({type="donation",source="tithe-gold-v2",requestedBy="Fern Melder",
  donation={version=2,recipient="Fern Melder",note="PRIVATE"},evidence={confirmedLocal=true,automaticCredit=false}}, "invalid") == nil)
local verified = fixture()
local vh = verified.e.OlympusHmac
local code = vh.codeFor(verified.e.OlympusVerifyConfig.secret, "Mail Sender", vh.utcDay(verified.e.NOW))
verified.inbox = {{sender="Mail Sender",subject="!verify " .. code,body="TRANSIENT VERIFICATION BODY",money=0}}
verified.event("MAIL_SHOW")
local verifiedRow; for _, value in pairs(verified.rows()) do verifiedRow = value end
check("separate verification-code mail purpose still queues its original proof", verifiedRow and verifiedRow.type == "verify" and verifiedRow.code == code
  and verifiedRow.mailProof242 and verifiedRow.mailProof242.fingerprint == vh.sha256hex("Mail Sender|!verify " .. code .. "|TRANSIENT VERIFICATION BODY|" .. code))
check("verification mail surrounding text is not a financial receipt", count(verified.rows()) == 1 and verifiedRow.donation == nil and verifiedRow.body == nil)
TITHE280_RESULT = {checks=checks,secret=x.e.OlympusVerifyConfig.secret,message=encoded,mac=original.evidence.mac,receipt=original}
print(checks .. " tithe280 synthetic-native checks passed")

-- .227 owner launch request (3 November 2026): observe gold paid to Fern Melder.
-- This never trades, takes mail, reloads, flushes a log, grants a role or credits a tithe.
-- SavedVariables is memory until the CLIENT writes it at /reload or logout. Self-whispers
-- are not used for new financial evidence; legacy original custody is preserved.
local ADDON = ...
local H, cfg = OlympusHmac, OlympusVerifyConfig or {}
local transport = OlympusVerifyAPI and OlympusVerifyAPI.TreasuryTransport
local secret = cfg.secret
if type(secret) ~= "string" or secret == "" or secret:find("^REPLACE_WITH_") then secret = nil end
local T = { version = 2, maxReceipts = 1000, maxObservations = 50, maximumCopper = 2147483647, retentionSeconds = 30 * 86400 }
local COLLECTOR = "Fern Melder"
local REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
local frame = CreateFrame("Frame", "OlympusVerifyTreasuryFrame")
local trade, mailbox, mailBatch, cache, totals, scanSerial = nil, false, nil, {}, {}, 0
local cacheComplete = false
local cacheWitness280
local uncertainTradeUntil = 0
local hooksReady, mailHooked, warned = false, false, false
local hookedMailActions = {}

local function readable(value)
  local secretFn = rawget(_G, "issecretvalue") or rawget(_G, "isSecret")
  if secretFn then local ok, hidden = pcall(secretFn, value); if not ok or hidden then return nil end end
  local ok, text = pcall(function() return type(value) == "string" and value or nil end)
  return ok and text or nil
end
local function normalize(value)
  if type(value) ~= "string" then return nil end
  return (value:gsub("[ \t\r\n\v\f]+", " "):gsub("^ ", ""):gsub(" $", ""):gsub("[A-Z]", function(c) return string.char(c:byte() + 32) end))
end
local function name(value)
  local text = readable(value)
  if not text or #text < 2 or #text > 96 or text:find("[%c|%(%)%[%]]") then return nil end
  return text
end
local function integer(value)
  local ok, valid = pcall(function() return type(value) == "number" and value == math.floor(value) and value >= 0 and value <= T.maximumCopper end)
  return ok and valid and value or nil
end
local function call(fn, ...)
  if type(fn) ~= "function" then return nil end
  local ok, result = pcall(fn, ...)
  return ok and result or nil
end
local function balance() return integer(call(GetMoney)) end
local function printLine(text)
  if DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.AddMessage then DEFAULT_CHAT_FRAME:AddMessage("|cffc9a227Olympus Treasury|r: " .. text) end
end
local function realmKey280(value)
  value=name(value)
  if not value or value:find("-",1,true) or value:find(":",1,true) then return nil end
  local key=value:gsub(" +",""):gsub("[A-Z]",function(c)return string.char(c:byte()+32)end)
  return key~="" and key or nil
end
local function exactCollector280(value,realm)
  local key=realmKey280(realm);if not key then return false end
  if value==COLLECTOR then return true end
  if type(value)~="string" or value:sub(1,#COLLECTOR+1)~=COLLECTOR.."-" then return false end
  return realmKey280(value:sub(#COLLECTOR+2))==key
end
local function identity()
  local me = transport and name(call(transport.Name))
  local ownGuid = readable(transport and call(transport.Guid))
  local guild, realm = name(call(GetGuildInfo, "player")), name(call(GetRealmName))
  -- The owner narrowed capture to this exact collector on 12 November 2026.
  -- An editable recipient setting cannot authorize another officer's mailbox.
  if cfg.treasuryTracking == false or not exactCollector280(me,realm) or not ownGuid or not ownGuid:match("^Player%-%d+%-%x+$") or not guild or not realm then return nil end
  return COLLECTOR, ownGuid, guild, realm
end
local function reference(value, extract)
  value = readable(value)
  if not value or #value > 512 then return nil end
  local found, count
  if extract then
    local cursor = 1
    while true do
      local first = value:find("TITHE-", cursor, true)
      if not first then break end
      count = (count or 0) + 1
      local candidate = value:sub(first, first + 14)
      if value:sub(first - 1, first - 1):match("[%w_%-]") or value:sub(first + 15, first + 15):match("[%w_%-]") then return nil end
      found = candidate; cursor = first + 6
    end
    if count ~= 1 then return nil end
  else found = value end
  if not found or not found:match("^TITHE%-%w%w%w%w%-%w%w%w%w$") then return nil end
  for character in found:sub(7):gmatch("[^%-]") do
    if not REFERENCE_ALPHABET:find(character, 1, true) then return nil end
  end
  return found
end
local function prune(d)
  local cutoff = time() - T.retentionSeconds
  for _, field in ipairs({ "receipts", "observations" }) do
    local kept, removed = {}, 0
    for _, row in ipairs(d[field]) do
      local intake=OlympusVerifyDB and OlympusVerifyDB.intake242
      local ack=type(row)=="table" and intake and intake.acknowledgements and intake.acknowledgements[row.id]
      -- .242 pending receipts have no age expiry. Only a signed durable server
      -- receipt permits pruning this redundant local gold record after 30 days.
      if type(row) == "table" and type(row.ts) == "number" and (row.ts > cutoff or field=="receipts" and not (ack and ack.status=="done")) then table.insert(kept, row)
      else removed = removed + 1 end
    end
    d[field] = kept
    if field == "receipts" then d.expiredReceipts = (d.expiredReceipts or 0) + removed end
  end
end
local function db()
  if not OlympusVerifyDB then return nil end
  local d = OlympusVerifyDB.treasury
  if d == nil then
    d = { version = 1, nextId = 0, receipts = {}, observations = {}, overflows = 0 }
    OlympusVerifyDB.treasury = d
  end
  if type(d) ~= "table" or d.version ~= 1 or type(d.receipts) ~= "table" or type(d.observations) ~= "table" then return nil end
  prune(d)
  return d
end
local function observe(reason, sender, incoming)
  local d = db(); if not d then return end
  -- Counts only for new unconfirmed transfers; legacy originals stay untouched.
  d.titheObservationCounts280 = d.titheObservationCounts280 or {}
  d.titheObservationCounts280[reason] = (d.titheObservationCounts280[reason] or 0) + 1
end
local function payload(row)
  local fields = {row.id, string.format("%.0f", row.ts), row.kind, string.format("%.0f", row.incomingCopper),
    normalize(row.sender), row.senderGuid or "", normalize(row.recipient), row.collectorGuid, row.guild, row.realm,
    row.reference, row.clientVersion, row.evidence, row.recipient}
  local encoded = {"tithe-gold-v2|"}
  for _, field in ipairs(fields) do encoded[#encoded + 1] = tostring(#field) .. ":" .. field end
  return table.concat(encoded)
end
local function intakeBody(row)
  if type(row) ~= "table" or row.version ~= 2 or not row.mac then return nil end
  local allowed = {version=true,id=true,ts=true,kind=true,sender=true,senderGuid=true,recipient=true,collectorGuid=true,
    guild=true,realm=true,reference=true,clientVersion=true,incomingCopper=true,outgoingCopper=true,netCopper=true,
    status=true,classification=true,evidence=true,source=true,mac=true,relay=true}
  for key in pairs(row) do if not allowed[key] then return nil end end
  return {id=row.id,type="donation",source="tithe-gold-v2",character=row.sender,guid=row.senderGuid or "",
    requestedAt=row.ts,requestedBy=row.recipient,guild=row.guild,realm=row.realm,clientVersion=row.clientVersion,
    donation={version=2,kind=row.kind,copper=row.incomingCopper,recipient=row.recipient,collectorGuid=row.collectorGuid,reference=row.reference},
    evidence={kind=row.evidence,confirmedLocal=true,automaticCredit=false,mac=row.mac}}
end
local function relay(row)
  local live = OlympusVerifyLive242
  local body = intakeBody(row)
  if not body or not live or type(live.Queue) ~= "function" then row.relay = "savedvariables_pending"; return false end
  local queued = live.Queue(body, "tithe-gold-v2|" .. row.id)
  row.relay = queued and "savedvariables_pending" or "intake_held"
  return queued and true or false
end
local function transferContext()
  local me, guid, guild, realm = identity(); local d = db()
  if not me or not d then return nil end
  d.nextId = (tonumber(d.nextId) or 0) + 1
  local at = time()
  local seed = table.concat({ guid or me, tostring(at), tostring(d.nextId), tostring(OlympusVerifyDB.boots or 0), tostring(call(GetTime) or 0) }, "|")
  return { id = H.sha256hex(seed):sub(1, 24), ts = at, recipient = me, collectorGuid = guid, guild = guild, realm = realm }
end
local function record(kind, sender, incoming, outgoing, evidence, context, titheReference, senderGuid)
  local me, guid, guild, realm = identity(); local d = db()
  sender, incoming, outgoing = name(sender), integer(incoming), integer(outgoing)
  titheReference = reference(titheReference)
  if not me or not d or not sender or not incoming or incoming <= 0 or outgoing ~= 0 or not titheReference or not secret then return false end
  if senderGuid ~= nil and (type(senderGuid) ~= "string" or not senderGuid:match("^Player%-%d+%-%x+$")) then return false end
  -- Pending transactions are never evicted or rejected for a local batch cap.
  -- Watcher upload batches are independently bounded and acknowledged.
  context = context or transferContext(); if not context then return false end
  if context.recipient ~= me or context.collectorGuid ~= guid or context.guild ~= guild or context.realm ~= realm then return false end
  local clientVersion = readable(call(C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata, ADDON, "Version")) or "unavailable"
  local row = { version = 2, id = context.id, ts = time(), kind = kind, sender = sender, senderGuid = senderGuid or "", recipient = me,
    collectorGuid = guid, guild = guild, realm = realm, reference = titheReference, clientVersion = clientVersion,
    incomingCopper = incoming, outgoingCopper = 0, netCopper = incoming,
    status = "confirmed_local", classification = "unclassified_receipt", evidence = evidence, source = "OlympusVerify" }
  row.mac = H.hmacSha256hex(secret, payload(row)):sub(1, 32)
  table.insert(d.receipts, row)
  relay(row)
  printLine(string.format("recorded a local %s receipt. Unclassified; sync pending, not automatic tithe credit.", kind))
  return true
end
local function partner()
  local guid = readable(call(UnitGUID, "npc"))
  -- A roster GUID match supplies the full Forever two-part name when UnitName only supplies its first part.
  if guid and GetNumGuildMembers and GetGuildRosterInfo then
    local count = tonumber(call(GetNumGuildMembers)) or 0
    for i = 1, math.min(count, 1000) do
      local ok, full, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, memberGuid = pcall(GetGuildRosterInfo, i)
      if ok and memberGuid == guid and name(full) then return name(full) end
    end
  end
  local full = name(call(GetUnitName, "npc", true)) or name(call(UnitName, "npc"))
  -- Forever characters have two-part names. Never attach a receipt to a known truncated first name.
  return full and full:find("%S%s+%S") and full or nil
end
local function tradeMoney()
  if not trade then return end
  trade.incoming = integer(call(GetTargetTradeMoney))
  trade.outgoing = integer(call(GetPlayerTradeMoney))
end
local function settleTrade()
  if not trade or trade.ambiguous or not trade.completed or not trade.accepted or not trade.sender then return false end
  local current = balance()
  if not current or not trade.before or not trade.incoming or not trade.outgoing then return false end
  if current - trade.before ~= trade.incoming - trade.outgoing then return false end
  local done = trade; trade = nil
  if done.incoming > 0 then return record("trade", done.sender, done.incoming, done.outgoing, "trade_complete_and_money_delta", done.context, done.reference, done.senderGuid) end
  return false
end
local function expireTrade(expected)
  if trade ~= expected then return end
  settleTrade()
  if trade == expected then
    if (trade.incoming or 0) > 0 then
      observe(trade.ambiguous and "trade_predecessor_unconfirmed" or (trade.completed and "trade_balance_or_identity_unconfirmed" or "trade_not_completed"), trade.sender, trade.incoming)
      -- The completion message carries no transaction ID. Do not attach a late predecessor result to a new payer.
      uncertainTradeUntil = time() + 30
    end
    trade = nil
  end
end
local function header(index)
  if type(GetInboxHeaderInfo) ~= "function" then return nil end
  local ok, _, _, sender, subject, money, cod, _, items, _, returned = pcall(GetInboxHeaderInfo, index)
  sender, money, cod = name(sender), integer(money), integer(cod)
  if not ok or not sender or not money or not cod then return nil end
  subject = readable(subject)
  if not subject or #subject > 512 then return nil end
  -- A transient bucket, not a durable message/person ID: same-looking mails retain their multiplicity.
  -- Removing an attachment must not move a still-uncollected gold amount into another bucket.
  local titheReference = reference(subject, true)
  local bucket = H.sha256hex(table.concat({ normalize(sender), titheReference or "" }, "|"))
  return { sender = sender, money = money, cod = cod, reference = titheReference, bucket = bucket, index = index }
end
local function settleMail()
  local batch = mailBatch
  if not batch or batch.ambiguous or not cacheComplete then return end
  local current = balance()
  if not current or not batch.before then return end
  local groups, matched, amount, matchedCount = {}, {}, 0, 0
  for _, intent in ipairs(batch.intents) do
    local g = groups[intent.bucket] or { incoming = 0, intents = {} }
    g.incoming = g.incoming + intent.money
    table.insert(g.intents, intent); groups[intent.bucket] = g
  end
  for bucket, group in pairs(groups) do
    if (batch.baselines[bucket] or 0) - (totals[bucket] or 0) == group.incoming then
      for _, intent in ipairs(group.intents) do matched[intent] = true; amount = amount + intent.money; matchedCount=matchedCount+1 end
    end
  end
  if amount <= 0 or matchedCount~=#batch.intents or current - batch.before ~= amount then return end
  local kept = {}
  for _, intent in ipairs(batch.intents) do
    if matched[intent] then
      if intent.reference then record("mail", intent.sender, intent.money, 0, "take_money_inbox_depletion_and_money_delta", intent.context, intent.reference) end
      batch.baselines[intent.bucket] = totals[intent.bucket] or 0
    else table.insert(kept, intent) end
  end
  batch.before = current; batch.intents = kept
  if #kept == 0 then mailBatch = nil end
end
local function mailClock280()
  local value=call(GetTime)
  if type(value)=='number' and value==value and value>=0 and value<math.huge then return value end
end
local function mailIdentity280()
  local collector,guid,guild,realm=identity()
  if not collector then return nil end
  return {collector=collector,guid=guid,guild=guild,realm=realm}
end
local function sameMailIdentity280(a,b)
  return a and b and a.collector==b.collector and a.guid==b.guid and a.guild==b.guild and a.realm==b.realm
end
local function sameMailRows280(a,b)
  if #a~=#b then return false end
  for i,row in ipairs(a) do
    local other=b[i]
    if not other or row.sender~=other.sender or row.bucket~=other.bucket or row.reference~=other.reference
      or row.money~=other.money or row.cod~=other.cod then return false end
  end
  return true
end
local function holdMailReuse280()
  if mailBatch then mailBatch.reuseHeld280=true;mailBatch.keys={};mailBatch.carried280={} end
end
local function scanMail()
  if not mailbox then return end
  local who=mailIdentity280()
  if not who then cacheComplete=false;holdMailReuse280();return end
  local priorComplete,priorRows,priorWitness,priorSerial=cacheComplete,cache,cacheWitness280,scanSerial
  local walletBefore=balance()
  cacheComplete = false
  local function failed() holdMailReuse280();return false end
  local function countInbox()
    if type(GetInboxNumItems) ~= "function" then return nil end
    local ok, loaded, total = pcall(GetInboxNumItems)
    loaded, total = integer(loaded), integer(total)
    -- A loading/paged mailbox cannot prove that a vanished bucket's money was collected.
    if not ok or not loaded or not total or loaded ~= total or loaded > 1000 then return nil end
    return loaded
  end
  local count = countInbox()
  if not count then return failed() end
  local rows, sums = {}, {}
  for i = 1, count do
    local row = header(i)
    -- One unreadable counted row refuses the WHOLE snapshot; it is not an empty/depleted bucket.
    if not row then return failed() end
    rows[i] = row
    sums[row.bucket] = (sums[row.bucket] or 0) + row.money
  end
  if countInbox() ~= count then return failed() end
  -- The native inbox has no stable message ID. Refuse a shifting/duplicated transient read rather than
  -- attributing a disappearance to a payer; identical real mails still retain their multiplicity.
  for i = 1, count do
    local row = header(i)
    if not row or row.sender ~= rows[i].sender or row.bucket ~= rows[i].bucket or row.money ~= rows[i].money or row.cod ~= rows[i].cod then return failed() end
  end
  if countInbox() ~= count then return failed() end
  local afterWho,walletAfter=mailIdentity280(),balance()
  if not sameMailIdentity280(who,afterWho) then return failed() end
  local batch=mailBatch
  if batch then
    local carry=not batch.reuseHeld280 and priorComplete and priorWitness
      and sameMailIdentity280(priorWitness.identity,who) and sameMailIdentity280(batch.identity280,who)
      and sameMailRows280(priorRows,rows) and walletBefore~=nil and walletBefore==walletAfter
      and walletBefore==batch.before
      and mailClock280()~=nil and batch.mono280~=nil and mailClock280()>=batch.mono280 and mailClock280()-batch.mono280<8
    local keys,carried={},{}
    if carry then
      for i,row in ipairs(rows) do
        local pending=batch.keys[tostring(priorSerial)..":"..tostring(i)]
        if pending and pending.bucket==row.bucket and pending.money==row.money and row.cod==0 then
          local key=tostring(priorSerial+1)..":"..tostring(i)
          keys[key],carried[key]=pending,true
        end
      end
    else batch.reuseHeld280=true end
    batch.keys,batch.carried280=keys,carried
  end
  cache, totals, scanSerial = rows, sums, scanSerial + 1
  cacheWitness280={identity=who,wallet=walletAfter}
  cacheComplete = true
  settleMail()
  return true
end
local function expireMail(expected)
  if mailBatch ~= expected then return end
  scanMail()
  if mailBatch ~= expected then return end
  for _, intent in ipairs(expected.intents) do if intent.reference then observe("mail_collection_unconfirmed", intent.sender, intent.money) end end
  mailBatch = nil
end
local function takingMoney(index)
  if not mailbox or not identity() or not cacheComplete then return end
  local currentClock=mailClock280()
  if mailBatch and mailBatch.mono280~=nil and (currentClock==nil or currentClock<mailBatch.mono280 or currentClock-mailBatch.mono280>=8) then
    expireMail(mailBatch)
    if not mailbox or not identity() or not cacheComplete then return end
  end
  index=integer(call(tonumber,index))
  if not index or index<1 or index>#cache then return end
  local row = cache[index]
  if not row or row.money <= 0 then return end
  if row.cod ~= 0 then
    if mailBatch then mailBatch.ambiguous=true end
    if row.reference then observe("cod_excluded", row.sender, row.money) end
    return
  end
  if not mailBatch then
    local copied = {}; for k, v in pairs(totals) do copied[k] = v end
    mailBatch = { before = balance(), baselines = copied, intents = {}, keys = {}, at = time(),mono280=mailClock280(),identity280=mailIdentity280(),carried280={} }
    if not cacheWitness280 or not sameMailIdentity280(cacheWitness280.identity,mailBatch.identity280)
      then mailBatch.reuseHeld280=true end
    local expected = mailBatch
    if C_Timer and C_Timer.After then C_Timer.After(8, function() expireMail(expected) end) end
  end
  local key = tostring(scanSerial) .. ":" .. tostring(index)
  if mailBatch.keys[key] then
    if mailBatch.carried280[key] and (mailBatch.reuseHeld280 or balance()~=mailBatch.before
      or not sameMailIdentity280(mailBatch.identity280,mailIdentity280())) then
      mailBatch.ambiguous=true;return
    end
    return mailBatch.keys[key]
  end
  -- Excluded gold is transient wallet accounting only. It gets no sender copy,
  -- transfer ID, receipt, reference or MAC and never leaves this live batch.
  local intent = { money = row.money, bucket = row.bucket }
  if row.reference then intent.sender=row.sender;intent.reference=row.reference;intent.context=transferContext() end
  mailBatch.keys[key] = intent
  table.insert(mailBatch.intents, intent)
  if #mailBatch.intents > 100 then expireMail(mailBatch) end
  return intent
end
local function interruptedMail()
  if not mailBatch then return end
  for _, intent in ipairs(mailBatch.intents) do if intent.reference then observe("mail_collection_interrupted", intent.sender, intent.money) end end
  mailBatch = nil
end
local function boot()
  db()
  if not warned then
    warned = true
    local actual = transport and name(call(transport.Name))
    if not actual then printLine("tracking waits for your complete native character name. Check /olvtreasury after the roster arrives.")
    elseif not identity() then printLine("tracking is inactive on " .. actual .. "; configured exact collector is " .. COLLECTOR .. ".")
    elseif not secret then printLine("local capture is ready, but signed relay needs the existing officer configuration. Check /olvtreasury.") end
  end
  if not hooksReady then
    hooksReady = true
    if type(hooksecurefunc) == "function" then
      -- Some clients/open-all helpers collect money with the all-contents action. Hooks observe calls only.
      -- Even an item-only call cannot confirm gold unless the stable money bucket AND wallet really change.
      for _, action in ipairs({ "TakeInboxMoney", "AutoLootMailItem", "TakeInboxItem" }) do
        if type(rawget(_G, action)) == "function" then
          local ok = pcall(hooksecurefunc, action, takingMoney)
          if ok then hookedMailActions[action] = true; mailHooked = true end
        end
      end
      for _, action in ipairs({ "DeleteInboxItem", "ReturnInboxItem" }) do
        if type(rawget(_G, action)) == "function" then pcall(hooksecurefunc, action, interruptedMail) end
      end
    end
  end
end
for _, event in ipairs({ "ADDON_LOADED", "PLAYER_LOGIN", "TRADE_SHOW", "TRADE_MONEY_CHANGED", "TRADE_ACCEPT_UPDATE",
  "TRADE_CLOSED", "TRADE_REQUEST_CANCEL", "UI_INFO_MESSAGE", "PLAYER_MONEY", "MAIL_SHOW", "MAIL_CLOSED", "MAIL_INBOX_UPDATE" }) do frame:RegisterEvent(event) end
frame:SetScript("OnEvent", function(_, event, ...)
  if event == "ADDON_LOADED" then if ... == ADDON then boot() end
  elseif event == "PLAYER_LOGIN" then boot()
  elseif event == "TRADE_SHOW" then
    if not identity() then return end
    if trade then expireTrade(trade) end
    trade = { sender = partner(), senderGuid = readable(call(UnitGUID, "npc")), before = balance(), at = time(), accepted = false, ambiguous = time() < uncertainTradeUntil, context = transferContext() }
    tradeMoney()
  elseif event == "TRADE_MONEY_CHANGED" then tradeMoney(); if trade then trade.accepted = false end
  elseif event == "TRADE_ACCEPT_UPDATE" then
    if trade then local ours, theirs = ...; tradeMoney(); trade.accepted = (ours == 1 or ours == true) and (theirs == 1 or theirs == true) end
  elseif event == "TRADE_REQUEST_CANCEL" then
    if trade then observe("trade_cancelled", trade.sender, trade.incoming); trade = nil end
  elseif event == "TRADE_CLOSED" then
    if trade then trade.closed=true end
    local expected = trade
    if expected then
      settleTrade()
      if C_Timer and C_Timer.After then C_Timer.After(3, function() expireTrade(expected) end) else expireTrade(expected) end
    end
  elseif event == "UI_INFO_MESSAGE" then
    local first, second = ...
    local message = readable(second) or readable(first)
    if trade and message and message == (rawget(_G, "ERR_TRADE_COMPLETE") or "Trade complete.") then
      trade.completed = true; settleTrade()
    end
  elseif event == "PLAYER_MONEY" then
    settleTrade()
    if mailBatch then mailBatch.reuseHeld280=true;for k in pairs(mailBatch.carried280 or {}) do mailBatch.keys[k]=nil end;mailBatch.carried280={};settleMail() end
  elseif event == "MAIL_SHOW" then mailbox = true; scanMail()
  elseif event == "MAIL_INBOX_UPDATE" then scanMail()
  elseif event == "MAIL_CLOSED" then
    if mailBatch then expireMail(mailBatch) end
    mailbox, cache, totals, cacheComplete = false, {}, {}, false
  end
end)
-- Retention runs even while the collector performs no new transfer. It cannot force the client to flush disk.
local elapsedSincePurge = 0
frame:SetScript("OnUpdate", function(_, elapsed)
  elapsedSincePurge = elapsedSincePurge + (tonumber(elapsed) or 0)
  if elapsedSincePurge >= 60 then elapsedSincePurge = 0; db() end
end)

local function setTradeReference280(value)
  local valid=reference(value)
  if not identity() or not trade or trade.closed or trade.completed or not valid then return false end
  trade.reference=valid;return true
end
local function referenceCommand280(value)
  value=readable(value)
  if not value or #value>512 then return false end
  value=value:gsub("^[ \t\r\n\v\f]+",""):gsub("[ \t\r\n\v\f]+$",""):gsub("[a-z]",string.upper)
  return setTradeReference280(value)
end
local function observationCount280(d)
  local total,seen=0,0
  for _,value in pairs(type(d.titheObservationCounts280)=="table" and d.titheObservationCounts280 or {}) do
    seen=seen+1;if seen>64 then break end
    if type(value)=="number" and value==math.floor(value) and value>=0 and value<=2147483647 then total=math.min(2147483647,total+value) end
  end
  return total
end
OlympusVerifyTreasury = {
  Normalize = normalize,
  IntakeBody280 = intakeBody,
  SetTradeReference280 = setTradeReference280,
  SetTradeReferenceCommand280 = referenceCommand280,
  Status = function()
    local d = db() or {}
    return { enabled = identity() ~= nil, recipient = COLLECTOR, nativeName = transport and name(call(transport.Name)), confirmedLocal = #(d.receipts or {}),
      unconfirmed = math.min(2147483647,#(d.observations or {})+observationCount280(d)), legacyUnconfirmed = #(d.observations or {}), overflow = d.overflows or 0, mailHooked = mailHooked,
      retentionSeconds = T.retentionSeconds,
      mailSnapshotComplete = cacheComplete,
      storage = "Minimal tithe receipts reach SavedVariables at client reload/logout; no message text is collected", automaticCredit = false }
  end,
}
local function TreasurySlash()
  local status = OlympusVerifyTreasury.Status()
  printLine(string.format("%d confirmed local receipts; %d observations without credit; collector %s (%s).",
    status.confirmedLocal, status.unconfirmed, status.recipient, status.enabled and "this character" or "not active on this character"))
  printLine("Only gold to Fern Melder with one TITHE reference is recorded; no automatic credit. SavedVariables reaches disk at /reload/logout.")
  printLine("Pending receipts persist until server acknowledgement; confirmed redundant local copies may be pruned after 30 days.")
end
local slashRegistry = OlympusVerifySlash234
if type(slashRegistry) == "table" and type(slashRegistry.Register) == "function" then
  slashRegistry.Register("OLYMPUSTREASURY", {"/olvtreasury"}, TreasurySlash)
  slashRegistry.Register("OLYMPUSTITHEREFERENCE", {"/olvtithe"}, function(value)
    printLine(referenceCommand280(value) and "TITHE reference set for this open trade only." or "Open the intended trade and enter one TITHE-XXXX-XXXX reference with /olvtithe. No note or reference was saved.")
  end)
elseif type(SlashCmdList) == "table" then
  SLASH_OLYMPUSTREASURY1 = "/olvtreasury"
  SlashCmdList.OLYMPUSTREASURY = TreasurySlash
end

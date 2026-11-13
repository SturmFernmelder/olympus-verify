-- POST-DEPLOY .242 checks. Authored before deployment; do not treat syntax
-- compilation as execution or native mailbox/trade/Discord acceptance.
local passed, failed = 0, 0
local failureLabels = {}
local function check(label, value)
  if value then passed=passed+1;print("PASS "..label) else failed=failed+1;failureLabels[#failureLabels+1]=label;print("FAIL "..label) end
end
local function fixture(withTreasury)
  local e=setmetatable({},{__index=_G});e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  local x={e=e,inbox={},wallet=10000,bags={},takes=0,deletes=0,frames={},requests=0,addonMessages={},filters={},hooks={}}
  local original=e.CreateFrame
  e.CreateFrame=function(...) local f=original(...);x.frames[#x.frames+1]=f;return f end
  e.NOW=1794312000;e.time=function() return e.NOW end
  e.OlympusVerifyConfig={secret="synthetic-live242-officer-key-not-production"}
  e.OlympusVerifyDB={boots=1};e.OlympusDB={pendingRoleUpdates={}}
  e.GetGuildInfo=function() return "OLYMPUS PRIME","Officer",1 end
  e.GetRealmName=function() return "Native Realm" end;e.IsInGuild=function() return true end
  e.UnitGUID=function(unit) return unit=="player" and "Player-1-1234ABCD" or "Player-1-9999ABCD" end
  e.GetUnitName=function(unit) return unit=="player" and "Fern Melder" or "Trade Donor" end
  e.GetMoney=function() return x.wallet end;e.GetItemCount=function(id) return x.bags[id] or 0 end
  e.C_Timer={After=function() end,NewTicker=function(_,fn) x.pump=fn;return {} end}
  e.C_ChatInfo={RegisterAddonMessagePrefix=function() end,SendAddonMessage=function(...) x.lastAddon={...};x.addonMessages[#x.addonMessages+1]=x.lastAddon end}
  e.hooksecurefunc=function(key,fn)
    local original=e[key];if type(original)~="function" then return end
    e[key]=function(...) local result=original(...);fn(...);return result end
  end
  e.CHAT_FRAMES={};e.ChatFrame_AddMessageEventFilter=function(event,fn) x.filters[event]=fn end
  e.GetInboxNumItems=function() return #x.inbox,#x.inbox end
  e.GetInboxHeaderInfo=function(i)
    local m=x.inbox[i];if m then return nil,nil,m.sender,m.subject,m.money or 0,m.cod or 0,30,#(m.items or {}),false,false end
  end
  e.GetInboxText=function(i) return x.inbox[i] and x.inbox[i].body end
  e.GetInboxItem=function(i,s) local m=x.inbox[i] and x.inbox[i].items and x.inbox[i].items[s];if m then return m.name,m.id,nil,m.count end end
  e.GetInboxItemLink=function(i,s) local m=x.inbox[i] and x.inbox[i].items and x.inbox[i].items[s];return m and "item:"..m.id end
  e.TakeInboxMoney=function() x.takes=x.takes+1 end;e.AutoLootMailItem=e.TakeInboxMoney
  e.DeleteInboxItem=function(i) x.deletes=x.deletes+1;table.remove(x.inbox,i) end
  e.GetTargetTradeMoney=function() return x.incoming or 0 end;e.GetPlayerTradeMoney=function() return 0 end
  e.GetTradeTargetItemInfo=function(i) local item=x.tradeItems and x.tradeItems[i];if item then return item.name,nil,item.count end end
  e.GetTradeTargetItemLink=function(i) local item=x.tradeItems and x.tradeItems[i];return item and "item:"..item.id end
  e.OlympusVerifyAutoSync={Request=function() x.requests=x.requests+1 end}
  e.OlympusLaunch229={Current=function() end}
  e.OlympusVerifyAPI={TreasuryTransport={Name=function() return "Fern Melder" end,Guid=function() return e.UnitGUID("player") end,Note=function() return true end},CaptureMailCode242=function(sender,code,observation)
    e.OlympusVerifyLive242.CaptureVerification("mail",sender,code,nil,nil,true,observation)
  end}
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")),e)("OlympusVerify")
  if withTreasury then setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyTreasury.lua")),e)("OlympusVerify");x.treasuryFrame=x.frames[1] end
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),e)("OlympusVerify")
  x.v=e.OlympusVerifyLive242;x.frame=x.frames[withTreasury and 2 or 1]
  x.event=function(event,...)
    if x.treasuryFrame then x.treasuryFrame:GetScript("OnEvent")(x.treasuryFrame,event,...) end
    x.frame:GetScript("OnEvent")(x.frame,event,...)
  end
  x.rows=function() return e.OlympusVerifyDB.intake242.entries end
  x.ack=function(row,status)
    local r={id=row.id,character=row.character,guid=row.guid or "",status=status or "done",observedAt=e.NOW,expiresAt=e.NOW+300}
    local h=e.OlympusHmac
    r.mac=h.hmacSha256hex(e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,r.guid or "",h.normalizeCharacter(r.character),"",r.observedAt,r.expiresAt},"|")):sub(1,32)
    e.OlympusQueue={intakeReceipts242={r}};return r
  end
  x.event("PLAYER_LOGIN");return x
end
do
  local x=fixture();check("login does not loot or delete mail",x.takes==0 and x.deletes==0)
  local observation=x.v.NewVerificationObservation("whisper","First Member","Player-1-12345678",100)
  local first=x.v.CaptureVerification("whisper","First Member","ABC123","Player-1-12345678",nil,false,observation)
  check("native capture gets a stable persistent ID",#first.id==32 and first.status=="pending")
  check("repeated original observation is idempotent",x.v.CaptureVerification("whisper","First Member","ABC123","Player-1-12345678",nil,false,observation)==first)
  for i=1,1200 do x.v.Queue({type="verify",character="Member "..i,code="ABC123"},"bulk|"..i) end
  x.e.NOW=x.e.NOW+100*86400;x.v.Flush("logout")
  local count=0;for _ in pairs(x.rows()) do count=count+1 end
  check("1200 pending requests survive age and local batch limits",count==1201 and first.status=="pending")
  check("bulk intake coalesces expensive sync alerts",x.requests<=3)
  local r=x.ack(first);r.mac="wrong";x.v.Flush("sync")
  check("unsigned ACK cannot mark pending done",first.status=="pending")
  x.ack(first);x.v.Flush("sync");check("valid original server ACK marks delivery done",first.status=="done")
  check("delivery ACK alone never claims verified Discord role",not x.v.VerificationReply(first.character,first.guid):find("already verified",1,true))
end
do
  local x=fixture()
  local observed=x.v.NewVerificationObservation("whisper","Fresh Member","Player-1-12345678",200)
  local first=x.v.CaptureVerification("whisper","Fresh Member","ABC123","Player-1-12345678",nil,false,observed)
  first.status="rejected";x.e.NOW=x.e.NOW+601
  local duplicate=x.v.NewVerificationObservation("whisper","Fresh Member","Player-1-12345678",200)
  check("same native line keeps original ID and observation time",duplicate.id==observed.id and duplicate.observedAt==observed.observedAt)
  check("duplicate spent observation never resets its rejected row",x.v.CaptureVerification("whisper","Fresh Member","ABC123","Player-1-12345678",nil,false,duplicate)==first and first.status=="rejected")
  local fresh=x.v.NewVerificationObservation("whisper","Fresh Member","Player-1-12345678",201)
  local proof={version=1,member=true,observedAt=x.e.NOW,scopeHash="synthetic",mac="original-native-proof"}
  local next=x.v.CaptureVerification("whisper","Fresh Member","ABC123","Player-1-12345678",proof,true,fresh)
  check("fresh real observation has its own pending row and original proof",next.id~=first.id and next.observationId==fresh.id and next.observedAt==x.e.NOW and next.nativeMembership==proof and first.status=="rejected")
  local a=x.v.NewVerificationObservation("whisper","Fresh Member","Player-1-12345678")
  local b=x.v.NewVerificationObservation("whisper","Fresh Member","Player-1-12345678")
  check("missing native line ID uses distinct durable observation sequences",a.id~=b.id)
end
local function copy268(value)
  if type(value)~="table" then return value end
  local out={};for k,v in pairs(value) do out[k]=copy268(v) end;return out
end
local function same268(a,b)
  if type(a)~=type(b) then return false end
  if type(a)~="table" then return a==b end
  for k,v in pairs(a) do if not same268(v,b[k]) then return false end end
  for k in pairs(b) do if a[k]==nil then return false end end
  return true
end

-- Current contract helpers. fixture() above remains byte-for-byte shared.
local function rowCount(x,kind)
  local n=0;for _,r in pairs(x.rows()) do if not kind or type(r)=="table" and r.type==kind then n=n+1 end end;return n
end
local REF="TITHE-ABCD-EFGH"
local function trade280(x,amount)
  x.incoming=amount or 900;x.event("TRADE_SHOW")
  assert(x.e.OlympusVerifyTreasury.SetTradeReference280(REF),"current explicit trade reference")
  x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+x.incoming
  x.event("UI_INFO_MESSAGE",1,"Trade complete.");x.event("PLAYER_MONEY")
  local r=x.e.OlympusVerifyDB.treasury.receipts[#x.e.OlympusVerifyDB.treasury.receipts]
  assert(r and x.rows()[r.id],"actual current observer must create original")
  return x.rows()[r.id],r
end
local function mail280(x,amount)
  x.inbox={{sender="No Guid Donor",subject=REF,body="PRIVATE NOT A RECEIPT",money=amount or 500,items={}}}
  x.event("MAIL_SHOW");x.e.TakeInboxMoney(1);x.inbox[1].money=0;x.wallet=x.wallet+(amount or 500)
  x.event("MAIL_INBOX_UPDATE");x.event("PLAYER_MONEY")
  local r=x.e.OlympusVerifyDB.treasury.receipts[#x.e.OlympusVerifyDB.treasury.receipts]
  assert(r and x.rows()[r.id],"native manual TITHE take must create original")
  return x.rows()[r.id],r
end
local function wireMessages(x)
  for _=1,120 do x.pump() end
  local out={};for _,message in ipairs(x.addonMessages) do if message[1]=="OLV242" then out[#out+1]=message[2] end end
  x.addonMessages={};return out
end
local function deliver(x,messages,sender,distribution)
  for _,message in ipairs(messages) do x.event("CHAT_MSG_ADDON","OLV242",message,distribution or "WHISPER",sender) end
end
local function reloadLive627(x)
  local before=#x.frames
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),x.e)("OlympusVerify")
  x.v=x.e.OlympusVerifyLive242;x.frame=x.frames[before+1];x.event("PLAYER_LOGIN")
end
-- Test-only typed encoder supplies archived packets to the actual decoder.
-- New positive requests below are emitted by actual QueueSelf243, not this helper.
local function pack280(v)
  if type(v)=="string" then return "s"..#v..":"..v end
  if type(v)=="number" then local s=tostring(v);return "n"..#s..":"..s end
  if type(v)=="boolean" then return v and "b1" or "b0" end
  local keys={};for k in pairs(v) do keys[#keys+1]=k end
  table.sort(keys,function(a,b)if type(a)~=type(b)then return type(a)=="number" end;return a<b end)
  local out={};for _,k in ipairs(keys)do out[#out+1]=pack280(k)..pack280(v[k]) end
  return "t"..#keys..":"..table.concat(out)
end
local function packets280(x,row)
  local raw=pack280(row);local wire=row.id:match("^%x+$") and #row.id==32 and row.id or x.e.OlympusHmac.sha256hex("OLV242-wire|"..row.id):sub(1,32)
  local out={};local count=math.ceil(#raw/170);for i=1,count do out[#out+1]=wire..":"..i..":"..count..":"..raw:sub((i-1)*170+1,i*170) end;return out
end
do
  local x=fixture(true);local row=mail280(x)
  local receipt=x.ack(row);check("current v2 mail ACK represents absent native GUID as empty",receipt.guid=="")
  receipt.mac="wrong";x.v.Flush("sync");check("GUID-less v2 receipt still requires original MAC",row.status=="pending")
  x.ack(row);x.v.Flush("sync");check("signed empty-GUID v2 ACK closes only original delivery",row.status=="done" and row.serverReceipt.guid=="")
  local bound=x.v.Queue({type="verify",character="Bound Member",guid="Player-1-11112222",code="ABC123"},"bound")
  local r=x.ack(bound);r.guid="";local h=x.e.OlympusHmac
  r.mac=h.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",h.normalizeCharacter(r.character),"",r.observedAt,r.expiresAt},"|")):sub(1,32)
  x.v.Flush("sync");check("GUID-less ACK cannot discharge GUID-bound original",bound.status=="pending")
  check("legacy generic financial admission is retired",x.v.Queue({type="donation",character="No Guid Donor",source="mail",donation={copper=500}},"legacy")==nil)
end
do
  local x=fixture();local original={id=string.rep("a",32),type="donation",character="Record Donor",source="original-record-source",requestedAt=x.e.NOW,donation={copper=123,note="PRIVATE ORIGINAL"}}
  local copy=copy268(original)
  for _,name in ipairs({"OlympusDB","OlympusRecordDB","OlympusAltDB"})do x.e[name]={pendingRoleUpdates={[original.id]=original}} end
  x.v.Flush("sync")
  check("foreign pending maps never become new local intake",rowCount(x)==0)
  check("foreign original body and source are not rewritten or tainted",same268(original,copy))
  check("foreign originals never become new bridge traffic",#wireMessages(x)==0)
end
do
  local x=fixture();local h=x.e.OlympusHmac
  local r={guid="Player-1-1111AAAA",character="Known Member",status="verified",discordRole="Veteran",observedAt=x.e.NOW,expiresAt=x.e.NOW+300}
  r.mac=h.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"verification242",r.guid,h.normalizeCharacter(r.character),r.status,r.discordRole,r.observedAt,r.expiresAt},"|")):sub(1,32)
  x.e.OlympusQueue={verificationResults242={r}}
  check("fresh signed current status replies already verified with role",x.v.VerificationReply(r.character,r.guid):find("already verified. Discord role: Veteran",1,true)~=nil)
  x.e.NOW=x.e.NOW+301
  check("expired server status does not renew from a reply",not x.v.VerificationReply(r.character,r.guid):find("already verified",1,true))
end
do
  local x=fixture();local h=x.e.OlympusHmac
  local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Mail Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Mail Sender",subject="Greetings",body="A longer message before !verify "..code.." and after.",money=0,items={}}}
  x.event("MAIL_SHOW")
  local row;for _,r in pairs(x.rows()) do if r.type=="verify" then row=r end end
  check("mail extracts a code embedded in a longer message",row and row.code==code)
  check("mail never invents a sender GUID",row and row.guid==nil and row.guidSource=="unavailable")
  check("native mail observation preserves signed sender proof",row and row.mailProof242 and #row.mailProof242.mac==32)
  check("empty code mail waits for durable server receipt",x.deletes==0)
  x.ack(row);x.event("MAIL_INBOX_UPDATE")
  check("signed verification ACK never authorizes mail deletion",x.deletes==0)
end

do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Value Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Value Sender",subject="!verify "..code,body="Donation",money=500,items={}}};x.event("MAIL_SHOW")
  local verify;for _,r in pairs(x.rows()) do if r.type=="verify"then verify=r end end
  check("verification-purpose value mail never auto-takes",verify and x.takes==0)
  x.ack(verify);x.inbox[1].money=0;x.event("MAIL_INBOX_UPDATE");x.wallet=x.wallet+500;x.event("PLAYER_MONEY")
  check("Live alone does not recapture arbitrary wallet/mail delta as finance",rowCount(x,"donation")==0)
  check("value mail remains player-controlled after verification ACK",x.takes==0 and x.deletes==0)
end
do
  local x=fixture(true);x.incoming=900;x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1)
  check("mutual trade acceptance alone is not a donation",rowCount(x,"donation")==0)
  x.event("TRADE_REQUEST_CANCEL");x.event("UI_INFO_MESSAGE",1,"Trade complete.")
  check("canceled trade is never a completed receipt",rowCount(x,"donation")==0)
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900;x.event("UI_INFO_MESSAGE",1,"Trade complete.");x.event("PLAYER_MONEY")
  check("unreferenced completed trade is not new financial custody",rowCount(x,"donation")==0)
  local row,receipt=trade280(x);local original=copy268(row);local originalReceipt=copy268(receipt)
  check("referenced native completed trade shares one original Treasury/Live ID",rowCount(x,"donation")==1 and #row.id==24 and row.id==receipt.id)
  check("current native trade proof has exact value and no raw item/note fields",row.donation.copper==900 and row.evidence.confirmedLocal==true and row.evidence.automaticCredit==false and row.donation.items==nil and row.donation.note==nil)
  x.v.Flush("sync");check("Flush never replaces original v2 body or MAC",same268(row,original) and same268(receipt,originalReceipt))
  local next=trade280(x);check("equal genuine referenced trades keep distinct native-start IDs",next.id~=row.id and rowCount(x,"donation")==2)
  check("financial originals never enter peer bridge",#wireMessages(x)==0)
end
do
  local x=fixture();x.v.Queue({type="role",character="Other Person",requestedBy="Other Person"},"other")
  x.v.Queue({type="verify",character="Fern Melder",requestedBy="Fern Melder"},"self")
  x.e.OlympusVerifyConfig.secret=nil
  check("member-facing status filters other people's requests",#x.v.VisibleEntries()==1)
  x.event("CHAT_MSG_WHISPER","I donated 10g mats","Resource Sender",nil,nil,nil,nil,nil,nil,nil,nil,nil,"Player-1-11223344")
  local row;for _,r in pairs(x.rows()) do if r.source=="whisper-declaration" then row=r end end
  check("resource whisper is not new financial capture",row==nil)
end
do
  local x=fixture();local filter=x.filters.CHAT_MSG_WHISPER
  check("leading-space verification command with token punctuation stays filtered",filter(nil,"CHAT_MSG_WHISPER","  !verify ABC2345.","Human Sender")==true)
  check("human explanatory verification mention remains visible",filter(nil,"CHAT_MSG_WHISPER","Can you explain !verify ABC2345?","Human Sender")==false)
  check("partial command prefix is not a verification command",filter(nil,"CHAT_MSG_WHISPER","!verifyABC2345","Human Sender")==false)
  local closed=0;x.e.FCF_Close=function() closed=closed+1 end
  x.e.CHAT_FRAMES={{chatType="WHISPER",chatTarget="Human Sender"}}
  x.v.VerificationReply("Human Sender")
  x.event("CHAT_MSG_WHISPER","Can you explain !verify ABC2345?","Human Sender")
  x.event("CHAT_MSG_WHISPER_INFORM","Olympus: code saved","Human Sender")
  check("explanatory human mention protects a mixed whisper window",closed==0)
  check("signed reply filter stays limited to the verification reply conversation",x.filters.CHAT_MSG_WHISPER_INFORM(nil,"CHAT_MSG_WHISPER_INFORM","Olympus: code saved","Human Sender")==true and x.filters.CHAT_MSG_WHISPER_INFORM(nil,"CHAT_MSG_WHISPER_INFORM","ordinary reply","Human Sender")==false)
end
do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Mail Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Mail Sender",subject="First",body="!verify "..code},{sender="Mail Sender",subject="Second",body="!verify "..code}}
  x.event("MAIL_SHOW")
  local rows={};for _,r in pairs(x.rows()) do if r.type=="verify" then rows[#rows+1]=r end end
  check("different emails carrying the same code keep separate observation IDs",#rows==2 and rows[1].id~=rows[2].id and rows[1].observationId~=rows[2].observationId)
  check("different emails retain their own original signed fingerprints",#rows==2 and rows[1].mailProof242.fingerprint~=rows[2].mailProof242.fingerprint)
  local first=rows[1];x.ack(first,"rejected");x.v.Flush("sync");x.event("MAIL_INBOX_UPDATE")
  check("repeat scan preserves a rejected mail claim instead of resetting it",first.status=="rejected" and x.rows()[first.id]==first)
end
do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Same Sender",h.utcDay(x.e.NOW))
  local function mail() return {sender="Same Sender",subject="Same",body="!verify "..code} end
  x.inbox={mail()};x.event("MAIL_SHOW")
  local old;for _,r in pairs(x.rows()) do if r.type=="verify" then old=r end end
  x.ack(old);x.event("MAIL_INBOX_UPDATE")
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  check("identical mail without observed absence cannot reuse an old ACK for deletion",x.deletes==0)
  x.inbox={};x.event("MAIL_INBOX_UPDATE");x.e.NOW=x.e.NOW+1
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  local fresh;for _,r in pairs(x.rows()) do if r.type=="verify" and r.id~=old.id then fresh=r end end
  check("complete observed absence permits a later identical mail's distinct instance",fresh and fresh.observationId~=old.observationId and fresh.status=="pending")
  check("old durable ACK cannot delete that later identical instance",x.deletes==0 and old.status=="done" and fresh and fresh.serverReceipt==nil)
  x.ack(fresh);x.event("MAIL_INBOX_UPDATE")
  check("later identical mail accepts only its own signed ACK without deletion",x.deletes==0 and fresh.status=="done")
end
do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Twin Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Twin Sender",subject="Same",body="!verify "..code,money=500},{sender="Twin Sender",subject="Same",body="!verify "..code,money=500}}
  x.event("MAIL_SHOW");local count=0;for _ in pairs(x.rows()) do count=count+1 end
  check("simultaneous indistinguishable mails remain held without invented UUIDs",count==0 and x.takes==0 and x.deletes==0)
end

do
  local x=fixture(true);local row,receipt=mail280(x,600)
  check("manual referenced mail shares original native Treasury/Live ID",row.id==receipt.id and row.donation.copper==600)
  check("v2 mail retains minimal proof rather than body/items",row.donation.items==nil and row.donation.note==nil and row.subject==nil and row.body==nil and row.evidence.kind=="take_money_inbox_depletion_and_money_delta")
  local takes=x.takes;x.ack(row);x.v.Flush("sync");x.event("MAIL_INBOX_UPDATE")
  check("v2 financial ACK never repeats manual take or deletes mail",row.status=="done" and x.takes==takes and x.deletes==0)
end
do
  for _,age in ipairs({86401,172801}) do
    local x=fixture();local observed=x.e.NOW-age
    local row=x.v.Queue({type="verify",character="Offline Member",code="ABC123"},"offline")
    local expires=observed+math.floor(age/86340)*86340+86400
    local r={id=row.id,status="done",character=row.character,guid="",discordRole="",observedAt=observed,expiresAt=expires}
    r.mac=x.e.OlympusHmac.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",x.e.OlympusHmac.normalizeCharacter(r.character),"",observed,expires},"|")):sub(1,32)
    x.e.OlympusQueue={intakeReceipts242={r}};x.v.Flush("sync")
    check("renewed terminal ACK accepted after "..age.." seconds with original timestamp",row.status=="done" and row.serverReceipt.observedAt==observed and row.serverReceipt.expiresAt==expires)
    check("renewed delivery ACK never certifies current verification",not x.v.VerificationReply(row.character):find("already verified",1,true))
  end
  local x=fixture();local row=x.v.Queue({type="verify",character="Bad Window",code="ABC123"},"bad-window")
  local r=x.ack(row);r.observedAt=x.e.NOW-86401;r.expiresAt=r.observedAt+86341+86400
  r.mac=x.e.OlympusHmac.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",x.e.OlympusHmac.normalizeCharacter(r.character),"",r.observedAt,r.expiresAt},"|")):sub(1,32)
  x.v.Flush("sync");check("signed but non-anchored renewal step is refused",row.status=="pending")
  r.expiresAt=r.observedAt+3*86340+86400
  r.mac=x.e.OlympusHmac.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",x.e.OlympusHmac.normalizeCharacter(r.character),"",r.observedAt,r.expiresAt},"|")):sub(1,32)
  x.v.Flush("sync");check("signed future transport window cannot extend bounded validity",row.status=="pending")
end
do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Ambiguous Sender",h.utcDay(x.e.NOW))
  local function mail() return {sender="Ambiguous Sender",subject="Same",body="!verify "..code} end
  x.inbox={mail()};x.event("MAIL_SHOW")
  local old;for _,r in pairs(x.rows()) do if r.type=="verify" then old=r end end
  x.inbox={mail(),mail()};x.event("MAIL_INBOX_UPDATE");x.ack(old)
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  check("duplicate-content survivor cannot reuse the prior verification ACK",x.deletes==0 and x.rows()[old.id]==old)
  x.event("MAIL_CLOSED");x.event("MAIL_SHOW")
  check("mailbox close/reopen never clears persistent ambiguity",x.deletes==0)
  local originalText=x.e.GetInboxText;local textReads=0
  x.e.GetInboxText=function(i) textReads=textReads+1;if textReads==1 then return nil end;return originalText(i) end
  local okay=pcall(x.v.ScanMailbox);x.e.GetInboxText=originalText
  check("one unreadable body pass holds without error or false absence",okay and textReads==1 and x.deletes==0 and x.rows()[old.id]==old)
  x.inbox={{sender="Unreadable Sender",subject="Loading",body=nil}};x.event("MAIL_INBOX_UPDATE")
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  check("unreadable counted mail cannot prove ambiguous content absent",x.deletes==0)
  x.inbox={};x.event("MAIL_INBOX_UPDATE");x.e.NOW=x.e.NOW+1
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  local fresh;for _,r in pairs(x.rows()) do if r.type=="verify" and r.id~=old.id then fresh=r end end
  check("only complete readable absence starts a new unambiguous instance",fresh and fresh.observationId~=old.observationId and fresh.status=="pending" and x.deletes==0)
  x.ack(fresh);x.event("MAIL_INBOX_UPDATE")
  check("new post-absence instance accepts its own durable ACK without deletion",x.deletes==0 and fresh.status=="done")
end
local function member626(secret)
  local x=fixture();x.nativeRows={{name="Fern Melder",guid="Player-1-1234ABCD",rank=2,online=true},{name="Bridge Member",guid="Player-1-11112222",rank=7,online=true}}
  x.e.OlympusVerifyAPI.TreasuryTransport.Name=function() return "Bridge Member" end
  x.e.GetUnitName=function(unit) return unit=="player" and "Bridge Member" or "Trade Donor" end
  x.e.UnitGUID=function(unit) return unit=="player" and "Player-1-11112222" or "Player-1-9999ABCD" end
  x.e.GetGuildInfo=function() return "OLYMPUS PRIME","Member",7 end
  x.e.GetNumGuildMembers=function() return #x.nativeRows end
  x.rosterRequests=0;x.e.GuildRoster=function() x.rosterRequests=x.rosterRequests+1 end
  x.e.C_GuildInfo.GuildRoster=x.e.GuildRoster
  x.nativeReads=0
  x.e.GetGuildRosterInfo=function(i) x.nativeReads=x.nativeReads+1;local r=x.nativeRows[i];if r then return r.name,"rank",r.rank,60,"class","zone","","",r.online,nil,"WARRIOR",0,0,false,false,0,r.guid end end
  if not secret then x.e.OlympusVerifyConfig.secret=nil end
  x.event("GUILD_ROSTER_UPDATE")
  return x
end
local function completedBridge626(member,row)
  member.v.Flush("sync");local request=wireMessages(member)
  local collector=fixture();deliver(collector,request,"Bridge Member")
  local original=collector.rows()[row.id];assert(original,"bridge request fixture must reach actual collector decoder")
  local receipt=collector.ack(original);collector.v.Flush("sync")
  return wireMessages(collector),collector,receipt,request
end

local function pair626(secret)
  local member=member626(secret);assert(member.v.QueueSelf("ABC2345"),"actual new self243 request")
  local row;for _,r in pairs(member.rows())do row=r end
  local ack,collector,receipt,request=completedBridge626(member,row)
  return member,row,ack,collector,receipt,request
end
local function ackField626(message,field,value)
  local fields={};for part in message:gmatch("[^|]+") do fields[#fields+1]=part end
  fields[field]=value;return table.concat(fields,"|")
end
do
  local m,row,ack=pair626(false)
  check("return ACK is exactly one bounded addon-message packet",#ack==1 and #ack[1]<=255 and ack[1]:sub(1,5)=="A626|")
  local readsBeforeACK=m.nativeReads
  deliver(m,ack,"Fern Melder")
  local d=m.e.OlympusVerifyDB.intake242;local original=d.deliveryReceipts242[row.id]
  check("configured fresh native collector settles the initiating secretless delivery",row.status=="done" and original and original.collectorReportedDeliveryOnly==true and original.collectorGuid=="Player-1-1234ABCD")
  check("collector delivery never fabricates server receipt, role cache or signed ACK authority",row.serverReceipt==nil and d.acknowledgements[row.id]==nil and not (m.e.OlympusQueue and m.e.OlympusQueue.verificationResults242))
  check("returned delivery is never already-verified role status",not m.v.VerificationReply(row.character,row.guid):find("already verified",1,true))
  deliver(m,ack,"Fern Melder")
  check("two ACKs in one roster event use only one bounded native roster read",m.nativeReads==readsBeforeACK)
  check("duplicate terminal delivery preserves the same original outcome",row.status=="done" and d.deliveryReceipts242[row.id].observationSHA256==original.observationSHA256)
  deliver(m,{ackField626(ack[1],5,"R")},"Fern Melder")
  check("conflicting terminal replay cannot replace the first delivery",row.status=="done" and d.deliveryReceipts242[row.id].status=="done")
  m.v.Flush("sync");check("settled initiating request is no longer retransmitted",#wireMessages(m)==0)
end
do
  for _,case in ipairs({"wrong native sender","wrong recipient","wrong body","unknown original ID","wrong character","wrong GUID","guild distribution","not Officer","duplicate collector name","duplicate collector GUID","stale roster","expired ACK"}) do
    local m,row,ack=pair626(false);local messages=ack;local sender="Fern Melder";local distribution="WHISPER"
    if case=="wrong native sender" then sender="Other Officer"
    elseif case=="wrong recipient" then messages={ackField626(ack[1],4,string.rep("0",32))}
    elseif case=="wrong body" then messages={ackField626(ack[1],3,string.rep("0",32))}
    elseif case=="unknown original ID" then messages={ackField626(ack[1],2,string.rep("0",32))}
    elseif case=="wrong character" then row.character="Other Member"
    elseif case=="wrong GUID" then row.guid="Player-1-77778888"
    elseif case=="guild distribution" then distribution="GUILD"
    elseif case=="not Officer" then m.nativeRows[1].rank=7;m.event("GUILD_ROSTER_UPDATE")
    elseif case=="duplicate collector name" then m.nativeRows[#m.nativeRows+1]={name="Fern Melder",guid="Player-1-55556666",rank=1,online=true}
    elseif case=="duplicate collector GUID" then m.nativeRows[#m.nativeRows+1]={name="Other Officer",guid="Player-1-1234ABCD",rank=1,online=true}
    elseif case=="stale roster" then m.e.NOW=m.e.NOW+61
    elseif case=="expired ACK" then m.e.NOW=m.e.NOW+301;m.event("GUILD_ROSTER_UPDATE") end
    deliver(m,messages,sender,distribution)
    check("return ACK refuses "..case,row.status=="pending")
    if case=="stale roster" then
      deliver(m,messages,sender,distribution)
      check("stale ACK burst coalesces one read-only roster request",m.rosterRequests==1)
      m.event("GUILD_ROSTER_UPDATE");check("a fresh native roster can admit the same still-valid pending delivery",row.status=="done")
    end
  end
end
do
  local m,row,ack=pair626(true)
  deliver(m,{ackField626(ack[1],8,string.rep("0",32))},"Fern Melder")
  check("existing-secret client must verify the compact delivery MAC",row.status=="pending")
  deliver(m,ack,"Fern Melder")
  check("correct existing-secret MAC admits delivery without server-proof promotion",row.status=="done" and row.serverReceipt==nil and m.e.OlympusVerifyDB.intake242.deliveryReceipts242[row.id].existingSecretMACVerified==true)
end

do
  local m,row,ack,collector,receipt,request=pair626(false)
  local received=collector.rows()[row.id]
  check("actual typedSelf243 wire preserves original ID and sender attribution",received and received.id==row.id and received.bridgeSender=="Bridge Member" and received.source=="addon-bridge242")
  check("remote metadata alone supplies no native membership or Discord proof",received.nativeMembership==nil and received.nativeDiscord==nil and received.bridgeUntrusted==true)
  local wrong=fixture();local altered={};for _,msg in ipairs(request)do altered[#altered+1]=string.rep("b",32)..msg:sub(33)end
  deliver(wrong,altered,"Bridge Member");check("actual decoder refuses transport hash different from original ID",rowCount(wrong)==0)
  local guild=fixture();deliver(guild,request,"Bridge Member","GUILD");check("actual decoder refuses guild-distribution intake",rowCount(guild)==0)
  local spoof=fixture();deliver(spoof,request,"Other Member");check("typed self identity is bound to actual sender",rowCount(spoof)==0)
  local body=copy268(row);body.nativeMembership={claimed=true};body.nativeDiscord={claimed=true}
  local claimed=fixture();deliver(claimed,packets280(m,body),"Bridge Member")
  check("new remote self scalar whitelist refuses claimed proofs before custody",rowCount(claimed)==0)
end
do
  local m=member626(false);assert(m.v.QueueSelf("ABC2345"));local row;for _,r in pairs(m.rows())do row=r end
  local request=wireMessages(m);local collector=fixture();deliver(collector,request,"Bridge Member")
  local original=collector.rows()[row.id];collector.ack(original,"unknown");collector.v.Flush("sync")
  check("nonterminal collector outcome produces no terminal ACK",#wireMessages(collector)==0 and row.status=="pending" and original.status=="pending")
  local before=copy268(row);m.v.Flush("sync");m.event("PLAYER_LOGIN");m.v.Flush("retry")
  check("possibly sent original is not automatically retried by Flush/login",#wireMessages(m)==0 and same268(row,before))
  check("possibly sent scheduling metadata remains delivery unknown",m.e.OlympusVerifyDB.intake242.transportSchedule243[row.id].state=="delivery_unknown")
end
do
  local m,row,ack=pair626(false);local d=m.e.OlympusVerifyDB.intake242
  local foreign=copy268(row);m.e.OlympusRecordDB={pendingRoleUpdates={[row.id]=foreign}}
  d.bridgeMetadata=d.bridgeMetadata or {};d.bridgeMetadata[row.id]={untrusted=true,automaticAuthority=false,source="OlympusRecordDB"}
  local before=copy268(foreign);deliver(m,ack,"Fern Melder")
  check("retained foreign callback metadata stays unsupported",row.status=="pending" and m.v.Status().unsupportedCallbacks==1)
  check("unsupported old callback never rewrites external original",same268(foreign,before))
  m.v.Flush("sync");check("unsupported callback never creates endless retransmission",#wireMessages(m)==0)
end
do
  -- Explicit archival packet, not newly adopted intent. Missing terminal route
  -- may be recovered only for the narrowly supported exact .625 body.
  local collector=fixture();local d=collector.e.OlympusVerifyDB.intake242
  local original={id="retained-request-625",type="verify",source="self-addon242",clientVersion="0.6.25",character="Bridge Member",guid="Player-1-11112222",code="ABC2345",requestedBy="Bridge Member",requestedAt=collector.e.NOW-20,status="pending",bridgeUntrusted=true}
  local stored=copy268(original);stored.source="addon-bridge242";stored.bridgeSender="Bridge Member";d.entries[original.id]=stored
  local receipt=collector.ack(stored);collector.v.Flush("sync");local before=copy268(stored)
  local request=packets280(collector,original);deliver(collector,request,"Bridge Member");local ack=wireMessages(collector)
  check("exact retained pre626 terminal packet recovers only missing return route",#ack==1 and d.bridgeReturns242[original.id].legacy625SourceRecovered==true and same268(stored,before) and stored.serverReceipt.observedAt==receipt.observedAt)
  d.bridgeReturns242[original.id]=nil;stored.bridgeSender="Other Member";collector.e.NOW=collector.e.NOW+3
  deliver(collector,request,"Bridge Member")
  check("unprovable retained legacy callback remains held without replacing body",d.bridgeReturns242[original.id]==nil and #wireMessages(collector)==0 and d.entries[original.id]==stored)
  local empty=fixture();deliver(empty,request,"Bridge Member")
  check("unmatched old self242 packet never becomes new intake",rowCount(empty)==0)
  local retired=member626(false);retired.rows()[original.id]=copy268(original);retired.v.Flush("sync");reloadLive627(retired)
  check("retained old self242 original never gains a new transport attempt",#wireMessages(retired)==0 and same268(retired.rows()[original.id],original))
end
do
  local m=member626(false)
  m.v.QueueSelf("ABCDEF");local first;for _,r in pairs(m.rows()) do first=r end
  local originalTime=first.observedAt;first.status="rejected"
  m.e.NOW=m.e.NOW+1;m.v.QueueSelf("ABCDEF")
  local second;for _,r in pairs(m.rows()) do if r.id~=first.id then second=r end end
  check("each explicit self-command has its own durable real observation",second and second.observationId~=first.observationId and second.id~=first.id and second.observedAt==m.e.NOW)
  check("fresh command never resets old rejected body, timestamp or claim",first.status=="rejected" and first.observedAt==originalTime and first.code==second.code)
  local id=second.id;local observation=second.observationId;m.v.Flush("retry");wireMessages(m);m.v.Flush("retry")
  check("Flush preserves original self-command ID and proof clock without resend",m.rows()[id]==second and second.observationId==observation and second.observedAt==m.e.NOW)
end

do
  local x=fixture();x.e.GetAddOnMetadata=function()return "0.6.37"end;x.e.C_AddOns.GetAddOnMetadata=x.e.GetAddOnMetadata
  local old=x.v.Queue({type="verify",character="Original Member",code="ABC123",clientVersion="0.6.28"},"prior-version")
  local fresh=x.v.Queue({type="verify",character="New Member",code="ABC123"},"current-version")
  check("queue preserves supplied original client version",old.clientVersion=="0.6.28")
  check("only genuinely new unversioned rows receive current metadata version",fresh.clientVersion=="0.6.37")
end
for _,kind in ipairs({"trade","mail"})do
  for _,state in ipairs({"unproved","proved","already-queued"})do
    local x=fixture(true);local d=x.e.OlympusVerifyDB.intake242;local id="old-"..kind.."-"..state
    local body={id=id,type="donation",source=kind,character="Legacy Donor",requestedBy="Fern Melder",requestedAt=x.e.NOW-100,observedAt=x.e.NOW-100,clientVersion="0.6.28",donation={copper=500,items={{itemId=123,count=2}},note="PRIVATE ORIGINAL"},evidence={confirmedLocal=true,automaticCredit=false,mac=string.rep("a",32)}}
    local context={transferId=id,completedAt=x.e.NOW-100,moneyConfirmed=true,itemsConfirmed=state~="unproved",exportBody=copy268(body),restored=false}
    local field=kind=="trade" and "tradeCollection242" or "mailCollection242";d[field]=context
    local treasury=x.e.OlympusVerifyDB.treasury;local receipt={id=id,ts=x.e.NOW-100,kind=kind,copper=500,note="PRIVATE ORIGINAL",items={{itemId=123,count=2}},version=1,mac=string.rep("b",32)}
    treasury.receipts={receipt};treasury.liveIntakeOwners242={[id]=true}
    if state=="already-queued"then body.status="pending";d.entries[id]=body end
    local beforeContext,beforeReceipt,beforeBody=copy268(context),copy268(receipt),copy268(body)
    x.e.NOW=x.e.NOW+5;reloadLive627(x);x.event("BAG_UPDATE_DELAYED");x.event("PLAYER_MONEY");x.v.Flush("legacy-recheck")
    check(kind.." "..state.." retained context/body stays exact and policy-held",same268(context,beforeContext) and d[field]==context and d.receiptPolicyHolds280[kind]==true and x.v.Status().heldTransfers>0)
    check(kind.." "..state.." old native claim and receipt MAC are unchanged",treasury.liveIntakeOwners242[id]==true and same268(receipt,beforeReceipt) and #treasury.receipts==1)
    check(kind.." "..state.." legacy body is neither adopted nor upgraded",state=="already-queued" and same268(d.entries[id],beforeBody) or state~="already-queued" and d.entries[id]==nil)
    check(kind.." "..state.." reload never repeats take/delete/peer delivery",x.takes==0 and x.deletes==0 and #wireMessages(x)==0)
  end
  for _,badBody in ipairs({true,42,false})do
    local x=fixture(true);local d=x.e.OlympusVerifyDB.intake242;local field=kind=="trade" and "tradeCollection242" or "mailCollection242"
    local context={transferId="old-malformed-"..kind,exportBody=badBody,completedAt=x.e.NOW-100};d[field]=context
    local before=copy268(context);local okay=pcall(reloadLive627,x)
    check(kind.." malformed retained "..type(badBody).." body stays exact without exception",okay and d[field]==context and same268(context,before))
    check(kind.." malformed retained body never queues credit or native actions",rowCount(x)==0 and x.takes==0 and x.deletes==0 and d.receiptPolicyHolds280[kind]==true)
  end
end
do
  local x=fixture(true);local d=x.e.OlympusVerifyDB.intake242
  d.heldTransfers627={};for i=1,1000 do d.heldTransfers627["retained-"..i]={context={original=i},reason="synthetic retained original"}end
  local before=copy268(d.heldTransfers627);reloadLive627(x)
  x.incoming=900;x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900;x.event("UI_INFO_MESSAGE",1,"Trade complete.");x.event("PLAYER_MONEY")
  check("1000 historical contexts remain exact and visibly held",same268(d.heldTransfers627,before) and x.v.Status().heldTransfers==1000)
  check("retired rich transfer capture cannot replace retained contexts",rowCount(x,"donation")==0 and d.tradeCollection242==nil and x.takes==0 and x.deletes==0)
end
print(string.format("live242: %d passed, %d failed",passed,failed))
if failed>0 then error("live242 current-contract checks failed: "..table.concat(failureLabels," | ")) end

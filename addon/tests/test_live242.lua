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
do
  local x=fixture();local row=x.v.Queue({type="donation",character="No Guid Donor",source="mail",donation={copper=500}},"guidless")
  local receipt=x.ack(row);check("Watcher-compatible donation receipt represents absent GUID as empty",receipt.guid=="")
  receipt.mac="wrong";x.v.Flush("sync");check("GUID-less receipt still requires the original MAC",row.status=="pending")
  x.ack(row);x.v.Flush("sync");check("signed empty-GUID donation ACK closes only its original row",row.status=="done" and row.serverReceipt.guid=="")
  local bound=x.v.Queue({type="verify",character="Bound Member",guid="Player-1-11112222",code="ABC123"},"bound")
  local r=x.ack(bound);r.guid="";local h=x.e.OlympusHmac
  r.mac=h.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",h.normalizeCharacter(r.character),"",r.observedAt,r.expiresAt},"|")):sub(1,32)
  x.v.Flush("sync");check("GUID-less ACK cannot discharge a GUID-bound original",bound.status=="pending")
end
do
  local x=fixture();local id=string.rep("a",32)
  local original={id=id,type="donation",character="Record Donor",source="original-record-source",requestedAt=x.e.NOW,donation={copper=123}}
  x.e.OlympusRecordDB={pendingRoleUpdates={[id]=original}}
  x.v.Flush("sync");local mirrored=x.rows()[id]
  check("record mirror preserves canonical source and original body fields",mirrored and mirrored.source==original.source and mirrored.clientVersion==nil and mirrored.requestedBy==nil and mirrored.bridgeUntrusted==nil and mirrored.donation.copper==123)
  local metadata=x.e.OlympusVerifyDB.intake242.bridgeMetadata[id]
  check("record mirror keeps explicit UNTRUSTED taint outside canonical body",metadata and metadata.untrusted==true and metadata.automaticAuthority==false)
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
  check("empty code mail deletes only after server durable acknowledgement",x.deletes==1)
end
do
  local x=fixture();local h=x.e.OlympusHmac
  local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Value Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Value Sender",subject="!verify "..code,body="Donation",money=500,items={}}}
  x.event("MAIL_SHOW");check("valid value mail requests native collection",x.takes==1)
  local verify;for _,r in pairs(x.rows()) do if r.type=="verify" then verify=r end end
  x.ack(verify);x.inbox[1].money=0;x.event("MAIL_INBOX_UPDATE")
  check("empty header without wallet delta cannot become a donation or deletion",x.deletes==0)
  x.wallet=x.wallet+500;x.event("PLAYER_MONEY")
  local donation;for _,r in pairs(x.rows()) do if r.type=="donation" then donation=r end end
  check("confirmed inbox depletion plus wallet delta records exact value",donation and donation.donation.copper==500)
  x.event("MAIL_INBOX_UPDATE");check("value mail still waits for donation ACK",x.deletes==0)
  x.ack(donation);x.event("MAIL_INBOX_UPDATE");check("confirmed durable value and verification permit deletion",x.deletes==1)
end
do
  local x=fixture();x.incoming=900
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1)
  local n=0;for _,r in pairs(x.rows()) do if r.type=="donation" then n=n+1 end end
  check("mutual trade acceptance alone is not a donation",n==0)
  x.event("TRADE_REQUEST_CANCEL");x.event("UI_INFO_MESSAGE",1,"Trade complete.")
  n=0;for _,r in pairs(x.rows()) do if r.type=="donation" then n=n+1 end end
  check("canceled trade is never a completed receipt",n==0)
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900
  x.event("UI_INFO_MESSAGE",1,"Trade complete.")
  local row;for _,r in pairs(x.rows()) do if r.type=="donation" then row=r end end
  check("native completed trade plus exact wallet delta records a receipt",row and row.donation.copper==900 and row.evidence.confirmedLocal==true)
end
do
  local x=fixture();x.v.Queue({type="role",character="Other Person",requestedBy="Other Person"},"other")
  x.v.Queue({type="verify",character="Fern Melder",requestedBy="Fern Melder"},"self")
  x.e.OlympusVerifyConfig.secret=nil
  check("member-facing status filters other people's requests",#x.v.VisibleEntries()==1)
  x.event("CHAT_MSG_WHISPER","I donated 10g mats","Resource Sender",nil,nil,nil,nil,nil,nil,nil,nil,nil,"Player-1-11223344")
  local row;for _,r in pairs(x.rows()) do if r.source=="whisper-declaration" then row=r end end
  check("resource whisper is an unconfirmed declaration, never credit",row and row.evidence.confirmedLocal==false and row.donation.copper==0)
end
-- .251 repairs: actual wire codec, durable mail-instance boundaries and both
-- native transfer observers. These fixtures provide no production authority.
do
  local sender=fixture();sender.e.OlympusVerifyConfig.secret=nil
  local original={id="request-123",type="donation",character="Record Donor",requestedBy="Fern Melder",source="original-record-source",donation={copper=123},nativeMembership={claimed=true},nativeDiscord={claimed=true}}
  sender.e.OlympusRecordDB={pendingRoleUpdates={[original.id]=original}}
  sender.v.Flush("sync");for _=1,100 do sender.pump() end
  local pieces={};for _,m in ipairs(sender.addonMessages) do if m[1]=="OLV242" then pieces[#pieces+1]=m[2] end end
  local h=sender.e.OlympusHmac;local wireId=h.sha256hex("OLV242-wire|request-123"):sub(1,32)
  check("nonhex original ID uses a bounded transport-only hash",#pieces>0 and pieces[1]:sub(1,32)==wireId)
  local receiver=fixture()
  for _,m in ipairs(pieces) do receiver.event("CHAT_MSG_ADDON","OLV242",m,"WHISPER","Remote Sender") end
  local row=receiver.rows()["request-123"]
  check("silent wire preserves the original canonical nonhex ID",row and row.id==original.id and original.id=="request-123")
  check("wire request remains untrusted and strips sender-claimed Native proofs",row and row.bridgeUntrusted==true and row.bridgeSender=="Remote Sender" and row.nativeMembership==nil and row.nativeDiscord==nil and row.evidence.confirmedLocal==false)
  local wrong=fixture()
  for _,m in ipairs(pieces) do wrong.event("CHAT_MSG_ADDON","OLV242",string.rep("b",32)..m:sub(33),"WHISPER","Remote Sender") end
  check("receiver rejects a transport hash not bound to canonical row ID",wrong.rows()["request-123"]==nil)
  local guild=fixture()
  for _,m in ipairs(pieces) do guild.event("CHAT_MSG_ADDON","OLV242",m,"GUILD","Remote Sender") end
  check("transport change does not authorize guild-distribution intake",guild.rows()["request-123"]==nil)
end
do
  local x=fixture();local filter=x.filters.CHAT_MSG_WHISPER
  check("leading-space verification command with token punctuation stays filtered",filter(nil,"CHAT_MSG_WHISPER","  !verify ABC1234.","Human Sender")==true)
  check("human explanatory verification mention remains visible",filter(nil,"CHAT_MSG_WHISPER","Can you explain !verify ABC1234?","Human Sender")==false)
  check("partial command prefix is not a verification command",filter(nil,"CHAT_MSG_WHISPER","!verifyABC1234","Human Sender")==false)
  local closed=0;x.e.FCF_Close=function() closed=closed+1 end
  x.e.CHAT_FRAMES={{chatType="WHISPER",chatTarget="Human Sender"}}
  x.v.VerificationReply("Human Sender")
  x.event("CHAT_MSG_WHISPER","Can you explain !verify ABC1234?","Human Sender")
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
  check("identical mail without observed absence cannot reuse an old ACK for deletion",x.deletes==1)
  x.inbox={};x.event("MAIL_INBOX_UPDATE");x.e.NOW=x.e.NOW+1
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  local fresh;for _,r in pairs(x.rows()) do if r.type=="verify" and r.id~=old.id then fresh=r end end
  check("complete observed absence permits a later identical mail's distinct instance",fresh and fresh.observationId~=old.observationId and fresh.status=="pending")
  check("old durable ACK cannot delete that later identical instance",x.deletes==1 and old.status=="done" and fresh and fresh.serverReceipt==nil)
  x.ack(fresh);x.event("MAIL_INBOX_UPDATE")
  check("later identical mail needs and accepts its own signed durable ACK",x.deletes==2)
end
do
  local x=fixture();local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Twin Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Twin Sender",subject="Same",body="!verify "..code,money=500},{sender="Twin Sender",subject="Same",body="!verify "..code,money=500}}
  x.event("MAIL_SHOW");local count=0;for _ in pairs(x.rows()) do count=count+1 end
  check("simultaneous indistinguishable mails remain held without invented UUIDs",count==0 and x.takes==0 and x.deletes==0)
end
do
  local x=fixture(true);x.incoming=900;x.tradeItems={{id=123,count=2,name="Trade Item"}}
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900;x.bags[123]=2
  x.event("UI_INFO_MESSAGE",1,"Trade complete.");x.v.Flush("sync")
  local receipts=x.e.OlympusVerifyDB.treasury.receipts;local count,row=0,nil
  for _,r in pairs(x.rows()) do if r.type=="donation" then count=count+1;row=r end end
  check("Treasury and Live share one original ID for a confirmed Gold-and-item trade",#receipts==1 and count==1 and row.id==receipts[1].id and #row.id==24)
  check("shared trade intake preserves item evidence before export",row and #row.donation.items==1 and row.donation.items[1].count==2 and row.donation.copper==900)
  local originalMac=receipts[1].mac;x.v.Flush("sync")
  check("generic mirror never replaces a claimed rich transfer or its original MAC",x.rows()[row.id]==row and receipts[1].mac==originalMac)
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900;x.bags[123]=4
  x.event("UI_INFO_MESSAGE",1,"Trade complete.");x.v.Flush("sync")
  receipts=x.e.OlympusVerifyDB.treasury.receipts
  count=0;for _,r in pairs(x.rows()) do if r.type=="donation" then count=count+1 end end
  check("equal genuine trades stay distinct through their Native-start sequence",#receipts==2 and count==2 and receipts[1].id~=receipts[2].id)
end
do
  local x=fixture(true);local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Gold Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Gold Sender",subject="!verify "..code,body="Gold and items",money=500,items={{id=321,count=3,name="Mail Item"}}}}
  x.event("MAIL_SHOW");x.inbox[1].money=0;x.inbox[1].items={};x.wallet=x.wallet+500;x.bags[321]=3
  x.event("MAIL_INBOX_UPDATE");x.event("PLAYER_MONEY");x.v.Flush("sync")
  local receipts=x.e.OlympusVerifyDB.treasury.receipts;local count,row=0,nil
  for _,r in pairs(x.rows()) do if r.type=="donation" then count=count+1;row=r end end
  check("code-mail Gold shares the original Take context instead of duplicating treasury rows",#receipts==1 and count==1 and row.id==receipts[1].id)
  check("shared code-mail body retains original Gold and item details",row and row.donation.copper==500 and #row.donation.items==1 and row.donation.items[1].count==3)
end
do
  local x=fixture(true)
  x.inbox={{sender="Manual Sender",subject="No verification code",body="Manual Gold",money=600,items={}}}
  x.event("MAIL_SHOW");x.e.TakeInboxMoney(1);x.inbox[1].money=0;x.wallet=x.wallet+600
  x.event("MAIL_INBOX_UPDATE");x.event("PLAYER_MONEY");x.v.Flush("sync")
  local receipts=x.e.OlympusVerifyDB.treasury.receipts;local count,row=0,nil
  for _,r in pairs(x.rows()) do if r.type=="donation" then count=count+1;row=r end end
  check("manual Take hook also shares its actual Treasury transfer context",#receipts==1 and count==1 and row.id==receipts[1].id and row.donation.copper==600)
end
-- .252 terminal ACK transport renewal retains original clocks; Native/cache
-- proof freshness is intentionally not renewed by this delivery-only path.
do
  for _,age in ipairs({86401,172801}) do
    local x=fixture();local observed=x.e.NOW-age
    local row=x.v.Queue({type="donation",character="Offline Donor",donation={copper=500}},"offline")
    local expires=observed+math.floor(age/86340)*86340+86400
    local r={id=row.id,status="done",character=row.character,guid="",discordRole="",observedAt=observed,expiresAt=expires}
    r.mac=x.e.OlympusHmac.hmacSha256hex(x.e.OlympusVerifyConfig.secret,table.concat({"intake242",r.id,r.status,"",x.e.OlympusHmac.normalizeCharacter(r.character),"",observed,expires},"|")):sub(1,32)
    x.e.OlympusQueue={intakeReceipts242={r}};x.v.Flush("sync")
    check("renewed terminal ACK accepted after "..age.." seconds with original timestamp",row.status=="done" and row.serverReceipt.observedAt==observed and row.serverReceipt.expiresAt==expires)
    check("renewed delivery ACK never certifies current verification",not x.v.VerificationReply(row.character):find("already verified",1,true))
  end
  local x=fixture();local row=x.v.Queue({type="donation",character="Bad Window",donation={copper=500}},"bad-window")
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
  check("body becoming readable on second pass holds without error or absence reset",okay and textReads>=2 and x.deletes==0 and x.rows()[old.id]==old)
  x.inbox={{sender="Unreadable Sender",subject="Loading",body=nil}};x.event("MAIL_INBOX_UPDATE")
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  check("unreadable counted mail cannot prove ambiguous content absent",x.deletes==0)
  x.inbox={};x.event("MAIL_INBOX_UPDATE");x.e.NOW=x.e.NOW+1
  x.inbox={mail()};x.event("MAIL_INBOX_UPDATE")
  local fresh;for _,r in pairs(x.rows()) do if r.type=="verify" and r.id~=old.id then fresh=r end end
  check("only complete readable absence starts a new unambiguous instance",fresh and fresh.observationId~=old.observationId and fresh.status=="pending" and x.deletes==0)
  x.ack(fresh);x.event("MAIL_INBOX_UPDATE")
  check("new post-absence instance requires its own durable ACK to delete",x.deletes==1)
end
-- .626 return protocol: actual codec/pump/collector HMAC acceptance and the
-- native sender boundary. Synthetic guild/receipt fixtures confer no real role.
local function wireMessages(x)
  x.addonMessages={};for _=1,120 do x.pump() end
  local out={};for _,message in ipairs(x.addonMessages) do if message[1]=="OLV242" then out[#out+1]=message[2] end end
  return out
end
local function deliver(x,messages,sender,distribution)
  for _,message in ipairs(messages) do x.event("CHAT_MSG_ADDON","OLV242",message,distribution or "WHISPER",sender) end
end
local function member626(secret)
  local x=fixture();x.nativeRows={{name="Fern Melder",guid="Player-1-1234ABCD",rank=1,online=true},{name="Bridge Member",guid="Player-1-11112222",rank=8,online=true}}
  x.e.OlympusVerifyAPI.TreasuryTransport.Name=function() return "Bridge Member" end
  x.e.UnitGUID=function(unit) return unit=="player" and "Player-1-11112222" or "Player-1-9999ABCD" end
  x.e.GetGuildInfo=function() return "OLYMPUS PRIME","Member",8 end
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
local function pair626(secret,external)
  local member=member626(secret);local row
  if external then
    local source={id="external-626",type="verify",source="original-record",character="Bridge Member",guid="Player-1-11112222",code="ABC1234",requestedBy="Bridge Member"}
    if external=="OlympusDB" then member.e.OlympusDB.pendingRoleUpdates[source.id]=source
    else member.e.OlympusRecordDB={pendingRoleUpdates={[source.id]=source}} end
    member.v.Flush("sync");row=member.rows()[source.id]
  else row=member.v.Queue({type="verify",source="self-addon242",character="Bridge Member",guid="Player-1-11112222",code="ABC1234",bridgeUntrusted=true},"ack626") end
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
  deliver(m,ack,"Fern Melder")
  local d=m.e.OlympusVerifyDB.intake242;local original=d.deliveryReceipts242[row.id]
  check("configured fresh native collector settles the initiating secretless delivery",row.status=="done" and original and original.collectorReportedDeliveryOnly==true and original.collectorGuid=="Player-1-1234ABCD")
  check("collector delivery never fabricates server receipt, role cache or signed ACK authority",row.serverReceipt==nil and d.acknowledgements[row.id]==nil and not (m.e.OlympusQueue and m.e.OlympusQueue.verificationResults242))
  check("returned delivery is never already-verified role status",not m.v.VerificationReply(row.character,row.guid):find("already verified",1,true))
  deliver(m,ack,"Fern Melder")
  check("two ACKs in one roster event use only one bounded native roster read",m.nativeReads==#m.nativeRows)
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
    elseif case=="not Officer" then m.nativeRows[1].rank=8
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
  local m,row,ack=pair626(false,true);local source=m.e.OlympusRecordDB.pendingRoleUpdates[row.id]
  deliver(m,ack,"Fern Melder")
  check("exact known original external map receives only its own terminal delivery",row.status=="done" and source.status=="done" and source.id=="external-626" and source.source=="original-record")
  local n,original,badAck=pair626(false,true);local changed=n.e.OlympusRecordDB.pendingRoleUpdates[original.id];changed.code="ZZZ9999"
  deliver(n,badAck,"Fern Melder")
  check("changed external body remains unsupported callback without rewriting it",original.status=="pending" and changed.code=="ZZZ9999" and n.v.Status().unsupportedCallbacks==1)
  n.v.Flush("sync");check("unsupported callback does not cause endless retransmission",#wireMessages(n)==0)
  local o,own,ownAck=pair626(false,"OlympusDB");local original=o.e.OlympusDB.pendingRoleUpdates[own.id]
  deliver(o,ownAck,"Fern Melder")
  check("actual matching OlympusDB consumer receives its same-ID delivery only",own.status=="done" and original.status=="done" and original.source=="original-record" and own.serverReceipt==nil)
end
do
  local m=member626(false);local row=m.v.Queue({type="verify",source="self-addon242",character="Bridge Member",guid="Player-1-11112222",code="ABC1234",bridgeUntrusted=true},"unknown626")
  m.v.Flush("sync");local request=wireMessages(m);local collector=fixture();deliver(collector,request,"Bridge Member")
  local original=collector.rows()[row.id];collector.ack(original,"unknown");collector.v.Flush("sync")
  check("unknown or nonterminal collector outcome never produces an ACK",#wireMessages(collector)==0 and row.status=="pending" and original.status=="pending")
end
do
  -- Explicit synthetic retained .625 SavedVariables, not a rewritten module or
  -- a regenerated server receipt. Exercise recovery through the actual codec.
  local m=member626(false)
  local row=m.v.Queue({type="verify",source="self-addon242",character="Bridge Member",guid="Player-1-11112222",code="ABC1234",bridgeUntrusted=true},"retained625")
  row.clientVersion="0.6.25"
  local _,collector,_,request=completedBridge626(m,row)
  local d=collector.e.OlympusVerifyDB.intake242;local retained=d.entries[row.id]
  retained.clientVersion="0.6.25";d.bridgeReturns242[row.id]=nil;collector.e.NOW=collector.e.NOW+3
  local receipt=retained.serverReceipt;local originalClock=retained.requestedAt
  deliver(collector,request,"Bridge Member");local ack=wireMessages(collector)
  check("pre626 exact native bridge row recovers only its missing return route",#ack==1 and d.entries[row.id]==retained and retained.serverReceipt==receipt and retained.requestedAt==originalClock and d.bridgeReturns242[row.id].legacy625SourceRecovered==true)
  deliver(m,ack,"Fern Melder");check("recovered legacy route settles delivery without retrying the retained effect",row.status=="done" and row.serverReceipt==nil)
  d.bridgeReturns242[row.id]=nil;retained.bridgeSender="Other Member";collector.e.NOW=collector.e.NOW+3
  deliver(collector,request,"Bridge Member")
  check("unprovable pre626 native sender remains explicit unsupported callback",d.deliveryFailures242[row.id]=="unsupported_callback" and #wireMessages(collector)==0 and d.entries[row.id]==retained)
end
do
  local m=member626(true);m.e.GetGuildInfo=function() return "OLYMPUS PRIME","Officer",1 end
  local code=m.e.OlympusHmac.codeFor(m.e.OlympusVerifyConfig.secret,"Mail Sender",m.e.OlympusHmac.utcDay(m.e.NOW))
  m.inbox={{sender="Mail Sender",subject="Return boundary",body="!verify "..code}}
  m.event("MAIL_SHOW");local row;for _,r in pairs(m.rows()) do if r.type=="verify" then row=r end end
  m.e.OlympusVerifyConfig.secret=nil;m.e.GetGuildInfo=function() return "OLYMPUS PRIME","Member",8 end
  local ack=completedBridge626(m,row);deliver(m,ack,"Fern Melder");m.event("MAIL_INBOX_UPDATE")
  check("collector-reported delivery cannot satisfy signed mail-deletion authority",row.status=="done" and row.serverReceipt==nil and m.deletes==0)
end
-- .627 persistent transfer custody and fresh explicit self-command observation.
local function reloadLive627(x)
  local before=#x.frames
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),x.e)("OlympusVerify")
  x.v=x.e.OlympusVerifyLive242;x.frame=x.frames[before+1]
  x.event("PLAYER_LOGIN")
end
local function pendingTrade627(x,itemsReady)
  x.incoming=900;x.tradeItems={{id=123,count=2,name="Pending Item"}}
  x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+900
  if itemsReady then x.bags[123]=2 end
  x.event("UI_INFO_MESSAGE",1,"Trade complete.")
end
local function pendingMail627(x,itemsReady)
  local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Durable Sender",h.utcDay(x.e.NOW))
  x.inbox={{sender="Durable Sender",subject="!verify "..code,body="Original payment note",money=500,items={{id=321,count=3,name="Pending Mail Item"}}}}
  x.event("MAIL_SHOW");x.inbox[1].money=0;x.inbox[1].items={};x.wallet=x.wallet+500
  if itemsReady then x.bags[321]=3 end
  x.event("MAIL_INBOX_UPDATE");x.event("PLAYER_MONEY")
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
  check("transport retries preserve the original new command ID and proof clock",m.rows()[id]==second and second.observationId==observation and second.observedAt==m.e.NOW)
end
do
  local x=fixture(true);local originalClaim=x.e.OlympusVerifyTreasury.ClaimTradeIntake242;local savedBeforeClaim=false
  x.e.OlympusVerifyTreasury.ClaimTradeIntake242=function()
    local id=x.e.OlympusVerifyTreasury.TradeTransferId627();local p=x.e.OlympusVerifyDB.intake242.tradeCollection242
    savedBeforeClaim=p and p.transferId==id and p.contextVersion==1 and p.ownGuid==x.e.UnitGUID("player") and not (x.e.OlympusVerifyDB.treasury.liveIntakeOwners242 and x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id])
    return originalClaim()
  end
  pendingTrade627(x,false)
  local first=x.e.OlympusVerifyDB.intake242.tradeCollection242;local id=first.transferId
  check("full native trade context is persisted before exclusive Treasury claim",savedBeforeClaim and x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id]==true and first.moneyConfirmed==true and first.itemsConfirmed~=true)
  x.incoming=500;x.tradeItems={};x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.wallet=x.wallet+500;x.event("UI_INFO_MESSAGE",1,"Trade complete.")
  local held=x.e.OlympusVerifyDB.intake242.heldTransfers627[id]
  check("a new trade cannot overwrite an older claimed item-proof-pending transfer",held and held.context.transferId==id and held.context.items[1].itemId==123 and x.rows()[id]==nil)
end
do
  local x=fixture(true);pendingTrade627(x,false)
  local saved=x.e.OlympusVerifyDB.intake242.tradeCollection242;local id=saved.transferId;local at=saved.completedAt
  x.e.NOW=x.e.NOW+5;reloadLive627(x);x.bags[123]=2;x.event("BAG_UPDATE_DELAYED")
  local restored=x.e.OlympusVerifyDB.intake242.tradeCollection242
  check("reload retains the same unproved trade as held, not a new body or credit",restored and restored.transferId==id and restored.completedAt==at and restored.restored==true and x.rows()[id]==nil and x.v.Status().heldTransfers>0)
end
do
  local x=fixture(true);local queue=x.v.Queue
  x.v.Queue=function(row,key) if row.type=="donation" then return nil end;return queue(row,key) end
  pendingTrade627(x,true)
  local saved=x.e.OlympusVerifyDB.intake242.tradeCollection242;local id=saved.transferId;local at=saved.completedAt
  check("confirmed trade saves the exact export body before queue handoff",saved.exportBody and saved.exportBody.id==id and saved.moneyConfirmed==true and saved.itemsConfirmed==true)
  x.e.NOW=x.e.NOW+5;reloadLive627(x)
  local row=x.rows()[id]
  check("reload completes only the same already-proven trade ID/body/original clock",row and row.id==id and row.observedAt==at and row.requestedAt==at and row.donation.copper==900 and row.donation.items[1].count==2 and x.e.OlympusVerifyDB.intake242.tradeCollection242==nil)
  check("trade restoration never repeats native transfer, loot or deletion",#x.e.OlympusVerifyDB.treasury.receipts==1 and x.takes==0 and x.deletes==0)
end
do
  local x=fixture(true);local queue=x.v.Queue;local claim=x.e.OlympusVerifyTreasury.ClaimMailIntake242;local beforeClaim=false
  x.e.OlympusVerifyTreasury.ClaimMailIntake242=function(i)
    local p=x.e.OlympusVerifyDB.intake242.mailCollection242;local id=x.e.OlympusVerifyTreasury.MailTransferId627(i)
    beforeClaim=p and p.transferId==id and p.header.items[1].count==3 and p.body=="Original payment note"
    return claim(i)
  end
  x.v.Queue=function(row,key) if row.type=="donation" then return nil end;return queue(row,key) end
  pendingMail627(x,true)
  local saved=x.e.OlympusVerifyDB.intake242.mailCollection242;local id=saved.transferId;local at=saved.completedAt;local takes=x.takes
  check("mail custody and original value/items precede exclusive claim",beforeClaim and saved.exportBody and saved.inboxConfirmed==true and saved.itemsConfirmed==true and saved.moneyConfirmed==true)
  x.e.NOW=x.e.NOW+5;reloadLive627(x)
  local row=x.rows()[id]
  check("restored confirmed mail completes its original ID/body/note/clock",row and row.observedAt==at and row.donation.copper==500 and row.donation.items[1].count==3 and row.donation.note=="Original payment note" and x.e.OlympusVerifyDB.intake242.mailCollection242==nil)
  check("mail restore never repeats Take/Delete or supplies automatic tithe credit",x.takes==takes and x.deletes==0 and row and row.evidence.automaticCredit==false)
end
-- Upgrade fixtures represent captured0.6.28 SavedVariables before any Watcher
-- attempt. Exercise actual native capture, interrupted handoff and current reload;
-- never transform runtime source or rewrite an already-attempted original.
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
do
  local x=fixture()
  local old=x.v.Queue({type="donation",character="Original Donor",clientVersion="0.6.28"},"prior-version")
  local fresh=x.v.Queue({type="donation",character="New Donor"},"current-version")
  check("queue preserves a supplied original client version",old.clientVersion=="0.6.28")
  check("only new unversioned rows receive the current client version",fresh.clientVersion=="0.6.29")
end
for _,kind in ipairs({"trade","mail"}) do
  local x=fixture(true);local queue=x.v.Queue
  x.v.Queue=function(row,key) if row.type=="donation" then return nil end;return queue(row,key) end
  if kind=="trade" then pendingTrade627(x,true) else pendingMail627(x,true) end
  local d=x.e.OlympusVerifyDB.intake242
  local field=kind=="trade" and "tradeCollection242" or "mailCollection242"
  local saved=d[field];assert(saved and saved.exportBody,"captured confirmed transfer required")
  saved.exportBody.clientVersion="0.6.28"
  local original,context=copy268(saved.exportBody),copy268(saved)
  local id=saved.transferId;local takes,deletes=x.takes,x.deletes
  local receipt=x.e.OlympusVerifyDB.treasury.receipts[1];local nativeReceipt=copy268(receipt)
  local nativeClaim=x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id]
  x.e.NOW=x.e.NOW+5;reloadLive627(x)
  local row=x.rows()[id];local payload=copy268(row);if payload then payload.status=nil end
  check(kind.." upgrade restores the exact original ID and0.6.28 export payload",row and row.id==id and row.clientVersion=="0.6.28" and same268(payload,original))
  check(kind.." upgrade keeps original note/items and capture clocks",row and same268(row.donation,original.donation)
    and row.observedAt==original.observedAt and row.requestedAt==original.requestedAt and row.requestedBy==original.requestedBy)
  check(kind.." upgrade leaves saved original custody unchanged",same268(saved,context) and d[field]==nil)
  check(kind.." upgrade preserves the exclusive native claim and receipt MAC",nativeClaim==true
    and x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id]==nativeClaim and same268(receipt,nativeReceipt)
    and #x.e.OlympusVerifyDB.treasury.receipts==1)
  x.event("BAG_UPDATE_DELAYED");x.event("PLAYER_MONEY");x.v.Flush("upgrade-recheck")
  check(kind.." upgrade never repeats Take/Delete or creates another donation",x.takes==takes and x.deletes==deletes
    and x.rows()[id]==row and same268((function()local r=copy268(row);if r then r.status=nil end;return r end)(),original)
    and #x.e.OlympusVerifyDB.treasury.receipts==1)
end
for _,kind in ipairs({"trade","mail"}) do
  for _,badBody in ipairs({true,42,false}) do
    local x=fixture(true);local queue=x.v.Queue
    x.v.Queue=function(row,key) if row.type=="donation" then return nil end;return queue(row,key) end
    if kind=="trade" then pendingTrade627(x,true) else pendingMail627(x,true) end
    local d=x.e.OlympusVerifyDB.intake242
    local field=kind=="trade" and "tradeCollection242" or "mailCollection242"
    local saved=d[field];local id=saved.transferId;local takes,deletes=x.takes,x.deletes
    saved.exportBody=badBody
    local ok=pcall(reloadLive627,x);local held=d[field]
    check(kind.." non-table saved body ("..type(badBody)..") is held without a reload exception",
      ok and held and held.transferId==id and held.exportBody==badBody and held.heldReason=="saved_transfer_body_unproved")
    check(kind.." malformed-body hold never repeats native actions or queues credit",
      x.takes==takes and x.deletes==deletes and x.rows()[id]==nil
      and #x.e.OlympusVerifyDB.treasury.receipts==1 and x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id]==true)
  end
end
do
  local x=fixture(true);pendingMail627(x,false)
  local saved=x.e.OlympusVerifyDB.intake242.mailCollection242;local id=saved.transferId;local takes=x.takes
  reloadLive627(x);x.bags[321]=3;x.event("BAG_UPDATE_DELAYED")
  local p=x.e.OlympusVerifyDB.intake242.mailCollection242
  check("unproved restored mail remains held under its original ID without retrying loot",p and p.transferId==id and p.restored==true and p.itemsConfirmed~=true and x.rows()[id]==nil and x.takes==takes and x.deletes==0)
end
do
  local x=fixture(true);pendingTrade627(x,false)
  local d=x.e.OlympusVerifyDB.intake242;local id=d.tradeCollection242.transferId
  d.heldTransfers627={};for i=1,1000 do d.heldTransfers627["retained-"..i]={context={original=i},reason="synthetic retained original"} end
  reloadLive627(x);x.event("TRADE_SHOW");x.event("TRADE_ACCEPT_UPDATE",1,1);x.event("UI_INFO_MESSAGE",1,"Trade complete.")
  local n=0;for _ in pairs(d.heldTransfers627) do n=n+1 end
  check("retained-context capacity visibly refuses new intake without dropping originals",n==1000 and x.v.Status().transferCapacityHeld==true and d.tradeCollection242.transferId==id and x.e.OlympusVerifyDB.treasury.liveIntakeOwners242[id]==true and x.rows()[id]==nil)
end
print(string.format("live242: %d passed, %d failed",passed,failed))
if failed>0 then error("live242 post-deploy checks failed: "..table.concat(failureLabels," | ")) end

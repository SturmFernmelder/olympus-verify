-- The runner prepends the actual existing isolated Live and core fixture factories.
local originalFixture=fixture
fixture=function(...) local x=originalFixture(...);x.e.NOW=LIVE280_NOW;return x end
local results={}
local pipelineRow
local function check(label,yes) results[#results+1]={name=label,pass=yes==true};print((yes and "PASS " or "FAIL ")..label) end
local function count(t) local n=0;for _ in pairs(t or {}) do n=n+1 end;return n end
local function copy(v) if type(v)~="table" then return v end;local out={};for k,x in pairs(v) do out[k]=copy(x) end;return out end
local function pack(v)
 if type(v)=="string" then return "s"..#v..":"..v end
 if type(v)=="number" then local s=tostring(v);return "n"..#s..":"..s end
 if type(v)=="boolean" then return v and "b1" or "b0" end
 local keys,parts={},{};for k in pairs(v) do keys[#keys+1]=k end;table.sort(keys,function(a,b)return tostring(a)<tostring(b) end)
 for _,k in ipairs(keys) do parts[#parts+1]=pack(k);parts[#parts+1]=pack(v[k]) end
 return "t"..#keys..":"..table.concat(parts)
end
local function bodyHash(x,row) local b={};for k,v in pairs(row) do if k~="status" and k~="acknowledgedAt" and k~="outcome" and k~="attempts" and k~="serverReceipt" then b[k]=v end end;return x.e.OlympusHmac.sha256hex(pack(b)) end
local function senderKey(name,realm)
 local base,suffix=name:match("^(.-)%-(.+)$");base=base or name;suffix=suffix or realm
 base=base:gsub(" +"," "):gsub("^ ",""):gsub(" $",""):gsub("%u",string.lower)
 suffix=suffix:gsub(" ",""):gsub("%u",string.lower)
 return #base..":"..base..#suffix..":"..suffix
end
local function selfID(x,name,observation) local k=senderKey(name,"Native Realm");return x.e.OlympusHmac.sha256hex("olympus-self-request243|"..#k..":"..k..#observation..":"..observation):sub(1,32) end
local function emit(receiver,row,name)
 local raw=pack(row);local n=math.ceil(#raw/170)
 for i=1,n do receiver.event("CHAT_MSG_ADDON","OLV242",row.id..":"..i..":"..n..":"..raw:sub((i-1)*170+1,i*170),"WHISPER",name) end
end
local function member(name)
 local x=fixture();x.name=name;x.nativeGuid="Player-1-9999ABCD"
 x.e.OlympusVerifyAPI.TreasuryTransport.Name=function() return x.name end
 x.e.GetUnitName=function(unit)return unit=="player" and x.name or "Fern Melder" end
 x.e.UnitGUID=function(unit)return unit=="player" and x.nativeGuid or "Player-1-1234ABCD" end
 x.e.GetGuildInfo=function()return "OLYMPUS PRIME","Member",8 end
 x.e.GetNumGuildMembers=function()return 1 end
 x.e.GetGuildRosterInfo=function()return "Fern Melder","Officer",1,60,nil,nil,nil,nil,true,nil,nil,nil,nil,nil,nil,nil,"Player-1-1234ABCD" end
 x.event("GUILD_ROSTER_UPDATE");return x
end
local function drain(sender,receiver)
 for i=1,60 do sender.pump() end
 for _,m in ipairs(sender.addonMessages) do if m[1]=="OLV242" then receiver.event("CHAT_MSG_ADDON",m[1],m[2],m[3],sender.name or sender.e.OlympusVerifyAPI.TreasuryTransport.Name()) end end
 sender.addonMessages={}
end
do
 local x=fixture();x.e.OlympusVerifyConfig.readMail=false;x.inbox={{sender="Mail Sender",subject="!verify ABC234",body="PRIVATE_BODY",money=0}}
 local reads=0;x.e.GetInboxText=function()reads=reads+1;return "PRIVATE_BODY" end
 x.event("MAIL_SHOW");x.event("MAIL_INBOX_UPDATE")
 check("readMail=false yields zero native body reads or verification captures",reads==0 and count(x.rows())==0)
 local y=member("Ordinary Member");local seen=0;y.inbox=x.inbox;y.e.GetInboxText=function()seen=seen+1;return "PRIVATE_BODY" end
 y.event("MAIL_SHOW");check("ordinary member has no authorized mailbox-reading purpose",seen==0 and count(y.rows())==0)
end
do
 local x=fixture();local checks,reads=0,0;local original=x.e.OlympusHmac.checkCode
 x.e.OlympusHmac.checkCode=function(...)checks=checks+1;return original(...) end
 x.e.GetInboxText=function(i)reads=reads+1;return x.inbox[i].body end
 for i=1,50 do x.inbox[i]={sender="Prose Sender "..i,subject="Greetings",body=string.rep("SAMPLE ",71),money=0} end
 x.event("MAIL_SHOW");check("50 ordinary prose mails run zero per-word HMAC checks",checks==0 and count(x.rows())==0)
 check("qualified scan reads each of50 bodies at most once",reads<=50)
 local h=x.e.OlympusHmac;local code=h.codeFor(x.e.OlympusVerifyConfig.secret,"Mail Sender",h.utcDay(x.e.NOW))
 x.inbox={{sender="Mail Sender",subject="!verify "..code,body="Verification only",money=0}};x.event("MAIL_INBOX_UPDATE")
 local row;for _,r in pairs(x.rows()) do row=r end
 check("explicit mail marker retains original native fingerprint and proof",row and row.mailProof242 and row.code==code and #row.mailProof242.mac==32)
 if row then x.ack(row);x.event("MAIL_INBOX_UPDATE") end
 check("even acknowledged valid verification mail is never taken or deleted automatically",x.takes==0 and x.deletes==0)
 local y=fixture();local attempts=0;local verify=y.e.OlympusHmac.checkCode
 y.e.OlympusHmac.checkCode=function(...)attempts=attempts+1;return verify(...) end
 y.inbox={{sender="Ordinary Sender",subject="THANKS",body="Ordinary correspondence",money=0}}
 y.event("MAIL_SHOW");y.event("MAIL_INBOX_UPDATE");y.event("MAIL_INBOX_UPDATE")
 check("code-shaped ordinary subject is checked once and never captured as verification",attempts==1 and count(y.rows())==0)
end
do
 local x=fixture();local old={id="old-foreign",type="verify",source="whisper",character="Old Member",code="ABC234",status="pending",proof="OLD_UNKNOWN"}
 x.e.OlympusDB.pendingRoleUpdates[old.id]=copy(old);x.e.OlympusRecordDB={pendingRoleUpdates={[old.id]=copy(old)}}
 local row=x.v.Queue({type="verify",source="whisper",character="Native Member",code="ABC234"},"new-owned")
 if row then x.ack(row);x.v.Flush("sync") end
 local registered={};x.e.C_ChatInfo.RegisterAddonMessagePrefix=function(p)registered[p]=true end;x.event("PLAYER_LOGIN")
 x.event("CHAT_MSG_ADDON","OLYMPUS","PEND~old-foreign","GUILD","Other Member")
 check("owned capture/proof/ACK does not create foreign addon mirror rows",count(x.e.OlympusDB.pendingRoleUpdates)==1 and pack(x.e.OlympusDB.pendingRoleUpdates[old.id])==pack(old))
 check("old foreign originals remain unmodified and are not imported",pack(x.e.OlympusRecordDB.pendingRoleUpdates[old.id])==pack(old) and x.rows()[old.id]==nil)
 local foreignTraffic=false;for _,m in ipairs(x.addonMessages) do if m[1]=="OLYMPUS" then foreignTraffic=true end end
 check("dedicated transport neither registers nor announces on OLYMPUS prefix",not registered.OLYMPUS and not foreignTraffic)
end
do
 local x=member("Paste Member")
 local a=x.v.QueueSelf("  ABC234  ");local b=x.v.QueueSelf("!verify ABC234");local c=x.v.QueueSelf("/w Fern Melder !verify ABC234")
 check("QueueSelf-only parser accepts bare whitespace marker and exact taught whisper command",a and b and c and count(x.rows())==3)
 local before=count(x.rows());local bad={"/w Wrong Person !verify ABC234","!verify ABC234 extra","ABC234 ABC234","/w Fern Melder !verify ABC234\n/run bad",string.rep("A",257)}
 for _,s in ipairs(bad) do x.v.QueueSelf(s) end
 check("convenience parser rejects wrong target prose multiple codes and overlong input",count(x.rows())==before)
 local fresh;for _,r in pairs(x.rows()) do fresh=r end
 check("new self request ID is bound to full native sender+realm and original observation",fresh and fresh.source=="self-addon243" and fresh.id==selfID(x,x.name,fresh.observationId))
 x.e.OlympusVerifyAPI.Version=function()return "0.6.37" end
 local n=x.v.Queue({type="verify",source="whisper",character="Version Member",code="ABC234"},"version")
 local kept=x.v.Queue({type="verify",source="whisper",character="Version Member",code="ABC234",clientVersion="0.6.25"},"version-old")
 check("browser119 metadata seam and explicit original version are preserved",n and n.clientVersion=="0.6.37" and kept.clientVersion=="0.6.25")
end
do
 local x=fixture();local first=x.v.Queue({id=string.rep("a",32),type="verify",source="whisper",character="Original Member",code="ABC234"},"original")
 local frozen=pack(first)
 for i=1,4100 do x.v.Queue({id=string.format("%032x",i),type="verify",source="whisper",character="Member "..i,code="ABC234"},"bulk|"..i) end
 check("prospective original store cap4096 never evicts or rewrites original",count(x.rows())==4096 and pack(first)==frozen)
 local y=fixture();local d=y.e.OlympusVerifyDB.intake242;d.observations={};for i=1,4096 do d.observations[tostring(i)]={id=tostring(i),observedAt=y.e.NOW} end
 local hashes=0;local real=y.e.OlympusHmac.sha256hex;y.e.OlympusHmac.sha256hex=function(...)hashes=hashes+1;return real(...) end
 check("full auxiliary observation store holds before hashing or storage",y.v.NewVerificationObservation("self-command","New Member","Player-1-AAA")==nil and hashes==0 and count(d.observations)==4096)
 local malformed=member("Held Member");malformed.e.OlympusVerifyDB.intake242=false
 local safe,accepted=pcall(malformed.v.QueueSelf,"ABC234")
 check("malformed retained custody is held rather than replaced with an empty ledger",safe and not accepted and malformed.e.OlympusVerifyDB.intake242==false)
 local row=fixture();local id=string.rep("d",32);row.rows()[id]=false
 local existing=row.v.Queue({id=id,type="verify",source="whisper",character="Held Member",code="ABC234"},"held-original")
 check("an unreadable retained id cannot be overwritten by a new body",existing==nil and row.rows()[id]==false)
end
do
 local receiver=fixture();local proofCalls=0;receiver.e.OlympusVerifyAPI.NativeBridgeMembership242=function()proofCalls=proofCalls+1 end
 for i=1,17 do local o=string.format("%032x",i);local name="Repeated Sender";emit(receiver,{id=selfID(receiver,name,o),type="verify",source="self-addon243",character=name,requestedBy=name,guid="Player-1-9999ABCD",code="ABC234",observationId=o,observedAt=receiver.e.NOW,requestedAt=receiver.e.NOW,realm="Native Realm",guidSource="UnitGUID-player",status="pending",bridgeUntrusted=true},name) end
 check("remote sender active cap16 rejects overflow before native proof admission",count(receiver.rows())==16 and proofCalls==16)
end
do
 local receiver=fixture();local sender=member("Native Sender 1");local validIDs=true
 for i=1,1000 do
  sender.name="Native Sender "..i;sender.nativeGuid="Player-1-"..string.format("%08X",i+65536)
  sender.v.QueueSelf("ABC234");local own
  for _,r in pairs(sender.rows()) do if r.character==sender.name then own=r end end
  if not own or own.id~=selfID(sender,sender.name,own.observationId) then validIDs=false end
  drain(sender,receiver)
 end
 check("1000 genuine distinct sender factory packets fit bounded collector admission",count(receiver.rows())==1000 and validIDs)
 local victim=member("Victim Member");victim.v.QueueSelf("ABC234");local original;for _,r in pairs(victim.rows()) do original=r end
 local forged=copy(original);forged.character="Attacker Member";forged.requestedBy="Attacker Member"
 local guard=fixture();emit(guard,forged,"Attacker Member")
 check("attacker-chosen victim id is refused before acquiring its durable slot",guard.rows()[original.id]==nil)
 drain(victim,guard)
 check("victim genuine factory row is admitted after same-id spoof refusal",guard.rows()[original.id] and guard.rows()[original.id].character=="Victim Member")
 local other=copy(original);other.character="Victim Member-OtherRealm";other.requestedBy=other.character;other.realm="OtherRealm";other.id=selfID(guard,other.character,other.observationId)
 emit(guard,other,other.character)
 check("same base on a different explicit realm has a separate correlation id",other.id~=original.id and guard.rows()[other.id]~=nil)
end
do
 local sender=member("Callback Member");local receiver=fixture();sender.v.QueueSelf("ABC234");drain(sender,receiver)
 local original,row;for _,r in pairs(sender.rows()) do original=r end;for _,r in pairs(receiver.rows()) do row=r end
 if row then
  receiver.ack(row);receiver.v.Flush("sync");for i=1,60 do receiver.pump() end
  for _,m in ipairs(receiver.addonMessages) do sender.event("CHAT_MSG_ADDON",m[1],m[2],m[3],"Fern Melder-OtherRealm") end
  check("new self243 callback rejects same-base collector from another realm",original.status=="pending")
  for _,m in ipairs(receiver.addonMessages) do sender.event("CHAT_MSG_ADDON",m[1],m[2],m[3],"Fern Melder") end
 end
 check("current exact source callback marks only original delivery terminal",original and original.status=="done")
 check("terminal bridge callback never asserts current Discord verification",original and not sender.v.VerificationReply(original.character,original.guid):find("already verified",1,true))
 local x=member("Unknown Delivery");x.v.QueueSelf("ABC234");for i=1,60 do x.pump() end
 local messages=#x.addonMessages;local before=pack(x.rows());x.v.Flush("sync");x.event("PLAYER_LOGIN");for i=1,60 do x.pump() end
 check("possibly sent request is never automatically requeued at Flush or login",#x.addonMessages==messages and pack(x.rows())==before)
end
do
 local x=member("Realm Member-NativeRealm")
 check("native realm spaces and explicit native suffix agree without dropping realm",x.v.QueueSelf("ABC234"))
 local y=member("Realm Member-OtherRealm")
 check("own native suffix inconsistent with current realm holds before observation storage",not y.v.QueueSelf("ABC234") and count(y.e.OlympusVerifyDB.intake242.observations)==0)
 local held=true
 for _,name in ipairs({"Realm Member--NativeRealm","Realm Member-First-Second","Realm Member-","Realm Member|NativeRealm"}) do local z=member(name);if z.v.QueueSelf("ABC234") then held=false end end
 check("ambiguous native sender delimiters are refused rather than reinterpreted",held)
 local sender=member("Remote Sender");local receiver=fixture();sender.v.QueueSelf("ABC234");drain(sender,receiver)
 for _,r in pairs(receiver.rows()) do pipelineRow=copy(r) end
 check("actual new producer receiver packet keeps no invented membership proof",pipelineRow and pipelineRow.source=="addon-bridge242" and pipelineRow.bridgeSender=="Remote Sender" and pipelineRow.nativeMembership==nil)
 local d=receiver.e.OlympusVerifyDB.intake242
 local before=pack(pipelineRow);local sourceBody
 for _,r in pairs(sender.rows()) do sourceBody=r end
 local proofCalls=0;receiver.e.OlympusVerifyAPI.NativeBridgeMembership242=function()proofCalls=proofCalls+1 end
 emit(receiver,sourceBody,sender.name)
 check("known exact pending packet is callback-only and never mints another proof",proofCalls==0 and pack(d.entries[sourceBody.id])==before)
 local legacy=fixture();local old={id=string.rep("e",32),type="verify",source="self-addon242",character="Legacy Member",requestedBy="Legacy Member",guid="Player-1-EEEEAAAA",code="ABC234",requestedAt=legacy.e.NOW,observedAt=legacy.e.NOW,status="pending",bridgeUntrusted=true,clientVersion="0.6.25"}
 local stored=copy(old);stored.source="addon-bridge242";stored.bridgeSender="Legacy Member"
 legacy.rows()[old.id]=stored;legacy.ack(stored);legacy.v.Flush("sync");local frozen=pack(stored)
 local minted=0;legacy.e.OlympusVerifyAPI.NativeBridgeMembership242=function()minted=minted+1 end
 emit(legacy,old,"Legacy Member");for i=1,60 do legacy.pump() end
 local callback=false;for _,m in ipairs(legacy.addonMessages) do if m[2]:sub(1,5)=="A626|" then callback=true end end
 check("retained exact625 route recovery returns terminal delivery only with unchanged original",callback and minted==0 and pack(stored)==frozen)
 local unowned=fixture();emit(unowned,old,"Legacy Member")
 check("unmatched old packet is held without creating a new original",count(unowned.rows())==0)
 local restarted=member("Unknown Delivery");local pending=member("Unknown Delivery");pending.v.QueueSelf("ABC234");for i=1,60 do pending.pump() end
 local preserved=copy(pending.e.OlympusVerifyDB.intake242);restarted.e.OlympusVerifyDB.intake242=preserved;restarted.addonMessages={}
 restarted.event("PLAYER_LOGIN");restarted.v.Flush("sync");for i=1,60 do restarted.pump() end
 check("restart never adopts serialized transport metadata for another send",#restarted.addonMessages==0 and pack(preserved.entries)==pack(pending.rows()))
end
do
 local c=coreFixture("ready",false);local e=c.e;e.OlympusLaunch229.Current=function() end
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),e)("OlympusVerify")
 local live;for _,f in ipairs(e.FRAMES) do if f~=e.OlympusVerifyFrame and f._events and f._events.MAIL_SHOW then live=f end end
 assert(live);live:GetScript("OnEvent")(live,"PLAYER_LOGIN")
 check("actual core registry installs valid Live slash keys",type(e.SlashCmdList.OLYMPUSVERIFYSELF)=="function" and e.SLASH_OLYMPUSVERIFYSELF1=="/olvverify")
 local handler=e.SlashCmdList.OLYMPUSVERIFYSELF;live:GetScript("OnEvent")(live,"PLAYER_LOGIN")
 check("repeated lifecycle keeps exact registered Live dispatcher",e.SlashCmdList.OLYMPUSVERIFYSELF==handler)
 local scans=0;e.OlympusVerifyLive242.ScanMailbox=function()scans=scans+1 end
 e.OlympusVerifyFrame:GetScript("OnEvent")(e.OlympusVerifyFrame,"MAIL_SHOW");live:GetScript("OnEvent")(live,"MAIL_SHOW")
 e.OlympusVerifyFrame:GetScript("OnEvent")(e.OlympusVerifyFrame,"MAIL_INBOX_UPDATE");live:GetScript("OnEvent")(live,"MAIL_INBOX_UPDATE")
 check("core+Live have one automatic mailbox scan owner per event",scans==2)
 local foreign=coreFixture("ready",false);local f=foreign.e;f.OlympusLaunch229.Current=function() end
 local owned=function()return "foreign" end;f.SlashCmdList.OLYMPUSVERIFYSELF=owned;f.SLASH_OLYMPUSVERIFYSELF1="/olvverify"
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),f)("OlympusVerify")
 for _,frame in ipairs(f.FRAMES) do if frame~=f.OlympusVerifyFrame and frame._events and frame._events.MAIL_SHOW then frame:GetScript("OnEvent")(frame,"PLAYER_LOGIN") end end
 check("Live aliases preserve foreign registry ownership on collision",f.SlashCmdList.OLYMPUSVERIFYSELF==owned and foreign.effects==0)
end
local passed=0;for _,r in ipairs(results) do if r.pass then passed=passed+1 end end
return {checks=#results,passed=passed,results=results,pipelineRow=pipelineRow,nativeAcceptance=false,providerCalls=0}

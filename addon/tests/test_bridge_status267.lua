-- Actual Live242 code, synthetic native APIs and synthetic receipts only.
local passed=0
local function check(name,value) assert(value,name);passed=passed+1;print("PASS "..name) end
local function fixture(member)
  local e=setmetatable({},{__index=_G});e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  local x={e=e,frames={},messages=0,me=member and "Self Member" or "Fern Melder"}
  local create=e.CreateFrame
  e.CreateFrame=function(...)local f=create(...);x.frames[#x.frames+1]=f;return f end
  e.NOW=1794312000;e.time=function()return e.NOW end
  e.OlympusVerifyConfig={secret="synthetic-status267-not-production"}
  e.OlympusVerifyDB={boots=1};e.OlympusDB={pendingRoleUpdates={}}
  e.GetGuildInfo=function()return "OLYMPUS PRIME",member and "Member" or "Officer",member and 8 or 1 end
  e.GetRealmName=function()return "Synthetic Native Realm" end;e.IsInGuild=function()return true end
  e.UnitGUID=function()return member and "Player-1-1111ABCD" or "Player-1-2222ABCD" end
  e.GetUnitName=function()return x.me end
  e.GetNumGuildMembers=function()return 2 end
  e.GetGuildRosterInfo=function(i)
    return i==1 and "Fern Melder" or "Self Member",nil,i==1 and 0 or 8,60,"Paladin",nil,nil,nil,true,nil,nil,nil,nil,nil,nil,nil,i==1 and "Player-1-2222ABCD" or "Player-1-1111ABCD"
  end
  e.C_Timer={After=function()end,NewTicker=function()return {}end}
  e.C_ChatInfo={RegisterAddonMessagePrefix=function()end,SendAddonMessage=function()x.messages=x.messages+1 end}
  e.OlympusVerifyAPI={TreasuryTransport={Name=function()return x.me end}}
  e.OlympusVerifyAutoSync={Request=function()end}
  e.OlympusBridge={RegisterSection=function(name,version,exporter)x.registration={name=name,version=version,exporter=exporter};return true end}
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLive242.lua")),e)("OlympusVerify")
  x.v=e.OlympusVerifyLive242;x.event=function(event,...)x.frames[1]:GetScript("OnEvent")(x.frames[1],event,...)end
  x.event("PLAYER_LOGIN")
  x.d=e.OlympusVerifyDB.intake242
  x.queue=function(at,character)
    return x.v.Queue({type="verify",character=character or x.me,guid=e.UnitGUID("player"),requestedAt=at or e.NOW,
      requestedBy=character or x.me,code="PRIVATE-CODE-CANARY",nativeMembership={mac="PRIVATE-MAC-CANARY"},donation={note="PRIVATE-NOTE-CANARY"}})
  end
  x.ack=function(row,status)
    local a={id=row.id,character=row.character,guid=row.guid,status=status,observedAt=e.NOW,expiresAt=e.NOW+300}
    a.mac=e.OlympusHmac.hmacSha256hex(e.OlympusVerifyConfig.secret,table.concat({"intake242",a.id,status,a.guid,e.OlympusHmac.normalizeCharacter(a.character),"",a.observedAt,a.expiresAt},"|")):sub(1,32)
    e.OlympusQueue={intakeReceipts242={a}};x.v.Flush("synthetic-status267");return a
  end
  return x
end
local function assertPublic(value)
  local forbidden={code=true,guid=true,character=true,requestedBy=true,nativeMembership=true,nativeDiscord=true,
    serverReceipt=true,mac=true,donation=true,note=true,collector=true,collectorGuid=true,proofId=true,nonce=true,row=true}
  local function visit(t)
    check("status is plain data",type(t)=="table" and getmetatable(t)==nil)
    for k,v in pairs(t)do
      assert(not forbidden[k],"private key escaped")
      if type(v)=="table"then visit(v)elseif type(v)=="string"then
        assert(not v:find("PRIVATE",1,true)and not v:find("Player-",1,true)and not v:find("Fern Melder",1,true),"private value escaped")
      else assert(type(v)=="number"or type(v)=="boolean","non-data value escaped")end
    end
  end
  visit(value)
end
do
  local x=fixture();local row=x.queue();local messages=x.messages
  local s=x.registration.exporter()
  check("actual registered verification section is version243",x.registration.name=="verification"and x.registration.version==243 and s.version==243)
  check("public bridge Status uses the same opaque stable projection",x.e.OlympusVerifyBridge242.Status().requests[1].id==s.requests[1].id and s.requests[1].id~=row.id and #s.requests[1].id==32)
  check("status explicitly has no membership or role authority",s.deliveryOnly==true and s.membershipProof==false and s.roleAuthority==false)
  check("new request is pending, without a role promise",s.requests[1].deliveryState=="pending")
  assertPublic(s)
  s.requests[1].deliveryState="edited"
  check("reads preserve immutable originals and issue no messages",row.code=="PRIVATE-CODE-CANARY"and row.status=="pending"and x.messages==messages)
  row.status="done"
  check("imported terminal status alone is unknown",x.v.BridgeStatus().requests[1].deliveryState=="unknown")
  row.status="pending";local ack=x.ack(row,"done")
  check("recognized server ACK means delivery only",x.v.BridgeStatus().requests[1].deliveryState=="delivered")
  ack.mac="invalid";x.d.acknowledgements[row.id].mac="invalid"
  check("tampered stored ACK is not delivered",x.v.BridgeStatus().requests[1].deliveryState=="unknown")
  row.status="pending";x.ack(row,"rejected")
  check("recognized rejection stays rejected",x.v.BridgeStatus().requests[1].deliveryState=="rejected")
end
do
  local x=fixture();for i=1,45 do x.queue(x.e.NOW-100+math.floor(i/2))end
  x.d.entries.malformed={id="not a valid intake id",type="verify",character=x.me,requestedAt=x.e.NOW,status="done"}
  x.d.entries.clock={id=string.rep("a",32),type="verify",character=x.me,requestedAt=0/0,status="pending"}
  local hashes=0;local originalHash=x.e.OlympusHmac.sha256hex
  x.e.OlympusHmac.sha256hex=function(...)hashes=hashes+1;return originalHash(...)end
  local s=x.v.BridgeStatus()
  check("retained backlog exports at most twenty rows",s.total==47 and #s.requests==20 and s.truncated==true)
  check("status display hashing is bounded by selected rows",hashes==20)
  local ordered=true;for i=2,#s.requests do local a,b=s.requests[i-1],s.requests[i];ordered=ordered and(a.requestedAt>b.requestedAt or a.requestedAt==b.requestedAt and a.id<b.id)end
  check("latest-first order has a deterministic ID tie-break",ordered)
  assertPublic(s)
  check("status does not discard retained malformed originals",x.d.entries.malformed.id=="not a valid intake id"and x.d.entries.clock.requestedAt~=x.d.entries.clock.requestedAt)
end
do
  local x=fixture(true);local own=x.queue();x.queue(nil,"Another Member")
  local s=x.v.BridgeStatus()
  check("non-officer projection keeps existing own-request visibility",s.total==1 and #s.requests==1 and s.requests[1].id~=own.id and #s.requests[1].id==32)
  x.d.deliveryFailures242={[own.id]="unsupported_callback"}
  check("unsupported callback remains visible as a hold",x.v.BridgeStatus().requests[1].deliveryState=="unsupported_callback")
end
do
  local x=fixture(true)
  check("existing QueueSelf boolean contract is retained",x.v.QueueSelf("ABCD234")==true)
  local row;for _,r in pairs(x.d.entries)do row=r end
  local sent=x.d.bridgeOutbound242[row.id];local h=x.e.OlympusHmac
  x.event("GUILD_ROSTER_UPDATE")
  local base=table.concat({"A626",row.id,sent.bodySHA256:sub(1,32),h.sha256hex("bridge-recipient626|"..h.normalizeCharacter(x.me)):sub(1,32),"D",x.e.NOW,x.e.NOW+300},"|")
  local wire=base.."|"..h.hmacSha256hex(x.e.OlympusVerifyConfig.secret,base):sub(1,32)
  x.event("CHAT_MSG_ADDON","OLV242",wire,"WHISPER","Fern Melder")
  local s=x.v.BridgeStatus()
  check("actual validated A626 handler supplies delivery-only status",row.status=="done"and s.requests[1].deliveryState=="delivered"and s.roleAuthority==false)
  assertPublic(s)
  row.code="changed original"
  check("delivery receipt cannot follow an edited original body",x.v.BridgeStatus().requests[1].deliveryState=="unknown")
end
do
  local x=fixture();local original=string.rep("a",24)
  local row=x.v.Queue({id=original,type="donation",character=x.me,guid=x.e.UnitGUID("player"),requestedAt=x.e.NOW,donation={note="PRIVATE-NOTE-CANARY"}})
  local s=x.v.BridgeStatus()
  check("existing24hex Treasury IDs remain visible through opaque projection",#s.requests==1 and #s.requests[1].id==32 and s.requests[1].type=="donation"and s.requests[1].deliveryState=="pending")
  x.ack(row,"done");s=x.v.BridgeStatus()
  check("recognized legacy receipt ACK preserves its original ID and delivery",row.id==original and x.d.entries[original]==row and s.requests[1].deliveryState=="delivered")
  assertPublic(s)
  local other=x.v.Queue({id="legacy:receipt.42",type="role",character=x.me,requestedAt=x.e.NOW+1,status="done"});other.status="done"
  s=x.v.BridgeStatus()
  check("other admitted ID families expose no raw identifier or invented delivery",#s.requests==2 and #s.requests[1].id==32 and s.requests[1].id~=other.id and s.requests[1].deliveryState=="unknown")
end
print("bridge_status267: "..passed.." passed, 0 failed")

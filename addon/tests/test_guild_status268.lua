-- Actual core/Guild display with synthetic native APIs and generated-list shapes.
-- No Config.lua, installed data, transport, messages or role actions are used.
local passed = 0
local function check(label, value) assert(value, label); passed=passed+1; print("PASS "..label) end
local function fixture(size)
  local e=setmetatable({}, {__index=_G}); e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  local f={e=e, now=1794400000, guild="OLYMPUS PRIME", realm="Synthetic Realm", reads=0}
  e.time=function() return f.now end
  e.GetGuildInfo=function() return f.guild,"Officer",1 end
  e.GetRealmName=function() return f.realm end
  e.IsInGuild=function() return true end
  e.OlympusVerifyConfig={membershipOnly=true,secret="synthetic-guild-status268",uiAutoShow=false}
  e.OlympusVerifyDB={}; e.OlympusQueue={version=1,entries={}}
  e.ROSTER={}
  for i=1,(size or 1) do
    e.ROSTER[i]={name=i==1 and "Dresden Goldshire" or string.format("Synthetic Member %04d",i),
      guid=string.format("Player-1-%08X",i),rank="Member",rankIndex=8,level=60,online=true}
  end
  local read=e.GetGuildRosterInfo
  e.GetGuildRosterInfo=function(i) f.reads=f.reads+1; return read(i) end
  e.SendChatMessage=function() error("unexpected whisper") end
  e.GuildInvite=function() error("unexpected invite") end
  e.GuildPromote=function() error("unexpected promotion") end
  e.GuildUninvite=function() error("unexpected removal") end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")),e)("OlympusVerify",{})
  e.OlympusVerifyFrame:GetScript("OnEvent")(e.OlympusVerifyFrame,"ADDON_LOADED","OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyGuild.lua")),e)("OlympusVerify",{})
  f.g=e.OlympusVerifyGuild; f.frame=e.FRAMES[#e.FRAMES]
  f.event=function(event,unit) f.frame:GetScript("OnEvent")(f.frame,event,unit) end
  f.event("PLAYER_LOGIN")
  f.install=function(version,age,fetchAge)
    local fetched,snapshot=f.now-(fetchAge or 0),f.now-(age or 0)
    local q={version=version or 1,guild=f.guild,realm=f.realm,
      verified={fetchedAt=fetched,snapshotAt=snapshot,members={}},
      unverified={fetchedAt=fetched,snapshotAt=snapshot,members={}}}
    for _,r in ipairs(e.ROSTER) do q.verified.members[#q.verified.members+1]={name=r.name,guid=r.guid,status="member"} end
    if version==2 then q.unknown={fetchedAt=fetched,snapshotAt=snapshot,members={}} end
    e.OlympusVerifyLists=q;f.q=q;f.event("GUILD_ROSTER_UPDATE");return q
  end
  f.status=function(i) local r=e.ROSTER[i or 1];return f.g.Verification(r.name.."-Forever",r.guid) end
  return f
end
do
  local f=fixture();f.install(1,0)
  check("fresh exact GUID remains a dated verified display",f.status().status=="verified" and not f.status().historicalLinked)
  local q=f.install(1,3601)
  local r=f.status()
  check("expired source stays refused by original admission",f.e.OlympusVerifyAPI.Roster.DisplaySource()==nil)
  check("past exact-GUID link is amber stale, never current verified",r.status=="stale" and r.label=="Linked (dated)" and r.historicalLinked==true)
  check("both original dates survive without renewal",r.at==q.verified.fetchedAt and r.snapshotAt==q.verified.snapshotAt)
  check("fresh fetch backed by old roster explains that specific cause",r.reason:find("even though the Watcher fetched",1,true)~=nil)
  check("dated link explicitly denies current access authority",r.reason:find("current verification and Discord access are unconfirmed",1,true)~=nil)
  check("stale link cannot open even an editable reminder",f.g.OpenWhisper(r.name,r.guid)==false)
  check("history read leaves the original source and dates intact",q==f.e.OlympusVerifyLists and q.verified.members[1].status=="member" and q.verified.snapshotAt==f.now-3601)
  f.install(1,7200,7200)
  check("old fetch is distinguished from only an old server roster",f.status().reason:find("loaded Watcher fetch and its server roster",1,true)~=nil)
end
do
  local f=fixture();local q=f.install(1,3601)
  q.verified.members[1].name="Earlier Name"
  check("a rename retains historical evidence only by exact native GUID",f.status().historicalLinked==true)
  q.verified.members[1].guid="Player-1-ABCDEF00";f.event("GUILD_ROSTER_UPDATE")
  check("reused name with another GUID inherits no link",not f.status().historicalLinked and f.status().status~="verified")
  q=f.install(1,3601);q.unverified.members[1]={name="Dresden Goldshire",guid=q.verified.members[1].guid,pending=false}
  check("paired duplicate GUID refuses historical inference",f.status().status=="unknown" and not f.status().historicalLinked)
  q=f.install(1,3601);q.unverified.members[1]={name="Dresden Goldshire",guid="Player-1-ABCDEF00",pending=false}
  check("positive and negative name conflict remains unknown",f.status().status=="unknown")
  q=f.install(1,3601);q.verified.members[3]={name="Sparse Entry",guid="Player-1-ABCDEF00",status="member"}
  check("sparse historical source is not silently truncated",f.status().status=="unknown")
  q=f.install(1,3601);q.realm="Another Realm"
  check("wrong realm never receives historical link metadata",f.status().status=="unknown" and not f.status().historicalLinked)
  q=f.install(1,3601);q.unverified.snapshotAt=q.unverified.snapshotAt-1
  check("mismatched original source dates remain unknown",f.status().status=="unknown")
  q=f.install(1,0);q.verified.fetchedAt=f.now+1;q.unverified.fetchedAt=f.now+1
  check("future source date cannot become historical proof",not f.status().historicalLinked and f.status().reason:find("future",1,true)~=nil)
  q=f.install(1,3601);q.verified.members={};q.unverified.members={{name="Dresden Goldshire",guid=f.e.ROSTER[1].guid,pending=false}}
  check("expired negative row stays stale rather than unverified",f.status().status=="stale" and not f.status().historicalLinked)
  check("expired negative row cannot open a reminder",f.g.OpenWhisper("Dresden Goldshire-Forever",f.e.ROSTER[1].guid)==false)
  f.e.OlympusVerifyLists=nil;f.event("GUILD_ROSTER_UPDATE")
  check("missing generated source is unknown, never unverified",f.status().status=="unknown")
end
do
  local f=fixture();local q=f.install(2,0)
  q.verified.members={};q.unknown.members={{name="Dresden Goldshire",guid=f.e.ROSTER[1].guid,reason="linked_before_cutoff"}}
  local r=f.status()
  check("server prior-link reason stays explicitly unknown",r.status=="unknown" and r.label=="Linked (prior record)" and r.historicalLinked==true)
  check("prior link keeps exact original dates",r.at==q.unknown.fetchedAt and r.snapshotAt==q.unknown.snapshotAt)
  check("prior link explains launch proof review without a role promise",r.reason:find("predates the current launch proof",1,true)~=nil)
  check("prior link never enables the unverified reminder",f.g.OpenWhisper("Dresden Goldshire-Forever",f.e.ROSTER[1].guid)==false)
  q.unknown.members[1].reason="link_review";f.event("GUILD_ROSTER_UPDATE")
  r=f.status();check("generic server review does not invent a historical verification",r.status=="unknown" and r.label=="Link needs review" and not r.historicalLinked)
  check("generic review explains unconfirmed account or identity checks without asserting a GUID link",
    r.reason:find("could not confirm a current link",1,true)~=nil and r.reason:find("account or identity checks need review",1,true)~=nil)
  q=f.install(2,3601);q.verified.members={};q.unknown.members={{name="Dresden Goldshire",guid=f.e.ROSTER[1].guid,reason="linked_before_cutoff"}}
  check("expired review row cannot become expired verified evidence",not f.status().historicalLinked and f.status().status=="stale")
  q=f.install(2,3601);q.unknown.members={{name="Other Name",guid=q.verified.members[1].guid,reason="link_review"}}
  check("historical v2 validates uniqueness across all three lists",f.status().status=="unknown")
  q=f.install(2,3601);q.unknown.members=nil
  check("missing v2 review array cannot admit historical evidence",not f.status().historicalLinked)
end
do
  local f=fixture(1000);f.install(1,3601)
  local normalizations=0;local normalize=f.e.OlympusHmac.normalizeCharacter
  f.e.OlympusHmac.normalizeCharacter=function(...) normalizations=normalizations+1;return normalize(...) end
  for i=1,1000 do assert(f.status(i).historicalLinked) end
  local firstReads,firstNormalizations=f.reads,normalizations
  for i=1,1000 do assert(f.status(i).historicalLinked) end
  check("one native roster scan covers repeated thousand-row refreshes",firstReads==1000 and f.reads==1000)
  check("historical rows are indexed once rather than once per displayed row",firstNormalizations<=3100 and normalizations-firstNormalizations<=1100)
  f.now=f.now+6;f.status()
  check("native and historical caches expire after five seconds",f.reads==2000 and normalizations-firstNormalizations>1000)
end
print("guild_status268: "..passed.." passed, 0 failed")

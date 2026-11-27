-- .235: real main/HMAC/PendingSync composition at full-roster scale.
-- Counters are the contract; no wall-time/FPS threshold or actual client data.
local passed, failed = 0, 0
local sourceRoot = "../OlympusVerify/"
local function check(name, yes)
  if yes then passed = passed + 1; print("PASS " .. name)
  else failed = failed + 1; print("FAIL " .. name) end
end
local function clone(v)
  if type(v) ~= "table" then return v end
  local out = {}; for k, value in pairs(v) do out[k] = clone(value) end; return out
end
local function fixture(size)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  local f = { e=e, size=size, wall=1794000000, clock=0, hashes=0, hashBytes=0, rosterReads=0, requests=0,
    reloads=0, invites=0, removals=0, promotions=0, notes=0, motds=0, whispers=0,
    guild="OLYMPUS PRIME", realm="Synthetic Realm", playerGuid=e.PLAYER_GUID }
  e.time=function() return f.wall end; e.GetTime=function() return f.clock end
  e.GetGuildInfo=function() return f.guild end; e.GetRealmName=function() return f.realm end
  e.UnitGUID=function(unit) if unit=="player" then return f.playerGuid end end
  e.GetGuildRosterShowOffline=function() return true end
  e.OlympusVerifyConfig={secret="synthetic-performance-test-only",membershipOnly=true,uiAutoShow=false}
  e.ROSTER={}
  for i=1,size do
    e.ROSTER[i]={name=i==1 and "Fern Melder" or string.format("Synthetic Member %04d",i),
      guid=i==1 and e.PLAYER_GUID or string.format("Player-1-%08X",i),
      rank=i==1 and "Guild Master" or "Member",rankIndex=i==1 and 0 or 8,
      level=60,classFile="WARRIOR",note="",onote="",online=true}
  end
  local roster=e.GetGuildRosterInfo
  e.GetGuildRosterInfo=function(i) f.rosterReads=f.rosterReads+1; return roster(i) end
  e.GetNumGuildMembers=function() return f.reportedTotal or #e.ROSTER, #e.ROSTER end
  e.ReloadUI=function() f.reloads=f.reloads+1 end
  e.SendChatMessage=function() f.whispers=f.whispers+1 end
  e.GuildInvite=function() f.invites=f.invites+1 end
  e.GuildUninvite=function() f.removals=f.removals+1 end
  e.GuildPromote=function() f.promotions=f.promotions+1 end
  e.GuildDemote=e.GuildPromote
  e.GuildRosterSetPublicNote=function() f.notes=f.notes+1 end
  e.GuildSetMOTD=function() f.motds=f.motds+1 end
  e.C_GuildInfo.Invite=e.GuildInvite; e.C_GuildInfo.Uninvite=e.GuildUninvite
  e.C_GuildInfo.Promote=e.GuildPromote; e.C_GuildInfo.Demote=e.GuildDemote
  e.C_GuildInfo.SetNote=e.GuildRosterSetPublicNote; e.C_GuildInfo.SetMOTD=e.GuildSetMOTD
  setfenv(assert(loadfile(sourceRoot.."Libs/OlympusHmac.lua")),e)("OlympusVerify")
  local sha=e.OlympusHmac.sha256hex
  e.OlympusHmac.sha256hex=function(text) f.hashes=f.hashes+1; f.hashBytes=f.hashBytes+#text; return sha(text) end
  setfenv(assert(loadfile(sourceRoot.."OlympusVerify.lua")),e)("OlympusVerify")
  local event=e.OlympusVerifyFrame:GetScript("OnEvent")
  event(e.OlympusVerifyFrame,"ADDON_LOADED","OlympusVerify")
  f.deliver=function()
    if f.changeOnReply then e.ROSTER[2].rank="Veteran";e.ROSTER[2].rankIndex=6;f.changeOnReply=false end
    event(e.OlympusVerifyFrame,"GUILD_ROSTER_UPDATE")
  end
  local request=e.C_GuildInfo.GuildRoster
  e.C_GuildInfo.GuildRoster=function()
    f.requests=f.requests+1;request()
    if f.responseMode=="sync" then f.deliver() end
  end
  e.OlympusVerifyAPI.ExportRoster() -- actual source creates the original synthetic native snapshot
  local first=e.OlympusVerifyAPI.AutoSyncFacts()
  assert(first and first.strict and type(first.digest)=="string", "SYNTHETIC_INITIAL_NATIVE_CAPTURE")
  e.OlympusVerifyDB.pendingSync233={sound=false,lastSyncedDigest=first.digest,lastSyncAt=f.wall}
  setfenv(assert(loadfile(sourceRoot.."OlympusVerifyAutoSync.lua")),e)()
  f.a=e.OlympusVerifyAutoSync; f.api=e.OlympusVerifyAPI; f.initial=first
  f.a.frame:GetScript("OnEvent")(f.a.frame,"PLAYER_LOGIN")
  f.a.frame:GetScript("OnEvent")(f.a.frame,"PLAYER_ENTERING_WORLD")
  f.advance=function(seconds) f.wall=f.wall+seconds; f.clock=f.clock+seconds end
  f.reset=function() f.hashes=0;f.hashBytes=0;f.rosterReads=0;f.requests=0 end
  f.facts=function() local ok,value=pcall(f.api.AutoSyncFacts);return ok and value or nil end
  f.noActions=function() return f.reloads==0 and f.invites==0 and f.removals==0 and f.promotions==0 and f.notes==0 and f.motds==0 and f.whispers==0 end
  return f
end

for _,size in ipairs({920,1000}) do
  local f=fixture(size);local old=f.e.OlympusVerifyDB.roster;local digest=f.initial.digest
  f.responseMode="sync";f.changeOnReply=true;f.reset()
  for _=1,11 do f.advance(5);f.a.Tick() end
  check(size.." periodic refresh makes no server request during5to55seconds",f.requests==0 and f.rosterReads==0 and f.hashes==0)
  f.advance(5);f.a.Tick()
  check(size.." sixty-second refresh issues exactly one native roster request",f.requests==1)
  check(size.." synchronous roster reply captures native rows exactly once",f.rosterReads>=size and f.rosterReads<=size+1 and f.e.OlympusVerifyDB.roster~=old)
  check(size.." synchronous reply invalidates exactly one digest",f.hashes==1 and f.facts() and f.facts().digest~=digest)
  check(size.." synchronous native rank change signals pending without actions",f.a.Status().pending and f.noActions())
end

do
  local f=fixture(920);local old=f.e.OlympusVerifyDB.roster;local at=old.exportedAt
  f.responseMode="async";f.changeOnReply=true;f.reset();f.advance(60);f.a.Tick()
  check("asynchronous request alone does not export or hash the old native cache",f.requests==1 and f.rosterReads==0 and f.hashes==0 and f.e.OlympusVerifyDB.roster==old and old.exportedAt==at)
  f.advance(5);f.a.Tick()
  check("awaiting an asynchronous reply causes no five-second request retry",f.requests==1 and f.e.OlympusVerifyDB.roster==old and not f.a.Status().pending)
  f.deliver()
  check("original asynchronous reply publishes the changed native snapshot",f.e.OlympusVerifyDB.roster~=old and f.e.OlympusVerifyDB.roster.exportedAt==f.wall and f.facts().digest~=f.initial.digest)
  check("original asynchronous reply hashes once and signals pending",f.hashes==1 and f.a.Status().pending and f.noActions())
  f.reset();f.a.Tick();check("tick after asynchronous publication reuses the accepted snapshot",f.requests==0 and f.rosterReads==0 and f.hashes==0)
end

do
  local f=fixture(920);local old=f.e.OlympusVerifyDB.roster;local at=old.exportedAt
  f.responseMode="none";f.reset()
  for _=1,25 do f.advance(5);f.a.Tick() end
  check("silent native server is polled only at60and120seconds",f.requests==2)
  check("silent native server cannot refresh cached snapshot timestamp",f.e.OlympusVerifyDB.roster==old and old.exportedAt==at and f.rosterReads==0 and f.hashes==0)
  check("no native reply lets old facts expire instead of freshening stale data",f.facts()==nil and not f.a.Status().pending and f.noActions())
end

for _,size in ipairs({920,1000}) do
  local f=fixture(size)
  check(size.." first accepted native snapshot is hashed once",f.hashes==1)
  f.reset()
  for _=1,10 do f.advance(5);f.a.Tick() end
  check(size.." unchanged five-second ticks never force native row export",f.rosterReads==0)
  check(size.." unchanged five-second ticks do not rehash full roster",f.hashes==0 and f.hashBytes==0)
  check(size.." unchanged synchronized digest does not invent new pending work",not f.a.Status().pending)
  check(size.." normal ticks dispatch no automatic native effect",f.noActions())
  f.e.ROSTER[2].note="updated note";f.e.ROSTER[2].level=59;f.e.ROSTER[2].online=false
  f.api.ExportRoster()
  check(size.." updated notes, levels and activity export without a membership reload prompt",
    f.facts().digest==f.initial.digest and not f.a.Status().pending and f.e.OlympusVerifyDB.roster.members[2].level==59)
  local old=f.facts();f.e.ROSTER[2].rank="Veteran";f.e.ROSTER[2].rankIndex=6
  f.reset();f.api.ExportRoster()
  local fresh=f.facts()
  check(size.." newly accepted native change invalidates one digest",fresh and old and fresh.digest~=old.digest and f.hashes==1)
  check(size.." native change requests hardware work without performing it",f.a.Status().pending and f.noActions())
  f.reset();f.advance(5);f.a.Tick();f.a.Tick()
  check(size.." repeated reads of new generation do not hash or export again",f.hashes==0 and f.rosterReads==0)
  -- A new accepted snapshot can occur in the same wall-clock second.
  f.e.ROSTER[2].rank="Raider";f.e.ROSTER[2].rankIndex=7
  f.reset();f.api.ExportRoster();local sameSecond=f.facts()
  check(size.." same-second accepted snapshot is a new source generation",sameSecond and fresh and sameSecond.digest~=fresh.digest and f.hashes==1)
  f.reset();f.advance(180);f.a.Tick()
  check(size.." periodic work permits at most one capture/hash",f.hashes<=1 and f.rosterReads<=size+1 and f.noActions())
end

do
  local f=fixture(1000)
  f.reset()
  local digest=f.api.AutoSyncFacts(true).sweepDigest
  check("explicit 1000-row sweep hashes its bounded native content once", #digest==64 and f.hashes==1 and f.hashBytes<300000)
  for _=1,5 do assert(f.api.AutoSyncFacts(true).sweepDigest==digest) end
  check("re-reading the same accepted sweep needs no extra hash or native read",f.hashes==1 and f.rosterReads==0)
  f.advance(1); f.api.ExportRoster()
  check("new timestamp alone preserves the sweep digest", f.api.AutoSyncFacts(true).sweepDigest==digest)
  local function change(label)
    f.api.ExportRoster()
    local nextDigest=f.api.AutoSyncFacts(true).sweepDigest
    check("sweep changes with "..label,digest~=nextDigest)
    digest=nextDigest
  end
  local row=f.e.ROSTER[3]
  row.rank="Veteran"; row.rankIndex=6; change("in-place rank and title")
  row.name="Changed Character"; change("character name")
  row.guid="Player-1-00FFFFFF"; change("GUID")
  row.onote="officer note"; change("officer note outside the automatic alert fingerprint")
  row.level=55; change("level")
  f.e.ROSTER[3],f.e.ROSTER[5]=f.e.ROSTER[5],f.e.ROSTER[3]; change("roster order even with identical membership")
  check("native sweep hashing never acts",f.noActions())
end

for _,case in ipairs({"stale","future-clock","backwards-clock","guild","realm","own-guid","partial-table","invalid-total","long-field","row-type","replacement","mutation-rollback"}) do
  local f=fixture(920);local r=f.e.OlympusVerifyDB.roster;f.reset()
  if case=="stale" then f.advance(76)
  elseif case=="future-clock" then f.wall=r.exportedAt-1
  elseif case=="backwards-clock" then f.advance(10);assert(f.facts());f.wall=f.wall-1
  elseif case=="guild" then f.guild="Different Guild"
  elseif case=="realm" then f.realm="Different Realm"
  elseif case=="own-guid" then f.playerGuid="Player-1-00ABCDEF"
  elseif case=="partial-table" then table.remove(r.members)
  elseif case=="invalid-total" then r.total=920.5
  elseif case=="long-field" then r.members[2].note=string.rep("x",1025)
  elseif case=="row-type" then r.members[2]=false
  elseif case=="replacement" then f.e.OlympusVerifyDB.roster=clone(r)
  elseif case=="mutation-rollback" then r.members[2].rank="Changed In Place" end
  check(case.." cannot reuse a strict cached digest",f.facts()==nil)
  check(case.." held facts dispatch no native action",f.noActions())
  if case=="replacement" or case=="mutation-rollback" then
    if case=="replacement" then f.e.OlympusVerifyDB.roster=r else r.members[2].rank="Member" end
    check(case.." restoring caller-visible data does not unpoison generation",f.facts()==nil)
    f.api.ExportRoster();check(case.." only a new accepted native export recovers facts",f.facts()~=nil)
  end
end

do
  local f=fixture(920);local old=f.e.OlympusVerifyDB.roster;local digest=f.facts().digest
  f.reportedTotal=920;local row=f.e.ROSTER[920];f.e.ROSTER[920]=nil;f.advance(5);f.reset()
  f.api.ExportRoster()
  check("incomplete forced capture keeps original snapshot and timestamp",f.e.OlympusVerifyDB.roster==old and f.e.OlympusVerifyDB.roster.exportedAt==old.exportedAt)
  check("partial native cache cannot publish a fresh digest",f.facts() and f.facts().digest==digest and f.hashes==0)
  f.e.ROSTER[920]=row;f.api.ExportRoster();check("complete native recapture recovers once without native actions",f.facts() and f.hashes==1 and f.noActions())
end

do
  local f=fixture(920);local calls=0;local read=f.api.AutoSyncFacts
  f.api.AutoSyncFacts=function() calls=calls+1;return read() end
  f.reset()
  check("invalid public pending reason is rejected before fact capture",not f.a.Request("arbitrary") and calls==0 and f.hashes==0 and f.rosterReads==0)
  local db=f.e.OlympusVerifyDB;f.e.OlympusVerifyDB=nil
  check("missing public pending storage is rejected before fact capture",not f.a.Request("native-change") and calls==0 and f.hashes==0 and f.rosterReads==0)
  f.e.OlympusVerifyDB=db
  check("rejected public requests cannot poison the accepted native digest",f.facts() and f.hashes==0 and f.noActions())
end

print(string.format("%d passed, %d failed",passed,failed))
if failed>0 then error("full-roster performance/custody regression") end

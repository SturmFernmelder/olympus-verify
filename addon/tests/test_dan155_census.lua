-- Execute the supplied Olympus1.5.5 public Bridge.lua and our actual consumer.
-- WoW clocks/data/metadata are synthetic; no source hashes, copied exporter,
-- private addon state, Config.lua, network or in-game acceptance are involved.
assert(type(DAN155_BRIDGE_SOURCE)=="string" and DAN155_ADDON_VERSION=="1.5.5","explicit Olympus1.5.5 archive required")
local passed=0
local function check(name,yes)
  if not yes then error("FAIL "..name) end
  passed=passed+1;print("PASS "..name)
end
local function fresh()
  local clock={now=1794400000,server=1794400120}
  local sample={guilds={
    {name="Olympus Prime",g={t=clock.now-20,total=957,online=33,mine=true},fresh=true,counted=true},
    {name="Olympus II",g={t=clock.now-1000,total=800,online=77,from="private-provenance"},fresh=false,counted=true},
    {name="Olympus III",g={t=clock.now-90000,total=500,online=9},fresh=false,counted=false},
  },seen={{name="Olympus Seen",online=2,capped=false,t=clock.now-10}},live={alts=7},
    snapshot={characters=9999,people=8888,guilds=20,observed=clock.now-30,source="retained",counted=true,witnesses=2}}
  local private=setmetatable({},{__index=function()error("private addon state read")end})
  local e=setmetatable({},{__index=_G});e._G=e
  e.time=function()return clock.now end;e.GetServerTime=function()return clock.server end
  e.GetAddOnMetadata=function(addon,field)if addon=="Olympus" and field=="Version" then return DAN155_ADDON_VERSION end end
  e.InCombatLockdown=function()return false end;e.CreateFrame=false
  e.SendChatMessage=function()error("unexpected chat")end
  e.C_ChatInfo={SendAddonMessage=function()error("unexpected addon message")end}
  e.OlympusDB=private;e.OlympusRecordDB=private;e.OlympusVerifyDB={}
  local ns={realm="Realm 3 PvE",group="ForeverPvE",faction="Alliance",Now=e.time,Cut=function(s,n)return s:sub(1,n)end,Codec={GUILD_CAP=1000}}
  local subscriptions={}
  ns.On=function(event,fn)
    assert(type(event)=="string" and type(fn)=="function","lifecycle registration")
    subscriptions[event]=subscriptions[event] or {};table.insert(subscriptions[event],fn)
  end
  ns.Data={Summary=function()return sample end,ServerTime=function()return e.GetServerTime and e.GetServerTime() end,
    Dispute=function()return {single="private-reporter-name",disputed=false} end}
  local upstream=assert(loadstring(DAN155_BRIDGE_SOURCE,"@Olympus1.5.5/Bridge.lua"));setfenv(upstream,e);upstream("Olympus",ns)
  local consumer=assert(loadfile("../OlympusVerify/OlympusVerifyCensus.lua"));setfenv(consumer,e);consumer()
  return {e=e,c=e.OlympusVerifyCensus,clock=clock,sample=sample,bridge=e.OlympusBridge}
end
local function named(s,name)for _,r in ipairs(s.guilds)do if r.name==name then return r end end end
local function enabled(x)assert(x.c.SetEnabled(true));return x.c.Preview()end
local x=fresh()
check("actual upstream exports checkpoint v1 and no legacy snapshot alias",x.bridge.CENSUS_CHECKPOINT_API_VERSION==1 and type(x.bridge.GetCensusCheckpoint)=="function" and x.bridge.GetCensusSnapshot==nil)
check("census is off at each load",x.c.Preview()==nil)
local s=assert(enabled(x))
check("public checkpoint maps character counts rather than summary people",named(s,"Olympus Prime").reportedCharacters==957 and s.addonVersion==DAN155_ADDON_VERSION and #s.guilds==3)
check("separate server clock never substitutes the original local receipt clock",s.observedAt==x.clock.now and named(s,"Olympus Prime").receivedAt==x.clock.now-20)
check("fresh/count/history booleans survive without an upgrade",named(s,"Olympus Prime").fresh==true and named(s,"Olympus II").fresh==false and named(s,"Olympus II").counted==true and named(s,"Olympus III").counted==false)
check("stale online counts are absent from the projection",named(s,"Olympus II").online==nil and named(s,"Olympus III").online==nil and named(s,"Olympus Prime").online==33)
named(s,"Olympus Prime").reportedCharacters=1
local wire,copy=x.c.Export();assert(wire and copy)
check("returned previews cannot change the accepted aggregate",named(copy,"Olympus Prime").reportedCharacters==957)
check("projection is unsigned nonmembership observation only",copy.source=="community-observation" and copy.membershipProof==false)
check("seen-only rows, provenance and people/retained totals never enter export",not wire:find("Olympus Seen",1,true) and not wire:find("private-",1,true) and not wire:find('"summary"',1,true) and not wire:find('"retained"',1,true) and not wire:find('"people"',1,true))
check("adapter installs no getter into Dan globals and writes no SavedVariables",x.bridge.GetCensusSnapshot==nil and next(x.e.OlympusVerifyDB)==nil)
x.sample.guilds[1].g.total=956
check("changed data invalidates the prior attended preview",x.c.Recheck()==nil and x.c.Export()==nil)
x.c.SetEnabled(false)
check("session off revokes preview and export",x.c.Preview()==nil and x.c.Export()==nil)

local function altered(name,mutate)
  local t=fresh();local original=t.bridge.GetCensusCheckpoint
  t.bridge.GetCensusCheckpoint=function()local value=original();mutate(value);return value end
  t.c.SetEnabled(true);check(name,t.c.Preview()==nil and t.c.Export()==nil)
end
altered("unknown checkpoint schema is refused",function(v)v.schema="guild-roster" end)
altered("unknown checkpoint version is refused",function(v)v.version=2 end)
altered("unsupported local-only clock mode is refused",function(v)v.timeSource="local";v.capturedAtServer=nil end)
altered("missing local observation clock is refused",function(v)v.capturedAt=0 end)
altered("future local observation is refused",function(v)v.capturedAt=v.capturedAt+1 end)
altered("future server observation is refused",function(v)v.capturedAtServer=v.capturedAtServer+1 end)
altered("future guild receipt is refused",function(v)v.guilds[1].observedAt=v.capturedAt+1 end)
altered("unknown faction scope is refused",function(v)v.scope.faction="Unknown" end)
altered("scope identity fields are refused",function(v)v.scope.character="private-character" end)
altered("masked count is not converted to a number",function(v)v.guilds[1].members="few" end)
altered("guild identity fields are refused",function(v)v.guilds[1].guid="Player-1-11112222" end)
altered("identity fields in discarded provenance are refused",function(v)v.guilds[1].provenance.reporterName="private-character" end)
altered("identity fields in discarded summary are refused",function(v)v.summary.names={"private-character"} end)
altered("identity fields in discarded history are refused",function(v)v.retained.discordID="private-id" end)
altered("seen-only identity fields are refused",function(v)v.seenOnly[1].character="private-character" end)
altered("scope-key mismatch is refused",function(v)v.guilds[1].key="g1:alliance:other:olympus" end)
altered("sparse upstream arrays are refused",function(v)v.guilds[2]=nil end)
altered("duplicate guild rows are refused",function(v)v.guilds[2]=v.guilds[1] end)
altered("incorrect producer fresh flag is never repaired",function(v)for _,r in ipairs(v.guilds)do if r.fresh then r.fresh=false;r.online=0 end end end)
altered("incorrect producer counted flag is never repaired",function(v)for _,r in ipairs(v.guilds)do if r.fresh then r.counted=false end end end)
altered("stale online data is not silently accepted",function(v)for _,r in ipairs(v.guilds)do if not r.fresh then r.online=1 end end end)

local missing=fresh();missing.e.GetServerTime=nil
missing.c.SetEnabled(true);check("unavailable server clock fails closed",missing.c.Preview()==nil)
local noLocal=fresh();noLocal.e.time=nil
noLocal.c.SetEnabled(true);check("unavailable local clock has no server-clock substitution",noLocal.c.Preview()==nil)
local metadata=fresh();metadata.e.GetAddOnMetadata=nil
metadata.c.SetEnabled(true);check("unavailable public addon metadata fails closed",metadata.c.Preview()==nil)
local combat=fresh();combat.e.InCombatLockdown=function()return true end
combat.c.SetEnabled(true);check("existing combat gate still refuses data",combat.c.Preview()==nil)
local preview=fresh();preview.e.OlympusVerifyUI={preview={}}
preview.c.SetEnabled(true);check("existing addon-preview gate still refuses data",preview.c.Preview()==nil)
local legacy=fresh();local checkpointCalls=0
legacy.bridge.GetCensusCheckpoint=function()checkpointCalls=checkpointCalls+1;error("legacy fallback bypass")end
legacy.bridge.GetCensusSnapshot=function()return {format="olympus-census-v1",addonVersion="legacy",realmGroup="ForeverPvE",faction="Alliance",observedAt=legacy.clock.now,source="community-observation",membershipProof=false,guilds={}}end
check("legacy getter remains supported without checkpoint calls",enabled(legacy)~=nil and checkpointCalls==0)
legacy.bridge.GetCensusSnapshot=function()return nil end
check("masked legacy refusal is never bypassed via checkpoint",legacy.c.Preview()==nil and checkpointCalls==0)
legacy.bridge.GetCensusSnapshot=function()error("legacy masked")end
check("legacy failure is never bypassed via checkpoint",legacy.c.Preview()==nil and checkpointCalls==0)
local reload=fresh();check("a fresh consumer reload requires a new explicit opt-in",reload.c.Preview()==nil)
print(passed.."/"..passed.." actual Olympus1.5.5 checkpoint checks passed")

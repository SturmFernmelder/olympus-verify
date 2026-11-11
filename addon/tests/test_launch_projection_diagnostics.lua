-- Actual Current decoder, synthetic source/native APIs only. No Config.lua,
-- installed files, network transport or native actions are used.
local passed, failed = 0, 0
local function check(label, value)
  if value then passed=passed+1;print("PASS "..label) else failed=failed+1;print("FAIL "..label) end
end
local function fixture()
  local e=setmetatable({}, {__index=_G});e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  local f={e=e,effects=0}
  local function action() f.effects=f.effects+1;error("diagnostic read must not act") end
  e.OlympusVerifyConfig={membershipOnly=true,secret="synthetic-diagnostic-secret"}
  e.GetGuildInfo=function() return "OLYMPUS PRIME","Officer",1 end
  e.GetRealmName=function() return "Synthetic Realm" end
  e.UnitGUID=function() return "Player-1-0000AAAA" end
  e.IsInGuild=function() return true end
  e.issecretvalue=function() return false end
  e.GuildPromote,e.GuildInvite,e.GuildUninvite,e.ReloadUI=action,action,action,action
  e.C_GuildInfo={SetGuildRankOrder=action,GuildRoster=action}
  e.OlympusVerifyAPI={Sync=action}
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")),e)("OlympusVerify")
  f.row={name="Synthetic Candidate",guid="Player-1-0000BBBB",currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}
  f.page={protocol="officer-operations-v233",status="ready",fetchedAt=e.NOW,expiresAt=e.NOW+60,
    snapshotId=1,snapshotAt=e.NOW-10,guild="OLYMPUS PRIME",realm="Synthetic Realm",canonicalGuild="OLYMPUS PRIME",
    scopeHash=e.OlympusHmac.sha256hex("native-scope|1|OLYMPUS PRIME|Synthetic Realm"):sub(1,16),
    scan={id=string.rep("a",32),startedAt=e.NOW,expiresAt=e.NOW+590},entitlements={offset=0,total=20},
    invites={},promotions={f.row},riskBuffer={},held={},
    actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
  f.data={version=2,controlId="original",scanComplete=true,pages={f.page}}
  e.OlympusLaunchQueue=f.data;e.OlympusVerifyDB={}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
  f.q=e.OlympusLaunch229
  return f
end
local function refusal(label, change, code)
  local f=fixture();change(f)
  local ok,value,why,actual=pcall(f.q.Current)
  check(label,ok and value==nil and actual==code and type(why)=="string" and why:find("["..code.."]",1,true)~=nil)
  check(label.." has no actions or private source echo",f.effects==0 and type(why)=="string" and not why:find("PRIVATE_CANARY",1,true) and not why:find("synthetic-diagnostic-secret",1,true))
end

do
  local f=fixture();local current=f.q.Current()
  check("supported original source remains available with the original row and clocks",current and current.promotions[1]==f.row and current.pages[1]==f.page and current.freshness[f.row.guid].expiresAt==f.page.expiresAt)
  check("reading a supported source performs no Sync, roster request or native action",f.effects==0)
end
refusal("legacy container version has a separate diagnostic",function(f) f.data.version=1 end,"projection_version")
refusal("missing projection differs from an incompatible protocol",function(f) f.e.OlympusLaunchQueue=nil end,"projection_missing")
refusal("missing page list is safely diagnosed",function(f) f.data.pages=nil end,"projection_pages")
refusal("old page protocol is explicit even when its old scan shape differs",function(f) f.page.protocol="launch-operations-v1";f.page.scan=nil end,"page_protocol")
refusal("unknown protocol text is not reflected into the diagnostic",function(f) f.page.protocol="PRIVATE_CANARY" end,"page_protocol")
for _,key in ipairs({"guild","realm","scopeHash","canonicalGuild"}) do
  refusal("native scope mismatch: "..key,function(f) f.page[key]="PRIVATE_CANARY" end,"native_scope_mismatch")
end
refusal("missing first scan is safely diagnosed",function(f) f.page.scan=nil end,"malformed_scan")
refusal("invalid original scan clock is safely diagnosed",function(f) f.page.scan.startedAt="PRIVATE_CANARY" end,"malformed_scan")
refusal("missing first entitlement table does not throw",function(f) f.page.entitlements=nil end,"malformed_entitlements")
refusal("missing first entitlement total is refused rather than compared nil to nil",function(f) f.page.entitlements.total=nil end,"malformed_entitlements")
refusal("text entitlement total is refused",function(f) f.page.entitlements.total="PRIVATE_CANARY" end,"malformed_entitlements")
refusal("wrong original page offset is distinct from expiry",function(f) f.page.entitlements.offset=20 end,"malformed_entitlements")
refusal("nonnumeric page time is safely diagnosed",function(f) f.page.expiresAt="PRIVATE_CANARY" end,"malformed_page_dates")
refusal("unsupported automatic action policy remains refused",function(f) f.page.actions.automatic=true end,"unsupported_action_policy")
refusal("missing promotion target does not throw",function(f) f.row.targetSlot=nil end,"unsupported_promotion_target")
refusal("text promotion target does not throw or leak",function(f) f.row.targetSlot="PRIVATE_CANARY" end,"unsupported_promotion_target")
refusal("NaN promotion target is refused",function(f) f.row.targetSlot=0/0 end,"unsupported_promotion_target")
refusal("infinite promotion target is refused",function(f) f.row.targetSlot=math.huge end,"unsupported_promotion_target")
refusal("wrong supported target name stays refused",function(f) f.row.targetName="PRIVATE_CANARY" end,"unsupported_promotion_target")
refusal("later page protocol is independently diagnosed",function(f)
  local p={};for k,v in pairs(f.page) do p[k]=v end
  p.protocol="launch-operations-v1";p.entitlements={offset=20,total=20};p.promotions={};f.data.pages[2]=p
end,"page_protocol")
refusal("later page scan cannot replace the original scan",function(f)
  local p={};for k,v in pairs(f.page) do p[k]=v end
  p.scan={id=string.rep("b",32),startedAt=f.e.NOW,expiresAt=f.e.NOW+590};p.entitlements={offset=20,total=20};p.promotions={};f.data.pages[2]=p
end,"original_scan_mismatch")
do
  local f=fixture();local original=f.page.expiresAt;f.e.NOW=f.e.NOW+60
  local current=f.q.Current()
  check("expired compatible page remains advisory instead of becoming a protocol error",current and current.stalePages==1 and current.promotions[1]==f.row)
  check("advisory read does not extend the original action deadline",f.page.expiresAt==original and current.freshness[f.row.guid].expiresAt==original and f.effects==0)
  f=fixture();local pending={attempts=1,failed=true,original="retained"};f.q.pending[f.row.guid]=pending
  f.data.stoppedReason="PRIVATE_CANARY";current=f.q.Current()
  check("stopped projection preserves its original held state without acting",current and current.actionHeld and f.effects==0)
  check("diagnostic reads leave pending/unknown original custody untouched",f.q.pending[f.row.guid]==pending and pending.attempts==1 and pending.failed==true and pending.original=="retained")
end
print(string.format("Launch projection diagnostics: %d passed, %d failed",passed,failed))
if failed>0 then error("launch projection diagnostics failed") end

-- Actual Current/model/roster controls with synthetic native data only.
ROSTER_FIXTURE_ONLY=true
local fixture=assert(loadfile("test_roster268.lua"))()
ROSTER_FIXTURE_ONLY=nil
local passed,failed=0,0
local function check(label,value)
  if value then passed=passed+1;print("PASS "..label) else failed=failed+1;print("FAIL "..label) end
end
local function plain(v) return tostring(v or ""):gsub("|c%x%x%x%x%x%x%x%x",""):gsub("|r","") end
local function tooltip(f)
  f.w.sourceTip:GetScript("OnEnter")(f.w.sourceTip)
  return table.concat(f.e.GameTooltip._lines or {},"\n")
end
local function partial(reason,running)
  local f=fixture();local p=f.page;local q=f.e.OlympusLaunchQueue
  q.scanComplete=false;q.stoppedReason=reason;q.running=running
  p.status="partial";p.promotions={};p.entitlements={offset=0,total=962,scanned=20,unscanned=942,retryAfterSeconds=1}
  for i=1,5 do p.held[i]={name="Held "..i,guid=string.format("Player-1-%08X",9000+i),reason="discord-entitlement-unknown"} end
  for i=1,8 do p.riskBuffer[i]={name="Risk "..i,guid=string.format("Player-1-%08X",9100+i),currentSlot=9,reason="unverified-initiate",reviewOnly=true} end
  f.w.Refresh();return f
end
do
  local f=partial("rate-limited",false);local d=f.w.diagnostics;local s=d.loadedScan
  check("real decoder exposes stopped rate-limit as last-loaded evidence",s and s.code=="rate-limited" and s.label=="Rate limited (last loaded)" and d.state=="held")
  check("actual first-page counts are bounded and explicit",s.progressKnown and s.scanned==20 and s.total==962 and s.unscanned==942 and d.recommendations==0 and d.sourceHeld==5 and d.riskReview==8)
  check("partial zero recommendations never become a full-roster eligibility finding",d.reason:find("not a full-roster eligibility result",1,true) and d.ready==0 and not f.w.nextButton:IsEnabled())
  local tip=tooltip(f)
  check("full roster tooltip includes source cause, counts and next step",tip:find("rate limit",1,true) and tip:find("20/962 inspected; 942 unscanned",1,true) and tip:find("Next step:",1,true))
  check("full source tooltip explains that current Watcher state is unobservable",tip:find("cannot observe the Watcher's current process",1,true) and tip:find("not whether the Watcher is alive",1,true))
  check("reported Retry-After is a dated hint without countdown or authority",tip:find("Retry-After 1s",1,true) and tip:find("not a live countdown or permission to act",1,true))
  f.q.Show();f.q.sourceTip:GetScript("OnEnter")(f.q.sourceTip)
  check("officer window exposes readable summary plus full source hover",f.q.windowInfo:GetText():find("20/962 inspected",1,true) and table.concat(f.e.GameTooltip._lines or {}," "):find("separately authorized recovery",1,true) and f.q.windowDetails:find("recheck attempts (including rate-limit retries)",1,true))
  check("source reporting does not dispatch Sync or native actions",f.attempts==0 and #f.promotions==0 and f.invites==0 and f.removals==0 and f.reloads==0)
end
do
  local f=partial("rate-limited-wait",true);local original=f.page.expiresAt
  check("incoming active wait retains original actionHeld",f.q.Current().actionHeld=="rate-limited-wait" and f.w.diagnostics.loadedScan.code=="rate-limited-wait" and f.w.diagnostics.ready==0)
  f.e.NOW=f.e.NOW+2;f.w.refreshButton:Click()
  check("elapsed Retry-After never clears or resumes a loaded wait",f.e.OlympusLaunchQueue.stoppedReason=="rate-limited-wait" and f.w.diagnostics.state=="held" and f.w.diagnostics.ready==0 and f.page.expiresAt==original)
  local queried=f.e.OlympusVerifyLists.verified.fetchedAt;local observed=f.e.OlympusVerifyLists.verified.snapshotAt
  f.w.refreshButton:Click()
  check("Refresh only rereads local native/cache and never renews source clocks",f.e.OlympusVerifyLists.verified.fetchedAt==queried and f.e.OlympusVerifyLists.verified.snapshotAt==observed and f.page.expiresAt==original and f.reloads==0)
  f.e.NOW=original;f.w.Refresh()
  check("wait plus expired page exposes expiry while preserving source hold",f.w.diagnostics.loadedScan.expiryState=="pages-expired" and f.w.diagnostics.reason:find("expired and advisory",1,true) and f.w.diagnostics.state=="held")
  f.e.NOW=f.page.scan.expiresAt;f.w.Refresh()
  check("original scan expiry remains advisory and cannot be renewed by paint",f.w.diagnostics.loadedScan.expiryState=="scan-expired" and f.w.diagnostics.reason:find("original scan is now expired",1,true) and not f.w.nextButton:IsEnabled())
end
do
  local f=fixture();f.e.OlympusLaunchQueue.stoppedReason="rate-limited-wait";f.e.OlympusLaunchQueue.running=true;f.w.Refresh()
  local original=f.page.expiresAt
  check("actual supported recommendations remain hidden during a wait",f.w.diagnostics.recommendations==3 and f.w.diagnostics.ready==0 and not f.w.nextButton:IsEnabled())
  check("original dispatcher independently refuses a wait without native mutation",not f.q.HardwarePromote("Player-1-0000B002") and #f.promotions==0 and f.page.expiresAt==original)
  f.e.OlympusLaunchQueue.stoppedReason=nil;f.w.Refresh()
  check("only an actually changed returned source can leave the wait state",f.w.diagnostics.recommendations==3 and not f.q.Current().actionHeld)
  -- v233 made the cleared discovery rows ready; v234 discovery is advisory and
  -- only the selected Directive read admits a promotion.
  local advisory=f.w.diagnostics.ready==0 and f.w.diagnostics.byGuid["Player-1-0000B002"].label=="Check selected GUID"
  f.selectInitiates()
  check("cleared discovery stays advisory until a selected read makes its rows ready",advisory and f.w.diagnostics.ready==2 and #f.promotions==0)
end
do
  local f=partial("rate-limited-wait",true);f.e.OlympusVerifyDB.launchControl={action="stop",id="new-control"};f.w.Refresh()
  check("explicit local stop is reported separately and never cleared",f.w.diagnostics.loadedScan.code=="operator-stopped" and f.w.diagnostics.ready==0 and f.e.OlympusVerifyDB.launchControl.action=="stop")
  f.e.OlympusVerifyDB.launchControl={action="scan",id="new-control"};f.w.Refresh()
  check("superseded local control is explicit and still held",f.w.diagnostics.loadedScan.code=="superseded" and f.w.diagnostics.state=="held")
  f=partial("PRIVATE_CANARY|Hmalicious",false);local tip=tooltip(f);f.q.Show()
  check("unknown source reason uses fixed text without private or markup echo",f.w.diagnostics.loadedScan.code=="source-held" and not tip:find("PRIVATE_CANARY",1,true) and not f.q.windowDetails:find("PRIVATE_CANARY",1,true))
  f=partial("rate-limited",false);f.page.entitlements.scanned="PRIVATE_CANARY";f.w.Refresh()
  check("malformed optional progress becomes unavailable rather than fabricated counts",not f.w.diagnostics.loadedScan.progressKnown and f.w.diagnostics.loadedScan.scanned==nil and not tooltip(f):find("PRIVATE_CANARY",1,true))
  f=partial("running",false)
  check("a stop string cannot masquerade as an unheld running category",f.w.diagnostics.loadedScan.code=="source-held" and f.w.diagnostics.state=="held")
end
do
  local f=partial(nil,true);local d=f.w.diagnostics
  check("reported running source never claims a currently live Watcher",d.loadedScan.code=="running" and d.reason:find("not whether the Watcher is alive",1,true))
  local tip=tooltip(f)
  check("legend distinguishes prior dated and review without changing base statuses",tip:find("Linked (prior record)",1,true) and tip:find("Linked (dated)",1,true) and tip:find("Link needs review",1,true))
  f.e.NOW=f.page.scan.expiresAt;f.w.Refresh()
  check("unheld expired scan is explicitly labeled expired without refreshing it",f.w.diagnostics.loadedScan.label=="Scan expired (last loaded)" and f.w.diagnostics.ready==0 and f.w.diagnostics.reason:find("original scan is now expired",1,true))
  f=partial(nil,false);f.e.OlympusLaunchQueue.scanComplete=true;f.page.entitlements={offset=0,total=20,scanned=20,unscanned=0};f.w.Refresh()
  check("complete bounded inspection is distinguished from a partial zero",f.w.diagnostics.loadedScan.code=="complete" and f.w.diagnostics.loadedScan.unscanned==0 and not f.w.diagnostics.loadedScan.reason:find("not a full-roster eligibility result",1,true))
  f=fixture();f.e.OlympusLaunchQueue=nil;f.w.Refresh()
  check("missing source remains unavailable with zero enabled actions",f.w.diagnostics.state=="unavailable" and not f.w.nextButton:IsEnabled() and tooltip(f):find("No dated launch projection",1,true))
  f=fixture();f.page.protocol="PRIVATE_CANARY";f.w.Refresh()
  check("unsupported source keeps fixed refusal text in the full tooltip",not f.w.nextButton:IsEnabled() and tooltip(f):find("page_protocol",1,true) and not tooltip(f):find("PRIVATE_CANARY",1,true))
end
for _,code in ipairs({"rate-limit-retries-exhausted","rate-limit-exceeds-scan","discovery-budget-exhausted","refresh-budget-exhausted","source-unknown","source-refused"}) do
  local f=partial(code,false);local d=f.w.diagnostics
  check("fixed terminal reason and next step: "..code,d.loadedScan.code==code and d.state=="held" and d.ready==0
    and tooltip(f):find(d.loadedScan.nextStep,1,true) and f.e.OlympusLaunchQueue.stoppedReason==code and f.reloads==0 and #f.promotions==0)
end
do
  local f=partial("rate-limit-retries-exhausted",false);f.e.OlympusLaunchQueue.pages={};f.w.Refresh()
  local tip=tooltip(f)
  check("empty stopped container explains its fixed reported reason without validating a source",f.w.diagnostics.state=="unavailable" and tip:find("Unvalidated loaded container reports",1,true) and tip:find("bounded same-page rate-limit retries",1,true) and not f.w.nextButton:IsEnabled())
  f=partial("PRIVATE_CANARY",false);f.e.OlympusLaunchQueue.pages={};f.w.Refresh()
  check("empty unvalidated container never echoes an unknown reason",not tooltip(f):find("PRIVATE_CANARY",1,true) and f.w.diagnostics.state=="unavailable")
end
print(string.format("Loaded scan status: %d passed, %d failed",passed,failed))
if failed>0 then error("loaded scan status failed") end

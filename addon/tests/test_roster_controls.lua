-- Actual addon controls, not a second filter/promotion implementation.
ROSTER_FIXTURE_ONLY = true
local fixture = assert(loadfile("test_roster268.lua"))()
ROSTER_FIXTURE_ONLY = nil
-- v234 (Stage 2 addon280, 13 Nov 2026): rows become ready only through the
-- fixture's sealed selected read (selectInitiates); discovery stays advisory.
local function ready() local f=fixture();f.selectInitiates();return f end
local passed, failed = 0, 0
local function check(label, value)
  if value then passed=passed+1; print("PASS "..label) else failed=failed+1;print("FAIL "..label) end
end
local function plain(s) return tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x",""):gsub("|r","") end
local function reviewFixture()
  local f=fixture();local q=f.e.OlympusVerifyLists
  q.version=2;q.unknown={fetchedAt=f.e.NOW,snapshotAt=f.e.NOW,members={}}
  for i=#q.verified.members,1,-1 do
    local row=q.verified.members[i]
    if row.name=="Alpha" or row.name=="Zulu" then
      q.unknown.members[#q.unknown.members+1]={name=row.name,guid=row.guid,reason=row.name=="Alpha" and "linked_before_cutoff" or "link_review"}
      table.remove(q.verified.members,i)
    end
  end
  f.e.ROSTER[1].class="PRIEST";f.e.ROSTER[3].class="PRIEST"
  f.w.Show();return f
end
do
  local f=reviewFixture();local before=f.names()
  f.w.statusButton:Click()
  check("status click opens choices without changing selection",f.w.menu:IsShown() and f.names()==before)
  local count=0;for _,item in ipairs(f.w.menu.items) do if item.option then count=count+1 end end
  check("all nine status choices are directly selectable",count==9)
  f.choose(f.w.statusButton,7)
  check("prior-record dropdown isolates exact historical state",f.names()=="Alpha")
  f.choose(f.w.statusButton,8)
  check("review dropdown isolates server account/identity review",f.names()=="Zulu")
  local row=f.w.rows[1];row:GetScript("OnMouseUp")(row,"LeftButton")
  local detail=plain(f.w.detailText:GetText())
  check("selected details retain exact safe reason and original clocks",detail:find("link_review",1,true) and detail:find("account or identity",1,true) and detail:find("Server list queried:",1,true) and detail:find("Native GUID:",1,true))
  check("review details give explicit next step without invented account cause",detail:find("Next step:",1,true) and detail:find("does not expose the internal failed account check",1,true))
  check("review filters and selection never promote or send",f.attempts==0 and #f.promotions==0 and f.invites==0 and f.removals==0 and f.reloads==0)
  f.w.clearButton:Click();f.choose(f.w.onlineButton,3)
  local allOffline=true;for _,m in ipairs(f.w.Visible()) do if m.online then allOffline=false end end
  check("offline dropdown excludes online rows",allOffline and #f.w.Visible()==4)
  f.choose(f.w.rankButton,"Initiate")
  check("rank dropdown selects native rank by stable value",f.w.view.rank=="Initiate" and #f.w.Visible()==3)
  f.w.clearButton:Click();f.choose(f.w.classButton,"PRIEST")
  local classes=true;for _,m in ipairs(f.w.Visible()) do if m.class~="PRIEST" then classes=false end end
  check("class dropdown selects class directly",classes and #f.w.Visible()==2 and f.w.view.class=="PRIEST")
end
do
  local f=fixture();f.e.OlympusLaunchQueue=nil;f.w.Show()
  check("zero signed actions exposes known native Initiates separately",plain(f.w.queueSummary:GetText()):find("Native Initiates: 5",1,true) and plain(f.w.queueSummary:GetText()):find("Actionable: 0",1,true))
  check("missing projection is unavailable rather than a false zero-recommendation count",plain(f.w.queueSummary:GetText()):find("Signed recommendations: unavailable",1,true) and plain(f.w.nextButton.label:GetText())=="Promote: unavailable")
  check("zero signed actions gives actionable reason",plain(f.w.actionInfo:GetText())~="" and not f.w.nextButton:IsEnabled())
  f.choose(f.w.actionFilterButton,4)
  check("verified native Initiates are discoverable without granting actions",f.names()=="Alpha,NameOnly,Zulu" and not f.w.nextButton:IsEnabled())
  f.w.clearButton:Click();f.w.copyButton:Click()
  local copied=f.w.copyBox.input:GetText()
  check("copy table opens native read-only copy input",f.w.copyBox:IsShown() and copied:find("Character\tLevel\tClass",1,true))
  check("copy includes source reasons and known usernames",copied:find("Readiness reason",1,true) and copied:find("alpha_discord",1,true))
  check("copy omits request/account authority fields",not copied:find("discordId",1,true) and not copied:find("nativeMembership",1,true) and not copied:find("mac=",1,true))
  check("export has no native or verification effects",f.attempts==0 and #f.promotions==0 and f.reloads==0)
  f.w.Hide();check("hiding roster closes menus and copy overlay",not f.w.copyBox:IsShown() and not f.w.menu:IsShown())
end
do
  local f=ready();f.sort("action")
  check("readiness heading now sorts ready targets first",f.names():match("^Alpha,Zulu")~=nil)
  f.sort("action");check("readiness heading reverses actual state order",f.names():sub(1,6)~="Alpha,")
  f.sort("class");f.sort("sourceAge")
  check("class and source-age headings are actual sortable columns",f.w.view.sort=="sourceAge")
  f.w.refreshButton:Click()
  check("refresh view is read-only and never reloads",f.reloads==0 and f.attempts==0 and #f.promotions==0)
  check("snapshot header separates local request from loaded source clocks",plain(f.w.snapshotText:GetText()):find("Local Sync request:",1,true) and plain(f.w.snapshotText:GetText()):find("Loaded server query:",1,true) and plain(f.w.snapshotText:GetText()):find("Server roster:",1,true))
  local strings=true;for _,header in ipairs(f.w.headers) do
    local enter=header:GetScript("OnEnter");if enter then enter(header) end
    for _,line in ipairs(f.e.GameTooltip._lines or {}) do if type(line)~="string" then strings=false end end
  end
  check("every header tooltip supplies strings to native UI",strings)
end
do
  local f=fixture();f.q.HardwarePromote=nil;f.w.Refresh()
  local ok=pcall(function() f.w.nextButton:Click() end)
  check("missing dispatcher cannot enable an action or throw",ok and not f.w.nextButton:IsEnabled() and f.attempts==0)
end
do
  local f=fixture();f.e.NOW=f.e.NOW+3601
  f.w.Refresh()
  local alpha
  for _,row in ipairs(f.w.rows) do if row.member and row.member.name=="Alpha" then alpha=row.member end end
  check("paint reclassifies expired evidence without helper reload",alpha and alpha.status=="stale" and alpha.statusDetail=="linked_dated")
  check("expiry clears current Discord names and known verified counts",alpha and alpha.discord==nil and plain(f.w.queueSummary:GetText()):find("Verified Initiates: 0",1,true))
  check("expiry reclassification never reloads or changes rank",f.reloads==0 and f.attempts==0 and #f.promotions==0)
  f=fixture();f.e.NOW=f.e.NOW+3601
  f.w.frame:GetScript("OnUpdate")(f.w.frame,5)
  local stale=false;for _,row in ipairs(f.w.rows) do if row.member and row.member.name=="Alpha" then stale=row.member.status=="stale" end end
  check("visible frame tick automatically expires loaded evidence",stale and f.reloads==0)
end
do
  local f=fixture();f.e.OlympusLaunchQueue=nil;f.w.Show()
  check("quick filter is named for verified Initiates rather than promotion readiness",plain(f.w.readyButton.label:GetText())=="Verified Initiates")
  f.w.readyButton:Click()
  check("quick filter shows all current verified native Initiates without a signed queue",f.names()=="Alpha,NameOnly,Zulu" and f.w.view.initiates and f.w.view.status==2 and f.w.view.action==4)
  check("potential and actionable counts stay explicitly separate",plain(f.w.queueSummary:GetText()):find("Verified Initiates: 3 potential",1,true) and plain(f.w.queueSummary:GetText()):find("Actionable: 0 total / 0 shown",1,true))
  local hidden=true;for _,row in ipairs(f.w.rows) do if row.member and row.promote:IsShown() then hidden=false end end
  check("verified-potential rows do not gain promotion controls from display status",hidden and not f.w.nextButton:IsEnabled())
  f.w.readyButton:Click()
  check("repeated quick-filter clicks are idempotent and read only",f.names()=="Alpha,NameOnly,Zulu" and f.attempts==0 and #f.promotions==0 and f.invites==0 and f.removals==0 and f.reloads==0)
  f.choose(f.w.actionFilterButton,2)
  check("signed-ready dropdown stays distinct from the potential shortcut",plain(f.w.actionFilterButton.label:GetText())=="Ready to promote (signed) v" and f.names()=="" and not f.w.nextButton:IsEnabled())
  check("empty signed-ready view states the source gap instead of hiding the reason",plain(f.w.actionInfo:GetText()):find("No actionable signed promotions match these filters.",1,true) and plain(f.w.actionInfo:GetText()):find("No dated launch projection",1,true))
end

do
  local f=fixture();f.w.readyButton:Click()
  check("potential shortcut includes verified Initiates lacking a signed recommendation",f.names()=="Alpha,NameOnly,Zulu")
  local potential
  for _,row in ipairs(f.w.rows) do if row.member and row.member.name=="NameOnly" then potential=row end end
  check("unsigned verified Initiate keeps its no-recommendation explanation",potential and not potential.promote:IsShown() and plain(potential.cells.action:GetText()):find("No loaded recommendation",1,true))
  f.selectInitiates()
  f.w.nextButton:Click()
  check("potential shortcut still dispatches exactly one signed native target per click",f.attempts==1 and #f.promotions==1 and f.promotions[1].guid=="Player-1-0000B002" and f.names()=="NameOnly,Zulu")
  f=ready();f.e.NOW=f.sp.expiresAt;f.w.readyButton:Click()
  check("expired signed pages do not hide still-current verified potential",f.names()=="Alpha,NameOnly,Zulu" and not f.w.nextButton:IsEnabled() and plain(f.w.actionInfo:GetText()):find("expired",1,true))
  f.choose(f.w.actionFilterButton,2)
  check("expired signed-ready view remains empty with the original expiry reason",f.names()=="" and plain(f.w.actionInfo:GetText()):find("No actionable signed promotions",1,true) and plain(f.w.actionInfo:GetText()):find("expired",1,true) and f.attempts==0)
end

do
  local f=reviewFixture();f.w.readyButton:Click()
  check("verified shortcut excludes historical links and account-review rows",f.names()=="NameOnly" and not f.w.nextButton:IsEnabled())
  f=fixture();f.e.NOW=f.e.NOW+3601;f.w.readyButton:Click()
  check("expired display evidence never becomes verified potential",f.names()=="" and plain(f.w.queueSummary:GetText()):find("Verified Initiates: 0 potential",1,true) and not f.w.nextButton:IsEnabled())
  check("empty verified shortcut explains the current filter and source state",plain(f.w.actionInfo:GetText()):find("No current verified Initiates match these filters.",1,true) and plain(f.w.actionInfo:GetText()):find("expired",1,true) and f.reloads==0 and f.attempts==0)
end
do
  -- Retired: "checks all three ... including unsigned candidates" and "clears
  -- display filters" -- CL2-108 (Codex residual, accepted in Claude's rank280-addon
  -- review) made the button check only the first twenty shown rows and keep the view.
  local f=fixture();local requested
  f.q.SelectMany=function(ids) requested=ids;return true end
  f.w.batchButton:Click()
  local seen={};for _,id in ipairs(requested or {}) do seen[id]=true end
  check("batch button checks every shown verified Initiate including unsigned candidates",requested and #requested==3 and seen["Player-1-0000B001"] and seen["Player-1-0000B002"] and seen["Player-1-0000B003"])
  requested=nil;f.search("Zulu");f.choose(f.w.onlineButton,3);f.w.batchButton:Click()
  check("batch button checks only the shown rows, keeps the officer's filters and never directly promotes",requested and #requested==1 and requested[1]=="Player-1-0000B001"
    and f.names()=="Zulu" and f.attempts==0 and #f.promotions==0 and f.removals==0 and f.invites==0)
  f=reviewFixture();requested=nil;f.q.SelectMany=function(ids) requested=ids;return true end
  f.w.batchButton:Click()
  check("batch button excludes prior-record and review identities",requested and #requested==1 and requested[1]=="Player-1-0000B003")
  f=fixture();requested=nil;f.q.SelectMany=function(ids) requested=ids;return true end
  f.e.NOW=f.e.NOW+3601;f.w.batchButton:Click()
  check("stale display cannot request an Initiate batch",requested==nil and f.reloads==0 and f.attempts==0)
end

do
  local f=ready();f.search("Alpha")
  local b=f.w.nextButton
  check("roster promotion inherits the client-owned secure OnClick",b._template:find("SecureActionButtonTemplate",1,true) and b:GetScript("OnClick")==b._secureHandler)
  check("painting a ready button leaves its native command unarmed",not b:GetAttribute("type1") and not b:GetAttribute("macrotext1") and f.attempts==0)
  f.forceClick(b,"RightButton")
  f.forceClick(b,"LeftButton",true)
  f.e.IsShiftKeyDown=function()return true end;f.forceClick(b);f.e.IsShiftKeyDown=function()return false end
  check("wrong click edge, mouse button and modifiers cannot reserve or execute",f.attempts==0 and not next(f.e.OlympusVerifyDB.launchPromotionAttempts or {}) and not b:GetAttribute("type1"))
  b:Click()
  local receipt=f.e.OlympusVerifyDB.launchPromotionAttempts["Player-1-0000B002"]
  check("one allowed hardware click executes exactly one native command and retains unknown custody",f.attempts==1 and #f.promotions==1 and f.directCalls==0 and receipt and receipt.state=="unknown" and #receipt.steps==1)
  check("PostClick disarms both action type and exact command",not b:GetAttribute("type1") and not b:GetAttribute("macrotext1"))
  b:GetScript("OnClick")(b,"LeftButton",false)
  check("the now-unarmed secure handler cannot replay the previous target",f.attempts==1 and #receipt.steps==1)
  f.emit("GUILD_ROSTER_UPDATE")
  check("separate complete native readback confirms the observed Alt step",receipt.state=="confirmed" and not receipt.completed and receipt.observedSlot==8 and f.e.ROSTER[3].rankIndex==8 and f.attempts==1)
end

do
  local f=ready();f.search("Alpha");local row=f.w.rows[1]
  check("row promotion uses its own secure template handler",row.promote._template:find("SecureActionButtonTemplate",1,true) and row.promote:GetScript("OnClick")==row.promote._secureHandler)
  f.e.NOW=f.sp.expiresAt;f.forceClick(row.promote)
  check("expiry between paint and a forced old row click leaves no command or reservation",f.attempts==0 and not next(f.e.OlympusVerifyDB.launchPromotionAttempts or {}) and not row.promote:GetAttribute("type1") and not row.promote:GetAttribute("macrotext1"))
end
print(string.format("%d passed, %d failed",passed,failed))
if failed>0 then error("roster controls failed") end

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
  f.w.RequestVerifiedInitiates()
  local seen={};for _,id in ipairs(requested or {}) do seen[id]=true end
  check("batch button checks every shown verified Initiate including unsigned candidates",requested and #requested==3 and seen["Player-1-0000B001"] and seen["Player-1-0000B002"] and seen["Player-1-0000B003"])
  requested=nil;f.search("Zulu");f.choose(f.w.onlineButton,3);f.w.RequestVerifiedInitiates()
  check("batch button checks only the shown rows, keeps the officer's filters and never directly promotes",requested and #requested==1 and requested[1]=="Player-1-0000B001"
    and f.names()=="Zulu" and f.attempts==0 and #f.promotions==0 and f.removals==0 and f.invites==0)
  f=reviewFixture();requested=nil;f.q.SelectMany=function(ids) requested=ids;return true end
  f.w.RequestVerifiedInitiates()
  check("batch button excludes prior-record and review identities",requested and #requested==1 and requested[1]=="Player-1-0000B003")
  f=fixture();requested=nil;f.q.SelectMany=function(ids) requested=ids;return true end
  f.e.NOW=f.e.NOW+3601;f.w.RequestVerifiedInitiates()
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
do
  local f=ready();f.w.Show();f.search("Nothing");f.w.view.presence=3;f.w.view.class="MAGE"
  f.w.ShowReadyInitiates()
  check("ready alert opens the signed native Initiates view and clears stale filters",f.w.view.initiates and f.w.view.action==2 and f.w.view.text==""
    and f.w.view.presence==1 and f.w.view.class==0 and #f.w.Visible()>0 and f.attempts==0 and f.reloads==0)
end
do
  local f=fixture()
  local w,r=f.w,f.e.OlympusVerifyAPI.Roster
  local target=f.e.ROSTER[6]
  target.online=true
  local attempts={}
  local calls=0
  local function recorded(guid)
    local out={}
    for _,a in ipairs(attempts) do if not guid or a.guid==guid then out[#out+1]=a end end
    return out
  end
  r.ReminderHistory=recorded
  r.ReminderEligibility=function(_,guid)
    return guid==target.guid and #recorded(guid)==0,"No current eligible reminder."
  end
  r.SendInitiateReminder=function(full,guid)
    calls=calls+1
    check("dispatch uses the selected exact native name and GUID",full==f.e.GetGuildRosterInfo(6) and guid==target.guid)
    attempts[#attempts+1]={name=full,guid=guid,at=f.e.NOW,officer="Officer"}
    return true,"Attempt recorded."
  end
  w.readyButton:Click()
  f.search("Zulu")
  f.choose(w.onlineButton,3)
  w.onlineInitiatesButton:Click()
  check("online preset clears conflicting filters and shows verified, pending and unverified native Initiates",f.names()=="Alpha,Pending,Unlinked" and w.view.text=="" and w.view.status==1 and w.view.action==1)
  local function selectRow(name)
    for _,row in ipairs(w.rows) do
      if row.member and row.member.name==name then row:GetScript("OnMouseUp")(row,"LeftButton");return row end
    end
    error("missing visible row "..name)
  end
  selectRow("Alpha")
  check("selecting verified Initiate cannot enable a reminder",not w.reminderButton:IsEnabled())
  selectRow("Pending")
  check("selecting a pending Initiate cannot enable a reminder",not w.reminderButton:IsEnabled())
  local row=selectRow("Unlinked")
  check("eligible selection enables just the dedicated reminder control",w.reminderButton:IsEnabled() and not row.remind:IsShown() and calls==0)
  f.search("Pending")
  f.forceClick(w.reminderButton)
  check("filtered-out selection cannot be whispered by a retained button",not w.reminderButton:IsEnabled() and calls==0)
  w.onlineInitiatesButton:Click()
  selectRow("Unlinked")
  f.forceClick(w.reminderButton,"RightButton")
  f.forceClick(w.reminderButton,"LeftButton",true)
  f.e.IsShiftKeyDown=function() return true end
  f.forceClick(w.reminderButton)
  f.e.IsShiftKeyDown=function() return false end
  w.Refresh()
  check("right, modified and down clicks plus a repaint send nothing",calls==0)
  w.reminderButton:Click()
  f.forceClick(w.reminderButton)
  check("single click records one attempt and disables repeat",calls==1 and not w.reminderButton:IsEnabled() and plain(w.reminderDetail:GetText()):find("Attempted",1,true))
  check("attempt remains distinct from a sent whisper in online list",plain(row.cells.display:GetText()):find("Tried",1,true))
  attempts[1].sentAt=f.e.NOW+1
  w.Refresh()
  check("outgoing confirmation alone updates list to Sent",plain(row.cells.display:GetText()):find("Sent",1,true) and not plain(w.reminderDetail:GetText()):find("Acknowledged",1,true))
  attempts[1].acknowledgedAt=f.e.NOW+3
  w.Refresh()
  check("an explicit receipt replaces Sent with acknowledgment status",plain(w.reminderDetail:GetText()):find("Acknowledged",1,true) and plain(row.cells.display:GetText()):find("Ack",1,true))
  f.sort("display")
  check("last reminder sorts tracked recipients before blank cells",w.view.sort=="reminder" and f.names()=="Unlinked,Alpha,Pending")
  target.online=false
  w.refreshButton:Click()
  check("online view drops members who went offline without erasing their prior reminder",f.names()=="Alpha,Pending" and not w.reminderButton:IsEnabled() and #recorded(target.guid)==1)
  for i=1,11 do
    attempts[#attempts+1]={at=f.e.NOW+10+i,failedAt=f.e.NOW+10+i,name="Former"..i,guid="Player-1-X"..i,officer="Officer"}
  end
  w.historyButton:Click()
  local h=w.historyBox
  check("history includes departed characters with failed attempts",h:IsShown() and h.rows[1][1]:GetText()=="Former11" and h.rows[1][4]:GetText()=="Failed" and h.rows[1][5]:GetText()=="—")
  h.next:Click()
  check("prior history accessible via pages",h.page==2 and h.rows[2][1]:GetText()==attempts[1].name and not h.next:IsEnabled())
  h.search:SetText("UnLiNk")
  h.search:GetScript("OnTextChanged")(h.search)
  check("history search finds offline recipient, original sender, attempt, send and acknowledgment times",h.page==1 and h.rows[1][1]:GetText()==attempts[1].name and h.rows[1][2]:GetText()=="Officer"
    and h.rows[1][3]:GetText()==f.e.date("%Y-%m-%d %H:%M:%S",attempts[1].at) and h.rows[1][4]:GetText()==f.e.date("%Y-%m-%d %H:%M:%S",attempts[1].sentAt)
    and h.rows[1][5]:GetText()==f.e.date("%Y-%m-%d %H:%M:%S",attempts[1].acknowledgedAt) and h.rows[2][1]:GetText()=="")
  w.Hide()
  check("dismissal closes history without another whisper, rank change, or reload",not h:IsShown() and calls==1 and f.attempts==0 and f.reloads==0)
end
do
  local f=reviewFixture()
  f.w.onlineInitiatesButton:Click()
  check("a prior linked record remains visible in the online cohort",f.w.rows[1].member.name=="Alpha" and f.w.rows[1].member.status=="unknown" and f.w.rows[1].member.statusDetail=="prior_record")
  f.e.NOW=f.e.NOW+3601
  f.w.Refresh()
  check("expired verification leaves the native online Initiates in view",f.names()=="Alpha,Pending" and not f.w.reminderButton:IsEnabled())
end
do
  local f=fixture(1000,"Fern Melder")
  local e,w=f.e,f.w
  local realm="CAMWOW US2 Realm 3 PvE"
  local hash=e.OlympusHmac.sha256hex
  e.OlympusHmac.sha256hex=function(value)
    if value=="prime-guild-master|1|"..f.actor then return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16" end
    return hash(value)
  end
  e.ROSTER[1].name,e.ROSTER[1].rankIndex="Fern Melder",0
  e.GetGuildInfo=function() return "OLYMPUS PRIME","Guild Master",0,realm end
  e.GetRealmName=function() return realm end
  for i=2,#e.ROSTER do e.ROSTER[i].rankIndex,e.ROSTER[i].online=9,true end
  local attempts={}
  for i=1,2000 do
    local m=e.ROSTER[(i-1)%1000+1]
    local at=e.NOW-3000+i
    attempts[i]={at=at,sentAt=at,name=m.name,guid=m.guid,officer="Fern Melder"}
  end
  attempts[1003].acknowledgedAt=e.NOW
  e.OlympusVerifyDB.initiateReminderHistory={version=1,scope="OLYMPUS PRIME\n"..realm,actor=f.actor,attempts=attempts}
  local r=e.OlympusVerifyAPI.Roster
  local read=r.ReminderHistory
  local probes,copies,copied=0,0,0
  r.ReminderHistory=function(...)
    probes=probes+1
    local records,reason,revision=read(...)
    if records and #records>0 then copies=copies+1;copied=copied+#records end
    return records,reason,revision
  end
  w.onlineInitiatesButton:Click()
  w.historyButton:Click()
  local h=w.historyBox
  check("1,000-member view and history dialog share one authorized 2,000-attempt snapshot",h.count:GetText():find("2000 recorded attempts",1,true) and copies==1 and copied==2000 and #w.Visible()==999)
  local firstMatches=h.matches
  local started=os.clock()
  for _=1,12 do w.frame:GetScript("OnUpdate")(w.frame,5) end
  print(string.format("1,000 guild members / 2,000 reminders: 12 visible repaints in %.3fs; %d ledger copies total",os.clock()-started,copies))
  check("one minute of visible repaints performs no further full ledger copies or history searches",probes>=12 and copies==1 and copied==2000 and firstMatches==h.matches)
  f.sort("display")
  local alpha,unlinked
  for i,m in ipairs(w.Visible()) do
    if m.name=="Alpha" then alpha=i elseif m.name=="Unlinked" then unlinked=i end
  end
  check("a later acknowledgment sorts after a more recent attempt in ascending event-time order",alpha and unlinked and alpha>unlinked)
  local acknowledged=attempts[#attempts]
  for _,handler in ipairs(e.FRAMES) do
    if handler._events and handler._events.CHAT_MSG_WHISPER_INFORM and handler._events.CHAT_MSG_WHISPER then
      handler:GetScript("OnEvent")(handler,"CHAT_MSG_WHISPER","GOT IT",unpack({[1]=acknowledged.name,[11]=acknowledged.guid},1,11))
    end
  end
  w.Refresh()
  check("a real matching reply invalidates the shared ledger exactly once and updates history immediately",copies==2 and acknowledged.acknowledgedAt==e.NOW and h.rows[1][5]:GetText()==e.date("%Y-%m-%d %H:%M:%S",e.NOW))
  local row=w.rows[1]
  row:GetScript("OnMouseUp")(row,"LeftButton")
  e.GetGuildInfo=function() return "Other guild","Guild Master",0,realm end
  w.Refresh()
  check("lost officer scope clears the last known ledger, row dates and detail copy",h.count:GetText():find("unavailable",1,true) and h.rows[1][1]:GetText()=="" and plain(w.reminderDetail:GetText()):find("unavailable",1,true)
    and w.rows[1].cells.display:GetText()=="Unavailable" and not w.reminderButton:IsEnabled())
  w.Hide()
  local before=probes
  for _=1,12 do w.frame:GetScript("OnUpdate")(w.frame,5);f.emit("GUILD_ROSTER_UPDATE") end
  check("closed panel releases the history and performs no reminder reads or sends",not h.log and not h.matches and probes==before and f.attempts==0 and f.reloads==0)
end
do
  local f=fixture();local w,e=f.w,f.e
  w.statusButton:Click()
  w.menu.items[2].tick:Click();w.menu.items[4].tick:Click()
  check("checkbox states combine within verification and keep the menu open",w.menu:IsShown() and f.names()=="Alpha,NameOnly,Pending,Zulu")
  f.choose(w.rankButton,"Initiate");f.choose(w.onlineButton,2)
  check("checkbox union intersects other filters",f.names()=="Alpha,Pending")
  w.clearButton:Click();f.sort("rank")
  e.IsShiftKeyDown=function()return true end;f.sort("level")
  check("shift-click adds an independent secondary sort",w.view.sort=="rank" and w.view.secondary=="level"
    and f.names()=="Officer,Member,Knight,NameOnly,Unlinked,Zulu,Pending,Alpha")
  e.IsShiftKeyDown=function()return false end
  w.ShowInactive()
  check("inactivity list starts with seven offline days",f.names()=="NameOnly" and w.inactiveFilter:IsShown())
  f.choose(w.inactiveFilter,3)
  check("inactivity duration is inclusive and excludes online members",f.names()=="NameOnly,Zulu")
  local r=w.rows[1];r:GetScript("OnMouseUp")(r,"LeftButton")
  e.CanGuildRemove=function() return true end
  local opened
  e.ChatFrame_OpenChat=function(text)opened=text end
  check("single eligible current GUID prepares only an unsent native command",w.ReviewRemoval() and opened=="/guildremove NameOnly-Forever" and f.removals==0)
  opened=nil
  local officerGuid=e.UnitGUID
  e.UnitGUID=function() return "" end
  check("an unreadable officer GUID cannot prepare a removal",not w.ReviewRemoval() and not opened)
  e.UnitGUID=officerGuid
  e.CanGuildRemove=function()return false end
  check("missing removal permission never opens a command",not w.ReviewRemoval() and not opened)
  e.CanGuildRemove=function()return true end;e.ROSTER[4].onote="hold";opened=nil
  check("new hold note wins over old selection",not w.ReviewRemoval() and not opened)
  e.ROSTER[4].onote="";e.ROSTER[4].guid="Player-1-0000CFFF"
  check("same visible name with a different GUID cannot inherit the removal",not w.ReviewRemoval() and not opened)
  w.ShowRoster()
  check("Roster restores the officer's original sort when exiting inactivity",not w.view.inactiveDays and w.view.sort=="rank" and w.view.secondary=="level")
  check("using the inactivity view makes zero guild or Discord changes",f.removals==0 and f.invites==0 and f.attempts==0)
end
do
  local f=fixture();local e=f.e
  local function loadPart(name) setfenv(assert(loadfile("../OlympusVerify/"..name..".lua")),e)("OlympusVerify") end
  loadPart("OlympusVerifyGuildJournal")
  local j=e.OlympusVerifyGuildJournal
  e.OlympusVerifyAPI.ExportRoster();j.ObserveRoster()
  local id=e.ROSTER[3].guid
  check("first-seen is recorded from the current roster without inventing a join",j.FirstSeen(id)==e.NOW and j.LatestJoin(e.ROSTER[3].name)==nil)
  local sample={{"invite","Officer","Alpha",""},{"join","Alpha",nil,nil},{"promote","Officer","Alpha","Member"},{"remove",nil,"Former",nil}}
  e.QueryGuildEventLog=function()end;e.GetNumGuildEvents=function()return #sample end
  e.GetGuildEventInfo=function(i)local v=sample[i];return v[1],v[2],v[3],v[4],0,0,1,2 end
  j.Request();f.emit("GUILD_EVENT_LOG_UPDATE")
  local lines=table.concat(j.Read("Alpha")," / ")
  check("guild log attributes native actor and keeps join independent",#j.Read("Alpha")==3 and lines:find("Officer invited Alpha",1,true)
    and lines:find("Officer promoted Alpha",1,true) and lines:find("Alpha joined",1,true) and j.LatestJoin("Alpha") and not j.LatestJoin("Alpha-Elsewhere"))
  check("absent actor stays unknown on a recorded removal",#j.Read("Former")==1 and j.Read("Former")[1]:find("officer unknown",1,true))
  e.NOW=e.NOW+120;j.Request();f.emit("GUILD_EVENT_LOG_UPDATE")
  check("repeated native log with coarse elapsed age keeps original events",#j.Read("")==4)
  e.GetGuildInfo=function()return "Other Guild","Guild Master",0 end
  check("another guild cannot read the local PRIME journal",#j.Read("")==0 and j.FirstSeen(id)==nil)
end
do
  local f=fixture();local e=f.e
  f.w.Hide();e.OlympusVerifyRoster=nil
  for _,module in ipairs({"OlympusVerifyWorkspace","OlympusVerifyUI","OlympusVerifyGuildJournal","OlympusVerifyInactiveDesk","OlympusVerifyRoster"}) do
    setfenv(assert(loadfile("../OlympusVerify/"..module..".lua")),e)("OlympusVerify")
  end
  local w,ui,s=e.OlympusVerifyRoster,e.OlympusVerifyUI,e.OlympusVerifyWorkspace
  ui.Show();w.Show()
  check("both officer pages share one shell with only the selected page visible",
    ui.panel._parent==s.shell and w.frame._parent==s.shell and not ui.panel:IsShown() and w.frame:IsShown())
  local syncs=0;e.OlympusVerifyAPI.Sync=function() syncs=syncs+1 end
  check("roster offers the shared Sync and retires duplicate action buttons",s.IsShown() and s.pages.roster.syncButton and not w.selectButton and not w.batchButton and not w.importButton)
  s.pages.roster.syncButton:Click()
  check("common roster Sync calls exactly one officer hardware transition",syncs==1 and f.attempts==0)
  ui.Alert()
  check("background officer alerts preserve an open working roster",s.active=="roster" and w.frame:IsShown() and not ui.panel:IsShown())
  w.ShowActivity()
  check("guild activity view opens inside the roster shell",w.activity._parent==w.frame and w.activity:IsShown())
  e.InCombatLockdown=function()return true end;ui.Show()
  check("switching pages cannot hide a protected roster in combat",s.active=="roster" and w.frame:IsShown())
  e.InCombatLockdown=function()return false end;ui.Show()
  check("return to Operations hides the roster and preserves a single visible page",s.active=="operations" and ui.panel:IsShown() and not w.frame:IsShown())
  s.Close(); ui.Toggle()
  check("default desk opens Members, reusing the same header and single Sync button",
    s.chrome:IsShown() and s.section=="roster" and w.frame:IsShown() and ui.panel.syncButton==w.frame.syncButton)
  w.sortButton:Click()
  for _,item in ipairs(w.menu.items) do if item.option and item.option.value=="level" then item:Click();break end end
  w.Show("Alpha")
  s.tabs.promotions:Click()
  check("Promotions displays verified Initiates without issuing a write or a Sync",
    s.section=="promotions" and w.view.action==4 and w.view.status==2 and f.attempts==0 and syncs==1)
  s.tabs.roster:Click()
  check("returning to Members restores search and sort",w.view.text=="Alpha" and w.view.sort=="level")
  local alpha=w.rows[1]
  alpha:GetScript("OnMouseUp")(alpha,"LeftButton")
  e.ROSTER[3].note="Public sample";e.ROSTER[3].onote="Officer sample"
  e.CanViewOfficerNote=function()return false end
  w.noteButton:Click()
  local tip=table.concat(e.GameTooltip._lines," ")
  check("local notes use the selected native member and redact the officer note without permission",
    tip:find("Public sample",1,true) and not tip:find("Officer sample",1,true))
  e.CanViewOfficerNote=function()return true end
  w.noteButton:Click()
  check("native permission exposes the selected officer note",table.concat(e.GameTooltip._lines," "):find("Officer sample",1,true))
  local id=e.ROSTER[3].guid;e.ROSTER[3].guid="Player-1-0000C0DE"
  w.noteButton:Click()
  check("a reused row index cannot display either note",not table.concat(e.GameTooltip._lines," "):find("sample",1,true))
  e.ROSTER[3].guid=id;e.ROSTER[3].level=53
  f.emit("GUILD_ROSTER_UPDATE");f.emit("GUILD_ROSTER_UPDATE")
  check("burst of native updates queues one trailing read",w.nativeDirty and w.rows[1].member.level~=53)
  e.NOW=e.NOW+5;w.frame:GetScript("OnUpdate")(w.frame,5)
  check("trailing native update reaches the desk without another event or Sync",not w.nativeDirty and w.rows[1].member.level==53 and syncs==1)
  s.tabs.inactive:Click()
  check("Inactive mounts its own native page inside the same desk without Sync",s.active=="inactive" and s.pages.inactive==e.OlympusVerifyInactiveHost and s.pages.inactive:IsShown() and not w.frame:IsShown() and syncs==1)
  e.OlympusVerifyInactiveHost:Hide()
  check("closing the native page also closes the chrome",not s.IsShown() and not s.chrome:IsShown() and f.removals==0)
end
print(string.format("%d passed, %d failed",passed,failed))
if failed>0 then error("roster controls failed") end

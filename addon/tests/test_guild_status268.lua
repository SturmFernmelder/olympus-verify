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
-- Real Guild column, model and hardware dispatcher. Native rows/buttons are
-- synthetic; no installed data, native UI or provider is touched.
local function guildUI(size)
  local f=fixture(size or 3);local e=f.e
  for _,row in ipairs(e.ROSTER) do row.rank,row.rankIndex="Initiate",9 end
  local q=f.install(2,0)
  for i,row in ipairs(q.verified.members) do row.username="user"..i;row.displayName="Display "..i end
  e.GetGuildRosterShowOffline=function()return true end
  e.CanGuildPromote=function()return true end
  e.GuildControlGetRankName=function(order)return order==9 and "Member" or order==7 and "Veteran" or "Other" end
  f.promotions,f.restrictedCalls,f.nativeClicks=0,0,0
  e.C_GuildInfo.SetGuildRankOrder=function()f.restrictedCalls=f.restrictedCalls+1;error("restricted setter must never be used") end
  e.C_GuildInfo.Promote=function()f.restrictedCalls=f.restrictedCalls+1;error("protected Lua promotion must never be called") end
  e.GuildPromote=e.C_GuildInfo.Promote
  e.SECURE_MACRO_EXECUTE=function(text)
    local name=text:match("^/gpromote ([^\r\n]+)$")
    assert(name,"one native promotion command required")
    f.promotions=f.promotions+1;f.promotedName=name
    for _,row in ipairs(e.ROSTER) do if row.name.."-Forever"==name then row.rankIndex=row.rankIndex-1;return end end
    error("unknown synthetic native target")
  end
  e.C_GuildInfo.IsGuildRankAssignmentAllowed=function()return true end
  local h=e.OlympusHmac
  f.page={protocol="officer-operations-v233",fetchedAt=f.now,expiresAt=f.now+60,status="ready",snapshotId=1,snapshotAt=f.now,
    memberCount=#e.ROSTER,guild=f.guild,realm=f.realm,canonicalGuild="OLYMPUS PRIME",scopeHash=h.sha256hex("native-scope|1|"..f.guild.."|"..f.realm):sub(1,16),
    entitlements={offset=0,total=#e.ROSTER},scan={id=string.rep("a",32),startedAt=f.now,expiresAt=f.now+600},
    promotions={{name=e.ROSTER[1].name,guid=e.ROSTER[1].guid,currentSlot=9,targetSlot=8,targetName="Member",reason="verified-initiate"}},
    invites={},riskBuffer={},held={},actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}}
  e.OlympusLaunchQueue={version=2,controlId="loaded",scanComplete=true,pages={f.page}}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),e)("OlympusVerify")
  f.launch=e.OlympusLaunch229
  f.syncs=0;e.OlympusVerifyAPI.Sync=function()f.syncs=f.syncs+1 end
  f.rosterEvent=function()f.event("GUILD_ROSTER_UPDATE");f.launch.Events:GetScript("OnEvent")(f.launch.Events,"GUILD_ROSTER_UPDATE")end
  f.rosterEvent()
  e.UIParent:Show();e.UIParent.GetRight=function()return 1920 end
  f.tooltipLines={}
  e.GameTooltip.SetText=function(_,text)f.tooltipLines={text}end
  e.GameTooltip.AddLine=function(_,text)f.tooltipLines[#f.tooltipLines+1]=text end
  local host=e.CreateFrame("Frame",nil,e.UIParent);host:Show();host:SetSize(900,700)
  host.GetRight=function()return f.right or 1100 end;host.GetAlpha=function()return 1 end;host.GuildMemberDetailFrame=false
  local list=e.CreateFrame("Frame",nil,host);list:Show();list.expandedDisplay=true;list.GetSelectedClubId=function()return f.club or 77 end
  e.C_Club={GetGuildClubId=function()return 77 end};host.MemberList=list;e.CommunitiesFrame=host
  f.nativeRows={}
  for i=1,math.min(size or 3,3) do
    local row=e.CreateFrame("Button",nil,list);row:Show();row:SetSize(600,20)
    row.member={name=e.ROSTER[i].name.."-Forever",guid=e.ROSTER[i].guid}
    row.GetMemberInfo=function(self)return self.member end
    row:SetScript("OnMouseUp",function()f.nativeClicks=f.nativeClicks+1 end)
    f.nativeRows[i]=row
  end
  list.ScrollBox={ForEachFrame=function(_,callback)for _,row in ipairs(f.nativeRows)do callback(row)end end}
  f.tick=function()f.frame:GetScript("OnUpdate")(f.frame,0.3)end
  f.event("ADDON_LOADED","Blizzard_Communities");f.tick()
  for _,frame in ipairs(e.FRAMES) do
    if frame._parent==e.UIParent and frame:GetWidth()==436 then f.column=frame end
    if frame:GetText()=="Verify members" then f.fallback=frame end
  end
  f.buttons=function()
    local result={};for _,frame in ipairs(e.FRAMES)do for i,row in ipairs(f.nativeRows)do if frame.nativeRow==row then result[i]=frame end end end
    return result
  end
  -- Exercise click-time guards even when a freshly painted native widget would
  -- already be disabled. Preserve the client-owned secure middle phase.
  f.forceClick=function(button,mouseButton,down)
    mouseButton=mouseButton or "LeftButton"
    local pre=button:GetScript("PreClick");if pre then pre(button,mouseButton,down==true) end
    local click=button:GetScript("OnClick");if click then click(button,mouseButton,down==true) end
    local post=button:GetScript("PostClick");if post then post(button,mouseButton,down==true) end
  end
  f.host,f.list=host,list
  return f
end
do
  local f=guildUI();local buttons=f.buttons();local b=buttons[1]
  check("native Guild column renders both dated Discord name fields beside status",f.column:IsShown() and b.username:GetText()=="@user1" and b.displayName:GetText()=="Display 1" and b.text:GetText():find("Verified",1,true))
  check("explicit Promote is beside status and names never overlap its action box",select(2,b.promote:GetPoint())==b and select(3,b.promote:GetPoint())=="RIGHT" and select(4,b.promote:GetPoint())==6 and select(2,b.username:GetPoint())==b.promote and select(4,b.username:GetPoint())==8 and select(2,b.displayName:GetPoint())==b.username and select(4,b.displayName:GetPoint())==8 and 8+b:GetWidth()+6+b.promote:GetWidth()+8+b.username:GetWidth()+8+b.displayName:GetWidth()<=f.column:GetWidth()-8)
  check("only the exact ready Guild row offers Promote while unsigned verified rows offer a separate Check",b.promote:IsVisible() and b.promote:IsEnabled() and b.promote:GetText()=="Promote" and b.promote.mode=="promote" and buttons[2].promote:GetText()=="Check" and buttons[2].promote.mode=="check" and buttons[3].promote:GetText()=="Check")
  check("Guild promotion preserves the secure template native click handler",b.promote._template:find("SecureActionButtonTemplate",1,true) and b.promote:GetScript("OnClick")==b.promote._secureHandler)
  check("opening and repainting native Guild UI sends no promotion",f.promotions==0 and f.restrictedCalls==0 and f.nativeClicks==0)
  local current=f.launch.Current;local reads=0
  f.launch.Current=function()reads=reads+1;return current()end;f.tick()
  check("one native column refresh reads the promotion source once for visible rows",reads==1)
  b.promote:Click()
  check("actual Guild row Promote executes one exact native secure command without protected Lua calls",f.promotions==1 and f.promotedName==f.e.ROSTER[1].name.."-Forever" and f.restrictedCalls==0 and f.e.ROSTER[1].rankIndex==8)
  local receipt=f.e.OlympusVerifyDB.launchPromotionAttempts[f.e.ROSTER[1].guid]
  check("native command alone remains unknown and is disarmed after the click",receipt and receipt.state=="unknown" and not receipt.completed and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  f.rosterEvent()
  check("a newer complete native event confirms Member without a second command",receipt.state=="confirmed" and receipt.completed and receipt.observedSlot==8 and f.promotions==1)
  f.tick();b.promote:Click()
  check("a completed or pending row cannot repeat from a recycled Guild action",f.promotions==1)
end
for _,case in ipairs({"expired","rank","scope","unknown-attempt","missing-dispatcher","row-recycled","wrong-club","combat","preview","permission","assignment","stale-native","partial-native"})do
  local f=guildUI();local b=f.buttons()[1]
  if case=="expired" then f.now=f.now+60;f.rosterEvent()
  elseif case=="rank" then f.e.ROSTER[1].rankIndex=8;f.rosterEvent()
  elseif case=="scope" then f.guild="Another Guild";f.event("PLAYER_GUILD_UPDATE","player")
  elseif case=="unknown-attempt" then f.e.OlympusVerifyDB.launchPromotionAttempts={[f.e.ROSTER[1].guid]={state="unknown"}}
  elseif case=="missing-dispatcher" then f.launch.HardwarePromote=nil
  elseif case=="row-recycled" then f.nativeRows[1].member={name=f.e.ROSTER[2].name.."-Forever",guid=f.e.ROSTER[2].guid}
  elseif case=="wrong-club" then f.club=88
  elseif case=="combat" then f.e.InCombatLockdown=function()return true end
  elseif case=="preview" then f.e.OlympusVerifyUI={preview={}}
  elseif case=="permission" then f.e.CanGuildPromote=function()return false end
  elseif case=="assignment" then f.e.C_GuildInfo.IsGuildRankAssignmentAllowed=function()return false end
  elseif case=="stale-native" then f.now=f.now+16
  elseif case=="partial-native" then f.e.GetGuildRosterShowOffline=function()return false end end
  f.forceClick(b.promote)
  check("native Guild promotion click retains "..case.." refusal",f.promotions==0 and f.restrictedCalls==0)
end
do
  local f=guildUI();local b=f.buttons()[1];local q=f.q
  q.verified.members[1].displayName="Visible |cffff0000 Name\nLine";f.rosterEvent();f.tick()
  check("Discord display names escape WoW markup and controls without interpreting them",b.displayName:GetText()=="Visible ||cffff0000 Name Line")
  b:GetScript("OnEnter")(b)
  check("Guild status tooltip retains both complete safe Discord name fields",table.concat(f.tooltipLines,"\n"):find("Discord username: user1",1,true) and table.concat(f.tooltipLines,"\n"):find("Discord display name: Visible ||cffff0000 Name Line",1,true))
  q.verified.members[1].username="secret-name";q.verified.members[1].displayName="Visible Display"
  f.e.issecretvalue=function(value)return value=="secret-name" end;f.rosterEvent();f.tick()
  check("restricted Discord values are never rendered as native Guild names",b.username:GetText()=="—" and b.displayName:GetText()=="Visible Display")
  q.verified.members[1].username=nil;q.verified.members[1].displayName=nil;f.rosterEvent();f.tick()
  check("missing Discord fields never fall back to guessed character or account names",b.username:GetText()=="—" and b.displayName:GetText()=="—")
  q.verified.members[1].username="private-user";q.verified.members[1].displayName="private-display";q.verified.fetchedAt=f.now-3601;q.unverified.fetchedAt=f.now-3601;q.unknown.fetchedAt=f.now-3601
  q.verified.snapshotAt=f.now-3601;q.unverified.snapshotAt=f.now-3601;q.unknown.snapshotAt=f.now-3601;f.rosterEvent();f.tick()
  check("expired or unknown Guild status clears previously visible Discord fields",b.username:GetText()=="—" and b.displayName:GetText()=="—")
  q=f.install(2,0);q.verified.members[1].username="current-user";q.verified.members[1].displayName="Current Display";f.tick()
  q.verified.members[1].guid="Player-1-FFFF0001";f.rosterEvent();f.tick()
  check("a same-name different-GUID link cannot expose Discord names in the native Guild column",b.username:GetText()=="—" and b.displayName:GetText()=="—")
  q.verified.members[1].guid=f.e.ROSTER[1].guid;f.rosterEvent();f.tick()
  f.nativeRows[1].member.guid=nil;f.tick()
  check("native row without its exact GUID never exposes Discord fields or promotion",b.username:GetText()=="—" and b.displayName:GetText()=="—" and not b.promote:IsEnabled())
  f.nativeRows[1].member={name=f.e.ROSTER[2].name.."-Forever",guid=f.e.ROSTER[2].guid};f.tick()
  check("recycled native row clears the previous identity's Discord text",b.username:GetText()=="—" and b.displayName:GetText()=="—" and b.rowGuid==f.e.ROSTER[2].guid)
  for _,row in ipairs(f.nativeRows)do row:Hide()end;f.tick()
  check("removed native rows clear text and stale action bindings",b.result==nil and b.rowGuid==nil and b.username:GetText()=="" and b.displayName:GetText()=="" and not b.promote:IsEnabled())
end
do
  local f=guildUI();local b=f.buttons()[1];local handler=f.nativeRows[1]:GetScript("OnMouseUp")
  check("native guild row handlers and frame dimensions remain untouched",f.host:GetWidth()==900 and f.nativeRows[1]:GetWidth()==600 and handler~=nil)
  f.right=1600;f.tick()
  check("insufficient screen space uses the existing roster fallback without offscreen names or actions",not f.column:IsShown() and f.fallback:IsShown())
  f.forceClick(b.promote);check("hidden offscreen fallback cannot dispatch a stale row action",f.promotions==0)
  f.right=1100;f.tick();f.e.InCombatLockdown=function()return true end;f.event("PLAYER_REGEN_DISABLED")
  local enabled=b.promote:IsEnabled()
  f.forceClick(b.promote)
  check("combat leaves protected Guild controls inert without insecure hiding, disabling or an armed command",f.column:IsShown() and not f.fallback:IsShown() and b.promote:IsEnabled()==enabled and f.promotions==0 and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  check("native handlers still have their original identities after refresh and combat",f.nativeRows[1]:GetScript("OnMouseUp")==handler and f.nativeClicks==0)
  f.e.InCombatLockdown=function()return false end;f.right=1600;f.event("PLAYER_REGEN_ENABLED");f.tick()
  check("ordinary out-of-combat paint catches up to the native view",not f.column:IsShown() and f.fallback:IsShown() and f.promotions==0)
end
do
  local f=guildUI();local b=f.buttons()[1]
  f.host.GuildMemberDetailFrame=f.e.CreateFrame("Frame",nil,f.host);f.host.GuildMemberDetailFrame:Show();f.tick()
  f.forceClick(b.promote)
  check("native member popup hides the column and rejects its old action callback",not f.column:IsShown() and not f.fallback:IsShown() and f.promotions==0)
  f.host.GuildMemberDetailFrame:Hide();f.tick()
  f.e.Enum={InputDeviceInterfaceType={Gamepad=2}};f.e.C_InputInterfaceStyle={GetCurrentStyle=function()return 2 end};f.tick()
  f.forceClick(b.promote)
  check("gamepad mode keeps the existing native Guild column fallback policy without acting",not f.column:IsShown() and not f.fallback:IsShown() and f.promotions==0)
end
do
  local f=guildUI();local b=f.buttons()[2];local id=f.e.ROSTER[2].guid
  check("a fresh verified Initiate without a recommendation has an enabled read-only Check",b.promote:GetText()=="Check" and b.promote.mode=="check" and b.promote:IsEnabled())
  b.promote:GetScript("OnEnter")(b.promote)
  local tip=table.concat(f.tooltipLines,"\n")
  check("Check explains export then Watcher then a later Sync reload and separate promotion",tip:find("reloads to export",1,true) and tip:find("Wait for the Watcher",1,true) and tip:find("Sync and reload again",1,true) and tip:find("Check never promotes",1,true))
  b.promote:Click()
  local control=f.e.OlympusVerifyDB.launchControl
  check("Guild Check reuses the actual signed selected-read control for its exact GUID",control and control.version==2 and control.action=="select" and control.targetGuid==id and type(control.mac)=="string" and #control.mac==32 and f.syncs==1)
  check("a Guild Check neither arms a native command nor creates promotion history",f.promotions==0 and f.restrictedCalls==0 and f.e.ROSTER[2].rankIndex==9 and not next(f.e.OlympusVerifyDB.launchPromotionAttempts or {}) and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  f.tick()
  check("queued Check does not claim immediate promotion readiness",b.promote:GetText()~="Promote" and f.promotions==0)
end
do
  local f=guildUI();local b=f.buttons()[1]
  f.now=f.page.expiresAt;f.rosterEvent();f.tick()
  check("an expired recommendation becomes Check rather than an ambiguous disabled Promote",b.promote:GetText()=="Check" and b.promote:IsEnabled())
  b.promote:Click()
  check("expired Check requests a new read without renewing the old page or promoting",f.e.OlympusVerifyDB.launchControl.targetGuid==f.e.ROSTER[1].guid and f.page.expiresAt==f.now and f.promotions==0 and f.syncs==1)
end
do
  local f=guildUI();local b=f.buttons()[1];local id=f.e.ROSTER[1].guid
  local held={state="unknown",target=8};f.e.OlympusVerifyDB.launchPromotionAttempts={[id]=held};f.tick()
  check("unknown native history is explicitly Held and never offered as a recheck",b.promote:GetText()=="Held" and not b.promote:IsEnabled() and b.promote.mode==nil)
  f.forceClick(b.promote)
  check("forcing a held old Guild control cannot clear history or send a read or promotion",f.e.OlympusVerifyDB.launchPromotionAttempts[id]==held and held.state=="unknown" and f.e.OlympusVerifyDB.launchControl==nil and f.promotions==0 and f.syncs==0)
  f.e.OlympusLaunchQueue=nil;f.tick();f.forceClick(b.promote)
  check("missing projection cannot disguise an existing unknown as a safe Check",b.promote:GetText()=="Held" and f.e.OlympusVerifyDB.launchPromotionAttempts[id]==held and f.syncs==0)
end
do
  local f=guildUI();local b=f.buttons()[2];local row=table.remove(f.q.verified.members,2)
  f.q.unverified.members[1]={name=row.name,guid=row.guid,pending=false};f.rosterEvent();f.tick()
  check("unverified rows show no misleading promotion or Check action",b.promote:GetText()=="—" and not b.promote:IsEnabled())
  f=guildUI();b=f.buttons()[1];f.e.ROSTER[1].rankIndex=8;f.rosterEvent();f.tick()
  check("a current native Member is labeled Member with no repeat action",b.promote:GetText()=="Member" and not b.promote:IsEnabled())
  local legacy={state="unknown",target=8};f.e.OlympusVerifyDB.launchPromotionAttempts={[f.e.ROSTER[1].guid]=legacy};f.tick()
  b.promote:GetScript("OnEnter")(b.promote)
  check("native Member label does not hide or resolve retained unknown history",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.e.OlympusVerifyDB.launchPromotionAttempts[f.e.ROSTER[1].guid]==legacy
    and table.concat(f.tooltipLines,"\n"):find("does not confirm an earlier attempt",1,true) and legacy.state=="unknown" and f.promotions==0)
  f=guildUI();b=f.buttons()[1];b.promote:Click();f.rosterEvent();f.tick()
  local confirmed=f.e.OlympusVerifyDB.launchPromotionAttempts[f.e.ROSTER[1].guid]
  check("native Member with a confirmed receipt remains Member rather than Held",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and confirmed.state=="confirmed" and confirmed.completed and f.promotions==1)
end
do
  local f=guildUI();local b=f.buttons()[2]
  f.forceClick(b.promote,"RightButton");f.forceClick(b.promote,"LeftButton",true)
  f.e.IsAltKeyDown=function()return true end;f.forceClick(b.promote);f.e.IsAltKeyDown=function()return false end
  check("Check rejects right-click, down edge and modifiers without a selected read",f.syncs==0 and f.e.OlympusVerifyDB.launchControl==nil and f.promotions==0)
  b.promote:GetScript("PreClick")(b.promote,"LeftButton",false)
  f.nativeRows[2].member={name=f.e.ROSTER[3].name.."-Forever",guid=f.e.ROSTER[3].guid}
  b.promote:GetScript("OnClick")(b.promote,"LeftButton",false)
  b.promote:GetScript("PostClick")(b.promote,"LeftButton",false)
  check("recycling a native row between Check phases cannot submit the old or new identity",f.syncs==0 and f.e.OlympusVerifyDB.launchControl==nil and f.promotions==0 and not b.promote:GetAttribute("type1"))
end
for _,case in ipairs({"global-save-conflict","per-guid-save-hold","malformed-save-holds"}) do
  local f=guildUI();local b=f.buttons()[2];local db=f.e.OlympusVerifyDB;local id=f.e.ROSTER[2].guid
  if case=="global-save-conflict" then db.launchPromotionCustodyConflict=false -- Any nonnil conflict fails closed.
  elseif case=="per-guid-save-hold" then db.launchPromotionSaveHolds={[id]={reason="conflicting-attempt"}}
  else db.launchPromotionSaveHolds="unreadable" end
  f.tick();f.forceClick(b.promote)
  check("Guild Check follows shared "..case.." custody admission",b.promote:GetText()=="Held" and not b.promote:IsEnabled() and f.syncs==0 and f.promotions==0 and db.launchControl==nil)
  f.e.OlympusLaunchQueue=nil;f.tick();f.forceClick(b.promote)
  check("absent projection cannot bypass shared "..case.." read hold",b.promote:GetText()=="Held" and f.syncs==0 and f.promotions==0 and db.launchControl==nil)
end

do
  local f=guildUI(1000);local nativeReads=f.reads;local current=f.launch.Current;local sourceReads=0
  f.launch.Current=function()sourceReads=sourceReads+1;return current()end
  for _=1,5 do f.tick()end
  check("thousand-member native Guild paint shares native indexes and one source read per visible batch",f.reads==nativeReads and sourceReads==5 and f.promotions==0 and f.restrictedCalls==0)
end
print("guild_status268: "..passed.." passed, 0 failed")

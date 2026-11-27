-- Actual core/Guild display with synthetic native APIs and generated-list shapes.
-- No Config.lua, installed data, transport, messages or role actions are used.
-- The Guild column part moved to officer-operations-v234 (Stage 2 addon280,
-- 13 Nov 2026): 12 November ranks (Member 7, Alt 8, Initiate 9), a signed
-- advisory v234 discovery page, and a sealed selected Directive read for the
-- one ready row; guildUI(size,true) leaves only discovery, where rows offer Check.
local D = assert(loadfile("directive_fixture280.lua"))()
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
      guid=string.format("Player-1-%08X",i),rank="Member",rankIndex=7,level=60,online=true}
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
local function guildUI(size,discoveryOnly,initialHistory)
  local f=fixture(size or 3);local e=f.e
  for _,row in ipairs(e.ROSTER) do row.rank,row.rankIndex="Initiate",9 end
  local q=f.install(2,0)
  for i,row in ipairs(q.verified.members) do row.username="user"..i;row.displayName="Display "..i end
  e.GetGuildRosterShowOffline=function()return true end
  e.CanGuildPromote=function()return true end
  f.names=D.ranks(e)
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
  f.actor,f.scope=e.UnitGUID("player"),D.scope(e,f.guild,f.realm)
  f.page=D.stamp(e,{fetchedAt=f.now,expiresAt=f.now+60,status="ready",snapshotId=1,snapshotAt=f.now,
    memberCount=#e.ROSTER,guild=f.guild,realm=f.realm,canonicalGuild="OLYMPUS PRIME",scopeHash=f.scope,
    entitlements={offset=0,total=#e.ROSTER},scan={id=string.rep("a",32),startedAt=f.now,expiresAt=f.now+600},
    promotions={{name=e.ROSTER[1].name,guid=e.ROSTER[1].guid,currentSlot=9,targetSlot=7,targetName="Member",reason="verified-initiate"}},
    invites={},riskBuffer={},held={},actions={automatic=false,roleGrants=false,removals=false,requiresNativeRecheck=true}})
  e.OlympusLaunchQueue={version=3,scanComplete=true,pages={f.page}}
  f.discovery=D.signDiscovery(e,e.OlympusLaunchQueue,f.actor,f.scope,"scan",0,f.now)
  -- The selected Directive read for row 1 (Initiate 9 > Alt 8 > Member 7). This
  -- fixture's clock is f.now, so every original time is passed explicitly.
  f.publish=function(o)
    o=o or {}
    local data,page=D.publish(e,{guild=f.guild,realm=f.realm,actor=f.actor,scopeHash=f.scope,control=o.control,observedAt=f.now,fetchedAt=f.now,
      snapshotAt=o.snapshotAt or f.now,snapshotId=o.snapshotId or 2,ttl=60,total=#e.ROSTER,context=o.context,
      specs={{guid=e.ROSTER[1].guid,name=e.ROSTER[1].name,start=9,final=7,ack=o.ack,origin=o.origin,intentId=o.intentId}}})
    f.sel,f.sp=data,page
    if not o.ack then f.intent=page.promotions[1].intent end
    return data,page
  end
  f.continue=function()
    local p=f.intent
    assert(f.launch.Select(e.ROSTER[1].guid),"selected continuation read")
    return f.publish({ack=1,control=e.OlympusVerifyDB.launchControl,snapshotId=3,context=string.rep("e",32),intentId=p.id,
      origin={snapshotId=p.originSnapshotId,snapshotAt=p.originSnapshotAt,context=p.originContext,issued=p.issuedAt,expires=p.expiresAt}})
  end
  if initialHistory then initialHistory(f) end -- Saved history exists before launch captures its storage owner.
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLaunch229.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyRosterModel.lua")),e)("OlympusVerify")
  f.launch=e.OlympusLaunch229
  f.syncs=0;e.OlympusVerifyAPI.Sync=function()f.syncs=f.syncs+1 end
  f.rosterEvent=function()f.event("GUILD_ROSTER_UPDATE");f.launch.Events:GetScript("OnEvent")(f.launch.Events,"GUILD_ROSTER_UPDATE")end
  if not discoveryOnly then f.publish() end
  f.rosterEvent()
  e.UIParent:Show();e.UIParent.GetRight=function(self)return self:GetWidth() end
  f.tooltipLines={}
  e.GameTooltip.SetText=function(_,text)f.tooltipLines={text}end
  e.GameTooltip.AddLine=function(_,text)f.tooltipLines[#f.tooltipLines+1]=text end
  local host=e.CreateFrame("Frame",nil,e.UIParent);host:Show();host:SetSize(900,700)
  host.GetRight=function(self)return f.right or 200 + self:GetWidth() end;host.GetAlpha=function()return 1 end;host.GuildMemberDetailFrame=false
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
    if frame.nativeHost==host and frame.promote then f.column=frame._parent end
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
  local f=guildUI(nil,true)
  local e,b=f.e,f.buttons()[2]
  local profile=e.OlympusVerifyNativeRankConstants.profiles[2]
  for i,name in ipairs(profile.names) do f.names[i]=name end
  e.ROSTER[2].rankIndex=8
  local current=f.launch.Current()
  current.identity.primeInitiates=true
  f.launch.Current=function() return current end
  f.rosterEvent();f.tick()
  local label=b.promote:GetFontString()
  local function fitsAction()
    return label:GetStringWidth() <= label:GetWidth() and label:GetWidth()+16 <= b.promote:GetWidth()
      and label:GetStringHeight()<=b.promote:GetHeight() and label._wrap==false
  end
  check("Check Veteran fits on one line inside the red native Guild action",b.promote:GetText()=="Check Veteran" and fitsAction())
  local defaultWidth=f.column:GetWidth()
  for _,font in ipairs(e.FONTS) do
    if font._parent==f.column and font:GetText()=="Check Veteran" or font==label then font:SetFont("large-ui-font",16) end
  end
  f.tick()
  check("wider UI font expands the shared action column and preserves both Discord fields",fitsAction() and f.column:GetWidth()>defaultWidth
    and select(2,b.username:GetPoint())==b.promote and select(2,b.displayName:GetPoint())==b.username)
  e.UIParent:SetSize(1400,800);f.tick()
  check("narrow window swaps the entire action column for Verify members",not f.column:IsShown() and f.fallback:IsShown())
  f.host:SetWidth(600);f.tick()
  check("resizing the actual guild panel restores the fully fitting action",f.column:IsShown() and not f.fallback:IsShown()
    and b.promote:GetText()=="Check Veteran" and fitsAction() and f.promotions==0 and f.syncs==0)
end
do
  local f=guildUI(nil,true)
  local wide,narrow
  for _,b in ipairs(f.e.FRAMES) do
    if b:GetText()=="Check all for Veteran" then
      if b._parent==f.column then wide=b elseif b._parent==f.fallback then narrow=b end
    end
  end
  local requested=0
  f.launch.CheckAllVeterans=function(...)
    assert(select("#",...)==0,"per-row selection must not restrict a full check")
    requested=requested+1
    return true,"Synthetic request queued"
  end
  local function fits(b) return b:GetFontString():GetStringWidth()+16 <= b:GetWidth() end
  check("Guild tab shows a dedicated fully fitting bulk check above the per-character actions",wide:IsVisible()
    and fits(wide) and not narrow:IsVisible() and wide~=f.buttons()[1].promote)
  wide:GetScript("OnEnter")(wide)
  check("the Guild bulk action describes scope, Sync, and individual promotion clicks",table.concat(f.tooltipLines," "):find("including offline Members",1,true)
    and table.concat(f.tooltipLines," "):find("Each rank change requires your click",1,true))
  wide:Click();narrow:Click()
  check("the visible wide button requests the all-Member read exactly once",requested==1 and f.promotions==0)
  f.e.UIParent:SetSize(1000,750);f.tick()
  narrow:Click();wide:Click()
  check("on a compact screen the same fully fitting bulk command is separate from Verify members",not wide:IsVisible() and narrow:IsVisible()
    and fits(narrow) and select(2,narrow:GetPoint())==f.fallback and select(3,narrow:GetPoint())=="LEFT" and requested==2 and f.promotions==0)
  f.host:SetWidth(260);f.e.UIParent:SetWidth(500);f.tick()
  check("narrowing the native window stacks the two compact controls within its width",narrow:IsVisible()
    and select(3,narrow:GetPoint())=="BOTTOMRIGHT" and narrow:GetWidth()+44<=f.host:GetWidth())
  f.club=88;narrow:Click()
  f.club=nil;f.e.InCombatLockdown=function()return true end;narrow:Click()
  check("switching to another native community or starting combat before repaint suppresses the read",requested==2 and f.promotions==0)
end
do
  local f=guildUI();local buttons=f.buttons();local b=buttons[1]
  check("native Guild column renders both dated Discord name fields beside status",f.column:IsShown() and b.username:GetText()=="@user1" and b.displayName:GetText()=="Display 1" and b.text:GetText():find("Verified",1,true))
  check("explicit Promote is beside status and names never overlap its action box",select(2,b.promote:GetPoint())==b and select(3,b.promote:GetPoint())=="RIGHT" and select(4,b.promote:GetPoint())==6 and select(2,b.username:GetPoint())==b.promote and select(4,b.username:GetPoint())==8 and select(2,b.displayName:GetPoint())==b.username and select(4,b.displayName:GetPoint())==8 and 8+b:GetWidth()+6+b.promote:GetWidth()+8+b.username:GetWidth()+8+b.displayName:GetWidth()<=f.column:GetWidth()-8)
  -- A loaded selected read supersedes the discovery control, so the other rows
  -- cannot offer Promote; their separate Check is shown on discovery alone below.
  check("only the exact selected-ready Guild row offers Promote",b.promote:IsVisible() and b.promote:IsEnabled() and b.promote:GetText()=="Promote" and b.promote.mode=="promote"
    and buttons[2].promote:GetText()~="Promote" and buttons[2].promote.mode~="promote" and buttons[3].promote:GetText()~="Promote" and buttons[3].promote.mode~="promote")
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
  check("a newer complete native event confirms the Alt step without a second command",receipt.state=="confirmed" and not receipt.completed and receipt.observedSlot==8 and f.promotions==1)
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
  local f=guildUI(nil,true);local all=f.buttons()
  check("without a selected read every verified Initiate offers a separate Check and none offers Promote",all[1].promote:GetText()=="Check" and all[1].promote.mode=="check"
    and all[2].promote:GetText()=="Check" and all[3].promote:GetText()=="Check")
  local b=all[2];local id=f.e.ROSTER[2].guid
  check("a fresh verified Initiate without a recommendation has an enabled read-only Check",b.promote:GetText()=="Check" and b.promote.mode=="check" and b.promote:IsEnabled())
  b.promote:GetScript("OnEnter")(b.promote)
  local tip=table.concat(f.tooltipLines,"\n")
  check("Check explains export then Watcher then a later Sync reload and separate promotion",tip:find("reloads to export",1,true) and tip:find("Wait for the Watcher",1,true) and tip:find("Sync and reload again",1,true) and tip:find("Check never promotes",1,true))
  b.promote:Click()
  local control=f.e.OlympusVerifyDB.launchControl
  check("Guild Check reuses the actual signed selected-read control for its exact GUID",control and control.version==4 and control.action=="select-directive" and #control.targetGuids==1 and control.targetGuids[1]==id and type(control.mac)=="string" and #control.mac==32 and f.syncs==1)
  check("a Guild Check neither arms a native command nor creates promotion history",f.promotions==0 and f.restrictedCalls==0 and f.e.ROSTER[2].rankIndex==9 and not next(f.e.OlympusVerifyDB.launchPromotionAttempts or {}) and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  f.tick()
  check("queued Check does not claim immediate promotion readiness",b.promote:GetText()~="Promote" and f.promotions==0)
end
do
  local f=guildUI();local b=f.buttons()[1]
  f.now=f.sp.expiresAt;f.rosterEvent();f.tick()
  check("an expired recommendation becomes Check rather than an ambiguous disabled Promote",b.promote:GetText()=="Check" and b.promote:IsEnabled())
  b.promote:Click()
  check("expired Check requests a new read without renewing the old page or promoting",f.e.OlympusVerifyDB.launchControl.targetGuids[1]==f.e.ROSTER[1].guid and f.sp.expiresAt==f.now and f.promotions==0 and f.syncs==1)
end
do
  local f=guildUI();local b=f.buttons()[1];local id=f.e.ROSTER[1].guid
  local held={state="unknown",target=8};f.e.OlympusVerifyDB.launchPromotionAttempts={[id]=held};f.tick()
  check("unknown native history is explicitly Held and never offered as a recheck",b.promote:GetText()=="Held" and not b.promote:IsEnabled() and b.promote.mode==nil)
  f.forceClick(b.promote)
  local control=f.e.OlympusVerifyDB.launchControl
  check("forcing a held old Guild control cannot clear history or send a read or promotion",f.e.OlympusVerifyDB.launchPromotionAttempts[id]==held and held.state=="unknown" and f.e.OlympusVerifyDB.launchControl==control and f.promotions==0 and f.syncs==0)
  f.e.OlympusLaunchQueue=nil;f.e.OlympusLaunchSelected=nil;f.tick();f.forceClick(b.promote)
  check("missing projection cannot disguise an existing unknown as a safe Check",b.promote:GetText()=="Held" and f.e.OlympusVerifyDB.launchPromotionAttempts[id]==held and f.syncs==0)
end
do
  local f=guildUI(nil,true);local b=f.buttons()[2];local row=table.remove(f.q.verified.members,2)
  f.q.unverified.members[1]={name=row.name,guid=row.guid,pending=false};f.rosterEvent();f.tick()
  check("unverified rows show no misleading promotion or Check action",b.promote:GetText()=="—" and not b.promote:IsEnabled())
  f=guildUI();b=f.buttons()[1];f.e.ROSTER[1].rankIndex=7;f.rosterEvent();f.tick()
  check("a current native Member is labeled Member with no repeat action",b.promote:GetText()=="Member" and not b.promote:IsEnabled())
  local legacy={state="unknown",target=8};f.e.OlympusVerifyDB.launchPromotionAttempts={[f.e.ROSTER[1].guid]=legacy};f.tick()
  b.promote:GetScript("OnEnter")(b.promote)
  check("native Member label does not hide or resolve retained unknown history",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.e.OlympusVerifyDB.launchPromotionAttempts[f.e.ROSTER[1].guid]==legacy
    and table.concat(f.tooltipLines,"\n"):find("does not confirm an earlier attempt",1,true) and legacy.state=="unknown" and f.promotions==0)
  f=guildUI();b=f.buttons()[1];b.promote:Click();f.rosterEvent();f.tick()
  check("after the confirmed Alt step the Guild row offers Check next, never Promote",b.promote:GetText()=="Check next" and b.promote.mode=="check" and f.promotions==1)
  f.now=f.now+1;f.continue();f.rosterEvent();f.tick()
  check("the acknowledged next step makes the same Guild row Promote again",b.promote:GetText()=="Promote" and b.promote.mode=="promote" and f.promotions==1)
  b.promote:Click();f.now=f.now+1;f.rosterEvent();f.tick()
  local confirmed=f.e.OlympusVerifyDB.launchPromotionAttempts[f.e.ROSTER[1].guid]
  check("native Member with a confirmed receipt remains Member rather than Held",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and confirmed.state=="confirmed" and confirmed.completed and f.promotions==2 and f.e.ROSTER[1].rankIndex==7)
end
do
  local f=guildUI(nil,true);local b=f.buttons()[2]
  f.forceClick(b.promote,"RightButton");f.forceClick(b.promote,"LeftButton",true)
  f.e.IsAltKeyDown=function()return true end;f.forceClick(b.promote);f.e.IsAltKeyDown=function()return false end
  check("Check rejects right-click, down edge and modifiers without a selected read",f.syncs==0 and f.e.OlympusVerifyDB.launchControl==f.discovery and f.promotions==0)
  b.promote:GetScript("PreClick")(b.promote,"LeftButton",false)
  f.nativeRows[2].member={name=f.e.ROSTER[3].name.."-Forever",guid=f.e.ROSTER[3].guid}
  b.promote:GetScript("OnClick")(b.promote,"LeftButton",false)
  b.promote:GetScript("PostClick")(b.promote,"LeftButton",false)
  check("recycling a native row between Check phases cannot submit the old or new identity",f.syncs==0 and f.e.OlympusVerifyDB.launchControl==f.discovery and f.promotions==0 and not b.promote:GetAttribute("type1"))
end
for _,case in ipairs({"global-save-conflict","per-guid-save-hold","malformed-save-holds"}) do
  local f=guildUI(nil,true);local b=f.buttons()[2];local db=f.e.OlympusVerifyDB;local id=f.e.ROSTER[2].guid
  if case=="global-save-conflict" then db.launchPromotionCustodyConflict=false -- Any nonnil conflict fails closed.
  elseif case=="per-guid-save-hold" then db.launchPromotionSaveHolds={[id]={reason="conflicting-attempt"}}
  else db.launchPromotionSaveHolds="unreadable" end
  f.tick();f.forceClick(b.promote)
  check("Guild Check follows shared "..case.." custody admission",b.promote:GetText()=="Held" and not b.promote:IsEnabled() and f.syncs==0 and f.promotions==0 and db.launchControl==f.discovery)
  f.e.OlympusLaunchQueue=nil;f.tick();f.forceClick(b.promote)
  check("absent projection cannot bypass shared "..case.." read hold",b.promote:GetText()=="Held" and f.syncs==0 and f.promotions==0 and db.launchControl==f.discovery)
end

do
  local f=guildUI(nil,true);local e=f.e;local b=f.buttons()[1]
  local steward=e.OlympusVerifyNativeRankConstants.profiles[2]
  for i,name in ipairs(steward.names) do f.names[i]=name end
  local held={state="unknown",target=8};e.OlympusVerifyDB.launchPromotionAttempts={[e.ROSTER[1].guid]=held}
  e.ROSTER[1].rankIndex=7;f.rosterEvent();f.tick()
  check("Steward Alt at native index 7 remains Held rather than being mislabeled Member",b.promote:GetText()=="Held" and not b.promote:IsEnabled()
    and e.OlympusVerifyDB.launchPromotionAttempts[e.ROSTER[1].guid]==held and held.state=="unknown" and f.promotions==0)
  e.ROSTER[1].rankIndex=8;f.rosterEvent();f.tick()
  b.promote:GetScript("OnEnter")(b.promote)
  check("Steward Member at native index 8 is labeled from its exact observed scheme without resolving history",b.promote:GetText()=="Member" and not b.promote:IsEnabled()
    and table.concat(f.tooltipLines,"\n"):find("does not confirm an earlier attempt",1,true) and held.state=="unknown" and f.promotions==0)
  e.ROSTER[1].rankLabel="Alt";f.rosterEvent();f.tick()
  check("a Member slot with a conflicting native rank label is not certified as Member",b.promote:GetText()~="Member" and held.state=="unknown")
  e.ROSTER[1].rankLabel=nil;f.names[2]="Unreviewed Rank";f.rosterEvent();f.tick()
  check("an unrecognised complete native table cannot inherit a Member display target",b.promote:GetText()~="Member" and f.promotions==0)
end
do
  local function stewardKnight()
    local f=guildUI(nil,true);local e=f.e;local c=e.OlympusVerifyNativeRankConstants.profiles[2]
    for i,name in ipairs(c.names) do f.names[i]=name end
    f.publishKnight=function(o)
      o=o or {}
      local data,page=D.publish(e,{guild=f.guild,realm=f.realm,actor=f.actor,scopeHash=f.scope,control=o.control,
        observedAt=f.now,fetchedAt=f.now,snapshotAt=f.now,snapshotId=o.snapshotId or 2,ttl=60,total=#e.ROSTER,
        context=o.context,specs={{guid=e.ROSTER[1].guid,name=e.ROSTER[1].name,start=9,final=5,
          ack=o.ack,origin=o.origin,intentId=o.intentId}}})
      page.rankProfile,page.rankSchemeDigest,page.rankNames=c.profile,c.digest,{unpack(c.names)}
      local row=page.promotions[1];row.targetSlot=6
      row.intent.rankProfile,row.intent.rankSchemeDigest,row.intent.finalSlot=c.profile,c.digest,6
      f.sel,f.sp=data,page
      if not o.ack then f.intent=row.intent end
      return data,page
    end
    f.publishKnight();f.rosterEvent();f.tick()
    return f
  end
  local f=stewardKnight();local e=f.e;local id=e.ROSTER[1].guid;local b=f.buttons()[1]
  check("a signed Steward Knight plan starts with the exact Initiate9 native Guild Promote",b.promote:GetText()=="Promote" and b.promote:IsEnabled())
  b.promote:Click();f.now=f.now+1;f.rosterEvent();f.tick()
  local original=e.OlympusVerifyDB.launchPromotionAttempts[id]
  check("the owned Knight9-to-Member8 step is confirmed but its Veteran6 target remains unfinished",
    f.promotions==1 and e.ROSTER[1].rankIndex==8 and original.state=="confirmed" and not original.completed
    and original.observedSlot==8 and original.target==6 and #original.steps==1 and f.launch.PromotionStatus(id,f.launch.Current(),8)=="recheck")
  check("an owned Knight continuation at native Member8 offers Check next rather than the disabled Member fallback",
    b.promote:GetText()=="Check next" and b.promote:IsEnabled() and b.promote.mode=="check")
  local bound=b.promote.bound;b.promote.bound=false;f.tick();f.forceClick(b.promote)
  check("an unbound Member8 continuation cannot submit a recheck",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.syncs==0 and f.promotions==1)
  b.promote.bound=bound;local select=f.launch.Select;f.launch.Select=nil;f.tick();f.forceClick(b.promote)
  check("a Member8 continuation without the shared Select API stays disabled",b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.syncs==0 and f.promotions==1)
  f.launch.Select=select;f.tick();b.promote:Click()
  local control=e.OlympusVerifyDB.launchControl
  check("Member8 Check next submits only the exact signed read and preserves its original unfinished attempt",
    control.version==4 and control.action=="select-directive" and #control.targetGuids==1 and control.targetGuids[1]==id
    and f.syncs==1 and f.promotions==1 and e.OlympusVerifyDB.launchPromotionAttempts[id]==original
    and original.state=="confirmed" and not original.completed and #original.steps==1
    and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  local intent=f.intent;f.now=f.now+1
  f.publishKnight({ack=1,control=control,snapshotId=3,context=string.rep("e",32),intentId=intent.id,
    origin={snapshotId=intent.originSnapshotId,snapshotAt=intent.originSnapshotAt,context=intent.originContext,issued=intent.issuedAt,expires=intent.expiresAt}})
  f.rosterEvent();f.tick()
  check("the newly acknowledged Knight step still reaches Promote before the Member fallback",
    b.promote:GetText()=="Promote" and b.promote:IsEnabled() and b.promote.mode=="promote"
    and f.launch.PromotionStatus(id,f.launch.Current(),8)=="continue" and f.promotions==1)
  f.launch.promotionBlocked=true;f.tick();f.forceClick(b.promote)
  check("blocked Member8 history is never a Check next or a repeat promotion",b.promote:GetText()=="Member" and not b.promote:IsEnabled()
    and f.launch.promotionBlocked==true and f.syncs==1 and f.promotions==1 and e.OlympusVerifyDB.launchPromotionAttempts[id]==original)
  f.launch.promotionBlocked=nil;f.now=original.intentExpiresAt;f.rosterEvent();f.tick();f.forceClick(b.promote)
  check("expired unfinished Member8 history stays disabled with its original clocks and receipt",
    b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.syncs==1 and f.promotions==1
    and e.OlympusVerifyDB.launchPromotionAttempts[id]==original and not original.completed and #original.steps==1)
  for _,kind in ipairs({"unknown","missing-receipt"}) do
    f=stewardKnight();e=f.e;id=e.ROSTER[1].guid;b=f.buttons()[1];e.ROSTER[1].rankIndex=8;f.rosterEvent()
    local retained={state="unknown",target=6}
    if kind=="unknown" then e.OlympusVerifyDB.launchPromotionAttempts={[id]=retained}
    else retained=assert(f.launch.HoldPromotionHistoryReview(id)) end
    f.tick();f.forceClick(b.promote)
    check("native Member8 "..kind.." history remains disabled without relabeling or clearing it",
      b.promote:GetText()=="Member" and not b.promote:IsEnabled() and b.promote.mode==nil and f.promotions==0 and f.syncs==0
      and (kind=="unknown" and e.OlympusVerifyDB.launchPromotionAttempts[id]==retained and retained.state=="unknown"
        or kind=="missing-receipt" and e.OlympusVerifyDB.launchPromotionSaveHolds[id]==retained
          and retained.commandAttempted==false and retained.historicalOutcomeSettled==false
          and (e.OlympusVerifyDB.launchPromotionAttempts==nil or e.OlympusVerifyDB.launchPromotionAttempts[id]==nil)))
  end
  f=stewardKnight();e=f.e;id=e.ROSTER[1].guid;b=f.buttons()[1];e.ROSTER[1].rankIndex=8;f.rosterEvent()
  local current=f.launch.Current()
  e.OlympusVerifyRosterModel.Promotions=function()return {},{current=current,byGuid={[id]={state="recheck",reason="Synthetic fake recheck"}}}end
  f.tick();f.forceClick(b.promote)
  check("a fake Member8 recheck display without owned continuation cannot request a read",
    b.promote:GetText()=="Member" and not b.promote:IsEnabled() and f.launch.PromotionStatus(id,current,8)=="clear" and f.promotions==0 and f.syncs==0)
end
do
  local function copy(value)
    if type(value)~="table" then return value end
    local result={};for k,v in pairs(value) do result[k]=copy(v) end;return result
  end
  local function same(a,b)
    if type(a)~=type(b) then return false end
    if type(a)~="table" then return a==b end
    for k,v in pairs(a) do if not same(v,b[k]) then return false end end
    for k in pairs(b) do if a[k]==nil then return false end end
    return true
  end
  for _,profileIndex in ipairs({1,2}) do
    for _,kind in ipairs({"expired-confirmed","unknown","blocked","save-hold","custody-conflict","no-projection"}) do
      local f=guildUI(nil,true,function(f)
        if kind~="expired-confirmed" and kind~="save-hold" then
          f.e.OlympusVerifyDB.launchPromotionAttempts={[f.e.ROSTER[1].guid]={state="unknown",target=profileIndex==2 and 6 or 5,original="retained-veteran"}}
        end
      end);local e=f.e;local b=f.buttons()[1];local id=e.ROSTER[1].guid
      local c=e.OlympusVerifyNativeRankConstants.profiles[profileIndex];local veteranSlot=profileIndex==2 and 6 or 5
      for i,name in ipairs(c.names) do f.names[i]=name end
      local data,page=D.publish(e,{guild=f.guild,realm=f.realm,actor=f.actor,scopeHash=f.scope,
        observedAt=f.now,fetchedAt=f.now,snapshotAt=f.now,snapshotId=2,ttl=60,total=#e.ROSTER,
        specs={{guid=id,name=e.ROSTER[1].name,start=9,final=5}}})
      page.rankProfile,page.rankSchemeDigest,page.rankNames=c.profile,c.digest,{unpack(c.names)}
      local plan=page.promotions[1];plan.targetSlot=veteranSlot
      plan.intent.rankProfile,plan.intent.rankSchemeDigest,plan.intent.finalSlot=c.profile,c.digest,veteranSlot
      f.rosterEvent();f.tick()
      if kind=="expired-confirmed" then
        b.promote:Click();f.now=f.now+1;f.rosterEvent();f.tick()
        local original=e.OlympusVerifyDB.launchPromotionAttempts[id]
        check("fixture has an actual confirmed incomplete Knight step before manual Veteran "..c.profile,
          f.promotions==1 and original.state=="confirmed" and not original.completed and #original.steps==1)
        f.now=original.intentExpiresAt
      elseif kind=="save-hold" then assert(f.launch.HoldPromotionHistoryReview(id)) end
      if kind=="blocked" then f.launch.promotionBlocked=true end
      if kind=="custody-conflict" then e.OlympusVerifyDB.launchPromotionCustodyConflict=false end
      if kind=="no-projection" then e.OlympusLaunchQueue=nil;e.OlympusLaunchSelected=nil end
      e.ROSTER[1].rankIndex=veteranSlot;f.rosterEvent()
      local db=e.OlympusVerifyDB;local ledger,holds=db.launchPromotionAttempts,db.launchPromotionSaveHolds
      local originalLedger,originalHolds=copy(ledger),copy(holds);local conflict=db.launchPromotionCustodyConflict
      local control=db.launchControl;local sent=f.promotions
      f.tick();b.promote:GetScript("OnEnter")(b.promote)
      check("exact current Veteran is disabled rather than Held "..c.profile.." "..kind,
        b.promote:GetText()=="Veteran" and not b.promote:IsEnabled() and b.promote.mode==nil
        and table.concat(f.tooltipLines,"\n"):find("current native rank is Veteran",1,true)
        and table.concat(f.tooltipLines,"\n"):find("does not confirm an earlier attempt",1,true))
      f.forceClick(b.promote)
      check("forced Veteran click leaves every history field and action unchanged "..c.profile.." "..kind,
        db.launchPromotionAttempts==ledger and same(ledger,originalLedger)
        and db.launchPromotionSaveHolds==holds and same(holds,originalHolds) and db.launchPromotionCustodyConflict==conflict
        and db.launchControl==control and f.promotions==sent and f.syncs==0 and f.restrictedCalls==0
        and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
      check("Veteran display does not settle launch history "..c.profile.." "..kind,
        f.launch.AttemptHeld(id,f.launch.Current(),veteranSlot)==true)
    end
    local f=guildUI(nil,true);local e=f.e;local b=f.buttons()[1];local id=e.ROSTER[1].guid
    local c=e.OlympusVerifyNativeRankConstants.profiles[profileIndex];local veteranSlot=profileIndex==2 and 6 or 5
    for i,name in ipairs(c.names) do f.names[i]=name end
    e.ROSTER[1].rankIndex=veteranSlot;e.ROSTER[1].rankLabel="Knight";f.rosterEvent();f.tick()
    check("conflicting native Veteran slot label cannot receive Veteran display "..c.profile,
      b.promote:GetText()~="Veteran" and not b.promote:IsEnabled() and f.promotions==0)
    e.ROSTER[1].rankLabel=nil;f.names[2]="Unreviewed Rank";f.rosterEvent();f.tick()
    check("unknown complete native table cannot inherit Veteran display "..c.profile,
      b.promote:GetText()~="Veteran" and f.promotions==0)
    for i,name in ipairs(c.names) do f.names[i]=name end
    local otherGuid=e.ROSTER[2].guid
    e.ROSTER[2].guid=id;f.rosterEvent();f.tick();f.forceClick(b.promote)
    check("duplicate native GUID cannot claim attained Veteran "..c.profile,
      b.promote:GetText()~="Veteran" and not b.promote:IsEnabled() and f.promotions==0 and f.syncs==0)
    e.ROSTER[2].guid=otherGuid;f.nativeRows[1].member.guid=nil;f.rosterEvent();f.tick()
    check("a native row missing its exact GUID cannot claim attained Veteran "..c.profile,
      b.promote:GetText()~="Veteran" and not b.promote:IsEnabled() and f.promotions==0 and f.syncs==0)
    f.nativeRows[1].member.guid=id
    e.OlympusVerifyRosterModel.Promotions=function()
      return {[id]=true},{byGuid={[id]={state="ready",reason="Synthetic stale ready model"}}}
    end
    f.rosterEvent();f.tick();f.forceClick(b.promote)
    check("current exact Veteran defeats a forged ready display and forced click "..c.profile,
      b.promote:GetText()=="Veteran" and not b.promote:IsEnabled() and b.promote.mode==nil
      and f.promotions==0 and f.syncs==0 and not b.promote:GetAttribute("type1") and not b.promote:GetAttribute("macrotext1"))
  end
end

do
  local f=guildUI(1000,true);local e=f.e;local steward=e.OlympusVerifyNativeRankConstants.profiles[2]
  for i,name in ipairs(steward.names) do f.names[i]=name end
  for _,row in ipairs(e.ROSTER) do row.rankIndex=7 end
  -- Isolate the display cache from the launch authority's separate read path.
  e.OlympusVerifyRosterModel.Promotions=function()
    local details={byGuid={}}
    for _,row in ipairs(e.ROSTER) do details.byGuid[row.guid]={state="recheck",reason="Synthetic acknowledged continuation"} end
    return {},details
  end
  local names,counts=0,0;local readName,readCount=e.GuildControlGetRankName,e.GuildControlGetNumRanks
  e.GuildControlGetRankName=function(i) names=names+1;return readName(i) end
  e.GuildControlGetNumRanks=function() counts=counts+1;return readCount() end
  f.rosterEvent();f.tick();local nativeReads=f.reads
  for _=1,5 do f.tick() end
  check("Steward Alt continuation is Check next rather than Member",f.buttons()[1].promote:GetText()=="Check next" and f.buttons()[1].promote.mode=="check")
  check("Guild rank display captures one exact ten-rank table per cached generation, never per visible row",names==10 and counts==2 and f.reads==nativeReads)
  f.now=f.now+6;f.tick()
  check("rank display cache refreshes with its native roster generation",names==20 and counts==4 and f.reads==nativeReads+1000 and f.promotions==0)
end
do
  local f=guildUI(1000);local nativeReads=f.reads;local current=f.launch.Current;local sourceReads=0
  f.launch.Current=function()sourceReads=sourceReads+1;return current()end
  for _=1,5 do f.tick()end
  check("thousand-member native Guild paint shares native indexes and one source read per visible batch",f.reads==nativeReads and sourceReads==5 and f.promotions==0 and f.restrictedCalls==0)
end
-- Real guild module and capture/blank-realm binding. All chat events stay in
-- the synthetic client. In particular a direct send does not fake its echo.
local function reminderClient(blank)
  local f=fixture(2);local e=f.e
  local prime="CAMWOW US2 Realm 3 PvE"
  f.member,f.actor=e.ROSTER[1],e.ROSTER[2]
  f.member.name,f.member.rankIndex="Ñò Example",9
  f.actor.name,f.actor.rankIndex="Fern Melder",0
  e.PLAYER_GUID=f.actor.guid
  f.realm=blank and "" or prime
  e.GetGuildInfo=function() return f.guild,"Guild Master",f.actor.rankIndex end
  e.GetGuildRosterShowOffline=function() return true end
  local read=e.GetGuildRosterInfo
  e.GetGuildRosterInfo=function(i)
    local data={read(i)}
    if e.ROSTER[i] then data[1]=e.ROSTER[i].name end
    return unpack(data,1,17)
  end
  local hash=e.OlympusHmac.sha256hex
  e.OlympusHmac.sha256hex=function(input)
    if input=="prime-guild-master|1|"..f.actor.guid then return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16" end
    return hash(input)
  end
  D.ranks(e)
  f.fresh=function()
    assert(e.OlympusVerifyAPI.ExportRoster()==2,"synthetic native roster")
    local q=f.install(2,0)
    q.realm=prime
    q.verified.members={q.verified.members[2]}
    q.unverified.members={{name=f.member.name,guid=f.member.guid,pending=false}}
  end
  f.fresh()
  f.event("PLAYER_LOGIN")
  f.calls={}
  e.SendChatMessage=function(body,channel,lang,target)
    f.calls[#f.calls+1]={body=body,channel=channel,lang=lang,target=target}
  end
  f.send=function() return f.g.SendInitiateReminder(f.member.name,f.member.guid) end
  f.history=function() return f.g.ReminderHistory(f.member.guid) end
  f.chat=function(event,body,name,guid)
    local args={[1]=body,[2]=name,[11]=19,[12]=guid}
    f.frame:GetScript("OnEvent")(f.frame,event,unpack(args,1,12))
  end
  f.echo=function()
    f.chat("CHAT_MSG_WHISPER_INFORM",f.calls[#f.calls].body,f.member.name,f.actor.guid)
  end
  f.ack=function() f.chat("CHAT_MSG_WHISPER","GOT IT",f.member.name,f.member.guid) end
  f.reload=function()
    setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyGuild.lua")),e)("OlympusVerify",{})
    f.g=e.OlympusVerifyGuild;f.frame=e.FRAMES[#e.FRAMES];f.event("PLAYER_LOGIN")
  end
  return f
end
do
  local f=reminderClient(true);local m=f.member
  local eligible,reason=f.g.ReminderEligibility(m.name,m.guid)
  check("enrolled blank-realm observer can use one direct reminder for an online red Initiate: "..tostring(reason),eligible and not reason)
  local rows,_,rev=f.history()
  check("empty history can be cached",#rows==0 and rev==0 and f.g.ReminderHistory(nil,rev)==nil)
  check("one click sends one private addressed whisper",f.send() and #f.calls==1 and f.calls[1].channel=="WHISPER" and f.calls[1].target==m.name)
  local body=f.calls[1].body
  check("bounded fixed template asks for verification and an explicit acknowledgment",#body<=255 and body:find("Get my code",1,true) and body:find("GOT IT",1,true))
  check("dispatch alone records only an attempt",#f.history()==1 and not f.history()[1].sentAt and not f.history()[1].acknowledgedAt)
  f.ack();f.chat("CHAT_MSG_WHISPER_INFORM",body,"Another Person",m.guid)
  f.chat("CHAT_MSG_WHISPER_INFORM",body,m.name.."-WrongRealm",m.guid)
  f.chat("CHAT_MSG_WHISPER_INFORM",body.."!",m.name,m.guid)
  f.chat("CHAT_MSG_WHISPER_INFORM",body,m.name,"Player-9-FEED")
  check("no unrelated echo or premature reply establishes a send",not f.history()[1].sentAt and not f.history()[1].acknowledgedAt)
  f.now=f.now+1
  f.chat("CHAT_MSG_WHISPER_INFORM",body,m.name.."-CAMWOWUS2Realm3PvE",f.actor.guid)
  local sentAt=f.now
  check("matching realm-qualified outgoing event timestamps only the sent whisper",f.history()[1].sentAt==sentAt and not f.history()[1].acknowledgedAt)
  check("repeated click and roster repaint cannot send another reminder",not f.send() and #f.calls==1 and #f.history()==1)
  local first,_,revision=f.history();first[1].name="Changed"
  check("history copies preserve evidence and unchanged reads avoid copying it",f.history()[1].name==m.name and f.g.ReminderHistory(m.guid,revision)==nil)
  f.reload();f.now=f.now+601
  f.chat("CHAT_MSG_WHISPER","got it",m.name,m.guid)
  f.chat("CHAT_MSG_WHISPER","GOT IT!",m.name,m.guid)
  f.chat("CHAT_MSG_WHISPER","GOT IT",m.name,nil)
  f.chat("CHAT_MSG_WHISPER","GOT IT",m.name,"Player-1-0000Feed")
  f.chat("CHAT_MSG_WHISPER","GOT IT",m.name.."-AnotherRealm",m.guid)
  f.chat("CHAT_MSG_GUILD","GOT IT",m.name,m.guid)
  check("only exact private reply from same native GUID and realm qualifies",not f.history()[1].acknowledgedAt)
  f.ack();local firstAck=f.now;f.now=f.now+10;f.ack()
  check("first exact reply after reload survives expired blank-realm snapshot; duplicate never overwrites",f.history()[1].acknowledgedAt==firstAck and f.history()[1].sentAt==sentAt)
  f.e.ROSTER={f.actor};f.event("GUILD_ROSTER_UPDATE")
  check("departures preserve local history and actor identity",f.g.ReminderHistory()[1].officer=="Fern Melder")
  f.realm="Another Realm";local held,why,invalid=f.history()
  check("a different realm cannot view or modify saved history",#held==0 and why and not invalid)
end
do
  local f=reminderClient(false)
  local function held(label,change)
    local other=reminderClient(false);local e=other.e;change(other,e);local ok=other.send()
    check(label,not ok and #other.calls==0 and #other.history()==0)
  end
  held("offline changes after drawing are rechecked on click",function(x) x.g.ReminderEligibility(x.member.name,x.member.guid);x.member.online=false end)
  held("promotion before a click suppresses outreach",function(x) x.member.rankIndex=7 end)
  held("a hidden offline roster suppresses outreach",function(x,e) e.GetGuildRosterShowOffline=function() return false end end)
  held("a missing getter with no established visibility suppresses outreach",function(x,e) e.GetGuildRosterShowOffline=nil end)
  held("an unconfirmed legacy combat state suppresses outreach",function(x,e) e.InCombatLockdown=function() end;e.UnitAffectingCombat=function() return true end end)
  local legacy=reminderClient(false)
  legacy.e.GetGuildRosterShowOffline=nil
  assert(legacy.e.OlympusVerifyAPI.ExportRoster()==2)
  legacy.e.InCombatLockdown=function() end
  legacy.e.UnitAffectingCombat=function(unit) assert(unit=="player");return false end
  check("old clients with established visibility and independently explicit idle can whisper",legacy.send() and #legacy.calls==1)
  held("roster without current enrolled officer suppresses outreach",function(x,e) e.ROSTER={x.member} end)
  held("a different officer cannot use Fern's history",function(x,e) e.PLAYER_GUID="Player-2-BBBB" end)
  held("an expired original snapshot suppresses outreach",function(x) x.now=x.now+600 end)
  held("a Worker-pending verification suppresses outreach",function(x) x.q.unverified.members[1].pending=true end)
  held("a duplicate Worker GUID under a different name suppresses outreach",function(x) x.q.unverified.members[2]={name="Other",guid=x.member.guid,pending=false} end)
  held("same-name Worker review row suppresses outreach",function(x) x.q.unknown.members[1]={name=x.member.name,guid="Player-2-CCCC",reason="link_review"} end)
  held("a sparse Worker list suppresses outreach",function(x) x.q.verified.members[4]={name="Other",guid="Player-2-CCCC",status="member"} end)
  held("a new verification whisper suppresses outreach",function(x,e) e.OlympusVerifyDB.events={{type="whisper",ok=true,guid=x.member.guid,ts=x.now}} end)
  held("a valid mailed request without a GUID suppresses outreach by exact native sender",function(x,e) e.OlympusVerifyDB.events={{type="mail",ok=true,target=x.member.name,ts=x.now}} end)
  held("a pending addon request suppresses outreach",function(x,e) e.OlympusVerifyDB.intake242={entries={a={type="verify",source="self-addon243",status="pending",guid=x.member.guid,observedAt=x.now}}} end)
  held("a name reused with a new native GUID suppresses outreach",function(x) x.q.unverified.members[1].guid="Player-2-DDDD" end)
  held("a v1 source cannot enable direct-send",function(x) x.q.version=1 end)
  held("a damaged saved history is held in place",function(x,e) e.OlympusVerifyDB.initiateReminderHistory={version=0} end)
  f.e.C_ChatInfo={SendChatMessage=function() return false end}
  check("explicit native refusal records failed and calls no fallback",not f.send() and f.history()[1].failedAt==f.now and #f.calls==0)
  f.e.C_ChatInfo=nil
  check("officer may intentionally retry a refused send",f.send() and #f.calls==1 and #f.history()==2)
  f.now=f.now+61;f.echo()
  check("late outgoing echo is unconfirmed",not f.history()[2].sentAt)
  local uncertain=reminderClient(false)
  uncertain.e.C_ChatInfo={SendChatMessage=function() error("ambiguous dispatch") end}
  check("throw after dispatch stays unconfirmed, with no fallback/resend",uncertain.send() and not uncertain.send() and not uncertain.history()[1].failedAt and #uncertain.calls==0)
end
do
  local f=reminderClient(false);assert(f.send());f.echo()
  f.now=f.now+86401;f.ack();check("GOT IT outside 24 hours cannot acknowledge an older unrelated conversation",not f.history()[1].acknowledgedAt)
  f.fresh();assert(f.send());f.ack()
  check("newer unconfirmed attempt never credits an older confirmed send",#f.history()==2 and not f.history()[1].acknowledgedAt and not f.history()[2].acknowledgedAt)
  local book=f.e.OlympusVerifyDB.initiateReminderHistory
  for i=3,2000 do book.attempts[i]={guid="Player-8-"..string.format("%08X",i),name="Synthetic",officer="Fern Melder",at=f.now} end
  f.reload();f.now=f.now+86401;f.fresh()
  check("bounded history survives reload and retires an eligible old row",f.send() and #f.g.ReminderHistory()==2000 and #f.history()==2)
end
print("guild_status268: "..passed.." passed, 0 failed")

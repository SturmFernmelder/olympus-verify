-- .242 explicit hardware sync: actual module, no timer dispatch, synthetic native UI.
-- Deliberate hardware bypasses idle/UI-context checks; native combat, preview,
-- unsupported APIs and an unconfirmed prior request still hold this button/keybind.
local passed,failed=0,0
local function check(name,yes) if yes then passed=passed+1;print("PASS "..name) else failed=failed+1;print("FAIL "..name) end end
local function fixture(saved)
  local e=setmetatable({},{__index=_G});e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  local f={e=e,wall=1793935000,clock=0,reloads=0,exports=0,chimes=0,digest="initial",valid=true}
  e.time=function() return f.wall end;e.GetTime=function() return f.clock end
  e.GetUnitSpeed=function() return 0 end;e.GetPlayerFacing=function() return 0 end
  e.IsMouseButtonDown=function() return false end;e.GetCurrentKeyBoardFocus=function() return nil end
  for _,name in ipairs({"InCombatLockdown","UnitAffectingCombat","UnitIsDeadOrGhost","UnitOnTaxi","IsFalling","IsFlying","CursorHasItem","SpellIsTargeting"}) do e[name]=function() return false end end
  e.UnitCastingInfo=function() return nil end;e.UnitChannelInfo=function() return nil end
  e.ReloadUI=function() end;e.PlaySound=function() f.chimes=f.chimes+1 end
  e.OlympusVerifyDB=saved or {}
  e.OlympusLaunch229={ArmReadyReview=function() return true end,CancelReadyReview=function() end}
  e.OlympusVerifyAPI={AutoSyncFacts=function() return f.valid and {strict=true,exportedAt=f.wall,digest=f.digest} or nil end,
    ExportRoster=function() f.exports=f.exports+1 end,
    FlushAndReload=function() f.reloads=f.reloads+1;e.OlympusVerifyAutoSync.RecordSync();if f.refuse then error("synthetic refusal") end;if f.blocked then f.event("ADDON_ACTION_BLOCKED") end end}
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyAutoSync.lua")),e)()
  f.a=e.OlympusVerifyAutoSync
  e.OlympusVerifyAPI.Sync=function() return f.a.HardwareSync() end
  f.event=function(event) f.a.frame:GetScript("OnEvent")(f.a.frame,event) end
  f.event("PLAYER_LOGIN");f.event("PLAYER_ENTERING_WORLD")
  f.advance=function(n) f.wall=f.wall+n;f.clock=f.clock+n end
  return f
end
do
  local f=fixture()
  local e=f.e
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyWorkspace.lua")),e)()
  local page=e.CreateFrame("Frame",nil,e.UIParent)
  page:Hide()
  e.OlympusVerifyWorkspace.Attach("operations",page)
  e.OlympusVerifyWorkspace.Activate("operations")
  f.a.Request("whisper")
  check("floating Sync appears while the officer workspace is closed",f.a.button:IsShown())
  page:Show()
  check("opening the workspace immediately replaces floating Sync with its single tab control",not f.a.button:IsShown() and page.syncButton:GetText()=="Sync" and f.reloads==0)
  page:Hide()
  check("closing the workspace restores the pending Sync without taking an action",f.a.button:IsShown() and f.reloads==0)
  page:Show();page.syncButton:GetScript("OnClick")(page.syncButton,"LeftButton")
  check("workspace Sync records one requested exchange while the floating action stays hidden",f.a.Status().requested and f.reloads==1 and not f.a.button:IsShown())
end
do
  local f=fixture({autoSync232={enabled=true}})
  f.a.Request("whisper");f.advance(120);f.a.Tick();f.advance(10000);f.a.Tick()
  check("retired enabled timer preference never reloads",f.reloads==0 and f.a.Status().mode=="hardware-pending")
  check("valid pending proof shows compact hardware alert",f.a.Status().pending and f.a.button:IsShown() and f.a.button:GetText():match("^Sync\n"))
  check("pending burst produces one bounded chime",f.chimes==1)
  f.a.Request("whisper");f.a.Tick();check("duplicate pending events do not multiply chimes or reloads",f.chimes==1 and f.reloads==0)
  f.a.button:GetScript("OnClick")(f.a.button,"RightButton");check("right click does not sync",f.reloads==0)
  f.e.IsMouseButtonDown=function() return true end
  f.a.button:GetScript("OnClick")(f.a.button,"LeftButton",true)
  check("AnyDown does not duplicate a physical click",f.reloads==0 and not f.a.Status().requested)
  f.a.button:GetScript("OnClick")(f.a.button,"LeftButton",false)
  check("AnyUp hardware click invokes exactly one normal Sync",f.reloads==1 and f.a.Status().requested)
  f.a.Tick();f.advance(10000);f.a.Tick();f.e.OlympusVerify_Sync()
  check("unconfirmed request has no timer or blind hardware retry",f.reloads==1)
end
do
  local f=fixture();check("unknown trigger cannot arm alert",not f.a.Request("arbitrary") and not f.a.Status().pending)
  f.a.NativeChanged();check("first unsynced complete native roster raises alert",f.a.Status().pending and f.reloads==0)
  f.a.button:SetPoint("CENTER",f.e.UIParent,"CENTER",123,-45);f.a.button:GetScript("OnDragStop")(f.a.button)
  check("right-drag position stores finite UI metadata only",f.e.OlympusVerifyDB.pendingSync233.position.x==123 and f.e.OlympusVerifyDB.pendingSync233.position.y==-45)
  local saved=f.e.OlympusVerifyDB;f.a.HardwareSync()
  local next=fixture(saved);next.a.NativeChanged();check("acknowledged local Sync digest avoids unchanged boot alert",not next.a.Status().pending and next.reloads==0)
  next.digest="changed-native-rank";next.a.NativeChanged();check("later native change raises alert without reload",next.a.Status().pending and next.reloads==0)
  local point,_,_,x,y=next.a.button:GetPoint();check("movable alert restores reviewed position",point=="CENTER" and x==123 and y==-45)
end
do
  local f=fixture();f.a.RecordSavedRoster();local after=fixture(f.e.OlympusVerifyDB)
  after.advance(1800);after.a.Tick()
  check("natural logout suppresses an unchanged roster prompt without claiming a Sync request",not after.a.Status().pending and not after.a.Status().lastRequestedAt)
  after.digest="temporary-rank";after.a.NativeChanged();after.digest="initial";after.a.NativeChanged()
  check("a reverted rank change clears a roster-only alert",not after.a.Status().pending and after.reloads==0)
  after.a.Request("whisper");after.digest="different";after.a.NativeChanged();after.digest="initial";after.a.NativeChanged()
  check("rank reversion cannot clear a real pending whisper",after.a.Status().pending and after.reloads==0)
  after.a.Request("whisper");check("whisper bursts reuse current native data",after.exports==0)
end
for _,event in ipairs({"TRADE_SHOW","MAIL_SHOW","BANKFRAME_OPENED","GUILDBANKFRAME_OPENED","AUCTION_HOUSE_SHOW","MERCHANT_SHOW","CINEMATIC_START","LOADING_SCREEN_ENABLED"}) do
  local f=fixture();f.a.Request("whisper");f.event(event);f.a.Tick()
  check(event.." never dispatches a timer/event reload",f.reloads==0)
  f.a.HardwareSync();f.a.Tick()
  check(event.." does not veto deliberate hardware or cause a retry",f.reloads==1 and f.a.Status().requested)
end
for _,name in ipairs({"InCombatLockdown","UnitAffectingCombat","UnitIsDeadOrGhost","UnitOnTaxi","IsFalling","IsFlying","CursorHasItem","SpellIsTargeting"}) do
  local f=fixture();f.a.Request("whisper");f.e[name]=function() return true end;f.e.OlympusVerify_Sync()
  if name=="InCombatLockdown" then
    check("native InCombatLockdown holds sync keybind",f.reloads==0 and not f.a.Status().requested)
  else
    check(name.." alone does not veto explicit non-lockdown sync",f.reloads==1 and f.a.Status().requested)
  end
end
do
  local f=fixture();f.a.Request("whisper");f.e.InCombatLockdown=nil
  check("unknown combat capability holds",not f.a.HardwareSync() and f.reloads==0)
  f=fixture();f.a.Request("whisper");f.e.GetCurrentKeyBoardFocus=function() return {} end
  check("typing does not veto deliberate hardware sync",f.a.HardwareSync() and f.reloads==1)
  f=fixture();f.a.Request("whisper");f.e.GetUnitSpeed=function() return 2 end
  check("moving does not veto deliberate hardware sync",f.a.HardwareSync() and f.reloads==1)
  f=fixture();f.a.Request("whisper");f.e.OlympusVerifyUI={preview={}}
  check("preview cannot dispatch reload",not f.a.HardwareSync() and f.reloads==0)
end
for _,name in ipairs({"TradeFrame","MailFrame","BankFrame","GuildBankFrame","AuctionHouseFrame","MerchantFrame","LootFrame","StaticPopup1","GameMenuFrame"}) do
  local f=fixture();f.a.Request("whisper");f.e[name]={IsShown=function() return true end};f.a.HardwareSync();f.a.Tick()
  check(name.." does not veto one explicit hardware sync or cause a retry",f.reloads==1 and f.a.Status().requested)
end
do
  local f=fixture();f.a.Request("whisper");f.refuse=true;f.a.HardwareSync();f.advance(1000);f.a.Tick()
  check("native error remains visible without retry",f.reloads==1 and f.a.Status().held:find("client refused",1,true) and f.a.button:IsShown())
  f=fixture();f.a.Request("whisper");f.blocked=true;f.a.HardwareSync();f.advance(1000);f.a.Tick()
  check("security block offers normal reload without bypass",f.reloads==1 and f.a.Status().held:find("no bypass",1,true))
  f=fixture();f.a.Request("whisper");f.e.ReloadUI=nil;f.e.C_UI=nil
  check("unsupported API offers manual command and sends nothing",not f.a.HardwareSync() and f.reloads==0 and f.a.Status().held:find("/reload",1,true))
  f=fixture();f.a.SetEnabled(false);f.a.Request("whisper");check("chime may be muted without hiding pending work",f.chimes==0 and f.a.button:IsShown())
  f=fixture();f.valid=false;f.a.Request("whisper");check("valid whisper still signals local pending work when roster is temporarily unknown",f.a.Status().pending and f.reloads==0)
end
-- Actual main API composition: only a genuine validated whisper arms the pending exchange.
do
  local e=setmetatable({},{__index=_G});e._G=e;setfenv(assert(loadfile("wow_mock.lua")),e)()
  e.GetTime=function() return 0 end;e.date=function(format,at) return os.date(format,at) end
  e.GetGuildInfo=function() return "OLYMPUS PRIME" end;e.GetRealmName=function() return "Native Realm" end;e.GetGuildRosterShowOffline=function() return true end
  e.OlympusVerifyConfig={secret="synthetic-pending-composition",membershipOnly=true,uiAutoShow=false}
  e.ROSTER={{name="Fern Melder",guid=e.PLAYER_GUID,rank="Guild Master",rankIndex=0,level=60},{name="Fresh Member",guid="Player-1-ABCDEF12",rank="Member",rankIndex=8,level=60}}
  local reloads=0;e.ReloadUI=function() reloads=reloads+1 end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")),e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")),e)("OlympusVerify")
  local event=e.OlympusVerifyFrame:GetScript("OnEvent");event(e.OlympusVerifyFrame,"ADDON_LOADED","OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyAutoSync.lua")),e)()
  local a=e.OlympusVerifyAutoSync;a.frame:GetScript("OnEvent")(a.frame,"PLAYER_LOGIN");a.frame:GetScript("OnEvent")(a.frame,"PLAYER_ENTERING_WORLD")
  e.OlympusVerifyAPI.ExportRoster(true);a.RecordSavedRoster();a.frame:GetScript("OnEvent")(a.frame,"PLAYER_LEAVING_WORLD")
  a.frame:GetScript("OnEvent")(a.frame,"PLAYER_ENTERING_WORLD")
  event(e.OlympusVerifyFrame,"CHAT_MSG_WHISPER","!verify AAAAAA","Fresh Member",nil,nil,nil,nil,nil,nil,nil,nil,nil,"Player-1-ABCDEF12")
  check("invalid whisper cannot create a fresh pending proof",not e.OlympusVerifyDB.verificationExchange or e.OlympusVerifyDB.verificationExchange.phase~="sync-needed")
  local code=e.OlympusHmac.codeFor(e.OlympusVerifyConfig.secret,"Fresh Member",e.OlympusHmac.utcDay(e.NOW))
  event(e.OlympusVerifyFrame,"CHAT_MSG_WHISPER","!verify "..code,"Fresh Member",nil,nil,nil,nil,nil,nil,nil,nil,nil,"Player-1-ABCDEF12")
  check("genuine main native proof arms alert without timer reload",a.Status().pending and e.OlympusVerifyDB.verificationExchange.phase=="sync-needed" and reloads==0)
  a.Tick();check("actual main/module timer remains non-dispatching",reloads==0)
  e.SlashCmdList.OLYMPUSVERIFY("sync");e.OlympusVerifyAPI.Sync();e.OlympusVerify_Sync()
  check("typed Sync, panel API and keybind coalesce into one real reload",reloads==1 and a.Status().requested)
end
do
  local f=fixture()
  local loaded={state="stale",queriedAt=f.wall-120,rosterObservedAt=f.wall-4000}
  f.e.OlympusVerifyAPI.Roster={DisplayFacts=function() return loaded end}
  f.e.date=function(format,at) return os.date(format,at) end
  f.a.Request("whisper");f.a.HardwareSync()
  local s=f.a.Status()
  check("Sync click records its original local request time",s.lastRequestedAt==f.wall and s.capturedRosterAt==f.wall)
  check("local request does not renew stale loaded clocks",s.loadedListAt==f.wall-120 and s.loadedRosterAt==f.wall-4000 and s.displayState=="stale")
  check("button separates request time from loaded data",f.a.button:GetText():find("Requested",1,true) and f.a.button:GetText():find("loaded",1,true) and f.a.button:GetText():find("stale",1,true))
  local explanation=table.concat(f.a.Description()," ")
  check("Sync explains post-reload processing without claiming delivery",explanation:find("not a server confirmation",1,true) and explanation:find("older result",1,true))
  local saved=f.e.OlympusVerifyDB;f.advance(10)
  local next=fixture(saved);next.wall=f.wall;next.e.date=f.e.date
  next.e.OlympusVerifyAPI.Roster={DisplayFacts=function() return loaded end}
  check("request history survives a client restart without implying current request or delivery",next.a.Status().lastRequestedAt==s.lastRequestedAt and not next.a.Status().requested and next.a.Status().displayState=="stale")
  loaded={state="loaded",queriedAt=next.wall,rosterObservedAt=next.wall-20}
  check("new loaded clocks do not become an upload acknowledgement",next.a.Status().lastRequestedAt==s.lastRequestedAt and next.a.Status().loadedListAt==next.wall and not next.a.Status().requested)
end
for _,bad in ipairs({"yesterday",0,-1,1793935001,math.huge}) do
  local f=fixture({pendingSync233={lastRequestedAt=bad,lastSyncAt=bad,lastRequestRosterAt=bad}})
  check("invalid or future persisted request clocks stay unavailable: "..tostring(bad),f.a.Status().lastRequestedAt==nil and f.a.Status().capturedRosterAt==nil)
end
do
  local f=fixture();f.a.Request("whisper");f.e.OlympusVerifyAPI.FlushAndReload=function() return false end
  check("explicit Sync refusal is not a successful request",not f.a.HardwareSync() and f.a.Status().held:find("client refused",1,true))
  f=fixture();f.e.OlympusVerifyAPI.Roster={DisplayFacts=function() error("synthetic unreadable display") end}
  check("unavailable display does not fabricate loaded dates",f.a.Status().loadedListAt==nil and f.a.Status().displayState=="unavailable")
end
do
  local file=assert(io.open("../OlympusVerify/Bindings.xml","r"));local xml=file:read("*a");file:close()
  local _,syncCount=xml:gsub('name="OLYMPUSVERIFY_SYNC"','');local _,nextCount=xml:gsub('name="OLYMPUSVERIFY_OFFICER_NEXT"','')
  check("exactly one Sync and officer keybinding is declared",syncCount==1 and nextCount==1 and xml:find("OlympusVerify_Sync()",1,true) and xml:find("OlympusLaunch229.NextAction()",1,true))
end
for _,event in ipairs({"TRADE_SHOW","MAIL_SHOW","BANKFRAME_OPENED","AUCTION_HOUSE_SHOW"}) do
  local f=fixture();f.event(event)
  check("optional import without a whisper holds in "..event,not f.a.HardwareSync(true) and f.reloads==0)
end
do
  local e=setmetatable({},{__index=_G});e._G=e;setfenv(assert(loadfile("wow_mock.lua")),e)()
  local D=assert(loadfile("directive_fixture280.lua"))()
  local names=D.ranks(e)
  e.GetGuildInfo=function() return "OLYMPUS PRIME",names[1],0 end;e.GetRealmName=function() return "CAMWOW US2 Realm 3 PvE" end
  e.GetGuildRosterShowOffline=function() return true end;e.CanGuildPromote=function() return true end
  e.InCombatLockdown=function() return false end;e.GetTime=function() return 0 end
  e.ROSTER={{name="Fern Melder",guid=e.PLAYER_GUID,rankIndex=0,level=60},{name="New Initiate",guid="Player-1-ABCDEF12",rankIndex=9,level=60}}
  e.C_GuildInfo.MemberExistsByName=function() return true end
  local reloads=0;e.ReloadUI=function() reloads=reloads+1 end
  e.OlympusVerifyConfig={secret="local-synthetic-alert-test",membershipOnly=true,uiAutoShow=false}
  for _,file in ipairs({"Libs/OlympusHmac.lua","OlympusVerify.lua","OlympusVerifyAutoSync.lua","OlympusVerifyLaunch229.lua"}) do
    setfenv(assert(loadfile("../OlympusVerify/"..file)),e)("OlympusVerify")
  end
  local hash=e.OlympusHmac.sha256hex
  e.OlympusHmac.sha256hex=function(input)
    if input=="prime-guild-master|1|"..e.PLAYER_GUID then return "d0988804294170b3414fcaf60ea77658d3b511bbd0c1ccf4286b04e47d935a16" end
    return hash(input)
  end
  local core=e.OlympusVerifyFrame;local event=core:GetScript("OnEvent")
  event(core,"ADDON_LOADED","OlympusVerify");event(core,"GUILD_ROSTER_UPDATE")
  local a=e.OlympusVerifyAutoSync;local on=a.frame:GetScript("OnEvent");on(a.frame,"PLAYER_LOGIN");on(a.frame,"PLAYER_ENTERING_WORLD")
  local code=e.OlympusHmac.codeFor(e.OlympusVerifyConfig.secret,"New Initiate",e.OlympusHmac.utcDay(e.NOW))
  event(core,"CHAT_MSG_WHISPER","!verify "..code,"New Initiate",nil,nil,nil,nil,nil,nil,nil,nil,nil,"Player-1-ABCDEF12")
  check("normal game whisper enters the private pending path through the real native capture",a.button:GetText():match("^Sync\nInitiate verification waiting")
    and e.OlympusVerifyDB.primeInitiateNotices.whispers["Player-1-ABCDEF12"]==e.NOW and not a.readyButton and reloads==0)
end
do
  local f=fixture();f.a.Request("whisper");f.a.OfferInitiateImport()
  check("local pending notice asks the officer to export before Windows can confirm readiness",f.a.button:GetText():match("^Sync\nInitiate verification waiting")
    and f.a.button:GetText():find("Click once when safely idle",1,true) and table.concat(f.a.Description()," "):find("/olv ready sync",1,true)
    and not f.a.readyButton and f.reloads==0)
  f.e.UnitChannelInfo=function() return "Fishing" end
  f.a.button:GetScript("OnClick")(f.a.button,"LeftButton",false)
  check("pending Initiate button holds while fishing",f.reloads==0 and not f.a.Status().requested)
  f.e.UnitChannelInfo=function() end
  f.a.button:GetScript("OnClick")(f.a.button,"LeftButton",false)
  check("one safe button press requests exactly one reload",f.reloads==1 and not f.a.HardwareSync(true))
end
do
  local f=fixture();local text="/olv ready sync"
  local edit={GetName=function() return "ChatFrame1EditBox" end,GetText=function() return text end}
  f.e.ChatFrame1EditBox=edit;f.e.GetCurrentKeyBoardFocus=function() return edit end
  check("an ordinary click still holds while a chat edit box is focused",not f.a.HardwareSync(true) and f.reloads==0)
  text="unfinished chat"
  check("an unrelated focused draft holds a command import",not f.a.HardwareSync(true,true) and f.reloads==0)
  text="/OLV   READY SYNC"
  check("the submitted import command can finish while its own native edit box still has focus",f.a.HardwareSync(true,true) and f.reloads==1)
  check("a duplicate optional import cannot repeat the request",not f.a.HardwareSync(true,true) and f.reloads==1)
end
do
  local f=fixture();local opens=0
  f.e.OlympusVerifyRoster={ShowReadyInitiates=function() opens=opens+1 end}
  f.a.ShowReadyNotice(2,f.wall+30)
  check("the private notice exposes a review-only button",f.a.readyButton:IsShown() and f.a.readyButton:GetText():find("(2)",1,true) and f.reloads==0)
  f.a.readyButton:Click();f.a.Tick()
  check("opening ready Initiates never syncs or reopens its alert",opens==1 and f.reloads==0 and not f.a.readyButton:IsShown())
  f.a.ShowReadyNotice(1,f.wall+2);f.advance(3);f.a.Tick()
  check("the private button disappears at original expiry",not f.a.readyButton:IsShown() and f.reloads==0)
end
print(string.format("%d passed, %d failed",passed,failed));if failed>0 then error("pending hardware sync failed") end

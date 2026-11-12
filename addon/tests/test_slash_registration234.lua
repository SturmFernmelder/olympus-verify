-- .234 delayed real chat registry; all APIs, settings and UI state are synthetic.
local passed, failed = 0, 0
local function check(label, yes)
  if yes then passed=passed+1; print("PASS "..label) else failed=failed+1; print("FAIL "..label) end
end
local PUBLIC = {"OlympusVerifyUI.lua","OlympusVerifyAutoSync.lua","OlympusVerifyPreview.lua","OlympusVerifyGuild.lua","OlympusVerifyRoster.lua","OlympusVerifyBrowser.lua","OlympusVerifyCensus.lua","OlympusVerifyTreasury.lua","OlympusVerifyLaunch229.lua","OlympusVerifyOfficerInvites233.lua"}
local function fixture(mode, wrappers)
  local e=setmetatable({}, {__index=_G}); e._G=e
  setfenv(assert(loadfile("wow_mock.lua")),e)()
  e.OlympusVerifyConfig={secret="synthetic-only-never-native",membershipOnly=true}
  e.C_AddOns={DoesAddOnExist=function() return false end}
  local f={e=e,effects=0,officer=0,browser=0,census=0,guild=0}
  local blocked=function() f.effects=f.effects+1; error("unexpected protected action") end
  e.GuildInvite,e.GuildPromote,e.GuildSetMOTD,e.SendChatMessage=blocked,blocked,blocked,blocked
  e.C_GuildInfo={Invite=blocked,Promote=blocked,SetMOTD=blocked}
  if mode=="nil" then e.SlashCmdList=nil elseif mode=="false" then e.SlashCmdList=false
  elseif mode=="unreadable" then e.SlashCmdList=setmetatable({}, {__index=function() error("synthetic unavailable registry") end})
  elseif mode=="refused" then e.SlashCmdList=setmetatable({}, {__newindex=function() error("synthetic registration refused") end})
  elseif mode=="alias" then
    e.SLASH_FOREIGN1="/olv";f.foreign=function() return "foreign" end;e.SlashCmdList.FOREIGN=f.foreign
  elseif mode=="key" then
    e.SLASH_OLYMPUSVERIFY1="/someoneelse";f.foreign=function() return "foreign" end;e.SlashCmdList.OLYMPUSVERIFY=f.foreign
  end
  local function load(name) return pcall(setfenv(assert(loadfile("../OlympusVerify/"..name)),e),"OlympusVerify") end
  assert(load("Libs/OlympusHmac.lua"))
  f.loaded,f.error=load("OlympusVerify.lua")
  assert(f.loaded,f.error)
  for _,frame in ipairs(e.FRAMES) do
    if frame~=e.OlympusVerifyFrame and frame._events and frame._events.ADDON_LOADED and frame._events.PLAYER_LOGIN then
      assert(not f.registryFrame,"one registration event frame");f.registryFrame=frame
    end
  end
  assert(f.registryFrame)
  f.cached=type(e.SlashCmdList)=="table" and rawget(e.SlashCmdList,"OLYMPUSVERIFY") or nil
  if wrappers then
    for _,file in ipairs(PUBLIC) do local ok,err=load(file);assert(ok,file..": "..tostring(err)) end
  end
  e.OlympusLaunch229=e.OlympusLaunch229 or {}
  e.OlympusLaunch229.Show=function() f.officer=f.officer+1 end
  if e.OlympusVerifyBrowser then e.OlympusVerifyBrowser.Command=function() f.browser=f.browser+1;return "browser" end end
  if e.OlympusVerifyCensus then e.OlympusVerifyCensus.Command=function() f.census=f.census+1;return "census" end end
  if e.OlympusVerifyGuild then e.OlympusVerifyGuild.OlympusCommand=function() f.guild=f.guild+1;return "guild" end end
  f.fire=function(event)
    f.registryFrame:GetScript("OnEvent")(f.registryFrame,event,"Blizzard_ChatFrameBase")
  end
  return f
end

for _,mode in ipairs({"nil","false"}) do
  local f=fixture(mode,true);local e=f.e
  check(mode.." registry does not abort main/events/AutoSync",f.loaded and type(e.OlympusVerifyAPI)=="table" and type(e.OlympusVerifyFrame:GetScript("OnEvent"))=="function" and type(e.OlympusVerifyAutoSync)=="table")
  check(mode.." registry is never fabricated and aliases stay pending",(mode=="false" and e.SlashCmdList==false or mode=="nil" and e.SlashCmdList==nil) and e.SLASH_OLYMPUSVERIFY1==nil)
  e.SlashCmdList={};f.fire(mode=="nil" and "ADDON_LOADED" or "PLAYER_LOGIN")
  check(mode.." real late table receives original stable dispatcher",type(e.SlashCmdList.OLYMPUSVERIFY)=="function" and e.SLASH_OLYMPUSVERIFY1=="/olv")
  e.SlashCmdList.OLYMPUSVERIFY("officer")
  check(mode.." officer reaches original panel path without action",f.officer==1 and f.effects==0)
  check(mode.." queued browser/census/guild wrappers all survive late registration",e.SlashCmdList.OLYMPUSVERIFY("browser proof")=="browser" and e.SlashCmdList.OLYMPUSVERIFY("census preview")=="census" and e.SlashCmdList.OLYMPUSVERIFY("olympus status")=="guild" and f.browser==1 and f.census==1 and f.guild==1)
  check(mode.." preview wrapper remains in chain",type(e.OlympusVerifyPreview)=="table" and e.OlympusVerifyPreview.State()==nil)
  check(mode.." independent secondary aliases register only on real table",type(e.SlashCmdList.OLYMPUSTREASURY)=="function" and e.SLASH_OLYMPUSTREASURY1=="/olvtreasury" and type(e.SlashCmdList.OLYMPUSBROWSER)=="function" and e.SLASH_OLYMPUSBROWSER1=="/oly")
  local original=e.SlashCmdList.OLYMPUSVERIFY;f.fire("ADDON_LOADED");f.fire("PLAYER_LOGIN")
  check(mode.." repeated lifecycle events keep exact dispatcher identity",e.SlashCmdList.OLYMPUSVERIFY==original)
end
local f=fixture("ready",true);local e=f.e
check("Blizzard-cached initial dispatcher remains exact after every public wrapper",f.cached==e.SlashCmdList.OLYMPUSVERIFY)
do
  local diagnostics=0
  e.OlympusLaunch229.PrintPromotionCustody=function() diagnostics=diagnostics+1 end
  f.cached("launch custody")
  check("explicit public launch custody command prints once and opens the panel without an effect",diagnostics==1 and f.officer==1 and f.effects==0)
  f.cached("officer custody")
  check("actual public officer alias reaches the same read-only custody diagnostic",diagnostics==2 and f.officer==2 and f.effects==0)
  f.cached("launch")
  check("ordinary launch command stays quiet",diagnostics==2 and f.officer==3 and f.effects==0)
  e.OlympusLaunch229.Show()
  check("internal panel refresh does not print another manual custody diagnostic",diagnostics==2 and f.officer==4 and f.effects==0)
  local observed={}
  e.OlympusLaunch229.RecordCurrentPromotionObservation=function(guid) observed[#observed+1]=guid end
  f.cached("launch history Player-6921-01F8C2D4")
  check("public history route passes the exact GUID without opening a promotion panel",#observed==1 and observed[1]=="Player-6921-01F8C2D4" and f.officer==4 and f.effects==0)
  f.cached("officer history Player-6921-004FE909")
  check("officer history alias records one observation and never invokes a protected action",#observed==2 and observed[2]=="Player-6921-004FE909" and f.officer==4 and f.effects==0)
  f.cached("launch history")
  check("missing history GUID cannot record an observation",#observed==2 and f.officer==5 and f.effects==0)
  local held={}
  e.OlympusLaunch229.HoldPromotionHistoryReview=function(guid) held[#held+1]=guid end
  f.cached("launch hold Player-6929-00285AB5")
  check("explicit missing-history hold route passes one exact GUID without a native action",#held==1 and held[1]=="Player-6929-00285AB5" and f.officer==5 and f.effects==0)
  f.cached("officer hold")
  check("missing hold GUID cannot create a history hold",#held==1 and f.officer==6 and f.effects==0)
  f.officer=0
end
f.cached("officer");f.cached("browser proof");f.cached("census preview");f.cached("olympus status")
check("cached dispatcher reaches original and all current public extensions once",f.officer==1 and f.browser==1 and f.census==1 and f.guild==1 and f.effects==0)
local foreign=function(msg) return f.cached(msg) end;e.SlashCmdList.OLYMPUSVERIFY=foreign;f.fire("ADDON_LOADED")
check("later foreign wrapper is never overwritten by retry",e.SlashCmdList.OLYMPUSVERIFY==foreign)
e.SlashCmdList.OLYMPUSVERIFY("officer")
check("foreign extension delegating to cached stable dispatcher remains functional",f.officer==2 and f.effects==0)
local old=e.SlashCmdList;e.SlashCmdList={};f.fire("PLAYER_LOGIN")
check("a new empty real registry preserves the complete original extension chain",e.SlashCmdList.OLYMPUSVERIFY==f.cached and e.SlashCmdList.OLYMPUSVERIFY("browser proof")=="browser")
for _,mode in ipairs({"alias","key"}) do
  f=fixture(mode,true);e=f.e;f.fire("ADDON_LOADED");f.fire("PLAYER_LOGIN")
  check(mode.." foreign handler and aliases are not stolen",mode=="alias" and e.SlashCmdList.FOREIGN==f.foreign and e.SLASH_FOREIGN1=="/olv" and e.SLASH_OLYMPUSVERIFY1==nil and e.SlashCmdList.OLYMPUSVERIFY==nil or mode=="key" and e.SlashCmdList.OLYMPUSVERIFY==f.foreign and e.SLASH_OLYMPUSVERIFY1=="/someoneelse")
  check(mode.." conflict never invokes a protected action",f.effects==0)
end
f=fixture("ready",true);e=f.e
check("duplicate wrapper id cannot stack callbacks",e.OlympusVerifySlash234.Extend("OLYMPUSVERIFY","preview",function(previous)return previous end)==false)
check("a malformed wrapper builder cannot replace the existing chain",e.OlympusVerifySlash234.Extend("OLYMPUSVERIFY","bad",function()return false end)==false)
e.SlashCmdList.OLYMPUSVERIFY("officer")
check("failed extension leaves the original route functional",f.officer==1 and f.effects==0)
for _,mode in ipairs({"unreadable","refused"}) do
  f=fixture(mode,true);e=f.e
  check(mode.." real table holds without aborting main or public wrappers",f.loaded and type(e.OlympusVerifyAutoSync)=="table" and type(e.OlympusVerifyPreview)=="table" and type(e.OlympusVerifyBrowser)=="table")
  local unavailable=e.SlashCmdList;f.fire("ADDON_LOADED")
  check(mode.." native table is preserved without fabrication",e.SlashCmdList==unavailable)
  e.SlashCmdList={};f.fire("PLAYER_LOGIN");e.SlashCmdList.OLYMPUSVERIFY("officer")
  check(mode.." later readable table receives the queued original handler",f.officer==1 and e.SLASH_OLYMPUSVERIFY1=="/olv")
  check(mode.." recovery never invokes a protected game action",f.effects==0)
end
print(string.format("%d passed, %d failed",passed,failed))
if failed>0 then error("slash registration234 failed") end

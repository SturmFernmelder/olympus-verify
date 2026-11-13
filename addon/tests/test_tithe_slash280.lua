-- Actual core registry and Treasury registration; synthetic native APIs only.
local source=assert(io.open('test_slash_registration234.lua','r'))
local prefix=source:read('*a'):match('^(.-)\nfor _,mode in ipairs')
source:close()
local fixture=assert(loadstring(assert(prefix)..'\nreturn fixture'))()
local checks,failed=0,0
local function check(label,yes)
  checks=checks+1
  if not yes then failed=failed+1 end
  print((yes and 'PASS ' or 'FAIL ')..label)
end
for _,mode in ipairs({'ready','nil'}) do
  local f=fixture(mode,true)
  if mode=='nil' then f.e.SlashCmdList={};f.fire('PLAYER_LOGIN') end
  local e=f.e
  check(mode..' actual registry installs /olvtithe under a valid key',type(e.SlashCmdList.OLYMPUSTITHEREFERENCE)=='function' and e.SLASH_OLYMPUSTITHEREFERENCE1=='/olvtithe')
  local before=#e.PRINTS
  local handler=e.SlashCmdList.OLYMPUSTITHEREFERENCE
  if handler then handler('TITHE-ABCD-EFGH') end
  check(mode..' typed slash dispatches once and holds without an open trade',#e.PRINTS==before+1 and e.PRINTS[#e.PRINTS]:find('Open the intended trade',1,true) and f.effects==0)
end
local f=fixture('ready',false)
local foreign=function() return 'foreign' end
f.e.SLASH_FOREIGNTITHE1='/olvtithe';f.e.SlashCmdList.FOREIGNTITHE=foreign
assert(pcall(setfenv(assert(loadfile('../OlympusVerify/OlympusVerifyTreasury.lua')),f.e),'OlympusVerify'))
f.fire('PLAYER_LOGIN')
check('foreign /olvtithe alias stays owned by its original handler',f.e.SlashCmdList.FOREIGNTITHE==foreign and f.e.SLASH_FOREIGNTITHE1=='/olvtithe' and f.e.SlashCmdList.OLYMPUSTITHEREFERENCE==nil and f.effects==0)
TITHE_SLASH280_RESULT={checks=checks,failed=failed}
if failed>0 then error(tostring(failed)..' actual Treasury slash registration assertions failed') end

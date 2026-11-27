local now=1900000000
local guid="Player-1234-ABCDEF"
GetServerTime=function() return now end
UnitGUID=function() return guid end
local messages={}
DEFAULT_CHAT_FRAME={AddMessage=function(_,s) messages[#messages+1]=s end}
dofile("../OlympusVerify/OlympusVerifyRaidSchedule.lua")
local r=OlympusVerifyRaidSchedule
local function pack(stamp,entries) return "OLR1|"..guid.."|"..stamp.."|"..#entries..(#entries>0 and "\n"..table.concat(entries,"\n") or "") end
local function row(at, title)
  return "EV1234|2|"..at.."|90|Evening%20team|"..(title or "Raid").."|Group%201|Bring%20potions"
end
local text=pack(now,{row(now+1450,"Molten%20Core")})
assert(r.Import(text));assert(r.Upcoming()[1].title=="Molten Core" and r.Upcoming()[1].zone=="Evening team")
r.Tick();r.Tick();assert(#messages==1);assert(r.Import(text));r.Tick();assert(#messages==1)
now=now+600;r.Tick();assert(#messages==2)
assert(not r.Import("OLR1|Player-OTHER|"..now.."|0"))
assert(not r.Import(pack(now,{row(now+99),row(now+99)})));assert(#r.Upcoming()==1)
assert(not r.Import(pack(now,{row(now+99,"%0Awrong")})))
assert(not r.Import(pack(now,{row(now+99,"%Z")})))
assert(not r.Import(pack(now-800,{})));assert(r.Import(pack(now,{})));assert(#r.Upcoming()==0)
assert(r.Import(pack(now,{row(now+100000,"Escaped%7Cname")})));assert(r.Upcoming()[1].title=="Escaped||name")
guid="Player-OTHER";assert(#r.Upcoming()==0);guid="Player-1234-ABCDEF"
now=now+86401;assert(#r.Upcoming()==0);r.Tick();assert(#messages==2)
print("PASS personal raid schedule, cancellation, scope, cache expiry and reload-safe reminders")

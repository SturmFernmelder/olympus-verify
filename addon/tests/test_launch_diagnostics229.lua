-- .229 read-only native diagnostics: synthetic APIs only, never /run or a game action.
local passed, failed = 0, 0
local function check(name, yes)
  if yes then passed = passed + 1; print("PASS " .. name) else failed = failed + 1; print("FAIL " .. name) end
end
local function fixture()
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  e.OlympusVerifyConfig = { secret = "synthetic-never-print-secret", membershipOnly = true, nativeGuild = "A typed guess" }
  local f = { env = e, effects = 0, lines = {}, guild = "OLYMPUS PRIME" }
  e.GetGuildInfo = function(unit) assert(unit == "player"); return f.guild, "High Council", 1 end
  e.GetRealmName = function() return "CAMWOW US2 Realm 3 PvE" end
  e.UnitGUID = function(unit) assert(unit == "player"); return "Player-1-0000ABCD" end
  e.GetBuildInfo = function() return "1.60.1", "69893", "test date", 16001 end
  local action = function() f.effects = f.effects + 1; error("diagnostics called an action") end
  e.C_GuildInfo = { SetGuildRankOrder = action, IsGuildRankAssignmentAllowed = action, Invite = action, Promote = action, SetMOTD = action }
  e.GuildInvite, e.GuildPromote, e.GuildSetMOTD, e.SendChatMessage = action, action, action, action
  e.DEFAULT_CHAT_FRAME = { AddMessage = function(_, text) f.lines[#f.lines + 1] = text end }
  e.issecretvalue = function(value) return value == "SecretNativeGuild" end
  setfenv(assert(loadfile("../OlympusVerify/Libs/OlympusHmac.lua")), e)("OlympusVerify")
  setfenv(assert(loadfile("../OlympusVerify/OlympusVerify.lua")), e)("OlympusVerify")
  f.run = function() f.lines = {}; e.SlashCmdList.OLYMPUSVERIFY("diagnostics"); return table.concat(f.lines, "\n") end
  return f
end
local f = fixture()
f.env.GuildControlGetRankName=function(order) return order==6 and "Veteran" or order==8 and "Member" or "Other" end
local text = f.run()
check("diagnostics prints exact native guild and realm, not configured guesses", text:find('guild="OLYMPUS PRIME"', 1, true) and text:find('realm="CAMWOW US2 Realm 3 PvE"', 1, true) and not text:find("A typed guess", 1, true))
check("native promotion target names use current client zero-based slots5 and7",text:find('slot0=5 name="Veteran"; slot0=7 name="Member"',1,true) and f.effects==0)
check("native rank slot, own GUID and client build are visible", text:find('rank="High Council" slot0=1', 1, true) and text:find('GUID="Player-1-0000ABCD"', 1, true) and text:find('build="69893"', 1, true) and text:find('interface="16001"', 1, true))
check("all requested API capability types are reported without invoking them", text:find("API SetGuildRankOrder=function", 1, true) and text:find("API IsGuildRankAssignmentAllowed=function", 1, true) and text:find("API Invite=function", 1, true) and text:find("API Promote=function", 1, true) and text:find("API GuildPromote=function", 1, true) and f.effects == 0)
check("shared secret is never printed and verification-only mode remains explicit", not text:find("synthetic-never-print-secret", 1, true) and text:find("membershipOnly=true", 1, true))
f.lines = {}; f.env.SlashCmdList.OLYMPUSVERIFY("diagnostics scope"); local scope = table.concat(f.lines,"\n")
check("scope diagnostics is two clean read-only lines without API scrolling", #f.lines == 2 and scope:find('guild="OLYMPUS PRIME"',1,true) and not scope:find("API ",1,true) and f.effects == 0)
f.guild = "SecretNativeGuild"; text = f.run()
check("secret native values are redacted before formatting", not text:find("SecretNativeGuild", 1, true) and text:find("<unreadable>", 1, true) and f.effects == 0)
f.env.GetGuildInfo, f.env.GetBuildInfo, f.env.UnitGUID = nil, function() error("unavailable") end, nil
f.env.C_GuildInfo, f.env.GuildPromote = nil, nil
text = f.run()
check("missing/failing native APIs are shown as unavailable and cause no action", text:find("<unavailable>", 1, true) and text:find("API SetGuildRankOrder=nil", 1, true) and text:find("API GuildPromote=nil", 1, true) and f.effects == 0)
print(string.format("%d passed, %d failed", passed, failed))
if failed > 0 then error("launch diagnostics failed") end

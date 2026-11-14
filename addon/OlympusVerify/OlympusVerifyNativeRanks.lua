-- Actual table observation, including empty ranks. Constants never fabricate an observation.
local C = OlympusVerifyNativeRankConstants
local R = {}
OlympusVerifyNativeRanks = R
local function readable(value)
  if type(issecretvalue)=="function" then local ok,secret=pcall(issecretvalue,value);if not ok or secret then return nil end end
  return value
end
local function read(fn,...)
  if type(fn)~="function" then return nil end
  local ok,value=pcall(fn,...);if not ok then return nil end;return readable(value)
end
function R.Copy(value)
  if type(value)~="table" or getmetatable(value)~=nil or readable(rawget(value,"version"))~=1 or type(value.names)~="table" or getmetatable(value.names)~=nil or #value.names~=10 then return nil end
  for k in pairs(value) do if k~="version" and k~="names" then return nil end end
  local names,seen={},{}
  for k in pairs(value.names) do if type(k)~="number" or k~=math.floor(k) or k<1 or k>10 then return nil end end
  for i=1,10 do local name=readable(value.names[i]);if type(name)~="string" or name=="" or #name>96 or name:find("[%z\1-\31\127]") or seen[name] then return nil end;names[i]=name;seen[name]=true end
  return {version=1,names=names}
end
function R.Observe()
  if read(GuildControlGetNumRanks)~=10 then return nil,"The complete ten-rank table is unavailable." end
  local names={};for i=1,10 do names[i]=read(GuildControlGetRankName,i) end
  local result=R.Copy({version=1,names=names})
  if not result or read(GuildControlGetNumRanks)~=10 then return nil,"Native rank names are missing, secret or ambiguous." end
  return result
end
function R.Same(a,b)
  a,b=R.Copy(a),R.Copy(b);if not a or not b then return false end
  for i=1,10 do if a.names[i]~=b.names[i] then return false end end;return true
end
function R.Qualified(value)
  local t=R.Copy(value);if not t or type(C)~="table" then return false end
  for i=1,10 do if t.names[i]~=C.names[i] then return false end end;return true
end
function R.Encode(value)
  local t=R.Copy(value);if not t then return "unavailable" end
  local p={"olympus-native-ranks|1|10"};for i=1,10 do p[#p+1]=tostring(i-1)..":"..tostring(#t.names[i])..":"..t.names[i] end
  return table.concat(p,"|")
end

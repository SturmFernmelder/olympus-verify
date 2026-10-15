-- Proposed optional, read-only census interface. This is a local review candidate,
-- not an interface provided by upstream 1.2.3. No network or direct SavedVariables parsing.
-- Summary retains its ordinary internal cache initialization; exported rows are copies.
local CENSUS_MAX = 300
local function CensusText(value, limit)
  return type(value) == "string" and #value > 0 and #value <= limit
    and not value:find("[%z\1-\31\127]")
end
local function CensusInteger(value, maximum)
  return type(value) == "number" and value == value and value >= 0
    and value <= maximum and value == math.floor(value)
end
function OlympusBridge.GetCensusSnapshot()
  if Masked() then return nil, "masked" end
  if type(ns.Data) ~= "table" or type(ns.Data.Summary) ~= "function" or type(ns.Now) ~= "function" then
    return nil, "unavailable"
  end
  if not CensusText(ns.group, 128) or (ns.faction ~= "Alliance" and ns.faction ~= "Horde") then
    return nil, "context_unavailable"
  end
  if not CensusText(ns.VERSION, 32) then return nil, "version_unavailable" end
  local clockOK, now = pcall(ns.Now)
  if not clockOK or not CensusInteger(now, 253402300799) then return nil, "clock_unavailable" end
  local ok, summary = pcall(ns.Data.Summary)
  if not ok or type(summary) ~= "table" or type(summary.guilds) ~= "table" or #summary.guilds > CENSUS_MAX then
    return nil, "census_unavailable"
  end
  local length, entries = #summary.guilds, 0
  for key in pairs(summary.guilds) do
    entries = entries + 1
    if entries > CENSUS_MAX or not CensusInteger(key, length) or key < 1 then
      return nil, "invalid_census"
    end
  end
  if entries ~= length then return nil, "invalid_census" end
  local rows, seen = {}, {}
  for i = 1, #summary.guilds do
    local entry = summary.guilds[i]
    local g = type(entry) == "table" and entry.g
    if type(g) ~= "table" or not CensusText(entry.name, 128)
      or not CensusInteger(g.total, 1000) or not CensusInteger(g.online, g.total)
      or not CensusInteger(g.t, now) then return nil, "invalid_census" end
    local nameKey = entry.name:lower()
    if seen[nameKey] then return nil, "ambiguous_census" end
    seen[nameKey] = true
    local age = now - g.t
    if age <= 7 * 86400 then
      rows[#rows + 1] = {
        name = entry.name, reportedCharacters = g.total, receivedAt = g.t,
        fresh = age <= 900, counted = age <= 86400,
        online = age <= 900 and g.online or nil,
      }
    end
  end
  table.sort(rows, function(a, b) return a.name:lower() < b.name:lower() end)
  return {
    format = "olympus-census-v1", addonVersion = ns.VERSION,
    realmGroup = ns.group, faction = ns.faction, observedAt = now,
    source = "community-observation", membershipProof = false, guilds = rows,
  }
end


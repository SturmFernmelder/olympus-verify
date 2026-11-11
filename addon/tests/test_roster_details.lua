-- Real core/Guild data functions with synthetic native APIs and display lists.
-- No Config.lua, installed SavedVariables, network or native actions are used.
local passed, failed = 0, 0
local function check(label, yes)
  if yes then passed = passed + 1; print("PASS " .. label)
  else failed = failed + 1; print("FAIL " .. label) end
end
local function fixture(age)
  local e = setmetatable({}, { __index = _G }); e._G = e
  setfenv(assert(loadfile("wow_mock.lua")), e)()
  local f = { e = e, now = 1794400000, effects = 0 }
  e.time = function() return f.now end
  e.GetGuildInfo = function() return "OLYMPUS PRIME", "Officer", 1 end
  e.GetRealmName = function() return "Synthetic Realm" end
  e.IsInGuild = function() return true end
  e.GetGuildRosterShowOffline = function() return true end
  e.OlympusVerifyConfig = { membershipOnly = true, secret = "synthetic-roster-details", uiAutoShow = false }
  e.OlympusVerifyDB = {}; e.OlympusQueue = { version = 1, entries = {} }
  e.ROSTER = {
    { name = "Verified Native", rank = "Veteran", rankIndex = 6, class = "MAGE", online = true },
    { name = "Negative Native", rank = "Initiate", rankIndex = 9, class = "PRIEST", online = false },
    { name = "Pending Native", rank = "Initiate", rankIndex = 9, class = "DRUID", online = true },
    { name = "Absent Native", rank = "Member", rankIndex = 8, class = "MAGE", online = false },
    { name = "Prior Native", rank = "Member", rankIndex = 8, class = "WARRIOR", online = true },
    { name = "Review Native", rank = "Member", rankIndex = 8, class = "PRIEST", online = false },
  }
  for i, r in ipairs(e.ROSTER) do r.guid = string.format("Player-1-%08X", i); r.level = 60 end
  local function effect() f.effects = f.effects + 1; error("unexpected native action") end
  e.SendChatMessage, e.GuildInvite, e.GuildPromote, e.GuildUninvite, e.ReloadUI = effect, effect, effect, effect, effect
  e.C_GuildInfo.Invite, e.C_GuildInfo.Uninvite, e.C_GuildInfo.SetGuildRankOrder = effect, effect, effect
  local snapshot = f.now - (age or 30)
  local q = { version = 2, guild = "OLYMPUS PRIME", realm = "Synthetic Realm",
    verified = { fetchedAt = f.now, snapshotAt = snapshot, members = {
      { name = "Verified Native", guid = e.ROSTER[1].guid, status = "member", username = "known_discord", displayName = "Known Display", discordId = "HIDDEN-ACCOUNT-CANARY" },
    } },
    unverified = { fetchedAt = f.now, snapshotAt = snapshot, members = {
      { name = "Negative Native", guid = e.ROSTER[2].guid, pending = false },
      { name = "Pending Native", guid = e.ROSTER[3].guid, pending = true },
    } },
    unknown = { fetchedAt = f.now, snapshotAt = snapshot, members = {
      { name = "Prior Native", guid = e.ROSTER[5].guid, reason = "linked_before_cutoff" },
      { name = "Review Native", guid = e.ROSTER[6].guid, reason = "link_review" },
    } } }
  e.OlympusVerifyLists = q; f.q = q
  local function load(name) setfenv(assert(loadfile("../OlympusVerify/" .. name)), e)("OlympusVerify", {}) end
  load("Libs/OlympusHmac.lua"); load("OlympusVerify.lua")
  e.OlympusVerifyFrame:GetScript("OnEvent")(e.OlympusVerifyFrame, "ADDON_LOADED", "OlympusVerify")
  load("OlympusVerifyGuild.lua")
  for _, frame in ipairs(e.FRAMES) do
    if frame._events and frame._events.PLAYER_LOGIN then frame:GetScript("OnEvent")(frame, "PLAYER_LOGIN") end
  end
  f.api = e.OlympusVerifyAPI.Roster
  return f
end
local function names(list)
  local out = {}; for _, row in ipairs(list) do out[#out + 1] = row.name end
  return table.concat(out, ",")
end
do
  local f = fixture(); local rows, info = f.api.Members(); local byName = {}
  for _, row in ipairs(rows) do byName[row.name] = row end
  local expected = { ["Verified Native"] = "verified", ["Negative Native"] = "unverified", ["Pending Native"] = "pending",
    ["Absent Native"] = "unknown", ["Prior Native"] = "prior_record", ["Review Native"] = "link_review" }
  for name, detail in pairs(expected) do
    local row = byName[name]; local status = f.e.OlympusVerifyGuild.Verification(row.full, row.guid)
    check(name .. " exposes the classifier detail", row.statusDetail == detail and status.statusDetail == detail)
    check(name .. " preserves exact reason and source clocks", row.statusReason == status.reason and row.statusAt == f.now and row.snapshotAt == f.now - 30)
  end
  check("detail metadata preserves conservative base totals", info.verified == 1 and info.unverified == 1 and info.pending == 1 and info.unknown == 3)
  check("detail filter selects one prior record", names(f.api.Filter(rows, { statusDetail = "prior_record" })) == "Prior Native")
  check("base unknown includes all three distinct details", #f.api.Filter(rows, { status = "unknown" }) == 3)
  check("base and detail filters compose", #f.api.Filter(rows, { status = "verified", statusDetail = "prior_record" }) == 0)
  check("detail, rank and online filters compose", names(f.api.Filter(rows, { statusDetail = "prior_record", rank = "Member", online = true })) == "Prior Native")
  check("offline includes only offline native rows", names(f.api.Filter(rows, { offline = true })) == "Negative Native,Absent Native,Review Native")
  check("opposing presence filters produce no rows", #f.api.Filter(rows, { online = true, offline = true }) == 0)
  check("search includes the native full name", names(f.api.Filter(rows, { text = "VERIFIED NATIVE-FOREVER" })) == "Verified Native")
  check("search includes native rank", names(f.api.Filter(rows, { text = "VETERAN" })) == "Verified Native")
  check("search includes native class", names(f.api.Filter(rows, { text = "DRUID" })) == "Pending Native")
  check("search includes the displayed status detail label", names(f.api.Filter(rows, { text = "Linked (prior record)" })) == "Prior Native")
  check("search includes the base status display label", names(f.api.Filter(rows, { text = "Not verified" })) == "Negative Native")
  check("search includes the original generic review reason", names(f.api.Filter(rows, { text = "account or identity checks need review" })) == "Review Native")
  check("search retains known Discord username", names(f.api.Filter(rows, { text = "KNOWN_DISCORD" })) == "Verified Native")
  check("search retains known Discord display text", names(f.api.Filter(rows, { text = "Known Display" })) == "Verified Native")
  check("search excludes hidden account IDs", #f.api.Filter(rows, { text = "HIDDEN-ACCOUNT-CANARY" }) == 0)
  check("search excludes native GUID IDs", #f.api.Filter(rows, { text = "Player-1-00000001" }) == 0)
  check("status sorting separates unknown display details", names(f.api.Sort(f.api.Filter(rows, {}), "status")) == "Verified Native,Pending Native,Negative Native,Absent Native,Prior Native,Review Native")
  check("reversed status keeps deterministic alphabetical ties", names(f.api.Sort(f.api.Filter(rows, {}), "status", true)) == "Review Native,Prior Native,Absent Native,Negative Native,Pending Native,Verified Native")
  check("detail selection does not trigger effects", f.effects == 0)
end
do
  local f = fixture(3601); local rows = f.api.Members(); local byName = {}
  for _, row in ipairs(rows) do byName[row.name] = row end
  check("expired exact link has dated detail and stale base status", byName["Verified Native"].status == "stale" and byName["Verified Native"].statusDetail == "linked_dated")
  check("expired negative has stale detail and never unverified", byName["Negative Native"].status == "stale" and byName["Negative Native"].statusDetail == "stale")
  check("dated filtering does not admit generic expired rows", names(f.api.Filter(rows, { statusDetail = "linked_dated" })) == "Verified Native")
  check("expired rows retain both original clocks", byName["Verified Native"].statusAt == f.now and byName["Verified Native"].snapshotAt == f.now - 3601)
  check("expired source cannot enable an unverified reminder", f.e.OlympusVerifyGuild.OpenWhisper("Negative Native-Forever", f.e.ROSTER[2].guid) == false)
  check("expired data reads do not trigger effects", f.effects == 0)
end
do
  local f = fixture()
  local rows = {
    { name = "Zulu", full = "Zulu-Forever", class = "MAGE", snapshotAt = f.now - 120 },
    { name = "Alpha", full = "Alpha-Forever", class = "DRUID", snapshotAt = f.now - 30 },
    { name = "Blank", full = "Blank-Forever" },
  }
  check("class sort uses native class with blanks last", names(f.api.Sort(f.api.Filter(rows, {}), "class")) == "Alpha,Zulu,Blank")
  check("reversed class sort still leaves blanks last", names(f.api.Sort(f.api.Filter(rows, {}), "class", true)) == "Zulu,Alpha,Blank")
  check("source age sort puts recent original observations first", names(f.api.Sort(f.api.Filter(rows, {}), "sourceAge")) == "Alpha,Zulu,Blank")
  check("reversed source age leaves missing clocks last", names(f.api.Sort(f.api.Filter(rows, {}), "sourceAge", true)) == "Zulu,Alpha,Blank")
  rows[1].snapshotAt = f.now + 1; rows[2].snapshotAt = 0
  check("invalid source clocks sort as unavailable", names(f.api.Sort(rows, "sourceAge")) == "Alpha,Blank,Zulu")
  local details = { {name="Zulu",status="unknown",statusDetail="unknown"},
    {name="Beta",status="unknown",statusDetail="prior_record"}, {name="Alpha",status="unknown",statusDetail="link_review"} }
  check("ascending status uses detail before alphabetical unknown names", names(f.api.Sort(details, "status")) == "Zulu,Beta,Alpha")
  local ties = { {name="Same",full="Same-Z",guid="B",class="MAGE"}, {name="Same",full="Same-A",guid="B",class="MAGE"}, {name="Same",full="Same-A",guid="A",class="MAGE"} }
  f.api.Sort(ties, "class", true)
  check("sort ties retain native full-name and GUID order", ties[1].full == "Same-A" and ties[1].guid == "A" and ties[2].guid == "B" and ties[3].full == "Same-Z")
end
do
  local f=fixture();local before=f.api.DisplayFacts()
  check("display facts report original query and native observation clocks",before.state=="loaded" and before.queriedAt==f.now and before.rosterObservedAt==f.now-30)
  f.e.OlympusVerifyDB.pendingSync233={lastRequestedAt=f.now,lastSyncAt=f.now}
  f.now=f.now+3601
  local stale=f.api.DisplayFacts()
  check("Sync request history cannot refresh expired actual display evidence",stale.state=="stale" and not stale.current and stale.queriedAt==before.queriedAt and stale.rosterObservedAt==before.rosterObservedAt)
  for _,section in ipairs({f.q.verified,f.q.unverified,f.q.unknown}) do section.fetchedAt=f.now+1 end
  check("future loaded source clocks are unavailable rather than fresh",f.api.DisplayFacts().state=="unavailable" and f.api.DisplayFacts().queriedAt==nil)
  f.q.realm="Other Realm"
  check("foreign native scope cannot supply display clocks",f.api.DisplayFacts().state=="unavailable" and f.api.DisplayFacts().queriedAt==nil and f.effects==0)
end
print("roster_details: " .. passed .. " passed, " .. failed .. " failed")
if failed > 0 then error("roster detail regressions failed") end

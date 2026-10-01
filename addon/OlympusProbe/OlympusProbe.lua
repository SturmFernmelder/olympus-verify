-- OlympusProbe — a one-session, read-only probe of the Classic Forever beta addon API.
--
-- What it does on its own: listens to events and writes facts (build, player/realm name formats, which
-- API functions exist, guild roster shape, whisper argument shapes) into the OlympusProbeDB SavedVariable.
-- What it does only when the player types a command:
--   /olp test            restriction test: calls C_GuildInfo.Invite / SetNote and a self-whisper first from the
--                        hardware event (your key press) and then from a timer, and records which calls the
--                        client blocks (ADDON_ACTION_FORBIDDEN). The invite name is impossible (contains a digit)
--                        so nobody can ever receive it; SetNote gets a fake GUID. Nothing else is sent.
--                        A "blocked from an action only available to the Blizzard UI" popup is expected — click Ignore.
--   /olp note            SetNote alone, first call of the hardware event, own GUID, note unchanged (isolates SetNote).
--   /olp multi           three C_GuildInfo.Invite calls (impossible names) in one key press — do all three go out?
--   /olp reloadtest      C_UI.Reload() from a timer, 3 s later — may an addon reload the UI on its own?
--   /olp guild           re-records guild membership and permissions right now.
--   /olp exists <name>   C_GuildInfo.MemberExistsByName from a timer (how the real addon would notice an accepted invite).
--   /olp doc <Namespace> dumps Blizzard's own API documentation for C_<Namespace> (e.g. GuildInfo, ChatInfo).
--   /olp show            prints a short summary to chat.
--   /olp chatlog on|off  calls LoggingChat(true|false) (writes Logs\WoWChatLog.txt) — off unless you ask.
--   /olp reset           wipes the saved data.
-- SavedVariables are written when you log out or /reload; do one of those after /olp test.
-- It never invites, kicks, promotes, sets a real note, or sends anything to another player.

local ADDON_NAME = ...
local PROBE_VERSION = "0.1.3"
local frame = CreateFrame("Frame")
local DB, S -- SavedVariable root, current session record

local function stamp() return date("!%Y-%m-%dT%H:%M:%SZ") end
local function say(msg) print("|cffc9a227[OlympusProbe]|r " .. tostring(msg)) end

local function note(err)
  S.errors = S.errors or {}
  S.errors[#S.errors + 1] = { at = stamp(), err = tostring(err) }
end

-- Run fn in protected mode; record any error in S.errors and return ok, result...
local function try(label, fn, ...)
  local res = { pcall(fn, ...) }
  local ok = table.remove(res, 1)
  if not ok then note(label .. ": " .. tostring(res[1])) end
  return ok, unpack(res)
end

-- Describe a vararg list as "count" and a comma-separated list of Lua types.
local function shapeOf(...)
  local n = select("#", ...)
  local t = {}
  for i = 1, n do t[i] = type((select(i, ...))) end
  return n, table.concat(t, ",")
end

-- Store a vararg list as a plain array of printable values (strings/numbers/booleans; other types by type name).
local function valuesOf(...)
  local n = select("#", ...)
  local out = { n = n }
  for i = 1, n do
    local v = select(i, ...)
    local tv = type(v)
    if tv == "string" or tv == "number" or tv == "boolean" then out[i] = v elseif v == nil then out[i] = "nil" else out[i] = "<" .. tv .. ">" end
  end
  return out
end

-- Resolve "C_GuildInfo.Invite" or "GuildInvite" to a value without touching forbidden tables.
local function resolve(path)
  local ns, name = path:match("^([%w_]+)%.([%w_]+)$")
  if ns then
    local t = rawget(_G, ns)
    if type(t) ~= "table" then return nil, "namespace missing" end
    local ok, v = pcall(function() return t[name] end)
    if not ok then return nil, "forbidden" end
    return v
  end
  return rawget(_G, path)
end

local FUNCS = {
  -- guild
  "GuildInvite", "GuildUninvite", "GuildRoster", "GuildRosterSetPublicNote", "GuildRosterSetOfficerNote",
  "GetGuildRosterInfo", "GetNumGuildMembers", "GetGuildInfo", "IsInGuild", "IsGuildMember", "IsGuildLeader",
  "CanGuildInvite", "CanGuildRemove", "CanGuildPromote", "CanEditPublicNote", "CanEditOfficerNote", "CanViewOfficerNote",
  "SetGuildRosterShowOffline", "GetGuildRosterLastOnline", "GetGuildRosterSelection",
  "C_GuildInfo.Invite", "C_GuildInfo.Uninvite", "C_GuildInfo.SetNote", "C_GuildInfo.GuildRoster", "C_GuildInfo.MemberExistsByName",
  "C_GuildInfo.IsGuildOfficer", "C_GuildInfo.CanViewOfficerNote", "C_GuildInfo.CanEditOfficerNote", "C_GuildInfo.GetGuildRankOrder",
  "C_GuildInfo.RemoveFromGuild", "C_GuildInfo.Promote", "C_GuildInfo.Demote", "C_GuildInfo.GetMOTD", "C_GuildInfo.SetMOTD",
  "C_GuildInfo.SetPreferredPlaySettings", "C_GuildInfo.GuildControlGetRankFlags", "C_GuildInfo.IsGuildRankAssignmentAllowed",
  -- chat
  "SendChatMessage", "LoggingChat", "LoggingCombat", "SendSystemMessage",
  "C_ChatInfo.SendChatMessage", "C_ChatInfo.SendAddonMessage", "C_ChatInfo.RegisterAddonMessagePrefix", "C_ChatInfo.IsLoggingChat",
  "C_ChatInfo.AreOutgoingAddonChatMessagesRestricted", "C_ChatInfo.InChatMessagingLockdown", "C_ChatInfo.GetChatLineSenderGUID",
  "C_ChatInfo.GetChatLineSenderName", "C_ChatInfo.IsChatLineCensored", "C_ChatInfo.IsTimerunningPlayer",
  -- mail
  "CheckInbox", "GetInboxNumItems", "GetInboxHeaderInfo", "GetInboxText", "HasNewMail", "C_Mail.IsCommandPending", "C_Mail.HasInboxMoney",
  -- identity
  "UnitName", "UnitFullName", "GetUnitName", "UnitGUID", "GetRealmName", "GetNormalizedRealmName", "GetPlayerInfoByGUID",
  "GetAutoCompleteRealms", "C_PlayerInfo.GUIDIsPlayer", "C_PlayerInfo.UnitIsSameServer", "C_RealmList.GetRealmList",
  "BNGetInfo", "C_BattleNet.GetAccountInfoByGUID", "C_BattleNet.GetGameAccountInfoByGUID",
  -- build / ruleset
  "GetBuildInfo", "IsTestBuild", "IsBetaBuild", "IsPublicBuild", "IsPublicTestClient", "GetCurrentRegion", "GetCurrentRegionName",
  "GetExpansionLevel", "GetServerExpansionLevel", "GetAccountExpansionLevel", "GetClassicExpansionLevel", "GetMaxLevelForExpansionLevel",
  "C_GameRules.IsSelfFoundAllowed", "C_GameRules.IsStandard", "C_GameRules.IsWoWHack", "C_GameRules.IsSDHDToggleEnabled",
  "C_GameRules.SelectClassicExperiencePreset", "C_GameRules.SelectModernExperiencePreset", "C_Seasons.GetActiveSeason", "C_Seasons.HasActiveSeason",
  -- utilities
  "C_Timer.After", "C_Timer.NewTicker", "C_AddOns.GetAddOnMetadata", "C_AddOns.LoadAddOn", "GetAddOnMetadata", "LoadAddOn",
  "C_EncodingUtil.EncodeBase64", "C_EncodingUtil.EncodeHex", "C_EncodingUtil.SerializeJSON", "C_EncodingUtil.DeserializeJSON",
  "C_EncodingUtil.SerializeCBOR", "C_EncodingUtil.CompressString", "C_EncodingUtil.ComputeSHA256", "C_EncodingUtil.ComputeHMAC",
  "issecurevariable", "InCombatLockdown", "GetServerTime", "debugstack", "geterrorhandler",
  "string.trim", "string.startswith", "table.contains", "table.freeze",
}
local LIST_NAMESPACES = { "C_GuildInfo", "C_ChatInfo", "C_Mail", "C_EncodingUtil", "C_GameRules", "C_Seasons", "C_RealmList", "C_PlayerInfo", "C_AddOns" }

local function recordStatic()
  S.build = valuesOf(GetBuildInfo())
  S.tocversion = select(4, GetBuildInfo())
  S.funcs = {}
  for _, path in ipairs(FUNCS) do
    local v, why = resolve(path)
    S.funcs[path] = v ~= nil and type(v) or (why or "absent")
  end
  -- every C_* namespace with its function count; full names for the ones we care about
  S.namespaces, S.namespaceFuncs = {}, {}
  local wanted = {}
  for _, n in ipairs(LIST_NAMESPACES) do wanted[n] = true end
  for k, v in pairs(_G) do
    if type(k) == "string" and k:sub(1, 2) == "C_" and type(v) == "table" then
      local ok, count, names = pcall(function()
        local c, list = 0, {}
        for fname, fv in pairs(v) do
          if type(fv) == "function" then c = c + 1; list[#list + 1] = fname end
        end
        table.sort(list)
        return c, list
      end)
      S.namespaces[k] = ok and count or "forbidden"
      if ok and wanted[k] then S.namespaceFuncs[k] = table.concat(names, " ") end
    end
  end
  S.projectGlobals = {}
  for k, v in pairs(_G) do
    if type(k) == "string" and (k:match("^WOW_PROJECT_") or k:match("^LE_EXPANSION_LEVEL_")) and (type(v) == "number" or type(v) == "string" or type(v) == "boolean") then
      S.projectGlobals[k] = v
    end
  end
  S.flags = {}
  for _, name in ipairs({ "IsTestBuild", "IsBetaBuild", "IsPublicBuild", "IsPublicTestClient", "GetCurrentRegion", "GetCurrentRegionName",
    "GetExpansionLevel", "GetServerExpansionLevel", "GetAccountExpansionLevel", "GetClassicExpansionLevel" }) do
    local fn = rawget(_G, name)
    if type(fn) == "function" then
      local ok, a, b = pcall(fn)
      S.flags[name] = ok and (tostring(a) .. (b ~= nil and ("," .. tostring(b)) or "")) or ("error: " .. tostring(a))
    end
  end
  for _, path in ipairs({ "C_GameRules.IsSelfFoundAllowed", "C_GameRules.IsStandard", "C_GameRules.IsWoWHack", "C_GameRules.IsSDHDToggleEnabled",
    "C_ChatInfo.InChatMessagingLockdown", "C_ChatInfo.AreOutgoingAddonChatMessagesRestricted", "C_ChatInfo.IsLoggingChat", "C_Seasons.HasActiveSeason", "C_Seasons.GetActiveSeason" }) do
    local fn = resolve(path)
    if type(fn) == "function" then
      local ok, a = pcall(fn)
      S.flags[path] = ok and tostring(a) or ("error: " .. tostring(a))
    end
  end
  local lc = rawget(_G, "LoggingChat")
  if type(lc) == "function" then
    local ok, v = pcall(lc)
    S.flags.LoggingChat = ok and tostring(v) or ("error: " .. tostring(v))
  end
end

local function recordPlayer()
  S.player = {}
  local ok, n, r = pcall(UnitFullName, "player"); S.player.UnitFullName = ok and (tostring(n) .. " | " .. tostring(r)) or ("error: " .. tostring(n))
  ok, n, r = pcall(UnitName, "player"); S.player.UnitName = ok and (tostring(n) .. " | " .. tostring(r)) or ("error: " .. tostring(n))
  if GetUnitName then ok, n = pcall(GetUnitName, "player", true); S.player.GetUnitName_showServer = ok and tostring(n) or ("error: " .. tostring(n)) end
  ok, n = pcall(UnitGUID, "player"); S.player.UnitGUID = ok and tostring(n) or ("error: " .. tostring(n))
  ok, n = pcall(GetRealmName); S.player.GetRealmName = ok and tostring(n) or ("error: " .. tostring(n))
  if GetNormalizedRealmName then ok, n = pcall(GetNormalizedRealmName); S.player.GetNormalizedRealmName = ok and tostring(n) or ("error: " .. tostring(n)) end
  if GetAutoCompleteRealms then ok, n = pcall(function() return table.concat(GetAutoCompleteRealms() or {}, ",") end); S.player.GetAutoCompleteRealms = ok and tostring(n) or ("error: " .. tostring(n)) end
  S.cvars = {}
  for _, cv in ipairs({ "portal", "agentUID", "realmName", "realmList" }) do
    local okc, v = pcall(GetCVar, cv)
    S.cvars[cv] = okc and tostring(v) or ("error: " .. tostring(v))
  end
  -- guild membership
  S.guild = {}
  ok, n = pcall(IsInGuild); S.guild.IsInGuild = ok and tostring(n) or ("error: " .. tostring(n))
  ok, n = pcall(function() return valuesOf(GetGuildInfo("player")) end); S.guild.GetGuildInfo = ok and n or ("error: " .. tostring(n))
  for _, name in ipairs({ "CanGuildInvite", "CanEditPublicNote", "CanEditOfficerNote", "CanViewOfficerNote", "IsGuildLeader" }) do
    local fn = rawget(_G, name)
    if type(fn) == "function" then local okf, v = pcall(fn); S.guild[name] = okf and tostring(v) or ("error: " .. tostring(v)) end
  end
  local off = resolve("C_GuildInfo.IsGuildOfficer")
  if type(off) == "function" then local okf, v = pcall(off); S.guild["C_GuildInfo.IsGuildOfficer"] = okf and tostring(v) or ("error: " .. tostring(v)) end
  if S.guild.IsInGuild == "true" then
    local req = resolve("C_GuildInfo.GuildRoster") or rawget(_G, "GuildRoster")
    if type(req) == "function" then pcall(req) end
  end
end

local function recordRoster()
  if type(GetNumGuildMembers) ~= "function" or type(GetGuildRosterInfo) ~= "function" then return end
  local ok, total, online = pcall(GetNumGuildMembers)
  if not ok then note("GetNumGuildMembers: " .. tostring(total)); return end
  S.roster = S.roster or {}
  S.roster.at = stamp()
  S.roster.GetNumGuildMembers = tostring(total) .. "," .. tostring(online)
  if (tonumber(total) or 0) > 0 then
    local okr, n, types = pcall(function() return shapeOf(GetGuildRosterInfo(1)) end)
    S.roster.entryShape = okr and (n .. " returns: " .. types) or ("error: " .. tostring(n))
    S.roster.samples = {}
    for i = 1, math.min(3, tonumber(total) or 0) do
      local oks, name, rankName, rankIndex, level, class, zone, pnote, onote, isOnline, status, classFile, ap, ar, isMobile, canSoR, rep, guid = pcall(GetGuildRosterInfo, i)
      if oks then
        S.roster.samples[i] = { name = tostring(name), rankName = tostring(rankName), rankIndex = tostring(rankIndex), level = tostring(level),
          classFile = tostring(classFile), isOnline = tostring(isOnline), pnoteLen = pnote and #tostring(pnote) or 0, onote = onote ~= nil and type(onote) or "nil",
          guid = tostring(guid), rep = tostring(rep) }
      end
    end
  end
end

-- ---------- whispers: only shapes and sender formats, never the text (except our own probe line) ----------
local function recordChat(event, ...)
  S.chat = S.chat or {}
  if #S.chat >= 20 then return end
  local text, sender, lang, chan, sender2, flags, zid, cidx, cbase, lid, lineID, guid, bnID = ...
  local n, types = shapeOf(...)
  S.chat[#S.chat + 1] = {
    at = stamp(), event = event, nargs = n, types = types,
    sender = tostring(sender), sender2 = tostring(sender2), guid = tostring(guid), bnSenderID = tostring(bnID), lineID = tostring(lineID),
    msgLen = type(text) == "string" and #text or -1,
    text = (type(text) == "string" and text:sub(1, 14) == "[OlympusProbe]") and text or nil,
  }
end

-- ---------- restriction test ----------
local IMPOSSIBLE_NAME = "Olympusprobe9x" -- digits are not allowed in character names: this can never be a real player
local FAKE_GUID = "Player-0-0000000000"

local function call(phase, label, fn, ...)
  local rec = { phase = phase, label = label, at = stamp(), before = #(S.forbidden or {}) }
  S.tests[#S.tests + 1] = rec
  if type(fn) ~= "function" then rec.result = "absent"; return end
  S.currentPhase = phase .. " " .. label
  local ok, err = pcall(fn, ...)
  S.currentPhase = nil
  rec.result = ok and "returned (not blocked by the client)" or ("lua error: " .. tostring(err))
  local after = #(S.forbidden or {})
  if after > rec.before then rec.result = rec.result .. " ; ADDON_ACTION_FORBIDDEN/BLOCKED fired (" .. (after - rec.before) .. ")" end
end

local function testBattery(phase)
  local me = UnitName("player")
  call(phase, "C_GuildInfo.Invite(impossibleName)", resolve("C_GuildInfo.Invite"), IMPOSSIBLE_NAME)
  call(phase, "GuildInvite(impossibleName)", rawget(_G, "GuildInvite"), IMPOSSIBLE_NAME)
  call(phase, "C_GuildInfo.SetNote(fakeGuid, 'olp', true)", resolve("C_GuildInfo.SetNote"), FAKE_GUID, "olp", true)
  call(phase, "C_GuildInfo.MemberExistsByName(impossibleName)", resolve("C_GuildInfo.MemberExistsByName"), IMPOSSIBLE_NAME)
  call(phase, "SendChatMessage(whisper to self)", rawget(_G, "SendChatMessage"), "[OlympusProbe] " .. phase .. " whisper test", "WHISPER", nil, me)
  call(phase, "C_GuildInfo.GuildRoster()", resolve("C_GuildInfo.GuildRoster"))
end

local function runTest()
  S.tests = S.tests or {}
  S.tests[#S.tests + 1] = { phase = "start", at = stamp(), inGuild = tostring(IsInGuild and IsInGuild()) }
  S.testWindowUntil = GetTime() + 12
  say("hardware-event phase (called directly from your command)…")
  testBattery("hardware")
  say("timer phase in 1.5 s (no hardware event). If a 'blocked from an action only available to the Blizzard UI' popup appears, that is the expected result — click Ignore.")
  C_Timer.After(1.5, function()
    testBattery("timer")
    C_Timer.After(0.5, function()
      local blocked = {}
      for _, f in ipairs(S.forbidden or {}) do blocked[#blocked + 1] = (f.phase or "?") .. " → " .. tostring(f.func) end
      say("done. Blocked calls: " .. (#blocked > 0 and table.concat(blocked, "; ") or "none") .. ". Now /reload or log out so the results are saved.")
    end)
  end)
end

-- /olp note — SetNote alone, as the very first call of the hardware event, with the player's own GUID and the
-- note that is already there (so nothing changes even if the call goes through). Settles whether SetNote is
-- forbidden outright or was only blocked because of ordering / the fake GUID in /olp test.
local function runNoteTest()
  S.tests = S.tests or {}
  if not (IsInGuild and IsInGuild()) then say("you are not in a guild — /olp note needs a guild"); return end
  local me = UnitGUID("player")
  local myNote, myIndex
  for i = 1, (GetNumGuildMembers() or 0) do
    local name, _, _, _, _, _, pnote, _, _, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    if guid == me then myNote, myIndex = pnote or "", i; break end
  end
  S.testWindowUntil = GetTime() + 8
  S.tests[#S.tests + 1] = { phase = "note-start", at = stamp(), rosterIndex = tostring(myIndex), noteLen = myNote and #myNote or -1,
    CanEditPublicNote = tostring(CanEditPublicNote and CanEditPublicNote()), IsGuildOfficer = tostring(C_GuildInfo.IsGuildOfficer and C_GuildInfo.IsGuildOfficer()) }
  call("hardware-first", "C_GuildInfo.SetNote(ownGuid, currentNote, true)", resolve("C_GuildInfo.SetNote"), me, myNote or "", true)
  local t = S.tests[#S.tests]
  say("SetNote on your own entry (note unchanged): " .. tostring(t.result) .. ". /reload to save.")
end

-- /olp multi — two C_GuildInfo.Invite calls (two impossible names) inside ONE hardware event: does the second one
-- still go out? Expect two "not found" system messages within a few seconds (beta test plan item 2).
local function runMultiTest()
  S.tests = S.tests or {}
  S.testWindowUntil = GetTime() + 8
  S.tests[#S.tests + 1] = { phase = "multi-start", at = stamp() }
  call("hardware-multi-1", "C_GuildInfo.Invite(impossibleName)", resolve("C_GuildInfo.Invite"), IMPOSSIBLE_NAME)
  call("hardware-multi-2", "C_GuildInfo.Invite(impossibleName2)", resolve("C_GuildInfo.Invite"), "Olympusprobe8y")
  call("hardware-multi-3", "C_GuildInfo.Invite(impossibleName3)", resolve("C_GuildInfo.Invite"), "Olympusprobe7z")
  say("three invites from one key press sent; count the 'not found' lines (expected 3), then /reload.")
end

-- /olp reloadtest — C_UI.Reload() from a timer (no hardware event), 3 s after the command. If the UI reloads, an addon
-- may sync its SavedVariables on its own (opt-in "verification desk" mode for a parked officer alt); if a "blocked"
-- popup appears instead, it may not. The previous session's endedAt in the saved file tells which.
local function runReloadTest()
  S.tests = S.tests or {}
  S.tests[#S.tests + 1] = { phase = "reload-timer", at = stamp(), label = "C_UI.Reload() scheduled from a timer (3 s)" }
  say("reloading the UI from a timer in 3 s — if a 'blocked' popup appears instead, that is the result (click Ignore).")
  C_Timer.After(3, function()
    local fn = (type(rawget(_G, "C_UI")) == "table" and C_UI.Reload) or rawget(_G, "ReloadUI")
    call("timer", "C_UI.Reload()", fn)
  end)
end

-- /olp guild — re-record guild membership and permissions now (the automatic record is taken at login).
local function recordGuildNow()
  S.guildNow = { at = stamp() }
  local g = S.guildNow
  local ok, n = pcall(IsInGuild); g.IsInGuild = ok and tostring(n) or ("error: " .. tostring(n))
  ok, n = pcall(function() return valuesOf(GetGuildInfo("player")) end); g.GetGuildInfo = ok and n or ("error: " .. tostring(n))
  for _, name in ipairs({ "CanGuildInvite", "CanEditPublicNote", "IsGuildLeader", "CanGuildRemove", "CanGuildPromote" }) do
    local fn = rawget(_G, name)
    if type(fn) == "function" then local okf, v = pcall(fn); g[name] = okf and tostring(v) or ("error: " .. tostring(v)) end
  end
  for _, path in ipairs({ "C_GuildInfo.IsGuildOfficer", "C_GuildInfo.CanEditOfficerNote", "C_GuildInfo.CanViewOfficerNote" }) do
    local fn = resolve(path)
    if type(fn) == "function" then local okf, v = pcall(fn); g[path] = okf and tostring(v) or ("error: " .. tostring(v)) end
  end
  local okr, total, online = pcall(GetNumGuildMembers); g.GetNumGuildMembers = okr and (tostring(total) .. "," .. tostring(online)) or ("error: " .. tostring(total))
  say(string.format("guild: %s, invite %s, edit public note %s, officer %s, members %s", g.IsInGuild, tostring(g.CanGuildInvite), tostring(g.CanEditPublicNote), tostring(g["C_GuildInfo.IsGuildOfficer"]), g.GetNumGuildMembers))
end

-- /olp exists <name> — C_GuildInfo.MemberExistsByName from a timer (no hardware event), the check the real addon
-- would use to notice an accepted invite without waiting for a roster export.
local function runExistsTest(name)
  if not name or name == "" then say("usage: /olp exists <character name>"); return end
  C_Timer.After(0.5, function()
    local fn = resolve("C_GuildInfo.MemberExistsByName")
    local rec = { phase = "timer", label = "MemberExistsByName(" .. name .. ")", at = stamp() }
    S.tests[#S.tests + 1] = rec
    if type(fn) ~= "function" then rec.result = "absent"; say("MemberExistsByName is absent"); return end
    local ok, v = pcall(fn, name)
    rec.result = ok and ("returned " .. tostring(v)) or ("lua error: " .. tostring(v))
    say("MemberExistsByName(" .. name .. ") from a timer → " .. rec.result)
  end)
end

-- ---------- Blizzard's own API documentation for one namespace ----------
local function dumpDocs(nsName)
  nsName = (nsName or ""):gsub("^C_", "")
  if nsName == "" then say("usage: /olp doc GuildInfo   (or ChatInfo, Mail, EncodingUtil, GameRules, RealmList …)"); return end
  local out = { at = stamp() }
  local ok, err = pcall(function()
    if not rawget(_G, "APIDocumentation") then
      local loader = resolve("C_AddOns.LoadAddOn") or rawget(_G, "LoadAddOn")
      if loader then pcall(loader, "Blizzard_APIDocumentationGenerated"); pcall(loader, "Blizzard_APIDocumentation") end
    end
    local doc = rawget(_G, "APIDocumentation")
    if not doc then error("APIDocumentation is not available in this client") end
    local want = "C_" .. nsName
    local function belongs(entry)
      local sys = entry.System
      local ns = sys and sys.Namespace
      if ns == nil and sys and sys.GetNamespaceName then local okn, v = pcall(sys.GetNamespaceName, sys); if okn then ns = v end end
      return ns == want
    end
    out.functions, out.events, out.tables = {}, {}, {}
    for _, fn in ipairs(doc.functions or {}) do
      if belongs(fn) then
        local e = { name = fn.Name }
        if fn.GetFullName then local okf, full = pcall(fn.GetFullName, fn, true, false); if okf then e.sig = full end end
        if fn.Documentation then e.doc = table.concat(fn.Documentation, " | ") end
        if fn.MayReturnNothing then e.mayReturnNothing = true end
        local args = {}
        for _, a in ipairs(fn.Arguments or {}) do args[#args + 1] = tostring(a.Name) .. ":" .. tostring(a.Type) .. (a.Nilable and "?" or "") end
        e.args = table.concat(args, ", ")
        local rets = {}
        for _, r in ipairs(fn.Returns or {}) do rets[#rets + 1] = tostring(r.Name) .. ":" .. tostring(r.Type) .. (r.Nilable and "?" or "") end
        e.returns = table.concat(rets, ", ")
        out.functions[#out.functions + 1] = e
      end
    end
    for _, ev in ipairs(doc.events or {}) do
      if belongs(ev) then
        local p = {}
        for _, a in ipairs(ev.Payload or {}) do p[#p + 1] = tostring(a.Name) .. ":" .. tostring(a.Type) .. (a.Nilable and "?" or "") end
        out.events[#out.events + 1] = { name = tostring(ev.LiteralName or ev.Name), payload = table.concat(p, ", "), doc = ev.Documentation and table.concat(ev.Documentation, " | ") or nil }
      end
    end
    for _, tb in ipairs(doc.tables or {}) do
      if belongs(tb) then
        local fields = {}
        for _, fd in ipairs(tb.Fields or {}) do fields[#fields + 1] = tostring(fd.Name) .. ":" .. tostring(fd.Type) .. (fd.Nilable and "?" or "") .. (fd.EnumValue ~= nil and ("=" .. tostring(fd.EnumValue)) or "") end
        out.tables[#out.tables + 1] = { name = tostring(tb.Name), type = tostring(tb.Type), fields = table.concat(fields, ", "), doc = tb.Documentation and table.concat(tb.Documentation, " | ") or nil }
      end
    end
    table.sort(out.functions, function(a, b) return a.name < b.name end)
    out.count = #out.functions .. " functions, " .. #out.events .. " events, " .. #out.tables .. " tables"
  end)
  if not ok then out.error = tostring(err) end
  DB.docs = DB.docs or {}
  DB.docs[nsName] = out
  say("docs for C_" .. nsName .. ": " .. (out.error or out.count) .. " (saved on /reload or logout)")
end

local function showSummary()
  say("client " .. table.concat({ tostring(S.build[1]), tostring(S.build[2]), tostring(S.build[4]) }, " / ") .. ", player " .. tostring(S.player and S.player.UnitFullName) .. ", guild " .. tostring(S.guild and S.guild.IsInGuild))
  local present, absent = {}, {}
  for _, p in ipairs({ "C_GuildInfo.Invite", "C_GuildInfo.SetNote", "GuildInvite", "GuildRosterSetPublicNote", "SendChatMessage", "C_ChatInfo.SendChatMessage", "LoggingChat", "GetGuildRosterInfo", "GetInboxText" }) do
    if S.funcs[p] == "function" then present[#present + 1] = p else absent[#absent + 1] = p end
  end
  say("present: " .. table.concat(present, ", "))
  say("absent: " .. (#absent > 0 and table.concat(absent, ", ") or "none"))
  say("blocked calls so far: " .. #(S.forbidden or {}) .. "; tests run: " .. #(S.tests or {}) .. "; whispers seen: " .. #(S.chat or {}))
end

-- ---------- events ----------
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")
frame:RegisterEvent("CHAT_MSG_WHISPER")
frame:RegisterEvent("CHAT_MSG_WHISPER_INFORM")
frame:RegisterEvent("CHAT_MSG_SYSTEM")
frame:RegisterEvent("UI_ERROR_MESSAGE")
frame:RegisterEvent("ADDON_ACTION_FORBIDDEN")
frame:RegisterEvent("ADDON_ACTION_BLOCKED")
frame:RegisterEvent("PLAYER_LOGOUT")

frame:SetScript("OnEvent", function(_, event, ...)
  if event == "ADDON_LOADED" then
    if ... ~= ADDON_NAME then return end
    OlympusProbeDB = OlympusProbeDB or {}
    DB = OlympusProbeDB
    DB.probeVersion = PROBE_VERSION
    DB.sessions = DB.sessions or {}
    S = { startedAt = stamp(), forbidden = {}, tests = {} }
    table.insert(DB.sessions, S)
    while #DB.sessions > 5 do table.remove(DB.sessions, 1) end
    try("recordStatic", recordStatic)
    S.build = S.build or {}
    say("loaded on " .. tostring(S.build[1]) .. " build " .. tostring(S.build[2]) .. " (toc " .. tostring(S.tocversion) .. "). Type /olp for commands.")
    return
  end
  if not S then return end
  if event == "PLAYER_ENTERING_WORLD" then
    if not S.player then try("recordPlayer", recordPlayer) end
  elseif event == "GUILD_ROSTER_UPDATE" then
    try("recordRoster", recordRoster)
  elseif event == "CHAT_MSG_WHISPER" or event == "CHAT_MSG_WHISPER_INFORM" then
    try("recordChat", recordChat, event, ...)
  elseif event == "CHAT_MSG_SYSTEM" or event == "UI_ERROR_MESSAGE" then
    if S.testWindowUntil and GetTime() < S.testWindowUntil then
      S.testMessages = S.testMessages or {}
      local a, b = ...
      S.testMessages[#S.testMessages + 1] = { at = stamp(), event = event, phase = S.currentPhase, text = tostring(event == "UI_ERROR_MESSAGE" and b or a) }
    end
  elseif event == "ADDON_ACTION_FORBIDDEN" or event == "ADDON_ACTION_BLOCKED" then
    local addon, func = ...
    if addon == ADDON_NAME or S.currentPhase then
      S.forbidden[#S.forbidden + 1] = { at = stamp(), event = event, addon = tostring(addon), func = tostring(func), phase = S.currentPhase }
    end
  elseif event == "PLAYER_LOGOUT" then
    S.endedAt = stamp()
  end
end)

-- ---------- slash command ----------
SLASH_OLYMPUSPROBE1 = "/olp"
SlashCmdList.OLYMPUSPROBE = function(msg)
  if not S then say("not initialised"); return end
  local cmd, arg = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  cmd = (cmd or ""):lower()
  if cmd == "test" then
    try("runTest", runTest)
  elseif cmd == "note" then
    try("runNoteTest", runNoteTest)
  elseif cmd == "multi" then
    try("runMultiTest", runMultiTest)
  elseif cmd == "reloadtest" then
    try("runReloadTest", runReloadTest)
  elseif cmd == "guild" then
    try("recordGuildNow", recordGuildNow)
  elseif cmd == "exists" then
    try("runExistsTest", runExistsTest, arg)
  elseif cmd == "doc" then
    try("dumpDocs", dumpDocs, arg)
  elseif cmd == "show" then
    try("showSummary", showSummary)
  elseif cmd == "chatlog" then
    local lc = rawget(_G, "LoggingChat")
    if type(lc) ~= "function" then say("LoggingChat is not available"); return end
    local ok, v = pcall(lc, arg:lower() == "on")
    say("LoggingChat(" .. tostring(arg:lower() == "on") .. ") → " .. (ok and tostring(v) or ("error: " .. tostring(v))))
  elseif cmd == "reset" then
    for k in pairs(DB) do DB[k] = nil end
    DB.probeVersion = PROBE_VERSION
    DB.sessions = { S }
    say("saved data cleared (this session is kept)")
  else
    say("commands: /olp test | /olp note | /olp multi | /olp reloadtest | /olp guild | /olp exists <name> | /olp doc <Namespace> | /olp show | /olp chatlog on|off | /olp reset")
  end
end

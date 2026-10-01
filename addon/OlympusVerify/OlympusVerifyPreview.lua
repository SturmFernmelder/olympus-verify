--[[ OlympusVerify — panel preview: invented sample data, with every action disconnected.

  "/olv preview [state]" fills the officer panel with made-up applicants, members and events, so that every state the
  panel can be in can be looked at and screenshotted in game. Most of those states cannot be produced on demand on the
  live guild -- a queue long enough to scroll, the guild at its cap with removal candidates, the unverified list with
  its rank filter, the macro route, a broken setup -- and producing them for real would mean inviting, checking or
  removing real people. "/olv preview list" names the states; "/olv preview off" ends it.

  What keeps it safe, and why each piece is there:
    * Opt-in, and gone after a /reload. Every sample lives in this file's local tables. Nothing is written to
      OlympusVerifyDB or any other SavedVariable, so a sample can never reach the queue, the event ring or the roster
      export that the watcher relays to Discord.
    * While it is on, every action has a stand-in that prints what it would have done and changes only the sample:
      each function in OlympusVerifyAPI (the panel's buttons) and each global OlympusVerify_* function. The globals
      matter as much as the table: the launcher button and the flush key binding call OlympusVerify_Flush directly,
      so swapping the table alone would leave the most-pressed key in the addon live. No stand-in calls an original.
    * Every /olv subcommand except the panel toggles, help/status and preview itself is refused while it is on.
      flush, clear, roster, aim, macrotest, logtest and the rest reach real actions through locals in OlympusVerify.lua
      that this file cannot swap, so they are stopped at the door instead.
    * "off" puts back the very function values it took (the same identities, not copies) and the view the officer had
      (UI.removalView, UI.showAll). Switching between states captures nothing again, so a stand-in can never be
      mistaken for an original and "restored".
    * The /olv wrapper is installed once, when this file loads, and stays. The chat frame caches a slash handler the
      first time the command is typed, so a handler swapped in later would be silently ignored; and "/olv preview"
      has to be routable while preview is off. Outside preview the wrapper hands every other command, with every
      argument, to the original handler untouched.

  What it does not cover: the addon's background work carries on for real behind the samples (a whisper with a valid
  code is still answered and queued, and the launcher still counts the real queue), and an OlvKick macro already on an
  action bar is the player's own /guildremove, which no addon should or can intercept. The samples never edit it.

  Loads after OlympusVerify.lua and OlympusVerifyUI.lua (TOC order). Without the API it does nothing at all; without
  the panel, "/olv preview" says so and changes nothing. ]]

local API = OlympusVerifyAPI
local originalSlash = type(SlashCmdList) == "table" and SlashCmdList.OLYMPUSVERIFY or nil
-- Nothing to preview without the API, and nothing to route "/olv preview" through without the handler. A second copy
-- of this file (a duplicated TOC line) would wrap the first wrapper and keep its own originals, which are stand-ins
-- whenever the first copy is on: refuse it.
if type(API) ~= "table" or type(originalSlash) ~= "function" or OlympusVerifyPreview ~= nil then return end

-- Chat colours from the palette agreed for the panel and the launcher. The prefix is amber, not the addon's gold,
-- because nothing printed under it is about the real guild.
local PREFIX = "|cffe8be65Olympus preview|r: "
local GOLD, MUTED, BLUE, RED = "|cffc9a86c", "|cff9ea3ad", "|cff83b8d8", "|cffe57572"

-- The real addon keeps a removal armed for 6 s and the NEW marker lit for 120 s. Both would lapse before anyone could
-- frame a screenshot, so the samples hold them for ten minutes; naming the state again restarts the clock.
local HOLD = 600

local saved       -- the originals, captured once when preview starts; nil whenever it is off (this IS the switch)
local F           -- the current sample, rebuilt from scratch on every state change; nil whenever preview is off
local warned = {} -- stand-ins with no sample version announce themselves once per preview, not once per refresh

local function Say(msg)
  if DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.AddMessage then DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. msg) end
end
local function Gold(s) return GOLD .. tostring(s) .. "|r" end
local function Cmd(s) return BLUE .. s .. "|r" end

-- Every change to the sample is followed by a redraw. A panel that fails to draw a sample is reported rather than
-- raised: the stand-ins stay in place either way, which is the part that matters.
local function Refresh()
  local UI = OlympusVerifyUI
  if type(UI) ~= "table" or type(UI.Refresh) ~= "function" then return end
  local ok, err = pcall(UI.Refresh)
  if not ok then Say(RED .. "the panel failed to draw: " .. tostring(err) .. "|r") end
end

-- ---------------------------------------------------------------- invented names and places
-- Two-word names like the ones this realm allows, stitched from syllables nobody is called. Name(i) is unique for i
-- below 650 (26 x 25, walked with a stride coprime to 25), so each sample draws from its own range: the queue from 1,
-- removal candidates from 300, the unverified list from 400.
local FIRST = { "Aelwyn", "Brannoc", "Corvina", "Dellith", "Elowen", "Faelar", "Gorrim", "Halvessa", "Isoric", "Jorunna",
  "Kestrin", "Lunaveil", "Morwick", "Nyssaly", "Orrinel", "Pellamy", "Quilleth", "Rowanor", "Sylvaris", "Thessane",
  "Ulvrin", "Vesperine", "Wrenhold", "Xandrel", "Yselda", "Zephyrin" }
local LAST = { "Ashvale", "Briarwind", "Cindermoor", "Duskfeather", "Emberlock", "Frostmantle", "Glimmerbrook",
  "Hollowbough", "Ironquill", "Juniperfall", "Kettleburn", "Lanternmoss", "Mistralyn", "Nettlecombe", "Oakenshade",
  "Pebblethorn", "Quartzhollow", "Ravenmere", "Starlingate", "Thistlewood", "Umberfield", "Vinecrest", "Willowmere",
  "Yarrowdale", "Zinnbright" }
local function Name(i) return FIRST[(i - 1) % #FIRST + 1] .. " " .. LAST[((i - 1) * 7) % #LAST + 1] end

-- What a /who line says about someone: race and class, then zone. Alliance only, as the guild is.
local WHO = {
  { "Human Paladin", "Elwynn Forest" }, { "Night Elf Druid", "Teldrassil" }, { "Dwarf Hunter", "Dun Morogh" },
  { "Gnome Mage", "Ironforge" }, { "Human Warlock", "Westfall" }, { "Night Elf Rogue", "Darkshore" },
  { "Dwarf Priest", "Loch Modan" }, { "Human Warrior", "Redridge Mountains" }, { "Gnome Rogue", "Stormwind City" },
  { "Night Elf Hunter", "Stranglethorn Vale" }, { "Human Mage", "Hillsbrad Foothills" }, { "Dwarf Paladin", "Wetlands" },
}
local LEVELS = { 1, 7, 14, 23, 38, 5, 11, 2, 19, 31, 9, 3 }
local CLASSES = { "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "MAGE", "WARLOCK", "DRUID" }
local GUILDS = { "Lanterns of Dawn", "The Copper Kettle", "Order of the Gilded Stag", "Moonpetal Wardens" }
local CODES = { "K7QX2M", "R4TN8C", "H2WV6P", "M9ZD3F", "B5LJ7Q", "T3YC9N" }
-- The same wording Unverified.Candidates uses when the watcher has not delivered a list yet.
local NO_LIST = "no list yet — deploy Worker .34, restart the watcher, then /reload"

-- ---------------------------------------------------------------- building a sample
-- Everything is relative to the moment the state was entered, so "2m ago" reads "2m ago" whenever it is taken.
local function NewFixture(state, now, real)
  local cap = tonumber(real.guildCap) or 1000
  return {
    state = state, now = now, cap = cap, real = real,
    queue = {}, sample = {}, presence = {}, events = {}, filtering = true,
    secret = true, chatLogging = true, flushLog = real.flushLog ~= false, notes = false,
    -- relative to the real cap, so "not full" stays not full on a client configured with a different one
    rosterTotal = math.max(0, cap - 53), rosterAt = now - 190,
    queueFileAt = now - 260, queueFileEntries = 0,
    alertUntil = 0, guildFullAt = 0,
    kickForbidden = false, macroForbidden = false, removeVia = "macro",
    armed = nil, kickMacroTarget = nil,
    cands = {}, eligible = 0, unv = nil, removalView = nil,
    nextId = 4100, nextName = 1,
  }
end

-- One queue entry, shaped like OlympusVerify.lua's own (see InitDB and MergeQueueFile). Timestamps are given as ages.
local function Add(f, status, o)
  local name = o.name
  if not name then name = Name(f.nextName); f.nextName = f.nextName + 1 end
  local e = { name = name, target = name, status = status, source = o.source or "worker", ts = f.now - (o.age or 3600) }
  if e.source == "worker" then f.nextId = f.nextId + 1; e.id = f.nextId end
  e.position, e.lastReason, e.attempts = o.position, o.lastReason, o.attempts
  if o.invited then e.invitedAt = f.now - o.invited end
  if o.joined then e.joinedAt = f.now - o.joined end
  if o.failed then e.failedAt = f.now - o.failed end
  if o.readyAt then e.readyAt = f.now - o.readyAt end
  f.queue[#f.queue + 1] = e
  f.sample[e] = true
  return e
end

-- What the last /who said about an entry, in Presence.Of's terms. "unchecked" is simply the absence of a record.
local function Seen(f, e, st, i, age)
  local w, lvl = WHO[(i - 1) % #WHO + 1], LEVELS[(i - 1) % #LEVELS + 1]
  local rec
  if st == "ready" then rec = { state = "free", at = f.now - age, level = lvl, what = w[1], zone = w[2] }
  elseif st == "offline" then rec = { state = "offline", at = f.now - age }
  elseif st == "guilded" then
    rec = { state = "guilded", at = f.now - age, guild = GUILDS[(i - 1) % #GUILDS + 1], level = lvl, what = w[1], zone = w[2] }
  end
  f.presence[e] = { st = st, rec = rec }
end

local function Ev(f, age, e) e.ts = f.now - age; f.events[#f.events + 1] = e; return e end

-- The removal shortlist a full guild shows, with each entry's own threshold as RequiredDaysOffline would give it
-- under the default tiers, ranked the way RemovalCandidates ranks: furthest past the threshold first.
local function Need(level)
  if level <= 1 then return 1 elseif level <= 9 then return 7 elseif level <= 19 then return 14 elseif level <= 29 then return 21 end
  return 30
end
local function FillCandidates(f)
  local spec = {
    { level = 1, days = 6.3, rank = "Initiate", rankIndex = 4 },
    { level = 1, days = 4.2, rank = "Initiate", rankIndex = 4 },
    { level = 4, days = 11.6, rank = "Initiate", rankIndex = 4 },
    { level = 13, days = 17.4, rank = "Member", rankIndex = 3, note = "alt of " .. Name(340) },
    { level = 27, days = 24.1, rank = "Member", rankIndex = 3 },
  }
  for i, s in ipairs(spec) do
    local name = Name(300 + i)
    f.cands[i] = { name = name, full = name, rank = s.rank, rankIndex = s.rankIndex, level = s.level,
                   class = CLASSES[(i - 1) % #CLASSES + 1], days = s.days, need = Need(s.level), note = s.note or "", index = 100 + i * 37 }
  end
  table.sort(f.cands, function(a, b)
    local ea, eb = a.days - a.need, b.days - b.need
    if ea ~= eb then return ea > eb end
    if a.level ~= b.level then return a.level < b.level end
    return a.name < b.name
  end)
  f.eligible = 23  -- more are eligible than the panel shows; the header says so
end

-- The unverified list: five ranks, one of them protected (officers are never offered) and one switched off in the
-- sample's rank filter, and members held back for each of the reasons Unverified.Candidates gives.
local function FillUnverified(f)
  local list, k = {}, 400
  local function add(rank, rankIndex, n, why, level0, days0)
    for i = 1, n do
      k = k + 1
      local days = (why == "online now") and 0 or (days0 + i * 1.7)
      list[#list + 1] = { name = Name(k), rank = rank, rankIndex = rankIndex, level = level0 + (i - 1) * 2,
                          class = CLASSES[k % #CLASSES + 1], days = days, here = 4 + days0 + i * 0.9, why = why }
    end
  end
  add("Recruit", 5, 3, nil, 1, 1.2)
  add("Initiate", 4, 9, nil, 1, 0.8)
  add("Member", 3, 4, nil, 8, 3)
  add("Veteran", 2, 2, nil, 22, 5)
  add("Recruit", 5, 2, "grace period", 1, 0.2)
  add("Initiate", 4, 3, "online now", 3, 0)
  add("Initiate", 4, 2, "grace period", 2, 0.5)
  add("Initiate", 4, 1, "verifying now", 1, 0.3)
  add("Member", 3, 2, "hold note", 17, 12)
  add("Member", 3, 1, "online now", 12, 0)
  add("Veteran", 2, 2, "grace period", 30, 1)
  add("Officer", 1, 3, "protected rank", 60, 2)
  f.unv = { members = list, excluded = { Veteran = true }, gone = 4, nextEligible = f.now + 31 * 3600 + 1200,
            graceDays = 3, listAt = f.now - 3 * 3600 }
end

-- Unverified.Candidates over the sample, minus the live roster lookups: same info table, same exclusion bookkeeping
-- (a held member counts by reason only while its rank is shown), same order. Takes the sample explicitly so a state
-- can be built from it before it becomes the current one.
local function UnverifiedFor(f, limit)
  local info = { total = 0, inGuild = 0, gone = 0, offered = 0, held = {}, byRank = {}, nextEligible = nil }
  local U = f.unv
  if not U or U.err then return {}, info, (U and U.err) or NO_LIST end
  info.noFirstSeen, info.graceDays, info.listAt = false, U.graceDays, U.listAt
  info.nextEligible, info.gone = U.nextEligible, U.gone
  info.inGuild, info.total = #U.members, #U.members + U.gone
  local out = {}
  for _, m in ipairs(U.members) do
    local br = info.byRank[m.rank]
    if not br then
      br = { rank = m.rank, rankIndex = m.rankIndex, offered = 0, held = 0, protected = m.rankIndex <= 1 }
      info.byRank[m.rank] = br
    end
    local shown = not U.excluded[m.rank]
    if m.why then
      br.held = br.held + 1
      if shown then info.held[m.why] = (info.held[m.why] or 0) + 1 end
    else
      br.offered = br.offered + 1
      if shown then
        out[#out + 1] = { name = m.name, full = m.name, rank = m.rank, rankIndex = m.rankIndex, level = m.level,
                          class = m.class, days = m.days, here = m.here, reason = "unverified" }
      end
    end
  end
  table.sort(out, function(a, b)
    if a.rankIndex ~= b.rankIndex then return a.rankIndex > b.rankIndex end
    if a.days ~= b.days then return a.days > b.days end
    if a.level ~= b.level then return a.level < b.level end
    return a.name < b.name
  end)
  info.offered = #out
  local capped = {}
  for i = 1, math.min(#out, tonumber(limit) or #out) do capped[i] = out[i] end
  return capped, info
end

-- The ordinary day: 22 waiting from Discord in the Worker's order, four of them confirmed online and guildless, plus a
-- code whispered two minutes ago; two invites out and one join. Several other states start from this.
local QUEUE_PLAN = { "unchecked", "offline", "ready", "unchecked", "guilded", "unchecked", "ready", "offline", "unchecked",
  "unchecked", "ready", "guilded", "offline", "unchecked", "unchecked", "ready", "offline", "unchecked", "guilded",
  "unchecked", "offline", "unchecked" }
local function FillQueue(f)
  local by = { ready = {}, offline = {}, guilded = {}, unchecked = {} }
  for i, st in ipairs(QUEUE_PLAN) do
    local e = Add(f, "queued", { position = i, age = 26 * 3600 - i * 2700,
                                 lastReason = (st == "guilded") and "in_another_guild" or nil, attempts = (i == 11) and 1 or nil })
    if st ~= "unchecked" then
      Seen(f, e, st, i, (st == "ready" and 40 + i * 20) or (st == "offline" and 200 + i * 30) or (1500 + i * 20))
    end
    table.insert(by[st], e)
  end
  local w = Add(f, "queued", { source = "whisper", age = 150 })  -- no Worker id or place in line yet
  Seen(f, w, "ready", 9, 120)
  table.insert(by.ready, w)
  local inv1 = Add(f, "invited", { age = 30000, invited = 95, attempts = 1 })
  local inv2 = Add(f, "invited", { age = 41000, invited = 470, attempts = 1 })
  inv2.reply = "You have invited " .. inv2.name .. " to join your guild."
  local j = Add(f, "joined", { source = "mail", age = 52000, invited = 1760, joined = 1500, attempts = 1 })
  f.queueFileEntries = #QUEUE_PLAN + 2
  local off, g = by.offline[1], by.guilded[1]
  Ev(f, 5200, { type = "invite", name = off.name, ok = false, detail = '"' .. off.name .. '" not found.' })
  Ev(f, 3900, { type = "mail", name = j.name, target = j.name, code = CODES[2], ok = true, inGuild = false })
  Ev(f, 2100, { type = "whisper", name = Name(90), target = Name(90), code = "ZX91QA", ok = false })
  Ev(f, 1760, { type = "invite", name = j.name, ok = true })
  Ev(f, 1500, { type = "joined", name = j.name, ok = true })
  Ev(f, 1480, { type = "notice", name = g.name, ok = true, detail = "in_another_guild" })
  Ev(f, 470, { type = "invite", name = inv2.name, ok = true })
  Ev(f, 150, { type = "whisper", name = w.name, target = w.name, code = CODES[1], ok = true, inGuild = false })
  Ev(f, 95, { type = "invite", name = inv1.name, ok = true })
  return by
end

-- The guild at its cap: the ordinary queue, the server's refusal, and the shortlist it produced.
local function FillFull(f)
  local by = FillQueue(f)
  f.rosterTotal = f.cap
  f.guildFullAt = f.now - 420
  local slim = {}
  for i, c in ipairs(f.cands) do slim[i] = { name = c.name, level = c.level, rank = c.rank, days = math.floor(c.days) } end
  Ev(f, 2600, { type = "removed", name = Name(330), ok = true, reason = "space", detail = "freed a seat" })
  Ev(f, 421, { type = "invite", name = by.ready[1].name, ok = false, detail = "Guild is full." })
  Ev(f, 420, { type = "guild_full", ok = false, detail = string.format("%d eligible for removal", f.eligible), candidates = slim })
  return by
end

local BUILD = {}
function BUILD.empty(f)
  -- The situation Codex read back in game: 117 waiting and not one of them confirmed online and guildless, so the
  -- filtered list is empty and the panel has to explain why rather than look broken.
  for i = 1, 117 do
    local st = (i % 10 == 3) and "guilded" or ((i % 4 == 1) and "offline" or "unchecked")
    local e = Add(f, "queued", { position = i, age = 3 * 86400 - i * 1500, lastReason = (st == "guilded") and "in_another_guild" or nil })
    if st ~= "unchecked" then Seen(f, e, st, i, (st == "offline") and (180 + (i % 7) * 60) or (1200 + i * 5)) end
  end
  -- invited 40 minutes ago: outside the 15-minute window the filtered list keeps, so it stays empty
  local old = Add(f, "invited", { age = 90000, invited = 2400, attempts = 2 })
  local j = Add(f, "joined", { age = 120000, invited = 7300, joined = 7100, attempts = 1 })
  f.queueFileEntries = 118
  f.rosterTotal = math.max(0, f.cap - 32)
  Ev(f, 7300, { type = "invite", name = j.name, ok = true })
  Ev(f, 7100, { type = "joined", name = j.name, ok = true })
  Ev(f, 2400, { type = "invite", name = old.name, ok = true })
  Ev(f, 1300, { type = "notice", name = Name(3), ok = true, detail = "in_another_guild" })
  Ev(f, 600, { type = "whisper", name = Name(95), target = Name(95), code = "QQ7Z0X", ok = false })
end

BUILD.queue = FillQueue

function BUILD.busy(f)
  -- Everything at once, and more rows than fit: presence checks off (as on a client that refuses /who), so every
  -- entry is listed whatever its state -- the only way to see a failed row and the left-their-guild wording together.
  f.filtering = false
  local gquit = Add(f, "queued", { name = "Seraphinelle Duskwhisperer", position = 1, lastReason = "ready_after_gquit", readyAt = 50, age = 81000 })
  local wlong = Add(f, "queued", { name = "Bartholomew Thistlewhistle", source = "whisper", age = 45 })
  local retry = Add(f, "queued", { position = 2, attempts = 2, age = 76000 })
  local mail = Add(f, "queued", { source = "mail", age = 2900 })
  for p = 3, 7 do Add(f, "queued", { position = p, age = 70000 - p * 3000 }) end
  local inv1 = Add(f, "invited", { age = 64000, invited = 30, attempts = 1 })
  local inv2 = Add(f, "invited", { age = 60000, invited = 210, attempts = 1 })
  inv2.reply = "You have invited " .. inv2.name .. " to join your guild."
  local inv3 = Add(f, "invited", { age = 58000, invited = 720, attempts = 3 })
  local failLong = Add(f, "failed", { name = "Maximiliana Moonwhisperer", age = 90000, invited = 405, failed = 400, attempts = 1, lastReason = "in_another_guild" })
  failLong.reply = failLong.name .. " is already in a guild."
  local failDecl = Add(f, "failed", { age = 95000, invited = 5010, failed = 5000, attempts = 1 })
  failDecl.reply = failDecl.name .. " declines your guild invitation."
  local j1 = Add(f, "joined", { age = 99000, invited = 2000, joined = 1900, attempts = 1 })
  local j2 = Add(f, "joined", { age = 99500, invited = 3100, joined = 2950, attempts = 2 })
  f.alertUntil = f.now + HOLD
  f.rosterTotal = math.max(0, f.cap - 4)
  f.queueFileEntries = 14
  -- A busy evening's feed, newest last as in the real ring.
  local feed = {
    { 9800, { type = "whisper", name = retry.name, target = retry.name, code = CODES[3], ok = true, inGuild = false } },
    { 9100, { type = "invite", name = retry.name, ok = false, detail = '"' .. retry.name .. '" not found.' } },
    { 8400, { type = "whisper", name = Name(96), target = Name(96), code = "ZZ0ZZ0", ok = false } },
    { 7700, { type = "mail", name = Name(97), target = Name(97), code = CODES[4], ok = true, inGuild = true } },
    { 7000, { type = "removed", name = Name(331), ok = true, reason = "unverified", detail = "not verified, by " .. Name(98) } },
    { 6300, { type = "invite", name = failDecl.name, ok = true } },
    { 5000, { type = "invite", name = failDecl.name, ok = false, detail = failDecl.reply } },
    { 4900, { type = "notice", name = failDecl.name, ok = true, detail = "declined" } },
    { 4200, { type = "note", name = j2.name, ok = false, detail = "forbidden for addons on this client" } },
    { 3100, { type = "invite", name = j2.name, ok = true } },
    { 2950, { type = "joined", name = j2.name, ok = true } },
    { 2900, { type = "mail", name = mail.name, target = mail.name, code = CODES[5], ok = true, inGuild = false } },
    { 2000, { type = "invite", name = j1.name, ok = true } },
    { 1900, { type = "joined", name = j1.name, ok = true } },
    { 1300, { type = "notice", name = gquit.name, ok = true, detail = "in_another_guild" } },
    { 720, { type = "invite", name = inv3.name, ok = true } },
    { 405, { type = "invite", name = failLong.name, ok = true } },
    { 400, { type = "invite", name = failLong.name, ok = false, detail = failLong.reply } },
    { 399, { type = "notice", name = failLong.name, ok = true, detail = "in_another_guild" } },
    { 330, { type = "whisper", name = Name(99), target = Name(99), code = CODES[6], ok = true, inGuild = true } },
    { 210, { type = "invite", name = inv2.name, ok = true } },
    { 120, { type = "whisper", name = gquit.name, target = gquit.name, code = CODES[1], ok = true, inGuild = false } },
    { 45, { type = "whisper", name = wlong.name, target = wlong.name, code = CODES[2], ok = true, inGuild = false } },
    { 30, { type = "invite", name = inv1.name, ok = true } },
  }
  for _, x in ipairs(feed) do Ev(f, x[1], x[2]) end
end

function BUILD.full(f)
  FillFull(f)
  -- A client that lets addons remove members, with the second candidate armed: "Remove" and "Confirm?" side by side.
  f.removeVia = "api"
  f.armed = { name = f.cands[2].name, until_ = f.now + HOLD }
end

function BUILD.unverified(f)
  FillQueue(f)
  f.removalView = "unverified"
  local top = UnverifiedFor(f, 1)
  f.kickMacroTarget = top[1] and top[1].name or nil  -- the first row reads "Aimed", the rest "Macro"
end

function BUILD.macro(f)
  FillFull(f)
  f.kickForbidden = true                  -- Uninvite refused, so the buttons aim the OlvKick macro instead
  f.kickMacroTarget = f.cands[1].name
end

function BUILD.blocked(f)
  FillFull(f)
  f.kickForbidden, f.macroForbidden = true, true  -- neither route works: the panel can only name who to remove
end

function BUILD.problems(f)
  -- Every warning the status area can raise at once: a lost Config.lua, chat logging off, a watcher that never wrote
  -- the queue file, nothing to relay, and a roster export from last week. The queue holds what an earlier session
  -- left behind.
  f.secret, f.chatLogging, f.notes = false, false, false
  f.queueFileAt, f.queueFileEntries = 0, 0
  f.rosterTotal = math.max(0, f.cap - 97)
  f.rosterAt = f.now - 9 * 86400 - 4200
  for i = 1, 3 do Add(f, "queued", { source = "whisper", age = (2 + i) * 86400 + i * 700 }) end
  f.unv = { err = NO_LIST }
end

-- In the order "/olv preview list" prints them.
local STATES = {
  { name = "empty", text = "117 waiting, none confirmed online and guildless: the list is empty and says why" },
  { name = "queue", text = "five ready to invite, two just invited (the default)" },
  { name = "busy", text = "16 rows that scroll, long names and server replies, NEW marker, a long feed" },
  { name = "full", text = "guild at the cap, five removal candidates, one armed (Confirm?)" },
  { name = "unverified", text = "the unverified list with its rank filter, one row aimed" },
  { name = "macro", text = "guild full on a client that refuses addon removals: Macro / Aimed" },
  { name = "blocked", text = "guild full, removals and macros both refused" },
  { name = "problems", text = "no secret, chat log off, no queue file, no events, week-old roster" },
}

local function Build(state, now, real)
  local f = NewFixture(state, now, real)
  FillCandidates(f)
  FillUnverified(f)
  BUILD[state](f)
  -- The ring is oldest first; the panel reads from the end. Ages above are distinct, so this order is total.
  table.sort(f.events, function(a, b) return a.ts < b.ts end)
  return f
end

-- A retained stand-in called after "off" (nothing should hold one, but a stand-in must never be the thing that
-- errors) reads an empty sample and changes nothing that anyone can see.
local function Cur() return F or NewFixture("off", time(), (saved and saved.real) or {}) end

-- Queued sample entries in the order Flush serves them (Presence.Ordered): rows with no Worker id first, then by id.
local function Ordered(f)
  local list, seq = {}, {}
  for i, q in ipairs(f.queue) do if q.status == "queued" then list[#list + 1] = q; seq[q] = i end end
  table.sort(list, function(a, b)
    local ia, ib = a.id or -1, b.id or -1
    if ia ~= ib then return ia < ib end
    return seq[a] < seq[b]
  end)
  return list
end

local function AddEvent(f, e) e.ts = time(); f.events[#f.events + 1] = e end

-- ---------------------------------------------------------------- stand-ins
-- Same names, arguments and return shapes as the functions they replace (OlympusVerifyAPI in OlympusVerify.lua), so
-- the panel cannot tell the difference. The reads answer from the sample; the actions say what they would have done
-- and change only the sample, so the look of each state change can still be seen.
local Fake = {}

function Fake.Status()
  local f = Cur()
  local queued, oldest = 0, nil
  for _, q in ipairs(f.queue) do
    if q.status == "queued" then
      queued = queued + 1
      if not oldest or (q.ts or 0) < oldest then oldest = q.ts or 0 end
    end
  end
  local r = f.real
  return {
    secret = f.secret, chatLogging = f.chatLogging, flushLog = f.flushLog, notes = f.notes,
    queued = queued, queue = f.queue, events = f.events,
    rosterCount = f.rosterTotal, rosterAt = f.rosterAt,
    queueFileAt = f.queueFileAt, queueFileEntries = f.queueFileEntries,
    alertUntil = f.alertUntil, oldestQueuedAt = oldest or 0,
    mergeSeconds = tonumber(r.mergeSeconds) or 45,
    guildFullAt = f.guildFullAt, kickForbidden = f.kickForbidden,
    armedRemoval = f.armed and f.armed.name or nil, armedUntil = f.armed and f.armed.until_ or 0,
    offlineRule = r.offlineRule or "L1 1d \194\183 <10 7d \194\183 <20 14d \194\183 <30 21d \194\183 any 30d",
    kickMacroName = r.kickMacroName or "OlvKick", kickMacroTarget = f.kickMacroTarget,
    macroForbidden = f.macroForbidden, removeVia = f.removeVia,
    kickCommand = r.kickCommand or "/guildremove",
    rosterTotal = f.rosterTotal, guildCap = f.cap,
    version = r.version or "?",
  }
end

-- Presence.Of: with checks off every queued entry counts as ready, exactly as the real one reports it.
function Fake.PresenceOf(q)
  if not q then return "unchecked" end
  local f = Cur()
  if not f.filtering then return "ready" end
  local p = f.presence[q]
  if not p then return "unchecked" end
  return p.st, p.rec
end

function Fake.PresenceCounts()
  local f = Cur()
  local c = { ready = 0, checking = 0, offline = 0, guilded = 0, member = 0, unchecked = 0, total = 0 }
  for _, q in ipairs(f.queue) do
    if q.status == "queued" then
      local st = Fake.PresenceOf(q)
      c[st] = (c[st] or 0) + 1
      c.total = c.total + 1
    end
  end
  c.filtering = f.filtering
  return c
end

function Fake.Candidates(limit)
  local f = Cur()
  local out = {}
  for i = 1, math.min(#f.cands, tonumber(limit) or 8) do out[i] = f.cands[i] end
  return out, math.max(f.eligible, #f.cands)
end

function Fake.UnverifiedList(limit) return UnverifiedFor(Cur(), limit) end

-- Unverified.Ranks, unchanged: it only sorts what it is given.
function Fake.UnverifiedRanks(info)
  local list = {}
  for _, br in pairs(info and info.byRank or {}) do list[#list + 1] = br end
  table.sort(list, function(a, b)
    if (a.rankIndex or 99) ~= (b.rankIndex or 99) then return (a.rankIndex or 99) > (b.rankIndex or 99) end
    return tostring(a.rank) < tostring(b.rank)
  end)
  return list
end

-- The sample's own filter. The real one lives in OlympusVerifyDB and is exactly what must not be touched.
function Fake.UnverifiedExcluded()
  local f = Cur()
  return (f.unv and f.unv.excluded) or {}
end

function Fake.When(ts)
  ts = tonumber(ts)
  if not ts then return "?" end
  return date("%a %d %b %H:%M", ts)
end

-- A /who that was not sent: the next unchecked applicant simply comes back "online, no guild".
local function SampleCheck(f, why)
  if not f.filtering then Say("would check nobody: presence checks are off in this sample. No /who was sent.") return false end
  local q
  for _, e in ipairs(Ordered(f)) do if Fake.PresenceOf(e) == "unchecked" then q = e break end end
  if not q then Say("would check nobody: every sample applicant already has an answer. No /who was sent.") return false end
  local n = 0
  for _ in pairs(f.presence) do n = n + 1 end
  Seen(f, q, "ready", n + 1, 0)
  f.presence[q].rec.at = time()
  Say(string.format("would send one /who for %s%s. None was sent; the sample answer is \"online, no guild\".", Gold(q.name), why or ""))
  return true
end

local function SampleInvite(f, q)
  q.status, q.invitedAt, q.attempts = "invited", time(), (q.attempts or 0) + 1
  q.reply, q.failedAt = nil, nil
  AddEvent(f, { type = "invite", name = q.name, ok = true })
  Say(string.format("would invite %s. No invite was sent; the sample row now reads invited.", Gold(q.name)))
end

-- OlympusVerify_Flush, and API.Flush: the same function in the real addon, and the same stand-in here. The launcher
-- button, the flush key binding, "Send next invite" and each row's Invite button all end up in here.
function Fake.Flush(entry, opts)
  local f = Cur()
  if type(entry) == "table" then
    if f.sample[entry] and (entry.status == "queued" or entry.status == "failed") then SampleInvite(f, entry)
    else Say(string.format("would invite %s. Nothing was sent.", Gold(entry.name or "?"))) end
  elseif not f.filtering then
    local q
    for _, e in ipairs(f.queue) do if e.status == "queued" then q = e break end end
    if q then SampleInvite(f, q) else Say("nothing to send in this sample.") end
  else
    -- the real press: the first confirmed applicant, unless the guild is full (then the press checks instead)
    local atCap = f.rosterTotal >= f.cap and not (type(opts) == "table" and opts.force)
    local ready
    for _, e in ipairs(Ordered(f)) do if Fake.PresenceOf(e) == "ready" then ready = e break end end
    if ready and not atCap then SampleInvite(f, ready)
    else SampleCheck(f, (ready and atCap) and " (the guild is full, so the press looks further down the line)" or nil) end
  end
  Refresh()
end

function Fake.Check()
  local ok = SampleCheck(Cur())
  Refresh()
  return ok
end

function Fake.Remove(entry)
  local f = Cur()
  for i, q in ipairs(f.queue) do
    if q == entry then
      table.remove(f.queue, i)
      f.sample[q], f.presence[q] = nil, nil
      Say(string.format("would drop %s from this client's queue. Only the sample row went.", Gold(q.name)))
      Refresh()
      return
    end
  end
  Say("would drop that entry from the queue. Nothing was dropped.")
end

function Fake.ClearQueue()
  local f = Cur()
  local n = #f.queue
  f.queue, f.sample, f.presence = {}, {}, {}
  Say(string.format("would clear all %d queue entries. The sample list is empty now; the real queue is untouched. %s brings the samples back.",
    n, Cmd("/olv preview " .. tostring(f.state))))
  Refresh()
end

function Fake.ExportRoster()
  local f = Cur()
  f.rosterAt = time()
  Say(string.format("would export the roster (%d members) to SavedVariables. Nothing was written.", f.rosterTotal))
  Refresh()
  return f.rosterTotal
end

function Fake.Sync()
  Say("would export the roster and reload the UI. Nothing was exported and nothing reloaded.")
end

function Fake.FlushChatLog()
  Say("would close and reopen the chat log so the watcher sees buffered lines. Chat logging was not touched.")
  Refresh()
end

-- OlympusVerify_RemoveMember, and API.RemoveMember: first click arms, second confirms, as in the real one. The
-- confirmed removal takes the name off the sample lists and one seat off the sample roster, so a full guild can be
-- watched becoming not full.
function Fake.RemoveMember(name, reason)
  if type(name) ~= "string" or name == "" then return end
  local f = Cur()
  if f.kickForbidden then
    Say(string.format("would refuse: this sample client does not let addons remove members. Nobody was removed; %s was not touched.", Gold(name)))
    return false
  end
  local now = time()
  if not (f.armed and f.armed.name == name and now <= f.armed.until_) then
    f.armed = { name = name, until_ = now + HOLD }
    Say(string.format("would arm the removal of %s; click again to confirm. Nobody is removed in a preview.", Gold(name)))
    Refresh()
    return false
  end
  f.armed = nil
  for i, c in ipairs(f.cands) do if c.name == name then table.remove(f.cands, i); f.eligible = math.max(0, f.eligible - 1) break end end
  if f.unv and f.unv.members then
    for i, m in ipairs(f.unv.members) do if m.name == name then table.remove(f.unv.members, i); f.unv.gone = f.unv.gone + 1 break end end
  end
  f.rosterTotal = math.max(0, f.rosterTotal - 1)
  AddEvent(f, { type = "removed", name = name, ok = true, reason = reason or "space",
                detail = (reason == "unverified") and "not verified" or "freed a seat" })
  Say(string.format("would remove %s from the guild. Nobody was removed; the sample roster is one smaller.", Gold(name)))
  Refresh()
  return true
end

function Fake.PointKickMacro(name, reason)
  local f = Cur()
  local macro = f.real.kickMacroName or "OlvKick"
  if f.macroForbidden then
    Say(string.format("could not aim %s in this sample: the client refuses addon macro writes. No macro was touched.", macro))
    Refresh()
    return false
  end
  if type(name) ~= "string" or name == "" then return false end
  f.kickMacroTarget = name
  Say(string.format("would point the %s macro at %s. No macro was created or edited.", macro, Gold(name)))
  Refresh()
  return true
end

function Fake.ToggleUnverifiedRank(rank)
  if type(rank) ~= "string" or rank == "" then return end
  local f = Cur()
  if not (f.unv and f.unv.excluded) then return end
  local ex = f.unv.excluded
  if ex[rank] then ex[rank] = nil else ex[rank] = true end
  Say(string.format("rank %s is %s in the sample list. Your saved rank filter is unchanged.", Gold(rank), ex[rank] and "hidden" or "shown"))
end

-- The launcher and the key binding reach these by their global names.
local GLOBAL_FAKE = { OlympusVerify_Flush = Fake.Flush, OlympusVerify_RemoveMember = Fake.RemoveMember }

-- Anything added to the API later that this file has no sample for. Unknown means possibly an action, so it does
-- nothing at all; a read the panel needs will show up as a panel that fails to draw, which is the safe way round.
local function Unknown(label)
  return function()
    if not warned[label] then
      warned[label] = true
      Say(string.format("%s has no sample version, so it does nothing while preview is on.", label))
    end
  end
end
local function InertGlobal(label)
  return function() Say(string.format("would run %s. It is disabled while preview is on.", label)) end
end

-- ---------------------------------------------------------------- on / off
local function Capture(UI)
  local s = { api = {}, globals = {}, removalView = UI.removalView, showAll = UI.showAll, real = {} }
  for k, v in pairs(API) do if type(v) == "function" then s.api[k] = v end end
  -- By pattern rather than by list, so an action added to OlympusVerify.lua later is disconnected too. Collected
  -- first and assigned afterwards: assigning to a table while pairs() walks it is undefined.
  for k, v in pairs(_G) do
    if type(k) == "string" and type(v) == "function" and string.find(k, "^OlympusVerify_") then s.globals[k] = v end
  end
  -- The labels the real panel would show (version, cap, macro name, removal command), so the samples wear them.
  -- Status() only reads. Scalars are copied; its queue and events are the SavedVariables themselves and stay put.
  if s.api.Status then
    local ok, st = pcall(s.api.Status)
    if ok and type(st) == "table" then
      for _, k in ipairs({ "version", "guildCap", "kickMacroName", "kickCommand", "offlineRule", "mergeSeconds", "flushLog" }) do
        if type(st[k]) ~= "table" and type(st[k]) ~= "function" then s.real[k] = st[k] end
      end
    end
  end
  return s
end

local function Install()
  for k in pairs(saved.api) do API[k] = Fake[k] or Unknown("OlympusVerifyAPI." .. k) end
  for k in pairs(saved.globals) do _G[k] = GLOBAL_FAKE[k] or InertGlobal(k) end
end

local function Restore()
  for k, v in pairs(saved.api) do API[k] = v end
  for k, v in pairs(saved.globals) do _G[k] = v end
  local UI = OlympusVerifyUI
  if type(UI) == "table" then UI.removalView, UI.showAll = saved.removalView, saved.showAll end
end

local function Enter(state)
  local UI = OlympusVerifyUI
  if type(UI) ~= "table" or type(UI.Show) ~= "function" then
    Say("the panel (OlympusVerifyUI.lua) is not loaded, so there is nothing to preview. Nothing was changed.")
    return false
  end
  -- The panel reads the table it found at load; swapping fields in a different one would leave the panel live.
  if OlympusVerifyAPI ~= API then
    Say("OlympusVerifyAPI was replaced after this file loaded. /reload before previewing. Nothing was changed.")
    return false
  end
  local first = not saved
  if first then
    saved = Capture(UI)
    warned = {}
    Install()
  end
  F = Build(state, time(), saved.real)
  UI.preview = state
  UI.removalView = F.removalView
  UI.showAll = false  -- each sample is built for the filtered view; "/olv preview all" lists everything
  local ok, err = pcall(UI.Show)
  if not ok then Say(RED .. "the panel failed to draw '" .. state .. "': " .. tostring(err) .. "|r") end
  if first then
    Say(string.format("on, showing the %s sample. Every row is invented, and the panel, the launcher, the flush key and /olv actions are all disconnected until %s.",
      Gold(state), Cmd("/olv preview off")))
  else
    Say(string.format("showing the %s sample (fresh). %s ends the preview.", Gold(state), Cmd("/olv preview off")))
  end
  return true
end

local function Exit()
  if not saved then Say("preview is not on; there is nothing to restore.") return false end
  Restore()
  saved, F = nil, nil
  local UI = OlympusVerifyUI
  if type(UI) == "table" then UI.preview = nil end
  Refresh()
  Say("off. The real functions are back and the panel shows the live queue again.")
  return true
end

local function List()
  Say("states, for " .. Cmd("/olv preview <state>") .. ":")
  for _, s in ipairs(STATES) do
    Say(string.format("  %s%s: %s", Gold(s.name), (F and F.state == s.name) and (MUTED .. " (showing)|r") or "", s.text))
  end
  Say("  " .. Cmd("/olv preview all") .. " lists every sample row; " .. Cmd("/olv preview off") .. " restores everything.")
end

local BY_NAME = {}
for _, s in ipairs(STATES) do BY_NAME[s.name] = true end

local function PreviewCommand(arg)
  if arg == "off" then return Exit() end
  if arg == "list" or arg == "help" or arg == "?" then return List() end
  if arg == "all" then
    local UI = OlympusVerifyUI
    if not saved or type(UI) ~= "table" then Say("preview is not on. " .. Cmd("/olv preview") .. " starts it.") return end
    UI.showAll = not UI.showAll  -- view only, and put back with everything else on "off"
    Say(UI.showAll and "listing every sample row." or "listing only the rows the filtered view keeps.")
    Refresh()
    return
  end
  if arg == "" then arg = "queue" end
  if not BY_NAME[arg] then
    Say(string.format("there is no state called '%s'. Nothing was changed.", arg))
    return List()
  end
  return Enter(arg)
end

-- ---------------------------------------------------------------- /olv
-- While preview is on, only these reach the original handler: the panel toggles, and help/status, which only print.
local ALLOWED = { [""] = true, show = true, hide = true, help = true, status = true }

local function Handler(msg, ...)
  local cmd = string.lower(string.match(msg or "", "^%s*(%S*)") or "")
  if cmd == "preview" then
    return PreviewCommand(string.lower(string.match(msg or "", "^%s*%S+%s*(.-)%s*$") or ""))
  end
  if not saved then return originalSlash(msg, ...) end  -- preview off: exactly what was typed, to exactly the original
  if ALLOWED[cmd] then
    originalSlash(msg, ...)
    if cmd == "help" or cmd == "status" then
      Say(string.format("on, showing the %s sample: the panel's rows are invented and its actions disconnected. %s switches, %s ends it.",
        Gold(F and F.state or "?"), Cmd("/olv preview list"), Cmd("/olv preview off")))
    end
    return
  end
  Say(string.format("'/olv %s' is disabled while preview is on — type %s first.", cmd, Cmd("/olv preview off")))
end
SlashCmdList.OLYMPUSVERIFY = Handler

-- For the panel and the tests. Nothing here reaches past the checks above.
OlympusVerifyPreview = {
  Enter = function(state)
    state = string.lower(tostring(state or "queue"))
    if not BY_NAME[state] then return false end
    return Enter(state)
  end,
  Exit = Exit,
  State = function() return F and F.state or nil end,
  States = function()
    local out = {}
    for i, s in ipairs(STATES) do out[i] = s.name end
    return out
  end,
}

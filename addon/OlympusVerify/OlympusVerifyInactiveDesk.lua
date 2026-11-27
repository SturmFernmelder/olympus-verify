-- One reviewed name per real hardware release. Blizzard owns the secure
-- OnClick; only a later complete native roster can confirm departure.
local ADDON = ...
local D = {}
OlympusVerifyInactiveDesk = D
local native = OlympusVerifyAPI.Inactive
local panel, listRows, ui, openParent
local scope, snapshot, selection, review
local rosterGeneration = 0
local cutoff, search, page, message, unavailable = 0, "", 1, nil, nil
local initiateWeek, classes = false, nil
local dirty, elapsed = false, 0
local metadata = C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata
local version = metadata and metadata(ADDON, "Version")
local clientRevision = type(version) == "string" and version ~= "" and (tostring(select(2, GetBuildInfo())) .. "|" .. version)
local routeRefused = false
local inClick
local sessionPending = {}

local function sameScope(a, b)
  return a and b and a.guild == b.guild and a.realm == b.realm and a.actor == b.actor
    and a.rank == b.rank and a.observer == b.observer
end

local function nativeScope()
  if type(InCombatLockdown) ~= "function" or InCombatLockdown() ~= false
    or IsInGuild() ~= true or (OlympusVerifyUI and OlympusVerifyUI.preview) then return nil end
  local can = C_GuildInfo and C_GuildInfo.CanGuildRemove or CanGuildRemove
  if type(can) ~= "function" or can() ~= true then return nil end
  local guild, realm, observer = native.Scope()
  local ownGuild, _, rank = GetGuildInfo("player")
  local actor = native.ReadText(UnitGUID("player"))
  if not guild or not realm or guild ~= native.ReadText(ownGuild) or type(rank) ~= "number"
    or rank < 0 or rank > 9 or rank ~= math.floor(rank)
    or not actor or not actor:match("^Player%-%d+%-%x+$") or (observer and actor ~= observer) then return nil end
  return {guild = guild, realm = realm, actor = actor, rank = rank, observer = observer}
end

local function safeName(name)
  return name and #name > 0 and #name <= 96 and not name:find("[%c|;/\\]")
    and not name:match("^%s") and not name:match("%s$")
end

local function canReadOfficerNotes(owner)
  local canView = C_GuildInfo and C_GuildInfo.CanViewOfficerNote or CanViewOfficerNote
  if type(canView) == "function" then return canView() == true end
  -- A legacy client may omit this getter. Only the corroborated sole guild
  -- master can stand in for it; an officer's masked empty note is ambiguous.
  return owner and owner.rank == 0
end

local function classKey(token)
  token = native.ReadText(token)
  return token and token:match("^[A-Z]+$") and token or nil
end

local function className(token)
  return token and ((LOCALIZED_CLASS_NAMES_MALE and LOCALIZED_CLASS_NAMES_MALE[token])
    or (token:sub(1, 1) .. token:sub(2):lower())) or "Unknown"
end

local function primeGuild(owner)
  return owner and owner.guild == "OLYMPUS PRIME" and owner.realm == "CAMWOW US2 Realm 3 PvE"
end

local function minimumDays(row)
  if initiateWeek then
    if row.weekEligible then return 7 end
    return math.huge
  end
  return math.max(cutoff, row.need)
end

local function readSnapshot()
  local owner = nativeScope()
  if not owner then return nil, "Current guild and native removal permission are required. Check again out of combat." end
  if not canReadOfficerNotes(owner) then
    return nil, "Access to officer notes is required to respect removal holds."
  end
  if not native.VisibilityCurrent() then return nil, "Waiting for WoW to load offline guild members." end
  local count = GetNumGuildMembers()
  if type(count) ~= "number" or count ~= math.floor(count) or count < 1 or count > 1000 then
    return nil, "Waiting for the full guild roster."
  end
  local ranks = owner.observer and OlympusVerifyNativeRanks.Observe()
  if owner.observer and not OlympusVerifyNativeRanks.Qualified(ranks) then
    return nil, "WoW must confirm the enrolled guild master's native rank table."
  end
  local data = {owner = owner, members = {}, names = {}, eligible = {}, rows = {}, classes = {}}
  local leaders = 0
  for i = 1, count do
    local name, title, slot, level, _, _, note, officerNote, online, _, token, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    name, title, guid = native.ReadText(name), native.ReadText(title), native.ReadText(guid)
    if not safeName(name) or not guid or not guid:match("^Player%-%d+%-%x+$")
      or data.members[guid] or data.names[name:lower()] or type(slot) ~= "number" or slot < 0 or slot > 9
      or slot ~= math.floor(slot) or not title or title == "" or (ranks and ranks.names[slot + 1] ~= title) then
      return nil, "Waiting for a complete roster with unique, readable characters and ranks."
    end
    data.members[guid], data.names[name:lower()] = slot, guid
    token = classKey(token)
    if token then data.classes[token] = true end
    if slot == 0 then leaders = leaders + 1 end
    if online == false and guid ~= owner.actor and slot > owner.rank and not native.ProtectedRank(slot)
      and type(level) == "number" and level >= 1 and level <= 255 and level == math.floor(level) then
      note, officerNote = native.ReadText(note), native.ReadText(officerNote)
      local days, need = native.DaysOffline(i, false), native.RequiredDays(level)
      local weekEligible = slot == 9 and title == "Initiate" and primeGuild(owner)
      if note and officerNote and not native.HeldNote(note) and not native.HeldNote(officerNote)
        and type(days) == "number" and days < math.huge and (days >= need or (weekEligible and days >= 7)) then
        local row = {guid = guid, name = name, rank = title, slot = slot, class = token, days = days, need = need,
          level = level, index = i, weekEligible = weekEligible}
        data.eligible[guid], data.rows[#data.rows + 1] = row, row
      end
    end
  end
  if leaders ~= 1 or data.members[owner.actor] ~= owner.rank or (owner.observer and owner.rank ~= 0)
    or GetNumGuildMembers() ~= count or not native.VisibilityCurrent() or not sameScope(owner, nativeScope())
    or not canReadOfficerNotes(owner)
    or (ranks and not OlympusVerifyNativeRanks.Same(ranks, OlympusVerifyNativeRanks.Observe())) then
    return nil, "The guild or roster changed while reading. Waiting for WoW to refresh."
  end
  table.sort(data.rows, function(a, b)
    if a.days ~= b.days then return a.days > b.days end
    return a.name < b.name
  end)
  return data
end

local function observe()
  local ok, data, reason = pcall(readSnapshot)
  if not ok then return nil, "The client could not read the complete native guild roster." end
  return data, reason
end

local function matches(row)
  return row.days >= minimumDays(row) and (not classes or classes[row.class])
    and (search == "" or row.name:lower():find(search, 1, true))
end

local function stillEligible(original, data)
  local row = data and data.eligible[original.guid]
  return row and row.name == original.name and row.slot == original.slot and row.rank == original.rank
    and row.level == original.level and row.class == original.class and matches(row)
end

local function disarm()
  if not ui or not ui.action or InCombatLockdown() ~= false then return end
  local b = ui.action
  b:SetAttribute("type", nil); b:SetAttribute("type1", nil)
  b:SetAttribute("macrotext", nil); b:SetAttribute("macrotext1", nil)
end

local function ledger()
  if type(OlympusVerifyDB) == "table" then return OlympusVerifyDB.inactiveRemovalAttempts end
end

local function blockedRoute()
  return routeRefused or clientRevision and type(OlympusVerifyDB) == "table" and OlympusVerifyDB.inactiveSecureRemovalBlocked == clientRevision
end

local function held(guid)
  local entries = ledger()
  return type(OlympusVerifyDB) ~= "table" or blockedRoute() or sessionPending[guid]~=nil
    or entries ~= nil and (type(entries) ~= "table" or entries[guid] ~= nil)
end

local function commandName(name)
  -- Names are native and can contain spaces and UTF-8. No macro conditions,
  -- command separators, modifiers or the empty argument (which targets a unit).
  return safeName(name) and not name:find("[^a-zA-Z0-9 '%-\128-\255]")
    and name:match("^[a-zA-Z\128-\255]") ~= nil
end

local function cancel(reason)
  disarm()
  selection, review, page, message = {}, nil, 1, reason
end

local function noteDeparture(raw)
  if not review or review.count==0 or not sameScope(scope,nativeScope()) then return end
  local name=native.DepartureName(raw)
  if not safeName(name) then return end
  name=name:lower()
  -- Some Blizzard messages omit the realm. Accept a short name only when it
  -- identifies a single GUID across the complete roster seen at dispatch.
  local candidate
  for guid,full in pairs(review.before) do
    if full==name or not name:find("-",1,true) and full:match("^[^-]+")==name then
      if candidate then return end
      candidate=guid
    end
  end
  local attempt=review.pending[candidate]
  if attempt then attempt.namedDeparture=true;dirty=true end
end

local function confirmDepartures(data)
  for guid,name in pairs(review.confirmed) do
    if data.members[guid] or data.names[name] then return false end
  end
  if not next(review.pending) then return true end
  for guid in pairs(review.before) do
    if not data.members[guid] and not review.pending[guid] and not review.confirmed[guid] then return false end
  end
  if type(OlympusVerifyDB)~="table" or getmetatable(OlympusVerifyDB) then return false end
  local entries,history=ledger(),OlympusVerifyDB.inactiveRemovalHistory
  if type(entries)~="table" or getmetatable(entries) or history~=nil and (type(history)~="table" or getmetatable(history)) then return false end
  local absent={}
  for guid,attempt in pairs(review.pending) do
    local record=attempt.record
    if entries[guid]~=record or record.state~="unknown" or record.guid~=guid or record.name~=attempt.name
      or record.actor~=scope.actor or record.realm~=scope.realm or record.guild~=scope.guild then return false end
    local named=data.names[attempt.name:lower()]
    if data.members[guid] then
      if named~=guid or attempt.sawAbsent then return false end
    elseif named then return false
    elseif rosterGeneration>attempt.generation then absent[#absent+1]=attempt end
  end
  -- Many missing rows in one update can also be a clipped roster. Require
  -- Blizzard's independently named system message for *each* such absence.
  for _,attempt in ipairs(absent) do
    attempt.sawAbsent=true
    if #absent>1 then attempt.needsNamed=true end
    if not attempt.needsNamed or attempt.namedDeparture then
      local record,guid=attempt.record,attempt.guid
      if not history then history={};OlympusVerifyDB.inactiveRemovalHistory=history end
      record.state,record.departedAt="departure-observed",time()
      table.insert(history,1,record)
      if #history>500 then table.remove(history) end
      entries[guid],review.pending[guid],sessionPending[guid]=nil,nil,nil
      review.confirmed[guid]=attempt.name:lower()
      review.count=review.count-1
    end
  end
  return true
end

local function refresh()
  local data, why = observe()
  unavailable = why
  if data and initiateWeek and not primeGuild(data.owner) then
    initiateWeek, cutoff = false, 0
  end
  if not data then
    cancel()
  elseif scope and not sameScope(scope, data.owner) then
    cancel("Guild or officer changed. Make a new selection.")
  elseif review then
    if not confirmDepartures(data) then
      cancel("Roster or receipt evidence changed unexpectedly. Review the current list before continuing.")
    elseif review.index > #review.targets and review.count == 0 then
      cancel("WoW confirmed all reviewed characters have left the guild.")
    end
    if review then
      for i = review.index, #review.targets do
        if not stillEligible(review.targets[i], data) then
          cancel(review.targets[i].name .. " changed or no longer qualifies. Review the current list.")
          break
        end
      end
    end
  else
    for id, row in pairs(selection) do
      if not stillEligible(row, data) or held(id) then selection[id] = nil end
    end
  end
  scope, snapshot = data and data.owner, data
end

local function filtered()
  if review then return review.targets end
  local rows = {}
  for _, row in ipairs(snapshot and snapshot.rows or {}) do
    if matches(row) then rows[#rows + 1] = row end
  end
  return rows
end

local function paint()
  local rows, selected = filtered(), 0
  for _ in pairs(selection) do selected = selected + 1 end
  local pages = math.max(1, math.ceil(#rows / #listRows))
  page = math.max(1, math.min(page, pages))
  local blocked = blockedRoute()
  local target = review and review.targets[review.index]
  local waiting = review and review.count > 0 and (not review.rapid or not target)
  ui.status:SetText(unavailable or (blocked and "WoW blocked the secure removal command. Removals are held on this client build.")
    or (waiting and ("Awaiting native departure receipts: " .. review.count .. "."))
    or (review and review.count>0 and target and ("Next: " .. target.name .. ". Awaiting receipts: " .. review.count .. "."))
    or message or (review and ("Next: " .. target.name .. ". Check the name, then click Remove once.")
    or string.format("%d eligible · %d selected", #rows, selected)))
  ui.pages:SetText(page .. " / " .. pages)
  ui.prev:SetEnabled(page > 1); ui.next:SetEnabled(page < pages)
  ui.search:SetShown(not review)
  ui.hint:SetShown(not review and search == "")
  for _, item in ipairs(ui.filters) do item:SetEnabled(not review and (initiateWeek or cutoff ~= item.days)) end
  ui.initiate:SetEnabled(not review and not initiateWeek and primeGuild(scope))
  ui.help:SetText(initiateWeek and "PRIME Initiates offline at least 7 days at any level. Protected ranks and hold notes are excluded."
    or "Eligible offline members by level policy. Protected ranks and hold notes are excluded.")
  local count, only = 0, nil
  for token in pairs(classes or {}) do count, only = count + 1, token end
  local caption = not classes and "All classes" or (count == 1 and className(only) or count .. " classes")
  ui.classes:SetText(caption .. " v")
  ui.classes:SetEnabled(not review and snapshot ~= nil)
  if review or not snapshot then ui.classMenu:Hide() end
  for _, choice in ipairs(ui.classOptions) do
    choice:SetChecked(choice.token and classes ~= nil and classes[choice.token] == true or not choice.token and not classes)
  end
  ui.select:SetShown(not review); ui.clear:SetShown(not review)
  ui.select:SetEnabled(not blocked and #rows > 0); ui.clear:SetEnabled(selected > 0)
  ui.cancel:SetShown(review ~= nil)
  if InCombatLockdown() == false then
    local caption = waiting and "Awaiting departure" or target and ("Remove " .. target.name) or "Review selected"
    ui.action:SetText(caption)
    ui.action:SetEnabled(not blocked and (target and not waiting and not held(target.guid) or not review and selected > 0))
  end
  for i, widget in ipairs(listRows) do
    local index = (page - 1) * #listRows + i
    local row = rows[index]
    widget.guid = row and row.guid
    widget:SetShown(row ~= nil)
    if row then
      widget.check:SetChecked(review ~= nil or selection[row.guid] ~= nil)
      widget.check:SetEnabled(not review and not held(row.guid) and commandName(row.name))
      widget.name:SetText(row.name)
      widget.rank:SetText(row.rank)
      widget.class:SetText(className(row.class))
      widget.days:SetText(string.format("%dd / %dd", math.floor(row.days), minimumDays(row)))
      local status = review and (review.confirmed[row.guid] and "Left guild" or review.pending[row.guid] and "Awaiting receipt" or index == review.index and "Current" or "Reviewed") or (held(row.guid) and "Held" or "")
      widget.mark:SetText(status)
    end
  end
end

local function beginReview(targets, rapid)
  review = {targets=targets,index=1,pending={},confirmed={},before={},count=0,rapid=rapid}
  page, message = 1, nil
end

local function freezeSelection()
  local targets = {}
  for _, row in ipairs(filtered()) do
    if selection[row.guid] and not held(row.guid) and commandName(row.name) then
      targets[#targets + 1] = {guid = row.guid, name = row.name, rank = row.rank, slot = row.slot,
        class = row.class, level = row.level, days = row.days, need = row.need, weekEligible = row.weekEligible}
    end
  end
  if #targets > 0 then beginReview(targets, false) end
end

local function popupOpen()
  for i=1,STATICPOPUP_NUMDIALOGS or 4 do
    local popup=_G["StaticPopup"..i]
    if popup and popup:IsShown() then return true end
  end
  return false
end

local function beforeClick(button, mouse, down)
  if InCombatLockdown() ~= false then return end
  disarm()
  if mouse ~= "LeftButton" or down == true or IsShiftKeyDown() ~= false or IsControlKeyDown() ~= false
    or IsAltKeyDown() ~= false or not button:IsVisible() or not button:IsEnabled() or inClick or popupOpen() then return end
  local original, index = review, review and review.index
  refresh()
  if not snapshot or review ~= original or review and review.index ~= index then paint(); return end
  if not review then freezeSelection(); paint(); return end
  local target = review.targets[index]
  if not target or (not review.rapid and review.count>0) or held(target.guid) or not commandName(target.name) or not stillEligible(target, snapshot) then paint(); return end
  if OlympusVerifyDB.inactiveRemovalAttempts == nil then OlympusVerifyDB.inactiveRemovalAttempts = {} end
  local record = {guid=target.guid, name=target.name, guild=scope.guild, realm=scope.realm, actor=scope.actor, requestedAt=time(), state="unknown"}
  -- Reserve persistently before handing this exact name to the template. A
  -- canceled dialog, lost reply, UI close or reload cannot admit a duplicate.
  OlympusVerifyDB.inactiveRemovalAttempts[target.guid] = record
  inClick = {guid=target.guid, name=target.name, record=record, generation=rosterGeneration}
  sessionPending[target.guid] = inClick
  review.pending[target.guid] = inClick
  for name,guid in pairs(snapshot.names) do review.before[guid] = name end
  review.count, review.index = review.count + 1, index + 1
  page = math.floor((math.min(review.index,#review.targets) - 1) / #listRows) + 1
  button:SetAttribute("macrotext1", "/guildremove " .. target.name)
  button:SetAttribute("type1", "macro")
end

local function afterClick()
  disarm()
  if not inClick then return end
  inClick = nil
  if InCombatLockdown() == false then
    paint()
    if review and review.count>0 then native.RequestRoster() end
  end
end

local function label(parent, font, x, y)
  local text = parent:CreateFontString(nil, "OVERLAY", font)
  text:SetPoint("TOPLEFT", x, y)
  text:SetJustifyH("LEFT")
  return text
end

local function button(parent, text, x, y, width, onClick)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetPoint("TOPLEFT", x, y); b:SetSize(width, 24); b:SetText(text)
  b:SetScript("OnClick", onClick)
  return b
end

local function toggleClassMenu()
  local menu = ui.classMenu
  if menu:IsShown() or review or not snapshot then menu:Hide(); return end
  local choices = {}
  for token in pairs(snapshot.classes) do choices[#choices + 1] = token end
  for token in pairs(classes or {}) do
    if not snapshot.classes[token] then choices[#choices + 1] = token end
  end
  table.sort(choices, function(a, b) return className(a) < className(b) end)
  local count = #choices + 1
  menu:SetSize(264, 12 + math.ceil(count / 2) * 26)
  for i = 1, math.max(count, #ui.classOptions) do
    local item = ui.classOptions[i]
    if not item then
      item = CreateFrame("CheckButton", nil, menu, "UICheckButtonTemplate")
      item:SetSize(23, 23); item:SetHitRectInsets(0, -100, 0, 0)
      item:SetPoint("TOPLEFT", 6 + (i - 1) % 2 * 129, -6 - math.floor((i - 1) / 2) * 26)
      item.caption = label(item, "GameFontHighlightSmall", 25, -5)
      item:SetScript("OnClick", function(self)
        if review or not menu:IsVisible() then return end
        if self.token then
          classes = classes or {}
          classes[self.token] = not classes[self.token] or nil
        else
          classes = nil
        end
        selection, page, message = {}, 1, nil
        paint()
      end)
      ui.classOptions[i] = item
    end
    item.token = choices[i - 1]
    item.caption:SetText(item.token and className(item.token) or "All classes")
    item:SetShown(i <= count)
  end
  menu:Show()
  paint()
end

local function build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints(parent)
  listRows, ui = {}, {filters = {}, classOptions = {}}
  local heading = label(panel, "GameFontNormalLarge", 22, -16)
  heading:SetText("Inactive members")
  ui.help = label(panel, "GameFontHighlightSmall", 22, -43)
  ui.search = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
  ui.search:SetSize(168, 24); ui.search:SetPoint("TOPLEFT", 26, -72); ui.search:SetAutoFocus(false)
  ui.hint = label(ui.search, "GameFontDisableSmall", 6, -5); ui.hint:SetText("Search character")
  ui.search:SetScript("OnTextChanged", function(self)
    local value = self:GetText() or ""
    if review then return end
    search, page, selection, message = value:lower(), 1, {}, nil; paint()
  end)
  ui.search:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  for i, days in ipairs({0, 7, 14, 30, 60, 90}) do
    local b = button(panel, days == 0 and "Policy" or days .. "d+", 210 + (i - 1) * 67, -72, 63, function()
      if review then return end
      initiateWeek, cutoff, page, selection, message = false, days, 1, {}, nil
      ui.classMenu:Hide(); paint()
    end)
    b.days = days; ui.filters[#ui.filters + 1] = b
  end
  ui.initiate = button(panel, "Initiates 7d+", 618, -72, 115, function()
    if review or not primeGuild(scope) then return end
    initiateWeek, page, selection, message = true, 1, {}, nil
    ui.classMenu:Hide(); paint()
  end)
  ui.classes = button(panel, "All classes v", 741, -72, 150, toggleClassMenu)
  ui.classMenu = CreateFrame("Frame", nil, panel)
  ui.classMenu:SetPoint("TOPRIGHT", ui.classes, "BOTTOMRIGHT", 0, -2)
  ui.classMenu:SetFrameStrata("TOOLTIP"); ui.classMenu:EnableMouse(true)
  local menuBackground = ui.classMenu:CreateTexture(nil, "BACKGROUND")
  menuBackground:SetAllPoints(); menuBackground:SetColorTexture(.06, .11, .13, 1)
  ui.classMenu:Hide()
  ui.status = label(panel, "GameFontHighlight", 22, -114)
  ui.status:SetWidth(math.max(480, (parent:GetWidth() or 1060) - 48))
  label(panel, "GameFontNormalSmall", 59, -153):SetText("CHARACTER")
  label(panel, "GameFontNormalSmall", 350, -153):SetText("CLASS")
  label(panel, "GameFontNormalSmall", 510, -153):SetText("RANK")
  label(panel, "GameFontNormalSmall", 685, -153):SetText("OFFLINE / MINIMUM")
  local pageHeight = parent:GetHeight() or 0
  local maxRows = math.max(4, math.min(20, math.floor(((pageHeight > 0 and pageHeight or 600) - 253) / 24)))
  for i = 1, maxRows do
    local r = CreateFrame("Button", nil, panel)
    local y = -174 - (i - 1) * 24
    r:SetPoint("TOPLEFT", 20, y); r:SetPoint("TOPRIGHT", -20, y); r:SetHeight(24)
    local bg = r:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints()
    bg:SetColorTexture(.12, .20, .22, i % 2 == 0 and .48 or .23)
    r:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight")
    r.check = CreateFrame("CheckButton", nil, r, "UICheckButtonTemplate")
    r.check:SetPoint("LEFT", 0, 0); r.check:SetSize(23, 23)
    r.name = label(r, "GameFontHighlight", 39, -4)
    r.class = label(r, "GameFontHighlight", 330, -4)
    r.rank = label(r, "GameFontHighlight", 490, -4)
    r.days = label(r, "GameFontHighlight", 665, -4)
    r.mark = label(r, "GameFontNormalSmall", 845, -4)
    local function toggle()
      local row = snapshot and r.guid and snapshot.eligible[r.guid]
      if review or not row or held(row.guid) or not commandName(row.name) then return end
      local id = r.guid
      selection[id] = not selection[id] and snapshot.eligible[id] or nil
      message = nil; paint()
    end
    r:SetScript("OnClick", toggle); r.check:SetScript("OnClick", toggle)
    listRows[#listRows + 1] = r
  end
  local controls = CreateFrame("Frame", nil, panel); controls:SetSize(770, 30); controls:SetPoint("BOTTOMLEFT", 20, 16)
  ui.select = button(controls, "Select all matches", 0, 0, 143, function()
    if not review then for _, row in ipairs(filtered()) do if not held(row.guid) and commandName(row.name) then selection[row.guid] = row end end; message = nil; paint() end
  end)
  ui.clear = button(controls, "Clear", 148, 0, 65, function() if not review then selection, message = {}, nil; paint() end end)
  ui.cancel = button(controls, "Cancel review", 0, 0, 143, function() cancel("Review cancelled."); paint() end)
  ui.action = CreateFrame("Button", nil, controls, "UIPanelButtonTemplate,SecureActionButtonTemplate")
  ui.action:SetPoint("TOPLEFT", 220, 0); ui.action:SetSize(243, 24)
  ui.action:RegisterForClicks("AnyUp"); ui.action:SetAttribute("useOnKeyDown", false)
  ui.action:SetScript("PreClick", beforeClick); ui.action:SetScript("PostClick", afterClick)
  ui.action:HookScript("OnHide", disarm)
  if OlympusLaunch229 and OlympusLaunch229.CloseInCombat then OlympusLaunch229.CloseInCombat(parent, function() parent:Hide() end) end
  ui.prev = button(controls, "Previous", 470, 0, 80, function() page = page - 1; paint() end)
  ui.pages = label(controls, "GameFontNormalSmall", 567, -6)
  ui.next = button(controls, "Next", 625, 0, 68, function() page = page + 1; paint() end)
  panel:EnableMouseWheel(true)
  panel:SetScript("OnMouseWheel", function(_, delta) page = page - delta; paint() end)
  panel:RegisterEvent("GUILD_ROSTER_UPDATE"); panel:RegisterEvent("PLAYER_GUILD_UPDATE")
  panel:RegisterEvent("PLAYER_REGEN_DISABLED"); panel:RegisterEvent("PLAYER_REGEN_ENABLED")
  panel:RegisterEvent("PLAYER_LEAVING_WORLD")
  panel:RegisterEvent("CHAT_MSG_SYSTEM")
  panel:RegisterEvent("ADDON_ACTION_BLOCKED"); panel:RegisterEvent("ADDON_ACTION_FORBIDDEN")
  panel:SetScript("OnEvent", function(self, event, addon, action)
    if event=="CHAT_MSG_SYSTEM" then noteDeparture(addon);return end
    if event == "ADDON_ACTION_BLOCKED" or event == "ADDON_ACTION_FORBIDDEN" then
      local op = type(action) == "string" and action:lower():match("^([^%(]+)")
      local removal = op == "c_guildinfo.uninvite" or op == "guilduninvite" or op == "guildremove" or op == "/guildremove"
      if addon == ADDON and (removal and next(sessionPending)~=nil or inClick and op=="runmacrotext") then
        -- A delayed error names only the action. Even after the window closes,
        -- stop this route and retain each individual unknown until reviewed.
        if inClick then inClick.record.state="blocked" end
        routeRefused = true
        if clientRevision then OlympusVerifyDB.inactiveSecureRemovalBlocked = clientRevision end
        cancel("WoW blocked the removal. Outstanding requests remain held.")
        if self:IsVisible() and InCombatLockdown() == false then paint() end
      end
      return
    end
    if event == "PLAYER_REGEN_ENABLED" then disarm() end
    if not self:IsVisible() then return end
    if event == "PLAYER_LEAVING_WORLD" or event == "PLAYER_REGEN_DISABLED" then
      cancel("Review closed. Return when safely out of combat."); snapshot, scope, unavailable = nil, nil, nil
      if InCombatLockdown() == false then paint() end
    elseif event == "PLAYER_GUILD_UPDATE" then
      if InCombatLockdown() == false then refresh(); paint() end
    else
      if event == "GUILD_ROSTER_UPDATE" then rosterGeneration = rosterGeneration + 1 end
      dirty = true
    end
  end)
  panel:SetScript("OnUpdate", function(_, dt)
    if not dirty or InCombatLockdown() ~= false then return end
    elapsed = elapsed + dt
    if elapsed >= 1 then dirty, elapsed = false, 0; refresh(); paint() end
  end)
  panel:SetScript("OnHide", function()
    ui.classMenu:Hide()
    cancel(); openParent, snapshot, scope, dirty, elapsed = nil, nil, nil, false, 0
  end)
end

function D.Show(parent)
  if not parent or InCombatLockdown() ~= false then return end
  if parent == openParent and panel and panel:IsVisible() then return end
  if not panel then build(parent) end
  if panel:GetParent() ~= parent then panel:SetParent(parent); panel:SetAllPoints(parent) end
  cancel(); scope, snapshot = nil, nil
  openParent = parent
  panel:Show()
  if InCombatLockdown and InCombatLockdown() == false and not (OlympusVerifyUI and OlympusVerifyUI.preview) then native.RequestRoster() end
  refresh(); paint()
end

function D.Hide()
  if InCombatLockdown() ~= false then
    cancel(); openParent, snapshot, scope, dirty = nil, nil, nil, false
  elseif panel then panel:Hide() end
end

local function deskEligible(row, mode)
  return row and not held(row.guid) and commandName(row.name)
    and (mode=="policy" and row.days>=row.need or mode=="initiate7" and row.weekEligible and row.days>=7)
end

local listing
function D.CandidatesForDesk(mode)
  if mode~="policy" and mode~="initiate7" then return nil,"Unknown inactivity filter." end
  local owner, now, generation = nativeScope(), time(), native.RosterGeneration()
  if not owner or not canReadOfficerNotes(owner) or not native.VisibilityCurrent() or blockedRoute() then
    listing=nil;return nil,"The complete native guild roster and removal permission are required."
  end
  if not listing or not sameScope(owner,listing.owner) or listing.generation~=generation
    or now<listing.at or now-listing.at>=5 then
    local data,why=observe()
    if not data then listing=nil;return nil,why end
    listing={data=data,owner=data.owner,at=now,generation=generation}
  end
  local found={}
  for _,row in ipairs(listing.data.rows) do
    if deskEligible(row,mode) then found[row.guid]={name=row.name,days=row.days,class=row.class} end
  end
  return found
end

function D.ReviewDeskSelection(targets,mode)
  if review or mode~="policy" and mode~="initiate7" or type(targets)~="table" or getmetatable(targets)
    or #targets<1 or #targets>1000 or InCombatLockdown()~=false then return false,"Select a new set of eligible members." end
  local count=0
  for i in pairs(targets) do
    if type(i)~="number" or i~=math.floor(i) or i<1 or i>#targets then return false,"Invalid removal selection." end
    count=count+1
  end
  if count~=#targets then return false,"Incomplete removal selection." end
  local data,why=observe()
  if not data then return false,why end
  local frozen,seen={},{}
  for _,picked in ipairs(targets) do
    local row=type(picked)=="table" and getmetatable(picked)==nil and data.eligible[picked.guid]
    if not deskEligible(row,mode) or picked.name~=row.name or seen[row.guid] then return false,"A selected name or its eligibility changed. Review the list again." end
    frozen[#frozen+1],seen[row.guid]=row,true
  end
  if not OlympusVerifyWorkspace or not OlympusVerifyWorkspace.OpenInactive() or not sameScope(data.owner,scope) then return false,"The native review window is unavailable." end
  initiateWeek, classes, cutoff, search = mode=="initiate7",nil,0,""
  ui.search:SetText("")
  beginReview(frozen,true);refresh();paint()
  return review~=nil,unavailable
end

function D.ReviewOne(name, guid)
  return D.ReviewDeskSelection({{name=name,guid=guid}},"policy")
end

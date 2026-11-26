-- The officer uses Blizzard's own member card and removal confirmation.
-- This desk only navigates to the character and observes their departure.
local D = {}
OlympusVerifyInactiveDesk = D
local native = OlympusVerifyAPI.Inactive
local panel, listRows, ui, openParent
local scope, snapshot, selection, review, waiting
local cutoff, search, page, message, unavailable = 0, "", 1, nil, nil
local initiateWeek, classes = false, nil
local dirty, elapsed = false, 0

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

local function withdrawCard()
  if not waiting or not waiting.card then return end
  local card = waiting.card
  waiting.card = nil
  -- A member the officer subsequently opened belongs to the officer.
  pcall(function()
    if card:GetClubId() == waiting.clubId and card.memberId == waiting.memberId and card:IsShown()
      and (not InCombatLockdown() or card.IsProtected and not card:IsProtected()) then card:Hide() end
  end)
end

local function finishMember()
  withdrawCard()
  if waiting and waiting.layers then
    for frame, layer in pairs(waiting.layers) do frame:SetFrameStrata(layer) end
  end
  waiting = nil
end

local function cancel(reason)
  finishMember()
  selection, review, page, message = {}, nil, 1, reason
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
    local target = review.targets[review.index]
    if waiting and waiting.sawRoster and not data.members[target.guid] and not data.names[target.name:lower()] then
      -- A partial read that drops more than this member isn't an unambiguous
      -- departure. Names/GUIDs are also unique throughout the complete roster.
      local intact = true
      for id in pairs(waiting.before) do
        if id ~= target.guid and not data.members[id] then intact = false; break end
      end
      if intact then
        finishMember()
        review.index = review.index + 1
        if review.index > #review.targets then
          cancel("WoW confirmed all reviewed characters have left the guild.")
        else
          message = target.name .. " left the guild. The next reviewed character is ready."
          page = math.floor((review.index - 1) / #listRows) + 1
        end
      else
        cancel("More than one roster entry disappeared. Review the current list before continuing.")
      end
    end
    if review then
      for i = review.index, #review.targets do
        if not stillEligible(review.targets[i], data) then
          cancel(review.targets[i].name .. " changed or no longer qualifies. Review the current list.")
          break
        end
      end
      if waiting then
        waiting.rowIndex = data.eligible[target.guid].index
        if waiting.checking then message = target.name .. " is still eligible. Reopen their member details to continue." end
        waiting.checking = false
      end
    end
  else
    for id, row in pairs(selection) do
      if not stillEligible(row, data) then selection[id] = nil end
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
  ui.status:SetText(unavailable or (waiting and waiting.checking and "Roster changed. Waiting for the complete list before continuing.")
    or message or (review and "Review each name. Remove each character from their own WoW guild member card."
    or string.format("%d eligible \194\183 %d selected", #rows, selected)))
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
  ui.select:SetEnabled(#rows > 0); ui.clear:SetEnabled(selected > 0)
  ui.cancel:SetShown(review ~= nil)
  ui.action:SetText(review and (waiting and "Reopen member details" or review.started and "Open next member" or "Open member details") or "Review selected")
  ui.action:SetEnabled(review and not (waiting and waiting.checking) or not review and selected > 0)
  for i, widget in ipairs(listRows) do
    local index = (page - 1) * #listRows + i
    local row = rows[index]
    widget.guid = row and row.guid
    widget:SetShown(row ~= nil)
    if row then
      widget.check:SetChecked(review ~= nil or selection[row.guid] ~= nil)
      widget.check:SetEnabled(not review)
      widget.name:SetText(row.name)
      widget.rank:SetText(row.rank)
      widget.class:SetText(className(row.class))
      widget.days:SetText(string.format("%dd / %dd", math.floor(row.days), minimumDays(row)))
      local status = review and (index < review.index and "Left guild" or index == review.index and review.started and "Current" or "Reviewed") or ""
      widget.mark:SetText(status)
    end
  end
end

local function currentRowStillMatches()
  -- nil means the index moved or the target left. Withdraw the card until
  -- the complete coalesced roster can distinguish those cases.
  local target, i = review.targets[review.index], waiting.rowIndex
  local name, rank, slot, level, _, _, note, officerNote, online, _, token, _, _, _, _, _, guid = GetGuildRosterInfo(i)
  if native.ReadText(name) ~= target.name or native.ReadText(guid) ~= target.guid then return nil end
  note, officerNote = native.ReadText(note), native.ReadText(officerNote)
  local days = online == false and native.DaysOffline(i, false)
  return native.ReadText(rank) == target.rank and slot == target.slot and level == target.level
    and classKey(token) == target.class
    and type(days) == "number" and days >= minimumDays(target) and days < math.huge
    and note and officerNote and not native.HeldNote(note) and not native.HeldNote(officerNote)
    and canReadOfficerNotes(scope)
    and native.VisibilityCurrent() and sameScope(scope, nativeScope())
end

local function sameMember(info, row)
  if not info or native.ReadText(info.guid) ~= row.guid then return false end
  local name = native.ReadText(info.name)
  if not safeName(name) then return false end
  if name == row.name then return true end
  -- The club card can omit the local realm. Never equate two explicit realms.
  if not name:find("-", 1, true) then return name == row.name:match("^([^%-]+)%-") end
  return row.name == name:match("^([^%-]+)%-")
end

local function openMember(row, handoff)
  if not CommunitiesFrame then
    if type(Communities_LoadUI) == "function" then Communities_LoadUI()
    elseif C_AddOns and type(C_AddOns.LoadAddOn) == "function" then C_AddOns.LoadAddOn("Blizzard_Communities") end
  end
  local frame, club = CommunitiesFrame, C_Club
  if not frame or type(frame.OpenGuildMemberDetailFrame) ~= "function" or not frame.GuildMemberDetailFrame
    or not club or type(club.GetGuildClubId) ~= "function" or type(club.GetClubMembers) ~= "function"
    or type(club.GetMemberInfo) ~= "function" then return end
  local clubId = club.GetGuildClubId()
  local ids = clubId and club.GetClubMembers(clubId)
  if type(ids) ~= "table" or #ids < 1 or #ids > 1000 then return end
  local member
  for _, id in ipairs(ids) do
    local item = club.GetMemberInfo(clubId, id)
    if sameMember(item, row) and item.memberId == id then member = item; break end
  end
  if not member then return end
  if not frame:IsVisible() then ShowUIPanel(frame) end
  if not frame:IsVisible() then return end
  if frame:GetSelectedClubId() ~= clubId then frame:SelectClub(clubId) end
  if frame:GetSelectedClubId() ~= clubId or not (COMMUNITIES_FRAME_DISPLAY_MODES and COMMUNITIES_FRAME_DISPLAY_MODES.ROSTER) then return end
  frame:SetDisplayMode(COMMUNITIES_FRAME_DISPLAY_MODES.ROSTER)
  if waiting ~= handoff or not sameScope(scope, nativeScope()) or club.GetGuildClubId() ~= clubId then return end
  member = club.GetMemberInfo(clubId, member.memberId)
  if not sameMember(member, row) then return end
  if not currentRowStillMatches() then
    cancel("The reviewed character changed. Review the current guild roster.")
    return
  end
  local card = frame.GuildMemberDetailFrame
  handoff.card, handoff.clubId, handoff.memberId = card, clubId, member.memberId
  frame:OpenGuildMemberDetailFrame(clubId, member)
  if waiting ~= handoff or not card:IsVisible() or card:GetClubId() ~= clubId or card.memberId ~= member.memberId or not sameMember(card:GetMemberInfo(), row)
    or not card.RemoveButton or not card.RemoveButton:IsVisible() or not card.RemoveButton:IsEnabled() then
    return
  end
  return true
end

local function prepare()
  local row = review.targets[review.index]
  waiting = waiting or {before = snapshot.members, rowIndex = snapshot.eligible[row.guid].index}
  local handoff = waiting
  local ok, opened = pcall(openMember, row, handoff)
  if waiting ~= handoff then return end
  if ok and opened then
    message = "Check " .. row.name .. " on the WoW member card, click Remove and review WoW's confirmation."
  else
    withdrawCard()
    message = "Open the guild roster, show offline members and left-click " .. row.name .. ". Check the name on the card before clicking Remove."
  end
  -- Keep Blizzard's window in front of this desk. Only the two unprotected
  -- inactive-page surfaces change layers; the secure roster parent stays put.
  if not handoff.layers then
    handoff.layers = {}
    for _, surface in ipairs({openParent, OlympusVerifyWorkspace and OlympusVerifyWorkspace.chrome}) do
      handoff.layers[surface] = surface:GetFrameStrata() or "DIALOG"
      surface:SetFrameStrata("LOW")
    end
  end
end

local function action()
  local prior, index = review, review and review.index
  refresh()
  if not snapshot or prior ~= review or review and review.index ~= index then paint(); return end
  if review then
    review.started = true; prepare()
  else
    local targets = {}
    for _, row in ipairs(filtered()) do
      if selection[row.guid] then
        -- Freeze a private copy, independent of the changing native cache.
        targets[#targets + 1] = {guid = row.guid, name = row.name, rank = row.rank, slot = row.slot,
          class = row.class, level = row.level, days = row.days, need = row.need, weekEligible = row.weekEligible}
      end
    end
    if #targets > 0 then
      review = {targets = targets, index = 1}
      page, message = 1, nil
    end
  end
  paint()
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
      if review or not r.guid or not snapshot then return end
      local id = r.guid
      selection[id] = not selection[id] and snapshot.eligible[id] or nil
      message = nil; paint()
    end
    r:SetScript("OnClick", toggle); r.check:SetScript("OnClick", toggle)
    listRows[#listRows + 1] = r
  end
  local controls = CreateFrame("Frame", nil, panel); controls:SetSize(770, 30); controls:SetPoint("BOTTOMLEFT", 20, 16)
  ui.select = button(controls, "Select all matches", 0, 0, 143, function()
    if not review then for _, row in ipairs(filtered()) do selection[row.guid] = row end; message = nil; paint() end
  end)
  ui.clear = button(controls, "Clear", 148, 0, 65, function() if not review then selection, message = {}, nil; paint() end end)
  ui.cancel = button(controls, "Cancel review", 0, 0, 143, function() cancel("Review cancelled."); paint() end)
  ui.action = button(controls, "Review selected", 225, 0, 182, action)
  ui.prev = button(controls, "Previous", 470, 0, 80, function() page = page - 1; paint() end)
  ui.pages = label(controls, "GameFontNormalSmall", 567, -6)
  ui.next = button(controls, "Next", 625, 0, 68, function() page = page + 1; paint() end)
  panel:EnableMouseWheel(true)
  panel:SetScript("OnMouseWheel", function(_, delta) page = page - delta; paint() end)
  panel:RegisterEvent("GUILD_ROSTER_UPDATE"); panel:RegisterEvent("PLAYER_GUILD_UPDATE")
  panel:RegisterEvent("PLAYER_REGEN_DISABLED"); panel:RegisterEvent("PLAYER_REGEN_ENABLED")
  panel:RegisterEvent("PLAYER_LEAVING_WORLD")
  panel:SetScript("OnEvent", function(self, event)
    if not self:IsVisible() then return end
    if event == "PLAYER_LEAVING_WORLD" or event == "PLAYER_REGEN_DISABLED" then
      cancel("Review closed. Return when safely out of combat."); snapshot, scope, unavailable = nil, nil, nil; paint()
    elseif event == "PLAYER_GUILD_UPDATE" then
      refresh(); paint()
    else
      if waiting and event == "GUILD_ROSTER_UPDATE" then
        waiting.sawRoster = true
        local ok, same = pcall(currentRowStillMatches)
        if not ok or same == false then
          cancel("The reviewed character or guild changed. Cancel any open removal and review the current list.")
          paint()
        elseif same == nil and not waiting.checking then
          waiting.checking = true
          withdrawCard()
          paint()
        end
      end
      dirty = true
    end
  end)
  panel:SetScript("OnUpdate", function(_, dt)
    if not dirty then return end
    elapsed = elapsed + dt
    if elapsed >= 1 then dirty, elapsed = false, 0; refresh(); paint() end
  end)
  panel:SetScript("OnHide", function()
    ui.classMenu:Hide()
    cancel(); openParent, snapshot, scope, dirty, elapsed = nil, nil, nil, false, 0
  end)
end

function D.Show(parent)
  if not parent then return end
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
  if panel then panel:Hide() end
end

-- Membership decisions here use only the current WoW roster. The Forever
-- client accepts the officer's named chat command; opening the editor cannot
-- tell us whether the officer pressed Enter, escaped, or the server refused.
local D = {}
OlympusVerifyInactiveDesk = D
local native = OlympusVerifyAPI.Inactive
local panel, listRows, ui, openParent
local scope, snapshot, selection, review, draft
local cutoff, search, page, message, unavailable = 0, "", 1, nil, nil
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
  local data = {owner = owner, members = {}, names = {}, eligible = {}, rows = {}}
  local leaders = 0
  for i = 1, count do
    local name, title, slot, level, _, _, note, officerNote, online, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
    name, title, guid = native.ReadText(name), native.ReadText(title), native.ReadText(guid)
    if not safeName(name) or not guid or not guid:match("^Player%-%d+%-%x+$")
      or data.members[guid] or data.names[name:lower()] or type(slot) ~= "number" or slot < 0 or slot > 9
      or slot ~= math.floor(slot) or not title or title == "" or (ranks and ranks.names[slot + 1] ~= title) then
      return nil, "Waiting for a complete roster with unique, readable characters and ranks."
    end
    data.members[guid], data.names[name:lower()] = slot, guid
    if slot == 0 then leaders = leaders + 1 end
    if online == false and guid ~= owner.actor and slot > owner.rank and not native.ProtectedRank(slot)
      and type(level) == "number" and level >= 1 and level <= 255 and level == math.floor(level) then
      note, officerNote = native.ReadText(note), native.ReadText(officerNote)
      local days, need = native.DaysOffline(i, false), native.RequiredDays(level)
      if note and officerNote and not native.HeldNote(note) and not native.HeldNote(officerNote)
        and type(days) == "number" and days >= need and days < math.huge then
        local row = {guid = guid, name = name, rank = title, slot = slot, days = days, need = need, level = level, index = i}
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
  return row.days >= cutoff and (search == "" or row.name:lower():find(search, 1, true))
end

local function stillEligible(original, data)
  local row = data and data.eligible[original.guid]
  return row and row.name == original.name and row.slot == original.slot and row.rank == original.rank
    and row.level == original.level and row.days >= cutoff
end

local function clearDraft()
  if draft then
    if draft.box:GetText() == draft.text then draft.box:SetText("") end
    draft = nil
  end
end

local function cancel(reason)
  clearDraft()
  selection, review, page, message = {}, nil, 1, reason
end

local function refresh(rosterEvent)
  local data, why = observe()
  unavailable = why
  if not data then
    cancel()
  elseif scope and not sameScope(scope, data.owner) then
    cancel("Guild or officer changed. Make a new selection.")
  elseif review then
    local target = review.targets[review.index]
    if draft and rosterEvent and draft.sawRoster and not data.members[target.guid] and not data.names[target.name:lower()] then
      -- A partial read that drops more than this member isn't an unambiguous
      -- departure. Names/GUIDs are also unique throughout the complete roster.
      local intact = true
      for id in pairs(draft.before) do
        if id ~= target.guid and not data.members[id] then intact = false; break end
      end
      if intact then
        clearDraft()
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
  ui.status:SetText(unavailable or message or (review and "Review every name before starting. WoW requires Enter for each removal."
    or string.format("%d eligible \194\183 %d selected", #rows, selected)))
  ui.pages:SetText(page .. " / " .. pages)
  ui.prev:SetEnabled(page > 1); ui.next:SetEnabled(page < pages)
  ui.search:SetShown(not review)
  ui.hint:SetShown(not review and search == "")
  for _, item in ipairs(ui.filters) do item:SetEnabled(not review and cutoff ~= item.days) end
  ui.select:SetShown(not review); ui.clear:SetShown(not review)
  ui.select:SetEnabled(#rows > 0); ui.clear:SetEnabled(selected > 0)
  ui.cancel:SetShown(review ~= nil)
  ui.action:SetText(review and (review.started and (draft and "Awaiting departure" or "Prepare next removal") or "Start reviewed queue") or "Review selected")
  ui.action:SetEnabled(review and not draft or not review and selected > 0)
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
      widget.days:SetText(string.format("%dd / %dd", math.floor(row.days), row.need))
      local status = review and (index < review.index and "Left guild" or index == review.index and review.started and "Current" or "Reviewed") or ""
      widget.mark:SetText(status)
    end
  end
end

local function preferredBox()
  return (DEFAULT_CHAT_FRAME and DEFAULT_CHAT_FRAME.editBox) or ChatFrame1EditBox
    or (ChatEdit_ChooseBoxForSend and ChatEdit_ChooseBoxForSend(DEFAULT_CHAT_FRAME))
    or (ChatEdit_GetActiveWindow and ChatEdit_GetActiveWindow())
end

local function prepare()
  local row = review.targets[review.index]
  local editor = preferredBox()
  if not editor or type(ChatFrame_OpenChat) ~= "function" or type(editor.GetText) ~= "function"
    or type(editor.SetText) ~= "function" then
    message = "The native chat editor is unavailable."
    return
  end
  local active = ChatEdit_GetActiveWindow and ChatEdit_GetActiveWindow()
  if (editor:GetText() or "") ~= "" or (active and active ~= editor and (active:GetText() or "") ~= "") then
    message = "Finish or clear your current chat draft, then prepare the removal."
    return
  end
  local command = "/guildremove " .. row.name
  local ok = pcall(ChatFrame_OpenChat, command, DEFAULT_CHAT_FRAME)
  active = (ChatEdit_GetActiveWindow and ChatEdit_GetActiveWindow()) or editor
  if not ok or active ~= editor or editor:GetText() ~= command then
    if editor:GetText() == command then editor:SetText("") end
    message = "WoW did not open the expected named command. Review it directly in the guild roster."
    return
  end
  draft = {box = active, text = command, before = snapshot.members, rowIndex = snapshot.eligible[row.guid].index}
  message = "Review " .. row.name .. " in chat and press Enter. Cancel review to stop."
end

local function action()
  local prior = review
  refresh(false)
  if not snapshot or prior ~= review then paint(); return end
  if review then
    if not draft then review.started = true; prepare() end
  else
    local targets = {}
    for _, row in ipairs(filtered()) do
      if selection[row.guid] then
        -- Freeze a private copy, independent of the changing native cache.
        targets[#targets + 1] = {guid = row.guid, name = row.name, rank = row.rank, slot = row.slot,
          level = row.level, days = row.days, need = row.need}
      end
    end
    if #targets > 0 then
      review = {targets = targets, index = 1}
      page, message = 1, nil
    end
  end
  paint()
end

local function stagedRowStillMatches()
  -- Validate the live draft immediately on roster events. A full read for the
  -- view and the departure receipt is coalesced even during an event storm.
  local target, i = review.targets[review.index], draft.rowIndex
  local name, rank, slot, level, _, _, note, officerNote, online, _, _, _, _, _, _, _, guid = GetGuildRosterInfo(i)
  note, officerNote = native.ReadText(note), native.ReadText(officerNote)
  local days = online == false and native.DaysOffline(i, false)
  return native.ReadText(name) == target.name and native.ReadText(guid) == target.guid
    and native.ReadText(rank) == target.rank and slot == target.slot and level == target.level
    and type(days) == "number" and days >= math.max(cutoff, target.need) and days < math.huge
    and note and officerNote and not native.HeldNote(note) and not native.HeldNote(officerNote)
    and canReadOfficerNotes(scope)
    and native.VisibilityCurrent() and sameScope(scope, nativeScope())
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

local function build(parent)
  panel = CreateFrame("Frame", nil, parent)
  panel:SetAllPoints(parent)
  listRows, ui = {}, {filters = {}}
  local heading = label(panel, "GameFontNormalLarge", 22, -16)
  heading:SetText("Inactive members")
  local help = label(panel, "GameFontHighlightSmall", 22, -43)
  help:SetText("Eligible offline members \194\183 Protected ranks and hold notes are excluded.")
  ui.search = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
  ui.search:SetSize(168, 24); ui.search:SetPoint("TOPLEFT", 26, -72); ui.search:SetAutoFocus(false)
  ui.hint = label(panel, "GameFontDisableSmall", 27, -78); ui.hint:SetText("Search character")
  ui.search:SetScript("OnTextChanged", function(self)
    local value = self:GetText() or ""
    if review then return end
    search, page, selection, message = value:lower(), 1, {}, nil; paint()
  end)
  ui.search:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  for i, days in ipairs({0, 7, 14, 30, 60, 90}) do
    local b = button(panel, days == 0 and "Policy" or days .. "d+", 210 + (i - 1) * 67, -72, 63, function()
      if review then return end
      cutoff, page, selection, message = days, 1, {}, nil; paint()
    end)
    b.days = days; ui.filters[#ui.filters + 1] = b
  end
  ui.status = label(panel, "GameFontHighlight", 22, -114)
  ui.status:SetWidth(math.max(480, (parent:GetWidth() or 1060) - 48))
  label(panel, "GameFontNormalSmall", 59, -153):SetText("CHARACTER")
  label(panel, "GameFontNormalSmall", 355, -153):SetText("RANK")
  label(panel, "GameFontNormalSmall", 525, -153):SetText("OFFLINE / POLICY")
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
    r.rank = label(r, "GameFontHighlight", 335, -4)
    r.days = label(r, "GameFontHighlight", 505, -4)
    r.mark = label(r, "GameFontNormalSmall", 680, -4)
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
      refresh(false); paint()
    else
      if draft and event == "GUILD_ROSTER_UPDATE" then draft.sawRoster = true end
      if draft and draft.box:GetText() == draft.text then
        local ok, same = pcall(stagedRowStillMatches)
        if not ok or not same then
          cancel("The staged character or guild changed. Review the current list.")
          paint()
        end
      end
      dirty = true
    end
  end)
  panel:SetScript("OnUpdate", function(_, dt)
    if not dirty then return end
    elapsed = elapsed + dt
    if elapsed >= 1 then dirty, elapsed = false, 0; refresh(true); paint() end
  end)
  panel:SetScript("OnHide", function()
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
  refresh(false); paint()
end

function D.Hide()
  if panel then panel:Hide() end
end

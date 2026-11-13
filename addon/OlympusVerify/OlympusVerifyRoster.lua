--[[ OlympusVerify — roster window (0.6.4).

  Every member of the guild in one list: whether they have linked Discord, their Discord username and, when it is
  different, their display name, with rank, level and when they were last seen. Filter by typing (character or Discord
  name), by status, rank and class, or online only; click a column heading to sort by it, again to reverse.

  Where the data comes from: the client's current native guild roster and the loaded Watcher verification lists.
  Watcher query/roster clocks are shown separately; repainting this window does not load a newer file or renew evidence.

  Reads OlympusVerifyAPI.Roster. A current unverified member's status opens one editable whisper; it never sends it.
  Promotion buttons use the existing dated launch queue and recheck one exact GUID per hardware click. Nothing here
  invites, removes or changes verification. Open it with
  /olv members [search], or the Members button on the officer panel. Loads after OlympusVerify.lua (TOC order). Only
  client-shipped textures and fonts, in the palette the panel uses (see OlympusVerifyUI.lua). ]]

local API = OlympusVerifyAPI
if type(API) ~= "table" or type(API.Roster) ~= "table" then return end
local R = API.Roster

OlympusVerifyRoster = OlympusVerifyRoster or {}
local W = OlympusVerifyRoster

local GOLD, GREY, WHITE, GREEN, YELLOW, RED = "|cffc9a86c", "|cff9ea3ad", "|cffe8ddc5", "|cff8ac69a", "|cffe8be65", "|cffe57572"
local C = {
  bg = { 0.063, 0.071, 0.090 }, band = { 0.090, 0.102, 0.129 }, tile = { 0.114, 0.125, 0.157 },
  gold = { 0.788, 0.659, 0.424 }, text = { 0.910, 0.867, 0.773 }, muted = { 0.620, 0.639, 0.678 },
}
local WHITE8 = "Interface\\Buttons\\WHITE8X8"
local BACKDROP_TEMPLATE = (BackdropTemplateMixin and "BackdropTemplate") or nil
local PANEL_BACKDROP = { bgFile = WHITE8, edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border", tile = false, edgeSize = 24, insets = { left = 6, right = 6, top = 6, bottom = 6 } }
local CHIP_BACKDROP = { bgFile = WHITE8, edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = false, edgeSize = 10, insets = { left = 2, right = 2, top = 2, bottom = 2 } }

local WIDTH, PAD, ROWS, ROW_H = 1200, 18, 14, 22
local INNER = WIDTH - 2 * PAD
local FILTER_Y, COLS_Y = -66, -166
local ROWS_Y = COLS_Y - 20
local HEIGHT = -ROWS_Y + ROWS * ROW_H + 234

-- Columns: key (sort), heading, x, width. The character column is class-coloured.
local COLS = {
  { key = "name", text = "Character", x = 10, w = 162 },
  { key = "level", text = "Lvl", x = 178, w = 34 },
  { key = "class", text = "Class", x = 218, w = 70 },
  { key = "rank", text = "Rank", x = 294, w = 100 },
  { key = "status", text = "Verification", x = 400, w = 156 },
  { key = "discord", text = "Discord", x = 562, w = 120 },
  { key = "display", text = "Display name", x = 688, w = 120 },
  { key = "seen", text = "Last seen", x = 814, w = 60 },
  { key = "sourceAge", text = "Roster age", x = 880, w = 76 },
  { key = "action", text = "Member readiness", x = 962, w = 176 },
}
local STATUS_TEXT = {
  verified = GREEN .. "verified|r",
  pending = YELLOW .. "verifying|r",
  unverified = RED .. "not verified|r",
  unknown = GREY .. "unknown|r",
  stale = YELLOW .. "stale list|r",
}
local STATUS_FILTERS = {
  { "all", "All verification states" }, { "verified", "Verified" },
  { "unverified", "Not verified" }, { "pending", "Verifying now" },
  { "unknown", "All unknown / review" }, { "stale", "All stale" },
  { "prior_record", "Linked (prior record)", true }, { "link_review", "Link needs review", true },
  { "linked_dated", "Linked (dated)", true },
}
local PRESENCE_FILTERS = { "Online and offline", "Online only", "Offline only" }
local ACTION_FILTERS = {
  { "all", "All readiness states" }, { "ready", "Ready to promote (signed)" },
  { "not_ready", "Not actionable" }, { "known_verified_initiate", "Verified native Initiates" },
  { "no_recommendation", "No signed recommendation" }, { "expired", "Expired recommendation" },
  { "pending", "Promotion awaiting readback" }, { "held", "Queue held" },
  { "unavailable", "Queue unavailable" }, { "duplicate_guid", "Ambiguous native GUID" },
  { "missing_guid", "Native GUID unavailable" }, { "wrong_rank", "Other native rank" },
  { "recommended", "Dated or current recommendations" },
}
local NEXT_STEP = {
  verified="Use Discord /verify-status to confirm current access; this is a dated display result.",
  pending="Keep the original request; inspect /olv status and Discord /verify-status without resubmitting an unknown outcome.",
  unverified="Use the normal Discord verification instructions; an online member can receive one editable reminder.",
  prior_record="Check Discord /verify-status and ask staff to review the earlier link against the current proof requirement.",
  link_review="Check Discord /verify-status; staff must review the account/identity record. This file does not expose the internal failed account check.",
  linked_dated="The exact earlier link is historical; obtain a fresh authorized display snapshot before claiming current verification.",
  stale="Current verification is unavailable from this expired snapshot. The loaded source dates must remain unchanged.",
  unknown="Check Discord /verify-status or ask staff to review the current identity; absence or ambiguity is not proof of being unverified.",
}
local ACTION_ORDER = { ready=1, pending=2, expired=3, no_recommendation=4, held=5,
  unavailable=6, duplicate_guid=7, missing_guid=8, wrong_rank=9 }
local selected, menu, detailText, queueSummary, snapshotText, sortText, actionFilterBtn, copyBox

local frame, search, statusBtn, rankBtn, classBtn, onlineBtn, initiateBtn, readyBtn, nextBtn, actionInfo, summary, footer, rows, headers
local offset = 0
local view = { text = "", status = 1, rank = 0, class = 0, online = false, sort = "name", desc = false, initiates = false, presence = 1, action = 1 }
local cache = { list = {}, info = nil }
local diagnostics = { byGuid = {}, byRow = {}, reason = "Promotion recommendations not loaded." }

-- ASCII "..." cut on a character boundary, as the panel does.
local function trunc(s, n)
  s = tostring(s or "")
  if #s <= n then return s end
  local cut = n - 3
  while cut > 0 do
    local b = string.byte(s, cut + 1)
    if not b or b < 128 or b >= 192 then break end
    cut = cut - 1
  end
  local last = string.byte(s, cut)
  if last and last >= 192 then cut = cut - 1 end
  return string.sub(s, 1, cut) .. "..."
end

local function seenText(m)
  if m.online then return GREEN .. "online|r" end
  local d = m.days
  if not d then return GREY .. "?|r" end
  if d < 1 then return math.floor(d * 24 + 0.5) .. "h" end
  return math.floor(d) .. "d"
end

local function classColor(file)
  local c = file and RAID_CLASS_COLORS and RAID_CLASS_COLORS[file]
  if not c then return WHITE end
  if c.colorStr then return "|c" .. c.colorStr end
  return string.format("|cff%02x%02x%02x", math.floor((c.r or 1) * 255), math.floor((c.g or 1) * 255), math.floor((c.b or 1) * 255))
end

local function className(file)
  local names = LOCALIZED_CLASS_NAMES_MALE
  return (names and file and names[file]) or (file and (string.sub(file, 1, 1) .. string.lower(string.sub(file, 2)))) or "?"
end

local function Fill(parent, layer, rgb, a, sub)
  local t = parent:CreateTexture(nil, layer, nil, sub)
  if t.SetColorTexture then t:SetColorTexture(rgb[1], rgb[2], rgb[3], a) else t:SetTexture(WHITE8) end
  return t
end

local function Label(parent, template, text, x, y, w, justify)
  local fs = parent:CreateFontString(nil, "OVERLAY", template)
  fs:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
  if w then fs:SetWidth(w) end
  fs:SetJustifyH(justify or "LEFT")
  if fs.SetWordWrap then fs:SetWordWrap(false) end
  fs:SetText(text or "")
  return fs
end

local function Tip(owner, title, lines)
  if not GameTooltip then return end
  GameTooltip:SetOwner(owner, "ANCHOR_RIGHT")
  GameTooltip:SetText(title or "", C.gold[1], C.gold[2], C.gold[3])
  for _, l in ipairs(lines or {}) do GameTooltip:AddLine(l, C.text[1], C.text[2], C.text[3], true) end
  GameTooltip:Show()
end
local function HideTip() if GameTooltip then GameTooltip:Hide() end end

local function Button(parent, text, w, h, onClick, tipTitle, tipText, secure)
  local template=secure and (BACKDROP_TEMPLATE and BACKDROP_TEMPLATE..",SecureActionButtonTemplate" or "SecureActionButtonTemplate") or BACKDROP_TEMPLATE
  local b = CreateFrame("Button", nil, parent, template)
  b:SetSize(w, h)
  if b.SetBackdrop then
    b:SetBackdrop(CHIP_BACKDROP)
    if b.SetBackdropColor then b:SetBackdropColor(C.tile[1], C.tile[2], C.tile[3], 0.95) end
    if b.SetBackdropBorderColor then b:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 0.55) end
  end
  local fs = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  fs:SetPoint("CENTER", b, "CENTER", 0, 0)
  if fs.SetWidth then fs:SetWidth(w - 8) end
  fs:SetText(text)
  if b.SetFontString then b:SetFontString(fs) end
  b.label = fs
  -- SecureActionButtonTemplate owns OnClick; replacing it loses the native macro execution.
  if not secure then b:SetScript("OnClick", onClick) end
  if tipTitle then
    b:SetScript("OnEnter", function(self) Tip(self, tipTitle, { tipText }) end)
    b:SetScript("OnLeave", HideTip)
  end
  return b
end

-- The label is the button's own font string (SetFontString), so setting it directly is the whole job.
local function SetButtonText(b, text) if b.label then b.label:SetText(text) end end

local function Clean(value)
  return tostring(value or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("[%c]", " ")
end
local function Stamp(value)
  return type(value)=="number" and date("%d %b %H:%M:%S", value) or "unavailable"
end
local function Age(value)
  if type(value)~="number" or value<=0 then return "?" end
  local age=time()-value
  if age<0 then return "future" end
  if age<60 then return tostring(math.floor(age)).."s" end
  if age<3600 then return tostring(math.floor(age/60)).."m" end
  return string.format("%.1fh", age/3600)
end
local function CloseMenu() if menu then menu:Hide(); menu.owner=nil end end
local function OpenMenu(owner, title, options, current, choose)
  if menu and menu:IsShown() and menu.owner==owner then CloseMenu(); return end
  if not menu then
    menu=CreateFrame("Frame", "OlympusVerifyRosterMenu", frame, BACKDROP_TEMPLATE)
    menu:SetFrameStrata("TOOLTIP"); menu:EnableMouse(true)
    if menu.SetClampedToScreen then menu:SetClampedToScreen(true) end
    if menu.SetBackdrop then menu:SetBackdrop(PANEL_BACKDROP); menu:SetBackdropColor(C.bg[1],C.bg[2],C.bg[3],1) end
    menu.title=Label(menu,"GameFontNormalSmall","",12,-10,300)
    menu.items={}
    for i=1,18 do
      local item=Button(menu,"",316,23,function(self)
        local option=self.option
        if not option or not menu.choose then return end
        local fn=menu.choose; CloseMenu(); fn(option.value)
      end)
      item:SetPoint("TOPLEFT",menu,"TOPLEFT",8,-29-(i-1)*23)
      item:Hide(); menu.items[i]=item
    end
    if type(UISpecialFrames)=="table" then table.insert(UISpecialFrames,"OlympusVerifyRosterMenu") end
  end
  menu:ClearAllPoints(); menu:SetPoint("TOPLEFT",owner,"BOTTOMLEFT",0,-2)
  menu.owner,menu.choose=owner,choose
  menu.title:SetText(title); menu:SetSize(332,37+math.min(#options,18)*23)
  for i,item in ipairs(menu.items) do
    local option=options[i]; item.option=option
    if option then
      SetButtonText(item,(option.value==current and GOLD.."[x] " or WHITE.."    ")..option.label.."|r"); item:Show()
    else item:Hide() end
  end
  menu:Show(); W.menu=menu
end
local function ActionFor(m)
  return diagnostics.byRow and diagnostics.byRow[m]
    or diagnostics.byGuid and m.guid and diagnostics.byGuid[m.guid]
    or { state="unavailable", label="Queue unavailable", reason=diagnostics.reason }
end

-- ---------------------------------------------------------------- data
local function EvidenceStamp()
  if type(R.DisplaySource)~="function" then return nil,nil,nil,nil,nil end
  local ok,q,why,stale=pcall(R.DisplaySource)
  if not ok then return nil,"Display source could not be checked",true,nil,nil end
  local verified=type(q)=="table" and q.verified
  return q,why,stale,type(verified)=="table" and verified.fetchedAt,type(verified)=="table" and verified.snapshotAt
end
local function Reload()
  local list, info = R.Members()
  -- The native Guild column and this fallback window share the same GUID/freshness rules.
  -- Older standalone installations without the optional module retain their existing display.
  if R.Verification and info and list and list[1] and list[1].statusReason == nil then
    info.verified, info.pending, info.unverified, info.unknown, info.stale = 0, 0, 0, 0, 0
    for _, m in ipairs(list or {}) do
      local ok, r = pcall(R.Verification, m.full, m.guid)
      m.verification = ok and type(r) == "table" and r or { status = "unknown", reason = "The current native roster could not be read." }
      m.status = m.verification.status
      m.statusDetail = m.verification.statusDetail or m.status
      m.statusReason, m.statusLabel = m.verification.reason, m.verification.label
      m.statusAt, m.snapshotAt = m.verification.at, m.verification.snapshotAt
      m.historicalLinked = m.verification.historicalLinked
      -- Preserve the actual native GUID even when a display classification is unknown.
      m.guid = m.guid or m.verification.guid
      info[m.status] = (info[m.status] or 0) + 1
      if m.status ~= "verified" then m.discord, m.display, m.discordId = nil, nil, nil end
    end
  end
  cache.list, cache.info = list or {}, info
  cache.source,cache.error,cache.stale,cache.fetched,cache.snapshot=EvidenceStamp()
end

local function Say(text)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("Olympus Verify: " .. text) end
end

-- Display candidacy is an intersection with the existing launch projection, never a verification-label lookup.
-- The shared secure dispatcher independently rechecks the full native roster at the click.
local function PromotionCandidates()
  local model=OlympusVerifyRosterModel
  if model and type(model.Promotions)=="function" then
    local candidates, result=model.Promotions(cache.list, OlympusLaunch229, time())
    diagnostics=result
    return candidates, result.reason
  end
  diagnostics={byGuid={},byRow={},nativeInitiates=0,knownVerifiedInitiates=0,recommendations=0,ready=0,
    reason="Promotion diagnostics unavailable; no action is enabled."}
  return {},diagnostics.reason
end

local function Eligible(m, candidates)
  return type(m.guid) == "string" and candidates[m.guid] == true and type(m.rankIndex)=="number" and m.rankIndex>=6 and m.rankIndex<=9
end

local function CurrentRank()
  if type(view.rank)=="string" then return view.rank end
  local ranks = cache.info and cache.info.ranks or {}
  local r = ranks[view.rank]
  return r and r.rank or nil
end
local function CurrentClass()
  if type(view.class)=="string" then return view.class end
  local classes = cache.info and cache.info.classes or {}
  return classes[view.class]
end

local function Visible()
  local list = R.Filter(cache.list, {
    text = view.text,
    status = not STATUS_FILTERS[view.status][3] and STATUS_FILTERS[view.status][1] or nil,
    statusDetail = STATUS_FILTERS[view.status][3] and STATUS_FILTERS[view.status][1] or nil,
    rank = CurrentRank(),
    class = CurrentClass(),
    online = view.online or view.presence == 2, offline = view.presence == 3,
  })
  local candidates, why = PromotionCandidates()
  local filtered = {}
  for _, m in ipairs(list) do
    local kind=ACTION_FILTERS[view.action or 1][1]
    local action=ActionFor(m)
    local matches=kind=="all" or kind=="ready" and Eligible(m,candidates)
      or kind=="not_ready" and not Eligible(m,candidates)
      or kind=="recommended" and action.historical==true
      or kind=="known_verified_initiate" and m.rankIndex==9 and m.status=="verified" and not m.historicalLinked
      or kind==action.state
    if (not view.initiates or m.rankIndex == 9) and matches then
      filtered[#filtered + 1] = m
    end
  end
  if view.sort=="action" then
    table.sort(filtered,function(a,b)
      local av,bv=ACTION_ORDER[ActionFor(a).state] or 99,ACTION_ORDER[ActionFor(b).state] or 99
      if av~=bv then if view.desc then return av>bv else return av<bv end end
      local an,bn=string.lower(a.full or a.name),string.lower(b.full or b.name)
      if an~=bn then return an<bn end
      return (a.guid or "")<(b.guid or "")
    end)
    return filtered,candidates,why
  end
  return R.Sort(filtered, view.sort, view.desc), candidates, why
end

local function PromotionTarget(guid)
  -- Rebuild the filtered view at the hardware boundary: recycled/hidden/stale rows cannot supply a target.
  local list, candidates, why = Visible()
  for _, m in ipairs(list) do
    if (not guid or m.guid == guid) and Eligible(m, candidates) then
      return m.guid
    end
  end
  Say(why or "No fresh promotion is ready in this filtered view.")
end
local function BindPromotion(button,resolver)
  local launch=OlympusLaunch229
  if type(launch)=="table" and type(launch.BindPromotionButton)=="function" then
    launch.BindPromotionButton(button,resolver,function() Reload();W.Refresh() end)
  else button:SetEnabled(false) end
end

-- ---------------------------------------------------------------- drawing
local function DetailLines(m)
  local action=ActionFor(m)
  return {
    string.format("%s | Level %s %s | Native rank %s (slot %s) | %s", Clean(m.full or m.name),tostring(m.level),className(m.class),Clean(m.rank),tostring(m.rankIndex),m.online and "online" or "offline"),
    "Verification: "..Clean(m.statusLabel or m.status).." ["..Clean(m.statusDetail or m.status).."]",
    Clean(m.statusReason or m.verification and m.verification.reason or "No current verification evidence is available."),
    "Server list queried: "..Stamp(m.statusAt).." ("..Age(m.statusAt).."); native roster observed: "..Stamp(m.snapshotAt).." ("..Age(m.snapshotAt)..")",
    "Native GUID: "..Clean(m.guid or "unavailable")..(m.discord and " | Known Discord: @"..Clean(m.discord) or " | No current Discord name supplied"),
    "Promotion readiness: "..Clean(action.label or action.state)..". "..Clean(action.reason or diagnostics.reason),
    action.historical and ("Dated discovery target: "..Clean(action.historicalTargetName)..". This historical row does not renew action freshness.") or "No supported promotion was recorded in the dated discovery for this GUID.",
    "Next step: "..(NEXT_STEP[m.statusDetail or m.status] or NEXT_STEP.unknown),
  }
end
local function ShowDetail(m)
  if not detailText then return end
  if not m then detailText:SetText(GREY.."Select a row for its full verification reason, source dates and promotion readiness. Review labels do not establish current Discord access.|r"); return end
  local lines=DetailLines(m)
  detailText:SetText(WHITE..table.concat(lines,"\n").."|r")
end
local function RowTip(r)
  local m=r.member
  if not m then return end
  local lines=DetailLines(m)
  lines[#lines+1]="Select this row to keep these details visible."
  if m.status=="unverified" and m.online then lines[#lines+1]="Click the verification cell to open one editable reminder; it does not send it." end
  Tip(r,m.full or m.name,lines)
end
local function CopyTable()
  CloseMenu()
  local list=Visible()
  local lines={"Character\tLevel\tClass\tNative rank\tVerification\tDetail code\tReason\tKnown Discord\tList queried\tRoster observed\tReadiness\tReadiness reason"}
  local bytes,included=#lines[1],0
  for _,m in ipairs(list) do
    local a=ActionFor(m)
    local values={m.full or m.name,m.level,className(m.class),m.rank,m.statusLabel or m.status,m.statusDetail or m.status,
      m.statusReason or m.verification and m.verification.reason,m.discord,Stamp(m.statusAt),Stamp(m.snapshotAt),a.label,a.reason}
    local cells={};for i=1,12 do cells[i]=Clean(values[i]) end
    local line=table.concat(cells,"\t")
    if bytes+#line+1>524288 then break end
    lines[#lines+1]=line;bytes=bytes+#line+1;included=included+1
  end
  if not copyBox then
    local f=CreateFrame("Frame","OlympusVerifyRosterCopy",frame,BACKDROP_TEMPLATE)
    f:SetSize(900,300);f:SetPoint("CENTER",frame,"CENTER",0,0);f:SetFrameStrata("FULLSCREEN_DIALOG")
    if f.SetBackdrop then f:SetBackdrop(PANEL_BACKDROP);f:SetBackdropColor(C.bg[1],C.bg[2],C.bg[3],1) end
    f.title=Label(f,"GameFontNormalSmall","",18,-18,850)
    local box=CreateFrame("EditBox",nil,f,BACKDROP_TEMPLATE)
    box:SetSize(854,218);box:SetPoint("TOPLEFT",f,"TOPLEFT",22,-48);box:SetMultiLine(true);box:SetAutoFocus(false)
    box:SetMaxLetters(524288);box:SetFontObject(ChatFontNormal or GameFontHighlightSmall)
    box:SetScript("OnEscapePressed",function() f:Hide() end)
    f.input=box
    local close=CreateFrame("Button",nil,f,"UIPanelCloseButton");close:SetPoint("TOPRIGHT",f,"TOPRIGHT",-4,-4)
    close:SetScript("OnClick",function() f:Hide() end)
    if type(UISpecialFrames)=="table" then table.insert(UISpecialFrames,"OlympusVerifyRosterCopy") end
    copyBox=f;W.copyBox=f
  end
  copyBox.title:SetText(string.format("Table: %d of %d filtered rows%s. Ctrl+A, Ctrl+C to copy; Escape closes.",included,#list,included<#list and " (size limit)" or ""))
  copyBox.input:SetText(table.concat(lines,"\n"));copyBox:Show();copyBox.input:SetFocus();copyBox.input:HighlightText()
end
local function SourceLines()
  return { diagnostics.reason or "No supported last-loaded projection is available.",
    string.format("Loaded pages: %d; expired pages: %d; source holds: %d; risk-review rows: %d",diagnostics.pageCount or 0,diagnostics.stalePages or 0,diagnostics.sourceHeld or 0,diagnostics.riskReview or 0),
    "Refresh view rereads native rows and evidence already loaded into this session. It cannot observe the Watcher's current process or read a changed disk file.",
    "Linked (prior record): earlier exact link needs current-proof review. Linked (dated): exact link in expired evidence. Link needs review: server account/identity checks were unconfirmed; no specific failed check is exposed.",
    "Potential Initiates and signed action readiness are separate. Original expiry, native and pending-attempt guards remain." }
end

function W.Refresh()
  if not frame or not frame:IsShown() or InCombatLockdown and InCombatLockdown() then return end
  local q,err,stale,fetched,snapshot=EvidenceStamp()
  if q~=cache.source or err~=cache.error or stale~=cache.stale or fetched~=cache.fetched or snapshot~=cache.snapshot then Reload() end
  local list, candidates, why = Visible()
  local info = cache.info or {}
  local maxOffset = math.max(0, #list - ROWS)
  if offset > maxOffset then offset = maxOffset end
  if offset < 0 then offset = 0 end
  for i = 1, ROWS do
    local r, m = rows[i], list[offset + i]
    if m then
      r.member = m
      r.cells.name:SetText(classColor(m.class) .. trunc(m.name, 26) .. "|r")
      r.cells.level:SetText(WHITE .. tostring(m.level or "") .. "|r")
      r.cells.rank:SetText(WHITE .. trunc(m.rank, 16) .. "|r")
      r.cells.class:SetText(classColor(m.class)..trunc(className(m.class),11).."|r")
      local color = m.historicalLinked == true and YELLOW or m.status == "verified" and GREEN or m.status == "unverified" and RED
        or (m.status == "stale" or m.status == "pending") and YELLOW or GREY
      r.cells.status:SetText(m.statusLabel and (color .. m.statusLabel .. "|r") or STATUS_TEXT[m.status] or m.status)
      if r.remind then r.remind.member = m; r.remind:SetShown(m.status == "unverified" and m.online) end
      r.cells.discord:SetText(m.discord and (WHITE .. trunc("@" .. m.discord, 20) .. "|r") or (m.status == "verified" and (GREY .. "linked|r") or ""))
      r.cells.display:SetText(m.display and (WHITE .. trunc(m.display, 18) .. "|r") or "")
      r.cells.seen:SetText(seenText(m))
      r.cells.sourceAge:SetText(GREY..Age(m.snapshotAt).."|r")
      local action=ActionFor(m)
      r.cells.action:SetText(Eligible(m,candidates) and "" or GREY..trunc(action.label or action.state,28).."|r")
      r.promote.member = m
      SetButtonText(r.promote,action.targetName and ("To "..action.targetName) or "Promote")
      r.promote:SetShown(Eligible(m, candidates))
      r:Show()
    else
      r.member = nil
      if r.remind then r.remind.member = nil; r.remind:Hide() end
      r.promote.member = nil; r.promote:Hide()
      r:Hide()
    end
  end
  for _, hdr in ipairs(headers) do
    local col = hdr.col
    local arrow = (view.sort == col.key) and (view.desc and " v" or " ^") or ""
    SetButtonText(hdr, (view.sort == col.key and GOLD or GREY) .. col.text .. arrow .. "|r")
  end
  local shown=#list
  summary:SetText(string.format("%s%d members|r  %s%d verified|r  %s%d not verified|r  %s%d verifying|r  %s%d review/unknown|r  %s%d stale|r",
    WHITE,info.total or 0,GREEN,info.verified or 0,RED,info.unverified or 0,YELLOW,info.pending or 0,GREY,info.unknown or 0,YELLOW,info.stale or 0))
  local loadedAt,snapshotAt
  for _,m in ipairs(cache.list) do
    if type(m.statusAt)=="number" and (not loadedAt or m.statusAt<loadedAt) then loadedAt=m.statusAt end
    if type(m.snapshotAt)=="number" and (not snapshotAt or m.snapshotAt<snapshotAt) then snapshotAt=m.snapshotAt end
  end
  local sync=OlympusVerifyAutoSync and OlympusVerifyAutoSync.Status and OlympusVerifyAutoSync.Status()
  snapshotText:SetText(GREY.."Local Sync request: "..Stamp(sync and sync.lastRequestedAt).." | Loaded server query: "..Stamp(loadedAt).." ("..Age(loadedAt)..") | Server roster: "..Stamp(snapshotAt).." ("..Age(snapshotAt)..")|r")
  local namesHint=info.hasNames and "Refresh view rereads the native roster and loaded evidence; it cannot fetch a changed disk file."
    or "No current Discord names loaded. Use Sync & reload, then inspect the Watcher result."
  footer:SetText(GREY..string.format("Showing %d of %d members%s. ",shown,info.total or 0,
    #list>ROWS and string.format(" | rows %d-%d, scroll",offset+1,math.min(#list,offset+ROWS)) or "")..namesHint.."|r")
  SetButtonText(statusBtn,STATUS_FILTERS[view.status][2].." v")
  SetButtonText(rankBtn,(CurrentRank() or "All ranks").." v")
  SetButtonText(classBtn,(CurrentClass() and className(CurrentClass()) or "All classes").." v")
  SetButtonText(onlineBtn,PRESENCE_FILTERS[view.presence or 1].." v")
  SetButtonText(actionFilterBtn,ACTION_FILTERS[view.action or 1][2].." v")
  SetButtonText(initiateBtn,(view.initiates and GOLD or WHITE).."Initiates|r")
  SetButtonText(readyBtn,(view.initiates and view.status==2 and view.action==4 and GOLD or WHITE).."Verified Initiates|r")
  local readyCount=0
  for _,m in ipairs(list) do if Eligible(m,candidates) then readyCount=readyCount+1 end end
  local actionTitle=not diagnostics.queueAvailable and "Promote: unavailable"
    or readyCount>0 and string.format("Promote next (%d)",readyCount)
    or (diagnostics.ready or 0)>0 and "Ready outside filters"
    or diagnostics.state=="pending" and "Promote: awaiting read"
    or diagnostics.state=="held" and "Promote: held"
    or diagnostics.state=="expired" and "Promote: stale"
    or "Promote: none ready"
  SetButtonText(nextBtn,actionTitle);nextBtn:SetEnabled(readyCount>0)
  local loaded=diagnostics.queueAvailable and tostring(diagnostics.recommendations or 0) or "unavailable"
  queueSummary:SetText(WHITE..string.format("Native Initiates: %d | Verified Initiates: %d potential | Signed recommendations: %s | Actionable: %d total / %d shown | Source holds: %d | Risk review: %d",
    diagnostics.nativeInitiates or 0,diagnostics.knownVerifiedInitiates or 0,loaded,diagnostics.ready or 0,readyCount,diagnostics.sourceHeld or 0,diagnostics.riskReview or 0).."|r")
  local explanation=diagnostics.reason or why or "No signed recommendation is available."
  if shown==0 then
    local empty=view.action==2 and "No actionable signed promotions match these filters. "
      or view.initiates and view.status==2 and view.action==4 and "No current verified Initiates match these filters. "
      or "No members match these filters. "
    explanation=empty..explanation
  end
  actionInfo:SetText(GREY..explanation.."|r")
  W.sourceExplanation=explanation
  local sortLabel=view.sort
  for _,col in ipairs(COLS) do if col.key==view.sort then sortLabel=col.text end end
  local hint="; equal values use character name. Blank values stay last."
  if view.sort=="discord" or view.sort=="display" then
    local known=0;for _,m in ipairs(list) do if m[view.sort] and m[view.sort]~="" then known=known+1 end end
    if known==0 then hint="; no current names in this view, so rows tie by character name." end
  elseif view.sort=="sourceAge" then
    local first,same=nil,true
    for _,m in ipairs(list) do if first==nil then first=m.snapshotAt elseif first~=m.snapshotAt then same=false end end
    if same then hint="; this view shares one original observation time, so rows tie by character name." end
  end
  sortText:SetText(GREY.."Sorted by "..sortLabel..(view.desc and " descending" or " ascending")..hint.."|r")
  local match
  if selected then for _,m in ipairs(cache.list) do
    if selected.guid and m.guid==selected.guid or not selected.guid and m.full==selected.full then match=m;break end
  end end
  ShowDetail(match)
  if W.selectButton then W.selectButton:SetEnabled(match~=nil and type(match.guid)=="string" and type(OlympusLaunch229)=="table" and type(OlympusLaunch229.Select)=="function") end
  W.diagnostics,W.summary,W.queueSummary,W.snapshotText,W.actionInfo,W.detailText,W.sortText=diagnostics,summary,queueSummary,snapshotText,actionInfo,detailText,sortText

end

local function Wheel(_, delta)
  offset = offset - (tonumber(delta) or 0) * 3
  W.Refresh()
end

-- ---------------------------------------------------------------- building
local Layout = { WIDTH=WIDTH, HEIGHT=HEIGHT, PAD=PAD, INNER=INNER, FILTER_Y=FILTER_Y, COLS_Y=COLS_Y, ROWS_Y=ROWS_Y, ROW_H=ROW_H, ROWS=ROWS }
local function Build()
  frame = CreateFrame("Frame", "OlympusVerifyRosterFrame", UIParent, BACKDROP_TEMPLATE)
  frame:SetSize(Layout.WIDTH, Layout.HEIGHT)
  local sw=UIParent and UIParent.GetWidth and UIParent:GetWidth()
  local sh=UIParent and UIParent.GetHeight and UIParent:GetHeight()
  if type(sw)=="number" and type(sh)=="number" and sw>0 and sh>0 then frame:SetScale(math.min(1,(sw-24)/Layout.WIDTH,(sh-24)/Layout.HEIGHT)) end
  if frame.SetFrameStrata then frame:SetFrameStrata("DIALOG") end
  if frame.SetToplevel then frame:SetToplevel(true) end
  if frame.SetClampedToScreen then frame:SetClampedToScreen(true) end
  if frame.SetBackdrop then
    frame:SetBackdrop(PANEL_BACKDROP)
    if frame.SetBackdropColor then frame:SetBackdropColor(C.bg[1], C.bg[2], C.bg[3], 0.97) end
    if frame.SetBackdropBorderColor then frame:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 1) end
  end
  local pos = OlympusVerifyDB and OlympusVerifyDB.rosterWindow
  if type(pos) == "table" and pos.point then frame:SetPoint(pos.point, UIParent, pos.point, pos.x or 0, pos.y or 0)
  else frame:SetPoint("CENTER", UIParent, "CENTER", 0, 20) end
  frame:SetMovable(true); frame:EnableMouse(true); frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, _, x, y = self:GetPoint()
    if OlympusVerifyDB and point then OlympusVerifyDB.rosterWindow = { point = point, x = x, y = y } end
  end)
  frame:Hide()
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "OlympusVerifyRosterFrame") end

  local band = Fill(frame, "BORDER", C.band, 0.96, -1)
  band:SetPoint("TOPLEFT", frame, "TOPLEFT", 10, -10)
  band:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -10, -50)
  Label(frame, "GameFontNormalLarge", GOLD .. "Olympus roster|r", Layout.PAD, -17, 170)
  summary = Label(frame, "GameFontHighlightSmall", "", Layout.PAD + 176, -22, Layout.INNER - 176 - 40)
  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -5, -5)
  close:SetScript("OnClick", function() W.Hide() end)

  -- filters: search, then four toggles that cycle through their values
  search = CreateFrame("EditBox", "OlympusVerifyRosterSearch", frame, BACKDROP_TEMPLATE)
  search:SetSize(232, 24)
  search:SetPoint("TOPLEFT", frame, "TOPLEFT", Layout.PAD, Layout.FILTER_Y)
  if search.SetBackdrop then
    search:SetBackdrop(CHIP_BACKDROP)
    if search.SetBackdropColor then search:SetBackdropColor(0.04, 0.045, 0.06, 1) end
    if search.SetBackdropBorderColor then search:SetBackdropBorderColor(C.gold[1], C.gold[2], C.gold[3], 0.55) end
  end
  if search.SetFontObject then search:SetFontObject(ChatFontNormal or GameFontHighlightSmall) end
  if search.SetTextInsets then search:SetTextInsets(8, 8, 0, 0) end
  if search.SetAutoFocus then search:SetAutoFocus(false) end
  if search.SetMaxLetters then search:SetMaxLetters(40) end
  search:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  search:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
  search:SetScript("OnTextChanged", function(self)
    view.text = self:GetText() or ""
    if search.hint then if view.text == "" then search.hint:Show() else search.hint:Hide() end end
    offset = 0
    W.Refresh()
  end)
  search:SetScript("OnEnter", function(self) Tip(self, "Search", { "Part of a character name, a Discord username or a display name. Any case." }) end)
  search:SetScript("OnLeave", HideTip)
  -- A placeholder, shown while the box is empty. It belongs to the box itself: on the window it sat below the box's
  -- backdrop (a child frame draws over its parent's font strings whatever their layer) and never showed.
  local hint = search:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  hint:SetPoint("LEFT", search, "LEFT", 9, 0)
  hint:SetWidth(214)
  hint:SetJustifyH("LEFT")
  if hint.SetWordWrap then hint:SetWordWrap(false) end
  hint:SetText("Search character or Discord name")
  search.hint = hint
  statusBtn=Button(frame,"All verification states v",192,24,function(self)
    local options={}
    for i,item in ipairs(STATUS_FILTERS) do
      local count=0;for _,m in ipairs(cache.list) do
        if item[1]=="all" or item[3] and m.statusDetail==item[1] or not item[3] and m.status==item[1] then count=count+1 end
      end
      options[#options+1]={value=i,label=item[2].." ("..count..")"}
    end
    OpenMenu(self,"Verification state",options,view.status,function(value) view.status=value;offset=0;W.Refresh() end)
  end,"Verification filter","Choose a specific state. Prior records, review cases and dated links remain distinct from current verified records.")
  statusBtn:SetPoint("LEFT",search,"RIGHT",8,0)
  rankBtn=Button(frame,"All ranks v",158,24,function(self)
    local options={{value=0,label="All ranks"}}
    for i,r in ipairs(cache.info and cache.info.ranks or {}) do options[#options+1]={value=r.rank,label=Clean(r.rank).." (slot "..tostring(r.rankIndex)..")"} end
    OpenMenu(self,"Native rank",options,view.rank,function(value) view.rank=value;view.initiates=false;offset=0;W.Refresh() end)
  end,"Rank","Choose a native guild rank directly.")
  rankBtn:SetPoint("LEFT",statusBtn,"RIGHT",6,0)
  classBtn=Button(frame,"All classes v",140,24,function(self)
    local options={{value=0,label="All classes"}}
    for i,c in ipairs(cache.info and cache.info.classes or {}) do options[#options+1]={value=c,label=className(c)} end
    OpenMenu(self,"Class",options,view.class,function(value) view.class=value;offset=0;W.Refresh() end)
  end,"Class","Choose a class directly.")
  classBtn:SetPoint("LEFT",rankBtn,"RIGHT",6,0)
  onlineBtn=Button(frame,"Online and offline v",158,24,function(self)
    local options={};for i,label in ipairs(PRESENCE_FILTERS) do options[#options+1]={value=i,label=label} end
    OpenMenu(self,"Presence",options,view.presence,function(value) view.presence=value;view.online=false;offset=0;W.Refresh() end)
  end,"Presence","Choose all, online only or offline only.")
  onlineBtn:SetPoint("LEFT",classBtn,"RIGHT",6,0)
  actionFilterBtn=Button(frame,"All readiness states v",220,24,function(self)
    local options={};for i,item in ipairs(ACTION_FILTERS) do options[#options+1]={value=i,label=item[2]} end
    OpenMenu(self,"Promotion readiness",options,view.action,function(value) view.action=value;offset=0;W.Refresh() end)
  end,"Readiness","Filter signed action readiness separately from display verification.")
  actionFilterBtn:SetPoint("TOPLEFT",frame,"TOPLEFT",Layout.PAD,Layout.FILTER_Y-64)

  initiateBtn = Button(frame, "Initiates", 106, 24, function()
    CloseMenu();view.initiates = not view.initiates; view.rank = 0; offset = 0; W.Refresh()
  end, "Initiates", "Show native rank-slot 9 Initiates. Other search, status and online filters still apply.")
  initiateBtn:SetPoint("TOPLEFT", frame, "TOPLEFT", Layout.PAD, Layout.FILTER_Y - 32)
  readyBtn = Button(frame, "Verified Initiates", 150, 24, function()
    CloseMenu();view.initiates = true; view.rank = 0; view.status = 2; view.action = 4; offset = 0; W.Refresh()
  end, "Verified Initiates", "Show native slot-9 Initiates whose current loaded base status is verified, including those without a signed promotion recommendation. These are potential candidates; promotion readiness is separate. Other search, class and presence filters still apply.")
  readyBtn:SetPoint("LEFT", initiateBtn, "RIGHT", 6, 0)
  nextBtn = Button(frame, "Promote next (0)", 150, 24, nil,
    "Promote next", "Attempt exactly one ready target in the current filtered, sorted order. No background or bulk promotion; native checks run again at the click.",true)
  BindPromotion(nextBtn,function() return PromotionTarget() end)
  nextBtn:SetPoint("LEFT", readyBtn, "RIGHT", 6, 0)
  local clear = Button(frame, "Clear filters", 108, 24, function()
    CloseMenu();view.status, view.rank, view.class, view.online, view.initiates, view.text, view.presence, view.action = 1, 0, 0, false, false, "", 1, 1
    search:SetText(""); offset = 0; W.Refresh()
  end, "Clear filters", "Show everyone again; keep the chosen sort order.")
  clear:SetPoint("LEFT", nextBtn, "RIGHT", 6, 0)
  W.selectButton=Button(frame,"Recheck selected + reload",216,24,function() W.RequestSelected() end,
    "Recheck selected GUID", "Request one current selected-page read for the highlighted native GUID. This never promotes; use a separate hardware click after loading its dated result.")
  W.selectButton:SetEnabled(false)
  actionInfo=Label(frame,"GameFontDisableSmall","",Layout.PAD+230,Layout.FILTER_Y-69,Layout.INNER-230)
  actionInfo:SetWordWrap(true);actionInfo:SetHeight(26)
  snapshotText=Label(frame,"GameFontDisableSmall","",Layout.PAD,-49,Layout.INNER)
  queueSummary=Label(frame,"GameFontHighlightSmall","",Layout.PAD,Layout.COLS_Y-Layout.ROWS*Layout.ROW_H-26,Layout.INNER)
  queueSummary:SetWordWrap(true);queueSummary:SetHeight(30)
  sortText=Label(frame,"GameFontDisableSmall","",Layout.PAD,Layout.COLS_Y-Layout.ROWS*Layout.ROW_H-62,Layout.INNER)
  detailText=Label(frame,"GameFontHighlightSmall","",Layout.PAD,Layout.COLS_Y-Layout.ROWS*Layout.ROW_H-81,Layout.INNER)
  detailText:SetWordWrap(true);detailText:SetHeight(128)
  local refresh=Button(frame,"Refresh view",108,24,function() CloseMenu();Reload();W.Refresh() end,"Refresh view","Reread native rows and the evidence already loaded in this session. This does not run Sync, reload, fetch a disk file or grant verification.")
  refresh:SetPoint("LEFT",clear,"RIGHT",6,0)
  local copy=Button(frame,"Copy table",104,24,CopyTable,"Copy filtered table","Open a read-only tab-separated copy of the current filtered/sorted rows. No codes, request bodies or account IDs are exported.")
  copy:SetPoint("LEFT",refresh,"RIGHT",6,0)
  W.selectButton:SetPoint("LEFT",copy,"RIGHT",6,0)
  W.batchButton=Button(frame,"Check first 20 shown",176,24,function() W.RequestVerifiedInitiates() end,
    "Check verified Initiates", "Request fresh promotion checks for the shown verified native Initiates, up to twenty exact GUIDs, then reload. Current display filters are preserved; this never promotes anyone.")
  W.batchButton:SetPoint("LEFT",W.selectButton,"RIGHT",6,0)
  W.refreshButton,W.copyButton=refresh,copy
  local sourceTip=CreateFrame("Frame",nil,frame)
  sourceTip:SetSize(Layout.INNER-230,24);sourceTip:SetPoint("TOPLEFT",frame,"TOPLEFT",Layout.PAD+230,Layout.FILTER_Y-64);sourceTip:EnableMouse(true)
  sourceTip:SetScript("OnEnter",function(self)
    local lines=SourceLines();lines[1]=W.sourceExplanation or lines[1]
    Tip(self,"Last loaded recommendation source",lines)
  end)
  sourceTip:SetScript("OnLeave",HideTip)
  W.sourceTip=sourceTip

  -- column headings: click to sort, again to reverse
  local cols = Fill(frame, "BORDER", C.band, 0.96, -1)
  cols:SetPoint("TOPLEFT", frame, "TOPLEFT", Layout.PAD, Layout.COLS_Y)
  cols:SetSize(Layout.INNER, 18)
  headers = {}
  for _, col in ipairs(COLS) do
    local hdr = CreateFrame("Button", nil, frame)
    hdr:SetSize(col.w, 18)
    hdr:SetPoint("TOPLEFT", frame, "TOPLEFT", Layout.PAD + col.x, Layout.COLS_Y)
    local fs = hdr:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    fs:SetPoint("LEFT", hdr, "LEFT", 0, 0)
    fs:SetWidth(col.w)
    fs:SetJustifyH("LEFT")
    fs:SetText(GREY .. col.text .. "|r")
    if hdr.SetFontString then hdr:SetFontString(fs) end
    hdr.label = fs
    hdr.col = col
    hdr:SetScript("OnClick", function()
      if view.sort == col.key then view.desc = not view.desc else view.sort = col.key; view.desc = false end
      offset=0;CloseMenu();W.Refresh()
    end)
    hdr:SetScript("OnEnter",function(self) Tip(self,"Sort by "..col.text,{"Click to sort; click again to reverse. Blank values stay last; equal values use character name.",(col.key=="discord" or col.key=="display") and "Names are shown only when current loaded evidence supplies them." or ""}) end)
    hdr:SetScript("OnLeave",HideTip)
    headers[#headers + 1] = hdr
  end

  rows = {}
  for i = 1, Layout.ROWS do
    local r = CreateFrame("Frame", nil, frame)
    r:SetSize(Layout.INNER - 6, Layout.ROW_H)
    r:SetPoint("TOPLEFT", frame, "TOPLEFT", Layout.PAD, Layout.ROWS_Y - (i - 1) * Layout.ROW_H)
    if i % 2 == 0 then
      local z = Fill(r, "BACKGROUND", { 1, 1, 1 }, 0.035)
      z:SetAllPoints(r)
    end
    local hoverTex = Fill(r, "BORDER", C.gold, 0.09)
    hoverTex:SetAllPoints(r)
    hoverTex:Hide()
    r.cells = {}
    for _, col in ipairs(COLS) do
      local fs = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
      fs:SetPoint("LEFT", r, "LEFT", col.x, 0)
      fs:SetWidth(col.w)
      fs:SetJustifyH("LEFT")
      if fs.SetWordWrap then fs:SetWordWrap(false) end
      r.cells[col.key] = fs
    end
    if r.EnableMouse then r:EnableMouse(true) end
    if R.OpenWhisper then
      local b = CreateFrame("Button", nil, r)
      b:SetSize(156, Layout.ROW_H); b:SetPoint("LEFT", r, "LEFT", 400, 0)
      b:SetScript("OnClick", function(self)
        local m = self.member
        if not m then return end
        local called, ok, why = pcall(R.OpenWhisper, m.full, m.guid)
        if (not called or not ok) and DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("Olympus Verify: " .. (called and tostring(why) or "The current native whisper editor could not be opened.")) end
      end)
      b:SetScript("OnEnter", function() RowTip(r) end); b:SetScript("OnLeave", HideTip)
      b:Hide(); r.remind = b
    end
    r.promote = Button(r, "Promote", 100, Layout.ROW_H - 2, nil,
      "Native promotion", "One hardware promotion to the displayed Member or Veteran target for this exact GUID. The signed queue, freshness, native rank and permission are rechecked; no automatic retry.",true)
    BindPromotion(r.promote,function(self)
      local m = self.member
      if m and type(m.guid) == "string" and self:IsShown() then return PromotionTarget(m.guid) end
    end)
    r.promote:SetPoint("LEFT", r, "LEFT", 962, 0)
    r.promote:Hide()
    if r.EnableMouseWheel then r:EnableMouseWheel(true) end
    r:SetScript("OnMouseWheel", Wheel)
    r:SetScript("OnMouseUp",function(self,button)
      if button=="LeftButton" and self.member then selected={guid=self.member.guid,full=self.member.full};CloseMenu();ShowDetail(self.member) end
    end)
    r:SetScript("OnEnter", function(self) hoverTex:Show(); RowTip(self) end)
    r:SetScript("OnLeave", function() hoverTex:Hide(); HideTip() end)
    r:Hide()
    rows[i] = r
  end
  frame:EnableMouseWheel(true)
  frame:SetScript("OnMouseWheel", Wheel)
  local repaint=0
  frame:SetScript("OnUpdate",function(_,elapsed)
    repaint=repaint+(tonumber(elapsed) or 0)
    if repaint>=5 then repaint=0;W.Refresh() end
  end)
  frame:SetScript("OnHide",function() CloseMenu();if copyBox then copyBox:Hide() end end)
  footer = Label(frame, "GameFontDisableSmall", "", Layout.PAD, -(Layout.HEIGHT - 26), Layout.INNER)
  W.frame = frame
  W.search = search
  W.rows, W.headers = rows, headers
  W.initiateButton, W.readyButton, W.nextButton = initiateBtn, readyBtn, nextBtn
  W.statusButton, W.rankButton, W.classButton, W.onlineButton, W.clearButton = statusBtn, rankBtn, classBtn, onlineBtn, clear
  W.actionFilterButton=actionFilterBtn
end

-- ---------------------------------------------------------------- public
function W.Show(text)
  if InCombatLockdown and InCombatLockdown() then Say("Leave combat before opening the promotion roster.");return end
  if not frame then Build() end
  Reload()
  if type(text) == "string" and text ~= "" then
    view.text = text
    if search.SetText then search:SetText(text) end
    if search.hint then search.hint:Hide() end
  end
  offset = 0
  frame:Show()
  W.Refresh()
end

function W.Hide()
  if InCombatLockdown and InCombatLockdown() then return end
  if frame then frame:Hide() end
  CloseMenu();if copyBox then copyBox:Hide() end
  HideTip()
end

function W.Toggle()
  if frame and frame:IsShown() then W.Hide() else W.Show() end
end

-- The roster changes under the window (people log in and out, join, leave): re-read it when the client says so,
-- at most every few seconds, and only while the window is open.
local watcher = CreateFrame("Frame")
local lastRead = 0
watcher:RegisterEvent("GUILD_ROSTER_UPDATE")
watcher:SetScript("OnEvent", function()
  if not frame or not frame:IsShown() then return end
  local t = time()
  if t - lastRead < 5 then return end
  lastRead = t
  Reload()
  W.Refresh()
end)

-- For the tests: what the window would show right now.
W.RequestSelected=function()
  Reload()
  local id=selected and selected.guid
  if type(id)~="string" then Say("Select one native character row before requesting a current read.");return false end
  local count=0;for _,row in ipairs(cache.list) do if row.guid==id then count=count+1 end end
  local launch=OlympusLaunch229
  if count~=1 or type(launch)~="table" or type(launch.Select)~="function" then Say("The selected native GUID is missing or ambiguous; no read requested.");return false end
  return launch.Select(id)
end
W.RequestVerifiedInitiates=function()
  Reload()
  local shown=Visible()
  local targets,seen,eligible={},{},0
  for _,row in ipairs(shown) do
    if row.rankIndex==9 and row.status=="verified" and not row.historicalLinked then
      local ok,valid=pcall(function()
        if type(issecretvalue)=="function" and issecretvalue(row.guid) then return false end
        return type(row.guid)=="string" and #row.guid<=40 and row.guid:match("^Player%-%d+%-%x+$")~=nil
      end)
      if not ok or not valid or seen[row.guid] then Say("A verified Initiate GUID is missing or ambiguous; no check requested.");return false end
      seen[row.guid]=true;eligible=eligible+1
      if #targets<20 then targets[#targets+1]=row.guid end
    end
  end
  if #targets<1 then Say("No verified native Initiates match the current shown filters. Refresh verification data or adjust the view first.");return false end
  local launch=OlympusLaunch229
  if type(launch)~="table" or type(launch.SelectMany)~="function" then Say("The bounded Initiate checker is unavailable; no check requested.");return false end
  Say("Selected the first "..#targets.." shown verified Initiate(s) for this explicit check; "..(eligible-#targets).." additional shown candidate(s). No automatic next batch or promotion.")
  offset=0;W.Refresh()
  return launch.SelectMany(targets)
end
W.Visible = function() Reload(); return Visible() end
W.view = view

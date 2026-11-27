-- Personal, display-only copy from the signed-in Raid Teams page. No chat transport.
local Raid = {}
OlympusVerifyRaidSchedule = Raid
local DAY, WEEK = 86400, 604800
local leads = { 3600, 1800, 900, 300 }
local function clock() return (GetServerTime or time)() end
local function player() return UnitGUID and UnitGUID("player") end
local function db()
  if type(OlympusRaidScheduleDB) ~= "table" then OlympusRaidScheduleDB = {} end
  return OlympusRaidScheduleDB
end
local function announce(s)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cffffd474Olympus raids|r: " .. s) end
end
local function whole(s, low, high)
  if not s or not s:match("^%d+$") or #s > 12 then return nil end
  local n = tonumber(s)
  if n >= low and n <= high then return n end
end
local function label(s, limit)
  if #s > limit * 3 or s:gsub("%%[%da-fA-F][%da-fA-F]", ""):find("%%") then return nil end
  local v = s:gsub("%%([%da-fA-F][%da-fA-F])", function(h) return string.char(tonumber(h,16)) end)
  if #v > limit or v:find("[%c]") then return nil end
  return (v:gsub("|","||"))
end
local function fields(s)
  local f = {}
  for word in (s.."|"):gmatch("([^|]*)|") do f[#f+1] = word end
  return f
end
function Raid.Import(text)
  if type(text) ~= "string" or #text > 69000 then return nil,"Copy the personal schedule from Raid Teams." end
  text = text:gsub("\r\n","\n"):gsub("\n$","")
  local first, rest = text:match("^([^\n]+)\n?(.*)$")
  local version, guid, issued, count = (first or ""):match("^(OLR1)|([%w%-]+)|(%d+)|(%d+)$")
  local now = clock()
  issued, count = whole(issued,now-DAY+1,now+30), whole(count,0,24)
  if not version or not issued or not count then return nil,"Copy a fresh personal schedule from Raid Teams." end
  if guid ~= player() then return nil,"Log in on the character selected on the website." end
  local store = db()
  if store.guid == guid and store.issued and issued < store.issued then return nil,"A newer schedule is already loaded." end
  local rows, seen = {}, {}
  if rest ~= "" then
    for line in (rest.."\n"):gmatch("([^\n]*)\n") do
      local f = fields(line)
      if #f ~= 8 or #rows >= count or #f[1] > 64 or not f[1]:match("^[%w_%-]+$") or seen[f[1]] then return nil,"The schedule contains an invalid event." end
      local revision = whole(f[2],0,2147483647)
      local at, duration = whole(f[3], issued-DAY, issued+WEEK), whole(f[4],1,1440)
      local team, title, group, preparation = label(f[5],120), label(f[6],200), label(f[7],80), label(f[8],500)
      if not revision or not at or not duration or not team or team=="" or not title or title=="" or not group or not preparation then return nil,"Copy the whole schedule and try again." end
      seen[f[1]] = true
      local last
      for _, old in ipairs(store.rows or {}) do
        if old.id == f[1] and old.at == at then last = old.lastLead end
      end
      rows[#rows+1] = {id=f[1],revision=revision,at=at,duration=duration,team=team,title=title,group=group,preparation=preparation,lastLead=last}
    end
  end
  if #rows ~= count then return nil,"Copy the whole schedule and try again." end
  table.sort(rows,function(a,b) return a.at==b.at and a.id<b.id or a.at<b.at end)
  store.guid, store.issued, store.rows = guid, issued, rows
  return true
end
local function current()
  local s=db()
  return s.guid==player() and type(s.issued)=="number" and s.issued+DAY>clock() and type(s.rows)=="table" and s or nil
end
function Raid.Upcoming()
  local s, out = current(), {}
  if s then
    for _,row in ipairs(s.rows) do
      if row.at+row.duration*60>clock() then
        out[#out+1]={at=row.at,title=row.title,zone=row.team,tip=row.group.."  "..row.preparation}
      end
    end
  end
  return out
end
function Raid.Tick()
  local s = current()
  if not s or s.reminders == false then return end
  for _, row in ipairs(s.rows) do
    local remaining = row.at-clock()
    if remaining > 0 and remaining<=3600 then
      local due
      for _, lead in ipairs(leads) do if remaining<=lead then due=lead end end
      if due and (not row.lastLead or due<row.lastLead) then
        row.lastLead=due
        announce(("%s · %s in %d min. %s"):format(row.team,row.title,math.ceil(remaining/60),row.group))
        if s.sound and PlaySound and SOUNDKIT and SOUNDKIT.READY_CHECK then PlaySound(SOUNDKIT.READY_CHECK) end
      end
    end
  end
end
local frame, details, editor, reminders, sound
local function refresh()
  local s, lines = current(), {}
  if s then
    lines[1]="Copied "..date("%b %d, %H:%M",s.issued).." local time."
    local rows=Raid.Upcoming()
    for _,r in ipairs(rows) do
      lines[#lines+1]=date("%a %b %d, %H:%M",r.at).."  "..r.title.." · "..r.zone
      if r.tip:find("%S") then lines[#lines+1]=r.tip end
    end
    if #rows==0 then lines[#lines+1]="No assigned raids in this schedule." end
  elseif db().issued then
    lines[1]="Schedule expired. Copy a fresh schedule from Raid Teams."
  else lines[1]="Choose your character on the website under Raid Teams, copy your schedule, then paste it below." end
  details:SetText(table.concat(lines,"\n"))
  reminders:SetChecked(db().reminders~=false)
  sound:SetChecked(db().sound==true)
  if frame.refreshHeight then frame.refreshHeight() end
end
function Raid.Open()
  if not frame then
    frame=CreateFrame("Frame","OlympusPersonalRaidFrame",UIParent,"BasicFrameTemplateWithInset")
    frame:SetSize(520,440); frame:SetPoint("CENTER"); frame:SetFrameStrata("DIALOG"); frame:SetClampedToScreen(true)
    local title=frame.TitleText or frame:CreateFontString(nil,"OVERLAY","GameFontNormal")
    if not frame.TitleText then title:SetPoint("TOP",0,-8) end
    title:SetText("My raid schedule")
    local sc=CreateFrame("ScrollFrame",nil,frame,"UIPanelScrollFrameTemplate")
    sc:SetPoint("TOPLEFT",18,-48);sc:SetPoint("BOTTOMRIGHT",-35,175)
    local content=CreateFrame("Frame",nil,sc);content:SetSize(445,1);sc:SetScrollChild(content)
    details=content:CreateFontString(nil,"ARTWORK","GameFontHighlight");details:SetPoint("TOPLEFT");details:SetWidth(445);details:SetJustifyH("LEFT")
    local function check(x,title,toggle)
      local b=CreateFrame("CheckButton",nil,frame,"UICheckButtonTemplate");b:SetPoint("BOTTOMLEFT",x,120)
      local l=b:CreateFontString(nil,"OVERLAY","GameFontNormal");l:SetPoint("LEFT",b,"RIGHT",2,0);l:SetText(title)
      b:SetScript("OnClick",function(self) toggle(self:GetChecked() and true or false) end)
      return b
    end
    reminders=check(16,"Chat reminders",function(v) db().reminders=v end)
    sound=check(190,"Play sound",function(v) db().sound=v end)
    local pane=CreateFrame("ScrollFrame",nil,frame,"UIPanelScrollFrameTemplate")
    pane:SetPoint("BOTTOMLEFT",20,49);pane:SetSize(453,61)
    editor=CreateFrame("EditBox",nil,pane); editor:SetWidth(448);editor:SetMultiLine(true);editor:SetAutoFocus(false)
    editor:SetFontObject("ChatFontNormal");editor:SetMaxLetters(69000);pane:SetScrollChild(editor)
    editor:SetScript("OnEscapePressed",function(self) self:ClearFocus() end)
    pane:EnableMouse(true);pane:SetScript("OnMouseDown",function() editor:SetFocus() end)
    local function button(x,label,fn)
      local b=CreateFrame("Button",nil,frame,"UIPanelButtonTemplate");b:SetSize(156,25);b:SetPoint("BOTTOMLEFT",x,14);b:SetText(label);b:SetScript("OnClick",fn)
    end
    button(17,"Import schedule",function()
      local ok,err=Raid.Import(editor:GetText())
      if ok then editor:SetText("");editor:ClearFocus();refresh();Raid.Tick() else announce(err) end
    end)
    button(185,"Clear local copy",function() local s=db();s.guid,s.rows,s.issued=nil,nil,nil;editor:SetText("");refresh() end)
    frame:SetScript("OnHide",function() editor:SetText("");editor:ClearFocus() end)
    frame.refreshHeight=function() content:SetHeight(math.max(1,details:GetStringHeight()+6)) end
    if UISpecialFrames then table.insert(UISpecialFrames,"OlympusPersonalRaidFrame") end
  end
  frame:Show();refresh()
end
if C_Timer and C_Timer.NewTicker then
  C_Timer.NewTicker(30,function()
    Raid.Tick()
    if frame and frame:IsShown() then refresh() end
  end)
end

tick=1792020000
frames={}; chat={}; delegated=0; forbidden=0
local methods={}
function methods:SetScript(k,fn) self.scripts[k]=fn end
function methods:RegisterEvent(k) self.events[k]=true end
function methods:SetText(t) self.text=t end
function methods:GetText() return self.text end
function methods:GetStringHeight() return 500 end
function methods:Hide() local was=self.shown;self.shown=false;if was and self.scripts.OnHide then self.scripts.OnHide(self) end end
function methods:Show() self.shown=true end
function methods:IsShown() return self.shown end
function methods:CreateFontString() return CreateFrame('FontString') end
function methods:SetScrollChild(c) self.child=c end
function methods:SetFocus() self.focus=true end
function methods:ClearFocus() self.focus=false end
for _,k in ipairs({'SetSize','SetPoint','SetMovable','EnableMouse','RegisterForDrag','SetWidth','SetHeight','SetJustifyH','SetJustifyV','SetAutoFocus','SetMaxLetters','SetHyperlinksEnabled','HighlightText','StartMoving','StopMovingOrSizing'}) do methods[k]=function() end end
function CreateFrame(kind,name,parent,template)
 local f=setmetatable({kind=kind,template=template,scripts={},events={},shown=true},{__index=methods});frames[#frames+1]=f;return f
end
UIParent=CreateFrame('Frame')
DEFAULT_CHAT_FRAME={AddMessage=function(_,s)chat[#chat+1]=s end}
SlashCmdList={OLYMPUSVERIFY=function()delegated=delegated+1 end}
GetServerTime=function()return tick end
InCombatLockdown=function()return false end
local function prohibited() forbidden=forbidden+1;error('forbidden side effect') end
SendChatMessage=prohibited;SendAddonMessage=prohibited;GuildRoster=prohibited;GuildInvite=prohibited
OlympusVerifyDB=setmetatable({},{__index=prohibited,__newindex=prohibited})
OlympusDB=setmetatable({},{__index=prohibited,__newindex=prohibited})
events={}
ns={VERSION='1.2.3',group='RealmA+RealmB',faction='Alliance',L={},rdb={guilds={},council={names={},realm='RealmA+RealmB'}},
 Now=function()return tick end,On=function(name,fn)events[name]=fn end,Who={Listen=function()end},
 IsHighCouncillor=prohibited,Workshop={CouncilNames=prohibited},CouncilMasked=function()return false end,
 Codec={GUILD_CAP=1000},Fold=function(s)return s:lower() end,IsFederation=function(s)return s:match('^Olympus')~=nil end,
 Moderation={Guild=function(name)if name=='Olympus Hidden' then return {} end end}}
function row(age,name)
 return {name=name or 'Olympus Test',g={t=tick-(age or 0),total=100,online=10,st=tick-111,
 reporter='PRIVATE_REPORTER',officers={'PRIVATE_OFFICER'},zones={PRIVATE_ZONE=10},signingKey='PRIVATE_KEY',chat='PRIVATE_CHAT',characters={'PRIVATE_CHARACTER'}}}
end
function reset()
 tick=1792020000;ns.group='RealmA+RealmB';ns.faction='Alliance';ns.VERSION='1.2.3'
 ns.CouncilMasked=function()return false end
 ns.Moderation.Guild=function(name)if name=='Olympus Hidden' then return {} end end
 ns.rdb.guilds={['Olympus Test']=row(0).g}
 ns.Data.Summary=actualSummary
 OlympusBridge.GetCensusSnapshot=actualBridge
 OlympusVerifyCensus.SetEnabled(false)
end
function valid() return actualBridge() end
function censusWindow()
 for _,f in ipairs(frames)do if f.template=='BasicFrameTemplateWithInset' then return f end end
end
